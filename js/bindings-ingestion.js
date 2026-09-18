// 8. EXPOSE GLOBALS ON WINDOW OBJECT (100% Reliability)
// ============================================================================
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
window.viewCase = viewCase;
window.resumeActiveCaseWorkflow = resumeActiveCaseWorkflow;
window.changeUserRole = changeUserRole;
window.submitJuniorEscalation = submitJuniorEscalation;
window.goToScreen = goToScreen;
window.navigateStep = navigateStep;
window.toggleSidebar = toggleSidebar;
window.selectSubmission = selectSubmission;
window.openCaseAtCurrentStep = openCaseAtCurrentStep;
window.resumeCaseFlow = resumeCaseFlow;
window.resumeActiveCaseFlow = resumeActiveCaseFlow;
window.openViewCaseModal = openViewCaseModal;
window.closeViewCaseModal = closeViewCaseModal;
window.proceedToNormalizationFromModal = proceedToNormalizationFromModal;
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
window.switchDocTab = switchDocTab;
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
window.bindPolicyAction = bindPolicyAction;
window.requestBrokerRevision = requestBrokerRevision;
window.expireQuoteAction = expireQuoteAction;
window.printQuote = printQuote;
window.downloadQuoteDoc = downloadQuoteDoc;
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
window.renderStep7InlineSummary = renderStep7InlineSummary;
window.renderStep7View = renderStep7View;
window.toggleStep7View = toggleStep7View;
window.getGeneratedQuoteHtml = getGeneratedQuoteHtml;
window.updateIssuanceRecipientUI = updateIssuanceRecipientUI;
window.openImportQuoteJsonModal = openImportQuoteJsonModal;
window.closeImportQuoteJsonModal = closeImportQuoteJsonModal;
window.handleJsonDragLeave = handleJsonDragLeave;
window.handleJsonFileDrop = handleJsonFileDrop;

window.getSubmissionRatingPayload = getSubmissionRatingPayload;
window.renderUnderwritingWorkbench = renderUnderwritingWorkbench;
window.renderAppetiteRules = renderAppetiteRules;
window.toggleAppetiteRuleOverride = toggleAppetiteRuleOverride;
window.validateVehicleBaseRateOverride = validateVehicleBaseRateOverride;





/* ===== Merged: Product Studio JSON Ingestion — helper builders (from app_combined.html) ===== */
function refreshUserRoleDropdown() {
  const select = document.getElementById("userRoleSelect");
  if (!select) return;
  const roleKeys = Object.keys(USER_ROLES_CONFIG);
  select.innerHTML = roleKeys.map(key => {
    const r = USER_ROLES_CONFIG[key];
    const limText = r.limit >= 99999999 ? "Full Access" : (r.limit >= 1000000 ? `$${(r.limit/1000000).toFixed(1)}M Limit` : `$${(r.limit/1000).toFixed(0)}k Limit`);
    return `<option value="${key}" ${key === currentUserRole ? "selected" : ""}>${r.icon} ${r.title} (${r.name} - ${limText})</option>`;
  }).join("");
}

