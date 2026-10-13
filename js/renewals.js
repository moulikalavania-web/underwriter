/**
 * ============================================================================
 * RENEWALS: PIPELINE, EXPIRING-TERM TRACKING AND NON-RENEWAL (Add-On) — gap G17
 * ----------------------------------------------------------------------------
 * A book of business lives on renewals. This module turns every bound policy
 * into an item on a renewal pipeline and walks it to a decision before the
 * policy expires:
 *
 *   TIMELINE   review starts 120 days before expiry, information is requested
 *              at 90, the quote goes out by 30, and the notice deadlines for a
 *              non-renewal and for a conditional renewal sit before expiry
 *              (placeholders: state law sets them).
 *   DECISION   renew on similar terms, renew with changes (a conditional
 *              renewal, which needs advance notice when the premium rises past a
 *              threshold or cover is reduced), or non-renew.
 *   NON-RENEWAL  needs senior authority, a reason with facts, a notice mailed
 *              with proof before the deadline, and, if a consumer report was a
 *              factor, a reference to the issued FCRA adverse-action notice. A
 *              late notice needs senior authority and an explanation, because in
 *              many states a late notice can force the insurer to renew or extend.
 *   RENEWAL SUBMISSION   renewing creates a new submission in the normal workflow,
 *              linked to the expiring policy, with the prior-policy record filled in
 *              so the existing Old-vs-New comparison works. Documents that go stale
 *              (loss runs, the signed application) are not carried forward, and none
 *              of the expiring policy's compliance state is copied: sanctions,
 *              producer, TRIA, subjectivities, binders and certificates start fresh.
 *   OUTCOME    when the renewal submission is bound the expiring policy is marked
 *              renewed; a policy that expires with no decision is marked lapsed.
 *
 * IMPORTANT: notice periods, the conditional-renewal threshold and the timeline
 * are CONFIGURATION. RENEWAL_NOTICE_STATE_RULES is empty for Compliance to
 * fill in per state, with the required wording. Notice wording is a template.
 * ============================================================================
 */

var RENEWAL_REVIEW_START_DAYS = 120;
var RENEWAL_INFO_REQUEST_DAYS = 90;
var RENEWAL_QUOTE_TARGET_DAYS = 30;
var RENEWAL_NOTICE_DEFAULTS = { nonrenewal: 60, conditional: 45 };
var RENEWAL_NOTICE_STATE_RULES = {};     // e.g. { TX: { nonrenewal: 60, conditional: 60, text: "…state wording…" } }
var RENEWAL_CONDITIONAL_PREMIUM_PCT = 10; // a premium rise above this, or any reduction in cover, makes it a conditional renewal
var RENEWAL_TEMPLATE_META = { version: "DRAFT-0.1", approved: false };

var RN_NONRENEWAL_REASONS = [
  { code: "LOSS_EXPERIENCE", label: "Loss experience" },
  { code: "EXPOSURE_CHANGE", label: "Change in exposure or operations" },
  { code: "GUIDELINES", label: "Now outside our underwriting guidelines" },
  { code: "MARKET", label: "We are withdrawing from the class or territory" },
  { code: "NONCOMPLIANCE", label: "Failure to comply with policy conditions or loss-control recommendations" },
  { code: "OTHER", label: "Another reason (explained below)" }
];

