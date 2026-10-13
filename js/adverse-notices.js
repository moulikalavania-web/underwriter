/**
 * ============================================================================
 * DECLINATION & ADVERSE-ACTION NOTICES (Add-On) — gap G05
 * ----------------------------------------------------------------------------
 * When a submission is declined, or is offered only on adverse terms (a higher
 * premium, an exclusion or restricted cover), the applicant is owed a written
 * notice. When a consumer report about an individual (for example a driver's
 * motor vehicle report or an owner's credit-based score) was a factor, the
 * Fair Credit Reporting Act adds required content: who supplied the report,
 * that they did not make the decision, the right to a free copy within 60 days
 * and to dispute it, and, where a credit score was used, the score, its range,
 * date, source and up to four key factors.
 *
 * This module adds a "Notice Studio" where an underwriter drafts a notice from
 * a template, picks the reasons, records any consumer-report details, previews
 * it, and a user with approval authority issues it. Issued notices are
 * immutable and can only be voided with a reason. Everything is written to the
 * decision log, so it shows in the Audit Log.
 *
 * Controls built in:
 *   - A sanctions hit is never given as a reason. A submission with an
 *     unresolved or confirmed sanctions match cannot have a notice issued; it
 *     goes to Compliance instead.
 *   - FCRA fields are required, and checked, when a consumer report was used.
 *   - If no state-specific language is configured for the risk state, the
 *     issuer must confirm Compliance has reviewed that state's requirements.
 *   - Quote & Bind: if adverse terms rest on a consumer report, the quote cannot
 *     be issued until the adverse-action notice has been issued.
 *
 * IMPORTANT: the wording is a TEMPLATE (NOTICE_TEMPLATE_META.version) and is
 * stamped "not Compliance-approved" until Compliance sets approved = true. State
 * rules are an empty map (NOTICE_STATE_RULES) for Compliance to fill in. Whether
 * the FCRA applies to a given commercial line and report is a legal question;
 * the underwriter attests to it on the form.
 * ============================================================================
 */

var NOTICE_TEMPLATE_META = { version: "DRAFT-0.1", approved: false, approvedBy: null };
var NOTICE_TARGET_DAYS = 3;     // internal target for issuing a declination notice, not a legal deadline
var NOTICE_STATE_RULES = {};    // e.g. { TX: { text: "…state-required wording…" } } — Compliance to configure

var NOTICE_TYPES = {
  declination:  { label: "Declination notice" },
  adverse_terms: { label: "Adverse-terms notice (higher premium, exclusion or restricted cover)" }
};

var NOTICE_REASON_CODES = [
  { code: "APPETITE",      label: "The risk is outside our current underwriting guidelines (class, territory or exposure)." },
  { code: "LOSS_HISTORY",  label: "The loss history or loss experience provided." },
  { code: "DRIVER_ELIG",   label: "Driver eligibility (for example age, experience or violation history)." },
  { code: "SAFETY_RECORD", label: "The safety record of the operation (for example inspection or out-of-service history)." },
  { code: "INCOMPLETE",    label: "We did not receive the information needed to evaluate the request." },
  { code: "DUPLICATE",     label: "Another producer already holds this submission." },
  { code: "CAPACITY",      label: "The requested limits or exposure exceed the capacity available for this class." },
  { code: "CREDIT_INFO",   label: "Information in a consumer report or credit-based report.", consumerReport: true },
  { code: "OTHER",         label: "Another reason (explained below)." }
];
// Deliberately absent: any sanctions / watchlist reason. See noticeSanctionsHold().

var NOTICE_REPORT_KINDS = ["Motor vehicle report (MVR)", "Credit-based insurance score", "Consumer credit report", "Other consumer report"];
var NOTICE_DELIVERY = ["Email to producer and insured", "Email to producer", "First-class mail to insured", "Other (explain in reference)"];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC — validation and text generation (no DOM)
// ----------------------------------------------------------------------------
function noticeNeedsConsumerSection(f) {
  return !!f.consumerUsed || (f.reasons || []).some(c => (NOTICE_REASON_CODES.find(r => r.code === c) || {}).consumerReport);
}

function noticeValidate(sub, f, forIssue) {
  const p = [];
  if (!f.type || !NOTICE_TYPES[f.type]) p.push("choose the notice type");
  if (!(f.reasons || []).length) p.push("select at least one reason");
  if ((f.reasons || []).includes("OTHER") && String(f.reasonDetail || "").trim().length < 5) p.push("explain the other reason");
  if (f.type === "adverse_terms" && String(f.adverseTermsText || "").trim().length < 10) p.push("describe the adverse terms (premium change, exclusion or restriction)");
  if (!f.recipients || (!f.recipients.insured && !f.recipients.producer)) p.push("choose at least one recipient");

  if (noticeNeedsConsumerSection(f)) {
    if (!f.consumerUsed) p.push("a credit-related reason needs the consumer-report section");
    const reports = f.reports || [];
    if (!reports.length) p.push("add the consumer report that was used");
    reports.forEach((r, i) => {
      const tag = `Report ${i + 1}`;
      if (!r.kind) p.push(`${tag}: choose the type of report`);
      if (String(r.craName || "").trim().length < 2) p.push(`${tag}: enter the reporting agency name`);
      if (String(r.craAddress || "").trim().length < 5) p.push(`${tag}: enter the reporting agency address`);
      if (String(r.craPhone || "").replace(/\D/g, "").length < 7) p.push(`${tag}: enter the reporting agency telephone number`);
      if (r.scoreUsed) {
        const v = Number(r.scoreValue), lo = Number(r.scoreLow), hi = Number(r.scoreHigh);
        if (!isFinite(v) || r.scoreValue === "" || r.scoreValue == null) p.push(`${tag}: enter the score used`);
        if (!isFinite(lo) || !isFinite(hi) || r.scoreLow === "" || r.scoreHigh === "" || lo >= hi) p.push(`${tag}: enter the score range (low below high)`);
        else if (isFinite(v) && (v < lo || v > hi)) p.push(`${tag}: the score is outside the stated range`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.scoreDate || ""))) p.push(`${tag}: enter the date the score was created`);
        if (String(r.scoreCreator || "").trim().length < 2) p.push(`${tag}: enter who created the score`);
        const fac = noticeFactorList(r.factors);
        if (fac.length < 1) p.push(`${tag}: list at least one key factor`);
        if (fac.length > 4) p.push(`${tag}: list no more than four key factors`);
      }
    });
  }

  if (forIssue) {
    if (!f.deliveryMethod) p.push("choose how the notice was delivered");
    if (String(f.deliveryRef || "").trim().length < 3) p.push("enter the delivery reference (email id, tracking number)");
    const st = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
    if (st && !NOTICE_STATE_RULES[st] && !f.stateAck) p.push(`confirm Compliance has reviewed ${st}'s notice requirements (no state wording is configured)`);
    if (!st && !f.stateAck) p.push("the risk state could not be determined; confirm Compliance has reviewed the applicable state requirements");
  }
  return p;
}

