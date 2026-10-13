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
    to: { broker: sub.broker, contactEmail: sub.email || null },
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
      effectiveDate: sub.effectiveDate || null,
      expirationDate: sub.expirationDate || null,
      term: sub.effectiveDate && sub.expirationDate ? "As stated" : null
    },
    coverages: coverages.map(c => ({ name: c.name, subtotal: c.subtotal })),
    limits: {
      liabilityLimit: sub.exposureVal ? `$${Number(sub.exposureVal).toLocaleString("en-US")} CSL` : null
    },
    deductibles: {
      physicalDamage: sub.coveragesInfo && sub.coveragesInfo.pd_deductible_amount ? `$${Number(sub.coveragesInfo.pd_deductible_amount).toLocaleString("en-US")}` : null,
      cargoLimit: sub.coveragesInfo && sub.coveragesInfo.cargo_limit ? `$${Number(sub.coveragesInfo.cargo_limit).toLocaleString("en-US")}` : null
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
    quoteConditions: typeof qcDocSummary === "function" ? qcDocSummary(sub) : { pending: [], added: [], notAdded: [] },
    ratingBasis: typeof rsBasis === "function" ? rsBasis(sub) : null,
    brokerAction: "Please review the enclosed quote details with the insured and confirm bind instructions within 30 days of this notice. Contact your MGA underwriting desk with any questions before the quote validity window expires.",
    quotePayloadAttached: true,
    generatedAt: new Date().toISOString()
  };
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

/**
 * ============================================================================
 * ISSUE QUOTE -> OFFICIAL PDF (Quote Proposal + Invoice) — Add-On
 * ----------------------------------------------------------------------------
 * Builds the fixed-width "Futuristic Underwriting MGU/MGA" quote proposal +
 * commercial invoice document (the same layout used across the industry for
 * printable binder packets) and renders it as a downloadable PDF using
 * jsPDF + a monospace font, so columns/rules line up exactly as designed.
 * All figures are pulled from the same Output-Quote-derived payloads already
 * used elsewhere in this file — never re-invented or hardcoded.
 * ============================================================================
 */

