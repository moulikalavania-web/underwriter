/**
 * ============================================================================
 * DATA FRESHNESS AND COVERAGE RELATIONSHIPS
 * ----------------------------------------------------------------------------
 * DATA FRESHNESS   A figure goes stale. A loss run valued eight months ago, a registry answer from last year, a value read from an
 *                  old document: each should be refreshed before a quote or a bind. A freshness rule (a register record) names the
 *                  attribute, the most days old it may be, the stage at which it is checked (quote, bind or renewal), and what a stale
 *                  one leads to:
 *                      warn      a note on the case,
 *                      refresh   a refresh request is opened (an open task to get a current one),
 *                      block     the quote or the bind is stopped until it is refreshed or the rule is waived by an approver.
 *                  The attributes are the ones the case holds a date for: the loss run valuation date (loss_run), a value's as-of date
 *                  (obs:<field>, from the data observations) and a provider response's received date (enrichment:<product code>).
 *                  An attribute with no date on the case is "unknown", which is shown, never treated as fresh.
 *
 * COVERAGE RELATIONSHIPS  Rules between two coverages (a register record): REQUIRES (A needs B), ALLOWS (the pairing is permitted),
 *                  EXCLUDES (A and B cannot both be written), DEFAULTS ON (A brings B in; B missing is flagged) and CONSTRAINS (A's
 *                  limit must not be above B's: the UM/UIM limit at most the liability limit; or A's deductible at least B's). Each is
 *                  checked against the case's coverage rows and has a severity (block or warn). A block stops the quote.
 *
 * Both registers are proposed by one person and put in force by a different one, are versioned, and start empty.
 * ============================================================================
 */

const FR_KEY = "FUT_UW_FRESHNESS_V1";
const FR_STAGES = { quote: "Quote", bind: "Bind", renewal: "Renewal" };
const FR_ACTIONS = { warn: "Warn", refresh: "Open a refresh request", block: "Block" };
const CR_RELATIONS = { requires: "requires", allows: "allows", excludes: "excludes", defaults_on: "brings in by default", constrains: "is limited by" };
const CR_CONSTRAINTS = { limit_lte: "limit at most", deductible_gte: "deductible at least" };
var FR = { rules: [], rels: [], seq: 0 };
try { const r = JSON.parse(localStorage.getItem(FR_KEY)); if (r && Array.isArray(r.rules)) FR = Object.assign(FR, r); } catch (e) { /* none yet */ }
function frSave() { try { localStorage.setItem(FR_KEY, JSON.stringify(FR)); } catch (e) { /* keep for this session */ } }
function frNew(p) { return p + "-" + (++FR.seq); }

