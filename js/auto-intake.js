/**
 * ============================================================================
 * AUTOMATIC INTAKE: THE UNDERWRITER STARTS AT THE WORKBENCH
 * ----------------------------------------------------------------------------
 * Five of the first six steps need no judgement from a person, so the backend does them and the underwriter opens the case at
 * Step 6, the Underwriting Workbench with its Appetite match:
 *
 *   Step 1  Ingest       what arrived is kept exactly as received (nothing to do).
 *   Step 2  Clearance    already decided in Phase 1 (four checks plus the reviewer's comment). Not asked a second time.
 *   Step 3  Extract      the email text and files are read.
 *   Step 4  Confirm      the read values are applied when nothing critical is missing.
 *   Step 5  Enrich       the enrichment cards draw themselves from the case; nothing to confirm.
 *
 * It STOPS, and opens the case at the step that needs a person, when:
 *   - Step 2: Phase 1 was not approved by a reviewer (a case that did not come through Phase 1 keeps the human decision at the
 *     Clearance step: nobody else has decided it), or the case is not a new-business submission.
 *   - Step 4: the reader could not find a critical field, so the person must supply or confirm it.
 * Nothing is hidden: every automatic step is written to the case's decision log and the Workbench shows what was done and what
 * is flagged. The earlier steps stay reachable from the stepper and from "Intake details" on the Workbench.
 * A case with no raw email (entered by hand) has nothing to read, so the read and confirm steps are recorded as "nothing to read".
 * ============================================================================
 */

var AI_LAST = { stopped: null };

function aiSub() { return typeof wsSub === "function" ? wsSub() : null; }

/** True when the case is early enough for the automatic steps to apply. */
function aiEligible(sub) {
  return !!sub && caseIsOpen(sub) && (sub.currentStep || 1) < SCORE_STEP && !(sub.autoIntake && sub.autoIntake.status === "stopped" && sub.autoIntake.step === (sub.currentStep || 1) && sub.autoIntake.fingerprint === aiFingerprint(sub));
}

/** What the stop depends on, so that a case that was fixed is tried again but an unchanged one is not re-run on every open. */
function aiFingerprint(sub) {
  return [sub.phase1 && sub.phase1.stage, sub.normalizationStatus, sub.insured, sub.fein, (sub.rawAttachments || []).length].join("|");
}

function aiMark(sub, step, text, notes) {
  if (!sub.completedSteps) sub.completedSteps = [];
  if (sub.completedSteps.indexOf(step) < 0) sub.completedSteps.push(step);
  logDecision(sub, step, "auto_intake", "Automatic: " + text + (notes ? " " + notes : ""), "System (automatic)");
  sub.autoIntake.done.push({ step: step, text: text, at: nowStamp() });
}

/**
 * Runs the automatic steps for a case. Returns { ok, step, stoppedAt, reason }: the step the case now stands at, and why it stopped
 * there if it stopped before the Workbench.
 */
function autoIntakeRun(sub) {
  if (!sub) return { ok: false, reason: "No case." };
  if (!aiEligible(sub)) return { ok: true, step: sub.currentStep || 1, stoppedAt: sub.autoIntake && sub.autoIntake.status === "stopped" ? sub.autoIntake.step : null, reason: sub.autoIntake && sub.autoIntake.reason };
  sub.autoIntake = { status: "running", done: [], flags: [], startedAt: nowStamp() };
  const stop = (step, reason) => {
    sub.autoIntake.status = "stopped"; sub.autoIntake.step = step; sub.autoIntake.reason = reason; sub.autoIntake.fingerprint = aiFingerprint(sub);
    sub.currentStep = step;
    if (typeof setStatusForStep === "function") setStatusForStep(sub);
    if (typeof persistAppState === "function") persistAppState();
    AI_LAST.stopped = { id: sub.id, step: step, reason: reason };
    return { ok: true, step: step, stoppedAt: step, reason: reason };
  };

  // Step 1: ingest.
  const nDocs = (sub.rawAttachments || sub.docs || []).length;
  aiMark(sub, INGEST_STEP, "Submission received and kept as it arrived" + (nDocs ? " (" + nDocs + " file" + (nDocs === 1 ? "" : "s") + ")." : "."));

  // Step 2: clearance was decided in Phase 1.
  const p1 = sub.phase1;
  if (!(p1 && p1.stage === "done" && p1.review && p1.review.decision === "approved")) return stop(CLEARANCE_STEP, "Clearance needs a person's decision: this case did not pass the Phase 1 review.");
  if (typeof triageClassify === "function") {
    const k = triageClassify(sub);
    if (k.kind !== "new_submission") return stop(CLEARANCE_STEP, "This reads as " + (TRIAGE_KINDS[k.kind] ? TRIAGE_KINDS[k.kind].label.toLowerCase() : k.kind) + ", not new business. Check it before it goes on.");
  }
  aiMark(sub, CLEARANCE_STEP, "Producer licence, duplicate FEIN, appetite and watchlist cleared at Phase 1 by " + p1.review.by + ".");

  // Steps 3 and 4: read and apply.
  const hasRaw = sub.rawEmailText !== undefined && sub.normalizationStatus === "pending";
  if (hasRaw && typeof buildLocalNormalizationDraft === "function") {
    // An outside reader has already answered (see the opener below); the built-in reader is run here.
    let draft = EXL_DRAFTS[sub.id];
    if (!draft && !exlIsLocal()) return stop(EXTRACT_STEP, (sub.extraction && sub.extraction.reason ? sub.extraction.reason : "The reader has not answered yet.") + " Try again, or switch the reader to the built-in rules.");
    if (!draft) { try { draft = exlRunLocalNow(sub); } catch (e) { return stop(EXTRACT_STEP, "The documents could not be read automatically (" + e.message + ")."); } }
    delete EXL_DRAFTS[sub.id];
    const missing = draft.missing_critical_fields || [];
    const n = Object.keys(draft.fields_confidence || {}).length;
    aiMark(sub, EXTRACT_STEP, "Email and files read by " + (sub.extraction ? sub.extraction.provider : "the reader") + ": " + n + " field" + (n === 1 ? "" : "s") + " found, each with its confidence and source.");
    if (missing.length) {
      sub.autoIntake.flags = missing.map(m => "Not found: " + m);
      return stop(CONFIRM_STEP, "Could not find: " + missing.join(", ") + ". Supply or confirm " + (missing.length === 1 ? "it" : "them") + " before the Workbench.");
    }
    applyNormalizedDataToSubmission(sub.id);
    const low = Object.keys(draft.fields_confidence || {}).filter(k => draft.fields_confidence[k] === "low");
    if (low.length) sub.autoIntake.flags = low.map(k => "Low confidence: " + k);
    aiMark(sub, CONFIRM_STEP, "Read values applied to the case" + (low.length ? "; " + low.length + " flagged as low confidence." : "."));
  } else {
    aiMark(sub, EXTRACT_STEP, "Nothing to read: the case was entered directly, so there is no email or file text.");
    aiMark(sub, CONFIRM_STEP, "Nothing to confirm.");
  }

  // Step 5: enrichment draws from the case.
  aiMark(sub, ENRICH_STEP, "Enrichment and registry checks prepared from the case details.");

  sub.autoIntake.status = "done"; sub.autoIntake.finishedAt = nowStamp();
  sub.currentStep = SCORE_STEP;
  if (typeof setStatusForStep === "function") setStatusForStep(sub);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, step: SCORE_STEP, stoppedAt: null };
}
window.autoIntakeRun = autoIntakeRun;

