/**
 * TEST FIXTURE: completeFixtureCase(sub) fills ONLY the required items the completeness check reports missing, with values
 * tagged as samples, so a fixture case can be walked through all seven steps without waivers. Used by the end-to-end suite.
 * The application itself has no equivalent: a real case is complete because its documents and data are, or an approver
 * waives the gap on the record.
 */
var FIXTURE_EFFECTIVE = "11/01/2026";
var FIXTURE_EXPIRATION = "11/01/2027";

function fxOcr(sub, key, val) {
  if (!sub.ocrFields) sub.ocrFields = [];
  if (!sub.ocrFields.some(function (f) { return String(f.key).toLowerCase() === key.toLowerCase(); })) sub.ocrFields.push({ key: key, val: val, conf: "Sample data" });
}
function fxDoc(sub, name, desc) {
  if (!sub.docs) sub.docs = [];
  sub.docs.push({ name: name, type: /\.xlsx$/i.test(name) ? "xls" : "pdf", desc: desc + " (sample)" });
}
function fxSlug(sub) { return String(sub.insured || sub.id).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 24); }

var FIXTURE_FILLERS = {
  effective: function (s) { s.effectiveDate = FIXTURE_EFFECTIVE; s.expirationDate = FIXTURE_EXPIRATION; },
  doc_lossruns: function (s) { fxDoc(s, "Currently_Valued_Loss_Runs_" + fxSlug(s) + "_SAMPLE.pdf", "Loss runs valued within 90 days"); },
  doc_vehicles: function (s) { fxDoc(s, "Vehicle_Schedule_SOV_" + fxSlug(s) + "_SAMPLE.xlsx", "Vehicle schedule / SOV"); },
  doc_drivers: function (s) { fxDoc(s, "Driver_List_MVRs_" + fxSlug(s) + "_SAMPLE.pdf", "Driver list with licence details"); },
  doc_sov: function (s) { fxDoc(s, "Statement_of_Values_" + fxSlug(s) + "_SAMPLE.xlsx", "Location values"); },
  doc_financials: function (s) { fxDoc(s, "Financial_Statements_" + fxSlug(s) + "_SAMPLE.pdf", "Reviewed financial statements"); },
  vehicles: function (s) {
    if (!s.vehicles || !s.vehicles.length) s.vehicles = [1, 2, 3].map(function (n) { return { id: 990000 + n, xid: n, year: 2022 + (n % 3), make: "Freightliner", model: "Cascadia (sample)", stated_value: 165000, al_value: 165000, vin: "1FUJGLDR0NLSAMP" + String(100 + n), sample: "sample data" }; });
    else s.vehicles.forEach(function (v) { if (!v.year || (!v.make && !v.model) || (!v.stated_value && !v.al_value)) v.sample = "missing details are sample data"; if (!v.year) v.year = 2023; if (!v.make && !v.model) v.make = "Freightliner"; if (!v.stated_value && !v.al_value) v.stated_value = 165000; });
  },
  drivers: function (s) {
    if (!s.drivers || !s.drivers.length) s.drivers = [1, 2].map(function (n) { return { id: 970000 + n, given_name: "Sample", last_name: "Driver " + n, dob: "03/1" + n + "/1985", licenseNumber: "SMP" + (1000000 + n), licensestate: "TX", licenseclasstype: "Class A", sample: "sample data" }; });
    else s.drivers.forEach(function (d, i) { if (!d.licenseNumber) { d.licenseNumber = "SMP" + (2000000 + i); d.sample = "licence details are sample data"; } if (!/^[A-Z]{2}$/.test(String(d.licensestate || ""))) d.licensestate = "TX"; if (!d.dob && !d.age) d.dob = "03/15/1985"; });
  },
  radius: function (s) { fxOcr(s, "Operating Radius", "450 miles (sample)"); },
  commodities: function (s) { fxOcr(s, "Cargo Type", "General freight, dry van (sample)"); },
  years: function (s) { fxOcr(s, "Years in Business", "14 years (sample)"); },
  construction: function (s) { fxOcr(s, "Construction Class", "Joisted masonry, class 2 (sample)"); },
  yearbuilt: function (s) { fxOcr(s, "Year Built", "1998 (sample)"); },
  occupancy: function (s) { fxOcr(s, "Occupancy", "Warehouse and distribution (sample)"); },
  sqft: function (s) { fxOcr(s, "Square Footage", "84,000 sq ft (sample)"); },
  protection: function (s) { fxOcr(s, "Fire Protection", "Wet sprinklers, central alarm (sample)"); },
  tivsplit: function (s) { fxOcr(s, "Building_Value", "$3,200,000 (sample)"); fxOcr(s, "Contents Value", "$1,150,000 (sample)"); },
  revenue: function (s) { fxOcr(s, "Annual Revenue", "$6,400,000 (sample)"); },
  practice: function (s) { fxOcr(s, "Professional Services", "Management consulting (sample)"); },
  retro: function (s) { fxOcr(s, "Retroactive Date", "01/01/2020 (sample)"); },
  headcount: function (s) { fxOcr(s, "Number of Professionals (headcount)", "12 (sample)"); },
  operations: function (s) { fxOcr(s, "Description of Operations", "Commercial and light industrial contracting (sample)"); },
  classcode: function (s) { fxOcr(s, "Class Code", "91580 (sample)"); },
  exposure: function (s) { fxOcr(s, "Annual Payroll", "$2,400,000 (sample)"); },
  losses: function (s) { s.losses = [{ year: "2025", desc: "No claims reported (sample)", status: "Clean", incurred: "$0" }]; }
};

function completeFixtureCase(sub) {
  const filled = [];
  for (let pass = 0; pass < 3; pass++) {
    const missing = evaluateCompleteness(sub).missingRequired;
    let did = false;
    missing.forEach(function (i) {
      const f = FIXTURE_FILLERS[i.id];
      if (f && filled.indexOf(i.id) === -1) { f(sub); filled.push(i.id); did = true; }
    });
    if (!did) break;
  }
  return filled;
}

/** The fixture cases as the queue would hold them: deep copies, in the queue, completed so they pass the check. */
function loadFixtureCases() {
  SUBMISSIONS_DATASET = SEED_SUBMISSIONS_DATASET.map(function (s) {
    const c = JSON.parse(JSON.stringify(s));
    c.apiSourced = true;
    completeFixtureCase(c);
    return c;
  });
  window.SUBMISSIONS_DATASET = SUBMISSIONS_DATASET;
  return SUBMISSIONS_DATASET;
}
