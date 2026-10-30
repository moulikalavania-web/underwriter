// 2. INITIALIZATION & SETUP
// ============================================================================
// ============================================================================
// PERSISTENCE: the working state is saved to the browser after most actions and restored on the next load.
//   - The saved state carries a VERSION. A save made by a different version of the app is ignored (and cleared),
//     never loaded into code that would not understand it.
//   - A storage-size GUARD keeps the save inside the browser's limit (about 5 million characters per site). When it is
//     too large, the original attachment files (base64) go first, then the large derived text; the cases themselves are
//     always kept. If it still does not fit, the previous save is left as it was and the user is told.
//   - "Clear saved session" (header) still wipes it and reloads blank.
// ============================================================================
const FUT_STORAGE_KEY = "veridex_app_state_v1";
const APP_STATE_VERSION = 3;   // 3: the workflow has 14 steps; a session saved with the old step numbers is not carried over
const APP_STATE_MAX_CHARS = 4500000;
// Restoring the saved session when the page loads is switched OFF for now: a refresh starts blank, as before. The save, the version key,
// the size guard and restoreAppState() all stay in place; set this to true to bring the restore back.
var APP_STATE_RESTORE_ON_LOAD = false;
var APP_STATE_STATUS = { savedChars: 0, trimmed: [], lastError: null, warned: {} };

function appStateWarn(key, msg) {
  if (APP_STATE_STATUS.warned[key]) return;
  APP_STATE_STATUS.warned[key] = true;
  if (typeof showToast === "function") showToast(msg, "warning");
}

/** Serialises the state, dropping the heaviest parts in steps until it fits. Returns { json, trimmed[] } or null when nothing fits. */
function appStateSerialize(state) {
  const tiers = [
    { name: null, drop: [] },
    { name: "the original attachment files", drop: ["base64"] },
    { name: "extracted document text and rating-request copies", drop: ["base64", "textExcerpt", "engineRequest"] }
  ];
  for (let i = 0; i < tiers.length; i++) {
    const drop = tiers[i].drop;
    const json = JSON.stringify(state, drop.length ? (k, v) => (drop.indexOf(k) > -1 ? undefined : v) : undefined);
    if (json.length <= APP_STATE_MAX_CHARS) return { json: json, trimmed: tiers[i].name ? [tiers[i].name] : [] };
  }
  return null;
}

function persistAppState() {
  try {
    const state = {
      version: APP_STATE_VERSION,
      SUBMISSIONS_DATASET: SUBMISSIONS_DATASET,
      QUOTE_VERSIONS_DATASET: QUOTE_VERSIONS_DATASET,
      DECLINE_LOG: DECLINE_LOG,
      LOB_CATALOG: LOB_CATALOG,
      ALL_LOB_KEYS: ALL_LOB_KEYS,
      ACTIVE_INSURANCE_PRODUCT: window.ACTIVE_INSURANCE_PRODUCT || null,
      activeSubmissionId: activeSubmissionId,
      currentLOBFilter: typeof currentLOBFilter !== "undefined" ? currentLOBFilter : null,
      DISCRETIONARY_MAX_CREDIT_PCT: DISCRETIONARY_MAX_CREDIT_PCT,
      DISCRETIONARY_MAX_DEBIT_PCT: DISCRETIONARY_MAX_DEBIT_PCT,
      savedAt: new Date().toISOString()
    };
    const out = appStateSerialize(state);
    if (!out) {
      APP_STATE_STATUS.lastError = "too large";
      appStateWarn("full", "⚠️ The saved session is too large for browser storage, so the latest changes are not being saved. Export what you need or clear the saved session.");
      return false;
    }
    localStorage.setItem(FUT_STORAGE_KEY, out.json);
    APP_STATE_STATUS.savedChars = out.json.length; APP_STATE_STATUS.trimmed = out.trimmed; APP_STATE_STATUS.lastError = null;
    if (out.trimmed.length) appStateWarn("trim", "ℹ️ Storage is nearly full: " + out.trimmed.join(" and ") + " are kept for this session only and will not be there after a reload. The cases themselves are saved.");
    return true;
  } catch (e) {
    APP_STATE_STATUS.lastError = String(e && e.message || e);
    appStateWarn("error", "⚠️ The session could not be saved to browser storage (" + APP_STATE_STATUS.lastError + ").");
    console.warn("Failed to persist app state to localStorage:", e);
    return false;
  }
}

