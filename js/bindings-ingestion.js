// 8. EXPOSE GLOBALS ON WINDOW OBJECT (100% Reliability)
// ============================================================================
// The ingested product definition. Declared up front: with no product uploaded yet it must read as null, not throw.
var ACTIVE_INSURANCE_PRODUCT = window.ACTIVE_INSURANCE_PRODUCT || null;

window.showIntakePage = showIntakePage;
window.showWorkflowPage = showWorkflowPage;
window.showArchivePage = showArchivePage;
window.showQuoteVersionsPage = showQuoteVersionsPage;
window.renderQuoteVersionsLedger = renderQuoteVersionsLedger;
window.filterQuoteVersions = filterQuoteVersions;
window.onVersionSubSelectChange = onVersionSubSelectChange;
window.searchQuoteVersionsTable = searchQuoteVersionsTable;
window.openQuoteVersionPreviewModal = openQuoteVersionPreviewModal;
window.closeQuoteVersionPreviewModal = closeQuoteVersionPreviewModal;
window.exportQuoteVersionsCSV = exportQuoteVersionsCSV;
window.resumeActiveCaseWorkflow = resumeActiveCaseWorkflow;
window.changeUserRole = changeUserRole;
window.submitJuniorEscalation = submitJuniorEscalation;
window.goToScreen = goToScreen;
window.toggleSidebar = toggleSidebar;
window.selectSubmission = selectSubmission;
window.openCaseAtCurrentStep = openCaseAtCurrentStep;
window.previewDocModal = previewDocModal;
window.closeDocPreviewModal = closeDocPreviewModal;
window.proceedToNormalizationFromDocModal = proceedToNormalizationFromDocModal;
window.printDocPreview = printDocPreview;
window.filterSubmissionsTable = filterSubmissionsTable;
window.searchSubmissionsTable = searchSubmissionsTable;
window.changeQueueSorting = changeQueueSorting;
window.escalateSubmissionPriority = escalateSubmissionPriority;
window.openNewIntakeModal = openNewIntakeModal;
window.closeNewIntakeModal = closeNewIntakeModal;
window.toggleModalBrokerField = toggleModalBrokerField;
window.handleCreateNewIntake = handleCreateNewIntake;
window.renderRatingEnginePayload = renderRatingEnginePayload;
window.exportRatingPayloadToCSV = exportRatingPayloadToCSV;
window.copyRatingJSON = copyRatingJSON;
window.downloadRatingJSON = downloadRatingJSON;
window.toggleJSONWrap = toggleJSONWrap;
window.setExposureScenario = setExposureScenario;
window.triggerDuplicateExit = triggerDuplicateExit;
window.triggerAppetiteFailureExit = triggerAppetiteFailureExit;
window.seniorUWAction = seniorUWAction;
window.openRFIModal = openRFIModal;
window.closeRFIModal = closeRFIModal;
window.sendRFIAction = sendRFIAction;
window.addNewSubjectivity = addNewSubjectivity;
window.issueQuoteAction = issueQuoteAction;
window.closeFlowchartModal = closeFlowchartModal;
window.navFromDiagram = navFromDiagram;
window.toggleBrowserFullscreen = toggleBrowserFullscreen;
window.goToNextStep = goToNextStep;
window.goToPrevStep = goToPrevStep;
window.updateBottomFooter = updateBottomFooter;
window.previewDocForSubmission = previewDocForSubmission;
window.openAllDocsModal = openAllDocsModal;
window.downloadCurrentPreviewDoc = downloadCurrentPreviewDoc;
window.openDocsManagerModal = openDocsManagerModal;
window.switchHubDoc = switchHubDoc;
window.closeCaseDocsModal = closeCaseDocsModal;
window.proceedToCaseFromDocsModal = proceedToCaseFromDocsModal;
window.onManualAssignmentChange = onManualAssignmentChange;
window.openAllStepsSummaryModal = openAllStepsSummaryModal;
window.closeAllStepsSummaryModal = closeAllStepsSummaryModal;
window.switchSummaryModalTab = switchSummaryModalTab;
window.renderAllStepsSummaryModal = renderAllStepsSummaryModal;
window.renderStep7View = renderStep7View;
window.getGeneratedQuoteHtml = getGeneratedQuoteHtml;
window.updateIssuanceRecipientUI = updateIssuanceRecipientUI;
window.handleJsonDragLeave = handleJsonDragLeave;
window.handleJsonFileDrop = handleJsonFileDrop;

window.getSubmissionRatingPayload = getSubmissionRatingPayload;
window.renderUnderwritingWorkbench = renderUnderwritingWorkbench;
window.renderAppetiteRules = renderAppetiteRules;
window.toggleAppetiteRuleOverride = toggleAppetiteRuleOverride;
window.validateVehicleBaseRateOverride = validateVehicleBaseRateOverride;

/* ===== Merged: Product Studio JSON Ingestion — helper builders (from app_combined.html) ===== */

/** true / false when the submission says so about a unit, null when it does not. */
function vehicleDashcamState(v) {
  if (!v || v.dashcam === undefined || v.dashcam === null || v.dashcam === "") return null;
  if (v.dashcam === true || /^(y|yes|true|installed|1)$/i.test(String(v.dashcam).trim())) return true;
  if (v.dashcam === false || /^(n|no|false|none|0|not installed)$/i.test(String(v.dashcam).trim())) return false;
  return null;
}

