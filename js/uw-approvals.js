/**
 * ============================================================================
 * UW APPROVALS: ONE APPROVAL CHAIN FOR OVERRIDES, PRICING ADJUSTMENTS AND WAIVERS
 * ----------------------------------------------------------------------------
 * Approval was a single person saying yes. A chain makes it a request with ordered steps:
 *
 *   CHAIN     for an approval type (rule or score override, pricing adjustment, waiver of a condition) the ordered steps, each naming the
 *             lowest role that may take it and, optionally, the amount from which the step applies ("a debit over 10% needs a second
 *             approver"). A chain is a register record: proposed by one person, put in force by a different person, versioned.
 *   REQUEST   what is asked, for how much, by whom, and the chain version it follows. Steps are taken in order. Nobody decides a
 *             step on a request they made, and nobody takes two steps of the same request. A rejection ends the request and needs a
 *             reason. The last approval approves the request.
 *   DEFAULT   with no chain in force for a type, a request has one step that any person with the right to approve workflow steps may
 *             take (not the requester). Nothing changes until a chain is registered.
 *
 * In use: pricing adjustments (js/uw-pricing.js) and the override of a knockout rule. The same engine serves any other type: apRequest()
 * and apDecide() take the type, so a waiver or a payment can join without new code.
 * ============================================================================
 */

const AP_KEY = "FUT_UW_APPROVALS_V1";
const AP_TYPES = { uw_override: "Rule or score override", pricing_adjustment: "Pricing adjustment", condition_waiver: "Waiver of a condition", referral: "Referral", other: "Other" };
var AP = { chains: [], seq: 0 };
var AP_GUARDS = {};
/** A module adds a test the approver must also pass for a type of request: fn(sub, request, step) returns { ok } or { ok: false, why }. */
function apRegisterGuard(type, fn) { AP_GUARDS[type] = fn; }
try { const r = JSON.parse(localStorage.getItem(AP_KEY)); if (r && Array.isArray(r.chains)) AP = Object.assign(AP, r); } catch (e) { /* none yet */ }
function apSave() { try { localStorage.setItem(AP_KEY, JSON.stringify(AP)); } catch (e) { /* keep for this session */ } }
function apRoleOk(role) { return role === "*" || role === "admin" || (typeof AUTH_ROLE_ORDER !== "undefined" && AUTH_ROLE_ORDER.indexOf(role) > -1); }
function apRoleLabel(role) { return role === "*" ? "anyone who may approve" : typeof authRoleLabel === "function" ? authRoleLabel(role) : role; }