/** Replaces the contents of an array in place (the data is held in shared top-level arrays). */
function appStateFill(target, source) {
  target.length = 0;
  (Array.isArray(source) ? source : []).forEach(x => target.push(x));
}

/**
 * Loads the saved state if there is one made by this version of the app. Returns true when something was restored.
 * It only fills an app that has nothing in use yet: once someone has signed in or a case exists, the live session wins
 * (pass force = true to load over it).
 */
function restoreAppState(force) {
  if (!force && (appInitialised || SUBMISSIONS_DATASET.length)) return false;
  let raw = null;
  try { raw = localStorage.getItem(FUT_STORAGE_KEY); } catch (e) { return false; }
  if (!raw) return false;
  let state = null;
  try { state = JSON.parse(raw); } catch (e) { state = null; }
  if (!state || state.version !== APP_STATE_VERSION) {
    try { localStorage.removeItem(FUT_STORAGE_KEY); } catch (e) {}
    return false;
  }
  appStateFill(SUBMISSIONS_DATASET, state.SUBMISSIONS_DATASET);
  appStateFill(QUOTE_VERSIONS_DATASET, state.QUOTE_VERSIONS_DATASET);
  appStateFill(DECLINE_LOG, state.DECLINE_LOG);
  if (Array.isArray(state.LOB_CATALOG) && state.LOB_CATALOG.length) { appStateFill(LOB_CATALOG, state.LOB_CATALOG); appStateFill(ALL_LOB_KEYS, state.ALL_LOB_KEYS && state.ALL_LOB_KEYS.length ? state.ALL_LOB_KEYS : LOB_CATALOG.map(l => l.key)); }
  // Attachment files dropped by the size guard are not there to read again.
  SUBMISSIONS_DATASET.forEach(s => (s.rawAttachments || []).forEach(a => { if (!a.base64) { a.base64 = null; a.unavailable = true; } }));
  if (typeof state.DISCRETIONARY_MAX_CREDIT_PCT === "number") { DISCRETIONARY_MAX_CREDIT_PCT = state.DISCRETIONARY_MAX_CREDIT_PCT; window.DISCRETIONARY_MAX_CREDIT_PCT = DISCRETIONARY_MAX_CREDIT_PCT; }
  if (typeof state.DISCRETIONARY_MAX_DEBIT_PCT === "number") { DISCRETIONARY_MAX_DEBIT_PCT = state.DISCRETIONARY_MAX_DEBIT_PCT; window.DISCRETIONARY_MAX_DEBIT_PCT = DISCRETIONARY_MAX_DEBIT_PCT; }
  if (state.ACTIVE_INSURANCE_PRODUCT) {
    window.ACTIVE_INSURANCE_PRODUCT = state.ACTIVE_INSURANCE_PRODUCT;
    ACTIVE_INSURANCE_PRODUCT = state.ACTIVE_INSURANCE_PRODUCT;
    const info = state.ACTIVE_INSURANCE_PRODUCT.product || state.ACTIVE_INSURANCE_PRODUCT.identity || {};
    const pId = state.ACTIVE_INSURANCE_PRODUCT.productId || info.id;
    const lobSelect = document.getElementById("lobSelect");
    if (lobSelect && pId) lobSelect.innerHTML = '<option value="' + pId + '" selected>🚛 ' + pId + ': ' + (info.name || "") + ' (' + (info.lineOfBusiness || info.segment || "") + ' v' + (state.ACTIVE_INSURANCE_PRODUCT.version || info.version || "") + ')</option>';
    if (typeof renderActiveInsuranceProduct === "function") renderActiveInsuranceProduct();
  }
  if (state.currentLOBFilter && typeof currentLOBFilter !== "undefined") currentLOBFilter = state.currentLOBFilter;
  activeSubmissionId = SUBMISSIONS_DATASET.some(s => s.id === state.activeSubmissionId) ? state.activeSubmissionId : (SUBMISSIONS_DATASET[0] ? SUBMISSIONS_DATASET[0].id : null);
  return true;
}
window.restoreAppState = restoreAppState;

