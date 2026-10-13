/**
 * ============================================================================
 * REFERENCE DATA: LICENSING REGISTRY AND SANCTIONS WATCHLIST (Add-On)
 * ----------------------------------------------------------------------------
 * The app ships neither a producer licensing registry nor a sanctions watchlist. Until one is loaded, the Producer Licence and
 * Sanctions sections cannot pass a check (they can only record a person's verification). This module lets an approver load the real data
 * from a file, in the card itself:
 *
 *   Watchlist   CSV or JSON. The U.S. Treasury OFAC SDN.CSV can be loaded as it is (no header row), or a CSV with the columns
 *               name, aliases (separated by ; or |), type, program, or JSON.
 *   Registry    CSV or JSON. One CSV row per licence or appointment: producer_name, npn, license_state, license_number, license_lines,
 *               license_status, license_expires, appointment_carrier, appointment_state, appointment_lobs, appointment_status,
 *               appointment_effective. Rows with the same NPN are one producer.
 *
 * What was loaded (file, count, who, when) is kept with the data and shown on the card and on every screening it produces. The data is
 * saved in the browser, so it is still there after a reload; the cases are not touched. Rows that cannot be read are listed, never guessed.
 * Loading re-runs the check on the open case.
 * ============================================================================
 */

var REF_KEYS = { registry: "veridex_ref_registry_v1", watchlist: "veridex_ref_watchlist_v1" };
var REF_VERSION = 1;
var REF_MAX_CHARS = 4000000;
var REF_META = { registry: null, watchlist: null };

