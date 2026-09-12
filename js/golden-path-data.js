/**
 * ============================================================================
 * GOLDEN PATH DEMO MODE (Pass 1 — Golden Path Data + Trimmed UI)
 * ----------------------------------------------------------------------------
 * When GOLDEN_PATH_MODE is true, the entire app is filtered down to ONE
 * connected story, end to end:
 *
 *   Carrier: Vikram & Sons  →  MGA: Vikas & Co  →  Broker: Arora & Sons
 *   →  Customer: Ayushi  →  ONE Commercial Auto submission, 2 drivers
 *      (Driver 1: Age 24, Driver 2: Age 25.5)
 *
 * This file is purely additive: it does not delete or rewrite any of the
 * existing generic-demo code paths (SEED_SUBMISSIONS_DATASET, the LOB
 * catalog, Product Studio ingestion, the Email Intake module, etc.) — it
 * loads LAST, after everything else has defined itself, and then:
 *   1. Overwrites the seed dataset with exactly one hand-authored submission
 *      (cloned from the existing trucking template's full schema shape, so
 *      every downstream screen still renders correctly — just re-themed).
 *   2. Trims the LOB selector, the "+ New Submission" modal, and the Email
 *      Digest module's LOB dropdown + demo inbox down to Commercial Auto /
 *      the golden-path cast only.
 *   3. Clears any stale localStorage session so old/unrelated demo data
 *      from a prior build never resurfaces.
 *   4. Auto-loads the golden-path submission on startup so the demo is
 *      ready to walk through immediately — no manual "Load Demo Data" click
 *      required.
 *
 * Set GOLDEN_PATH_MODE = false below to fall back to the original generic
 * 14-submission / 5-LOB demo dataset and full LOB selector untouched.
 * ============================================================================
 */

// Disabled: the app must start fully blank and only ever show data ingested
// for real through the Integrating API module (Product JSON or Email).
// When this was true, it did more than auto-load a demo submission — it
// also overrode ingestProductSchema() so that even a REAL uploaded product
// JSON was discarded and replaced with the hardcoded GOLDEN_PATH_SUBMISSION
// (see the `if (GOLDEN_PATH_MODE && typeof ingestProductSchema...)` block
// below), bypassing generateDynamicSubmissions() and the apiSourced:true
// tagging every other module depends on. Keep this false.
var GOLDEN_PATH_MODE = false;

// ----------------------------------------------------------------------------
// 0. Cast — the ONLY names allowed to appear anywhere in Golden Path Mode.
// ----------------------------------------------------------------------------
var GOLDEN_PATH_CARRIER = "Vikram & Sons";
var GOLDEN_PATH_MGA = "Vikas & Co";
var GOLDEN_PATH_BROKER = "Arora & Sons";
var GOLDEN_PATH_CUSTOMER = "Ayushi";

