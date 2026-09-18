// CASE DOCUMENTS HUB & MULTI-PDF VIEWER MODAL
// ============================================================================
let currentHubSubId = null;
let currentHubDocIdx = 0;

function openDocsManagerModal(subId, docIdx = 0) {
  const targetId = subId || activeSubmissionId;
  currentHubSubId = targetId;
  currentHubDocIdx = docIdx;

  const sub = SUBMISSIONS_DATASET.find(s => s.id === targetId);
  if (!sub) return;

  const modal = document.getElementById("caseDocsModal");
  const title = document.getElementById("caseDocsModalTitle");
  const subtitle = document.getElementById("caseDocsModalSubtitle");
  const countEl = document.getElementById("caseDocsCount");
  const listContainer = document.getElementById("caseDocsListContainer");

  if (title) title.innerHTML = `Case Documents: <strong>${sub.insured}</strong>`;
  if (subtitle) subtitle.textContent = `Submission ID: ${sub.id} • ${sub.docs ? sub.docs.length : 0} Attached Files • Line of Business: ${sub.lobName}`;
  if (countEl) countEl.textContent = sub.docs ? sub.docs.length : 0;

  if (listContainer && sub.docs) {
    listContainer.innerHTML = sub.docs.map((d, i) => `
      <div class="doc-hub-card ${i === docIdx ? 'active' : ''}" onclick="switchHubDoc(${i})">
        <div class="doc-hub-card-header">
          <div class="doc-hub-card-icon ${d.type}">
            <i class="ph ${d.type === 'pdf' ? 'ph-file-pdf' : 'ph-file-xls'}"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div class="doc-hub-card-title">${d.name}</div>
            <div class="doc-hub-card-meta">${d.desc}</div>
          </div>
        </div>
        <div class="doc-hub-card-actions">
          <span class="badge ${d.type === 'pdf' ? 'badge-primary' : 'badge-success'}" style="font-size: 9.5px;">${d.type.toUpperCase()} DOCUMENT</span>
          <button class="btn-preview-doc" onclick="event.stopPropagation(); switchHubDoc(${i})">
            <i class="ph ph-eye"></i> ${i === docIdx ? 'Viewing' : 'Preview'}
          </button>
          ${hasPermission('documents', 'edit') ? `
          <button class="btn-preview-doc u-text-danger" onclick="event.stopPropagation(); confirmDeleteSubmissionDocument('${sub.id}', ${i})" title="Delete document">
            <i class="ph ph-trash"></i> Delete
          </button>` : ''}
        </div>
      </div>
    `).join("");
  }

  renderHubDocumentPreview(sub, docIdx);

  if (modal) modal.classList.add("active");
}

function deleteSubmissionDocument(subId, docIdx) {
  if (!hasPermission("documents", "edit")) {
    denyPermission("documents", "edit");
    return;
  }
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.docs || !sub.docs[docIdx]) return;

  const removed = sub.docs.splice(docIdx, 1)[0];
  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  showToast(`🗑️ "${removed.name}" deleted by ${roleConfig.name}.`, "success");

  renderSubmissionsTable();
  openDocsManagerModal(subId, 0);
}

function switchHubDoc(docIdx) {
  currentHubDocIdx = docIdx;
  const sub = SUBMISSIONS_DATASET.find(s => s.id === currentHubSubId);
  if (!sub) return;

  // Update card active states
  const cards = document.querySelectorAll(".doc-hub-card");
  cards.forEach((c, idx) => {
    if (idx === docIdx) {
      c.classList.add("active");
      const btn = c.querySelector(".btn-preview-doc");
      if (btn) btn.innerHTML = `<i class="ph ph-eye"></i> Viewing`;
    } else {
      c.classList.remove("active");
      const btn = c.querySelector(".btn-preview-doc");
      if (btn) btn.innerHTML = `<i class="ph ph-eye"></i> Preview`;
    }
  });

  renderHubDocumentPreview(sub, docIdx);
}

function renderHubDocumentPreview(sub, docIdx) {
  if (!sub || !sub.docs || !sub.docs[docIdx]) return;
  const doc = sub.docs[docIdx];

  const badge = document.getElementById("hubActiveDocBadge");
  const title = document.getElementById("hubActiveDocTitle");
  const meta = document.getElementById("hubActiveDocMeta");
  const viewer = document.getElementById("hubDocViewerContainer");

  if (badge) badge.textContent = doc.name.toLowerCase().includes("handwritten") ? "HANDWRITTEN NOTE" : (doc.name.toLowerCase().includes("acord") ? "ACORD APPLICATION" : (doc.type === "xls" ? "SOV SCHEDULE" : "LOSS RUN REPORT"));
  if (title) title.textContent = doc.name;
  if (meta) meta.textContent = doc.name.toLowerCase().includes("handwritten") ? `${doc.desc} • Status: Pending Manual OCR Review` : `${doc.desc} • Status: 100% Normalized`;

  if (!viewer) return;

  // Render authentic document preview HTML
  if (doc.name.toLowerCase().includes("handwritten")) {
    viewer.innerHTML = `
      <div class="doc-preview-sheet">
        <div class="u-section-header">
          <div>
            <h4 class="u-title-16-dark"><i class="ph ph-file-pdf text-danger"></i> HANDWRITTEN BROKER COVER NOTE (SCANNED)</h4>
            <span class="text-secondary text-sm">Insured: ${sub.insured} • Attached by ${sub.broker || 'Submitting Party'}</span>
          </div>
          <span class="badge badge-warning">Requires Manual OCR Review</span>
        </div>

        <div class="handwritten-note-paper">
          <div class="handwritten-note-text">
            <p>To Underwriting Desk,</p>
            <p>Please find attached the submission for <strong>${sub.insured}</strong>
            (${sub.id}) — ${sub.lobName}. Insured is a solid, long-standing account of ours,
            good payment history, no major concerns from our side.</p>
            <p>Effective date requested 09/01. Kindly fast-track if possible, client is
            eager to bind before renewal lapses. Loss runs &amp; SOV attached separately.</p>
            <p>Call me if anything's missing.</p>
            <p class="handwritten-note-signoff">— ${(sub.broker || 'Broker').split(' ')[0]} Desk</p>
          </div>
        </div>

        <div style="margin-top: 16px; padding: 12px; background: #fffbeb; border-radius: 6px; border: 1px solid #fde68a; display: flex; justify-content: space-between; align-items: center;">
          <div class="text-sm">
            <i class="ph ph-warning text-warning"></i> Handwritten source document — not machine-OCR'd. Route to Clearance for manual data verification.
          </div>
          <div class="text-sm font-mono text-muted">Scanned ${sub.receivedAt}</div>
        </div>
      </div>
    `;
  } else if (doc.name.toLowerCase().includes("acord") || doc.name.toLowerCase().includes("app")) {
    viewer.innerHTML = `
      <div class="doc-preview-sheet acord-pdf-sheet">
        <div class="acord-top-header">
          <div class="acord-logo-badge">
            <i class="ph ph-shield-check"></i> ACORD <strong>FORM</strong>
          </div>
          <div class="acord-form-title">
            <h4>Commercial Insurance Application</h4>
            <span>Standard ISO Certified Format • ${sub.lobName}</span>
          </div>
        </div>

        <div class="acord-section-box">
          <div class="acord-sec-title"><span>Section 1: Producer & Agency Information</span><span>Submission ID: ${sub.id}</span></div>
          <div class="acord-sec-grid">
            <div class="acord-field"><span class="lbl">Broker / Agency:</span><span class="val">${sub.broker}</span></div>
            <div class="acord-field"><span class="lbl">Producer Email:</span><span class="val font-mono">${sub.email}</span></div>
            <div class="acord-field"><span class="lbl">Channel Origin:</span><span class="val">${sub.channelName}</span></div>
          </div>
        </div>

        <div class="acord-section-box">
          <div class="acord-sec-title"><span>Section 2: Named Insured & Risk Profile</span><span>LOB: ${sub.lobName}</span></div>
          <div class="acord-sec-grid">
            <div class="acord-field"><span class="lbl">Legal Named Insured:</span><strong class="val">${sub.insured}</strong></div>
            <div class="acord-field"><span class="lbl">FEIN / Tax ID:</span><span class="val font-mono">${sub.fein}</span></div>
            <div class="acord-field"><span class="lbl">USDOT / Registration:</span><span class="val font-mono">${sub.dot || 'N/A'}</span></div>
            <div class="acord-field" style="grid-column: span 2;"><span class="lbl">Mailing Address:</span><span class="val">${sub.address}</span></div>
            <div class="acord-field"><span class="lbl">Target Effective Date:</span><span class="val">2026-09-01 (12 Months)</span></div>
          </div>
        </div>

        <div class="acord-section-box">
          <div class="acord-sec-title"><span>Section 3: Scheduled Coverages & Limits Requested</span><span>Binding Authority Limit: $${(sub.authorityLimit/1000000).toFixed(1)}M</span></div>
          ${renderCoverageRowsHtml(sub.coverageRows)}
        </div>

        <div class="acord-section-box" style="margin-bottom: 0;">
          <div class="acord-sec-title"><span>Section 4: Electronic Signatures & Compliance Verification</span><span>ISO Verified</span></div>
          <div class="acord-sec-grid">
            <div class="acord-field"><span class="lbl">Applicant Signature:</span><span class="val">/s/ Authorized Officer (${sub.insured})</span></div>
            <div class="acord-field"><span class="lbl">Broker Stamp:</span><span class="val font-mono">BROKER-VERIFIED-CERT</span></div>
            <div class="acord-field"><span class="lbl">Timestamp:</span><span class="val">${sub.receivedAt}</span></div>
          </div>
        </div>
      </div>
    `;
  } else if (doc.type === "xls" || doc.name.toLowerCase().includes("sov") || doc.name.toLowerCase().includes("schedule")) {
    viewer.innerHTML = `
      <div class="doc-preview-sheet">
        <div class="u-section-header">
          <div>
            <h4 class="u-title-16-dark"><i class="ph ph-file-xls text-success"></i> STATEMENT OF VALUES (SOV) & ASSET SCHEDULE</h4>
            <span class="text-secondary text-sm">Insured: ${sub.insured} • Line of Business: ${sub.lobName}</span>
          </div>
          <span class="badge badge-success">Schedule Normalized</span>
        </div>

        <table class="excel-sheet-table">
          <thead>
            <tr>
              <th>Item #</th>
              <th>Asset / Vehicle / Location Description</th>
              <th>Identifier / VIN / Class</th>
              <th>Territory / Location</th>
              <th>Stated Value / Exposure</th>
              <th>Safety Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>001</strong></td>
              <td>Primary Scheduled Unit / Facility A</td>
              <td class="font-mono">1FTNE31L8HDA89210</td>
              <td>Texas Core Operations Hub</td>
              <td class="font-mono font-bold">${sub.exposure}</td>
              <td><span class="badge badge-success">Verified Clear</span></td>
            </tr>
            <tr>
              <td><strong>002</strong></td>
              <td>Secondary Operational Support Asset</td>
              <td class="font-mono">1FTNE31L9HDA89211</td>
              <td>Regional Service Facility</td>
              <td class="font-mono font-bold">Included in Fleet Pool</td>
              <td><span class="badge badge-success">Verified Clear</span></td>
            </tr>
            <tr>
              <td><strong>003</strong></td>
              <td>Auxiliary Equipment & Contents</td>
              <td class="font-mono">EQUIP-SCHED-044</td>
              <td>Scheduled Terminals</td>
              <td class="font-mono font-bold">Full Replacement Cost</td>
              <td><span class="badge badge-info">Inspected</span></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4"><strong>TOTAL SCHEDULED EXPOSURE VALUATION:</strong></td>
              <td class="font-mono" style="color: var(--primary); font-size: 14px;"><strong>${sub.exposure}</strong></td>
              <td><span class="badge badge-primary">Within Appetite</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  } else {
    // Loss Run Preview
    viewer.innerHTML = `
      <div class="doc-preview-sheet">
        <div class="u-section-header">
          <div>
            <h4 class="u-title-16-dark"><i class="ph ph-file-pdf text-danger"></i> OFFICIAL CARRIER SIGNED LOSS RUN REPORT</h4>
            <span class="text-secondary text-sm">Insured: ${sub.insured} • Prior 3-Year Valuation as of 2026-08-01</span>
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
            ${sub.losses.map((l, i) => `
              <tr>
                <td><strong>${l.year}</strong></td>
                <td class="font-mono">CLM-2026-${1000 + i * 42}</td>
                <td>${l.desc}</td>
                <td><span class="badge ${l.status === 'Clean' ? 'badge-success' : 'badge-info'}">${l.status}</span></td>
                <td class="font-mono">${l.incurred}</td>
                <td class="font-mono font-bold">${l.incurred}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="lbl" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">3-Year Cumulative Loss Ratio:</span>
            <strong style="color: #15803d; font-size: 15px; margin-left: 8px;">18.4% (Highly Favorable)</strong>
          </div>
          <div class="text-sm font-mono text-muted">
            <i class="ph ph-stamp text-primary"></i> Certified Carrier Loss Audit
          </div>
        </div>
      </div>
    `;
  }
}

function closeCaseDocsModal() {
  const modal = document.getElementById("caseDocsModal");
  if (modal) modal.classList.remove("active");
}

function proceedToCaseFromDocsModal() {
  closeCaseDocsModal();
  const targetId = currentHubSubId || activeSubmissionId;
  const sub = SUBMISSIONS_DATASET.find(s => s.id === targetId);
  if (sub) {
    openCaseAtCurrentStep(sub.id);
  }
}

// Modal: New Submission Creation
function openNewIntakeModal() {
  const modal = document.getElementById("newIntakeModal");
  if (modal) modal.classList.add("active");
}

function closeNewIntakeModal() {
  const modal = document.getElementById("newIntakeModal");
  if (modal) modal.classList.remove("active");
}

function toggleModalBrokerField() {
  const channelEl = document.getElementById("newIntakeChannel");
  const brokerGroup = document.getElementById("modalBrokerFieldGroup");
  if (channelEl && brokerGroup) {
    brokerGroup.style.display = channelEl.value === "broker" ? "block" : "none";
  }
}

function handleCreateNewIntake(e) {
  e.preventDefault();
  const channel = document.getElementById("newIntakeChannel")?.value || "broker";
  const lobKey = document.getElementById("newIntakeLOB")?.value || "trucking";
  const insured = document.getElementById("newIntakeInsured")?.value || "New Entity LLC";
  const fein = document.getElementById("newIntakeFEIN")?.value || "12-3456789";
  const broker = channel === "broker" ? (document.getElementById("newIntakeBroker")?.value || "Marsh & McLennan") : "Direct Customer Portal";

  const newId = `SUB-${Math.floor(10000 + Math.random() * 90000)}-${fein.slice(0,2)}`;
  
  const template = SUBMISSIONS_DATASET.find(s => s.lobKey === lobKey) || SUBMISSIONS_DATASET[0];
  const newSub = JSON.parse(JSON.stringify(template));
  newSub.id = newId;
  newSub.insured = insured;
  newSub.fein = fein;
  newSub.channelType = channel;
  newSub.broker = broker;
  newSub.priority = "P1";
  newSub.priorityScore = 95;
  newSub.slaText = "4h Fast-Track SLA";
  newSub.slaCountdown = "4h 00m remaining";
  newSub.priorityReason = "New Incoming Intake • Fast-Track FIFO Position #1";
  newSub.channelName = channel === "broker" ? `Broker Intake: ${broker}` : "Direct Customer Portal (Self-Service)";
  newSub.receivedAt = "Just Now";
  newSub.receivedTimestamp = Date.now();
  newSub.statusText = "Intake Ingested";
  newSub.statusBadge = "badge-primary";
  newSub.currentStep = 1;
  newSub.completedSteps = [];

  SUBMISSIONS_DATASET.unshift(newSub);
  closeNewIntakeModal();
  selectSubmission(newId, false);
  renderSubmissionsTable();
  showToast(`✅ New Submission [${newId}] created & added to Intake Queue!`, "success");
}

// ============================================================================
// 6. RENDERING ALL DOWNSTREAM SCREENS (SCREENS 2 TO 9)
// ============================================================================
function renderAllDownstreamScreens(sub) {
  // Demo Mode (OFF by default): renders a throwaway sample-filled clone
  // instead of the real submission for this pass only — never touches
  // SUBMISSIONS_DATASET, never persisted. See js/demo-mode.js.
  if (typeof DEMO_MODE_ENABLED !== "undefined" && DEMO_MODE_ENABLED && typeof getDemoDisplaySubmission === "function") {
    sub = getDemoDisplaySubmission(sub);
  }

  // Screen 2: OCR Fields & Canonical Record
  renderOCRFields(sub.ocrFields, sub.docs);
  if (typeof renderRawEmailCapturePanel === "function") renderRawEmailCapturePanel(sub);
  const canonInsured = document.getElementById("canonInsured");
  const canonLOB = document.getElementById("canonLOB");
  const canonExposure = document.getElementById("canonExposure");
  const canonJson = document.getElementById("canonicalJsonDisplay");
  const subIdBadge = document.getElementById("submissionIdBadge");

  if (canonInsured) canonInsured.textContent = sub.insured;
  if (canonLOB) canonLOB.textContent = sub.lobName;
  if (canonExposure) canonExposure.textContent = sub.exposure;
  if (canonJson) canonJson.textContent = JSON.stringify(sub.canonicalJson, null, 2);
  if (subIdBadge) subIdBadge.textContent = sub.id;

  // Screen 3: Clearance & Appetite
  const feinNum = document.getElementById("checkFeinNumber");
  const brokerLock = document.getElementById("brokerLock");
  if (feinNum) feinNum.textContent = sub.fein;
  if (brokerLock) brokerLock.textContent = sub.broker;
  renderFeinClearanceStatus(sub);
  renderAppetiteRules(sub.appetiteRules);

  // Screen 4: Third-Party Data Enrichment & Manual Assignment (Optional)
  renderEnrichmentCards(sub.enrichmentCards);
  if (typeof renderRegistryVerificationCard === "function") renderRegistryVerificationCard(sub);
  if (typeof renderVehicleEnrichment === "function") renderVehicleEnrichment(sub);
  if (typeof renderComplianceGate === "function") renderComplianceGate(sub);
  if (typeof renderDriverLicenseVerification === "function") renderDriverLicenseVerification(sub);
  const deskSelect = document.getElementById("manualDeskSelect");
  const uwSelect = document.getElementById("manualUnderwriterSelect");
  const callout = document.getElementById("assignmentVisibilityCallout");
  const text = document.getElementById("assignmentVisibilityText");
  const badge = document.getElementById("assignmentBadge");
  const slaTarget = document.getElementById("assignedSlaTarget");
  const tBadge = document.getElementById("triagePriorityBadge");
  const tFifo = document.getElementById("triageFifoTime");
  const tProducer = document.getElementById("triageProducerTier");
  const tSlaCount = document.getElementById("triageSlaCountdown");

  if (deskSelect && sub.desk) deskSelect.value = sub.desk;
  if (uwSelect && sub.underwriter) uwSelect.value = sub.underwriter;

  const isUnassigned = !sub.underwriter || sub.underwriter.includes("Unassigned");
  if (callout) callout.className = isUnassigned ? "assignment-visibility-callout unassigned" : "assignment-visibility-callout assigned";
  if (text) {
    text.innerHTML = isUnassigned 
      ? `<strong>Unassigned</strong> • Visible to all team members in the open queue pool.` 
      : `Assigned to: <strong>${sub.underwriter}</strong> • Only visible in assigned workspace.`;
  }
  if (badge) {
    badge.className = isUnassigned ? "badge badge-light" : "badge badge-primary";
    badge.innerHTML = isUnassigned ? `<i class="ph ph-users"></i> Optional / Open Pool` : `<i class="ph ph-user-check"></i> Assigned: ${sub.underwriter.split(' ')[0]}`;
  }

  if (slaTarget) slaTarget.textContent = sub.slaText;
  if (tBadge) {
    tBadge.className = `badge ${sub.priority === 'P1' ? 'badge-danger' : (sub.priority === 'P2' ? 'badge-warning' : 'badge-info')}`;
    tBadge.textContent = `Priority: ${sub.priority} - ${sub.priority === 'P1' ? 'Highest' : (sub.priority === 'P2' ? 'High' : 'Standard FIFO')} (Score: ${sub.priorityScore}/100)`;
  }
  if (tFifo) tFifo.textContent = `${sub.receivedAt.split(' ')[1]} ${sub.receivedAt.split(' ')[2]} (Received Ingestion Queue)`;
  if (tProducer) tProducer.textContent = sub.channelType === 'broker' ? "Tier-1 Commercial Broker" : "Direct Customer Self-Service";
  if (tSlaCount) tSlaCount.textContent = sub.slaCountdown;

  // Screen 5: Underwriting Workbench
  switchDocTab("acord");
  renderLossTable(sub.losses);
  renderSubjectivities(sub.subjectivities);
  renderUnderwritingWorkbench(sub);
  if (typeof renderRiskScoreCard === "function") renderRiskScoreCard(sub);

  // Screen 6: Authority Matrix
  renderAuthorityScreen(sub);
  if (typeof renderRiskScoreOnAuthorityDesk === "function") renderRiskScoreOnAuthorityDesk(sub);

  // Screen 7: Rating Engine Live JSON Payload Viewer & CSV Exporter
  renderRatingEnginePayload(sub);

  // Screen 8: Step 7 Case Summary / Generated Quote Studio
  renderStep7View(sub);

  // RFI Modal defaults
  const rfiEmail = document.getElementById("rfiRecipientEmail");
  const rfiSubj = document.getElementById("rfiSubject");
  if (rfiEmail) rfiEmail.value = sub.email;
  if (rfiSubj) rfiSubj.value = `URGENT: RFI on Submission #${sub.id} - ${sub.insured}`;
}

// Handler: Manual Underwriter Assignment Change (Screen 4)
function onManualAssignmentChange() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) return;

  const deskSelect = document.getElementById("manualDeskSelect");
  const uwSelect = document.getElementById("manualUnderwriterSelect");
  const callout = document.getElementById("assignmentVisibilityCallout");
  const text = document.getElementById("assignmentVisibilityText");
  const badge = document.getElementById("assignmentBadge");

  const selectedDesk = deskSelect ? deskSelect.value : sub.desk;
  const selectedUW = uwSelect ? uwSelect.value : sub.underwriter;

  sub.desk = selectedDesk;
  sub.underwriter = selectedUW;

  const isUnassigned = selectedUW.includes("Unassigned");

  if (isUnassigned) {
    if (callout) callout.className = "assignment-visibility-callout unassigned";
    if (text) text.innerHTML = `<strong>Unassigned</strong> • Visible to all team members in the open queue pool.`;
    if (badge) {
      badge.className = "badge badge-light";
      badge.innerHTML = `<i class="ph ph-users"></i> Optional / Open Pool`;
    }
    showToast(`Case unassigned: Visible to all team members in the open queue.`, "info");
  } else {
    if (callout) callout.className = "assignment-visibility-callout assigned";
    if (text) text.innerHTML = `Assigned to: <strong>${selectedUW}</strong> • Only visible in assigned workspace.`;
    if (badge) {
      badge.className = "badge badge-primary";
      badge.innerHTML = `<i class="ph ph-user-check"></i> Assigned: ${uwFirstName}`;
    }
    showToast(`✅ Case manually assigned to ${selectedUW}! Visible in ${uwFirstName}'s workspace.`, "success");
  }

  // Refresh Table highlights, and Team Activity (which groups by
  // underwriter — a reassignment changes which team member's card this
  // submission appears under).
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
}

