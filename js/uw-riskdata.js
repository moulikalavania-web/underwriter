/**
 * ============================================================================
 * RISK DATA: STRUCTURED LOSS HISTORY, SCORES PER OBJECT, THIRD-PARTY RECORDS
 * ----------------------------------------------------------------------------
 * LOSS HISTORY   Loss runs were rows with a year and an amount. A loss history is now one record per prior carrier and period, with the
 *                valuation date, the source document and the claims in it (claim number, loss date, cause, open or closed, paid,
 *                reserve, incurred, and a large-loss flag), plus the earned premium of the period when it is known. From them the
 *                metrics are worked out with the calculation version and date: per period the claim count, open claims, paid, reserve,
 *                incurred, large losses, severity (incurred per claim) and loss ratio (incurred over earned premium; none when the
 *                premium is not known); and across periods the frequency (claims a year) and its trend.
 * OBJECT SCORES A risk score used to be one number for the case. A score can now belong to one object (a vehicle, a driver, a location) or
 *                the policy: its type, value from 0 to 100, its source (a provider, a rule, a model or the underwriter), the model
 *                version, when it was scored, and, for a provider's score, the provider response it came from. NO MODEL OR PROVIDER IS
 *                CONNECTED: scores are recorded, not invented, and a provider or model score cannot be recorded without its version and
 *                (for a provider) its response.
 * THIRD-PARTY RECORDS  Inspections, crashes, violations, recalls, registrations and filings from an outside source (FMCSA, MVR, NHTSA, a
 *                DMV) are one row each, with the source, the provider's own key for the record (unique per source and type, so a
 *                record is not entered twice), the date, the object or driver it concerns, a severity and attributes checked against
 *                the type. A correction supersedes the earlier row; nothing is edited. NO SOURCE IS CONNECTED: the rows are entered
 *                from what the underwriter obtained.
 * ============================================================================
 */

const LM_VERSION = "2026.1";
const LH_STATUSES = { open: "Open", closed: "Closed" };
const OS_TYPES = { vehicle: "Vehicle", driver: "Driver", location: "Location", policy: "Policy" };
const OS_SOURCES = { provider: "Provider", model: "Model", rule: "Rule", manual: "Underwriter" };
const ER_TYPES = {
  inspection: { label: "Inspection", fields: { level: "int:1:6", out_of_service: "bool", violations: "int:0" } },
  crash: { label: "Crash", fields: { fatalities: "int:0", injuries: "int:0", tow_away: "bool" } },
  violation: { label: "Violation", fields: { code: "text", points: "int:0" } },
  recall: { label: "Recall", fields: { campaign: "text", component: "text" } },
  registration: { label: "Registration", fields: { plate: "text", registered_state: "state", expires_on: "date" } },
  filing: { label: "Filing", fields: { form: "text", status: "text" } }
};
const ER_SOURCES = ["FMCSA", "MVR", "NHTSA", "DMV", "ISO ClaimSearch", "Other"];
const ER_SEVERITIES = ["low", "medium", "high"];
const RD_ISO = /^\d{4}-\d{2}-\d{2}$/;
function rdActor() { return ucActor(); }
function rdSave() { if (typeof persistAppState === "function") persistAppState(); }
function rdEdit() { if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return false; } return true; }
function rdLarge() { return typeof ANALYSIS_LARGE_LOSS !== "undefined" ? ANALYSIS_LARGE_LOSS : 100000; }

