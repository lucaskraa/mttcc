"use strict";

const CONFIG = {
  API_BASE_URL: "https://mttcc-1.onrender.com/api",
  TOKEN_KEY: "bookshare_token",
  REQUEST_TIMEOUT: 25000,
  SEARCH_DELAY: 260
};

const state = {
  user: null,
  settings: null,
  categories: [],
  classes: [],
  students: [],
  books: [],
  copies: [],
  loans: [],
  reservations: [],
  pending: [],
  users: [],
  activities: [],
  dashboard: null,
  reports: null,
  currentRoute: "dashboard",
  currentLoanTab: "active",
  currentBookView: "grid",
  selectedServiceStudent: null,
  selectedNoticeLoan: null,
  loadingRoutes: new Set(),
  profileAvatarDraft: null,
  bookCoverCache: new Map(),
  bookCoverRequests: new Map()
};

const routeMeta = {
  dashboard: ["Biblioteca", "Início"],
  atendimento: ["Balcão da biblioteca", "Atendimento"],
  emprestimos: ["Circulação", "Empréstimos"],
  reservas: ["Fila de espera", "Reservas"],
  pendencias: ["Controle de atrasos", "Pendências"],
  livros: ["Catálogo", "Livros"],
  exemplares: ["Patrimônio", "Exemplares"],
  alunos: ["Comunidade escolar", "Alunos"],
  turmas: ["Organização escolar", "Turmas"],
  relatorios: ["Análise", "Relatórios"],
  atividades: ["Auditoria", "Histórico de ações"],
  usuarios: ["Administração", "Usuários"],
  configuracoes: ["Administração", "Configurações"]
};

const entityLabels = {
  loan: "Empréstimo",
  book: "Livro",
  copy: "Exemplar",
  student: "Aluno",
  class: "Turma",
  reservation: "Reserva",
  notice: "Aviso",
  user: "Usuário",
  settings: "Configurações",
  category: "Categoria"
};

const actionLabels = {
  create: "criou",
  update: "atualizou",
  archive: "arquivou",
  reactivate: "reativou",
  block: "bloqueou",
  return: "registrou a devolução de",
  renew: "renovou",
  cancel: "cancelou",
  fulfill: "concluiu",
  ready: "marcou como disponível",
  status: "alterou a situação de",
  password: "alterou a senha de"
};

const copyStatusLabels = {
  available: "Disponível",
  loaned: "Emprestado",
  damaged: "Danificado",
  lost: "Perdido",
  maintenance: "Manutenção"
};

const reservationStatusLabels = {
  active: "Aguardando",
  ready: "Disponível",
  completed: "Concluída",
  cancelled: "Cancelada",
  expired: "Expirada"
};

const selectors = {
  authView: "#auth-view",
  appView: "#app-view",
  loading: "#app-loading",
  sidebar: "#sidebar",
  sidebarOverlay: "#sidebar-overlay",
  notificationPanel: "#notification-panel",
  globalResults: "#global-search-results"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let searchTimer = null;
let confirmResolver = null;
let serviceClockTimer = null;

window.addEventListener("DOMContentLoaded", initializeApplication);

async function initializeApplication() {
  initializeBookCoverHydration();
  bindApplicationEvents();
  initializeDates();
  startServiceClock();

  const token = localStorage.getItem(CONFIG.TOKEN_KEY);

  if (!token) {
    showAuthView();
    finishLoading();
    return;
  }

  try {
    const response = await api("/auth/me");
    state.user = response.user;
    showAppView();
    await loadCoreData();
    const initialRoute = location.hash.replace("#", "") || "dashboard";
    await navigate(initialRoute, false);
  } catch (error) {
    clearSession();
    showAuthView();
  } finally {
    finishLoading();
  }
}

function bindApplicationEvents() {
  $("#login-form").addEventListener("submit", handleLogin);
  $("#toggle-password").addEventListener("click", togglePasswordVisibility);
  $("#logout-button").addEventListener("click", handleLogout);
  $("#menu-button").addEventListener("click", openSidebar);
  $("#sidebar-close").addEventListener("click", closeSidebar);
  $(selectors.sidebarOverlay).addEventListener("click", closeSidebar);
  $("#refresh-button").addEventListener("click", refreshCurrentRoute);
  $("#notifications-button").addEventListener("click", toggleNotificationPanel);
  $("#notification-panel-close").addEventListener("click", closeNotificationPanel);
  $("#topbar-profile").addEventListener("click", openOwnProfile);
  $("#sidebar-profile-button").addEventListener("click", openOwnProfile);
  $("#mobile-more-button").addEventListener("click", openSidebar);
  $("#librarian-profile-shortcut")?.addEventListener("click", openOwnProfile);

  document.addEventListener("click", handleDelegatedClick);
  document.addEventListener("keydown", handleGlobalKeyboardShortcuts);
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("resize", handleWindowResize);

  bindForms();
  bindFilters();
  bindSpecialControls();
}

function bindForms() {
  $("#loan-form").addEventListener("submit", handleCreateLoan);
  $("#return-form").addEventListener("submit", handleReturnLoan);
  $("#book-form").addEventListener("submit", handleSaveBook);
  $("#copy-form").addEventListener("submit", handleCreateCopies);
  $("#student-form").addEventListener("submit", handleSaveStudent);
  $("#class-form").addEventListener("submit", handleSaveClass);
  $("#reservation-form").addEventListener("submit", handleCreateReservation);
  $("#notice-form").addEventListener("submit", handleSaveNotice);
  $("#user-form").addEventListener("submit", handleCreateUser);
  $("#settings-form").addEventListener("submit", handleSaveSettings);
}

function bindFilters() {
  bindInput("#loan-search", renderLoans);
  bindInput("#loan-start-date", renderLoans, "change");
  bindInput("#loan-end-date", renderLoans, "change");
  bindInput("#loan-class-filter", renderLoans, "change");

  bindInput("#reservation-search", renderReservations);
  bindInput("#reservation-status-filter", renderReservations, "change");

  bindInput("#pending-search", renderPending);
  bindInput("#pending-days-filter", renderPending, "change");
  bindInput("#pending-contact-filter", renderPending, "change");

  bindInput("#book-search", renderBooks);
  bindInput("#book-category-filter", renderBooks, "change");
  bindInput("#book-availability-filter", renderBooks, "change");

  bindInput("#copy-search", renderCopies);
  bindInput("#copy-status-filter", renderCopies, "change");

  bindInput("#student-search", renderStudents);
  bindInput("#student-class-filter", renderStudents, "change");
  bindInput("#student-status-filter", renderStudents, "change");

  bindInput("#class-search", renderClasses);
  bindInput("#class-year-filter", renderClasses, "change");
  bindInput("#class-shift-filter", renderClasses, "change");

  bindInput("#activity-search", renderActivities);
  bindInput("#activity-type-filter", renderActivities, "change");

  bindInput("#user-search", renderUsers);
  bindInput("#user-role-filter", renderUsers, "change");

  bindInput("#service-student-search", handleServiceStudentSearch);
  bindInput("#return-search-input", handleReturnSearch);
  bindInput("#global-search-input", handleGlobalSearch);
}

function bindSpecialControls() {
  $("#loan-student").addEventListener("change", updateLoanStudentPreview);
  $("#book-cover-url").addEventListener("input", updateBookCoverPreview);
  $("#book-cover-file-button").addEventListener("click", () => $("#book-cover-file").click());
  $("#book-cover-file").addEventListener("change", handleBookCoverFileSelection);
  $("#student-photo-button").addEventListener("click", () => $("#student-photo-file").click());
  $("#student-photo-file").addEventListener("change", handleStudentPhotoSelection);
  $("#copy-notice-from-modal").addEventListener("click", copyCurrentNoticeMessage);
  $("#loan-filter-clear").addEventListener("click", clearLoanFilters);
  $("#export-loans-button").addEventListener("click", exportLoansCsv);
  $("#export-books-button").addEventListener("click", exportBooksCsv);
  $("#export-students-button").addEventListener("click", exportStudentsCsv);
  $("#report-apply-button").addEventListener("click", loadReports);
  $("#report-export-button").addEventListener("click", exportReportCsv);
  $("#report-print-button").addEventListener("click", () => window.print());
  $("#activity-refresh-button").addEventListener("click", loadActivities);
  $("#change-own-password-button").addEventListener("click", handleChangeOwnPassword);
  $("#profile-photo-input").addEventListener("change", handleProfilePhotoSelection);
  $("#save-profile-button").addEventListener("click", handleSaveProfile);
  $("#confirm-cancel").addEventListener("click", () => resolveConfirmation(false));
  $("#confirm-accept").addEventListener("click", () => resolveConfirmation(true));

  $$("#loan-status-tabs button").forEach(button => {
    button.addEventListener("click", () => {
      state.currentLoanTab = button.dataset.value;
      $$("#loan-status-tabs button").forEach(item => item.classList.toggle("is-active", item === button));
      renderLoans();
    });
  });

  $$("#book-view-switcher button").forEach(button => {
    button.addEventListener("click", () => {
      state.currentBookView = button.dataset.view;
      $$("#book-view-switcher button").forEach(item => item.classList.toggle("is-active", item === button));
      renderBooks();
    });
  });

  $$("[data-settings-tab]").forEach(button => {
    button.addEventListener("click", () => switchSettingsTab(button.dataset.settingsTab));
  });
}

function bindInput(selector, handler, eventName = "input") {
  const element = $(selector);
  if (element) element.addEventListener(eventName, handler);
}

function handleDelegatedClick(event) {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    event.preventDefault();
    navigate(routeButton.dataset.route);
    return;
  }

  const openModalButton = event.target.closest("[data-open-modal]");
  if (openModalButton) {
    event.preventDefault();
    if (openModalButton.closest("#detail-modal")) closeModal("detail-modal");
    openModal(openModalButton.dataset.openModal, openModalButton);
    return;
  }

  const closeModalButton = event.target.closest("[data-close-modal]");
  if (closeModalButton) {
    event.preventDefault();
    closeModal(closeModalButton.closest("dialog")?.id);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    event.preventDefault();
    dispatchAction(actionButton.dataset.action, actionButton.dataset);
  }

  const openDialog = event.target.closest("dialog");
  if (openDialog && event.target === openDialog) {
    closeModal(openDialog.id);
  }

  if (!event.target.closest(".topbar__center")) {
    hideGlobalSearchResults();
  }
}

async function dispatchAction(action, data) {
  const handlers = {
    "view-loan": () => openLoanDetails(data.id),
    "return-loan": () => prepareReturnLoan(data.id),
    "renew-loan": () => renewLoan(data.id),
    "notice-loan": () => prepareNotice(data.id),
    "copy-notice": () => copyNotice(data.id),
    "edit-book": () => editBook(data.id),
    "view-book": () => openBookDetails(data.id),
    "loan-book": () => prepareLoanForBook(data.id),
    "reserve-book": () => prepareReservationForBook(data.id),
    "archive-book": () => archiveBook(data.id),
    "edit-copy": () => editCopyStatus(data.id),
    "view-student": () => openStudentDetails(data.id),
    "edit-student": () => editStudent(data.id),
    "archive-student": () => archiveStudent(data.id),
    "reactivate-student": () => reactivateStudent(data.id),
    "select-service-student": () => selectServiceStudent(data.id),
    "edit-class": () => editClass(data.id),
    "toggle-class": () => toggleClass(data.id, data.active === "true"),
    "view-class": () => openClassDetails(data.id),
    "cancel-reservation": () => cancelReservation(data.id),
    "ready-reservation": () => markReservationReady(data.id),
    "fulfill-reservation": () => fulfillReservation(data.id),
    "copy-reservation": () => copyReservationMessage(data.id),
    "toggle-user": () => toggleUser(data.id, data.active === "true"),
    "reset-user-password": () => resetUserPassword(data.id),
    "search-result": () => openSearchResult(data.type, data.id),
    "quick-return-result": () => prepareReturnLoan(data.id),
    "close-notification": closeNotificationPanel
  };

  if (handlers[action]) await handlers[action]();
}

function handleGlobalKeyboardShortcuts(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#global-search-input")?.focus();
  }

  if (event.key === "Escape") {
    closeNotificationPanel();
    hideGlobalSearchResults();
    closeSidebar();
  }
}

function handleHashChange() {
  const route = location.hash.replace("#", "") || "dashboard";
  navigate(route, false);
}

function handleWindowResize() {
  if (window.innerWidth > 1100) closeSidebar();
  if (state.currentRoute === "dashboard" && state.dashboard) drawCirculationChart(state.dashboard.circulation || []);
  if (state.currentRoute === "relatorios" && state.reports) drawCategoryChart(state.reports.categories || []);
}

