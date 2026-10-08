/**
 * ============================================================================
 * POLICY CHANGES: ENDORSEMENT, CANCELLATION, REINSTATEMENT (Add-On) — gap G16
 * ----------------------------------------------------------------------------
 * After a policy is bound it is not finished. This module handles what happens
 * to it mid-term:
 *
 *   ENDORSEMENT     a change to the policy (add or remove a vehicle, driver or
 *                   location, change limits, add an additional insured, and so on),
 *                   effective from a date, with the premium change pro-rated to the
 *                   end of the term. A change backdated before today, or a large
 *                   premium change, needs senior authority.
 *   CANCELLATION    by the insured (short-rate penalty and the minimum earned
 *                   premium apply) or by the insurer (pro-rata). An insurer
 *                   cancellation must give advance notice, whose length depends
 *                   on the reason and on state law: nonpayment is shorter. The
 *                   effective date cannot be earlier than the notice allows. A
 *                   notice that has been sent but has not yet taken effect can be
 *                   rescinded.
 *   REINSTATEMENT   after a cancellation took effect: "with lapse" (a gap with no
 *                   coverage) or "without lapse" (continuous, which needs senior
 *                   authority and a no-known-loss statement).
 *
 * Links to the other modules: a cancellation that takes effect revokes the
 * certificates of insurance and voids the binders; notices go to lenders and
 * other interested parties named on certificates; a "failure to satisfy a
 * subjectivity" reason requires an overdue post-bind subjectivity.
 *
 * IMPORTANT: notice periods are STATE LAW. The defaults below (10 days for
 * nonpayment, 30 days otherwise) are placeholders; PC_NOTICE_STATE_RULES is
 * empty for Compliance to fill in per state, together with state notice
 * wording. The new-business underwriting window, short-rate penalty, minimum
 * earned premium and reinstatement window are configuration, not rules of
 * law. Refunds are estimates; the policy and state law govern the actual
 * amounts, and accounting settles them.
 * ============================================================================
 */

var PC_NOTICE_DEFAULTS = { nonpayment: 10, other: 30 };
var PC_NOTICE_STATE_RULES = {};            // e.g. { TX: { nonpayment: 10, other: 30, text: "…state wording…" } }
var PC_SHORT_RATE_PENALTY_PCT = 10;        // share of the unearned premium kept when the INSURED cancels
var PC_MEP_APPLIES_TO_INSURER_CANCEL = false;
var PC_DEFAULT_MEP_PCT = 25;               // overridden by the submission's min_earn_factor
var PC_UW_REASON_WINDOW_DAYS = 60;         // "underwriting reasons" may be used only this soon after inception
var PC_REINSTATE_WINDOW_DAYS = 30;         // later reinstatement needs senior authority
var PC_LARGE_CHANGE_PCT = 25;              // endorsement premium change above this share of annual premium needs senior authority
var PC_NON_REFUNDABLE_FEE_CODES = ["FEE_POLICY", "FEE_BROKER", "FEE_INSPECT", "FEE_MVR", "FEE_VEHINSP", "FEE_SLFILE"];
var PC_TEMPLATE_META = { version: "DRAFT-0.1", approved: false };

var PC_ENDORSEMENT_TYPES = [
  { key: "vehicle", label: "Add or remove a vehicle", needsForm: false },
  { key: "driver", label: "Add or remove a driver", needsForm: false },
  { key: "location", label: "Add or remove a location", needsForm: false },
  { key: "limits", label: "Change limits or deductibles", needsForm: false },
  { key: "address", label: "Change of address", needsForm: false },
  { key: "named_insured", label: "Change of named insured", needsForm: false },
  { key: "additional_insured", label: "Add additional insured / waiver / primary wording", needsForm: true },
  { key: "other", label: "Other change", needsForm: false }
];

