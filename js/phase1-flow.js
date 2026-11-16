/**
 * ============================================================================
 * PHASE 1: NEW SUBMISSION, AUTOMATIC BACKEND CHECKS, HUMAN REVIEW
 * ----------------------------------------------------------------------------
 * One guided page, four screens, always in this order:
 *
 *   1. Create     the form (Head of Underwriting only). Nothing is copied from another case.
 *   2. Received   the submission now exists; the checks start by themselves.
 *   3. Checks     four checks run in order, with no button to press:
 *                   producer licence  ->  FEIN duplicate  ->  appetite  ->  watchlist
 *   4. Decision   the human-in-the-loop step. The assigned reviewer reads the results, writes a comment (required) and decides.
 *                   all clear           Approve and continue to the workflow
 *                   a check failed      DECLINE SCENARIO: why, what it means, confirm the decline or fix the details and re-run
 *                   a check could not   (no registry or watchlist loaded) load the file here, the checks re-run; approval waits
 *                   be completed
 *
 * The checks reuse the platform's own rules (producer-licensing.js, sanctions-screening.js, the appetite match) and write their results
 * onto the case (sub.phase1), so Step 2 of the workflow and the audit log show the same findings. A case that has not been approved
 * cannot be opened in the workflow: opening it from the queue brings the reviewer back to this page.
 *
 * Appetite: the rules below are PLACEHOLDERS for the company to confirm. Product appetite rules from Product Studio apply as well
 * whenever the case carries them.
 * ============================================================================
 */

var P1_APPETITE = {
  minYearsInBusiness: 2           // placeholder: confirm with underwriting guidelines
};   // where the carrier writes is NOT here: the state guidelines register (js/state-guidelines.js) is the one store of state rules

var P1_MIN_COMMENT = 10;
var P1_ANIMATE = true;            // the checks are revealed one by one; tests switch this off
var P1_REVEAL_MS = 500;

var P1_CHECKS = [
  { key: "producer", title: "Producer licence", icon: "ph-identification-card", what: "Licensed in the risk state and appointed with the carrier" },
  { key: "fein", title: "FEIN duplicate", icon: "ph-fingerprint", what: "No other active submission uses this FEIN" },
  { key: "appetite", title: "Appetite", icon: "ph-target", what: "Line, state and years in business are within what we write" },
  { key: "watchlist", title: "Watchlist", icon: "ph-shield-warning", what: "No party matches the sanctions watchlist" }
];

var P1 = { step: "create", subId: null, editing: false, draft: "", form: null, timers: [] };

function p1Sub() { return SUBMISSIONS_DATASET.find(s => s.id === P1.subId) || null; }
function p1Persist() { if (typeof persistAppState === "function") persistAppState(); }
function p1Role(key) { return USER_ROLES_CONFIG[key] || null; }
function p1RoleName(key) { const r = p1Role(key); return r ? r.name + " (" + r.title + ")" : String(key || "—"); }
function p1Store(sub) { if (!sub.phase1) sub.phase1 = { stage: "received", reviewer: null, checks: null, ranAt: null, runs: 0, review: null }; return sub.phase1; }
function p1Log(sub, decision, notes) { logDecision(sub, 1, decision, notes); }
function p1Digits(s) { return String(s || "").replace(/\D/g, ""); }
function p1ClearTimers() { P1.timers.forEach(t => clearTimeout(t)); P1.timers = []; }

// ----------------------------------------------------------------------------
// 1. THE FOUR CHECKS (each returns { key, title, status: pass | fail | unable, summary, lines: [{ ok, text }] })
// ----------------------------------------------------------------------------
function p1CheckProducer(sub) {
  const meta = P1_CHECKS[0], base = { key: meta.key, title: meta.title };
  if (sub.channelType === "direct" || !sub.broker) return Object.assign(base, { status: "pass", summary: "Not applicable: a direct customer has no producer.", lines: [] });
  const r = runProducerCheck(sub, "phase1");
  const lines = r.checks.map(c => ({ ok: c.pass === null ? true : !!c.pass, text: c.label + ": " + c.detail }));
  const st = clearanceGateStatus(sub).producer;   // the one pass / fail / unable classification, shared with the Clearance board
  if (st === "pass") return Object.assign(base, { status: "pass", summary: `${r.producerName} is licensed in ${r.riskState} and appointed with ${r.carrier}.`, lines });
  if (st === "unable") return Object.assign(base, { status: "unable", summary: "No licensing registry is loaded, so the producer could not be checked.", lines: [], needs: "registry" });
  const bad = r.checks.filter(c => c.pass === false)[0];
  return Object.assign(base, { status: "fail", summary: bad ? bad.detail : "The producer could not be verified.", lines });
}