/**
 * Best-guess source document for an extracted field that has no explicit
 * `source` set on it — matches the field's key against the submission's
 * actual attached document names, falling back to the primary application
 * form (ACORD), same as a real OCR pipeline would tag its evidence doc.
 */
// Shared, redesigned Coverage Lines component — used by both the ACORD
// Application Form preview (Screen 1 doc viewer and the Underwriting
// Workbench doc viewer, which previously duplicated the same plain
// black-bordered spreadsheet table in two places). Renders each coverage
// line as an icon-led card instead of a table row, themed with the app's
// blue palette (#1D4ED8 / #1E40AF / #EFF6FF) plus a green accent for
// premium, to match the rest of the redesigned UI.
function coverageLineIcon(lineText) {
  var t = (lineText || "").toLowerCase();
  if (t.indexOf("cargo") !== -1) return "ph-package";
  if (t.indexOf("physical damage") !== -1 || t.indexOf("collision") !== -1) return "ph-car";
  if (t.indexOf("liability") !== -1) return "ph-shield-check";
  return "ph-file-text";
}

function renderCoverageRowsHtml(coverageRows) {
  if (!coverageRows || !coverageRows.length) {
    return '<div class="empty-state" style="padding:16px 0;"><i class="ph ph-shield-slash empty-state-icon"></i><div class="empty-state-body">No coverage lines on file.</div></div>';
  }
  return '<div class="coverage-lines-list">' + coverageRows.map(function (c) {
    return '' +
      '<div class="coverage-line-card">' +
        '<div class="cov-line-icon"><i class="ph ' + coverageLineIcon(c.line) + '"></i></div>' +
        '<div class="cov-line-main">' +
          '<div class="cov-line-name">' + c.line + '</div>' +
          '<div class="cov-line-meta">' +
            '<span class="cov-line-stat"><span class="cov-line-stat-lbl">Limit</span><span class="cov-line-stat-val">' + c.limit + '</span></span>' +
            '<span class="cov-line-stat"><span class="cov-line-stat-lbl">Deductible</span><span class="cov-line-stat-val">' + c.ded + '</span></span>' +
          '</div>' +
        '</div>' +
        '<div class="cov-line-prem-box">' +
          '<span class="cov-line-prem-lbl">Est. Premium</span>' +
          '<span class="cov-line-prem-val">' + c.prem + '</span>' +
        '</div>' +
      '</div>';
  }).join('') + '</div>';
}
window.renderCoverageRowsHtml = renderCoverageRowsHtml;

function guessFieldSource(fieldKey, docs) {
  if (!docs || docs.length === 0) return null;
  const key = fieldKey.toLowerCase();
  const find = needles => docs.find(d => needles.some(n => d.name.toLowerCase().includes(n)));
  let match = null;
  if (/loss|claim|incurred/.test(key)) match = find(["loss"]);
  else if (/driver|mvr|licen[sc]e/.test(key)) match = find(["mvr", "driver"]);
  else if (/safety|fmcsa|inspection|sprinkler|esfr|compliance/.test(key)) match = find(["fmcsa", "safety", "inspection", "sprinkler"]);
  else if (/unit|vehicle|sov|value|asset|building|contents|square|refrigeration|stated|tiv/.test(key)) match = find(["sov", "schedule"]);
  if (!match) match = find(["acord", "application"]) || docs[0];
  return match ? match.name : null;
}

// Helper: OCR Fields (Screen 2) — each row also shows exactly which
// attached document the value was extracted/transcribed from.
function renderOCRFields(fields, docs) {
  const container = document.getElementById("extractedFieldsList");
  if (!container || !fields) return;

  const VISIBLE_COUNT = 5;
  const rowHtml = (f) => {
    const sourceDoc = f.source || guessFieldSource(f.key, docs);
    const isManual = !/%/.test(f.conf || "");
    const sourceShort = sourceDoc && sourceDoc.length > 30 ? sourceDoc.substring(0, 28) + "…" : sourceDoc;
    return `
    <div class="extract-row">
      <span class="extract-key"><i class="ph ph-check text-success"></i> ${f.key}:</span>
      <span class="extract-val">${f.val}</span>
      <span class="extract-conf ${isManual ? 'manual' : ''}">${f.conf}${isManual ? '' : ' confidence'}</span>
      ${sourceDoc ? `<span class="extract-source" title="Extracted from: ${sourceDoc}"><i class="ph ${isManual ? 'ph-pencil-simple' : 'ph-file-text'}"></i> ${sourceShort}</span>` : ''}
    </div>`;
  };

  if (fields.length <= VISIBLE_COUNT) {
    container.innerHTML = fields.map(rowHtml).join("");
    return;
  }

  const visible = fields.slice(0, VISIBLE_COUNT);
  const hidden = fields.slice(VISIBLE_COUNT);
  container.innerHTML = `
    ${visible.map(rowHtml).join("")}
    <div class="extract-hidden-group u-hidden">${hidden.map(rowHtml).join("")}</div>
    <button type="button" class="btn btn-sm btn-outline extract-toggle-btn" onclick="toggleExtractedFieldsList(this)">
      <i class="ph ph-caret-down"></i> Show ${hidden.length} More Field${hidden.length === 1 ? '' : 's'}
    </button>
  `;
}

function toggleExtractedFieldsList(btn) {
  const group = btn.previousElementSibling;
  if (!group) return;
  const showing = !group.classList.contains("u-hidden");
  group.classList.toggle("u-hidden");
  const hiddenCount = group.children.length;
  btn.innerHTML = showing
    ? `<i class="ph ph-caret-down"></i> Show ${hiddenCount} More Field${hiddenCount === 1 ? '' : 's'}`
    : `<i class="ph ph-caret-up"></i> Show Fewer Fields`;
}
window.toggleExtractedFieldsList = toggleExtractedFieldsList;

// Helper: Appetite Rules (Screen 3)
/** Formats a rule's carrier base value for display/editing (e.g. 100 → "100 Vehicles", 25000000 → "$25,000,000"). */
// Extracts the first numeric token from a rule value/base-value, whatever
// format it's in ("24 Years", "$1,000,000", "25.5", etc.) so it can be
// compared numerically.
function parseRuleNumber(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/-?[\d,]+(\.\d+)?/);
  if (!m) return null;
  return parseFloat(m[0].replace(/,/g, ""));
}

// The actual Submission Value <-> MGU Base Value / Carrier Guardrail
// comparison. This is the single source of truth for PASS/FAIL — nothing
// hardcoded, nothing left stale: every time this runs, it re-derives pass
// from the rule's live val/baseValue/operator.
function evaluateAppetiteRule(rule) {
  const subNum = parseRuleNumber(rule.val);
  const baseNum = parseRuleNumber(rule.baseValue);
  if (subNum === null || baseNum === null) return rule.pass; // non-numeric rule (e.g. Yes/No) — leave as-is
  switch (rule.operator) {
    case ">=": return subNum >= baseNum;
    case "<=": return subNum <= baseNum;
    case ">": return subNum > baseNum;
    case "<": return subNum < baseNum;
    default: return rule.pass;
  }
}

function formatRuleBaseValue(r) {
  const bv = r.baseValue;
  if (bv === undefined || bv === null) {
    // No explicit carrier base value on this rule — try to pull one out of
    // its own guardrail/threshold text (e.g. "Fleet Age <= 10 Years" -> 10).
    // Never falls back to r.val (the submission's own value) here — that's
    // a different column entirely, and showing it in the editable "MGA
    // Base Value" field previously produced garbled numbers when someone
    // edited it (see validateMgaOverrideInput).
    const guardrailNum = parseRuleNumber(r.guardrail || r.threshold);
    return guardrailNum !== null ? (guardrailNum + (r.unit && r.unit !== "Yes/No" ? " " + r.unit : "")) : "";
  }
  if (r.unit === "$") return "$" + Number(bv).toLocaleString();
  if (r.unit === "%") return bv + "%";
  if (typeof bv === "number") return bv + (r.unit ? " " + r.unit : "");
  return String(bv);
}

// Rules currently rendered in the appetite table, keyed by Rule ID — used
// by validateMgaOverrideInput() to look up each input's guardrail on edit.
let currentAppetiteRulesById = {};

// Helper: Appetite Rules (Screen 3) — for each rule, if the current persona
// has "override" permission on the appetiteRules resource (set in User
// Master) AND the rule itself is MGA-overridable, render an editable
// carrier base-value control that flags red the moment it's set outside
// the carrier guardrail; otherwise render the base value as plain text.
function toggleAppetiteRuleOverride(ruleId) {
  const canOverridePermission = hasPermission("appetiteRules", "override");
  if (!canOverridePermission) {
    denyPermission("appetiteRules", "override");
    return;
  }

  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub || !sub.appetiteRules) return;

  const rule = sub.appetiteRules.find(r => r.ruleId === ruleId);
  if (!rule) return;

  // Turning an override ON bypasses a failed appetite rule — a real
  // underwriting decision, not a display toggle — so it gets a lightweight
  // confirmation step, same spirit as the Decline and Bind safeguards.
  // Turning it back OFF just undoes that, no confirmation needed.
  if (!rule.manualPassOverride) {
    const confirmed = window.confirm(`Override appetite rule "${rule.factor}" (${ruleId})?\n\nThis will mark a failed rule as passed for this submission. This action is logged.`);
    if (!confirmed) return;
  }

  rule.manualPassOverride = !rule.manualPassOverride;
  if (rule.manualPassOverride) {
    rule.pass = true;
    showToast(`🛡️ Underwriter override applied to rule ${ruleId} (${rule.factor}).`, "warning");
  } else {
    rule.pass = evaluateAppetiteRule(rule);
    showToast(`Underwriter override removed for rule ${ruleId}.`, "info");
  }

  renderAppetiteRules(sub.appetiteRules);
}

function renderAppetiteRules(rules) {
  const table = document.getElementById("appetiteRulesTable");
  if (!table || !rules) return;

  currentAppetiteRulesById = {};
  const canOverridePermission = hasPermission("appetiteRules", "override");

  // Live comparison: unless a human has explicitly clicked "Override" (the
  // manual bypass button), pass/fail is always freshly derived from
  // Submission Value vs MGU Base Value / Carrier Guardrail — never a stale
  // or hardcoded flag.
  rules.forEach(r => {
    if (!r.manualPassOverride) r.pass = evaluateAppetiteRule(r);
  });

  table.innerHTML = rules.map(r => {
    const ruleId = r.ruleId || "";
    if (ruleId) currentAppetiteRulesById[ruleId] = r;
    const factor = r.factor || r.desc;
    const guardrailText = r.guardrail || r.threshold;
    const showOverrideControl = canOverridePermission;
    const isYesNo = (r.unit || "").toLowerCase() === "yes/no";
    const baseValDisplay = formatRuleBaseValue(r);
    const subNumForCompare = parseRuleNumber(r.val);
    const baseNumForCompare = parseRuleNumber(r.baseValue);
    const comparisonText = (subNumForCompare !== null && baseNumForCompare !== null)
      ? `${r.val} ${r.operator || ''} ${baseValDisplay}`
      : null;

    let overrideCell;
    if (showOverrideControl && isYesNo) {
      overrideCell = `
        <select class="mga-override-input" data-rule-id="${ruleId}" onchange="validateMgaOverrideInput(this)">
          <option value="Yes" ${r.baseValue === "Yes" ? "selected" : ""}>Yes</option>
          <option value="No" ${r.baseValue === "No" ? "selected" : ""}>No</option>
        </select>`;
    } else if (showOverrideControl) {
      overrideCell = `<input type="text" class="mga-override-input" data-rule-id="${ruleId}" value="${baseValDisplay}" oninput="validateMgaOverrideInput(this)">`;
    } else {
      overrideCell = `<span class="mga-override-readonly">${baseValDisplay}</span>`;
    }

    let statusBadge;
    if (r.manualPassOverride) {
      statusBadge = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge badge-warning">
            <i class="ph ph-shield-check"></i> OVERRIDDEN
          </span>
          ${canOverridePermission ? `
            <button class="btn btn-xs btn-outline-secondary p-0 px-1" onclick="toggleAppetiteRuleOverride('${ruleId}')" title="Remove Override" style="font-size:10px;">
              <i class="ph ph-x"></i>
            </button>` : ''}
        </div>`;
    } else if (!r.pass && canOverridePermission) {
      statusBadge = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge badge-danger">
            <i class="ph ph-x"></i> FAIL
          </span>
          <button class="btn btn-xs btn-outline-warning" onclick="toggleAppetiteRuleOverride('${ruleId}')" style="font-size:10px; padding:2px 6px;">
            <i class="ph ph-shield-check"></i> Override
          </button>
        </div>`;
    } else {
      statusBadge = `
        <span class="badge ${r.pass ? 'badge-success' : 'badge-danger'}">
          <i class="ph ${r.pass ? 'ph-check' : 'ph-x'}"></i> ${r.pass ? 'PASS' : 'FAIL'}
        </span>`;
    }
    if (comparisonText && !r.manualPassOverride) {
      statusBadge += `<div class="appetite-comparison-line">${comparisonText} → <strong class="${r.pass ? 'text-success' : 'text-danger'}">${r.pass ? 'PASS' : 'FAIL'}</strong></div>`;
    }

    return `
    <tr>
      <td>
        ${ruleId ? `<span class="badge badge-light font-mono" style="font-size:9.5px;">${ruleId}</span><br>` : ''}
        <strong>${factor}</strong>
        ${r.category ? `<div class="text-xs text-muted">${r.category}</div>` : ''}
      </td>
      <td class="font-mono">${r.val}</td>
      <td>
        <div class="mga-override-cell">
          ${overrideCell}
          <span class="mga-guardrail-note">Guardrail: ${guardrailText}</span>
          <span class="mga-exceed-msg u-hidden"></span>
        </div>
      </td>
      <td>
        ${statusBadge}
      </td>
    </tr>`;
  }).join("");

  // Initial validation pass so a base value that already exceeds its
  // guardrail is flagged red immediately on render, not just on edit.
  table.querySelectorAll(".mga-override-input").forEach(el => validateMgaOverrideInput(el));

  // Update appetite status badge on Screen 3 header
  const statusBadgeHeader = document.getElementById("appetiteStatusBadge");
  if (statusBadgeHeader) {
    const hasFailures = rules.some(r => !r.pass && !r.manualPassOverride);
    const hasOverrides = rules.some(r => r.manualPassOverride || r.overridden);
    if (hasFailures) {
      statusBadgeHeader.className = "badge badge-danger";
      statusBadgeHeader.innerHTML = `<i class="ph ph-warning"></i> Appetite Knockout Triggered`;
    } else if (hasOverrides) {
      statusBadgeHeader.className = "badge badge-warning";
      statusBadgeHeader.innerHTML = `<i class="ph ph-shield-check"></i> Overridden by Underwriter`;
    } else {
      statusBadgeHeader.className = "badge badge-success";
      statusBadgeHeader.innerHTML = `<i class="ph ph-check"></i> All Appetite Rules Met`;
    }
  }
}

