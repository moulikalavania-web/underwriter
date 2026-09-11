// AUDIT LOG ARCHIVAL POLICY (Manager/Admin configurable retention rules)
// ============================================================================
let ARCHIVAL_POLICY = {
  triggerStatus: "retired",      // 'declined' | 'retired' | 'bound_closed'
  retentionDays: 90,
  requireApproval: true,
  lastUpdatedBy: "David Chen (Senior Underwriter)",
  lastUpdatedAt: "2026-08-20 09:15",
  changeLog: [
    { by: "David Chen (Senior Underwriter)", at: "2026-08-20 09:15", summary: "Initial policy: Retired records archived after 90 days, manager approval required." }
  ]
};

const ARCHIVAL_TRIGGER_LABELS = {
  declined: "Declined / Terminated",
  retired: "Retired",
  bound_closed: "Bound & Closed"
};

function renderArchivalPolicySummary() {
  const el = document.getElementById("archivalPolicySummaryText");
  if (el) {
    el.textContent = `Current policy: records reaching "${ARCHIVAL_TRIGGER_LABELS[ARCHIVAL_POLICY.triggerStatus]}" status are archived after ${ARCHIVAL_POLICY.retentionDays} day(s). ${ARCHIVAL_POLICY.requireApproval ? "Manager approval is required before archiving." : "Archiving happens automatically without manual approval."} Last updated by ${ARCHIVAL_POLICY.lastUpdatedBy} on ${ARCHIVAL_POLICY.lastUpdatedAt}.`;
  }
  const triggerSelect = document.getElementById("archivalPolicyTriggerStatus");
  const daysInput = document.getElementById("archivalPolicyRetentionDays");
  const approvalCheckbox = document.getElementById("archivalPolicyRequireApproval");
  if (triggerSelect) triggerSelect.value = ARCHIVAL_POLICY.triggerStatus;
  if (daysInput) daysInput.value = ARCHIVAL_POLICY.retentionDays;
  if (approvalCheckbox) approvalCheckbox.checked = ARCHIVAL_POLICY.requireApproval;

  const logEl = document.getElementById("archivalPolicyAuditTrail");
  if (logEl) {
    const rows = ARCHIVAL_POLICY.changeLog.slice().reverse().slice(0, 5).map(c =>
      `<div>› ${c.at} — <strong>${c.by}</strong>: ${c.summary}</div>`
    ).join("");
    logEl.innerHTML = `<strong>Policy Change History:</strong>${rows}`;
  }
}

function saveArchivalPolicy() {
  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;

  if (!hasPermission("archival", "edit")) {
    denyPermission("archival", "edit");
    return;
  }

  const triggerStatus = document.getElementById("archivalPolicyTriggerStatus").value;
  const retentionDays = parseInt(document.getElementById("archivalPolicyRetentionDays").value, 10) || 90;
  const requireApproval = document.getElementById("archivalPolicyRequireApproval").checked;

  ARCHIVAL_POLICY.triggerStatus = triggerStatus;
  ARCHIVAL_POLICY.retentionDays = retentionDays;
  ARCHIVAL_POLICY.requireApproval = requireApproval;
  ARCHIVAL_POLICY.lastUpdatedBy = `${roleConfig.name} (${roleConfig.title})`;
  ARCHIVAL_POLICY.lastUpdatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  ARCHIVAL_POLICY.changeLog.push({
    by: ARCHIVAL_POLICY.lastUpdatedBy,
    at: ARCHIVAL_POLICY.lastUpdatedAt,
    summary: `Set to archive "${ARCHIVAL_TRIGGER_LABELS[triggerStatus]}" records after ${retentionDays} day(s); approval ${requireApproval ? "required" : "not required"}.`
  });

  renderArchivalPolicySummary();
  renderArchivalEligibilityQueue();
  showToast(`✅ Archival policy saved by ${roleConfig.name}. Archived records remain fully accessible for audit.`, "success");
}

// ============================================================================
// DYNAMIC ARCHIVAL ELIGIBILITY — computed live from SUBMISSIONS_DATASET
// against the currently configured ARCHIVAL_POLICY, not a static list.
// ============================================================================
function computeArchivalEligibility() {
  const nowMs = Date.now();
  const eligibleNow = [];
  const notYetEligible = [];
  const alreadyArchived = [];

  SUBMISSIONS_DATASET.forEach(sub => {
    if (sub.archived) {
      alreadyArchived.push(sub);
      return;
    }
    if (!sub.lifecycleStatus || sub.lifecycleStatus !== ARCHIVAL_POLICY.triggerStatus) return;

    const daysSinceStatus = (nowMs - (sub.lifecycleStatusAt || nowMs)) / (24 * 60 * 60 * 1000);
    if (daysSinceStatus >= ARCHIVAL_POLICY.retentionDays) {
      eligibleNow.push({ sub, daysSinceStatus: Math.floor(daysSinceStatus) });
    } else {
      notYetEligible.push({ sub, daysSinceStatus: Math.floor(daysSinceStatus), daysRemaining: Math.ceil(ARCHIVAL_POLICY.retentionDays - daysSinceStatus) });
    }
  });

  return { eligibleNow, notYetEligible, alreadyArchived };
}

