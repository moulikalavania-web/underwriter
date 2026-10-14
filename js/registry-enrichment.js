/**
 * ============================================================================
 * SUBMISSION-LEVEL REGISTRY ENRICHMENT (Screen 4 auto-fetch popup)
 * ----------------------------------------------------------------------------
 * Shows the NHTSA / FMCSA / State DMV verification result held on the submission
 * (sub.registryEnrichment) and each vehicle's matched result (vehicle.enrichment).
 * NO REGISTRY IS CONNECTED: nothing here is fetched, and nothing is invented. Earlier
 * versions fabricated results, including VINs and driver licence numbers, which then
 * satisfied the completeness check. Until a registry provider sets those fields, the
 * cards say so and the underwriter verifies the DOT number, VINs and licences with the
 * source and records the outcome in the case notes.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// RENDER — Screen 4 summary card
// ----------------------------------------------------------------------------
function renderRegistryVerificationCard(sub) {
  const box = document.getElementById("screen4RegistryVerificationContainer");
  if (!box || !sub) return;

  const r = sub.registryEnrichment;
  if (!r) {
    box.innerHTML = `
      <div class="card">
        <div class="card-header"><h3><i class="ph ph-database text-primary"></i> Registry Verification</h3></div>
        <div class="card-body">
          <div class="alert alert-warning text-xs"><i class="ph ph-plug"></i> <strong>No registry source is connected.</strong> NHTSA, FMCSA and State DMV results appear here once a data provider is configured. Until then, verify the DOT number, VINs and driver licences with the source and note the result on the case.</div>
        </div>
      </div>`;
    return;
  }

  box.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3><i class="ph ph-database text-primary"></i> Registry Verification</h3>
        <span class="badge badge-success"><i class="ph ph-check"></i> Fetched ${r.fetchedAt}</span>
      </div>
      <div class="card-body">
        <div class="registry-verify-grid">
          <div class="registry-verify-card">
            <div class="title"><i class="ph ph-identification-card text-primary"></i> <strong>NHTSA</strong></div>
            <span class="badge badge-success">${r.nhtsa.status}</span>
            <div class="text-xs text-muted">${r.nhtsa.note}</div>
          </div>
          <div class="registry-verify-card">
            <div class="title"><i class="ph ph-shield-check text-primary"></i> <strong>FMCSA</strong></div>
            <span class="badge badge-success">${r.fmcsa.status}</span>
            <div class="text-xs text-muted">Safety: ${r.fmcsa.safetyPercentile} · OOS Rate: ${r.fmcsa.oosRate} · ${r.fmcsa.inspections} Inspections / ${r.fmcsa.violations} Violations</div>
          </div>
          <div class="registry-verify-card">
            <div class="title"><i class="ph ph-file-text text-primary"></i> <strong>State DMV</strong> (${r.dmv.state})</div>
            <span class="badge badge-success">${r.dmv.status}</span>
            <div class="text-xs text-muted">${r.dmv.note}</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------------
// RENDER — Driver License Verification (Screen 4). Pulls DL number, state,
// class & experience straight from sub.drivers (captured from the ingested
// email/JSON — see extractDriverDetails in email-intake-ingestion.js) so it
// carries the same DL numbers the underwriter sees on the Workbench, just
// surfaced earlier in the flow. Status reflects whether the State DMV
// registry check has run yet for this submission.
// ----------------------------------------------------------------------------
function renderDriverLicenseVerification(sub) {
  const box = document.getElementById("screen4DriverLicenseContainer");
  if (!box || !sub) return;

  const drivers = sub.drivers || [];
  if (!drivers.length) {
    box.innerHTML = `
      <div class="card">
        <div class="card-header"><h3><i class="ph ph-id-card text-primary"></i> Driver License Verification</h3></div>
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon"><i class="ph ph-id-card"></i></div>
            <div class="empty-state-title">No Drivers on This Submission</div>
            <div class="empty-state-body">Ingest an Email or Submission JSON with driver details to enable DL / State DMV verification.</div>
          </div>
        </div>
      </div>`;
    return;
  }

  const dmvChecked = !!sub.registryEnrichment;
  const NP = '<span class="text-muted">—</span>';

  const rows = drivers.map((d, idx) => {
    const name = [d.given_name, d.last_name].filter(Boolean).join(" ") || d.name || '<span class="text-muted">Name not in the documents</span>';
    const hasDl = !!d.licenseNumber;
    const statusBadge = !hasDl
      ? `<span class="badge badge-light">No DL Number</span>`
      : dmvChecked
        ? `<span class="badge badge-success"><i class="ph ph-check"></i> Verified</span>`
        : `<span class="badge badge-warning">Not verified (no registry connected)</span>`;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${name}</strong></td>
        <td class="font-mono">${hasDl ? d.licenseNumber : NP}</td>
        <td>${d.licensestate || NP}</td>
        <td>${d.licenseclasstype || NP}</td>
        <td>${d.experience || NP}</td>
        <td>${statusBadge}</td>
      </tr>`;
  }).join("");

  box.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3><i class="ph ph-id-card text-primary"></i> Driver License Verification</h3>
        <span class="text-xs text-muted">DL number &amp; licence details captured from the submission. Verification needs a State DMV source, which is not connected.</span>
      </div>
      <div class="card-body">
        <table class="data-table">
          <thead>
            <tr><th>#</th><th>Driver</th><th>DL Number</th><th>State</th><th>Class</th><th>Experience</th><th>Status</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

window.renderDriverLicenseVerification = renderDriverLicenseVerification;
window.applyAutoDriverLicenseVerification = applyAutoDriverLicenseVerification;
window.runSubmissionRegistryFetch = runSubmissionRegistryFetch;
window.renderRegistryVerificationCard = renderRegistryVerificationCard;
