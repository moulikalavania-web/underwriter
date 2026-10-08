/**
 * ============================================================================
 * UNDERWRITING PERFORMANCE REPORTING (G30)
 * ----------------------------------------------------------------------------
 * The prototype had no measurable objectives: nothing said how fast risks were
 * quoted, what share of quotes bound, how long referrals waited or how often the
 * authority controls stopped something. This module measures them from the
 * events the other modules already record.
 *
 *   FUNNEL        received, quoted, bound, declined and still open, with the
 *                 ratios: QUOTE RATIO = quoted / received; HIT RATIO = bound /
 *                 quoted; DECLINE RATIO = declined / received.
 *   TURNAROUND    received to first quote, and quote to bind: average, median
 *                 and 90th percentile, in calendar hours (not business hours).
 *   SLA           the share quoted inside the target for its priority, the
 *                 quotes that were late, and open submissions already past
 *                 target.
 *   REFERRALS     how many, how long the decision took, and open referrals by
 *                 age, so nothing sits unnoticed.
 *   AUTHORITY     how many quote or bind attempts the authority controls
 *                 blocked.
 *   DECLINES      by trigger point.
 *   BOOK          premium bound by line and by producer, with each producer's
 *                 hit ratio and turnaround.
 *   PEOPLE        the same measures by assigned underwriter, shown only to users
 *                 with approval authority on this report.
 *
 * Reading the numbers: the ratios are for the cohort RECEIVED in the chosen
 * window, so a recent window understates the hit ratio because quotes there are
 * still open (the open count is shown for that reason). A submission with no
 * recorded timestamp for an event is counted in the funnel but left out of the
 * time measures, and the count of such records is shown. SLA targets are
 * placeholders for the business to set. The loss ratio is NOT reported: the
 * prototype holds no claims data.
 * ============================================================================
 */

var PERF_SLA_HOURS = { P1: 4, P2: 24, P3: 48, P4: 72 };   // hours from receipt to a quote, by priority (placeholder targets)
var PERF_REFERRAL_BUCKETS = [{ label: "under 1 day", max: 24 }, { label: "1 to 3 days", max: 72 }, { label: "over 3 days", max: Infinity }];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function perfEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
function perfMs(str) {
  if (typeof str === "number") return str;
  if (!str) return null;
  var s = String(str).trim();
  var m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return null;
  var t = Date.parse(m[1] + "T" + (m[2] || "00:00") + ":00Z");
  return isNaN(t) ? null : t;
}
function perfHours(a, b) { return (b - a) / 3600000; }
function perfPct(n, d) { return d > 0 ? Math.round(n / d * 1000) / 10 : null; }
function perfFmtPct(p) { return p == null ? "n/a" : p + "%"; }
function perfFmtHours(h) { if (h == null) return "n/a"; if (h < 48) return (Math.round(h * 10) / 10) + " h"; return (Math.round(h / 24 * 10) / 10) + " d"; }
function perfMoney(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("en-US"); }
function perfStats(arr) {
  if (!arr.length) return { n: 0, avg: null, median: null, p90: null };
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var rank = function (p) { return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };      // nearest-rank percentile
  var sum = s.reduce(function (x, y) { return x + y; }, 0);
  return { n: s.length, avg: sum / s.length, median: rank(0.5), p90: rank(0.9) };
}
function perfLog(sub, d) { return (sub.decisionLog || []).filter(function (x) { return x.decision === d; }); }

