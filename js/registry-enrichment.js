/**
 * ============================================================================
 * SUBMISSION-LEVEL REGISTRY ENRICHMENT (Screen 4 auto-fetch popup)
 * ----------------------------------------------------------------------------
 * The first time an underwriter opens Data Enrichment & Smart Routing for a
 * submission, this fires a progress popup that steps through "fetching"
 * NHTSA / FMCSA / State DMV data, then stores a demo registry-verification
 * result on the submission (sub.registryEnrichment) and uses it to build
 * each vehicle's enrichment result automatically, matched by VIN — no
 * manual document import or per-vehicle "Enrich" step. That result is
 * persisted (persistAppState) and rendered both on Screen 4 and later on
 * the Underwriting Workbench (Screen 5), so it carries forward through the
 * rest of the case lifecycle instead of only living on this one screen.
 * This is demo data for the prototype — not a live registry call.
 * ============================================================================
 */

// Deterministic "random" from the submission id so the same submission
// always gets the same demo numbers instead of reshuffling on every visit.
function seededRegistryValue(seed, min, max) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return min + (h % (max - min + 1));
}

function generateDemoRegistryEnrichment(sub) {
  const seed = sub.id || "SUB";
  const vehicleCount = (sub.vehicles || []).length;
  const state = (sub.operationsProfile && sub.operationsProfile.primary_garaging_state)
    || (sub.insuredInfo && sub.insuredInfo.insured_garaging_state)
    || ((sub.drivers && sub.drivers[0]) ? sub.drivers[0].licensestate : null)
    || "TX";

  const oosRate = (seededRegistryValue(seed + "oos", 5, 45) / 10).toFixed(1);
  const inspections = seededRegistryValue(seed + "insp", 8, 40);
  const violations = seededRegistryValue(seed + "viol", 0, 3);
  const safetyPercentile = seededRegistryValue(seed + "safety", 70, 98);

  return {
    fetchedAt: new Date().toLocaleString(),
    nhtsa: {
      status: vehicleCount > 0 ? "Matched" : "No Vehicles On File",
      vehiclesDecoded: vehicleCount,
      note: vehicleCount > 0
        ? `VIN specifications confirmed for ${vehicleCount} scheduled vehicle${vehicleCount === 1 ? "" : "s"}.`
        : "No vehicle schedule to decode yet.",
    },
    fmcsa: {
      status: "Clear",
      safetyPercentile: `${safetyPercentile}th Percentile`,
      oosRate: `${oosRate}%`,
      inspections,
      violations,
      note: "ISS-D Recommendation: PASS",
    },
    dmv: {
      status: "Active",
      state,
      registrationStatus: "Current",
      titleStatus: "Clean Title",
      note: `Registration & title verified with ${state} State DMV.`,
    },
  };
}

// ----------------------------------------------------------------------------
// PER-VEHICLE RESULT — builds each vehicle's NHTSA / FMCSA / State DMV
// result (v.enrichment) directly from the fetched registry data. Uses the
// VIN already on the submission when present; falls back to a deterministic
// synthesized VIN (and writes it onto the vehicle) when the ingested
// email/JSON didn't include one, so every vehicle always gets a result as
// soon as the fetch completes — no document import or manual search step,
// and nothing left showing "Awaiting Registry Fetch" forever.
// reconcileVehicleFields/computeConfidence come from js/vehicle-enrichment.js.
// ----------------------------------------------------------------------------
function applyAutoVehicleEnrichment(sub, registryData) {
  const vehicles = sub.vehicles || [];

  vehicles.forEach((v, idx) => {
    if (!v.vin) {
      v.vin = `1VIN${seededRegistryValue(`${sub.id}-veh${idx}`, 100000000, 999999999)}`;
    }
    const vin = v.vin.toUpperCase();

    const nhtsa = {
      source: "NHTSA",
      vin,
      year: v.year || null,
      make: v.make || null,
      model: v.model || null,
      vehicle_type: v.vehicle_type || null,
      body_class: v.vehicle_type || null,
    };

    const expYear = new Date().getFullYear() + 1;
    const fmcsa = {
      source: "FMCSA",
      vin,
      usdot: `USDOT-${seededRegistryValue(vin + "dot", 100000, 999999)}`,
      inspections: registryData.fmcsa.inspections,
      violations: registryData.fmcsa.violations,
      oos: registryData.fmcsa.violations > 1,
      cvsa_status: registryData.fmcsa.violations > 1 ? "Flagged" : "Clear",
      last_inspection: registryData.fetchedAt,
    };

    const dmv = {
      source: "State DMV",
      vin,
      state: registryData.dmv.state,
      registration_status: registryData.dmv.registrationStatus,
      registration_expiration: `${expYear}-${String(seededRegistryValue(vin + "exp", 1, 12)).padStart(2, "0")}-01`,
      title_status: registryData.dmv.titleStatus,
    };

    const reconciliation = reconcileVehicleFields(v, nhtsa);
    const confidence = computeConfidence(true, true, true);

    v.enrichment = { nhtsa, fmcsa, dmv, reconciliation, confidence };
  });
}

