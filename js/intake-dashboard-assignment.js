// 5. SCREEN 1: SUBMISSIONS TABLE & PRIORITY QUEUE WORKSPACE
// ============================================================================
// ============================================================================
// ROLE-SPECIFIC DASHBOARD — "System Checks Who Got the Task → User Gets
// Their Own Dashboard → Dashboard Shows Only What That User Needs to Do."
// Three distinct dashboard shapes, not the same view re-filtered:
//  - Manager tier (Senior UW, CUO, Head of Binding Ops, Admin): assignment
//    cockpit — who needs work handed to them, team workload balance.
//  - Worker tier (Assistant, Junior): a personal "my work" queue with a
//    single highlighted next action, not a general-purpose table.
//  - Auditor: read-only compliance snapshot, no action affordances at all.
// ============================================================================
/** Create / Import are available to the Head of Underwriting alone, at all times (not only when the queue is empty). */
function intakeToolbarHtml() {
  if (!canCreateSubmissions()) return "";
  return `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
      <button class="btn btn-primary" id="btnCreateSubmission" onclick="openNewIntakeModal()"><i class="ph ph-file-plus"></i> Create New Submission</button>
      <button class="btn btn-outline" id="btnImportEmail" onclick="openEmailDigestModal()"><i class="ph ph-envelope-open"></i> Import from Email</button>
    </div>`;
}

/** A pending authority referral puts the case on the desk of the role that must decide it, without anyone assigning it. */
function referredToRole(sub, role) {
  return !!(sub && sub.authorityRef && sub.authorityRef.status === "pending" && sub.authorityRef.requiredRole === role);
}
/** One definition of "referral" for the tab, its count and the row badge: an authority referral is needed or the status says Referral. Priority P1 is urgency, not a referral. */
function isReferralCase(sub) { return !!sub && (authNeedsReferral(sub) || referralPending(sub) || String(sub.statusText || "").includes("Referral")); }
/** A tracked referral that nobody has decided yet. */
function referralPending(sub) { return !!(sub && sub.authorityRef && sub.authorityRef.status === "pending"); }
/** Badge beside the insured: "Referred to you" for the person who must decide, "Awaiting <name>" for everyone else. */
function referralBadgeHtml(sub) {
  if (referralPending(sub)) {
    if (referredToRole(sub, currentUserRole)) return '<span class="badge badge-danger text-xs" style="font-size: 10px; margin-left: 4px;"><i class="ph ph-arrow-fat-line-right"></i> Referred to you</span>';
    return '<span class="badge badge-warning text-xs" style="font-size: 10px; margin-left: 4px;"><i class="ph ph-hourglass-medium"></i> Awaiting ' + authEsc(authRoleOwnerName(sub.authorityRef.requiredRole)) + '</span>';
  }
  return '<span class="badge badge-warning text-xs" style="font-size: 10px; margin-left: 4px;"><i class="ph ph-user"></i> Referral</span>';
}
/** Hours a pending referral has been waiting, as a short label. */
function referralAgeLabel(ref) {
  const t = Date.parse(String(ref && ref.raisedAt || "").replace(" ", "T"));
  if (isNaN(t)) return "\u2014";
  const h = Math.max(0, Math.round((Date.now() - t) / 3600000));
  return h < 48 ? h + " h" : Math.round(h / 24) + " d";
}
function isMyCase(sub) { return sub.assignedTo === currentUserRole || referredToRole(sub, currentUserRole); }

function renderRoleDashboard() {
  const container = document.getElementById("roleDashboardContainer");
  const titleEl = document.getElementById("intakeDashboardTitle");
  const subtitleEl = document.getElementById("intakeDashboardSubtitle");
  if (!container) return;

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;

  const screen1 = document.getElementById("screen-1");
  if (screen1) screen1.classList.toggle("is-worker-view", !canManageAssignments());
  if (canManageAssignments()) {
    if (titleEl) titleEl.textContent = "Assignment Dashboard";
    if (subtitleEl) subtitleEl.textContent = `${roleConfig.name} • ${roleConfig.title}`;
    container.innerHTML = intakeToolbarHtml() + renderManagerDashboardHtml();
  } else {
    if (titleEl) titleEl.textContent = "My Work Queue";
    if (subtitleEl) subtitleEl.textContent = `${roleConfig.name} • ${roleConfig.title}`;
    container.innerHTML = intakeToolbarHtml() + renderWorkerDashboardHtml();
  }
}