/**
 * Validates an MGA-editable appetite rule override value against its
 * carrier guardrail (parsed from the rule's guardrail string, e.g. "<= 150"
 * or ">= 2") and toggles red styling + an inline "Exceeds guardrail"
 * message when the entered value violates it. Guardrails that aren't a
 * simple numeric comparison (e.g. jurisdiction allowlists) are
 * informational only and are never flagged red.
 */
function validateMgaOverrideInput(inputEl) {
  const canOverridePermission = hasPermission("appetiteRules", "override");
  if (!canOverridePermission) {
    denyPermission("appetiteRules", "override");
    return;
  }

  const ruleId = inputEl.dataset.ruleId;
  const rule = currentAppetiteRulesById[ruleId];
  const cell = inputEl.closest(".mga-override-cell");
  const msgEl = cell ? cell.querySelector(".mga-exceed-msg") : null;
  if (!rule) return;

  // Track the original Base Value once, so re-running this on every render
  // (see below) doesn't falsely mark every rule "edited" just because it
  // has an editable input — only a genuine change from the original counts.
  if (rule._originalBaseValue === undefined) rule._originalBaseValue = rule.baseValue;
  rule.baseValue = inputEl.value;
  rule.overridden = String(inputEl.value) !== String(rule._originalBaseValue);

  // Live comparison: Submission Value vs the (possibly just-edited) MGA
  // Base Value, using the rule's own operator — never a hardcoded pass.
  // This is the single source of truth for pass/fail (same function that
  // computes the PASS/FAIL badge). A second, independently regex-parsed
  // "guardrail violated" check used to live here too — it read the raw
  // guardrail *text* and the input's raw digits separately, which could
  // disagree with this real evaluation (e.g. for a rule whose base value
  // isn't set, the input falls back to showing the submission's own
  // descriptive text, and stripping non-digits out of a string like
  // "Fleet Age: 3 Yrs (2023 Model)" mashes "3" and "2023" together into a
  // huge bogus number — always "exceeding" any real guardrail). Removed;
  // "violated" now just mirrors the real pass/fail.
  if (!rule.manualPassOverride) rule.pass = evaluateAppetiteRule(rule);
  const violated = !rule.manualPassOverride && !rule.pass;

  inputEl.classList.toggle("mga-exceeded", violated);
  if (msgEl) {
    msgEl.style.display = violated ? "inline-flex" : "none";
    if (violated) msgEl.innerHTML = `<i class="ph ph-warning-circle"></i> Not in guardrail limits`;
  }
}

/**
 * Validates underwriter base rate override for a vehicle in the 3-unit Vehicles schedule.
 * Permission-gated using the exact same override permission check as Appetite Rules.
 */
function validateVehicleBaseRateOverride(inputEl, subId) {
  const canOverride = hasPermission("appetiteRules", "override");
  if (!canOverride) {
    denyPermission("appetiteRules", "override");
    return;
  }

  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId) || SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub || !sub.vehicles) return;

  const vehicleId = Number(inputEl.dataset.vehicleId);
  const vehicle = sub.vehicles.find(v => (v.id === vehicleId || v.xid === vehicleId));
  const cell = inputEl.closest(".mga-override-cell");
  const msgEl = cell ? cell.querySelector(".mga-exceed-msg") : null;
  if (!vehicle) return;

  const enteredRate = parseFloat(inputEl.value);
  let violated = false;
  if (!isNaN(enteredRate)) {
    if (enteredRate < 500 || enteredRate > 1200) {
      violated = true;
    }
    vehicle.liab_baserate = enteredRate;
    vehicle.overridden = true;

    // Recalculate item premium for this vehicle
    const ilf = Number(vehicle.liab_ilf_factor || 2.06);
    const lcm = Number(vehicle.liab_lcm_factor || 1.67);
    const fleet = Number(vehicle.liab_fleet_factor || 0.97);
    const age = Number(vehicle.vehicle_age_factor || 1.12);
    const radius = Number(vehicle.radius_factor || 0.95);
    const naics = Number(vehicle.naics_factor || 1.1);

    const calculatedPrem = Math.round(enteredRate * ilf * lcm * fleet * age * radius * naics * 100) / 100;
    const formattedPrem = "$" + calculatedPrem.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    vehicle.liability_premium = formattedPrem;
    vehicle.al_premium_wo_mod_factor = formattedPrem;

    // Update item premium cell in table row
    const row = inputEl.closest("tr");
    if (row) {
      const premEl = row.querySelector(".vehicle-item-premium");
      if (premEl) {
        premEl.innerHTML = `<strong style="color: #15803d; font-size: 13px;">${formattedPrem}</strong> <span class="badge badge-warning text-xs ml-1"><i class="ph ph-shield-check"></i> UW Override</span>`;
      }
    }
  }

  inputEl.classList.toggle("mga-exceeded", violated);
  if (msgEl) {
    msgEl.style.display = violated ? "inline-flex" : "none";
    if (violated) msgEl.innerHTML = `<i class="ph ph-warning-circle"></i> Not in guardrail limits ($500 - $1,200)`;
  }
}

// Helper: Enrichment Cards (Screen 4)
function renderEnrichmentCards(cards) {
  const grid = document.getElementById("enrichmentCardsGrid");
  if (!grid || !cards) return;
  grid.innerHTML = cards.map(c => `
    <div class="enrich-card">
      <div class="enrich-card-header">
        <span class="title"><i class="ph ${c.icon} text-primary"></i> ${c.title}</span>
        <span class="badge ${c.tag || 'badge-success'}"><i class="ph ph-check-circle"></i> Verified</span>
      </div>
      <div class="enrich-stat-num">${c.val}</div>
      <div class="enrich-stat-lbl">${c.label}</div>
    </div>
  `).join("");
}