function buildProductAppetiteRules(schemaObj, sub) {
  const p = schemaObj || window.ACTIVE_INSURANCE_PRODUCT || (typeof ACTIVE_INSURANCE_PRODUCT !== 'undefined' ? ACTIVE_INSURANCE_PRODUCT : null) || {};
  const studios = p.studios || {};
  const eligibilityList = studios.eligibility || p.eligibility || p.eligibilityRules || [];
  const uwList = studios.underwriting || p.underwriting || p.underwritingRules || [];

  const subState = (sub && sub.insuredInfo && sub.insuredInfo.insured_garaging_state) || "—";
  const subVehicles = (sub && sub.vehicles) || [];
  const subDrivers = (sub && sub.drivers) || [];
  const maxVehicleVal = subVehicles.reduce((max, v) => Math.max(max, v.stated_value || 0), 0) || (sub && sub.exposureVal) || 0;
  const oldestVehicleYear = subVehicles.reduce((min, v) => Math.min(min, v.year || new Date().getFullYear()), new Date().getFullYear());
  const maxVehicleAge = new Date().getFullYear() - oldestVehicleYear;
  const minDriverExp = subDrivers.reduce((min, d) => Math.min(min, parseInt(d.experience || "5", 10) || 5), 99);
  const opRadius = (sub && sub.radiusOfOperationsInfo && sub.radiusOfOperationsInfo.radius) || null;

  const rules = [];

  function extractNumber(str) {
    if (!str) return null;
    const m = String(str).match(/[\d,]+(\.\d+)?/);
    return m ? parseFloat(m[0].replace(/,/g, "")) : null;
  }

  // 1. Eligibility Rules
  eligibilityList.forEach((elg, idx) => {
    const condArr = elg.conditions || [];
    const condStr = condArr.join("; ");

    let threshold = "";
    if (elg.description && condStr) threshold = `${elg.description} [${condStr}]`;
    else if (elg.description) threshold = elg.description;
    else if (condStr) threshold = `[${condStr}]`;
    else threshold = "—";

    const n = (elg.name || "").toLowerCase();
    const d = (elg.description || "").toLowerCase();
    const c = condStr.toLowerCase();

    // Minimum Driver Age is evaluated separately, one row per driver, against
    // this rule's own numeric threshold — instead of the generic "Verified
    // Compliant" placeholder every other eligibility rule gets, since this is
    // the one rule that actually gates each driver individually.
    const isDriverAgeRule = (n.includes("driver age") || (n.includes("driver") && c.includes("age")))
      && !n.includes("vehicle age") && !c.includes("vehicle_age");
    if (isDriverAgeRule) {
      const ageNum = extractNumber(condStr) || extractNumber(elg.description);
      if (ageNum !== null && subDrivers.length) {
        subDrivers.forEach((drv, dIdx) => {
          const driverName = (drv.given_name || drv.last_name) ? `${drv.given_name || ''} ${drv.last_name || ''}`.trim() : `Driver ${dIdx + 1}`;
          const driverAge = drv.age !== undefined ? drv.age : null;
          rules.push({
            id: (elg.id || `ELG-${idx+1}`) + `-D${dIdx+1}`,
            code: (elg.code || `ELG-00${idx+1}`) + `-D${dIdx+1}`,
            name: `${elg.name || "Minimum Driver Age"} — ${driverName}`,
            desc: `${elg.name || "Minimum Driver Age"} — ${driverName}`,
            val: driverAge !== null ? `${driverAge} Years` : "—",
            threshold: threshold,
            operator: ">=",
            baseValue: ageNum,
            unit: "Years",
            ruleType: "Eligibility",
            category: elg.category || "Product Eligibility",
            cover: elg.cover || "All Covers",
            conditions: condArr,
            pass: driverAge !== null ? driverAge >= ageNum : true,
            note: "Sourced from ingested product JSON. Evaluated independently for " + driverName + " only."
          });
        });
      } else {
        rules.push({
          id: elg.id || `ELG-${idx+1}`,
          code: elg.code || `ELG-00${idx+1}`,
          name: elg.name || "Minimum Driver Age",
          desc: elg.name || "Minimum Driver Age",
          val: subDrivers.length > 0 ? `${subDrivers.length} Driver(s) – Min Exp ${minDriverExp === 99 ? '—' : minDriverExp} Yrs` : "Driver Data Pending",
          threshold: threshold,
          ruleType: "Eligibility",
          category: elg.category || "Product Eligibility",
          cover: elg.cover || "All Covers",
          conditions: condArr,
          pass: true
        });
      }
      return;
    }

    // Dashcam Required: judged unit by unit against what the submission states (a vehicle schedule column, the email, or a person's entry).
    // A unit with no dashcam, or no statement about one, does not meet the rule. The product may offer a Quote Condition for it (onFail).
    if (n.includes("dashcam") || c.includes("dashcam")) {
      if (!subVehicles.length) {
        rules.push({ id: elg.id || `ELG-${idx+1}`, code: elg.code || `ELG-00${idx+1}`, name: elg.name, desc: elg.name, val: "Fleet Data Pending", threshold: threshold, ruleType: "Eligibility", category: elg.category || "Cover Eligibility", cover: elg.cover || "All Covers", conditions: condArr, pass: true });
        return;
      }
      subVehicles.forEach((veh, vIdx) => {
        const has = vehicleDashcamState(veh);
        const label = [veh.year, veh.make, veh.model].filter(Boolean).join(" ") || `Unit ${vIdx + 1}`;
        rules.push({
          id: (elg.id || `ELG-${idx+1}`) + `-V${vIdx+1}`, family: elg.id || `ELG-${idx+1}`,
          code: (elg.code || `ELG-00${idx+1}`) + `-V${vIdx+1}`,
          name: `${elg.name} — Unit ${vIdx + 1} (${label})`, desc: `${elg.name} — Unit ${vIdx + 1} (${label})`,
          val: has === true ? "Dashcam installed" : (has === false ? "No dashcam" : "Not stated"),
          threshold: threshold, ruleType: "Eligibility", category: elg.category || "Cover Eligibility", cover: elg.cover || "All Covers", conditions: condArr,
          pass: has === true, onFail: elg.onFail || null, vehicleIndex: vIdx,
          note: has === null ? "The submission does not say whether this unit has a dashcam, so the rule is not met." : ""
        });
      });
      return;
    }

    let subVal = "Verified Compliant";
    // Default true — most eligibility rows below still only display real
    // submission data without a numeric comparison (no fabricated
    // pass/fail). Operating Radius is the one exception: the product JSON
    // is the ONLY source of the rule/criteria and its guardrail limit, the
    // email/JSON-ingested submission is the ONLY source of the actual
    // value, and this rule is genuinely evaluated — never hardcoded.
    let elgPass = true;
    if (n.includes("jurisdiction") || d.includes("state") || c.includes("state")) {
      subVal = subState ? `${subState} (Submitted)` : "State Verified";
    } else if (n.includes("vehicle age") || c.includes("vehicle_age")) {
      subVal = subVehicles.length > 0 ? `Fleet Age: ${maxVehicleAge} Yrs (${oldestVehicleYear} Model)` : "Fleet Data Pending";
    } else if (n.includes("licence") || n.includes("license") || c.includes("cdl")) {
      subVal = subDrivers.length > 0 ? `${subDrivers.length} CDL Driver(s) Submitted` : "Driver Data Pending";
    } else if (n.includes("insured value") || c.includes("insured_value")) {
      subVal = maxVehicleVal > 0 ? `Max Stated Value: $${maxVehicleVal.toLocaleString()}` : "Value Data Pending";
    } else if (n.includes("vehicle type") || c.includes("vehicle_type")) {
      subVal = subVehicles.length > 0 ? `${subVehicles.length} Unit(s) Submitted` : "Fleet Data Pending";
    } else if (n.includes("radius") || c.includes("radius")) {
      // Criteria = JSON (this rule existing at all). Guardrail = JSON (the
      // numeric limit stated in its own conditions/description). Submission
      // value = Email/JSON (sub.radiusOfOperationsInfo.radius, populated
      // only from real ingested data — never invented here). Evaluation =
      // this direct comparison, nothing else.
      const radiusGuardrail = extractNumber(condStr) ?? extractNumber(elg.description);
      if (opRadius !== null && radiusGuardrail !== null) {
        subVal = `${opRadius} Miles`;
        elgPass = opRadius <= radiusGuardrail;
      } else {
        subVal = opRadius ? `${opRadius} Miles` : "Radius Data Pending";
        // No guardrail number in the product JSON, or no radius value from
        // the submission yet — nothing to compare, so this can't be failed.
      }
    } else if (n.includes("fleet") || c.includes("fleet")) {
      subVal = subVehicles.length > 0 ? `${subVehicles.length} Power Units` : "Fleet Data Pending";
    }

    rules.push({
      id: elg.id || `ELG-${idx+1}`,
      code: elg.code || `ELG-00${idx+1}`,
      name: elg.name || "Eligibility Rule",
      desc: elg.name || "Eligibility Rule",
      val: subVal,
      threshold: threshold,
      ruleType: "Eligibility",
      category: elg.category || "Product Eligibility",
      cover: elg.cover || "All Covers",
      conditions: condArr,
      pass: elgPass
    });
  });

  // 2. Underwriting Rules
  uwList.forEach((uw, idx) => {
    const isDecline = uw.type === 'decline' || (uw.out && uw.out.type === 'Decline');
    const isRefer   = uw.type === 'refer'   || (uw.out && uw.out.type === 'Refer');
    const desc = uw.desc || uw.description || "";
    const n = (uw.name || "").toLowerCase();

    // Real submission data these knockouts can actually be evaluated
    // against (driver violations captured from the email/JSON, and prior
    // loss/claim count) — the rule's own threshold number (if the product
    // states one, e.g. "Decline if more than 1 violation") is compared
    // against the real value instead of always passing.
    const driversWithViolationData = subDrivers.filter(d => d.violations !== undefined);
    const totalViolations = driversWithViolationData.reduce((s, d) => s + (Number(d.violations) || 0), 0);
    const lossCount = (sub && sub.losses) ? sub.losses.length : 0;
    const thresholdNum = extractNumber(desc) ?? extractNumber(uw.name);

    let subVal = "No Disqualifying Condition";
    let uwPass = true;
    if (n.includes("conviction") || n.includes("violation")) {
      subVal = driversWithViolationData.length
        ? `${subDrivers.length} Driver(s) – ${totalViolations} Violation(s)`
        : `${subDrivers.length} Driver(s) – Violation Data Pending`;
      if (driversWithViolationData.length && thresholdNum !== null) uwPass = totalViolations <= thresholdNum;
    } else if (n.includes("salvage") || n.includes("title")) {
      subVal = subVehicles.length > 0 ? `${subVehicles.length} Unit(s) Submitted – Salvage Not Reported` : "Fleet Data Pending";
    } else if (n.includes("licence") || n.includes("license") || n.includes("unlicensed")) {
      const licensedDrivers = subDrivers.filter(d => d.licenseNumber || d.licensestate).length;
      subVal = subDrivers.length > 0 ? `${licensedDrivers} of ${subDrivers.length} Driver(s) With License Data` : "Driver Data Pending";
    } else if (n.includes("loss") || n.includes("claim")) {
      subVal = `${lossCount} Prior Claim(s)`;
      if (thresholdNum !== null) uwPass = lossCount <= thresholdNum;
    }

    rules.push({
      id: uw.id || `UW-${idx+1}`,
      code: uw.code || `UW-00${idx+1}`,
      name: uw.name || "Underwriting Rule",
      desc: uw.name || "Underwriting Rule",
      val: subVal,
      threshold: desc || (isDecline ? "Automatic Decline" : isRefer ? "Refer to Underwriter" : "Underwriting Gate"),
      ruleType: isDecline ? "Knockout" : (isRefer ? "Referral" : "Standard"),
      category: uw.cat || (isDecline ? "Automated Knockout" : "Underwriting Gate"),
      cover: isDecline ? "Mandatory Gate" : (uw.cat || "Underwriting"),
      priority: uw.priority || 20,
      pass: uwPass
    });
  });

  // No fallback/generic rules are fabricated when the ingested product
  // defines no eligibility/underwriting arrays of its own — the Appetite
  // Rules table simply stays empty until a product that actually declares
  // rules is ingested.

  // Normalize field names to what renderAppetiteRules() / the MGA override
  // controls (toggleAppetiteRuleOverride, validateMgaOverrideInput,
  // evaluateAppetiteRule) actually key off, so every rule — including the
  // per-driver Minimum Driver Age rows above — renders and evaluates
  // identically, with working PASS/FAIL badges and override buttons.
  rules.forEach(r => {
    if (!r.ruleId) r.ruleId = r.id || r.code;
    if (!r.factor) r.factor = r.name || r.desc;
    if (!r.guardrail) r.guardrail = r.threshold;
    if (r.canOverride === undefined) r.canOverride = r.ruleType !== "Knockout";
  });

  return rules;
}

