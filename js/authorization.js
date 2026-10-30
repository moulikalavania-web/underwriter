/**
 * ============================================================================
 * AUTHORIZATION: PERMISSION CATALOGUE, VERSIONED POLICY, ATTRIBUTE SCOPE, DECISIONS IN THE AUDIT
 * ----------------------------------------------------------------------------
 * Access was a table of what each role may do (hasPermission) and nothing said which rule allowed an action, on which version of the
 * rules, or whether where the person works and on what mattered. The audit log named the person and the action, not why it was allowed.
 *
 *   PERMISSION CATALOGUE  every action a role can hold, as a code (APPETITE_RULES.OVERRIDE), with the bit it was given the day it was
 *                         added. A bit is never reused, so a permission removed from the application cannot come back as a different one.
 *   POLICY BUNDLE         the rules that decide: role-based (the role holds the permission) and attribute-based (the record is within the
 *                         person's scope). A bundle is a numbered version with a content fingerprint and the source-control commit it
 *                         came from. It is drafted by one person, published by another, and the version before it is retired.
 *                         Until one is published, the built-in baseline (role permissions only) decides.
 *   ATTRIBUTE SCOPE       a role may be limited to certain lines, states, programs, tenants, named records, or to its own cases. Every kind
 *                         of scope that is set must be met (a state AND a line); within a kind, any value will do. A scope that cannot
 *                         be checked (the state of a case is unknown) denies.
 *   DECISION              each check of a sensitive action is kept with an id, who, what, which record, allow or deny, the reasons and
 *                         the policy version in force. A refusal by scope is also written to the case's log.
 *   AUDIT                 an audit entry for a sensitive action now shows the decision that allowed it and its policy version; one with
 *                         no decision found is counted, so a path that skipped the check can be seen.
 *
 * This is the decision point of the prototype. A production build runs the same bundle in the policy engine the architecture names and
 * keeps decisions in the monitoring store. A decision is linked to its audit entry by who, what, which case and when, not carried through
 * every call, so the link is as good as that match.
 * ============================================================================
 */

const AZ_KEY = "FUT_AUTHZ_V1";
const AZ_SCOPE_TYPES = ["lob", "state", "program", "tenant", "record", "own"];
const AZ_RECORDED_ACTIONS = ["approve", "override"];
const AZ_RECORDED_PAIRS = ["premiumAdjustment.edit", "completeness.edit", "authority.edit", "policyChanges.edit", "subjectivities.edit"];
/** Audit entry types that are sensitive actions, and the permission each one needs. */
const AZ_SENSITIVE_AUDIT = {
  discretionary_credit: "PREMIUM_ADJUSTMENT.EDIT", discretionary_debit: "PREMIUM_ADJUSTMENT.EDIT", uw_override_applied: "APPETITE_RULES.OVERRIDE", auth_referral_approved: "AUTHORITY.APPROVE",
  auth_referral_closed: "AUTHORITY.APPROVE", data_waived: "COMPLETENESS.APPROVE", data_resolved: "COMPLETENESS.EDIT", endorsement_issued: "POLICY_CHANGES.APPROVE", cancellation_scheduled: "POLICY_CHANGES.APPROVE", coverage_rejected: "COMPLETENESS.EDIT"
};
const AZ_BASELINE = { id: "POL-0", bundleName: "baseline-rbac", version: "0", gitCommit: null, status: "builtin", rules: [{ id: "R-RBAC", type: "rbac" }], scopes: [] };

