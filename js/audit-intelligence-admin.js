// FEATURE #2: AUDIT LOG (Compliance — Consolidated Underwriting Action Trail)
// ============================================================================
// Every gated underwriter action across the platform writes to one of a
// handful of per-submission arrays (sub.decisionLog, sub.premiumAdjustments,
// sub.submissionVersions) plus the global DECLINE_LOG. Those were previously
// captured but never surfaced anywhere — this page walks all of them, tags
// each entry with a normalized action type, and renders one merged,
// filterable, chronological trail with the acting underwriter's name, role
// and recorded rationale.
const AUDIT_ACTION_META = {
  approved:              { label: "Stage Approved",                icon: "ph-check-circle",             badge: "badge-success", outcome: "outcome-approve" },
  rejected:              { label: "Stage Rejected / Held for Rework", icon: "ph-arrow-counter-clockwise", badge: "badge-warning", outcome: "outcome-refer" },
  declined:              { label: "Submission Declined",            icon: "ph-prohibit",                 badge: "badge-danger",  outcome: "outcome-decline" },
  discretionary_credit:  { label: "Discretionary Credit Applied",   icon: "ph-trend-down",                badge: "badge-primary", outcome: "outcome-pricing" },
  discretionary_debit:   { label: "Discretionary Debit Applied",    icon: "ph-trend-up",                  badge: "badge-primary", outcome: "outcome-pricing" },
  premium_adjustment:    { label: "Premium Adjusted",               icon: "ph-currency-circle-dollar",    badge: "badge-primary", outcome: "outcome-pricing" },
  premium_override:      { label: "Premium Override (Above Authority)", icon: "ph-warning-circle",        badge: "badge-primary", outcome: "outcome-pricing" },
  bound_and_synced:      { label: "Bound & Synced to PAS",          icon: "ph-link",                      badge: "badge-info",    outcome: "outcome-bind" },
  quote_issued:          { label: "Quote Issued",                   icon: "ph-paper-plane-tilt",          badge: "badge-info",    outcome: "outcome-bind" },
  fein_fixed:            { label: "Duplicate FEIN Resolved",        icon: "ph-wrench",                    badge: "badge-warning", outcome: "outcome-refer" },
  archived:              { label: "Submission Archived",            icon: "ph-archive",                   badge: "badge-light",   outcome: "outcome-comm" },
  rfi_sent:              { label: "RFI Sent to Submitter",          icon: "ph-envelope",                  badge: "badge-light",   outcome: "outcome-comm" },
  subjectivity_added:    { label: "Binding Condition Added",        icon: "ph-list-plus",                 badge: "badge-light",   outcome: "outcome-comm" },
  submission_updated:    { label: "Submission Data Updated",        icon: "ph-note-pencil",               badge: "badge-light",   outcome: "outcome-comm" }
};

function auditActionMeta(type) {
  return AUDIT_ACTION_META[type] || {
    label: (type || "Action Recorded").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    icon: "ph-info",
    badge: "badge-light",
    outcome: "outcome-comm"
  };
}

/** Walks every submission's action arrays + the global decline log and
 *  returns one flat, normalized, newest-first list of audit entries. */
function collectAuditLogEntries() {
  const entries = [];

  SUBMISSIONS_DATASET.forEach(sub => {
    const insuredLabel = sub.insured || sub.channelName || sub.accountName || "N/A";

    (sub.decisionLog || []).forEach(d => {
      entries.push({
        type: d.decision,
        at: d.at,
        by: d.by,
        subId: sub.id,
        insured: insuredLabel,
        note: d.notes || null
      });
    });

    (sub.premiumAdjustments || []).forEach(p => {
      entries.push({
        type: p.isOverride ? "premium_override" : "premium_adjustment",
        at: p.at,
        by: p.by,
        subId: sub.id,
        insured: insuredLabel,
        note: `$${(p.oldPremium || 0).toLocaleString()} → $${(p.newPremium || 0).toLocaleString()} (Trust/Risk Score ${p.trustScoreAtAdjustment}/100). ${p.reason}`
      });
    });

    (sub.submissionVersions || []).forEach(v => {
      const parts = [];
      if (v.changes && v.changes.length) parts.push(`${v.changes.length} field(s) updated`);
      if (v.resolvedDocs && v.resolvedDocs.length) parts.push(`${v.resolvedDocs.length} outstanding document(s) resolved`);
      if (v.resolvedDataFields && v.resolvedDataFields.length) parts.push(`${v.resolvedDataFields.length} outstanding data field(s) resolved`);
      if (v.newMissingDocs && v.newMissingDocs.length) parts.push(`${v.newMissingDocs.length} new missing document(s) flagged`);
      if (v.newMissingDataFields && v.newMissingDataFields.length) parts.push(`${v.newMissingDataFields.length} new missing data field(s) flagged`);
      const thread = sub.communicationThread || [];
      const sourceMsg = typeof v.threadRef === "number" && thread[v.threadRef] ? thread[v.threadRef].message : null;
      entries.push({
        type: "submission_updated",
        at: v.at,
        by: v.by,
        subId: sub.id,
        insured: insuredLabel,
        note: `${parts.join(", ") || "Communication logged"} (Version ${v.version}, ${v.updateType || "update"}).${sourceMsg ? ` Source: "${sourceMsg}"` : ""}`
      });
    });
  });

  // Historical decline records that predate/aren't mirrored in a
  // submission's own decisionLog (legacy seed rows in DECLINE_LOG).
  DECLINE_LOG.forEach(d => {
    const mirroredInDecisionLog = SUBMISSIONS_DATASET.some(s =>
      s.id === d.subId && (s.decisionLog || []).some(dl => dl.decision === "declined" && dl.at === d.at)
    );
    if (!mirroredInDecisionLog) {
      entries.push({
        type: "declined",
        at: d.at,
        by: "— (Historical / Pre-Migration Record)",
        subId: d.subId,
        insured: d.insured,
        note: `Declined (${d.triggerPoint}): ${d.reason}${d.fixed ? ` — Duplicate FEIN later resolved by ${d.fixedBy} (new FEIN ${d.newFein}) on ${d.fixedAt}.` : ""}`
      });
    }
  });

  entries.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  return entries;
}

function populateAuditLogFilterOptions() {
  const entries = collectAuditLogEntries();

  const actionSelect = document.getElementById("auditLogActionFilter");
  if (actionSelect) {
    const prevVal = actionSelect.value || "all";
    const types = Array.from(new Set(entries.map(e => e.type))).sort();
    actionSelect.innerHTML = `<option value="all">All Action Types</option>` +
      types.map(t => `<option value="${t}">${auditActionMeta(t).label}</option>`).join("");
    actionSelect.value = types.includes(prevVal) ? prevVal : "all";
  }

  const actorSelect = document.getElementById("auditLogActorFilter");
  if (actorSelect) {
    const prevVal = actorSelect.value || "all";
    const actors = Array.from(new Set(entries.map(e => e.by).filter(Boolean))).sort();
    actorSelect.innerHTML = `<option value="all">All Underwriters</option>` +
      actors.map(a => `<option value="${a}">${a}</option>`).join("");
    actorSelect.value = actors.includes(prevVal) ? prevVal : "all";
  }
}

function resetAuditLogFilters() {
  const searchInput = document.getElementById("auditLogSearchInput");
  const actionSelect = document.getElementById("auditLogActionFilter");
  const actorSelect = document.getElementById("auditLogActorFilter");
  if (searchInput) searchInput.value = "";
  if (actionSelect) actionSelect.value = "all";
  if (actorSelect) actorSelect.value = "all";
  renderAuditLogFeed();
}

function renderAuditLogFeed() {
  const feedEl = document.getElementById("auditLogFeed");
  const summaryEl = document.getElementById("auditLogSummary");
  if (!feedEl || !hasPermission("auditLog", "view")) return;

  let entries = collectAuditLogEntries();

  if (summaryEl) {
    const declineCount = entries.filter(e => e.type === "declined").length;
    const pricingCount = entries.filter(e => ["discretionary_credit", "discretionary_debit", "premium_adjustment", "premium_override"].includes(e.type)).length;
    const bindCount = entries.filter(e => ["bound_and_synced", "quote_issued"].includes(e.type)).length;
    const activeUnderwriters = new Set(entries.map(e => e.by).filter(Boolean)).size;
    summaryEl.innerHTML = `
      <div class="metrics-summary-bar">
        <div class="metric-box">
          <span class="lbl"><i class="ph ph-list-checks"></i> Total Recorded Actions</span>
          <strong class="val" id="auditLogTotalCount">${entries.length}</strong>
        </div>
        <div class="metric-box">
          <span class="lbl"><i class="ph ph-prohibit text-danger"></i> Declines</span>
          <strong class="val text-danger">${declineCount}</strong>
        </div>
        <div class="metric-box">
          <span class="lbl"><i class="ph ph-currency-circle-dollar text-primary"></i> Pricing Actions</span>
          <strong class="val text-primary">${pricingCount}</strong>
        </div>
        <div class="metric-box">
          <span class="lbl"><i class="ph ph-link text-success"></i> Binds &amp; Issuances</span>
          <strong class="val text-success">${bindCount}</strong>
        </div>
        <div class="metric-box">
          <span class="lbl"><i class="ph ph-users text-warning"></i> Underwriters Active</span>
          <strong class="val text-warning">${activeUnderwriters}</strong>
        </div>
      </div>
    `;
  }

  const searchInput = document.getElementById("auditLogSearchInput");
  const actionSelect = document.getElementById("auditLogActionFilter");
  const actorSelect = document.getElementById("auditLogActorFilter");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const actionType = actionSelect ? actionSelect.value : "all";
  const actor = actorSelect ? actorSelect.value : "all";

  if (actionType !== "all") entries = entries.filter(e => e.type === actionType);
  if (actor !== "all") entries = entries.filter(e => e.by === actor);
  if (searchTerm) {
    entries = entries.filter(e =>
      (e.subId || "").toLowerCase().includes(searchTerm) ||
      (e.insured || "").toLowerCase().includes(searchTerm) ||
      (e.by || "").toLowerCase().includes(searchTerm) ||
      (e.note || "").toLowerCase().includes(searchTerm)
    );
  }

  if (!entries.length) {
    feedEl.innerHTML = `<div class="audit-log-empty"><i class="ph ph-magnifying-glass" style="font-size:26px; display:block; margin-bottom:8px;"></i>No audit entries match the current filters.</div>`;
    return;
  }

  feedEl.innerHTML = `<div class="audit-log-feed">` + entries.map(e => {
    const meta = auditActionMeta(e.type);
    return `
      <div class="audit-log-item ${meta.outcome}">
        <div class="audit-log-item-head">
          <div class="audit-log-item-actor">
            <span class="icon"><i class="ph ${meta.icon}"></i></span>
            <strong>${e.by || "Unknown"}</strong>
          </div>
          <div class="audit-log-item-meta">
            <span class="badge ${meta.badge}">${meta.label}</span>
            <span><i class="ph ph-clock"></i> ${e.at || "—"}</span>
          </div>
        </div>
        <p class="audit-log-item-sub">
          <i class="ph ph-hash"></i> <code>${e.subId}</code> <span>&mdash;</span> <span>${e.insured}</span>
        </p>
        ${e.note ? `<div class="audit-log-item-note"><i class="ph ph-quotes"></i> ${e.note}</div>` : ""}
      </div>`;
  }).join("") + `</div>`;
}