// ----------------------------------------------------------------------------
// 1. FRESHNESS RULES
// ----------------------------------------------------------------------------
function frAttrOk(a) { return a === "loss_run" || /^obs:[A-Za-z0-9_.]+$/.test(a || "") || /^enrichment:[A-Za-z0-9_-]+$/.test(a || ""); }
function frValidate(r) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(r.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (!frAttrOk(r.attribute)) e.push("the attribute is loss_run, obs:<field> or enrichment:<product code>");
  if (!(Number.isInteger(r.maxAgeDays) && r.maxAgeDays >= 1)) e.push("the most days old is a whole number of 1 or more");
  if (!FR_STAGES[r.refreshAtStage]) e.push("choose the stage it is checked at");
  if (!FR_ACTIONS[r.staleAction]) e.push("choose what a stale one leads to");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom || "")) e.push("enter the date it starts");
  return e;
}
function frAdd(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const r = { id: frNew("FR"), code: String(f.code || "").trim(), version: 1, product: f.product || "*", lob: f.lob || "*", attribute: String(f.attribute || "").trim(), maxAgeDays: f.maxAgeDays === "" ? NaN : Number(f.maxAgeDays), refreshAtStage: f.refreshAtStage, staleAction: f.staleAction, effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = frValidate(r);
  if (FR.rules.some(x => x.code === r.code)) errs.push("a rule with this code exists; start a new version of it");
  if (errs.length) { FR.seq--; return { ok: false, error: "invalid", errors: errs }; }
  FR.rules.push(r); frSave();
  return { ok: true, rule: r };
}
function frAct(id, what) {
  const r = FR.rules.find(x => x.id === id); if (!r) return;
  const res = ucAct(FR.rules, r, what, frNew("FR"));
  if (!res.ok && what === "newver") FR.seq--;
  if (res.error !== "cancelled") ucToast(res, "Done.");
  frSave(); ucRender();
}
function frIso(v) { if (!v) return null; if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10); const t = Date.parse(String(v)); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); }
function frDays(from, to) { return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000); }
/** The date the case holds for an attribute, or null. */
function frAsOf(sub, attribute) {
  if (attribute === "loss_run") { try { const a = analyzeLossRuns(sub); return a && !a.noRows ? frIso(a.valued) : null; } catch (e) { return null; } }
  if (attribute.indexOf("obs:") === 0) { const p = attribute.slice(4); const d = (typeof obsLive === "function" ? obsLive(sub) : []).filter(o => o.path === p).map(o => frIso(o.asOf)).filter(Boolean).sort().pop(); return d || null; }
  if (attribute.indexOf("enrichment:") === 0) { const c = attribute.slice(11); return (sub.enrichmentResponses || []).filter(r => r.productCode === c).map(r => frIso(r.receivedAt)).filter(Boolean).sort().pop() || null; }
  return null;
}
/** Every rule in force for the case at a stage, tested: { rule, asOf, ageDays, state: fresh | stale | unknown }. */
function frCheck(sub, stage, day) {
  const d = day || todayIso(), prod = typeof rsProductRef === "function" ? rsProductRef() : null;
  return FR.rules.filter(r => r.status === "active" && ucInForce(r.effectiveFrom, r.effectiveTo, d) && r.refreshAtStage === stage && ucScopeHas(r.lob, sub.lobKey) && ucScopeHas(r.product, prod && prod.id)).map(r => {
    const asOf = frAsOf(sub, r.attribute), age = asOf ? frDays(asOf, d) : null;
    return { rule: r, asOf: asOf, ageDays: age, state: asOf === null ? "unknown" : age > r.maxAgeDays ? "stale" : "fresh", waived: !!(sub.freshnessWaivers || []).find(w => w.ruleId === r.id && w.ruleVersion === r.version && w.asOf === asOf) };
  });
}
function frRefreshList(sub) { if (!sub.refreshRequests) sub.refreshRequests = []; return sub.refreshRequests; }
/** The gate at a stage: stale or unknown figures lead to the rule's action. Returns { ok, blockers, warnings, opened }. */
function frGate(sub, stage) {
  const rows = frCheck(sub, stage), out = { ok: true, blockers: [], warnings: [], opened: [] };
  rows.filter(x => x.state !== "fresh" && !x.waived).forEach(x => {
    const text = x.rule.attribute + (x.state === "unknown" ? " has no date on the case" : " is " + x.ageDays + " days old (at most " + x.rule.maxAgeDays + ")") + " [" + x.rule.code + "]";
    if (x.rule.staleAction === "block") { out.blockers.push(text); out.ok = false; }
    else {
      out.warnings.push(text);
      if (x.rule.staleAction === "refresh" && !frRefreshList(sub).some(q => q.ruleId === x.rule.id && q.status === "open")) { const q = { id: "RF-" + (frRefreshList(sub).length + 1), ruleId: x.rule.id, ruleCode: x.rule.code, attribute: x.rule.attribute, reason: text, stage: stage, status: "open", openedAt: nowStamp(), openedBy: ucActor() }; frRefreshList(sub).push(q); out.opened.push(q); }
    }
  });
  return out;
}
function frWaive(sub, ruleId, reason) {
  if (!hasPermission("authority", "override")) { denyPermission("authority", "override"); return { ok: false, error: "permission" }; }
  const r = FR.rules.find(x => x.id === ruleId);
  if (!r || r.staleAction !== "block") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  if (!sub.freshnessWaivers) sub.freshnessWaivers = [];
  const asOf = frAsOf(sub, r.attribute);
  sub.freshnessWaivers.push({ ruleId: r.id, ruleCode: r.code, ruleVersion: r.version, asOf: asOf, reason: String(reason).trim(), by: ucActor(), at: nowStamp() });
  logDecision(sub, sub.currentStep || 6, "freshness_waived", r.code + " (" + r.attribute + ") waived for the figure as of " + (asOf || "no date") + ": " + String(reason).trim());
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}
function frCloseRefresh(sub, id, note) {
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return { ok: false, error: "permission" }; }
  const q = frRefreshList(sub).find(x => x.id === id);
  if (!q || q.status !== "open") return { ok: false, error: "state" };
  const rule = FR.rules.find(x => x.id === q.ruleId), asOf = rule ? frAsOf(sub, rule.attribute) : null, age = asOf ? frDays(asOf, todayIso()) : null;
  if (rule && (age === null || age > rule.maxAgeDays)) return { ok: false, error: "still_stale" };
  q.status = "closed"; q.closedAt = nowStamp(); q.closedBy = ucActor(); q.note = String(note || "").trim(); q.asOfAtClose = asOf;
  logDecision(sub, sub.currentStep || 6, "freshness_refreshed", q.id + " closed: " + q.attribute + " is now as of " + asOf + ".");
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}
function frGuard(stage) {
  return function (args) {
    const sub = (args && args[0] && typeof args[0] === "string" && SUBMISSIONS_DATASET.find(s => s.id === args[0])) || SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId);
    if (!sub) return true;
    const stages = stage === "quote" && sub.renewalOf ? ["quote", "renewal"] : [stage];
    let blockers = [];
    stages.forEach(st => { const g = frGate(sub, st); blockers = blockers.concat(g.blockers); if (g.warnings.length) showToast("Data freshness: " + g.warnings.join("; ") + ".", "warning"); });
    if (blockers.length) { logDecision(sub, sub.currentStep || 12, "freshness_blocked", (stage === "bind" ? "Bind" : "Quote") + " blocked: " + blockers.join("; ") + "."); showToast("⛔ " + (stage === "bind" ? "Bind" : "Quote") + " blocked (stale data): " + blockers.join("; ") + ".", "danger"); return false; }
    return true;
  };
}

