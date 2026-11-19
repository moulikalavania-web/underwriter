/**
 * ============================================================================
 * UNDERWRITING RECORD: THE CASE, ITS REFERRALS, ITS DECISIONS AND ITS AUTHORITY CHECKS
 * ----------------------------------------------------------------------------
 * The referral, the decision and the authority test each existed only as a status, a log line or a free-text note. Each is now a
 * record that can be listed, queried and traced:
 *
 *   UNDERWRITING CASE  one per submission that reaches the underwriter: who it is assigned to, its priority, when it was opened and
 *                  closed, its status, and the policy transaction or renewal it concerns (a Veridex record, or an outside system's
 *                  reference, never both for the same item).
 *   REFERRAL       a reason code from a governed list, the person it was referred to (named, not only a role), the exact limit that was
 *                  breached (the rule or level, the measure, the figure and the ceiling), who raised it and when, and when and by whom
 *                  it was resolved.
 *   DECISION       the underwriting decision as its own record: its type (referral approved, returned or declined; decline; automatic
 *                  decline), the reason code, who decided and when, and what it relates to (the referral, the outcome). The outcome and
 *                  the notice point at it, so the decline, the reason given to the broker and the decision cannot disagree.
 *   AUTHORITY CHECK  every test of a person's or the carrier's authority is kept as a row: what was tested (quote, bind, referral,
 *                  pricing adjustment), against which rule or level, the measure, the figure, the ceiling, the result (within authority,
 *                  exceeded, referred, approved, not required), the approval it rests on, who checked, when, and the access policy
 *                  version in force.
 *
 * The existing referral, decision and guard code is wrapped, not replaced: it behaves as before and now also writes these records.
 * The Case File gets an "Underwriting record" tab; other modules add their own sections to it with urRegisterSection().
 * ============================================================================
 */

const UR_REFERRAL_REASONS = [
  { code: "PREMIUM", label: "Premium is above the underwriter's ceiling" },
  { code: "LIMIT", label: "Policy limit is above the underwriter's ceiling" },
  { code: "LINE_STATE", label: "The line or state is withheld from this level" },
  { code: "STATE_UNKNOWN", label: "The risk state is not known, so authority cannot be confirmed" },
  { code: "SPECIALTY", label: "The line is not one of the underwriter's specialities" },
  { code: "CARRIER", label: "Outside the carrier's delegated authority" },
  { code: "RULE", label: "A rule failed and needs an approver" },
  { code: "DISCRETION", label: "A debit or credit above the underwriter's level" },
  { code: "OTHER", label: "Another reason, explained in the note" }
];
const UR_DECISION_TYPES = { referral_approved: "Referral approved", referral_returned: "Referral returned for revision", referral_declined: "Referral declined", decline: "Declined by an underwriter", auto_decline: "Declined automatically by a rule" };
const UR_CHECK_RESULTS = { within_authority: "Within authority", exceeded: "Exceeded", referred: "Referred", approved: "Approved", not_required: "Not required" };
var UR_SECTIONS = [];
var UR_FINAL = ["Declined", "Closed", "Bound"];

function urSave() { if (typeof persistAppState === "function") persistAppState(); }
function urActor() { return typeof authActor === "function" ? authActor() : ucActor(); }
function urNext(list, prefix) { return prefix + "-" + ((list || []).length + 1); }
function urReasonLabel(code) { const r = UR_REFERRAL_REASONS.find(x => x.code === code); return r ? r.label : code; }
function urRegisterSection(key, title, html) { UR_SECTIONS = UR_SECTIONS.filter(s => s.key !== key); UR_SECTIONS.push({ key: key, title: title, html: html }); }
function urPolicyVersion() { try { const p = azCurrentPolicy(); return p && (p.id || p.version) ? String(p.id || p.version) : null; } catch (e) { return null; } }