function azEmpty() { return { versions: [], draft: null, decisions: [], bits: {}, nextBit: 0, history: [], seq: 0 }; }
var AZ = azEmpty();
function azEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function azNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function azToday() { return new Date().toISOString().slice(0, 10); }
function azClone(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }
function azStable(v) { if (Array.isArray(v)) return "[" + v.map(azStable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + azStable(v[k])).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }
function azHash(v) { const s = azStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) + ":" + s.length; }
function azName(role) { const r = typeof USER_ROLES_CONFIG !== "undefined" ? USER_ROLES_CONFIG[role] : null; return r ? r.name : String(role); }
function azActor(role) { const r = USER_ROLES_CONFIG[role || currentUserRole]; return r ? r.name + " (" + r.title + ")" : String(role || currentUserRole); }
function azSave() { try { localStorage.setItem(AZ_KEY, JSON.stringify(AZ)); } catch (e) { /* storage unavailable: kept for this session */ } }
(function azLoad() { try { const raw = localStorage.getItem(AZ_KEY); if (raw) { const st = JSON.parse(raw); if (st && st.versions) AZ = Object.assign(azEmpty(), st); } } catch (e) { /* damaged store ignored */ } })();
/** Forgets the policy versions, the draft and the decisions. The permission bits are kept: they are never reused. */
function azReset() { const bits = AZ.bits, next = AZ.nextBit; AZ = azEmpty(); AZ.bits = bits; AZ.nextBit = next; try { localStorage.removeItem(AZ_KEY); } catch (e) { /* nothing stored */ } }
function azHist(action, text) { AZ.history.push({ at: azNow(), by: azActor(), action: action, text: text }); if (AZ.history.length > 100) AZ.history = AZ.history.slice(-100); }

// ----------------------------------------------------------------------------
// 1. THE PERMISSION CATALOGUE
// ----------------------------------------------------------------------------
function azSnake(key) { return String(key).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase(); }
function azPermCode(resource, action) { return azSnake(resource) + "." + String(action).toUpperCase(); }
/** Every permission the application knows, with the bit it was given. A new one takes the next bit; a bit is never reused. */
function azCatalogue() {
  const out = [];
  RBAC_RESOURCES.forEach(r => RBAC_ACTIONS.forEach(a => {
    const code = azPermCode(r.key, a);
    if (AZ.bits[code] === undefined) { AZ.bits[code] = AZ.nextBit++; }
    out.push({ code: code, resource: r.key, action: a, label: r.label, bit: AZ.bits[code], isSystem: true, status: "active" });
  }));
  return out;
}
/** The roles, each with the permission codes it holds right now. */
function azRoles() {
  return Object.keys(PERMISSIONS_MATRIX).map(role => ({ roleCode: role, name: azName(role), title: (USER_ROLES_CONFIG[role] || {}).title || role, permissions: RBAC_RESOURCES.reduce((acc, r) => acc.concat(RBAC_ACTIONS.filter(a => PERMISSIONS_MATRIX[role][r.key] && PERMISSIONS_MATRIX[role][r.key][a]).map(a => azPermCode(r.key, a))), []) }));
}
function azRoleHolds(role, code) { const r = azRoles().find(x => x.roleCode === role); return !!r && r.permissions.indexOf(code) > -1; }

// ----------------------------------------------------------------------------
// 2. POLICY BUNDLES: DRAFT, PUBLISH, VERSION
// ----------------------------------------------------------------------------
function azPublished() { return AZ.versions.filter(v => v.status === "published"); }
/** The policy that decides on a date: the published version in force, else the built-in baseline. */
function azCurrentPolicy(date) { const d = date || azToday(); return azPublished().filter(v => (!v.effectiveFrom || v.effectiveFrom <= d)).slice(-1)[0] || AZ_BASELINE; }
function azVerifyVersion(v) { return !!v && azHash({ rules: v.rules, scopes: v.scopes, catalogue: v.catalogueCodes }) === v.contentHash; }

