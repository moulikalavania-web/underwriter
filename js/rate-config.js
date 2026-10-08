/**
 * ============================================================================
 * VERSIONED RATES, FEES AND LIMITS CONFIGURATION (G07)
 * ----------------------------------------------------------------------------
 * Figures that drive pricing and underwriting rules used to be constants buried
 * in the code (a 3.2% tax load, a 15% / 25% discretionary band, a 25% commission
 * ceiling, a 60-day market lock, two different default broker fees). Changing one
 * meant editing source, left no record, and silently changed quotes already issued.
 *
 * Here each figure is a CONFIG ITEM with a VERSION HISTORY:
 *   - A change is PROPOSED with a value, an effective date (today or later) and a
 *     reason; it takes effect only when a DIFFERENT person with approval authority
 *     approves it (maker-checker: nobody approves their own change).
 *   - The value in force on a date is the approved version with the latest
 *     effective date on or before it. Superseded versions stay in the history.
 *   - Bounds are enforced, so a typo cannot set a negative or absurd figure.
 *   - When a quote is issued, the values that priced it are PINNED on the
 *     submission; later config changes do not alter that quote.
 *
 * The configuration is stored in the browser (localStorage) in this prototype;
 * a production system holds it server-side with the same approval and history.
 *
 * Not covered here: the surplus-lines state table (has its own confirmation
 * workflow, js/surplus-lines.js) and the broker commission agreements (already
 * dated and versioned by agreement, js/broker-commission.js). Only the
 * commission ceiling and the discretionary limits are governed here.
 * ============================================================================
 */

var CFG_STORAGE_KEY = "veridex_rate_config_v1";

var CFG_ITEMS = [
  { key: "discretionary_tax_pct", group: "quote", label: "Taxes & fees load (flat default)", unit: "%", global: "DISCRETIONARY_TAX_RATE_PCT", def: 3.2, min: 0, max: 15, step: 0.01,
    note: "Flat load added last in discretionary pricing. Surplus lines placements use the confirmed state basis instead." },
  { key: "discretionary_max_credit", group: "quote", label: "Maximum underwriter credit", unit: "%", global: "DISCRETIONARY_MAX_CREDIT_PCT", def: 15, min: 0, max: 50, step: 0.5,
    note: "Largest discount an underwriter may apply to the base premium." },
  { key: "discretionary_max_debit", group: "quote", label: "Maximum underwriter debit", unit: "%", global: "DISCRETIONARY_MAX_DEBIT_PCT", def: 25, min: 0, max: 100, step: 0.5,
    note: "Largest surcharge an underwriter may apply to the base premium." },
  { key: "broker_fee_invoice_default", group: "quote", label: "Broker fee default (invoice and quote email)", unit: "$", global: "CFG_BROKER_FEE_INVOICE", def: 50, min: 0, max: 10000, step: 1,
    note: "Used when the submission carries no broker fee. The prototype had two different defaults ($50 here, $1,500 below); the business must choose." },
  { key: "broker_fee_quote_default", group: "quote", label: "Broker fee default (ingested-product quote)", unit: "$", global: "CFG_BROKER_FEE_QUOTE", def: 1500, min: 0, max: 10000, step: 1,
    note: "Used by the ingested-product quote builder when the submission carries no broker fee." },
  { key: "commission_hard_cap", group: "operations", label: "Commission ceiling (absolute)", unit: "%", global: "COMMISSION_HARD_CAP", def: 25, min: 0, max: 50, step: 0.5,
    note: "No agreement or override may exceed this." },
  { key: "market_lock_days", group: "operations", label: "Market lock period", unit: "days", global: "MARKET_LOCK_DAYS", def: 60, min: 1, max: 365, step: 1, int: true,
    note: "How long an unquoted submission holds the market before another broker may approach." },
  { key: "bor_treatment", group: "operations", label: "Broker-of-record commission treatment", unit: "", global: "BOR_COMMISSION_TREATMENT", def: "prorata", options: ["prorata", "at_renewal"],
    note: "prorata: new broker earns from the BOR date. at_renewal: new broker earns from the next renewal." },
  { key: "sl_default_declinations", group: "operations", label: "Diligent search declinations (default)", unit: "count", global: "SL_DEFAULT_DECLINATIONS", def: 3, min: 0, max: 10, step: 1, int: true,
    note: "Used where a state's own requirement is not recorded." },
  { key: "sl_search_max_age_days", group: "operations", label: "Diligent search entry shelf life", unit: "days", global: "SL_SEARCH_MAX_AGE_DAYS", def: 90, min: 1, max: 365, step: 1, int: true,
    note: "A declination older than this at bind is stale." }
];