function resetPrototypeData() {
  try { localStorage.removeItem(FUT_STORAGE_KEY); } catch (e) {}
  showToast("🔄 Saved session cleared. Reloading blank...", "info");
  setTimeout(() => window.location.reload(), 600);
}
window.resetPrototypeData = resetPrototypeData;

document.addEventListener("DOMContentLoaded", () => {
  // Restoring is off for now (APP_STATE_RESTORE_ON_LOAD): a refresh starts blank and the old save is cleared.
  // When it is on, the app comes back to where the last session left off. "Clear saved session" in the header always starts blank.
  try {
    if (APP_STATE_RESTORE_ON_LOAD) restoreAppState();
    else localStorage.removeItem(FUT_STORAGE_KEY);
  } catch (e) { console.warn("Could not restore the saved session:", e); }

  populateLoginUserSelect();
  // The rest of the app (submissions table, intake page, etc.) is only
  // initialized after a successful login — see initAppAfterLogin(), fired
  // from submitLogin(). Nothing internal renders or becomes reachable
  // before that.
});

// ----------------------------------------------------------------------------
// LOGIN GATE — must be the first thing the user sees and interacts with.
// Everything else (header, sidebar, all 9 screens, every modal) stays
// hidden behind body.pre-login until submitLogin() succeeds. This is a
// browser-only prototype with no backend, so there is no real credential
// check — signing in means picking who you are (same roster used
// everywhere else in the app, USER_ROLES_CONFIG/TEAM_USERS) and entering
// any non-empty password. What matters functionally is that no internal
// page, data, or action is reachable until this step completes, and that
// existing role-based permissions are set up exactly as before via the
// same changeUserRole() used by the role switcher.
// ----------------------------------------------------------------------------
function populateLoginUserSelect() {
  const select = document.getElementById("loginUserSelect");
  if (!select) return;
  const roster = (typeof TEAM_USERS !== "undefined" && TEAM_USERS.length)
    ? TEAM_USERS
    : Object.keys(USER_ROLES_CONFIG).map(roleKey => ({ roleKey, name: USER_ROLES_CONFIG[roleKey].name, title: USER_ROLES_CONFIG[roleKey].title }));
  select.innerHTML = roster.map(u =>
    `<option value="${u.roleKey}">${u.name} — ${u.title}</option>`
  ).join("");
}

function submitLogin() {
  const select = document.getElementById("loginUserSelect");
  const passwordInput = document.getElementById("loginPasswordInput");
  let valid = true;

  if (!select || !select.value) {
    if (typeof showFieldError === "function") showFieldError("loginUserSelect");
    valid = false;
  } else if (typeof clearFieldError === "function") {
    clearFieldError("loginUserSelect");
  }

  if (!passwordInput || !passwordInput.value.trim()) {
    if (typeof showFieldError === "function") showFieldError("loginPasswordInput");
    valid = false;
  } else if (typeof clearFieldError === "function") {
    clearFieldError("loginPasswordInput");
  }

  if (!valid) return;

  const chosenRole = select.value;
  document.body.classList.remove("pre-login");
  if (passwordInput) passwordInput.value = "";

  initAppAfterLogin(chosenRole);
}
window.submitLogin = submitLogin;

// Runs exactly once, right after a successful login. Sets the logged-in
// user's role (via the same changeUserRole() the role switcher already
// uses, so permissions/sidebar/dashboards are configured identically to
// before) and then performs the app's normal first render — this used to
// run unconditionally on DOMContentLoaded; now it only runs post-login.
let appInitialised = false;
function initAppAfterLogin(chosenRole) {
  if (!appInitialised) {      // one-time wiring; signing in again after "Switch user" must not repeat it
    setupNavigationEvents();
    restoreSidebarCollapsedState();
    setupLOBSelector();
    setupDiagramModal();
    appInitialised = true;
  }
  if (typeof changeUserRole === "function" && chosenRole) changeUserRole(chosenRole);
  filterSubmissionsTable("all");   // every sign-in opens the queue on All Submissions
  selectSubmission(activeSubmissionId, false);
  showIntakePage();
}

/** The one way to change who you are: go back to the sign-in screen (there is no separate in-app role dropdown). */
function switchUser() {
  populateLoginUserSelect();
  const sel = document.getElementById("loginUserSelect");
  if (sel && currentUserRole) sel.value = currentUserRole;
  const pw = document.getElementById("loginPasswordInput");
  if (pw) pw.value = "";
  document.body.classList.add("pre-login");
}
window.switchUser = switchUser;