// ----------------------------------------------------------------------------
// 1. The one golden-path submission. Built by cloning the existing trucking
//    template's full schema (so appetiteRules / losses / enrichmentCards /
//    coverageRows / canonicalJson etc. all stay structurally valid for every
//    downstream screen) and swapping in the golden-path cast + drivers.
//    See build steps documented in project notes; this is the frozen output.
// ----------------------------------------------------------------------------
var GOLDEN_PATH_SUBMISSION = {"id": "SUB-GOLD-001", "lobKey": "trucking", "lobName": "Commercial Auto / Trucking", "channelType": "broker", "channelName": "Broker Intake: Arora & Sons (Email)", "priority": "P1", "priorityScore": 90, "slaText": "4h Fast-Track SLA", "slaCountdown": "3h 30m remaining", "priorityReason": "Golden Path Demo Submission — Vikram & Sons / Vikas & Co / Arora & Sons / Ayushi", "accountName": "Ayushi", "insured": "Ayushi", "fein": "99-0000001", "dot": "9990001", "mcNumber": "MC-999001", "mcs90Filed": true, "minStatutoryLimit": 750000, "address": "Golden Path Demo Address, Demo City", "broker": "Arora & Sons", "email": "operations@aroraandsons.com", "desk": "Commercial Auto UW Desk (Vikas & Co)", "underwriter": null, "exposure": "$500,000", "exposureVal": 500000, "authorityLimit": 1000000, "receivedAt": "2026-09-09 09:00 AM", "receivedTimestamp": 1789108938661, "statusText": "Intake Ingested", "statusBadge": "badge-primary", "currentStep": 1, "completedSteps": [], "docs": [{"name": "ACORD_137_Commercial_Auto_Application.pdf", "type": "pdf", "desc": "Application Form • 4 Pages • 1.4 MB"}, {"name": "Ayushi_Fleet_Vehicle_SOV_Schedule.xlsx", "type": "xls", "desc": "Statement of Values (SOV) • 2 Units • 420 KB"}, {"name": "Prior_3_Years_Loss_Runs_Official.pdf", "type": "pdf", "desc": "Loss Run History • 2 Claims Logged • 2.1 MB"}, {"name": "Driver_MVR_Verification_Report_2026.pdf", "type": "pdf", "desc": "Official MVR Audit • 2 Drivers Pending Verification • 850 KB"}, {"name": "FMCSA_Safety_Inspection_Certificate.pdf", "type": "pdf", "desc": "FMCSA Compliance Audit • Grade A • 1.2 MB"}, {"name": "Handwritten_Broker_Cover_Note.pdf", "type": "pdf", "desc": "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB"}], "ocrFields": [{"key": "DOT / MC Number", "val": "USDOT 9990001 / MC-999001", "conf": "99.8%"}, {"key": "Total Drivers", "val": "2 Drivers (Driver 1: Age 24, Driver 2: Age 25.5)", "conf": "99.5%"}, {"key": "Named Insured", "val": "Ayushi", "conf": "99.6%"}, {"key": "Producing Broker", "val": "Arora & Sons", "conf": "99.4%"}, {"key": "MGA of Record", "val": "Vikas & Co", "conf": "99.0%"}, {"key": "Carrier", "val": "Vikram & Sons", "conf": "99.0%"}, {"key": "Broker Handling Note", "val": "New business — commercial auto coverage for 2 drivers", "conf": "Manual Transcription", "source": "Raw Email (Ayushi → Arora & Sons)"}], "canonicalJson": {"submission_id": "SUB-GOLD-001", "source_channel": "Broker Intake (Email → AI-Normalized) — Arora & Sons", "applicant": {"legal_name": "Ayushi", "fein": "99-0000001", "dot_number": "9990001", "fleet_size": 2, "operating_radius_miles": 450, "garaged_state": "TX"}, "loss_history": {"total_incurred": 14200, "claims_3yr": 2, "loss_ratio": "18.4%"}, "enrichment": {"fmcsa_safety_percentile": 94, "iss_score": "Pass (No Action Required)", "driver_mvr_clean_rate": "91.6%"}, "drivers": [{"id": "DRV-1", "given_name": "Driver", "last_name": "One", "age": 24, "dob": "05/14/2002", "sex": "M", "licenseNumber": "TX-DL-88214093", "licensestate": "TX", "licenseclasstype": "Class A", "experience": "3 Years", "tenure": 1, "status": "Pending Verification", "driver_factor": 1.05}, {"id": "DRV-2", "given_name": "Driver", "last_name": "Two", "age": 25.5, "dob": "03/10/2001", "sex": "F", "licenseNumber": "TX-DL-77035581", "licensestate": "TX", "licenseclasstype": "Class A", "experience": "5 Years", "tenure": 2, "status": "Pending Verification", "driver_factor": 1}], "carrier": "Vikram & Sons", "mga": "Vikas & Co"}, "appetiteRules": [{"ruleId": "UW-000-D1", "category": "Underwriting", "factor": "Minimum Driver Age — Driver 1", "operator": ">=", "baseValue": 25, "unit": "Years", "canOverride": true, "guardrail": ">= 25 (Carrier Guardrail)", "val": "24 Years", "pass": false, "note": "Set by Vikram & Sons (Carrier); MGA (Vikas & Co) / Senior Underwriter may raise/override this within the >= 25 guardrail. Evaluated independently for Driver 1 only."}, {"ruleId": "UW-000-D2", "category": "Underwriting", "factor": "Minimum Driver Age — Driver 2", "operator": ">=", "baseValue": 25, "unit": "Years", "canOverride": true, "guardrail": ">= 25 (Carrier Guardrail)", "val": "25.5 Years", "pass": true, "note": "Set by Vikram & Sons (Carrier); MGA (Vikas & Co) / Senior Underwriter may raise/override this within the >= 25 guardrail. Evaluated independently for Driver 2 only."}, {"ruleId": "UW-001B", "category": "Underwriting", "factor": "Minimum Liability Limit", "operator": ">=", "baseValue": 1000000, "unit": "$", "canOverride": false, "guardrail": "Locked by Carrier — Not Editable", "val": "$1,000,000", "pass": true, "note": "Hard-coded by Vikram & Sons (Carrier). Cannot be changed by MGA or Underwriter — demonstrates controlled authority."}], "enrichmentCards": [{"title": "FMCSA / DOT Safety Score", "icon": "ph-truck", "val": "94th Percentile", "label": "ISS-D Recommendation: PASS", "tag": "badge-success"}, {"title": "DOT Inspection Violations", "icon": "ph-warning", "val": "0.12 / 100k mi", "label": "National Average: 0.48 (Superior)", "tag": "badge-success"}, {"title": "Experian Commercial Credit", "icon": "ph-chart-pie", "val": "88 / 100", "label": "Low Financial Default Risk", "tag": "badge-info"}], "subjectivities": ["Receipt and satisfactory verification of 100% driver MVRs prior to bind.", "Submission of signed Statement of Values with vehicle VIN verification.", "Receipt of pre-employment drug and alcohol testing protocol document."], "losses": [{"year": "2024 - 2025", "desc": "Minor fender damage during backing maneuver", "status": "Closed", "incurred": "$4,200"}, {"year": "2023 - 2024", "desc": "Windshield replacement & minor debris strike", "status": "Closed", "incurred": "$1,800"}, {"year": "2022 - 2023", "desc": "No claims recorded", "status": "Clean", "incurred": "$0"}], "insured_id": 748921043, "submission_id": "SUB-48213-TX", "quote_id": "QT-TRK-2026-89412", "endorsement_number": 0, "broker_fee": {"amount": 2574, "default": 1}, "genInfo": {"quotetype": "Commercial Auto / Trucking", "application_type_id": 483, "company": 210, "lob": "trucking", "policytype": "New Business", "billtype": "Agency Bill", "effective_date": "09/01/2026", "expiration_date": "09/01/2027", "lock_rate_effective_date": "08/25/2026", "business_yrs_exp": "5", "binding": "pending", "al_check": true, "cargo_check": true, "pd_check": true}, "insuredInfo": {"entity_type": "Sole Proprietor / Small Fleet", "insured_name": "Ayushi", "fein": "99-0000001", "dot_number": "9990001", "address": "Golden Path Demo Address, Demo City", "insured_garaging_city": "Demo City", "insured_garaging_state": "TX", "insured_garaging_county": "Demo County", "years_of_experience": 2, "dot_yes_no": "Yes", "icc_filings_yes_no": "No", "description_of_operation": "Small commercial auto fleet — 2 drivers, 3 vehicles, local/regional delivery operations."}, "coveragesInfo": {"rating_type": "Composite Rating Engine", "liability": 500000, "al_deductions": 0, "pd": "Yes", "cargo": "Yes", "cargo_limit": 100000, "pd_high_deductible": "5000", "pd_deductible_amount": 2500, "naics_code": 484110, "rating_class": 5, "dashcam": "No", "al_check": true, "pd_check": true, "cargo_check": true, "towing": "10000"}, "filingInfo": {"safer_factor": "1.0", "FMCSA_alert": "0", "uw_credit_debit_factor": "0.95"}, "radiusOfOperationsInfo": {"radius": 450, "Intrastate_interstate": "Interstate"}, "serviceInspectionInfo": {"number_of_inspection_si": 0, "oos_violation_si": 0, "account_percent_si": "-", "account_percent_driver": "-"}, "commoditiesSelected": [1, 2], "commoditiesInfo": {"secondary_class": "Commercial Auto / Trucking"}, "uwReviewInfo": {"driver_factor": 1, "og_driver_count": 2, "cr_driver_count": 2, "al_pollution": "Low", "al_pollution_factor": "1.00", "uw_credit_debit_factor": "1.0", "loss_experience_factor": "1.0", "min_earn_factor": 25, "broker_fee_amount": 750, "original_driver_exclude_count": 0}, "vehicles": [{"id": 903201, "xid": 1, "year": 2023, "make": "Ford", "model": "Transit 350 Cargo Van", "model_number": "MOD-2023-FT350", "assigned_driver": "Driver One", "vehicle_type": "Cargo Van", "radius_miles": 450, "weight": "Light Commercial", "ownership": "Owned", "primary_code": 332, "rating_class": 5, "stated_value": 250000, "al_value": 170000, "miles_driven": 450, "liab_baserate": 780, "liab_ilf_factor": 1.85, "liab_lcm_factor": 1.5, "liab_fleet_factor": 1, "vehicle_age_factor": 1.04, "radius_factor": 0.95, "naics_factor": 1.1, "al_premium_wo_mod_factor": "$9,850.00"}, {"id": 903202, "xid": 2, "year": 2022, "make": "Freightliner", "model": "M2 106 Box Truck", "model_number": "MOD-2022-FLM2", "assigned_driver": "Driver Two", "vehicle_type": "Box Truck", "radius_miles": 450, "weight": "Medium Commercial", "ownership": "Owned", "primary_code": 332, "rating_class": 5, "stated_value": 250000, "al_value": 170000, "miles_driven": 450, "liab_baserate": 810, "liab_ilf_factor": 1.9, "liab_lcm_factor": 1.55, "liab_fleet_factor": 1, "vehicle_age_factor": 1.08, "radius_factor": 0.95, "naics_factor": 1.1, "al_premium_wo_mod_factor": "$11,400.00"}], "drivers": [{"id": "DRV-1", "given_name": "Driver", "last_name": "One", "age": 24, "dob": "05/14/2002", "sex": "M", "licenseNumber": "TX-DL-88214093", "licensestate": "TX", "licenseclasstype": "Class A", "experience": "3 Years", "tenure": 1, "status": "Pending Verification", "driver_factor": 1.05}, {"id": "DRV-2", "given_name": "Driver", "last_name": "Two", "age": 25.5, "dob": "03/10/2001", "sex": "F", "licenseNumber": "TX-DL-77035581", "licensestate": "TX", "licenseclasstype": "Class A", "experience": "5 Years", "tenure": 2, "status": "Pending Verification", "driver_factor": 1}], "quoteNo": "QT-TRK-2026-89412", "coverageRows": [{"line": "Commercial Auto Liability (Combined Single Limit)", "limit": "$500,000 CSL", "ded": "$2,500", "prem": "$9,850.00"}, {"line": "Auto Physical Damage (Comp & Collision - 2 Units)", "limit": "$500,000 Stated Value", "ded": "$2,500", "prem": "$3,100.00"}, {"line": "Motor Truck Cargo Legal Liability", "limit": "$100,000 Per Occurrence", "ded": "$1,000", "prem": "$980.00"}], "assignedTo": null, "assignedBy": null, "assignedAt": null, "effectiveDate": "10/01/2026", "expirationDate": "10/01/2027", "carrier": "Vikram & Sons", "mga": "Vikas & Co", "customerName": "Ayushi", "customerEmail": "ayushi@example.com", "rawEmailText": "From: Ayushi <ayushi@example.com>\nTo: Arora & Sons <operations@aroraandsons.com>\nSubject: Commercial Auto Insurance Request - 2 Drivers\n\nHi Arora & Sons team,\n\nI'd like to get commercial auto coverage set up for my small fleet. Here are\nthe details:\n\n- Address: Golden Path Demo Address, Demo City\n- Requested Limit / TIV ($): $500,000\n- Effective Date: 10/01/2026\n- FEIN / Tax ID: 99-0000001\n- DOT Number: 9990001\n- MC Number: MC-999001\n\nLoss run history (prior 3 years):\n- 2024 - 2025: Minor fender damage during backing maneuver — Closed — $4,200 incurred\n- 2023 - 2024: Windshield replacement & minor debris strike — Closed — $1,800 incurred\n- 2022 - 2023: No claims recorded — Clean — $0 incurred\n\nVehicles (2 units):\n- Unit 1: 2023 Ford Transit 350 Cargo Van — Stated Value $250,000 — assigned to Driver 1\n- Unit 2: 2022 Freightliner M2 106 Box Truck — Stated Value $250,000 — assigned to Driver 2\n\nDrivers I need covered:\n- Driver 1: Age 24, TX Class A license, 3 years CDL experience\n- Driver 2: Age 25.5, TX Class A license, 5 years CDL experience\n\nPlease let me know what you need from me to get a quote started.\n\nThanks,\nAyushi", "normalizationStatus": "pending"}
;