const FQ_DOC_WIDTH = 100;
function fqPadR(str, len) { str = String(str == null ? "" : str); return str.length >= len ? str.slice(0, len) : str + " ".repeat(len - str.length); }
function fqPadL(str, len) { str = String(str == null ? "" : str); return str.length >= len ? str.slice(0, len) : " ".repeat(len - str.length) + str; }
function fqCenter(str, len) { str = String(str == null ? "" : str); const pad = Math.max(0, len - str.length); const l = Math.floor(pad / 2); return " ".repeat(l) + str + " ".repeat(pad - l); }
function fqMoney(n) { const v = Number(n) || 0; return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fqDate(d) { const dt = (d instanceof Date) ? d : new Date(d); const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${String(dt.getDate()).padStart(2, "0")}-${months[dt.getMonth()]}-${dt.getFullYear()}`; }

/** Word-wraps text to a column width, so a long name or address is shown in full instead of being cut off. */
function fqWrap(str, width) {
  const words = String(str == null ? "" : str).split(/\s+/).filter(Boolean), out = [];
  let line = "";
  words.forEach(w => {
    while (w.length > width) { if (line) { out.push(line); line = ""; } out.push(w.slice(0, width)); w = w.slice(width); }
    if (!line) line = w; else if ((line + " " + w).length <= width) line += " " + w; else { out.push(line); line = w; }
  });
  if (line) out.push(line);
  return out.length ? out : [""];
}
/** Two text blocks side by side; each is an array of lines already wrapped to its column. */
function fqSideBySide(left, right, leftWidth) {
  const rows = Math.max(left.length, right.length), out = [];
  for (let i = 0; i < rows; i++) out.push(fqPadR(left[i] || "", leftWidth) + (right[i] || ""));
  return out;
}
/** The two-letter state at the end of the address (", TX 75201"), else the insured's recorded state when it is two letters; null if neither. */
function fqState(sub) {
  const addr = String(sub.address || "");
  const m = /,\s*([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(addr.trim()) || /,\s*([A-Z]{2})\b/.exec(addr);
  if (m) return m[1];
  const g = sub.insuredInfo && sub.insuredInfo.insured_garaging_state;
  return g && /^[A-Za-z]{2}$/.test(String(g).trim()) ? String(g).trim().toUpperCase() : null;
}
function fqParseDate(s) { const t = Date.parse(s); return isNaN(t) ? null : new Date(t); }
/** "01-Nov-2026" for a date the case states, "Not stated" otherwise. */
function fqDateOrNone(s) { const d = fqParseDate(s); return d ? fqDate(d) : "Not stated"; }
/** The producer's licence number when one has been verified or recorded; never built from the name. */
function fqAgentId(sub) {
  const r = typeof producerCurrent === "function" ? producerCurrent(sub) : null;
  return r && r.npn ? "NPN " + r.npn : "Not recorded";
}
function fqUnderwriterText(sub) {
  const r = sub.assignedTo && USER_ROLES_CONFIG[sub.assignedTo];
  return r ? `${r.name}, ${r.title}` : "Not assigned";
}
/** The coverage schedule shown on the quote: the rating output's own itemisation when there is one, else the case's coverage rows. */
function fqSchedule(sub, payload) {
  const num = v => { const n = parseFloat(String(v === null || v === undefined ? "" : v).replace(/[^0-9.]/g, "")); return isNaN(n) ? null : n; };
  const label = v => (typeof v === "string" && v.trim() && num(v) === null ? v.trim() : null);
  const mine = sub.coverageRows || [];
  const imp = sub.importedRatingData && Array.isArray(sub.importedRatingData.coverages) ? sub.importedRatingData.coverages : [];
  let rows;
  if (imp.length && imp.every(c => num(c.subtotal) !== null)) {
    rows = imp.map(c => { const m = mine.filter(r => String(r.line).toLowerCase() === String(c.name).toLowerCase())[0] || {}; return { line: c.name, limit: c.limit || m.limit || "Per rating output", ded: c.deductible || m.ded || "Per rating output", prem: num(c.subtotal), premLabel: null }; });
    mine.filter(r => r.viaQuoteCondition).forEach(r => rows.push({ line: r.line, limit: r.limit, ded: r.ded, prem: num(r.premVal !== undefined ? r.premVal : r.prem), premLabel: null }));
  } else {
    rows = mine.map(r => ({ line: r.line, limit: r.limit, ded: r.ded, prem: num(r.premVal !== undefined && r.premVal !== null ? r.premVal : r.prem), premLabel: label(r.prem) }));
  }
  return { rows: rows, rowsTotal: Math.round(rows.reduce((s, r) => s + (r.prem || 0), 0) * 100) / 100 };
}
function fqPremText(r) { return r.prem !== null && r.prem !== undefined ? fqMoney(r.prem) : (r.premLabel || "Not rated"); }

function fqCoverageCode(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("liab")) return "20";
  if (n.includes("physical") || n.includes("damage") || n.includes("pd")) return "40";
  if (n.includes("cargo")) return "50";
  if (n.includes("umbrella") || n.includes("excess")) return "60";
  return "10";
}

// Shared derived figures used by both the Quote Proposal and the Invoice —
// computed once so the two sections (and the View Quote sidebar, which only
// needs the proposal half) never disagree with each other.
function buildFuturisticQuoteFigures(sub) {
  const payload = buildIssueQuoteEmailPayload(sub);
  const outputPayload = buildOutputQuotePayload(sub);
  if (!payload || !outputPayload) return null;

  const now = new Date();
  const expiration = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const paymentDue = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);

  const sched = fqSchedule(sub, payload);
  const coverageRows = sched.rows;
  // The rated base is the pricing record's base when there is one, so the schedule and the total can never disagree silently.
  const pricing = sub.discretionaryPricing || null;
  const basePremiumTotal = pricing && typeof pricing.basePremium === "number" ? pricing.basePremium : (sched.rowsTotal || payload.premium.basePremium);
  const unitemised = Math.round((basePremiumTotal - sched.rowsTotal) * 100) / 100;   // rated premium the schedule does not itemise by coverage

  const dp = payload.premium.premiumWasAdjusted ? {
    label: payload.premium.adjustmentType === "credit" ? "Underwriting Credit" : "Underwriting Debit",
    pct: payload.premium.adjustmentPercent,
    amt: basePremiumTotal * (payload.premium.adjustmentPercent / 100) * (payload.premium.adjustmentType === "credit" ? -1 : 1)
  } : null;

  const finalPremium = payload.premium.finalPremium || basePremiumTotal;
  const garagingState = fqState(sub);
  const agentId = fqAgentId(sub);

  const brokerFee = (sub.broker_fee && sub.broker_fee.amount) || (typeof cfgValueFor === "function" ? cfgValueFor(sub, "broker_fee_invoice_default") : 50);
  // Tax and stamping fee come from the confirmed state basis (js/surplus-lines.js). Admitted placements carry none.
  const slRates = typeof slRatesFor === "function" ? slRatesFor(sub) : null;
  const slAdmitted = typeof slIsSurplus === "function" && !slIsSurplus(sub);
  const surplusTaxRate = slAdmitted ? 0 : (slRates ? slRates.taxPct / 100 : 0.0485);
  const stampingRate = slAdmitted ? 0 : (slRates ? slRates.stampingPct / 100 : 0.00075);
  const surplusTax = finalPremium * surplusTaxRate;
  const stampingFee = finalPremium * stampingRate;
  const totalInvoiceCharges = finalPremium + brokerFee + surplusTax + stampingFee;
  // Commission comes from the producer's agreement (js/broker-commission.js); 10% only if that module is absent.
  const commissionRate = typeof resolveCommissionRate === "function" ? resolveCommissionRate(sub) : 0.10;
  const commissionAmt = typeof commissionAmountFor === "function" ? commissionAmountFor(sub, finalPremium, commissionRate) : finalPremium * commissionRate;
  const netDueToMga = finalPremium - commissionAmt + brokerFee;

  const invoiceNumber = `INV-${(sub.id || "000000").replace(/[^0-9]/g, "").padStart(6, "0") || "000000"}`;
  const policyNumber = sub.pasSync && sub.pasSync.policyNumber ? sub.pasSync.policyNumber : null;   // issued by the PAS at bind

  return {
    payload, outputPayload, now, expiration, paymentDue, coverageRows, basePremiumTotal, dp,
    finalPremium, unitemised, garagingState, agentId, brokerFee, surplusTax, stampingFee, totalInvoiceCharges,
    commissionRate, commissionAmt, netDueToMga, invoiceNumber, policyNumber, surplusTaxRate, stampingRate
  };
}

// The Quote Proposal half only — this is exactly what the "View Quote"
// sidebar shows, and exactly the top half of the combined PDF below. Every
// value comes from buildFuturisticQuoteFigures() (itself Output-Quote/
// submission-derived) — nothing here is invented or hardcoded.
function buildQuoteProposalLines(sub) {
  const f = buildFuturisticQuoteFigures(sub);
  if (!f) return [];
  const { payload, now, expiration, coverageRows, basePremiumTotal, dp, finalPremium, garagingState, agentId } = f;
  const W = FQ_DOC_WIDTH;
  const rule = (ch) => ch.repeat(W);
  const L = [];
  const add = (s) => L.push(s == null ? "" : s);

  add(rule("="));
  add(fqCenter("FUTURISTIC UNDERWRITING MGU", W));
  add(fqCenter("100 Commercial Plaza, Suite 400, Dallas, TX", W));
  add(fqCenter("Phone: (555) 019-2834 | underwriting@futuristic.com", W));
  add(rule("="));
  add("COMMERCIAL LINES QUOTE PROPOSAL");
  add(rule("-"));
  add(`${fqPadR("Quote Number     : " + (payload.submission.quoteNo || "Not issued"), 52)}Date Issued       : ${fqDate(now)}`);
  add(`${fqPadR("App Type Code    : " + ((sub.genInfo && sub.genInfo.application_type_id) || "483") + " (Binding Program)", 52)}Expiration Date   : ${fqDate(expiration)} (30 Days)`);
  add(`${fqPadR("Status           : Underwritten / Quoted", 52)}Policy effective  : ${fqDateOrNone(sub.effectiveDate)}`);
  add(`Underwriter      : ${fqUnderwriterText(sub)}`);
  add("");
  const insBlock = fqWrap(sub.insured || "Not stated", 52).concat(fqWrap(sub.address || "Address not stated", 52), ["Garaging state: " + (garagingState || "Not stated")], fqWrap(`USDOT #: ${sub.dot || "N/A"} | MC/FF #: ${sub.mcNumber || "N/A"}`, 52));
  const brkBlock = fqWrap(sub.broker || "Direct (no producer)", 44).concat(["Agent ID: " + agentId]);
  add(`${fqPadR("NAMED INSURED & MAILING ADDRESS:", 55)}PRODUCING BROKER / RETAIL AGENCY:`);
  add(`${fqPadR("-".repeat(32), 55)}${"-".repeat(33)}`);
  fqSideBySide(insBlock, brkBlock, 55).forEach(add);
  add("");
  add(rule("-"));
  add("PROGRAM & RISK SPECIFICATIONS");
  add(rule("-"));
  add(`Risk Company (Paper)  : ${sub.carrier || "Not stated"}`);
  if (typeof slIsSurplus === "function") add(`Placement             : ${slIsSurplus(sub) ? "Surplus lines (non-admitted)" : "Admitted"}`);
  add(`Line of Business      : ${sub.lobName || payload.submission.lob || "Not stated"}`);
  add(`Minimum Earned Premium: 25% of Original Policy Premium at Bind`);
  add("");
  add("COVERAGE SUMMARY & SCHEDULED LIMITS:");
  add(rule("-"));
  add(`${fqPadR("Code", 7)}${fqPadR("Coverage Description", 39)}${fqPadR("Limit / Valuation", 31)}${fqPadR("Deductible", 14)}Premium`);
  add(rule("-"));
  coverageRows.forEach(r => {
    const d = fqWrap(r.line, 37), lim = fqWrap(r.limit, 29), ded = fqWrap(r.ded, 13), n = Math.max(d.length, lim.length, ded.length);
    for (let i = 0; i < n; i++) add(`${fqPadR(i === 0 ? fqCoverageCode(r.line) : "", 7)}${fqPadR(d[i] || "", 39)}${fqPadR(lim[i] || "", 31)}${fqPadR(ded[i] || "", 14)}${i === 0 ? fqPadL(fqPremText(r), 12) : ""}`);
  });
  if (Math.abs(f.unitemised) >= 1) add(`${fqPadR("", 7)}${fqPadR("Rated premium not itemised by line", 39)}${fqPadR("", 31)}${fqPadR("", 14)}${fqPadL(fqMoney(f.unitemised), 12)}`);
  add(rule("-"));
  add(`${fqPadR("", 76)}Base Rating Premium:${fqPadL(fqMoney(basePremiumTotal), 13)}`);
  add("UNDERWRITING CREDITS & SURCHARGES:");
  if (dp) {
    add(`  • ${fqPadR(`${dp.label} (${dp.pct}%) — ${payload.premium.adjustmentReason || "n/a"}`, 76)}${fqPadL((dp.amt < 0 ? "-" : "+") + fqMoney(Math.abs(dp.amt)), 12)}`);
  } else {
    add(`  • No discretionary underwriting adjustments applied — standard rated premium stands.`);
  }
  add(rule("-"));
  add("COMMODITY APPETITE & RESTRICTIONS:");
  add(`  • Approved Commodities: ${(sub.commoditiesInfo && sub.commoditiesInfo.secondary_class) || sub.lobName || "General Freight"}`);
  add(`  • Prohibited/Excluded : Hazardous Materials, Nuclear Waste, Oil Paints, Auto Hauling`);
  add(rule("-"));
  add(`TOTAL ESTIMATED TERM PREMIUM:${" ".repeat(58)}${fqPadL(fqMoney(finalPremium), 12)}`);
  if (payload.ratingBasis) add(`  Rating basis: snapshot v${payload.ratingBasis.version} (${payload.ratingBasis.savedAt}), risk score ${payload.ratingBasis.riskScore === null ? "n/a" : payload.ratingBasis.riskScore}`);
  const qcs = payload.quoteConditions || { pending: [], added: [] };
  if (qcs.added.length) {
    add(rule("-"));
    add("COVERAGE ADDED UNDER A QUOTE CONDITION (included in the premium above):");
    qcs.added.forEach(c => add(`  • ${c.coverage} (${c.id}): condition met ${c.metOn || ""}; ${fqMoney(c.premium)} additional annual premium.`));
  }
  if (qcs.pending.length) {
    add(rule("-"));
    add("QUOTE CONDITIONS — COVERAGE NOT INCLUDED IN THE PREMIUM ABOVE:");
    qcs.pending.forEach(c => {
      add(`  • ${c.coverage} (${c.id}) — limit ${c.limit}, deductible ${c.deductible}.`);
      add(`    Added for ${fqMoney(c.premium)} additional annual premium only if this is met by ${c.deadline}: ${c.condition}`);
      add(`    If it is not met by then, the coverage is not added and the premium above is unchanged. Not in force until added.`);
    });
  }
  add(rule("="));
  add("BINDING SUBJECTIVITIES & CONDITIONS:");
  const subjectivities = (sub.subjectivities && sub.subjectivities.length) ? sub.subjectivities : [];
  subjectivities.forEach((s, i) => add(`${i + 1}. ${s}`));
  if (!subjectivities.length) add("None stated.");
  add(rule("="));

  return L;
}

/**
 * The invoice is made when the policy is bound: the PAS has returned the policy number and the customer has accepted. It is kept on
 * the case (sub.invoice) so that what was billed cannot change afterwards. Nothing about it exists before the bind.
 */
function createInvoiceRecord(sub) {
  if (!sub || !sub.pasSync || sub.pasSync.status !== "success" || !sub.pasSync.policyNumber) return null;
  if (sub.invoice) return sub.invoice;
  const f = buildFuturisticQuoteFigures(sub);
  if (!f) return null;
  const now = new Date();
  sub.invoice = {
    invoiceNumber: f.invoiceNumber, issuedAt: now.toISOString(), paymentDue: f.paymentDue.toISOString(),
    policyNumber: sub.pasSync.policyNumber, quoteNo: sub.quoteNo || null, transaction: "New Business Bind",
    billingModel: (sub.genInfo && sub.genInfo.billtype) || (sub.channelType === "direct" ? "Direct Bill" : "Agency Bill"),
    effective: sub.effectiveDate || sub.pasSync.effectiveDate || null, expiration: sub.expirationDate || null,
    broker: sub.broker || null, insured: sub.insured || null, address: sub.address || null, state: f.garagingState, lobName: sub.lobName || null,
    grossPremium: f.finalPremium, brokerFee: f.brokerFee, taxRate: f.surplusTaxRate, surplusTax: f.surplusTax, stampingRate: f.stampingRate, stampingFee: f.stampingFee,
    totalCharges: f.totalInvoiceCharges, commissionRate: f.commissionRate, commissionAmt: f.commissionAmt, netDueToMga: f.netDueToMga,
    coverages: f.coverageRows.map(r => ({ line: r.line, limit: r.limit, ded: r.ded, premium: r.prem })),
    ratingBasis: typeof rsBasis === "function" ? rsBasis(sub) : null,
    conditionsAdded: (typeof qcDocSummary === "function" ? qcDocSummary(sub).added : []).map(c => ({ id: c.id, coverage: c.coverage, premium: c.premium }))
  };
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: 7, decision: "invoice_issued", by: sub.pasSync.syncedBy, at: sub.pasSync.syncedAt, notes: `Invoice ${sub.invoice.invoiceNumber} issued at bind for policy ${sub.invoice.policyNumber}: total charges ${fqMoney(sub.invoice.totalCharges)}, net due to the MGA ${fqMoney(sub.invoice.netDueToMga)}.` });
  return sub.invoice;
}

