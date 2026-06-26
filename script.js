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
  schools: [],
  notifications: [],
  notificationKeys: new Set(),
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
  usuarios: ["Administração", "Funcionárias"],
  escolas: ["Administração", "Escolas"],
  configuracoes: ["Conta", "Meu perfil"]
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
  school: "Escola",
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
  password: "alterou a senha de",
  delete: "excluiu"
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
let notificationPollingTimer = null;

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
    state.user = { ...state.user, ...response.user };
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
  $("#school-form")?.addEventListener("submit", handleSaveSchool);
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
  bindInput("#school-search", renderSchools);
  bindInput("#school-status-filter", renderSchools, "change");

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
  $("#sync-covers-button")?.addEventListener("click", syncOriginalBookCovers);
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
    "delete-user": () => deleteUser(data.id),
    "edit-school": () => editSchool(data.id),
    "toggle-school": () => toggleSchool(data.id, data.active === "true"),
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
  state.schools = [];
  state.notifications = [];
  state.notificationKeys = new Set();
  if (notificationPollingTimer) {
    clearInterval(notificationPollingTimer);
    notificationPollingTimer = null;
  }
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

  $$(".admin-only, .admin-only-nav").forEach(element => {
    element.classList.toggle("is-hidden", !isAdmin);
  });

  $$(".librarian-only, .librarian-only-nav").forEach(element => {
    element.classList.toggle("is-hidden", isAdmin);
  });

  $("#notifications-button")?.classList.toggle("is-hidden", isAdmin);
  $("#notification-panel")?.classList.remove("is-open");

  $$("[data-settings-tab]").forEach(button => {
    button.classList.toggle(
      "is-hidden",
      button.dataset.settingsTab !== "account"
    );
  });

  $(".settings-form__footer")?.classList.add("is-hidden");
  switchSettingsTab("account");

  const role = isAdmin ? "Administrador do sistema" : "Bibliotecária";
  const roleDescription = isAdmin
    ? "Cadastros, escolas, livros e controle de contas."
    : "Empréstimos, devoluções, reservas e avisos de prazo.";

  setAvatarElement($("#sidebar-avatar"), state.user);
  setAvatarElement($("#topbar-avatar"), state.user);
  setAvatarElement($("#profile-photo-preview"), state.user);
  if ($("#admin-hero-avatar")) setAvatarElement($("#admin-hero-avatar"), state.user);
  if ($("#librarian-hero-avatar")) setAvatarElement($("#librarian-hero-avatar"), state.user);

  $("#sidebar-user-name").textContent = state.user.name;
  $("#topbar-user-name").textContent = state.user.name;
  if ($("#librarian-hero-name")) $("#librarian-hero-name").textContent = state.user.name;
  if ($("#admin-hero-name")) $("#admin-hero-name").textContent = state.user.name;
  if ($("#admin-hero-email")) $("#admin-hero-email").textContent = state.user.email || "";

  $("#topbar-role-pill").textContent = isAdmin ? "Administração" : "Balcão";
  $("#sidebar-user-role").textContent = role;
  $("#topbar-user-role").textContent = role;
  $("#profile-name-input").value = state.user.name || "";
  $("#profile-email-input").value = state.user.email || "";
  if ($("#profile-phone-input")) $("#profile-phone-input").value = state.user.phone || "";
  $("#profile-role-icon").textContent = isAdmin ? "A" : "B";
  $("#profile-role-title").textContent = role;
  $("#profile-role-description").textContent = roleDescription;

  if ($("#profile-school-name")) {
    $("#profile-school-name").textContent = state.user.school_name || state.settings?.school_name || "Não vinculada";
  }
  if ($("#profile-job-title")) {
    $("#profile-job-title").textContent = state.user.job_title || role;
  }
  if ($("#profile-phone")) {
    $("#profile-phone").textContent = state.user.phone || "Não informado";
  }
}

