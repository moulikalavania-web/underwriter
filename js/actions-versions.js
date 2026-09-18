// 7. ACTIONS & USER INTERACTIONS
// ============================================================================
function setExposureScenario(scenario) {
  exposureScenario = scenario;
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (sub) {
    renderAuthorityScreen(sub);
    if (scenario === "exceeds") {
      showToast("Simulated Exposure: Exceeds Primary Underwriter Limit (Senior Referral Triggered)", "warning");
    } else {
      showToast("Simulated Exposure: Within Primary Authority", "success");
    }
  }
}

function triggerDuplicateExit() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (sub) {
    const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
    const nowStamp = new Date().toISOString().slice(0, 16).replace("T", " ");

    sub.lifecycleStatus = "declined";
    sub.lifecycleStatusAt = Date.now();
    sub.declinedBy = `${roleConfig.name} (${roleConfig.title})`;
    sub.declineReason = "Conflicting submission already locked by another broker of record (Duplicate FEIN).";
    sub.declineTriggerPoint = "Duplicate FEIN";
    // Duplicate FEIN declines are routed directly to Senior Underwriter
    // review — a junior-level FEIN mismatch isn't auto-resolved, it needs
    // senior sign-off before a corrected FEIN can be assigned.
    sub.statusText = "Senior Referral";
    sub.statusBadge = "badge-warning";
    sub.isReferral = true;

    if (!sub.decisionLog) sub.decisionLog = [];
    sub.decisionLog.push({
      step: sub.currentStep || 2,
      decision: "declined",
      by: sub.declinedBy,
      at: nowStamp,
      notes: "Declined (Duplicate FEIN): Conflicting submission already locked by another broker of record. Referred directly to Senior Underwriter for resolution."
    });

    DECLINE_LOG.unshift({
      subId: sub.id,
      insured: sub.insured,
      lob: sub.lobName,
      triggerPoint: "Duplicate FEIN",
      reason: "Conflicting submission already locked by another broker of record.",
      at: nowStamp,
      apiSourced: !!sub.apiSourced
    });

    renderSubmissionsTable();
    refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
  }

  showDeclinePage();
  renderDeclineCenter();
  showToast("FEIN Conflict Detected! Submission declined and referred directly to Senior Underwriter for resolution.", "danger");
}

function triggerAppetiteFailureExit() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (sub) {
    const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
    const nowStamp = new Date().toISOString().slice(0, 16).replace("T", " ");

    sub.lifecycleStatus = "declined";
    sub.lifecycleStatusAt = Date.now();
    sub.declinedBy = `${roleConfig.name} (${roleConfig.title})`;
    sub.declineReason = "Risk criteria fall outside carrier underwriting appetite guidelines.";
    sub.declineTriggerPoint = "Appetite Knockout";
    sub.statusText = "Declined";
    sub.statusBadge = "badge-danger";

    if (!sub.decisionLog) sub.decisionLog = [];
    sub.decisionLog.push({
      step: sub.currentStep || 2,
      decision: "declined",
      by: sub.declinedBy,
      at: nowStamp,
      notes: "Declined (Appetite Knockout): Risk criteria fall outside carrier underwriting appetite guidelines."
    });

    DECLINE_LOG.unshift({
      subId: sub.id,
      insured: sub.insured,
      lob: sub.lobName,
      triggerPoint: "Appetite Knockout",
      reason: "Risk criteria fall outside carrier underwriting appetite guidelines.",
      at: nowStamp,
      apiSourced: !!sub.apiSourced
    });

    renderSubmissionsTable();
    refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
  }

  showDeclinePage();
  renderDeclineCenter();
  showToast("Appetite Knockout Triggered! Auto-Decline notice logged in the Decline Center.", "danger");
}

function seniorUWAction(action) {
  const stamp = document.getElementById("signoffStamp");
  const badge = document.getElementById("referralStatusBadge");
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);

  if (action === "approve") {
    if (stamp) {
      stamp.style.display = "block";
      stamp.className = "signoff-stamp mt-3";
      stamp.style.background = "#f0fdf4";
      stamp.style.borderColor = "#10b981";
      stamp.style.color = "#065f46";
      stamp.innerHTML = `<i class="ph ph-stamp"></i> <strong>OFFICIALLY SIGNED OFF BY CUO:</strong> Cleared for Pricing by Marcus Vance (Chief Underwriting Officer) • Authority Delegated to Phase 4`;
    }
    if (badge) {
      badge.className = "badge badge-success";
      badge.textContent = "CUO Sign-Off Complete (Cleared for Pricing)";
    }
    if (sub) {
      sub.statusText = "Ready for Rating";
      sub.statusBadge = "badge-success";
      sub.isReferral = false;
    }
    renderSubmissionsTable();
    refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
    showToast("✍️ Marcus Vance (CUO) granted executive sign-off! Cleared for Pricing (Phase 4).", "success");
  } else if (action === "revise") {
    if (stamp) {
      stamp.style.display = "block";
      stamp.className = "signoff-stamp mt-3";
      stamp.style.background = "#fffbeb";
      stamp.style.borderColor = "#fde68a";
      stamp.style.color = "#92400e";
      stamp.innerHTML = `<i class="ph ph-arrow-counter-clockwise"></i> <strong>REVISION REQUESTED:</strong> Returned to Sarah Jenkins for additional loss warranty validation.`;
    }
    if (badge) {
      badge.className = "badge badge-warning";
      badge.textContent = "Returned for Revision";
    }
    showToast("🔄 Returned to Junior Underwriter (Sarah Jenkins) for revision.", "warning");
  } else {
    if (stamp) {
      stamp.style.display = "block";
      stamp.className = "signoff-stamp mt-3";
      stamp.style.background = "#fef2f2";
      stamp.style.borderColor = "#fecaca";
      stamp.style.color = "#991b1b";
      stamp.innerHTML = `<i class="ph ph-prohibit"></i> <strong>DECLINED BY SENIOR CUO:</strong> Risk exceeds hazard tolerance`;
    }
    goToScreen("screen-9");
    showToast("🚫 Risk declined by Senior Underwriter (Marcus Vance)! Archived in Exit Paths.", "danger");
  }
}

// RFI Modal Handlers
function openRFIModal() {
  const modal = document.getElementById("rfiModal");
  if (modal) modal.classList.add("active");
}

function closeRFIModal() {
  const modal = document.getElementById("rfiModal");
  if (modal) modal.classList.remove("active");
}