function p1CheckFein(sub) {
  const meta = P1_CHECKS[1], base = { key: meta.key, title: meta.title };
  const mine = p1Digits(sub.fein);
  // a copy of a case (js/case-money.js) and the case it was copied from are the same customer, not a duplicate
  const related = s => s.copiedFrom === sub.id || sub.copiedFrom === s.id || (!!s.copiedFrom && s.copiedFrom === sub.copiedFrom);
  const clash = SUBMISSIONS_DATASET.filter(s => s.id !== sub.id && p1Digits(s.fein) === mine && s.lifecycleStatus !== "declined" && !related(s));
  const lines = [];
  if (clash.length) {
    clash.forEach(c => lines.push({ ok: false, text: `${c.id}: ${c.insured}, sent by ${c.broker || "unknown"}, ${c.statusText || "in progress"}.` }));
    return Object.assign(base, { status: "fail", summary: `FEIN ${sub.fein} is already on ${clash[0].id} (${clash[0].insured}), sent by ${clash[0].broker || "another source"}.`, lines });
  }
  const alike = typeof findDuplicateSubmission === "function" ? findDuplicateSubmission(sub.insured, "", sub.id) : null;
  if (alike) lines.push({ ok: true, text: `Note: ${alike.id} has a similar name (${alike.insured}) but a different FEIN, so it is not treated as a duplicate.` });
  return Object.assign(base, { status: "pass", summary: `No other active submission uses FEIN ${sub.fein}.`, lines });
}

function p1CheckAppetite(sub) {
  const meta = P1_CHECKS[2], base = { key: meta.key, title: meta.title };
  const lines = [];
  const st = sub.riskStateSet && sub.riskStateSet.state;
  const ops = sub.operationsProfile || {};
  const years = ops.years_in_business;
  const lobOk = LOB_CATALOG.some(l => l.key === sub.lobKey);
  lines.push({ ok: lobOk, text: lobOk ? `Line of business: ${sub.lobName} is written.` : `Line of business: ${sub.lobName || sub.lobKey} is not written.` });
  const guide = st && typeof sgFor === "function" ? sgFor(st, sub.lobKey) : null;   // the state guidelines register: the one store of state rules
  const guideStop = !!guide && guide.position === "Do not write";
  lines.push({ ok: !!st && !guideStop, text: !st ? "State: not given." : guideStop ? `State: ${st} is not written for ${sub.lobName || sub.lobKey} (state guideline ${guide.id}: ${guide.note}; source ${guide.source}).` : guide ? `State: ${st} is written (state guideline ${guide.id}).` : `State: ${st}; no state guideline is recorded, so nothing restricts it.` });
  if (guide && guide.position === "Refer") lines.push({ ok: true, text: `State guideline ${guide.id}: ${st} is a refer state for ${guide.lob === "all" ? "all lines" : sub.lobName || sub.lobKey}: ${guide.note} (source ${guide.source}). Send to a senior underwriter.` });
  const yearsKnown = years !== undefined && years !== null && years !== "" && !isNaN(Number(years));
  const yearsOk = yearsKnown && Number(years) >= P1_APPETITE.minYearsInBusiness;
  lines.push({ ok: yearsOk, text: !yearsKnown ? "Years in business: not given." : yearsOk ? `Years in business: ${years} (at least ${P1_APPETITE.minYearsInBusiness} required).` : `Years in business: ${years}; at least ${P1_APPETITE.minYearsInBusiness} required.` });
  if (typeof appetiteMatch === "function") {
    const m = appetiteMatch(sub);
    if (m.total) {
      lines.push({ ok: m.verdict !== "out", text: `Product rules: ${m.passed} of ${m.total} pass` + (m.hard.length ? "; cannot be overridden: " + m.hard.map(r => r.factor).join(", ") : "") + "." });
    }
  }
  const failed = lines.filter(l => !l.ok);
  if (failed.length) return Object.assign(base, { status: "fail", summary: failed.map(l => l.text).join(" "), lines });
  return Object.assign(base, { status: "pass", summary: "Line, state and years in business are within appetite.", lines });
}

function p1CheckWatchlist(sub) {
  const meta = P1_CHECKS[3], base = { key: meta.key, title: meta.title };
  sanctionsEnsureScreened(sub, "clearance");
  const s = getSanctionsStatus(sub), latest = s.latest;
  const n = latest && latest.parties ? latest.parties.length : 0;
  if (clearanceGateStatus(sub).sanctions === "unable") return Object.assign(base, { status: "unable", summary: "No watchlist is loaded, so the parties could not be screened.", lines: [], needs: "watchlist" });
  if (s.state === "blocked") return Object.assign(base, { status: "fail", summary: "A confirmed watchlist match is on file for this case.", lines: s.items.map(i => ({ ok: false, text: `${i.partyName} matches ${i.entryName} (${Math.round(i.score * 100)}%).` })), compliance: true });
  if (s.state === "review_required") {
    const open = s.items.filter(i => !i.review);
    return Object.assign(base, { status: "fail", summary: `${open.length} potential watchlist match${open.length === 1 ? "" : "es"} to clear with Compliance.`, lines: open.map(i => ({ ok: false, text: `${i.partyName} ~ ${i.entryName} (${Math.round(i.score * 100)}%).` })), compliance: true });
  }
  return Object.assign(base, { status: "pass", summary: `${n} part${n === 1 ? "y" : "ies"} screened against ${SANCTIONS_LIST_NAME}; no match.`, lines: latest && latest.parties ? latest.parties.map(p => ({ ok: true, text: `${p.name} (${p.role}): clear.` })) : [] });
}

