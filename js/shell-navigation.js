// 2. INITIALIZATION & SETUP
// ============================================================================
// ============================================================================
// PERSISTENCE — persistAppState() still writes a snapshot to localStorage
// after most actions (harmless), but it is never read back: the
// DOMContentLoaded handler below wipes this key on every page load. A
// refresh must always come back fully blank, never resurrect a previous
// session's ingested data.
// ============================================================================
const VERIDEX_STORAGE_KEY = "veridex_app_state_v1";

function persistAppState() {
  try {
    const state = {
      SUBMISSIONS_DATASET: SUBMISSIONS_DATASET,
      QUOTE_VERSIONS_DATASET: QUOTE_VERSIONS_DATASET,
      DECLINE_LOG: DECLINE_LOG,
      LOB_CATALOG: LOB_CATALOG,
      ALL_LOB_KEYS: ALL_LOB_KEYS,
      ACTIVE_INSURANCE_PRODUCT: window.ACTIVE_INSURANCE_PRODUCT || null,
      activeSubmissionId: activeSubmissionId,
      DISCRETIONARY_MAX_CREDIT_PCT: DISCRETIONARY_MAX_CREDIT_PCT,
      DISCRETIONARY_MAX_DEBIT_PCT: DISCRETIONARY_MAX_DEBIT_PCT,
      DISCRETIONARY_TAX_RATE_PCT: DISCRETIONARY_TAX_RATE_PCT,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(VERIDEX_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to persist app state to localStorage:", e);
  }
}

function resetPrototypeData() {
  try { localStorage.removeItem(VERIDEX_STORAGE_KEY); } catch (e) {}
  showToast("🔄 Saved session cleared. Reloading blank...", "info");
  setTimeout(() => window.location.reload(), 600);
}
window.resetPrototypeData = resetPrototypeData;

document.addEventListener("DOMContentLoaded", () => {
  // A page refresh must start fully blank — saved state is never restored
  // across a reload, it's wiped instead, so the app always comes back to
  // "nothing ingested yet" rather than resurrecting the last session's data.
  try { localStorage.removeItem(VERIDEX_STORAGE_KEY); } catch (e) { /* localStorage unavailable — ignore */ }

  setupNavigationEvents();
  restoreSidebarCollapsedState();
  setupLOBSelector();
  setupDiagramModal();
  renderSubmissionsTable();
  selectSubmission(activeSubmissionId, false);
  showIntakePage();
});

function setupNavigationEvents() {
  // Note: the sidebar toggle button already has an inline onclick="toggleSidebar()"
  // in the HTML. Do NOT also addEventListener here — doing both fires the
  // toggle twice per click (collapse then immediately re-expand), which
  // makes the button appear completely non-functional.
}

function changeUserRole(role) {
  currentUserRole = role;
  const roleSelect = document.getElementById("userRoleSelect");
  if (roleSelect && roleSelect.value !== role) roleSelect.value = role;

  const roleConfig = USER_ROLES_CONFIG[role] || USER_ROLES_CONFIG.junior;

  // Update sidebar user persona
  const uAvatar = document.getElementById("sidebarUserAvatar");
  const uName = document.getElementById("sidebarUserName");
  const uTitle = document.getElementById("sidebarUserRoleTitle");
  if (uAvatar) uAvatar.textContent = roleConfig.icon;
  if (uName) uName.textContent = roleConfig.name;
  if (uTitle) uTitle.textContent = `${roleConfig.title.split(' ')[0]} UW (${roleConfig.limitText.split(' ')[0]})`;

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
  showToast(`${roleConfig.icon} ${roleConfig.name} — ${roleConfig.title.split(' (')[0]}`, "info");

  // Refresh Table highlights
  renderSubmissionsTable();
  renderRoleDashboard();

  // Refresh Authority Screen, Appetite Rules table, and Vehicles Workbench if sub is loaded —
  // all are permission-gated (appetiteRules override, base rate override, authority sign-off)
  // and must reflect the newly active persona immediately, even if the
  // user is already sitting on that screen when they switch roles.
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (sub) {
    renderAuthorityScreen(sub);
    renderAppetiteRules(sub.appetiteRules);
    renderUnderwritingWorkbench(sub);
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
  if (pLevel === "P1") {
    sub.priorityScore = 98;
    sub.slaText = "4h Fast-Track SLA";
    sub.slaCountdown = "3h 50m remaining";
    sub.priorityReason = "Manual Underwriter Escalation (P1 Highest Priority SLA Activated)";
  } else if (pLevel === "P2") {
    sub.priorityScore = 85;
    sub.slaText = "24h Standard SLA";
    sub.slaCountdown = "18h 30m remaining";
    sub.priorityReason = "Standard High Priority SLA";
  } else {
    sub.priorityScore = 70;
    sub.slaText = "48h FIFO SLA";
    sub.slaCountdown = "36h remaining";
    sub.priorityReason = "Standard FIFO Queue Position";
  }

  // Update Screen 4 Triage Card
  const bBadge = document.getElementById("triagePriorityBadge");
  const bSla = document.getElementById("assignedSlaTarget");
  const bCount = document.getElementById("triageSlaCountdown");
  if (bBadge) {
    bBadge.className = `badge ${pLevel === 'P1' ? 'badge-danger' : (pLevel === 'P2' ? 'badge-warning' : 'badge-info')}`;
    bBadge.textContent = `Priority: ${pLevel} - ${pLevel === 'P1' ? 'Highest' : (pLevel === 'P2' ? 'High' : 'FIFO')} (Score: ${sub.priorityScore}/100)`;
  }
  if (bSla) bSla.textContent = sub.slaText;
  if (bCount) bCount.textContent = sub.slaCountdown;

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
 * "[Page Name] — [Module Name] | VeriDex"
 * Truncates the page-name segment (never the "| VeriDex" suffix) to keep
 * the whole title under the 60-character guidance.
 */
function setPageTitle(pageName) {
  const moduleName = "Underwriting Workflow";
  const suffix = " | VeriDex";
  const sep = " — ";
  const maxTotal = 60;
  const fixedLen = sep.length + moduleName.length + suffix.length;
  let name = pageName;
  const budget = maxTotal - fixedLen;
  if (budget > 3 && name.length > budget) {
    name = name.slice(0, budget - 1).trimEnd() + "…";
  }
  document.title = name + sep + moduleName + suffix;
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
  setBreadcrumb([{ label: "VeriDex" }, { label: "Submission Intake" }]);

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
  const navVersions = document.getElementById("navItemQuoteVersions");
  const btnHw = document.getElementById("headerCaseWorkflowBtn");

  if (navIntake) navIntake.classList.add("active");
  if (navArchive) navArchive.classList.remove("active");
  if (navVersions) navVersions.classList.remove("active");
  if (btnHw) btnHw.classList.remove("active");

  const versionsPage = document.getElementById("quoteVersionsPageView");
  if (versionsPage) { versionsPage.style.display = "none"; versionsPage.classList.remove("active"); }

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
    { label: "VeriDex", onClick: "showIntakePage()" },
    { label: "Active Case Workflow", onClick: `goToWorkflowStep(1)` },
    { label: stepObj ? stepObj.title : `Step ${stepNum}` }
  ]);

  // 1. Toggle Page Views
  const intakePage = document.getElementById("intakePageView");
  const workflowPage = document.getElementById("workflowPageView");
  const archivePage = document.getElementById("archivePageView");
  const versionsPage = document.getElementById("quoteVersionsPageView");

  if (intakePage) { intakePage.style.display = "none"; intakePage.classList.remove("active"); }
  if (workflowPage) { workflowPage.style.display = "block"; workflowPage.classList.add("active"); }
  if (archivePage) { archivePage.style.display = "none"; archivePage.classList.remove("active"); }
  if (versionsPage) { versionsPage.style.display = "none"; versionsPage.classList.remove("active"); }

  // 2. Update Nav Items & Header Workflow Button
  const navIntake = document.getElementById("navItemIntake");
  const navArchive = document.getElementById("navItemArchive");
  const navVersions = document.getElementById("navItemQuoteVersions");
  const btnHw = document.getElementById("headerCaseWorkflowBtn");

  if (navIntake) navIntake.classList.remove("active");
  if (navArchive) navArchive.classList.remove("active");
  if (navVersions) navVersions.classList.remove("active");
  if (btnHw) btnHw.classList.add("active");

  // 3. Navigate to requested workflow step
  goToWorkflowStep(stepNum);
}

/**
 * Switch to Page 3: Dedicated Decline Archive & Audit Logs
 */
// ============================================================================
