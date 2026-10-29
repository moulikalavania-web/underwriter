/**
 * ============================================================================
 * SUBMISSION ANALYSIS: LOSS RUNS, STATEMENT OF VALUES, APPETITE MATCH
 * ----------------------------------------------------------------------------
 * What the underwriter wants to know about a submission before any pricing, worked out from what is on the case:
 *
 *   Step 5  Loss run analysis    the last three policy years: claims, incurred, open claims, large claims, the
 *                                direction of frequency, and policy years no loss run covers.
 *   Step 5  Statement of values  trucking: the stated value of each scheduled unit; property: the locations read from
 *                                an attached SOV. Totals, missing values, duplicates, outliers and any disagreement
 *                                with the total the documents state.
 *   Step 6  Appetite match       the share of the product's appetite rules the risk passes, whether the rules it fails
 *                                can be overridden, and the risk score.
 *
 * Nothing here is invented. A figure that is not in the documents is shown as not stated, and a check that cannot be
 * made says so. The limits below are placeholders for a carrier's own guidelines.
 * ============================================================================
 */

const ANALYSIS_LARGE_LOSS = 100000;   // a single claim at or above this is called out (placeholder)
const ANALYSIS_TERMS = 3;             // policy years looked at
const ANALYSIS_SOV_OUTLIER = 3;       // a value this many times above (or its reciprocal below) the median is questioned

function anMoney(v) {
  const m = /-?[\d,]+(?:\.\d+)?/.exec(String(v === null || v === undefined ? "" : v).replace(/\s/g, ""));
  const n = m ? parseFloat(m[0].replace(/,/g, "")) : NaN;
  return isNaN(n) ? null : n;
}
function anUsd(n) { return n === null || n === undefined ? "not stated" : "$" + Math.round(n).toLocaleString("en-US"); }

// ----------------------------------------------------------------------------
// 1. LOSS RUN ANALYSIS
// ----------------------------------------------------------------------------
/** The first four-digit year in a loss row's policy-year or loss-date text. */
function anRowYear(row) { const m = /\b((?:19|20)\d{2})\b/.exec(String(row.year || "")); return m ? parseInt(m[1], 10) : null; }
function anIsOpen(row) { return /open|reopen|pending|litigat/i.test(String(row.status || "")); }
/** A row that only says there were no claims (a clean year), not a claim. */
function anIsNoClaim(row) { return /no\s+claims?|clean|nil/i.test(String(row.desc || "") + " " + String(row.status || "")) && !(anMoney(row.incurred) > 0); }

/**
 * Three policy years before the effective date (or today when there is none). The term boundaries are taken to fall
 * on the effective date's anniversary, so a loss run labelled 2023-2024 is the term that began in 2023.
 */
function analyzeLossRuns(sub, rows) {
  rows = rows || sub.losses || [];
  const eff = Date.parse(sub.effectiveDate || "");
  const base = (isNaN(eff) ? new Date() : new Date(eff)).getFullYear();
  const terms = [];
  for (let i = ANALYSIS_TERMS; i >= 1; i--) terms.push({ start: base - i, label: (base - i) + "-" + (base - i + 1), claims: 0, incurred: 0, open: 0, largest: 0, rows: 0 });
  const outside = [];
  rows.forEach(r => {
    const y = anRowYear(r);
    const t = terms.find(x => x.start === y);
    if (!t) { outside.push(r); return; }
    t.rows++;
    if (anIsNoClaim(r)) return;
    const amt = anMoney(r.incurred) || 0;
    t.claims++; t.incurred += amt; if (anIsOpen(r)) t.open++; if (amt > t.largest) t.largest = amt;
  });
  const claims = terms.reduce((s, t) => s + t.claims, 0), incurred = terms.reduce((s, t) => s + t.incurred, 0);
  const flags = [];
  terms.filter(t => !t.rows).forEach(t => flags.push({ level: "warn", text: "No loss run covers " + t.label + ". Ask for it, or a clean-year letter." }));
  const open = terms.reduce((s, t) => s + t.open, 0);
  if (open) flags.push({ level: "warn", text: open + " claim" + (open === 1 ? " is" : "s are") + " still open, so the incurred figure can still move." });
  rows.filter(r => !anIsNoClaim(r) && (anMoney(r.incurred) || 0) >= ANALYSIS_LARGE_LOSS).forEach(r => flags.push({ level: "warn", text: "Large claim: " + anUsd(anMoney(r.incurred)) + " in " + r.year + (r.desc ? " (" + r.desc + ")" : "") + "." }));
  const covered = terms.filter(t => t.rows);
  let trend = "not enough years to tell";
  if (covered.length >= 2) {
    const first = covered[0].claims, last = covered[covered.length - 1].claims;
    trend = last > first ? "rising" : (last < first ? "falling" : "flat");
    if (trend === "rising") flags.push({ level: "warn", text: "Claim frequency is rising (" + first + " in " + covered[0].label + ", " + last + " in " + covered[covered.length - 1].label + ")." });
  }
  if (outside.length) flags.push({ level: "info", text: outside.length + " claim row" + (outside.length === 1 ? " is" : "s are") + " outside the three policy years and not counted." });
  const noCarrier = rows.filter(r => !r.carrier && r.carrier !== undefined).length;
  if (noCarrier) flags.push({ level: "info", text: noCarrier + " claim row(s) come from a loss run that does not name its insurance company." });
  const text = String(sub.rawEmailText || "");
  const val = /(?:valued|valuation)\s*(?:as\s+of|on|date)?\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i.exec(text);
  let valued = null;
  if (val) {
    valued = val[1];
    const age = (Date.now() - Date.parse(val[1])) / 86400000;
    if (!isNaN(age) && age > 90) flags.push({ level: "warn", text: "The loss run was valued on " + val[1] + ", more than 90 days ago. Ask for a current valuation." });
  }
  return { terms: terms, claims: claims, incurred: incurred, average: claims ? incurred / claims : null, largest: Math.max.apply(null, terms.map(t => t.largest).concat([0])), open: open, trend: trend, flags: flags, valued: valued, noRows: !rows.length };
}

