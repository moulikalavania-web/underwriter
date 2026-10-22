// 6B. STEP 7: ACTUARIAL IMPORTED RATING ENGINE & FINAL QUOTE STUDIO
// ============================================================================
let isQuoteImported = false;
let currentImportedRatingData = null;

function triggerSystemJsonUpload() {
  const input = document.getElementById("quoteJsonSystemDirectInput");
  if (input) {
    input.value = "";
    input.click();
  }
}

function handleSystemJsonFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  readAndProcessJsonFile(file);
}

function handleJsonDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const box = document.getElementById("jsonDropzoneBox");
  if (box) box.classList.add("dragover");
}

function handleJsonDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const box = document.getElementById("jsonDropzoneBox");
  if (box) box.classList.remove("dragover");
}

function handleJsonFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const box = document.getElementById("jsonDropzoneBox");
  if (box) box.classList.remove("dragover");

  if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
    readAndProcessJsonFile(event.dataTransfer.files[0]);
  }
}

function recordQuoteVersion(sub, isBound = false) {
  if (!sub) sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];

  let subEntry = QUOTE_VERSIONS_DATASET.find(v => v.subId === sub.id);
  if (!subEntry) {
    subEntry = {
      subId: sub.id,
      insured: sub.insured,
      lob: sub.lobName || "Commercial Auto / Trucking",
      broker: sub.broker || "Marsh & McLennan Commercial Brokerage",
      apiSourced: !!sub.apiSourced,
      quotes: []
    };
    QUOTE_VERSIONS_DATASET.push(subEntry);
  }

  const existingCount = subEntry.quotes.length;
  const majorVer = existingCount + 1;
  const verTag = `v${majorVer}.0`;
  const baseQuoteId = sub.quoteNo || sub.quote_id || `QT-2026-${sub.id.replace(/[^0-9]/g, '')}`;
  const rawId = baseQuoteId.split('-v')[0];
  const versionId = `${rawId}-${verTag}`;

  subEntry.quotes.forEach(q => {
    q.isLatest = false;
    if (q.status === "Official Bindable Quote" || q.status === "Active Quote") {
      q.status = "Previous Version (Revised)";
      q.statusBadge = "badge-secondary";
    }
  });

  const dp = ensureDiscretionaryPricingSeed(sub);
  const currentPrem = dp.finalPremium || (currentImportedRatingData && currentImportedRatingData.quote && currentImportedRatingData.quote.finalPremium) || getSubmissionPremium(sub);
  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;

  const newQuoteVersion = {
    versionId: versionId,
    versionTag: verTag,
    quoteNo: versionId,
    type: isBound ? "Bound & Policy Issued" : (isQuoteImported ? "Imported JSON Rating Engine Quote" : "Underwriter Issued Quote"),
    date: new Date().toISOString().slice(0, 16).replace("T", " "),
    author: `${roleConfig.name} (${roleConfig.title})`,
    baseCoveragePremium: dp.basePremium,
    appliedDiscounts: 0,
    feesAndTaxes: typeof slTaxFor === "function" ? slTaxFor(sub).total : 0,
    premium: currentPrem,
    finalPremium: currentPrem,
    liabilityLimit: sub.exposureVal ? `$${Number(sub.exposureVal).toLocaleString("en-US")} CSL` : "Not stated",
    pdDeductible: ((sub.coverageRows || []).filter(r => /physical|own damage|collision/i.test(String(r.line)))[0] || {}).ded || "Not stated",
    status: isBound ? "Bound Policy Issued" : "Official Bindable Quote",
    statusBadge: isBound ? "badge-success" : "badge-primary",
    isBound: isBound,
    isLatest: true,
    notes: `Quote ${verTag} recorded with Final Quoted Premium: $${currentPrem.toLocaleString()}`,
    ratingPayload: currentImportedRatingData || getSubmissionRatingPayload(sub)
  };

  subEntry.quotes.push(newQuoteVersion);
  sub.quoteNo = versionId;
  sub.quote_id = versionId;

  if (currentPage === "quote-intel" && quoteIntelActiveTab === "versions") {
    renderQuoteVersionsLedger();
  }

  return newQuoteVersion;
}

function applyImportedRatingDataToSubmission(parsed, sub) {
  currentImportedRatingData = parsed;
  isQuoteImported = true;
  // Persist onto the submission itself — this is the real fix for rating
  // data leaking across submissions: each submission now remembers its own
  // imported payload, and selectSubmission() re-syncs the globals from here
  // whenever the active submission changes.
  if (sub) {
    sub.importedRatingData = parsed;
    sub.isQuoteImported = true;
  }

  if (parsed && parsed.quote) {
    const rawPrem = parsed.quote.finalPremium !== undefined 
      ? parsed.quote.finalPremium 
      : (parsed.quote.totalPremium !== undefined ? parsed.quote.totalPremium : parsed.quote.annualPremium);

    if (rawPrem !== undefined && rawPrem !== null) {
      const numPrem = parseFloat(String(rawPrem).replace(/[^0-9.]/g, ""));
      if (!isNaN(numPrem) && numPrem > 0) {
        parsed.quote.finalPremium = numPrem;

        // The base premium is the premium before tax and fees (the rating engine's coverage premium). Its own
        // final figure includes tax and fees, so it is only used when nothing better is given.
        const covPrem = parseFloat(String(parsed.quote.coveragePremium == null ? "" : parsed.quote.coveragePremium).replace(/[^0-9.]/g, ""));
        // A coverage added through a met quote condition is not in the rating engine's figure; it is added once, here.
        const baseFromQuote = ((!isNaN(covPrem) && covPrem > 0) ? covPrem : numPrem) + (typeof qcMetPremium === "function" ? qcMetPremium(sub) : 0);

        // Sync discretionary pricing so Final Quoted Premium and TOTAL BINDABLE POLICY PREMIUM match
        sub.discretionaryPricing = {
          basePremium: baseFromQuote,
          adjustmentType: null,
          adjustmentPercent: 0,
          reason: "Imported Rating Engine Output JSON",
          appliedBy: "System Rating Import",
          appliedAt: new Date().toISOString(),
          finalPremium: baseFromQuote
        };
        sub.currentPremium = baseFromQuote;
        recomputeFinalQuotedPremium(sub);
      }
    }
  }

  recordQuoteVersion(sub, false);
}