/** Everything wrong with a policy content, as sentences. [] means it can be drafted. */
function azValidate(c) {
  const e = [], ymd = /^\d{4}-\d{2}-\d{2}$/, ids = {};
  if (!c || !Array.isArray(c.rules) || !c.rules.some(r => r.type === "rbac")) e.push("The policy needs the role-based rule (type rbac).");
  (c && c.rules || []).forEach(r => {
    if (["rbac", "abac"].indexOf(r.type) === -1) e.push("Rule " + (r.id || "?") + ": the type is rbac or abac.");
    if (r.type === "abac") {
      if (!Array.isArray(r.enforceActions) || !r.enforceActions.length || r.enforceActions.some(a => RBAC_ACTIONS.indexOf(a) === -1)) e.push("Rule " + (r.id || "?") + ": enforceActions lists some of " + RBAC_ACTIONS.join(", ") + ".");
    }
  });
  (c && c.scopes || []).forEach(s => {
    const w = "Scope " + (s.id || "?");
    if (!s.id) e.push("A scope has no id."); else if (ids[s.id]) e.push(w + ": the id is used twice."); ids[s.id] = true;
    if (s.subjectType !== "role") e.push(w + ": the subject is a role.");
    if (!USER_ROLES_CONFIG[s.subjectRef] && !(typeof EXTERNAL_ROLES !== "undefined" && EXTERNAL_ROLES[s.subjectRef])) e.push(w + ": " + s.subjectRef + " is not a role.");
    if (AZ_SCOPE_TYPES.indexOf(s.scopeType) === -1) e.push(w + ": the scope type is one of " + AZ_SCOPE_TYPES.join(", ") + ".");
    if (s.scopeType !== "own" && (!Array.isArray(s.values) || !s.values.length)) e.push(w + ": list the values the scope allows.");
    if (s.from && !ymd.test(s.from)) e.push(w + ": the start date is yyyy-mm-dd."); if (s.to && !ymd.test(s.to)) e.push(w + ": the end date is yyyy-mm-dd or empty."); if (s.from && s.to && s.to < s.from) e.push(w + ": it ends before it starts.");
  });
  return e;
}
/** Saves the draft policy. Needs the permission to edit review rules. Nothing decides on a draft. */
function azDraftSave(content, note) {
  if (!hasPermission("reviewRules", "edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const c = azClone(content), errs = azValidate(c); if (errs.length) return { ok: false, error: "invalid", errors: errs };
  AZ.draft = { content: c, note: String(note || "").trim(), draftedBy: azActor(), draftedByKey: azName(currentUserRole), draftedAt: azNow() };
  azHist("drafted", "Drafted a policy with " + c.scopes.length + " scope(s)."); azSave();
  return { ok: true };
}
/** A different person, the one who records access reviews, publishes the draft as the next version, tied to the commit it came from. */
function azPublish(o) {
  o = o || {}; const d = AZ.draft;
  if (!hasPermission("accessReview", "approve")) { denyPermission("accessReview", "approve"); return { ok: false, error: "permission" }; }
  if (!d) return { ok: false, error: "none" };
  if (d.draftedByKey === azName(currentUserRole)) return { ok: false, error: "self" };
  if (!/^\d+\.\d+\.\d+$/.test(String(o.version || ""))) return { ok: false, error: "version" };
  if (!/^[0-9a-f]{7,40}$/i.test(String(o.gitCommit || ""))) return { ok: false, error: "commit" };
  if (AZ.versions.some(v => v.bundleName === (o.bundleName || "underwriting-access") && v.version === o.version)) return { ok: false, error: "exists" };
  const errs = azValidate(d.content); if (errs.length) return { ok: false, error: "invalid", errors: errs };
  const codes = azCatalogue().map(p => p.code);
  const rec = { id: "POL-" + (AZ.versions.length + 1), bundleName: o.bundleName || "underwriting-access", version: o.version, gitCommit: String(o.gitCommit).toLowerCase(), status: "published", effectiveFrom: azToday(), effectiveTo: null, rules: d.content.rules, scopes: d.content.scopes, catalogueCodes: codes, contentHash: "", publishedBy: azActor(), publishedAt: azNow(), draftedBy: d.draftedBy };
  rec.contentHash = azHash({ rules: rec.rules, scopes: rec.scopes, catalogue: rec.catalogueCodes });
  AZ.versions.filter(v => v.status === "published").forEach(v => { v.status = "retired"; v.effectiveTo = azToday(); });
  AZ.versions.push(rec); AZ.draft = null;
  azHist("published", rec.id + " " + rec.bundleName + " " + rec.version + " (commit " + rec.gitCommit + ") published; the earlier version retired."); azSave();
  return { ok: true, version: rec };
}
function azDiscardDraft() { AZ.draft = null; azSave(); return { ok: true }; }

// ----------------------------------------------------------------------------
// 3. SCOPE AND THE DECISION
// ----------------------------------------------------------------------------
function azRosterScopes(role) {
  const u = typeof TEAM_USERS !== "undefined" ? TEAM_USERS.find(x => x.roleKey === role) : null; if (!u) return [];
  const out = [];
  if (Array.isArray(u.states) && u.states.length) out.push({ id: "ROSTER-STATES", scopeType: "state", values: u.states.slice() });
  if (Array.isArray(u.lobs) && u.lobs.length) out.push({ id: "ROSTER-LOBS", scopeType: "lob", values: u.lobs.slice() });
  return out;
}
function azFacts(sub) {
  return { lob: sub.lobKey || null, state: typeof deriveRiskState === "function" ? deriveRiskState(sub) : null, program: sub.program || null, tenant: typeof ddOwner === "function" ? ddOwner(sub) : (sub.tenantId || null), record: sub.id, assignee: sub.assignedTo || null };
}
/** Is the record inside every scope the role has? { ok, reasons, scopes } Pure: reads the case and the policy. */
function azCheckScope(role, sub, policy, date) {
  const d = date || azToday(), rule = (policy.rules || []).find(r => r.type === "abac");
  if (!rule || !sub) return { ok: true, reasons: [], scopes: [] };
  let scopes = (policy.scopes || []).filter(s => s.subjectRef === role && (!s.from || s.from <= d) && (!s.to || d <= s.to) && s.status !== "retired");
  if (rule.useRoster) scopes = scopes.concat(azRosterScopes(role));
  if (!scopes.length) return { ok: true, reasons: [], scopes: [] };
  const f = azFacts(sub), reasons = [], byType = {};
  scopes.forEach(s => { (byType[s.scopeType] = byType[s.scopeType] || []).push(s); });
  Object.keys(byType).forEach(t => {
    const rows = byType[t];
    if (t === "own") { if (f.assignee !== role) reasons.push("The case is " + (f.assignee ? "assigned to " + azName(f.assignee) : "not assigned") + ", and " + azName(role) + " works only on their own cases."); return; }
    const val = t === "lob" ? f.lob : t === "state" ? f.state : t === "program" ? f.program : t === "tenant" ? f.tenant : f.record;
    const allowed = rows.reduce((a, s) => a.concat(s.values || []), []);
    if (val === null || val === undefined || val === "") reasons.push("The " + t + " of the case is not known, so the " + t + " scope cannot be met.");
    else if (allowed.indexOf(val) === -1) reasons.push("The case's " + t + " is " + val + ", outside " + azName(role) + "'s " + t + " scope (" + allowed.join(", ") + ").");
  });
  return { ok: reasons.length === 0, reasons: reasons, scopes: scopes.map(s => s.id) };
}

/** Decides one action by one role on one record, against the policy in force. Pure apart from keeping the decision when asked. */
function azDecide(role, resource, action, sub, opts) {
  opts = opts || {};
  const policy = azCurrentPolicy(), code = azPermCode(resource, action);
  const granted = !!(PERMISSIONS_MATRIX[role] && PERMISSIONS_MATRIX[role][resource] && PERMISSIONS_MATRIX[role][resource][action]);
  const reasons = [], matched = ["R-RBAC"];
  let allow = granted; if (!granted) reasons.push(azName(role) + " does not hold " + code + ".");
  const abac = (policy.rules || []).find(r => r.type === "abac");
  let scopes = [];
  if (granted && abac && abac.enforceActions.indexOf(action) > -1 && sub) {
    const sc = azCheckScope(role, sub, policy, opts.date); scopes = sc.scopes;
    if (scopes.length) matched.push(abac.id || "R-ABAC");
    if (!sc.ok) { allow = false; sc.reasons.forEach(r => reasons.push(r)); }
  }
  const dec = { id: null, at: new Date().toISOString(), role: role, actorName: azName(role), actor: azActor(role), permission: code, resource: resource, action: action, subId: sub ? sub.id : null, allow: allow, reasons: reasons, matched: matched, scopes: scopes, policyVersionId: policy.id, policyVersion: policy.version, policyBundle: policy.bundleName, count: 1 };
  return dec;
}
/** Keeps a decision. The same person, permission, record and result within a minute is the same decision, counted again. */
function azKeep(dec) {
  const prev = AZ.decisions.slice().reverse().find(x => x.role === dec.role && x.permission === dec.permission && x.subId === dec.subId && x.allow === dec.allow && x.policyVersionId === dec.policyVersionId && Date.parse(dec.at) - Date.parse(x.at) < 60000);
  if (prev) { prev.count++; prev.at = dec.at; return prev; }
  dec.id = "DEC-" + (++AZ.seq); AZ.decisions.push(dec); if (AZ.decisions.length > 400) AZ.decisions = AZ.decisions.slice(-400);
  return dec;
}

// the permission check every screen already makes now goes through the decision point for sensitive actions
var _azOrigHas = window.hasPermission;
window.hasPermission = function (resource, action) {
  const base = _azOrigHas.apply(this, arguments);
  const sensitive = AZ_RECORDED_ACTIONS.indexOf(action) > -1 || AZ_RECORDED_PAIRS.indexOf(resource + "." + action) > -1;
  const policy = azCurrentPolicy(), abac = (policy.rules || []).find(r => r.type === "abac");
  const scoped = !!(abac && abac.enforceActions.indexOf(action) > -1);
  if (!sensitive && !scoped) return base;
  const sub = typeof activeSubmissionId !== "undefined" ? SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) : null;
  if (!sub) return base;
  const dec = azDecide(currentUserRole, resource, action, sub);
  if (sensitive && sub && (base || dec.reasons.length)) {
    const kept = azKeep(dec);
    if (base && !dec.allow && kept.count === 1) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 9, decision: "authz_denied", by: azActor(), at: azNow(), notes: dec.permission + " denied by " + dec.policyVersionId + " (" + kept.id + "): " + dec.reasons.join(" "), authzDecisionId: kept.id }); }
  }
  return base && dec.allow;
};

