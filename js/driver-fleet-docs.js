/**
 * ============================================================================
 * DRIVER AND FLEET DOCUMENTS: MOTOR VEHICLE RECORDS (MVR) AND IFTA REPORTS
 * ----------------------------------------------------------------------------
 * Two documents a trucking submission carries, read from their text (or their tables) while the files are read at Step 3 and
 * analysed on the Enrichment page (Step 5):
 *
 *   MVR   one block or table row per driver: licence, status and each violation with its date. A violation is MAJOR (DUI or
 *         DWI, reckless driving, hit and run, fleeing, a suspension, a speed 20 or more over the limit) or MINOR, and counts
 *         against the driver only if it is within the last 36 months. The driver's points: 25 for each recent major, 8 for each
 *         recent minor, 20 for an at-fault accident, 40 for a licence that is not valid. Up to 15 is Low, up to 40 Medium, over
 *         40 High. Drivers on the MVRs are matched by name to the driver list: an MVR for someone not on the list, and a
 *         listed driver with no MVR, are both called out.
 *   IFTA  one row per jurisdiction: miles, gallons. Total miles and gallons, miles per gallon, the share of miles in the home
 *         state (the radius profile in practice), and a comparison with what the application says about annual mileage and
 *         the states operated.
 *
 * The points and the bands are placeholders for a carrier's own driver guidelines. A report that is not there is shown as not
 * received, not as clean. Nothing is read from a scanned file until an OCR service is connected.
 * ============================================================================
 */

const MVR_MONTHS = 36, MVR_POINTS = { major: 25, minor: 8, accident: 20, licence: 40 }, MVR_BANDS = [[15, "Low"], [40, "Medium"], [Infinity, "High"]];
const IFTA_MILEAGE_TOLERANCE = 0.15, IFTA_MPG_RANGE = [4, 9], IFTA_STATE_SHARE = 0.05;
const MVR_MAJOR = /DUI|DWI|OWI|intoxicat|under the influence|reckless|hit[- ]and[- ]run|leaving the scene|fleeing|eluding|suspen|revok|vehicular|homicide|racing|(?:2\d|3\d|4\d)\s*\+?\s*(?:mph\s*)?over|excessive speed/i;
const MVR_ACCIDENT = /at[- ]fault|accident|collision|crash/i;
const DF_JURISDICTIONS = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AB BC MB NB NL NS ON PE QC SK".split(" ");

function dfNum(v) { const m = /-?[\d,]+(?:\.\d+)?/.exec(String(v === null || v === undefined ? "" : v)); const n = m ? parseFloat(m[0].replace(/,/g, "")) : NaN; return isNaN(n) ? null : n; }
function dfNorm(s) { return String(s || "").toLowerCase().replace(/[^a-z]/g, ""); }
function dfDate(s) {
  const t = String(s || "").trim();
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);
  if (m) return new Date((m[3].length === 2 ? 2000 + +m[3] : +m[3]), +m[1] - 1, +m[2]);
  m = /((?:19|20)\d{2})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /(\d{1,2})\/((?:19|20)\d{2})/.exec(t);
  if (m) return new Date(+m[2], +m[1] - 1, 1);
  m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2},?\s+)?((?:19|20)\d{2})/.exec(t);
  if (m) { const d = new Date(m[1] + " 1, " + m[3]); return isNaN(d) ? null : d; }
  return null;
}

// ----------------------------------------------------------------------------
// 1. MVR
// ----------------------------------------------------------------------------
function mvrViolation(line, asOf) {
  const dm = /(\d{1,2}\/\d{1,2}\/\d{2,4}|(?:19|20)\d{2}-\d{2}-\d{2}|\d{1,2}\/(?:19|20)\d{2}|[A-Za-z]{3}[a-z]*\.?\s+(?:\d{1,2},?\s+)?(?:19|20)\d{2})/.exec(line);
  const date = dm ? dfDate(dm[1]) : null;
  const pts = /(\d+)\s*(?:pts?|points?)\b/i.exec(line);
  let desc = line.replace(/^[\s\-*•\d.)]+/, "").replace(dm ? dm[1] : "", "").replace(/\(?\d+\s*(?:pts?|points?)\)?/i, "").replace(/^[\s:,\-–]+|[\s:,\-–]+$/g, "").replace(/\s{2,}/g, " ");
  if (!desc) desc = "Violation";
  const major = MVR_MAJOR.test(desc), accident = MVR_ACCIDENT.test(desc) && /at[- ]fault/i.test(desc);
  const months = date ? (asOf.getFullYear() - date.getFullYear()) * 12 + (asOf.getMonth() - date.getMonth()) : null;
  return { date: dm ? dm[1] : "", desc: desc, points: pts ? +pts[1] : null, severity: major ? "major" : "minor", accident: accident, months: months, recent: months === null ? true : months <= MVR_MONTHS };
}