var PC_REASONS_INSURER = [
  { code: "NONPAYMENT", label: "Nonpayment of premium", cls: "nonpayment" },
  { code: "MISREP", label: "Material misrepresentation or fraud", cls: "other" },
  { code: "SUBJECTIVITY", label: "Failure to satisfy a subjectivity after binding", cls: "other" },
  { code: "COND_VIOL", label: "Violation of a policy condition", cls: "other" },
  { code: "CHANGE_RISK", label: "Substantial change in the risk", cls: "other" },
  { code: "UW_PERIOD", label: "Underwriting reasons (new-business window only)", cls: "other" }
];
var PC_REASONS_INSURED = [
  { code: "SOLD", label: "Business sold or closed" },
  { code: "REPLACED", label: "Replaced by other insurance" },
  { code: "NOT_NEEDED", label: "Coverage no longer needed" },
  { code: "OTHER", label: "Other (explain in notes)" }
];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function pcToday() { return new Date().toISOString().slice(0, 10); }
function pcAdd(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); }
function pcDays(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000); }
function pcRound(n) { return Math.round(n * 100) / 100; }
function pcMoney(n) { const v = Number(n || 0); return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/** Days of advance notice an insurer must give. */
function pcNoticeDays(reasonCode, state) {
  const reason = PC_REASONS_INSURER.find(r => r.code === reasonCode);
  const cls = reason ? reason.cls : "other";
  const st = state && PC_NOTICE_STATE_RULES[state];
  return (st && typeof st[cls] === "number") ? st[cls] : PC_NOTICE_DEFAULTS[cls];
}

/**
 * Estimated refund on cancellation.
 * p: { base (refundable premium), effective, expiration, cancelEff, initiator: "insured"|"insurer", flat, mepPct }
 */
function pcRefund(p) {
  const total = Math.max(1, pcDays(p.effective, p.expiration));
  const flat = !!p.flat || p.cancelEff <= p.effective;
  const earnedDays = flat ? 0 : Math.min(total, Math.max(0, pcDays(p.effective, p.cancelEff)));
  const proRataEarned = pcRound(p.base * earnedDays / total);
  const unearned = pcRound(p.base - proRataEarned);
  let penalty = 0, earned = proRataEarned, mepApplied = false;
  if (flat) { earned = 0; }
  else if (p.initiator === "insured") {
    penalty = pcRound(unearned * PC_SHORT_RATE_PENALTY_PCT / 100);
    earned = pcRound(proRataEarned + penalty);
  }
  const mepPct = typeof p.mepPct === "number" ? p.mepPct : PC_DEFAULT_MEP_PCT;
  const mepApplies = !flat && (p.initiator === "insured" || PC_MEP_APPLIES_TO_INSURER_CANCEL);
  if (mepApplies) {
    const mep = pcRound(p.base * mepPct / 100);
    if (earned < mep) { earned = mep; mepApplied = true; }
  }
  earned = Math.min(earned, p.base);
  return { totalDays: total, earnedDays, proRataEarned, unearned, penalty, earned, refund: pcRound(p.base - earned), mepApplied, mepPct, flat };
}

function pcRemainingFraction(effective, expiration, from) {
  const total = Math.max(1, pcDays(effective, expiration));
  const left = Math.min(total, Math.max(0, pcDays(from, expiration)));
  return left / total;
}

function pcValidateEndorsement(ctx, f) {
  const p = [];
  const type = PC_ENDORSEMENT_TYPES.find(t => t.key === f.type);
  if (!type) p.push("choose the type of change");
  if (String(f.description || "").trim().length < 10) p.push("describe the change (at least 10 characters)");
  if (!f.effective) p.push("enter the effective date of the change");
  else {
    if (f.effective < ctx.policyEffective) p.push("the change cannot take effect before the policy does");
    if (f.effective >= ctx.expiration) p.push("the change must take effect before the policy expires");
    if (f.effective < ctx.today) {
      if (!ctx.canOverride) p.push("a change backdated before today needs senior authority");
      if (!f.noKnownLoss) p.push("a backdated change needs the signed no-known-loss statement confirmed");
    }
  }
  const prem = Number(f.annualPremiumChange || 0);
  if (isNaN(prem)) p.push("the premium change must be a number");
  else if (prem !== 0) {
    if (String(f.premiumReason || "").trim().length < 5) p.push("say how the premium change was calculated");
    if (ctx.annual > 0 && Math.abs(prem) > ctx.annual * PC_LARGE_CHANGE_PCT / 100 && !ctx.canOverride) p.push(`a premium change above ${PC_LARGE_CHANGE_PCT}% of the annual premium needs senior authority`);
    if (ctx.annual + prem < 0) p.push("the change would take the annual premium below zero");
  }
  if (type && type.needsForm && String(f.formNumber || "").trim().length < 3) p.push("enter the endorsement form number");
  return p;
}

function pcValidateCancellation(ctx, f) {
  const p = [];
  const insurer = f.initiator === "insurer";
  const reason = (insurer ? PC_REASONS_INSURER : PC_REASONS_INSURED).find(r => r.code === f.reason);
  if (f.initiator !== "insured" && f.initiator !== "insurer") p.push("choose who is cancelling");
  if (!reason) p.push("choose a reason that fits who is cancelling");
  if (reason && reason.code === "OTHER" && String(f.notes || "").trim().length < 5) p.push("explain the other reason");
  if (!f.effective) { p.push("enter the cancellation effective date"); return p; }
  if (f.effective > ctx.expiration) p.push("the cancellation cannot be effective after the policy expires");
  const flat = f.effective <= ctx.policyEffective;
  if (flat && !ctx.canOverride) p.push("cancelling flat (from inception) needs senior authority");
  if (flat && String(f.notes || "").trim().length < 10) p.push("explain the flat cancellation (at least 10 characters)");

  if (insurer) {
    if (!f.mailedOn) p.push("enter the date the notice is mailed");
    if (String(f.proofRef || "").trim().length < 3) p.push("enter the proof-of-mailing reference");
    if (f.mailedOn && f.mailedOn > ctx.today) p.push("the mailing date cannot be in the future");
    if (reason) {
      const days = pcNoticeDays(reason.code, ctx.state);
      if (f.mailedOn && f.effective < pcAdd(f.mailedOn, days)) p.push(`${days} days' notice is required for this reason${ctx.state ? " in " + ctx.state : ""}; the earliest effective date is ${pcAdd(f.mailedOn, days)}`);
      if (reason.code === "UW_PERIOD" && pcDays(ctx.policyEffective, f.mailedOn || ctx.today) > PC_UW_REASON_WINDOW_DAYS) p.push(`underwriting reasons can be used only within ${PC_UW_REASON_WINDOW_DAYS} days of inception`);
      if (reason.code === "SUBJECTIVITY" && !ctx.overdueSubjectivities) p.push("there is no overdue post-bind subjectivity to cite");
      if (reason.code !== "NONPAYMENT" && String(f.notes || "").trim().length < 10) p.push("state the specific facts behind the reason (at least 10 characters)");
    }
  } else {
    if (f.effective < ctx.today && !ctx.canOverride) p.push("a cancellation backdated before today needs senior authority");
  }
  return p;
}

function pcValidateReinstatement(ctx, f) {
  const p = [];
  if (f.type !== "with_lapse" && f.type !== "without_lapse") p.push("choose with or without a lapse");
  if (String(f.reason || "").trim().length < 10) p.push("give the reason for reinstating (at least 10 characters)");
  if (!f.effective) p.push("enter the reinstatement effective date");
  else {
    if (f.type === "with_lapse" && f.effective < ctx.cancelEffective) p.push("reinstatement with a lapse cannot take effect before the cancellation did");
    if (f.effective >= ctx.expiration) p.push("the policy has already expired by that date");
  }
  if (f.type === "without_lapse") {
    if (!ctx.canOverride) p.push("reinstating without a lapse needs senior authority");
    if (!f.noKnownLoss) p.push("reinstating without a lapse needs the no-known-loss statement confirmed");
    if (String(f.payment || "").trim().length < 3) p.push("enter the payment reference that cures the cancellation");
  }
  if (ctx.today > pcAdd(ctx.cancelEffective, PC_REINSTATE_WINDOW_DAYS) && !ctx.canOverride) p.push(`it is more than ${PC_REINSTATE_WINDOW_DAYS} days since the cancellation; senior authority is needed`);
  return p;
}

// ----------------------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------------------
function pcSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function pcActiveSub() { return pcSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); }
function pcNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function pcActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function pcEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pcLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: 7, decision, by: pcActor(), at: pcNow(), notes });
}
function pcPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function pcIsBound(sub) { return !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }

function pcFacts(sub) {
  if (typeof bndFacts === "function") {
    const f = bndFacts(sub);
    return { policyNumber: f.policyNumber, effective: f.effective, expiration: f.expiration, premium: f.premium || 0 };
  }
  const dp = sub.discretionaryPricing, q = sub.importedRatingData && sub.importedRatingData.quote;
  return { policyNumber: sub.pasSync ? sub.pasSync.policyNumber : "", effective: sub.pasSync ? sub.pasSync.effectiveDate : null, expiration: null, premium: (dp && dp.finalPremium) || (q && q.finalPremium) || 0 };
}

function pcState(sub) { return sub.policyState || "in_force"; }
function pcChanges(sub) { if (!sub.policyChanges) sub.policyChanges = []; return sub.policyChanges; }

function pcLedger(sub) {
  if (!sub.policyLedger) {
    const f = pcFacts(sub);
    const q = sub.importedRatingData && sub.importedRatingData.quote;
    const fixed = ((q && q.fees) || []).filter(x => PC_NON_REFUNDABLE_FEE_CODES.indexOf(x.code) > -1).reduce((s, x) => s + (Number(x.amt) || 0), 0);
    sub.policyLedger = { baseAnnual: f.premium, currentAnnual: f.premium, nonRefundableFees: pcRound(fixed), adjustments: [] };
  }
  return sub.policyLedger;
}

function pcContext(sub, today) {
  const f = pcFacts(sub);
  return {
    today: today || pcToday(), policyEffective: f.effective, expiration: f.expiration, annual: pcLedger(sub).currentAnnual,
    canOverride: hasPermission("policyChanges", "override"),
    state: typeof deriveRiskState === "function" ? deriveRiskState(sub) : null,
    overdueSubjectivities: typeof subjStatus === "function" ? subjStatus(sub).overdue.some(i => i.timing === "post_bind") : false
  };
}

function pcMepPct(sub) {
  const v = sub.uwReviewInfo && Number(sub.uwReviewInfo.min_earn_factor);
  return v > 0 ? v : PC_DEFAULT_MEP_PCT;
}

function pcRefundFor(sub, cancelEff, initiator, flat) {
  const f = pcFacts(sub), L = pcLedger(sub);
  return pcRefund({ base: Math.max(0, L.currentAnnual - L.nonRefundableFees), effective: f.effective, expiration: f.expiration, cancelEff, initiator, flat, mepPct: pcMepPct(sub) });
}

/** People and firms who must be told about a cancellation: lienholders and other interested parties on issued certificates. */
function pcNoticeRecipients(sub) {
  const out = [{ role: "Named insured", name: sub.insured || "" }];
  if (sub.channelType !== "direct" && sub.broker) out.push({ role: "Producer", name: sub.broker });
  (sub.certificates || []).filter(c => c.status === "issued" && /mortgagee|loss payee|additional interest/i.test(c.holderType || "")).forEach(c => out.push({ role: c.holderType, name: c.holderName }));
  return out;
}