// ----------------------------------------------------------------------------
// 4. THE AUDIT LOG SHOWS THE DECISION
// ----------------------------------------------------------------------------
function azMs(at) { const t = Date.parse(String(at || "").replace(" ", "T") + ":00Z"); return isNaN(t) ? null : t; }
/** The decision that allowed an audit entry: the same person, permission and case, the latest before it and within ten minutes. */
function azLinkDecision(entry) {
  const code = AZ_SENSITIVE_AUDIT[entry.type]; if (!code) return { sensitive: false };
  const at = azMs(entry.at);
  const cands = AZ.decisions.filter(d => d.permission === code && d.subId === entry.subId && d.allow && entry.by && String(entry.by).indexOf(d.actorName) > -1 && at !== null && Date.parse(d.at) - 60000 <= at && at - Date.parse(d.at) <= 10 * 60000 + 60000);
  const d = cands.slice(-1)[0];
  return { sensitive: true, permission: code, decision: d || null };
}
var _azOrigCollect = window.collectAuditLogEntries;
window.collectAuditLogEntries = function () {
  const entries = _azOrigCollect.apply(this, arguments);
  entries.forEach(e => {
    if (e.type === "authz_denied") { const m = /\((DEC-\d+)\)/.exec(e.note || ""); const d = m ? AZ.decisions.find(x => x.id === m[1]) : null; e.authorization = d ? { decisionId: d.id, policyVersionId: d.policyVersionId, result: "deny" } : null; e.sensitive = true; return; }
    const l = azLinkDecision(e); if (!l.sensitive) return;
    e.sensitive = true; e.authorization = l.decision ? { decisionId: l.decision.id, policyVersionId: l.decision.policyVersionId, policyVersion: l.decision.policyVersion, result: "allow" } : null;
  });
  return entries;
};
/** Sensitive audit entries, and how many have no decision behind them. */
function azAuditGaps(entries) { const list = (entries || window.collectAuditLogEntries()).filter(e => e.sensitive); return { sensitive: list.length, withDecision: list.filter(e => e.authorization).length, withoutDecision: list.filter(e => !e.authorization).length }; }