var RN_INFO_CHECKLIST = ["Updated, signed renewal application", "Currently valued loss runs from every carrier for the look-back period", "Updated schedules (vehicles, drivers, locations)", "Changes in operations, revenue or exposure since last year"];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function rnToday() { return new Date().toISOString().slice(0, 10); }
function rnDays(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000); }
function rnAdd(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); }
function rnMoney(n) { return "$" + Number(n || 0).toLocaleString("en-US"); }
function rnMDY(iso) { return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`; }

function rnNoticeDays(kind, state) {
  const st = state && RENEWAL_NOTICE_STATE_RULES[state];
  return (st && typeof st[kind] === "number") ? st[kind] : RENEWAL_NOTICE_DEFAULTS[kind];
}

/** Milestones for a policy expiring on `expiration`, with the state's notice days. */
function rnMilestones(expiration, state) {
  return [
    { key: "review", label: "Start renewal review", due: rnAdd(expiration, -RENEWAL_REVIEW_START_DAYS) },
    { key: "info", label: "Request renewal information from the producer", due: rnAdd(expiration, -RENEWAL_INFO_REQUEST_DAYS) },
    { key: "nonrenewal", label: `Last day to mail a non-renewal notice (${rnNoticeDays("nonrenewal", state)} days)`, due: rnAdd(expiration, -rnNoticeDays("nonrenewal", state)) },
    { key: "conditional", label: `Last day to mail a conditional-renewal notice (${rnNoticeDays("conditional", state)} days)`, due: rnAdd(expiration, -rnNoticeDays("conditional", state)) },
    { key: "quote", label: "Renewal quote to the producer", due: rnAdd(expiration, -RENEWAL_QUOTE_TARGET_DAYS) }
  ];
}

/** The stage a policy is at, derived from the renewal record and the dates. */
function rnStageOf(renewal, daysToExpiry) {
  const s = renewal && renewal.status;
  if (s === "renewed") return "renewed";
  if (s === "non_renewal_notified") return daysToExpiry < 0 ? "non_renewed" : "non_renewal_notified";
  if (daysToExpiry < 0) return "lapsed";
  if (s === "renewal_in_progress") return "renewal_in_progress";
  if (s === "under_review") return "under_review";
  return daysToExpiry <= RENEWAL_REVIEW_START_DAYS ? "review_due" : "upcoming";
}

function rnValidateNotice(ctx, f, kind) {
  const p = [];
  const days = rnNoticeDays(kind, ctx.state);
  const deadline = rnAdd(ctx.expiration, -days);
  if (!f.mailedOn) p.push("enter the date the notice is mailed");
  else {
    if (f.mailedOn > ctx.today) p.push("the mailing date cannot be in the future");
    if (f.mailedOn >= ctx.expiration) p.push("the notice must be mailed before the policy expires");
    if (f.mailedOn > deadline) {
      if (!ctx.canOverride) p.push(`the notice is late: it was due by ${deadline} (${days} days before expiry); senior authority is needed`);
      else if (!f.lateAck || String(f.lateWhy || "").trim().length < 10) p.push(`the notice is late (due by ${deadline}); confirm Compliance has been told and explain why (at least 10 characters), because late notice may oblige the insurer to renew or extend cover`);
    }
  }
  if (String(f.proofRef || "").trim().length < 3) p.push("enter the proof-of-mailing reference");
  return p;
}

function rnValidateNonRenewal(ctx, f) {
  const p = [];
  if (!ctx.canOverride) p.push("a non-renewal needs senior authority");
  if (!RN_NONRENEWAL_REASONS.find(r => r.code === f.reason)) p.push("choose the reason");
  if (String(f.facts || "").trim().length < 10) p.push("state the facts behind the reason (at least 10 characters)");
  if (f.consumerReport) {
    if (!f.fcraNoticeId) p.push("a consumer report was a factor; select the issued adverse-action notice that carries the FCRA disclosure");
    else if (!(ctx.consumerNoticeIds || []).includes(f.fcraNoticeId)) p.push("the selected notice is not an issued notice with the consumer-report disclosure");
  }
  return p.concat(rnValidateNotice(ctx, f, "nonrenewal"));
}

function rnValidateConditional(ctx, f) {
  const p = [];
  const pct = Number(f.expectedPct);
  if (f.expectedPct === "" || isNaN(pct)) p.push("enter the expected premium change in percent");
  if (String(f.terms || "").trim().length < 10) p.push("describe the changed terms (at least 10 characters)");
  if (!isNaN(pct) && pct <= RENEWAL_CONDITIONAL_PREMIUM_PCT && !f.reducedCoverage) p.push(`a change of ${pct}% is within the ${RENEWAL_CONDITIONAL_PREMIUM_PCT}% threshold and cover is not reduced; renew on the normal path instead`);
  return p.concat(rnValidateNotice(ctx, f, "conditional"));
}

function rnValidateRenew(ctx, f) {
  const p = [];
  const pct = Number(f.expectedPct || 0);
  if (isNaN(pct)) p.push("the expected premium change must be a number");
  else if (pct > RENEWAL_CONDITIONAL_PREMIUM_PCT) p.push(`a premium rise of ${pct}% is above the ${RENEWAL_CONDITIONAL_PREMIUM_PCT}% threshold; give conditional-renewal notice instead`);
  if (f.reducedCoverage) p.push("cover is being reduced; give conditional-renewal notice instead");
  return p;
}

// ----------------------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------------------
function rnSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function rnNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function rnActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function rnEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function rnLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: 7, decision, by: rnActor(), at: rnNow(), notes });
}
function rnPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function rnRecord(sub) { if (!sub.renewal) sub.renewal = { status: "not_started", history: [] }; if (!sub.renewal.history) sub.renewal.history = []; return sub.renewal; }

function rnFacts(sub) {
  let f;
  if (typeof pcFacts === "function") f = pcFacts(sub);
  else if (typeof bndFacts === "function") { const b = bndFacts(sub); f = { policyNumber: b.policyNumber, effective: b.effective, expiration: b.expiration, premium: b.premium || 0 }; }
  else f = { policyNumber: sub.pasSync ? sub.pasSync.policyNumber : "", effective: null, expiration: null, premium: 0 };
  const annual = typeof pcLedger === "function" ? pcLedger(sub).currentAnnual : f.premium;
  return { policyNumber: f.policyNumber, effective: f.effective, expiration: f.expiration, annual: annual || 0 };
}

/** A policy belongs on the pipeline when it is bound, has an expiry and has not been cancelled. */
function rnIsRenewable(sub) {
  if (!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber)) return false;
  if (sub.policyState === "cancelled") return false;
  return !!rnFacts(sub).expiration;
}

function rnPolicies(today) {
  const t = today || rnToday();
  return SUBMISSIONS_DATASET.filter(rnIsRenewable).map(sub => {
    const f = rnFacts(sub);
    const days = rnDays(t, f.expiration);
    const state = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
    return { sub, f, days, state, stage: rnStageOf(sub.renewal, days), milestones: rnMilestones(f.expiration, state) };
  }).sort((a, b) => a.days - b.days);
}

/** Marks expired policies with no decision as lapsed (once). */
function rnSweep(today) {
  let n = 0;
  rnPolicies(today).forEach(p => {
    if (p.stage === "lapsed" && rnRecord(p.sub).status !== "lapsed") {
      p.sub.renewal.status = "lapsed";
      rnLog(p.sub, "renewal_lapsed", `Policy ${p.f.policyNumber} expired ${p.f.expiration} with no renewal bound and no non-renewal notice on record.`);
      n++;
    }
  });
  if (n) rnPersist();
  return n;
}

// ----------------------------------------------------------------------------
// 3. RENEWAL SUBMISSION
// ----------------------------------------------------------------------------
var RN_RESET_FIELDS = ["pasSync", "quoteIssued", "customerApproved", "customerApprovedAt", "quoteNo", "currentPremium", "policyState", "policyLedger", "policyChanges", "cancellation", "binders", "certificates",
  "subjectivityItems", "_subjMirror", "subjectivityBindDate", "_subjOverdueKey", "sanctions", "_sanctionsBindScreenAt", "producerCheck", "tria", "notices", "adverseTermsRequiresNotice", "completeness",
  "importedRatingData", "isQuoteImported", "discretionaryPricing", "eSignature", "submissionVersions", "communicationThread", "missingItems", "lifecycleStatus", "lifecycleStatusAt",
  "declinedBy", "declineReason", "declineTriggerPoint", "isReferral", "registryEnrichment", "riskScore", "riskScoreOverridden", "riskScoreAutoCalculated", "archived", "archivedAt", "archivedBy", "renewal",
  "marketClearance", "borRecords", "borHistory", "commission", "commissionOverride"];

function rnPriorPolicyRecord(sub, f) {
  const losses = sub.losses || [];
  const num = x => parseFloat(String(x || "0").replace(/[^0-9.]/g, "")) || 0;
  const incurred = losses.reduce((s, l) => s + num(l.incurred), 0);
  const claims = losses.filter(l => num(l.incurred) > 0);
  return {
    policyNumber: f.policyNumber, policyPeriod: `${f.effective} to ${f.expiration}`, premium: f.annual,
    lossRatio: f.annual > 0 ? Math.round(incurred / f.annual * 100) + "%" : "n/a",
    claimsCount: claims.length, claimsNote: claims.length ? claims.map(l => `${l.desc} (${l.incurred})`).join("; ") : "No claims recorded",
    coverageRows: JSON.parse(JSON.stringify(sub.coverageRows || []))
  };
}

function rnCreateRenewalSubmission(sub, today) {
  const f = rnFacts(sub);
  const t = today || rnToday();
  const copy = JSON.parse(JSON.stringify(sub));
  const pendingBor = (sub.borRecords || []).find(b => b.status === "accepted_at_renewal");
  RN_RESET_FIELDS.forEach(k => { delete copy[k]; });
  if (pendingBor) copy.broker = pendingBor.toBroker;   // a broker-of-record change that takes effect at renewal
  const n = SUBMISSIONS_DATASET.filter(s => s.renewalOf === sub.id).length + 1;
  copy.id = `${sub.id}-R${n}`;
  copy.renewalOf = sub.id;
  copy.subjectivities = [];
  copy.decisionLog = [];
  copy.priorPolicy = rnPriorPolicyRecord(sub, f);
  copy.effectiveDate = rnMDY(f.expiration);
  copy.expirationDate = rnMDY(rnAdd(f.expiration, 365));
  if (copy.genInfo) { copy.genInfo.policytype = "Renewal"; copy.genInfo.effective_date = copy.effectiveDate; copy.genInfo.expiration_date = copy.expirationDate; }
  copy.docs = (copy.docs || []).filter(d => !/loss.?run|acord|application/i.test(`${d.name} ${d.desc || ""}`));
  const days = rnDays(t, f.expiration);
  copy.priority = days <= 30 ? "P1" : "P2";
  copy.priorityScore = null;
  copy.priorityReason = `Renewal of ${f.policyNumber} • expires ${f.expiration} (${days} days)`;
  copy.receivedAt = "Just Now"; copy.receivedTimestamp = Date.now();
  copy.slaHours = slaHoursFor(copy.priority);
  copy.slaText = slaTextFor(copy.priority);
  copy.slaCountdown = slaCountdownFor(copy);
  copy.channelName = `Renewal of ${f.policyNumber}`;
  copy.statusText = "Renewal Intake"; copy.statusBadge = "badge-primary";
  copy.currentStep = 1; copy.completedSteps = [];
  copy.missingItems = { documents: [], dataFields: [] };
  copy.decisionLog.push({ step: 1, decision: "submission_updated", by: rnActor(), at: rnNow(), notes: `Renewal submission created from ${sub.id} (policy ${f.policyNumber}, expiring ${f.expiration}). Stale documents (loss runs, application) were not carried forward; compliance checks start fresh.` });
  SUBMISSIONS_DATASET.unshift(copy);
  return copy;
}

// ----------------------------------------------------------------------------
// 4. NOTICES (documents)
// ----------------------------------------------------------------------------
function rnRecipients(sub) {
  if (typeof pcNoticeRecipients === "function") return pcNoticeRecipients(sub);
  const out = [{ role: "Named insured", name: sub.insured || "" }];
  if (sub.channelType !== "direct" && sub.broker) out.push({ role: "Producer", name: sub.broker });
  return out;
}
function rnDocHtml(title, rows, paras) {
  return `<h2 style="margin:0 0 4px;font-size:17px;">${rnEsc(title)}</h2>
    <div style="color:#64748b;font-size:11.5px;margin-bottom:10px;">${RENEWAL_TEMPLATE_META.approved ? "" : `Template ${RENEWAL_TEMPLATE_META.version} — not approved by Compliance; do not send outside a test environment.`}</div>
    <table style="font-size:13px;margin-bottom:10px;">${rows.map(r => `<tr><td style="padding:3px 12px 3px 0;color:#475569;white-space:nowrap;vertical-align:top;">${rnEsc(r[0])}</td><td style="padding:3px 0;">${rnEsc(r[1])}</td></tr>`).join("")}</table>
    ${paras.map(t => `<p style="font-size:13px;white-space:pre-line;">${rnEsc(t)}</p>`).join("")}`;
}
function rnWrap(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${rnEsc(title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;max-width:760px;margin:30px auto;font-size:14px;line-height:1.45;color:#111;">${body}</body></html>`;
}