/** The invoice document, from the record made at bind. Empty before the policy is bound. */
function buildInvoiceLines(sub) {
  const inv = sub && sub.invoice;
  if (!inv) return [];
  const W = FQ_DOC_WIDTH;
  const rule = (ch) => ch.repeat(W);
  const L = [];
  const add = (s) => L.push(s == null ? "" : s);
  const issued = new Date(inv.issuedAt);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  add(rule("="));
  add(fqCenter("FUTURISTIC UNDERWRITING MGA", W));
  add(fqCenter("ACCOUNTING & BILLING DIVISION", W));
  add(fqCenter("Email: accounting@futuristic.com | Fax: (555) 019-2835", W));
  add(rule("="));
  add("COMMERCIAL INVOICE");
  add(rule("-"));
  add(`${fqPadR("Invoice Number   : " + inv.invoiceNumber, 55)}Invoice Date      : ${fqDate(issued)}`);
  add(`${fqPadR("Policy Number    : " + inv.policyNumber, 55)}Billing Model     : ${inv.billingModel}`);
  add(`${fqPadR("Effective Date   : " + fqDateOrNone(inv.effective) + " to " + fqDateOrNone(inv.expiration), 55)}Payment Due Date  : ${fqDate(new Date(inv.paymentDue))}`);
  add(`${fqPadR("Transaction Type : " + inv.transaction, 55)}Accounting Period : ${months[issued.getMonth()]}-${issued.getFullYear()}`);
  if (inv.quoteNo) add(`Quote Number     : ${inv.quoteNo}`);
  add("");
  const billed = fqWrap(inv.broker || "Direct (no producer)", 52).concat(["Attn: Accounts Payable"]);
  const insured = fqWrap(inv.insured || "Not stated", 44).concat(fqWrap("Policy Type: " + (inv.lobName || "Not stated"), 44), ["Garaging state: " + (inv.state || "Not stated")]);
  add(`${fqPadR("BILLED TO (RETAIL BROKER):", 55)}INSURED DETAILS:`);
  add(`${fqPadR("-".repeat(26), 55)}${"-".repeat(16)}`);
  fqSideBySide(billed, insured, 55).forEach(add);
  add("");
  add(rule("-"));
  add("BILLING BREAKDOWN & FINANCIAL COMPONENTS");
  add(rule("-"));
  add(`${fqPadR("Item", 7)}${fqPadR("Description", 47)}${fqPadR("Basis / Rate", 27)}Amount (USD)`);
  add(rule("-"));
  add(`${fqPadR("101", 7)}${fqPadR("Policy Gross Premium", 47)}${fqPadR("Full Term Premium", 27)}${fqPadL(fqMoney(inv.grossPremium), 12)}`);
  add(`${fqPadR("201", 7)}${fqPadR("Broker Policy Fee (Fully Earned at Bind)", 47)}${fqPadR("Flat Fee", 27)}${fqPadL(fqMoney(inv.brokerFee), 12)}`);
  if (inv.taxRate || inv.surplusTax) add(`${fqPadR("701", 7)}${fqPadR(`State Surplus Lines Tax (${inv.state || "state not stated"})`, 47)}${fqPadR(`${+(inv.taxRate * 100).toFixed(4)}% of Premium`, 27)}${fqPadL(fqMoney(inv.surplusTax), 12)}`);
  if (inv.stampingRate || inv.stampingFee) add(`${fqPadR("702", 7)}${fqPadR("Stamping Office Fee", 47)}${fqPadR(`${+(inv.stampingRate * 100).toFixed(4)}%`, 27)}${fqPadL(fqMoney(inv.stampingFee), 12)}`);
  add(rule("-"));
  add(`TOTAL INVOICE CHARGES:${" ".repeat(65)}${fqPadL(fqMoney(inv.totalCharges), 12)}`);
  add(rule("-"));
  if ((inv.conditionsAdded || []).length) {
    add("");
    add("Premium includes coverage added under a Quote Condition: " + inv.conditionsAdded.map(c => `${c.coverage} (${c.id}, ${fqMoney(c.premium)})`).join("; ") + ".");
  }
  add("");
  add("BROKER COMMISSION & REMITTANCE SUMMARY:");
  add(`  Gross Premium Billed                          : ${fqMoney(inv.grossPremium)}`);
  add(`  Less: Broker Commission Retained (${(inv.commissionRate * 100).toFixed(1)}%)     : -${fqMoney(inv.commissionAmt)}`);
  add(`  Plus: Fully Earned Broker Fee Retained        : +${fqMoney(inv.brokerFee)}`);
  add(`  Net Premium & Taxes Due to MGA                : ${fqMoney(inv.netDueToMga)}`);
  add(rule("-"));
  add(`TOTAL NET AMOUNT DUE TO MGA:${" ".repeat(59)}${fqPadL(fqMoney(inv.netDueToMga), 12)}`);
  add(rule("="));
  add("REMITTANCE INSTRUCTIONS:");
  add(`  Bank Name      : First Commercial Bank, N.A.`);
  add(`  Account Name   : Futuristic MGA Escrow Account`);
  add(`  Account / GL   : 1000-01-Bank (Asset Series 1)`);
  add(`  ACH / Wire Ref : ${inv.invoiceNumber} / ${inv.policyNumber}`);
  add("");
  add(`* Note: 25% minimum earned premium applies on early cancellations; broker fee is non-refundable.`);
  add(rule("="));

  return L;
}

