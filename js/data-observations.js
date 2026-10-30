/**
 * ============================================================================
 * DATA OBSERVATIONS, DISCREPANCIES, RESOLUTIONS AND ENRICHMENT REQUESTS
 * ----------------------------------------------------------------------------
 * Until now the Confirm step kept one value per field and a note that said where it came from and whether another document
 * disagreed. The other candidates were thrown away, a mismatch only turned a field amber, and nothing stopped a case with
 * two different FEINs from being rated, quoted and bound. This module keeps the evidence.
 *
 *   OBSERVATION    every value anything says about the case, never overwritten: the document and page it was read from, how it
 *                  was read, how sure the reading was, and the date it is as of. Documents, the email, a person's entry and a
 *                  provider's response are all observations of the same kind.
 *   DISCREPANCY    two sources give different values, a required value is missing, a provider's data has expired, or the case
 *                  was rated on a value that has since changed. Each says what it blocks: rating (Step 11), the quote (Step 12
 *                  and issuing it) or the bind (Step 13 and binding). It stays open until a person resolves or waives it.
 *   RESOLUTION     the value the case uses, with who chose it, how and why. A new resolution closes the old one and points back
 *                  at it, so the history reads 47 to 42 to 44 and "what did we rate on" has an answer. Only resolved values
 *                  reach the case.
 *   ENRICHMENT     an order to a data provider (FMCSA, NHTSA, a state agency) with what it costs and how long the answer stays
 *                  fresh, and the response with its own cost, match confidence and expiry. NO PROVIDER IS CONNECTED: nothing is
 *                  fetched. The underwriter orders, gets the answer from the provider, and records it here; its values become
 *                  observations and are compared with what the documents said.
 *
 * The provider list is the public record of US government sources. Fees for state records vary by state and are entered when
 * the response is recorded; any unit cost shown for a commercial source is a PLACEHOLDER.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. WHAT EACH VALUE BLOCKS
// ----------------------------------------------------------------------------
const OBS_STAGES = { rating: 1, quote: 2, bind: 3 };
const OBS_STAGE_LABELS = { rating: "rating", quote: "the quote", bind: "the bind" };
/** The step a stage starts at: a case with an open discrepancy blocking a stage cannot enter that step or any later one. */
function obsStageStep(stage) { return { rating: RATING_STEP, quote: QUOTE_STEP, bind: BIND_STEP }[stage]; }
const OBS_PATHS = {
  insured: { label: "Named Insured", blocks: "quote" }, fein: { label: "FEIN / Tax ID", blocks: "quote" }, dot: { label: "DOT Number", blocks: "quote" },
  mcNumber: { label: "MC Number", blocks: "bind" }, address: { label: "Address", blocks: "bind" }, broker: { label: "Broker / Agency", blocks: null },
  email: { label: "Contact Email", blocks: null }, exposureVal: { label: "Requested Limit / TIV", blocks: "rating" },
  effectiveDate: { label: "Effective Date", blocks: "rating" }, expirationDate: { label: "Expiration Date", blocks: "rating" },
  policyType: { label: "Policy Type", blocks: "rating" }, program: { label: "Program", blocks: null }, priorPolicyPeriod: { label: "Prior Policy Period", blocks: null },
  assignedUnderwriter: { label: "Assigned Underwriter", blocks: null }, primaryCommodity: { label: "Primary Commodity", blocks: "rating" }
};
const OBS_VEHICLE_FIELDS = { year: "rating", make: "rating", model: "rating", vin: "quote" };
const OBS_REASON_CODES = { document_newer: "A newer document", official_record: "Matches the official record", insured_confirmed: "Confirmed by the insured or producer", typo: "A typing or reading error", other: "Other (explain)" };
const OBS_MIN_REASON = 10;

function obsPathInfo(path) {
  if (OBS_PATHS[path]) return OBS_PATHS[path];
  const m = /^vehicle\.(\d+)\.(\w+)$/.exec(path);
  if (m) return { label: "Vehicle " + m[1] + " " + m[2], blocks: OBS_VEHICLE_FIELDS[m[2]] || null };
  return { label: path, blocks: null };
}
function obsPathKnown(path) { return !!OBS_PATHS[path] || /^vehicle\.\d+\.(year|make|model|vin)$/.test(path) || /^driver\.\d+\.\w+$/.test(path); }

// ----------------------------------------------------------------------------
// 2. SMALL HELPERS
// ----------------------------------------------------------------------------
function obsEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function obsNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function obsToday() { return new Date().toISOString().slice(0, 10); }
function obsActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function obsSave() { if (typeof persistAppState === "function") persistAppState(); }
function obsLog(sub, decision, notes) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 4, decision: decision, by: obsActor(), at: obsNow(), notes: notes }); }
function obsBlank(v) { return v === null || v === undefined || String(v).trim() === "" || (typeof diIsBlank === "function" && diIsBlank(v)); }
function obsSub() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }
function obsNextId(list, prefix) { let n = 0; (list || []).forEach(x => { const m = new RegExp("^" + prefix + "-(\\d+)$").exec(x.id); if (m) n = Math.max(n, +m[1]); }); return prefix + "-" + (n + 1); }