function noticeFactorList(text) {
  return String(text || "").split(/\n|;/).map(s => s.trim()).filter(Boolean);
}

/** Returns { title, blocks: [{k:'p'|'li'|'h'|'meta', t}] } */
function noticeBuildBlocks(sub, f, ctx) {
  ctx = ctx || {};
  const when = ctx.issuedAt || new Date().toISOString().slice(0, 10);
  const insured = sub.insured || "Applicant";
  const sender = sub.mga || sub.carrier || "Underwriting Department";
  const isDecl = f.type === "declination";
  const b = [];
  const push = (k, t) => b.push({ k, t });

  push("meta", `Date: ${String(when).slice(0, 10)}`);
  push("meta", `To: ${insured}${sub.address ? ", " + sub.address : ""}`);
  if (f.recipients && f.recipients.producer && sub.broker && sub.channelType !== "direct") push("meta", `Copy to: ${sub.broker} (producer)`);
  push("meta", `Re: ${isDecl ? "Request for" : "Quotation for"} ${sub.lobName || "commercial insurance"} — reference ${sub.id}`);
  push("p", `Dear ${insured},`);

  if (isDecl) {
    push("p", `We have reviewed your request for ${sub.lobName || "commercial insurance"} and we are unable to offer coverage at this time.`);
  } else {
    push("p", `We can offer coverage only on terms that are less favorable than those you requested or than our standard terms.`);
    push("h", "The terms we are able to offer");
    push("p", String(f.adverseTermsText || "").trim());
  }

  push("h", "Reasons for this decision");
  push("p", "The principal reasons for our decision are:");
  (f.reasons || []).forEach(c => {
    const r = NOTICE_REASON_CODES.find(x => x.code === c);
    if (!r) return;
    push("li", c === "OTHER" ? `Another reason: ${String(f.reasonDetail || "").trim()}` : r.label);
  });
  if ((f.reasons || []).length && !(f.reasons || []).includes("OTHER") && String(f.reasonDetail || "").trim()) push("p", String(f.reasonDetail).trim());

  if (noticeNeedsConsumerSection(f)) {
    push("h", "Information from a consumer report");
    push("p", "Information in a consumer report was a factor in this decision.");
    (f.reports || []).forEach((r, i) => {
      const n = f.reports.length > 1 ? ` (${i + 1})` : "";
      push("p", `Report${n}: ${r.kind}. It was provided by ${r.craName}, ${r.craAddress}, telephone ${r.craPhone}.`);
      push("p", `${r.craName} did not make this decision and cannot explain why it was made. You have the right under the Fair Credit Reporting Act to obtain a free copy of your report from ${r.craName} if you ask for it within 60 days of receiving this notice, and to dispute with ${r.craName} the accuracy or completeness of any information in the report.`);
      if (r.scoreUsed) {
        push("p", `Credit score used: ${r.scoreValue}. Scores range from ${r.scoreLow} to ${r.scoreHigh}. The score was created on ${r.scoreDate} by ${r.scoreCreator}.`);
        push("p", "The key factors that adversely affected the score were:");
        noticeFactorList(r.factors).forEach(x => push("li", x));
      }
    });
  }

  const state = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  if (state && NOTICE_STATE_RULES[state] && NOTICE_STATE_RULES[state].text) {
    push("h", `Notice for ${state}`);
    push("p", NOTICE_STATE_RULES[state].text);
  }

  push("p", isDecl
    ? "This decision applies only to this request. You are free to seek coverage elsewhere. If you believe any information we relied on is wrong, please tell your producer or contact us and we will review it."
    : "If you believe any information we relied on is wrong, please tell your producer or contact us and we will review it.");
  push("p", `Sincerely,\n${sender}`);
  if (!NOTICE_TEMPLATE_META.approved) push("meta", `Template ${NOTICE_TEMPLATE_META.version} — not yet approved by Compliance. Do not send outside a test environment.`);
  return { title: isDecl ? "NOTICE OF DECLINATION" : "NOTICE OF ADVERSE UNDERWRITING ACTION", blocks: b };
}

function noticeEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function noticeBlocksToText(doc) {
  return [doc.title, ""].concat(doc.blocks.map(x => x.k === "li" ? "  • " + x.t : (x.k === "h" ? "\n" + x.t.toUpperCase() : x.t))).join("\n");
}