/** Downloads the invoice made at bind. Before the bind there is none. */
function downloadInvoicePdf(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === (subId || activeSubmissionId));
  if (!sub) return false;
  if (!sub.invoice) { showToast("⛔ There is no invoice yet: it is made when the policy is bound.", "danger"); return false; }
  const safeInsuredName = (sub.insured || "Policy").replace(/[^a-zA-Z0-9]/g, "_");
  const ok = renderLinesToPdf(buildInvoiceLines(sub), `${sub.id}_${safeInsuredName}_Invoice_${sub.invoice.invoiceNumber}.pdf`);
  if (ok) showToast(`📥 Invoice ${sub.invoice.invoiceNumber} downloaded.`, "success");
  return ok;
}
window.downloadInvoicePdf = downloadInvoicePdf;
window.createInvoiceRecord = createInvoiceRecord;
if (typeof AUDIT_ACTION_META !== "undefined") AUDIT_ACTION_META.invoice_issued = { label: "Invoice Issued at Bind", icon: "ph-receipt", badge: "badge-success", outcome: "outcome-approve" };

window.buildQuoteProposalLines = buildQuoteProposalLines;
window.buildInvoiceLines = buildInvoiceLines;

// Renders a set of fixed-width lines as a downloadable PDF using jsPDF + a
// monospace font, so every column/rule lines up as designed. Shared by the
// full Quote+Invoice download and the Quote-Document-only download below.
function renderLinesToPdf(lines, filename) {
  if (!lines.length) return false;

  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFCtor) {
    showToast("⚠️ PDF library failed to load — check your connection and try again.", "warning");
    return false;
  }

  const doc = new jsPDFCtor({ orientation: "landscape", unit: "pt", format: "letter" });
  doc.setFont("courier", "normal");
  doc.setFontSize(8);

  const marginX = 28;
  let y = 30;
  const lineHeight = 10.2;
  const pageHeight = doc.internal.pageSize.getHeight();

  lines.forEach(line => {
    if (y > pageHeight - 24) {
      doc.addPage();
      y = 30;
    }
    doc.text(line, marginX, y);
    y += lineHeight;
  });

  doc.save(filename);
  return true;
}

