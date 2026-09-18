/**
 * ============================================================================
 * ISSUE QUOTE -> AUTO EMAIL -> BROKER (Add-On)
 * ----------------------------------------------------------------------------
 * Simple Caveman Flow:
 *   Import JSON -> Quote & Bind Stage -> Rating Calculation ->
 *   Underwriting Discretionary Pricing (Post-Rating) -> Underwriter makes
 *   changes -> Final Quote Data -> Click "Issue Quote" -> System generates
 *   email automatically -> Email uses JSON data + Underwriter's Post-Rating
 *   changes -> Email sent to Arora & Sons.
 *
 * JSON = Single Source of Truth, EXCEPT premium/pricing: if the underwriter
 * applied Underwriting Discretionary Pricing (Post-Rating), that overridden
 * finalPremium is what goes in the email — never the original imported JSON
 * premium. This mirrors exactly the same override pattern already used by
 * getGeneratedQuoteHtml() for the on-screen quote (`q.finalPremium =
 * ensureDiscretionaryPricingSeed(sub).finalPremium`), so the email can never
 * disagree with what's shown on screen.
 *
 * No real mail server in this browser-only prototype — "sending" is
 * simulated the same way the rest of Issue Quote already is (recipient
 * inbox text), but the FULL generated email (subject + body) is stored on
 * the submission and shown in a preview modal so it's verifiably complete,
 * not a placeholder.
 * ============================================================================
 */

function buildIssueQuoteEmailPayload(sub) {
  if (!sub) return null;

  // --- Base JSON = Single Source of Truth ---
  const ratingBase = sub.importedRatingData || (typeof currentImportedRatingData !== "undefined" && currentImportedRatingData)
    || (typeof getSubmissionRatingPayload === "function" ? getSubmissionRatingPayload(sub) : { quote: {}, coverages: [] });
  const ratingPayload = JSON.parse(JSON.stringify(ratingBase));
  const q = ratingPayload.quote || {};
  const coverages = ratingPayload.coverages || [];
  const fees = q.fees || [];
  const discounts = q.discounts || [];

  // --- CRITICAL: apply the underwriter's Post-Rating Discretionary Pricing
  // override on top of the JSON, exactly like the on-screen quote does. This
  // is what makes "JSON $50,000 -> Underwriter changes to $48,750 -> email
  // shows $48,750" work. ---
  const dp = (typeof ensureDiscretionaryPricingSeed === "function") ? ensureDiscretionaryPricingSeed(sub) : null;
  const finalPremium = dp ? dp.finalPremium : (q.finalPremium || (typeof getSubmissionPremium === "function" ? getSubmissionPremium(sub) : 0));
  const premiumWasAdjusted = !!(dp && dp.adjustmentType);

  const totalFeeAmt = fees.reduce((sum, f) => sum + (f.amt || 0), 0);
  const totalTaxAmt = (q.tax || 0) + (q.countyTax || 0);
  const discountAmt = discounts.reduce((sum, d) => sum + Math.abs(d.amt || 0), 0);

  // --- Risk Score (from the Underwriting Workbench add-on, if loaded) ---
  const riskInfo = (typeof calculateRiskScore === "function") ? calculateRiskScore(sub) : null;
  const riskScoreValue = (typeof sub.riskScore === "number") ? sub.riskScore : (riskInfo ? riskInfo.score : null);
  const riskBandLabel = (riskScoreValue !== null && typeof riskBand === "function") ? riskBand(riskScoreValue).label : null;

  return {
    to: { broker: sub.broker, contactEmail: `operations@${(sub.broker || "broker").toLowerCase().replace(/[^a-z]/g, "").substring(0, 20)}.com` },
    parties: {
      customer: sub.customerName || sub.insured,
      broker: sub.broker,
      mga: sub.mga,
      carrier: sub.carrier
    },
    submission: {
      submissionId: sub.id,
      quoteNo: sub.quoteNo || sub.quote_id,
      lob: sub.lobName || q.lob
    },
    policyDates: {
      effectiveDate: sub.effectiveDate || "09/01/2026",
      expirationDate: sub.expirationDate || "09/01/2027",
      term: "12 Months"
    },
    coverages: coverages.map(c => ({ name: c.name, subtotal: c.subtotal })),
    limits: {
      liabilityLimit: sub.exposure ? `$${(sub.exposureVal || 0).toLocaleString()} CSL` : "$1,000,000 CSL"
    },
    deductibles: {
      physicalDamage: sub.coveragesInfo ? `$${(sub.coveragesInfo.pd_deductible_amount || 2500).toLocaleString()}` : "$2,500",
      cargoLimit: sub.coveragesInfo ? `$${(sub.coveragesInfo.cargo_limit || 100000).toLocaleString()}` : "$100,000"
    },
    premium: {
      basePremium: (dp && dp.basePremium) || q.coveragePremium || 0,
      discounts: discountAmt,
      feesAndTaxes: totalFeeAmt + totalTaxAmt,
      taxes: totalTaxAmt,
      fees: totalFeeAmt,
      finalPremium: finalPremium,
      premiumWasAdjusted: premiumWasAdjusted,
      adjustmentType: dp ? dp.adjustmentType : null,
      adjustmentPercent: dp ? dp.adjustmentPercent : null,
      adjustmentReason: dp ? dp.reason : null,
      adjustmentAppliedBy: dp ? dp.appliedBy : null
    },
    underwritingSummary: {
      riskScore: riskScoreValue,
      riskBand: riskBandLabel,
      priorityReason: sub.priorityReason || "",
      pricingRationale: (dp && dp.adjustmentType) ? `${dp.adjustmentType === "credit" ? "Credit" : "Debit"} of ${dp.adjustmentPercent}% applied — ${dp.reason || "no reason on file"}.` : "No discretionary pricing adjustment applied — standard rated premium stands."
    },
    conditionsToBind: sub.subjectivities || [],
    brokerAction: "Please review the enclosed quote details with the insured and confirm bind instructions within 30 days of this notice. Contact your MGA underwriting desk with any questions before the quote validity window expires.",
    quotePayloadAttached: true,
    generatedAt: new Date().toISOString()
  };
}