/** A value in a form two sources can be compared in: "Links LLC" and "LINKS, L.L.C." are the same insured, "12 Main Street" and "12 Main St." the same address. */
function obsNorm(path, v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim().toLowerCase();
  if (path === "insured") return s.replace(/[.,'&]/g, " ").replace(/\b(l\s?l\s?c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp|the)\b/g, " ").replace(/[^a-z0-9]/g, "");
  if (path === "fein" || path === "mcNumber") return s.replace(/\D/g, "");
  if (path === "dot") return s.replace(/\D/g, "").replace(/^0+/, "");
  if (path === "address") return s.replace(/\b(\d{5})-\d{4}\b/, "$1").replace(/\bstreet\b/g, "st").replace(/\broad\b/g, "rd").replace(/\bavenue\b/g, "ave").replace(/\bsuite\b/g, "ste").replace(/\bdrive\b/g, "dr").replace(/\bboulevard\b/g, "blvd").replace(/\bhighway\b/g, "hwy").replace(/[^a-z0-9]/g, "");
  if (path === "exposureVal") { const n = parseFloat(s.replace(/[^0-9.]/g, "")); return isNaN(n) ? s : String(n); }
  if (path === "effectiveDate" || path === "expirationDate") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;   // already a calendar date; do not push it through a time zone
    const t = new Date(s);
    if (isNaN(t.getTime())) return s.replace(/[^a-z0-9]/g, "");
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  }
  if (/^vehicle\.\d+\.year$/.test(path)) return s.replace(/\D/g, "");
  return s.replace(/[^a-z0-9]/g, "");
}

// ----------------------------------------------------------------------------
// 3. OBSERVATIONS
// ----------------------------------------------------------------------------
function obsLive(sub) { return (sub.dataObservations || []).filter(o => o.status === "current"); }
function obsDocConfidence(s) {
  if (typeof s.confidence === "number") return s.confidence;
  if (/ocr/i.test(s.method || "")) return 0.8;
  return s.name === "Email text" ? 0.85 : 0.95;
}
function obsSig(o) { return [o.path, o.sourceType, o.sourceRef, obsNorm(o.path, o.value)].join("|"); }

/** Adds an observation and returns it. */
function obsAdd(sub, o) {
  if (!sub.dataObservations) sub.dataObservations = [];
  const rec = Object.assign({ id: obsNextId(sub.dataObservations, "OBS"), page: null, snippet: "", method: "", confidence: 1, asOf: obsToday(), observedBy: "", observedAt: obsNow(), status: "current" }, o);
  rec.value = String(rec.value); if (rec.rawValue === undefined) rec.rawValue = rec.value;
  sub.dataObservations.push(rec);
  return rec;
}

/** What the documents say, kept in full: every document's own reading, not only the one the Confirm form shows. */
function obsCollectFromDocuments(sub, sources, draft) {
  const asOf = (sub.receivedTimestamp ? new Date(sub.receivedTimestamp) : new Date()).toISOString().slice(0, 10);
  const incoming = [];
  sources.forEach(s => {
    const d = buildLocalNormalizationDraft({ rawEmailText: s.text, lobKey: sub.lobKey, id: sub.id });
    DI_SCALAR_KEYS.forEach(k => {
      const v = d[k]; if (obsBlank(v)) return;
      const loc = diFindLocation(s, v);
      incoming.push({ path: k, value: String(v), sourceType: s.name === "Email text" ? "EMAIL" : "DOCUMENT", sourceRef: s.name, docLabel: s.label || "", method: s.method || "", page: loc.page, snippet: loc.snippet, confidence: obsDocConfidence(s), asOf: asOf, observedBy: "System" });
    });
  });
  const veh = (draft && draft.vehicleDetails) || {}, vdoc = draft && draft.fieldSources && draft.fieldSources.vehicles;
  Object.keys(veh).forEach(i => ["year", "make", "model", "vin"].forEach(f => {
    const v = veh[i][f]; if (obsBlank(v)) return;
    incoming.push({ path: "vehicle." + i + "." + f, value: String(v), sourceType: "DOCUMENT", sourceRef: vdoc ? vdoc.document : "vehicle schedule", method: vdoc ? vdoc.method || "" : "", confidence: 0.95, asOf: asOf, observedBy: "System" });
  }));
  const have = {};
  obsLive(sub).filter(o => o.sourceType === "DOCUMENT" || o.sourceType === "EMAIL").forEach(o => { have[obsSig(o)] = o; });
  const keep = {};
  incoming.forEach(o => {
    const sig = obsSig(o), cur = have[sig];
    if (cur) { cur.page = o.page; cur.snippet = o.snippet; cur.confidence = o.confidence; cur.method = o.method; keep[sig] = true; }
    else { obsAdd(sub, o); keep[sig] = true; }
  });
  Object.keys(have).forEach(sig => { if (!keep[sig]) { have[sig].status = "withdrawn"; have[sig].withdrawnAt = obsNow(); } });
  sub.obsCollected = true;
  obsDetect(sub);
}

// ----------------------------------------------------------------------------
// 4. RESOLUTIONS
// ----------------------------------------------------------------------------
function obsResolutions(sub, path) { return (sub.dataResolutions || []).filter(r => r.path === path); }
function obsCurrentRes(sub, path) { return obsResolutions(sub, path).filter(r => !r.validTo)[0] || null; }
/** The value the case uses for a path, or null when nothing is resolved. */
function obsResolvedValue(sub, path) { const r = obsCurrentRes(sub, path); return r ? r.value : null; }
/** Oldest to newest: the values the case has used for a path. */
function obsChain(sub, path) { return obsResolutions(sub, path).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0)); }
function obsChainText(sub, path) { return obsChain(sub, path).map(r => r.value).join(" → "); }
function obsCandidateSig(sub, path) { return obsLive(sub).filter(o => o.path === path).map(o => o.id).sort().join(","); }

/** Writes a resolution: closes the one in force and points back at it. Does not check who may; the callers do. */
function obsRecordResolution(sub, path, o) {
  if (!sub.dataResolutions) sub.dataResolutions = [];
  const prev = obsCurrentRes(sub, path), now = obsNow();
  if (prev) prev.validTo = now;
  const seq = obsResolutions(sub, path).length + 1;
  const rec = { id: obsNextId(sub.dataResolutions, "RES"), path: path, seq: seq, value: String(o.value), chosenObservationId: o.observationId || null, method: o.method, reasonCode: o.reasonCode || "", reason: o.reason || "", resolvedBy: o.by || obsActor(), resolvedAt: now, validFrom: now, validTo: null, supersedesId: prev ? prev.id : null, discrepancyId: o.discrepancyId || null, candidateSig: "" };
  sub.dataResolutions.push(rec);
  rec.candidateSig = obsCandidateSig(sub, path);
  if (o.writeThrough !== false) obsWriteThrough(sub, path, rec.value);
  return rec;
}

/** Puts a resolved value on the case and in the Confirm form, so only resolved values are used downstream. */
function obsWriteThrough(sub, path, value) {
  const draft = typeof emailIngestionDraftBySubId !== "undefined" ? emailIngestionDraftBySubId[sub.id] : null;
  if (draft && path in draft) draft[path] = value;
  const input = document.getElementById("normField_" + path);
  if (input) input.value = value;
  const simple = { insured: "insured", fein: "fein", dot: "dot", mcNumber: "mcNumber", address: "address", broker: "broker", email: "email", expirationDate: "expirationDate" };
  if (simple[path]) sub[simple[path]] = value;
  else if (path === "effectiveDate") { sub.effectiveDate = value; if (sub.genInfo) sub.genInfo.effective_date = value; }
  else if (path === "exposureVal") { const n = parseFloat(String(value).replace(/[^0-9.]/g, "")) || 0; sub.exposureVal = n; sub.exposure = "$" + n.toLocaleString("en-US"); }
  const vm = /^vehicle\.(\d+)\.(\w+)$/.exec(path);
  if (vm) {
    const u = draft && draft.vehicleDetails && draft.vehicleDetails[vm[1]]; if (u) u[vm[2]] = value;
    const v = (sub.vehicles || [])[+vm[1] - 1]; if (v) v[vm[2]] = value;
  }
}

