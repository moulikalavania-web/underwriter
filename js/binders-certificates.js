/**
 * ============================================================================
 * BINDER, EVIDENCE OF COVERAGE AND CERTIFICATES OF INSURANCE (Add-On) — G15
 * ----------------------------------------------------------------------------
 * Once the policy is bound, the insured and third parties need proof of
 * coverage before the policy documents exist:
 *
 *   BINDER       temporary evidence that coverage is in force, on the bound terms,
 *                until the policy is delivered. It expires, can be replaced, and
 *                can be voided.
 *   CERTIFICATE  a summary of coverage given to a certificate holder (a lender,
 *                a customer, a landlord). It is information only: it confers no
 *                rights and cannot extend or change the policy.
 *                Liability lines use a liability certificate; property uses
 *                evidence of commercial property insurance.
 *
 * Controls built in:
 *   - Nothing is issued until the policy is bound ("Bind & Sync to PAS" has
 *     succeeded and returned a policy number).
 *   - Certificates need an active, unexpired binder.
 *   - Coverages and limits on a certificate are copied from the binder, never
 *     typed, so they cannot overstate the policy.
 *   - A certificate may mention additional insured status, waiver of
 *     subrogation, or primary and non-contributory wording only if the policy
 *     carries the matching endorsement, identified by form number. Wording in
 *     the description of operations that claims such a right without the box
 *     ticked is rejected.
 *   - The statutory-style disclaimer is printed on every certificate.
 *   - Voiding a binder revokes the certificates issued under it.
 *   - Reissuing a certificate to the same holder supersedes the old one.
 *
 * IMPORTANT: layouts imitate the ACORD binder and certificate forms but are not
 * official ACORD forms, and the wording is a TEMPLATE for Compliance to approve.
 * The carrier's NAIC company number must be configured (COI_INSURER_NAIC); until
 * it is, certificates say so. Binder duration (BINDER_VALID_DAYS) is a
 * configuration value; some states cap binder length.
 * ============================================================================
 */

var BINDER_VALID_DAYS = 60;
var COI_INSURER_NAIC = null;
var BINDER_TEMPLATE_META = { version: "DRAFT-0.1", approved: false };
var COI_DISCLAIMER = "THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS NO RIGHTS UPON THE CERTIFICATE HOLDER. THIS CERTIFICATE DOES NOT AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER THE COVERAGE AFFORDED BY THE POLICY DESCRIBED HEREIN.";
var COI_CANCELLATION_NOTE = "Should the policy be cancelled before its expiration date, notice will be delivered in accordance with the policy provisions and applicable law.";
var COI_HOLDER_TYPES = ["Certificate holder", "Additional interest (lender / landlord)", "Mortgagee", "Loss payee"];

// ----------------------------------------------------------------------------
// 1. DATA HELPERS
// ----------------------------------------------------------------------------
function bndSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function bndActiveSub() { return bndSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); }
function bndNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function bndToday() { return new Date().toISOString().slice(0, 10); }
function bndActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function bndEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function bndMoney(n) { return "$" + Number(n || 0).toLocaleString("en-US"); }
function bndLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: 7, decision, by: bndActor(), at: bndNow(), notes });
}
function bndPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function bndAddDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); }
function bndParseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? String(s).slice(0, 10) : null;
}

function bndIsBound(sub) { return !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }

function bndFacts(sub) {
  const effective = bndParseDate(sub.effectiveDate) || bndParseDate(sub.genInfo && sub.genInfo.effective_date) || (sub.pasSync && sub.pasSync.effectiveDate) || null;
  let expiration = bndParseDate(sub.expirationDate) || bndParseDate(sub.genInfo && sub.genInfo.expiration_date) || null;
  if (!expiration && effective) expiration = bndAddDays(effective, 365);
  const dp = sub.discretionaryPricing;
  const q = sub.importedRatingData && sub.importedRatingData.quote;
  const premium = (dp && dp.finalPremium) || (q && q.finalPremium) || null;
  return {
    insured: sub.insured || "", address: sub.address || "",
    producer: sub.channelType === "direct" ? "Direct (no producer)" : (sub.broker || ""),
    carrier: sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "Carrier"),
    mga: sub.mga || "",
    policyNumber: sub.pasSync ? sub.pasSync.policyNumber : "",
    effective, expiration, premium,
    coverages: (sub.coverageRows || []).map(r => ({ line: r.line, limit: r.limit, ded: r.ded })),
    lobKey: sub.lobKey, lobName: sub.lobName || "",
    kind: sub.lobKey === "property" ? "property" : "liability"
  };
}