// ----------------------------------------------------------------------------
// 1. CHAINS (a register)
// ----------------------------------------------------------------------------
function apChainFor(type) { return AP.chains.filter(c => c.type === type && c.status === "active" && ucInForce(c.effectiveFrom, c.effectiveTo)).slice(-1)[0] || null; }
function apValidateChain(c) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(c.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (!AP_TYPES[c.type]) e.push("choose what the chain approves");
  if (!(c.steps || []).length) e.push("a chain needs at least one step");
  (c.steps || []).forEach((s, i) => { if (!apRoleOk(s.role)) e.push("step " + (i + 1) + ": choose the lowest role that may take it"); if (s.minAmount !== "" && s.minAmount !== null && s.minAmount !== undefined && !(Number(s.minAmount) >= 0)) e.push("step " + (i + 1) + ": the amount is a number from 0"); });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.effectiveFrom || "")) e.push("enter the date it starts");
  return e;
}
function apAddChain(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const c = { id: "CH-" + (++AP.seq), code: String(f.code || "").trim(), name: String(f.name || "").trim(), version: 1, type: f.type, steps: (f.steps || []).map((s, i) => ({ no: i + 1, role: s.role, minAmount: s.minAmount === "" || s.minAmount === undefined ? null : Number(s.minAmount) })), effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = apValidateChain(c);
  if (AP.chains.some(x => x.code === c.code)) errs.push("a chain with this code exists; start a new version of it");
  if (errs.length) { AP.seq--; return { ok: false, error: "invalid", errors: errs }; }
  AP.chains.push(c); apSave();
  return { ok: true, chain: c };
}
function apChainAct(id, what) {
  const c = AP.chains.find(x => x.id === id); if (!c) return;
  const r = ucAct(AP.chains, c, what, "CH-" + (++AP.seq));
  if (!r.ok && what === "newver") AP.seq--;
  if (r.error !== "cancelled") ucToast(r, "Done.");
  apSave(); ucRender();
}

// ----------------------------------------------------------------------------
// 2. REQUESTS
// ----------------------------------------------------------------------------
/** The steps a request of this amount follows under the chain in force (or the single default step). */
function apStepsFor(type, amount) {
  const ch = apChainFor(type);
  if (!ch) return { chain: null, steps: [{ no: 1, role: "*" }] };
  const a = Number(amount) || 0;
  const use = ch.steps.filter(s => s.minAmount === null || s.minAmount === undefined || a >= s.minAmount);
  return { chain: ch, steps: (use.length ? use : ch.steps.slice(0, 1)).map((s, i) => ({ no: i + 1, role: s.role })) };
}
function apRequest(sub, o) {
  if (!AP_TYPES[o.type]) return { ok: false, error: "type" };
  const st = apStepsFor(o.type, o.amount);
  if (!sub.approvals) sub.approvals = [];
  const r = { id: "APR-" + (sub.approvals.length + 1), type: o.type, entityType: o.entityType || "", entityId: o.entityId || "", amount: o.amount === undefined ? null : Number(o.amount), note: String(o.note || "").trim(), chainId: st.chain ? st.chain.id : null, chainCode: st.chain ? st.chain.code : null, chainVersion: st.chain ? st.chain.version : null,
    requestedBy: ucActor(), requestedByRole: currentUserRole, requestedAt: nowStamp(), status: "pending", steps: st.steps.map(s => ({ no: s.no, role: s.role, status: "pending", by: null, at: null, comment: "" })) };
  sub.approvals.push(r);
  logDecision(sub, sub.currentStep || 6, "approval_requested", r.id + ": " + AP_TYPES[o.type] + (r.amount !== null ? " of " + r.amount : "") + ", " + r.steps.length + " step(s)" + (r.chainCode ? " (chain " + r.chainCode + " v" + r.chainVersion + ")" : " (default: one approver)") + ". " + r.note);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, request: r };
}
function apFind(sub, id) { return (sub.approvals || []).find(r => r.id === id) || null; }
function apCurrentStep(r) { return r.steps.find(s => s.status === "pending") || null; }
/** Whether the signed-in person may take the request's current step now, and why not. */
function apMayDecide(r, sub) {
  const step = apCurrentStep(r);
  if (r.status !== "pending" || !step) return { ok: false, why: "The request is not waiting for a decision." };
  if (!hasPermission("workflow", "approve")) return { ok: false, why: "You do not have the right to approve.", permission: true };
  const me = ucActor();
  if (r.requestedBy === me) return { ok: false, why: "You made this request, so you cannot approve it." };
  if (r.steps.some(s => s.by === me)) return { ok: false, why: "You already took a step of this request; a different person must take the next." };
  if (step.role !== "*") {
    if (step.role === "admin" ? currentUserRole !== "admin" : (typeof uwRoleIndex === "function" ? uwRoleIndex(currentUserRole) < uwRoleIndex(step.role) : false)) return { ok: false, why: "Step " + step.no + " needs " + apRoleLabel(step.role) + " or above." };
  }
  if (AP_GUARDS[r.type] && sub) { const g = AP_GUARDS[r.type](sub, r, step); if (!g.ok) return { ok: false, why: g.why }; }
  return { ok: true, step: step };
}
function apDecide(sub, id, decision, comment) {
  const r = apFind(sub, id);
  if (!r) return { ok: false, error: "request" };
  const may = apMayDecide(r, sub);
  if (!may.ok) { if (may.permission) denyPermission("workflow", "approve"); return { ok: false, error: "not_allowed", why: may.why }; }
  if (decision !== "approve" && decision !== "reject") return { ok: false, error: "decision" };
  comment = String(comment || "").trim();
  if (decision === "reject" && comment.length < UC_MIN_REASON) return { ok: false, error: "reason" };
  const step = may.step;
  step.status = decision === "approve" ? "approved" : "rejected"; step.by = ucActor(); step.byRole = currentUserRole; step.at = nowStamp(); step.comment = comment;
  if (decision === "reject") { r.status = "rejected"; r.decidedAt = step.at; r.steps.filter(s => s.status === "pending").forEach(s => { s.status = "skipped"; }); }
  else if (!apCurrentStep(r)) { r.status = "approved"; r.decidedAt = step.at; }
  logDecision(sub, sub.currentStep || 6, "approval_decided", r.id + " step " + step.no + " " + step.status + " by " + step.by + (comment ? ": " + comment : "") + (r.status !== "pending" ? ". The request is " + r.status + "." : "."));
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, request: r };
}
/** An approved request for this thing that has not been used yet. */
function apApprovedFor(sub, type, entityType, entityId) { return (sub.approvals || []).find(r => r.type === type && r.entityType === entityType && String(r.entityId) === String(entityId) && r.status === "approved" && !r.consumed) || null; }
function apPendingFor(sub, type, entityType, entityId) { return (sub.approvals || []).find(r => r.type === type && r.entityType === entityType && String(r.entityId) === String(entityId) && r.status === "pending") || null; }