/** A person resolves a discrepancy by choosing one of the values or entering another. Needs the permission, a reason code and a written reason. */
function obsResolve(sub, path, o) {
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return { ok: false, error: "permission" }; }
  const reason = String(o.reason || "").trim();
  if (!OBS_REASON_CODES[o.reasonCode]) return { ok: false, error: "code" };
  if (reason.length < OBS_MIN_REASON) return { ok: false, error: "reason" };
  let method, value, observationId = null;
  if (o.observationId) {
    const ob = (sub.dataObservations || []).find(x => x.id === o.observationId && x.path === path && x.status === "current");
    if (!ob) return { ok: false, error: "observation" };
    method = "user_selected"; value = ob.value; observationId = ob.id;
  } else {
    if (obsBlank(o.value)) return { ok: false, error: "value" };
    method = "user_entered"; value = String(o.value).trim();
    const ob = obsAdd(sub, { path: path, value: value, sourceType: "USER", sourceRef: obsActor(), method: "Entered by a person", confidence: 1, observedBy: obsActor() });
    observationId = ob.id;
  }
  const disc = (sub.dataDiscrepancies || []).find(d => d.path === path && d.status === "open");
  const rec = obsRecordResolution(sub, path, { value: value, observationId: observationId, method: method, reasonCode: o.reasonCode, reason: reason, discrepancyId: disc ? disc.id : null });
  obsLog(sub, "data_resolved", obsPathInfo(path).label + " resolved to " + value + " (" + method.replace("_", " ") + "; " + OBS_REASON_CODES[o.reasonCode] + "): " + reason + (rec.supersedesId ? " It replaces " + obsResolutions(sub, path).filter(r => r.id === rec.supersedesId)[0].value + "." : ""));
  obsDetect(sub); obsSave();
  return { ok: true, resolution: rec };
}