function bndBinders(sub) { if (!sub.binders) sub.binders = []; return sub.binders; }
function bndCerts(sub) { if (!sub.certificates) sub.certificates = []; return sub.certificates; }

function bndBinderState(b, today) {
  if (b.status !== "active") return b.status;
  return today > b.expires ? "expired" : "active";
}
function bndActiveBinder(sub, today) {
  return bndBinders(sub).filter(b => bndBinderState(b, today || bndToday()) === "active")[0] || null;
}

// ----------------------------------------------------------------------------
// 2. DOCUMENT BUILDERS (pure — return rows and html)
// ----------------------------------------------------------------------------
function bndOpenConditions(sub) {
  if (typeof ensureSubjectivityItems !== "function") return (sub.subjectivities || []).map(t => ({ text: t, due: "" }));
  return ensureSubjectivityItems(sub).filter(i => i.status !== "accepted" && i.status !== "waived")
    .map(i => ({ text: i.text, due: i.timing === "post_bind" ? (i.dueDate ? "due " + i.dueDate : `due ${i.dueDays || 30} days after bind`) : "before binding" }));
}

function bndCoverageTable(cov) {
  if (!cov.length) return `<p>No coverage schedule on file.</p>`;
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 12px;"><thead><tr>
    <th style="text-align:left;border-bottom:1px solid #94a3b8;padding:4px;">Coverage</th><th style="text-align:left;border-bottom:1px solid #94a3b8;padding:4px;">Limits</th><th style="text-align:left;border-bottom:1px solid #94a3b8;padding:4px;">Deductible</th></tr></thead><tbody>` +
    cov.map(c => `<tr><td style="padding:4px;border-bottom:1px solid #e2e8f0;">${bndEsc(c.line)}</td><td style="padding:4px;border-bottom:1px solid #e2e8f0;">${bndEsc(c.limit)}</td><td style="padding:4px;border-bottom:1px solid #e2e8f0;">${bndEsc(c.ded)}</td></tr>`).join("") + `</tbody></table>`;
}

function bndRow(label, value) {
  return `<tr><td style="padding:3px 10px 3px 0;color:#475569;white-space:nowrap;vertical-align:top;">${bndEsc(label)}</td><td style="padding:3px 0;">${bndEsc(value)}</td></tr>`;
}

function bndBinderHtml(sub, f, b) {
  const conds = b.conditions || [];
  return `<h2 style="margin:0 0 4px;font-size:17px;">BINDER OF INSURANCE</h2>
    <div style="color:#64748b;font-size:11.5px;margin-bottom:12px;">ACORD-style layout, not an official ACORD form. ${BINDER_TEMPLATE_META.approved ? "" : `Template ${BINDER_TEMPLATE_META.version} — not approved by Compliance; do not send outside a test environment.`}</div>
    <table style="font-size:13px;margin-bottom:10px;">
      ${bndRow("Binder number", b.id)}${bndRow("Date issued", b.issuedAt)}
      ${bndRow("Policy number", f.policyNumber)}${bndRow("Effective", `${b.effective} (12:01 AM at the insured's address)`)}
      ${bndRow("Policy expiration", f.expiration || "")}${bndRow("This binder expires", b.expires)}
      ${bndRow("Insurer", f.carrier + (COI_INSURER_NAIC ? ` (NAIC ${COI_INSURER_NAIC})` : " (NAIC number not configured)"))}
      ${f.mga ? bndRow("Managing general agent", f.mga) : ""}${bndRow("Producer", f.producer)}
      ${bndRow("Named insured", f.insured)}${bndRow("Address", f.address)}${bndRow("Line of business", f.lobName)}
      ${f.premium ? bndRow("Estimated premium", bndMoney(f.premium) + " (subject to audit and policy terms)") : ""}
    </table>
    <h3 style="font-size:13px;margin:10px 0 2px;">Coverage bound</h3>${bndCoverageTable(b.coverages)}
    ${conds.length ? `<h3 style="font-size:13px;margin:10px 0 2px;">Conditions still outstanding</h3><ul style="margin:2px 0 10px 20px;padding:0;font-size:13px;">${conds.map(c => `<li>${bndEsc(c.text)} <em>(${bndEsc(c.due)})</em></li>`).join("")}</ul>` : ""}
    <p style="font-size:12px;">This binder is a temporary contract of insurance. It is subject to the terms, conditions, limits and exclusions of the policy to be issued, and it is replaced by that policy. It ends on the date above unless extended in writing. The insurer may cancel it in accordance with applicable law.</p>
    <p style="font-size:12px;margin-top:14px;">Issued by ${bndEsc(b.issuedBy)}.</p>`;
}

function bndCertificateHtml(sub, f, b, c) {
  const prop = f.kind === "property";
  const title = prop ? "EVIDENCE OF COMMERCIAL PROPERTY INSURANCE" : "CERTIFICATE OF LIABILITY INSURANCE";
  const endorse = [];
  if (c.additionalInsured) endorse.push(`Additional insured: per endorsement ${c.additionalInsuredForm}`);
  if (c.waiverOfSubrogation) endorse.push(`Waiver of subrogation: per endorsement ${c.waiverOfSubrogationForm}`);
  if (c.primaryNonContributory) endorse.push(`Primary and non-contributory: per endorsement ${c.primaryNonContributoryForm}`);
  return `<h2 style="margin:0 0 4px;font-size:17px;">${title}</h2>
    <div style="color:#64748b;font-size:11.5px;margin-bottom:10px;">ACORD-style layout, not an official ACORD form. ${BINDER_TEMPLATE_META.approved ? "" : `Template ${BINDER_TEMPLATE_META.version} — not approved by Compliance.`}</div>
    <p style="font-size:11px;font-weight:700;border:1px solid #94a3b8;padding:8px;">${bndEsc(COI_DISCLAIMER)}</p>
    <table style="font-size:13px;margin-bottom:10px;">
      ${bndRow("Certificate number", c.id)}${bndRow("Date issued", c.issuedAt)}
      ${bndRow("Producer", f.producer)}${bndRow("Insured", f.insured + (f.address ? ", " + f.address : ""))}
      ${bndRow("Insurer affording coverage", f.carrier + (COI_INSURER_NAIC ? ` — NAIC ${COI_INSURER_NAIC}` : " — NAIC number not configured"))}
      ${bndRow("Policy number", f.policyNumber)}${bndRow("Policy period", `${b.effective} to ${f.expiration || ""}`)}
      ${prop ? bndRow("Location of covered property", f.address) : ""}
    </table>
    <h3 style="font-size:13px;margin:10px 0 2px;">Coverages in force at the date of issue</h3>${bndCoverageTable(b.coverages)}
    ${endorse.length ? `<h3 style="font-size:13px;margin:10px 0 2px;">Endorsements referenced</h3><ul style="margin:2px 0 10px 20px;padding:0;font-size:13px;">${endorse.map(e => `<li>${bndEsc(e)}</li>`).join("")}</ul>` : ""}
    ${c.description ? `<h3 style="font-size:13px;margin:10px 0 2px;">Description of operations / locations</h3><p style="font-size:13px;white-space:pre-line;">${bndEsc(c.description)}</p>` : ""}
    <h3 style="font-size:13px;margin:10px 0 2px;">${bndEsc(c.holderType)}</h3>
    <p style="font-size:13px;white-space:pre-line;">${bndEsc(c.holderName)}\n${bndEsc(c.holderAddress)}${c.loanNumber ? "\nLoan / reference: " + bndEsc(c.loanNumber) : ""}</p>
    <p style="font-size:12px;">${bndEsc(COI_CANCELLATION_NOTE)}</p>
    <p style="font-size:12px;margin-top:14px;">Issued by ${bndEsc(c.issuedBy)}.</p>`;
}

function bndWrapDocument(title, body, status, note) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${bndEsc(title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;max-width:760px;margin:30px auto;font-size:14px;line-height:1.45;color:#111;">${body}${status && status !== "active" && status !== "issued" ? `<p style="color:#b91c1c;font-weight:700;margin-top:16px;">${bndEsc(status.toUpperCase())}${note ? " — " + bndEsc(note) : ""}</p>` : ""}</body></html>`;
}

