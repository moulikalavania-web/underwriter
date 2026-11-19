/**
 * ============================================================================
 * ACCUMULATION AND CAPACITY: HOW MUCH IS WRITTEN WHERE, AND WHAT THIS RISK ADDS
 * ----------------------------------------------------------------------------
 * The only concentration test was the carrier's aggregate limit by line (js/authority.js). An accumulation bucket (a register record) limits
 * what the book may hold in one place:
 *
 *   DIMENSION  state, county, zip, catastrophe zone, industry (NAICS code) or fleet size band (for example 11-25 power units).
 *   METRIC     what is added up: total insured value, liability limit, premium or power units.
 *   LIMIT      the amount the bucket may hold, a warning percentage, whether a breach warns or blocks, and the line and period it covers.
 *   EXPOSURE   what is already bound in the bucket, what this case would add (proposed), and what other open quoted cases would add
 *              (the pipeline). The test is the bound exposure plus this case. At the warning percentage it warns; over the limit it warns
 *              or blocks as the bucket says, and an approver who may override authority can waive a block for that case, with a reason.
 *   COUNTY AND CAT ZONE  are not on a submission, so the underwriter enters them on the case. Nothing is looked up.
 *   CAPACITY   what this case takes from the carrier's capacity on its line: the delegated authority's capacity, what is already bound,
 *              this case as proposed (or bound once it is), and what is left.
 * The register starts empty. Reinsurance is not modelled, so gross and net exposure are the same.
 * ============================================================================
 */

const AC_KEY = "FUT_UW_ACCUMULATION_V1";
const AC_DIMS = { state: "State", county: "County", zip: "Zip code", cat_zone: "Catastrophe zone", industry: "Industry (NAICS)", fleet_band: "Fleet size band" };
const AC_METRICS = { tiv: "Total insured value", liability_limit: "Liability limit", premium: "Premium", power_units: "Power units" };
var AC = { buckets: [], seq: 0 };
try { const r = JSON.parse(localStorage.getItem(AC_KEY)); if (r && Array.isArray(r.buckets)) AC = Object.assign(AC, r); } catch (e) { /* none yet */ }
function acSave() { try { localStorage.setItem(AC_KEY, JSON.stringify(AC)); } catch (e) { /* keep for this session */ } }

