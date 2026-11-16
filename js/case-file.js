/**
 * ============================================================================
 * CASE FILE: NOTES, EMAIL HISTORY, TELEMATICS, FORMS PACK
 * ----------------------------------------------------------------------------
 * One page for the open case (button "Case File" in the bar at the bottom of the workflow), with tabs:
 *
 *   NOTES      free-form notes on the file: type, text, who wrote it and when, pin to the top. Notes are never edited or
 *              deleted (an audit trail), only added, pinned and searched.
 *   EMAILS     every message on the case in one list: the email the case arrived with, follow-ups attached to it at triage,
 *              the quotation sent to the broker, and any email logged by hand (in or out). Newest first.
 *   TELEMATICS fleet telematics loaded from a file (CSV or JSON, one row per vehicle and period: unit or VIN, period start and
 *              end, miles, hard brakes, speeding events, harsh accelerations, score). Each load is kept as a history entry;
 *              the page shows the latest load per vehicle and the fleet's events per 1,000 miles. Nothing is made up: with no
 *              file loaded the tab says so.
 *   FORMS      the forms pack: tick which policy forms apply to the case from the FORMS LIBRARY and export the list. The library
 *              starts empty; an authorised person adds forms (number, title, edition, lines of business, mandatory or not) or
 *              imports a CSV of them. A form marked mandatory for the case's line is ticked and cannot be unticked. Exported
 *              lists record who chose them and when.
 *
 * Notes, emails and telematics live on the case (sub.notes, sub.emailLog, sub.telematics). The forms library lives in the
 * browser (localStorage). There is no server.
 * ============================================================================
 */

const CF_FORMS_KEY = "FUT_FORMS_LIBRARY_V1";
const CF_NOTE_TYPES = ["General", "Underwriting", "Broker call", "Risk concern", "Follow-up"];
var CF_FORMS = [];
try { const r = JSON.parse(localStorage.getItem(CF_FORMS_KEY)); if (Array.isArray(r)) CF_FORMS = r; } catch (e) { /* none yet */ }
var CF = { tab: "notes", noteSearch: "", emailOpen: null };

function cfEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s); }
function cfNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function cfActor() { const r = typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]; return r ? r.name + " (" + r.title + ")" : String(currentUserRole); }
function cfSub() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }
function cfSave() { if (typeof persistAppState === "function") persistAppState(); }
function cfRead(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function cfCanEdit(sub) { return !!sub && hasPermission("submissionData", "edit"); }

// ----------------------------------------------------------------------------
// 1. NOTES
// ----------------------------------------------------------------------------
/** Adds a note to a case. Returns { ok, note } or { ok: false, message }. */
function cfAddNote(sub, f) {
  if (!sub) return { ok: false, message: "No case is open." };
  const text = String(f.text || "").trim();
  if (text.length < 3) return { ok: false, message: "Write the note (at least 3 characters)." };
  if (CF_NOTE_TYPES.indexOf(f.type) < 0) return { ok: false, message: "Choose the type of note." };
  if (!sub.notes) sub.notes = [];
  const n = { id: "NOTE-" + (sub.notes.length + 1), type: f.type, text, by: cfActor(), role: currentUserRole, at: cfNow(), pinned: !!f.pinned };
  sub.notes.push(n);
  cfSave();
  return { ok: true, note: n };
}
function cfPinNote(sub, id) { const n = (sub.notes || []).find(x => x.id === id); if (!n) return false; n.pinned = !n.pinned; cfSave(); return true; }
/** Pinned first, then newest first; optionally filtered by words. */
function cfNotes(sub, term) {
  const t = String(term || "").toLowerCase();
  return (sub.notes || []).map((n, i) => ({ n, i })).filter(x => !t || (x.n.text + " " + x.n.type + " " + x.n.by).toLowerCase().indexOf(t) > -1)
    .sort((a, b) => (b.n.pinned ? 1 : 0) - (a.n.pinned ? 1 : 0) || b.i - a.i).map(x => x.n);
}
function cfNotesHtml(sub) {
  const can = cfCanEdit(sub), list = cfNotes(sub, CF.noteSearch);
  const form = can ? `<div class="card"><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="cf_ntype">Type</label><select class="form-control" id="cf_ntype">${CF_NOTE_TYPES.map(t => `<option>${t}</option>`).join("")}</select></div>
    <div class="form-group mw-wide"><label for="cf_ntext">Note</label><textarea class="form-control" id="cf_ntext" rows="3" placeholder="What you learned, agreed or are worried about"></textarea></div></div>
    <div class="p1-actions"><label class="mw-check" style="margin-right:auto;"><input type="checkbox" id="cf_npin"> Pin to the top</label><button class="btn btn-primary" onclick="cfAddNoteForm()"><i class="ph ph-plus"></i> Add note</button></div></div></div>` : `<div class="p1-note">Adding notes needs edit rights on submission data.</div>`;
  const search = (sub.notes || []).length > 3 ? `<input class="form-control" id="cf_nsearch" placeholder="Search notes" value="${cfEsc(CF.noteSearch)}" onkeyup="cfNoteSearch()" style="margin-bottom:10px;">` : "";
  const items = list.length ? list.map(n => `<div class="cf-note${n.pinned ? " pinned" : ""}"><div class="cf-note-h"><span class="badge badge-light">${cfEsc(n.type)}</span> <strong>${cfEsc(n.by)}</strong> <span class="text-muted">${cfEsc(n.at)}</span>${n.pinned ? ' <i class="ph ph-push-pin"></i>' : ""}<button class="btn btn-xs btn-outline" style="width:auto;margin-left:auto;" onclick="cfPinForm('${n.id}')">${n.pinned ? "Unpin" : "Pin"}</button></div><div class="cf-note-t">${cfEsc(n.text)}</div></div>`).join("")
    : `<div class="mw-empty">${(sub.notes || []).length ? "No note matches." : "No notes yet."}</div>`;
  return form + search + items + `<div class="p1-note">Notes are never edited or deleted, so the file keeps what was known and when.</div>`;
}
function cfAddNoteForm() {
  const sub = cfSub(); if (!sub) return;
  if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; }
  const r = cfAddNote(sub, { type: cfRead("cf_ntype"), text: cfRead("cf_ntext"), pinned: !!(document.getElementById("cf_npin") || {}).checked });
  showToast(r.ok ? "✅ Note added." : "⛔ " + r.message, r.ok ? "success" : "danger");
  cfRender();
}
function cfPinForm(id) { const sub = cfSub(); if (sub && cfCanEdit(sub)) cfPinNote(sub, id); cfRender(); }
function cfNoteSearch() { CF.noteSearch = cfRead("cf_nsearch"); cfRender(); const e = document.getElementById("cf_nsearch"); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }

// ----------------------------------------------------------------------------
// 2. EMAIL HISTORY
// ----------------------------------------------------------------------------
/** Logs an email by hand. Returns { ok, email } or { ok: false, message }. */
function cfLogEmail(sub, f) {
  if (!sub) return { ok: false, message: "No case is open." };
  if (["in", "out"].indexOf(f.direction) < 0) return { ok: false, message: "Choose whether it was received or sent." };
  if (!String(f.party || "").trim()) return { ok: false, message: "Enter who it was " + (f.direction === "in" ? "from" : "to") + "." };
  if (String(f.subject || "").trim().length < 3) return { ok: false, message: "Enter the subject." };
  if (!sub.emailLog) sub.emailLog = [];
  const e = { id: "EML-" + (sub.emailLog.length + 1), direction: f.direction, party: String(f.party).trim(), subject: String(f.subject).trim(), body: String(f.body || "").trim(), at: f.at || cfNow(), by: cfActor(), source: "logged" };
  sub.emailLog.push(e); cfSave();
  return { ok: true, email: e };
}
/** Every message on the case, newest first: the arrival email, follow-ups, the quotation sent, and the ones logged by hand. */
function cfEmails(sub) {
  const out = [];
  if (sub.rawEmailText) out.push({ id: "ARRIVED", direction: "in", party: sub.broker || sub.insured || "Sender", subject: "Submission email as received", body: sub.rawEmailText, at: sub.receivedTimestamp ? new Date(sub.receivedTimestamp).toISOString().slice(0, 16).replace("T", " ") : (sub.receivedAt || ""), by: "", source: "arrival", files: (sub.rawAttachments || []).map(a => a.name) });
  (sub.followUpEmails || []).forEach((f, i) => out.push({ id: "FUP-" + (i + 1), direction: "in", party: sub.broker || "Sender", subject: "Follow-up attached from " + f.fromCase, body: f.text || "", at: f.at || "", by: f.by || "", source: "follow-up", files: f.files || [] }));
  if (sub.issuedQuoteEmail) {
    const p = sub.issuedQuoteEmail.payload || {};
    out.push({ id: "QUOTE", direction: "out", party: (p.to && p.to.broker) || sub.broker || "Broker", subject: "Quotation sent", body: (sub.issuedQuoteEmail.lines || []).join("\n"), at: String(sub.issuedQuoteEmail.sentAt || "").slice(0, 16).replace("T", " "), by: "", source: "quotation", files: [] });
  }
  (sub.emailLog || []).forEach(e => out.push(Object.assign({ files: [] }, e)));
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
function cfEmailsHtml(sub) {
  const can = cfCanEdit(sub), list = cfEmails(sub);
  const form = can ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> Log an email</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="cf_edir">Direction</label><select class="form-control" id="cf_edir"><option value="in">Received</option><option value="out">Sent</option></select></div>
    <div class="form-group"><label for="cf_eparty">From / to</label><input class="form-control" id="cf_eparty"></div><div class="form-group mw-wide"><label for="cf_esubj">Subject</label><input class="form-control" id="cf_esubj"></div>
    <div class="form-group mw-wide"><label for="cf_ebody">Message <span class="text-muted">(optional)</span></label><textarea class="form-control" id="cf_ebody" rows="3"></textarea></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="cfLogEmailForm()">Add to history</button></div></div></details>` : "";
  const items = list.length ? list.map(e => `<div class="cf-note"><div class="cf-note-h"><span class="badge ${e.direction === "in" ? "badge-info" : "badge-success"}">${e.direction === "in" ? "Received" : "Sent"}</span> <strong>${cfEsc(e.subject)}</strong><span class="text-muted" style="margin-left:auto;">${cfEsc(e.at)}</span></div>
    <div class="p1-note" style="margin:0 0 4px;">${e.direction === "in" ? "From" : "To"}: ${cfEsc(e.party)}${e.by ? " · logged by " + cfEsc(e.by) : ""}${e.files && e.files.length ? " · files: " + cfEsc(e.files.join(", ")) : ""}</div>
    ${e.body ? `<details><summary class="text-xs" style="cursor:pointer;">Show message</summary><pre class="cf-pre">${cfEsc(e.body)}</pre></details>` : ""}</div>`).join("") : `<div class="mw-empty">No messages on this case yet.</div>`;
  return form + items;
}
function cfLogEmailForm() {
  const sub = cfSub(); if (!sub) return;
  if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; }
  const r = cfLogEmail(sub, { direction: cfRead("cf_edir"), party: cfRead("cf_eparty"), subject: cfRead("cf_esubj"), body: cfRead("cf_ebody") });
  showToast(r.ok ? "✅ Email added to the history." : "⛔ " + r.message, r.ok ? "success" : "danger");
  cfRender();
}

// ----------------------------------------------------------------------------
// 3. TELEMATICS
// ----------------------------------------------------------------------------
const CF_TEL_COLS = { unit: ["unit", "unit_id", "vehicle", "vin"], start: ["period_start", "start", "from"], end: ["period_end", "end", "to"], miles: ["miles", "distance"], hardBrake: ["hard_brake", "hard_brakes", "harsh_braking"], speeding: ["speeding", "speeding_events"], accel: ["harsh_accel", "harsh_acceleration"], score: ["score", "safety_score"] };
function cfCsvRows(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const split = l => { const out = []; let cur = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; } out.push(cur); return out.map(x => x.trim()); };
  const head = split(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  return lines.slice(1).map(l => { const v = split(l), o = {}; head.forEach((h, i) => { o[h] = v[i]; }); return o; });
}
/** Reads a telematics file into rows. Returns { ok, rows, skipped } or { ok: false, message }. A row that cannot be read is listed, never guessed. */
function cfParseTelematics(text, name) {
  let raw;
  try { raw = /\.json$/i.test(name || "") || /^\s*[\[{]/.test(text) ? (() => { const j = JSON.parse(text); return Array.isArray(j) ? j : (j.rows || j.vehicles || []); })() : cfCsvRows(text); }
  catch (e) { return { ok: false, message: "The file could not be read as CSV or JSON." }; }
  if (!raw.length) return { ok: false, message: "The file has no rows." };
  const pick = (o, keys) => { const k = Object.keys(o).find(x => keys.indexOf(String(x).toLowerCase().replace(/[^a-z0-9]+/g, "_")) > -1); return k === undefined ? undefined : o[k]; };
  const rows = [], skipped = [];
  raw.forEach((o, i) => {
    const unit = String(pick(o, CF_TEL_COLS.unit) || "").trim(), miles = Number(String(pick(o, CF_TEL_COLS.miles) || "").replace(/,/g, ""));
    if (!unit) { skipped.push({ row: i + 2, reason: "no unit or VIN" }); return; }
    if (!(miles >= 0) || String(pick(o, CF_TEL_COLS.miles) || "") === "") { skipped.push({ row: i + 2, reason: "miles is missing or not a number" }); return; }
    const num = k => { const v = pick(o, CF_TEL_COLS[k]); return v === undefined || v === "" ? null : Number(String(v).replace(/,/g, "")); };
    rows.push({ unit, start: String(pick(o, CF_TEL_COLS.start) || ""), end: String(pick(o, CF_TEL_COLS.end) || ""), miles, hardBrake: num("hardBrake"), speeding: num("speeding"), accel: num("accel"), score: num("score") });
  });
  return rows.length ? { ok: true, rows, skipped } : { ok: false, message: "No row could be read: " + (skipped[0] ? skipped[0].reason : "empty") + "." };
}
/** Keeps a load on the case as a history entry. */
function cfAddTelematics(sub, text, name) {
  if (!sub) return { ok: false, message: "No case is open." };
  const p = cfParseTelematics(text, name);
  if (!p.ok) return p;
  if (!sub.telematics) sub.telematics = [];
  const load = { id: "TEL-" + (sub.telematics.length + 1), file: name || "pasted", at: cfNow(), by: cfActor(), rows: p.rows, skipped: p.skipped };
  sub.telematics.push(load); cfSave();
  return { ok: true, load };
}
/** The latest row for each vehicle across all loads, and the fleet totals. */
function cfTelematicsSummary(sub) {
  const latest = {};
  (sub.telematics || []).forEach(l => l.rows.forEach(r => { latest[r.unit] = Object.assign({ load: l.id }, r); }));
  const rows = Object.keys(latest).map(k => latest[k]);
  const sum = k => rows.reduce((n, r) => n + (r[k] || 0), 0), miles = sum("miles");
  const per = k => miles > 0 && rows.some(r => r[k] !== null) ? Math.round(sum(k) / miles * 1000 * 100) / 100 : null;
  const scored = rows.filter(r => r.score !== null);
  return { rows, vehicles: rows.length, miles, hardBrakePer1000: per("hardBrake"), speedingPer1000: per("speeding"), accelPer1000: per("accel"), avgScore: scored.length ? Math.round(scored.reduce((n, r) => n + r.score, 0) / scored.length * 10) / 10 : null };
}
function cfTelematicsHtml(sub) {
  const can = cfCanEdit(sub), s = cfTelematicsSummary(sub), loads = sub.telematics || [];
  const form = can ? `<div class="card"><div class="card-body"><label class="p1-label" for="cf_tfile">Load a telematics file (CSV or JSON)</label><input type="file" id="cf_tfile" accept=".csv,.json,text/csv,application/json"><details style="margin-top:8px;"><summary class="text-xs" style="cursor:pointer;">File format</summary><div class="p1-note">One row per vehicle and period. Columns: <code>unit</code> (or <code>vin</code>), <code>period_start</code>, <code>period_end</code>, <code>miles</code>, <code>hard_brake</code>, <code>speeding</code>, <code>harsh_accel</code>, <code>score</code>. Only unit and miles are required.</div></details>
    <div class="p1-actions"><button class="btn btn-primary" onclick="cfLoadTelematicsFile()"><i class="ph ph-upload-simple"></i> Load</button></div></div></div>` : "";
  if (!loads.length) return form + `<div class="mw-empty">No telematics data has been loaded for this case. Load the carrier's or the insured's telematics export to see it here.</div>`;
  const f = v => v === null ? "—" : v;
  const tiles = `<div class="mw-tiles"><div class="mw-tile"><div class="mw-tile-n">${s.vehicles}</div><div class="mw-tile-l">Vehicles</div></div><div class="mw-tile"><div class="mw-tile-n">${s.miles.toLocaleString("en-US")}</div><div class="mw-tile-l">Miles</div></div><div class="mw-tile"><div class="mw-tile-n">${f(s.hardBrakePer1000)}</div><div class="mw-tile-l">Hard brakes per 1,000 mi</div></div><div class="mw-tile"><div class="mw-tile-n">${f(s.speedingPer1000)}</div><div class="mw-tile-l">Speeding per 1,000 mi</div></div><div class="mw-tile"><div class="mw-tile-n">${f(s.avgScore)}</div><div class="mw-tile-l">Average score</div></div></div>`;
  const rows = `<div class="card"><div class="card-header"><h3>Latest by vehicle</h3></div><div class="card-body"><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Unit / VIN</th><th>Period</th><th>Miles</th><th>Hard brakes</th><th>Speeding</th><th>Harsh accel.</th><th>Score</th></tr></thead><tbody>${s.rows.map(r => `<tr><td>${cfEsc(r.unit)}</td><td>${cfEsc(r.start || "—")} to ${cfEsc(r.end || "—")}</td><td>${r.miles.toLocaleString("en-US")}</td><td>${f(r.hardBrake)}</td><td>${f(r.speeding)}</td><td>${f(r.accel)}</td><td>${f(r.score)}</td></tr>`).join("")}</tbody></table></div></div></div>`;
  const hist = `<div class="card"><div class="card-header"><h3>History</h3></div><div class="card-body"><table class="data-table"><thead><tr><th>Load</th><th>File</th><th>When</th><th>By</th><th>Rows</th><th>Skipped</th></tr></thead><tbody>${loads.slice().reverse().map(l => `<tr><td>${l.id}</td><td>${cfEsc(l.file)}</td><td>${cfEsc(l.at)}</td><td>${cfEsc(l.by)}</td><td>${l.rows.length}</td><td>${l.skipped.length ? l.skipped.length + " (" + cfEsc(l.skipped.slice(0, 3).map(x => "row " + x.row + ": " + x.reason).join("; ")) + ")" : 0}</td></tr>`).join("")}</tbody></table></div></div>`;
  return form + tiles + rows + hist;
}
async function cfLoadTelematicsFile() {
  const sub = cfSub(), input = document.getElementById("cf_tfile"), file = input && input.files && input.files[0];
  if (!sub) return;
  if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; }
  if (!file) { showToast("⚠️ Choose a file first.", "warning"); return; }
  const r = cfAddTelematics(sub, await file.text(), file.name);
  showToast(r.ok ? `✅ ${r.load.rows.length} vehicle row(s) loaded${r.load.skipped.length ? ", " + r.load.skipped.length + " skipped" : ""}.` : "⛔ " + r.message, r.ok ? "success" : "danger");
  cfRender();
}

// ----------------------------------------------------------------------------
// 4. FORMS PACK
// ----------------------------------------------------------------------------
function cfSaveForms() { try { localStorage.setItem(CF_FORMS_KEY, JSON.stringify(CF_FORMS)); } catch (e) { /* keep for this session */ } }
/** Adds a form to the library. Returns { ok, form } or { ok: false, message }. */
function cfAddForm(f) {
  const number = String(f.number || "").trim(), title = String(f.title || "").trim();
  if (!number) return { ok: false, message: "Enter the form number." };
  if (title.length < 3) return { ok: false, message: "Enter the form title." };
  if (CF_FORMS.some(x => x.number.toLowerCase() === number.toLowerCase() && String(x.edition || "") === String(f.edition || ""))) return { ok: false, message: "That form and edition are already in the library." };
  const lobs = (Array.isArray(f.lobs) ? f.lobs : String(f.lobs || "").split(/[;|,]/)).map(x => String(x).trim()).filter(Boolean);
  const bad = lobs.filter(k => !LOB_CATALOG.some(l => l.key === k));
  if (bad.length) return { ok: false, message: "Unknown line of business: " + bad.join(", ") + "." };
  const form = { id: "FRM-" + (CF_FORMS.length + 1), number, title, edition: String(f.edition || "").trim(), lobs, mandatory: !!f.mandatory };
  CF_FORMS.push(form); cfSaveForms();
  return { ok: true, form };
}
/** Imports a CSV (number, title, edition, lobs, mandatory). Returns { added, skipped: [{ row, reason }] }. */
function cfImportForms(text) {
  const rows = cfCsvRows(text), skipped = []; let added = 0;
  rows.forEach((r, i) => { const x = cfAddForm({ number: r.number, title: r.title, edition: r.edition, lobs: r.lobs, mandatory: /^(y|yes|true|1)$/i.test(r.mandatory || "") }); if (x.ok) added++; else skipped.push({ row: i + 2, reason: x.message }); });
  return { added, skipped };
}
/** The library's forms for a line of business (a form with no line applies to all). */
function cfFormsFor(sub) { return CF_FORMS.filter(f => !f.lobs.length || f.lobs.indexOf(sub.lobKey) > -1); }
function cfPack(sub) { if (!sub.formsPack) sub.formsPack = { selected: [], updatedBy: null, updatedAt: null, exports: [] }; return sub.formsPack; }
/** The forms on a case's pack: those it chose plus the mandatory ones. */
function cfSelectedForms(sub) { const p = cfPack(sub); return cfFormsFor(sub).filter(f => f.mandatory || p.selected.indexOf(f.id) > -1); }
function cfToggleForm(sub, id, on) {
  const f = CF_FORMS.find(x => x.id === id); if (!f || cfFormsFor(sub).indexOf(f) < 0) return false;
  if (f.mandatory) return false;
  const p = cfPack(sub), i = p.selected.indexOf(id);
  if (on && i < 0) p.selected.push(id); else if (!on && i > -1) p.selected.splice(i, 1); else return true;
  p.updatedBy = cfActor(); p.updatedAt = cfNow(); cfSave();
  return true;
}
/** The export: a CSV of the chosen forms, with who chose them and when. */
function cfFormsCsv(sub) {
  const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"', p = cfPack(sub);
  return ["Case,Insured,Line of business,Exported by,Exported at", [sub.id, sub.insured, sub.lobName, cfActor(), cfNow()].map(q).join(","), "", "Form number,Title,Edition,Mandatory"].concat(cfSelectedForms(sub).map(f => [f.number, f.title, f.edition, f.mandatory ? "Yes" : "No"].map(q).join(","))).join("\n");
}
function cfExportForms() {
  const sub = cfSub(); if (!sub) return;
  const forms = cfSelectedForms(sub);
  if (!forms.length) { showToast("⚠️ No forms are selected.", "warning"); return; }
  const csv = cfFormsCsv(sub), p = cfPack(sub);
  p.exports.push({ at: cfNow(), by: cfActor(), count: forms.length }); cfSave();
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = sub.id + "_forms.csv"; document.body.appendChild(a); a.click(); a.remove();
  showToast(`✅ ${forms.length} form(s) exported.`, "success");
  cfRender();
}
function cfFormsHtml(sub) {
  const can = cfCanEdit(sub), canLib = hasPermission("reviewRules", "edit"), lib = cfFormsFor(sub), sel = cfSelectedForms(sub).map(f => f.id), p = cfPack(sub);
  let body;
  if (!CF_FORMS.length) body = `<div class="mw-empty">The forms library is empty. ${canLib ? "Add forms below or import a CSV, then tick the ones that apply to each case." : "Someone with rights on review rules adds the library."}</div>`;
  else if (!lib.length) body = `<div class="mw-empty">No form in the library applies to ${cfEsc(sub.lobName || sub.lobKey)}.</div>`;
  else body = `<div class="card"><div class="card-body"><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th></th><th>Form</th><th>Title</th><th>Edition</th></tr></thead><tbody>${lib.map(f => `<tr><td><input type="checkbox" aria-label="Include ${cfEsc(f.number)}" ${sel.indexOf(f.id) > -1 ? "checked" : ""} ${f.mandatory || !can ? "disabled" : ""} onchange="cfToggleFormUi('${f.id}', this.checked)"></td><td class="font-mono">${cfEsc(f.number)}</td><td>${cfEsc(f.title)}${f.mandatory ? ' <span class="badge badge-warning">Mandatory</span>' : ""}</td><td>${cfEsc(f.edition || "—")}</td></tr>`).join("")}</tbody></table></div>
    <div class="p1-actions"><span class="p1-note" style="margin-right:auto;">${sel.length} selected${p.updatedBy ? " · last changed by " + cfEsc(p.updatedBy) + " " + cfEsc(p.updatedAt) : ""}${p.exports.length ? " · exported " + p.exports.length + " time(s)" : ""}</span><button class="btn btn-primary" onclick="cfExportForms()"${sel.length ? "" : " disabled"}><i class="ph ph-download-simple"></i> Export list</button></div></div></div>`;
  const libForm = canLib ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-books"></i> Forms library (${CF_FORMS.length})</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="cf_fnum">Form number</label><input class="form-control" id="cf_fnum"></div><div class="form-group mw-wide"><label for="cf_ftitle">Title</label><input class="form-control" id="cf_ftitle"></div><div class="form-group"><label for="cf_fed">Edition</label><input class="form-control" id="cf_fed" placeholder="e.g. 10 13"></div>
    <div class="form-group mw-wide"><label for="cf_flobs">Lines of business <span class="text-muted">(keys, separated by ; or leave empty for all)</span></label><input class="form-control" id="cf_flobs" placeholder="${LOB_CATALOG.map(l => l.key).join("; ")}"></div><div class="form-group"><label><input type="checkbox" id="cf_fmand"> Mandatory</label></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="cfAddFormUi()">Add form</button></div>
    <label class="p1-label" for="cf_fcsv" style="margin-top:10px;">Or import a CSV (number, title, edition, lobs, mandatory)</label><input type="file" id="cf_fcsv" accept=".csv,text/csv"><div class="p1-actions"><button class="btn btn-outline" onclick="cfImportFormsUi()">Import</button></div></div></details>` : "";
  return body + libForm;
}
function cfToggleFormUi(id, on) { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); } else cfToggleForm(sub, id, on); cfRender(); }
function cfAddFormUi() {
  const r = cfAddForm({ number: cfRead("cf_fnum"), title: cfRead("cf_ftitle"), edition: cfRead("cf_fed"), lobs: cfRead("cf_flobs"), mandatory: !!(document.getElementById("cf_fmand") || {}).checked });
  showToast(r.ok ? "✅ " + r.form.number + " added to the library." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender();
}
async function cfImportFormsUi() {
  const input = document.getElementById("cf_fcsv"), file = input && input.files && input.files[0];
  if (!file) { showToast("⚠️ Choose a file first.", "warning"); return; }
  const r = cfImportForms(await file.text());
  showToast(`${r.added} form(s) added${r.skipped.length ? ", " + r.skipped.length + " skipped (" + r.skipped.slice(0, 2).map(x => "row " + x.row + ": " + x.reason).join("; ") + ")" : ""}.`, r.added ? "success" : "danger"); cfRender();
}

// ----------------------------------------------------------------------------
// 5. THE PAGE
// ----------------------------------------------------------------------------
const CF_TABS = [["notes", "Notes", "ph-note-pencil"], ["emails", "Email history", "ph-envelope"], ["telematics", "Telematics", "ph-gauge"], ["forms", "Forms pack", "ph-files"]];
function showCaseFilePage() {
  const sub = cfSub();
  if (!sub) { showToast("Open a case first.", "warning"); return; }
  currentPage = "case-file";
  resetAllTopLevelPages();
  setPageTitle("Case File");
  setBreadcrumb([{ label: "FUT", onClick: "showIntakePage()" }, { label: "Case File" }]);
  const page = document.getElementById("caseFilePageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }
  const footer = document.getElementById("workflowBottomFooter"); if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");
  cfRender();
}
function cfTab(t) { CF.tab = t; cfRender(); }
function cfExtraTabs() { return typeof cmTabs === "function" ? cmTabs() : []; }
function cfRender() {
  const root = document.getElementById("caseFileRoot"), sub = cfSub(); if (!root || !sub) return;
  const tabs = CF_TABS.concat(cfExtraTabs());
  if (!tabs.some(t => t[0] === CF.tab)) CF.tab = "notes";
  const counts = { notes: (sub.notes || []).length, emails: cfEmails(sub).length, telematics: (sub.telematics || []).length, forms: cfSelectedForms(sub).length };
  const bodies = { notes: cfNotesHtml, emails: cfEmailsHtml, telematics: cfTelematicsHtml, forms: cfFormsHtml };
  const body = bodies[CF.tab] ? bodies[CF.tab](sub) : (typeof cmBody === "function" ? cmBody(CF.tab, sub) : "");
  root.innerHTML = `<div class="p1-head"><div><h2 class="p1-h" style="margin:0;">${cfEsc(sub.insured)}</h2><div class="p1-id">${cfEsc(sub.id)} · ${cfEsc(sub.lobName || "")} · ${typeof fdStatus === "function" ? fdStatus(sub) : ""}</div></div><button class="btn btn-sm btn-outline" style="width:auto;" onclick="resumeActiveCaseWorkflow()"><i class="ph ph-arrow-left"></i> Back to workflow</button></div>
    <div class="mw-tabs">${tabs.map(t => `<button class="tab-btn${CF.tab === t[0] ? " active" : ""}" onclick="cfTab('${t[0]}')"><i class="ph ${t[2]}"></i> ${t[1]}${counts[t[0]] ? ` <span class="badge badge-light">${counts[t[0]]}</span>` : ""}</button>`).join("")}</div>${body}`;
}
