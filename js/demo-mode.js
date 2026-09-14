/**
 * ============================================================================
 * DEMO MODE (Add-On) — TEMPORARY, DISPLAY-ONLY sample fill for presentations.
 * ----------------------------------------------------------------------------
 * The rest of this app follows one hard rule: every value shown must come
 * from the ingested Email/JSON, or it stays blank ("Not Provided"). That
 * rule is NOT changed by this file.
 *
 * Demo Mode is an explicit, reversible, OFF-by-default toggle. When ON, the
 * screens render a throwaway DEEP CLONE of the real submission with sample
 * values dropped into whatever fields are still blank on that clone — the
 * real submission object in SUBMISSIONS_DATASET is never touched, nothing
 * is persisted, and every filled value is visibly tagged "(Demo)" so it can
 * never be mistaken for real ingested data. Turning Demo Mode back off (or
 * reloading the page) instantly restores the honest blank/"Not Provided"
 * view — no data was ever actually written anywhere.
 * ============================================================================
 */

let DEMO_MODE_ENABLED = false;

function toggleDemoMode() {
  DEMO_MODE_ENABLED = !DEMO_MODE_ENABLED;
  const banner = document.getElementById("demoModeBanner");
  const toggleBtn = document.getElementById("demoModeToggleBtn");
  if (banner) banner.style.display = DEMO_MODE_ENABLED ? "flex" : "none";
  if (toggleBtn) {
    toggleBtn.classList.toggle("active", DEMO_MODE_ENABLED);
    toggleBtn.innerHTML = DEMO_MODE_ENABLED
      ? '<i class="ph ph-eye"></i> Demo Fill: ON'
      : '<i class="ph ph-eye-slash"></i> Demo Fill: OFF';
  }
  const sub = (typeof SUBMISSIONS_DATASET !== "undefined" && typeof activeSubmissionId !== "undefined")
    ? SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) : null;
  if (sub && typeof renderAllDownstreamScreens === "function") renderAllDownstreamScreens(sub);
  showToast(
    DEMO_MODE_ENABLED
      ? "🎭 Demo Fill ON — blank fields now show sample values, clearly marked \"(Demo)\". Nothing is saved."
      : "✅ Demo Fill OFF — screens show only real ingested data again.",
    "info"
  );
}
window.toggleDemoMode = toggleDemoMode;

const DEMO_TAG = " (Demo)";

