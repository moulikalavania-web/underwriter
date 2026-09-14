/**
 * ============================================================================
 * VEHICLE DATA ENRICHMENT (Screen 4 add-on)
 * ----------------------------------------------------------------------------
 * Flow: Input (Plate/State/VIN) -> Enrich -> Compare (Submitted vs Government
 * Source) -> Reconcile Conflicts -> Apply Verified Data to Submission.
 *
 * The three sources (NHTSA / vPIC, FMCSA, State DMV) are simulated here since
 * this is a browser-only prototype with no live government API access — but
 * the simulation is deterministic (seeded from the VIN/Plate the underwriter
 * enters) and always starts from whatever the submission itself already has
 * (drivers/vehicles/DOT from the ingested Email/JSON). Nothing about the
 * underlying submission data model is touched until the underwriter clicks
 * "Apply Verified Data".
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// Deterministic pseudo-random helpers (seeded — same input always -> same
// simulated result, so re-opening a case doesn't reshuffle "verified" data).
// ----------------------------------------------------------------------------
function vinSeedNumber(seedStr) {
  let h = 0;
  const s = String(seedStr || "SEED");
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return h;
}
function seededPick(seedStr, arr) {
  return arr[vinSeedNumber(seedStr) % arr.length];
}
function seededRange(seedStr, min, max) {
  return min + (vinSeedNumber(seedStr) % (max - min + 1));
}
function seededVin(seedStr) {
  const chars = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  let out = "";
  const n = vinSeedNumber(seedStr);
  for (let i = 0; i < 17; i++) {
    out += chars[(n * (i + 7) + i * 13) % chars.length];
  }
  return out;
}

// ----------------------------------------------------------------------------
// SIMULATED SOURCE LOOKUPS
// ----------------------------------------------------------------------------
function simulateNHTSA(vehicle, vinInput) {
  const seed = vinInput || `${vehicle.year || ""}-${vehicle.make || ""}-${vehicle.model || ""}-${vehicle.id || ""}`;
  const vin = vinInput || seededVin(seed);
  const bodyClassOptions = ["Cargo Van", "Box Truck", "Straight Truck", "Truck Tractor", "Pickup", "Van"];
  const inferredType = vehicle.vehicle_type || seededPick(seed, bodyClassOptions);
  return {
    source: "NHTSA",
    vin,
    year: vehicle.year || null,
    make: vehicle.make || null,
    model: vehicle.model || null,
    vehicle_type: inferredType,
    body_class: inferredType,
  };
}

function simulateFMCSA(sub, vehicle, plate, plateState) {
  const seed = `${sub.dot || sub.id}-${plate || vehicle.id}`;
  const inspections = seededRange(seed, 1, 6);
  const violations = seededRange(seed + "v", 0, 2);
  const oos = violations >= 2;
  const lastInspDaysAgo = seededRange(seed + "d", 5, 400);
  const lastInspDate = new Date(Date.now() - lastInspDaysAgo * 86400000);
  const history = [];
  for (let i = 0; i < inspections; i++) {
    const d = new Date(lastInspDate.getTime() - i * seededRange(seed + "h" + i, 40, 130) * 86400000);
    history.push({
      date: d.toLocaleDateString(),
      level: seededPick(seed + "l" + i, ["Level I", "Level II", "Level III"]),
      violations: i === 0 ? violations : seededRange(seed + "hv" + i, 0, 1),
      oos: i === 0 ? oos : false,
    });
  }
  return {
    source: "FMCSA",
    usdot: sub.dot || null,
    vehicle_type: vehicle.vehicle_type || null,
    plate: plate || null,
    plate_state: plateState || null,
    inspections,
    violations,
    oos,
    cvsa_status: oos ? "Flagged" : "Valid",
    last_inspection: lastInspDate.toLocaleDateString(),
    history,
  };
}

function simulateDMV(plate, plateState) {
  if (!plate || !plateState) return null;
  const seed = `${plate}-${plateState}`;
  const expDaysOut = seededRange(seed + "e", 30, 400);
  const expDate = new Date(Date.now() + expDaysOut * 86400000);
  return {
    source: "State DMV",
    state: plateState,
    registration_status: seededPick(seed, ["Active", "Active", "Active", "Expired"]),
    registration_expiration: expDate.toLocaleDateString(),
    title_status: seededPick(seed + "t", ["Valid", "Valid", "Lien Recorded"]),
    lien_recorded: seededPick(seed + "t", ["Valid", "Valid", "Lien Recorded"]) === "Lien Recorded",
    owner_restricted: true,
  };
}

// ----------------------------------------------------------------------------
// RECONCILIATION — never silently overwrite; flag matches vs conflicts.
// ----------------------------------------------------------------------------
function reconcileVehicleFields(vehicle, nhtsa) {
  const rows = [];
  const fieldDefs = [
    { key: "year", label: "Year" },
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
    { key: "vehicle_type", label: "Vehicle Type" },
  ];
  fieldDefs.forEach(f => {
    const submitted = vehicle[f.key];
    const enriched = nhtsa[f.key];
    let status;
    if (submitted === undefined || submitted === null || submitted === "") status = "enriched";
    else if (enriched === undefined || enriched === null) status = "submitted";
    else if (String(submitted).trim().toLowerCase() === String(enriched).trim().toLowerCase()) status = "verified";
    else status = "conflict";
    rows.push({ label: f.label, submitted: submitted || "—", enriched: enriched || "—", status });
  });
  rows.push({ label: "VIN", submitted: vehicle.vin || "—", enriched: nhtsa.vin, status: vehicle.vin ? "verified" : "enriched" });
  rows.push({ label: "Body Class", submitted: "—", enriched: nhtsa.body_class, status: "enriched" });
  return rows;
}

function computeConfidence(rows) {
  const scored = rows.filter(r => r.status !== "submitted");
  if (!scored.length) return 100;
  const ok = scored.filter(r => r.status === "verified" || r.status === "enriched").length;
  return Math.round((ok / scored.length) * 100);
}

// ----------------------------------------------------------------------------
// RENDER — Screen 4 "Vehicle Data Enrichment" section
// ----------------------------------------------------------------------------
function renderVehicleEnrichment(sub) {
  const box = document.getElementById("screen4VehicleEnrichmentContainer");
  if (!box || !sub) return;

  const vehicles = sub.vehicles || [];

  if (!vehicles.length) {
    box.innerHTML = `
      <div class="card mt-4">
        <div class="card-header"><h3><i class="ph ph-truck text-primary"></i> Vehicle Data Enrichment</h3></div>
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon"><i class="ph ph-truck"></i></div>
            <div class="empty-state-title">No Vehicles on This Submission</div>
            <div class="empty-state-body">Ingest an Email or Submission JSON with a vehicle schedule to enable NHTSA / FMCSA / DMV enrichment.</div>
          </div>
        </div>
      </div>`;
    return;
  }

  const anyEnriched = vehicles.some(v => v.enrichment);
  const nhtsaStatus = anyEnriched ? "Enriched" : "Ready";
  const fmcsaStatus = anyEnriched ? "Enriched" : "Ready";
  const dmvHasAuth = vehicles.some(v => v.plate && v.plateState);
  const dmvStatus = anyEnriched ? "Enriched" : (dmvHasAuth ? "Ready" : "Authorization Required");

  const sourceCard = (icon, title, purpose, status) => {
    const cls = status === "Enriched" ? "badge-success" : (status === "Authorization Required" ? "badge-warning" : "badge-light");
    const dot = status === "Enriched" ? "🟢" : (status === "Authorization Required" ? "🟡" : "⚪");
    return `
      <div class="enrich-source-card">
        <div class="enrich-card-header">
          <span class="title"><i class="ph ${icon} text-primary"></i> ${title}</span>
          <span class="badge ${cls}">${dot} ${status}</span>
        </div>
        <div class="text-xs text-muted">${purpose}</div>
      </div>`;
  };

  const vehicleRows = vehicles.map((v, idx) => {
    const label = [v.year, v.make, v.model].filter(Boolean).join(" ") || `Unit ${idx + 1}`;
    const result = v.enrichment;
    const confBadge = result
      ? `<span class="badge ${result.confidence >= 90 ? 'badge-success' : 'badge-warning'}">🟢 ${result.confidence}%</span>`
      : `<span class="badge badge-light">Not Enriched</span>`;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${label}</strong>${v.vehicle_type ? `<div class="text-xs text-muted">${v.vehicle_type}</div>` : ""}</td>
        <td>
          <input type="text" class="form-control form-control-sm" style="max-width:130px;" placeholder="TX-ABC123"
            id="vehPlateInput_${idx}" value="${v.plate || ""}" onchange="onVehicleEnrichInputChange(${idx})">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" style="max-width:70px;" placeholder="TX" maxlength="2"
            id="vehPlateStateInput_${idx}" value="${v.plateState || ""}" onchange="onVehicleEnrichInputChange(${idx})">
        </td>
        <td>
          <input type="text" class="form-control form-control-sm" style="max-width:170px;" placeholder="Auto-detected / Enter VIN"
            id="vehVinInput_${idx}" value="${v.vin || ""}" onchange="onVehicleEnrichInputChange(${idx})">
        </td>
        <td>${confBadge}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="enrichVehicle('${sub.id}', ${idx})"><i class="ph ph-sparkle"></i> Enrich</button>
          ${result ? `<button class="btn btn-sm btn-outline" onclick="toggleVehicleEnrichDetail(${idx})"><i class="ph ph-eye"></i> View</button>` : ""}
        </td>
      </tr>
      <tr id="vehEnrichDetailRow_${idx}" style="display:none;">
        <td colspan="7">${result ? renderVehicleEnrichDetail(sub, v, idx, result) : ""}</td>
      </tr>`;
  }).join("");

  box.innerHTML = `
    <div class="card mt-4">
      <div class="card-header">
        <h3><i class="ph ph-truck text-primary"></i> Vehicle Data Enrichment</h3>
        <span class="text-xs text-muted">Automatically enrich submission vehicles using trusted external and government sources.</span>
      </div>
      <div class="card-body">
        <div class="enrich-source-status-grid mb-3">
          ${sourceCard("ph-identification-card", "NHTSA / vPIC", "Vehicle specifications", nhtsaStatus)}
          ${sourceCard("ph-shield-check", "FMCSA", "Commercial vehicle safety & inspection", fmcsaStatus)}
          ${sourceCard("ph-file-text", "State DMV", "Registration & title", dmvStatus)}
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Unit</th><th>Vehicle</th><th>License Plate</th><th>State</th><th>VIN</th><th>Enrichment</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${vehicleRows}</tbody>
        </table>

        <div class="mt-3">
          <button class="btn btn-secondary" onclick="enrichAllVehicles('${sub.id}')"><i class="ph ph-sparkle"></i> Enrich All Vehicles</button>
        </div>
      </div>
    </div>`;
}

function renderVehicleEnrichDetail(sub, vehicle, idx, result) {
  const { nhtsa, fmcsa, dmv, reconciliation, confidence } = result;

  const badgeForStatus = (status) => {
    if (status === "verified") return `<span class="badge badge-success">Verified</span>`;
    if (status === "conflict") return `<span class="badge badge-danger">Conflict</span>`;
    if (status === "enriched") return `<span class="badge badge-info">Enriched</span>`;
    return `<span class="badge badge-light">Submitted</span>`;
  };

  const conflictRows = reconciliation.filter(r => r.status === "conflict");

  const historyRows = fmcsa.history.map(h => `
    <tr>
      <td>${h.date}</td><td>${h.level}</td><td>${h.violations}</td>
      <td>${h.oos ? '<span class="badge badge-danger">Yes</span>' : '<span class="badge badge-success">No</span>'}</td>
    </tr>`).join("");

  return `
    <div class="enrich-detail-panel">
      <div class="enrich-confidence-row">
        <div class="enrich-confidence-num" style="color:${confidence >= 90 ? '#166534' : '#B91C1C'};">${confidence}%</div>
        <div>
          <div class="font-bold">${confidence >= 90 ? 'High Confidence' : 'Review Required'}</div>
          <div class="text-xs text-muted">Based on NHTSA / FMCSA / DMV field matches against submitted data.</div>
        </div>
      </div>

      <div class="uwp-subsection-title">Vehicle Identity — Submitted vs. Enriched (NHTSA)</div>
      <table class="data-table">
        <thead><tr><th>Field</th><th>Submitted</th><th>Enriched</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          ${reconciliation.map(r => `
            <tr>
              <td>${r.label}</td><td>${r.submitted}</td><td>${r.enriched}</td><td>${nhtsa.source}</td><td>${badgeForStatus(r.status)}</td>
            </tr>`).join("")}
        </tbody>
      </table>

      ${conflictRows.length ? `
        <div class="enrich-conflict-box mt-2">
          <div class="font-bold text-danger"><i class="ph ph-warning"></i> Vehicle Data Conflict</div>
          ${conflictRows.map(r => `<div class="text-xs">${r.label}: Submitted <strong>${r.submitted}</strong> vs Government <strong>${r.enriched}</strong></div>`).join("")}
          <div class="mt-2">
            <button class="btn btn-sm btn-primary" onclick="applyEnrichmentToSubmission('${sub.id}', ${idx}, 'government')">Accept Government Data</button>
            <button class="btn btn-sm btn-outline" onclick="applyEnrichmentToSubmission('${sub.id}', ${idx}, 'submission')">Keep Submission Data</button>
          </div>
        </div>
      ` : ""}

      <div class="uwp-subsection-title mt-3">Commercial Safety & Inspection — FMCSA</div>
      <div class="enrich-kv-grid">
        <div><span class="text-xs text-muted">USDOT Number</span><div class="font-bold">${fmcsa.usdot || "—"}</div></div>
        <div><span class="text-xs text-muted">Vehicle Type</span><div class="font-bold">${fmcsa.vehicle_type || "—"}</div></div>
        <div><span class="text-xs text-muted">License Plate</span><div class="font-bold">${fmcsa.plate ? `${fmcsa.plate_state}-${fmcsa.plate}` : "—"}</div></div>
        <div><span class="text-xs text-muted">Inspections</span><div class="font-bold">${fmcsa.inspections}</div></div>
        <div><span class="text-xs text-muted">Violations</span><div class="font-bold">${fmcsa.violations}</div></div>
        <div><span class="text-xs text-muted">Out-of-Service</span><div class="font-bold">${fmcsa.oos ? "Yes" : "No"}</div></div>
        <div><span class="text-xs text-muted">CVSA Status</span><div class="font-bold">${fmcsa.cvsa_status}</div></div>
        <div><span class="text-xs text-muted">Last Inspection</span><div class="font-bold">${fmcsa.last_inspection}</div></div>
      </div>
      <button class="btn btn-sm btn-ghost mt-2" onclick="toggleFmcsaHistory(${idx})"><i class="ph ph-caret-down"></i> View Inspection History</button>
      <table class="data-table mt-2" id="fmcsaHistoryTable_${idx}" style="display:none;">
        <thead><tr><th>Date</th><th>Inspection</th><th>Violations</th><th>OOS</th></tr></thead>
        <tbody>${historyRows}</tbody>
      </table>

      <div class="uwp-subsection-title mt-3">Registration & Title — State DMV${dmv ? ` (${dmv.state})` : ""}</div>
      ${dmv ? `
        <div class="enrich-kv-grid">
          <div><span class="text-xs text-muted">Registration Status</span><div class="font-bold">${dmv.registration_status}</div></div>
          <div><span class="text-xs text-muted">Registration Expiration</span><div class="font-bold">${dmv.registration_expiration}</div></div>
          <div><span class="text-xs text-muted">Title Status</span><div class="font-bold">${dmv.title_status}</div></div>
          <div><span class="text-xs text-muted">Lien Recorded</span><div class="font-bold">${dmv.lien_recorded ? "Yes" : "No"}</div></div>
        </div>
        <div class="enrich-restricted-box mt-2">
          <i class="ph ph-lock-key"></i> <strong>Owner Information</strong> — Restricted Government Data. Available only with permitted use / authorization.
        </div>
      ` : `<div class="text-xs text-muted">Enter a License Plate + State above to check DMV registration & title.</div>`}

      <div class="mt-3">
        <button class="btn btn-primary" onclick="applyEnrichmentToSubmission('${sub.id}', ${idx})"><i class="ph ph-check-circle"></i> Apply Verified Data</button>
        ${vehicle.enrichmentApplied ? `<span class="badge badge-success ml-2"><i class="ph ph-check"></i> Applied — ${vehicle.enrichmentAppliedAt}</span>` : ""}
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
// ACTIONS
// ----------------------------------------------------------------------------
function onVehicleEnrichInputChange(idx) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
  if (!sub || !sub.vehicles || !sub.vehicles[idx]) return;
  const v = sub.vehicles[idx];
  const plateEl = document.getElementById(`vehPlateInput_${idx}`);
  const stateEl = document.getElementById(`vehPlateStateInput_${idx}`);
  const vinEl = document.getElementById(`vehVinInput_${idx}`);
  if (plateEl) v.plate = plateEl.value.trim();
  if (stateEl) v.plateState = stateEl.value.trim().toUpperCase();
  if (vinEl) v.vin = vinEl.value.trim();
  if (typeof persistAppState === "function") persistAppState();
}

function enrichVehicle(subId, idx) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.vehicles || !sub.vehicles[idx]) return;
  const v = sub.vehicles[idx];
  onVehicleEnrichInputChange(idx);

  const btnRow = document.getElementById(`vehEnrichDetailRow_${idx}`);
  if (btnRow) {
    btnRow.style.display = "";
    btnRow.querySelector("td").innerHTML = `
      <div class="enrich-loading-box">
        <div class="font-bold mb-2"><i class="ph ph-circle-notch ph-spin"></i> Enriching Vehicle Data...</div>
        <div class="text-xs text-success">✓ Identifying vehicle</div>
        <div class="text-xs text-success">✓ Checking NHTSA</div>
        <div class="text-xs text-success">✓ Checking FMCSA</div>
        <div class="text-xs text-success">${v.plate && v.plateState ? `✓ Checking ${v.plateState} DMV` : "○ DMV skipped — no plate/state provided"}</div>
      </div>`;
  }

  setTimeout(() => {
    const nhtsa = simulateNHTSA(v, v.vin);
    const fmcsa = simulateFMCSA(sub, v, v.plate, v.plateState);
    const dmv = simulateDMV(v.plate, v.plateState);
    const reconciliation = reconcileVehicleFields(v, nhtsa);
    const confidence = computeConfidence(reconciliation);

    v.enrichment = { nhtsa, fmcsa, dmv, reconciliation, confidence };
    if (!v.vin) v.vin = nhtsa.vin;

    renderVehicleEnrichment(sub);
    const row = document.getElementById(`vehEnrichDetailRow_${idx}`);
    if (row) row.style.display = "";
    if (typeof persistAppState === "function") persistAppState();
    showToast(`✅ Vehicle enrichment complete — ${confidence}% confidence.`, confidence >= 90 ? "success" : "warning");
  }, 500);
}

function enrichAllVehicles(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.vehicles) return;
  sub.vehicles.forEach((v, idx) => enrichVehicle(subId, idx));
}

function toggleVehicleEnrichDetail(idx) {
  const row = document.getElementById(`vehEnrichDetailRow_${idx}`);
  if (!row) return;
  row.style.display = row.style.display === "none" ? "" : "none";
}

function toggleFmcsaHistory(idx) {
  const t = document.getElementById(`fmcsaHistoryTable_${idx}`);
  if (!t) return;
  t.style.display = t.style.display === "none" ? "" : "none";
}

function applyEnrichmentToSubmission(subId, idx, conflictChoice) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.vehicles || !sub.vehicles[idx]) return;
  const v = sub.vehicles[idx];
  const result = v.enrichment;
  if (!result) return;

  const { nhtsa, fmcsa, dmv } = result;
  const useGovernment = conflictChoice !== "submission";

  if (useGovernment) {
    if (nhtsa.year) v.year = nhtsa.year;
    if (nhtsa.make) v.make = nhtsa.make;
    if (nhtsa.model) v.model = nhtsa.model;
    if (nhtsa.vehicle_type) v.vehicle_type = nhtsa.vehicle_type;
  }
  v.vin = v.vin || nhtsa.vin;
  v.bodyClass = nhtsa.body_class;
  v.fmcsaInspections = fmcsa.inspections;
  v.fmcsaViolations = fmcsa.violations;
  v.fmcsaOOS = fmcsa.oos;
  v.fmcsaCvsaStatus = fmcsa.cvsa_status;
  if (dmv) {
    v.registrationStatus = dmv.registration_status;
    v.registrationExpiration = dmv.registration_expiration;
    v.titleStatus = dmv.title_status;
  }
  v.enrichmentApplied = true;
  v.enrichmentAppliedAt = new Date().toLocaleString();
  v.enrichmentAuditTrail = {
    source: nhtsa.source,
    retrieved: v.enrichmentAppliedAt,
    updated_by: "System",
    verification: "Government Source",
  };

  renderVehicleEnrichment(sub);
  if (typeof renderUnderwritingWorkbench === "function") renderUnderwritingWorkbench(sub);
  if (typeof persistAppState === "function") persistAppState();
  showToast(`✅ Verified data applied to ${sub.id} — Unit ${idx + 1}.`, "success");
}

window.renderVehicleEnrichment = renderVehicleEnrichment;
window.onVehicleEnrichInputChange = onVehicleEnrichInputChange;
window.enrichVehicle = enrichVehicle;
window.enrichAllVehicles = enrichAllVehicles;
window.toggleVehicleEnrichDetail = toggleVehicleEnrichDetail;
window.toggleFmcsaHistory = toggleFmcsaHistory;
window.applyEnrichmentToSubmission = applyEnrichmentToSubmission;
