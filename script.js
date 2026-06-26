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

function permanentCoverUrl(title, author = "") {
  const query = new URLSearchParams({
    title: String(title || "").trim(),
    author: String(author || "").trim(),
    v: "28"
  });

  return `${CONFIG.API_BASE_URL}/public/book-cover?${query.toString()}`;
}

function bookCoverUrl(item) {
  const title = item?.title || item?.book_title || "";
  const author = item?.author || item?.book_author || "";

  return permanentCoverUrl(title, author);
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
