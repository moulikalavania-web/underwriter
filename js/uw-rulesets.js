/**
 * ============================================================================
 * UW RULE SETS: VERSIONED, STAGED, ASSIGNED, AND REPRODUCIBLE
 * ----------------------------------------------------------------------------
 * Until now the only rules were the appetite rules that arrive inside an ingested product. This adds the underwriting rule set as a
 * record, beside them:
 *
 *   RULE SET   a code and a version, a kind (eligibility, guideline, referral, pricing guidance), a source (the product, or the
 *              underwriting administration), the period it is in force, and where it applies: product, line, state and coverage.
 *              A version is never edited once it is in force: a change is a new version, and bringing it in force retires the old one.
 *              A set is proposed by one person and put in force by a DIFFERENT person.
 *   RULE       one test on a figure from the case (limit, premium, state, years in business, vehicles, drivers, claims, incurred, risk
 *              score...), the severity of a failure, what it leads to (decline, refer or warn), the message, and the ONE stage it runs
 *              at: triage, quote, bind, endorsement or renewal. A figure that cannot be found does not fail the rule; the run says
 *              the rule could not be tested.
 *   TIGHTEN ONLY  a rule set from the underwriting administration can add requirements and can make a carrier rule stricter. It cannot
 *              switch a carrier rule off, and cannot lower a failure's consequence below the rule it names.
 *   TRIAGE     rules at the triage stage run on the new submission before any workflow case is opened (Phase 1's appetite check).
 *   AUTO-DECLINE  off unless a person with the right turns it on, with a reason, and then only for rule sets that say so: a knockout
 *              from such a set records the decline itself, naming the rule run, and the notice and Decline Center follow as usual.
 *   REPRODUCIBLE  every run keeps the figures each rule was tested against, the product it ran on, and the rule set versions used, so
 *              the result can be explained and repeated later.
 * ============================================================================
 */

const RS_KEY = "FUT_UW_RULESETS_V1";
const RS_KINDS = ["eligibility", "guideline", "referral", "pricing_guidance"];
const RS_SOURCES = { uw_admin: "Underwriting administration", product_studio: "Product" };
const RS_STAGES = ["triage", "quote", "bind", "endorsement", "renewal"];
const RS_OPS = { lt: "is less than", lte: "is at most", gt: "is more than", gte: "is at least", eq: "equals", ne: "does not equal", in: "is one of", notin: "is none of" };
const RS_OUTCOMES = { decline: 3, refer: 2, warn: 1 };
const RS_SEVERITIES = ["knockout", "major", "minor", "info"];
const RS_FIELDS = { limit: "Requested limit / TIV", premium: "Premium", state: "Risk state", lob: "Line of business", yearsInBusiness: "Years in business", vehicles: "Number of vehicles",
  drivers: "Number of drivers", claims3y: "Claims in the last 3 years", incurred3y: "Incurred loss, last 3 years", openClaims: "Open claims", riskScore: "Risk score", lossRatio: "Loss ratio (prior periods, 0 to 1 or more)", oosRate: "Out-of-service rate (inspections, 0 to 1)" };
const RS_NUMERIC = ["limit", "premium", "yearsInBusiness", "vehicles", "drivers", "claims3y", "incurred3y", "openClaims", "riskScore", "lossRatio", "oosRate"];
const RS_MIN_REASON = 10;

var RS = { sets: [], cfg: { autoDecline: false, by: null, at: null, reason: "" }, seq: 0 };
try { const r = JSON.parse(localStorage.getItem(RS_KEY)); if (r && Array.isArray(r.sets)) RS = Object.assign(RS, r); } catch (e) { /* none yet */ }
var RS_UI = { open: null };

function rsSave() { try { localStorage.setItem(RS_KEY, JSON.stringify(RS)); } catch (e) { /* keep for this session */ } }
function rsNum(v) { const n = Number(String(v === null || v === undefined ? "" : v).replace(/[$,\s]/g, "")); return v === null || v === undefined || v === "" || isNaN(n) ? null : n; }