// ----------------------------------------------------------------------------
// 1. LOSS HISTORY
// ----------------------------------------------------------------------------
function lhList(sub) { if (!sub.lossHistories) sub.lossHistories = []; return sub.lossHistories; }
function lhFind(sub, id) { return lhList(sub).find(h => h.id === id) || null; }
/** f: { priorCarrier, lob, periodFrom, periodTo, valuationDate, sourceDocument, earnedPremium, currency } */
function lhAdd(sub, f) {
  if (!rdEdit()) return { ok: false, error: "permission" };
  const e = [];
  if (String(f.priorCarrier || "").trim().length < 2) e.push("name the prior carrier");
  if (!RD_ISO.test(f.periodFrom || "") || !RD_ISO.test(f.periodTo || "") || f.periodFrom >= f.periodTo) e.push("enter the period (from before to)");
  if (!RD_ISO.test(f.valuationDate || "") || f.valuationDate > todayIso() || (RD_ISO.test(f.periodFrom || "") && f.valuationDate < f.periodFrom)) e.push("enter the valuation date (not in the future, not before the period starts)");
  if (f.earnedPremium !== "" && f.earnedPremium !== undefined && f.earnedPremium !== null && !(Number(f.earnedPremium) >= 0)) e.push("earned premium is a number from 0");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  if (lhList(sub).some(h => h.priorCarrier.toLowerCase() === String(f.priorCarrier).trim().toLowerCase() && h.periodFrom === f.periodFrom && h.periodTo === f.periodTo && (h.lob || "") === (f.lob || sub.lobKey || ""))) return { ok: false, error: "duplicate" };
  const h = { id: "LH-" + (lhList(sub).length + 1), priorCarrier: String(f.priorCarrier).trim(), lob: f.lob || sub.lobKey || "", periodFrom: f.periodFrom, periodTo: f.periodTo, valuationDate: f.valuationDate, sourceDocument: String(f.sourceDocument || "").trim(),
    earnedPremium: f.earnedPremium === "" || f.earnedPremium === undefined || f.earnedPremium === null ? null : Number(f.earnedPremium), currency: f.currency || "USD", claims: [], status: "open", recordedBy: rdActor(), recordedAt: nowStamp() };
  lhList(sub).push(h); lhCalc(sub); rdSave();
  return { ok: true, history: h };
}
/** c: { claimNo, lossDate, cause, status, paid, reserve, description } */
function lhAddClaim(sub, id, c) {
  if (!rdEdit()) return { ok: false, error: "permission" };
  const h = lhFind(sub, id);
  if (!h) return { ok: false, error: "history" };
  const e = [];
  if (String(c.claimNo || "").trim().length < 2) e.push("enter the claim number");
  if (!RD_ISO.test(c.lossDate || "") || c.lossDate < h.periodFrom || c.lossDate > h.periodTo) e.push("the loss date must fall inside the period");
  if (!LH_STATUSES[c.status]) e.push("say whether the claim is open or closed");
  if (!(Number(c.paid) >= 0)) e.push("paid is a number from 0");
  const reserve = c.status === "closed" ? 0 : Number(c.reserve);
  if (c.status === "open" && !(reserve >= 0)) e.push("the reserve is a number from 0");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  if (h.claims.some(x => x.claimNo === String(c.claimNo).trim())) return { ok: false, error: "duplicate" };
  const paid = Number(c.paid), cl = { claimNo: String(c.claimNo).trim(), lossDate: c.lossDate, cause: String(c.cause || "").trim(), status: c.status, paid: paid, reserve: reserve, incurred: paid + reserve, large: paid + reserve >= rdLarge(), description: String(c.description || "").trim() };
  h.claims.push(cl); lhCalc(sub); rdSave();
  return { ok: true, claim: cl };
}
/** The metrics for the case, with the calculation version and date. */
function lhCalc(sub) {
  const hs = lhList(sub), per = hs.map(h => {
    const inc = h.claims.reduce((s, c) => s + c.incurred, 0), paid = h.claims.reduce((s, c) => s + c.paid, 0), res = h.claims.reduce((s, c) => s + c.reserve, 0);
    const months = Math.max(1, Math.round((Date.parse(h.periodTo + "T00:00:00Z") - Date.parse(h.periodFrom + "T00:00:00Z")) / (30.4375 * 86400000))), years = months / 12;   // a policy year is twelve months, leap year or not
    return { historyId: h.id, label: h.periodFrom + " to " + h.periodTo, priorCarrier: h.priorCarrier, from: h.periodFrom, claims: h.claims.length, open: h.claims.filter(c => c.status === "open").length, paid: paid, reserve: res, incurred: inc, large: h.claims.filter(c => c.large).length,
      earnedPremium: h.earnedPremium, lossRatio: h.earnedPremium ? Math.round(inc / h.earnedPremium * 10000) / 10000 : null, severity: h.claims.length ? Math.round(inc / h.claims.length) : null, frequency: Math.round(h.claims.length / years * 100) / 100 };
  });
  const tot = per.reduce((a, p) => ({ claims: a.claims + p.claims, open: a.open + p.open, incurred: a.incurred + p.incurred, large: a.large + p.large, premium: a.premium + (p.earnedPremium || 0), withPremium: a.withPremium + (p.earnedPremium ? p.incurred : 0) }), { claims: 0, open: 0, incurred: 0, large: 0, premium: 0, withPremium: 0 });
  const sorted = per.slice().sort((a, b) => a.from.localeCompare(b.from));
  let trend = "not enough periods to tell";
  if (sorted.length >= 2) { const a = sorted[sorted.length - 2].frequency, b = sorted[sorted.length - 1].frequency; trend = b > a ? "rising" : b < a ? "falling" : "flat"; }
  const m = { calculationVersion: LM_VERSION, calculatedAt: nowStamp(), periods: per, claims: tot.claims, open: tot.open, incurred: tot.incurred, large: tot.large, severity: tot.claims ? Math.round(tot.incurred / tot.claims) : null,
    lossRatio: tot.premium ? Math.round(tot.withPremium / tot.premium * 10000) / 10000 : null, frequency: per.length ? Math.round(per.reduce((s, p) => s + p.frequency, 0) / per.length * 100) / 100 : null, trend: trend };
  sub.lossMetrics = m;
  return m;
}