// A single-message "inbox" for the Email Intake module's Demo Inbox tab —
// replaces the generic Westgate/Bright Harbor/QuickLane sample messages
// with Ayushi's actual email to Arora & Sons whenever Golden Path Mode is on.
var GOLDEN_PATH_INBOX_MESSAGE = {
  id: "golden-path-msg",
  from: GOLDEN_PATH_CUSTOMER + " <ayushi@example.com>",
  subject: "Commercial Auto Insurance Request - 2 Drivers",
  receivedLabel: "Just now",
  lobKey: "trucking",
  body: GOLDEN_PATH_SUBMISSION.rawEmailText
};

// ----------------------------------------------------------------------------
// 2. Apply Golden Path Mode. Runs immediately (script executes after every
//    other script has defined its functions/data, since it's loaded last).
// ----------------------------------------------------------------------------
(function applyGoldenPathMode() {
  if (!GOLDEN_PATH_MODE) return;

  // 2a. Never let a previous session's (possibly non-golden-path) saved
  // state resurface.
  try {
    if (typeof VERIDEX_STORAGE_KEY !== "undefined") {
      localStorage.removeItem(VERIDEX_STORAGE_KEY);
    }
  } catch (e) { /* localStorage unavailable — ignore */ }

  // 2b. Replace the 14-submission / 5-LOB generic seed dataset with exactly
  // one submission. loadSeedDemoData() (and anything else that reads
  // SEED_SUBMISSIONS_DATASET) now only ever sees the golden-path record.
  if (typeof SEED_SUBMISSIONS_DATASET !== "undefined") {
    SEED_SUBMISSIONS_DATASET.length = 0;
    SEED_SUBMISSIONS_DATASET.push(JSON.parse(JSON.stringify(GOLDEN_PATH_SUBMISSION)));
  }

  // 2c. Swap the Email Intake module's simulated inbox down to Ayushi's one
  // message only (module already loaded by this point — DEMO_INBOX_MESSAGES
  // is declared with `const` but its *contents* are freely mutable).
  if (typeof DEMO_INBOX_MESSAGES !== "undefined") {
    DEMO_INBOX_MESSAGES.length = 0;
    DEMO_INBOX_MESSAGES.push(GOLDEN_PATH_INBOX_MESSAGE);
  }

  // 2d. Trim static UI once the DOM is ready. The auto-load of the
  // golden-path submission has been removed: the app must start fully
  // blank and only ever show data ingested for real through the
  // Integrating API module (Product JSON or Email) — no demo/sample data
  // loads automatically, or at all.
  document.addEventListener("DOMContentLoaded", function () {
    trimLobSelectorsToGoldenPath(false);
    trimNewIntakeModalToGoldenPath();
  });
})();