// ----------------------------------------------------------------------------
// 3. THE OVERRIDE OF A KNOCKOUT GOES THROUGH A CHAIN WHEN ONE IS IN FORCE
// ----------------------------------------------------------------------------
(function apInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.approval_requested = { label: "Approval Requested", icon: "ph-hand-pointing", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.approval_decided = { label: "Approval Step Decided", icon: "ph-stamp", badge: "badge-info", outcome: "outcome-approve" };
  }
  const orig = window.uwApplyRuleOverride;
  if (typeof orig !== "function") return;
  window.uwApplyRuleOverride = function (sub, ruleId, reason) {
    if (!apChainFor("uw_override")) return orig.apply(this, arguments);
    const rule = (sub.appetiteRules || []).find(r => r.ruleId === ruleId);
    if (!rule || rule.manualPassOverride) return orig.apply(this, arguments);
    const done = apApprovedFor(sub, "uw_override", "appetite_rule", ruleId);
    if (done) { const r = orig.apply(this, arguments); if (r.ok) { done.consumed = true; r.record.approvalRequestId = done.id; } return r; }
    if (!hasPermission("appetiteRules", "override")) { denyPermission("appetiteRules", "override"); return { ok: false, error: "permission" }; }
    if (String(reason || "").trim().length < UW_OVERRIDE_MIN_REASON) return { ok: false, error: "reason" };
    const pend = apPendingFor(sub, "uw_override", "appetite_rule", ruleId) || apRequest(sub, { type: "uw_override", entityType: "appetite_rule", entityId: ruleId, note: (rule.factor || ruleId) + ": " + String(reason).trim() }).request;
    return { ok: false, error: "approval_pending", approvalId: pend.id };
  };
})();

