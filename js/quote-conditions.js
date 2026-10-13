/**
 * ============================================================================
 * QUOTE CONDITIONS (Add-On): Notice Studio popup > Quote Condition
 * ----------------------------------------------------------------------------
 * A quote condition is used when the insured has not yet met something needed for
 * a coverage but promises to meet it by a date. The underwriter writes the
 * condition and the deadline into a Quote Condition document, the insured signs it,
 * and then:
 *
 *   met on time      the coverage is added to the quote and the premium is updated
 *   not met on time  the coverage is NOT added and the premium is unchanged
 *   more time asked  the deadline can be extended; every version is kept with the
 *                    old deadline, the new deadline and what else changed
 *
 * Each condition carries a chat between the underwriter and the broker. The broker
 * has no login in this prototype, so the underwriter records the broker's replies
 * (including the insured's response, which the broker relays) in the same thread.
 *
 * An appetite rule in the ingested product can offer one (its onFail block). Example, PRD-021
 * "Dashcam Required": Own Damage is provided only if the vehicle has a dashcam. For a unit without
 * one, the card suggests a Quote Condition to install it by a date. Creating it withholds the
 * coverage from the quote; if the dashcam is in by the deadline the coverage comes back and the
 * premium is updated, otherwise the coverage stays out and the premium is unchanged.
 *
 * This is not a subjectivity. A subjectivity is a term of the quote that must be
 * satisfied before the policy binds (subjectivities.js). A quote condition decides
 * whether an extra coverage is added at all; the quote and bind go ahead without it.
 *
 * Status:  draft -> issued (sent, awaiting signature) -> signed -> met
 *                                  \-> lapsed (deadline passed) or withdrawn
 * Permission (resource "quoteConditions"): edit = draft, issue, record the
 * signature, chat, withdraw, extend; approve = confirm the condition was met
 * (adds the coverage and the premium).
 * ============================================================================
 */

var QC_MAX_DEADLINE_DAYS = 180;   // furthest deadline allowed from today; a prototype default for Underwriting to confirm
var QC_MAX_MESSAGE = 2000;
var QC_PREFILL = null;            // values copied from an appetite rule into the new-condition form
var QC_OPEN = {};                 // which <details> are open, kept across redraws
var QC_FORM_OPEN = false;

var QC_COVERAGE_SUGGESTIONS = {
  trucking: ["Physical Damage", "Motor Truck Cargo", "Trailer Interchange", "Non-Owned Trailer", "Hired Auto Physical Damage", "General Liability"],
  property: ["Business Income", "Equipment Breakdown", "Flood", "Earthquake", "Ordinance or Law", "Spoilage"],
  mpl: ["Cyber Liability Extension", "Regulatory Defense", "Prior Acts Coverage", "Disciplinary Proceedings"],
  gl_cpc: ["Pollution Liability", "Professional Liability Endorsement", "Inland Marine", "Contractors Equipment"],
  gl_cas: ["Pollution Legal Liability", "Products Recall", "Excess Liability"]
};

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function qcPad(n) { return n < 10 ? "0" + n : String(n); }
function qcToday() { const d = new Date(); return d.getFullYear() + "-" + qcPad(d.getMonth() + 1) + "-" + qcPad(d.getDate()); }
function qcAddDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + qcPad(d.getMonth() + 1) + "-" + qcPad(d.getDate()); }
function qcDaysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 86400000); }
function qcValidIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T00:00:00")); }
function qcMoney(n) { return "$" + Number(n || 0).toLocaleString("en-US"); }
function qcEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function qcNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function qcActor() { const r = USER_ROLES_CONFIG[currentUserRole]; return r ? `${r.name} (${r.title})` : "Unknown user"; }

function qcSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
/** The Quote Condition card lives in the Notice Studio popup, which can be open on a submission other than the active one (Decline Center); the popup's submission wins. */
function qcActiveSub() {
  if (typeof noticeStudio !== "undefined" && noticeStudio && noticeStudio.subId && document.getElementById("quoteConditionContainer")) return qcSub(noticeStudio.subId);
  return qcSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null);
}
function qcStore(sub) { if (!Array.isArray(sub.quoteConditions)) sub.quoteConditions = []; return sub.quoteConditions; }
function qcFind(sub, id) { return qcStore(sub).find(c => c.id === id) || null; }
function qcIsFinal(c) { return c.status === "met" || c.status === "lapsed" || c.status === "withdrawn"; }

/** Premium added by coverages whose conditions were met. Rating (re)imports add this to the base premium. */
function qcMetPremium(sub) {
  return (sub.quoteConditions || []).filter(c => c.status === "met" && c.outcome && c.outcome.coverageAdded).reduce((s, c) => s + (Number(c.premium) || 0), 0);
}

/** What changed between two versions of a condition, as [{ field, from, to }]. */
function qcDiff(prev, next) {
  const out = [];
  const add = (field, from, to) => { if (String(from) !== String(to)) out.push({ field: field, from: from, to: to }); };
  add("Deadline", prev.deadline, next.deadline);
  add("Condition", prev.condition, next.condition);
  add("Additional premium", qcMoney(prev.premium), qcMoney(next.premium));
  return out;
}

function qcCurrentVersion(c) { return c.versions[c.versions.length - 1]; }

// ----------------------------------------------------------------------------
// 1b. SUGGESTIONS FROM APPETITE RULES
// ----------------------------------------------------------------------------
/** Appetite rules the case does not meet and the product offers a Quote Condition for, grouped by rule, unless one is already open for it. */
function qcSuggestions(sub) {
  const groups = {};
  (sub.appetiteRules || []).forEach(r => {
    if (r.pass || r.manualPassOverride || !r.onFail || r.onFail.offer !== "quoteCondition") return;
    const g = groups[r.family || r.id] || (groups[r.family || r.id] = { family: r.family || r.id, ruleName: String(r.name || "").split(" — ")[0], onFail: r.onFail, cover: r.cover, rules: [] });
    g.rules.push(r);
  });
  return Object.keys(groups).map(k => groups[k]).filter(g => !qcStore(sub).some(c => !qcIsFinal(c) && c.rule && c.rule.family === g.family));
}

function qcCoverageDefinition(name) {
  const p = window.ACTIVE_INSURANCE_PRODUCT || null;
  const list = (p && p.studios && p.studios.coverage) || [];
  return list.filter(c => String(c.name).toLowerCase() === String(name).toLowerCase())[0] || null;
}