// ----------------------------------------------------------------------------
// 3. UI trimming helpers
// ----------------------------------------------------------------------------
// "Sentence case" — only the very first letter capital, everything else
// lowercase (per request: LOB dropdown text should read this way).
function toSentenceCase(str) {
  var lower = str.toLowerCase();
  for (var i = 0; i < lower.length; i++) {
    var ch = lower[i];
    if (/[a-z]/i.test(ch)) {
      return lower.slice(0, i) + ch.toUpperCase() + lower.slice(i + 1);
    }
  }
  return lower;
}

function trimLobSelectorsToGoldenPath(productIngested) {
  var labelText = productIngested
    ? toSentenceCase("Commercial Auto (" + GOLDEN_PATH_CARRIER + " / " + GOLDEN_PATH_MGA + ")")
    : "Commercial auto (no active product — ingest via Integrating API)";
  var goldenLabel = "🚚 " + labelText;

  // Top header LOB dropdown
  var lobSelect = document.getElementById("lobSelect");
  if (lobSelect) {
    lobSelect.innerHTML = '<option value="trucking" selected>' + goldenLabel + '</option>';
    lobSelect.disabled = true;
    lobSelect.title = productIngested
      ? "Golden Path Demo Mode — single product in play"
      : "No product has been ingested yet — go to Integrating API";
  }

  // Email Digest modal's LOB selector
  var emailLobSelect = document.getElementById("emailDigestLobSelect");
  if (emailLobSelect) {
    emailLobSelect.innerHTML = '<option value="trucking" selected>' + goldenLabel + '</option>';
  }
}