// ----------------------------------------------------------------------------
// 1. THE UNDERWRITING CASE
// ----------------------------------------------------------------------------
/** Makes sure the case has its record once it has reached the underwriter, and keeps its status and closing time current. */
function urSync(sub) {
  if (!sub) return null;
  const reached = (sub.currentStep || 1) >= SCORE_STEP || (sub.uwReferrals || []).length || (sub.uwDecisions || []).length || (sub.outcomes || []).length;
  if (!sub.uwCase && !reached) return null;
  if (!sub.uwCase) sub.uwCase = { id: "UWC-" + sub.id, openedAt: nowStamp(), openedBy: urActor(), links: { policyTransactionId: "", renewalCaseId: "", externalSystem: "", externalPolicyTransaction: "", externalRenewal: "" } };
  const c = sub.uwCase, st = caseStatus(sub);
  c.assignedTo = sub.assignedTo || null; c.priority = sub.priority || null; c.status = st;
  if (UR_FINAL.indexOf(st) > -1 && !c.closedAt) { c.closedAt = nowStamp(); c.closedReason = st; }
  if (UR_FINAL.indexOf(st) < 0 && c.closedAt) { delete c.closedAt; delete c.closedReason; }   // reopened
  if (sub.renewalOf && !c.links.renewalCaseId && !c.links.externalRenewal) c.links.renewalCaseId = String(sub.renewalOf);
  return c;
}
/** Links the case to a transaction or renewal: a Veridex record or an outside system's reference, not both for the same item. */
function urSetLinks(sub, f) {
  const c = urSync(sub);
  if (!c) return { ok: false, error: "case" };
  const e = [];
  if (f.policyTransactionId && f.externalPolicyTransaction) e.push("the policy transaction is either a Veridex record or an outside reference, not both");
  if (f.renewalCaseId && f.externalRenewal) e.push("the renewal is either a Veridex record or an outside reference, not both");
  if ((f.externalPolicyTransaction || f.externalRenewal) && !f.externalSystem) e.push("name the outside system");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  c.links = { policyTransactionId: f.policyTransactionId || "", renewalCaseId: f.renewalCaseId || "", externalSystem: f.externalSystem || "", externalPolicyTransaction: f.externalPolicyTransaction || "", externalRenewal: f.externalRenewal || "" };
  urSave();
  return { ok: true, case: c };
}

// ----------------------------------------------------------------------------
// 2. REFERRALS
// ----------------------------------------------------------------------------
/** The reason code and the limits breached, worked out from the authority assessment. */
function urReferralFacts(sub) {
  const a = authAssess(sub, currentUserRole), m = a.measures, rule = a.own.rule, breached = [];
  let code = "OTHER";
  if (a.own.stateUnknown) code = "STATE_UNKNOWN";
  else if (rule && rule.maxPremium === 0 && rule.maxLimit === 0) { code = "LINE_STATE"; breached.push({ source: "authority_rule", id: rule.id, measure: "line_state", value: (m.lob || "") + "/" + (m.state || "?"), limit: 0 }); }
  else if (rule) {
    if (m.premium > rule.maxPremium) breached.push({ source: "authority_rule", id: rule.id, measure: "premium", value: m.premium, limit: rule.maxPremium });
    if (m.limit > rule.maxLimit) breached.push({ source: "authority_rule", id: rule.id, measure: "limit", value: m.limit, limit: rule.maxLimit });
    code = breached.length ? (breached[0].measure === "premium" ? "PREMIUM" : "LIMIT") : "OTHER";
  }
  if (!a.carrierCovered) { breached.push({ source: "carrier", id: a.carrier.agreement || a.carrier.carrier || "", measure: "delegated_authority", value: null, limit: null, detail: a.carrier.reasons.join("; ") }); if (code === "OTHER") code = "CARRIER"; }
  return { code: code, breached: breached, requiredRole: a.requiredRole };
}
/** Opens the referral record for a referral just raised. kind is "authority" or "specialty". */
function urOpenReferral(sub, kind, ref, facts) {
  if (!sub.uwReferrals) sub.uwReferrals = [];
  const role = ref.requiredRole || null;
  const r = { id: urNext(sub.uwReferrals, "REF"), kind: kind, reasonCode: facts.code, reasonLabel: urReasonLabel(facts.code), referredToRole: role, referredToName: typeof authRoleOwnerName === "function" ? authRoleOwnerName(role) : String(role || "the carrier"),
    limitsBreached: facts.breached, raisedBy: ref.raisedBy, raisedAt: ref.raisedAt, note: ref.note || "", status: "pending", resolvedAt: null, resolvedBy: null, decisionId: null };
  sub.uwReferrals.push(r); ref.referralId = r.id;
  urSync(sub); urSave();
  return r;
}
function urCloseReferral(sub, kind, verb, note) {
  const r = [].concat(sub.uwReferrals || []).reverse().find(x => x.kind === kind && x.status === "pending");
  const type = verb === "approve" ? "referral_approved" : verb === "return" ? "referral_returned" : "referral_declined";
  const d = urDecision(sub, { type: type, reasonCode: verb === "approve" ? "WITHIN_AUTHORITY" : verb === "return" ? "RETURNED_FOR_REVISION" : "REFERRAL_DECLINED", reasonText: note || (verb === "approve" ? "Approved within authority." : ""), referralId: r ? r.id : null });
  if (!r) return null;
  r.status = verb === "approve" ? "approved" : verb === "return" ? "returned" : "declined"; r.resolvedAt = nowStamp(); r.resolvedBy = urActor(); r.decisionId = d.id;
  const ref = kind === "specialty" ? sub.specialtyRef : sub.authorityRef; if (ref) ref.resolvedAt = r.resolvedAt;
  urSave();
  return r;
}

