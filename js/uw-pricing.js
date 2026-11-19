/**
 * ============================================================================
 * PRICING ADJUSTMENTS: FILED LIMITS, A SET ORDER, AUTHORITY AND APPROVAL
 * ----------------------------------------------------------------------------
 * The underwriter's one credit or debit becomes a set of recorded adjustments applied to the technical premium in order:
 *
 *   RULE        in a register: the type (schedule rating, experience modification, underwriter debit, underwriter credit, negotiated), the
 *               filed minimum and maximum percentage, whether it applies to the technical premium or to the running premium (after the
 *               adjustments before it), whether it must be filed (and the filing reference), and where and when it applies. A rule is
 *               proposed by one person and put in force by a different one, and is versioned.
 *   ADJUSTMENT  on a case: the rule and version it follows, the percentage (a credit is negative), the basis, its place in the order,
 *               the amount it moved the premium by, the reason, and who asked for it. A percentage outside the filed range is refused.
 *   AUTHORITY   within the person's own debit or credit ceiling (their authority level) it applies at once; above it, it goes to an
 *               approval request (js/uw-approvals.js), taken by someone whose own ceiling covers the percentage. Each test is an
 *               authority-check row (js/uw-records.js).
 *   PREMIUM     the applied adjustments, in order, give the adjusted premium; the quote's credit or debit follows from it.
 *
 * A type with no rule in force keeps the earlier single credit or debit exactly as it was (and records it as an adjustment). Nothing
 * is built in: no percentage or filing is invented.
 * ============================================================================
 */

const PA_KEY = "FUT_UW_PRICING_V1";
const PA_TYPES = { schedule_rating: "Schedule rating", experience_mod: "Experience modification", uw_debit: "Underwriter debit", uw_credit: "Underwriter credit", negotiated: "Negotiated change" };
const PA_BASES = { technical: "Technical premium", running: "Running premium (after earlier adjustments)" };
var PA = { rules: [], seq: 0 };
try { const r = JSON.parse(localStorage.getItem(PA_KEY)); if (r && Array.isArray(r.rules)) PA = Object.assign(PA, r); } catch (e) { /* none yet */ }
function paSave() { try { localStorage.setItem(PA_KEY, JSON.stringify(PA)); } catch (e) { /* keep for this session */ } }
function paPct(n) { return Math.round(Number(n) * 1e6) / 1e6; }