function renderArchivalEligibilityQueue() {
  const container = document.getElementById("archivalEligibilityQueue");
  const notice = document.getElementById("archivalEligibilityAuthNotice");
  if (!container) return;

  const isAdmin = currentUserRole === "admin";
  if (notice) notice.style.display = isAdmin ? "none" : "flex";
  if (!isAdmin) {
    container.innerHTML = "";
    return;
  }

  const { eligibleNow, notYetEligible, alreadyArchived } = computeArchivalEligibility();
  const triggerLabel = ARCHIVAL_TRIGGER_LABELS[ARCHIVAL_POLICY.triggerStatus];

  const eligibleRows = eligibleNow.map(({ sub, daysSinceStatus }) => `
    <tr>
      <td><code class="font-mono">${sub.id}</code></td>
      <td>${sub.insured}</td>
      <td>${sub.lobName}</td>
      <td><span class="badge badge-warning">${triggerLabel}</span></td>
      <td>${daysSinceStatus} days ago</td>
      <td>
        <button class="btn btn-xs btn-primary" onclick="confirmArchiveSubmission('${sub.id}')">
          <i class="ph ph-archive"></i> ${ARCHIVAL_POLICY.requireApproval ? "Approve & Archive" : "Archive Now"}
        </button>
      </td>
    </tr>`).join("");

  const pendingRows = notYetEligible.map(({ sub, daysSinceStatus, daysRemaining }) => `
    <tr>
      <td><code class="font-mono">${sub.id}</code></td>
      <td>${sub.insured}</td>
      <td>${sub.lobName}</td>
      <td><span class="badge badge-info">${triggerLabel}</span></td>
      <td>${daysSinceStatus} days ago</td>
      <td><span class="text-xs text-muted">${daysRemaining} day(s) until eligible</span></td>
    </tr>`).join("");

  const archivedRows = alreadyArchived.map(sub => `
    <tr>
      <td><code class="font-mono">${sub.id}</code></td>
      <td>${sub.insured}</td>
      <td>${sub.lobName}</td>
      <td>${new Date(sub.archivedAt).toISOString().slice(0, 10)}</td>
      <td>${sub.archivedBy || "—"}</td>
      <td><button class="btn btn-xs btn-outline" onclick="openCaseAtCurrentStep('${sub.id}')"><i class="ph ph-eye"></i> View</button></td>
    </tr>`).join("");

  container.innerHTML = `
    <div class="card mt-3">
      <div class="card-header">
        <h3><i class="ph ph-tray"></i> Eligible for Archival Now</h3>
        <span class="badge ${eligibleNow.length > 0 ? 'badge-warning' : 'badge-success'}">${eligibleNow.length} record(s)</span>
      </div>
      <div class="card-body p-0">
        ${eligibleNow.length === 0
          ? `<div class="p-3 text-muted text-sm">No records currently meet the policy ("${triggerLabel}" + ${ARCHIVAL_POLICY.retentionDays}+ days). This list recomputes automatically whenever the policy above is changed.</div>`
          : `<table class="data-table">
              <thead><tr><th>Submission</th><th>Customer</th><th>LOB</th><th>Status</th><th>Age</th><th>Action</th></tr></thead>
              <tbody>${eligibleRows}</tbody>
            </table>`}
      </div>
    </div>

    ${notYetEligible.length > 0 ? `
    <div class="card mt-3">
      <div class="card-header">
        <h3><i class="ph ph-hourglass-medium"></i> Approaching Eligibility</h3>
        <span class="badge badge-info">${notYetEligible.length} record(s)</span>
      </div>
      <div class="card-body p-0">
        <table class="data-table">
          <thead><tr><th>Submission</th><th>Customer</th><th>LOB</th><th>Status</th><th>Age</th><th>Time Remaining</th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table>
      </div>
    </div>` : ''}

    <div class="card mt-3">
      <div class="card-header">
        <h3><i class="ph ph-archive"></i> Archived Records</h3>
        <span class="badge badge-success">${alreadyArchived.length} record(s) — always accessible</span>
      </div>
      <div class="card-body p-0">
        ${alreadyArchived.length === 0
          ? `<div class="p-3 text-muted text-sm">No records archived yet.</div>`
          : `<table class="data-table">
              <thead><tr><th>Submission</th><th>Customer</th><th>LOB</th><th>Archived On</th><th>Archived By</th><th></th></tr></thead>
              <tbody>${archivedRows}</tbody>
            </table>`}
      </div>
    </div>
  `;
}