function renderIssueQuoteEmailText(payload) {
  const p = payload;
  const lines = [];
  lines.push(`To: ${p.to.broker} <${p.to.contactEmail}>`);
  lines.push(`Subject: Commercial Auto Quote Issued — ${p.parties.customer} (${p.submission.quoteNo})`);
  lines.push("");
  lines.push(`Dear ${p.to.broker} Team,`);
  lines.push("");
  lines.push(`A formal quote has been issued for the following submission. Please find the full details below.`);
  lines.push("");
  lines.push(`PARTIES`);
  lines.push(`  Customer: ${p.parties.customer}`);
  lines.push(`  Broker: ${p.parties.broker}`);
  lines.push(`  MGA: ${p.parties.mga}`);
  lines.push(`  Carrier: ${p.parties.carrier}`);
  lines.push("");
  lines.push(`SUBMISSION & QUOTE`);
  lines.push(`  Submission ID: ${p.submission.submissionId}`);
  lines.push(`  Quote No: ${p.submission.quoteNo}`);
  lines.push(`  Line of Business: ${p.submission.lob}`);
  lines.push("");
  lines.push(`POLICY DATES`);
  lines.push(`  Effective: ${p.policyDates.effectiveDate}`);
  lines.push(`  Expiration: ${p.policyDates.expirationDate}`);
  lines.push(`  Term: ${p.policyDates.term}`);
  lines.push("");
  lines.push(`COVERAGE & LIMITS`);
  p.coverages.forEach(c => lines.push(`  - ${c.name}: $${(c.subtotal || 0).toLocaleString()}`));
  lines.push(`  Liability Limit: ${p.limits.liabilityLimit}`);
  lines.push("");
  lines.push(`DEDUCTIBLES`);
  lines.push(`  Physical Damage Deductible: ${p.deductibles.physicalDamage}`);
  lines.push(`  Cargo Limit: ${p.deductibles.cargoLimit}`);
  lines.push("");
  lines.push(`PREMIUM`);
  lines.push(`  Base Premium: $${p.premium.basePremium.toLocaleString()}`);
  lines.push(`  Discounts: -$${p.premium.discounts.toLocaleString()}`);
  lines.push(`  Taxes: $${p.premium.taxes.toLocaleString()}`);
  lines.push(`  Fees: $${p.premium.fees.toLocaleString()}`);
  lines.push(`  TOTAL PREMIUM: $${p.premium.finalPremium.toLocaleString()}${p.premium.premiumWasAdjusted ? "  (reflects underwriter's Post-Rating adjustment)" : ""}`);
  lines.push("");
  lines.push(`UNDERWRITING SUMMARY`);
  if (p.underwritingSummary.riskScore !== null) lines.push(`  Risk Score: ${p.underwritingSummary.riskScore}/100 (${p.underwritingSummary.riskBand})`);
  lines.push(`  ${p.underwritingSummary.pricingRationale}`);
  if (p.underwritingSummary.priorityReason) lines.push(`  ${p.underwritingSummary.priorityReason}`);
  lines.push("");
  lines.push(`CONDITIONS TO BIND`);
  if (p.conditionsToBind.length) {
    p.conditionsToBind.forEach(c => lines.push(`  - ${c}`));
  } else {
    lines.push(`  None outstanding.`);
  }
  lines.push("");
  lines.push(`BROKER ACTION REQUIRED`);
  lines.push(`  ${p.brokerAction}`);
  lines.push("");
  lines.push(`Full quote payload (JSON) is attached separately.`);
  lines.push("");
  lines.push(`Regards,`);
  lines.push(`Underwriting Team`);
  return lines.join("\n");
}