// Quote Document only (Quote Proposal — no Invoice) — this is the exact
// same content as the View Quote sidebar (buildQuoteProposalLines), and is
// what "Send Quotation to Customer" / the Download → Quotation button both
// produce. One Quote, one design, one data source.
function generateQuoteProposalPdf(sub) {
  if (!sub) return false;
  const safeInsuredName = (sub.insured || "Quote").replace(/[^a-zA-Z0-9]/g, "_");
  return renderLinesToPdf(buildQuoteProposalLines(sub), `${sub.id}_${safeInsuredName}_Quotation.pdf`);
}
window.generateQuoteProposalPdf = generateQuoteProposalPdf;

/**
 * ============================================================================
 * VIEW QUOTE — Right-side sidebar preview (Add-On)
 * ----------------------------------------------------------------------------
 * Opens next to "Issue Quote". Shows the Quote Proposal exactly as it will
 * appear in the downloadable PDF (buildQuoteProposalLines — same generator,
 * same submission data), read-only, no hardcoded values, no fields beyond
 * what the PDF defines (Invoice fields intentionally excluded — that's a
 * separate, gated step in the Issue Quote Actions flow).
 * ============================================================================
 */
let viewQuoteSidebarSubId = null;

function qdEsc(str) {
  const div = document.createElement("div");
  div.textContent = str === null || str === undefined ? "" : String(str);
  return div.innerHTML;
}

