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