/** A person who may waive completeness items (approve) accepts a discrepancy as it is, with a reason. It reopens if the evidence changes. */
function obsWaive(sub, discId, reason) {
  if (!hasPermission("completeness", "approve")) { denyPermission("completeness", "approve"); return { ok: false, error: "permission" }; }
  reason = String(reason || "").trim();
  if (reason.length < OBS_MIN_REASON) return { ok: false, error: "reason" };
  const d = (sub.dataDiscrepancies || []).find(x => x.id === discId && x.status === "open");
  if (!d) return { ok: false, error: "none" };
  d.status = "waived"; d.waivedBy = obsActor(); d.waivedAt = obsNow(); d.waiveReason = reason; d.waivedSig = d.sig;
  obsLog(sub, "data_waived", obsPathInfo(d.path).label + " (" + d.type.replace("_", " ") + ") waived: " + reason);
  obsSave();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 5. DISCREPANCIES
// ----------------------------------------------------------------------------
const OBS_REQUIRED = sub => ["insured", "fein"].concat((sub.lobKey || "trucking") === "trucking" ? ["dot"] : []);

function obsSeverity(blocks) { return blocks === "rating" || blocks === "quote" ? "high" : blocks === "bind" ? "medium" : "low"; }

/**
 * Works out the discrepancies from the observations, resolutions and pins, and settles what can settle itself:
 * a path with one value gets an automatic resolution; a conflict stays open until a person resolves it for the evidence as it is now.
 */
function obsDetect(sub) {
  if (!sub.dataObservations || !sub.dataObservations.length) return [];
  if (!sub.dataDiscrepancies) sub.dataDiscrepancies = [];
  const live = obsLive(sub), byPath = {};
  live.forEach(o => { (byPath[o.path] = byPath[o.path] || []).push(o); });
  const wanted = {};   // key -> { path, type, ... }
  const want = (path, type, extra) => { wanted[path + "|" + type] = Object.assign({ path: path, type: type }, extra); };

  Object.keys(byPath).forEach(path => {
    const obs = byPath[path], vals = {};
    obs.forEach(o => { const n = obsNorm(path, o.value); (vals[n] = vals[n] || []).push(o); });
    const distinct = Object.keys(vals), cur = obsCurrentRes(sub, path), sig = obsCandidateSig(sub, path);
    if (distinct.length >= 2) want(path, "value_mismatch", { sig: sig, candidateIds: obs.map(o => o.id) });
    else if (distinct.length === 1) {
      const best = obs.slice().sort((a, b) => b.confidence - a.confidence)[0];
      if (!cur) obsRecordResolution(sub, path, { value: best.value, observationId: best.id, method: "auto_single", reason: "Every source agrees.", by: "System", writeThrough: false });
      else if (/^auto/.test(cur.method) && obsNorm(path, cur.value) !== distinct[0]) obsRecordResolution(sub, path, { value: best.value, observationId: best.id, method: "auto_single", reason: "Every source agrees.", by: "System", writeThrough: false });
      else if (cur && cur.candidateSig !== sig && /^auto/.test(cur.method)) cur.candidateSig = sig;
    }
  });
  OBS_REQUIRED(sub).forEach(path => { if (!(byPath[path] || []).length) want(path, "missing", { sig: "none" }); });
  // Provider data that has outlived its freshness window.
  const now = Date.now();
  Object.keys(byPath).forEach(path => {
    const prov = byPath[path].filter(o => o.sourceType === "PROVIDER" && o.expiresAt);
    const latest = prov.sort((a, b) => b.asOf.localeCompare(a.asOf) || (a.id < b.id ? 1 : -1))[0];
    if (latest && Date.parse(latest.expiresAt) < now) want(path, "stale", { sig: latest.id + "@" + latest.expiresAt, candidateIds: [latest.id] });
  });
  // The case was rated on a value that has changed since.
  const pins = sub.ratingPins && sub.ratingPins.pins;
  if (pins) Object.keys(pins).forEach(path => { const c = obsCurrentRes(sub, path); if (c && c.id !== pins[path]) want(path, "stale_rating", { sig: pins[path] + ">" + c.id }); });

  Object.keys(wanted).forEach(key => {
    const w = wanted[key], info = obsPathInfo(w.path);
    let d = sub.dataDiscrepancies.find(x => x.path === w.path && x.type === w.type);
    const blocks = w.type === "stale_rating" ? "quote" : info.blocks;
    if (!d) {
      d = { id: obsNextId(sub.dataDiscrepancies, "DSC"), path: w.path, label: info.label, type: w.type, severity: obsSeverity(blocks), blocksStage: blocks, status: "open", detectedAt: obsNow(), assignedTo: sub.assignedTo || null, candidateIds: w.candidateIds || [], sig: w.sig };
      sub.dataDiscrepancies.push(d);
    } else {
      d.blocksStage = blocks; d.severity = obsSeverity(blocks); d.candidateIds = w.candidateIds || d.candidateIds;
      const changed = d.sig !== w.sig; d.sig = w.sig;
      if (d.status === "waived" && d.waivedSig !== w.sig) { d.status = "open"; delete d.waivedBy; delete d.waiveReason; }
      else if (d.status === "resolved" && changed) { d.status = "open"; delete d.resolvedAt; delete d.resolutionId; }
    }
    if (d.status === "open" && w.type === "value_mismatch") {
      const cur = obsCurrentRes(sub, w.path);
      if (cur && cur.candidateSig === w.sig) { d.status = "resolved"; d.resolvedAt = cur.resolvedAt; d.resolutionId = cur.id; }
    }
    if (d.status === "open" && w.type === "missing") {
      const cur = obsCurrentRes(sub, w.path);
      if (cur && !obsBlank(cur.value)) { d.status = "resolved"; d.resolvedAt = cur.resolvedAt; d.resolutionId = cur.id; }
    }
  });
  // Whatever is no longer wanted has settled by itself.
  sub.dataDiscrepancies.forEach(d => { if (d.status === "open" && !wanted[d.path + "|" + d.type]) { d.status = "resolved"; d.resolvedAt = obsNow(); d.resolutionId = (obsCurrentRes(sub, d.path) || {}).id || null; d.settledBy = "System"; } });
  return sub.dataDiscrepancies;
}

function obsOpen(sub) { return (sub.dataDiscrepancies || []).filter(d => d.status === "open"); }
/** Open discrepancies that stop a case at a stage ("rating", "quote" or "bind"): those that block it or an earlier one. */
function obsBlockers(sub, stage) {
  const rank = OBS_STAGES[stage] || 0;
  return obsOpen(sub).filter(d => d.blocksStage && OBS_STAGES[d.blocksStage] <= rank);
}
/** Which stage a step is: 0 before rating, then rating, quote, bind. */
function obsStageOfStep(step) { return step >= BIND_STEP ? "bind" : step >= QUOTE_STEP ? "quote" : step >= RATING_STEP ? "rating" : null; }
function obsBlockText(list) { return list.map(d => d.label + " (" + d.type.replace(/_/g, " ") + ")").join("; "); }

/** Notes which resolved values the case is rated on, so a later change to one is seen. */
function obsPinResolutions(sub) {
  const pins = {};
  (sub.dataResolutions || []).filter(r => !r.validTo).forEach(r => { pins[r.path] = r.id; });
  sub.ratingPins = { at: obsNow(), by: obsActor(), pins: pins };
  obsDetect(sub); obsSave();
  return sub.ratingPins;
}
function obsRepin(sub) {
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return { ok: false, error: "permission" }; }
  obsPinResolutions(sub);
  obsLog(sub, "data_repinned", "The case was re-rated on the current resolved values.");
  obsSave();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 6. ENRICHMENT: PROVIDERS, ORDERS, RESPONSES, COST AND FRESHNESS
// ----------------------------------------------------------------------------
const DATA_PROVIDERS = [
  { code: "FMCSA", name: "FMCSA (US Department of Transportation)", type: "government" },
  { code: "NHTSA", name: "NHTSA (US Department of Transportation)", type: "government" },
  { code: "STATE_DMV", name: "State motor vehicle agency", type: "government" }
];
const DATA_PRODUCTS = [
  { code: "FMCSA_SAFER", provider: "FMCSA", name: "Company Snapshot (SAFER)", ttlHours: 720, unitCost: 0, currency: "USD", supplies: ["insured", "dot", "mcNumber", "address"], lob: ["trucking"], note: "Public record, no fee. Legal name, address, USDOT and MC numbers." },
  { code: "FMCSA_LI", provider: "FMCSA", name: "Licensing & Insurance (authority and insurance on file)", ttlHours: 168, unitCost: 0, currency: "USD", supplies: ["mcNumber"], lob: ["trucking"], note: "Public record, no fee. Changes often, so the answer is fresh for a week." },
  { code: "NHTSA_VPIC", provider: "NHTSA", name: "VIN decode (vPIC)", ttlHours: 8760, unitCost: 0, currency: "USD", supplies: ["vehicle.N.year", "vehicle.N.make", "vehicle.N.model"], lob: null, note: "Public record, no fee. A VIN does not change, so the answer keeps for a year." },
  { code: "STATE_MVR", provider: "STATE_DMV", name: "Motor vehicle record", ttlHours: 720, unitCost: null, currency: "USD", supplies: ["driver.N.licenseStatus"], lob: null, note: "The fee is set by each state; enter it when you record the response. Fresh for 30 days." }
];
function enrProduct(code) { return DATA_PRODUCTS.find(p => p.code === code) || null; }
function enrRequests(sub) { return sub.enrichmentRequests || []; }
function enrResponses(sub) { return sub.enrichmentResponses || []; }
function enrLatestResponse(sub, code) { return enrResponses(sub).filter(r => r.productCode === code && r.status !== "error").slice().sort((a, b) => a.id < b.id ? 1 : -1)[0] || null; }
/** fresh, expired or none, with the date it is fresh until. */
function enrFreshness(resp, now) {
  if (!resp) return { state: "none" };
  const left = Date.parse(resp.expiresAt) - (now || Date.now());
  return { state: left > 0 ? "fresh" : "expired", until: resp.expiresAt.slice(0, 10), hoursLeft: Math.round(left / 3600000) };
}

/** Orders a product from a provider. Nothing is fetched. An answer that is still fresh is not ordered again unless asked for. */
function enrichOrder(sub, code, opts) {
  opts = opts || {};
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return { ok: false, error: "permission" }; }
  const p = enrProduct(code); if (!p) return { ok: false, error: "product" };
  if (p.lob && p.lob.indexOf(sub.lobKey || "trucking") === -1) return { ok: false, error: "line" };
  if (enrRequests(sub).some(r => r.productCode === code && r.status === "sent")) return { ok: false, error: "open" };
  const fr = enrFreshness(enrLatestResponse(sub, code));
  if (fr.state === "fresh" && !opts.force) return { ok: false, error: "fresh", until: fr.until };
  if (!sub.enrichmentRequests) sub.enrichmentRequests = [];
  const req = { id: obsNextId(sub.enrichmentRequests, "ENR"), productCode: code, providerCode: p.provider, reason: String(opts.reason || "").trim(), requestedBy: obsActor(), requestedAt: obsNow(), status: "sent", estimatedCost: p.unitCost, currency: p.currency };
  sub.enrichmentRequests.push(req);
  obsLog(sub, "data_ordered", p.name + " ordered from " + (DATA_PROVIDERS.find(x => x.code === p.provider) || {}).name + (p.unitCost === null ? " (fee set by the state)" : p.unitCost ? " (about $" + p.unitCost + ")" : " (no fee)") + ".");
  obsSave();
  return { ok: true, request: req };
}

