/**
 * ============================================================================
 * CLEARANCE BOARD: one verdict, five gates, exceptions first
 * ----------------------------------------------------------------------------
 * The Clearance screen used to be five cards stacked one after another, each with its own banner, so the reader had to open
 * every card to learn whether anything was wrong. It now reads top to bottom like this:
 *
 *   VERDICT        one sentence: held (a legal check has not passed), clear to continue, or "N things to decide".
 *   WHAT NEEDS YOU only the gates that are not clear, each with the reason and who can fix it.
 *   PHASE 1 NOTE   what the reviewer wrote when they approved the case, so nobody re-asks.
 *   GATE CARDS     the five gates in the order they are decided: producer licence, sanctions, broker of record, FEIN
 *                  duplicate, appetite. Each card shows its result in a few words. The detail is attached to the card:
 *                  click a card and only that gate's detail is shown, directly beneath the row. Producer licence is
 *                  the one shown when the screen opens.
 *
 * Nothing about the rules changed: the cards, their tools (record a verification, clear a match, load a registry, accept a
 * broker-of-record letter) and the hold on leaving Step 2 are the same. This file only reads them and presents them.
 * The FEIN and appetite results are worked out live from the case, so they are never stale.
 * ============================================================================
 */

var CL_GATES = [
  { key: "producer", title: "Producer licence & appointment", icon: "ph-identification-card" },
  { key: "sanctions", title: "Sanctions & watchlist", icon: "ph-shield-warning" },
  { key: "market", title: "Broker of record", icon: "ph-users-three" },
  { key: "fein", title: "FEIN duplicate", icon: "ph-fingerprint" },
  { key: "appetite", title: "Appetite", icon: "ph-target" }
];
var CL_UI = {};   // per case: which gate card is selected, so a redraw keeps it
var CL_DEFAULT_GATE = "producer";
var CL_TONE_LABEL = { pass: "Clear", fail: "Action needed", warn: "Review", wait: "Waiting" };

function clUi(sub) { return CL_UI[sub.id] || (CL_UI[sub.id] = {}); }
function clSelected(sub) { const k = clUi(sub).selected; return CL_GATES.some(g => g.key === k) ? k : CL_DEFAULT_GATE; }