function setupNavigationEvents() {
  // Note: the sidebar toggle button already has an inline onclick="toggleSidebar()"
  // in the HTML. Do NOT also addEventListener here — doing both fires the
  // toggle twice per click (collapse then immediately re-expand), which
  // makes the button appear completely non-functional.
}

function changeUserRole(role) {
  currentUserRole = role;

  const roleConfig = USER_ROLES_CONFIG[role] || USER_ROLES_CONFIG.junior;

  // Update sidebar user persona
  const uAvatar = document.getElementById("sidebarUserAvatar");
  const uName = document.getElementById("sidebarUserName");
  const uTitle = document.getElementById("sidebarUserRoleTitle");
  if (uAvatar) uAvatar.textContent = roleConfig.icon;
  if (uName) uName.textContent = roleConfig.name;
  if (uTitle) uTitle.textContent = roleConfig.limit > 0 ? `${roleConfig.title.split(' (')[0]} (${roleConfig.limitText.split(' ')[0]})` : roleConfig.title.split(' (')[0];

  // Simplified UI: the whole Admin-only nav group (User Master, Team
  // Activity, Archive) is one section that shows/hides together.
  const adminSection = document.getElementById("sidebarAdminSection");
  if (adminSection) adminSection.style.display = role === "admin" ? "block" : "none";
  if (role !== "admin" && ["user-master", "team-activity", "archive"].includes(currentPage)) {
    showIntakePage();
  }

  // Audit Log: visible to Compliance/Executive/Binding/Admin personas only
  // (whoever holds auditLog.view in the RBAC matrix), independent of the
  // Admin-only nav group above.
  const complianceSection = document.getElementById("sidebarComplianceSection");
  const canViewAuditLog = PERMISSIONS_MATRIX[role] && PERMISSIONS_MATRIX[role].auditLog && PERMISSIONS_MATRIX[role].auditLog.view;
  if (complianceSection) complianceSection.style.display = canViewAuditLog ? "block" : "none";
  if (!canViewAuditLog && currentPage === "audit-log") {
    showIntakePage();
  }

  // Toggle "Unified Account View" nav item visibility (hidden for roles
  // without unifiedAccount.view permission, e.g. Junior Underwriter)
  const unifiedAccountNav = document.getElementById("navItemUnifiedAccount");
  const canViewUnifiedAccount = PERMISSIONS_MATRIX[role] && PERMISSIONS_MATRIX[role].unifiedAccount && PERMISSIONS_MATRIX[role].unifiedAccount.view;
  if (unifiedAccountNav) unifiedAccountNav.style.display = canViewUnifiedAccount ? "flex" : "none";
  if (!canViewUnifiedAccount && currentPage === "unified-account") {
    showIntakePage();
  }

  if (role === "senior") {
    filterSubmissionsTable("referral");
  } else {
    filterSubmissionsTable("all");
  }

  showToast(`${roleConfig.icon} Now viewing as ${roleConfig.name}`, "info");

  // Refresh Table highlights
  renderSubmissionsTable();
  renderRoleDashboard();

  // Refresh Authority Screen, Appetite Rules table, and Vehicles Workbench if sub is loaded —
  // all are permission-gated (appetiteRules override, base rate override, authority sign-off)
  // and must reflect the newly active persona immediately, even if the
  // user is already sitting on that screen when they switch roles.
  let sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (sub) {
    renderAuthorityScreen(sub);
    renderAppetiteRules(sub.appetiteRules);
    renderUnderwritingWorkbench(sub);
    if (typeof renderVehicleEnrichment === "function") renderVehicleEnrichment(sub);
    if (typeof renderComplianceGate === "function") renderComplianceGate(sub);
  }
}

