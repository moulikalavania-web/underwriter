/**
 * ============================================================================
 * DECLINE CENTER: THE OUTCOME OF EVERY SUBMISSION THAT DID NOT BECOME A POLICY
 * ----------------------------------------------------------------------------
 * The Decline Center listed three exit paths with a free-text reason. A quote the insured did not take, one that lapsed, a
 * submission the broker withdrew, one lost to another carrier, and one closed for want of information had no record at all, so
 * nobody could say why business was lost or at what price. This keeps one governed outcome per submission.
 *
 *   OUTCOME TYPE   declined by an underwriter, declined automatically by a rule, declined by the market, not taken by the insured,
 *                  quote expired, withdrawn by the broker, lost to a competitor, closed incomplete.
 *   REASON         from a governed list for that type; the decline reasons are the ones the declination notice uses, so the outcome
 *                  and the notice cannot disagree. A free-text explanation is also required.
 *   WHAT BACKS IT  a decline names the decision a person took; an automatic decline names the rule run that made it; "not taken" and
 *                  "expired" name the quote version; "lost to a competitor" names the competitor and, if known, its premium.
 *   ADVERSE ACTION a decline that relied on a consumer report (a credit-based score, or a report the underwriter says was used) owes
 *                  a declination notice. The outcome shows the notice as owed until one is issued, and as overdue past the target.
 *   ONE CURRENT    a submission has one current outcome. A corrected one supersedes it; a reopened one is closed with who reopened it
 *                  and why, and the business can come back on the same case or as a new submission linked to it.
 *
 * Declines made through the existing exits (the decline form, the appetite knockout, the duplicate FEIN exit) now write their outcome.
 * A quote not accepted within its validity is closed as expired by a sweep. The list of reasons is an internal code set for the
 * company to confirm; the quote validity is a placeholder.
 * ============================================================================
 */

const OUT_TYPES = {
  declined_by_underwriter: { label: "Declined by an underwriter", group: "declined", decline: true },
  auto_declined: { label: "Declined automatically by a rule", group: "declined", decline: true },
  declined_by_market: { label: "Declined by the market", group: "declined", decline: false },
  not_taken_by_insured: { label: "Quote not taken by the insured", group: "lost", decline: false },
  quote_expired: { label: "Quote expired", group: "lost", decline: false },
  withdrawn_by_broker: { label: "Withdrawn by the broker", group: "closed", decline: false },
  lost_to_competitor: { label: "Lost to a competitor", group: "lost", decline: false },
  closed_incomplete: { label: "Closed, information not received", group: "closed", decline: false }
};
const OUT_QUOTE_VALID_DAYS = 30;   // placeholder: how long an issued quote stays open before it is closed as expired
const OUT_MIN_REASON = 10;
const OUT_PRICE = [{ code: "PRICE", label: "Price" }, { code: "TERMS", label: "Terms or conditions" }, { code: "COVERAGE", label: "Coverage offered" }, { code: "TIMING", label: "Timing" }, { code: "RELATIONSHIP", label: "Relationship with another carrier or broker" }, { code: "OTHER", label: "Another reason (explained below)" }];
function outReasons(type) {
  const dec = (typeof NOTICE_REASON_CODES !== "undefined" ? NOTICE_REASON_CODES : [{ code: "OTHER", label: "Another reason (explained below)" }]).map(r => ({ code: r.code, label: r.label, consumerReport: !!r.consumerReport }));
  return { declined_by_underwriter: dec, auto_declined: dec, declined_by_market: dec.concat([{ code: "MARKET_CAPACITY", label: "The market has no capacity for this class" }]), not_taken_by_insured: OUT_PRICE, quote_expired: [{ code: "NO_RESPONSE", label: "No response within the validity of the quote" }, { code: "OTHER", label: "Another reason (explained below)" }], withdrawn_by_broker: [{ code: "BROKER_REQUEST", label: "The broker asked to withdraw" }, { code: "PLACED_ELSEWHERE", label: "The broker placed it elsewhere" }, { code: "INSURED_WITHDREW", label: "The insured no longer wants cover" }, { code: "OTHER", label: "Another reason (explained below)" }], lost_to_competitor: OUT_PRICE, closed_incomplete: [{ code: "NO_INFO_RECEIVED", label: "The information requested was not received" }, { code: "OTHER", label: "Another reason (explained below)" }] }[type] || [];
}
function outReason(type, code) { return outReasons(type).find(r => r.code === code) || null; }
function outEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function outNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function outActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function outMs(at) { const t = Date.parse(String(at || "").replace(" ", "T") + (String(at || "").length <= 16 ? ":00Z" : "")); return isNaN(t) ? null : t; }
function outSave() { if (typeof persistAppState === "function") persistAppState(); }
function outCurrent(sub) { return (sub.outcomes || []).find(o => o.status === "current") || null; }
function outLog(sub, decision, notes, by) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 4, decision: decision, by: by || outActor(), at: outNow(), notes: notes }); }
function outQuoteVersions(sub) { const e = (typeof QUOTE_VERSIONS_DATASET !== "undefined" ? QUOTE_VERSIONS_DATASET : []).find(v => v.subId === sub.id); return e ? e.quotes : []; }

