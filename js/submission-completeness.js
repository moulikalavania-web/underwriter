/**
 * ============================================================================
 * SUBMISSION COMPLETENESS CHECK (Add-On) — gap G11
 * ----------------------------------------------------------------------------
 * Intake answers a different question from clearance: "is this submission
 * complete and valid?", not "do we want it?". An underwriter should not spend
 * time on a file that cannot be quoted. This module evaluates a submission
 * against a checklist for its line of business — the data an application must
 * carry and the documents that must accompany it — and shows what is missing
 * on the Document Ingestion screen.
 *
 *   - Common items for every line (insured, FEIN, address, effective date,
 *     producer, contact, requested limit, loss history,
 *     currently valued loss runs) plus line-specific items for Commercial
 *     Auto / Trucking, Commercial Property, Professional Liability, GL CPC and
 *     GL CAS. Checklists are plain data in COMPLETENESS_CHECKLISTS.
 *   - A product JSON may add its own requirements through requiredDocuments and
 *     requiredFields arrays (none of the bundled sample products declares any).
 *   - "Request missing items" drafts the RFI to the producer using the existing
 *     RFI modal, and registers the gaps in the submission's missing-items list
 *     that the Customer Communication log already resolves.
 *   - An approver may waive a required item with a written reason.
 *   - Leaving Step 1 is blocked while required items are missing and unwaived.
 *
 * The checks read what is actually on the submission (fields, schedules,
 * extracted data and attached documents); they do not read the contents of a
 * PDF. "Currently valued" loss runs are therefore
 * confirmed by the underwriter, and the checklist says so.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. DATA ACCESS HELPERS
// ----------------------------------------------------------------------------
var COMPLETENESS_EMPTY = /^(not provided|n\/a\b.*|none|null|undefined|—|-)$/i;

function completenessFlat(sub) {
  const flat = {};
  const add = (k, v) => {
    if (v === null || v === undefined || typeof v === "object") return;
    const s = String(v).trim();
    if (!s || COMPLETENESS_EMPTY.test(s)) return;
    flat[String(k).toLowerCase()] = s;
  };
  const walk = (obj, prefix, depth) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || depth > 4) return;
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      const key = prefix ? prefix + "." + k : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, key, depth + 1);
      else add(key, v);
    });
  };
  ["insured", "fein", "address", "broker", "email", "dot", "mcNumber", "effectiveDate", "expirationDate"].forEach(k => add(k, sub[k]));
  ["genInfo", "insuredInfo", "coveragesInfo", "radiusOfOperationsInfo", "operationsProfile", "commoditiesInfo"].forEach(k => walk(sub[k], k, 0));
  walk(sub.canonicalJson, "canonicalJson", 0);
  (sub.ocrFields || []).forEach(f => add("ocr." + f.key, f.val));
  return flat;
}

/** First non-empty value whose key matches any of the patterns. */
function completenessPick(flat, patterns) {
  const keys = Object.keys(flat);
  for (let i = 0; i < keys.length; i++) {
    if (patterns.some(p => p.test(keys[i]))) return flat[keys[i]];
  }
  return null;
}

/**
 * Says what is missing from a schedule and where it was looked for, instead of a bare "Missing":
 * "2 drivers are on the case. Missing: date of birth or age for Arjun Mehta, Rahul Verma. The Driver list (file.docx) was read
 * and does not state it."
 */
function completenessScheduleGap(sub, listKey, noun, fields, nameOf, docId) {
  const list = sub[listKey] || [];
  const doc = typeof diDocumentEvidence === "function" ? diDocumentEvidence(sub, docId) : null;
  if (!list.length) return doc ? `No ${noun}s are on the case yet. ${doc} looks like the ${noun} schedule: use "Fetch missing items from attached documents".` : `No ${noun}s are on the case and no ${noun} schedule was found among the attached documents.`;
  const parts = [];
  fields.forEach(([label, has]) => {
    const who = list.filter(x => !has(x)).map(nameOf);
    if (who.length) parts.push(`${label} for ${who.join(", ")}`);
  });
  if (!parts.length) return "";
  return `${list.length} ${noun}${list.length === 1 ? " is" : "s are"} on the case. Missing: ${parts.join("; ")}.` + (doc ? ` ${doc} was read and does not state ${parts.length === 1 ? "it" : "them"}; ask the producer for the missing detail.` : "");
}