function renderLossRunAnalysis(sub) {
  const box = document.getElementById("lossRunAnalysisContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const a = analyzeLossRuns(sub);
  sub.lossAnalysis = { claims: a.claims, incurred: a.incurred, open: a.open, largest: a.largest, trend: a.trend, flags: a.flags.map(f => f.text), at: new Date().toISOString() };
  const badge = a.noRows ? '<span class="badge badge-warning">No loss data</span>' : (a.flags.some(f => f.level === "warn") ? '<span class="badge badge-warning">Check</span>' : '<span class="badge badge-success">Clean</span>');
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-chart-line-up"></i> Loss run analysis (last ${ANALYSIS_TERMS} policy years)</h3>${badge}</div>
    <div class="card-body">
      ${a.noRows ? `<p class="text-sm text-muted" style="margin:0;">No claims or loss runs are on this case yet. Without a currently valued loss run the loss history cannot be analysed.</p>` : `
      <table class="data-table"><thead><tr><th>Policy year</th><th>Claims</th><th>Incurred</th><th>Open</th><th>Largest</th></tr></thead><tbody>
        ${a.terms.map(t => `<tr><td>${t.label}</td><td>${t.rows ? t.claims : '<span class="text-muted">no loss run</span>'}</td><td>${t.rows ? anUsd(t.incurred) : "—"}</td><td>${t.rows ? t.open : "—"}</td><td>${t.rows ? anUsd(t.largest) : "—"}</td></tr>`).join("")}
        <tr><td><strong>Total</strong></td><td><strong>${a.claims}</strong></td><td><strong>${anUsd(a.incurred)}</strong></td><td><strong>${a.open}</strong></td><td><strong>${anUsd(a.largest)}</strong></td></tr>
      </tbody></table>
      <p class="ws-small text-muted" style="margin:8px 0 0;">Average claim ${anUsd(a.average)} · frequency ${a.trend} · valuation date ${a.valued ? wsEsc(a.valued) : "not stated"}. A large claim is ${anUsd(ANALYSIS_LARGE_LOSS)} or more.</p>`}
      ${a.flags.length ? `<ul class="email-digest-flag-list" style="list-style:none; padding-left:0; margin-top:10px;">${a.flags.map(f => `<li><span class="badge ${f.level === "warn" ? "badge-warning" : "badge-light"}">${f.level === "warn" ? "Check" : "Note"}</span> ${wsEsc(f.text)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>`;
}

// ----------------------------------------------------------------------------
// 2. STATEMENT OF VALUES
// ----------------------------------------------------------------------------
var AN_SOV_COLS = {
  loc: [/^(?:loc|locno|locnumber|location|locationnumber|loc#|premises|premno|buildingno|bldgno|no)$/],
  address: [/^(?:address|streetaddress|locationaddress|premisesaddress|street)$/],
  building: [/^(?:building|buildingvalue|buildinglimit|bldg|bldgvalue|buildingamount|realproperty)$/],
  contents: [/^(?:contents|contentsvalue|bpp|businesspersonalproperty|personalproperty|bppvalue)$/],
  bi: [/^(?:bi|bivalue|businessincome|businessinterruption|rents|biee|biextraexpense)$/],
  tiv: [/^(?:tiv|totalinsuredvalue|totalvalue|total|insuredvalue|totaltiv)$/],
  construction: [/^(?:construction|constructiontype|constructionclass|iso|isoclass)$/],
  year: [/^(?:yearbuilt|yrbuilt|built|yearconstructed)$/],
  sprinkler: [/^(?:sprinkler|sprinklered|sprinklers|sprinklersystem)$/]
};

/** Locations read from the tables of an attached statement of values. Each row keeps the document it came from. */
function parseSovFromTables(sources) {
  const rows = [], docs = [];
  (sources || []).forEach(src => {
    (src.tables || []).forEach(t => {
      const tr = t.rows || [];
      if (typeof diMapColumns !== "function") return;
      const m = diMapColumns(tr, AN_SOV_COLS, mp => mp.address !== undefined && (mp.building !== undefined || mp.tiv !== undefined || mp.contents !== undefined));
      if (!m) return;
      let used = false;
      tr.slice(m.header + 1).forEach(r => {
        const cell = f => (m.map[f] === undefined ? "" : String(r[m.map[f]] === undefined ? "" : r[m.map[f]]).trim());
        if (/^total/i.test(String(r[0] || "").trim()) || !cell("address")) return;
        const b = anMoney(cell("building")), c = anMoney(cell("contents")), bi = anMoney(cell("bi")), tv = anMoney(cell("tiv"));
        const sum = (b || 0) + (c || 0) + (bi || 0);
        rows.push({ loc: cell("loc") || String(rows.length + 1), address: cell("address"), building: b, contents: c, bi: bi, tiv: tv !== null ? tv : (sum || null), tivStated: tv !== null, construction: cell("construction") || null, yearBuilt: (/\b(?:1[89]|20)\d{2}\b/.exec(cell("year")) || [null])[0], sprinkler: cell("sprinkler") || null, sourceDocument: src.name });
        used = true;
      });
      if (used && docs.indexOf(src.name) < 0) docs.push(src.name);
    });
  });
  return rows.length ? { kind: "locations", rows: rows, docs: docs } : null;
}

/** The statement of values for a case: unit values from the schedule (trucking) or locations from an attached SOV (property). */
function buildSov(sub) {
  if (sub.sov && sub.sov.kind === "locations" && sub.sov.rows && sub.sov.rows.length) return sub.sov;
  const veh = sub.vehicles || [];
  if (veh.length && (sub.lobKey || "trucking") === "trucking") {
    return { kind: "units", rows: veh.map((v, i) => ({ loc: String(v.xid || i + 1), address: [v.year, v.make, v.model].filter(Boolean).join(" ") || "Unit " + (i + 1), vin: v.vin || null, type: v.vehicle_type || null, tiv: typeof v.stated_value === "number" ? v.stated_value : anMoney(v.stated_value) })), docs: [] };
  }
  return null;
}

function analyzeSov(sub, sov) {
  const rows = sov.rows, flags = [];
  const vals = rows.map(r => r.tiv).filter(v => typeof v === "number" && v > 0);
  const total = vals.reduce((s, v) => s + v, 0);
  const missing = rows.filter(r => !(r.tiv > 0));
  if (missing.length) flags.push({ level: "warn", text: missing.length + " " + (sov.kind === "units" ? "unit" : "location") + (missing.length === 1 ? " has" : "s have") + " no value (" + missing.slice(0, 4).map(r => r.address).join("; ") + (missing.length > 4 ? "…" : "") + ")." });
  const seen = {};
  rows.forEach(r => { const k = sov.kind === "units" ? (r.vin || "") : String(r.address).toLowerCase().replace(/[^a-z0-9]/g, ""); if (!k) return; (seen[k] = seen[k] || []).push(r); });
  Object.keys(seen).filter(k => seen[k].length > 1).forEach(k => flags.push({ level: "warn", text: (sov.kind === "units" ? "VIN " + k : "Address " + seen[k][0].address) + " appears " + seen[k].length + " times." }));
  if (vals.length >= 3) {
    const sorted = vals.slice().sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    rows.filter(r => r.tiv > 0 && (r.tiv > median * ANALYSIS_SOV_OUTLIER || r.tiv < median / ANALYSIS_SOV_OUTLIER)).forEach(r => flags.push({ level: "info", text: r.address + " (" + anUsd(r.tiv) + ") is far from the typical value of " + anUsd(median) + ". Confirm it." }));
  }
  if (sov.kind === "locations") {
    rows.filter(r => r.tivStated && r.building !== null && r.contents !== null && r.bi !== null && Math.abs(r.building + r.contents + r.bi - r.tiv) > 1).forEach(r => flags.push({ level: "warn", text: "Location " + r.loc + ": building + contents + business income is " + anUsd(r.building + r.contents + r.bi) + " but the TIV shown is " + anUsd(r.tiv) + "." }));
    const noCons = rows.filter(r => !r.construction).length;
    if (noCons) flags.push({ level: "info", text: noCons + " location(s) have no construction class." });
  }
  const text = String(sub.rawEmailText || "");
  const st = /(?:\bTIV\b|total\s+insured\s+value|total\s+stated\s+value|total\s+fleet\s+value)\s*(?:is|of)?\s*[:\-]?\s*\$?\s*([\d,\.]+)\s*(million|mm|m)?\b/i.exec(text);
  let stated = null;
  if (st) {
    stated = parseFloat(st[1].replace(/,/g, ""));
    if (st[2]) stated *= 1000000;
    if (total && stated && Math.abs(total - stated) / stated > 0.01) flags.push({ level: "warn", text: "The documents state a total of " + anUsd(stated) + " but the schedule adds up to " + anUsd(total) + " (difference " + anUsd(Math.abs(total - stated)) + ")." });
  }
  return { total: total, stated: stated, flags: flags, count: rows.length };
}

function renderSov(sub) {
  const box = document.getElementById("sovContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const sov = buildSov(sub);
  if (!sov) { box.innerHTML = `<div class="card"><div class="card-header"><h3><i class="ph ph-table"></i> Statement of values</h3><span class="badge badge-light">Nothing to show</span></div><div class="card-body text-sm text-muted">No scheduled units or locations with values are on this case. A statement of values is read from an attached SOV spreadsheet or from the vehicle schedule.</div></div>`; return; }
  const a = analyzeSov(sub, sov);
  sub.sovAnalysis = { kind: sov.kind, count: a.count, total: a.total, stated: a.stated, flags: a.flags.map(f => f.text), at: new Date().toISOString() };
  const loc = sov.kind === "locations";
  const head = loc ? "<th>Loc</th><th>Address</th><th>Building</th><th>Contents</th><th>Business income</th><th>TIV</th><th>Construction</th><th>Source</th>" : "<th>Unit</th><th>Vehicle</th><th>VIN</th><th>Type</th><th>Stated value</th>";
  const body = sov.rows.map(r => loc
    ? `<tr><td>${wsEsc(r.loc)}</td><td>${wsEsc(r.address)}</td><td>${anUsd(r.building)}</td><td>${anUsd(r.contents)}</td><td>${anUsd(r.bi)}</td><td>${anUsd(r.tiv)}</td><td>${wsEsc(r.construction || "—")}</td><td class="ws-small">${wsEsc(r.sourceDocument || "")}</td></tr>`
    : `<tr><td>${wsEsc(r.loc)}</td><td>${wsEsc(r.address)}</td><td class="font-mono ws-small">${wsEsc(r.vin || "—")}</td><td>${wsEsc(r.type || "—")}</td><td>${anUsd(r.tiv)}</td></tr>`).join("");
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-table"></i> Statement of values (${loc ? "locations" : "scheduled units"})</h3>${a.flags.some(f => f.level === "warn") ? '<span class="badge badge-warning">Check</span>' : '<span class="badge badge-success">Consistent</span>'}</div>
    <div class="card-body">
      <table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}<tr><td colspan="${loc ? 5 : 4}"><strong>Total (${a.count})</strong></td><td colspan="${loc ? 3 : 1}"><strong>${anUsd(a.total)}</strong></td></tr></tbody></table>
      ${a.stated ? `<p class="ws-small text-muted" style="margin:8px 0 0;">Total stated in the documents: ${anUsd(a.stated)}.</p>` : ""}
      ${a.flags.length ? `<ul class="email-digest-flag-list" style="list-style:none; padding-left:0; margin-top:10px;">${a.flags.map(f => `<li><span class="badge ${f.level === "warn" ? "badge-warning" : "badge-light"}">${f.level === "warn" ? "Check" : "Note"}</span> ${wsEsc(f.text)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>`;
}

// The statement of values is read from the attached tables while the files are read, and kept on the case once it is confirmed.
(function sovWire() {
  const origCons = window.diConsolidate;
  if (typeof origCons === "function") {
    window.diConsolidate = function (sub, sources) {
      const draft = origCons.apply(this, arguments);
      try { draft.sov = parseSovFromTables(sources); } catch (e) { draft.sov = null; }
      return draft;
    };
  }
  const origApply = window.applyNormalizedDataToSubmission;
  if (typeof origApply === "function") {
    window.applyNormalizedDataToSubmission = function (subId) {
      const draft = (typeof emailIngestionDraftBySubId !== "undefined") ? emailIngestionDraftBySubId[subId] : null;
      const r = origApply.apply(this, arguments);
      const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
      if (sub && draft && draft.sov) sub.sov = draft.sov;
      return r;
    };
  }
})();

// ----------------------------------------------------------------------------
// 3. APPETITE MATCH
// ----------------------------------------------------------------------------
/** How the risk stands against the product's appetite rules. A rule that was overridden counts as passed and is listed. */
function appetiteMatch(sub) {
  const rules = (sub.appetiteRules || []);
  const evaluated = rules.filter(r => r.pass === true || r.pass === false);
  const failed = evaluated.filter(r => r.pass === false);
  const overridden = evaluated.filter(r => r.manualPassOverride);
  const hard = failed.filter(r => r.canOverride === false);
  const passed = evaluated.length - failed.length;
  let verdict = "in", label = "In appetite";
  if (!evaluated.length) { verdict = "none"; label = "No appetite rules evaluated"; }
  else if (hard.length) { verdict = "out"; label = "Outside appetite"; }
  else if (failed.length) { verdict = "exceptions"; label = "In appetite with exceptions"; }
  const risk = typeof calculateRiskScore === "function" ? (typeof getEffectiveRiskScore === "function" ? getEffectiveRiskScore(sub) : calculateRiskScore(sub).score) : null;
  const band = risk !== null && typeof riskBand === "function" ? riskBand(risk) : null;
  return { total: evaluated.length, passed: passed, failed: failed, hard: hard, overridden: overridden, percent: evaluated.length ? Math.round(passed / evaluated.length * 100) : null, verdict: verdict, label: label, risk: risk, band: band };
}
window.appetiteMatch = appetiteMatch;

function renderAppetiteMatch(sub) {
  const box = document.getElementById("appetiteMatchContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const m = appetiteMatch(sub);
  const cls = { in: "badge-success", exceptions: "badge-warning", out: "badge-danger", none: "badge-light" }[m.verdict];
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-target"></i> Appetite match</h3><span class="badge ${cls}">${m.label}</span></div>
    <div class="card-body">
      <div style="display:flex; gap:28px; flex-wrap:wrap; margin-bottom:8px;">
        <div><div class="ws-small text-muted">Appetite fit</div><div style="font-size:24px; font-weight:700;">${m.percent === null ? "—" : m.percent + "%"}</div><div class="ws-small text-muted">${m.passed} of ${m.total} rules passed</div></div>
        <div><div class="ws-small text-muted">Risk score</div><div style="font-size:24px; font-weight:700;">${m.risk === null ? "—" : m.risk}</div><div class="ws-small text-muted">${m.band ? m.band.label : ""}</div></div>
        <div><div class="ws-small text-muted">Overrides in use</div><div style="font-size:24px; font-weight:700;">${m.overridden.length}</div><div class="ws-small text-muted">rules passed by an approver</div></div>
      </div>
      ${m.failed.length ? `<table class="data-table"><thead><tr><th>Rule that failed</th><th>Submitted</th><th>Required</th><th>Can be overridden</th></tr></thead><tbody>${m.failed.map(r => `<tr><td>${wsEsc(r.factor)}</td><td>${wsEsc(r.val)}</td><td>${wsEsc(r.guardrail || (r.operator + " " + r.baseValue))}</td><td>${r.canOverride === false ? '<span class="badge badge-danger">No</span>' : '<span class="badge badge-warning">By an approver</span>'}</td></tr>`).join("")}</tbody></table>` : (m.total ? '<p class="text-sm" style="margin:0;"><i class="ph ph-check-circle text-success"></i> Every appetite rule passes.</p>' : '<p class="text-sm text-muted" style="margin:0;">The product has no appetite rules to evaluate for this case.</p>')}
    </div>
  </div>`;
}

registerStepRenderer("lossRunAnalysis", renderLossRunAnalysis);
registerStepRenderer("sov", renderSov);
registerStepRenderer("appetiteMatch", renderAppetiteMatch);

window.analyzeLossRuns = analyzeLossRuns;
window.buildSov = buildSov;
window.analyzeSov = analyzeSov;
window.parseSovFromTables = parseSovFromTables;