function buildProductCoverageRows(productSchema, exposureVal, subIdx) {
  const p = productSchema || window.ACTIVE_INSURANCE_PRODUCT || (typeof ACTIVE_INSURANCE_PRODUCT !== 'undefined' ? ACTIVE_INSURANCE_PRODUCT : null) || {};
  const covers = (p.studios && p.studios.coverage) || p.coverages || p.coverage || [];
  
  if (covers && covers.length > 0) {
    return covers.map((c, idx) => {
      let limitStr = "$1,000,000";
      if (c.maxSingleLimit) {
        const num = Number(c.maxSingleLimit.toString().replace(/[^0-9.]/g, ''));
        limitStr = isNaN(num) ? c.maxSingleLimit : "$" + num.toLocaleString();
      } else if (c.sumInsured) {
        const num = Number(c.sumInsured.toString().replace(/[^0-9.]/g, ''));
        limitStr = isNaN(num) ? c.sumInsured : "$" + num.toLocaleString();
      } else if (c.subLimit) {
        const num = Number(c.subLimit.toString().replace(/[^0-9.]/g, ''));
        limitStr = isNaN(num) ? c.subLimit : "$" + num.toLocaleString();
      } else {
        limitStr = "$" + (exposureVal ? Number(exposureVal).toLocaleString() : "1,000,000");
      }

      let dedStr = "$0";
      if (c.deductibleAmount && c.deductibleAmount !== "0" && c.deductibleAmount !== "") {
        const num = Number(c.deductibleAmount.toString().replace(/[^0-9.]/g, ''));
        dedStr = isNaN(num) ? c.deductibleAmount : "$" + num.toLocaleString();
      } else if (c.deductiblePct) {
        dedStr = c.deductiblePct + "%";
      } else if (c.minDeductible) {
        const num = Number(c.minDeductible.toString().replace(/[^0-9.]/g, ''));
        dedStr = isNaN(num) ? c.minDeductible : "$" + num.toLocaleString();
      } else {
        dedStr = "None / NIL";
      }

      // The product defines the cover, not its price: the premium comes from the rating engine's output.
      const premVal = null;
      const premStr = "Not rated";

      return {
        id: c.id || `COV-00${idx+1}`,
        code: c.code || c.id || `COV-00${idx+1}`,
        line: c.name || `Coverage Line ${idx+1}`,
        limit: limitStr,
        ded: dedStr,
        prem: premStr,
        premVal: premVal,
        availability: c.availability || 'optional',
        type: c.type || 'Commercial Line',
        basisOfCoverage: c.basisOfCoverage || 'Agreed Value',
        lossBasis: c.lossBasis || 'Per Occurrence',
        wordingDocs: c.wordingDocs || []
      };
    });
  }

  return [
    { id: "COV-001", code: "COV-AL-001", line: "Commercial Auto Liability (CSL)", limit: "$1,000,000", ded: "$0", prem: "$14,850.00", premVal: 14850, availability: "mandatory", type: "Liability" },
    { id: "COV-002", code: "COV-PD-001", line: "Physical Damage / Comprehensive", limit: "$1,850,000", ded: "$2,500", prem: "$6,200.00", premVal: 6200, availability: "mandatory", type: "Property Damage" },
    { id: "COV-003", code: "COV-CGO-001", line: "Motor Truck Cargo Legal Liability", limit: "$250,000", ded: "$1,000", prem: "$2,450.00", premVal: 2450, availability: "optional", type: "Cargo" }
  ];
}

function buildDynamicRatingPayloadFromProduct(productSchema, sub) {
  const p = productSchema || window.ACTIVE_INSURANCE_PRODUCT || {};
  const pInfo = p.product || p.identity || {};
  const pId = p.productId || pInfo.id || "PRD-021";
  const pName = pInfo.name || "Trucking_test";
  const pLob = pInfo.lineOfBusiness || pInfo.segment || "Auto Liability";
  const pVer = p.version || pInfo.version || "2026.10";

  const coverageRows = (sub && sub.coverageRows) || buildProductCoverageRows(p, sub ? sub.exposureVal : 0, 0);
  const totalCoveragePrem = coverageRows.reduce((sum, c) => sum + (c.premVal || parseFloat((c.prem || "0").replace(/[^0-9.]/g, '')) || 0), 0);

  const state = (sub && sub.insuredInfo && sub.insuredInfo.insured_garaging_state) || (pInfo.jurisdictions && pInfo.jurisdictions[0]) || "AL";
  const brokerFee = (sub && sub.broker_fee && sub.broker_fee.amount) || (typeof cfgValue === "function" ? cfgValue("broker_fee_quote_default") : 1500);
  // Tax comes from the confirmed surplus lines basis (js/surplus-lines.js); with no confirmed basis the fallback quote shows none.
  const slR = (typeof slRatesFor === "function" && sub) ? slRatesFor(sub) : null; // js/surplus-lines.js
  const effectiveTaxRatePct = slR ? slR.taxPct : 0;
  const surplusTax = Math.round(totalCoveragePrem * (effectiveTaxRatePct / 100));
  const stampingFee = Math.round(totalCoveragePrem * (slR ? slR.stampingPct / 100 : 0));
  const netPrem = totalCoveragePrem + surplusTax + stampingFee + brokerFee;

  const ratingGroups = (p.studios && p.studios.rating) || [];
  const factorsList = [];
  ratingGroups.forEach(g => {
    if (g.items) {
      g.items.forEach(item => {
        factorsList.push({ name: item.name, value: item.value || "1.00x", code: item.id });
      });
    }
  });

  const coveragesPayload = coverageRows.map((c, idx) => {
    return {
      lineId: c.code || `COV-00${idx+1}`,
      name: c.line,
      type: c.type || "Property Damage",
      limit: c.limit,
      deductible: c.ded,
      subtotal: c.premVal || parseFloat((c.prem || "0").replace(/[^0-9.]/g, '')) || 0,
      factors: factorsList,
      wordings: c.wordingDocs || []
    };
  });

  return {
    quote: {
      lob: `${pId}: ${pName} (${pLob})`,
      productId: pId,
      productName: pName,
      state: state,
      ratingVersion: "v" + pVer,
      coveragePremium: totalCoveragePrem,
      finalPremium: netPrem,
      tax: surplusTax,
      countyTax: stampingFee,
      fees: [
        { name: "Surplus Lines State Tax (" + effectiveTaxRatePct + "%)", code: "FEE_SL_TAX", amt: surplusTax },
        { name: "State Stamping Office Fee (" + (slR ? slR.stampingPct : 0) + "%)", code: "FEE_STAMP", amt: stampingFee },
        { name: "Commercial Broker Placement Fee", code: "FEE_BROKER", amt: brokerFee }
      ],
      discounts: [],
      creditsNotApplied: [
        { name: "Renewal Discount", code: "DISC_RENEWAL", reason: "New Business submission (applicable on renewal)", undetermined: false },
        { name: "Multi-Policy Grouping", code: "DISC_MULTI", reason: "Single monoline policy package", undetermined: false }
      ]
    },
    coverages: coveragesPayload,
    eligibility: {
      rules: (p.studios && p.studios.eligibility) || [],
      declines: [],
      refers: []
    },
    underwriting: {
      rules: (p.studios && p.studios.underwriting) || []
    },
    adapter: {
      fieldsMapped: 28,
      schema: `${pId} Dynamic Rating Engine v${pVer}`,
      status: "COMPUTED_SUCCESS"
    }
  };
}

// generateDynamicSubmissions() was removed: uploading a Product JSON must
// only configure the product (eligibility/underwriting rules, coverages,
// LOB catalog) — it must never fabricate submissions (fake company name,
// FEIN, broker, exposure, etc). Real submissions come only from Email
// Intake (createRawSubmissionFromEmail / applyNormalizedDataToSubmission),
// which applies this product's rules via buildProductAppetiteRules().