/**
 * Accepts either a genuine rating-engine-output JSON ({quote, coverages})
 * or a product-schema JSON (the "Integrating API" shape — productId/product/
 * studios) and normalizes both into a rating-engine payload. This bridges
 * the two previously-unrelated JSON formats so feeding the wrong one in
 * doesn't just fail — it gets adapted automatically when it can be.
 * Returns { payload, adapted } on success, or { error } listing exactly
 * what's missing/wrong so the caller can show an actionable message.
 */
function normalizeRatingEngineJson(parsed, sub) {
  if (!parsed || typeof parsed !== "object") {
    return { error: "File does not contain a valid JSON object." };
  }
  if (parsed.quote && parsed.coverages) {
    return { payload: parsed, adapted: false };
  }
  if (parsed.productId || parsed.product || parsed.studios) {
    try {
      // A product definition holds no premiums. It can only be adapted when the case already carries rated coverage premiums.
      const rated = ((sub && sub.coverageRows) || []).reduce((s, r) => s + (Number(r.premVal) || 0), 0);
      if (!(rated > 0)) return { error: "This file is a product definition, which holds no premiums, and the case has no rated coverage premium. Import the rating engine's output instead." };
      const adapted = buildDynamicRatingPayloadFromProduct(parsed, sub);
      return { payload: adapted, adapted: true };
    } catch (e) {
      return { error: "Recognized this as a product-schema JSON, but couldn't derive a rating payload from it: " + e.message };
    }
  }
  return { error: "Unrecognized JSON shape — expected either a rating-engine payload ('quote' + 'coverages' keys) or a product-schema JSON ('productId'/'product'/'studios' keys)." };
}

function readAndProcessJsonFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    try {
      const parsed = JSON.parse(text);
      const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
      const normalized = normalizeRatingEngineJson(parsed, sub);
      if (normalized.error) {
        throw new Error(normalized.error);
      }
      const ratingPayload = normalized.payload;

      applyImportedRatingDataToSubmission(ratingPayload, sub);

      // Update textarea and file indicator if modal is open
      const textarea = document.getElementById("importQuoteJsonTextarea");
      if (textarea) textarea.value = JSON.stringify(ratingPayload, null, 2);

      const fileIndicator = document.getElementById("loadedFileIndicator");
      const fileNameSpan = document.getElementById("loadedFileName");
      const fileSizeSpan = document.getElementById("loadedFileSize");
      if (fileIndicator && fileNameSpan && fileSizeSpan) {
        fileNameSpan.textContent = file.name;
        fileSizeSpan.textContent = (file.size / 1024).toFixed(1) + " KB";
        fileIndicator.style.display = "flex";
      }

      // Render quote directly below summary
      renderStep7View(sub);

      setTimeout(() => {
        const quoteArea = document.getElementById("step7GeneratedQuoteArea");
        if (quoteArea) {
          quoteArea.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);

      const adaptedNote = normalized.adapted ? " (auto-adapted from a product-schema JSON)" : "";
      showToast(`🎉 File "${file.name}" imported successfully${adaptedNote}! Final Quoted Premium: $${ratingPayload.quote.finalPremium ? ratingPayload.quote.finalPremium.toLocaleString() : '39,260'}`, "success");
      persistAppState();
    } catch (err) {
      showToast("⛔ JSON File Parsing Error: " + err.message, "danger");
    }
  };
  reader.onerror = function() {
    showToast("Failed to read JSON file from system", "danger");
  };
  reader.readAsText(file);
}

