/**
 * ============================================================================
 * UNDERWRITING DECISION ENGINE: RULE SEVERITY AND RUNS, OVERRIDE RECORDS,
 * STRUCTURED ASSESSMENT, AUTHORITY LEVEL PER PERSON
 * ----------------------------------------------------------------------------
 * Four things the underwriting side of the prototype did not have as records:
 *
 *   1. RULE SEVERITY AND RUNS. An appetite rule already had a type (Knockout,
 *      Referral, Eligibility, Standard) but a failure only turned a badge red.
 *      Now each rule has a severity (knockout, major, minor, info) and an
 *      outcome on failure (decline, refer, warn). Each evaluation is kept as a
 *      run with its counts and outcome: proceed, refer or auto-declined. A
 *      knockout recommends the decline (the person records it; nothing is
 *      declined silently). Three warnings together go to referral.
 *   2. OVERRIDES AS RECORDS. Overriding an appetite rule or the risk score now
 *      needs a written reason, a knockout needs a Senior Underwriter or above,
 *      and each override is a record (who, role, when, old value, new value,
 *      reason) that can be revoked and stays in the history.
 *   3. STRUCTURED ASSESSMENT. Six weighted dimensions (management, maintenance,
 *      driver controls, safety technology, loss experience, finances), each
 *      scored 1 to 5 with a comment, giving an overall score and a grade A to E
 *      beside the risk score. Some scores are suggested from what was read
 *      (MVRs, loss runs, vehicle ages); the underwriter confirms them.
 *   4. AUTHORITY LEVEL PER PERSON. The premium and limit ceilings by line and
 *      state stay in authority.js. A level adds what they did not hold: which
 *      transactions the person may handle (new, renewal, endorsement,
 *      cancellation), the largest debit and credit they may apply, whether they
 *      may bind, and the dates it applies. A level may be narrowed to a line,
 *      states, a product and a program. The most specific level wins and two
 *      levels may not overlap. Levels are changed as a proposal that cites the
 *      authority letter, and a different person approves it (never your own).
 *
 * The levels shipped here are ILLUSTRATIVE PLACEHOLDERS, marked as such on
 * screen until a proposal citing an authority letter is approved.
 * ============================================================================
 */

const UW_WARNINGS_BEFORE_REFER = 3;
const UW_SEVERITY = {
  knockout: { label: "Knockout", rank: 3, badge: "badge-danger", onFail: "decline" },
  major: { label: "Major", rank: 2, badge: "badge-warning", onFail: "refer" },
  minor: { label: "Minor", rank: 1, badge: "badge-light", onFail: "warn" },
  info: { label: "Info", rank: 0, badge: "badge-light", onFail: "warn" }
};
const UW_OVERRIDE_MIN_REASON = 10;

function uwEsc(s) { return typeof authEsc === "function" ? authEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function uwNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function uwToday() { return new Date().toISOString().slice(0, 10); }
function uwActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function uwRoleIndex(role) { return typeof AUTH_ROLE_ORDER !== "undefined" ? AUTH_ROLE_ORDER.indexOf(role) : -1; }
function uwActive() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }
function uwSave() { if (typeof persistAppState === "function") persistAppState(); }
function uwLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 5, decision: decision, by: uwActor(), at: uwNow(), notes: notes });
}

// ----------------------------------------------------------------------------
// 1. RULE SEVERITY AND EVALUATION RUNS
// ----------------------------------------------------------------------------
/** knockout, major, minor or info. A rule may state it (r.severity); otherwise it follows from the rule's type. */
function uwRuleSeverity(r) {
  if (r.severity && UW_SEVERITY[r.severity]) return r.severity;
  if (r.canOverride === false || r.ruleType === "Knockout") return "knockout";
  if (r.ruleType === "Referral" || r.ruleType === "Eligibility") return "major";
  if (r.ruleType === "Standard") return "minor";
  return "major";
}
/** decline, refer or warn: what a failure of this rule leads to. */
function uwRuleOutcome(r) { return r.outcomeOnFail || UW_SEVERITY[uwRuleSeverity(r)].onFail; }

function uwStageFor(sub) {
  const s = sub.currentStep || 1;
  return s <= CONFIRM_STEP ? "triage" : s <= BRIEF_STEP ? "quote" : "bind";
}

/** Evaluates the case's rules now. Pure: reads the case, writes nothing. */
function uwEvaluateRules(sub, stage) {
  const results = [];
  let pass = 0, overridden = 0, warning = 0, refer = 0, knockout = 0;
  (sub.appetiteRules || []).forEach(r => {
    if (r.pass !== true && r.pass !== false) return;
    const sev = uwRuleSeverity(r), onFail = uwRuleOutcome(r);
    let result = "pass";
    if (r.manualPassOverride) { result = "overridden"; overridden++; }   // r.overridden means the base value was edited; pass already reflects it
    else if (r.pass === false) {
      result = "fail";
      if (onFail === "decline") knockout++; else if (onFail === "refer") refer++; else warning++;
    } else pass++;
    results.push({ ruleId: r.ruleId || r.id || r.code || "", factor: r.factor || r.name || r.desc || "", severity: sev, onFail: onFail, result: result, val: r.val, required: r.guardrail || r.threshold || r.baseValue || "", baseEdited: !!r.overridden });
  });
  let outcome = "proceed";
  if (knockout > 0) outcome = "auto_declined";
  else if (refer > 0 || warning >= UW_WARNINGS_BEFORE_REFER) outcome = "refer";
  return { stage: stage || uwStageFor(sub), baseEditedCount: results.filter(x => x.baseEdited).length, passCount: pass, overriddenCount: overridden, warningCount: warning, referCount: refer, knockoutCount: knockout, outcome: outcome, results: results };
}

/** Evaluates and keeps the run, unless nothing changed since the last one. Returns the run. */
function uwRunRules(sub, stage) {
  const ev = uwEvaluateRules(sub, stage);
  const sig = ev.stage + "|" + ev.outcome + "|" + ev.results.map(r => r.ruleId + ":" + r.result + (r.baseEdited ? "*" : "")).join(",");
  if (!sub.ruleRuns) sub.ruleRuns = [];
  const last = sub.ruleRuns[sub.ruleRuns.length - 1];
  if (last && last.sig === sig) return last;
  const run = Object.assign({ runId: "RUN-" + (sub.ruleRuns.length + 1), sig: sig, at: uwNow(), by: uwActor() }, ev);
  sub.ruleRuns.push(run);
  if (sub.ruleRuns.length > 20) sub.ruleRuns = sub.ruleRuns.slice(-20);
  uwSave();
  return run;
}

function uwRuleAction(onFail) { return { decline: "Recommend decline", refer: "Refer to an approver", warn: "Warning" }[onFail] || onFail; }