// ----------------------------------------------------------------------------
// 1. THE FIGURES A RULE IS TESTED AGAINST
// ----------------------------------------------------------------------------
/** The figures of a case, each null when the case does not hold it. */
function rsMeasures(sub) {
  const m = {};
  let am = { premium: 0, limit: 0, lob: "", state: null };
  try { am = authMeasures(sub); } catch (e) { /* none */ }
  m.limit = am.limit > 0 ? am.limit : null;
  m.premium = am.premium > 0 ? am.premium : null;
  m.state = am.state || null;
  m.lob = sub.lobKey || null;
  m.yearsInBusiness = rsNum(sub.operationsProfile && sub.operationsProfile.years_in_business);
  m.vehicles = Array.isArray(sub.vehicles) && sub.vehicles.length ? sub.vehicles.length : null;
  m.drivers = Array.isArray(sub.drivers) && sub.drivers.length ? sub.drivers.length : null;
  m.claims3y = null; m.incurred3y = null; m.openClaims = null;
  if (Array.isArray(sub.losses) && sub.losses.length && typeof analyzeLossRuns === "function") {
    try { const a = analyzeLossRuns(sub); if (!a.noRows) { m.claims3y = a.claims; m.incurred3y = a.incurred; m.openClaims = a.open; } } catch (e) { /* none */ }
  }
  m.riskScore = null;
  try { if (typeof getEffectiveRiskScore === "function") { const r = getEffectiveRiskScore(sub); m.riskScore = r === undefined || r === null || isNaN(r) ? null : Number(r); } } catch (e) { /* none */ }
  m.lossRatio = sub.lossMetrics && sub.lossMetrics.lossRatio !== undefined ? sub.lossMetrics.lossRatio : null;
  m.oosRate = typeof erSummary === "function" && Array.isArray(sub.externalRecords) && sub.externalRecords.length ? erSummary(sub).oosRate : null;
  return m;
}
function rsProductRef() {
  const p = window.ACTIVE_INSURANCE_PRODUCT;
  return p ? { id: p.productId || (p.product && p.product.id) || null, name: p.productName || (p.product && p.product.name) || null, version: p.version || p.productVersion || null } : null;
}
function rsCoverageNames(sub) { return Object.keys(sub.coveragesInfo || {}).map(k => k.toLowerCase()); }

/** One test. Returns "pass", "fail" or "unknown" (the figure is not on the case). */
function rsTest(rule, actual) {
  if (actual === null || actual === undefined || actual === "") return "unknown";
  const numeric = RS_NUMERIC.indexOf(rule.field) > -1;
  const a = numeric ? Number(actual) : String(actual).toLowerCase();
  const v = numeric ? rsNum(rule.value) : (Array.isArray(rule.value) ? rule.value.map(x => String(x).toLowerCase()) : String(rule.value).toLowerCase());
  switch (rule.op) {
    case "lt": return a < v ? "pass" : "fail";
    case "lte": return a <= v ? "pass" : "fail";
    case "gt": return a > v ? "pass" : "fail";
    case "gte": return a >= v ? "pass" : "fail";
    case "eq": return a === v ? "pass" : "fail";
    case "ne": return a !== v ? "pass" : "fail";
    case "in": return (Array.isArray(v) ? v : [v]).indexOf(a) > -1 ? "pass" : "fail";
    case "notin": return (Array.isArray(v) ? v : [v]).indexOf(a) > -1 ? "fail" : "pass";
  }
  return "unknown";
}