function noticeBlocksToHtml(doc) {
  let html = `<h2 style="margin:0 0 14px;font-size:16px;letter-spacing:.5px;">${noticeEsc(doc.title)}</h2>`;
  let inList = false;
  doc.blocks.forEach(x => {
    if (x.k !== "li" && inList) { html += "</ul>"; inList = false; }
    if (x.k === "li") { if (!inList) { html += '<ul style="margin:4px 0 8px 20px;padding:0;">'; inList = true; } html += `<li>${noticeEsc(x.t)}</li>`; }
    else if (x.k === "h") html += `<h3 style="margin:14px 0 4px;font-size:13px;">${noticeEsc(x.t)}</h3>`;
    else if (x.k === "meta") html += `<div style="color:#475569;font-size:12px;margin:2px 0;">${noticeEsc(x.t)}</div>`;
    else html += `<p style="margin:0 0 8px;white-space:pre-line;">${noticeEsc(x.t)}</p>`;
  });
  if (inList) html += "</ul>";
  return html;
}

// ----------------------------------------------------------------------------
// 2. STATE + AUDIT
// ----------------------------------------------------------------------------
function noticeSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function noticeNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function noticeActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function noticeLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 7, decision, by: noticeActor(), at: noticeNow(), notes });
}
function noticePersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function noticeList(sub) { if (!sub.notices) sub.notices = []; return sub.notices; }

/** Unresolved or confirmed sanctions hit on this submission: no notice may be issued. */
function noticeSanctionsHold(sub) {
  if (typeof getSanctionsStatus !== "function") return false;
  try { const s = getSanctionsStatus(sub).state; return s === "review_required" || s === "blocked"; } catch (e) { return false; }
}

function noticeIssuedOfType(sub, type) {
  return noticeList(sub).filter(n => n.status === "issued" && n.type === type);
}

// ----------------------------------------------------------------------------
// 3. NOTICE STUDIO (modal)
// ----------------------------------------------------------------------------
var noticeStudio = { subId: null, editingId: null, form: null, previewHtml: "" };

function noticeBlankForm(sub, type) {
  return {
    type, reasons: [], reasonDetail: "", adverseTermsText: "",
    consumerUsed: false, reports: [],
    recipients: { insured: true, producer: !!(sub.broker && sub.channelType !== "direct") },
    deliveryMethod: "", deliveryRef: "", stateAck: false
  };
}
function noticeBlankReport() {
  return { kind: NOTICE_REPORT_KINDS[0], craName: "", craAddress: "", craPhone: "", scoreUsed: false, scoreValue: "", scoreLow: "", scoreHigh: "", scoreDate: "", scoreCreator: "", factors: "" };
}

function noticeOpenStudio(subId, type) {
  const sub = noticeSub(subId);
  if (!sub) return;
  const wasDeclined = sub.lifecycleStatus === "declined";
  noticeStudio = { subId, editingId: null, form: noticeBlankForm(sub, type || (wasDeclined ? "declination" : "adverse_terms")), previewHtml: "" };
  noticeRenderStudio();
}

function noticeCloseStudio() {
  const m = document.getElementById("noticeStudioModal");
  if (m) { m.style.display = "none"; m.innerHTML = ""; }
  noticeStudio = { subId: null, editingId: null, form: null, previewHtml: "" };
}