function renderRuleRun(sub) {
  const box = document.getElementById("ruleRunContainer");
  if (!box) return;
  if (!sub || !(sub.appetiteRules || []).length) { box.innerHTML = ""; return; }
  const run = uwRunRules(sub);
  const tone = { proceed: ["badge-success", "Proceed"], refer: ["badge-warning", "Refer"], auto_declined: ["badge-danger", "Knockout: decline"] }[run.outcome];
  const failed = run.results.filter(r => r.result === "fail");
  const why = run.outcome === "auto_declined" ? "A knockout rule failed. The decline is recommended; it is recorded when a person confirms it."
    : run.outcome === "refer" ? (run.referCount ? run.referCount + " major rule(s) failed, so the case goes to an approver." : run.warningCount + " warnings together reach the limit of " + UW_WARNINGS_BEFORE_REFER + ", so the case goes to an approver.")
      : failed.length ? "Only warnings (" + run.warningCount + "), fewer than " + UW_WARNINGS_BEFORE_REFER + "." : "Every rule passed or was overridden with a recorded reason.";
  const canDecline = run.outcome === "auto_declined" && sub.lifecycleStatus !== "declined";
  box.innerHTML = `
  <div class="card" style="margin-top:12px;">
    <div class="card-header"><h3><i class="ph ph-list-checks"></i> Rule evaluation</h3><span class="badge ${tone[0]}">${tone[1]}</span></div>
    <div class="card-body">
      <div class="ws-small" style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px;">
        <span><strong>${run.passCount}</strong> passed</span><span><strong>${run.overriddenCount}</strong> overridden</span>
        <span><strong>${run.warningCount}</strong> warning(s)</span><span><strong>${run.referCount}</strong> major</span><span><strong>${run.knockoutCount}</strong> knockout</span>${run.baseEditedCount ? `<span class="text-muted">${run.baseEditedCount} rule(s) with an edited threshold, judged against the edited value</span>` : ""}
        <span class="text-muted">${uwEsc(run.runId)} at the ${uwEsc(run.stage)} stage, ${uwEsc(run.at)}</span>
      </div>
      <p class="ws-small" style="margin:0 0 8px;">${uwEsc(why)}</p>
      ${failed.length ? `<table class="data-table"><thead><tr><th>Rule</th><th>Severity</th><th>Submitted</th><th>Required</th><th>What happens</th></tr></thead><tbody>${failed.map(r => `<tr><td>${uwEsc(r.factor)}</td><td><span class="badge ${UW_SEVERITY[r.severity].badge}">${UW_SEVERITY[r.severity].label}</span></td><td>${uwEsc(r.val)}</td><td>${uwEsc(r.required)}${r.baseEdited ? '<div class="text-xs text-muted">threshold edited by the MGA</div>' : ""}</td><td>${uwRuleAction(r.onFail)}</td></tr>`).join("")}</tbody></table>` : ""}
      ${canDecline ? `<div style="margin-top:8px;"><button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="triggerAppetiteFailureExit()"><i class="ph ph-prohibit"></i> Record the decline</button></div>` : ""}
      ${uwOverrideListHtml(sub)}
    </div>
  </div>`;
}

// ----------------------------------------------------------------------------
// 2. OVERRIDES AS RECORDS
// ----------------------------------------------------------------------------
/** The lowest role that may override a rule of this severity, or null when any permitted role may. */
function uwOverrideRoleNeeded(sev) { return sev === "knockout" ? "senior_uw" : null; }

function uwRecordOverride(sub, rec) {
  if (!sub.uwOverrides) sub.uwOverrides = [];
  rec.id = "OVR-" + (sub.uwOverrides.length + 1);
  rec.by = uwActor(); rec.byRole = currentUserRole; rec.at = uwNow(); rec.status = "active";
  sub.uwOverrides.push(rec);
  uwLog(sub, "uw_override_applied", "Override " + rec.id + " on " + rec.label + ": " + rec.oldValue + " to " + rec.newValue + ". Reason: " + rec.reason);
  if (rec.severity === "knockout" && typeof notify === "function") {
    notify("admin", { kind: "info", title: "Knockout rule overridden: " + (sub.insured || sub.id), text: rec.label + " was overridden by " + rec.by + ". Reason: " + rec.reason, caseId: sub.id, key: "ovr-" + sub.id + "-" + rec.id });
  }
  uwSave();
  return rec;
}
function uwRevokeRecords(sub, targetType, targetId) {
  (sub.uwOverrides || []).forEach(o => {
    if (o.targetType === targetType && o.targetId === targetId && o.status === "active") {
      o.status = "revoked"; o.revokedAt = uwNow(); o.revokedBy = uwActor();
      uwLog(sub, "uw_override_revoked", "Override " + o.id + " on " + o.label + " was revoked.");
    }
  });
  uwSave();
}

var _uwOrigToggleRule = window.toggleAppetiteRuleOverride;

/** Applies an override on a failed appetite rule. Needs the permission, a written reason and, for a knockout, a Senior Underwriter or above. */
function uwApplyRuleOverride(sub, ruleId, reason) {
  if (!hasPermission("appetiteRules", "override")) { denyPermission("appetiteRules", "override"); return { ok: false, error: "permission" }; }
  const rule = (sub.appetiteRules || []).find(r => r.ruleId === ruleId);
  if (!rule) return { ok: false, error: "rule" };
  if (rule.manualPassOverride) return { ok: false, error: "already" };
  reason = String(reason == null ? "" : reason).trim();
  if (reason.length < UW_OVERRIDE_MIN_REASON) return { ok: false, error: "reason" };
  const sev = uwRuleSeverity(rule), need = uwOverrideRoleNeeded(sev);
  if (need && uwRoleIndex(currentUserRole) < uwRoleIndex(need)) return { ok: false, error: "authority", needRole: need };
  const prevConfirm = window.confirm, prevActive = activeSubmissionId;
  window.confirm = function () { return true; };
  activeSubmissionId = sub.id;
  try { _uwOrigToggleRule(ruleId); } finally { window.confirm = prevConfirm; activeSubmissionId = prevActive; }
  if (!rule.manualPassOverride) return { ok: false, error: "not_applied" };
  const rec = uwRecordOverride(sub, { targetType: "appetite_rule", targetId: ruleId, label: (rule.factor || ruleId) + " (" + ruleId + ")", severity: sev, oldValue: "Fail (" + rule.val + ")", newValue: "Overridden to pass", reason: reason });
  uwRunRules(sub);
  renderRuleRun(sub);
  return { ok: true, record: rec };
}
function uwRevokeRuleOverride(sub, ruleId) {
  const rule = (sub.appetiteRules || []).find(r => r.ruleId === ruleId);
  if (!rule || !rule.manualPassOverride) return { ok: false, error: "none" };
  const prevActive = activeSubmissionId; activeSubmissionId = sub.id;
  try { _uwOrigToggleRule(ruleId); } finally { activeSubmissionId = prevActive; }
  uwRevokeRecords(sub, "appetite_rule", ruleId);
  uwRunRules(sub); renderRuleRun(sub);
  return { ok: true };
}

window.toggleAppetiteRuleOverride = function (ruleId) {
  const sub = uwActive();
  if (!sub || !sub.appetiteRules) return;
  const rule = sub.appetiteRules.find(r => r.ruleId === ruleId);
  if (!rule) return;
  if (!hasPermission("appetiteRules", "override")) { denyPermission("appetiteRules", "override"); return; }
  if (rule.manualPassOverride) { uwRevokeRuleOverride(sub, ruleId); return; }
  const sev = uwRuleSeverity(rule);
  const reason = window.prompt("Override " + (rule.factor || ruleId) + " (" + UW_SEVERITY[sev].label + ").\n\nWhy should this failed rule be treated as passed? (at least " + UW_OVERRIDE_MIN_REASON + " characters; recorded with your name)", "");
  if (reason === null) return;
  const res = uwApplyRuleOverride(sub, ruleId, reason);
  if (res.ok) return;
  if (res.error === "reason") showToast("A written reason of at least " + UW_OVERRIDE_MIN_REASON + " characters is required to override a rule.", "warning");
  else if (res.error === "authority") {
    uwLog(sub, "uw_override_blocked", "Override of " + (rule.factor || ruleId) + " refused: a knockout needs " + authRoleLabel(res.needRole) + " or above.");
    showToast("A knockout rule can be overridden only by " + authRoleLabel(res.needRole) + " or above.", "danger");
  }
};