// ----------------------------------------------------------------------------
// 5. ACTIONS (all take the policy's submission id: the pipeline works across submissions)
// ----------------------------------------------------------------------------
function rnV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function rnC(id) { const e = document.getElementById(id); return !!(e && e.checked); }

function rnEligible(subId) {
  const sub = rnSub(subId);
  if (!sub || !rnIsRenewable(sub)) { showToast("⛔ That policy is not on the renewal pipeline.", "danger"); return null; }
  return sub;
}

function rnStartReview(subId) {
  if (!hasPermission("renewals", "edit")) { denyPermission("renewals", "edit"); return; }
  const sub = rnEligible(subId); if (!sub) return;
  const r = rnRecord(sub);
  if (r.status !== "not_started") return;
  r.status = "under_review"; r.reviewStartedAt = rnNow(); r.reviewStartedBy = rnActor();
  rnLog(sub, "renewal_review_started", `Renewal review started for policy ${rnFacts(sub).policyNumber} (expires ${rnFacts(sub).expiration}).`);
  rnPersist(); renderRenewalPipeline(); renderRenewalChip(sub);
  showToast("Renewal review started.", "info");
}

function rnRequestInfo(subId) {
  if (!hasPermission("renewals", "edit")) { denyPermission("renewals", "edit"); return; }
  const sub = rnEligible(subId); if (!sub) return;
  const r = rnRecord(sub);
  if (["renewal_in_progress", "renewed", "non_renewal_notified"].includes(r.status)) { showToast("A decision has already been made.", "info"); return; }
  const items = RN_INFO_CHECKLIST.filter((x, i) => rnC("rn_info_" + i));
  const note = rnV("rn_infoNote");
  if (!items.length) { showToast("Tick at least one item to request.", "danger"); return; }
  if (r.status === "not_started") { r.status = "under_review"; r.reviewStartedAt = rnNow(); r.reviewStartedBy = rnActor(); }
  r.infoRequestedAt = rnNow(); r.infoRequestedBy = rnActor(); r.infoItems = items; r.infoNote = note;
  rnLog(sub, "renewal_info_requested", `Renewal information requested from ${sub.channelType === "direct" ? "the insured" : sub.broker}: ${items.join("; ")}.${note ? " Note: " + note : ""}`);
  rnPersist(); renderRenewalPipeline(); renderRenewalChip(sub);
  showToast("Information request recorded.", "info");
}