/** The three stages after a quote exists: issue it, the customer accepts it, bind it. */
function renderIssueAndBindCard(sub) {
  const bound = !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber);
  const issued = !!sub.quoteIssued, approved = !!sub.customerApproved;
  const failed = sub.pasSync && sub.pasSync.status === "failed" ? sub.pasSync : null;
  const stage = (n, label, done, active) => `<div style="display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:20px; font-size:12.5px; font-weight:600; background:${done ? "#dcfce7" : (active ? "#fff7ed" : "#f1f5f9")}; color:${done ? "#166534" : (active ? "#c2410c" : "#64748b")};"><i class="ph ${done ? "ph-check-circle" : (active ? "ph-arrow-circle-right" : "ph-lock-simple")}"></i> ${n}. ${label}</div>`;
  const tracker = `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">${stage(1, "Issue quote", issued, !issued)}${stage(2, "Customer accepts", approved, issued && !approved)}${stage(3, "Bind &amp; sync to PAS", bound, issued && approved && !bound)}</div>`;
  const badge = bound ? '<span class="badge badge-success">Bound</span>' : (!issued ? '<span class="badge badge-warning">Quote not issued</span>' : (!approved ? '<span class="badge badge-warning">Awaiting customer</span>' : (failed ? '<span class="badge badge-danger">Last bind failed</span>' : '<span class="badge badge-success">Ready to bind</span>')));
  let body;
  if (bound) {
    const p = sub.pasSync;
    body = `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:12px; font-size:13px;">
        <div><span class="text-xs text-muted">Policy Number</span><br><strong class="font-mono">${p.policyNumber}</strong></div>
        <div><span class="text-xs text-muted">PAS Record ID</span><br><strong class="font-mono">${p.pasRecordId}</strong></div>
        <div><span class="text-xs text-muted">Effective Date</span><br><strong>${p.effectiveDate}</strong></div>
        <div><span class="text-xs text-muted">Synced By</span><br><strong>${p.syncedBy}</strong></div>
        <div><span class="text-xs text-muted">Synced At</span><br><strong>${p.syncedAt}</strong></div>
        ${sub.invoice ? `<div><span class="text-xs text-muted">Invoice</span><br><strong class="font-mono">${sub.invoice.invoiceNumber}</strong></div>` : ""}
      </div>
      ${sub.invoice ? `<div style="margin-top:12px;"><button class="btn btn-outline" id="downloadInvoiceBtn" onclick="downloadInvoicePdf('${sub.id}')"><i class="ph ph-receipt"></i> Download invoice (PDF)</button></div>` : ""}`;
  } else if (!issued) {
    body = `<p class="text-xs text-muted mb-2">Issuing the quote needs the underwriter's e-signature and sends the quote to the broker. Binding opens once the customer has accepted it.</p>
      <button class="btn btn-primary" id="issueQuoteBtn" onclick="openESignatureModal()"><i class="ph ph-paper-plane-tilt"></i> Issue Quote</button>`;
  } else if (!approved) {
    body = `<p class="text-xs text-muted mb-2">The quote has been issued. Binding stays locked until the customer accepts it (this prototype simulates the customer's acceptance).</p>
      <button class="btn btn-outline" id="customerApproveBtn" onclick="simulateCustomerApproval('${sub.id}')"><i class="ph ph-user-check"></i> Simulate Customer Approval</button>`;
  } else {
    body = `<p class="text-xs text-muted mb-2">Binding submits a bind request to the Policy Admin System, which returns the policy number.</p>
      ${typeof renderBindStageBanners === "function" ? renderBindStageBanners(sub) : ""}
      <div id="pasSyncStatusArea">${failed ? `<div class="alert alert-danger u-fs-12"><i class="ph ph-warning-circle"></i> <strong>Bind failed (${failed.code}):</strong> ${failed.message}</div>` : ""}</div>
      <button class="btn btn-primary" id="pasSyncBindBtn" onclick="simulatePASBindSync('${sub.id}')"><i class="ph ph-arrows-clockwise"></i> ${failed ? "Retry Bind &amp; Sync to PAS" : "Bind &amp; Sync to PAS"}</button>`;
  }
  return `<div class="card mt-3" id="pasSyncCard"${bound ? ' style="border-color:#a7f3d0;"' : ""}>
      <div class="card-header"><h3><i class="ph ph-seal-check"></i> Issue Quote &amp; Bind</h3>${badge}</div>
      <div class="card-body">${tracker}${body}</div>
    </div>`;
}

function renderStep7View(sub) {
  const container = document.getElementById("step7MainContentContainer");
  if (!container) return;
  if (!sub) sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];

  // Discretionary Pricing (Base Premium, Credit/Debit, Taxes & Fees) is only
  // shown AFTER the rating engine JSON has been imported — there is no
  // rated base premium to apply a credit/debit against before that.
  const dpContainer = document.getElementById("discretionaryPricingContainer");
  if (dpContainer) {
    dpContainer.innerHTML = (isQuoteImported && currentImportedRatingData)
      ? renderDiscretionaryPricingCard(sub)
      : "";
  }

  const titleEl = document.getElementById("step7HeaderTitle");
  const descEl = document.getElementById("step7HeaderDesc");
  const pillEl = document.getElementById("step7PhasePill");

  if (!isQuoteImported || !currentImportedRatingData) {
    if (pillEl) pillEl.innerHTML = `<i class="ph ph-calculator"></i> Step 7 • Quote & Bind Studio`;
    if (titleEl) titleEl.textContent = "Commercial Trucking Formal Quote & Binding";
    if (descEl) descEl.textContent = "Import rating engine JSON output from your local system to generate and bind the commercial quote.";

    container.innerHTML = `
      <div class="import-rating-hub-card">
        <div class="import-hub-header">
          <div class="import-hub-header-left">
            <div class="import-hub-badge-icon">
              <i class="ph ph-cpu"></i>
            </div>
            <div>
              <h3>Actuarial Rating Engine Integration</h3>
              <p>Connect and parse external rating engine computation payload</p>
            </div>
          </div>
          <span class="badge badge-warning font-mono" style="font-size: 11px; padding: 5px 10px;">
            <i class="ph ph-circle-notch ph-spin"></i> Awaiting Payload
          </span>
        </div>

        <div class="import-hub-dropzone-body" id="step7JsonDropzone" onclick="triggerSystemJsonUpload()" ondragover="handleJsonDragOver(event)" ondragleave="handleJsonDragLeave(event)" ondrop="handleJsonFileDrop(event)" title="Click to browse .json file from your system">
          <div class="import-hub-icon-wrapper">
            <i class="ph ph-cloud-arrow-up"></i>
          </div>
          <div class="import-hub-title">Import Rating Engine Output JSON</div>
          <p class="import-hub-desc">
            Drag & drop the actuarial output <code>.json</code> file from your computer here, or click the button below to browse your local filesystem.
          </p>

          <div class="import-hub-btn-row">
            <button type="button" class="btn btn-warning btn-lg" onclick="event.stopPropagation(); triggerSystemJsonUpload();" style="font-weight: 800; padding: 12px 28px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border: none; color: #ffffff; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4); font-size: 14.5px; border-radius: 8px;">
              <i class="ph ph-folder-open"></i> Browse Rating JSON from System
            </button>
          </div>

          <div class="import-features-strip">
            <div class="import-feature-chip"><i class="ph ph-lightning text-warning"></i> Auto Liability & PhysDam Rates</div>
            <div class="import-feature-chip"><i class="ph ph-chart-pie text-primary"></i> 28 Actuarial Factor Dimensions</div>
            <div class="import-feature-chip"><i class="ph ph-tag text-success"></i> Discretionary Credits</div>
            <div class="import-feature-chip"><i class="ph ph-receipt text-danger"></i> Itemized Taxes & Fees</div>
            <div class="import-feature-chip"><i class="ph ph-shield-check text-info"></i> 14 Underwriting Rule Evaluations</div>
          </div>
        </div>

        <div class="import-hub-footer">
          <span><i class="ph ph-shield-check text-primary"></i> Schema: <strong>Trucking Rating Payload (v2026.03)</strong></span>
          <span><i class="ph ph-checks text-success"></i> Real-Time Quote Calculation Ready</span>
        </div>
      </div>
    `;
    return;
  }

  // Once JSON is imported, render the generated quote!
  if (pillEl) pillEl.innerHTML = `<i class="ph ph-check-circle text-success"></i> Step 7 • Quote Generated`;
  if (titleEl) titleEl.textContent = "Commercial Trucking Formal Quote & Binding";
  if (descEl) descEl.textContent = "Generated from imported rating engine output JSON. Actuarial factors decomposed, fees itemized, and terms bindable.";

  container.innerHTML = getGeneratedQuoteHtml(currentImportedRatingData, sub) + renderIssueAndBindCard(sub);
  // keep the bottom bar (Return to queue / bound) in step with the case
  if (currentPage === "workflow" && currentWorkflowStep === 7 && sub && sub.id === activeSubmissionId && typeof updateBottomFooter === "function") {
    try { updateBottomFooter(WORKFLOW_STEPS.find(s => s.step === 7), sub); } catch (e) { /* footer not mounted */ }
  }
}