/** Runs the four checks in order and stores the results on the case. */
function p1RunChecks(sub) {
  const st = p1Store(sub);
  const fns = [p1CheckProducer, p1CheckFein, p1CheckAppetite, p1CheckWatchlist];
  const out = {};
  fns.forEach((fn, i) => {
    try { out[P1_CHECKS[i].key] = fn(sub); }
    catch (e) { console.warn("Phase 1 check failed:", e); out[P1_CHECKS[i].key] = { key: P1_CHECKS[i].key, title: P1_CHECKS[i].title, status: "unable", summary: "The check could not run: " + (e && e.message || e), lines: [] }; }
  });
  st.checks = out; st.ranAt = nowStamp(); st.runs = (st.runs || 0) + 1;
  const o = p1Outcome(sub);
  st.stage = o === "decline" ? "decline" : "review";
  if (o === "decline") { sub.statusText = "Phase 1: Decline recommended"; sub.statusBadge = "badge-danger"; }
  else { sub.statusText = "Phase 1: Awaiting review"; sub.statusBadge = "badge-warning"; }
  p1Log(sub, "phase1_checks", "Phase 1 checks " + (st.runs > 1 ? "re-run" : "run") + ": " + P1_CHECKS.map(c => c.title + " " + { pass: "passed", fail: "FAILED", unable: "could not be completed" }[out[c.key].status]).join("; ") + ".");
  p1Persist();
  return out;
}

/** clear | incomplete | decline */
function p1Outcome(sub) {
  const c = sub.phase1 && sub.phase1.checks;
  if (!c) return "pending";
  const all = P1_CHECKS.map(x => c[x.key]);
  if (all.some(x => x.status === "fail")) return "decline";
  if (all.some(x => x.status === "unable")) return "incomplete";
  return "clear";
}

// ----------------------------------------------------------------------------
// 2. ACTIONS
// ----------------------------------------------------------------------------
/** Who may sign off: the assigned reviewer, and the Head of Underwriting. */
function p1CanAct(sub) {
  const st = sub && sub.phase1;
  if (!st || ["done", "declined"].indexOf(st.stage) > -1) return false;
  return currentUserRole === st.reviewer || canManageAssignments();
}

function p1ReadForm() {
  const v = id => ((document.getElementById(id) || {}).value || "").trim();
  return { channel: v("p1_channel") || "broker", lobKey: v("p1_lob"), insured: v("p1_insured"), fein: v("p1_fein"), state: v("p1_state").toUpperCase(), years: v("p1_years"), broker: v("p1_broker"), email: v("p1_email"), reviewer: v("p1_reviewer") || "admin" };
}

/** Form to case. Used for a new submission and when a reviewer fixes the details after a failed check. */
function p1Submit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const f = p1ReadForm();
  const bad = msg => { showToast(msg, "danger"); return false; };
  if (US_STATE_CODES_FOR_PRODUCER.indexOf(f.state) < 0) return bad("⛔ Choose the state where the customer's business is located.");
  if (f.years === "" || isNaN(Number(f.years)) || Number(f.years) < 0 || Number(f.years) > 500 || Math.floor(Number(f.years)) !== Number(f.years)) return bad("⛔ Enter the years in business as a whole number (0 or more).");
  if (!p1Role(f.reviewer)) return bad("⛔ Choose who will review the results.");
  const existing = P1.editing ? p1Sub() : null;
  const r = createSubmissionRecord(f, existing);
  if (!r.ok) { showToast(r.message, "danger"); return false; }
  const sub = r.sub, st = p1Store(sub);
  sub.operationsProfile = Object.assign({}, sub.operationsProfile, { years_in_business: Number(f.years) });
  sub.riskStateSet = { state: f.state, by: actorLabel(), at: nowStamp() };
  st.reviewer = f.reviewer; st.stage = "received"; st.checks = null;
  if (!existing) {
    sub.statusText = "Phase 1: Received"; sub.statusBadge = "badge-primary";
    p1Log(sub, "phase1_received", `Submission created by ${actorLabel()}: ${sub.insured}, FEIN ${sub.fein}, ${sub.lobName}, ${f.state}${sub.channelType === "broker" ? ", broker " + sub.broker : ", direct"}. Reviewer: ${p1RoleName(f.reviewer)}.`);
  } else {
    p1Log(sub, "phase1_edited", `Details corrected by ${actorLabel()} after the checks; the checks run again. Reviewer: ${p1RoleName(f.reviewer)}.`);
  }
  P1.subId = sub.id; P1.editing = false; P1.draft = ""; P1.form = null;
  if (typeof selectSubmission === "function") selectSubmission(sub.id, false);
  if (f.reviewer !== "admin" && sub.assignedTo !== f.reviewer) assignSubmissionToUser(sub.id, f.reviewer);
  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
  p1Persist();
  p1Go("received");
  return false;
}