// ----------------------------------------------------------------------------
// 3. VALIDATION (pure)
// ----------------------------------------------------------------------------
function bndValidateCertificate(c) {
  const p = [];
  if (String(c.holderName || "").trim().length < 2) p.push("enter the certificate holder's name");
  if (String(c.holderAddress || "").trim().length < 8) p.push("enter the certificate holder's full address");
  if (String(c.description || "").length > 600) p.push("keep the description under 600 characters");
  const d = String(c.description || "");
  if (/additional\s+insured/i.test(d) && !c.additionalInsured) p.push("the description claims additional insured status; tick it and give the endorsement form, or remove the wording");
  if (/waive|waiver\s+of\s+subrogation/i.test(d) && !c.waiverOfSubrogation) p.push("the description mentions a waiver of subrogation; tick it and give the endorsement form, or remove the wording");
  if (/primary\s+(and|&)\s+non-?\s?contributory|primary\s+basis/i.test(d) && !c.primaryNonContributory) p.push("the description mentions primary and non-contributory cover; tick it and give the endorsement form, or remove the wording");
  [["additionalInsured", "additionalInsuredForm", "additional insured"], ["waiverOfSubrogation", "waiverOfSubrogationForm", "waiver of subrogation"], ["primaryNonContributory", "primaryNonContributoryForm", "primary and non-contributory"]].forEach(([flag, form, label]) => {
    if (c[flag] && String(c[form] || "").trim().length < 3) p.push(`enter the policy endorsement form number that gives ${label}`);
  });
  return p;
}