/** Fills the new-condition form from a suggestion; the underwriter checks every value and creates it. */
function qcPrefill(family) {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "edit")) { denyPermission("quoteConditions", "edit"); return; }
  const g = qcSuggestions(sub).filter(x => x.family === family)[0]; if (!g) return;
  const covName = g.onFail.coverage || g.cover;
  const def = qcCoverageDefinition(covName), row = (sub.coverageRows || []).filter(r => String(r.line).toLowerCase() === String(covName).toLowerCase())[0];
  const money = v => { const n = parseFloat(String(v || "").replace(/[^0-9.]/g, "")); return isNaN(n) ? "" : qcMoney(n); };
  const units = g.rules.map(r => String(r.name).split(" — ")[1]).filter(Boolean);
  QC_PREFILL = {
    family: g.family, ruleName: g.ruleName, ruleIds: g.rules.map(r => r.id), vehicleIndexes: g.rules.map(r => r.vehicleIndex), field: g.onFail.field || null,
    line: covName, limit: row ? row.limit : money(def && (def.maxSingleLimit || def.sumInsured)), ded: row ? row.ded : (def && def.deductibleAmount ? money(def.deductibleAmount) : ""),
    premium: row && row.premVal ? String(row.premVal) : "", deadline: qcAddDays(qcToday(), g.onFail.defaultDays || 30),
    condition: `${g.onFail.condition || "Meet the " + g.ruleName + " requirement"} Units affected: ${units.join("; ")}.`
  };
  QC_FORM_OPEN = true; qcRender(sub);
  showToast(`Quote Condition prefilled from "${g.ruleName}". Check the premium and the deadline, then create it.`, "info");
}

/**
 * What the quote, the binder and the final JSON say about conditions: those still open (the coverage is NOT included and NOT bound)
 * and those met (the coverage is included, with its premium).
 */
function qcDocSummary(sub) {
  const pick = c => ({ id: c.id, coverage: c.coverage.line, limit: c.coverage.limit, deductible: c.coverage.ded, premium: c.premium, deadline: c.deadline, condition: c.condition, status: c.status, version: c.versions.length, signedBy: c.signature ? c.signature.signedBy : null });
  const list = qcStore(sub);
  return {
    pending: list.filter(c => c.status === "issued" || c.status === "signed").map(pick),
    added: list.filter(c => c.status === "met").map(c => Object.assign(pick(c), { metOn: c.outcome && c.outcome.metOn, evidence: c.outcome && c.outcome.evidence })),
    notAdded: list.filter(c => c.status === "lapsed" || c.status === "withdrawn").map(c => Object.assign(pick(c), { outcome: c.status }))
  };
}

// ----------------------------------------------------------------------------
// 2. LOG, PERSIST, CHAT
// ----------------------------------------------------------------------------
function qcLog(sub, decision, notes, by) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 2, decision: decision, by: by || qcActor(), at: qcNow(), notes: notes });
}
function qcPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function qcSystemMessage(c, text, by) {
  c.messages.push({ id: "M-" + (c.messages.length + 1), kind: "system", from: "system", name: "Record", text: text, at: qcNow(), recordedBy: by || qcActor() });
}

// ----------------------------------------------------------------------------
// 3. DEADLINE SWEEP: a condition not met by its deadline lapses; nothing is added
// ----------------------------------------------------------------------------
function qcSweep(sub) {
  const today = qcToday(); let changed = false;
  qcStore(sub).forEach(c => {
    if ((c.status === "issued" || c.status === "signed") && c.deadline < today) {
      const before = qcPremiumNow(sub);
      c.status = "lapsed";
      c.outcome = { kind: "lapsed", at: qcNow(), by: "System (deadline passed)", note: "The deadline passed without the condition being confirmed as met.", coverageAdded: false, premiumBefore: before, premiumAfter: before };
      qcSystemMessage(c, `The deadline of ${c.deadline} passed without the condition being met. The coverage was not added and the premium is unchanged${before !== null ? " (" + qcMoney(before) + ")" : ""}.`, "System");
      qcLog(sub, "qc_lapsed", `${c.id} (${c.coverage.line}): deadline ${c.deadline} passed; coverage not added, premium unchanged.`, "System (deadline passed)");
      changed = true;
    }
  });
  if (changed) qcPersist();
  return changed;
}

function qcPremiumNow(sub) { return sub.discretionaryPricing && sub.discretionaryPricing.finalPremium !== undefined ? sub.discretionaryPricing.finalPremium : null; }

// ----------------------------------------------------------------------------
// 4. ACTIONS
// ----------------------------------------------------------------------------
function qcField(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function qcFail(msg) { showToast("⛔ " + msg, "danger"); return false; }

function qcToggleForm() { QC_FORM_OPEN = !QC_FORM_OPEN; const s = qcActiveSub(); if (s) qcRender(s); }
function qcToggle(key, open) { QC_OPEN[key] = !!open; }

function qcCreate() {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "edit")) { denyPermission("quoteConditions", "edit"); return; }
  const line = qcField("qc_cov_line"), limit = qcField("qc_cov_limit"), ded = qcField("qc_cov_ded"), condition = qcField("qc_condition"), deadline = qcField("qc_deadline");
  const premium = parseFloat(qcField("qc_premium").replace(/[^0-9.]/g, ""));
  if (!line) return qcFail("Name the coverage that would be added.");
  if (condition.length < 10) return qcFail("Describe the condition (at least 10 characters).");
  if (!(premium > 0)) return qcFail("Enter the additional annual premium for this coverage (more than $0).");
  if (!qcValidIso(deadline)) return qcFail("Choose the deadline date.");
  const today = qcToday();
  if (deadline < today) return qcFail("The deadline cannot be in the past.");
  if (qcDaysBetween(today, deadline) > QC_MAX_DEADLINE_DAYS) return qcFail(`The deadline cannot be more than ${QC_MAX_DEADLINE_DAYS} days from today.`);
  const store = qcStore(sub);
  const c = {
    id: "QC-" + (store.length + 1), coverage: { line: line, limit: limit || "As quoted", ded: ded || "As quoted" }, condition: condition, premium: Math.round(premium), deadline: deadline,
    status: "draft", createdBy: qcActor(), createdAt: qcNow(), versions: [], messages: [], signature: null, outcome: null
  };
  if (QC_PREFILL && QC_PREFILL.line.toLowerCase() === line.toLowerCase()) {
    c.rule = { family: QC_PREFILL.family, name: QC_PREFILL.ruleName, ruleIds: QC_PREFILL.ruleIds, vehicleIndexes: QC_PREFILL.vehicleIndexes, field: QC_PREFILL.field };
    // The coverage is not provided while the rule is unmet: take it out of the quote and keep it, so it can come back.
    const at = (sub.coverageRows || []).findIndex(r => String(r.line).toLowerCase() === line.toLowerCase() && !r.viaQuoteCondition);
    if (at >= 0) { c.withheldRow = sub.coverageRows.splice(at, 1)[0]; }
  }
  QC_PREFILL = null;
  c.versions.push({ version: 1, kind: "created", condition: condition, coverage: Object.assign({}, c.coverage), premium: c.premium, deadline: deadline, changes: [], reason: "", by: c.createdBy, at: c.createdAt });
  qcSystemMessage(c, `Quote Condition ${c.id} drafted: ${line}; deadline ${deadline}.${c.rule ? ` Raised from the appetite rule "${c.rule.name}"; ${line} is withheld from the quote until the condition is met.` : ""}`);
  store.push(c);
  qcLog(sub, "qc_created", `${c.id}: add ${line} (${qcMoney(c.premium)} additional premium) if the insured meets the condition by ${deadline}: ${condition}`);
  QC_FORM_OPEN = false; QC_OPEN[c.id + ":doc"] = true;
  qcPersist(); qcRender(sub);
  showToast(`${c.id} drafted. Issue it so the insured can sign.`, "success");
}