function archiveSubmission(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;

  if (!hasPermission("archival", "archive")) {
    denyPermission("archival", "archive");
    return;
  }
  if (ARCHIVAL_POLICY.requireApproval && !hasPermission("archival", "approve") && !hasPermission("archival", "edit")) {
    showToast("⛔ This policy requires manager approval to archive. Switch to an authorized persona to approve.", "danger");
    return;
  }

  sub.archived = true;
  sub.archivedAt = Date.now();
  sub.archivedBy = `${roleConfig.name} (${roleConfig.title})`;

  const nowStamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: sub.currentStep || 7,
    decision: "archived",
    by: sub.archivedBy,
    at: nowStamp,
    notes: `Archived under retention policy "${ARCHIVAL_TRIGGER_LABELS[ARCHIVAL_POLICY.triggerStatus]}" (${ARCHIVAL_POLICY.retentionDays} day retention). Record remains fully accessible.`
  });

  showToast(`✅ ${sub.id} archived by ${roleConfig.name}. Record remains fully accessible in the Archived Records list.`, "success");
  renderArchivalEligibilityQueue();
  refreshAuditLogIfVisible();
}

function showArchivePage() {
  currentPage = "archive";
  currentScreenId = "screen-9";
  resetAllTopLevelPages();
  setPageTitle("Archive & Audit");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Archive & Audit" }]);

  const archivePage = document.getElementById("archivePageView");
  if (archivePage) { archivePage.style.display = "block"; archivePage.classList.add("active"); }

  document.querySelectorAll(".screen-view").forEach(s => s.classList.remove("active"));
  const s9 = document.getElementById("screen-9");
  if (s9) s9.classList.add("active");

  const navArchive = document.getElementById("navItemArchive");
  if (navArchive) navArchive.classList.add("active");

  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  // Archive module (policy config, eligibility queue, archived records) is
  // restricted to the Admin persona only.
  const isAdmin = currentUserRole === "admin";
  const contentEl = document.getElementById("archivePageContent");
  const authNoticeEl = document.getElementById("archivePageAuthNotice");
  if (contentEl) contentEl.style.display = isAdmin ? "block" : "none";
  if (authNoticeEl) authNoticeEl.style.display = isAdmin ? "none" : "flex";

  if (isAdmin) {
    renderArchivalPolicySummary();
    renderArchivalEligibilityQueue();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Switch to the Decline Center — submission exit paths and the
 * declined/terminated submissions audit log. Visible to every role
 * (unlike Archive, which is Admin-only).
 */
function showDeclinePage() {
  currentPage = "decline";
  resetAllTopLevelPages();
  setPageTitle("Decline Center");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Decline Center" }]);

  const declinePage = document.getElementById("declinePageView");
  if (declinePage) { declinePage.style.display = "block"; declinePage.classList.add("active"); }

  const navDecline = document.getElementById("navItemDecline");
  if (navDecline) navDecline.classList.add("active");

  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  renderDeclineCenter();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Switch to Page 4: Quote Versioning, Revision Ledger & Actuarial Diff
 */
function showQuoteVersionsPage() {
  currentPage = "quote-versions";
  resetAllTopLevelPages();
  setPageTitle("Quote Versioning");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Quote Versioning" }]);

  // 1. Toggle Page Views
  const intakePage = document.getElementById("intakePageView");
  const workflowPage = document.getElementById("workflowPageView");
  const archivePage = document.getElementById("archivePageView");
  const versionsPage = document.getElementById("quoteVersionsPageView");

  if (intakePage) { intakePage.style.display = "none"; intakePage.classList.remove("active"); }
  if (workflowPage) { workflowPage.style.display = "none"; workflowPage.classList.remove("active"); }
  if (archivePage) { archivePage.style.display = "none"; archivePage.classList.remove("active"); }
  if (versionsPage) { versionsPage.style.display = "block"; versionsPage.classList.add("active"); }

  // 2. Update Nav Items & Header Workflow Button
  const navIntake = document.getElementById("navItemIntake");
  const navArchive = document.getElementById("navItemArchive");
  const navVersions = document.getElementById("navItemQuoteVersions");
  const btnHw = document.getElementById("headerCaseWorkflowBtn");

  if (navIntake) navIntake.classList.remove("active");
  if (navArchive) navArchive.classList.remove("active");
  if (navVersions) navVersions.classList.add("active");
  if (btnHw) btnHw.classList.remove("active");

  // 3. Hide Bottom Workflow Footer
  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  // 4. Render Table
  renderQuoteVersionsLedger();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================================
// FEATURE #1: TEAM PROCESS TRACKING (Admin/Manager visibility)
// ============================================================================

function showTeamActivityPage() {
  currentPage = "team-activity";
  resetAllTopLevelPages();
  setPageTitle("Team Activity");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Admin" }, { label: "Team Activity" }]);

  const page = document.getElementById("teamActivityPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }

  const nav = document.getElementById("navItemTeamActivity");
  if (nav) nav.classList.add("active");

  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  const notice = document.getElementById("teamActivityAuthNotice");
  const boardEl = document.getElementById("teamActivityBoard");
  const chartEl = document.getElementById("teamActivityMonthlyChart");
  const isAdmin = currentUserRole === "admin";
  if (notice) notice.style.display = isAdmin ? "none" : "flex";
  if (boardEl) boardEl.style.display = isAdmin ? "block" : "none";
  if (chartEl) chartEl.style.display = isAdmin ? "block" : "none";

  if (!isAdmin) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  renderTeamActivityMonthlyChart();
  renderTeamActivityBoard();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function computeSubmissionActivityFlags(sub) {
  const stepObj = WORKFLOW_STEPS.find(s => s.step === (sub.currentStep || 1));
  const completed = (sub.completedSteps || []).length;
  const totalSteps = WORKFLOW_STEPS.length;
  const ageMs = Date.now() - (sub.receivedTimestamp || Date.now());
  const ageHours = ageMs / (1000 * 60 * 60);

  // Delayed heuristic: P1/P2 priority cases sitting for a long time without
  // progressing past the first couple of steps are flagged as at-risk.
  let isDelayed = false;
  let delayReason = "";
  if ((sub.priority === "P1" || sub.priority === "P2") && ageHours > 24 && (sub.currentStep || 1) <= 2) {
    isDelayed = true;
    delayReason = `${sub.priority} priority, received ${Math.round(ageHours)}h ago, still at "${stepObj ? stepObj.shortTitle : 'Intake'}"`;
  } else if (sub.exposureVal > sub.authorityLimit && (sub.currentStep || 1) < 5) {
    isDelayed = true;
    delayReason = `Exceeds underwriter authority — awaiting escalation/referral before Step 5`;
  }

  return {
    stepTitle: stepObj ? stepObj.title : "Doc Ingestion",
    completed,
    totalSteps,
    isDelayed,
    delayReason
  };
}

// ============================================================================
// MONTHLY PIPELINE OUTCOME CHART — Quote Generated vs Issued vs
// Declined/Missing-Info (submissions that never reached quote generation)
// ============================================================================
/**
 * Re-renders the Team Activity chart + board only if that page is currently
 * open, so the graphs always map live data without unnecessary work when
 * the admin isn't looking at them. Call this after any action that could
 * change a submission's pipeline-outcome category or workload.
 */
function refreshTeamActivityIfVisible() {
  if (currentPage === "team-activity" && currentUserRole === "admin") {
    renderTeamActivityMonthlyChart();
    renderTeamActivityBoard();
  }
}

// ============================================================================
// DECLINE CENTER — real decline action, wired from the Underwriting
// Workbench, that feeds the Decline Center's audit log dynamically.
// ============================================================================
const DECLINE_TRIGGER_BADGE = {
  "Duplicate FEIN": "badge-warning",
  "Appetite Knockout": "badge-danger",
  "Senior UW Decline": "badge-danger",
  "Other": "badge-warning"
};

// Seeded with the 3 original historical demo entries; new declines are
// unshifted onto the front (newest first) as they happen live.
let DECLINE_LOG = [
  { subId: "SUB-48199-OH", insured: "Midwest Hazmat Haulers LLC", lob: "Trucking", triggerPoint: "Appetite Knockout", reason: "Class 1 Explosives transport exceeds carrier filing guidelines", at: "2026-08-25 14:10" },
  { subId: "SUB-48182-PX", insured: "Meridian Distribution Group", lob: "Commercial Property", triggerPoint: "Duplicate FEIN", reason: "Conflicting submission already locked by Aon Risk Services", at: "2026-08-25 11:35" },
  { subId: "SUB-48110-CA", insured: "Pacific Chemical Solutions", lob: "GL Casualty", triggerPoint: "Senior UW Decline", reason: "Prior 3-year loss ratio exceeds 140% with open environmental claim", at: "2026-08-24 16:50" }
];

// Roles authorized to fix a duplicate-FEIN decline: Senior Underwriter and
// above (Senior UW, CUO, Binding Ops, Admin) — Junior/Assistant/Auditor
// cannot resolve this.
const FEIN_FIX_AUTHORIZED_ROLES = ["senior_uw", "senior", "binder", "admin"];

/**
 * Generates a new unique FEIN for a submission using the platform's
 * established convention: a shared parent-account base prefix, with the
 * last 2 characters of the submission ID concatenated on — the same
 * approach used to originally de-duplicate the Apex Freight Holdings
 * account's FEINs (e.g. ...TX / ...PX / ...OH).
 */
function generateUniqueFeinForSubmission(sub) {
  const basePrefix = "81-440000";
  const suffix = sub.id.slice(-2).toUpperCase();
  return basePrefix + suffix;
}

/**
 * Reflects the submission's actual duplicate-FEIN clearance state on
 * Step 6 (FEIN Clearance & Duplicate Detection) — this previously never
 * changed regardless of what happened to the submission.
 */
function renderFeinClearanceStatus(sub) {
  const badge = document.getElementById("feinStatusBadge");
  const activeCount = document.getElementById("activeSubCount");
  const clearanceAction = document.getElementById("clearanceActionResult");
  if (!badge || !activeCount || !clearanceAction) return;

  const wasFixed = DECLINE_LOG.some(e => e.subId === sub.id && e.triggerPoint === "Duplicate FEIN" && e.fixed);
  const isDuplicateDeclined = sub.lifecycleStatus === "declined" && sub.declineTriggerPoint === "Duplicate FEIN" && !wasFixed;

  if (isDuplicateDeclined) {
    badge.className = "badge badge-danger";
    badge.innerHTML = `<i class="ph ph-warning"></i> Duplicate FEIN Detected`;
    activeCount.className = "val font-bold text-danger";
    activeCount.textContent = "1 Conflicting (Broker of Record Lock)";
    clearanceAction.className = "val badge badge-danger";
    clearanceAction.textContent = "Failed Clearance → Routed to Decline Center";
  } else if (wasFixed) {
    badge.className = "badge badge-success";
    badge.innerHTML = `<i class="ph ph-check-circle"></i> Unique Entity Cleared (Resolved)`;
    activeCount.className = "val font-bold text-success";
    activeCount.textContent = `0 Conflicting (FEIN reassigned: ${sub.fein})`;
    clearanceAction.className = "val badge badge-success";
    clearanceAction.textContent = "Passed Clearance → Proceed to Appetite Evaluation";
  } else {
    badge.className = "badge badge-success";
    badge.innerHTML = `<i class="ph ph-check-circle"></i> Unique Entity Cleared`;
    activeCount.className = "val font-bold text-success";
    activeCount.textContent = "0 Conflicting (Unique Registered Entity)";
    clearanceAction.className = "val badge badge-success";
    clearanceAction.textContent = "Passed Clearance → Proceed to Appetite Evaluation";
  }
}

function renderDeclineCenter() {
  const tbody = document.getElementById("exitAuditTable");
  if (!tbody) return;

  const canFix = FEIN_FIX_AUTHORIZED_ROLES.includes(currentUserRole);

  if (DECLINE_LOG.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted text-sm" style="padding:20px;">No declined or terminated submissions logged yet.</td></tr>`;
  } else {
    tbody.innerHTML = DECLINE_LOG.map((entry, idx) => {
      let actionCell = `<span class="text-xs text-muted">—</span>`;
      if (entry.triggerPoint === "Duplicate FEIN") {
        if (entry.fixed) {
          actionCell = `<span class="badge badge-success" title="New FEIN: ${entry.newFein}"><i class="ph ph-check"></i> Fixed</span>`;
        } else if (canFix) {
          actionCell = `<button class="btn btn-xs btn-primary" onclick="fixDuplicateFein(${idx})"><i class="ph ph-wrench"></i> Fix</button>`;
        } else {
          actionCell = `<span class="text-xs text-muted" title="Senior Underwriter or higher authority required">🔒 Restricted — Senior UW+ required</span>`;
        }
      }
      return `
      <tr>
        <td><code>${entry.subId}</code></td>
        <td>${entry.insured}</td>
        <td>${entry.lob}</td>
        <td><span class="badge ${DECLINE_TRIGGER_BADGE[entry.triggerPoint] || 'badge-danger'}">${entry.triggerPoint}</span></td>
        <td>${entry.reason}</td>
        <td>${entry.at}</td>
        <td>${actionCell}</td>
      </tr>`;
    }).join("");
  }

  // Live per-category counts on the 3 exit-path cards, plus overall total —
  // computed from DECLINE_LOG, not hardcoded.
  const countByTrigger = { "Duplicate FEIN": 0, "Appetite Knockout": 0, "Senior UW Decline": 0 };
  DECLINE_LOG.forEach(e => {
    if (countByTrigger.hasOwnProperty(e.triggerPoint)) countByTrigger[e.triggerPoint]++;
  });

  const dupEl = document.getElementById("exitCountDuplicateFein");
  const appEl = document.getElementById("exitCountAppetiteKnockout");
  const senEl = document.getElementById("exitCountSeniorDecline");
  const totalEl = document.getElementById("declineTotalBadge");

  if (dupEl) dupEl.textContent = `${countByTrigger["Duplicate FEIN"]} Record${countByTrigger["Duplicate FEIN"] !== 1 ? 's' : ''}`;
  if (appEl) appEl.textContent = `${countByTrigger["Appetite Knockout"]} Record${countByTrigger["Appetite Knockout"] !== 1 ? 's' : ''}`;
  if (senEl) senEl.textContent = `${countByTrigger["Senior UW Decline"]} Record${countByTrigger["Senior UW Decline"] !== 1 ? 's' : ''}`;
  if (totalEl) totalEl.textContent = `${DECLINE_LOG.length} Record${DECLINE_LOG.length !== 1 ? 's' : ''} Logged`;
}

function fixDuplicateFein(logIndex) {
  if (!FEIN_FIX_AUTHORIZED_ROLES.includes(currentUserRole)) {
    showToast("⛔ Only Senior Underwriter or higher authority can fix a duplicate FEIN.", "danger");
    return;
  }

  const entry = DECLINE_LOG[logIndex];
  if (!entry || entry.triggerPoint !== "Duplicate FEIN" || entry.fixed) return;

  const sub = SUBMISSIONS_DATASET.find(s => s.id === entry.subId);
  if (!sub) {
    showToast("⛔ Could not locate the submission record to fix.", "danger");
    return;
  }

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  const newFein = generateUniqueFeinForSubmission(sub);
  const nowStamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  sub.fein = newFein;

  entry.fixed = true;
  entry.newFein = newFein;
  entry.fixedBy = `${roleConfig.name} (${roleConfig.title})`;
  entry.fixedAt = nowStamp;

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: sub.currentStep || 2,
    decision: "fein_fixed",
    by: entry.fixedBy,
    at: nowStamp,
    notes: `Duplicate FEIN resolved. New FEIN assigned: ${newFein}.`
  });

  showToast(`✅ New FEIN generated for ${sub.id}: ${newFein}. Duplicate resolved by ${roleConfig.name}. Updated everywhere this submission is referenced.`, "success");

  renderDeclineCenter();
  renderSubmissionsTable();

  // Refresh every other live view of this submission's FEIN immediately,
  // instead of waiting for the next navigation/re-render to pick it up.
  updateActiveCaseHeaders(sub);
  const feinNumEl = document.getElementById("checkFeinNumber");
  if (feinNumEl) feinNumEl.textContent = sub.fein;
  renderFeinClearanceStatus(sub);

  // If the underwriter is viewing this submission's Step 6 workbench right
  // now, do a full refresh of that screen's data-bound fields too.
  if (currentPage === "workflow" && activeSubmissionId === sub.id) {
    renderAllDownstreamScreens(sub);
  }
}

let declineSubmissionTargetId = null;

function openDeclineSubmissionModal(subId) {
  if (!hasPermission("workflow", "approve")) {
    denyPermission("workflow", "approve");
    return;
  }

  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  declineSubmissionTargetId = subId;

  document.getElementById("declineSubmissionIdLabel").innerHTML = `<strong>Submission:</strong> <code>${sub.id}</code> — ${sub.insured || "N/A"}`;
  document.getElementById("declineTriggerPoint").value = "Appetite Knockout";
  document.getElementById("declineReasonText").value = "";
  document.getElementById("declineConfirmExpected").textContent = subId;
  document.getElementById("declineConfirmInput").value = "";
  document.getElementById("declineSubmitBtn").disabled = true;

  const modal = document.getElementById("declineSubmissionModal");
  if (modal) modal.style.display = "flex";
}

function closeDeclineSubmissionModal() {
  const modal = document.getElementById("declineSubmissionModal");
  if (modal) modal.style.display = "none";
  declineSubmissionTargetId = null;
}

function validateDeclineConfirmInput() {
  const input = document.getElementById("declineConfirmInput");
  const btn = document.getElementById("declineSubmitBtn");
  if (!input || !btn || !declineSubmissionTargetId) return;
  btn.disabled = input.value !== declineSubmissionTargetId;
}

function submitDeclineSubmission() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === declineSubmissionTargetId);
  if (!sub) return;

  if (!hasPermission("workflow", "approve")) {
    denyPermission("workflow", "approve");
    return;
  }

  const triggerPoint = document.getElementById("declineTriggerPoint").value;
  const reason = document.getElementById("declineReasonText").value.trim();
  if (!reason) {
    showToast("⛔ A reason is required to decline a submission.", "danger");
    return;
  }

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  const nowStamp = new Date().toISOString().slice(0, 16).replace("T", " ");

  // Mark the submission itself as declined (this also feeds the Team
  // Activity "Declined / Missing Info" chart bucket automatically, since
  // categorizeSubmissionOutcome() checks lifecycleStatus === "declined").
  sub.lifecycleStatus = "declined";
  sub.lifecycleStatusAt = Date.now();
  sub.declinedBy = `${roleConfig.name} (${roleConfig.title})`;
  sub.declineReason = reason;
  sub.declineTriggerPoint = triggerPoint;

  if (triggerPoint === "Duplicate FEIN") {
    // Duplicate FEIN declines route directly to Senior Underwriter review
    // — not left as a dead decline, since a corrected FEIN needs senior
    // sign-off before the submission can proceed.
    sub.statusText = "Senior Referral";
    sub.statusBadge = "badge-warning";
    sub.isReferral = true;
  } else {
    sub.statusText = "Declined";
    sub.statusBadge = "badge-danger";
  }

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: sub.currentStep || 4,
    decision: "declined",
    by: sub.declinedBy,
    at: nowStamp,
    notes: triggerPoint === "Duplicate FEIN"
      ? `Declined (Duplicate FEIN): ${reason}. Referred directly to Senior Underwriter for resolution.`
      : `Declined (${triggerPoint}): ${reason}`
  });

  DECLINE_LOG.unshift({
    subId: sub.id,
    insured: sub.insured,
    lob: sub.lobName,
    triggerPoint,
    reason,
    at: nowStamp,
    apiSourced: !!sub.apiSourced
  });

  showToast(
    triggerPoint === "Duplicate FEIN"
      ? `⛔ ${sub.id} declined by ${roleConfig.name} and referred directly to Senior Underwriter for resolution.`
      : `⛔ ${sub.id} declined by ${roleConfig.name}. Logged in Decline Center.`,
    "danger"
  );
  closeDeclineSubmissionModal();

  renderDeclineCenter();
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();

  // If the underwriter was mid-workflow on this submission, return them to
  // the Intake queue since the case is now terminal.
  if (currentPage === "workflow" && activeSubmissionId === sub.id) {
    showIntakePage();
  }
}