function sendRFIAction() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  const recipient = (document.getElementById("rfiRecipientEmail") || {}).value || "";
  const subject = (document.getElementById("rfiSubject") || {}).value || "";
  const message = ((document.getElementById("rfiMessageText") || {}).value || "").replace(/\s+/g, " ").trim();

  if (sub) {
    const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
    if (!sub.decisionLog) sub.decisionLog = [];
    sub.decisionLog.push({
      step: sub.currentStep || 4,
      decision: "rfi_sent",
      by: `${roleConfig.name} (${roleConfig.title})`,
      at: new Date().toISOString().slice(0, 16).replace("T", " "),
      notes: `Sent to ${recipient || "submitter"}. Subject: "${subject}". ${message}`
    });
    refreshAuditLogIfVisible();
  }

  closeRFIModal();
  showToast("RFI Dispatched to Submitter Portal! File status set to 'Pending Information'", "warning");
}

function addNewSubjectivity() {
  const text = prompt("Enter new subjectivity or binding condition:", "Subject to receipt of signed statement of no known losses.");
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (text && sub) {
    sub.subjectivities.push(text);
    renderSubjectivities(sub.subjectivities);

    const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
    if (!sub.decisionLog) sub.decisionLog = [];
    sub.decisionLog.push({
      step: sub.currentStep || 7,
      decision: "subjectivity_added",
      by: `${roleConfig.name} (${roleConfig.title})`,
      at: new Date().toISOString().slice(0, 16).replace("T", " "),
      notes: text
    });
    refreshAuditLogIfVisible();

    showToast("Added new subjectivity condition", "success");
  }
}

// Bind Actions & Policy Issuance
function updateIssuanceRecipientUI() {
  const radioBroker = document.getElementById("radioTargetBroker");
  const radioCust = document.getElementById("radioTargetCustomer");
  const radioBoth = document.getElementById("radioTargetBoth");

  const boxBroker = document.getElementById("targetBrokerBox");
  const boxCust = document.getElementById("targetCustomerBox");
  const boxBoth = document.getElementById("targetBothBox");

  if (boxBroker) boxBroker.classList.toggle("selected", radioBroker && radioBroker.checked);
  if (boxCust) boxCust.classList.toggle("selected", radioCust && radioCust.checked);
  if (boxBoth) boxBoth.classList.toggle("selected", radioBoth && radioBoth.checked);
}

// ----------------------------------------------------------------------------
// E-SIGNATURE — gates Issue Quote & Bind. Nothing is issued/bound until the
// underwriter types their full legal name and confirms the authority
// attestation; the signed name + timestamp are stored on the submission and
// logged to its decision log, same as every other underwriting action.
// ----------------------------------------------------------------------------
function openESignatureModal() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
  const modal = document.getElementById("eSignatureModal");
  const subLabel = document.getElementById("eSigSubLabel");
  const nameInput = document.getElementById("eSigNameInput");
  const checkbox = document.getElementById("eSigAttestCheckbox");
  const timestampPreview = document.getElementById("eSigTimestampPreview");
  if (!modal || !sub) return;

  if (subLabel) subLabel.textContent = `${sub.id} — ${sub.insured || "N/A"}`;
  if (nameInput) nameInput.value = "";
  if (checkbox) checkbox.checked = false;
  if (timestampPreview) timestampPreview.innerHTML = `<i class="ph ph-clock"></i> Will be signed as of: ${new Date().toLocaleString()}`;
  clearFieldError("eSigNameInput");
  clearFieldError("eSigAttestCheckbox");

  modal.style.display = "flex";
}
window.openESignatureModal = openESignatureModal;

function closeESignatureModal() {
  const modal = document.getElementById("eSignatureModal");
  if (modal) modal.style.display = "none";
}
window.closeESignatureModal = closeESignatureModal;

function confirmESignatureAndBind() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
  const nameInput = document.getElementById("eSigNameInput");
  const checkbox = document.getElementById("eSigAttestCheckbox");
  if (!sub) return;

  const signerName = nameInput ? nameInput.value.trim() : "";
  let valid = true;
  if (!signerName) { showFieldError("eSigNameInput"); valid = false; } else { clearFieldError("eSigNameInput"); }
  if (!checkbox || !checkbox.checked) { showFieldError("eSigAttestCheckbox"); valid = false; } else { clearFieldError("eSigAttestCheckbox"); }
  if (!valid) {
    showToast("⛔ Type your full name and confirm the attestation to sign.", "danger");
    return;
  }

  const signedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  sub.eSignature = {
    signerName,
    signedAt,
    role: (USER_ROLES_CONFIG[currentUserRole] || {}).title || currentUserRole,
    attested: true
  };

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: 7,
    decision: "e_signed",
    by: signerName,
    at: signedAt,
    notes: `Electronically signed to issue quote & bind coverage (${sub.eSignature.role}).`
  });

  closeESignatureModal();
  issueQuoteAction();
}
window.confirmESignatureAndBind = confirmESignatureAndBind;

// ----------------------------------------------------------------------------
// ACORD-FORMAT QUOTE DOCUMENT — a structured, printable application-form
// layout (ACORD 137 Commercial Auto style) built only from this
// submission's own real data (Email/JSON-ingested + underwriter actions
// taken on it). Any field the submission never received stays "Not
// Provided" — nothing here is invented to make the form look fuller.
// ----------------------------------------------------------------------------
function acordNP(val) {
  return (val === undefined || val === null || val === "") ? '<span style="color:#94a3b8; font-style:italic;">Not Provided</span>' : val;
}