function completenessDocText(sub) {
  return (sub.docs || []).map(d => `${d.name || ""} ${d.desc || ""}`).join(" | ");
}

function completenessResolvedByCommunication(sub, label) {
  const L = String(label).toLowerCase();
  return (sub.submissionVersions || []).some(v =>
    (v.resolvedDocs || []).concat(v.resolvedDataFields || []).some(x => String(x).toLowerCase() === L));
}

// ----------------------------------------------------------------------------
// 2. CHECKLISTS (data, not code — Compliance / Underwriting can edit)
//    data(): test(sub, flat) returns a short "found" string, or a falsy value.
//    doc():  looks for a matching attached document.
// ----------------------------------------------------------------------------
function cData(id, label, required, test, ask, gap) { return { id, kind: "data", label, required, test, ask: ask || "Broker / Agency", gap }; }
function cDoc(id, label, required, regex, hint) {
  return { id, kind: "document", label, required, ask: "Broker / Agency", hint,
    test: (sub) => {
      if (completenessDocText(sub).match(regex)) return "Attached";
      // The file name may say nothing; the content of the extracted document can (document-ingestion.js).
      const found = typeof diDocumentEvidence === "function" ? diDocumentEvidence(sub, id) : null;
      return found ? `Found in ${found}` : false;
    } };
}