// ----------------------------------------------------------------------------
// 4. ACTIONS
// ----------------------------------------------------------------------------
function bndIssueBinder() {
  const sub = bndActiveSub(); if (!sub) return;
  if (!hasPermission("binders", "approve")) { denyPermission("binders", "approve"); return; }
  if (!bndIsBound(sub)) { showToast("⛔ The policy is not bound yet. Bind & Sync to PAS first.", "danger"); return; }
  const f = bndFacts(sub);
  const today = bndToday();
  const existing = bndActiveBinder(sub, today);
  const problems = [];
  if (!f.effective) problems.push("the effective date is missing");
  if (!f.coverages.length) problems.push("there is no coverage schedule to bind");
  if (existing) {
    const el = document.getElementById("bnd_reissueReason");
    if (!el || el.value.trim().length < 5) problems.push("an active binder exists; give a reason (5+ characters) to replace it");
  }
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  if (existing) {
    existing.status = "superseded"; existing.supersededAt = bndNow(); existing.supersededBy = bndActor();
    existing.supersededReason = document.getElementById("bnd_reissueReason").value.trim();
  }
  const list = bndBinders(sub);
  const b = {
    id: `BND-${sub.id}-${list.length + 1}`, status: "active", issuedBy: bndActor(), issuedAt: bndNow(),
    effective: f.effective, expires: (() => { const e = bndAddDays(today, BINDER_VALID_DAYS); return f.expiration && f.expiration < e ? f.expiration : e; })(),
    coverages: JSON.parse(JSON.stringify(f.coverages)), premium: f.premium, policyNumber: f.policyNumber,
    conditions: bndOpenConditions(sub), templateVersion: BINDER_TEMPLATE_META.version, templateApproved: BINDER_TEMPLATE_META.approved
  };
  b.html = bndBinderHtml(sub, f, b);
  list.push(b);
  bndLog(sub, "binder_issued", `Binder ${b.id} issued for policy ${f.policyNumber}: effective ${b.effective}, expires ${b.expires}; ${b.coverages.length} coverage line(s); ${b.conditions.length} condition(s) outstanding.${existing ? ` Replaces ${existing.id} (${existing.supersededReason}).` : ""}${b.templateApproved ? "" : " Template not Compliance-approved."}`);
  bndPersist();
  renderBindersCard(sub);
  showToast(`Binder ${b.id} issued.`, "success");
}

