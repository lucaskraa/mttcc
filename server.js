"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = String(process.env.JWT_SECRET || "");
const NODE_ENV = process.env.NODE_ENV || "development";
const bookCoverCache = new Map();
const GOOGLE_BOOKS_API_KEY = String(process.env.GOOGLE_BOOKS_API_KEY || "").trim();
const bookCoverSyncState = {
  running: false,
  total: 0,
  processed: 0,
  updated: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null
};

const STATIC_GOOGLE_VOLUME_IDS = new Map(Object.entries({"Dom Casmurro": "qmE0EQAAQBAJ", "Memórias Póstumas de Brás Cubas": "qnyeEAAAQBAJ", "O Cortiço": "vQMREQAAQBAJ", "Vidas Secas": "OiNgEQAAQBAJ", "Capitães da Areia": "FDJ1_r4MCIEC", "Crime e Castigo": "nO2MDwAAQBAJ", "Os Irmãos Karamázov": "8PIuEAAAQBAJ", "Guerra e Paz": "P1Q6DwAAQBAJ", "Anna Kariênina": "vitqBgAAQBAJ", "O Mestre e Margarida": "XU5HEQAAQBAJ", "O Pequeno Príncipe": "_NTSEAAAQBAJ", "Alice no País das Maravilhas": "X5K1EAAAQBAJ", "As Aventuras de Tom Sawyer": "nBg5EAAAQBAJ", "O Mágico de Oz": "59IJ34ms1HQC", "A Ilha do Tesouro": "B9wXEAAAQBAJ", "Mensagem": "0yyBEQAAQBAJ", "Antologia Poética": "0BFXAAAAYAAJ", "Romanceiro da Inconfidência": "POGGDwAAQBAJ", "Os Lusíadas": "19JjCAAAQBAJ", "Laços de Família": "ZxlOA83HZM0C", "Morangos Mofados": "BwyvDwAAQBAJ", "Contos Novos": "kxD9EAAAQBAJ", "Primeiras Estórias": "ZH5rDQAAQBAJ", "O Alienista": "TTUFEQAAQBAJ", "Cosmos": "Cl06FjKX6doC", "O Mundo Assombrado pelos Demônios": "D-tKAgAACAAJ", "A Origem das Espécies": "a4cgEQAAQBAJ", "Primavera Silenciosa": "PV3pDAAAQBAJ", "Breves Respostas para Grandes Questões": "tI9yDwAAQBAJ", "O Gene Egoísta": "GA0v1URr4_QC", "Uma Breve História do Tempo": "igLOOwAACAAJ", "O Universo Numa Casca de Noz": "NXxVCwAAQBAJ", "Sete Breves Lições de Física": "BD0qDwAAQBAJ", "A República": "38n-zwEACAAJ", "Watchmen": "QkK2oAEACAAJ"}).map(([title, id]) => [normalizeSearchText(title), id]));

if (JWT_SECRET.length < 24) {
  console.error("JWT_SECRET ausente ou curta. Configure uma chave segura no Render.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 12000,
  statement_timeout: 25000
});

const allowedOrigins = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

function isTrustedOrigin(origin) {
  if (!origin) return true;

  try {
    const { hostname } = new URL(origin);
    if (allowedOrigins.includes(origin)) return true;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (hostname.endsWith(".github.io")) return true;
    if (hostname.endsWith(".onrender.com")) return true;
  } catch (_error) {
    return false;
  }

  return false;
}

app.set("trust proxy", 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));

app.use(cors({
  origin(origin, callback) {
    if (NODE_ENV !== "production" && allowedOrigins.length === 0) return callback(null, true);
    if (isTrustedOrigin(origin)) return callback(null, true);
    return callback(new Error("Origem não autorizada pelo CORS."));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "3mb" }));

app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas de acesso. Aguarde alguns minutos." }
}));

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisições. Aguarde um momento." }
}));


function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanText(value, maxLength = null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return maxLength ? text.slice(0, maxLength) : text;
}

function requiredText(value, fieldName, maxLength = null) {
  const text = cleanText(value, maxLength);
  if (!text) throw httpError(400, `Informe ${fieldName}.`);
  return text;
}

function cleanInteger(value, { min = null, max = null, nullable = true } = {}) {
  if (value === "" || value === null || value === undefined) {
    if (nullable) return null;
    throw httpError(400, "Informe um número válido.");
  }

  const number = Number(value);
  if (!Number.isInteger(number)) throw httpError(400, "Informe um número inteiro válido.");
  if (min !== null && number < min) throw httpError(400, `O valor mínimo permitido é ${min}.`);
  if (max !== null && number > max) throw httpError(400, `O valor máximo permitido é ${max}.`);
  return number;
}

function cleanBoolean(value, defaultValue = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return defaultValue;
}

function cleanDate(value, fieldName, nullable = true) {
  if (!value) {
    if (nullable) return null;
    throw httpError(400, `Informe ${fieldName}.`);
  }

  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00`).getTime())) {
    throw httpError(400, `${fieldName} inválida.`);
  }
  return text;
}

function cleanEmail(value) {
  const email = requiredText(value, "o e-mail", 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "Informe um e-mail válido.");
  return email;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email
    },
    JWT_SECRET,
    {
      expiresIn: "12h",
      issuer: "bookshare-api",
      audience: "bookshare-frontend"
    }
  );
}

async function authenticate(req, res, next) {
  try {
    const header = String(req.headers.authorization || "");
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ message: "Token de acesso não informado." });
    }

    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: "bookshare-api",
      audience: "bookshare-frontend"
    });

    const result = await pool.query(
      `SELECT id, name, email, role, active, last_login_at, avatar_url
       FROM users
       WHERE id = $1`,
      [payload.sub]
    );

    const user = result.rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ message: "Conta inexistente ou bloqueada." });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Sessão inválida ou expirada." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Você não possui permissão para esta ação." });
    }
    next();
  };
}

async function audit(client, req, action, entityType, entityId = null, details = {}) {
  await client.query(
    `INSERT INTO audit_logs
      (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      req.user?.id || null,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify(details || {}),
      req.ip || null,
      req.headers["user-agent"] || null
    ]
  );
}

async function getSettings(client = pool) {
  const result = await client.query(
    `SELECT
       id,
       school_name,
       library_name,
       contact_email,
       contact_phone,
       current_school_year,
       default_loan_days,
       max_active_loans,
       max_renewals,
       renewal_days,
       due_soon_days,
       reservation_hold_days,
       block_overdue_students,
       notice_template,
       reservation_template,
       updated_at
     FROM settings
     WHERE id = 1`
  );

  if (!result.rows[0]) throw httpError(500, "As configurações iniciais não foram encontradas.");
  return result.rows[0];
}

function makeInventoryCode() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `BS-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function createInventoryCodes(client, bookId, quantity, acquiredAt = null, notes = null) {
  const copies = [];
  for (let index = 0; index < quantity; index += 1) {
    let inserted = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      try {
        const result = await client.query(
          `INSERT INTO book_copies
            (book_id, inventory_code, status, acquired_at, condition_notes)
           VALUES ($1, $2, 'available', $3, $4)
           RETURNING *`,
          [bookId, makeInventoryCode(), acquiredAt, notes]
        );
        inserted = result.rows[0];
      } catch (error) {
        if (error.code !== "23505" || attempt === 4) throw error;
      }
    }
    copies.push(inserted);
  }
  return copies;
}


async function ensureRuntimeSchema() {
  const migrations = [
    `ALTER TABLE IF EXISTS users
       ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
    `ALTER TABLE IF EXISTS students
       ADD COLUMN IF NOT EXISTS photo_url TEXT`,
    `ALTER TABLE IF EXISTS books
       ADD COLUMN IF NOT EXISTS cover_url TEXT`,
    `ALTER TABLE IF EXISTS books
       ADD COLUMN IF NOT EXISTS cover_source TEXT`,
    `ALTER TABLE IF EXISTS books
       ADD COLUMN IF NOT EXISTS cover_checked_at TIMESTAMPTZ`
  ];

  for (const statement of migrations) {
    await pool.query(statement);
  }
}