// The risk score: a changed score needs a reason and is kept as a record.
var _uwOrigRenderRisk = window.renderRiskScoreCard;
window.renderRiskScoreCard = function (sub) {
  const r = _uwOrigRenderRisk.apply(this, arguments);
  try {
    const box = document.getElementById("wbRiskScoreContainer"), row = box && box.querySelector(".risk-score-edit-row");
    if (row && sub && !document.getElementById("riskScoreReason")) {
      const d = document.createElement("div"); d.className = "risk-score-edit-row"; d.style.marginTop = "6px";
      d.innerHTML = `<label class="form-label" style="margin:0;">Reason:</label><input type="text" id="riskScoreReason" class="form-control form-control-sm" style="max-width:420px;" placeholder="Required when the score differs from the calculated one" value="${uwEsc(sub.riskScoreReason || "")}">`;
      row.parentNode.insertBefore(d, row.nextSibling);
    }
  } catch (e) { /* the card still works without the reason box */ }
  return r;
};
var _uwOrigSaveRisk = window.saveRiskScoreOverride;
window.saveRiskScoreOverride = function (subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId), input = document.getElementById("riskScoreOverrideInput");
  if (!sub || !input) return _uwOrigSaveRisk.apply(this, arguments);
  const val = Math.max(0, Math.min(100, parseInt(input.value, 10)));
  const auto = calculateRiskScore(sub).score;
  if (isNaN(val) || val === auto) { const r = _uwOrigSaveRisk.apply(this, arguments); uwRevokeRecords(sub, "risk_score", "score"); return r; }
  const rEl = document.getElementById("riskScoreReason"), reason = rEl ? rEl.value.trim() : "";
  if (reason.length < UW_OVERRIDE_MIN_REASON) { showToast("Say why the score differs from the calculated " + auto + " (at least " + UW_OVERRIDE_MIN_REASON + " characters).", "warning"); return; }
  if (Math.abs(val - auto) > 20 && uwRoleIndex(currentUserRole) < uwRoleIndex("senior_uw")) {
    uwLog(sub, "uw_override_blocked", "Risk score change from " + auto + " to " + val + " refused: more than 20 points needs " + authRoleLabel("senior_uw") + " or above.");
    showToast("Moving the score more than 20 points needs " + authRoleLabel("senior_uw") + " or above.", "danger"); return;
  }
  const r = _uwOrigSaveRisk.apply(this, arguments);
  if (sub.riskScoreOverridden) {
    uwRevokeRecords(sub, "risk_score", "score");
    sub.riskScoreReason = reason;
    uwRecordOverride(sub, { targetType: "risk_score", targetId: "score", label: "Risk score", severity: "major", oldValue: String(auto), newValue: String(val), reason: reason });
  }
  return r;
};
var _uwOrigResetRisk = window.resetRiskScoreToAuto;
window.resetRiskScoreToAuto = function (subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  const r = _uwOrigResetRisk.apply(this, arguments);
  if (sub) { uwRevokeRecords(sub, "risk_score", "score"); sub.riskScoreReason = ""; }
  return r;
};

function uwOverrideListHtml(sub) {
  const list = sub.uwOverrides || [];
  if (!list.length) return "";
  return `<div class="uwp-subsection-title" style="margin-top:12px;">Overrides on this case</div>
  <table class="data-table"><thead><tr><th>Record</th><th>What</th><th>Change</th><th>Reason</th><th>By</th><th>Status</th></tr></thead><tbody>${list.slice().reverse().map(o => `<tr><td>${uwEsc(o.id)}</td><td>${uwEsc(o.label)}</td><td>${uwEsc(o.oldValue)} &rarr; ${uwEsc(o.newValue)}</td><td>${uwEsc(o.reason)}</td><td>${uwEsc(o.by)}<div class="text-xs text-muted">${uwEsc(o.at)}</div></td><td>${o.status === "active" ? '<span class="badge badge-warning">Active</span>' : '<span class="badge badge-light">Revoked ' + uwEsc(o.revokedAt) + '</span>'}</td></tr>`).join("")}</tbody></table>`;
}

var _uwOrigRenderRules = window.renderAppetiteRules;
window.renderAppetiteRules = function (rules) {
  const r = _uwOrigRenderRules.apply(this, arguments);
  try { const s = uwActive(); if (s && s.appetiteRules === rules) renderRuleRun(s); } catch (e) { console.warn("Rule run card failed:", e); }
  return r;
};

// ----------------------------------------------------------------------------
// 3. STRUCTURED ASSESSMENT
// ----------------------------------------------------------------------------
const UW_FRAMEWORK = {
  id: "FW-UW-1", version: 1, name: "Underwriting assessment",
  dimensions: [
    { code: "MGMT", name: "Management and experience", weight: 20, hint: "Years in business, depth of management, operating history" },
    { code: "MAINT", name: "Maintenance and inspections", weight: 20, hint: "Age of equipment, inspection record, out-of-service rate" },
    { code: "DRIVER", name: "Driver controls", weight: 20, hint: "MVR results, hiring criteria, training, turnover" },
    { code: "SAFETY", name: "Safety technology and programme", weight: 15, hint: "Telematics, cameras, ELD, a written safety programme" },
    { code: "LOSS", name: "Loss experience", weight: 15, hint: "Frequency and size of claims over the last three years" },
    { code: "FIN", name: "Financial stability", weight: 10, hint: "Financial statements, credit, payment history" }
  ]
};
const UW_SCORE_LABELS = { 1: "Poor", 2: "Weak", 3: "Acceptable", 4: "Good", 5: "Strong" };

/** Grade A to E from the weighted score (1 to 5, 5 best). */
function uwGradeFor(overall) { return overall >= 4.5 ? "A" : overall >= 3.75 ? "B" : overall >= 3 ? "C" : overall >= 2.25 ? "D" : "E"; }

/** Weighted overall from the dimension scores. Dimensions without a score do not count; `complete` says whether all were scored. */
function uwAssessmentScore(responses) {
  let sum = 0, w = 0, scored = 0;
  UW_FRAMEWORK.dimensions.forEach(d => {
    const r = responses && responses[d.code], s = r ? Number(r.score) : NaN;
    if (s >= 1 && s <= 5) { sum += s * d.weight; w += d.weight; scored++; }
  });
  const overall = w ? Math.round(sum / w * 100) / 100 : null;
  return { overall: overall, grade: overall === null ? null : uwGradeFor(overall), scored: scored, complete: scored === UW_FRAMEWORK.dimensions.length };
}

/** Scores suggested from what was read: { CODE: { score, basis } }. The underwriter confirms or changes each one. */
function uwAssessmentSuggest(sub) {
  const out = {};
  try {
    if (sub.mvrData && typeof mvrAnalyze === "function") {
      mvrAnalyze(sub);
      const ds = sub.mvrData.drivers || [], hi = ds.filter(d => d.band === "High").length;
      const med = ds.filter(d => d.band === "Medium").length, n = ds.length;
      if (n) out.DRIVER = { score: hi > 1 ? 1 : hi === 1 ? 2 : med ? 3 : 5, basis: n + " MVR(s): " + hi + " high risk, " + med + " medium" };
    }
  } catch (e) { /* no MVR analysis */ }
  try {
    if (typeof analyzeLossRuns === "function") {
      const la = analyzeLossRuns(sub);
      if (!la.noRows) {
        const warns = la.flags.filter(f => f.level === "warn").length;
        out.LOSS = { score: la.claims === 0 ? 5 : warns >= 2 ? 2 : warns === 1 ? 3 : la.claims <= 2 ? 4 : 3, basis: la.claims + " claim(s) in the last three policy years" + (warns ? ", " + warns + " warning(s)" : "") };
      }
    }
  } catch (e) { /* no loss analysis */ }
  try {
    const years = (sub.vehicles || []).map(v => Number(v.year || v.modelYear || v.model_year)).filter(y => y > 1980);
    if (years.length) {
      const now = new Date().getFullYear(), avg = years.reduce((a, y) => a + (now - y), 0) / years.length;
      out.MAINT = { score: avg <= 4 ? 5 : avg <= 7 ? 4 : avg <= 11 ? 3 : avg <= 15 ? 2 : 1, basis: "Average vehicle age " + avg.toFixed(1) + " years across " + years.length + " unit(s)" };
    }
  } catch (e) { /* no vehicle schedule */ }
  return out;
}

function uwAssessmentSeed(sub) {
  if (!sub.uwAssessment) sub.uwAssessment = { frameworkId: UW_FRAMEWORK.id, version: UW_FRAMEWORK.version, status: "draft", responses: {} };
  return sub.uwAssessment;
}

/** Saves one dimension. Returns { ok } or { ok:false, error }. */
function uwAssessmentSet(sub, code, score, comment) {
  const a = uwAssessmentSeed(sub);
  if (a.status === "final") return { ok: false, error: "final" };
  if (!UW_FRAMEWORK.dimensions.some(d => d.code === code)) return { ok: false, error: "dimension" };
  score = Number(score);
  if (!(score >= 1 && score <= 5) || Math.round(score) !== score) return { ok: false, error: "score" };
  const sug = uwAssessmentSuggest(sub)[code];
  a.responses[code] = { score: score, comment: String(comment || "").trim(), suggested: sug ? sug.score : null, basis: sug ? sug.basis : "" };
  uwSave();
  return { ok: true };
}