/** What is wrong with an outcome, as { field, message }. [] when it can be recorded. */
function outValidate(sub, o) {
  const e = [], t = OUT_TYPES[o.type];
  if (!t) return [{ field: "type", message: "The outcome is one of: " + Object.keys(OUT_TYPES).join(", ") + "." }];
  const r = outReason(o.type, o.reasonCode);
  if (!r) e.push({ field: "reason", message: "Pick a reason from the list for " + t.label.toLowerCase() + "." });
  if (String(o.reasonText || "").trim().length < OUT_MIN_REASON) e.push({ field: "reasonText", message: "Explain it in at least " + OUT_MIN_REASON + " characters." });
  if (o.type === "declined_by_underwriter") { const d = [].concat(sub.decisionLog || []).reverse().find(x => ["declined", "auth_referral_closed"].indexOf(x.decision) > -1); if (!d) e.push({ field: "decision", message: "A decline names the decision a person took; none is on the case's log." }); }
  if (o.type === "auto_declined") { const run = [].concat(sub.ruleRuns || []).reverse().find(x => x.outcome === "auto_declined"); if (!run) e.push({ field: "rule_run", message: "An automatic decline names the rule run that made it; no run on this case ended in a knockout." }); }
  if (o.type === "not_taken_by_insured" || o.type === "quote_expired") { const q = outQuoteVersions(sub); if (!q.length) e.push({ field: "quote", message: "There is no quote version on the case for this outcome to refer to." }); else if (o.quoteVersionId && !q.some(x => x.versionId === o.quoteVersionId)) e.push({ field: "quote", message: o.quoteVersionId + " is not a quote version of this case." }); }
  if (o.type === "lost_to_competitor") {
    if (!String(o.competitorName || "").trim()) e.push({ field: "competitor", message: "Name the competitor." });
    if (o.competitorPremium !== undefined && o.competitorPremium !== null && o.competitorPremium !== "" && !(Number(o.competitorPremium) >= 0)) e.push({ field: "competitorPremium", message: "The competitor's premium is a number from 0." });
  }
  if (sub.pasSync && sub.pasSync.status === "success") e.push({ field: "bound", message: "The policy is bound, so the submission did not end without one." });
  return e;
}

