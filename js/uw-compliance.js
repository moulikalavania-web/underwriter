/**
 * ============================================================================
 * COMPLIANCE REQUIREMENTS, PRODUCT FILINGS AND THE NOTICES THEY GOVERN
 * ----------------------------------------------------------------------------
 *   REQUIREMENT  a configurable check by state, line and admitted status, with an enforcement (block or warn), one type each:
 *                  license_check          the producer is licensed and appointed (the licensing check that already exists)
 *                  filing_approved        the product version has the approved rate, rule and form filings for the state and date
 *                  diligent_search        a surplus lines risk has the declinations the state needs (the surplus lines record)
 *                  cancel_notice          a cancellation gives the notice days the state needs, and its notice was delivered
 *                  adverse_action_notice  how many reasons a notice may give and how soon it is due
 *                Its settings (rule_json) are checked against the type. A requirement is proposed by one person and put in force by
 *                a different one, and is versioned. The register starts empty: no state rule is built in.
 *   CHECK        each run at bind (or on a policy transaction) writes a row per requirement: pass, fail, waived or not applicable, with
 *                the evidence. A failed requirement that blocks stops the bind. A waiver is a person's decision with a reason.
 *   FILING       the carrier's rate, rule and form filings: type, SERFF and state file numbers, status history (submitted, objection,
 *                approved, withdrawn, disapproved), approval and effective dates. filingCanSell() answers "can this product version be
 *                sold in this state on this date with these rates and forms?".
 *   NOTICES      the adverse-action notices (js/adverse-notices.js) gain the triggers surcharge, tier change, non-renewal and cancellation
 *                (each tied to the one record that caused it); a reason limit and a due date from the state requirement; ranked reasons;
 *                and a delivery record per recipient with its proof.
 * ============================================================================
 */

const CQ_KEY = "FUT_UW_COMPLIANCE_V1";
const CQ_TYPES = { license_check: "Producer licence and appointment", filing_approved: "Product filings approved", diligent_search: "Diligent search (surplus lines)", cancel_notice: "Cancellation notice", adverse_action_notice: "Adverse-action notice rules", party_screening: "Party screening (KYC, KYB, PEP, adverse media)" };
const CQ_ADMITTED = { any: "Any placement", admitted: "Admitted only", surplus_lines: "Surplus lines only" };
const CQ_RESULTS = { pass: "Pass", fail: "Fail", waived: "Waived", not_applicable: "Not applicable" };
const FIL_TYPES = { rate: "Rate", rule: "Rule", form: "Form", combined: "Combined (rate, rule and form)" };
const FIL_STATUSES = { draft: "Draft", submitted: "Submitted", objection: "Objection", approved: "Approved", withdrawn: "Withdrawn", disapproved: "Disapproved" };
const NOTICE_TRIGGERS = { declination: "decline", adverse_terms: "less_favorable_terms", surcharge: "surcharge", tier_change: "tier_change", nonrenewal: "nonrenewal", cancellation: "cancellation" };
var CQ = { reqs: [], filings: [], seq: 0 };
try { const r = JSON.parse(localStorage.getItem(CQ_KEY)); if (r && Array.isArray(r.reqs)) CQ = Object.assign(CQ, r); } catch (e) { /* none yet */ }
function cqSave() { try { localStorage.setItem(CQ_KEY, JSON.stringify(CQ)); } catch (e) { /* keep for this session */ } }
function cqNew(p) { return p + "-" + (++CQ.seq); }
const isInt = (v, min) => v !== "" && v !== null && v !== undefined && Number.isInteger(Number(v)) && Number(v) >= min;