/** Finalises: every dimension scored, and a comment on every score of 2 or less. */
function uwAssessmentFinalise(sub) {
  if (!hasPermission("authority", "edit")) { denyPermission("authority", "edit"); return { ok: false, error: "permission" }; }
  const a = uwAssessmentSeed(sub), sc = uwAssessmentScore(a.responses);
  if (!sc.complete) return { ok: false, error: "incomplete", missing: UW_FRAMEWORK.dimensions.filter(d => !(a.responses[d.code] && a.responses[d.code].score)).map(d => d.name) };
  const bare = UW_FRAMEWORK.dimensions.filter(d => a.responses[d.code].score <= 2 && !a.responses[d.code].comment);
  if (bare.length) return { ok: false, error: "comment", missing: bare.map(d => d.name) };
  a.overall = sc.overall; a.grade = sc.grade; a.status = "final"; a.assessedBy = uwActor(); a.assessedByRole = currentUserRole; a.assessedAt = uwNow();
  uwLog(sub, "uw_assessment_final", "Assessment finalised: " + sc.overall.toFixed(2) + " / 5, grade " + sc.grade + ".");
  uwSave();
  return { ok: true, overall: sc.overall, grade: sc.grade };
}
function uwAssessmentReopen(sub) {
  const a = uwAssessmentSeed(sub);
  if (a.status !== "final") return { ok: false };
  if (uwRoleIndex(currentUserRole) < uwRoleIndex("senior_uw")) return { ok: false, error: "authority" };
  a.status = "draft"; a.reopenedBy = uwActor(); a.reopenedAt = uwNow();
  uwLog(sub, "uw_assessment_reopened", "Assessment reopened for changes.");
  uwSave();
  return { ok: true };
}

function uwAssessSave(subId, code) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return;
  const s = document.getElementById("uwa_s_" + code), c = document.getElementById("uwa_c_" + code);
  if (!s || !s.value) { showToast("Pick a score from 1 to 5.", "warning"); return; }
  const r = uwAssessmentSet(sub, code, s.value, c ? c.value : "");
  if (!r.ok) showToast(r.error === "final" ? "The assessment is final. Reopen it to change a score." : "That score could not be saved.", "warning");
  renderUwAssessment(sub);
}
function uwAssessUseSuggestion(subId, code) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId), sug = sub && uwAssessmentSuggest(sub)[code]; if (!sug) return;
  const c = document.getElementById("uwa_c_" + code);
  uwAssessmentSet(sub, code, sug.score, (c && c.value) || sug.basis);
  renderUwAssessment(sub);
}
function uwAssessFinalise(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return;
  const r = uwAssessmentFinalise(sub);
  if (r.ok) showToast("Assessment finalised: grade " + r.grade + " (" + r.overall.toFixed(2) + " / 5).", "success");
  else if (r.error === "incomplete") showToast("Score every dimension first. Missing: " + r.missing.join(", ") + ".", "warning");
  else if (r.error === "comment") showToast("A score of 2 or less needs a comment. Missing: " + r.missing.join(", ") + ".", "warning");
  renderUwAssessment(sub);
}
function uwAssessReopen(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return;
  const r = uwAssessmentReopen(sub);
  if (!r.ok) showToast("Only " + authRoleLabel("senior_uw") + " or above can reopen a final assessment.", "danger");
  renderUwAssessment(sub);
}