/** The five gates for a case, each { key, title, icon, tone: pass | fail | warn | wait, headline, detail, fix, who }. */
function clearanceGates(sub) {
  const legal = clearanceChecks(sub), out = {}, gate = clearanceGateStatus(sub);   // gate: the shared pass / fail / unable, the same words Phase 1 uses
  const base = k => Object.assign({}, CL_GATES.find(g => g.key === k));
  const toneOf = w => w === "pass" ? "pass" : w === "unable" ? "warn" : "fail";

  // 1. producer licence
  const p = legal.producer;
  out.producer = Object.assign(base("producer"), p.ok
    ? { tone: "pass", headline: p.label || "Verified", detail: "" }
    : { tone: toneOf(gate.producer), headline: p.label || "Not verified", detail: p.detail, fix: gate.producer === "unable" ? "Load the licensing registry or record a verified lookup" : "Record a verified lookup, or decline",
        who: hasPermission("producerLicensing", "approve") ? "" : "needs a user with producer-licensing approval" });

  // 2. sanctions
  const s = legal.sanctions, st = typeof getSanctionsStatus === "function" ? getSanctionsStatus(sub) : { state: "not_screened" };
  out.sanctions = Object.assign(base("sanctions"), s.ok
    ? { tone: "pass", headline: s.label || "Clear", detail: "" }
    : { tone: toneOf(gate.sanctions), headline: s.label || "Not screened", detail: s.detail, fix: st.state === "blocked" ? "Escalate to Compliance" : st.state === "review_required" ? "Clear or confirm each match" : "Load a watchlist or record an external screening",
        who: hasPermission("sanctions", "approve") ? "" : "needs a user with sanctions approval" });

  // 3. broker of record (worked out without writing anything)
  const direct = sub.channelType !== "broker";
  let conflict = null;
  if (!direct && typeof comFindConflicts === "function") { try { conflict = comFindConflicts(sub, SUBMISSIONS_DATASET, Date.now()); } catch (e) { conflict = null; } }
  const resolved = !!(sub.marketClearance && sub.marketClearance.resolution);
  if (direct) out.market = Object.assign(base("market"), { tone: "pass", headline: "Direct: no broker", detail: "" });
  else if (conflict && conflict.state === "conflict" && !resolved) out.market = Object.assign(base("market"), { tone: "fail", headline: "Conflict with " + (conflict.holder ? conflict.holder.broker : "another broker"), detail: `${conflict.holder ? conflict.holder.broker : "Another broker"} submitted this insured for this line first (${conflict.holder ? conflict.holder.id : "earlier case"}).`, fix: "Accept a broker-of-record letter, clear as separate risks, or decline", who: hasPermission("brokerRelations", "edit") ? "" : "needs a user with broker-relations rights" });
  else out.market = Object.assign(base("market"), { tone: "pass", headline: resolved ? "Conflict resolved" : conflict && conflict.state === "holder" ? "Holds the market lock" : "No competing broker", detail: "" });

  // 4. FEIN duplicate (live)
  const digits = String(sub.fein || "").replace(/\D/g, "");
  if (digits.length !== 9) out.fein = Object.assign(base("fein"), { tone: "wait", headline: "FEIN not confirmed yet", detail: "The FEIN has not been read from the documents.", fix: "Confirm the extracted data" });
  else {
    const f = typeof p1CheckFein === "function" ? p1CheckFein(sub) : { status: "pass", summary: "No other active submission uses this FEIN.", lines: [] };
    out.fein = Object.assign(base("fein"), f.status === "fail"
      ? { tone: "fail", headline: "Duplicate of " + ((f.lines[0] || {}).text || "").split(":")[0], detail: f.summary, fix: "Decline as a duplicate, or correct the FEIN", who: hasPermission("workflow", "approve") ? "" : "needs a user who can approve workflow steps", lines: f.lines }
      : { tone: "pass", headline: "Unique FEIN", detail: "", lines: f.lines });
  }

  // 5. appetite (live)
  const m = typeof appetiteMatch === "function" ? appetiteMatch(sub) : { verdict: "none", total: 0, failed: [], hard: [], passed: 0 };
  const basic = sub.phase1 && typeof p1CheckAppetite === "function" ? p1CheckAppetite(sub) : null;
  let tone = "pass", headline = "In appetite", detail = "", fix = "";
  if (m.verdict === "out") { tone = "fail"; headline = "Outside appetite"; detail = m.hard.map(r => r.factor).join(", ") + " cannot be overridden."; fix = "Decline; the rule cannot be overridden"; }
  else if (basic && basic.status === "fail") { tone = "fail"; headline = "Outside appetite"; detail = basic.summary; fix = "Correct the details, or decline"; }
  else if (m.verdict === "exceptions") { tone = "warn"; headline = "In appetite with exceptions"; detail = m.failed.map(r => r.factor).join(", ") + " failed; an approver may override."; fix = "Override with a reason, or decline"; }
  else if (m.verdict === "none" && !basic) { tone = "wait"; headline = "No appetite rules for this product"; detail = "The product has no appetite rules to evaluate."; }
  else headline = m.total ? `${m.passed} of ${m.total} rules pass` : "Within appetite";
  out.appetite = Object.assign(base("appetite"), { tone, headline, detail, fix, who: tone === "warn" && !hasPermission("appetiteRules", "override") ? "needs a user who may override appetite rules" : "", basic });
  return CL_GATES.map(g => out[g.key]);
}

function clSummaryHtml(g) {
  return `<i class="ph ${g.icon} cl-ico"></i><span class="cl-title">${escHtml(g.title)}</span><span class="cl-line">${escHtml(g.headline)}</span><span class="cl-chip ${g.tone}">${CL_TONE_LABEL[g.tone]}</span>`;
}