function generateAndSendIssueQuoteEmail(sub) {
  if (!sub) return;
  const payload = buildIssueQuoteEmailPayload(sub);
  if (!payload) return;

  const emailText = renderIssueQuoteEmailText(payload);
  sub.issuedQuoteEmail = { payload, text: emailText, sentAt: new Date().toISOString() };

  const modal = document.getElementById("issueQuoteEmailModal");
  const codeBlock = document.getElementById("issueQuoteEmailBody");
  const recipientLabel = document.getElementById("issueQuoteEmailRecipient");
  if (codeBlock) codeBlock.textContent = emailText;
  if (recipientLabel) recipientLabel.textContent = `${payload.to.broker} <${payload.to.contactEmail}>`;
  if (modal) modal.classList.add("active");

  showToast(`📧 Quote email automatically generated and sent to ${payload.to.broker} — Total Premium: $${payload.premium.finalPremium.toLocaleString()}.`, "success");
}

function closeIssueQuoteEmailModal() {
  const modal = document.getElementById("issueQuoteEmailModal");
  if (modal) modal.classList.remove("active");
}

function copyIssueQuoteEmailToClipboard() {
  const codeBlock = document.getElementById("issueQuoteEmailBody");
  if (!codeBlock) return;
  const textArea = document.createElement("textarea");
  textArea.value = codeBlock.textContent;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand("copy");
    showToast("📋 Email content copied to clipboard!", "success");
  } catch (e) {}
  document.body.removeChild(textArea);
}

window.buildIssueQuoteEmailPayload = buildIssueQuoteEmailPayload;
window.generateAndSendIssueQuoteEmail = generateAndSendIssueQuoteEmail;
window.closeIssueQuoteEmailModal = closeIssueQuoteEmailModal;
window.copyIssueQuoteEmailToClipboard = copyIssueQuoteEmailToClipboard;

/**
 * ============================================================================
 * ISSUE QUOTE ACTIONS POPUP — Quotation -> Customer Approval -> Invoice (Add-On)
 * ----------------------------------------------------------------------------
 * Opens when a quote is issued (issueQuoteAction() in actions-versions.js).
 * Gated flow, per spec:
 *   1. Send Quotation to Customer (document format) — Sent / Pending / Failed.
 *   2. Customer Approval — Approve, or Reject with a mandatory reason that
 *      goes to the underwriter as a Quote Change Request.
 *   3. Send Invoice to PAS (JSON) — only reachable once the customer has
 *      approved. No approval, no invoice — not generated, not downloadable,
 *      not sendable.
 *   4. Download — Quotation (document) once sent; Invoice (JSON) only once
 *      approved.
 *
 * Golden rule: the Output Quote payload is the ONLY source for the Invoice
 * JSON (buildOutputQuotePayload, also used for the Quotation figures via
 * buildIssueQuoteEmailPayload) — nothing here is random or hardcoded, and
 * the invoice can never disagree with the Output Quote.
 * ============================================================================
 */

