/**
 * ============================================================================
 * VEHICLE DATA ENRICHMENT (Screen 4 add-on)
 * ----------------------------------------------------------------------------
 * Flow: the automatic registry fetch (js/registry-enrichment.js) that runs
 * when Data Enrichment & Smart Routing opens builds each vehicle's
 * NHTSA / FMCSA / State DMV result (v.enrichment) directly from the fetched
 * registry data, matched by VIN (synthesized when the ingested submission
 * didn't provide one, so every vehicle always gets a result). There is no
 * manual document import/search step, and every field here is read-only;
 * this file only renders that result and lets the underwriter reconcile
 * conflicts and apply verified data onto the vehicle record.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// RECONCILIATION — never silently overwrite; flag matches vs conflicts.
// Only runs when NHTSA data was actually found for this VIN.
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

// Confidence = how many of the 3 sources actually had data for this VIN —
// an honest measure of "how much of this vehicle's data was actually
// found," not a fabricated field-accuracy score.
function computeConfidence(nhtsaMatched, fmcsaMatched, dmvMatched) {
  const matched = [nhtsaMatched, fmcsaMatched, dmvMatched].filter(Boolean).length;
  return Math.round((matched / 3) * 100);
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

  const fetched = !!sub.registryEnrichment;
  const vehicleRows = vehicles.map((v, idx) => {
    const label = [v.year, v.make, v.model].filter(Boolean).join(" ") || `Unit ${idx + 1}`;
    const result = v.enrichment;
    let confBadge = `<span class="badge badge-light">${fetched ? 'No Match Found' : 'Awaiting Registry Fetch'}</span>`;
    if (result) {
      confBadge = result.confidence > 0
        ? `<span class="badge ${result.confidence >= 66 ? 'badge-success' : 'badge-warning'}">🟢 ${result.confidence}%</span>`
        : `<span class="badge badge-danger">No Match Found</span>`;
    }
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${label}</strong>${v.vehicle_type ? `<div class="text-xs text-muted">${v.vehicle_type}</div>` : ""}</td>
        <td>${v.plate || '<span class="text-muted">Not Provided</span>'}</td>
        <td>${v.plateState || '<span class="text-muted">Not Provided</span>'}</td>
        <td class="font-mono">${v.vin || '<span class="text-muted">Not Provided</span>'}</td>
        <td>${confBadge}</td>
        <td>
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
        <span class="text-xs text-muted">Matched automatically by VIN when Registry Verification runs — nothing to import or search manually.</span>
      </div>
      <div class="card-body">
        <table class="data-table">
          <thead>
            <tr>
              <th>Unit</th><th>Vehicle</th><th>License Plate</th><th>State</th><th>VIN</th><th>Enrichment</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${vehicleRows}</tbody>
        </table>
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
  const noMatchBox = (label) => `<div class="text-xs text-muted" style="padding:10px 0;"><i class="ph ph-magnifying-glass-minus"></i> No Match Found — no ${label} record for VIN <strong>${vehicle.vin || "(none entered)"}</strong> in this fetch.</div>`;

  return `
    <div class="enrich-detail-panel">
      <div class="enrich-confidence-row">
        <div class="enrich-confidence-num" style="color:${confidence >= 66 ? '#166534' : (confidence > 0 ? '#B45309' : '#B91C1C')};">${confidence}%</div>
        <div>
          <div class="font-bold">${confidence === 100 ? 'All Sources Matched' : (confidence > 0 ? 'Partial Match' : 'No Match Found')}</div>
          <div class="text-xs text-muted">Based on how many of NHTSA / FMCSA / DMV returned data for this VIN.</div>
        </div>
      </div>

      <div class="uwp-subsection-title">Vehicle Identity — Submitted vs. Enriched (NHTSA)</div>
      ${nhtsa ? `
      <table class="data-table">
        <thead><tr><th>Field</th><th>Submitted</th><th>Enriched</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          ${reconciliation.map(r => `
            <tr>
              <td>${r.label}</td><td>${r.submitted}</td><td>${r.enriched}</td><td>${nhtsa.source}</td><td>${badgeForStatus(r.status)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      ` : noMatchBox("NHTSA")}

      ${conflictRows.length ? `
        <div class="enrich-conflict-box mt-2">
          <div class="font-bold text-danger"><i class="ph ph-warning"></i> Vehicle Data Conflict</div>
          ${conflictRows.map(r => `<div class="text-xs">${r.label}: Submitted <strong>${r.submitted}</strong> vs Document <strong>${r.enriched}</strong></div>`).join("")}
          <div class="mt-2">
            <button class="btn btn-sm btn-primary" onclick="applyEnrichmentToSubmission('${sub.id}', ${idx}, 'government')">Accept Document Data</button>
            <button class="btn btn-sm btn-outline" onclick="applyEnrichmentToSubmission('${sub.id}', ${idx}, 'submission')">Keep Submission Data</button>
          </div>
        </div>
      ` : ""}

      <div class="uwp-subsection-title mt-3">Commercial Safety & Inspection — FMCSA</div>
      ${fmcsa ? `
      <div class="enrich-kv-grid">
        <div><span class="text-xs text-muted">USDOT Number</span><div class="font-bold">${fmcsa.usdot || "—"}</div></div>
        <div><span class="text-xs text-muted">Inspections</span><div class="font-bold">${fmcsa.inspections !== null ? fmcsa.inspections : "—"}</div></div>
        <div><span class="text-xs text-muted">Violations</span><div class="font-bold">${fmcsa.violations !== null ? fmcsa.violations : "—"}</div></div>
        <div><span class="text-xs text-muted">Out-of-Service</span><div class="font-bold">${fmcsa.oos === null ? "—" : (fmcsa.oos ? "Yes" : "No")}</div></div>
        <div><span class="text-xs text-muted">CVSA Status</span><div class="font-bold">${fmcsa.cvsa_status || "—"}</div></div>
        <div><span class="text-xs text-muted">Last Inspection</span><div class="font-bold">${fmcsa.last_inspection || "—"}</div></div>
      </div>
      ` : noMatchBox("FMCSA")}

      <div class="uwp-subsection-title mt-3">Registration & Title — State DMV${dmv && dmv.state ? ` (${dmv.state})` : ""}</div>
      ${dmv ? `
        <div class="enrich-kv-grid">
          <div><span class="text-xs text-muted">Registration Status</span><div class="font-bold">${dmv.registration_status || "—"}</div></div>
          <div><span class="text-xs text-muted">Registration Expiration</span><div class="font-bold">${dmv.registration_expiration || "—"}</div></div>
          <div><span class="text-xs text-muted">Title Status</span><div class="font-bold">${dmv.title_status || "—"}</div></div>
        </div>
      ` : noMatchBox("State DMV")}

      <div class="mt-3">
        <button class="btn btn-primary" onclick="applyEnrichmentToSubmission('${sub.id}', ${idx})" ${(!nhtsa && !fmcsa && !dmv) ? "disabled" : ""}><i class="ph ph-check-circle"></i> Apply Verified Data</button>
        ${vehicle.enrichmentApplied ? `<span class="badge badge-success ml-2"><i class="ph ph-check"></i> Applied — ${vehicle.enrichmentAppliedAt}</span>` : ""}
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
// ACTIONS
// ----------------------------------------------------------------------------
function toggleVehicleEnrichDetail(idx) {
  const row = document.getElementById(`vehEnrichDetailRow_${idx}`);
  if (!row) return;
  row.style.display = row.style.display === "none" ? "" : "none";
}

function applyEnrichmentToSubmission(subId, idx, conflictChoice) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub || !sub.vehicles || !sub.vehicles[idx]) return;
  const v = sub.vehicles[idx];
  const result = v.enrichment;
  if (!result) return;

  const { nhtsa, fmcsa, dmv } = result;
  if (!nhtsa && !fmcsa && !dmv) {
    showToast("⚠️ Nothing to apply — no registry match was found for this VIN.", "warning");
    return;
  }
  const useDocument = conflictChoice !== "submission";

  if (nhtsa && useDocument) {
    if (nhtsa.year) v.year = nhtsa.year;
    if (nhtsa.make) v.make = nhtsa.make;
    if (nhtsa.model) v.model = nhtsa.model;
    if (nhtsa.vehicle_type) v.vehicle_type = nhtsa.vehicle_type;
  }
  if (nhtsa) v.bodyClass = nhtsa.body_class;
  if (fmcsa) {
    v.fmcsaInspections = fmcsa.inspections;
    v.fmcsaViolations = fmcsa.violations;
    v.fmcsaOOS = fmcsa.oos;
    v.fmcsaCvsaStatus = fmcsa.cvsa_status;
  }
  if (dmv) {
    v.registrationStatus = dmv.registration_status;
    v.registrationExpiration = dmv.registration_expiration;
    v.titleStatus = dmv.title_status;
  }
  v.enrichmentApplied = true;
  v.enrichmentAppliedAt = new Date().toLocaleString();
  v.enrichmentAuditTrail = {
    sources: [nhtsa && "NHTSA", fmcsa && "FMCSA", dmv && "State DMV"].filter(Boolean).join(", "),
    retrieved: v.enrichmentAppliedAt,
    updated_by: "System",
    verification: "Registry Verification Match",
  };

  renderVehicleEnrichment(sub);
  if (typeof renderUnderwritingWorkbench === "function") renderUnderwritingWorkbench(sub);
  if (typeof persistAppState === "function") persistAppState();
  showToast(`✅ Verified data applied to ${sub.id} — Unit ${idx + 1}.`, "success");
}

window.reconcileVehicleFields = reconcileVehicleFields;
window.computeConfidence = computeConfidence;
window.renderVehicleEnrichment = renderVehicleEnrichment;
window.toggleVehicleEnrichDetail = toggleVehicleEnrichDetail;
window.applyEnrichmentToSubmission = applyEnrichmentToSubmission;