function renderUwAssessment(sub) {
  const box = document.getElementById("uwAssessmentContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const a = uwAssessmentSeed(sub), sc = uwAssessmentScore(a.responses), sug = uwAssessmentSuggest(sub);
  const final = a.status === "final", canEdit = hasPermission("authority", "edit") && !final;
  const gradeTone = { A: "badge-success", B: "badge-success", C: "badge-warning", D: "badge-danger", E: "badge-danger" }[sc.grade] || "badge-light";
  const rows = UW_FRAMEWORK.dimensions.map(d => {
    const r = a.responses[d.code] || {}, s = sug[d.code];
    return `<tr>
      <td><strong>${uwEsc(d.name)}</strong><div class="text-xs text-muted">${uwEsc(d.hint)}</div></td>
      <td>${d.weight}%</td>
      <td>${canEdit ? `<select id="uwa_s_${d.code}" class="form-control form-control-sm" style="width:auto;"><option value="">-</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${Number(r.score) === n ? "selected" : ""}>${n} ${UW_SCORE_LABELS[n]}</option>`).join("")}</select>` : (r.score ? r.score + " " + UW_SCORE_LABELS[r.score] : "-")}
        ${s ? `<div class="text-xs text-muted">Suggested ${s.score}: ${uwEsc(s.basis)}${canEdit ? ` <a href="#" onclick="uwAssessUseSuggestion('${sub.id}','${d.code}');return false;">use</a>` : ""}</div>` : ""}</td>
      <td>${canEdit ? `<input type="text" id="uwa_c_${d.code}" class="form-control form-control-sm" value="${uwEsc(r.comment || "")}" placeholder="Evidence or comment" onchange="uwAssessSave('${sub.id}','${d.code}')">` : uwEsc(r.comment || "")}</td>
      <td>${canEdit ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="uwAssessSave('${sub.id}','${d.code}')">Save</button>` : ""}</td>
    </tr>`;
  }).join("");
  box.innerHTML = `
  <div class="card" style="margin-bottom:12px;">
    <div class="card-header"><h3><i class="ph ph-clipboard-text"></i> Underwriting assessment</h3>
      <span class="badge ${final ? gradeTone : "badge-light"}">${sc.grade ? "Grade " + sc.grade + " (" + sc.overall.toFixed(2) + " / 5)" : "Not scored"}${final ? "" : " (draft)"}</span></div>
    <div class="card-body">
      <p class="ws-small text-muted" style="margin:0 0 8px;">Six weighted dimensions, each scored 1 (poor) to 5 (strong). Beside the risk score, which is the calculated figure; this is the underwriter's own judgment with the evidence.</p>
      <table class="data-table"><thead><tr><th>Dimension</th><th>Weight</th><th>Score</th><th>Comment</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${final ? `<span class="ws-small text-muted">Finalised by ${uwEsc(a.assessedBy)} on ${uwEsc(a.assessedAt)}.</span><button class="btn btn-sm btn-outline" style="width:auto;" onclick="uwAssessReopen('${sub.id}')">Reopen</button>`
      : (canEdit ? `<button class="btn btn-sm btn-primary" style="width:auto;" onclick="uwAssessFinalise('${sub.id}')">Finalise assessment</button><span class="ws-small text-muted">${sc.scored} of ${UW_FRAMEWORK.dimensions.length} scored${sc.grade ? ", running grade " + sc.grade : ""}.</span>` : '<span class="ws-small text-muted">You can read the assessment; scoring needs the authority edit permission.</span>')}
      </div>
    </div>
  </div>`;
}
registerStepRenderer("uwAssessment", renderUwAssessment);

// ----------------------------------------------------------------------------
// 4. AUTHORITY LEVEL PER PERSON
// ----------------------------------------------------------------------------
function uwDefaultLevels() {
  const L = (id, role, txn, cr, de, bind, note) => ({ id: id, role: role, lob: "*", states: "*", product: "*", program: "*", txn: txn, maxCreditPct: cr, maxDebitPct: de, canBind: bind, from: "2026-01-01", to: null, note: note, source: "placeholder" });
  return [
    L("LV-JR-NEW", "junior", ["new", "renew"], 5, 10, true, "New business and renewals"),
    L("LV-JR-END", "junior", ["endorse"], 5, 5, true, "Endorsements"),
    L("LV-JR-CAN", "junior", ["cancel", "reinstate"], 0, 0, false, "Cancellations and reinstatements are not handled at this level"),
    L("LV-SU-ALL", "senior_uw", "*", 10, 20, true, "All transactions"),
    L("LV-CUO-ALL", "senior", "*", 15, 25, true, "All transactions, up to the filed limit"),
    L("LV-AS-ALL", "assistant", "*", 0, 0, false, "Prepares work; cannot bind or adjust price")
  ];
}
// Each role is one named person in the prototype, so a level on a role is a level on that person. The ceilings on
// premium and policy limit by line and state are in AUTH_RULES (authority.js); this adds transaction scope, the
// debit and credit allowed, the right to bind, and the dates. "*" means all. The most specific matching level wins.
var UW_AUTHORITY_LEVELS = uwDefaultLevels();
var UW_LEVELS_META = { source: "placeholder", letterRef: null, approvedBy: null, approvedAt: null };
var UW_LEVELS_PENDING = null;
var UW_LEVELS_HISTORY = [];
const UW_LEVELS_KEY = "FUT_UW_LEVELS_V1";
const UW_TXN_LABELS = { new: "new business", renew: "renewal", endorse: "endorsement", cancel: "cancellation", reinstate: "reinstatement" };

function uwLevelsSaveStore() { try { localStorage.setItem(UW_LEVELS_KEY, JSON.stringify({ levels: UW_AUTHORITY_LEVELS, meta: UW_LEVELS_META, pending: UW_LEVELS_PENDING, history: UW_LEVELS_HISTORY })); } catch (e) { /* storage unavailable: kept for this session */ } }
function uwLevelsSet(levels) { UW_AUTHORITY_LEVELS.length = 0; levels.forEach(l => UW_AUTHORITY_LEVELS.push(l)); }
(function loadStoredLevels() {
  try {
    const raw = localStorage.getItem(UW_LEVELS_KEY); if (!raw) return;
    const st = JSON.parse(raw);
    if (st && Array.isArray(st.levels) && st.levels.length) { uwLevelsSet(st.levels); UW_LEVELS_META = st.meta || UW_LEVELS_META; UW_LEVELS_PENDING = st.pending || null; UW_LEVELS_HISTORY = Array.isArray(st.history) ? st.history : []; }
  } catch (e) { /* ignore a damaged store */ }
})();
/** Back to the shipped placeholders, and forget what was stored. */
function uwLevelsReset() {
  uwLevelsSet(uwDefaultLevels()); UW_LEVELS_META = { source: "placeholder", letterRef: null, approvedBy: null, approvedAt: null }; UW_LEVELS_PENDING = null; UW_LEVELS_HISTORY = [];
  try { localStorage.removeItem(UW_LEVELS_KEY); } catch (e) { /* nothing stored */ }
}
function uwLevelsArePlaceholder() { return UW_AUTHORITY_LEVELS.some(l => l.source === "placeholder"); }

/** The transaction a case is: new business unless the case says otherwise or is a renewal. */
function uwTxnOf(sub) { return (sub && (sub.transactionType || (sub.renewalOf ? "renew" : "new"))) || "new"; }

function uwTxnMatch(spec, txn) { return spec === "*" || (Array.isArray(spec) && spec.indexOf(txn) > -1); }
function uwTextMatch(spec, v) { return !spec || spec === "*" || String(spec).toLowerCase() === String(v || "").toLowerCase(); }
function uwLevelsFor(role) { return UW_AUTHORITY_LEVELS.filter(l => l.role === role); }

/** The most specific level in force for a role and risk, or null. `m` is what authMeasures returns (line, state, product, program, transaction). */
function uwLevelFor(role, m, today) {
  const t = today || uwToday(), txn = (m && m.txn) || "new";
  let best = null, bestScore = -1;
  uwLevelsFor(role).forEach(l => {
    if (l.lob !== "*" && l.lob !== m.lob) return;
    if (!authStatesMatch(l.states, m.state)) return;
    if (!uwTextMatch(l.product, m.product) || !uwTextMatch(l.program, m.program)) return;
    if (!uwTxnMatch(l.txn, txn)) return;
    if (l.from && l.from > t) return;
    if (l.to && l.to < t) return;
    const score = (l.program && l.program !== "*" ? 16 : 0) + (l.product && l.product !== "*" ? 8 : 0) + (l.lob !== "*" ? 4 : 0) + (l.states !== "*" ? 2 : 0) + (l.txn !== "*" ? 1 : 0);
    if (score > bestScore) { best = l; bestScore = score; }
  });
  return best;
}

/** Whether a role's level lets it act on this risk. A role with no levels at all is not constrained by them. */
function uwLevelCheck(role, m, today) {
  if (!uwLevelsFor(role).length) return { ok: true, level: null, constrained: false, reasons: [] };
  const lv = uwLevelFor(role, m, today);
  const txnName = UW_TXN_LABELS[(m && m.txn) || "new"] || "this transaction";
  if (!lv) return { ok: false, level: null, constrained: true, reasons: [authRoleLabel(role) + " holds no authority level for " + txnName + " on this class, state, product or program."] };
  if (!lv.canBind) return { ok: false, level: lv, constrained: true, reasons: [lv.note + " (" + lv.id + ")."] };
  return { ok: true, level: lv, constrained: true, reasons: [] };
}

/** Pairs of levels for one person with the same scope, an overlapping transaction and overlapping dates. */
function uwLevelOverlaps(levels) {
  levels = levels || UW_AUTHORITY_LEVELS;
  const out = [], key = l => [l.role, l.lob, JSON.stringify(l.states), l.product || "*", l.program || "*"].join("|");
  const txnShare = (a, b) => a === "*" || b === "*" || a.some(x => b.indexOf(x) > -1);
  const dateShare = (a, b) => (!a.to || !b.from || a.to >= b.from) && (!b.to || !a.from || b.to >= a.from);
  for (let i = 0; i < levels.length; i++) for (let j = i + 1; j < levels.length; j++) {
    const a = levels[i], b = levels[j];
    if (key(a) === key(b) && txnShare(a.txn, b.txn) && dateShare(a, b)) out.push([a.id, b.id]);
  }
  return out;
}

/** Everything wrong with a list of levels, as sentences. Empty means it can be proposed. */
function uwLevelsValidate(levels) {
  const errs = [], ids = {}, ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!Array.isArray(levels) || !levels.length) return ["There are no levels."];
  levels.forEach((l, i) => {
    const w = (l && l.id) || "level " + (i + 1);
    if (!l || !l.id) { errs.push("Level " + (i + 1) + " has no id."); return; }
    if (ids[l.id]) errs.push(w + ": the id is used twice.");
    ids[l.id] = true;
    if (typeof USER_ROLES_CONFIG !== "undefined" && !USER_ROLES_CONFIG[l.role]) errs.push(w + ": " + l.role + " is not a person in the user master.");
    if (!(l.txn === "*" || (Array.isArray(l.txn) && l.txn.length && l.txn.every(t => UW_TXN_LABELS[t])))) errs.push(w + ": transactions must be * or a list of new, renew, endorse, cancel, reinstate.");
    ["maxCreditPct", "maxDebitPct"].forEach(k => {
      const v = Number(l[k]);
      if (l[k] === "" || l[k] === null || l[k] === undefined || !(v >= 0) || v > 100) errs.push(w + ": " + (k === "maxCreditPct" ? "credit" : "debit") + " must be a percent from 0 to 100.");
    });
    if (Number(l.maxCreditPct) > DISCRETIONARY_MAX_CREDIT_PCT) errs.push(w + ": credit " + l.maxCreditPct + "% is above the filed limit of " + DISCRETIONARY_MAX_CREDIT_PCT + "%.");
    if (Number(l.maxDebitPct) > DISCRETIONARY_MAX_DEBIT_PCT) errs.push(w + ": debit " + l.maxDebitPct + "% is above the filed limit of " + DISCRETIONARY_MAX_DEBIT_PCT + "%.");
    if (typeof l.canBind !== "boolean") errs.push(w + ": say whether the person may bind.");
    if (!l.from || !ymd.test(l.from)) errs.push(w + ": the start date must be yyyy-mm-dd.");
    if (l.to && !ymd.test(l.to)) errs.push(w + ": the end date must be yyyy-mm-dd or empty.");
    if (l.from && l.to && l.to < l.from) errs.push(w + ": the level ends before it starts.");
    if (!(l.states === "*" || (Array.isArray(l.states) && l.states.length))) errs.push(w + ": states must be * or a list.");
  });
  uwLevelOverlaps(levels).forEach(p => errs.push(p[0] + " and " + p[1] + " overlap (same person and scope, same transaction, same period)."));
  return errs;
}