// ----------------------------------------------------------------------------
// 3. DECISIONS
// ----------------------------------------------------------------------------
/** Records a decision. { type, reasonCode, reasonText, referralId?, outcomeId?, by? } */
function urDecision(sub, o) {
  if (!UR_DECISION_TYPES[o.type]) return null;
  if (!sub.uwDecisions) sub.uwDecisions = [];
  const d = { id: urNext(sub.uwDecisions, "DEC"), type: o.type, reasonCode: o.reasonCode || "", reasonText: String(o.reasonText || "").trim(), decidedBy: o.by || urActor(), decidedByRole: o.by ? "system" : currentUserRole, at: nowStamp(), referralId: o.referralId || null, outcomeId: o.outcomeId || null, authorityCheckIds: o.authorityCheckIds || [] };
  sub.uwDecisions.push(d); urSync(sub); urSave();
  return d;
}
function urLatestDecision(sub, types) { return [].concat(sub.uwDecisions || []).reverse().find(d => !types || types.indexOf(d.type) > -1) || null; }

// ----------------------------------------------------------------------------
// 4. AUTHORITY CHECKS
// ----------------------------------------------------------------------------
/** Keeps one authority test as a row. o: { subjectType, subjectId, source, sourceId, measure, checkedValue, limitValue, result, approvalRequestId?, detail? } */
function urCheck(sub, o) {
  if (!sub.authorityChecks) sub.authorityChecks = [];
  if (!UR_CHECK_RESULTS[o.result]) return null;
  const money = ["premium", "limit", "tiv"].indexOf(o.measure) > -1;
  const c = { id: urNext(sub.authorityChecks, "AC"), subjectType: o.subjectType, subjectId: o.subjectId || sub.id, source: o.source, sourceId: o.sourceId || "", measure: o.measure, checkedValue: o.checkedValue === undefined ? null : o.checkedValue, limitValue: o.limitValue === undefined ? null : o.limitValue,
    currency: money ? "USD" : null, result: o.result, approvalRequestId: o.approvalRequestId || null, detail: o.detail || "", checkedBy: urActor(), checkedAt: nowStamp(), accessPolicyVersion: urPolicyVersion() };
  sub.authorityChecks.push(c);
  if (sub.authorityChecks.length > 200) sub.authorityChecks = sub.authorityChecks.slice(-200);
  urSave();
  return c;
}
/** The rows for a quote or bind test: the person's ceilings, then the carrier's delegated authority. */
function urCheckQuoteBind(sub, kind) {
  const a = authAssess(sub, currentUserRole), m = a.measures, rule = a.own.rule, subj = kind === "bind" ? "bind_request" : "quote";
  const res = a.own.ok ? "within_authority" : a.refValid ? "approved" : "exceeded";
  const ids = [];
  if (rule) {
    ids.push(urCheck(sub, { subjectType: subj, source: "authority_rule", sourceId: rule.id, measure: "premium", checkedValue: m.premium, limitValue: rule.maxPremium, result: m.premium <= rule.maxPremium ? "within_authority" : a.refValid ? "approved" : "exceeded" }).id);
    ids.push(urCheck(sub, { subjectType: subj, source: "authority_rule", sourceId: rule.id, measure: "limit", checkedValue: m.limit, limitValue: rule.maxLimit, result: m.limit <= rule.maxLimit ? "within_authority" : a.refValid ? "approved" : "exceeded" }).id);
  } else ids.push(urCheck(sub, { subjectType: subj, source: "authority_rule", sourceId: "", measure: "line_state", result: res, detail: a.own.reasons.join("; ") }).id);
  ids.push(urCheck(sub, { subjectType: subj, source: "carrier", sourceId: a.carrier.agreement || "", measure: "delegated_authority", result: a.carrierCovered ? (a.carrier.ok ? "within_authority" : "approved") : "exceeded", detail: a.carrier.reasons.join("; ") }).id);
  return ids;
}