function bndVoidBinder(id) {
  const sub = bndActiveSub(); if (!sub) return;
  if (!hasPermission("binders", "override")) { denyPermission("binders", "override"); return; }
  const b = bndBinders(sub).find(x => x.id === id);
  if (!b || b.status !== "active") return;
  const el = document.getElementById("bnd_voidReason_" + id);
  const reason = el ? el.value.trim() : "";
  if (reason.length < 10) { showToast("A reason of at least 10 characters is required to void a binder.", "danger"); if (el) el.focus(); return; }
  b.status = "void"; b.voidedBy = bndActor(); b.voidedAt = bndNow(); b.voidReason = reason;
  let revoked = 0;
  bndCerts(sub).forEach(c => {
    if (c.status === "issued" && c.binderId === id) { c.status = "revoked"; c.revokedBy = bndActor(); c.revokedAt = bndNow(); c.revokeReason = `Binder ${id} voided: ${reason}`; revoked++; }
  });
  bndLog(sub, "binder_voided", `Binder ${id} voided: ${reason}.${revoked ? ` ${revoked} certificate(s) issued under it were revoked; notify the holders.` : ""}`);
  bndPersist();
  renderBindersCard(sub);
  showToast(`Binder voided${revoked ? `; ${revoked} certificate(s) revoked — notify the holders` : ""}.`, "warning");
}

function bndReadCertForm() {
  const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  const k = id => { const e = document.getElementById(id); return !!(e && e.checked); };
  return {
    holderName: v("bnd_holderName"), holderAddress: v("bnd_holderAddr"), holderType: v("bnd_holderType") || COI_HOLDER_TYPES[0], loanNumber: v("bnd_loan"),
    additionalInsured: k("bnd_ai"), additionalInsuredForm: v("bnd_aiForm"),
    waiverOfSubrogation: k("bnd_wos"), waiverOfSubrogationForm: v("bnd_wosForm"),
    primaryNonContributory: k("bnd_pnc"), primaryNonContributoryForm: v("bnd_pncForm"),
    description: v("bnd_desc")
  };
}

function bndIssueCertificate() {
  const sub = bndActiveSub(); if (!sub) return;
  if (!hasPermission("binders", "edit")) { denyPermission("binders", "edit"); return; }
  if (!bndIsBound(sub)) { showToast("⛔ The policy is not bound yet.", "danger"); return; }
  const binder = bndActiveBinder(sub);
  if (!binder) { showToast("⛔ Certificates need an active binder. Issue (or reissue) the binder first.", "danger"); return; }
  const c = bndReadCertForm();
  const problems = bndValidateCertificate(c);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  const list = bndCerts(sub);
  const holderKey = c.holderName.toLowerCase().replace(/\s+/g, " ");
  let replaced = null;
  list.forEach(x => { if (x.status === "issued" && x.holderName.toLowerCase().replace(/\s+/g, " ") === holderKey && x.holderType === c.holderType) { x.status = "superseded"; x.supersededAt = bndNow(); replaced = x; } });
  Object.assign(c, { id: `COI-${sub.id}-${list.length + 1}`, status: "issued", binderId: binder.id, issuedBy: bndActor(), issuedAt: bndNow(), kind: bndFacts(sub).kind, supersedes: replaced ? replaced.id : null });
  c.html = bndCertificateHtml(sub, bndFacts(sub), binder, c);
  list.push(c);
  bndLog(sub, "certificate_issued", `${c.kind === "property" ? "Evidence of property insurance" : "Certificate of liability insurance"} ${c.id} issued to ${c.holderName} (${c.holderType}) under ${binder.id}.${c.additionalInsured ? ` Additional insured per ${c.additionalInsuredForm}.` : ""}${c.waiverOfSubrogation ? ` Waiver of subrogation per ${c.waiverOfSubrogationForm}.` : ""}${c.primaryNonContributory ? ` Primary and non-contributory per ${c.primaryNonContributoryForm}.` : ""}${replaced ? ` Supersedes ${replaced.id}.` : ""}`);
  bndPersist();
  renderBindersCard(sub);
  showToast(`Certificate ${c.id} issued to ${c.holderName}.`, "success");
}