var COMPLETENESS_CHECKLISTS = {
  common: [
    cData("insured", "Named insured", true, (s, f) => f.insured),
    cData("fein", "FEIN / tax ID", true, (s, f) => f.fein && f.fein.length >= 9 && f.fein),
    cData("address", "Mailing / garaging address", true, (s, f) => f.address),
    cData("effective", "Requested effective date", true, (s, f) => completenessPick(f, [/effective/])),
    cData("producer", "Producing broker / agency", true, (s, f) => s.channelType === "direct" ? "Direct submission" : f.broker),
    cData("contact", "Contact email", true, (s, f) => f.email),
    cData("limit", "Requested limit / exposure", true, (s) => (Number(s.exposureVal) > 0) && ("$" + Number(s.exposureVal).toLocaleString("en-US"))),
    cData("losses", "Loss history stated", true, (s) => Array.isArray(s.losses) && s.losses.length > 0 && (s.losses.length + " period(s) listed")),
    cDoc("doc_lossruns", "Currently valued loss runs", true, /loss.?run/i, "Obtain from each prior carrier for the look-back period; confirm valuation is within 90 days.")
  ],
  trucking: [
    cData("dot", "USDOT number", true, (s, f) => { const v = f.dot || completenessPick(f, [/dot_?number/, /^ocr\.dot/]); return v && /\d{5,}/.test(v) && v; }),
    cData("mc", "MC number (operating authority)", false, (s, f) => f.mcnumber || completenessPick(f, [/^ocr\.dot/]) && /MC-?\d+/i.test(completenessPick(f, [/^ocr\.dot/]) || "") && "MC number in application"),
    cData("vehicles", "Vehicle schedule (year, make, value)", true, (s) => {
      const v = s.vehicles || [];
      return v.length > 0 && v.every(x => x.year && (x.make || x.model) && (x.stated_value || x.al_value)) && (v.length + " unit(s)");
    }, undefined, (s) => completenessScheduleGap(s, "vehicles", "vehicle", [["year", x => x.year], ["make or model", x => x.make || x.model], ["stated value", x => x.stated_value || x.al_value]], x => [x.year, x.make, x.model].filter(Boolean).join(" ") || "a unit", "doc_vehicles")),
    cData("vins", "VIN for every unit", false, (s) => { const v = s.vehicles || []; return v.length > 0 && v.every(x => x.vin || x.VIN) && "All units have a VIN"; }),
    cData("drivers", "Driver list (licence number, state, date of birth or age)", true, (s) => {
      const d = s.drivers || [];
      return d.length > 0 && d.every(x => x.licenseNumber && x.licensestate && (x.dob || x.age)) && (d.length + " driver(s)");
    }, undefined, (s) => completenessScheduleGap(s, "drivers", "driver", [["licence number", x => x.licenseNumber], ["licence state", x => x.licensestate], ["date of birth or age", x => x.dob || x.age]], x => [x.given_name, x.last_name].filter(Boolean).join(" ") || x.name || "a driver", "doc_drivers")),
    cData("radius", "Operating radius", true, (s, f) => completenessPick(f, [/radius/])),
    cData("commodities", "Commodities hauled", true, (s, f) => ((s.commoditiesSelected || []).length > 0 && "Commodities selected") || completenessPick(f, [/cargo|commodit/])),
    cData("years", "Years in business", true, (s, f) => completenessPick(f, [/business_yrs|years_of_experience|years.?in.?business/])),
    cData("priorcarrier", "Prior carrier", false, (s, f) => completenessPick(f, [/prior.?carrier|current.?carrier/])),
    cDoc("doc_vehicles", "Vehicle schedule / SOV", true, /sov|vehicle|schedule|unit/i, "A statement of values or unit schedule."),
    cDoc("doc_drivers", "Driver list or MVRs", true, /mvr|driver/i, "Driver list with licence details, or MVRs.")
  ],
  property: [
    cData("construction", "Construction class", true, (s, f) => completenessPick(f, [/construction/])),
    cData("yearbuilt", "Year built", true, (s, f) => completenessPick(f, [/year.?built|yr.?built/])),
    cData("occupancy", "Occupancy", true, (s, f) => completenessPick(f, [/occupancy/])),
    cData("sqft", "Square footage", true, (s, f) => completenessPick(f, [/square|sq.?ft/])),
    cData("protection", "Fire protection / sprinklers", true, (s, f) => completenessPick(f, [/fire.?protection|sprinkler|protection/])),
    cData("roof", "Roof age and type", false, (s, f) => completenessPick(f, [/roof/])),
    cData("tivsplit", "Building and contents values", true, (s, f) => completenessPick(f, [/building_value/]) && completenessPick(f, [/contents/]) && "Building and contents stated"),
    cData("valuation", "Valuation basis (replacement cost / ACV)", false, (s) => (s.coverageRows || []).some(r => /replacement|\bRC\b|actual cash/i.test(String(r.line || ""))) && "Stated in coverage"),
    cDoc("doc_sov", "Statement of values / schedule", true, /sov|statement of values|schedule of values/i, "Location-by-location values.")
  ],
  mpl: [
    cData("revenue", "Annual revenue / fees", true, (s, f) => completenessPick(f, [/revenue|fee/])),
    cData("practice", "Professional services / specialization", true, (s, f) => completenessPick(f, [/practice|specializ|services|profession/])),
    cData("years", "Years in business", true, (s, f) => completenessPick(f, [/years.?in.?business|established|inception/])),
    cData("retro", "Retroactive date (claims-made)", true, (s, f) => completenessPick(f, [/retro/])),
    cData("headcount", "Number of professionals / partners", true, (s, f) => completenessPick(f, [/partner|professional.?count|headcount|employee/])),
    cData("priorclaims", "Known claims or circumstances", false, (s, f) => completenessPick(f, [/known.?claim|circumstance|prior.?claim/])),
    cDoc("doc_financials", "Financial statements", true, /financ|audit|revenue/i, "Most recent audited or reviewed statements.")
  ],
  gl_cpc: [
    cData("operations", "Description of operations", true, (s, f) => completenessPick(f, [/operations|description|occupancy|work/])),
    cData("classcode", "Class code (NAICS / SIC / GL class)", true, (s, f) => completenessPick(f, [/class|naics|sic/])),
    cData("exposure", "Exposure basis (payroll, sales or receipts)", true, (s, f) => completenessPick(f, [/payroll|sales|receipts|revenue/])),
    cData("subs", "Use of subcontractors", false, (s, f) => completenessPick(f, [/subcontract/])),
    cData("years", "Years in business", true, (s, f) => completenessPick(f, [/years.?in.?business|business_yrs|established/]))
  ],
  gl_cas: [
    cData("operations", "Description of operations and hazards", true, (s, f) => completenessPick(f, [/operations|hazard|chemical|pollut|description/])),
    cData("classcode", "Class code (NAICS / SIC / GL class)", true, (s, f) => completenessPick(f, [/class|naics|sic/])),
    cData("exposure", "Exposure basis (payroll, sales or receipts)", true, (s, f) => completenessPick(f, [/payroll|sales|receipts|revenue/])),
    cData("safety", "Safety and pollution controls", false, (s, f) => completenessPick(f, [/safety|pollut|environment/])),
    cData("years", "Years in business", true, (s, f) => completenessPick(f, [/years.?in.?business|business_yrs|established/]))
  ]
};