// ----------------------------------------------------------------------------
// 3. DOCUMENTS
// ----------------------------------------------------------------------------
function pcRow(l, v) { return `<tr><td style="padding:3px 12px 3px 0;color:#475569;vertical-align:top;white-space:nowrap;">${pcEsc(l)}</td><td style="padding:3px 0;">${pcEsc(v)}</td></tr>`; }
function pcDocHtml(title, rows, paras) {
  return `<h2 style="margin:0 0 4px;font-size:17px;">${pcEsc(title)}</h2>
    <div style="color:#64748b;font-size:11.5px;margin-bottom:10px;">${PC_TEMPLATE_META.approved ? "" : `Template ${PC_TEMPLATE_META.version} — not approved by Compliance; do not send outside a test environment.`}</div>
    <table style="font-size:13px;margin-bottom:10px;">${rows.map(r => pcRow(r[0], r[1])).join("")}</table>
    ${paras.map(t => `<p style="font-size:13px;white-space:pre-line;">${pcEsc(t)}</p>`).join("")}`;
}
function pcWrap(title, body, status) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${pcEsc(title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;max-width:760px;margin:30px auto;font-size:14px;line-height:1.45;color:#111;">${body}${status ? `<p style="color:#b91c1c;font-weight:700;">${pcEsc(status.toUpperCase())}</p>` : ""}</body></html>`;
}

// ----------------------------------------------------------------------------
// 4. ACTIONS
// ----------------------------------------------------------------------------
function pcV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function pcC(id) { const e = document.getElementById(id); return !!(e && e.checked); }

function pcRequireInForce(sub, what) {
  if (!pcIsBound(sub)) { showToast("⛔ The policy is not bound yet.", "danger"); return false; }
  if (pcState(sub) === "cancelled") { showToast(`⛔ The policy is cancelled; ${what} is not possible. Reinstate it first.`, "danger"); return false; }
  return true;
}

function pcIssueEndorsement() {
  const sub = pcActiveSub(); if (!sub) return;
  if (!hasPermission("policyChanges", "approve")) { denyPermission("policyChanges", "approve"); return; }
  if (!pcRequireInForce(sub, "an endorsement")) return;
  const ctx = pcContext(sub);
  const f = { type: pcV("pc_endType"), effective: pcV("pc_endEff"), description: pcV("pc_endDesc"), annualPremiumChange: pcV("pc_endPrem") || "0", premiumReason: pcV("pc_endPremWhy"), formNumber: pcV("pc_endForm"), noKnownLoss: pcC("pc_endNoLoss") };
  const problems = pcValidateEndorsement(ctx, f);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  const L = pcLedger(sub), facts = pcFacts(sub);
  const annualChange = pcRound(Number(f.annualPremiumChange));
  const remaining = pcRemainingFraction(facts.effective, facts.expiration, f.effective);
  const proRata = pcRound(annualChange * remaining);
  sub.endorsement_number = (Number(sub.endorsement_number) || 0) + 1;
  const type = PC_ENDORSEMENT_TYPES.find(t => t.key === f.type);
  const before = L.currentAnnual;
  L.currentAnnual = pcRound(L.currentAnnual + annualChange);
  L.adjustments.push({ endorsement: sub.endorsement_number, annualChange, proRata, at: pcNow() });

  const ev = { id: `END-${sub.id}-${sub.endorsement_number}`, type: "endorsement", status: "issued", number: sub.endorsement_number, endorsementType: type.label, effective: f.effective,
    description: f.description, annualChange, proRata, premiumReason: f.premiumReason, formNumber: f.formNumber || null, backdated: f.effective < ctx.today, by: pcActor(), at: pcNow() };
  ev.html = pcDocHtml(`POLICY ENDORSEMENT NO. ${ev.number}`, [
    ["Policy number", facts.policyNumber], ["Named insured", sub.insured || ""], ["Endorsement effective", `${f.effective} (12:01 AM)`], ["Type of change", type.label],
    ...(f.formNumber ? [["Endorsement form", f.formNumber]] : []),
    ["Annual premium before", pcMoney(before)], ["Annual premium change", pcMoney(annualChange)], ["Premium due or returned for the remaining term", pcMoney(proRata)], ["Annual premium after", pcMoney(L.currentAnnual)]
  ], [f.description, "All other terms, conditions and exclusions of the policy remain unchanged."]);
  pcChanges(sub).push(ev);
  pcLog(sub, "endorsement_issued", `Endorsement ${ev.number} (${type.label}) effective ${f.effective}: ${f.description}. Annual premium ${pcMoney(before)} → ${pcMoney(L.currentAnnual)} (${pcMoney(proRata)} for the remaining term).${ev.backdated ? " BACKDATED; no-known-loss statement confirmed." : ""}${f.formNumber ? " Form " + f.formNumber + "." : ""}`);
  pcPersist();
  renderPolicyChangesCard(sub);
  showToast(`Endorsement ${ev.number} issued.`, "success");
}

function pcCancellationForm() {
  return { initiator: pcV("pc_cxBy"), reason: pcV("pc_cxReason"), effective: pcV("pc_cxEff"), mailedOn: pcV("pc_cxMailed"), proofRef: pcV("pc_cxProof"), notes: pcV("pc_cxNotes") };
}

function pcPreviewRefund() {
  const sub = pcActiveSub(); const box = document.getElementById("pc_cxPreview");
  if (!sub || !box) return;
  const f = pcCancellationForm(); const facts = pcFacts(sub);
  if (!f.effective || !f.initiator || !facts.effective) { box.innerHTML = ""; return; }
  const r = pcRefundFor(sub, f.effective, f.initiator, f.effective <= facts.effective);
  const days = f.initiator === "insurer" && f.reason ? pcNoticeDays(f.reason, typeof deriveRiskState === "function" ? deriveRiskState(sub) : null) : null;
  box.innerHTML = `<div class="alert alert-info text-xs" style="margin-top:8px;"><div><strong>Estimated refund ${pcMoney(r.refund)}</strong> — earned ${pcMoney(r.earned)} of ${pcMoney(Math.max(0, pcLedger(sub).currentAnnual - pcLedger(sub).nonRefundableFees))} refundable premium (${r.earnedDays} of ${r.totalDays} days${r.penalty ? `, short-rate penalty ${pcMoney(r.penalty)}` : ""}${r.mepApplied ? `, minimum earned premium ${r.mepPct}% applies` : ""}${r.flat ? ", flat cancellation" : ""}). Fees that are fully earned are not refunded.${days ? ` Notice required: ${days} days.` : ""}</div></div>`;
}

function pcSubmitCancellation() {
  const sub = pcActiveSub(); if (!sub) return;
  if (!hasPermission("policyChanges", "approve")) { denyPermission("policyChanges", "approve"); return; }
  if (!pcIsBound(sub)) { showToast("⛔ The policy is not bound yet.", "danger"); return; }
  if (pcState(sub) !== "in_force") { showToast("⛔ A cancellation is already pending or the policy is cancelled.", "danger"); return; }
  const f = pcCancellationForm();
  const ctx = pcContext(sub);
  const problems = pcValidateCancellation(ctx, f);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  const facts = pcFacts(sub);
  const flat = f.effective <= facts.effective;
  const refund = pcRefundFor(sub, f.effective, f.initiator, flat);
  const reasonObj = (f.initiator === "insurer" ? PC_REASONS_INSURER : PC_REASONS_INSURED).find(r => r.code === f.reason);
  const copies = f.initiator === "insurer" ? pcNoticeRecipients(sub) : [];
  const stateRule = ctx.state && PC_NOTICE_STATE_RULES[ctx.state];
  const insurer = f.initiator === "insurer";
  const id = `CXL-${sub.id}-${pcChanges(sub).filter(c => c.type === "cancellation").length + 1}`;
  const paras = [
    insurer ? `Your policy will be cancelled at 12:01 AM on ${f.effective}, the standard time at your address. The reason is: ${reasonObj.label}.${f.notes ? " " + f.notes : ""}`
            : `We have processed your request. Your policy is cancelled at 12:01 AM on ${f.effective}. Reason given: ${reasonObj.label}.${f.notes ? " " + f.notes : ""}`,
    f.reason === "NONPAYMENT" ? "To keep your coverage, pay the amount due so that it is received before the cancellation date." : "",
    `Estimated return premium: ${pcMoney(refund.refund)}${insurer ? " (calculated pro rata)" : " (short-rate penalty and minimum earned premium applied where the policy provides)"}. The final amount is settled by accounting under the policy and applicable law.`,
    copies.length ? "Copies of this notice go to: " + copies.map(c => `${c.name} (${c.role})`).join("; ") + "." : "",
    stateRule && stateRule.text ? stateRule.text : ""
  ].filter(Boolean);
  const ev = { id, type: "cancellation", status: f.effective <= ctx.today ? "effective" : "pending", initiator: f.initiator, reason: f.reason, reasonLabel: reasonObj.label, effective: f.effective, mailedOn: f.mailedOn || null, proofRef: f.proofRef || null,
    noticeDays: insurer ? pcNoticeDays(f.reason, ctx.state) : 0, notes: f.notes, refund, copiesTo: copies, flat, by: pcActor(), at: pcNow() };
  ev.html = pcDocHtml(insurer ? "NOTICE OF CANCELLATION" : "CONFIRMATION OF CANCELLATION", [
    ["Policy number", facts.policyNumber], ["Named insured", sub.insured || ""], ["Notice date", insurer ? f.mailedOn : pcToday()], ["Cancellation effective", `${f.effective} (12:01 AM)`], ...(insurer ? [["Proof of mailing", f.proofRef]] : [])
  ], paras);
  pcChanges(sub).push(ev);
  sub.cancellation = { eventId: id, initiator: f.initiator, reason: f.reason, effective: f.effective, status: ev.status };
  sub.policyState = "pending_cancellation";
  pcLog(sub, "cancellation_scheduled", `${insurer ? "Insurer" : "Insured-requested"} cancellation ${id}: ${reasonObj.label}; effective ${f.effective}${flat ? " (flat)" : ""}${insurer ? `; notice mailed ${f.mailedOn} (${ev.noticeDays} days required, proof ${f.proofRef})` : ""}. Estimated refund ${pcMoney(refund.refund)}.${copies.length > 1 ? ` Notice also to ${copies.slice(1).map(c => c.name).join(", ")}.` : ""}`);
  pcApplyDue(sub, ctx.today);
  pcPersist();
  renderPolicyChangesCard(sub);
  showToast(sub.policyState === "cancelled" ? "Policy cancelled." : `Cancellation scheduled for ${f.effective}.`, sub.policyState === "cancelled" ? "warning" : "info");
}

/** Takes effect any cancellation whose date has come. Returns true if one did. */
function pcApplyDue(sub, today) {
  const t = today || pcToday();
  if (pcState(sub) !== "pending_cancellation" || !sub.cancellation || sub.cancellation.effective > t) return false;
  sub.policyState = "cancelled";
  sub.cancellation.status = "effective";
  const ev = pcChanges(sub).find(c => c.id === sub.cancellation.eventId);
  if (ev) ev.status = "effective";
  let revoked = 0, voided = 0;
  (sub.certificates || []).forEach(c => { if (c.status === "issued") { c.status = "revoked"; c.revokedBy = pcActor(); c.revokedAt = pcNow(); c.revokeReason = `Policy cancelled effective ${sub.cancellation.effective}`; revoked++; } });
  (sub.binders || []).forEach(b => { if (b.status === "active") { b.status = "void"; b.voidedBy = pcActor(); b.voidedAt = pcNow(); b.voidReason = `Policy cancelled effective ${sub.cancellation.effective}`; voided++; } });
  sub.statusText = "Policy Cancelled"; sub.statusBadge = "badge-danger";
  pcLog(sub, "policy_cancelled", `Policy cancellation took effect ${sub.cancellation.effective}.${revoked ? ` ${revoked} certificate(s) revoked; notify the holders.` : ""}${voided ? ` ${voided} binder(s) voided.` : ""}`);
  pcPersist();
  return true;
}

function pcRescind() {
  const sub = pcActiveSub(); if (!sub) return;
  if (!hasPermission("policyChanges", "approve")) { denyPermission("policyChanges", "approve"); return; }
  if (pcState(sub) !== "pending_cancellation") return;
  const reason = pcV("pc_rescindWhy");
  if (reason.length < 10) { showToast("Give the reason for rescinding (at least 10 characters).", "danger"); return; }
  const ev = pcChanges(sub).find(c => c.id === sub.cancellation.eventId);
  if (ev) { ev.status = "rescinded"; ev.rescindedBy = pcActor(); ev.rescindedAt = pcNow(); ev.rescindReason = reason; }
  sub.cancellation.status = "rescinded";
  sub.policyState = "in_force";
  pcLog(sub, "cancellation_rescinded", `Cancellation ${sub.cancellation.eventId} rescinded before it took effect: ${reason}. Notify the insured and the other recipients of the notice.`);
  pcPersist();
  renderPolicyChangesCard(sub);
  showToast("Cancellation rescinded. Notify everyone who received the notice.", "success");
}

function pcReinstate() {
  const sub = pcActiveSub(); if (!sub) return;
  if (!hasPermission("policyChanges", "approve")) { denyPermission("policyChanges", "approve"); return; }
  if (pcState(sub) !== "cancelled") { showToast("Only a cancelled policy can be reinstated.", "info"); return; }
  const f = { type: pcV("pc_riType"), effective: pcV("pc_riEff"), reason: pcV("pc_riWhy"), noKnownLoss: pcC("pc_riNoLoss"), payment: pcV("pc_riPay") };
  const ctx = pcContext(sub); ctx.cancelEffective = sub.cancellation.effective;
  const problems = pcValidateReinstatement(ctx, f);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  const facts = pcFacts(sub);
  const lapseDays = f.type === "with_lapse" ? Math.max(0, pcDays(sub.cancellation.effective, f.effective)) : 0;
  const ev = { id: `RIN-${sub.id}-${pcChanges(sub).filter(c => c.type === "reinstatement").length + 1}`, type: "reinstatement", status: "issued", reinstateType: f.type, effective: f.effective, lapseDays, reason: f.reason, payment: f.payment || null, noKnownLoss: f.noKnownLoss, by: pcActor(), at: pcNow() };
  ev.html = pcDocHtml("NOTICE OF REINSTATEMENT", [
    ["Policy number", facts.policyNumber], ["Named insured", sub.insured || ""], ["Reinstated effective", `${f.effective} (12:01 AM)`], ["Basis", f.type === "without_lapse" ? "Without lapse (continuous coverage)" : `With lapse of ${lapseDays} day(s): there is no coverage from ${sub.cancellation.effective} until ${f.effective}`]
  ], [f.reason, "All other terms, conditions and exclusions of the policy remain unchanged."]);
  pcChanges(sub).push(ev);
  sub.policyState = "in_force";
  sub.cancellation.status = "reinstated";
  sub.statusText = "Policy Issued"; sub.statusBadge = "badge-success";
  pcLog(sub, "policy_reinstated", `Policy reinstated ${f.type === "without_lapse" ? "WITHOUT lapse" : `with a lapse of ${lapseDays} day(s)`} effective ${f.effective}: ${f.reason}.${f.payment ? " Payment " + f.payment + "." : ""}${f.noKnownLoss ? " No-known-loss statement confirmed." : ""} Certificates revoked at cancellation are not restored; reissue them.`);
  pcPersist();
  renderPolicyChangesCard(sub);
  showToast("Policy reinstated. Reissue any certificates that were revoked.", "success");
}

function pcDoc(id) {
  const sub = pcActiveSub(); if (!sub) return null;
  const ev = pcChanges(sub).find(c => c.id === id);
  return ev ? { ev, html: pcWrap(id, ev.html, ev.status === "rescinded" ? "rescinded" : "") } : null;
}
function pcPrint(id) {
  const d = pcDoc(id); if (!d) return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  frame.contentDocument.open(); frame.contentDocument.write(d.html); frame.contentDocument.close();
  setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* printing unavailable */ } setTimeout(() => frame.remove(), 1500); }, 200);
}
function pcDownload(id) {
  const d = pcDoc(id); if (!d) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([d.html], { type: "text/html" })); a.download = `${id}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ----------------------------------------------------------------------------
// 5. RENDERING
// ----------------------------------------------------------------------------
var PC_STATE_UI = {
  in_force: { badge: "badge-success", label: "In force" },
  pending_cancellation: { badge: "badge-warning", label: "Cancellation pending" },
  cancelled: { badge: "badge-danger", label: "Cancelled" }
};

function renderPolicyChangesCard(sub) {
  const box = document.getElementById("policyChangesContainer");
  if (!box || !sub) return;
  if (!pcIsBound(sub)) {
    box.innerHTML = `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-arrows-left-right"></i> Policy Changes</h3><span class="badge badge-light">Available after bind</span></div>
      <div class="card-body"><p class="text-xs text-muted"><i class="ph ph-lock"></i> Endorsements, cancellation and reinstatement apply to a bound policy.</p></div></div>`;
    return;
  }
  pcApplyDue(sub);
  const st = pcState(sub), ui = PC_STATE_UI[st];
  const canApprove = hasPermission("policyChanges", "approve"), canOverride = hasPermission("policyChanges", "override");
  const facts = pcFacts(sub), L = pcLedger(sub);
  const today = pcToday();

  const events = pcChanges(sub).slice().reverse().map(e => {
    const badge = ["issued", "effective"].includes(e.status) ? "badge-success" : (e.status === "pending" ? "badge-warning" : "badge-light");
    const label = e.type === "endorsement" ? `Endorsement ${e.number}: ${e.endorsementType}` : (e.type === "cancellation" ? `Cancellation (${e.initiator === "insurer" ? "insurer" : "insured"}): ${e.reasonLabel}` : `Reinstatement ${e.reinstateType === "without_lapse" ? "without lapse" : "with lapse"}`);
    const detail = e.type === "endorsement" ? `${pcMoney(e.annualChange)} annual; ${pcMoney(e.proRata)} this term` : (e.type === "cancellation" ? `Refund ≈ ${pcMoney(e.refund.refund)}` : (e.lapseDays ? `${e.lapseDays} day lapse` : ""));
    return `<tr><td>${pcEsc(e.id)}</td><td>${pcEsc(label)}<div class="text-xs text-muted">${pcEsc(detail)}</div></td><td>${pcEsc(e.effective)}</td><td><span class="badge ${badge} text-xs">${pcEsc(e.status)}</span></td>
      <td style="white-space:nowrap;"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="pcPrint('${pcEsc(e.id)}')"><i class="ph ph-printer"></i></button> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="pcDownload('${pcEsc(e.id)}')"><i class="ph ph-download-simple"></i></button></td></tr>`;
  }).join("");

  const typeOpts = PC_ENDORSEMENT_TYPES.map(t => `<option value="${t.key}">${pcEsc(t.label)}</option>`).join("");
  const endForm = (st !== "cancelled" && canApprove) ? `
    <h4 style="margin:16px 0 6px;">Issue an endorsement</h4>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      <select id="pc_endType" class="form-control" style="width:330px;">${typeOpts}</select>
      <label class="text-xs text-muted" style="font-size:12px;">Effective <input id="pc_endEff" type="date" class="form-control" style="width:150px;" value="${today}"></label>
      <input id="pc_endForm" class="form-control" style="width:200px;" placeholder="Form no. (if required)">
    </div>
    <textarea id="pc_endDesc" class="form-control" rows="2" style="width:100%;margin-top:8px;" placeholder="Describe the change"></textarea>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;">
      <input id="pc_endPrem" type="number" step="0.01" class="form-control" style="width:200px;" placeholder="Annual premium change (+/−)">
      <input id="pc_endPremWhy" class="form-control" style="flex:1;min-width:200px;" placeholder="How the premium change was calculated">
    </div>
    <label style="display:block;font-size:12.5px;margin-top:6px;"><input type="checkbox" id="pc_endNoLoss"> Backdated change: the insured's signed no-known-loss statement is on file</label>
    <button class="btn btn-sm btn-primary" style="width:auto;margin-top:8px;" onclick="pcIssueEndorsement()"><i class="ph ph-pencil-simple"></i> Issue endorsement</button>` : "";

  const insurerOpts = PC_REASONS_INSURER.map(r => `<option value="${r.code}">${pcEsc(r.label)}</option>`).join("");
  const insuredOpts = PC_REASONS_INSURED.map(r => `<option value="${r.code}">${pcEsc(r.label)}</option>`).join("");
  const cxForm = (st === "in_force" && canApprove) ? `
    <h4 style="margin:16px 0 6px;">Cancel the policy</h4>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      <select id="pc_cxBy" class="form-control" style="width:250px;" onchange="pcPreviewRefund()"><option value="insured">Requested by the insured</option><option value="insurer">Cancelled by the insurer</option></select>
      <select id="pc_cxReason" class="form-control" style="width:340px;" onchange="pcPreviewRefund()"><optgroup label="If the insured requests">${insuredOpts}</optgroup><optgroup label="If the insurer cancels">${insurerOpts}</optgroup></select>
      <label class="text-xs text-muted" style="font-size:12px;">Effective <input id="pc_cxEff" type="date" class="form-control" style="width:150px;" oninput="pcPreviewRefund()" onchange="pcPreviewRefund()"></label>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;">
      <label class="text-xs text-muted" style="font-size:12px;">Notice mailed (insurer) <input id="pc_cxMailed" type="date" class="form-control" style="width:150px;" value="${today}"></label>
      <input id="pc_cxProof" class="form-control" style="width:240px;" placeholder="Proof-of-mailing reference (insurer)">
    </div>
    <textarea id="pc_cxNotes" class="form-control" rows="2" style="width:100%;margin-top:8px;" placeholder="Facts behind the reason / notes (required for most insurer reasons, other, and flat cancellation)"></textarea>
    <div id="pc_cxPreview"></div>
    <button class="btn btn-sm btn-outline-danger" style="width:auto;margin-top:8px;" onclick="pcSubmitCancellation()"><i class="ph ph-prohibit"></i> Schedule / process cancellation</button>
    <p class="text-xs text-muted" style="margin-top:6px;">Notice periods default to ${PC_NOTICE_DEFAULTS.nonpayment} days (nonpayment) and ${PC_NOTICE_DEFAULTS.other} days (other reasons). These are placeholders: state law governs and must be configured${canOverride ? "" : ". Cancelling flat or backdating needs senior authority"}.</p>` : "";

  const pendingBlock = st === "pending_cancellation" ? `
    <div class="alert alert-warning text-xs"><i class="ph ph-warning"></i> Cancellation takes effect <strong>${pcEsc(sub.cancellation.effective)}</strong>. Estimated refund ${pcMoney(pcChanges(sub).find(c => c.id === sub.cancellation.eventId).refund.refund)}.</div>
    ${canApprove ? `<div style="display:flex;gap:8px;align-items:center;"><input id="pc_rescindWhy" class="form-control" style="width:340px;" placeholder="Reason to rescind (10+ characters)"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="pcRescind()">Rescind cancellation</button></div>` : ""}` : "";

  const cancelledBlock = st === "cancelled" ? `
    <div class="alert alert-danger text-xs"><i class="ph ph-prohibit"></i> The policy was cancelled effective <strong>${pcEsc(sub.cancellation.effective)}</strong>. There is no coverage after that date unless the policy is reinstated. Certificates were revoked.</div>
    ${canApprove ? `<h4 style="margin:10px 0 6px;">Reinstate</h4>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      <select id="pc_riType" class="form-control" style="width:300px;"><option value="with_lapse">With a lapse (no cover for the gap)</option>${canOverride ? '<option value="without_lapse">Without lapse (continuous cover)</option>' : ""}</select>
      <label class="text-xs text-muted" style="font-size:12px;">Effective <input id="pc_riEff" type="date" class="form-control" style="width:150px;" value="${today}"></label>
      <input id="pc_riPay" class="form-control" style="width:220px;" placeholder="Payment reference (without lapse)">
    </div>
    <textarea id="pc_riWhy" class="form-control" rows="2" style="width:100%;margin-top:8px;" placeholder="Reason for reinstating"></textarea>
    <label style="display:block;font-size:12.5px;margin-top:6px;"><input type="checkbox" id="pc_riNoLoss"> No-known-loss statement confirmed (needed without lapse)</label>
    <button class="btn btn-sm btn-primary" style="width:auto;margin-top:8px;" onclick="pcReinstate()"><i class="ph ph-arrow-counter-clockwise"></i> Reinstate policy</button>` : ""}` : "";

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3><i class="ph ph-arrows-left-right"></i> Policy Changes: Endorsement, Cancellation, Reinstatement</h3><span class="badge ${ui.badge}">${ui.label}</span></div>
      <div class="card-body">
        <div class="clean-meta-list" style="margin-bottom:10px;">
          <div class="clean-meta-row"><span class="meta-label">Policy</span><span class="meta-value">${pcEsc(facts.policyNumber)} · ${pcEsc(facts.effective || "?")} to ${pcEsc(facts.expiration || "?")}</span></div>
          <div class="clean-meta-row"><span class="meta-label">Annual premium</span><span class="meta-value">${pcMoney(L.currentAnnual)}${L.currentAnnual !== L.baseAnnual ? ` <span class="text-muted">(was ${pcMoney(L.baseAnnual)})</span>` : ""}</span></div>
        </div>
        ${pendingBlock}${cancelledBlock}
        ${events ? `<div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Ref</th><th>Change</th><th>Effective</th><th>Status</th><th></th></tr></thead><tbody>${events}</tbody></table></div>` : `<p class="text-xs text-muted">No policy changes yet.</p>`}
        ${endForm}${cxForm}
        <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> Refunds are estimates; the policy and state law govern the final amounts, and fees that are fully earned are not refunded. Wording is a template for Compliance to approve. Premium and policy status changes are not yet sent to the policy admin system.</p>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
// 6. HOOKS
// ----------------------------------------------------------------------------
(function installPolicyChangeHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.endorsement_issued = m("Endorsement Issued", "ph-pencil-simple", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.cancellation_scheduled = m("Cancellation Scheduled", "ph-prohibit", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.policy_cancelled = m("Policy Cancelled", "ph-prohibit", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.cancellation_rescinded = m("Cancellation Rescinded", "ph-arrow-counter-clockwise", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.policy_reinstated = m("Policy Reinstated", "ph-arrow-counter-clockwise", "badge-success", "outcome-approve");
  }
  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || pcActiveSub(); if (s) renderPolicyChangesCard(s); } catch (e) { console.warn("Policy changes card failed:", e); }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderPolicyChangesCard(sub); } catch (e) { console.warn("Policy changes card failed:", e); }
      return r;
    };
  }
})();

window.pcIssueEndorsement = pcIssueEndorsement; window.pcSubmitCancellation = pcSubmitCancellation;
window.pcPreviewRefund = pcPreviewRefund; window.pcRescind = pcRescind; window.pcReinstate = pcReinstate;
window.pcPrint = pcPrint; window.pcDownload = pcDownload; window.renderPolicyChangesCard = renderPolicyChangesCard;
window.pcApplyDue = pcApplyDue;