function renderManagerDashboardHtml() {
  // Only real submissions (Integrating API / Email Intake, apiSourced: true)
  // — the hardcoded seed/golden-path demo dataset never appears here.
  const liveSubmissions = SUBMISSIONS_DATASET.filter(s => s.apiSourced);
  // Workload overview covers every team member, not just the "Assignable
  // User" roster — Admin can assign a submission to ANY team member, so
  // their workload summary must be able to show anyone's caseload too.
  const allRoles = Object.keys(USER_ROLES_CONFIG);
  const byAssignee = {};
  allRoles.forEach(rk => { byAssignee[rk] = liveSubmissions.filter(s => s.assignedTo === rk); });

  // "Needs Assignment" (with its own inline dropdown) has been removed —
  // assignment now happens from the "Assigned To" column of the main
  // submissions table via the Assign Submission modal, so this duplicate
  // pending-assignment widget is redundant.
  const workloadCards = allRoles.map(rk => {
    const r = USER_ROLES_CONFIG[rk];
    const subs = byAssignee[rk];
    const active = subs.filter(s => (s.currentStep || 1) < QUOTE_STEP).length;
    return `
      <div class="metric-box">
        <span class="lbl"><i class="ph ph-user-circle"></i> ${r.name} (${r.title.split(' (')[0]})</span>
        <strong class="val">${subs.length} Assigned <span class="text-xs text-muted">(${active} active)</span></strong>
      </div>`;
  }).join("");

  // Per-team-member workload cards (Emily Watson, Sarah Jenkins, David Chen,
  // etc.) expose everyone's individual caseload — restricted to the System
  // Administrator persona only, not every manager-tier role that can see
  // this dashboard (Senior UW, CUO, Binding Ops also land here).
  const workloadCardsSection = "";

  // Referrals: what is waiting on someone's decision, who has to decide it, and for how long.
  const pendingRefs = liveSubmissions.filter(referralPending);
  const decidedRefs = liveSubmissions.filter(s => s.authorityRef && s.authorityRef.status !== "pending");
  const referralsSection = (pendingRefs.length || decidedRefs.length) ? `
    <div class="card" id="referralOverviewCard">
      <div class="card-header">
        <h3><i class="ph ph-paper-plane-tilt"></i> Referrals (${pendingRefs.length} awaiting decision)</h3>
        <span class="text-xs text-muted">${decidedRefs.length} decided</span>
      </div>
      <div class="card-body p-0">
        ${pendingRefs.length ? `<div class="table-responsive"><table class="data-table">
          <thead><tr><th>Submission</th><th>Insured</th><th>Referred to</th><th>Raised by</th><th>Waiting</th><th>Why</th><th></th></tr></thead>
          <tbody>${pendingRefs.map(sub => {
            const ref = sub.authorityRef;
            return `<tr onclick="openCaseAtCurrentStep('${sub.id}')" style="cursor:pointer;">
              <td><span class="badge badge-light font-mono">${sub.id}</span></td>
              <td>${authEsc(sub.insured)}</td>
              <td><strong>${authEsc(authRoleOwner(ref.requiredRole))}</strong></td>
              <td>${authEsc(ref.raisedBy)}</td>
              <td>${referralAgeLabel(ref)}</td>
              <td class="text-xs">${authEsc(String(ref.note || "").slice(0, 110))}</td>
              <td><button class="btn-action-view btn-action-primary" onclick="event.stopPropagation(); openCaseAtCurrentStep('${sub.id}');"><i class="ph ph-eye"></i> View</button></td>
            </tr>`;
          }).join("")}</tbody></table></div>` : `<p class="text-sm text-muted" style="margin:12px 16px;">No referral is waiting for a decision.</p>`}
      </div>
    </div>` : "";

  // "Assigned to Me" — every manager-tier persona (Senior UW, CUO, Admin)
  // sees, right here on their own Assignment Dashboard, exactly the
  // submissions assigned to them. This appears the moment
  // assignSubmissionToUser() runs (it already calls renderRoleDashboard()
  // right after saving the assignment) — no separate refresh needed.
  //
  // Assignment and authority are two different things: a submission stays
  // listed here even if its exposure exceeds this role's authority limit —
  // it is never hidden or removed for that reason. Instead each row shows
  // an "Exceeds Authority" badge so the CUO can see it and take the
  // required escalation/referral action, rather than the case silently
  // disappearing from view.
  const myAssigned = liveSubmissions.filter(s => s.assignedTo === currentUserRole);
  const myAssignedSection = myAssigned.length ? `
    <div class="card">
      <div class="card-header">
        <h3><i class="ph ph-user-focus"></i> Assigned to Me (${myAssigned.length})</h3>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Submission</th><th>Insured</th><th>LOB</th><th>Exposure</th><th>Authority Status</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              ${myAssigned.map(sub => {
                const roleConfig = USER_ROLES_CONFIG[currentUserRole] || {};
                const cover = authRoleCovers(currentUserRole, authMeasures(sub));
                const overLimit = !cover.ok;
                const authorityBadge = overLimit
                  ? `<span class="badge badge-danger text-xs" title="${cover.reasons.join("; ").replace(/"/g, '&quot;')}"><i class="ph ph-warning"></i> Exceeds Authority — Refer/Escalate</span>`
                  : `<span class="badge badge-success text-xs"><i class="ph ph-check-circle"></i> Within Authority</span>`;
                return `
                <tr onclick="openCaseAtCurrentStep('${sub.id}')" style="cursor:pointer;">
                  <td><span class="badge badge-light font-mono">${sub.id}</span></td>
                  <td>${sub.insured}</td>
                  <td>${sub.lobName}</td>
                  <td class="font-mono">${sub.exposure}</td>
                  <td>${authorityBadge}</td>
                  <td>${sub.statusText}</td>
                  <td><button class="btn-action-view btn-action-primary" onclick="event.stopPropagation(); openCaseAtCurrentStep('${sub.id}');"><i class="ph ph-eye"></i> View</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>` : "";

  // First-time / freshly-provisioned desk: nothing has been ingested yet.
  // Point the manager straight at the three ways a submission can enter
  // the pipeline instead of showing an all-zero dashboard with no next step.
  const gettingStartedSection = liveSubmissions.length === 0 ? `
    <div class="card" style="border-color:#93c5fd; background:#eff6ff;">
      <div class="card-body">
        <h3 style="margin:0 0 4px;"><i class="ph ph-rocket-launch"></i> Get Started — No Submissions Yet</h3>
        <p class="text-sm text-muted" style="margin:0;">Nothing has been ingested into this desk yet. ${canCreateSubmissions() ? "Use Create New Submission or Import from Email above to bring in the first case." : "The Head of Underwriting creates or imports cases and assigns them; yours will appear here."}</p>
      </div>
    </div>` : "";

  return `
    <div style="display:flex; flex-direction:column; gap:var(--space-5);">
      ${gettingStartedSection}
      ${referralsSection}
      ${workloadCardsSection}
      ${myAssignedSection}
    </div>
  `;
}