/** Optional requirements declared by the ingested product JSON. */
function completenessProductItems() {
  const p = (typeof window !== "undefined" && window.ACTIVE_INSURANCE_PRODUCT) || null;
  if (!p) return [];
  const src = (p.studios && (p.studios.requirements || p.studios)) || p;
  const docs = src.requiredDocuments || src.required_documents || p.requiredDocuments || [];
  const fields = src.requiredFields || src.required_fields || p.requiredFields || [];
  const out = [];
  docs.forEach((d, i) => {
    const name = typeof d === "string" ? d : (d.name || d.label);
    if (!name) return;
    const rx = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s_-]+/g, "[\\s_-]*"), "i");
    out.push(cDoc("prod_doc_" + i, name + " (product requirement)", true, rx, "Required by the product definition."));
  });
  fields.forEach((f, i) => {
    const name = typeof f === "string" ? f : (f.label || f.name || f.key);
    if (!name) return;
    const key = String((typeof f === "string" ? f : (f.key || name))).toLowerCase().replace(/[^a-z0-9]+/g, ".?");
    out.push(cData("prod_field_" + i, name + " (product requirement)", true, (s, flat) => completenessPick(flat, [new RegExp(key)])));
  });
  return out;
}

// ----------------------------------------------------------------------------
// 3. EVALUATION
// ----------------------------------------------------------------------------
function completenessItemsFor(sub) {
  return COMPLETENESS_CHECKLISTS.common
    .concat(COMPLETENESS_CHECKLISTS[sub.lobKey] || [])
    .concat(completenessProductItems());
}

function completenessStore(sub) {
  if (!sub.completeness) sub.completeness = { waivers: [], lastSnapshot: null };
  if (!sub.completeness.waivers) sub.completeness.waivers = [];
  return sub.completeness;
}

/** Returns { items[], required, requiredMet, percent, missingRequired[], status } */
function evaluateCompleteness(sub) {
  const flat = completenessFlat(sub);
  const store = completenessStore(sub);
  const items = completenessItemsFor(sub).map(it => {
    let found = false;
    try { found = it.test(sub, flat); } catch (e) { found = false; }
    const viaComm = !found && completenessResolvedByCommunication(sub, it.label);
    const waiver = store.waivers.find(w => w.id === it.id) || null;
    const met = !!found || viaComm;
    let gapText = "";
    if (!found && !viaComm && typeof it.gap === "function") { try { gapText = it.gap(sub) || ""; } catch (e) { gapText = ""; } }
    return { id: it.id, kind: it.kind, label: it.label, required: it.required, ask: it.ask, hint: gapText || it.hint || "",
      met, detail: found ? (typeof found === "string" ? found : "Present") : (viaComm ? "Received (logged in customer communication)" : ""),
      waived: !met && !!waiver, waiver };
  });
  const req = items.filter(i => i.required);
  const satisfied = req.filter(i => i.met || i.waived);
  const missingRequired = req.filter(i => !i.met && !i.waived);
  return {
    items, required: req.length, requiredMet: satisfied.length,
    percent: req.length ? Math.round((satisfied.length / req.length) * 100) : 100,
    missingRequired, status: missingRequired.length ? "incomplete" : "complete"
  };
}

// ----------------------------------------------------------------------------
// 4. STATE + AUDIT
// ----------------------------------------------------------------------------
function completenessSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function completenessActiveSub() { return completenessSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); }
function completenessNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function completenessActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function completenessEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function completenessLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 1, decision, by: completenessActor(), at: completenessNow(), notes });
}
function completenessPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}