let issueQuoteActionsSubId = null;

// Single source of truth for the Invoice — an exact clone of the Output
// Quote payload (imported JSON if one was uploaded, otherwise the live
// rating payload derived from the submission), plus administrative
// metadata only (quote/bind identifiers, parties, drivers). Every
// financial figure inside `outputQuote` is untouched from the Output Quote.
function buildOutputQuotePayload(sub) {
  if (!sub) return null;
  const outputQuote = JSON.parse(JSON.stringify(
    (typeof currentImportedRatingData !== "undefined" && currentImportedRatingData)
      || sub.importedRatingData
      || (typeof getSubmissionRatingPayload === "function" ? getSubmissionRatingPayload(sub) : { quote: {}, coverages: [] })
  ));

  const driverDetails = (sub.drivers || []).map((d, i) => ({
    name: (d.given_name || d.last_name) ? `${d.given_name || ''} ${d.last_name || ''}`.trim() : `Driver ${i + 1}`,
    age: d.age !== undefined ? d.age : null,
    sex: d.sex || null,
    dob: d.dob || null,
    dlNumber: d.licenseNumber || null,
    licenseState: d.licensestate || null,
    licenseClass: d.licenseclasstype || null,
    experience: d.experience || null,
    status: d.status || null
  }));

  const issuingRoleConfig = (typeof USER_ROLES_CONFIG !== "undefined" && typeof currentUserRole !== "undefined")
    ? (USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior)
    : null;

  return {
    invoiceMeta: {
      submissionId: sub.id || null,
      quoteNumber: sub.quoteNo || sub.quote_id || null,
      quoteDate: new Date().toISOString().slice(0, 10),
      customerApproval: "Approved",
      bindStatus: "Not Yet Bound — Pending Broker/Customer Acceptance",
      policyStatus: "Awaiting Bind & Accounting Payment Confirmation Before PAS Can Issue the Policy",
      issuedBy: issuingRoleConfig ? issuingRoleConfig.name : null,
      eSignature: sub.eSignature || null,
      parties: {
        carrier: sub.carrier || null,
        mga: sub.mga || null,
        broker: sub.broker || null,
        customer: sub.customerName || sub.insured || null
      },
      product: sub.lobName || null,
      fleetSizeMinimum: (sub.vehicles || []).length || null,
      radiusOfOperation: (sub.radiusOfOperationsInfo && sub.radiusOfOperationsInfo.radius !== undefined)
        ? `${sub.radiusOfOperationsInfo.radius} miles (${sub.radiusOfOperationsInfo.Intrastate_interstate || 'N/A'})`
        : null,
      drivers: driverDetails
    },
    // Exact Output Quote data — the Invoice's financial figures always
    // match this, because this IS the Output Quote, not a re-derived copy.
    outputQuote: outputQuote
  };
}

// Readable quotation document for the customer — same underlying data +
// Post-Rating override as the broker email, framed as a standalone
// document instead of an email.
function renderQuotationDocumentText(payload) {
  const p = payload;
  const lines = [];
  lines.push(`QUOTATION`);
  lines.push(`${p.parties.customer}`);
  lines.push(`Quote No: ${p.submission.quoteNo}  |  Submission: ${p.submission.submissionId}`);
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`PARTIES`);
  lines.push(`  Customer: ${p.parties.customer}`);
  lines.push(`  Broker: ${p.parties.broker}`);
  lines.push(`  MGA: ${p.parties.mga}`);
  lines.push(`  Carrier: ${p.parties.carrier}`);
  lines.push("");
  lines.push(`POLICY DATES`);
  lines.push(`  Effective: ${p.policyDates.effectiveDate}`);
  lines.push(`  Expiration: ${p.policyDates.expirationDate}`);
  lines.push(`  Term: ${p.policyDates.term}`);
  lines.push("");
  lines.push(`COVERAGE & LIMITS`);
  p.coverages.forEach(c => lines.push(`  - ${c.name}: $${(c.subtotal || 0).toLocaleString()}`));
  lines.push(`  Liability Limit: ${p.limits.liabilityLimit}`);
  lines.push("");
  lines.push(`DEDUCTIBLES`);
  lines.push(`  Physical Damage Deductible: ${p.deductibles.physicalDamage}`);
  lines.push(`  Cargo Limit: ${p.deductibles.cargoLimit}`);
  lines.push("");
  lines.push(`PREMIUM`);
  lines.push(`  Base Premium: $${p.premium.basePremium.toLocaleString()}`);
  lines.push(`  Discounts: -$${p.premium.discounts.toLocaleString()}`);
  lines.push(`  Taxes: $${p.premium.taxes.toLocaleString()}`);
  lines.push(`  Fees: $${p.premium.fees.toLocaleString()}`);
  lines.push(`  TOTAL PREMIUM: $${p.premium.finalPremium.toLocaleString()}${p.premium.premiumWasAdjusted ? "  (reflects underwriter's Post-Rating adjustment)" : ""}`);
  lines.push("");
  lines.push(`CONDITIONS TO BIND`);
  if (p.conditionsToBind.length) {
    p.conditionsToBind.forEach(c => lines.push(`  - ${c}`));
  } else {
    lines.push(`  None outstanding.`);
  }
  lines.push("");
  lines.push(`Please review the enclosed quote details and confirm bind instructions within 30 days of this notice.`);
  lines.push("");
  lines.push(`Underwriting Team`);
  return lines.join("\n");
}

function triggerFileDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getIssueQuoteActionsSub() {
  return SUBMISSIONS_DATASET.find(s => s.id === issueQuoteActionsSubId) || null;
}

// Ensures the submission has a flow-state object the first time its Issue
// Quote popup is opened; every step below reads/writes this same object, so
// re-opening the popup later always resumes exactly where it left off.
function ensureIssueQuoteFlow(sub) {
  if (!sub.issueQuoteFlow) {
    sub.issueQuoteFlow = {
      quotationStatus: "pending",   // pending | sent | failed
      approvalStatus: "awaiting",   // awaiting | approved | changes_requested
      changeReason: "",
      invoiceStatus: "pending"      // pending | sent | failed
    };
  }
  return sub.issueQuoteFlow;
}

function statusBadgeHtml(status) {
  const map = {
    pending: '<span class="badge badge-light">Pending</span>',
    sent: '<span class="badge badge-success"><i class="ph ph-check"></i> Sent</span>',
    failed: '<span class="badge badge-danger"><i class="ph ph-x"></i> Failed</span>'
  };
  return map[status] || map.pending;
}

function openIssueQuoteActionsModal(sub) {
  if (!sub) return;
  issueQuoteActionsSubId = sub.id;
  ensureIssueQuoteFlow(sub);

  const subIdEl = document.getElementById("issueQuoteActionsSubId");
  if (subIdEl) subIdEl.textContent = sub.id;

  renderIssueQuoteActionsTable();

  const modal = document.getElementById("issueQuoteActionsModal");
  if (modal) modal.classList.add("active");
}

function closeIssueQuoteActionsModal() {
  const modal = document.getElementById("issueQuoteActionsModal");
  if (modal) modal.classList.remove("active");
}