async function ensureInitialUsers() {
  const accounts = [
    {
      name: cleanText(process.env.ADMIN_NAME) || "Administrador BookShare",
      email: (cleanText(process.env.ADMIN_EMAIL) || "admin@bookshare.com").toLowerCase(),
      password: String(process.env.ADMIN_PASSWORD || "BookShare@2026"),
      role: "admin",
      variableGroup: "ADMIN"
    },
    {
      name: cleanText(process.env.LIBRARIAN1_NAME) || "Bibliotecária",
      email: (cleanText(process.env.LIBRARIAN1_EMAIL) || "biblioteca@bookshare.com").toLowerCase(),
      password: String(process.env.LIBRARIAN1_PASSWORD || "Biblioteca@2026"),
      role: "librarian",
      variableGroup: "LIBRARIAN1"
    }
  ];

  for (const account of accounts) {
    if (!account.email || account.password.length < 8) {
      console.warn(`${account.variableGroup}_EMAIL ou ${account.variableGroup}_PASSWORD não configurados corretamente. Essa conta inicial não foi criada.`);
      continue;
    }

    const existing = await pool.query(
      "SELECT id, role FROM users WHERE email = $1",
      [account.email]
    );

    if (existing.rows[0]) {
      if (existing.rows[0].role !== account.role) {
        await pool.query(
          `UPDATE users
           SET role = $1, active = TRUE, updated_at = NOW()
           WHERE id = $2`,
          [account.role, existing.rows[0].id]
        );
      }
      continue;
    }

    const passwordHash = await bcrypt.hash(account.password, 12);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [account.name, account.email, passwordHash, account.role]
    );

    console.log(`Conta inicial criada: ${account.email} (${account.role})`);
  }
}


function isUsableCoverUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("data:image/svg+xml") && url.includes("BOOKSHARE")) return false;
  if (url.includes("book-placeholder")) return false;
  if (url.includes("/api/public/book-cover")) return false;
  return url.startsWith("https://") || url.startsWith("data:image/") || url.startsWith("assets/");
}

function googleContentUrl(volumeId) {
  return `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1&zoom=2&source=gbs_api`;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function rankCandidate(candidate, title, author) {
  const wantedTitle = normalizeSearchText(title);
  const wantedAuthor = normalizeSearchText(author || "");
  const foundTitle = normalizeSearchText(candidate.title || "");
  const foundAuthor = normalizeSearchText(candidate.author || "");
  const authorWords = wantedAuthor.split(" ").filter(word => word.length > 2);

  let score = 0;
  if (foundTitle === wantedTitle) score += 100;
  else if (foundTitle.startsWith(wantedTitle)) score += 65;
  else if (foundTitle.includes(wantedTitle)) score += 48;
  else if (wantedTitle.includes(foundTitle)) score += 25;

  const matches = authorWords.filter(word => foundAuthor.includes(word)).length;
  score += matches * 16;
  if (authorWords.length && matches === authorWords.length) score += 30;
  return score;
}

async function resolveFromGoogleBooks(title, author) {
  const staticId = STATIC_GOOGLE_VOLUME_IDS.get(normalizeSearchText(title));
  if (staticId) return { url: googleContentUrl(staticId), source: "Google Books fixed" };

  const searches = [
    `intitle:"${title}"${author ? ` inauthor:"${author}"` : ""}`,
    `"${title}"${author ? ` ${author}` : ""}`
  ];

  for (const searchText of searches) {
    try {
      const params = new URLSearchParams({
        q: searchText,
        maxResults: "20",
        printType: "books",
        projection: "full",
        orderBy: "relevance"
      });
      if (GOOGLE_BOOKS_API_KEY) params.set("key", GOOGLE_BOOKS_API_KEY);

      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "BookShare-School-Library/2.6" },
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) continue;

      const data = await response.json();
      const candidates = (Array.isArray(data.items) ? data.items : [])
        .map(item => {
          const info = item.volumeInfo || {};
          const links = info.imageLinks || {};
          const direct = links.extraLarge || links.large || links.medium || links.small || links.thumbnail || links.smallThumbnail;
          if (!direct && !item.id) return null;
          return {
            score: rankCandidate({ title: info.title, author: (info.authors || []).join(" ") }, title, author) + (info.language === "pt" ? 8 : 0),
            url: item.id ? googleContentUrl(item.id) : String(direct).replace(/^http:/i, "https:").replace("&edge=curl", "")
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      if (candidates[0]?.url && candidates[0].score >= 40) {
        return { url: candidates[0].url, source: "Google Books search" };
      }
    } catch (error) {
      console.warn(`Google Books cover lookup failed for ${title}:`, error.message);
    }
  }
  return null;
}

async function resolveFromOpenLibrary(title, author) {
  try {
    const params = new URLSearchParams({ title, author: author || "", limit: "20", fields: "cover_i,title,author_name" });
    const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": "BookShare-School-Library/2.6 (school library app)" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const candidates = (Array.isArray(data.docs) ? data.docs : [])
      .filter(item => item.cover_i)
      .map(item => ({
        score: rankCandidate({ title: item.title, author: (item.author_name || []).join(" ") }, title, author),
        url: `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg?default=false`
      }))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.score >= 30 ? { url: candidates[0].url, source: "Open Library" } : null;
  } catch (error) {
    console.warn(`Open Library cover lookup failed for ${title}:`, error.message);
    return null;
  }
}

async function resolveFromLongitood(title, author) {
  try {
    const params = new URLSearchParams({ book_title: title, author_name: author || "", image_size: "large" });
    const response = await fetch(`https://bookcover.longitood.com/bookcover?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": "BookShare-School-Library/2.6" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    const url = String(data.url || "").replace(/^http:/i, "https:");
    return url.startsWith("https://") ? { url, source: "BookCover/Goodreads" } : null;
  } catch (error) {
    console.warn(`BookCover lookup failed for ${title}:`, error.message);
    return null;
  }
}

async function resolveBookCover(title, author) {
  const cacheKey = `${normalizeSearchText(title)}::${normalizeSearchText(author || "")}`;
  const cached = bookCoverCache.get(cacheKey);
  if (cached) return cached;

  const result =
    await resolveFromGoogleBooks(title, author) ||
    await resolveFromOpenLibrary(title, author) ||
    await resolveFromLongitood(title, author);

  if (result) bookCoverCache.set(cacheKey, result);
  return result;
}

async function syncBookCovers({ force = false } = {}) {
  if (bookCoverSyncState.running) return bookCoverSyncState;
  bookCoverSyncState.running = true;
  bookCoverSyncState.processed = 0;
  bookCoverSyncState.updated = 0;
  bookCoverSyncState.failed = 0;
  bookCoverSyncState.startedAt = new Date().toISOString();
  bookCoverSyncState.finishedAt = null;

  try {
    const result = await pool.query(`
      SELECT id, title, author, isbn, cover_url
      FROM books
      WHERE active = TRUE
      ORDER BY title ASC
    `);
    const targets = result.rows.filter(book => force || !isUsableCoverUrl(book.cover_url));
    bookCoverSyncState.total = targets.length;

    for (const book of targets) {
      try {
        if (String(book.author || "").includes("BookShare")) {
          bookCoverSyncState.processed += 1;
          continue;
        }
        const resolved = await resolveBookCover(book.title, book.author);
        if (resolved?.url) {
          await pool.query(`UPDATE books SET cover_url = $1, updated_at = NOW() WHERE id = $2`, [resolved.url, book.id]);
          bookCoverSyncState.updated += 1;
        } else {
          bookCoverSyncState.failed += 1;
        }
      } catch (error) {
        bookCoverSyncState.failed += 1;
        console.warn(`Cover sync failed for ${book.title}:`, error.message);
      } finally {
        bookCoverSyncState.processed += 1;
      }
      await delay(180);
    }
  } finally {
    bookCoverSyncState.running = false;
    bookCoverSyncState.finishedAt = new Date().toISOString();
    console.log("Book cover sync finished:", bookCoverSyncState);
  }
  return bookCoverSyncState;
}

app.get("/", (_req, res) => {
  res.json({
    name: "BookShare API",
    version: "2.7.0",
    status: "online",
    timestamp: new Date().toISOString()
  });
});


app.get("/api/public/book-cover", asyncRoute(async (req, res) => {
  const title = requiredText(req.query.title, "o título", 180);
  const author = cleanText(req.query.author, 160) || "";

  const databaseBook = await pool.query(`
    SELECT id, title, author, cover_url
    FROM books
    WHERE LOWER(title) = LOWER($1)
    ORDER BY CASE WHEN LOWER(author) = LOWER($2) THEN 0 ELSE 1 END
    LIMIT 1
  `, [title, author]);

  const book = databaseBook.rows[0];
  if (book && isUsableCoverUrl(book.cover_url)) {
    res.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    return res.redirect(302, book.cover_url);
  }

  const resolved = await resolveBookCover(book?.title || title, book?.author || author);
  if (resolved?.url) {
    if (book?.id) {
      await pool.query(`UPDATE books SET cover_url = $1, updated_at = NOW() WHERE id = $2`, [resolved.url, book.id]);
    }
    res.set("X-Book-Cover-Source", resolved.source);
    res.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    return res.redirect(302, resolved.url);
  }

  res.set("Cache-Control", "public, max-age=3600");
  return res.redirect(302, "https://books.google.com/googlebooks/images/no_cover_thumb.gif");
}));

app.get("/api/public/book-covers/status", (_req, res) => {
  res.json(bookCoverSyncState);
});

app.post("/api/admin/book-covers/sync", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const force = cleanBoolean(req.body?.force, false);
  if (!bookCoverSyncState.running) {
    syncBookCovers({ force }).catch(error => console.error("Background cover sync error:", error));
  }
  res.status(202).json({ message: "Sincronização de capas iniciada.", status: bookCoverSyncState });
}));

app.get("/api/health", asyncRoute(async (_req, res) => {
  const result = await pool.query("SELECT NOW() AS database_time");
  res.json({
    status: "ok",
    database: "connected",
    database_time: result.rows[0].database_time,
    environment: NODE_ENV
  });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!password) throw httpError(400, "Informe a senha.");

  const result = await pool.query(
    `SELECT id, name, email, password_hash, role, active, avatar_url
     FROM users
     WHERE email = $1`,
    [email]
  );

  const user = result.rows[0];
  if (!user || !user.active) throw httpError(401, "E-mail ou senha incorretos.");

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) throw httpError(401, "E-mail ou senha incorretos.");

  await pool.query(
    `UPDATE users
     SET last_login_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [user.id]
  );

  res.json({
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url || null
    }
  });
}));