function renderAcordFormHtml(sub) {
  const gen = sub.genInfo || {};
  const drivers = sub.drivers || [];
  const vehicles = sub.vehicles || [];
  const cov = sub.coveragesInfo || {};
  const coverageRows = sub.coverageRows || [];

  const driverRows = drivers.length ? drivers.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${acordNP((d.given_name || d.last_name) ? `${d.given_name || ''} ${d.last_name || ''}`.trim() : null)}</td>
      <td>${acordNP(d.dob)}</td>
      <td>${acordNP(d.age)}</td>
      <td>${acordNP(d.licenseNumber)}</td>
      <td>${acordNP(d.licensestate)}</td>
      <td>${acordNP(d.licenseclasstype)}</td>
    </tr>`).join("") : `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No drivers on file</td></tr>`;

  const vehicleRows = vehicles.length ? vehicles.map((v, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${acordNP(v.year)}</td>
      <td>${acordNP(v.make)}</td>
      <td>${acordNP(v.model)}</td>
      <td>${acordNP(v.vin)}</td>
      <td>${v.stated_value !== undefined ? `$${Number(v.stated_value).toLocaleString()}` : acordNP(null)}</td>
    </tr>`).join("") : `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No vehicles on file</td></tr>`;

  const coverageRowsHtml = coverageRows.length ? coverageRows.map(r => `
    <tr><td>${acordNP(r.line)}</td><td>${acordNP(r.limit)}</td><td>${acordNP(r.ded)}</td><td>${acordNP(r.prem)}</td></tr>
  `).join("") : (cov.liability !== undefined ? `
    <tr><td>Auto Liability</td><td>$${Number(cov.liability).toLocaleString()}</td><td>${cov.pd_deductible_amount !== undefined ? '$' + Number(cov.pd_deductible_amount).toLocaleString() : acordNP(null)}</td><td>—</td></tr>
  ` : `<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No coverages on file</td></tr>`);

  return `
    <div class="acord-header-row">
      <div><strong>ACORD 137</strong><br><span style="font-size:10px;">COMMERCIAL AUTO APPLICATION</span></div>
      <div style="text-align:right; font-size:10px;">Submission: <strong>${sub.id}</strong><br>Date: ${new Date().toLocaleDateString()}</div>
    </div>

    <div class="acord-section-title">Applicant Information</div>
    <div class="acord-grid-2">
      <div><span class="acord-lbl">Named Insured</span><div class="acord-val">${acordNP(sub.insured)}</div></div>
      <div><span class="acord-lbl">FEIN / Tax ID</span><div class="acord-val">${acordNP(sub.fein)}</div></div>
      <div><span class="acord-lbl">Mailing Address</span><div class="acord-val">${acordNP(sub.address)}</div></div>
      <div><span class="acord-lbl">DOT Number</span><div class="acord-val">${acordNP(sub.dot)}</div></div>
      <div><span class="acord-lbl">Producer / Broker</span><div class="acord-val">${acordNP(sub.broker)}</div></div>
      <div><span class="acord-lbl">MC Number</span><div class="acord-val">${acordNP(sub.mcNumber)}</div></div>
    </div>

    <div class="acord-section-title">Policy Information</div>
    <div class="acord-grid-2">
      <div><span class="acord-lbl">Effective Date</span><div class="acord-val">${acordNP(gen.effective_date || sub.effectiveDate)}</div></div>
      <div><span class="acord-lbl">Expiration Date</span><div class="acord-val">${acordNP(gen.expiration_date || sub.expirationDate)}</div></div>
      <div><span class="acord-lbl">Requested Limit / TIV</span><div class="acord-val">${acordNP(sub.exposure)}</div></div>
      <div><span class="acord-lbl">Line of Business</span><div class="acord-val">${acordNP(sub.lobName)}</div></div>
    </div>

    <div class="acord-section-title">Schedule of Coverages</div>
    <table class="acord-table"><thead><tr><th>Coverage</th><th>Limit</th><th>Deductible</th><th>Premium</th></tr></thead><tbody>${coverageRowsHtml}</tbody></table>

    <div class="acord-section-title">Schedule of Vehicles</div>
    <table class="acord-table"><thead><tr><th>#</th><th>Year</th><th>Make</th><th>Model</th><th>VIN</th><th>Stated Value</th></tr></thead><tbody>${vehicleRows}</tbody></table>

    <div class="acord-section-title">Schedule of Drivers</div>
    <table class="acord-table"><thead><tr><th>#</th><th>Name</th><th>DOB</th><th>Age</th><th>License #</th><th>State</th><th>Class</th></tr></thead><tbody>${driverRows}</tbody></table>

    <div class="acord-section-title">Signature</div>
    ${sub.eSignature ? `
      <div class="acord-grid-2">
        <div><span class="acord-lbl">Signed By</span><div class="acord-val">${sub.eSignature.signerName}</div></div>
        <div><span class="acord-lbl">Signed At</span><div class="acord-val">${sub.eSignature.signedAt}</div></div>
      </div>` : `<div class="acord-val" style="color:#94a3b8; font-style:italic;">Not yet signed — use "Issue Quote &amp; Bind" to sign.</div>`}
  `;
}

function openAcordFormModal() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
  const modal = document.getElementById("acordFormModal");
  const body = document.getElementById("acordFormBody");
  if (!sub || !modal || !body) return;
  body.innerHTML = renderAcordFormHtml(sub);
  modal.style.display = "flex";
}
window.openAcordFormModal = openAcordFormModal;

function closeAcordFormModal() {
  const modal = document.getElementById("acordFormModal");
  if (modal) modal.style.display = "none";
}
window.closeAcordFormModal = closeAcordFormModal;

function printAcordForm() {
  window.print();
}
window.printAcordForm = printAcordForm;

function issueQuoteAction() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
  const btn = document.getElementById("btnIssueQuote");
  const banner = document.getElementById("issuedQuoteSuccessBanner");
  const details = document.getElementById("issuedQuoteRecipientDetails");
  const statusBadge = document.getElementById("quoteIssuanceStatusBadge");

  // Determine selected delivery recipient
  const radioTarget = document.querySelector('input[name="policyRecipientTarget"]:checked');
  const targetVal = radioTarget ? radioTarget.value : "broker";

  let recipientText = "";
  if (targetVal === "broker") {
    recipientText = `Dispatched to Producing Broker Agency (${(sub.broker || 'Marsh').split(' ')[0]}) inbox at broker-quote@${(sub.broker || 'marsh').toLowerCase().replace(/[^a-z]/g, '').substring(0, 8)}.com`;
  } else if (targetVal === "customer") {
    recipientText = `Dispatched directly to Insured Customer (${sub.insured}) portal at policy-ops@${sub.insured.toLowerCase().replace(/[^a-z]/g, '').substring(0, 8)}.com`;
  } else {
    recipientText = `Simultaneous Dual Dispatch: Sent to ${(sub.broker || 'Marsh').split(' ')[0]} Broker Inbox & ${sub.insured} Customer Portal`;
  }

  if (details) details.textContent = recipientText;

  if (statusBadge) {
    statusBadge.className = "badge badge-success";
    statusBadge.innerHTML = '<i class="ph ph-check-circle"></i> Quote Officially Issued & Active';
  }

  if (btn) {
    btn.innerHTML = '<i class="ph ph-check-circle"></i> QUOTE OFFICIALLY ISSUED';
    btn.disabled = true;
    btn.classList.add("disabled");
  }

  if (banner) {
    banner.style.display = "flex";
    try {
      banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {}
  }

  if (sub) {
    sub.statusText = "Quote Issued";
    sub.statusBadge = "badge-success";
    sub.quoteIssued = true;
    if (!sub.completedSteps.includes(7)) sub.completedSteps.push(7);

    const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
    if (!sub.decisionLog) sub.decisionLog = [];
    sub.decisionLog.push({
      step: 7,
      decision: "quote_issued",
      by: `${roleConfig.name} (${roleConfig.title})`,
      at: new Date().toISOString().slice(0, 16).replace("T", " "),
      notes: recipientText
    });

    recordQuoteVersion(sub, false);
  }

  updateActiveCaseHeaders(sub);
  renderStep7View(sub);
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
  showToast(`🚀 Commercial Quote Issued Successfully to ${targetVal === 'broker' ? 'Producing Broker' : (targetVal === 'customer' ? 'Direct Insured' : 'Broker & Customer')}!`, "success");

  // Issue Quote Actions popup (Add-On) — Quotation -> Customer Approval ->
  // Invoice. Sending, approval, and invoice/download are all explicit,
  // gated actions the underwriter/customer trigger from this table, instead
  // of an automatic silent email + JSON download. See
  // js/issue-quote-email.js for the Output-Quote-is-source-of-truth payload
  // builders and the approval gate.
  if (sub && typeof openIssueQuoteActionsModal === "function") {
    openIssueQuoteActionsModal(sub);
  }
}