function noticeV(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function noticeC(id) { const el = document.getElementById(id); return !!(el && el.checked); }

/** Reads the form fields from the DOM into noticeStudio.form. */
function noticeCapture() {
  const f = noticeStudio.form;
  if (!f || !document.getElementById("ns_type")) return;
  f.type = noticeV("ns_type");
  f.reasons = NOTICE_REASON_CODES.filter(r => noticeC("ns_r_" + r.code)).map(r => r.code);
  f.reasonDetail = noticeV("ns_reasonDetail");
  f.adverseTermsText = noticeV("ns_terms");
  f.consumerUsed = noticeC("ns_consumerUsed");
  f.reports = (f.reports || []).map((r, i) => ({
    kind: noticeV(`ns_rk_${i}`), craName: noticeV(`ns_rn_${i}`), craAddress: noticeV(`ns_ra_${i}`), craPhone: noticeV(`ns_rp_${i}`),
    scoreUsed: noticeC(`ns_su_${i}`), scoreValue: noticeV(`ns_sv_${i}`), scoreLow: noticeV(`ns_sl_${i}`), scoreHigh: noticeV(`ns_sh_${i}`),
    scoreDate: noticeV(`ns_sd_${i}`), scoreCreator: noticeV(`ns_sc_${i}`), factors: noticeV(`ns_sf_${i}`)
  }));
  f.recipients = { insured: noticeC("ns_rcpt_insured"), producer: noticeC("ns_rcpt_producer") };
  f.deliveryMethod = noticeV("ns_delivery");
  f.deliveryRef = noticeV("ns_deliveryRef");
  f.stateAck = noticeC("ns_stateAck");
}

/** Capture the form, then redraw (used by toggles that change the layout). */
function noticeRefresh() {
  noticeCapture();
  const f = noticeStudio.form;
  if (f && noticeNeedsConsumerSection(f) && !(f.reports || []).length) f.reports = [noticeBlankReport()];
  if (f && (f.reasons || []).some(c => (NOTICE_REASON_CODES.find(r => r.code === c) || {}).consumerReport)) f.consumerUsed = true;
  noticeRenderStudio();
}
function noticeAddReport() { noticeCapture(); if ((noticeStudio.form.reports || []).length < 3) noticeStudio.form.reports.push(noticeBlankReport()); noticeRenderStudio(); }
function noticeRemoveReport(i) { noticeCapture(); noticeStudio.form.reports.splice(i, 1); noticeRenderStudio(); }

function noticeStatusBadge(n) {
  const cls = n.status === "issued" ? "badge-success" : (n.status === "void" ? "badge-light" : "badge-warning");
  return `<span class="badge ${cls} text-xs">${noticeEsc(n.status)}</span>`;
}

function noticeRenderStudio() {
  const sub = noticeSub(noticeStudio.subId);
  const f = noticeStudio.form;
  if (!sub || !f) return;
  let modal = document.getElementById("noticeStudioModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "noticeStudioModal";
    modal.className = "modal-overlay";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
  }
  const canEdit = hasPermission("notices", "edit");
  const canIssue = hasPermission("notices", "approve");
  const hold = noticeSanctionsHold(sub);
  const consumer = noticeNeedsConsumerSection(f);
  const st = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  const needsStateAck = !st || !NOTICE_STATE_RULES[st];
  const dis = canEdit ? "" : "disabled";

  const existing = noticeList(sub).map(n => `
    <tr>
      <td>${noticeEsc(n.id)}</td><td>${noticeEsc(NOTICE_TYPES[n.type] ? NOTICE_TYPES[n.type].label : n.type)}</td><td>${noticeStatusBadge(n)}</td>
      <td>${noticeEsc(n.status === "issued" ? n.issuedAt : n.createdAt)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-xs btn-outline" onclick="noticePrint('${noticeEsc(n.id)}')"><i class="ph ph-printer"></i> Print</button>
        <button class="btn btn-xs btn-outline" onclick="noticeDownload('${noticeEsc(n.id)}')"><i class="ph ph-download-simple"></i> Download</button>
        ${n.status === "draft" && canEdit ? `<button class="btn btn-xs btn-primary" onclick="noticeEditDraft('${noticeEsc(n.id)}')"><i class="ph ph-pencil-simple"></i> Edit</button>` : ""}
        ${n.status === "issued" && canIssue ? `<button class="btn btn-xs btn-outline-danger" onclick="noticeVoid('${noticeEsc(n.id)}')"><i class="ph ph-x-circle"></i> Void</button>` : ""}
      </td>
    </tr>`).join("");

  const reasons = NOTICE_REASON_CODES.map(r => `
    <label style="display:block; font-size:12.5px; margin:3px 0;"><input type="checkbox" id="ns_r_${r.code}" ${f.reasons.includes(r.code) ? "checked" : ""} ${dis} onchange="noticeRefresh()"> ${noticeEsc(r.label)}</label>`).join("");

  const reportBlocks = (f.reports || []).map((r, i) => `
    <div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px; margin-top:8px; background:#fafcff;">
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        <strong style="font-size:12px;">Report ${i + 1}</strong>
        <select id="ns_rk_${i}" class="form-control" style="width:230px;" ${dis}>${NOTICE_REPORT_KINDS.map(k => `<option ${r.kind === k ? "selected" : ""}>${noticeEsc(k)}</option>`).join("")}</select>
        <input id="ns_rn_${i}" class="form-control" style="width:210px;" placeholder="Reporting agency name" value="${noticeEsc(r.craName)}" ${dis}>
        <input id="ns_rp_${i}" class="form-control" style="width:150px;" placeholder="Agency telephone" value="${noticeEsc(r.craPhone)}" ${dis}>
        ${canEdit ? `<button class="btn btn-xs btn-outline-danger" style="width:auto;" onclick="noticeRemoveReport(${i})"><i class="ph ph-trash"></i></button>` : ""}
      </div>
      <input id="ns_ra_${i}" class="form-control" style="margin-top:8px; width:100%;" placeholder="Reporting agency address" value="${noticeEsc(r.craAddress)}" ${dis}>
      <label style="display:block; font-size:12.5px; margin-top:8px;"><input type="checkbox" id="ns_su_${i}" ${r.scoreUsed ? "checked" : ""} ${dis} onchange="noticeRefresh()"> A credit score was used in the decision</label>
      ${r.scoreUsed ? `
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:6px;">
        <input id="ns_sv_${i}" type="number" class="form-control" style="width:110px;" placeholder="Score" value="${noticeEsc(r.scoreValue)}" ${dis}>
        <input id="ns_sl_${i}" type="number" class="form-control" style="width:110px;" placeholder="Range low" value="${noticeEsc(r.scoreLow)}" ${dis}>
        <input id="ns_sh_${i}" type="number" class="form-control" style="width:110px;" placeholder="Range high" value="${noticeEsc(r.scoreHigh)}" ${dis}>
        <label class="text-xs text-muted" style="font-size:12px;">Date created <input id="ns_sd_${i}" type="date" class="form-control" style="width:150px;" value="${noticeEsc(r.scoreDate)}" ${dis}></label>
        <input id="ns_sc_${i}" class="form-control" style="width:200px;" placeholder="Who created the score" value="${noticeEsc(r.scoreCreator)}" ${dis}>
      </div>
      <textarea id="ns_sf_${i}" class="form-control" rows="3" style="margin-top:6px; width:100%;" placeholder="Key factors that adversely affected the score — one per line, up to four" ${dis}>${noticeEsc(r.factors)}</textarea>` : ""}
    </div>`).join("");

  // The Quote Condition card (js/quote-conditions.js) lives inside this popup. Keep its DOM across redraws so a half-filled condition form survives a notice toggle.
  const keptQc = document.getElementById("quoteConditionContainer");
  if (keptQc && keptQc.parentNode) keptQc.parentNode.removeChild(keptQc);
  modal.innerHTML = `
    <div class="modal-content modal-xl" style="max-height:92vh; display:flex; flex-direction:column;">
      <div class="modal-header">
        <div class="u-row-gap10">
          <i class="ph ph-envelope-simple-open text-primary u-fs-22"></i>
          <div>
            <h3 class="u-title-16">Notice Studio</h3>
            <p class="text-xs text-muted u-m0">${noticeEsc(sub.id)} — ${noticeEsc(sub.insured || "N/A")} · ${noticeEsc(sub.lobName || "")}</p>
          </div>
        </div>
        <button class="btn-close" aria-label="Close" onclick="noticeCloseStudio()"><i class="ph ph-x"></i></button>
      </div>
      <div class="modal-body" style="overflow-y:auto;">
        ${hold ? `<div class="alert alert-danger text-xs"><i class="ph ph-prohibit"></i> <strong>Notices are on hold.</strong> A sanctions match is unresolved or confirmed on this submission. Do not issue a notice, and never cite sanctions as a reason; escalate to Compliance.</div>` : ""}
        ${!NOTICE_TEMPLATE_META.approved ? `<div class="alert alert-warning text-xs"><i class="ph ph-warning"></i> Template ${noticeEsc(NOTICE_TEMPLATE_META.version)} has not been approved by Compliance. Notices carry that warning and must not be sent outside a test environment.</div>` : ""}
        ${existing ? `<h4 style="margin:6px 0;">Notices on this submission</h4>
          <div class="rules-table-container"><table class="data-table"><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>${existing}</tbody></table></div>` : ""}
        <h4 style="margin:14px 0 6px;">${noticeStudio.editingId ? "Edit draft " + noticeEsc(noticeStudio.editingId) : "New notice"}</h4>
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          <select id="ns_type" class="form-control" style="width:420px;" ${dis} onchange="noticeRefresh()">${Object.keys(NOTICE_TYPES).map(k => `<option value="${k}" ${f.type === k ? "selected" : ""}>${noticeEsc(NOTICE_TYPES[k].label)}</option>`).join("")}</select>
          <span class="text-xs text-muted">Risk state: ${noticeEsc(st || "unknown")}</span>
        </div>
        ${f.type === "adverse_terms" ? `<textarea id="ns_terms" class="form-control" rows="3" style="margin-top:8px; width:100%;" placeholder="The terms offered, for example: premium increased by 12% over standard; driver J. Smith excluded; physical damage cover declined" ${dis}>${noticeEsc(f.adverseTermsText)}</textarea>` : `<input type="hidden" id="ns_terms" value="">`}
        <h4 style="margin:12px 0 4px;">Reasons</h4>
        ${reasons}
        <textarea id="ns_reasonDetail" class="form-control" rows="2" style="margin-top:6px; width:100%;" placeholder="Explain the reason(s) in plain language (required if Another reason is ticked)" ${dis}>${noticeEsc(f.reasonDetail)}</textarea>
        <h4 style="margin:12px 0 4px;">Consumer report (Fair Credit Reporting Act)</h4>
        <label style="display:block; font-size:12.5px;"><input type="checkbox" id="ns_consumerUsed" ${consumer ? "checked" : ""} ${dis} onchange="noticeRefresh()"> A consumer report about an individual (for example a driver's MVR or an owner's credit-based score) was a factor in this decision. <span class="text-muted">I have confirmed with Compliance that the FCRA applies.</span></label>
        ${consumer ? reportBlocks + (canEdit && (f.reports || []).length < 3 ? `<button class="btn btn-xs btn-outline" style="width:auto; margin-top:8px;" onclick="noticeAddReport()"><i class="ph ph-plus"></i> Add another report</button>` : "") : ""}
        <h4 style="margin:12px 0 4px;">Recipients and delivery</h4>
        <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
          <label style="font-size:12.5px;"><input type="checkbox" id="ns_rcpt_insured" ${f.recipients.insured ? "checked" : ""} ${dis}> Insured</label>
          <label style="font-size:12.5px;"><input type="checkbox" id="ns_rcpt_producer" ${f.recipients.producer ? "checked" : ""} ${dis} ${sub.broker && sub.channelType !== "direct" ? "" : "disabled"}> Producer (${noticeEsc(sub.broker && sub.channelType !== "direct" ? sub.broker : "none — direct")})</label>
          <select id="ns_delivery" class="form-control" style="width:260px;" ${dis}><option value="">Delivery method…</option>${NOTICE_DELIVERY.map(d => `<option ${f.deliveryMethod === d ? "selected" : ""}>${noticeEsc(d)}</option>`).join("")}</select>
          <input id="ns_deliveryRef" class="form-control" style="width:220px;" placeholder="Delivery reference (needed to issue)" value="${noticeEsc(f.deliveryRef)}" ${dis}>
        </div>
        ${needsStateAck ? `<label style="display:block; font-size:12.5px; margin-top:8px;"><input type="checkbox" id="ns_stateAck" ${f.stateAck ? "checked" : ""} ${dis}> No state-specific wording is configured for ${noticeEsc(st || "this state")}. Compliance has reviewed that state's notice requirements.</label>` : `<input type="hidden" id="ns_stateAck">`}
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:14px;">
          <button class="btn btn-sm btn-outline" style="width:auto;" onclick="noticePreview()"><i class="ph ph-eye"></i> Preview</button>
          ${canEdit ? `<button class="btn btn-sm btn-primary" style="width:auto;" onclick="noticeSaveDraft()"><i class="ph ph-floppy-disk"></i> Save draft</button>` : ""}
          ${canIssue ? `<button class="btn btn-sm btn-success" style="width:auto;" onclick="noticeIssue()" ${hold ? "disabled" : ""}><i class="ph ph-paper-plane-tilt"></i> Issue notice</button>` : `<span class="text-xs text-muted"><i class="ph ph-lock"></i> Issuing needs a user with notice approval authority.</span>`}
        </div>
        <div id="ns_preview" style="margin-top:14px;">${noticeStudio.previewHtml ? `<div style="border:1px solid #cbd5e1; border-radius:8px; padding:16px 20px; background:#fff; font-size:13px;">${noticeStudio.previewHtml}</div>` : ""}</div>
        <div id="ns_qc_slot" style="margin-top:18px; border-top:1px solid #e2e8f0; padding-top:14px;"></div>
      </div>
    </div>`;
  const qcSlot = document.getElementById("ns_qc_slot");
  if (qcSlot) {
    const box = keptQc || document.createElement("div");
    box.id = "quoteConditionContainer";
    qcSlot.appendChild(box);
    if (typeof qcRender === "function") qcRender(sub);
  }
  modal.style.display = "flex";
}

function noticePreview() {
  const sub = noticeSub(noticeStudio.subId);
  if (!sub) return;
  noticeCapture();
  const problems = noticeValidate(sub, noticeStudio.form, false);
  const doc = noticeBuildBlocks(sub, noticeStudio.form, {});
  noticeStudio.previewHtml = (problems.length ? `<div class="alert alert-warning text-xs" style="margin-bottom:10px;"><i class="ph ph-warning"></i> Not ready: ${noticeEsc(problems.join("; "))}.</div>` : "") + noticeBlocksToHtml(doc);
  noticeRenderStudio();
}

function noticeSaveDraft() {
  const sub = noticeSub(noticeStudio.subId);
  if (!sub) return;
  if (!hasPermission("notices", "edit")) { denyPermission("notices", "edit"); return; }
  noticeCapture();
  const f = noticeStudio.form;
  const problems = noticeValidate(sub, f, false);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  const list = noticeList(sub);
  let n = noticeStudio.editingId ? list.find(x => x.id === noticeStudio.editingId) : null;
  const isNew = !n;
  if (isNew) {
    n = { id: `NTC-${sub.id}-${list.length + 1}`, status: "draft", createdBy: noticeActor(), createdAt: noticeNow() };
    list.push(n);
  }
  if (n.status !== "draft") { showToast("Only drafts can be edited.", "info"); return; }
  Object.assign(n, JSON.parse(JSON.stringify(f)), { riskState: typeof deriveRiskState === "function" ? deriveRiskState(sub) : null, templateVersion: NOTICE_TEMPLATE_META.version, templateApproved: NOTICE_TEMPLATE_META.approved, updatedBy: noticeActor(), updatedAt: noticeNow() });
  if (isNew) noticeLog(sub, "notice_drafted", `${NOTICE_TYPES[n.type].label} drafted (${n.id}); reasons: ${n.reasons.join(", ")}${noticeNeedsConsumerSection(n) ? "; consumer report disclosure included" : ""}.`);
  noticePersist();
  noticeStudio.editingId = n.id;
  showToast(`Draft ${n.id} saved.`, "success");
  noticeRenderStudio();
  noticeRefreshHost();
}

function noticeEditDraft(id) {
  const sub = noticeSub(noticeStudio.subId);
  const n = sub && noticeList(sub).find(x => x.id === id);
  if (!n || n.status !== "draft") return;
  noticeStudio.editingId = id;
  noticeStudio.form = JSON.parse(JSON.stringify({
    type: n.type, reasons: n.reasons, reasonDetail: n.reasonDetail, adverseTermsText: n.adverseTermsText, consumerUsed: n.consumerUsed, reports: n.reports || [],
    recipients: n.recipients, deliveryMethod: n.deliveryMethod, deliveryRef: n.deliveryRef, stateAck: n.stateAck
  }));
  noticeStudio.previewHtml = "";
  noticeRenderStudio();
}

function noticeIssue() {
  const sub = noticeSub(noticeStudio.subId);
  if (!sub) return;
  if (!hasPermission("notices", "approve")) { denyPermission("notices", "approve"); return; }
  if (noticeSanctionsHold(sub)) { showToast("⛔ A sanctions match is on file. Escalate to Compliance; no notice can be issued.", "danger"); return; }
  noticeCapture();
  const f = noticeStudio.form;
  const problems = noticeValidate(sub, f, true);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  const list = noticeList(sub);
  let n = noticeStudio.editingId ? list.find(x => x.id === noticeStudio.editingId) : null;
  const isNew = !n;
  if (isNew) { n = { id: `NTC-${sub.id}-${list.length + 1}`, createdBy: noticeActor(), createdAt: noticeNow() }; list.push(n); }
  if (n.status === "issued" || n.status === "void") { showToast("This notice is already closed.", "info"); return; }
  Object.assign(n, JSON.parse(JSON.stringify(f)));
  n.status = "issued";
  n.issuedBy = noticeActor();
  n.issuedAt = noticeNow();
  n.riskState = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  n.templateVersion = NOTICE_TEMPLATE_META.version;
  n.templateApproved = NOTICE_TEMPLATE_META.approved;
  const doc = noticeBuildBlocks(sub, n, { issuedAt: n.issuedAt });
  n.text = noticeBlocksToText(doc);
  n.html = noticeBlocksToHtml(doc);
  noticeLog(sub, "notice_issued",
    `${NOTICE_TYPES[n.type].label} ${n.id} issued via ${n.deliveryMethod} (ref ${n.deliveryRef}) to ${[n.recipients.insured ? "insured" : "", n.recipients.producer ? "producer" : ""].filter(Boolean).join(" and ")}. Reasons: ${n.reasons.join(", ")}.${noticeNeedsConsumerSection(n) ? " FCRA consumer-report disclosure included." : ""}${n.templateApproved ? "" : " Template not Compliance-approved."}`);
  noticePersist();
  noticeStudio.editingId = null;
  noticeStudio.form = noticeBlankForm(sub, f.type);
  noticeStudio.previewHtml = "";
  showToast(`Notice ${n.id} issued and logged.`, "success");
  noticeRenderStudio();
  noticeRefreshHost();
}

function noticeVoid(id) {
  const sub = noticeSub(noticeStudio.subId);
  const n = sub && noticeList(sub).find(x => x.id === id);
  if (!n || n.status !== "issued") return;
  if (!hasPermission("notices", "approve")) { denyPermission("notices", "approve"); return; }
  const reason = (window.prompt("Reason for voiding notice " + id + " (it stays in the record):") || "").trim();
  if (reason.length < 5) { showToast("A reason of at least 5 characters is required to void a notice.", "danger"); return; }
  n.status = "void"; n.voidedBy = noticeActor(); n.voidedAt = noticeNow(); n.voidReason = reason;
  noticeLog(sub, "notice_voided", `Notice ${id} voided: ${reason}`);
  noticePersist();
  noticeRenderStudio();
  noticeRefreshHost();
}

function noticeBuildHtmlDocument(sub, n) {
  const body = n.html || noticeBlocksToHtml(noticeBuildBlocks(sub, n, {}));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${noticeEsc(n.id)}</title></head><body style="font-family:Calibri,Arial,sans-serif;max-width:720px;margin:32px auto;font-size:14px;line-height:1.5;color:#111;">${body}${n.status === "void" ? `<p style="color:#b91c1c;"><strong>VOID</strong> — ${noticeEsc(n.voidReason || "")}</p>` : ""}</body></html>`;
}

function noticePrint(id) {
  const sub = noticeSub(noticeStudio.subId);
  const n = sub && noticeList(sub).find(x => x.id === id);
  if (!n) return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  frame.contentDocument.open(); frame.contentDocument.write(noticeBuildHtmlDocument(sub, n)); frame.contentDocument.close();
  setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* printing unavailable */ } setTimeout(() => frame.remove(), 1500); }, 200);
}

