/**
 * ============================================================================
 * REPORTS: A LIBRARY OF BOOK-LEVEL REPORTS, EACH WITH FILTERS AND A CSV
 * ----------------------------------------------------------------------------
 * One page (Reports in the left menu). Pick a report, set its filters, read the table, export it. Every report is worked out from the
 * cases each time it is opened, so it is never stale, and it respects who may see which case.
 *
 *   PERFORMANCE MATRIX   the last 12 months across the top (by month received): received, quoted, declined, not taken, missing information,
 *                        bound, average bound premium per power unit, submission-to-quote, quote-to-bind and decline rates; for the whole
 *                        book or one underwriter.
 *   UNDERWRITER COMPARE  the one place underwriters are compared: the same measures side by side, ranked by premium bound then hit
 *                        ratio. Needs approval authority on Performance Reporting (the Performance tab no longer has its own table).
 *   QUOTE HIT ANALYSIS   by broker and line: received, quoted, bound, quote ratio, hit ratio, average bound premium.
 *   (Expirations and the renewal process are not here: the Renewal pipeline in Quote Intelligence is the one renewal list.)
 *   AGGREGATE EXPOSURE   bound policies grouped by line, state, broker or insured account: policies, premium, exposure value; with a limit you
 *                        type, accounts above it are flagged. No limit is built in.
 *   LOSS RUN (BOOK)      every loss on every case: insured, policy, year, status, incurred; filtered by line, status, year and size.
 *   AGENCY               by producer: received, quoted, bound, hit ratio, premium bound.
 *   CANCELLATIONS        every cancellation, rescission and reinstatement (the Policies page report).
 *
 * "Indication only" is not a status in this app, so it is not a row. A loss ratio is not reported: the prototype holds no premium earned
 * by period and no claim payments. Workers compensation, DNOC and loss-control reports are not built: the prototype holds no such data.
 * ============================================================================
 */

var RP = { key: "matrix", opts: {} };
const RP_MONTHS = 12;