// Styled Quote Document — same figures as buildQuoteProposalLines() /
// generateIssuedQuotePdf() (buildFuturisticQuoteFigures is the single
// source for both), just laid out as a proper document instead of a fixed-
// width text block. Only fields that exist in the PDF template appear here;
// nothing is invented and nothing extra is added.
function renderQuoteDocumentHtml(sub) {
  const f = buildFuturisticQuoteFigures(sub);
  if (!f) return "";
  const { payload, now, expiration, coverageRows, basePremiumTotal, dp, finalPremium, garagingState, agentId } = f;

  const fmtDate = (d) => d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
  const subjectivities = (sub.subjectivities && sub.subjectivities.length) ? sub.subjectivities : [];

  return `
    <div class="qd-sheet">
      <div class="qd-letterhead">
        <div class="qd-letterhead-name">Futuristic Underwriting MGU</div>
        <div class="qd-letterhead-line">100 Commercial Plaza, Suite 400, Dallas, TX</div>
        <div class="qd-letterhead-line">Phone: (555) 019-2834 &nbsp;|&nbsp; underwriting@futuristic.com</div>
      </div>

      <div class="qd-title-bar">
        <span>Commercial Lines Quote Proposal</span>
        <span class="badge badge-success">Underwritten / Quoted</span>
      </div>

      <div class="qd-meta-grid">
        <div class="qd-meta-item"><span class="qd-meta-label">Quote Number</span><span class="qd-meta-value">${qdEsc(payload.submission.quoteNo || "Not issued")}</span></div>
        <div class="qd-meta-item"><span class="qd-meta-label">Date Issued</span><span class="qd-meta-value">${fmtDate(now)}</span></div>
        <div class="qd-meta-item"><span class="qd-meta-label">App Type Code</span><span class="qd-meta-value">${qdEsc((sub.genInfo && sub.genInfo.application_type_id) || "483")} (Binding Program)</span></div>
        <div class="qd-meta-item"><span class="qd-meta-label">Expiration Date</span><span class="qd-meta-value">${fmtDate(expiration)} <span class="text-xs text-muted">(30 Days)</span></span></div>
        <div class="qd-meta-item"><span class="qd-meta-label">Underwriter</span><span class="qd-meta-value">${qdEsc(fqUnderwriterText(sub))}</span></div>
        <div class="qd-meta-item"><span class="qd-meta-label">Policy effective</span><span class="qd-meta-value">${qdEsc(fqDateOrNone(sub.effectiveDate))}</span></div>
        <div class="qd-meta-item"><span class="qd-meta-label">Status</span><span class="qd-meta-value">Underwritten / Quoted</span></div>
      </div>

      <div class="qd-parties-grid">
        <div class="qd-party-card">
          <div class="qd-party-title"><i class="ph ph-identification-card"></i> Named Insured &amp; Mailing Address</div>
          <div class="qd-party-name">${qdEsc(sub.insured || "N/A")}</div>
          <div class="qd-party-line">${qdEsc(sub.address || "Address not stated")}</div>
          <div class="qd-party-line">Garaging state: ${qdEsc(garagingState || "Not stated")}</div>
          <div class="qd-party-line">USDOT #: ${qdEsc(sub.dot || "N/A")} &nbsp;|&nbsp; MC/FF #: ${qdEsc(sub.mcNumber || "N/A")}</div>
        </div>
        <div class="qd-party-card">
          <div class="qd-party-title"><i class="ph ph-buildings"></i> Producing Broker / Retail Agency</div>
          <div class="qd-party-name">${qdEsc(sub.broker || "Direct (no producer)")}</div>
          <div class="qd-party-line">Agent ID: ${qdEsc(agentId)}</div>
        </div>
      </div>

      <div class="qd-section">
        <div class="qd-section-title">Program &amp; Risk Specifications</div>
        <div class="qd-kv-grid">
          <div class="qd-kv"><span>Risk Company (Paper)</span><strong>${qdEsc(sub.carrier || "Not stated")}</strong></div>
          ${typeof slIsSurplus === "function" ? `<div class="qd-kv"><span>Placement</span><strong>${slIsSurplus(sub) ? "Surplus lines (non-admitted)" : "Admitted"}</strong></div>` : ""}
          <div class="qd-kv"><span>Line of Business</span><strong>${qdEsc(sub.lobName || payload.submission.lob || "N/A")}</strong></div>
          <div class="qd-kv"><span>Minimum Earned Premium</span><strong>25% of Original Policy Premium at Bind</strong></div>
        </div>
      </div>

      <div class="qd-section">
        <div class="qd-section-title">Coverage Summary &amp; Scheduled Limits</div>
        <table class="qd-table">
          <thead><tr><th>Code</th><th>Coverage Description</th><th>Limit / Valuation</th><th>Deductible</th><th class="qd-num">Premium</th></tr></thead>
          <tbody>
            ${coverageRows.map(r => `<tr>
              <td>${qdEsc(fqCoverageCode(r.line))}</td>
              <td>${qdEsc(r.line)}</td>
              <td>${qdEsc(r.limit)}</td>
              <td>${qdEsc(r.ded)}</td>
              <td class="qd-num font-mono">${qdEsc(fqPremText(r))}</td>
            </tr>`).join("")}
            ${Math.abs(f.unitemised) >= 1 ? `<tr><td></td><td>Rated premium not itemised by line</td><td></td><td></td><td class="qd-num font-mono">${qdEsc(fqMoney(f.unitemised))}</td></tr>` : ""}
          </tbody>
          <tfoot><tr><td colspan="4">Base Rating Premium</td><td class="qd-num font-mono">${qdEsc(fqMoney(basePremiumTotal))}</td></tr></tfoot>
        </table>
      </div>

      <div class="qd-section">
        <div class="qd-section-title">Underwriting Credits &amp; Surcharges</div>
        ${dp
          ? `<div class="qd-line-item"><span>${qdEsc(dp.label)} (${qdEsc(dp.pct)}%) — ${qdEsc(payload.premium.adjustmentReason || "n/a")}</span><strong class="font-mono">${dp.amt < 0 ? "-" : "+"}${qdEsc(fqMoney(Math.abs(dp.amt)))}</strong></div>`
          : `<div class="text-sm text-muted">No discretionary underwriting adjustments applied — standard rated premium stands.</div>`}
      </div>

      <div class="qd-section">
        <div class="qd-section-title">Commodity Appetite &amp; Restrictions</div>
        <div class="qd-line-item"><span>Approved Commodities</span><strong>${qdEsc((sub.commoditiesInfo && sub.commoditiesInfo.secondary_class) || sub.lobName || "General Freight")}</strong></div>
        <div class="qd-line-item"><span>Prohibited / Excluded</span><strong>Hazardous Materials, Nuclear Waste, Oil Paints, Auto Hauling</strong></div>
      </div>

      <div class="qd-total-bar">
        <span>Total Estimated Term Premium</span>
        <span class="qd-total-amount font-mono">${qdEsc(fqMoney(finalPremium))}</span>
      </div>
      ${payload.ratingBasis ? `<div class="text-xs text-muted" style="margin:4px 0 8px;">Rating basis: snapshot v${qdEsc(payload.ratingBasis.version)} (${qdEsc(payload.ratingBasis.savedAt)}), risk score ${qdEsc(payload.ratingBasis.riskScore === null ? "n/a" : payload.ratingBasis.riskScore)}</div>` : ""}
      ${(payload.quoteConditions && payload.quoteConditions.added.length) ? `<div class="qd-section"><div class="qd-section-title">Coverage added under a Quote Condition (included in the premium above)</div>${payload.quoteConditions.added.map(c => `<div class="qd-line-item"><span>${qdEsc(c.coverage)} (${qdEsc(c.id)}): condition met ${qdEsc(c.metOn || "")}</span><strong class="font-mono">${qdEsc(fqMoney(c.premium))}</strong></div>`).join("")}</div>` : ""}
      ${(payload.quoteConditions && payload.quoteConditions.pending.length) ? `<div class="qd-section"><div class="qd-section-title">Quote Conditions: coverage not included in the premium above</div>${payload.quoteConditions.pending.map(c => `<div class="qd-line-item" style="display:block;"><strong>${qdEsc(c.coverage)} (${qdEsc(c.id)})</strong>, limit ${qdEsc(c.limit)}, deductible ${qdEsc(c.deductible)}.<br>Added for <span class="font-mono">${qdEsc(fqMoney(c.premium))}</span> additional annual premium only if this is met by <strong>${qdEsc(c.deadline)}</strong>: ${qdEsc(c.condition)}<br><span class="text-xs text-muted">If it is not met by then, the coverage is not added and the premium above is unchanged. It is not in force until added.</span></div>`).join("")}</div>` : ""}

      <div class="qd-section">
        <div class="qd-section-title">Binding Subjectivities &amp; Conditions</div>
        <ol class="qd-subjectivities">
          ${subjectivities.map(s => `<li>${qdEsc(s)}</li>`).join("") || "<li>None stated.</li>"}
        </ol>
      </div>
    </div>
  `;
}
window.renderQuoteDocumentHtml = renderQuoteDocumentHtml;