function bndRevokeCertificate(id) {
  const sub = bndActiveSub(); if (!sub) return;
  if (!hasPermission("binders", "approve")) { denyPermission("binders", "approve"); return; }
  const c = bndCerts(sub).find(x => x.id === id);
  if (!c || c.status !== "issued") return;
  const el = document.getElementById("bnd_revokeReason_" + id);
  const reason = el ? el.value.trim() : "";
  if (reason.length < 5) { showToast("Give a reason for revoking (at least 5 characters).", "danger"); if (el) el.focus(); return; }
  c.status = "revoked"; c.revokedBy = bndActor(); c.revokedAt = bndNow(); c.revokeReason = reason;
  bndLog(sub, "certificate_revoked", `Certificate ${id} (${c.holderName}) revoked: ${reason}. Notify the holder.`);
  bndPersist();
  renderBindersCard(sub);
}

function bndDoc(kind, id) {
  const sub = bndActiveSub(); if (!sub) return null;
  const rec = (kind === "binder" ? bndBinders(sub) : bndCerts(sub)).find(x => x.id === id);
  if (!rec) return null;
  const state = kind === "binder" ? bndBinderState(rec, bndToday()) : rec.status;
  const note = rec.voidReason || rec.revokeReason || rec.supersededReason || "";
  return { rec, html: bndWrapDocument(id, rec.html, state, note) };
}
function bndPrint(kind, id) {
  const d = bndDoc(kind, id); if (!d) return;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  frame.contentDocument.open(); frame.contentDocument.write(d.html); frame.contentDocument.close();
  setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* printing unavailable */ } setTimeout(() => frame.remove(), 1500); }, 200);
}
function bndDownload(kind, id) {
  const d = bndDoc(kind, id); if (!d) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([d.html], { type: "text/html" })); a.download = `${id}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ----------------------------------------------------------------------------
// 5. RENDERING
// ----------------------------------------------------------------------------
function renderBindersCard(sub) {
  const box = document.getElementById("binderCertificatesContainer");
  if (!box || !sub) return;
  const canEdit = hasPermission("binders", "edit"), canIssue = hasPermission("binders", "approve"), canVoid = hasPermission("binders", "override");
  const today = bndToday();
  const bound = bndIsBound(sub);
  const active = bound ? bndActiveBinder(sub, today) : null;
  const f = bndFacts(sub);

  let head;
  if (!bound) head = `<span class="badge badge-light">Available after bind</span>`;
  else if (active) head = `<span class="badge badge-success">Binder active to ${bndEsc(active.expires)}</span>`;
  else head = `<span class="badge badge-warning">No active binder</span>`;

  let body = "";
  if (!bound) {
    body = `<p class="text-xs text-muted"><i class="ph ph-lock"></i> A binder and certificates can be issued once the policy has been bound and a policy number returned by the policy admin system ("Bind &amp; Sync to PAS").</p>`;
  } else {
    const binderRows = bndBinders(sub).slice().reverse().map(b => {
      const st = bndBinderState(b, today);
      const badge = st === "active" ? "badge-success" : (st === "expired" ? "badge-warning" : "badge-light");
      return `<tr><td>${bndEsc(b.id)}</td><td><span class="badge ${badge} text-xs">${bndEsc(st)}</span></td><td>${bndEsc(b.effective)} to ${bndEsc(b.expires)}</td><td>${bndEsc(b.issuedAt)}<div class="text-xs text-muted">${bndEsc(b.issuedBy)}</div></td>
        <td style="white-space:nowrap;"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="bndPrint('binder','${bndEsc(b.id)}')"><i class="ph ph-printer"></i></button>
        <button class="btn btn-xs btn-outline" style="width:auto;" onclick="bndDownload('binder','${bndEsc(b.id)}')"><i class="ph ph-download-simple"></i></button>
        ${st === "active" && canVoid ? `<input id="bnd_voidReason_${bndEsc(b.id)}" class="form-control" style="width:170px;display:inline-block;" placeholder="Reason to void"> <button class="btn btn-xs btn-outline-danger" style="width:auto;" onclick="bndVoidBinder('${bndEsc(b.id)}')">Void</button>` : ""}</td></tr>`;
    }).join("");
    const issueControls = canIssue
      ? `${active ? `<input id="bnd_reissueReason" class="form-control" style="width:260px;display:inline-block;" placeholder="Reason to replace the active binder"> ` : ""}<button class="btn btn-sm btn-primary" style="width:auto;" onclick="bndIssueBinder()"><i class="ph ph-file-text"></i> ${active ? "Reissue binder" : "Issue binder"}</button>`
      : `<span class="text-xs text-muted"><i class="ph ph-lock"></i> Issuing a binder needs a user with binder approval authority.</span>`;

    const certRows = bndCerts(sub).slice().reverse().map(c => {
      const badge = c.status === "issued" ? "badge-success" : (c.status === "revoked" ? "badge-danger" : "badge-light");
      return `<tr><td>${bndEsc(c.id)}</td><td>${bndEsc(c.holderName)}<div class="text-xs text-muted">${bndEsc(c.holderType)}</div></td><td><span class="badge ${badge} text-xs">${bndEsc(c.status)}</span></td><td>${bndEsc(c.issuedAt)}</td>
        <td style="white-space:nowrap;"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="bndPrint('certificate','${bndEsc(c.id)}')"><i class="ph ph-printer"></i></button>
        <button class="btn btn-xs btn-outline" style="width:auto;" onclick="bndDownload('certificate','${bndEsc(c.id)}')"><i class="ph ph-download-simple"></i></button>
        ${c.status === "issued" && canIssue ? `<input id="bnd_revokeReason_${bndEsc(c.id)}" class="form-control" style="width:150px;display:inline-block;" placeholder="Reason to revoke"> <button class="btn btn-xs btn-outline-danger" style="width:auto;" onclick="bndRevokeCertificate('${bndEsc(c.id)}')">Revoke</button>` : ""}</td></tr>`;
    }).join("");

    const certForm = (canEdit && active) ? `
      <h4 style="margin:16px 0 6px;">Issue a ${f.kind === "property" ? "evidence of property insurance" : "certificate of liability insurance"}</h4>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        <input id="bnd_holderName" class="form-control" style="width:260px;" placeholder="Certificate holder name">
        <select id="bnd_holderType" class="form-control" style="width:250px;">${COI_HOLDER_TYPES.map(t => `<option>${bndEsc(t)}</option>`).join("")}</select>
        <input id="bnd_loan" class="form-control" style="width:200px;" placeholder="Loan / reference (optional)">
      </div>
      <textarea id="bnd_holderAddr" class="form-control" rows="2" style="margin-top:8px;width:100%;" placeholder="Certificate holder address"></textarea>
      <textarea id="bnd_desc" class="form-control" rows="2" style="margin-top:8px;width:100%;" placeholder="Description of operations / locations (optional). It cannot grant any right the policy does not give."></textarea>
      <div style="margin-top:8px;font-size:12.5px;">
        <div style="margin-bottom:4px;"><label><input type="checkbox" id="bnd_ai"> Additional insured</label> <input id="bnd_aiForm" class="form-control" style="width:230px;display:inline-block;" placeholder="Policy endorsement form no."></div>
        <div style="margin-bottom:4px;"><label><input type="checkbox" id="bnd_wos"> Waiver of subrogation</label> <input id="bnd_wosForm" class="form-control" style="width:230px;display:inline-block;" placeholder="Policy endorsement form no."></div>
        <div><label><input type="checkbox" id="bnd_pnc"> Primary and non-contributory</label> <input id="bnd_pncForm" class="form-control" style="width:230px;display:inline-block;" placeholder="Policy endorsement form no."></div>
      </div>
      <button class="btn btn-sm btn-primary" style="width:auto;margin-top:10px;" onclick="bndIssueCertificate()"><i class="ph ph-certificate"></i> Issue certificate</button>` : (!active ? `<p class="text-xs text-muted" style="margin-top:12px;"><i class="ph ph-lock"></i> Certificates need an active binder.</p>` : "");

    body = `
      <div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${issueControls}</div>
      ${binderRows ? `<div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Binder</th><th>Status</th><th>Period</th><th>Issued</th><th></th></tr></thead><tbody>${binderRows}</tbody></table></div>` : `<p class="text-xs text-muted">No binder has been issued for policy ${bndEsc(f.policyNumber)}.</p>`}
      <h4 style="margin:16px 0 6px;">Certificates</h4>
      ${certRows ? `<div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Certificate</th><th>Holder</th><th>Status</th><th>Issued</th><th></th></tr></thead><tbody>${certRows}</tbody></table></div>` : `<p class="text-xs text-muted">No certificates issued.</p>`}
      ${certForm}`;
  }

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3><i class="ph ph-certificate"></i> Binder &amp; Certificates of Insurance</h3>${head}</div>
      <div class="card-body">
        ${bound && !active ? `<div class="alert alert-warning text-xs"><i class="ph ph-warning"></i> The policy is bound but has no active binder. Issue one so there is evidence of coverage until the policy is delivered.</div>` : ""}
        ${body}
        <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> Layouts imitate the ACORD binder and certificate forms; they are not official ACORD forms. Wording is a template for Compliance to approve${COI_INSURER_NAIC ? "" : ", and the carrier's NAIC number is not configured yet"}. Some states limit how long a binder may last and regulate certificates of insurance.</p>
      </div>
    </div>`;
}