// ---- changing the levels: a proposal that cites the authority letter, approved by someone else
function uwLevelsActorKey() { return typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole] ? USER_ROLES_CONFIG[currentUserRole].name : String(currentUserRole); }
function uwLevelsHistoryAdd(action, text) { UW_LEVELS_HISTORY.push({ at: uwNow(), by: uwActor(), action: action, text: text }); if (UW_LEVELS_HISTORY.length > 50) UW_LEVELS_HISTORY = UW_LEVELS_HISTORY.slice(-50); }
function uwNormaliseLevel(l) {
  const o = Object.assign({ lob: "*", states: "*", product: "*", program: "*", to: null, note: "" }, l);
  o.maxCreditPct = o.maxCreditPct === "" || o.maxCreditPct === null || o.maxCreditPct === undefined ? o.maxCreditPct : Number(o.maxCreditPct);
  o.maxDebitPct = o.maxDebitPct === "" || o.maxDebitPct === null || o.maxDebitPct === undefined ? o.maxDebitPct : Number(o.maxDebitPct);
  if (o.to === "") o.to = null;
  return o;
}

/** Proposes a whole new list of levels, citing the letter. Needs permission to propose rate and limit changes. Nothing changes until it is approved. */
function uwLevelsPropose(levels, letterRef, note) {
  if (!hasPermission("rateConfig", "edit")) { denyPermission("rateConfig", "edit"); return { ok: false, error: "permission" }; }
  letterRef = String(letterRef || "").trim();
  if (letterRef.length < 3) return { ok: false, error: "letter" };
  const list = (levels || []).map(uwNormaliseLevel), errs = uwLevelsValidate(list);
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  UW_LEVELS_PENDING = { levels: list, letterRef: letterRef, note: String(note || "").trim(), proposedBy: uwActor(), proposedByKey: uwLevelsActorKey(), proposedAt: uwNow() };
  uwLevelsHistoryAdd("proposed", "Proposed " + list.length + " level(s) citing " + letterRef + ".");
  uwLevelsSaveStore();
  return { ok: true };
}
/** Adds a level or replaces the one with the same id, in a proposal built on the levels in force (or on the proposal already open). */
function uwLevelsUpsert(level, letterRef, note) {
  const base = (UW_LEVELS_PENDING ? UW_LEVELS_PENDING.levels : UW_AUTHORITY_LEVELS).map(l => Object.assign({}, l));
  const nl = Object.assign({}, uwNormaliseLevel(level), { source: "letter" });
  const i = base.findIndex(l => l.id === nl.id);
  if (i > -1) base[i] = nl; else base.push(nl);
  return uwLevelsPropose(base, letterRef || (UW_LEVELS_PENDING && UW_LEVELS_PENDING.letterRef), note);
}
function uwLevelsRemove(id, letterRef, note) {
  const base = (UW_LEVELS_PENDING ? UW_LEVELS_PENDING.levels : UW_AUTHORITY_LEVELS).filter(l => l.id !== id).map(l => Object.assign({}, l));
  return uwLevelsPropose(base, letterRef || (UW_LEVELS_PENDING && UW_LEVELS_PENDING.letterRef), note);
}
/** A different person with approval authority puts the proposal into force. Every level in it is then sourced to the letter. */
function uwLevelsApprove() {
  const p = UW_LEVELS_PENDING; if (!p) return { ok: false, error: "none" };
  if (!hasPermission("rateConfig", "approve")) { denyPermission("rateConfig", "approve"); return { ok: false, error: "permission" }; }
  if (p.proposedByKey === uwLevelsActorKey()) return { ok: false, error: "self" };
  const errs = uwLevelsValidate(p.levels); if (errs.length) return { ok: false, error: "invalid", errors: errs };
  uwLevelsSet(p.levels.map(l => Object.assign({}, l, { source: p.letterRef })));
  UW_LEVELS_META = { source: "letter", letterRef: p.letterRef, approvedBy: uwActor(), approvedAt: uwNow() };
  uwLevelsHistoryAdd("approved", "Approved the proposal by " + p.proposedBy + " citing " + p.letterRef + ".");
  UW_LEVELS_PENDING = null; uwLevelsSaveStore();
  return { ok: true };
}
function uwLevelsReject() {
  const p = UW_LEVELS_PENDING; if (!p) return { ok: false, error: "none" };
  const own = p.proposedByKey === uwLevelsActorKey();
  if (!own && !hasPermission("rateConfig", "approve")) { denyPermission("rateConfig", "approve"); return { ok: false, error: "permission" }; }
  uwLevelsHistoryAdd("rejected", "The proposal by " + p.proposedBy + " citing " + p.letterRef + " was " + (own ? "withdrawn" : "rejected") + ".");
  UW_LEVELS_PENDING = null; uwLevelsSaveStore();
  return { ok: true };
}

/** The largest credit and debit (percent) the signed-in person may apply to this case: the filed limit, or less if their level is lower. */
function uwDiscretionaryCaps(sub) {
  const g = { credit: DISCRETIONARY_MAX_CREDIT_PCT, debit: DISCRETIONARY_MAX_DEBIT_PCT };
  if (!sub || !uwLevelsFor(currentUserRole).length) return g;
  const lv = uwLevelFor(currentUserRole, authMeasures(sub));
  if (!lv || !lv.canBind) return { credit: 0, debit: 0, level: lv };
  return { credit: Math.min(g.credit, lv.maxCreditPct), debit: Math.min(g.debit, lv.maxDebitPct), level: lv };
}
function uwWithUserCaps(sub, fn) {
  const c = DISCRETIONARY_MAX_CREDIT_PCT, d = DISCRETIONARY_MAX_DEBIT_PCT, cap = uwDiscretionaryCaps(sub);
  DISCRETIONARY_MAX_CREDIT_PCT = cap.credit; DISCRETIONARY_MAX_DEBIT_PCT = cap.debit;
  try { return fn(); } finally { DISCRETIONARY_MAX_CREDIT_PCT = c; DISCRETIONARY_MAX_DEBIT_PCT = d; }
}

// The transaction travels with the measures, and a level can refuse a role the line and state ceilings would accept.
var _uwOrigMeasures = window.authMeasures;
window.authMeasures = function (sub) { const m = _uwOrigMeasures.apply(this, arguments); m.txn = uwTxnOf(sub); m.product = (sub && (sub.productCode || sub.productName)) || ""; m.program = (sub && sub.program) || ""; return m; };
var _uwOrigCovers = window.authRoleCovers;
window.authRoleCovers = function (role, m) {
  const base = _uwOrigCovers.apply(this, arguments);
  if (!base.ok) return base;
  const lc = uwLevelCheck(role, m);
  if (!lc.ok) return { ok: false, rule: base.rule, reasons: lc.reasons, level: lc.level };
  base.level = lc.level;
  return base;
};

// A person's own credit and debit ceiling applies in the pricing dialog and when it is saved.
var _uwOrigDpOpen = window.openDiscretionaryPricingModal;
window.openDiscretionaryPricingModal = function (subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  return uwWithUserCaps(sub, () => _uwOrigDpOpen.apply(this, arguments));
};
var _uwOrigDpPreview = window.updateDiscretionaryPricingPreview;
window.updateDiscretionaryPricingPreview = function () {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === discretionaryPricingTargetId);
  return uwWithUserCaps(sub, () => _uwOrigDpPreview.apply(this, arguments));
};
var _uwOrigDpSave = window.saveDiscretionaryPricing;
window.saveDiscretionaryPricing = function () {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === discretionaryPricingTargetId);
  const tEl = document.getElementById("dpAdjustmentType"), pEl = document.getElementById("dpPercentInput");
  if (sub && tEl && pEl) {
    const cap = uwDiscretionaryCaps(sub), type = tEl.value, pct = parseFloat(pEl.value) || 0, mine = type === "credit" ? cap.credit : cap.debit;
    const filed = type === "credit" ? DISCRETIONARY_MAX_CREDIT_PCT : DISCRETIONARY_MAX_DEBIT_PCT;
    if (pct > mine && mine < filed) {
      uwLog(sub, "uw_pricing_over_authority", authRoleLabel(currentUserRole) + " tried a " + pct + "% " + type + "; the level allows " + mine + "%" + (cap.level ? " (" + cap.level.id + ")" : "") + ".");
      showToast("Your authority allows a " + type + " of up to " + mine + "%. For " + pct + "% the case needs a higher level.", "danger");
      return;
    }
  }
  return uwWithUserCaps(sub, () => _uwOrigDpSave.apply(this, arguments));
};