function bindPolicyAction() {
  issueQuoteAction();
}

function requestBrokerRevision() {
  showToast("Revision request logged. File returned to Rating Studio for recalculation", "info");
  goToScreen("screen-7");
}

function expireQuoteAction() {
  showToast("Quote validity window expired (30-day term ended). File closed.", "warning");
  goToScreen("screen-9");
}

function printQuote() {
  window.print();
}

// ============================================================================
// SUBMISSION QUOTE VERSION HISTORY ENGINE (Page 4)
// ============================================================================

let activeVersionStatusFilter = "all";
let activeVersionSubFilter = "all";

// Starts empty — populated only by real quote versions recorded against
// real (apiSourced) submissions. No hardcoded/demo entries.
var QUOTE_VERSIONS_DATASET = [];

function getAllFlatQuotes() {
  const list = [];
  QUOTE_VERSIONS_DATASET.forEach(sub => {
    sub.quotes.forEach(q => {
      list.push({ ...q, subId: sub.subId, insured: sub.insured, lob: sub.lob, broker: sub.broker });
    });
  });
  return list;
}

// ============================================================================
// SUBMISSION INTAKE — CUSTOMER DATA VERSIONING (independent of Quote Versioning)
// ============================================================================
// Tracks versions of the submission's customer-provided data itself (e.g.
// insured details, address, exposure, broker info). Each time customer-
// provided data changes, a new submission version is recorded here. This is
// entirely separate from quote/rating versions and never navigates to the
// Quote Versioning page — submissions stay within the Intake workflow.

const SUBMISSION_EDITABLE_FIELDS = [
  { key: "insured", label: "Named Insured" },
  { key: "fein", label: "FEIN" },
  { key: "address", label: "Mailing / Garaging Address" },
  { key: "broker", label: "Broker / Channel Name" },
  { key: "email", label: "Contact Email" },
  { key: "exposureVal", label: "Exposure Value", isNumber: true }
];

function ensureSubmissionVersionSeed(sub) {
  if (!sub.submissionVersions) {
    sub.submissionVersions = [{
      version: 1,
      at: sub.receivedAt || "—",
      by: "System Intake",
      changes: [{ field: "Submission Created", oldVal: null, newVal: "Initial customer-provided data captured at intake" }],
      threadRef: 0
    }];
  }
  return sub.submissionVersions;
}

// ----------------------------------------------------------------------------
// Customer Communication Thread — the to-and-fro exchange that produces each
// submission version. Messages always travel through the SAME channel the
// submission originally arrived on (Broker or Direct), never a new channel.
// ----------------------------------------------------------------------------
const UPDATE_TYPE_LABELS = {
  additional: "Additional Info Provided",
  missing: "Missing Info Supplied",
  changed: "Changed Info / Correction"
};

function getChannelPartyLabel(sub) {
  return sub.channelType === "broker"
    ? (sub.broker || "Broker")
    : "Customer (Direct Portal)";
}

function ensureCommunicationThreadSeed(sub) {
  if (!sub.communicationThread) {
    const party = getChannelPartyLabel(sub);
    sub.communicationThread = [{
      direction: "inbound",
      via: sub.channelType === "broker" ? `Broker Email (${sub.broker || "Broker"})` : "Direct Customer Portal",
      from: party,
      to: "Underwriting Team",
      at: sub.receivedAt || "—",
      updateType: null,
      message: `Original submission received via ${sub.channelType === "broker" ? "broker intake" : "direct customer portal"}.`
    }];
  }
  return sub.communicationThread;
}

function renderCommunicationThreadHtml(sub) {
  const thread = ensureCommunicationThreadSeed(sub);
  return thread.map(m => `
    <div style="display:flex; ${m.direction === 'inbound' ? 'justify-content:flex-start;' : 'justify-content:flex-end;'} margin-bottom:8px;">
      <div style="max-width:80%; background:${m.direction === 'inbound' ? 'var(--color-surface)' : 'var(--color-brand-light)'}; border:1px solid var(--color-border); border-radius:8px; padding:10px 12px;">
        <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:4px;">
          <strong class="u-fs-12">${m.direction === 'inbound' ? `${m.from} → ${m.to}` : `${m.to} → ${m.from}`}</strong>
          <span class="text-xs text-muted">${m.at}</span>
        </div>
        <div class="text-xs text-muted" style="margin-bottom:4px;"><i class="ph ${sub.channelType === 'broker' ? 'ph-briefcase' : 'ph-user'}"></i> via ${m.via}${m.updateType ? ` • <span class="badge badge-info" style="font-size:10px;">${UPDATE_TYPE_LABELS[m.updateType] || m.updateType}</span>` : ''}</div>
        <div style="font-size:13px;">${m.message}</div>
      </div>
    </div>`).join("");
}

function getSubmissionDataVersionCount(sub) {
  return ensureSubmissionVersionSeed(sub).length;
}

// ----------------------------------------------------------------------------
// Missing Documents & Missing Data tracking (part of submission versioning)
// ----------------------------------------------------------------------------
function ensureMissingItemsSeed(sub) {
  if (!sub.missingItems) {
    // Default: nothing flagged missing unless explicitly seeded on the record.
    sub.missingItems = { documents: [], dataFields: [] };
  }
  return sub.missingItems;
}

function getOutstandingMissingCount(sub) {
  const m = ensureMissingItemsSeed(sub);
  return m.documents.length + m.dataFields.length;
}

function renderMissingItemsSummaryHtml(sub) {
  const m = ensureMissingItemsSeed(sub);
  if (m.documents.length === 0 && m.dataFields.length === 0) {
    return `<div class="alert alert-success u-fs-12-5"><i class="ph ph-check"></i> No missing documents or data outstanding for this submission.</div>`;
  }
  const docItems = m.documents.map(d => `<li>${d}</li>`).join("");
  const dataItems = m.dataFields.map(d => `<li>${d}</li>`).join("");
  return `
    <div class="alert alert-warning u-fs-12-5">
      <i class="ph ph-warning"></i> <strong>Outstanding items for this submission:</strong>
      ${m.documents.length ? `<div style="margin-top:6px;"><strong>Missing Documents (${m.documents.length}):</strong><ul style="margin:4px 0 0 18px;">${docItems}</ul></div>` : ''}
      ${m.dataFields.length ? `<div style="margin-top:6px;"><strong>Missing Data (${m.dataFields.length}):</strong><ul style="margin:4px 0 0 18px;">${dataItems}</ul></div>` : ''}
    </div>`;
}

