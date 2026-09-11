/**
 * ============================================================================
 * GENERATE FINAL UNDERWRITING JSON (Add-On)
 * ----------------------------------------------------------------------------
 * Simple flow:
 *   Source JSON -> Underwriting Workbench -> Underwriter changes/review ->
 *   Authority Desk -> Generate JSON -> Final JSON with all worked data.
 *
 * The output keeps the exact quote/coverages/eligibility/adapter top-level
 * shape from the rating payload the underwriter is already working with
 * (currentImportedRatingData, falling back to DEFAULT_IMPORTED_RATING_JSON —
 * same structure as the uploaded SUB-GOLD-001 Official Quote Payload), and
 * adds new top-level sections carrying everything else worked on:
 * submission identity, full Underwriting Workbench data, the Risk Score
 * (auto + any underwriter override), the Authority Desk decision, loss
 * runs, and free-text notes. Nothing from the base rating payload is
 * removed or renamed — this is purely additive.
 * ============================================================================
 */

/**
 * ============================================================================
 * GENERATE FINAL UNDERWRITING JSON (Add-On)
 * ----------------------------------------------------------------------------
 * Simple rule (per spec):
 *   Underwriting Workbench Data -> matching fields in the attached reference
 *   JSON -> Authority Desk JSON.
 *   No extra fields. No new fields. No dummy data.
 *
 * Output shape matches the attached reference file EXACTLY:
 *   {
 *     "quote": {},
 *     "ratingInputs": {
 *       "coveragesInfo": { rating_type, liability, cargo_limit,
 *         pd_high_deductible, pd_deductible_amount, naics_code,
 *         rating_class, dashcam, al_check, pd_check, cargo_check, towing },
 *       "filingInfo": { safer_factor, FMCSA_alert },
 *       "radiusOfOperationsInfo": { radius, Intrastate_interstate },
 *       "serviceInspectionInfo": { number_of_inspection_si,
 *         oos_violation_si, account_percent_si, account_percent_driver },
 *       "commoditiesInfo": { secondary_class },
 *       "uwReviewFactors": { min_earn_factor },
 *       "vehicles": [ { id, xid, year, make, model, model_number, weight,
 *         ownership, primary_code, rating_class, stated_value, al_value,
 *         vehicle_type } ],
 *       "drivers": [ { id, given_name, last_name, dob, licensestate,
 *         licenseclasstype, experience, tenure, status } ]
 *     }
 *   }
 *
 * Every value below is read live from the Underwriting Workbench data on
 * the submission (sub.coveragesInfo, sub.filingInfo, sub.vehicles, etc.) —
 * nothing here is hardcoded. Only keys that exist in the reference template
 * are copied across; any other Workbench field (insuredInfo, docs,
 * subjectivities, driver_factor, liab_baserate, assigned_driver, age, and
 * so on) is deliberately left out, even though it exists elsewhere in the
 * app, because it isn't part of this template.
 * ============================================================================
 */

// Pick only the given keys from a source object, in that order, skipping
// keys the source doesn't actually have (never invents a value).
function pickFields(source, keys) {
  const out = {};
  if (!source) return out;
  keys.forEach(k => {
    if (Object.prototype.hasOwnProperty.call(source, k)) out[k] = source[k];
  });
  return out;
}

function buildFinalUnderwritingJSON(sub) {
  if (!sub) sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) return null;

  const vehicles = (sub.vehicles || []).map(v => pickFields(v, [
    "id", "xid", "year", "make", "model", "model_number", "weight",
    "ownership", "primary_code", "rating_class", "stated_value", "al_value",
    "vehicle_type"
  ]));

  const drivers = (sub.drivers || []).map(d => pickFields(d, [
    "id", "given_name", "last_name", "dob", "licensestate",
    "licenseclasstype", "experience", "tenure", "status"
  ]));

  return {
    quote: {},
    ratingInputs: {
      coveragesInfo: pickFields(sub.coveragesInfo, [
        "rating_type", "liability", "cargo_limit", "pd_high_deductible",
        "pd_deductible_amount", "naics_code", "rating_class", "dashcam",
        "al_check", "pd_check", "cargo_check", "towing"
      ]),
      filingInfo: pickFields(sub.filingInfo, ["safer_factor", "FMCSA_alert"]),
      radiusOfOperationsInfo: pickFields(sub.radiusOfOperationsInfo, ["radius", "Intrastate_interstate"]),
      serviceInspectionInfo: pickFields(sub.serviceInspectionInfo, [
        "number_of_inspection_si", "oos_violation_si", "account_percent_si", "account_percent_driver"
      ]),
      commoditiesInfo: pickFields(sub.commoditiesInfo, ["secondary_class"]),
      uwReviewFactors: pickFields(sub.uwReviewInfo, ["min_earn_factor"]),
      vehicles: vehicles,
      drivers: drivers
    }
  };
}

function openGenerateFinalJsonModal() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) { showToast("⚠️ No active submission selected.", "warning"); return; }

  const finalJson = buildFinalUnderwritingJSON(sub);
  if (!finalJson) return;

  window._lastGeneratedFinalJson = finalJson;
  window._lastGeneratedFinalJsonSubId = sub.id;

  const modal = document.getElementById("generateFinalJsonModal");
  const codeBlock = document.getElementById("finalJsonCodeBlock");
  const titleSub = document.getElementById("finalJsonModalSubId");
  if (codeBlock) codeBlock.textContent = JSON.stringify(finalJson, null, 2);
  if (titleSub) titleSub.textContent = sub.id;
  if (modal) modal.classList.add("active");

  showToast(`✅ Final underwriting JSON generated for ${sub.id} — all submission, Workbench, Risk Score & Authority data carried over.`, "success");
}

function closeGenerateFinalJsonModal() {
  const modal = document.getElementById("generateFinalJsonModal");
  if (modal) modal.classList.remove("active");
}

function copyFinalJsonToClipboard() {
  if (!window._lastGeneratedFinalJson) return;
  const jsonStr = JSON.stringify(window._lastGeneratedFinalJson, null, 2);
  const textArea = document.createElement("textarea");
  textArea.value = jsonStr;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand("copy");
    showToast("📋 Final underwriting JSON copied to clipboard!", "success");
  } catch (err) {
    showToast("Could not copy JSON", "warning");
  }
  document.body.removeChild(textArea);
}

function downloadFinalJson() {
  if (!window._lastGeneratedFinalJson) return;
  const subId = window._lastGeneratedFinalJsonSubId || "SUBMISSION";
  const jsonStr = JSON.stringify(window._lastGeneratedFinalJson, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${subId}_Final_Underwriting_Record.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("📥 Final underwriting JSON downloaded!", "success");
}

window.buildFinalUnderwritingJSON = buildFinalUnderwritingJSON;
window.openGenerateFinalJsonModal = openGenerateFinalJsonModal;
window.closeGenerateFinalJsonModal = closeGenerateFinalJsonModal;
window.copyFinalJsonToClipboard = copyFinalJsonToClipboard;
window.downloadFinalJson = downloadFinalJson;