// ----------------------------------------------------------------------------
// 5. SCREEN: A TAB IN QUOTE INTELLIGENCE
// ----------------------------------------------------------------------------
var AZ_UI = { search: "" };
function azUiV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function azUiToast(r, ok) {
  if (r.ok) { if (ok) showToast(ok, "success"); return; }
  const m = { invalid: (r.errors || [])[0], self: "You drafted this; a different person publishes it.", none: "There is no draft.", version: "The version is three numbers, like 1.2.0.", commit: "Give the source-control commit (7 to 40 hex characters).", exists: "That version already exists." };
  if (m[r.error]) showToast(m[r.error], "warning");
}
function azUiDraft() { let c; try { c = JSON.parse(azUiV("az_json")); } catch (e) { showToast("That is not valid JSON.", "danger"); return; } azUiToast(azDraftSave(c, azUiV("az_note")), "Draft saved. Nothing decides on it until it is published."); renderAccessControl(); }
function azUiPublish() { azUiToast(azPublish({ version: azUiV("az_ver"), gitCommit: azUiV("az_commit"), bundleName: azUiV("az_bundle") || "underwriting-access" }), "Policy published."); renderAccessControl(); }
function azUiDiscard() { azDiscardDraft(); renderAccessControl(); }
function azUiSearch() { AZ_UI.search = azUiV("az_search").toLowerCase(); renderAccessControl(); }