// ----------------------------------------------------------------------------
// 2. COVERAGE RELATIONSHIPS
// ----------------------------------------------------------------------------
function crValidate(r) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(r.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (String(r.source || "").trim().length < 2 || String(r.target || "").trim().length < 2) e.push("name both coverages");
  else if (String(r.source).trim().toLowerCase() === String(r.target).trim().toLowerCase()) e.push("a coverage cannot be related to itself");
  if (!CR_RELATIONS[r.relation]) e.push("choose the relationship");
  if (r.relation === "constrains" && !CR_CONSTRAINTS[r.constraint]) e.push("choose what is constrained (limit at most, or deductible at least)");
  if (["block", "warn"].indexOf(r.severity) < 0) e.push("choose block or warn");
  if (String(r.message || "").trim().length < 5) e.push("write the message the underwriter will see");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveFrom || "")) e.push("enter the date it starts");
  return e;
}
function crAdd(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const r = { id: frNew("CR"), code: String(f.code || "").trim(), version: 1, lob: f.lob || "*", state: f.state || "*", source: String(f.source || "").trim(), relation: f.relation, target: String(f.target || "").trim(), constraint: f.relation === "constrains" ? f.constraint : "", severity: f.severity, message: String(f.message || "").trim(), effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = crValidate(r);
  if (FR.rels.some(x => x.code === r.code)) errs.push("a rule with this code exists; start a new version of it");
  if (errs.length) { FR.seq--; return { ok: false, error: "invalid", errors: errs }; }
  FR.rels.push(r); frSave();
  return { ok: true, rule: r };
}
function crAct(id, what) {
  const r = FR.rels.find(x => x.id === id); if (!r) return;
  const res = ucAct(FR.rels, r, what, frNew("CR"));
  if (!res.ok && what === "newver") FR.seq--;
  if (res.error !== "cancelled") ucToast(res, "Done.");
  frSave(); ucRender();
}
function crMoney(v) { const m = /-?[\d,]+(?:\.\d+)?/.exec(String(v || "").replace(/\s/g, "")); const n = m ? parseFloat(m[0].replace(/,/g, "")) : NaN; return isNaN(n) ? null : n; }
function crRow(sub, name) { const n = String(name).toLowerCase(); return (sub.coverageRows || []).find(r => String(r.line || "").toLowerCase().indexOf(n) > -1 && !r.viaQuoteCondition) || (sub.coverageRows || []).find(r => String(r.line || "").toLowerCase().indexOf(n) > -1) || null; }
/** Every relationship rule in force, tested against the case's coverages: result pass, fail, not_applicable or unknown. */
function crCheck(sub, day) {
  const d = day || todayIso(), st = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  return FR.rels.filter(r => r.status === "active" && ucInForce(r.effectiveFrom, r.effectiveTo, d) && ucScopeHas(r.lob, sub.lobKey) && (r.state === "*" || (st && ucScopeHas(r.state, st)))).map(r => {
    const a = crRow(sub, r.source), b = crRow(sub, r.target);
    let result = "not_applicable", detail = "";
    if (a) {
      if (r.relation === "requires") { result = b ? "pass" : "fail"; detail = b ? "" : r.target + " is not on the case"; }
      else if (r.relation === "allows") { result = "pass"; detail = b ? "the pairing is permitted" : ""; }
      else if (r.relation === "excludes") { result = b ? "fail" : "pass"; detail = b ? r.target + " is on the case with " + r.source : ""; }
      else if (r.relation === "defaults_on") { result = b ? "pass" : "fail"; detail = b ? "" : r.target + " is brought in with " + r.source + " and is not on the case"; }
      else if (r.relation === "constrains") {
        if (!b) { result = "unknown"; detail = r.target + " is not on the case, so the limit cannot be compared"; }
        else {
          const x = crMoney(r.constraint === "limit_lte" ? a.limit : a.ded), y = crMoney(r.constraint === "limit_lte" ? b.limit : b.ded);
          if (x === null || y === null) { result = "unknown"; detail = "a figure is missing"; }
          else { const ok = r.constraint === "limit_lte" ? x <= y : x >= y; result = ok ? "pass" : "fail"; detail = (r.constraint === "limit_lte" ? "limit " : "deductible ") + x + " against " + y; }
        }
      }
    }
    return { rule: r, result: result, detail: detail };
  });
}
function crGuard() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId); if (!sub) return true;
  const rows = crCheck(sub), bad = rows.filter(x => x.result === "fail" && x.rule.severity === "block"), warn = rows.filter(x => x.result === "fail" && x.rule.severity === "warn");
  if (warn.length) showToast("Coverage relationship: " + warn.map(x => x.rule.message).join("; "), "warning");
  if (bad.length) { logDecision(sub, sub.currentStep || 12, "coverage_relationship_blocked", "Quote blocked: " + bad.map(x => x.rule.code + " " + x.rule.message + (x.detail ? " (" + x.detail + ")" : "")).join("; ") + "."); showToast("⛔ Quote blocked (coverage relationship): " + bad.map(x => x.rule.message).join("; "), "danger"); return false; }
  return true;
}