function qcIssue(id) {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "edit")) { denyPermission("quoteConditions", "edit"); return; }
  const c = qcFind(sub, id); if (!c || c.status !== "draft") return;
  if (c.deadline < qcToday()) return qcFail("The deadline has passed. Withdraw this draft and create a new condition.");
  c.status = "issued"; c.issuedAt = qcNow(); c.issuedBy = qcActor();
  qcSystemMessage(c, `Version ${qcCurrentVersion(c).version} issued for the insured's signature (deadline ${c.deadline}). Download the document and send it to the broker.`);
  qcLog(sub, "qc_issued", `${c.id} version ${qcCurrentVersion(c).version} issued for signature; deadline ${c.deadline}.`);
  qcPersist(); qcRender(sub);
  showToast(`${c.id} issued. Send the document to the broker for the insured to sign.`, "success");
}

function qcRecordSignature(id) {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "edit")) { denyPermission("quoteConditions", "edit"); return; }
  const c = qcFind(sub, id); if (!c || c.status !== "issued") return;
  const name = qcField("qc_sig_name_" + id), on = qcField("qc_sig_date_" + id), ref = qcField("qc_sig_ref_" + id);
  if (name.length < 3) return qcFail("Enter the name of the person who signed for the insured.");
  if (!qcValidIso(on) || on > qcToday()) return qcFail("Enter the date it was signed (today or earlier).");
  if (ref.length < 3) return qcFail("Enter where the signed copy is held (for example the email or document reference).");
  c.signature = { version: qcCurrentVersion(c).version, signedBy: name, signedOn: on, reference: ref, recordedBy: qcActor(), recordedAt: qcNow() };
  c.status = "signed";
  qcSystemMessage(c, `Signed copy of version ${c.signature.version} received (signed by ${name} on ${on}; ${ref}).`);
  qcLog(sub, "qc_signed", `${c.id} version ${c.signature.version} signed by ${name} on ${on} (${ref}).`);
  qcPersist(); qcRender(sub);
  showToast(`${c.id} signed by the insured.`, "success");
}

/** Extend the deadline (optionally also changing the condition text or the premium); the new version replaces the signed one and needs signing again. */
function qcExtend(id) {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "edit")) { denyPermission("quoteConditions", "edit"); return; }
  const c = qcFind(sub, id); if (!c || (c.status !== "issued" && c.status !== "signed")) return;
  const newDeadline = qcField("qc_ext_date_" + id), reason = qcField("qc_ext_reason_" + id), newCondition = qcField("qc_ext_cond_" + id) || c.condition;
  const premRaw = qcField("qc_ext_prem_" + id);
  const newPremium = premRaw ? Math.round(parseFloat(premRaw.replace(/[^0-9.]/g, ""))) : c.premium;
  const today = qcToday();
  if (!qcValidIso(newDeadline)) return qcFail("Choose the new deadline.");
  if (newDeadline <= c.deadline) return qcFail(`The new deadline must be later than the current deadline (${c.deadline}).`);
  if (qcDaysBetween(today, newDeadline) > QC_MAX_DEADLINE_DAYS) return qcFail(`The new deadline cannot be more than ${QC_MAX_DEADLINE_DAYS} days from today.`);
  if (reason.length < 10) return qcFail("Record why more time was asked for and who asked (at least 10 characters).");
  if (newCondition.length < 10) return qcFail("The condition text must be at least 10 characters.");
  if (!(newPremium > 0)) return qcFail("The additional premium must be more than $0.");
  const prev = qcCurrentVersion(c);
  const next = { version: prev.version + 1, kind: "extended", condition: newCondition, coverage: Object.assign({}, c.coverage), premium: newPremium, deadline: newDeadline, reason: reason, by: qcActor(), at: qcNow() };
  next.changes = qcDiff(prev, next);
  c.versions.push(next);
  c.deadline = newDeadline; c.condition = newCondition; c.premium = newPremium;
  c.status = "issued"; c.signature = null;
  qcSystemMessage(c, `Version ${next.version} issued: ${next.changes.map(x => `${x.field}: ${x.from} → ${x.to}`).join("; ")}. Reason: ${reason}. The insured must sign this version.`);
  qcLog(sub, "qc_extended", `${c.id} version ${next.version}: ${next.changes.map(x => `${x.field} ${x.from} → ${x.to}`).join("; ")}. Reason: ${reason}.`);
  QC_OPEN[id + ":ext"] = false;
  qcPersist(); qcRender(sub);
  showToast(`${c.id} extended to ${newDeadline} as version ${next.version}; the insured must sign it.`, "success");
}