// ============================================================================
// QUOTE-BIND-ISSUE → PAS (POLICY ADMIN SYSTEM) INTEGRATION — simulated but
// functionally real: generates a policy number, records a PAS sync
// timestamp/record ID, and gates on RBAC + human decision, mirroring a real
// async system-to-system bind request rather than being purely decorative.
// ============================================================================
const PAS_LOB_PREFIX = {
  trucking: "CAT", property: "CPP", mpl: "PRO", gl_cpc: "GLC", gl_cas: "GLX", prd016: "MTR"
};

function generatePASPolicyNumber(sub) {
  const prefix = PAS_LOB_PREFIX[sub.lobKey] || "POL";
  const year = new Date().getFullYear();
  let hash = 0;
  const seed = sub.id + Date.now();
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const serial = String(hash % 900000 + 100000);
  return `${prefix}-${year}-${serial}`;
}

function simulateCustomerApproval(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  sub.customerApproved = true;
  sub.customerApprovedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: 7,
    decision: "customer_approved",
    by: sub.insured || "Customer",
    at: sub.customerApprovedAt,
    notes: "Customer approved the issued quote — ready to bind & sync to PAS."
  });

  showToast(`✅ ${sub.insured} approved the quote. Ready to bind & sync to PAS.`, "success");
  renderStep7View(sub);
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
}
window.simulateCustomerApproval = simulateCustomerApproval;

function simulatePASBindSync(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  if (!hasPermission("workflow", "approve")) {
    denyPermission("workflow", "approve");
    return;
  }

  // Defense-in-depth: even if this got called out of band, don't allow a
  // bind unless the quote was actually issued and the customer approved it.
  if (!sub.quoteIssued) {
    showToast("⛔ Issue the quote before binding & syncing to PAS.", "danger");
    return;
  }
  if (!sub.customerApproved) {
    showToast("⛔ Customer approval is required before binding & syncing to PAS.", "danger");
    return;
  }

  const btn = document.getElementById("pasSyncBindBtn");
  const statusArea = document.getElementById("pasSyncStatusArea");
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="ph ph-circle-notch"></i> Submitting bind request to PAS...`; }
  if (statusArea) statusArea.innerHTML = `<div class="alert alert-info u-fs-12"><i class="ph ph-circle-notch"></i> Contacting Policy Admin System...</div>`;

  setTimeout(() => {
    if (btn) btn.innerHTML = `<i class="ph ph-circle-notch"></i> PAS validating bind request...`;

    setTimeout(() => {
      // Simulated failure path — a real downstream PAS integration doesn't
      // always succeed (timeout, duplicate policy number rejection, etc.).
      // ~15% failure rate here so the workflow actually demonstrates
      // handling an integration failure, not just the happy path.
      const failureRoll = Math.random();
      if (failureRoll < 0.15) {
        const failureReasons = [
          { code: "PAS_TIMEOUT", msg: "Policy Admin System did not respond within the expected window (timeout after 30s)." },
          { code: "PAS_DUP_POLICY", msg: "PAS rejected the bind request: a policy record already exists for this submission ID." },
          { code: "PAS_VALIDATION_FAILED", msg: "PAS validation failed: coverage/limit combination does not match a filed program in the target state." }
        ];
        const failure = failureReasons[Math.floor(Math.random() * failureReasons.length)];

        sub.pasSync = { status: "failed", code: failure.code, message: failure.msg, failedAt: new Date().toISOString().slice(0, 16).replace("T", " ") };

        if (!sub.decisionLog) sub.decisionLog = [];
        sub.decisionLog.push({
          step: 7,
          decision: "bind_sync_failed",
          by: (USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior).name,
          at: sub.pasSync.failedAt,
          notes: `PAS bind/sync failed (${failure.code}): ${failure.msg}`
        });

        if (statusArea) statusArea.innerHTML = `<div class="alert alert-danger u-fs-12"><i class="ph ph-warning-circle"></i> <strong>Bind failed (${failure.code}):</strong> ${failure.msg}</div>`;
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="ph ph-arrows-clockwise"></i> Retry Bind &amp; Sync to PAS`; }

        showToast(`⛔ PAS bind/sync failed: ${failure.msg}`, "danger");
        renderSubmissionsTable();
        refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
        return;
      }

      const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
      const policyNumber = generatePASPolicyNumber(sub);
      const pasRecordId = `PAS-REC-${Math.floor(100000 + Math.random() * 900000)}`;
      const now = new Date();
      const effectiveDate = now.toISOString().slice(0, 10);
      const syncedAt = now.toISOString().slice(0, 16).replace("T", " ");

      sub.pasSync = {
        status: "success",
        policyNumber,
        pasRecordId,
        effectiveDate,
        syncedBy: `${roleConfig.name} (${roleConfig.title.split(' (')[0]})`,
        syncedAt
      };
      // The invoice is made now, from the bound policy; it is not downloaded automatically.
      if (typeof createInvoiceRecord === "function") createInvoiceRecord(sub);

      if (!sub.decisionLog) sub.decisionLog = [];
      sub.decisionLog.push({
        step: 7,
        decision: "bound_and_synced",
        by: sub.pasSync.syncedBy,
        at: syncedAt,
        notes: `Bound and synced to PAS. Policy Number: ${policyNumber}, PAS Record ID: ${pasRecordId}.`
      });

      sub.statusText = "Policy Issued";
      sub.statusBadge = "badge-success";
      if (!sub.completedSteps) sub.completedSteps = [];
      if (!sub.completedSteps.includes(7)) sub.completedSteps.push(7);
      if (!sub.completedSteps.includes(8)) sub.completedSteps.push(8);   // Policy Issuance & Terms exists from the bind

      recordQuoteVersion(sub, true);

      renderStep7View(sub);

      showToast(`✅ Bound and synced to PAS. Policy Number: ${policyNumber}`, "success");
      renderSubmissionsTable();
      refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
    }, 900);
  }, 900);
}