function rpMonthKey(ms) { return ms == null ? null : new Date(ms).toISOString().slice(0, 7); }
function rpMonthsBack(n, from) { const d = from ? new Date(from + "-01T00:00:00Z") : new Date(); d.setUTCDate(1); const out = []; for (let i = n - 1; i >= 0; i--) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); out.push(x.toISOString().slice(0, 7)); } return out; }
function rpNum(v) { if (typeof dfNum === "function") { const n = dfNum(v); return n === null ? 0 : n; } const n = parseFloat(String(v || "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
function rpPct(n, d) { return d > 0 ? Math.round(n / d * 1000) / 10 : null; }
function rpFmtPct(p) { return p === null || p === undefined ? "—" : p + "%"; }
function rpMoney(n) { return n === null || n === undefined || isNaN(n) ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US"); }
function rpSubs() { return SUBMISSIONS_DATASET.filter(s => (canSeeAllSubmissions() || isMyCase(s)) && s.apiSourced !== false); }
function rpOutcome(s) { return (typeof outCurrent === "function" ? outCurrent(s) : null); }
function rpUnits(s) { return (s.vehicles || []).length; }

/** The facts of one case a report is built from: reuses the performance module's facts and adds what the matrix needs. */
function rpFacts(s) {
  const f = typeof perfFacts === "function" ? perfFacts(s) : { sub: s, received: s.receivedTimestamp || null, quoted: !!s.quoteIssued, bound: !!(s.pasSync && s.pasSync.status === "success"), declined: s.lifecycleStatus === "declined", premium: 0, producer: s.broker || "", lob: s.lobName || "", assignee: s.assignedTo || "unassigned" };
  const o = rpOutcome(s);
  return Object.assign({}, f, { month: rpMonthKey(f.received), notTaken: !!(o && ["not_taken_by_insured", "quote_expired", "lost_to_competitor"].indexOf(o.type) > -1), missingInfo: !!(o && o.type === "closed_incomplete"), units: rpUnits(s) });
}
/** A column of measures for a set of facts. */
function rpMeasures(facts) {
  const quoted = facts.filter(f => f.quoted), bound = facts.filter(f => f.bound), declined = facts.filter(f => f.declined);
  const premium = bound.reduce((n, f) => n + f.premium, 0), units = bound.reduce((n, f) => n + f.units, 0);
  return { received: facts.length, quoted: quoted.length, declined: declined.length, notTaken: facts.filter(f => f.notTaken).length, missingInfo: facts.filter(f => f.missingInfo).length, bound: bound.length, premium,
    avgPerUnit: units > 0 ? Math.round(premium / units) : null, avgPremium: bound.length ? Math.round(premium / bound.length) : null, quoteRatio: rpPct(quoted.length, facts.length), hitRatio: rpPct(bound.length, quoted.length), declineRatio: rpPct(declined.length, facts.length) };
}
function rpFilterFacts(o) {
  let facts = rpSubs().map(rpFacts);
  if (o.lob && o.lob !== "all") facts = facts.filter(f => f.sub.lobKey === o.lob);
  if (o.assignee && o.assignee !== "all") facts = facts.filter(f => f.assignee === o.assignee);
  if (o.from) facts = facts.filter(f => f.received !== null && new Date(f.received).toISOString().slice(0, 10) >= o.from);
  if (o.to) facts = facts.filter(f => f.received !== null && new Date(f.received).toISOString().slice(0, 10) <= o.to);
  return facts;
}

// ----------------------------------------------------------------------------
// 1. THE REPORTS: each returns { cols, rows, notes }
// ----------------------------------------------------------------------------
function rpMatrix(o) {
  // naming one underwriter is an underwriter-level measure: it needs approval authority, like the comparison
  const months = rpMonthsBack(RP_MONTHS, o.until || null), facts = rpFilterFacts({ lob: o.lob, assignee: hasPermission("performance", "approve") ? o.assignee : "all" });
  const by = {}; months.forEach(m => { by[m] = rpMeasures(facts.filter(f => f.month === m)); });
  const total = rpMeasures(facts.filter(f => months.indexOf(f.month) > -1));
  const row = (label, key, fmt) => [label].concat(months.map(m => fmt(by[m][key]))).concat([fmt(total[key])]);
  const n = v => v, pct = rpFmtPct, money = rpMoney;
  return { cols: ["Measure"].concat(months).concat(["12 months"]), rows: [row("Received", "received", n), row("Quoted", "quoted", n), row("Declined", "declined", n), row("Not taken", "notTaken", n), row("Missing information", "missingInfo", n), row("Bound", "bound", n), row("Average premium per power unit", "avgPerUnit", money),
    row("Submission to quote", "quoteRatio", pct), row("Quote to bind", "hitRatio", pct), row("Decline rate", "declineRatio", pct)],
    notes: ["By month the submission was received, so a recent month understates quote-to-bind while quotes are still open.", "Not taken includes quotes that expired or were lost to a competitor.", "Average premium per power unit is bound premium divided by the vehicles on the bound cases.", "Indication-only quotes are not a status in this app, so they are not shown."] };
}
/** The one underwriter comparison (Performance used to carry a second table and Reports a "Top performers"): ranked by premium bound, then hit ratio. */
function rpCompare(o) {
  const facts = rpFilterFacts({ lob: o.lob, from: o.from, to: o.to }), keys = Array.from(new Set(facts.map(f => f.assignee)));
  const list = keys.map(k => ({ k, m: rpMeasures(facts.filter(f => f.assignee === k)) })).sort((a, b) => b.m.premium - a.m.premium || (b.m.hitRatio || 0) - (a.m.hitRatio || 0) || String(a.k).localeCompare(String(b.k)));
  const rows = list.map((x, i) => { const u = USER_ROLES_CONFIG[x.k], m = x.m; return [i + 1, u ? u.name : (x.k === "unassigned" ? "Unassigned" : x.k), m.received, m.quoted, m.declined, m.notTaken, m.missingInfo, m.bound, rpMoney(m.premium), rpMoney(m.avgPerUnit), rpFmtPct(m.quoteRatio), rpFmtPct(m.hitRatio), rpFmtPct(m.declineRatio)]; });
  return { cols: ["Rank", "Underwriter", "Received", "Quoted", "Declined", "Not taken", "Missing info", "Bound", "Premium bound", "Avg premium / unit", "Quote %", "Bind %", "Decline %"], rows, notes: ["Over the received-date range chosen. Ranked by premium bound, then hit ratio.", "This is the one place underwriters are compared; it needs approval authority on Performance Reporting."] };
}
function rpHit(o) {
  const facts = rpFilterFacts(o), keys = {};
  facts.forEach(f => { const k = f.producer + "\u0000" + f.lob; (keys[k] = keys[k] || []).push(f); });
  const rows = Object.keys(keys).sort().map(k => { const [p, l] = k.split("\u0000"), m = rpMeasures(keys[k]); return [p, l, m.received, m.quoted, m.bound, rpFmtPct(m.quoteRatio), rpFmtPct(m.hitRatio), rpMoney(m.avgPremium)]; });
  return { cols: ["Broker", "Line", "Received", "Quoted", "Bound", "Quote %", "Hit %", "Avg bound premium"], rows, notes: ["Direct customers are listed as Direct."] };
}
const RP_GROUPS = { lob: ["Line of business", s => s.lobName || s.lobKey || "Unknown"], state: ["State", s => (typeof deriveRiskState === "function" ? deriveRiskState(s) : null) || "Unknown"], broker: ["Broker", s => s.channelType === "direct" ? "Direct" : (s.broker || "Unknown")], account: ["Insured account", s => s.insured || "Unknown"] };
function rpAggregate(o) {
  const g = RP_GROUPS[o.group] || RP_GROUPS.lob, bound = rpSubs().filter(s => s.pasSync && s.pasSync.status === "success" && s.pasSync.policyNumber && (!o.lob || o.lob === "all" || s.lobKey === o.lob) && ["cancelled", "transferred"].indexOf(s.policyState) < 0);
  const m = {}; bound.forEach(s => { const k = g[1](s), prem = typeof perfFacts === "function" ? perfFacts(s).premium : 0; const x = m[k] = m[k] || { n: 0, prem: 0, exp: 0 }; x.n++; x.prem += prem; x.exp += Number(s.exposureVal) || 0; });
  const limit = Number(o.limit) > 0 ? Number(o.limit) : null;
  const rows = Object.keys(m).sort((a, b) => m[b].exp - m[a].exp).map(k => [k, m[k].n, rpMoney(m[k].prem), rpMoney(m[k].exp), limit === null ? "" : (m[k].exp > limit ? "Over the limit" : "Within")]);
  return { cols: [g[0], "Policies", "Premium", "Exposure value"].concat(limit === null ? [] : ["Against " + rpMoney(limit)]).concat([]), rows: rows.map(r => limit === null ? r.slice(0, 4) : r), notes: ["Bound policies that are not cancelled or transferred. Exposure value is the exposure value stated on each case.", limit === null ? "Type a limit to flag the groups above it. None is built in." : "Groups above the limit you typed are flagged."] };
}
/** Every loss on every visible case. */
function rpLossRows(o) {
  const out = [];
  rpSubs().filter(s => !o.lob || o.lob === "all" || s.lobKey === o.lob).forEach(s => (s.losses || []).forEach(l => {
    const incurred = rpNum(l.incurred !== undefined ? l.incurred : l.amount), status = String(l.status || "Not stated"), year = String(l.year || String(l.date || "").slice(0, 4) || "");
    if (o.status && o.status !== "all" && status.toLowerCase() !== o.status.toLowerCase()) return;
    if (o.year && year !== String(o.year)) return;
    if (o.min && incurred < Number(o.min)) return;
    out.push({ sub: s, year, status, incurred, desc: l.desc || l.description || l.type || "" });
  }));
  return out.sort((a, b) => b.incurred - a.incurred);
}
function rpLoss(o) {
  const list = rpLossRows(o), total = list.reduce((n, l) => n + l.incurred, 0);
  return { cols: ["Insured", "Policy / case", "Line", "Year", "Status", "Description", "Incurred"], rows: list.map(l => [l.sub.insured, ((l.sub.pasSync || {}).policyNumber || "") || l.sub.id, l.sub.lobName || "", l.year, l.status, l.desc, rpMoney(l.incurred)]).concat(list.length ? [["Total", "", "", "", "", list.length + " loss" + (list.length === 1 ? "" : "es"), rpMoney(total)]] : []), notes: ["Losses are as stated on each case's loss runs, largest first. The prototype holds no claim payments, so this is a view of reported losses, not a loss ratio."] };
}
function rpAgency(o) {
  const facts = rpFilterFacts(o), keys = Array.from(new Set(facts.map(f => f.producer))).sort();
  return { cols: ["Producer", "Received", "Quoted", "Bound", "Quote %", "Hit %", "Premium bound"], rows: keys.map(k => { const m = rpMeasures(facts.filter(f => f.producer === k)); return [k, m.received, m.quoted, m.bound, rpFmtPct(m.quoteRatio), rpFmtPct(m.hitRatio), rpMoney(m.premium)]; }), notes: [] };
}
function rpCancel(o) {
  const rows = typeof poCancelRows === "function" ? poCancelRows({ field: "effective", from: o.from, to: o.to }) : [];
  return { cols: ["Policy", "Insured", "Transaction", "Status", "Reason", "Effective", "Return premium"], rows: rows.map(r => [r.policy, r.sub.insured, r.type, r.ev.status, r.ev.reasonLabel || r.ev.reason || "", r.ev.effective || "", r.refund === null ? "" : rpMoney(r.refund)]), notes: ["The same data as the Cancellation report on the Policies page."] };
}
// perm: who may read a report. The reports that carry the performance measures need the same permission the Performance tab needs
// (view for the book, approve for anything that names an underwriter); the others follow the case visibility rules only.
const RP_REPORTS = [
  { key: "matrix", title: "Performance matrix (12 months)", filters: ["lob", "assignee", "until"], run: rpMatrix, perm: ["performance", "view"] },
  { key: "compare", title: "Underwriter comparison", filters: ["lob", "from", "to"], run: rpCompare, perm: ["performance", "approve"] },
  { key: "hit", title: "Quote hit analysis", filters: ["lob", "from", "to"], run: rpHit, perm: ["performance", "view"] },
  { key: "aggregate", title: "Aggregate exposure", filters: ["lob", "group", "limit"], run: rpAggregate },
  { key: "loss", title: "Loss run (book)", filters: ["lob", "status", "year", "min"], run: rpLoss },
  { key: "agency", title: "Agency report", filters: ["lob", "from", "to"], run: rpAgency, perm: ["performance", "view"] },
  { key: "cancel", title: "Cancellation transactions", filters: ["from", "to"], run: rpCancel }
];
function rpAllowed(rep) { return !rep.perm || hasPermission(rep.perm[0], rep.perm[1]); }
const RP_UNAVAILABLE = ["Workers compensation", "DNOC", "Loss control"];
const RP_ELSEWHERE = "Renewals and expirations: Quote Intelligence, Renewal pipeline.";

function rpRun(key, o) {
  const r = RP_REPORTS.find(x => x.key === key); if (!r) return null;
  if (!rpAllowed(r)) return { cols: [], rows: [], denied: true, notes: ["You do not have access to this report: it needs " + r.perm[1] + " authority on Performance Reporting."] };
  return r.run(o || {});
}
function rpCsv(rep) {
  const q = v => { let s = String(v == null ? "" : v); if (/^[=+@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [rep.cols].concat(rep.rows).map(r => r.map(q).join(",")).join("\r\n") + "\r\n";
}

// ----------------------------------------------------------------------------
// 2. THE PAGE
// ----------------------------------------------------------------------------
function showReportsPage() {
  currentPage = "reports";
  resetAllTopLevelPages();
  setPageTitle("Reports");
  setBreadcrumb([{ label: "FUT", onClick: "showIntakePage()" }, { label: "Reports" }]);
  const page = document.getElementById("reportsPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }
  const nav = document.getElementById("navItemReports"); if (nav) nav.classList.add("active");
  const footer = document.getElementById("workflowBottomFooter"); if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");
  rpRender();
}
function rpPick(k) { RP.key = k; RP.opts = {}; rpRender(); }
function rpRead(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function rpApply() { const o = {}; ["lob", "assignee", "until", "from", "to", "group", "limit", "status", "year", "min"].forEach(k => { const v = rpRead("rpf_" + k); if (v !== "") o[k] = v; }); RP.opts = o; rpRender(); }
function rpFilterHtml(rep) {
  const o = RP.opts, f = {
    lob: `<label>Line <select class="form-control" id="rpf_lob" onchange="rpApply()"><option value="all">All</option>${LOB_CATALOG.map(l => `<option value="${l.key}"${o.lob === l.key ? " selected" : ""}>${escHtml(l.name)}</option>`).join("")}</select></label>`,
    assignee: !hasPermission("performance", "approve") ? "" : `<label>Underwriter <select class="form-control" id="rpf_assignee" onchange="rpApply()"><option value="all">Everyone</option>${Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name).map(k => `<option value="${k}"${o.assignee === k ? " selected" : ""}>${escHtml(USER_ROLES_CONFIG[k].name)}</option>`).join("")}</select></label>`,
    until: `<label>Last month <input type="month" class="form-control" id="rpf_until" value="${escHtml(o.until || "")}" onchange="rpApply()"></label>`,
    from: `<label>From <input type="date" class="form-control" id="rpf_from" value="${escHtml(o.from || "")}" onchange="rpApply()"></label>`,
    to: `<label>To <input type="date" class="form-control" id="rpf_to" value="${escHtml(o.to || "")}" onchange="rpApply()"></label>`,
    group: `<label>Group by <select class="form-control" id="rpf_group" onchange="rpApply()">${Object.keys(RP_GROUPS).map(k => `<option value="${k}"${(o.group || "lob") === k ? " selected" : ""}>${RP_GROUPS[k][0]}</option>`).join("")}</select></label>`,
    limit: `<label>Flag above ($) <input class="form-control" id="rpf_limit" inputmode="numeric" value="${escHtml(o.limit || "")}" onchange="rpApply()" style="width:140px;"></label>`,
    status: `<label>Status <select class="form-control" id="rpf_status" onchange="rpApply()"><option value="all">Any</option><option${o.status === "Open" ? " selected" : ""}>Open</option><option${o.status === "Closed" ? " selected" : ""}>Closed</option></select></label>`,
    year: `<label>Year <input class="form-control" id="rpf_year" value="${escHtml(o.year || "")}" onchange="rpApply()" style="width:90px;" placeholder="2025"></label>`,
    min: `<label>Incurred at least ($) <input class="form-control" id="rpf_min" inputmode="numeric" value="${escHtml(o.min || "")}" onchange="rpApply()" style="width:130px;"></label>`
  };
  return `<div class="mw-dates" style="margin-bottom:10px;">${rep.filters.map(k => f[k]).join("")}</div>`;
}
function rpExport() {
  const rep = RP_REPORTS.find(r => r.key === RP.key), res = rpRun(RP.key, RP.opts); if (!res) return;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rpCsv(res)], { type: "text/csv" })); a.download = rep.key + "-" + todayIso() + ".csv"; document.body.appendChild(a); a.click(); a.remove();
}
function rpRender() {
  const root = document.getElementById("reportsRoot"); if (!root) return;
  const rep = RP_REPORTS.find(r => r.key === RP.key) || RP_REPORTS[0], res = rpRun(rep.key, RP.opts);
  const list = RP_REPORTS.map(r => `<button type="button" class="rp-item${r.key === rep.key ? " sel" : ""}" onclick="rpPick('${r.key}')">${rpAllowed(r) ? "" : '<i class="ph ph-lock"></i> '}${escHtml(r.title)}</button>`).join("") + `<div class="rp-na">${RP_ELSEWHERE}</div><div class="rp-na">Not built (no data held): ${RP_UNAVAILABLE.join(", ")}</div>`;
  const table = res.rows.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr>${res.cols.map(c => `<th>${escHtml(c)}</th>`).join("")}</tr></thead><tbody>${res.rows.map(r => `<tr>${r.map((c, i) => `<td${i ? "" : " style=\"font-weight:600;\""}>${escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="mw-empty">Nothing to report for these filters.</div>`;
  root.innerHTML = `<div class="p1-head"><div><h2 class="p1-h" style="margin:0;">Reports</h2><div class="p1-sub" style="margin:0;">Worked out from the cases each time you open one.</div></div></div>
    <div class="rp-layout"><nav class="rp-list" aria-label="Reports">${list}</nav><div class="rp-body"><div class="card"><div class="card-header"><h3>${escHtml(rep.title)}</h3><button class="btn btn-sm btn-outline" style="width:auto;" onclick="rpExport()"${res.rows.length ? "" : " disabled"}><i class="ph ph-download-simple"></i> Export CSV</button></div><div class="card-body">${res.denied ? "" : rpFilterHtml(rep)}${res.denied ? `<div class="mw-empty"><i class="ph ph-lock"></i> ${escHtml(res.notes[0])}</div>` : table}${(res.notes || []).map(n => `<div class="p1-note">${escHtml(n)}</div>`).join("")}</div></div></div></div>`;
}