// ----------------------------------------------------------------------------
// 1. PURE PARSING
// ----------------------------------------------------------------------------
function refKey(s) { return String(s === null || s === undefined ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function refEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function refList(s) { return String(s || "").split(/[;|]/).map(x => x.trim()).filter(Boolean); }

function refCsv(text) {
  const t = String(text || "").replace(/^﻿/, "");
  const delim = (t.split("\n")[0].match(/\t/g) || []).length > (t.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function refIso(s) {
  const v = String(s || "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  if (isNaN(t)) return null;
  const d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** "SURNAME, Given Names" (the way OFAC writes individuals) -> "Given Names Surname"; anything else is left as written. */
function refPersonName(n) {
  const m = /^([^,]+),\s*(.+)$/.exec(String(n).trim());
  return m ? (m[2] + " " + m[1]).replace(/\s+/g, " ").trim() : String(n).trim();
}

function refWatchType(t) {
  const k = refKey(t);
  if (k === "individual" || k === "person") return "individual";
  if (k === "vessel" || k === "aircraft") return k;
  return "entity";   // "entity", "organization", and OFAC's "-0-" for an entity
}

/** Parses a watchlist file. Returns { entries, skipped, format, name, version }. */
function refParseWatchlist(text, fileName) {
  const out = { entries: [], skipped: [], format: null, name: null, version: null };
  const t = String(text || "").trim();
  if (!t) { out.skipped.push({ row: 0, reason: "the file is empty" }); return out; }
  const push = (name, aliases, type, program, row) => {
    const n = String(name || "").trim();
    if (!n) { out.skipped.push({ row: row, reason: "no name" }); return; }
    const all = (aliases || []).map(a => String(a).trim()).filter(Boolean);
    const isPerson = refWatchType(type) === "individual";
    const display = isPerson ? refPersonName(n) : n;
    if (display !== n) all.push(n);
    out.entries.push({ name: display, aliases: all.filter(a => a !== display), type: refWatchType(type), program: String(program || "").trim() });
  };
  if (/^[\[{]/.test(t)) {
    let data; try { data = JSON.parse(t); } catch (e) { out.skipped.push({ row: 0, reason: "the JSON is not valid (" + e.message + ")" }); return out; }
    out.format = "JSON";
    let list = data;
    if (!Array.isArray(data)) { out.name = data.name || data.listName || null; out.version = data.version || null; list = data.entries || data.records || data.list || data.names || []; }
    (Array.isArray(list) ? list : []).forEach((e, i) => {
      if (typeof e === "string") push(e, [], "entity", "", i + 1);
      else push(e.name || e.fullName || e.sdnName, Array.isArray(e.aliases) ? e.aliases : refList(e.aliases || e.aka), e.type || e.sdnType, e.program || e.programs, i + 1);
    });
    return out;
  }
  const rows = refCsv(t);
  const head = rows[0].map(refKey);
  const iName = head.findIndex(h => ["name", "sdnname", "entityname", "fullname", "listedname"].indexOf(h) > -1);
  if (iName > -1) {
    out.format = "CSV with a header row";
    const col = names => head.findIndex(h => names.indexOf(h) > -1);
    const iAl = col(["aliases", "alias", "aka", "altnames", "alternatenames"]), iTy = col(["type", "sdntype", "entitytype"]), iPr = col(["program", "programs", "list", "sanctionsprogram"]);
    rows.slice(1).forEach((r, i) => push(r[iName], iAl > -1 ? refList(r[iAl]) : [], iTy > -1 ? r[iTy] : "entity", iPr > -1 ? r[iPr] : "", i + 2));
  } else if (rows[0].length >= 4) {
    out.format = "OFAC SDN.CSV (no header row)";
    rows.forEach((r, i) => push(r[1], [], r[2], r[3], i + 1));
  } else {
    out.skipped.push({ row: 1, reason: "no column for the name was found (use a header with a name column, or an OFAC SDN.CSV)" });
  }
  return out;
}

/** Parses a licensing registry file. Returns { records, skipped, format, carrier, counts }. */
function refParseRegistry(text) {
  const out = { records: [], skipped: [], format: null, carrier: null };
  const t = String(text || "").trim();
  if (!t) { out.skipped.push({ row: 0, reason: "the file is empty" }); return out; }
  const expandLobs = list => list.some(x => ["*", "all"].indexOf(x.toLowerCase()) > -1) ? ALL_LOB_KEYS.slice() : list;
  const normRec = (r, row) => {
    const names = (Array.isArray(r.names) ? r.names : [r.name || r.producerName]).map(x => String(x || "").trim()).filter(Boolean);
    if (!names.length || !r.npn) { out.skipped.push({ row: row, reason: "a producer needs a name and an NPN" }); return null; }
    const licenses = [], appointments = [];
    let bad = null;
    (r.licenses || []).forEach(l => {
      const exp = refIso(l.expires);
      if (!l.state || !l.number || !exp) { bad = bad || "a licence needs a state, a number and an expiry date"; return; }
      licenses.push({ state: String(l.state).toUpperCase(), number: String(l.number), lines: Array.isArray(l.lines) ? l.lines : refList(l.lines), status: l.status || "Active", expires: exp });
    });
    (r.appointments || []).forEach(a => {
      const eff = refIso(a.effective);
      if (!a.carrier || !a.state || !eff) { bad = bad || "an appointment needs a carrier, a state and an effective date"; return; }
      appointments.push({ carrier: String(a.carrier), state: String(a.state).toUpperCase(), lobs: expandLobs(Array.isArray(a.lobs) ? a.lobs : refList(a.lobs)), status: a.status || "Active", effective: eff });
    });
    if (bad) out.skipped.push({ row: row, reason: bad + " (" + names[0] + ")" });
    return { names: names, npn: String(r.npn), licenses: licenses, appointments: appointments };
  };
  if (/^[\[{]/.test(t)) {
    let data; try { data = JSON.parse(t); } catch (e) { out.skipped.push({ row: 0, reason: "the JSON is not valid (" + e.message + ")" }); return out; }
    out.format = "JSON";
    const list = Array.isArray(data) ? data : (data.records || data.producers || []);
    if (!Array.isArray(data)) out.carrier = data.carrier || null;
    list.forEach((r, i) => { const x = normRec(r, i + 1); if (x) out.records.push(x); });
  } else {
    out.format = "CSV";
    const rows = refCsv(t), head = rows[0].map(refKey);
    const col = names => head.findIndex(h => names.indexOf(h) > -1);
    const c = { name: col(["producername", "name", "producer", "agency", "agencyname"]), npn: col(["npn", "nationalproducernumber"]), lst: col(["licensestate", "licencestate", "state"]), lno: col(["licensenumber", "licenceno", "licensenumber", "licenseno"]), lln: col(["licenselines", "licencelines", "lines", "linesofauthority"]), lsu: col(["licensestatus", "licencestatus", "status"]), lex: col(["licenseexpires", "licenceexpires", "expires", "expiration", "licenseexpiration"]), acar: col(["appointmentcarrier", "carrier"]), ast: col(["appointmentstate"]), alob: col(["appointmentlobs", "lobs", "linesofbusiness"]), asu: col(["appointmentstatus"]), aef: col(["appointmenteffective", "effective"]) };
    if (c.name < 0 || c.npn < 0) { out.skipped.push({ row: 1, reason: "the header needs producer_name and npn columns" }); return out; }
    const by = {};
    rows.slice(1).forEach((r, i) => {
      const npn = String(r[c.npn] || "").trim(), nm = String(r[c.name] || "").trim();
      if (!npn || !nm) { out.skipped.push({ row: i + 2, reason: "no producer name or NPN" }); return; }
      const rec = by[npn] || (by[npn] = { names: [], npn: npn, licenses: [], appointments: [] });
      if (rec.names.indexOf(nm) < 0) rec.names.push(nm);
      if (c.lst > -1 && String(r[c.lst] || "").trim() && c.lno > -1 && String(r[c.lno] || "").trim()) rec.licenses.push({ state: r[c.lst], number: r[c.lno], lines: c.lln > -1 ? r[c.lln] : "", status: c.lsu > -1 && r[c.lsu] ? r[c.lsu] : "Active", expires: c.lex > -1 ? r[c.lex] : "" });
      if (c.acar > -1 && String(r[c.acar] || "").trim()) rec.appointments.push({ carrier: r[c.acar], state: c.ast > -1 && r[c.ast] ? r[c.ast] : (c.lst > -1 ? r[c.lst] : ""), lobs: c.alob > -1 ? r[c.alob] : "", status: c.asu > -1 && r[c.asu] ? r[c.asu] : "Active", effective: c.aef > -1 ? r[c.aef] : "" });
    });
    Object.keys(by).forEach(k => { const x = normRec(by[k], 0); if (x) out.records.push(x); });
  }
  const carriers = {}; out.records.forEach(r => r.appointments.forEach(a => { carriers[a.carrier] = true; }));
  out.carriers = Object.keys(carriers);
  if (!out.carrier && out.carriers.length === 1) out.carrier = out.carriers[0];
  out.counts = { producers: out.records.length, licences: out.records.reduce((s, r) => s + r.licenses.length, 0), appointments: out.records.reduce((s, r) => s + r.appointments.length, 0) };
  return out;
}

// ----------------------------------------------------------------------------
// 2. STORAGE
// ----------------------------------------------------------------------------
function refActor() { const r = USER_ROLES_CONFIG[currentUserRole]; return r ? `${r.name} (${r.title})` : "Unknown user"; }
function refNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }

function refPersist(kind) {
  try {
    const data = kind === "watchlist" ? SANCTIONS_WATCHLIST : PRODUCER_REGISTRY;
    const json = JSON.stringify({ version: REF_VERSION, meta: REF_META[kind], data: data, listName: SANCTIONS_LIST_NAME, listVersion: SANCTIONS_LIST_VERSION, carrier: PRODUCER_DEFAULT_CARRIER });
    if (json.length > REF_MAX_CHARS) { REF_META[kind].notSaved = true; showToast(`ℹ️ The ${kind} is too large to keep in the browser, so it is loaded for this session only.`, "warning"); return false; }
    localStorage.setItem(REF_KEYS[kind], json);
    return true;
  } catch (e) { if (REF_META[kind]) REF_META[kind].notSaved = true; return false; }
}

/** Puts back what was loaded earlier. Runs once when the app starts. */
function refRestore() {
  ["registry", "watchlist"].forEach(kind => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(REF_KEYS[kind]) || "null"); } catch (e) { s = null; }
    if (!s || s.version !== REF_VERSION || !Array.isArray(s.data) || !s.data.length) return;
    REF_META[kind] = s.meta || null;
    if (kind === "watchlist") { SANCTIONS_WATCHLIST.length = 0; s.data.forEach(e => SANCTIONS_WATCHLIST.push(e)); if (s.listName) SANCTIONS_LIST_NAME = s.listName; if (s.listVersion) SANCTIONS_LIST_VERSION = s.listVersion; }
    else { PRODUCER_REGISTRY.length = 0; s.data.forEach(e => PRODUCER_REGISTRY.push(e)); if (s.carrier) PRODUCER_DEFAULT_CARRIER = s.carrier; }
  });
}

// ----------------------------------------------------------------------------
// 3. LOADING (from the cards)
// ----------------------------------------------------------------------------
function refActiveSub() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }

function refAfterLoad(kind) {
  const sub = refActiveSub();
  if (sub) {
    try { if (kind === "watchlist" && typeof runSanctionsScreening === "function") runSanctionsScreening(sub, "watchlist loaded"); } catch (e) { console.warn(e); }
    try { if (kind === "registry" && typeof runProducerCheck === "function") runProducerCheck(sub, "registry loaded"); } catch (e) { console.warn(e); }
    if (typeof persistAppState === "function") persistAppState();
    if (kind === "watchlist" && typeof renderSanctionsCard === "function") renderSanctionsCard(sub);
    if (kind === "registry" && typeof renderProducerCard === "function") renderProducerCard(sub);
    if (typeof renderSanctionsCard === "function" && kind === "registry") renderSanctionsCard(sub);
  }
}

function refReadFile(inputId) {
  const input = document.getElementById(inputId);
  const file = input && input.files && input.files[0];
  if (!file) { showToast("⚠️ Choose a file first.", "warning"); return null; }
  if (file.size > 25 * 1024 * 1024) { showToast("⛔ The file is " + (file.size / 1048576).toFixed(0) + " MB; the limit is 25 MB.", "danger"); return null; }
  return file;
}

async function refLoadWatchlist() {
  if (!hasPermission("sanctions", "approve")) { denyPermission("sanctions", "approve"); return; }
  const file = refReadFile("ref_wl_file"); if (!file) return;
  const parsed = refParseWatchlist(await file.text(), file.name);
  if (!parsed.entries.length) { showToast("⛔ Nothing could be loaded from " + file.name + ": " + (parsed.skipped[0] ? parsed.skipped[0].reason : "no entries") + ".", "danger"); return; }
  const nameIn = (document.getElementById("ref_wl_name") || {}).value, verIn = (document.getElementById("ref_wl_ver") || {}).value;
  SANCTIONS_WATCHLIST.length = 0; parsed.entries.forEach(e => SANCTIONS_WATCHLIST.push(e));
  SANCTIONS_LIST_NAME = (nameIn && nameIn.trim()) || parsed.name || file.name;
  SANCTIONS_LIST_VERSION = (verIn && verIn.trim()) || parsed.version || new Date().toISOString().slice(0, 10);
  REF_META.watchlist = { fileName: file.name, format: parsed.format, loadedAt: refNow(), loadedBy: refActor(), count: parsed.entries.length, skipped: parsed.skipped.slice(0, 20), skippedCount: parsed.skipped.length };
  refPersist("watchlist");
  showToast(`✅ Watchlist loaded: ${parsed.entries.length} entries from ${file.name}${parsed.skipped.length ? ` (${parsed.skipped.length} row(s) skipped)` : ""}. The open case was screened again.`, "success");
  refAfterLoad("watchlist");
}

async function refLoadRegistry() {
  if (!hasPermission("producerLicensing", "approve")) { denyPermission("producerLicensing", "approve"); return; }
  const file = refReadFile("ref_rg_file"); if (!file) return;
  const parsed = refParseRegistry(await file.text());
  if (!parsed.records.length) { showToast("⛔ Nothing could be loaded from " + file.name + ": " + (parsed.skipped[0] ? parsed.skipped[0].reason : "no producers") + ".", "danger"); return; }
  PRODUCER_REGISTRY.length = 0; parsed.records.forEach(r => PRODUCER_REGISTRY.push(r));
  // The carrier typed in the box wins only if it was changed; otherwise the file's single carrier is used.
  const box = document.getElementById("ref_rg_carrier");
  const typed = box && box.value.trim() && box.value !== box.getAttribute("data-initial") ? box.value.trim() : "";
  if (typed) PRODUCER_DEFAULT_CARRIER = typed; else if (parsed.carrier) PRODUCER_DEFAULT_CARRIER = parsed.carrier;
  REF_META.registry = { fileName: file.name, format: parsed.format, loadedAt: refNow(), loadedBy: refActor(), count: parsed.counts.producers, counts: parsed.counts, carriers: parsed.carriers, skipped: parsed.skipped.slice(0, 20), skippedCount: parsed.skipped.length };
  refPersist("registry");
  const note = parsed.carriers.length > 1 && !parsed.carriers.some(c => c === PRODUCER_DEFAULT_CARRIER) ? ` Appointments are with ${parsed.carriers.join(", ")}: enter the carrier this program writes for.` : "";
  showToast(`✅ Registry loaded: ${parsed.counts.producers} producer(s), ${parsed.counts.licences} licence(s), ${parsed.counts.appointments} appointment(s) from ${file.name}${parsed.skipped.length ? ` (${parsed.skipped.length} row(s) skipped)` : ""}. Appointments are checked against "${PRODUCER_DEFAULT_CARRIER}".${note}`, note ? "warning" : "success");
  refAfterLoad("registry");
}

function refClear(kind) {
  const perm = kind === "watchlist" ? ["sanctions", "approve"] : ["producerLicensing", "approve"];
  if (!hasPermission(perm[0], perm[1])) { denyPermission(perm[0], perm[1]); return; }
  if (kind === "watchlist") { SANCTIONS_WATCHLIST.length = 0; SANCTIONS_LIST_NAME = "No watchlist loaded"; SANCTIONS_LIST_VERSION = "none"; }
  else PRODUCER_REGISTRY.length = 0;
  REF_META[kind] = null;
  try { localStorage.removeItem(REF_KEYS[kind]); } catch (e) {}
  showToast(`${kind === "watchlist" ? "Watchlist" : "Registry"} cleared.`, "info");
  refAfterLoad(kind);
}

function refSetCarrier() {
  if (!hasPermission("producerLicensing", "approve")) { denyPermission("producerLicensing", "approve"); return; }
  const v = ((document.getElementById("ref_rg_carrier") || {}).value || "").trim();
  if (!v) { showToast("⚠️ Enter the carrier name.", "warning"); return; }
  PRODUCER_DEFAULT_CARRIER = v;
  if (REF_META.registry) refPersist("registry");
  showToast(`Appointments are now checked against "${v}".`, "success");
  refAfterLoad("registry");
}

// ----------------------------------------------------------------------------
// 4. DISPLAY (a panel under each card)
// ----------------------------------------------------------------------------
function refSkippedHtml(m) {
  if (!m || !m.skippedCount) return "";
  return `<details style="margin-top:6px;"><summary class="text-xs">${m.skippedCount} row(s) could not be read</summary><ul class="text-xs" style="margin:4px 0 0 18px;">${m.skipped.map(s => `<li>${s.row ? "Row " + s.row + ": " : ""}${refEsc(s.reason)}</li>`).join("")}${m.skippedCount > m.skipped.length ? "<li>…</li>" : ""}</ul></details>`;
}

function refPanelHtml(kind) {
  const isWl = kind === "watchlist";
  const m = REF_META[kind];
  const can = isWl ? hasPermission("sanctions", "approve") : hasPermission("producerLicensing", "approve");
  const loaded = isWl ? SANCTIONS_WATCHLIST.length > 0 : PRODUCER_REGISTRY.length > 0;
  const status = loaded
    ? (isWl ? `<strong>${refEsc(SANCTIONS_LIST_NAME)}</strong>, version ${refEsc(SANCTIONS_LIST_VERSION)}: ${SANCTIONS_WATCHLIST.length.toLocaleString("en-US")} entries.` : `<strong>${PRODUCER_REGISTRY.length.toLocaleString("en-US")}</strong> producer(s); appointments are checked against <strong>${refEsc(PRODUCER_DEFAULT_CARRIER)}</strong>.`)
    : (isWl ? "No watchlist is loaded." : "No licensing registry is loaded.");
  const from = m ? ` Loaded from ${refEsc(m.fileName)} by ${refEsc(m.loadedBy)} on ${refEsc(m.loadedAt)}${m.notSaved ? " (this session only)" : ""}.` : "";
  const help = isWl
    ? `Accepted: the OFAC SDN.CSV as downloaded from treasury.gov, a CSV with the columns <code>name, aliases, type, program</code> (aliases separated by ; or |), or JSON.`
    : `Accepted: CSV with <code>producer_name, npn, license_state, license_number, license_lines, license_status, license_expires, appointment_carrier, appointment_state, appointment_lobs, appointment_status, appointment_effective</code> (one row per licence or appointment; rows with the same NPN are one producer; a blank status counts as Active; lobs are product keys such as trucking, or * for all), or JSON.`;
  const controls = can ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;">
      <input type="file" id="${isWl ? "ref_wl_file" : "ref_rg_file"}" accept=".csv,.json,.txt,text/csv,application/json">
      ${isWl ? `<input id="ref_wl_name" class="form-control" style="width:200px;" placeholder="List name (optional)"><input id="ref_wl_ver" class="form-control" style="width:130px;" placeholder="Version (optional)">`
             : `<input id="ref_rg_carrier" class="form-control" style="width:230px;" placeholder="Carrier this program writes for" value="${refEsc(PRODUCER_DEFAULT_CARRIER)}" data-initial="${refEsc(PRODUCER_DEFAULT_CARRIER)}">`}
      <button class="btn btn-sm btn-primary" style="width:auto;" onclick="${isWl ? "refLoadWatchlist()" : "refLoadRegistry()"}"><i class="ph ph-upload-simple"></i> Load file</button>
      ${isWl ? "" : `<button class="btn btn-sm btn-outline" style="width:auto;" onclick="refSetCarrier()">Set carrier</button>`}
      ${loaded ? `<button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="refClear('${kind}')">Clear</button>` : ""}
    </div>` : `<div class="text-xs text-muted" style="margin-top:6px;"><i class="ph ph-lock"></i> Loading ${isWl ? "a watchlist" : "a registry"} needs approval rights on ${isWl ? "sanctions screening" : "producer licensing"}.</div>`;
  return `<div class="card" style="margin-top:8px;"><div class="card-body" style="padding:10px 14px;">
      <div class="text-xs"><i class="ph ph-database"></i> <strong>${isWl ? "Watchlist" : "Licensing registry"}:</strong> ${status}${from}</div>
      ${refSkippedHtml(m)}${controls}
      <details style="margin-top:6px;"><summary class="text-xs">File format</summary><div class="text-xs text-muted" style="margin-top:4px;">${help}</div></details>
    </div></div>`;
}

// ----------------------------------------------------------------------------
// 5. HOOKS
// ----------------------------------------------------------------------------
(function refInstall() {
  refRestore();
  const wrap = (name, boxId, kind) => {
    const orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function (sub) {
      const r = orig.apply(this, arguments);
      try { const box = document.getElementById(boxId); if (box && sub) box.insertAdjacentHTML("beforeend", refPanelHtml(kind)); } catch (e) { console.warn("Reference data panel failed:", e); }
      return r;
    };
  };
  wrap("renderSanctionsCard", "sanctionsScreeningContainer", "watchlist");
  wrap("renderProducerCard", "producerLicensingContainer", "registry");
})();

window.refLoadWatchlist = refLoadWatchlist; window.refLoadRegistry = refLoadRegistry; window.refClear = refClear; window.refSetCarrier = refSetCarrier;