function generateDocPreviewHTML(sub, doc) {
  if (!sub || !doc) {
    return `
      <div class="doc-preview-sheet" style="text-align: center; padding: 40px 20px;">
        <i class="ph ph-file text-muted" style="font-size: 48px; margin-bottom: 12px; display: block;"></i>
        <h4 style="color: #475569; margin-bottom: 8px;">Document Unavailable</h4>
        <p class="text-secondary text-sm">The requested document could not be loaded.</p>
      </div>
    `;
  }

  const docName = (doc.name || "").toLowerCase();
  const docType = (doc.type || "").toLowerCase();

  // Safe fallbacks for submission properties
  const safeInsured = sub.insured || sub.accountName || "Insured Applicant";
  const safeId = sub.id || "SUB-000";
  const safeLob = sub.lobName || "Commercial Auto Liability";
  const safeBroker = sub.broker || "Standard Brokerage";
  const safeEmail = sub.email || "broker@agency.com";
  const safeChannel = sub.channelName || "Broker Channel";
  const safeFein = sub.fein || "N/A";
  const safeDot = sub.dot || "N/A";
  const safeAddress = sub.address || "100 Commercial Way, Suite 400";
  const safeDate = "2026-09-01 (12 Months)";
  const safeReceivedAt = sub.receivedAt || "2026-09-01 09:15 AM";
  const safeExposure = sub.exposure || "$1,850,000";
  const safeAuthLimit = sub.authorityLimit ? (sub.authorityLimit / 1000000).toFixed(1) + "M" : "2.0M";

  // Coverage rows fallback
  const covRows = (sub.coverageRows && Array.isArray(sub.coverageRows) && sub.coverageRows.length > 0)
    ? sub.coverageRows
    : [
        { line: "Commercial Auto Liability (CSL)", limit: "$1,000,000", ded: "$0", prem: "$14,850.00" },
        { line: "Physical Damage / Comprehensive", limit: "Stated Value (" + safeExposure + ")", ded: "$2,500", prem: "$6,200.00" },
        { line: "Motor Truck Cargo Legal Liability", limit: "$250,000", ded: "$1,000", prem: "$2,450.00" },
        { line: "Hired & Non-Owned Auto Liability", limit: "$1,000,000", ded: "$0", prem: "$950.00" }
      ];

  // Losses fallback
  const lossRows = (sub.losses && Array.isArray(sub.losses) && sub.losses.length > 0)
    ? sub.losses
    : [
        { year: "2024 - 2025", desc: "No losses reported / 100% clean loss history", status: "Clean", incurred: "$0" },
        { year: "2023 - 2024", desc: "No losses reported / 100% clean loss history", status: "Clean", incurred: "$0" },
        { year: "2022 - 2023", desc: "No losses reported / 100% clean loss history", status: "Clean", incurred: "$0" }
      ];

  // Vehicles fallback
  const vehicleRows = (sub.vehicles && Array.isArray(sub.vehicles) && sub.vehicles.length > 0)
    ? sub.vehicles
    : [
        { id: 903101, year: 2024, make: "Freightliner", model: "Cascadia 126", stated_value: 185000, miles_driven: 450, primary_code: 332 },
        { id: 903102, year: 2023, make: "Kenworth", model: "T680 Next Gen", stated_value: 175000, miles_driven: 450, primary_code: 332 },
        { id: 903103, year: 2024, make: "Peterbilt", model: "579 Ultraloft", stated_value: 190000, miles_driven: 450, primary_code: 332 }
      ];

  // Drivers fallback
  const driverRows = (sub.drivers && Array.isArray(sub.drivers) && sub.drivers.length > 0)
    ? sub.drivers
    : [
        { given_name: "Robert", last_name: "Miller", dob: "14/05/1982", licensestate: "AL", licenseclasstype: "Class A CDL", experience: "14 Years", tenure: 6, status: "Active Verified" },
        { given_name: "Marcus", last_name: "Johnson", dob: "22/09/1988", licensestate: "AL", licenseclasstype: "Class A CDL", experience: "9 Years", tenure: 4, status: "Active Verified" },
        { given_name: "David", last_name: "Williams", dob: "03/11/1991", licensestate: "AL", licenseclasstype: "Class A CDL", experience: "7 Years", tenure: 3, status: "Active Verified" }
      ];

  // 1. ACORD Application / Commercial Application Preview
  if (docName.includes("acord") || docName.includes("app") || docName.includes("application")) {
    return `
      <div class="doc-preview-sheet acord-pdf-sheet">
        <div class="acord-top-header">
          <div class="acord-logo-badge">
            <i class="ph ph-shield-check"></i> ACORD <strong>FORM</strong>
          </div>
          <div class="acord-form-title">
            <h4>Commercial Insurance Application</h4>
            <span>Standard ISO Certified Format • ${safeLob}</span>
          </div>
        </div>

        <div class="acord-section-box">
          <div class="acord-sec-title"><span>Section 1: Producer & Agency Information</span><span>Submission ID: ${safeId}</span></div>
          <div class="acord-sec-grid">
            <div class="acord-field"><span class="lbl">Broker / Agency:</span><span class="val">${safeBroker}</span></div>
            <div class="acord-field"><span class="lbl">Producer Email:</span><span class="val font-mono">${safeEmail}</span></div>
            <div class="acord-field"><span class="lbl">Channel Origin:</span><span class="val">${safeChannel}</span></div>
          </div>
        </div>

        <div class="acord-section-box">
          <div class="acord-sec-title"><span>Section 2: Named Insured & Risk Profile</span><span>LOB: ${safeLob}</span></div>
          <div class="acord-sec-grid">
            <div class="acord-field"><span class="lbl">Legal Named Insured:</span><strong class="val">${safeInsured}</strong></div>
            <div class="acord-field"><span class="lbl">FEIN / Tax ID:</span><span class="val font-mono">${safeFein}</span></div>
            <div class="acord-field"><span class="lbl">USDOT / Registration:</span><span class="val font-mono">${safeDot}</span></div>
            <div class="acord-field" style="grid-column: span 2;"><span class="lbl">Mailing Address:</span><span class="val">${safeAddress}</span></div>
            <div class="acord-field"><span class="lbl">Target Effective Date:</span><span class="val">${safeDate}</span></div>
          </div>
        </div>

        <div class="acord-section-box">
          <div class="acord-sec-title"><span>Section 3: Scheduled Coverages & Limits Requested</span><span>Binding Authority Limit: $${safeAuthLimit}</span></div>
          <table class="excel-sheet-table u-m0">
            <thead>
              <tr>
                <th>Coverage Line</th>
                <th>Requested Limit</th>
                <th>Deductible</th>
                <th>Estimated Premium</th>
              </tr>
            </thead>
            <tbody>
              ${covRows.map(c => `
                <tr>
                  <td><strong>${c.line || 'Coverage Line'}</strong></td>
                  <td>${c.limit || '$1,000,000'}</td>
                  <td>${c.ded || '$0'}</td>
                  <td class="font-mono font-bold">${c.prem || '$0.00'}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <div class="acord-section-box" style="margin-bottom: 0;">
          <div class="acord-sec-title"><span>Section 4: Electronic Signatures & Compliance Verification</span><span>ISO Verified</span></div>
          <div class="acord-sec-grid">
            <div class="acord-field"><span class="lbl">Applicant Signature:</span><span class="val">/s/ Authorized Officer (${safeInsured})</span></div>
            <div class="acord-field"><span class="lbl">Broker Stamp:</span><span class="val font-mono">BROKER-VERIFIED-CERT</span></div>
            <div class="acord-field"><span class="lbl">Timestamp:</span><span class="val">${safeReceivedAt}</span></div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. SOV / Vehicle / Fleet Schedule Preview
  if (docType === "xls" || docType === "xlsx" || docName.includes("sov") || docName.includes("schedule") || docName.includes("vehicle") || docName.includes("fleet")) {
    return `
      <div class="doc-preview-sheet">
        <div class="u-section-header">
          <div>
            <h4 class="u-title-16-dark"><i class="ph ph-file-xls text-success"></i> STATEMENT OF VALUES (SOV) & ASSET SCHEDULE</h4>
            <span class="text-secondary text-sm">Insured: ${safeInsured} • Line of Business: ${safeLob}</span>
          </div>
          <span class="badge badge-success">Schedule Normalized</span>
        </div>

        <table class="excel-sheet-table">
          <thead>
            <tr>
              <th>Item #</th>
              <th>Asset / Vehicle / Location Description</th>
              <th>Identifier / VIN / Class</th>
              <th>Territory / Radius</th>
              <th>Stated Value / Exposure</th>
              <th>Safety Status</th>
            </tr>
          </thead>
          <tbody>
            ${vehicleRows.map((v, i) => `
              <tr>
                <td><strong>${String(i + 1).padStart(3, '0')}</strong></td>
                <td>${v.year || 2024} ${v.make || 'Commercial'} ${v.model || 'Tractor Unit'}</td>
                <td class="font-mono">1FTNE31L${8 + i}HDA${89210 + i}</td>
                <td>${v.miles_driven ? v.miles_driven + ' Miles Radius' : 'Regional Hub'}</td>
                <td class="font-mono font-bold">${typeof v.stated_value === 'number' ? '$' + v.stated_value.toLocaleString() : (v.stated_value || safeExposure)}</td>
                <td><span class="badge badge-success">Verified Clear</span></td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4"><strong>TOTAL SCHEDULED EXPOSURE VALUATION:</strong></td>
              <td class="font-mono" style="color: var(--primary); font-size: 14px;"><strong>${safeExposure}</strong></td>
              <td><span class="badge badge-primary">Within Appetite</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // 3. Driver CDL & MVR Audit Report Preview
  if (docName.includes("driver") || docName.includes("cdl") || docName.includes("mvr")) {
    return `
      <div class="doc-preview-sheet">
        <div class="u-section-header">
          <div>
            <h4 class="u-title-16-dark"><i class="ph ph-identification-card text-primary"></i> OFFICIAL DRIVER CDL & MVR AUDIT REPORT</h4>
            <span class="text-secondary text-sm">Insured: ${safeInsured} • State Licensing Verification</span>
          </div>
          <span class="badge badge-success"><i class="ph ph-check-circle"></i> 100% CDL Verified</span>
        </div>

        <table class="excel-sheet-table">
          <thead>
            <tr>
              <th>Driver ID</th>
              <th>Driver Name</th>
              <th>DOB</th>
              <th>License State</th>
              <th>License Class</th>
              <th>Experience</th>
              <th>Tenure</th>
              <th>MVR Status</th>
            </tr>
          </thead>
          <tbody>
            ${driverRows.map((d, i) => `
              <tr>
                <td class="font-mono">DRV-2026-${String(101 + i).padStart(3, '0')}</td>
                <td><strong>${d.given_name || ''} ${d.last_name || ''}</strong></td>
                <td class="font-mono text-muted">${d.dob || '14/05/1985'}</td>
                <td><span class="badge badge-light">${d.licensestate || 'AL'}</span></td>
                <td><strong>${d.licenseclasstype || 'Class A CDL'}</strong></td>
                <td>${d.experience || '8+ Years'}</td>
                <td>${d.tenure ? d.tenure + ' Yrs' : '4 Yrs'}</td>
                <td><span class="badge badge-success"><i class="ph ph-check"></i> ${d.status || 'Active Verified'}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="lbl" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Clearinghouse & MVR Status:</span>
            <strong style="color: #15803d; font-size: 14px; margin-left: 8px;">0 Violations / 0 Suspensions (Full Clean Compliance)</strong>
          </div>
          <div class="text-sm font-mono text-muted">
            <i class="ph ph-shield-check text-success"></i> State DMV Certified
          </div>
        </div>
      </div>
    `;
  }

  // 4. FMCSA Safety Audit Certificate Preview
  if (docName.includes("fmcsa") || docName.includes("safety") || docName.includes("audit") || docName.includes("cert")) {
    return `
      <div class="doc-preview-sheet">
        <div class="u-section-header">
          <div>
            <h4 class="u-title-16-dark"><i class="ph ph-shield-check text-success"></i> FMCSA SAFETY AUDIT & COMPLIANCE CERTIFICATE</h4>
            <span class="text-secondary text-sm">Federal Motor Carrier Safety Administration • DOT: ${safeDot}</span>
          </div>
          <span class="badge badge-success">Grade: 96th Percentile</span>
        </div>

        <div class="acord-section-box">
          <div class="acord-sec-title"><span>Carrier Safety Fitness Record</span><span>USDOT: ${safeDot}</span></div>
          <div class="acord-sec-grid">
            <div class="acord-field"><span class="lbl">Legal Entity Name:</span><strong class="val">${safeInsured}</strong></div>
            <div class="acord-field"><span class="lbl">Safety Rating:</span><strong class="val text-success">Satisfactory (Highest Rating)</strong></div>
            <div class="acord-field"><span class="lbl">ISS-D Recommendation:</span><strong class="val text-success">PASS (Fast-Track)</strong></div>
            <div class="acord-field"><span class="lbl">Vehicle Out-Of-Service Rate:</span><span class="val font-mono">0.0% (National Avg: 20.7%)</span></div>
            <div class="acord-field"><span class="lbl">Driver Out-Of-Service Rate:</span><span class="val font-mono">0.0% (National Avg: 5.5%)</span></div>
            <div class="acord-field"><span class="lbl">Crash Indicator Percentile:</span><span class="val font-mono text-success">4.2% (Superior)</span></div>
          </div>
        </div>

        <div style="margin-top: 16px; padding: 12px; background: #ecfdf5; border-radius: 6px; border: 1px solid #a7f3d0; display: flex; justify-content: space-between; align-items: center;">
          <div style="color: #065f46; font-size: 13px;">
            <i class="ph ph-check-circle" style="font-size: 16px; margin-right: 6px;"></i> <strong>FMCSA Safer System Verification:</strong> Carrier is authorized for interstate commerce with valid active insurance filings.
          </div>
          <div class="text-sm font-mono" style="color: #047857;">
            <i class="ph ph-stamp"></i> OFFICIAL USDOT CERTIFIED
          </div>
        </div>
      </div>
    `;
  }

  // 5. Loss Run Report / Claims History Preview (Default for loss runs or any other document)
  return `
    <div class="doc-preview-sheet">
      <div class="u-section-header">
        <div>
          <h4 class="u-title-16-dark"><i class="ph ph-file-pdf text-danger"></i> OFFICIAL CARRIER SIGNED LOSS RUN REPORT</h4>
          <span class="text-secondary text-sm">Insured: ${safeInsured} • Prior 3-Year Valuation as of 2026-08-01</span>
        </div>
        <span class="badge badge-primary">Carrier Signed Official</span>
      </div>

      <table class="excel-sheet-table">
        <thead>
          <tr>
            <th>Policy Year</th>
            <th>Claim Number</th>
            <th>Loss Description</th>
            <th>Status</th>
            <th>Paid Losses</th>
            <th>Total Incurred</th>
          </tr>
        </thead>
        <tbody>
          ${lossRows.map((l, i) => `
            <tr>
              <td><strong>${l.year || '2024 - 2025'}</strong></td>
              <td class="font-mono">CLM-2026-${1000 + i * 42}</td>
              <td>${l.desc || 'Clean history'}</td>
              <td><span class="badge ${l.status === 'Clean' || l.status === 'Closed' ? 'badge-success' : 'badge-info'}">${l.status || 'Clean'}</span></td>
              <td class="font-mono">${l.incurred || '$0'}</td>
              <td class="font-mono font-bold">${l.incurred || '$0'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span class="lbl" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">3-Year Cumulative Loss Ratio:</span>
          <strong style="color: #15803d; font-size: 15px; margin-left: 8px;">9.2% (Highly Favorable)</strong>
        </div>
        <div class="text-sm font-mono text-muted">
          <i class="ph ph-stamp text-primary"></i> Certified Carrier Loss Audit
        </div>
      </div>
    </div>
  `;
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
    const baseMult = (exposureVal || 1000000) / 1000000;
    
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

      let basePrem = 12000;
      if (c.availability === 'mandatory') {
        basePrem = (idx === 0 ? 14850 : 6200);
      } else if (c.availability === 'addon') {
        basePrem = 1450 + (idx * 400);
      } else {
        basePrem = 2450 + (idx * 500);
      }
      
      const subScale = (subIdx === 0) ? 1.0 : (subIdx === 1 ? 0.75 : 0.55);
      const premVal = Math.round(basePrem * baseMult * subScale);
      const premStr = "$" + premVal.toLocaleString() + ".00";

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

function buildProductDocs(productSchema, subIdx, jurisdictions) {
  const p = productSchema || window.ACTIVE_INSURANCE_PRODUCT || {};
  const pInfo = p.product || p.identity || {};
  const pId = p.productId || pInfo.id || "PRD-021";
  const pName = pInfo.name || "Commercial Product";
  const state = (jurisdictions && jurisdictions[subIdx]) || "AL";

  const docs = [
    { name: `ACORD_137_${pId}_Application.pdf`, type: "pdf", desc: `Application Form • 4 Pages • 1.4 MB` },
    { name: `${pName.replace(/\s+/g, '_')}_Vehicle_SOV_Schedule.xlsx`, type: "xls", desc: `Statement of Values (SOV) • ${state} Fleet • 420 KB` },
    { name: `Prior_3_Years_Loss_Runs_Official.pdf`, type: "pdf", desc: `Loss Run History • Clean Incurred • 1.8 MB` },
    { name: `Driver_CDL_MVR_Audit_Report.pdf`, type: "pdf", desc: `Official MVR Audit • 100% CDL Active Verified • 850 KB` }
  ];

  const covers = (p.studios && p.studios.coverage) || p.coverages || [];
  covers.forEach(c => {
    if (c.wordingDocs && Array.isArray(c.wordingDocs)) {
      c.wordingDocs.forEach(w => {
        const docName = w.name.endsWith('.pdf') ? w.name : `${w.name}.pdf`;
        if (!docs.some(d => d.name === docName)) {
          docs.push({
            name: docName,
            type: "pdf",
            desc: `Legal Policy Wording • Code: ${w.code || w.version || 'DOC-01'} • Attached`
          });
        }
      });
    }
  });

  return docs;
}

function buildDynamicRatingPayloadFromProduct(productSchema, sub) {
  const p = productSchema || window.ACTIVE_INSURANCE_PRODUCT || {};
  const pInfo = p.product || p.identity || {};
  const pId = p.productId || pInfo.id || "PRD-021";
  const pName = pInfo.name || "Trucking_test";
  const pLob = pInfo.lineOfBusiness || pInfo.segment || "Auto Liability";
  const pVer = p.version || pInfo.version || "2026.10";

  const coverageRows = (sub && sub.coverageRows) || buildProductCoverageRows(p, sub ? sub.exposureVal : 1850000, 0);
  const totalCoveragePrem = coverageRows.reduce((sum, c) => sum + (c.premVal || parseFloat((c.prem || "0").replace(/[^0-9.]/g, '')) || 0), 0);

  const state = (sub && sub.insuredInfo && sub.insuredInfo.insured_garaging_state) || (pInfo.jurisdictions && pInfo.jurisdictions[0]) || "AL";
  const brokerFee = (sub && sub.broker_fee && sub.broker_fee.amount) || 1500;
  // Use the same schema-driven tax rate as the discretionary pricing stage
  // (DISCRETIONARY_TAX_RATE_PCT, set from the ingested product's pricing.taxRatePct)
  // rather than an independently hardcoded 4.85% — otherwise ingesting a
  // product with a custom tax rate would only apply it at the underwriter's
  // credit/debit stage and not here, producing two different tax
  // assumptions for the same submission.
  const effectiveTaxRatePct = (typeof DISCRETIONARY_TAX_RATE_PCT === "number" ? DISCRETIONARY_TAX_RATE_PCT : 4.85);
  const surplusTax = Math.round(totalCoveragePrem * (effectiveTaxRatePct / 100));
  const stampingFee = Math.round(totalCoveragePrem * 0.0015);
  const discountAmt = Math.round(totalCoveragePrem * 0.08);
  const netPrem = totalCoveragePrem - discountAmt + surplusTax + stampingFee + brokerFee;

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
      subtotal: c.premVal || parseFloat((c.prem || "0").replace(/[^0-9.]/g, '')) || 10000,
      factors: factorsList.length > 0 ? factorsList : [
        { name: "Base Vehicle Rate", value: "1.00x", code: "F_BASE" },
        { name: "Territory / State Relativity (" + state + ")", value: "0.95x", code: "F_TERR" },
        { name: "Fleet Size Relativity", value: "0.97x", code: "F_FLEET" },
        { name: "Driver Experience Multiplier", value: "1.00x", code: "F_DRV" }
      ],
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
        { name: "State Stamping Office Fee (0.15%)", code: "FEE_STAMP", amt: stampingFee },
        { name: "Underwriting Inspection & Origination Fee", code: "FEE_INSPECT", amt: 250 },
        { name: "Commercial Broker Placement Fee", code: "FEE_BROKER", amt: brokerFee }
      ],
      discounts: [
        { name: "Claims-Free & Verified Risk Credit (8%)", value: -0.08, amt: -discountAmt, why: "Verified clean loss runs & active CDL compliance" }
      ],
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

function generateOfficialQuotePayload(sub, ratingData) {
  if (!sub) {
    sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0] || {};
  }
  const baseData = ratingData || currentImportedRatingData || (typeof DEFAULT_IMPORTED_RATING_JSON !== 'undefined' ? DEFAULT_IMPORTED_RATING_JSON : {}) || {};
  const existingQuote = baseData.quote || {};
  const existingCoverages = baseData.coverages || [];

  let finalPrem = existingQuote.finalPremium || (sub.exposureVal ? Math.round(sub.exposureVal * 0.08) : 378893);
  let covPrem = existingQuote.coveragePremium || (sub.exposureVal ? Math.round(sub.exposureVal * 0.075) : 375544);
  let baseLossCost = existingQuote.baseLossCost || (sub.exposureVal ? Math.round(sub.exposureVal * 0.007) : 34650);
  let netPrem = existingQuote.netPremium || (sub.exposureVal ? Math.round(sub.exposureVal * 0.073) : 36720);

  // Discretionary pricing sync if available
  if (typeof ensureDiscretionaryPricingSeed === 'function' && sub.id) {
    const dp = ensureDiscretionaryPricingSeed(sub);
    if (dp && dp.finalPremium) {
      finalPrem = dp.finalPremium;
      if (dp.basePremium) covPrem = dp.basePremium;
    }
  }

  const fees = existingQuote.fees && existingQuote.fees.length > 0 ? existingQuote.fees : [
    { name: "Policy Fee", code: "FEE_POLICY", valueType: "Fixed", unit: 150, qty: 1, amt: 150, chargeType: "Per Policy", taxable: false },
    { name: "Broker Fee", code: "FEE_BROKER", valueType: "Percent", pct: 8, percentOf: "Premium Before Fees", base: 345500, capped: "max", minFee: 250, maxFee: 2500, qty: 1, amt: 2500, chargeType: "Per Policy", taxable: false },
    { name: "Inspection Fee", code: "FEE_INSPECT", valueType: "Fixed", unit: 75, qty: 1, amt: 75, chargeType: "Per Policy", taxable: false },
    { name: "MVR / CSA Report Fee", code: "FEE_MVR", valueType: "Fixed", unit: 12, qty: (sub.drivers && sub.drivers.length) || 1, amt: 12 * ((sub.drivers && sub.drivers.length) || 1), chargeType: "Per Driver", taxable: false },
    { name: "Vehicle Inspection Fee", code: "FEE_VEHINSP", valueType: "Fixed", unit: 45, qty: (sub.vehicles && sub.vehicles.length) || 5, amt: 45 * ((sub.vehicles && sub.vehicles.length) || 5), chargeType: "Per Vehicle", taxable: false },
    { name: "Managing General Agent Fee", code: "FEE_MGA", valueType: "Percent", pct: 5, percentOf: "Premium Before Fees", base: 345500, capped: null, minFee: 100, maxFee: 0, qty: 1, amt: 17275, chargeType: "Per Policy", taxable: false },
    { name: "Surplus Lines Filing Fee", code: "FEE_SLFILE", valueType: "Percent", pct: 0.35, percentOf: "Premium + Taxes", base: 352410, capped: "max", minFee: 25, maxFee: 500, qty: 1, amt: 500, chargeType: "Per Policy", taxable: false },
    { name: "Terrorism (TRIA) Charge", code: "FEE_TRIA", valueType: "Percent", pct: 1.5, percentOf: "Coverage Premium", base: covPrem, capped: null, minFee: 0, maxFee: 0, qty: 1, amt: Math.round(covPrem * 0.015) || 5633, chargeType: "Per Policy", taxable: true }
  ];

  const discounts = existingQuote.discounts && existingQuote.discounts.length > 0 ? existingQuote.discounts : [
    { name: "Claims-Free Credit", value: -0.08, amt: -Math.round(covPrem * 0.08) || -30044, why: "No claims in prior 3 years" }
  ];

  const creditsNotApplied = existingQuote.creditsNotApplied || [
    { name: "Renewal Discount", code: "DISC_RENEWAL", reason: "Already priced in the rating chain", undetermined: false },
    { name: "CDL Experience Discount", code: "DISC_CDL", reason: "Already priced in the rating chain", undetermined: false },
    { name: "Dashcam / Telematics", code: "DISC_DASHCAM", reason: "Already priced in the rating chain", undetermined: false },
    { name: "Multi-Policy Discount", code: "DISC_MULTI", reason: "Submission does not carry the data to evaluate: Bundled with GL or Property", undetermined: true },
    { name: "Paid-In-Full Discount", code: "DISC_PIF", reason: "Condition not met: Premium paid in full at binding", undetermined: false },
    { name: "Safety Program Credit", code: "DISC_SAFETY", reason: "Submission does not carry the data to evaluate: Documented written safety program", undetermined: true },
    { name: "FMCSA Alert Surcharge", code: "SUR_FMCSA", reason: "Already priced in the rating chain", undetermined: false },
    { name: "OOS Vehicle Violations", code: "SUR_OOSV", reason: "Already priced in the rating chain", undetermined: false },
    { name: "OOS Driver Violations", code: "SUR_OOSD", reason: "Already priced in the rating chain", undetermined: false },
    { name: "Hazmat Operations", code: "SUR_HAZMAT", reason: "Already priced in the rating chain", undetermined: false },
    { name: "High-Risk Driver", code: "SUR_DRV", reason: "Already priced in the rating chain", undetermined: false },
    { name: "No Dashcam Surcharge", code: "SUR_NODASH", reason: "Already priced in the rating chain", undetermined: false },
    { name: "Unassigned Driver", code: "SUR_UNASSIGN", reason: "Submission does not carry the data to evaluate: Vehicle with no rated driver assigned", undetermined: true },
    { name: "New Venture Debit", code: "SUR_NEWVEN", reason: "Already priced in the rating chain", undetermined: false }
  ];

  const feesTotal = fees.reduce((sum, f) => sum + (f.amt || 0), 0);
  const tax = existingQuote.tax || 7023;
  const countyTax = existingQuote.countyTax || 180;
  const taxTotal = tax + countyTax;

  // Address components
  let city = "";
  let state = "";
  let zip = "";
  let street = "";
  let full_address = sub.address || (sub.insuredInfo && sub.insuredInfo.address) || "1420 Commerce Dr, Mobile, AL 36608";
  if (sub.address) {
    const parts = sub.address.split(",").map(p => p.trim());
    if (parts.length >= 3) {
      street = parts[0] || "";
      city = parts[1] || "";
      const stateZip = parts[2].split(" ").filter(Boolean);
      state = stateZip[0] || "";
      zip = stateZip[1] || "";
    } else {
      street = sub.address;
      city = (sub.insuredInfo && sub.insuredInfo.insured_garaging_city) || "Mobile";
      state = (sub.insuredInfo && sub.insuredInfo.insured_garaging_state) || (sub.id ? sub.id.split("-").pop() : "AL") || "AL";
      zip = (sub.insuredInfo && sub.insuredInfo.insured_garaging_zip) || "75201";
    }
  } else {
    street = "1420 Commerce Dr";
    city = "Mobile";
    state = (sub.id ? sub.id.split("-").pop() : "AL") || "AL";
    zip = "75201";
  }

  // Coverages
  let coverages = existingCoverages.length > 0 ? existingCoverages : [
    {
      name: "Auto Liability",
      subtotal: Math.round(covPrem * 0.12) || 44069,
      factors: [
        { label: "Territory Base Loss Cost (per unit)", value: 300, base: null, driver: "Garaging State", input: city || "Mobile", matched: `CA_Liab_LC — ${city || 'Mobile'}, first territory on file (no ZIP supplied)` },
        { label: "Increased Limits Factor (ILF)", value: 2.05, base: 1, driver: "Liability Limit", input: "$1,250,000", matched: `$1,250,000 limit in ${city || 'Mobile'}` },
        { label: "Liability Deductible Factor", value: 0, base: 0, driver: "Liability Deductible", input: "$0", matched: "$0 deductible × 0.75 program deviation" },
        { label: "Loss Cost Multiplier (LCM)", value: 1.67, base: 1.67, driver: null, input: null, matched: "Program constant — same for every quote" },
        { label: "Primary Class Factor", value: 1.8, base: null, driver: "Vehicle Class (per unit)", input: "Heavy Truck-Tractor - Long Distance D", matched: "Class 332" },
        { label: "Secondary Class Factor", value: 1.98, base: 1.98, driver: "Secondary Class (per unit)", input: "Account default", matched: "Account default" },
        { label: "Fleet Size Factor", value: 1.061, base: 1, driver: "Number of rated power units", input: `${(sub.vehicles && sub.vehicles.length) || 5} units`, matched: `${(sub.vehicles && sub.vehicles.length) || 5}-unit band, Heavy Trucks curve` },
        { label: "Vehicle Age Factor", value: 1.08, base: 1, driver: "Model Year (per unit)", input: "1 yr old", matched: "1 model years old" },
        { label: "OCN Factor", value: 1.28, base: 1, driver: "Vehicle stated value (per unit)", input: "$1,250,000", matched: "value band containing $1,250,000" },
        { label: "Liability Radius Factor", value: 1, base: 1, driver: "Radius of Operation", input: "Local / Intermediate", matched: "Local-Intermediate · Intermediate-300 (0 - 300 Miles)" },
        { label: "NAICS Industry Factor", value: 1.1, base: 1, driver: "Industry Classification (NAICS)", input: "484110", matched: "484110 — General Freight Trucking, Local" },
        { label: "Tort Limitation Factor", value: 1, base: 1, driver: "Garaging State", input: state || "Mobile", matched: `${state || 'Mobile'} — standard tort` },
        { label: "Vehicle Ownership Factor", value: 0.95, base: 1, driver: "Vehicle ownership", input: "Owned", matched: "Owned" },
        { label: "Pollution Factor", value: 1.03, base: 1, driver: "Auto liability pollution grade", input: "Low", matched: "Low" },
        { label: "Driver Criteria Factor", value: 1, base: 1, driver: "Driver schedule vs filed criteria", input: "All drivers meet criteria", matched: "All drivers meet criteria" },
        { label: "Loss Experience Factor", value: 1, base: 1, driver: "Prior-term loss ratio", input: "no prior experience", matched: "No prior experience" },
        { label: "Payment Plan Factor", value: 1, base: 1, driver: "Bill type", input: "Agency Bill", matched: "Agency Bill" },
        { label: "UW Credit / Debit", value: 1, base: 1, driver: "Underwriter judgment", input: "1", matched: "clamped to 0.75–1.25" },
        { label: "Heavy Farm Factor", value: 1, base: 1, driver: "Vehicle use type", input: "General Freight", matched: "General Freight" },
        { label: "Heavy Dumping Factor", value: 1, base: 1, driver: "Vehicle use type", input: "General Freight", matched: "General Freight" },
        { label: "Miles Driven Factor", value: 0.95, base: 1, driver: "Annual Miles + Radius category", input: "450 mi", matched: "Local-Intermediate band" },
        { label: "Rating Class Factor", value: 1, base: 1, driver: "Cargo / Hauling Type", input: "Dry Van or Box - Single Trailer", matched: "Dry Van or Box - Single Trailer" },
        { label: "Dashcam Factor", value: 1.2, base: 1, driver: "Dashcams Installed", input: "NO Dashcams", matched: "NO Dashcams" },
        { label: "CDL Experience Discount", value: 1, base: 1, driver: "Driver CDL experience (per driver)", input: "0 of 1 rated drivers have 3+ yrs", matched: "0% qualified × 10% max discount" },
        { label: "Driver Class Factor", value: 1.672, base: 1, driver: "Driver age, violations & accidents", input: "1 driver, 0 with violations", matched: "average of best 1 driver + 4 unassigned slot(s)" },
        { label: "Account-Level Factor", value: 0.87, base: 1, driver: "8 underwriting questions", input: "Business Experience -3%, Carrier Safety / FMCSA Alerts -5%, ICC Filing -5%", matched: "1 + sum of credits/debits" },
        { label: "Experience Mod", value: 0.9, base: 1, driver: "Loss history (3yr claims & incurred)", input: "0 claims > $500, $0 incurred", matched: `credibility-weighted, ${(sub.vehicles && sub.vehicles.length) || 5} units × 36 mo` },
        { label: "Rated Power Units", value: (sub.vehicles && sub.vehicles.length) || 5, base: null, driver: "Vehicle Schedule", input: `${(sub.vehicles && sub.vehicles.length) || 5} units`, matched: "count of vehicles on the schedule" }
      ]
    },
    {
      name: "Physical Damage",
      subtotal: Math.round(covPrem * 0.88) || 331475,
      factors: [
        { label: "Total Insured Value (units + trailers)", value: 6250000, base: null, driver: "Vehicle & trailer stated values", input: `${(sub.vehicles && sub.vehicles.length) || 5} units`, matched: "sum of every unit's stated value plus its trailer" },
        { label: "APD Rate (per $ of value)", value: 0.0475, base: 0.0475, driver: "Vehicle stated value (per unit)", input: "$1,250,000", matched: "value band containing $1,250,000" },
        { label: "APD Deductible Factor", value: 0.875, base: 1, driver: "Physical Damage Deductible", input: "$5,000", matched: "$5,000 deductible" },
        { label: "APD Radius Factor", value: 1, base: 1, driver: "Radius of Operation", input: "Local / Intermediate", matched: "Local-Intermediate · Intermediate-300 (0 - 300 Miles)" },
        { label: "Trailer PhysDam Factor", value: 1, base: 1, driver: "Trailer Type (per unit)", input: "None", matched: "None" },
        { label: "APD State Factor", value: 0.95, base: 1, driver: "Garaging State", input: state || "Mobile", matched: state || "Mobile" },
        { label: "APD Package Factor", value: 0.9, base: 1, driver: "Coverages selected", input: "Liability + Physical Damage", matched: "Package policy — Yes" },
        { label: "Miles Driven Factor", value: 0.95, base: 1, driver: "Annual Miles + Radius category", input: "450 mi", matched: "Local-Intermediate band" },
        { label: "Rating Class Factor", value: 1, base: 1, driver: "Cargo / Hauling Type", input: "Dry Van or Box - Single Trailer", matched: "Dry Van or Box - Single Trailer" },
        { label: "Dashcam Factor", value: 1.2, base: 1, driver: "Dashcams Installed", input: "NO Dashcams", matched: "NO Dashcams" },
        { label: "Experience Mod", value: 0.9, base: 1, driver: "Loss history (3yr claims & incurred)", input: "0 claims > $500, $0 incurred", matched: "same mod as Auto Liability" }
      ]
    }
  ];

  // Scheduled Equipment
  let scheduled_equipment = [];
  if (baseData.scheduled_equipment && baseData.scheduled_equipment.length > 0) {
    scheduled_equipment = baseData.scheduled_equipment;
  } else if (sub.vehicles && sub.vehicles.length > 0) {
    scheduled_equipment = sub.vehicles.map((v, idx) => ({
      unit_number: v.unit_number || (v.model && (v.model.toLowerCase().includes("reefer") || v.model.toLowerCase().includes("trailer")) ? `TRL-0${idx + 1}` : `UNIT-0${idx + 1}`),
      year: v.year || (idx === 1 ? 2023 : 2024),
      make: v.make || (idx === 0 ? "Freightliner" : (idx === 1 ? "Kenworth" : "Great Dane")),
      model: v.model || (idx === 0 ? "Cascadia 126 Sleeper" : (idx === 1 ? "T680 Next Gen" : "Everest Reefer 53ft")),
      vin: v.vin || `1FUJGLDR8PL992${101 + idx}`,
      stated_value: v.stated_value || (idx === 0 ? 165000 : (idx === 1 ? 158000 : 75000)),
      class: v.class || v.weight || (idx === 2 ? "Refrigerated Semi-Trailer" : "Heavy Heavy-Duty Truck"),
      garaging_zip: v.zip || zip || "75201"
    }));
  } else {
    scheduled_equipment = [
      { unit_number: "UNIT-01", year: 2024, make: "Freightliner", model: "Cascadia 126 Sleeper", vin: "1FUJGLDR8PL992101", stated_value: 165000, class: "Heavy Heavy-Duty Truck", garaging_zip: zip || "75201" },
      { unit_number: "UNIT-02", year: 2023, make: "Kenworth", model: "T680 Next Gen", vin: "1NKHDB9X7PR884102", stated_value: 158000, class: "Heavy Heavy-Duty Truck", garaging_zip: zip || "75201" },
      { unit_number: "TRL-01", year: 2024, make: "Great Dane", model: "Everest Reefer 53ft", vin: "1GRAA0624PR449102", stated_value: 75000, class: "Refrigerated Semi-Trailer", garaging_zip: zip || "75201" }
    ];
  }

  // Scheduled Drivers
  let scheduled_drivers = [];
  if (baseData.scheduled_drivers && baseData.scheduled_drivers.length > 0) {
    scheduled_drivers = baseData.scheduled_drivers;
  } else if (sub.drivers && sub.drivers.length > 0) {
    scheduled_drivers = sub.drivers.map((d, idx) => ({
      driver_id: d.driver_id || `DRV-0${idx + 1}`,
      full_name: d.full_name || (d.given_name ? `${d.given_name} ${d.last_name}` : (idx === 0 ? "Marcus Vance" : "James Henderson")),
      cdl_number: d.cdl_number || `${d.licensestate || state || 'TX'}-CDL-${idx === 0 ? '889102' : '449102'}`,
      cdl_state: d.cdl_state || d.licensestate || state || "TX",
      years_experience: parseInt(d.experience, 10) || d.tenure || (idx === 0 ? 12 : 8),
      mvr_status: d.mvr_status || "Clean (0 Violations, 0 Points)",
      medical_card_current: d.medical_card_current !== undefined ? d.medical_card_current : true
    }));
  } else {
    scheduled_drivers = [
      { driver_id: "DRV-01", full_name: "Marcus Vance", cdl_number: `${state || 'TX'}-CDL-889102`, cdl_state: state || "TX", years_experience: 12, mvr_status: "Clean (0 Violations, 0 Points)", medical_card_current: true },
      { driver_id: "DRV-02", full_name: "James Henderson", cdl_number: `${state || 'TX'}-CDL-449102`, cdl_state: state || "TX", years_experience: 8, mvr_status: "Clean (0 Violations, 0 Points)", medical_card_current: true }
    ];
  }

  const roleConfig = (typeof USER_ROLES_CONFIG !== 'undefined' && USER_ROLES_CONFIG[currentUserRole]) ? USER_ROLES_CONFIG[currentUserRole] : { name: "Sarah Jenkins", title: "Junior Underwriter", authorityLimit: 2000000 };
  const cuoConfig = (typeof USER_ROLES_CONFIG !== 'undefined' && USER_ROLES_CONFIG.cuo) ? USER_ROLES_CONFIG.cuo : { name: "David Vance", title: "Senior VP Underwriting" };

  const quote_header = baseData.quote_header || {
    quote_number: sub.quoteNo || `QT-${(sub.lobKey || 'PRD021').toUpperCase()}-2026-0091`,
    quote_version: "v1.0-OFFICIAL",
    status: "Quote Issued",
    issuance_date: new Date().toISOString().slice(0, 10),
    effective_date: (sub.genInfo && sub.genInfo.effective_date) || "2026-09-01",
    expiration_date: (sub.genInfo && sub.genInfo.expiration_date) || "2027-09-01",
    term_months: 12,
    validity_window_days: 30,
    binding_authority: `VeriDex Standard Binding Authority ($${(roleConfig.authorityLimit || 2000000).toLocaleString()} Limit)`
  };

  const safeInsuredSlug = (sub.insured || 'apex').toLowerCase().replace(/[^a-z0-9]/g, '');
  const insured_information = baseData.insured_information || {
    entity_name: sub.insured || "Apex Hauling Logistics LLC (Freightliner Cascadia 2025 - AL)",
    dba: sub.dba || `${sub.insured || "Apex Hauling Logistics LLC (Freightliner Cascadia 2025 - AL)"} Logistics`,
    fein: sub.fein || "AL-8839012",
    dot_number: sub.dot ? (sub.dot.startsWith("USDOT") ? sub.dot : `USDOT ${sub.dot}`) : "USDOT 4018291",
    mc_number: sub.mcNumber || "MC-881924",
    business_type: (sub.insuredInfo && sub.insuredInfo.entity_type) || "Limited Liability Company (LLC)",
    primary_operation: sub.lobName || "PRD-021 Trucking_test (Commercial Auto v2026.10)",
    years_in_business: (sub.insuredInfo && sub.insuredInfo.years_of_experience) || 5,
    headquarters_address: {
      full_address: full_address,
      street: street || "1420 Commerce Dr",
      city: city || "1420 Commerce Dr",
      state: state || "Mobile",
      zip_code: zip || "75201",
      country: "United States"
    },
    primary_contact: {
      name: (sub.primaryContact && sub.primaryContact.name) || "Marcus Vance",
      title: (sub.primaryContact && sub.primaryContact.title) || "Managing Director / Safety Officer",
      phone: (sub.primaryContact && sub.primaryContact.phone) || "+1 (214) 555-0192",
      email: (sub.primaryContact && sub.primaryContact.email) || sub.email || `compliance@${safeInsuredSlug}.com`
    },
    operational_profile: {
      radius_of_operation: (sub.radiusOfOperationsInfo && `${sub.radiusOfOperationsInfo.radius}+ Miles (${sub.radiusOfOperationsInfo.Intrastate_interstate} Long-haul)`) || "500+ Miles (Interstate Long-haul)",
      annual_fleet_mileage: "650,000 miles",
      operating_states: ["TX", "OK", "AR", "LA", "NM", "AL", "AZ", "OR"],
      commodities_hauled: [
        "General Freight",
        "Dry Van Goods",
        "Refrigerated Produce",
        "Automotive Parts"
      ],
      hazmat_transport: false,
      telematics_installed: true,
      dashcam_type: "Dual-facing AI Telematics (Samsara)"
    },
    loss_history_summary: {
      valuation_date: "2026-08-01",
      past_5_years_claims_count: (sub.losses && sub.losses.length) || 0,
      total_incurred_losses: (sub.canonicalJson && sub.canonicalJson.loss_history && `$${sub.canonicalJson.loss_history.total_incurred.toLocaleString()}.00`) || "$0.00",
      loss_ratio_5yr: (sub.canonicalJson && sub.canonicalJson.loss_history && sub.canonicalJson.loss_history.loss_ratio) || "0.0%",
      prior_carrier: sub.priorCarrier || "Travelers Commercial Insurance",
      prior_policy_number: sub.priorPolicy || "TRV-882910-TX"
    }
  };

  const safeBrokerSlug = (sub.broker || 'brokerage').toLowerCase().replace(/[^a-z0-9]/g, '');
  const producing_broker = baseData.producing_broker || {
    agency_name: sub.broker || "Gulf Coast Commercial Insurance Group",
    producer_name: (sub.producer && sub.producer.name) || "Thomas Sterling",
    producer_email: (sub.producer && sub.producer.email) || `t.sterling@${safeBrokerSlug}.com`,
    producer_phone: (sub.producer && sub.producer.phone) || "+1 (800) 555-4820",
    license_number: (sub.producer && sub.producer.license) || "TX-BRK-99210",
    commission_percentage: 15
  };

  const underwriting_metadata = baseData.underwriting_metadata || {
    submission_id: sub.id || "SUB-PRD021-01-AL",
    assigned_underwriter: (sub.underwriter || roleConfig.name).split('(')[0].trim(),
    underwriter_title: `${roleConfig.title} ($${(roleConfig.authorityLimit >= 1000000 ? (roleConfig.authorityLimit/1000000) + "M" : (roleConfig.authorityLimit/1000) + "k")} Limit)`,
    supervising_cuo: `${cuoConfig.name} (Senior VP Underwriting)`,
    intake_channel: sub.channelName || "Broker Portal / Email Ingestion",
    priority_tier: `${sub.priority || 'P1'} SLA`,
    clearance_result: "PASSED (Zero Duplicate Submissions, FEIN Cleared)",
    appetite_result: "IN-APPETITE (Commercial Auto Tier-1 Preferred)"
  };

  const quote_summary = {
    finalPremium: finalPrem,
    coveragePremium: covPrem,
    baseLossCost: baseLossCost,
    netPremium: netPrem,
    feesTotal: feesTotal,
    taxTotal: taxTotal,
    tax: tax,
    countyTax: countyTax,
    ratingVersion: existingQuote.ratingVersion || "v2026.03",
    lob: existingQuote.lob || sub.lobName || "Commercial Trucking",
    state: existingQuote.state || state || "Mobile",
    countyName: existingQuote.countyName || "Denton County",
    fees: fees,
    discounts: discounts,
    creditsNotApplied: creditsNotApplied
  };

  const rating_engine_breakdown = baseData.rating_engine_breakdown || {
    quote_summary: quote_summary,
    coverages: coverages,
    itemized_fees: fees,
    itemized_taxes: [
      {
        name: "Texas Surplus Lines Tax (4.85%)",
        amount: tax
      },
      {
        name: `${existingQuote.countyName || "Denton County"} Emergency Services Assessment (${existingQuote.countyRate || "0.55"}%)`,
        amount: countyTax
      }
    ]
  };

  return {
    quote: quote_summary,
    coverages: coverages,
    quote_header: quote_header,
    insured_information: insured_information,
    producing_broker: producing_broker,
    underwriting_metadata: underwriting_metadata,
    scheduled_equipment: scheduled_equipment,
    scheduled_drivers: scheduled_drivers,
    rating_engine_breakdown: rating_engine_breakdown
  };
}

function downloadQuoteDoc() {
  showToast("📄 Downloading official bindable quote proposal PDF...", "info");
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
      { label: "VeriDex", onClick: "showIntakePage()" },
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
  DISCRETIONARY_MAX_CREDIT_PCT = (typeof pricingBlock.maxCreditPct === "number") ? pricingBlock.maxCreditPct : 15;
  DISCRETIONARY_MAX_DEBIT_PCT = (typeof pricingBlock.maxDebitPct === "number") ? pricingBlock.maxDebitPct : 25;
  DISCRETIONARY_TAX_RATE_PCT = (typeof pricingBlock.taxRatePct === "number") ? pricingBlock.taxRatePct : 3.2;
  window.DISCRETIONARY_MAX_CREDIT_PCT = DISCRETIONARY_MAX_CREDIT_PCT;
  window.DISCRETIONARY_MAX_DEBIT_PCT = DISCRETIONARY_MAX_DEBIT_PCT;
  window.DISCRETIONARY_TAX_RATE_PCT = DISCRETIONARY_TAX_RATE_PCT;

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
  var p = window.ACTIVE_INSURANCE_PRODUCT || ACTIVE_INSURANCE_PRODUCT;

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
  if (carrierEl) carrierEl.textContent = (pInfo.productType || "Commercial Auto") + " / " + (pInfo.carrier || "Veridex Insurance");
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
    "carrier": "Veridex Insurance",
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
      "comment": "VeriDex Engine API endpoint mapping"
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
      "note": "6 Eligibility Criteria Ready"
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

function deployProductToEngine() {
  if (!window.ACTIVE_INSURANCE_PRODUCT) {
    showToast("⚠️ Please upload a product schema first.", "warning");
    return;
  }
  showToast("🚀 Product deployed & active in VeriDex Underwriting Engine!", "success");
}

function openAddCoverModal() {
  if (!window.ACTIVE_INSURANCE_PRODUCT) {
    showToast("⚠️ Please upload a product schema first.", "warning");
    return;
  }
  var name = prompt("Enter Cover Name (e.g., Cargo & Freight Loss):");
  if (!name) return;
  var newCover = {
    id: "COV-" + Date.now().toString(36),
    name: name,
    code: "COV-CUSTOM",
    availability: "optional",
    complete: true,
    type: "Commercial Auto Endorsement",
    description: name + " endorsement for Commercial Trucking policy.",
    basisOfCoverage: "Agreed Value",
    maxSingleLimit: "500,000",
    deductibleAmount: "500",
    lossBasis: "Per Occurrence",
    wordingDocs: [{ name: name + " Schedule", code: "DOC-CUST-001" }]
  };
  var p = window.ACTIVE_INSURANCE_PRODUCT;
  if (!p.studios) p.studios = {};
  if (!p.studios.coverage) p.studios.coverage = [];
  p.studios.coverage.push(newCover);
  renderCoverageStudio();
  showToast("🛡️ Added coverage " + name, "success");
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
window.deployProductToEngine = deployProductToEngine;
window.openAddCoverModal = openAddCoverModal;
window.ingestProductSchema = ingestProductSchema;
window.refreshUserRoleDropdown = refreshUserRoleDropdown;