function enrParseValues(text) {
  const values = {}, bad = [];
  String(text || "").split(/\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const m = /^([\w.]+)\s*[:=]\s*(.+)$/.exec(l);
    if (!m || !obsPathKnown(m[1])) bad.push(l); else values[m[1]] = m[2].trim();
  });
  return { values: values, bad: bad };
}

/** Records what the provider answered. Each value becomes an observation as of today, fresh for the product's window; the previous answer is superseded. */
function enrichReceive(sub, requestId, o) {
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return { ok: false, error: "permission" }; }
  const req = enrRequests(sub).find(r => r.id === requestId);
  if (!req || req.status !== "sent") return { ok: false, error: "request" };
  const p = enrProduct(req.productCode), status = o.status || "matched";
  const bad = Object.keys(o.values || {}).filter(k => !obsPathKnown(k));
  if (bad.length) return { ok: false, error: "path", bad: bad };
  const cost = o.costAmount === undefined || o.costAmount === "" || o.costAmount === null ? (p.unitCost === null ? null : p.unitCost) : Number(o.costAmount);
  if (cost !== null && !(cost >= 0)) return { ok: false, error: "cost" };
  const match = o.matchConfidence === undefined ? 1 : Number(o.matchConfidence);
  if (!(match >= 0 && match <= 1)) return { ok: false, error: "match" };
  if (status === "matched" && !Object.keys(o.values || {}).length) return { ok: false, error: "values" };
  if (!sub.enrichmentResponses) sub.enrichmentResponses = [];
  const nowMs = Date.now(), nowIso = new Date(nowMs).toISOString();
  const resp = { id: obsNextId(sub.enrichmentResponses, "RSP"), requestId: req.id, productCode: req.productCode, providerCode: req.providerCode, receivedAt: nowIso, expiresAt: new Date(nowMs + p.ttlHours * 3600000).toISOString(), costAmount: cost, currency: p.currency, matchConfidence: match, status: status, values: o.values || {}, note: String(o.note || "").trim(), recordedBy: obsActor() };
  sub.enrichmentResponses.push(resp);
  req.status = status === "error" ? "failed" : "received"; req.responseId = resp.id;
  if (status === "matched") {
    // the previous answer from this product is superseded
    const old = enrResponses(sub).filter(r => r.productCode === req.productCode && r.id !== resp.id).map(r => r.id);
    (sub.dataObservations || []).forEach(x => { if (x.status === "current" && x.sourceType === "PROVIDER" && old.indexOf(x.responseId) > -1) { x.status = "superseded"; x.supersededAt = obsNow(); } });
    Object.keys(resp.values).forEach(path => obsAdd(sub, { path: path, value: resp.values[path], sourceType: "PROVIDER", sourceRef: req.productCode, responseId: resp.id, method: (DATA_PROVIDERS.find(x => x.code === req.providerCode) || {}).name, confidence: match, asOf: nowIso.slice(0, 10), expiresAt: resp.expiresAt, observedBy: obsActor() }));
    sub.obsCollected = true;
  }
  obsLog(sub, "data_received", p.name + ": " + (status === "matched" ? Object.keys(resp.values).length + " value(s) recorded" : status === "no_match" ? "the provider found no match" : "the request failed") + (cost !== null ? ", cost $" + cost : "") + ".");
  obsDetect(sub); obsSave();
  return { ok: true, response: resp };
}
function enrTotalCost(sub) { return enrResponses(sub).reduce((s, r) => s + (r.costAmount || 0), 0); }

// ----------------------------------------------------------------------------
// 7. HOOKS INTO THE EXISTING FLOW
// ----------------------------------------------------------------------------
var _obsOrigConsolidate = window.diConsolidate;
window.diConsolidate = function (sub, sources) {
  const draft = _obsOrigConsolidate.apply(this, arguments);
  try { if (sub && sub.id && sources && sources.length) obsCollectFromDocuments(sub, sources, draft); } catch (e) { console.warn("Observation collection failed:", e); }
  return draft;
};

/** A value a person typed over at Confirm is an observation by that person and a resolution. */
function obsRecordUserEdits(sub, draft) {
  if (!sub.dataObservations || !sub.dataObservations.length) return;
  DI_SCALAR_KEYS.forEach(k => {
    const input = document.getElementById("normField_" + k); if (!input) return;
    const v = input.value.trim(); if (obsBlank(v)) return;
    const cur = obsCurrentRes(sub, k), base = cur ? cur.value : draft[k];
    if (!obsBlank(base) && obsNorm(k, v) === obsNorm(k, base)) return;
    const ob = obsAdd(sub, { path: k, value: v, sourceType: "USER", sourceRef: obsActor(), method: "Typed over at Confirm", confidence: 1, observedBy: obsActor() });
    obsRecordResolution(sub, k, { value: v, observationId: ob.id, method: "user_entered", reasonCode: "other", reason: "Edited at Confirm.", writeThrough: false });
    obsLog(sub, "data_resolved", (OBS_PATHS[k] || {}).label + " changed to " + v + " at Confirm" + (obsBlank(base) ? "." : " (was " + base + ")."));
  });
}
var _obsOrigApply = window.applyNormalizedDataToSubmission;
window.applyNormalizedDataToSubmission = function (subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId), draft = typeof emailIngestionDraftBySubId !== "undefined" ? emailIngestionDraftBySubId[subId] : null;
  try { if (sub && draft) obsRecordUserEdits(sub, draft); } catch (e) { console.warn("Recording edits failed:", e); }
  const r = _obsOrigApply.apply(this, arguments);
  try { if (sub) { obsDetect(sub); obsSave(); renderDataObservations(sub); } } catch (e) { console.warn("Observation refresh failed:", e); }
  return r;
};