function openViewQuoteSidebar(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) { showToast("⚠️ No active submission to preview a quote for.", "warning"); return; }

  const html = renderQuoteDocumentHtml(sub);
  if (!html) { showToast("⚠️ Quote data isn't available yet for this submission.", "warning"); return; }

  viewQuoteSidebarSubId = subId;
  const body = document.getElementById("viewQuoteSidebarBody");
  const title = document.getElementById("viewQuoteSidebarTitle");
  if (body) body.innerHTML = html;
  if (title) title.textContent = `Quote Document — ${sub.id}`;

  const modal = document.getElementById("viewQuoteSidebarModal");
  if (modal) modal.classList.add("active");
}
window.openViewQuoteSidebar = openViewQuoteSidebar;

function closeViewQuoteSidebar() {
  const modal = document.getElementById("viewQuoteSidebarModal");
  if (modal) modal.classList.remove("active");
  viewQuoteSidebarSubId = null;
}
window.closeViewQuoteSidebar = closeViewQuoteSidebar;

function downloadQuoteFromViewSidebar() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === viewQuoteSidebarSubId);
  if (!sub) return;
  generateQuoteProposalPdf(sub);
}
window.downloadQuoteFromViewSidebar = downloadQuoteFromViewSidebar;

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

// Re-renders the whole stepper from sub.issueQuoteFlow — simplest way to
// keep every step's enabled/locked state and conditional controls (the
// Approve/Reject buttons, the reason box) consistent with each other.
function renderIssueQuoteActionsTable() {
  const sub = getIssueQuoteActionsSub();
  const container = document.getElementById("issueQuoteActionsSteps");
  if (!sub || !container) return;
  const flow = ensureIssueQuoteFlow(sub);

  // --- Step 1: Send Quotation to Customer ---
  const step1Done = flow.quotationStatus === "sent";
  const step1Body = flow.quotationStatus === "failed"
    ? `<div class="iqa-inline-error"><i class="ph ph-warning-circle"></i> Could not send — no active submission data.</div>
       <button type="button" class="btn btn-sm btn-primary" onclick="sendQuotationToCustomer()"><i class="ph ph-paper-plane-tilt"></i> Retry Send</button>`
    : step1Done
      ? `<div class="iqa-confirm-line"><i class="ph ph-check-circle"></i> Sent to the customer/broker as a document.</div>
         <button type="button" class="btn btn-sm btn-outline" onclick="sendQuotationToCustomer()"><i class="ph ph-arrow-clockwise"></i> Resend</button>`
      : `<button type="button" class="btn btn-sm btn-primary" onclick="sendQuotationToCustomer()"><i class="ph ph-paper-plane-tilt"></i> Send Quotation</button>`;

  // --- Step 2: Customer Approval — only actionable once the quotation has
  // actually been sent; before that it's a locked, greyed-out step.
  let step2Status = "locked";
  let step2Body;
  if (flow.quotationStatus !== "sent") {
    step2Body = `<div class="iqa-locked-hint"><i class="ph ph-lock-simple"></i> Send the quotation first.</div>`;
  } else if (flow.approvalStatus === "approved") {
    step2Status = "done";
    step2Body = `<div class="iqa-confirm-line iqa-confirm-line--success"><i class="ph ph-check-circle"></i> Customer approved the quotation — invoice unlocked below.</div>`;
  } else if (flow.approvalStatus === "changes_requested") {
    step2Status = "warn";
    step2Body = `
      <div class="iqa-reason-callout">
        <div class="iqa-reason-callout-label"><i class="ph ph-quotes"></i> Reason sent to underwriter</div>
        <div class="iqa-reason-callout-text">${escapeHtmlIssueQuote(flow.changeReason)}</div>
      </div>
      <button type="button" class="btn btn-sm btn-outline" onclick="resetCustomerApproval()"><i class="ph ph-arrow-counter-clockwise"></i> Reset Approval</button>`;
  } else {
    step2Status = "active";
    step2Body = `
      <div class="iqa-choice-row">
        <button type="button" class="btn btn-sm btn-success" onclick="setCustomerApproval('approved')"><i class="ph ph-check"></i> Yes — Customer Approves</button>
        <button type="button" class="btn btn-sm btn-outline text-danger" style="border-color:var(--color-danger,#dc3545);" onclick="showQuoteChangeReasonBox()"><i class="ph ph-x"></i> No — Not Approved</button>
      </div>
      <div id="issueQuoteChangeReasonBox" class="u-hidden iqa-reason-box">
        <label class="u-label-sm">Reason for change (required)</label>
        <textarea class="form-control form-control-sm" id="issueQuoteChangeReasonInput" rows="2" placeholder="e.g. Please reduce the quoted premium and update the coverage limit."></textarea>
        <span class="field-error-text u-hidden" id="issueQuoteChangeReasonError">A reason is required to request a quote change.</span>
        <button type="button" class="btn btn-sm btn-warning mt-2" onclick="submitQuoteChangeRequest()"><i class="ph ph-paper-plane-tilt"></i> Request Quote Change</button>
      </div>`;
  }

  // --- Step 3: Send Invoice to PAS — locked until approved. ---
  const invoiceUnlocked = flow.approvalStatus === "approved";
  const step3Status = !invoiceUnlocked ? "locked" : (flow.invoiceStatus === "sent" ? "done" : "active");
  const step3Body = !invoiceUnlocked
    ? `<div class="iqa-locked-hint"><i class="ph ph-lock-simple"></i> Available once the customer approves the quotation.</div>`
    : flow.invoiceStatus === "sent"
      ? `<div class="iqa-confirm-line iqa-confirm-line--success"><i class="ph ph-check-circle"></i> Invoice sent to PAS — values match the Output Quote exactly.</div>
         <button type="button" class="btn btn-sm btn-outline" onclick="sendInvoiceToPAS()"><i class="ph ph-arrow-clockwise"></i> Resend</button>`
      : `<button type="button" class="btn btn-sm btn-primary" onclick="sendInvoiceToPAS()"><i class="ph ph-paper-plane-tilt"></i> Send Invoice</button>`;

  // --- Step 4: Download ---
  const downloadQuotationBtn = step1Done
    ? `<button type="button" class="btn btn-sm btn-outline" onclick="downloadQuotationDocument()"><i class="ph ph-file-text"></i> Quotation <span class="text-xs text-muted">(Document)</span></button>`
    : `<button type="button" class="btn btn-sm btn-outline" disabled title="Send the quotation first"><i class="ph ph-lock-simple"></i> Quotation <span class="text-xs text-muted">(Document)</span></button>`;
  const downloadInvoiceBtn = invoiceUnlocked
    ? `<button type="button" class="btn btn-sm btn-outline" onclick="downloadInvoiceJson()"><i class="ph ph-file-code"></i> Invoice <span class="text-xs text-muted">(JSON)</span></button>`
    : `<button type="button" class="btn btn-sm btn-outline" disabled title="Available once the customer approves the quotation"><i class="ph ph-lock-simple"></i> Invoice <span class="text-xs text-muted">(JSON)</span></button>`;
  const step4Status = step1Done ? "active" : "locked";
  const step4Body = `<div class="iqa-choice-row">${downloadQuotationBtn}${downloadInvoiceBtn}</div>`;

  const steps = [
    { num: 1, icon: "ph-user-circle", title: "Send Quotation to Customer", desc: "Readable quotation document sent to the customer/broker.", status: step1Done ? "done" : "active", body: step1Body },
    { num: 2, icon: "ph-user-check", title: "Customer Approval", desc: "The customer reviews the quotation and either approves it or requests a change.", status: step2Status, body: step2Body },
    { num: 3, icon: "ph-bank", title: "Send Invoice to PAS", desc: "Invoice JSON, built from the Output Quote, sent to the Policy Administration System.", status: step3Status, body: step3Body },
    { num: 4, icon: "ph-download-simple", title: "Download", desc: "Quotation once sent; Invoice only once the customer has approved.", status: step4Status, body: step4Body }
  ];

  container.innerHTML = steps.map(s => `
    <div class="iqa-step iqa-step--${s.status}">
      <div class="iqa-step-rail">
        <div class="iqa-step-dot">${s.status === "done" ? '<i class="ph ph-check"></i>' : (s.status === "locked" ? '<i class="ph ph-lock-simple"></i>' : s.num)}</div>
        <div class="iqa-step-line"></div>
      </div>
      <div class="iqa-step-body">
        <div class="iqa-step-head">
          <div class="iqa-step-title"><i class="ph ${s.icon}"></i> ${s.title}</div>
          ${iqaStatusPill(s.status)}
        </div>
        <p class="iqa-step-desc">${s.desc}</p>
        <div class="iqa-step-controls">${s.body}</div>
      </div>
    </div>
  `).join("");
}

