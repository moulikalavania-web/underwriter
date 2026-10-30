/**
 * ============================================================================
 * RATING DETAIL AS RECEIVED: WHAT THE RATING ENGINE SENT BACK, KEPT AS TABLES
 * ----------------------------------------------------------------------------
 * The rating engine is outside this system. It is sent a JSON request and returns a JSON answer. Nothing is calculated, rated or
 * re-rated here. The premium it returned is already stored with the quote. When the answer also explains itself, that explanation is
 * kept, as sent, in tables a person can read later:
 *
 *   RATE TABLES        each table the engine used: code, name, version, its dimensions (what a row is matched on) and its rows
 *                      (the condition on each dimension, and the value).
 *   ALGORITHM STEPS    the steps in the order the engine took them: number, code, name, operation, value in and value out.
 *   FACTOR RESULTS     each factor it applied: the factor, its category, the step, the rate table and row it came from, the value, and the
 *                      premium before and after.
 *   SCHEDULE RATING    each schedule-rating category (for example management, safety programme, fleet condition): the modifier it applied, the
 *                      range allowed, and the reason.
 *   EXPERIENCE MOD     the experience modification: category, value, source, period.
 *
 * Every import that carries this detail is a new record; earlier ones stay. A record is fingerprinted so it can be shown unaltered. The
 * detail is read from "ratingDetail" in the engine's JSON (or the same keys at the top level). That shape is an agreement with the
 * engine's owner and is a placeholder until they confirm it.
 *
 * Reading it flags what does not hang together as sent (a factor naming a step or rate table that is not in the answer, a row condition on a
 * dimension the table does not declare, a schedule modifier outside its range). A flag is information for a person; nothing is rejected or
 * corrected, because the engine's answer is what it is.
 * ============================================================================
 */

var RSTORE_SECTIONS = ["rateTables", "algorithmSteps", "factorResults", "scheduleRating", "experienceMod"];

function rstEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function rstNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function rstActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function rstSave() { if (typeof persistAppState === "function") persistAppState(); }
function rstClone(o) { return JSON.parse(JSON.stringify(o)); }
function rstStable(v) {
  if (Array.isArray(v)) return "[" + v.map(rstStable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + rstStable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
function rstHash(v) { const s = rstStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) + ":" + s.length; }
function rstNum(v) { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/[$,%\s,]/g, "")); return isNaN(n) ? null : n; }
function rstStr(v) { return v === null || v === undefined ? null : String(v).trim() || null; }
function rstList(sub) { return (sub && sub.ratingRecords) || []; }
function rstCurrent(sub) { const l = rstList(sub); return l.length ? l[l.length - 1] : null; }

/** What the engine sent, in one shape, with its own words kept. Returns { detail, found }; found is false when it sent none of the sections. */
function rstExtract(payload) {
  const src = payload && typeof payload === "object" ? (payload.ratingDetail && typeof payload.ratingDetail === "object" ? payload.ratingDetail : payload) : {};
  const arr = k => Array.isArray(src[k]) ? src[k] : [];
  const tables = arr("rateTables").map(t => ({
    tableCode: rstStr(t.tableCode), name: rstStr(t.name), version: rstStr(t.version), effectiveDate: rstStr(t.effectiveDate),
    dimensions: (Array.isArray(t.dimensions) ? t.dimensions : []).map(d => ({ code: rstStr(d.code), name: rstStr(d.name), dataType: rstStr(d.dataType) })),
    rows: (Array.isArray(t.rows) ? t.rows : []).map((r, i) => ({ rowNo: r.rowNo !== undefined ? r.rowNo : i + 1, conditions: r.conditions && typeof r.conditions === "object" ? rstClone(r.conditions) : {}, value: r.value === undefined ? null : r.value }))
  }));
  const steps = arr("algorithmSteps").map(s => ({ stepNo: rstNum(s.stepNo), code: rstStr(s.code), name: rstStr(s.name), operation: rstStr(s.operation), inputValue: s.inputValue === undefined ? null : s.inputValue, outputValue: s.outputValue === undefined ? null : s.outputValue }));
  const factors = arr("factorResults").map(f => ({ factorCode: rstStr(f.factorCode), name: rstStr(f.name), category: rstStr(f.category), coverage: rstStr(f.coverage), stepNo: rstNum(f.stepNo), rateTableCode: rstStr(f.rateTableCode), matchedRow: rstNum(f.matchedRow), value: f.value === undefined ? null : f.value, premiumBefore: rstNum(f.premiumBefore), premiumAfter: rstNum(f.premiumAfter) }));
  const sched = arr("scheduleRating").map(s => ({ category: rstStr(s.category), label: rstStr(s.label), modifierPct: rstNum(s.modifierPct), minPct: rstNum(s.minPct), maxPct: rstNum(s.maxPct), reason: rstStr(s.reason) }));
  const em = src.experienceMod && typeof src.experienceMod === "object" ? { category: rstStr(src.experienceMod.category), value: rstNum(src.experienceMod.value), source: rstStr(src.experienceMod.source), periodFrom: rstStr(src.experienceMod.periodFrom), periodTo: rstStr(src.experienceMod.periodTo), reason: rstStr(src.experienceMod.reason) } : null;
  const engine = { name: rstStr(src.engineName), version: rstStr(src.engineVersion), requestId: rstStr(src.requestId), ratedAt: rstStr(src.ratedAt), productReleaseId: rstStr(src.productReleaseId) };
  const found = tables.length + steps.length + factors.length + sched.length > 0 || !!em;
  return { detail: { engine: engine, rateTables: tables, algorithmSteps: steps, factorResults: factors, scheduleRating: sched, experienceMod: em }, found: found };
}