function acValidate(b) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(b.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (!AC_DIMS[b.dimension]) e.push("choose the dimension");
  if (String(b.value || "").trim().length < 1) e.push("name the value (a state, a zip, a zone, a NAICS code or a band like 11-25)");
  else if (b.dimension === "fleet_band" && !/^\d+-\d+$/.test(String(b.value).trim())) e.push("a fleet band is two numbers like 11-25");
  else if (b.dimension === "state" && US_STATE_CODES_FOR_PRODUCER.indexOf(String(b.value).toUpperCase()) < 0) e.push("a state is a two-letter code");
  if (!AC_METRICS[b.metric]) e.push("choose what is added up");
  if (!(Number(b.limitAmount) > 0)) e.push("the limit is a number above zero");
  if (!(Number(b.warningPct) > 0 && Number(b.warningPct) < 100)) e.push("the warning percentage is between 0 and 100");
  if (["block", "warn"].indexOf(b.enforcement) < 0) e.push("choose block or warn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.effectiveFrom || "")) e.push("enter the date it starts");
  return e;
}
function acAdd(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const b = { id: "AB-" + (++AC.seq), code: String(f.code || "").trim(), version: 1, dimension: f.dimension, value: String(f.dimension === "state" ? String(f.value || "").toUpperCase() : f.value || "").trim(), metric: f.metric, limitAmount: Number(f.limitAmount), warningPct: Number(f.warningPct), enforcement: f.enforcement, lob: f.lob || "*", currency: "USD", effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = acValidate(b);
  if (AC.buckets.some(x => x.code === b.code)) errs.push("a bucket with this code exists; start a new version of it");
  if (errs.length) { AC.seq--; return { ok: false, error: "invalid", errors: errs }; }
  AC.buckets.push(b); acSave();
  return { ok: true, bucket: b };
}
function acAct(id, what) {
  const b = AC.buckets.find(x => x.id === id); if (!b) return;
  const r = ucAct(AC.buckets, b, what, "AB-" + (++AC.seq));
  if (!r.ok && what === "newver") AC.seq--;
  if (r.error !== "cancelled") ucToast(r, "Done.");
  acSave(); ucRender();
}

// ----------------------------------------------------------------------------
// EXPOSURE
// ----------------------------------------------------------------------------
function acFields(sub) { if (!sub.accumulation) sub.accumulation = {}; return sub.accumulation; }
function acSetFields(sub, f) {
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return { ok: false, error: "permission" }; }
  const a = acFields(sub); if (f.county !== undefined) a.county = String(f.county).trim(); if (f.catZone !== undefined) a.cat_zone = String(f.catZone).trim();
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}
/** The value a case has for a dimension, or null. */
function acValue(sub, dim) {
  if (dim === "state") return typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  if (dim === "zip") return mmAddr(sub.address).zip || null;
  if (dim === "county" || dim === "cat_zone") return (sub.accumulation && sub.accumulation[dim]) ? String(sub.accumulation[dim]).toLowerCase() : null;
  if (dim === "industry") { const v = (sub.coveragesInfo && sub.coveragesInfo.naics_code) || sub.naics || null; return v ? String(v) : null; }
  if (dim === "fleet_band") return Array.isArray(sub.vehicles) && sub.vehicles.length ? sub.vehicles.length : null;
  return null;
}
function acMetric(sub, metric) {
  if (metric === "tiv" || metric === "liability_limit") return Number(sub.exposureVal) || 0;
  if (metric === "premium") return authMeasures(sub).premium || 0;
  if (metric === "power_units") return Array.isArray(sub.vehicles) ? sub.vehicles.length : 0;
  return 0;
}
function acMatches(b, sub) {
  const v = acValue(sub, b.dimension);
  if (v === null || v === undefined) return false;
  if (!ucScopeHas(b.lob, sub.lobKey)) return false;
  if (b.dimension === "fleet_band") { const [lo, hi] = String(b.value).split("-").map(Number); return v >= lo && v <= hi; }
  return String(v).toLowerCase() === String(b.value).toLowerCase();
}
/** Where a bucket stands for a case: bound, this case, the pipeline, the test figure and a status (ok, warning, exceeded). */
function acExposure(b, sub) {
  let bound = 0, pipe = 0;
  SUBMISSIONS_DATASET.forEach(o => { if (o.id === sub.id || !acMatches(b, o)) return; if (policyIsBound(o)) bound += acMetric(o, b.metric); else if (o.quoteIssued && caseIsOpen(o)) pipe += acMetric(o, b.metric); });
  const mine = acMatches(b, sub) ? acMetric(sub, b.metric) : 0, isBound = policyIsBound(sub);
  const test = bound + mine, pct = b.limitAmount ? Math.round(test / b.limitAmount * 1000) / 10 : 0;
  return { bound: bound, thisCase: mine, thisIsBound: isBound, pipeline: pipe, test: test, withPipeline: test + pipe, pct: pct, status: test > b.limitAmount ? "exceeded" : pct >= b.warningPct ? "warning" : "ok" };
}
function acActive(day) { const d = day || todayIso(); return AC.buckets.filter(b => b.status === "active" && ucInForce(b.effectiveFrom, b.effectiveTo, d)); }
/** Every active bucket this case falls in. */
function acCheck(sub, day) { return acActive(day).filter(b => acMatches(b, sub)).map(b => Object.assign({ bucket: b, waived: !!(sub.accumulationWaivers || []).find(w => w.bucketId === b.id && w.version === b.version) }, acExposure(b, sub))); }
function acWaive(sub, bucketId, reason) {
  if (!hasPermission("authority", "override")) { denyPermission("authority", "override"); return { ok: false, error: "permission" }; }
  const b = AC.buckets.find(x => x.id === bucketId);
  if (!b || b.enforcement !== "block") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  if (!sub.accumulationWaivers) sub.accumulationWaivers = [];
  sub.accumulationWaivers.push({ bucketId: b.id, code: b.code, version: b.version, reason: String(reason).trim(), by: ucActor(), at: nowStamp() });
  logDecision(sub, sub.currentStep || 12, "accumulation_waived", b.code + " waived for this case: " + String(reason).trim());
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}
/** The carrier's capacity on the case's line. */
function acCapacity(sub) {
  const carrier = sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "");
  const ag = typeof CARRIER_AUTHORITY !== "undefined" ? CARRIER_AUTHORITY[carrier] : null;
  if (!ag) return null;
  const line = ag.lines[sub.lobKey] || ag.lines["*"];
  if (!line || line.capacity === undefined) return null;
  const used = authBoundAggregate(carrier, sub.lobKey, sub.id, SUBMISSIONS_DATASET), mine = Number(sub.exposureVal) || 0, bound = policyIsBound(sub);
  const status = bound ? "bound" : caseStatus(sub) === "Declined" || caseStatus(sub) === "Closed" ? "released" : "proposed";
  return { carrier: carrier, capacity: line.capacity, used: used, thisCase: status === "released" ? 0 : mine, remaining: line.capacity - used - (status === "released" ? 0 : mine), status: status };
}
function acGuard(stage) {
  return function () {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId); if (!sub) return true;
    const rows = acCheck(sub), bad = rows.filter(r => r.status === "exceeded" && r.bucket.enforcement === "block" && !r.waived), warn = rows.filter(r => r.status !== "ok" && !(bad.indexOf(r) > -1));
    if (warn.length) showToast("Accumulation: " + warn.map(r => r.bucket.code + " at " + r.pct + "% of its limit").join("; ") + ".", "warning");
    if (bad.length) { logDecision(sub, sub.currentStep || 12, "accumulation_blocked", (stage === "bind" ? "Bind" : "Quote") + " blocked: " + bad.map(r => r.bucket.code + " would hold " + Math.round(r.test) + " against a limit of " + r.bucket.limitAmount).join("; ") + "."); showToast("⛔ " + (stage === "bind" ? "Bind" : "Quote") + " blocked (accumulation): " + bad.map(r => r.bucket.code).join(", ") + " would be over its limit.", "danger"); return false; }
    return true;
  };
}