function rnForm() {
  return { expectedPct: rnV("rn_pct"), reducedCoverage: rnC("rn_reduced"), terms: rnV("rn_terms"), mailedOn: rnV("rn_mailed"), proofRef: rnV("rn_proof"),
    reason: rnV("rn_reason"), facts: rnV("rn_facts"), consumerReport: rnC("rn_consumer"), fcraNoticeId: rnV("rn_fcra"), lateAck: rnC("rn_lateAck"), lateWhy: rnV("rn_lateWhy") };
}

function rnCtx(sub, today) {
  const f = rnFacts(sub);
  return { today: today || rnToday(), expiration: f.expiration, state: typeof deriveRiskState === "function" ? deriveRiskState(sub) : null,
    canOverride: hasPermission("renewals", "override"),
    consumerNoticeIds: (sub.notices || []).filter(n => n.status === "issued" && n.consumerUsed).map(n => n.id) };
}

function rnDecide(subId, kind) {
  const sub = rnEligible(subId); if (!sub) return;
  const need = kind === "non_renew" ? "override" : "approve";
  if (!hasPermission("renewals", need)) { denyPermission("renewals", need); return; }
  const r = rnRecord(sub);
  if (["renewal_in_progress", "renewed", "non_renewal_notified"].includes(r.status)) { showToast("A decision has already been made for this policy.", "info"); return; }
  const f = rnForm(), ctx = rnCtx(sub), facts = rnFacts(sub);
  const problems = kind === "renew" ? rnValidateRenew(ctx, f) : (kind === "conditional" ? rnValidateConditional(ctx, f) : rnValidateNonRenewal(ctx, f));
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  const stateRule = ctx.state && RENEWAL_NOTICE_STATE_RULES[ctx.state];
  const recipients = rnRecipients(sub);
  r.decision = kind; r.decidedBy = rnActor(); r.decidedAt = rnNow(); r.reason = f.reason || null; r.terms = f.terms || null; r.expectedPct = f.expectedPct === "" ? null : Number(f.expectedPct);

  if (kind === "non_renew") {
    const reasonLabel = RN_NONRENEWAL_REASONS.find(x => x.code === f.reason).label;
    const late = f.mailedOn > rnAdd(facts.expiration, -rnNoticeDays("nonrenewal", ctx.state));
    r.status = "non_renewal_notified";
    r.notice = { kind: "non_renewal", mailedOn: f.mailedOn, proofRef: f.proofRef, effective: facts.expiration, reasonLabel, facts: f.facts, late, lateWhy: f.lateWhy || null, fcraNoticeId: f.fcraNoticeId || null, copiesTo: recipients };
    r.notice.html = rnDocHtml("NOTICE OF NON-RENEWAL", [["Policy number", facts.policyNumber], ["Named insured", sub.insured || ""], ["Notice date", f.mailedOn], ["Policy expires", `${facts.expiration} (12:01 AM)`], ["Proof of mailing", f.proofRef]],
      [`We will not renew your policy when it expires at 12:01 AM on ${facts.expiration}. Coverage continues until then.`, `Reason: ${reasonLabel}. ${f.facts}`,
       f.fcraNoticeId ? `Information in a consumer report was a factor. See the adverse-action notice ${f.fcraNoticeId} for your rights.` : "",
       "You may wish to arrange other insurance before that date. Your producer can help.", "Copies of this notice go to: " + recipients.map(c => `${c.name} (${c.role})`).join("; ") + ".", stateRule && stateRule.text ? stateRule.text : ""].filter(Boolean));
    rnLog(sub, "nonrenewal_notice_issued", `Non-renewal notice mailed ${f.mailedOn} (proof ${f.proofRef}), policy expires ${facts.expiration}. Reason: ${reasonLabel}. ${f.facts}${late ? ` LATE NOTICE (${f.lateWhy}); Compliance informed.` : ""}${f.fcraNoticeId ? ` FCRA notice ${f.fcraNoticeId}.` : ""} Copies: ${recipients.map(c => c.name).join(", ")}.`);
    rnPersist(); renderRenewalPipeline(); renderRenewalChip(sub);
    showToast(late ? "Non-renewal notice recorded as LATE. Tell Compliance." : "Non-renewal notice recorded.", late ? "warning" : "success");
    return;
  }

  const renewalSub = rnCreateRenewalSubmission(sub);
  r.status = "renewal_in_progress"; r.renewalSubmissionId = renewalSub.id;
  if (kind === "conditional") {
    r.notice = { kind: "conditional", mailedOn: f.mailedOn, proofRef: f.proofRef, expectedPct: Number(f.expectedPct), terms: f.terms, reducedCoverage: f.reducedCoverage, copiesTo: recipients };
    r.notice.html = rnDocHtml("NOTICE OF CONDITIONAL RENEWAL", [["Policy number", facts.policyNumber], ["Named insured", sub.insured || ""], ["Notice date", f.mailedOn], ["Policy expires", `${facts.expiration} (12:01 AM)`], ["Proof of mailing", f.proofRef]],
      [`We are willing to renew your policy, but not on the same terms. Expected premium change: ${f.expectedPct}%.${f.reducedCoverage ? " Coverage will be reduced." : ""}`, `Changes: ${f.terms}`, "Your renewal quotation will follow. Your producer can help you compare options.", "Copies of this notice go to: " + recipients.map(c => `${c.name} (${c.role})`).join("; ") + ".", stateRule && stateRule.text ? stateRule.text : ""].filter(Boolean));
    rnLog(sub, "renewal_conditional_notice", `Conditional renewal notice mailed ${f.mailedOn} (proof ${f.proofRef}): expected ${f.expectedPct}% premium change${f.reducedCoverage ? ", cover reduced" : ""}. ${f.terms} Renewal submission ${renewalSub.id} created.`);
  } else {
    rnLog(sub, "renewal_offered", `Decision: renew on similar terms (expected premium change ${f.expectedPct || 0}%). Renewal submission ${renewalSub.id} created.`);
  }
  rnLog(renewalSub, "submission_updated", `Renewal of ${sub.id}: ${kind === "conditional" ? "conditional renewal" : "renewal on similar terms"} decided by ${rnActor()}.`);
  rnPersist();
  if (typeof renderSubmissionsTable === "function") { try { renderSubmissionsTable(); } catch (e) { /* queue not mounted */ } }
  renderRenewalPipeline(); renderRenewalChip(sub);
  showToast(`Renewal submission ${renewalSub.id} created.`, "success");
}