// ----------------------------------------------------------------------------
// 2. WHICH RULES APPLY, AND THEIR RESULTS
// ----------------------------------------------------------------------------
function rsSetApplies(set, sub, day) {
  if (set.status !== "active" || !ucInForce(set.effectiveFrom, set.effectiveTo, day)) return false;
  const sc = set.scope || {}, prod = rsProductRef(), m = rsMeasures(sub);
  if (!ucScopeHas(sc.product, prod && prod.id)) return false;
  if (!ucScopeHas(sc.lob, sub.lobKey)) return false;
  if (sc.state && sc.state !== "*" && !(m.state && ucScopeHas(sc.state, m.state))) return false;
  if (sc.coverage && sc.coverage !== "*") { const have = rsCoverageNames(sub); if (!(Array.isArray(sc.coverage) ? sc.coverage : [sc.coverage]).some(c => have.indexOf(String(c).toLowerCase()) > -1)) return false; }
  return true;
}
/** The rule-set rules that run at a stage for this case, tested now. Pure: writes nothing. */
function rsEvaluate(sub, stage, day) {
  const m = rsMeasures(sub), out = { sets: [], results: [], inputs: {}, measures: m };
  RS.sets.filter(s => rsSetApplies(s, sub, day)).forEach(set => {
    const rules = (set.rules || []).filter(r => r.active !== false && r.stage === stage && ucInForce(r.effectiveFrom, r.effectiveTo, day));
    if (!rules.length) return;
    out.sets.push({ id: set.id, code: set.code, version: set.version, kind: set.kind, source: set.source, autoDecline: !!set.autoDecline, warningsBeforeRefer: set.warningsBeforeRefer });
    rules.forEach(r => {
      const actual = m[r.field];
      out.inputs[r.field] = actual === undefined ? null : actual;
      const res = rsTest(r, actual);
      out.results.push({ setId: set.id, setCode: set.code, setVersion: set.version, kind: set.kind, source: set.source, autoDecline: !!set.autoDecline, ruleId: r.id, code: r.code, stage: r.stage, field: r.field, op: r.op, value: r.value,
        actual: actual === undefined ? null : actual, result: res, severity: r.severity, onFail: r.outcomeOnFail, message: r.message });
    });
  });
  return out;
}
/** The lowest warnings-before-refer among the sets that ran, or the engine's own limit. */
function rsWarningLimit(ev, dflt) {
  const n = ev.sets.map(s => Number(s.warningsBeforeRefer)).filter(x => x >= 1);
  return n.length ? Math.min.apply(null, n.concat([dflt])) : dflt;
}

/** Triage rules for a new submission, before a workflow case is opened. Lines in the shape Phase 1's appetite check uses. */
function rsTriageLines(sub) {
  const ev = rsEvaluate(sub, "triage");
  return ev.results.map(r => {
    const label = RS_FIELDS[r.field] || r.field;
    if (r.result === "unknown") return { ok: true, text: `Rule ${r.code} (${r.setCode} v${r.setVersion}): ${label} is not on the submission, so the rule could not be tested.` };
    if (r.result === "pass") return { ok: true, text: `Rule ${r.code} (${r.setCode} v${r.setVersion}): ${label} ${r.actual} passes.` };
    const what = r.onFail === "decline" ? "outside appetite" : r.onFail === "refer" ? "send it to a senior underwriter" : "a warning";
    return { ok: r.onFail !== "decline", text: `Rule ${r.code} (${r.setCode} v${r.setVersion}): ${r.message || label + " " + RS_OPS[r.op] + " " + ucListText(r.value)}; ${label} is ${r.actual}. ${what.charAt(0).toUpperCase() + what.slice(1)}.` };
  });
}

// ----------------------------------------------------------------------------
// 3. RECORDS: CREATE, PROPOSE, PUT IN FORCE, NEW VERSION, RETIRE
// ----------------------------------------------------------------------------
function rsId(prefix) { RS.seq = (RS.seq || 0) + 1; return prefix + "-" + RS.seq; }
function rsFind(id) { return RS.sets.find(s => s.id === id) || null; }
function rsDenied() { if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return true; } return false; }