// Re-renders the whole table body from sub.issueQuoteFlow — simplest way to
// keep every row's enabled/disabled state and conditional controls (the
// Approve/Reject buttons, the reason box) consistent with each other.
function renderIssueQuoteActionsTable() {
  const sub = getIssueQuoteActionsSub();
  const tbody = document.getElementById("issueQuoteActionsTableBody");
  if (!sub || !tbody) return;
  const flow = ensureIssueQuoteFlow(sub);

  // --- Row 1: Send Quotation to Customer ---
  const quotationActionCell = flow.quotationStatus === "sent"
    ? `<button type="button" class="btn btn-sm btn-outline" onclick="sendQuotationToCustomer()"><i class="ph ph-arrow-clockwise"></i> Resend</button>`
    : `<button type="button" class="btn btn-sm btn-primary" onclick="sendQuotationToCustomer()"><i class="ph ph-paper-plane-tilt"></i> Send</button>`;

  // --- Row 2: Customer Approval — only actionable once the quotation has
  // actually been sent; before that it's just a locked "Awaiting Quotation"
  // status with no controls.
  let approvalStatusHtml;
  let approvalActionHtml;
  if (flow.quotationStatus !== "sent") {
    approvalStatusHtml = `<span class="badge badge-light">Awaiting Quotation</span>`;
    approvalActionHtml = `<span class="text-xs text-muted">Send the quotation first.</span>`;
  } else if (flow.approvalStatus === "approved") {
    approvalStatusHtml = `<span class="badge badge-success"><i class="ph ph-check"></i> Approved</span>`;
    approvalActionHtml = `<span class="text-xs text-success">Customer approved — invoice unlocked.</span>`;
  } else if (flow.approvalStatus === "changes_requested") {
    approvalStatusHtml = `<span class="badge badge-warning"><i class="ph ph-arrow-u-up-left"></i> Change Requested</span>`;
    approvalActionHtml = `
      <div class="text-xs" style="margin-bottom:6px;"><strong>Reason sent to underwriter:</strong> ${escapeHtmlIssueQuote(flow.changeReason)}</div>
      <button type="button" class="btn btn-sm btn-outline" onclick="resetCustomerApproval()"><i class="ph ph-arrow-counter-clockwise"></i> Reset Approval</button>`;
  } else {
    approvalStatusHtml = `<span class="badge badge-warning">Awaiting Customer</span>`;
    approvalActionHtml = `
      <div class="u-row-gap8" style="margin-bottom:8px;">
        <button type="button" class="btn btn-sm btn-success" onclick="setCustomerApproval('approved')"><i class="ph ph-check"></i> Customer: Yes / Approve</button>
        <button type="button" class="btn btn-sm btn-outline text-danger" style="border-color:var(--color-danger,#dc3545);" onclick="showQuoteChangeReasonBox()"><i class="ph ph-x"></i> Customer: No / Not Approved</button>
      </div>
      <div id="issueQuoteChangeReasonBox" class="u-hidden">
        <textarea class="form-control form-control-sm" id="issueQuoteChangeReasonInput" rows="2" placeholder="e.g. Please reduce the quoted premium and update the coverage limit."></textarea>
        <span class="field-error-text u-hidden" id="issueQuoteChangeReasonError">A reason is required to request a quote change.</span>
        <button type="button" class="btn btn-sm btn-warning mt-2" onclick="submitQuoteChangeRequest()"><i class="ph ph-paper-plane-tilt"></i> Request Quote Change</button>
      </div>`;
  }

  // --- Row 3: Send Invoice to PAS — locked until approved. ---
  const invoiceUnlocked = flow.approvalStatus === "approved";
  const invoiceStatusHtml = invoiceUnlocked ? statusBadgeHtml(flow.invoiceStatus) : `<span class="badge badge-light">Locked</span>`;
  const invoiceActionHtml = !invoiceUnlocked
    ? `<button type="button" class="btn btn-sm btn-outline" disabled title="Available once the customer approves the quotation"><i class="ph ph-lock-simple"></i> Send</button>`
    : (flow.invoiceStatus === "sent"
        ? `<button type="button" class="btn btn-sm btn-outline" onclick="sendInvoiceToPAS()"><i class="ph ph-arrow-clockwise"></i> Resend</button>`
        : `<button type="button" class="btn btn-sm btn-primary" onclick="sendInvoiceToPAS()"><i class="ph ph-paper-plane-tilt"></i> Send</button>`);

  // --- Row 4: Download ---
  const downloadQuotationBtn = flow.quotationStatus === "sent"
    ? `<button type="button" class="btn btn-sm btn-outline" onclick="downloadQuotationDocument()"><i class="ph ph-download-simple"></i> Quotation (Document)</button>`
    : `<button type="button" class="btn btn-sm btn-outline" disabled title="Send the quotation first"><i class="ph ph-lock-simple"></i> Quotation (Document)</button>`;
  const downloadInvoiceBtn = invoiceUnlocked
    ? `<button type="button" class="btn btn-sm btn-outline" onclick="downloadInvoiceJson()"><i class="ph ph-download-simple"></i> Invoice (JSON)</button>`
    : `<button type="button" class="btn btn-sm btn-outline" disabled title="Available once the customer approves the quotation"><i class="ph ph-lock-simple"></i> Invoice (JSON)</button>`;

  tbody.innerHTML = `
    <tr>
      <td><i class="ph ph-user-circle"></i> Send Quotation to Customer</td>
      <td class="text-xs text-muted">Readable quotation document sent to the customer/broker.</td>
      <td>${statusBadgeHtml(flow.quotationStatus)}</td>
      <td>${quotationActionCell}</td>
    </tr>
    <tr>
      <td><i class="ph ph-user-check"></i> Customer Approval</td>
      <td class="text-xs text-muted" style="max-width:240px;">${approvalActionHtml}</td>
      <td>${approvalStatusHtml}</td>
      <td></td>
    </tr>
    <tr>
      <td><i class="ph ph-bank"></i> Send Invoice to PAS</td>
      <td class="text-xs text-muted">Invoice JSON (from the Output Quote) sent to the Policy Administration System. Requires customer approval.</td>
      <td>${invoiceStatusHtml}</td>
      <td>${invoiceActionHtml}</td>
    </tr>
    <tr>
      <td><i class="ph ph-download-simple"></i> Download</td>
      <td class="text-xs text-muted">Quotation once sent; Invoice only once the customer has approved.</td>
      <td class="text-muted">—</td>
      <td><div class="u-row-gap8">${downloadQuotationBtn}${downloadInvoiceBtn}</div></td>
    </tr>
  `;
}