function renderWorkerDashboardHtml() {
  const mine = SUBMISSIONS_DATASET.filter(s => s.apiSourced && isMyCase(s));
  const notStarted = mine.filter(s => (s.currentStep || 1) === 1 && (!s.completedSteps || s.completedSteps.length === 0));
  const inProgress = mine.filter(s => (s.currentStep || 1) > 1 && (s.currentStep || 1) < QUOTE_STEP);
  const readyToQuote = mine.filter(s => (s.currentStep || 1) >= QUOTE_STEP && (s.currentStep || 1) <= BIND_STEP);
  const referredToMe = mine.filter(s => referredToRole(s, currentUserRole));
  const awaitingDecision = mine.filter(s => referralPending(s) && !referredToRole(s, currentUserRole));

  // Single highest-priority item to act on next — a worker dashboard
  // surfaces ONE next action, not a table to triage themselves.
  const pOrder = { P1: 1, P2: 2, P3: 3, P4: 4 };
  const next = (referredToMe.length ? referredToMe : mine).slice().sort((a, b) => (pOrder[a.priority] || 9) - (pOrder[b.priority] || 9))[0];
  const nextStepObj = next ? (WORKFLOW_STEPS.find(w => w.step === (next.currentStep || 1)) || WORKFLOW_STEPS[0]) : null;

  const nextActionCard = next ? `
    <div class="card mb-2" style="border-color:#93c5fd; background:#eff6ff;">
      <div class="card-body" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
        <div>
          <span class="text-xs text-muted"><i class="ph ph-arrow-right"></i> ${referredToRole(next, currentUserRole) ? "REFERRED TO YOU: DECISION NEEDED" : "YOUR NEXT ACTION"}</span>
          <h3 style="margin:2px 0;">${next.insured} <code class="font-mono text-xs">${next.id}</code></h3>
          <span class="text-sm text-muted">${nextStepObj.title} — Stage ${stageOfStep(next.currentStep || 1)} of ${WORKFLOW_STAGES.length}</span>
        </div>
        <button class="btn btn-primary" onclick="openCaseAtCurrentStep('${next.id}')"><i class="ph ph-arrow-right"></i> ${referredToRole(next, currentUserRole) ? "Review & Decide" : "Continue Work"}</button>
      </div>
    </div>` : "";

  const referredCard = referredToMe.length ? `
    <div class="card mb-2" style="border-color:#fca5a5; background:#fef2f2;">
      <div class="card-body">
        <h3 style="margin:0 0 6px;"><i class="ph ph-arrow-fat-line-right"></i> Referred to you (${referredToMe.length})</h3>
        ${referredToMe.map(r => `<div class="text-sm" style="margin:4px 0;"><strong>${authEsc(r.insured)}</strong> <code class="font-mono text-xs">${r.id}</code> from ${authEsc(String(r.authorityRef.raisedBy || "").split(" (")[0])}, ${referralAgeLabel(r.authorityRef)} ago: <span class="text-muted">${authEsc(String(r.authorityRef.note || "").slice(0, 120))}</span> <a href="#" onclick="openCaseAtCurrentStep('${r.id}'); return false;">Review &amp; decide</a></div>`).join("")}
      </div>
    </div>` : "";

  // Brand-new / not-yet-assigned worker: nothing has been handed to them
  // yet. Say so plainly instead of showing an all-zero metrics row with no
  // explanation of what happens next.
  const noWorkYetCard = mine.length === 0 ? `
    <div class="card mb-2" style="border-color:#fcd34d; background:#fffbeb;">
      <div class="card-body">
        <h3 style="margin:0 0 4px;"><i class="ph ph-user-focus"></i> No Work Assigned Yet</h3>
        <p class="text-sm text-muted" style="margin:0;">You have no submissions assigned to you yet. Once a submission is ingested and your Underwriting Manager assigns it to you, it will appear here as your next action.</p>
      </div>
    </div>` : "";

  return `
    ${referredCard}
    ${nextActionCard}
    ${noWorkYetCard}
    <div class="metrics-summary-bar">
      <div class="metric-box"><span class="lbl"><i class="ph ph-tray"></i> Total Assigned to Me</span><strong class="val">${mine.length}</strong></div>
      <div class="metric-box"><span class="lbl"><i class="ph ph-circle"></i> Not Started</span><strong class="val text-muted">${notStarted.length}</strong></div>
      <div class="metric-box"><span class="lbl"><i class="ph ph-hourglass-medium text-warning"></i> In Progress</span><strong class="val text-warning">${inProgress.length}</strong></div>
      <div class="metric-box"><span class="lbl"><i class="ph ph-file-text text-primary"></i> Ready to Quote</span><strong class="val text-primary">${readyToQuote.length}</strong></div>
      <div class="metric-box"><span class="lbl"><i class="ph ph-arrow-fat-line-right text-danger"></i> Referred to Me</span><strong class="val">${referredToMe.length}</strong></div>
      <div class="metric-box"><span class="lbl"><i class="ph ph-hourglass-medium text-warning"></i> Awaiting a Decision</span><strong class="val">${awaitingDecision.length}</strong></div>
    </div>
  `;
}

window.renderRoleDashboard = renderRoleDashboard;

