/**
 * ============================================================================
 * CLEARANCE GATE (Step 2): legal checks first, and a hold until they pass
 * ----------------------------------------------------------------------------
 * Producer licence and appointment, and sanctions screening, are legal gates, not underwriting questions. They run
 * as soon as ingestion is confirmed (no button), before market clearance, the FEIN check and the appetite knockouts.
 *
 *   producer licence / appointment   the producer must be licensed in the risk's state and appointed with the carrier
 *   sanctions (OFAC)                 no party may match a watchlist; no list loaded counts as "not screened"
 *
 * If either does not pass (failed, not found, no list, a potential match nobody has cleared), the case is HELD at
 * Step 2: it cannot move on to Data Enrichment, whether by the Next button or by clicking a later step. The same
 * two checks run again at bind (producer-licensing.js, sanctions-screening.js); a bind that comes minutes after a
 * screening, with the same parties and the same list, or after the same producer passed in this session with no new
 * registry, does not repeat them.
 *
 * Direct submissions have no producer; for them only the sanctions check applies.
 * ============================================================================
 */

function clearanceActiveSub() { return typeof activeSubmissionId !== "undefined" ? (SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null) : null; }

/** Where the two legal checks stand now. `ok` is true only when both let the case continue. */
function clearanceChecks(sub) {
  const out = { producer: { ok: true, label: "", detail: "" }, sanctions: { ok: true, label: "", detail: "" }, ok: true };
  if (!sub) return out;
  // producer
  const p = typeof producerCurrent === "function" ? producerCurrent(sub) : null;
  if (!p) {
    out.producer = { ok: false, label: "Not checked", detail: "The producer licence and appointment check has not run." };
  } else if (!producerAllowsBind(p.status)) {
    const noRegistry = p.status === "not_found" && typeof PRODUCER_REGISTRY !== "undefined" && PRODUCER_REGISTRY.length === 0;
    const label = noRegistry ? "No registry loaded" : (PRODUCER_STATE_UI[p.status] || {}).label || p.status;
    out.producer = { ok: false, label, detail: noRegistry ? "No licensing registry is loaded; an approver must record a verified lookup." : p.status === "cannot_determine" ? "The state of the customer's business was not found on the case or in the email. Set it on the Producer Licence card below." : "The producer is not verified for this state and carrier." };
  } else {
    out.producer = { ok: true, label: p.status === "not_applicable" ? "Not applicable (direct)" : "Verified", detail: "" };
  }
  // sanctions
  const s = typeof getSanctionsStatus === "function" ? getSanctionsStatus(sub) : null;
  if (!s || !sanctionsAllowsBind(s)) {
    const st = s ? s.state : "not_screened";
    const label = (SANCTIONS_STATE_UI[st] || {}).label || st;
    const detail = st === "no_list" ? "No watchlist is loaded, so the parties were not screened. Load a list, or an approver records that they were screened elsewhere."
      : st === "blocked" ? "A confirmed match is on file. Escalate to Compliance."
      : st === "not_screened" ? "The parties have not been screened."
      : "A potential match has not been cleared.";
    out.sanctions = { ok: false, label, detail };
  } else {
    out.sanctions = { ok: true, label: (SANCTIONS_STATE_UI[s.state] || {}).label || "Clear", detail: "" };
  }
  out.ok = out.producer.ok && out.sanctions.ok;
  return out;
}

/** True when the legal checks are stale: the producer has not passed this session, or the parties or the list changed since the last screening. */
function clearanceStale(sub) {
  if (!sub) return false;
  const producerFresh = typeof producerVerifiedThisSession === "function" && producerVerifiedThisSession(sub) && producerCurrent(sub);
  const sanctionsFresh = typeof sanctionsScreenIsCurrent === "function" && sanctionsScreenIsCurrent(sub);
  return !(producerFresh && sanctionsFresh);
}

/** Runs both checks. Producer always (the data just changed); sanctions only if the parties or the list changed. */
function clearanceAutoRun(sub, trigger) {
  if (!sub) return null;
  try { if (typeof runProducerCheck === "function") runProducerCheck(sub, trigger || "clearance"); } catch (e) { console.warn("Producer check failed:", e); }
  try { if (typeof sanctionsEnsureScreened === "function") sanctionsEnsureScreened(sub, "clearance"); } catch (e) { console.warn("Sanctions screening failed:", e); }
  const r = clearanceChecks(sub);
  if (!r.ok && typeof clearanceLog === "function") clearanceLog(sub, "clearance_hold", `Held at Step 2: ${[r.producer.ok ? "" : "producer licence (" + r.producer.label + ")", r.sanctions.ok ? "" : "sanctions (" + r.sanctions.label + ")"].filter(Boolean).join("; ")}.`);
  if (typeof renderClearanceHold === "function") renderClearanceHold(sub);
  if (typeof renderProducerCard === "function") renderProducerCard(sub);
  if (typeof renderSanctionsCard === "function") renderSanctionsCard(sub);
  return r;
}

function clearanceLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  const last = sub.decisionLog[sub.decisionLog.length - 1];
  if (last && last.decision === decision && last.notes === notes) return;   // do not repeat the same line
  sub.decisionLog.push({ step: 2, decision, by: typeof producerActor === "function" ? producerActor() : "System", at: new Date().toISOString().slice(0, 16).replace("T", " "), notes });
  if (typeof persistAppState === "function") persistAppState();
}