function trimNewIntakeModalToGoldenPath() {
  var newIntakeLOB = document.getElementById("newIntakeLOB");
  if (newIntakeLOB) {
    var labelText = toSentenceCase("Commercial Auto (" + GOLDEN_PATH_CARRIER + " / " + GOLDEN_PATH_MGA + ")");
    newIntakeLOB.innerHTML = '<option value="trucking" selected>🚚 ' + labelText + '</option>';
  }
  var brokerField = document.getElementById("newIntakeBroker");
  if (brokerField) {
    brokerField.value = GOLDEN_PATH_BROKER;
  }
}

// ----------------------------------------------------------------------------
// 4. FIX: Product Studio JSON ingestion. The existing ingestProductSchema()
//    (bindings-ingestion.js) calls generateDynamicSubmissions(), which
//    REPLACES SUBMISSIONS_DATASET with 3 hardcoded generic submissions
//    ("Apex Logistics Fleet LLC", "Marsh & McLennan...") baked into that
//    function — wiping out the golden-path submission the moment ANY
//    product JSON is uploaded. In Golden Path Mode we still want uploading
//    a product to work (it updates Product Studio's display + becomes the
//    active product), but it must never spawn unrelated fake submissions.
//    We wrap the original rather than editing bindings-ingestion.js.
// ----------------------------------------------------------------------------
// Rebuilds sub.appetiteRules ENTIRELY from the ingested product JSON's
// eligibility/underwriting rules when it actually has any (using
// buildProductAppetiteRules — the same function the rest of the app
// already uses for its own generated submissions), so Step 7 shows real
// data from whatever product was imported, not a fixed golden-path set.
// If the ingested product has no rules at all, the golden-path defaults
// are left exactly as they are.
//
// After rebuilding, the Minimum Driver Age rule (if the product defines
// one) is split into one entry per driver — same as the golden-path
// default — so the Drivers Schedule's per-driver knockout boxes and the
// live Submission Value vs Base Value comparison keep working exactly as
// before. Nothing about the table's columns, override controls, or
// evaluation logic changes — only the data source does.
function mapAppetiteRulesFromProduct(schemaObj, sub) {
  if (!schemaObj || !sub) return;

  var studiosObj = schemaObj.studios || {};
  var allRules = []
    .concat(studiosObj.eligibility || schemaObj.eligibility || schemaObj.eligibilityRules || [])
    .concat(studiosObj.underwriting || schemaObj.underwriting || schemaObj.underwritingRules || []);
  if (!allRules.length || typeof buildProductAppetiteRules !== "function") return; // keep golden-path defaults

  var mappedRules = buildProductAppetiteRules(schemaObj, sub);
  if (!mappedRules || !mappedRules.length) return;

  // Normalize field names to what renderAppetiteRules() / the MGA override
  // controls (toggleAppetiteRuleOverride, validateMgaOverrideInput,
  // evaluateAppetiteRule) actually key off.
  mappedRules.forEach(function (r) {
    if (!r.ruleId) r.ruleId = r.id || r.code;
    if (!r.factor) r.factor = r.name || r.desc;
    if (!r.guardrail) r.guardrail = r.threshold;
    if (r.canOverride === undefined) r.canOverride = r.ruleType !== "Knockout";
  });

  function extractNumber(str) {
    if (!str) return null;
    var m = String(str).match(/[\d,]+(\.\d+)?/);
    return m ? parseFloat(m[0].replace(/,/g, "")) : null;
  }

  // Find the driver-age rule (if any) among the newly-mapped rules and
  // split it into one row per driver, exactly like the golden-path default.
  var ageRuleIdx = mappedRules.findIndex(function (r) {
    var text = ((r.factor || "") + " " + (r.threshold || "")).toLowerCase();
    return text.indexOf("driver age") !== -1 || text.indexOf("min driver age") !== -1;
  });

  if (ageRuleIdx !== -1) {
    var ageRule = mappedRules[ageRuleIdx];
    var ageNum = extractNumber(ageRule.threshold) || extractNumber(ageRule.guardrail);
    var drivers = sub.drivers || [];
    if (ageNum !== null && drivers.length) {
      var perDriverRules = drivers.map(function (d, idx) {
        var driverName = (d.given_name || d.last_name) ? `${d.given_name || ''} ${d.last_name || ''}`.trim() : `Driver ${idx + 1}`;
        var driverAge = d.age !== undefined ? d.age : null;
        return Object.assign({}, ageRule, {
          ruleId: ageRule.ruleId + "-D" + (idx + 1),
          factor: (ageRule.factor || "Minimum Driver Age") + " — " + driverName,
          operator: ">=",
          baseValue: ageNum,
          unit: "Years",
          val: driverAge !== null ? `${driverAge} Years` : "—",
          pass: driverAge !== null ? driverAge >= ageNum : true,
          note: "Sourced from ingested product JSON. Evaluated independently for " + driverName + " only."
        });
      });
      // Replace the single generic age rule with one row per driver, in place.
      mappedRules.splice.apply(mappedRules, [ageRuleIdx, 1].concat(perDriverRules));
    }
  }

  sub.appetiteRules = mappedRules;
}
window.mapAppetiteRulesFromProduct = mapAppetiteRulesFromProduct;