/** Re-evaluates, remembers the result, and logs only when the outcome changed. */
function runCompletenessCheck(sub, trigger) {
  const r = evaluateCompleteness(sub);
  const store = completenessStore(sub);
  const snap = `${r.status}:${r.missingRequired.map(i => i.id).join(",")}`;
  if (store.lastSnapshot !== snap) {
    completenessLog(sub, r.status === "complete" ? "completeness_complete" : "completeness_incomplete",
      r.status === "complete"
        ? `Completeness check (${trigger}): all ${r.required} required items present or waived.`
        : `Completeness check (${trigger}): ${r.missingRequired.length} of ${r.required} required items missing — ${r.missingRequired.map(i => i.label).join("; ")}.`);
    store.lastSnapshot = snap;
    completenessPersist();
  }
  store.lastCheckedAt = completenessNow();
  store.lastPercent = r.percent;
  return r;
}

// ----------------------------------------------------------------------------
// 5. ACTIONS
// ----------------------------------------------------------------------------
function completenessRecheckClicked() {
  const sub = completenessActiveSub();
  if (!sub) return;
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return; }
  runCompletenessCheck(sub, "manual");
  renderCompletenessCard(sub);
  showToast("Completeness re-checked.", "info");
}

function completenessWaive(itemId) {
  const sub = completenessActiveSub();
  if (!sub) return;
  if (!hasPermission("completeness", "approve")) { denyPermission("completeness", "approve"); return; }
  const r = evaluateCompleteness(sub);
  const item = r.items.find(i => i.id === itemId);
  if (!item || item.met || item.waived) return;
  const el = document.getElementById("cmpWaive_" + itemId);
  const reason = el ? el.value.trim() : "";
  if (reason.length < 10) { showToast("A written reason (at least 10 characters) is required to waive an item.", "danger"); if (el) el.focus(); return; }
  completenessStore(sub).waivers.push({ id: itemId, label: item.label, reason, by: completenessActor(), at: completenessNow() });
  completenessLog(sub, "completeness_waived", `Waived "${item.label}": ${reason}`);
  runCompletenessCheck(sub, "waiver");
  completenessPersist();
  renderCompletenessCard(sub);
  showToast(`"${item.label}" waived and logged.`, "success");
}

function completenessUnwaive(itemId) {
  const sub = completenessActiveSub();
  if (!sub) return;
  if (!hasPermission("completeness", "approve")) { denyPermission("completeness", "approve"); return; }
  const store = completenessStore(sub);
  const w = store.waivers.find(x => x.id === itemId);
  if (!w) return;
  store.waivers = store.waivers.filter(x => x.id !== itemId);
  completenessLog(sub, "completeness_waiver_removed", `Waiver removed for "${w.label}".`);
  runCompletenessCheck(sub, "waiver removed");
  completenessPersist();
  renderCompletenessCard(sub);
}

/** Registers the gaps in the existing missing-items list and opens the RFI modal, pre-filled. */
function completenessRequestMissing() {
  const sub = completenessActiveSub();
  if (!sub) return;
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return; }
  const r = runCompletenessCheck(sub, "request");
  if (!r.missingRequired.length) { showToast("Nothing required is missing.", "info"); return; }

  const mi = typeof ensureMissingItemsSeed === "function" ? ensureMissingItemsSeed(sub) : (sub.missingItems = sub.missingItems || { documents: [], dataFields: [] });
  let added = 0;
  r.missingRequired.forEach(i => {
    const list = i.kind === "document" ? mi.documents : mi.dataFields;
    if (!list.some(x => String(x).toLowerCase() === i.label.toLowerCase())) { list.push(i.label); added++; }
  });
  completenessLog(sub, "completeness_rfi_requested", `Requested ${r.missingRequired.length} missing item(s) from ${sub.broker && sub.channelType !== "direct" ? sub.broker : "the customer"}: ${r.missingRequired.map(i => i.label).join("; ")}.`);
  completenessPersist();

  const party = sub.channelType === "direct" ? "Customer" : (sub.broker || "Broker");
  const lines = r.missingRequired.map((i, n) => `${n + 1}. ${i.label}${i.hint ? " — " + i.hint : ""}`).join("\n");
  const setv = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  setv("rfiRecipientEmail", sub.email || "");
  setv("rfiSubject", `Information needed to quote: ${sub.insured || sub.id} (${sub.id})`);
  setv("rfiMessageText", `Dear ${party},\n\nTo review and quote this submission we still need the following:\n\n${lines}\n\nWe will start our review as soon as these are received.`);
  if (typeof openRFIModal === "function") openRFIModal();
  renderCompletenessCard(sub);
  showToast(`RFI drafted for ${r.missingRequired.length} missing item(s).`, "info");
}