// Gates: a case with an open discrepancy cannot enter the step it blocks, nor issue the quote or bind it.
(function installObsGates() {
  const origGo = window.goToWorkflowStep;
  if (typeof origGo === "function") {
    window.goToWorkflowStep = function (stepNum) {
      const sub = obsSub(), stage = obsStageOfStep(stepNum);
      if (sub && stage) {
        const b = obsBlockers(sub, stage);
        if (b.length) {
          showToast("⛔ Open data discrepancies block " + OBS_STAGE_LABELS[b.reduce((m, d) => OBS_STAGES[d.blocksStage] < OBS_STAGES[m] ? d.blocksStage : m, b[0].blocksStage)] + ": " + obsBlockText(b) + ". Resolve them at Confirm or Enrich & Check.", "danger");
          const first = b.reduce((m, d) => Math.min(m, obsStageStep(d.blocksStage)), 99);
          stepNum = Math.min(stepNum, first - 1);
        }
      }
      const r = origGo.call(this, stepNum);
      try { if (stepNum === RATING_STEP && sub && sub.dataObservations && !sub.ratingPins && !obsBlockers(sub, "rating").length) obsPinResolutions(sub); } catch (e) { /* pins are best effort */ }
      return r;
    };
  }
  const origNext = window.goToNextStep;
  if (typeof origNext === "function") {
    window.goToNextStep = function () {
      const sub = obsSub(), stage = obsStageOfStep(currentWorkflowStep + 1);
      if (sub && stage) {
        const b = obsBlockers(sub, stage);
        if (b.length) { showToast("⛔ Open data discrepancies block " + OBS_STAGE_LABELS[stage] + ": " + obsBlockText(b) + ". Resolve them at Confirm or Enrich & Check.", "danger"); return; }
      }
      return origNext.apply(this, arguments);
    };
  }
  const guard = stage => args => {
    const sub = obsSub(); if (!sub) return true;
    const b = obsBlockers(sub, stage);
    if (!b.length) return true;
    obsLog(sub, "data_blocked", "Attempt blocked by open data discrepancies: " + obsBlockText(b) + ".");
    showToast("⛔ Open data discrepancies block " + OBS_STAGE_LABELS[stage] + ": " + obsBlockText(b) + ".", "danger");
    return false;
  };
  if (typeof registerGuard === "function") {
    registerGuard("issueQuote", "unresolved source data", guard("quote"));
    registerGuard("eSign", "unresolved source data", guard("quote"));
    registerGuard("bind", "unresolved source data", guard("bind"));
  }
})();

var _obsOrigBrief = window.buildDecisionBrief;
window.buildDecisionBrief = function (sub) {
  const b = _obsOrigBrief.apply(this, arguments);
  try {
    if (sub.dataObservations && sub.dataObservations.length) {
      const open = obsOpen(sub), blocking = open.filter(d => d.blocksStage);
      b.checks.push(blocking.length ? dbCheck("Source data", "fail", blocking.length + " open discrepancy(ies) block the case: " + obsBlockText(blocking) + ".")
        : open.length ? dbCheck("Source data", "warn", open.length + " open discrepancy(ies) that do not block: " + obsBlockText(open) + ".")
          : dbCheck("Source data", "ok", obsLive(sub).length + " value(s) from " + Object.keys(obsLive(sub).reduce((m, o) => { m[o.sourceRef] = 1; return m; }, {})).length + " source(s), all resolved."));
      if (blocking.length && b.recommendation !== "decline") { b.recommendation = "info"; b.reasons = b.reasons.filter(r => !/^Within appetite/.test(r)); b.reasons.push("Source data disagrees or is missing: " + obsBlockText(blocking) + "."); }
    }
  } catch (e) { console.warn("Brief additions failed:", e); }
  return b;
};

// ----------------------------------------------------------------------------
// 8. SCREENS
// ----------------------------------------------------------------------------
const OBS_TYPE_TEXT = { value_mismatch: "Sources disagree", missing: "Required value missing", stale: "Provider data has expired", stale_rating: "Rated on a value that has changed" };
function obsConfPct(c) { return Math.round((c || 0) * 100) + "%"; }