// Deterministic-ish sample pool — picked by a simple seed off the
// submission id so the same submission shows the same demo values on
// every re-render instead of reshuffling.
function demoSeed(str, mod) {
  let h = 0;
  const s = String(str || "seed");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

function setIfBlank(obj, key, value) {
  if (obj[key] === undefined || obj[key] === null || obj[key] === "" || obj[key] === 0) obj[key] = value;
}

function getDemoDisplaySubmission(realSub) {
  if (!realSub) return realSub;
  const sub = JSON.parse(JSON.stringify(realSub)); // throwaway clone — never written back
  const seedBase = sub.id || "demo";
  const pick = (arr, salt) => arr[demoSeed(seedBase + salt, arr.length)];

  // --- Applicant / core identity (only if still pending/blank) ---
  if (!sub.insured || String(sub.insured).includes("Pending")) sub.insured = "Meridian Freight Solutions LLC" + DEMO_TAG;
  if (!sub.fein || String(sub.fein).includes("PENDING")) sub.fein = "47-3391082" + DEMO_TAG;
  setIfBlank(sub, "dot", "3491027" + DEMO_TAG);
  setIfBlank(sub, "mcNumber", "MC-889213" + DEMO_TAG);
  if (!sub.address || String(sub.address).includes("Pending")) sub.address = "4820 Freightline Rd, Columbus, OH 43207" + DEMO_TAG;
  if (!sub.broker || String(sub.broker).includes("Pending")) sub.broker = "Highline Risk Partners" + DEMO_TAG;
  if (!sub.exposureVal) { sub.exposureVal = 2000000; sub.exposure = "$2,000,000" + DEMO_TAG; }

  // --- Policy Information ---
  if (!sub.genInfo) sub.genInfo = {};
  setIfBlank(sub.genInfo, "expiration_date", "09/30/2027" + DEMO_TAG);
  setIfBlank(sub.genInfo, "policytype", "Admitted — Occurrence" + DEMO_TAG);
  sub.expirationDate = sub.expirationDate || sub.genInfo.expiration_date;
  setIfBlank(sub, "program", "Commercial Auto — Regional Fleet Program" + DEMO_TAG);
  setIfBlank(sub, "priorPolicyPeriod", "10/01/2025 – 10/01/2026" + DEMO_TAG);
  setIfBlank(sub, "underwriter", pick(["Sarah Jenkins (Senior Fleet UW)", "Marcus Vance (Senior UW / CUO)"], "uw") + DEMO_TAG);

  // --- Operations Profile / Radius ---
  if (!sub.operationsProfile) sub.operationsProfile = {};
  setIfBlank(sub.operationsProfile, "business_type", "Regional Dry-Van Trucking" + DEMO_TAG);
  setIfBlank(sub.operationsProfile, "years_in_business", 7);
  if (!sub.radiusOfOperationsInfo) sub.radiusOfOperationsInfo = {};
  setIfBlank(sub.radiusOfOperationsInfo, "radius", 450);
  setIfBlank(sub.radiusOfOperationsInfo, "Intrastate_interstate", "Interstate" + DEMO_TAG);

  // --- Coverages, Limits & Deductibles ---
  if (!sub.coveragesInfo) sub.coveragesInfo = {};
  setIfBlank(sub.coveragesInfo, "liability", 1000000);
  setIfBlank(sub.coveragesInfo, "pd_deductible_amount", 2500);
  setIfBlank(sub.coveragesInfo, "pd_high_deductible", 10000);
  setIfBlank(sub.coveragesInfo, "cargo_limit", 100000);
  setIfBlank(sub.coveragesInfo, "towing", 5000);
  setIfBlank(sub.coveragesInfo, "naics_code", "484121");
  setIfBlank(sub.coveragesInfo, "rating_class", "8");
  setIfBlank(sub.coveragesInfo, "rating_type", "Standard Fleet Rating" + DEMO_TAG);

  // --- Operational Profile & Rating Factors add-ons ---
  if (!sub.filingInfo) sub.filingInfo = {};
  setIfBlank(sub.filingInfo, "safer_factor", "0.92");
  setIfBlank(sub.filingInfo, "FMCSA_alert", "1");
  setIfBlank(sub.filingInfo, "uw_credit_debit_factor", "1.05");
  if (!sub.uwReviewInfo) sub.uwReviewInfo = {};
  setIfBlank(sub.uwReviewInfo, "og_driver_count", (sub.drivers || []).length || 2);
  setIfBlank(sub.uwReviewInfo, "cr_driver_count", (sub.drivers || []).length || 2);
  setIfBlank(sub.uwReviewInfo, "al_pollution", "Low");
  setIfBlank(sub.uwReviewInfo, "min_earn_factor", "25");
  if (!sub.commoditiesInfo) sub.commoditiesInfo = {};
  setIfBlank(sub.commoditiesInfo, "secondary_class", "General Freight / Dry Van" + DEMO_TAG);

  // --- Vehicles: per-unit rating/actuarial extras + VIN ---
  (sub.vehicles || []).forEach((v, idx) => {
    setIfBlank(v, "vin", "1FTBW3" + String(1000000 + demoSeed(seedBase + "vin" + idx, 8999999)));
    setIfBlank(v, "model_number", "MDL-" + (100 + idx));
    setIfBlank(v, "weight", pick(["Class 6 (19,501–26,000 lbs)", "Class 7 (26,001–33,000 lbs)"], "wt" + idx));
    setIfBlank(v, "ownership", "Company Owned");
    setIfBlank(v, "miles_driven", 45000 + idx * 5000);
    setIfBlank(v, "liab_baserate", 850 + idx * 25);
    setIfBlank(v, "al_value", Math.round((v.stated_value || 50000) * 0.8));
    setIfBlank(v, "rating_class", "8");
    setIfBlank(v, "liab_ilf_factor", "1.15");
    setIfBlank(v, "liab_lcm_factor", "1.08");
    setIfBlank(v, "liab_fleet_factor", "0.95");
    setIfBlank(v, "vehicle_age_factor", "1.02");
    setIfBlank(v, "radius_factor", "1.10");
    setIfBlank(v, "liability_premium", "$" + (1400 + idx * 150));
  });

  // --- Drivers: tenure / status / driver factor ---
  (sub.drivers || []).forEach((d, idx) => {
    setIfBlank(d, "tenure", `${2 + idx} Years`);
    if (!d.status || d.status === "Pending Verification") d.status = "Verified" + DEMO_TAG;
    setIfBlank(d, "driver_factor", "1.00");
  });

  // --- Loss Runs: Paid Amount ---
  (sub.losses || []).forEach(l => {
    if (l.paid === undefined) {
      const incurredNum = parseFloat(String(l.incurred || "0").replace(/[^0-9.]/g, "")) || 0;
      l.paid = Math.round(incurredNum * 0.85);
    }
  });

  sub._demoFilled = true;
  return sub;
}
window.getDemoDisplaySubmission = getDemoDisplaySubmission;