function setupLOBSelector() {
  const lobSelect = document.getElementById("lobSelect");
  if (lobSelect) {
    lobSelect.addEventListener("change", (e) => {
      const chosenLob = e.target.value;
      currentLOBFilter = chosenLob;

      // Find first submission matching this LOB (or first overall if 'all')
      let match = null;
      if (chosenLob === "all") {
        match = SUBMISSIONS_DATASET[0];
      } else {
        match = SUBMISSIONS_DATASET.find(s => s.lobKey === chosenLob);
      }

      if (match) {
        selectSubmission(match.id, false);
        renderSubmissionsTable();
        showToast(`LOB Filtered: ${match.lobName} • Queue & Enrichment Synchronized`, "info");
      } else {
        renderSubmissionsTable();
      }
    });
  }
}

function changeQueueSorting(sortMode) {
  currentQueueSort = sortMode;
  renderSubmissionsTable();
  if (sortMode === "fifo") {
    showToast("Queue Order: FIFO (First-In, First-Out by arrival timestamp)", "info");
  } else if (sortMode === "priority") {
    showToast("Queue Order: Priority & SLA (Urgent P1 Cases First)", "success");
  } else if (sortMode === "exposure") {
    showToast("Queue Order: Highest Exposure / Total Insured Value First", "info");
  }
}

function escalateSubmissionPriority(pLevel) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) return;

  sub.priority = pLevel;
  // The score is not measured by anything here, so it is cleared; the SLA wording and countdown come from the target
  // for the level and the case's own receipt time.
  sub.priorityScore = null;
  sub.slaHours = slaHoursFor(pLevel);
  sub.slaText = slaTextFor(pLevel);
  sub.slaCountdown = slaCountdownFor(sub);
  sub.priorityReason = pLevel === "P1" ? "Manual Underwriter Escalation (P1 Highest Priority SLA Activated)" : (pLevel === "P2" ? "Standard High Priority SLA" : "Standard FIFO Queue Position");

  // Update Screen 4 Triage Card
  const bBadge = document.getElementById("triagePriorityBadge");
  const bSla = document.getElementById("assignedSlaTarget");
  const bCount = document.getElementById("triageSlaCountdown");
  if (bBadge) {
    bBadge.className = `badge ${pLevel === 'P1' ? 'badge-danger' : (pLevel === 'P2' ? 'badge-warning' : 'badge-info')}`;
    bBadge.textContent = `Priority: ${pLevel} - ${pLevel === 'P1' ? 'Highest' : (pLevel === 'P2' ? 'High' : 'FIFO')} ${priorityScoreText(sub)}`;
  }
  if (bSla) bSla.textContent = sub.slaText;
  if (bCount) bCount.textContent = slaCountdownFor(sub);

  // Reflect the new priority everywhere else this submission is displayed:
  // workflow top header pill, all downstream screens/cards bound to this
  // submission (quote summaries, case summary modal, etc.), the intake
  // table (row badge + referral filter/highlighting), and Team Activity's
  // delayed-case heuristic if that dashboard is currently open.
  updateActiveCaseHeaders(sub);
  renderAllDownstreamScreens(sub);
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
  showToast(`⚡ Priority for ${sub.insured} updated to ${pLevel}! Queue rank updated.`, pLevel === 'P1' ? 'danger' : 'success');
}

function setupDiagramModal() {
  const btn = document.getElementById("btnToggleFlowchart");
  if (btn) {
    btn.addEventListener("click", () => {
      const modal = document.getElementById("diagramModal");
      if (modal) modal.classList.add("active");
    });
  }
}

function closeFlowchartModal() {
  const modal = document.getElementById("diagramModal");
  if (modal) modal.classList.remove("active");
}

function navFromDiagram(targetScreen) {
  closeFlowchartModal();
  goToScreen(targetScreen);
  showToast(`Navigated to ${targetScreen.toUpperCase()} from Architecture Diagram`, "info");
}

// ============================================================================
// 3. SIDEBAR TOGGLE & FULL-SCREEN
// ============================================================================
function toggleSidebar() {
  const layout = document.getElementById("appLayout");
  if (!layout) return;

  const isCollapsed = layout.classList.toggle("sidebar-collapsed");
  document.body.classList.toggle("sidebar-is-collapsed", isCollapsed);

  const toggleBtn = document.getElementById("btnToggleSidebar");
  if (toggleBtn) {
    toggleBtn.classList.toggle("active-collapsed", isCollapsed);
  }

  // Persist per-user preference (§5: "Toggle state persists per-user in
  // localStorage") so the sidebar stays collapsed/expanded across reloads.
  try {
    localStorage.setItem("veridex_sidebar_collapsed", isCollapsed ? "1" : "0");
  } catch (e) { /* localStorage unavailable — non-fatal */ }

  if (isCollapsed) {
    showToast("🖥️ Sidebar Collapsed", "info");
  } else {
    showToast("Sidebar Expanded", "info");
  }
}