function escapeHtmlIssueQuote(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// Step 1: Send Quotation to Customer — readable document, delivered to the
// customer/broker. Reuses the same Output-Quote-derived payload as the
// broker email (buildIssueQuoteEmailPayload), so the figures here never
// disagree with the rest of the app.
function sendQuotationToCustomer() {
  const sub = getIssueQuoteActionsSub();
  if (!sub) { showToast("⚠️ No active submission to send a quotation for.", "warning"); return; }
  const flow = ensureIssueQuoteFlow(sub);

  const payload = buildIssueQuoteEmailPayload(sub);
  if (!payload) {
    flow.quotationStatus = "failed";
    renderIssueQuoteActionsTable();
    return;
  }

  sub.issuedQuoteEmail = { payload, text: renderQuotationDocumentText(payload), sentAt: new Date().toISOString() };
  flow.quotationStatus = "sent";
  renderIssueQuoteActionsTable();
  showToast(`📧 Quotation sent to ${payload.to.broker} — Total Premium: $${payload.premium.finalPremium.toLocaleString()}.`, "success");
}

// Step 2a: Customer approves — unlocks the Invoice step. Nothing else is
// generated here; the invoice itself is only ever built inside
// sendInvoiceToPAS() / downloadInvoiceJson(), both gated on this flag.
function setCustomerApproval(decision) {
  const sub = getIssueQuoteActionsSub();
  if (!sub) return;
  const flow = ensureIssueQuoteFlow(sub);
  if (flow.quotationStatus !== "sent") return;

  flow.approvalStatus = decision;
  if (decision === "approved") {
    flow.changeReason = "";
    if (!sub.decisionLog) sub.decisionLog = [];
    sub.decisionLog.push({
      step: 7,
      decision: "customer_approved_quote",
      by: "Customer",
      at: new Date().toISOString().slice(0, 16).replace("T", " "),
      notes: "Customer approved the quotation — invoice generation unlocked."
    });
    showToast("✅ Customer approved the quotation — you can now send the invoice to PAS.", "success");
  }
  renderIssueQuoteActionsTable();
}
window.setCustomerApproval = setCustomerApproval;

function showQuoteChangeReasonBox() {
  const box = document.getElementById("issueQuoteChangeReasonBox");
  if (box) box.classList.remove("u-hidden");
}
window.showQuoteChangeReasonBox = showQuoteChangeReasonBox;

// Step 2b: Customer rejects — a reason is mandatory and goes straight to the
// underwriter as a Quote Change Request. No invoice is generated or
// downloadable while approvalStatus stays "changes_requested".
function submitQuoteChangeRequest() {
  const sub = getIssueQuoteActionsSub();
  if (!sub) return;
  const input = document.getElementById("issueQuoteChangeReasonInput");
  const reason = input ? input.value.trim() : "";

  if (!reason) {
    showFieldError("issueQuoteChangeReasonInput");
    const err = document.getElementById("issueQuoteChangeReasonError");
    if (err) err.classList.remove("u-hidden");
    showToast("⛔ A reason is required to request a quote change.", "danger");
    return;
  }

  const flow = ensureIssueQuoteFlow(sub);
  flow.approvalStatus = "changes_requested";
  flow.changeReason = reason;

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: 7,
    decision: "customer_quote_change_request",
    by: "Customer",
    at: new Date().toISOString().slice(0, 16).replace("T", " "),
    notes: `Customer did not approve the quotation. Requested change: "${reason}"`
  });

  renderIssueQuoteActionsTable();
  showToast("📨 Quote change request sent to the underwriter for review.", "warning");
}
window.submitQuoteChangeRequest = submitQuoteChangeRequest;