// Cost-Breakdown-by-Category helpers (Fee Schedule / Credits redesign) —
// classify each fee into a display category using its code/name/chargeType,
// since the source rating payload doesn't carry an explicit category field.
function categorizeFee(f) {
  var n = ((f.name || "") + " " + (f.code || "")).toLowerCase();
  if (n.indexOf("surcharge") !== -1 || n.indexOf("hrisk") !== -1 || n.indexOf("high-risk") !== -1 || n.indexOf("yngdrv") !== -1 || n.indexOf("young") !== -1 || n.indexOf("sr22") !== -1 || n.indexOf("sr-22") !== -1) return "Surcharges";
  if (n.indexOf("inspect") !== -1 || n.indexOf("mvr") !== -1 || n.indexOf("csa") !== -1 || n.indexOf("report") !== -1) return "Reports & Verification";
  if (f.chargeType === "Per Driver") return "Driver-Level Fees";
  return "Policy-Level Fees";
}

const FEE_CATEGORY_COLORS = {
  "Policy-Level Fees": "#475569",
  "Driver-Level Fees": "#C2540D",
  "Reports & Verification": "#65783F",
  "Surcharges": "#B45309"
};
const FEE_CATEGORY_ORDER = ["Policy-Level Fees", "Driver-Level Fees", "Reports & Verification", "Surcharges"];