// The authority page shows the person's own level, every level (with where each came from), the editor, and the overrides on the case.
function uwScopeText(l) {
  const bits = [];
  if (l.lob && l.lob !== "*") bits.push(l.lob);
  if (l.states && l.states !== "*") bits.push(l.states.join("/"));
  if (l.product && l.product !== "*") bits.push("product " + l.product);
  if (l.program && l.program !== "*") bits.push("program " + l.program);
  return bits.length ? bits.join(", ") : "everything";
}
function uwLevelRowHtml(l, edit) {
  return `<tr><td>${uwEsc(l.id)}</td><td>${uwEsc(authRoleIdent(l.role))}</td><td>${uwEsc(uwScopeText(l))}</td><td>${l.txn === "*" ? "all" : l.txn.map(t => UW_TXN_LABELS[t] || t).join(", ")}</td><td>${l.maxCreditPct}%</td><td>${l.maxDebitPct}%</td><td>${l.canBind ? "Yes" : "No"}</td><td>${uwEsc(l.from || "")} to ${uwEsc(l.to || "open")}</td><td>${l.source === "placeholder" ? '<span class="badge badge-warning">Placeholder</span>' : uwEsc(l.source || "")}</td>${edit ? `<td><a href="#" onclick="uwLvEdit('${l.id}');return false;">edit</a> <a href="#" onclick="uwLvRemove('${l.id}');return false;">remove</a></td>` : ""}</tr>`;
}
function uwLevelsEditorHtml() {
  const canEdit = hasPermission("rateConfig", "edit"), canApprove = hasPermission("rateConfig", "approve"), p = UW_LEVELS_PENDING;
  let h = "";
  if (p) {
    const mine = p.proposedByKey === uwLevelsActorKey();
    h += `<div class="alert alert-warning ws-small" style="margin:8px 0;"><strong>Proposal waiting</strong> by ${uwEsc(p.proposedBy)} on ${uwEsc(p.proposedAt)}, citing <strong>${uwEsc(p.letterRef)}</strong>${p.note ? ": " + uwEsc(p.note) : ""}. It has ${p.levels.length} level(s); the levels in force stay as they are until it is approved.
      <div style="margin-top:6px;">${mine ? '<span class="text-muted">You proposed this; a different approver must decide it.</span> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="uwLvReject()">Withdraw</button>'
        : (canApprove ? '<button class="btn btn-xs btn-primary" style="width:auto;" onclick="uwLvApprove()">Approve</button> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="uwLvReject()">Reject</button>' : '<span class="text-muted">You cannot approve level changes.</span>')}</div>
      <table class="data-table" style="margin-top:6px;"><thead><tr><th>Level</th><th>Person</th><th>Scope</th><th>Transactions</th><th>Credit</th><th>Debit</th><th>Bind</th><th>Period</th><th>Source</th></tr></thead><tbody>${p.levels.map(l => uwLevelRowHtml(l, false)).join("")}</tbody></table></div>`;
  }
  if (!canEdit) return h;
  h += `<div class="uwp-subsection-title" style="margin-top:8px;">Change a level (proposal, approved by someone else)</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;" class="ws-small">
      <input id="uwlv_id" class="form-control form-control-sm" placeholder="Level id, e.g. LV-SU-TX">
      <select id="uwlv_role" class="form-control form-control-sm">${AUTH_ROLE_ORDER.map(r => `<option value="${r}">${uwEsc(authRoleIdent(r))}</option>`).join("")}</select>
      <input id="uwlv_txn" class="form-control form-control-sm" placeholder="Transactions: * or new,renew,endorse" value="*">
      <input id="uwlv_lob" class="form-control form-control-sm" placeholder="Line (* = all)" value="*">
      <input id="uwlv_states" class="form-control form-control-sm" placeholder="States (* or TX,OH)" value="*">
      <input id="uwlv_product" class="form-control form-control-sm" placeholder="Product (* = all)" value="*">
      <input id="uwlv_program" class="form-control form-control-sm" placeholder="Program (* = all)" value="*">
      <input id="uwlv_credit" type="number" class="form-control form-control-sm" placeholder="Credit %">
      <input id="uwlv_debit" type="number" class="form-control form-control-sm" placeholder="Debit %">
      <select id="uwlv_bind" class="form-control form-control-sm"><option value="yes">May bind</option><option value="no">May not bind</option></select>
      <input id="uwlv_from" class="form-control form-control-sm" placeholder="From yyyy-mm-dd">
      <input id="uwlv_to" class="form-control form-control-sm" placeholder="To (empty = open)">
      <input id="uwlv_note" class="form-control form-control-sm" placeholder="Note">
      <input id="uwlv_letter" class="form-control form-control-sm" placeholder="Authority letter reference (required)" value="${p ? uwEsc(p.letterRef) : ""}">
    </div>
    <div style="margin-top:6px;"><button class="btn btn-sm btn-warning" style="width:auto;" onclick="uwLvSubmit()">Propose this level</button></div>
    <details style="margin-top:6px;"><summary class="ws-small">Load all levels from an authority letter (JSON)</summary>
      <textarea id="uwlv_json" class="form-control" rows="4" placeholder='[{"id":"LV-1","role":"senior_uw","txn":"*","maxCreditPct":8,"maxDebitPct":15,"canBind":true,"from":"2026-07-01"}]'></textarea>
      <button class="btn btn-sm btn-outline" style="width:auto;margin-top:4px;" onclick="uwLvImport()">Propose these levels</button></details>`;
  return h;
}
function uwLvToast(r, okText) {
  if (r.ok) { showToast(okText, "success"); return; }
  if (r.error === "letter") showToast("Cite the authority letter (at least 3 characters).", "warning");
  else if (r.error === "invalid") showToast(r.errors[0] + (r.errors.length > 1 ? " (+" + (r.errors.length - 1) + " more)" : ""), "danger");
  else if (r.error === "self") showToast("You proposed this change; a different approver must decide it.", "danger");
  else if (r.error === "none") showToast("There is no proposal.", "info");
}
function uwLvRefresh() { const s = uwActive(); if (s) renderAuthorityCard(s); }
function uwLvV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function uwLvList(v) { return v === "*" || v === "" ? "*" : v.split(",").map(x => x.trim()).filter(Boolean); }
function uwLvSubmit() {
  const level = { id: uwLvV("uwlv_id"), role: uwLvV("uwlv_role"), txn: uwLvList(uwLvV("uwlv_txn")), lob: uwLvV("uwlv_lob") || "*", states: uwLvList(uwLvV("uwlv_states")), product: uwLvV("uwlv_product") || "*", program: uwLvV("uwlv_program") || "*", maxCreditPct: uwLvV("uwlv_credit"), maxDebitPct: uwLvV("uwlv_debit"), canBind: uwLvV("uwlv_bind") === "yes", from: uwLvV("uwlv_from"), to: uwLvV("uwlv_to") || null, note: uwLvV("uwlv_note") };
  uwLvToast(uwLevelsUpsert(level, uwLvV("uwlv_letter"), level.note), "Proposed " + level.id + ". It takes effect when a different approver approves it.");
  uwLvRefresh();
}
function uwLvImport() {
  let list; try { list = JSON.parse(uwLvV("uwlv_json")); } catch (e) { showToast("That is not valid JSON.", "danger"); return; }
  uwLvToast(uwLevelsPropose(Array.isArray(list) ? list.map(l => Object.assign({ source: "letter" }, l)) : [], uwLvV("uwlv_letter"), "Loaded from the letter"), "Proposed " + (Array.isArray(list) ? list.length : 0) + " level(s) from the letter.");
  uwLvRefresh();
}
function uwLvEdit(id) {
  const l = UW_AUTHORITY_LEVELS.find(x => x.id === id); if (!l) return;
  const set = (k, v) => { const e = document.getElementById(k); if (e) e.value = v; };
  set("uwlv_id", l.id); set("uwlv_role", l.role); set("uwlv_txn", l.txn === "*" ? "*" : l.txn.join(",")); set("uwlv_lob", l.lob); set("uwlv_states", l.states === "*" ? "*" : l.states.join(","));
  set("uwlv_product", l.product || "*"); set("uwlv_program", l.program || "*"); set("uwlv_credit", l.maxCreditPct); set("uwlv_debit", l.maxDebitPct); set("uwlv_bind", l.canBind ? "yes" : "no");
  set("uwlv_from", l.from || ""); set("uwlv_to", l.to || ""); set("uwlv_note", l.note || "");
}
function uwLvRemove(id) { uwLvToast(uwLevelsRemove(id, uwLvV("uwlv_letter"), "Removed " + id), "Proposed removing " + id + "."); uwLvRefresh(); }
function uwLvApprove() { uwLvToast(uwLevelsApprove(), "The levels are in force."); uwLvRefresh(); }
function uwLvReject() { const r = uwLevelsReject(); if (r.ok) showToast("The proposal is closed.", "info"); else uwLvToast(r, ""); uwLvRefresh(); }