async function loadCoreData() {
  await Promise.all([
    loadSettings(),
    loadCategories(),
    loadClasses(),
    loadBooks(),
    loadStudents()
  ]);

  if (state.user?.role === "admin") {
    await Promise.all([
      loadSchools(),
      loadUsers()
    ]);

    state.loans = [];
    state.reservations = [];
    state.pending = [];
    state.notifications = [];
  } else {
    await Promise.all([
      loadLoans(),
      loadReservations(),
      loadPending(),
      loadNotifications({ announce: false })
    ]);

    startNotificationPolling();
  }

  updateAllSelectOptions();
  buildNotifications();
}

async function navigate(route, updateHash = true) {
  if (!routeMeta[route]) route = "dashboard";
  const librarianBlockedRoutes = ["exemplares", "relatorios", "atividades", "usuarios", "escolas"];
  const adminBlockedRoutes = ["atendimento", "emprestimos", "reservas", "pendencias", "exemplares", "turmas", "relatorios", "atividades"];

  if (state.user?.role !== "admin" && librarianBlockedRoutes.includes(route)) route = "dashboard";
  if (state.user?.role === "admin" && adminBlockedRoutes.includes(route)) route = "dashboard";

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
      escolas: loadSchools,
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
  if (adminTitle) adminTitle.textContent = "Painel administrativo";

  if (state.user?.role === "admin" && dashboard.admin) {
    $("#admin-total-staff").textContent = dashboard.admin.active_staff || 0;
    $("#admin-total-students").textContent = dashboard.admin.active_students || 0;
    $("#admin-total-schools").textContent = dashboard.admin.active_schools || 0;
    $("#admin-total-books").textContent = dashboard.admin.active_books || 0;
  }

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
        ${`<img src="${escapeAttribute(bookCoverUrl(item))}" alt="Capa de ${escapeAttribute(item.title)}" loading="lazy" ${coverImageAttributes(item.title, item.author, item.cover_url)}>`}
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


async function syncOriginalBookCovers() {
  if (state.user?.role !== "admin") return;

  const button = $("#sync-covers-button");
  setButtonLoading(button, true, "Iniciando...");
  try {
    await api("/admin/book-covers/sync", {
      method: "POST",
      body: { force: true }
    });

    toast("Capas em atualização", "O servidor está validando e salvando as capas originais.", "success");
    await pollBookCoverSync();
  } catch (error) {
    toast("Não foi possível atualizar", error.message, "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function pollBookCoverSync() {
  const statusBox = $("#cover-sync-status");
  if (!statusBox) return;

  statusBox.classList.remove("is-hidden");
  statusBox.classList.add("is-running");

  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const status = await api("/public/book-covers/status");

      statusBox.textContent = status.running
        ? `Atualizando capas: ${status.processed || 0} de ${status.total || 0}. ${status.currentTitle || ""}`
        : `Capas concluídas: ${status.updated || 0} atualizadas e ${status.failed || 0} sem imagem disponível.`;

      if (!status.running) {
        statusBox.classList.remove("is-running");
        await loadBooks();
        return;
      }
    } catch (_error) {
      statusBox.textContent = "Aguardando resposta do servidor de capas...";
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  statusBox.classList.remove("is-running");
  statusBox.textContent = "A atualização continua no servidor. Recarregue a página em alguns minutos.";
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
        <img loading="lazy" src="${escapeAttribute(bookCoverUrl(item))}" alt="Capa de ${escapeAttribute(item.title)}" ${coverImageAttributes(item.title, item.author, item.cover_url)}>
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
            <img src="${escapeAttribute(bookCoverUrl(book))}" alt="Capa de ${escapeAttribute(book.title)}" loading="lazy" ${coverImageAttributes(book.title, book.author, book.cover_url)}>
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



const BOOK_COVER_PLACEHOLDER =
  "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22420%22%20height%3D%22640%22%20viewBox%3D%220%200%20420%20640%22%3E%3Crect%20width%3D%22420%22%20height%3D%22640%22%20rx%3D%2228%22%20fill%3D%22%23f4f1e9%22%2F%3E%3Crect%20x%3D%2262%22%20y%3D%2272%22%20width%3D%22296%22%20height%3D%22496%22%20rx%3D%2222%22%20fill%3D%22%23ffffff%22%20stroke%3D%22%23d7d2c7%22%20stroke-width%3D%225%22%2F%3E%3Cpath%20d%3D%22M132%20204c40-22%2078-19%2078-19v246s-38-4-78%2018V204Zm156%200c-40-22-78-19-78-19v246s38-4%2078%2018V204Z%22%20fill%3D%22none%22%20stroke%3D%22%23176b63%22%20stroke-width%3D%228%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M210%20186v246%22%20stroke%3D%22%23176b63%22%20stroke-width%3D%228%22%20stroke-linecap%3D%22round%22%2F%3E%3Ctext%20x%3D%22210%22%20y%3D%22504%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2220%22%20fill%3D%22%2366736f%22%3ECapa%20original%3C%2Ftext%3E%3Ctext%20x%3D%22210%22%20y%3D%22534%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2220%22%20fill%3D%22%2366736f%22%3En%C3%A3o%20localizada%3C%2Ftext%3E%3C%2Fsvg%3E";


const EMBEDDED_ORIGINAL_COVERS_V31 = new Map([
  ["seis pecas faceis", "data:image/webp;base64,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"],
  ["fisica em seis licoes", "data:image/webp;base64,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"],
  ["sete breves licoes de fisica", "data:image/jpeg;base64,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"]
]);

function normalizeEmbeddedCoverTitle(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function permanentCoverUrl(itemOrTitle, author = "") {
  const item = typeof itemOrTitle === "object" && itemOrTitle !== null
    ? itemOrTitle
    : { title: itemOrTitle, author };

  const title = item?.title || item?.book_title || "";
  const bookAuthor = item?.author || item?.book_author || author || "";
  const revision = item?.cover_checked_at || item?.updated_at || "30";

  const query = new URLSearchParams({
    title: String(title).trim(),
    author: String(bookAuthor).trim(),
    v: "30",
    rev: String(revision)
  });

  return `${CONFIG.API_BASE_URL}/public/book-cover?${query.toString()}`;
}

function bookCoverUrl(item) {
  const title = item?.title || item?.book_title || "";
  const embedded = EMBEDDED_ORIGINAL_COVERS_V31.get(
    normalizeEmbeddedCoverTitle(title)
  );

  return embedded || permanentCoverUrl(item);
}

function fallbackCoverUrl() {
  return BOOK_COVER_PLACEHOLDER;
}

function handleBookCoverError(image) {
  if (!(image instanceof HTMLImageElement)) return;

  image.onerror = null;
  image.src = BOOK_COVER_PLACEHOLDER;
}

function coverImageAttributes(title, author = "", storedCover = "") {
  return `data-book-cover="true" data-cover-title="${escapeAttribute(title)}" data-cover-author="${escapeAttribute(author)}" data-stored-cover="${escapeAttribute(storedCover)}" onerror="handleBookCoverError(this)"`;
}

function initializeBookCoverHydration() {
  // O Render valida e salva permanentemente cada capa original.
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


async function loadSchools() {
  if (state.user?.role !== "admin") return;
  const response = await api("/schools");
  state.schools = response.schools || [];
  renderSchools();
  updateAllSelectOptions();
}

function renderSchools() {
  const container = $("#schools-container");
  if (!container || state.user?.role !== "admin") return;

  const search = normalize($("#school-search")?.value || "");
  const status = $("#school-status-filter")?.value || "";

  const items = state.schools.filter(item => {
    const searchable = normalize(`${item.name} ${item.code} ${item.address || ""}`);
    const matchesStatus =
      !status ||
      (status === "active" && item.active) ||
      (status === "inactive" && !item.active);

    return (!search || searchable.includes(search)) && matchesStatus;
  });

  if (!items.length) {
    container.innerHTML = emptyState("⌂", "Nenhuma escola encontrada", "Cadastre a primeira unidade escolar.");
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="school-card">
      <div class="school-card__head">
        <span class="school-card__icon">⌂</span>
        <div><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.code)}</span></div>
        ${item.active ? statusBadge("Ativa", "success") : statusBadge("Arquivada", "danger")}
      </div>
      <div class="card-detail-list">
        <div><span>Endereço</span><strong>${escapeHTML(item.address || "Não informado")}</strong></div>
        <div><span>Contato</span><strong>${escapeHTML(item.contact_email || item.phone || "Não informado")}</strong></div>
        <div><span>Funcionárias</span><strong>${item.staff_count || 0}</strong></div>
        <div><span>Alunos</span><strong>${item.student_count || 0}</strong></div>
      </div>
      <div class="card-footer-actions">
        <button class="button button--secondary button--compact" data-action="edit-school" data-id="${item.id}" type="button">Editar</button>
        <button class="button button--ghost button--compact" data-action="toggle-school" data-id="${item.id}" data-active="${item.active}" type="button">${item.active ? "Arquivar" : "Reativar"}</button>
      </div>
    </article>
  `).join("");
}

async function handleSaveSchool(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const id = payload.id;
  delete payload.id;

  const submit = form.querySelector('[type="submit"]');
  setButtonLoading(submit, true, "Salvando...");

  try {
    await api(id ? `/schools/${id}` : "/schools", {
      method: id ? "PUT" : "POST",
      body: payload
    });

    form.reset();
    closeModal("school-modal");
    await loadSchools();
    await loadDashboard();
    toast("Escola salva", "A unidade foi atualizada com sucesso.");
  } catch (error) {
    toast("Não foi possível salvar", error.message, "error");
  } finally {
    setButtonLoading(submit, false);
  }
}

function editSchool(id) {
  const school = state.schools.find(item => item.id === id);
  if (!school) return;

  const form = $("#school-form");
  form.elements.id.value = school.id;
  form.elements.name.value = school.name || "";
  form.elements.code.value = school.code || "";
  form.elements.phone.value = school.phone || "";
  form.elements.address.value = school.address || "";
  form.elements.contact_email.value = school.contact_email || "";
  $("#school-modal-title").textContent = "Editar escola";
  openModal("school-modal");
}

async function toggleSchool(id, active) {
  const school = state.schools.find(item => item.id === id);
  const confirmed = await confirmAction({
    title: active ? "Arquivar escola?" : "Reativar escola?",
    message: active
      ? `A unidade ${school?.name || ""} deixará de aceitar novos vínculos.`
      : `A unidade ${school?.name || ""} voltará a ficar disponível.`,
    acceptText: active ? "Arquivar" : "Reativar",
    danger: active
  });

  if (!confirmed) return;

  try {
    await api(`/schools/${id}/status`, {
      method: "PUT",
      body: { active: !active }
    });

    await loadSchools();
    await loadDashboard();
    toast("Escola atualizada", active ? "A unidade foi arquivada." : "A unidade foi reativada.");
  } catch (error) {
    toast("Não foi possível atualizar", error.message, "error");
  }
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
      <div class="card-detail-list">
        <div><span>Escola</span><strong>${escapeHTML(item.school_name || "Não vinculada")}</strong></div>
        <div><span>Cargo</span><strong>${escapeHTML(item.job_title || (item.role === "admin" ? "Administrador" : "Bibliotecária"))}</strong></div>
        <div><span>Telefone</span><strong>${escapeHTML(item.phone || "Não informado")}</strong></div>
      </div>
      <div class="card-footer-actions card-footer-actions--three">
        <button class="button button--secondary button--compact" data-action="reset-user-password" data-id="${item.id}" type="button">Senha</button>
        <button class="button button--ghost button--compact" data-action="toggle-user" data-id="${item.id}" data-active="${item.active}" type="button">${item.active ? "Bloquear" : "Ativar"}</button>
        <button class="button button--danger button--compact" data-action="delete-user" data-id="${item.id}" type="button">Excluir</button>
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
    form.reset();
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

async function deleteUser(id) {
  if (id === state.user.id) {
    toast("Ação bloqueada", "Você não pode excluir sua própria conta.", "warning");
    return;
  }

  const user = state.users.find(item => item.id === id);
  const confirmed = await confirmAction({
    title: "Excluir conta?",
    message: `A conta de ${user?.name || "esta funcionária"} perderá o acesso e deixará de aparecer na equipe.`,
    acceptText: "Excluir conta",
    danger: true
  });

  if (!confirmed) return;

  try {
    await api(`/users/${id}`, { method: "DELETE" });
    await loadUsers();
    await loadDashboard();
    toast("Conta excluída", "A funcionária não possui mais acesso ao BookShare.");
  } catch (error) {
    toast("Não foi possível excluir", error.message, "error");
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
        phone: $("#profile-phone-input")?.value.trim() || null,
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
    ? `<img src="${escapeAttribute(visual)}" alt="${type === "book" ? `Capa de ${escapeAttribute(title)}` : ""}" loading="lazy" ${type === "book" ? coverImageAttributes(title, String(subtitle || "").split(" · ")[0]) : ""}>`
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

async function loadNotifications({ announce = true } = {}) {
  if (state.user?.role === "admin") {
    state.notifications = [];
    buildNotifications();
    return;
  }

  try {
    const response = await api("/notifications");
    const nextItems = response.notifications || [];
    const nextKeys = new Set(nextItems.map(item => item.key));

    if (announce && state.notificationKeys.size > 0) {
      const newItems = nextItems.filter(item => !state.notificationKeys.has(item.key));
      if (newItems.length) {
        toast(
          "Novo aviso de prazo",
          newItems[0].title,
          newItems[0].type === "danger" ? "error" : "warning"
        );
      }
    }

    state.notifications = nextItems;
    state.notificationKeys = nextKeys;
    buildNotifications();
  } catch (error) {
    console.warn("Não foi possível atualizar notificações:", error.message);
  }
}

function startNotificationPolling() {
  if (notificationPollingTimer) clearInterval(notificationPollingTimer);

  if (state.user?.role !== "librarian") return;

  notificationPollingTimer = setInterval(() => {
    loadNotifications({ announce: true });
  }, 60000);
}

function buildNotifications() {
  const items = state.user?.role === "librarian"
    ? state.notifications
    : [];

  const container = $("#notification-list");
  if (!container) return;

  container.innerHTML = items.length ? items.map(item => `
    <button class="notification-item ${item.type === "danger" ? "notification-item--danger" : item.type === "warning" ? "notification-item--warning" : ""}" data-route="${item.route}" type="button">
      <span class="notification-item__icon">${escapeHTML(item.icon || "!")}</span>
      <span>
        <strong>${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(item.message)}</span>
        <small>${escapeHTML(item.time || "")}</small>
      </span>
    </button>
  `).join("") : emptyState("✓", "Tudo em ordem", "Nenhum prazo importante no momento.");

  $("#notification-dot")?.classList.toggle("is-hidden", items.length === 0);
}

function updateNavigationCounters() {
  if (state.user?.role === "admin") return;
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
  const adminOnlyModals = ["book-modal", "copy-modal", "user-modal", "student-modal", "class-modal", "school-modal"];
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
  if (id === "school-modal") $("#school-modal-title").textContent = "Cadastrar escola";

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
  setSelectOptions("#user-school", state.schools.filter(item => item.active), item => item.id, item => item.name, "Selecione uma escola");

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
      <span class="table-book__cover">${coverUrl ? `<img src="${escapeAttribute(coverUrl)}" alt="Capa de ${escapeAttribute(title)}" loading="lazy" ${coverImageAttributes(title, subtitle)}>` : "BS"}</span>
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