/** What does not hang together as sent. [{ section, message }]. Information only. */
function rstIssues(d) {
  const out = [], push = (section, message) => out.push({ section: section, message: message });
  const tableCodes = d.rateTables.map(t => t.tableCode), stepNos = d.algorithmSteps.map(s => s.stepNo);
  const dups = (list, label, section) => { const seen = {}; list.forEach(x => { if (x === null) return; if (seen[x]) push(section, label + " " + x + " appears more than once."); seen[x] = true; }); };
  dups(tableCodes, "Rate table", "rateTables"); dups(stepNos, "Step", "algorithmSteps");
  d.rateTables.forEach(t => {
    if (!t.tableCode) push("rateTables", "A rate table has no code.");
    const dims = t.dimensions.map(x => x.code);
    t.rows.forEach(r => Object.keys(r.conditions).forEach(k => { if (dims.indexOf(k) < 0) push("rateTables", (t.tableCode || "?") + " row " + r.rowNo + " has a condition on \"" + k + "\", which the table does not declare as a dimension."); }));
    if (t.rows.length && !t.dimensions.length) push("rateTables", (t.tableCode || "?") + " has rows but declares no dimensions.");
  });
  d.algorithmSteps.forEach(s => { if (s.stepNo === null) push("algorithmSteps", "A step has no number (" + (s.name || s.code || "unnamed") + ")."); });
  d.factorResults.forEach(f => {
    const w = f.factorCode || f.name || "a factor";
    if (f.stepNo !== null && d.algorithmSteps.length && stepNos.indexOf(f.stepNo) < 0) push("factorResults", w + " names step " + f.stepNo + ", which is not in the steps sent.");
    if (f.rateTableCode && d.rateTables.length && tableCodes.indexOf(f.rateTableCode) < 0) push("factorResults", w + " names rate table " + f.rateTableCode + ", which is not in the tables sent.");
    if (f.rateTableCode && f.matchedRow !== null) { const t = d.rateTables.find(x => x.tableCode === f.rateTableCode); if (t && !t.rows.some(r => Number(r.rowNo) === f.matchedRow)) push("factorResults", w + " names row " + f.matchedRow + " of " + f.rateTableCode + ", which that table does not have."); }
  });
  d.scheduleRating.forEach(s => {
    const w = s.label || s.category || "a category";
    if (s.modifierPct === null) push("scheduleRating", w + " has no modifier.");
    else if ((s.minPct !== null && s.modifierPct < s.minPct) || (s.maxPct !== null && s.modifierPct > s.maxPct)) push("scheduleRating", w + " modifier " + s.modifierPct + "% is outside its range " + (s.minPct === null ? "" : s.minPct + "%") + " to " + (s.maxPct === null ? "" : s.maxPct + "%") + ".");
  });
  if (d.experienceMod && d.experienceMod.value === null) push("experienceMod", "The experience modification has no value.");
  return out;
}