// ----------------------------------------------------------------------------
// 3. SCREENS
// ----------------------------------------------------------------------------
function frHtml() {
  const edit = ucCan("edit");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New freshness rule</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="fr_code">Code</label><input class="form-control" id="fr_code"></div><div class="form-group"><label for="fr_attr">Attribute</label><input class="form-control" id="fr_attr" placeholder="loss_run, obs:dot, enrichment:FMCSA"></div>
    <div class="form-group"><label for="fr_age">Most days old</label><input class="form-control" id="fr_age"></div><div class="form-group"><label for="fr_stage">Checked at</label><select class="form-control" id="fr_stage">${Object.keys(FR_STAGES).map(k => `<option value="${k}">${FR_STAGES[k]}</option>`).join("")}</select></div>
    <div class="form-group"><label for="fr_act">A stale one</label><select class="form-control" id="fr_act">${Object.keys(FR_ACTIONS).map(k => `<option value="${k}">${FR_ACTIONS[k]}</option>`).join("")}</select></div><div class="form-group"><label for="fr_lob">Line key (or all)</label><input class="form-control" id="fr_lob" placeholder="*"></div>
    <div class="form-group"><label for="fr_prod">Product id (or all)</label><input class="form-control" id="fr_prod" placeholder="*"></div><div class="form-group"><label for="fr_from">Starts</label><input type="date" class="form-control" id="fr_from" value="${todayIso()}"></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="frAddUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing freshness rules needs edit rights on review rules.</div>`;
  const rows = FR.rules.slice().reverse().map(r => `<tr><td><strong>${escHtml(r.code)}</strong> v${r.version}</td><td>${escHtml(r.attribute)}</td><td>at most ${r.maxAgeDays} days · checked at ${escHtml(FR_STAGES[r.refreshAtStage])}</td><td>${escHtml(FR_ACTIONS[r.staleAction])}</td><td>${escHtml("lob: " + ucListText(r.lob) + " · product: " + ucListText(r.product))}</td><td>${ucStatusBadge(r.status)}${r.rejectedReason ? `<div class="p1-note">Sent back: ${escHtml(r.rejectedReason)}</div>` : ""}</td><td>${ucActionsHtml("frAct", r)}</td></tr>`).join("");
  return form + (FR.rules.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Rule</th><th>Attribute</th><th>Age and stage</th><th>If stale</th><th>Where</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No freshness rule is registered. Only a provider answer's own expiry is checked.</div>`);
}
function frAddUi() { const r = frAdd({ code: ucV("fr_code"), attribute: ucV("fr_attr"), maxAgeDays: ucV("fr_age"), refreshAtStage: ucV("fr_stage"), staleAction: ucV("fr_act"), lob: ucV("fr_lob") || "*", product: ucV("fr_prod") || "*", effectiveFrom: ucV("fr_from") }); ucToast(r, "Draft created."); ucRender(); }
function crHtml() {
  const edit = ucCan("edit");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New coverage relationship</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="cr_code">Code</label><input class="form-control" id="cr_code"></div><div class="form-group"><label for="cr_src">Coverage (as named on the quote)</label><input class="form-control" id="cr_src" placeholder="e.g. Physical Damage"></div>
    <div class="form-group"><label for="cr_rel">Relationship</label><select class="form-control" id="cr_rel">${Object.keys(CR_RELATIONS).map(k => `<option value="${k}">${escHtml(CR_RELATIONS[k])}</option>`).join("")}</select></div><div class="form-group"><label for="cr_tgt">Other coverage</label><input class="form-control" id="cr_tgt"></div>
    <div class="form-group"><label for="cr_con">If limited by</label><select class="form-control" id="cr_con">${Object.keys(CR_CONSTRAINTS).map(k => `<option value="${k}">${escHtml(CR_CONSTRAINTS[k])}</option>`).join("")}</select></div><div class="form-group"><label for="cr_sev">Severity</label><select class="form-control" id="cr_sev"><option>block</option><option>warn</option></select></div>
    <div class="form-group mw-wide"><label for="cr_msg">Message</label><input class="form-control" id="cr_msg"></div><div class="form-group"><label for="cr_lob">Line key (or all)</label><input class="form-control" id="cr_lob" placeholder="*"></div><div class="form-group"><label for="cr_state">States (comma list, or all)</label><input class="form-control" id="cr_state" placeholder="*"></div><div class="form-group"><label for="cr_from">Starts</label><input type="date" class="form-control" id="cr_from" value="${todayIso()}"></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="crAddUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing relationships needs edit rights on review rules.</div>`;
  const rows = FR.rels.slice().reverse().map(r => `<tr><td><strong>${escHtml(r.code)}</strong> v${r.version}</td><td>${escHtml(r.source)} ${escHtml(CR_RELATIONS[r.relation])} ${escHtml(r.target)}${r.constraint ? " (" + escHtml(CR_CONSTRAINTS[r.constraint]) + ")" : ""}</td><td>${escHtml(r.severity)}<div class="p1-note">${escHtml(r.message)}</div></td><td>${escHtml("lob: " + ucListText(r.lob) + " · state: " + ucListText(r.state))}</td><td>${ucStatusBadge(r.status)}${r.rejectedReason ? `<div class="p1-note">Sent back: ${escHtml(r.rejectedReason)}</div>` : ""}</td><td>${ucActionsHtml("crAct", r)}</td></tr>`).join("");
  return form + (FR.rels.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Rule</th><th>Relationship</th><th>Severity</th><th>Where</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No coverage relationship is registered.</div>`);
}
function crAddUi() { const r = crAdd({ code: ucV("cr_code"), source: ucV("cr_src"), relation: ucV("cr_rel"), target: ucV("cr_tgt"), constraint: ucV("cr_con"), severity: ucV("cr_sev"), message: ucV("cr_msg"), lob: ucV("cr_lob") || "*", state: ucList(ucV("cr_state") || "*"), effectiveFrom: ucV("cr_from") }); ucToast(r, "Draft created."); ucRender(); }
function frCaseHtml(sub) {
  const stages = ["quote", "bind", "renewal"], rows = [].concat.apply([], stages.map(st => frCheck(sub, st).map(x => Object.assign({ stage: st }, x))));
  const canWaive = hasPermission("authority", "override"), canEdit = hasPermission("submissionData", "edit");
  const fr = rows.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Rule</th><th>Attribute</th><th>As of</th><th>Age</th><th>State</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td>${escHtml(x.rule.code)}<div class="p1-note">${escHtml(FR_STAGES[x.stage])} · ${escHtml(FR_ACTIONS[x.rule.staleAction])}</div></td><td>${escHtml(x.rule.attribute)}</td><td>${escHtml(x.asOf || "no date")}</td><td>${x.ageDays === null ? "—" : x.ageDays + " / " + x.rule.maxAgeDays + " days"}</td><td><span class="badge ${x.state === "fresh" ? "badge-success" : x.state === "stale" ? "badge-danger" : "badge-warning"}">${x.state}${x.waived ? " · waived" : ""}</span></td><td>${x.state !== "fresh" && !x.waived && x.rule.staleAction === "block" && canWaive ? `<button class="btn btn-xs btn-outline" onclick="frWaiveUi('${x.rule.id}')">Waive</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<div class="mw-empty">No freshness rule applies to this case.</div>';
  const rf = frRefreshList(sub).length ? `<div class="rules-table-container" style="max-height:none;margin-top:8px;"><table class="data-table"><thead><tr><th>Refresh request</th><th>Why</th><th>Status</th><th></th></tr></thead><tbody>${frRefreshList(sub).map(q => `<tr><td>${escHtml(q.id)}</td><td>${escHtml(q.reason)}</td><td>${escHtml(q.status)}${q.closedAt ? " " + escHtml(q.closedAt) : ""}</td><td>${q.status === "open" && canEdit ? `<button class="btn btn-xs btn-outline" onclick="frCloseUi('${q.id}')">Close (figure refreshed)</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : "";
  const rel = crCheck(sub);
  const rl = rel.length ? `<div class="rules-table-container" style="max-height:none;margin-top:8px;"><table class="data-table"><thead><tr><th>Relationship</th><th>Result</th><th>Detail</th></tr></thead><tbody>${rel.map(x => `<tr><td>${escHtml(x.rule.code)}: ${escHtml(x.rule.source)} ${escHtml(CR_RELATIONS[x.rule.relation])} ${escHtml(x.rule.target)}</td><td><span class="badge ${x.result === "pass" ? "badge-success" : x.result === "fail" ? (x.rule.severity === "block" ? "badge-danger" : "badge-warning") : "badge-light"}">${escHtml(x.result.replace(/_/g, " "))}</span></td><td>${escHtml(x.detail || (x.result === "fail" ? x.rule.message : ""))}</td></tr>`).join("")}</tbody></table></div>` : "";
  return fr + rf + rl;
}
function frWaiveUi(ruleId) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const why = window.prompt("Why is this stale figure accepted? (at least 10 characters; recorded with your name)", ""); if (why === null) return; const r = frWaive(sub, ruleId, why); showToast(r.ok ? "✅ Waived." : "⛔ " + (r.error === "reason" ? "Give a reason of at least 10 characters." : r.error), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function frCloseUi(id) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = frCloseRefresh(sub, id, ""); showToast(r.ok ? "✅ Closed." : "⛔ " + (r.error === "still_stale" ? "The figure on the case is still stale: record the refreshed one first." : r.error), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }

(function frInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.freshness_blocked = m("Blocked — Stale Data", "ph-hourglass", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.freshness_waived = m("Stale Data Waived", "ph-seal-warning", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.freshness_refreshed = m("Data Refreshed", "ph-arrows-clockwise", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.coverage_relationship_blocked = m("Quote Blocked — Coverage Relationship", "ph-prohibit", "badge-danger", "outcome-decline");
  }
  if (typeof registerGuard === "function") {
    registerGuard("issueQuote", "data freshness", frGuard("quote"));
    registerGuard("bind", "data freshness", frGuard("bind"));
    registerGuard("issueQuote", "coverage relationships", crGuard);
  }
})();
ucRegisterTab("freshness", "Data freshness", "ph-hourglass", frHtml, () => FR.rules.filter(r => r.status === "pending").length);
ucRegisterTab("relationships", "Coverage relationships", "ph-link", crHtml, () => FR.rels.filter(r => r.status === "pending").length);
if (typeof urRegisterSection === "function") urRegisterSection("freshness", "Data freshness and coverage relationships", frCaseHtml);
