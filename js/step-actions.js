/**
 * ============================================================================
 * STEP ACTIONS: WHAT NEEDS YOU AT CONFIRM, AND WHAT TO DO WITH A MESSAGE AT TRIAGE
 * ----------------------------------------------------------------------------
 * CONFIRM (Step 4). The review lists nine fields; most were read cleanly. A field is ACCEPTED when it has a value, was not
 * read with low confidence, does not disagree with another document and is not named by a validation message. Everything else
 * NEEDS YOU: blank, low confidence, in conflict, or flagged. The review opens with the accepted fields folded away and a bar
 * that says how many need a person; "Show all fields" opens them. Folded fields are still applied when the person confirms,
 * and a field a person has edited stays in view.
 *
 * TRIAGE (Step 2). Each kind of message gets the action that goes with it:
 *   follow-up to an open case, or the same producer sending the same insured again  -> attach it to that case (the new case is closed as merged)
 *   renewal                                                                          -> open the renewal pipeline, or treat it as new business
 *   change to an existing policy                                                     -> attach it to that policy's case and open Policy Changes
 *   not an insurance submission                                                      -> discard it, with a reason
 * Nothing is deleted. A merged or discarded case stays in the queue with its status and its log.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. CONFIRM: ONLY WHAT NEEDS YOU
// ----------------------------------------------------------------------------
var CONFIRM_SHOW_ALL = false;
const CONFIRM_FIELD_NOTES = { fein: /FEIN/i, dot: /\bDOT\b/i, email: /e-?mail/i, exposureVal: /limit/i, effectiveDate: /effective|date/i, expirationDate: /expiration|date/i };

/** Why a field needs a person, or "" when it can be accepted. */
function confirmFieldIssue(key, draft, value) {
  const blank = value === null || value === undefined || String(value).trim() === "" || (typeof wsIsPlaceholder === "function" && wsIsPlaceholder(value));
  if (blank) return "not found";
  if (draft.fields_confidence && draft.fields_confidence[key] === "low") return "read with low confidence";
  if ((draft.conflicts || []).some(c => c.field === key)) return "documents disagree";
  const re = CONFIRM_FIELD_NOTES[key];
  if (re && (draft.validation || []).some(v => re.test(v.text))) return "flagged by a check";
  return "";
}

function confirmApplyView(subId) {
  const box = document.getElementById("emailDigestReviewContainer");
  const draft = (typeof emailIngestionDraftBySubId !== "undefined") ? emailIngestionDraftBySubId[subId] : null;
  if (!box || !draft) return;
  const rows = Array.from(box.querySelectorAll(".email-digest-field-row")).filter(r => r.querySelector("input[id^='normField_']") && r.closest(".email-digest-field-grid"));
  let need = 0, ok = 0;
  const reasons = [];
  rows.forEach(r => {
    const input = r.querySelector("input[id^='normField_']"), key = input.id.replace("normField_", "");
    const edited = input.value !== input.getAttribute("data-original-value");
    const issue = confirmFieldIssue(key, draft, input.value);
    const accepted = !issue || (edited && !issue.startsWith("not found"));
    r.classList.toggle("ws-accepted", accepted && !edited);
    r.setAttribute("data-issue", issue);
    if (accepted && !edited) ok++; else { need++; if (issue) reasons.push((typeof DI_FIELD_LABELS !== "undefined" && DI_FIELD_LABELS[key]) || key); }
    r.classList.toggle("ws-accepted-hidden", accepted && !edited && !CONFIRM_SHOW_ALL);
  });
  box.querySelectorAll(".email-digest-field-grid").forEach(g => {
    const sec = g.closest(".email-digest-section");
    if (sec) sec.classList.toggle("ws-accepted-hidden", !CONFIRM_SHOW_ALL && Array.from(g.querySelectorAll(".email-digest-field-row")).every(r => r.classList.contains("ws-accepted-hidden")));
  });
  let bar = document.getElementById("confirmExceptionBar");
  const first = box.querySelector(".email-digest-field-grid");
  const anchor = first ? first.closest(".email-digest-section") : null;
  if (!bar && anchor) { bar = document.createElement("div"); bar.id = "confirmExceptionBar"; anchor.parentNode.insertBefore(bar, anchor); }
  if (!bar) return;
  bar.className = "alert " + (need ? "alert-warning" : "alert-success");
  bar.style.cssText = "display:flex; justify-content:space-between; align-items:center; gap:10px; margin:10px 0;";
  bar.innerHTML = `<span><i class="ph ph-list-checks"></i> <strong>${need} field${need === 1 ? "" : "s"} need${need === 1 ? "s" : ""} you</strong>${reasons.length ? " (" + reasons.map(wsEsc).join(", ") + ")" : ""}. ${ok} accepted: each has a value, was read without low confidence, and no document disagrees. Accepted fields are applied when you confirm.</span>
    <button type="button" class="btn btn-outline btn-sm" onclick="toggleAcceptedFields()">${CONFIRM_SHOW_ALL ? "Show only what needs me" : "Show all " + rows.length + " fields"}</button>`;
}
function toggleAcceptedFields() {
  CONFIRM_SHOW_ALL = !CONFIRM_SHOW_ALL;
  const sub = wsSub(); if (sub) confirmApplyView(sub.id);
}