function p1Go(step) {
  p1ClearTimers();
  P1.step = step;
  p1Render();
  const sub = p1Sub();
  if (step === "received") {
    P1.timers.push(setTimeout(() => { if (P1.step === "received" && currentPage === "phase1") p1Go("checks"); }, P1_ANIMATE ? 1400 : 0));
  } else if (step === "checks" && sub) {
    p1StartChecks(sub);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function p1StartChecks(sub) {
  p1RunChecks(sub);   // the results are known at once; the screen reveals them in order
  if (!P1_ANIMATE) { p1Go("decision"); return; }
  P1_CHECKS.forEach((c, i) => {
    P1.timers.push(setTimeout(() => { if (P1.step === "checks" && currentPage === "phase1") p1RevealCheck(i); }, P1_REVEAL_MS * (i + 1)));
  });
  P1.timers.push(setTimeout(() => { if (P1.step === "checks" && currentPage === "phase1") p1Go("decision"); }, P1_REVEAL_MS * (P1_CHECKS.length + 1) + 400));
}

function p1RevealCheck(i) {
  const sub = p1Sub(); if (!sub) return;
  const row = document.getElementById("p1_row_" + i); if (!row) return;
  row.outerHTML = p1CheckRow(sub, i, true);
  const next = document.getElementById("p1_row_" + (i + 1));
  if (next) next.classList.add("p1-running");
  const bar = document.getElementById("p1_bar"); if (bar) bar.style.width = Math.round((i + 1) / P1_CHECKS.length * 100) + "%";
}

function p1SkipWait() { p1ClearTimers(); p1Go(P1.step === "received" ? "checks" : "decision"); }

function p1Rerun(silent) {
  const sub = p1Sub(); if (!sub) return;
  p1RunChecks(sub);
  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
  p1Render();
  if (!silent) showToast("Checks run again.", "info");
}

function p1Edit() {
  const sub = p1Sub(); if (!sub || !p1CanAct(sub)) return;
  P1.editing = true;
  P1.form = { channel: sub.channelType, lobKey: sub.lobKey, insured: sub.insured, fein: sub.fein, state: (sub.riskStateSet || {}).state || "", years: (sub.operationsProfile || {}).years_in_business, broker: sub.channelType === "broker" ? sub.broker : "", email: sub.email, reviewer: sub.phase1.reviewer };
  p1Go("create");
}

function p1Cancel() {
  const sub = p1Sub();
  p1ClearTimers();
  if (P1.editing) { P1.editing = false; P1.form = null; p1Go("decision"); return; }
  P1.subId = null;
  showIntakePage();
}

function p1Comment() {
  const el = document.getElementById("p1_comment");
  const v = el ? el.value.trim() : P1.draft.trim();
  P1.draft = el ? el.value : P1.draft;
  return v;
}
function p1CommentOk() {
  const v = p1Comment();
  if (v.length < P1_MIN_COMMENT) { showToast("⛔ Add your comment first (at least " + P1_MIN_COMMENT + " characters): say what you checked and why you decided this way.", "danger"); return null; }
  return v;
}
function p1Draft() { const el = document.getElementById("p1_comment"); if (el) P1.draft = el.value; }

function p1Approve() {
  const sub = p1Sub(); if (!sub) return;
  if (!p1CanAct(sub)) { showToast("⛔ Only the assigned reviewer or the Head of Underwriting can approve this.", "danger"); return; }
  if (p1Outcome(sub) !== "clear") { showToast("⛔ Approval waits until every check has passed.", "danger"); return; }
  const comment = p1CommentOk(); if (comment === null) return;
  const st = sub.phase1;
  st.review = { decision: "approved", by: actorLabel(), role: currentUserRole, at: nowStamp(), comment: comment };
  st.stage = "done";
  sub.statusText = "Phase 1 cleared"; sub.statusBadge = "badge-success";
  p1Log(sub, "phase1_approved", "Phase 1 approved. Reviewer comment: " + comment);
  p1Persist();
  P1.draft = "";
  showToast(`✅ ${sub.id} approved. Opening the workflow.`, "success");
  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
  p1EnterWorkflow(sub.id);
}

/** The first failed check names the reason: duplicate, appetite, or other (licence, watchlist). */
function p1DeclineReason(sub) {
  const c = sub.phase1.checks, failed = P1_CHECKS.map(x => c[x.key]).filter(x => x.status === "fail");
  const first = failed[0] || { key: "other", summary: "Declined by the reviewer." };
  const map = { fein: ["DUPLICATE", "Duplicate FEIN"], appetite: ["APPETITE", "Appetite Knockout"] };
  const m = map[first.key] || ["OTHER", "Other"];
  // The watchlist is never given to the applicant as a reason (adverse-notices.js); the internal record says it plainly.
  return { code: m[0], trigger: m[1], text: failed.map(x => x.title + ": " + x.summary).join(" ") || first.summary };
}

function p1ConfirmDecline() {
  const sub = p1Sub(); if (!sub) return;
  if (!p1CanAct(sub)) { showToast("⛔ Only the assigned reviewer or the Head of Underwriting can decline this.", "danger"); return; }
  const comment = p1CommentOk(); if (comment === null) return;
  const st = sub.phase1, why = p1DeclineReason(sub), actor = actorLabel(), at = nowStamp();
  const failedAny = P1_CHECKS.some(c => st.checks && st.checks[c.key].status === "fail");
  const reasonText = (failedAny ? why.text + " " : "Declined at Phase 1 review. ") + "Reviewer comment: " + comment;
  sub.declinedBy = actor; sub.declineReason = reasonText; sub.declineTriggerPoint = why.trigger;
  p1Log(sub, "declined", "Declined at Phase 1 (" + why.trigger + "). " + reasonText);
  if (typeof outRecord === "function") {
    const r = outRecord(sub, { type: "declined_by_underwriter", reasonCode: why.code, reasonText: reasonText, triggerPoint: why.trigger }, { system: true });
    if (!r.ok) console.warn("Outcome not recorded:", r.errors || r.error);
    else { r.outcome.decidedBy = actor; r.outcome.source = "person"; }
  }
  sub.lifecycleStatus = "declined"; sub.lifecycleStatusAt = Date.now();
  sub.statusText = "Declined"; sub.statusBadge = "badge-danger";
  DECLINE_LOG.unshift({ subId: sub.id, insured: sub.insured, lob: sub.lobName, triggerPoint: why.trigger, reason: reasonText, at: at, apiSourced: !!sub.apiSourced });
  st.review = { decision: "declined", by: actor, role: currentUserRole, at: at, comment: comment };
  st.stage = "declined";
  p1Persist();
  P1.draft = "";
  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
  showToast(`${sub.id} declined and recorded in the Decline Center.`, "info");
  p1Render();
}

function p1EnterWorkflow(id) {
  const open = P1_ORIG_OPEN || window.openCaseAtCurrentStep;
  open(id);
}

function p1OpenDeclineCenter() { showDeclinePage(); if (typeof renderDeclineCenter === "function") renderDeclineCenter(); }

// ----------------------------------------------------------------------------
// 3. NAVIGATION
// ----------------------------------------------------------------------------
function showPhase1Page() {
  currentPage = "phase1";
  resetAllTopLevelPages();
  setPageTitle("New Submission");
  setBreadcrumb([{ label: "FUT", onClick: "showIntakePage()" }, { label: "New Submission" }]);
  const page = document.getElementById("phase1PageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }
  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");
}

/** Start a new submission. */
function openPhase1Flow() {
  if (!canCreateSubmissions()) { showToast("⛔ Only the Head of Underwriting can create or import submissions.", "danger"); return; }
  P1 = { step: "create", subId: null, editing: false, draft: "", form: null, timers: [] };
  showPhase1Page();
  p1Render();
}

/** Resume a submission that Phase 1 has not finished. */
function p1Open(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.phase1) return false;
  P1 = { step: "decision", subId: subId, editing: false, draft: "", form: null, timers: [] };
  if (typeof selectSubmission === "function") selectSubmission(subId, false);
  showPhase1Page();
  p1Go(sub.phase1.checks ? "decision" : "received");
  return true;
}

var P1_ORIG_OPEN = null;
(function p1Install() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.phase1_received = m("Submission Received", "ph-tray-arrow-down", "badge-primary", "outcome-comm");
    AUDIT_ACTION_META.phase1_edited = m("Details Corrected at Phase 1", "ph-pencil-simple", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.phase1_checks = m("Phase 1 Checks Run", "ph-list-checks", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.phase1_approved = m("Phase 1 Approved by Reviewer", "ph-check-circle", "badge-success", "outcome-approve");
  }
  // A case that Phase 1 has not finished opens here, not in the workflow.
  P1_ORIG_OPEN = window.openCaseAtCurrentStep;
  window.openCaseAtCurrentStep = function (id) {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === id);
    if (sub && sub.phase1 && ["done", "declined"].indexOf(sub.phase1.stage) < 0) {
      if (!canSeeAllSubmissions() && !isMyCase(sub)) { showToast(`⛔ ${sub.id} is waiting for review by ${p1RoleName(sub.phase1.reviewer)}.`, "danger"); return; }
      p1Open(id); return;
    }
    return P1_ORIG_OPEN.apply(this, arguments);
  };
  // Loading a registry or watchlist on this page re-runs the checks.
  const origLoad = window.refAfterLoad;
  if (typeof origLoad === "function") {
    window.refAfterLoad = function (kind) {
      const r = origLoad.apply(this, arguments);
      try { if (currentPage === "phase1" && P1.step === "decision" && p1Sub() && p1CanAct(p1Sub())) p1Rerun(true); } catch (e) { console.warn("Phase 1 re-run failed:", e); }
      return r;
    };
  }
})();

// ----------------------------------------------------------------------------
// 4. SCREENS
// ----------------------------------------------------------------------------
var P1_STEPS = [["create", "Create"], ["received", "Received"], ["checks", "Checks"], ["decision", "Review"]];

function p1Stepper(sub) {
  const idx = P1_STEPS.findIndex(s => s[0] === P1.step);
  const declined = sub && p1Outcome(sub) === "decline";
  return `<ol class="p1-stepper" aria-label="Progress">` + P1_STEPS.map((s, i) => {
    const label = s[0] === "decision" && declined ? "Decline" : s[1];
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    return `<li class="${cls}"${i === idx ? ' aria-current="step"' : ""}><span class="p1-dot">${i < idx ? '<i class="ph ph-check"></i>' : i + 1}</span><span>${label}</span></li>`;
  }).join("") + `</ol>`;
}

function p1Render() {
  const root = document.getElementById("phase1Root"); if (!root) return;
  const sub = p1Sub();
  const body = P1.step === "create" ? p1ViewCreate(sub) : P1.step === "received" ? p1ViewReceived(sub) : P1.step === "checks" ? p1ViewChecks(sub) : p1ViewDecision(sub);
  root.innerHTML = `<div class="p1-wrap">${p1Stepper(sub)}${body}</div>`;
  if (P1.step === "create") p1ChannelChanged();
}

function p1Field(label, input, hint) { return `<div class="form-group"><label>${label}</label>${input}${hint ? `<div class="p1-note">${hint}</div>` : ""}</div>`; }

function p1ViewCreate() {
  const f = P1.form || { channel: "broker", lobKey: "trucking", insured: "", fein: "", state: "", years: "", broker: "", email: "", reviewer: "admin" };
  const sel = (v, cur) => v === cur ? " selected" : "";
  const states = US_STATE_CODES_FOR_PRODUCER.map(c => `<option value="${c}"${sel(c, f.state)}>${c}</option>`).join("");
  const lobs = LOB_CATALOG.map(l => `<option value="${l.key}"${sel(l.key, f.lobKey)}>${escHtml(l.name)}</option>`).join("");
  const reviewers = ["admin"].concat(ASSIGNABLE_WORKER_ROLES).map(k => `<option value="${k}"${sel(k, f.reviewer)}>${escHtml(p1RoleName(k))}${k === currentUserRole ? " — me" : ""}</option>`).join("");
  const direct = f.channel === "direct";
  return `<div class="card p1-card"><div class="card-body">
    <h2 class="p1-h">${P1.editing ? "Correct the details" : "New submission"}</h2>
    <p class="p1-sub">${P1.editing ? "Fix what is wrong and save. The checks run again by themselves." : "Fill in the form and submit. The checks start automatically; you do not run anything."}</p>
    <form id="p1_form" onsubmit="return p1Submit(event)">
      <div class="p1-grid">
        ${p1Field("Where did it come from?", `<select class="form-control" id="p1_channel" onchange="p1ChannelChanged()"><option value="broker"${sel("broker", f.channel)}>Broker or agency</option><option value="direct"${sel("direct", f.channel)}>Direct customer</option></select>`)}
        ${p1Field("Line of business", `<select class="form-control" id="p1_lob">${lobs}</select>`)}
        ${p1Field("Named insured", `<input class="form-control" id="p1_insured" value="${escHtml(f.insured)}" placeholder="e.g. Metro Freight Express LLC" required>`)}
        ${p1Field("FEIN", `<input class="form-control" id="p1_fein" value="${escHtml(f.fein)}" placeholder="74-9842109" inputmode="numeric" required>`)}
        ${p1Field("State of the business", `<select class="form-control" id="p1_state" required><option value="">Choose…</option>${states}</select>`)}
        ${p1Field("Years in business", `<input class="form-control" id="p1_years" type="number" min="0" step="1" value="${escHtml(f.years)}" required>`)}
        <div id="p1_broker_group">${p1Field("Broker or agency", `<input class="form-control" id="p1_broker" value="${escHtml(f.broker)}" placeholder="Name as it appears on the licence"${direct ? "" : " required"}>`)}</div>
        ${p1Field("Contact email <span class=\"text-muted\">(optional)</span>", `<input class="form-control" id="p1_email" type="email" value="${escHtml(f.email)}">`)}
        ${p1Field("Who reviews the results?", `<select class="form-control" id="p1_reviewer">${reviewers}</select>`, "This person reads the check results and signs off before the case moves on.")}
      </div>
      <div class="p1-actions">
        <button type="button" class="btn btn-outline" onclick="p1Cancel()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="p1_submit"><i class="ph ph-paper-plane-tilt"></i> ${P1.editing ? "Save and re-run checks" : "Submit"}</button>
      </div>
    </form>
  </div></div>`;
}

function p1ChannelChanged() {
  const ch = (document.getElementById("p1_channel") || {}).value;
  const g = document.getElementById("p1_broker_group"), b = document.getElementById("p1_broker");
  if (g) g.style.display = ch === "direct" ? "none" : "";
  if (b) b.required = ch !== "direct";
}

function p1Summary(sub) {
  const st = sub.phase1 || {};
  const item = (k, v) => `<div><div class="p1-k">${k}</div><div class="p1-v">${escHtml(v)}</div></div>`;
  return `<div class="p1-summary">${item("Insured", sub.insured)}${item("FEIN", sub.fein)}${item("Line of business", sub.lobName)}${item("State", (sub.riskStateSet || {}).state || "—")}${item("Years in business", (sub.operationsProfile || {}).years_in_business)}${item("Source", sub.channelType === "broker" ? sub.broker : "Direct customer")}${item("Reviewer", p1RoleName(st.reviewer))}</div>`;
}

function p1ViewReceived(sub) {
  if (!sub) return "";
  return `<div class="card p1-card"><div class="card-body p1-center">
    <div class="p1-bigicon ok"><i class="ph ph-check-circle"></i></div>
    <h2 class="p1-h">Submission received</h2>
    <div class="p1-id">${escHtml(sub.id)}</div>
    <p class="p1-sub">Four checks now run automatically. You do not need to do anything.</p>
    ${p1Summary(sub)}
    <ol class="p1-next">${P1_CHECKS.map(c => `<li><i class="ph ${c.icon}"></i> ${c.title}</li>`).join("")}</ol>
    <div class="p1-progress"><div class="p1-progress-bar p1-indeterminate"></div></div>
    <button class="btn btn-outline btn-sm" style="width:auto;" onclick="p1SkipWait()">Start now</button>
  </div></div>`;
}

function p1StatusBadge(status) {
  return { pass: '<span class="badge badge-success"><i class="ph ph-check-circle"></i> Passed</span>', fail: '<span class="badge badge-danger"><i class="ph ph-x-circle"></i> Failed</span>', unable: '<span class="badge badge-warning"><i class="ph ph-warning"></i> Could not complete</span>' }[status] || "";
}

function p1CheckRow(sub, i, revealed) {
  const meta = P1_CHECKS[i], res = sub.phase1 && sub.phase1.checks && sub.phase1.checks[meta.key];
  if (!revealed || !res) return `<li class="p1-row${i === 0 ? " p1-running" : ""}" id="p1_row_${i}"><span class="p1-rowicon"><i class="ph ${meta.icon}"></i></span><div class="p1-rowmain"><div class="p1-rowtitle">${meta.title}</div><div class="p1-rowtext">${meta.what}</div></div><span class="p1-wait"><span class="p1-spin"></span></span></li>`;
  return `<li class="p1-row p1-${res.status}" id="p1_row_${i}"><span class="p1-rowicon"><i class="ph ${meta.icon}"></i></span><div class="p1-rowmain"><div class="p1-rowtitle">${meta.title}</div><div class="p1-rowtext">${escHtml(res.summary)}</div></div>${p1StatusBadge(res.status)}</li>`;
}

function p1ViewChecks(sub) {
  if (!sub) return "";
  return `<div class="card p1-card"><div class="card-body">
    <h2 class="p1-h">Running checks</h2>
    <p class="p1-sub">${escHtml(sub.insured)} · ${escHtml(sub.id)} · checked in this order, automatically.</p>
    <div class="p1-progress"><div class="p1-progress-bar" id="p1_bar" style="width:0"></div></div>
    <ul class="p1-rows">${P1_CHECKS.map((c, i) => p1CheckRow(sub, i, false)).join("")}</ul>
    <div class="p1-actions"><button class="btn btn-outline btn-sm" style="width:auto;" onclick="p1SkipWait()">Skip to results</button></div>
  </div></div>`;
}

/** Results of all four checks, with the detail behind each one. */
function p1ResultsHtml(sub) {
  return `<ul class="p1-rows">` + P1_CHECKS.map((meta, i) => {
    const res = sub.phase1.checks[meta.key];
    const lines = (res.lines || []).length ? `<details class="p1-details"><summary>Details</summary><ul>${res.lines.map(l => `<li class="${l.ok ? "" : "bad"}"><i class="ph ${l.ok ? "ph-check" : "ph-x"}"></i> ${escHtml(l.text)}</li>`).join("")}</ul></details>` : "";
    return `<li class="p1-row p1-${res.status}"><span class="p1-rowicon"><i class="ph ${meta.icon}"></i></span><div class="p1-rowmain"><div class="p1-rowtitle">${meta.title}</div><div class="p1-rowtext">${escHtml(res.summary)}</div>${lines}</div>${p1StatusBadge(res.status)}</li>`;
  }).join("") + `</ul>`;
}

function p1ViewDecision(sub) {
  if (!sub || !sub.phase1 || !sub.phase1.checks) return "";
  const st = sub.phase1, o = p1Outcome(sub), final = ["done", "declined"].indexOf(st.stage) > -1, can = p1CanAct(sub);
  const checks = st.checks;
  let banner;
  if (st.stage === "declined") banner = `<div class="p1-banner bad"><i class="ph ph-prohibit"></i><div><strong>Declined.</strong> Recorded in the Decline Center on ${escHtml(st.review.at)} by ${escHtml(st.review.by)}.</div></div>`;
  else if (st.stage === "done") banner = `<div class="p1-banner ok"><i class="ph ph-check-circle"></i><div><strong>Approved</strong> on ${escHtml(st.review.at)} by ${escHtml(st.review.by)}.</div></div>`;
  else if (o === "decline") {
    const failed = P1_CHECKS.filter(c => checks[c.key].status === "fail");
    banner = `<div class="p1-banner bad"><i class="ph ph-prohibit"></i><div><strong>Decline recommended.</strong> ${failed.length === 1 ? "One check" : failed.length + " checks"} failed: ${failed.map(c => c.title.toLowerCase()).join(", ")}. No quote is prepared and nobody outside the company is told until the reviewer confirms.</div></div>`;
  } else if (o === "incomplete") banner = `<div class="p1-banner warn"><i class="ph ph-warning"></i><div><strong>Checks could not be completed.</strong> Load the missing file below (this needs approval rights for that list) and the checks run again by themselves. Approval waits until every check has passed.</div></div>`;
  else banner = `<div class="p1-banner ok"><i class="ph ph-check-circle"></i><div><strong>All four checks passed.</strong> Read the results, add your comment and approve to continue.</div></div>`;

  // missing reference data: load it here, no detour
  let needs = "";
  if (o === "incomplete" && can) {
    const kinds = P1_CHECKS.map(c => checks[c.key].needs).filter(Boolean);
    needs = kinds.map(k => (typeof refPanelHtml === "function" ? refPanelHtml(k) : "")).join("");
  }

  let review = "";
  if (final) {
    review = `<div class="card p1-card"><div class="card-body"><h3 class="p1-h3"><i class="ph ph-chat-text"></i> Reviewer's comment</h3>
      <div class="p1-quote">${escHtml(st.review.comment)}</div><div class="p1-note">${escHtml(st.review.by)} · ${escHtml(st.review.at)}</div>
      <div class="p1-actions">${st.stage === "declined" ? `<button class="btn btn-outline" onclick="p1OpenDeclineCenter()"><i class="ph ph-prohibit"></i> Open Decline Center</button>` : `<button class="btn btn-primary" onclick="p1EnterWorkflow('${sub.id}')">Open workflow</button>`}<button class="btn btn-outline" onclick="showIntakePage()">Back to queue</button></div>
    </div></div>`;
  } else {
    const who = p1RoleName(st.reviewer);
    const dis = can ? "" : " disabled";
    const approve = o === "clear" ? `<button class="btn btn-primary" onclick="p1Approve()"${dis}><i class="ph ph-check"></i> Approve and continue</button>` : "";
    const fix = o === "decline" ? `<button class="btn btn-outline" onclick="p1Edit()"${dis}><i class="ph ph-pencil-simple"></i> Correct details and re-run</button>` : "";
    const rerun = o === "incomplete" ? `<button class="btn btn-primary" onclick="p1Rerun()"${dis}><i class="ph ph-arrows-clockwise"></i> Re-run checks</button>` : "";
    const decline = o === "decline" ? `<button class="btn btn-danger" onclick="p1ConfirmDecline()"${dis}><i class="ph ph-prohibit"></i> Confirm decline</button>` : `<button class="btn btn-outline-danger" onclick="p1ConfirmDecline()"${dis}><i class="ph ph-prohibit"></i> Decline instead</button>`;
    const hint = o === "decline" ? "Say what you checked and why you are confirming the decline. If a detail was mistyped, correct it instead." : o === "clear" ? "Say what you reviewed and why you are approving." : "Add a note for the file. You can decline now or wait for the missing data.";
    review = `<div class="card p1-card"><div class="card-body"><h3 class="p1-h3"><i class="ph ph-user-check"></i> Human review</h3>
      <p class="p1-sub" style="margin-bottom:8px;">Reviewer: <strong>${escHtml(who)}</strong>${can ? "" : ` · you are signed in as ${escHtml(p1RoleName(currentUserRole))}, so this is read-only. Switch to the reviewer to sign off.`}</p>
      <label class="p1-label" for="p1_comment">Your comment <span class="text-muted">(required)</span></label>
      <textarea id="p1_comment" class="form-control" rows="3" placeholder="${escHtml(hint)}" oninput="p1Draft()"${dis}>${escHtml(P1.draft)}</textarea>
      <div class="p1-actions">${approve}${rerun}${fix}${decline}</div>
    </div></div>`;
  }

  return `<div class="p1-head"><div><h2 class="p1-h" style="margin:0;">${escHtml(sub.insured)}</h2><div class="p1-id">${escHtml(sub.id)}</div></div></div>
    ${banner}
    <div class="card p1-card"><div class="card-body">${p1Summary(sub)}<h3 class="p1-h3" style="margin-top:16px;"><i class="ph ph-list-checks"></i> Check results</h3>${p1ResultsHtml(sub)}<div class="p1-note">Run ${st.runs} time${st.runs === 1 ? "" : "s"}, last at ${escHtml(st.ranAt)}.</div></div></div>
    ${needs}
    ${review}`;
}