/* ===== Merged: Product Studio JSON Ingestion — page, dropzone, ingest, studios ===== */
function showIntegratingApiPage(tab) {
  tab = tab || 'covers';
  currentPage = "upload-product";
  resetAllTopLevelPages();
  setPageTitle("Integrating API");
  
  if (typeof setBreadcrumb === 'function') {
    setBreadcrumb([
      { label: "FUT", onClick: "showIntakePage()" },
      { label: "Integrations" },
      { label: "Integrating API" }
    ]);
  }

  var page = document.getElementById("integratingApiPageView");
  if (page) {
    page.style.display = "block";
    page.classList.add("active");
  }

  var navItem = document.getElementById("navItemIntegratingApi");
  if (navItem) navItem.classList.add("active");

  var footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");

  renderActiveInsuranceProduct();
  switchStudioTab(tab);
  setupJsonDropzone();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Ingests a new Product Schema JSON (from file drop, upload, or paste)
 */
function ingestProductSchema(schemaObj) {
  if (!schemaObj) return;
  window.ACTIVE_INSURANCE_PRODUCT = schemaObj;
  ACTIVE_INSURANCE_PRODUCT = schemaObj;

  var pInfo = schemaObj.product || schemaObj.identity || {};
  var pId = schemaObj.productId || pInfo.id || "PRD-021";
  var pName = pInfo.name || "Trucking_test";
  var pLob = pInfo.lineOfBusiness || pInfo.segment || "Auto Liability";
  var pVer = schemaObj.version || pInfo.version || "2026.10";

  // 1a. Register this product as its own entry in LOB_CATALOG so anything
  // reading the catalog directly — not just the live Step-of-Intake LOB
  // dropdown — recognizes it too: the "Add User" LOB permission checklist,
  // the submissions table LOB filter, and getCoveragesForLOBs(). Re-ingesting
  // the same productId updates the existing entry in place instead of
  // duplicating it.
  var ingestedCoverages = ((schemaObj.studios && schemaObj.studios.coverage) || schemaObj.coverages || schemaObj.coverage || [])
    .map(function(c) { return c.name; })
    .filter(Boolean);
  var lobEntry = {
    key: pId,
    name: pId + ": " + pName + " (" + pLob + ")",
    coverages: ingestedCoverages.length ? ingestedCoverages : [pLob + " Coverage"]
  };
  var existingLobIdx = LOB_CATALOG.findIndex(function(l) { return l.key === pId; });
  if (existingLobIdx >= 0) {
    LOB_CATALOG[existingLobIdx] = lobEntry;
  } else {
    LOB_CATALOG.push(lobEntry);
    ALL_LOB_KEYS.push(pId);
  }

  // Ingesting a Product JSON configures the product only — its eligibility/
  // underwriting rules (via buildProductAppetiteRules), coverages, and LOB
  // catalog entry. It does NOT fabricate any submissions: no fake company,
  // FEIN, broker or exposure data is created here. The only source of real
  // submissions is the Email Intake module — a submission is created there,
  // and the rules configured by this product apply to it once "Run AI
  // Document Ingestion" runs.

  // 1c. Discretionary pricing caps — read from the ingested schema's pricing
  // block when provided, otherwise keep the platform defaults.
  var pricingBlock = schemaObj.pricing || {};
  DISCRETIONARY_MAX_CREDIT_PCT = (typeof pricingBlock.maxCreditPct === "number") ? pricingBlock.maxCreditPct : (typeof cfgValue === "function" ? cfgValue("discretionary_max_credit") : 15);
  DISCRETIONARY_MAX_DEBIT_PCT = (typeof pricingBlock.maxDebitPct === "number") ? pricingBlock.maxDebitPct : (typeof cfgValue === "function" ? cfgValue("discretionary_max_debit") : 25);
  window.DISCRETIONARY_MAX_CREDIT_PCT = DISCRETIONARY_MAX_CREDIT_PCT;
  window.DISCRETIONARY_MAX_DEBIT_PCT = DISCRETIONARY_MAX_DEBIT_PCT;

  // 2. Update LOB dropdown
  var lobSelect = document.getElementById("lobSelect");
  if (lobSelect) {
    lobSelect.innerHTML = '<option value="' + pId + '" selected>🚛 ' + pId + ': ' + pName + ' (' + pLob + ' v' + pVer + ')</option>';
  }

  // 3. Render product studio (Eligibility & Underwriting rules, coverages)
  renderActiveInsuranceProduct();

  // No submissions are created or touched here — re-render whatever is
  // already in the queue (real Email Intake submissions, if any) so the
  // table reflects the newly registered LOB immediately.
  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();

  showToast("✅ Product \"" + pId + " (" + pName + ")\" ingested — its eligibility & underwriting rules are now active. Add a submission via Email Intake to apply them.", "success");
  persistAppState();
}

/**
 * Renders the product details or shows blank placeholder state if nothing uploaded
 */
function renderActiveInsuranceProduct() {
  var p = window.ACTIVE_INSURANCE_PRODUCT || null;

  var emptyBox = document.getElementById("psEmptyStateBox");
  var contentBox = document.getElementById("psLoadedContentBox");

  if (!p) {
    if (emptyBox) emptyBox.style.display = "block";
    if (contentBox) contentBox.style.display = "none";
    return;
  }

  if (emptyBox) emptyBox.style.display = "none";
  if (contentBox) contentBox.style.display = "flex";

  var pInfo = p.product || p.identity || {};
  var pId = p.productId || pInfo.id || "PRD-021";
  var pName = pInfo.name || "Trucking_test";
  var pVer = p.version || pInfo.version || "2026.10";
  var pLob = pInfo.lineOfBusiness || pInfo.segment || "Auto Liability";

  var idEl = document.getElementById("psIdBadge");
  var statusEl = document.getElementById("psStatusBadge");
  var nameEl = document.getElementById("psProductName");
  var descEl = document.getElementById("psProductDesc");
  var lobEl = document.getElementById("psLobBadge");
  var carrierEl = document.getElementById("psCarrier");
  var familyEl = document.getElementById("psFamily");
  var jurisEl = document.getElementById("psJurisdictions");
  var ownerEl = document.getElementById("psOwner");
  var compValEl = document.getElementById("psCompletionVal");
  var compBarEl = document.getElementById("psCompletionBar");
  var datesEl = document.getElementById("psEffectiveDates");

  if (idEl) idEl.textContent = pId;
  if (statusEl) statusEl.textContent = (pInfo.status || p.status || "DRAFT").toUpperCase() + " (" + pVer + ")";
  if (nameEl) nameEl.innerHTML = pName + ' <span class="text-xs text-muted font-mono" id="psProductCode">(' + (pInfo.code || "COM-2026-002") + ')</span>';
  if (descEl) descEl.textContent = pInfo.description || "New product configuration.";
  if (lobEl) lobEl.textContent = pLob;
  if (carrierEl) carrierEl.textContent = (pInfo.productType || "Commercial Auto") + " / " + (pInfo.carrier || "FUT Insurance");
  if (familyEl) familyEl.textContent = "Family: " + (pInfo.family || "Commercial Auto");
  
  var jArr = pInfo.jurisdictions || ["AL", "AZ", "OR"];
  if (jurisEl) jurisEl.textContent = jArr.join(", ") + " (Admitted)";
  if (ownerEl) ownerEl.textContent = "Owner: " + (pInfo.owner || "Anika Sharma");
  
  var comp = p.completion || 72;
  if (compValEl) compValEl.textContent = comp + "%";
  if (compBarEl) compBarEl.style.width = comp + "%";
  if (datesEl) datesEl.textContent = "Effective: " + (pInfo.effectiveFrom || "01-Sept-2026") + " to " + (pInfo.effectiveTo || "10-Oct-2026");

  renderCoverageStudio();
  renderQuestionnaireStudio();
  renderRiskAttributesStudio();
  renderEligibilityStudio();
  renderUnderwritingStudio();
  renderRatingStudio();
  renderGovernanceStudio();
  renderAuditStudio();

  var jsonTextarea = document.getElementById("psRawJsonTextarea");
  if (jsonTextarea) {
    jsonTextarea.value = JSON.stringify(p, null, 2);
  }
}

function switchStudioTab(tab) {
  document.querySelectorAll(".ps-tab-btn").forEach(function(b) { b.classList.remove("active"); });
  document.querySelectorAll(".ps-studio-panel").forEach(function(p) { p.style.display = "none"; });

  if (tab === 'covers') {
    document.getElementById("tabBtnCovers")?.classList.add("active");
    document.getElementById("panelCovers")?.style.setProperty("display", "block");
  } else if (tab === 'questionnaire') {
    document.getElementById("tabBtnQuestionnaire")?.classList.add("active");
    document.getElementById("panelQuestionnaire")?.style.setProperty("display", "block");
  } else if (tab === 'eligibility') {
    document.getElementById("tabBtnEligibility")?.classList.add("active");
    document.getElementById("panelEligibility")?.style.setProperty("display", "block");
  } else if (tab === 'rating') {
    document.getElementById("tabBtnRating")?.classList.add("active");
    document.getElementById("panelRating")?.style.setProperty("display", "block");
  } else if (tab === 'governance') {
    document.getElementById("tabBtnGovernance")?.classList.add("active");
    document.getElementById("panelGovernance")?.style.setProperty("display", "block");
  } else if (tab === 'json') {
    document.getElementById("tabBtnJson")?.classList.add("active");
    document.getElementById("panelJson")?.style.setProperty("display", "block");
    var jsonTextarea = document.getElementById("psRawJsonTextarea");
    if (jsonTextarea && window.ACTIVE_INSURANCE_PRODUCT) {
      jsonTextarea.value = JSON.stringify(window.ACTIVE_INSURANCE_PRODUCT, null, 2);
    }
  }
}

function renderCoverageStudio() {
  var container = document.getElementById("psCoversContainer");
  var countBadge = document.getElementById("psCoversCount");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var covers = (p && p.studios && p.studios.coverage) || [];
  
  if (countBadge) countBadge.textContent = covers.length;
  if (!container) return;

  container.innerHTML = covers.map(function(c) {
    var availBadge = '<span class="badge badge-primary text-xs">Optional</span>';
    if (c.availability === 'mandatory') availBadge = '<span class="badge badge-success text-xs">Mandatory</span>';
    else if (c.availability === 'addon') availBadge = '<span class="badge badge-warning text-xs">Add-on</span>';

    var docsHtml = (c.wordingDocs || []).map(function(d) {
      return '<span class="ps-doc-chip"><i class="ph ph-file-text"></i> ' + d.name + ' (' + (d.code || d.version) + ')</span>';
    }).join("");

    return '<div class="ps-cover-card">' +
      '<div>' +
        '<div class="ps-cover-head">' +
          '<div>' +
            '<h4 class="ps-cover-name">' + c.name + '</h4>' +
            '<span class="ps-cover-code">' + (c.code || c.id) + ' • ' + (c.type || 'Property Damage') + '</span>' +
          '</div>' +
          availBadge +
        '</div>' +
        '<p class="ps-cover-desc">' + (c.description || 'Configured policy coverage.') + '</p>' +
        '<div class="ps-cover-specs">' +
          '<div class="ps-spec-item">' +
            '<span>Valuation Basis:</span>' +
            '<strong>' + (c.basisOfCoverage || 'Agreed Value') + '</strong>' +
          '</div>' +
          '<div class="ps-spec-item">' +
            '<span>Max Single Limit:</span>' +
            '<strong>' + (c.maxSingleLimit ? '$' + c.maxSingleLimit : (c.sumInsured ? '$' + c.sumInsured : 'Standard Limit')) + '</strong>' +
          '</div>' +
          '<div class="ps-spec-item">' +
            '<span>Deductible:</span>' +
            '<strong>' + (c.deductibleAmount ? '$' + c.deductibleAmount : (c.deductiblePct ? c.deductiblePct + '%' : 'None / NIL')) + '</strong>' +
          '</div>' +
          '<div class="ps-spec-item">' +
            '<span>Loss Basis:</span>' +
            '<strong>' + (c.lossBasis || 'Per Occurrence') + '</strong>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<div style="font-size:0.6875rem; font-weight:700; color:#64748b; margin-bottom:4px; text-transform:uppercase;">Attached Legal Wordings:</div>' +
        '<div class="ps-cover-docs">' +
          (docsHtml || '<span class="text-xs text-muted">Standard Master Clause</span>') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join("");
}

function renderQuestionnaireStudio() {
  var container = document.getElementById("psQuestionGroupsContainer");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var groups = (p && p.studios && p.studios.questionnaire) || [];
  if (!container) return;

  container.innerHTML = groups.map(function(g) {
    var qHtml = (g.questions || []).map(function(q) {
      return '<div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; display:flex; align-items:center; justify-content:space-between;">' +
        '<div>' +
          '<strong style="font-size:0.8125rem; color:#1e293b;">' + q.label + '</strong>' +
          '<div class="font-mono text-xs text-muted">' + q.internalName + '</div>' +
        '</div>' +
        '<span class="badge badge-secondary font-mono text-xs">type: ' + q.type + '</span>' +
      '</div>';
    }).join("");

    return '<div style="border:1px solid #e2e8f0; border-radius:8px; padding:12px; background:#f8fafc; margin-bottom:12px;">' +
      '<div style="font-weight:700; font-size:0.875rem; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">' +
        '<span><i class="ph ph-folder text-primary"></i> ' + (g.label || g.name) + '</span>' +
        '<span class="badge badge-light font-mono text-xs">' + (g.questions || []).length + ' Fields</span>' +
      '</div>' +
      '<div style="display:flex; flex-direction:column; gap:6px;">' + qHtml + '</div>' +
    '</div>';
  }).join("");
}

function renderRiskAttributesStudio() {
  var container = document.getElementById("psRiskAttributesContainer");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var attrs = (p && p.studios && p.studios.riskAttributes) || [];
  if (!container) return;

  container.innerHTML = attrs.map(function(a) {
    return '<div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#ffffff;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">' +
        '<strong style="font-size:0.8125rem; color:#0f172a;">' + a.name + '</strong>' +
        '<span class="badge badge-primary font-mono text-xs">' + a.code + '</span>' +
      '</div>' +
      '<div class="text-xs text-muted mb-1">' + (a.description || a.options) + '</div>' +
      '<div style="display:flex; gap:6px; font-size:11px;">' +
        '<span class="badge badge-light text-xs">Category: ' + (a.category || 'Fleet') + '</span>' +
        '<span class="badge badge-light text-xs">Input: ' + a.type + '</span>' +
      '</div>' +
    '</div>';
  }).join("");
}

function renderEligibilityStudio() {
  var container = document.getElementById("psEligibilityContainer");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var elgs = (p && p.studios && p.studios.eligibility) || [];
  if (!container) return;

  container.innerHTML = elgs.map(function(e) {
    return '<div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#ffffff; border-left:3px solid #10b981;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center;">' +
        '<strong style="font-size:0.8125rem; color:#0f172a;">' + e.name + '</strong>' +
        '<span class="badge badge-success text-xs font-mono">' + e.code + '</span>' +
      '</div>' +
      '<div class="text-xs text-muted mt-1">' + e.description + '</div>' +
      '<div class="font-mono text-xs text-primary mt-1">Cover: ' + (e.cover || 'All Covers') + '</div>' +
    '</div>';
  }).join("");
}

function renderUnderwritingStudio() {
  var container = document.getElementById("psUnderwritingRulesContainer");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var uws = (p && p.studios && p.studios.underwriting) || [];
  if (!container) return;

  container.innerHTML = uws.map(function(u) {
    var isDecline = u.type === 'decline' || (u.out && u.out.type === 'Decline');
    return '<div style="border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; background:#ffffff; border-left:3px solid ' + (isDecline ? '#ef4444' : '#10b981') + ';">' +
      '<div style="display:flex; justify-content:space-between; align-items:center;">' +
        '<strong style="font-size:0.8125rem; color:#0f172a;">' + u.name + '</strong>' +
        '<span class="badge ' + (isDecline ? 'badge-danger' : 'badge-success') + ' text-xs font-mono">' + (isDecline ? 'DECLINE' : 'ACCEPT') + '</span>' +
      '</div>' +
      '<div class="text-xs text-muted mt-1">' + (u.desc || u.description || 'Underwriting rule criteria.') + '</div>' +
      '<div class="font-mono text-xs text-muted mt-1">Category: ' + (u.cat || 'General') + ' • Code: ' + u.code + '</div>' +
    '</div>';
  }).join("");
}

function renderRatingStudio() {
  var container = document.getElementById("psRatingFactorsContainer");
  var displayEl = document.getElementById("psBasePremiumDisplay");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var pricing = (p && p.pricing) || {};
  var base = pricing.basePremium || 300;
  if (displayEl) displayEl.textContent = "$" + parseFloat(base).toFixed(2);

  var ratingGroups = (p && p.studios && p.studios.rating) || [];
  if (!container) return;

  var factors = [];
  ratingGroups.forEach(function(g) {
    if (g.items) factors.push.apply(factors, g.items);
  });

  container.innerHTML = factors.map(function(f) {
    return '<div class="ps-factor-card">' +
      '<div class="ps-factor-title">' + f.name + '</div>' +
      '<div class="ps-factor-val">' + (f.value || '1.00x') + '</div>' +
      '<div class="text-xs text-muted font-mono mt-1">ID: ' + f.id + '</div>' +
    '</div>';
  }).join("");
}

function renderGovernanceStudio() {
  var container = document.getElementById("psGovernanceGatesContainer");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var gates = (p && p.governance) || [];
  if (!container) return;

  container.innerHTML = gates.map(function(g) {
    var isAppr = g.action === 'Approved';
    return '<div class="ps-gate-card ' + (isAppr ? 'approved' : 'pending') + '">' +
      '<div style="font-size:0.8125rem; font-weight:700; color:#0f172a;">' + g.gate + ' Gate</div>' +
      '<div style="font-size:0.75rem; color:#64748b; margin-top:2px;">Approver: <strong>' + g.approver + '</strong></div>' +
      '<div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">' +
        '<span class="badge ' + (isAppr ? 'badge-success' : 'badge-warning') + ' text-xs">' + g.action + '</span>' +
        '<span class="font-mono text-xs text-muted">' + g.date + '</span>' +
      '</div>' +
    '</div>';
  }).join("");
}

function renderAuditStudio() {
  var tbody = document.getElementById("psAuditTbody");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  var audits = (p && p.audit) || [];
  if (!tbody) return;

  tbody.innerHTML = audits.map(function(a) {
    return '<tr>' +
      '<td class="font-mono text-xs">' + (a.at ? a.at.slice(0,19).replace('T',' ') : '2026-08-31') + '</td>' +
      '<td><strong>' + a.user + '</strong> <span class="text-xs text-muted">(' + (a.role || 'Product Manager') + ')</span></td>' +
      '<td><span class="badge badge-light text-xs font-mono">' + a.action + '</span></td>' +
      '<td class="font-mono text-xs">' + (a.page || 'studio.html') + '</td>' +
      '<td>' + a.description + '</td>' +
    '</tr>';
  }).join("");
}

function setupJsonDropzone() {
  var dropzone = document.getElementById("psJsonDropzone");
  if (dropzone && !dropzone.dataset.bound) {
    dropzone.dataset.bound = "true";
    ["dragenter", "dragover"].forEach(function(eventName) {
      dropzone.addEventListener(eventName, function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(function(eventName) {
      dropzone.addEventListener(eventName, function(e) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });
    dropzone.addEventListener("drop", function(e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        parseUploadedJsonFile(e.dataTransfer.files[0]);
      }
    });
  }
}

function handleJsonFileSelect(event) {
  if (event.target.files && event.target.files.length) {
    parseUploadedJsonFile(event.target.files[0]);
  }
}

function parseUploadedJsonFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var parsed = JSON.parse(e.target.result);
      if (parsed) {
        ingestProductSchema(parsed);
      }
    } catch (err) {
      showToast("❌ Error parsing JSON file: " + err.message, "danger");
    }
  };
  reader.readAsText(file);
}

function openRawJsonModal() {
  var modal = document.getElementById("psPasteJsonModal");
  var textarea = document.getElementById("psModalJsonTextarea");
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  if (textarea) textarea.value = p ? JSON.stringify(p, null, 2) : "";
  if (modal) modal.style.display = "flex";
}

function closeRawJsonModal() {
  var modal = document.getElementById("psPasteJsonModal");
  if (modal) modal.style.display = "none";
}

function ingestModalJson() {
  var textarea = document.getElementById("psModalJsonTextarea");
  if (!textarea || !textarea.value.trim()) {
    showToast("⚠️ Please paste valid JSON", "warning");
    return;
  }
  try {
    var parsed = JSON.parse(textarea.value);
    ingestProductSchema(parsed);
    closeRawJsonModal();
  } catch (err) {
    showToast("❌ Invalid JSON format: " + err.message, "danger");
  }
}

function applyJsonFromEditor() {
  var textarea = document.getElementById("psRawJsonTextarea");
  if (!textarea || !textarea.value.trim()) return;
  try {
    var parsed = JSON.parse(textarea.value);
    ingestProductSchema(parsed);
  } catch (err) {
    showToast("❌ Invalid JSON format: " + err.message, "danger");
  }
}

function exportStudioJson() {
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  if (!p) {
    showToast("⚠️ No product uploaded to export.", "warning");
    return;
  }
  var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(p, null, 2));
  var downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  var pId = p.productId || (p.product && p.product.id) || "PRD-021";
  downloadAnchor.setAttribute("download", pId + "_product_studio_export.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("📥 Exported " + pId + "_product_studio_export.json", "info");
}

/* Embedded sample product schema used by the "Load Sample PRD-021" action */
var SAMPLE_PRD021_JSON = {
  "schema": "insurance-product-studio-product-v1",
  "exportedAt": "2026-08-31T05:19:52.589Z",
  "productId": "PRD-021",
  "version": "2026.10",
  "status": "draft",
  "product": {
    "id": "PRD-021",
    "name": "Trucking_test",
    "family": "Commercial Auto",
    "version": "2026.10",
    "status": "draft",
    "effectiveFrom": "01-Sept-2026",
    "effectiveTo": "10-Oct-2026",
    "owner": "Anika Sharma",
    "lastModifiedBy": "Anika Sharma",
    "segment": "Auto Liability",
    "productType": "Commercial Auto",
    "lineOfBusiness": "Auto Liability",
    "carrier": "FUT Insurance",
    "mga": [],
    "code": "COM-2026-002",
    "description": "New product configuration for Commercial Trucking & Auto Liability fleet coverage.",
    "jurisdictions": [
      "AL",
      "AZ",
      "OR"
    ],
    "lastModified": "31-Aug-2026",
    "lastModifiedAt": "2026-08-31T05:12:25.981Z",
    "sortOrder": -1788153145981,
    "sourceProductId": null,
    "sourceVersion": null,
    "selectedStudios": [
      "covers",
      "questionGroups",
      "riskAttributes",
      "eligibilityRules",
      "ratingComponents",
      "underwritingRules",
      "testCases"
    ],
    "enabledStudios": [
      "coverage",
      "questionnaire",
      "risk",
      "eligibility",
      "rating",
      "underwriting"
    ],
    "coversNeedPick": false,
    "coversPicked": true,
    "pending": true,
    "jurisdictionSetup": [
      {
        "state": "AL",
        "available": true,
        "admitted": "Admitted",
        "cities": [
          "Mobile"
        ],
        "restrictions": "",
        "effectiveFrom": "2026-08-31",
        "effectiveTo": "2026-10-09"
      },
      {
        "state": "AZ",
        "available": true,
        "admitted": "Admitted",
        "cities": [],
        "restrictions": "",
        "effectiveFrom": "2026-08-31",
        "effectiveTo": "2026-10-09"
      },
      {
        "state": "OR",
        "available": true,
        "admitted": "Admitted",
        "cities": [],
        "restrictions": "",
        "effectiveFrom": "2026-08-31",
        "effectiveTo": "2026-10-09"
      }
    ]
  },
  "identity": {
    "id": "PRD-021",
    "name": "Trucking_test",
    "code": "COM-2026-002",
    "family": "Commercial Auto",
    "segment": "Auto Liability",
    "owner": "Anika Sharma",
    "jurisdictions": [
      "AL",
      "AZ",
      "OR"
    ],
    "description": "New product configuration for Commercial Trucking & Auto Liability fleet coverage.",
    "effectiveFrom": "01-Sept-2026",
    "effectiveTo": "10-Oct-2026",
    "sourceProductId": null,
    "sourceVersion": null
  },
  "versions": [
    {
      "label": "2026.10",
      "status": "draft",
      "from": "01-Sept-2026",
      "to": "10-Oct-2026",
      "by": "Anika Sharma",
      "on": "31-Aug-2026",
      "gates": 0,
      "sim": "Not Run"
    }
  ],
  "studios": {
    "coverage": [
      {
        "id": "COV-001",
        "name": "Own Damage",
        "code": "COV-OD-001",
        "availability": "mandatory",
        "complete": true,
        "type": "First Party — Property Damage",
        "description": "Covers physical loss or damage to the insured vehicle caused by an accident, fire, theft, or natural disaster.",
        "basisOfCoverage": "Agreed Value",
        "sumInsured": "50,000",
        "maxSingleLimit": "1,000,000",
        "subLimit": "500,000",
        "deductibleType": "fixed",
        "deductibleAmount": "300",
        "deductiblePct": "",
        "minDeductible": "200",
        "maxDeductible": "2,000",
        "copay": "0",
        "waitingPeriod": "None",
        "annualAggregate": false,
        "defaultSelected": true,
        "mutualExclusions": [],
        "conditionalOn": "",
        "dependencies": [
          {
            "type": "Bundles with",
            "dependsOn": "Roadside Assistance",
            "condition": "Vehicle age < 5 years"
          }
        ],
        "constraints": [
          {
            "field": "Vehicle Age",
            "operator": "≤",
            "value": "15 years"
          },
          {
            "field": "Vehicle Type",
            "operator": "is one of",
            "value": "Tractor, Straight Truck"
          },
          {
            "field": "Insured Value",
            "operator": "≥",
            "value": "$5,000"
          }
        ],
        "lossBasis": "Per Occurrence",
        "reinstatement": "Automatic (full limit)",
        "benefitBasis": "Indemnity",
        "claimsNotifPeriod": "14",
        "claimsNotifUnit": "days",
        "wordingDocs": [
          {
            "name": "Own Damage Clause — Standard",
            "version": "v2026.04",
            "code": "DOC-OD-CL-001"
          },
          {
            "name": "General Exclusions Endorsement",
            "version": "v2026.01",
            "code": "DOC-GEN-EX-001"
          }
        ]
      },
      {
        "id": "COV-002",
        "name": "Third Party Liability",
        "code": "COV-TP-001",
        "availability": "mandatory",
        "complete": true,
        "type": "Third Party Liability",
        "description": "Covers legal liability of the insured to third parties for bodily injury or property damage arising from vehicle use.",
        "basisOfCoverage": "Market Value",
        "sumInsured": "100,000",
        "maxSingleLimit": "1,000,000",
        "subLimit": "300,000",
        "deductibleType": "none",
        "deductibleAmount": "",
        "deductiblePct": "",
        "minDeductible": "",
        "maxDeductible": "",
        "copay": "0",
        "waitingPeriod": "None",
        "annualAggregate": false,
        "defaultSelected": true,
        "mutualExclusions": [],
        "conditionalOn": "",
        "dependencies": [
          {
            "type": "Requires",
            "dependsOn": "Own Damage",
            "condition": "For this product"
          }
        ],
        "constraints": [
          {
            "field": "Vehicle Registration",
            "operator": "is",
            "value": "Active Commercial DOT"
          }
        ],
        "lossBasis": "Per Occurrence",
        "reinstatement": "None (aggregate)",
        "benefitBasis": "Indemnity",
        "claimsNotifPeriod": "7",
        "claimsNotifUnit": "days",
        "wordingDocs": [
          {
            "name": "Third Party Liability Clause",
            "version": "v2026.04",
            "code": "DOC-TP-CL-001"
          }
        ]
      },
      {
        "id": "COV-003",
        "name": "Personal Accident",
        "code": "COV-PA-001",
        "availability": "mandatory",
        "complete": true,
        "type": "Benefit — Personal Accident",
        "description": "Pays a fixed benefit to the insured driver and occupants in case of accidental death or permanent disability resulting from a road accident.",
        "basisOfCoverage": "Agreed Value",
        "sumInsured": "25,000",
        "maxSingleLimit": "25,000",
        "subLimit": "",
        "deductibleType": "none",
        "deductibleAmount": "",
        "deductiblePct": "",
        "minDeductible": "",
        "maxDeductible": "",
        "copay": "0",
        "waitingPeriod": "None",
        "annualAggregate": false,
        "defaultSelected": true,
        "mutualExclusions": [],
        "conditionalOn": "",
        "dependencies": [],
        "constraints": [
          {
            "field": "Named Driver Age",
            "operator": "≥",
            "value": "18 years"
          },
          {
            "field": "Named Driver Age",
            "operator": "≤",
            "value": "70 years"
          }
        ],
        "lossBasis": "Per Person",
        "reinstatement": "Automatic",
        "benefitBasis": "Fixed Benefit",
        "claimsNotifPeriod": "30",
        "claimsNotifUnit": "days",
        "wordingDocs": [
          {
            "name": "Personal Accident Schedule",
            "version": "v2026.04",
            "code": "DOC-PA-SCH-001"
          }
        ]
      },
      {
        "id": "COV-004",
        "name": "Theft & Total Loss",
        "code": "COV-TH-001",
        "availability": "default",
        "complete": true,
        "type": "First Party — Property Damage",
        "description": "Covers total loss or theft of the insured vehicle. Triggered when repair costs exceed 75% of the vehicle's agreed value.",
        "basisOfCoverage": "Agreed Value",
        "sumInsured": "50,000",
        "maxSingleLimit": "50,000",
        "subLimit": "",
        "deductibleType": "percentage",
        "deductibleAmount": "",
        "deductiblePct": "10",
        "minDeductible": "500",
        "maxDeductible": "5,000",
        "copay": "0",
        "waitingPeriod": "30 days",
        "annualAggregate": false,
        "defaultSelected": true,
        "mutualExclusions": [],
        "conditionalOn": "Own Damage",
        "dependencies": [
          {
            "type": "Requires",
            "dependsOn": "Own Damage",
            "condition": "Always"
          }
        ],
        "constraints": [
          {
            "field": "Vehicle Age",
            "operator": "≤",
            "value": "12 years"
          }
        ],
        "lossBasis": "Per Occurrence",
        "reinstatement": "None — total loss",
        "benefitBasis": "Indemnity",
        "claimsNotifPeriod": "14",
        "claimsNotifUnit": "days",
        "wordingDocs": [
          {
            "name": "Theft & Total Loss Clause",
            "version": "v2026.04",
            "code": "DOC-TH-CL-001"
          }
        ]
      },
      {
        "id": "COV-005",
        "name": "Roadside Assistance",
        "code": "COV-RSA-001",
        "availability": "addon",
        "complete": true,
        "type": "Service Benefit",
        "description": "Provides up to 3 roadside assistance call-outs per year, with towing up to 50km. Fixed-fee add-on linked to Rating Studio as flat premium.",
        "basisOfCoverage": "Agreed Value",
        "sumInsured": "",
        "maxSingleLimit": "N/A (Service)",
        "subLimit": "",
        "deductibleType": "none",
        "deductibleAmount": "",
        "deductiblePct": "",
        "minDeductible": "",
        "maxDeductible": "",
        "copay": "0",
        "waitingPeriod": "None",
        "annualAggregate": false,
        "defaultSelected": false,
        "mutualExclusions": [],
        "conditionalOn": "Own Damage",
        "dependencies": [
          {
            "type": "Requires",
            "dependsOn": "Own Damage",
            "condition": "Vehicle age ≤ 10 years"
          }
        ],
        "constraints": [
          {
            "field": "Vehicle Age",
            "operator": "≤",
            "value": "10 years"
          }
        ],
        "lossBasis": "Per Call-out (max 3/year)",
        "reinstatement": "Automatic (annual)",
        "benefitBasis": "Service",
        "claimsNotifPeriod": "Immediate",
        "claimsNotifUnit": "",
        "wordingDocs": [
          {
            "name": "Roadside Assistance Terms",
            "version": "v2026.04",
            "code": "DOC-RSA-001"
          }
        ]
      },
      {
        "id": "COV-006",
        "name": "Windscreen Extension",
        "code": "COV-WS-001",
        "availability": "addon",
        "complete": true,
        "type": "First Party — Glass",
        "description": "Covers repair or replacement of the windscreen, rear window, and side glass panels. No impact on No Claims Discount.",
        "basisOfCoverage": "Market Value",
        "sumInsured": "2,000",
        "maxSingleLimit": "2,000",
        "subLimit": "",
        "deductibleType": "fixed",
        "deductibleAmount": "75",
        "deductiblePct": "",
        "minDeductible": "75",
        "maxDeductible": "75",
        "copay": "0",
        "waitingPeriod": "None",
        "annualAggregate": true,
        "defaultSelected": false,
        "mutualExclusions": [],
        "conditionalOn": "",
        "dependencies": [],
        "constraints": [
          {
            "field": "Vehicle Age",
            "operator": "≤",
            "value": "15 years"
          }
        ],
        "lossBasis": "Per Occurrence",
        "reinstatement": "Automatic",
        "benefitBasis": "Indemnity",
        "claimsNotifPeriod": "14",
        "claimsNotifUnit": "days",
        "wordingDocs": [
          {
            "name": "Glass Replacement Clause",
            "version": "v2026.04",
            "code": "DOC-WS-CL-001"
          }
        ]
      }
    ],
    "questionnaire": [
      {
        "id": "grp-mtgsai102b",
        "label": "Vehicle Details",
        "name": "Vehicle Details",
        "open": true,
        "questions": [
          {
            "id": "QST-mtgsai1021",
            "label": "Make & Model",
            "internalName": "qst_veh_001",
            "type": "entity",
            "required": true,
            "conditional": false
          },
          {
            "id": "QST-mtgsai1126",
            "label": "Year of Manufacture",
            "internalName": "qst_veh_002",
            "type": "number",
            "required": true,
            "conditional": false
          },
          {
            "id": "QST-mtgsai119e",
            "label": "Insured Value",
            "internalName": "qst_veh_003",
            "type": "currency",
            "required": true,
            "conditional": false
          },
          {
            "id": "QST-mtgsai1106",
            "label": "Vehicle Modifications?",
            "internalName": "qst_veh_004",
            "type": "boolean",
            "required": false,
            "conditional": false
          }
        ]
      }
    ],
    "riskAttributes": [
      {
        "id": "RSK-mtgsayfs243",
        "name": "Trucking business type",
        "code": "RSK-BIZ-001",
        "status": "draft",
        "lastUpdated": "2026-08-31",
        "lastUpdatedBy": "Anika Sharma",
        "type": "Select",
        "category": "Operations",
        "options": "For-hire, Private carrier, Owner-operator, Dedicated fleet, Mixed",
        "required": true,
        "description": "Classification of commercial trucking authority and operations."
      },
      {
        "id": "RSK-mtgsayfs434",
        "name": "Fleet size",
        "code": "RSK-FLT-001",
        "status": "draft",
        "lastUpdated": "2026-08-31",
        "lastUpdatedBy": "Anika Sharma",
        "type": "Number",
        "category": "Fleet",
        "options": "Power units count (and active trailers)",
        "required": true,
        "description": "Total count of registered commercial power units."
      },
      {
        "id": "RSK-mtgsayfs19c",
        "name": "Vehicle types",
        "code": "RSK-VEH-001",
        "status": "draft",
        "lastUpdated": "2026-08-31",
        "lastUpdatedBy": "Anika Sharma",
        "type": "Multi-select",
        "category": "Fleet",
        "options": "Tractor, Straight truck, Trailer, Tanker, Dump, Reefer, Flatbed",
        "required": true,
        "description": "Body types and specialized configurations operating in fleet."
      },
      {
        "id": "RSK-mtgsayfs0b6",
        "name": "Radius of operation",
        "code": "RSK-RAD-001",
        "status": "draft",
        "lastUpdated": "2026-08-31",
        "lastUpdatedBy": "Anika Sharma",
        "type": "Select",
        "category": "Territory",
        "options": "Local (0–50 mi), Intermediate (51–200 mi), Long-haul (200+ mi)",
        "required": true,
        "description": "Operating geographic distance radius from principal garage."
      }
    ],
    "eligibility": [
      {
        "id": "ELG-mtgsfrjie44",
        "name": "Min Driver Age",
        "code": "ELG-001",
        "status": "draft",
        "category": "Product Eligibility",
        "cover": "All Covers",
        "description": "Driver must be at least 21 years old with active CDL.",
        "conditions": [
          "Age >= 21"
        ]
      },
      {
        "id": "ELG-mtgsfrjib57",
        "name": "Max Vehicle Age",
        "code": "ELG-002",
        "status": "draft",
        "category": "Product Eligibility",
        "cover": "All Covers",
        "description": "Commercial power units cannot exceed 15 years of age.",
        "conditions": [
          "Vehicle_Age <= 15"
        ]
      },
      {
        "id": "ELG-mtgsfrji3a9",
        "name": "Jurisdiction Check",
        "code": "ELG-003",
        "status": "draft",
        "category": "Product Eligibility",
        "cover": "All Covers",
        "description": "Must be domiciled in AL, AZ, or OR.",
        "conditions": [
          "State IN ('AL','AZ','OR')"
        ]
      },
      {
        "id": "ELG-mtgsfrji37b",
        "name": "Vehicle Type Allowlist",
        "code": "ELG-004",
        "status": "draft",
        "category": "Product Eligibility",
        "cover": "All Covers",
        "description": "Tractors, Straight trucks, Tankers, Reefers only.",
        "conditions": [
          "Vehicle_Type IN Allowlist"
        ]
      },
      {
        "id": "ELG-mtgsfrji623",
        "name": "Max Insured Value",
        "code": "ELG-005",
        "status": "draft",
        "category": "Cover Eligibility",
        "cover": "Own Damage",
        "description": "Single vehicle value limit cap at $1,000,000.",
        "conditions": [
          "Insured_Value <= 1000000"
        ]
      },
      {
        "id": "ELG-mtgsfrji2c3",
        "name": "Min Licence Duration",
        "code": "ELG-006",
        "status": "draft",
        "category": "Product Eligibility",
        "cover": "All Covers",
        "description": "Minimum 2 continuous years of CDL Class-A experience.",
        "conditions": [
          "CDL_Years >= 2"
        ]
      },
      {
        "id": "ELG-mtgsfrji7d1",
        "name": "Dashcam Required",
        "code": "ELG-007",
        "status": "draft",
        "category": "Cover Eligibility",
        "cover": "Own Damage",
        "description": "Own Damage cover is provided only if the vehicle has a dashcam installed.",
        "conditions": [
          "Dashcam_Installed == true"
        ],
        "onFail": {
          "offer": "quoteCondition",
          "field": "dashcam",
          "coverage": "Own Damage",
          "defaultDays": 30,
          "condition": "Install a dashcam on each vehicle listed and send the installer's certificate."
        }
      }
    ],
    "rating": [
      {
        "group": "BASE PREMIUM",
        "items": [
          {
            "id": "RAT-mtgsgfgo552",
            "name": "Base Rate",
            "type": "base",
            "group": "BASE PREMIUM",
            "value": "$300.00",
            "status": "draft"
          }
        ]
      },
      {
        "group": "RISK FACTORS",
        "items": [
          {
            "id": "RAT-mtgsgfgo417",
            "name": "Driver Age Factor",
            "type": "factor",
            "group": "RISK FACTORS",
            "value": "1.15x (Under 25)",
            "status": "draft"
          },
          {
            "id": "RAT-mtgsgfgo5b9",
            "name": "Vehicle Age Factor",
            "type": "factor",
            "group": "RISK FACTORS",
            "value": "1.08x (> 8 yrs)",
            "status": "draft"
          },
          {
            "id": "RAT-mtgsgfgo7b9",
            "name": "Territory Factor",
            "type": "factor",
            "group": "RISK FACTORS",
            "value": "1.22x (Metro/Long-haul)",
            "status": "draft"
          },
          {
            "id": "RAT-mtgsgfgoc63",
            "name": "Vehicle Use Factor",
            "type": "factor",
            "group": "RISK FACTORS",
            "value": "1.30x (Hazmat/Reefer)",
            "status": "draft"
          }
        ]
      }
    ],
    "underwriting": [
      {
        "id": "UW-mtgsgw5a303",
        "name": "Multiple Serious Convictions",
        "code": "UW-DCL-001",
        "status": "draft",
        "type": "decline",
        "cat": "Driver Quality",
        "desc": "Decline if driver has > 1 major violation in 36 months.",
        "priority": 20,
        "out": {
          "type": "Decline"
        }
      },
      {
        "id": "UW-mtgsgw5a432",
        "name": "Vehicle Salvage Status",
        "code": "UW-DCL-002",
        "status": "draft",
        "type": "decline",
        "cat": "Vehicle Quality",
        "desc": "Decline branded, reconstructed or salvage title certificates.",
        "priority": 20,
        "out": {
          "type": "Decline"
        }
      },
      {
        "id": "UW-mtgsgw5a85a",
        "name": "Unlicensed Driver",
        "code": "UW-DCL-003",
        "status": "draft",
        "type": "decline",
        "cat": "Driver Quality",
        "desc": "Decline any driver operating without valid state CDL.",
        "priority": 20,
        "out": {
          "type": "Decline"
        }
      },
      {
        "id": "UW-mtgsgw5a460",
        "name": "Standard Accept",
        "code": "UW-ACC-001",
        "status": "draft",
        "type": "accept",
        "cat": "Fallback",
        "desc": "Standard Underwriting Acceptance within $2M line authority.",
        "priority": 20,
        "out": {
          "type": "Accept"
        }
      },
      {
        "id": "UW-mtgsgw5a20c",
        "name": "Disqualified HGV Licence",
        "code": "UW-CT-DCL-001",
        "status": "draft",
        "type": "decline",
        "cat": "General",
        "desc": "Decline any revoked or suspended commercial endorsement.",
        "priority": 20,
        "out": {
          "type": "Decline"
        }
      }
    ]
  },
  "pricing": {
    "basePremium": 300,
    "maxCreditPct": 15,
    "maxDebitPct": 25,
    "taxRatePct": 3.2
  },
  "governance": [
    {
      "gate": "Product Owner",
      "approver": "Anika Sharma",
      "action": "Approved",
      "date": "31-Aug-2026",
      "comment": "Initial schema & studio specs approved."
    },
    {
      "gate": "Actuarial",
      "approver": "David Chen",
      "action": "Pending",
      "date": "—",
      "comment": "Awaiting loss-run actuarial simulation"
    },
    {
      "gate": "Underwriting",
      "approver": "Marcus Vance",
      "action": "Pending",
      "date": "—",
      "comment": "Reviewing $1M single limit endorsement"
    },
    {
      "gate": "Compliance",
      "approver": "Jonathan Reed",
      "action": "Pending",
      "date": "—",
      "comment": "AL / AZ / OR statutory filing in review"
    },
    {
      "gate": "Ops/Tech",
      "approver": "Priya Nair",
      "action": "Pending",
      "date": "—",
      "comment": "FUT Engine API endpoint mapping"
    }
  ],
  "checklist": [
    {
      "studio": "Coverage Studio",
      "status": "configured",
      "note": "6 Covers Configured"
    },
    {
      "studio": "Questionnaire Studio",
      "status": "configured",
      "note": "Vehicle Details Form Group Active"
    },
    {
      "studio": "Risk Studio",
      "status": "configured",
      "note": "4 Risk Attributes Mapped"
    },
    {
      "studio": "Eligibility Studio",
      "status": "configured",
      "note": "7 Eligibility Criteria Ready"
    },
    {
      "studio": "Rating & Pricing Studio",
      "status": "configured",
      "note": "Base $300 + 4 Risk Factors"
    },
    {
      "studio": "Underwriting Rules Studio",
      "status": "configured",
      "note": "5 Decision Rules Active"
    },
    {
      "studio": "Distribution Studio",
      "status": "pending",
      "note": "Broker & Direct Portal Links"
    },
    {
      "studio": "Document Studio",
      "status": "configured",
      "note": "Wording DOC Clauses Attached"
    }
  ],
  "completion": 72,
  "audit": [
    {
      "id": "EVT-1788153574079-513",
      "at": "2026-08-31T05:19:34.079Z",
      "user": "Anika Sharma",
      "role": "Product Manager",
      "action": "MODIFIED",
      "page": "underwriting-studio.html",
      "productId": "PRD-021",
      "version": "2026.10",
      "description": "underwritingRules configuration saved"
    },
    {
      "id": "EVT-1788153552460-93",
      "at": "2026-08-31T05:19:12.460Z",
      "user": "Anika Sharma",
      "role": "Product Manager",
      "action": "MODIFIED",
      "page": "rating-studio.html",
      "productId": "PRD-021",
      "version": "2026.10",
      "description": "ratingComponents configuration saved"
    },
    {
      "id": "EVT-1788153521458-846",
      "at": "2026-08-31T05:18:41.458Z",
      "user": "Anika Sharma",
      "role": "Product Manager",
      "action": "MODIFIED",
      "page": "eligibility-studio.html",
      "productId": "PRD-021",
      "version": "2026.10",
      "description": "eligibilityRules configuration saved"
    },
    {
      "id": "EVT-1788153297113-34",
      "at": "2026-08-31T05:14:57.113Z",
      "user": "Anika Sharma",
      "role": "Product Manager",
      "action": "MODIFIED",
      "page": "risk-studio.html",
      "productId": "PRD-021",
      "version": "2026.10",
      "description": "riskAttributes configuration saved"
    },
    {
      "id": "EVT-1788153275848-685",
      "at": "2026-08-31T05:14:35.848Z",
      "user": "Anika Sharma",
      "role": "Product Manager",
      "action": "MODIFIED",
      "page": "questionnaire-studio.html",
      "productId": "PRD-021",
      "version": "2026.10",
      "description": "questionGroups configuration saved"
    },
    {
      "id": "EVT-1788153145988-98",
      "at": "2026-08-31T05:12:25.988Z",
      "user": "Anika Sharma",
      "role": "Product Manager",
      "action": "CREATED",
      "page": "catalogue.html",
      "productId": "PRD-021",
      "version": "2026.10",
      "description": "Created product Trucking_test 2026.10"
    }
  ]
};

function loadSamplePrd021() {
  ingestProductSchema(SAMPLE_PRD021_JSON);
}

/* Global Bindings */
window.showIntegratingApiPage = showIntegratingApiPage;
window.switchStudioTab = switchStudioTab;
window.handleJsonFileSelect = handleJsonFileSelect;
window.openRawJsonModal = openRawJsonModal;
window.closeRawJsonModal = closeRawJsonModal;
window.ingestModalJson = ingestModalJson;
window.applyJsonFromEditor = applyJsonFromEditor;
window.exportStudioJson = exportStudioJson;
window.loadSamplePrd021 = loadSamplePrd021;
window.ingestProductSchema = ingestProductSchema;

