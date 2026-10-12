/**
 * ============================================================================
 * PREMIUM / RISK BORDEREAUX EXPORT TO THE CARRIER (G23)
 * ----------------------------------------------------------------------------
 * An MGA writes business on a carrier's paper and must report it back, normally
 * each month, in a bordereau: one line per premium transaction with the policy,
 * the risk, the gross premium, the commission taken, the taxes collected and the
 * net owed to the carrier. The carrier uses it to book premium and to check the
 * MGA is writing inside its delegated authority. Nothing in the prototype
 * produced one.
 *
 * What this module does:
 *   TRANSACTIONS  built from the bound policies and what happened to them after
 *                 bind: NEW or RENEWAL at bind, each ENDORSEMENT (premium for the
 *                 rest of the term), a CANCELLATION once it takes effect (return
 *                 premium, negative), and a REINSTATEMENT (reverses the return,
 *                 where the cancellation was reinstated without lapse).
 *   REPORT ONCE   a transaction is reported in one submitted bordereau only. One
 *                 that arrives after its period closed goes in the next report,
 *                 flagged LATE. If a reported transaction later changes, the next
 *                 report carries a CORRECTION row for the difference; submitted
 *                 reports are never altered.
 *   CHECKS        errors (no policy number, state or dates) block submission;
 *                 warnings (no confirmed tax basis, commission not yet locked, a
 *                 reinstatement amount for accounting to settle) are shown.
 *   SUBMISSION    needs approval authority, only after the period has ended, and
 *                 freezes a numbered snapshot with control totals and a checksum.
 *   EXPORT        CSV with a configurable column list; text cells are guarded
 *                 against spreadsheet formula injection.
 *
 * NOT built: a claims (loss) bordereau, because the prototype has no claims
 * data beyond loss runs; and the carrier's own template. BDX_COLUMNS must be
 * mapped to the layout each carrier requires, and the reporting deadline
 * (BDX_DUE_DAYS) and the treatment of taxes and fees are contractual. The
 * defaults here are placeholders. "Net due to carrier" is gross premium less
 * commission; taxes and fees are shown for reconciliation, not added to it.
 * ============================================================================
 */

var BDX_DUE_DAYS = 15;                       // days after period end the report is due (contractual; placeholder)
var BDX_STORAGE_KEY = "veridex_bordereaux_v1";
var BDX_TOLERANCE = 0.005;