// ----------------------------------------------------------------------------
// 1. THE REQUIREMENT REGISTER
// ----------------------------------------------------------------------------
/** Everything wrong with a requirement's settings for its type, as sentences. */
function cqValidateRule(type, rule) {
  const e = [], r = rule || {};
  if (type === "adverse_action_notice") {
    if (r.max_reason_count !== undefined && r.max_reason_count !== "" && !isInt(r.max_reason_count, 1)) e.push("the most reasons is a whole number of 1 or more (leave it empty for no limit)");
    if (r.notice_due_days !== undefined && r.notice_due_days !== "" && !isInt(r.notice_due_days, 0)) e.push("the days to send the notice is a whole number from 0");
  } else if (type === "cancel_notice") {
    if (!isInt(r.notice_days, 0)) e.push("enter the notice days (a whole number from 0)");
  } else if (type === "filing_approved") {
    const k = r.kinds; if (k !== undefined && (!Array.isArray(k) || !k.length || k.some(x => ["rate", "rule", "form"].indexOf(x) < 0))) e.push("the filings required are rate, rule or form");
  } else if (type === "party_screening") {
    if (["kyc", "kyb", "pep", "adverse_media"].indexOf(r.screening) < 0) e.push("choose the screening: kyc, kyb, pep or adverse_media");
    if (!isInt(r.validity_days, 1)) e.push("enter how many days a result is good for (a whole number of 1 or more)");
  } else if (type === "diligent_search" || type === "license_check") { /* the settings are in the surplus lines record and the licensing register */ }
  else e.push("choose the type");
  return e;
}
function cqValidate(q) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(q.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (!CQ_TYPES[q.type]) e.push("choose the type"); else cqValidateRule(q.type, q.rule).forEach(x => e.push(x));
  if (!CQ_ADMITTED[q.admittedStatus]) e.push("choose the placement it applies to");
  if (["block", "warn"].indexOf(q.enforcement) < 0) e.push("choose block or warn");
  if (q.state !== "*" && !(Array.isArray(q.state) && q.state.length && q.state.every(s => US_STATE_CODES_FOR_PRODUCER.indexOf(s) > -1))) e.push("states are two-letter codes, or all");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.effectiveFrom || "")) e.push("enter the date it starts");
  return e;
}
function cqAdd(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const q = { id: cqNew("CQ"), code: String(f.code || "").trim(), name: String(f.name || "").trim(), version: 1, type: f.type, state: f.state || "*", lob: f.lob || "*", admittedStatus: f.admittedStatus || "any", enforcement: f.enforcement || "block", rule: f.rule || {},
    effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = cqValidate(q);
  if (CQ.reqs.some(x => x.code === q.code)) errs.push("a requirement with this code exists; start a new version of it");
  if (errs.length) { CQ.seq--; return { ok: false, error: "invalid", errors: errs }; }
  CQ.reqs.push(q); cqSave();
  return { ok: true, req: q };
}
function cqAct(id, what) {
  const q = CQ.reqs.find(x => x.id === id); if (!q) return;
  const r = ucAct(CQ.reqs, q, what, cqNew("CQ"));
  if (!r.ok && what === "newver") CQ.seq--;
  if (r.error !== "cancelled") ucToast(r, "Done.");
  cqSave(); ucRender();
}
/** The requirement of a type in force for a state, line and placement. A state or line that is named beats "all". */
function cqFor(type, state, lob, surplus, day) {
  const fit = CQ.reqs.filter(q => q.type === type && q.status === "active" && ucInForce(q.effectiveFrom, q.effectiveTo, day) && ucScopeHas(q.lob, lob) && (q.state === "*" || (state && ucScopeHas(q.state, state)))
    && (q.admittedStatus === "any" || (q.admittedStatus === "surplus_lines") === !!surplus));
  const score = q => (q.state === "*" ? 0 : 2) + (q.lob === "*" ? 0 : 1);
  return fit.sort((a, b) => score(a) - score(b)).slice(-1)[0] || null;
}
function cqSubFacts(sub) { return { state: typeof deriveRiskState === "function" ? deriveRiskState(sub) : null, lob: sub.lobKey || "", surplus: typeof slIsSurplus === "function" ? slIsSurplus(sub) : false, renewal: !!sub.renewalOf }; }

// ----------------------------------------------------------------------------
// 2. FILINGS
// ----------------------------------------------------------------------------
function filValidate(f) {
  const e = [], iso = /^\d{4}-\d{2}-\d{2}$/;
  if (String(f.productId || "").trim().length < 1) e.push("name the product (or * for every product)");
  if (US_STATE_CODES_FOR_PRODUCER.indexOf(f.state) < 0) e.push("choose the state");
  if (!FIL_TYPES[f.filingType]) e.push("choose the filing type");
  if (String(f.serffNo || "").trim().length < 3 && String(f.stateFileNo || "").trim().length < 3) e.push("enter the SERFF tracking number or the state file number");
  if (f.submittedDate && !iso.test(f.submittedDate)) e.push("the submitted date is a date");
  return e;
}
function filAdd(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const x = { id: cqNew("FIL"), productId: String(f.productId || "").trim(), productVersion: String(f.productVersion || "*").trim() || "*", state: f.state, lob: f.lob || "*", filingType: f.filingType, serffNo: String(f.serffNo || "").trim(), stateFileNo: String(f.stateFileNo || "").trim(),
    status: "draft", submittedDate: f.submittedDate || "", approvedDate: "", nbEffective: "", renewalEffective: "", items: String(f.items || "").trim(), events: [], createdBy: ucActor(), createdAt: nowStamp() };
  const errs = filValidate(x);
  if (errs.length) { CQ.seq--; return { ok: false, error: "invalid", errors: errs }; }
  CQ.filings.push(x); cqSave();
  return { ok: true, filing: x };
}
/** Records a status change. An approval needs its date; the effective dates are set with it. History is never edited. */
function filEvent(id, f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const x = CQ.filings.find(z => z.id === id);
  if (!x) return { ok: false, error: "filing" };
  const iso = /^\d{4}-\d{2}-\d{2}$/, e = [];
  if (!FIL_STATUSES[f.status] || f.status === "draft") e.push("choose the new status");
  if (!iso.test(f.date || "")) e.push("enter the date of the event");
  if (f.status === "approved") {
    if (f.nbEffective && !iso.test(f.nbEffective)) e.push("the new-business effective date is a date");
    if (f.renewalEffective && !iso.test(f.renewalEffective)) e.push("the renewal effective date is a date");
  }
  if (["objection", "withdrawn", "disapproved"].indexOf(f.status) > -1 && String(f.notes || "").trim().length < 5) e.push("say what the " + f.status + " was about (at least 5 characters)");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  x.status = f.status; x.events.push({ status: f.status, date: f.date, notes: String(f.notes || "").trim(), by: ucActor(), at: nowStamp() });
  if (f.status === "submitted" && !x.submittedDate) x.submittedDate = f.date;
  if (f.status === "approved") { x.approvedDate = f.date; x.nbEffective = f.nbEffective || f.date; x.renewalEffective = f.renewalEffective || f.nbEffective || f.date; }
  cqSave();
  return { ok: true, filing: x };
}
/** Can this product version be sold in the state on the date with these rates, rules and forms? */
function filingCanSell(o) {
  const day = o.date || todayIso(), kinds = o.kinds && o.kinds.length ? o.kinds : ["rate", "form"], renewal = o.businessType === "renewal";
  const live = CQ.filings.filter(x => x.status === "approved" && x.state === o.state && (x.productId === "*" || x.productId === o.productId) && (x.productVersion === "*" || String(x.productVersion) === String(o.productVersion))
    && ucScopeHas(x.lob, o.lob) && (renewal ? (x.renewalEffective || x.approvedDate) : (x.nbEffective || x.approvedDate)) <= day);
  const missing = kinds.filter(k => !live.some(x => x.filingType === k || x.filingType === "combined"));
  const reasons = missing.map(k => "no approved " + k + " filing for " + o.state + " covers this product on " + day);
  if (!o.productId) reasons.unshift("the case names no product");
  return { ok: !missing.length && !!o.productId, missing: missing, filings: live.map(x => x.id), reasons: reasons };
}

// ----------------------------------------------------------------------------
// 3. CHECKS ON A CASE
// ----------------------------------------------------------------------------
function cqList(sub) { if (!sub.complianceChecks) sub.complianceChecks = []; return sub.complianceChecks; }
function cqLatest(sub, reqId, entityType) { return [].concat(cqList(sub)).reverse().find(c => c.requirementId === reqId && c.entityType === entityType) || null; }
/** One requirement against one case: { result, evidence }. */
function cqEvaluate(sub, q, entityType, ctx) {
  const f = cqSubFacts(sub);
  if (q.type === "license_check") { const c = clearanceChecks(sub).producer; return { result: c.ok ? "pass" : "fail", evidence: { label: c.label || "", detail: c.detail || "" } }; }
  if (q.type === "filing_approved") {
    const pr = typeof rsProductRef === "function" ? rsProductRef() : null;
    const r = filingCanSell({ productId: pr && pr.id, productVersion: pr && pr.version, state: f.state, lob: f.lob, businessType: f.renewal ? "renewal" : "new", kinds: q.rule.kinds });
    return { result: r.ok ? "pass" : "fail", evidence: { product: pr ? pr.id : null, version: pr ? pr.version : null, state: f.state, filings: r.filings, reasons: r.reasons } };
  }
  if (q.type === "diligent_search") {
    if (!f.surplus) return { result: "not_applicable", evidence: { why: "an admitted placement" } };
    const s = slSearchStatus(sub, f.state);
    return { result: s.satisfied ? "pass" : "fail", evidence: { required: s.required, count: s.count, exempt: !!s.exemption } };
  }
  if (q.type === "party_screening") {
    const st = scStatus(sub, q.rule.screening);
    return { result: st.state === "clear" ? "pass" : "fail", evidence: { screening: q.rule.screening, state: st.state, screenedOn: st.record ? st.record.screenedOn : null, expiresOn: st.record ? st.record.expiresOn : null } };
  }
  if (q.type === "cancel_notice") {
    if (entityType !== "policy_transaction") return { result: "not_applicable", evidence: { why: "not a cancellation" } };
    const days = Number(ctx && ctx.noticeDays), need = Number(q.rule.notice_days), delivered = compNoticeDelivered(sub, "cancellation");
    const ok = days >= need && delivered;
    return { result: ok ? "pass" : "fail", evidence: { noticeDays: isNaN(days) ? null : days, required: need, noticeDelivered: delivered } };
  }
  return { result: "not_applicable", evidence: { why: "it governs notices, not this step" } };
}
/** Runs every requirement in force for the case at a checkpoint and keeps a row for each. */
function cqRun(sub, entityType, ctx) {
  const f = cqSubFacts(sub), rows = [];
  CQ.reqs.filter(q => q.status === "active" && ucInForce(q.effectiveFrom, q.effectiveTo) && ucScopeHas(q.lob, f.lob) && (q.state === "*" || (f.state && ucScopeHas(q.state, f.state))) && (q.admittedStatus === "any" || (q.admittedStatus === "surplus_lines") === f.surplus)).forEach(q => {
    const ev = cqEvaluate(sub, q, entityType, ctx), last = cqLatest(sub, q.id, entityType);
    if (ev.result === "fail" && last && last.result === "waived" && last.requirementVersion === q.version) { rows.push(last); return; }   // a waiver stands while the requirement is unchanged
    const row = { id: "CC-" + (cqList(sub).length + 1), requirementId: q.id, requirementCode: q.code, requirementVersion: q.version, type: q.type, enforcement: q.enforcement, entityType: entityType, entityId: (ctx && ctx.entityId) || sub.id, result: ev.result, evidence: ev.evidence, checkedBy: "System (automatic)", checkedAt: nowStamp() };
    cqList(sub).push(row); rows.push(row);
  });
  if (typeof persistAppState === "function") persistAppState();
  return rows;
}
function cqWaive(sub, checkId, reason) {
  if (!hasPermission("authority", "override")) { denyPermission("authority", "override"); return { ok: false, error: "permission" }; }
  const c = cqList(sub).find(x => x.id === checkId);
  if (!c || c.result !== "fail") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  const row = Object.assign({}, c, { id: "CC-" + (cqList(sub).length + 1), result: "waived", waivedBy: ucActor(), waivedAt: nowStamp(), waiverReason: String(reason).trim(), checkedBy: ucActor(), checkedAt: nowStamp() });
  cqList(sub).push(row);
  logDecision(sub, sub.currentStep || 12, "compliance_waived", c.requirementCode + " (" + CQ_TYPES[c.type] + ") waived: " + row.waiverReason);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, check: row };
}
function cqBindGuard(args) {
  const sub = (args && args[0] && SUBMISSIONS_DATASET.find(s => s.id === args[0])) || SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) return true;
  const rows = cqRun(sub, "bind_request", { entityId: sub.id });
  const block = rows.filter(r => r.result === "fail" && r.enforcement === "block"), warn = rows.filter(r => r.result === "fail" && r.enforcement === "warn");
  if (block.length) {
    logDecision(sub, sub.currentStep || 13, "compliance_bind_blocked", "Bind blocked by compliance: " + block.map(b => b.requirementCode + " (" + CQ_TYPES[b.type] + ")").join("; ") + ".");
    showToast("⛔ Bind blocked (compliance): " + block.map(b => CQ_TYPES[b.type]).join("; ") + ".", "danger");
    return false;
  }
  if (warn.length) showToast("Compliance warning: " + warn.map(b => CQ_TYPES[b.type]).join("; ") + ".", "warning");
  return true;
}