function qcWithdraw(id) {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "edit")) { denyPermission("quoteConditions", "edit"); return; }
  const c = qcFind(sub, id); if (!c || qcIsFinal(c)) return;
  const reason = qcField("qc_wd_reason_" + id);
  if (reason.length < 5) return qcFail("Give a reason for withdrawing the condition.");
  const before = qcPremiumNow(sub);
  c.status = "withdrawn";
  c.outcome = { kind: "withdrawn", at: qcNow(), by: qcActor(), note: reason, coverageAdded: false, premiumBefore: before, premiumAfter: before };
  qcSystemMessage(c, `Withdrawn: ${reason}. The coverage was not added and the premium is unchanged.`);
  qcLog(sub, "qc_withdrawn", `${c.id} withdrawn: ${reason}. Coverage not added; premium unchanged.`);
  qcPersist(); qcRender(sub);
}

/** The insured has met the condition. On time: add the coverage and update the premium. Late: refused. */
function qcConfirmMet(id) {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "approve")) { denyPermission("quoteConditions", "approve"); return; }
  qcSweep(sub);
  const c = qcFind(sub, id); if (!c) return;
  if (c.status === "lapsed") return qcFail(`${c.id} lapsed on ${c.deadline}. The coverage cannot be added; the deadline would have to have been extended before it passed.`);
  if (c.status !== "signed") return qcFail(c.status === "issued" ? "The insured has not signed this version yet. Record the signed copy first." : "This condition is not awaiting confirmation.");
  const evidence = qcField("qc_met_ref_" + id), metOn = qcField("qc_met_date_" + id) || qcToday();
  if (evidence.length < 3) return qcFail("Record the evidence that the condition was met (a document reference or a note).");
  if (!qcValidIso(metOn) || metOn > qcToday()) return qcFail("Enter the date the condition was met (today or earlier).");
  if (metOn > c.deadline) return qcFail(`The condition was met on ${metOn}, after the deadline of ${c.deadline}. The coverage cannot be added unless the deadline had been extended in time.`);

  if (!Array.isArray(sub.coverageRows)) sub.coverageRows = [];
  sub.coverageRows.push({ line: c.coverage.line, limit: c.coverage.limit, ded: c.coverage.ded, prem: qcMoney(c.premium), premVal: c.premium, viaQuoteCondition: c.id });
  const dp = sub.discretionaryPricing;
  let before = null, after = null;
  if (dp) {
    before = dp.finalPremium;
    dp.basePremium = (Number(dp.basePremium) || 0) + c.premium;
    recomputeFinalQuotedPremium(sub);
    sub.currentPremium = dp.finalPremium;
    after = dp.finalPremium;
  }
  if (c.rule) qcSatisfyRule(sub, c);
  c.status = "met";
  c.outcome = { kind: "met", at: qcNow(), by: qcActor(), metOn: metOn, evidence: evidence, coverageAdded: true, premiumBefore: before, premiumAfter: after };
  const premText = dp ? `Premium ${qcMoney(before)} → ${qcMoney(after)}.` : `The ${qcMoney(c.premium)} will be included when the rating is set.`;
  qcSystemMessage(c, `Condition met on ${metOn} (${evidence}). ${c.coverage.line} added. ${premText}`);
  qcLog(sub, "qc_met", `${c.id}: condition met on ${metOn} (${evidence}); ${c.coverage.line} added. ${premText}`);
  if (typeof rsCapture === "function") rsCapture(sub, `Quote Condition ${c.id} met: ${c.coverage.line} added`);
  qcPersist(); qcRender(sub);
  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
  showToast(`${c.coverage.line} added. ${premText}`, "success");
}

/** The condition behind an appetite rule was met: record it on the units and mark the rule's rows as satisfied. */
function qcSatisfyRule(sub, c) {
  (c.rule.vehicleIndexes || []).forEach(i => {
    const v = (sub.vehicles || [])[i];
    if (v && c.rule.field) { v[c.rule.field] = true; v[c.rule.field + "Via"] = c.id; }
  });
  (sub.appetiteRules || []).forEach(r => {
    if ((c.rule.ruleIds || []).indexOf(r.id) > -1) { r.pass = true; r.satisfiedVia = c.id; r.val = "Dashcam installed (" + c.id + ")"; }
  });
  if (typeof renderAppetiteRules === "function") renderAppetiteRules(sub.appetiteRules);
}

function qcSend(id) {
  const sub = qcActiveSub(); if (!sub) return;
  if (!hasPermission("quoteConditions", "edit")) { denyPermission("quoteConditions", "edit"); return; }
  const c = qcFind(sub, id); if (!c) return;
  const text = qcField("qc_msg_" + id);
  if (!text) return qcFail("Type a message first.");
  if (text.length > QC_MAX_MESSAGE) return qcFail(`Keep the message under ${QC_MAX_MESSAGE} characters.`);
  const asBroker = qcField("qc_msg_from_" + id) === "broker";
  const relayed = !!(document.getElementById("qc_msg_insured_" + id) || {}).checked;
  const broker = sub.channelType === "direct" ? "Customer" : (sub.broker || "Broker");
  c.messages.push({ id: "M-" + (c.messages.length + 1), kind: "chat", from: asBroker ? "broker" : "underwriter", name: asBroker ? broker : qcActor(), text: text, at: qcNow(), relayedInsured: asBroker && relayed, recordedBy: qcActor() });
  qcLog(sub, "qc_message", `${c.id}: ${asBroker ? "reply from " + broker + (relayed ? " (relaying the insured's response)" : "") : "message to " + broker}.`);
  QC_OPEN[id + ":chat"] = true;
  qcPersist(); qcRender(sub);
  const box = document.getElementById("qc_thread_" + id); if (box) box.scrollTop = box.scrollHeight;
}