// Helper: Document Tab in Screen 5
function switchDocTab(tabKey) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) return;

  const tAcord = document.getElementById("tabDocAcord");
  const tSov = document.getElementById("tabDocSov");
  const tLoss = document.getElementById("tabDocLoss");

  if (tAcord) tAcord.classList.remove("active");
  if (tSov) tSov.classList.remove("active");
  if (tLoss) tLoss.classList.remove("active");

  const panel = document.getElementById("docPreviewPanel");
  if (!panel) return;

  if (tabKey === "acord") {
    if (tAcord) tAcord.classList.add("active");
    panel.innerHTML = `
      <div class="acord-form-mock">
        <div class="acord-top-bar">
          <span class="acord-title">ACORD APPLICATION FORM • ${sub.docs[0]?.name || 'Application.pdf'}</span>
          <span class="badge badge-primary">Standard ISO Form</span>
        </div>
        <div class="form-grid">
          <div><strong>Named Insured:</strong> ${sub.insured}</div>
          <div><strong>FEIN:</strong> ${sub.fein}</div>
          <div><strong>Mailing Address:</strong> ${sub.address}</div>
          <div><strong>Broker / Origin:</strong> ${sub.broker}</div>
          <div><strong>Line of Business:</strong> ${sub.lobName}</div>
          <div><strong>Total Exposure:</strong> ${sub.exposure}</div>
        </div>
      </div>
    `;
  } else if (tabKey === "sov") {
    if (tSov) tSov.classList.add("active");
    panel.innerHTML = `
      <div class="acord-form-mock">
        <div class="acord-top-bar">
          <span class="acord-title">STATEMENT OF VALUES (SOV) • ${sub.docs[1]?.name || 'SOV_Schedule.xlsx'}</span>
          <span class="badge badge-success">Schedule Normalized</span>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Schedule Item #</th>
              <th>Asset Description</th>
              <th>Territory / Location</th>
              <th>Stated Value / Exposure</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>001</td>
              <td>Primary Asset Group A</td>
              <td>Texas Operations Hub</td>
              <td>${sub.exposure}</td>
            </tr>
            <tr>
              <td>002</td>
              <td>Secondary Scheduled Assets</td>
              <td>Regional Garaging / Office</td>
              <td>Verified & Cleared</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  } else if (tabKey === "loss") {
    if (tLoss) tLoss.classList.add("active");
    panel.innerHTML = `
      <div class="acord-form-mock">
        <div class="acord-top-bar">
          <span class="acord-title">CARRIER SIGNED LOSS RUN REPORT • 3-Year History</span>
          <span class="badge badge-success">Official Audit Verified</span>
        </div>
        <p class="text-secondary text-sm">Official valuation date: 2026-08-01. Verified with prior underwriting carriers.</p>
      </div>
    `;
  }
}

// Helper: Loss Runs Table in Screen 5
function renderLossTable(losses) {
  const table = document.getElementById("wbLossTable");
  if (!table || !losses) return;
  table.innerHTML = losses.map(l => `
    <tr>
      <td><strong>${l.year}</strong></td>
      <td>${l.desc}</td>
      <td><span class="badge ${l.status === 'Clean' ? 'badge-success' : 'badge-info'}">${l.status}</span></td>
      <td class="font-mono font-bold">${l.incurred}</td>
    </tr>
  `).join("");
}

// Helper: Subjectivities in Screen 5
function renderSubjectivities(subjs) {
  const list = document.getElementById("subjectivityList");
  if (!list || !subjs) return;
  list.innerHTML = subjs.map((s, idx) => `
    <div class="subj-item">
      <input type="checkbox" id="subj_${idx}" checked>
      <label class="subj-text" for="subj_${idx}">${s}</label>
      <span class="badge badge-warning">Pre-Bind Condition</span>
    </div>
  `).join("");
}

/**
 * Underwriter-editable Minimum Driver Age guardrail (Drivers Schedule &
 * Verification Status, Screen 5). Changing it re-checks every driver's
 * eligibility live — driver age always comes from the submission's own
 * JSON (d.age), never a hardcoded result.
 */
function updateDriverAgeGuardrail(inputEl) {
  if (!hasPermission("appetiteRules", "override")) {
    denyPermission("appetiteRules", "override");
    return;
  }

  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub) return;

  const newGuardrail = parseFloat(inputEl.value);
  if (isNaN(newGuardrail) || newGuardrail < 0) {
    showToast("Enter a valid Minimum Driver Age guardrail.", "danger");
    inputEl.value = sub.driverAgeGuardrail;
    return;
  }

  sub.driverAgeGuardrail = newGuardrail;

  // Keep the Step 7 Appetite Rules table's per-driver Minimum Driver Age
  // rows (if the ingested product defines any) in sync with the same
  // guardrail, so both screens always agree.
  (sub.appetiteRules || []).forEach(r => {
    const f = (r.factor || "").toLowerCase();
    if (f.indexOf("driver age") !== -1 && r.baseValue !== undefined && r.baseValue !== null) {
      r.baseValue = newGuardrail;
      r.guardrail = `>= ${newGuardrail} Years`;
      const ageNum = parseRuleNumber(r.val);
      r.pass = ageNum !== null ? ageNum >= newGuardrail : r.pass;
      r.manualPassOverride = false;
    }
  });

  renderUnderwritingWorkbench(sub);
  if (typeof renderAppetiteRules === "function" && sub.appetiteRules) renderAppetiteRules(sub.appetiteRules);
  if (typeof persistAppState === "function") persistAppState();

  showToast(`Minimum Driver Age guardrail updated to ${newGuardrail} — all drivers re-checked.`, "success");
}
window.updateDriverAgeGuardrail = updateDriverAgeGuardrail;

/**
 * Dynamic Underwriting Workbench Data Renderer (Screen 5)
 * Displays account info, coverages, limits, operational factors, vehicles schedule, and driver schedule.
 */
function renderUnderwritingWorkbench(sub) {
  if (!sub) return;

  const docsContainer = document.getElementById("wbAttachedDocsContainer");
  const coveragesContainer = document.getElementById("wbCoveragesGridContainer");
  const vehiclesContainer = document.getElementById("wbVehiclesScheduleContainer");
  const driversContainer = document.getElementById("wbDriversScheduleContainer");

  // No hardcoded fallback data anywhere below: if a field was not provided
  // by the ingested submission JSON, it renders as "Not Provided" (or the
  // relevant list renders an empty state) instead of a fabricated value.
  const NP = '<span class="text-muted" style="font-style:italic;">Not Provided</span>';
  const wbFmt = (val, formatter) => (val === undefined || val === null || val === "") ? NP : (formatter ? formatter(val) : val);
  const wbFmtCurrency = (val) => wbFmt(val, v => `$${Number(v).toLocaleString()}`);

  const cov = sub.coveragesInfo || {};
  const fil = sub.filingInfo || {};
  const rad = sub.radiusOfOperationsInfo || {};
  const uwRev = sub.uwReviewInfo || {};

  const vehicles = sub.vehicles || [];
  const drivers = sub.drivers || [];

  // 1.5. Attached Underwriting Documents Panel
  if (docsContainer) {
    const docsList = sub.docs || [];

    docsContainer.innerHTML = `
      <div class="card p-3 u-card-plain">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <h3 style="font-size: 14.5px; font-weight: 800; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px;">
            <i class="ph ph-folder-open text-primary"></i> Attached Underwriting Documents (${docsList.length} Uploaded Files)
          </h3>
          ${docsList.length ? `
          <button class="btn btn-xs btn-primary u-fw-700" style="margin-top: 8px;" onclick="openDocsManagerModal('${sub.id}')">
            <i class="ph ph-tree-structure"></i> View All Documents (${docsList.length})
          </button>` : ''}
        </div>
        ${docsList.length ? `
        <div class="doc-card-grid">
          ${docsList.map((d, docIdx) => `
            <div class="doc-card" onclick="previewDocForSubmission('${sub.id}', ${docIdx})">
              <div class="doc-card-icon ${d.type === 'pdf' ? 'pdf' : 'xls'}">
                <i class="ph ${d.type === 'pdf' ? 'ph-file-pdf' : 'ph-file-xls'}"></i>
              </div>
              <div class="doc-card-body">
                <div class="doc-card-name" title="${d.name}">${d.name}</div>
                <div class="doc-card-desc">${d.desc || 'Uploaded Underwriting Document'}</div>
              </div>
              <button class="btn btn-xs btn-outline-primary doc-card-btn" onclick="event.stopPropagation(); previewDocForSubmission('${sub.id}', ${docIdx})">
                <i class="ph ph-eye"></i> View Doc
              </button>
            </div>
          `).join('')}
        </div>` : `<div class="text-xs text-muted" style="padding:10px 0;"><i class="ph ph-folder-simple-dashed"></i> No documents were provided with this submission.</div>`}
      </div>
    `;
  }
  // 1.8. Intake Questionnaire & Risk Assessment Responses Panel
  const questContainer = document.getElementById("wbQuestionnaireContainer");
  if (questContainer) {
    // If a product JSON was ingested via Integrating API with real
    // questionnaire/riskAttributes data, sub.questionnaireGroups is built
    // from THAT (see mapQuestionnaireFromProduct in golden-path-data.js) —
    // every question it defines is shown, none added, none removed. Falls
    // back to this static template only when no ingested questionnaire
    // data exists at all.
    const groups = sub.questionnaireGroups || [
      { title: "Vehicle Usage & Route Operations", icon: "ph-map-trifold", theme: "blue", items: [
        { q: "Garaging & Operating Radius", a: rad.radius ? `Interstate Regional Hauling (${rad.radius} Miles Radius)` : null },
        { q: "Cargo Type & Hazmat Exposure", a: sub.commoditiesInfo ? (sub.commoditiesInfo.secondary_class || null) : null },
        { q: "Facility Security & Overnight Parking", a: null }
      ]},
      { title: "Driver Pool & Safety Protocols", icon: "ph-identification-badge", theme: "indigo", items: [
        { q: "Min CDL Driving Experience", a: drivers.length ? `${drivers.map(d => d.experience).filter(Boolean).join(", ") || null}` : null },
        { q: "Pre-Employment Drug & Alcohol Testing", a: null },
        { q: "Telematics & Speed Monitoring", a: null }
      ]},
      { title: "Anti-Theft & Loss Prevention", icon: "ph-lock-key", theme: "amber", items: [
        { q: "Anti-Theft GPS Immobilizers", a: null },
        { q: "Prior 3-Year Claims Logged", a: sub.losses ? `${sub.losses.filter(l => l.status !== "Clean").length} Closed Claims ($${sub.losses.reduce((s, l) => s + (parseFloat(String(l.incurred || "0").replace(/[^0-9.]/g, "")) || 0), 0).toLocaleString()} Total Incurred)` : null }
      ]}
    ];
    const answeredCount = groups.reduce((n, g) => n + g.items.filter(i => i.a).length, 0);
    const totalCount = groups.reduce((n, g) => n + g.items.length, 0);
    const pct = totalCount ? Math.round((answeredCount / totalCount) * 100) : 0;

    questContainer.innerHTML = `
      <div class="card p-3 u-card-plain iq-card">
        <div class="iq-header">
          <h3 class="iq-title"><i class="ph ph-question text-primary"></i> Intake Questionnaire & Risk Assessment Responses</h3>
          <div class="iq-progress-wrap">
            <div class="iq-progress-track"><div class="iq-progress-fill" style="width:${pct}%;"></div></div>
            <span class="iq-progress-label">${answeredCount} of ${totalCount} Answered</span>
          </div>
        </div>
        <div class="iq-groups-grid">
          ${groups.map((g, gIdx) => {
            const answeredItems = g.items.filter(i => i.a);
            if (!answeredItems.length) return ''; // nothing provided for this group — hide it entirely
            const themeCycle = ["blue", "indigo", "amber"];
            const theme = g.theme || themeCycle[gIdx % themeCycle.length];
            const icon = g.icon || "ph-list-checks";
            return `
            <div class="iq-group-card theme-${theme}">
              <div class="iq-group-header">
                <div class="iq-group-header-left">
                  <span class="iq-group-icon"><i class="ph ${icon}"></i></span>
                  <span class="iq-group-title">${g.title}</span>
                </div>
                <span class="iq-group-badge complete">${answeredItems.length}/${answeredItems.length}</span>
              </div>
              ${answeredItems.map(i => `
                <div class="iq-item-row answered">
                  <i class="ph ph-check-circle"></i>
                  <div class="iq-item-text">
                    <span class="iq-item-q">${i.q}</span>
                    <span class="iq-item-a">${i.a}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `;}).join('') || `<div class="text-xs text-muted" style="padding:10px 0;"><i class="ph ph-circle-dashed"></i> No questionnaire or risk assessment data has been provided for this submission.</div>`}
        </div>
      </div>
    `;
  }

  // 2. Coverages & Operational Profile — "Instrument Panel" redesign (unique
  // dark readout-tile style, distinct from every other card style in the app)
  //
  // Two distinct data sources, never blurred together:
  //  - The customer's OWN coverage selections/operational answers (cov/rad/
  //    fil/uwRev below) come only from the ingested submission (Email /
  //    Submission JSON) — exactly what they actually told us.
  //  - When the submission hasn't provided a given value yet, these panels
  //    fall back to the ingested PRODUCT's own configuration (what
  //    coverages/limits it offers, its discretionary pricing rules) —
  //    labeled as the product's definition, never presented as if it were
  //    the customer's answer.
  const activeProductForWorkbench = window.ACTIVE_INSURANCE_PRODUCT || (typeof ACTIVE_INSURANCE_PRODUCT !== "undefined" ? ACTIVE_INSURANCE_PRODUCT : null);
  const hasSubCoverageData = Object.keys(cov).length > 0;
  const productDeclaredCovers = activeProductForWorkbench
    ? ((activeProductForWorkbench.studios && activeProductForWorkbench.studios.coverage) || activeProductForWorkbench.coverages || activeProductForWorkbench.coverage || [])
    : [];
  // Only ever the product's OWN declared coverage list — buildProductCoverageRows()
  // falls back to generic hardcoded rows when a product declares none, which
  // would be fabricated data here, so that path is deliberately never used.
  const productCoverageRows = (!hasSubCoverageData && productDeclaredCovers.length > 0 && typeof buildProductCoverageRows === "function")
    ? buildProductCoverageRows(activeProductForWorkbench, sub.exposureVal || 0, 0)
    : null;
  const hasSubRatingData = Object.keys(fil).length > 0 || Object.keys(uwRev).length > 0
    || Object.keys(sub.operationsProfile || {}).length > 0
    || Object.keys(sub.commoditiesInfo || {}).length > 0
    || vehicles.length > 0 || drivers.length > 0 || (sub.losses || []).length > 0;
  const productPricing = (activeProductForWorkbench && activeProductForWorkbench.pricing) || null;

  if (coveragesContainer) {
    const covTiles = [
      { label: "Auto Liability Limit (CSL)", value: cov.liability !== undefined ? `$${Number(cov.liability).toLocaleString()}` : null, caption: "Combined Single Limit", wide: true },
      { label: "PD Deductible", value: cov.pd_deductible_amount !== undefined ? `$${Number(cov.pd_deductible_amount).toLocaleString()}` : null, caption: cov.pd_high_deductible !== undefined ? `High Ded: $${Number(cov.pd_high_deductible).toLocaleString()}` : "" },
      { label: "Cargo Limit", value: cov.cargo_limit !== undefined ? `$${Number(cov.cargo_limit).toLocaleString()}` : null, caption: "Motor Truck Cargo" },
      { label: "Towing & Storage", value: cov.towing !== undefined ? `$${Number(cov.towing).toLocaleString()}` : null, caption: "Per Occurrence Limit" },
      { label: "NAICS / Rating Class", value: cov.naics_code !== undefined ? `${cov.naics_code}` : null, caption: cov.rating_class !== undefined ? `Rating Class ${cov.rating_class}` : "" }
    ];
    // Driver Violations: only summed from drivers that actually carry a
    // violations count on the ingested submission — never assumed 0 when
    // we simply don't know.
    const driversWithViolationData = drivers.filter(d => d.violations !== undefined);
    const totalDriverViolations = driversWithViolationData.reduce((s, d) => s + (Number(d.violations) || 0), 0);
    const uniqueVehicleTypes = [...new Set(vehicles.map(v => v.vehicle_type).filter(Boolean))];
    const opsForTiles = sub.operationsProfile || {};
    const commodities = sub.commoditiesInfo || {};

    // Every tile here that maps to a single real field is directly
    // editable by the underwriter (per explicit request) — `field` is the
    // dot-path written back onto `sub`, `raw` is that field's current
    // unformatted value (what shows in the input; the tile's own display
    // formatting — "mi", "%", commas — only applies to the read-only view).
    // Vehicle Type / Vehicle Count / Driver Violations / Loss History are
    // aggregated from the Vehicles/Drivers/Loss Runs tables elsewhere on
    // this page, not a standalone value, so they stay read-only here.
    const opTiles = [
      { label: "Operating Radius", value: rad.radius !== undefined ? `${rad.radius} mi` : null, caption: rad.Intrastate_interstate || "", field: "radiusOfOperationsInfo.radius", raw: rad.radius },
      { label: "SAFER Safety Factor", value: fil.safer_factor !== undefined ? `${fil.safer_factor}` : null, caption: fil.FMCSA_alert !== undefined ? `${fil.FMCSA_alert} Alerts` : "", field: "filingInfo.safer_factor", raw: fil.safer_factor },
      { label: "Driver Pool", value: uwRev.og_driver_count !== undefined ? `${uwRev.og_driver_count}` : null, caption: uwRev.cr_driver_count !== undefined ? `${uwRev.cr_driver_count} Active Verified` : "", field: "uwReviewInfo.og_driver_count", raw: uwRev.og_driver_count },
      { label: "Pollution Risk", value: uwRev.al_pollution !== undefined ? `${uwRev.al_pollution}` : null, caption: uwRev.min_earn_factor !== undefined ? `Min Earned ${uwRev.min_earn_factor}%` : "", field: "uwReviewInfo.al_pollution", raw: uwRev.al_pollution },
      { label: "UW Discretionary Factor", value: fil.uw_credit_debit_factor ? (Number(fil.uw_credit_debit_factor) < 1 ? '-' + Math.round((1 - Number(fil.uw_credit_debit_factor)) * 100) + '%' : '+' + Math.round((Number(fil.uw_credit_debit_factor) - 1) * 100) + '%') : null, caption: fil.uw_credit_debit_factor ? (Number(fil.uw_credit_debit_factor) < 1 ? 'Discretionary Credit' : 'Debit Applied') : "", wide: true, field: "filingInfo.uw_credit_debit_factor", raw: fil.uw_credit_debit_factor },
      { label: "Vehicle Type", value: uniqueVehicleTypes.length ? uniqueVehicleTypes.join(", ") : null, readonly: true },
      { label: "Business Type", value: opsForTiles.business_type || null, field: "operationsProfile.business_type", raw: opsForTiles.business_type },
      { label: "Primary Commodity / Cargo Type", value: commodities.secondary_class || null, field: "commoditiesInfo.secondary_class", raw: commodities.secondary_class },
      { label: "Operating Territory", value: rad.Intrastate_interstate || opsForTiles.interstate_intrastate || null, field: "radiusOfOperationsInfo.Intrastate_interstate", raw: rad.Intrastate_interstate || opsForTiles.interstate_intrastate },
      { label: "Annual Mileage", value: (opsForTiles.annual_mileage !== undefined && opsForTiles.annual_mileage !== null) ? `${Number(opsForTiles.annual_mileage).toLocaleString()} mi/yr` : null, field: "operationsProfile.annual_mileage", raw: opsForTiles.annual_mileage },
      { label: "Vehicle Count", value: vehicles.length || null, readonly: true },
      { label: "Driver Violations", value: driversWithViolationData.length ? `${totalDriverViolations}` : null, readonly: true },
      { label: "Loss History", value: (sub.losses && sub.losses.length) ? `${sub.losses.length} Claim${sub.losses.length === 1 ? '' : 's'}` : null, caption: (sub.losses && sub.losses.length) ? `$${sub.losses.reduce((s, l) => s + (parseFloat(String(l.incurred || "0").replace(/[^0-9.]/g, "")) || 0), 0).toLocaleString()} Total Incurred` : "", readonly: true }
    ];

    const renderIpTile = (t) => `
      <div class="ip-tile ${t.wide ? 'wide' : ''}">
        <div class="ip-tile-label">${t.label}</div>
        <div class="ip-tile-value">${t.value !== null && t.value !== undefined ? t.value : '<span class="ip-tile-empty">—</span>'}</div>
        ${t.caption ? `<div class="ip-tile-caption">${t.caption}</div>` : ''}
      </div>`;

    // Editable variant — used only for the Operational Profile & Rating
    // Factors panel (opTiles), never Coverages or the product-fallback
    // tiles. Shows the raw stored value in the input (not the formatted
    // display string), same generic writer as Policy Information above.
    const renderIpTileEditable = (t) => t.readonly ? renderIpTile(t) : `
      <div class="ip-tile ${t.wide ? 'wide' : ''}">
        <div class="ip-tile-label">${t.label}</div>
        <input type="text" class="ip-tile-input" placeholder="Not Provided" value="${t.raw !== undefined && t.raw !== null ? String(t.raw).replace(/"/g, '&quot;') : ''}" onchange="updateWorkbenchNestedField('${sub.id}', '${t.field}', this.value)">
        ${t.caption ? `<div class="ip-tile-caption">${t.caption}</div>` : ''}
      </div>`;

    // Left panel body: the customer's own coverage selections if the
    // submission provided any; otherwise the ingested product's own
    // coverage schedule (clearly labeled as the product's, not a customer
    // answer), so the panel isn't just empty tiles when nothing has been
    // captured yet.
    const coveragesLeftBody = hasSubCoverageData
      ? `<div class="ip-grid">${covTiles.map(renderIpTile).join('')}</div>`
      : (productCoverageRows
        ? `<table class="ip-coverage-table"><thead><tr><th>Coverage Line</th><th>Limit</th><th>Deductible</th><th>Availability</th></tr></thead><tbody>
            ${productCoverageRows.map(r => `<tr><td>${r.line}</td><td class="font-mono">${r.limit}</td><td class="font-mono">${r.ded}</td><td>${r.availability}</td></tr>`).join('')}
          </tbody></table>`
        : `<div class="ip-grid">${covTiles.map(renderIpTile).join('')}</div>`);
    const coveragesLeftBadge = hasSubCoverageData
      ? wbFmt(cov.rating_type)
      : (productCoverageRows ? `<span title="From the ingested product's own coverage schedule — not yet the customer's selection">Product Schedule</span>` : wbFmt(cov.rating_type));

    // Right panel body: the customer's own operational answers if provided;
    // otherwise the ingested product's discretionary pricing configuration
    // (max credit/debit, tax rate) — product-level rating configuration,
    // never a fabricated customer-specific factor.
    const productPricingTiles = productPricing ? [
      { label: "Max Discretionary Credit", value: productPricing.maxCreditPct !== undefined ? `${productPricing.maxCreditPct}%` : null, caption: "Product Rating Configuration" },
      { label: "Max Discretionary Debit", value: productPricing.maxDebitPct !== undefined ? `${productPricing.maxDebitPct}%` : null, caption: "Product Rating Configuration" },
      { label: "Tax Rate", value: productPricing.taxRatePct !== undefined ? `${productPricing.taxRatePct}%` : null, caption: "Product Rating Configuration", wide: true }
    ] : [];
    const opRightBody = hasSubRatingData
      ? `<div class="ip-grid">${opTiles.map(renderIpTileEditable).join('')}</div>`
      : (productPricingTiles.length
        ? `<div class="ip-grid">${productPricingTiles.map(renderIpTile).join('')}</div>`
        : `<div class="ip-grid">${opTiles.map(renderIpTileEditable).join('')}</div>`);
    // "UW Tag" — the assigned underwriter's name (set on Screen 4's manual
    // assignment dropdown, sub.underwriter). Falls back to the discretionary
    // rating factor / product config badge only when no underwriter has
    // actually been assigned yet — never a fabricated name.
    const opRightBadge = sub.underwriter
      ? `<i class="ph ph-user-circle"></i> ${sub.underwriter}`
      : (hasSubRatingData
        ? `UW ${wbFmt(fil.uw_credit_debit_factor)}`
        : (productPricingTiles.length ? `<span title="From the ingested product's own rating configuration">Product Config</span>` : `UW ${wbFmt(fil.uw_credit_debit_factor)}`));

    coveragesContainer.innerHTML = `
      <div class="two-col-grid">
        <!-- Left: Coverages & Limits (instrument panel) -->
        <div class="ip-card">
          <div class="ip-header">
            <span class="ip-title"><i class="ph ph-shield-check"></i> Coverages, Limits & Deductibles</span>
            <span class="ip-badge">${coveragesLeftBadge}</span>
          </div>
          ${coveragesLeftBody}
        </div>

        <!-- Right: Operational Profile & Rating Factors (instrument panel) -->
        <div class="ip-card">
          <div class="ip-header">
            <span class="ip-title"><i class="ph ph-sliders"></i> Operational Profile & Rating Factors</span>
            <span class="ip-badge">${opRightBadge}</span>
          </div>
          ${opRightBody}
        </div>
      </div>
    `;
  }

  // 3. Vehicles Schedule Table
  if (vehiclesContainer) {
    const canOverrideBaseRate = hasPermission("appetiteRules", "override");

    vehiclesContainer.innerHTML = `
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">
        <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 0;">
          <i class="ph ph-truck text-primary"></i> Vehicles Risk & Stated Value Schedule (${vehicles.length} Vehicle Unit${vehicles.length === 1 ? '' : 's'})
        </h3>
        ${vehicles.length ? `
        <div style="display: flex; align-items: center; gap: 8px;">
          <button type="button" class="btn btn-xs btn-outline" onclick="toggleTableDetailView('vehiclesScheduleTable', this)"><i class="ph ph-columns"></i> Simplify View</button>
          <span class="badge ${canOverrideBaseRate ? 'badge-warning' : 'badge-success'}" style="font-size: 11px;">
            <i class="ph ${canOverrideBaseRate ? 'ph-shield-check' : 'ph-lock'}"></i>
            ${canOverrideBaseRate ? 'UW Base Rate Overrides Enabled' : 'Base Rate Rating Factors Locked'}
          </span>
        </div>` : ''}
      </div>
      <div class="card-body p-0">
        ${vehicles.length ? `
        <div class="table-responsive">
          <table class="data-table wb-detail-table" id="vehiclesScheduleTable">
            <thead>
              <tr>
                <th>Unit #</th>
                <th>Year & Description</th>
                <th>Model No. & Driver</th>
                <th>Operating Radius</th>
                <th>Stated Value</th>
                <th class="wb-detail-col">AL Value</th>
                <th class="wb-detail-col">Class</th>
                <th class="wb-detail-col">Actuarial Rating Factors</th>
                <th class="wb-detail-col">Base Rate & Validation</th>
                <th>Item Premium</th>
              </tr>
            </thead>
            <tbody>
              ${vehicles.map(v => {
                const baseVal = v.liab_baserate;
                let baseRateCell;
                if (baseVal === undefined) {
                  baseRateCell = `<div class="mga-override-cell"><span class="mga-override-readonly">${NP}</span></div>`;
                } else if (canOverrideBaseRate) {
                  baseRateCell = `
                    <div class="mga-override-cell">
                      <input type="number" class="mga-override-input vehicle-baserate-input" data-vehicle-id="${v.id}" value="${baseVal}" step="1" oninput="validateVehicleBaseRateOverride(this, '${sub.id}')">
                      <span class="mga-guardrail-note">Guardrail: $500 – $1,200</span>
                      <span class="mga-exceed-msg u-hidden"></span>
                    </div>`;
                } else {
                  baseRateCell = `
                    <div class="mga-override-cell">
                      <span class="mga-override-readonly">$${baseVal}</span>
                      <span class="mga-guardrail-note">Guardrail: $500 – $1,200</span>
                    </div>`;
                }

                const driverName = v.assigned_driver || NP;
                const modelNo = v.model_number || NP;
                const radiusVal = v.miles_driven || v.radius_miles || rad.radius;

                return `
                <tr>
                  <td><span class="badge badge-light font-mono">#${v.xid || v.id}</span></td>
                  <td>
                    <strong style="color: #0f172a;">${v.year || NP} ${v.make || ''} ${v.model || ''}</strong>
                    <div class="text-xs text-muted">${v.weight || NP} • ${v.ownership || NP}</div>
                    ${v.enrichmentApplied ? `
                      <div class="text-xs font-mono mt-1" title="VIN"><i class="ph ph-identification-card text-primary"></i> ${v.vin || NP}</div>
                      <div class="text-xs mt-1">
                        <span class="badge badge-success" style="font-size:10px;"><i class="ph ph-check-circle"></i> Verified: NHTSA / FMCSA / DMV</span>
                      </div>
                      <div class="text-xs mt-1">
                        ${v.fmcsaOOS !== undefined ? `<span class="badge ${v.fmcsaOOS ? 'badge-danger' : 'badge-success'}" style="font-size:10px;"><i class="ph ph-shield-warning"></i> FMCSA OOS: ${v.fmcsaOOS ? 'Yes' : 'No'}</span>` : ''}
                        ${v.registrationStatus ? `<span class="badge ${v.registrationStatus === 'Active' ? 'badge-success' : 'badge-warning'}" style="font-size:10px;"><i class="ph ph-file-text"></i> DMV: ${v.registrationStatus}</span>` : ''}
                      </div>
                    ` : (v.vin ? `<div class="text-xs font-mono mt-1" title="VIN"><i class="ph ph-identification-card text-muted"></i> ${v.vin}</div>` : '')}
                  </td>
                  <td>
                    <div class="font-mono text-xs font-bold" style="color: #2563eb;"><i class="ph ph-hash"></i> ${modelNo}</div>
                    <div class="text-xs text-secondary mt-1" style="display: flex; align-items: center; gap: 4px;">
                      <i class="ph ph-user text-primary"></i> <strong>${driverName}</strong>
                    </div>
                    ${(v.bodyClass || v.vehicle_type) ? `<div class="text-xs text-muted mt-1"><i class="ph ph-truck"></i> ${v.bodyClass || v.vehicle_type}</div>` : ''}
                  </td>
                  <td>
                    ${radiusVal !== undefined ? `<span class="badge badge-info" style="font-weight: 700; font-size: 11px;"><i class="ph ph-navigation-arrow"></i> ${radiusVal} Miles Radius</span>` : NP}
                  </td>
                  <td class="font-mono font-bold">${wbFmtCurrency(v.stated_value)}</td>
                  <td class="font-mono text-primary wb-detail-col">${wbFmtCurrency(v.al_value)}</td>
                  <td class="wb-detail-col">${v.rating_class !== undefined ? `<span class="badge badge-info">Class ${v.rating_class}</span>` : NP}</td>
                  <td style="font-size: 11px;" class="font-mono wb-detail-col">
                    ${(v.liab_ilf_factor !== undefined || v.liab_lcm_factor !== undefined) ? `ILF: ${v.liab_ilf_factor !== undefined ? v.liab_ilf_factor : '—'} | LCM: ${v.liab_lcm_factor !== undefined ? v.liab_lcm_factor : '—'}<br>` : ''}
                    ${(v.liab_fleet_factor !== undefined || v.vehicle_age_factor !== undefined || v.radius_factor !== undefined) ? `Fleet: ${v.liab_fleet_factor !== undefined ? v.liab_fleet_factor : '—'} | Age: ${v.vehicle_age_factor !== undefined ? v.vehicle_age_factor : '—'} | Radius: ${radiusVal !== undefined ? radiusVal + ' Miles' : '—'} (${v.radius_factor !== undefined ? v.radius_factor : '—'})` : (v.liab_ilf_factor === undefined ? NP : '')}
                  </td>
                  <td class="wb-detail-col">${baseRateCell}</td>
                  <td class="font-mono vehicle-item-premium">
                    <strong style="color: #15803d; font-size: 13px;">${v.liability_premium || v.al_premium_wo_mod_factor || NP}</strong>
                    ${v.overridden ? `<span class="badge badge-warning text-xs ml-1"><i class="ph ph-shield-check"></i> UW Override</span>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : `<div class="text-xs text-muted" style="padding:14px 16px;"><i class="ph ph-truck"></i> No vehicles were provided with this submission.</div>`}
      </div>
    `;

    if (canOverrideBaseRate) {
      vehiclesContainer.querySelectorAll(".vehicle-baserate-input").forEach(el => validateVehicleBaseRateOverride(el, sub.id));
    }
  }

  // 4. Drivers Schedule Table
  if (driversContainer) {
    if (!drivers.length) {
      driversContainer.innerHTML = `
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">
          <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 0;">
            <i class="ph ph-identification-card text-success"></i> Drivers Schedule & Verification Status (0 Drivers)
          </h3>
        </div>
        <div class="card-body"><div class="text-xs text-muted" style="padding:14px 16px;"><i class="ph ph-identification-card"></i> No drivers were provided with this submission.</div></div>
      `;
    } else {
      // Each driver gets its own fully independent card — data, appetite
      // rule, and knockout result are never merged across drivers.
      //
      // Driver-specific guardrails are matched by the driver's own id/name
      // appearing in the rule's factor text (e.g. "Minimum Driver Age —
      // Driver 1" / "— DRV-1"), never by array position — position-based
      // matching silently pairs the wrong driver with the wrong guardrail
      // the moment the two arrays are reordered or of different lengths.
      // A guardrail rule that names no specific driver (a single
      // fleet-wide "Minimum Driver Age"/"Minimum Driver Experience" rule)
      // is shown on every driver's card instead, labeled as fleet-wide
      // rather than guessed onto one driver.
      // Minimum Driver Age eligibility is handled separately below (its own
      // editable-guardrail box, driven live off sub.driverAgeGuardrail) —
      // excluded here so it isn't rendered twice.
      const driverGuardrailRules = (sub.appetiteRules || []).filter(r => {
        const f = (r.factor || "").toLowerCase();
        return f.indexOf("driver experience") !== -1;
      });

      // Minimum Driver Age guardrail: an Underwriter-editable value that
      // drives every driver's Eligible/Ineligible status live — never a
      // hardcoded pass/fail. Initialized once from the ingested product
      // JSON's own Minimum Driver Age rule (if present), else 21.
      if (sub.driverAgeGuardrail === undefined || sub.driverAgeGuardrail === null) {
        const existingAgeRule = (sub.appetiteRules || []).find(r => {
          const f = (r.factor || "").toLowerCase();
          return f.indexOf("driver age") !== -1 && r.baseValue !== undefined && r.baseValue !== null;
        });
        sub.driverAgeGuardrail = existingAgeRule ? Number(existingAgeRule.baseValue) : 21;
      }
      const ageGuardrail = sub.driverAgeGuardrail;
      const canEditAgeGuardrail = hasPermission("appetiteRules", "override");

      function driverIdLabel(d, i) {
        return d.id !== undefined ? (String(d.id).startsWith("DRV-") ? d.id : `DRV-${d.id}`) : `DRV-${i + 1}`;
      }
      function driverDisplayName(d, i) {
        return (d.given_name || d.last_name) ? `${d.given_name || ''} ${d.last_name || ''}`.trim() : `Driver ${i + 1}`;
      }
      function ruleNamesDriver(rule, d, i) {
        const f = (rule.factor || "").toLowerCase();
        return f.indexOf(driverIdLabel(d, i).toLowerCase()) !== -1
          || f.indexOf(driverDisplayName(d, i).toLowerCase()) !== -1
          || f.indexOf(`driver ${i + 1}`) !== -1;
      }
      const namedRules = driverGuardrailRules.filter(r => drivers.some((d, i) => ruleNamesDriver(r, d, i)));
      const fleetWideRules = driverGuardrailRules.filter(r => !namedRules.includes(r));

      function rulesForDriver(d, i) {
        const named = namedRules.filter(r => ruleNamesDriver(r, d, i)).map(r => ({ rule: r, fleetWide: false }));
        return named.length ? named : fleetWideRules.map(r => ({ rule: r, fleetWide: true }));
      }

      driversContainer.innerHTML = `
        <div class="card-header" style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <h3 style="font-size: 14px; font-weight: 800; color: #0f172a; margin: 0;">
            <i class="ph ph-identification-card text-success"></i> Drivers Schedule & Verification Status (${drivers.length} Driver${drivers.length === 1 ? '' : 's'})
          </h3>
          <div style="display:flex; align-items:center; gap:6px; font-size:12px;" title="Underwriter-editable — changing this re-checks every driver's eligibility immediately.">
            <span class="text-muted" style="font-weight:700;">Minimum Driver Age / Guardrail:</span>
            ${canEditAgeGuardrail
              ? `<input type="number" min="0" step="1" value="${ageGuardrail}" class="driver-age-guardrail-input" style="width:64px; padding:3px 6px; border:1px solid var(--border-color); border-radius:4px; font-weight:700;" onchange="updateDriverAgeGuardrail(this)">`
              : `<strong>${ageGuardrail}</strong>`}
            <span class="text-muted">Years</span>
          </div>
        </div>
        <div class="card-body">
          <div class="driver-sections-grid">
            ${drivers.map((d, i) => {
              const driverRules = rulesForDriver(d, i);
              const idLabel = driverIdLabel(d, i);
              const name = driverDisplayName(d, i);
              const driverAge = d.age !== undefined && d.age !== null ? Number(d.age) : null;
              const isAgeEligible = driverAge !== null ? driverAge >= ageGuardrail : null;
              return `
              <div class="driver-section-card">
                <div class="driver-section-header">
                  <span class="driver-section-badge">${idLabel}</span>
                  <strong class="driver-section-name">${name}</strong>
                  <span class="badge badge-primary text-xs">MVR Verified</span>
                </div>
                <div class="driver-section-body">
                  <div class="driver-field-row"><span>Date of Birth</span><strong>${wbFmt(d.dob)}</strong></div>
                  <div class="driver-field-row"><span>Sex</span><strong>${wbFmt(d.sex)}</strong></div>
                  <div class="driver-field-row"><span>DL Number</span><strong class="font-mono">${wbFmt(d.licenseNumber)}</strong></div>
                  <div class="driver-field-row"><span>License State & Class</span><strong>${d.licensestate ? `${d.licensestate} • ${d.licenseclasstype || NP}` : NP}</strong></div>
                  <div class="driver-field-row"><span>CDL Experience</span><strong>${wbFmt(d.experience)}</strong></div>
                  <div class="driver-field-row"><span>Violations</span><strong>${d.violations !== undefined ? d.violations : NP}</strong></div>
                  <div class="driver-field-row"><span>Tenure</span><strong>${d.tenure !== undefined ? `${d.tenure} Years` : NP}</strong></div>
                  <div class="driver-field-row"><span>Status</span><strong>${d.status ? `<span class="badge badge-success"><i class="ph ph-check-circle"></i> ${d.status}</span>` : NP}</strong></div>
                  <div class="driver-field-row"><span>Driver Factor</span><strong class="font-mono">${wbFmt(d.driver_factor)}</strong></div>
                </div>
                <div class="driver-knockout-box ${isAgeEligible === false ? 'fail' : 'pass'}">
                  <div class="driver-knockout-title">
                    <i class="ph ${isAgeEligible === false ? 'ph-x-circle' : 'ph-check-circle'}"></i> Minimum Driver Age Eligibility
                  </div>
                  <div class="driver-knockout-detail">
                    Value: <strong>${driverAge !== null ? `${driverAge} Years` : NP}</strong> vs Guardrail: <strong>&gt;= ${ageGuardrail} Years</strong>
                  </div>
                  <div class="driver-knockout-result">
                    <span class="badge ${isAgeEligible === false ? 'badge-danger' : (isAgeEligible === true ? 'badge-success' : 'badge-light')}">
                      ${isAgeEligible === null ? 'Age Not Provided' : (isAgeEligible ? 'Eligible' : 'Ineligible')}
                    </span>
                  </div>
                </div>
                ${driverRules.map(({ rule, fleetWide }) => `
                <div class="driver-knockout-box ${rule.pass ? 'pass' : 'fail'}">
                  <div class="driver-knockout-title">
                    <i class="ph ${rule.pass ? 'ph-check-circle' : 'ph-x-circle'}"></i> ${rule.factor}${fleetWide ? ' <span class="badge badge-light text-xs">Fleet-Wide Guardrail</span>' : ''}
                  </div>
                  <div class="driver-knockout-detail">
                    Value: <strong>${rule.val}</strong> vs Guardrail: <strong>${rule.guardrail}</strong>
                  </div>
                  <div class="driver-knockout-result">
                    <span class="badge ${rule.pass ? 'badge-success' : 'badge-danger'}">${rule.pass ? 'PASS' : 'FAIL — Referral Required'}</span>
                  </div>
                </div>`).join('')}
              </div>`;
            }).join('')}
          </div>
        </div>
      `;
    }
  }

  renderWbSummaryStrip(sub);
  renderWbRiskOverviewGrid(sub);
  renderWbLossRunsUwp(sub);
  renderWbUwFactorsUwp(sub);
  if (typeof renderWbRegistryVerification === "function") renderWbRegistryVerification(sub);
}

// ============================================================================
// UWP REDESIGN — Summary Strip, Risk Overview gauge, Applicant & Policy
// card, and Underwriting Decision panel. Every value below comes from data
// already established elsewhere on the Workbench (sub.* fields, or the
// existing calculateRiskScore()/riskBand() from risk-score.js) — nothing
// new is fabricated; a value neither the product nor the customer provided
// still renders "Not Provided"/"—".
// ============================================================================
function renderWbSummaryStrip(sub) {
  const box = document.getElementById("wbSummaryStripContainer");
  if (!box) return;
  const NP = '<span class="uwp-empty-inline">—</span>';
  const val = (v) => (v === undefined || v === null || v === "") ? NP : v;
  // The named underwriter (Screen 4 manual assignment) takes priority when
  // set; falls back to the assigned role's persona name — the same
  // priority used for the UW Tag in Operational Profile & Rating Factors,
  // so this fact reads consistently everywhere on the page.
  const assignee = sub.underwriter || (sub.assignedTo ? (USER_ROLES_CONFIG[sub.assignedTo] || {}).name : null);
  const gen = sub.genInfo || {};
  const ops = sub.operationsProfile || {};
  const stateVal = (sub.insuredInfo && sub.insuredInfo.insured_garaging_state)
    || ops.primary_garaging_state
    || ((sub.drivers && sub.drivers[0]) ? sub.drivers[0].licensestate : null);

  box.innerHTML = `
    <div class="uwp-strip">
      <div class="uwp-strip-item">
        <span class="uwp-strip-label">Quote ID</span>
        <span class="uwp-strip-value font-mono">${val(sub.quote_id || sub.quoteNo || sub.id)}</span>
      </div>
      <div class="uwp-strip-item">
        <span class="uwp-strip-label">Applicant</span>
        <span class="uwp-strip-value">${val(sub.insured)}</span>
      </div>
      <div class="uwp-strip-item">
        <span class="uwp-strip-label">LOB</span>
        <span class="uwp-strip-value">${val(sub.lobName)}</span>
      </div>
      <div class="uwp-strip-item">
        <span class="uwp-strip-label">State</span>
        <span class="uwp-strip-value">${val(stateVal)}</span>
      </div>
      <div class="uwp-strip-item">
        <span class="uwp-strip-label">Effective Date</span>
        <span class="uwp-strip-value">${val(gen.effective_date || sub.effectiveDate)}</span>
      </div>
      <div class="uwp-strip-item uwp-strip-grow">
        <span class="uwp-strip-label">Status</span>
        <span class="uwp-strip-status-badge">${val(sub.statusText)}</span>
      </div>
      <div class="uwp-strip-item">
        <span class="uwp-strip-label">Assigned Underwriter</span>
        <span class="uwp-strip-value">${val(assignee)}</span>
      </div>
    </div>
  `;
}

// Two separate cards — Applicant Information and Policy Information — side
// by side, matching the reference layout. Every value still comes only
// from the ingested submission (Email/Submission JSON); fields with no
// data source anywhere in the app yet (Industry, Prior Policy Period,
// Driver Count as a labeled field, Program) render "Not Provided" rather
// than being invented.
function renderWbRiskOverviewGrid(sub) {
  const box = document.getElementById("wbRiskOverviewGridContainer");
  if (!box) return;
  const NP = '<span class="uwp-field-value uwp-empty">Not Provided</span>';
  const fieldVal = (v) => (v === undefined || v === null || v === "") ? null : v;

  const vehicles = sub.vehicles || [];
  const drivers = sub.drivers || [];
  const ops = sub.operationsProfile || {};
  const rad = sub.radiusOfOperationsInfo || {};
  const gen = sub.genInfo || {};

  const applicantFields = [
    { label: "Business / Named Insured", value: fieldVal(sub.insured) },
    { label: "Business Address", value: fieldVal(sub.address) },
    { label: "FEIN / Tax ID", value: fieldVal(sub.fein) },
    { label: "DOT Number", value: fieldVal(sub.dot) },
    { label: "MC Number", value: fieldVal(sub.mcNumber) },
    { label: "Years in Business", value: fieldVal(ops.years_in_business) },
    { label: "Operating Radius", value: fieldVal(rad.radius !== undefined ? `${rad.radius} Miles` : ops.operating_radius) },
    { label: "Industry", value: fieldVal(ops.business_type) }
  ];

  // Policy Information — every field here is directly editable by the
  // underwriter (per explicit request). Vehicle/Driver Count are the one
  // exception: they're literally the length of the Vehicles/Drivers
  // Schedule arrays elsewhere on this page, not a standalone value, so
  // editing them here wouldn't mean anything — they stay read-only counts.
  const policyFields = [
    { label: "Effective Date", value: fieldVal(gen.effective_date || sub.effectiveDate), path: "effectiveDate" },
    { label: "Expiration Date", value: fieldVal(gen.expiration_date || sub.expirationDate), path: "expirationDate" },
    { label: "Prior Policy Period", value: fieldVal(sub.priorPolicyPeriod), path: "priorPolicyPeriod" },
    { label: "Requested Limit / TIV", value: fieldVal(sub.exposure), path: "exposure" },
    { label: "Vehicle Count", value: vehicles.length || null, readonly: true },
    { label: "Driver Count", value: drivers.length || null, readonly: true },
    { label: "Policy Type", value: fieldVal(gen.policytype), path: "genInfo.policytype" },
    { label: "Program", value: fieldVal(sub.program), path: "program" }
  ];

  const renderCard = (title, icon, fields, editable) => `
    <div class="uwp-card">
      <div class="uwp-card-title"><i class="ph ${icon}"></i> ${title}</div>
      <div class="uwp-field-grid">
        ${fields.map(f => `
          <div class="uwp-field">
            <span class="uwp-field-label">${f.label}</span>
            ${editable && !f.readonly
              ? `<input type="text" class="form-control form-control-sm uwp-field-input" value="${f.value !== null && f.value !== undefined ? String(f.value).replace(/"/g, '&quot;') : ''}" placeholder="Not Provided" onchange="updateWorkbenchNestedField('${sub.id}', '${f.path}', this.value)">`
              : (f.value !== null && f.value !== undefined ? `<span class="uwp-field-value">${f.value}</span>` : NP)}
          </div>
        `).join('')}
      </div>
    </div>`;

  box.innerHTML = `
    <div class="uwp-grid-2col-even">
      ${renderCard("Applicant Information", "ph-identification-card", applicantFields, false)}
      ${renderCard("Policy Information", "ph-file-text", policyFields, true)}
    </div>
  `;
}

// Generic dot-path field writer for underwriter-editable Workbench fields
// (Policy Information, Operational Profile & Rating Factors). Writes the
// underwriter's typed value directly onto the submission at the given path
// (creating intermediate objects as needed), then re-renders so every other
// place that same fact is shown stays consistent, and persists it — same
// pattern as every other manual UW edit in this app (Risk Score override,
// Discretionary Pricing, etc.).
function updateWorkbenchNestedField(subId, path, rawValue) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  const value = rawValue.trim();
  const parts = path.split(".");
  let target = sub;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]] || typeof target[parts[i]] !== "object") target[parts[i]] = {};
    target = target[parts[i]];
  }
  const leafKey = parts[parts.length - 1];
  target[leafKey] = value === "" ? null : value;

  // Keep the couple of fields that are mirrored elsewhere in sync, same as
  // the ingestion pipeline already does for these exact fields.
  if (path === "effectiveDate") {
    if (!sub.genInfo) sub.genInfo = {};
    sub.genInfo.effective_date = value || null;
  } else if (path === "expirationDate") {
    if (!sub.genInfo) sub.genInfo = {};
    sub.genInfo.expiration_date = value || null;
  } else if (path === "exposure" && value) {
    const numeric = parseFloat(value.replace(/[^0-9.]/g, ""));
    if (!isNaN(numeric)) sub.exposureVal = numeric;
  }

  if (typeof renderUnderwritingWorkbench === "function") renderUnderwritingWorkbench(sub);
  if (typeof persistAppState === "function") persistAppState();
  showToast(`✅ ${sub.id} updated.`, "success");
}
window.updateWorkbenchNestedField = updateWorkbenchNestedField;