// ----------------------------------------------------------------------------
// WORKBENCH STRIP: what was done for you, and what is flagged
// ----------------------------------------------------------------------------
function aiStripHtml(sub) {
  const a = sub && sub.autoIntake;
  if (!a || a.status !== "done") return "";
  const flags = a.flags || [];
  const doneList = a.done.map(d => `<li><i class="ph ph-check-circle"></i> ${escHtml(d.text)}</li>`).join("");
  return `<div class="ai-strip${flags.length ? " ai-strip-flag" : ""}" id="aiStrip">
    <div class="ai-strip-head"><span><i class="ph ph-lightning"></i> <strong>Intake was handled automatically</strong> · ${a.done.length} steps done by the system${flags.length ? ` · <strong>${flags.length} to check</strong>` : ""}</span>
      <span class="ai-strip-actions"><button class="btn btn-outline btn-sm" onclick="aiToggle()">${AI_OPEN ? "Hide" : "What was done"}</button> <button class="btn btn-outline btn-sm" onclick="goToWorkflowStep(CONFIRM_STEP)">Intake details</button></span></div>
    ${flags.length ? `<div class="ai-flags">${flags.map(f => `<span class="badge badge-warning">${escHtml(f)}</span>`).join(" ")}</div>` : ""}
    ${AI_OPEN ? `<ul class="ai-list">${doneList}</ul>${exlTableHtml(sub)}${exlSettingsHtml()}` : ""}
  </div>`;
}
var AI_OPEN = false;
function aiToggle() { AI_OPEN = !AI_OPEN; aiRenderStrip(); }
function aiRenderStrip() {
  const box = document.getElementById("autoIntakeStrip");
  if (box) box.innerHTML = aiStripHtml(aiSub());
}
if (typeof registerStepRenderer === "function") registerStepRenderer("autoIntakeStrip", aiRenderStrip);

// ----------------------------------------------------------------------------
// OPENING A CASE
// ----------------------------------------------------------------------------
(function aiInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") AUDIT_ACTION_META.auto_intake = { label: "Automatic Intake Step", icon: "ph-lightning", badge: "badge-info", outcome: "outcome-comm" };
  const prior = window.openCaseAtCurrentStep;
  window.openCaseAtCurrentStep = function (id) {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === id);
    // Only the people who may work the case are taken through it: the automatic steps write to the case.
    if (sub && aiEligible(sub) && hasPermission("submissionData", "edit") && (canSeeAllSubmissions() || isMyCase(sub))) {
      const self = this, args = arguments;
      const go = function () {
        const r = autoIntakeRun(sub);
        const out = prior.apply(self, args);
        if (r.stoppedAt) showToast("⏸ " + sub.id + " needs you at " + stepObjOf(r.stoppedAt).shortTitle + ". " + r.reason, "warning");
        else showToast("⚡ Intake done automatically. " + sub.id + " is at the Underwriting Workbench.", "success");
        return out;
      };
      // An outside reader answers on a promise: the case is read first, then taken through the steps.
      const needsOutside = !exlIsLocal() && sub.rawEmailText !== undefined && sub.normalizationStatus === "pending" && sub.phase1 && sub.phase1.stage === "done";
      if (needsOutside) { showToast("⏳ Reading " + sub.id + " with " + EXL_CFG.provider + "…", "info"); exlRun(sub).then(go); return; }
      return go();
    }
    return prior.apply(this, arguments);
  };
})();