var CFG_STATE = null;

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function cfgToday() { return new Date().toISOString().slice(0, 10); }
function cfgItem(key) { return CFG_ITEMS.filter(function (i) { return i.key === key; })[0] || null; }
function cfgNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function cfgEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

function cfgFresh() {
  var st = { items: {}, seq: 0 };
  CFG_ITEMS.forEach(function (i) {
    st.items[i.key] = { versions: [{ id: i.key + "#1", value: i.def, effectiveFrom: "2000-01-01", reason: "Prototype default", proposedBy: "System default", proposedAt: "", status: "active", approvedBy: "System default", approvedAt: "" }] };
  });
  return st;
}
function cfgLoad() {
  var st = null;
  try { st = JSON.parse(localStorage.getItem(CFG_STORAGE_KEY) || "null"); } catch (e) { st = null; }
  if (!st || !st.items) st = cfgFresh();
  CFG_ITEMS.forEach(function (i) { if (!st.items[i.key]) st.items[i.key] = cfgFresh().items[i.key]; });
  CFG_STATE = st;
}
function cfgSave() { try { localStorage.setItem(CFG_STORAGE_KEY, JSON.stringify(CFG_STATE)); } catch (e) { /* storage unavailable */ } }

/** The active version of an item on a date: approved, effective on or before the date, latest effective date wins. */
function cfgVersionAt(key, asOf) {
  var d = asOf || cfgToday(), best = null, bestIdx = -1;
  (CFG_STATE.items[key].versions || []).forEach(function (v, idx) {
    if (v.status !== "active" || v.effectiveFrom > d) return;
    if (!best || v.effectiveFrom >= best.effectiveFrom) { best = v; bestIdx = idx; }
  });
  return best;
}
function cfgValue(key, asOf) { var v = cfgVersionAt(key, asOf); return v ? v.value : (cfgItem(key) || {}).def; }

/** Value for a submission: the pinned value if its quote was issued, otherwise the one in force now. */
function cfgValueFor(sub, key) {
  if (sub && sub.configSnapshot && sub.configSnapshot.values && sub.configSnapshot.values[key]) return sub.configSnapshot.values[key].value;
  return cfgValue(key);
}

function cfgParse(item, raw) {
  if (item.options) return item.options.indexOf(raw) > -1 ? raw : null;
  if (raw === "" || raw == null || isNaN(Number(raw))) return null;
  return Number(raw);
}
function cfgValidate(item, raw, effectiveFrom, reason, today) {
  var p = [], v = cfgParse(item, raw);
  if (v === null) p.push(item.options ? "choose one of: " + item.options.join(", ") : "enter a number");
  else if (!item.options) {
    if (v < item.min || v > item.max) p.push("the value must be between " + item.min + " and " + item.max);
    if (item.int && Math.floor(v) !== v) p.push("the value must be a whole number");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveFrom || ""))) p.push("enter the effective date");
  else if (effectiveFrom < (today || cfgToday())) p.push("the effective date cannot be in the past");
  if (String(reason || "").trim().length < 15) p.push("explain the change (at least 15 characters)");
  return { problems: p, value: v };
}

// ----------------------------------------------------------------------------
// 2. APPLY TO THE RUNNING PROTOTYPE
// ----------------------------------------------------------------------------
function cfgApply() {
  CFG_ITEMS.forEach(function (i) {
    var v = cfgValue(i.key);
    try { window[i.global] = v; } catch (e) { /* ignore */ }
  });
}