// ----------------------------------------------------------------------------
// SCREENS
// ----------------------------------------------------------------------------
function acHtml() {
  const edit = ucCan("edit");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New accumulation bucket</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="ac_code">Code</label><input class="form-control" id="ac_code"></div><div class="form-group"><label for="ac_dim">Dimension</label><select class="form-control" id="ac_dim">${Object.keys(AC_DIMS).map(k => `<option value="${k}">${escHtml(AC_DIMS[k])}</option>`).join("")}</select></div>
    <div class="form-group"><label for="ac_val">Value</label><input class="form-control" id="ac_val" placeholder="TX, 75201, 484110, 11-25"></div><div class="form-group"><label for="ac_met">Adds up</label><select class="form-control" id="ac_met">${Object.keys(AC_METRICS).map(k => `<option value="${k}">${escHtml(AC_METRICS[k])}</option>`).join("")}</select></div>
    <div class="form-group"><label for="ac_lim">Limit</label><input class="form-control" id="ac_lim"></div><div class="form-group"><label for="ac_warn">Warn at %</label><input class="form-control" id="ac_warn"></div><div class="form-group"><label for="ac_enf">A breach</label><select class="form-control" id="ac_enf"><option>warn</option><option>block</option></select></div><div class="form-group"><label for="ac_lob">Line key (or all)</label><input class="form-control" id="ac_lob" placeholder="*"></div><div class="form-group"><label for="ac_from">Starts</label><input type="date" class="form-control" id="ac_from" value="${todayIso()}"></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="acAddUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing accumulation limits needs edit rights on review rules.</div>`;
  const rows = AC.buckets.slice().reverse().map(b => `<tr><td><strong>${escHtml(b.code)}</strong> v${b.version}</td><td>${escHtml(AC_DIMS[b.dimension])}: ${escHtml(b.value)}<div class="p1-note">line ${escHtml(ucListText(b.lob))}</div></td><td>${escHtml(AC_METRICS[b.metric])}<div class="p1-note">limit ${escHtml(b.limitAmount.toLocaleString("en-US"))}, warn at ${b.warningPct}%, ${escHtml(b.enforcement)}</div></td><td>${ucStatusBadge(b.status)}${b.rejectedReason ? `<div class="p1-note">Sent back: ${escHtml(b.rejectedReason)}</div>` : ""}</td><td>${ucActionsHtml("acAct", b)}</td></tr>`).join("");
  return form + (AC.buckets.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Bucket</th><th>Where</th><th>Limit</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No accumulation bucket is registered. Only the carrier's aggregate capacity by line is tested.</div>`);
}
function acAddUi() { const r = acAdd({ code: ucV("ac_code"), dimension: ucV("ac_dim"), value: ucV("ac_val"), metric: ucV("ac_met"), limitAmount: ucV("ac_lim"), warningPct: ucV("ac_warn"), enforcement: ucV("ac_enf"), lob: ucV("ac_lob") || "*", effectiveFrom: ucV("ac_from") }); ucToast(r, "Draft created."); ucRender(); }
function acCaseHtml(sub) {
  const rows = acCheck(sub), cap = acCapacity(sub), canWaive = hasPermission("authority", "override"), canEdit = hasPermission("submissionData", "edit"), f = acFields(sub);
  const num = n => Math.round(n).toLocaleString("en-US");
  const t = rows.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Bucket</th><th>Bound</th><th>This case</th><th>Pipeline</th><th>Test</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${escHtml(r.bucket.code)}<div class="p1-note">${escHtml(AC_DIMS[r.bucket.dimension])}: ${escHtml(r.bucket.value)} · ${escHtml(AC_METRICS[r.bucket.metric])}</div></td><td>${num(r.bound)}</td><td>${num(r.thisCase)}${r.thisIsBound ? " (bound)" : " (proposed)"}</td><td>${num(r.pipeline)}</td><td>${num(r.test)} of ${num(r.bucket.limitAmount)} (${r.pct}%)</td><td><span class="badge ${r.status === "ok" ? "badge-success" : r.status === "warning" ? "badge-warning" : "badge-danger"}">${r.status}${r.waived ? " · waived" : ""}</span></td><td>${r.status === "exceeded" && r.bucket.enforcement === "block" && !r.waived && canWaive ? `<button class="btn btn-xs btn-outline" onclick="acWaiveUi('${r.bucket.id}')">Waive</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<div class="mw-empty">No accumulation bucket applies to this case.</div>';
  const c = cap ? `<div class="p1-note">Carrier capacity (${escHtml(cap.carrier)}, ${escHtml(sub.lobKey || "line")}): ${num(cap.capacity)} · bound ${num(cap.used)} · this case ${num(cap.thisCase)} (${escHtml(cap.status)}) · remaining ${num(cap.remaining)}.</div>` : '<div class="p1-note">No delegated capacity is loaded for this carrier and line.</div>';
  const form = canEdit ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="ac_c">County (not on the submission; entered by the underwriter)</label><input class="form-control" id="ac_c" value="${escHtml(f.county || "")}"></div><div class="form-group"><label for="ac_z">Catastrophe zone</label><input class="form-control" id="ac_z" value="${escHtml(f.cat_zone || "")}"></div></div><button class="btn btn-xs btn-outline" onclick="acFieldsUi()">Save county and zone</button>` : "";
  return t + c + form;
}
function acWaiveUi(id) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const why = window.prompt("Why is this case allowed over the limit? (at least 10 characters; recorded with your name)", ""); if (why === null) return; const r = acWaive(sub, id, why); showToast(r.ok ? "✅ Waived." : "⛔ " + (r.error === "reason" ? "Give a reason of at least 10 characters." : r.error), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function acFieldsUi() { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = acSetFields(sub, { county: ucV("ac_c"), catZone: ucV("ac_z") }); showToast(r.ok ? "✅ Saved." : "⛔ " + r.error, r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
(function acInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.accumulation_blocked = { label: "Blocked — Accumulation Limit", icon: "ph-stack", badge: "badge-danger", outcome: "outcome-decline" };
    AUDIT_ACTION_META.accumulation_waived = { label: "Accumulation Limit Waived", icon: "ph-seal-warning", badge: "badge-warning", outcome: "outcome-refer" };
  }
  if (typeof registerGuard === "function") { registerGuard("issueQuote", "accumulation limits", acGuard("quote")); registerGuard("bind", "accumulation limits", acGuard("bind")); }
})();
ucRegisterTab("accumulation", "Accumulation limits", "ph-stack", acHtml, () => AC.buckets.filter(b => b.status === "pending").length);
if (typeof urRegisterSection === "function") urRegisterSection("accumulation", "Accumulation and capacity", acCaseHtml);