/** The facts about one submission that every measure is built from. */
function perfFacts(sub) {
  var q = perfLog(sub, "quote_issued")[0];
  var bound = !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber);
  var declined = sub.lifecycleStatus === "declined";
  var quoted = !!(q || sub.quoteIssued || bound);
  var ref = sub.authorityRef || null;
  var prem = (sub.discretionaryPricing && sub.discretionaryPricing.finalPremium) || (sub.importedRatingData && sub.importedRatingData.quote && sub.importedRatingData.quote.finalPremium) || 0;
  return {
    sub: sub, received: perfMs(sub.receivedTimestamp), quoted: quoted, quoteAt: q ? perfMs(q.at) : null,
    bound: bound, boundAt: bound ? perfMs(sub.pasSync.syncedAt) : null,
    declined: declined, declineAt: perfMs(sub.lifecycleStatusAt), trigger: sub.declineTriggerPoint || "",
    open: !quoted && !declined,
    referred: !!(ref || sub.isReferral), refRaisedAt: ref ? perfMs(ref.raisedAt) : null, refDecidedAt: ref && ref.decidedAt ? perfMs(ref.decidedAt) : null, refStatus: ref ? ref.status : (sub.isReferral ? "pending" : null),
    blocks: perfLog(sub, "auth_quote_blocked").length + perfLog(sub, "auth_bind_blocked").length,
    priority: sub.priority || "P3", lob: sub.lobName || sub.lobKey || "", producer: sub.channelType === "direct" ? "Direct" : (sub.broker || "Unknown"),
    assignee: sub.assignedTo || "unassigned", premium: bound ? Number(prem) || 0 : 0
  };
}

function perfFilter(subs, opts) {
  var from = opts.from ? perfMs(opts.from) : null, to = opts.to ? perfMs(opts.to) + 86400000 - 1 : null;
  return subs.filter(function (s) {
    var r = perfMs(s.receivedTimestamp);
    if (from !== null && (r === null || r < from)) return false;
    if (to !== null && (r === null || r > to)) return false;
    if (opts.lob && opts.lob !== "all" && s.lobKey !== opts.lob) return false;
    return true;
  });
}

function perfGroup(facts, keyFn, now) {
  var g = {};
  facts.forEach(function (f) { var k = keyFn(f); (g[k] = g[k] || []).push(f); });
  return Object.keys(g).sort().map(function (k) { var m = perfFunnel(g[k], now); m.key = k; return m; });
}

function perfFunnel(facts, now) {
  var quoted = facts.filter(function (f) { return f.quoted; }), bound = facts.filter(function (f) { return f.bound; }), declined = facts.filter(function (f) { return f.declined; }), open = facts.filter(function (f) { return f.open; });
  var toQuote = [], toBind = [];
  facts.forEach(function (f) {
    if (f.received != null && f.quoteAt != null && f.quoteAt >= f.received) toQuote.push(perfHours(f.received, f.quoteAt));
    if (f.quoteAt != null && f.boundAt != null && f.boundAt >= f.quoteAt) toBind.push(perfHours(f.quoteAt, f.boundAt));
  });
  return {
    received: facts.length, quoted: quoted.length, bound: bound.length, declined: declined.length, open: open.length,
    quoteRatio: perfPct(quoted.length, facts.length), hitRatio: perfPct(bound.length, quoted.length), declineRatio: perfPct(declined.length, facts.length),
    turnaround: perfStats(toQuote), quoteToBind: perfStats(toBind),
    noTimestamp: quoted.filter(function (f) { return f.quoteAt == null || f.received == null; }).length,
    premium: bound.reduce(function (s, f) { return s + f.premium; }, 0)
  };
}

function perfSla(facts, now) {
  var out = { measured: 0, onTime: 0, late: [], openPast: [], openWithin: 0, byPriority: {} };
  facts.forEach(function (f) {
    var target = PERF_SLA_HOURS[f.priority]; if (target == null || f.received == null) return;
    var bp = out.byPriority[f.priority] = out.byPriority[f.priority] || { target: target, measured: 0, onTime: 0 };
    if (f.quoted && f.quoteAt != null) {
      var h = perfHours(f.received, f.quoteAt); out.measured++; bp.measured++;
      if (h <= target) { out.onTime++; bp.onTime++; } else out.late.push({ id: f.sub.id, priority: f.priority, hours: h, target: target });
    } else if (f.open) {
      var age = perfHours(f.received, now);
      if (age > target) out.openPast.push({ id: f.sub.id, priority: f.priority, hours: age, target: target }); else out.openWithin++;
    }
  });
  out.rate = perfPct(out.onTime, out.measured);
  return out;
}