function rnRescindNonRenewal(subId) {
  if (!hasPermission("renewals", "override")) { denyPermission("renewals", "override"); return; }
  const sub = rnEligible(subId); if (!sub) return;
  const r = rnRecord(sub);
  if (r.status !== "non_renewal_notified") return;
  const why = rnV("rn_rescindWhy");
  if (why.length < 10) { showToast("Give the reason for rescinding (at least 10 characters).", "danger"); return; }
  r.history.push({ notice: r.notice, rescindedBy: rnActor(), rescindedAt: rnNow(), reason: why });
  r.notice = null; r.decision = null; r.status = "under_review";
  rnLog(sub, "nonrenewal_rescinded", `Non-renewal rescinded before expiry: ${why}. Notify the insured and everyone who received the notice.`);
  rnPersist(); renderRenewalPipeline(); renderRenewalChip(sub);
  showToast("Non-renewal rescinded. Notify everyone who received the notice.", "warning");
}

function rnOpenRenewalSubmission(id) {
  if (typeof selectSubmission === "function") { selectSubmission(id, true); return; }
  activeSubmissionId = id;
}

function rnDownloadNotice(subId) {
  const sub = rnSub(subId); const n = sub && sub.renewal && sub.renewal.notice;
  if (!n) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rnWrap(n.kind, n.html)], { type: "text/html" })); a.download = `${subId}-${n.kind}-notice.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** When a renewal submission is bound, close out the expiring policy. */
function rnOnBound(sub) {
  if (!sub || !sub.renewalOf || !(sub.pasSync && sub.pasSync.policyNumber)) return;
  const old = rnSub(sub.renewalOf);
  if (!old) return;
  const r = rnRecord(old);
  if (r.status === "renewed") return;
  r.status = "renewed"; r.renewedPolicyNumber = sub.pasSync.policyNumber; r.renewedBy = sub.id; r.renewedAt = rnNow();
  rnLog(old, "renewal_completed", `Renewed as ${sub.pasSync.policyNumber} (submission ${sub.id}).`);
  rnLog(sub, "renewal_completed", `Bound as the renewal of ${old.id} (policy ${rnFacts(old).policyNumber}).`);
  rnPersist();
}

// ----------------------------------------------------------------------------
// 6. RENDERING
// ----------------------------------------------------------------------------
var RN_STAGE_UI = {
  upcoming: { badge: "badge-light", label: "Upcoming" },
  review_due: { badge: "badge-warning", label: "Review due" },
  under_review: { badge: "badge-info", label: "Under review" },
  renewal_in_progress: { badge: "badge-primary", label: "Renewal in progress" },
  non_renewal_notified: { badge: "badge-danger", label: "Non-renewal notified" },
  renewed: { badge: "badge-success", label: "Renewed" },
  non_renewed: { badge: "badge-light", label: "Non-renewed" },
  lapsed: { badge: "badge-danger", label: "Lapsed — no decision" }
};
var rnUI = { bucket: "all", stage: "all", selected: null };

function rnSetFilter(kind, v) { rnUI[kind] = v; renderRenewalPipeline(); }
function rnSelect(id) { rnUI.selected = id; renderRenewalPipeline(); }

function rnDetailHtml(p) {
  const sub = p.sub, r = rnRecord(sub), canEdit = hasPermission("renewals", "edit"), canApprove = hasPermission("renewals", "approve"), canOverride = hasPermission("renewals", "override");
  const today = rnToday();
  const ms = p.milestones.map(m => {
    const done = (m.key === "review" && r.reviewStartedAt) || (m.key === "info" && r.infoRequestedAt) || (m.key === "quote" && ["renewal_in_progress", "renewed"].includes(r.status)) || (["nonrenewal", "conditional"].includes(m.key) && r.decision);
    const overdue = !done && m.due < today && p.days >= 0;
    return `<tr><td>${rnEsc(m.label)}</td><td>${rnEsc(m.due)}</td><td>${done ? '<span class="badge badge-success text-xs">Done</span>' : (overdue ? '<span class="badge badge-danger text-xs">Overdue</span>' : '<span class="badge badge-light text-xs">Ahead</span>')}</td></tr>`;
  }).join("");

  let actions = "";
  if (["renewed", "non_renewed", "lapsed"].includes(p.stage)) {
    actions = `<div class="alert ${p.stage === "renewed" ? "alert-success" : "alert-warning"} text-xs">${p.stage === "renewed" ? `Renewed as ${rnEsc(r.renewedPolicyNumber)} (submission ${rnEsc(r.renewedBy)}).` : (p.stage === "non_renewed" ? "The policy has expired and was not renewed." : "The policy expired with no decision. Compliance should review whether the policy must be treated as extended.")}</div>`;
  } else if (p.stage === "non_renewal_notified") {
    actions = `<div class="alert alert-danger text-xs"><i class="ph ph-prohibit"></i> Non-renewal notice mailed ${rnEsc(r.notice.mailedOn)} (proof ${rnEsc(r.notice.proofRef)}); the policy ends ${rnEsc(r.notice.effective)}.${r.notice.late ? " <strong>Late notice.</strong>" : ""}</div>
      <button class="btn btn-xs btn-outline" style="width:auto;" onclick="rnDownloadNotice('${rnEsc(sub.id)}')"><i class="ph ph-download-simple"></i> Notice</button>
      ${canOverride ? `<div style="margin-top:8px;display:flex;gap:8px;"><input id="rn_rescindWhy" class="form-control" style="width:340px;" placeholder="Reason to rescind (10+ characters)"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="rnRescindNonRenewal('${rnEsc(sub.id)}')">Rescind non-renewal</button></div>` : ""}`;
  } else if (p.stage === "renewal_in_progress") {
    actions = `<div class="alert alert-info text-xs"><i class="ph ph-arrows-clockwise"></i> Renewal submission <strong>${rnEsc(r.renewalSubmissionId)}</strong> is in the workflow${r.decision === "conditional" ? " (conditional renewal; notice mailed " + rnEsc(r.notice.mailedOn) + ")" : ""}.</div>
      <button class="btn btn-sm btn-primary" style="width:auto;" onclick="rnOpenRenewalSubmission('${rnEsc(r.renewalSubmissionId)}')"><i class="ph ph-arrow-square-out"></i> Open renewal submission</button>`;
  } else {
    const infoBoxes = RN_INFO_CHECKLIST.map((x, i) => `<label style="display:block;font-size:12.5px;"><input type="checkbox" id="rn_info_${i}" checked> ${rnEsc(x)}</label>`).join("");
    const reasonOpts = RN_NONRENEWAL_REASONS.map(x => `<option value="${x.code}">${rnEsc(x.label)}</option>`).join("");
    const fcraOpts = ['<option value="">— none —</option>'].concat((sub.notices || []).filter(n => n.status === "issued" && n.consumerUsed).map(n => `<option value="${rnEsc(n.id)}">${rnEsc(n.id)}</option>`)).join("");
    actions = `
      ${canEdit ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">${r.status === "not_started" ? `<button class="btn btn-sm btn-outline" style="width:auto;" onclick="rnStartReview('${rnEsc(sub.id)}')"><i class="ph ph-play"></i> Start renewal review</button>` : ""}</div>
        <h4 style="margin:6px 0;">Request renewal information</h4>${infoBoxes}
        <div style="display:flex;gap:8px;margin-top:6px;"><input id="rn_infoNote" class="form-control" style="flex:1;" placeholder="Note to the producer (optional)"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="rnRequestInfo('${rnEsc(sub.id)}')">Record request</button></div>${r.infoRequestedAt ? `<div class="text-xs text-muted" style="margin-top:4px;">Requested ${rnEsc(r.infoRequestedAt)} by ${rnEsc(r.infoRequestedBy)}</div>` : ""}` : ""}
      ${(canApprove || canOverride) ? `<h4 style="margin:16px 0 6px;">Decision</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <input id="rn_pct" type="number" step="0.1" class="form-control" style="width:250px;" placeholder="Expected premium change %">
        <label style="font-size:12.5px;"><input type="checkbox" id="rn_reduced"> Cover will be reduced</label>
      </div>
      <textarea id="rn_terms" class="form-control" rows="2" style="width:100%;margin-top:8px;" placeholder="Changed terms (for a conditional renewal)"></textarea>
      <h4 style="margin:12px 0 6px;">Notice (conditional renewal or non-renewal)</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <label class="text-xs text-muted" style="font-size:12px;">Mailed <input id="rn_mailed" type="date" class="form-control" style="width:150px;" value="${today}"></label>
        <input id="rn_proof" class="form-control" style="width:230px;" placeholder="Proof-of-mailing reference">
        <select id="rn_reason" class="form-control" style="width:340px;">${reasonOpts}</select>
      </div>
      <textarea id="rn_facts" class="form-control" rows="2" style="width:100%;margin-top:8px;" placeholder="Facts behind a non-renewal (required)"></textarea>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:6px;font-size:12.5px;">
        <label><input type="checkbox" id="rn_consumer"> A consumer report was a factor</label>
        <label>FCRA notice <select id="rn_fcra" class="form-control" style="width:200px;display:inline-block;">${fcraOpts}</select></label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px;font-size:12.5px;">
        <label><input type="checkbox" id="rn_lateAck"> If the notice is late: Compliance has been told</label>
        <input id="rn_lateWhy" class="form-control" style="flex:1;min-width:220px;" placeholder="Why it is late (10+ characters)">
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
        ${canApprove ? `<button class="btn btn-sm btn-primary" style="width:auto;" onclick="rnDecide('${rnEsc(sub.id)}','renew')"><i class="ph ph-arrows-clockwise"></i> Renew</button>
        <button class="btn btn-sm btn-outline" style="width:auto;" onclick="rnDecide('${rnEsc(sub.id)}','conditional')"><i class="ph ph-warning"></i> Renew with changes (conditional)</button>` : ""}
        ${canOverride ? `<button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="rnDecide('${rnEsc(sub.id)}','non_renew')"><i class="ph ph-prohibit"></i> Non-renew</button>` : ""}
      </div>` : `<p class="text-xs text-muted"><i class="ph ph-lock"></i> Renewal decisions need an underwriter with approval authority.</p>`}`;
  }
  return `<div class="card" style="margin-top:14px;"><div class="card-header"><h3><i class="ph ph-calendar-check"></i> ${rnEsc(sub.insured)} — ${rnEsc(p.f.policyNumber)}</h3><span class="badge ${RN_STAGE_UI[p.stage].badge}">${RN_STAGE_UI[p.stage].label}</span></div>
    <div class="card-body">
      <div class="text-xs text-muted" style="margin-bottom:8px;">Expires ${rnEsc(p.f.expiration)} (${p.days >= 0 ? p.days + " days" : -p.days + " days ago"}) · annual premium ${rnMoney(p.f.annual)} · risk state ${rnEsc(p.state || "unknown")}</div>
      <div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Milestone</th><th>Date</th><th>Status</th></tr></thead><tbody>${ms}</tbody></table></div>
      <div style="margin-top:12px;">${actions}</div>
      <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> Notice days default to ${RENEWAL_NOTICE_DEFAULTS.nonrenewal} (non-renewal) and ${RENEWAL_NOTICE_DEFAULTS.conditional} (conditional renewal) and are placeholders: state law governs. A conditional renewal applies above a ${RENEWAL_CONDITIONAL_PREMIUM_PCT}% premium rise or any reduction in cover.</p>
    </div></div>`;
}