async function handleLogin(event) {
  event.preventDefault();
  clearFormErrors(event.currentTarget);

  const email = $("#login-email").value.trim().toLowerCase();
  const password = $("#login-password").value;
  const submitButton = $("#login-submit");

  let valid = true;
  if (!email || !email.includes("@")) {
    setFieldError($("#login-email"), "Informe um e-mail válido.");
    valid = false;
  }
  if (!password || password.length < 6) {
    setFieldError($("#login-password"), "Informe sua senha.");
    valid = false;
  }
  if (!valid) return;

  setButtonLoading(submitButton, true, "Entrando...");

  try {
    const response = await api("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password }
    });

    localStorage.setItem(CONFIG.TOKEN_KEY, response.token);
    state.user = response.user;
    showAppView();
    await loadCoreData();
    await navigate("dashboard");
    toast("Acesso realizado", `Bem-vinda, ${firstName(state.user.name)}.`);
  } catch (error) {
    toast("Não foi possível entrar", error.message, "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
}

function togglePasswordVisibility() {
  const input = $("#login-password");
  const button = $("#toggle-password");
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  button.textContent = visible ? "Mostrar" : "Ocultar";
}

async function handleLogout() {
  const confirmed = await confirmAction({
    title: "Sair do BookShare?",
    message: "Sua sessão será encerrada neste dispositivo.",
    acceptText: "Sair",
    danger: false
  });

  if (!confirmed) return;
  clearSession();
  showAuthView();
  toast("Sessão encerrada", "Você saiu do BookShare.");
}

function clearSession() {
  localStorage.removeItem(CONFIG.TOKEN_KEY);
  state.user = null;
  state.dashboard = null;
  state.books = [];
  state.copies = [];
  state.students = [];
  state.classes = [];
  state.loans = [];
  state.reservations = [];
  state.pending = [];
  state.users = [];
  state.activities = [];
  state.reports = null;
}

function showAuthView() {
  $(selectors.authView).classList.remove("is-hidden");
  $(selectors.appView).classList.add("is-hidden");
}

function showAppView() {
  $(selectors.authView).classList.add("is-hidden");
  $(selectors.appView).classList.remove("is-hidden");
  configureUserInterface();
}

function finishLoading() {
  setTimeout(() => $(selectors.loading).classList.add("is-complete"), 120);
}

function configureUserInterface() {
  if (!state.user) return;

  const isAdmin = state.user.role === "admin";
  const app = $(selectors.appView);
  app.classList.toggle("role-admin", isAdmin);
  app.classList.toggle("role-librarian", !isAdmin);

  $("#admin-navigation").classList.toggle("is-hidden", !isAdmin);
  $$(".admin-only").forEach(element => element.classList.toggle("is-hidden", !isAdmin));
  $$(".admin-only-nav").forEach(element => element.classList.toggle("is-hidden", !isAdmin));
  $$(".librarian-only").forEach(element => element.classList.toggle("is-hidden", isAdmin));
  $$("[data-settings-tab]").forEach(button => {
    button.classList.toggle("is-hidden", !isAdmin && button.dataset.settingsTab !== "account");
  });
  $(".settings-form__footer")?.classList.toggle("is-hidden", !isAdmin);
  switchSettingsTab(isAdmin ? "general" : "account");

  const role = isAdmin ? "Administrador do sistema" : "Bibliotecária";
  const roleDescription = isAdmin
    ? "Controle do acervo, usuários, relatórios e configurações."
    : "Atendimento, empréstimos, devoluções e acompanhamento de alunos.";

  setAvatarElement($("#sidebar-avatar"), state.user);
  setAvatarElement($("#topbar-avatar"), state.user);
  setAvatarElement($("#profile-photo-preview"), state.user);
  if ($("#admin-hero-avatar")) setAvatarElement($("#admin-hero-avatar"), state.user);
  if ($("#librarian-hero-avatar")) setAvatarElement($("#librarian-hero-avatar"), state.user);
  if ($("#admin-welcome-title") && isAdmin) $("#admin-welcome-title").textContent = `Central de ${firstName(state.user.name)}`;

  $("#sidebar-user-name").textContent = state.user.name;
  $("#topbar-user-name").textContent = state.user.name;
  if ($("#librarian-hero-name")) $("#librarian-hero-name").textContent = state.user.name;
  if ($("#admin-hero-name")) $("#admin-hero-name").textContent = state.user.name;
  if ($("#admin-hero-email")) $("#admin-hero-email").textContent = state.user.email || "";
  if ($("#topbar-role-pill")) $("#topbar-role-pill").textContent = isAdmin ? "Admin" : "Balcão";
  $("#sidebar-user-role").textContent = role;
  $("#topbar-user-role").textContent = role;
  $("#profile-name-input").value = state.user.name || "";
  $("#profile-email-input").value = state.user.email || "";
  $("#profile-role-icon").textContent = isAdmin ? "A" : "B";
  $("#profile-role-title").textContent = role;
  $("#profile-role-description").textContent = roleDescription;
}

async function loadCoreData() {
  await Promise.all([
    loadSettings(),
    loadCategories(),
    loadClasses()
  ]);

  await Promise.all([
    loadBooks(),
    loadStudents(),
    loadLoans(),
    loadReservations(),
    loadPending()
  ]);

  updateAllSelectOptions();
  buildNotifications();
}

async function navigate(route, updateHash = true) {
  if (!routeMeta[route]) route = "dashboard";
  const librarianBlockedRoutes = ["exemplares", "relatorios", "atividades", "usuarios"];
  if (state.user?.role !== "admin" && librarianBlockedRoutes.includes(route)) route = "dashboard";

  state.currentRoute = route;

  $$(".page-view").forEach(view => view.classList.add("is-hidden"));
  $(`#view-${route}`)?.classList.remove("is-hidden");

  $$('[data-route]').forEach(button => {
    button.classList.toggle("is-active", button.dataset.route === route);
  });

  const [eyebrow, title] = routeMeta[route];
  $("#page-eyebrow").textContent = eyebrow;
  $("#page-title").textContent = title;
  document.title = `${title} | BookShare`;

  if (updateHash && location.hash !== `#${route}`) location.hash = route;

  closeSidebar();
  closeNotificationPanel();
  window.scrollTo({ top: 0, behavior: "smooth" });

  await loadRouteData(route);
}

async function loadRouteData(route) {
  if (state.loadingRoutes.has(route)) return;
  state.loadingRoutes.add(route);

  try {
    const loaders = {
      dashboard: loadDashboard,
      atendimento: async () => renderServiceInitialState(),
      emprestimos: loadLoans,
      reservas: loadReservations,
      pendencias: loadPending,
      livros: loadBooks,
      exemplares: loadCopies,
      alunos: loadStudents,
      turmas: loadClasses,
      relatorios: loadReports,
      atividades: loadActivities,
      usuarios: loadUsers,
      configuracoes: loadSettings
    };

    if (loaders[route]) await loaders[route]();
  } catch (error) {
    toast("Erro ao carregar", error.message, "error");
  } finally {
    state.loadingRoutes.delete(route);
  }
}

async function refreshCurrentRoute() {
  const button = $("#refresh-button");
  setButtonLoading(button, true, "↻");

  try {
    await loadRouteData(state.currentRoute);
    buildNotifications();
    toast("Dados atualizados", "As informações mais recentes foram carregadas.");
  } finally {
    setButtonLoading(button, false);
  }
}

async function loadDashboard() {
  state.dashboard = await api("/dashboard");
  renderDashboard();
}

function renderDashboard() {
  const dashboard = state.dashboard;
  if (!dashboard) return;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const librarianTitle = $("#librarian-welcome-title");
  const librarianMessage = $("#librarian-welcome-message");
  if (librarianTitle) librarianTitle.textContent = `${greeting}, ${firstName(state.user.name)}!`;
  if (librarianMessage) librarianMessage.textContent = dashboard.loans.overdue > 0
    ? `${dashboard.loans.overdue} devolução(ões) atrasada(s) precisam de acompanhamento.`
    : "Atendimento em dia. Confira as devoluções e reservas de hoje.";

  const adminTitle = $("#admin-welcome-title");
  if (adminTitle) adminTitle.textContent = `${greeting}, ${firstName(state.user.name)} — administração`;

  $("#librarian-due-today").textContent = dashboard.loans.due_today;
  $("#librarian-overdue").textContent = dashboard.loans.overdue;
  $("#librarian-ready-reservations").textContent = dashboard.reservations.ready;

  $("#metric-total-titles").textContent = dashboard.books.total_titles;
  $("#metric-total-copies").textContent = `${dashboard.books.total_copies} exemplares no total`;
  $("#metric-active-loans").textContent = dashboard.loans.active;
  $("#metric-due-soon").textContent = `${dashboard.loans.due_soon} vencendo em breve`;
  $("#metric-due-today-badge").textContent = `${dashboard.loans.due_today} hoje`;
  $("#metric-overdue-loans").textContent = dashboard.loans.overdue;
  $("#metric-overdue-detail").textContent = dashboard.loans.overdue
    ? `Maior atraso: ${dashboard.loans.max_overdue_days} dia(s)`
    : "Nenhuma cobrança necessária";
  $("#metric-active-students").textContent = dashboard.students.active;
  $("#metric-active-classes").textContent = `${dashboard.students.classes} turmas cadastradas`;

  renderDashboardAlerts(dashboard);
  renderDashboardDueList(dashboard.due_today || []);
  renderDashboardPopularBooks(dashboard.popular_books || []);
  drawCirculationChart(dashboard.circulation || []);
  updateNavigationCounters();
}

function renderDashboardAlerts(dashboard) {
  const alerts = [];

  if (dashboard.loans.overdue > 0) {
    alerts.push({
      type: "danger",
      icon: "!",
      title: `${dashboard.loans.overdue} empréstimo(s) em atraso`,
      message: "Acesse Pendências para gerar mensagens e registrar contatos.",
      route: "pendencias"
    });
  }

  if (dashboard.reservations.ready > 0) {
    alerts.push({
      type: "warning",
      icon: "◇",
      title: `${dashboard.reservations.ready} reserva(s) disponível(is)`,
      message: "Os livros já podem ser retirados pelos alunos.",
      route: "reservas"
    });
  }

  if (state.user?.role === "admin" && dashboard.books.attention_copies > 0) {
    alerts.push({
      type: "warning",
      icon: "▥",
      title: `${dashboard.books.attention_copies} exemplar(es) exigem atenção`,
      message: "Há patrimônio perdido, danificado ou em manutenção.",
      route: "exemplares"
    });
  }

  $("#dashboard-alerts").innerHTML = alerts.map(alert => `
    <button class="alert-card ${alert.type === "danger" ? "alert-card--danger" : ""}" data-route="${alert.route}" type="button">
      <span class="alert-card__icon">${alert.icon}</span>
      <span class="alert-card__copy">
        <strong>${escapeHTML(alert.title)}</strong>
        <span>${escapeHTML(alert.message)}</span>
      </span>
      <span>→</span>
    </button>
  `).join("");
}

function renderDashboardDueList(items) {
  const container = $("#dashboard-due-list");
  if (!items.length) {
    container.innerHTML = inlineEmpty("Nenhuma devolução prevista para hoje.");
    return;
  }

  container.innerHTML = items.slice(0, 7).map(item => `
    <div class="compact-item">
      <span class="compact-item__avatar">${initialsFromName(item.student_name)}</span>
      <span class="compact-item__copy">
        <strong>${escapeHTML(item.student_name)}</strong>
        <span>${escapeHTML(item.book_title)} · ${escapeHTML(item.class_name || "Sem turma")}</span>
      </span>
      <button class="table-action" data-action="view-loan" data-id="${item.id}" type="button">Abrir</button>
    </div>
  `).join("");
}

function renderDashboardRecentLoans(items) {
  const container = $("#dashboard-recent-loans");
  if (!items.length) {
    container.innerHTML = emptyState("⇄", "Nenhuma movimentação", "Os empréstimos recentes aparecerão aqui.");
    return;
  }

  container.innerHTML = buildResponsiveTable({
    headers: ["Aluno", "Livro", "Retirada", "Prazo", "Situação", ""],
    rows: items.slice(0, 7).map(item => `
      <tr>
        <td>${personCell(item.student_name, `${item.class_name || "Sem turma"} · ${item.registration_number || ""}`)}</td>
        <td>${bookCell(item.book_title, item.book_author, bookCoverUrl({ title: item.book_title, author: item.book_author, cover_url: item.cover_url }))}</td>
        <td>${formatDate(item.loan_date)}</td>
        <td>${formatDate(item.due_date)}</td>
        <td>${loanBadge(item)}</td>
        <td>${tableActions([{ label: "Detalhes", action: "view-loan", id: item.id }])}</td>
      </tr>
    `),
    cards: items.slice(0, 7).map(item => mobileLoanCard(item))
  });
}

function renderDashboardPopularBooks(items) {
  const container = $("#dashboard-popular-books");
  if (!items.length) {
    container.innerHTML = inlineEmpty("Os títulos mais emprestados aparecerão aqui.");
    return;
  }

  container.innerHTML = items.slice(0, 6).map((item, index) => `
    <div class="popular-item">
      <span class="popular-item__position">${String(index + 1).padStart(2, "0")}</span>
      <span class="popular-item__cover">
        ${`<img src="${escapeAttribute(bookCoverUrl(item))}" alt="" loading="lazy">`}
      </span>
      <span class="popular-item__copy">
        <strong>${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(item.author)}</span>
      </span>
      <span class="badge badge--neutral">${item.loan_count}</span>
    </div>
  `).join("");
}

function drawCirculationChart(items) {
  const canvas = $("#circulation-chart");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.parentElement.clientWidth || 600;
  const height = window.innerWidth < 760 ? 230 : 290;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const data = items.length ? items : Array.from({ length: 14 }, (_, index) => ({
    day: new Date(Date.now() - (13 - index) * 86400000).toISOString().slice(0, 10),
    loans: 0,
    returns: 0
  }));

  const padding = { top: 18, right: 14, bottom: 34, left: 34 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(4, ...data.flatMap(item => [Number(item.loans), Number(item.returns)]));

  context.strokeStyle = "#e4ecea";
  context.lineWidth = 1;
  context.fillStyle = "#718b86";
  context.font = "10px DM Sans";
  context.textAlign = "right";

  for (let step = 0; step <= 4; step += 1) {
    const y = padding.top + chartHeight - (chartHeight * step / 4);
    const value = Math.round(maxValue * step / 4);
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
    context.fillText(String(value), padding.left - 7, y + 3);
  }

  const groupWidth = chartWidth / data.length;
  const barWidth = Math.max(4, Math.min(12, groupWidth * 0.25));

  data.forEach((item, index) => {
    const centerX = padding.left + groupWidth * index + groupWidth / 2;
    const loanHeight = chartHeight * Number(item.loans) / maxValue;
    const returnHeight = chartHeight * Number(item.returns) / maxValue;

    drawRoundedBar(context, centerX - barWidth - 2, padding.top + chartHeight - loanHeight, barWidth, loanHeight, 4, "#39937d");
    drawRoundedBar(context, centerX + 2, padding.top + chartHeight - returnHeight, barWidth, returnHeight, 4, "#d8893e");

    if (index % Math.ceil(data.length / 7) === 0 || index === data.length - 1) {
      context.fillStyle = "#718b86";
      context.font = "9px DM Sans";
      context.textAlign = "center";
      const date = parseDate(item.day);
      context.fillText(`${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`, centerX, height - 11);
    }
  });
}

function drawRoundedBar(context, x, y, width, height, radius, color) {
  if (height <= 0) return;
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x, y + height);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height);
  context.closePath();
  context.fill();
}

async function loadClasses() {
  const response = await api("/classes");
  state.classes = response.classes;
  renderClasses();
  updateAllSelectOptions();
}