function renderClearanceBoard(sub) {
  const box = document.getElementById("clearanceHoldContainer");
  if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const legal = clearanceChecks(sub), gates = clearanceGates(sub);
  const todo = gates.filter(g => g.tone === "fail" || g.tone === "warn");
  const firstIssue = todo.length ? todo[0].key : null;

  // verdict
  const row = (name, c) => `<li><strong>${name}:</strong> <span class="badge ${c.ok ? "badge-success" : "badge-danger"}">${c.label || (c.ok ? "OK" : "Not met")}</span>${c.ok ? "" : " " + escHtml(c.detail)}</li>`;
  let cls, icon, title, text;
  if (!legal.ok) {
    cls = "bad"; icon = "ph-hand-palm"; title = "Held: a legal check has not passed";
    text = `<strong>Held at Step 2.</strong> The case cannot move on to Data Enrichment until both legal checks pass.<ul>${row("Producer licence and appointment", legal.producer)}${row("Sanctions screening", legal.sanctions)}</ul>`;
  } else if (todo.length) {
    cls = "warn"; icon = "ph-hourglass-medium"; title = todo.length === 1 ? "One thing to decide" : todo.length + " things to decide";
    text = `<strong>Legal checks passed.</strong> Producer licence and sanctions screening are clear. ${todo.length === 1 ? "One gate" : todo.length + " gates"} below still need a person.`;
  } else {
    cls = "ok"; icon = "ph-seal-check"; title = "Clear to continue";
    text = `<strong>Legal checks passed.</strong> Producer licence and sanctions screening are clear, and nothing else needs a person. Continue to Data Enrichment.`;
  }
  const canRecheck = hasPermission("producerLicensing", "edit") || hasPermission("sanctions", "edit");
  const ran = sub.phase1 && sub.phase1.ranAt ? `Phase 1 checks ran ${escHtml(sub.phase1.ranAt)}. ` : "";
  const hero = `<div class="cl-hero ${cls}"><div class="cl-hero-icon"><i class="ph ${icon}"></i></div>
    <div class="cl-hero-main"><div class="cl-hero-title">${title}</div><div class="cl-hero-text">${text}</div>
      <div class="cl-hero-meta">${ran}Everything here repeats at bind.</div></div>
    ${canRecheck ? `<div class="cl-hero-side"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="clRecheck()"><i class="ph ph-arrows-clockwise"></i> Check again</button></div>` : ""}</div>`;

  // what needs a person
  const list = todo.length ? `<div class="cl-todo"><div class="cl-todo-h">What needs you</div><ul>` + todo.map(g =>
    `<li><span class="cl-chip ${g.tone}">${CL_TONE_LABEL[g.tone]}</span><div class="cl-todo-main"><strong>${escHtml(g.title)}.</strong> ${escHtml(g.detail || g.headline)}
      ${g.fix ? `<div class="cl-todo-fix"><i class="ph ph-arrow-bend-down-right"></i> ${escHtml(g.fix)}${g.who ? ` <span class="cl-who">(${escHtml(g.who)})</span>` : ""}</div>` : ""}</div>
      <button class="btn btn-sm btn-outline" style="width:auto;" onclick="clSelectGate('${g.key}', true)">Open</button></li>`).join("") + `</ul></div>` : "";

  // the Phase 1 reviewer's note
  const rv = sub.phase1 && sub.phase1.review;
  const note = rv ? `<div class="cl-note"><i class="ph ph-chat-text"></i><div><div class="cl-note-h">Phase 1 ${rv.decision === "approved" ? "approval" : "decision"} by ${escHtml(rv.by)} · ${escHtml(rv.at)}</div><div>${escHtml(rv.comment)}</div></div></div>` : "";

  box.innerHTML = hero + list + note;

  // the gate cards, with the selected one's detail attached beneath them
  const sel = clSelected(sub), laneBox = document.getElementById("clearanceLane");
  if (laneBox) laneBox.innerHTML = `<ol class="cl-lane" aria-label="Clearance gates">` + gates.map(g =>
    `<li class="cl-tile ${g.tone}${g.key === sel ? " sel" : ""}${g.key === firstIssue ? " here" : ""}" id="clTile_${g.key}"><button type="button" aria-pressed="${g.key === sel}" onclick="clSelectGate('${g.key}')" aria-label="${escHtml(g.title)}: ${escHtml(g.headline)}. Show details">
      <span class="cl-tile-ico"><i class="ph ${g.icon}"></i></span><span class="cl-tile-title">${escHtml(g.title)}</span><span class="cl-tile-line">${escHtml(g.headline)}</span>${g.key === firstIssue ? '<span class="cl-here">Start here</span>' : ""}</button></li>`).join("") + `</ol>`;

  // the gate details: each has its own summary line; only the selected card's detail is shown
  gates.forEach(g => {
    const sum = document.getElementById("clSum_" + g.key), det = document.getElementById("clGate_" + g.key);
    if (sum) sum.innerHTML = clSummaryHtml(g);
    if (det) { det.className = "cl-gate " + g.tone; det.open = true; det.hidden = g.key !== sel; }
  });
  const fein = gates.find(g => g.key === "fein"), fm = document.getElementById("feinMatchesContainer");
  // the status rows in the FEIN card follow the live result (they used to know only about a case that was already declined)
  if (fein && sub.lifecycleStatus !== "declined") {
    const b = document.getElementById("feinStatusBadge"), n = document.getElementById("activeSubCount"), a = document.getElementById("clearanceActionResult");
    const clashes = (fein.lines || []).filter(l => !l.ok).length;
    if (fein.tone === "fail" && b && n && a) {
      b.className = "val badge badge-danger"; b.innerHTML = '<i class="ph ph-warning"></i> Duplicate FEIN Detected';
      n.className = "val font-bold text-danger"; n.textContent = clashes + " Conflicting (another active submission has this FEIN)";
      a.className = "val badge badge-danger"; a.textContent = "Failed Clearance → Decline as a duplicate, or correct the FEIN";
    } else if (fein.tone === "wait" && b && n && a) {
      b.className = "val badge badge-light"; b.innerHTML = '<i class="ph ph-hourglass"></i> Not Checked Yet';
      n.className = "val font-bold"; n.textContent = "Waiting for the FEIN to be confirmed";
      a.className = "val badge badge-light"; a.textContent = "Confirm the extracted data first";
    }
  }
  if (fm) fm.innerHTML = fein && fein.lines && fein.lines.length ? `<ul class="cl-lines">${fein.lines.map(l => `<li class="${l.ok ? "" : "bad"}"><i class="ph ${l.ok ? "ph-info" : "ph-x-circle"}"></i> ${escHtml(l.text)}</li>`).join("")}</ul>` : "";
  const ap = gates.find(g => g.key === "appetite"), bc = document.getElementById("appetiteBasicContainer");
  if (bc) bc.innerHTML = ap && ap.basic ? `<div class="cl-subhead">Basic fit (checked at submission)</div><ul class="cl-lines">${ap.basic.lines.map(l => `<li class="${l.ok ? "" : "bad"}"><i class="ph ${l.ok ? "ph-check-circle" : "ph-x-circle"}"></i> ${escHtml(l.text)}</li>`).join("")}</ul>` : "";
}

/** Show one gate's detail, attached to its card. `scroll` brings the detail into view (used from the to-do list). */
function clSelectGate(key, scroll) {
  const sub = clearanceActiveSub();
  if (!CL_GATES.some(g => g.key === key)) return;
  if (sub) clUi(sub).selected = key;
  CL_GATES.forEach(g => {
    const det = document.getElementById("clGate_" + g.key), tile = document.getElementById("clTile_" + g.key);
    if (det) { det.open = true; det.hidden = g.key !== key; }
    if (tile) { tile.classList.toggle("sel", g.key === key); const b = tile.querySelector("button"); if (b) b.setAttribute("aria-pressed", g.key === key ? "true" : "false"); }
  });
  const target = document.getElementById("clGate_" + key);
  if (scroll && target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clRecheck() {
  const sub = clearanceActiveSub();
  if (!sub) return;
  clearanceAutoRun(sub, "manual");
  if (typeof renderMarketCard === "function") { try { renderMarketCard(sub); } catch (e) { console.warn(e); } }
  renderClearanceBoard(sub);
  showToast("Clearance checked again.", "info");
}

registerStepRenderer("clearanceBoard", renderClearanceBoard);
