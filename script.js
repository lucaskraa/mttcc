"use strict";

const CONFIG = {
  API_BASE_URL: "https://mttcc.onrender.com/api",
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

  hydrateVisibleBookCovers(container);
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


const BOOK_COVER_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MjAiIGhlaWdodD0iNjQwIiB2aWV3Qm94PSIwIDAgNDIwIDY0MCI+CiAgPHJlY3Qgd2lkdGg9IjQyMCIgaGVpZ2h0PSI2NDAiIHJ4PSIyOCIgZmlsbD0iI2YyZWZlNyIvPgogIDxyZWN0IHg9IjY0IiB5PSI2OCIgd2lkdGg9IjI5MiIgaGVpZ2h0PSI1MDQiIHJ4PSIyMiIgZmlsbD0iI2ZmZmZmZiIgc3Ryb2tlPSIjZDdkMmM3IiBzdHJva2Utd2lkdGg9IjUiLz4KICA8cGF0aCBkPSJNMTMyIDIwNGM0MC0yMiA3OC0xOSA3OC0xOXYyNDZzLTM4LTQtNzggMThWMjA0Wm0xNTYgMGMtNDAtMjItNzgtMTktNzgtMTl2MjQ2czM4LTQgNzggMThWMjA0WiIKICAgICAgICBmaWxsPSIjZGNlYmU2IiBzdHJva2U9IiMxNzZiNjMiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgogIDxwYXRoIGQ9Ik0yMTAgMTg2djI0NiIgc3Ryb2tlPSIjMTc2YjYzIiBzdHJva2Utd2lkdGg9IjgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDx0ZXh0IHg9IjIxMCIgeT0iNTIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjIiIGZpbGw9IiM2NjczNmYiPgogICAgQ2FwYSBpbmRpc3BvbsOtdmVsCiAgPC90ZXh0Pgo8L3N2Zz4K";

const LOCAL_BOOK_COVERS = new Map([
  ["dom casmurro::machado de assis", "data:image/jpeg;base64,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"],
  ["crime e castigo::fiodor dostoievski", "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAL0AgADASIAAhEBAxEB/8QAHQAAAQQDAQEAAAAAAAAAAAAABgADBQcCBAgBCf/EAE0QAAEDAwMDAgQEAgUJBgUDBQECAwQABREGEiEHEzEiQQgUUWEVIzJxFrEkQlKBkQkXMzQ2YnJzoSU1Q2OCwTdTVGSSGCaDGUR0wtH/xAAcAQABBQEBAQAAAAAAAAAAAAADAAECBAUGBwj/xAA9EQABAwIEBAMGBQQBAwUBAAABAAIDBBEFEiExEyIyQQYUUSM0UmFxgTNCkaGxFSQ1YrJDU8EWcoLR4SX/2gAMAwEAAhEDEQA/AK0pUqVeir50SpUqX2p0kkr3kCvH0BXGaSWygFSuK8aLLi8F0Cmc5PbMnmAlps5VTKkBxRKTnms5KWgnCHQTTLQW1z5FO0pZLLxyS6wobUEgU4t9NxCUrOCPrT7D7BSUuJBNN/h5W532ztHmo2smWDsl+04U02VAfSvXHfx1Icc9Kk+xp1d4YYbLDjQWRxyK1o6/mFl5A2JHtSumuswHB+WUkBPFOBpt1BSpQHFZGaHUloN8j3phuMt1f6yBTpwE9FYajhWVjmmO72lqIr2TEDS0/nefvTqkRkISFODJp83qpZSvGZJWDwa8S6UZynFZ7ozRGxYJNYSXACn04BpsyE97g5YB0qVnFZrdKR45p5v5UIBU4kGmZKwVbmhuA+lPmRnvc5qxStwnlBAp8obcbIUoDNeJlpeb2BvBFNIirdV+vApkIC6zjMtRgr1jmm23u24rHvWMqGGlJy//ANaeWiM20FdwFQFPmAUwy6xUlRcDmOKUqVv2pHtxWLMh1xJHbOB4rFltTrhK04AqN8yiDZJxBUkGnWFJCdpPNOLLCU7VKANa21sL3dwYp75VMG6y7xac/esn1qcx6fNeEsOKAS4DinJTqWkJ2DNLMouLk32VDBIxSfd7WAR5ply4LUpI24xWy6GH20lSwDSzJNLk0o9wgivXX+yU5FYpPacAV4+tOT2krbChT3uncbbrJ4GYhKk84rAIwjb9BTttWlEdYV7CtaO4p19aR4zSvZJpunW1flqR7kVjb8xFLUseaxcKmX0hXAzWzNCOynb5IqN7pXyrVcX8w96eadcaKUgGvYbaUArV7V46+HFYSeB5pXypXzJlwE+B4rbjqKmSnFN746myErBUPammZK2QobeKfMmcXLFplYeUvFPql+Ee4rGNMCyoKTikltlSy4pYGPalmSaXLFyStPlJ5rNp1XbOQeawfkpJCQjgU4w+24AnAp73TuNk0zjKgT5p6LFQ2VOlQrF+OEKCknGaxeStvaoL496V7JNN149JW48BtOAfNOSUpfCcHxTiX4y2MZG4VrxUh5agFeKWa6RYnwQ02ADnFMOSnwfS2SP2pOB1tf6SRWarp2EYMfJ/amUbWWCXnVD9BrNqYplKkqBGaUO5tqUS8gJBpTHIrqx21jNPmUo3Pa1YsetSlH3rxUVO7uE+Kd2KbQCkVhtSrlbu2lmUY5HFyxLvcWkHgCnpTDUkJ9Y4rxCYziFYdGaajRA6pX53ilmUi2yeLTbaAlKgcU0pLhQWwnIVXi462l/rJp8TQykILeSaZQIWEBKrSlS8cqrUcnvyHz+WcZrbdkYIU6MA/WsVzmCNjLQUT9BTXT2snG9pZIUcEivIF0XbVnCSRnNNbFbgt07AfrT6nGNo7SQ5j6U+6WZN0qVKknSpE7Rv+lKlSSXjUgzVFhQ2+2aKtPdN2LmgvrlhOfvQsEYWNo2n60YWYTWrcpxqQocfWhOKPCMy8mdPIsaQEImBRz9ahdS21Vn2NpRkK96ZgXW5u30MuyFKAXjk0T66jzVQ2FsxS4cDnFJpR3sCCVx0IShxSsFXNZOyXEbWGQTupqZb7o+GytlSAPtW5be0xcYzL+DlQBzRCqbRc6qbsWjGJm16eoI3fWsdVacFqCfw4b0+5TUp1GRcIVtjvWJKlZSCdtP6EfdnWV38eR+YEnG+hF1irrabMECoCG2+U+v3FNFS+SMjFOT1BN2fQ3ynccCvVR7k5HWpuKo8ccUd2yptBvZSNi0uq/kqU9gJojidMIEx8MruCQfpmsOmttujsCU5JaU0QDjIoVXcLyzq8RhMWlBcx5+9BJVlrFMa40G1pYtutygsH71CRmTc3WYxTgKwM0T9UWpbMGI6uQXMgZ5qGtBQv5fZwvildNOGhyJnelkNUFMpc8JJGcZqPGk24TDnaV3QkefNNaxm3SLFQG5akjHjNSegnJ820v8AeQp1RScZp7o4a0t2QSra1IcQE+DTKnl8lPGK2p0C7t3V8qhLCNxxxWLrakx1lxG1WPpRTss5oPdblj00q/EqU/gJ+9ETPTaC4wt5U9JW2OE581h00iCRCkqcd2LAO0UPlGrUaq7bfdMTucnnGM0EuVlrbrWmvvW59cQxTtScBWPNMNylKGe3jNHXUBdui26OWmkl4gbzjmgbvKfCExWtxPsKeM3QpI7bJhEBcychouEbjijSR07abjNKckAbwOaF27ZfBdopREWElQycUZ9RpVwtVmj5UpCtopSabIkUfchex+l0RqEqYiYFkDOM0DXFIjTFxwd2w4o66eKn3KzPrflKI2ngmgWcgtXaTuO7CjTZlNxaET6Z0m3fGC6oYwPNbg6dQHHj/TUhSD+nNbWhrioWmRtG0pScUExrrdpGrS2JSwjuY25880syTXNK2tVWVdsWlAHA96jBucaCTR51EhzzbY6m4qlEgc480CIauTezuxVJT7nFTiN0KeMjsmkJWh4MD+vxRPD018s2mQ4n9QzUBuBu8VKBkFQ3Uea7kyLfZYxtjJcUUjISKUuiUEd1Az7D32+80n9NDb+8u9o/1eKPdFPSJ1oeXcmS2racbhQRIU2m5yEk+CdtRiN0qqPIklJLCsfSpDSdiVdnFtqB2njP0qNaZurjTnaiLUn2IFG3TZieiBKU/FUhQBwSKUptsnpYy7ssW+msGM/n51Kio/pzUdqrTzdkaBQM5qLTdLonVZZVKUUdzxn70U9Q5JagRyobiQKbMpuLUFW2EmZKQyr07zRu/wBNIaYaZa5gScZxmgqC4pdwjBvjJFFfUBdxhWpl1iUoDaCQDSzJ2FpWLGkGHozqkEK2A80GmMWJrjafCTR706kzLrZnwlJcWEmg5VuvX4rKKoS8BR5xU4tUOaOy05LrnsPFbdsgSLo6hkIO08E4rVccU0XEvo2qHsaPOnior9ukF1ADoB2Z+tKXRNBHdaz/AE+gMMoUmWneocjND17spsBCkqzurLGqVaq2OpdEUucHnGM0QdSo7MaHGU04FrIG4A1AFTcxBiZ6uCprP91PIkNPPoZLP6jjxXqCVR0dpncrH0pQYt1curBEBWzcMnFGaqzgbopToaJLjoddcDQUP2rdj9KLeIqpjU9KykZxmm9e/PRbM18spTagkZxTPTVNynW2QuRNUrak8E0G60nNaGIQu8v5CWqEhO4JOMiibSehkamZ7zj+wYzQrdVBF3kJcTu2qPNHug3Hl2p9TDpSQk+Ke6rQBpcmZXTGBEdLSLgkqJ8bqHr7phVgwpL2Qa1Gp16f1Z8uZa1J7mMZ+9FXUu13dqBFcjsLcyBnApgUnMQSkr4KuaeUEKRvCcrHgV4lm4NR0KeiqTxzxXluWlV5jocOEbhuFGbsqzgQUQaa02NSAouA7CR4J4rK+aSj6eSp6EsP7eeOameo778SysDTLR7hQMlH7Vj00iyZlokPamJCwkkBdAa7VXnw2CAmEr1ApTLgLO3j6Vm2w3YiUFYdx/fTtxfT+LSWYSdiAo4IrWZjqCip9e/P1ooVJ7AFnSpUqdRSpA4OfpSr0ckCnCS8XICnAkDFHWnWQ5aXCpX9WgZ9lKVAp80ZWFxxu1rTz+mhT9SPHsg9uQmDf1LPsvNWFI6j2yLBQiUwle0e4qt5LJcui1H+1Wd1t4eYxu9qdw5dE8U2VysOJerdqeE65GYSnaPYVX0tIFycWhwZaP8AhR/0ktNsFtkMyZKUqUDjJrWk6HtwuMgplpPcJwM1FHqIpHRtc1y1rBr2Ihj5W4Nh4IGBnmtC+6vQ+pTVva7SVcccVGX3TStOulzylXg1s6fsi7vhXaO3yTikoSSVPFa0FRcJtLl0aUteStXNWTd73bNM21lbkVKtyQfFRsbRMFqe0+JAykjIz4rLqZEiSYbLTLgVsABqBZdFp2S0zSS4LyP1ViKguNRIob3A+BQPGkm76kRIxtJXn/rWLMaLHaS2AMninISExbqypseVCisZYKtI+SZ/UjbqEz/2QwFncQkUHaedKJrST4yKLtcPKXbGN3uBQnaGtsxpY+opR+7lFqB/cBTPUFCzGaWnxgVuaE1zCsVvUl5pJUB4NY6yU0uE2hWPFBSbeSQ4g+keRTRfhKPGyTKwYvUa33u4qirgJTvVgHbUTr9liAW3UAJDnOKHrW+0i8x2wyEYUMmrV1bpO06gt0R1cxCCEjPNQDLIntKjPZwVaW29G2KaWy9tSryAfNFkzqZb7fBDaIAW6ofrxWvc+m0P5NL0GWHO0M8Gg5a0ImC2uM71A7fFLJdQIlgyXcn5V5dvIcdkE7T4B9qKOmtphLS7NfKVhvnBryJoyOqFvkqDQcHGeKJNL6bt9jtEtaJyVFSTgZpOfn0CNTU0kcjpJHaqFuvVODAufy0e2pX2TjITUTrbWDesYaQWw2UjxUJEdjJu0syY4X6jgmteQ0w8XVNkIHsKm1ireYlqY3McdAjfpmVItElCTwEmgqXk3iVu59Ro16bcWuUnPhJoKl/98Sv+I0o+lNLpTRo20gEptj+Bj0mgpKkxtSKmgY7a84/vo10j/wB2P/8ACaCJH/ej5/3jSj6ipSfgx2R/durMORCaiuQwrtAAnFbFsu1t1RaXlMxkpUhJ5xVaOtocZcC2ufrVidIItsVEkR5b6UFYIGTUHQ21R6eeaqlcJCFX7TjcO6PlawShRx9qI7RrxtJ7U1gPJTwARmpe6dObYLk883NSruKJAzQtqGzp0t6+1vB96TTZAdx4IncMqTu2uWpGGIbAZSrg4GKGnY6ZF1YWHf1qGRUlp20DUn5oa2Ae+KJoGg7e5cmXHJqR21DIzSc66RilqWML3KYnX60aUs7QeioUpafOKjYPUyGmI6zHhhIdB8CsOrEG3/Kx2Yj6XNgAODQElaGGW20tZOPIFJsd1brJJKdzWxuC2Wl97UqJX/zF5/60YdRcG2xiRngUGQTm7RlfVQoz6i/92Rv+EURVYdYZEJWgD5yP+4om1/uXbWm1HgpFDNo/12P+4om14N0JhP1SKZND7tItXQWs2dGw3AWg4VjxUnbOqsC5XFcZ62pQXVYyU0DoYYjBClqCwfanULjO3aL8vHCQFDJApPYm8xNHG1jDcIk15aYjOyc2UpDnOKgIl+ctJQ7HPpTyQPerL1NpW33izx3FTUpKUjIzQs9ouOIhXGUHQ2Occ1Br8uhVmpppGyNex2q3WepNvuMAtqgpQ6kfrxQZOuq7m46t57clPgE+K10rDs1VtbY2KJ2+KMrZ00iJhKfnSg33Bxk0tkMCWoz8yY6ex404OOuALDdSlw6g22zzPlG4CVFJxnbUxpPS9q0/bpTjcxKyQSOaqy5yULu8lKmQrKjg4pWupDiU4ZdwRLqzV7N3gHYkZKfH0p3peXkwJSskAg0HMxdyVqcPH0o/0E221apRT/ZNSk3UIJM8w+6CrkhL1xlH3yaMOnZLVvktk/qBoMedzdJQ+5oz0OlX4fIfSP0gnFKTpChRtvUD7oNkznbLqRcpTRUAvPijmR1giGC2xLhpXtA8igWdcTcLq80uP+hR5xXj0ONJZUkoAIFTkFxoosfJC83d3Vk2m42zVVtedbjpThJ9qradGZj3N7a8ApCjtGaOemceGxEejvPJRuBA5r2R03t8qe7NNwSMnIGfNBAsrFTHLUNBDgorT2tmbZhu6tB1I4G7mlqfWbdzTstCeyg+Qnio3VFgbiqDSPA4z9ajY8BDDW8nwKnGqpqJDoQsmQENqcUMrPk0xHJccOVe9OB9KyW0mm0NqZVke9FQzZ+pWdKlSpKKVLxzSr0eRThJYBSlPpCvGRR5bC2i1KJ/s0CqIL6AnnmjOG2VWtQSedtDl6ken5moPlOD5x0p+ppre7J/LycGnno5bfdW4cc1qxpbZDjbZyfrRcvKguZYmyfYZu0JYFskKO7yEmn0/wAWIvEUlLqkqUN3mijp/AZRHfnyiHNgJwaeT1Kt34g40ICSWT5xQFbpoojTgucmuqBfatMVSmjvKRmn+nc502J8JjEubDjioXVuuGtSANBkAI9sU/pHWrFlaKBHCgPIxSRI5aYVIBKhkTNVt3OUt1l0ICjtzWoq4XWY6pE3cMHjNHH+cq1XGemH+HpQpxWCdta+vmIMCM1KZbSguc8Uo3X3UXRxSA2cghUR1T6TvOM1vtBCLpFSSM7hTDT6C2FuKxnxWVvYXLvDCwSQlQornWGioRwRMf1Iy6k7Y1pjKHukUK6eWZD7VFHUpJdtkZpXskUPacYbjraOeaGz3dX5tagKQ1u04iO3g+RQ1FfU2EpV4on1pJK2m0kcUNgMltKgoU8X4Sqzx+2WEh0NvJcaR6x4xW3MOrLlDKYynQAOMZpqGWHrky2VA5UOKsW86lg6Sgx0uQ0neB7U0jrKVLHHHnu5RfTKDf27dKN3LhABxuoVSps6vIUjOHPH99GEjqhGTC7TEYN90ewoGW+RdU3bH9bdSjdfdTqIonmM5kb9SfxhdsjJtjK0jaOU0FwXdURY2H1O7COc5o2kdUojttQw9DCu0MZIrf0zeLZqu2SFJjpSUJPtQY266o7o46uUvY7QKsDJPfI2+pR5p6RbD2C73NuRnFYyCwi6yEgj0KOK8cfVNbWlLmAmrObKFnvhhdC5rHao46a8WqUn6JPNBUv/AL4lf8Ro16a+m1yknztNBUvi8Ss/2jUI+lWJfdo0baR/7sf/AOE0ESDi5vq+ijRvpHi2P7uPSaCX+Lq+o+NxpR9SlL+DGvBILx7KkbR4zXhj3WI6lVsfWNx52mvZD7S21KQACkeaLensePOYdkv4X2smpySKNMyGoldkNkMherRdIuS6pJUM+aLuowcFlYW+0d+0E5FOOa8tkaepkQ0qLKvOKh9Wa0a1M2I7TOAOMYoI1RgIKWJ3EN1JdMit+0yAyz6wk4xQ081qpNylKT3UpBOPNSmkdXs6TbKHGgd3tUorqNAlz0xzCSnvHGcUi2yTIoqqnBY6yB0C6SHVfibyjt/tGslubTsQjcB70U6/t7EVhqWyQjujPFC8eS1GaAXhRV70eM2VaWKOGdokddZwebvHPj1CjLqL/wB2Rv8AhFBsL1XiOtPgqFGXUXH4bGHvtFRRofwpEJWj/XY/7iibXv8AqLA+woZtAUJkckY5FE2vcGAyn3IFRTRe7SBCLdvLkcuhzdgeM0zb5JbeIKfWk8VnEW5EQEuL4UKdioY/FGkkj8xQqea6qMhhp4Wse7Up6bL1PNjrTHU7tA4xmivpiu8NwJSbmytQweVCpK93e2aVtzKlx0kuAe1akbqbCjwFstQwnujyBVaRuui0WRxwyhz3aWQj3Gv4wwlA5c5/xor6oxL65bIv4QVjKRnbQUh8KuyrqOfVuxRwz1NjmF2pMYOdoe4osgshU8UTOIcyCYatV22JiSp0gjnOaaiPJdcUp1HrPmrGs+ordq2FISIqU7Afaq9loaj3J5CSAEqNPELodVHG/JZyalb20LKeBijTpwFvWuUDn9JoLfkIcbUkmjnpy4lq1ydwx6Timk6kqEe2b90DzGi1dZZ/3jR10/dT+FSt39k0ETHO5dJWf7Rox0E0oW+Rj6GlJ0hTpnZagfdCTkpoXSUAyAdx5xWklx1x4gZAJrbnkM3V8FGMqPNYPdpDZdbIJHNFaLhVJIYnyXzd0k/irLiRBWvnzitpY1abpFQ2p3tqUN2M0S6DEWZHdfeQFFsZ5p89QLfDnLj/ACaVKbOAcUKQWV9rIo26uWHUS3uw7RGeye4UjdQLCW9Ja2HPiiXVWsPx4Jb2+kcYqAbkMxkAo8/SlGhz1MZ2CZRGXHWVqrZbdQ55FYpeXIB7iNoptDWFHtnNFVNt3nRZUqVKkpJUhydv1pUh+oCkknEttR3U7lAk0Xwy4xALmMgigSZHfMttwE4BFWPbCmRZCkJyUoob3IsbboIeWblNVETwVnFT8Hp+m3RjIlL/AFjIzUBCS8jUyPyyE7x7fejjqNc3o9tiojqIyADioNcjmG+q29L2mLEt0lC5AwoHAzVaTvl7ddpDaGwouKOKefvs+KyhLbyvWOeawtsNU+6MuverKhnNTIsoOcH6Bbtq0248gvOMkdzxxWrNgTbK96YiloUfOKNtW3J2xRYyYcYq4HgVuQLo1drOVS4A37fJFQ4lipMpgdVXUNlp+7xn+2EEKBNWNrGxxb3BhlD49AGRmq8lKDU51bXG0nApxrUFxcbUguKwkcUWWPumicL2RBddCpfhtrhuZ7Y5xQzFkO269x4ewkhQBo20Nc5MqE+mRlWAcZoQlOKOrkAs8dz6feoRnKnkjzkFFfUtWLZFcPBKRQ1YmVPOsndxxRP1Ta3WiKpI/qihfTClBbSfpik1ylUDNUAKY1whpEVtORnFRendLu3ZIIWSk1ta4jy5DSS2kkVP9PEuRrS6t1OFBJpONkuD7ZRrWh2YF2YkF8ehQJGa2erL0OREioYAUWwM4qBuV9mLuL6Q6cJJxzUXInybg2vvEq2+KcsUHyBxss2ITl2YbEePnYOcCpAWOWpgjsHKR9Kl+nEsNR3y5G3YBxxTiNXPJvJhfIHtrVgnFRLrJNgzIOcHbQ7GeY2k8ZxR70nt0JiDKQ88EdwHGTWrry3Q2o7UlgBK3BkgUEruNytez5VxQB+lSeePoEzRwEXSdBsKuz7qHwe4okc1C37Tq7AgqzwaytN/nuT44cWo7iM0SdSkretTSm0ZUU1AHg7qThxhovOnvrtj6kf2TQVd1KTeXto/rHNGnTNuQ1aZBcQR6T5oQnuIVeZG4f1jT5lGpzNpGou02ta7YvAxxQnIbQ9dlRwfUpWKM9LYVa3tqcnBoECZZ1YgBB29z/3p8yeoDnMYisaEAh7nV7e4OKItH6dg6ftknuyk5cScZNMa8uEm32mKGklJKRmq/lXu5PpQ2JCgFcHmosPFRpbQhYzBHYvEhKcK7ijityBZXWld9TPCuRxWrFtKTcGHXXtxURnmj6/yE2y3s9hjcdo5AqZdwUJg4yCbrZZDi0vpaO1PJ4rWjiK9dYqVBKChQzVg2iSi42xzvx9p2nkiq9n2tBnPOtPbSkkjmnDuMk8cHZWdqvTkG/2iP2ZScoSMgGhM6HHyqlNq3dsVCW29XJllxoyFKCRxzRpoSfJuNulpdSVHBxQ3nhIsVpggq2BDV7bjqOSlQFEnUlTiIsXA4wKFY7EtvWBKkEJDn/vRr1GKDAi7k8gCpZlXaHNpX/VCkJ8GTFTtwciiLqA1strDxPhINC0Z4fPxEoHuKKOo6ZLtnZDaDykUsymzMY3fZQmm7GvUqMoHCBUs1oyO3eGC5IA2KGealOkrfydpfW+nCtpxmhG/3a4G8PrYWoBKjjFJx4yaQCGFpRf1atMN23xVMPBXbAzzQHDa+fQ3EYZyRwSBTjlzuN2jKbkOKO0cZNFvTO1x0xZMuSAVtgkZpmngp5Bx5WhQrmmpEFjd2ySoeMVDSd8FK23mMBXHIowa1U/Ova4LkQ9pCsA4rzXUKO4w2tpsJJ+lOHXTOgyrZ6XwYQiv9xaUFwH3pifouI5c3HEyAd6uOaDo9ym24pQw6Uipe3XGTIuLBcknlQyM1MMukyQNNlhqXTRtQDhOE0R6HQ3ItbobI4TzXvUxt1y0tFlOSUjkVrdMo0lu1yC4D+k0Eu5kRsFproYujKW58jHkE5ox0C8kWyQr3CTQVclLXc5KfuaM+nsZX4bJUr2BqcruUJodKghBUp9y4312KG8ErwKKY2iAzDK5TmO4OM1Bx3MapIDPHc+n3os17dH40OMmOSnIGcUnuzIUceUkrb0zZolkgSdzw9YOOaryaG2rnIIQFFSjitqTfJ4abQHFc+ea145Sq5sLc53KGRU4o+6eVw2T1qs8qUol6OUhXgkVlcdNSYZMlKSpI5xijfUc4wbWyqDC52jkClpyWu721352PghJ8ihiQEoz6YAKuUTRNHywRsUOKcaCbecuHNez2m41yeLQAAUabQx+I+V4ooF1nv5SvaVKlTp0qR4G4eaVejyKSS9aklxKt6cbfFGmibnFLDjMhYHHvQRIfQghkp2lVZlh+AAtLpQF+OaZ7ApxvsjJ9q2szlSkKTkHIqK1VeE3JCWgMhPioFxUxOFKcJCvfNJSzjIG41BrEUz2XiYgcRvWPHivYtzMKUlaU8INeCWhAKXlbCfavWIxcQpwI3J+uKna6rxvsUcNargXSMlMtpKige9a03WsNhhUOKwkZGOKEIjaCHEocGfpTUdsB1RX6jUDFdWfNZBqnXFFby3yP1nxTapCY4P5fCqyLo34Ix9KcdQhxI7oAopdmVdrspuifRd4jRWlIcwndUkIVpfnfOlaNwOaAUsvAExicfavWjP3bg+rj2zUCxHbMizXV2bmMIjpIIQMChyyzUR3kZPg1rvOOSSEOk5HuawdhraTva5NJjEN0h8yLqxnJUCZEHc2kgVqNXyLAjOMNkDIxQZEnSEtlC1kYpkpefWStZH99J7EaSoyypx8pXLcc/tnNYKfTFSfR5rxKShY7nFOP9p1IHBpy66rHRT2k9SR7ehaVtD1VLNXy1KcU+qOneeQcUENJQkYHBpKcdQcKBAqBZdHjnyrc1Venpr6UpUSkHgUw3+fGC1t5KRWstrcsLxuFbgntsNdvaPFTazhIT5OItaBODdwQS3jYqj6ddIVzgoQ6R6RQEhtLyi4lPJrMmQkbC4UioPbxFNknDVkWW622DbHmUKSCUkVWU1aHrq84hXClGnEplJSQh4kHzzTLcDJK0r3KPmnyBPWVTRStR1o6XHjxlNurHqHvWTjdrjzTOO3ck5AoDTMkQ3g3vKcmtma5JCEv90484zS4YRTUNdG1TWsNYG6oTG7HpRwDioOHFbnpCiraRXrctmcyW1NAKA800w25HWQlWBUwzg7KvLKZkne5EnNqDpISaNFajjvw2230BRAxzQS+wouBa1cmnypaEJHtQ3t4qUUnCRY7qWOzEWywgJ3DFBaUuSpi1l0gKJp1RUv9q8+W43Nr5FKNnCSlk4qfcjtQGCrduKhUzovVhthXH7HpXwTihtZUtQQ8v8AurZZmNQW9i2gCrwcVMs42pSil4OiMn12xy4JmpKQpRya19dTGJsVpLawdooRQJSiXy4ceRzSU6/KyhxRIFRyBHkqWikcnLaG0z2FrPCSKsa9XG2TYDLClJJAAqs0RlDK0q5TXiVzH1gB0nb7Zp8gQ4alpjdojk3aPZoim2FABQ9qDn5qXXnHS3kqpt1TrmESl7ceMmkpYZTwnI+tJkfDUKmTixNWLMrtFQ7eAambLqE21ZbCsJX5FQ3eafSSkcimxHS6SVL248Uns4icScKVqPVXO1ND5pttHcPJIofvmoRcD2x4FQrbih+Wp701g41lY7fqBpBmVTknzLYZYak8rIFYfLKj3Bp5DvpQc+axdZdb29onnzXshpSAkrXyamHWQBqUezrxEuUBqO4QSkAVvWi4QbZa3kIIBUk1WqVPowULJFKRcZQw0hRIPBoJZzK0J7ypPSULuT7nsomjHRd1ajsOMKOAoYNB3yCQ13d3rPtShPvRQpBO3Pg1OVnKECKW9TdHC4VrammalxG7OfNRerbsxLaShGFbKGSuYVKKpB58DNZsNOFCu+SePekGKTpU3Gf+bGCj9NZJStLwkDy3zisoSg1vKUcVjHkhbyuOM8ip5so0QS4uN0ZWjW8eVF+VmxgQgYyRWD2tYrDLrERlKcgjihKTLbT+XHRgn6VixHSB3HvehCEBWHVecWXrJXNedecGNxrBhBYcUErxzWZkhBKGk8fWvOwr9eTzRm6Ks7n1SpUqVRTpUgdqgs+BzSpY3fl/2qSSwlMi4lMhny1zgU4HV3hIbfy0WeOfek0TbHAr9SVeaxujrclaFRPRn9WKcciVs2yS5JViOR6UcbqzaakpTvhNF/HnAzWaGTKW1Ajp3LdwMijJDTfTOIh65MB35gcBQz5qD5gNFZiguoKy6EuerVGQ4yplLfJ4xRJFstqhf9jKeSXT6awjdX48FhcSLFDapQwnA+tQjWnr65P/AIjkKcS2o7xmhA5UdsMUGj9StbVmlFaTkIe73ofOfNRUtKITbbzC+53OTirAfiQtdtogzpaW1tcDJob1Jo2Xp1vtQgZSDwCOcVMSIU8LiLv1CgVMmQhMhkZ28kCsVufiI7CTtUninoDptSFInDaXPY+1aimXESvmmB6Cc8UXNdVMmVbKHlWtBacGd3vWCHS2rek53e1PyVszWBkjekVqw0KyVrHCPApbJ04+lZT3CkprCNKkchTRKRWy1KRcUqS4O2G6dtcxD0n5JLOUk4KsU7Q1ia75jotJK0SHODtx7U4+tsAYXgj2oquOhkswjPhL3KIyQKj9MaGuWoXVuOtqSlr6jzUJJWBH8s+QWsoNLEueoJS0Qke+KfkQkxG8qc5+lWdbrFDYiuRnm0pW2MZIqvL/AG1fzjgDnpBOKgyUKUkBiUWyy48rvI5COaykyPnR2kJwU141M/DfyFDO7is/Q1+cRjfzRiM6rbptpwMJKF8mvWG2nlFUhexP3p5uG1IV3d4wKnbdpW26gR8oJyWlkY80zjlU42cXRDzjq0OBu1p76vonmspDdw2pNxYVHz/aGKtbSHTVrRj6Z7yRMRnPPNS2t7BE1uylMaIIuzyQMVVNVl0V9mHZhdUgXhHT20K37vesG3UwF7lu5UvwKOToW2W5SWZExJKfqafT0uiXCS3MYlhaUnOAam6ayq+T4zrIJVZ7jch86Iyg2nndimlOsyD8t3RlHBFdCwbNDNkVaUxEhRTt3YqspfShu2T3Zj8kJDhJAJpNqlZkoOE1A7gbZIDWM0w9JdDiRtOKlNR2tq0OAtuhfNakZxuYgBSMfei3zLOmGVyxf7bwQe5g0primm0paTuP2ryXb2AQtMkDHtmvWpLTWBwsilksmcCW6LGI83s2SjsUfANNnvxXdxB2K8Gtp/T0m+p+ebBa7XIHjNSNht9wvJMCRDUlDXG8ikZQixwEKFlw35K0SY+SE8nFPuKj3JtCCQlbfBo4btNrsyDDL6VuOcYobvmj5lvc+cjBWxznioGS6IYSVEOvLSAw2CUjgmsFPLawG05z5rdaiS2kbVME58nFaEuWbe+Gu3u3nnjxUr2QHRmNPAuNp9IznzWLa0xwXwcqHO2nXpLcNtKh6u4P8Ka+W7eJQO4eSmpgZkmc6xSV6hUVOgsdv+7NZKWEJ+VUM7eM0npAno/IT2VI844zRFovR121S5sREWpI/rYqMkgiU42Ol/t2DnUBCstwWouRWVOJP0FEdo0Q7dlbXSW1n2orm3CB00AhXFlKnHOMEUOnWSzqmCqMgoakOJ4HjzQAeNqrrKZrCKeXrW9I6TSI7e95RSMcE0KXWxXazEohRFvg+CBmujOqshmDpKFLZISpbYJx+1UzberECzviLKgpkFXGSnNDppnVILz2Viqp20tQIx3QIxKnRVf9ox1Nk+yhTrzXzigrdgHxVwSNHI6h2h29W+FsKElYATVNqamQ7m9AnoLPYUQM8Zq1E9lSchWbPSvgmzgLKQ4qEA0RnPFJILYCyjO6vH3kv/qGdvg1swpDS460uAZA4qSE53dNKSrIcSrP2rF9XfKd6dgT70xGfeD63XEntpNbEcuakmogwEZBOFEDxT58qZjC/ZNPBt4pDD25Y9h70/suriAl2KpCQOCR5qwGOkTNo+Xui5QWRhSkZo1dY05eITcMtttLQACcYzQHzrRhwx73cJ7tVRXaubSCliIpaT5IFMR0MsqUHnAlZ8g1fjTGnLPCchhtt1awQDjOKCn+kTN3Mi6IlBGcqSjNJkyUuGPjdwY3aqvUx0JCn0evFMsOqnKUhfo205NRJ03cjbpqSGyraCazu0UMJbkw+Qvk4o+cOWeQW7rxltLatqhn717Jd7X6DmsSs9gf2yKwjJKjl/x96ZROqypUqVJJKl+3mlSzt/MPhNOElmFBZDcjgH3NMu290zmo8T8zukDinlIF3QUtHapNZ2m4L05OTJlo7gaORmlIpQgd0dMaYb0nHZvE8YUAFAGpSa5a+o9vPzTiULjD0JPvTT90HU61D5Y7Swn9I96rjt3i2akabUtcdllYCh43DNVsmZaAdlCLLHoBqfMVJuDIZREOW8jG7FFj13m3ZsWVu3KRHa9Pc28EVNKQrVUeCm2o7SWwnuFI/VVnuRNOQ9LmEmM2JZbwV45ziqb5TdadPhcgHLqPVc53LQMz55t+0yykE+vafFS111Lb9Iw24copluqGFZ5IohjR3rGzPdfWVoWFFJPtVKt266X3Uj3YCpTalnxztqzDzi6p1TW0R5NT6IslaQ/jSOq6wk7QBuwPag92S1a3l2t8Den081YytSN9PLQqKcFbqcFP0qrZDX4/c13VR27lbgKNC65VOoblF0lwpDT6XQTsWa2ZqkxkJUn3HNKXctmyKtGNvAP1rGUjvBAWcFXgUZ+ipAqa0/YmL8na2sIUfarHsfSw26xyrktncpCSoKxVUWlV5tN0jrYaX2lKGSBxiryndSXYtkZsTTBWuUkJPH1qpKHeq1sOja6MkhAPTu8LnXWbAmr3IbUQEmrY0sbdHQ/uaS0nnnGKrr+FF6Re/G3klBlerHjzXly1g52PlmTsU5wCKrcJzlbglYHlpTet7601f0wba4FF1eDt/estS6FuSIMecGFYdAJOK1NP6Nedujd+uCypKFbxmrI1F1CTKgNWyLA3pZG0qCc1IcqiGCoVL3PSYQymQ8NpSMmh91oTFfLtH9PFGetLu9La7cVBBVwQPagWKpyColf6lVdikuFk1kYgK9cbVCUI4c/XwaI7No9SGfxZu7bFJG7buobUwqQ8C6rClfpohh6duvyhWZakpI4GfNSccyhTEtN1YmhtfNiULVcF91IO3KqkupGrodnbbbt2E97yU1SrLN7tc/8AJirUc8KAra1K5qGZHSqTEcOBwSPFVXU+bVaBrzGLWRP/AA4m/Nicu77FL5xurCNdHNKT24qpxcQogeajNE6Rv19ZLplLaSj2zWlqbTFzZl7WFqfW2fbmpujv3QjMYXXAV+M6jgMaeNwa2qcCN3/Sqq/iZzWM59p2SWQ0TjmhiPqHU8GMLe5DcUhQx4qPZt13TcULabWz3j6v76TKcHVTmrDI0Cy2dQwsSdipG8JP1rRcU21H2I9PHmpzVmnJFsitSluEqUMmh1TZlRy2lXrI4FGZoqM4BcFOaR0I5qZSl/Nf3ZqRldPnbRdmm1ErRuGalekjC7cpYuL/AGs/pBPmj25soec3L5yfSfrQJ58hWlT0oe1RF3s1nttrZebeQhe0ZSPeoSPrSHGaVb0QUtqWMBzFbl30fe7rKae7iwyk5A+tDutkx7bLh29TYbcJAJxjNCabqT2ZVpSdPzjdEXQylLbUrdjNEN41AlLDEQM7wAATjxUhcLUq3afbl53hSM5qH0wI91akNuALXggfaihQaL7qet7NmlQgkbC4sc/ahu56JaVOAaAc7h848VI6e0neUS3nEBa2s/4Ciy0w0xJqRKVu55J9qE+Ugo7KYTbqptZaTe04024QV7+cfSh9pxcVKVL9ST5FW51kejiO2LcRIOOcc4qpiQqKrePXjx9KtQSXCy6uPyx0W9brY7d5jZhtnYSN2BV06a6hWbp4mPblxkF13AUcUH9HYqRbZciQ1kpBKcigLU8ufO1E8sNkhlZ28UKT2qtUkzaD27hzq8uqHT9jqHbk6mhrG5I3hIqkLYxOOqYsKXEU2IrgAJHnBqxNCdRLq223bJSV9senaasJ3R1vvQTeRFSyU+onGM0AScHRW5KZ2LEVMej7qM6mvfieko8bf60NgJH91U/o7RMudekficMhoq4UpNdGR9I2PVEIuG4IDkQcN7vOKHZk9LcSREMD5cxgQhzbjOKaCdsI4Y7qzWUrpJxLvb0Uu/qi0dMbIliOlC0rThQFVJqG1QepC3bvaUJbKcqXtoQvOprzdJEqE+lTjYJCSfpRT0h+bt0GY2sFQdB4x4qTKd0TuICqhqmzS8MjZAL8dDMkwM8tHBrCQ0G1J7auPetrUkGRCvj74ScOKJrVcaxHPrysjgVot2usN7eaykIrbFxdbtLABckYT/jVr2HphH6cWo3e5gBT6dySoUK9HtAy50wagkoO2Kd4z9qsHqRqeTrqB+CxEFCog2gD3xVKd+ui2aOnDm3KHbVcXLtLcb+aKkqPoTmhLqGbvYSXApbKT4PjNRNu/ivS90TLfhOhhhWSSk4IqzVLtHWeE3BUpDLrYwr2pnM7qLBHWt4LHESoI6eG734hwqW8keT5xRbdbi5aZbbYlFKUkbk5raSu0dGITkFKkPOuAhPvVZT/AOK9TXdUxiC6WHlZBAOAKTWd0nhlE3gvcTKrQvnTljqJZvxS3IBcYTuJA96qJxt20vvWyek5ZykZq9OnuqH9DwE2uWgrVIG0g+2aAusWmJS5BvMKMQh87iQKlTvJOqnV0oY24VdRvz5BX/UBp25+sbY/kfSsIhaYj9vcO77ilFUppai+OCferjlhu5TZKlSpUydKljd+X7KpUj4P1pJJxQbtTReacBV5wKesjb2p5AjPMFLajgqIqPRCU4FPOObgn2zVq9KIlnusF6M8UMrwQFnjFDkdmRaaMVLsj9Ao9hqH06cbXBkJdSvBWkHNEsqwWXqBA/FmHEMutJ3EA4zQNrTTUyzS33Ib5nNknwc4rT0bc5sdl5CpSmyofozQQxaEc5z+WeOX1XQvSWBFdsU3fgGGk4V9cUAQNeO3vWT9hDpwlwoAz96O+jCVzNMXRClbVrQrH3qmtL6Uv0HqbIuJhudlL5Vuxx5qmQ0latQ54hiij2J1Vw63sqbTZxGkHHzacBR+9VxY12fpSh+VIKJK5WSCecZq0erMpN+04ymOra6wjnHtiuYLpJlXCb+HyJBcKTtAJo0cQKHi0wpJ2SM1ICNnLZb9cLfuj0lIzlSUE0ETYD0CUttAKUNE4+9GGktIPxX2VTJpYaWRwVYp3qzBhWhtj5BQXu/URVlhssicZ23QC4PxFQcKNoa5JoksGnVamSHofq+X8gfaoNpSpAZgsN4L+Aoij+0Op6VwA8fzjJGSPpmpucq1HFZ2q1G9RRoU9q0SoQCkqCdxFGE1FuhSYVwShLvIOPpQS0/b9U3dD4CW1Oqz+1FWobcbC7CR3u6lZHvVWULRjddj2+pFvkm+sGsVXQW+JHb2JG0ECoO5WkOi3vYxnaTW91GtygIEqOzuB2lRHtWU2Wy/CittLHcSBkUojZGqY88khHyv81NX65Jt1sjxoyslSQDim4Woo1ntLokRQ466n0kioyTGluobW8gkJ8Zqct1uts1kOXNaWw2M4V70PLqjNGYey5ULafaizm5s26gN53FAVVeSXw9dX9qfy21HbVsaks0C7xlptkpLXaB4SfNVZ8m5HmLjyEbQDjcfersWyyqtuUni6ppKvn3e8Ds7HOPrVzdM7ZB1hblqlPpa+WHgnziqcltIjrAjqylXnFFunriu125a4cztqKfUAfNM8XUKCcsFrKc1JqZmz3NUOHbBIDKsZCc5xWodfO3ZxuHIsRbQeCooqHs+uWY8x1UqCJC8nkjOa2bt1MhPx3I6rMlhRGEq2YoIjJVoTkOvZXRoy1WQwUpYkoQp4eoA+KG9dwoGjXjKjbZZcOSBzVf6AvToDzsm57N2dgKvFY3bVghTVonyPmUqPpBOaGyIgq2K4yMtG0D5pyTr1briQ3YCofXZ4ou0+5a762h6Uylh1PISRihFjqBEgICRZAtLnhWzxULc9VrVc2ZMRXYSSCUDiiGP0KpRVRY/m9p8tkQ9TXi2gMK4QngVXtoQVXJlxR/LCgTRNri9C+Q46Gx6gBk0NEfJRwpB9eKMwaKrUvzVQIVmXuyy7rCYuVkykRwFL2++KldMXw6jUiE76XouAQfJIob6e9R2Lbbn7fc0jDgIGaesajGvDl9t4y2Fbyke9BmC0IZw6Wysybq1mA+xBnsdhKcAKIxmo7XGgbJq5Ee8pnIbU36hz5qEvMhfU2Ww0ln5X5cjcrGM1G6/gXS0sRolquKlhAAUEqqs2IBXppi9uYC7e3zTt4u0jts6cabLjI9BXj2qbseirZYA3LbmpX38FYz+mtOwllOmHnJLQVLCDtURznFRHTaLNu7lyZvVxLZ9QZSo/wCFHaQ1Ajvmy9Tv+Ksa5astumIwjWxtMlTwwopGdtC8qYVsOOx1bnpAOEg8gmo/T9ukafXcPxXMgKKuyVc/tih/T12mw7+7LubSkxwvKQrxih8O6PJUaWUxbLRLtsGXKvyS5vBKN9VUVuyLtJUW9rQUdoqy+oPUSPdmUQ7egAJ4OPeq2uVy7DO9pn1Ec8VcijsFiVLs5V4dF2YcyC9HeIQkjBJqdPT/AEebg889MaBJyckVXvSOVImWGY82oocSgkVXUq76mlX6bHeuLjWFkJG4jNV8mRaMlX5OHJUDMukGtIaKivIfjTGStHIAI5qO13rW5W62qt1siqCNuApIqn9F6a1vPvDUt+W8YyFAnJOCK6LnK02dPJjyUtrlIRjnGc1WkFyrtLUGugyU/KufNKXjW0XUiJbbj3YUvK0c4IzXRt1mad1LYmmZim4b+0byeCTihHSCrY1PWZsNKWweCRxXnUzRUnVMBc7TU0tloE7UKqU7GyOBClSxuoISY9Wdx3WcbQmi0hxCpbJUvPqyK3LZpfTum4ryo0ltwrBwAc1zW5M1bbnXoc+e62pnIBJPNHXS5y+3mFJkzZi1oaBIyaI6AOYBdVIa7LIZIRp6KE6g3BmLdlN7BhxXFQCYShNjOkntuEZFb2oQ3e7u8hxQBYUajDPeExqMEkobIG76VoMGWKyxZ3Z5wV0Rp+9tWDTG2G0CFI9RAqsJuvjb7y5Lt7HdVuypIFWr0+tsa9aXcjR8PrW3g45xxQfF0La9I3aTcbupKwVE7FVmU7uHISVvTRcWEWW9a9fr1vGTZpGm+0HRtU4W6GtXaVndMCbnYHytTvqKEnxU1I6x2aHvttjsyC6fSFpRU7o2KvUSzK1GNza+QlftUs3CGf8AL6KIZFUnJFJmd62tZBGkdKzup5Fzv75Qpr1BCj5okumvl6Ijqs0fTfdDQ2pcDeak9ZRV6dWJWnBtbRyUo96go3WSzTCi3XuyoDo4K1I80g7ijP8Al9EiyKmOSWTK/wBbXuhWPr1VwvCJFxY7JKspSRirQu9/YummSy9FBSUcKIoYnaDtOuLpGnWtaGsKBCE8Zou1zEj6T0qm3TGw2st4So+/FM5xLhZPDFwoiCVznKtRZuT8lhzekEnaPamm5IuCi2BtKeKyjSXIVwe7x3IeJxmsnmEQVmR+kL5rSaOXVc4/llJXlKlSp0yVJKd6w2eAfelSV+ggfq9qSSVwaEDahlzf3PIzW1GmzLNGKYr5bU8PIOK0ocJxSi9JWVbeRmvXQ5McweAg8UwYndcjKzdFWi9TOWl1UW9ZkplHG5XOM17qPTC413ZnWVfcbkKBUlPtmht2YluIpOz8xI4NHXR6U88y/IuKS/sB2BXOKDIcuivMcKxgp29Q7o4t19u2jocVqFEWpLwHcwKN1aztUSyqfRb0mW6nJ9POaqe4dVJ8KU9ENiU62kkBWzOKjI/Uhp+SHFtjdn/R1TNM4LUjr20/sXi5Oym3tRXyemYHojiULztBFCemNENy5sm93Z3slklaUq4zRU/1AlyHWWxYihnIyvZ7UO9SLsiWy0q0yOzketKTijRxkd1XqyJLSv2aoXUGoZF8kqiw3ywIhwkg4zioc3aZdEGLPUXO3wCa01IW6UFk4V/WI96dlPtx0pUgeoeauNjWXxy4LYtk/wCQuDaHWuM8EjxRLq43OfAQ4xGVIRj2GcUMx5CbgA4WsFPvRZYeordqYValQfmN/pztzioPapUslnKF0pZrk8oykJUhTXO36Ue295N1bV+LPbXI/wCkKP0qIjX9+3SS6zDJS+ckBPin7nZpt1KZ8RRbHlSRxQDYq9Ezceu/yUpDu34s6q0PM78els4rYe0FIsoN0uai2j9SQqm7LItlrSm4yFoS7F9RBPnFSVx6jQuqqPwxKxGRF9Oc4zignRXA4HUn6fNY2u82i4/kPuIQW/05PmhnXEG63AH8MUttKfG33rVuelmmZ7b8S4hKWTk4V5ravuvosFhlptsLLIG4/WiFqBLJm/F0VfQXNYQbyxFfZeDJVhROcGivqXEYjW6M5HAS6tI3Eeafe6r2i6Rwj8OQl1sfq20L3a9u6jcwv9KPAo8eioOdl/D1UXEaU22hLyt28eT7USWnTTLiN65oCVeQTQ8rKU9pZwR4oj0zYFz2HEvz+1uHpyqpyiwQI3ta+yILLo5sTm126OJSc+rAzUt1A0U1LYZDNvDJAG8hOMVJdNNRwunb62Jm2YXTgE84qR131FhywWPl0tiT4OPGap8Uhb5hYY8yruL0xtrjKXW70lpSRlSQusHunEOY+ktTw8ts8DdnNZq0DJePzzN+KUvc7QvxWxbLQrSs9uY7dO8EkEp3ZzU3yWVJrGSPtJyortmk0t2lTUu1coT6VFNBCtBw5k112c+GAknaknFXR/nKt11soZbhpSppPJx5qqL2wNVy3HWZvywaJyAcZqDZSVYq4GxsBaeJ+yD74xHtqiwlYUE8JP1qIQy6+oOOg9sc1K3y2oB2iQFlr3z5qMbuC3mzBDeM8bq0GBYxbmlulLgR7g0TCdAUge1HPS2UiJFeTPO5KBzmgKLanLSVPKeKgvnGaL9KfLvxnY6nggujHmgTBSonXqbFFsa/JnS3o1jZwScEoohs+lklh2Xd5G5ZGQFGhrSKrXoZEmXJcS8pzJGTmoOd1GkXCa6ph0obBOADVThOK1DO3Nm6nf8AFHtvgFb7rSEflA/3U4/oJicFXGDN+Xca52A43VX0TqquElTIayfrWDWuri/MTOTIUhpJypGfNN5dyfzTQ3IDmb3+aJnr28qR8tc2i03HON6uN2KjNU3GDqCKWbO2MoGCpNb9yu9r6ixEQmSmK4kYUscZoZmtR+nrSo6HhILnGc5o0RugTjKNCgh4uQH1JdTuIPNPsPMTElKkA5+1ZrcRMWt9Y/0vP7VqtMfJOFQOQrmrl7LKc4kot0hqMaflJhIThp04VRTfemStR3KJdrKnKFkKc21WC3kpG9v1LPg/SrP6W9WkaZ/7KuQ7ge9IJ9qr1BtstDDXNZPln5lY94uth0PpxmCko+a2AK+uao+dqy4ydWRksvqUy64MpzxjNF3VCyvXZv8AF4Eovd31BAOcVWWmbVqD+LYSZFvcKQ4OSPvUIYs97o9dU+3DKflHyXQ+uUotukY8thHbdW2CSOPaq00H1Wl2y8pts5xS2HVYUT4xVkdaW7s3pGGyxCXktgcD7VQtn05dnpiUPwVo7p/WR4oNPAXAklWK2WQSjhD7K9+oPS21a0tqLzp1aVrWncsIoItK29D22RbHPS4UlJz9aKbDqprpTZ1NSp4lKfTwgqziqg1lqeRf7kuchBQhxWRU42uzWTVUsFMziRfiHsoGSXnLq/JSohLiia2Giz2FsFI7jnAVWKFB5AA80wvcy4Mir59FzrnEOzI/6UdS3Omc75GarvNyjgZPjNGvUizzdWxPxSyOqc+YG7ak+M1Rk2IiUEvFWVp8H6UdaE6tvaOKGJ7RkNp4APNVJoMvMFrwVt25Tst3Rekpenn+/erYVHOcqTRjcb+2UduGA1j2HFRt+66Wy/vsxGoKWg4QCcYoc17LdgQm5lpSXVODJCeaDw+Kc35vRWA6mo25aZ+dvrbdGtu1A2EduYA7n2PNB2s9Jy7+98zZbWQQc5Smm9BS3Z8JyZdklpTYyAriiTT/AF0tdgkuxXoKXUtnGcZzSycI5vzeicupqwZal+RvrbZbnTaxTbDG/Fr4+Y5iDcEKOM4oR6s9UT1OkG2Rh2kwzt3D+titTqN1Wf1s527UkxWv6yU8ZoEShDaO42Nrn9Y/WjCDmuVUq63Lyt2TqWkOMgOHC2ff600guXpRZWNoRwDWTba5iSpJxt8/ekxJAUW0p2FPvVuTlasw83MlSpUqZJKkTgbvpSpceD4pJbr1l5Uhe39IFKe/8qAlpPP2r0pSgb2vNNBaXjl3+rU2CyI0NiHDDtU4y0uVGUtSMcVM6N1gNM91otZB9qh1XuOygsNkf4UwyqMpRdcI+tRfG16HTzFj8t1a2n+pum5Lb8O421sLe4ClJ8VpRtCWl24L1G1JR2knfszVcuR40z1MuhtQ8Gn4t8m2xsw1T1KQrjGaAKcHutAVwa9pJ2ViX7rNYkR/4ejWpvuJGzeE+9AEyMqS8Zb8jCXeQnPitBUOIh0znAFKJzms17Lo2SJWzt+BUxAGqtUzGRjQHbLyQ5+HLShv1JV71uG3MyY/zPcBOM4pi3JjyWXGpCwVo/STTFuTKZkrbdUQ2TxUrHhXQcjy0Sl1iE0i6Ox1rgstEqVwOK6m+FroFH1nFeuN8jgZG5JWmuaofyLGqYYk7Q0pxO4n96+lPRy/9N7DpSIprUEWO4ptO4FYHOKzMUeTTWC6fw1h8NbXeYqgCLdzZQqvhZsceTgpbWhXjjxVPfEHpCx9J4H9EkoK1j9INdUai6s6GtlhmTY+porrjbSigBwE5xXzT6sdSLv1N1dKZkS1uRm3FBGTxjNZmGxy1Dsztgujx+XDcPpTDTACQ+mqFnJtwv76nEuqQyokkZ8itciRb17bW6UK/rFJrKVJ/DGBDbRtJ4zTENabeS7Jcz3PrXUMjbKMrl5jxA9mriXraVLum3cuWok+eaZCu+cPHd9c06Vw3fUJA5rXcS02dyHc0z/ROJHP0Lk7+HsfqbQBmsR/RlZQPFNtTFZ25NbOULRuPn6UmhEDWd3Jt/8ApuHc7Sjms25NwfbLcd5Tez3BptlK3XMLBQmvJkv5RxLUYbgrgkVOJtxqkAJI+EBYeqkbNeH4bvdmrLpQc8mtm76lb1KO3jtqb8VFyGmA2hwOcq8imxCtpw586ls+4zQxG3MkJ3Sx+UvoE41NvTP5QmrKB49VNvS7kl4OSJSlJ+hNMzrlDiqShqQFe2a2m0MXBkLLuOKnkaNEMZZ3cWG+in42tFMQuw01kkYJFQK7nNmSFKafUyFHkA4rBC2oQKdu8UxhuWvcF9uoCMM1U5aqobqFtOMuNDcuQVk+eaa+ZbR/o2/V9aXYZxhUrP8AfWBdjMf+IDUgweqTLb5lmRIkD15xSQ3JYO5p4ox9DXibo2eE0lq73O4ipcNqZxA/Msn5U+RhDj6lD96yZihKSR5NZMsJIJzk0y5IW2vaPFRyhOGM9V6sMsqytsE1kXC8MNDCfpXjjffTmnIqEtIINNskCYNQsEvS4/8AqbpaP1BxSW9Kk/6+6XT9zmsSfWaVJK5S4HCeB7UiCtJQeSaVLxzSTJR2ExDl1Wd1YSmPWHmxhXkH6V4tt2SoFOcCnXApKQnzinBB3SD9VP6e1jLte359ZebR/VPNFkbrDZkTGpLdtRuaIOdtVs2ltaClY5NYIjxoxO5KfVQZIs2ytw1fD3V36l+I2BfobURduSoNDHihaV1dtUmKYzEFLbpGEnHiq4C47WR2R6qbMIKV30t4A5qDKchElxipkGUhPXB+5zpxmS31ONZyEk+BTr8xiW0lpCACmvWn2XkhhRAI4pp2IzFV3A4OefNWWtyrPLJZDmKxBMfk+K9LqZAx70lrEhO0e1YoaLR3YpkulIxnEnJVxWWI4GXGwoisFPOLO0A1k2wo+pXiklnWGxDzgUlvYU+DRFa9U/hqA3Pb+YSPAPNQKiDwngisA6pB5a30+UI0XFGxRDdNU/iSC3Ab+XSfIHFDuxDLhUpveT5Nel1Szw1srNJA4IyTSyBNLxT3C9xHKfy0BJP0rERirndxXi2FD1JzXiXlo4OaZCbJ6rMPCONo4rzAeO5sYJrFbRd5FONqTHGFUkncyxpUqVJOlSVykgUqQ4OfpTpwsWSWW1qdPFWJ0q6VzOojbxiNlQHuBmq6mKD0dwDjArtT4BI8Zdtm95pKlBPBIqjiNSadmYBamB0FHiOJCIlVAx8KN7Ete+OsgH+zWdw+Fq+7khqOsD/hr6MIjW4SHcxm8j/drJMK2u5Bit5/4a57+sPBXoUngqgEwevm658Lmoi8020y4ATzgVD64+HO6WB6Ol0LCnCPavp2Ldb0uJ/oSM+x21RfxFNsx7xaimOAlSk5wPvRo8YeTayp1ngyhY0yXsuVrd8Nl9l29pfy6ylaQc7aR+FDUHeSWm1pCjyAK+gulY1tXpqAr5VHLSc5TUwIltQ4nEdvJ8emoSYy9Wo/BlCe/ovlD1V6WXHpw605KCm0nzkYzQapdxvC47FljKeUSAdqc11z/lBUR1m3wIzaUOPAJ4GM1LfCL0BhtWuPfL9DS4FJC070+a12YmPKZnaLk5/DUdXihpaZ1mhUroz4bNSa2ZYdlRnGFkAglJGKtiL8Dmsn4yUp1a4wnHCe4Riu0I1vtFvSGYcNpraMDanFPqRJyO0sAVgT4o57Mtl2lP4Ow0RcOYFxHe5C4UunwQ67taS4NUvSWvdIcJqkep/STVGgXe5Ctrru0+tYSTX1YeCykJeUCP2qEv2j9N322vQp9uZcU6kgEoBOaLSYyIHCMhDxHwjSVDc9IMrx918h7eVXqW3EmI2P5wUkc5q5bL8ON51VBQ82yvaUgg4prr10qe6e9TIsuIyW4zz4IAGBjNd69FWbavQ9vdEdBWWk59P2rXr6w00YlZ3XK4NgfFrXQVJu4fJcOJ+EXUTKv0ucfY1kfhb1A3wWHD/6TX0e+Xt6lEfLt5/4aXyVu/8ApGz/AOmsk447uF1X/ougOy+ady+HbUMBkrRAcVj/AHKq/UuitW2ORvNtd7SD6jsNfXly2Wl1JS7BZII5BRQnqfpXpLUFtkQ/w1kOPJIB2ijRY2TuFQqPAlKQSxy+TplCcgR0ja4OFcU7HixmGls9wOPq4SPJzVn/ABB9HJfSi6SJcZolt5RKcD61ufDH0ImdTLyze5qz2WVBSknxit81IZHmv2XDNw2vjrBQSjc/shHp30a1jqqdiTAeSw4fSooOMVfED4BZN6jJlO3IslXOCa7Ssel9N2C3s26NAjoUwgJJCBkkVKNtvJ4ZXhPsMVzE2MPzHLovSKTwZQxsDZupcTf/ANPZLCN67kFlI+tVT1M+G3UujEqRbIzjqUZ/SnNfTBRkNA73Mg1qS7fZZyezOiNPFfnKc1FmLy5wHG6LUeE6V4MdKMq+Oj0O5Wl8x7ywpo5x6hirG6f9H5mvmS7awpafcpGavz4wOhzZZVdrBCCEEblFCfFT/wACdrhxLZLiySl15CcHcM4rYqMRvCHt1XEYbgksWLmiqdlSY+FHUSVnKHP8DWSfhTvpOFNOH/0mvo98rbi4tJjN5GM+mvU2+2qOUxmz/wCmsr+svXYDwRQ73XzflfDFfITJWiGtRA/s0Aai6S6ytRWWrU9sT7hBr6vqgW5Qw5Dbx90VozdNabuLC4j1rjKDqSn/AEYzUxjMh7IMngeiOxXx5W3cbc6WZbSkqHBBGKcAQ+nd711/8Sfw/N2Vt29WaKFIXlR2p8VyA20qPJcjOcKSSCPpW7S1XGAIXnmMYRJhstivEOBHprF1SknIrBQ/Ox96efwEjHNX3bKk88gusQcjNKkPFKmTJUvPH1pUhwoK+lJJOh9MRslQ5IrXjSy+4d44zWfZkXCezHbbJQSATVhSdA2mJb2n1SUpWoZIzUXHLqjU8OZVxKUpLgKDxT/ynzwQUL9Q9qsCJ0/tkyC68mSlSwMgZoEtMKZF1tHtzqSGVOhP280myJTU4BC17hDmRUgvMkJHvinIdxQ612SMHxVv9d7Db7BpuE7EbT3XkDx9cUA6D0ai6xvmrkeyCMjdxUBNc6ItZRTNeAELvQwhzuh3FPpgtzGypUkZA8Zo1f0LbpEosCckDOBzUFqvRbtg2uw3ytHvip57qM9JUNYC0qCYaLK9p8CnXXArgUyt5SkJS2Mq962IrSXEZUfUKmqr1k0lpAyrGa05k8tuBDY4NKQp3vhpGeTwKOdKaEh3RoO3VwM7hwVcUyNBDnQciHPmICobCnCfYCnBHv8ACH51qcx90mrOdesegFBTWySfYealbd1Ct18SBLsaWk+xKKr8Yq55KEfmVOGPf5o/JtTmPqEmm1w58RBVNYLZHsRVz3HqFbrGkiJY0up9yEVFNPWPX6ip3ZGPuPFLjlLyUJ/Mqli3ArcKFjitt5LSk7k4zRdqrQUe2tF20qD20ZJTzQKw4sPllw4UDyDVhVJIcmy2WnNvpNNSGy6rKafktJQgKSeTTDDyx+pNJACypUqVJOlSH6gPrSpDyKSSxmtj5de3jiu2/gEQE2yb/wAFcQTnFJaWPbFdv/AISbZMJH9Ws3F/dF0fhEWxWP6FdeFsLfUAAOKitR3yPp6GqY8QAgZNSyCTJWPtVcdcocx3Scv5LcXS2raB9cVxkRvYH1XsFS8tge4droRmfFHp1i5iL3W/QrChmqv6v9cbRq3UFqiQ1IVtWkcH71x9ctPdTVaolYt8rBdVg4OMZpW5vVln19a272w6kKeR+oH6119LhkDajQ9l5bV+Iquuo3tlFhmH8r616HcD+lLe4UjBZTU0lGX0n6CoTQw//ZVrVjG6Mg1OJH5qMn2rknxhjyB6leqRnlZb0H8LkX40dOIvWrdP5IxvRkf310v0/tbFj0NaosZITtjIJwPqK57+LQON6ysSwTgrRXSel8r0lbc+TFb/AJVfqT/bw/dYNAwf1CqI30Ug42XUh0fvVJ9XfiSg9M7ozan20qLhCcmrvUrtw1H6A188/jFjGfqhpxS8FK8jn70PDacTShp2UvEWJyYfRhzdyu3uneuY+ubQ1co+MOJCuDRWpJMlAHgVz98IC3laVbbdUSEtgCuhR6pR+1BqIhDUyAbLQw6XzVEx/qua/iy00xeLhanEtDekpyQPvVudGoXyOk4jCvZsChH4gtgfhLUBkYow6VyS/ZWR7BAqzK7+1aFUp2BmIyOt6I0CPziOOaDOpHUiFoBLS5akgL+po1B/pIH2Nci/HvOmwbVFciKIOweDQKSIVE7WkK1itZ5GlfUei6R0Hr+365id+EpKsDJwc0ThC/mBg4Ark/4D7rNuVlfMtwqKUe5rrInEg/sKaqhFNM9oTYVWefpWVHqqH+KTRcfVFra3MBakp5OK1PhU0wnTkN9hCNnBGMVaXUxlp62LUtIOE/Sh/outvfIQgDjNWBJmpAFSloQ3FG1SslxlS5JP1oV6l9RYnT60OT5JSNic80Z4Bkf3VzH8bSpCdM7GVEBxvmq1JCJqhoKv4pVGjpZJx2CM+jPXyB1ZlyILASktkjg1cTUX5cqWo5xXBPwO296BeHX0uklasnmu+woutEn6UfEKfhTWCqeH691dhzXncob6hWuJfNEXRqSylZ+XWUkjkECudvgzs71r1FqBDiyUBSwkH25rprUQ26TuX/8AjOfyrnv4UVlzU9/z7LV/OpwaU8v2UK+Jv9Tp3d9V0oVhyQtrwcYoc1nqtOhrY5cXgFpSkq5okcaKpYUnjgZqsviIDCtA3AqcAUllWOftVKnhbLOAVr1sroKdz4+2v6LPpb1qtnUuS/FjlCVMnGAasl10RzgJz964M+BxybL1rckqfJQlxXGfvXewbC9yFcn2qxWQNhksFl+HcTOL0xqXi2tlBa0gRLpo64omNpcxHWsZHg4r5K6kRt15dGEDCEOrwP76+tetJbNq0dcVyFBOWFpGT9RXyY1Q82nXV0dB4W6sj/GtbAcwcSdlyvj1rC2IDcKNWhJUeec1m2gEec4pnDi1qKRwTWTKlN8LrpnnMV58WNkcXL0+TSpHyTSqCglXjhKWVqHkDivaR4BUfHvSSRf02aYmw5D8psBbYJSTQzfbveJd1eimSpDSFYHNP2HUiIstMNs9tCzhVHFz0rp6bGRIE1tLjgyeaGH2VuMvnHsuVANtv92t05mMzIW4hZAIBzVqvafgriMahcSlt5oBf3qBj6LtlmjLuLDyZLjY3JAOakdPyp+rrXMaloVHQwkhIPGcUCR91dpYGsN5jdZz7q51HfZiPHc3DIH+FQvUCVJtrDMC1JLQb4UU8V709fdhzZzQQfyyQD9a23HzfJb0aXH2jJAURSZoiNdNPGQ9V3JnXFrtutz1Fz3GaP8ATCDfbK6bq7lSUHBVWUfpnYUu/NybqgY52lVRep7jDsjfyNtlAA8ZBohN1SpIIqeQmQlDPbjQZ8loqCgFECtQKKXFOJVx5xWTdvElfzC3+V8+ay+Wbbkpj787zirA6VQdzSIm0jps3sm4KR6WPUeKIXY0rUslFttTpaDJwop4rZsshWm7E40hvKn0YHFaehpc+2zZLz0dW58kpOKog8y142Wavb1oKZCuUNTj5kgEbgeamOo82PY7JHTCt4bcCRkhOKmLa7cmrh81PYUpBVlORWzrdti+RkIejBIA+lA4zirwpmiB5Q904mx75ZJCZtvDjhScEpzUNZtBTJtxmKafMbKjsTnFHWiG2LHGWhmMFAj6VrXN65KuHztvjqSlByoAUuM4JeWaadhQczJnaOlLtN4Cng+dqSr71A6t0cu3YvKE7UP+ocVPa5uVy1HNjONW5QMYjcrb9K3r1cjf7E3CWjaplODR78wuqUjLsKqZb/ccSjdmn5rgYQkpR7V6q2tMylHuA7TWDzhfyhCN2KvHpWMBleV5SpUqZOlSH6hSpHgGkklPQlUdZH0rtr4BVp/DJiffbXEyAHIzvcOMCu0vgHymNMA8bTWbiw/tF0nhP/Kx/QrsEuduSvjyBWvcbcxckgSUhTfuDWy4gF1RPnFYl6Oy0TJcShI91HArjWDS69lfGHRkFD6tC6KffSr8IjFY5J2DmuRfjLs1k0vrTT8q3Qm2y84hR2jHvXZDd+0o29gXiLv+hdFcffG9cbRdNW6aZt0tp9xK0bghWcc1rYY+bzOt9iuT8T01KzD3cIC92/yutunsj5rQVndxjdFRU8QfmG8e1D/TlHa6f2ZKhgiIjip9v1vJUfYVlOuHm/zXTU5ytYD6D+Fy78XLpRqywJ28b0fzrpHSat2kbYf/ALVv+Vc4fFsoK1bYEbfC0c/310fpc7dI23A//tW/5VdqfwIvusbDhlxCqJ+Sk38CIrJ42mvnl8YqFnVDSmVHG/nH719C3k96GoE49NfPf4vwqJqZtOCoKX/71ZwM+3VHxg9nkRm9V0L8Hzm7S7afcNjP+FdBqWW5oTj9Vc9fCANumUK+rYroc7TKz5IqpiDv7qQLWwK7cPjVMfEKnc9CH1xRh0rbDNkZx7oFB/xCkl+Ds5Ixn/GjPpanuWRg55CRSeL0zVGM3r5APkjXaRISftXJPx67PwNgqGcIrrZbgTKQj6iuTPjzbQuwNb1Y/L4qWFclQwlB8UtzYXI1anwBPIctMsJ9kGuvTkyF/sK45/yfTZbts0e2012OFgylJPsBSxXnqHpvCzQ3C42lCXUEA2p1J/smhnos0USJR+uaIepqlt21fb/smoLouSpUhSh9aHtTBXn38y1qs4giSK5m+NlWNMfft8V05lPzAx5xXMPxsk/w3uI4S3RMM96aq/iIgYZKD6KoPgZW+by7387d3Ga7+Vt7R2/SuB/gdlplXZ1BTtwrzXeZO1BAOeKsYyb1CoeEHAYWyyjdRcaTuW7/AOnc/lXPnwpFJ1Pf9v8AbX/Oug9RkL0ncfb+jOD/AKVz38KLaGtUX8JXnK1/zqvBrDL9ldxFpdiVMfqumc4eVQdr/QCda2iRbXZOwPJI80VuOqEopxQpri8yLfKjoZeKNxHvWexzmTAtWtLI1jHNfsdP1QD0R+HmN0pukm5MvBZdJVxV0OP9ppctRwlAJP7Vhan1v29pxxzduTkmsbwgqsUtDfKiyoD96PK90sl3INHQxYbTGCH6rlD4mviCYYju2CC8EnBQQDXEU5t24z13AZJdJJq0+uelJ38TzZlwcUlIWojP71VkKWUAsBOQngGuyw+lETOVeOeIK+SvqpWH8q2Y622E7XPNMSVpcVlusH21PqJzg16w0WwQurmbVYgY5tM169HilSPkkcivApJ4Sc06de0jz6T4NLzSI3DApJ0a6L6cQNRMqkLkJQ4nkc1uP9KLs9JLKLisISePVQXatQXGxvARZKgT4SD5o9tusr46hKpbDjYPhRHmgSNstSnlbO20gt9Ew9ZLvovaVrVKR7jzWhetfrbiKZhxPlioerAxmpq76ylsMFSoKpKAOTjOKjLdCt+s4MiYlpLa2gSU4oAbdNldGfY6/VQWldYCK64txrClefvU+1e5NzdLUSEU7/6wFRujtMRrvIld3CBGJ/6VvRtWCzz12+Bb+/sOCoJzijv0ChE+eE2eth/pffrkfmkXRxAVzt3VstdF2noi5F0uOFtjI3K81IHWM5MfuoSoOY4RQbf9X6gnKUmU65FQPGeM0NpujyuhIu9D91thts5URp/KEHAOaZYhLVc47ncyAoUgl64EulwqI/rfWvIUkou7LBP9YCrQ6VkxavVzLZbegRSpAISBmorUesIVjWyWY6ct4zgVuzJ4gxIra+ErAyazuuj7LeW2XRLQpxePTmqAJzLfDbNCINM68japhIV8mE9ocnFCev8AXjjazGhMZKOOBRDbbIdN9qE1H2tvcFeKjOo2mGLJHTcILIkrdGSBzUYy0osmYU71o6A1444sRprGCvjkUWal17G0tCW58mF9wfSoHp1phi9x13Cc0Iq2hkA8VJ3OyfxF3Yjsbc0xwFEU8haEo8xgYh3TfVG33JbzTtuSC54O2pRNrbkwJUxCAkKBIpi06M0/CbefW82hxoEgZryFe/mIkqG1+hAIBp78wQS3lKp2Uw8i6SEdwkbjxWUCQIhPcRnms5m1N3fO/J3HikpsYy4nFXz0hYMos8pulSpU6ilSpUj/ANadJZOtKcjuFPGBXa3wDoT8hNOeQk1xM7JcTEeBQRxXaX+T+c3wZ5Kv6prKxtoZCQF0PhPI7FoyD2K7FXgycA+1V51ymy4GkpLsJwtrDasEH7UfY/pqiVDFVv19dxpCURg4bV/KuSpuaUD5r1vE3AUr7HsvmxO6j69TqeU3+MPhCXDj1n61oRL9fb31Ata7vMXJCXkYClZ961JbyZeppidmMOK/nWWm+2x1AtwUc/nJ/nXfuhaGut6LwoTPkmHtD1f+V9btFuF3RNq2px/R0DFTiRh5v9qg9GPhOirYraB/R0cVNNLDjqVEgcV588gOcvfKfMY283YLl/4uX2mtV2AEjdvR/OujtJr7mj7YpYxmK3/KuSfjkuRtGrLDNWvDaFIPmuk+kuqomr9CW1yIsEtx0JOD9BV+pp3NomTjZc/huX+sVTSdTl/hGzyC5FOw4O018/fjCi3tzUrSWIK1pK+CE/evoIlOCASMJHNB+tOnWntZvsvSorS1tnklIoNBWCmeJVdxrDHYvSGl9Cqv+ESFOi6WQZrKmyWxwRir8bITMUAc5qPslit+m4KIVvaSgJGOBit5iO4mQHfKT5P0oFXK2qmLwrtBSOoqZlPm2VNdf5CYcyIV4UHCMfajTpcrtWZlaOQpAqh/jE12ix3u1QYZDi1qSFAHOKu/opIS/o2FKeUNzjaTg+3FXJWHy7brKhnbLib44n6jdHwSFSUr+lcnfHVYr/frWwzZYjjxCMHaM11mdm4qSsH9jWpIt9puIxcojT2P7ac1UppTA8OLdlpYpRjEqR9NfLdct/App682C0SEXmIthakcbk4rqwpzKUpPjimItss8FJTb4zMf/gGK2W0uJcSNuUe6qapk4z89t0sMomYfSMpi7NlQf1JlxY1pdW8sZCTgE0LdDbkma7LSkYAziq9+MLqJE0ja2/w+YlTqk+tCVZxWt8F+u42qYUkyXEpdKSQCfNXmxuFMTbRZMeJMdjLqUHsupG2gJJVuzXNPxjxblc9PuNw4yl9tBHAzXSKWnGZC1qPpPIqP1Fp61akhqiTGEObxg5Gap0UwgnzOWxiFC2upn0o2K4h+Ca13Vu9PJfiKaAVySnHvXd5QppBGc8ULaM6bWPRDrr0BhtCnPoMUWlSi5sxnfR66pFbVPmHdVMBw04TT+WUVqNKlaRuQHvGX/KufPhQjJY1RfiXMqK18Z+9Wx1l1wxojR81L+AXmVJSc/WqT+DSSq63q8XTu5S4VKAz96nT05ZRvkcqtYWHFaZoOouursIMkk1VvWl12I5HlNjhGCcVZrqguYEpWOPPNV511WzH0u/McxltsnNVqPnnDVq4ieHTPdb5qR6bagGobYhpKuW04PNGJHrEVQyFea52+EzVw1DIuTAcyGc+9dGkN/NdxSh6R9aer9nMULCqwYhTtqrb6LiX459I/hiWZ9vG3vDccCuP4TvyrKAtGVEcmvpd8TOif4z005ISkKEZBPjNfNyWltq+P21QH5KimuowKqJZlK8w8ZUzsPrHSgaPTO5TmXfAFesuol5bzgjinpCWGwGyoJBrXVHixFB4SUgHk1q5RnuVy4Ba5kadwiOe0s/q4rx6III7m/O/mmZb9ulALampK0+2acjlucja4+MJH1qVmP2KQkgdoAnY7YU0pec5rWbcUlS+PFOJdS0otNq3CsHi40hTnbPNOIwApi35UQ6V0x+Jv/iz3KI/qIPvipjUvUS3zkptECElC2PSSB5xWr08vKFx3YT52dwY5qH1Hp+VaZzk23xS/3DngZqu4XVwexH9pr8Sn7Tr6DEYNonwkrW+NoKh9aKLNpdVks8u7MqwiQkqCR96ryxWKTeJTUy4RSx2yDyMUczNYoblRNNNL3pcIRgUBzSjUjuKT5vT4VHdOkLuM2fFWvtFwkD2zWy87B6dPyF3CMl9TxO1RGak9e2Rzp8iFd4ydgkYUrHHmoPVZGsrUy+wnuOBIJpMkJR2RRsjLqk83ZD/8aNKuYuIj/khW7bjiiO8xrf1Otgct6Ex1MJ9WOM0AM2u6of8AkVW9W3xnFHVniJ0vbFlx3tKcSeM1MtuqVO99Q8tqejsgNS/wN1duzuKPTmvGYqg5+Kgf6P1U9JiCbMelrOckkGmo1xGFQtvpPFWCNFQbyu0Vo6O7Ov7FI7qwhyKj0/3VH6IsFwlXSW7IuCsQ1HYgq84oS09qGRpiX8nDUQiScKx96PVxnbShu7wnsqdwpaAfNVnsWtTygBGFk1X+NSTZrlG7RbO1DihjNa2tb1E0WgOzXBJQeQDzQHeNYXG4XGMzGtyo5BAU4E4zU9qzTL2oLSwp54uK2jIJoHDCumqe8XaLj1//ABT2ir1E1oguwnBGQPIHFbN71X+CSBZrbG7xcO1a0jNDGk9MvaftL6mXi2racAGoGz6xuNvuUhqTblScqO1ZGcUuGEhVPYLuFh6//iz1rZrnGukRcacoJmKG9IPjNSmr40TQlijlDoW7KSN3Pua8SDeG13aY5tW16kJJ8VX+o7zN1XMMSUtWyMcJyfpR2MsqVRLcKOkwFJc/Fd+Q56sU2uYq4DtoTjHFeyJS2wiGonaning01CbDgA5qy0LIfqUzSpUqdOlS8Hd9PalSztIUfApJ0nJQkNLZW3tBGM12j8DEiwWa3yxMuLTTi08Ba8CuL3nG5iO02nafrW7ZbpqbTwWq23F1kK/sqIqrVUjq2PKtjBcRfh+IMcYuxX10VqfSQcO69Q9w8/m1X/WC/aQn6RnITd2Fr7asAL+1fNRGtNeOOlRvz/P/AJhrCZqvWMlssS7w8W1cEFZrIgwR0b7krpnePOIx7DD6ha0stDVM7s8o7isH++mNPsj/ADiW1+Qva2l5JJP7000TGWXtxWtXJNelCpToltqKHG+Qa6GON0mYfJcCZG03tCzvdfWrSuptIp0nbAu7xUoEZAIU4Ac4qXa1LpJxSVNXmGSBxh2vkinWuuX0CIi9PNtt8JHcNOo13r+ENiL0+r2z3DXNNwR8uZ17L0VnjiOAiN0fYLpb/KGTLVd2bWbRObeeaACu2rOOaGPhw+IZ7QcaFZbkvLSwEnceBVCTLrf73+bfpjj4HIClE1pbu4drKihSf0n6VrDDjLh4p1y0mOSf1KSuj2Nl9dNOa80rqC3tTGLpHKnkglJcGRUqLhZYpJE9s7/98GvknY+pGqtJrARenVIHhO81YNu+I3UTjGXpzhKRxlRrFfgbmvEIK7Gm8cxSMdpqLL6WLulijJLj9xYAPOVLFV11N636c0daHjb5zT7u042rziuBrz161VeWlxhcXWsggHeaAndS6nkKcNwnOyG1/VRNGpsDLTzKtV+Nw54jYzUhE2uerk7XfUlhc1CnWA+ACTkAZr6LdKbnpGPoi3pdvEdpZaTlKnAMcV8tYSosZ8y0oCnc5H2NSjutNaOJ2Rr08w2jwkLIq9VYY6RtgVzGCY8cKqJq+dm/zX1qav2kWiSL5EP7vCk9qjSKMf8AbMQ5Ps4DXyWZ1lrh9JCtSPgj/wAw1m1rjXLXo/HX1/T1mqJwNx/Ouqf4/blbIIs2b5r6xSdS6NS13nL5ESAM8PCqc6pfFLp/RsN+Da3m5LpQpCVJVnBr56TdUdQJqtpv8hKT/wCYa1Vi6Ah26zFyD/vKzRo8AG7nqhP44lma50ceW33RNr7W916hXV+XdZKlMuqJSlSvAqT6TdTZPTG8spiulDJUN2DxigV5v5tO5rKAmkzAZkoKVueseDWyGRytyALj2YjNTVfHJ5ivqX0z6y6V1rZWVyLow2/sGUqWBR41dLGn1MzmlZ9wvNfH613LVun5Xet91eQ2k8JCzVl2T4idUwGUxX5jqykYyVGsCowIl+Zq76k8aBrRG8ar6cruNmI7jk9rA+q6gdR9R9J6egOzVXNhS2UkhIWK+eFx+ITVMmMvtTHQSOPUaryb1A1ff3XDKubwbJ5BWaCzBHRyiM91Yl8cQtsLam6uP4jfiRXr916yQk7WmspBB81aPwKXOzQLZMVcrg0y6tPAWvFcXFMaUtRcWC57n61vQb/e7EktWe6LY3eyVEVtz4YRF5Vq4yhx2Tz4r5dQCV9dEah0il9TgvUPerz+cKq/4g9R6blaMlxo90ZW4psj0LzXzlY1br8KLzmoJAHt+Ya8la21bOaVEmXR1xChgkrJrOp8GfBOMxuuirPG/HppAIPluurfgru1jsV6ujc+5tN94qA3rwK6/c1FpJwkqvUPOMHDwr4/2yZqCzvqetVzcQtfnaoipGRq/qC0M/j8jKv/ADDSqMGdPObFBw3xa3D42UfA+e6+rWpr1o2TpqfFVd4ikrYWBhwE5xXy41/Yodv1jcZcR4KQpxRGD960YutddBlSJF7fIV7FZ5qKXInS3yqa6pRWeSferWG0BpiblZ+OY3Fj8jGgWstZmGq7zExg7gk4HNdG9KPhFd6g2wvyZmxJHBJqhbDaz/FsFgLIbdcTk/319Suk9v03pPSEItXNre60kryocHFNi1U6AWYn8L4dHitU98ugYuZov+TqjxZXeN7SpBOcZqtuvHw527pXFaVGuCSpYycGu/tVays1rsEy4N3hsLaaUtICx5xXzO6udVbx1O1PLgSJi+ywtQRk8YzVDDZp5H8x0W54hoMKoo/ZgZlXjUNMXa53N9ZPXBavywxkftTJachKDbiyoCt1E1loABncT74rpiw2XnLfbOPD2Tcd5TDgW2rtmjG2a+iWZofiEcPgD+sM0GXCOX8Pt+nHOKTHZnI7LoGUjFDsiU0pgHJ90aXPX0S+NFNujBgH6DFB8GQ4xqaNcFq39pYPn70yoot+WkIxu96TaBHJkZ3HzT5UjOZnXf22VndYNds6oscOCkDc0gCgrTGpXdPxgt5BWgDwaikrN0SVOkgo8Cm25QUoxJDWEeASKGyGyJVVPmnhz9CjeH1Tts8rxb07k++2h3UN7d1C4ShZbSn+rUY4LfaE7mtpK/tTLO2Qvutq2gnxRCLJpqghga5OsvPJaLPP0zXsSM0netZG7yKydeQ2UtpTyaxkRloCXgoj7US10E6LNgIZC5DwypHKc1v6e1tOXLxMQpTDR4B8YqNGJBSFkpA8/enHpTMZIYZj/q4JAqBapskI2Vmp1fYb4yEtxUNuN++K2bfqGOSWnHxtT4GaqRBdhkKYJyvzinHXZbI3h1QUr2oHlnK8K9rzdwufXZWvcNRRwQ02+NquMZrWVq6w2RnY7Fbccc43EVWLb0pae4+8UkeMmm1lydlTyjhHil5ZwSNe1hu0WPqpXUerpTMrMJJDLp5A8VGyJBV25EdGFL5VilHdYfBZeRkp4HFLuCECC2VA+OKsBqovkuU3KSHti8eoeazdBUgJUrxSY2u7nM/3Umx3lkE4wakBbdDbzLGlSpVFOlS8nB8GlSV+k480kl5Ib+XaL7PJAzxUvpSy6g1W26m3wHHdg9kk1Fx9zcV9ToyAPeuyvgOi2O6QJ6pUFpxxKeCtIIqtU1TqakLlr4FQjEa9jS/sVygjp9rxMpafwZ/CT/YNPSOnOu5RCBZnx99hr6v/AMMaV7qlfg8Td5P5YrIaf0sQUizxB/8AxCsJuPPYy1l18PgGNmZxk3K+TEvp1rm2oCkWd9zPn0GomTYtVRB3JVudZSPOUEV9eUaX0iAU/hMRWf7SAaCtZdEtKapYcbYtzLBWD4RipR43d9ihVHgJsg4vGuQvl1HYYltq3u7HU+R4plmQqOpffRlKfBNXj8Qvw23Xp9LTdbOFLYWdx2jjFUrHbeulzi2JDJ7ryglXFdAyobUR5guLrqOakk8u8XBWMP8AEL64WLYwpw+MJGaMdMdHtY3ZwB22PICvfYa666B/DDbbBb4t8ujCXC6lK9qh7V0lHsWmoSUtMWthO3jhsVi1ONmLlC67CvBrphxgbA9l87E/ClfZDYlPsufXBBoU1X0O1RZhmFa3VpR5wg19TFW63LQEiK2Af92tV+y6e7fZkW1hYUMHKM1Ujxp4NwLrXl8D00jcjND6r4+3GwzmFBFwZVGUjg5GKaRNSyn5RtPcB4KvpX0H64/C/adVW2XdbOEMLShSwlIxXAjllkaX1O/pec2VOKWUIJH3rdosRbMwrhMZwiXA3iw3TUWySyvfbkmQtf8AUAzRvpjo7q/UhBetjzSVf7hFdNfDN8NzbLaNR39oONOYWlK0+1dXxLFpuMBHi2yOjYMcN1m1eLcF5a3VdJg/g/zcXGqNLr5xyfhe1K22Ftsugn7GgLV3SrWOklpV+GPLQDydpr6yKgW9ScrgtgJ+qahL1pbTGpY64Em2MqKgQD26rR484O4coWvP4Ige0tjdb5L5GvIfcWhl4Kbe/s/ephrQ+sLgwl2HbXnUY4IQTXQHxI9Aho/UUa7Wlvcy6sK2pHHmuj/h2tNhf0k0mfaWe+EDlxANaEuIMp4xLFrdctReGZDXGlcMg9d188WdB68US0bI+n/+M07/AJrNfJ/NRan/AP8AA19Xjp7SSlECzxdw+jQp5OntMpQT+Exdv3aFU/66W65F0A8CxNeQJF8m0aE15u7a7K+f/Qa17norU1tR35dndQnySUGvrMzYNJurITZouR9WhVa9e9P6UY0fKfRbY6HkNqIKUAe1SbjpcQAxVajwU2ngdKJNQvmOZqG1dgtYcHG2pC0aW1Vf5KGbfani2s43BBo/6R9JZnUjXz22Oflm3Tn08YzX0L0L0l0po61Mx3Lcwp4JGVKQM1o1uItpAANysbBfDDsRi4zvVcD2z4aNSPRUyVR3AtQzjaacf+GfUiWzKMZzLfIG0819Jfwu0spBaht4+gTxWQg2mQMGE3geRtrEGPS5rhdcPA8BisTqvkjqnRGtLdK+XNqeQy2cFew4qJfajQ2Ay46O6RhX2r60am0BpTUludty7XGS46kgLDfIr5/fE98OMvp137vbnS43IyobR4rSo8YMriHblcvjXhaTDc08LrtVSaf0pe7ilb9ljrljydozittWhNdyFqP4NIyn22GumP8AJ9Wu3KgTmLvGbkuLScFxO4Cuyf4Z0kw+pz8Gi7l+fyxihVOKvpatxAVrB/B8OJxx15kNyvk7/AmtyyuTJsz7bbIySUGtS12HUmpXVx7bbXFrZ4VtSTX1P6jWDTLOhru+3aIwKIylJKGwDmub/gyVZrvqTUDEu1tKLal7d6Mgc1NmLl9LKcnoo1ng8ecjp+PbN8lypD0br2LOQo2Z8LbPCthqxFaj6y22I0y1HmKQkAAYPFfRdzTOklundZohX9m6yc09pVsBK7PFIP8A5WaqvxoPYGmNbUfg0tu1s5G2y+Z95vXWa8x1MGLM2KGFJwfFA6unmud65yrK+hQyVK2HmvrOjTWkmuU2iGM/+WKidX2fS0XTc6QLPG9DSj6WgKUWLgTAtYgz+CTNK6Z1QTovlbA0Tqy9KU2zbHVLR5wk1kvQeuYzvaFifVjj/Rmu9vh5Tpq93a6pVa2SpoqxuQCPNXedO6TTI2mzRN5/8oYqcuOPbKTkVeg8GRVFM28mxK+Rd5s+obKkG8QHI6D/AGk4p2y6Wu18bMiyR1vqHOEjNdc/H3Z7VC00w5abc0y72/UW0YqC/wAntZIFzhy37vGQ8ttJIC055q8cRIw8OssV3h4xYo2gEq5qGg9eTpQYcsb4wcZ7ZrYvGgNW2ZlLsm2OhvGVEoPFfWH+GtJl4pFmiBfnhoVXfXG06SjaQltm3MIfU2dmE45xVKLHHOcGkLZm8FGmhkfxfmvmC5EkKP8AQQS8ny2B5NGOjOnOrdZnY7ZnWQnwrYRmrs+GvoCvVurZl7vLW2Ky4VpSpPBGa7ft+ldKWZhEOJao7ZQAMhsZo9XjHl+WLUqhg/hObE8s1QcsY2+a+dX/AOl/UT5CnY7hA/3TQzrHopq3TTWYFtdcAHOEGvqO/Bt6AkNwGyDxkJpl+y6dU32ZVtZcDowdyAcVnR4y86uF10UvgqiqA9jTZ/ZfIH5GZBWfxlpTCk+yhin4lpv+oF/9hwnJKE+dqc12d8U/w2RbnZZeotNtBGxBWUoHihr4BINoU5c7Pe4TT0ljKU9xOeRW3HiTG0UjmarkGeHp2YgyhnNgbrmxPTnXEgDFnfSU+fQaZm6N1rBaKn7E9sSMqUWzwK+sytL6WLpV+Dxgcc4bGKHOo1l0oxoW8OCzxt3yy0ow0M7sVlR448BrQF0EngRsLBkntYE7L5XWyzXy4ulFqhOSXEfqSlOcVKr0BruWnvmyPjt847ZrqL4JdO2x/UupHbtCbdwtfaDiMgc//wDK69Fg0oHVNizxcnz+UMUerxZ8TjCBsqOG+DxiNG2Xj9z2+a+TqOn+uLk2px6zvtNscqJQRxWpD0xf7o+qFaYTjq2zhQSnNfT3qwnSGndCXV8WuK2ssKCNrYBzXOfwRN2i/wCodQSbhBbcKVLLe9OR5okeKvmonS+hUZ/CrBXMo+PuPRctSemuuoygtFlfz7+g1k/ozWDURTkuzOpCRySg19Ylae0sVndaIm73/KFDHUTTGlDo+4PJtUZJQ0ogpbA5xVZuOyTSAELVk8ExQAyCTYFfKS3R1h5bUn0FJOQaxkntOEMnP7Vtaue36wnx4g2oS4oAD961YSEpz8wrnPvXRO9vECV5uYhTNLQ/uUqVKlTpJUvHNKl70kl6qQVxXmtvkV2h8AMYMwpx/tJNcWSHdjDhCfau2vgFUly3TVg5wms/GHg0ll0fhNxjxWNob2K68WB3jjGa15ktqGjc8AlrypR9hT+Cl9xX2oT6nTHG9C3UtZQ6WFBKvocVxUbM4t6lewzyPbA54G11NQ7tpuWpX4dc2H3R5SlzJ/wreYfW8ST6QmvnN8O2rtX2vqvNj3C5vSI63yAlSyQBmvom08XrazIQnBWkZq3W0BpHC5WRgmMHFaZ8nCtY2Q/1I05A1LpGcmaylxTTKinI+1cKdK+l6bx1SeedYwiO+duR9DX0IvTe7TkwfVhWf8K5y6TW+MNbS1tpCVd0+33qzQ1bo2kX0VLHKSOqraaMDUldJWlkQ7OxGQMBpsJH91bBfYQyp93ACBkk00t5XYShKeMYqP1Iy4NLzltqwoMKUD/dWaQ2V+q6fiNjDm/CEJXLrLpqNeU2gTmg4VbcbhVhNLanQm5LZBStIUDXybv+otQnro3F+fc2fN7cbuMZr6naO3taNtilK3KMZBJq9XUraZjSO65rw5jM+KGV8osGmwUjJiLdguRVucLSRXB3X/pW1A6pW64MNDC30lWB9671K1OrSj61yl8V94Z07rSxpWAS+4j/AKmo0UhjBaFLxXHFLh/GcNQR/K6X0kwiHo22tRkhO2MgcD7Vu3CX+HWiRdQkFTLRcx9cVraTcDukLa9jhcVCv+lb7rCZ0J2A6BsdQUn++qb2h55vVdDH7uBH6C36KkdG/Eo3qzVD+m3YQaLThRnGM81dZU6hDT7DIO4ZzXOGveljmg7wvU9jiblbi4dgrRY+MePYGxb73DDbrY2+oYPFXJ6JtVZ0A2XP02KS0L3HE9B6q6Oq+mEX22fOzGQpMdG7BHihDpLrrSKHHbVInsRls+naVAVWGp/jIgXuxSoMdhKS6gpBFcby9R6nn6xenwbi6wh13cAlZA81o0uHySx5JNFh4l4lioajzVF7S/ZfXi3T7bcQtdveQ6lPuDmsxNUXCz2+B9qo/wCFefcpWnwZ76nVBAySc5q90KQ5JxsANYdRE4PIDtl2+G1Rq6dtS5urk1Jn2u3o7s15tn7q4ql+tmp9I3m1vW5m8MlxaSAkLHNNfFJKucGx923SFNHYf0nFfO1+5auuuvIqHrw8W+8Mp3nBGa1sNw9szc5cuV8QeIvJ1AocnUvoB8LWlI9kdmSRGH5uSle2ugX465L/AOvgVX3Q5CIukIae2C4W07lY88VYyiRJQR7+ay6xxllIK6HBqYU9E1g7qE1Vqy1aPtypFzfQhITnKjioPpz1GtOuHnk2x9Dgbznac1Rvx1TrlG04hqDIU1ub8g4oG+AafcYTklEuSp/u5HKs4zVxtKzy2fusmXGZBjbcPGxXcK0dtRUkjIqsOt2i2tWaGukiaAssMKUnI8YFWWVLcKnCMDHiorWjaXtD3ds8Aw3Af8Ko00him+4XQ1LGvgfC9t9CuSPgIUG7/f4BGQwpYT9ua7RUlCn1ggcAVx58EsNETWepdhzuWv8AnXYKwS85j6VcxQh85P0WF4Va6PC2gDuf5Q11MkBjQN3KUBX9HUnFc0/BG427qbUKuyEncv2+9dLdQglrQN2W6M4jr/lXMvwPS/m9U6kIb2hK1/zotJHehmdm9FHEW/8A9Wjkvvm/hdfOnY+o7R7V4/NhMNFyY4hCR5Kvas1rJkKTt8AVXnWiJdXNHzHLSpYfDaikJ85xWbCwyPAc7Rb87+BC+f0RL/G2iEOKSq9xgpPkFdDuu+o2ixpK5IYusdxRZUkAKHmvmNLY65SdQzm0puIAWraecYzWg891btcaSm9LmpZIOd5NdGzBA2UXkXn0/jV4je3y1l3T8IdzRcL7eVsgFClKOf766eRtXNVlI9PAri//ACf913pnofOXFgjmu0MhUzKR4HNYuIMEM5BOi6nw1K6fC45S217/AMrmP42Y/wA3pzZ2d21s+1CnwARFtMz1FO0BJ4qz/iwbDunCAzuOznihT4KYyGWZ5CdpweK0g4OwxYr6Jr/EontsF1KUgSyoAeKob4j5m6dAhqcCEKIBGfNXwheZikke1cs/GBPVA1BZlBzYkqTnn71nUEYkmyrfx2dseHSP+n8q7OmFmjWmxRnoLYb7qAVYHmjqQ2HGi4MbgKEOmNzYm6MtqmiFHspB5+1F6Tk49hVed5jks5aVGHeXYXaaCypLqB8RMTQGoo+nZrKVLkLCE5q4LRJXdrNHuBZAMloOJH0yKoHr90Md1le42rIiCVQVBzAHnHNREj4sToyOxYLpbewYjaWd6hj9IxV6al47A6ELIZiZo5ZPOm1tl0LqaC4jRt2YkNh3MZwhPn2rln4QLOI2v74+R28Orwn++pO//GraHNPSmY7CHVutKRkfcVH/AAdXIaq1Fcb00e2HFKWU1OOkkbSyF4WbU19NimJ0s8Evr91184+W3tmzI+uKgOorKXtIzWkoB3tkYxRGSlSlN7Rke9D2rnym3rjbd3cGMVlxENy/JdVUkthcSb9v1VK/DBp78NvV0f7ezcpRxjzzXRKWwmWfSOR9KA+mNgNsffk9vYHMnxVgOuJaQt8nhIJo9bMHzF47qthNH5CkEN9rn9VzD8autBprTJiNLGXW8EA0Gf5PxKZabjcMAFYUT96Bvji1Ui7S1RGXd4QcYz4o+/yeyM2iQscYQcitx1O2lwst9dVxMVR5jxOHA6C4XYziQ4+pAA4FDvUWODoe5J3DhlR/6URrBEhWPcULdUC6jRNw2f8AylZ/wrAgLTKF39SHOidy9ivk3eXNmurkhQz+ar+dNSYgdUVBzbmnr6R/HE/A57qv501ObWvlteK72MexFl8+yAulcCzuVjSpUqmklSpUjwDTpL2QUrhPADnFdnf5PlKk2+4ZP9WuLUnMV/P0rtf/ACf+Pw+4f8NZmL+6LpfCf+Vj+hXYaeZCx9qDurKAdB3MpHPaV/KjFP8ArDn7UIdWXAnQ1ySfBaV/KuMiOo+q9cqfdpPoV8/ugDiB1YlpfG4/MHGf3r6TQkpFoYwONgr5t9E4yP8AOvIW2rkyD/OvpHAGLNHGf/DTW1jBcZG39Fyfgcg0rh8ysLunFgl5P/gq/lXPnSSKFa0mK3f+Kf510Lek7rBLT9WFVz30sQ41rKVgn/SH+dU6JjeBIStvEHGOqgIXRD76I7aUbc5GK09RnOk56v8A7ZZ/6VvrjpfaST5xmo/VHGkrglP/ANMsVRbZ77LWms2NxHoV8n7iESevoG7kS/8A/avq5pJPa0bbE+cRUV8nbhEeY69d3nmZ/wC9fWDRCirRdsLnn5ZNdFjbQ1kIHouF8FlrpKjL6qYYOVpJGDiuJ/j1dciaks1zUMIjFBz+1dorlqEltARx4riv/KGSQ6zCY27TgDNUcED21gHyK2/FpNPhL3Aei6D+HfqjZ9caLgQkSUF9hhKCN3PAq1XlONOEBOB7GvlB0b6qXHpK9HlNT1LaUQSndX0L6M9etM9TLSkSpzDMkAehSsZpV2GSwjjHa6reH8ehrImQSixA9VZspiJMa+WmspeSsYORmuYfiD+FZjU7Tt9sbYQtAK9iBXUgAbVvbSFtq/SrzTqsH8p/CkLGCCKzqWrlp3XK3MSw6DE4OFUL49ams110ncDa7lHUyGiU5UMZrSirMi4MrbBAyOa7l+LvodEv0MX2zxUoKAVrKE1w+zti3pu2JGVsq2qrt6CpbWMXjmNYZJg9c2MdBX0V+E8D+G8EchsVfWAJIwPaqG+E/wD2dP8AyxV8n/WR+1cjW+8OXruC+4xqi/ip504c/wBg185Iq1p1+wpKjw6OP76+jfxUf7OH/gNfOSH/APEOMk+O8P510GCe7uXn/jP/ACUX1C+pfQ2Sl7R8TenBDaf5VYfHzIP2qu+j7aG9IQiz7tpzj9qsJsjvpB84rmag5pXL0mkNo2MPoFyl8dxC9Pobzg9ugb4B4/y8p3vK3bvGaNPj1Sv8AZWn/wCXQV8BiXHpK/PpNbsUebDSVxFQGu8UsafRd1ulKEqwPaoPWQ36Hu4ScZhu/wAqmZWdhGPaoXV5I0LdifPyTv8AI1z0fX9wvQJvwnfQrlj4IUq/i/U5WrOFr/nXYQP9JUPsK45+Bx0r1jqkE/11/wA67GSnMpZ+wq7ivvX6fwsHwub4Yz6n+UMdVDt6f3fA/wDAVXMnwO7RqXUISnGVLz/jXTnVJO/QF3H/ANuquZvghAGptQj/AHl/zo9L7jN9kDEv81S/Ry6+W6lD6gRzgUpcWPKb2yGwtsjlJ8UnGO4+VftXkqYxDSC+sJQPJPispt76LqCRbVRH8KaNU9v/AAaGHPc9vzVI/FJpbSrOkX3YtuYad7ZyUJAq8P4l0gp4J/GIgcHt3RVK/FDddNTdJOsxroypxTZGErBq5T8UytGqwcbjopaKTa9vluqP+B+WxD1FLjh0AFZGM13ghvaveOd1fOD4WnBZ9ar2SMpW59fvX0dgrDkFlzOdyQc1axtpFQ2/oqXhCo4tBwRs0qqviAiIlWF0LRu9H/tQR8KEFUR6aANqeatPq1B+cs7oxn0mhL4fLeIT8sBOM5oTH2pi1Wpoz/Von/Iq58f0zP2rjL4/pqo3yElhX5jABGK7PdGxanf7Irgv45Lp89ObQTlKDyKbBGXqblB8WOyYTKO5Vn/Bl1Th6g06m2XmWhp9tADaXFYzXTrq3WnFrCPyzyk18iNK6unablRbva7gqOmKQpSEqxuxXe/QL4p9P9SYjdmvEhqPIaQlvcs43EVaxXDMji+HVqzvCviJksDaer0d2V/MrRLBQ8nKD5GKpPrr8Nto6jQXZNsYQy+Ek+kYJNXi12tgeh4cbUOFA5pLLu4erCfcVkxzOpzeMrr6yjgqY7PbcFfJDqT06vXSp6TDnsrU1kgEiul/8n24ZHzLqOAckirt+I/ova9e6OnXFtlHfjsqXkDk4qlvgGjLtV9u9odGOwVpH91dE+tFTRPC88psDdh+NQvO2q7bSAHF581oTbcmSvcsbgK3Hc904+1MTJgjYB965drcoC9MeLkEpyIw0wyQ2kJwK0708prTU54nBSys5rdYkIebyk+RWrfYxlaemxkeXGVCpN5XAFReLi49F8pOs92k3nVN0D6ytLbisZ/eumv8npJDsCc2PCEmueetmmndNX26uyklPdWojI+9dAf5OtoiFcnPZSTiusxA8XDw4dl5LgDC3HrH1K7WOC8rj2ob6igHQ9z3DP5Cv5URn/Tq/ah3qL/sPc/+Sr+VcrF1t+q9YqD7N30K+SF5/wBurn/zVfzpoElZyfenbz/t1c/+av8AnTQ/Wf3r0Nv5PovnyX8R31K8pUqVMopUjyDSpUklgsbIjx+ortP/ACfZJt9w/wCGuL5GBDdyfau0P8n0U/h9wwofprNxf3RdJ4St/VI/oV2OP9YWftQd1ZjuP6EufbBKu0rH+FFjiymQoA+1MXWC3dbY7b3ACl1JBrjYux+a9inbmgc31uvnH8PtivKuqstx5hewSDyR96+kENBTaWUHylAoC0h0csmlrm7dW2WwtxW7OKsPcCjtoA4HAq/iFa2pkaAsXw9hRwyEj1JWneFY09LUfZhVc89JpzMnWU1sEZDh9/vV86uuEW3aSuL0x1LRTHXgE4ycVw50X6mts9VJsOQ7tSt8hOT55p6SndJBJZBxisbDUQX7ld8s7gyf2rQvwI0tcN3n5dZ/6Vu2+QZFubfKcBSARWMlCbhBfgrAAdQUf41nAcLVb5HIYj3C+S91lS3evaWwydomj29s19WdLjbo62hA8Rm+KpFfwmWVzVp1Rub7vc7nj3zV8Wpo2+3NQCOGEBP+FaVfVio4YHYLmfDODPwp00r/AMxWw0pCloK0AECuXvjB0TH1tcLdbFKCFOlKc/vXTclxS2FSm08NAk1yV1s1/DvnUC3W2PKCVsOpSQFfeoYbHOasOZ2urniKWEwGCduhI7rWs/wD29y0x3ZFxSpa20r2k/UZqXt3wfz9EJdv1svxaENtTxaSrGdoz/7V0/ZFSV6aguJe5+XbO7+6vbzGkXSwS4Ydwp1pSD9TxSkxCokOR50umi8O4c3K9jLG2io3on8RELU91f0ddHkpegntBSjyrHFX80+JgK0/pxkGuVdG/DNOha4f1Iw8WE90rOOM811PBZEWA1CBBWhAST96at4V7sG6LgxnZE+Gs1cDp9FFa4gsztF3Jl1IWfllkZHvXySuUZVu6oT0PcJ76sD++vrVrK5x7NpK4OTVhP5CwMnzkV8ndUvi69TZjzYwnvkg/wB9amBhwJ9Fynj481PG3uV9C/hQ508pQ8FAq+T/AKyP2qhfhPwjTewnwgVfRUkyQNwzismt94cuwwX3CNUX8VH+zh/4DXzji/7fsf8ANH86+jfxUqA04ef6hr5xEqY1aJp4S25nP99dBgnu7l5/40/yEZX1N6GDOj4m45/LT/KrCUyTMQsHgCqM+FzWLOotPIjMLCi0gA4NXk46pD2ceK5qrbklddei4ZOJ6SOX5LlH49S9/DLYZQVEN/Sgr/J8KfU9I7zZHnyK6r6q9LIPUy2/KzNv6cDNQPRjotD6WuumMkYX7gVeZWNbQGMHVYc2Cvkxtlb2VtqwtS0/QVCa22o0Rd9xwPk3B/0qbSE9wqSck+1AnWa/RLRoG6pmPJZU4woJycZ4rMi6wfmF09SbQvJ9D/C51+CBgN6v1OoeCtf867FT/pl/tXGnwKSFSNRagd/qrUvB+vNdl7m++oFQzjxV3FR/c/osHwnrhbfqf5Qz1LSRoG7j/wC3Uf8ApXMfwSAjVWoP+Jf866Z6qu9vp/d1D/6dX8q5k+B5ZXqbUKlcepf86PS+4y/ZDxLTGqX6OXYpOHFH7VX3VmbNY0jOMQqDvbVtI/aj9Sx3VDI8VG3yxsXmIuM8kFKwQRWYw2cCuhluWkD5r5J3PUvVuPq2ctM+X2g6raNxxjNa86/dQ78wtu5S5CkJ87ia+kT/AMN+mpch19cVsKWSSdtDmqvhn07bdNz5jCGwtttSuBXStxOB8rAAvNKjwriJJfn01K47+H1xcPVkZt987y4M8/evp/ZE4skQk5/KSa+TmmZbtk6yt2xhZ2IkhPB+9fVzTThVpa3rUeTHQareIHiSoaR6LW8EPyCWn7tK19ZQfnLS6MZ9JoT6TwDCkyhtxkmrEmtpegrQrHKaH9JwjDkvlSdu4msQSWblXXvhHmGvRFMVsiPr+iSa+c3xMTk6g6hx9PlXD72z/E19Ebu4luzy3CeA0o18xOr1yRJ61RS25kJkjJz49VauDiz3H5LmPGUloI4zs4i6vS1/AdButlgzvxJKC80l1SM/UZqVT8EC9OuJu1gvAYcjDuFKFY3Y5rpbQ01UrRVrVFkhxQjoBPnHFTy+4uItpbwKlJIP15FVHVkzjbNpdXofDeEm0kTNbaFc9aL69RNKXFrRV/kjvNqDQUs8k+K6FZmtS7cicxhSXkBQI+9csdR/hhuOqtdx9SW95TSW3QtWOM810vZIi7FYIdrcVvWy0lBP7CoziJwHD3VnCJKk1DoJGcg2K9vTPc0tcGXjw5HcHP3Fc8fDVplFi1rdpLQADriif8a6I1MvOlpznAAjqV/gK5/+HLULdy1ddI6VAlC1CpU/JSyImIkGshd31XSoILhz71B6tX8vFL4OAkZqVK/zTg1AdRVlvS8uQjkobJ/6VRZZxb9VqTnJAXrU0Tek3Va20Lzs+9GS8ZDBHCwc1Qvw33/8WuVyadXktk4BP3q9nVYlII8CrFRFkqHBAwybzNM15+a4N+P3SxtqEToTeA76lYFE3+TuymzSgfJQc1YXxjaUOodKuSUM9wMtnnGcUBfADsYFziEgKaBGK22ScTCXG+xXDR04pfEjWt2N12WR+co/ahvqL/sPc/8AkK/lRGSO8rJ9qHOoqknQ9zwf/BV/Kufi62rv6j8N30K+SN5/26uf/NX/ADpofrP705ef9urnz/4qv502CAs5OOa9Db+T6L59l/FP1K8pUqVMopUvHNKl5OD4NOEli8n5iO4jOMjFdo/AS1Et0GYH5CUqUnjJxXGL7QQ0rYrk0bdMuq9z0GlaY7qkBX0NUMSpzO3KFq4BiNHhlUJSF9WDLtS3FZlNZ9/VSRcLU3wJbRP/ABV830/E/qD8xYkuc/71Mwvif1ApS1KkuHGceo1gMwd7l6GPGdAXbL6Rv3K1qIC5qAP+Koy7ax0vY4a5b1yZHbBON/NfOtz4ndRS0rbMhxJ9vVVfak6ta4vzxaROe7Sjz6jRGYGWm5VWs8bNhaQwXXRHxF/Eku9OO2eyyMN5KTtV5FcxWi9SrbqdjUTKiktrC14PnmtN1l55HzEt0rcPJyaZZdCssqGAa36OkbE2y4PEsXkxZ+d/Y3/RfSroZ8QNg1xZo1tmyG2nmm0oO5WMkVcy5URxsOQlocz7pOa+P1ov990nLTMtspbaQc4SrFXvoj4yLtp+MhidudUkY5NYdRg7iSQu0wjxrFIA2ubay+hiVzFJyE8V6ZUVpJExSGsjkqOK4gf/AMoTIhJ2ptW/77c0K6j+Mq7a1iuNxkrjrUDjBxVNuESOdYhbM/jPDIx7M3XVnXTrnZemdhWxb3WpD8htQwhWdua+c141ndJuuxqtx5W0u9zbn701fdd6hu8xZvLzkhtRO3cc4rQEZEpsu7cZ8CuioaEYWwsl1JXn2P8AiB2LTh0LMzG7L6PfD51zsestOx7ZcpjTTzKAkb1YzV1IkRZP+puocT9UqyK+P1mv9/05ND1qluNJSc4Soir20X8Y140lHTGnhbxAAJJzWVNgxkeZItF1GEeMjHAGVrLOH8L6JBoNJIaQAT5rVkSrda0GVNkobwMncrFcUufHm92CtEXJIquNYfFjf9bsOxo7jjG4EcHFVI8HkedVrP8AGuGZCIH3P0VyfFX10iKjqs9jmpXwUqCVea4viSlyb2ma8napask/WsZLt1uU9c+4yFvDOeTmnS43KWlTSdhb+1dNRU3lG5V5ziuJMr5s8rr6r6HfChOg/wAPKDz6EKCBjKvNXumZaBLUoTW9x9t9fLrS/XG8aQYEKK4tAAxwcUQj4lNStqEgyXcef1GsGfCHyPLgV2lF4soqOmbGRsutfipk253TY2SUFQQc4VXznuL3cmyW2U5JUQCKsnU/Wy7a4jmLKkrIxjlVVnIfFveUdu8rPmtbDqQ0gs5cp4hxRuNVAfTPy2V4fDF1lV0zufyM9zLcg4OTwM19CdMavsOqLc3cYkxpanEhRTu58V8hENurPzLRIWeRzR5onr7q7p26lpx51xrgAFRxQ8TwhtUeIxaHh/xR5L2c2y+qzb65BKGeAKyClsjD/g++a4XsvxySYUPvuxypQHOaTvx5SNQoXHTFLOMgEcVhDDJXnINl2p8W4awZnO1Xal51LZNPx1TZE1sbQeN1cQfFx1wOq4jlrscnahpJSrYrzVa63+ILUOpQ4yxKcCVZ43GqrU9Mn91c9alKcz5NbGH4UaeTO7Wy5HH/ABYapnBh2K7B/wAn7OiqhzFSFpS6RySfJrshcm0/MqWqc2D7jfXyl6Y9VZ3TBbiIq1JDn0OKN3/iX1G44p9MpzCuf1VXrMOfPUFwV/CvEsWGUQYRqu/up062O6CuraZLassKxhX2rnD4KnoTGpL+HXUoJUvGTjPNUTN+I++3G1vW+Q+spdSUnJoV0B1Zumi7lImwlqHfJKsGiR4U5tMY+6r1fiqiqMQhnA6V9V1zrWHFqMpvIHPqrJq52x8EIlN8f71fNmV8UWpSs9p1xW48+o04x8UN/iYKn3Mq8jcapHBX5dVtu8a0AGy+kDl4t4Pb+bQD/wAVD+u5cH+DbkROScsKx6q+fVw+KjUQIU2t3n71kr4kb7eLQ9CkvuJDiSOTU4sHmheLuQ3+MIJeJHHobaKqUyExet3zKlZSJnn++vq5oK92y46OtqzJbG1hKSCqvkcAX9RqvYXlQXvz96tu2/EdqCxw2rdGec2NgDg1pYjh01Uwc2y5fw5jceECWSc3uV9NjcLUr8v5tr/8q879pRymQynP0VXzbPxOagThz5pzPuN1eSPip1BtCRJc/wDyrJGBveLrqD44oQ4aL6JaouFsTpqfiW3jsLAwrnOK+VPUJ3s6/nXAO7lNuqUjn70fvfElf7jb3YjklzDgIPqqm7o9IuNycuDpJ3qKj961cMonUhOZcv4m8Q0mJsAaNl2t8KnXqKuMmyahlhtOAhJWrxXWceXaJwEiHNadCxkbV5r4/wAKTcA4mRa5CmFNnOUnFW/oX4j9Q6RQhEqY48GccFWc4qrW4M4vvGd1q4P4pfR04ZVi49fkvpYAvG0N8fWtZ+RDiKBmuJSD7qNcQn/KDTEIEZFsKingq20Lau+MO9amhrTGQtpZBxg1SOBV9rsW/L4vw6GHiMfc+ll0j8S3Xuz6E0pMt9sktvPOtKR6VZ81T/wHX4X683W8XJYbLpUpO4481ypd9R33WUtx69yHHGyScKVRRoPqVI6fJUzZ1FvdwdpxWwzCfYloOq4o+JXVGKtnPSF9VxLs7biyJrRJ5xuFDnUS6WpjQl2dXJbO1hRHq98VwCj4ktQMBT6pjhJ9t1R1y+I+/wCpLc/Z3XnAl5JSfUazIcGIlBPquqk8XQTvMXyKv74MtQRrtqm/F2QlIbWvaCrzzXW67paA6WzKb3Ac+qvlB0+6j3LpbcJEyI6oGUSVYP1o6X8TF/8AXJMlzK+R6qPXYa6WrcQsrBvFlFh9M2mcNif5XfvVBmy3HQd3S460vEdSk85OcVzR8ELUWLqbUJcfSkJUvaCcZ5qmm/iavd0t0i0yX17X0lPJ9jQnpDqtc+nF0kTYbigJSiTg/WpU+GuFE9nzUKrxRRSV0VXl6V9UDcLSp5bZlt7h59VDnUGbaho24tCWg5ZVj1e+K+f7/wAT9/QovpkuZX/vVpXH4j7/AHe3uQ3ZDmHAR+o1VbhL2SAlas/i2GaBzW91VWqkJY1vcVtnIU6rn++tdLKXhkqxmvVNquVxdmuq9ThJpTYzkcYbJxXWBuWINXmNQ/zE5cF5SpUqZDSpK/SSPNKl45pJJiN33HcLB21sSmUDACRTrcpIQct4IpptfzO7fx9Ke+bdSJa+DOGr1liOWiCkcimY0Nhl0qKRtzzWTaClzapeBWUtKUp7PcwV+9Pna1RykQ57LOSxDdIXESCR5xXoujUVrtGL6vriteNGRZj3C/3FOeE5rYcjz5P9JVBUG/O7FNfMmaOH16phgvSne45lKKfkstbklpQJHmsFTGnR8u1gKHmm22gwSXHck1HKRsnzsf8AhheTZKlbWgjcPetlFrhCP8wpCSrGcU2hSW+Qnfn3pALUd6V8f2amJQ5OZHz6SNTMKXAekfLybcnaDjcRT12ZhQCl6AyAnyce1Jxxh38othtX1xWdugyX7mzaUpLqZKgnPnGaWZo1SDY2EBrbk6LFp527tBNuil51I8AZNbMWya3dSUCxvAe3oNdFaY6T6e6W2VvU14W2tTqQvYqtZ/4mdGw3VobsLJDP+4OaoGt4pzRarXGGCjtHM/K7c/Rc6u2TWsJ8KnWN5tnPKig4rOe3bHG0thKVOn9Q+ldI2r4g9FdT306YdsbMXvejuFAGM0G9Y+gCNIxxqLTUkTUPjepKDnbmiitE4yy8qjUYY2T2lHJxGjf1VKIjMQxxHCwqtuPGhFBX2g2o0oLobBRJT+anyk+1Mstu3a+sRE5QhSgKsPkbCNFl2fK/LE3KtqNCvbyVpgQlvD7JzXkbTOsgtTqrO8kDn9BrqPS1r05oDTDd0mxm317MnIzQ0fiN0jJuDkT8FZSEHH6RVJ9VnOi2v6TShgNVNb7Lnx/Tur5i934C9hPvsNYLRJiYjXKKWT4O4YrouV8Ruj4ykw27Eye5wVbBW9/m+0V1Zt6rg3LZiyVglDeQCTUvNZeyaLCqLM5tO/N9VzO5FjsNF6IrJ+1Y25YlhfzaeU+M0Ta66fXTp5cVMz0qEbd6FEcEUNy1ZaS/GHHnirMcgl2WK6DgtcZGWsvEKfDqu2gnaeAPenVSEyVBu4wtv0KhRV01tse/XRhp9A/UMg0Sdf8ATUGyQ4yoDSW1YGSBihiYwu4bldhomzQGUqq5jUeOUobjgtq806mwvPsd2ywS4SMq2jOK8YeT+DL7oyrbwTXRPwaaatmoRKj3ZlLu/ITuGcU9TUMom5yEHDKGnxGYxPK5xjRXoKj86yUrHkEU6XUvKyngCrj+KnRDOiL6pUFkJbdX7Cqf+Xa+RaW2vKljmp0tSJafOlUU4oZ+DIsXIEeenfgEopptLSVdvt5CeKTKXIeQV/qr1avl2HJBGSBmpiwjzqsGObNZ2yakR5D7qWocYkq44Fbb8CVZ2E/PxVJKxxkYq7Phc0XB19ct1wZThCv6wqW+LvSVu0r2UwmUpDf0FUzWAVIjW5Hhobh81QW9K58iyI0NtTkiOPV4zWs3FkXRxTkWKVH+qAKxDxusVB27Qgc1cfROwwJ2ZrrSVhjkjHnFWJ5w2SyyaGE1L7EKpmbLqtR2r066Ujwdhpx/TusFtlMewPJ49kGun9Qda9H2RJt67CyFs8ElA5xUBE+JXSTeQqwNED/cFVjVTS6hi15MOpXnPNPl+yoO06Q1elpx2VankgD3Sa1EIVDeW1Oi4UD710DN+InS1ziusR7O0gqBHCRVK6muke+S3JEdkIBJPAokVROdCxUZ6ekYOHBPf7KIRGYdUV7RikYEVauUjivIratigVYxWCEudw+o4q5HKGNVEWeL2Ty4zLRBQmslvJJS0B6T5NIJy2pSjyBWu2sqiSCoepI4obHCR107XsOhanpMS5N7UWZpTxX5CRmsxpnV7DXecsryt31Qavb4TNMW+72643q9MpeEVJUkKGfFSkz4gNIpv8yxLsjW2MsozsHtVOapaXckX7rVpsCikpuLUz5Pkue4Vk1AltZ/hdxavOe2abj2PVCnFuu6edbbT/5ZroFfxGaOtjhQ3YmV54/QKVx+IrSU61OxGbA0hbqSAQgcUnTVdhki/dS8nRTxcOKoy2+W659kr7iFMpb7S08EU1b4TSmXHHCFqArYuc1E66PSGUbUvKJAHtWsUrtpCt2QvyKvFxbYLIkLI3cq0IG+TOUy80Ut5xzUvcYsG3BLkcDcfpTTjrC2ytICFH3pliL39zjsjcB7E1Fzcuqg+mfH7cFObEz0b30/p8ZrFthh9ezaMJpNvIcWY6FY9qblIVb3UpSchfvUwQ/nKcObIx01vRZSYjLKwtlOCn6U+C1cGwl5IJSPevZLTbLKXe7ncMkUzHS0s5Q4B/fTAhvIpte1z3Q5Vh8qyXQhSRgVsyIsZsJLaAKZkteodtWTXoQvAKzSBa/VDML4za6weccZKS2KfVIU4gb014483wCM15IdSUjamoB+bRIjILrGlSpU6klSPAJ+ntSpHgbvJHtSSTKJDrzwQpkpRnk4p64Rn0lC7ckuJ/rEe1ZJuaFx3GFsbFEYCsUd9IrS3MjyY8hvvF0EJJGcVAyZUWGIz6BBCIDs9TaIhKnfdIoqjdPVy2Eu3FfYKRnKuKIkaLOiZki7rT3MkqSjFRMvVMvV3chPIMHbwk4xmgmUFXhTmEJ+B0qgyEG4icHEx/VjP0rNvVNnlrOmURkBQ9G7Fa9lautiivsuylrbWDzmoy06bWqS/eWzkpJUTUbojQMzb6fJb1w6bW61upmOS0jvnOM/Wo6+dPLiGBLtranmsZKgM4qQjxZGtA6E3AhUbwnd9KkLB1Pm6XjSNMTbcX94KEuFOafNlQxFma0AZd9VXbaDCJjY3ueFD6VgG1MZeBJP9mrO0v0+TcFybzIGfmMqSk+2aEdSWhNhmOlz9IJwKIZPZoBpDTxuJUEiOi5w3pDp7Kmhke2auX4ZNFR9VolXaegH5HKkqI+lUhMdcuMV1TJ7SUjwOM1098ISVSdE3hKBsKWlc/XioYk+9KLKxgMfFxFl/QqsOuPUO4Xm7uachzFBmKrZtB4wKrVyCwWEdxsbiOfvWzqVlSuod1Dqs4eV7/etK4vuB1CUeAaNTMytCqVEnHrXG/cr1tIs6FSYCey6BkKTwRXTPw4ahk3/AEjcY+pXzNw2oICznHFc1TmlPQD9cVbvw53xizQZUeS4AFgjk1WrIsxVnAZvJ17nHYg/RVnq2A5B1lcFoRtZ7qto+gzWraXA7f4vbThW8c/30d9Rm7e9c5EplSSVqJoAsjhb1HGCU5G8fzqyw+y1VSSOxJY/83/ldI6iZeOjW+84Snt+D+1c3PW+Ou5PLbACgTXSGqVOu6MbwCPyv/aubSypNxfcUs8E8VWpLGQrWxmKqcRltsFitCUq9bAKh4NSelrlqGFqmDMYujjEdlxJU2FYBH7VoImF1RCmjhJ84rGMDNvsdtt3YrcMJ+tWZ7MbosQiZksYa69j2XTfWV6H1Q0jCDTQbdjNjevHJwK5ono/CyYDY7nb9JxXTAhqiaGxcE9glr0qPGeK5jmSFRrxKBHdSpRwfNVaM53LZx10VRVRmRuwRr0oJF7YUj0krGR/fRn8SRPyETJzwKDelR3XxheMZWOKMviT/wBQifsKife2p6f/AB71SZwLSrH9mul/gtdXHRJmhWA1kmuaFf8AdCv+Guj/AISldnRl7lJ4U20sj/A1Ov1pZPqoeHbCuafQEqS+IiU3r2TIajpDimCckc1zC5DdtzymHFn0cY+ldM9HG06xm6mXMwssFzbn++ucNSKX/GdxhEelDqgP8ajS8gARMc9oxlYPzk/stMZkqznxWTeJU5q2ny4QnFID5RxI9ia3LRBcka3tSmkktl1O7H71fzZASViMu+bN8Vl0f0dUemsyD3PyvminHtnNe/GrIMm3QppOQ8Aa1+u8xq0TtKNW8hKlFvdt/urL4uU97QNieP6iygn/AArCY21TET812crR5Kpox2AK5mjFDdq3IGCU1d/w2hS4MtajkYPFUcyn/skAeyavD4aV7YMseRg1qV2sC5rBXcara34QUC9X5iTfXkIYA9Z9qEmG2FxMmOASKNerZR+OPkN87zQMJS0sBKWz4+lTp5IQzdArXtc8/VYQ2EJWohoVkt7aopSmvYi14USgjNeIUhayFCiMdEToVVJaAvRnGRxmlS96VSTpZV9eKwk4RCeWkeE1nWMjmI6k+COaQ3SOxXSnwfLVN0fek/pw2r+/iudtWEMa+urTbIyXlDP99dD/AAnOCNpK7CPyS2rOP2qhNXbRrS6OKR6+6r2+9UKd0Ta6S5W3iDmuw2k19VGpiNMNqkOtBZ880zDnIklaDGCceOKxZmSHHi060rZn3rakdqOAplsZPnirjpIjbmWEXtZIU0yNqypQ5B4pslyTNQ06DtzjNZLfO4K24pxb4UpBUjZ96dyc9SMRoFFwhIcjL5I8Cm2NAxop2Tpga/c4rSia5csaUNsud0/Qc1Nu2i4a+hG4GSqKUDOM4zQS5adrtQ/edHphAv21zukcjbzWja7W/cnwxcUFsg8E09F1G7piWqDKWZHbOBnnNFNrI1Uj5ss/KhHOcYp3nRV+HBm6ViOnDTscKVIBQR5z4qPXoG3RFEM3BKlH2zUtLu62j+ERZW8q9OQaip2lZ9lSbm/cVKC+cFXioNNlYkjgy9KgrxZZlsO6M2XR9RzUa2844nElPbP3omt2sUh0Q1R/mM8ZxmpS4aVh3qKZpWGFYzt8URrlVdHYIEbaLi/Scj617K/o/tmvZXdtMgx20laQfNeqWh0Bbh5PtRg9V3aJUqVKmSSpZ2/medvtSr0fqGfFJJNNOG8SUw0s7MnGcVcOjlMaEtinshx1acpH3qqGpbce5MNpaCdyhk1bSrG4/HiXGOovoQAVJHNVqgW2WhQ2jOq27PqGbqW4l27xi2wDkBQ4NYa30gq/yGHrDF7KGiCtSBjNb90v9onRmokZpEZ9sAEDgk1IWvXsezQFW64sBC3RtQojzVNt7rbLBIFXWrHZ1uYYtkVhTqsBK1AeKl7GiLbtNSAt0KeeQfSfINSLt2t1vD7lyaSpcjPa3D61BWuwSll+43BwtRlZUgKOBijsKoW5mi2bfVRfS3S90/ELhcEqVsJKgn61YWnLRb7s/I/FbaltbZOFqT5rLQt0tkCHLfjqSvsgnA962dLaqZ1tLlxgwIvaJGcYzQZnEK3TRgsbc5t9FDztQSLFMMSK0THBxkDgCgvXzQvmyTAV3McrA9qIdVXtu1zV2URw6p47QvHitVq2s6QtTsma4HTLSSkE525oregKtUPEkbgq0uLDCLY6GFAONp9QFdG/BxMekaMvbYaKdra+cfauYZ6FxZEuUHCpt7J2/SuqfhClNMaHvJZaBUppWcftRMQb/bD7Ifh88PEW/QrmXVK3P84d2Tz/AKdef8ay7Lak71YJBpzUOHNf3dxxO0l1R/61piSkulpa8ZOBVu+UC3osV3JI5/zKzclJILI/atu1XKVagQwopCvoa0lwe2oOqPBrKRJbbCUmonmRA63tQtibKky173nSd31NM295Ma/RcDJ3Cmu4h0gBfJrYt0UIv8Rx08bx/OpFlozZRkm4lg5mXULpK6Iuc/RraY0JS8t+w+1c4XLS+tjdXVs2Z8p3Hwg4rruBrq3ae0gyp+ElwBseR9qr+3/FBpOPqVu0SbA0UOrCVKKBxWTTyFryumxGhpZyM02XQKg3bNrJCNrdieJ9/QaP+lXSWZfLxHvt8QYiYygopVxnFdK6w15pC1afavVisDMsOI3L2IB21zzqzrmzeA7HsTQjODIUhHGKPDKakEFAdhcOGTBznX/hEvxHa+hP2yNpyxOJQWEhCik+cVQzQ+VihyQnctY8mnguRfnHZ094laCTyfNaSJyrgpcZxG1LZwDVmGPglZddWS1s/shsjvpUc31hY8FYoz+JP/UIn7Cg3pUkpvjCccBQox+JJSPkIgKucCqx97ar9P8A496pRX/dCv8Ahro/4TBv0LfW/wC00v8Aka5wVzaFEeNtdIfCOQdGXkA5/LV/Kp13uz/qFDw9rXNHyP8ACHOi2rEac1rfbMpe0y3Vpxn6mhTrJpBWmrs7eyjAlKKs4+tDlsnrjdcHUBW1Jl7Tz96vH4r4jatK2t2EncVITuIH2qDzkc37IoBqaSSnd/0if3K5yURKgqkjykZq1Ph80snVHeuzyMmH6gSPpVVxwlu2iOhWVrTgiujPhoZRY9I3RcobFOtqxnj2ota8sjFlUwmATVjIz2BP6ID13qj+Jeplts617hDfSkDPjBqw/i2e26HsrP8AZaSP+lUCy+o9b23FK9K5nH+NdAfF+0kaPsyknOW0/wAqA9tp4VpQ1JkpaqqPfRczxSBauf7NXh8NaCYUtKOVkHAqjXgpq1NlsZ9PNXp8MT6WW3prnhvkirNbrAsvCm+Xq2u+JCvVOwascvL7jFndWkqOCEmgE2LXoACNNvkfXtmuodbfEXpq0zVxH7I2tTRwSUDmoJn4wNHsJDR0q0rHGe2KFFUShv4S0qqlog4njfsqEbsurG2SqXZXWgPJKDUczFcS4r5gbFD2NXvqP4j9L6jhONRbG00pQOMIAqkLlOF5nLkNJ7aSSQKs088pP4SyqllG0aTfsmDwcDxSpDgbfp70qKqKVYShmE8nxkVnWMo/0J79qQ3SOxXSfwgR1N6WuwSO4pSFYFUZruw6xc1zcXYFlecbLqvCD9avn4NJHyNiuchwb0ISomtO6/EvpXTGq50RyxNSFJcIJ2Z96zmzyiuktEuqkjo5MOpAZvXsufl2bXCwlsabfCvr2zXrun9XQ9rs60PIR7ko8Vfr/wAXGjy4lZ0w0M/+WKh9Z/EfpjUltVCi2RptTgIBCBxRRUTEt9ks2opKIPJE/wCypGbs9KkD1p8prxh5FyfRCdHaycbjXqkgy1zhylwkhNeIYFxmIbR+Tkj1VacshvWrCtHTCzRGm7i/OQ8cZ2k5qRus2FHj/JQ3wwAMcHGa04OlJrENtxm6KdGP0hVac/S3zboXKmdnb9TiqbnarXaLsuo5OkIMtS7pIfSot+rBPmpWwXiDdnfwNspjJHp3eK07laXmISkwZRcCR4B80P6ftUqdOKHlmKvOAo8UR6r+2zdKseZoS0aZxcRckPrX6v1ZxUDeVC8qTEMvDauPPitiVo66ISkruinm/wDiziteVpqO2hKUTh3D9/FQaVZlM+XZaibNadJJEhK0SFq5+uK0rndnbk0VR3u0kD9INa14ss+AjeH1SAfAzmoFImKV+cktpo4as50lwkq5kO9pxrec43Vk7FDgCwrGfavQWh6UIC1fWvVNqHK1bRRg1V3arGlSpUySVIcKCvpSpHhJV9KdJMzXVuEFDfqHg0X6N6ly9Ps/Iz2i4hQwM+1DMeQHUqJa/T9qUSQxcJqYbrISVHAJpnssEaI6o6kwpF+mpv1vUQGzvKB71LPtv61djh5j5YwiMnGM4qHZujuhn46HGytl7GR7Yo1vV1jyoDMm0MhsugFW0VRfotaLZQGsLROvsmEm3tKKYZG7HvintV3G53a2RrFGjKYUlIQogYzW9bdZqsLyG1w+6FH1HFEl2vdgnwhPjttpfAztHnNDzv8ARWC1nqhDTelZml4vckuFQeHqBNaM26TbTckotEQpDyvUUipGNqe4Xu4ogOxlJaBwCRWxre/wtIvRGVRUuLdwM48Us7vRQyNB3UFq6YzbUMTpSQp5WFZPkGhDU2qn7vHbYDhKcYAz4qc6llU2BHmDgOJBxQVEhJLSVE+BVuEWiWXVvyVLym/kSba+48vJ25Ga6X+Dh8s6Mvm5G7Da8f4VzPcnnW4rrKM4xiunvg6XFj6Ou6ZBG9basA/tQcRaXU4srnh4Dz4ediCubtQv/PdQbqlae2EvL/nXj9kjyR8wh8JU3zjPmntesqZ1/c1LT2kreVg4xnmtVFufCRI75CPPnzV+BjJGhZhBia6KMXbc/dMuTFyPyHBtDfAP1oz0PoE6yQQk/p96Dbg0mVGWtkbe2OSKvb4Yoj061TJLALgYSSSB9Kr1JbFsj4VSGVxZM3K34fVVZrXRCtJzEpUvASaiGFCXeoIbPhQoo6tXtd81BJgtn1MrIIoUsDIZvcRLiuQoVJrvZqvVMzOFvULo3UCmWdFNJWkE9r/2rmq5Q4r02RIbaAeBJSfcGuktVR+5o5tSTx2//aucXUlNwdTnPJqrSHnK2MbAcAPkFfnw2a1tQsszS+qtj7klJbZDhzjPiq06ndM3en2opN4da2RZrhU2McYNClmdlWu/x7w08W0R1hRGcZxXUV2iw+v2gu42kJetzXn3JAqEgML7qdJbGaR2HPPNGLx+p9VyjJDjakPRiQhzk4p2UGURu4yAF45xWDaX4N6lWOYkhMVRQCR9KzUygFexe8fStESCoYAFz7WOa0sdpbQox6RSu7fGELGPUOaOfiTtiX4ERxDvsKCulzLa72wlBAJUKM/iLbci2+Luc9hVBx/umrcpiRhzwqQecLNoUwBk7a6S+EBgM6RvBeVgKbV5/aubVkqtynCnI210r8KoTM0PeSyvCw0rx+1Trnf2z/qEPw7eOuaT6Fc9amH4d1TmXGOchqQVZH710raGUdVtCrDuHFRWv3xgVzLcQpOrr783+pLi9uf3roL4S700nTt5iTFgbkKCcmmrRkjZbtZTwSQSVb4JfzXVB2+2oY6kIsDjmUd8N4P710B1fUvpPpKGYI2iWgZxx5FV9b+mM+d1Ok6iRu7TMku59uDU/wDEXq6PqW3QbSSFKiAJP91Rkf5pzT6J4WvpoKieTS+jVT+nFG49RbTPdO1T7yVc/c10d8YDaY+i7LvX5bR/KubdN/m69sTbJwlDqAcfvXSvxoREv6Dsim3PUhpGf8KnOfbw/dLDSRQVIPyXLa5imLa2gJ3hSfNX18N8Zs2yS4VABSTkVR9lbZcshTIGVpRxmrm+G5Li401tatqcHFTrHewVLBswrWk+hQb1fbiNXp8oaSo7jQJDXFWzg29J++KPOq8MtXqQskq9RoNt89CWu2Y//SjQSRBmpQa9zS8/VasZlgun8kIGa2X220D8o4/asHEdxZWkbaxbSTwVZxSa6Iu6lVDmNGqyHgfWlSpVNOlWEr/UXv2rOsJOPk3s/wBmnG6S6X+D1bX8G3lpwjcptWM/tXPWqokWFr26uyGkubnVEZ/eugPhIt5e0ndnW18BtWf8KoHWiAvXNzRu3FLqs/41Qp5HCuk1W9WBkdFBb5qIcTFlu4TCAGfpW0q3QUoG5CUq9q8Q/wDLjAZPHvisHI71xBeSojbzir7nOOXVc817XheOKMPkncn2FZsuCYMpPbI968iMiUkolHb2/r70yll2TMENkEIJxkUnIpY1xU3bdWzrC52w+p8fTOaMGrY9re2OT1SjFUhOQM4zWzpfplYkxEz7hOQpeM7SqsrsxDZ3Q7dNDTfg4OM1WcLlaFPE0DdAFvv67JPdgyH+72zgAnOaKbbGVqb+kuJ+SSnkK8ZplPT2zOE3t24IK2vUUlXms49+a1RIGnIyflEJOwuDinlNwmhY0HUrckXdyAsWuJJ+Zz6dwOcVoXixuwo5uLlwwpQztKvFGqOn1i0VB+eXdES3nBnG7ODQhOtRv0hSFzNjajwM1CM23Rntae6grFqB1cksOo76QcfWiK42WJdIvcWkMHH7VoLtkDRye+kpeV/jUVO1Q7fPyWj2R4+lEa2yqOcFCXNBsj5Ecd7B9uayirF2SFSPyT9+KyWtNvO9784/fmmVpN2O5k9j9uKKFVduvaVKlTqKVejkgGvKXjn6U6S8emCI+hCUelR5p66pbaLVyg/rRgkCm1NiUnaE5P1ppsqt6+28d6Ve1OXZkmnLqiy131rWLLcac2EqZAAJ+1SM3VLGnEphJIcHgc+KCH5QiJ3whsUr6Vgyyuee9LcJI5GaCY7lWW1OXRGa9bwY0ZReZStbo9Ofahlu+3Nib84sq7BOQn2xUdKgOPvJc2nY3W87cYr8cR0pG5AxT2aoCof6omb6osNFsNQglSPKgK2Z15jazW1Kcwss8/tQTGMdaFMvMBJVwCa8hPv6cUsIJUl3xSs1TEz0Q6wvTcuM3CbP+iGMUORHHEp5zisSlUh0yXFfrOea2sIDB2DJAqbhlh0VeR5lL3FNktPMuBWM0c9F9eOadvTdo7myO+oJWc4GDVfwWy6XEqOKyZZ+UfU40rDv9U007M1NqjxVJoeHI1dDde+jjF6tbOpdJYkPrSHFpb5Of7q5/jWfWi1i3SbS+32/T6kmrR6b9fZXT9Hy1/SZrKuAlfNG8rrlpDURM9FmaYPn9GKotc+LZakkFBWHzMsmR3w+i5+a0rrhy5tWhqyPqYlKCVOBBwAffNdTaRgWX4f9APrefQ5LuDJ3IJ5SSKH2vin0dZ4S7enT7Tj+ClLmwZBqlNb65u2s565SpK1R1nKW88AVB0b6jVTY+gwv+5hl4jiP0ULImquGpZ93WPTIWVD++mbWh6TqaPtB27x/OsGipCdqUc1lFuotk9uQW+UkGtFrLRrDMmdmb5rpbUjQb0OgZ9Xa/wDauZB3BdnlKScBRqx7h1SeuFoTC2nG3FV29MAkLd2YKjVakZ7QlaOJy5pAPkExcS9JB7QKQKtXoV1LdsE5vS6iUtzDsVz9arJqSh7KNuM1jGkGx3Jq5NJ9bZBBo74RK0lU6R74Z2zxHVu307q8PiO6WN6bYZ1BZGg4qcN61JHjNUQuO9bI6FEla3BlQ+lW+/1xc1Bp78LvDXc2I2oKvaqn+bS5Necc5QonaD7UKkGR2VWMSkZVzZodA7+UadJmHDfIzo91A4ou+J4SPkoYSk4wM1W2ltUK03cUSUoyEqyKlep/U86ubYiqZ8ACoOZ/dtRmVTW0bmoTQtg6fWhZAXsroj4NYbydKXtxednbX/KucZNuWYiVBWAoeKsfpV1jPTqyyrIlH+tJKc/vU61n9s/6hQwurbHVMPyKAtaL+Z19dWI4wC8oHH70TdONSvaau7NmjrIMtQSQD9aGJ6gu+Sb2eTKWV/41hDlLg32Ne0pKuwoLx+xo74vMXB7BUmSl1S+WPSxXeCdDt6e0G7qBxn1yGivOPqK4i1PMXdNTymnV8dw4BP3q6798XLl30g3pcR9vbb2E/wB2K5/JVc7i7dAraVKKsVQoGFrXE9luY5iDKyCGKIWydXzTtiQbf1Ds7I53vIx/jXRvxlsy4GirG4UkpcaR/Kuc7e6GdQRL295hrCxn3waP+sPW5XVK0QrC8xhMNIQCftR52e3h+6p01U1tNUj6Ks20q/CG3UHGU5NXl8OzK5lslCKnLoScAeTVJLa2Qkx2juGMcUa9KupY6YyvmVI7iScqTU6tnsELD6lrahh2Wx1GsWuHrzJP4I+pvccK2HmgpFi1un0t6feJ/wCWa6MuXxgaXuTSW16caKgPUrYK0m/is0bGIUnTrKyP9wUGOomDbcJX5oKJzrmdUJ/C+uFIK3rG+hP1KDWn8lLiKKZqC2r6Guibh8VmkbrDVFb0802tQwPQKpDV98Z1LNVKZZDCScgYxR6eaUn8JZ9VBRsH437KF/alSSQhAQo4x70vP6eaMs/6JVhM5t7+PO2s+favHQFMLaXxuFIbpLpP4MjI/g69stoK1qbWEj+6uftV6W18jX92kM2KQ42XlEEIOMZo76K9ZW+kjTyA2HUujkVYDHxf6UbkuvStMtLU4cklAqiJKxldIREujZJR1VHC0zevZUAxZNcOpUlzTr4P/AaZTY9eRSp0WF8NjknYa6Cd+LXR7iiWdNM8/RApuR8WGkHbY7B/hpoLdSQDsHFSFXW3b7JV3UlFEy/H/Zc+IS/MJS+gsLT+oHimjcFQXO2yjerxuFbt+uyL7dHp0FrtIdUSEj2phhLcJBVISFK+9XDrusQRkFZrnX5TfcRNWlP9nNMsPXCUra9LUk/UmvUT0uubfCT4FZS4ZWA40rbULKQkcxNTI94bcSpFxX2v6yd3mtpUxSY4TCGx8D9Y85rXabeWnY4o8V7vEM425zTll90szh3XkWdqBCybhc3HU+yVKp5+63Ej8lak/cGmzDVJw+FYA5xSMtIIb2fpqGSyWdx7rxN1mvemaorH3pFtD3LHp/anFll9OAkCmMFk5bOQKnZLMVkEFn/TesfevSQv/Q+j9q9QsvjBFNu/lHCKWyiSsqVKlTpJUgNygj60qWdv5g/q0kvksJcxdoWlAQVb/ethxkLYElzkqGQKSCzPSVPJBKPGa146ptwuKLfFaKgTgADzTGTIoy3Y3y0e5IXkRtmSoh90JI8A+9bX4VdZBzEZUUjxgeavrRvw3Wu8WlN51HcEwFBO5KVq25rY+W0lpV1cLutOoZ4CuDmgunutx+ERyyZ5DbRc7SLhKt+Ik9ktFXGSKyZtbKE/P94EHnFdLwOk2hurjK5AnsRnkD0p3AE1SnVLptddDXEQWd6oiVY344xUeLldZU5sPIgdGEGuvm4uhDCNoR7in31pSlLTg3EVnI+XtrDXymHHHB6se1azu9KA6pPqVzirUhztFlTlfnicB8lkpsKKQFYBrOQUwmwEL3bqbaYdejOPKynaMirf+Hnoyx1TecRMfHoPGaHJJwA+f4UajpjWzcP1VRRSgnKl7c1nJjhJDqV59/NWj8QnRxnpnJCGHxgHHFVRFLrkdJBKqUcvHDJ/VKspjRTcM9k6G2JyQp5oEo+tNfOOOH5VpntoHGRWaHg3kOeg/T606ypMpKmQ3tdP6PvRGnI03VeIcSGxWKYtrjNEvqQp1Q4zSgQrkpSixGUtCvGBVvdG/hwOtUOXbVE35Nlv1J7hxkUYXOy6M0Y+uBHfZkBnjcCDmqrZru0WtDhEbIeG7dc2TZkqzL/pjJRnxkV6xsuo7xTgDmulonSnRXVOA5JM1liS2CUIyASapDXGj5+gprsKTHU2ykkNrIwFCpCbiOQ6nCpKZt4nXQ2t/tJLTTWSmsGkyJWe80UfTIp/TLzbt0bEtA7a1Dk1f8Tp5pO625qSqW00cAnkCp1MojFwq9JRPqzaVy577D7JyEcD7UysyZLyQpskA+MV0jB6Y6SnXBm3JnNFSyB5FEes+gWmdJR48uRKbSl0AjJFVvPnZacWByZDKCLN+a5Und1tCG2o+0n7V43C2BKn1bSa6Ne6baLfQ0sT2eR/aFVv1W0hZrQ2hUCagkeADRYpnDWyqSYW9pvcfqq0nuoiYCEhRPikw2ZG159jaByOK2dNwhdNSwrZJ5Dqwnn96tTr7oNjp5YIEllAT8wkHgYohlHEiH1VaOlLmF/wqpZcxTuGmvCaSIbD7RedwFI5yaUBpKYyJLv9cZp2La7hfLq1bbchSkOqAJAqfSwkoEURkfkbuvLepE9K2kOBRR4FNx2bsmQWRCUtBP8AZroOyfDxadOWxm7XWchtbiQopUa3HoujbSkob7Lik+DxVZ1Y52y1v6LK139w+zgudJ1vjxBvmNBlSvrxWEYMtILjToI84rpOF0U0j1UhOynbs1EfQCW2yoAk1R2t+mly0LcnI0kKEdtRCFkcKFJlURogV2G19O3z17tCHEL+bX6vQkf9azfajOJ2MNAL+opshcoBLSdo+opOOIgIKwrc6nkJ9zVkHJqVlyve6PJGN17HfbtqS3NXtKuBmvE26XJUXYzBfSrxgZqzOkPROT1g3Sr0TCZa5ClcA1ZErROjOm6zATNZlKb48g0GSa+i1qfC21FMGymxXN6YLkcFuVbu3u9ymmxBtkQlQ2OFXtXRbVi0drOS3CeeZjJdOCokDFQHVT4dEaVhoumlZf4g2oblds7ttRbNlNinqsDjk9lCbnf9FR6osbPzLMdPo5wKcTKN1w2lvt9v7U84pNvJjOcveFI9xTbbgbJX29hP/WrTXZxossSeaNpBbt+icEND7RDiwkoH+NYREnCwBkJpp7uSl4UvtD+dbTSlQmShKN27jP1p2jKnymL8HpTEVa1rWdv6a9ZSZz/Ze/LHjNYNTm4TpLw2lXsadktXG5kJt8dXq8ECoPNypBpk/A3Td2hxbWU7FB7d7VmhmE8wCuEkFXvinP4UvcRKX5bS1++CKxkzFtp+XktdlXhIIxUszW7FM9j49wtZpqDDUR8slWftWamYizkRE8/as2Yu1Bek8A/pzWEeQVKUNnA8UuK7sota2TqWSdsMghOB9K9fdEtaAeB714Vd9zaoV7Jj9oJUimUulZSoLTYQpCwDXslwJZBSrwKxEd2SBlZwKyENJIaLmVH2p8yYuulCkCU2pR42+9MNpmXB1TcNgukfQVsKtN3bkIiR4iyh44yBRhG7PTKOidcooUXRkhQqDnI7IB36ECuvz7c6liYyprJxgitmWhDbaXUjO73o/MO39T4a7jCaS2poZwBVfTEPR5i7a+kgNHbk0zXJOgHboWTKGlt4Cxk14hKYwUVndmki2JbT3Uv/AN2aaLa1E45AomZV7r1l1WVYRgGs0NpCip1WM/WvWJDXKSORWLrC5hyyf8KZJKlSpUkkqR54+tKkP1A06dYrSqOwt0cADNXN8Omjompi5qBTQcEL1qGM+Kpm4O92I5HA/UMZrpf4R2xYNHXdxfr7jav5VWqhZamBQNmxK0nYKvOv/Um76qn/AIDpueuAIR2KShW3OKrFuReJUZDMyctS0jBUVeac1iVzOoNyeaJSC8rgfvTM1KlBCWlYPuaemgz7qrVVktbVcKI2AP8ACcg3nVWmri3cLfdnW2WiFKSFea6l0LIt3XPQslExCTJjNHLhHOQK5PuCHPk1NjKiRiuhvhakptemLky472lOIUPP2odTHkctXBagV9a6F21j+yoO7WpOktUToLr3fS2tQSPOOabafMlfcW3hOeBipfW9ocZ1lPmOOdxK3FHn96inpCEoAQjGKsRG7dVgublzD5lOIk/N3FmztIwX1BNdIdPUudF2Ys56T2RKAPJx5rnnR0ZU7Wltc7eUpdTnj71eHxWO9rTNqVCe2KQhGcGq1V7TJB8a2MJIp4Jqv4LKT68xXupVrTdYsgugJ3HBzXNEZ9VpeVEcRktcGuk/h7C9TaCl/Or7hZaUOT9BXPN8bb/jC4x0pyEOKH/WlS+zzQfAnxYiohhq/jWq5FTeHRKCu2GznFSWnWfxXWVsjst+htxIVj35qNI2qLaV7ATiprQsxFp1tbUlO7e6nJ/vqzObNWK6SzQ0eoXQ/wARl+k6b0NbomnZBguqaSFbPTk4rly2zr+8C/crg46pznKlea6N+L22yZmmrPMgJJb2JK9v0rnVDaHIUcMObloA3AVWpI87tVtY8ZKeu4bDplH02UppG66ktmqos9q6uMxmnAVI3YChmuger64vVjSsR23xQlyIgFxaR+rArmh15bktpLSinaRmuiNCars0LRkiDKeQHltkDJ5zimnYYHaKOGujkhJlcuf5aGGHxDZWEuxjg4+orF7UWpnNsaNNcQgccKNNzrS+NRTZ61kNqWSn71lDlNrWpOwZSfNWWR+Ybqsl2QzERuW1pm+aki6/tDDlycwt5APqP1rpH4wHbxD0XZH41wWFLbQThX2rmvT0f53qDalk4KXkkf410T8Xbrv8G2VC1EhLaf5VSnjayUBbVEGPwirk1u0juuaU3bVbbEdf4m7jA/rVsTk3S99pyVPUoJxkFVYQlplW9pKxjCeKwS26hzYlZAzWm9jWxCyxZWsyNdr27rbsj4Y6gWVpk/peQCR+9dGfGcj5rRVic90tIz/hXN+nGO11BtKlHce8j+ddIfGM6f4HsqQPLSP5VnzctRCB81s4daTD6t/w2XNHqkWJCWf1IR7Vf/wq6Rg3C0Tr7dGwVxEladw+lc/2JztIYjLGQ6AK6b6cuq0xouX8qdofaOQP2oldJw4NPVCwaMS1pB9L/sqo6odUbzqvUEywwJq2WoiygAHA4qulXi+w3koclLcweeazuqFfxVOlJG0uOKJNJKktq7i07zR4oGloJWdVVEtXdz3G9yFJWq86rTf4d0jXh2LGYWlTiAsgECukNWCH1m0U0bagKfhNfmLSOSQK5Yucl2ZEdTGygge1dO/B+Et6IvP4idyu0rGf2qpU2jIstfApZJb4dWOu0grmWfMdtV4XZgyfyVbVGp7TmkUX7VVucbd3tKcT3E+RjNaOpn451ne2y2CS6vaf76NegVne/EHJL7pV6iU59qs1BsAs/DyyKqLHeqt7rvqyJ0v0fAtWkVBh99sJWpvg5x9q5lkStRrcTdrhdHHu/wCohSs1ZvXdx1x1IlLLoQfSD7VVbK1zI6W1K9IHAoUMedWMWqXOl4cOizmzL5JZKrdcFtKxwpKsYq9vh56mu2i1yNN6pkm4uyklCO4d2M1QjaVRSY4Od/Gak9GOO2HX1rJWXEvPJyM/enqIuHsgYVWSUNd7U3G36om6uaCd0xfXdRvgoZkrK0JxgYNBTshFxaQ82naEc/vXRHxlNpc0zZHY6NgcQgqwK55XHREtsVbRzlI3YqdK66WKU4p63gs+v6rFMc3pGf8ARFn/AK1g3eGI5MR8guo4QD7mkJZfnsRYg2lZAIHvVxW74e4N1gx9XzpaWRHAcUgnG73qckmVCpaKWR3s+nuhzp70pf6gL+dvKDDZRykqGARRhc4GnNCym4LfbeCTjcOawndSYF1ca0nZFJifLYbUtHGccUPa60vdG4iZzDypIxlSgc4qrxSVrAQ0wtDq5FF41Hp135cIS36sZHFe3vpXZNZWxN4iPoadaTuCBwTVLWqDeLrdmWoqlOhChvA5xVxTO/puJGmm4FCWQCtvd5qD43x6kqETo6zRU7qCLc2Zxts6MqOywcBZGArFMLditJQ3GUF+xIq65UjTvWdDVqjJbiyE+kqHBJoF6idLh0wS2XXu4lfgmrEFU0aOVWqw/h6tKC5qkNFKkeTThKlx9yvpmtdbBkbH21bt3OKfcfSw123Rt/erLvVZxNzZarEySSpDSCcfQUWaS0Xc7yldzLSilr1YxW1orT6J0dyUGN4AznFTVv6oxtIvuWf5YELO08UElXaenDhqo9XUi32N4xJcFPdjnAynnimZ11/zppDD7PabTwnIpy7aOj6vmJvURA2KO5eKLrRpVhUVEWyoBdQMK2j3oD3qy2A//BB0B1XTkfKMK3Nr4OKkDp63asiOXCI4nvqBJA85qcvOi/6Otm6q2urGE7qHbLbpWhlOy5Tx7JyUgngikx2qToD/APBA0qw3yBIdbcaXsSSAcVjblqaStuSME/Wj5GvYmo5nyTMIZJxnb5qD11Y/kFNOpT29/wDdRwVUdThuoQuiKN7igrg+KzgSzCUUrFYSt0MtAHIXT1wYSllLifJFGaqTzlNlhSpUqZOlSpUqSSxeA7Cz74rpr4XPVoq7dz1flqx/hXMz3+gX+1dM/C3/ALFXb/lK/lVTEvc/uFtYH7436Fc4X/jXd0/5qv50wrOTT9//ANu7r/zV/wA6YP8ApsHxmrY6fsFkSaPH1KYVLU0lQWjIov0TrGTaYrrbSigKHscUNzAwkJBA5phT6GAA1xn6U2W26VM/hTGy2b7fnptwW4oE7j5rWkK/opdKfAzXh7S1hWBk05MVvYUw2nlQwKWW6G5/FqSrU6CaUOoVLu/ayIvqzj6Vo9d9Ro1BINnS/kxjtxn6VZHw3SGtP6LufzqAhTjatpIx7VztfEJna4uTz0rCFOqIyePNU2sa+fP8K253MpcLji7ybq4fh41ZG07a37C46AuWCkDP1oN6q6PkaPvT16eQQiYoqBx9aG9L/wBC13bAzL/L7ycgH71fXxcpjSNJWdcFAUrtp3ED7UnNayfifElA5lThckVtY9lzkttuWtpwubd5zTtxfXp+XHusZPcWyQoYrWRa1yYbDjTvKQM4r1yYtspZW0XwPPGatucZQsQk5Q49l1F001TZ+tGlvwPUjqGXkN7Gws/aqU6m9KdSdObq89a4TsqE4okLSnIAoXg3i422W1crVIVEDRBKUnGa6H0B8RNi1RCb0dqa3odU4A2X1jOPbOapPDoyujM0WK0YgJ1H6rnCCzHWjuyHgmQeSj3Bpl165tvBxMhSG0nOM+a6C6pfDTb48Rer9HXBMouAudltWce+OKoURLi8t2FeI6oqmcgbhjOKsQz59CsSuoHUwa2PpCYlXaVcyiMy0eOFKAp1bKISUFPKleabtt1bhOORlR8+wVisXS8p/u7SpKjVkezN0GQNjlbKzZbumFK/zgWlQOMup/nXRvxhAfwXZeOe2n+Vc5aY/wBv7R/zU/zro34wv9i7J/yk/wAqoVHv0P3WzQ/4ys+y5mj8Q2AnjinV5wPrTUf/AFRj9qdV5TVxvUsc/iD6LPTOf84Vo3HP5yf510l8Y206KsnH/ho/lXN+nxjqBaP+cn+ddHfGErOi7J/ykfyqlUe/wrcwz/H1X2XNVpA7sMkfSulbAR/Bbqlc4aP8q5stX64f91dJadG7R7g9u3SrN0HA95foucJqu/fZmRjCzTURiW93AwyXMZ8CnL8sR7zL7I5Kj4o96OrtLql/igTz/aqy+VwgWdDTvqXgyOtqq/jW+7qQ6DCWP/TRZoPqbqDQ8OVa24i0ofBSeKtye9pCGlwtpaI/uoq0X040lrfS9wubLTRcYQpQwB9Kr1FWW04FltR4Y/zY4Tuy5LuLnzc6VdFfrfJUatjoNuw4Saqu9NiLqa42xI9DK1JFWx0I8O0Wo93CzaD3lt/UqN61FRlncc81W0cflDbxxVjda1H5wj71XUQZZH7U9N+AmxH3h6SOV5V5zWzp0lfUC0hw7gHk4/xrWR+v++tnTn/xAtP/ADk/zqwen7FU2dMf1H8ro34wEp/gmzHHPaTj/CuZreVOQmkOqynb5+ldM/GB/sTZf+Un+VcyRObWlI8lPBqlhvuf3K1/EWmJO+jVNWHTkpd1ZmwGS+EKBOBmrtuky73OxN2xDy4yQnCk5xUf8OjFut9pmzrolLqkJJSFc0Kau6nOzr7LhQI5RsWQgAeeajO/mRIr4fH5trrtk7WQ3etDXi0ylTrW2txwnJUmjDRWsnI8BzT2pGiFyBsSVjwTTGleoF9hKLV1sbjiFfpUpHmpe76ZRqlhV8DPya2vWkYxSc7lUadkReZKUkOG91uWOyWDpu3Ku0l9t1cvKmwT4zVZX5/Veqbs4Y0d0w3FcEA4xW9Hs9/1hcRGdfWWYhxjPBxR27q5elraLNFsHfdxt3hGacOspOYzEB7IZGDcdyhrSWj5liks3GJILbqCFKSDU71OjXrXVvbbeaXhkfqIoPuGrNQ2Rbl2lw3EN/q2EGra6Oa7t/UTTU5EmKlpxlB5I+1BfJYosDoZR5VrSQPVc5ORnrGS0QVlvjFNtJ/H0qW/+Vt8Z4qd1A+03qWcypAUhCzj/GoBRcnzAzFT2gTg4rSOwWDLF5d/IinRGujp2R+CFrel07d2KkNe6OlfLG+W+IXi6N2QPFeW/TNtgRBOlrT3UjIJ81NWTq9b4JVp2THTIS76EkjOKCd1eb7ZntNFqdHrrI+WftE1J7jg2gH2q29A2v8Agie7cLp+Yh05SFUCW61Q7XqKLPj4AlrB2j70U9e9RnSlohOj09xIqlOPb/8AuWrQjg05nn/6e3zW51CjK1dcGZ1t/LbbOSE1VfVuU/Ijx7VFSe4kBJx71a3RyaNV6fclj1bUE0DapZh/jzs17BMVZO39qaAHj/8AtSrhx4BPB/1N/khnR2nJNhhJutwglG0bgSPNQms9VJ1O8Wmxt7Hiiu7dYYGoe1poxUx0J9BVjFQOptHQ7bFTcrW8l0uDcoJ5q63dZVS8wckGoQcypVwwh1JHa8VlIfWr8raSE8Umn8KKAjafekt/afyUdw++Kst2WbIwMGc7rKlSpUySVKlSpJLx7/QL/aumfhb/ANirt/ylfyrmZ0KMdwpGRiumvhaSteirt207sNKz/hVTEvc/uFtYH7436Fc36g/27uv/ADVfzpgnCiaf1AR/Hd0STz3Vcf31ruekHeMfSrY6fsFkS9bb+pWL7ReQVBXiirRehH9SxnHm0lQbFCoQ4IT7yASEg81f/wAKCWrrY7mpxIV20q8+1DlfZWaGDjzKjr5Z1WmcqOs4KDimLStuVqSFBPIcWBip3qW+herpsdo8JcI/615obSrkvUsC4IO5La0k/wCNMx/KfooyQCGrAHqunLtooWLRUdUcdv5hoZxx5FUavog5dLiuWmQUlw581avXXqo3Z9OW+2xiCptCQcVTcbrHNjNtuDdyKz6VrnQl3xFdHik1G+VkPy0Uox0Ucst6jT1SCe2oHOauTV+kVat0UEKHd+Xb8+cYFUTcescyUwp0E5SKvDoBr9rVWj7nEuGA521BOf2pVTHNhDvhKWFzUjJHw20I1XJslT9kvL9sSSpIUUn7VsEOwB3oscyCvyAM4rf1ZDVbdV3ZUhvIW4rYSPvR50LskOaH13NoOhWdu7nFaT52wgW9FzUbBUTmEeqq9ceVM/MdbU0D5TjFYGQqIlTEBrY+rgODyDR51aZaslxW1DZCUqVwAKCGnW4zaHHkepfvTxSNqN0GSllw+ewO6P8ApB1lvvTy8sW3U0pc6HJUAUrOQAatHrzo6260szOqNGR0pC0hx0NDx/hXN01KDGXLU3uWkZSr6V098J14Ve9CXmHdx30paWEbuccVRrW+UkAC3sNqW1UT8Pk6vVcxEM8wwgF9nhfHOabizVFwtKbzg4raurKLXr+8JQrchTq8J+nNYBTbbpUWwNxq+DxIwVg8I02anfvdO6a/+IVpV/5yf510b8YX+xdk/wCUj+Vc5abI/wA4NpUTgd5P866N+MIpOi7Lg89pH8qp1Hv0K2KD/F1f2XM0f/VGP2p1X6k01HB+TYP2p1RwR9atjqWOfxB9E7Yv/iBaP+cn+ddG/F+knRVk/wCWj+Vc4afC/wDOBaNycDvI/nXSnxfhJ0RZCDn8pGf8Kp1Hv8K3MM/x9X9lzJbV4chj9q6Y00N+h3inz2j/ACrmCGsd2IUHKRjcfpXUWi0mXoZ828d3a0d2OccUqzdBwPeX6LmpxAe1FMQ8eN5803KmSrYoiA4U5PsayuG46hnBH6wtXFMRELcdUZQPB960OV0FlivjZKLxutqs3LneHbe+67JXnb9a6Y+Dx65XHRl7DshRSlpfv9q5kuDm6M6yhOAR5rqr4O4q4ehbyttO7c0rP+FUK5jfLhdB4bkayuIkcToVzBqnKNd3lJ8h1X86tPoOsHuj96q/WIKtd3pSBk91Wf8AGrI6Cvx0uONuOAOE8JzRaj3cKjQ+9D6n+Ux1rRiWT96rSOdrQH2q0OtLT7cjdKbKEk+kkeaq9PDafpjinpdYFHEfx3rJH6/762dOf/EC0/8AOT/OtZoEq4HvWzp1Lg1/aSUkDvJz/jRz0/Yqmzoj+o/ldG/GB/sTZf8AlJ/lXMkQ7bUlY8hNdNfF+ppeibMGlAntJzj9q5mgpKre20rjcmqeG+5/crX8Ra4i76D+Fcnw/Ibu1vmMPP7TggJJ81tv6CtsK8Sb3MQlCWFFWD/WxVU6Y1LL0bK70dZSknJAPmrmslxidSLI8XZgYcSj9OcbqjOzm1R8OmEsfknO5mKJkdatKyFfhrdpaC43p3bRzinYWqZmtpCIcKIY8bOFEDAxUVYuh8u4OzLimMShjJ3Y80/pTV0KyXJ3TT0VLK9xRvIpObyqcZlbJ/dnK0+iM7ja4+kIiXrS2H1rH5hSM4oSndXbbp9fdk2dL6x5ynODU1qHVkPQ8VZkOCX82PSCc4zUJpzSDesIsm4CEHe8CpIxnGaE110Wpe8O49KMr/Te624mrNLdV4DsZyM1Hc24CCAKLelmgYWmrJcnVqTHSUq2nxmq6090mkWe7uXSQ+YbbSt20nGRTvULqk6mJ+C2h/AbG1RSfNIx5jdKGWajvV4i0Ensqr1VN7OsJjaRuQXT6vrzTsNyOm6xWkYAcUMmtTaLi6X3/wDSK5JNYLjKiOpeSrKk8itE7Bc22XhPu/ubq5dYaMt71hjrjXNIdcQPSFVU0nTb2mJImzWz6TlKjXi7xe3nG5rk1Zbj8hG7zijSBcoPU+3/ACMopYXHGMnjOKGd1ek/uWXj0WxoS6SdSXqG+oktR1A/4VZ/XbS/+ca0wokDlbCQDiqw01Dm6WlqiwYynEA43gVYcHV8qzIDzjRdUrynziqc4HHB+FaVK/iQCCf7qV6SW4dN7Au2TThbiCnn9qpzqlNl227vzGyS28onH1qybpqRzUQ75HZUjkJ8ZoFvzDmoZaGZzBQ2g43EeaUI9uT8SVS/hwGng+yEtPaRRrCMuZtEdxIyFeKPdE6XjR7VNbus8PdpJ2hSs0PakuTGmIiIlpcAKhg7aExf7tHQpSJKsO/qGatN3WUyQYa3LPqSmJBjqvUuKkgDcQmsGFJsayt9G8E5GaxatpkLVPLmF5zXheFxPZcT+njNWW7Kk9hqHZxsvaVKlTKKVJXKSKVLxTpLBLrjUZ1soJ3Crp+GrqE3pxmTYJQ/13KBn71TYlpbTtda4PvWxbLqq1TE3WL+pkhQAoM+aYK5h83CPMj3rT0tvGn7i9qq1xFuolKLnpGfNVrblPXZGy4J7C0+Qriui9DdfbTq+2fgeooaT2xtBWK9k9JNH6tlLlQ7i1GSs5wFAVWY90B1WhUUkVb3XPLKL09M/A7TBXKTIO3clOfNdSdINNRuj2iJku/LEd6a0SErODkio2H/AAT0WUmWsMz3W+QeDVW9Z+sE7q062zaiqIw1/VScDFRme6pkBCPBFTYI0tcbuKAdVzHZOprncW8rbcWpSVfbNX78Lek29UWKfdJHKoyVKGfbFc999CEN25eFrV6VKq7OmvUBnpdpeVEjuDMtsggH6iiVQc1gCo4Mclc6pquk3sq36s3xU/Vsq0rVvTHcKQM596HlpZ+WQO2MgV5NSu76kl3p0576yqvXinGwe1WoWWss+Z/HcT8ysG0tdpY7YwRR90e1R+GXdu0Mq2fMKCcA4zmgRnaRsI817anHLNq2BdknCGXAo/40pWXU4JBC4A+oVxfEXo82CExdSzsMkBWcec0CdKNZv2rUkC0voKGJCwlSz4waPevPUyJ1C07bYcRIKoyEhWPtVMqnYaZQ0z232wAlfgg1Up2ufGQVexN4ocUa6j1YbXXRPxTdP3YVit990hHNxLyUqc7Y3ba52LL0iM0mcnsPpHqQeCDV0dK/iKb0fF/hzWMYXBqQNiC4N23P70UXHpVovWz51LFubLCHzv7YUBjNDpXvppCSrVVSU9ZMJYjzd1zpGiXae8m1xIinQ76QQM10z0jg/wCanRcwXpHy6pjRxu48itFuPo/p4tExosylR+SeD4qs+s/W5zqQpqz2Vsx0N+k7eKKf7gpqWKKjjOuqANQBI1bPujDndS84pQwc+9NNPiYr84bMH3rwRPwdptx93urPkE5rJxo3AJdaHbA5q1FHwd1hSSZ5SQtnTzRd6hWhCTx3kfzrpH4w4fa0bY1Zz+Wj+Vc1WSR8lqqBMPhlxJJ/vq4fiC141q/TlthtLCiwhIIzVasZnlBC06ScMwirj7khUsy6EQGB/u062nukOf2aZbaKo7afoKzS4Y5CT4NXDrGAsoO5Gj6J/T81UnqDaWUtYIfQM/310j8YKDG0NZWz5W0n+Vc6WCRGh6qg3JQA7TiVE/31aPxGa+Z1lYrbFYWFdhKRwapVERdIwjstihmZT0FXAPzWVNQ43yVsSpw+pxPp+1dJfDDf4Fr09cLTdXUuuy0FLaVH6iudUMKnwmUJP6BW3ZtQXHSt2YuLDitkdQJRnzij1DM0bh6qnhtWcLreIdiLKf6h6F1FpXVMy8KtznyshxSknbxg0IyJbr607UbCTzxXSsbrtpfqra49gu0FuO42kIK1ADNeTOiujXmxLj3FnCxnhQ4oME7oRZaVRhEU4L6A3adSVztFsl+usxqLb7et5hwgLWlOQBXcnQzTVv0N0vnllxLsh5g70g8pOKpZzXWluj1tftDMRqa9ISUpWACUmmOnnV5yyW25PXKSS3NSrY2o/pzVSrz1JCu4PNT0F23u6xVD6pkrY6h3QKTlL7ys/bmpjSss6c1bb3m5GGHHElzngDNQ94d/F9US7gyjcl5wkH6ZNM3CMtpOEPZcPg58VpvjEjBZcu2Yick+q6Y+I3TidXaSt0/RrHzTqW0lztjPt9q5mEe6xQmJc4qmFt8EKGKuPoj1tR05jLt+o2vn23RgBfqxRddLPo/qjLXc2FMxQ6d2BgYqhFUSUzrALcqo4quIC65zKn0RnFRUdx5I9CAOSaub4c+lk/WaXtR6uhqgJhettTg25xRGz0u0XpiS1eXLky8mKdym9wO7FR/VD4loFxtidK6ShpgBtPbUtsbd1EfI+c6BKnpaekZ7U8yCuvWvFXu6/wANML7rUJWxJBz4qvCFIjNHbggV44H1SjcJKS6tw5KjzmlMllZSAjAFWoM0IWLVzPkf7TZMvr760pcTxW23drnZX2nra+pDYI3JSfNYLQh9tJQORXiNqOHuQKkeZDZO5purr078SDVn08u2uRR3FIwpWPNBUR6JrSbJvLBS08CVDHBoHeREkjtoQMmnbbKk6feDrailvPI+tBMF1dZXHYohVFuN4lqYuqlKbZOElRo50t1dgdOWDH2JdAGMeaBJOr2bnF7URsJcIwSKFvw9T8nfMVuBPuad0d1I1fk+jVHutuskvXL5bt+YyFHnHFBUqKY+HXnO4tXJJNZyIERhoKjJAP2rWbQ69/pFEgURkdlVklOI6vKyScDKOKRKlfqOaXg7fpSqaD8l6P7P9U+RWcFb8e5sot7hZC1Ddg+abr1tXbfS+P6pzSThXEvVv8L2xplNv+ZeeSBuxmh6dryValiVPgEJc5AI8VoW/qHb4zSPnY6Xi14zzUmbxZeogDCmEMBPA9qp8IrY80Fnb73N1GPn7fGIQ36iE1IPXtq8wHYzzPyzzIIz4zWr/FNp6bMmIy0l4K445oK1Bq1V4dMiC12Q5yccUhEVA1QKiJS31z3USVlxKSduTWBCTwRkUgSr1K5UfJpVcWUdd16FODhKsD6V5gJ5SMGlSpJJUqVKkmSpKOwFzGdvtSpcEgHxTpL2O4LoChaNm33pktqiu7Ujej3p597sp2tJ259xXsZzY2pJTvKvep8RrE7jm1avFyGUkC3kNOHzjin1XnVdvbHylzdAP0UajkW0NOmQt3Hvitxl998dmM0Xj9hmhlrZgpMfM0aLBFwvk3KrrKW+D7KOazQphILbKAgn6Vtx7XeysA29eFfatuRpC9tt98Q188/ppowyLVMYJXRcWpuXKKRb2GQX3HAV+RWouVPcWW3QpTY8ZpyXYtTqeDiYbnbQeeDWyuchDYjvNhDiRg5FSztn0Kk90roBn0CbaV2mzjya10JW4sk1mteVg+xp5xJbbCm05+tLNlULcPVN7VIUD9KceHzCko9z71i04HAT7ivW1Fee3yRSzZlA+1TFykP2dbYGXEq8++K3V9mXFTJSgJUBmtYOIUsolDdzxmk4pbZDbIyhX0pOe2DQJw2WA3dqsEIauSigsgrR4V9KfTcdVWxCmI93dSg8BIUeKxLzNuTubI3K81glYlK39zJPtUXNbILgKeZ7DxYTqnoV1vPbcRcZa3u5/aVmmoMFmM45IcQEqVyDWS29nrPtXhdXcUFoenHFRjj4KUnFOhKxTHE98qW9uSDwM0pkxcUBlhHH1FKNblRAoh7J+ma9afS2VJlIAJ8E0Rzs6Zo4WpTkVrewqV/XSM03b5sm6LcakqJCOBk1mw92wps8JX4pnKLcs49KnPA+tIMDtSpNdZpi+Jel0tvFv2FOOt90BQpxq1XOQgyDFVsPIVimFOKYSpt70kfWmGpshtab2WLkc7gtpXKadWp+UkNSFk48ZNbdjtU64NOPx2y4hIySBmtB10tS1NqGCg8/anADs59FKOF7QSe6eEg2sbcfq8VgVfMHvLbynyRWbrD92Cfkmy6pPsBmsgJURPy82OWs8cimBzZB6pjIJzYjZNGN86Qu1r+XcR5KTin0an1dAAhC5urB4HqNarjC4h7sZzIV9K2IqxsL7qNyk802Vr1KLzQF6Y3H1smpc+awsPXdRkKXyNxzisne/OZ4cLSD4Ga87gvLhU4jAa8ZpPrEv8lKu2G/elZsajd7z7Q3K8hzvwdCme33FL4BpR2Qsrfku4K+QDXrbEh0bYLBkrT9BmpG26TvN0V3psdccI9iMU7Dwhqisi44uAopodhSi+ncPYmn4t/vUUlu2zFpQf7J8USu6YRKAhrO0+M1GXDStxsCCmJGU/3PBAzUY5IpHahIxyt0C0XX9TvgvrvDriPKk761G4se4qLhSA6jyfrWTce62on55taUu+xHisewYy/mGXMhXJAp7Nh1UWPfI32+6fFzLCTHW1nbwDTSH+/ne3jPinFvsSAMIG4V4pROEFvbU+K16Ewua723SsWSY5VznNZpa+ZB3HGawWgpIJ5FePOlACUHBNRtZTzNOy9ahNRngtTw805cVfMbWWxkHyaYNtW8nuLf2k+Bmnba4UzEWxYy46dqKlnAS5Tos0xo1paDiFhSj5Fa7zr81XpykGiDU/TzUFgYbucxpwMujcnKeMVDd9otBBASrFQjIdspPjMP4iwU2thokr3YFNwnnHCoFOBTraVbSVnIrxh8NkpCPNTcbKAGfoXh/URSr0he4qKcCvPPjmopJUgNx7Z8K96WFD9QxSJBBAPNJOsnbSw0neFhWfNYMPuwT/QHNh+1NpS+hRStZKT/ANK9LIi/mNr7mfYUk5JWT65M1W6cS4R9adYUyhO1SAnHivWX25AyvCSPampDYkqw2cbaShcrI+SR4rykMISEKOCK9wrzjiknXlKkCFcIOT9K9KVp/WnFJJeUqVKkklS8HP0pUjx6vpTpLxxZkENlGAfevVufhZCUjuBXk/SvW5QWC2UbSfBrOFHdXcG4TiCtL5A3EeKRIYNE4BEfBi7qQtul7lqKQ2iAhS0OEbse1Hx0zZ+nUVEuetC3VDJSfNEenJNm6YsMB/Y8qUByf6ua3tb9Mxrq1m+22d3QpO7tg5xWfLUyA2AW9DQTw01490Bs9Wra5dWIrFrSpClAZCaty5X2zp04mciCgq2ZI21zC065pbVbNmnwsHuBIUR966HvkZq3aNRJOCHm8gf3U9RSx5g4FSw+qkIe141CrlXWe0ImO2pVsR6iU7tvit1jpvb9Xw3bzCdTvIKtgoBtmnfxe9uIbjZLiuDjxV+aK0u3ou3GZcJuEFOdhNJxOUNahUTW4lndU6ALnO72udbLkqDLZLaEKwCRTUuX8i2GkDfv4q2OoLcLWK3nbSwnLWSVJFVQ20lp5TEnlTRxzViOVztCs6ekZHsVlDYQGS46rBX4phiQqC+U43JUfNOKjuTnw22opSDROzpJ122qdQ2VqA4OKOcvdV2ROOyHn4TUlHdZcG884pqM3c46VMqiKUVcJOKN+nWhGrjKck3eQGUNHOFcUTXqTZYLwVb46H0xj6iBnxVTjFXIKS2X7oH0poJdyQ49flfLpVynfxW7I6fwYKXXYUtLpTykA5qUvd8GvLeqPaFfKrjjB28eKiNEw7hFW85OlKdDGcgnzT8V3olDA0Bv3Qo5Cu7jzjbkRaUp8ceabaRJZUUyGS19yMVZSNXQbnKUz+HpQlk4KtvmpGXYLJq+0PPQ1oQ+ykkAeSamJAnNEBqFUamy2vv97ITzjNOKbZveFAhBb/61N6Z0ZLuD8tqeS2lnO3PvUNLtjsCY6hBKUoJ/vqYddUZWPZoExKSpLZ2J9TXj70T6E0i3q9py43lYjCLykK43YoZgSXJN1ZDjR7SVDcfrVg6tQ7LtTP8ADCy0EJHc2e9It4is0sLAwyO3TQ1za48w6e+VT22js7mPNR+sdKtTLeu5WghzjJ2+1BskB1RYziV4J981Y/Tcv2+2PQ7wStLycJ3UFw4SlFPJUOLCNET/AA5xLQ/p65R7ntL6UKACvOaqm52OW/rWZDaZPYddICscAZoytcd7StzfXEfIbkq/SD9aKksW6JbXpklCRJcBKSfOagHXVx7DWRRjZzd/mhZEC2dNYInKUmQ4sZ2+aYguWvqSy644hMVxIO0eM0CXqfelXVxVzStUXcdu7xinLfKnSLpG/BcobChvCamG3CpOqXGZ1xZqzululWKS7HeQVIScJP1rRjSXMKKmztNH/UR6Om2RsNguhI3n70ENSo620oSkZxijxFVqlrQ7Q2XkdxCWnFpG0gU9pq0v6imKihJQhRwVVrsR3HbqzCQDteUAas+5WuHoeBHAIQ5KA5/elK4KzFTNe0FbFstVp6aRzPWEzONyh5xTCupMTWLxZtUENbDhW1NPM2OW/blqecMlMlPAPOM1v6G6ft6ajS58iOAXASARVGTLmWmYpDrCOVaxgR5jPdDoQ8j2zzmtNjXkXTzpjXmGFgcJKh5oSuF1vSNYBqK2vslz9I+masbVmh42pbZFkOthh0JBORgmpvy5UjZ2kPUoqX+Ea8ZKmkIaP9UYxVe6gsL2nJPYfJ2K4BNWW1pBdjtargh3Z8snIH1xUdYobPViPLMnDS4IO0n3xTxS+qFVQabKuXLaIrQmg5B5xWsbn8/lDbeNlOzX5bF3esj6CGmVFAUfes3I0a3JCmsKKquA5gscjhnVMslyQcKTjbWL6UhxOVeKe+ZS0nOzG6sEQ/mzuK8Zp/xCpR85Mq2HYXfhqmNvY7QyRRZ0M0TJ6ja1hvMtFTcR1JVx9DQK8t5iWmzNrJMghIH713v8G3SRGk7Uq8zWBvkJ3JJT9aoYhVCmaQtPw9hZxOtzdgUa9ZuklsvfTNCYsRCX4TAPCeTgV83p9pkjUEqE8ktiOsgcY8V9iJ7LM6G/b3NpS6gox9jXzk+LXQL+gNQGfboxDclZUSlP1rKweqyktK6zxlhtOIWzMZqFSHoAUhRxt8Uw28rucN5A968fbVIjsPtq9SuVVsGS2wyEIQFK966NvMbrz24kkEzdLJiTOWohtDfn7VsNtFqOXyMkDxWMd1CgpS2uf2ppFxcLwZWghGcVMmyf8Jtl5ElqnOKQtG0Jp5UN5x4CMCoe5FZXBcdhrbFA7i/pR30zsTJhOv3cBO4ZSVUMuUqSIyPuUJCyzXXG47LJUF8EgeKnndGRLJHQ6/IC1uDJST4qxdPt2GFGmFSm3HMHZVK6pud7/GH1OFYZCztHtiqzJHSK/UQNoLX5r7fJFDWh4k2IuU08ErxkJoXbs1zZfdS+wpKEE4OPNSWj7ldpk1o5UWUEbhV0zGdMXezhtKmm30p9XjOaT3ujSggbX3ty23+a55VGU+4dx27TXi5WwfLpRnPFEOqLSqFJX8qMoz5FD7C0N+p1I3irIcs98VivER3In9IIJ98U25cHJx2Brbis1XFwubFt+inlON4Co7WSfpUwbobdE1SpUqinSpeDn6UqXvk0k+6yWhC463wNpQMijrpJa2dSRZMmUkJVHBKVH7UBSVBUdew4wORV0fDvZ497gSoTjoYCwQVZxQZSY9SrlDHlm4I3Kq7V16XIu7ttM3eGlbU8+KPemXUN/SxRbpkwvJe4CCc0SXL4b7Ci9PTVXhClLUT+qvZPQyzWhv8AHG7mhxyN6ko3ecVW8ywbhaP9OxOCe4cMv1TmsOnsXVE1jUqooZwQsHGM0YIssPUGnBbVvjLCMAZodt2tZ+pbNItzsMx24SSEqIxnFVRZuqV4Y1n+CMLWWy7sOP3oTIpC0uJVyWpihY2oaN9Fa+l9IQ7GmXNkJG5nJTkeaqDXvUq6XS4v2pL6mWkEpHOKvXV3zMSzR3wCkPpG7++hCN0WsOtMS3JaGFnlRzilTy8xBUKyl829tPTHLm19EFdPL9Ft8B5iS8lxx0Ec0NX20uC4uziCltw5FXfG+H+w2lSXWruhZRzt3VXHV1tq0AQo4GBxkVZhqWyaWVCvoHw7lV8JrjVxajxkbtygOKvzTCYECyIXcNqVLT4NVPoezw3I5uj5C3WxuSk0SQJlw1PIWzICozcc+nPGRTTxPdqChUVhoUWL0qu/sSFW+T8ulQOMHGaD4VqnaW+aiyUmSlzIKjzij+xJf+TcZQ4UpbGCoVN6ft9hudvmRpT7a3ikgE+QaAJh6LXbS2Dfuqf0zZksJly4K9ynMkpHtXumyE3B5mcvtBaiCD71OwbajRcqe+He+lRJSnzWhpyzfxs/KnSl/J9skpzxmjtlaVmthIy/dR2pGzb5aYlqjb/mDgqSPrU/ZtG3TTzTdyceUEPAFSKLdC2WyOIkrnuoeXEzsJ5zivTqFm9vv29xPbbZJCarPer0dORuVIR7Pp262J6UmW3HkoQTtzgqNc9X2VIcvEiK80UNtqICiP1VYF0sF1k3dtyDPUhhKvUkK81CdUmGmo0dLDGxxAG9QHmrNO4lVKpzI9wgdVzTFSpgNYKvCsUTaL1PGtSVwprwcD/Az7ZqFtkKPeVsxXgEZwCo1btj6Aacl28XBy9Nh3GQN1GlfwFn0dK+q5wbBCrnTiNImC9xXwsLO/aKeua5rcuNAaiqQkEAqxW7cfmtEvKbYfMhtB4Gc1FOdQZl0IUm0kKR77aCx/H3WgXsYcjRqvdcByzzLcsLKt5TuFOa/m3NUS3SLY2paAElYSKFr9fZd4eSqY2Ulo+kGpa0a8kMxxDdtxfSBgHbmplmVV2zcaWRo0a3ZEBtTOs7Q0wYfadSkBSsfatGJa7PoRpxUh5CnADjJrBjXs6Gost28tBzx6fFEFi6Yx9fn5q63QMhfO1SsVDPZGGTEImm1nD91W1zv7N+dcCnBtycVExYaULU5v4HirB190ltGkMCBckOH7KoBkMLjtFKVHB96MzRZdZAWu3RJpaI1MkpmgAlg5om1FDm65U003u2xccj7VA9NWiXjHKspc4J+lHd8mnRjJNsY75f/UUjOKDM6xWhSRkMunrFLk2SIiOWC/2Rg++KIY2pHrzDcZajkYHjFVbA6lz7bdm4TltU6mWrCjt/TmrJvV1b0haW7pCi91UhIUpIHjNVZInZlo01SXxkxDlQq2WIV7D0mCCsLzyKMb1IdvbDC0Ax0tgYHjNVfM1y9c7kiUYRSUnO3HmrGg3B7UtqTJ7BYMdOQMY3Yqb4nWGqamljkkIiGqYvAeuEAQFkoyNv/FQHHXM0bcxGbQphEg4PturHUOv7mq7IYTEU2IysDj9WKkpF1TrubBRcY/yimSACRjdROHlQy/iXuoTqJbmGGWpyGwlx4ZKseaByhxtCXHFbuM1a3WuKmDZ4rYGEtpGD9aqW2umcgNr8CrsWyxqttinCoycAI8V6pxyORzgCnX3m7fwoUytZuLCy0PbzT/hlVpHcCLKO6POl+ioOq9Uwpkl9IS04knJ+9fTjSUjS9o09DgMXGMkNspSfWAc4r53/AA46ftkm4hq53dMYlQ/UrFdZSum9hbYbkNa4RjAOA9XO4xeQiy9I8KBlDTcc21V5G7adadDi7rHGPGXBVRfEdpXSOudKuyDLjuvsoONqgahZGgLLcmwlvW6E4HnvU3cunenIWlJri9atvLS2rCe8Dnis2Bjo5QdV0VVVSYhFJA5o29V8+Z7P4VeJVvSdyG1EJpiGC0tTkhPBPGaktRMso1dNQ24HEIcVhX15rUmuokgNkbMV2cZtGCvGRpK+F3YrD5pJXltHFJ5QkFKGWvX9hSTsjowBnNZQpXysjvlvODkCncVA+1flTkLT13Xco7zkdZa3DORRpridcoFrYi2hhSVlIB2ii/Q97tF0tS1XFhDK20+kkYoYvGtLbGnOdxhLiGjxxVdztbLX4Yp47oLtN0vdqdRIui1tpVyQr3oyS3B1i2luI0Co+SBWqtVr6kQ3Et7Y62wcDxmp/pbYF6ejy3XRv7IJTn3qTnthQ6drmXtzX3+ShLg9E0Ez8s42ErcGM0HSbjqJ+YJdsW4tpZyQk0YXaAeoF2eZuH9HS2o7SeKbXOtvT5oxlNpk+wPmmY9syU7TIRfltt81lAMydCCJMclzHORQje7PcY8vuhhQRnPirQ0PqWz3ol55CG88gGtHqFqCBGCmI8dJzwCBTNepzxgDRVtIcSuNsS1hePpTdokGKo/NJ4+9ZolhKi8+jbnkA14taJx/SECrDSsh+hXlKlSp06VI+KVLODn6Uk6xLJTHccUfA8VaPROW9+ETlsOFpaUnBziqxKg/+UrgHip3TOonNO3Bq1M8NSSErP0BqEo0R4JMxWtctdauY1LJYXcnS0FkD1H60SWW86qulyj9ma6+yVDegEkEVLa56eMobjzbKgSFzMFZTzjNHmgdLWjQVjN1uy0KeKd21XtVbPl0stRtO6TW5/VT9xlWNGn0W1LCI0l5GFHwSTUBpnohZ7et3Vs9SApGXE596qDWnUO46j1zHatyVIjtujx4xmrv1Rd58jRMdEN9Q2tALA/aqxaaT2Z7rRinp6qVzfhCcdvjesoEmA22MQwQk/XFULe9Z6ksc+TCRKcYQgkDkii7RGuY1puC4bqhlZwr70Rar6cW7WsRdwgbQtQycUWP+z9oe6qySQYrES02y+iBdBXfVF7UuY5c3Vto5IKjUZ1AuYu8kRFqytBwTRZpW2N6Jgyosv0nBAzVZT3VSrtJlJORuJFWozfWyy6lhA3T9ulu6eeacLhLQxuT9aOjqKDfWmhbUpZWAN23jNVmhS7iosuHGDitm3PPWi7MNJJ2qUBUnMugwz5NFckbUKYNtVb3PStxONxpvTdinQosu5GcrKwVJGajdRRIr7MN1LwQ4rBxnzU+yyuI1FTJeKGVAZJPBqjmW1luN1W1v1FcVayTAuoUY63cEq8YzRn1gS3ZWLejSjwSJAT3e396nNSaOsF5cjKtTjZeVjKknmpGVoGDbYDSLrNDqlJG3cc7afOocC6DI0SfY7fGlRZKnVPpBdANa97uKm9irf8A6VeN2Km5DbNifTCbeElt84HOdtPXTTlqsUMXV6Shbjg3BGfFMDcpnFzQtO1SGWLeZs+SEOITnaT5qttW6ud1BNVGQydjZwFfWvdTSbnd3/ylKZYSf2BqIM5iMkNBoFY4Jq5ELhZs9SW9lrh99spDeWyP630qUgy9ZvSGxbLm84yCNwSo4ArS7jc9xMNCcKd4Bo7sYj9O7YsT0h1UlPpJ9s0RyrwB0p4noiazs2t63j8WlJckY9SVHnNQ8/UVtsk9MNq2JKXDgHbVa3aXdGLuq7NSlBhatwTnjFWHpZ6HqttqQ82kljBJ/aqrm66LSZWGbktsonWsVh2VFcQ0Gu+RxjFTL71s0lbGHX4aVrcSCMjzTGt20Xi6RW7fymMobtv2qev1ibvlpiycA/KJBUP2pB10SNpdJJLbQ91jpyVZ9RJ7tyiIjJ8pKhioTW67vbyRpaavYn/5ZqE1JfkXON+G2tQjuMDaSnjxWrorVJtMj8Mup76nTtBVzUwy6rGsMsYgA2/MoN6dqGer/tOc44oeQo0i8opLDg8jGaKNb2QWtSbm0nCHvVj96HT2pEfe3jeBRg64VGaMwalFGiQm3Nr2qy45+mjK13di3Fxu/oCw7+jf7VVGlbq9G1BHZkkhveAc1Y/VeGi4NW9VnPCgneU+1BkjzLTopc4UglEATO/FtqX95ylQTnbRYgspgEXNsLBHCFe1QFkvMXStsjtlkSVqSNxxnFFTaIN/tTlxQ6EqSndsz4qle61YGS8M8NwA9ECvWmE9PMlmKkJSc4xRKzdf6OliPF7eweAP1VXY1yqNqhNoU36d+39+ata8vWy1wYt0dCUEgK2/WkI7oVG9zZDkIBQvKg225T25lyhpjJaVk7hjdUHr9+NdrnAOnEhpMZQ3FHvii7Uki368sTjkdxMJbCMjHG6gjp1CWVzE3M5EfdtUfeiBpJTSOFi31TXVq9KvlnhQCnC2kgKP1quQz+HMtqTxgc1O6svXzl2cjpThLasA1GPBuU2lC1Yq/CMqwqmYOOb4k38mL01uJxisbYDCmC3hG4rOKx767b6Guc/SnIclTNxZnut8JIJzUnOcgRiOL8yNFdNdUNsIuVrmOx943DaSKcNl6mBvtHUMkgf+YamX+ri5MNi2wYxUpIA4FMzdW3uK0la7e56/92qznn0WnExsw0eVqW3SvVF5tYj3yUon6LNRb2nOrMacIci9S1odOCkrPNGVh6p3eyslYtS3cj+zWq91hmv3FNyftKkhlW4gpoImJOyPwWOHPIQgDWekb5o/tTrjHWO56lKI81HJbi3iMl1p4JUBk80ddSes8TqXDbtCbeGlNjbu21XUaxG2oLqJWd3tmrsT3ELJq2RRn2bk4UOIQpKU79tZ2F5uRckplJ2oCuc1lBmlhKwtvcT9q0gVvuLKR28+9T/Kh2aZAQrxRpWBerQF2mWltSU+oJNVTqPT9yiTVMNMKdAOFHzVh9JoCkW196Rcc4STtKqhLzr2LarjIhqjB4kkBWM1Vibdy1qlrZIrAoDVG1FaiH7VHcAHKgkVenR+5RrraXVXwiOtCfUF8Z4oEs/Ue021SvnoSFBz2Ip6U9L1FIT+A5jsun1bOOKedt0GkIavOoEtci4Po00MbCeUe9AaGb5PCkXOMtSk+6hR/c3I2gkNvPESXV8qzzWk51AtlwSHUwktn34pQNso1hzbLX0TpS4PvdxRUyhJ/ai2+abtioan5chBW0Pc+ai7NrePOnM29lAaCyASOKXV20SbZFYehTSQ8ASAqoubzqxCGsiIJVe3BIuspTcVHpZPt7160ht1PZWQ2U8VqpnvWNLeGisufqOK2JMQ3JAfbX2yrkirhHIFjNDWykleUqVKmTpUjxSpUklk1HMlJWPTtppL+CoKT+Yn9KvpTxf7ScJ8GsG0B8KKBknzSAzKTfZG6tTpNr1u2Exr4oSEnhO7nbW91Omzrs0p2yPFxC/CEmqhiuPQ0q2Zyff6VP6V10uwOlc9PfT9DzVeSLW60oa3KLKDtIvMHUEdmValgrWAVFNdCXxufA0gjEZSi634x44oFa6m6fvUtt78ObQps+dtFF26xWtUBENbKFBAwKr1Xt5A70VygEEJe8/mVDqtGo27+p5ERwIUvOcHiuhtBT2rVY99ylBCgnlKjQK71OszbThMBG4jg7aBrnqe43p1YjOqabJOADijysE8YaFSikgw4PYfzKe6k6r/ABS4Lj29fpJIyKDEr+RSA95X5zXjbbkdfdfJUoe5px9pN0wc7dtWY47bqlJPnWbbSUD5hv35r2GtMm5sqd/qqHNNF35fDGcik6gtEON8E1JxtoghlzdWVcLZEuJhyzcAgM4O3dUzqW4RL5a2bfGkhtTaQncDVPbLnKAX84pCU+2azEq4BHaDygR75qrwAtDzZaEYxrlM0kruGcX/AKerOK2HtXT9TDtrmqT9Bu8UAIkytxbkrLgPHJrxwuQFhxlzGecA0uAFE15Csa2yGbbJQi4yw4pR4JV4qQ1RaVTSxMFyyyMHZu9qquUJtx2yPmFAo5808L1dXmewX1FLY+tTNPZSNeHog1neIyGWocJABAwVChxMdpLaVnCirzSZJmoUp07lCmoyFKUtKlePFFjblVOWQPKycQiC4J7Ssqb9QFHWnUtdR7co3BYaVGHpB4zigNuKsu5cVlOfFbSrtJtbyPw8llH9YJ96huiR1Ig9nbde3O03ORdTaW4yiyhW0Kxxijm1wY+jbA8VOgOuI8ZqPjdQrdHhgLipU/jlWOc0M3e8StRKWoOkI/s5qJCMS2AcQKzejdiVqBFwuMv1gbikmtI6tagXuTYHFgNrUUc+1aHTnXp0ra5EDbgrSRmge6uKuF1k3EObVrUSDQwyynPXiCKNo/N2U3rnSb9oWLjY8vl87iE84pzSGjvnQi63f8hxv1YVxXmkddix5bvKPmEp/SFc17qfV7mos/hiflm/onipg2USxsUpd+y2Na6gZuTH4Y2oENDaDQbbmnYyip0nYKcYaU4dzi8rHn70npRX/RlI254zU2tVWaXjr2SUSVd6IPWjxijHROoDKULZd18HgKUfFCcWILWgvLVu3U13nJKlKYPaUPB8UnFNFIYCrR1Mpeloql25v58vD0gc4qG0jedUIcc+bjutNO/1T7Vp6M1snTufxxv5tI8BXNFaup9kvq+3HgoZHtgYqrwrLRD4XHnfYrWc0jBkT0Xp1aUuIO41FdRL9qC+mPEtMdxbUbAISPIFTEtxmWQpEwISfbNOx9dWPSCQl2MiQo++M0ulFkDLc5sFqafgTb1AbE10wS0PUCcbqjtSaiZsiFw4KhkcFQ/rVo6w1yvUZ71rQYifJCeKFUBVyAXJcypHkk+aJE2+6qTVJAuPyphcpc+QXlt7ST5px1hxSdzaj6axekpccDDTeNvGRWy4osJTgZzVkjKqBbfQ9kwyVL5dRnbWbkh+WhUeNHJPgYFe/OJSQgoxnzR/08iWVya0qWUFJIzmmfM2ysQRPmPUhzRDUmzzkyrnBJSDn1CrZuGsLVc4SGmbajKRjhNTWtIOkkQWxb1tbiBnGKjdPwNNtRFuuyGyrHjIqhJOL7Legp3QjrCi7frS3QElh2ypXnj9NRl9vdrkR3A1a0IU4DgbalU3LTwuRZIbKd2M1KTrRpmQ8xITJaCcgkZFRDgNbKBgkrhZjwFQj1vksS1uCAWkrPCttaj0eSysKU8VA+1dG6nt+kJVubZjONBYGCRiqW1RbI1vfzHdCxn2q5FOAFlVFHJRHneCoEPNsFO5Oc05OLbjQ7IwT9KYW33kbiOayitFaTvONvirDRyqiIXDmUhYblcLXHcQiSoBQPGajjKQuYtySjeVHyawQ8O4WyrinFRgrke9RhbzKTZHnRat0jfNDusIzirQ6VXO3x7JIE9SUOoSdufrVeIeEFBStOcimWXJLyj8q6UJV5ANQe26IJS1b13ujt1vMkSV9xpKjtyeMVHuNJccCGkYAr0xlMuDceT5NOvuIjpBHk0mNsoPlL16hXyL7T7XC0nPFSN/1NOukZtuQpS9gGM1FISHj3FHxzis1yW1qSNn6ad7QHBNndskzKS+1tkscjxkVjHUpxRG7akHinH5KH9qENhOPNNSGlbfyzijP6UKSF269pUqVDU0qVKkeRtpJJ5php/0qVwfNMzH/wAJUG4g7pV5xWPZcSkoSrBV70/b2Y9qQuTNWHFeQDStZNa6ablbSlMhO0ufWlcI6YaQ5s3hdeN7L++pxHo7f6RTzpnHDUhhXbR/WIpXspBh7Ju3RgppT6Rs96xbQuWVqUr9FYyJhA7MU59jivY5Qz6lOAZ/VUbBRffNo+69hpEzelaMBFesOIStSUpxtrNa3hxbWy5u87RmkmOWUlcodtR8g8VLMAjPacvRdMrlLdUUFPA96fYaCk7m14+tMCVFC+yFJ9XGacfbMDalhzf3fpTvshSXc4LF1nLgKDux5px1fCR5x5rBUWfBSHQ0pYc58eKQUlCcuqwpXtQwpyNLWryQ84oJDJIA81mlalN5SkkjzWLSmmsmQoJB8E00uctpfagt97efYZqYNlAPeOoXWSHVKURsJIp9EZmQcuugY9iayaRJipCpkcoDnuR4pmXBaUO4xLGT7A0r3SLnnYWXskhn0MryPtXrCu20oJb3FQ5NMx2W2uH3h+5NbaVvJbUILJfz9BnFIGykQe+q1Iq3Iy1YBIVT7aEpCnCvk+1Mx3HmHSJjRRk+4rKU00XEuMPhQ9wDS3SAP5dFgmU73tu04rYfCHQN6cVi9KYSEoaAUr3xSfanOthSWFAfXFMNEmOeW7LJMKOpokkUxGZ7QWUHxSZYcCSHnNv70mnmWFklwEVMWKhG94dqnIcruFaXEYI8ViGFOuFbqtgBp9LCbgkvQ+VI5wPemg3Knr7M1BjBHuRjNRLgUZjTa6yVFjyRnjCawDgJ7UdHA8kU1NbMP8lh3dnjIrKJKbt7ZQ/jc5wM0rBBbfMtpERIQZCHMlPJGa01SE3JZDScKbp+LFnJUotJUtt33x4r0xE2Z4O+d59QprhTykLFtxUkduQrbs8ZrxaQtQCPSB4+9O3BuFNQl+PISlQ8gVrJWZCMNHKm/wDrSsE26ydCuErb3Cs0JDKO40Np+1eRHLnJJQ7CUEp43baxfW20oJccCT9DTlwcmBeNhb6rxEu6yXNiHVAD7068ypoB2YveoexrxNxjxE5SB+9eBmTeF95gFQTzgUtAnL3/AJtVgZInKDKWu2PAp5yEYqQSvaDSlNvNpCnGC0W/tjNMCU5eB2XDsCfepEg7JFzuwsng0lCC62ncR71hHlmSpQKc7fas2ZUeD/REuBwr4rJyJMgnvMRytDnkgVAkBMC87i611JXLd7SUYGfNZyHp9jSBCeUVK+h8V5KuabfhIR61+ePFOtPR22TIlOBSiMgGn0TiVw/1Sj3u+bdkuWtRc8AmvXJN7g5V86sJX7bqYYDlwWp1KCNnKRjzT4TNnEplsqbQ34JFIEDslmkdtdy9jLuH+mW+rcffNePTb0DhM9f/AOVMyZf/AIDByRxxSjBA9Ul3afuaVgmcXB2j0787fCn1zFkfvWIkyFH+kulf7166t5z0w0Fz9qSI60pzMHbJ+vFIEBFeHFurbrB504y2MilHK3sgDA96xRIYjudpSwUqPmnpL7UQBuOQou/SnchvuXCyxNubWsLS7yPNZPvKZSA2N23zTS7bdIaQ+hC1Jc58eKyQ+3FbKZJ9S/Y0mEBSe0tavUr+cQfTkisI6VsLJSDgGnYa2YyVrKhhVaxnqRI7TCO5vPtTbJh/tqnJMlTqwkJp4RmXkguODP0rF+PLjJDi45wv7eKxEFteHFywjPtmle6RaTtok8ylGAhVYBpechGaylIbYSO28Fn96egyH1tkhgkAecUnOulHctTW7GMIwf2pKcc9kmskP73CFIwQaTklSDhLWakxRjFnLGlSpVFJKkc4yPNKlnBCvOKSSdjKC2lqeO0p8ZqS0vpuPqR9Xz8sNNpPuaiXGxLQVKV29vt4zU3pmyqvCVRm53y58ZziovciQgONit+foxMC6MIsKu+gKG/ZzRdqewyjamGItsOVpAWsJ8VhpFUPQVwRHnSBMU8oAEnNWXqXXtvsto7L1uSfm0+lRT+nNU3zEFbkNI14VLQ9D2e2tl2RLQXV8lJPg14nQFmnNOqXckIUR6Rup1/SZuEpd1F29Dp3BG7xXg0GJIMpF+2BvkjfRDIVTNMM/TZbejNIOWRx1KYxlpP6TjNMam0Y7c5e6S38qkn3GKsDpzqeJZ/6MtkS+1wVYzWp1KvkTU6w3HAiEfTigmYq4aQZL57IGHS/TyIwccuzYcA4G6tRrSUKI4QZKXVJ/QM+a9V02k3JxuQNRFKU8lO+pROnWLfKYkKuYc7BBI3ecUV8pVVtMC5S1m0/MkwHPm7YQgD0KKaEF6NZk3JxyY6GUoPAPFXxC6gQJ9hENi2JT2UYKwnzxVU3mNE1VNdS3NEYpJyAcUNspVmakDWqGkaCs95CWBcEISPKs1swNExdNTGRagLlkjdt9WKwOhD2lxWr3hS+NwXRF03kMdLbmlm6Pi5GQcDcd2KnLKQh00TPy8n7qM6hWebKZjts20tBYG4hOMVDx+m1taiokOXZPcI5Ru8VcvU3W9tZgto/Dko+bHpVt/Tmqhf0Qtahc0307HvVs3+KeKUlKphZ+bn/AGTSuntnmsLSq6ISvHA3VOaB0x+ANPocjfNZzsOM5qIR0+ckD59N82hrkjf5qy+ml9hx0Hc0JPyv6vfOKUkpCakpgen2f7qub1ppdzlOi5RfkkrPpKhitCH07tsFKi/c0EL8ZVVg9S9SQOoUj5WE2mApg4OBtzQSrRapiEsLvW0p4zvpopSUqumAPNz/ALLTZ0LDYmByPIS9k8AHNGDmmpCYAAtp2487ajLVZmdLy23XrgH8Ecbs1aa+oEJVmEb8PTjbjdimklIRoIGFqpN7SESS+pMiQGT9CcVm30zsrgwbojn/AHqk7xaGdRTFuszwxk+ArGKjFaGca/LbvxO7/f8AFThlJCrOhYHaLOBo1+xXVn8IQZrJUN+0ZAFTHU7SzlwjRVW+KWFYHcIGMVMaB1BG6fSkQZSRcVSDgE+rGaIepOpoMGKhLrKWzNHH+7mhiU3VltKMl1V0TQ9mbhIceuKFvJHKSec02rQlou7LjipqEONj0Jz5rYHTztqF3/Hcoe9Wzf4rFejiXU3Jm8YSx6lJCvOKKJNFTbTDMp7p/paQbdLZlwyrtg9tRT5oYY0s5LukqPeR2G9xCCrirn0DrGFcLO40zETuiJwogfqxQHqW4RtfzX4UfEFTJIKhxmgCYq5UUjWhCTPSi1NyStN5QUKPjdWE/SLFmuUdFuWJAURu28043oV+M6W/4gKuf7dEFhiRNNS0OTpgkqJ4BOaMJSqTKcXW3qCHMhWlkQrGolaRuUEUKRenttvSvmblPTGc87FHFXq51StES0fKSrOhQWnAWU1TOo9LnVlzNwgXb5VsqzsCsVXhnLlfrKeMAZuf9lpSOntlQrsm4IKR75qStel12hSTZ2PnAfO0ZpiRoPuRwyL5lSRyd9HHTO+w+n5LclCbiTxz6qM+UhBpoWfl9n+6ENRWORPKDKgmMP62U4qJe0jbHAhiHJSCr9RB8VaWv9X2zU6SymKmGXfBxjFV7G0xHtoUpV1Ci749XimjmJTVcLB1e0/ZaznS6zW+Gqem6IdkAZS3uyc0R9PLTKuVtltXW2FIbSQ2pSfNQDGhZEKcL6/fC4w2d5bK+CKuTTGubbfrSY1ut6UfKJ9agn9WKhLMQjUNOw9Ps/3VGM6LamXuSLthhtKjs3cVtv8ATeySHUq/FG0oSfG6p/V7sTWE9cWK+Ii2iQog4obf0E4paW0ag5/46OZNFTdEwE/mWEuyi33KNHtDXfayAspGaK9Y6ZkybZGTbbcU70juKSnxS07Mt+ipbMOYpMtbxABPOKsXVGvIWnLMlhdvSr5xOEq2/pzQnTHurlPTxuHwql4+hbTbkJcfmIU6r9SSeRTc7p/Z7kne3ckIP03VsydLGZKNz/FvS+dwRu8ZptzQRH9IRfMAc430UyKkaYZumy3tN6RdtStkeOZQHuBmm9V6NcujqVPN/KjPORijrp1qeHpvEd5kS8cEkZrDqVeoOpCDG2xT9uKEZjdXTSDLfPZV+10ysDkYfMXZtLgHGVUy1oW2w1lXziXVJ/QM5zWLvTyRd3EPt6gLYTyRvqSRpVNrlsSl3buBgglO7zijSSEKo2mBdqpWz2a5OwXUybUrtgHYoooUVoaPcrg4q4viOkHgKOKvu39S7VN0+ITVqSCyjBXt81UN/isaynOojTREIJ8HFBExBVmekAaoiToS0Jw0zcUKT4JBr2HoyPBuDH4cBL3KG7bzinImg/kgqK5fN6l8Z3+KIdILjdOrmhqW+JpkqG3JzipSSkKtSUzb8pyfusNd2SXEhMJi2wqCgNxCfFDkXptbLq2l+RdksLPJSVYxV26011bLTaEIlW5Kvm0+lRT+nNUtN0S5eX1Tod8LSHzkJC/GaUUpKPUUrT1HP+yal9ObXD5jXNL5T7BWakLdYHWIDu2FuCR521rQ9EOadWJUi9l8DkgrzR/aNVQTY340eMHSEnKgKkXElCjpmhhVISS0ic6lwBBB8UwZYSSG294/as7yhNwvEhSVbCVHisIa027KZCM/c1aiPqsmbkfosaVKlSUUqX6fX9KVej9Qz4p0l72hcUlW/tBH/Wty2wLo+hRty1pDfkprSlsh1P5Dm364qyulzDP4c9HcbC1qSRnFDkdwUaGLilVmZ15YvDT7qlvllQyDzRtqfX9yv9qZhLtih20gbtvitqXYhZp7852NvSVEgYrWb1hDnFVsRagFK9OdtBDuNqrvDMI3QpbRe3HO01JWd3G3Pit242S9QGFLduS2+4PG6rD0npBER9M6Sj0rOQD7Vu660Sb00l6G5gI5wKYTXSOGVEkHFv8AZVtpHVd00oVp+UVKK/fGaZ1FqC53pan3GlRc848VONXdrSQDMu2h4o4yU5p1LSeoJIhwuwB9Biphw3soE1EkHD9OygdPWbUd2jrdizXChAycE1GSBc405Tbs5SlIOCnNXloixRtLW92DIwVuDHNCV+6aPCe7f2SVIBK9tDE4m0U5MOqOE2QKEh9RbxabcqC3Z1qC07d+2hJtNyuNyU+ZSo6nTnbnFGieo0Jg/grljClo9O7ZTkfRb+orizdGUFlAUFbfFTDhGoyCoq5mxIenWTUkCN8wJThBGQrJrTsU+6tTUzJZVJLJyAeau69W+ObS1bQ2FLCcE1XsyCrSizJcib0nnGKgybjFEmojRz6lRWsuoVy1KwiC5bVNhoYCtvioi1QL5PbwzNcXjwkGidm+wdRIVFatiW1q4yE0VaF0kLO/87KGUZzg0R0/BQ46bzVRuqxktX63pXGmzHGQvgAkit7SurLvowLS1FXJS9nnGfNWJ1E0YnWKkv21Pb7XJ20HG+xtItpgTreHlt8ZKc0mzcZPJTGln3+6HtQ325Tn1TGmVRis5PGK2bHYtRX2KqWzKcAbGSc1NtNp1q6DHhdtJ9gMVZOnbUxp60LgrbAU4nHihvmEKnFRGsm0/VUC9NuzV0DLklbhZVjaTRdK6gXVFtTCRalkbcb9tb1z0I9DuL16LRUgqKsU2zru3EG0qtCSsendtqeYSIcMU8cjhe3yQMmbdH7gGkyVNqeONuanbppvUFmiokyJrmHRkEmiO39Pnrpcmr2GihtCgrFWFqCxw9S2hEFKglxlOKgZxBopUtFUVEbja3zVHWvUdw07MRJcZVNUDke+Kk9Z6nu2uI7a34imA0ODjGKmF29vSDi1zIYfSnxkZphOomdUBVuiW0MlfAITiiF6haeGDh3+yHrNCvVyY+XZuK17BjburSuCL9anFMPylhJ4wSeatnRGgRp1ZmS3Mhw5waWt9IM3lXzcVP6OeKgZrKYw6ohg4v7IL0nra76Yt7zce3rdDoOSB5oZd1Hc59xdUltURbpP2oxY1jF00j8Ok2kOlPGSmvY9lTrOaibGh9hOc8DFTa4BqHJGZ42i6hoWk9QPxVXFU5wpA3ZzUGiVc1XIEyFOFhX6c10FHs0OHZjbVOJ3qTtqt5miHdPznLkGy4hRKsYocM/NZGqKLhyMIK1ZWtp1wtnyarWU9tON+2hS3u3S4T/lmZi2ys4CQaLV6yhOH8LFtSlauM7amLD04UZrN8ztSCF4qWYQIfCqKypACDdR2PUGno6XH5rgDo4JNM6b1Lc9PLDrjCpu76jNW9ryxI1VBaiRx6mRjigIBvRSMTYPe2/UZpccSKc1NUUs2qhNWaiuWoUd4RlRNvPjFNabsd4v8dTjU1bhaHjNEEeW1rxtyLDghndxwMUXdP8ASitGKW3LOQ7xg0uOI1GOmNVP/wCVU0ly+NyVwJMxaUg7cE0R2DXtx0XCdhxLep7vjBUBnzRhrbQaZTpucVON3q4oUj6kiWE/JTLaHlDgEpzSzcdTdGaSa37oPkTbnNua5SnFRlSFZx481OHSl9EP8RRcHFBI3eanWtMHWcpEthnsIyDgDFWKzpiNEsptq3gpak4pppxG5RhouICVz9Hut1duqF4W+qOr9/FF+ouoV1vNubgSLWodoYCinxW09Y/4JmuzXIneSsk+M1gNbQrsTARZ0pU5xnbUi7jtuocMwOIQhbTfJslLTUhZCjwnPit+/wBrvNpYCpFwWgrHgmrH0ppFi3SETpCAAs5wa2+ougxqZDb0JzG32FQ410VuGVEtNxb/AGVYaW1XdbCdoiKlb/Bxms9SXi5XLLzyVRgefpUwq4I0KhDUq2d4o9ymsJLiuo+G4UPsD7DFEDwUFhqJIuH+yh7BZ7/coy3oM5xSUDnBqKeevDdxU09LWooVyknzV36C0wxo+3ORpqgpTicc0MX/AEAoTnb3HTuRkqwKHxrokuHVHCbIFDxNcXO121UNFqUd4xv20GJfuUm5lSJCmFPK8ZxRknqAwFfg6rMFKT6d22n4miHr5PauqWy0hJCsYogffWyhIKirlbEoK5aa1NCjJm/MuqSRkHNRdsud2RORJkFchTJyAeav2VHjS7MLX2wpaU4zVZzLSrSspctyJvQTnBFQZUiZHmoTR7laWqde3LU1vRBftymw0MBRT4odsUS+OuFDE1ZzwAD4op/imFfkmAzbA2tfGQmivRWiha3PnpIylRzg1J0gi7ILKY1WxVaXeLebe2pE+asFY4BNbOldUTtNxXWHYpeS8MBWM1Y+utCjUm2VCOA1yQKCpUuNZ45gyYgUpsYyRTNlulNTmnG6EH4ypNwcuS19vcd22lJWJ4DaE/p4zTziW7m4pbbgQMngVqF1UBRQhG7HvVpuqzzzrOlSpUyZKkBk7T4PvSpY3ejxn3p0k3KYcZG9hRWPfFWX0uuLMa3PSXyApAJwarcOqtoKSO6F/wDSt61zbi0hSYLalBfkCoSN4yNFLwijGV1Gi3Ge/AfaASCRk1rInWW37pzaUFY5FBYtVwlXhph2MplTygCSMUc6n6ZvWK0szlydxcSDtz5oAbwdFd4hmGyItHa4jX6QIchYaSDgZqS19qlvSrKVRXA6FDwOapiJb76hzuxI7je3wQPNbE6VqGW2UTojjoR4yM0whskcTqIoOFb7ogGr7ffcCbHSkq+oraj60haSBENoEK+lRujdGO6pSpTyTHKPGeK1NU6Xk2ZxUdKC97A+amG/NQLaiODievdXHoabC1hAduMiSltSAVYJoR1H1VFlmvWZCe62CU580AWN7VNoYW3FbdQlweBmtH5K7O3AuT4SyVn9RFDEHB1U5MRqOE2IIsF5sil/iDkdAcVz4qQt/U1LU9mBHa2oUQMivYPTZNztSpoeCSlOQmgF6LcYF0UyzCUstq4UBU8okUZDUUkzZV0Fe7lAh2hu6d5JXt3YzVbzuoMa/uKhuxxtTxnFDEy4anmRuw6y7sxgDmsdPWyS/MTClRy0p44BIqDIRCUSatNZPqERx7vZrQhUhnYVjnAow0Hq9jUj/wArJUG0E4yeKBNb9NJemo7c4vlQdGQmh23uX+G3/RIrjZI4UBRHQCZDiqTSz7K4eo2t42glJZtyw/3eDt5oKXdbXqNtMychKFuc4NCbkbUM0Lk3SM4+EcjcM1P6P0ZM1mlakKLCWfbx4pNh4KeSpNVPt9lINa2haUdS3FZBT9QKszTt5g6qs7l0U4lKmk5xmqV1Npt6C6qGygvqQcEjmmLPdNSWVlUWIw5sc4IGaG+HjKcNaaObT9EU3Xq3uuL1kMfKEkozitVtyzMg3NSUdw84oRVb7g9ckuOW9QU6rlRTRpI6fuLtqZnzWCE52VPKI0OGSeSR2mb5py2dZCm5NWRMfahxQRnFWVfhEsdnbvKZgC3E7tua59ctk5qeHWbeoqZOQoJrfvF21ZfWEMFt3tsjG3nmoGDjaqVLW1EEbhe/yRNJ13EvC1x5rYA9ifetNnUUGzFUqHHSop5yBURYtNP6ilNRJKTHXnBJ4zUzrfSruiojbYQXu6OPvRC0FQvUTQcQj7o10Jq5OsyWpTvaCPqcUzr3WrGklfLRlh4HjjmqutatRW9r5iJEcaDgyMDFa8tm/XJ1T1wjOLAOckVAwX1UxiNRNBwv3RZDvNpvqfnJbKEk881tQ+o0GzTUW+I2kJUcZFMaT0C/qK2vPMq7YaSScUHTNMzI1xeajIL62lHkc4qYaC2yHJIYI2my6FaiwbhZje/nwFBO7buqs5nVVDs1y0LZ7iEEp3YoVhXDV7bCoJS6ltXG3mo6JabjGuQRJhKy+rlRH1ocMHNdGqK0ySMACMlG0SFfiSdgWnnFTlg6mNyprVlBwkkJzUZN6ePxLV84zIKi4nO0UBxrZdbbcvmGoyypJyDipZROoGWoo6kEK9deahi6LgtTWVhxTozgVX6tawdUoxOZSjd9aHL9O1Jf2EJlRHFoa8Ag1u6U0k7qJQZcBjFPH0pcARqU1TPVTaqWi6ogaQQuRCaSrHPFGfT3V7WvS4/KPaDXPPFV1rTSjumm+znv7uB75qK0/Mv9jjrRDhONB4HkClwBIosqTSz6forS1x1BjWp1VtjLDm07eDmhJidabkRLmhCFHnBoPVbr47LXOlsOOAnJyKNNOdOJGr7c5NbeLPYGSPFLLwFN8hrJr2+yeZ6jR7RKRb4rYCVHG4VY8dyM/ZTelzRuSndtzXP8+0TWrmuGyyp1TCsbgK3/AMQ1X8t8glt0II245qM0AlcmirTGLWRU/wBR4l7mu259kKS2SMkVqLulmgKMpppG9PIGKEIFmnRbmhl9hSFyDjJH1o21F01etVsRcX3sdwZCT71Mt4DbIYkM7ibIg0drBnU0pEN9YaSDgZ4qT6jasRolpsxne6FfQ5qmYbV8iyQuFHcQEnIIHmtm+P6iu7SUzojjgbHuCahwbIjcTqIqYxW+6Il63tuqUoTOjpSVfUU8vWMDRad0FlKs/SorSOiFagTlz+jqR4HimtV6Tl24lrYX8eKIGgITBURxcT91bugbtE1zAcnTJIaKBnBOKGNS9R2bJMdtLX5yASn61XVlf1Pa2FsQ2XWgsYwM1oot18/EC/cIi1bzncRQ+DZElxGo4TY0XC+2ltfzy4iN6jnxUnb+pzZmNW9tvYlZA8UoWhWrnalSysBSU521X0u33GPdVJYiKJaVwQKIG2UJDUUkrZV0TMmwLTZxde8kqKd2M1V87qTHv8pcJ2ONgOM4obl3fVEyMmG6y7sAxjmm7PZH1zW40lgtLeOASPrUGUwh1ujzVxrOyI0y7PbEmbHCCtPOBRbojXTGoXPkZCg2nxk0J6u6bytOW9M5T5UHRkJoNtLd/ZcK4sVxv6ECpOjEiAypNLsFceutat6JAaiL7wd+nNAsy6wdQRzJf2trcGeaHbgb/MQpdyiOObPG4VK6V0jK1PEeefUYwZBwPFM2KyeaoNQNlAqt6YrqlNP+nOeDXrb6EH9PcNNSITrFxct5dKgkkZzTjqEWVIWs7881aacqzzyLGlSpUyZKljd6fc0qXgZHkUklipaoyShaN4V7/SiLSt1TZkqkpifMHztxmoKPLbLS2nUZUeBUhpi/osEhRmxu42o+4qL2okBym5Vk6Tct+t7gmTNYTEWycgEYqxNS6cgXi2pU9NSExU+lOfOKoadqj526MOWT8hBUN+zii/U96X+EsKjXL1hI3pCvNU3wklbkFW1oso656vFudVBh2ruBrjcE+a1YGuVSnwzKsmxJOCSitS367tsNQTJhJdUPJIzmvLp1GtUn0R7ahB+oTRTGqpqm5lbWl7ZbriwHo7iWCeSBxUZq+HCtZLqgHlJ5+tBem9SOuYWiSUD6ZpjVOrlMupK3O4B5GaEYiVcNW3LZNSNeSWnghqxlSUnzsrfi6vZvT7cV+1BkkgZKcVpwupFlbYCXbYgqxydtR87WkGdLSqNESzz5AxRpIyQqbakB2qvux6Pg/giphnpSCnO3NVffbrb7PNeDEJL6kE8gZzXrOp5CrQUN3AgbcY3UHRdTJiXBapjXeSTyTQRCVZnqwWqYha2VcAtxyzbA3yPT5oo0RGh61uSH3mRFMdWRxjNCMzqBZUpCI8BCc/qwKxha1Q3OZNsIaCiN23ipSREoVLVBnbMrj6h2iDcYTSXZCcRhwCfOKqmdq9DBEKNaN3a43BPmnOoGpJrjEdcWQo5A3gGohjXlttrDffhJW5j1EjzSiiISqqlrv9Vusa+eUsW9+yFKHOCooq0ND2+3RGMMOJb+aHqx7Zqp5PUa0XCMoItiEOAcK21IaJ1IqQ08p+V28A7ATTyREpUlSB0+0/ZG2uLPbNIrMptxMpcjk++Kr2Xq9y0kOs2YvBf0TmvLhqJ12S8Z0rvJSTtBOaZtfUe2w1lmZbEupHAJTTRREJVdSD1cn7qf03qiNe5LbU22BgrI5KcYq0ntEW9y2Ccmenbtzs3VRF01xBmTGzBjJYyfYYowa1DJ/B8m4nG39O6oyQlFgqwGpm/6jh2d5cWLbw8ocZCc1CwtZOoe9dkISo8+ioljWLMW4qMqOHhnyRmpSf1MtHbS2i2IBPvtosMRAVZ1SC7RG9itELUclqe0RFWg7sDip7Wttts2C2uYtK1RhwD74qo7fq9965MLhrLbRI3AHAqY6k6jWmNGegyd+0DuJBoQhN1abVtyWWvN6gKSfw9mx5Q16QoI817B1WJivlJNp7SXONxTUdB6kWdUZtC7ahTqB6jt817cNd224x1IYhJacA4IGKKI9FTbUjMrs0HZbdBtjqGX04kp558ZoH1LBt2hJj86NtmLeJO0c4qH0Bqx1q2Sm5cshRSdgJoZh6iksXSVIvCy+1uJQFHNCbCVdnq2uC3Ea8ffeU6LGRzx6KItPX2HqKWiPcIAjnOAopxQwx1LtipBSLQgISfO2mrlrGJd7gwm2tCPgjJTxRRFoqbakAq9p2mrfDtqXlTUrSRwnNVZqO8MWx5XykAPY+ic1s3u9OtWhrZcStQSMjdQhE1u1Ekf0uKHQD7jNAihIVmrq2kDNyfut+J1DccdEd6xFCScE7KsrSVltV8bExD6Yy/O3OKrS4dQLFJbCW7c22r67adsF3dlSEqjzu03nkBWKnJESEKmqgOn2n7Ky9U6btK2VSZMpDimBkAnziq3e10kvKt7dlylo7QrZ5r3XNxkNFpyLcC4kY3gKrTh66s7UZDYgoW6B6jj3pooiE9TVNPV7P8AdSEXVBefTDdteEOHBVt8VbmkrHboNsUY8xKRIT6gD4zVHTOocFTS2kwEocI9JxRR0+uq5Noluz7j21FJ7YKvFNLCXItFVtA5ef8AZbWsGrZpCeuTBbTLW6cqxziheTrp5Ckut2Mn3/RUND1O7bb7JTeF/MNFZ2buamH+pNnirS2q1oUlXGdtGMeipvqATsiTTzlt1fMZmTmkxXGSCEkYzVjalsEDUdpbK5aUJip4GfOKoWde03K6RpNqc7De4FYScUYas1Etm1Rxb5+VJSO4ArzQnQlXaera0KKveqRaXjDi2ruBnjcE+abtvUH5w/LyLHsB4yUVqR9eW1ASmTCQ4sfqJGc1jcNf2l1Oxi2obP1xRTGqJqRnVo6SscK6j5hl0MZ5IHFYa0jwbKneoB5Sf780B6X1W5u3IkdsfTOKw1fq5RWla19wDzQjCbrQNYMllqTNcyUvpDFjJSk+QipmBq9i8rbhybUGVHAyU4qKtXUqyoZDb1rQpQ9ymo2466gzJ6PlYiWefIGKNJGVTZUgO1V+2LRFvFoVOM1KUlOduaq7Ul1g2mc6mLDS8UHyBnNbKdTyDZCG7iRlPjdQPbtUIYuLnzjXeSTyTQRCSVZnqwWqYjaz+bBdNm29vnG3zRBpRLOt7k08/HEX5dXGRjOKHJ+ubJFA+WhoOf1ACtJnqDuuTCLY12UqI3FPFSliJVekqQz/AGV761slsuNpb+YmJ/oqeAT5xVOzdZCE4qLCs/cDPAIT5rb1zeZb8KO5FnHkArAVUJD6gW2xsoD1vS8vHqJGc0ooiEWoqmuG2Vbdu1wu6PhiZZO0gcElOKsGHbrXNsbz0B9LKtpJAOKrC49SLXdmy3FtiWFEeQnFbWnZr/yL5VNKQoHCc1JsajTVTREQgq89yNeXw0d+1R5rxlCbmnEheMcYNbJU03NkF0hZUTya00x+46pSXdgJq01mixjzSkrKlSpUkyVL96VIjI2jyaSS9LKe2Xm+VJ5xShTUXFC4spkIPgEik0VQz3HvH0PvWElRuJ7sdvthHJIpXumummXV2SQpoJ39w+k/StpyLPI78mUoIXyEk002408UlzClN17MfcuhS0wogI+lPa6lnKx7bTZ5AVTxjsPN5DQBpl5hTKE5JOPNZsSkqRsbOSKZQeTm0XjDr8ZZDbhAH3p18OS1DueqmUtb1lSjWbkv5cbUjNOACiuebBNTA0wUhLYrYQy0+zvSkJIFMtliT6nlgH2zTrYWCUpHo+tM7VQfdrgm4ypaXe33ztz4zWc975ZIR29xV71ittDat7Tm4+4FOpcZfA7pGR9adgBU5HEtWvHtyXhucwN1O/Kpth7ja9x/fxWEh4g9ps4z4NeiP8ujdJezu8ZNNa6YOy7HKnDd5TvoWguCmX2UOfmrSM/SnYctiFnuIBCvBNeuBMhRebPp+lLZK+bc5k0wlt5BAZCdv2rOM29hRaeLYHtnzTiHmy2oNjlPmmoTaZu8pd2lPtS0KRJ76fRNtNuyHyHHTwfr5p6YWmQlPYBx74plllYfJ3YCf+tPyZKXUhoIzj3pWskHH8pumkQWpJS4ghJpyU7OjJDSXlFP0zWuhDjKgpCjj3px59CsYVuV9Ke107HENXiFdtsuONZJ96UIx54WhTYCvatgSGlsbHEgVrRG0NOKeQrgc018qhHcuTsdZthW0oYKuEmse7JaWRMcLiHPGT4r11QuZKvBbpNFMsFtZwUcCkQEVjjZNLhogrDrbQUlfJpx9LBQFsgAnyBWaZaWQY6hvzwPtTPyqo6i8VEhXOKSCy+ZOx25a0l9lwoSjkgHzTJnuXN4MpT/AKM+o/WthiejBjjgr4xTZDdnUVOJwXfFIgBS4hdus5k2PGQmMzFBUrgkCmkQ0sp76FYUrn9qcbdCPzFs7gv+tjxWKwnBU27uz7fSkleyyBnBJUuQpafpmmPnCHNi2M/enoi9pOFb/tWTshoqwGhkfamAATNffY3WLlualo38IpRmHIeWmpWCfHNePOKWkBte2m2Lapw91yRgj2zUwAUiSd9Fk4JTCu3IfU4HPGTTZhm1H5kJ7gVzTjiCpYS4r9PjNOOzQ2gNuDcKjaykCe2q9bTHuKe+tAQUUyt24SnAIMhTbbXkA4zWbbaJCThztg160FwcttjcFeTStdIuPfRNSUfiAH/zG/P3p6OliQ0Y8toJUBgE14WvlXBIKsZ5IpTVIuiAtg9so+nvS3S+6bZjKgLLSXf18JOacU3LgcyZBWlzwCfFMsMOujc4o/l+9PBIuQKVOf6OkAEs5bose023+dtB3Ullp/0hoA1m00V5bSdwTWJ7aFYSeRSUX6OWTLb0b1NuEf314+67JUEOZUKxeeSE+teKUZ0ckDcKQaCpyPIasXm2Y2CGxzWXyjb6d6UhJHNevbXzn6U6yQEFG7Bp3KL7giyxZXKB7PfO3xjNYyFfKgo2ZK/emlJLb24LzzW088hbYDg59qTAFJ7iWpqDak7VPOndu559qbSW4b/5SMn6/SnESC0hTal4z4pQ4+1RU9yFeM01rprlv+qzfmzHgEqWVA+1Nnttgd1oLJ+tZPvNQ14BzurL0rAdNKwCWYu35lrq7anBsYCM/an33Xo6Ahp/APtmsXJLTgwABisGYhnZUlzO2mCYksNgsmoxKgpTmSfNez4RQAW3MGsA281kHPprxJXKO0qqYcnOgus6VKlUVFKkTs/N/s+1KlTpJFw3dOSnYG63rVDnzyYkCGpY8EgVpKdCGlIbTtKvpRJoTqRG0YpbMyCHFueCRmozPsESMQPdZOM6BVFQpctXbUvyDUPOscy0qUqCwp5J8kDNWa27/GjLlwcPyyCMpHihsasY0++5aTGEor9IOM0FkivywQZNEL2e0T7ussBhRUvgjHityfouVpxQceQfzPqKsjSD8K1RnbrMjhC1jclJFZifG1eiS7cUBlDOdpIxmhmTmUxQ8vJ1d1Us20XANh6LHUoHk4FZWixS5yti2SVe4xRGzrRNvnO2mJB+ZRnaFBOcUb6aRbWIjlwlIS26RkIIqc0nKhRULM3L091XT3TwBPfef7RHOCcVDzo0+Kv5KLGU4k8bwKtX8L/iluTKlSPlW2QSnJxmhK26qix5r1nbiCQUEpDmM1OKW7UpqMAjXT1Q/C0hcGwHGkKdU55SPatp/RzkZvvTVFlZ8JPGas/TEyJaIztxmNBasEpQRWithjqIt+4S1iC3FyQDxnFCEt3IxowBY/oqlds9zS93ExlFtJ/VipaFo6VqNsOMqOW/IFEDGs4z0xemYkIOhB2dwDNE0As6PQHhhSn+dtTdJ3Qo6SlPV09lXjuktoMaSdi08c1Dy7RdbastMxlraVwVAeKtO7wGLok3WS6IwHqweM1Bx9bRnJAsEaAJIWdncCc4pNkulJSQN6urshy06ZffYUY6S4tY5AHino2iXoQcffWW1HJ2mrLjxoWhoonrKXnHxkN+cVFynBfUruMs/LNp9QB4zUWyoopIA3l6u6ql6DePm1IaiLLef1YqZjaZuUhjcxFUs45IHiieFreGqX+Dw7cH8naXAnNGkXUVv0qyllyIlxcoeMeM0nyqENJTF3IeXuqsg6dQhlxuSrDhH6T7UPO6fuUSWtwMqU3nIOKs/U9ritOi8GSGg76tucVGRdSiVLZtrEDutrISpwJ8VNknKoPoxn0Q/bNJTr2wpTTJ9I5wKb/hVUXuNleXE8bate8XiDoiIyxAZDq5QG4AZxmoG5WuMwyNROPgEjeW6Cx/MiuoxlVZsW24svqRIjqbQTwSPNTsHRsqYyp6OkkeSQKlompEazubVsYgdtpCglTgTRtqOZE0TGj2+0pEtcgAL2jO2iukTRUjC3m6eyqv+GCylwn1OJ9qh48e5vTvlXYyg3nGSKtW6woNmiIu0p9IW8NxQfaoSDfWblORGjwBsUcFYTTNkugiks7m6uygJ2hJzLKbjDaU4E8kAU03YjqhgpePbdYHCfGSKt6XfoOl2WYCGkyTJ4UAM7c0Ja1hRNOLZvkZ4N931FsVCKXsrElDTjTv+YeircfiUWV+ESIKgjO1Kymp1jQFyjNCShCnEPDJOPFFEK9R9YKjobtgRtIy5tooueqo+nG2LJHjiQXwElQGdtTklUI6KmcLg3HYqqn9NfhKSWld1xflI9qiFW+4NyAlyMoBf2qzNUwYOmG27w5JS6t/1dvPitG13f8AiGUyFW7YzkZXt4xSjk5VA0lPm5Oruh9rRsxUb5pLRIIz4rXTpl59ta0OELb8J+tWvfbxCtaI9utbaZHdwle0Z20N6wah6ZbZujL4UtzClN1COTmRpaSlLeXp7qu4douE2SpiUyprYcJJHmpdWj5ZAW8yQhPgkUV2W5NardYeTEDCWyCo4xmiXUd0iupYtMJkHOEqUBSmfZyaGjaG/wDFVc9pBcuOpcVz1oHgVE26JdESFRZERRIOASKPtVPxNENsyGpAcW7glGa39N3hi8pRPetwbA5yU+amZOVCFGM3/JBZ0rcJHrksKbQfqK0bhpyRGIERJV9cVbl0vjN52Q4sQIQjhSgKC9VXuBpt9pERSZLh8pHNRbL2RJKKlHUeXshBu2z96YymFJLnHipZWiJlvQlxaVJQ75NHNldYvcRFxlRAyUDcMjFbEy+N3tJtYZ2hPpC8U7pUoqGA9fV2VW3O1y7MALe0ZBc845xWrDsktSwuQkpcX4SaOJl4t2iFKDoTLW5+lJ5xU9pS2wtUMq1BPSIoZ9aUHjNSdJbVD8pTufYb+iBE6AlykB2akstkZBPFRl0scm1/lWxsyQeCUjOKtOVf2tY9yyNtiMljKQvGM4ob/GoWg3VxZCRMW5wn3pNkRZaSmyXBv80JWWwTJB/NaUlav6pFbU/S06E+gPtKQlZ4JFWNphUWe2u+TGQxtG9CCMZradmxdaMv99kRxEB2qIxnFRfLzKUNCBFmGpVS37Tk+EyiTFZU4PPApu02ibeUYUwpK0e2KKG9ctxJT1oMUP7CUp4zmi7SCIXy7t2nsJjlA3JQRjNTfJoq8NC0S5b3Hqq5b0ZMdUVTW1NBHgkYzWhdLdOT+TDZUtKfcCrY/FmtYiQypj5VtjIC8YzQzH1BbLUt+3toTIdGQn3pNkupS0bA7n6eyD7VpaVcRucSS4P6tbbmmLhGWG5bCmkexIo+0dtZL13urPy4RlSEKGM1IO32NrpD7C4ojIj5AXjGcVB8qN5Pl5ursqku2m32wlMRJXu8kVpBlzT6B3lcr8g0ai7s2+W5CYSJJScDHNbK9IMajirmT1hggZAPFFD7qm+Ej8BVyq4uOuBLbZIX70+60mAgOBXKucU/JbZs8lccI3hJIBrUKjNOXDgVMOVN3L+OsqVKlTpJUh+oGlS8er6U6dYSnNq0rxgJ81YOhtBx9aoTNSwFBgZUcUAKAlpLeMZo56edSGtA5tayCJHpJ+lCqG6KxSinL0X3a2lLZtNs/LLfpO2hpyxM6fUbjcWw4pHqO6i96Wlhhy/Qz3+6N5A5xQRI1SxqiSu1SnA2pZ24NU27rWqHU7WhEenFHXyt0JG1qP8AqA+1bd9s4uTRtNuPYWkbVEcZpvTDyOmrZbaAWmV5P707dZbzIXeoY3b/AFKx7UiOZTGbLydXf6IZat7HTxtyRMiCQtXO4jNTGj4T2vXF3GOooaZ9RQKg1ayg6neNpk7VOK9OD7UTackr6eDstp/LlcE/vUphyoUPVydPdZX+3v3sKs1scLBR6VFPGaG4+no2g1KfnJDji+So0V3uf+EsqvUH8xTnqOKDGtQM67kmHNeDa84wTShHKlI0h9wdfVF2moD2pwqbGQVMo5KR4rXv9pevZVa7OsxiPSsJ4zUnp2/Dpyx+HdruNyBt3Y8ZrSvtwVZ1KvcD8wveshPtQR1IpbyW7enqhM2xnpw6FymA6655WRRdYbYvVrX4sj8xDY3baGfxqHrtfyk5xKXfAB85onsF5PTUCE+nc0/wCfFGcCgUzYD19PZat+tD2rc2hlwxij08cUMmEz0teDcuOH3HDwsjNFupJjqEG/2sYB9Z20KsX2Hr575a4qSHmuAFec0mApVLYh1dXZFVltb+p2heZCytpPqCDWN6tLmrkm1QB8uG/SccVs2W5jTSBb3zsaV6RmtLVGo3tMqE+2slaXOSpNDarD2xhvL1d0NFmN0umIjSo4fdeOAojNGsa0/jcRN4fa4I3JB9qEG51v12+3KlPJU+2c7Sec0axb+i3st22QntIThIzxmmddQpGwOJydPdDl70vO1Uv5dLym0N8AZqLTdImgH27TLjJW46dqVkeKndW6lfse2ZCQS35JFQSG4PUhxuUpxIfZ5x75o7OlQe3mRkzp4uxkXaSPmEvDckHnbUJftOzbioMsuK7Z42CpmBqUWJtFlnHgelOajdV6kkaZ2XENFTR9QPtQWDmRXtOXVQnz0HRLiLS6wlt+V6QvHOTRdbdPSLC0i8XFJmIk+pBVztzQYmFG6syWrohwNrikKx+1HH8cR4UZrTc3Ci0AhJNEeEOlF2nP09kPav0nM1S4l+O+pLfkIB8VGQ7jF0nJZskqOA86QkKI5zU7qLUb+mGhNSgltXI+lQEBmJ1HmIvAcSh2KdwH7UmhBkDg/m6uyPJukhZ4bV6mq7oeAUjPtQxf8ASErV6BILpDTXITnii0303uGizTV7PlhtTn3xQbqXWMrSaxGLZS0eM0GLdWqrg5QP1Cj7bqiJpmSnTgigOrOwKxRudPG0x0XS4sd35gbkqUM4zQdarLA1Y4nUbakl1j14o1a1yzqCJ+Ay0BtTA2IJ98VOQFRp+E7U7/lKDNVaMuV5dTPaeU6ynnZngU1btXQrYpvSy4iW3nsICscg1KXDWrmiVLYmtlTTnCSah4tohavmp1GwUoW0d4AqbByoJbHm5evujxrSH8EQRdp5+Z+bG5G7nGaD7ro6fqCT+IuOKWxncEewFGDOqfx+Gmz3BePlxtTu98UJ3/Xj2kl/IONHtucA4qEY5kaVsGXl6e61mrqxbZLVkhtBDiiE8UbybCLFbkTJw/MfGUk0HWS2Rbo8nUqXApSDv20WzNRp1m2iK8Q0YnAB4zilMDmU4WnL/wAUE3bQN0vcj8YmqUqM0dwB8YqVst+gTEix29hO9v0HaKa1N1RdtTP8Nrj7G1jZvxS0TYYlne/iRl4PlXrKQc1Mg5UENOb/AJIo+Xbs0JyLMYDa5AwlRH1oJX0yetzr2ppTpktZKwk8gUbXy8s63YPZAbcjjgD7UDO9RpFqdVpy6AhtZ2AqoTQi1IgA5unstnTup06plKtMZnsho7SAMZosl2VmBFKEoCXFD9VQVk0/FsyFaghYKXPWSKl278xqRpwRnQpxrykeaTk1Nwzo/q7IPkaDkLeXe5qi600d2DzUhYpP8ZLNvtDnYTG4UlPGcVqzeoDkQu6fmoKA7lGTW5oixnSa3b5Fc3oe9RxRXAoEbYS6x/RTTunUMNlhtPZdTwVeCTQxctDuIUq8ST3ks+rnnxRg/fGdQsPPRnAHWwTgUEo1+8mQ7YbkgoQslGVUmAo1UIrA7n1U7pQp14lUeEOwmJwpI4zipKdCS4hdrYHy5R6VKHGaj9MMDSBXc7YruNvepW2pWZNZ1Cy5LhLAdSMqAocnUiQF4YXR9Z3+iC5GnW9OrXeDHD/b9ROM5qZ0jKV1TKkwh8umJ+pI4zioRWt2mXnNP3JI/NOzKqIdKNp0EVTIKfy5XJx96nJfKFWgsJC2M+z/ADLfuUILbXY4LfZcT6VLHGaCn9Dr0a+rUMtzvBs7yk85o5ut3ZW2q5QsLdV6lY+tBr+qk6heVabk7sSo7cKpNup1TbO5unsiHTE7/PA2UQWflkQ/1ADGcVuz4baW12CA2GnE+hSxxmtHT76em4xa28tSv1KT96k7lMa+XVeIBDrqxuVj2NQeDdGY1xbz9Xb6IGd027oeWbjJT8wFncc81H37Vi722BAc7ASOUjipVOsY9/eXa55BWSU4NRd30NJt6FTIySUOc8VYYFnSv09ghCVLekPJQEFePKqddZBbHbOD9KyjvC3uqZca3KV9vFYSguMru+yucVaY26zJNT7dKlSpUkkqXuAfFKljcQjxn3p0lm4pDafyjk0TaN0Lb9UOBdwlJaV7FRxihKag25HdQe5mrF6WaYGrozjjly+TWkZA3Yoc7rKxA3m6EUSPw7QcX8M+aTLQ4Nuc5xQu7oKyznVaij3NDS/17ArFTEvQjjMh2NNuHeAOEqKs1Cz+nT0SO6+L6UjGQjfVZjlpTjl6EVaTFp1GyuBcZaMsjCVKNOy5lrsQdtCXkvodykHOcUNdPNAS7sHwbgpnbnCt2M1vSdBP2915DkwvnnCs5xUHNbm60aNz2w8QMsT39VAv6BtNllq1ExckFajv2BVGulJVl1lGMS5ykNKaGElRoQVoRxcZ+TIvWVJBKWivzW3006ZztTuSS9PVCSyTtJON1Tma3L1oFPmbLwxHoe3qiG4otljDsFUlMhpWQOcihFrQ1rdlKvUO5JaUk7toVU7cNASIsh2IucXgkkb85qAlaIdhNOSEXkgp57e+nia3L1p5c2a2RGVjk2m9o/Dbk6gKR6UrUazvDNl0+yuMuYiQlwYAznFRHTvQEjVjEhb0wxi1nCs4zWhcenk5u4uNO3JTyG1YBKs0ENbm0ejEuy9C0mNFwG5KtQMXFLWw7wgK80Y2VuzdQmFR7jKQyqLwlSjjOKBrppaUkBDN0ICfKN3mibR/TKXd4K5DdxMUoGSQrGanIf8AdCgbJ/2v3WzPn2+ypcspdS81+nd5FDUfRVsjTDfYVxSkg7ygKqUTocrlOxHpncKTgrJqAvWkZdnd3w7op5PugKzSjd/ulOJf+1+6PoEKza2jhEuaiM5HHBJxnFR1znWiCFWGStDyD6Q4ea0tKdOJmqY5kouiohQMkbsZrG49P3Q6qI7LKlJOO4TTFrc3WjuZUtjEgYAT3vutBrp/bLBKF/hXdJSTvLYVRtBt1j17HStyaiOuMOTnGcVW8zRNwt0hLSbwp5CzjZuzRlZumM1y3GQzczHKh43YzU5Wty9aaCGoY/hiMAHcX3WF/dsZP8PrfQ4P0b81BtaVg6JlN3GHckqQ6clIVTrfTOSuWsyZ5yCfWVVCai0zNgykRWbkqSFHGN2cU7GtyoLy7P0Kx3NO2XWEZu7/ADyG3I43EZ84qHvNys2oGf4flLQA0NgUfet3TPTWUbMqU9diwSnOzdjND7XTlc2c6HZvZ2k4XnGaCxrcyK8uLeha1ptkPRc9KYM4Fp084NHU7RGm7zHbvgujaXk+op3DJqsb/pKZbpiI0ecZGTjIVnFGVi6UXWZbBLevi2/TkN76I5rfjUaRsjrxmG4Ha+yZvku13tCbI6tJQj076iIVih6PuDS7fPSptwjckKrZc0S4zJXGflbOcb81DXLSkm23Jllm4mSHSBwrOKTWtH50F/FeeIYtR3vsrOvFussqGxdY05DbiAFKAPmhXUSbNrZCLcpaElv0ldS0jpjIVaW5CruUlxOdm6h1GhHILhbendor8KJxTRtb8atzx1Fvwx+u6agw4ehZTUWPcA624QFAKo1naXsMtlm+xZzbShhSgDVS3/RtzhX+K03OVIaeWMqznHNWhqDpo/BsURcC8lankjcgK8UpWt+NQhjqR/0x+uyhNWR7JrTtQA8gFnAKs1osQoOlZMeHHnpU2ogKAVWLvT9drUhTty2Kc8kq8UPai0bc492itxJi5CXVDKgc4ojGty9arytnY4PAsT39Vat309ZjGj3aDPQlYAUoA+aGdTwLLq1pEZ5xCFt8bian5vTVdt08xLXeSp1aAe3uoRjaNfnuqMqcYyR4JOM0JjW5utWqmKZrBGG2B3Hqs7LGY0zJbhCYHGVHB54xRzctP6fTHaukC4toVgKWlKvNVrM0zJaubNviyi+lxQTvBzii2+dLJ1kgx5P40pXeSCUb/FPM1ubrQ4C7LbIofVcOw6rdbhb223E8Fyt6z22Ho9tuF+JJktvYBG7OKjZ3T1xyOHUz+2sjzurSs2i5ybgiK9cVPhRwFFWcUQtbl60I583Qj+Xb7NZGBc4k5BLg3FANBt603ZdcufNqfRHcZ5znGan9VdM5VpitSE3QuhYzs3eKgV6KMiEp0XP5ZQHjdjNDaxvxqzNDUPPDMYIHa+ylNMzocfGl5MsKaX+XvJ8VJXfSVl6Zf9rW+6olfM+pSArOM0Baf0hcp1z+TTIVgqwHc+KL790rnWdltx29KnBYHoK87aTmN+NNTsqXNMhYLjvfZQ90stl1wPn++iO6nnzipnSsm329lVjmzErSr0BRPiol7p+kQFym7r2FpGdgVioXS2irrf7qWFSlpQhWN+aTnDbOgAT5ulWJ/Ctn0yh26s3NDiXPVsCqD5lksWsnnHkSER1t85zip/UvTmXa46Gm7wXwRyndnFD56dKRDceRdeysjON2KTD/ALo1RxsvSiLRjtqtza7FLmJfC/SFE5xW1cbZatDlyW3PQ4mRztCvFCeh+nVwkT1l6copB/WTUzrHpzK3oSm6F8e43ZxUXtbm608eYR9CgpmkbVqhS72mUhpbfrAziivQcizXmG9Z7rLQlTQKUFRoemaN/DbSpbd02LCf0bvNaHT7p9ctTTHXhOVHQ2c7s4zU3tbbrVenzcToRaLfbdNPvpdmJebWTtGc0MT9GW6+SVXViclgpO4DOKnr50/kBztouBdDZ9R3ZqBu+liiCpUa67XED9AV5pNa341KfM5/DMdwO3oifSciyymTY7tJQVfoStR8Vs3GFbNCpcaRNRKbleBnOM0HdPenNx1Y46uRNVHLWcLJxmpu4aBkRHFxZdyMgI4BKs4qL2tv1orHPczOW3I7+ihHdD2hUk39i4IQpR37Aqm7v1HTEjfhLbPewNucZpx/QjwZWtq8E8foCqCZEaTaZK0Oxi7z+rGasBUJJHLUlTVLeVKLPKuQKyjuLnD+ko2AeM1hImKS6lxcfCR7Yp5+Um4tgR0bCB7UYLPfIU3SpUqdMlSxk7c4z70qR8cU6S8cUiNjvK3g+1bFrd1Z8+0dOtupZJG8o8VqfJF4FS10c6D6lWvRcdyJMgJeWsYCinOKHOy6LA/n60dItU+Rp0zHpCvmkIyUk85qp4rOrL9qBTMxx1qK0vkknBGaI5PVBwTFym04ZcOdntite49R4c6IuPDiBp1YxuAxVZjFpTycvWjhMa4Q7ehnTylOKA9ZRT8ETRbX1SVKW/tPB85oK0B1VGh2ZDVyZ+ZL+dpVzivFdUAJj05Lf5bpJCaGYHZuhHhq2sYXufcHt6If+U1RK1KXnHHURUL5HOCM1ZE+43dyIxF0y2tKgAHFIoNf6kRbgy6hqKELI84rc0N1ej6WS+3OiB0ryEkjOKnNA4t6FWpagMcWOfcnv6IuWq5Q7QtUgqVJKec+c1VkGDqu4amCpSnUxCv1ZzjFFS+qLVwlOy1MgIUchNaU3qpDfYchR4QQ4oYCgKlDCcvQpS1QzdaOr05crXDjRtKBSysAOlumLii4QbQqQ4tSpK05I980M6D6tNaKQ+LtHEov52bhnbTErqcmfPcmra/JWrIRQRC7N0Ipqm5etRWn2L1cL2V3JS22t39bxViXqZeorLULToWtCwAsooAvevGJ7YRBYDSvqBU1o3q7G0tDdauUUSFqB2lQzijSM/0QIKhh7qanR7ja7UpZWpUl1PPPINBemGb01eSq8KWplxX9bwKkU9SkXSU7Neb/AC85Smo2b1CZua1RWY4bUOArFKJn+iU1Swd0d39u8QOwrTKlqbXjfs9qxvT1y/BStG4ytvP1zQ/pvq81oyOuNcI4lF0YSTzimldTmVSlXBbILbh3bKE6B2boRRNTNBkc4kHt6KM0ai+ybypV5U4lIV6QqjzUM7ULMiNHt6HAwSAop8YoFuvUSPc3kyIUYMlvk4GM0Q23rbCNvMCTBCnAMBRFEmgcW9CHTPgZeMvJJ2Pot3Xkm8QLQ2m1Bbj7ifVt8g0L6EjXBE4SNRuKClHIC62IvVZi3y1uTYoeQo8AjOKi9R6xRqCUibAR2EoOcDinZA7KnfVNzdaP9UHUL0qMLQXBGyN23xitDXouzVnaFsUsP7fVt85rUtvWqNbLWIEiIHHEpwFEVEsdU25MlT0mPuRnIBFBZA7MivqW5bZ15oB24Jlf/uDcV59O+ivUErVDU+OLYl35UkZ2+MUEXbWDN2lokwmgyGzkgcUSM9dIVvtybc9bw44E7QoiiugPwIdPOxzOGHWI3PqtzqAbg9Zm/kVKEkp5x5zQ907h3Fl5TmoXFdwHLYXXiOojcl8zX2soHISai71rj8auDMyE32URlAkDjOKTYD8CFLUxvkEg0A7eqsiW1qWVLbcV3W4qD6foRQ71KdusyM23AUtLqAPHvW6511iXO1tWxMMIcYTtKseaGZfUNpcxDzjG5KDyKjFC74EeolpvjP8A9KV0IuUYao+oARIIw0V+c1NwGtWW2apdwDq4qj+WTnAFA+oNaovMuLOgNdlMYgqA4zii+4dfoVytUe1C3pDjCQkqx5xSlhd8ChBLT/Gf/tRXUSPqCahLkEufbFO9P5rkKOW74SuQB6N3nNaMjq6wyA25ECwftUJJ1KLhcGruwntoaIUUj3ojIXZehDfPAyXiGS4Ow9FYv4dqa53AS5jriIqTlCSeCKguparxNZbjWpK2SgYJTxmt24dbI93trUOPFDSoycEgecVAf502J4LbsUAt++PNCZC7N0I88sLIeGZbk7H0Ux09Q7b4K13Ze+Ukejd5zU/b29S32Q45du62w2T292cEVWqtWrk3Fu5NAobjqyUfXFF9z68xr9Abt8KEI644AUoDGcU80Ds3Qnp6pob1qD13ctRR3/k4SHCgHAIoh0BCnC3LlTFqMgJykHzmoQdTIEllQkw0qWgeSK07V1JJuKZCW9jTRyU/UVMwnL0ILqoF3Wja3P6juEx1N5DiWEE7N3jFCGvId/fnoTa1uBlJ9W3xipnVHWuHeo7cOBDDK0DClAYzUP8A5zWI0UsOxgtaxjJHioMgd8ClUPge0RiQgjc+qLtOTPkbAphlO6aUYBHnNN6ROpmXZTuo+6W1ElsLzQPZNcG1z/xR5G9sHdsNE1966RNUMojQ4IYLQwSBjNJ0J+BPDNTOPEDiAO3qhnVQ1NIvn9EU6mKVc4zjFWBaZJtunj+FjuSyjnb5zQd/nLhmIuCuIC4sYC8VqaZ10dJzFy5aO+0s5CTzU3M/0Q2yQZr8VGOjG9RXFyU/flOJCclAXmgLWMrVzl++XhodTGSvBIzjFFN460xrmAqBEDI9wBjNaX+dq2vxFRHbekuqGN+2kxn+iLPJBl/FRZp6XNiWIIh7lyFI5x5Br2wxr2GpUm6qXnkpCqCdOdSk6ZlrfkM91tZ4B9qlrx1nZuABjRghJ8gChvhOboRY6lvD60Mz2tSXXUCkqW4mKlfP0xVjR3JVutaI1k3F1ScLKKC19Qoj0VbaIwS4ofqxS0l1KGnXXTNa7wX4zzipPhdl6FWpqocQ86LYS73DZd+aC1rdB8+1AFwtd/F9ElTzny6lZUM8YzRHN6wxlqUUxBhfjioiT1AZmMuM9gBTgwDjxSbC74E9RUB5EbZLEbn1R58zcGbQhGmUKU5t/MLdNWmLdpsGQbg4sPkHgnnNCuhurTXT7vInxhKEjO3IzjNOzurKJUpc6MzsQ4c7RUHwO+BHFWx9pA6wHb1Qu4dUWrUam3lOmOpfvnGM1ZMpjTxsXzUhTZf25wfOaEZfUODc2SlURIcA/Vig2XJudxkFQkqS1n9OatNVOSVqU65Jlz3I7cf8sEgHFeAIhDLYyTWSpLUdIaDQKzwVYppwFHrV6s+1FCoPkas0DFJfis1JKRmmwc06ivE17SpA5pJJZUPBrwtsqOVthRr2lSSS2NkYKOPpXgbaHKWwDXtKknXim2l/6RAVjxmlsbxjYMfSvaVOmXgbaT+lAFItMK/U0Ca9pUkkglCeEpAFedpjO7tDP1r2lSSXhbac/wBK2FfvSCGxwEDFe0qSSWxschABrwtsr/W2FV7SpkkglCeG07RXgbaSdyEAK+te0qSdeKbad/07YWR4zS2Ixt2jb9K9pU6ZeBtpP6UAUu0wOQ0AfrXtKkkvC2yr9bYNehKU8ISEilSpkl4WmDypoE0g2yPDYr2lSSSASn9IxWJZjq5WyCfrWVKnukltQBtCQB9KQQ2nhCAAfNKlSSXgaYTyhoAnyaRQ2fKAa9pUkkglKeEpAH0rwMxhyGQD9a9pUkl4WmFfraBr0AJG1Awn6UqVJKwXgbZT+hsDPn70u0yn9DYGfNe0qSSWEgYSnAPkV4GYzfLTIST5xXtKkkvO20PCB96QQ0n9CAM+a9pUrpLwNMDkNAH60i20r9aAa9pUkktqCNpTlP0rwMx2+WmQknzXtKkkvO21nOwZ+telKV8Op3ClSpkl4GmE8JaApdpgHIaGa9pU6S8KG1/rQFUg0yPDYr2lSSXmxA8JApFDav1IBr2lSSXnbZPlsV7sbHIQM0qVJJeKbZd/07YXjxmkENAYCBj6V7SpJLzY0P0oxXoyn9JxSpUydIpSeSMml580qVJMtmR4rVT5pUqSS9XSRSpUkl6fNeUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSSpUqVJJKlSpUkkqVKlSSX//Z"],
  ["crime e castigo::fiódor dostoiévski", "data:image/jpeg;base64,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"],
  ["vidas secas::graciliano ramos", "data:image/jpeg;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEI5q+FRQqonlQJBGUX6kc2r4cgFQIynuAJBCua38zkQee6ASAAA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"],
  ["watchmen::alan moore", "data:image/jpeg;base64,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"]
]);

function normalizeCoverValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function readStoredCoverCache(key) {
  if (state.bookCoverCache.has(key)) return state.bookCoverCache.get(key);

  try {
    const cache = JSON.parse(localStorage.getItem("bookshare_google_covers_v1") || "{}");
    const value = String(cache[key] || "");
    if (value.startsWith("https://")) {
      state.bookCoverCache.set(key, value);
      return value;
    }
  } catch (_error) {
    // Cache inválido é ignorado.
  }

  return "";
}

function saveStoredCoverCache(key, value) {
  state.bookCoverCache.set(key, value);

  try {
    const cache = JSON.parse(localStorage.getItem("bookshare_google_covers_v1") || "{}");
    cache[key] = value;

    const entries = Object.entries(cache);
    const limited = Object.fromEntries(entries.slice(Math.max(0, entries.length - 250)));
    localStorage.setItem("bookshare_google_covers_v1", JSON.stringify(limited));
  } catch (_error) {
    // O catálogo continua funcionando mesmo sem armazenamento local.
  }
}

function bookCoverUrl(item) {
  const stored = String(item?.cover_url || "").trim();

  const isUploadedRaster =
    stored.startsWith("data:image/jpeg") ||
    stored.startsWith("data:image/png") ||
    stored.startsWith("data:image/webp");

  const isUsableExternal =
    /^https:\/\//i.test(stored) &&
    !stored.includes("/api/public/book-cover") &&
    !stored.includes("data:image/svg+xml");

  if (isUploadedRaster || isUsableExternal) return stored;

  const title = item?.title || item?.book_title || "";
  const author = item?.author || item?.book_author || "";

  const localCover = getLocalBookCover(title, author);
  if (localCover) return localCover;

  const cachedCover = readStoredCoverCache(bookCoverKey(title, author));
  return cachedCover || BOOK_COVER_PLACEHOLDER;
}

function fallbackCoverUrl() {
  return BOOK_COVER_PLACEHOLDER;
}

function inferBookFromImage(image) {
  const card = image.closest(".book-card");
  if (card) {
    return {
      title: card.querySelector("h3")?.textContent?.trim() || "",
      author: card.querySelector(".book-card__author")?.textContent?.trim() || ""
    };
  }

  const tableBook = image.closest(".table-book");
  if (tableBook) {
    const secondary = tableBook.querySelector(".table-secondary")?.textContent?.trim() || "";
    return {
      title: tableBook.querySelector(".table-primary")?.textContent?.trim() || "",
      author: secondary.split(" · ")[0] || ""
    };
  }

  const popular = image.closest(".popular-item");
  if (popular) {
    return {
      title: popular.querySelector(".popular-item__copy strong")?.textContent?.trim() || "",
      author: popular.querySelector(".popular-item__copy span")?.textContent?.trim() || ""
    };
  }

  const searchResult = image.closest('.search-result-item[data-type="book"]');
  if (searchResult) {
    const subtitle = searchResult.querySelector("small")?.textContent?.trim() || "";
    return {
      title: searchResult.querySelector("strong")?.textContent?.trim() || "",
      author: subtitle.split(" · ")[0] || ""
    };
  }

  const detail = image.closest(".detail-header-card");
  if (detail) {
    const spans = [...detail.querySelectorAll("div > span")];
    return {
      title: detail.querySelector("div > strong")?.textContent?.trim() || "",
      author: spans[0]?.textContent?.trim() || ""
    };
  }

  const alt = String(image.alt || "").replace(/^Capa de\s+/i, "").trim();
  return { title: alt, author: "" };
}

function findBestGoogleBookItem(items, title, author) {
  const wantedTitle = normalizeCoverValue(title);
  const wantedAuthor = normalizeCoverValue(author);
  const authorWords = wantedAuthor.split(" ").filter(word => word.length > 2);

  return (Array.isArray(items) ? items : [])
    .filter(item => item?.volumeInfo?.imageLinks && item?.id)
    .map(item => {
      const info = item.volumeInfo;
      const foundTitle = normalizeCoverValue(info.title);
      const foundAuthor = normalizeCoverValue((info.authors || []).join(" "));

      let score = 0;
      if (foundTitle === wantedTitle) score += 70;
      else if (foundTitle.startsWith(wantedTitle)) score += 45;
      else if (foundTitle.includes(wantedTitle)) score += 30;
      else if (wantedTitle.includes(foundTitle)) score += 18;

      const matchingAuthorWords = authorWords.filter(word => foundAuthor.includes(word)).length;
      score += matchingAuthorWords * 10;
      if (authorWords.length && matchingAuthorWords === authorWords.length) score += 20;
      if (info.language === "pt") score += 8;

      return { item, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.item || null;
}

async function requestGoogleBookCover(title, author) {
  const key = bookCoverKey(title, author);

  const localCover = getLocalBookCover(title, author);
  if (localCover) return localCover;

  const cachedCover = readStoredCoverCache(key);
  if (cachedCover) return cachedCover;

  if (state.bookCoverRequests.has(key)) return state.bookCoverRequests.get(key);

  const request = (async () => {
    const queries = [
      `intitle:"${title}"${author ? ` inauthor:"${author}"` : ""}`,
      `"${title}"${author ? ` ${author}` : ""}`,
      title
    ];

    for (const queryText of queries) {
      try {
        const params = new URLSearchParams({
          q: queryText,
          maxResults: "12",
          printType: "books",
          projection: "full",
          orderBy: "relevance"
        });

        const response = await fetch(
          `https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
          { headers: { Accept: "application/json" } }
        );

        if (!response.ok) continue;

        const data = await response.json();
        const best = findBestGoogleBookItem(data.items, title, author);

        if (best?.id) {
          const url =
            `https://books.google.com/books/content?id=${encodeURIComponent(best.id)}` +
            `&printsec=frontcover&img=1&zoom=2&source=gbs_api`;

          saveStoredCoverCache(key, url);
          return url;
        }
      } catch (_error) {
        // Tenta a consulta seguinte.
      }
    }

    return BOOK_COVER_PLACEHOLDER;
  })();

  state.bookCoverRequests.set(key, request);

  try {
    return await request;
  } finally {
    state.bookCoverRequests.delete(key);
  }
}

function applyResolvedCover(title, author, url) {
  const targetKey = bookCoverKey(title, author);

  document.querySelectorAll(
    ".book-card__cover img, .table-book__cover img, .popular-item__cover img, " +
    '.search-result-item[data-type="book"] img, .detail-header-card .table-book__cover img'
  ).forEach(image => {
    const identity = inferBookFromImage(image);
    if (bookCoverKey(identity.title, identity.author) === targetKey) {
      image.src = url;
      image.dataset.coverResolved = "true";
    }
  });
}

async function hydrateBookCoverImage(image) {
  if (!(image instanceof HTMLImageElement)) return;
  if (image.dataset.coverLoading === "true" || image.dataset.coverResolved === "true") return;

  const identity = inferBookFromImage(image);
  if (!identity.title) return;

  const localCover = getLocalBookCover(identity.title, identity.author);
  if (localCover) {
    image.src = localCover;
    image.dataset.coverResolved = "true";
    return;
  }

  const currentSource = image.getAttribute("src") || "";
  if (
    currentSource &&
    currentSource !== BOOK_COVER_PLACEHOLDER &&
    !currentSource.includes("/api/public/book-cover")
  ) {
    image.dataset.coverResolved = "true";
    return;
  }

  image.dataset.coverLoading = "true";

  const url = await requestGoogleBookCover(identity.title, identity.author);
  image.dataset.coverLoading = "false";

  if (url && url !== BOOK_COVER_PLACEHOLDER) {
    applyResolvedCover(identity.title, identity.author, url);
  }
}

function hydrateVisibleBookCovers(root = document) {
  const selector =
    ".book-card__cover img, .table-book__cover img, .popular-item__cover img, " +
    '.search-result-item[data-type="book"] img, .detail-header-card .table-book__cover img';

  root.querySelectorAll(selector).forEach(hydrateBookCoverImage);
}

function initializeBookCoverHydration() {
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        if (node.matches?.("img")) hydrateBookCoverImage(node);
        hydrateVisibleBookCovers(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("load", () => hydrateVisibleBookCovers(document));

  document.addEventListener("error", event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;

    const relevant =
      image.matches(".book-card__cover img") ||
      image.matches(".table-book__cover img") ||
      image.matches(".popular-item__cover img") ||
      image.closest('.search-result-item[data-type="book"]') ||
      image.closest(".detail-header-card");

    if (!relevant) return;

    image.src = BOOK_COVER_PLACEHOLDER;
    image.dataset.coverResolved = "false";
  }, true);
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