var _uwOrigAuthCard = window.renderAuthorityCard;
window.renderAuthorityCard = function (sub) {
  const r = _uwOrigAuthCard.apply(this, arguments);
  try {
    const box = document.getElementById("authorityContainer");
    if (box && sub) {
      const m = authMeasures(sub), lc = uwLevelCheck(currentUserRole, m), lv = lc.level, over = uwLevelOverlaps(), canEdit = hasPermission("rateConfig", "edit");
      const old = box.querySelector(".uw-level-block"); if (old) old.remove();
      const div = document.createElement("div"); div.className = "uw-level-block"; div.style.marginTop = "10px";
      div.innerHTML = `<div class="uwp-subsection-title">Your authority level for this case</div>
        <div class="ws-small">${lv ? `<strong>${uwEsc(authRoleIdent(currentUserRole))}</strong>, ${uwEsc(lv.id)}: ${UW_TXN_LABELS[m.txn] || m.txn}; credit up to ${lv.maxCreditPct}%, debit up to ${lv.maxDebitPct}%; ${lv.canBind ? "may bind" : "may not bind"}; in force ${uwEsc(lv.from || "-")} to ${uwEsc(lv.to || "open")}.` : uwEsc(lc.reasons[0] || "No level applies.")}</div>
        ${uwLevelsArePlaceholder() ? '<div class="text-xs" style="margin-top:4px;"><span class="badge badge-warning">Placeholder figures</span> These levels are illustrative and have not been loaded from an authority letter.</div>' : '<div class="text-xs text-muted" style="margin-top:4px;">Levels in force from ' + uwEsc(UW_LEVELS_META.letterRef || "") + ', approved by ' + uwEsc(UW_LEVELS_META.approvedBy || "") + ' on ' + uwEsc(UW_LEVELS_META.approvedAt || "") + '.</div>'}
        <details style="margin-top:6px;"${UW_LEVELS_PENDING ? " open" : ""}><summary class="ws-small">All authority levels${over.length ? " (" + over.length + " overlap(s) to fix)" : " (no overlaps)"}${UW_LEVELS_PENDING ? ", a proposal is waiting" : ""}</summary>
        <table class="data-table"><thead><tr><th>Level</th><th>Person</th><th>Scope</th><th>Transactions</th><th>Credit</th><th>Debit</th><th>Bind</th><th>Period</th><th>Source</th>${canEdit ? "<th></th>" : ""}</tr></thead><tbody>${UW_AUTHORITY_LEVELS.map(l => uwLevelRowHtml(l, canEdit)).join("")}</tbody></table>
        <div class="text-xs text-muted">Premium and limit ceilings by line and state are in the table above. A level's scope narrows it to a line, states, a product (the case's product code or name) or a program.</div>
        ${uwLevelsEditorHtml()}
        ${UW_LEVELS_HISTORY.length ? `<div class="text-xs text-muted" style="margin-top:6px;">History: ${UW_LEVELS_HISTORY.slice(-3).reverse().map(h => uwEsc(h.at + " " + h.text)).join("; ")}</div>` : ""}</details>
        ${uwOverrideListHtml(sub)}`;
      box.appendChild(div);
    }
  } catch (e) { console.warn("Authority level block failed:", e); }
  return r;
};

// ----------------------------------------------------------------------------
// 5. DECISION BRIEF AND AUDIT
// ----------------------------------------------------------------------------
var _uwOrigBrief = window.buildDecisionBrief;
window.buildDecisionBrief = function (sub) {
  const b = _uwOrigBrief.apply(this, arguments);
  try {
    if ((sub.appetiteRules || []).length) {
      const ev = uwEvaluateRules(sub);
      b.checks.push(dbCheck("Rule evaluation", ev.outcome === "proceed" ? "ok" : ev.outcome === "refer" ? "warn" : "fail",
        ev.outcome === "auto_declined" ? ev.knockoutCount + " knockout rule(s) failed." : ev.outcome === "refer" ? (ev.referCount ? ev.referCount + " major rule(s) failed; " : "") + ev.warningCount + " warning(s); the case goes to an approver." : ev.passCount + " rule(s) passed" + (ev.overriddenCount ? ", " + ev.overriddenCount + " overridden with a recorded reason" : "") + "."));
    }
    const a = sub.uwAssessment, sc = a ? uwAssessmentScore(a.responses) : null;
    b.checks.push(a && a.status === "final" ? dbCheck("Underwriting assessment", a.grade === "D" || a.grade === "E" ? "warn" : "ok", "Grade " + a.grade + " (" + a.overall.toFixed(2) + " / 5), by " + a.assessedBy + ".")
      : dbCheck("Underwriting assessment", "pending", sc && sc.scored ? "Draft: " + sc.scored + " of " + UW_FRAMEWORK.dimensions.length + " dimensions scored." : "Not done yet."));
  } catch (e) { console.warn("Brief additions failed:", e); }
  return b;
};

(function installUwAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  const m = (label, icon, badge, outcome) => ({ label: label, icon: icon, badge: badge, outcome: outcome });
  AUDIT_ACTION_META.uw_override_applied = m("Override Recorded", "ph-shield-check", "badge-warning", "outcome-refer");
  AUDIT_ACTION_META.uw_override_revoked = m("Override Revoked", "ph-arrow-counter-clockwise", "badge-light", "outcome-refer");
  AUDIT_ACTION_META.uw_override_blocked = m("Override Refused", "ph-prohibit", "badge-danger", "outcome-decline");
  AUDIT_ACTION_META.uw_pricing_over_authority = m("Price Adjustment Over Authority", "ph-prohibit", "badge-danger", "outcome-decline");
  AUDIT_ACTION_META.uw_assessment_final = m("Assessment Finalised", "ph-clipboard-text", "badge-success", "outcome-approve");
  AUDIT_ACTION_META.uw_assessment_reopened = m("Assessment Reopened", "ph-clipboard-text", "badge-warning", "outcome-refer");
})();

Object.assign(window, { uwLevelsPropose, uwLevelsUpsert, uwLevelsRemove, uwLevelsApprove, uwLevelsReject, uwLevelsValidate, uwLevelsReset, uwLevelsArePlaceholder, uwLvSubmit, uwLvImport, uwLvEdit, uwLvRemove, uwLvApprove, uwLvReject, uwRuleSeverity, uwRuleOutcome, uwEvaluateRules, uwRunRules, renderRuleRun, uwApplyRuleOverride, uwRevokeRuleOverride, uwAssessmentScore, uwAssessmentSuggest, uwAssessmentSet, uwAssessmentFinalise, uwAssessmentReopen, renderUwAssessment, uwAssessSave, uwAssessUseSuggestion, uwAssessFinalise, uwAssessReopen, uwLevelFor, uwLevelCheck, uwLevelOverlaps, uwDiscretionaryCaps, uwTxnOf });