function restoreSidebarCollapsedState() {
  const layout = document.getElementById("appLayout");
  const toggleBtn = document.getElementById("btnToggleSidebar");
  if (!layout) return;

  let wasCollapsed = false;
  try {
    wasCollapsed = localStorage.getItem("veridex_sidebar_collapsed") === "1";
  } catch (e) { /* localStorage unavailable — default to expanded */ }

  if (wasCollapsed) {
    layout.classList.add("sidebar-collapsed");
    document.body.classList.add("sidebar-is-collapsed");
    if (toggleBtn) toggleBtn.classList.add("active-collapsed");
  }
}

function toggleBrowserFullscreen() {
  const icon = document.getElementById("fullscreenIcon");
  const label = document.getElementById("fullscreenLabel");

  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().then(() => {
      if (icon) icon.className = "ph ph-arrows-in";
      if (label) label.textContent = "Exit Fullscreen";
      showToast("🖥️ Browser Full-Screen Mode Activated (Press Esc to Exit)", "success");
    }).catch(err => {
      showToast(`Fullscreen request error: ${err.message}`, "warning");
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().then(() => {
        if (icon) icon.className = "ph ph-arrows-out";
        if (label) label.textContent = "Fullscreen";
        showToast("Exited Full-Screen Mode", "info");
      });
    }
  }
}

// Sync button if user exits fullscreen with ESC or F11
document.addEventListener("fullscreenchange", () => {
  const icon = document.getElementById("fullscreenIcon");
  const label = document.getElementById("fullscreenLabel");
  if (document.fullscreenElement) {
    if (icon) icon.className = "ph ph-arrows-in";
    if (label) label.textContent = "Exit Fullscreen";
  } else {
    if (icon) icon.className = "ph ph-arrows-out";
    if (label) label.textContent = "Fullscreen";
  }
});

// Keyboard shortcut: Ctrl + B toggles sidebar
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey && e.key.toLowerCase() === "b") || (e.altKey && e.key.toLowerCase() === "s")) {
    e.preventDefault();
    toggleSidebar();
  }
});

// ============================================================================
// 4. TOP-LEVEL PAGE NAVIGATION & WORKFLOW STEPPER ENGINE
// ============================================================================

/**
 * Switch to Page 1: Submission Intake Hub
 */
/**
 * Hides every top-level .page-view container and clears sidebar-nav active
 * state. Called at the start of each showXPage() function so new pages
 * added later don't need every older function patched individually.
 */
/**
 * Renders the breadcrumb trail (§10.11): Module › Section › Page › Record.
 * Max 4 visible levels — beyond that, middle segments collapse into a
 * "…" with a title tooltip showing the full path. Rightmost crumb is
 * always the current page (non-clickable); all others are links.
 * items: [{ label, onClick? }]
 */
function setBreadcrumb(items) {
  const list = document.getElementById("breadcrumbList");
  if (!list || !items || items.length === 0) return;

  let displayItems = items;
  if (items.length > 4) {
    const collapsedLabels = items.slice(1, -1).map(i => i.label).join(" › ");
    displayItems = [items[0], { label: "…", ellipsis: true, fullPath: collapsedLabels }, items[items.length - 1]];
  }

  const html = displayItems.map((item, idx) => {
    const isLast = idx === displayItems.length - 1;
    const sep = idx > 0 ? `<li class="breadcrumb-sep" aria-hidden="true">›</li>` : "";

    if (item.ellipsis) {
      return `${sep}<li class="breadcrumb-item breadcrumb-ellipsis" title="${item.fullPath}">…</li>`;
    }
    if (isLast) {
      return `${sep}<li class="breadcrumb-item breadcrumb-current" aria-current="page">${item.label}</li>`;
    }
    const clickAttr = item.onClick ? ` onclick="${item.onClick}"` : "";
    return `${sep}<li class="breadcrumb-item breadcrumb-link" tabindex="0"${clickAttr}>${item.label}</li>`;
  }).join("");

  list.innerHTML = html;
}