function obsCandidateHtml(sub, d, o, canResolve) {
  const where = [o.sourceType === "USER" ? "Entered by " + o.sourceRef : o.sourceType === "PROVIDER" ? o.method + " (" + o.sourceRef + ")" : o.sourceRef, o.page ? "page " + o.page : "", o.method && o.sourceType !== "PROVIDER" && o.sourceType !== "USER" ? o.method : ""].filter(Boolean).join(", ");
  return `<tr><td><strong>${obsEsc(o.value)}</strong></td><td>${obsEsc(where)}${o.snippet ? `<div class="text-xs text-muted">${obsEsc(o.snippet)}</div>` : ""}</td><td>${obsConfPct(o.confidence)}</td><td>${obsEsc(o.asOf)}${o.expiresAt ? `<div class="text-xs text-muted">fresh until ${obsEsc(o.expiresAt.slice(0, 10))}</div>` : ""}</td><td>${canResolve ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="obsUiPick('${sub.id}','${d.id}','${o.id}')">Use this</button>` : ""}</td></tr>`;
}
function obsDiscrepancyHtml(sub, d) {
  const canResolve = hasPermission("completeness", "edit"), canWaive = hasPermission("completeness", "approve");
  const cands = obsLive(sub).filter(o => o.path === d.path);
  const blocks = d.blocksStage ? `<span class="badge badge-danger">blocks ${obsEsc(OBS_STAGE_LABELS[d.blocksStage])}</span>` : '<span class="badge badge-light">does not block</span>';
  return `<div style="border:1px solid var(--border-color,#ddd);border-radius:6px;padding:10px;margin-bottom:8px;" data-disc="${d.id}">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><strong>${obsEsc(d.label)}</strong><span class="badge badge-warning">${obsEsc(OBS_TYPE_TEXT[d.type])}</span>${blocks}<span class="text-xs text-muted">${obsEsc(d.id)}, found ${obsEsc(d.detectedAt)}</span></div>
    ${d.type === "stale_rating" ? `<p class="ws-small" style="margin:6px 0;">The case was rated on a different value for this field. Change history: <strong>${obsEsc(obsChainText(sub, d.path))}</strong>. Re-rate, then confirm below.</p>${canResolve ? `<button class="btn btn-sm btn-primary" style="width:auto;" onclick="obsUiRepin('${sub.id}')">The case is re-rated on the current values</button>` : ""}` : `
    ${cands.length ? `<table class="data-table" style="margin-top:6px;"><thead><tr><th>Value</th><th>Source</th><th>Confidence</th><th>As of</th><th></th></tr></thead><tbody>${cands.map(o => obsCandidateHtml(sub, d, o, canResolve && d.type !== "stale")).join("")}</tbody></table>` : '<p class="ws-small" style="margin:6px 0;">No source states this value.</p>'}
    ${canResolve ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;margin-top:6px;" class="ws-small">
      <input id="obs_val_${d.id}" class="form-control form-control-sm" placeholder="Or enter the value">
      <select id="obs_code_${d.id}" class="form-control form-control-sm">${Object.keys(OBS_REASON_CODES).map(k => `<option value="${k}">${obsEsc(OBS_REASON_CODES[k])}</option>`).join("")}</select>
      <input id="obs_reason_${d.id}" class="form-control form-control-sm" placeholder="Why (at least ${OBS_MIN_REASON} characters)">
      <button class="btn btn-sm btn-primary" style="width:auto;" onclick="obsUiEnter('${sub.id}','${d.id}')">Resolve with this value</button>
      ${canWaive ? `<button class="btn btn-sm btn-outline" style="width:auto;" onclick="obsUiWaive('${sub.id}','${d.id}')">Accept as it is (waive)</button>` : ""}</div>` : '<p class="ws-small text-muted" style="margin:6px 0;">You can read this; resolving needs the completeness edit permission.</p>'}`}
  </div>`;
}
function renderDataObservations(sub) {
  const hosts = ["dataDiscrepancyContainer", "dataDiscrepancyContainer2"].map(id => document.getElementById(id)).filter(Boolean);
  if (!hosts.length) return;
  if (!sub || !sub.dataObservations || !sub.dataObservations.length) { hosts.forEach(h => { h.innerHTML = ""; }); return; }
  obsDetect(sub);
  const open = obsOpen(sub), blocking = open.filter(d => d.blocksStage), live = obsLive(sub);
  const chains = Object.keys(live.reduce((m, o) => { m[o.path] = 1; return m; }, {})).filter(p => obsResolutions(sub, p).length > 1);
  const resolved = (sub.dataDiscrepancies || []).filter(d => d.status === "resolved" || d.status === "waived");
  const html = `<div class="card" style="margin-top:12px;">
    <div class="card-header"><h3><i class="ph ph-git-diff"></i> Source data: conflicts and gaps</h3><span class="badge ${blocking.length ? "badge-danger" : open.length ? "badge-warning" : "badge-success"}">${open.length ? open.length + " open" + (blocking.length ? ", " + blocking.length + " blocking" : "") : "All resolved"}</span></div>
    <div class="card-body">
      <p class="ws-small text-muted" style="margin:0 0 8px;">Every value any source gave is kept with where it came from, how sure the reading was and the date it is as of. The case uses only resolved values. A discrepancy blocks rating, the quote or the bind until a person resolves it.</p>
      ${open.length ? open.map(d => obsDiscrepancyHtml(sub, d)).join("") : '<p class="ws-small" style="margin:0 0 8px;">Nothing is open.</p>'}
      ${chains.length ? `<div class="uwp-subsection-title">Change history</div><ul class="ws-small" style="margin:0 0 8px;">${chains.map(p => `<li><strong>${obsEsc(obsPathInfo(p).label)}</strong>: ${obsEsc(obsChainText(sub, p))}</li>`).join("")}</ul>` : ""}
      ${resolved.length ? `<details><summary class="ws-small">${resolved.length} settled</summary><ul class="ws-small">${resolved.map(d => `<li>${obsEsc(d.label)} (${obsEsc(OBS_TYPE_TEXT[d.type])}): ${d.status === "waived" ? "waived by " + obsEsc(d.waivedBy) + ", " + obsEsc(d.waiveReason) : "resolved to " + obsEsc((sub.dataResolutions || []).filter(r => r.id === d.resolutionId).map(r => r.value)[0] || "")}</li>`).join("")}</ul></details>` : ""}
      <details style="margin-top:6px;"><summary class="ws-small">Where each value came from (${live.length})</summary>
        <table class="data-table"><thead><tr><th>Field</th><th>Value</th><th>Source</th><th>Location</th><th>Confidence</th><th>As of</th></tr></thead><tbody>${live.map(o => `<tr><td>${obsEsc(obsPathInfo(o.path).label)}</td><td>${obsEsc(o.value)}</td><td>${obsEsc(o.sourceType)}: ${obsEsc(o.sourceRef)}</td><td>${obsEsc([o.page ? "page " + o.page : "", o.method].filter(Boolean).join(", "))}</td><td>${obsConfPct(o.confidence)}</td><td>${obsEsc(o.asOf)}</td></tr>`).join("")}</tbody></table></details>
    </div></div>`;
  hosts.forEach(h => { h.innerHTML = html; });
}