// ----------------------------------------------------------------------------
// 1. THE RULE REGISTER
// ----------------------------------------------------------------------------
function paValidateRule(r) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(r.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (!PA_TYPES[r.type]) e.push("choose the type");
  if (!(isFinite(r.minPct) && isFinite(r.maxPct))) e.push("enter the filed minimum and maximum percentage");
  else {
    if (r.minPct > r.maxPct) e.push("the minimum is above the maximum");
    if (r.type === "uw_credit" && r.maxPct > 0) e.push("a credit range must be zero or below");
    if (r.type === "uw_debit" && r.minPct < 0) e.push("a debit range must be zero or above");
    if (Math.abs(r.minPct) > 100 || Math.abs(r.maxPct) > 100) e.push("a percentage is within 100");
  }
  if (!PA_BASES[r.basis]) e.push("choose whether it applies to the technical or the running premium");
  if (r.requiresFiling && String(r.filingRef || "").trim().length < 3) e.push("a rule that must be filed needs the filing reference");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom || "")) e.push("enter the date it starts");
  return e;
}
function paAddRule(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const r = { id: "PR-" + (++PA.seq), code: String(f.code || "").trim(), name: String(f.name || "").trim(), version: 1, type: f.type, minPct: f.minPct === "" ? NaN : Number(f.minPct), maxPct: f.maxPct === "" ? NaN : Number(f.maxPct), basis: f.basis, requiresFiling: !!f.requiresFiling, filingRef: String(f.filingRef || "").trim(),
    scope: { lob: f.lob || "*", state: f.state || "*" }, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = paValidateRule(r);
  if (PA.rules.some(x => x.code === r.code)) errs.push("a rule with this code exists; start a new version of it");
  if (errs.length) { PA.seq--; return { ok: false, error: "invalid", errors: errs }; }
  PA.rules.push(r); paSave();
  return { ok: true, rule: r };
}
function paRuleAct(id, what) {
  const r = PA.rules.find(x => x.id === id); if (!r) return;
  const res = ucAct(PA.rules, r, what, "PR-" + (++PA.seq));
  if (!res.ok && what === "newver") PA.seq--;
  if (res.error !== "cancelled") ucToast(res, "Done.");
  paSave(); ucRender();
}
/** The rule in force for a type, for this case's line and state, on a date. */
function paRuleFor(sub, type, day) {
  const st = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  return PA.rules.filter(r => r.type === type && r.status === "active" && ucInForce(r.effectiveFrom, r.effectiveTo, day) && ucScopeHas(r.scope.lob, sub.lobKey) && (r.scope.state === "*" || (st && ucScopeHas(r.scope.state, st)))).slice(-1)[0] || null;
}

// ----------------------------------------------------------------------------
// 2. ADJUSTMENTS ON A CASE
// ----------------------------------------------------------------------------
function paList(sub) { if (!sub.pricingAdjustments) sub.pricingAdjustments = []; return sub.pricingAdjustments; }
/** The caps the signed-in person works within, as percentages. */
function paCapFor(sub, pct) { const c = uwDiscretionaryCaps(sub); return pct < 0 ? c.credit : c.debit; }
/** Applies the applied adjustments in order to the technical premium and updates the quote's credit or debit. */
function paRecompute(sub) {
  const dp = ensureDiscretionaryPricingSeed(sub), tech = dp.basePremium, list = paList(sub).filter(a => a.status === "applied").sort((a, b) => a.sequence - b.sequence);
  let run = tech;
  list.forEach(a => { const basisAmt = a.basis === "running" ? run : tech; a.amount = Math.round(basisAmt * a.pct / 100); run += a.amount; });
  dp.technicalPremium = tech; dp.adjustedPremium = run; dp.adjustments = list.map(a => ({ id: a.id, type: a.type, pct: a.pct, basis: a.basis, amount: a.amount }));
  if (!list.length) { dp.adjustmentType = null; dp.adjustmentPercent = 0; dp.reason = null; dp.appliedBy = null; dp.appliedAt = null; }
  else {
    const net = tech ? (run - tech) / tech * 100 : 0;
    dp.adjustmentType = net < 0 ? "credit" : "debit"; dp.adjustmentPercent = paPct(Math.abs(net));
    dp.reason = list.map(a => PA_TYPES[a.type] + ": " + a.reason).join(" | "); dp.appliedBy = list[list.length - 1].appliedBy; dp.appliedAt = list[list.length - 1].appliedAt;
  }
  const f = recomputeFinalQuotedPremium(sub);
  sub.currentPremium = f;
  return { technical: tech, adjusted: run, final: f };
}
function paApply(sub, adj) {
  if (adj.approvalRequestId) { const r = apFind(sub, adj.approvalRequestId); if (!r || r.status !== "approved") return { ok: false, error: "not_approved" }; }
  if (adj.status === "applied") return { ok: false, error: "state" };
  adj.status = "applied"; adj.appliedAt = nowStamp(); adj.appliedBy = ucActor();
  const t = paRecompute(sub);
  logDecision(sub, sub.currentStep || 6, "pricing_adjustment_applied", adj.id + ": " + PA_TYPES[adj.type] + " " + (adj.pct > 0 ? "+" : "") + adj.pct + "% on the " + adj.basis + " premium (" + (adj.amount >= 0 ? "+" : "") + adj.amount + "), order " + adj.sequence + (adj.ruleCode ? ", rule " + adj.ruleCode + " v" + adj.ruleVersion : "") + ". " + adj.reason + " Premium now " + t.final + ".");
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, totals: t };
}
/** Proposes an adjustment: { type, pct (a credit is negative), reason }. */
function paPropose(sub, o) {
  if (!hasPermission("premiumAdjustment", "edit")) { denyPermission("premiumAdjustment", "edit"); return { ok: false, error: "permission" }; }
  if (!PA_TYPES[o.type]) return { ok: false, error: "type" };
  if (policyIsBound(sub)) return { ok: false, error: "bound" };
  const pct = Number(o.pct), reason = String(o.reason || "").trim();
  if (!isFinite(pct) || pct === 0) return { ok: false, error: "pct" };
  if (reason.length < 10) return { ok: false, error: "reason" };
  const rule = paRuleFor(sub, o.type);
  if (!rule) return { ok: false, error: "no_rule" };
  if (pct < rule.minPct || pct > rule.maxPct) return { ok: false, error: "range", min: rule.minPct, max: rule.maxPct };
  const list = paList(sub);
  const adj = { id: "PA-" + (list.length + 1), ruleId: rule.id, ruleCode: rule.code, ruleVersion: rule.version, type: o.type, pct: paPct(pct), basis: rule.basis, sequence: list.filter(a => a.status !== "withdrawn" && a.status !== "rejected").length + 1, reason: reason,
    filedUnder: rule.requiresFiling ? rule.filingRef : "", requestedBy: ucActor(), requestedAt: nowStamp(), status: "proposed", amount: null };
  list.push(adj);
  const cap = paCapFor(sub, pct), within = Math.abs(pct) <= cap;
  urCheck(sub, { subjectType: "pricing_adjustment", subjectId: adj.id, source: "uw_authority_level", sourceId: (uwDiscretionaryCaps(sub).level || {}).id || "", measure: pct < 0 ? "credit_pct" : "debit_pct", checkedValue: Math.abs(pct), limitValue: cap, result: within ? "within_authority" : "referred" });
  if (within) {
    const r = paApply(sub, adj);
    return { ok: true, adjustment: adj, applied: r.ok, totals: r.totals };
  }
  const req = apRequest(sub, { type: "pricing_adjustment", entityType: "pricing_adjustment", entityId: adj.id, amount: Math.abs(pct), note: PA_TYPES[adj.type] + " " + (pct > 0 ? "+" : "") + pct + "%: " + reason }).request;
  adj.status = "pending_approval"; adj.approvalRequestId = req.id;
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, adjustment: adj, applied: false, approvalRequestId: req.id };
}
/** An approved adjustment is put on the premium. */
function paApplyApproved(sub, id) {
  const adj = paList(sub).find(a => a.id === id);
  if (!adj || adj.status !== "pending_approval") return { ok: false, error: "state" };
  if (!hasPermission("premiumAdjustment", "edit")) { denyPermission("premiumAdjustment", "edit"); return { ok: false, error: "permission" }; }
  const req = apFind(sub, adj.approvalRequestId);
  if (req && req.status === "rejected") { adj.status = "rejected"; return { ok: true, rejected: true }; }
  const r = paApply(sub, adj);
  if (r.ok) { const rq = apFind(sub, adj.approvalRequestId); if (rq) rq.consumed = true; urCheck(sub, { subjectType: "pricing_adjustment", subjectId: adj.id, source: "uw_authority_level", sourceId: "", measure: adj.pct < 0 ? "credit_pct" : "debit_pct", checkedValue: Math.abs(adj.pct), limitValue: null, result: "approved", approvalRequestId: adj.approvalRequestId }); }
  return r;
}
function paWithdraw(sub, id, reason) {
  const adj = paList(sub).find(a => a.id === id);
  if (!adj || ["applied", "pending_approval", "proposed"].indexOf(adj.status) < 0) return { ok: false, error: "state" };
  if (!hasPermission("premiumAdjustment", "edit")) { denyPermission("premiumAdjustment", "edit"); return { ok: false, error: "permission" }; }
  if (policyIsBound(sub)) return { ok: false, error: "bound" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  const was = adj.status; adj.status = "withdrawn"; adj.withdrawnBy = ucActor(); adj.withdrawnAt = nowStamp(); adj.withdrawnReason = String(reason).trim();
  if (was === "applied") paRecompute(sub);
  logDecision(sub, sub.currentStep || 6, "pricing_adjustment_withdrawn", adj.id + " withdrawn: " + adj.withdrawnReason);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 3. THE EARLIER CREDIT / DEBIT DIALOG
// ----------------------------------------------------------------------------
(function paInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.pricing_adjustment_applied = { label: "Pricing Adjustment Applied", icon: "ph-sliders", badge: "badge-info", outcome: "outcome-approve" };
    AUDIT_ACTION_META.pricing_adjustment_withdrawn = { label: "Pricing Adjustment Withdrawn", icon: "ph-arrow-counter-clockwise", badge: "badge-warning", outcome: "outcome-refer" };
  }
  if (typeof apRegisterGuard === "function") {
    // whoever approves a percentage must hold a ceiling that covers it
    apRegisterGuard("pricing_adjustment", (sub, r) => {
      const adj = paList(sub).find(a => a.id === r.entityId); if (!adj) return { ok: true };
      const cap = paCapFor(sub, adj.pct);
      return Math.abs(adj.pct) <= cap ? { ok: true } : { ok: false, why: "Your own ceiling is " + cap + "%, below the " + Math.abs(adj.pct) + "% asked for." };
    });
  }
  const orig = window.saveDiscretionaryPricing;
  if (typeof orig !== "function") return;
  window.saveDiscretionaryPricing = function () {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === discretionaryPricingTargetId);
    const tEl = document.getElementById("dpAdjustmentType"), pEl = document.getElementById("dpPercentInput"), rEl = document.getElementById("dpReason");
    if (!sub || !tEl || !pEl || !rEl) return orig.apply(this, arguments);
    const type = tEl.value === "credit" ? "uw_credit" : "uw_debit";
    if (!paRuleFor(sub, type)) {
      // no filed rule for this type: the earlier single credit or debit, exactly as before, recorded as an adjustment
      const before = sub.discretionaryPricing && sub.discretionaryPricing.appliedAt;
      const r = orig.apply(this, arguments);
      const dp = sub.discretionaryPricing;
      if (dp && dp.adjustmentType && dp.appliedAt !== before) {
        const list = paList(sub); list.filter(a => a.status === "applied").forEach(a => { a.status = "superseded"; });
        const pct = dp.adjustmentType === "credit" ? -Math.abs(dp.adjustmentPercent) : Math.abs(dp.adjustmentPercent);
        list.push({ id: "PA-" + (list.length + 1), ruleId: null, ruleCode: null, ruleVersion: null, type: dp.adjustmentType === "credit" ? "uw_credit" : "uw_debit", pct: pct, basis: "technical", sequence: 1, reason: dp.reason, filedUnder: "", requestedBy: dp.appliedBy, requestedAt: dp.appliedAt, status: "applied", appliedBy: dp.appliedBy, appliedAt: dp.appliedAt, amount: Math.round(dp.basePremium * pct / 100), legacy: true });
      }
      return r;
    }
    const pct = parseFloat(pEl.value) || 0, res = paPropose(sub, { type: type, pct: type === "uw_credit" ? -Math.abs(pct) : Math.abs(pct), reason: rEl.value });
    showToast(res.ok ? (res.applied ? "✅ Adjustment applied." : "⏳ The adjustment needs approval (" + res.approvalRequestId + ").") : "⛔ " + paMessage(res), res.ok ? "success" : "danger");
    if (res.ok) { closeDiscretionaryPricingModal(); if (typeof renderStep7View === "function") renderStep7View(sub); if (typeof renderSubmissionsTable === "function") renderSubmissionsTable(); }
  };
})();
function paMessage(r) {
  return ({ permission: "You do not have the right to adjust the premium.", type: "Choose the type of adjustment.", bound: "The policy is bound.", pct: "Enter a percentage that is not zero.", reason: "Give a reason of at least 10 characters.", no_rule: "No filed rule is in force for this type, line and state.",
    range: "The percentage is outside the filed range" + (r.min !== undefined ? " (" + r.min + "% to " + r.max + "%)." : "."), state: "That cannot be done in its present state.", not_approved: "The approval has not been given." })[r.error] || r.error;
}