// key, heading, kind (text|money|date|int)
var BDX_COLUMNS = [
  { key: "txnType", head: "Transaction Type", kind: "text" },
  { key: "policyNumber", head: "Policy Number", kind: "text" },
  { key: "submissionId", head: "Submission ID", kind: "text" },
  { key: "insured", head: "Named Insured", kind: "text" },
  { key: "state", head: "Risk State", kind: "text" },
  { key: "lob", head: "Line of Business", kind: "text" },
  { key: "producer", head: "Producer", kind: "text" },
  { key: "effective", head: "Policy Effective", kind: "date" },
  { key: "expiration", head: "Policy Expiration", kind: "date" },
  { key: "txnDate", head: "Transaction Date", kind: "date" },
  { key: "limit", head: "Policy Limit", kind: "money" },
  { key: "gross", head: "Gross Premium", kind: "money" },
  { key: "commRate", head: "Commission %", kind: "money" },
  { key: "commission", head: "Commission", kind: "money" },
  { key: "net", head: "Net Premium Due To Carrier", kind: "money" },
  { key: "slTax", head: "Surplus Lines Tax Collected", kind: "money" },
  { key: "stamping", head: "Stamping Fee Collected", kind: "money" },
  { key: "flags", head: "Flags", kind: "text" }
];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function bdxRound(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function bdxToday() { return new Date().toISOString().slice(0, 10); }
function bdxNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function bdxMoney(n) { return (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function bdxEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
function bdxPeriodEnd(period) { var p = period.split("-"); return new Date(Date.UTC(+p[0], +p[1], 0)).toISOString().slice(0, 10); }
function bdxPeriodOf(date) { return String(date || "").slice(0, 7); }
function bdxAddDays(iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function bdxDue(period) { return bdxAddDays(bdxPeriodEnd(period), BDX_DUE_DAYS); }
function bdxCarrierOf(sub) { return sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "Carrier"); }
function bdxSlug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function bdxIsBound(sub) { return !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }

/** Rates at which tax and stamping fee were set at bind (from the surplus lines filing), or null. */
function bdxTaxRates(sub) {
  if (typeof slIsSurplus === "function" && !slIsSurplus(sub)) return { taxPct: 0, stampingPct: 0, known: true };
  var f = sub.slFiling;
  if (f && f.taxPct != null) return { taxPct: f.taxPct, stampingPct: f.stampingPct || 0, known: true };
  if (typeof slRatesFor === "function") { var r = slRatesFor(sub); if (r) return { taxPct: r.taxPct, stampingPct: r.stampingPct, known: true }; }
  return { taxPct: 0, stampingPct: 0, known: false };
}

function bdxCommissionRate(sub) {
  if (sub.commission && sub.commission.locked) return { rate: sub.commission.rate, locked: true, amount: sub.commission.amount };
  if (typeof comCurrent === "function") { var c = comCurrent(sub); return { rate: c.rate, locked: false, amount: c.amount }; }
  return { rate: 0, locked: false, amount: 0 };
}

/** Live transactions for one bound policy, before comparing with what was already reported. */
function bdxTransactionsFor(sub) {
  if (!bdxIsBound(sub)) return [];
  var f = typeof bndFacts === "function" ? bndFacts(sub) : { policyNumber: sub.pasSync.policyNumber, effective: sub.pasSync.effectiveDate, expiration: null, lobName: sub.lobName };
  var pol = sub.pasSync.policyNumber, carrier = bdxCarrierOf(sub);
  var state = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  var rates = bdxTaxRates(sub), cr = bdxCommissionRate(sub);
  var pb = typeof slPremiumBase === "function" ? slPremiumBase(sub) : { base: f.premium || 0 };
  var base = {
    policyNumber: pol, submissionId: sub.id, insured: sub.insured || "", state: state || "", lob: sub.lobName || f.lobName || "", producer: sub.channelType === "direct" ? "Direct" : (sub.broker || ""),
    effective: f.effective || "", expiration: f.expiration || "", limit: Number(sub.exposureVal) || 0, carrier: carrier, commRate: cr.rate
  };
  var rows = [];
  function mk(type, id, date, gross, commission, extra) {
    var r = Object.assign({}, base, { txnType: type, txnId: pol + ":" + id, txnDate: date, gross: bdxRound(gross), commission: bdxRound(commission) }, extra || {});
    r.slTax = bdxRound(gross * rates.taxPct / 100); r.stamping = bdxRound(gross * rates.stampingPct / 100);
    r.net = bdxRound(r.gross - r.commission);
    r.flags = (extra && extra.flags) || [];
    r.errors = [];
    if (!pol) r.errors.push("no policy number"); if (!state) r.errors.push("risk state unknown"); if (!r.effective || !r.expiration) r.errors.push("policy dates missing"); if (!r.txnDate) r.errors.push("transaction date missing");
    if (!rates.known) r.flags.push("no confirmed tax basis; tax not reported");
    if (!cr.locked) r.flags.push("commission not yet locked");
    return r;
  }
  // new / renewal
  var bindDate = String(sub.pasSync.syncedAt || "").slice(0, 10) || (sub.pasSync.effectiveDate || "");
  rows.push(mk(sub.renewalOf ? "RENEWAL" : "NEW", "NEW", bindDate, pb.base, cr.amount));
  var changes = sub.policyChanges || [];
  changes.forEach(function (ev) {
    if (ev.type === "endorsement" && ev.status === "issued") {
      var adj = ((sub.commission && sub.commission.adjustments) || []).filter(function (a) { return a.label === "Endorsement " + ev.number; })[0];
      rows.push(mk("ENDORSEMENT", "END-" + ev.number, String(ev.at || "").slice(0, 10), ev.proRata, adj ? adj.commission : (Number(ev.proRata) || 0) * cr.rate / 100, { flags: [] }));
    }
    if (ev.type === "cancellation" && ev.status === "effective" && ev.refund) {
      var cadj = ((sub.commission && sub.commission.adjustments) || []).filter(function (a) { return a.label === "Cancellation " + ev.id; })[0];
      rows.push(mk("CANCELLATION", "CAN-" + ev.id, ev.effective, -ev.refund.refund, cadj ? cadj.commission : -ev.refund.refund * cr.rate / 100, { flags: [] }));
      var rein = changes.filter(function (c) { return c.type === "reinstatement" && c.status === "issued" && sub.cancellation && sub.cancellation.eventId === ev.id; })[0];
      if (rein) {
        if (rein.reinstateType === "without_lapse") rows.push(mk("REINSTATEMENT", "REI-" + rein.id, String(rein.at || "").slice(0, 10), ev.refund.refund, ev.refund.refund * cr.rate / 100, { flags: ["reverses the cancellation return premium"] }));
        else rows.push(mk("REINSTATEMENT", "REI-" + rein.id, String(rein.at || "").slice(0, 10), 0, 0, { flags: ["reinstated with a lapse: premium for the lapse to be settled by accounting; amount not reported here"] }));
      }
    }
  });
  return rows;
}

function bdxAllTransactions(dataset) {
  var out = [];
  (dataset || []).forEach(function (s) { bdxTransactionsFor(s).forEach(function (r) { out.push(r); }); });
  return out;
}

/** What each transaction has already been reported at, across all submitted reports (base row plus corrections). */
function bdxReportedMap(reports) {
  var m = {};
  (reports || []).forEach(function (rep) {
    if (rep.status !== "submitted") return;
    rep.rows.forEach(function (r) {
      var key = r.correctsTxn || r.txnId;
      if (!m[key]) m[key] = { gross: 0, commission: 0, slTax: 0, stamping: 0, count: 0 };
      ["gross", "commission", "slTax", "stamping"].forEach(function (k) { m[key][k] = bdxRound(m[key][k] + (r[k] || 0)); });
      m[key].count++;
    });
  });
  return m;
}

/** The rows for a carrier's report for a period: new transactions up to the period end, plus corrections. */
function bdxBuild(carrier, period, live, reports) {
  var end = bdxPeriodEnd(period), reported = bdxReportedMap(reports), rows = [];
  live.filter(function (r) { return r.carrier === carrier; }).forEach(function (r) {
    var prev = reported[r.txnId];
    if (!prev) {
      if (r.txnDate && r.txnDate <= end) {
        var row = Object.assign({}, r, { flags: r.flags.slice() });
        if (bdxPeriodOf(r.txnDate) < period) row.flags.push("LATE: transaction dated " + r.txnDate + " was not in an earlier report");
        rows.push(row);
      }
      return;
    }
    var d = { gross: bdxRound(r.gross - prev.gross), commission: bdxRound(r.commission - prev.commission), slTax: bdxRound(r.slTax - prev.slTax), stamping: bdxRound(r.stamping - prev.stamping) };
    if (Math.abs(d.gross) > BDX_TOLERANCE || Math.abs(d.commission) > BDX_TOLERANCE || Math.abs(d.slTax) > BDX_TOLERANCE || Math.abs(d.stamping) > BDX_TOLERANCE) {
      var c = Object.assign({}, r, d, { txnType: "CORRECTION", txnId: r.txnId + ":C" + prev.count, correctsTxn: r.txnId, txnDate: bdxPeriodEnd(period), flags: ["corrects " + r.txnType + " already reported"], errors: r.errors.slice() });
      c.net = bdxRound(c.gross - c.commission);
      rows.push(c);
    }
  });
  rows.sort(function (a, b) { return (a.policyNumber + a.txnDate).localeCompare(b.policyNumber + b.txnDate); });
  return rows;
}

function bdxTotals(rows) {
  var t = { count: rows.length, gross: 0, commission: 0, net: 0, slTax: 0, stamping: 0, errors: 0, warnings: 0 };
  rows.forEach(function (r) {
    ["gross", "commission", "net", "slTax", "stamping"].forEach(function (k) { t[k] = bdxRound(t[k] + (r[k] || 0)); });
    t.errors += (r.errors || []).length; t.warnings += (r.flags || []).filter(function (f) { return !/^LATE|^corrects|^reverses/.test(f); }).length;
  });
  return t;
}

/** A control: net must equal gross less commission, to the cent, across the whole report. */
function bdxControlCheck(rows) {
  var t = bdxTotals(rows);
  return Math.abs(t.net - bdxRound(t.gross - t.commission)) <= 0.02;
}

function bdxCsvCell(v, kind) {
  if (v == null) return "";
  if (kind === "money" || kind === "int") return String(bdxRound(v) === Math.round(bdxRound(v)) && kind === "int" ? Math.round(v) : bdxRound(v).toFixed(2));
  var s = Array.isArray(v) ? v.join("; ") : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                      // spreadsheet formula injection guard (text cells only)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function bdxCsv(rows, meta) {
  var lines = [];
  lines.push(["Carrier", meta.carrier, "Reporting period", meta.period, "Report", meta.reportId, "Generated", meta.generatedAt].map(function (x) { return bdxCsvCell(x, "text"); }).join(","));
  lines.push(BDX_COLUMNS.map(function (c) { return bdxCsvCell(c.head, "text"); }).join(","));
  rows.forEach(function (r) { lines.push(BDX_COLUMNS.map(function (c) { return bdxCsvCell(r[c.key], c.kind); }).join(",")); });
  var t = bdxTotals(rows);
  lines.push(["TOTAL", t.count + " lines"].concat(BDX_COLUMNS.slice(2).map(function (c) { return ({ gross: t.gross, commission: t.commission, net: t.net, slTax: t.slTax, stamping: t.stamping })[c.key] != null ? bdxCsvCell(({ gross: t.gross, commission: t.commission, net: t.net, slTax: t.slTax, stamping: t.stamping })[c.key], "money") : ""; })).join(","));
  return lines.join("\r\n") + "\r\n";
}
function bdxChecksum(text) { var h = 5381; for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0; return ("00000000" + h.toString(16)).slice(-8); }

// ----------------------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------------------
var BDX_STATE = { reports: [] };
function bdxLoad() { try { var s = JSON.parse(localStorage.getItem(BDX_STORAGE_KEY) || "null"); if (s && s.reports) BDX_STATE = s; } catch (e) { /* storage unavailable */ } }
function bdxSave() { try { localStorage.setItem(BDX_STORAGE_KEY, JSON.stringify(BDX_STATE)); } catch (e) { /* storage unavailable */ } }
function bdxActor() { var r = USER_ROLES_CONFIG[currentUserRole]; return r ? r.name + " (" + r.title + ")" : "Unknown"; }

/** Reports visible to the current persona: a carrier auditor sees only their own carrier's. */
function bdxVisibleReports() {
  var r = typeof EXTERNAL_ROLES !== "undefined" ? EXTERNAL_ROLES[currentUserRole] : null;
  if (r && r.scope && r.scope.kind === "carrier") return BDX_STATE.reports.filter(function (x) { return x.carrier === r.scope.carrier; });
  return BDX_STATE.reports;
}
function bdxCarriers(live) {
  var s = {}; live.forEach(function (r) { s[r.carrier] = true; }); bdxVisibleReports().forEach(function (r) { s[r.carrier] = true; });
  var r = typeof EXTERNAL_ROLES !== "undefined" ? EXTERNAL_ROLES[currentUserRole] : null;
  var all = Object.keys(s);
  return r && r.scope && r.scope.kind === "carrier" ? all.filter(function (c) { return c === r.scope.carrier; }) : all;
}

// ----------------------------------------------------------------------------
// 3. ACTIONS
// ----------------------------------------------------------------------------
function bdxSel() { return { carrier: (document.getElementById("bdx_carrier") || {}).value || "", period: (document.getElementById("bdx_period") || {}).value || "" }; }
function bdxDraft(carrier, period) {
  var live = bdxAllTransactions(SUBMISSIONS_DATASET);
  return bdxBuild(carrier, period, live, BDX_STATE.reports);
}
function bdxNextSeq(carrier, period) { return BDX_STATE.reports.filter(function (r) { return r.carrier === carrier && r.period === period; }).length + 1; }

function bdxSubmit() {
  if (!hasPermission("bordereaux", "approve")) { denyPermission("bordereaux", "approve"); return; }
  var s = bdxSel();
  if (!/^\d{4}-\d{2}$/.test(s.period) || !s.carrier) { showToast("⛔ Choose the carrier and the reporting period.", "danger"); return; }
  if (bdxPeriodEnd(s.period) >= bdxToday()) { showToast("⛔ The period has not ended; a bordereau is submitted after month end.", "danger"); return; }
  var rows = bdxDraft(s.carrier, s.period);
  if (!rows.length) { showToast("⛔ There is nothing new to report for this carrier and period.", "danger"); return; }
  var t = bdxTotals(rows);
  if (t.errors) { showToast("⛔ " + t.errors + " error(s) must be fixed before submission (see the exceptions).", "danger"); return; }
  if (!bdxControlCheck(rows)) { showToast("⛔ Control totals do not reconcile (net ≠ gross − commission).", "danger"); return; }
  var seq = bdxNextSeq(s.carrier, s.period), id = "BDX-" + bdxSlug(s.carrier).toUpperCase() + "-" + s.period + "-" + String(seq).padStart(2, "0");
  var meta = { carrier: s.carrier, period: s.period, reportId: id, generatedAt: bdxNow() };
  var csv = bdxCsv(rows, meta);
  var rep = { id: id, carrier: s.carrier, period: s.period, seq: seq, status: "submitted", submittedBy: bdxActor(), submittedAt: bdxNow(), rows: rows, totals: t, checksum: bdxChecksum(csv), filename: id + ".csv", dueDate: bdxDue(s.period), late: bdxToday() > bdxDue(s.period) };
  BDX_STATE.reports.push(rep); bdxSave();
  var seen = {};
  rows.forEach(function (r) {
    var sub = SUBMISSIONS_DATASET.filter(function (x) { return x.id === r.submissionId; })[0];
    if (sub && !seen[sub.id]) {
      seen[sub.id] = true;
      if (!sub.decisionLog) sub.decisionLog = [];
      sub.decisionLog.push({ step: sub.currentStep || 7, decision: "bdx_reported", by: bdxActor(), at: bdxNow(), notes: "Reported to " + s.carrier + " in bordereau " + id + " (" + rows.filter(function (x) { return x.submissionId === sub.id; }).map(function (x) { return x.txnType + " " + bdxMoney(x.gross); }).join(", ") + ")." });
    }
  });
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
  showToast("Bordereau " + id + " submitted (" + rows.length + " lines, net " + bdxMoney(t.net) + ").", "success");
  renderBordereaux();
}

function bdxDownloadText(name, text) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}
function bdxExportDraft() {
  if (!hasPermission("bordereaux", "edit")) { denyPermission("bordereaux", "edit"); return; }
  var s = bdxSel(); if (!s.period || !s.carrier) return;
  var rows = bdxDraft(s.carrier, s.period);
  bdxDownloadText("DRAFT-BDX-" + bdxSlug(s.carrier) + "-" + s.period + ".csv", bdxCsv(rows, { carrier: s.carrier, period: s.period, reportId: "DRAFT (not submitted)", generatedAt: bdxNow() }));
}
function bdxDownloadReport(id) {
  if (!hasPermission("bordereaux", "view")) { denyPermission("bordereaux", "view"); return; }
  var rep = bdxVisibleReports().filter(function (r) { return r.id === id; })[0]; if (!rep) return;
  bdxDownloadText(rep.filename, bdxCsv(rep.rows, { carrier: rep.carrier, period: rep.period, reportId: rep.id, generatedAt: rep.submittedAt }));
}

// ----------------------------------------------------------------------------
// 4. RENDERING
// ----------------------------------------------------------------------------
function renderBordereaux() {
  var box = document.getElementById("bordereauxRoot"); if (!box) return;
  if (!hasPermission("bordereaux", "view")) { box.innerHTML = '<div class="card"><div class="card-body text-xs text-muted"><i class="ph ph-lock"></i> You do not have access to bordereaux.</div></div>'; return; }
  var live = bdxAllTransactions(SUBMISSIONS_DATASET), carriers = bdxCarriers(live);
  var cur = bdxSel();
  var carrier = cur.carrier && carriers.indexOf(cur.carrier) > -1 ? cur.carrier : (carriers[0] || "");
  var lastMonth = new Date(); lastMonth.setUTCDate(1); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  var period = cur.period || lastMonth.toISOString().slice(0, 7);
  var canEdit = hasPermission("bordereaux", "edit"), canSubmit = hasPermission("bordereaux", "approve");
  var rows = carrier ? bdxDraft(carrier, period) : [], t = bdxTotals(rows);
  var ended = /^\d{4}-\d{2}$/.test(period) && bdxPeriodEnd(period) < bdxToday();
  var due = /^\d{4}-\d{2}$/.test(period) ? bdxDue(period) : "";
  var carrierOpts = carriers.map(function (c) { return '<option value="' + bdxEsc(c) + '"' + (c === carrier ? " selected" : "") + ">" + bdxEsc(c) + "</option>"; }).join("");

  var exceptions = [];
  rows.forEach(function (r) { (r.errors || []).forEach(function (e) { exceptions.push('<li class="text-danger"><strong>Error</strong> ' + bdxEsc(r.policyNumber || r.submissionId) + " " + bdxEsc(r.txnType) + ": " + bdxEsc(e) + "</li>"); }); (r.flags || []).forEach(function (f) { if (!/^LATE|^corrects|^reverses/.test(f)) exceptions.push("<li><strong>Warning</strong> " + bdxEsc(r.policyNumber) + " " + bdxEsc(r.txnType) + ": " + bdxEsc(f) + "</li>"); }); });
  var body = rows.map(function (r) {
    var fl = (r.flags || []).concat((r.errors || []).map(function (e) { return "ERROR: " + e; }));
    return "<tr><td>" + bdxEsc(r.txnType) + "</td><td class=\"font-mono\">" + bdxEsc(r.policyNumber) + "</td><td>" + bdxEsc(r.insured) + "</td><td>" + bdxEsc(r.state) + "</td><td>" + bdxEsc(r.txnDate) + "</td><td class=\"text-right\">" + bdxMoney(r.gross) + "</td><td class=\"text-right\">" + bdxMoney(r.commission) + "</td><td class=\"text-right\"><strong>" + bdxMoney(r.net) + "</strong></td><td class=\"text-right\">" + bdxMoney(r.slTax + r.stamping) + '</td><td class="text-xs">' + bdxEsc(fl.join("; ")) + "</td></tr>";
  }).join("");
  var already = BDX_STATE.reports.filter(function (r) { return r.carrier === carrier && r.period === period; });
  var hist = bdxVisibleReports().slice().reverse().map(function (r) {
    return "<tr><td class=\"font-mono\">" + bdxEsc(r.id) + "</td><td>" + bdxEsc(r.carrier) + "</td><td>" + bdxEsc(r.period) + "</td><td>" + r.totals.count + "</td><td class=\"text-right\">" + bdxMoney(r.totals.gross) + "</td><td class=\"text-right\">" + bdxMoney(r.totals.net) + "</td><td class=\"text-xs\">" + bdxEsc(r.submittedAt) + " · " + bdxEsc(r.submittedBy) + (r.late ? ' <span class="badge badge-warning text-xs">after due date</span>' : "") + "</td><td class=\"font-mono text-xs\">" + bdxEsc(r.checksum) + '</td><td><button class="btn btn-xs btn-outline" style="width:auto;" onclick="bdxDownloadReport(\'' + bdxEsc(r.id) + '\')">CSV</button></td></tr>';
  }).join("");

  box.innerHTML = '<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-table"></i> Bordereaux</h3><span class="badge badge-info">Premium and risk, monthly</span></div><div class="card-body">' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;"><label class="text-xs">Carrier <select id="bdx_carrier" class="form-control" style="width:200px;" onchange="renderBordereaux()">' + carrierOpts + '</select></label><label class="text-xs">Period <input id="bdx_period" type="month" class="form-control" style="width:150px;" value="' + bdxEsc(period) + '" onchange="renderBordereaux()"></label>' +
    '<span class="text-xs text-muted">' + (ended ? "Period ended; due " + bdxEsc(due) + (bdxToday() > due ? " (past due)" : "") : "Period not yet ended; submission opens after month end") + "</span></div>" +
    (rows.length ? '<div class="rules-table-container" style="max-height:none;overflow:auto;"><table class="data-table"><thead><tr><th>Type</th><th>Policy</th><th>Insured</th><th>State</th><th>Date</th><th>Gross</th><th>Commission</th><th>Net to carrier</th><th>Tax + stamping collected</th><th>Flags</th></tr></thead><tbody>' + body + '</tbody><tfoot><tr><td colspan="5"><strong>' + t.count + " line(s)</strong></td><td class=\"text-right\"><strong>" + bdxMoney(t.gross) + "</strong></td><td class=\"text-right\"><strong>" + bdxMoney(t.commission) + "</strong></td><td class=\"text-right\"><strong>" + bdxMoney(t.net) + "</strong></td><td class=\"text-right\"><strong>" + bdxMoney(t.slTax + t.stamping) + "</strong></td><td></td></tr></tfoot></table></div>"
      : '<div class="text-xs text-muted">Nothing new to report for this carrier and period.</div>') +
    (exceptions.length ? '<h4 style="margin:12px 0 4px;">Exceptions</h4><ul class="text-xs" style="margin:0 0 8px 18px;">' + exceptions.join("") + "</ul>" : "") +
    (already.length ? '<div class="text-xs text-muted">Already submitted for this period: ' + already.map(function (r) { return bdxEsc(r.id); }).join(", ") + ". Only new, late and corrected transactions appear above.</div>" : "") +
    '<div style="display:flex;gap:8px;margin-top:10px;">' + (canEdit ? '<button class="btn btn-sm btn-outline" style="width:auto;" onclick="bdxExportDraft()"><i class="ph ph-download-simple"></i> Export draft CSV</button>' : "") + (canSubmit ? '<button class="btn btn-sm btn-primary" style="width:auto;" onclick="bdxSubmit()"' + (!rows.length || t.errors || !ended ? " disabled" : "") + '><i class="ph ph-paper-plane-tilt"></i> Submit to carrier</button>' : '<span class="text-xs text-muted"><i class="ph ph-lock"></i> Submission needs approval authority.</span>') + "</div>" +
    '<h4 style="margin:16px 0 6px;">Submitted bordereaux</h4>' + (hist ? '<div class="rules-table-container" style="max-height:none;overflow:auto;"><table class="data-table"><thead><tr><th>Report</th><th>Carrier</th><th>Period</th><th>Lines</th><th>Gross</th><th>Net</th><th>Submitted</th><th>Checksum</th><th></th></tr></thead><tbody>' + hist + "</tbody></table></div>" : '<div class="text-xs text-muted">None yet.</div>') +
    '<p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> Net due to carrier is gross premium less commission; surplus lines tax and stamping fees are shown for reconciliation and are not part of it. The columns, due date and tax treatment are placeholders until mapped to each carrier\'s agreement and template. There is no claims bordereau: the prototype holds no claims data.</p></div></div>';
}

// ----------------------------------------------------------------------------
// 5. HOOKS
// ----------------------------------------------------------------------------
(function installBordereauxHooks() {
  bdxLoad();
  if (typeof AUDIT_ACTION_META !== "undefined") AUDIT_ACTION_META.bdx_reported = { label: "Reported to Carrier (Bordereau)", icon: "ph-table", badge: "badge-info", outcome: "outcome-bind" };

  var origSwitch = window.switchQuoteIntelTab;
  if (typeof origSwitch === "function") {
    window.switchQuoteIntelTab = function (tab) {
      var panel = document.getElementById("qiPanelBdx"), tb = document.getElementById("qiTabBdx");
      if (tab === "bdx") {
        origSwitch.call(this, "renewal");
        quoteIntelActiveTab = "bdx";
        ["qiPanelRenewal", "qiPanelCompare", "qiPanelPipeline", "qiPanelConfig"].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = "none"; });
        ["qiTabRenewal", "qiTabCompare", "qiTabPipeline", "qiTabConfig"].forEach(function (id) { var e = document.getElementById(id); if (e) e.classList.remove("active"); });
        if (tb) tb.classList.add("active");
        if (panel) panel.style.display = "block";
        renderBordereaux();
        return;
      }
      var r = origSwitch.apply(this, arguments);
      if (panel) panel.style.display = "none";
      if (tb) tb.classList.remove("active");
      return r;
    };
  }
})();

window.renderBordereaux = renderBordereaux; window.bdxSubmit = bdxSubmit; window.bdxExportDraft = bdxExportDraft; window.bdxDownloadReport = bdxDownloadReport;