/**
 * Typed-Confirmation Modal (§10.16) — for destructive/irreversible actions.
 * Requires the user to type an exact confirmation string (e.g. the record
 * ID) before the Confirm button activates. Call openTypedConfirmModal with
 * a config; onConfirm runs only after the typed text matches exactly.
 */
let pendingTypedConfirm = null;

function openTypedConfirmModal({ title, message, expectedText, onConfirm }) {
  const modal = document.getElementById("typedConfirmModal");
  const titleEl = document.getElementById("typedConfirmTitle");
  const messageEl = document.getElementById("typedConfirmMessage");
  const expectedEl = document.getElementById("typedConfirmExpectedText");
  const inputEl = document.getElementById("typedConfirmInput");
  const submitBtn = document.getElementById("typedConfirmSubmitBtn");
  if (!modal) return;

  pendingTypedConfirm = { expectedText, onConfirm };

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (expectedEl) expectedEl.textContent = expectedText;
  if (inputEl) inputEl.value = "";
  if (submitBtn) submitBtn.disabled = true;

  modal.style.display = "flex";
  if (inputEl) setTimeout(() => inputEl.focus(), 50);
}

function closeTypedConfirmModal() {
  const modal = document.getElementById("typedConfirmModal");
  if (modal) modal.style.display = "none";
  pendingTypedConfirm = null;
}

function validateTypedConfirmInput() {
  const inputEl = document.getElementById("typedConfirmInput");
  const submitBtn = document.getElementById("typedConfirmSubmitBtn");
  if (!inputEl || !submitBtn || !pendingTypedConfirm) return;
  submitBtn.disabled = inputEl.value !== pendingTypedConfirm.expectedText;
}

function submitTypedConfirm() {
  if (!pendingTypedConfirm) return;
  const { onConfirm } = pendingTypedConfirm;
  closeTypedConfirmModal();
  if (typeof onConfirm === "function") onConfirm();
}

function confirmArchiveSubmission(subId) {
  openTypedConfirmModal({
    title: "Archive Submission",
    message: `Archiving ${subId} moves it out of the active pipeline. It will remain fully accessible in Archived Records for audit purposes, but this action cannot be undone from here.`,
    expectedText: subId,
    onConfirm: () => archiveSubmission(subId)
  });
}

function confirmDeleteSubmissionDocument(subId, docIdx) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  const docName = sub && sub.docs && sub.docs[docIdx] ? sub.docs[docIdx].name : "this document";
  openTypedConfirmModal({
    title: "Delete Document",
    message: `Deleting "${docName}" from ${subId} cannot be undone.`,
    expectedText: subId,
    onConfirm: () => deleteSubmissionDocument(subId, docIdx)
  });
}

/**
 * Browser tab title, per platform framework §23:
 * "[Page Name] — [Module Name] | FUT"
 * Truncates the page-name segment (never the "| FUT" suffix) to keep
 * the whole title under the 60-character guidance.
 */
function setPageTitle(pageName) {
  const moduleName = "Underwriting Workflow";
  const suffix = " | FUT";
  const sep = " — ";
  const maxTotal = 60;
  const fixedLen = sep.length + moduleName.length + suffix.length;
  let name = pageName;
  const budget = maxTotal - fixedLen;
  if (budget > 3 && name.length > budget) {
    name = name.slice(0, budget - 1).trimEnd() + "…";
  }
  document.title = name + sep + moduleName + suffix;

  // Breadcrumb — was static ("Submission Intake" no matter where you were),
  // which made it actively misleading rather than just unhelpful. This is
  // the one function every navigation path (every show*Page(), every
  // goToWorkflowStep()) already calls, so wiring the breadcrumb here makes
  // it accurate everywhere with no new call sites and no change to any
  // existing click handler.
  const breadcrumbCurrentEl = document.getElementById("breadcrumbCurrent");
  if (breadcrumbCurrentEl) breadcrumbCurrentEl.textContent = pageName;

  // "Case Workflow" context segment — appears only when pageName is one of
  // the 7 in-case workflow step titles (Doc Ingestion, Clearance, etc.),
  // making it visually obvious this is a different navigation level than a
  // sidebar module page (Decline Center, Archive, etc.). Click jumps back
  // to Submission Intake, same as leaving the workflow any other way.
  const isWorkflowStep = typeof WORKFLOW_STEPS !== "undefined" && WORKFLOW_STEPS.some(s => s.title === pageName);
  const contextEl = document.getElementById("breadcrumbContext");
  const contextSepEl = document.getElementById("breadcrumbContextSep");
  if (contextEl) contextEl.classList.toggle("u-hidden", !isWorkflowStep);
  if (contextSepEl) contextSepEl.classList.toggle("u-hidden", !isWorkflowStep);
}