// ----------------------------------------------------------------------------
// 4. SCREENS: THE CHAIN REGISTER AND THE REQUESTS ON A CASE
// ----------------------------------------------------------------------------
function apChainsHtml() {
  const edit = ucCan("edit");
  const roles = ["*", "admin"].concat(typeof AUTH_ROLE_ORDER !== "undefined" ? AUTH_ROLE_ORDER : []);
  const roleOpts = roles.map(r => `<option value="${r}">${escHtml(apRoleLabel(r))}</option>`).join("");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New approval chain</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="ap_code">Code</label><input class="form-control" id="ap_code"></div><div class="form-group mw-wide"><label for="ap_name">Name</label><input class="form-control" id="ap_name"></div>
    <div class="form-group"><label for="ap_type">Approves</label><select class="form-control" id="ap_type">${Object.keys(AP_TYPES).map(k => `<option value="${k}">${escHtml(AP_TYPES[k])}</option>`).join("")}</select></div><div class="form-group"><label for="ap_from">Starts</label><input type="date" class="form-control" id="ap_from" value="${todayIso()}"></div>
    ${[1, 2, 3].map(n => `<div class="form-group"><label for="ap_r${n}">Step ${n}: lowest role${n > 1 ? " (optional)" : ""}</label><select class="form-control" id="ap_r${n}">${n > 1 ? '<option value="">None</option>' : ""}${roleOpts}</select></div><div class="form-group"><label for="ap_a${n}">Step ${n}: applies from amount</label><input class="form-control" id="ap_a${n}" placeholder="always"></div>`).join("")}</div>
    <div class="p1-note">With no chain in force a request has one step that any person who may approve (not the requester) can take.</div><div class="p1-actions"><button class="btn btn-primary" onclick="apAddChainUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing chains needs edit rights on review rules.</div>`;
  const rows = AP.chains.slice().reverse().map(c => `<tr><td><strong>${escHtml(c.code)}</strong> v${c.version}<div class="p1-note">${escHtml(c.name)}</div></td><td>${escHtml(AP_TYPES[c.type])}</td><td>${c.steps.map(s => `${s.no}. ${escHtml(apRoleLabel(s.role))}${s.minAmount !== null && s.minAmount !== undefined ? " (from " + s.minAmount + ")" : ""}`).join("<br>")}</td><td>${ucStatusBadge(c.status)}${c.rejectedReason ? `<div class="p1-note">Sent back: ${escHtml(c.rejectedReason)}</div>` : ""}</td><td>${ucActionsHtml("apChainAct", c)}</td></tr>`).join("");
  return form + (AP.chains.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Chain</th><th>Approves</th><th>Steps</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No approval chain is registered. Every request follows the default: one approver who is not the requester.</div>`);
}
function apAddChainUi() {
  const steps = [1, 2, 3].map(n => ({ role: ucV("ap_r" + n), minAmount: ucV("ap_a" + n) })).filter(s => s.role);
  const r = apAddChain({ code: ucV("ap_code"), name: ucV("ap_name"), type: ucV("ap_type"), effectiveFrom: ucV("ap_from"), steps: steps });
  ucToast(r, "Draft created."); ucRender();
}
function apCaseHtml(sub) {
  const list = (sub.approvals || []).slice().reverse();
  if (!list.length) return '<div class="mw-empty">No approval has been requested on this case.</div>';
  return `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Request</th><th>What</th><th>Steps</th><th>Status</th><th></th></tr></thead><tbody>${list.map(r => {
    const may = r.status === "pending" ? apMayDecide(r, sub) : { ok: false };
    return `<tr><td>${escHtml(r.id)}<div class="p1-note">${escHtml(r.requestedBy)} · ${escHtml(r.requestedAt)}</div></td><td>${escHtml(AP_TYPES[r.type])}${r.amount !== null ? " " + escHtml(r.amount) : ""}<div class="p1-note">${escHtml(r.note)}</div></td><td>${r.steps.map(s => `${s.no}. ${escHtml(apRoleLabel(s.role))}: ${escHtml(s.status)}${s.by ? " (" + escHtml(s.by) + ")" : ""}${s.comment ? '<div class="p1-note">' + escHtml(s.comment) + "</div>" : ""}`).join("<br>")}<div class="p1-note">${r.chainCode ? "chain " + escHtml(r.chainCode) + " v" + r.chainVersion : "default chain"}</div></td><td><span class="badge ${r.status === "approved" ? "badge-success" : r.status === "rejected" ? "badge-danger" : "badge-warning"}">${escHtml(r.status)}</span></td>
      <td>${may.ok ? `<button class="btn btn-xs btn-primary" onclick="apDecideUi('${r.id}','approve')">Approve</button> <button class="btn btn-xs btn-outline" onclick="apDecideUi('${r.id}','reject')">Reject</button>` : r.status === "pending" ? `<span class="p1-note">${escHtml(may.why || "")}</span>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
}
function apDecideUi(id, decision) {
  const sub = typeof cfSub === "function" ? cfSub() : (typeof uwActive === "function" ? uwActive() : null); if (!sub) return;
  let comment = "";
  if (decision === "reject") { comment = window.prompt("Why is it rejected? (at least " + UC_MIN_REASON + " characters)", ""); if (comment === null) return; }
  const r = apDecide(sub, id, decision, comment);
  showToast(r.ok ? "✅ Step " + (decision === "approve" ? "approved." : "rejected.") : "⛔ " + (r.why || (r.error === "reason" ? "Give a reason of at least " + UC_MIN_REASON + " characters." : r.error)), r.ok ? "success" : "danger");
  if (typeof cfRender === "function") cfRender();
}

ucRegisterTab("approvals", "Approval chains", "ph-stamp", apChainsHtml, () => AP.chains.filter(c => c.status === "pending").length);
if (typeof urRegisterSection === "function") urRegisterSection("approvals", "Approvals", apCaseHtml);