// Loss Runs — straight from sub.losses (Email/Submission JSON extracted).
// Paid Amount has no source anywhere in the app yet, so it's honestly "—"
// rather than assumed equal to incurred.
function renderWbLossRunsUwp(sub) {
  const box = document.getElementById("wbLossRunsUwpContainer");
  if (!box) return;

  const losses = sub.losses || [];
  const totalIncurred = losses.reduce((s, l) => s + (parseFloat(String(l.incurred || "0").replace(/[^0-9.]/g, "")) || 0), 0);

  const bodyHtml = losses.length ? losses.map(l => {
    const statusCls = l.status === "Clean" ? "uwp-status-clean" : (l.status === "Closed" ? "uwp-status-closed" : "uwp-status-open");
    return `<tr>
      <td>${l.year}</td>
      <td>${l.desc}</td>
      <td class="font-mono">${l.incurred}</td>
      <td class="font-mono ${l.paid === undefined ? 'uwp-empty-inline' : ''}">${l.paid !== undefined ? (typeof l.paid === 'number' ? `$${l.paid.toLocaleString()}` : l.paid) : '—'}</td>
      <td><span class="uwp-status-pill ${statusCls}">${l.status}</span></td>
    </tr>`;
  }).join('') : `<tr><td colspan="5"><div class="empty-state"><i class="ph ph-file-text empty-state-icon"></i><div class="empty-state-body">No loss history was provided with this submission.</div></div></td></tr>`;

  // Loss Ratio = Incurred Losses ÷ Earned Premium × 100. Incurred Losses is
  // the real sum of sub.losses above — never hardcoded. Earned Premium
  // (the prior period's premium) isn't something Email/JSON ever states
  // directly, so it's a value the underwriter enters here; the ratio then
  // (re)calculates live off whatever real incurred total + entered premium
  // exist, and stays "Not Provided" rather than a fabricated number when
  // either is missing.
  const earnedPremium = (typeof sub.priorEarnedPremium === "number" && sub.priorEarnedPremium > 0) ? sub.priorEarnedPremium : null;
  const lossRatio = (earnedPremium && losses.length) ? (totalIncurred / earnedPremium) * 100 : null;
  const lossRatioColor = lossRatio === null ? "var(--text-muted)" : (lossRatio < 60 ? "#166534" : (lossRatio <= 90 ? "#B45309" : "#B91C1C"));

  const lossRatioHtml = `
    <div class="uwp-subsection-title">Loss Ratio</div>
    <div class="uwp-field-grid" style="grid-template-columns: repeat(3, 1fr);">
      <div class="uwp-field">
        <span class="uwp-field-label">Total Incurred Losses</span>
        <span class="uwp-field-value font-mono">$${totalIncurred.toLocaleString()}</span>
      </div>
      <div class="uwp-field">
        <span class="uwp-field-label">Earned Premium (Prior Period)</span>
        <input type="text" class="form-control form-control-sm" placeholder="Enter earned premium" value="${earnedPremium !== null ? earnedPremium : ''}" onchange="updateLossRatioEarnedPremium('${sub.id}', this.value)">
      </div>
      <div class="uwp-field">
        <span class="uwp-field-label">Loss Ratio</span>
        ${lossRatio !== null
          ? `<span class="uwp-field-value font-mono" style="color:${lossRatioColor}; font-weight:800;">${lossRatio.toFixed(1)}%</span>`
          : `<span class="uwp-field-value uwp-empty">Not Provided</span>`}
      </div>
    </div>
    <div class="text-xs text-muted mt-1">Loss Ratio = Incurred Losses ÷ Earned Premium × 100</div>`;

  box.innerHTML = `
    <div class="uwp-card">
      <div class="uwp-card-title"><i class="ph ph-file-text"></i> Loss Runs (${losses.length} Claim${losses.length === 1 ? '' : 's'})</div>
      <div class="table-responsive">
        <table class="uwp-table">
          <thead><tr><th>Claim Date</th><th>Claim Type</th><th>Incurred Amount</th><th>Paid Amount</th><th>Status</th></tr></thead>
          <tbody>${bodyHtml}</tbody>
          ${losses.length ? `<tfoot><tr><td>Total Claims: ${losses.length}</td><td></td><td class="font-mono">Total Incurred: $${totalIncurred.toLocaleString()}</td><td></td><td></td></tr></tfoot>` : ''}
        </table>
      </div>
      ${lossRatioHtml}
    </div>`;
}