app.get("/api/auth/me", authenticate, asyncRoute(async (req, res) => {
  res.json({ user: req.user });
}));

app.put("/api/auth/profile", authenticate, asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, "o nome", 120);
  const avatarUrl = cleanText(req.body.avatar_url);

  if (avatarUrl && (!avatarUrl.startsWith("data:image/") || avatarUrl.length > 2200000)) {
    throw httpError(400, "A foto enviada é inválida ou muito grande.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      UPDATE users
      SET name = $1,
          avatar_url = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING id, name, email, role, active, avatar_url, last_login_at
    `, [name, avatarUrl, req.user.id]);
    await audit(client, req, "update", "user", req.user.id, { self_profile: true, name });
    await client.query("COMMIT");
    res.json({ user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/auth/change-password", authenticate, asyncRoute(async (req, res) => {
  const currentPassword = String(req.body.current_password || "");
  const newPassword = String(req.body.new_password || "");

  if (newPassword.length < 8) throw httpError(400, "A nova senha deve ter pelo menos 8 caracteres.");

  const result = await pool.query(
    "SELECT password_hash FROM users WHERE id = $1",
    [req.user.id]
  );

  const matches = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!matches) throw httpError(400, "A senha atual está incorreta.");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, req.user.id]
    );
    await audit(client, req, "password", "user", req.user.id, { self_change: true });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  res.json({ message: "Senha alterada com sucesso." });
}));

app.get("/api/dashboard", authenticate, asyncRoute(async (_req, res) => {
  const settings = await getSettings();

  const [
    bookSummary,
    loanSummary,
    studentSummary,
    reservationSummary,
    recentLoans,
    dueToday,
    popularBooks,
    circulation
  ] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(DISTINCT b.id)::INT AS total_titles,
        COUNT(bc.id)::INT AS total_copies,
        COUNT(bc.id) FILTER (WHERE bc.status = 'available')::INT AS available_copies,
        COUNT(bc.id) FILTER (WHERE bc.status = 'loaned')::INT AS loaned_copies,
        COUNT(bc.id) FILTER (WHERE bc.status IN ('damaged', 'lost', 'maintenance'))::INT AS attention_copies
      FROM books b
      LEFT JOIN book_copies bc ON bc.book_id = b.id
      WHERE b.active = TRUE
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::INT AS active,
        COUNT(*) FILTER (WHERE status = 'active' AND due_date < CURRENT_DATE)::INT AS overdue,
        COUNT(*) FILTER (WHERE status = 'active' AND due_date = CURRENT_DATE)::INT AS due_today,
        COUNT(*) FILTER (
          WHERE status = 'active'
            AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::INT
        )::INT AS due_soon,
        COALESCE(MAX(
          CASE WHEN status = 'active' AND due_date < CURRENT_DATE
          THEN CURRENT_DATE - due_date ELSE 0 END
        ), 0)::INT AS max_overdue_days
      FROM loans
    `, [settings.due_soon_days]),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE active = TRUE)::INT AS active,
        (SELECT COUNT(*)::INT FROM classes WHERE active = TRUE) AS classes
      FROM students
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::INT AS active,
        COUNT(*) FILTER (WHERE status = 'ready')::INT AS ready
      FROM reservations
    `),
    pool.query(`
      SELECT
        l.id,
        l.student_id,
        l.loan_date,
        l.due_date,
        l.status,
        l.renewal_count,
        s.full_name AS student_name,
        s.registration_number,
        c.name AS class_name,
        b.title AS book_title,
        b.author AS book_author,
        b.cover_url,
        bc.inventory_code
      FROM loans l
      JOIN students s ON s.id = l.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      JOIN book_copies bc ON bc.id = l.copy_id
      JOIN books b ON b.id = bc.book_id
      ORDER BY l.created_at DESC
      LIMIT 10
    `),
    pool.query(`
      SELECT
        l.id,
        l.student_id,
        l.loan_date,
        l.due_date,
        l.status,
        s.full_name AS student_name,
        s.registration_number,
        c.name AS class_name,
        b.title AS book_title,
        b.author AS book_author,
        b.cover_url,
        bc.inventory_code
      FROM loans l
      JOIN students s ON s.id = l.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      JOIN book_copies bc ON bc.id = l.copy_id
      JOIN books b ON b.id = bc.book_id
      WHERE l.status = 'active' AND l.due_date = CURRENT_DATE
      ORDER BY s.full_name
      LIMIT 10
    `),
    pool.query(`
      SELECT
        b.id,
        b.title,
        b.author,
        b.cover_url,
        COUNT(l.id)::INT AS loan_count
      FROM books b
      JOIN book_copies bc ON bc.book_id = b.id
      JOIN loans l ON l.copy_id = bc.id
      GROUP BY b.id
      ORDER BY loan_count DESC, b.title
      LIMIT 8
    `),
    pool.query(`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day')::DATE AS day
      ),
      loan_counts AS (
        SELECT loan_date AS day, COUNT(*)::INT AS count
        FROM loans
        WHERE loan_date >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY loan_date
      ),
      return_counts AS (
        SELECT returned_at::DATE AS day, COUNT(*)::INT AS count
        FROM loans
        WHERE returned_at::DATE >= CURRENT_DATE - INTERVAL '29 days'
        GROUP BY returned_at::DATE
      )
      SELECT
        d.day,
        COALESCE(lc.count, 0)::INT AS loans,
        COALESCE(rc.count, 0)::INT AS returns
      FROM days d
      LEFT JOIN loan_counts lc ON lc.day = d.day
      LEFT JOIN return_counts rc ON rc.day = d.day
      ORDER BY d.day
    `)
  ]);

  res.json({
    books: bookSummary.rows[0],
    loans: loanSummary.rows[0],
    students: studentSummary.rows[0],
    reservations: reservationSummary.rows[0],
    recent_loans: recentLoans.rows,
    due_today: dueToday.rows,
    popular_books: popularBooks.rows,
    circulation: circulation.rows
  });
}));

app.get("/api/classes", authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      c.id,
      c.name,
      c.shift,
      c.school_year,
      c.teacher_name,
      c.active,
      c.created_at,
      c.updated_at,
      COUNT(DISTINCT s.id) FILTER (WHERE s.active = TRUE)::INT AS student_count,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active')::INT AS active_loan_count,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active' AND l.due_date < CURRENT_DATE)::INT AS overdue_count
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id
    LEFT JOIN loans l ON l.student_id = s.id
    GROUP BY c.id
    ORDER BY c.school_year DESC, c.name
  `);
  res.json({ classes: result.rows });
}));