function noticeDownload(id) {
  const sub = noticeSub(noticeStudio.subId);
  const n = sub && noticeList(sub).find(x => x.id === id);
  if (!n) return;
  const blob = new Blob([noticeBuildHtmlDocument(sub, n)], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${n.id}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ----------------------------------------------------------------------------
// 4. HOST SCREENS — Decline Center column and the Quote & Bind card
// ----------------------------------------------------------------------------
function noticeRefreshHost() {
  if (typeof renderDeclineCenter === "function" && document.getElementById("exitAuditTable")) renderDeclineCenter();
  const s = noticeSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null);
  if (s) renderNoticesCard(s);
}

function noticeDeclineCell(entry) {
  const sub = noticeSub(entry.subId);
  if (!sub) return "";
  const issued = noticeIssuedOfType(sub, "declination");
  if (issued.length) return `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="noticeOpenStudio('${noticeEsc(sub.id)}','declination')"><i class="ph ph-check-circle text-success"></i> Notice issued</button>`;
  const drafts = noticeList(sub).filter(n => n.status === "draft").length;
  const ageDays = (() => { const t = Date.parse(String(entry.at || "").replace(" ", "T")); return isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86400000); })();
  const overdue = ageDays > NOTICE_TARGET_DAYS;
  return `<button class="btn btn-xs ${overdue ? "btn-outline-danger" : "btn-primary"}" style="width:auto;" onclick="noticeOpenStudio('${noticeEsc(sub.id)}','declination')"><i class="ph ph-envelope-simple"></i> ${drafts ? "Draft saved" : "Notice due"}${overdue ? " (overdue)" : ""}</button>`;
}