// ----------------------------------------------------------------------------
// 4. THE NOTICES
// ----------------------------------------------------------------------------
/** The one record on the case that causes this kind of notice, or null. */
function compTrigger(sub, type) {
  const adj = (sub.pricingAdjustments || []).filter(a => a.status === "applied");
  if (type === "declination") { const d = typeof urLatestDecision === "function" ? urLatestDecision(sub, ["decline", "auto_decline"]) : null; return d ? { type: "uw_decision", id: d.id } : null; }
  if (type === "adverse_terms") { if (adj.length) return { type: "pricing_adjustment", id: adj[adj.length - 1].id }; const d = typeof urLatestDecision === "function" ? urLatestDecision(sub) : null; return d ? { type: "uw_decision", id: d.id } : null; }
  if (type === "surcharge") { const a = adj.filter(x => x.pct > 0); return a.length ? { type: "pricing_adjustment", id: a[a.length - 1].id } : null; }
  if (type === "tier_change") { const a = adj.filter(x => x.type === "schedule_rating" || x.type === "experience_mod"); return a.length ? { type: "pricing_adjustment", id: a[a.length - 1].id } : null; }
  if (type === "nonrenewal") return sub.renewal && sub.renewal.decision === "non_renew" ? { type: "renewal_decision", id: sub.id + "/renewal" } : null;
  if (type === "cancellation") return sub.cancellation && sub.cancellation.transactionId ? { type: "policy_transaction", id: sub.cancellation.transactionId } : null;
  return null;
}
function compNoticeRequirement(sub) { const f = cqSubFacts(sub); return cqFor("adverse_action_notice", f.state, f.lob, f.surplus); }
/** The most key factors a notice may list: the state requirement's limit, or the statutory four when none is registered. */
function compFactorLimit(sub) { const q = compNoticeRequirement(sub), n = q && q.rule && Number(q.rule.max_reason_count); return n >= 1 ? n : 4; }
/** Problems with a notice form that come from the state requirement and the trigger. */
function compNoticeProblems(sub, f) {
  const p = [], q = compNoticeRequirement(sub);
  const max = q && q.rule && q.rule.max_reason_count !== undefined && q.rule.max_reason_count !== "" ? Number(q.rule.max_reason_count) : null;
  if (max && (f.reasons || []).length > max) p.push("this state allows at most " + max + " reason" + (max === 1 ? "" : "s") + " (requirement " + q.code + "); choose the principal ones");
  // The new notice types always need their trigger. A declination or adverse-terms notice needs one once a state requirement is registered (before that, one is attached when the case has it).
  const strict = ["surcharge", "tier_change", "nonrenewal", "cancellation"].indexOf(f.type) > -1 || !!q;
  if (strict && f.type && NOTICE_TRIGGERS[f.type] && !compTrigger(sub, f.type)) p.push("nothing on the case triggers a " + (NOTICE_TYPES[f.type] ? NOTICE_TYPES[f.type].label.toLowerCase() : f.type) + " (" + ({ declination: "a decline decision", adverse_terms: "a pricing adjustment or a decision", surcharge: "an applied debit or surcharge", tier_change: "an applied schedule rating or experience modification", nonrenewal: "a non-renewal decision", cancellation: "a cancellation" }[f.type]) + ")");
  return p;
}
/** What is added to a notice when it is issued: its trigger, the requirement it follows, ranked reasons, a due date and a delivery per recipient. */
function compNoticeIssued(sub, n) {
  const q = compNoticeRequirement(sub), t = compTrigger(sub, n.type);
  n.triggerType = NOTICE_TRIGGERS[n.type] || null; n.trigger = t;
  n.complianceRequirementId = q ? q.id : null; n.complianceRequirementCode = q ? q.code : null;
  n.reasonRanks = (n.reasons || []).map((c, i) => ({ rank: i + 1, code: c }));
  const days = q && q.rule && q.rule.notice_due_days !== undefined && q.rule.notice_due_days !== "" ? Number(q.rule.notice_due_days) : null;
  if (days !== null) {
    const from = (n.type === "declination" && urLatestDecision(sub, ["decline", "auto_decline"]) ? urLatestDecision(sub, ["decline", "auto_decline"]).at : (sub.lifecycleStatusAt ? new Date(sub.lifecycleStatusAt).toISOString() : n.createdAt)) || n.issuedAt;
    const d = new Date(String(from).slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days);
    n.dueDate = d.toISOString().slice(0, 10); n.late = String(n.issuedAt).slice(0, 10) > n.dueDate;
  } else { n.dueDate = null; n.late = false; }
  n.deliveries = ["insured", "producer"].filter(r => n.recipients && n.recipients[r]).map(r => ({ recipient: r, method: n.deliveryMethod, reference: n.deliveryRef, status: "dispatched", dispatchedAt: n.issuedAt, deliveredAt: null, proofRef: "" }));
  n.deliveryStatus = "dispatched";
}
/** A delivery to one recipient is recorded as delivered (with its proof) or failed. The notice is delivered when every recipient is. */
function noticeRecordDelivery(sub, noticeId, recipient, status, proofRef) {
  if (!hasPermission("notices", "edit")) { denyPermission("notices", "edit"); return { ok: false, error: "permission" }; }
  const n = (sub.notices || []).find(x => x.id === noticeId);
  if (!n || n.status !== "issued" || !n.deliveries) return { ok: false, error: "state" };
  const d = n.deliveries.find(x => x.recipient === recipient);
  if (!d) return { ok: false, error: "recipient" };
  if (["delivered", "failed"].indexOf(status) < 0) return { ok: false, error: "status" };
  if (status === "delivered" && String(proofRef || "").trim().length < 3) return { ok: false, error: "proof" };
  d.status = status; d.proofRef = String(proofRef || "").trim(); d.deliveredAt = status === "delivered" ? nowStamp() : null; d.recordedBy = ucActor();
  n.deliveryStatus = n.deliveries.every(x => x.status === "delivered") ? "delivered" : n.deliveries.some(x => x.status === "failed") ? "failed" : "dispatched";
  logDecision(sub, sub.currentStep || 6, "notice_delivery_recorded", n.id + " to the " + recipient + ": " + status + (d.proofRef ? " (proof " + d.proofRef + ")" : "") + ". The notice is " + n.deliveryStatus + ".");
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, notice: n };
}
/** Has a notice of this type been delivered to everyone it was sent to? */
function compNoticeDelivered(sub, type) { return (sub.notices || []).some(n => n.type === type && n.status === "issued" && n.deliveryStatus === "delivered"); }