(function confirmWire() {
  const orig = window.renderNormalizationReview;
  if (typeof orig === "function") {
    window.renderNormalizationReview = function (subId, draft) {
      const r = orig.apply(this, arguments);
      try { confirmApplyView(subId); } catch (e) { console.warn("Confirm view failed:", e); }
      return r;
    };
  }
})();

// ----------------------------------------------------------------------------
// 2. TRIAGE ACTIONS
// ----------------------------------------------------------------------------
function triageCanAct() {
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return false; }
  return true;
}

/** A case another case may be attached to: not merged, discarded, declined or itself. */
function triageTargetOk(target, from) { return !!target && target.id !== from.id && !["declined", "merged", "discarded"].includes(target.lifecycleStatus); }

/** The case holding a policy number named in a message. */
function triagePolicyCase(sub) {
  const text = String(sub.rawEmailText || "");
  const m = /\bpolic(?:y|ies)\s*(?:no\.?|number|#)\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/i.exec(text) || /\b([A-Z]{2,5}-\d{4}-\d{3,})\b/.exec(text);
  if (!m) return null;
  const no = m[1].toUpperCase();
  return SUBMISSIONS_DATASET.find(s => s.id !== sub.id && s.pasSync && s.pasSync.policyNumber && String(s.pasSync.policyNumber).toUpperCase() === no) || null;
}

/** Puts this message's email and files on another case, and closes this one as merged into it. */
function triageAttachTo(targetId, opts) {
  const sub = wsSub(); const target = SUBMISSIONS_DATASET.find(s => s.id === targetId);
  if (!sub || !triageTargetOk(target, sub)) { showToast("⛔ That case cannot take this message.", "danger"); return false; }
  if (!triageCanAct()) return false;
  const files = sub.rawAttachments || [];
  if (!target.rawAttachments) target.rawAttachments = [];
  let added = 0;
  files.forEach(f => { if (!target.rawAttachments.some(x => x.name === f.name && x.size === f.size)) { target.rawAttachments.push(JSON.parse(JSON.stringify(f))); added++; } });
  if (!target.docs) target.docs = [];
  files.forEach(f => { if (!target.docs.some(d => d.name === f.name)) target.docs.push({ name: f.name, type: f.type === "application/pdf" ? "pdf" : "xls", desc: "Raw Upload: attached from " + sub.id + " • Unprocessed" }); });
  if (!target.followUpEmails) target.followUpEmails = [];
  target.followUpEmails.push({ fromCase: sub.id, at: wsNow(), by: wsActor(), text: sub.rawEmailText || "", files: files.map(f => f.name) });
  // the documents are read again the next time the case needs them
  if (typeof emailIngestionDraftBySubId !== "undefined") delete emailIngestionDraftBySubId[target.id];
  target.documentExtractions = (target.documentExtractions || []).filter(d => files.every(f => f.name !== d.name));
  if (target.normalizationStatus === "normalized") target.newDocumentsPending = true;
  wsLog(target, "triage_message_attached", "A message received as " + sub.id + " was attached: " + added + " new file(s)" + (sub.rawEmailText ? " and its email text" : "") + "." + (opts && opts.note ? " " + opts.note : ""));
  sub.lifecycleStatus = "merged"; sub.lifecycleStatusAt = Date.now(); sub.mergedInto = target.id;
  sub.statusText = "Merged into " + target.id; sub.statusBadge = "badge-light";
  wsLog(sub, "triage_merged", "Closed as merged into " + target.id + ((opts && opts.note) ? ". " + opts.note : "."));
  wsPersist();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
  if (typeof notify === "function" && target.assignedTo) notify(target.assignedTo, { title: "New documents on " + target.id, text: added + " file(s) arrived by email for " + target.insured + ".", caseId: target.id, kind: "documents" });
  showToast("✅ Attached to " + target.id + " (" + added + " new file(s)). " + sub.id + " is closed as merged.", "success");
  return true;
}

/** A message about an existing policy: attach it to that policy's case and open Policy Changes there. */
function triageOpenPolicy() {
  const sub = wsSub(); if (!sub) return;
  const target = triagePolicyCase(sub);
  if (!target) { showToast("⛔ No bound policy in this system matches the policy number in the message.", "danger"); return; }
  const id = target.id;
  if (!triageAttachTo(id, { note: "Change request for policy " + target.pasSync.policyNumber + "." })) return;
  selectSubmission(id, false); showWorkflowPage(BIND_STEP);
}

function triageOpenRenewals() {
  quoteIntelActiveTab = "pipeline"; showQuoteIntelligencePage();
  showToast("The renewal pipeline lists bound policies by expiry date. Find the policy there and start its renewal.", "info");
}

/** The message is a new risk after all (a renewal of a policy this system does not hold, say). */
function triageTreatAsNew() {
  const sub = wsSub(); if (!sub) return;
  if (!triageCanAct()) return;
  sub.triage = Object.assign({}, sub.triage, { kindOverride: "new_submission", overriddenBy: wsActor(), overriddenAt: wsNow() });
  wsLog(sub, "triage_override", "Triage kind set to new submission by a person (the message read as " + (TRIAGE_KINDS[triageClassify(Object.assign({}, sub, { triage: {} })).kind] || {}).label + ").");
  wsPersist(); renderTriageCard(sub);
}

function triageDiscard() {
  const sub = wsSub(); if (!sub) return;
  if (!triageCanAct()) return;
  const why = ((document.getElementById("triageDiscardWhy") || {}).value || "").trim();
  if (why.length < 10) { showToast("⛔ Say why this is not a submission (at least 10 characters).", "danger"); return; }
  sub.lifecycleStatus = "discarded"; sub.lifecycleStatusAt = Date.now(); sub.discardReason = why;
  sub.statusText = "Discarded: not a submission"; sub.statusBadge = "badge-light";
  wsLog(sub, "triage_discarded", "Discarded as not an insurance submission: " + why);
  wsPersist();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
  showToast("🗑️ " + sub.id + " discarded. It stays in the queue with its reason and its log.", "info");
  showIntakePage();
}

/** The buttons for the kind of message the case is. Returns HTML. */
function triageActionsHtml(sub, cls) {
  if (["merged", "discarded"].includes(sub.lifecycleStatus)) return `<div class="alert alert-info ws-small"><i class="ph ph-check"></i> ${wsEsc(sub.statusText)}.</div>`;
  const btn = (fn, icon, label, primary) => `<button class="btn ${primary ? "btn-primary" : "btn-outline"} btn-sm" onclick="${fn}"><i class="ph ${icon}"></i> ${label}</button>`;
  const dup = typeof findDuplicateSubmission === "function" ? findDuplicateSubmission(sub.insured, sub.fein, sub.id) : null;
  const sameProducer = dup && String(dup.broker || "").toLowerCase() === String(sub.broker || "").toLowerCase();
  const out = [];
  if (cls.kind === "followup" && cls.ref) out.push(btn(`triageAttachTo('${cls.ref}')`, "ph-paperclip", "Attach to " + cls.ref, true));
  if (cls.kind === "endorsement") { const t = triagePolicyCase(sub); out.push(t ? btn("triageOpenPolicy()", "ph-file-text", "Attach to policy " + t.pasSync.policyNumber + " and open Policy Changes", true) : `<span class="ws-small text-muted">No bound policy here matches the policy number in the message.</span>`); }
  if (cls.kind === "renewal") { out.push(btn("triageOpenRenewals()", "ph-arrows-clockwise", "Open the renewal pipeline", true)); out.push(btn("triageTreatAsNew()", "ph-file-plus", "Treat as new business")); }
  if (cls.kind === "not_insurance") out.push(`<input id="triageDiscardWhy" class="form-control" style="width:340px;" placeholder="Why this is not a submission (10+ characters)">` + btn("triageDiscard()", "ph-trash", "Discard", true));
  if (cls.kind !== "followup" && sameProducer && dup && triageTargetOk(dup, sub)) out.push(btn(`triageAttachTo('${dup.id}')`, "ph-paperclip", "Same producer, same insured: attach to " + dup.id));
  return out.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px;">${out.join("")}</div>` : "";
}

(function triageActionsWire() {
  // the triage card gains its actions, and honours a person's override of the kind
  const origClassify = window.triageClassify;
  window.triageClassify = function (sub) {
    if (sub && sub.triage && sub.triage.kindOverride) return { kind: sub.triage.kindOverride, reasons: ["Set by " + (sub.triage.overriddenBy || "a person") + " on " + (sub.triage.overriddenAt || "") + "."] };
    return origClassify.apply(this, arguments);
  };
  const origCard = window.renderTriageCard;
  window.renderTriageCard = function (sub) {
    const r = origCard.apply(this, arguments);
    try {
      const box = document.getElementById("triageContainer");
      const body = box && box.querySelector(".card-body");
      if (body && sub) body.insertAdjacentHTML("beforeend", triageActionsHtml(sub, triageClassify(sub)));
    } catch (e) { console.warn("Triage actions failed:", e); }
    return r;
  };
  registerStepRenderer("triage", window.renderTriageCard);
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.triage_message_attached = { label: "Message Attached To This Case", icon: "ph-paperclip", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.triage_merged = { label: "Closed As Merged", icon: "ph-git-merge", badge: "badge-light", outcome: "outcome-comm" };
    AUDIT_ACTION_META.triage_override = { label: "Triage Kind Changed By A Person", icon: "ph-pencil-simple", badge: "badge-light", outcome: "outcome-comm" };
    AUDIT_ACTION_META.triage_discarded = { label: "Discarded: Not A Submission", icon: "ph-trash", badge: "badge-light", outcome: "outcome-decline" };
  }
})();

window.confirmApplyView = confirmApplyView; window.toggleAcceptedFields = toggleAcceptedFields; window.confirmFieldIssue = confirmFieldIssue;
window.triageAttachTo = triageAttachTo; window.triageOpenPolicy = triageOpenPolicy; window.triageOpenRenewals = triageOpenRenewals;
window.triageTreatAsNew = triageTreatAsNew; window.triageDiscard = triageDiscard; window.triagePolicyCase = triagePolicyCase;
