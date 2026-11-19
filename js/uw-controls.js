/**
 * ============================================================================
 * UW CONTROLS: ONE PAGE FOR THE REGISTERS THE UNDERWRITING RULES RUN ON
 * ----------------------------------------------------------------------------
 * Rule sets, pricing adjustment rules, approval chains, compliance requirements, data freshness rules, coverage relationship
 * rules, accumulation limits, queue and SLA policies, screening settings and record shares are all configuration that someone must
 * be able to read and, with the right, change. Each module registers its own tab here with ucRegisterTab(); this file only draws the
 * page and the tab strip. Every register ships EMPTY: no carrier rule, limit or rate is built in.
 *
 * Reading is open to the internal roles; each tab decides who may change what. A change to a register that governs a decision is a
 * proposal approved by a different person (the same rule the authority levels follow).
 * ============================================================================
 */

var UC_TABS = [];
var UC = { tab: null };

/** Adds a tab. html is a function that returns the tab's markup; count (optional) returns the number to show beside the label. */
function ucRegisterTab(key, label, icon, html, count) {
  UC_TABS = UC_TABS.filter(t => t.key !== key);
  UC_TABS.push({ key: key, label: label, icon: icon, html: html, count: count || null });
}
/** Who is acting, as the records name them. */
function ucActor() { return typeof actorLabel === "function" ? actorLabel() : String(currentUserRole); }
function ucV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function ucList(v) { return v === "*" || v === "" ? "*" : String(v).split(",").map(x => x.trim()).filter(Boolean); }
function ucListText(v) { return v === "*" || !v ? "all" : Array.isArray(v) ? v.join(", ") : String(v); }
function ucScopeHas(spec, v) { return spec === "*" || !spec || (Array.isArray(spec) ? spec.indexOf(v) > -1 : String(spec) === String(v)); }
function ucCan(action) { return hasPermission("reviewRules", action || "edit"); }
/** True when the date window [from, to] holds the day. Empty ends are open. */
function ucInForce(from, to, day) { const d = day || todayIso(); return (!from || from <= d) && (!to || to >= d); }