// ----------------------------------------------------------------------------
// 5. SCREENS
// ----------------------------------------------------------------------------
function cqRuleText(q) { const r = q.rule || {}; return Object.keys(r).map(k => k + ": " + (Array.isArray(r[k]) ? r[k].join(", ") : r[k])).join(" · ") || "—"; }
function cqHtml() {
  const edit = ucCan("edit");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New compliance requirement</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="cq_code">Code</label><input class="form-control" id="cq_code"></div><div class="form-group mw-wide"><label for="cq_name">Name</label><input class="form-control" id="cq_name"></div>
    <div class="form-group"><label for="cq_type">Type</label><select class="form-control" id="cq_type">${Object.keys(CQ_TYPES).map(k => `<option value="${k}">${escHtml(CQ_TYPES[k])}</option>`).join("")}</select></div><div class="form-group"><label for="cq_enf">Enforcement</label><select class="form-control" id="cq_enf"><option>block</option><option>warn</option></select></div>
    <div class="form-group"><label for="cq_state">States (comma list, or all)</label><input class="form-control" id="cq_state" placeholder="*"></div><div class="form-group"><label for="cq_lob">Line key (or all)</label><input class="form-control" id="cq_lob" placeholder="*"></div>
    <div class="form-group"><label for="cq_adm">Placement</label><select class="form-control" id="cq_adm">${Object.keys(CQ_ADMITTED).map(k => `<option value="${k}">${escHtml(CQ_ADMITTED[k])}</option>`).join("")}</select></div><div class="form-group"><label for="cq_from">Starts</label><input type="date" class="form-control" id="cq_from" value="${todayIso()}"></div>
    <div class="form-group"><label for="cq_max">Notice: most reasons</label><input class="form-control" id="cq_max" placeholder="no limit"></div><div class="form-group"><label for="cq_due">Notice: days to send</label><input class="form-control" id="cq_due"></div>
    <div class="form-group"><label for="cq_scr">Screening</label><select class="form-control" id="cq_scr"><option value="kyc">KYC</option><option value="kyb">KYB</option><option value="pep">PEP</option><option value="adverse_media">Adverse media</option></select></div><div class="form-group"><label for="cq_vd">Screening: days a result is good for</label><input class="form-control" id="cq_vd"></div>
    <div class="form-group"><label for="cq_days">Cancellation: notice days</label><input class="form-control" id="cq_days"></div><div class="form-group"><label for="cq_kinds">Filings needed (rate, rule, form)</label><input class="form-control" id="cq_kinds" placeholder="rate, form"></div></div>
    <div class="p1-note">Only the settings of the chosen type are used. No state requirement is built in.</div><div class="p1-actions"><button class="btn btn-primary" onclick="cqAddUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing requirements needs edit rights on review rules.</div>`;
  const rows = CQ.reqs.slice().reverse().map(q => `<tr><td><strong>${escHtml(q.code)}</strong> v${q.version}<div class="p1-note">${escHtml(q.name)}</div></td><td>${escHtml(CQ_TYPES[q.type])}</td><td>${escHtml(ucListText(q.state))} · ${escHtml(ucListText(q.lob))}<div class="p1-note">${escHtml(CQ_ADMITTED[q.admittedStatus])}</div></td><td>${escHtml(cqRuleText(q))}</td><td>${escHtml(q.enforcement)}</td><td>${ucStatusBadge(q.status)}${q.rejectedReason ? `<div class="p1-note">Sent back: ${escHtml(q.rejectedReason)}</div>` : ""}</td><td>${ucActionsHtml("cqAct", q)}</td></tr>`).join("");
  return form + (CQ.reqs.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Requirement</th><th>Type</th><th>Where</th><th>Settings</th><th>Enforcement</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No compliance requirement is registered, so no state rule is applied at bind and a notice has no reason limit or due date from a state.</div>`);
}
function cqAddUi() {
  const type = ucV("cq_type"), rule = {};
  if (type === "adverse_action_notice") { if (ucV("cq_max")) rule.max_reason_count = Number(ucV("cq_max")); if (ucV("cq_due")) rule.notice_due_days = Number(ucV("cq_due")); }
  if (type === "party_screening") { rule.screening = ucV("cq_scr"); rule.validity_days = ucV("cq_vd") === "" ? "" : Number(ucV("cq_vd")); }
  if (type === "cancel_notice") rule.notice_days = ucV("cq_days") === "" ? "" : Number(ucV("cq_days"));
  if (type === "filing_approved" && ucV("cq_kinds")) rule.kinds = ucV("cq_kinds").split(",").map(x => x.trim()).filter(Boolean);
  const r = cqAdd({ code: ucV("cq_code"), name: ucV("cq_name"), type: type, enforcement: ucV("cq_enf"), state: ucList(ucV("cq_state") || "*"), lob: ucV("cq_lob") || "*", admittedStatus: ucV("cq_adm"), effectiveFrom: ucV("cq_from"), rule: rule });
  ucToast(r, "Draft created."); ucRender();
}
function filHtml() {
  const edit = ucCan("edit");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New filing</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="fl_prod">Product id (or *)</label><input class="form-control" id="fl_prod"></div><div class="form-group"><label for="fl_ver">Product version (or *)</label><input class="form-control" id="fl_ver" placeholder="*"></div>
    <div class="form-group"><label for="fl_state">State</label><select class="form-control" id="fl_state"><option value="">Choose…</option>${US_STATE_CODES_FOR_PRODUCER.map(c => `<option>${c}</option>`).join("")}</select></div><div class="form-group"><label for="fl_lob">Line key (or all)</label><input class="form-control" id="fl_lob" placeholder="*"></div>
    <div class="form-group"><label for="fl_type">Type</label><select class="form-control" id="fl_type">${Object.keys(FIL_TYPES).map(k => `<option value="${k}">${escHtml(FIL_TYPES[k])}</option>`).join("")}</select></div><div class="form-group"><label for="fl_serff">SERFF tracking number</label><input class="form-control" id="fl_serff"></div>
    <div class="form-group"><label for="fl_file">State file number</label><input class="form-control" id="fl_file"></div><div class="form-group mw-wide"><label for="fl_items">What it covers (rating plan, forms, rules)</label><input class="form-control" id="fl_items"></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="filAddUi()">Record the filing</button></div></div></details>` : "";
  const rows = CQ.filings.slice().reverse().map(x => `<tr><td><strong>${escHtml(x.id)}</strong><div class="p1-note">${escHtml(FIL_TYPES[x.filingType])}</div></td><td>${escHtml(x.productId)} v${escHtml(x.productVersion)}<div class="p1-note">${escHtml(x.state)} · ${escHtml(ucListText(x.lob))}</div></td><td>${escHtml(x.serffNo || "—")}<div class="p1-note">${escHtml(x.stateFileNo || "")}</div></td><td><span class="badge ${x.status === "approved" ? "badge-success" : x.status === "draft" ? "badge-light" : "badge-warning"}">${escHtml(FIL_STATUSES[x.status])}</span>${x.approvedDate ? `<div class="p1-note">approved ${escHtml(x.approvedDate)}; new business from ${escHtml(x.nbEffective)}, renewals from ${escHtml(x.renewalEffective)}</div>` : ""}</td>
    <td>${x.events.map(e => `<div class="p1-note">${escHtml(e.date)} ${escHtml(e.status)}${e.notes ? ": " + escHtml(e.notes) : ""}</div>`).join("")}${edit ? `<div class="mw-grid" style="margin-top:4px;"><div class="form-group"><label for="fe_s_${x.id}">New status</label><select class="form-control" id="fe_s_${x.id}">${Object.keys(FIL_STATUSES).filter(k => k !== "draft").map(k => `<option value="${k}">${FIL_STATUSES[k]}</option>`).join("")}</select></div><div class="form-group"><label for="fe_d_${x.id}">Date</label><input type="date" class="form-control" id="fe_d_${x.id}" value="${todayIso()}"></div><div class="form-group"><label for="fe_n_${x.id}">New business from</label><input type="date" class="form-control" id="fe_n_${x.id}"></div><div class="form-group"><label for="fe_r_${x.id}">Renewals from</label><input type="date" class="form-control" id="fe_r_${x.id}"></div><div class="form-group mw-wide"><label for="fe_t_${x.id}">Notes</label><input class="form-control" id="fe_t_${x.id}"></div></div><button class="btn btn-xs btn-outline" onclick="filEventUi('${x.id}')">Record</button>` : ""}</td></tr>`).join("");
  return form + (CQ.filings.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Filing</th><th>Product and state</th><th>Numbers</th><th>Status</th><th>History</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No filing is recorded. Until the carrier's filings are entered, the product filing check fails: it cannot be shown that a product may be sold.</div>`);
}
function filAddUi() {
  const r = filAdd({ productId: ucV("fl_prod"), productVersion: ucV("fl_ver") || "*", state: ucV("fl_state"), lob: ucV("fl_lob") || "*", filingType: ucV("fl_type"), serffNo: ucV("fl_serff"), stateFileNo: ucV("fl_file"), items: ucV("fl_items") });
  ucToast(r, "Filing recorded."); ucRender();
}
function filEventUi(id) {
  const r = filEvent(id, { status: ucV("fe_s_" + id), date: ucV("fe_d_" + id), nbEffective: ucV("fe_n_" + id), renewalEffective: ucV("fe_r_" + id), notes: ucV("fe_t_" + id) });
  ucToast(r, "Recorded."); ucRender();
}
function cqCaseHtml(sub) {
  const f = cqSubFacts(sub), pr = typeof rsProductRef === "function" ? rsProductRef() : null;
  const sell = filingCanSell({ productId: pr && pr.id, productVersion: pr && pr.version, state: f.state, lob: f.lob, businessType: f.renewal ? "renewal" : "new" });
  const head = `<div class="p1-note">Can this product be sold in ${escHtml(f.state || "an unknown state")} today? ${sell.ok ? '<span class="badge badge-success">Yes</span> filings ' + sell.filings.map(escHtml).join(", ") : '<span class="badge badge-danger">Not shown</span> ' + sell.reasons.map(escHtml).join("; ")}</div>`;
  const canRun = hasPermission("submissionData", "edit"), canWaive = hasPermission("authority", "override");
  const rows = cqList(sub).slice(-30).reverse().map(c => `<tr><td>${escHtml(c.id)}</td><td>${escHtml(c.requirementCode)} v${c.requirementVersion}<div class="p1-note">${escHtml(CQ_TYPES[c.type])} · ${escHtml(c.enforcement)}</div></td><td>${escHtml(c.entityType.replace(/_/g, " "))}</td><td><span class="badge ${c.result === "pass" ? "badge-success" : c.result === "fail" ? "badge-danger" : c.result === "waived" ? "badge-warning" : "badge-light"}">${CQ_RESULTS[c.result]}</span>${c.waiverReason ? `<div class="p1-note">${escHtml(c.waiverReason)} (${escHtml(c.waivedBy)})</div>` : ""}</td><td class="p1-note">${escHtml(JSON.stringify(c.evidence))}</td><td>${c.result === "fail" && canWaive && c === cqLatest(sub, c.requirementId, c.entityType) ? `<button class="btn btn-xs btn-outline" onclick="cqWaiveUi('${c.id}')">Waive</button>` : ""}</td></tr>`).join("");
  return head + (canRun ? `<button class="btn btn-sm btn-outline" style="margin:6px 0;" onclick="cqRunUi()">Run the checks</button>` : "") + (rows ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Check</th><th>Requirement</th><th>At</th><th>Result</th><th>Evidence</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="mw-empty">No compliance check has been run on this case.</div>');
}
function cqRunUi() { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = cqRun(sub, "bind_request", { entityId: sub.id }); showToast(r.length ? "Ran " + r.length + " check(s)." : "No requirement in force applies to this case.", "info"); if (typeof cfRender === "function") cfRender(); }
function cqWaiveUi(id) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const why = window.prompt("Why is this requirement waived? (at least 10 characters; recorded with your name)", ""); if (why === null) return; const r = cqWaive(sub, id, why); showToast(r.ok ? "✅ Waived." : "⛔ " + (r.error === "reason" ? "Give a reason of at least 10 characters." : r.error), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function compNoticesHtml(sub) {
  const list = (sub.notices || []).filter(n => n.status === "issued");
  if (!list.length) return '<div class="mw-empty">No notice has been issued on this case.</div>';
  const canEdit = hasPermission("notices", "edit");
  return `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Notice</th><th>Trigger</th><th>Requirement and due</th><th>Delivery</th></tr></thead><tbody>${list.map(n => `<tr><td>${escHtml(n.id)}<div class="p1-note">${escHtml(NOTICE_TYPES[n.type] ? NOTICE_TYPES[n.type].label : n.type)} · ${escHtml(n.issuedAt)}</div>${(n.reasonRanks || []).map(r => `<div class="p1-note">${r.rank}. ${escHtml(r.code)}</div>`).join("")}</td><td>${escHtml(n.triggerType || "—")}${n.trigger ? `<div class="p1-note">${escHtml(n.trigger.type)} ${escHtml(n.trigger.id)}</div>` : ""}</td>
    <td>${escHtml(n.complianceRequirementCode || "none registered")}${n.dueDate ? `<div class="p1-note">due ${escHtml(n.dueDate)}${n.late ? " · LATE" : ""}</div>` : ""}</td><td><span class="badge ${n.deliveryStatus === "delivered" ? "badge-success" : n.deliveryStatus === "failed" ? "badge-danger" : "badge-warning"}">${escHtml(n.deliveryStatus || "not recorded")}</span>${(n.deliveries || []).map(d => `<div class="p1-note">${escHtml(d.recipient)}: ${escHtml(d.status)}${d.proofRef ? " (proof " + escHtml(d.proofRef) + ")" : ""} ${canEdit && d.status !== "delivered" ? `<button class="btn btn-xs btn-outline" onclick="noticeDeliveryUi('${n.id}','${d.recipient}','delivered')">Delivered</button> <button class="btn btn-xs btn-outline" onclick="noticeDeliveryUi('${n.id}','${d.recipient}','failed')">Failed</button>` : ""}</div>`).join("")}</td></tr>`).join("")}</tbody></table></div>`;
}
function noticeDeliveryUi(noticeId, recipient, status) {
  const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return;
  let proof = ""; if (status === "delivered") { proof = window.prompt("Proof of delivery for the " + recipient + " (a tracking number, receipt or email id)", ""); if (proof === null) return; }
  const r = noticeRecordDelivery(sub, noticeId, recipient, status, proof);
  showToast(r.ok ? "✅ Recorded." : "⛔ " + (r.error === "proof" ? "Enter the proof of delivery." : r.error), r.ok ? "success" : "danger");
  if (typeof cfRender === "function") cfRender();
}

(function cqInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.compliance_waived = m("Compliance Requirement Waived", "ph-seal-warning", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.compliance_bind_blocked = m("Bind Blocked — Compliance", "ph-prohibit", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.notice_delivery_recorded = m("Notice Delivery Recorded", "ph-envelope-simple", "badge-info", "outcome-comm");
  }
  if (typeof registerGuard === "function") registerGuard("bind", "compliance requirements", cqBindGuard);
})();
ucRegisterTab("compliance", "Compliance checks", "ph-seal-check", cqHtml, () => CQ.reqs.filter(q => q.status === "pending").length);
ucRegisterTab("filings", "Product filings", "ph-files", filHtml);
if (typeof urRegisterSection === "function") { urRegisterSection("compliance", "Compliance", cqCaseHtml); urRegisterSection("notices", "Notices", compNoticesHtml); }