/** Keeps what the engine sent about itself, as a new record. Returns the record, or null when it sent no detail. */
function rstCapture(sub, payload, opts) {
  if (!sub) return null;
  opts = opts || {};
  const x = rstExtract(payload);
  if (!x.found) return null;
  if (!sub.ratingRecords) sub.ratingRecords = [];
  const hash = rstHash(x.detail), cur = rstCurrent(sub);
  if (cur && cur.fingerprint === hash && cur.quoteVersionId === (opts.quoteVersionId || cur.quoteVersionId)) return cur;
  const qe = (typeof QUOTE_VERSIONS_DATASET !== "undefined" ? QUOTE_VERSIONS_DATASET : []).find(e => e.subId === sub.id), lastQ = qe && qe.quotes.length ? qe.quotes[qe.quotes.length - 1] : null;
  const issues = rstIssues(x.detail);
  const rec = { id: "RR-" + (sub.ratingRecords.length + 1), receivedAt: rstNow(), receivedBy: rstActor(), source: opts.source || "JSON import", quoteVersionId: opts.quoteVersionId || (lastQ ? lastQ.versionId : null), fingerprint: hash, detail: x.detail, issues: issues, counts: { rateTables: x.detail.rateTables.length, algorithmSteps: x.detail.algorithmSteps.length, factorResults: x.detail.factorResults.length, scheduleRating: x.detail.scheduleRating.length, experienceMod: x.detail.experienceMod ? 1 : 0 } };
  if (cur) cur.supersededBy = rec.id;
  sub.ratingRecords.push(rec);
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || RATING_STEP, decision: "rating_detail_stored", by: rec.receivedBy, at: rec.receivedAt, notes: rec.id + " stored as sent by " + (x.detail.engine.name || "the rating engine") + (x.detail.engine.version ? " " + x.detail.engine.version : "") + ": " + rec.counts.rateTables + " rate table(s), " + rec.counts.algorithmSteps + " step(s), " + rec.counts.factorResults + " factor result(s), " + rec.counts.scheduleRating + " schedule category(ies)" + (rec.counts.experienceMod ? ", an experience mod" : "") + ". Not recalculated here." + (issues.length ? " " + issues.length + " thing(s) in it do not hang together." : "") });
  rstSave();
  return rec;
}

/** True while the stored detail is exactly what was received. */
function rstVerify(rec) { return !!rec && rstHash(rec.detail) === rec.fingerprint; }

/** The rows of a rate table that a given set of values would fall on, as a reading aid. Values are compared to each row's conditions as stored; nothing is rated. */
function rstConditionText(c) {
  return Object.keys(c).map(k => { const v = c[k]; if (v && typeof v === "object" && !Array.isArray(v)) return k + " " + (v.from !== undefined && v.from !== null ? v.from : "") + " to " + (v.to !== undefined && v.to !== null ? v.to : ""); if (Array.isArray(v)) return k + " in " + v.join("/"); return k + " = " + v; }).join(" and ") || "any";
}

// ----------------------------------------------------------------------------
// HOOK: THE ENGINE'S ANSWER IS KEPT WHEN IT IS IMPORTED
// ----------------------------------------------------------------------------
var _rstOrigApply = window.applyImportedRatingDataToSubmission;
if (typeof _rstOrigApply === "function") window.applyImportedRatingDataToSubmission = function (parsed, sub) {
  const r = _rstOrigApply.apply(this, arguments);
  try { if (sub) { rstCapture(sub, parsed); rstRender(sub); } } catch (e) { console.warn("Rating detail not stored:", e); }
  return r;
};