/** Records the outcome of a submission. One is current at a time; a corrected one needs { supersede: true }. */
function outRecord(sub, o, opts) {
  opts = opts || {};
  const t = OUT_TYPES[o.type];
  if (!opts.system) {
    const res = t && t.decline ? ["workflow", "approve"] : ["submissionData", "edit"];
    if (!hasPermission(res[0], res[1])) { denyPermission(res[0], res[1]); return { ok: false, error: "permission" }; }
  }
  const errs = outValidate(sub, o); if (errs.length) return { ok: false, error: "invalid", errors: errs };
  const cur = outCurrent(sub);
  if (cur && !opts.supersede) return { ok: false, error: "exists", current: cur };
  if (!sub.outcomes) sub.outcomes = [];
  const r = outReason(o.type, o.reasonCode), q = outQuoteVersions(sub), qv = o.quoteVersionId ? q.find(x => x.versionId === o.quoteVersionId) : q[q.length - 1];
  const run = o.type === "auto_declined" ? [].concat(sub.ruleRuns || []).reverse().find(x => x.outcome === "auto_declined") : null;
  const dec = o.type === "declined_by_underwriter" ? [].concat(sub.decisionLog || []).reverse().find(x => ["declined", "auth_referral_closed"].indexOf(x.decision) > -1) : null;
  const premium = typeof authMeasures === "function" ? authMeasures(sub).premium : null;
  const rec = { id: "OUT-" + (sub.outcomes.length + 1), type: o.type, reasonCode: o.reasonCode, reasonLabel: r.label, reasonText: String(o.reasonText).trim(), consumerReportUsed: !!(o.consumerReportUsed || r.consumerReport), adverseActionRequired: false, competitorName: o.type === "lost_to_competitor" ? String(o.competitorName).trim() : null, competitorPremium: o.type === "lost_to_competitor" && o.competitorPremium !== undefined && o.competitorPremium !== "" && o.competitorPremium !== null ? Number(o.competitorPremium) : null, ourPremium: premium, currency: "USD", decisionRef: dec ? { decision: dec.decision, at: dec.at, by: dec.by } : null, ruleRunId: run ? run.runId : null, quoteVersionId: (o.type === "not_taken_by_insured" || o.type === "quote_expired" || o.type === "lost_to_competitor") && qv ? qv.versionId : null, triggerPoint: o.triggerPoint || null, status: "current", source: opts.system ? "system" : "person", decidedBy: opts.system ? "System" : outActor(), decidedByRole: opts.system ? "system" : currentUserRole, decidedAt: outNow(), supersedesId: cur ? cur.id : null, reopenedSubmissionId: null };
  rec.adverseActionRequired = !!(t.decline && rec.consumerReportUsed);
  if (cur) { cur.status = "superseded"; cur.supersededAt = outNow(); cur.supersededBy = rec.id; }
  sub.outcomes.push(rec);
  if (t.decline) { sub.lifecycleStatus = "declined"; sub.lifecycleStatusAt = sub.lifecycleStatusAt || Date.now(); }
  else if (!["declined"].includes(sub.lifecycleStatus)) { sub.lifecycleStatus = "closed"; sub.lifecycleStatusAt = Date.now(); sub.statusText = t.label; sub.statusBadge = "badge-light"; }
  outLog(sub, "outcome_recorded", t.label + ": " + r.label + ". " + rec.reasonText + (rec.competitorName ? " Competitor " + rec.competitorName + (rec.competitorPremium !== null ? " at $" + rec.competitorPremium.toLocaleString("en-US") : "") + "." : "") + (rec.adverseActionRequired ? " An adverse-action notice is owed." : ""), rec.decidedBy);
  outSave();
  return { ok: true, outcome: rec };
}

/** not_required, owed or issued; and whether an owed notice is past the target. */
function outNoticeState(sub, out) {
  if (!out || !out.adverseActionRequired) return { state: "not_required" };
  const issued = typeof noticeIssuedOfType === "function" ? noticeIssuedOfType(sub, "declination") : [];
  if (issued.length) return { state: "issued", noticeId: issued[0].id };
  const days = typeof NOTICE_TARGET_DAYS !== "undefined" ? NOTICE_TARGET_DAYS : 3, at = outMs(out.decidedAt);
  const age = at === null ? 0 : (Date.now() - at) / 86400000;
  return { state: "owed", overdue: age > days, ageDays: Math.floor(age), targetDays: days };
}

/** Closes the current outcome so the business can go on, on the same case or as a new submission linked to it. */
function outReopen(sub, reason, opts) {
  opts = opts || {};
  if (!hasPermission("workflow", "approve")) { denyPermission("workflow", "approve"); return { ok: false, error: "permission" }; }
  const cur = outCurrent(sub); if (!cur) return { ok: false, error: "none" };
  if (String(reason || "").trim().length < OUT_MIN_REASON) return { ok: false, error: "reason" };
  if (sub.pasSync && sub.pasSync.status === "success") return { ok: false, error: "bound" };
  cur.status = "reopened"; cur.reopenedAt = outNow(); cur.reopenedBy = outActor(); cur.reopenReason = String(reason).trim();
  let target = sub;
  if (opts.asNew) {
    const copy = JSON.parse(JSON.stringify(sub));
    (typeof RN_RESET_FIELDS !== "undefined" ? RN_RESET_FIELDS : []).concat(["outcomes", "ruleRuns", "aiExecutionIds", "lifecycleStatus", "lifecycleStatusAt", "declineReason", "declinedBy", "declineTriggerPoint"]).forEach(k => { delete copy[k]; });
    const n = SUBMISSIONS_DATASET.filter(s => s.reopenedFrom === sub.id).length + 1;
    copy.id = sub.id + "-RO" + n; copy.reopenedFrom = sub.id; copy.decisionLog = []; copy.statusText = "Reopened"; copy.statusBadge = "badge-warning"; copy.receivedAt = "Just Now"; copy.receivedTimestamp = Date.now(); copy.currentStep = Math.min(copy.currentStep || 4, 4);
    SUBMISSIONS_DATASET.unshift(copy); cur.reopenedSubmissionId = copy.id; target = copy;
    outLog(copy, "outcome_reopened_as_new", "Reopened from " + sub.id + " (" + OUT_TYPES[cur.type].label + "): " + cur.reopenReason);
  } else {
    delete sub.lifecycleStatus; delete sub.lifecycleStatusAt; sub.statusText = "Reopened"; sub.statusBadge = "badge-warning";
  }
  (typeof DECLINE_LOG !== "undefined" ? DECLINE_LOG : []).forEach(e => { if (e.subId === sub.id) e.reopened = true; });
  outLog(sub, "outcome_reopened", "Outcome " + cur.id + " (" + OUT_TYPES[cur.type].label + ") reopened: " + cur.reopenReason + (opts.asNew ? " New submission " + target.id + "." : ""));
  outSave();
  return { ok: true, outcome: cur, submission: target };
}

