/**
 * ============================================================================
 * TENANTS, DISTRIBUTION AGREEMENTS AND BINDING AUTHORITY
 * ----------------------------------------------------------------------------
 * The prototype knew one company. A carrier's delegated authority was one hard-coded table (authority.js), a producer was a
 * name on a commission schedule, and who could see a case depended on a persona's scope. Real placement is a chain of companies:
 *
 *   carrier  ->  MGA  ->  wholesaler  ->  retail broker
 *
 * and each link rests on an agreement that says what the next company may do, for how long, and up to what size.
 *
 *   TENANT         a company on the platform (carrier, MGA, MGU, wholesaler, broker). Every case has an owning tenant (the
 *                  company whose workbench holds it; the home company by default). Another tenant sees a case only through the
 *                  agreement chain it sits in or an explicit share, never because it is in the same database.
 *   AGREEMENT      who distributes for whom: principal and distributor, a type (mga, mgu, wholesale, agency), dates, a parent
 *                  agreement (the chain). A child agreement sits inside its parent's dates and its principal is its parent's
 *                  distributor.
 *   BINDING AUTHORITY AGREEMENT (BAA)  what the MGA may do on the carrier's paper: quote, bind, issue, endorse, cancel; what it may do
 *                  with claims; for which year of account.
 *   AUTHORITY LIMIT  one row per limit: premium, policy limit or TIV (and claim reserve or settlement, kept for claims), by line,
 *                  state, class and coverage, with the action on a breach: refer to the carrier or decline. The most specific row
 *                  wins; two rows for the same scope cannot overlap in time.
 *   PROGRAM        capacity from one or more carriers: shares add to 100%, one is the lead, a fronting share names its contract.
 *
 * Enforcement: quoting, binding, endorsing and cancelling are refused if the agreement does not allow them, a limit marked decline
 * is breached, or an agreement in the chain is not in force that day. A limit marked refer feeds the carrier layer in authority.js:
 * the carrier's approval must be recorded. Each limit tested is kept as an authority check on the case.
 *
 * Nothing is shipped active: with no agreements loaded the checks do not apply and the prototype behaves as before. Load the
 * agreements from the contracts (a proposal citing the contract, approved by someone else); happy-path-pack/distribution-demo.json
 * is an ILLUSTRATIVE example. This is data isolation in the browser only; a production build enforces it on the server.
 * ============================================================================
 */

const DD_HOME = "T-HOME";
const DD_TENANT_TYPES = ["carrier", "mga", "mgu", "wholesaler", "broker"];
const DD_AGREEMENT_TYPES = ["mga", "mgu", "wholesale", "agency"];
const DD_LIMIT_TYPES = { premium: "Premium", policy_limit: "Policy limit", tiv: "Total insured value", claim_reserve: "Claim reserve", claim_settlement: "Claim settlement" };
const DD_ACTIONS = { quote: ["canQuote", "quote"], bind: ["canBind", "bind"], issue: ["canIssue", "issue"], endorse: ["canEndorse", "endorse"], cancel: ["canCancel", "cancel"] };
const DD_KEY = "FUT_DISTRIBUTION_V1";

function ddEmpty() { return { tenants: [], agreements: [], baas: [], limits: [], programs: [], shares: [] }; }
var DD_CFG = ddEmpty();
var DD_META = { source: "none", contractRef: null, approvedBy: null, approvedAt: null };
var DD_PENDING = null;
var DD_HISTORY = [];

function ddEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function ddNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function ddToday() { return new Date().toISOString().slice(0, 10); }
function ddActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function ddActorKey() { return typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole] ? USER_ROLES_CONFIG[currentUserRole].name : String(currentUserRole); }
function ddClone(o) { return JSON.parse(JSON.stringify(o)); }
function ddMoney(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("en-US"); }
function ddActiveSub() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }
function ddLog(sub, decision, notes) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 7, decision: decision, by: ddActor(), at: ddNow(), notes: notes }); }

// ----------------------------------------------------------------------------
// 1. STORE AND PROPOSALS
// ----------------------------------------------------------------------------
function ddSaveStore() { try { localStorage.setItem(DD_KEY, JSON.stringify({ cfg: DD_CFG, meta: DD_META, pending: DD_PENDING, history: DD_HISTORY })); } catch (e) { /* storage unavailable: kept for this session */ } }
(function loadStored() {
  try { const raw = localStorage.getItem(DD_KEY); if (!raw) return; const st = JSON.parse(raw); if (st && st.cfg) { DD_CFG = Object.assign(ddEmpty(), st.cfg); DD_META = st.meta || DD_META; DD_PENDING = st.pending || null; DD_HISTORY = Array.isArray(st.history) ? st.history : []; } } catch (e) { /* damaged store ignored */ }
})();
/** Forgets everything loaded and stored. */
function ddReset() { DD_CFG = ddEmpty(); DD_META = { source: "none", contractRef: null, approvedBy: null, approvedAt: null }; DD_PENDING = null; DD_HISTORY = []; try { localStorage.removeItem(DD_KEY); } catch (e) { /* nothing stored */ } }
function ddLoaded() { return DD_CFG.agreements.length > 0; }
function ddHistoryAdd(action, text) { DD_HISTORY.push({ at: ddNow(), by: ddActor(), action: action, text: text }); if (DD_HISTORY.length > 50) DD_HISTORY = DD_HISTORY.slice(-50); }