// ----------------------------------------------------------------------------
// 6. RENDERING
// ----------------------------------------------------------------------------
function renderCompletenessCard(sub) {
  const box = document.getElementById("completenessContainer");
  if (!box || !sub) return;
  const r = evaluateCompleteness(sub);
  const canEdit = hasPermission("completeness", "edit");
  const canWaive = hasPermission("completeness", "approve");
  const store = completenessStore(sub);
  const ok = r.status === "complete";

  const row = i => {
    let status, action = "";
    if (i.met) status = `<span class="badge badge-success text-xs"><i class="ph ph-check"></i> Present</span>`;
    else if (i.waived) status = `<span class="badge badge-info text-xs">Waived</span>`;
    else status = i.required ? `<span class="badge badge-danger text-xs">Missing</span>` : `<span class="badge badge-light text-xs">Missing (recommended)</span>`;
    if (!i.met && i.waived && canWaive) action = `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="completenessUnwaive('${i.id}')">Remove waiver</button>`;
    if (!i.met && !i.waived && i.required && canWaive) {
      action = `<input id="cmpWaive_${i.id}" class="form-control" style="width:200px; display:inline-block;" placeholder="Reason to waive (10+ chars)">
        <button class="btn btn-xs btn-outline" style="width:auto;" onclick="completenessWaive('${i.id}')">Waive</button>`;
    }
    const detail = i.met ? completenessEsc(i.detail) : (i.waived ? completenessEsc(i.waiver.reason) + ` <span class="text-muted">— ${completenessEsc(i.waiver.by)}</span>` : completenessEsc(i.hint));
    return `<tr><td>${completenessEsc(i.label)}${i.required ? ' <span class="text-danger">*</span>' : ""}</td><td>${status}</td><td class="text-xs">${detail}</td><td>${action}</td></tr>`;
  };
  const dataRows = r.items.filter(i => i.kind === "data").map(row).join("");
  const docRows = r.items.filter(i => i.kind === "document").map(row).join("");
  const barColor = ok ? "#16a34a" : (r.percent >= 70 ? "#d97706" : "#dc2626");

  box.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <div class="card-header">
        <h3><i class="ph ph-clipboard-text"></i> Submission Completeness</h3>
        <span class="badge ${ok ? "badge-success" : "badge-warning"}"><i class="ph ${ok ? "ph-check-circle" : "ph-warning"}"></i> ${ok ? "Complete" : r.missingRequired.length + " required item(s) missing"}</span>
      </div>
      <div class="card-body">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
          <div style="flex:1; height:10px; background:#e2e8f0; border-radius:6px; overflow:hidden;"><div style="width:${r.percent}%; height:100%; background:${barColor};"></div></div>
          <strong style="font-size:13px;">${r.requiredMet} of ${r.required} required (${r.percent}%)</strong>
        </div>
        ${ok ? "" : `<div class="alert alert-warning text-xs"><i class="ph ph-warning"></i> Step 1 cannot be completed until the required items below are received or waived by an approver.</div>`}
        <h4 style="margin:10px 0 4px;">Application data</h4>
        <div class="rules-table-container" style="max-height:none; overflow:visible;"><table class="data-table"><thead><tr><th>Item</th><th>Status</th><th>Detail</th><th></th></tr></thead><tbody>${dataRows}</tbody></table></div>
        <h4 style="margin:14px 0 4px;">Documents</h4>
        <div class="rules-table-container" style="max-height:none; overflow:visible;"><table class="data-table"><thead><tr><th>Item</th><th>Status</th><th>Detail</th><th></th></tr></thead><tbody>${docRows}</tbody></table></div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; align-items:center;">
          ${canEdit ? `<button class="btn btn-sm btn-outline" style="width:auto;" onclick="completenessRecheckClicked()"><i class="ph ph-arrows-clockwise"></i> Re-check</button>` : ""}
          ${canEdit && !ok && (sub.rawAttachments || []).length ? `<button class="btn btn-sm btn-outline" style="width:auto;" onclick="completenessFetchFromDocuments()"><i class="ph ph-file-search"></i> Fetch missing items from attached documents</button>` : ""}
          ${canEdit && !ok ? `<button class="btn btn-sm btn-primary" style="width:auto;" onclick="completenessRequestMissing()"><i class="ph ph-envelope-open"></i> Request missing items from ${completenessEsc(sub.channelType === "direct" ? "customer" : (sub.broker || "broker"))}</button>` : ""}
          ${store.lastCheckedAt ? `<span class="text-xs text-muted">Last checked ${completenessEsc(store.lastCheckedAt)}</span>` : ""}
        </div>
        <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> The check reads the submission's data fields, schedules, extracted values and the names of attached documents. It cannot read inside a PDF, so currently valued loss runs must be confirmed by the underwriter. Checklists are configuration (COMPLETENESS_CHECKLISTS) and can also be extended by the product JSON.</p>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
// 7. HOOKS — render with the downstream screens, and gate leaving Step 1
// ----------------------------------------------------------------------------
function completenessGuardNextStep() {
  if (typeof currentWorkflowStep === "undefined" || currentWorkflowStep !== 1) return true;
  const sub = completenessActiveSub();
  if (!sub) return true;
  const r = runCompletenessCheck(sub, "step 1 exit");
  if (r.status === "complete") return true;
  completenessLog(sub, "completeness_gate_blocked", `Step 1 exit blocked: ${r.missingRequired.length} required item(s) missing — ${r.missingRequired.map(i => i.label).join("; ")}.`);
  completenessPersist();
  const first = r.missingRequired.slice(0, 3).map(i => i.label).join("; ");
  const searching = typeof diAutoFetchForCompleteness === "function" && diAutoFetchForCompleteness(sub);
  showToast(`⛔ Cannot leave Step 1: ${r.missingRequired.length} required item(s) missing (${first}${r.missingRequired.length > 3 ? "…" : ""}). ${searching ? "Looking for them in the attached documents… " : ""}Request them from the broker or have an approver waive them.`, "danger");
  renderCompletenessCard(sub);
  return false;
}

(function installCompletenessHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.completeness_complete = { label: "Submission Complete", icon: "ph-clipboard-text", badge: "badge-success", outcome: "outcome-approve" };
    AUDIT_ACTION_META.completeness_incomplete = { label: "Submission Incomplete", icon: "ph-clipboard-text", badge: "badge-warning", outcome: "outcome-refer" };
    AUDIT_ACTION_META.completeness_waived = { label: "Required Item Waived", icon: "ph-seal-check", badge: "badge-info", outcome: "outcome-approve" };
    AUDIT_ACTION_META.completeness_waiver_removed = { label: "Waiver Removed", icon: "ph-arrow-counter-clockwise", badge: "badge-light", outcome: "outcome-comm" };
    AUDIT_ACTION_META.completeness_rfi_requested = { label: "Missing Items Requested", icon: "ph-envelope-open", badge: "badge-light", outcome: "outcome-comm" };
    AUDIT_ACTION_META.completeness_fetched = { label: "Items Read From Documents", icon: "ph-file-search", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.completeness_gate_blocked = { label: "Step 1 Exit Blocked — Incomplete", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }

  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try {
        if (sub) {
          // Only files still at intake write to the audit log; later-stage files just display the card.
          if ((sub.currentStep || 1) <= 1) runCompletenessCheck(sub, "view");
          renderCompletenessCard(sub);
        }
      } catch (e) { console.warn("Completeness card failed:", e); }
      return r;
    };
  }
  const origNext = window.goToNextStep;
  if (typeof origNext === "function") {
    window.goToNextStep = function () {
      if (!completenessGuardNextStep()) return;
      return origNext.apply(this, arguments);
    };
  }
})();

window.renderCompletenessCard = renderCompletenessCard;
window.completenessRecheckClicked = completenessRecheckClicked;
window.completenessFetchFromDocuments = function () {
  const sub = completenessActiveSub();
  if (!sub) return;
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return; }
  if (typeof diFetchMissingFromDocuments === "function") diFetchMissingFromDocuments(sub, true);
};
window.completenessRequestMissing = completenessRequestMissing;
window.completenessWaive = completenessWaive;
window.completenessUnwaive = completenessUnwaive;
window.evaluateCompleteness = evaluateCompleteness;