function resetAllTopLevelPages() {
  document.querySelectorAll(".page-view").forEach(p => {
    p.style.display = "none";
    p.classList.remove("active");
  });
  document.querySelectorAll(".sidebar-nav-item").forEach(n => n.classList.remove("active"));
}

function showIntakePage() {
  currentPage = "intake";
  currentScreenId = "screen-1";
  resetAllTopLevelPages();
  setPageTitle("Submission Intake & Ingestion Queue");
  setBreadcrumb([{ label: "FUT" }, { label: "Submission Intake" }]);

  // 1. Toggle Page Views
  const intakePage = document.getElementById("intakePageView");
  const workflowPage = document.getElementById("workflowPageView");
  const archivePage = document.getElementById("archivePageView");

  if (intakePage) { intakePage.style.display = "block"; intakePage.classList.add("active"); }
  if (workflowPage) { workflowPage.style.display = "none"; workflowPage.classList.remove("active"); }
  if (archivePage) { archivePage.style.display = "none"; archivePage.classList.remove("active"); }

  // 2. Ensure Screen 1 is active
  document.querySelectorAll(".screen-view").forEach(s => s.classList.remove("active"));
  const s1 = document.getElementById("screen-1");
  if (s1) s1.classList.add("active");

  // 3. Update Nav Items & Header Workflow Button
  const navIntake = document.getElementById("navItemIntake");
  const navArchive = document.getElementById("navItemArchive");
  const btnHw = document.getElementById("headerCaseWorkflowBtn");

  if (navIntake) navIntake.classList.add("active");
  if (navArchive) navArchive.classList.remove("active");
  if (btnHw) btnHw.classList.remove("active");

  // 4. Hide Bottom Workflow Footer on Intake Page
  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  // 5. Update Active Account Widget in Sidebar & Header
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (sub) updateActiveCaseHeaders(sub);

  // 6. Render this persona's own dashboard — not the same view for everyone.
  renderRoleDashboard();

  // 6. Refresh Table
  renderSubmissionsTable();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Switch to Page 2: Active Case Workflow (7 Steps)
 */
function showWorkflowPage(stepNum = 1) {
  currentPage = "workflow";
  resetAllTopLevelPages();
  const stepObj = WORKFLOW_STEPS.find(s => s.step === stepNum);
  setPageTitle(stepObj ? stepObj.title : `Step ${stepNum}`);
  setBreadcrumb([
    { label: "FUT", onClick: "showIntakePage()" },
    { label: "Active Case Workflow", onClick: `goToWorkflowStep(1)` },
    { label: stepObj ? stepObj.title : `Step ${stepNum}` }
  ]);

  // 1. Toggle Page Views
  const intakePage = document.getElementById("intakePageView");
  const workflowPage = document.getElementById("workflowPageView");
  const archivePage = document.getElementById("archivePageView");

  if (intakePage) { intakePage.style.display = "none"; intakePage.classList.remove("active"); }
  if (workflowPage) { workflowPage.style.display = "block"; workflowPage.classList.add("active"); }
  if (archivePage) { archivePage.style.display = "none"; archivePage.classList.remove("active"); }

  // 2. Update Nav Items & Header Workflow Button
  const navIntake = document.getElementById("navItemIntake");
  const navArchive = document.getElementById("navItemArchive");
  const btnHw = document.getElementById("headerCaseWorkflowBtn");

  if (navIntake) navIntake.classList.remove("active");
  if (navArchive) navArchive.classList.remove("active");
  if (btnHw) btnHw.classList.add("active");

  // 3. Navigate to requested workflow step
  goToWorkflowStep(stepNum);
}

/**
 * Switch to Page 3: Dedicated Decline Archive & Audit Logs
 */
// ============================================================================