// ----------------------------------------------------------------------------
// 5. THE DOCUMENT THE INSURED SIGNS
// ----------------------------------------------------------------------------
function qcDocumentHtml(sub, c, versionNo) {
  const v = c.versions.find(x => x.version === versionNo) || qcCurrentVersion(c);
  const prior = c.versions.find(x => x.version === v.version - 1);
  const sig = c.signature && c.signature.version === v.version ? c.signature : null;
  const broker = sub.channelType === "direct" ? "Direct" : (sub.broker || "");
  const rows = (k, val) => `<tr><th style="text-align:left;width:34%;padding:6px 8px;border:1px solid #cbd5e1;background:#f1f5f9;">${k}</th><td style="padding:6px 8px;border:1px solid #cbd5e1;">${val}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Quote Condition ${qcEsc(c.id)} v${v.version}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:24px auto;color:#0f172a;line-height:1.45;">
<h1 style="font-size:20px;margin:0 0 4px;">Quote Condition</h1>
<div style="color:#475569;font-size:13px;margin-bottom:14px;">${qcEsc(c.id)} &middot; Version ${v.version} &middot; Issued ${qcEsc(v.at)} by ${qcEsc(v.by)}</div>
<table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:14px;">
${rows("Insured", qcEsc(sub.insured || ""))}${rows("Submission", qcEsc(sub.id))}${rows("Producer", qcEsc(broker))}
${rows("Coverage to be added", qcEsc(c.coverage.line) + " &mdash; limit " + qcEsc(c.coverage.limit) + ", deductible " + qcEsc(c.coverage.ded))}
${rows("Additional annual premium", qcMoney(v.premium) + " (before taxes and fees), charged only if the condition is met in time")}
${rows("Condition", qcEsc(v.condition).replace(/\n/g, "<br>"))}
${rows("Deadline", "<strong>" + qcEsc(v.deadline) + "</strong>")}
</table>
${prior ? `<p style="font-size:13px;"><strong>This version replaces version ${prior.version}.</strong> ${v.changes.map(x => `${qcEsc(x.field)}: ${qcEsc(x.from)} &rarr; ${qcEsc(x.to)}`).join("; ")}.${v.reason ? " Reason: " + qcEsc(v.reason) + "." : ""}</p>` : ""}
<p style="font-size:13px;">The insured asks to be quoted without this coverage now and promises to meet the condition above by the deadline. By signing, the insured confirms that:</p>
<ol style="font-size:13px;">
<li>If the condition is met by the deadline and the underwriter confirms it in writing, the coverage is added and the premium above is added to the premium.</li>
<li>If the condition is not met by the deadline, the coverage is <strong>not</strong> added and the premium stays as quoted.</li>
<li>The coverage is not in force, and no claim under it is covered, until it has been added.</li>
<li>The deadline can be changed only by a new version of this document that the insured signs.</li>
</ol>
<table style="width:100%;font-size:13px;margin-top:28px;border-collapse:collapse;">
<tr><td style="width:50%;padding-top:30px;border-top:1px solid #0f172a;">Signature of the insured's authorised signatory</td><td style="padding-left:24px;padding-top:30px;border-top:1px solid #0f172a;">Printed name and title</td></tr>
<tr><td style="padding-top:24px;border-top:1px solid #0f172a;">Date signed</td><td style="padding-left:24px;padding-top:24px;border-top:1px solid #0f172a;">${sig ? "Signed copy recorded: " + qcEsc(sig.signedBy) + ", " + qcEsc(sig.signedOn) : ""}</td></tr>
</table></body></html>`;
}

