/**
 * ============================================================================
 * FIND AND LOOK UP: SEARCH, RECENT CASES, QUEUE FILTERS, INSURED / BROKER / COMPANY LOOKUP, PHONE BOOK
 * ----------------------------------------------------------------------------
 *   HEADER SEARCH   a box in the header that finds a case by insured, case id, FEIN, DOT, MC, VIN, driver name or licence,
 *                   policy number, quote number, broker or address, and says what matched. With nothing typed it shows the
 *                   cases opened last (Recent). Enter opens the first result.
 *   QUEUE FILTERS   the intake queue can be narrowed by quote status (Received, Pending UW Approval, Quoted, Pending Bind,
 *                   Bound, Declined, Closed) and by date received (Today, This week, This month), and its search box uses the
 *                   same fields as the header search.
 *   SEARCH & LOOKUP one page: Advanced search (many fields at once), Customer lookup (every line of one customer: the one customer view),
 *                   Agents & brokers (directory, broker master and onboarding checklist), Companies (carriers and markets) and
 *                   a Phone book (brokers, customers, the team, and contacts added by hand).
 *
 * Everything is read from the cases and the reference data already in the prototype. Nothing is invented: a field that no case
 * carries is simply not searchable, and an empty directory says so. The broker master and the phone book are kept in this
 * browser (localStorage); there is no server. Mail links open the user's own mail program.
 * ============================================================================
 */

const FD_RECENT_KEY = "FUT_RECENT_V1", FD_BROKER_KEY = "FUT_BROKER_MASTER_V1", FD_BOOK_KEY = "FUT_PHONEBOOK_V1", FD_RECENT_MAX = 10;
const FD_STATUSES = ["Received", "Pending UW Approval", "Quoted", "Pending Bind", "Bound", "Declined", "Closed"];
const FD_BROKER_STATES = ["Not onboarded", "Onboarding", "Active", "Suspended"];
var FD_RECENT = [], FD_BROKERS = {}, FD_BOOK = [];
try { const r = JSON.parse(localStorage.getItem(FD_RECENT_KEY)); if (Array.isArray(r)) FD_RECENT = r; } catch (e) { /* none yet */ }
try { const r = JSON.parse(localStorage.getItem(FD_BROKER_KEY)); if (r && typeof r === "object") FD_BROKERS = r; } catch (e) { /* none yet */ }
try { const r = JSON.parse(localStorage.getItem(FD_BOOK_KEY)); if (Array.isArray(r)) FD_BOOK = r; } catch (e) { /* none yet */ }
var FD = { tab: "advanced", q: {}, results: null, insuredTerm: "", broker: "", brokerTerm: "", companyTerm: "", bookTerm: "", bookKind: "", queueStatus: "", queueDate: "" };