/** Snapshot of the quote-term values, taken once when the quote is first issued. */
function cfgPin(sub) {
  if (!sub || sub.configSnapshot) return;
  var vals = {};
  CFG_ITEMS.filter(function (i) { return i.group === "quote"; }).forEach(function (i) {
    var ver = cfgVersionAt(i.key);
    vals[i.key] = { value: ver ? ver.value : i.def, versionId: ver ? ver.id : null };
  });
  sub.configSnapshot = { at: cfgNow(), values: vals };
}

// ----------------------------------------------------------------------------
// 3. ACTIONS
// ----------------------------------------------------------------------------
function cfgActor() {
  var r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? r.name + " (" + r.title + ")" : "Unknown user";
}
function cfgPending(key) { return (CFG_STATE.items[key].versions || []).filter(function (v) { return v.status === "pending"; })[0] || null; }
function cfgV(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }

function cfgPropose(key) {
  if (!hasPermission("rateConfig", "edit")) { denyPermission("rateConfig", "edit"); return; }
  var item = cfgItem(key); if (!item) return;
  if (cfgPending(key)) { showToast("⛔ A change to this item is already waiting for approval.", "danger"); return; }
  var raw = cfgV("cfg_val_" + key), eff = cfgV("cfg_eff_" + key), why = cfgV("cfg_why_" + key);
  var r = cfgValidate(item, raw, eff, why);
  if (r.problems.length) { showToast("⛔ " + r.problems.join("; ") + ".", "danger"); return; }
  var cur = cfgVersionAt(key, eff);
  if (cur && cur.value === r.value) { showToast("⛔ That is already the value in force on that date.", "danger"); return; }
  CFG_STATE.seq++;
  var id = key + "#p" + CFG_STATE.seq + "-" + Date.now().toString(36);
  CFG_STATE.items[key].versions.push({ id: id, value: r.value, effectiveFrom: eff, reason: why, proposedBy: cfgActor(), proposedAt: cfgNow(), status: "pending" });
  cfgSave(); cfgAudit(key, "cfg_proposed", "Proposed " + item.label + ": " + cfgFmt(item, cur ? cur.value : item.def) + " → " + cfgFmt(item, r.value) + ", effective " + eff + ". Reason: " + why);
  renderRateConfig();
}
function cfgWithdraw(key) {
  var p = cfgPending(key); if (!p) return;
  if (p.proposedBy !== cfgActor()) { showToast("⛔ Only the proposer can withdraw the change.", "danger"); return; }
  p.status = "withdrawn"; cfgSave(); cfgAudit(key, "cfg_rejected", "Change to " + cfgItem(key).label + " withdrawn by the proposer.");
  renderRateConfig();
}
function cfgDecide(key, approve) {
  if (!hasPermission("rateConfig", "approve")) { denyPermission("rateConfig", "approve"); return; }
  var p = cfgPending(key), item = cfgItem(key); if (!p) return;
  if (p.proposedBy === cfgActor()) { showToast("⛔ You proposed this change; a different approver must decide it.", "danger"); return; }
  if (!approve) {
    var why = cfgV("cfg_rej_" + key);
    if (why.length < 10) { showToast("⛔ Give a reason for rejecting (at least 10 characters).", "danger"); return; }
    p.status = "rejected"; p.rejectedBy = cfgActor(); p.rejectedAt = cfgNow(); p.rejectReason = why;
    cfgSave(); cfgAudit(key, "cfg_rejected", "Rejected change to " + item.label + " (" + cfgFmt(item, p.value) + "): " + why);
    renderRateConfig(); return;
  }
  p.status = "active"; p.approvedBy = cfgActor(); p.approvedAt = cfgNow();
  cfgSave(); cfgApply();
  cfgAudit(key, "cfg_approved", "Approved change to " + item.label + ": " + cfgFmt(item, p.value) + " effective " + p.effectiveFrom + ". Proposed by " + p.proposedBy + ".");
  renderRateConfig();
  if (typeof persistAppState === "function") persistAppState();
}
function cfgFmt(item, v) { return item.unit === "$" ? "$" + v : (item.unit && item.unit !== "count" ? v + " " + item.unit : String(v)); }