/** Quotes not answered within their validity are closed as expired, by the system. */
function outSweepExpired(now, dataset) {
  const t = now || Date.now(), made = [];
  (dataset || SUBMISSIONS_DATASET).forEach(sub => {
    if (!sub.quoteIssued || (sub.pasSync && sub.pasSync.status === "success") || outCurrent(sub) || sub.lifecycleStatus) return;
    const q = outQuoteVersions(sub), last = q[q.length - 1]; if (!last) return;
    const at = outMs(last.date); if (at === null) return;
    const days = Number(sub.quoteValidDays) > 0 ? Number(sub.quoteValidDays) : OUT_QUOTE_VALID_DAYS;
    if (t > at + days * 86400000) { const r = outRecord(sub, { type: "quote_expired", reasonCode: "NO_RESPONSE", reasonText: "The quote " + last.versionId + " was issued on " + last.date + " and was not accepted within " + days + " days.", quoteVersionId: last.versionId }, { system: true }); if (r.ok) made.push(r.outcome); }
  });
  return made;
}

/** The book's outcomes in numbers: by type and reason, quote-to-bind, and the price gap on business lost to competitors. */
function outStats(dataset) {
  const data = dataset || SUBMISSIONS_DATASET, cur = [];
  data.forEach(s => { const o = outCurrent(s); if (o) cur.push({ sub: s, out: o }); });
  const byType = {}, byReason = {};
  cur.forEach(x => { byType[x.out.type] = (byType[x.out.type] || 0) + 1; const k = x.out.type + "|" + x.out.reasonCode; byReason[k] = (byReason[k] || 0) + 1; });
  const quoted = data.filter(s => s.quoteIssued || (s.pasSync && s.pasSync.status === "success")).length, bound = data.filter(s => s.pasSync && s.pasSync.status === "success").length;
  const lost = cur.filter(x => x.out.type === "lost_to_competitor"), gaps = lost.filter(x => x.out.competitorPremium !== null && x.out.ourPremium > 0).map(x => (x.out.ourPremium - x.out.competitorPremium) / x.out.competitorPremium * 100);
  const owed = cur.filter(x => outNoticeState(x.sub, x.out).state === "owed");
  return { total: cur.length, byType: byType, byReason: byReason, quoted: quoted, bound: bound, quoteToBindPct: quoted ? Math.round(bound / quoted * 1000) / 10 : null, lostCount: lost.length, lostWithPrice: gaps.length, avgPriceGapPct: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10 : null, noticesOwed: owed.length, noticesOverdue: owed.filter(x => outNoticeState(x.sub, x.out).overdue).length };
}