const dd = { tenant: id => DD_CFG.tenants.find(t => t.id === id) || null, agreement: id => DD_CFG.agreements.find(a => a.id === id) || null, baa: id => DD_CFG.baas.find(b => b.id === id) || null };
function ddInForce(o, d) { return (!o.from || o.from <= d) && (!o.to || d <= o.to) && (o.status === undefined || o.status === "active"); }
function ddOverlap(a, b) { return (!a.to || !b.from || a.to >= b.from) && (!b.to || !a.from || b.to >= a.from); }

/** Everything wrong with a set of tenants, agreements, authorities, limits and programs, as sentences. [] means it can be proposed. */
function ddValidate(cfg) {
  const errs = [], ymd = /^\d{4}-\d{2}-\d{2}$/;
  const ids = (list, what) => { const seen = {}; (list || []).forEach(x => { if (!x.id) errs.push("A " + what + " has no id."); else if (seen[x.id]) errs.push(what + " " + x.id + ": the id is used twice."); seen[x.id] = true; }); };
  const dateErr = (o, w) => { if (!o.from || !ymd.test(o.from)) errs.push(w + ": the start date must be yyyy-mm-dd."); if (o.to && !ymd.test(o.to)) errs.push(w + ": the end date must be yyyy-mm-dd or empty."); if (o.from && o.to && o.to < o.from) errs.push(w + ": it ends before it starts."); };
  const T = {}, A = {}, B = {};
  ids(cfg.tenants, "tenant"); ids(cfg.agreements, "agreement"); ids(cfg.baas, "binding authority agreement"); ids(cfg.limits, "authority limit"); ids(cfg.programs, "program");
  (cfg.tenants || []).forEach(t => { T[t.id] = t; if (DD_TENANT_TYPES.indexOf(t.type) === -1) errs.push("Tenant " + t.id + ": the type must be one of " + DD_TENANT_TYPES.join(", ") + "."); if (!String(t.name || "").trim()) errs.push("Tenant " + t.id + " has no name."); });
  if ((cfg.agreements || []).length && !T[DD_HOME]) errs.push("The home tenant " + DD_HOME + " must be one of the tenants.");
  (cfg.agreements || []).forEach(a => { A[a.id] = a; });
  (cfg.agreements || []).forEach(a => {
    const w = "Agreement " + a.id;
    if (!T[a.principal]) errs.push(w + ": the principal " + a.principal + " is not a tenant.");
    if (!T[a.distributor]) errs.push(w + ": the distributor " + a.distributor + " is not a tenant.");
    if (a.principal && a.principal === a.distributor) errs.push(w + ": a company cannot distribute for itself.");
    if (DD_AGREEMENT_TYPES.indexOf(a.type) === -1) errs.push(w + ": the type must be one of " + DD_AGREEMENT_TYPES.join(", ") + ".");
    dateErr(a, w);
    if (a.parentId) {
      const p = A[a.parentId];
      if (!p) errs.push(w + ": the parent " + a.parentId + " does not exist.");
      else {
        if (p.distributor !== a.principal) errs.push(w + ": its principal must be the parent's distributor (" + p.distributor + "), which is how the chain continues.");
        if ((p.from && a.from && a.from < p.from) || (p.to && (!a.to || a.to > p.to))) errs.push(w + ": its dates must lie within its parent's (" + p.from + " to " + (p.to || "open") + ").");
      }
      let n = a, hops = 0; while (n && n.parentId && hops++ < 50) { if (n.parentId === a.id) { errs.push(w + ": the chain loops back on itself."); break; } n = A[n.parentId]; }
    } else if (T[a.principal] && T[a.principal].type !== "carrier") errs.push(w + ": the top of a chain is a carrier's agreement; " + a.principal + " is a " + T[a.principal].type + ". Give it a parent.");
  });
  (cfg.baas || []).forEach(b => {
    B[b.id] = b; const w = "Binding authority " + b.id, a = A[b.agreementId];
    if (!a) errs.push(w + ": the agreement " + b.agreementId + " does not exist.");
    else { dateErr(b, w); if ((a.from && b.from && b.from < a.from) || (a.to && (!b.to || b.to > a.to))) errs.push(w + ": its dates must lie within the agreement's (" + a.from + " to " + (a.to || "open") + ")."); }
    ["canQuote", "canBind", "canIssue", "canEndorse", "canCancel"].forEach(k => { if (typeof b[k] !== "boolean") errs.push(w + ": say whether " + k + " is allowed (true or false)."); });
    if (["none", "report", "settle_to_limit"].indexOf(b.claimsAuthority) === -1) errs.push(w + ": claims authority must be none, report or settle_to_limit.");
  });
  const limScope = l => [l.baaId, l.lob || "*", l.state || "*", l.classCode || "*", l.coverage || "*", l.limitType].join("|");
  (cfg.limits || []).forEach(l => {
    const w = "Limit " + l.id;
    if (!B[l.baaId]) errs.push(w + ": the binding authority " + l.baaId + " does not exist.");
    if (!DD_LIMIT_TYPES[l.limitType]) errs.push(w + ": the limit type must be one of " + Object.keys(DD_LIMIT_TYPES).join(", ") + ".");
    if (l.amount === "" || l.amount === null || l.amount === undefined || !(Number(l.amount) >= 0)) errs.push(w + ": the amount must be a number from 0.");
    if (["refer", "decline"].indexOf(l.breachAction) === -1) errs.push(w + ": the action on a breach must be refer or decline.");
    dateErr(l, w);
    const b = B[l.baaId]; if (b && l.from && ((b.from && l.from < b.from) || (b.to && l.to && l.to > b.to))) errs.push(w + ": its dates must lie within the binding authority's.");
  });
  const L = cfg.limits || [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (limScope(L[i]) === limScope(L[j]) && ddOverlap(L[i], L[j])) errs.push("Limits " + L[i].id + " and " + L[j].id + " overlap (same authority, scope and type, same period).");
  (cfg.programs || []).forEach(p => {
    const w = "Program " + p.id, cap = p.capacity || [];
    if (!cap.length) { errs.push(w + " has no capacity."); return; }
    const total = cap.reduce((s, c) => s + (Number(c.pct) || 0), 0);
    if (Math.abs(total - 100) > 0.0001) errs.push(w + ": the shares add to " + total + "%, not 100%.");
    if (cap.filter(c => c.lead).length !== 1) errs.push(w + ": exactly one carrier is the lead.");
    cap.forEach(c => {
      const t = T[c.carrier], b = B[c.baaId];
      if (!t || t.type !== "carrier") errs.push(w + ": " + c.carrier + " is not a carrier tenant.");
      if (!b) errs.push(w + ": the binding authority " + c.baaId + " does not exist.");
      else if (A[b.agreementId] && A[b.agreementId].principal !== c.carrier) errs.push(w + ": " + c.baaId + " is not " + c.carrier + "'s binding authority.");
      if (c.fronting && !String(c.frontingRef || "").trim()) errs.push(w + ": a fronting share names its reinsurance or fronting contract.");
      if (!(Number(c.pct) > 0 && Number(c.pct) <= 100)) errs.push(w + ": a share is more than 0 and at most 100%.");
    });
  });
  return errs;
}

function ddNeedCfgEdit() { if (!hasPermission("rateConfig", "edit")) { denyPermission("rateConfig", "edit"); return false; } return true; }
/** Proposes loading these tenants, agreements, authorities, limits and programs, citing the contract. Nothing changes until someone else approves. */
function ddPropose(cfg, contractRef, note) {
  if (!ddNeedCfgEdit()) return { ok: false, error: "permission" };
  contractRef = String(contractRef || "").trim();
  if (contractRef.length < 3) return { ok: false, error: "contract" };
  const c = Object.assign(ddEmpty(), ddClone(cfg || {})), errs = ddValidate(c);
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  DD_PENDING = { cfg: c, contractRef: contractRef, note: String(note || "").trim(), proposedBy: ddActor(), proposedByKey: ddActorKey(), proposedAt: ddNow() };
  ddHistoryAdd("proposed", "Proposed " + c.agreements.length + " agreement(s), " + c.baas.length + " binding authority(ies) and " + c.limits.length + " limit(s) citing " + contractRef + ".");
  ddSaveStore();
  return { ok: true };
}
function ddApprove() {
  const p = DD_PENDING; if (!p) return { ok: false, error: "none" };
  if (!hasPermission("rateConfig", "approve")) { denyPermission("rateConfig", "approve"); return { ok: false, error: "permission" }; }
  if (p.proposedByKey === ddActorKey()) return { ok: false, error: "self" };
  const errs = ddValidate(p.cfg); if (errs.length) return { ok: false, error: "invalid", errors: errs };
  DD_CFG = p.cfg; DD_META = { source: "contract", contractRef: p.contractRef, approvedBy: ddActor(), approvedAt: ddNow() };
  ddHistoryAdd("approved", "Approved the proposal by " + p.proposedBy + " citing " + p.contractRef + ".");
  DD_PENDING = null; ddSaveStore();
  return { ok: true };
}
function ddReject() {
  const p = DD_PENDING; if (!p) return { ok: false, error: "none" };
  const own = p.proposedByKey === ddActorKey();
  if (!own && !hasPermission("rateConfig", "approve")) { denyPermission("rateConfig", "approve"); return { ok: false, error: "permission" }; }
  ddHistoryAdd("rejected", "The proposal by " + p.proposedBy + " citing " + p.contractRef + " was " + (own ? "withdrawn" : "rejected") + ".");
  DD_PENDING = null; ddSaveStore();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 2. WHOSE CASE, AND WHO MAY SEE IT
// ----------------------------------------------------------------------------
/** The tenant whose workbench holds the case: the home company unless the case says otherwise. */
function ddOwner(sub) { return (sub && sub.tenantId) || DD_HOME; }
function ddTenantOfProducer(name) { return DD_CFG.tenants.find(t => (t.producerNames || []).some(n => typeof comSameBroker === "function" ? comSameBroker(n, name) : String(n).toLowerCase() === String(name || "").toLowerCase())) || null; }

/**
 * The agreement chain a case sits in, from the agreement of the company that placed it up to the carrier, and the binding authority
 * that applies. { applies:false } when no agreement is loaded for the case's producer, so existing cases are not touched.
 */
function ddResolve(sub, date) {
  const d = date || ddToday();
  if (!sub || !ddLoaded()) return { applies: false };
  let start = sub.agreementId ? dd.agreement(sub.agreementId) : null;
  if (!start) {
    const prod = sub.channelType === "direct" ? null : ddTenantOfProducer(sub.broker);
    if (prod) { const cands = DD_CFG.agreements.filter(a => a.distributor === prod.id).sort((x, y) => (y.from || "").localeCompare(x.from || "")); start = cands.find(a => ddInForce(a, d)) || cands[0] || null; }
  }
  if (!start) return { applies: false };
  const chain = [], seen = {}; let n = start;
  while (n && !seen[n.id]) { chain.push(n); seen[n.id] = true; n = n.parentId ? dd.agreement(n.parentId) : null; }
  const root = chain[chain.length - 1], carrier = dd.tenant(root.principal), problems = [];
  chain.forEach(a => { if (!ddInForce(a, d)) problems.push("Agreement " + a.id + " (" + (a.number || a.type) + ") is not in force on " + d + " (" + (a.from || "?") + " to " + (a.to || "open") + ").");  });
  if (!carrier || carrier.type !== "carrier") problems.push("The chain does not lead to a carrier.");
  const bs = DD_CFG.baas.filter(b => b.agreementId === root.id && ddInForce(b, d)), baa = bs.sort((x, y) => (y.yearOfAccount || 0) - (x.yearOfAccount || 0))[0] || null;
  if (!baa) problems.push("No binding authority agreement is in force under " + root.id + " on " + d + ".");
  const mga = dd.tenant(root.distributor);
  if (sub.carrier && carrier && carrier.name && String(sub.carrier).toLowerCase() !== String(carrier.name).toLowerCase()) problems.push("The case names the carrier " + sub.carrier + ", but its agreement chain leads to " + carrier.name + ".");
  return { applies: true, chain: chain, root: root, carrier: carrier, mga: mga, baa: baa, problems: problems };
}

const ddIssued = sub => !!(sub.quoteIssued || (sub.pasSync && sub.pasSync.status === "success"));
/** Tenants other than the owner that may see a case: the producers below it in the chain, the carrier above once it is quoted or bound, and explicit shares. */
function ddSharedTenants(sub, date) {
  const d = date || ddToday(), out = {};
  const r = ddResolve(sub, d);
  if (r.applies) {
    r.chain.forEach(a => { out[a.distributor] = "agreement " + a.id; });
    if (r.carrier && ddIssued(sub)) out[r.carrier.id] = "agreement " + r.root.id;
  }
  DD_CFG.shares.forEach(s => { if (s.entityId === sub.id && ddInForce(s, d)) out[s.granteeTenantId] = "share " + s.id; });
  delete out[ddOwner(sub)];
  return out;
}
/** A tenant sees a case it owns, or one shared with it through the chain or a share. Never otherwise. */
function ddTenantCanSee(tenantId, sub, date) { return !sub || !tenantId || ddOwner(sub) === tenantId || !!ddSharedTenants(sub, date)[tenantId]; }

// ----------------------------------------------------------------------------
// 3. WHAT THE AGREEMENT ALLOWS
// ----------------------------------------------------------------------------
function ddParseMoney(v) { const m = /-?[\d,]+(?:\.\d+)?/.exec(String(v === null || v === undefined ? "" : v).replace(/\s/g, "")); const n = m ? parseFloat(m[0].replace(/,/g, "")) : NaN; return isNaN(n) ? null : n; }
function ddTivOf(sub) {
  if (typeof buildSov === "function") { try { const s = buildSov(sub); if (s && s.rows) { const t = s.rows.reduce((a, r) => a + (typeof r.tiv === "number" ? r.tiv : 0), 0); if (t > 0) return t; } } catch (e) { /* no SOV */ } }
  return null;
}
function ddMeasures(sub) {
  const m = typeof authMeasures === "function" ? authMeasures(sub) : { premium: 0, limit: Number(sub.exposureVal) || 0, lob: sub.lobKey, state: null };
  return { premium: m.premium, policy_limit: m.limit, tiv: ddTivOf(sub), lob: m.lob || sub.lobKey || "", state: m.state, classCode: sub.classCode || null };
}
/** The limit row that applies to a measure: the most specific match for line, state, class and coverage, in force that day. */
function ddLimitFor(baaId, limitType, m, d, coverageKey) {
  let best = null, score = -1;
  DD_CFG.limits.forEach(l => {
    if (l.baaId !== baaId || l.limitType !== limitType || !ddInForce(l, d)) return;
    if (l.lob && l.lob !== "*" && l.lob !== m.lob) return;
    if (l.state && l.state !== "*" && l.state !== m.state) return;
    if (l.classCode && l.classCode !== "*" && l.classCode !== m.classCode) return;
    if (l.coverage && l.coverage !== "*" && l.coverage !== coverageKey) return;
    const s = (l.coverage && l.coverage !== "*" ? 8 : 0) + (l.classCode && l.classCode !== "*" ? 4 : 0) + (l.state && l.state !== "*" ? 2 : 0) + (l.lob && l.lob !== "*" ? 1 : 0);
    if (s > score) { best = l; score = s; }
  });
  return best;
}

/**
 * What the agreement says about a case for an action (quote, bind, issue, endorse, cancel): is the action allowed, is any agreement
 * out of force, and for each limit type the value tested, the limit row and the result. Pure: it reads the case and writes nothing.
 */
function ddAuthorityCheck(sub, action, date) {
  const d = date || ddToday(), r = ddResolve(sub, d);
  if (!r.applies) return { applies: false };
  const m = ddMeasures(sub), reasons = [], checks = [];
  const flag = DD_ACTIONS[action];
  const allowed = !!(r.baa && flag && r.baa[flag[0]]);
  if (r.baa && flag && !allowed) reasons.push("The binding authority " + r.baa.number + " does not let " + (r.mga ? r.mga.name : "the MGA") + " " + flag[1] + " on " + (r.carrier ? r.carrier.name : "the carrier") + "'s paper.");
  r.problems.forEach(p => reasons.push(p));
  let exceeded = false, hardStop = false;
  if (r.baa) ["premium", "policy_limit", "tiv"].forEach(t => {
    const val = m[t]; if (val === null || val === undefined) return;
    const row = ddLimitFor(r.baa.id, t, m, d, null); if (!row) return;
    const over = Number(val) > Number(row.amount);
    checks.push({ limitType: t, measure: DD_LIMIT_TYPES[t], checkedValue: Number(val), limitValue: Number(row.amount), limitId: row.id, currency: row.currency || r.baa.currency || "USD", breachAction: row.breachAction, result: over ? "exceeded" : "within_authority" });
    if (over) { exceeded = true; if (row.breachAction === "decline") hardStop = true; reasons.push(DD_LIMIT_TYPES[t] + " " + ddMoney(val) + " is above the " + ddMoney(row.amount) + " limit in " + row.id + " (" + (row.breachAction === "decline" ? "decline" : "refer to the carrier") + ")."); }
  });
  // limits on a single coverage
  (sub.coverageRows || []).forEach(c => {
    const key = String(c.line || "").toLowerCase().replace(/[^a-z0-9]/g, ""), val = ddParseMoney(c.limit); if (val === null || !r.baa) return;
    const row = ddLimitFor(r.baa.id, "policy_limit", m, d, key); if (!row || !row.coverage || row.coverage === "*") return;
    const over = val > Number(row.amount);
    checks.push({ limitType: "policy_limit", measure: "Policy limit, " + c.line, checkedValue: val, limitValue: Number(row.amount), limitId: row.id, currency: row.currency || "USD", breachAction: row.breachAction, result: over ? "exceeded" : "within_authority" });
    if (over) { exceeded = true; if (row.breachAction === "decline") hardStop = true; reasons.push(c.line + " limit " + ddMoney(val) + " is above the " + ddMoney(row.amount) + " limit in " + row.id + "."); }
  });
  // what stops the action outright, as opposed to what needs the carrier's approval
  const stops = [];
  if (r.baa && flag && !allowed) stops.push(reasons[0]);
  r.problems.forEach(p => stops.push(p));
  checks.filter(c => c.result === "exceeded" && c.breachAction === "decline").forEach(c => stops.push(c.measure + " " + ddMoney(c.checkedValue) + " is above the " + ddMoney(c.limitValue) + " limit and the agreement says decline."));
  return { applies: true, action: action, resolved: r, allowed: allowed, reasons: reasons, checks: checks, exceeded: exceeded, hardStop: hardStop, stops: stops, ok: reasons.length === 0, needsCarrier: exceeded && !hardStop };
}

/** The checks are kept on the case, one row per limit tested, for the audit. */
function ddRecordChecks(sub, ck, subjectType) {
  if (!ck.applies) return;
  if (!sub.authorityChecks) sub.authorityChecks = [];
  const mk = (c, res, measure, cv, lv) => sub.authorityChecks.push({ id: "BAC-" + (sub.authorityChecks.length + 1), subjectType: subjectType, action: ck.action, authoritySourceType: "authority_limit", baaId: ck.resolved.baa ? ck.resolved.baa.id : null, limitId: c ? c.limitId : null, measure: measure, checkedValue: cv, limitValue: lv, currency: c ? c.currency : "USD", result: res, checkedBy: ddActor(), checkedAt: ddNow() });
  if (!ck.allowed && ck.resolved.baa) mk(null, "exceeded", "permission: " + ck.action, null, null);
  ck.checks.forEach(c => mk(c, c.result, c.limitType, c.checkedValue, c.limitValue));
  if (sub.authorityChecks.length > 100) sub.authorityChecks = sub.authorityChecks.slice(-100);
}

/** Capacity from a program's carriers for a case: how its limit splits. */
function ddProgramShares(sub) {
  const p = DD_CFG.programs.find(x => String(x.name || "").toLowerCase() === String(sub.program || "").toLowerCase()); if (!p) return null;
  const lim = Number(sub.exposureVal) || 0;
  return { program: p, shares: p.capacity.map(c => ({ carrier: (dd.tenant(c.carrier) || {}).name || c.carrier, pct: Number(c.pct), lead: !!c.lead, fronting: !!c.fronting, limit: lim * Number(c.pct) / 100 })) };
}

// ----------------------------------------------------------------------------
// 4. ENFORCEMENT
// ----------------------------------------------------------------------------
// who may see a case: the persona's own scope AND its tenant
var _ddOrigCanSee = window.extCanSee;
if (typeof _ddOrigCanSee === "function") {
  window.extCanSee = function (roleKey, sub) {
    const base = _ddOrigCanSee.apply(this, arguments);
    if (!base) return false;
    const r = typeof EXTERNAL_ROLES !== "undefined" ? EXTERNAL_ROLES[roleKey] : null;
    return !(r && r.tenantId && !ddTenantCanSee(r.tenantId, sub));
  };
}

// the carrier layer in authority.js also reads the agreement: a limit marked refer needs the carrier's approval
var _ddOrigCarrier = window.authCarrierCheck;
if (typeof _ddOrigCarrier === "function") {
  window.authCarrierCheck = function (sub, m, dataset, today) {
    const base = _ddOrigCarrier.apply(this, arguments), ck = ddAuthorityCheck(sub, "bind", today);
    if (!ck.applies) return base;
    const own = typeof CARRIER_AUTHORITY !== "undefined" && base.carrier && CARRIER_AUTHORITY[base.carrier];
    const reasons = (own ? base.reasons : []).concat(ck.reasons);
    return { carrier: ck.resolved.carrier ? ck.resolved.carrier.name : base.carrier, ok: reasons.length === 0, reasons: reasons, agreement: ck.resolved.baa ? ck.resolved.baa.number : (ck.resolved.root.number || ck.resolved.root.id) };
  };
}

function ddGuard(action, subjectType, label) {
  return args => {
    const sub = action === "quote" ? ddActiveSub() : (SUBMISSIONS_DATASET.find(s => s.id === args[0]) || ddActiveSub());
    if (!sub) return true;
    const ck = ddAuthorityCheck(sub, action);
    if (!ck.applies) return true;
    ddRecordChecks(sub, ck, subjectType);
    if (ck.stops.length) {
      ddLog(sub, "dd_" + action + "_blocked", label + " refused by the agreement: " + ck.stops.join(" "));
      showToast("⛔ " + label + " refused (binding authority): " + ck.stops[0], "danger");
      if (typeof persistAppState === "function") persistAppState();
      return false;
    }
    return true;
  };
}
if (typeof registerGuard === "function") {
  registerGuard("issueQuote", "binding authority agreement", ddGuard("quote", "quote", "Issuing the quote"));
  registerGuard("eSign", "binding authority agreement", ddGuard("quote", "quote", "Opening the e-signature step"));
  registerGuard("bind", "binding authority agreement", args => ddGuard("bind", "bind_request", "The bind")(args) && ddGuard("issue", "bind_request", "Issuing the policy")(args));
}
// endorsing and cancelling are what the agreement may restrict too
["pcIssueEndorsement:endorse:Endorsing the policy", "pcSubmitCancellation:cancel:Cancelling the policy"].forEach(spec => {
  const [fn, action, label] = spec.split(":"), orig = window[fn];
  if (typeof orig !== "function") return;
  window[fn] = function () {
    const sub = ddActiveSub();
    if (sub && ddLoaded()) {
      const ck = ddAuthorityCheck(sub, action);
      if (ck.applies) {
        ddRecordChecks(sub, ck, "policy_transaction");
        if (ck.stops.length) { ddLog(sub, "dd_" + action + "_blocked", label + " refused by the agreement: " + ck.stops.join(" ")); showToast("⛔ " + label + " refused (binding authority): " + ck.stops[0], "danger"); if (typeof persistAppState === "function") persistAppState(); return; }
      }
    }
    return orig.apply(this, arguments);
  };
});

// ----------------------------------------------------------------------------
// 5. SCREEN: ON THE AUTHORITY PAGE
// ----------------------------------------------------------------------------
function ddTenantLabel(id) { const t = dd.tenant(id); return t ? t.name + " (" + t.type + ")" : id; }
function ddCaseHtml(sub) {
  const r = ddResolve(sub);
  if (!ddLoaded()) return '<div class="alert alert-warning ws-small"><i class="ph ph-plug"></i> <strong>No agreements are loaded.</strong> Binding authority is not checked against an agreement. Load the carrier, MGA and producer agreements below, citing the contract.</div>';
  if (!r.applies) return '<p class="ws-small text-muted">No agreement is loaded for this case\'s producer (' + ddEsc(sub.broker || "none") + '), so binding authority is not checked against one.</p>';
  const chain = r.chain.slice().reverse().map(a => `<span class="badge badge-light">${ddEsc(ddTenantLabel(a.principal))}</span> &rarr; <span class="badge badge-light">${ddEsc(ddTenantLabel(a.distributor))}</span> <span class="text-xs text-muted">${ddEsc(a.id)}, ${ddEsc(a.type)}, ${ddEsc(a.from)} to ${ddEsc(a.to || "open")}</span>`).join("<br>");
  const acts = r.baa ? Object.keys(DD_ACTIONS).map(k => `<span class="badge ${r.baa[DD_ACTIONS[k][0]] ? "badge-success" : "badge-danger"}">${r.baa[DD_ACTIONS[k][0]] ? "May" : "May not"} ${DD_ACTIONS[k][1]}</span>`).join(" ") : "";
  const ck = ddAuthorityCheck(sub, "bind");
  const rows = ck.checks.map(c => `<tr><td>${ddEsc(c.measure)}</td><td>${ddMoney(c.checkedValue)}</td><td>${ddMoney(c.limitValue)} <span class="text-xs text-muted">${ddEsc(c.limitId)}</span></td><td>${c.result === "within_authority" ? '<span class="badge badge-success">Within authority</span>' : '<span class="badge ' + (c.breachAction === "decline" ? "badge-danger" : "badge-warning") + '">Exceeded: ' + (c.breachAction === "decline" ? "decline" : "refer to the carrier") + "</span>"}</td></tr>`).join("");
  const ps = ddProgramShares(sub);
  return `<div class="ws-small"><strong>Chain</strong><div style="margin:4px 0 8px;">${chain}</div>
    ${r.baa ? `<strong>Binding authority ${ddEsc(r.baa.number)}</strong> (year of account ${ddEsc(r.baa.yearOfAccount)}): ${acts} <span class="text-xs text-muted">claims: ${ddEsc(r.baa.claimsAuthority)}</span>` : ""}
    ${r.problems.length ? `<div class="alert alert-danger ws-small" style="margin:6px 0;">${r.problems.map(ddEsc).join("<br>")}</div>` : ""}
    ${rows ? `<table class="data-table" style="margin-top:6px;"><thead><tr><th>Limit tested</th><th>This case</th><th>Limit</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="text-muted" style="margin:6px 0;">No limit row applies to this case\'s line and state.</p>'}
    ${ps ? `<div style="margin-top:6px;"><strong>Program ${ddEsc(ps.program.name)}</strong>: ${ps.shares.map(s => ddEsc(s.carrier) + " " + s.pct + "%" + (s.lead ? " (lead)" : "") + (s.fronting ? " (fronting)" : "") + " " + ddMoney(s.limit)).join("; ")}</div>` : ""}
    <div class="text-xs text-muted" style="margin-top:6px;">Owned by ${ddEsc(ddTenantLabel(ddOwner(sub)))}. Visible also to: ${ddEsc(Object.keys(ddSharedTenants(sub)).map(ddTenantLabel).join("; ") || "no one else")}.</div></div>`;
}
function ddEditorHtml() {
  const canEdit = hasPermission("rateConfig", "edit"), canApprove = hasPermission("rateConfig", "approve"), p = DD_PENDING;
  let h = "";
  if (DD_META.source === "contract") h += `<div class="text-xs text-muted">In force from ${ddEsc(DD_META.contractRef)}, approved by ${ddEsc(DD_META.approvedBy)} on ${ddEsc(DD_META.approvedAt)}: ${DD_CFG.tenants.length} tenant(s), ${DD_CFG.agreements.length} agreement(s), ${DD_CFG.baas.length} binding authority(ies), ${DD_CFG.limits.length} limit(s), ${DD_CFG.programs.length} program(s).</div>`;
  if (p) {
    const mine = p.proposedByKey === ddActorKey();
    h += `<div class="alert alert-warning ws-small" style="margin:8px 0;"><strong>Proposal waiting</strong> by ${ddEsc(p.proposedBy)} on ${ddEsc(p.proposedAt)}, citing <strong>${ddEsc(p.contractRef)}</strong>: ${p.cfg.tenants.length} tenant(s), ${p.cfg.agreements.length} agreement(s), ${p.cfg.baas.length} binding authority(ies), ${p.cfg.limits.length} limit(s). The agreements in force stay as they are until it is approved.
      <div style="margin-top:6px;">${mine ? '<span class="text-muted">You proposed this; a different approver must decide it.</span> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="ddUiReject()">Withdraw</button>' : (canApprove ? '<button class="btn btn-xs btn-primary" style="width:auto;" onclick="ddUiApprove()">Approve</button> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="ddUiReject()">Reject</button>' : '<span class="text-muted">You cannot approve this.</span>')}</div></div>`;
  }
  if (canEdit) h += `<details style="margin-top:6px;"><summary class="ws-small">Load agreements and binding authority from the contracts (JSON)</summary>
    <textarea id="dd_json" class="form-control" rows="5" placeholder='{"tenants":[...],"agreements":[...],"baas":[...],"limits":[...],"programs":[...]}'></textarea>
    <div style="display:flex;gap:6px;margin-top:4px;"><input id="dd_ref" class="form-control form-control-sm" style="width:300px;" placeholder="Contract reference (required)" value="${p ? ddEsc(p.contractRef) : ""}"><button class="btn btn-sm btn-warning" style="width:auto;" onclick="ddUiPropose()">Propose</button></div></details>`;
  if (DD_HISTORY.length) h += `<div class="text-xs text-muted" style="margin-top:6px;">History: ${DD_HISTORY.slice(-3).reverse().map(x => ddEsc(x.at + " " + x.text)).join("; ")}</div>`;
  return h;
}
function ddUiToast(r, ok) {
  if (r.ok) { showToast(ok, "success"); return; }
  if (r.error === "contract") showToast("Cite the contract (at least 3 characters).", "warning");
  else if (r.error === "invalid") showToast(r.errors[0] + (r.errors.length > 1 ? " (+" + (r.errors.length - 1) + " more)" : ""), "danger");
  else if (r.error === "self") showToast("You proposed this; a different approver must decide it.", "danger");
  else if (r.error === "none") showToast("There is no proposal.", "info");
}
function ddUiRefresh() { const s = ddActiveSub(); if (s && typeof renderAuthorityCard === "function") renderAuthorityCard(s); }
function ddUiPropose() {
  const e = document.getElementById("dd_json"), ref = document.getElementById("dd_ref"); let cfg;
  try { cfg = JSON.parse(e ? e.value : ""); } catch (x) { showToast("That is not valid JSON.", "danger"); return; }
  ddUiToast(ddPropose(cfg, ref ? ref.value : "", "Loaded from the contracts"), "Proposed. It takes effect when a different approver approves it.");
  ddUiRefresh();
}
function ddUiApprove() { ddUiToast(ddApprove(), "The agreements are in force."); ddUiRefresh(); }
function ddUiReject() { const r = ddReject(); if (r.ok) showToast("The proposal is closed.", "info"); else ddUiToast(r, ""); ddUiRefresh(); }

var _ddOrigAuthCard = window.renderAuthorityCard;
if (typeof _ddOrigAuthCard === "function") {
  window.renderAuthorityCard = function (sub) {
    const r = _ddOrigAuthCard.apply(this, arguments);
    try {
      const box = document.getElementById("authorityContainer");
      if (box && sub) {
        const old = box.querySelector(".dd-block"); if (old) old.remove();
        const div = document.createElement("div"); div.className = "dd-block"; div.style.marginTop = "10px";
        div.innerHTML = `<div class="uwp-subsection-title">Agreements and binding authority for this case</div>${ddCaseHtml(sub)}${ddEditorHtml()}`;
        box.appendChild(div);
      }
    } catch (e) { console.warn("Distribution block failed:", e); }
    return r;
  };
}

(function installDdAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  const m = (label, icon, badge, outcome) => ({ label: label, icon: icon, badge: badge, outcome: outcome });
  ["quote", "bind", "issue", "endorse", "cancel"].forEach(a => { AUDIT_ACTION_META["dd_" + a + "_blocked"] = m("Refused by the Binding Authority (" + a + ")", "ph-prohibit", "badge-danger", "outcome-decline"); });
})();

Object.assign(window, { ddValidate, ddPropose, ddApprove, ddReject, ddReset, ddLoaded, ddOwner, ddResolve, ddSharedTenants, ddTenantCanSee, ddAuthorityCheck, ddLimitFor, ddProgramShares, ddRecordChecks, ddUiPropose, ddUiApprove, ddUiReject, ddOverlap });