// Builds sub.questionnaireGroups directly from whatever questionnaire data
// the ingested product JSON actually contains — every question it defines
// is shown, nothing invented. Two possible shapes are supported (Product
// Studio uses both across different exports):
//   1. schemaObj.questionnaire: [{ label, questions: [{ label, type, required }] }]
//   2. schemaObj.riskAttributes: [{ name, category, options, description, required }]
// This panel is part of the Underwriting Workbench, so an item explicitly
// tagged for another department (department/gate/team/audience field not
// matching "Underwriting") is dropped — see isUnderwriterOwned() below.
// If neither shape exists, sub.questionnaireGroups is left unset and the
// Workbench falls back to its static default questions.
function mapQuestionnaireFromProduct(schemaObj, sub) {
  if (!schemaObj || !sub) return;
  var studiosObj = schemaObj.studios || {};
  var qGroups = studiosObj.questionnaire || schemaObj.questionnaire || schemaObj.questionGroups || [];
  var riskAttrs = studiosObj.riskAttributes || schemaObj.riskAttributes || [];

  // Best-effort answer lookup from the actual submission data — reuses the
  // same fields the rest of the Workbench already displays. Returns null
  // (shown as "Not Provided") when nothing on the submission matches.
  function findAnswer(label) {
    var t = (label || "").toLowerCase();
    var vehicles = sub.vehicles || [];
    var drivers = sub.drivers || [];
    if (t.indexOf("radius") !== -1) {
      return (sub.radiusOfOperationsInfo && sub.radiusOfOperationsInfo.radius !== undefined)
        ? `${sub.radiusOfOperationsInfo.radius} Miles (${sub.radiusOfOperationsInfo.Intrastate_interstate || 'N/A'})` : null;
    }
    if (t.indexOf("fleet size") !== -1 || t.indexOf("power unit") !== -1) {
      return vehicles.length ? `${vehicles.length} Power Units` : null;
    }
    if (t.indexOf("vehicle type") !== -1) {
      return vehicles.length ? vehicles.map(function (v) { return v.vehicle_type; }).filter(Boolean).join(", ") || null : null;
    }
    if (t.indexOf("make") !== -1 && t.indexOf("model") !== -1) {
      return vehicles.length ? vehicles.map(function (v) { return `${v.make || ''} ${v.model || ''}`.trim(); }).filter(Boolean).join("; ") || null : null;
    }
    if (t.indexOf("year") !== -1 && t.indexOf("manufactur") !== -1) {
      return vehicles.length ? vehicles.map(function (v) { return v.year; }).filter(Boolean).join(", ") || null : null;
    }
    if (t.indexOf("insured value") !== -1 || t.indexOf("stated value") !== -1) {
      var total = vehicles.reduce(function (s, v) { return s + (v.stated_value || 0); }, 0);
      return total ? `$${total.toLocaleString()} Total Stated Value` : null;
    }
    if (t.indexOf("cargo") !== -1 || t.indexOf("hazmat") !== -1) {
      return (sub.commoditiesInfo && sub.commoditiesInfo.secondary_class) || null;
    }
    if (t.indexOf("driver") !== -1 && (t.indexOf("experience") !== -1 || t.indexOf("licen") !== -1)) {
      return drivers.length ? drivers.map(function (d) { return d.experience; }).filter(Boolean).join(", ") || null : null;
    }
    if (t.indexOf("business type") !== -1 || t.indexOf("operation") !== -1) {
      return sub.channelType ? (sub.channelType === "broker" ? "Broker-Placed Business" : "Direct Business") : null;
    }
    if (t.indexOf("claim") !== -1 || t.indexOf("loss") !== -1) {
      var losses = sub.losses || [];
      return losses.length ? `${losses.filter(function (l) { return l.status !== "Clean"; }).length} Closed Claim(s)` : null;
    }
    return null;
  }

  // This panel lives on the Underwriting Workbench, so only questions/risk
  // attributes owned by Underwriting belong here — items explicitly tagged
  // for another department (Actuarial, Compliance, Ops/Tech, Product, etc.,
  // matching the same department vocabulary used by the product's
  // governance gates) must not show up in the underwriter's own review.
  // An item with no department/owner/gate tag at all is assumed to be
  // underwriting-relevant (that's the only data this schema currently
  // provides) — nothing is invented, only filtered.
  function isUnderwriterOwned(item) {
    var tag = item.department || item.gate || item.team || item.audience || item.owner_department;
    if (!tag) return true;
    return /underwrit/i.test(String(tag));
  }

  var groups = [];

  if (qGroups.length) {
    qGroups.forEach(function (g) {
      if (!isUnderwriterOwned(g)) return;
      var items = (g.questions || []).filter(isUnderwriterOwned).map(function (q) {
        return { q: q.label || q.name || "Question", a: findAnswer(q.label || q.name) };
      });
      if (items.length) {
        groups.push({ title: g.label || g.name || "Questionnaire Group", items: items });
      }
    });
  }

  if (riskAttrs.length) {
    var byCategory = {};
    riskAttrs.forEach(function (attr) {
      if (!isUnderwriterOwned(attr)) return;
      var cat = attr.category || "Risk Attributes";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ q: attr.name || attr.code || "Attribute", a: findAnswer(attr.name) });
    });
    Object.keys(byCategory).forEach(function (cat) {
      groups.push({ title: cat, items: byCategory[cat] });
    });
  }

  if (groups.length) {
    sub.questionnaireGroups = groups;
  }
}
window.mapQuestionnaireFromProduct = mapQuestionnaireFromProduct;