function openSubmissionVersionHistoryModal(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  const modal = document.getElementById("intakeVersionListModal");
  const body = document.getElementById("intakeVersionListModalBody");
  const titleEl = document.getElementById("intakeVersionListModalTitle");
  if (!sub || !modal || !body) return;

  const versions = ensureSubmissionVersionSeed(sub);
  const thread = ensureCommunicationThreadSeed(sub);
  titleEl.textContent = `Submission Data Versions — ${sub.insured} (${subId})`;

  const channelLabel = sub.channelType === "broker" ? `Broker (${sub.broker || "Broker"})` : "Direct Customer Portal";

  const versionRows = versions.slice().reverse().map(v => {
    const changeRows = v.changes.map(c => `
      <div style="font-size:12px; padding:3px 0;">
        <strong>${c.field}:</strong>
        ${c.oldVal !== null ? `<span class="text-muted" style="text-decoration:line-through;">${c.oldVal}</span> → ` : ''}
        <span>${c.newVal}</span>
      </div>`).join("");
    const resolvedDocsHtml = (v.resolvedDocs && v.resolvedDocs.length)
      ? `<div style="font-size:12px; padding:3px 0; color:var(--color-success);"><i class="ph ph-check"></i> Documents received: ${v.resolvedDocs.join(", ")}</div>` : '';
    const resolvedDataHtml = (v.resolvedDataFields && v.resolvedDataFields.length)
      ? `<div style="font-size:12px; padding:3px 0; color:var(--color-success);"><i class="ph ph-check"></i> Data supplied: ${v.resolvedDataFields.join(", ")}</div>` : '';
    const newMissingDocsHtml = (v.newMissingDocs && v.newMissingDocs.length)
      ? `<div style="font-size:12px; padding:3px 0; color:var(--color-danger);"><i class="ph ph-warning"></i> Newly flagged missing documents: ${v.newMissingDocs.join(", ")}</div>` : '';
    const newMissingDataHtml = (v.newMissingDataFields && v.newMissingDataFields.length)
      ? `<div style="font-size:12px; padding:3px 0; color:var(--color-danger);"><i class="ph ph-warning"></i> Newly flagged missing data: ${v.newMissingDataFields.join(", ")}</div>` : '';
    return `
      <div class="card mb-2" style="padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span class="badge ${v.version === versions.length ? 'badge-success' : 'badge-info'} font-mono">v${v.version}</span>
          <span class="text-xs text-muted">${v.at} • ${v.by}${v.updateType ? ` • ${UPDATE_TYPE_LABELS[v.updateType] || v.updateType}` : ''}</span>
        </div>
        ${changeRows}
        ${resolvedDocsHtml}${resolvedDataHtml}${newMissingDocsHtml}${newMissingDataHtml}
      </div>`;
  }).join("");

  body.innerHTML = `
    <div class="alert alert-info mb-3 u-fs-12-5">
      <i class="ph ph-info"></i> Every update below travels through the <strong>same channel the submission originally arrived on</strong>: <strong>${channelLabel}</strong>. This history tracks customer-provided data changes — not quote/rating versions. The submission stays within the Intake workflow.
    </div>

    ${renderMissingItemsSummaryHtml(sub)}

    <div class="filter-tabs mb-3 mt-3" id="subHistoryTabNav">
      <button class="tab-btn active" id="subHistoryTabThread" onclick="switchSubHistoryTab('${subId}', 'thread')"><i class="ph ph-chat-dots"></i> Communication Thread</button>
      <button class="tab-btn" id="subHistoryTabVersions" onclick="switchSubHistoryTab('${subId}', 'versions')"><i class="ph ph-stack"></i> Version History</button>
    </div>

    <div id="subHistoryPanelThread">
      ${renderCommunicationThreadHtml(sub)}
    </div>
    <div class="u-hidden" id="subHistoryPanelVersions">
      ${versionRows}
    </div>

    <div class="mt-3" style="text-align:right;">
      <button class="btn btn-sm btn-primary" onclick="closeIntakeVersionListModal(); openEditSubmissionDataModal('${subId}');">
        <i class="ph ph-pencil-simple"></i> Log Customer Communication & Update
      </button>
    </div>
  `;

  modal.style.display = "flex";
}

function switchSubHistoryTab(subId, tab) {
  const tabThread = document.getElementById("subHistoryTabThread");
  const tabVersions = document.getElementById("subHistoryTabVersions");
  const panelThread = document.getElementById("subHistoryPanelThread");
  const panelVersions = document.getElementById("subHistoryPanelVersions");
  if (tabThread) tabThread.classList.toggle("active", tab === "thread");
  if (tabVersions) tabVersions.classList.toggle("active", tab === "versions");
  if (panelThread) panelThread.style.display = tab === "thread" ? "block" : "none";
  if (panelVersions) panelVersions.style.display = tab === "versions" ? "block" : "none";
}

function closeIntakeVersionListModal() {
  const modal = document.getElementById("intakeVersionListModal");
  if (modal) modal.style.display = "none";
}

let editSubmissionTargetId = null;