function mvrScore(d) {
  let s = 0;
  d.violations.forEach(v => { if (!v.recent) return; s += v.severity === "major" ? MVR_POINTS.major : MVR_POINTS.minor; if (v.accident) s += MVR_POINTS.accident; });
  if (d.status && !/valid|active|clear|current/i.test(d.status)) s += MVR_POINTS.licence;
  return Math.min(100, s);
}
function mvrBand(score) { return MVR_BANDS.find(b => score <= b[0])[1]; }

/** Drivers from MVR text laid out one block per driver ("Driver: ..." then licence, status, violations). */
function mvrFromText(text, asOf) {
  const body = String(text || "").replace(/\r/g, "");
  const parts = body.split(/(?:^|\n)[ \t]*(?:Driver(?:[ \t]+Name)?|Name)[ \t]*:[ \t]*/i).slice(1);
  const out = [];
  parts.forEach(p => {
    const lines = p.split("\n");
    const name = lines[0].replace(/\s*[,(|].*$/, "").trim();
    if (!name) return;
    const rest = lines.slice(1).join("\n");
    const lic = /(?:licen[sc]e|DL)(?:\s*(?:no\.?|number|#))?\s*:?\s*([A-Z]{2})?[\s#:]*([A-Z0-9-]{5,})/i.exec(rest) || /(?:licen[sc]e|DL)[^\n]*?([A-Z0-9-]{6,})/i.exec(rest);
    const st = /(?:licen[sc]e\s*)?state\s*:\s*([A-Z]{2})/i.exec(rest);
    const status = /status\s*:\s*([^\n]+)/i.exec(rest);
    const vioBlock = rest.split(/(?:^|\n)[ \t]*(?:violations?|convictions?|incidents?|accidents?)[^\n:]*:[ \t]*/i).slice(1).join("\n");
    const noVio = /no\s+(?:violations?|convictions?|incidents?|accidents?)|clear record|clean record/i.test(rest);
    const vios = vioBlock.split("\n").map(l => l.trim()).filter(l => l && !/^(?:driver|name|licen|status)\b/i.test(l) && !/^no\s+violations?/i.test(l)).map(l => mvrViolation(l, asOf)).filter(v => v.date || v.points !== null || v.desc.length > 4);
    out.push({ name: name, license: lic ? (lic[2] || lic[1]) : "", state: (lic && lic[2] && lic[1] && /^[A-Z]{2}$/.test(lic[1])) ? lic[1] : (st ? st[1] : ""), status: status ? status[1].trim() : "", violations: noVio && !vios.length ? [] : vios });
  });
  return out;
}

/** Drivers from a table with a header row (Driver, Licence, State, Status, Violation, Date, Points). One row per violation or per driver. */
function mvrFromTables(tables, asOf) {
  const byName = {}, order = [];
  (tables || []).forEach(t => {
    const rows = t.rows || [];
    const m = typeof diMapColumns === "function" ? diMapColumns(rows, {
      name: [/^(?:driver|drivername|name)$/], license: [/^(?:licen[sc]e(?:no|number)?|dl(?:no|number)?|licen[sc]e#)$/], state: [/^(?:state|licen[sc]estate|st)$/],
      status: [/^(?:status|licen[sc]estatus)$/], violation: [/^(?:violation|violations|description|conviction|offense|incident)$/], date: [/^(?:date|violationdate|convictiondate|incidentdate)$/], points: [/^(?:points|pts)$/]
    }, mp => mp.name !== undefined && (mp.violation !== undefined || mp.license !== undefined)) : null;
    if (!m) return;
    rows.slice(m.header + 1).forEach(r => {
      const cell = f => (m.map[f] === undefined ? "" : String(r[m.map[f]] === undefined ? "" : r[m.map[f]]).trim());
      const name = cell("name"); if (!name || /^total/i.test(name)) return;
      const k = dfNorm(name);
      if (!byName[k]) { byName[k] = { name: name, license: cell("license"), state: cell("state"), status: cell("status"), violations: [] }; order.push(k); }
      const d = byName[k]; d.license = d.license || cell("license"); d.state = d.state || cell("state"); d.status = d.status || cell("status");
      const v = cell("violation");
      if (v && !/^(?:none|no violations?|clear|-)$/i.test(v)) d.violations.push(mvrViolation([cell("date"), v, cell("points") ? cell("points") + " pts" : ""].join(" "), asOf));
    });
  });
  return order.map(k => byName[k]);
}

function readMvrSources(sources, asOf) {
  asOf = asOf || new Date();
  const docs = [], drivers = [];
  (sources || []).forEach(src => {
    if (src.name === "Email text" || recognizeDocument(src.name, src.text).key !== "mvr") return;
    let list = mvrFromTables(src.tables, asOf);
    if (!list.length) list = mvrFromText(src.text, asOf);
    if (!list.length) return;
    docs.push(src.name);
    list.forEach(d => { d.sourceDocument = src.name; if (!drivers.some(x => dfNorm(x.name) === dfNorm(d.name))) drivers.push(d); });
  });
  if (!drivers.length) return null;
  drivers.forEach(d => { d.score = mvrScore(d); d.band = mvrBand(d.score); d.major = d.violations.filter(v => v.recent && v.severity === "major").length; d.minor = d.violations.filter(v => v.recent && v.severity === "minor").length; d.accidents = d.violations.filter(v => v.recent && v.accident).length; });
  return { drivers: drivers, docs: docs, asOf: asOf.toISOString().slice(0, 10) };
}

/** The MVR result set against the driver list on the case. */
function mvrAnalyze(sub) {
  const data = sub.mvrData; if (!data) return null;
  const listed = (sub.drivers || []).map(d => ({ d: d, key: dfNorm((d.given_name || "") + (d.last_name || "")) || dfNorm(d.name || d.driver_name || "") })).filter(x => x.key);
  const keys = data.drivers.map(x => dfNorm(x.name));
  const noMvr = listed.filter(x => keys.indexOf(x.key) === -1 && !keys.some(k => k && (k.indexOf(x.key) > -1 || x.key.indexOf(k) > -1)));
  const notListed = listed.length ? data.drivers.filter(x => !listed.some(l => l.key === dfNorm(x.name) || l.key.indexOf(dfNorm(x.name)) > -1 || dfNorm(x.name).indexOf(l.key) > -1)) : [];
  const flags = [];
  data.drivers.filter(d => d.band === "High").forEach(d => flags.push({ level: "warn", text: d.name + " is High risk (" + d.score + " points): " + d.major + " major and " + d.minor + " minor violation(s) in the last " + MVR_MONTHS + " months" + (d.status && !/valid|active|clear|current/i.test(d.status) ? ", licence " + d.status : "") + "." }));
  data.drivers.filter(d => d.status && !/valid|active|clear|current/i.test(d.status)).forEach(d => { if (d.band !== "High") flags.push({ level: "warn", text: d.name + "'s licence status is " + d.status + "." }); });
  noMvr.forEach(x => flags.push({ level: "warn", text: "No MVR was received for listed driver " + ((x.d.given_name || "") + " " + (x.d.last_name || "")).trim() + "." }));
  notListed.forEach(d => flags.push({ level: "info", text: "An MVR was received for " + d.name + ", who is not on the driver list." }));
  return { drivers: data.drivers.length, major: data.drivers.reduce((n, d) => n + d.major, 0), minor: data.drivers.reduce((n, d) => n + d.minor, 0), high: data.drivers.filter(d => d.band === "High").length, flags: flags, noMvr: noMvr.length, notListed: notListed.length };
}

function renderMvrAnalysis(sub) {
  const box = document.getElementById("mvrAnalysisContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  if (!sub.mvrData) {
    box.innerHTML = (sub.lobKey || "trucking") === "trucking" ? `<div class="card"><div class="card-header"><h3><i class="ph ph-identification-card"></i> Driver records (MVR)</h3><span class="badge badge-warning">Not received</span></div><div class="card-body ws-small text-muted">No motor vehicle record was read from the documents. Ask the producer for an MVR for every driver; a driver without one is not shown as clean.</div></div>` : "";
    return;
  }
  const a = mvrAnalyze(sub); sub.mvrAnalysis = { drivers: a.drivers, major: a.major, minor: a.minor, high: a.high, at: new Date().toISOString() };
  const cls = { Low: "badge-success", Medium: "badge-warning", High: "badge-danger" };
  box.innerHTML = `<div class="card"><div class="card-header"><h3><i class="ph ph-identification-card"></i> Driver records (MVR), violations in the last ${MVR_MONTHS} months</h3><span class="badge ${a.high ? "badge-danger" : (a.flags.some(f => f.level === "warn") ? "badge-warning" : "badge-success")}">${a.high ? a.high + " high-risk driver(s)" : (a.flags.some(f => f.level === "warn") ? "Check" : "Clean")}</span></div><div class="card-body">
    <table class="data-table"><thead><tr><th>Driver</th><th>Licence</th><th>Status</th><th>Major</th><th>Minor</th><th>Points</th><th>Risk</th><th>Source</th></tr></thead><tbody>
    ${sub.mvrData.drivers.map(d => `<tr><td>${wsEsc(d.name)}</td><td class="font-mono ws-small">${wsEsc((d.state ? d.state + " " : "") + (d.license || "—"))}</td><td>${wsEsc(d.status || "not stated")}</td><td>${d.major}</td><td>${d.minor}</td><td>${d.score}</td><td><span class="badge ${cls[d.band]}">${d.band}</span></td><td class="ws-small">${wsEsc(d.sourceDocument || "")}</td></tr>`).join("")}
    </tbody></table>
    ${a.flags.length ? `<ul class="email-digest-flag-list" style="list-style:none; padding-left:0; margin-top:10px;">${a.flags.map(f => `<li><span class="badge ${f.level === "warn" ? "badge-warning" : "badge-light"}">${f.level === "warn" ? "Check" : "Note"}</span> ${wsEsc(f.text)}</li>`).join("")}</ul>` : ""}
    <p class="ws-small text-muted" style="margin:8px 0 0;">Points: ${MVR_POINTS.major} for a recent major violation, ${MVR_POINTS.minor} for a minor, ${MVR_POINTS.accident} for an at-fault accident, ${MVR_POINTS.licence} for a licence that is not valid. Low up to 15, Medium up to 40, High above that.</p>
  </div></div>`;
}

// ----------------------------------------------------------------------------
// 2. IFTA
// ----------------------------------------------------------------------------
function iftaFromTables(tables) {
  const rows = [];
  (tables || []).forEach(t => {
    const tr = t.rows || [];
    const m = typeof diMapColumns === "function" ? diMapColumns(tr, {
      state: [/^(?:jurisdiction|state|juris|st|stateprovince)$/], miles: [/^(?:totalmiles|miles|totalmilesdriven|distance|totaldistance)$/], taxable: [/^(?:taxablemiles|taxable|taxabledistance)$/],
      gallons: [/^(?:gallons|fuelgallons|totalgallons|taxpaidgallons|gal|totalfuel|fuel)$/]
    }, mp => mp.state !== undefined && mp.miles !== undefined) : null;
    if (!m) return;
    tr.slice(m.header + 1).forEach(r => {
      const cell = f => (m.map[f] === undefined ? "" : String(r[m.map[f]] === undefined ? "" : r[m.map[f]]).trim());
      const st = cell("state").toUpperCase().slice(0, 2);
      if (DF_JURISDICTIONS.indexOf(st) === -1) return;
      rows.push({ state: st, miles: dfNum(cell("miles")) || 0, taxable: dfNum(cell("taxable")), gallons: dfNum(cell("gallons")) });
    });
  });
  return rows;
}
function iftaFromText(text) {
  const rows = [];
  String(text || "").split("\n").forEach(line => {
    const m = /^[\s|]*([A-Z]{2})[\s|:,\-]+([\d,]{3,})(?:\s*(?:mi|miles))?(?:[\s|,\-]+([\d,]+(?:\.\d+)?)\s*(?:gal(?:lons)?)?)?\s*$/i.exec(line.trim()) || /^([A-Z]{2})\b[^\d\n]{0,20}([\d,]{3,})\s*(?:mi|miles)[^\d\n]{0,30}([\d,]+(?:\.\d+)?)\s*gal/i.exec(line.trim());
    if (m && DF_JURISDICTIONS.indexOf(m[1].toUpperCase()) > -1) rows.push({ state: m[1].toUpperCase(), miles: dfNum(m[2]) || 0, taxable: null, gallons: m[3] ? dfNum(m[3]) : null });
  });
  return rows;
}

function readIftaSources(sources) {
  const reports = [];
  (sources || []).forEach(src => {
    if (src.name === "Email text" || recognizeDocument(src.name, src.text).key !== "ifta") return;
    let rows = iftaFromTables(src.tables);
    if (!rows.length) rows = iftaFromText(src.text);
    if (!rows.length) return;
    const q = /Q([1-4])\s*[- ]?\s*((?:19|20)\d{2})|(1st|2nd|3rd|4th)\s+quarter\s*,?\s*((?:19|20)\d{2})?/i.exec(src.name + "\n" + src.text);
    const quarter = q ? (q[1] ? "Q" + q[1] + " " + q[2] : ({ "1st": "Q1", "2nd": "Q2", "3rd": "Q3", "4th": "Q4" })[q[3].toLowerCase()] + (q[4] ? " " + q[4] : "")) : (src.name || "report");
    reports.push({ document: src.name, quarter: quarter, rows: rows });
  });
  return reports.length ? { reports: reports } : null;
}

/** Totals and checks across the reports read. */
function iftaAnalyze(sub) {
  const data = sub.iftaData; if (!data) return null;
  const by = {}; let miles = 0, gallons = 0, gallonRows = 0;
  data.reports.forEach(rp => rp.rows.forEach(r => { by[r.state] = (by[r.state] || 0) + r.miles; miles += r.miles; if (r.gallons) { gallons += r.gallons; gallonRows++; } }));
  const states = Object.keys(by).map(k => ({ state: k, miles: by[k], share: miles ? by[k] / miles : 0 })).sort((a, b) => b.miles - a.miles);
  const quarters = data.reports.length;
  const annual = miles / quarters * 4;
  const home = (typeof deriveRiskState === "function" ? deriveRiskState(sub) : null) || (states[0] && states[0].state);
  const homeShare = home && by[home] && miles ? by[home] / miles : null;
  const mpg = gallons ? miles / gallons : null;
  const ops = sub.operationsProfile || {};
  const flags = [];
  if (quarters < 4) flags.push({ level: "info", text: quarters + " quarter(s) of IFTA were read; the annual figure is those quarters scaled to a year." });
  const stated = dfNum(ops.annual_mileage);
  if (stated && annual && Math.abs(annual - stated) / stated > IFTA_MILEAGE_TOLERANCE) flags.push({ level: "warn", text: "The application states " + Math.round(stated).toLocaleString("en-US") + " annual miles but IFTA shows " + Math.round(annual).toLocaleString("en-US") + " (" + (annual > stated ? "+" : "-") + Math.round(Math.abs(annual - stated) / stated * 100) + "%)." });
  const listed = Array.isArray(ops.states_operated) ? ops.states_operated.map(s => String(s).trim().toUpperCase().slice(0, 2)) : [];
  if (listed.length) states.filter(s => s.share >= IFTA_STATE_SHARE && listed.indexOf(s.state) === -1).forEach(s => flags.push({ level: "warn", text: s.state + " carries " + Math.round(s.share * 100) + "% of the miles but is not among the states the application lists." }));
  if (mpg && (mpg < IFTA_MPG_RANGE[0] || mpg > IFTA_MPG_RANGE[1])) flags.push({ level: "warn", text: "Fuel economy of " + mpg.toFixed(1) + " mpg is outside the " + IFTA_MPG_RANGE[0] + " to " + IFTA_MPG_RANGE[1] + " range usual for heavy trucks. Check the gallons." });
  if (gallonRows && gallonRows < data.reports.reduce((n, r) => n + r.rows.length, 0)) flags.push({ level: "info", text: "Some jurisdictions have no gallons, so miles per gallon uses only those that do." });
  return { miles: miles, gallons: gallons || null, mpg: mpg, annual: annual, states: states, home: home, homeShare: homeShare, jurisdictions: states.length, quarters: quarters, flags: flags };
}

function renderIftaAnalysis(sub) {
  const box = document.getElementById("iftaAnalysisContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  if (!sub.iftaData) {
    box.innerHTML = (sub.lobKey || "trucking") === "trucking" ? `<div class="card"><div class="card-header"><h3><i class="ph ph-gas-pump"></i> Fleet mileage (IFTA)</h3><span class="badge badge-light">Not received</span></div><div class="card-body ws-small text-muted">No IFTA report was read. Annual mileage and the states operated rest on the application alone.</div></div>` : "";
    return;
  }
  const a = iftaAnalyze(sub); sub.iftaAnalysis = { miles: a.miles, annual: a.annual, mpg: a.mpg, states: a.jurisdictions, homeShare: a.homeShare, at: new Date().toISOString() };
  const n = v => Math.round(v).toLocaleString("en-US");
  box.innerHTML = `<div class="card"><div class="card-header"><h3><i class="ph ph-gas-pump"></i> Fleet mileage (IFTA, ${a.quarters} quarter${a.quarters === 1 ? "" : "s"})</h3><span class="badge ${a.flags.some(f => f.level === "warn") ? "badge-warning" : "badge-success"}">${a.flags.some(f => f.level === "warn") ? "Check" : "Consistent"}</span></div><div class="card-body">
    <div style="display:flex; gap:28px; flex-wrap:wrap; margin-bottom:8px;">
      <div><div class="ws-small text-muted">Total miles</div><div style="font-size:22px; font-weight:700;">${n(a.miles)}</div><div class="ws-small text-muted">about ${n(a.annual)} a year</div></div>
      <div><div class="ws-small text-muted">Miles per gallon</div><div style="font-size:22px; font-weight:700;">${a.mpg ? a.mpg.toFixed(1) : "—"}</div><div class="ws-small text-muted">${a.gallons ? n(a.gallons) + " gallons" : "no gallons"}</div></div>
      <div><div class="ws-small text-muted">Jurisdictions</div><div style="font-size:22px; font-weight:700;">${a.jurisdictions}</div><div class="ws-small text-muted">${a.home ? Math.round((a.homeShare || 0) * 100) + "% of miles in " + a.home : ""}</div></div>
    </div>
    <table class="data-table"><thead><tr><th>State</th><th>Miles</th><th>Share</th></tr></thead><tbody>${a.states.slice(0, 12).map(s => `<tr><td>${s.state}</td><td>${n(s.miles)}</td><td>${Math.round(s.share * 100)}%</td></tr>`).join("")}</tbody></table>
    ${a.flags.length ? `<ul class="email-digest-flag-list" style="list-style:none; padding-left:0; margin-top:10px;">${a.flags.map(f => `<li><span class="badge ${f.level === "warn" ? "badge-warning" : "badge-light"}">${f.level === "warn" ? "Check" : "Note"}</span> ${wsEsc(f.text)}</li>`).join("")}</ul>` : ""}
  </div></div>`;
}

// ----------------------------------------------------------------------------
// 3. WIRING: read with the files, keep on the case when confirmed
// ----------------------------------------------------------------------------
(function dfWire() {
  const origCons = window.diConsolidate;
  if (typeof origCons === "function") {
    window.diConsolidate = function (sub, sources) {
      const draft = origCons.apply(this, arguments);
      try { draft.mvr = readMvrSources(sources); } catch (e) { console.warn("MVR read failed:", e); draft.mvr = null; }
      try { draft.ifta = readIftaSources(sources); } catch (e) { console.warn("IFTA read failed:", e); draft.ifta = null; }
      return draft;
    };
  }
  const origApply = window.applyNormalizedDataToSubmission;
  if (typeof origApply === "function") {
    window.applyNormalizedDataToSubmission = function (subId) {
      const draft = (typeof emailIngestionDraftBySubId !== "undefined") ? emailIngestionDraftBySubId[subId] : null;
      const r = origApply.apply(this, arguments);
      const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
      if (sub && draft) { if (draft.mvr) sub.mvrData = draft.mvr; if (draft.ifta) sub.iftaData = draft.ifta; }
      return r;
    };
  }
})();

registerStepRenderer("mvrAnalysis", renderMvrAnalysis);
registerStepRenderer("iftaAnalysis", renderIftaAnalysis);

window.mvrFromText = mvrFromText; window.mvrFromTables = mvrFromTables; window.readMvrSources = readMvrSources; window.mvrAnalyze = mvrAnalyze;
window.iftaFromText = iftaFromText; window.iftaFromTables = iftaFromTables; window.readIftaSources = readIftaSources; window.iftaAnalyze = iftaAnalyze;
window.renderMvrAnalysis = renderMvrAnalysis; window.renderIftaAnalysis = renderIftaAnalysis;