// ----------------------------------------------------------------------------
// HOOKS: THE EXISTING EXITS WRITE THEIR OUTCOME
// ----------------------------------------------------------------------------
function outFromExit(sub, triggerPoint, reasonText, declineReasonCode) {
  if (!sub || outCurrent(sub)) return;
  let type = "declined_by_underwriter", code = declineReasonCode || (triggerPoint === "Duplicate FEIN" ? "DUPLICATE" : triggerPoint === "Appetite Knockout" ? "APPETITE" : "OTHER");
  const lastRun = (sub.ruleRuns || [])[(sub.ruleRuns || []).length - 1];
  if (triggerPoint === "Appetite Knockout" && lastRun && lastRun.outcome === "auto_declined") type = "auto_declined";
  const r = outRecord(sub, { type: type, reasonCode: code, reasonText: reasonText && reasonText.length >= OUT_MIN_REASON ? reasonText : (reasonText || "") + " (" + triggerPoint + ")", triggerPoint: triggerPoint }, { system: true });
  if (!r.ok) console.warn("Outcome not recorded:", r.errors || r.error);
  else { r.outcome.decidedBy = sub.declinedBy || r.outcome.decidedBy; r.outcome.source = "person"; }
}
["triggerAppetiteFailureExit:Appetite Knockout", "triggerDuplicateExit:Duplicate FEIN"].forEach(spec => {
  const [fn, tp] = spec.split(":"), orig = window[fn];
  if (typeof orig !== "function") return;
  window[fn] = function () {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId), before = sub && sub.lifecycleStatus;
    const r = orig.apply(this, arguments);
    try { if (sub && sub.lifecycleStatus === "declined" && before !== "declined") outFromExit(sub, tp, sub.declineReason || ""); renderDeclineOutcomes(); } catch (e) { console.warn("Outcome from exit failed:", e); }
    return r;
  };
});
var _outOrigSubmitDecline = window.submitDeclineSubmission;
if (typeof _outOrigSubmitDecline === "function") window.submitDeclineSubmission = function () {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === declineSubmissionTargetId), before = sub && sub.lifecycleStatus;
  const sel = document.getElementById("declineReasonCode"), code = sel && sel.value ? sel.value : null, used = document.getElementById("declineConsumerReport");
  const r = _outOrigSubmitDecline.apply(this, arguments);
  try {
    if (sub && sub.lifecycleStatus === "declined" && before !== "declined") {
      const tp = sub.declineTriggerPoint;
      if (tp === "Appetite Knockout" || tp === "Duplicate FEIN" || tp === "Senior UW Decline" || tp === "Other") {
        const c = code || (tp === "Duplicate FEIN" ? "DUPLICATE" : tp === "Appetite Knockout" ? "APPETITE" : "OTHER");
        if (!outCurrent(sub)) { const x = outRecord(sub, { type: "declined_by_underwriter", reasonCode: c, reasonText: sub.declineReason || "", consumerReportUsed: !!(used && used.checked), triggerPoint: tp }, { system: true }); if (x.ok) { x.outcome.decidedBy = sub.declinedBy; x.outcome.source = "person"; } }
      }
    }
    renderDeclineOutcomes();
  } catch (e) { console.warn("Outcome from the decline form failed:", e); }
  return r;
};
var _outOrigOpenModal = window.openDeclineSubmissionModal;
if (typeof _outOrigOpenModal === "function") window.openDeclineSubmissionModal = function () {
  const r = _outOrigOpenModal.apply(this, arguments), sel = document.getElementById("declineReasonCode"), cr = document.getElementById("declineConsumerReport");
  if (sel) sel.innerHTML = '<option value="">Choose from the trigger point</option>' + outReasons("declined_by_underwriter").map(x => `<option value="${x.code}">${outEsc(x.label)}</option>`).join("");
  if (cr) cr.checked = false;
  return r;
};
var _outOrigCheck = window.notificationsCheck;
if (typeof _outOrigCheck === "function") window.notificationsCheck = function (now) { try { outSweepExpired(now); } catch (e) { console.warn("Expiry sweep failed:", e); } return _outOrigCheck.apply(this, arguments); };
var _outOrigRenderCenter = window.renderDeclineCenter;
if (typeof _outOrigRenderCenter === "function") window.renderDeclineCenter = function () { const r = _outOrigRenderCenter.apply(this, arguments); try { renderDeclineOutcomes(); } catch (e) { console.warn("Outcome panel failed:", e); } return r; };