function perfReferrals(facts, now) {
  var ref = facts.filter(function (f) { return f.referred; }), decided = [], buckets = PERF_REFERRAL_BUCKETS.map(function (b) { return { label: b.label, n: 0 }; }), openIds = [];
  ref.forEach(function (f) {
    if (f.refRaisedAt != null && f.refDecidedAt != null && f.refDecidedAt >= f.refRaisedAt) decided.push(perfHours(f.refRaisedAt, f.refDecidedAt));
    if (f.refStatus === "pending") {
      openIds.push(f.sub.id);
      if (f.refRaisedAt != null) { var age = perfHours(f.refRaisedAt, now); for (var i = 0; i < PERF_REFERRAL_BUCKETS.length; i++) { if (age <= PERF_REFERRAL_BUCKETS[i].max) { buckets[i].n++; break; } } }
    }
  });
  return { count: ref.length, rate: perfPct(ref.length, facts.length), turnaround: perfStats(decided), open: openIds.length, openIds: openIds, buckets: buckets, noTime: ref.filter(function (f) { return f.refStatus === "pending" && f.refRaisedAt == null; }).length };
}

function perfCompute(subs, opts, now) {
  var t = now || Date.now(), sel = perfFilter(subs, opts || {}), facts = sel.map(perfFacts);
  var blocks = facts.reduce(function (s, f) { return s + f.blocks; }, 0);
  return {
    count: facts.length, funnel: perfFunnel(facts, t), sla: perfSla(facts, t), referrals: perfReferrals(facts, t),
    authority: { blocks: blocks, submissionsBlocked: facts.filter(function (f) { return f.blocks > 0; }).length },
    declines: perfGroup(facts.filter(function (f) { return f.declined; }), function (f) { return f.trigger || "Not recorded"; }, t).map(function (g) { return { trigger: g.key, n: g.received }; }),
    byLob: perfGroup(facts, function (f) { return f.lob || "Unknown"; }, t), byProducer: perfGroup(facts, function (f) { return f.producer; }, t), byAssignee: perfGroup(facts, function (f) { return f.assignee; }, t)
  };
}