function qcOpenDocument(id, versionNo) {
  const sub = qcActiveSub(); if (!sub) return;
  const c = qcFind(sub, id); if (!c) return;
  const html = qcDocumentHtml(sub, c, versionNo || qcCurrentVersion(c).version);
  let m = document.getElementById("qcDocModal");
  if (!m) { m = document.createElement("div"); m.id = "qcDocModal"; m.className = "modal-overlay"; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-content" style="max-width:860px;"><div class="modal-header"><h3><i class="ph ph-file-text"></i> Quote Condition ${qcEsc(id)} &middot; version ${versionNo || qcCurrentVersion(c).version}</h3><button class="btn-close" aria-label="Close" onclick="qcCloseDocument()"><i class="ph ph-x"></i></button></div>
    <div class="modal-body"><iframe id="qcDocFrame" style="width:100%;height:520px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;"></iframe></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="qcDownloadDocument('${qcEsc(id)}', ${versionNo || qcCurrentVersion(c).version})"><i class="ph ph-download-simple"></i> Download</button><button class="btn btn-primary" onclick="qcCloseDocument()">Close</button></div></div>`;
  m.style.display = "flex";
  const f = document.getElementById("qcDocFrame"); if (f) f.srcdoc = html;
}
function qcCloseDocument() { const m = document.getElementById("qcDocModal"); if (m) m.style.display = "none"; }
function qcDownloadDocument(id, versionNo) {
  const sub = qcActiveSub(); if (!sub) return;
  const c = qcFind(sub, id); if (!c) return;
  const blob = new Blob([qcDocumentHtml(sub, c, versionNo)], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `QuoteCondition-${id}-v${versionNo}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ----------------------------------------------------------------------------
// 6. RENDERING
// ----------------------------------------------------------------------------
var QC_STATUS = { draft: ["Draft", "badge-light"], issued: ["Awaiting signature", "badge-warning"], signed: ["Signed, condition open", "badge-info"], met: ["Met, coverage added", "badge-success"], lapsed: ["Lapsed, not added", "badge-danger"], withdrawn: ["Withdrawn", "badge-light"] };

function qcDeadlineText(c) {
  if (qcIsFinal(c)) return qcEsc(c.deadline);
  const d = qcDaysBetween(qcToday(), c.deadline);
  return `${qcEsc(c.deadline)} <span class="${d < 0 ? "text-danger" : d <= 7 ? "text-warning" : "text-muted"}">(${d < 0 ? Math.abs(d) + " day(s) overdue" : d === 0 ? "today" : d + " day(s) left"})</span>`;
}

function qcChatHtml(c, canEdit, broker) {
  const msgs = c.messages.map(m => {
    if (m.kind === "system") return `<div style="text-align:center;margin:6px 0;"><span class="text-xs text-muted" style="background:#f1f5f9;border-radius:10px;padding:3px 10px;display:inline-block;">${qcEsc(m.text)} <span style="opacity:.7;">${qcEsc(m.at)}</span></span></div>`;
    const mine = m.from === "underwriter";
    return `<div style="display:flex;justify-content:${mine ? "flex-end" : "flex-start"};margin:6px 0;"><div style="max-width:78%;padding:8px 10px;border-radius:10px;background:${mine ? "#dbeafe" : "#f1f5f9"};font-size:13px;">
      <div class="text-xs" style="font-weight:700;">${qcEsc(m.name)}${m.relayedInsured ? ' <span class="badge badge-info text-xs">relaying the insured</span>' : ""}</div>
      <div style="white-space:pre-wrap;">${qcEsc(m.text)}</div>
      <div class="text-xs text-muted">${qcEsc(m.at)}${m.recordedBy && m.from === "broker" ? " &middot; recorded by " + qcEsc(m.recordedBy) : ""}</div></div></div>`;
  }).join("");
  const input = canEdit ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
      <textarea id="qc_msg_${c.id}" class="form-control" rows="2" maxlength="${QC_MAX_MESSAGE}" placeholder="Message to the broker about the condition or the deadline…"></textarea>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
        <select id="qc_msg_from_${c.id}" class="form-control" style="width:auto;"><option value="underwriter">Send as underwriter</option><option value="broker">Record a reply from ${qcEsc(broker)}</option></select>
        <label class="text-xs" style="display:flex;gap:4px;align-items:center;"><input type="checkbox" id="qc_msg_insured_${c.id}"> the reply relays the insured's response</label>
        <button class="btn btn-sm btn-primary" style="width:auto;" onclick="qcSend('${c.id}')"><i class="ph ph-paper-plane-tilt"></i> Send</button>
      </div></div>` : "";
  return `<div id="qc_thread_${c.id}" style="max-height:260px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#fff;">${msgs || '<div class="text-xs text-muted">No messages yet.</div>'}</div>${input}
    <p class="text-xs text-muted" style="margin-top:6px;"><i class="ph ph-info"></i> Messages go to ${qcEsc(broker)}, who shares them with the insured. ${qcEsc(broker)} has no login here, so record their replies, and the insured's response they pass on, in this thread.</p>`;
}

function qcConditionHtml(sub, c, canEdit, canApprove) {
  const [stText, stCls] = QC_STATUS[c.status];
  const cur = qcCurrentVersion(c);
  const broker = sub.channelType === "direct" ? "the customer" : (sub.broker || "the broker");
  const det = (key, title, body, extra) => `<details ${QC_OPEN[c.id + ":" + key] ? "open" : ""} ontoggle="qcToggle('${c.id}:${key}', this.open)" style="margin-top:10px;"><summary style="cursor:pointer;font-weight:600;">${title}${extra || ""}</summary><div style="margin-top:8px;">${body}</div></details>`;

  let actions = "";
  if (c.status === "draft" && canEdit) actions = `<button class="btn btn-sm btn-primary" style="width:auto;" onclick="qcIssue('${c.id}')"><i class="ph ph-paper-plane-tilt"></i> Issue for signature</button>`;
  if (c.status === "issued" && canEdit) actions = `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"><span class="text-xs"><strong>Signed copy received:</strong></span>
      <input id="qc_sig_name_${c.id}" class="form-control" style="width:170px;" placeholder="Signed by (name)">
      <input id="qc_sig_date_${c.id}" type="date" class="form-control" style="width:150px;" max="${qcToday()}" value="${qcToday()}">
      <input id="qc_sig_ref_${c.id}" class="form-control" style="width:200px;" placeholder="Where the copy is held">
      <button class="btn btn-sm btn-primary" style="width:auto;" onclick="qcRecordSignature('${c.id}')">Record signature</button></div>`;
  if (c.status === "signed" && canApprove) actions = `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;"><span class="text-xs"><strong>The insured met the condition:</strong></span>
      <input id="qc_met_ref_${c.id}" class="form-control" style="width:240px;" placeholder="Evidence (document or note)">
      <input id="qc_met_date_${c.id}" type="date" class="form-control" style="width:150px;" max="${qcToday()}" value="${qcToday()}">
      <button class="btn btn-sm btn-primary" style="width:auto;" onclick="qcConfirmMet('${c.id}')"><i class="ph ph-check-circle"></i> Confirm met: add coverage</button></div>`;
  else if (c.status === "signed" && !canApprove) actions = `<span class="text-xs text-muted"><i class="ph ph-lock"></i> Confirming that the condition was met needs approval rights on quote conditions.</span>`;

  const extend = (c.status === "issued" || c.status === "signed") && canEdit ? det("ext", "The insured asks for more time", `<div style="display:grid;gap:6px;">
      <label class="text-xs">New deadline (after ${qcEsc(c.deadline)})<input id="qc_ext_date_${c.id}" type="date" class="form-control" min="${qcAddDays(c.deadline, 1)}" value="${qcAddDays(c.deadline, 14)}"></label>
      <label class="text-xs">Why more time, and who asked<textarea id="qc_ext_reason_${c.id}" class="form-control" rows="2" placeholder="e.g. Insured asked through ${qcEsc(broker)}: the installer is booked until the end of the month."></textarea></label>
      <label class="text-xs">Condition wording (change it only if it changes)<textarea id="qc_ext_cond_${c.id}" class="form-control" rows="2">${qcEsc(c.condition)}</textarea></label>
      <label class="text-xs">Additional annual premium ($)<input id="qc_ext_prem_${c.id}" class="form-control" value="${c.premium}"></label>
      <div><button class="btn btn-sm btn-outline" style="width:auto;" onclick="qcExtend('${c.id}')"><i class="ph ph-calendar-plus"></i> Issue the extension as a new version</button></div>
      <div class="text-xs text-muted">The new version replaces this one and the insured must sign it. The earlier versions are kept.</div></div>`) : "";
  const withdraw = !qcIsFinal(c) && canEdit ? det("wd", "Withdraw this condition", `<div style="display:flex;gap:6px;flex-wrap:wrap;"><input id="qc_wd_reason_${c.id}" class="form-control" style="width:300px;" placeholder="Reason"><button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="qcWithdraw('${c.id}')">Withdraw</button></div><div class="text-xs text-muted" style="margin-top:4px;">The coverage is not added and the premium is unchanged.</div>`) : "";

  const versions = c.versions.slice().reverse().map(v => `<tr><td>v${v.version}${v.version === cur.version ? " (current)" : ""}</td><td>${qcEsc(v.at)}<br><span class="text-xs text-muted">${qcEsc(v.by)}</span></td><td>${qcEsc(v.deadline)}</td>
      <td class="text-xs">${v.changes.length ? v.changes.map(x => `${qcEsc(x.field)}: ${qcEsc(x.from)} &rarr; ${qcEsc(x.to)}`).join("<br>") : "First version"}${v.reason ? `<br><em>${qcEsc(v.reason)}</em>` : ""}</td>
      <td><button class="btn btn-xs btn-outline" style="width:auto;" onclick="qcOpenDocument('${c.id}', ${v.version})">View</button></td></tr>`).join("");
  const outcome = c.outcome ? `<div class="alert ${c.status === "met" ? "alert-success" : "alert-warning"} text-xs" style="margin:0;"><strong>${c.status === "met" ? "Coverage added" : c.status === "lapsed" ? "Lapsed: coverage not added" : "Withdrawn: coverage not added"}</strong> &middot; ${qcEsc(c.outcome.at)} &middot; ${qcEsc(c.outcome.by)}.
      ${c.outcome.premiumBefore !== null && c.outcome.premiumBefore !== undefined ? (c.status === "met" ? `Premium ${qcMoney(c.outcome.premiumBefore)} &rarr; ${qcMoney(c.outcome.premiumAfter)}.` : `Premium unchanged at ${qcMoney(c.outcome.premiumAfter)}.`) : (c.status === "met" ? `${qcMoney(c.premium)} will be included when the rating is set.` : "Premium unchanged.")}
      ${c.outcome.note ? " " + qcEsc(c.outcome.note) : ""}${c.outcome.evidence ? " Evidence: " + qcEsc(c.outcome.evidence) + "." : ""}</div>` : "";

  // Life-cycle strip: Drafted > Issued > Signed > Met, or Lapsed / Withdrawn at the end.
  const closed = c.status === "lapsed" || c.status === "withdrawn";
  const idx = { draft: 0, issued: 1, signed: 2, met: 3 }[c.status];
  const reached = closed ? (c.signature ? 2 : (c.issuedAt ? 1 : 0)) : idx;
  const labels = ["Drafted", "Issued", "Signed", c.status === "lapsed" ? "Lapsed" : c.status === "withdrawn" ? "Withdrawn" : "Met"];
  const steps = labels.map((l, i) => {
    const bad = closed && i === 3 && c.status === "lapsed";
    const done = c.status === "met" ? true : closed ? i <= reached : i < idx;
    const now = !closed && c.status !== "met" && i === idx;
    const cls = bad ? "bad" : done ? "done" : now ? "now" : "";
    const icon = bad ? "ph-x" : done ? "ph-check" : "";
    return `${i ? `<span class="qc-bar ${done || bad ? "done" : ""}"></span>` : ""}<span class="qc-step ${cls}"><span class="qc-dot">${icon ? `<i class="ph ${icon}"></i>` : ""}</span>${l}</span>`;
  }).join("");

  return `<div class="qc-item qc-st-${c.status}">
    <div class="qc-head">
      <div><div class="qc-title"><span class="qc-id">${qcEsc(c.id)}</span> ${qcEsc(c.coverage.line)}</div>
        <div class="qc-sub">Limit ${qcEsc(c.coverage.limit)} &middot; deductible ${qcEsc(c.coverage.ded)}</div></div>
      <span class="badge ${stCls}">${stText}</span></div>
    <div class="qc-steps">${steps}</div>
    <div class="qc-facts">
      <div class="qc-fact"><div class="k">Added premium</div><div class="v">${qcMoney(c.premium)}</div></div>
      <div class="qc-fact"><div class="k">Deadline</div><div class="v" style="font-weight:500;">${qcDeadlineText(c)}</div></div>
      ${c.signature ? `<div class="qc-fact"><div class="k">Signed</div><div class="v" style="font-weight:500;">Version ${c.signature.version} by ${qcEsc(c.signature.signedBy)} on ${qcEsc(c.signature.signedOn)} <span class="text-xs text-muted">(${qcEsc(c.signature.reference)})</span></div></div>` : ""}
    </div>
    <div class="qc-cond"><div class="qc-lbl">Condition</div>${qcEsc(c.condition)}</div>
    <div class="qc-outcomes">
      <div class="qc-oc yes"><b><i class="ph ph-check-circle"></i> If met on time</b>${qcEsc(c.coverage.line)} is added and ${qcMoney(c.premium)} is added to the premium (before taxes and fees).</div>
      <div class="qc-oc no"><b><i class="ph ph-calendar-x"></i> If not met on time</b>The coverage is not added and the premium stays unchanged.</div>
    </div>
    ${outcome ? `<div style="padding:0 14px 12px;">${outcome}</div>` : ""}
    <div class="qc-actions">
      <button class="btn btn-sm btn-outline" style="width:auto;" onclick="qcOpenDocument('${c.id}')"><i class="ph ph-file-text"></i> View the document to sign</button>${actions}</div>
    <div class="qc-more">
    ${extend}
    ${det("ver", "Versions (" + c.versions.length + ")", `<table class="data-table"><thead><tr><th>Version</th><th>Issued</th><th>Deadline</th><th>Changes</th><th></th></tr></thead><tbody>${versions}</tbody></table>`)}
    ${det("chat", "Chat with " + qcEsc(broker) + " (" + c.messages.filter(m => m.kind === "chat").length + ")", qcChatHtml(c, canEdit, sub.channelType === "direct" ? "Customer" : (sub.broker || "Broker")))}
    ${withdraw}
    </div>
  </div>`;
}

function qcSuggestionHtml(sub, canEdit) {
  const list = qcSuggestions(sub);
  if (!list.length) return "";
  return list.map(g => `<div class="qc-suggest">
      <div class="qc-suggest-icon"><i class="ph ph-warning"></i></div>
      <div class="qc-suggest-body">
        <div class="qc-suggest-title">Appetite rule not met: ${qcEsc(g.ruleName)}.</div>
        <div>${qcEsc(g.cover)} is not provided for ${g.rules.map(r => qcEsc(String(r.name).split(" \u2014 ")[1] || r.name) + " (" + qcEsc(r.val) + ")").join("; ")}.
          The product allows a Quote Condition: the insured promises to meet it by a date and the coverage is added if they do.</div>
        ${canEdit ? `<div style="margin-top:10px;"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="qcPrefill('${qcEsc(g.family)}')"><i class="ph ph-file-plus"></i> Create a Quote Condition for ${qcEsc(g.cover)}</button></div>` : ""}
      </div></div>`).join("");
}

function qcWithheldHtml(sub) {
  const held = qcStore(sub).filter(c => c.withheldRow && c.status !== "met");
  if (!held.length) return "";
  return `<div class="qc-note"><i class="ph ph-lock-key"></i><div><strong>Withheld from the quote:</strong> ${held.map(c => `${qcEsc(c.coverage.line)} (${qcEsc(c.id)}, ${qcEsc(QC_STATUS[c.status][0].toLowerCase())})`).join("; ")}. It is added only if the condition is met in time.</div></div>`;
}

function qcFormHtml(sub) {
  const pf = QC_PREFILL || {};
  const sugg = (QC_COVERAGE_SUGGESTIONS[sub.lobKey] || ["Additional coverage"]).map(s => `<option value="${qcEsc(s)}"></option>`).join("");
  return `<div class="qc-form">
    <div class="qc-form-head"><div class="qc-form-title"><i class="ph ph-file-plus"></i> New Quote Condition</div>
      <div class="qc-form-hint">Use this when the insured has not yet met something needed for a coverage but promises to meet it by a date.</div></div>
    ${pf.ruleName ? `<div class="qc-note"><i class="ph ph-link"></i><div>Raised from the appetite rule "${qcEsc(pf.ruleName)}". Creating it withholds ${qcEsc(pf.line)} from the quote until the condition is met.</div></div>` : ""}
    <div class="qc-form-section">Coverage</div>
    <div class="qc-grid">
      <label class="qc-field qc-wide">Coverage to add if met<input id="qc_cov_line" class="form-control" list="qc_cov_list" placeholder="e.g. Physical Damage" value="${qcEsc(pf.line || "")}"><datalist id="qc_cov_list">${sugg}</datalist></label>
      <label class="qc-field">Limit<input id="qc_cov_limit" class="form-control" placeholder="e.g. $250,000" value="${qcEsc(pf.limit || "")}"></label>
      <label class="qc-field">Deductible<input id="qc_cov_ded" class="form-control" placeholder="e.g. $2,500" value="${qcEsc(pf.ded || "")}"></label>
    </div>
    <div class="qc-form-section">Terms</div>
    <div class="qc-grid">
      <label class="qc-field">Additional annual premium ($)<input id="qc_premium" class="form-control" placeholder="e.g. 4,800" value="${qcEsc(pf.premium || "")}"></label>
      <label class="qc-field">Deadline<input id="qc_deadline" type="date" class="form-control" min="${qcToday()}" max="${qcAddDays(qcToday(), QC_MAX_DEADLINE_DAYS)}" value="${qcEsc(pf.deadline || "")}"></label>
    </div>
    <label class="qc-field">Condition the insured promises to meet<textarea id="qc_condition" class="form-control" rows="3" placeholder="e.g. Install forward-facing cameras on all 12 power units and send the installer's certificate.">${qcEsc(pf.condition || "")}</textarea></label>
    <div class="qc-form-actions"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="qcCreate()"><i class="ph ph-file-plus"></i> Create the Quote Condition</button>
    <button class="btn btn-sm btn-outline" style="width:auto;" onclick="QC_PREFILL = null; qcToggleForm()">Cancel</button></div></div>`;
}

function qcRender(sub) {
  const box = document.getElementById("quoteConditionContainer");
  if (!box || !sub) return;
  qcSweep(sub);
  const canView = hasPermission("quoteConditions", "view");
  if (!canView) { box.innerHTML = ""; return; }
  const canEdit = hasPermission("quoteConditions", "edit"), canApprove = hasPermission("quoteConditions", "approve");
  const list = qcStore(sub);
  const open = list.filter(c => !qcIsFinal(c)).length;
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-file-text"></i> Quote Condition</h3>
      <span class="badge ${open ? "badge-warning" : "badge-light"}">${list.length ? open + " open of " + list.length : "None"}</span></div>
    <div class="card-body">
      <div class="qc-intro"><i class="ph ph-info"></i><div>A coverage the insured cannot qualify for yet can be added later if they meet a stated condition by an agreed date. The insured signs a Quote Condition showing the condition and the deadline. Met on time: the coverage is added and the premium updated. Not met on time: nothing is added and the premium is unchanged.</div></div>
      ${qcSuggestionHtml(sub, canEdit)}
      ${qcWithheldHtml(sub)}
      ${canEdit && !QC_FORM_OPEN ? `<button class="btn btn-sm btn-primary" style="width:auto;" onclick="qcToggleForm()"><i class="ph ph-plus"></i> New Quote Condition</button>` : ""}
      ${canEdit && QC_FORM_OPEN ? qcFormHtml(sub) : ""}
      ${list.map(c => qcConditionHtml(sub, c, canEdit, canApprove)).join("") || '<div class="text-sm text-muted" style="margin-top:8px;">No quote conditions on this submission.</div>'}
    </div></div>`;
}

// ----------------------------------------------------------------------------
// 7. HOOKS
// ----------------------------------------------------------------------------
(function qcInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label: label, icon: icon, badge: badge, outcome: outcome });
    AUDIT_ACTION_META.qc_created = m("Quote Condition Drafted", "ph-file-text", "badge-light", "outcome-comm");
    AUDIT_ACTION_META.qc_issued = m("Quote Condition Issued", "ph-paper-plane-tilt", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.qc_signed = m("Quote Condition Signed", "ph-signature", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.qc_extended = m("Quote Condition Extended", "ph-calendar-plus", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.qc_met = m("Condition Met: Coverage Added", "ph-check-circle", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.qc_lapsed = m("Condition Lapsed: Coverage Not Added", "ph-calendar-x", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.qc_withdrawn = m("Quote Condition Withdrawn", "ph-x-circle", "badge-light", "outcome-comm");
    AUDIT_ACTION_META.qc_message = m("Quote Condition Message", "ph-chats", "badge-light", "outcome-comm");
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { if (sub) qcRender(sub); } catch (e) { console.warn("Quote Condition card failed:", e); }
      return r;
    };
  }
})();

window.qcToggleForm = qcToggleForm; window.qcToggle = qcToggle; window.qcCreate = qcCreate; window.qcIssue = qcIssue;
window.qcRecordSignature = qcRecordSignature; window.qcExtend = qcExtend; window.qcWithdraw = qcWithdraw; window.qcConfirmMet = qcConfirmMet;
window.qcSend = qcSend; window.qcOpenDocument = qcOpenDocument; window.qcCloseDocument = qcCloseDocument; window.qcDownloadDocument = qcDownloadDocument;
window.qcPrefill = qcPrefill; window.qcDocSummary = qcDocSummary; window.qcRender = qcRender; window.qcMetPremium = qcMetPremium;