function renderSubmissionsTable() {
  const tbody = document.getElementById("submissionsTableBody");
  if (!tbody) return;

  // 0. The Submission Intake queue shows only real submissions — ones that
  // actually came in through the Integrating API (product ingestion) or
  // Email Intake (apiSourced: true). The hardcoded seed/golden-path demo
  // dataset never appears here, even if it's loaded in the background for
  // other purposes (e.g. an Email Intake normalization template).
  const liveSubmissions = SUBMISSIONS_DATASET.filter(sub => sub.apiSourced);

  // 1. Filter dataset by selected LOB from LOB Switcher
  const filteredByLOB0 = liveSubmissions.filter(sub => {
    return (currentLOBFilter === "all" || !currentLOBFilter) ? true : sub.lobKey === currentLOBFilter;
  });

  // 1b. Assignment-based visibility — "No Assignment → No Underwriting."
  // Manager-tier personas (Senior UW, CUO, Admin) see everything, including
  // Unassigned work awaiting their action. Worker-tier personas only see
  // submissions assigned to them; unassigned work is invisible to a worker
  // until a manager hands it to them.
  const isManagerView = canManageAssignments();
  // External and oversight personas (js/external-access.js) are scoped by agency, program or carrier, not by assignment.
  const scopedByRole = typeof extUsesScopeNotAssignment === "function" && extUsesScopeNotAssignment(currentUserRole);
  const filteredByLOB = (isManagerView || scopedByRole)
    ? filteredByLOB0
    : filteredByLOB0.filter(sub => isMyCase(sub));

  // 2. Filter by Channel Type tab (All / Broker / Direct / Referrals) and Search Query
  let filtered = filteredByLOB.filter(sub => {
    let matchChannel = true;
    if (currentTableFilter === "broker") matchChannel = sub.channelType === "broker";
    else if (currentTableFilter === "direct") matchChannel = sub.channelType === "direct";
    else if (currentTableFilter === "referral") matchChannel = isReferralCase(sub);

    const term = currentSearchTerm.toLowerCase();
    const matchSearch = term === "" ||
      [sub.insured, sub.id, sub.fein, sub.broker, sub.lobName].some(v => String(v || "").toLowerCase().includes(term));

    return matchChannel && matchSearch;
  });

  // 3. Apply Queue Sorting (Priority / FIFO Arrival / Exposure)
  filtered.sort((a, b) => {
    if (currentQueueSort === "fifo") {
      return a.receivedTimestamp - b.receivedTimestamp; // Earliest timestamp first (First-In, First-Out)
    } else if (currentQueueSort === "exposure") {
      return b.exposureVal - a.exposureVal; // Highest exposure dollar value first
    } else {
      // Default: Priority & SLA (P1 > P2 > P3 > P4, then highest score)
      const pOrder = { "P1": 1, "P2": 2, "P3": 3, "P4": 4 };
      const diff = (pOrder[a.priority] || 99) - (pOrder[b.priority] || 99);
      if (diff !== 0) return diff;
      return (b.priorityScore || 0) - (a.priorityScore || 0);
    }
  });

  // 4. Update summary metrics cards for the active LOB
  const total = filteredByLOB.length;
  const brokerCount = filteredByLOB.filter(s => s.channelType === "broker").length;
  const directCount = filteredByLOB.filter(s => s.channelType === "direct").length;
  const referralCount = filteredByLOB.filter(isReferralCase).length;
  
  const elTotal = document.getElementById("countTotalSubs");
  const elBroker = document.getElementById("countBrokerSubs");
  const elDirect = document.getElementById("countDirectSubs");
  const elPipe = document.getElementById("countPipelineSubs");
  
  if (elTotal) elTotal.textContent = `${total} Case${total === 1 ? '' : 's'} (${currentLOBFilter.toUpperCase()})`;
  if (elBroker) elBroker.textContent = `${brokerCount} Submissions (${total > 0 ? Math.round((brokerCount/total)*100) : 0}%)`;
  if (elDirect) elDirect.textContent = `${directCount} Submissions (${total > 0 ? Math.round((directCount/total)*100) : 0}%)`;
  if (elPipe) elPipe.textContent = `${total} Normalized`;

  // 5. Update tab counts
  const tabAll = document.getElementById("tabFilterAll");
  const tabBroker = document.getElementById("tabFilterBroker");
  const tabDirect = document.getElementById("tabFilterDirect");
  const tabReferrals = document.getElementById("tabFilterReferrals");
  if (tabAll) tabAll.textContent = `All Submissions (${total})`;
  if (tabBroker) tabBroker.innerHTML = `<i class="ph ph-briefcase"></i> Broker Intake (${brokerCount})`;
  if (tabDirect) tabDirect.innerHTML = `<i class="ph ph-user"></i> Direct Customer (${directCount})`;
  if (tabReferrals) tabReferrals.innerHTML = `<i class="ph ph-user-check text-warning"></i> Senior Referrals (${referralCount})`;

  // 6. Render Table Rows
  if (filtered.length === 0) {
    let emptyMsg = "No submissions found for the selected LOB filter and channel criteria.";
    let emptyIcon = "ph-tray";
    let emptyAction = "";
    if (liveSubmissions.length === 0) {
      emptyMsg = isManagerView
        ? "No submissions have been ingested yet. Use the \"Get Started\" panel above to ingest your first product, create a submission, or import an email."
        : "No submissions exist yet. Once your Underwriting Manager ingests and assigns one, it will appear here.";
      emptyIcon = "ph-tray";
    } else if (!isManagerView) {
      emptyMsg = "You have no submissions assigned to you yet. Ask your Underwriting Manager to assign one from the Intake Queue.";
      emptyIcon = "ph-user-focus";
    }
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding: 0; border: none;">
          <div style="position: sticky; left: 50%; transform: translateX(-50%); width: max-content;">
            <div class="empty-state">
              <i class="ph ${emptyIcon} empty-state-icon"></i>
              <div class="empty-state-body">${emptyMsg}</div>
              ${emptyAction}
            </div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(sub => {
    const isSelected = sub.id === activeSubmissionId;
    const channelBadge = sub.channelType === "broker" 
      ? `<span class="channel-tag channel-broker"><i class="ph ph-briefcase"></i> ${String(sub.broker || 'Unknown').split(' ')[0]} (Broker)</span>`
      : `<span class="channel-tag channel-direct"><i class="ph ph-user"></i> Direct Portal</span>`;

    // Priority badge class
    let pClass = "badge-priority-p3";
    let pIcon = "ph-clock";
    if (sub.priority === "P1") { pClass = "badge-priority-p1"; pIcon = "ph-fire"; }
    else if (sub.priority === "P2") { pClass = "badge-priority-p2"; pIcon = "ph-lightning"; }

    const isReferral = isReferralCase(sub);

    const actionBtn = (referredToRole(sub, currentUserRole) || (currentUserRole === "senior" && isReferral))
      ? `<button class="btn-action-view btn-action-referral" onclick="event.stopPropagation(); openCaseAtCurrentStep('${sub.id}');"><i class="ph ph-scales"></i> Review</button>`
      : `<button class="btn-action-view btn-action-primary" onclick="event.stopPropagation(); openCaseAtCurrentStep('${sub.id}');"><i class="ph ph-eye"></i> View</button>`;

    const assigneeRole = sub.assignedTo ? (USER_ROLES_CONFIG[sub.assignedTo] || null) : null;
    const assigneeChip = assigneeRole
      ? `<span class="badge badge-info"><i class="ph ph-user-circle"></i> ${assigneeRole.name}</span>`
      : `<span class="badge badge-secondary"><i class="ph ph-user-minus"></i> Unassigned</span>`;
    const assignCell = !isManagerView ? assigneeChip : `
      <div class="qi-assign">
        ${assigneeChip}
        <button class="btn btn-xs btn-outline" onclick="openAssignSubmissionModal('${sub.id}')" title="${sub.assignedTo ? 'Reassign' : 'Assign'}" aria-label="${sub.assignedTo ? 'Reassign' : 'Assign'} ${sub.id}">
          <i class="ph ph-user-switch"></i>
        </button>
      </div>`;
    const vCount = getSubmissionDataVersionCount(sub);
    const missingCount = getOutstandingMissingCount(sub);
    const parts = String(sub.receivedAt || "").split(' ');
    const receivedLabel = parts.length >= 3 ? `${parts[1]} ${parts[2]}` : (sub.receivedAt || "—");

    return `
      <tr class="${isSelected ? 'active-row' : ''} ${isReferral ? 'referral-row' : ''}" onclick="openCaseAtCurrentStep('${sub.id}')">
        <td>
          <span class="badge-priority ${pClass}">
            <i class="ph ${pIcon}"></i> ${sub.priority} • ${String(sub.slaText || '—').split(' ')[0]}
          </span>
        </td>
        <td>
          <strong class="font-mono text-primary">${sub.id}</strong>
          <div class="qi-sub">${channelBadge}</div>
        </td>
        <td>
          <strong>${sub.insured}</strong>
          ${isReferral ? referralBadgeHtml(sub) : ''}
          <div class="text-secondary text-sm">FEIN: ${sub.fein || "—"} • Score: ${(typeof sub.priorityScore === "number") ? sub.priorityScore + "/100" : "Pending"}</div>
          <div class="qi-sub"><span class="badge badge-light">${sub.lobName}</span>${sub.underwriter ? ` <span class="text-xs text-muted"><i class="ph ph-user-circle"></i> ${sub.underwriter}</span>` : ''}</div>
        </td>
        <td>
          <div class="qi-pair">
            ${(sub.docs && sub.docs.length > 0) ? `
            <button class="btn-table-docs" onclick="event.stopPropagation(); openDocsManagerModal('${sub.id}');" title="View all ${sub.docs.length} attached documents & PDF previews">
              <i class="ph ph-folder-open text-primary"></i>
              <span>Docs</span>
              <span class="doc-badge-count">${sub.docs.length}</span>
            </button>` : `
            <span class="text-xs text-muted" style="font-style:italic;"><i class="ph ph-folder-dashed"></i> No documents</span>`}
            <button class="btn-table-docs" onclick="event.stopPropagation(); openSubmissionVersionHistoryModal('${sub.id}');" title="Submission data version history${missingCount > 0 ? ` — ${missingCount} item(s) still outstanding` : ''}">
              <i class="ph ph-stack text-primary"></i>
              <span>Versions</span>
              <span class="doc-badge-count">${vCount}</span>
            </button>
            ${missingCount > 0 ? `<span class="badge badge-danger" style="font-size:10px;">${missingCount} Missing</span>` : ''}
          </div>
        </td>
        <td>
          <small class="text-muted sub-received"><i class="ph ph-clock"></i> ${receivedLabel}</small>
        </td>
        <td onclick="event.stopPropagation();">
          <span class="badge ${sub.statusBadge || 'badge-light'}">${sub.statusText || '—'}</span>
          <button class="btn btn-xs ${sub.quoteIssued ? 'btn-outline' : 'btn-outline disabled'}" style="margin-top:4px;"
            ${sub.quoteIssued ? `onclick="viewIssuedQuote('${sub.id}')"` : "disabled"}
            title="${sub.quoteIssued ? 'View the issued quote' : 'Quote has not been issued to the broker/customer yet'}">
            <i class="ph ph-file-text"></i> View Quote
          </button>
        </td>
        <td onclick="event.stopPropagation();">
          ${assignCell}
        </td>
        <td class="u-text-right">
          ${actionBtn}
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * Manager-tier action: assigns (or reassigns) a submission to a working
 * underwriter. This is the gate the whole "No JSON → No Submission → No
 * Assignment → No Underwriting" flow depends on — a worker-tier persona
 * cannot see or open a submission until this has been called.
 */
function assignSubmissionToUser(subId, roleKey) {
  if (!canManageAssignments()) {
    denyPermission("workflow", "approve");
    renderSubmissionsTable(); // revert the <select> back to its prior state
    return;
  }
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  if (!roleKey) {
    // "— Assign to —" placeholder re-selected: unassign.
    sub.assignedTo = null;
    sub.assignedBy = null;
    sub.assignedAt = null;
    showToast(`↩️ ${subId} returned to Unassigned.`, "info");
  } else {
    const assigneeConfig = USER_ROLES_CONFIG[roleKey];
    const assignerConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.admin;
    sub.assignedTo = roleKey;
    sub.assignedBy = `${assignerConfig.name} (${assignerConfig.title})`;
    sub.assignedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

    if (!sub.decisionLog) sub.decisionLog = [];
    sub.decisionLog.push({
      step: sub.currentStep || 1,
      decision: "assigned",
      by: sub.assignedBy,
      at: sub.assignedAt,
      notes: `Submission assigned to ${assigneeConfig.name} (${assigneeConfig.title}).`
    });

    showToast(`✅ ${subId} assigned to ${assigneeConfig.name}.`, "success");
  }

  renderSubmissionsTable();
  renderRoleDashboard();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
}
window.assignSubmissionToUser = assignSubmissionToUser;

// ============================================================================
// ASSIGN SUBMISSION MODAL — replaces the old inline <select> in the
// submissions table's "Assigned To" column with a proper popup: pick a
// team member from a clean list, confirm, and the chip in the table updates
// immediately. Delegates the actual assignment to assignSubmissionToUser()
// unchanged, so the underlying logic (permission check, decision log,
// Needs Assignment refresh, persistence) is exactly as before.
// ============================================================================
let assignSubmissionModalSubId = null;
let assignSubmissionModalSelectedRole = null;
let assignSubmissionModalActiveTab = "unassigned"; // "assigned" | "unassigned"

function openAssignSubmissionModal(subId) {
  if (!canManageAssignments()) {
    denyPermission("workflow", "approve");
    return;
  }
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  assignSubmissionModalSubId = subId;
  assignSubmissionModalSelectedRole = sub.assignedTo || null;
  // Land on whichever tab the current assignee (if any) actually belongs
  // to, so opening the modal on an already-assigned submission doesn't
  // hide who it's assigned to behind the wrong tab.
  assignSubmissionModalActiveTab = "unassigned";
  if (assignSubmissionModalSelectedRole) {
    const { assignedRoles } = getAssignSubmissionModalRoleGroups();
    assignSubmissionModalActiveTab = assignedRoles.includes(assignSubmissionModalSelectedRole) ? "assigned" : "unassigned";
  }

  const subtitleEl = document.getElementById("assignHubSubtitle");
  if (subtitleEl) subtitleEl.textContent = `Assign — ${sub.insured} (${sub.id})`;

  renderAssignSubmissionModalOptions();

  openAssignHubModal();
  switchAssignHubTab("submission");
}
window.openAssignSubmissionModal = openAssignSubmissionModal;

function closeAssignSubmissionModal() {
  closeAssignHubModal();
  assignSubmissionModalSubId = null;
  assignSubmissionModalSelectedRole = null;
}
window.closeAssignSubmissionModal = closeAssignSubmissionModal;

// ----------------------------------------------------------------------------
// ASSIGNMENT & RIGHTS DRAWER SHELL — shared by both Assign Submission and
// Assign Rights (js/audit-intelligence-admin.js). Each of those keeps its
// own open/close function name for backward compatibility (existing
// onclick="openAssignRightsModal(...)" etc. in the Team Roster and
// elsewhere keep working unchanged) — they just delegate to this shared
// shell instead of controlling their own separate modal.
// ----------------------------------------------------------------------------
function openAssignHubModal() {
  const modal = document.getElementById("assignHubModal");
  if (modal) modal.style.display = "flex";
}
window.openAssignHubModal = openAssignHubModal;

function closeAssignHubModal() {
  const modal = document.getElementById("assignHubModal");
  if (modal) modal.style.display = "none";
}
window.closeAssignHubModal = closeAssignHubModal;

function switchAssignHubTab(tab) {
  const tabSubmission = document.getElementById("assignHubTabSubmission");
  const tabRights = document.getElementById("assignHubTabRights");
  const panelSubmission = document.getElementById("assignHubPanelSubmission");
  const panelRights = document.getElementById("assignHubPanelRights");

  if (tabSubmission) tabSubmission.classList.toggle("active", tab === "submission");
  if (tabRights) tabRights.classList.toggle("active", tab === "rights");
  if (panelSubmission) panelSubmission.classList.toggle("u-hidden", tab !== "submission");
  if (panelRights) panelRights.classList.toggle("u-hidden", tab !== "rights");
}
window.switchAssignHubTab = switchAssignHubTab;

function switchAssignSubmissionModalTab(tab) {
  assignSubmissionModalActiveTab = tab;
  renderAssignSubmissionModalOptions();
}
window.switchAssignSubmissionModalTab = switchAssignSubmissionModalTab;

function renderAssignSubmissionModalUnassignRow() {
  const row = document.getElementById("assignSubmissionModalUnassignRow");
  if (!row) return;
  row.innerHTML = `
    <div class="assign-modal-option ${assignSubmissionModalSelectedRole === null ? 'selected' : ''}" onclick="selectAssignSubmissionOption(null)">
      <i class="ph ph-user-minus"></i>
      <span>Unassigned</span>
      ${assignSubmissionModalSelectedRole === null ? '<i class="ph ph-check-circle assign-modal-check"></i>' : ''}
    </div>`;
}

// Splits every candidate team member into two non-overlapping groups —
// those with at least one active submission on their plate right now
// ("Assigned Submission") and those with none ("No Assigned Submission")
// — computed live off real (apiSourced) submissions, counting every
// submission currently assigned to that role (including the one open in
// this modal). This is what makes both tabs reflect the true, current
// assignment status the instant it changes: the moment a submission is
// (re)assigned to someone, they're counted here and move to "Assigned";
// the moment nothing is left assigned to them, they move to "No Assigned".
//
// The "Assignable User" / "Non-Assignable User" restriction (ASSIGNABLE_
// WORKER_ROLES) has no connection to System Admin assignment — the System
// Administrator can assign a submission to ANY team member. That
// restriction only applies to other manager-tier personas (Senior UW,
// CUO) doing the assigning.
function getAssignSubmissionModalRoleGroups() {
  const candidateRoles = currentUserRole === "admin"
    ? Object.keys(USER_ROLES_CONFIG)
    : ASSIGNABLE_WORKER_ROLES;

  const liveSubmissions = SUBMISSIONS_DATASET.filter(s => s.apiSourced);
  const workloadByRole = {};
  candidateRoles.forEach(rk => { workloadByRole[rk] = liveSubmissions.filter(s => s.assignedTo === rk).length; });

  const assignedRoles = candidateRoles.filter(rk => workloadByRole[rk] > 0);
  const unassignedRoles = candidateRoles.filter(rk => workloadByRole[rk] === 0);
  return { workloadByRole, assignedRoles, unassignedRoles };
}

function renderAssignSubmissionModalTabCounts() {
  const { assignedRoles, unassignedRoles } = getAssignSubmissionModalRoleGroups();
  const tabAssigned = document.getElementById("assignModalTabAssigned");
  const tabUnassigned = document.getElementById("assignModalTabUnassigned");
  if (tabAssigned) tabAssigned.innerHTML = `<i class="ph ph-user-circle"></i> Assigned Submission (${assignedRoles.length})`;
  if (tabUnassigned) tabUnassigned.innerHTML = `<i class="ph ph-user-focus"></i> No Assigned Submission (${unassignedRoles.length})`;
}

function renderAssignSubmissionModalOptions() {
  const list = document.getElementById("assignSubmissionModalList");
  if (!list) return;

  renderAssignSubmissionModalUnassignRow();
  renderAssignSubmissionModalTabCounts();

  const tabAssigned = document.getElementById("assignModalTabAssigned");
  const tabUnassigned = document.getElementById("assignModalTabUnassigned");
  if (tabAssigned) tabAssigned.classList.toggle("active", assignSubmissionModalActiveTab === "assigned");
  if (tabUnassigned) tabUnassigned.classList.toggle("active", assignSubmissionModalActiveTab === "unassigned");

  const { workloadByRole, assignedRoles, unassignedRoles } = getAssignSubmissionModalRoleGroups();
  const rolesForTab = assignSubmissionModalActiveTab === "assigned" ? assignedRoles : unassignedRoles;

  if (rolesForTab.length === 0) {
    list.innerHTML = assignSubmissionModalActiveTab === "assigned"
      ? `<div class="text-muted text-sm" style="padding:12px;">No team member currently has an active submission assigned.</div>`
      : `<div class="text-muted text-sm" style="padding:12px;">No team members are currently free — everyone already has at least one submission assigned.</div>`;
    return;
  }

  list.innerHTML = rolesForTab.map(rk => {
    const r = USER_ROLES_CONFIG[rk];
    const isSelected = assignSubmissionModalSelectedRole === rk;
    const count = workloadByRole[rk];
    return `
      <div class="assign-modal-option ${isSelected ? 'selected' : ''}" onclick="selectAssignSubmissionOption('${rk}')">
        <span class="assign-modal-avatar">${r.icon}</span>
        <span>
          <strong>${r.name}</strong>
          <div class="text-xs text-muted">${r.title} • ${count} Assigned</div>
        </span>
        <button type="button" class="btn btn-xs btn-outline" style="margin-left:auto;" title="View/edit ${r.name}'s permissions" onclick="event.stopPropagation(); jumpToAssignRightsFromAssignModal('${rk}');">
          <i class="ph ph-shield-check"></i> Rights
        </button>
        ${isSelected ? '<i class="ph ph-check-circle assign-modal-check"></i>' : ''}
      </div>`;
  }).join("");
}

// Cross-link between the two related "who can do what" actions — Assign
// Submission (who this case goes to) and Assign Rights (what that person
// is permitted to do). Previously these lived in two unrelated places
// (submissions table vs. Team Roster); this lets an admin jump straight
// from picking an assignee to checking/editing their permissions without
// hunting them down in Team Roster separately. Each modal's own render
// logic is untouched — this only closes one and opens the other.
function jumpToAssignRightsFromAssignModal(roleKey) {
  // Same drawer now — just switch tabs and populate the Rights panel for
  // this person, no need to close and reopen a separate modal.
  if (typeof openAssignRightsModal === "function") {
    openAssignRightsModal(`u_${roleKey}`);
  }
}
window.jumpToAssignRightsFromAssignModal = jumpToAssignRightsFromAssignModal;

function selectAssignSubmissionOption(roleKey) {
  assignSubmissionModalSelectedRole = roleKey;
  renderAssignSubmissionModalOptions();
}
window.selectAssignSubmissionOption = selectAssignSubmissionOption;

function confirmAssignSubmissionModal() {
  if (!assignSubmissionModalSubId) return;

  const btn = document.getElementById("btnConfirmAssignment");
  const doAssign = () => {
    // Save immediately — assignSubmissionToUser() persists the change and
    // refreshes the submissions table / role dashboards behind the modal.
    assignSubmissionToUser(assignSubmissionModalSubId, assignSubmissionModalSelectedRole || "");

    // Close the popup automatically the moment the assignment is confirmed
    // — no manual X/Close click required.
    closeAssignSubmissionModal();
  };

  if (typeof withButtonLoading === "function") {
    withButtonLoading(btn, "Assigning...", doAssign, 350);
  } else {
    doAssign();
  }
}
window.confirmAssignSubmissionModal = confirmAssignSubmissionModal;

function filterSubmissionsTable(filterType) {
  currentTableFilter = filterType;
  const tabAll = document.getElementById("tabFilterAll");
  const tabBroker = document.getElementById("tabFilterBroker");
  const tabDirect = document.getElementById("tabFilterDirect");
  const tabReferrals = document.getElementById("tabFilterReferrals");

  if (tabAll) tabAll.classList.toggle("active", filterType === "all");
  if (tabBroker) tabBroker.classList.toggle("active", filterType === "broker");
  if (tabDirect) tabDirect.classList.toggle("active", filterType === "direct");
  if (tabReferrals) tabReferrals.classList.toggle("active", filterType === "referral");

  renderSubmissionsTable();
}

function searchSubmissionsTable() {
  const input = document.getElementById("tableSearchInput");
  currentSearchTerm = input ? input.value : "";
  renderSubmissionsTable();
}

function selectSubmission(id, autoNavigate = false) {
  activeSubmissionId = id;
  const sub = SUBMISSIONS_DATASET.find(s => s.id === id);
  if (!sub) return;

  // Per-submission rating-import state: each submission carries its own
  // isQuoteImported/importedRatingData now (see applyImportedRatingDataToSubmission
  // and toggleStep7View, which persist onto sub.* as well as the globals
  // below). Switching the active submission must re-sync those globals from
  // *this* submission's own stored state — otherwise Submission B would show
  // Submission A's imported quote after switching, which is what this fixes.
  isQuoteImported = !!sub.isQuoteImported;
  currentImportedRatingData = sub.importedRatingData || null;

  // Sync Top Header & LOB selector if needed
  const subName = document.getElementById("activeSubName");
  const subLOB = document.getElementById("activeSubLOBBadge");
  const subId = document.getElementById("activeSubIdBadge");
  const lobSelect = document.getElementById("lobSelect");

  if (subName) subName.textContent = sub.insured;
  if (subLOB) subLOB.textContent = sub.lobName.split(' ')[0];
  if (subId) subId.textContent = sub.id;
  
  if (lobSelect && currentLOBFilter !== "all" && lobSelect.value !== sub.lobKey) {
    lobSelect.value = sub.lobKey;
    currentLOBFilter = sub.lobKey;
  }

  // Refresh Table highlights
  renderSubmissionsTable();

  // Populate all downstream screens for this submission (Enrichment, OCR, Rating, PDF)
  renderAllDownstreamScreens(sub);

  if (autoNavigate) {
    goToScreen("screen-2");
    showToast(`Loaded ${sub.insured} into Document Ingestion Pipeline (Screen 2)!`, "success");
  }
}

// Direct Step Flow Navigation: Open case directly at its completed / current workflow step
function openCaseAtCurrentStep(id) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === id);
  if (!sub) return;

  // "No Assignment → No Underwriting" gate — enforced here too, not just via
  // queue visibility, so this can't be bypassed by a direct call, a stale
  // reference, or a future entry point that doesn't go through the table.
  if (!canManageAssignments() && !(typeof extUsesScopeNotAssignment === "function" && extUsesScopeNotAssignment(currentUserRole)) && !isMyCase(sub)) {
    if (!sub.assignedTo) {
      showToast(`⛔ ${sub.id} is Unassigned. Ask the Head of Underwriting to assign it to you before you can begin underwriting.`, "danger");
    } else {
      showToast(`⛔ ${sub.id} is assigned to ${(USER_ROLES_CONFIG[sub.assignedTo] || {}).name || 'another underwriter'}, not you.`, "danger");
    }
    return;
  }

  selectSubmission(id, false);
  const targetStep = sub.currentStep || 1;
  showWorkflowPage(targetStep);
  showToast(`📂 Loaded Case: ${sub.insured} (${sub.id}) at Step ${targetStep}: ${WORKFLOW_STEPS[targetStep - 1].shortTitle}!`, "success");
}

// "View Quote" (Submission Intake table, Flow Status column) — only ever
// reachable once the formal quote has actually been issued to the
// broker/customer (sub.quoteIssued, set by issueQuoteAction()). Before
// that, the button in the table is rendered disabled and this function is
// never wired to an onclick at all, so there is no way to view a quote
// that hasn't been issued yet.
function viewIssuedQuote(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.quoteIssued) return;
  selectSubmission(subId, false);
  showWorkflowPage(QUOTE_STEP);
  if (typeof openViewQuoteSidebar === "function") openViewQuoteSidebar(subId);
  showToast(`📄 Viewing issued quote for ${sub.id}`, "info");
}
window.viewIssuedQuote = viewIssuedQuote;

// Current Preview State
let currentPreviewSubId = null;
let currentPreviewDocIdx = 0;

function previewDocForSubmission(subId, docIdx = 0) {
  currentPreviewSubId = subId;
  previewDocModal(docIdx, subId);
}

function openAllDocsModal(subId) {
  const targetId = subId || activeSubmissionId;
  openDocsManagerModal(targetId, 0);
}

// Modal: Live Document Preview & Multi-Document PDF/Excel Viewer
function previewDocModal(docIdx = 0, subId = null) {
  const targetId = subId || currentPreviewSubId || activeSubmissionId;
  currentPreviewSubId = targetId;
  currentPreviewDocIdx = docIdx;

  const sub = SUBMISSIONS_DATASET.find(s => s.id === targetId);
  if (!sub || !sub.docs || !sub.docs[docIdx]) return;

  const doc = sub.docs[docIdx];
  const modalIcon = document.getElementById("docModalIcon");
  const modalTitle = document.getElementById("docModalTitle");
  const modalMeta = document.getElementById("docModalMeta");
  const modalBody = document.getElementById("docModalBody");
  const modalTabBar = document.getElementById("modalDocTabBar");
  const modalFooterNote = document.getElementById("docModalFooterNote");

  if (modalTitle) modalTitle.textContent = doc.name;
  if (modalMeta) modalMeta.textContent = `Case: ${sub.insured} (${sub.id}) • ${doc.desc} • ${dvStatusText(sub, doc)}`;

  if (modalIcon) {
    modalIcon.className = `doc-icon ${doc.type}`;
    modalIcon.innerHTML = `<i class="ph ${doc.type === 'pdf' ? 'ph-file-pdf' : 'ph-file-xls'}"></i>`;
    if (doc.type === 'pdf') {
      modalIcon.style.background = "#fee2e2";
      modalIcon.style.color = "#dc2626";
    } else {
      modalIcon.style.background = "#dcfce7";
      modalIcon.style.color = "#16a34a";
    }
  }

  // Populate Document Tabs Bar to switch between all attached documents
  if (modalTabBar && sub.docs) {
    modalTabBar.innerHTML = sub.docs.map((d, i) => `
      <button class="modal-doc-tab-btn ${i === docIdx ? 'active' : ''}" onclick="previewDocModal(${i}, '${sub.id}')">
        <i class="ph ${d.type === 'pdf' ? 'ph-file-pdf text-danger' : 'ph-file-xls text-success'}"></i>
        <span>${d.name.length > 28 ? d.name.substring(0, 26) + '...' : d.name}</span>
      </button>
    `).join("");
  }

  if (modalFooterNote) {
    modalFooterNote.innerHTML = `<i class="ph ph-check-circle text-success"></i> Attached to <strong>${sub.insured}</strong> (${sub.id}) • Format: ${doc.type.toUpperCase()} • Schema Validated.`;
  }

  if (!modalBody) return;

  // The file that was attached, not a stand-in drawn from the case's fields (js/document-viewer.js).
  dvRenderInto(modalBody, sub, doc);

  const modal = document.getElementById("docPreviewModal");
  if (modal) modal.classList.add("active");
}

function downloadCurrentPreviewDoc() {
  const targetId = currentHubSubId || currentPreviewSubId || activeSubmissionId;
  const sub = SUBMISSIONS_DATASET.find(s => s.id === targetId);
  const docIdx = (currentHubDocIdx !== undefined && currentHubDocIdx !== null) ? currentHubDocIdx : (currentPreviewDocIdx || 0);
  const doc = sub && sub.docs ? sub.docs[docIdx] : null;
  if (!sub || !doc) return;
  if (dvDownload(sub, doc)) showToast(`📥 Downloaded "${doc.name}".`, "success");
}

function closeDocPreviewModal() {
  const modal = document.getElementById("docPreviewModal");
  if (modal) modal.classList.remove("active");
}

function proceedToNormalizationFromDocModal() {
  closeDocPreviewModal();
  const targetId = currentPreviewSubId || activeSubmissionId;
  const sub = SUBMISSIONS_DATASET.find(s => s.id === targetId);
  if (sub) {
    selectSubmission(sub.id, false);
    sub.currentStep = 1;
    if (sub.statusText.includes("Intake")) {
      sub.statusText = "Ingestion Pipeline";
    }
    renderSubmissionsTable();
    refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
  }
  showWorkflowPage(1);
  showToast(`✅ Loaded ${sub?.insured || 'Submission'} into Document Ingestion Pipeline (Step 1)!`, "success");
}

function printDocPreview() {
  window.print();
}

// ============================================================================