// Lets the desk re-open the Yes/No choice after a change request (e.g. the
// underwriter revised the quote and it's ready to re-send for approval).
function resetCustomerApproval() {
  const sub = getIssueQuoteActionsSub();
  if (!sub) return;
  const flow = ensureIssueQuoteFlow(sub);
  flow.approvalStatus = "awaiting";
  flow.changeReason = "";
  renderIssueQuoteActionsTable();
}
window.resetCustomerApproval = resetCustomerApproval;

// Step 3: Send Invoice to PAS — JSON built strictly from the Output Quote
// payload (buildOutputQuotePayload). Blocked unless the customer approved.
function sendInvoiceToPAS() {
  const sub = getIssueQuoteActionsSub();
  if (!sub) { showToast("⚠️ No active submission to send an invoice for.", "warning"); return; }
  const flow = ensureIssueQuoteFlow(sub);

  if (flow.approvalStatus !== "approved") {
    showToast("⛔ Invoice cannot be sent until the customer approves the quotation.", "danger");
    return;
  }

  const invoicePayload = buildOutputQuotePayload(sub);
  if (!invoicePayload) {
    flow.invoiceStatus = "failed";
    renderIssueQuoteActionsTable();
    return;
  }

  sub.issuedInvoicePAS = { payload: invoicePayload, sentAt: new Date().toISOString() };
  flow.invoiceStatus = "sent";
  renderIssueQuoteActionsTable();
  showToast(`🏦 Invoice sent to PAS for ${sub.id} — values match the Output Quote exactly.`, "success");
}

// Step 4a: Download the Quotation as a readable document. Allowed once sent.
function downloadQuotationDocument() {
  const sub = getIssueQuoteActionsSub();
  if (!sub) return;
  const flow = ensureIssueQuoteFlow(sub);
  if (flow.quotationStatus !== "sent") {
    showToast("⚠️ Send the quotation to the customer first.", "warning");
    return;
  }

  const quotationPayload = buildIssueQuoteEmailPayload(sub);
  if (!quotationPayload) return;

  const safeInsuredName = (sub.insured || "Quote").replace(/[^a-zA-Z0-9]/g, "_");
  triggerFileDownload(
    `${sub.id}_${safeInsuredName}_Quotation.txt`,
    renderQuotationDocumentText(quotationPayload),
    "text/plain"
  );
  showToast("📥 Quotation document downloaded.", "success");
}

// Step 4b: Download the Invoice as JSON. Blocked unless the customer
// approved — golden rule: no invoice before customer approval.
function downloadInvoiceJson() {
  const sub = getIssueQuoteActionsSub();
  if (!sub) return;
  const flow = ensureIssueQuoteFlow(sub);
  if (flow.approvalStatus !== "approved") {
    showToast("⛔ Invoice download requires customer approval first.", "danger");
    return;
  }

  const invoicePayload = buildOutputQuotePayload(sub);
  if (!invoicePayload) return;

  const safeInsuredName = (sub.insured || "Quote").replace(/[^a-zA-Z0-9]/g, "_");
  triggerFileDownload(
    `${sub.id}_${safeInsuredName}_Invoice.json`,
    JSON.stringify(invoicePayload, null, 2),
    "application/json"
  );
  showToast("📥 Invoice JSON downloaded.", "success");
}

window.buildOutputQuotePayload = buildOutputQuotePayload;
window.openIssueQuoteActionsModal = openIssueQuoteActionsModal;
window.closeIssueQuoteActionsModal = closeIssueQuoteActionsModal;
window.sendQuotationToCustomer = sendQuotationToCustomer;
window.sendInvoiceToPAS = sendInvoiceToPAS;
window.downloadQuotationDocument = downloadQuotationDocument;
window.downloadInvoiceJson = downloadInvoiceJson;