function noticeDecorateDeclineCenter() {
  const tbody = document.getElementById("exitAuditTable");
  if (!tbody || typeof DECLINE_LOG === "undefined") return;
  const rows = tbody.querySelectorAll("tr");
  if (rows.length !== DECLINE_LOG.length) return;
  rows.forEach((tr, idx) => {
    const cells = tr.querySelectorAll("td");
    const last = cells[cells.length - 1];
    if (!last || last.querySelector("[data-notice-cell]")) return;
    const html = noticeDeclineCell(DECLINE_LOG[idx]);
    if (html) last.insertAdjacentHTML("beforeend", `<div data-notice-cell style="margin-top:4px;">${html}</div>`);
  });
}

function noticeToggleAdverseFlag() {
  const sub = noticeSub(activeSubmissionId);
  if (!sub) return;
  if (!hasPermission("notices", "edit")) { denyPermission("notices", "edit"); const el = document.getElementById("noticeAdverseFlag"); if (el) el.checked = !!sub.adverseTermsRequiresNotice; return; }
  sub.adverseTermsRequiresNotice = noticeC("noticeAdverseFlag");
  noticeLog(sub, "notice_flag_changed", sub.adverseTermsRequiresNotice
    ? "Marked: adverse quote terms rest on a consumer report — an adverse-action notice must be issued before the quote is issued."
    : "Cleared: adverse quote terms no longer rest on a consumer report.");
  noticePersist();
  renderNoticesCard(sub);
}

