/**
 * ============================================================================
 * STATE GUIDELINES: WHERE WE WRITE, REFER OR DO NOT WRITE
 * ----------------------------------------------------------------------------
 * A register of the carrier's position by state (and, if it differs, by line of business), kept on the Search & Lookup page under the
 * tab "State guidelines". An entry has a state, a line (or all lines), a position, a note, the source of the rule (the guideline or
 * filing it comes from) and the date it takes effect.
 *
 *   Write          the carrier writes this state and line.
 *   Refer          a submission here goes to a senior underwriter.
 *   Do not write   the carrier does not write this state and line.
 *
 * The position in force on a date is the latest entry effective on or before it; an entry for a specific line beats one for all lines.
 * Phase 1's appetite check reads the register: a "Do not write" state fails the appetite check and is declined; "Refer" is shown to the
 * reviewer. This register is the ONE store of where the carrier writes: Phase 1 no longer has a placeholder list of states. It starts
 * empty because no carrier rules are built in, so until positions are recorded no state is restricted. (The notice-day tables for
 * cancellation and renewal, and the surplus-lines tax table, are different legal data kept with their own modules.)
 * Entries are never edited or deleted: a new entry supersedes the old one.
 * ============================================================================
 */

const SG_KEY = "FUT_STATE_GUIDELINES_V1";
const SG_POSITIONS = ["Write", "Refer", "Do not write"];
var SG_ENTRIES = [];
try { const r = JSON.parse(localStorage.getItem(SG_KEY)); if (Array.isArray(r)) SG_ENTRIES = r; } catch (e) { /* none yet */ }
var SG = { state: "", lob: "" };

function sgSave() { try { localStorage.setItem(SG_KEY, JSON.stringify(SG_ENTRIES)); } catch (e) { /* keep for this session */ } }
function sgRead(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }

/** Adds an entry. Returns { ok, entry } or { ok: false, message }. */
function sgAdd(f) {
  const state = String(f.state || "").toUpperCase();
  if (US_STATE_CODES_FOR_PRODUCER.indexOf(state) < 0) return { ok: false, message: "Choose the state." };
  const lob = f.lob || "all";
  if (lob !== "all" && !LOB_CATALOG.some(l => l.key === lob)) return { ok: false, message: "Choose the line of business, or all lines." };
  if (SG_POSITIONS.indexOf(f.position) < 0) return { ok: false, message: "Choose Write, Refer or Do not write." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.effective || "")) || isNaN(Date.parse(f.effective))) return { ok: false, message: "Enter the date it takes effect." };
  if (String(f.source || "").trim().length < 3) return { ok: false, message: "Say where the rule comes from (the guideline or filing)." };
  if (f.position !== "Write" && String(f.note || "").trim().length < 5) return { ok: false, message: "Explain a Refer or Do not write position (at least 5 characters)." };
  const e = { id: "SG-" + (SG_ENTRIES.length + 1), state, lob, position: f.position, note: String(f.note || "").trim(), source: String(f.source).trim(), effective: f.effective, by: typeof actorLabel === "function" ? actorLabel() : String(currentUserRole), at: new Date().toISOString().slice(0, 16).replace("T", " ") };
  SG_ENTRIES.push(e); sgSave();
  return { ok: true, entry: e };
}
/** The entry in force for a state and line on a date, or null. A line-specific entry beats an all-lines one. */
function sgFor(state, lobKey, onDate) {
  const d = onDate || todayIso(), st = String(state || "").toUpperCase();
  const inForce = SG_ENTRIES.filter(e => e.state === st && e.effective <= d);
  const pick = list => list.sort((a, b) => b.effective.localeCompare(a.effective) || b.id.localeCompare(a.id, undefined, { numeric: true }))[0] || null;
  return pick(inForce.filter(e => e.lob === lobKey)) || pick(inForce.filter(e => e.lob === "all"));
}
function sgHistory(state, lob) { return SG_ENTRIES.filter(e => (!state || e.state === state) && (!lob || e.lob === lob)).sort((a, b) => b.effective.localeCompare(a.effective) || b.id.localeCompare(a.id, undefined, { numeric: true })); }