function openEditSubmissionDataModal(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  const modal = document.getElementById("editSubmissionDataModal");
  const body = document.getElementById("editSubmissionDataModalBody");
  if (!sub || !modal || !body) return;

  if (!hasPermission("submissionData", "edit")) {
    denyPermission("submissionData", "edit");
    return;
  }

  editSubmissionTargetId = subId;
  const channelLabel = sub.channelType === "broker" ? `Broker Email (${sub.broker || "Broker"})` : "Direct Customer Portal";
  const party = getChannelPartyLabel(sub);
  const missing = ensureMissingItemsSeed(sub);

  const missingDocsChecklist = missing.documents.map((d, i) => `
    <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; padding:3px 0;">
      <input type="checkbox" class="missing-doc-resolve-cb u-icon-16" value="${i}"> Received: ${d}
    </label>`).join("");
  const missingDataChecklist = missing.dataFields.map((d, i) => `
    <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; padding:3px 0;">
      <input type="checkbox" class="missing-data-resolve-cb u-icon-16" value="${i}"> Supplied: ${d}
    </label>`).join("");

  const fieldsHtml = SUBMISSION_EDITABLE_FIELDS.map(f => `
    <div class="form-group mb-2">
      <label class="u-label-sm">${f.label}</label>
      <input type="${f.isNumber ? 'number' : 'text'}" id="editSubField_${f.key}" class="form-control" value="${sub[f.key] != null ? sub[f.key] : ''}">
    </div>`).join("");

  body.innerHTML = `
    <div style="font-size:13px; margin-bottom:10px;">
      <strong>Submission:</strong> <code>${sub.id}</code>
    </div>
    <div class="alert alert-info mb-3 u-fs-12-5">
      <i class="ph ${sub.channelType === 'broker' ? 'ph-briefcase' : 'ph-user'}"></i> This communication will be logged via <strong>${channelLabel}</strong> — the same channel this submission originally arrived through.
    </div>

    <div class="form-group mb-3">
      <label class="u-label-sm">Type of Update</label>
      <select id="editSubUpdateType" class="form-control">
        <option value="additional">Additional Info Provided by ${party}</option>
        <option value="missing">Missing Info Supplied by ${party}</option>
        <option value="changed">Changed Info / Correction from ${party}</option>
      </select>
    </div>

    ${(missing.documents.length || missing.dataFields.length) ? `
    <div class="card mb-3" style="padding:12px; background:var(--color-warning-bg); border-color:#fde68a;">
      <p class="text-xs" style="font-weight:600; margin-bottom:6px;"><i class="ph ph-warning"></i> Currently Outstanding — check off anything received/supplied in this update:</p>
      ${missingDocsChecklist}
      ${missingDataChecklist}
    </div>` : ''}

    <div class="form-group mb-3">
      <label class="u-label-sm">Newly Discovered Missing Documents (optional, comma-separated)</label>
      <input type="text" id="editSubNewMissingDocs" class="form-control" placeholder="e.g. Updated MVR Report, Vehicle Title Copy">
    </div>
    <div class="form-group mb-3">
      <label class="u-label-sm">Newly Discovered Missing Data (optional, comma-separated)</label>
      <input type="text" id="editSubNewMissingData" class="form-control" placeholder="e.g. Years in Business, Prior Carrier Name">
    </div>

    <div class="form-group mb-3">
      <label class="u-label-sm">Customer Message (Incoming, via ${channelLabel})<span class="u-text-danger"> *</span></label>
      <textarea id="editSubCustomerMessage" class="form-control" rows="3" placeholder="What the customer/broker communicated — e.g. 'Updated garaging address effective next month' or 'Attached corrected FEIN document'..."></textarea>
    </div>

    <div class="form-group mb-3">
      <label class="u-label-sm">Our Response (Optional, sent back via ${channelLabel})</label>
      <textarea id="editSubResponseMessage" class="form-control" rows="2" placeholder="Optional reply confirming receipt or requesting further detail..."></textarea>
    </div>

    <hr style="border-color:var(--color-border); margin:16px 0;">
    <p class="text-xs text-muted mb-2">Update the submission fields below to match what was communicated:</p>
    ${fieldsHtml}
  `;

  modal.style.display = "flex";
}

function closeEditSubmissionDataModal() {
  const modal = document.getElementById("editSubmissionDataModal");
  if (modal) modal.style.display = "none";
  editSubmissionTargetId = null;
}

function saveSubmissionDataEdit() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === editSubmissionTargetId);
  if (!sub) return;

  if (!hasPermission("submissionData", "edit")) {
    denyPermission("submissionData", "edit");
    return;
  }

  const customerMessage = document.getElementById("editSubCustomerMessage").value.trim();
  if (!customerMessage) {
    showToast("⛔ Enter the customer's message before saving — every version must trace back to the communication that prompted it.", "danger");
    return;
  }

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  const updateType = document.getElementById("editSubUpdateType").value;
  const responseMessage = document.getElementById("editSubResponseMessage").value.trim();
  const versions = ensureSubmissionVersionSeed(sub);
  const thread = ensureCommunicationThreadSeed(sub);
  const missing = ensureMissingItemsSeed(sub);
  const changes = [];

  SUBMISSION_EDITABLE_FIELDS.forEach(f => {
    const inputEl = document.getElementById(`editSubField_${f.key}`);
    if (!inputEl) return;
    let newVal = inputEl.value;
    if (f.isNumber) newVal = parseInt(newVal, 10) || 0;
    const oldVal = sub[f.key];
    if (String(oldVal) !== String(newVal)) {
      changes.push({ field: f.label, oldVal: f.isNumber ? `$${(oldVal || 0).toLocaleString()}` : (oldVal || "—"), newVal: f.isNumber ? `$${newVal.toLocaleString()}` : newVal });
      sub[f.key] = newVal;
    }
  });

  // Keep the display-formatted exposure string in sync if exposureVal changed
  if (changes.some(c => c.field === "Exposure Value")) {
    sub.exposure = `$${sub.exposureVal.toLocaleString()}`;
  }

  // Resolve checked-off missing documents / data fields
  const resolvedDocs = [];
  document.querySelectorAll(".missing-doc-resolve-cb:checked").forEach(cb => {
    resolvedDocs.push(missing.documents[parseInt(cb.value, 10)]);
  });
  const resolvedDataFields = [];
  document.querySelectorAll(".missing-data-resolve-cb:checked").forEach(cb => {
    resolvedDataFields.push(missing.dataFields[parseInt(cb.value, 10)]);
  });
  if (resolvedDocs.length) missing.documents = missing.documents.filter(d => !resolvedDocs.includes(d));
  if (resolvedDataFields.length) missing.dataFields = missing.dataFields.filter(d => !resolvedDataFields.includes(d));

  // Newly discovered missing documents / data
  const newMissingDocsRaw = document.getElementById("editSubNewMissingDocs").value.trim();
  const newMissingDataRaw = document.getElementById("editSubNewMissingData").value.trim();
  const newMissingDocs = newMissingDocsRaw ? newMissingDocsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
  const newMissingDataFields = newMissingDataRaw ? newMissingDataRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
  if (newMissingDocs.length) missing.documents.push(...newMissingDocs);
  if (newMissingDataFields.length) missing.dataFields.push(...newMissingDataFields);

  const hasMissingItemActivity = resolvedDocs.length > 0 || resolvedDataFields.length > 0 || newMissingDocs.length > 0 || newMissingDataFields.length > 0;

  const nowStamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const channelVia = sub.channelType === "broker" ? `Broker Email (${sub.broker || "Broker"})` : "Direct Customer Portal";
  const party = getChannelPartyLabel(sub);

  // 1. Log the incoming customer/broker communication on the SAME channel the
  //    submission originally arrived through.
  thread.push({
    direction: "inbound",
    via: channelVia,
    from: party,
    to: "Underwriting Team",
    at: nowStamp,
    updateType,
    message: customerMessage
  });

  // 2. Optionally log our reply on the same channel.
  if (responseMessage) {
    thread.push({
      direction: "outbound",
      via: channelVia,
      from: party,
      to: roleConfig.name,
      at: nowStamp,
      updateType: null,
      message: responseMessage
    });
  }

  // 3. Create a new submission version if field data changed OR missing
  //    documents/data were resolved or newly flagged — either way the
  //    version links back to this exact communication exchange.
  if (changes.length > 0 || hasMissingItemActivity) {
    versions.push({
      version: versions.length + 1,
      at: nowStamp,
      by: `${roleConfig.name} (${roleConfig.title})`,
      changes,
      updateType,
      resolvedDocs,
      resolvedDataFields,
      newMissingDocs,
      newMissingDataFields,
      threadRef: thread.length - (responseMessage ? 2 : 1)
    });
    const summaryParts = [];
    if (changes.length) summaryParts.push(`${changes.length} field${changes.length > 1 ? 's' : ''} updated`);
    if (resolvedDocs.length || resolvedDataFields.length) summaryParts.push(`${resolvedDocs.length + resolvedDataFields.length} outstanding item(s) resolved`);
    if (newMissingDocs.length || newMissingDataFields.length) summaryParts.push(`${newMissingDocs.length + newMissingDataFields.length} new item(s) flagged missing`);
    showToast(`✅ Submission version ${versions.length} recorded for ${sub.id} via ${channelVia} (${summaryParts.join(", ")}). Submission remains in Intake.`, "success");
  } else {
    showToast(`✅ Communication logged via ${channelVia}. No field values or missing-item status changed, so no new version was created.`, "info");
  }

  closeEditSubmissionDataModal();
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
}

