/**
 * ============================================================================
 * WORKFLOW STEPS: shared pages, ingest / triage / extract views (Steps 1 to 4)
 * ----------------------------------------------------------------------------
 * The workflow has fourteen steps (WORKFLOW_STEPS in data-config.js). Several of them share a page, so this file
 * decides what each step shows, and adds the parts of the first four steps that had no screen of their own:
 *
 *   Step 1  Ingest              what arrived, exactly as received. Nothing is read, cleaned or changed.
 *   Step 2  Triage & Clearance  what kind of message it is, who it names, which documents are there and which are
 *                               not, and whether the insured is already in the system; then the legal checks.
 *   Step 3  Extract             each file is read by the extractor its type needs, and the result is listed.
 *   Step 4  Confirm             the person checks what was read and applies it; completeness is checked here.
 *
 * Triage runs BEFORE extraction, so the legal checks cannot wait for the full read. TRIAGE QUICK READ takes the
 * insured, FEIN, DOT, MC, address, producer and contact from the email text alone (the same rule-based reader as
 * Step 3), and fills only fields that are still placeholders. It is marked preliminary on the case
 * (sub.triage.read), the raw email and attachments are never touched, and Step 4 replaces the values with the
 * confirmed ones.
 *
 * Any module can add a panel to a step with registerStepRenderer(name, fn); the functions run each time the
 * downstream screens are drawn, and a failure in one never stops the others.
 * ============================================================================
 */

function wsEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function wsSub() { return typeof activeSubmissionId !== "undefined" ? (SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null) : null; }
function wsNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function wsActor() { const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || {}; return (r.name || currentUserRole) + (r.title ? " (" + r.title + ")" : ""); }
function wsLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 1, decision: decision, by: wsActor(), at: wsNow(), notes: notes });
}
function wsPersist() { if (typeof persistAppState === "function") persistAppState(); }
function wsIsPlaceholder(v) { return v === undefined || v === null || v === "" || v === "PENDING" || /^\((?:pending|see raw)/i.test(String(v)); }

// ----------------------------------------------------------------------------
// 1. WHICH CARDS A STEP SHOWS
// ----------------------------------------------------------------------------
const WS_VIEW_TEXT = {
  ingest: ["Submission Ingest", "What arrived with this submission, kept exactly as received. Nothing is read, cleaned or changed at this step."],
  extract: ["Document Extraction", "Each file is read by the extractor its type needs. A value that is not in a document is left blank, never guessed."],
  confirm: ["Confirm Extracted Data", "Check what was read, fix anything that is wrong, then apply it. Values read with high confidence and no conflict are already accepted; the rest are listed first."]
};

/** Shows the cards that belong to this step on its page and hides the others on that page. */
function applyWorkflowView(stepObj, sub) {
  if (!stepObj) return;
  const screen = document.getElementById(stepObj.id);
  if (!screen) return;
  screen.setAttribute("data-view", stepObj.view || "");
  screen.querySelectorAll("[data-views]").forEach(el => {
    const on = el.getAttribute("data-views").split(/\s+/).indexOf(stepObj.view) > -1;
    el.classList.toggle("wf-view-off", !on);
  });
  const text = WS_VIEW_TEXT[stepObj.view];
  const h = document.getElementById("ingestScreenTitle"), d = document.getElementById("ingestScreenDesc");
  if (text && h) h.textContent = text[0];
  if (text && d) d.textContent = text[1];
  const pill = document.getElementById("step7PhasePill");
  if (pill && stepObj.id === "screen-8") pill.innerHTML = '<i class="ph ph-calculator"></i> Stage ' + stepObj.stage + " • " + wsEsc(stepObj.title);
  if (stepObj.view === "bind") setTimeout(() => { const c = document.getElementById("pasSyncCard"); if (c && currentWorkflowStep === BIND_STEP) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
}
window.applyWorkflowView = applyWorkflowView;

// ----------------------------------------------------------------------------
// 2. PANEL REGISTRY (one wrapper on the downstream render, many panels)
// ----------------------------------------------------------------------------
var WS_RENDERERS = [];
function registerStepRenderer(name, fn) {
  WS_RENDERERS = WS_RENDERERS.filter(r => r.name !== name);
  WS_RENDERERS.push({ name: name, fn: fn });
}
window.registerStepRenderer = registerStepRenderer;

// ----------------------------------------------------------------------------
// 3. WHAT KIND OF DOCUMENT IS IT
// ----------------------------------------------------------------------------
const WS_DOC_TYPES = [
  { key: "acord125", label: "ACORD 125, Commercial Insurance Application", name: /acord[\s_-]*125|commercial[\s_-]*(insurance[\s_-]*)?application/i, text: /ACORD\s*125|COMMERCIAL INSURANCE APPLICATION/i },
  { key: "acord126", label: "ACORD 126, Commercial General Liability Section", name: /acord[\s_-]*126/i, text: /ACORD\s*126|COMMERCIAL GENERAL LIABILITY SECTION/i },
  { key: "acord127", label: "ACORD 127, Business Auto Section", name: /acord[\s_-]*127/i, text: /ACORD\s*127|BUSINESS AUTO SECTION/i },
  { key: "acord140", label: "ACORD 140, Property Section", name: /acord[\s_-]*140/i, text: /ACORD\s*140|PROPERTY SECTION/i },
  { key: "loss_run", label: "Loss run", name: /loss[\s_-]*runs?|claims?[\s_-]*(history|report)/i, text: /loss\s*-?\s*run|currently\s+valued|claims?\s+(history|report)/i },
  { key: "sov", label: "Statement of values", name: /(?:^|[^a-z0-9])sov(?![a-z0-9])|statement[\s_-]*of[\s_-]*values?|schedule[\s_-]*of[\s_-]*(locations|values)/i, text: /statement of values|schedule of locations|total insured value|\bTIV\b/i },
  { key: "dec_page", label: "Declarations page", name: /dec(laration)?s?[\s_-]*page|(?:^|[^a-z0-9])decs(?![a-z0-9])/i, text: /declarations?\s+page|policy\s+declarations/i },
  { key: "ifta", label: "IFTA fuel-tax report", name: /(?:^|[^a-z0-9])ifta(?![a-z0-9])/i, text: /\bIFTA\b|International Fuel Tax/i },
  { key: "mvr", label: "Motor vehicle records (MVR)", name: /(?:^|[^a-z0-9])mvrs?(?![a-z0-9])|motor[\s_-]*vehicle[\s_-]*records?/i, text: /motor vehicle records?|\bMVR\b/i },
  { key: "driver_list", label: "Driver list", name: /driver/i, text: /driver\s+(list|schedule)/i },
  { key: "vehicle_schedule", label: "Vehicle schedule", name: /vehicle|power[\s_-]*units?|fleet|unit[\s_-]*schedule/i, text: /vehicle\s+schedule|\bVIN\b/i },
  { key: "narrative", label: "Broker narrative", name: /narrative|cover[\s_-]*letter|operations/i, text: /narrative|description of operations/i }
];

/** The type of a document, from its file name first and from the start of its text when the name does not say. */
function recognizeDocument(name, text) {
  const nm = String(name || ""), sample = String(text || "").slice(0, 4000);
  for (const t of WS_DOC_TYPES) if (t.name.test(nm)) return { key: t.key, label: t.label, by: "file name" };
  if (sample) for (const t of WS_DOC_TYPES) if (t.text.test(sample)) return { key: t.key, label: t.label, by: "content" };
  return { key: "other", label: "Other document", by: "" };
}
window.recognizeDocument = recognizeDocument;

// ----------------------------------------------------------------------------
// 4. TRIAGE: KIND OF MESSAGE, QUICK READ, DOCUMENTS EXPECTED, DUPLICATES
// ----------------------------------------------------------------------------
const TRIAGE_KINDS = {
  new_submission: { label: "New submission", badge: "badge-success", next: "A new risk. Continue to the legal checks and clearance below." },
  renewal: { label: "Renewal", badge: "badge-info", next: "This reads as a renewal. Renewals belong on the renewal pipeline; create it as new business only if it is a different risk." },
  endorsement: { label: "Policy change request", badge: "badge-warning", next: "This reads as a change to a policy that already exists. Handle it as an endorsement, not as new business." },
  followup: { label: "Follow-up to an open case", badge: "badge-warning", next: "This refers to a case that is already open. Attach it to that case rather than working it as a new one." },
  not_insurance: { label: "Not an insurance submission", badge: "badge-danger", next: "Nothing here looks like a submission (no insured, no identifiers, no coverage request). Decline or discard it." }
};

/** What the message is, from its text and attachments alone. Returns { kind, reasons }. */
function triageClassify(sub) {
  const text = String(sub.rawEmailText || "");
  const files = (sub.rawAttachments || []).map(a => a.name).join(" ");
  if (!text && !files) return { kind: "new_submission", reasons: ["Entered directly, not received by email."] };
  const ref = /\bSUB-[A-Z0-9-]+\b/.exec(text);
  if (ref && ref[0] !== sub.id && SUBMISSIONS_DATASET.some(s => s.id === ref[0])) return { kind: "followup", reasons: ["The message names the open case " + ref[0] + "."], ref: ref[0] };
  if (/\brenew(al|als|ing)?\b|expiring\s+(policy|term)/i.test(text)) return { kind: "renewal", reasons: ["The message talks about renewing or an expiring policy."] };
  if (/\bendorse(ment|ments)?\b|mid-?term|\b(add|remove|delete)\s+(a\s+|the\s+)?(vehicle|driver|location|unit)\b|\bpolicy\s+change\b|\bcancel(lation)?\b/i.test(text) && /\bpolic(y|ies)\s*(no\.?|number|#)/i.test(text)) return { kind: "endorsement", reasons: ["The message names an existing policy and asks for a change."] };
  const signals = {};
  (text + " " + files).replace(/\b(USDOT|DOT|MC\s?#?|FEIN|EIN|loss\s*runs?|ACORD|effective date|policy|coverage|limit|liability|vehicles?|drivers?|fleet|garag\w+|quote|submission|premium|insured|applicant|schedule)\b/gi, m => { signals[m.toLowerCase().replace(/\s+/g, " ")] = true; return m; });
  const n = Object.keys(signals).length;
  if (n < 2) return { kind: "not_insurance", reasons: ["Only " + n + " insurance term" + (n === 1 ? "" : "s") + " found in the text and file names."] };
  return { kind: "new_submission", reasons: [n + " insurance terms found (" + Object.keys(signals).slice(0, 5).join(", ") + ")."] };
}

/**
 * Reads the identity of the insured from the email text alone, so the legal checks have something to check before the
 * full extraction. Fills only fields that are still placeholders; the raw text is not touched.
 */
function triageQuickRead(sub) {
  if (!sub || !sub.rawEmailText || sub.normalizationStatus !== "pending" || typeof buildLocalNormalizationDraft !== "function") return null;
  let d;
  try { d = buildLocalNormalizationDraft(sub); } catch (e) { return null; }
  const pick = k => (d[k] === null || d[k] === undefined || d[k] === "") ? null : String(d[k]);
  const read = { insured: pick("insured"), fein: pick("fein"), dot: pick("dot"), mcNumber: pick("mcNumber"), address: pick("address"), broker: pick("broker"), email: pick("email") };
  const filled = [];
  Object.keys(read).forEach(k => { if (read[k] && wsIsPlaceholder(sub[k])) { sub[k] = read[k]; filled.push(k); } });
  sub.triage = Object.assign({}, sub.triage, { read: read, readAt: wsNow(), method: "Quick read of the email text only", filled: filled });
  return read;
}
window.triageQuickRead = triageQuickRead;

/** The documents a risk of this line normally arrives with, and which of them are here (by file name or by what the email text carries). */
function triageExpectedDocs(sub) {
  const text = String(sub.rawEmailText || "");
  const have = {};
  (sub.rawAttachments || []).forEach(a => { have[recognizeDocument(a.name, "").key] = a.name; });
  (sub.docs || []).forEach(d => { const k = recognizeDocument(d.name, "").key; if (!have[k] && !/^Raw Upload/i.test(d.desc || "")) have[k] = d.name; });
  const inText = {
    loss_run: /loss\s*(run|history)|prior\s+losses|claims?\s+history/i.test(text) ? "email text" : null,
    vehicle_schedule: /\bUnit\s*\d+\s*:|\bVehicles?\s*:/i.test(text) ? "email text" : null,
    driver_list: /\bDriver\s*\d+\s*:|\bDrivers?\s*:/i.test(text) ? "email text" : null,
    application: /(named\s+insured|applicant|insured)\s*:/i.test(text) && /\b(fein|ein|tax\s*id)\b/i.test(text) ? "email text" : null
  };
  const need = {
    trucking: [["application", "Application (ACORD 125 / 127)", ["acord125", "acord127"]], ["loss_run", "Loss runs", ["loss_run"]], ["vehicle_schedule", "Vehicle schedule", ["vehicle_schedule"]], ["driver_list", "Driver list or MVRs", ["driver_list", "mvr"]]],
    property: [["application", "Application (ACORD 125 / 140)", ["acord125", "acord140"]], ["sov", "Statement of values", ["sov"]], ["loss_run", "Loss runs", ["loss_run"]]]
  }[sub.lobKey || "trucking"] || [["application", "Application (ACORD 125)", ["acord125", "acord126"]], ["loss_run", "Loss runs", ["loss_run"]]];
  return need.map(([key, label, kinds]) => {
    const hit = kinds.find(k => have[k]);
    return { key: key, label: label, present: !!(hit || inText[key] || (inText[kinds[0]])), via: hit ? have[hit] : (inText[key] || inText[kinds[0]] || null) };
  });
}

function renderTriageCard(sub) {
  const box = document.getElementById("triageContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  triageQuickRead(sub);   // the card is drawn on arrival, before the legal checks run, so it reads the email itself
  const cls = triageClassify(sub), k = TRIAGE_KINDS[cls.kind];
  sub.triage = Object.assign({}, sub.triage, { kind: cls.kind });
  const read = (sub.triage && sub.triage.read) || null;
  const fields = [["Insured", sub.insured], ["FEIN", sub.fein], ["DOT", sub.dot], ["MC number", sub.mcNumber], ["Producer / broker", sub.broker], ["Contact", sub.email], ["Address", sub.address]];
  const rows = fields.map(([l, v]) => `<tr><td class="text-muted">${l}</td><td>${wsIsPlaceholder(v) ? '<span class="text-muted">not found in the email</span>' : wsEsc(v)}</td></tr>`).join("");
  const docs = triageExpectedDocs(sub);
  const missing = docs.filter(d => !d.present);
  const dup = typeof findDuplicateSubmission === "function" ? findDuplicateSubmission(sub.insured, sub.fein, sub.id) : null;
  let dupHtml = '<div class="ws-small"><i class="ph ph-check-circle text-success"></i> No other case has this FEIN or insured name.</div>';
  if (dup) {
    const sameBroker = String(dup.broker || "").toLowerCase() === String(sub.broker || "").toLowerCase();
    dupHtml = `<div class="alert ${sameBroker ? "alert-warning" : "alert-danger"} ws-small"><i class="ph ph-copy"></i> <strong>${wsEsc(dup.id)}</strong> (${wsEsc(dup.insured)}) already has this FEIN or insured name${sameBroker ? " from the same producer. This may be the same submission sent again; attach it there instead of working it twice." : ` from a different producer (${wsEsc(dup.broker)}). That is a market conflict; the market clearance below decides who holds the risk.`}</div>`;
  }
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-funnel"></i> Triage</h3><span class="badge ${k.badge}">${k.label}</span></div>
    <div class="card-body">
      <p class="text-sm" style="margin:0 0 8px;">${wsEsc(k.next)} <span class="ws-small text-muted">${wsEsc(cls.reasons.join(" "))}</span></p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px;">
        <div>
          <div class="ws-small text-muted" style="margin-bottom:4px;">Who is named${read ? ", read from the email text only (preliminary; confirmed at Step " + CONFIRM_STEP + ")" : ""}</div>
          <table class="data-table"><tbody>${rows}</tbody></table>
        </div>
        <div>
          <div class="ws-small text-muted" style="margin-bottom:4px;">Documents expected for ${wsEsc(sub.lobName || sub.lobKey || "this line")}</div>
          <table class="data-table"><tbody>${docs.map(d => `<tr><td>${wsEsc(d.label)}</td><td>${d.present ? `<span class="badge badge-success">Received</span> <span class="ws-small text-muted">${wsEsc(d.via || "")}</span>` : '<span class="badge badge-warning">Not received</span>'}</td></tr>`).join("")}</tbody></table>
          ${missing.length ? `<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="openRFIModal()"><i class="ph ph-envelope-open"></i> Ask the producer for ${missing.length} missing item${missing.length === 1 ? "" : "s"}</button>` : ""}
        </div>
      </div>
      <div style="margin-top:12px;">${dupHtml}</div>
    </div>
  </div>`;
}

// Step 2 arrival: read the identity from the email before the legal checks run, so they have a name and a producer to check.
(function triageWire() {
  const orig = window.clearanceAutoRun;
  if (typeof orig === "function") {
    window.clearanceAutoRun = function (sub) {
      try { triageQuickRead(sub); } catch (e) { console.warn("Triage quick read failed:", e); }
      return orig.apply(this, arguments);
    };
  }
})();

// ----------------------------------------------------------------------------
// 5. INGEST AND EXTRACT VIEWS
// ----------------------------------------------------------------------------
function wsFileKind(a) {
  try {
    if (a.base64 && typeof diDetectType === "function" && typeof diBase64ToBytes === "function") return diDetectType(diBase64ToBytes(a.base64), a.name).label;
  } catch (e) { /* fall through to the declared type */ }
  return a.type || "unknown";
}
function wsBytes(n) { return typeof diBytes === "function" ? diBytes(n) : n + " B"; }

function renderIngestReceived(sub) {
  const box = document.getElementById("ingestReceivedContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const files = sub.rawAttachments || [];
  const hasEmail = sub.rawEmailText !== undefined;
  const fileRows = files.map(a => `<tr><td>${wsEsc(a.name)}</td><td>${wsEsc(wsFileKind(a))}</td><td>${wsBytes(a.size || 0)}</td><td><span class="badge badge-light">${a.base64 ? "Stored unchanged" : "Not kept (storage limit)"}</span></td></tr>`).join("");
  const direct = !hasEmail && !files.length;
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-tray-arrow-down"></i> Received</h3><span class="badge badge-light"><i class="ph ph-lock-simple"></i> Kept exactly as received</span></div>
    <div class="card-body">
      <table class="data-table" style="margin-bottom:10px;"><tbody>
        <tr><td class="text-muted">Case</td><td>${wsEsc(sub.id)}</td></tr>
        <tr><td class="text-muted">Channel</td><td>${wsEsc(sub.channelName || sub.channelType || "")}</td></tr>
        <tr><td class="text-muted">Received</td><td>${wsEsc(sub.receivedAt || "")}</td></tr>
        <tr><td class="text-muted">Files</td><td>${files.length}</td></tr>
      </tbody></table>
      ${direct ? `<p class="text-sm text-muted" style="margin:0;">This case was entered directly as structured fields. There is no email or file to keep; the values on the case are the submission.</p>` : ""}
      ${hasEmail ? `<div class="ws-small text-muted" style="margin-bottom:4px;">Email text, as received</div><pre style="max-height:220px; overflow:auto; background:var(--bg-subtle,#f8fafc); border:1px solid var(--border-color,#e2e8f0); border-radius:6px; padding:10px; font-size:12px; white-space:pre-wrap; margin:0 0 10px;">${wsEsc(sub.rawEmailText)}</pre>` : ""}
      ${files.length ? `<table class="data-table"><thead><tr><th>File</th><th>Type (from its content)</th><th>Size</th><th>State</th></tr></thead><tbody>${fileRows}</tbody></table>` : ""}
      <p class="ws-small text-muted" style="margin:10px 0 0;">Nothing has been read yet. Triage and the legal checks come next (Step ${CLEARANCE_STEP}); the files are read at Step ${EXTRACT_STEP}.</p>
    </div>
  </div>`;
}

function renderExtractSummary(sub) {
  const box = document.getElementById("extractSummaryContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const ex = sub.documentExtractions || [];
  const hasInput = sub.rawEmailText !== undefined || (sub.rawAttachments || []).length;
  if (!hasInput) { box.innerHTML = `<div class="card"><div class="card-body text-sm text-muted">This case was entered as structured fields, so there is nothing to extract. Continue to Confirm.</div></div>`; return; }
  const draft = (typeof emailIngestionDraftBySubId !== "undefined" && emailIngestionDraftBySubId[sub.id]) || null;
  if (!ex.length && !draft) { box.innerHTML = `<div class="card"><div class="card-body text-sm"><i class="ph ph-circle-notch ph-spin"></i> Reading the email text and ${(sub.rawAttachments || []).length} file(s)…</div></div>`; return; }
  const types = draft && draft.docTypes ? draft.docTypes : {};
  const rows = ex.map(d => {
    const t = types[d.name] || recognizeDocument(d.name, "");
    return `<tr><td>${d.parent ? "↳ " : ""}${wsEsc(d.name)}</td><td>${wsEsc(t.label)}</td><td>${wsEsc(d.method || "")}</td><td>${typeof diStatusBadge === "function" ? diStatusBadge(d.status) : wsEsc(d.status)}</td><td class="ws-small">${wsEsc((d.notes || []).join(" "))}</td></tr>`;
  }).join("");
  const counts = draft ? [["Vehicles", Object.keys(draft.vehicleDetails || {}).length], ["Drivers", Object.keys(draft.driverDetails || {}).length], ["Claims", (draft.lossHistory || []).length]] : [];
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-files"></i> What was read</h3>${counts.length ? `<span class="ws-small text-muted">${counts.map(c => c[1] + " " + c[0].toLowerCase()).join(" · ")}</span>` : ""}</div>
    <div class="card-body">
      ${rows ? `<table class="data-table"><thead><tr><th>File</th><th>Detected as</th><th>Read with</th><th>Result</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="text-sm text-muted" style="margin:0;">Only the email text was read.</p>`}
      <p class="ws-small text-muted" style="margin:10px 0 0;">Reading does not apply anything to the case. The values are checked and applied at Step ${CONFIRM_STEP}.</p>
    </div>
  </div>`;
}

// Extraction starts when the person reaches it (Step 3), not while the files are still only being received or triaged.
(function extractionWire() {
  const orig = window.renderIngestionReviewDirect;
  if (typeof orig === "function") {
    window.renderIngestionReviewDirect = function (sub, box) {
      if ((typeof currentWorkflowStep !== "undefined" ? currentWorkflowStep : 1) < EXTRACT_STEP) { box.innerHTML = ""; return; }
      return orig.apply(this, arguments);
    };
  }
  // The file list refreshes when a read finishes.
  const origPipe = window.diRenderPipelineCard;
  if (typeof origPipe === "function") {
    window.diRenderPipelineCard = function (sub) {
      const r = origPipe.apply(this, arguments);
      try { renderExtractSummary(sub); } catch (e) { /* summary is optional */ }
      return r;
    };
  }
  // Each source document's type, found from its text, goes onto the draft for the file list.
  const origCons = window.diConsolidate;
  if (typeof origCons === "function") {
    window.diConsolidate = function (sub, sources) {
      const draft = origCons.apply(this, arguments);
      draft.docTypes = {};
      (sources || []).forEach(s => { draft.docTypes[s.name] = recognizeDocument(s.name, s.text); });
      (draft.sourceDocuments || []).forEach(d => { if (draft.docTypes[d.name] && draft.docTypes[d.name].key !== "other") d.label = draft.docTypes[d.name].label; });
      return draft;
    };
  }
})();

// ----------------------------------------------------------------------------
// 6. LEAVING STEPS
// ----------------------------------------------------------------------------
(function leavingWire() {
  const orig = window.goToNextStep;
  if (typeof orig !== "function") return;
  window.goToNextStep = function () {
    const sub = wsSub();
    // Applying the confirmed values is what ends the Confirm step for an email case.
    if (sub && currentWorkflowStep === CONFIRM_STEP && sub.rawEmailText !== undefined && sub.normalizationStatus === "pending") {
      showToast("⛔ Apply the extracted data first (Confirm & Apply Standard Data). Until then the case still holds only the preliminary read of the email.", "danger");
      return;
    }
    return orig.apply(this, arguments);
  };
})();

// ----------------------------------------------------------------------------
// 7. ONE WRAPPER ON THE DOWNSTREAM RENDER
// ----------------------------------------------------------------------------
registerStepRenderer("triage", renderTriageCard);
registerStepRenderer("ingest", renderIngestReceived);
registerStepRenderer("extract", renderExtractSummary);

(function renderWire() {
  const orig = window.renderAllDownstreamScreens;
  if (typeof orig !== "function") return;
  window.renderAllDownstreamScreens = function (sub) {
    const r = orig.apply(this, arguments);
    WS_RENDERERS.forEach(x => { try { x.fn(sub); } catch (e) { console.warn("Step panel '" + x.name + "' failed:", e); } });
    return r;
  };
})();

window.triageClassify = triageClassify;
window.triageExpectedDocs = triageExpectedDocs;
window.renderTriageCard = renderTriageCard;
window.renderIngestReceived = renderIngestReceived;
window.renderExtractSummary = renderExtractSummary;