function perfCsv(m) {
  var rows = [["Measure", "Value"]];
  var f = m.funnel;
  rows.push(["Received", f.received], ["Quoted", f.quoted], ["Bound", f.bound], ["Declined", f.declined], ["Open", f.open], ["Quote ratio", perfFmtPct(f.quoteRatio)], ["Hit ratio", perfFmtPct(f.hitRatio)], ["Decline ratio", perfFmtPct(f.declineRatio)],
    ["Turnaround to quote, median", perfFmtHours(f.turnaround.median)], ["Turnaround to quote, 90th percentile", perfFmtHours(f.turnaround.p90)], ["SLA met", perfFmtPct(m.sla.rate)], ["Open past SLA", m.sla.openPast.length],
    ["Referrals", m.referrals.count], ["Open referrals", m.referrals.open], ["Authority blocks", m.authority.blocks], ["Premium bound", f.premium]);
  rows.push([], ["Producer", "Received", "Quoted", "Bound", "Hit ratio", "Premium bound"]);
  m.byProducer.forEach(function (g) { rows.push([g.key, g.received, g.quoted, g.bound, perfFmtPct(g.hitRatio), g.premium]); });
  return rows.map(function (r) { return r.map(function (c) { var s = String(c == null ? "" : c); if (/^[=+@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); }).join("\r\n") + "\r\n";
}

// ----------------------------------------------------------------------------
// 2. RENDERING
// ----------------------------------------------------------------------------
function perfOpts() {
  var g = function (id) { var e = document.getElementById(id); return e ? e.value : ""; };
  return { from: g("perf_from"), to: g("perf_to"), lob: g("perf_lob") || "all" };
}
function perfExport() {
  if (!hasPermission("performance", "view")) { denyPermission("performance", "view"); return; }
  var m = perfCompute(SUBMISSIONS_DATASET, perfOpts());
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([perfCsv(m)], { type: "text/csv" })); a.download = "UW-PERFORMANCE-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function renderPerformance() {
  var box = document.getElementById("performanceRoot"); if (!box) return;
  if (!hasPermission("performance", "view")) { box.innerHTML = '<div class="card"><div class="card-body text-xs text-muted"><i class="ph ph-lock"></i> You do not have access to performance reporting.</div></div>'; return; }
  var o = perfOpts(), m = perfCompute(SUBMISSIONS_DATASET, o), f = m.funnel, s = m.sla, r = m.referrals;
  var canPeople = hasPermission("performance", "approve");
  var kpi = function (label, val, sub) { return '<div class="metric-box"><div class="metric-value">' + perfEsc(val) + '</div><div class="metric-label">' + perfEsc(label) + '</div>' + (sub ? '<div class="text-xs text-muted">' + perfEsc(sub) + '</div>' : '') + '</div>'; };
  var lobOpts = '<option value="all">All lines</option>' + (typeof LOB_CATALOG !== "undefined" ? LOB_CATALOG : []).map(function (l) { return '<option value="' + l.key + '"' + (o.lob === l.key ? " selected" : "") + ">" + perfEsc(l.name) + "</option>"; }).join("");
  var tbl = function (rows, head) {
    return rows.length ? '<div class="rules-table-container" style="max-height:none;overflow:auto;"><table class="data-table"><thead><tr>' + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>" : '<div class="text-xs text-muted">No data in this window.</div>';
  };
  var groupRows = function (arr, nameFn) { return arr.map(function (g) { return "<tr><td>" + perfEsc(nameFn ? nameFn(g.key) : g.key) + "</td><td>" + g.received + "</td><td>" + g.quoted + "</td><td>" + g.bound + "</td><td>" + g.declined + "</td><td>" + perfFmtPct(g.hitRatio) + "</td><td>" + perfFmtHours(g.turnaround.median) + "</td><td>" + perfMoney(g.premium) + "</td></tr>"; }); };
  var gHead = ["", "Received", "Quoted", "Bound", "Declined", "Hit ratio", "Median to quote", "Premium bound"];
  var lateRows = s.late.concat(s.openPast.map(function (x) { return Object.assign({ open: true }, x); })).sort(function (a, b) { return b.hours - a.hours; }).slice(0, 10).map(function (x) { return "<tr><td class=\"font-mono\">" + perfEsc(x.id) + "</td><td>" + perfEsc(x.priority) + "</td><td>" + perfFmtHours(x.hours) + " vs " + x.target + " h target</td><td>" + (x.open ? '<span class="badge badge-danger text-xs">open, past target</span>' : '<span class="badge badge-warning text-xs">quoted late</span>') + "</td></tr>"; });

  box.innerHTML = '<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-chart-line-up"></i> Underwriting Performance</h3><span class="badge badge-info">' + m.count + " submissions in window</span></div><div class=\"card-body\">" +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;"><label class="text-xs">Received from <input id="perf_from" type="date" class="form-control" style="width:150px;" value="' + perfEsc(o.from) + '" onchange="renderPerformance()"></label><label class="text-xs">to <input id="perf_to" type="date" class="form-control" style="width:150px;" value="' + perfEsc(o.to) + '" onchange="renderPerformance()"></label><label class="text-xs">Line <select id="perf_lob" class="form-control" style="width:240px;" onchange="renderPerformance()">' + lobOpts + '</select></label><button class="btn btn-sm btn-outline" style="width:auto;" onclick="perfExport()"><i class="ph ph-download-simple"></i> Export CSV</button></div>' +
    '<div class="metric-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;">' +
    kpi("Quote ratio", perfFmtPct(f.quoteRatio), f.quoted + " of " + f.received + " received") + kpi("Hit ratio", perfFmtPct(f.hitRatio), f.bound + " bound of " + f.quoted + " quoted") + kpi("Decline ratio", perfFmtPct(f.declineRatio), f.declined + " declined") +
    kpi("Median time to quote", perfFmtHours(f.turnaround.median), "90th percentile " + perfFmtHours(f.turnaround.p90)) + kpi("SLA met", perfFmtPct(s.rate), s.onTime + " of " + s.measured + " quoted") + kpi("Premium bound", perfMoney(f.premium), f.bound + " policies") + "</div>" +
    '<div class="text-xs text-muted" style="margin-bottom:10px;">Still open: <strong>' + f.open + '</strong> (a recent window understates the hit ratio while quotes are open). ' + (f.noTimestamp ? f.noTimestamp + " quoted record(s) have no event timestamp and are left out of the time measures. " : "") + 'Quote to bind: median ' + perfFmtHours(f.quoteToBind.median) + ' (' + f.quoteToBind.n + " measured). Times are calendar hours.</div>" +
    "<h4 style=\"margin:10px 0 6px;\">Service levels</h4>" + (Object.keys(s.byPriority).sort().map(function (p) { var b = s.byPriority[p]; return '<span class="badge badge-light" style="margin-right:6px;">' + p + " (" + b.target + " h): " + perfFmtPct(perfPct(b.onTime, b.measured)) + " (" + b.onTime + "/" + b.measured + ")</span>"; }).join("") || '<span class="text-xs text-muted">No quoted submissions with timestamps.</span>') +
    '<div class="text-xs text-muted" style="margin:6px 0;">Open and within target: ' + s.openWithin + ". Open past target: " + s.openPast.length + ". Targets are placeholders for the business to set.</div>" +
    (lateRows.length ? tbl(lateRows, ["Submission", "Priority", "Time", "Status"]) : "") +
    '<h4 style="margin:14px 0 6px;">Referrals and authority</h4><div class="text-xs">' + r.count + " referral(s) (" + perfFmtPct(r.rate) + " of received). Median time to decision " + perfFmtHours(r.turnaround.median) + " (" + r.turnaround.n + " decided). <strong>Open: " + r.open + "</strong> — " + r.buckets.map(function (b) { return b.n + " " + b.label; }).join(", ") + (r.noTime ? "; " + r.noTime + " with no timestamp" : "") + ". Authority controls blocked " + m.authority.blocks + " attempt(s) on " + m.authority.submissionsBlocked + " submission(s).</div>" +
    '<h4 style="margin:14px 0 6px;">Declines by trigger point</h4>' + (m.declines.length ? m.declines.map(function (d) { return '<span class="badge badge-light" style="margin-right:6px;">' + perfEsc(d.trigger) + ": " + d.n + "</span>"; }).join("") : '<span class="text-xs text-muted">None.</span>') +
    '<h4 style="margin:14px 0 6px;">By line of business</h4>' + tbl(groupRows(m.byLob), ["Line"].concat(gHead.slice(1))) +
    '<h4 style="margin:14px 0 6px;">By producer</h4>' + tbl(groupRows(m.byProducer), ["Producer"].concat(gHead.slice(1))) +
    (canPeople ? '<h4 style="margin:14px 0 6px;">By assigned underwriter</h4>' + tbl(groupRows(m.byAssignee, function (k) { var c = typeof USER_ROLES_CONFIG !== "undefined" ? USER_ROLES_CONFIG[k] : null; return c ? c.name : (k === "unassigned" ? "Unassigned" : k); }), ["Underwriter"].concat(gHead.slice(1))) : '<div class="text-xs text-muted" style="margin-top:12px;"><i class="ph ph-lock"></i> Underwriter-level measures need approval authority on this report.</div>') +
    '<p class="text-xs text-muted" style="margin-top:12px;"><i class="ph ph-info"></i> Ratios are for submissions received in the window. Loss ratio is not reported: the prototype holds no claims data.</p></div></div>';
}

(function installPerformanceHooks() {
  var origSwitch = window.switchQuoteIntelTab;
  if (typeof origSwitch === "function") {
    window.switchQuoteIntelTab = function (tab) {
      var panel = document.getElementById("qiPanelPerf"), tb = document.getElementById("qiTabPerf");
      if (tab === "perf") {
        origSwitch.call(this, "renewal");
        quoteIntelActiveTab = "perf";
        ["qiPanelRenewal", "qiPanelCompare", "qiPanelPipeline", "qiPanelConfig", "qiPanelBdx"].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = "none"; });
        ["qiTabRenewal", "qiTabCompare", "qiTabPipeline", "qiTabConfig", "qiTabBdx"].forEach(function (id) { var e = document.getElementById(id); if (e) e.classList.remove("active"); });
        if (tb) tb.classList.add("active");
        if (panel) panel.style.display = "block";
        renderPerformance();
        return;
      }
      var r = origSwitch.apply(this, arguments);
      if (panel) panel.style.display = "none";
      if (tb) tb.classList.remove("active");
      return r;
    };
  }
})();

window.renderPerformance = renderPerformance; window.perfExport = perfExport;