// ----------------------------------------------------------------------------
// 2. SCORES PER OBJECT
// ----------------------------------------------------------------------------
function osList(sub) { if (!sub.objectScores) sub.objectScores = []; return sub.objectScores; }
function osObject(sub, type, ref) {
  const r = String(ref || "").trim().toLowerCase(); if (!r) return null;
  if (type === "policy") return r === String(sub.id).toLowerCase() ? { key: sub.id } : null;
  const list = type === "vehicle" ? sub.vehicles : type === "driver" ? sub.drivers : type === "location" ? sub.locations : null;
  const hit = (list || []).find((o, i) => [o.lineageKey, o.vin, o.VIN, o.licenseNumber, o.id, "#" + (i + 1)].some(k => k !== undefined && k !== null && String(k).toLowerCase() === r));
  return hit ? { key: ref } : null;
}
/** f: { objectType, objectRef, scoreType, score, source, modelVersion, enrichmentResponseId, note } */
function osRecord(sub, f) {
  if (!rdEdit()) return { ok: false, error: "permission" };
  const e = [];
  if (!OS_TYPES[f.objectType]) e.push("choose what is scored");
  else if (!osObject(sub, f.objectType, f.objectRef)) e.push("that " + OS_TYPES[f.objectType].toLowerCase() + " is not on the case (name it by its key, VIN, licence number, or #position)");
  if (String(f.scoreType || "").trim().length < 2) e.push("name the kind of score");
  if (!(f.score !== "" && f.score !== null && f.score !== undefined && Number(f.score) >= 0 && Number(f.score) <= 100)) e.push("the score is from 0 to 100");
  if (!OS_SOURCES[f.source]) e.push("choose where the score came from");
  if (["provider", "model"].indexOf(f.source) > -1 && String(f.modelVersion || "").trim().length < 1) e.push("a " + f.source + " score needs its version");
  if (f.source === "provider") { if (!f.enrichmentResponseId) e.push("a provider score needs the provider response it came from"); else if (!(sub.enrichmentResponses || []).some(r => r.id === f.enrichmentResponseId)) e.push("that provider response is not recorded on the case"); }
  if (e.length) return { ok: false, error: "invalid", errors: e };
  const prev = osLatest(sub, f.objectRef, f.scoreType);
  const s = { id: "OS-" + (osList(sub).length + 1), objectType: f.objectType, objectRef: String(f.objectRef).trim(), scoreType: String(f.scoreType).trim(), score: Number(f.score), source: f.source, modelVersion: String(f.modelVersion || "").trim(), enrichmentResponseId: f.enrichmentResponseId || null, note: String(f.note || "").trim(), scoredAt: nowStamp(), scoredBy: rdActor(), supersedes: prev ? prev.id : null };
  osList(sub).push(s); rdSave();
  return { ok: true, score: s };
}
function osLatest(sub, objectRef, scoreType) { return [].concat(osList(sub)).reverse().find(s => String(s.objectRef).toLowerCase() === String(objectRef).toLowerCase() && s.scoreType.toLowerCase() === String(scoreType).toLowerCase()) || null; }
/** The latest score of each kind for each object, highest first. */
function osCurrent(sub) {
  const seen = {}, out = [];
  [].concat(osList(sub)).reverse().forEach(s => { const k = (s.objectType + "|" + s.objectRef + "|" + s.scoreType).toLowerCase(); if (!seen[k]) { seen[k] = true; out.push(s); } });
  return out.sort((a, b) => b.score - a.score);
}