// ----------------------------------------------------------------------------
// SCREEN
// ----------------------------------------------------------------------------
var OUT_UI = { type: "", reason: "" };
function outUiV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function outUiToast(r, ok) {
  if (r.ok) { if (ok) showToast(ok, "success"); return; }
  if (r.error === "invalid") showToast(r.errors[0].message, "warning"); else if (r.error === "exists") showToast("This submission already has a current outcome (" + r.current.id + "). Reopen it, or record a correction.", "warning"); else if (r.error === "reason") showToast("Give a reason (at least " + OUT_MIN_REASON + " characters).", "warning"); else if (r.error === "none") showToast("There is no current outcome.", "info"); else if (r.error === "bound") showToast("The policy is bound.", "warning");
}
function outUiType() { OUT_UI.type = outUiV("out_type"); renderDeclineOutcomes(); }
function outUiRecord() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === outUiV("out_sub")); if (!sub) { showToast("Pick the submission.", "warning"); return; }
  const r = outRecord(sub, { type: outUiV("out_type"), reasonCode: outUiV("out_reason"), reasonText: outUiV("out_text"), competitorName: outUiV("out_comp"), competitorPremium: outUiV("out_comp_prem"), consumerReportUsed: !!(document.getElementById("out_cr") || {}).checked });
  outUiToast(r, "Outcome recorded."); if (r.ok) OUT_UI = { type: "", reason: "" }; renderDeclineOutcomes(); if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
}
function outUiReopen(subId, asNew) { const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return; const r = outReopen(sub, outUiV("out_reopen_reason"), { asNew: !!asNew }); outUiToast(r, asNew ? "Reopened as " + (r.submission || {}).id + "." : "Reopened."); renderDeclineOutcomes(); if (typeof renderSubmissionsTable === "function") renderSubmissionsTable(); }