/** Banners shown beside the "Bind & Sync to PAS" button, so users see what will stop the bind. */
function renderBindStageBanners(sub) {
  if (!sub) return "";
  const parts = [];
  if (typeof renderSubjectivitiesBindBanner === "function") parts.push(renderSubjectivitiesBindBanner(sub, "bind"));
  if (typeof renderTriaBindBanner === "function") parts.push(renderTriaBindBanner(sub, "bind"));
  if (typeof renderSanctionsBindBanner === "function") parts.push(renderSanctionsBindBanner(sub));
  if (typeof renderProducerBindBanner === "function") parts.push(renderProducerBindBanner(sub));
  return parts.join("");
}

// ----------------------------------------------------------------------------
// 6. HOOKS
// ----------------------------------------------------------------------------
(function installBinderHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.binder_issued = m("Binder Issued", "ph-file-text", "badge-success", "outcome-bind");
    AUDIT_ACTION_META.binder_voided = m("Binder Voided", "ph-x-circle", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.certificate_issued = m("Certificate of Insurance Issued", "ph-certificate", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.certificate_revoked = m("Certificate Revoked", "ph-x-circle", "badge-warning", "outcome-refer");
  }
  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || bndActiveSub(); if (s) renderBindersCard(s); } catch (e) { console.warn("Binder card failed:", e); }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderBindersCard(sub); } catch (e) { console.warn("Binder card failed:", e); }
      return r;
    };
  }
})();

window.bndIssueBinder = bndIssueBinder; window.bndVoidBinder = bndVoidBinder;
window.bndIssueCertificate = bndIssueCertificate; window.bndRevokeCertificate = bndRevokeCertificate;
window.bndPrint = bndPrint; window.bndDownload = bndDownload;
window.renderBindersCard = renderBindersCard; window.renderBindStageBanners = renderBindStageBanners;