function renderCostBreakdownSection(title, subtitleCount, totalLabel, totalAmt, rows, opts) {
  opts = opts || {};
  const grouped = opts.grouped;
  let barAndLegendHtml = "";
  let bodyHtml = "";

  if (grouped) {
    // Group rows by category, compute per-category subtotal + % of total.
    const groups = {};
    rows.forEach(r => {
      const cat = categorizeFee(r);
      if (!groups[cat]) groups[cat] = { rows: [], subtotal: 0 };
      groups[cat].rows.push(r);
      groups[cat].subtotal += (r.amt || 0);
    });
    const orderedCats = FEE_CATEGORY_ORDER.filter(c => groups[c]);
    const grandTotal = orderedCats.reduce((s, c) => s + groups[c].subtotal, 0) || 1;

    barAndLegendHtml = `
      <div class="cbc-bar-track">
        ${orderedCats.map(c => `<div class="cbc-bar-seg" style="width:${(groups[c].subtotal / grandTotal * 100).toFixed(1)}%; background:${FEE_CATEGORY_COLORS[c]};"></div>`).join("")}
      </div>
      <div class="cbc-legend">
        ${orderedCats.map(c => `<span class="cbc-legend-item"><span class="cbc-legend-dot" style="background:${FEE_CATEGORY_COLORS[c]};"></span>${c} ${(groups[c].subtotal / grandTotal * 100).toFixed(0)}%</span>`).join("")}
      </div>`;

    bodyHtml = orderedCats.map(c => `
      <div class="cbc-group-header">
        <span><span class="cbc-legend-dot" style="background:${FEE_CATEGORY_COLORS[c]};"></span><strong>${c}</strong></span>
        <strong class="font-mono">$${groups[c].subtotal.toLocaleString()}</strong>
      </div>
      ${groups[c].rows.map(f => renderCostBreakdownRow(f)).join("")}
    `).join("");
  } else {
    bodyHtml = rows.length ? rows.map(r => renderCostBreakdownRow(r)).join("") : `<div class="empty-state" style="padding:16px 0;"><i class="ph ph-receipt empty-state-icon"></i><div class="empty-state-body">${opts.emptyText || 'None on file.'}</div></div>`;
  }

  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body">
        <div class="cbc-header">
          <div>
            <div class="cbc-title">${title}</div>
            <div class="cbc-subtitle">${subtitleCount}</div>
          </div>
          <div class="cbc-total">
            <div class="cbc-total-label">${totalLabel}</div>
            <div class="cbc-total-val">${totalAmt}</div>
          </div>
        </div>
        ${barAndLegendHtml}
        <div class="table-responsive" style="max-height: 420px; overflow-y: auto;">
          ${bodyHtml}
        </div>
      </div>
    </div>`;
}

function renderCostBreakdownRow(r) {
  // Works for fees (name/code/chargeType/amt), discounts (name/value/amt/why),
  // and evaluated-not-applied rules (name/code/reason/undetermined) — whichever
  // fields exist are used, nothing invented.
  const name = r.name || "—";
  const code = r.code || "";
  const desc = r.valueType === "Percent" ? `${r.pct}% of ${r.percentOf}` :
               (r.unit !== undefined ? `$${r.unit} Flat${r.qty > 1 ? ` × ${r.qty}` : ''}` :
               (r.value !== undefined ? `${(r.value * 100).toFixed(0)}% Credit` : (r.reason || '')));
  const pillText = r.chargeType || (r.value !== undefined ? "Discount" : (r.undetermined ? "Undetermined" : (r.reason && r.reason.includes("priced") ? "Priced in Chain" : "Condition Not Met")));
  const amtDisplay = r.amt !== undefined ? `${r.value !== undefined || (r.amt < 0) ? '-' : ''}$${Math.abs(r.amt).toLocaleString()}` : null;
  const subDesc = r.why || r.reason || "";

  return `
    <div class="cbc-row">
      <div class="cbc-row-name">
        <strong>${name}</strong>
        ${code ? `<span class="cbc-row-code">${code}</span>` : (subDesc ? `<span class="cbc-row-code">${subDesc}</span>` : '')}
      </div>
      <div class="cbc-row-desc">${desc}</div>
      <div class="cbc-row-badge"><span class="cbc-pill">${pillText}</span></div>
      <div class="cbc-row-amt">${amtDisplay !== null ? amtDisplay : ''}</div>
    </div>`;
}

function getGeneratedQuoteHtml(data, sub) {
  const q = data.quote || {};
  const coverages = data.coverages || [];
  const fees = q.fees || [];
  const discounts = q.discounts || [];
  const notApplied = q.creditsNotApplied || [];
  const eligibility = data.eligibility || { declines: [], refers: [] };
  const adapter = data.adapter || { fieldsMapped: 23, warnings: [] };

  // Map the quote's final premium to the Underwriting Discretionary Pricing
  // (Post-Rating) outcome, so "TOTAL BINDABLE POLICY PREMIUM" and "Final
  // Annual Total" always match the Final Quoted Premium shown on that card.
  // Only applies when `sub` is a real tracked submission (this function is
  // also called from the Quote Version History preview with a different,
  // unrelated flat quote-record shape that has no discretionary pricing).
  const isTrackedSubmission = sub && sub.id && SUBMISSIONS_DATASET.some(s => s.id === sub.id);
  if (isTrackedSubmission) {
    const dp = ensureDiscretionaryPricingSeed(sub);
    q.finalPremium = dp.finalPremium;
    // Base Premium (Discretionary Pricing card) and Base Coverage Premium
    // (this Quote hero strip) must always be the exact same number, computed
    // once before any Underwriter Credit/Debit, Broker Fee, or Taxes &
    // Fees are applied — never two independently-derived/hardcoded values.
    q.coveragePremium = dp.basePremium;
  }

  const totalFeeAmt = fees.reduce((sum, f) => sum + (f.amt || 0), 0);
  // Tax is shown once, from the confirmed surplus lines basis (surplus-lines.js); the rating engine's own tax figure is only reconciled there.
  const taxInfo = isTrackedSubmission && typeof slTaxFor === "function" ? slTaxFor(sub) : null;
  const totalTaxAmt = taxInfo ? taxInfo.total : ((q.tax || 0) + (q.countyTax || 0));
  const taxNote = taxInfo ? taxInfo.note + (taxInfo.county ? ` + county $${taxInfo.county.toLocaleString()}` : "") : `SL 4.85% ($${(q.tax||1590).toLocaleString()}) + county ($${(q.countyTax||180).toLocaleString()})`;
  const annualTotal = (q.finalPremium || 39260) + (taxInfo ? totalTaxAmt : 0);
  const discountAmt = discounts.reduce((sum, d) => sum + Math.abs(d.amt || 0), 0);

  return `
    <!-- Top Quote Generated Status Header -->
    <div class="quote-generated-badge-strip mb-3">
      <div class="u-row-gap10">
        <i class="ph ph-check-circle text-success" style="font-size: 20px;"></i>
        <div>
          <span style="font-size: 13.5px; font-weight: 800; color: #166534;">Commercial Trucking Formal Bindable Quote</span>
          <div class="text-xs text-muted u-m0">Generated from rating engine output JSON payload (${q.ratingVersion || 'v2026.03'})</div>
        </div>
      </div>
      <div class="u-row-gap8">
        <button class="btn btn-xs btn-warning u-fw-700" onclick="triggerSystemJsonUpload()">
          <i class="ph ph-file-arrow-up"></i> Re-Import JSON
        </button>
      </div>
    </div>

    <!-- Top Executive Carrier Quote Sheet Card -->
    <div class="quote-hero-card">
      <div class="quote-hero-left">
        <div class="quote-hero-title-row">
          <i class="ph ph-shield-check text-warning u-fs-24"></i>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase;">APEX MUTUAL INSURANCE GROUP • NAIC #40921</div>
            <h2>${q.lob || 'Commercial Trucking'} • Formal Bindable Quote</h2>
          </div>
          <span class="badge badge-primary font-mono">${q.ratingVersion || 'v2026.03'}</span>
          ${eligibility.refers && eligibility.refers.length > 0 ? `<span class="badge badge-warning font-bold"><i class="ph ph-warning"></i> Referral: ${eligibility.refers.join(', ')}</span>` : '<span class="badge badge-success"><i class="ph ph-shield-check"></i> Standard Clear</span>'}
        </div>
        <div class="quote-hero-meta mt-1">
          <span><i class="ph ph-building-office"></i> Insured: <strong>${sub.insured}</strong></span>
          <span><i class="ph ph-hash"></i> Quote #: <strong>${sub.quoteNo || 'QT-2026-89412'}</strong></span>
          <span><i class="ph ph-map-pin"></i> Garaging: <strong>${q.state || 'TX'} (${q.countyName || 'Denton County'})</strong></span>
          <span><i class="ph ph-handshake"></i> Producing Broker: <strong>${sub.broker}</strong></span>
          <span><i class="ph ph-calendar"></i> Term: <strong>12 Months</strong> (Valid 30 Days)</span>
        </div>
      </div>
      <div class="quote-hero-right">
        <div class="quote-hero-price-box">
          <div class="qhp-lbl">TOTAL BINDABLE POLICY PREMIUM</div>
          <div class="qhp-val">$${(q.finalPremium || 39260).toLocaleString()}</div>
        </div>
      </div>
    </div>

    <!-- 5-Metric Financial Decomposition Strip -->
    <div class="quote-kpi-summary-strip">
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-stack text-primary"></i> 1. Base Coverage Premium</span>
        <strong class="qkpi-val text-primary">$${(q.coveragePremium || 35062).toLocaleString()}</strong>
        <span class="qkpi-sub">Liability ($${((coverages[0] && coverages[0].subtotal) || 15440).toLocaleString()}) + PhysDam ($${((coverages[1] && coverages[1].subtotal) || 19622).toLocaleString()})</span>
      </div>
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-tag text-success"></i> 2. Applied Discounts</span>
        <strong class="qkpi-val text-success">-$${discountAmt.toLocaleString()}</strong>
        <span class="qkpi-sub">${discounts.map(d => d.name).join(', ') || '0 Applied'}</span>
      </div>
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-receipt text-warning"></i> 3. Statutory & Broker Fees</span>
        <strong class="qkpi-val text-warning">+$${totalFeeAmt.toLocaleString()}</strong>
        <span class="qkpi-sub">${fees.length} Mandatory Fees Schedule</span>
      </div>
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-bank text-danger"></i> 4. State & County Taxes</span>
        <strong class="qkpi-val text-danger">+$${totalTaxAmt.toLocaleString()}</strong>
        <span class="qkpi-sub">${taxNote}</span>
      </div>
      <div class="qkpi-card" style="background: #f0fdf4; border-color: #86efac;">
        <span class="qkpi-lbl text-success"><i class="ph ph-lock"></i> 5. Final Annual Total (premium + taxes)</span>
        <strong class="qkpi-val text-success font-bold" style="font-size: 20px;">$${annualTotal.toLocaleString()}</strong>
        <span class="qkpi-sub text-success font-bold">12-Month Bind Terms</span>
      </div>
    </div>

    <!-- Main Split Grid (Coverage Decomposition & Factors VS Fees & Rules) -->
    <!-- Coverage Lines — side by side, equal height, timeline design -->
    <div class="coverage-lines-row">
      ${coverages.map((cov, idx) => {
        const factors = cov.factors || [];
        return `
        <div class="tl-card">
          <div class="tl-header">
            <div>
              <div class="tl-label">Coverage Line ${idx + 1}</div>
              <div class="tl-title">${cov.name} Coverage</div>
            </div>
            <div class="tl-subtotal-box">
              <div class="tl-subtotal-label">Subtotal</div>
              <div class="tl-subtotal-val">$${(cov.subtotal || 0).toLocaleString()}</div>
            </div>
          </div>
          <div class="tl-timeline">
            ${factors.map((f, fIdx) => {
              const displayVal = typeof f.value === "number" ? (f.value >= 100 ? f.value.toLocaleString() : f.value) : f.value;
              const subText = [f.input, f.matched].filter(Boolean).join(" — ") || f.matched || f.input || "";
              return `
              <div class="tl-item">
                <div class="tl-item-content">
                  <div class="tl-item-top">
                    <strong>${f.label}</strong>
                    <span class="tl-item-val">${displayVal}</span>
                  </div>
                  ${subText ? `<div class="tl-item-sub">${subText}</div>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
          <div class="tl-summary">
            <i class="ph ph-arrow-bend-down-right"></i> Rated exposure resolves to a subtotal of <strong>$${(cov.subtotal || 0).toLocaleString()}</strong>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Applied Credits & Deductions — full width, below the coverage lines -->
    ${renderCostBreakdownSection(
      "Applied Credits & Deductions",
      `${discounts.length} credit${discounts.length === 1 ? '' : 's'} applied to this policy`,
      "Total savings",
      `-$${discounts.reduce((s, d) => s + Math.abs(d.amt || 0), 0).toLocaleString()}`,
      discounts,
      { grouped: false, emptyText: "No discretionary discounts applied." }
    )}

    <!-- Remaining itemized cards — stacked full width below -->
    <div style="display: flex; flex-direction: column; gap: 20px;">

        <!-- Statutory & Broker Fee Schedule Card -->
        ${renderCostBreakdownSection(
          "Cost breakdown by category",
          `${fees.length} fee${fees.length === 1 ? '' : 's'} applied to this policy`,
          "Total fees",
          `$${totalFeeAmt.toLocaleString()}`,
          fees,
          { grouped: true }
        )}

        <!-- Underwriting Eligibility & Credits Evaluated Log -->
        ${renderCostBreakdownSection(
          "Credits & Surcharges Evaluated",
          `${adapter.fieldsMapped || 23} fields mapped from the rating engine`,
          "Not applied",
          `${notApplied.length}`,
          notApplied,
          { grouped: false, emptyText: "All evaluated credits and surcharges were applied." }
        )}

        <!-- Mandatory Subjectivities & Bind Conditions Box -->
        <div class="card">
          <div class="card-header" style="background: #fffbeb; border-bottom-color: #fef3c7;">
            <h3 style="margin: 0; font-size: 13.5px; color: #92400e;"><i class="ph ph-clipboard-text text-warning"></i> Mandatory Bind Subjectivities</h3>
          </div>
          <div class="card-body py-2 px-3" style="font-size: 11.5px; color: #78350f;">
            ${typeof renderSubjectivitiesQuoteList === "function" ? renderSubjectivitiesQuoteList(sub) : `<ul style="margin: 0; padding-left: 18px; line-height: 1.5;">
              <li>Receipt & satisfactory review of Motor Vehicle Records (MVRs) for all 4 drivers within 15 days of bind.</li>
              <li>Signed and dated ACORD 125 & ACORD 137 applications on file.</li>
              <li>Satisfactory verification of down payment installment ($3,926.00).</li>
            </ul>`}
          </div>
        </div>

    </div>

    <!-- Bottom Quote Issuance & Delivery Action Panel -->
    <div class="card mt-3" style="border: 1px solid #cbd5e1; box-shadow: var(--shadow-md);">
      <div class="card-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
        <div class="u-row-gap10">
          <i class="ph ph-paper-plane-tilt text-warning" style="font-size: 18px;"></i>
          <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #ffffff;">Issue Commercial Trucking Formal Quote</h3>
        </div>
        <span class="badge badge-success font-mono" id="quoteIssuanceStatusBadge">30-Day Bind Window Active</span>
      </div>
      <div class="card-body p-4">
        ${typeof renderSubjectivitiesBindBanner === "function" ? renderSubjectivitiesBindBanner(sub, "quote") : ""}
        ${typeof renderNoticesBindBanner === "function" ? renderNoticesBindBanner(sub) : ""}
        ${typeof renderTriaBindBanner === "function" ? renderTriaBindBanner(sub, "quote") : ""}
        ${typeof renderProducerBindBanner === "function" ? renderProducerBindBanner(sub) : ""}
        ${typeof renderSanctionsBindBanner === "function" ? renderSanctionsBindBanner(sub) : ""}
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
          <div>
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 800; color: #0f172a;">Select Quote Delivery Target:</h4>
            <div class="issuance-radios-grid" style="flex-direction: row; flex-wrap: wrap;">
              <label class="issuance-radio-box selected" id="targetBrokerBox">
                <input type="radio" id="radioTargetBroker" name="policyRecipientTarget" value="broker" checked onchange="updateIssuanceRecipientUI()">
                <span class="radio-content"><span class="rc-title">Producing Broker Agency (${(sub.broker || 'Marsh').split(' ')[0]})</span></span>
              </label>
              <label class="issuance-radio-box" id="targetCustomerBox">
                <input type="radio" id="radioTargetCustomer" name="policyRecipientTarget" value="customer" onchange="updateIssuanceRecipientUI()">
                <span class="radio-content"><span class="rc-title">Direct Insured Customer (${sub.insured})</span></span>
              </label>
              <label class="issuance-radio-box" id="targetBothBox">
                <input type="radio" id="radioTargetBoth" name="policyRecipientTarget" value="both" onchange="updateIssuanceRecipientUI()">
                <span class="radio-content"><span class="rc-title">Simultaneous Dual Dispatch (Both)</span></span>
              </label>
            </div>
          </div>
          <div class="u-row-gap10">
            <button type="button" class="btn btn-success btn-lg" id="btnIssueQuote" onclick="issueQuoteAction()" ${sub.quoteIssued ? "disabled" : ""} style="font-weight: 800; padding: 12px 28px; font-size: 15px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);" class="${sub.quoteIssued ? "disabled" : ""}">
              <i class="ph ${sub.quoteIssued ? "ph-check-circle" : "ph-paper-plane-tilt"}"></i> ${sub.quoteIssued ? "QUOTE OFFICIALLY ISSUED" : "Issue Quote"}
            </button>
            <button type="button" class="btn btn-outline btn-lg" onclick="openViewQuoteSidebar('${sub.id}')" style="font-weight: 700; padding: 12px 22px; font-size: 15px;">
              <i class="ph ph-eye"></i> View Quote
            </button>
          </div>
        </div>

        <!-- Dynamic Success Banner when Issued -->
        <div id="issuedQuoteSuccessBanner" style="display: ${sub.quoteIssued ? "flex" : "none"}; margin-top: 18px; padding: 16px 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: var(--radius-md); align-items: center; gap: 14px;">
          <div style="width: 42px; height: 42px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;">
            <i class="ph ph-check-circle"></i>
          </div>
          <div>
            <h4 style="margin: 0; font-size: 14.5px; font-weight: 800; color: #166534;">Commercial Trucking Quote Issued Successfully!</h4>
            <p style="margin: 3px 0 0 0; font-size: 12.5px; color: #15803d;" id="issuedQuoteRecipientDetails">
              Quote documentation & bind terms have been dispatched to the selected recipient inbox.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