/** Re-renders the Audit Log feed only if that page is currently open —
 *  called after every gated underwriter action so the trail stays live. */
function refreshAuditLogIfVisible() {
  if (currentPage === "audit-log" && hasPermission("auditLog", "view")) {
    populateAuditLogFilterOptions();
    renderAuditLogFeed();
  }
}

function showAuditLogPage() {
  currentPage = "audit-log";
  resetAllTopLevelPages();
  setPageTitle("Audit Log");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Compliance" }, { label: "Audit Log" }]);

  const page = document.getElementById("auditLogPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }

  const nav = document.getElementById("navItemAuditLog");
  if (nav) nav.classList.add("active");

  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  const notice = document.getElementById("auditLogAuthNotice");
  const contentEl = document.getElementById("auditLogPageContent");
  const canView = hasPermission("auditLog", "view");
  if (notice) notice.style.display = canView ? "none" : "flex";
  if (contentEl) contentEl.style.display = canView ? "block" : "none";

  if (canView) {
    populateAuditLogFilterOptions();
    renderAuditLogFeed();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================================
// FEATURE #3: QUOTE INTELLIGENCE (Renewal Comparison + Multiple Quote Comparison)
// ============================================================================
let quoteIntelActiveTab = "renewal";
let selectedCompareIds = [];

function showQuoteIntelligencePage() {
  currentPage = "quote-intel";
  resetAllTopLevelPages();
  setPageTitle("Quote Intelligence");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Quote Intelligence" }]);

  const page = document.getElementById("quoteIntelligencePageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }

  const nav = document.getElementById("navItemQuoteIntel");
  if (nav) nav.classList.add("active");

  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  switchQuoteIntelTab(quoteIntelActiveTab);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================================
// USER MASTER — Admin-only dashboard for team roster + permission matrix
// ============================================================================
let userMasterSelectedResource = "documents";
let editingTeamUserId = null; // null = Add User modal is in "add" mode; otherwise editing this TEAM_USERS.id

// ============================================================================
// UNIFIED ACCOUNT VIEW — cross-LOB customer record (Requirement: unified
// account/submission record across lines). Groups all submissions that
// belong to the same parent account (accountName) OR share the same
// insured name, across every line of business, into one account record.
// ============================================================================
function getUnifiedAccountRecords(searchTerm) {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return [];

  return SUBMISSIONS_DATASET.filter(s => {
    const account = (s.accountName || "").toLowerCase();
    const insured = (s.insured || "").toLowerCase();
    return account.includes(term) || insured.includes(term);
  });
}

function showUnifiedAccountPage() {
  currentPage = "unified-account";
  resetAllTopLevelPages();
  setPageTitle("Unified Account View");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Unified Account View" }]);

  const page = document.getElementById("unifiedAccountPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }

  const nav = document.getElementById("navItemUnifiedAccount");
  if (nav) nav.classList.add("active");

  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  const notice = document.getElementById("unifiedAccountAuthNotice");
  const searchArea = document.getElementById("unifiedAccountSearchArea");
  const isAuthorized = hasPermission("unifiedAccount", "view");
  if (notice) notice.style.display = isAuthorized ? "none" : "flex";
  if (searchArea) searchArea.style.display = isAuthorized ? "block" : "none";

  if (isAuthorized) renderUnifiedAccountView();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderUnifiedAccountView() {
  if (!hasPermission("unifiedAccount", "view")) return;

  const resultsEl = document.getElementById("unifiedAccountResults");
  if (!resultsEl) return;

  const term = document.getElementById("unifiedAccountSearchInput")?.value || "";
  if (!term.trim()) {
    resultsEl.innerHTML = `<div class="text-muted text-sm">Type any account or customer name and click "Show" — if that account has more than one line of business on file, its unified cross-LOB record will appear here.</div>`;
    return;
  }

  const records = getUnifiedAccountRecords(term);
  if (records.length === 0) {
    resultsEl.innerHTML = `<div class="text-muted text-sm">No account or customer found matching "${term}".</div>`;
    return;
  }

  // Aggregate account-level summary
  const totalPremium = records.reduce((sum, s) => sum + getSubmissionPremium(s), 0);
  const totalExposure = records.reduce((sum, s) => sum + (s.exposureVal || 0), 0);
  const distinctLOBs = Array.from(new Set(records.map(s => s.lobName)));
  const avgTrustScore = Math.round(records.reduce((sum, s) => sum + getSubmissionTrustScore(s), 0) / records.length);
  const accountLabel = records[0].accountName || records[0].insured;

  if (distinctLOBs.length <= 1) {
    resultsEl.innerHTML = `
      <div class="alert alert-info u-fs-12-5">
        <i class="ph ph-info"></i> <strong>${accountLabel}</strong> only has <strong>one</strong> line of business on file (${distinctLOBs[0]}). Unified Account View is intended for accounts with multiple lines — there's nothing to unify here yet.
      </div>`;
    return;
  }

  const rows = records.map(s => `
    <tr>
      <td><code class="font-mono">${s.id}</code></td>
      <td><strong>${s.insured}</strong>${s.accountName ? `<br><span class="text-xs text-muted">Account: ${s.accountName}</span>` : ''}</td>
      <td><span class="badge badge-primary">${s.lobName}</span></td>
      <td>${s.underwriter || "Unassigned"}</td>
      <td class="font-mono">$${getSubmissionPremium(s).toLocaleString()}</td>
      <td><span class="badge ${s.statusBadge || 'badge-primary'}">${s.statusText || ''}</span></td>
      <td>${s.receivedAt || ''}</td>
      <td><button class="btn btn-xs btn-outline" onclick="openCaseAtCurrentStep('${s.id}')"><i class="ph ph-eye"></i> View</button></td>
    </tr>`).join("");

  resultsEl.innerHTML = `
    <div class="card mb-3">
      <div class="card-header">
        <h3><i class="ph ph-buildings"></i> ${accountLabel} — Account Summary</h3>
        <span class="badge badge-info">${records.length} submission${records.length !== 1 ? 's' : ''} across ${distinctLOBs.length} line${distinctLOBs.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="card-body">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:14px; font-size:13px;">
          <div><span class="text-xs text-muted">Total Premium (All Lines)</span><br><strong class="font-mono" style="font-size:15px;">$${totalPremium.toLocaleString()}</strong></div>
          <div><span class="text-xs text-muted">Total Exposure</span><br><strong class="font-mono">$${totalExposure.toLocaleString()}</strong></div>
          <div><span class="text-xs text-muted">Lines of Business</span><br><strong>${distinctLOBs.join(", ")}</strong></div>
          <div><span class="text-xs text-muted">Average Trust/Risk Score</span><br><strong>${avgTrustScore}/100</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3><i class="ph ph-list-checks"></i> Submissions Across All Lines</h3></div>
      <div class="card-body p-0">
        <table class="data-table">
          <thead><tr><th>Submission</th><th>Named Insured</th><th>Line of Business</th><th>Underwriter</th><th>Premium</th><th>Status</th><th>Received</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================================
// INTEGRATING API FROM PRODUCT — Standalone product REST API JSON payload viewer
// Demonstrates live data ingestion from standalone product endpoints into VeriDex.
// ============================================================================












function showUserMasterPage() {
  currentPage = "user-master";
  resetAllTopLevelPages();
  setPageTitle("User Master");
  setBreadcrumb([{ label: "VeriDex", onClick: "showIntakePage()" }, { label: "Admin" }, { label: "User Master" }]);

  const page = document.getElementById("userMasterPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }

  const nav = document.getElementById("navItemUserMaster");
  if (nav) nav.classList.add("active");

  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  const notice = document.getElementById("userMasterAuthNotice");
  const content = document.getElementById("userMasterContent");
  const isAdmin = currentUserRole === "admin";

  if (notice) notice.style.display = isAdmin ? "none" : "flex";
  if (content) content.style.display = isAdmin ? "block" : "none";

  if (!isAdmin) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  renderTeamRoster();
  populateResourceSelect();
  renderPermissionMatrixEditor();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================================
// TEAM ROSTER — flexible list of named users, each assigned one of the
// fixed role types (for permissions). Separate from USER_ROLES_CONFIG,
// which defines the persona archetypes used by the RBAC matrix and the
// role switcher; TEAM_USERS is the actual roster an admin manages.
// ============================================================================
// Default jurisdiction/LOB/coverage authority seeded per role archetype,
// reflecting the desks visible in the submissions dataset (e.g. Sarah
// Jenkins/David Chen on trucking, David Chen also on property, Elena
// Rostova on MPL). CUO, Binding Ops, Audit and Admin are cross-line/
// national since their function spans every desk.
const DEFAULT_ROLE_AUTHORITY = {
  assistant: { states: ALL_STATE_CODES.slice(), lobs: ALL_LOB_KEYS.slice(), coverages: [] },
  junior: { states: ["TX", "LA", "OK"], lobs: ["trucking"], coverages: getCoveragesForLOBs(["trucking"]) },
  senior_uw: { states: ["TX", "LA", "OK", "NM"], lobs: ["trucking", "property"], coverages: getCoveragesForLOBs(["trucking", "property"]) },
  senior: { states: ALL_STATE_CODES.slice(), lobs: ALL_LOB_KEYS.slice(), coverages: getCoveragesForLOBs(ALL_LOB_KEYS) },
  binder: { states: ALL_STATE_CODES.slice(), lobs: ALL_LOB_KEYS.slice(), coverages: getCoveragesForLOBs(ALL_LOB_KEYS) },
  auditor: { states: ALL_STATE_CODES.slice(), lobs: ALL_LOB_KEYS.slice(), coverages: getCoveragesForLOBs(ALL_LOB_KEYS) },
  admin: { states: ALL_STATE_CODES.slice(), lobs: ALL_LOB_KEYS.slice(), coverages: getCoveragesForLOBs(ALL_LOB_KEYS) }
};

let TEAM_USERS = Object.keys(USER_ROLES_CONFIG).map(roleKey => {
  const role = USER_ROLES_CONFIG[roleKey];
  const authority = DEFAULT_ROLE_AUTHORITY[roleKey] || { states: [], lobs: [], coverages: [] };
  return {
    id: `u_${roleKey}`,
    name: role.name,
    title: role.title,
    email: "",
    roleKey,
    limit: role.limit,
    description: role.description,
    states: authority.states.slice(),
    lobs: authority.lobs.slice(),
    coverages: authority.coverages.slice(),
    isDefault: true
  };
});

function renderTeamRoster() {
  const tbody = document.getElementById("userMasterRosterBody");
  const countEl = document.getElementById("userMasterRosterCount");
  if (!tbody) return;

  const rows = TEAM_USERS.map(user => {
    const role = USER_ROLES_CONFIG[user.roleKey] || USER_ROLES_CONFIG.junior;
    const activeCount = SUBMISSIONS_DATASET.filter(s => s.underwriter && s.underwriter.startsWith(user.name)).length;
    const states = user.states || [];
    const lobs = user.lobs || [];
    const statesSummary = states.length === 0 ? "No states"
      : states.length === ALL_STATE_CODES.length ? "All states"
      : `${states.length} state${states.length !== 1 ? 's' : ''}`;
    const lobsSummary = lobs.length === 0 ? "No lines" : `${lobs.length} line${lobs.length !== 1 ? 's' : ''} of business`;
    return `
      <tr>
        <td>${role.icon} <strong>${user.name}</strong>${user.email ? `<br><span class="text-xs text-muted">${user.email}</span>` : ''}</td>
        <td><span class="badge badge-primary">${user.title}</span></td>
        <td class="font-mono">$${user.limit.toLocaleString()}</td>
        <td>${activeCount}</td>
        <td>
          <button class="btn btn-xs btn-outline" onclick="viewUserAuthority('${user.id}')" title="View jurisdiction & LOB authority">
            <i class="ph ph-map-pin-area"></i> ${statesSummary} · ${lobsSummary}
          </button>
        </td>
        <td class="text-xs text-muted">${user.description || '—'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-xs btn-outline" onclick="editTeamUser('${user.id}')" title="Edit user" aria-label="Edit user"><i class="ph ph-pencil-simple"></i></button>
          ${user.isDefault ? '' : `<button class="btn btn-xs btn-outline" onclick="removeTeamUser('${user.id}')" title="Remove user" aria-label="Remove user"><i class="ph ph-trash"></i></button>`}
        </td>
      </tr>`;
  }).join("");

  tbody.innerHTML = rows;
  if (countEl) countEl.textContent = `${TEAM_USERS.length} users`;
}

/**
 * Read-only "Jurisdiction & LOB Authority" modal for a roster row — keeps
 * the Team Roster table compact while still surfacing the full state/LOB/
 * coverage breakdown. Editing happens via editTeamUser(), not here.
 */
function viewUserAuthority(userId) {
  const user = TEAM_USERS.find(u => u.id === userId);
  if (!user) return;
  const role = USER_ROLES_CONFIG[user.roleKey] || USER_ROLES_CONFIG.junior;
  const states = user.states || [];
  const lobs = user.lobs || [];
  const coverages = new Set(user.coverages || []);

  document.getElementById("userAuthorityModalTitle").textContent = `${role.icon} ${user.name} — Jurisdiction & LOB Authority`;

  const statesEl = document.getElementById("userAuthorityStates");
  if (states.length === 0) {
    statesEl.innerHTML = `<span class="text-muted text-sm">Not authorized in any state.</span>`;
  } else if (states.length === ALL_STATE_CODES.length) {
    statesEl.innerHTML = `<span class="badge badge-info">All 50 States + DC</span>`;
  } else {
    statesEl.innerHTML = states.map(code => {
      const s = US_STATES.find(st => st.code === code);
      return `<span class="badge badge-outline" style="margin:2px;">${s ? s.name : code}</span>`;
    }).join("");
  }

  const lobEl = document.getElementById("userAuthorityLobs");
  if (lobs.length === 0) {
    lobEl.innerHTML = `<span class="text-muted text-sm">Not assigned to any line of business.</span>`;
  } else {
    lobEl.innerHTML = lobs.map(key => {
      const lob = LOB_CATALOG.find(l => l.key === key);
      if (!lob) return "";
      const lobCoverages = lob.coverages.filter(c => coverages.has(c));
      return `
        <div class="mb-2">
          <span class="badge badge-primary mb-1">${lob.name}</span>
          ${lobCoverages.length > 0
            ? `<ul style="margin:4px 0 0 18px; padding:0; font-size:12.5px;">${lobCoverages.map(c => `<li>${c}</li>`).join("")}</ul>`
            : `<div class="text-xs text-muted" style="margin-left:2px;">No coverages authorized on this line.</div>`}
        </div>`;
    }).join("");
  }

  const modal = document.getElementById("userAuthorityModal");
  if (modal) modal.style.display = "flex";
}

function closeUserAuthorityModal() {
  const modal = document.getElementById("userAuthorityModal");
  if (modal) modal.style.display = "none";
}

/**
 * Appends a new persona to the header role switcher dropdown so a newly
 * added user is genuinely selectable — not just visible in the roster.
 */
function addRoleDropdownOption(roleKey, name, title, limit) {
  const select = document.getElementById("userRoleSelect");
  if (!select) return;
  const role = USER_ROLES_CONFIG[roleKey];
  const opt = document.createElement("option");
  opt.value = roleKey;
  const limitLabel = limit > 0 ? `$${(limit / 1000000).toFixed(1)}M Limit` : "No Authority Limit";
  opt.textContent = `${role ? role.icon : "👤"} ${title} (${name} - ${limitLabel})`;
  select.appendChild(opt);
}

function openAddUserModal() {
  if (currentUserRole !== "admin") {
    showToast("⛔ Only the System Administrator can add users.", "danger");
    return;
  }

  editingTeamUserId = null;
  setAddUserModalMode("add");

  const roleSelect = document.getElementById("addUserRole");
  if (roleSelect) {
    roleSelect.innerHTML = Object.keys(USER_ROLES_CONFIG).map(roleKey => {
      const role = USER_ROLES_CONFIG[roleKey];
      return `<option value="${roleKey}">${role.icon} ${role.title}</option>`;
    }).join("");
  }

  document.getElementById("addUserName").value = "";
  document.getElementById("addUserTitle").value = "";
  document.getElementById("addUserEmail").value = "";
  prefillAddUserAuthorityLimit();
  renderAddUserStatesSelect([]);
  renderAddUserLobChecklist([]);
  renderAddUserCoverageChecklist([], []);

  const modal = document.getElementById("addUserModal");
  if (modal) modal.style.display = "flex";
}

/**
 * Opens the same Add User modal pre-filled with an existing roster member's
 * details (including their default-seeded ones) so admin can update role,
 * authority limit, licensed states, lines of business and coverages.
 */
function editTeamUser(userId) {
  if (currentUserRole !== "admin") {
    showToast("⛔ Only the System Administrator can edit users.", "danger");
    return;
  }
  const user = TEAM_USERS.find(u => u.id === userId);
  if (!user) return;

  editingTeamUserId = userId;
  setAddUserModalMode("edit");

  const roleSelect = document.getElementById("addUserRole");
  if (roleSelect) {
    roleSelect.innerHTML = Object.keys(USER_ROLES_CONFIG).map(roleKey => {
      const role = USER_ROLES_CONFIG[roleKey];
      return `<option value="${roleKey}">${role.icon} ${role.title}</option>`;
    }).join("");
    roleSelect.value = user.roleKey;
  }

  document.getElementById("addUserName").value = user.name || "";
  document.getElementById("addUserTitle").value = user.title || "";
  document.getElementById("addUserEmail").value = user.email || "";
  document.getElementById("addUserLimit").value = user.limit;
  renderAddUserStatesSelect(user.states || []);
  renderAddUserLobChecklist(user.lobs || []);
  renderAddUserCoverageChecklist(user.lobs || [], user.coverages || []);

  const modal = document.getElementById("addUserModal");
  if (modal) modal.style.display = "flex";
}

function setAddUserModalMode(mode) {
  const title = document.getElementById("addUserModalTitle");
  const desc = document.getElementById("addUserModalDesc");
  const saveLabel = document.getElementById("addUserSaveBtnLabel");
  if (mode === "edit") {
    if (title) title.textContent = "Edit User";
    if (desc) desc.textContent = "Updates this team member's role, authority limit, licensed states, lines of business and coverages.";
    if (saveLabel) saveLabel.textContent = "Save Changes";
  } else {
    if (title) title.textContent = "Add New User";
    if (desc) desc.textContent = "Adds a team member to the roster. They inherit permissions from the assigned role.";
    if (saveLabel) saveLabel.textContent = "Add User";
  }
}

function prefillAddUserAuthorityLimit() {
  const roleKey = document.getElementById("addUserRole").value;
  const role = USER_ROLES_CONFIG[roleKey];
  const limitInput = document.getElementById("addUserLimit");
  if (role && limitInput && editingTeamUserId === null) limitInput.value = role.limit;
}

/** Renders the multi-select of underwriting-licensed states, pre-checking any already selected. */
function renderAddUserStatesSelect(selectedCodes) {
  const select = document.getElementById("addUserStates");
  if (!select) return;
  const selectedSet = new Set(selectedCodes || []);
  select.innerHTML = US_STATES.map(s =>
    `<option value="${s.code}" ${selectedSet.has(s.code) ? "selected" : ""}>${s.code} — ${s.name}</option>`
  ).join("");
}

/** Renders LOB checkboxes; toggling one refreshes the dependent coverage checklist below it. */
function renderAddUserLobChecklist(selectedLobKeys) {
  const container = document.getElementById("addUserLobChecklist");
  if (!container) return;
  const selectedSet = new Set(selectedLobKeys || []);
  container.innerHTML = LOB_CATALOG.map(lob => `
    <label style="display:flex; align-items:center; gap:6px; font-weight:400; font-size:12.5px;">
      <input type="checkbox" class="add-user-lob-cb" value="${lob.key}" ${selectedSet.has(lob.key) ? "checked" : ""} onchange="onAddUserLobsChanged()">
      ${lob.name}
    </label>`).join("");
}

/** Reads currently-checked LOBs and rebuilds the coverage checklist to match, keeping prior coverage checks where still applicable. */
function onAddUserLobsChanged() {
  const checkedLobs = Array.from(document.querySelectorAll(".add-user-lob-cb:checked")).map(cb => cb.value);
  const currentlyCheckedCoverages = Array.from(document.querySelectorAll(".add-user-coverage-cb:checked")).map(cb => cb.value);
  renderAddUserCoverageChecklist(checkedLobs, currentlyCheckedCoverages);
}

/** Renders coverage checkboxes scoped to the selected LOBs only; new LOB coverages default to checked. */
function renderAddUserCoverageChecklist(selectedLobKeys, checkedCoverages) {
  const container = document.getElementById("addUserCoverageChecklist");
  if (!container) return;
  const availableCoverages = getCoveragesForLOBs(selectedLobKeys);
  if (availableCoverages.length === 0) {
    container.innerHTML = `<span class="text-xs text-muted">Select a line of business above to choose its coverages.</span>`;
    return;
  }
  const checkedSet = new Set(checkedCoverages || availableCoverages);
  container.innerHTML = availableCoverages.map(cov => `
    <label style="display:flex; align-items:center; gap:6px; font-weight:400; font-size:12.5px;">
      <input type="checkbox" class="add-user-coverage-cb" value="${cov}" ${checkedSet.has(cov) ? "checked" : ""}>
      ${cov}
    </label>`).join("");
}

function closeAddUserModal() {
  editingTeamUserId = null;
  const modal = document.getElementById("addUserModal");
  if (modal) modal.style.display = "none";
}

function saveNewUser() {
  if (currentUserRole !== "admin") {
    showToast("⛔ Only the System Administrator can add users.", "danger");
    return;
  }

  const name = document.getElementById("addUserName").value.trim();
  const title = document.getElementById("addUserTitle").value.trim();
  const email = document.getElementById("addUserEmail").value.trim();
  const baseRoleKey = document.getElementById("addUserRole").value;
  const limit = parseInt(document.getElementById("addUserLimit").value, 10);
  const states = Array.from(document.getElementById("addUserStates").selectedOptions).map(o => o.value);
  const lobs = Array.from(document.querySelectorAll(".add-user-lob-cb:checked")).map(cb => cb.value);
  const coverages = Array.from(document.querySelectorAll(".add-user-coverage-cb:checked")).map(cb => cb.value);

  if (!name || !title) {
    showToast("⛔ Name and Job Title are required to add a user.", "danger");
    return;
  }
  if (isNaN(limit) || limit < 0) {
    showToast("⛔ Enter a valid authority limit.", "danger");
    return;
  }

  // Editing an existing roster member: update their fields in place, keep
  // their existing role key (and RBAC permissions) untouched.
  if (editingTeamUserId !== null) {
    const user = TEAM_USERS.find(u => u.id === editingTeamUserId);
    if (!user) { closeAddUserModal(); return; }
    user.name = name;
    user.title = title;
    user.email = email;
    user.limit = limit;
    user.states = states;
    user.lobs = lobs;
    user.coverages = coverages;
    renderTeamRoster();
    closeAddUserModal();
    showToast(`✅ ${name} updated.`, "success");
    return;
  }

  const baseRole = USER_ROLES_CONFIG[baseRoleKey];

  // Give this person their OWN role key (rather than reusing the shared
  // archetype key) so they become a genuinely separate, selectable persona
  // in the role switcher — not just a roster row. Their permissions start
  // as a copy of the base role's permissions, editable independently from
  // User Master afterward.
  const newRoleKey = `custom_${Date.now()}`;
  USER_ROLES_CONFIG[newRoleKey] = {
    name,
    title,
    limit,
    limitText: `$${limit.toLocaleString()} Authority Limit`,
    icon: baseRole ? baseRole.icon : "👤",
    description: `Added by ${(USER_ROLES_CONFIG[currentUserRole] || {}).name || 'Admin'} — inherits ${baseRole ? baseRole.title : baseRoleKey} permissions.`
  };
  PERMISSIONS_MATRIX[newRoleKey] = JSON.parse(JSON.stringify(
    PERMISSIONS_MATRIX[baseRoleKey] || PERMISSIONS_MATRIX.junior
  ));

  const newUser = {
    id: `u_${newRoleKey}`,
    name,
    title,
    email,
    roleKey: newRoleKey,
    limit,
    description: USER_ROLES_CONFIG[newRoleKey].description,
    states,
    lobs,
    coverages,
    isDefault: false
  };

  TEAM_USERS.push(newUser);
  addRoleDropdownOption(newRoleKey, name, title, limit);
  renderTeamRoster();
  closeAddUserModal();
  showToast(`✅ ${name} added as a selectable persona (inherits ${baseRole ? baseRole.title : baseRoleKey} permissions). Select them from the role switcher in the header to log in as them.`, "success");
}

function removeTeamUser(userId) {
  const user = TEAM_USERS.find(u => u.id === userId);
  if (!user) return;
  TEAM_USERS = TEAM_USERS.filter(u => u.id !== userId);
  renderTeamRoster();
  showToast(`🗑️ ${user.name} removed from the team roster.`, "info");
}

function populateResourceSelect() {
  const select = document.getElementById("userMasterResourceSelect");
  if (!select) return;
  select.innerHTML = RBAC_RESOURCES.map(r => `<option value="${r.key}">${r.label}</option>`).join("");
  select.value = userMasterSelectedResource;
}

function renderPermissionMatrixEditor() {
  const select = document.getElementById("userMasterResourceSelect");
  const container = document.getElementById("permissionMatrixEditorContainer");
  if (!select || !container) return;

  userMasterSelectedResource = select.value || userMasterSelectedResource;
  const resource = userMasterSelectedResource;
  const roleKeys = Object.keys(USER_ROLES_CONFIG);

  const headerCols = RBAC_ACTIONS.map(a => `<th style="text-align:center; text-transform:capitalize;">${a}</th>`).join("");
  const rows = roleKeys.map(roleKey => {
    const role = USER_ROLES_CONFIG[roleKey];
    const perms = PERMISSIONS_MATRIX[roleKey][resource];
    const cells = RBAC_ACTIONS.map(action => `
      <td style="text-align:center;">
        <input type="checkbox" class="rbac-editor-cb" data-role="${roleKey}" data-action="${action}" ${perms[action] ? "checked" : ""} style="width:16px; height:16px;">
      </td>`).join("");
    return `
      <tr>
        <td>${role.icon} <strong>${role.title}</strong></td>
        ${cells}
      </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Role</th>${headerCols}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function savePermissionMatrixEditor() {
  if (currentUserRole !== "admin") {
    showToast("⛔ Only the System Administrator can edit permissions.", "danger");
    return;
  }

  const resource = userMasterSelectedResource;
  document.querySelectorAll(".rbac-editor-cb").forEach(cb => {
    const roleKey = cb.dataset.role;
    const action = cb.dataset.action;
    if (PERMISSIONS_MATRIX[roleKey] && PERMISSIONS_MATRIX[roleKey][resource]) {
      PERMISSIONS_MATRIX[roleKey][resource][action] = cb.checked;
    }
  });

  const resourceLabel = (RBAC_RESOURCES.find(r => r.key === resource) || {}).label || resource;
  showToast(`✅ Permissions for "${resourceLabel}" saved. Changes apply immediately across the app.`, "success");
}

function resetPermissionsMatrix() {
  if (currentUserRole !== "admin") {
    showToast("⛔ Only the System Administrator can reset permissions.", "danger");
    return;
  }
  PERMISSIONS_MATRIX = defaultPermissionsMatrix();
  renderPermissionMatrixEditor();
  showToast("↩️ Permission matrix reset to system defaults.", "info");
}

function switchQuoteIntelTab(tab) {
  quoteIntelActiveTab = tab;
  const tabRenewal = document.getElementById("qiTabRenewal");
  const tabCmp = document.getElementById("qiTabCompare");
  const panelRenewal = document.getElementById("qiPanelRenewal");
  const panelCmp = document.getElementById("qiPanelCompare");

  if (tabRenewal) tabRenewal.classList.toggle("active", tab === "renewal");
  if (tabCmp) tabCmp.classList.toggle("active", tab === "compare");
  if (panelRenewal) panelRenewal.style.display = tab === "renewal" ? "block" : "none";
  if (panelCmp) panelCmp.style.display = tab === "compare" ? "block" : "none";

  if (tab === "renewal") populateRenewalSelector();
  else populateCompareLobFilter();
}

/**
 * OLD vs NEW (RENEWAL) COMPARISON — this customer's prior policy already
 * held with us vs. the new quote being written now on this submission.
 * Distinct from cross-submission comparison below.
 */
function populateRenewalSelector() {
  const select = document.getElementById("renewalSubmissionSelect");
  if (!select) return;

  const withPriorPolicy = SUBMISSIONS_DATASET.filter(s => s.priorPolicy);
  select.innerHTML = `<option value="">Select submission...</option>` +
    withPriorPolicy.map(s => `<option value="${s.id}">${s.id} — ${s.insured} (${s.lobName})</option>`).join("");

  const resultEl = document.getElementById("renewalComparisonResult");
  if (resultEl) {
    resultEl.innerHTML = withPriorPolicy.length === 0
      ? `<div class="text-muted text-sm mt-2">No submissions currently have a prior policy on file.</div>`
      : "";
  }
}

function renderRenewalComparison() {
  const subId = document.getElementById("renewalSubmissionSelect").value;
  const resultEl = document.getElementById("renewalComparisonResult");
  if (!resultEl) return;
  if (!subId) { resultEl.innerHTML = ""; return; }

  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.priorPolicy) {
    resultEl.innerHTML = `<div class="alert alert-warning u-fs-12-5">No prior policy on file for this submission.</div>`;
    return;
  }

  const prior = sub.priorPolicy;
  const newPremium = getSubmissionPremium(sub);
  const priorPremium = prior.premium;
  const delta = newPremium - priorPremium;
  const deltaPct = priorPremium > 0 ? Math.round((delta / priorPremium) * 100) : 0;

  // Match coverage lines between prior policy and new quote by line description
  const newCoverage = sub.coverageRows || [];
  const allLines = Array.from(new Set([...prior.coverageRows.map(c => c.line), ...newCoverage.map(c => c.line)]));
  const coverageRows = allLines.map(line => {
    const oldRow = prior.coverageRows.find(c => c.line === line);
    const newRow = newCoverage.find(c => c.line === line);
    return `
      <tr>
        <td>${line}</td>
        <td>${oldRow ? `${oldRow.limit} / ${oldRow.ded} ded / ${oldRow.prem}` : `<span class="text-muted">— not on prior policy —</span>`}</td>
        <td>${newRow ? `${newRow.limit} / ${newRow.ded} ded / ${newRow.prem}` : `<span class="text-muted">— dropped from new quote —</span>`}</td>
      </tr>`;
  }).join("");

  resultEl.innerHTML = `
    <div class="alert ${delta> 0 ? 'alert-warning' : 'alert-success'} mb-3 u-fs-12-5">
      <i class="ph ${delta > 0 ? 'ph-trend-up' : 'ph-trend-down'}"></i>
      Premium ${delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'unchanged'} by <strong>$${Math.abs(delta).toLocaleString()} (${Math.abs(deltaPct)}%)</strong> vs. the prior policy — use this to explain renewal pricing changes to the customer.
    </div>
    <div class="card mb-3">
      <div class="card-header"><h3><i class="ph ph-arrows-clockwise"></i> ${sub.insured} — Prior Policy vs New Quote</h3></div>
      <div class="card-body p-0">
        <table class="data-table">
          <thead><tr><th></th><th>Prior Policy (${prior.policyNumber})</th><th>New Quote (${sub.quoteNo || sub.id})</th></tr></thead>
          <tbody>
            <tr><td><strong>Policy Period</strong></td><td>${prior.policyPeriod}</td><td>${sub.receivedAt || '—'} onward</td></tr>
            <tr><td><strong>Total Premium</strong></td><td class="font-mono">$${priorPremium.toLocaleString()}</td><td class="font-mono"><strong>$${newPremium.toLocaleString()}</strong></td></tr>
            <tr><td><strong>Loss Ratio</strong></td><td>${prior.lossRatio}</td><td class="text-muted">Pending renewal term</td></tr>
            <tr><td><strong>Claims</strong></td><td>${prior.claimsCount} — ${prior.claimsNote}</td><td class="text-muted">—</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h3><i class="ph ph-list-checks"></i> Coverage Line Comparison</h3></div>
      <div class="card-body p-0">
        <table class="data-table">
          <thead><tr><th>Coverage Line</th><th>Prior Policy (Limit / Ded / Premium)</th><th>New Quote (Limit / Ded / Premium)</th></tr></thead>
          <tbody>${coverageRows}</tbody>
        </table>
      </div>
    </div>`;
}

/**
 * #3: MULTIPLE QUOTE COMPARISON — underwriters compare 2–3 submissions,
 * restricted to the SAME coverage type / line of business so the
 * comparison is meaningful (comparing trucking to trucking, not trucking
 * to property).
 */
function populateCompareLobFilter() {
  const select = document.getElementById("compareLobFilterSelect");
  if (!select) return;

  const lobMap = {};
  SUBMISSIONS_DATASET.forEach(s => { lobMap[s.lobKey] = s.lobName; });

  select.innerHTML = `<option value="">Select coverage type...</option>` +
    Object.keys(lobMap).map(key => `<option value="${key}">${lobMap[key]}</option>`).join("");

  selectedCompareIds = [];
  renderQuoteCompareSelector();
}

function renderQuoteCompareSelector() {
  const container = document.getElementById("quoteCompareSelector");
  const lobFilter = document.getElementById("compareLobFilterSelect")?.value || "";
  if (!container) return;

  if (!lobFilter) {
    container.innerHTML = `<div class="text-muted text-sm">Select a coverage type above to see comparable submissions.</div>`;
    return;
  }

  const candidates = SUBMISSIONS_DATASET.filter(s => s.lobKey === lobFilter);
  if (candidates.length < 2) {
    container.innerHTML = `<div class="alert alert-warning u-fs-12-5"><i class="ph ph-warning"></i> Only ${candidates.length} submission(s) exist for this coverage type — need at least 2 with the same coverage to compare.</div>`;
    return;
  }

  const rows = candidates.map(s => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--color-border); font-size:12.5px;">
      <input type="checkbox" value="${s.id}" onchange="toggleCompareSelection('${s.id}', this.checked)" ${selectedCompareIds.includes(s.id) ? "checked" : ""} style="width:16px; height:16px;">
      <span style="flex:1;"><code class="font-mono">${s.id}</code> — ${s.insured} <span class="text-muted">(${s.underwriter || 'Unassigned'})</span></span>
      <strong class="font-mono">$${getSubmissionPremium(s).toLocaleString()}</strong>
    </label>`).join("");

  container.innerHTML = `<div style="max-height:280px; overflow-y:auto;">${rows}</div>`;
}

function toggleCompareSelection(id, checked) {
  if (checked) {
    if (!selectedCompareIds.includes(id)) selectedCompareIds.push(id);
    if (selectedCompareIds.length > 3) {
      showToast("You can compare a maximum of 3 quotes at once.", "warning");
      selectedCompareIds.shift();
      renderQuoteCompareSelector();
    }
  } else {
    selectedCompareIds = selectedCompareIds.filter(x => x !== id);
  }
}

function renderQuoteComparisonTable() {
  const resultEl = document.getElementById("quoteComparisonResult");
  if (!resultEl) return;

  if (selectedCompareIds.length < 2) {
    resultEl.innerHTML = `<div class="alert alert-warning u-fs-12-5"><i class="ph ph-warning"></i> Select at least 2 quotes to compare.</div>`;
    return;
  }

  const subs = selectedCompareIds.map(id => SUBMISSIONS_DATASET.find(s => s.id === id)).filter(Boolean);

  const lobKeys = new Set(subs.map(s => s.lobKey));
  if (lobKeys.size > 1) {
    resultEl.innerHTML = `<div class="alert alert-danger u-fs-12-5"><i class="ph ph-warning"></i> Selected submissions have different coverage types (${subs.map(s => s.lobName).join(", ")}). Comparison is only meaningful across the same coverage — please select submissions with matching coverage.</div>`;
    return;
  }

  const fields = [
    { label: "Submission ID", get: s => s.id },
    { label: "Customer", get: s => s.insured },
    { label: "Underwriter", get: s => s.underwriter || "Unassigned" },
    { label: "Line of Business", get: s => s.lobName },
    { label: "Quote Number", get: s => s.quoteNo || "—" },
    { label: "Quoted Premium", get: s => `$${getSubmissionPremium(s).toLocaleString()}` },
    { label: "Exposure Value", get: s => `$${(s.exposureVal || 0).toLocaleString()}` },
    { label: "Trust/Risk Score", get: s => getSubmissionTrustScore(s) },
    { label: "Priority", get: s => s.priority },
    { label: "Status", get: s => s.statusText },
    { label: "Current Stage", get: s => { const st = WORKFLOW_STEPS.find(w => w.step === (s.currentStep || 1)); return st ? st.title : "—"; } },
    { label: "Received", get: s => s.receivedAt || "—" }
  ];

  const headerCols = subs.map(s => `<th>${s.id}</th>`).join("");
  const bodyRows = fields.map(f => `
    <tr>
      <td><strong>${f.label}</strong></td>
      ${subs.map(s => `<td>${f.get(s)}</td>`).join("")}
    </tr>`).join("");

  resultEl.innerHTML = `
    <div class="alert alert-info mb-2 u-fs-12-5"><i class="ph ph-info"></i> All selected submissions share the same coverage type: <strong>${subs[0].lobName}</strong>.</div>
    <div class="card">
      <div class="card-header"><h3><i class="ph ph-columns"></i> Side-by-Side Comparison</h3></div>
      <div class="card-body p-0">
        <table class="data-table">
          <thead><tr><th>Field</th>${headerCols}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================================
// FEATURE #7: TRUST SCORE-BASED PREMIUM ADJUSTMENT
// ============================================================================
let premiumAdjustTargetId = null;

function openPremiumAdjustModal(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId) || SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) return;
  premiumAdjustTargetId = sub.id;

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  const trustScore = getSubmissionTrustScore(sub);
  const currentPremium = getSubmissionPremium(sub);

  const modal = document.getElementById("premiumAdjustModal");
  const body = document.getElementById("premiumAdjustModalBody");
  if (!modal || !body) return;

  body.innerHTML = `
    <div style="font-size:13px; margin-bottom:10px;">
      <strong>Submission:</strong> <code>${sub.id}</code> — ${sub.insured || "N/A"}
    </div>
    <div class="alert alert-info" style="font-size:12.5px; margin-bottom:14px;">
      <i class="ph ph-info"></i> Customer Trust/Risk Score: <strong>${trustScore} / 100</strong>. Your authority limit as ${roleConfig.title}: <strong>$${roleConfig.limit.toLocaleString()}</strong>.
    </div>
    <div class="form-group mb-3">
      <label class="u-label-sm">Current Quoted Premium</label>
      <input type="text" class="form-control" value="$${currentPremium.toLocaleString()}" disabled>
    </div>
    <div class="form-group mb-3">
      <label class="u-label-sm">New Premium</label>
      <div style="display:flex; align-items:center; gap:8px;">
        <span>$</span>
        <input type="number" id="premiumAdjustNewValue" class="form-control" value="${currentPremium}" min="0">
      </div>
      <p class="text-xs text-muted u-mt-4">Must remain within your authorized limit ($${roleConfig.limit.toLocaleString()}).</p>
    </div>
    <div class="form-group mb-3">
      <label class="u-label-sm">Reason for Adjustment <span class="u-text-danger">*</span></label>
      <textarea id="premiumAdjustReason" class="form-control" rows="3" placeholder="e.g. Trust score reflects 5-year clean loss history; adjusting premium down 8% per pricing guideline..."></textarea>
    </div>
    <div id="premiumAdjustHistory" class="text-xs text-muted"></div>
  `;

  const history = (sub.premiumAdjustments || []).slice().reverse();
  const historyEl = document.getElementById("premiumAdjustHistory");
  if (history.length && historyEl) {
    historyEl.innerHTML = `<strong>Adjustment History:</strong>` + history.map(h =>
      `<div>› ${h.at} — <strong>${h.by}</strong> changed $${h.oldPremium.toLocaleString()} → $${h.newPremium.toLocaleString()}: ${h.reason}</div>`
    ).join("");
  }

  modal.style.display = "flex";
}

function closePremiumAdjustModal() {
  const modal = document.getElementById("premiumAdjustModal");
  if (modal) modal.style.display = "none";
  premiumAdjustTargetId = null;
}

function submitPremiumAdjustment() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === premiumAdjustTargetId);
  if (!sub) return;

  if (!hasPermission("premiumAdjustment", "edit")) {
    denyPermission("premiumAdjustment", "edit");
    return;
  }

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  const newValRaw = document.getElementById("premiumAdjustNewValue").value;
  const reason = document.getElementById("premiumAdjustReason").value.trim();
  const newPremium = parseInt(newValRaw, 10);

  if (!reason) {
    showToast("⛔ A reason is required to record a premium adjustment.", "danger");
    return;
  }
  if (isNaN(newPremium) || newPremium < 0) {
    showToast("⛔ Enter a valid premium amount.", "danger");
    return;
  }

  let isOverride = false;
  if (newPremium > roleConfig.limit) {
    if (hasPermission("premiumAdjustment", "override")) {
      isOverride = true;
    } else {
      showToast(`⛔ $${newPremium.toLocaleString()} exceeds your authorized limit of $${roleConfig.limit.toLocaleString()}. Escalate to a higher authority instead.`, "danger");
      return;
    }
  }

  const oldPremium = getSubmissionPremium(sub);
  if (!sub.premiumAdjustments) sub.premiumAdjustments = [];
  sub.premiumAdjustments.push({
    oldPremium,
    newPremium,
    reason,
    by: `${roleConfig.name} (${roleConfig.title})`,
    trustScoreAtAdjustment: getSubmissionTrustScore(sub),
    at: new Date().toISOString().slice(0, 16).replace("T", " "),
    isOverride
  });
  sub.currentPremium = newPremium;

  showToast(isOverride
    ? `⚡ OVERRIDE: Premium adjusted beyond standard authority: $${oldPremium.toLocaleString()} → $${newPremium.toLocaleString()} by ${roleConfig.name}. Override logged.`
    : `✅ Premium adjusted: $${oldPremium.toLocaleString()} → $${newPremium.toLocaleString()} by ${roleConfig.name}. Reason recorded.`, "success");
  closePremiumAdjustModal();

  // Refresh any visible views that display premium
  if (currentPage === "quote-intel") { renderQuoteCompareSelector(); renderRenewalComparison(); }
  refreshAuditLogIfVisible();
}

let ratingTransitionTimer = null;
let ratingTransitionInterval = null;
let ratingStartTime = 0;

function stopRatingTransition() {
  if (ratingTransitionTimer) {
    clearTimeout(ratingTransitionTimer);
    ratingTransitionTimer = null;
  }
  if (ratingTransitionInterval) {
    clearInterval(ratingTransitionInterval);
    ratingTransitionInterval = null;
  }
}

function startRatingTransition() {
  stopRatingTransition();

  const l1 = document.getElementById("ratingLoader1");
  const l2 = document.getElementById("ratingLoader2");
  const l3 = document.getElementById("ratingLoader3");

  const i1 = document.getElementById("ratingIcon1");
  const i2 = document.getElementById("ratingIcon2");
  const i3 = document.getElementById("ratingIcon3");

  const b1 = document.getElementById("ratingBadge1");
  const b2 = document.getElementById("ratingBadge2");
  const b3 = document.getElementById("ratingBadge3");

  const t1 = document.getElementById("ratingTitle1");
  const t2 = document.getElementById("ratingTitle2");
  const t3 = document.getElementById("ratingTitle3");

  const progressBar = document.getElementById("ratingProgressBar");
  const percentText = document.getElementById("ratingPercentText");
  const countdownText = document.getElementById("ratingCountdown");

  if (!l1 || !l2 || !l3) return;

  ratingStartTime = Date.now();

  l1.style.opacity = "1.0";
  l2.style.opacity = "0.5";
  l3.style.opacity = "0.5";

  i1.style.background = "#eff6ff"; i1.style.color = "#2563eb"; i1.innerHTML = `<i class="ph ph-spinner spin"></i>`;
  i2.style.background = "#f1f5f9"; i2.style.color = "#94a3b8"; i2.innerHTML = `<i class="ph ph-circle"></i>`;
  i3.style.background = "#f1f5f9"; i3.style.color = "#94a3b8"; i3.innerHTML = `<i class="ph ph-circle"></i>`;

  b1.className = "badge badge-primary font-mono text-xs"; b1.textContent = "In Progress";
  b2.className = "badge badge-light font-mono text-xs"; b2.textContent = "Queued";
  b3.className = "badge badge-light font-mono text-xs"; b3.textContent = "Queued";

  if (t1) { t1.style.fontWeight = "700"; t1.style.color = "#0f172a"; }
  if (t2) { t2.style.fontWeight = "600"; t2.style.color = "#64748b"; }
  if (t3) { t3.style.fontWeight = "600"; t3.style.color = "#64748b"; }

  if (progressBar) progressBar.style.width = "0%";
  if (percentText) percentText.textContent = "0%";
  if (countdownText) countdownText.textContent = "6.0s";

  ratingTransitionInterval = setInterval(() => {
    const elapsed = Date.now() - ratingStartTime;
    const remaining = Math.max(0, (6000 - elapsed) / 1000);
    const progress = Math.min(100, Math.round((elapsed / 6000) * 100));

    if (progressBar) progressBar.style.width = `${progress}%`;
    if (percentText) percentText.textContent = `${progress}%`;
    if (countdownText) countdownText.textContent = `${remaining.toFixed(1)}s`;

    // Phase 1 -> Phase 2 Transition at 2.0s (Hitting rating engine -> Fetching data)
    if (elapsed >= 2000 && elapsed < 4000) {
      i1.style.background = "#dcfce7"; i1.style.color = "#16a34a"; i1.innerHTML = `<i class="ph ph-check-circle"></i>`;
      b1.className = "badge badge-success font-mono text-xs"; b1.textContent = "Passed";

      l2.style.opacity = "1.0";
      i2.style.background = "#eff6ff"; i2.style.color = "#2563eb"; i2.innerHTML = `<i class="ph ph-spinner spin"></i>`;
      b2.className = "badge badge-primary font-mono text-xs"; b2.textContent = "In Progress";
      if (t2) { t2.style.fontWeight = "700"; t2.style.color = "#0f172a"; }
    }

    // Phase 2 -> Phase 3 Transition at 4.0s (Fetching data -> Calculating)
    if (elapsed >= 4000) {
      i1.style.background = "#dcfce7"; i1.style.color = "#16a34a"; i1.innerHTML = `<i class="ph ph-check-circle"></i>`;
      b1.className = "badge badge-success font-mono text-xs"; b1.textContent = "Passed";

      i2.style.background = "#dcfce7"; i2.style.color = "#16a34a"; i2.innerHTML = `<i class="ph ph-check-circle"></i>`;
      b2.className = "badge badge-success font-mono text-xs"; b2.textContent = "Passed";

      l3.style.opacity = "1.0";
      i3.style.background = "#eff6ff"; i3.style.color = "#2563eb"; i3.innerHTML = `<i class="ph ph-spinner spin"></i>`;
      b3.className = "badge badge-primary font-mono text-xs"; b3.textContent = "In Progress";
      if (t3) { t3.style.fontWeight = "700"; t3.style.color = "#0f172a"; }
    }
  }, 50);

  // Overall 6-second delay -> automatic redirect to final step (Step 7: Quote & Bind)
  ratingTransitionTimer = setTimeout(() => {
    stopRatingTransition();

    if (i3) { i3.style.background = "#dcfce7"; i3.style.color = "#16a34a"; i3.innerHTML = `<i class="ph ph-check-circle"></i>`; }
    if (b3) { b3.className = "badge badge-success font-mono text-xs"; b3.textContent = "Calculated"; }
    if (progressBar) progressBar.style.width = "100%";
    if (percentText) percentText.textContent = "100%";
    if (countdownText) countdownText.textContent = "0.0s";

    const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
    if (sub) {
      if (!sub.completedSteps) sub.completedSteps = [];
      if (!sub.completedSteps.includes(6)) sub.completedSteps.push(6);
    }

    showToast("✨ Rating Engine calculation completed! Redirecting to Step 7 (Quote & Bind)...", "success");

    goToWorkflowStep(7);
  }, 6000);
}

/**
 * Workflow Stepper Navigator (Step 1 = Doc Ingestion -> Step 7 = Quote & Bind)
 */
function goToWorkflowStep(stepNum) {
  if (stepNum < 1) stepNum = 1;
  if (stepNum > WORKFLOW_STEPS.length) stepNum = WORKFLOW_STEPS.length;

  // Compliance gate applies here too, not just in goToNextStep() — this is
  // the single low-level navigator, so it also covers direct stepper-bar
  // clicks and the auto-redirect after the Step 6 rating transition timer.
  if (stepNum === 7) {
    const subForGate = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
    const gaps = getComplianceGapsForRating(subForGate);
    if (gaps.length > 0) {
      showToast(`⛔ Cannot enter Rating & Quote — missing regulatory requirements: ${gaps.join("; ")}.`, "danger");
      stepNum = 6;
    }
  }

  currentWorkflowStep = stepNum;

  const stepObj = WORKFLOW_STEPS.find(s => s.step === stepNum) || WORKFLOW_STEPS[0];
  currentScreenId = stepObj.id;
  setPageTitle(stepObj.title || `Step ${stepNum}`);

  // Handle Rating Engine Transition timer for Step 6
  if (stepNum === 6) {
    startRatingTransition();
  } else {
    stopRatingTransition();
  }

  // Make sure we are in workflow page view
  if (currentPage !== "workflow") {
    showWorkflowPage(stepNum);
    return;
  }

  // 1. Show target screen view & hide all other screen views
  document.querySelectorAll(".screen-view").forEach(s => s.classList.remove("active"));
  const targetScreen = document.getElementById(stepObj.id);
  if (targetScreen) {
    targetScreen.classList.add("active");
  }

  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  const completedList = sub && sub.completedSteps ? sub.completedSteps.filter(st => st <= 7) : [];

  // 2. Populate downstream screen data for active sub
  if (sub) renderAllDownstreamScreens(sub);

  // 3. Update Workflow Horizontal Stepper Bar (Completed vs Active vs Upcoming)
  const hItems = document.querySelectorAll("#workflowStepperBar .h-stepper-item");
  const hLines = document.querySelectorAll("#workflowStepperBar .h-stepper-line");

  hItems.forEach((item) => {
    const itemStep = parseInt(item.getAttribute("data-step"), 10);
    item.classList.remove("active", "completed", "upcoming");
    if (itemStep === stepNum) {
      item.classList.add("active");
      try {
        item.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      } catch (e) {}
    } else if (completedList.includes(itemStep)) {
      item.classList.add("completed");
    } else {
      item.classList.add("upcoming");
    }
  });

  hLines.forEach((line) => {
    const lineStep = parseInt(line.getAttribute("data-line"), 10);
    line.classList.remove("completed");
    if (completedList.includes(lineStep)) {
      line.classList.add("completed");
    }
  });

  // 4. Update Sidebar Step List (Completed vs Active)
  for (let s = 1; s <= WORKFLOW_STEPS.length; s++) {
    const sideItem = document.getElementById(`sideStep-${s}`);
    if (sideItem) {
      sideItem.classList.remove("active", "completed");
      if (s === stepNum) {
        sideItem.classList.add("active");
      } else if (completedList.includes(s)) {
        sideItem.classList.add("completed");
      }
    }
  }

  const sideRatio = document.getElementById("sidebarStepRatio");
  if (sideRatio) {
    sideRatio.textContent = `${completedList.length}/7 Done`;
  }

  // 5. Update Headers & Active Case Card
  if (sub) updateActiveCaseHeaders(sub);

  // 6. Update Bottom Navigation Footer
  updateBottomFooter(stepObj, sub);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Universal Screen Navigator (Handles screen-1, screen-2..8, and screen-9)
 */
function goToScreen(screenId) {
  if (screenId === "screen-1") {
    showIntakePage();
  } else if (screenId === "screen-9") {
    showArchivePage();
  } else {
    const stepObj = WORKFLOW_STEPS.find(s => s.id === screenId);
    if (stepObj) {
      showWorkflowPage(stepObj.step);
    }
  }
}

/**
 * Update Sidebar Active Case Card, Top Header Workflow Pill & Top Workflow Banner
 */
function updateActiveCaseHeaders(sub) {
  if (!sub) return;
  const completedList = (sub.completedSteps || []).filter(st => st <= 7);
  const pct = Math.round((completedList.length / 7) * 100);

  // Top Header Case Workflow Pill
  const hCase = document.getElementById("headerActiveCaseSub");
  const hBadge = document.getElementById("headerActiveCaseBadge");
  if (hCase) hCase.textContent = sub.insured;
  if (hBadge) hBadge.textContent = sub.id;

  // Sidebar widget
  const sideSubName = document.getElementById("sidebarNavActiveCaseSub");
  const sideSubBadge = document.getElementById("sidebarActiveCaseBadge");
  const sideCardSubId = document.getElementById("sideCardSubId");
  const sideCardInsured = document.getElementById("sideCardInsured");
  const sideCardLob = document.getElementById("sideCardLob");
  const sideCardPriority = document.getElementById("sideCardPriority");
  const sideCardProgressText = document.getElementById("sideCardProgressText");
  const sideCardProgressBar = document.getElementById("sideCardProgressBar");

  if (sideSubName) sideSubName.textContent = sub.insured;
  if (sideSubBadge) sideSubBadge.textContent = sub.id;
  if (sideCardSubId) sideCardSubId.textContent = sub.id;
  if (sideCardInsured) sideCardInsured.textContent = sub.insured;
  if (sideCardLob) sideCardLob.textContent = sub.lobName.split(' ')[0];
  if (sideCardPriority) {
    sideCardPriority.textContent = `${sub.priority} SLA`;
    sideCardPriority.className = `badge ${sub.priority === 'P1' ? 'badge-danger' : (sub.priority === 'P2' ? 'badge-warning' : 'badge-info')} text-xs`;
  }
  if (sideCardProgressText) sideCardProgressText.textContent = `${pct}%`;
  if (sideCardProgressBar) sideCardProgressBar.style.width = `${pct}%`;

  // Workflow Top Header Bar
  const wfInsured = document.getElementById("wfHeaderInsured");
  const wfSubId = document.getElementById("wfHeaderSubId");
  const wfLob = document.getElementById("wfHeaderLob");
  const wfFEIN = document.getElementById("wfHeaderFEIN");
  const wfChannel = document.getElementById("wfHeaderChannel");
  const wfDesk = document.getElementById("wfHeaderDesk");
  const wfPriority = document.getElementById("wfHeaderPriority");
  const wfExposure = document.getElementById("wfHeaderExposure");
  const wfStatus = document.getElementById("wfHeaderStatus");

  if (wfInsured) wfInsured.textContent = sub.insured;
  if (wfSubId) wfSubId.textContent = sub.id;
  if (wfLob) wfLob.textContent = sub.lobName;
  if (wfFEIN) wfFEIN.textContent = sub.fein;
  if (wfChannel) wfChannel.textContent = sub.channelType === 'broker' ? sub.broker : 'Direct Customer Portal';
  if (wfDesk) wfDesk.textContent = sub.desk || 'Specialty Underwriting Desk';
  if (wfPriority) {
    wfPriority.textContent = `${sub.priority} • ${sub.slaText}`;
    wfPriority.className = `val badge ${sub.priority === 'P1' ? 'badge-danger' : (sub.priority === 'P2' ? 'badge-warning' : 'badge-info')}`;
  }
  if (wfExposure) wfExposure.textContent = sub.exposure;
  if (wfStatus) {
    wfStatus.textContent = sub.statusText;
    wfStatus.className = `val badge ${sub.statusBadge || 'badge-primary'}`;
  }
}

/**
 * Update Bottom Workflow Navigation Footer (Step 1..7)
 */
function updateBottomFooter(stepObj, sub) {
  const footer = document.getElementById("workflowBottomFooter");
  const btnPrev = document.getElementById("btnPrevStep");
  const btnNext = document.getElementById("btnNextStep");
  const footerStepLabel = document.getElementById("footerStepLabel");
  const footerSubId = document.getElementById("footerSubId");
  const footerSubName = document.getElementById("footerSubName");

  if (!stepObj || !footer) return;

  // On Intake or Archive Page, hide the bottom footer
  if (currentPage !== "workflow") {
    footer.style.display = "none";
    document.body.classList.remove("has-bottom-footer");
    return;
  }

  // Show bottom footer for Workflow Steps
  footer.style.display = "flex";
  document.body.classList.add("has-bottom-footer");

  if (footerStepLabel) {
    footerStepLabel.innerHTML = `<strong>Step ${stepObj.step} of 7</strong>`;
  }
  if (sub) {
    const footerDocCount = document.getElementById("footerDocCount");
    if (footerDocCount && sub.docs) footerDocCount.textContent = sub.docs.length;
  }

  if (btnPrev) {
    btnPrev.disabled = false;
    btnPrev.classList.remove("disabled");
    if (stepObj.step === 1) {
      btnPrev.innerHTML = `<i class="ph ph-arrow-left"></i> Back to Intake`;
      btnPrev.onclick = () => showIntakePage();
    } else {
      const prevStep = WORKFLOW_STEPS.find(s => s.step === stepObj.step - 1);
      btnPrev.innerHTML = `<i class="ph ph-arrow-left"></i> Previous (${prevStep ? prevStep.shortTitle : 'Back'})`;
      btnPrev.onclick = goToPrevStep;
    }
  }

  if (btnNext) {
    btnNext.disabled = false;
    btnNext.classList.remove("disabled");
    if (stepObj.step === 7) {
      btnNext.innerHTML = `<i class="ph ph-check-circle text-success"></i> Finish & Return to Intake Queue`;
      btnNext.onclick = () => {
        showIntakePage();
        showToast("🎉 Policy Flow Complete! Returned to Submission Intake Queue.", "success");
      };
    } else {
      const nextStep = WORKFLOW_STEPS.find(s => s.step === stepObj.step + 1);
      btnNext.innerHTML = `Next: ${nextStep ? nextStep.shortTitle : 'Step ' + (stepObj.step + 1)} <i class="ph ph-arrow-right"></i>`;
      btnNext.onclick = goToNextStep;
    }
  }
}

/**
 * Step Forward in Workflow (1..7)
 */
// ============================================================================
// CONFIGURABLE REVIEW ROUTING RULES (Senior Underwriter / Manager review)
// ============================================================================
let REVIEW_ROUTING_RULES = {
  seniorPremiumThreshold: 2000000,
  managerPremiumThreshold: 10000000,
  trustScoreThreshold: 65,
  riskLevelTrigger: "high",          // 'high' | 'medium_high' | 'any'
  productsRequiringSeniorReview: ["Hazmat Trucking", "Environmental Liability", "Excess Umbrella"],
  overAuthorityForcesReview: true
};

function openReviewRoutingModal() {
  const modal = document.getElementById("reviewRoutingModal");
  if (!modal) return;

  const isAuthorized = currentUserRole === "admin";
  const notice = document.getElementById("reviewRoutingModalAuthNotice");
  const saveBtn = document.getElementById("saveReviewRoutingBtn");
  const inputs = modal.querySelectorAll("input, select");

  if (notice) notice.style.display = isAuthorized ? "none" : "flex";
  if (saveBtn) saveBtn.style.display = isAuthorized ? "inline-flex" : "none";
  inputs.forEach(el => { el.disabled = !isAuthorized; });

  document.getElementById("ruleSeniorPremiumThreshold").value = REVIEW_ROUTING_RULES.seniorPremiumThreshold;
  document.getElementById("ruleManagerPremiumThreshold").value = REVIEW_ROUTING_RULES.managerPremiumThreshold;
  document.getElementById("ruleTrustScoreThreshold").value = REVIEW_ROUTING_RULES.trustScoreThreshold;
  document.getElementById("ruleRiskLevelTrigger").value = REVIEW_ROUTING_RULES.riskLevelTrigger;
  document.getElementById("ruleProductsList").value = REVIEW_ROUTING_RULES.productsRequiringSeniorReview.join(", ");
  document.getElementById("ruleOverAuthorityForcesReview").checked = REVIEW_ROUTING_RULES.overAuthorityForcesReview;

  modal.style.display = "flex";
}

function closeReviewRoutingModal() {
  const modal = document.getElementById("reviewRoutingModal");
  if (modal) modal.style.display = "none";
}

function saveReviewRoutingRules() {
  if (currentUserRole !== "admin") {
    showToast("⛔ Only the System Administrator can edit Review Routing Rules.", "danger");
    return;
  }
  REVIEW_ROUTING_RULES.seniorPremiumThreshold = parseInt(document.getElementById("ruleSeniorPremiumThreshold").value, 10) || 0;
  REVIEW_ROUTING_RULES.managerPremiumThreshold = parseInt(document.getElementById("ruleManagerPremiumThreshold").value, 10) || 0;
  REVIEW_ROUTING_RULES.trustScoreThreshold = parseInt(document.getElementById("ruleTrustScoreThreshold").value, 10) || 0;
  REVIEW_ROUTING_RULES.riskLevelTrigger = document.getElementById("ruleRiskLevelTrigger").value;
  REVIEW_ROUTING_RULES.productsRequiringSeniorReview = document.getElementById("ruleProductsList").value
    .split(",").map(s => s.trim()).filter(Boolean);
  REVIEW_ROUTING_RULES.overAuthorityForcesReview = document.getElementById("ruleOverAuthorityForcesReview").checked;

  showToast("✅ Review routing rules updated. New rules apply to all future stage evaluations.", "success");
  closeReviewRoutingModal();
}

/**
 * Evaluate whether a submission requires Senior Underwriter or Manager
 * review, based on the currently configured REVIEW_ROUTING_RULES rather
 * than a single hard-coded authority check.
 */
function determineReviewRequirement(sub) {
  const reasons = [];
  let level = "none";

  const premium = sub.exposureVal || 0;
  const trustScore = (typeof sub.trustScore === "number") ? sub.trustScore : 75; // default when not modeled on this record
  const riskLevel = sub.riskLevel || "medium";
  const product = sub.lobName || "";

  if (REVIEW_ROUTING_RULES.overAuthorityForcesReview && premium > sub.authorityLimit) {
    reasons.push(`Exposure ($${premium.toLocaleString()}) exceeds underwriter's individual authority limit ($${sub.authorityLimit.toLocaleString()})`);
    level = "senior";
  }
  if (premium > REVIEW_ROUTING_RULES.managerPremiumThreshold) {
    reasons.push(`Premium exceeds Manager review threshold ($${REVIEW_ROUTING_RULES.managerPremiumThreshold.toLocaleString()})`);
    level = "manager";
  } else if (premium > REVIEW_ROUTING_RULES.seniorPremiumThreshold) {
    reasons.push(`Premium exceeds Senior Underwriter review threshold ($${REVIEW_ROUTING_RULES.seniorPremiumThreshold.toLocaleString()})`);
    if (level !== "manager") level = "senior";
  }
  if (trustScore < REVIEW_ROUTING_RULES.trustScoreThreshold) {
    reasons.push(`Trust/risk score (${trustScore}) is below configured threshold (${REVIEW_ROUTING_RULES.trustScoreThreshold})`);
    if (level !== "manager") level = "senior";
  }
  const riskTriggers = REVIEW_ROUTING_RULES.riskLevelTrigger === "any"
    ? ["low", "medium", "high"]
    : (REVIEW_ROUTING_RULES.riskLevelTrigger === "medium_high" ? ["medium", "high"] : ["high"]);
  if (riskTriggers.includes(riskLevel)) {
    reasons.push(`Risk level "${riskLevel}" is flagged for mandatory review`);
    if (level !== "manager") level = "senior";
  }
  if (REVIEW_ROUTING_RULES.productsRequiringSeniorReview.some(p => product.toLowerCase().includes(p.toLowerCase()))) {
    reasons.push(`Product "${product}" is on the mandatory Senior review list`);
    if (level !== "manager") level = "senior";
  }

  return { required: level !== "none", level, reasons };
}

// ============================================================================
// HUMAN DECISION GATE AT MAJOR STAGES (#6)
// ============================================================================
// Steps considered "major" gates: 2 (Clearance), 4 (UW Review), 5 (Authority
// & Referral), 7 (Quote & Bind). The system performs automated checks, but
// a human must explicitly approve before the submission advances.
const MAJOR_DECISION_STEPS = [2, 4, 5, 7];
let pendingStageAdvance = null;

/**
 * Motor-carrier / commercial-auto risks require certain federal regulatory
 * items on file before a rating engine can properly evaluate the account:
 * a USDOT number, an MC (Motor Carrier) operating authority number, the
 * MCS-90 financial-responsibility endorsement, and liability limits that
 * meet the federally-mandated statutory minimum for the commodity hauled.
 * This only applies to trucking/commercial-auto LOBs — it's a no-op for
 * Property, GL, MPL, etc. which have no FMCSA nexus.
 */
function requiresMotorCarrierCompliance(sub) {
  if (!sub) return false;
  const lobKey = (sub.lobKey || "").toLowerCase();
  const lobName = (sub.lobName || "").toLowerCase();
  return lobKey === "trucking" || lobName.includes("trucking") || lobName.includes("commercial auto") || lobName.includes("auto liability");
}

function getComplianceGapsForRating(sub) {
  const gaps = [];
  if (!sub || !requiresMotorCarrierCompliance(sub)) return gaps;

  if (!sub.dot || String(sub.dot).trim() === "" || String(sub.dot).toUpperCase().startsWith("N/A")) {
    gaps.push("USDOT Number is missing or invalid");
  }
  if (!sub.mcNumber) {
    gaps.push("MC Number (Motor Carrier Operating Authority) is not on file");
  }
  if (!sub.mcs90Filed) {
    gaps.push("MCS-90 financial-responsibility endorsement has not been filed");
  }
  const minLimit = sub.minStatutoryLimit || 750000;
  const requestedLimit = sub.authorityLimit || sub.exposureVal || 0;
  if (requestedLimit < minLimit) {
    gaps.push(`Requested liability limit ($${Number(requestedLimit).toLocaleString()}) is below the federally-mandated statutory minimum ($${Number(minLimit).toLocaleString()}) for this commodity`);
  }
  return gaps;
}

function stepRequiresHumanDecision(stepNum) {
  return MAJOR_DECISION_STEPS.includes(stepNum);
}

function openStageDecisionModal(sub, currentStep) {
  const modal = document.getElementById("stageDecisionModal");
  const body = document.getElementById("stageDecisionModalBody");
  const titleEl = document.getElementById("stageDecisionModalTitle");
  if (!modal || !body) return;

  const stepObj = WORKFLOW_STEPS.find(s => s.step === currentStep);
  titleEl.textContent = `Human Decision Required: ${stepObj ? stepObj.title : "Stage " + currentStep}`;

  let extra = "";
  if (currentStep === 5) {
    const review = determineReviewRequirement(sub);
    extra = review.required
      ? `<div class="alert alert-warning u-fs-12-5"><i class="ph ph-warning"></i> <strong>${review.level === "manager" ? "Manager" : "Senior Underwriter"} review required</strong> based on configured routing rules:<ul style="margin:6px 0 0 18px;">${review.reasons.map(r => `<li>${r}</li>`).join("")}</ul></div>`
      : `<div class="alert alert-success u-fs-12-5"><i class="ph ph-check"></i> No routing rules were triggered — this case does not require additional Senior/Manager review and can proceed on standard authority.</div>`;
  }

  body.innerHTML = `
    <div class="decision-submission-card">
      <div>
        <div class="label">Submission</div>
        <div class="value">${sub.insuredName || sub.channelName || "N/A"}</div>
      </div>
      <span class="badge badge-light"><i class="ph ph-hash"></i> ${sub.id}</span>
    </div>
    <div class="alert alert-info u-fs-12-5">
      <i class="ph ph-info"></i> Review the results below before making your decision.
    </div>
    ${extra}
  `;

  pendingStageAdvance = { sub, currentStep };
  const notesField = document.getElementById("stageDecisionNotes");
  if (notesField) notesField.value = "";
  clearFieldError("stageDecisionNotes");
  modal.style.display = "flex";
}

function closeStageDecisionModal() {
  const modal = document.getElementById("stageDecisionModal");
  if (modal) modal.style.display = "none";
  clearFieldError("stageDecisionNotes");
  pendingStageAdvance = null;
}

function submitStageDecision(approved) {
  if (!pendingStageAdvance) return;

  if (approved && !hasPermission("workflow", "approve")) {
    denyPermission("workflow", "approve");
    return;
  }

  const { sub, currentStep } = pendingStageAdvance;
  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  const notes = document.getElementById("stageDecisionNotes").value.trim();

  if (approved && !notes) {
    showFieldError("stageDecisionNotes");
    showToast("⛔ Decision Notes is required.", "danger");
    return;
  }
  clearFieldError("stageDecisionNotes");

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: currentStep,
    decision: approved ? "approved" : "rejected",
    by: `${roleConfig.name} (${roleConfig.title})`,
    at: new Date().toISOString().slice(0, 16).replace("T", " "),
    notes: notes || null
  });

  closeStageDecisionModal();
  document.getElementById("stageDecisionNotes").value = "";
  refreshAuditLogIfVisible();

  if (approved) {
    showToast(`✅ Decision recorded: ${roleConfig.name} approved Step ${currentStep}. Advancing submission.`, "success");
    advanceWorkflowStepAfterDecision(currentStep);
  } else {
    showToast(`⛔ Decision recorded: ${roleConfig.name} rejected Step ${currentStep}. Submission held for rework.`, "warning");
  }
}

function advanceWorkflowStepAfterDecision(currentStep) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (sub) {
    if (!sub.completedSteps) sub.completedSteps = [];
    if (!sub.completedSteps.includes(currentStep)) sub.completedSteps.push(currentStep);
    sub.currentStep = currentStep + 1;

    if (sub.currentStep === 2) sub.statusText = "Clearance Check";
    else if (sub.currentStep === 3) sub.statusText = "Data Enrichment";
    else if (sub.currentStep === 4) { sub.statusText = "UW Review"; sub.statusBadge = "badge-info"; }
    else if (sub.currentStep === 5 && (sub.exposureVal > sub.authorityLimit)) { sub.statusText = "Senior Referral"; sub.statusBadge = "badge-warning"; }
    else if (sub.currentStep === 6) { sub.statusText = "Ready for Rating"; sub.statusBadge = "badge-success"; }
    else if (sub.currentStep === 7) { sub.statusText = "Quote Generated"; sub.statusBadge = "badge-success"; }
  }

  goToWorkflowStep(currentStep + 1);
  const nextStepObj = WORKFLOW_STEPS.find(s => s.step === currentStep + 1);
  showToast(`Step ${currentStep} Completed! Proceeding to Step ${currentStep + 1}: ${nextStepObj ? nextStepObj.shortTitle : ''}`, "success");
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
}

function goToNextStep() {
  const currentStep = currentWorkflowStep;
  if (currentStep < WORKFLOW_STEPS.length) {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);

    if (!hasPermission("workflow", "approve")) {
      denyPermission("workflow", "approve");
      return;
    }

    if (stepRequiresHumanDecision(currentStep) && sub) {
      openStageDecisionModal(sub, currentStep);
      return; // Wait for explicit human approve/reject via the modal
    }

    // Compliance gate: block entry into Step 7 (Rating Engine / Quote & Bind)
    // for motor-carrier risks that don't yet have USDOT/MC/MCS-90/statutory
    // minimum limits on file — the external rating engine can't properly
    // evaluate the risk without these.
    if (currentStep === 6 && sub) {
      const gaps = getComplianceGapsForRating(sub);
      if (gaps.length > 0) {
        showToast(`⛔ Cannot proceed to Rating & Quote — missing regulatory requirements: ${gaps.join("; ")}.`, "danger");
        return;
      }
    }

    if (sub) {
      if (!sub.completedSteps) sub.completedSteps = [];
      if (!sub.completedSteps.includes(currentStep)) {
        sub.completedSteps.push(currentStep);
      }
      sub.currentStep = currentStep + 1;

      // Update lifecycle status label if advancing
      if (sub.currentStep === 2) sub.statusText = "Clearance Check";
      else if (sub.currentStep === 3) sub.statusText = "Data Enrichment";
      else if (sub.currentStep === 4) { sub.statusText = "UW Review"; sub.statusBadge = "badge-info"; }
      else if (sub.currentStep === 5 && (sub.exposureVal > sub.authorityLimit)) { sub.statusText = "Senior Referral"; sub.statusBadge = "badge-warning"; }
      else if (sub.currentStep === 6) { sub.statusText = "Ready for Rating"; sub.statusBadge = "badge-success"; }
      else if (sub.currentStep === 7) { sub.statusText = "Quote Generated"; sub.statusBadge = "badge-success"; }
    }

    goToWorkflowStep(currentStep + 1);
    const nextStepObj = WORKFLOW_STEPS.find(s => s.step === currentStep + 1);
    showToast(`Step ${currentStep} Completed! Proceeding to Step ${currentStep + 1}: ${nextStepObj ? nextStepObj.shortTitle : ''}`, "success");
    refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
  } else {
    showIntakePage();
    showToast("🎉 Policy Flow Complete! Returned to Submission Intake Queue.", "success");
  }
}

/**
 * Step Backward in Workflow
 */
function goToPrevStep() {
  if (currentWorkflowStep > 1) {
    goToWorkflowStep(currentWorkflowStep - 1);
  } else {
    showIntakePage();
  }
}

function navigateStep(direction) {
  if (direction > 0) {
    goToNextStep();
  } else {
    goToPrevStep();
  }
}

function navigateStep(direction) {
  if (direction > 0) {
    goToNextStep();
  } else {
    goToPrevStep();
  }
}

// ============================================================================