// Attached Underwriting Documents must come ONLY from the ingested product
// JSON — never the golden-path's sample ACORD/SOV/loss-run/MVR files.
// Product Studio JSON has no documents/attachments concept in any of its
// real exports, so by default this clears sub.docs to empty (showing "No
// documents provided" everywhere) on every ingestion. If a future/different
// product JSON DOES include a documents/attachments/files array, those are
// used instead — still never the golden-path defaults.
function mapDocumentsFromProduct(schemaObj, sub) {
  if (!schemaObj || !sub) return;
  var studiosObj = schemaObj.studios || {};
  var docsSource = studiosObj.documents || schemaObj.documents || schemaObj.attachments || schemaObj.files || [];

  if (docsSource.length) {
    sub.docs = docsSource.map(function (d) {
      return {
        name: d.name || d.filename || d.fileName || "Document",
        type: (d.type || d.fileType || "").toLowerCase().indexOf("pdf") !== -1 ? "pdf" : "xls",
        desc: d.desc || d.description || "Document from Ingested Product JSON"
      };
    });
  } else {
    sub.docs = [];
  }
}
window.mapDocumentsFromProduct = mapDocumentsFromProduct;

if (GOLDEN_PATH_MODE && typeof ingestProductSchema === "function") {
  var _originalIngestProductSchema = ingestProductSchema;

  ingestProductSchema = function goldenPathIngestProductSchema(schemaObj) {
    if (!schemaObj) return;

    // Re-brand the uploaded product with the golden-path cast, whatever
    // name/carrier the file itself claims, so Product Studio always shows
    // Vikram & Sons / Vikas & Co — never a random uploaded carrier name.
    var pInfo = schemaObj.product || schemaObj.identity || (schemaObj.product = {});
    pInfo.carrier = GOLDEN_PATH_CARRIER;
    pInfo.mga = [GOLDEN_PATH_MGA];
    pInfo.owner = pInfo.owner || (GOLDEN_PATH_MGA + " Product Team");

    window.ACTIVE_INSURANCE_PRODUCT = schemaObj;
    ACTIVE_INSURANCE_PRODUCT = schemaObj;

    // Keep the LOB catalog registration behavior from the original function
    // (harmless — just adds a catalog entry), but skip generateDynamicSubmissions()
    // entirely: pin SUBMISSIONS_DATASET back to the one golden-path record.
    SUBMISSIONS_DATASET = [JSON.parse(JSON.stringify(GOLDEN_PATH_SUBMISSION))];
    window.SUBMISSIONS_DATASET = SUBMISSIONS_DATASET;
    activeSubmissionId = SUBMISSIONS_DATASET[0].id;
    currentLOBFilter = "trucking";
    isQuoteImported = false;
    currentImportedRatingData = null;

    // Appetite Rules & Automated Knockouts is now fully dynamic — every
    // rule shown comes from the ingested product JSON's eligibility/
    // underwriting rules (via buildProductAppetiteRules, the same function
    // the rest of the app already uses for generated submissions). Nothing
    // about the table's functionality changes: same columns, same MGA
    // override controls, same live Submission Value vs Base Value
    // comparison, same per-driver Minimum Driver Age split — only the
    // SOURCE of the rules is now the imported product instead of a fixed
    // golden-path default.
    mapAppetiteRulesFromProduct(schemaObj, SUBMISSIONS_DATASET[0]);
    mapQuestionnaireFromProduct(schemaObj, SUBMISSIONS_DATASET[0]);
    mapDocumentsFromProduct(schemaObj, SUBMISSIONS_DATASET[0]);

    trimLobSelectorsToGoldenPath(true);

    if (typeof renderActiveInsuranceProduct === "function") renderActiveInsuranceProduct();
    if (typeof renderAllDownstreamScreens === "function") renderAllDownstreamScreens(SUBMISSIONS_DATASET[0]);

    // Land on the Admin Dashboard right after ingestion — switching to the
    // admin role makes showIntakePage() render the Assignment Dashboard
    // (renderRoleDashboard() → renderManagerDashboardHtml()) instead of the
    // plain worker queue, so the admin immediately sees the newly ingested
    // submission ready to assign.
    if (typeof changeUserRole === "function") changeUserRole("admin");
    if (typeof showIntakePage === "function") showIntakePage();
    if (typeof filterSubmissionsTable === "function") filterSubmissionsTable("all");
    if (typeof selectSubmission === "function") selectSubmission(activeSubmissionId, false);

    showToast("🎉 Product ingested — landed on the Admin Dashboard with " + GOLDEN_PATH_CUSTOMER + "'s submission ready to assign.", "success");
    if (typeof persistAppState === "function") persistAppState();
  };
  window.ingestProductSchema = ingestProductSchema;
}

window.GOLDEN_PATH_MODE = GOLDEN_PATH_MODE;
window.GOLDEN_PATH_CARRIER = GOLDEN_PATH_CARRIER;
window.GOLDEN_PATH_MGA = GOLDEN_PATH_MGA;
window.GOLDEN_PATH_BROKER = GOLDEN_PATH_BROKER;
window.GOLDEN_PATH_CUSTOMER = GOLDEN_PATH_CUSTOMER;
window.GOLDEN_PATH_SUBMISSION = GOLDEN_PATH_SUBMISSION;