function categorizeSubmissionOutcome(sub) {
  const finalStep = WORKFLOW_STEPS.length; // step 7: Formal Quote & Policy Binding
  const hasOutstandingMissing = getOutstandingMissingCount(sub) > 0;
  const isDeclined = sub.lifecycleStatus === "declined";

  if (sub.completedSteps && sub.completedSteps.includes(finalStep)) {
    return "issued"; // Fully completed the Quote & Bind step = policy issued
  }
  if (sub.currentStep >= finalStep) {
    return "quoteGenerated"; // Reached the final step, quote formed, not yet bound
  }
  if (isDeclined || hasOutstandingMissing) {
    return "declinedOrMissing"; // Initiated but blocked before reaching quote generation
  }
  return "inProgress"; // Still moving through the pipeline, not yet categorized
}

function renderTeamActivityMonthlyChart() {
  const container = document.getElementById("teamActivityMonthlyChart");
  if (!container) return;

  const now = new Date();
  const isThisMonth = (ts) => {
    if (!ts) return false;
    const d = new Date(ts);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  let scope = SUBMISSIONS_DATASET.filter(s => isThisMonth(s.receivedTimestamp));
  let usedFallback = false;
  if (scope.length === 0) {
    scope = SUBMISSIONS_DATASET;
    usedFallback = true;
  }

  const counts = { quoteGenerated: 0, issued: 0, declinedOrMissing: 0, inProgress: 0 };
  scope.forEach(sub => { counts[categorizeSubmissionOutcome(sub)]++; });

  const total = scope.length || 1;
  const bars = [
    { key: "quoteGenerated", label: "Quote Generated", value: counts.quoteGenerated, color: "#0369A1", icon: "ph-file-text" },
    { key: "issued", label: "Policy Issued", value: counts.issued, color: "#15803D", icon: "ph-check-circle" },
    { key: "declinedOrMissing", label: "Declined / Missing Info", value: counts.declinedOrMissing, color: "#DC2626", icon: "ph-warning" },
    { key: "inProgress", label: "Still In Progress", value: counts.inProgress, color: "#B45309", icon: "ph-hourglass-medium" }
  ];
  const maxVal = Math.max(1, ...bars.map(b => b.value));

  const chartWidth = 640, chartHeight = 190, barGap = 40, barWidth = 90, baseY = 150;
  const svgBars = bars.map((b, i) => {
    const x = 40 + i * (barWidth + barGap);
    const h = Math.round((b.value / maxVal) * 112);
    const y = baseY - h;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="6" fill="${b.color}" opacity="0.92"></rect>
      <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="17" font-weight="700" fill="var(--color-ink)">${b.value}</text>
    `;
  }).join("");

  // ---- Team-wide KPI summary strip (computed live, same source data) ----
  const byUW = {};
  SUBMISSIONS_DATASET.forEach(sub => {
    const uw = sub.underwriter || "Unassigned";
    if (!byUW[uw]) byUW[uw] = [];
    byUW[uw].push(sub);
  });
  const teamCount = Object.keys(byUW).length;
  const activeCount = SUBMISSIONS_DATASET.filter(s => (s.currentStep || 1) < WORKFLOW_STEPS.length).length;
  const completedCount = SUBMISSIONS_DATASET.filter(s => (s.currentStep || 1) >= WORKFLOW_STEPS.length).length;
  const delayedCount = SUBMISSIONS_DATASET.filter(s => computeSubmissionActivityFlags(s).isDelayed).length;

  const kpiStrip = `
    <div class="team-kpi-strip">
      <div class="team-kpi-card">
        <div class="team-kpi-icon" style="background:#EFF6FF; color:#0369A1;"><i class="ph ph-users-three"></i></div>
        <div><div class="team-kpi-value">${teamCount}</div><div class="team-kpi-label">Team Members</div></div>
      </div>
      <div class="team-kpi-card">
        <div class="team-kpi-icon" style="background:#FFF7ED; color:#EA6A08;"><i class="ph ph-clock-counter-clockwise"></i></div>
        <div><div class="team-kpi-value">${activeCount}</div><div class="team-kpi-label">Active Submissions</div></div>
      </div>
      <div class="team-kpi-card">
        <div class="team-kpi-icon" style="background:#F0FDF4; color:#15803D;"><i class="ph ph-check-circle"></i></div>
        <div><div class="team-kpi-value">${completedCount}</div><div class="team-kpi-label">Completed</div></div>
      </div>
      <div class="team-kpi-card ${delayedCount > 0 ? 'team-kpi-alert' : ''}">
        <div class="team-kpi-icon" style="background:#FEF2F2; color:#DC2626;"><i class="ph ph-warning"></i></div>
        <div><div class="team-kpi-value">${delayedCount}</div><div class="team-kpi-label">Delayed / At Risk</div></div>
      </div>
    </div>`;

  container.innerHTML = `
    ${kpiStrip}
    <div class="card mb-3">
      <div class="card-header">
        <h3><i class="ph ph-chart-bar"></i> Pipeline Outcomes — ${usedFallback ? "All Submissions" : now.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
        <span class="badge badge-info">${total} submission${total !== 1 ? 's' : ''}</span>
      </div>
      <div class="card-body">
        ${usedFallback ? `<div class="alert alert-info mb-2 u-fs-12"><i class="ph ph-info"></i> No submissions were received in the current calendar month in this demo dataset — showing all-time totals instead.</div>` : ''}
        <svg viewBox="0 0 ${chartWidth} ${chartHeight}" style="width:100%; max-width:680px; height:auto;">
          <line x1="20" y1="${baseY}" x2="${chartWidth - 20}" y2="${baseY}" stroke="var(--color-border)" stroke-width="1"></line>
          ${svgBars}
        </svg>
        <div class="team-chart-legend">
          ${bars.map(b => `<div class="team-chart-legend-item"><span class="legend-dot" style="background:${b.color};"></span> ${b.label} <strong>(${b.value})</strong></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderTeamActivityBoard() {
  const container = document.getElementById("teamActivityBoard");
  if (!container) return;

  // Group all submissions by underwriter (team member)
  const byUW = {};
  SUBMISSIONS_DATASET.forEach(sub => {
    const uw = sub.underwriter || "Unassigned";
    if (!byUW[uw]) byUW[uw] = [];
    byUW[uw].push(sub);
  });

  // Sort team members: anyone with a delayed case surfaces first, since
  // that's what a manager needs to see immediately — then alphabetical.
  const uwNames = Object.keys(byUW).sort((a, b) => {
    const aDelayed = byUW[a].some(s => computeSubmissionActivityFlags(s).isDelayed);
    const bDelayed = byUW[b].some(s => computeSubmissionActivityFlags(s).isDelayed);
    if (aDelayed !== bDelayed) return aDelayed ? -1 : 1;
    return a.localeCompare(b);
  });

  const cards = uwNames.map(uw => {
    const subs = byUW[uw];
    const active = subs.filter(s => (s.currentStep || 1) < WORKFLOW_STEPS.length);
    const completed = subs.filter(s => (s.currentStep || 1) >= WORKFLOW_STEPS.length);
    const flagged = subs.map(s => ({ sub: s, flags: computeSubmissionActivityFlags(s) })).filter(x => x.flags.isDelayed);
    const avatarInitials = uw.split(" ").filter(w => w[0] === w[0].toUpperCase()).slice(0, 2).map(w => w[0]).join("") || uw.slice(0, 2).toUpperCase();

    const rows = subs.map(s => {
      const flags = computeSubmissionActivityFlags(s);
      const pct = Math.round((flags.completed / flags.totalSteps) * 100);
      return `
        <tr>
          <td><code class="font-mono">${s.id}</code></td>
          <td>${s.insured || "N/A"}</td>
          <td>${flags.stepTitle} <span class="text-xs text-muted">(Step ${s.currentStep || 1}/${flags.totalSteps})</span></td>
          <td><span class="badge ${s.statusBadge || 'badge-primary'}">${s.statusText || 'In Progress'}</span></td>
          <td>
            <div class="team-mini-progress" title="${flags.completed}/${flags.totalSteps} steps complete">
              <div class="team-mini-progress-fill" style="width:${pct}%;"></div>
            </div>
          </td>
          <td>${flags.isDelayed
              ? `<span class="badge badge-danger" title="${flags.delayReason}"><i class="ph ph-warning"></i> Delayed</span>`
              : `<span class="badge badge-success"><i class="ph ph-check"></i> On Track</span>`}</td>
        </tr>`;
    }).join("");

    return `
      <div class="card mb-3 team-uw-card ${flagged.length > 0 ? 'team-uw-card-alert' : ''}">
        <div class="card-header">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="team-uw-avatar">${avatarInitials}</div>
            <h3 style="margin:0;">${uw}</h3>
          </div>
          <div style="display:flex; gap:8px;">
            <span class="badge badge-info">${active.length} Active</span>
            <span class="badge badge-success">${completed.length} Completed</span>
            ${flagged.length > 0 ? `<span class="badge badge-danger">${flagged.length} Delayed</span>` : ""}
          </div>
        </div>
        <div class="card-body p-0">
          <table class="data-table">
            <thead>
              <tr><th>Submission</th><th>Customer</th><th>Current Stage</th><th>Status</th><th>Progress</th><th>Health</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = cards || `<div class="text-muted text-sm">No submissions found.</div>`;
}

// ============================================================================