// ----------------------------------------------------------------------------
// 5. HOOKS INTO THE EXISTING CODE
// ----------------------------------------------------------------------------
(function urInstall() {
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === "function") window[name] = function () { const r = o.apply(this, arguments); try { fn(r, arguments); } catch (e) { console.warn("UW record (" + name + ") failed:", e); } return r; }; };
  wrap("authRaiseCore", (r, a) => { const sub = a[0], facts = urReferralFacts(sub); const rec = urOpenReferral(sub, "authority", r, facts); urCheck(sub, { subjectType: "referral", subjectId: rec.id, source: "authority_rule", sourceId: ((authAssess(sub, currentUserRole).own.rule) || {}).id || "", measure: (facts.breached[0] || {}).measure || "line_state", checkedValue: (facts.breached[0] || {}).value === undefined ? null : (facts.breached[0] || {}).value, limitValue: (facts.breached[0] || {}).limit === undefined ? null : (facts.breached[0] || {}).limit, result: "referred", detail: rec.reasonLabel }); });
  wrap("authRaiseSpecialty", (r, a) => { const sub = a[0], sp = authSpecialty(sub, currentUserRole); urOpenReferral(sub, "specialty", r, { code: "SPECIALTY", breached: [{ source: "speciality", id: sp.lob || "", measure: "line", value: sp.lob || "", limit: null, detail: sp.reasons.join("; ") }] }); });
  wrap("authDecideCore", (r, a) => { if (r && r.ok) { const sub = a[0], rec = urCloseReferral(sub, "authority", a[1], a[2]); if (rec) urCheck(sub, { subjectType: "referral", subjectId: rec.id, source: "authority_rule", sourceId: "", measure: "premium", checkedValue: authMeasures(sub).premium, limitValue: authRoleCovers(currentUserRole, authMeasures(sub)).rule ? authRoleCovers(currentUserRole, authMeasures(sub)).rule.maxPremium : null, result: a[1] === "approve" ? "approved" : "referred", detail: "Decided by " + urActor() }); } });
  wrap("authDecideSpecialty", (r, a) => { if (r && r.ok) urCloseReferral(a[0], "specialty", a[1], a[2]); });
  wrap("outRecord", (r, a) => {
    const sub = a[0], o = a[1];
    if (!r || !r.ok || (o.type !== "declined_by_underwriter" && o.type !== "auto_declined")) return;
    const auto = o.type === "auto_declined";
    const d = urDecision(sub, { type: auto ? "auto_decline" : "decline", reasonCode: r.outcome.reasonCode, reasonText: r.outcome.reasonText, outcomeId: r.outcome.id, by: auto ? "System (automatic)" : null });
    r.outcome.decisionId = d.id;
    urSave();
  });
  wrap("authGuard", (r, a) => { const sub = a[1]; if (sub) urCheckQuoteBind(sub, a[2]); });
  wrap("renderAllDownstreamScreens", (r, a) => { urSync(a[0]); });
})();