// ----------------------------------------------------------------------------
// DRIVER LICENSE VERIFICATION — fills in any DL number/state/class/
// experience the ingested email/JSON didn't provide, same deterministic-seed
// approach as the vehicle VIN fallback above, so Driver License Verification
// always shows a result instead of leaving a driver on "No DL Number".
// ----------------------------------------------------------------------------
function applyAutoDriverLicenseVerification(sub) {
  const drivers = sub.drivers || [];
  const fallbackState = (sub.operationsProfile && sub.operationsProfile.primary_garaging_state)
    || (sub.insuredInfo && sub.insuredInfo.insured_garaging_state)
    || "TX";

  drivers.forEach((d, idx) => {
    const seed = `${sub.id}-drv${idx}`;
    if (!d.licenseNumber) {
      d.licenseNumber = `${(d.licensestate || fallbackState)}-DL-${seededRegistryValue(seed + "dl", 10000000, 99999999)}`;
    }
    if (!d.licensestate) d.licensestate = fallbackState;
    if (!d.licenseclasstype) d.licenseclasstype = "Class A";
    if (!d.experience) d.experience = `${seededRegistryValue(seed + "exp", 2, 10)} Years`;
  });
}

// ----------------------------------------------------------------------------
// POPUP — steps through the three sources, then applies the result.
// ----------------------------------------------------------------------------
function runSubmissionRegistryFetch(sub) {
  if (!sub || sub.registryEnrichment) return;

  const modal = document.getElementById("registryFetchModal");
  const fill = document.getElementById("registryFetchProgressFill");
  const rows = {
    nhtsa: document.getElementById("registryFetchRow_nhtsa"),
    fmcsa: document.getElementById("registryFetchRow_fmcsa"),
    dmv: document.getElementById("registryFetchRow_dmv"),
  };
  if (!modal) return;

  Object.values(rows).forEach(r => {
    if (!r) return;
    r.classList.remove("is-done");
    r.querySelector(".registry-fetch-status").innerHTML = `<i class="ph ph-circle"></i>`;
  });
  rows.nhtsa.querySelector(".registry-fetch-status").innerHTML = `<i class="ph ph-circle-notch ph-spin"></i>`;
  if (fill) fill.style.width = "0%";
  modal.style.display = "flex";

  const markDone = (key, nextKey, pct) => {
    const row = rows[key];
    if (row) {
      row.classList.add("is-done");
      row.querySelector(".registry-fetch-status").innerHTML = `<i class="ph ph-check-circle-fill"></i>`;
    }
    if (fill) fill.style.width = `${pct}%`;
    if (nextKey && rows[nextKey]) rows[nextKey].querySelector(".registry-fetch-status").innerHTML = `<i class="ph ph-circle-notch ph-spin"></i>`;
  };

  setTimeout(() => markDone("nhtsa", "fmcsa", 33), 700);
  setTimeout(() => markDone("fmcsa", "dmv", 66), 1500);
  setTimeout(() => {
    markDone("dmv", null, 100);
    setTimeout(() => {
      modal.style.display = "none";
      sub.registryEnrichment = generateDemoRegistryEnrichment(sub);
      applyAutoVehicleEnrichment(sub, sub.registryEnrichment);
      applyAutoDriverLicenseVerification(sub);
      if (typeof persistAppState === "function") persistAppState();
      renderRegistryVerificationCard(sub);
      renderWbRegistryVerification(sub);
      renderDriverLicenseVerification(sub);
      if (typeof renderVehicleEnrichment === "function") renderVehicleEnrichment(sub);
      if (typeof showToast === "function") {
        showToast("✅ Registry data fetched — NHTSA, FMCSA & State DMV results verified for this submission.", "success");
      }
    }, 400);
  }, 2300);
}

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
          <div class="text-xs text-muted"><i class="ph ph-circle-notch ph-spin"></i> Fetching NHTSA, FMCSA &amp; State DMV data&hellip;</div>
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
// RENDER — Underwriting Workbench (Screen 5) read-only carry-forward view
// ----------------------------------------------------------------------------
function renderWbRegistryVerification(sub) {
  const box = document.getElementById("wbRegistryVerificationContainer");
  if (!box || !sub) return;

  const r = sub.registryEnrichment;
  if (!r) {
    box.innerHTML = `<div class="text-xs text-muted" style="padding:8px 0;">Not yet fetched — open Data Enrichment &amp; Smart Routing to run the registry check.</div>`;
    return;
  }

  box.innerHTML = `
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
    <div class="text-xs text-muted mt-2"><i class="ph ph-arrow-bend-up-left"></i> Fetched ${r.fetchedAt} at Data Enrichment &amp; Smart Routing — carried forward here.</div>`;
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
    const name = [d.given_name, d.last_name].filter(Boolean).join(" ") || `Driver ${idx + 1}`;
    const hasDl = !!d.licenseNumber;
    const statusBadge = !hasDl
      ? `<span class="badge badge-light">No DL Number</span>`
      : dmvChecked
        ? `<span class="badge badge-success"><i class="ph ph-check"></i> Verified</span>`
        : `<span class="badge badge-warning">Pending Registry Check</span>`;
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
        <span class="text-xs text-muted">DL number & license details captured from the submission, checked against State DMV.</span>
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

window.generateDemoRegistryEnrichment = generateDemoRegistryEnrichment;
window.renderDriverLicenseVerification = renderDriverLicenseVerification;
window.applyAutoVehicleEnrichment = applyAutoVehicleEnrichment;
window.applyAutoDriverLicenseVerification = applyAutoDriverLicenseVerification;
window.runSubmissionRegistryFetch = runSubmissionRegistryFetch;
window.renderRegistryVerificationCard = renderRegistryVerificationCard;
window.renderWbRegistryVerification = renderWbRegistryVerification;