/** The next thing someone has to do for this policy, and whether it is already late. Only while a decision is still open. */
function rnNextAction(p, today) {
  if (!["upcoming", "review_due", "under_review"].includes(p.stage)) return null;
  const r = p.sub.renewal || {};
  const by = {}; p.milestones.forEach(m => { by[m.key] = m.due; });
  const todo = [];
  if (!r.reviewStartedAt) todo.push({ label: "Start renewal review", due: by.review });
  if (!r.infoRequestedAt) todo.push({ label: "Request renewal information", due: by.info });
  todo.push({ label: "Decide and give any notice", due: by.nonrenewal });
  todo.sort((a, b) => a.due.localeCompare(b.due));
  const first = todo[0];
  const overdueItems = todo.filter(x => x.due < today && p.days >= 0);
  return { label: first.label, due: first.due, overdue: first.due < today && p.days >= 0, overdueCount: overdueItems.length };
}

function renderRenewalPipeline() {
  const root = document.getElementById("renewalPipelineRoot");
  if (!root) return;
  rnSweep();
  let list = rnPolicies();
  const total = list.length;
  if (rnUI.bucket !== "all") { const n = Number(rnUI.bucket); list = list.filter(p => p.days >= 0 && p.days <= n); }
  if (rnUI.stage !== "all") list = list.filter(p => p.stage === rnUI.stage);
  const today = rnToday();

  const counts = {}; rnPolicies().forEach(p => { counts[p.stage] = (counts[p.stage] || 0) + 1; });
  const summary = Object.keys(RN_STAGE_UI).filter(k => counts[k]).map(k => `<span class="badge ${RN_STAGE_UI[k].badge}" style="margin-right:6px;">${RN_STAGE_UI[k].label}: ${counts[k]}</span>`).join("");

  const rows = list.map(p => {
    const na = rnNextAction(p, today);
    const next = na && { label: na.label, due: na.due };
    const late = na && na.overdue ? na.overdueCount : 0;
    return `<tr ${rnUI.selected === p.sub.id ? 'style="background:#f1f5f9;"' : ""}><td><strong>${rnEsc(p.sub.insured)}</strong><div class="text-xs text-muted">${rnEsc(p.sub.id)}</div></td><td>${rnEsc(p.sub.lobName || "")}</td><td class="font-mono">${rnEsc(p.f.policyNumber)}</td>
      <td>${rnEsc(p.f.expiration)}<div class="text-xs ${p.days < 30 ? "text-danger" : "text-muted"}">${p.days >= 0 ? p.days + " days" : "expired"}</div></td><td class="font-mono">${rnMoney(p.f.annual)}</td>
      <td><span class="badge ${RN_STAGE_UI[p.stage].badge} text-xs">${RN_STAGE_UI[p.stage].label}</span>${late ? ` <span class="badge badge-danger text-xs">${late} overdue</span>` : ""}</td>
      <td class="text-xs">${next ? rnEsc(next.label) + "<br><span class='" + (na.overdue ? "text-danger" : "text-muted") + "'>" + (na.overdue ? "overdue since " : "by ") + rnEsc(next.due) + "</span>" : "—"}</td>
      <td><button class="btn btn-xs btn-outline" style="width:auto;" onclick="rnSelect('${rnEsc(p.sub.id)}')">Manage</button></td></tr>`;
  }).join("");

  const sel = rnUI.selected && rnPolicies().find(p => p.sub.id === rnUI.selected);
  root.innerHTML = `
    <div class="card">
      <div class="card-header"><h3><i class="ph ph-calendar-check"></i> Renewal Pipeline</h3><span class="text-xs text-muted">${total} bound polic${total === 1 ? "y" : "ies"}</span></div>
      <div class="card-body">
        <div style="margin-bottom:10px;">${summary || '<span class="text-xs text-muted">No bound policies yet. A policy appears here once it has been bound with an expiry date.</span>'}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          <select class="form-control" style="width:230px;" onchange="rnSetFilter('bucket', this.value)">${[["all", "Any expiry date"], ["30", "Expiring within 30 days"], ["60", "Within 60 days"], ["90", "Within 90 days"], ["120", "Within 120 days"]].map(o => `<option value="${o[0]}" ${rnUI.bucket === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select>
          <select class="form-control" style="width:230px;" onchange="rnSetFilter('stage', this.value)"><option value="all">Any stage</option>${Object.keys(RN_STAGE_UI).map(k => `<option value="${k}" ${rnUI.stage === k ? "selected" : ""}>${RN_STAGE_UI[k].label}</option>`).join("")}</select>
        </div>
        ${rows ? `<div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Insured</th><th>Line</th><th>Policy</th><th>Expires</th><th>Annual premium</th><th>Stage</th><th>Next milestone</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : (total ? '<p class="text-xs text-muted">No policies match the filters.</p>' : "")}
      </div>
    </div>
    ${sel ? rnDetailHtml(sel) : ""}`;
}

/** A small status card on Quote & Bind: the policy's renewal status, or, on a renewal submission, how it compares with the expiring policy. */
function renderRenewalChip(sub) {
  const box = document.getElementById("renewalStatusContainer");
  if (!box || !sub) return;
  let html = "";
  if (sub.renewalOf) {
    const old = rnSub(sub.renewalOf);
    const prior = sub.priorPolicy;
    const newPrem = typeof getSubmissionPremium === "function" ? getSubmissionPremium(sub) : 0;
    let warn = "";
    if (prior && prior.premium > 0 && newPrem > 0) {
      const pct = Math.round((newPrem - prior.premium) / prior.premium * 1000) / 10;
      const r = old && old.renewal;
      if (pct > RENEWAL_CONDITIONAL_PREMIUM_PCT && r && r.decision === "renew") warn = `<div class="alert alert-warning text-xs"><i class="ph ph-warning"></i> The renewal premium is ${pct}% above the expiring premium, over the ${RENEWAL_CONDITIONAL_PREMIUM_PCT}% threshold, but the decision was a plain renewal and no conditional-renewal notice was given. Check the notice rules before issuing the quote.</div>`;
      else warn = `<div class="text-xs text-muted">Renewal premium ${pct >= 0 ? "+" : ""}${pct}% against the expiring premium of ${rnMoney(prior.premium)}.</div>`;
    }
    html = `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-arrows-clockwise"></i> Renewal of ${rnEsc(sub.renewalOf)}</h3><span class="badge badge-primary">Renewal</span></div><div class="card-body"><div class="text-xs" style="margin-bottom:6px;">Expiring policy ${rnEsc(prior ? prior.policyNumber : "")} (${rnEsc(prior ? prior.policyPeriod : "")}). Compare it on Quote Intelligence → Old vs New.</div>${warn}</div></div>`;
  } else if (rnIsRenewable(sub)) {
    const f = rnFacts(sub), days = rnDays(rnToday(), f.expiration), stage = rnStageOf(sub.renewal, days);
    html = `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-calendar-check"></i> Renewal</h3><span class="badge ${RN_STAGE_UI[stage].badge}">${RN_STAGE_UI[stage].label}</span></div><div class="card-body"><div class="text-xs">Expires ${rnEsc(f.expiration)} (${days >= 0 ? days + " days" : "expired"}). Manage it in Quote Intelligence → Renewal Pipeline.</div></div></div>`;
  }
  box.innerHTML = html;
}

// ----------------------------------------------------------------------------
// 7. HOOKS
// ----------------------------------------------------------------------------
(function installRenewalHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.renewal_review_started = m("Renewal Review Started", "ph-play", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.renewal_info_requested = m("Renewal Information Requested", "ph-envelope-open", "badge-light", "outcome-comm");
    AUDIT_ACTION_META.renewal_offered = m("Renewal Offered", "ph-arrows-clockwise", "badge-primary", "outcome-approve");
    AUDIT_ACTION_META.renewal_conditional_notice = m("Conditional Renewal Notice", "ph-warning", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.nonrenewal_notice_issued = m("Non-Renewal Notice Issued", "ph-prohibit", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.nonrenewal_rescinded = m("Non-Renewal Rescinded", "ph-arrow-counter-clockwise", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.renewal_completed = m("Renewal Completed", "ph-check-circle", "badge-success", "outcome-bind");
    AUDIT_ACTION_META.renewal_lapsed = m("Policy Lapsed — No Renewal Decision", "ph-warning-circle", "badge-danger", "outcome-refer");
  }

  // Quote Intelligence gets a third tab
  const origSwitch = window.switchQuoteIntelTab;
  if (typeof origSwitch === "function") {
    window.switchQuoteIntelTab = function (tab) {
      const panel = document.getElementById("qiPanelPipeline"), tb = document.getElementById("qiTabPipeline");
      if (tab === "pipeline") {
        origSwitch.call(this, "renewal");
        quoteIntelActiveTab = "pipeline";
        ["qiPanelRenewal", "qiPanelCompare"].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = "none"; });
        ["qiTabRenewal", "qiTabCompare"].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove("active"); });
        if (tb) tb.classList.add("active");
        if (panel) panel.style.display = "block";
        renderRenewalPipeline();
        return;
      }
      const r = origSwitch.apply(this, arguments);
      if (panel) panel.style.display = "none";
      if (tb) tb.classList.remove("active");
      return r;
    };
  }
  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || rnSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); if (s) renderRenewalChip(s); } catch (e) { console.warn("Renewal chip failed:", e); }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderRenewalChip(sub); } catch (e) { console.warn("Renewal chip failed:", e); }
      return r;
    };
  }
  // A bound renewal closes out the expiring policy
  const origRecord = window.recordQuoteVersion;
  if (typeof origRecord === "function") {
    window.recordQuoteVersion = function (sub, isBound) {
      const r = origRecord.apply(this, arguments);
      if (isBound === true && sub) rnOnBound(sub);
      return r;
    };
  }
})();

window.rnStartReview = rnStartReview; window.rnRequestInfo = rnRequestInfo; window.rnDecide = rnDecide;
window.rnRescindNonRenewal = rnRescindNonRenewal; window.rnOpenRenewalSubmission = rnOpenRenewalSubmission;
window.rnDownloadNotice = rnDownloadNotice; window.rnSetFilter = rnSetFilter; window.rnSelect = rnSelect;
window.renderRenewalPipeline = renderRenewalPipeline; window.renderRenewalChip = renderRenewalChip;