function renderEnrichment(sub) {
  const box = document.getElementById("dataEnrichmentContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const canEdit = hasPermission("submissionData", "edit");
  const rows = DATA_PRODUCTS.filter(p => !p.lob || p.lob.indexOf(sub.lobKey || "trucking") > -1).map(p => {
    const open = enrRequests(sub).filter(r => r.productCode === p.code && r.status === "sent")[0], resp = enrLatestResponse(sub, p.code), fr = enrFreshness(resp);
    const status = open ? `<span class="badge badge-warning">Ordered ${obsEsc(open.requestedAt)}, waiting</span>` : fr.state === "fresh" ? `<span class="badge badge-success">Fresh until ${obsEsc(fr.until)}</span>` : fr.state === "expired" ? `<span class="badge badge-danger">Expired ${obsEsc(fr.until)}</span>` : '<span class="badge badge-light">Not ordered</span>';
    const cost = p.unitCost === null ? "set by the state" : p.unitCost === 0 ? "no fee" : "$" + p.unitCost;
    const form = open && canEdit ? `<div style="margin-top:6px;" class="ws-small"><textarea id="enr_vals_${open.id}" class="form-control" rows="3" placeholder="One value per line, e.g.&#10;insured: Links LLC&#10;dot: 1234567"></textarea>
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;"><input id="enr_cost_${open.id}" type="number" step="0.01" class="form-control form-control-sm" style="width:130px;" placeholder="Cost ($)"><input id="enr_match_${open.id}" type="number" min="0" max="100" class="form-control form-control-sm" style="width:130px;" placeholder="Match %" value="100">
      <select id="enr_status_${open.id}" class="form-control form-control-sm" style="width:auto;"><option value="matched">Provider matched</option><option value="no_match">No match</option><option value="error">Request failed</option></select>
      <button class="btn btn-sm btn-primary" style="width:auto;" onclick="enrUiRecord('${sub.id}','${open.id}')">Record the response</button></div></div>` : "";
    return `<tr><td><strong>${obsEsc(p.name)}</strong><div class="text-xs text-muted">${obsEsc((DATA_PROVIDERS.find(x => x.code === p.provider) || {}).name)}. ${obsEsc(p.note)}</div>${form}</td><td>${cost}</td><td>${p.ttlHours >= 8760 ? Math.round(p.ttlHours / 8760) + " year" : p.ttlHours % 24 === 0 ? p.ttlHours / 24 + " days" : p.ttlHours + " h"}</td><td>${status}${resp ? `<div class="text-xs text-muted">${resp.status === "matched" ? Object.keys(resp.values).length + " value(s)" : resp.status}, ${resp.costAmount === null ? "fee not entered" : "$" + resp.costAmount}, match ${obsConfPct(resp.matchConfidence)}</div>` : ""}</td><td>${canEdit && !open ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="enrUiOrder('${sub.id}','${p.code}')">${fr.state === "none" ? "Order" : "Order again"}</button>` : ""}</td></tr>`;
  }).join("");
  box.innerHTML = `<div class="card" style="margin-top:12px;"><div class="card-header"><h3><i class="ph ph-cloud-arrow-down"></i> Provider data: orders, cost and freshness</h3><span class="badge badge-light">Spent on this case: $${enrTotalCost(sub).toFixed(2)}</span></div>
    <div class="card-body"><div class="alert alert-warning ws-small"><i class="ph ph-plug"></i> <strong>No provider is connected.</strong> An order here records the request; get the answer from the provider's public record and enter it. Its values are compared with what the documents said, and the answer expires after the window shown.</div>
    <table class="data-table"><thead><tr><th>Product</th><th>Cost</th><th>Fresh for</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ---- screen actions
function obsUiToast(r, ok) {
  if (r.ok) { if (ok) showToast(ok, "success"); return; }
  const m = { permission: "", code: "Pick a reason.", reason: "Say why (at least " + OBS_MIN_REASON + " characters).", value: "Enter a value.", observation: "That value is no longer a candidate.", none: "Nothing to change.", request: "That order is not waiting for a response.", path: "Unknown field: " + (r.bad || []).join(", ") + ".", cost: "The cost must be a number from 0.", match: "The match must be from 0 to 100%.", values: "Enter at least one value, or choose No match.", product: "Unknown product.", line: "This product does not apply to the case's line.", open: "This product is already ordered and waiting.", fresh: "The answer is still fresh until " + r.until + ". Order again only if it must be repeated." };
  if (m[r.error]) showToast(m[r.error], "warning");
}
function obsUiRefresh(sub) { renderDataObservations(sub); renderEnrichment(sub); }
function obsUiV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function obsUiPick(subId, discId, obsId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId), d = sub && (sub.dataDiscrepancies || []).find(x => x.id === discId); if (!d) return;
  obsUiToast(obsResolve(sub, d.path, { observationId: obsId, reasonCode: obsUiV("obs_code_" + discId), reason: obsUiV("obs_reason_" + discId) }), d.label + " resolved.");
  obsUiRefresh(sub);
}
function obsUiEnter(subId, discId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId), d = sub && (sub.dataDiscrepancies || []).find(x => x.id === discId); if (!d) return;
  obsUiToast(obsResolve(sub, d.path, { value: obsUiV("obs_val_" + discId), reasonCode: obsUiV("obs_code_" + discId), reason: obsUiV("obs_reason_" + discId) }), d.label + " resolved.");
  obsUiRefresh(sub);
}
function obsUiWaive(subId, discId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return;
  obsUiToast(obsWaive(sub, discId, obsUiV("obs_reason_" + discId)), "Accepted as it is.");
  obsUiRefresh(sub);
}
function obsUiRepin(subId) { const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return; obsUiToast(obsRepin(sub), "The case is now rated on the current values."); obsUiRefresh(sub); }
function enrUiOrder(subId, code) { const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return; obsUiToast(enrichOrder(sub, code, {}), "Ordered. Record the response when you have it."); obsUiRefresh(sub); }
function enrUiRecord(subId, reqId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return;
  const parsed = enrParseValues(obsUiV("enr_vals_" + reqId));
  if (parsed.bad.length) { showToast("Not understood: " + parsed.bad[0], "warning"); return; }
  const r = enrichReceive(sub, reqId, { values: parsed.values, costAmount: obsUiV("enr_cost_" + reqId), matchConfidence: (parseFloat(obsUiV("enr_match_" + reqId)) || 0) / 100, status: obsUiV("enr_status_" + reqId) || "matched" });
  obsUiToast(r, "Response recorded.");
  obsUiRefresh(sub);
}

registerStepRenderer("dataObservations", renderDataObservations);
registerStepRenderer("dataEnrichment", renderEnrichment);

(function installObsAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  const m = (label, icon, badge, outcome) => ({ label: label, icon: icon, badge: badge, outcome: outcome });
  AUDIT_ACTION_META.data_resolved = m("Data Value Resolved", "ph-git-merge", "badge-success", "outcome-approve");
  AUDIT_ACTION_META.data_waived = m("Data Discrepancy Waived", "ph-shield-check", "badge-warning", "outcome-refer");
  AUDIT_ACTION_META.data_blocked = m("Blocked by Source Data", "ph-prohibit", "badge-danger", "outcome-decline");
  AUDIT_ACTION_META.data_repinned = m("Case Re-rated on New Values", "ph-arrows-clockwise", "badge-info", "outcome-approve");
  AUDIT_ACTION_META.data_ordered = m("Provider Data Ordered", "ph-cloud-arrow-down", "badge-info", "outcome-approve");
  AUDIT_ACTION_META.data_received = m("Provider Response Recorded", "ph-cloud-check", "badge-success", "outcome-approve");
})();

Object.assign(window, { obsNorm, obsLive, obsAdd, obsCollectFromDocuments, obsCurrentRes, obsResolvedValue, obsChain, obsChainText, obsResolve, obsWaive, obsDetect, obsOpen, obsBlockers, obsStageOfStep, obsPinResolutions, obsRepin, enrichOrder, enrichReceive, enrParseValues, enrFreshness, enrLatestResponse, enrTotalCost, renderDataObservations, renderEnrichment, obsUiPick, obsUiEnter, obsUiWaive, obsUiRepin, enrUiOrder, enrUiRecord, DATA_PRODUCTS, DATA_PROVIDERS });