// ----------------------------------------------------------------------------
// 6. THE CASE FILE TAB
// ----------------------------------------------------------------------------
function urTable(head, rows, empty) { return rows.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<div class="mw-empty">${empty}</div>`; }
function urLimitText(l) { return escHtml(l.measure.replace(/_/g, " ")) + (l.value !== null && l.value !== undefined ? ": " + escHtml(typeof l.value === "number" ? authMoney(l.value) : l.value) : "") + (l.limit !== null && l.limit !== undefined ? " against " + escHtml(typeof l.limit === "number" ? authMoney(l.limit) : l.limit) : "") + " (" + escHtml(l.source) + (l.id ? " " + escHtml(l.id) : "") + ")" + (l.detail ? "<div class=\"p1-note\">" + escHtml(l.detail) + "</div>" : ""); }
function urHtml(sub) {
  urSync(sub);
  const c = sub.uwCase;
  const head = c ? `<div class="card" style="margin-bottom:12px;"><div class="card-body"><strong>${escHtml(c.id)}</strong> · <span class="badge badge-light">${escHtml(c.status)}</span> · opened ${escHtml(c.openedAt)} by ${escHtml(c.openedBy)} · ${c.closedAt ? "closed " + escHtml(c.closedAt) : "open"} · assigned to ${escHtml(c.assignedTo || "nobody")}${c.priority ? " · priority " + escHtml(c.priority) : ""}
    <div class="p1-note">Policy transaction: ${escHtml(c.links.policyTransactionId || c.links.externalPolicyTransaction || "none")}${c.links.externalPolicyTransaction ? " (outside system " + escHtml(c.links.externalSystem) + ")" : ""} · Renewal: ${escHtml(c.links.renewalCaseId || c.links.externalRenewal || "none")}${c.links.externalRenewal ? " (outside system " + escHtml(c.links.externalSystem) + ")" : ""}</div>
    ${hasPermission("submissionData", "edit") ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="ur_ptx">Policy transaction (Veridex id)</label><input class="form-control" id="ur_ptx" value="${escHtml(c.links.policyTransactionId)}"></div><div class="form-group"><label for="ur_ren">Renewal case (Veridex id)</label><input class="form-control" id="ur_ren" value="${escHtml(c.links.renewalCaseId)}"></div>
    <div class="form-group"><label for="ur_sys">Outside system</label><input class="form-control" id="ur_sys" value="${escHtml(c.links.externalSystem)}"></div><div class="form-group"><label for="ur_xptx">Outside policy transaction reference</label><input class="form-control" id="ur_xptx" value="${escHtml(c.links.externalPolicyTransaction)}"></div><div class="form-group"><label for="ur_xren">Outside renewal reference</label><input class="form-control" id="ur_xren" value="${escHtml(c.links.externalRenewal)}"></div></div><button class="btn btn-sm btn-outline" onclick="urSaveLinksUi()">Save links</button>` : ""}</div></div>` : `<div class="mw-empty">This submission has not reached the underwriter yet, so there is no underwriting case.</div>`;
  const refs = urTable(["Referral", "Reason", "Referred to", "Limit breached", "Raised", "Resolved"], (sub.uwReferrals || []).slice().reverse().map(r => `<tr><td>${escHtml(r.id)} <span class="badge badge-light">${escHtml(r.kind)}</span></td><td>${escHtml(r.reasonCode)}<div class="p1-note">${escHtml(r.reasonLabel)}</div></td><td>${escHtml(r.referredToName)}<div class="p1-note">${escHtml(r.referredToRole || "carrier")}</div></td><td>${r.limitsBreached.length ? r.limitsBreached.map(urLimitText).join("<br>") : "—"}</td><td>${escHtml(r.raisedBy)}<div class="p1-note">${escHtml(r.raisedAt)}</div></td><td>${r.status === "pending" ? '<span class="badge badge-warning">Pending</span>' : escHtml(r.status) + " " + escHtml(r.resolvedAt) + "<div class=\"p1-note\">" + escHtml(r.resolvedBy) + " · " + escHtml(r.decisionId) + "</div>"}</td></tr>`), "No referral has been raised.");
  const decs = urTable(["Decision", "Type", "Reason", "By", "Related"], (sub.uwDecisions || []).slice().reverse().map(d => `<tr><td>${escHtml(d.id)}</td><td>${escHtml(UR_DECISION_TYPES[d.type])}</td><td>${escHtml(d.reasonCode)}<div class="p1-note">${escHtml(d.reasonText)}</div></td><td>${escHtml(d.decidedBy)}<div class="p1-note">${escHtml(d.at)}</div></td><td>${[d.referralId, d.outcomeId].concat((sub.notices || []).filter(n => n.decisionId === d.id).map(n => n.id)).filter(Boolean).map(escHtml).join(", ") || "—"}</td></tr>`), "No decision has been recorded.");
  const checks = urTable(["Check", "What", "Against", "Measure", "Result", "By"], (sub.authorityChecks || []).slice(-40).reverse().map(k => `<tr><td>${escHtml(k.id)}</td><td>${escHtml(k.subjectType.replace(/_/g, " "))}${k.subjectId && k.subjectId !== sub.id ? " " + escHtml(k.subjectId) : ""}</td><td>${escHtml(k.source)}${k.sourceId ? " " + escHtml(k.sourceId) : ""}</td><td>${escHtml(k.measure.replace(/_/g, " "))}: ${k.checkedValue === null ? "—" : escHtml(k.currency ? authMoney(k.checkedValue) : k.checkedValue)} / ${k.limitValue === null ? "—" : escHtml(k.currency ? authMoney(k.limitValue) : k.limitValue)}${k.detail ? '<div class="p1-note">' + escHtml(k.detail) + "</div>" : ""}</td><td>${escHtml(UR_CHECK_RESULTS[k.result])}${k.approvalRequestId ? '<div class="p1-note">approval ' + escHtml(k.approvalRequestId) + "</div>" : ""}</td><td>${escHtml(k.checkedBy)}<div class="p1-note">${escHtml(k.checkedAt)}${k.accessPolicyVersion ? " · policy " + escHtml(k.accessPolicyVersion) : ""}</div></td></tr>`), "No authority check has been made.");
  const extra = UR_SECTIONS.map(s => { let h = ""; try { h = s.html(sub); } catch (e) { h = '<div class="alert alert-danger">' + escHtml(e.message) + "</div>"; } return `<h3 class="p1-h" style="margin:16px 0 6px;font-size:15px;">${escHtml(s.title)}</h3>${h}`; }).join("");
  return head + `<h3 class="p1-h" style="margin:16px 0 6px;font-size:15px;">Referrals</h3>${refs}<h3 class="p1-h" style="margin:16px 0 6px;font-size:15px;">Decisions</h3>${decs}<h3 class="p1-h" style="margin:16px 0 6px;font-size:15px;">Authority checks</h3>${checks}${extra}`;
}
function urSaveLinksUi() {
  const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return;
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return; }
  const r = urSetLinks(sub, { policyTransactionId: ucV("ur_ptx"), renewalCaseId: ucV("ur_ren"), externalSystem: ucV("ur_sys"), externalPolicyTransaction: ucV("ur_xptx"), externalRenewal: ucV("ur_xren") });
  showToast(r.ok ? "✅ Links saved." : "⛔ " + (r.errors ? r.errors.join("; ") : "The case is not open for underwriting yet."), r.ok ? "success" : "danger");
  if (typeof cfRender === "function") cfRender();
}
if (typeof cfRegisterTab === "function") cfRegisterTab("uwrecord", "Underwriting record", "ph-scales", urHtml);