function noticeAdverseGate(sub) {
  if (!sub.adverseTermsRequiresNotice) return { blocked: false };
  return noticeIssuedOfType(sub, "adverse_terms").length ? { blocked: false } : { blocked: true };
}

function renderNoticesCard(sub) {
  const box = document.getElementById("noticesContainer");
  if (!box || !sub) return;
  const canEdit = hasPermission("notices", "edit");
  const gate = noticeAdverseGate(sub);
  const list = noticeList(sub).filter(n => n.type === "adverse_terms");
  const rows = list.map(n => `<tr><td>${noticeEsc(n.id)}</td><td>${noticeStatusBadge(n)}</td><td>${noticeEsc(n.status === "issued" ? n.issuedAt : n.createdAt)}</td></tr>`).join("");
  box.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <h3><i class="ph ph-envelope-simple"></i> Adverse-Action Notice</h3>
        <span class="badge ${gate.blocked ? "badge-danger" : (sub.adverseTermsRequiresNotice ? "badge-success" : "badge-light")}">${gate.blocked ? "Notice required" : (sub.adverseTermsRequiresNotice ? "Notice issued" : "Not flagged")}</span>
      </div>
      <div class="card-body">
        <label style="display:block; font-size:12.5px;"><input type="checkbox" id="noticeAdverseFlag" ${sub.adverseTermsRequiresNotice ? "checked" : ""} ${canEdit ? "" : "disabled"} onchange="noticeToggleAdverseFlag()"> The terms on this quote are adverse (higher premium, exclusion or restricted cover) <strong>and</strong> a consumer report about an individual was a factor.</label>
        ${gate.blocked ? `<div class="alert alert-danger text-xs" style="margin-top:8px;"><i class="ph ph-prohibit"></i> <strong>Quote cannot be issued</strong> until an adverse-terms notice has been issued.</div>` : ""}
        ${rows ? `<div class="rules-table-container" style="margin-top:8px;"><table class="data-table"><thead><tr><th>Notice</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
        <div style="margin-top:10px;"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="noticeOpenStudio('${noticeEsc(sub.id)}','adverse_terms')"><i class="ph ph-envelope-simple-open"></i> Open Notice Studio</button></div>
      </div>
    </div>`;
}

function renderNoticesBindBanner(sub) {
  if (!sub) return "";
  if (!noticeAdverseGate(sub).blocked) return "";
  return `<div class="alert alert-danger text-xs" style="margin-bottom:12px;"><i class="ph ph-prohibit"></i> <strong>Quote cannot be issued.</strong> Adverse terms rest on a consumer report; issue the adverse-action notice first (Notice Studio).</div>`;
}

// ----------------------------------------------------------------------------
// 5. HOOKS
// ----------------------------------------------------------------------------
function noticesGuardBind(source) {
  const sub = noticeSub(activeSubmissionId);
  if (!sub) return true;
  if (!noticeAdverseGate(sub).blocked) return true;
  noticeLog(sub, "notice_bind_blocked", `Quote issue attempt blocked (${source}): adverse terms rest on a consumer report and no adverse-action notice has been issued.`);
  noticePersist();
  showToast("⛔ Quote cannot be issued: issue the adverse-action notice first (Notice Studio).", "danger");
  renderNoticesCard(sub);
  return false;
}

(function installNoticeHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.notice_drafted = { label: "Notice Drafted", icon: "ph-envelope-simple", badge: "badge-light", outcome: "outcome-comm" };
    AUDIT_ACTION_META.notice_issued = { label: "Declination / Adverse-Action Notice Issued", icon: "ph-paper-plane-tilt", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.notice_voided = { label: "Notice Voided", icon: "ph-x-circle", badge: "badge-warning", outcome: "outcome-refer" };
    AUDIT_ACTION_META.notice_flag_changed = { label: "Adverse Terms Flag Changed", icon: "ph-flag", badge: "badge-light", outcome: "outcome-comm" };
    AUDIT_ACTION_META.notice_bind_blocked = { label: "Quote Issue Blocked — Notice Required", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }

  const origDecline = window.renderDeclineCenter;
  if (typeof origDecline === "function") {
    window.renderDeclineCenter = function () {
      const r = origDecline.apply(this, arguments);
      try { noticeDecorateDeclineCenter(); } catch (e) { console.warn("Notice column failed:", e); }
      return r;
    };
  }
  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || noticeSub(activeSubmissionId); if (s) renderNoticesCard(s); } catch (e) { console.warn("Notices card failed:", e); }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderNoticesCard(sub); } catch (e) { console.warn("Notices card failed:", e); }
      return r;
    };
  }
  registerGuard("eSign", "adverse-action notices", function () { return noticesGuardBind("e-signature"); });
  registerGuard("issueQuote", "adverse-action notices", function () { return noticesGuardBind("issue quote"); });
})();

window.noticeOpenStudio = noticeOpenStudio;
window.noticeCloseStudio = noticeCloseStudio;
window.noticeRefresh = noticeRefresh;
window.noticeAddReport = noticeAddReport;
window.noticeRemoveReport = noticeRemoveReport;
window.noticePreview = noticePreview;
window.noticeSaveDraft = noticeSaveDraft;
window.noticeEditDraft = noticeEditDraft;
window.noticeIssue = noticeIssue;
window.noticeVoid = noticeVoid;
window.noticePrint = noticePrint;
window.noticeDownload = noticeDownload;
window.noticeToggleAdverseFlag = noticeToggleAdverseFlag;
window.renderNoticesCard = renderNoticesCard;
window.renderNoticesBindBanner = renderNoticesBindBanner;