function showUcPage() {
  currentPage = "uwcontrols";
  resetAllTopLevelPages();
  setPageTitle("UW Controls");
  setBreadcrumb([{ label: "FUT", onClick: "showIntakePage()" }, { label: "UW Controls" }]);
  const page = document.getElementById("ucPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }
  const nav = document.getElementById("navItemUc"); if (nav) nav.classList.add("active");
  const footer = document.getElementById("workflowBottomFooter"); if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");
  ucRender();
}
function ucTab(k) { UC.tab = k; ucRender(); }
function ucRender() {
  const root = document.getElementById("ucRoot"); if (!root) return;
  if (!UC_TABS.some(t => t.key === UC.tab)) UC.tab = UC_TABS.length ? UC_TABS[0].key : null;
  const cur = UC_TABS.find(t => t.key === UC.tab);
  let body = "";
  try { body = cur ? cur.html() : '<div class="mw-empty">Nothing is registered.</div>'; } catch (e) { body = '<div class="alert alert-danger">This tab could not be drawn: ' + escHtml(e.message) + "</div>"; }
  root.innerHTML = `<div class="p1-head"><div><h2 class="p1-h" style="margin:0;">UW Controls</h2><div class="p1-sub" style="margin:0;">The registers the underwriting rules, approvals and checks run on. Each starts empty; nothing is built in.</div></div></div>
    <div class="mw-tabs">${UC_TABS.map(t => { const n = t.count ? t.count() : 0; return `<button class="tab-btn${UC.tab === t.key ? " active" : ""}" onclick="ucTab('${t.key}')"><i class="ph ${t.icon}"></i> ${escHtml(t.label)}${n ? ` <span class="badge badge-light">${n}</span>` : ""}</button>`; }).join("")}</div>${body}`;
}

// ----------------------------------------------------------------------------
// MAKER AND CHECKER FOR A VERSIONED REGISTER
// ----------------------------------------------------------------------------
/**
 * A register record {id, code, version, status} moves draft -> pending -> active -> retired. One person proposes it and a DIFFERENT person with
 * the right puts it in force; a version in force is never edited, a change is a new version, and bringing it in force retires the old one.
 * Each function returns { ok } or { ok: false, error } (permission, state, self, reason, open).
 */
var UC_MIN_REASON = 10;
function ucProposeRec(rec) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  if (!rec || rec.status !== "draft") return { ok: false, error: "state" };
  rec.status = "pending"; rec.submittedBy = ucActor(); rec.submittedAt = nowStamp();
  return { ok: true };
}
function ucActivateRec(list, rec) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  if (!rec || rec.status !== "pending") return { ok: false, error: "state" };
  if (rec.submittedBy === ucActor()) return { ok: false, error: "self" };
  list.filter(x => x.code === rec.code && x.id !== rec.id && x.status === "active").forEach(o => { o.status = "retired"; o.retiredAt = nowStamp(); o.retiredBy = ucActor(); o.supersededBy = rec.id; });
  rec.status = "active"; rec.approvedBy = ucActor(); rec.approvedAt = nowStamp();
  return { ok: true };
}
function ucSendBackRec(rec, reason) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  if (!rec || rec.status !== "pending") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < UC_MIN_REASON) return { ok: false, error: "reason" };
  rec.status = "draft"; rec.rejectedBy = ucActor(); rec.rejectedReason = String(reason).trim(); delete rec.submittedBy;
  return { ok: true };
}
function ucRetireRec(rec, reason) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  if (!rec || rec.status !== "active") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < UC_MIN_REASON) return { ok: false, error: "reason" };
  rec.status = "retired"; rec.retiredAt = nowStamp(); rec.retiredBy = ucActor(); rec.retiredReason = String(reason).trim();
  return { ok: true };
}
/** The next version as a draft copy. newId is the new record's id; fix(copy) may renumber anything inside it. */
function ucNextVersionRec(list, rec, newId, fix) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  if (!rec || rec.status === "draft" || rec.status === "pending") return { ok: false, error: "state" };
  if (list.some(x => x.code === rec.code && (x.status === "draft" || x.status === "pending"))) return { ok: false, error: "open" };
  const top = Math.max.apply(null, list.filter(x => x.code === rec.code).map(x => x.version));
  const n = JSON.parse(JSON.stringify(rec));
  Object.assign(n, { id: newId, version: top + 1, status: "draft", createdBy: ucActor(), createdAt: nowStamp(), supersedes: rec.id });
  ["approvedBy", "approvedAt", "submittedBy", "submittedAt", "retiredAt", "retiredBy", "supersededBy", "rejectedBy", "rejectedReason", "retiredReason"].forEach(k => delete n[k]);
  if (fix) fix(n);
  list.push(n);
  return { ok: true, rec: n };
}
function ucStatusBadge(s) { return { draft: '<span class="badge badge-light">Draft</span>', pending: '<span class="badge badge-warning">Awaiting approval</span>', active: '<span class="badge badge-success">In force</span>', retired: '<span class="badge badge-light">Retired</span>' }[s] || ""; }
/** The buttons for a record's state. act(id, what) is the module's handler name, called as <act>('id','submit'|'approve'|'reject'|'newver'|'retire'). */
function ucActionsHtml(act, rec) {
  if (!ucCan("edit")) return "";
  const b = (what, label, cls) => `<button class="btn btn-xs ${cls || "btn-outline"}" onclick="${act}('${rec.id}','${what}')">${label}</button>`;
  return { draft: b("submit", "Send for approval"), pending: b("approve", "Put in force", "btn-primary") + " " + b("reject", "Send back"), active: b("newver", "New version") + " " + b("retire", "Retire"), retired: b("newver", "New version") }[rec.status] || "";
}
/** Shows a failure or success from the helpers above. */
function ucToast(r, okText) {
  if (r.ok) { showToast("✅ " + okText, "success"); return; }
  const m = { permission: "You do not have the right to do this.", self: "A different person must put it in force: you proposed it.", state: "That cannot be done in its present state.", locked: "Only a draft can be changed.", reason: "Give a reason of at least " + UC_MIN_REASON + " characters.", open: "A newer version is already being prepared." };
  showToast("⛔ " + (r.errors ? r.errors.join("; ") : m[r.error] || r.error), "danger");
}
/** Runs one of the generic actions; ask() collects a reason where needed. */
function ucAct(list, rec, what, newId, fix) {
  if (what === "submit") return ucProposeRec(rec);
  if (what === "approve") return ucActivateRec(list, rec);
  if (what === "reject" || what === "retire") { const why = window.prompt((what === "reject" ? "Why is it sent back?" : "Why is it retired?") + " (at least " + UC_MIN_REASON + " characters)", ""); if (why === null) return { ok: false, error: "cancelled" }; return what === "reject" ? ucSendBackRec(rec, why) : ucRetireRec(rec, why); }
  if (what === "newver") return ucNextVersionRec(list, rec, newId, fix);
  return { ok: false, error: "state" };
}