// ----------------------------------------------------------------------------
// 3. THIRD-PARTY RECORDS
// ----------------------------------------------------------------------------
function erList(sub) { if (!sub.externalRecords) sub.externalRecords = []; return sub.externalRecords; }
/** Checks attributes against the record type's schema. Returns { ok, attrs, errors }. */
function erCheckAttrs(type, a) {
  const spec = (ER_TYPES[type] || {}).fields || {}, errors = [], attrs = {};
  Object.keys(a || {}).forEach(k => { if (!spec[k]) errors.push(k + " is not an attribute of a " + type); });
  Object.keys(spec).forEach(k => {
    const v = (a || {})[k]; if (v === undefined || v === "") return;
    const [kind, lo, hi] = spec[k].split(":");
    if (kind === "int") { const n = Number(v); if (!Number.isInteger(n) || (lo !== undefined && n < Number(lo)) || (hi !== undefined && n > Number(hi))) errors.push(k + " is a whole number" + (lo !== undefined ? " from " + lo : "") + (hi !== undefined ? " to " + hi : "")); else attrs[k] = n; }
    else if (kind === "bool") { if (v === true || v === "true" || v === "yes") attrs[k] = true; else if (v === false || v === "false" || v === "no") attrs[k] = false; else errors.push(k + " is yes or no"); }
    else if (kind === "state") { if (US_STATE_CODES_FOR_PRODUCER.indexOf(String(v).toUpperCase()) < 0) errors.push(k + " is a two-letter state"); else attrs[k] = String(v).toUpperCase(); }
    else if (kind === "date") { if (!RD_ISO.test(String(v))) errors.push(k + " is a date"); else attrs[k] = String(v); }
    else attrs[k] = String(v);
  });
  return { ok: !errors.length, attrs: attrs, errors: errors };
}
/** Reads "key=value; key=value" into an object. */
function erParse(text) { const o = {}; String(text || "").split(/[;\n]/).forEach(p => { const i = p.indexOf("="); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }); return o; }
/** f: { recordType, source, providerKey, recordDate, objectType, objectRef, severity, attributes, responseId } */
function erAdd(sub, f) {
  if (!rdEdit()) return { ok: false, error: "permission" };
  const e = [];
  if (!ER_TYPES[f.recordType]) e.push("choose the type of record");
  if (ER_SOURCES.indexOf(f.source) < 0) e.push("choose the source");
  if (String(f.providerKey || "").trim().length < 2) e.push("enter the source's own key for the record");
  if (!RD_ISO.test(f.recordDate || "") || f.recordDate > todayIso()) e.push("enter the record's date (not in the future)");
  if (ER_SEVERITIES.indexOf(f.severity) < 0) e.push("choose a severity");
  if (f.objectType && f.objectType !== "party" && !osObject(sub, f.objectType, f.objectRef)) e.push("the vehicle, driver or location it concerns is not on the case");
  if (f.responseId && !(sub.enrichmentResponses || []).some(r => r.id === f.responseId)) e.push("that provider response is not recorded on the case");
  const ca = ER_TYPES[f.recordType] ? erCheckAttrs(f.recordType, f.attributes) : { errors: [], attrs: {} };
  ca.errors.forEach(x => e.push(x));
  if (e.length) return { ok: false, error: "invalid", errors: e };
  const key = String(f.providerKey).trim();
  if (erList(sub).some(r => r.status === "active" && r.source === f.source && r.recordType === f.recordType && r.providerKey === key)) return { ok: false, error: "duplicate" };
  const r = { id: "ER-" + (erList(sub).length + 1), recordType: f.recordType, source: f.source, providerKey: key, recordDate: f.recordDate, objectType: f.objectType || null, objectRef: f.objectRef || null, severity: f.severity, attributes: ca.attrs, responseId: f.responseId || null, status: "active", recordedBy: rdActor(), recordedAt: nowStamp(), supersedes: null };
  erList(sub).push(r); rdSave();
  return { ok: true, record: r };
}
/** A correction: the earlier row is kept as superseded and a new row takes its place. */
function erSupersede(sub, id, f, reason) {
  if (!rdEdit()) return { ok: false, error: "permission" };
  const old = erList(sub).find(r => r.id === id && r.status === "active");
  if (!old) return { ok: false, error: "state" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  old.status = "superseded";
  const r = erAdd(sub, Object.assign({ recordType: old.recordType, source: old.source, providerKey: old.providerKey, recordDate: old.recordDate, objectType: old.objectType, objectRef: old.objectRef, severity: old.severity, attributes: old.attributes, responseId: old.responseId }, f));
  if (!r.ok) { old.status = "active"; return r; }
  r.record.supersedes = old.id; old.supersededBy = r.record.id; old.supersededReason = String(reason).trim();
  rdSave();
  return r;
}
function erSummary(sub, day) {
  const d = day || todayIso(), act = erList(sub).filter(r => r.status === "active"), cut = new Date(Date.parse(d + "T00:00:00Z") - 730 * 86400000).toISOString().slice(0, 10);
  const insp = act.filter(r => r.recordType === "inspection"), oos = insp.filter(r => r.attributes.out_of_service === true);
  const points = {}; act.filter(r => r.recordType === "violation").forEach(r => { const k = r.objectRef || "unassigned"; points[k] = (points[k] || 0) + (r.attributes.points || 0); });
  return { inspections: insp.length, outOfService: oos.length, oosRate: insp.length ? Math.round(oos.length / insp.length * 1000) / 1000 : null, crashes24m: act.filter(r => r.recordType === "crash" && r.recordDate >= cut).length, fatalCrashes: act.filter(r => r.recordType === "crash" && (r.attributes.fatalities || 0) > 0).length, violationPoints: points, recalls: act.filter(r => r.recordType === "recall").length, high: act.filter(r => r.severity === "high").length };
}

// ----------------------------------------------------------------------------
// 4. SCREENS
// ----------------------------------------------------------------------------
function lhCaseHtml(sub) {
  const hs = lhList(sub), m = hs.length ? lhCalc(sub) : null, edit = hasPermission("submissionData", "edit");
  const pct = v => v === null ? "—" : Math.round(v * 1000) / 10 + "%", money = v => v === null ? "—" : "$" + Math.round(v).toLocaleString("en-US");
  const rows = m ? m.periods.map(p => `<tr><td>${escHtml(p.historyId)}</td><td>${escHtml(p.priorCarrier)}<div class="p1-note">${escHtml(p.label)}</div></td><td>${p.claims} (${p.open} open, ${p.large} large)</td><td>${money(p.paid)} / ${money(p.reserve)} / ${money(p.incurred)}</td><td>${money(p.earnedPremium)}</td><td>${pct(p.lossRatio)}</td><td>${money(p.severity)}</td><td>${p.frequency}</td></tr>`).join("") : "";
  const form = edit ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="lh_car">Prior carrier</label><input class="form-control" id="lh_car"></div><div class="form-group"><label for="lh_from">Period from</label><input type="date" class="form-control" id="lh_from"></div><div class="form-group"><label for="lh_to">Period to</label><input type="date" class="form-control" id="lh_to"></div><div class="form-group"><label for="lh_val">Valued on</label><input type="date" class="form-control" id="lh_val"></div><div class="form-group"><label for="lh_prem">Earned premium</label><input class="form-control" id="lh_prem"></div><div class="form-group"><label for="lh_doc">Source document</label><input class="form-control" id="lh_doc"></div></div><button class="btn btn-xs btn-outline" onclick="lhAddUi()">Add a period</button>
    ${hs.length ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="lc_h">Period</label><select class="form-control" id="lc_h">${hs.map(h => `<option value="${h.id}">${escHtml(h.id)} ${escHtml(h.priorCarrier)} ${escHtml(h.periodFrom)}</option>`).join("")}</select></div><div class="form-group"><label for="lc_no">Claim number</label><input class="form-control" id="lc_no"></div><div class="form-group"><label for="lc_dt">Loss date</label><input type="date" class="form-control" id="lc_dt"></div><div class="form-group"><label for="lc_st">Status</label><select class="form-control" id="lc_st"><option value="closed">Closed</option><option value="open">Open</option></select></div><div class="form-group"><label for="lc_paid">Paid</label><input class="form-control" id="lc_paid"></div><div class="form-group"><label for="lc_res">Reserve</label><input class="form-control" id="lc_res"></div><div class="form-group"><label for="lc_cause">Cause</label><input class="form-control" id="lc_cause"></div></div><button class="btn btn-xs btn-outline" onclick="lhClaimUi()">Add a claim</button>` : ""}` : "";
  return (m ? `<div class="p1-note">Calculated ${escHtml(m.calculatedAt)} (version ${escHtml(m.calculationVersion)}): ${m.claims} claim(s), ${m.open} open, ${m.large} large; incurred ${money(m.incurred)}; severity ${money(m.severity)}; loss ratio ${pct(m.lossRatio)}; frequency ${m.frequency === null ? "—" : m.frequency + " a year"}, ${escHtml(m.trend)}.</div><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Period</th><th>Prior carrier</th><th>Claims</th><th>Paid / reserve / incurred</th><th>Earned premium</th><th>Loss ratio</th><th>Severity</th><th>Frequency</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="mw-empty">No structured loss history is recorded.</div>') + form;
}
function lhAddUi() { const s = typeof cfSub === "function" ? cfSub() : null; if (!s) return; const r = lhAdd(s, { priorCarrier: ucV("lh_car"), periodFrom: ucV("lh_from"), periodTo: ucV("lh_to"), valuationDate: ucV("lh_val"), earnedPremium: ucV("lh_prem"), sourceDocument: ucV("lh_doc") }); rdToast(r, "Period added."); }
function lhClaimUi() { const s = typeof cfSub === "function" ? cfSub() : null; if (!s) return; const r = lhAddClaim(s, ucV("lc_h"), { claimNo: ucV("lc_no"), lossDate: ucV("lc_dt"), status: ucV("lc_st"), paid: ucV("lc_paid"), reserve: ucV("lc_res"), cause: ucV("lc_cause") }); rdToast(r, "Claim added."); }
function rdToast(r, ok) { showToast(r.ok ? "✅ " + ok : "⛔ " + (r.errors ? r.errors.join("; ") : ({ duplicate: "That is already recorded.", permission: "You do not have the right to do this.", state: "That cannot be done in its present state.", reason: "Give a reason of at least 10 characters." }[r.error] || r.error)), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function osCaseHtml(sub) {
  const cur = osCurrent(sub), edit = hasPermission("submissionData", "edit");
  const form = edit ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="os_t">Object</label><select class="form-control" id="os_t">${Object.keys(OS_TYPES).map(k => `<option value="${k}">${OS_TYPES[k]}</option>`).join("")}</select></div><div class="form-group"><label for="os_r">Key, VIN, licence or #position</label><input class="form-control" id="os_r"></div><div class="form-group"><label for="os_k">Kind of score</label><input class="form-control" id="os_k"></div><div class="form-group"><label for="os_s">Score (0 to 100)</label><input class="form-control" id="os_s"></div><div class="form-group"><label for="os_src">Source</label><select class="form-control" id="os_src">${Object.keys(OS_SOURCES).map(k => `<option value="${k}">${OS_SOURCES[k]}</option>`).join("")}</select></div><div class="form-group"><label for="os_v">Version</label><input class="form-control" id="os_v"></div><div class="form-group"><label for="os_p">Provider response id</label><input class="form-control" id="os_p"></div></div><button class="btn btn-xs btn-outline" onclick="osRecordUi()">Record the score</button>` : "";
  return (cur.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Object</th><th>Score</th><th>Value</th><th>Source</th><th>When</th></tr></thead><tbody>${cur.map(s => `<tr><td>${escHtml(OS_TYPES[s.objectType])} ${escHtml(s.objectRef)}</td><td>${escHtml(s.scoreType)}</td><td><strong>${s.score}</strong>${s.supersedes ? '<div class="p1-note">replaces ' + escHtml(s.supersedes) + "</div>" : ""}</td><td>${escHtml(OS_SOURCES[s.source])}${s.modelVersion ? " v" + escHtml(s.modelVersion) : ""}${s.enrichmentResponseId ? '<div class="p1-note">response ' + escHtml(s.enrichmentResponseId) + "</div>" : ""}</td><td>${escHtml(s.scoredAt)}<div class="p1-note">${escHtml(s.scoredBy)}</div></td></tr>`).join("")}</tbody></table></div>` : '<div class="mw-empty">No score is recorded for a vehicle, driver or location.</div>') + form;
}
function osRecordUi() { const s = typeof cfSub === "function" ? cfSub() : null; if (!s) return; rdToast(osRecord(s, { objectType: ucV("os_t"), objectRef: ucV("os_r"), scoreType: ucV("os_k"), score: ucV("os_s"), source: ucV("os_src"), modelVersion: ucV("os_v"), enrichmentResponseId: ucV("os_p") }), "Score recorded."); }
function erCaseHtml(sub) {
  const act = erList(sub), sm = erSummary(sub), edit = hasPermission("submissionData", "edit");
  const form = edit ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="er_t">Record</label><select class="form-control" id="er_t">${Object.keys(ER_TYPES).map(k => `<option value="${k}">${ER_TYPES[k].label}</option>`).join("")}</select></div><div class="form-group"><label for="er_s">Source</label><select class="form-control" id="er_s">${ER_SOURCES.map(x => `<option>${x}</option>`).join("")}</select></div><div class="form-group"><label for="er_k">Source's key</label><input class="form-control" id="er_k"></div><div class="form-group"><label for="er_d">Date</label><input type="date" class="form-control" id="er_d"></div><div class="form-group"><label for="er_v">Severity</label><select class="form-control" id="er_v">${ER_SEVERITIES.map(x => `<option>${x}</option>`).join("")}</select></div><div class="form-group"><label for="er_o">Concerns (vehicle or driver key)</label><input class="form-control" id="er_o"></div><div class="form-group mw-wide"><label for="er_a">Attributes (key=value; key=value)</label><input class="form-control" id="er_a" placeholder="out_of_service=yes; level=2"></div></div><button class="btn btn-xs btn-outline" onclick="erAddUi()">Add the record</button>` : "";
  return `<div class="p1-note">${sm.inspections} inspection(s), ${sm.outOfService} out of service${sm.oosRate === null ? "" : " (" + Math.round(sm.oosRate * 1000) / 10 + "%)"}; ${sm.crashes24m} crash(es) in 24 months, ${sm.fatalCrashes} fatal; ${sm.recalls} recall(s); ${sm.high} high severity.</div>` + (act.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Record</th><th>Type</th><th>Source and key</th><th>Date</th><th>Concerns</th><th>Attributes</th><th>Status</th></tr></thead><tbody>${act.slice().reverse().map(r => `<tr><td>${escHtml(r.id)}</td><td>${escHtml(ER_TYPES[r.recordType].label)}<div class="p1-note">${escHtml(r.severity)}</div></td><td>${escHtml(r.source)}<div class="p1-note">${escHtml(r.providerKey)}</div></td><td>${escHtml(r.recordDate)}</td><td>${escHtml(r.objectRef || "—")}</td><td class="p1-note">${escHtml(JSON.stringify(r.attributes))}</td><td>${escHtml(r.status)}${r.supersedes ? '<div class="p1-note">replaces ' + escHtml(r.supersedes) + "</div>" : ""}${r.status === "active" && edit ? ` <button class="btn btn-xs btn-outline" onclick="erCorrectUi('${r.id}')">Correct</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<div class="mw-empty">No third-party record is recorded. No source is connected; rows are entered from what was obtained.</div>') + form;
}
function erCorrectUi(id) { const s = typeof cfSub === "function" ? cfSub() : null; if (!s) return; const a = window.prompt("The corrected attributes (key=value; key=value)", ""); if (a === null) return; const why = window.prompt("Why is it corrected? (at least 10 characters)", ""); if (why === null) return; rdToast(erSupersede(s, id, { attributes: erParse(a) }, why), "Corrected: the earlier row is kept as superseded."); }
function erAddUi() { const s = typeof cfSub === "function" ? cfSub() : null; if (!s) return; const o = ucV("er_o"); rdToast(erAdd(s, { recordType: ucV("er_t"), source: ucV("er_s"), providerKey: ucV("er_k"), recordDate: ucV("er_d"), severity: ucV("er_v"), objectType: o ? (osObject(s, "vehicle", o) ? "vehicle" : "driver") : null, objectRef: o, attributes: erParse(ucV("er_a")) }), "Record added."); }

if (typeof urRegisterSection === "function") { urRegisterSection("losses", "Structured loss history", lhCaseHtml); urRegisterSection("objectscores", "Scores by vehicle, driver and location", osCaseHtml); urRegisterSection("external", "Third-party records", erCaseHtml); }