/** The hold banner at the top of Step 2. */
function renderClearanceHold(sub) {
  const box = document.getElementById("clearanceHoldContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const r = clearanceChecks(sub);
  const row = (name, c) => `<li><strong>${name}:</strong> <span class="badge ${c.ok ? "badge-success" : "badge-danger"}">${c.label || (c.ok ? "OK" : "Not met")}</span>${c.ok ? "" : " " + c.detail}</li>`;
  box.innerHTML = r.ok
    ? `<div class="alert alert-success text-xs"><i class="ph ph-check-circle"></i> <strong>Legal checks passed.</strong> Producer licence and sanctions screening are clear; the case may continue after market clearance and the appetite rules.</div>`
    : `<div class="alert alert-danger text-xs"><i class="ph ph-hand-palm"></i> <strong>Held at Step 2.</strong> The case cannot move on to Data Enrichment until both legal checks pass.
        <ul style="margin:6px 0 0 18px;">${row("Producer licence and appointment", r.producer)}${row("Sanctions screening", r.sanctions)}</ul></div>`;
}

/** The reasons the case may not leave Step 2, or an empty list. */
function clearanceHoldReasons(sub) {
  if (!sub) return [];
  const r = clearanceChecks(sub), out = [];
  if (!r.producer.ok) out.push("producer licence and appointment (" + r.producer.label.toLowerCase() + ")");
  if (!r.sanctions.ok) out.push("sanctions screening (" + r.sanctions.label.toLowerCase() + ")");
  return out;
}

(function installClearanceGate() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.clearance_hold = { label: "Held at Step 2: Legal Checks Not Passed", icon: "ph-hand-palm", badge: "badge-danger", outcome: "outcome-decline" };
  }

  // Ingestion confirmed: run the checks now, without a button.
  const origApply = window.applyNormalizedDataToSubmission;
  if (typeof origApply === "function") {
    window.applyNormalizedDataToSubmission = function (subId) {
      const sub0 = SUBMISSIONS_DATASET.find(s => s.id === subId);
      const before = sub0 && sub0.normalizedMeta ? sub0.normalizedMeta.normalizedAt : null;
      const r = origApply.apply(this, arguments);
      const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
      if (sub && sub.normalizedMeta && sub.normalizedMeta.normalizedAt !== before) {
        const res = clearanceAutoRun(sub, "clearance");
        if (res && !res.ok) showToast("Held at Step 2: " + clearanceHoldReasons(sub).join("; ") + ".", "warning");
      }
      return r;
    };
  }

  // Opening Step 2: make sure the checks have run, then show the banner (the cards draw themselves).
  const origShow = window.showWorkflowPage;
  if (typeof origShow === "function") {
    window.showWorkflowPage = function (stepNum) {
      const r = origShow.apply(this, arguments);
      if (stepNum === 2) {
        const sub = clearanceActiveSub();
        if (sub && clearanceStale(sub)) clearanceAutoRun(sub, "clearance");
      }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderClearanceHold(sub); } catch (e) { console.warn("Clearance hold banner failed:", e); }
      return r;
    };
  }

  // Leaving Step 2 by the Next button.
  const origNext = window.goToNextStep;
  if (typeof origNext === "function") {
    window.goToNextStep = function () {
      if (typeof currentWorkflowStep !== "undefined" && currentWorkflowStep === 2) {
        const sub = clearanceActiveSub();
        if (sub) {
          // The checks run on arrival; make sure they have, whatever way the case got here.
          if (!producerCurrent(sub) || !sanctionsStore(sub).screens.length) clearanceAutoRun(sub, "clearance");
          const why = clearanceHoldReasons(sub);
          if (why.length) {
            clearanceLog(sub, "clearance_hold", `Step 2 exit blocked: ${why.join("; ")}.`);
            showToast(`⛔ Held at Step 2: ${why.join("; ")}. Both legal checks must pass before Document Extraction.`, "danger");
            renderClearanceHold(sub);
            return;
          }
        }
      }
      return origNext.apply(this, arguments);
    };
  }

  // Leaving Step 2 by clicking a later step in the stepper.
  const origGo = window.goToWorkflowStep;
  if (typeof origGo === "function") {
    window.goToWorkflowStep = function (stepNum) {
      const sub = clearanceActiveSub();
      if (sub && stepNum >= 3 && (sub.currentStep || 1) <= 2 && !(sub.completedSteps || []).includes(2)) {
        const why = clearanceHoldReasons(sub);
        if (why.length) {
          showToast(`⛔ Held at Step 2: ${why.join("; ")}.`, "danger");
          stepNum = 2;
        }
      }
      const r = origGo.call(this, stepNum);
      // Arriving at Step 2 by any route (Next from Step 1, the stepper, a decision): run the legal checks.
      if (stepNum === 2) { const s2 = clearanceActiveSub(); if (s2 && clearanceStale(s2)) clearanceAutoRun(s2, "clearance"); }
      return r;
    };
  }
})();

window.clearanceChecks = clearanceChecks;
window.clearanceAutoRun = clearanceAutoRun;
window.clearanceHoldReasons = clearanceHoldReasons;
window.renderClearanceHold = renderClearanceHold;