// ----------------------------------------------------------------------------
// SCREEN
// ----------------------------------------------------------------------------
var RST_UI = { section: "factorResults", record: null };
function rstUiSection(s) { RST_UI.section = s; const sub = SUBMISSIONS_DATASET.find(x => x.id === activeSubmissionId); rstRender(sub); }
function rstUiRecord(id) { RST_UI.record = id; const sub = SUBMISSIONS_DATASET.find(x => x.id === activeSubmissionId); rstRender(sub); }
function rstFmt(v) { return v === null || v === undefined ? "-" : typeof v === "number" ? v.toLocaleString("en-US") : typeof v === "object" ? JSON.stringify(v) : String(v); }
function rstMoney(v) { return v === null ? "-" : "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }); }

function rstRender(sub) {
  const box = document.getElementById("ratingStoreContainer"); if (!box) return;
  if (!sub || !(sub.isQuoteImported || sub.importedRatingData || rstList(sub).length)) { box.innerHTML = ""; return; }
  const list = rstList(sub);
  if (!list.length) { box.innerHTML = `<div class="card" style="margin-top:12px;"><div class="card-header"><h3><i class="ph ph-table"></i> Rating engine detail</h3><span class="badge badge-light">None received</span></div><div class="card-body"><p class="ws-small text-muted" style="margin:0;">The rating engine's answer carried only the premium. When it also sends its rate tables, steps, factor results, schedule rating or experience modification, they are stored here as sent.</p></div></div>`; return; }
  const rec = list.find(r => r.id === RST_UI.record) || list[list.length - 1], d = rec.detail, isCur = rec === list[list.length - 1];
  const tabs = [["rateTables", "Rate tables"], ["algorithmSteps", "Steps"], ["factorResults", "Factor results"], ["scheduleRating", "Schedule rating"], ["experienceMod", "Experience mod"]];
  const sec = tabs.some(t => t[0] === RST_UI.section) ? RST_UI.section : "factorResults";
  let body = "";
  if (sec === "rateTables") {
    body = d.rateTables.length ? d.rateTables.map(t => `<details style="margin-bottom:6px;"><summary class="ws-small"><strong>${rstEsc(t.tableCode)}</strong> ${rstEsc(t.name || "")} ${t.version ? "v" + rstEsc(t.version) : ""} <span class="text-muted">${t.dimensions.length} dimension(s), ${t.rows.length} row(s)</span></summary><div class="ws-small" style="margin:4px 0;">Dimensions: ${t.dimensions.map(x => rstEsc(x.code) + (x.name ? " (" + rstEsc(x.name) + ")" : "")).join(", ") || "-"}</div><table class="data-table"><thead><tr><th>Row</th><th>Condition</th><th>Value</th></tr></thead><tbody>${t.rows.map(r => `<tr><td>${rstEsc(r.rowNo)}</td><td class="ws-small">${rstEsc(rstConditionText(r.conditions))}</td><td>${rstEsc(rstFmt(r.value))}</td></tr>`).join("")}</tbody></table></details>`).join("") : '<p class="ws-small text-muted">The engine sent no rate tables.</p>';
  } else if (sec === "algorithmSteps") {
    body = d.algorithmSteps.length ? `<table class="data-table"><thead><tr><th>Step</th><th>Code</th><th>Name</th><th>Operation</th><th>In</th><th>Out</th></tr></thead><tbody>${d.algorithmSteps.slice().sort((a, b) => (a.stepNo || 0) - (b.stepNo || 0)).map(s => `<tr><td>${rstEsc(rstFmt(s.stepNo))}</td><td><code>${rstEsc(s.code || "-")}</code></td><td>${rstEsc(s.name || "-")}</td><td class="ws-small">${rstEsc(s.operation || "-")}</td><td>${rstEsc(rstFmt(s.inputValue))}</td><td>${rstEsc(rstFmt(s.outputValue))}</td></tr>`).join("")}</tbody></table>` : '<p class="ws-small text-muted">The engine sent no steps.</p>';
  } else if (sec === "factorResults") {
    body = d.factorResults.length ? `<table class="data-table"><thead><tr><th>Factor</th><th>Category</th><th>Coverage</th><th>Step</th><th>From</th><th>Value</th><th>Premium before</th><th>Premium after</th></tr></thead><tbody>${d.factorResults.map(f => `<tr><td><code>${rstEsc(f.factorCode || "-")}</code><div class="text-xs text-muted">${rstEsc(f.name || "")}</div></td><td class="ws-small">${rstEsc(f.category || "-")}</td><td class="ws-small">${rstEsc(f.coverage || "-")}</td><td>${rstEsc(rstFmt(f.stepNo))}</td><td class="ws-small">${f.rateTableCode ? rstEsc(f.rateTableCode) + (f.matchedRow !== null ? " row " + rstEsc(f.matchedRow) : "") : "-"}</td><td>${rstEsc(rstFmt(f.value))}</td><td>${rstMoney(f.premiumBefore)}</td><td>${rstMoney(f.premiumAfter)}</td></tr>`).join("")}</tbody></table>` : '<p class="ws-small text-muted">The engine sent no factor results.</p>';
  } else if (sec === "scheduleRating") {
    body = d.scheduleRating.length ? `<table class="data-table"><thead><tr><th>Category</th><th>Modifier</th><th>Range</th><th>Reason</th></tr></thead><tbody>${d.scheduleRating.map(s => `<tr><td><strong>${rstEsc(s.label || s.category || "-")}</strong>${s.label && s.category ? `<div class="text-xs text-muted">${rstEsc(s.category)}</div>` : ""}</td><td>${s.modifierPct === null ? "-" : (s.modifierPct > 0 ? "+" : "") + s.modifierPct + "%"}</td><td class="ws-small">${s.minPct === null && s.maxPct === null ? "-" : (s.minPct === null ? "" : s.minPct + "%") + " to " + (s.maxPct === null ? "" : s.maxPct + "%")}</td><td class="ws-small">${rstEsc(s.reason || "-")}</td></tr>`).join("")}</tbody></table>` : '<p class="ws-small text-muted">The engine sent no schedule rating.</p>';
  } else {
    const e = d.experienceMod;
    body = e ? `<table class="data-table"><tbody><tr><th>Category</th><td>${rstEsc(e.category || "-")}</td></tr><tr><th>Value</th><td>${e.value === null ? "-" : rstEsc(e.value)}</td></tr><tr><th>Source</th><td>${rstEsc(e.source || "-")}</td></tr><tr><th>Period</th><td>${rstEsc(e.periodFrom || "-")} to ${rstEsc(e.periodTo || "-")}</td></tr><tr><th>Reason</th><td>${rstEsc(e.reason || "-")}</td></tr></tbody></table>` : '<p class="ws-small text-muted">The engine sent no experience modification.</p>';
  }
  const tabBtns = tabs.map(t => `<button class="btn btn-xs ${sec === t[0] ? "btn-primary" : "btn-outline"}" style="width:auto;margin-right:4px;" onclick="rstUiSection('${t[0]}')">${t[1]}${t[0] === "experienceMod" ? (rec.counts.experienceMod ? " (1)" : " (0)") : " (" + rec.counts[t[0]] + ")"}</button>`).join("");
  const issues = rec.issues.length ? `<div class="alert alert-warning ws-small" style="margin:8px 0;"><strong>${rec.issues.length} thing(s) in what was sent do not hang together.</strong> Nothing was changed; the engine's answer is kept as it came.<ul style="margin:4px 0 0 18px;">${rec.issues.slice(0, 8).map(i => `<li>${rstEsc(i.message)}</li>`).join("")}</ul></div>` : "";
  const hist = list.length > 1 ? `<div class="ws-small" style="margin-top:8px;">Received so far: ${list.map(r => `<a href="#" onclick="rstUiRecord('${r.id}'); return false;" style="${r === rec ? "font-weight:700;" : ""}">${rstEsc(r.id)}</a> (${rstEsc(r.receivedAt)}${r.quoteVersionId ? ", " + rstEsc(r.quoteVersionId) : ""})`).join("; ")}</div>` : "";
  box.innerHTML = `<div class="card" style="margin-top:12px;"><div class="card-header"><h3><i class="ph ph-table"></i> Rating engine detail</h3><span class="badge ${isCur ? "badge-info" : "badge-light"}">${rstEsc(rec.id)}${isCur ? ", current" : ", superseded by " + rstEsc(rec.supersededBy)}</span></div><div class="card-body">
    <p class="ws-small text-muted" style="margin:0 0 6px;">Stored exactly as the rating engine sent it. Nothing here is calculated or checked against a rate; the engine's premium is the one on the quote.</p>
    <div class="ws-small" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px;"><span>Engine: <strong>${rstEsc(d.engine.name || "not stated")}${d.engine.version ? " " + rstEsc(d.engine.version) : ""}</strong></span>${d.engine.requestId ? `<span>Request: <code>${rstEsc(d.engine.requestId)}</code></span>` : ""}${d.engine.ratedAt ? `<span>Rated: ${rstEsc(d.engine.ratedAt)}</span>` : ""}${d.engine.productReleaseId ? `<span>Product release: <code>${rstEsc(d.engine.productReleaseId)}</code></span>` : ""}<span>Received ${rstEsc(rec.receivedAt)} by ${rstEsc(rec.receivedBy)} (${rstEsc(rec.source)})</span>${rec.quoteVersionId ? `<span>Quote: <code>${rstEsc(rec.quoteVersionId)}</code></span>` : ""}<span>${rstVerify(rec) ? '<span class="badge badge-success">Unaltered</span>' : '<span class="badge badge-danger">Altered</span>'} <code class="ws-small">${rstEsc(rec.fingerprint.split(":")[0])}</code></span></div>
    ${issues}<div style="margin:6px 0;">${tabBtns}</div>${body}${hist}</div></div>`;
}
registerStepRenderer("ratingStore", rstRender);

(function installRstAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  AUDIT_ACTION_META.rating_detail_stored = { label: "Rating Engine Detail Stored", icon: "ph-table", badge: "badge-info", outcome: "outcome-comm" };
})();

Object.assign(window, { rstExtract, rstIssues, rstCapture, rstVerify, rstList, rstCurrent, rstHash, rstConditionText, rstRender, rstUiSection, rstUiRecord });