function sgHtml() {
  const canEdit = hasPermission("reviewRules", "edit");
  const states = US_STATE_CODES_FOR_PRODUCER.map(c => `<option>${c}</option>`).join("");
  const form = canEdit ? `<details class="card"${SG_ENTRIES.length ? "" : " open"}><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> Add a position</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="sg_state">State</label><select class="form-control" id="sg_state"><option value="">Choose…</option>${states}</select></div><div class="form-group"><label for="sg_lob">Line</label><select class="form-control" id="sg_lob"><option value="all">All lines</option>${LOB_CATALOG.map(l => `<option value="${l.key}">${escHtml(l.name)}</option>`).join("")}</select></div>
    <div class="form-group"><label for="sg_pos">Position</label><select class="form-control" id="sg_pos">${SG_POSITIONS.map(p => `<option>${p}</option>`).join("")}</select></div><div class="form-group"><label for="sg_eff">Effective</label><input type="date" class="form-control" id="sg_eff" value="${todayIso()}"></div>
    <div class="form-group mw-wide"><label for="sg_src">Source of the rule</label><input class="form-control" id="sg_src" placeholder="e.g. Underwriting guideline UG-12, section 4"></div><div class="form-group mw-wide"><label for="sg_note">Note</label><input class="form-control" id="sg_note"></div></div>
    <div class="p1-note">A new position supersedes the old one from its effective date; nothing is edited or deleted. No state rule is built in.</div><div class="p1-actions"><button class="btn btn-primary" onclick="sgAddUi()">Add position</button></div></div></details>` : `<div class="p1-note">Adding a position needs edit rights on review rules.</div>`;
  const bar = `<div class="mw-dates" style="margin-bottom:10px;"><label>State <select class="form-control" id="sg_fstate" onchange="sgFilter()"><option value="">All</option>${US_STATE_CODES_FOR_PRODUCER.map(c => `<option${SG.state === c ? " selected" : ""}>${c}</option>`).join("")}</select></label></div>`;
  const list = sgHistory(SG.state, SG.lob);
  const rows = list.map(e => { const cur = sgFor(e.state, e.lob === "all" ? null : e.lob) === e || sgFor(e.state, e.lob) === e; return `<tr${cur ? "" : ' class="mw-done"'}><td><strong>${e.state}</strong></td><td>${e.lob === "all" ? "All lines" : escHtml((LOB_CATALOG.find(l => l.key === e.lob) || {}).name || e.lob)}</td><td><span class="badge ${e.position === "Write" ? "badge-success" : e.position === "Refer" ? "badge-warning" : "badge-danger"}">${e.position}</span></td><td>${escHtml(e.effective)}${cur ? "" : '<div class="p1-note">superseded or not yet in force</div>'}</td><td>${escHtml(e.note || "—")}<div class="p1-note">Source: ${escHtml(e.source)}</div></td><td>${escHtml(e.by)}</td></tr>`; }).join("");
  return form + bar + (list.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>State</th><th>Line</th><th>Position</th><th>Effective</th><th>Note and source</th><th>By</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No state positions are recorded. Add where the carrier writes, refers or does not write; Phase 1 reads this register.</div>`);
}
function sgAddUi() {
  if (!hasPermission("reviewRules", "edit")) { denyPermission("reviewRules", "edit"); return; }
  const r = sgAdd({ state: sgRead("sg_state"), lob: sgRead("sg_lob"), position: sgRead("sg_pos"), effective: sgRead("sg_eff"), source: sgRead("sg_src"), note: sgRead("sg_note") });
  showToast(r.ok ? "✅ Position added." : "⛔ " + r.message, r.ok ? "success" : "danger");
  if (typeof fdRender === "function") fdRender();
}
function sgFilter() { SG.state = sgRead("sg_fstate"); if (typeof fdRender === "function") fdRender(); }