// Earned Premium is a manual underwriter entry (no Email/JSON field states
// it), so it's captured and stored on the submission the same way Risk
// Score overrides and other manual UW inputs are — then the Loss Ratio
// section recalculates live off it plus the real incurred-losses total.
function updateLossRatioEarnedPremium(subId, rawValue) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;
  const numeric = parseFloat(String(rawValue).replace(/[^0-9.]/g, ""));
  sub.priorEarnedPremium = (!isNaN(numeric) && numeric > 0) ? numeric : null;
  renderWbLossRunsUwp(sub);
  if (typeof persistAppState === "function") persistAppState();
}
window.updateLossRatioEarnedPremium = updateLossRatioEarnedPremium;

// UW Factors — the exact breakdown calculateRiskScore() already computes
// (risk-score.js), just presented as a table. Impact tiers and "Source"
// panel names are a display classification of that same real data — not
// new fabricated values.
function renderWbUwFactorsUwp(sub) {
  const box = document.getElementById("wbUwFactorsContainer");
  if (!box || typeof calculateRiskScore !== "function") return;

  const factors = calculateRiskScore(sub).factors || [];
  const classify = (pts) => pts >= 15 ? { cls: "uwp-impact-high", label: "High" } : pts >= 5 ? { cls: "uwp-impact-medium", label: "Medium" } : { cls: "uwp-impact-low", label: "Low" };
  const sourceFor = (label) => {
    const l = label.toLowerCase();
    if (l.indexOf("driver") !== -1) return "Driver Schedule";
    if (l.indexOf("loss") !== -1) return "Loss Runs";
    if (l.indexOf("exposure") !== -1) return "Quote Data";
    if (l.indexOf("appetite") !== -1) return "Appetite Rules";
    if (l.indexOf("vehicle") !== -1) return "Vehicle Schedule";
    return "Base Configuration";
  };

  const rows = factors.map(f => {
    const impact = classify(f.points);
    return `<tr>
      <td>${f.label}</td>
      <td class="font-mono">${f.points > 0 ? '+' : ''}${f.points}</td>
      <td><span class="uwp-status-pill ${impact.cls}">${impact.label}</span></td>
      <td class="text-muted">${sourceFor(f.label)}</td>
    </tr>`;
  }).join('');

  box.innerHTML = `
    <div class="uwp-card">
      <div class="uwp-card-title"><i class="ph ph-list-checks"></i> UW Factors</div>
      <div class="table-responsive">
        <table class="uwp-table">
          <thead><tr><th>Factor</th><th>Value</th><th>Impact</th><th>Source</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}


// Helper: Authority Screen in Screen 6
// Helper: Authority Screen in Screen 6
function renderAuthorityScreen(sub) {
  const expLabel = document.getElementById("currentAuthExposure");
  const meterFill = document.getElementById("authMeterFill");
  const meterLbl = document.getElementById("authMeterLabel");
  const authBadge = document.getElementById("authCheckBadge");
  const refCard = document.getElementById("referralCard");
  const uwName = document.getElementById("authUnderwriterName");
  const maxLimit = document.getElementById("authMaxLimitDisplay");
  const juniorPanel = document.getElementById("juniorUWPanel");
  const seniorPanel = document.getElementById("seniorUWPanel");
  const noteText = document.getElementById("primaryUWNoteText");

  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  const effectiveLimit = roleConfig.limit;
  const isExceeded = exposureScenario === "exceeds" || (effectiveLimit > 0 && sub.exposureVal > effectiveLimit) || (effectiveLimit === 0);

  if (uwName) {
    uwName.textContent = `${roleConfig.name} (${roleConfig.title})`;
  }

  if (maxLimit) {
    maxLimit.textContent = roleConfig.limitText;
  }

  if (expLabel) expLabel.textContent = isExceeded ? `${sub.exposure} (Exceeds Limit!)` : sub.exposure;

  const pct = effectiveLimit > 0 ? Math.min(100, Math.round((sub.exposureVal / effectiveLimit) * 100)) : 100;
  if (meterFill) {
    meterFill.style.width = `${pct}%`;
    meterFill.style.background = isExceeded ? "#ef4444" : "linear-gradient(90deg, #10b981 0%, #f59e0b 80%, #ef4444 100%)";
  }

  if (meterLbl) {
    meterLbl.textContent = effectiveLimit > 0 
      ? `${pct}% of Assigned Authority (${sub.exposure} / $${(effectiveLimit / 1000000).toFixed(1)}M)`
      : `Exposure: ${sub.exposure} (${roleConfig.limitText})`;
  }

  if (authBadge) {
    if (isExceeded) {
      authBadge.className = "badge badge-danger";
      authBadge.innerHTML = `<i class="ph ph-warning"></i> High Exposure → Senior Referral Required`;
      if (refCard) refCard.style.border = "2px solid #f59e0b";
    } else {
      authBadge.className = "badge badge-success";
      authBadge.innerHTML = `<i class="ph ph-check"></i> Within Assigned Authority Limit`;
      if (refCard) refCard.style.border = "1px solid var(--border-color)";
    }
  }

  // Toggle Junior vs Senior Decision Panels
  if (currentUserRole === "senior") {
    if (juniorPanel) juniorPanel.style.display = "none";
    if (seniorPanel) seniorPanel.style.display = "block";
    if (noteText) {
      noteText.innerHTML = `<strong>Escalation from Primary UW:</strong> Submission exposure of <strong>${sub.exposure}</strong> (${sub.lobName}) reviewed. Operations, safety scoring, and clean loss record verified. Executive referral sign-off requested.`;
    }
  } else {
    if (juniorPanel) juniorPanel.style.display = "block";
    if (seniorPanel) seniorPanel.style.display = "none";
    const jBox = document.getElementById("juniorActionBox");
    if (jBox) {
      if (isExceeded) {
        jBox.innerHTML = `
          <div class="alert alert-warning p-2 mb-2 text-sm" style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; color: #92400e; margin-bottom: 8px;">
            <i class="ph ph-warning"></i> <strong>Exceeds Authority:</strong> Submit escalation referral to Senior CUO (Marcus Vance) for executive review.
          </div>
          <button class="btn btn-warning" id="btnJuniorEscalate" onclick="submitJuniorEscalation()">
            <i class="ph ph-paper-plane-tilt"></i> Refer to Senior — Marcus Vance (CUO)
          </button>
        `;
      } else {
        jBox.innerHTML = `
          <div class="alert alert-success p-2 text-sm" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; color: #166534;">
            <i class="ph ph-check-circle"></i> <strong>Authority Clear:</strong> Submission is within your $2.0M Junior Limit. No referral needed. Proceed to Screen 7 (Rating Engine).
          </div>
        `;
      }
    }
  }
}

function submitJuniorEscalation() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  const text = document.getElementById("juniorEscalationText")?.value || "Risk exposure exceeds authority. Recommending approval.";
  if (sub) {
    sub.statusText = "Senior Referral";
    sub.statusBadge = "badge-warning";
    sub.isReferral = true;
  }
  showToast("📤 Referral Request dispatched to Marcus Vance (CUO Desk)! Switch to Senior UW role from header to review & sign-off.", "warning");
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
  const jBox = document.getElementById("juniorActionBox");
  if (jBox) {
    jBox.innerHTML = `
      <div class="alert alert-info p-2 text-sm" style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 4px; color: #0369a1;">
        <i class="ph ph-hourglass-medium"></i> <strong>Referral Dispatched:</strong> Awaiting Marcus Vance's CUO Sign-Off. Switch to Senior UW persona from header to act as CUO.
      </div>
    `;
  }
}

// ============================================================================
// 6.7 SCREEN 7: DYNAMIC RATING ENGINE PAYLOAD GENERATOR & EXPORTER
// ============================================================================

function getSubmissionRatingPayload(sub) {
  if (!sub) {
    sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
  }
  // Empty-queue safe fallback: SUBMISSIONS_DATASET can legitimately be empty
  // (nothing ingested yet), and this is also called once at script load
  // time via `RATING_ENGINE_PAYLOAD = getSubmissionRatingPayload(null)`,
  // before any submission exists at all. Without a stand-in object here,
  // every property access below throws and halts the entire script.
  if (!sub) {
    sub = { id: "SUB-PENDING", address: "", fein: "", insured: "", lobKey: "trucking", channelType: "broker", coverageRows: [], vehicles: [], drivers: [] };
  }

  // Parse address for city, state, zip
  let city = "";
  let state = "";
  let zip = "";
  if (sub.address) {
    const parts = sub.address.split(",");
    if (parts.length >= 3) {
      city = parts[parts.length - 3].trim();
      const stateZip = parts[parts.length - 2].trim().split(" ");
      state = stateZip[0] || "";
      zip = stateZip[1] || "";
    } else {
      city = sub.address;
    }
  }

  // Parse vehicle make/model/year from OCR or default
  let vehicleMake = "";
  let vehicleModel = "";
  let vehicleYear = 2024;
  if (sub.ocrFields) {
    const mmField = sub.ocrFields.find(f => f.key.includes("Make") || f.key.includes("Model") || f.key.includes("Vehicle"));
    if (mmField) {
      const parts = mmField.val.split(" ");
      vehicleMake = parts[0] || "";
      vehicleModel = parts.slice(1).join(" ") || "";
    }
    const yField = sub.ocrFields.find(f => f.key.includes("Year"));
    if (yField) {
      vehicleYear = parseInt(yField.val, 10) || 2024;
    }
  }

  return {
    "insured_id": sub.fein ? (parseInt(sub.fein.replace(/\D/g, ""), 10) || 1150142) : 1150142,
    "submission_id": sub.id,
    "quote_id": sub.quoteNo || `QT-${(sub.lobKey || "GEN").toUpperCase()}-2026-8801`,
    "endorsement_number": 0,
    "endorsement_type": null,
    "broker_fee": {
      "amount": sub.channelType === 'broker' ? 2574 : 0,
      "default": sub.channelType === 'broker' ? 1 : 0
    },
    "genInfo": {
      "quotetype": sub.lobName || "Commercial Insurance",
      "application_type_id": 483,
      "company": 210,
      "lob": sub.lobKey || "trucking",
      "policytype": "New Business",
      "billtype": sub.channelType === 'broker' ? "Agency Bill" : "Direct Bill",
      "effective_date": "09/01/2026",
      "expiration_date": "09/01/2027",
      "lock_rate_effective_date": "08/25/2026",
      "business_yrs_exp": "5",
      "binding": sub.currentStep >= 7 ? "yes" : "pending",
      "al_check": true,
      "cargo_check": sub.lobKey === "trucking",
      "pd_check": true
    },
    "insuredInfo": {
      "entity_type": sub.channelType === 'broker' ? "Corporation / LLC" : "Individual / Direct",
      "insured_name": sub.insured || "",
      "fein": sub.fein || "",
      "dot_number": sub.dot || "",
      "address": sub.address || "",
      "insured_garaging_zip": zip || "",
      "insured_garaging_city": city || "",
      "insured_garaging_state": state || (sub.id.split('-').pop() || "TX"),
      "insured_garaging_county": city ? `${city} County` : "",
      "years_of_experience": 5,
      "dot_yes_no": (sub.dot && sub.dot !== "N/A") ? "Yes" : "No",
      "icc_filings_yes_no": "No",
      "description_of_operation": sub.priorityReason || ""
    },
    "coveragesInfo": {
      "rating_type": "Composite Rating Engine",
      "liability": sub.exposureVal || 1000000,
      "al_deductions": 0,
      "pd": "Yes",
      "cargo": sub.lobKey === "trucking" ? "Yes" : "No",
      "cargo_limit": 250000,
      "pd_high_deductible": "5000",
      "pd_deductible_amount": 2500,
      "naics_code": 484110,
      "rating_class": 5,
      "dashcam": "No",
      "al_check": true,
      "pd_check": true,
      "cargo_check": sub.lobKey === "trucking",
      "towing": "10000"
    },
    "filingInfo": {
      "safer_factor": "1.0",
      "FMCSA_alert": "0",
      "uw_credit_debit_factor": sub.priority === 'P1' ? "0.95" : "1.0"
    },
    "radiusOfOperationsInfo": {
      "radius": 450,
      "Intrastate_interstate": "Interstate"
    },
    "serviceInspectionInfo": {
      "number_of_inspection_si": 0,
      "oos_violation_si": 0,
      "account_percent_si": "-",
      "account_percent_driver": "-"
    },
    "commoditiesSelected": [1, 2],
    "commoditiesInfo": {
      "secondary_class": sub.lobName || "Commercial Lines"
    },
    "uwReviewInfo": {
      "driver_factor": 1.0,
      "og_driver_count": (sub.ocrFields && sub.ocrFields.find(f => f.key.includes("Units"))) ? parseInt(sub.ocrFields.find(f => f.key.includes("Units")).val, 10) || 5 : 5,
      "cr_driver_count": 5,
      "al_pollution": "Low",
      "al_pollution_factor": "1.00",
      "uw_credit_debit_factor": "1.0",
      "loss_experience_factor": "1.0",
      "min_earn_factor": 25,
      "broker_fee_amount": sub.channelType === 'broker' ? 2574 : 0,
      "original_driver_exclude_count": 0
    },
    "vehicles": (sub.coverageRows || [{ line: "Coverage Limit", limit: "$1,000,000", ded: "$2,500", prem: "$12,000.00" }]).map((row, idx) => ({
      "id": 903100 + idx,
      "xid": idx + 1,
      "year": vehicleYear,
      "make": vehicleMake || sub.insured.split(" ")[0] || "Unit",
      "model": vehicleModel || "Commercial Vehicle",
      "state_code": state || "TX",
      "zip": zip || "",
      "weight": "Commercial",
      "ownership": "Owned",
      "primary_code": 332,
      "secondary_code": null,
      "rating_class": 5,
      "stated_value": sub.exposureVal || 500000,
      "al_value": Math.round((sub.exposureVal || 500000) * 0.2),
      "miles_driven": 450,
      "no_of_units": 1,
      "no_of_ppt_units": 0,
      "vehicle_age": 2026 - vehicleYear,
      "Liability": "Yes",
      "pd_opted": "Yes",
      "naics_code": 484110,
      "liab_baserate": 837,
      "liab_ilf_factor": 2.06,
      "liab_ded_factor": 0,
      "liab_lcm_factor": 1.67,
      "liab_primary_factor": 1.8,
      "liab_secondary_factor": 1.98,
      "liab_fleet_factor": 0.97,
      "vehicle_age_factor": 1.12,
      "liab_ocn_factor": 1.14,
      "radius_factor": 0.95,
      "naics_factor": 1.1,
      "tort_limitation_factor": 1,
      "miles_driven_factor": 1.03,
      "rating_class_factor": 1,
      "dashcam_factor": 1,
      "cdl_exp_disc_factor": 1,
      "driver_class_factor": 1.0,
      "liab_acc_level_factor": 1,
      "vehicle_owned_factor": 0.95,
      "driver_criteria_factor": 1,
      "payment_plan_factor": 1,
      "heavy_farm_factor": 1,
      "heavy_dumping_factor": 1,
      "uw_credit_debit_factor": 1,
      "al_premium_wo_mod_factor": row.prem || "$10,000",
      "liability_premium": row.prem || "$10,000",
      "pd_premium": row.prem || "$10,000",
      "pd_base_rate": 4.75,
      "pd_deductible_factor": 0.875
    })),
    "drivers": [
      {
        "id": 942561,
        "given_name": (sub.insured || "Primary").split(" ")[0],
        "last_name": (sub.insured || "Insured").split(" ").slice(1).join(" ") || "Insured",
        "dob": "01/01/1990",
        "licensestate": state || "TX",
        "licenseclasstype": "Class A",
        "experience": "5 Years",
        "tenure": 3,
        "exclude": 0,
        "status": "Active Verified",
        "driver_factor": 1.0,
        "violations": []
      }
    ]
  };
}

var RATING_ENGINE_PAYLOAD = getSubmissionRatingPayload(null);

// Helper: Syntax Highlighting for JSON
function syntaxHighlightJSON(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

// Helper: Render Screen 7 Rating Engine JSON Viewer & Line Numbers
function renderRatingEnginePayload(sub) {
  const codeBlock = document.getElementById("ratingJSONCodeBlock");
  const gutter = document.getElementById("jsonLineGutter");
  if (!codeBlock) return;

  const payload = getSubmissionRatingPayload(sub);
  RATING_ENGINE_PAYLOAD = payload;

  const jsonStr = JSON.stringify(payload, null, 2);
  codeBlock.innerHTML = syntaxHighlightJSON(jsonStr);

  if (gutter) {
    const lineCount = jsonStr.split("\n").length;
    let linesHtml = "";
    for (let i = 1; i <= lineCount; i++) {
      linesHtml += `<div>${i}</div>`;
    }
    gutter.innerHTML = linesHtml;
  }
}

// Action: Export Rating Payload to CSV
function exportRatingPayloadToCSV() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  const data = getSubmissionRatingPayload(sub);
  let csv = [];

  csv.push("================================================================================");
  csv.push("RATING ENGINE PAYLOAD SUMMARY");
  csv.push("================================================================================");
  csv.push(`Quote ID,${data.quote_id}`);
  csv.push(`Submission ID,${data.submission_id}`);
  csv.push(`Insured ID,${data.insured_id}`);
  csv.push(`Insured Name,"${data.insuredInfo.insured_name}"`);
  csv.push(`Entity Type,"${data.insuredInfo.entity_type}"`);
  csv.push(`Garaging City,"${data.insuredInfo.insured_garaging_city}"`);
  csv.push(`Garaging State,"${data.insuredInfo.insured_garaging_state}"`);
  csv.push(`Garaging Zip,"${data.insuredInfo.insured_garaging_zip}"`);
  csv.push(`Garaging County,"${data.insuredInfo.insured_garaging_county}"`);
  csv.push(`LOB / Quote Type,"${data.genInfo.quotetype}"`);
  csv.push(`Effective Date,"${data.genInfo.effective_date}"`);
  csv.push(`Expiration Date,"${data.genInfo.expiration_date}"`);
  csv.push(`Policy Type,"${data.genInfo.policytype}"`);
  csv.push(`Bill Type,"${data.genInfo.billtype}"`);
  csv.push(`Rating Type,"${data.coveragesInfo.rating_type}"`);
  csv.push(`Liability Limit,${data.coveragesInfo.liability}`);
  csv.push(`PD Deductible Amount,${data.coveragesInfo.pd_deductible_amount}`);
  csv.push(`PD High Deductible,${data.coveragesInfo.pd_high_deductible}`);
  csv.push(`Towing Limit,${data.coveragesInfo.towing}`);
  csv.push(`Broker Fee Amount,${data.broker_fee.amount}`);
  csv.push(`Driver Factor,${data.uwReviewInfo.driver_factor}`);
  csv.push(`Original Driver Count,${data.uwReviewInfo.og_driver_count}`);
  csv.push(`Driver Exclude Count,${data.uwReviewInfo.original_driver_exclude_count}`);
  csv.push(`AL Pollution,${data.uwReviewInfo.al_pollution}`);
  csv.push(`AL Pollution Factor,${data.uwReviewInfo.al_pollution_factor}`);
  csv.push("");

  csv.push("================================================================================");
  csv.push("VEHICLES SCHEDULE");
  csv.push("================================================================================");
  const vHeaders = [
    "Vehicle ID", "Unit #", "Year", "Make", "Model", "State", "Zip", "Weight", "Ownership",
    "Stated Value", "AL Value", "Miles Driven", "Vehicle Age", "Liability Opted", "PD Opted",
    "NAICS Code", "Liab Base Rate", "Liab ILF Factor", "Liab LCM Factor", "Liab Primary Factor",
    "Liab Secondary Factor", "Fleet Factor", "Vehicle Age Factor", "Radius Factor", "NAICS Factor",
    "Driver Class Factor", "AL Premium w/o Mod", "Liability Premium", "PD Base Rate", "PD Deductible Factor", "PD Premium"
  ];
  csv.push(vHeaders.map(h => `"${h}"`).join(","));
  data.vehicles.forEach(v => {
    const row = [
      v.id, v.xid, v.year, `"${v.make}"`, `"${v.model}"`, `"${v.state_code}"`, `"${v.zip}"`, `"${v.weight}"`, `"${v.ownership}"`,
      v.stated_value, v.al_value, v.miles_driven, v.vehicle_age, `"${v.Liability}"`, `"${v.pd_opted}"`,
      v.naics_code, v.liab_baserate, v.liab_ilf_factor, v.liab_lcm_factor, v.liab_primary_factor,
      v.liab_secondary_factor, v.liab_fleet_factor, v.vehicle_age_factor, v.radius_factor, v.naics_factor,
      v.driver_class_factor, v.al_premium_wo_mod_factor, v.liability_premium, v.pd_base_rate, v.pd_deductible_factor, v.pd_premium
    ];
    csv.push(row.join(","));
  });
  csv.push("");

  csv.push("================================================================================");
  csv.push("DRIVERS SCHEDULE");
  csv.push("================================================================================");
  const dHeaders = [
    "Driver ID", "Given Name", "Last Name", "DOB", "License State", "Class Type", "Experience Yrs",
    "Tenure Yrs", "Excluded", "Status", "Driver Factor", "Violations Count", "Violation Details"
  ];
  csv.push(dHeaders.map(h => `"${h}"`).join(","));
  data.drivers.forEach(d => {
    const violStr = (d.violations || []).map(v => `Code ${v.violation} (${v.violationDate || 'N/A'})`).join("; ");
    const row = [
      d.id, `"${d.given_name}"`, `"${d.last_name}"`, `"${d.dob}"`, `"${d.licensestate}"`, `"${d.licenseclasstype}"`,
      `"${d.experience || 0}"`, d.tenure, d.exclude, `"${d.status}"`, d.driver_factor,
      (d.violations || []).length, `"${violStr}"`
    ];
    csv.push(row.join(","));
  });

  const csvContent = "\uFEFF" + csv.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Rating_Payload_${data.submission_id}_${data.quote_id}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("📊 Rating Payload exported to CSV successfully!", "success");
}

// Action: Copy Rating JSON to Clipboard
function copyRatingJSON() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  const data = getSubmissionRatingPayload(sub);
  const jsonStr = JSON.stringify(data, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(jsonStr).then(() => {
      showToast("📋 Rating Payload JSON copied to clipboard!", "success");
    }).catch(() => {
      fallbackCopyText(jsonStr);
    });
  } else {
    fallbackCopyText(jsonStr);
  }
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand("copy");
    showToast("📋 Rating Payload JSON copied to clipboard!", "success");
  } catch (err) {
    showToast("Could not copy JSON", "warning");
  }
  document.body.removeChild(textArea);
}

// Action: Download Rating JSON File
function downloadRatingJSON() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  const data = getSubmissionRatingPayload(sub);
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Rating_Payload_${data.submission_id}_${data.quote_id}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("📥 Rating Payload JSON downloaded!", "success");
}

// Action: Toggle Line Wrapping in Code Block
function toggleJSONWrap() {
  const codeBlock = document.getElementById("ratingJSONCodeBlock");
  const btn = document.getElementById("btnToggleWrap");
  if (!codeBlock) return;
  codeBlock.parentElement.classList.toggle("wrap-lines");
  const isWrapped = codeBlock.parentElement.classList.contains("wrap-lines");
  if (btn) {
    btn.innerHTML = isWrapped 
      ? `<i class="ph ph-text-align-left"></i> No Wrap` 
      : `<i class="ph ph-text-aa"></i> Wrap Lines`;
  }
}

// Helper: Quote PDF Preview in Screen 8
function renderQuotePDF(sub) {
  const qNo = document.getElementById("pdfQuoteNo");
  const qIns = document.getElementById("pdfInsuredName");
  const qAdd = document.getElementById("pdfInsuredAddress");
  const qBrok = document.getElementById("pdfBrokerName");

  if (qNo) qNo.textContent = sub.quoteNo;
  if (qIns) qIns.textContent = sub.insured;
  if (qAdd) qAdd.innerHTML = sub.address.replace(", ", "<br>");
  if (qBrok) qBrok.textContent = sub.broker;

  const rows = document.getElementById("pdfCoverageRows");
  if (rows && sub.coverageRows) {
    rows.innerHTML = sub.coverageRows.map(c => `
      <tr>
        <td><strong>${c.line}</strong></td>
        <td>${c.limit}</td>
        <td>${c.ded}</td>
        <td class="font-mono font-bold">${c.prem}</td>
      </tr>
    `).join("");
  }

  const subjs = document.getElementById("pdfSubjectivitiesList");
  if (subjs && sub.subjectivities) {
    subjs.innerHTML = sub.subjectivities.map((s, idx) => `
      <li>${idx + 1}. ${s}</li>
    `).join("");
  }
}

// ============================================================================
// ALL 7 STEPS CASE SUMMARY & AUDIT MODAL CONTROLLER (Screen 8)
// ============================================================================

let summaryModalActiveTab = "all";

function openAllStepsSummaryModal() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
  if (!sub) return;

  renderAllStepsSummaryModal(sub);
  switchSummaryModalTab("all");

  const modal = document.getElementById("allStepsSummaryModal");
  if (modal) {
    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
}

function closeAllStepsSummaryModal() {
  const modal = document.getElementById("allStepsSummaryModal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
  }
}

function switchSummaryModalTab(tabKey) {
  summaryModalActiveTab = tabKey;

  // Update tab button styles
  const buttons = document.querySelectorAll("#summaryModalStepTabs .s-tab-btn");
  buttons.forEach(btn => {
    if (btn.getAttribute("data-tab") === tabKey) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Filter cards in modal body
  const cards = document.querySelectorAll("#allStepsSummaryModalBody .summary-step-card");
  cards.forEach(card => {
    if (tabKey === "all") {
      card.style.display = "block";
    } else {
      const stepId = card.getAttribute("data-step-card");
      if (stepId === tabKey) {
        card.style.display = "block";
      } else {
        card.style.display = "none";
      }
    }
  });
}

function renderAllStepsSummaryModal(sub) {
  const strip = document.getElementById("summaryModalAccountStrip");
  const body = document.getElementById("allStepsSummaryModalBody");
  if (!strip || !body) return;

  // 1. Render Top Metadata Strip
  strip.innerHTML = `
    <div class="summary-strip-item">
      <span class="summary-strip-label">Named Insured</span>
      <span class="summary-strip-val" title="${sub.insured}">${sub.insured}</span>
    </div>
    <div class="summary-strip-item">
      <span class="summary-strip-label">Submission ID</span>
      <span class="summary-strip-val font-mono">${sub.id}</span>
    </div>
    <div class="summary-strip-item">
      <span class="summary-strip-label">Quote Number</span>
      <span class="summary-strip-val font-mono text-primary">${sub.quoteNo || 'QT-2026-89412'}</span>
    </div>
    <div class="summary-strip-item">
      <span class="summary-strip-label">FEIN</span>
      <span class="summary-strip-val font-mono">${sub.fein}</span>
    </div>
    <div class="summary-strip-item">
      <span class="summary-strip-label">Line of Business</span>
      <span class="summary-strip-val">${sub.lobName}</span>
    </div>
    <div class="summary-strip-item">
      <span class="summary-strip-label">Producing Broker</span>
      <span class="summary-strip-val" title="${sub.broker}">${sub.broker.split(' ')[0]}</span>
    </div>
    <div class="summary-strip-item">
      <span class="summary-strip-label">Assigned Desk / UW</span>
      <span class="summary-strip-val">${sub.underwriter ? sub.underwriter.split(' ')[0] : 'Open Queue'}</span>
    </div>
    <div class="summary-strip-item">
      <span class="summary-strip-label">Gross Premium</span>
      <span class="summary-strip-val text-success font-bold">$48,600.00</span>
    </div>
  `;

  // 2. Render All 7 Step Cards
  body.innerHTML = `
    <!-- STEP 1: DOC INGESTION & SCHEMA / OCR -->
    <div class="summary-step-card" data-step-card="step1">
      <div class="summary-step-header">
        <div class="summary-step-title-box">
          <span class="summary-step-badge">1</span>
          <div>
            <div class="summary-step-title">Step 1: Document Ingestion & Optical Character Recognition (OCR)</div>
            <div class="summary-step-desc">Document ingestion pipeline, file validation, OCR parsing, and canonical entity schema creation.</div>
          </div>
        </div>
        <span class="badge badge-success"><i class="ph ph-check-circle"></i> 99.4% OCR Confidence</span>
      </div>
      <div class="summary-step-grid">
        <div class="summary-field-box">
          <div class="summary-field-label">Ingested Files (${(sub.docs || []).length})</div>
          <div class="summary-field-val">${(sub.docs || []).map(d => d.name).join(', ')}</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Entity Type & Structure</div>
          <div class="summary-field-val">${sub.entityType || 'Commercial LLC'} • DOT: 3948102</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Operating Address</div>
          <div class="summary-field-val">${sub.address || '10440 Highway 290 West, Houston, TX 77040'}</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Effective Term</div>
          <div class="summary-field-val">${sub.effectiveDate || '09/01/2026'} to 09/01/2027 (12 Mo)</div>
        </div>
      </div>
    </div>

    <!-- STEP 2: CLEARANCE & APPETITE CHECK -->
    <div class="summary-step-card" data-step-card="step2">
      <div class="summary-step-header">
        <div class="summary-step-title-box">
          <span class="summary-step-badge">2</span>
          <div>
            <div class="summary-step-title">Step 2: FEIN Clearance & Appetite Knockout Screening</div>
            <div class="summary-step-desc">Duplicate FEIN broker of record lock check, carrier appetite rules validation, and knockout verification.</div>
          </div>
        </div>
        <span class="badge badge-success"><i class="ph ph-shield-check"></i> 10/10 Appetite Rules Passed</span>
      </div>
      <div class="summary-step-grid">
        <div class="summary-field-box">
          <div class="summary-field-label">FEIN Clearance Status</div>
          <div class="summary-field-val text-success">Cleared • FEIN ${sub.fein} Locked to ${sub.broker.split(' ')[0]}</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Commodity & Hazard Eligibility</div>
          <div class="summary-field-val">General Freight / Dry Van (Non-Hazmat) — Eligible</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Operating Radius Guidelines</div>
          <div class="summary-field-val">Regional 450-Mile Radius (Max Allowed 750 Miles) — Passed</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Knockout Checkpoints</div>
          <div class="summary-field-val text-success">0 Violations • No Dual-Broker Conflicts Detected</div>
        </div>
      </div>
    </div>

    <!-- STEP 3: DATA ENRICHMENT & ROUTING -->
    <div class="summary-step-card" data-step-card="step3">
      <div class="summary-step-header">
        <div class="summary-step-title-box">
          <span class="summary-step-badge">3</span>
          <div>
            <div class="summary-step-title">Step 3: Third-Party Data Enrichment & Automated Routing</div>
            <div class="summary-step-desc">External API data enrichment (CAB, SAFER/FMCSA, LexisNexis, ISO) and smart underwriter queue routing.</div>
          </div>
        </div>
        <span class="badge badge-info"><i class="ph ph-tree-structure"></i> Verified Live APIs</span>
      </div>
      <div class="summary-step-grid">
        <div class="summary-field-box">
          <div class="summary-field-label">SAFER / FMCSA Safety Rating</div>
          <div class="summary-field-val">Satisfactory • 0 OOS Violations • Safer Alert: 1.00</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">ISO / CAB Telematics Score</div>
          <div class="summary-field-val">Tier-1 Safety Profile • ISO Class 3 Public Protection</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Assigned Underwriter & Desk</div>
          <div class="summary-field-val">${sub.underwriter || 'Sarah Jenkins'} • ${sub.desk || 'Specialty Transportation Desk'}</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">SLA Target & Priority Score</div>
          <div class="summary-field-val"><span class="badge ${sub.priority === 'P1' ? 'badge-danger' : 'badge-warning'}">${sub.priority} Priority</span> (Score: ${sub.priorityScore || 92}/100)</div>
        </div>
      </div>
    </div>

    <!-- STEP 4: UNDERWRITING WORKBENCH -->
    <div class="summary-step-card" data-step-card="step4">
      <div class="summary-step-header">
        <div class="summary-step-title-box">
          <span class="summary-step-badge">4</span>
          <div>
            <div class="summary-step-title">Step 4: Underwriting Workbench, Loss Runs & Subjectivities</div>
            <div class="summary-step-desc">5-year historical loss triangulation, ACORD application audit, subjectivities tracking, and RFI log.</div>
          </div>
        </div>
        <span class="badge badge-success"><i class="ph ph-chart-line"></i> 14.8% Favorable Loss Ratio</span>
      </div>
      <div class="summary-step-grid">
        <div class="summary-field-box">
          <div class="summary-field-label">5-Year Prior Claims Triangulation</div>
          <div class="summary-field-val">2 Claims • $12,400 Total Incurred • 0 Open Reserves</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Calculated Loss Ratio</div>
          <div class="summary-field-val text-success">14.8% (Carrier Benchmark: &lt; 55.0%) — Highly Favorable</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Active Subjectivities (${(sub.subjectivities || []).length})</div>
          <div class="summary-field-val">MVR driver check, Signed ACORD on file</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">RFI & Broker Communications</div>
          <div class="summary-field-val text-success">All inquiries resolved • No outstanding documentation blocks</div>
        </div>
      </div>
    </div>

    <!-- STEP 5: AUTHORITY DESK & CUO REFERRAL -->
    <div class="summary-step-card" data-step-card="step5">
      <div class="summary-step-header">
        <div class="summary-step-title-box">
          <span class="summary-step-badge">5</span>
          <div>
            <div class="summary-step-title">Step 5: Authority Delegation & CUO Referral Desk</div>
            <div class="summary-step-desc">Underwriting limits verification, Junior-to-Senior escalation workflow, and formal CUO sign-off.</div>
          </div>
        </div>
        <span class="badge badge-success"><i class="ph ph-stamp"></i> Executive CUO Signed Off</span>
      </div>
      <div class="summary-step-grid">
        <div class="summary-field-box">
          <div class="summary-field-label">Total Exposure Value</div>
          <div class="summary-field-val font-mono">${sub.exposure || '$3,200,000 TIV / Fleet'}</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Primary UW Authority Limit</div>
          <div class="summary-field-val">$2,000,000 (Level-2 Sarah Jenkins)</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Escalation Rationale</div>
          <div class="summary-field-val">Exceeds $2.0M limit • Safety and clean loss record justified referral</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">CUO Authority Sign-Off</div>
          <div class="summary-field-val text-success font-bold">APPROVED by Marcus Vance (Chief Underwriting Officer)</div>
        </div>
      </div>
    </div>

    <!-- STEP 6: RATING ENGINE & ACTUARIAL PAYLOAD -->
    <div class="summary-step-card" data-step-card="step6">
      <div class="summary-step-header">
        <div class="summary-step-title-box">
          <span class="summary-step-badge">6</span>
          <div>
            <div class="summary-step-title">Step 6: Actuarial Rating Engine & Multi-Line Pricing Payload</div>
            <div class="summary-step-desc">Automated rating engine calculation, vehicle schedules, driver multipliers, and actuarial payload schema.</div>
          </div>
        </div>
        <span class="badge badge-primary"><i class="ph ph-calculator"></i> Actuarially Rated</span>
      </div>
      <div class="summary-step-grid">
        <div class="summary-field-box">
          <div class="summary-field-label">Rating Model</div>
          <div class="summary-field-val">Composite Transportation Pricing (Units × Radius × Factor)</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Schedules Summary</div>
          <div class="summary-field-val">1 Scheduled Power Unit ($500k Value) • 4 Drivers (3 Active, 1 Excl)</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Liability & PD Premium Subtotals</div>
          <div class="summary-field-val font-mono">Liability: $31,360.00 • Physical Damage: $42,070.00</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Actuarial Payload Schema</div>
          <div class="summary-field-val text-success">Verified Production JSON Payload • Exportable to CSV</div>
        </div>
      </div>
    </div>

    <!-- STEP 7: QUOTE & BINDING PACKET -->
    <div class="summary-step-card" data-step-card="step7">
      <div class="summary-step-header">
        <div class="summary-step-title-box">
          <span class="summary-step-badge">7</span>
          <div>
            <div class="summary-step-title">Step 7: Formal Bindable Quote & Policy Issuance Terms</div>
            <div class="summary-step-desc">Official quote document generation, subjectivity verification, binding studio, and policy packet issuance.</div>
          </div>
        </div>
        <span class="badge badge-success"><i class="ph ph-lock"></i> Bind Ready & Verified</span>
      </div>
      <div class="summary-step-grid">
        <div class="summary-field-box">
          <div class="summary-field-label">Official Quote Document</div>
          <div class="summary-field-val font-mono font-bold text-primary">${sub.quoteNo || 'QT-2026-89412'} (Valid 30 Days)</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Annual Gross Premium</div>
          <div class="summary-field-val text-success font-bold font-mono" style="font-size: 14px;">$48,600.00</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Issuance Recipient Target</div>
          <div class="summary-field-val"><i class="ph ph-paper-plane-tilt text-primary"></i> ${sub.channel === 'direct' ? 'Direct Customer Portal & Insured Email' : 'Producing Broker Agency (' + sub.broker.split(' ')[0] + ')'}</div>
        </div>
        <div class="summary-field-box">
          <div class="summary-field-label">Binding Pass Authority</div>
          <div class="summary-field-val text-success font-bold"><i class="ph ph-file-text"></i> Passed & Authorized by Binding Specialist (Elena Rostova)</div>
        </div>
      </div>
    </div>
  `;
}

function renderStep7InlineSummary(sub) {
  const container = document.getElementById("step7InlineSummaryContainer");
  if (!container) return;
  if (!sub) sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];

  container.innerHTML = `
    <!-- Top Metadata Account Strip -->
    <div class="summary-account-strip mb-3">
      <div class="summary-strip-item">
        <span class="summary-strip-label">Named Insured</span>
        <span class="summary-strip-val" title="${sub.insured}">${sub.insured}</span>
      </div>
      <div class="summary-strip-item">
        <span class="summary-strip-label">Submission ID</span>
        <span class="summary-strip-val font-mono">${sub.id}</span>
      </div>
      <div class="summary-strip-item">
        <span class="summary-strip-label">Quote Number</span>
        <span class="summary-strip-val font-mono text-primary">${sub.quoteNo || 'QT-2026-89412'}</span>
      </div>
      <div class="summary-strip-item">
        <span class="summary-strip-label">FEIN</span>
        <span class="summary-strip-val font-mono">${sub.fein}</span>
      </div>
      <div class="summary-strip-item">
        <span class="summary-strip-label">Line of Business</span>
        <span class="summary-strip-val">${sub.lobName}</span>
      </div>
      <div class="summary-strip-item">
        <span class="summary-strip-label">Producing Broker</span>
        <span class="summary-strip-val" title="${sub.broker}">${sub.broker.split(' ')[0]}</span>
      </div>
      <div class="summary-strip-item">
        <span class="summary-strip-label">Assigned Desk / UW</span>
        <span class="summary-strip-val">${sub.underwriter ? sub.underwriter.split(' ')[0] : 'Open Queue'}</span>
      </div>
      <div class="summary-strip-item">
        <span class="summary-strip-label">Gross Premium</span>
        <span class="summary-strip-val text-success font-bold">$48,600.00</span>
      </div>
    </div>

    <!-- 7 Lifecycle Step Cards Container -->
    <div class="summary-cards-list">
      <!-- STEP 1: DOC INGESTION & SCHEMA / OCR -->
      <div class="summary-step-card" data-step-card="step1">
        <div class="summary-step-header">
          <div class="summary-step-title-box">
            <span class="summary-step-badge">1</span>
            <div>
              <div class="summary-step-title">Step 1: Document Ingestion & Optical Character Recognition (OCR)</div>
              <div class="summary-step-desc">Document ingestion pipeline, file validation, OCR parsing, and canonical entity schema creation.</div>
            </div>
          </div>
          <span class="badge badge-success"><i class="ph ph-check-circle"></i> 99.4% OCR Confidence</span>
        </div>
        <div class="summary-step-grid">
          <div class="summary-field-box">
            <div class="summary-field-label">Ingested Files (${(sub.docs || []).length})</div>
            <div class="summary-field-val">${(sub.docs || []).map(d => d.name).join(', ')}</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Entity Type & Structure</div>
            <div class="summary-field-val">${sub.entityType || 'Commercial LLC'} • DOT: 3948102</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Operating Address</div>
            <div class="summary-field-val">${sub.address || '10440 Highway 290 West, Houston, TX 77040'}</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Effective Term</div>
            <div class="summary-field-val">${sub.effectiveDate || '09/01/2026'} to 09/01/2027 (12 Mo)</div>
          </div>
        </div>
      </div>

      <!-- STEP 2: CLEARANCE & APPETITE CHECK -->
      <div class="summary-step-card" data-step-card="step2">
        <div class="summary-step-header">
          <div class="summary-step-title-box">
            <span class="summary-step-badge">2</span>
            <div>
              <div class="summary-step-title">Step 2: FEIN Clearance & Appetite Knockout Screening</div>
              <div class="summary-step-desc">Duplicate FEIN broker of record lock check, carrier appetite rules validation, and knockout verification.</div>
            </div>
          </div>
          <span class="badge badge-success"><i class="ph ph-shield-check"></i> 10/10 Appetite Rules Passed</span>
        </div>
        <div class="summary-step-grid">
          <div class="summary-field-box">
            <div class="summary-field-label">FEIN Clearance Status</div>
            <div class="summary-field-val text-success">Cleared • FEIN ${sub.fein} Locked to ${sub.broker.split(' ')[0]}</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Commodity & Hazard Eligibility</div>
            <div class="summary-field-val">General Freight / Dry Van (Non-Hazmat) — Eligible</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Operating Radius Guidelines</div>
            <div class="summary-field-val">Regional 450-Mile Radius (Max Allowed 750 Miles) — Passed</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Knockout Checkpoints</div>
            <div class="summary-field-val text-success">0 Violations • No Dual-Broker Conflicts Detected</div>
          </div>
        </div>
      </div>

      <!-- STEP 3: DATA ENRICHMENT & ROUTING -->
      <div class="summary-step-card" data-step-card="step3">
        <div class="summary-step-header">
          <div class="summary-step-title-box">
            <span class="summary-step-badge">3</span>
            <div>
              <div class="summary-step-title">Step 3: Third-Party Data Enrichment & Automated Routing</div>
              <div class="summary-step-desc">External API data enrichment (CAB, SAFER/FMCSA, LexisNexis, ISO) and smart underwriter queue routing.</div>
            </div>
          </div>
          <span class="badge badge-info"><i class="ph ph-tree-structure"></i> Verified Live APIs</span>
        </div>
        <div class="summary-step-grid">
          <div class="summary-field-box">
            <div class="summary-field-label">SAFER / FMCSA Safety Rating</div>
            <div class="summary-field-val">Satisfactory • 0 OOS Violations • Safer Alert: 1.00</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">ISO / CAB Telematics Score</div>
            <div class="summary-field-val">Tier-1 Safety Profile • ISO Class 3 Public Protection</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Assigned Underwriter & Desk</div>
            <div class="summary-field-val">${sub.underwriter || 'Sarah Jenkins'} • ${sub.desk || 'Specialty Transportation Desk'}</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">SLA Target & Priority Score</div>
            <div class="summary-field-val"><span class="badge ${sub.priority === 'P1' ? 'badge-danger' : 'badge-warning'}">${sub.priority} Priority</span> (Score: ${sub.priorityScore || 92}/100)</div>
          </div>
        </div>
      </div>

      <!-- STEP 4: UNDERWRITING WORKBENCH -->
      <div class="summary-step-card" data-step-card="step4">
        <div class="summary-step-header">
          <div class="summary-step-title-box">
            <span class="summary-step-badge">4</span>
            <div>
              <div class="summary-step-title">Step 4: Underwriting Workbench, Loss Runs & Subjectivities</div>
              <div class="summary-step-desc">5-year historical loss triangulation, ACORD application audit, subjectivities tracking, and RFI log.</div>
            </div>
          </div>
          <span class="badge badge-success"><i class="ph ph-chart-line"></i> 14.8% Favorable Loss Ratio</span>
        </div>
        <div class="summary-step-grid">
          <div class="summary-field-box">
            <div class="summary-field-label">5-Year Prior Claims Triangulation</div>
            <div class="summary-field-val">2 Claims • $12,400 Total Incurred • 0 Open Reserves</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Calculated Loss Ratio</div>
            <div class="summary-field-val text-success">14.8% (Carrier Benchmark: &lt; 55.0%) — Highly Favorable</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Active Subjectivities (${(sub.subjectivities || []).length})</div>
            <div class="summary-field-val">MVR driver check, Signed ACORD on file</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">RFI & Broker Communications</div>
            <div class="summary-field-val text-success">All inquiries resolved • No outstanding documentation blocks</div>
          </div>
        </div>
      </div>

      <!-- STEP 5: AUTHORITY DESK & CUO REFERRAL -->
      <div class="summary-step-card" data-step-card="step5">
        <div class="summary-step-header">
          <div class="summary-step-title-box">
            <span class="summary-step-badge">5</span>
            <div>
              <div class="summary-step-title">Step 5: Authority Delegation & CUO Referral Desk</div>
              <div class="summary-step-desc">Underwriting limits verification, Junior-to-Senior escalation workflow, and formal CUO sign-off.</div>
            </div>
          </div>
          <span class="badge badge-success"><i class="ph ph-stamp"></i> Executive CUO Signed Off</span>
        </div>
        <div class="summary-step-grid">
          <div class="summary-field-box">
            <div class="summary-field-label">Total Exposure Value</div>
            <div class="summary-field-val font-mono">${sub.exposure || '$3,200,000 TIV / Fleet'}</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Primary UW Authority Limit</div>
            <div class="summary-field-val">$2,000,000 (Level-2 Sarah Jenkins)</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Escalation Rationale</div>
            <div class="summary-field-val">Exceeds $2.0M limit • Safety and clean loss record justified referral</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">CUO Authority Sign-Off</div>
            <div class="summary-field-val text-success font-bold">APPROVED by Marcus Vance (Chief Underwriting Officer)</div>
          </div>
        </div>
      </div>

      <!-- STEP 6: RATING ENGINE & ACTUARIAL PAYLOAD -->
      <div class="summary-step-card" data-step-card="step6">
        <div class="summary-step-header">
          <div class="summary-step-title-box">
            <span class="summary-step-badge">6</span>
            <div>
              <div class="summary-step-title">Step 6: Actuarial Rating Engine & Multi-Line Pricing Payload</div>
              <div class="summary-step-desc">Automated rating engine calculation, vehicle schedules, driver multipliers, and actuarial payload schema.</div>
            </div>
          </div>
          <span class="badge badge-primary"><i class="ph ph-calculator"></i> Actuarially Rated</span>
        </div>
        <div class="summary-step-grid">
          <div class="summary-field-box">
            <div class="summary-field-label">Rating Model</div>
            <div class="summary-field-val">Composite Transportation Pricing (Units × Radius × Factor)</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Schedules Summary</div>
            <div class="summary-field-val">1 Scheduled Power Unit ($500k Value) • 4 Drivers (3 Active, 1 Excl)</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Liability & PD Premium Subtotals</div>
            <div class="summary-field-val font-mono">Liability: $31,360.00 • Physical Damage: $42,070.00</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Actuarial Payload Schema</div>
            <div class="summary-field-val text-success">Verified Production JSON Payload • Exportable to CSV</div>
          </div>
        </div>
      </div>

      <!-- STEP 7: QUOTE & BINDING PACKET -->
      <div class="summary-step-card" data-step-card="step7">
        <div class="summary-step-header">
          <div class="summary-step-title-box">
            <span class="summary-step-badge">7</span>
            <div>
              <div class="summary-step-title">Step 7: Formal Bindable Quote & Policy Issuance Terms</div>
              <div class="summary-step-desc">Official quote document generation, subjectivity verification, binding studio, and policy packet issuance.</div>
            </div>
          </div>
          <span class="badge badge-success"><i class="ph ph-lock"></i> Bind Ready & Verified</span>
        </div>
        <div class="summary-step-grid">
          <div class="summary-field-box">
            <div class="summary-field-label">Official Quote Document</div>
            <div class="summary-field-val font-mono font-bold text-primary">${sub.quoteNo || 'QT-2026-89412'} (Valid 30 Days)</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Annual Gross Premium</div>
            <div class="summary-field-val text-success font-bold font-mono" style="font-size: 14px;">$48,600.00</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Issuance Recipient Target</div>
            <div class="summary-field-val"><i class="ph ph-paper-plane-tilt text-primary"></i> ${sub.channel === 'direct' ? 'Direct Customer Portal & Insured Email' : 'Producing Broker Agency (' + sub.broker.split(' ')[0] + ')'}</div>
          </div>
          <div class="summary-field-box">
            <div class="summary-field-label">Binding Pass Authority</div>
            <div class="summary-field-val text-success font-bold"><i class="ph ph-file-text"></i> Passed & Authorized by Binding Specialist (Elena Rostova)</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