function renderQuoteVersionsLedger() {
  const container = document.getElementById("quoteVersionCardsContainer");
  const kpiTotal = document.getElementById("kpiTotalVersions");
  const kpiBound = document.getElementById("kpiBoundCount");
  if (!container) return;

  const allQuotes = getAllFlatQuotes();
  if (kpiTotal) kpiTotal.textContent = `${allQuotes.length} Quotes`;
  const boundCount = allQuotes.filter(q => q.isBound).length;
  if (kpiBound) kpiBound.textContent = `${boundCount} Bound`;

  let matchingSubs = QUOTE_VERSIONS_DATASET;

  // Filter by Submission
  if (activeVersionSubFilter !== "all") {
    matchingSubs = matchingSubs.filter(s => s.subId === activeVersionSubFilter);
  }

  // Recompute tab counts against the current submission scope, so tabs
  // reflect the "Select Submission" dropdown instead of staying static.
  const scopedQuotes = matchingSubs.flatMap(s => s.quotes);
  const tabCountAll = document.getElementById("tabCountVerAll");
  const tabCountBound = document.getElementById("tabCountVerBound");
  const tabCountActive = document.getElementById("tabCountVerActive");
  const tabCountSuperceded = document.getElementById("tabCountVerSuperceded");
  if (tabCountAll) tabCountAll.textContent = scopedQuotes.length;
  if (tabCountBound) tabCountBound.textContent = scopedQuotes.filter(q => q.isBound).length;
  if (tabCountActive) tabCountActive.textContent = scopedQuotes.filter(q => q.isLatest && !q.isBound).length;
  if (tabCountSuperceded) tabCountSuperceded.textContent = scopedQuotes.filter(q => !q.isLatest && !q.isBound).length;

  const query = (document.getElementById("versionSearchInput")?.value || "").toLowerCase();

  let html = "";
  let totalVisibleQuotes = 0;

  matchingSubs.forEach(sub => {
    let subQuotes = sub.quotes;

    // Filter by Status Tab
    if (activeVersionStatusFilter === "bound") {
      subQuotes = subQuotes.filter(q => q.isBound);
    } else if (activeVersionStatusFilter === "active") {
      subQuotes = subQuotes.filter(q => q.isLatest && !q.isBound);
    } else if (activeVersionStatusFilter === "superceded") {
      subQuotes = subQuotes.filter(q => !q.isLatest && !q.isBound);
    }

    // Filter by Search Query
    if (query) {
      subQuotes = subQuotes.filter(q => 
        sub.insured.toLowerCase().includes(query) ||
        sub.subId.toLowerCase().includes(query) ||
        q.quoteNo.toLowerCase().includes(query) ||
        q.status.toLowerCase().includes(query) ||
        q.notes.toLowerCase().includes(query)
      );
    }

    if (subQuotes.length === 0) return;

    totalVisibleQuotes += subQuotes.length;

    html += `
      <div class="sub-version-group-card">
        <div class="sub-group-header">
          <div class="sub-group-title-box">
            <i class="ph ph-tree-structure text-primary" style="font-size: 18px;"></i>
            <div>
              <div class="sub-group-title">${sub.insured}</div>
              <div class="sub-group-meta">${sub.subId} • ${sub.lob} • Producer: <strong>${sub.broker}</strong></div>
            </div>
          </div>
          <span class="badge badge-info font-bold">${subQuotes.length} ${subQuotes.length === 1 ? 'Quote' : 'Quotes'}</span>
        </div>
        <div class="table-responsive">
          <table class="sub-version-table">
            <thead>
              <tr>
                <th style="width: 85px;">Version</th>
                <th>Quote Number</th>
                <th>Generated Date</th>
                <th>Author / Role</th>
                <th>Base Coverage</th>
                <th>Discounts</th>
                <th>Fees & Taxes</th>
                <th>Total Premium</th>
                <th>Status</th>
                <th class="u-text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${subQuotes.map(q => {
                let tagClass = "v-old";
                if (q.isBound) tagClass = "v-bound";
                else if (q.isLatest) tagClass = "v-latest";

                let trClass = q.isBound ? "is-bound" : (q.isLatest ? "is-latest" : "");

                return `
                  <tr class="${trClass}">
                    <td>
                      <span class="version-num-tag ${tagClass}">
                        <i class="ph ph-tag"></i> ${q.versionTag}
                      </span>
                    </td>
                    <td>
                      <strong class="font-mono text-primary">${q.quoteNo}</strong>
                      <div class="text-xs text-muted">${q.type}</div>
                    </td>
                    <td class="text-xs font-mono text-muted">${q.date}</td>
                    <td style="font-size: 11.5px; font-weight: 600; color: #334155;">${q.author}</td>
                    <td class="font-mono font-bold text-primary">$${(q.baseCoveragePremium || 35062).toLocaleString()}</td>
                    <td class="font-mono font-bold text-success">-$${Math.abs(q.appliedDiscounts || 2805).toLocaleString()}</td>
                    <td class="font-mono text-muted">+$${(q.feesAndTaxes || 7003).toLocaleString()}</td>
                    <td>
                      <strong class="font-mono" style="font-size: 14px; color: ${q.isBound ? '#16a34a' : '#0f172a'}; font-weight: 900;">
                        $${q.premium.toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <span class="badge ${q.statusBadge}">${q.status}</span>
                    </td>
                    <td class="u-text-right">
                      <button class="btn btn-xs btn-outline-primary u-fw-700" onclick="openQuoteVersionPreviewModal('${q.versionId}')" title="View Full Actuarial Quote Sheet">
                        <i class="ph ph-receipt"></i> View Quote Sheet
                      </button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  if (totalVisibleQuotes === 0) {
    container.innerHTML = `
      <div class="card p-4 text-center text-muted">
        <i class="ph ph-magnifying-glass mb-2" style="font-size: 24px; color: #94a3b8;"></i>
        <h4>No Quote Versions Found</h4>
        <p style="font-size: 12px; margin: 4px 0 0 0;">No quote records match the current filter or search criteria.</p>
      </div>
    `;
  } else {
    container.innerHTML = html;
  }
}

function filterQuoteVersions(status) {
  activeVersionStatusFilter = status;
  const tabs = document.querySelectorAll("#versionStatusFilterTabs .tab-btn");
  tabs.forEach(t => t.classList.remove("active"));

  if (status === "all") document.getElementById("tabFilterVerAll")?.classList.add("active");
  if (status === "bound") document.getElementById("tabFilterVerBound")?.classList.add("active");
  if (status === "active") document.getElementById("tabFilterVerActive")?.classList.add("active");
  if (status === "superceded") document.getElementById("tabFilterVerSuperceded")?.classList.add("active");

  renderQuoteVersionsLedger();
}

function onVersionSubSelectChange(subId) {
  activeVersionSubFilter = subId;
  renderQuoteVersionsLedger();
}

function searchQuoteVersionsTable() {
  renderQuoteVersionsLedger();
}

function openQuoteVersionPreviewModal(verId) {
  const modal = document.getElementById("quoteVersionPreviewModal");
  const modalBody = document.getElementById("quoteVersionPreviewModalBody");
  const title = document.getElementById("modalQuotePreviewTitle");
  const sub = document.getElementById("modalQuotePreviewSub");
  if (!modal || !modalBody) return;

  const allQuotes = getAllFlatQuotes();
  const q = allQuotes.find(item => item.versionId === verId) || allQuotes[0];

  if (title) title.textContent = `Quote Document: ${q.quoteNo} (${q.versionTag}) • $${q.premium.toLocaleString()}.00`;
  if (sub) sub.textContent = `${q.insured} • ${q.subId} • Issued: ${q.date} • ${q.type}`;

  const payload = q.ratingPayload || DEFAULT_IMPORTED_RATING_JSON;
  modalBody.innerHTML = `
    <div style="max-height: 78vh; overflow-y: auto; padding: 4px;">
      ${getGeneratedQuoteHtml(payload, q)}
    </div>
  `;

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeQuoteVersionPreviewModal() {
  const modal = document.getElementById("quoteVersionPreviewModal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
  }
}

function exportQuoteVersionsCSV() {
  const allQuotes = getAllFlatQuotes();
  const headers = ["Submission ID", "Named Insured", "Line of Business", "Producing Broker", "Version", "Quote Number", "Type", "Generated Date", "Author", "Gross Premium", "Limits", "Deductible", "Status", "Notes"];

  const rows = allQuotes.map(q => [
    `"${q.subId}"`,
    `"${q.insured}"`,
    `"${q.lob}"`,
    `"${q.broker}"`,
    `"${q.versionTag}"`,
    `"${q.quoteNo}"`,
    `"${q.type}"`,
    `"${q.date}"`,
    `"${q.author}"`,
    q.premium,
    `"${q.liabilityLimit}"`,
    `"${q.pdDeductible}"`,
    `"${q.status}"`,
    `"${q.notes.replace(/"/g, '""')}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Quote_Version_History_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("📥 Quote Version History exported to CSV!", "success");
}

// Loading-state helper — briefly disables a button and swaps its label for
// a spinner while workFn runs, so actions that will eventually hit a real
// network/backend already have consistent loading feedback wired in. Purely
// visual: workFn's own logic, timing, and side effects are unchanged.
function withButtonLoading(btnEl, loadingLabel, workFn, delayMs) {
  if (!btnEl) { workFn(); return; }
  const originalHtml = btnEl.innerHTML;
  const originalDisabled = btnEl.disabled;
  btnEl.disabled = true;
  btnEl.innerHTML = `<i class="ph ph-circle-notch ph-spin"></i> ${loadingLabel}`;
  setTimeout(() => {
    try {
      workFn();
    } finally {
      btnEl.disabled = originalDisabled;
      btnEl.innerHTML = originalHtml;
    }
  }, delayMs || 450);
}
window.withButtonLoading = withButtonLoading;

// Progressive disclosure for wide schedule tables (Vehicles/Drivers) —
// toggles a "basic-view" class that hides columns marked .wb-detail-col
// (rating factors, base rate, etc.) instead of always showing every
// column and forcing horizontal scroll on smaller screens.
function toggleTableDetailView(tableId, btnEl) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const nowBasic = table.classList.toggle("basic-view");
  if (btnEl) {
    btnEl.innerHTML = nowBasic
      ? '<i class="ph ph-columns"></i> Show Detailed Columns'
      : '<i class="ph ph-columns"></i> Simplify View';
  }
}
window.toggleTableDetailView = toggleTableDetailView;

// Toast Helper — capped stack: bulk actions (Bulk Upload, etc.) can fire
// many toasts in quick succession; rather than letting them pile up
// off-screen or overlap, the oldest is dismissed immediately once the cap
// is hit so the stack never grows unbounded.
const TOAST_MAX_VISIBLE = 4;

function showToast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  while (container.children.length >= TOAST_MAX_VISIBLE) {
    container.removeChild(container.firstElementChild);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  let icon = "ph-info";
  if (type === "success") icon = "ph-check-circle";
  if (type === "warning") icon = "ph-warning";
  if (type === "danger") icon = "ph-prohibit";

  toast.innerHTML = `<i class="ph ${icon}"></i> <span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-20px) scale(0.95)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Shared required-field validation helper — used by any modal field with a
// matching `<fieldId>Error` message span (Decision Notes, Underwriting
// Rationale, etc.) so every required field follows the same show/clear
// logic instead of each modal reinventing it.
function showFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}Error`);
  if (field) field.classList.add("is-invalid");
  if (errorEl) errorEl.classList.remove("u-hidden");
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}Error`);
  if (field) field.classList.remove("is-invalid");
  if (errorEl) errorEl.classList.add("u-hidden");
}
window.showFieldError = showFieldError;
window.clearFieldError = clearFieldError;

// ============================================================================