function renderClasses() {
  const container = $("#classes-container");
  if (!container) return;

  const search = normalize($("#class-search")?.value || "");
  const year = $("#class-year-filter")?.value || "";
  const shift = $("#class-shift-filter")?.value || "";

  const items = state.classes.filter(item => {
    const searchable = normalize(`${item.name} ${item.teacher_name || ""} ${item.school_year} ${item.shift}`);
    return (!search || searchable.includes(search)) &&
      (!year || String(item.school_year) === year) &&
      (!shift || item.shift === shift);
  });

  if (!items.length) {
    container.innerHTML = emptyState("▦", "Nenhuma turma encontrada", "Cadastre uma turma ou ajuste os filtros.");
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="class-card">
      <div class="class-card__header">
        <div class="card-identity">
          <span class="card-identity__avatar">${escapeHTML(item.name.slice(0, 3))}</span>
          <span class="card-identity__copy">
            <strong>${escapeHTML(item.name)}</strong>
            <span>${escapeHTML(item.shift)} · ${item.school_year}</span>
          </span>
        </div>
        ${statusBadge(item.active ? "Ativa" : "Arquivada", item.active ? "success" : "neutral")}
      </div>
      <div class="class-card__stats">
        <div><strong>${item.student_count}</strong><span>alunos</span></div>
        <div><strong>${item.active_loan_count}</strong><span>emprestados</span></div>
        <div><strong>${item.overdue_count}</strong><span>atrasos</span></div>
      </div>
      <div class="card-detail-list">
        <div><span>Professor</span><strong>${escapeHTML(item.teacher_name || "Não informado")}</strong></div>
        <div><span>Ano letivo</span><strong>${item.school_year}</strong></div>
      </div>
      <div class="card-footer-actions">
        <button class="button button--secondary button--compact" data-action="view-class" data-id="${item.id}" type="button">Ver alunos</button>
        ${state.user?.role === "admin" ? `
          <button class="button button--secondary button--compact" data-action="edit-class" data-id="${item.id}" type="button">Editar</button>
          <button class="button button--ghost button--compact" data-action="toggle-class" data-id="${item.id}" data-active="${item.active}" type="button">${item.active ? "Arquivar" : "Reativar"}</button>
        ` : ""}
      </div>
    </article>
  `).join("");
}

async function handleSaveClass(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const id = payload.id;
  delete payload.id;

  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Salvando...");

  try {
    await api(id ? `/classes/${id}` : "/classes", {
      method: id ? "PUT" : "POST",
      body: payload
    });
    closeModal("class-modal");
    await Promise.all([loadClasses(), loadDashboardSafe()]);
    toast("Turma salva", "As informações da turma foram atualizadas.");
  } catch (error) {
    toast("Não foi possível salvar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

function editClass(id) {
  const item = state.classes.find(current => current.id === id);
  if (!item) return;

  const form = $("#class-form");
  form.reset();
  fillForm(form, item);
  $("#class-modal-title").textContent = "Editar turma";
  openModal("class-modal");
}

async function toggleClass(id, active) {
  const confirmed = await confirmAction({
    title: active ? "Arquivar turma?" : "Reativar turma?",
    message: active
      ? "Os alunos continuarão no histórico, mas a turma não aparecerá em novos cadastros."
      : "A turma voltará a aparecer nos cadastros ativos.",
    acceptText: active ? "Arquivar" : "Reativar",
    danger: active
  });
  if (!confirmed) return;

  try {
    await api(`/classes/${id}/status`, { method: "PUT", body: { active: !active } });
    await loadClasses();
    toast("Turma atualizada", active ? "A turma foi arquivada." : "A turma foi reativada.");
  } catch (error) {
    toast("Não foi possível atualizar", error.message, "error");
  }
}

function openClassDetails(id) {
  const item = state.classes.find(current => current.id === id);
  if (!item) return;

  const students = state.students.filter(student => student.class_id === id && student.active);
  setDetailModal({
    eyebrow: "Turma",
    title: item.name,
    subtitle: `${item.shift} · ${item.school_year}`,
    content: `
      <div class="detail-stat-grid">
        <div><strong>${students.length}</strong><span>alunos ativos</span></div>
        <div><strong>${item.active_loan_count}</strong><span>empréstimos</span></div>
        <div><strong>${item.overdue_count}</strong><span>atrasos</span></div>
        <div><strong>${escapeHTML(item.teacher_name || "—")}</strong><span>professor</span></div>
      </div>
      <section class="detail-section">
        <div class="detail-section__header"><h3>Alunos da turma</h3></div>
        ${students.length ? buildResponsiveTable({
          headers: ["Aluno", "Matrícula", "Chamada", "Situação", ""],
          rows: students.map(student => `
            <tr>
              <td>${personCell(student.full_name, student.guardian_contact || "Sem contato")}</td>
              <td>${escapeHTML(student.registration_number)}</td>
              <td>${student.roll_number || "—"}</td>
              <td>${student.overdue_loans > 0 ? statusBadge("Com pendência", "danger") : statusBadge("Regular", "success")}</td>
              <td>${tableActions([{ label: "Perfil", action: "view-student", id: student.id }])}</td>
            </tr>
          `),
          cards: students.map(student => mobileStudentSimpleCard(student))
        }) : emptyState("♙", "Nenhum aluno ativo", "A turma ainda não possui alunos cadastrados.")}
      </section>
    `
  });
}

async function loadStudents() {
  const response = await api("/students");
  state.students = response.students;
  renderStudents();
  updateAllSelectOptions();
}

function renderStudents() {
  const container = $("#students-container");
  if (!container) return;

  const search = normalize($("#student-search")?.value || "");
  const classId = $("#student-class-filter")?.value || "";
  const status = $("#student-status-filter")?.value || "active";

  const items = state.students.filter(item => {
    const searchable = normalize(`${item.full_name} ${item.registration_number} ${item.class_name || ""} ${item.guardian_contact || ""}`);
    const statusMatch = status === "all" ||
      (status === "active" && item.active) ||
      (status === "archived" && !item.active) ||
      (status === "pending" && item.active && Number(item.overdue_loans) > 0);

    return (!search || searchable.includes(search)) &&
      (!classId || item.class_id === classId) &&
      statusMatch;
  });

  if (!items.length) {
    container.innerHTML = emptyState("♙", "Nenhum aluno encontrado", "Cadastre alunos ou altere os filtros da pesquisa.");
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="student-card">
      <div class="student-card__header">
        <div class="card-identity">
          ${studentAvatar(item, "card-identity__avatar")}
          <span class="card-identity__copy">
            <strong>${escapeHTML(item.full_name)}</strong>
            <span>${escapeHTML(item.class_name || "Sem turma")} · ${escapeHTML(item.registration_number)}</span>
          </span>
        </div>
        ${item.active ?
          (Number(item.overdue_loans) > 0 ? statusBadge("Pendente", "danger") : statusBadge("Ativo", "success")) :
          statusBadge("Arquivado", "neutral")}
      </div>
      <div class="student-card__stats">
        <div><strong>${item.active_loans}</strong><span>ativos</span></div>
        <div><strong>${item.overdue_loans}</strong><span>atrasos</span></div>
        <div><strong>${item.total_loans}</strong><span>histórico</span></div>
      </div>
      <div class="card-detail-list">
        <div><span>Chamada</span><strong>${item.roll_number || "—"}</strong></div>
        <div><span>Contato</span><strong>${escapeHTML(item.guardian_contact || "Não informado")}</strong></div>
      </div>
      <div class="card-footer-actions">
        <button class="button button--secondary button--compact" data-action="view-student" data-id="${item.id}" type="button">Ver perfil</button>
        ${state.user?.role === "admin" ? (item.active ? `
          <button class="button button--secondary button--compact" data-action="edit-student" data-id="${item.id}" type="button">Editar</button>
          <button class="button button--ghost button--compact" data-action="archive-student" data-id="${item.id}" type="button">Arquivar</button>
        ` : `
          <button class="button button--secondary button--compact" data-action="reactivate-student" data-id="${item.id}" type="button">Reativar</button>
        `) : ""}
      </div>
    </article>
  `).join("");
}