function fdSave(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* keep for this session */ } }
function fdNorm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function fdAdd(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fdInternal() { return !(typeof extUsesScopeNotAssignment === "function" && extUsesScopeNotAssignment(currentUserRole)); }
function fdVisible(sub) {
  if (!fdInternal()) return typeof extCanSee === "function" ? extCanSee(currentUserRole, sub) : false;
  return canSeeAllSubmissions() || isMyCase(sub);
}
function fdSubs() { return SUBMISSIONS_DATASET.filter(fdVisible); }


// ----------------------------------------------------------------------------
// 1. WHAT A CASE CAN BE FOUND BY
// ----------------------------------------------------------------------------
function fdQuoteNos(s) {
  const out = [s.quoteNo, s.quote_id];
  const e = (typeof QUOTE_VERSIONS_DATASET !== "undefined" ? QUOTE_VERSIONS_DATASET : []).find(v => v.subId === s.id);
  if (e) e.quotes.forEach(q => out.push(q.versionId, q.quoteNo));
  return out.filter(Boolean);
}
function fdDriverName(d) { return ((d.given_name || d.last_name) ? ((d.given_name || "") + " " + (d.last_name || "")).trim() : d.name) || ""; }
/** The searchable fields of a case: [label, value] pairs. */
function fdFields(s) {
  const f = [["Case", s.id], ["Insured", s.insured], ["FEIN", s.fein], ["DOT", s.dot], ["MC", s.mcNumber], ["Broker", s.broker], ["Address", s.address], ["Email", s.email], ["Line of business", s.lobName],
    ["Policy", s.pasSync && s.pasSync.policyNumber]];
  fdQuoteNos(s).forEach(q => f.push(["Quote", q]));
  (s.drivers || []).forEach(d => { f.push(["Driver", fdDriverName(d)]); if (d.licenseNumber) f.push(["Licence", d.licenseNumber]); });
  (s.vehicles || []).forEach(v => { if (v.vin || v.VIN) f.push(["VIN", v.vin || v.VIN]); });
  return f.filter(x => x[1] !== undefined && x[1] !== null && String(x[1]) !== "");
}
/** The first field a term matches, as "Label value", or null. */
function fdMatch(s, term) {
  const t = fdNorm(term); if (!t) return null;
  const hit = fdFields(s).find(x => fdNorm(x[1]).indexOf(t) > -1);
  return hit ? hit[0] + " " + hit[1] : null;
}
function fdHas(s, label, term) { const t = fdNorm(term); return !t || fdFields(s).some(x => x[0] === label && fdNorm(x[1]).indexOf(t) > -1); }

/** Advanced search. Every filled field must match. Newest first. */
function fdSearch(q) {
  q = q || {};
  const from = q.from || "", to = q.to || "";
  return fdSubs().filter(s => {
    if (q.text && !fdMatch(s, q.text)) return false;
    if (!fdHas(s, "Insured", q.insured) || !fdHas(s, "FEIN", q.fein) || !fdHas(s, "DOT", q.dot) || !fdHas(s, "MC", q.mc) || !fdHas(s, "VIN", q.vin) || !fdHas(s, "Policy", q.policy) || !fdHas(s, "Quote", q.quote) || !fdHas(s, "Broker", q.broker)) return false;
    if (q.driver && !fdHas(s, "Driver", q.driver) && !fdHas(s, "Licence", q.driver)) return false;
    if (q.lob && s.lobKey !== q.lob) return false;
    if (q.status && caseStatus(s) !== q.status) return false;
    if (q.assigned && s.assignedTo !== q.assigned) return false;
    const d = s.receivedTimestamp ? new Date(s.receivedTimestamp).toISOString().slice(0, 10) : "";
    if ((from || to) && (!d || (from && d < from) || (to && d > to))) return false;
    return true;
  }).sort((a, b) => (b.receivedTimestamp || 0) - (a.receivedTimestamp || 0));
}

// ----------------------------------------------------------------------------
// 2. RECENT CASES AND THE HEADER SEARCH
// ----------------------------------------------------------------------------
function fdRecordRecent(id) {
  FD_RECENT = [id].concat(FD_RECENT.filter(x => x !== id)).slice(0, FD_RECENT_MAX);
  fdSave(FD_RECENT_KEY, FD_RECENT);
}
function fdRecent() { return FD_RECENT.map(id => SUBMISSIONS_DATASET.find(s => s.id === id)).filter(s => s && fdVisible(s)); }

function fdRow(s, why) {
  const st = caseStatus(s);
  return `<button type="button" class="hdr-hit" onclick="fdOpen('${escHtml(s.id)}')"><span class="hdr-hit-main"><strong>${escHtml(s.insured)}</strong><span class="hdr-hit-sub">${escHtml(s.id)}${why ? " · " + escHtml(why) : ""}</span></span><span class="badge badge-light">${st}</span></button>`;
}
function fdHeaderInput() {
  const input = document.getElementById("hdrSearchInput"), panel = document.getElementById("hdrSearchPanel");
  if (!input || !panel) return;
  const term = input.value.trim();
  let html;
  if (!term) {
    const r = fdRecent();
    html = `<div class="hdr-h">Recent</div>` + (r.length ? r.slice(0, 6).map(s => fdRow(s, "")).join("") : `<div class="hdr-none">No cases opened yet.</div>`);
  } else {
    const found = fdSearch({ text: term }), rows = found.slice(0, 8);
    html = `<div class="hdr-h">${found.length} found</div>` + (rows.length ? rows.map(s => fdRow(s, fdMatch(s, term))).join("") : `<div class="hdr-none">Nothing matches "${escHtml(term)}".</div>`);
  }
  html += `<button type="button" class="hdr-adv" onclick="fdOpenAdvanced()"><i class="ph ph-sliders-horizontal"></i> Advanced search and lookups</button>`;
  panel.innerHTML = html; panel.hidden = false;
}
function fdHeaderKey(e) {
  if (e.key === "Escape") { fdCloseHeader(); return; }
  if (e.key === "Enter") {
    const term = (document.getElementById("hdrSearchInput") || {}).value || "";
    const r = term.trim() ? fdSearch({ text: term })[0] : fdRecent()[0];
    if (r) fdOpen(r.id);
  }
}
function fdCloseHeader() { const p = document.getElementById("hdrSearchPanel"); if (p) p.hidden = true; }
function fdOpen(id) {
  fdCloseHeader();
  const input = document.getElementById("hdrSearchInput"); if (input) input.value = "";
  if (typeof openCaseAtCurrentStep === "function") openCaseAtCurrentStep(id);
}
function fdOpenAdvanced() { fdCloseHeader(); showFindPage(); }

// ----------------------------------------------------------------------------
// 3. QUEUE FILTERS (used by the intake queue)
// ----------------------------------------------------------------------------
function fdMatchQueue(s) {
  if (FD.queueStatus && caseStatus(s) !== FD.queueStatus) return false;
  if (FD.queueDate) {
    const d = s.receivedTimestamp ? new Date(s.receivedTimestamp).toISOString().slice(0, 10) : "", today = todayIso();
    if (!d) return false;
    if (FD.queueDate === "today" && d !== today) return false;
    if (FD.queueDate === "week" && d < fdAdd(today, -6)) return false;
    if (FD.queueDate === "month" && d < fdAdd(today, -29)) return false;
  }
  return true;
}
function fdQueueSearch(s, term) { return !term || !!fdMatch(s, term); }
function fdSetQueueStatus(v) { FD.queueStatus = v; if (typeof renderSubmissionsTable === "function") renderSubmissionsTable(); }
function fdSetQueueDate(v) { FD.queueDate = v; if (typeof renderSubmissionsTable === "function") renderSubmissionsTable(); }

// ----------------------------------------------------------------------------
// 4. THE PAGE
// ----------------------------------------------------------------------------
function showFindPage() {
  currentPage = "find";
  resetAllTopLevelPages();
  setPageTitle("Search & Lookup");
  setBreadcrumb([{ label: "FUT", onClick: "showIntakePage()" }, { label: "Search & Lookup" }]);
  const page = document.getElementById("findPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }
  const nav = document.getElementById("navItemFind"); if (nav) nav.classList.add("active");
  const footer = document.getElementById("workflowBottomFooter"); if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");
  fdRender();
}
function fdTab(t) { FD.tab = t; fdRender(); }
function fdRead(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }

const FD_ADV = [["text", "Anything"], ["insured", "Insured"], ["fein", "FEIN"], ["dot", "DOT #"], ["mc", "MC #"], ["vin", "VIN"], ["driver", "Driver name or licence"], ["policy", "Policy number"], ["quote", "Quote number"], ["broker", "Broker"]];

function fdAdvancedHtml() {
  const q = FD.q, roles = Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name);
  const fields = FD_ADV.map(f => `<div class="form-group"><label for="fda_${f[0]}">${f[1]}</label><input class="form-control" id="fda_${f[0]}" value="${escHtml(q[f[0]] || "")}" onkeydown="if(event.key==='Enter')fdRunAdvanced()"></div>`).join("");
  const form = `<div class="card"><div class="card-body"><div class="mw-grid">${fields}
    <div class="form-group"><label for="fda_lob">Line of business</label><select class="form-control" id="fda_lob"><option value="">Any</option>${LOB_CATALOG.map(l => `<option value="${l.key}"${q.lob === l.key ? " selected" : ""}>${escHtml(l.name)}</option>`).join("")}</select></div>
    <div class="form-group"><label for="fda_status">Status</label><select class="form-control" id="fda_status"><option value="">Any</option>${FD_STATUSES.map(s => `<option${q.status === s ? " selected" : ""}>${s}</option>`).join("")}</select></div>
    <div class="form-group"><label for="fda_assigned">Assigned to</label><select class="form-control" id="fda_assigned"><option value="">Anyone</option>${roles.map(k => `<option value="${k}"${q.assigned === k ? " selected" : ""}>${escHtml(USER_ROLES_CONFIG[k].name)}</option>`).join("")}</select></div>
    <div class="form-group"><label for="fda_from">Received from</label><input type="date" class="form-control" id="fda_from" value="${escHtml(q.from || "")}"></div>
    <div class="form-group"><label for="fda_to">Received to</label><input type="date" class="form-control" id="fda_to" value="${escHtml(q.to || "")}"></div></div>
    <div class="p1-actions"><button class="btn btn-outline" onclick="fdClearAdvanced()">Clear</button><button class="btn btn-primary" onclick="fdRunAdvanced()"><i class="ph ph-magnifying-glass"></i> Search</button></div></div></div>`;
  let list;
  if (FD.results === null) {
    const r = fdRecent();
    list = `<div class="card"><div class="card-header"><h3><i class="ph ph-clock-counter-clockwise"></i> Recent submissions</h3></div><div class="card-body">${r.length ? fdTable(r) : `<div class="mw-empty">No cases opened yet.</div>`}</div></div>`;
  } else list = `<div class="card"><div class="card-header"><h3>${FD.results.length} result${FD.results.length === 1 ? "" : "s"}</h3></div><div class="card-body">${FD.results.length ? fdTable(FD.results) : `<div class="mw-empty">Nothing matches. Loosen a field and search again.</div>`}</div></div>`;
  return form + list;
}
function fdTable(list) {
  return `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Case</th><th>Insured</th><th>FEIN</th><th>Broker</th><th>Line</th><th>Status</th><th>Policy</th></tr></thead><tbody>${list.map(s => `<tr><td><a href="#" onclick="fdOpen('${escHtml(s.id)}'); return false;">${escHtml(s.id)}</a></td><td>${escHtml(s.insured)}</td><td>${escHtml(s.fein)}</td><td>${escHtml(s.broker)}</td><td>${escHtml(s.lobName)}</td><td><span class="badge badge-light">${caseStatus(s)}</span></td><td>${escHtml((s.pasSync && s.pasSync.policyNumber) || "—")}</td></tr>`).join("")}</tbody></table></div>`;
}
function fdRunAdvanced() {
  const q = {}; FD_ADV.forEach(f => { q[f[0]] = fdRead("fda_" + f[0]); }); ["lob", "status", "assigned", "from", "to"].forEach(k => { q[k] = fdRead("fda_" + k); });
  FD.q = q; FD.results = fdSearch(q); fdRender();
}
function fdClearAdvanced() { FD.q = {}; FD.results = null; fdRender(); }

// ---- customer lookup (every line of one customer)
/** The cases a customer lookup draws on: every case for a role with the cross-line customer view (unifiedAccount), otherwise the cases the user can see. */
function fdCustomerSubs() { return fdInternal() && hasPermission("unifiedAccount", "view") ? SUBMISSIONS_DATASET.slice() : fdSubs(); }
/** One customer = one parent account when a case names one, else one FEIN, else one name. */
function fdInsuredKey(s) {
  if (s.accountName) return "A" + fdNorm(s.accountName);
  const d = String(s.fein || "").replace(/\D/g, "");
  return d.length === 9 ? "F" + d : "N" + fdNorm(s.insured);
}
/** Everything held about each customer that matches the term (name, parent account, FEIN, DOT or MC), across every line. */
function fdInsureds(term) {
  const t = fdNorm(term); if (!t) return [];
  const groups = {}, pool = fdCustomerSubs(), hit = {};
  pool.forEach(s => { if (fdNorm(s.insured).indexOf(t) > -1 || fdNorm(s.accountName).indexOf(t) > -1 || fdNorm(s.fein).indexOf(t) > -1 || fdNorm(s.dot).indexOf(t) > -1 || fdNorm(s.mcNumber).indexOf(t) > -1) hit[fdInsuredKey(s)] = true; });
  // a match on one entity brings in every case of the same customer (same parent account, FEIN or name)
  pool.forEach(s => { const k = fdInsuredKey(s); if (hit[k]) (groups[k] = groups[k] || []).push(s); });
  const num = (fn, s) => { try { return Number(fn(s)) || 0; } catch (e) { return 0; } };
  return Object.keys(groups).map(k => {
    const subs = groups[k].sort((a, b) => (b.receivedTimestamp || 0) - (a.receivedTimestamp || 0)), first = subs[0];
    const prem = s => typeof getSubmissionPremium === "function" ? num(getSubmissionPremium, s) : 0;
    const risk = subs.map(s => typeof getEffectiveRiskScore === "function" ? num(getEffectiveRiskScore, s) : null).filter(x => x !== null);
    return { key: k, name: first.accountName || first.insured, fein: first.fein, dot: subs.map(s => s.dot).find(Boolean) || "", mc: subs.map(s => s.mcNumber).find(Boolean) || "", address: subs.map(s => s.address).find(Boolean) || "", email: subs.map(s => s.email).find(Boolean) || "",
      brokers: Array.from(new Set(subs.map(s => s.broker).filter(Boolean))), lobs: Array.from(new Set(subs.map(s => s.lobName).filter(Boolean))), subs: subs, bound: subs.filter(policyIsBound).length, declined: subs.filter(s => s.lifecycleStatus === "declined").length,
      losses: subs.reduce((n, s) => n + (s.losses || []).length, 0), boundPremium: subs.filter(policyIsBound).reduce((n, s) => n + prem(s), 0),
      premium: subs.reduce((n, s) => n + prem(s), 0), exposure: subs.reduce((n, s) => n + (Number(s.exposureVal) || 0), 0), avgRisk: risk.length ? Math.round(risk.reduce((a, b) => a + b, 0) / risk.length) : null };
  });
}
/** The customer's cases, one row each: case, insured, line, underwriter, premium, status. */
function fdCustomerTable(list) {
  const money = s => { try { return typeof getSubmissionPremiumLabel === "function" ? getSubmissionPremiumLabel(s) : "—"; } catch (e) { return "—"; } };
  return `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Case</th><th>Insured</th><th>Line</th><th>Underwriter</th><th>Premium</th><th>Status</th><th>Policy</th></tr></thead><tbody>${list.map(s => `<tr><td><a href="#" onclick="fdOpen('${escHtml(s.id)}'); return false;">${escHtml(s.id)}</a></td><td>${escHtml(s.insured)}${s.accountName ? `<div class="p1-note">Account: ${escHtml(s.accountName)}</div>` : ""}</td><td>${escHtml(s.lobName)}</td><td>${escHtml(s.assignedTo && USER_ROLES_CONFIG[s.assignedTo] ? USER_ROLES_CONFIG[s.assignedTo].name : "Unassigned")}</td><td class="font-mono">${escHtml(money(s))}</td><td><span class="badge badge-light">${caseStatus(s)}</span></td><td>${escHtml((s.pasSync && s.pasSync.policyNumber) || "—")}</td></tr>`).join("")}</tbody></table></div>`;
}
function fdInsuredHtml() {
  const res = fdInsureds(FD.insuredTerm), wide = fdInternal() && hasPermission("unifiedAccount", "view");
  const box = `<div class="card"><div class="card-body"><label class="p1-label" for="fdi_q">Customer, account, FEIN, DOT or MC</label><div style="display:flex;gap:8px;"><input class="form-control" id="fdi_q" value="${escHtml(FD.insuredTerm)}" onkeydown="if(event.key==='Enter')fdRunInsured()"><button class="btn btn-primary" style="width:auto;" onclick="fdRunInsured()"><i class="ph ph-magnifying-glass"></i> Look up</button></div><div class="p1-note">${wide ? "Shows every line of the customer, including cases not assigned to you." : "Shows the cases you can see. A role with the cross-line customer view sees every line."}</div></div></div>`;
  if (!FD.insuredTerm) return box + `<div class="mw-empty">Type a customer to see everything held on them across every line: submissions, policies, outcomes and losses.</div>`;
  if (!res.length) return box + `<div class="mw-empty">No customer matches "${escHtml(FD.insuredTerm)}".</div>`;
  const tile = (k, v) => `<div><div class="p1-k">${k}</div><div class="p1-v">${v}</div></div>`;
  return box + res.map(g => `<div class="card"><div class="card-header"><h3><i class="ph ph-buildings"></i> ${escHtml(g.name)}</h3><span class="badge badge-light">${g.subs.length} submission${g.subs.length === 1 ? "" : "s"} across ${g.lobs.length} line${g.lobs.length === 1 ? "" : "s"}</span></div><div class="card-body">
    <div class="p1-summary">${tile("FEIN", escHtml(g.fein || "—"))}${tile("DOT / MC", escHtml(g.dot || "—") + " / " + escHtml(g.mc || "—"))}${tile("Address", escHtml(g.address || "—"))}${tile("Email", escHtml(g.email || "—"))}${tile("Brokers", escHtml(g.brokers.join(", ") || "—"))}${tile("Lines of business", escHtml(g.lobs.join(", ") || "—"))}
      ${tile("Total premium (all lines)", g.premium ? "$" + Math.round(g.premium).toLocaleString("en-US") : "—")}${tile("Total exposure", g.exposure ? "$" + Math.round(g.exposure).toLocaleString("en-US") : "—")}${tile("Average risk score", g.avgRisk === null ? "—" : g.avgRisk + "/100")}${tile("Bound / declined", g.bound + " / " + g.declined)}${tile("Losses on file", g.losses)}${tile("Bound premium", g.boundPremium ? "$" + Math.round(g.boundPremium).toLocaleString("en-US") : "—")}</div>
    ${fdCustomerTable(g.subs)}</div></div>`).join("");
}
function fdRunInsured() { FD.insuredTerm = fdRead("fdi_q"); fdRender(); }

// ---- agents and brokers
function fdBrokerKey(name) { return fdNorm(name); }
function fdRegistryRecord(name) { return typeof lookupProducerRecord === "function" ? lookupProducerRecord(name) : null; }
/** The checklist of an agency: licence and appointment are read from the registry, the rest are ticked by a person. */
function fdChecklist(name) {
  const rec = fdRegistryRecord(name), m = FD_BROKERS[fdBrokerKey(name)] || {}, c = m.checklist || {};
  const carrier = typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "";
  return [
    { key: "licence", label: "Licence on file (registry)", auto: true, done: !!(rec && (rec.licenses || []).some(l => String(l.status).toLowerCase() === "active")) },
    { key: "appointment", label: "Appointed with " + (carrier || "the carrier") + " (registry)", auto: true, done: !!(rec && (rec.appointments || []).some(a => a.carrier === carrier && String(a.status).toLowerCase() === "active")) },
    { key: "agreement", label: "Producer agreement signed", auto: false, done: !!c.agreement },
    { key: "w9", label: "W-9 on file", auto: false, done: !!c.w9 },
    { key: "eo", label: "E&O certificate on file", auto: false, done: !!c.eo }
  ];
}
function fdBrokerStatus(name) { const m = FD_BROKERS[fdBrokerKey(name)]; return m && m.status ? m.status : "Not onboarded"; }
/** Every agency we know: those on cases, in the registry and in the master. */
function fdBrokerList() {
  const names = {};
  fdSubs().forEach(s => { if (s.channelType === "broker" && s.broker) names[fdBrokerKey(s.broker)] = names[fdBrokerKey(s.broker)] || s.broker; });
  (typeof PRODUCER_REGISTRY !== "undefined" ? PRODUCER_REGISTRY : []).forEach(r => { const n = (r.names || [])[0] || r.name; if (n) names[fdBrokerKey(n)] = names[fdBrokerKey(n)] || n; });
  Object.keys(FD_BROKERS).forEach(k => { names[k] = names[k] || FD_BROKERS[k].name; });
  return Object.keys(names).map(k => {
    const name = names[k], subs = fdSubs().filter(s => fdBrokerKey(s.broker) === k), rec = fdRegistryRecord(name), m = FD_BROKERS[k] || {};
    const quoted = subs.filter(s => ["Quoted", "Pending Bind", "Bound"].indexOf(caseStatus(s)) > -1).length, bound = subs.filter(policyIsBound).length;
    return { key: k, name, npn: (rec && rec.npn) || m.npn || "", states: rec ? Array.from(new Set((rec.licenses || []).map(l => l.state))).join(", ") : "", status: fdBrokerStatus(name), subs: subs.length, quoted, bound, hit: quoted ? Math.round(bound / quoted * 100) : null, contact: m.contactName || "", phone: m.phone || "", email: m.email || "" };
  }).sort((a, b) => b.subs - a.subs || a.name.localeCompare(b.name));
}
function fdBrokerHtml() {
  const all = fdBrokerList(), t = fdNorm(FD.brokerTerm), list = all.filter(b => !t || fdNorm(b.name + b.npn + b.contact + b.states).indexOf(t) > -1);
  const rows = list.map(b => `<tr><td><a href="#" onclick="fdPickBroker('${escHtml(b.key)}'); return false;">${escHtml(b.name)}</a></td><td>${escHtml(b.npn || "—")}</td><td>${escHtml(b.states || "—")}</td><td><span class="badge ${b.status === "Active" ? "badge-success" : b.status === "Suspended" ? "badge-danger" : "badge-light"}">${b.status}</span></td><td>${b.subs}</td><td>${b.quoted}</td><td>${b.bound}</td><td>${b.hit === null ? "—" : b.hit + "%"}</td></tr>`).join("");
  const top = `<div class="card"><div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;"><input class="form-control" id="fdb_q" style="flex:1;min-width:200px;" placeholder="Search agencies by name, NPN, contact or state" value="${escHtml(FD.brokerTerm)}" onkeyup="fdBrokerSearch()"><button class="btn btn-outline" style="width:auto;" onclick="fdPickBroker('', true)"><i class="ph ph-plus"></i> Add an agency</button></div></div>`;
  const table = list.length ? `<div class="card"><div class="card-body"><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Agency</th><th>NPN</th><th>Licensed in</th><th>Onboarding</th><th>Cases</th><th>Quoted</th><th>Bound</th><th>Hit</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`
    : `<div class="mw-empty">No agencies yet. They appear when a case names a broker or a licensing registry is loaded, or add one by hand.</div>`;
  return top + table + (FD.broker !== "" ? fdBrokerProfile() : "");
}
function fdBrokerSearch() { FD.brokerTerm = fdRead("fdb_q"); const pos = document.getElementById("fdb_q"); fdRender(); const again = document.getElementById("fdb_q"); if (again && pos) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }
function fdPickBroker(key, isNew) { FD.broker = isNew ? "__new" : key; fdRender(); }
function fdBrokerProfile() {
  const isNew = FD.broker === "__new", b = isNew ? null : fdBrokerList().find(x => x.key === FD.broker);
  if (!isNew && !b) return "";
  const name = isNew ? "" : b.name, m = isNew ? {} : (FD_BROKERS[b.key] || {}), canEdit = hasPermission("brokerRelations", "edit"), dis = canEdit ? "" : " disabled";
  const checks = isNew ? [] : fdChecklist(name);
  return `<div class="card"><div class="card-header"><h3><i class="ph ph-identification-card"></i> ${isNew ? "New agency" : escHtml(name)}</h3><button class="btn btn-xs btn-outline" style="width:auto;" onclick="fdPickBroker('')">Close</button></div><div class="card-body">
    <div class="mw-grid">
      <div class="form-group mw-wide"><label for="fdp_name">Agency name</label><input class="form-control" id="fdp_name" value="${escHtml(name)}"${isNew ? "" : " disabled"}${dis}></div>
      <div class="form-group"><label for="fdp_contact">Contact person</label><input class="form-control" id="fdp_contact" value="${escHtml(m.contactName || "")}"${dis}></div>
      <div class="form-group"><label for="fdp_phone">Phone</label><input class="form-control" id="fdp_phone" value="${escHtml(m.phone || "")}"${dis}></div>
      <div class="form-group"><label for="fdp_email">Email</label><input class="form-control" type="email" id="fdp_email" value="${escHtml(m.email || "")}"${dis}></div>
      <div class="form-group"><label for="fdp_npn">NPN</label><input class="form-control" id="fdp_npn" value="${escHtml((b && b.npn) || m.npn || "")}"${dis}></div>
      <div class="form-group mw-wide"><label for="fdp_address">Address</label><input class="form-control" id="fdp_address" value="${escHtml(m.address || "")}"${dis}></div>
      <div class="form-group"><label for="fdp_status">Onboarding status</label><select class="form-control" id="fdp_status"${dis}>${FD_BROKER_STATES.map(s => `<option${(m.status || "Not onboarded") === s ? " selected" : ""}>${s}</option>`).join("")}</select></div></div>
    ${isNew ? "" : `<div class="cl-subhead">Onboarding checklist</div><ul class="cl-lines">${checks.map(c => `<li><label><input type="checkbox" id="fdc_${c.key}" ${c.done ? "checked" : ""} ${c.auto || !canEdit ? "disabled" : ""}> ${escHtml(c.label)}${c.auto ? ' <span class="text-muted">(read from the registry)</span>' : ""}</label></li>`).join("")}</ul>`}
    <div class="p1-note">Active needs every item ticked. ${canEdit ? "" : "Saving needs edit rights on broker relations."}</div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="fdSaveBroker()"${dis}><i class="ph ph-floppy-disk"></i> Save</button></div></div></div>`;
}
/** Saves the master record. Returns { ok, message }. */
function fdBrokerSave(f) {
  const name = String(f.name || "").trim();
  if (name.length < 2) return { ok: false, message: "Enter the agency name." };
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return { ok: false, message: "That email address does not look right." };
  if (FD_BROKER_STATES.indexOf(f.status) < 0) return { ok: false, message: "Choose an onboarding status." };
  const key = fdBrokerKey(name), prev = FD_BROKERS[key] || {};
  const checklist = Object.assign({}, prev.checklist, f.checklist || {});
  const rec = { name, contactName: f.contactName || "", phone: f.phone || "", email: f.email || "", npn: f.npn || "", address: f.address || "", status: f.status, checklist, updatedBy: currentUserRole, updatedAt: nowStamp() };
  FD_BROKERS[key] = rec;
  const missing = fdChecklist(name).filter(c => !c.done);
  if (f.status === "Active" && missing.length) { FD_BROKERS[key] = Object.assign(rec, { status: prev.status || "Not onboarded" }); return { ok: false, message: "Active needs every checklist item: " + missing.map(c => c.label).join("; ") + "." }; }
  fdSave(FD_BROKER_KEY, FD_BROKERS);
  return { ok: true, record: rec, key };
}
function fdSaveBroker() {
  if (!hasPermission("brokerRelations", "edit")) { denyPermission("brokerRelations", "edit"); return; }
  const f = { name: fdRead("fdp_name"), contactName: fdRead("fdp_contact"), phone: fdRead("fdp_phone"), email: fdRead("fdp_email"), npn: fdRead("fdp_npn"), address: fdRead("fdp_address"), status: fdRead("fdp_status"), checklist: {} };
  ["agreement", "w9", "eo"].forEach(k => { const c = document.getElementById("fdc_" + k); if (c) f.checklist[k] = c.checked; });
  const r = fdBrokerSave(f);
  showToast(r.ok ? "✅ " + f.name + " saved." : "⛔ " + r.message, r.ok ? "success" : "danger");
  if (r.ok) FD.broker = r.key;
  fdRender();
}

// ---- companies
/** Carriers and markets: the tenants and agreements loaded, and the carriers named on the registry and the cases. */
function fdCompanies() {
  const out = {};
  const add = (name, kind, src) => { if (!name) return; const k = fdNorm(name); out[k] = out[k] || { name, kind: kind || "", sources: [], agreements: 0 }; if (kind && !out[k].kind) out[k].kind = kind; if (out[k].sources.indexOf(src) < 0) out[k].sources.push(src); };
  if (typeof DD_CFG !== "undefined") {
    DD_CFG.tenants.forEach(t => add(t.name, t.type, "Distribution agreements"));
    DD_CFG.agreements.forEach(a => { [a.principal, a.distributor].forEach(id => { const t = DD_CFG.tenants.find(x => x.id === id); if (t) out[fdNorm(t.name)].agreements++; }); });
  }
  if (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" && typeof PRODUCER_REGISTRY !== "undefined" && PRODUCER_REGISTRY.length) add(PRODUCER_DEFAULT_CARRIER, "carrier", "Licensing registry");
  (typeof PRODUCER_REGISTRY !== "undefined" ? PRODUCER_REGISTRY : []).forEach(r => (r.appointments || []).forEach(a => add(a.carrier, "carrier", "Producer appointments")));
  fdSubs().forEach(s => { if (s.carrier) add(s.carrier, "carrier", "Cases"); });
  return Object.keys(out).map(k => out[k]).sort((a, b) => a.name.localeCompare(b.name));
}
function fdCompanyHtml() {
  const t = fdNorm(FD.companyTerm), list = fdCompanies().filter(c => !t || fdNorm(c.name + c.kind).indexOf(t) > -1);
  const top = `<div class="card"><div class="card-body"><input class="form-control" id="fdco_q" placeholder="Search carriers and markets" value="${escHtml(FD.companyTerm)}" onkeyup="fdCompanySearch()"></div></div>`;
  const body = list.length ? `<div class="card"><div class="card-body"><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Company</th><th>Type</th><th>Agreements</th><th>Seen in</th></tr></thead><tbody>${list.map(c => `<tr><td><strong>${escHtml(c.name)}</strong></td><td>${escHtml(c.kind || "—")}</td><td>${c.agreements}</td><td>${escHtml(c.sources.join(", "))}</td></tr>`).join("")}</tbody></table></div></div></div>`
    : `<div class="mw-empty">No carriers or markets are known yet. They appear when distribution agreements or a licensing registry are loaded, or when a case names a carrier.</div>`;
  return top + body;
}
function fdCompanySearch() { FD.companyTerm = fdRead("fdco_q"); fdRender(); const e = document.getElementById("fdco_q"); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }

// ---- phone book
/** Contacts from the brokers, the customers and the team, plus the ones added by hand. */
function fdContacts() {
  const out = [];
  Object.keys(FD_BROKERS).forEach(k => { const m = FD_BROKERS[k]; if (m.contactName || m.phone || m.email) out.push({ name: m.contactName || m.name, kind: "Broker", org: m.name, phone: m.phone || "", email: m.email || "", src: "master" }); });
  const seen = {};
  fdSubs().forEach(s => { if (s.email && !seen[fdNorm(s.email)]) { seen[fdNorm(s.email)] = 1; out.push({ name: s.insured, kind: "Customer", org: s.insured, phone: "", email: s.email, src: "case" }); } });
  Object.keys(USER_ROLES_CONFIG).forEach(k => { const u = USER_ROLES_CONFIG[k], pr = typeof tpProfile === "function" ? tpProfile(k) : {}; const email = u.email || pr.email, phone = u.phone || pr.phone; if (u.name && (email || phone)) out.push({ name: u.name, kind: "Team", org: u.title || "", phone: phone || "", email: email || "", src: "team" }); });
  FD_BOOK.forEach(c => out.push(Object.assign({ src: "manual" }, c)));
  return out;
}
function fdBookAdd(f) {
  const name = String(f.name || "").trim();
  if (name.length < 2) return { ok: false, message: "Enter a name." };
  if (!f.phone && !f.email) return { ok: false, message: "Enter a phone number or an email." };
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return { ok: false, message: "That email address does not look right." };
  const c = { id: "CT-" + (FD_BOOK.length + 1) + "-" + Date.now().toString(36), name, kind: ["Broker", "Customer", "Team", "Other"].indexOf(f.kind) > -1 ? f.kind : "Other", org: String(f.org || "").trim(), phone: String(f.phone || "").trim(), email: String(f.email || "").trim() };
  FD_BOOK.push(c); fdSave(FD_BOOK_KEY, FD_BOOK);
  return { ok: true, contact: c };
}
function fdBookRemove(id) { const n = FD_BOOK.length; FD_BOOK = FD_BOOK.filter(c => c.id !== id); if (FD_BOOK.length !== n) fdSave(FD_BOOK_KEY, FD_BOOK); fdRender(); }
function fdBookHtml() {
  const t = fdNorm(FD.bookTerm), list = fdContacts().filter(c => (!FD.bookKind || c.kind === FD.bookKind) && (!t || fdNorm(c.name + c.org + c.phone + c.email).indexOf(t) > -1));
  const bar = `<div class="card"><div class="card-body"><div style="display:flex;gap:8px;flex-wrap:wrap;"><input class="form-control" id="fdk_q" style="flex:1;min-width:200px;" placeholder="Search name, company, phone or email" value="${escHtml(FD.bookTerm)}" onkeyup="fdBookSearch()">
    <select class="form-control" id="fdk_kind" style="width:160px;" onchange="fdBookKind()"><option value="">All</option>${["Broker", "Customer", "Team", "Other"].map(k => `<option${FD.bookKind === k ? " selected" : ""}>${k}</option>`).join("")}</select></div>
    <details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:700;">Add a contact</summary><div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="fdk_name">Name</label><input class="form-control" id="fdk_name"></div><div class="form-group"><label for="fdk_org">Company</label><input class="form-control" id="fdk_org"></div>
      <div class="form-group"><label for="fdk_phone">Phone</label><input class="form-control" id="fdk_phone"></div><div class="form-group"><label for="fdk_email">Email</label><input class="form-control" id="fdk_email" type="email"></div>
      <div class="form-group"><label for="fdk_type">Kind</label><select class="form-control" id="fdk_type"><option>Broker</option><option>Customer</option><option>Team</option><option>Other</option></select></div></div>
      <div class="p1-actions"><button class="btn btn-primary" onclick="fdBookAddForm()">Add contact</button></div></details></div></div>`;
  const body = list.length ? `<div class="card"><div class="card-body"><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Name</th><th>Kind</th><th>Company</th><th>Phone</th><th>Email</th><th></th></tr></thead><tbody>${list.map(c => `<tr><td><strong>${escHtml(c.name)}</strong></td><td>${c.kind}</td><td>${escHtml(c.org)}</td><td>${c.phone ? `<a href="tel:${escHtml(c.phone)}">${escHtml(c.phone)}</a>` : "—"}</td><td>${c.email ? `<a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a>` : "—"}</td><td>${c.src === "manual" ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="fdBookRemove('${escHtml(c.id)}')">Remove</button>` : ""}</td></tr>`).join("")}</tbody></table></div><div class="p1-note">Email links open your own mail program; nothing is sent from here.</div></div></div>`
    : `<div class="mw-empty">No contacts yet. Customers with an email on a case and any broker contact you save appear here, or add one by hand.</div>`;
  return bar + body;
}
function fdBookSearch() { FD.bookTerm = fdRead("fdk_q"); fdRender(); const e = document.getElementById("fdk_q"); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } }
function fdBookKind() { FD.bookKind = fdRead("fdk_kind"); fdRender(); }
function fdBookAddForm() {
  const r = fdBookAdd({ name: fdRead("fdk_name"), org: fdRead("fdk_org"), phone: fdRead("fdk_phone"), email: fdRead("fdk_email"), kind: fdRead("fdk_type") });
  showToast(r.ok ? "✅ " + r.contact.name + " added." : "⛔ " + r.message, r.ok ? "success" : "danger");
  fdRender();
}

function fdRender() {
  const root = document.getElementById("findRoot"); if (!root) return;
  const internal = fdInternal(), tabs = [["advanced", "Advanced search", "ph-sliders-horizontal", true], ["insured", "Customer", "ph-buildings", true], ["brokers", "Agents & brokers", "ph-identification-card", internal], ["companies", "Companies", "ph-bank", internal], ["book", "Phone book", "ph-address-book", internal], ["guidelines", "State guidelines", "ph-map-trifold", internal && typeof sgHtml === "function"]].filter(t => t[3]);
  if (!tabs.some(t => t[0] === FD.tab)) FD.tab = "advanced";
  const body = { advanced: fdAdvancedHtml, insured: fdInsuredHtml, brokers: fdBrokerHtml, companies: fdCompanyHtml, book: fdBookHtml, guidelines: typeof sgHtml === "function" ? sgHtml : () => "" }[FD.tab]();
  root.innerHTML = `<div class="p1-head"><div><h2 class="p1-h" style="margin:0;">Search &amp; Lookup</h2><div class="p1-sub" style="margin:0;">Find a case, a customer, an agency, a company or a contact.</div></div></div>
    <div class="mw-tabs">${tabs.map(t => `<button class="tab-btn${FD.tab === t[0] ? " active" : ""}" onclick="fdTab('${t[0]}')"><i class="ph ${t[2]}"></i> ${t[1]}</button>`).join("")}</div>${body}`;
}

(function fdInstall() {
  // every case that is opened goes on the Recent list
  const orig = window.selectSubmission;
  if (typeof orig === "function") window.selectSubmission = function (id) { try { if (id) fdRecordRecent(id); } catch (e) { /* the list is a convenience */ } return orig.apply(this, arguments); };
  document.addEventListener("click", function (e) { const box = document.getElementById("hdrSearch"); if (box && !box.contains(e.target)) fdCloseHeader(); });
})();