/** Configuration changes belong to no single case, so the version history above (who proposed, who approved, when, why) is their record.
 *  This is kept as a seam: a production system would write each change to a system-level audit log here. */
function cfgAudit(key, decision, notes) {
  if (!CFG_STATE.log) CFG_STATE.log = [];
  CFG_STATE.log.push({ key: key, decision: decision, by: cfgActor(), at: cfgNow(), notes: notes });
  cfgSave();
}

// ----------------------------------------------------------------------------
// 4. RENDERING
// ----------------------------------------------------------------------------
function renderRateConfig() {
  var box = document.getElementById("rateConfigRoot"); if (!box) return;
  var canEdit = hasPermission("rateConfig", "edit"), canApprove = hasPermission("rateConfig", "approve"), me = cfgActor();
  var groups = [{ k: "quote", t: "Quote and pricing terms" }, { k: "operations", t: "Operating rules" }];
  var html = '<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-sliders-horizontal"></i> Rates, Fees &amp; Limits</h3><span class="badge badge-info">Changes need a second approver</span></div><div class="card-body">' +
    '<p class="text-xs text-muted" style="margin-bottom:10px;">Every figure below is versioned. A change is proposed with an effective date and reason, and takes effect only when a different person with approval authority approves it. A quote, once issued, keeps the values that priced it.</p>';
  groups.forEach(function (g) {
    html += '<h4 style="margin:12px 0 6px;">' + g.t + '</h4><div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Item</th><th>In force</th><th>Upcoming / pending</th><th>History</th></tr></thead><tbody>';
    CFG_ITEMS.filter(function (i) { return i.group === g.k; }).forEach(function (i) {
      var cur = cfgVersionAt(i.key), vs = CFG_STATE.items[i.key].versions, pend = cfgPending(i.key);
      var upcoming = vs.filter(function (v) { return v.status === "active" && v.effectiveFrom > cfgToday(); });
      var up = upcoming.map(function (v) { return '<div class="text-xs"><span class="badge badge-light">Approved</span> ' + cfgEsc(cfgFmt(i, v.value)) + ' from ' + cfgEsc(v.effectiveFrom) + '</div>'; }).join("");
      var pd = "";
      if (pend) {
        pd = '<div class="text-xs"><span class="badge badge-warning">Pending</span> ' + cfgEsc(cfgFmt(i, pend.value)) + ' from ' + cfgEsc(pend.effectiveFrom) + '<br><span class="text-muted">' + cfgEsc(pend.proposedBy) + ': ' + cfgEsc(pend.reason) + '</span></div>';
        if (canApprove && pend.proposedBy !== me) pd += '<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;"><button class="btn btn-xs btn-primary" style="width:auto;" onclick="cfgDecide(\'' + i.key + '\',true)">Approve</button><input id="cfg_rej_' + i.key + '" class="form-control" style="width:180px;" placeholder="Reason, if rejecting"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="cfgDecide(\'' + i.key + '\',false)">Reject</button></div>';
        else if (pend.proposedBy === me) pd += '<div class="text-xs text-muted">You proposed this; another approver must decide. <a href="#" onclick="cfgWithdraw(\'' + i.key + '\');return false;">Withdraw</a></div>';
      } else if (canEdit) {
        var inp = i.options ? '<select id="cfg_val_' + i.key + '" class="form-control" style="width:120px;">' + i.options.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join("") + '</select>'
          : '<input id="cfg_val_' + i.key + '" type="number" step="' + i.step + '" min="' + i.min + '" max="' + i.max + '" class="form-control" style="width:90px;" placeholder="New">';
        pd = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' + inp + '<input id="cfg_eff_' + i.key + '" type="date" class="form-control" style="width:140px;" value="' + cfgToday() + '"><input id="cfg_why_' + i.key + '" class="form-control" style="width:200px;" placeholder="Reason (15+ characters)"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="cfgPropose(\'' + i.key + '\')">Propose</button></div>';
      }
      var hist = vs.filter(function (v) { return v.status !== "pending"; }).slice().reverse().map(function (v) {
        return '<div class="text-xs text-muted">' + cfgEsc(cfgFmt(i, v.value)) + ' · from ' + cfgEsc(v.effectiveFrom) + ' · ' + cfgEsc(v.status) + (v.approvedBy && v.approvedBy !== "System default" ? ' · approved by ' + cfgEsc(v.approvedBy) : (v.status === "active" ? " · default" : "")) + '</div>';
      }).join("");
      html += '<tr><td><strong>' + cfgEsc(i.label) + '</strong><div class="text-xs text-muted">' + cfgEsc(i.note) + '</div></td><td><strong>' + cfgEsc(cfgFmt(i, cur ? cur.value : i.def)) + '</strong></td><td>' + up + pd + '</td><td>' + hist + '</td></tr>';
    });
    html += '</tbody></table></div>';
  });
  box.innerHTML = html + '</div></div>';
}