function renderDeclineOutcomes() {
  const box = document.getElementById("declineOutcomesContainer"); if (!box) return;
  const st = outStats(), rows = [];
  SUBMISSIONS_DATASET.forEach(s => (s.outcomes || []).forEach(o => rows.push({ s: s, o: o })));
  rows.sort((a, b) => String(b.o.decidedAt).localeCompare(String(a.o.decidedAt)));
  const canReopen = hasPermission("workflow", "approve"), canRecord = hasPermission("submissionData", "edit");
  const typeOpts = Object.keys(OUT_TYPES).filter(k => !OUT_TYPES[k].decline).map(k => `<option value="${k}" ${OUT_UI.type === k ? "selected" : ""}>${outEsc(OUT_TYPES[k].label)}</option>`).join("");
  const reasonOpts = OUT_UI.type ? outReasons(OUT_UI.type).map(r => `<option value="${r.code}">${outEsc(r.label)}</option>`).join("") : "";
  const subOpts = SUBMISSIONS_DATASET.filter(s => s.apiSourced && !outCurrent(s) && !(s.pasSync && s.pasSync.status === "success")).map(s => `<option value="${outEsc(s.id)}">${outEsc(s.id + " " + (s.insured || ""))}</option>`).join("");
  const typeRows = Object.keys(OUT_TYPES).filter(k => st.byType[k]).map(k => `<span class="badge badge-light" style="margin-right:6px;">${outEsc(OUT_TYPES[k].label)}: ${st.byType[k]}</span>`).join("");
  box.innerHTML = `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-chart-pie-slice"></i> Why business did not become a policy</h3><span class="badge badge-light">${st.total} current outcome(s)</span></div><div class="card-body">
    <div class="ws-small" style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:8px;"><span>Quote to bind: <strong>${st.quoteToBindPct === null ? "n/a" : st.quoteToBindPct + "%"}</strong> (${st.bound} of ${st.quoted})</span><span>Lost to competitors: <strong>${st.lostCount}</strong>${st.avgPriceGapPct !== null ? ", our price was on average <strong>" + (st.avgPriceGapPct > 0 ? "+" : "") + st.avgPriceGapPct + "%</strong> against theirs (" + st.lostWithPrice + " with a price)" : ""}</span><span>Declination notices owed: <strong class="${st.noticesOverdue ? "text-danger" : ""}">${st.noticesOwed}</strong>${st.noticesOverdue ? " (" + st.noticesOverdue + " overdue)" : ""}</span></div>
    <div style="margin-bottom:8px;">${typeRows || '<span class="text-muted ws-small">No outcome recorded yet.</span>'}</div>
    ${rows.length ? `${canReopen ? '<input id="out_reopen_reason" class="form-control form-control-sm" style="width:320px;margin-bottom:4px;" placeholder="Reason to reopen (at least 10 characters)">' : ""}<table class="data-table"><thead><tr><th>Submission</th><th>Outcome</th><th>Reason</th><th>Competitor and price</th><th>Decided</th><th>Notice</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x => { const o = x.o, ns = outNoticeState(x.s, o); return `<tr><td><code>${outEsc(x.s.id)}</code><div class="text-xs text-muted">${outEsc(x.s.insured || "")}</div></td><td>${outEsc(OUT_TYPES[o.type].label)}${o.ruleRunId ? `<div class="text-xs text-muted">rule run ${outEsc(o.ruleRunId)}</div>` : ""}${o.quoteVersionId ? `<div class="text-xs text-muted">quote ${outEsc(o.quoteVersionId)}</div>` : ""}</td><td class="ws-small"><strong>${outEsc(o.reasonLabel)}</strong><div class="text-xs text-muted">${outEsc(o.reasonText)}</div></td><td class="ws-small">${o.competitorName ? outEsc(o.competitorName) + (o.competitorPremium !== null ? ", $" + o.competitorPremium.toLocaleString("en-US") + (o.ourPremium ? " (ours $" + Math.round(o.ourPremium).toLocaleString("en-US") + ")" : "") : ", price not known") : "-"}</td><td class="ws-small">${outEsc(o.decidedBy)}<div class="text-xs text-muted">${outEsc(o.decidedAt)}</div></td><td>${ns.state === "not_required" ? '<span class="text-muted ws-small">Not required</span>' : ns.state === "issued" ? '<span class="badge badge-success">Issued</span>' : `<span class="badge ${ns.overdue ? "badge-danger" : "badge-warning"}">Owed${ns.overdue ? ", overdue" : ""}</span>`}</td><td><span class="badge ${o.status === "current" ? "badge-info" : "badge-light"}">${outEsc(o.status)}</span>${o.status === "reopened" ? `<div class="text-xs text-muted">${outEsc(o.reopenedBy)}: ${outEsc(o.reopenReason)}${o.reopenedSubmissionId ? ", now " + outEsc(o.reopenedSubmissionId) : ""}</div>` : ""}</td><td>${o.status === "current" && canReopen ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="outUiReopen('${outEsc(x.s.id)}', false)">Reopen</button> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="outUiReopen('${outEsc(x.s.id)}', true)">Reopen as new</button>` : ""}</td></tr>`; }).join("")}</tbody></table>` : ""}
    ${canRecord ? `<details style="margin-top:8px;"><summary class="ws-small">Record an outcome that is not a decline</summary><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;" class="ws-small"><select id="out_sub" class="form-control form-control-sm" style="width:auto;max-width:260px;"><option value="">Submission</option>${subOpts}</select><select id="out_type" class="form-control form-control-sm" style="width:auto;" onchange="outUiType()"><option value="">Outcome</option>${typeOpts}</select><select id="out_reason" class="form-control form-control-sm" style="width:auto;max-width:300px;"><option value="">Reason</option>${reasonOpts}</select>${OUT_UI.type === "lost_to_competitor" ? '<input id="out_comp" class="form-control form-control-sm" style="width:170px;" placeholder="Competitor"><input id="out_comp_prem" type="number" class="form-control form-control-sm" style="width:140px;" placeholder="Their premium">' : ""}<input id="out_text" class="form-control form-control-sm" style="width:300px;" placeholder="Explain (at least 10 characters)"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="outUiRecord()">Record</button></div></details>` : ""}
    <p class="text-xs text-muted" style="margin:8px 0 0;">The reason lists are an internal code set for the company to confirm. A quote is closed as expired after ${OUT_QUOTE_VALID_DAYS} days (a placeholder).</p></div></div>`;
}

(function installOutAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  const m = (label, icon, badge, outcome) => ({ label: label, icon: icon, badge: badge, outcome: outcome });
  AUDIT_ACTION_META.outcome_recorded = m("Outcome Recorded", "ph-flag-checkered", "badge-light", "outcome-comm");
  AUDIT_ACTION_META.outcome_reopened = m("Outcome Reopened", "ph-arrow-counter-clockwise", "badge-warning", "outcome-refer");
  AUDIT_ACTION_META.outcome_reopened_as_new = m("Reopened as a New Submission", "ph-copy", "badge-warning", "outcome-refer");
})();

Object.assign(window, { outReasons, outReason, outValidate, outRecord, outCurrent, outNoticeState, outReopen, outSweepExpired, outStats, outFromExit, renderDeclineOutcomes, outUiType, outUiRecord, outUiReopen });