app.post("/api/classes", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, "o nome da turma", 60);
  const shift = requiredText(req.body.shift, "o turno", 30);
  const schoolYear = cleanInteger(req.body.school_year, { min: 2020, max: 2100, nullable: false });
  const teacherName = cleanText(req.body.teacher_name, 120);

  if (!["Manhã", "Tarde", "Noite", "Integral"].includes(shift)) throw httpError(400, "Turno inválido.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO classes (name, shift, school_year, teacher_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, shift, schoolYear, teacherName]
    );
    await audit(client, req, "create", "class", result.rows[0].id, result.rows[0]);
    await client.query("COMMIT");
    res.status(201).json({ class: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw httpError(409, "Essa turma já existe no mesmo ano e turno.");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/classes/:id", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, "o nome da turma", 60);
  const shift = requiredText(req.body.shift, "o turno", 30);
  const schoolYear = cleanInteger(req.body.school_year, { min: 2020, max: 2100, nullable: false });
  const teacherName = cleanText(req.body.teacher_name, 120);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE classes
       SET name = $1,
           shift = $2,
           school_year = $3,
           teacher_name = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, shift, schoolYear, teacherName, req.params.id]
    );

    if (!result.rows[0]) throw httpError(404, "Turma não encontrada.");
    await audit(client, req, "update", "class", req.params.id, result.rows[0]);
    await client.query("COMMIT");
    res.json({ class: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw httpError(409, "Essa turma já existe no mesmo ano e turno.");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/classes/:id/status", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const active = cleanBoolean(req.body.active);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE classes SET active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [active, req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, "Turma não encontrada.");
    await audit(client, req, active ? "reactivate" : "archive", "class", req.params.id, { active });
    await client.query("COMMIT");
    res.json({ class: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/students", authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      s.id,
      s.full_name,
      s.registration_number,
      s.class_id,
      s.roll_number,
      s.guardian_contact,
      s.photo_url,
      s.notes,
      s.active,
      s.created_at,
      s.updated_at,
      c.name AS class_name,
      c.shift,
      c.school_year,
      COUNT(l.id) FILTER (WHERE l.status = 'active')::INT AS active_loans,
      COUNT(l.id) FILTER (WHERE l.status = 'active' AND l.due_date < CURRENT_DATE)::INT AS overdue_loans,
      COUNT(l.id)::INT AS total_loans
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN loans l ON l.student_id = s.id
    GROUP BY s.id, c.id
    ORDER BY s.active DESC, s.full_name
  `);
  res.json({ students: result.rows });
}));

app.get("/api/students/:id", authenticate, asyncRoute(async (req, res) => {
  const studentResult = await pool.query(`
    SELECT
      s.*,
      c.name AS class_name,
      c.shift,
      c.school_year
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.id = $1
  `, [req.params.id]);

  const student = studentResult.rows[0];
  if (!student) throw httpError(404, "Aluno não encontrado.");

  const [activeLoans, history, notices] = await Promise.all([
    pool.query(`
      SELECT
        l.*,
        b.title AS book_title,
        b.author AS book_author,
        b.cover_url,
        bc.inventory_code
      FROM loans l
      JOIN book_copies bc ON bc.id = l.copy_id
      JOIN books b ON b.id = bc.book_id
      WHERE l.student_id = $1 AND l.status = 'active'
      ORDER BY l.due_date
    `, [req.params.id]),
    pool.query(`
      SELECT
        l.*,
        b.title AS book_title,
        b.author AS book_author,
        b.cover_url,
        bc.inventory_code
      FROM loans l
      JOIN book_copies bc ON bc.id = l.copy_id
      JOIN books b ON b.id = bc.book_id
      WHERE l.student_id = $1
      ORDER BY l.created_at DESC
      LIMIT 100
    `, [req.params.id]),
    pool.query(`
      SELECT
        n.*,
        u.name AS created_by_name,
        b.title AS book_title
      FROM notices n
      JOIN users u ON u.id = n.created_by
      JOIN loans l ON l.id = n.loan_id
      JOIN book_copies bc ON bc.id = l.copy_id
      JOIN books b ON b.id = bc.book_id
      WHERE l.student_id = $1
      ORDER BY n.created_at DESC
      LIMIT 100
    `, [req.params.id])
  ]);

  res.json({
    student,
    active_loans: activeLoans.rows,
    history: history.rows,
    notices: notices.rows
  });
}));

app.post("/api/students", authenticate, asyncRoute(async (req, res) => {
  const fullName = requiredText(req.body.full_name, "o nome do aluno", 160);
  const registrationNumber = requiredText(req.body.registration_number, "a matrícula", 40);
  const classId = requiredText(req.body.class_id, "a turma");
  const rollNumber = cleanInteger(req.body.roll_number, { min: 1, max: 99 });
  const guardianContact = cleanText(req.body.guardian_contact, 80);
  const photoUrl = cleanText(req.body.photo_url);
  const notes = cleanText(req.body.notes);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const classResult = await client.query("SELECT id FROM classes WHERE id = $1 AND active = TRUE", [classId]);
    if (!classResult.rows[0]) throw httpError(400, "Selecione uma turma ativa.");

    const result = await client.query(
      `INSERT INTO students
        (full_name, registration_number, class_id, roll_number, guardian_contact, photo_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [fullName, registrationNumber, classId, rollNumber, guardianContact, photoUrl, notes]
    );

    await audit(client, req, "create", "student", result.rows[0].id, result.rows[0]);
    await client.query("COMMIT");
    res.status(201).json({ student: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw httpError(409, "Já existe um aluno com essa matrícula.");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/students/:id", authenticate, asyncRoute(async (req, res) => {
  const fullName = requiredText(req.body.full_name, "o nome do aluno", 160);
  const registrationNumber = requiredText(req.body.registration_number, "a matrícula", 40);
  const classId = requiredText(req.body.class_id, "a turma");
  const rollNumber = cleanInteger(req.body.roll_number, { min: 1, max: 99 });
  const guardianContact = cleanText(req.body.guardian_contact, 80);
  const photoUrl = cleanText(req.body.photo_url);
  const notes = cleanText(req.body.notes);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE students
       SET full_name = $1,
           registration_number = $2,
           class_id = $3,
           roll_number = $4,
           guardian_contact = $5,
           photo_url = $6,
           notes = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [fullName, registrationNumber, classId, rollNumber, guardianContact, photoUrl, notes, req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, "Aluno não encontrado.");
    await audit(client, req, "update", "student", req.params.id, result.rows[0]);
    await client.query("COMMIT");
    res.json({ student: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw httpError(409, "Já existe um aluno com essa matrícula.");
    throw error;
  } finally {
    client.release();
  }
}));

app.delete("/api/students/:id", authenticate, asyncRoute(async (req, res) => {
  const activeLoan = await pool.query(
    "SELECT 1 FROM loans WHERE student_id = $1 AND status = 'active' LIMIT 1",
    [req.params.id]
  );
  if (activeLoan.rows[0]) throw httpError(409, "O aluno possui empréstimos ativos e não pode ser arquivado.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE students SET active = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, "Aluno não encontrado.");
    await audit(client, req, "archive", "student", req.params.id, { full_name: result.rows[0].full_name });
    await client.query("COMMIT");
    res.json({ student: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/students/:id/status", authenticate, asyncRoute(async (req, res) => {
  const active = cleanBoolean(req.body.active);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE students SET active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [active, req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, "Aluno não encontrado.");
    await audit(client, req, active ? "reactivate" : "archive", "student", req.params.id, { active });
    await client.query("COMMIT");
    res.json({ student: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/categories", authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      c.id,
      c.name,
      c.active,
      COUNT(b.id) FILTER (WHERE b.active = TRUE)::INT AS book_count
    FROM categories c
    LEFT JOIN books b ON b.category_id = c.id
    WHERE c.active = TRUE
    GROUP BY c.id
    ORDER BY c.name
  `);
  res.json({ categories: result.rows });
}));

app.post("/api/categories", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, "o nome da categoria", 90);
  const result = await pool.query(
    `INSERT INTO categories (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET active = TRUE
     RETURNING *`,
    [name]
  );
  res.status(201).json({ category: result.rows[0] });
}));

app.get("/api/books", authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      b.id,
      b.title,
      b.author,
      b.isbn,
      b.publisher,
      b.publication_year,
      b.category_id,
      b.shelf,
      b.description,
      b.cover_url,
      b.active,
      b.created_at,
      b.updated_at,
      c.name AS category_name,
      COUNT(bc.id)::INT AS total_copies,
      COUNT(bc.id) FILTER (WHERE bc.status = 'available')::INT AS available_copies,
      COUNT(bc.id) FILTER (WHERE bc.status = 'loaned')::INT AS loaned_copies,
      COUNT(bc.id) FILTER (WHERE bc.status = 'damaged')::INT AS damaged_copies,
      COUNT(bc.id) FILTER (WHERE bc.status = 'lost')::INT AS lost_copies,
      COUNT(bc.id) FILTER (WHERE bc.status = 'maintenance')::INT AS maintenance_copies,
      COUNT(l.id)::INT AS total_loan_count
    FROM books b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN book_copies bc ON bc.book_id = b.id
    LEFT JOIN loans l ON l.copy_id = bc.id
    WHERE b.active = TRUE
    GROUP BY b.id, c.id
    ORDER BY b.title
  `);
  res.json({ books: result.rows });
}));

app.get("/api/books/:id", authenticate, asyncRoute(async (req, res) => {
  const bookResult = await pool.query(`
    SELECT
      b.*,
      c.name AS category_name,
      COUNT(DISTINCT bc.id)::INT AS total_copies,
      COUNT(DISTINCT bc.id) FILTER (WHERE bc.status = 'available')::INT AS available_copies,
      COUNT(DISTINCT bc.id) FILTER (WHERE bc.status = 'loaned')::INT AS loaned_copies,
      COUNT(DISTINCT l.id)::INT AS total_loan_count
    FROM books b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN book_copies bc ON bc.book_id = b.id
    LEFT JOIN loans l ON l.copy_id = bc.id
    WHERE b.id = $1
    GROUP BY b.id, c.id
  `, [req.params.id]);

  const book = bookResult.rows[0];
  if (!book) throw httpError(404, "Livro não encontrado.");

  const [copies, recentLoans] = await Promise.all([
    pool.query(`
      SELECT * FROM book_copies
      WHERE book_id = $1
      ORDER BY created_at
    `, [req.params.id]),
    pool.query(`
      SELECT
        l.*,
        s.full_name AS student_name,
        c.name AS class_name,
        bc.inventory_code
      FROM loans l
      JOIN students s ON s.id = l.student_id
      LEFT JOIN classes c ON c.id = s.class_id
      JOIN book_copies bc ON bc.id = l.copy_id
      WHERE bc.book_id = $1
      ORDER BY l.created_at DESC
      LIMIT 30
    `, [req.params.id])
  ]);

  res.json({ book, copies: copies.rows, recent_loans: recentLoans.rows });
}));

app.post("/api/books", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const title = requiredText(req.body.title, "o título", 180);
  const author = requiredText(req.body.author, "o autor", 160);
  const quantity = cleanInteger(req.body.quantity, { min: 1, max: 999, nullable: false });
  const isbn = cleanText(req.body.isbn, 30);
  const publisher = cleanText(req.body.publisher, 120);
  const publicationYear = cleanInteger(req.body.publication_year, { min: 1000, max: 2100 });
  const categoryId = cleanText(req.body.category_id);
  const shelf = cleanText(req.body.shelf, 80);
  const description = cleanText(req.body.description);
  const coverUrl = cleanText(req.body.cover_url);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO books
        (title, author, isbn, publisher, publication_year, category_id, shelf, description, cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [title, author, isbn, publisher, publicationYear, categoryId, shelf, description, coverUrl]
    );

    const book = result.rows[0];
    await createInventoryCodes(client, book.id, quantity, new Date().toISOString().slice(0, 10), "Cadastro inicial");
    await audit(client, req, "create", "book", book.id, { ...book, quantity });
    await client.query("COMMIT");
    res.status(201).json({ book });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw httpError(409, "Já existe um livro com esse ISBN.");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/books/:id", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const title = requiredText(req.body.title, "o título", 180);
  const author = requiredText(req.body.author, "o autor", 160);
  const requestedQuantity = cleanInteger(req.body.quantity, { min: 1, max: 999, nullable: false });
  const isbn = cleanText(req.body.isbn, 30);
  const publisher = cleanText(req.body.publisher, 120);
  const publicationYear = cleanInteger(req.body.publication_year, { min: 1000, max: 2100 });
  const categoryId = cleanText(req.body.category_id);
  const shelf = cleanText(req.body.shelf, 80);
  const description = cleanText(req.body.description);
  const coverUrl = cleanText(req.body.cover_url);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const copySummaryResult = await client.query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE status = 'available')::INT AS available
      FROM book_copies
      WHERE book_id = $1
    `, [req.params.id]);

    const copySummary = copySummaryResult.rows[0];
    const difference = requestedQuantity - copySummary.total;

    if (difference < 0 && Math.abs(difference) > copySummary.available) {
      throw httpError(409, "Não é possível reduzir essa quantidade porque existem exemplares indisponíveis.");
    }

    const result = await client.query(
      `UPDATE books
       SET title = $1,
           author = $2,
           isbn = $3,
           publisher = $4,
           publication_year = $5,
           category_id = $6,
           shelf = $7,
           description = $8,
           cover_url = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [title, author, isbn, publisher, publicationYear, categoryId, shelf, description, coverUrl, req.params.id]
    );

    if (!result.rows[0]) throw httpError(404, "Livro não encontrado.");

    if (difference > 0) {
      await createInventoryCodes(client, req.params.id, difference, new Date().toISOString().slice(0, 10), "Acréscimo pelo cadastro do livro");
    }

    if (difference < 0) {
      await client.query(`
        DELETE FROM book_copies
        WHERE id IN (
          SELECT id FROM book_copies
          WHERE book_id = $1 AND status = 'available'
          ORDER BY created_at DESC
          LIMIT $2
        )
      `, [req.params.id, Math.abs(difference)]);
    }

    await audit(client, req, "update", "book", req.params.id, { ...result.rows[0], quantity: requestedQuantity });
    await client.query("COMMIT");
    res.json({ book: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw httpError(409, "Já existe outro livro com esse ISBN.");
    throw error;
  } finally {
    client.release();
  }
}));

app.delete("/api/books/:id", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const activeLoan = await pool.query(`
    SELECT 1
    FROM loans l
    JOIN book_copies bc ON bc.id = l.copy_id
    WHERE bc.book_id = $1 AND l.status = 'active'
    LIMIT 1
  `, [req.params.id]);

  if (activeLoan.rows[0]) throw httpError(409, "O livro possui empréstimos ativos.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE books SET active = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, "Livro não encontrado.");
    await audit(client, req, "archive", "book", req.params.id, { title: result.rows[0].title });
    await client.query("COMMIT");
    res.json({ book: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/copies", authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      bc.*,
      b.title AS book_title,
      b.author AS book_author,
      b.cover_url,
      b.shelf,
      l.id AS active_loan_id,
      s.full_name AS student_name,
      l.due_date
    FROM book_copies bc
    JOIN books b ON b.id = bc.book_id
    LEFT JOIN loans l ON l.copy_id = bc.id AND l.status = 'active'
    LEFT JOIN students s ON s.id = l.student_id
    WHERE b.active = TRUE
    ORDER BY b.title, bc.inventory_code
  `);
  res.json({ copies: result.rows });
}));

app.post("/api/copies", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const bookId = requiredText(req.body.book_id, "o livro");
  const quantity = cleanInteger(req.body.quantity, { min: 1, max: 100, nullable: false });
  const acquiredAt = cleanDate(req.body.acquired_at, "a data de aquisição");
  const notes = cleanText(req.body.condition_notes);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const bookResult = await client.query("SELECT id, title FROM books WHERE id = $1 AND active = TRUE", [bookId]);
    if (!bookResult.rows[0]) throw httpError(404, "Livro não encontrado.");

    const copies = await createInventoryCodes(client, bookId, quantity, acquiredAt, notes);
    await audit(client, req, "create", "copy", bookId, { book_title: bookResult.rows[0].title, quantity });
    await client.query("COMMIT");
    res.status(201).json({ copies });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/copies/:id/status", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const status = requiredText(req.body.status, "a situação do exemplar");
  const notes = cleanText(req.body.condition_notes);
  const allowed = ["available", "maintenance", "damaged", "lost"];
  if (!allowed.includes(status)) throw httpError(400, "Situação do exemplar inválida.");

  const activeLoan = await pool.query(
    "SELECT 1 FROM loans WHERE copy_id = $1 AND status = 'active' LIMIT 1",
    [req.params.id]
  );
  if (activeLoan.rows[0]) throw httpError(409, "O exemplar está emprestado e não pode ter a situação alterada manualmente.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE book_copies
       SET status = $1, condition_notes = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, notes, req.params.id]
    );
    if (!result.rows[0]) throw httpError(404, "Exemplar não encontrado.");
    await audit(client, req, "status", "copy", req.params.id, { status, condition_notes: notes });
    await client.query("COMMIT");
    res.json({ copy: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/loans", authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      l.id,
      l.student_id,
      l.copy_id,
      l.created_by,
      l.loan_date,
      l.due_date,
      l.returned_at,
      l.status,
      l.renewal_count,
      l.notes,
      l.return_condition,
      l.return_notes,
      l.created_at,
      l.updated_at,
      s.full_name AS student_name,
      s.registration_number,
      s.class_id,
      c.name AS class_name,
      b.id AS book_id,
      b.title AS book_title,
      b.author AS book_author,
      b.cover_url,
      bc.inventory_code,
      u.name AS created_by_name,
      GREATEST(CURRENT_DATE - l.due_date, 0)::INT AS overdue_days,
      COALESCE(n.notice_count, 0)::INT AS notice_count
    FROM loans l
    JOIN students s ON s.id = l.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    JOIN book_copies bc ON bc.id = l.copy_id
    JOIN books b ON b.id = bc.book_id
    JOIN users u ON u.id = l.created_by
    LEFT JOIN (
      SELECT loan_id, COUNT(*)::INT AS notice_count
      FROM notices
      GROUP BY loan_id
    ) n ON n.loan_id = l.id
    ORDER BY
      CASE WHEN l.status = 'active' THEN 0 ELSE 1 END,
      l.due_date,
      l.created_at DESC
  `);
  res.json({ loans: result.rows });
}));

app.get("/api/loans/:id", authenticate, asyncRoute(async (req, res) => {
  const loanResult = await pool.query(`
    SELECT
      l.*,
      s.full_name AS student_name,
      s.registration_number,
      c.name AS class_name,
      b.id AS book_id,
      b.title AS book_title,
      b.author AS book_author,
      b.cover_url,
      bc.inventory_code,
      u.name AS created_by_name,
      GREATEST(CURRENT_DATE - l.due_date, 0)::INT AS overdue_days
    FROM loans l
    JOIN students s ON s.id = l.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    JOIN book_copies bc ON bc.id = l.copy_id
    JOIN books b ON b.id = bc.book_id
    JOIN users u ON u.id = l.created_by
    WHERE l.id = $1
  `, [req.params.id]);

  const loan = loanResult.rows[0];
  if (!loan) throw httpError(404, "Empréstimo não encontrado.");

  const notices = await pool.query(`
    SELECT n.*, u.name AS created_by_name
    FROM notices n
    JOIN users u ON u.id = n.created_by
    WHERE n.loan_id = $1
    ORDER BY n.created_at DESC
  `, [req.params.id]);

  res.json({ loan, notices: notices.rows });
}));

app.post("/api/loans", authenticate, asyncRoute(async (req, res) => {
  const studentId = requiredText(req.body.student_id, "o aluno");
  const bookId = requiredText(req.body.book_id, "o livro");
  const loanDate = cleanDate(req.body.loan_date, "a data do empréstimo", false);
  const dueDate = cleanDate(req.body.due_date, "a data de devolução", false);
  const notes = cleanText(req.body.notes);
  const reservationId = cleanText(req.body.reservation_id);

  if (new Date(`${dueDate}T00:00:00`) < new Date(`${loanDate}T00:00:00`)) {
    throw httpError(400, "A devolução não pode ser anterior ao empréstimo.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await getSettings(client);

    const studentResult = await client.query(
      `SELECT id, full_name, active
       FROM students
       WHERE id = $1
       FOR UPDATE`,
      [studentId]
    );
    const student = studentResult.rows[0];
    if (!student || !student.active) throw httpError(400, "Aluno não encontrado ou arquivado.");

    const loanSummaryResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::INT AS active_count,
        COUNT(*) FILTER (WHERE status = 'active' AND due_date < CURRENT_DATE)::INT AS overdue_count
      FROM loans
      WHERE student_id = $1
    `, [studentId]);
    const loanSummary = loanSummaryResult.rows[0];

    if (settings.block_overdue_students && loanSummary.overdue_count > 0) {
      throw httpError(409, "O aluno possui devolução atrasada e não pode receber novo empréstimo.");
    }

    if (loanSummary.active_count >= settings.max_active_loans) {
      throw httpError(409, `O aluno atingiu o limite de ${settings.max_active_loans} empréstimo(s) ativo(s).`);
    }

    const duplicateBook = await client.query(`
      SELECT 1
      FROM loans l
      JOIN book_copies bc ON bc.id = l.copy_id
      WHERE l.student_id = $1
        AND bc.book_id = $2
        AND l.status = 'active'
      LIMIT 1
    `, [studentId, bookId]);
    if (duplicateBook.rows[0]) throw httpError(409, "O aluno já está com um exemplar desse título.");

    const copyResult = await client.query(`
      SELECT id, inventory_code
      FROM book_copies
      WHERE book_id = $1 AND status = 'available'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `, [bookId]);
    const copy = copyResult.rows[0];
    if (!copy) throw httpError(409, "Não há exemplar disponível desse título.");

    const loanResult = await client.query(`
      INSERT INTO loans
        (student_id, copy_id, created_by, loan_date, due_date, status, notes)
      VALUES ($1, $2, $3, $4, $5, 'active', $6)
      RETURNING *
    `, [studentId, copy.id, req.user.id, loanDate, dueDate, notes]);

    await client.query(
      "UPDATE book_copies SET status = 'loaned', updated_at = NOW() WHERE id = $1",
      [copy.id]
    );

    if (reservationId) {
      await client.query(`
        UPDATE reservations
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND student_id = $2 AND book_id = $3
      `, [reservationId, studentId, bookId]);
    }

    await audit(client, req, "create", "loan", loanResult.rows[0].id, {
      student_name: student.full_name,
      student_id: studentId,
      book_id: bookId,
      copy_id: copy.id,
      inventory_code: copy.inventory_code,
      due_date: dueDate,
      reservation_id: reservationId
    });

    await client.query("COMMIT");
    res.status(201).json({ loan: loanResult.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/loans/:id/return", authenticate, asyncRoute(async (req, res) => {
  const condition = requiredText(req.body.condition, "a condição da devolução");
  const notes = cleanText(req.body.notes);
  if (!["normal", "damaged", "lost"].includes(condition)) throw httpError(400, "Condição de devolução inválida.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const loanResult = await client.query(`
      SELECT l.*, bc.id AS locked_copy_id
      FROM loans l
      JOIN book_copies bc ON bc.id = l.copy_id
      WHERE l.id = $1
      FOR UPDATE OF l, bc
    `, [req.params.id]);

    const loan = loanResult.rows[0];
    if (!loan) throw httpError(404, "Empréstimo não encontrado.");
    if (loan.status !== "active") throw httpError(409, "Esse empréstimo já foi finalizado.");

    const loanStatus = condition === "normal" ? "returned" : condition;
    const copyStatus = condition === "normal" ? "available" : condition;

    const updatedLoan = await client.query(`
      UPDATE loans
      SET status = $1,
          returned_at = NOW(),
          return_condition = $2,
          return_notes = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [loanStatus, condition, notes, req.params.id]);

    await client.query(`
      UPDATE book_copies
      SET status = $1,
          condition_notes = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [copyStatus, notes, loan.copy_id]);

    if (copyStatus === "available") {
      const nextReservationResult = await client.query(`
        SELECT id
        FROM reservations
        WHERE book_id = (
          SELECT book_id FROM book_copies WHERE id = $1
        )
          AND status = 'active'
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `, [loan.copy_id]);

      if (nextReservationResult.rows[0]) {
        const settings = await getSettings(client);
        await client.query(`
          UPDATE reservations
          SET status = 'ready',
              ready_at = NOW(),
              expires_at = CURRENT_DATE + $1::INT,
              updated_at = NOW()
          WHERE id = $2
        `, [settings.reservation_hold_days, nextReservationResult.rows[0].id]);
      }
    }

    await audit(client, req, "return", "loan", req.params.id, { condition, notes });
    await client.query("COMMIT");
    res.json({ loan: updatedLoan.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/loans/:id/renew", authenticate, asyncRoute(async (req, res) => {
  const days = cleanInteger(req.body.days, { min: 1, max: 90, nullable: false });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const settings = await getSettings(client);
    const loanResult = await client.query("SELECT * FROM loans WHERE id = $1 FOR UPDATE", [req.params.id]);
    const loan = loanResult.rows[0];

    if (!loan) throw httpError(404, "Empréstimo não encontrado.");
    if (loan.status !== "active") throw httpError(409, "Somente empréstimos ativos podem ser renovados.");
    if (loan.renewal_count >= settings.max_renewals) {
      throw httpError(409, `O limite de ${settings.max_renewals} renovação(ões) foi atingido.`);
    }

    const reservation = await client.query(`
      SELECT 1
      FROM reservations r
      JOIN book_copies bc ON bc.book_id = r.book_id
      WHERE bc.id = $1
        AND r.status IN ('active', 'ready')
        AND r.student_id <> $2
      LIMIT 1
    `, [loan.copy_id, loan.student_id]);
    if (reservation.rows[0]) throw httpError(409, "O livro possui reserva de outro aluno e não pode ser renovado.");

    const updated = await client.query(`
      UPDATE loans
      SET due_date = GREATEST(due_date, CURRENT_DATE) + $1::INT,
          renewal_count = renewal_count + 1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [days, req.params.id]);

    await audit(client, req, "renew", "loan", req.params.id, {
      days,
      new_due_date: updated.rows[0].due_date,
      renewal_count: updated.rows[0].renewal_count
    });

    await client.query("COMMIT");
    res.json({ loan: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/pending", authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      l.id,
      l.student_id,
      l.copy_id,
      l.loan_date,
      l.due_date,
      l.status,
      l.renewal_count,
      l.notes,
      s.full_name AS student_name,
      s.registration_number,
      s.guardian_contact,
      c.name AS class_name,
      b.id AS book_id,
      b.title AS book_title,
      bc.inventory_code,
      (CURRENT_DATE - l.due_date)::INT AS overdue_days,
      COALESCE(n.notice_count, 0)::INT AS notice_count,
      n.last_notice_at
    FROM loans l
    JOIN students s ON s.id = l.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    JOIN book_copies bc ON bc.id = l.copy_id
    JOIN books b ON b.id = bc.book_id
    LEFT JOIN (
      SELECT loan_id, COUNT(*)::INT AS notice_count, MAX(created_at) AS last_notice_at
      FROM notices
      GROUP BY loan_id
    ) n ON n.loan_id = l.id
    WHERE l.status = 'active' AND l.due_date < CURRENT_DATE
    ORDER BY l.due_date
  `);
  res.json({ pending: result.rows });
}));

app.post("/api/loans/:id/notices", authenticate, asyncRoute(async (req, res) => {
  const channel = requiredText(req.body.channel, "o canal utilizado", 80);
  const resultLabel = requiredText(req.body.result, "o resultado do contato", 100);
  const notes = cleanText(req.body.notes);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const loanResult = await client.query("SELECT id FROM loans WHERE id = $1", [req.params.id]);
    if (!loanResult.rows[0]) throw httpError(404, "Empréstimo não encontrado.");

    const result = await client.query(`
      INSERT INTO notices (loan_id, created_by, channel, result, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.params.id, req.user.id, channel, resultLabel, notes]);

    await audit(client, req, "create", "notice", result.rows[0].id, {
      loan_id: req.params.id,
      channel,
      result: resultLabel,
      notes
    });

    await client.query("COMMIT");
    res.status(201).json({ notice: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/reservations", authenticate, asyncRoute(async (_req, res) => {
  await pool.query(`
    UPDATE reservations
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'ready' AND expires_at < CURRENT_DATE
  `);

  const result = await pool.query(`
    SELECT
      r.*,
      s.full_name AS student_name,
      s.registration_number,
      c.name AS class_name,
      b.title AS book_title,
      b.author AS book_author,
      b.cover_url,
      COALESCE(inv.available_copies, 0)::INT AS available_copies,
      CASE
        WHEN r.status IN ('active', 'ready') THEN (
          SELECT COUNT(*)::INT
          FROM reservations r2
          WHERE r2.book_id = r.book_id
            AND r2.status IN ('active', 'ready')
            AND r2.created_at <= r.created_at
        )
        ELSE NULL
      END AS queue_position
    FROM reservations r
    JOIN students s ON s.id = r.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    JOIN books b ON b.id = r.book_id
    LEFT JOIN (
      SELECT book_id, COUNT(*) FILTER (WHERE status = 'available')::INT AS available_copies
      FROM book_copies
      GROUP BY book_id
    ) inv ON inv.book_id = b.id
    ORDER BY
      CASE r.status WHEN 'ready' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
      r.created_at
  `);
  res.json({ reservations: result.rows });
}));

app.post("/api/reservations", authenticate, asyncRoute(async (req, res) => {
  const studentId = requiredText(req.body.student_id, "o aluno");
  const bookId = requiredText(req.body.book_id, "o livro");
  const notes = cleanText(req.body.notes);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const studentResult = await client.query("SELECT id, full_name, active FROM students WHERE id = $1", [studentId]);
    if (!studentResult.rows[0] || !studentResult.rows[0].active) throw httpError(400, "Aluno não encontrado ou arquivado.");

    const bookResult = await client.query("SELECT id, title, active FROM books WHERE id = $1", [bookId]);
    if (!bookResult.rows[0] || !bookResult.rows[0].active) throw httpError(400, "Livro não encontrado ou arquivado.");

    const duplicate = await client.query(`
      SELECT 1 FROM reservations
      WHERE student_id = $1 AND book_id = $2 AND status IN ('active', 'ready')
      LIMIT 1
    `, [studentId, bookId]);
    if (duplicate.rows[0]) throw httpError(409, "O aluno já possui uma reserva ativa desse título.");

    const activeLoan = await client.query(`
      SELECT 1
      FROM loans l
      JOIN book_copies bc ON bc.id = l.copy_id
      WHERE l.student_id = $1 AND bc.book_id = $2 AND l.status = 'active'
      LIMIT 1
    `, [studentId, bookId]);
    if (activeLoan.rows[0]) throw httpError(409, "O aluno já está com esse título emprestado.");

    const result = await client.query(`
      INSERT INTO reservations (student_id, book_id, created_by, status, notes)
      VALUES ($1, $2, $3, 'active', $4)
      RETURNING *
    `, [studentId, bookId, req.user.id, notes]);

    await audit(client, req, "create", "reservation", result.rows[0].id, {
      student_name: studentResult.rows[0].full_name,
      book_title: bookResult.rows[0].title,
      student_id: studentId,
      book_id: bookId
    });

    await client.query("COMMIT");
    res.status(201).json({ reservation: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/reservations/:id/ready", authenticate, asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await getSettings(client);

    const reservationResult = await client.query(`
      SELECT r.*, b.title AS book_title
      FROM reservations r
      JOIN books b ON b.id = r.book_id
      WHERE r.id = $1
      FOR UPDATE
    `, [req.params.id]);
    const reservation = reservationResult.rows[0];
    if (!reservation) throw httpError(404, "Reserva não encontrada.");
    if (reservation.status !== "active") throw httpError(409, "Somente reservas aguardando podem ser marcadas como disponíveis.");

    const earlierReservation = await client.query(`
      SELECT id
      FROM reservations
      WHERE book_id = $1
        AND status = 'active'
        AND (created_at < $2 OR (created_at = $2 AND id::text < $3::text))
      ORDER BY created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `, [reservation.book_id, reservation.created_at, reservation.id]);

    if (earlierReservation.rows[0]) {
      throw httpError(409, "Existe outra reserva anterior na fila para este livro.");
    }

    const availableCopy = await client.query(
      "SELECT 1 FROM book_copies WHERE book_id = $1 AND status = 'available' LIMIT 1",
      [reservation.book_id]
    );
    if (!availableCopy.rows[0]) throw httpError(409, "Ainda não há exemplar disponível para essa reserva.");

    const result = await client.query(`
      UPDATE reservations
      SET status = 'ready',
          ready_at = NOW(),
          expires_at = CURRENT_DATE + $1::INT,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [settings.reservation_hold_days, req.params.id]);

    await audit(client, req, "ready", "reservation", req.params.id, {
      book_title: reservation.book_title,
      expires_at: result.rows[0].expires_at
    });

    await client.query("COMMIT");
    res.json({ reservation: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/reservations/:id/cancel", authenticate, asyncRoute(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      UPDATE reservations
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status IN ('active', 'ready')
      RETURNING *
    `, [req.params.id]);
    if (!result.rows[0]) throw httpError(404, "Reserva ativa não encontrada.");
    await audit(client, req, "cancel", "reservation", req.params.id, result.rows[0]);
    await client.query("COMMIT");
    res.json({ reservation: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/activity", authenticate, asyncRoute(async (req, res) => {
  const limit = cleanInteger(req.query.limit, { min: 1, max: 500 }) || 150;
  const result = await pool.query(`
    SELECT
      a.id,
      a.action,
      a.entity_type,
      a.entity_id,
      a.details,
      a.ip_address,
      a.created_at,
      u.name AS user_name,
      u.email AS user_email
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT $1
  `, [limit]);
  res.json({ activities: result.rows });
}));

app.get("/api/reports/summary", authenticate, asyncRoute(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;
  const start = cleanDate(req.query.start || monthStart, "a data inicial", false);
  const end = cleanDate(req.query.end || today, "a data final", false);

  if (start > end) throw httpError(400, "O período inicial não pode ser posterior ao período final.");

  const [loanSummary, byClass, popularBooks, losses, categories] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE status = 'returned')::INT AS returned,
        COUNT(*) FILTER (WHERE status = 'lost')::INT AS lost,
        COUNT(*) FILTER (WHERE status = 'damaged')::INT AS damaged
      FROM loans
      WHERE loan_date BETWEEN $1 AND $2
    `, [start, end]),
    pool.query(`
      SELECT
        c.name,
        COUNT(l.id)::INT AS loan_count
      FROM classes c
      LEFT JOIN students s ON s.class_id = c.id
      LEFT JOIN loans l ON l.student_id = s.id AND l.loan_date BETWEEN $1 AND $2
      GROUP BY c.id
      ORDER BY loan_count DESC, c.name
    `, [start, end]),
    pool.query(`
      SELECT
        b.id,
        b.title,
        b.author,
        b.cover_url,
        c.name AS category_name,
        COUNT(l.id)::INT AS loan_count
      FROM books b
      JOIN book_copies bc ON bc.book_id = b.id
      JOIN loans l ON l.copy_id = bc.id AND l.loan_date BETWEEN $1 AND $2
      LEFT JOIN categories c ON c.id = b.category_id
      GROUP BY b.id, c.id
      ORDER BY loan_count DESC, b.title
      LIMIT 20
    `, [start, end]),
    pool.query(`
      SELECT
        b.title,
        b.author,
        b.cover_url,
        bc.inventory_code,
        bc.status,
        bc.condition_notes
      FROM book_copies bc
      JOIN books b ON b.id = bc.book_id
      WHERE bc.status IN ('lost', 'damaged')
      ORDER BY b.title
    `),
    pool.query(`
      SELECT
        COALESCE(c.name, 'Sem categoria') AS name,
        COUNT(l.id)::INT AS loan_count
      FROM loans l
      JOIN book_copies bc ON bc.id = l.copy_id
      JOIN books b ON b.id = bc.book_id
      LEFT JOIN categories c ON c.id = b.category_id
      WHERE l.loan_date BETWEEN $1 AND $2
      GROUP BY c.id, c.name
      ORDER BY loan_count DESC
    `, [start, end])
  ]);

  res.json({
    period: { start, end },
    loans: loanSummary.rows[0],
    by_class: byClass.rows,
    popular_books: popularBooks.rows,
    losses: losses.rows,
    categories: categories.rows
  });
}));

app.get("/api/users", authenticate, requireRole("admin"), asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.active,
      u.last_login_at,
      u.created_at,
      u.updated_at,
      u.avatar_url,
      COUNT(a.id)::INT AS action_count
    FROM users u
    LEFT JOIN audit_logs a ON a.user_id = u.id
    GROUP BY u.id
    ORDER BY u.active DESC, u.role, u.name
  `);
  res.json({ users: result.rows });
}));

app.post("/api/users", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const name = requiredText(req.body.name, "o nome", 120);
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  const role = requiredText(req.body.role, "o perfil");

  if (password.length < 8) throw httpError(400, "A senha deve ter pelo menos 8 caracteres.");
  if (!["admin", "librarian"].includes(role)) throw httpError(400, "Perfil inválido.");

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(`
      INSERT INTO users (name, email, password_hash, role, active)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id, name, email, role, active, created_at
    `, [name, email, passwordHash, role]);

    await audit(client, req, "create", "user", result.rows[0].id, { name, email, role });
    await client.query("COMMIT");
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") throw httpError(409, "Já existe uma conta com esse e-mail.");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/users/:id/status", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const active = cleanBoolean(req.body.active);
  if (req.params.id === req.user.id && !active) throw httpError(400, "Você não pode bloquear sua própria conta.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      UPDATE users SET active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email, role, active
    `, [active, req.params.id]);
    if (!result.rows[0]) throw httpError(404, "Usuário não encontrado.");
    await audit(client, req, active ? "reactivate" : "block", "user", req.params.id, { active, name: result.rows[0].name });
    await client.query("COMMIT");
    res.json({ user: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.put("/api/users/:id/password", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 8) throw httpError(400, "A senha deve ter pelo menos 8 caracteres.");

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      UPDATE users SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name
    `, [passwordHash, req.params.id]);
    if (!result.rows[0]) throw httpError(404, "Usuário não encontrado.");
    await audit(client, req, "password", "user", req.params.id, { name: result.rows[0].name, reset_by_admin: true });
    await client.query("COMMIT");
    res.json({ message: "Senha atualizada." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.get("/api/settings", authenticate, asyncRoute(async (_req, res) => {
  res.json({ settings: await getSettings() });
}));

app.put("/api/settings", authenticate, requireRole("admin"), asyncRoute(async (req, res) => {
  const schoolName = requiredText(req.body.school_name, "o nome da escola", 120);
  const libraryName = requiredText(req.body.library_name, "o nome da biblioteca", 120);
  const contactEmail = cleanText(req.body.contact_email, 180);
  const contactPhone = cleanText(req.body.contact_phone, 40);
  const currentSchoolYear = cleanInteger(req.body.current_school_year, { min: 2020, max: 2100, nullable: false });
  const defaultLoanDays = cleanInteger(req.body.default_loan_days, { min: 1, max: 90, nullable: false });
  const maxActiveLoans = cleanInteger(req.body.max_active_loans, { min: 1, max: 20, nullable: false });
  const maxRenewals = cleanInteger(req.body.max_renewals, { min: 0, max: 10, nullable: false });
  const renewalDays = cleanInteger(req.body.renewal_days, { min: 1, max: 90, nullable: false });
  const dueSoonDays = cleanInteger(req.body.due_soon_days, { min: 0, max: 30, nullable: false });
  const reservationHoldDays = cleanInteger(req.body.reservation_hold_days, { min: 1, max: 30, nullable: false });
  const blockOverdueStudents = cleanBoolean(req.body.block_overdue_students, true);
  const noticeTemplate = requiredText(req.body.notice_template, "o modelo de cobrança");
  const reservationTemplate = requiredText(req.body.reservation_template, "o modelo de reserva");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      UPDATE settings
      SET school_name = $1,
          library_name = $2,
          contact_email = $3,
          contact_phone = $4,
          current_school_year = $5,
          default_loan_days = $6,
          max_active_loans = $7,
          max_renewals = $8,
          renewal_days = $9,
          due_soon_days = $10,
          reservation_hold_days = $11,
          block_overdue_students = $12,
          notice_template = $13,
          reservation_template = $14,
          updated_at = NOW()
      WHERE id = 1
      RETURNING *
    `, [
      schoolName,
      libraryName,
      contactEmail,
      contactPhone,
      currentSchoolYear,
      defaultLoanDays,
      maxActiveLoans,
      maxRenewals,
      renewalDays,
      dueSoonDays,
      reservationHoldDays,
      blockOverdueStudents,
      noticeTemplate,
      reservationTemplate
    ]);

    await audit(client, req, "update", "settings", "1", result.rows[0]);
    await client.query("COMMIT");
    res.json({ settings: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}));

app.use((_req, res) => {
  res.status(404).json({ message: "Rota não encontrada." });
});

app.use((error, _req, res, _next) => {
  console.error(error);

  if (error.message === "Origem não autorizada pelo CORS.") {
    return res.status(403).json({ message: error.message });
  }

  if (error.code === "22P02") {
    return res.status(400).json({ message: "Um dos identificadores enviados é inválido." });
  }

  if (error.code === "23503") {
    return res.status(409).json({ message: "Esse registro está vinculado a outras informações do sistema." });
  }

  if (error.code === "23514") {
    return res.status(400).json({ message: "Um dos valores enviados não atende às regras do banco." });
  }

  const status = error.status || 500;
  return res.status(status).json({
    message: status === 500
      ? "Erro interno do servidor. Consulte os logs do Render."
      : error.message
  });
});

async function start() {
  try {
    await pool.query("SELECT 1");
    await ensureRuntimeSchema();
    await ensureInitialUsers();
    app.listen(PORT, () => {
      console.log(`BookShare API 2.7 online na porta ${PORT}.`);
      setTimeout(() => {
        syncBookCovers().catch(error => console.error("Initial cover sync failed:", error));
      }, 2500);
    });
  } catch (error) {
    console.error("Falha ao iniciar a API:", error);
    process.exit(1);
  }
}

start();