// ----------------------------------------------------------------------------
// 4. SCREENS
// ----------------------------------------------------------------------------
function paRulesHtml() {
  const edit = ucCan("edit");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New pricing adjustment rule</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="pa_code">Code</label><input class="form-control" id="pa_code"></div><div class="form-group mw-wide"><label for="pa_name">Name</label><input class="form-control" id="pa_name"></div>
    <div class="form-group"><label for="pa_type">Type</label><select class="form-control" id="pa_type">${Object.keys(PA_TYPES).map(k => `<option value="${k}">${escHtml(PA_TYPES[k])}</option>`).join("")}</select></div><div class="form-group"><label for="pa_basis">Applies to</label><select class="form-control" id="pa_basis">${Object.keys(PA_BASES).map(k => `<option value="${k}">${escHtml(PA_BASES[k])}</option>`).join("")}</select></div>
    <div class="form-group"><label for="pa_min">Filed minimum %</label><input class="form-control" id="pa_min"></div><div class="form-group"><label for="pa_max">Filed maximum %</label><input class="form-control" id="pa_max"></div>
    <div class="form-group"><label><input type="checkbox" id="pa_filing"> Must be filed</label></div><div class="form-group"><label for="pa_fref">Filing reference</label><input class="form-control" id="pa_fref"></div>
    <div class="form-group"><label for="pa_lob">Line key (or all)</label><input class="form-control" id="pa_lob" placeholder="*"></div><div class="form-group"><label for="pa_state">States (comma list, or all)</label><input class="form-control" id="pa_state" placeholder="*"></div>
    <div class="form-group"><label for="pa_from">Starts</label><input type="date" class="form-control" id="pa_from" value="${todayIso()}"></div><div class="form-group"><label for="pa_to">Ends (optional)</label><input type="date" class="form-control" id="pa_to"></div></div>
    <div class="p1-note">A credit's range is zero or below; a debit's is zero or above. No percentage is built in.</div><div class="p1-actions"><button class="btn btn-primary" onclick="paAddRuleUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing pricing rules needs edit rights on review rules.</div>`;
  const rows = PA.rules.slice().reverse().map(r => `<tr><td><strong>${escHtml(r.code)}</strong> v${r.version}<div class="p1-note">${escHtml(r.name)}</div></td><td>${escHtml(PA_TYPES[r.type])}</td><td>${r.minPct}% to ${r.maxPct}%<div class="p1-note">${escHtml(PA_BASES[r.basis])}</div></td><td>${r.requiresFiling ? "Filed: " + escHtml(r.filingRef) : "Not filed"}</td><td>${escHtml("lob: " + ucListText(r.scope.lob) + " · state: " + ucListText(r.scope.state))}<div class="p1-note">${escHtml(r.effectiveFrom)} to ${escHtml(r.effectiveTo || "open")}</div></td><td>${ucStatusBadge(r.status)}${r.rejectedReason ? `<div class="p1-note">Sent back: ${escHtml(r.rejectedReason)}</div>` : ""}</td><td>${ucActionsHtml("paRuleAct", r)}</td></tr>`).join("");
  return form + (PA.rules.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Rule</th><th>Type</th><th>Filed range</th><th>Filing</th><th>Where and when</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No pricing adjustment rule is recorded. The single credit or debit works as before until rules are registered.</div>`);
}
function paAddRuleUi() {
  const r = paAddRule({ code: ucV("pa_code"), name: ucV("pa_name"), type: ucV("pa_type"), basis: ucV("pa_basis"), minPct: ucV("pa_min"), maxPct: ucV("pa_max"), requiresFiling: !!(document.getElementById("pa_filing") || {}).checked, filingRef: ucV("pa_fref"), lob: ucV("pa_lob") || "*", state: ucList(ucV("pa_state") || "*"), effectiveFrom: ucV("pa_from"), effectiveTo: ucV("pa_to") });
  ucToast(r, "Draft created."); ucRender();
}
function paCaseHtml(sub) {
  const list = paList(sub).slice().reverse();
  const dp = sub.discretionaryPricing;
  const canEdit = hasPermission("premiumAdjustment", "edit") && !policyIsBound(sub);
  const form = canEdit ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="pc_type">Type</label><select class="form-control" id="pc_type">${Object.keys(PA_TYPES).map(k => `<option value="${k}">${escHtml(PA_TYPES[k])}</option>`).join("")}</select></div><div class="form-group"><label for="pc_pct">Percent (a credit is negative)</label><input class="form-control" id="pc_pct"></div><div class="form-group mw-wide"><label for="pc_reason">Reason</label><input class="form-control" id="pc_reason"></div></div><button class="btn btn-sm btn-outline" onclick="paProposeUi()">Propose the adjustment</button>` : "";
  const rows = list.map(a => `<tr><td>${escHtml(a.id)}<div class="p1-note">order ${a.sequence}${a.legacy ? " · earlier credit/debit" : ""}</div></td><td>${escHtml(PA_TYPES[a.type])}${a.ruleCode ? `<div class="p1-note">rule ${escHtml(a.ruleCode)} v${a.ruleVersion}${a.filedUnder ? " · filed " + escHtml(a.filedUnder) : ""}</div>` : ""}</td><td>${a.pct > 0 ? "+" : ""}${a.pct}%<div class="p1-note">${escHtml(PA_BASES[a.basis])}</div></td><td>${a.amount === null ? "—" : (a.amount >= 0 ? "+" : "") + a.amount}</td><td>${escHtml(a.reason)}<div class="p1-note">${escHtml(a.requestedBy)} · ${escHtml(a.requestedAt)}${a.approvalRequestId ? " · " + escHtml(a.approvalRequestId) : ""}</div></td><td><span class="badge badge-light">${escHtml(a.status.replace(/_/g, " "))}</span></td>
    <td>${a.status === "pending_approval" && canEdit ? `<button class="btn btn-xs btn-primary" onclick="paApplyUi('${a.id}')">Apply if approved</button> ` : ""}${["applied", "pending_approval"].indexOf(a.status) > -1 && canEdit ? `<button class="btn btn-xs btn-outline" onclick="paWithdrawUi('${a.id}')">Withdraw</button>` : ""}</td></tr>`).join("");
  return `${dp && dp.adjustedPremium !== undefined ? `<div class="p1-note">Technical premium ${dp.technicalPremium} → adjusted ${dp.adjustedPremium} → quoted ${dp.finalPremium} (after broker commission).</div>` : ""}${list.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Adjustment</th><th>Type</th><th>Percent</th><th>Moved premium by</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="mw-empty">No pricing adjustment on this case.</div>'}${form}`;
}
function paProposeUi() {
  const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return;
  const r = paPropose(sub, { type: ucV("pc_type"), pct: ucV("pc_pct"), reason: ucV("pc_reason") });
  showToast(r.ok ? (r.applied ? "✅ Adjustment applied." : "⏳ The adjustment needs approval (" + r.approvalRequestId + ").") : "⛔ " + paMessage(r), r.ok ? "success" : "danger");
  if (typeof cfRender === "function") cfRender();
}
function paApplyUi(id) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = paApplyApproved(sub, id); showToast(r.ok ? (r.rejected ? "The request was rejected." : "✅ Adjustment applied.") : "⛔ " + paMessage(r), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function paWithdrawUi(id) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const why = window.prompt("Why is it withdrawn? (at least 10 characters)", ""); if (why === null) return; const r = paWithdraw(sub, id, why); showToast(r.ok ? "✅ Withdrawn." : "⛔ " + paMessage(r), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }

ucRegisterTab("pricing", "Pricing adjustments", "ph-sliders", paRulesHtml, () => PA.rules.filter(r => r.status === "pending").length);
if (typeof urRegisterSection === "function") urRegisterSection("pricing", "Pricing adjustments", paCaseHtml);