async function handleSaveStudent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const id = payload.id;
  delete payload.id;

  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Salvando...");

  try {
    await api(id ? `/students/${id}` : "/students", {
      method: id ? "PUT" : "POST",
      body: payload
    });
    closeModal("student-modal");
    await Promise.all([loadStudents(), loadClasses(), loadDashboardSafe()]);
    toast("Aluno salvo", "O cadastro foi atualizado com sucesso.");
  } catch (error) {
    toast("Não foi possível salvar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

function editStudent(id) {
  const item = state.students.find(current => current.id === id);
  if (!item) return;

  const form = $("#student-form");
  form.reset();
  fillForm(form, item);
  updateStudentPhotoPreview(item.photo_url, item.full_name);
  $("#student-modal-title").textContent = "Editar aluno";
  openModal("student-modal");
}

async function archiveStudent(id) {
  const item = state.students.find(current => current.id === id);
  if (!item) return;

  const confirmed = await confirmAction({
    title: "Arquivar aluno?",
    message: `${item.full_name} continuará no histórico, mas não poderá receber novos empréstimos.`,
    acceptText: "Arquivar",
    danger: true
  });
  if (!confirmed) return;

  try {
    await api(`/students/${id}`, { method: "DELETE" });
    await Promise.all([loadStudents(), loadClasses(), loadDashboardSafe()]);
    toast("Aluno arquivado", "O histórico foi preservado.");
  } catch (error) {
    toast("Não foi possível arquivar", error.message, "error");
  }
}

async function reactivateStudent(id) {
  try {
    await api(`/students/${id}/status`, { method: "PUT", body: { active: true } });
    await loadStudents();
    toast("Aluno reativado", "O cadastro voltou a ficar disponível.");
  } catch (error) {
    toast("Não foi possível reativar", error.message, "error");
  }
}

async function openStudentDetails(id) {
  try {
    const response = await api(`/students/${id}`);
    const student = response.student;
    const activeLoans = response.active_loans || [];
    const history = response.history || [];
    const notices = response.notices || [];

    setDetailModal({
      eyebrow: "Perfil do aluno",
      title: student.full_name,
      subtitle: `${student.class_name || "Sem turma"} · matrícula ${student.registration_number}`,
      content: `
        <div class="detail-header-card">
          <span class="avatar">${initialsFromName(student.full_name)}</span>
          <div>
            <strong>${escapeHTML(student.full_name)}</strong>
            <span>${escapeHTML(student.class_name || "Sem turma")} · chamada ${student.roll_number || "—"}</span>
            <span>Contato: ${escapeHTML(student.guardian_contact || "não informado")}</span>
          </div>
        </div>
        <div class="detail-stat-grid">
          <div><strong>${activeLoans.length}</strong><span>empréstimos ativos</span></div>
          <div><strong>${activeLoans.filter(item => derivedLoanStatus(item) === "overdue").length}</strong><span>atrasos atuais</span></div>
          <div><strong>${history.length}</strong><span>movimentações</span></div>
          <div><strong>${notices.length}</strong><span>avisos registrados</span></div>
        </div>
        <section class="detail-section">
          <div class="detail-section__header">
            <h3>Empréstimos ativos</h3>
            ${student.active ? `<button class="button button--primary button--compact" data-open-modal="loan-modal" data-student-id="${student.id}" type="button">Novo empréstimo</button>` : ""}
          </div>
          ${activeLoans.length ? buildResponsiveTable({
            headers: ["Livro", "Retirada", "Prazo", "Situação", ""],
            rows: activeLoans.map(item => `
              <tr>
                <td>${bookCell(item.book_title, item.book_author, bookCoverUrl({ title: item.book_title, author: item.book_author, cover_url: item.cover_url }))}</td>
                <td>${formatDate(item.loan_date)}</td>
                <td>${formatDate(item.due_date)}</td>
                <td>${loanBadge(item)}</td>
                <td>${tableActions([
                  { label: "Detalhes", action: "view-loan", id: item.id },
                  { label: "Devolver", action: "return-loan", id: item.id }
                ])}</td>
              </tr>
            `),
            cards: activeLoans.map(item => mobileLoanCard(item))
          }) : inlineEmpty("O aluno não possui empréstimos ativos.")}
        </section>
        <section class="detail-section">
          <div class="detail-section__header"><h3>Histórico de leitura</h3></div>
          ${history.length ? buildResponsiveTable({
            headers: ["Livro", "Retirada", "Prazo", "Finalização", "Situação"],
            rows: history.slice(0, 25).map(item => `
              <tr>
                <td>${bookCell(item.book_title, item.book_author, bookCoverUrl({ title: item.book_title, author: item.book_author, cover_url: item.cover_url }))}</td>
                <td>${formatDate(item.loan_date)}</td>
                <td>${formatDate(item.due_date)}</td>
                <td>${item.returned_at ? formatDateTime(item.returned_at) : "—"}</td>
                <td>${loanBadge(item)}</td>
              </tr>
            `),
            cards: history.slice(0, 25).map(item => mobileLoanCard(item))
          }) : inlineEmpty("Ainda não existe histórico para este aluno.")}
        </section>
      `
    });
  } catch (error) {
    toast("Não foi possível abrir o perfil", error.message, "error");
  }
}

async function loadCategories() {
  const response = await api("/categories");
  state.categories = response.categories;
  updateAllSelectOptions();
}

async function loadBooks() {
  const response = await api("/books");
  state.books = response.books;
  renderBooks();
  updateAllSelectOptions();
}

function getFilteredBooks() {
  const search = normalize($("#book-search")?.value || "");
  const categoryId = $("#book-category-filter")?.value || "";
  const availability = $("#book-availability-filter")?.value || "";

  return state.books.filter(item => {
    const searchable = normalize(`${item.title} ${item.author} ${item.isbn || ""} ${item.publisher || ""} ${item.category_name || ""}`);
    const availabilityMatch = !availability ||
      (availability === "available" && Number(item.available_copies) > 0) ||
      (availability === "unavailable" && Number(item.available_copies) === 0) ||
      (availability === "attention" && Number(item.damaged_copies) + Number(item.lost_copies) + Number(item.maintenance_copies) > 0);

    return (!search || searchable.includes(search)) &&
      (!categoryId || item.category_id === categoryId) &&
      availabilityMatch;
  });
}

function renderBooks() {
  const container = $("#books-container");
  if (!container) return;

  const items = getFilteredBooks();
  container.classList.toggle("is-table-view", state.currentBookView === "table");

  $("#books-summary").innerHTML = [
    summaryChip("Títulos", items.length),
    summaryChip("Exemplares", sum(items, "total_copies")),
    summaryChip("Disponíveis", sum(items, "available_copies")),
    summaryChip("Emprestados", sum(items, "loaned_copies"))
  ].join("");

  if (!items.length) {
    container.innerHTML = emptyState("▤", "Nenhum livro encontrado", state.user?.role === "admin" ? "Cadastre um título ou ajuste os filtros." : "Ajuste os filtros ou peça ao administrador para atualizar o acervo.");
    return;
  }

  if (state.currentBookView === "table") {
    container.innerHTML = buildResponsiveTable({
      headers: ["Livro", "Categoria", "Localização", "Disponibilidade", "Conservação", ""],
      rows: items.map(item => `
        <tr>
          <td>${bookCell(item.title, item.author, bookCoverUrl(item), item.isbn)}</td>
          <td>${escapeHTML(item.category_name || "Sem categoria")}</td>
          <td>${escapeHTML(item.shelf || "Não informada")}</td>
          <td><strong>${item.available_copies}</strong> de ${item.total_copies}</td>
          <td>${Number(item.damaged_copies) + Number(item.lost_copies) > 0 ? statusBadge("Atenção", "warning") : statusBadge("Regular", "success")}</td>
          <td>${tableActions([
            { label: "Detalhes", action: "view-book", id: item.id },
            ...(state.user?.role === "admin" ? [{ label: "Editar", action: "edit-book", id: item.id }] : []),
            { label: "Emprestar", action: "loan-book", id: item.id, disabled: Number(item.available_copies) === 0 }
          ])}</td>
        </tr>
      `),
      cards: items.map(item => mobileBookTableCard(item))
    });
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="book-card">
      <div class="book-card__cover">
        <img loading="lazy" src="${escapeAttribute(bookCoverUrl(item))}" alt="Capa de ${escapeAttribute(item.title)}" onerror="this.onerror=null;this.src='${escapeAttribute(fallbackCoverUrl(item))}'">
        <span class="book-card__status">${Number(item.available_copies) > 0 ? statusBadge("Disponível", "success") : statusBadge("Indisponível", "danger")}</span>
      </div>
      <div class="book-card__body">
        <h3>${escapeHTML(item.title)}</h3>
        <p class="book-card__author">${escapeHTML(item.author)}</p>
        <div class="book-card__meta">
          <div><span>Disponibilidade</span><strong>${item.available_copies}/${item.total_copies}</strong></div>
          <div><span>Categoria</span><strong>${escapeHTML(item.category_name || "Sem categoria")}</strong></div>
          <div><span>Estante</span><strong>${escapeHTML(item.shelf || "—")}</strong></div>
        </div>
        <div class="book-card__actions">
          <button class="button button--secondary" data-action="view-book" data-id="${item.id}" type="button">Detalhes</button>
          <button class="button button--primary" data-action="loan-book" data-id="${item.id}" type="button" ${Number(item.available_copies) === 0 ? "disabled" : ""}>Emprestar</button>
        </div>
      </div>
    </article>
  `).join("");

}

async function handleSaveBook(event) {
  event.preventDefault();
  if (state.user?.role !== "admin") return toast("Acesso restrito", "Somente o administrador pode cadastrar ou editar livros.", "warning");
  const form = event.currentTarget;
  const payload = formToObject(form);
  const id = payload.id;
  delete payload.id;

  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Salvando...");

  try {
    await api(id ? `/books/${id}` : "/books", {
      method: id ? "PUT" : "POST",
      body: payload
    });
    closeModal("book-modal");
    await Promise.all([loadBooks(), loadCopiesSafe(), loadDashboardSafe()]);
    toast("Livro salvo", "O catálogo e os exemplares foram atualizados.");
  } catch (error) {
    toast("Não foi possível salvar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

function editBook(id) {
  if (state.user?.role !== "admin") return toast("Acesso restrito", "Somente o administrador pode editar livros.", "warning");
  const item = state.books.find(current => current.id === id);
  if (!item) return;

  const form = $("#book-form");
  form.reset();
  fillForm(form, {
    ...item,
    quantity: item.total_copies
  });
  $("#book-modal-title").textContent = "Editar livro";
  updateBookCoverPreview();
  openModal("book-modal");
}

async function archiveBook(id) {
  const item = state.books.find(current => current.id === id);
  if (!item) return;

  const confirmed = await confirmAction({
    title: "Arquivar livro?",
    message: `O título “${item.title}” deixará de aparecer no catálogo ativo. O histórico será mantido.`,
    acceptText: "Arquivar",
    danger: true
  });
  if (!confirmed) return;

  try {
    await api(`/books/${id}`, { method: "DELETE" });
    closeModal("detail-modal");
    await Promise.all([loadBooks(), loadCopiesSafe(), loadDashboardSafe()]);
    toast("Livro arquivado", "O histórico do título foi preservado.");
  } catch (error) {
    toast("Não foi possível arquivar", error.message, "error");
  }
}

async function openBookDetails(id) {
  try {
    const response = await api(`/books/${id}`);
    const book = response.book;
    const copies = response.copies || [];
    const recentLoans = response.recent_loans || [];

    setDetailModal({
      eyebrow: "Detalhes do livro",
      title: book.title,
      subtitle: `${book.author} · ${book.category_name || "Sem categoria"}`,
      content: `
        <div class="detail-header-card">
          <span class="table-book__cover" style="width:64px;height:88px;border-radius:11px">
            <img src="${escapeAttribute(bookCoverUrl(book))}" alt="Capa de ${escapeAttribute(book.title)}" loading="lazy">
          </span>
          <div>
            <strong>${escapeHTML(book.title)}</strong>
            <span>${escapeHTML(book.author)}</span>
            <span>ISBN: ${escapeHTML(book.isbn || "não informado")} · ${escapeHTML(book.shelf || "sem localização")}</span>
          </div>
        </div>
        <div class="detail-stat-grid">
          <div><strong>${book.total_copies}</strong><span>exemplares</span></div>
          <div><strong>${book.available_copies}</strong><span>disponíveis</span></div>
          <div><strong>${book.loaned_copies}</strong><span>emprestados</span></div>
          <div><strong>${book.total_loan_count}</strong><span>empréstimos totais</span></div>
        </div>
        <section class="detail-section">
          <div class="detail-section__header">
            <h3>Exemplares</h3>
            ${state.user?.role === "admin" ? `<button class="button button--primary button--compact" data-open-modal="copy-modal" data-book-id="${book.id}" type="button">Adicionar exemplar</button>` : ""}
          </div>
          ${copies.length ? buildResponsiveTable({
            headers: ["Patrimônio", "Situação", "Aquisição", "Observação", ""],
            rows: copies.map(copy => `
              <tr>
                <td><strong>${escapeHTML(copy.inventory_code)}</strong></td>
                <td>${copyBadge(copy.status)}</td>
                <td>${formatDate(copy.acquired_at)}</td>
                <td>${escapeHTML(copy.condition_notes || "—")}</td>
                <td>${state.user?.role === "admin" ? tableActions([{ label: "Alterar", action: "edit-copy", id: copy.id }]) : "—"}</td>
              </tr>
            `),
            cards: copies.map(copy => mobileCopyCard(copy))
          }) : inlineEmpty("Nenhum exemplar cadastrado.")}
        </section>
        <section class="detail-section">
          <div class="detail-section__header"><h3>Movimentações recentes</h3></div>
          ${recentLoans.length ? buildResponsiveTable({
            headers: ["Aluno", "Turma", "Retirada", "Prazo", "Situação"],
            rows: recentLoans.map(item => `
              <tr>
                <td>${escapeHTML(item.student_name)}</td>
                <td>${escapeHTML(item.class_name || "—")}</td>
                <td>${formatDate(item.loan_date)}</td>
                <td>${formatDate(item.due_date)}</td>
                <td>${loanBadge(item)}</td>
              </tr>
            `),
            cards: recentLoans.map(item => mobileLoanCard(item))
          }) : inlineEmpty("O título ainda não possui movimentações.")}
        </section>
        <div class="card-footer-actions" style="margin-top:22px">
          ${state.user?.role === "admin" ? `<button class="button button--secondary" data-action="edit-book" data-id="${book.id}" type="button">Editar livro</button>` : ""}
          <button class="button button--primary" data-action="loan-book" data-id="${book.id}" type="button" ${Number(book.available_copies) === 0 ? "disabled" : ""}>Registrar empréstimo</button>
          ${state.user.role === "admin" ? `<button class="button button--danger" data-action="archive-book" data-id="${book.id}" type="button">Arquivar livro</button>` : ""}
        </div>
      `
    });
  } catch (error) {
    toast("Não foi possível abrir o livro", error.message, "error");
  }
}

function prepareLoanForBook(id) {
  closeModal("detail-modal");
  openModal("loan-modal");
  $("#loan-book").value = id;
}

function prepareReservationForBook(id) {
  closeModal("detail-modal");
  openModal("reservation-modal");
  $("#reservation-book").value = id;
}


const BOOK_COVER_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2228%22%20fill%3D%22%23f2efe7%22%2F%3E%3Crect%20x%3D%2264%22%20y%3D%2268%22%20width%3D%22292%22%20height%3D%22504%22%20rx%3D%2222%22%20fill%3D%22%23ffffff%22%20stroke%3D%22%23d7d2c7%22%20stroke-width%3D%225%22%2F%3E%3Cpath%20d%3D%22M132%20204c40-22%2078-19%2078-19v246s-38-4-78%2018V204Zm156%200c-40-22-78-19-78-19v246s38-4%2078%2018V204Z%22%20fill%3D%22%23dcebe6%22%20stroke%3D%22%23176b63%22%20stroke-width%3D%228%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M210%20186v246%22%20stroke%3D%22%23176b63%22%20stroke-width%3D%228%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%22210%22%20y%3D%22520%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2222%22%20fill%3D%22%2366736f%22%3ECapa%20indispon%C3%ADvel%3C%2Ftext%3E%3C%2Fsvg%3E";

function normalizeCoverValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LOCAL_BOOK_COVERS = new Map([
  ["turma da monica lacos::vitor e lu cafaggi", "data:image/jpeg;base64,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"],
  ["turma da monica lacos::vitor cafaggi e lu cafaggi", "data:image/jpeg;base64,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"],
  ["uma breve historia do tempo::stephen hawking", "data:image/jpeg;base64,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"],
  ["watchmen::alan moore e dave gibbons", "data:image/webp;base64,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"],
  ["watchmen::alan moore", "data:image/webp;base64,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"],
  ["dom casmurro::machado de assis", "assets/covers/dom-casmurro.jpg"],
  ["crime e castigo::fiodor dostoievski", "assets/covers/crime-e-castigo.jpg"],
  ["crime e castigo::fiódor dostoiévski", "assets/covers/crime-e-castigo.jpg"],
  ["vidas secas::graciliano ramos", "assets/covers/vidas-secas.jpg"]
]);

function bookCoverKey(title, author = "") {
  return `${normalizeCoverValue(title)}::${normalizeCoverValue(author)}`;
}

function getLocalBookCover(title, author = "") {
  const exactKey = bookCoverKey(title, author);
  if (LOCAL_BOOK_COVERS.has(exactKey)) return LOCAL_BOOK_COVERS.get(exactKey);

  const normalizedTitle = normalizeCoverValue(title);
  for (const [key, value] of LOCAL_BOOK_COVERS.entries()) {
    if (key.startsWith(`${normalizedTitle}::`)) return value;
  }

  return "";
}

function isValidStoredCover(url) {
  const value = String(url || "").trim();

  return (
    value.startsWith("assets/") ||
    value.startsWith("data:image/jpeg") ||
    value.startsWith("data:image/png") ||
    value.startsWith("data:image/webp") ||
    (value.startsWith("data:image/svg+xml") && !value.includes("BOOKSHARE%20%E2%80%A2%20ACERVO%20ESCOLAR")) ||
    (
      /^https:\/\//i.test(value) &&
      !value.includes("/api/public/book-cover")
    )
  );
}

function remoteBookCoverUrl(title, author = "") {
  const query = new URLSearchParams({
    title: String(title || "").trim(),
    author: String(author || "").trim(),
    v: "19"
  });

  return `${CONFIG.API_BASE_URL}/public/book-cover?${query.toString()}`;
}

function bookCoverUrl(item) {
  const title = item?.title || item?.book_title || "";
  const author = item?.author || item?.book_author || "";

  // Capas verificadas localmente sempre vencem links quebrados do banco.
  const localCover = getLocalBookCover(title, author);
  if (localCover) return localCover;

  const storedCover = String(item?.cover_url || "").trim();
  if (isValidStoredCover(storedCover)) return storedCover;

  return remoteBookCoverUrl(title, author);
}

function fallbackCoverUrl(item = {}) {
  const title = item?.title || item?.book_title || "";
  const author = item?.author || item?.book_author || "";

  const localCover = getLocalBookCover(title, author);
  if (localCover) return localCover;

  if (title) {
    const query = new URLSearchParams({ title, author, v: "19", retry: "1" });
    return `${CONFIG.API_BASE_URL}/public/book-cover?${query.toString()}`;
  }

  return BOOK_COVER_PLACEHOLDER;
}

function initializeBookCoverHydration() {
  // As capas agora são carregadas diretamente pelo endpoint público do Render.
}

function studentAvatar(item, className = "") {
  if (item?.photo_url) {
    return `<span class="${className} has-photo"><img src="${escapeAttribute(item.photo_url)}" alt="Foto de ${escapeAttribute(item.full_name || "aluno")}" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="${className}">${initialsFromName(item?.full_name || "Aluno")}</span>`;
}

async function resizeImageFile(file, maxWidth, maxHeight, quality = 0.8) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Selecione uma imagem válida.");
  if (file.size > 12 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 12 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
      img.src = objectUrl;
    });

    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function handleBookCoverFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageFile(file, 720, 1080, 0.82);
    $("#book-cover-url").value = dataUrl;
    updateBookCoverPreview();
    toast("Capa preparada", "A imagem será salva junto ao livro.");
  } catch (error) {
    toast("Não foi possível usar a capa", error.message, "error");
  } finally {
    event.target.value = "";
  }
}

async function handleStudentPhotoSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageFile(file, 420, 420, 0.82);
    $("#student-photo-url").value = dataUrl;
    updateStudentPhotoPreview(dataUrl, $("#student-form [name='full_name']").value || "Aluno");
    toast("Foto preparada", "A imagem será salva no perfil do aluno.");
  } catch (error) {
    toast("Não foi possível usar a foto", error.message, "error");
  } finally {
    event.target.value = "";
  }
}

function updateStudentPhotoPreview(url = "", name = "Aluno") {
  const preview = $("#student-photo-preview");
  if (!preview) return;
  preview.innerHTML = url
    ? `<img src="${escapeAttribute(url)}" alt="Foto de ${escapeAttribute(name)}">`
    : initialsFromName(name);
}

function updateBookCoverPreview() {
  const url = $("#book-cover-url").value.trim();
  const preview = $("#book-cover-preview");
  preview.querySelector("img")?.remove();

  if (url) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = "Prévia da capa";
    image.addEventListener("error", () => image.remove());
    preview.appendChild(image);
  }
}

async function loadCopies() {
  const response = await api("/copies");
  state.copies = response.copies;
  renderCopies();
}

async function loadCopiesSafe() {
  if (state.currentRoute === "exemplares" || state.copies.length) await loadCopies();
}

function renderCopies() {
  const container = $("#copies-container");
  if (!container) return;

  const search = normalize($("#copy-search")?.value || "");
  const status = $("#copy-status-filter")?.value || "";

  const items = state.copies.filter(item => {
    const searchable = normalize(`${item.inventory_code} ${item.book_title} ${item.book_author}`);
    return (!search || searchable.includes(search)) && (!status || item.status === status);
  });

  if (!items.length) {
    container.innerHTML = emptyState("▥", "Nenhum exemplar encontrado", "Adicione exemplares ou altere os filtros.");
    return;
  }

  container.innerHTML = buildResponsiveTable({
    headers: ["Patrimônio", "Livro", "Situação", "Aquisição", "Observação", ""],
    rows: items.map(item => `
      <tr>
        <td><span class="table-primary">${escapeHTML(item.inventory_code)}</span><span class="table-secondary">${escapeHTML(item.id.slice(0, 8))}</span></td>
        <td>${bookCell(item.book_title, item.book_author, bookCoverUrl({ title: item.book_title, author: item.book_author, cover_url: item.cover_url }))}</td>
        <td>${copyBadge(item.status)}</td>
        <td>${formatDate(item.acquired_at)}</td>
        <td>${escapeHTML(item.condition_notes || "—")}</td>
        <td>${tableActions([{ label: "Alterar", action: "edit-copy", id: item.id }])}</td>
      </tr>
    `),
    cards: items.map(item => mobileCopyCard(item))
  });
}

async function handleCreateCopies(event) {
  event.preventDefault();
  if (state.user?.role !== "admin") return toast("Acesso restrito", "Somente o administrador pode adicionar exemplares.", "warning");
  const form = event.currentTarget;
  const payload = formToObject(form);
  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Adicionando...");

  try {
    await api("/copies", { method: "POST", body: payload });
    closeModal("copy-modal");
    await Promise.all([loadBooks(), loadCopies(), loadDashboardSafe()]);
    toast("Exemplar adicionado", "O patrimônio já está disponível no acervo.");
  } catch (error) {
    toast("Não foi possível adicionar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

async function editCopyStatus(id) {
  if (state.user?.role !== "admin") return toast("Acesso restrito", "Somente o administrador pode alterar exemplares.", "warning");
  const item = state.copies.find(current => current.id === id) || { id };
  const options = ["available", "maintenance", "damaged", "lost"];
  const input = prompt(
    `Nova situação do exemplar:\n${options.map(option => `${option} = ${copyStatusLabels[option]}`).join("\n")}`,
    item.status || "available"
  );
  if (!input) return;

  const status = normalize(input);
  if (!options.includes(status)) {
    toast("Situação inválida", "Use available, maintenance, damaged ou lost.", "warning");
    return;
  }

  const notes = prompt("Observação sobre a situação do exemplar:", item.condition_notes || "") ?? "";

  try {
    await api(`/copies/${id}/status`, { method: "PUT", body: { status, condition_notes: notes } });
    await Promise.all([loadCopies(), loadBooks(), loadDashboardSafe()]);
    toast("Exemplar atualizado", `Nova situação: ${copyStatusLabels[status]}.`);
  } catch (error) {
    toast("Não foi possível atualizar", error.message, "error");
  }
}

async function loadLoans() {
  const response = await api("/loans");
  state.loans = response.loans;
  renderLoans();
}

function getFilteredLoans() {
  const search = normalize($("#loan-search")?.value || "");
  const classId = $("#loan-class-filter")?.value || "";
  const start = $("#loan-start-date")?.value || "";
  const end = $("#loan-end-date")?.value || "";

  return state.loans.filter(item => {
    const searchable = normalize(`${item.student_name} ${item.registration_number || ""} ${item.class_name || ""} ${item.book_title} ${item.inventory_code || ""}`);
    const derivedStatus = derivedLoanStatus(item);
    const tabMatch = state.currentLoanTab === "all" || derivedStatus === state.currentLoanTab;
    const date = String(item.loan_date).slice(0, 10);

    return (!search || searchable.includes(search)) &&
      (!classId || item.class_id === classId) &&
      (!start || date >= start) &&
      (!end || date <= end) &&
      tabMatch;
  });
}

function renderLoans() {
  const container = $("#loans-container");
  if (!container) return;

  const items = getFilteredLoans();
  $("#loans-summary").innerHTML = [
    summaryChip("Exibidos", items.length),
    summaryChip("Ativos", items.filter(item => derivedLoanStatus(item) === "active").length),
    summaryChip("Atrasados", items.filter(item => derivedLoanStatus(item) === "overdue").length),
    summaryChip("Devolvidos", items.filter(item => item.status === "returned").length)
  ].join("");

  if (!items.length) {
    container.innerHTML = emptyState("⇄", "Nenhum empréstimo encontrado", "Registre um empréstimo ou altere os filtros.");
    return;
  }

  container.innerHTML = buildResponsiveTable({
    headers: ["Aluno", "Livro / exemplar", "Retirada", "Prazo", "Situação", "Renovações", ""],
    rows: items.map(item => `
      <tr>
        <td>${personCell(item.student_name, `${item.class_name || "Sem turma"} · ${item.registration_number || ""}`)}</td>
        <td>${bookCell(item.book_title, item.inventory_code, bookCoverUrl({ title: item.book_title, author: item.book_author, cover_url: item.cover_url }))}</td>
        <td>${formatDate(item.loan_date)}</td>
        <td>${formatDate(item.due_date)}</td>
        <td>${loanBadge(item)}</td>
        <td>${item.renewal_count || 0}</td>
        <td>${tableActions([
          { label: "Detalhes", action: "view-loan", id: item.id },
          ...(item.status === "active" ? [{ label: "Devolver", action: "return-loan", id: item.id }] : [])
        ])}</td>
      </tr>
    `),
    cards: items.map(item => mobileLoanCard(item))
  });
}

async function handleCreateLoan(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  if (form.dataset.reservationId) payload.reservation_id = form.dataset.reservationId;
  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Registrando...");

  try {
    await api("/loans", { method: "POST", body: payload });
    closeModal("loan-modal");
    await refreshCirculationData();
    toast("Empréstimo registrado", "O exemplar foi vinculado ao aluno e retirado da disponibilidade.");
  } catch (error) {
    toast("Não foi possível emprestar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

async function openLoanDetails(id) {
  try {
    const response = await api(`/loans/${id}`);
    const item = response.loan;
    const notices = response.notices || [];

    setDetailModal({
      eyebrow: "Empréstimo",
      title: item.book_title,
      subtitle: `${item.student_name} · ${item.class_name || "Sem turma"}`,
      content: `
        <div class="detail-stat-grid">
          <div><strong>${formatDate(item.loan_date)}</strong><span>retirada</span></div>
          <div><strong>${formatDate(item.due_date)}</strong><span>prazo</span></div>
          <div><strong>${item.renewal_count || 0}</strong><span>renovações</span></div>
          <div><strong>${escapeHTML(item.inventory_code)}</strong><span>patrimônio</span></div>
        </div>
        <section class="detail-section">
          <div class="card-detail-list">
            <div><span>Aluno</span><strong>${escapeHTML(item.student_name)}</strong></div>
            <div><span>Matrícula</span><strong>${escapeHTML(item.registration_number || "—")}</strong></div>
            <div><span>Turma</span><strong>${escapeHTML(item.class_name || "—")}</strong></div>
            <div><span>Situação</span><strong>${statusLabel(derivedLoanStatus(item))}</strong></div>
            <div><span>Registrado por</span><strong>${escapeHTML(item.created_by_name || "—")}</strong></div>
            <div><span>Observações</span><strong>${escapeHTML(item.notes || "—")}</strong></div>
          </div>
        </section>
        <section class="detail-section">
          <div class="detail-section__header"><h3>Histórico de avisos</h3></div>
          ${notices.length ? notices.map(notice => `
            <div class="timeline-item" style="padding-left:0">
              <div class="timeline-item__content">
                <strong>${escapeHTML(notice.channel)} · ${escapeHTML(notice.result || "Avisado")}</strong>
                <p>${escapeHTML(notice.notes || "Sem observações")}</p>
                <small>${formatDateTime(notice.created_at)} por ${escapeHTML(notice.created_by_name)}</small>
              </div>
            </div>
          `).join("") : inlineEmpty("Nenhum aviso registrado.")}
        </section>
        ${item.status === "active" ? `
          <div class="card-footer-actions" style="margin-top:20px">
            <button class="button button--primary" data-action="return-loan" data-id="${item.id}" type="button">Registrar devolução</button>
            <button class="button button--secondary" data-action="renew-loan" data-id="${item.id}" type="button">Renovar prazo</button>
            <button class="button button--secondary" data-action="notice-loan" data-id="${item.id}" type="button">Registrar aviso</button>
          </div>
        ` : ""}
      `
    });
  } catch (error) {
    toast("Não foi possível abrir", error.message, "error");
  }
}

function prepareReturnLoan(id) {
  const item = state.loans.find(current => current.id === id) || state.pending.find(current => current.id === id);
  if (!item) {
    toast("Empréstimo não encontrado", "Atualize os dados e tente novamente.", "error");
    return;
  }

  closeModal("return-search-modal");
  closeModal("detail-modal");

  const form = $("#return-form");
  form.reset();
  form.elements.loan_id.value = id;
  $("#return-modal-description").textContent = `${item.student_name} · ${item.book_title}`;
  $("#return-loan-preview").innerHTML = `
    <strong>${escapeHTML(item.book_title)}</strong>
    <span>${escapeHTML(item.student_name)} · patrimônio ${escapeHTML(item.inventory_code || "—")} · prazo ${formatDate(item.due_date)}</span>
  `;
  openModal("return-modal");
}

async function handleReturnLoan(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const id = payload.loan_id;
  delete payload.loan_id;

  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Finalizando...");

  try {
    await api(`/loans/${id}/return`, { method: "PUT", body: payload });
    closeModal("return-modal");
    await refreshCirculationData();
    toast("Devolução registrada", "O empréstimo e a situação do exemplar foram atualizados.");
  } catch (error) {
    toast("Não foi possível devolver", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

async function renewLoan(id) {
  const defaultDays = Number(state.settings?.renewal_days || 7);
  const input = prompt("Quantidade de dias para a renovação:", String(defaultDays));
  if (input === null) return;

  const days = Number(input);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    toast("Prazo inválido", "Informe uma quantidade entre 1 e 90 dias.", "warning");
    return;
  }

  try {
    await api(`/loans/${id}/renew`, { method: "PUT", body: { days } });
    closeModal("detail-modal");
    await refreshCirculationData();
    toast("Prazo renovado", `O empréstimo recebeu mais ${days} dia(s).`);
  } catch (error) {
    toast("Não foi possível renovar", error.message, "error");
  }
}

async function refreshCirculationData() {
  await Promise.all([
    loadLoans(),
    loadBooks(),
    loadPending(),
    loadReservations(),
    loadDashboardSafe(),
    loadCopiesSafe()
  ]);
  buildNotifications();
}

async function loadPending() {
  const response = await api("/pending");
  state.pending = response.pending;
  renderPending();
  updateNavigationCounters();
}

function renderPending() {
  const container = $("#pending-container");
  if (!container) return;

  const search = normalize($("#pending-search")?.value || "");
  const minimumDays = Number($("#pending-days-filter")?.value || 0);
  const contactFilter = $("#pending-contact-filter")?.value || "all";

  const items = state.pending.filter(item => {
    const searchable = normalize(`${item.student_name} ${item.registration_number || ""} ${item.class_name || ""} ${item.book_title}`);
    const contactMatch = contactFilter === "all" ||
      (contactFilter === "contacted" && Number(item.notice_count) > 0) ||
      (contactFilter === "not-contacted" && Number(item.notice_count) === 0);

    return (!search || searchable.includes(search)) &&
      Number(item.overdue_days) >= minimumDays &&
      contactMatch;
  });

  $("#pending-total-count").textContent = state.pending.length;
  $("#pending-without-notice-count").textContent = state.pending.filter(item => Number(item.notice_count) === 0).length;
  $("#pending-critical-count").textContent = state.pending.filter(item => Number(item.overdue_days) >= 15).length;

  if (!items.length) {
    container.innerHTML = emptyState("✓", "Nenhuma pendência encontrada", "Todos os empréstimos filtrados estão dentro do prazo.");
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="pending-card ${Number(item.overdue_days) >= 15 ? "is-critical" : ""}">
      <div class="pending-card__header">
        <div class="card-identity">
          <span class="card-identity__avatar">${initialsFromName(item.student_name)}</span>
          <span class="card-identity__copy">
            <strong>${escapeHTML(item.student_name)}</strong>
            <span>${escapeHTML(item.class_name || "Sem turma")} · ${escapeHTML(item.registration_number || "")}</span>
          </span>
        </div>
        <div class="pending-days">
          <strong>${item.overdue_days}</strong>
          <span>dia(s)</span>
        </div>
      </div>
      <div class="card-detail-list">
        <div><span>Livro</span><strong>${escapeHTML(item.book_title)}</strong></div>
        <div><span>Patrimônio</span><strong>${escapeHTML(item.inventory_code)}</strong></div>
        <div><span>Prazo</span><strong>${formatDate(item.due_date)}</strong></div>
        <div><span>Avisos</span><strong>${item.notice_count || 0}</strong></div>
        <div><span>Último contato</span><strong>${item.last_notice_at ? formatDateTime(item.last_notice_at) : "Não avisado"}</strong></div>
      </div>
      <div class="pending-message">${escapeHTML(truncate(buildNoticeMessage(item), 150))}</div>
      <div class="card-footer-actions">
        <button class="button button--secondary button--compact" data-action="copy-notice" data-id="${item.id}" type="button">Copiar mensagem</button>
        <button class="button button--secondary button--compact" data-action="notice-loan" data-id="${item.id}" type="button">Registrar aviso</button>
        <button class="button button--primary button--compact" data-action="return-loan" data-id="${item.id}" type="button">Devolver</button>
      </div>
    </article>
  `).join("");
}

function prepareNotice(id) {
  const item = state.pending.find(current => current.id === id) || state.loans.find(current => current.id === id);
  if (!item) return;

  state.selectedNoticeLoan = item;
  const form = $("#notice-form");
  form.reset();
  form.elements.loan_id.value = id;
  $("#notice-message-preview").textContent = buildNoticeMessage(item);
  closeModal("detail-modal");
  openModal("notice-modal");
}

async function handleSaveNotice(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const id = payload.loan_id;
  delete payload.loan_id;

  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Registrando...");

  try {
    await api(`/loans/${id}/notices`, { method: "POST", body: payload });
    closeModal("notice-modal");
    await Promise.all([loadPending(), loadLoans()]);
    toast("Contato registrado", "O histórico da pendência foi atualizado.");
  } catch (error) {
    toast("Não foi possível registrar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

async function copyNotice(id) {
  const item = state.pending.find(current => current.id === id) || state.loans.find(current => current.id === id);
  if (!item) return;
  await copyText(buildNoticeMessage(item), "Mensagem de cobrança copiada.");
}

async function copyCurrentNoticeMessage() {
  if (!state.selectedNoticeLoan) return;
  await copyText(buildNoticeMessage(state.selectedNoticeLoan), "Mensagem de cobrança copiada.");
}

function buildNoticeMessage(item) {
  const template = state.settings?.notice_template ||
    "Olá, informamos que o aluno {aluno}, da turma {turma}, está com o livro “{livro}” em atraso desde {data}. O atraso é de {dias} dia(s). Pedimos a devolução à biblioteca da {escola}.";

  const days = item.overdue_days ?? Math.max(0, dateDifference(startOfToday(), parseDate(item.due_date)));
  return template
    .replaceAll("{aluno}", item.student_name || "")
    .replaceAll("{turma}", item.class_name || "")
    .replaceAll("{livro}", item.book_title || "")
    .replaceAll("{data}", formatDate(item.due_date))
    .replaceAll("{dias}", String(days))
    .replaceAll("{escola}", state.settings?.school_name || "escola");
}

async function loadReservations() {
  const response = await api("/reservations");
  state.reservations = response.reservations;
  renderReservations();
  updateNavigationCounters();
}

function renderReservations() {
  const container = $("#reservations-container");
  if (!container) return;

  const search = normalize($("#reservation-search")?.value || "");
  const status = $("#reservation-status-filter")?.value || "active";

  const items = state.reservations.filter(item => {
    const searchable = normalize(`${item.student_name} ${item.class_name || ""} ${item.book_title} ${item.registration_number || ""}`);
    const statusMatch = status === "all" || item.status === status;
    return (!search || searchable.includes(search)) && statusMatch;
  });

  if (!items.length) {
    container.innerHTML = emptyState("◇", "Nenhuma reserva encontrada", "Registre uma reserva ou altere os filtros.");
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="reservation-card">
      <div class="reservation-card__header">
        <div class="card-identity">
          <span class="card-identity__avatar">${initialsFromName(item.student_name)}</span>
          <span class="card-identity__copy">
            <strong>${escapeHTML(item.student_name)}</strong>
            <span>${escapeHTML(item.class_name || "Sem turma")}</span>
          </span>
        </div>
        ${reservationBadge(item.status)}
      </div>
      <div class="card-detail-list">
        <div><span>Livro</span><strong>${escapeHTML(item.book_title)}</strong></div>
        <div><span>Posição</span><strong>${item.queue_position || "—"}º na fila</strong></div>
        <div><span>Solicitada</span><strong>${formatDate(item.created_at)}</strong></div>
        <div><span>Validade</span><strong>${item.expires_at ? formatDate(item.expires_at) : "Aguardando exemplar"}</strong></div>
      </div>
      <div class="card-footer-actions">
        ${item.status === "active" && Number(item.available_copies) > 0 ? `<button class="button button--secondary button--compact" data-action="ready-reservation" data-id="${item.id}" type="button">Marcar disponível</button>` : ""}
        ${item.status === "ready" ? `
          <button class="button button--secondary button--compact" data-action="copy-reservation" data-id="${item.id}" type="button">Copiar aviso</button>
          <button class="button button--primary button--compact" data-action="fulfill-reservation" data-id="${item.id}" type="button">Emprestar</button>
        ` : ""}
        ${["active", "ready"].includes(item.status) ? `<button class="button button--ghost button--compact" data-action="cancel-reservation" data-id="${item.id}" type="button">Cancelar</button>` : ""}
      </div>
    </article>
  `).join("");
}

async function handleCreateReservation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Criando...");

  try {
    await api("/reservations", { method: "POST", body: payload });
    closeModal("reservation-modal");
    await Promise.all([loadReservations(), loadDashboardSafe()]);
    toast("Reserva registrada", "O aluno foi colocado na fila do título.");
  } catch (error) {
    toast("Não foi possível reservar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

async function cancelReservation(id) {
  const confirmed = await confirmAction({
    title: "Cancelar reserva?",
    message: "A reserva será removida da fila de espera.",
    acceptText: "Cancelar reserva",
    danger: true
  });
  if (!confirmed) return;

  try {
    await api(`/reservations/${id}/cancel`, { method: "PUT" });
    await Promise.all([loadReservations(), loadDashboardSafe()]);
    toast("Reserva cancelada", "A fila foi atualizada.");
  } catch (error) {
    toast("Não foi possível cancelar", error.message, "error");
  }
}

async function markReservationReady(id) {
  try {
    await api(`/reservations/${id}/ready`, { method: "PUT" });
    await Promise.all([loadReservations(), loadDashboardSafe()]);
    toast("Reserva disponível", "O prazo para retirada foi iniciado.");
  } catch (error) {
    toast("Não foi possível atualizar", error.message, "error");
  }
}

async function fulfillReservation(id) {
  const item = state.reservations.find(current => current.id === id);
  if (!item) return;

  openModal("loan-modal");
  $("#loan-student").value = item.student_id;
  $("#loan-book").value = item.book_id;
  $("#loan-form").dataset.reservationId = item.id;
  updateLoanStudentPreview();
}

async function copyReservationMessage(id) {
  const item = state.reservations.find(current => current.id === id);
  if (!item) return;

  const template = state.settings?.reservation_template ||
    "Olá, {aluno}. O livro “{livro}” reservado para você está disponível na biblioteca da {escola} até {validade}.";

  const message = template
    .replaceAll("{aluno}", item.student_name || "")
    .replaceAll("{turma}", item.class_name || "")
    .replaceAll("{livro}", item.book_title || "")
    .replaceAll("{validade}", formatDate(item.expires_at))
    .replaceAll("{escola}", state.settings?.school_name || "escola");

  await copyText(message, "Mensagem de reserva copiada.");
}

function prepareReservationForStudent(studentId) {
  openModal("reservation-modal");
  $("#reservation-student").value = studentId;
}

async function loadActivities() {
  const response = await api("/activity?limit=150");
  state.activities = response.activities;
  renderActivities();
}

function renderActivities() {
  const container = $("#activity-container");
  if (!container) return;

  const search = normalize($("#activity-search")?.value || "");
  const type = $("#activity-type-filter")?.value || "";

  const items = state.activities.filter(item => {
    const searchable = normalize(`${item.user_name || "Sistema"} ${item.action} ${item.entity_type} ${JSON.stringify(item.details || {})}`);
    return (!search || searchable.includes(search)) && (!type || item.entity_type === type);
  });

  if (!items.length) {
    container.innerHTML = emptyState("↻", "Nenhuma atividade encontrada", "As ações importantes aparecerão nesta linha do tempo.");
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="timeline-item">
      <span class="timeline-item__icon">${activityIcon(item.entity_type)}</span>
      <div class="timeline-item__content">
        <strong>${escapeHTML(item.user_name || "Sistema")} ${escapeHTML(actionLabels[item.action] || item.action)} ${escapeHTML((entityLabels[item.entity_type] || item.entity_type).toLowerCase())}</strong>
        <p>${escapeHTML(activityDescription(item))}</p>
        <small>${formatDateTime(item.created_at)}</small>
      </div>
    </article>
  `).join("");
}

function activityDescription(item) {
  const details = item.details || {};
  const candidates = [
    details.title,
    details.full_name,
    details.name,
    details.student_name,
    details.book_title,
    details.email,
    item.entity_id
  ].filter(Boolean);

  return candidates.length
    ? `${entityLabels[item.entity_type] || item.entity_type}: ${candidates[0]}`
    : `Registro ${item.entity_id || "sem identificador"}`;
}

async function loadUsers() {
  if (state.user?.role !== "admin") return;
  const response = await api("/users");
  state.users = response.users;
  renderUsers();
}

function renderUsers() {
  const container = $("#users-container");
  if (!container || state.user?.role !== "admin") return;

  const search = normalize($("#user-search")?.value || "");
  const role = $("#user-role-filter")?.value || "";

  const items = state.users.filter(item => {
    const searchable = normalize(`${item.name} ${item.email}`);
    return (!search || searchable.includes(search)) && (!role || item.role === role);
  });

  if (!items.length) {
    container.innerHTML = emptyState("♟", "Nenhum usuário encontrado", "Crie contas para a equipe da biblioteca.");
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="user-card">
      <div class="user-card__header">
        <div class="card-identity">
          <span class="card-identity__avatar">${initialsFromName(item.name)}</span>
          <span class="card-identity__copy">
            <strong>${escapeHTML(item.name)}</strong>
            <span>${escapeHTML(item.email)}</span>
          </span>
        </div>
        ${item.active ? statusBadge("Ativo", "success") : statusBadge("Bloqueado", "danger")}
      </div>
      <div class="user-card__stats">
        <div><strong>${item.role === "admin" ? "ADM" : "BIB"}</strong><span>perfil</span></div>
        <div><strong>${item.action_count || 0}</strong><span>ações</span></div>
        <div><strong>${item.last_login_at ? formatRelativeTime(item.last_login_at) : "—"}</strong><span>último acesso</span></div>
      </div>
      <div class="card-detail-list">
        <div><span>Criado em</span><strong>${formatDate(item.created_at)}</strong></div>
        <div><span>Perfil</span><strong>${item.role === "admin" ? "Administrador" : "Bibliotecária"}</strong></div>
      </div>
      <div class="card-footer-actions">
        <button class="button button--secondary button--compact" data-action="reset-user-password" data-id="${item.id}" type="button">Redefinir senha</button>
        <button class="button button--ghost button--compact" data-action="toggle-user" data-id="${item.id}" data-active="${item.active}" type="button">${item.active ? "Bloquear" : "Ativar"}</button>
      </div>
    </article>
  `).join("");
}

async function handleCreateUser(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Criando...");

  try {
    await api("/users", { method: "POST", body: payload });
    closeModal("user-modal");
    await loadUsers();
    toast("Usuário criado", "A conta já pode acessar o BookShare.");
  } catch (error) {
    toast("Não foi possível criar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

async function toggleUser(id, active) {
  if (id === state.user.id && active) {
    toast("Ação bloqueada", "Você não pode bloquear sua própria conta.", "warning");
    return;
  }

  const confirmed = await confirmAction({
    title: active ? "Bloquear usuário?" : "Ativar usuário?",
    message: active ? "A conta perderá o acesso imediatamente." : "A conta poderá voltar a acessar o sistema.",
    acceptText: active ? "Bloquear" : "Ativar",
    danger: active
  });
  if (!confirmed) return;

  try {
    await api(`/users/${id}/status`, { method: "PUT", body: { active: !active } });
    await loadUsers();
    toast("Usuário atualizado", active ? "A conta foi bloqueada." : "A conta foi ativada.");
  } catch (error) {
    toast("Não foi possível atualizar", error.message, "error");
  }
}

async function resetUserPassword(id) {
  const password = prompt("Digite uma nova senha com pelo menos 8 caracteres:");
  if (password === null) return;
  if (password.length < 8) {
    toast("Senha inválida", "A senha precisa ter pelo menos 8 caracteres.", "warning");
    return;
  }

  try {
    await api(`/users/${id}/password`, { method: "PUT", body: { password } });
    toast("Senha redefinida", "A nova senha já pode ser utilizada.");
  } catch (error) {
    toast("Não foi possível alterar", error.message, "error");
  }
}

async function loadSettings() {
  const response = await api("/settings");
  state.settings = response.settings;
  fillSettingsForm();
  initializeDates();
  updateSchoolIdentity();
}

function fillSettingsForm() {
  const form = $("#settings-form");
  if (!form || !state.settings) return;

  Object.entries(state.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });
}

function updateSchoolIdentity() {
  const label = state.settings?.library_name || state.settings?.school_name || "Biblioteca Escolar";
  $("#sidebar-school-name").textContent = label;
}

async function handleSaveSettings(event) {
  event.preventDefault();
  if (state.user?.role !== "admin") return;

  const form = event.currentTarget;
  const payload = formToObject(form, { includeCheckboxes: true });
  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Salvando...");

  try {
    const response = await api("/settings", { method: "PUT", body: payload });
    state.settings = response.settings;
    $("#settings-save-status").textContent = `Salvo em ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
    updateSchoolIdentity();
    initializeDates();
    toast("Configurações salvas", "As novas regras já estão ativas no servidor.");
  } catch (error) {
    toast("Não foi possível salvar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

function setAvatarElement(element, user) {
  if (!element || !user) return;
  const image = user.avatar_url || state.profileAvatarDraft;
  element.classList.toggle("has-photo", Boolean(image));
  if (image) {
    element.style.backgroundImage = `url("${String(image).replaceAll('"', '%22')}")`;
    element.textContent = "";
  } else {
    element.style.backgroundImage = "";
    element.textContent = initialsFromName(user.name || "BookShare");
  }
}

async function handleProfilePhotoSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("Arquivo inválido", "Escolha uma imagem JPG, PNG ou WEBP.", "warning");
    return;
  }
  if (file.size > 6 * 1024 * 1024) {
    toast("Imagem muito grande", "Escolha uma foto com até 6 MB.", "warning");
    return;
  }

  try {
    state.profileAvatarDraft = await resizeProfileImage(file, 360, 0.82);
    setAvatarElement($("#profile-photo-preview"), { ...state.user, avatar_url: state.profileAvatarDraft });
    toast("Foto preparada", "Clique em Salvar meu perfil para concluir.");
  } catch (_error) {
    toast("Não foi possível ler a foto", "Tente outra imagem.", "error");
  }
}

function resizeProfileImage(file, size, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sx = (image.naturalWidth - side) / 2;
        const sy = (image.naturalHeight - side) / 2;
        context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleSaveProfile() {
  const name = $("#profile-name-input").value.trim();
  if (name.length < 2) {
    toast("Nome inválido", "Informe o nome que deve aparecer no sistema.", "warning");
    return;
  }

  const button = $("#save-profile-button");
  setButtonLoading(button, true, "Salvando...");
  try {
    const response = await api("/auth/profile", {
      method: "PUT",
      body: {
        name,
        avatar_url: state.profileAvatarDraft ?? state.user.avatar_url ?? null
      }
    });
    state.user = response.user;
    state.profileAvatarDraft = null;
    configureUserInterface();
    toast("Perfil atualizado", "Nome e foto foram salvos no Supabase.");
  } catch (error) {
    toast("Não foi possível salvar", error.message, "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function handleChangeOwnPassword() {
  const currentPassword = $("#current-password").value;
  const newPassword = $("#new-password").value;

  if (!currentPassword || newPassword.length < 8) {
    toast("Revise as senhas", "Informe a senha atual e uma nova senha com pelo menos 8 caracteres.", "warning");
    return;
  }

  const button = $("#change-own-password-button");
  setButtonLoading(button, true, "Alterando...");

  try {
    await api("/auth/change-password", {
      method: "PUT",
      body: { current_password: currentPassword, new_password: newPassword }
    });
    $("#current-password").value = "";
    $("#new-password").value = "";
    toast("Senha alterada", "Sua nova senha já está ativa.");
  } catch (error) {
    toast("Não foi possível alterar", error.message, "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function openOwnProfile() {
  await navigate("configuracoes");
  switchSettingsTab("account");
  $("#page-eyebrow").textContent = "Conta pessoal";
  $("#page-title").textContent = "Meu perfil";
  setTimeout(() => $("#profile-name-input")?.focus(), 80);
}

function switchSettingsTab(tab) {
  $$("[data-settings-tab]").forEach(button => button.classList.toggle("is-active", button.dataset.settingsTab === tab));
  $$(".settings-section").forEach(section => section.classList.add("is-hidden"));
  $(`#settings-${tab}`)?.classList.remove("is-hidden");
}

async function loadReports() {
  const start = $("#report-start-date").value;
  const end = $("#report-end-date").value;
  state.reports = await api(`/reports/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  renderReports();
}

function renderReports() {
  const reports = state.reports;
  if (!reports) return;

  $("#report-total-loans").textContent = reports.loans.total;
  $("#report-returned-loans").textContent = reports.loans.returned;
  $("#report-lost-loans").textContent = reports.loans.lost;
  $("#report-damaged-loans").textContent = reports.loans.damaged;

  renderReportClassBars(reports.by_class || []);
  renderReportPopularBooks(reports.popular_books || []);
  renderReportLosses(reports.losses || []);
  renderCategoryLegend(reports.categories || []);
  drawCategoryChart(reports.categories || []);
}

function renderReportClassBars(items) {
  const container = $("#report-class-bars");
  if (!items.length) {
    container.innerHTML = inlineEmpty("Sem movimentações por turma no período.");
    return;
  }

  const max = Math.max(...items.map(item => Number(item.loan_count)), 1);
  container.innerHTML = items.slice(0, 12).map(item => `
    <div class="bar-item">
      <div class="bar-item__header">
        <strong>${escapeHTML(item.name)}</strong>
        <span>${item.loan_count} empréstimo(s)</span>
      </div>
      <div class="bar-item__track"><div class="bar-item__fill" style="width:${Number(item.loan_count) / max * 100}%"></div></div>
    </div>
  `).join("");
}

function renderReportPopularBooks(items) {
  const container = $("#report-popular-books");
  if (!items.length) {
    container.innerHTML = inlineEmpty("Sem empréstimos no período.");
    return;
  }

  container.innerHTML = buildResponsiveTable({
    headers: ["Posição", "Livro", "Categoria", "Empréstimos"],
    rows: items.map((item, index) => `
      <tr>
        <td><strong>${String(index + 1).padStart(2, "0")}</strong></td>
        <td>${bookCell(item.title, item.author, bookCoverUrl(item))}</td>
        <td>${escapeHTML(item.category_name || "Sem categoria")}</td>
        <td><strong>${item.loan_count}</strong></td>
      </tr>
    `),
    cards: items.map((item, index) => `
      <article class="mobile-data-card">
        <div class="mobile-data-card__top"><strong>${index + 1}º · ${escapeHTML(item.title)}</strong><span class="badge badge--neutral">${item.loan_count}</span></div>
        <div class="mobile-data-row"><span>Autor</span><strong>${escapeHTML(item.author)}</strong></div>
        <div class="mobile-data-row"><span>Categoria</span><strong>${escapeHTML(item.category_name || "—")}</strong></div>
      </article>
    `)
  });
}

function renderReportLosses(items) {
  const container = $("#report-losses");
  if (!items.length) {
    container.innerHTML = inlineEmpty("Nenhum exemplar perdido ou danificado.");
    return;
  }

  container.innerHTML = buildResponsiveTable({
    headers: ["Livro", "Patrimônio", "Situação", "Observação"],
    rows: items.map(item => `
      <tr>
        <td>${bookCell(item.title, item.author, bookCoverUrl(item))}</td>
        <td>${escapeHTML(item.inventory_code)}</td>
        <td>${copyBadge(item.status)}</td>
        <td>${escapeHTML(item.condition_notes || "—")}</td>
      </tr>
    `),
    cards: items.map(item => mobileCopyCard(item))
  });
}

function renderCategoryLegend(items) {
  const container = $("#category-legend");
  const colors = ["#39937d", "#d8893e", "#4f83ab", "#8d70a7", "#d0a744", "#c84c4c", "#61aa97", "#54756f"];

  if (!items.length) {
    container.innerHTML = inlineEmpty("Sem dados de categorias.");
    return;
  }

  const total = items.reduce((sumValue, item) => sumValue + Number(item.loan_count), 0) || 1;
  container.innerHTML = items.slice(0, 8).map((item, index) => `
    <div class="donut-legend-item">
      <i style="background:${colors[index % colors.length]}"></i>
      <span>${escapeHTML(item.name || "Sem categoria")}</span>
      <strong>${Math.round(Number(item.loan_count) / total * 100)}%</strong>
    </div>
  `).join("");
}

function drawCategoryChart(items) {
  const canvas = $("#category-chart");
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const size = Math.min(canvas.parentElement.clientWidth || 220, 220);
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, size, size);

  const data = items.slice(0, 8);
  const total = data.reduce((sumValue, item) => sumValue + Number(item.loan_count), 0);
  const colors = ["#39937d", "#d8893e", "#4f83ab", "#8d70a7", "#d0a744", "#c84c4c", "#61aa97", "#54756f"];
  const center = size / 2;
  const radius = size * 0.4;
  const innerRadius = size * 0.25;

  if (!total) {
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.arc(center, center, innerRadius, 0, Math.PI * 2, true);
    context.fillStyle = "#e4ecea";
    context.fill("evenodd");
  } else {
    let startAngle = -Math.PI / 2;
    data.forEach((item, index) => {
      const angle = Math.PI * 2 * Number(item.loan_count) / total;
      context.beginPath();
      context.arc(center, center, radius, startAngle, startAngle + angle);
      context.arc(center, center, innerRadius, startAngle + angle, startAngle, true);
      context.closePath();
      context.fillStyle = colors[index % colors.length];
      context.fill();
      startAngle += angle;
    });
  }

  context.fillStyle = "#102a2b";
  context.font = `700 ${Math.round(size * 0.1)}px Literata`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(total), center, center - 7);
  context.fillStyle = "#718b86";
  context.font = `600 ${Math.round(size * 0.045)}px DM Sans`;
  context.fillText("empréstimos", center, center + 16);
}

function exportReportCsv() {
  if (!state.reports) return;
  const rows = [
    ["Relatório BookShare"],
    ["Período", state.reports.period.start, state.reports.period.end],
    [],
    ["Resumo"],
    ["Empréstimos", state.reports.loans.total],
    ["Devolvidos", state.reports.loans.returned],
    ["Perdidos", state.reports.loans.lost],
    ["Danificados", state.reports.loans.damaged],
    [],
    ["Uso por turma"],
    ["Turma", "Empréstimos"],
    ...state.reports.by_class.map(item => [item.name, item.loan_count]),
    [],
    ["Livros mais emprestados"],
    ["Título", "Autor", "Categoria", "Empréstimos"],
    ...state.reports.popular_books.map(item => [item.title, item.author, item.category_name, item.loan_count])
  ];
  downloadCsv("bookshare-relatorio.csv", rows);
}

function renderServiceInitialState() {
  if (!state.selectedServiceStudent) {
    $("#service-student-summary").innerHTML = `
      <span>♙</span>
      <h3>Nenhum aluno selecionado</h3>
      <p>Busque o aluno para ver empréstimos, pendências e ações disponíveis.</p>
    `;
  }
}

function handleServiceStudentSearch() {
  const query = normalize($("#service-student-search").value);
  const container = $("#service-student-results");

  if (query.length < 2) {
    container.innerHTML = "";
    return;
  }

  const results = state.students
    .filter(item => item.active && normalize(`${item.full_name} ${item.registration_number}`).includes(query))
    .slice(0, 12);

  container.innerHTML = results.length ? results.map(item => `
    <button class="service-result" data-action="select-service-student" data-id="${item.id}" type="button">
      <span class="service-result__avatar">${initialsFromName(item.full_name)}</span>
      <span class="service-result__copy">
        <strong>${escapeHTML(item.full_name)}</strong>
        <span>${escapeHTML(item.class_name || "Sem turma")} · ${escapeHTML(item.registration_number)}</span>
      </span>
      ${Number(item.overdue_loans) > 0 ? statusBadge("Pendente", "danger") : statusBadge("Regular", "success")}
    </button>
  `).join("") : inlineEmpty("Nenhum aluno encontrado.");
}

function selectServiceStudent(id) {
  const student = state.students.find(item => item.id === id);
  if (!student) return;

  state.selectedServiceStudent = student;
  $("#service-student-search").value = student.full_name;
  $("#service-student-results").innerHTML = "";

  const activeLoans = state.loans.filter(item => item.student_id === id && item.status === "active");
  const reservations = state.reservations.filter(item => item.student_id === id && ["active", "ready"].includes(item.status));

  $("#service-student-summary").innerHTML = `
    <div class="service-student-card">
      <div class="service-student-card__header">
        <span class="avatar">${initialsFromName(student.full_name)}</span>
        <div>
          <strong>${escapeHTML(student.full_name)}</strong>
          <span>${escapeHTML(student.class_name || "Sem turma")} · matrícula ${escapeHTML(student.registration_number)}</span>
          <span>${escapeHTML(student.guardian_contact || "Contato não informado")}</span>
        </div>
      </div>
      <div class="service-stat-grid">
        <div><strong>${activeLoans.length}</strong><span>empréstimos ativos</span></div>
        <div><strong>${activeLoans.filter(item => derivedLoanStatus(item) === "overdue").length}</strong><span>atrasos</span></div>
        <div><strong>${reservations.length}</strong><span>reservas</span></div>
      </div>
      <div class="service-actions">
        <button class="button button--primary button--compact" data-open-modal="loan-modal" data-student-id="${student.id}" type="button">＋ Emprestar livro</button>
        <button class="button button--secondary button--compact" data-action="view-student" data-id="${student.id}" type="button">Ver perfil completo</button>
        <button class="button button--secondary button--compact" data-open-modal="reservation-modal" data-student-id="${student.id}" type="button">Criar reserva</button>
      </div>
      <div>
        <div class="detail-section__header"><h3>Livros com o aluno</h3></div>
        <div class="service-loan-list">
          ${activeLoans.length ? activeLoans.map(item => `
            <div class="service-loan-item">
              <div>
                <strong>${escapeHTML(item.book_title)}</strong>
                <span>Prazo ${formatDate(item.due_date)} · ${statusLabel(derivedLoanStatus(item))}</span>
              </div>
              <button class="table-action" data-action="return-loan" data-id="${item.id}" type="button">Devolver</button>
            </div>
          `).join("") : inlineEmpty("Nenhum empréstimo ativo.")}
        </div>
      </div>
    </div>
  `;
}

function handleReturnSearch() {
  const query = normalize($("#return-search-input").value);
  const container = $("#return-search-results");

  if (query.length < 2) {
    container.innerHTML = "";
    return;
  }

  const results = state.loans
    .filter(item => item.status === "active" && normalize(`${item.student_name} ${item.registration_number || ""} ${item.book_title} ${item.inventory_code}`).includes(query))
    .slice(0, 14);

  container.innerHTML = results.length ? results.map(item => `
    <button class="service-result" data-action="quick-return-result" data-id="${item.id}" type="button">
      <span class="service-result__avatar">↩</span>
      <span class="service-result__copy">
        <strong>${escapeHTML(item.book_title)}</strong>
        <span>${escapeHTML(item.student_name)} · ${escapeHTML(item.inventory_code)}</span>
      </span>
      ${loanBadge(item)}
    </button>
  `).join("") : inlineEmpty("Nenhum empréstimo ativo encontrado.");
}

function handleGlobalSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderGlobalSearch, CONFIG.SEARCH_DELAY);
}

function renderGlobalSearch() {
  const input = $("#global-search-input");
  const query = normalize(input.value);
  const container = $(selectors.globalResults);

  if (query.length < 2) {
    hideGlobalSearchResults();
    return;
  }

  const books = state.books.filter(item => normalize(`${item.title} ${item.author} ${item.isbn || ""}`).includes(query)).slice(0, 5);
  const students = state.students.filter(item => normalize(`${item.full_name} ${item.registration_number} ${item.class_name || ""}`).includes(query)).slice(0, 5);
  const activeLoans = state.loans.filter(item => item.status === "active" && normalize(`${item.student_name} ${item.book_title} ${item.inventory_code}`).includes(query)).slice(0, 4);

  const groups = [];

  if (books.length) {
    groups.push(`
      <div class="search-result-group">
        <strong>Livros</strong>
        ${books.map(item => searchResultItem("book", item.id, bookCoverUrl(item), item.title, `${item.author} · ${item.available_copies} disponível(is)`, true)).join("")}
      </div>
    `);
  }

  if (students.length) {
    groups.push(`
      <div class="search-result-group">
        <strong>Alunos</strong>
        ${students.map(item => searchResultItem("student", item.id, item.photo_url || "", item.full_name, `${item.class_name || "Sem turma"} · ${item.registration_number}`, true)).join("")}
      </div>
    `);
  }

  if (activeLoans.length) {
    groups.push(`
      <div class="search-result-group">
        <strong>Empréstimos ativos</strong>
        ${activeLoans.map(item => searchResultItem("loan", item.id, "⇄", item.book_title, `${item.student_name} · prazo ${formatDate(item.due_date)}`)).join("")}
      </div>
    `);
  }

  container.innerHTML = groups.length ? groups.join("") : inlineEmpty("Nenhum resultado encontrado.");
  container.classList.remove("is-hidden");
}

function searchResultItem(type, id, visual, title, subtitle, isImage = false) {
  const media = isImage && visual
    ? `<img src="${escapeAttribute(visual)}" alt="" loading="lazy">`
    : `<span>${escapeHTML(visual || "•")}</span>`;

  return `
    <button class="search-result-item" data-action="search-result" data-type="${type}" data-id="${id}" type="button">
      <span class="search-result-item__icon ${isImage ? "search-result-item__icon--photo" : ""}">${media}</span>
      <span>
        <strong>${escapeHTML(title)}</strong>
        <small>${escapeHTML(subtitle)}</small>
      </span>
    </button>
  `;
}

function openSearchResult(type, id) {
  hideGlobalSearchResults();
  $("#global-search-input").value = "";

  if (type === "book") openBookDetails(id);
  if (type === "student") openStudentDetails(id);
  if (type === "loan") openLoanDetails(id);
}

function hideGlobalSearchResults() {
  $(selectors.globalResults).classList.add("is-hidden");
}

function buildNotifications() {
  const items = [];

  state.pending.slice(0, 8).forEach(item => items.push({
    type: Number(item.overdue_days) >= 15 ? "danger" : "warning",
    icon: "!",
    title: `${item.student_name} está com livro atrasado`,
    message: `${item.book_title} · ${item.overdue_days} dia(s) de atraso`,
    time: item.last_notice_at ? `Último aviso ${formatRelativeTime(item.last_notice_at)}` : "Ainda não avisado",
    route: "pendencias"
  }));

  state.reservations.filter(item => item.status === "ready").slice(0, 6).forEach(item => items.push({
    type: "default",
    icon: "◇",
    title: "Reserva disponível para retirada",
    message: `${item.student_name} · ${item.book_title}`,
    time: item.expires_at ? `Válida até ${formatDate(item.expires_at)}` : "Prazo não informado",
    route: "reservas"
  }));

  const dueSoonDays = Number(state.settings?.due_soon_days || 2);
  state.loans
    .filter(item => item.status === "active" && daysUntil(item.due_date) >= 0 && daysUntil(item.due_date) <= dueSoonDays)
    .slice(0, 6)
    .forEach(item => items.push({
      type: "default",
      icon: "⇄",
      title: "Devolução próxima",
      message: `${item.student_name} · ${item.book_title}`,
      time: dueText(item.due_date),
      route: "emprestimos"
    }));

  const container = $("#notification-list");
  container.innerHTML = items.length ? items.map(item => `
    <button class="notification-item ${item.type === "danger" ? "notification-item--danger" : item.type === "warning" ? "notification-item--warning" : ""}" data-route="${item.route}" type="button">
      <span class="notification-item__icon">${item.icon}</span>
      <span>
        <strong>${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(item.message)}</span>
        <small>${escapeHTML(item.time)}</small>
      </span>
    </button>
  `).join("") : emptyState("✓", "Tudo em ordem", "Nenhuma notificação importante no momento.");

  $("#notification-dot").classList.toggle("is-hidden", items.length === 0);
}

function updateNavigationCounters() {
  const pendingCount = state.pending.length;
  const reservationCount = state.reservations.filter(item => ["active", "ready"].includes(item.status)).length;

  setCounter("#pending-nav-count", pendingCount);
  setCounter("#reservations-nav-count", reservationCount);
}

function setCounter(selector, value) {
  const element = $(selector);
  element.textContent = value;
  element.classList.toggle("is-hidden", Number(value) === 0);
}

function toggleNotificationPanel() {
  $(selectors.notificationPanel).classList.toggle("is-open");
}

function closeNotificationPanel() {
  $(selectors.notificationPanel).classList.remove("is-open");
}

function openSidebar() {
  $(selectors.sidebar).classList.add("is-open");
  $(selectors.sidebarOverlay).classList.add("is-visible");
}

function closeSidebar() {
  $(selectors.sidebar).classList.remove("is-open");
  $(selectors.sidebarOverlay).classList.remove("is-visible");
}

function openModal(id, trigger = null) {
  const adminOnlyModals = ["book-modal", "copy-modal", "user-modal"];
  if (state.user?.role !== "admin" && adminOnlyModals.includes(id)) {
    toast("Acesso restrito", "Essa função pertence ao administrador do sistema.", "warning");
    return;
  }
  const dialog = document.getElementById(id);
  if (!dialog) return;

  if (id === "loan-modal") {
    initializeDates();
    if (trigger?.dataset.studentId) $("#loan-student").value = trigger.dataset.studentId;
    updateLoanStudentPreview();
  }

  if (id === "reservation-modal") {
    if (trigger?.dataset.studentId) $("#reservation-student").value = trigger.dataset.studentId;
  }

  if (id === "copy-modal") {
    if (trigger?.dataset.bookId) $("#copy-book").value = trigger.dataset.bookId;
  }

  updateAllSelectOptions();
  document.body.classList.add("modal-open");
  if (!dialog.open) dialog.showModal();
}

function closeModal(id) {
  if (!id) return;
  const dialog = document.getElementById(id);
  if (!dialog?.open) return;
  dialog.close();

  const form = dialog.querySelector("form");
  if (form) {
    form.reset();
    delete form.dataset.reservationId;
    if (form.elements.id) form.elements.id.value = "";
  }

  if (id === "book-modal") {
    $("#book-modal-title").textContent = "Cadastrar livro";
    updateBookCoverPreview();
  }
  if (id === "student-modal") $("#student-modal-title").textContent = "Cadastrar aluno";
  if (id === "class-modal") $("#class-modal-title").textContent = "Cadastrar turma";

  if (!$("dialog[open]")) document.body.classList.remove("modal-open");
  initializeDates();
}

function setDetailModal({ eyebrow, title, subtitle, content }) {
  $("#detail-modal-eyebrow").textContent = eyebrow;
  $("#detail-modal-title").textContent = title;
  $("#detail-modal-subtitle").textContent = subtitle || "";
  $("#detail-modal-content").innerHTML = content;
  openModal("detail-modal");
}

function confirmAction({ title, message, acceptText = "Confirmar", danger = true }) {
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  $("#confirm-accept").textContent = acceptText;
  $("#confirm-accept").className = `button ${danger ? "button--danger" : "button--primary"}`;
  $("#confirm-icon").textContent = danger ? "!" : "?";

  openModal("confirm-modal");
  return new Promise(resolve => {
    confirmResolver = resolve;
  });
}

function resolveConfirmation(value) {
  closeModal("confirm-modal");
  if (confirmResolver) confirmResolver(value);
  confirmResolver = null;
}

function updateLoanStudentPreview() {
  const id = $("#loan-student").value;
  const preview = $("#loan-student-status");
  const student = state.students.find(item => item.id === id);

  if (!student) {
    preview.classList.add("is-hidden");
    preview.innerHTML = "";
    return;
  }

  const activeLoans = state.loans.filter(item => item.student_id === id && item.status === "active");
  const overdue = activeLoans.filter(item => derivedLoanStatus(item) === "overdue").length;
  preview.innerHTML = `
    <strong>${escapeHTML(student.full_name)} · ${escapeHTML(student.class_name || "Sem turma")}</strong>
    <span>${activeLoans.length} empréstimo(s) ativo(s) · ${overdue} atraso(s) · limite ${state.settings?.max_active_loans || 2}</span>
  `;
  preview.classList.remove("is-hidden");
}

function updateAllSelectOptions() {
  const activeClasses = state.classes.filter(item => item.active);
  const activeStudents = state.students.filter(item => item.active);

  setSelectOptions("#student-class", activeClasses, item => item.id, item => `${item.name} · ${item.school_year} · ${item.shift}`, "Selecione uma turma");
  setSelectOptions("#loan-student", activeStudents, item => item.id, item => `${item.full_name} · ${item.class_name || "Sem turma"}`, "Selecione um aluno");
  setSelectOptions("#reservation-student", activeStudents, item => item.id, item => `${item.full_name} · ${item.class_name || "Sem turma"}`, "Selecione um aluno");
  setSelectOptions("#loan-book", state.books.filter(item => Number(item.available_copies) > 0), item => item.id, item => `${item.title} · ${item.available_copies} disponível(is)`, "Selecione um livro disponível");
  setSelectOptions("#reservation-book", state.books, item => item.id, item => `${item.title} · ${item.available_copies} disponível(is)`, "Selecione um livro");
  setSelectOptions("#copy-book", state.books, item => item.id, item => `${item.title} · ${item.author}`, "Selecione um livro");
  setSelectOptions("#book-category", state.categories, item => item.id, item => item.name, "Sem categoria");
  setSelectOptions("#student-class-filter", activeClasses, item => item.id, item => `${item.name} · ${item.school_year}`, "Todas as turmas");
  setSelectOptions("#loan-class-filter", activeClasses, item => item.id, item => `${item.name} · ${item.school_year}`, "Todas as turmas");
  setSelectOptions("#book-category-filter", state.categories, item => item.id, item => item.name, "Todas as categorias");

  const years = [...new Set(state.classes.map(item => String(item.school_year)))].sort((a, b) => b.localeCompare(a));
  setSelectOptions("#class-year-filter", years, item => item, item => item, "Todos os anos");
}

function setSelectOptions(selector, items, valueGetter, labelGetter, placeholder) {
  const select = $(selector);
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + items.map(item => `
    <option value="${escapeAttribute(valueGetter(item))}">${escapeHTML(labelGetter(item))}</option>
  `).join("");
  if ([...select.options].some(option => option.value === currentValue)) select.value = currentValue;
}

function initializeDates() {
  const today = new Date();
  const defaultDays = Number(state.settings?.default_loan_days || 14);
  const dueDate = addDays(today, defaultDays);

  if ($("#loan-date")) $("#loan-date").value = toDateInput(today);
  if ($("#loan-due-date")) $("#loan-due-date").value = toDateInput(dueDate);
  if ($("#copy-form [name='acquired_at']")) $("#copy-form [name='acquired_at']").value = toDateInput(today);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if ($("#report-start-date") && !$("#report-start-date").value) $("#report-start-date").value = toDateInput(monthStart);
  if ($("#report-end-date") && !$("#report-end-date").value) $("#report-end-date").value = toDateInput(today);
}

function startServiceClock() {
  const update = () => {
    const now = new Date();
    if ($("#service-date")) {
      $("#service-date").textContent = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long"
      }).format(now);
    }
    if ($("#service-time")) {
      $("#service-time").textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
  };
  update();
  clearInterval(serviceClockTimer);
  serviceClockTimer = setInterval(update, 30000);
}

function clearLoanFilters() {
  $("#loan-search").value = "";
  $("#loan-class-filter").value = "";
  $("#loan-start-date").value = "";
  $("#loan-end-date").value = "";
  renderLoans();
}

function exportLoansCsv() {
  const items = getFilteredLoans();
  const rows = [
    ["Aluno", "Matrícula", "Turma", "Livro", "Patrimônio", "Empréstimo", "Prazo", "Situação", "Renovações"],
    ...items.map(item => [
      item.student_name,
      item.registration_number,
      item.class_name,
      item.book_title,
      item.inventory_code,
      formatDate(item.loan_date),
      formatDate(item.due_date),
      statusLabel(derivedLoanStatus(item)),
      item.renewal_count || 0
    ])
  ];
  downloadCsv("bookshare-emprestimos.csv", rows);
}

function exportBooksCsv() {
  const items = getFilteredBooks();
  const rows = [
    ["Título", "Autor", "ISBN", "Categoria", "Editora", "Ano", "Localização", "Exemplares", "Disponíveis", "Emprestados", "Danificados", "Perdidos"],
    ...items.map(item => [
      item.title,
      item.author,
      item.isbn,
      item.category_name,
      item.publisher,
      item.publication_year,
      item.shelf,
      item.total_copies,
      item.available_copies,
      item.loaned_copies,
      item.damaged_copies,
      item.lost_copies
    ])
  ];
  downloadCsv("bookshare-acervo.csv", rows);
}

function exportStudentsCsv() {
  const rows = [
    ["Nome", "Matrícula", "Turma", "Chamada", "Contato", "Ativo", "Empréstimos ativos", "Atrasos", "Histórico"],
    ...state.students.map(item => [
      item.full_name,
      item.registration_number,
      item.class_name,
      item.roll_number,
      item.guardian_contact,
      item.active ? "Sim" : "Não",
      item.active_loans,
      item.overdue_loans,
      item.total_loans
    ])
  ];
  downloadCsv("bookshare-alunos.csv", rows);
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(value => {
    const text = String(value ?? "").replaceAll('"', '""');
    return `"${text}"`;
  }).join(";")).join("\n");

  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function api(path, options = {}) {
  const {
    method = "GET",
    body,
    auth = true,
    headers = {}
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  const requestHeaders = {
    "Content-Type": "application/json",
    ...headers
  };

  if (auth) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { message: await response.text() };

    if (!response.ok) {
      if (response.status === 401 && auth) {
        clearSession();
        showAuthView();
      }
      throw new Error(payload.message || "O servidor não conseguiu concluir a solicitação.");
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("O servidor demorou para responder. Tente novamente.");
    }
    if (error instanceof TypeError) {
      throw new Error("Não foi possível conectar ao Render. Confira a URL da API e o CORS.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDashboardSafe() {
  if (state.currentRoute === "dashboard" || state.dashboard) await loadDashboard();
}

function buildResponsiveTable({ headers, rows, cards }) {
  return `
    <table class="data-table">
      <thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
    <div class="mobile-data-list">${cards.join("")}</div>
  `;
}

function personCell(name, subtitle, photoUrl = "") {
  return `
    <span class="table-person">
      ${photoUrl ? `<img src="${escapeAttribute(photoUrl)}" alt="" loading="lazy">` : `<span class="table-person__initials">${initialsFromName(name)}</span>`}
      <span>
        <span class="table-primary">${escapeHTML(name)}</span>
        <span class="table-secondary">${escapeHTML(subtitle || "")}</span>
      </span>
    </span>
  `;
}

function bookCell(title, subtitle, coverUrl, extra = "") {
  return `
    <span class="table-book">
      <span class="table-book__cover">${coverUrl ? `<img src="${escapeAttribute(coverUrl)}" alt="" loading="lazy" onerror="this.closest('.table-book__cover').textContent='BS'">` : "BS"}</span>
      <span>
        <span class="table-primary">${escapeHTML(title)}</span>
        <span class="table-secondary">${escapeHTML([subtitle, extra].filter(Boolean).join(" · "))}</span>
      </span>
    </span>
  `;
}

function tableActions(actions) {
  return `<div class="table-actions">${actions.filter(action => !action.hidden).map(action => `
    <button class="table-action ${action.danger ? "table-action--danger" : ""}" data-action="${action.action}" data-id="${action.id}" type="button" ${action.disabled ? "disabled" : ""}>${escapeHTML(action.label)}</button>
  `).join("")}</div>`;
}

function mobileLoanCard(item) {
  return `
    <article class="mobile-data-card">
      <div class="mobile-data-card__top">
        <span><span class="table-primary">${escapeHTML(item.student_name)}</span><span class="table-secondary">${escapeHTML(item.class_name || "Sem turma")}</span></span>
        ${loanBadge(item)}
      </div>
      <div class="mobile-data-row"><span>Livro</span><strong>${escapeHTML(item.book_title)}</strong></div>
      <div class="mobile-data-row"><span>Patrimônio</span><strong>${escapeHTML(item.inventory_code || "—")}</strong></div>
      <div class="mobile-data-row"><span>Retirada</span><strong>${formatDate(item.loan_date)}</strong></div>
      <div class="mobile-data-row"><span>Prazo</span><strong>${formatDate(item.due_date)}</strong></div>
      ${tableActions([
        { label: "Detalhes", action: "view-loan", id: item.id },
        ...(item.status === "active" ? [{ label: "Devolver", action: "return-loan", id: item.id }] : [])
      ])}
    </article>
  `;
}

function mobileBookTableCard(item) {
  return `
    <article class="mobile-data-card">
      <div class="mobile-data-card__top">
        <span><span class="table-primary">${escapeHTML(item.title)}</span><span class="table-secondary">${escapeHTML(item.author)}</span></span>
        ${Number(item.available_copies) > 0 ? statusBadge("Disponível", "success") : statusBadge("Indisponível", "danger")}
      </div>
      <div class="mobile-data-row"><span>Categoria</span><strong>${escapeHTML(item.category_name || "—")}</strong></div>
      <div class="mobile-data-row"><span>Exemplares</span><strong>${item.available_copies}/${item.total_copies}</strong></div>
      <div class="mobile-data-row"><span>Localização</span><strong>${escapeHTML(item.shelf || "—")}</strong></div>
      ${tableActions([
        { label: "Detalhes", action: "view-book", id: item.id },
        { label: "Emprestar", action: "loan-book", id: item.id, disabled: Number(item.available_copies) === 0 }
      ])}
    </article>
  `;
}

function mobileCopyCard(item) {
  return `
    <article class="mobile-data-card">
      <div class="mobile-data-card__top">
        <span><span class="table-primary">${escapeHTML(item.inventory_code)}</span><span class="table-secondary">${escapeHTML(item.book_title || "")}</span></span>
        ${copyBadge(item.status)}
      </div>
      <div class="mobile-data-row"><span>Autor</span><strong>${escapeHTML(item.book_author || item.author || "—")}</strong></div>
      <div class="mobile-data-row"><span>Aquisição</span><strong>${formatDate(item.acquired_at)}</strong></div>
      <div class="mobile-data-row"><span>Observação</span><strong>${escapeHTML(item.condition_notes || "—")}</strong></div>
      ${tableActions([{ label: "Alterar", action: "edit-copy", id: item.id }])}
    </article>
  `;
}

function mobileStudentSimpleCard(item) {
  return `
    <article class="mobile-data-card">
      <div class="mobile-data-card__top">
        <span class="mobile-person">${studentAvatar(item, "mobile-person__avatar")}<span><span class="table-primary">${escapeHTML(item.full_name)}</span><span class="table-secondary">${escapeHTML(item.registration_number)}</span></span></span>
        ${Number(item.overdue_loans) > 0 ? statusBadge("Pendente", "danger") : statusBadge("Regular", "success")}
      </div>
      <div class="mobile-data-row"><span>Chamada</span><strong>${item.roll_number || "—"}</strong></div>
      ${tableActions([{ label: "Perfil", action: "view-student", id: item.id }])}
    </article>
  `;
}

function loanBadge(item) {
  const status = derivedLoanStatus(item);
  const types = {
    active: "success",
    overdue: "danger",
    returned: "neutral",
    lost: "danger",
    damaged: "warning"
  };
  return statusBadge(statusLabel(status), types[status] || "neutral");
}

function copyBadge(status) {
  const types = {
    available: "success",
    loaned: "blue",
    damaged: "warning",
    lost: "danger",
    maintenance: "purple"
  };
  return statusBadge(copyStatusLabels[status] || status, types[status] || "neutral");
}

function reservationBadge(status) {
  const types = {
    active: "warning",
    ready: "success",
    completed: "blue",
    cancelled: "neutral",
    expired: "danger"
  };
  return statusBadge(reservationStatusLabels[status] || status, types[status] || "neutral");
}

function statusBadge(label, type = "neutral") {
  return `<span class="badge badge--${type}">${escapeHTML(label)}</span>`;
}

function derivedLoanStatus(item) {
  if (item.status !== "active") return item.status;
  return parseDate(item.due_date) < startOfToday() ? "overdue" : "active";
}

function statusLabel(status) {
  return {
    active: "Ativo",
    overdue: "Atrasado",
    returned: "Devolvido",
    damaged: "Danificado",
    lost: "Perdido"
  }[status] || status;
}

function activityIcon(type) {
  return {
    loan: "⇄",
    book: "▤",
    copy: "▥",
    student: "♙",
    class: "▦",
    reservation: "◇",
    notice: "!",
    user: "♟",
    settings: "⚙"
  }[type] || "↻";
}

function summaryChip(label, value) {
  return `<span class="summary-chip"><span>${escapeHTML(label)}</span><strong>${value}</strong></span>`;
}

function emptyState(icon, title, message) {
  return `
    <div class="empty-state">
      <div class="empty-state__content">
        <span class="empty-state__icon">${icon}</span>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(message)}</p>
      </div>
    </div>
  `;
}

function inlineEmpty(message) {
  return `<div class="empty-state" style="min-height:140px"><div class="empty-state__content"><p>${escapeHTML(message)}</p></div></div>`;
}

function formToObject(form, options = {}) {
  const object = Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [
    key,
    typeof value === "string" ? value.trim() : value
  ]));

  if (options.includeCheckboxes) {
    $$('input[type="checkbox"]', form).forEach(input => {
      object[input.name] = input.checked;
    });
  }

  return object;
}

function fillForm(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });
}

function clearFormErrors(form) {
  $$(".field__error", form).forEach(element => element.textContent = "");
}

function setFieldError(input, message) {
  const field = input.closest(".field");
  const error = $(".field__error", field);
  if (error) error.textContent = message;
}

function setButtonLoading(button, loading, text = "Carregando...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `<span>${escapeHTML(text)}</span>`;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalHtml || button.innerHTML;
    button.disabled = false;
  }
}

function toast(title, message, type = "success") {
  const root = $("#toast-root");
  const element = document.createElement("article");
  element.className = `toast toast--${type}`;
  element.innerHTML = `
    <span class="toast__icon">${type === "error" ? "!" : type === "warning" ? "⚠" : "✓"}</span>
    <span class="toast__copy">
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(message)}</span>
    </span>
    <button class="toast__close" type="button">×</button>
  `;
  element.querySelector(".toast__close").addEventListener("click", () => element.remove());
  root.appendChild(element);
  setTimeout(() => element.remove(), 5000);
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado", successMessage);
  } catch {
    prompt("Copie o texto abaixo:", text);
  }
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "usuária";
}

function initialsFromName(name) {
  return String(name || "BS")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value);
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function parseDate(value) {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return new Date(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function formatDate(value) {
  if (!value) return "—";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatRelativeTime(value) {
  if (!value) return "Nunca";
  const date = new Date(value);
  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, "day");
  return formatDate(value);
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Number(days));
  return result;
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateDifference(a, b) {
  const first = new Date(a);
  const second = new Date(b);
  first.setHours(0, 0, 0, 0);
  second.setHours(0, 0, 0, 0);
  return Math.floor((first - second) / 86400000);
}

function daysUntil(value) {
  return dateDifference(parseDate(value), startOfToday());
}

function dueText(value) {
  const days = daysUntil(value);
  if (days < 0) return `${Math.abs(days)} dia(s) em atraso`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Vence em ${days} dias`;
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}