// ----------------------------------------------------------------------------
// 5. HOOKS
// ----------------------------------------------------------------------------
(function installRateConfigHooks() {
  cfgLoad(); cfgApply();

  // Quote Intelligence gets a "Rates & Limits" tab.
  var origSwitch = window.switchQuoteIntelTab;
  if (typeof origSwitch === "function") {
    window.switchQuoteIntelTab = function (tab) {
      var panel = document.getElementById("qiPanelConfig"), tb = document.getElementById("qiTabConfig");
      if (tab === "config") {
        origSwitch.call(this, "renewal");
        quoteIntelActiveTab = "config";
        ["qiPanelRenewal", "qiPanelCompare", "qiPanelPipeline"].forEach(function (id) { var e = document.getElementById(id); if (e) e.style.display = "none"; });
        ["qiTabRenewal", "qiTabCompare", "qiTabPipeline"].forEach(function (id) { var e = document.getElementById(id); if (e) e.classList.remove("active"); });
        if (tb) tb.classList.add("active");
        if (panel) panel.style.display = "block";
        renderRateConfig();
        return;
      }
      var r = origSwitch.apply(this, arguments);
      if (panel) panel.style.display = "none";
      if (tb) tb.classList.remove("active");
      return r;
    };
  }

  // Pin the pricing terms when the quote is first issued or versioned.
  var origRecord = window.recordQuoteVersion;
  if (typeof origRecord === "function") {
    window.recordQuoteVersion = function (sub) { if (sub) cfgPin(sub); return origRecord.apply(this, arguments); };
  }
  var origIssue = window.issueQuoteAction;
  if (typeof origIssue === "function") {
    window.issueQuoteAction = function () {
      var r = origIssue.apply(this, arguments);
      try { var s = SUBMISSIONS_DATASET.filter(function (x) { return x.id === activeSubmissionId; })[0]; if (s && s.quoteIssued) { cfgPin(s); if (typeof persistAppState === "function") persistAppState(); } } catch (e) { /* ignore */ }
      return r;
    };
  }

  // An issued quote prices with its pinned terms, not whatever the configuration says today.
  var origCompute = window.computeFinalQuotedPremium;
  if (typeof origCompute === "function") {
    window.computeFinalQuotedPremium = function () {
      var sub = (typeof SUBMISSIONS_DATASET !== "undefined") ? SUBMISSIONS_DATASET.filter(function (x) { return x.id === activeSubmissionId; })[0] : null;
      if (!sub || !sub.configSnapshot || typeof DISCRETIONARY_TAX_RATE_PCT !== "number") return origCompute.apply(this, arguments);
      var keep = DISCRETIONARY_TAX_RATE_PCT;
      DISCRETIONARY_TAX_RATE_PCT = cfgValueFor(sub, "discretionary_tax_pct");
      try { return origCompute.apply(this, arguments); } finally { DISCRETIONARY_TAX_RATE_PCT = keep; }
    };
  }
})();

window.cfgPropose = cfgPropose; window.cfgDecide = cfgDecide; window.cfgWithdraw = cfgWithdraw; window.renderRateConfig = renderRateConfig;
window.cfgValue = cfgValue; window.cfgValueFor = cfgValueFor;