function renderAccessControl() {
  const box = document.getElementById("accessControlRoot"); if (!box) return;
  const cat = azCatalogue(), roles = azRoles(), pol = azCurrentPolicy(), canDraft = hasPermission("reviewRules", "edit"), canPub = hasPermission("accessReview", "approve");
  const gaps = azAuditGaps();
  const q = AZ_UI.search, shown = cat.filter(p => !q || p.code.toLowerCase().indexOf(q) > -1 || String(p.label).toLowerCase().indexOf(q) > -1);
  let h = `<div class="card"><div class="card-header"><h3><i class="ph ph-shield-check"></i> Access control: permissions, policy versions and decisions</h3><span class="badge ${pol.id === "POL-0" ? "badge-light" : "badge-success"}">In force: ${azEsc(pol.id)} ${azEsc(pol.bundleName)} ${azEsc(pol.version)}</span></div><div class="card-body">
    <p class="ws-small text-muted" style="margin:0 0 8px;">Role permissions decide what a role may do. A published policy can also limit a role to certain lines, states, programs or its own cases. Each check of a sensitive action is kept as a decision with the policy version that made it, and the audit log shows it. Until a policy is published, the built-in baseline (role permissions only) decides.</p>
    <div class="ws-small" style="margin-bottom:8px;"><strong>${gaps.withDecision}</strong> of <strong>${gaps.sensitive}</strong> sensitive audit entries show the decision that allowed them${gaps.withoutDecision ? `; <strong class="text-danger">${gaps.withoutDecision}</strong> have none recorded` : ""}. ${AZ.decisions.length} decision(s) kept.</div>`;
  h += `<div class="uwp-subsection-title">Policy versions</div>${AZ.versions.length ? `<table class="data-table"><thead><tr><th>Version</th><th>Bundle</th><th>Commit</th><th>In force</th><th>Content</th><th>Published by</th><th>Status</th></tr></thead><tbody>${AZ.versions.slice().reverse().map(v => `<tr><td><strong>${azEsc(v.id)}</strong> ${azEsc(v.version)}</td><td>${azEsc(v.bundleName)}<div class="text-xs text-muted">${v.scopes.length} scope(s), ${v.rules.length} rule(s)</div></td><td class="font-mono ws-small">${azEsc(v.gitCommit)}</td><td class="ws-small">${azEsc(v.effectiveFrom)} to ${azEsc(v.effectiveTo || "open")}</td><td class="font-mono ws-small">${azEsc(v.contentHash.split(":")[0])} ${azVerifyVersion(v) ? "intact" : '<span class="text-danger">ALTERED</span>'}</td><td class="ws-small">${azEsc(v.publishedBy)}<div class="text-xs text-muted">drafted by ${azEsc(v.draftedBy)}, ${azEsc(v.publishedAt)}</div></td><td><span class="badge ${v.status === "published" ? "badge-success" : "badge-light"}">${azEsc(v.status)}</span></td></tr>`).join("")}</tbody></table>` : '<p class="ws-small text-muted">No policy has been published; the baseline decides.</p>'}`;
  if (AZ.draft) h += `<div class="alert alert-warning ws-small" style="margin:8px 0;"><strong>Draft waiting</strong> by ${azEsc(AZ.draft.draftedBy)} on ${azEsc(AZ.draft.draftedAt)}: ${AZ.draft.content.scopes.length} scope(s). ${canPub && AZ.draft.draftedByKey !== azName(currentUserRole) ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><input id="az_bundle" class="form-control form-control-sm" style="width:170px;" value="underwriting-access"><input id="az_ver" class="form-control form-control-sm" style="width:100px;" placeholder="Version 1.0.0"><input id="az_commit" class="form-control form-control-sm" style="width:170px;" placeholder="Commit (hex)"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="azUiPublish()">Publish</button></div>` : '<span class="text-muted">A different person who records access reviews publishes it.</span>'} <button class="btn btn-xs btn-outline" style="width:auto;" onclick="azUiDiscard()">Discard</button></div>`;
  if (canDraft) h += `<details style="margin-top:6px;"><summary class="ws-small">Draft a policy (JSON)</summary><textarea id="az_json" class="form-control" rows="5" placeholder='{"rules":[{"id":"R-RBAC","type":"rbac"},{"id":"R-ABAC","type":"abac","enforceActions":["approve","override"],"useRoster":false}],"scopes":[{"id":"SC-1","subjectType":"role","subjectRef":"junior","scopeType":"state","values":["TX"]}]}'></textarea><div style="display:flex;gap:6px;margin-top:4px;"><input id="az_note" class="form-control form-control-sm" style="width:260px;" placeholder="Note"><button class="btn btn-sm btn-warning" style="width:auto;" onclick="azUiDraft()">Save the draft</button></div></details>`;
  if (pol.scopes && pol.scopes.length) h += `<div class="uwp-subsection-title" style="margin-top:12px;">Scopes in force</div><table class="data-table"><thead><tr><th>Scope</th><th>Role</th><th>Limited to</th><th>Period</th></tr></thead><tbody>${pol.scopes.map(s => `<tr><td>${azEsc(s.id)}</td><td>${azEsc(azName(s.subjectRef))}</td><td>${azEsc(s.scopeType)}${s.values ? ": " + azEsc(s.values.join(", ")) : ""}</td><td class="ws-small">${azEsc(s.from || "-")} to ${azEsc(s.to || "open")}</td></tr>`).join("")}</tbody></table>`;
  h += `<div class="uwp-subsection-title" style="margin-top:12px;">Roles</div><table class="data-table"><thead><tr><th>Role</th><th>Permissions held</th></tr></thead><tbody>${roles.map(r => `<tr><td>${azEsc(r.name)}<div class="text-xs text-muted">${azEsc(r.roleCode)}, ${azEsc(r.title)}</div></td><td>${r.permissions.length} of ${cat.length}</td></tr>`).join("")}</tbody></table>`;
  h += `<div class="uwp-subsection-title" style="margin-top:12px;">Permission catalogue (${cat.length})</div><input id="az_search" class="form-control form-control-sm" style="width:260px;margin-bottom:4px;" placeholder="Search a permission" value="${azEsc(AZ_UI.search)}" oninput="azUiSearch()"><div style="max-height:260px;overflow:auto;"><table class="data-table"><thead><tr><th>Code</th><th>Bit</th><th>Resource</th></tr></thead><tbody>${shown.map(p => `<tr><td class="font-mono ws-small">${azEsc(p.code)}</td><td>${p.bit}</td><td class="ws-small">${azEsc(p.label)}</td></tr>`).join("")}</tbody></table></div>`;
  h += `<div class="uwp-subsection-title" style="margin-top:12px;">Recent decisions</div>${AZ.decisions.length ? `<table class="data-table"><thead><tr><th>Decision</th><th>Who</th><th>Permission</th><th>Case</th><th>Result</th><th>Policy</th></tr></thead><tbody>${AZ.decisions.slice(-15).reverse().map(d => `<tr><td>${azEsc(d.id)}${d.count > 1 ? ` <span class="text-xs text-muted">x${d.count}</span>` : ""}<div class="text-xs text-muted">${azEsc(d.at.slice(0, 16).replace("T", " "))}</div></td><td class="ws-small">${azEsc(d.actor)}</td><td class="font-mono ws-small">${azEsc(d.permission)}</td><td>${azEsc(d.subId || "-")}</td><td><span class="badge ${d.allow ? "badge-success" : "badge-danger"}">${d.allow ? "Allow" : "Deny"}</span>${d.reasons.length ? `<div class="text-xs text-muted">${azEsc(d.reasons[0])}</div>` : ""}</td><td class="ws-small">${azEsc(d.policyVersionId)}</td></tr>`).join("")}</tbody></table>` : '<p class="ws-small text-muted">No sensitive action has been checked yet.</p>'}`;
  if (AZ.history.length) h += `<div class="text-xs text-muted" style="margin-top:8px;">History: ${AZ.history.slice(-3).reverse().map(x => azEsc(x.at + " " + x.text)).join("; ")}</div>`;
  box.innerHTML = h + "</div></div>";
}

(function installAccessTab() {
  const origSwitch = window.switchQuoteIntelTab; if (typeof origSwitch !== "function") return;
  window.switchQuoteIntelTab = function (tab) {
    const panel = document.getElementById("qiPanelAccess"), tb = document.getElementById("qiTabAccess");
    if (tab === "access") {
      origSwitch.call(this, "renewal"); quoteIntelActiveTab = "access";
      document.querySelectorAll('[id^="qiPanel"]').forEach(e => { e.style.display = "none"; }); document.querySelectorAll('[id^="qiTab"]').forEach(e => { e.classList.remove("active"); });
      if (tb) tb.classList.add("active"); if (panel) panel.style.display = "block"; renderAccessControl(); return;
    }
    const r = origSwitch.apply(this, arguments); if (panel) panel.style.display = "none"; if (tb) tb.classList.remove("active"); return r;
  };
})();

(function installAzAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  AUDIT_ACTION_META.authz_denied = { label: "Refused by the Access Policy", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
})();

Object.assign(window, { azCatalogue, azRoles, azRoleHolds, azPermCode, azValidate, azDraftSave, azPublish, azDiscardDraft, azCurrentPolicy, azVerifyVersion, azCheckScope, azDecide, azKeep, azLinkDecision, azAuditGaps, azReset, azUiDraft, azUiPublish, azUiDiscard, azUiSearch, renderAccessControl });