function rsValidateRule(r, set) {
  const e = [];
  if (RS_STAGES.indexOf(r.stage) < 0) e.push("choose the one stage the rule runs at");
  if (!RS_FIELDS[r.field]) e.push("choose the figure the rule tests");
  if (!RS_OPS[r.op]) e.push("choose the comparison");
  const listOp = r.op === "in" || r.op === "notin";
  if (listOp ? !(Array.isArray(r.value) && r.value.length) : (r.value === "" || r.value === null || r.value === undefined || Array.isArray(r.value))) e.push("give the value to compare with");
  if (RS_FIELDS[r.field] && RS_NUMERIC.indexOf(r.field) > -1 && !listOp && rsNum(r.value) === null) e.push(RS_FIELDS[r.field] + " is a number");
  if (RS_FIELDS[r.field] && RS_NUMERIC.indexOf(r.field) > -1 && ["eq", "ne"].indexOf(r.op) < 0 && listOp) e.push("a list of values suits the state or line, not a number");
  if (RS_SEVERITIES.indexOf(r.severity) < 0) e.push("choose a severity");
  if (!RS_OUTCOMES[r.outcomeOnFail]) e.push("choose what a failure leads to (decline, refer or warn)");
  if (String(r.message || "").trim().length < 5) e.push("write the message the underwriter will see (at least 5 characters)");
  if (r.severity === "knockout" && r.outcomeOnFail && r.outcomeOnFail !== "decline") e.push("a knockout leads to a decline");
  if (set && set.source === "uw_admin" && r.severity === "info") e.push("an administration rule cannot be information only: it can only tighten");
  if (r.tightens) {
    const base = (typeof uwBaseRuleOutcome === "function") ? uwBaseRuleOutcome(r.tightens) : null;
    if (base && RS_OUTCOMES[r.outcomeOnFail] < RS_OUTCOMES[base]) e.push("it cannot make " + r.tightens + " (" + base + ") less strict");
  }
  return e;
}
function rsValidateSet(s) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(s.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (String(s.name || "").trim().length < 3) e.push("name the rule set");
  if (RS_KINDS.indexOf(s.kind) < 0) e.push("choose the kind");
  if (!RS_SOURCES[s.source]) e.push("choose the source");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.effectiveFrom || "")) e.push("enter the date it starts");
  if (s.effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(s.effectiveTo) || s.effectiveTo < s.effectiveFrom)) e.push("the end date must not be before the start");
  if (s.warningsBeforeRefer !== null && s.warningsBeforeRefer !== undefined && s.warningsBeforeRefer !== "") {
    const w = Number(s.warningsBeforeRefer);
    if (!(w >= 1 && w === Math.floor(w))) e.push("warnings before referral is a whole number of 1 or more");
    else if (s.source === "uw_admin" && w > UW_WARNINGS_BEFORE_REFER) e.push("an administration set can only tighten: warnings before referral cannot be more than " + UW_WARNINGS_BEFORE_REFER);
  }
  return e;
}
function rsAddSet(f) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = { id: rsId("RS"), code: String(f.code || "").trim(), name: String(f.name || "").trim(), version: 1, kind: f.kind, source: f.source || "uw_admin", autoDecline: !!f.autoDecline,
    warningsBeforeRefer: f.warningsBeforeRefer === "" || f.warningsBeforeRefer === undefined ? null : Number(f.warningsBeforeRefer), effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "",
    scope: { product: f.product || "*", lob: f.lob || "*", state: f.state || "*", coverage: f.coverage || "*" }, status: "draft", rules: [], createdBy: ucActor(), createdAt: nowStamp() };
  const errs = rsValidateSet(s);
  if (RS.sets.some(x => x.code === s.code)) errs.push("a rule set with this code exists; start a new version of it instead");
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  RS.sets.push(s); rsSave();
  return { ok: true, set: s };
}
function rsAddRule(setId, f) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = rsFind(setId);
  if (!s) return { ok: false, error: "set" };
  if (s.status !== "draft") return { ok: false, error: "locked" };
  const r = { id: rsId("RL"), code: String(f.code || "").trim() || "R" + ((s.rules || []).length + 1), stage: f.stage, field: f.field, op: f.op, value: f.value, severity: f.severity, outcomeOnFail: f.outcomeOnFail, message: String(f.message || "").trim(),
    tightens: f.tightens || "", active: true, effectiveFrom: f.effectiveFrom || "", effectiveTo: f.effectiveTo || "" };
  if (s.rules.some(x => x.code === r.code)) return { ok: false, error: "invalid", errors: ["a rule with this code is already in the set"] };
  const errs = rsValidateRule(r, s);
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  s.rules.push(r); rsSave();
  return { ok: true, rule: r };
}
function rsRemoveRule(setId, ruleId) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = rsFind(setId);
  if (!s || s.status !== "draft") return { ok: false, error: "locked" };
  s.rules = s.rules.filter(r => r.id !== ruleId); rsSave();
  return { ok: true };
}
/** A draft is sent for approval. */
function rsSubmit(id) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = rsFind(id);
  if (!s || s.status !== "draft") return { ok: false, error: "state" };
  const errs = rsValidateSet(s).concat(s.rules.length ? [] : ["a rule set needs at least one rule"]);
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  s.status = "pending"; s.submittedBy = ucActor(); s.submittedAt = nowStamp(); rsSave();
  return { ok: true, set: s };
}
/** A different person puts it in force. The previous version of the same code is retired the same day. */
function rsApprove(id) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = rsFind(id);
  if (!s || s.status !== "pending") return { ok: false, error: "state" };
  if (s.submittedBy === ucActor()) return { ok: false, error: "self" };
  RS.sets.filter(x => x.code === s.code && x.id !== s.id && x.status === "active").forEach(o => { o.status = "retired"; o.retiredAt = nowStamp(); o.retiredBy = ucActor(); o.supersededBy = s.id; });
  s.status = "active"; s.approvedBy = ucActor(); s.approvedAt = nowStamp(); rsSave();
  return { ok: true, set: s };
}
function rsReject(id, reason) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = rsFind(id);
  if (!s || s.status !== "pending") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < RS_MIN_REASON) return { ok: false, error: "reason" };
  s.status = "draft"; s.rejectedBy = ucActor(); s.rejectedReason = String(reason).trim(); delete s.submittedBy; rsSave();
  return { ok: true };
}
/** A copy as the next version, in draft. Nothing in force is edited. */
function rsNewVersion(id) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = rsFind(id);
  if (!s || s.status === "draft" || s.status === "pending") return { ok: false, error: "state" };
  if (RS.sets.some(x => x.code === s.code && (x.status === "draft" || x.status === "pending"))) return { ok: false, error: "open" };
  const top = Math.max.apply(null, RS.sets.filter(x => x.code === s.code).map(x => x.version));
  const n = JSON.parse(JSON.stringify(s));
  Object.assign(n, { id: rsId("RS"), version: top + 1, status: "draft", createdBy: ucActor(), createdAt: nowStamp(), supersedes: s.id });
  ["approvedBy", "approvedAt", "submittedBy", "submittedAt", "retiredAt", "retiredBy", "supersededBy", "rejectedBy", "rejectedReason"].forEach(k => delete n[k]);
  n.rules.forEach(r => { r.id = rsId("RL"); });
  RS.sets.push(n); rsSave();
  return { ok: true, set: n };
}
function rsRetire(id, reason) {
  if (rsDenied()) return { ok: false, error: "permission" };
  const s = rsFind(id);
  if (!s || s.status !== "active") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < RS_MIN_REASON) return { ok: false, error: "reason" };
  s.status = "retired"; s.retiredAt = nowStamp(); s.retiredBy = ucActor(); s.retiredReason = String(reason).trim(); rsSave();
  return { ok: true };
}
/** The switch for automatic decline. Off until a person with the right turns it on and says why. */
function rsSetAutoDecline(on, reason) {
  if (rsDenied()) return { ok: false, error: "permission" };
  if (String(reason || "").trim().length < RS_MIN_REASON) return { ok: false, error: "reason" };
  RS.cfg = { autoDecline: !!on, by: ucActor(), at: nowStamp(), reason: String(reason).trim() }; rsSave();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 4. AUTOMATIC DECLINE
// ----------------------------------------------------------------------------
/** If the switch is on and a knockout from a rule set that allows it failed in this run, the decline is recorded by the system. */
function rsAutoDecline(sub, run) {
  if (!RS.cfg.autoDecline || !run || run.outcome !== "auto_declined" || caseStatus(sub) === "Declined" || typeof outRecord !== "function") return null;
  const hit = (run.results || []).filter(r => r.result === "fail" && r.onFail === "decline" && r.autoDecline && r.setId);
  if (!hit.length) return null;
  const text = "Automatic decline by rule set " + hit.map(h => h.setCode + " v" + h.setVersion + " rule " + h.code).join(", ") + ": " + hit.map(h => h.message).join(" ") + " Run " + run.runId + ".";
  const r = outRecord(sub, { type: "auto_declined", reasonCode: "APPETITE", reasonText: text }, { system: true });
  if (!r.ok) return null;
  r.outcome.decidedBy = "System (automatic)"; r.outcome.source = "rule"; r.outcome.ruleRunId = run.runId;
  sub.declinedBy = "System (automatic)"; sub.declineReason = text; sub.declineTriggerPoint = "Rule set knockout";
  sub.statusText = "Declined"; sub.statusBadge = "badge-danger";
  logDecision(sub, sub.currentStep || 2, "declined", text, "System (automatic)");
  if (typeof DECLINE_LOG !== "undefined") DECLINE_LOG.unshift({ subId: sub.id, insured: sub.insured, lob: sub.lobName, triggerPoint: "Rule set knockout", reason: text, at: nowStamp(), apiSourced: !!sub.apiSourced });
  rsSave();
  return r.outcome;
}

// ----------------------------------------------------------------------------
// 5. THE TAB
// ----------------------------------------------------------------------------
function rsStatusBadge(s) { return { draft: '<span class="badge badge-light">Draft</span>', pending: '<span class="badge badge-warning">Awaiting approval</span>', active: '<span class="badge badge-success">In force</span>', retired: '<span class="badge badge-light">Retired</span>' }[s]; }
function rsScopeText(sc) { return ["product", "lob", "state", "coverage"].map(k => k + ": " + ucListText((sc || {})[k])).join(" · "); }
function rsHtml() {
  const edit = ucCan("edit");
  const optList = (o) => Object.keys(o).map(k => `<option value="${k}">${escHtml(o[k])}</option>`).join("");
  const cfg = `<div class="card" style="margin-bottom:12px;"><div class="card-body"><strong>Automatic decline:</strong> ${RS.cfg.autoDecline ? '<span class="badge badge-danger">On</span>' : '<span class="badge badge-light">Off</span>'}
    <span class="p1-note">Only knockouts from a rule set that allows it record the decline themselves. ${RS.cfg.by ? "Last changed by " + escHtml(RS.cfg.by) + " " + escHtml(RS.cfg.at) + ": " + escHtml(RS.cfg.reason) : "It has never been turned on."}</span>
    ${edit ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group mw-wide"><label for="rs_ad_reason">Reason for the change</label><input class="form-control" id="rs_ad_reason"></div></div><button class="btn btn-sm btn-outline" onclick="rsAutoDeclineUi(${RS.cfg.autoDecline ? "false" : "true"})">Turn ${RS.cfg.autoDecline ? "off" : "on"}</button>` : ""}</div></div>`;
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New rule set</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="rs_code">Code</label><input class="form-control" id="rs_code"></div><div class="form-group mw-wide"><label for="rs_name">Name</label><input class="form-control" id="rs_name"></div>
    <div class="form-group"><label for="rs_kind">Kind</label><select class="form-control" id="rs_kind">${RS_KINDS.map(k => `<option>${k}</option>`).join("")}</select></div><div class="form-group"><label for="rs_source">Source</label><select class="form-control" id="rs_source">${optList(RS_SOURCES)}</select></div>
    <div class="form-group"><label for="rs_from">Starts</label><input type="date" class="form-control" id="rs_from" value="${todayIso()}"></div><div class="form-group"><label for="rs_to">Ends (optional)</label><input type="date" class="form-control" id="rs_to"></div>
    <div class="form-group"><label for="rs_product">Product id (or all)</label><input class="form-control" id="rs_product" placeholder="*"></div><div class="form-group"><label for="rs_lob">Line key (or all)</label><input class="form-control" id="rs_lob" placeholder="*"></div>
    <div class="form-group"><label for="rs_state">States (comma list, or all)</label><input class="form-control" id="rs_state" placeholder="*"></div><div class="form-group"><label for="rs_cov">Coverages (comma list, or all)</label><input class="form-control" id="rs_cov" placeholder="*"></div>
    <div class="form-group"><label for="rs_warn">Warnings before referral</label><input class="form-control" id="rs_warn" placeholder="${UW_WARNINGS_BEFORE_REFER}"></div><div class="form-group"><label><input type="checkbox" id="rs_auto"> May decline automatically</label></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="rsAddSetUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing rule sets needs edit rights on review rules.</div>`;
  const rows = RS.sets.slice().reverse().map(s => {
    const open = RS_UI.open === s.id;
    const acts = !edit ? "" : [
      s.status === "draft" ? `<button class="btn btn-xs btn-outline" onclick="rsSubmitUi('${s.id}')">Send for approval</button>` : "",
      s.status === "pending" ? `<button class="btn btn-xs btn-primary" onclick="rsApproveUi('${s.id}')">Put in force</button> <button class="btn btn-xs btn-outline" onclick="rsRejectUi('${s.id}')">Send back</button>` : "",
      s.status === "active" ? `<button class="btn btn-xs btn-outline" onclick="rsNewVersionUi('${s.id}')">New version</button> <button class="btn btn-xs btn-outline" onclick="rsRetireUi('${s.id}')">Retire</button>` : "",
      s.status === "retired" ? `<button class="btn btn-xs btn-outline" onclick="rsNewVersionUi('${s.id}')">New version</button>` : ""].join(" ");
    const ruleRows = (s.rules || []).map(r => `<tr><td>${escHtml(r.code)}</td><td>${r.stage}</td><td>${escHtml(RS_FIELDS[r.field])} ${RS_OPS[r.op]} ${escHtml(ucListText(r.value))}</td><td><span class="badge ${UW_SEVERITY[r.severity].badge}">${r.severity}</span> ${r.outcomeOnFail}</td><td>${escHtml(r.message)}${r.tightens ? `<div class="p1-note">tightens ${escHtml(r.tightens)}</div>` : ""}</td><td>${s.status === "draft" && edit ? `<button class="btn btn-xs btn-outline" onclick="rsRemoveRuleUi('${s.id}','${r.id}')">Remove</button>` : ""}</td></tr>`).join("");
    const addRule = s.status === "draft" && edit ? `<div class="mw-grid" style="margin-top:8px;">
      <div class="form-group"><label for="rl_stage">Stage</label><select class="form-control" id="rl_stage">${RS_STAGES.map(x => `<option>${x}</option>`).join("")}</select></div><div class="form-group"><label for="rl_field">Figure</label><select class="form-control" id="rl_field">${optList(RS_FIELDS)}</select></div>
      <div class="form-group"><label for="rl_op">Must be</label><select class="form-control" id="rl_op">${optList(RS_OPS)}</select></div><div class="form-group"><label for="rl_val">Value (a list with commas)</label><input class="form-control" id="rl_val"></div>
      <div class="form-group"><label for="rl_sev">Severity</label><select class="form-control" id="rl_sev">${RS_SEVERITIES.map(x => `<option>${x}</option>`).join("")}</select></div><div class="form-group"><label for="rl_out">A failure leads to</label><select class="form-control" id="rl_out">${Object.keys(RS_OUTCOMES).map(x => `<option>${x}</option>`).join("")}</select></div>
      <div class="form-group mw-wide"><label for="rl_msg">Message</label><input class="form-control" id="rl_msg"></div><div class="form-group"><label for="rl_tight">Tightens carrier rule (id, optional)</label><input class="form-control" id="rl_tight"></div></div>
      <button class="btn btn-sm btn-outline" onclick="rsAddRuleUi('${s.id}')">Add rule</button>` : "";
    return `<tr><td><strong>${escHtml(s.code)}</strong> v${s.version}<div class="p1-note">${escHtml(s.name)}</div></td><td>${s.kind}<div class="p1-note">${escHtml(RS_SOURCES[s.source])}</div></td><td>${escHtml(rsScopeText(s.scope))}<div class="p1-note">${escHtml(s.effectiveFrom)} to ${escHtml(s.effectiveTo || "open")}</div></td><td>${rsStatusBadge(s.status)}${s.autoDecline ? ' <span class="badge badge-danger">auto-decline</span>' : ""}</td><td>${(s.rules || []).length} <button class="btn btn-xs btn-outline" onclick="rsToggle('${s.id}')">${open ? "Hide" : "Rules"}</button> ${acts}</td></tr>
      ${open ? `<tr><td colspan="5"><table class="data-table"><thead><tr><th>Code</th><th>Stage</th><th>Test</th><th>Failure</th><th>Message</th><th></th></tr></thead><tbody>${ruleRows || '<tr><td colspan="6" class="text-muted">No rules yet.</td></tr>'}</tbody></table>${s.rejectedReason ? `<div class="p1-note">Sent back by ${escHtml(s.rejectedBy)}: ${escHtml(s.rejectedReason)}</div>` : ""}${addRule}</td></tr>` : ""}`;
  }).join("");
  return cfg + form + (RS.sets.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Rule set</th><th>Kind and source</th><th>Where and when</th><th>Status</th><th>Rules</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No rule set is recorded. The carrier's own appetite rules still run; rule sets add to them.</div>`);
}
function rsToggle(id) { RS_UI.open = RS_UI.open === id ? null : id; ucRender(); }
function rsToast(r, ok) {
  if (r.ok) { showToast("✅ " + ok, "success"); return; }
  const m = { permission: "You do not have the right to do this.", self: "A different person must put it in force: you proposed it.", state: "That cannot be done in its present state.", locked: "Only a draft can be changed.", reason: "Give a reason of at least " + RS_MIN_REASON + " characters.", open: "A newer version is already being prepared." };
  showToast("⛔ " + (r.errors ? r.errors.join("; ") : m[r.error] || r.error), "danger");
}
function rsAddSetUi() {
  const r = rsAddSet({ code: ucV("rs_code"), name: ucV("rs_name"), kind: ucV("rs_kind"), source: ucV("rs_source"), effectiveFrom: ucV("rs_from"), effectiveTo: ucV("rs_to"), product: ucV("rs_product") || "*", lob: ucV("rs_lob") || "*", state: ucList(ucV("rs_state") || "*"), coverage: ucList(ucV("rs_cov") || "*"), warningsBeforeRefer: ucV("rs_warn"), autoDecline: !!(document.getElementById("rs_auto") || {}).checked });
  rsToast(r, "Draft created."); if (r.ok) RS_UI.open = r.set.id; ucRender();
}
function rsAddRuleUi(setId) {
  const op = ucV("rl_op"), raw = ucV("rl_val");
  const r = rsAddRule(setId, { stage: ucV("rl_stage"), field: ucV("rl_field"), op: op, value: op === "in" || op === "notin" ? ucList(raw) : raw, severity: ucV("rl_sev"), outcomeOnFail: ucV("rl_out"), message: ucV("rl_msg"), tightens: ucV("rl_tight") });
  rsToast(r, "Rule added."); ucRender();
}
function rsRemoveRuleUi(setId, ruleId) { rsToast(rsRemoveRule(setId, ruleId), "Rule removed."); ucRender(); }
function rsSubmitUi(id) { rsToast(rsSubmit(id), "Sent for approval."); ucRender(); }
function rsApproveUi(id) { rsToast(rsApprove(id), "The rule set is in force."); ucRender(); }
function rsRejectUi(id) { const why = window.prompt("Why is it sent back? (at least " + RS_MIN_REASON + " characters)", ""); if (why === null) return; rsToast(rsReject(id, why), "Sent back to draft."); ucRender(); }
function rsNewVersionUi(id) { const r = rsNewVersion(id); rsToast(r, "A new draft version was created."); if (r.ok) RS_UI.open = r.set.id; ucRender(); }
function rsRetireUi(id) { const why = window.prompt("Why is it retired? (at least " + RS_MIN_REASON + " characters)", ""); if (why === null) return; rsToast(rsRetire(id, why), "Retired."); ucRender(); }
function rsAutoDeclineUi(on) { rsToast(rsSetAutoDecline(on, ucV("rs_ad_reason")), "Automatic decline is " + (on ? "on" : "off") + "."); ucRender(); }

ucRegisterTab("rulesets", "Rule sets", "ph-list-checks", rsHtml, () => RS.sets.filter(s => s.status === "pending").length);