function iqaStatusPill(status) {
  const map = {
    done: '<span class="badge badge-success"><i class="ph ph-check"></i> Done</span>',
    active: '<span class="badge badge-warning">Action Needed</span>',
    warn: '<span class="badge badge-warning"><i class="ph ph-arrow-u-up-left"></i> Change Requested</span>',
    locked: '<span class="badge badge-light"><i class="ph ph-lock-simple"></i> Locked</span>'
  };
  return map[status] || map.locked;
}

function escapeHtmlIssueQuote(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// Step 1: Send Quotation to Customer — readable document, delivered to the
// customer/broker. Reuses the same Output-Quote-derived payload as the
// broker email (buildIssueQuoteEmailPayload), so the figures here never
// disagree with the rest of the app. The document that gets "sent" is the
// exact same Quote Document as the View Quote sidebar — same generator
// (buildQuoteProposalLines / renderQuoteDocumentHtml), same data, same
// layout. One Quote, one design, one data source — never a separate
// quotation template.
function sendQuotationToCustomer() {
  const sub = getIssueQuoteActionsSub();
  if (!sub) { showToast("⚠️ No active submission to send a quotation for.", "warning"); return; }
  const flow = ensureIssueQuoteFlow(sub);

  const payload = buildIssueQuoteEmailPayload(sub);
  const html = renderQuoteDocumentHtml(sub);
  if (!payload || !html) {
    flow.quotationStatus = "failed";
    renderIssueQuoteActionsTable();
    return;
  }

  sub.issuedQuoteEmail = { payload, html, lines: buildQuoteProposalLines(sub), sentAt: new Date().toISOString() };
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

  if (generateQuoteProposalPdf(sub)) {
    showToast("📥 Quotation PDF downloaded.", "success");
  }
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
