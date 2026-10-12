/**
 * ============================================================================
 * EXTERNAL AND OVERSIGHT ROLES, PRODUCER AND PROGRAM SEGREGATION (G31)
 * ----------------------------------------------------------------------------
 * Until now every persona was an internal underwriter or the head of the department, and
 * every one of them could see every submission. Real surplus lines and MGA
 * operations also have people who are NOT employees and must never see the whole
 * book:
 *
 *   PRODUCER      a broker's own user sees only their agency's submissions. They
 *                 must not see another broker's business, who holds the market
 *                 lock, the underwriters' referral notes, authority, sanctions
 *                 screening, the surplus lines tax basis or other internal files.
 *   PROGRAM / MGA a program administrator sees only the lines (and, optionally,
 *                 states) of their program.
 *   CARRIER AUDITOR  read-only, and only for policies written on that carrier's
 *                 paper.
 *   COMPLIANCE    read-only across the whole book, plus the audit log.
 *
 * Segregation is enforced where data is read, not only where it is displayed:
 * list screens are rendered from the visible set only, opening a case that is
 * outside the user's scope is refused and logged, and the persona's permission
 * row removes every action. External personas get no approve, override or
 * archive rights anywhere.
 *
 * Limits of this prototype: personas are chosen at login with no real
 * authentication (G01), so segregation here is demonstrated in the browser. A
 * production build enforces the same scope on the server, per tenant (separate
 * tenant-level data isolation is a Phase 3 item, not built here), and external
 * users get a purpose-built portal rather than the underwriting workstation.
 * ============================================================================
 */

// scope kinds: all | agency | program | carrier
// The application ships ONE oversight user (the Compliance Officer). Producer, program-administrator and carrier-auditor
// users are not shipped: they are added with registerExternalRole() when those people are onboarded, and the test suites
// register their own (tests/fixtures/external-personas.js).
var EXTERNAL_ROLES = {
  compliance: {
    name: "Robert Okafor", title: "Compliance Officer", icon: "🧾",
    limit: 0, limitText: "Read-only · whole book · audit log", description: "Internal oversight: reads everything, changes nothing.",
    external: false, readOnly: true, scope: { kind: "all" }
  }
};

/** Adds a restricted user: scope { kind: "agency", agency } | { kind: "program", lobs, states } | { kind: "carrier", carrier } | { kind: "all" }. */
function registerExternalRole(key, def) {
  EXTERNAL_ROLES[key] = def;
  if (!USER_ROLES_CONFIG[key]) {
    USER_ROLES_CONFIG[key] = { name: def.name, title: def.title, limit: def.limit || 0, limitText: def.limitText, icon: def.icon, description: def.description, external: !!def.external, readOnly: !!def.readOnly };
  }
  if (typeof PERMISSIONS_MATRIX !== "undefined" && !PERMISSIONS_MATRIX[key]) PERMISSIONS_MATRIX[key] = extPermissionsFor(key);
  if (typeof TEAM_USERS !== "undefined" && !TEAM_USERS.some(function (u) { return u.roleKey === key; })) {
    TEAM_USERS.push({ id: "u_" + key, name: def.name, title: def.title, email: "", roleKey: key, limit: 0, description: def.description, states: [], lobs: [], coverages: [], isDefault: true });
  }
  if (typeof populateLoginUserSelect === "function") { try { populateLoginUserSelect(); } catch (e) { /* not mounted */ } }
}
window.registerExternalRole = registerExternalRole;

var EXT_VIEW_ALL = ["documents", "submissionData", "workflow", "archival", "reviewRules", "appetiteRules", "premiumAdjustment", "unifiedAccount", "auditLog", "sanctions", "producerLicensing", "tria", "notices", "completeness", "subjectivities", "binders", "policyChanges", "renewals", "brokerRelations", "surplusLines", "rateConfig", "authority", "bordereaux", "performance"];
var EXT_VIEW_PORTAL = ["documents", "submissionData", "workflow", "completeness", "subjectivities", "binders", "policyChanges", "renewals"];
// internal-only panels hidden from external users even on a submission they may open
var EXT_HIDDEN_PANELS = ["sanctionsScreeningContainer", "producerLicensingContainer", "marketClearanceContainer", "authorityContainer", "surplusLinesContainer", "noticesContainer", "commissionContainer", "triaOfferContainer"];

function extNone() { return { view: false, edit: false, approve: false, override: false, archive: false }; }
function extPermissionsFor(roleKey) {
  var r = EXTERNAL_ROLES[roleKey], p = {};
  (typeof RBAC_RESOURCES !== "undefined" ? RBAC_RESOURCES : []).forEach(function (res) { p[res.key] = extNone(); });
  if (r.external && r.scope.kind !== "carrier") {
    EXT_VIEW_PORTAL.forEach(function (k) { if (p[k]) p[k].view = true; });
    if (p.documents) p.documents.edit = true;    // a producer can add documents to their own submission
  } else {
    EXT_VIEW_ALL.forEach(function (k) { if (p[k]) p[k].view = true; });
  }
  if (r.scope.kind === "carrier" && p.auditLog) p.auditLog.view = false;
  if (roleKey === "compliance" && p.accessReview) { p.accessReview.view = true; p.accessReview.approve = true; }   // records the periodic access review   // carrier sees policies, not the company's internal log
  return p;
}

function extIsExternal(roleKey) { var r = EXTERNAL_ROLES[roleKey]; return !!(r && r.external); }
/** Users registered here (oversight and restricted users) see cases by scope, not by assignment. */
function extUsesScopeNotAssignment(roleKey) { return !!EXTERNAL_ROLES[roleKey]; }
function extIsRestricted(roleKey) { var r = EXTERNAL_ROLES[roleKey]; return !!(r && r.scope.kind !== "all"); }
function extSameAgency(a, b) {
  if (typeof comSameBroker === "function") return comSameBroker(a, b);
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

/** May this persona see this submission? Internal underwriters (not in EXTERNAL_ROLES) see all. */
function extCanSee(roleKey, sub) {
  var r = EXTERNAL_ROLES[roleKey];
  if (!r || !sub) return !r;
  var s = r.scope;
  if (s.kind === "all") return true;
  if (s.kind === "agency") return sub.channelType !== "direct" && extSameAgency(sub.broker, s.agency);
  if (s.kind === "program") {
    if (s.lobs.indexOf(sub.lobKey) === -1) return false;
    if (s.states && typeof deriveRiskState === "function") { var st = deriveRiskState(sub); return !!st && s.states.indexOf(st) > -1; }
    return true;
  }
  if (s.kind === "carrier") return (sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "")) === s.carrier;
  return false;
}
function extVisible(roleKey, dataset) { return (dataset || []).filter(function (s) { return extCanSee(roleKey, s); }); }

// ----------------------------------------------------------------------------
// 2. ENFORCEMENT
// ----------------------------------------------------------------------------
function extSub(id) { return SUBMISSIONS_DATASET.filter(function (s) { return s.id === id; })[0] || null; }
function extActorName() { var r = USER_ROLES_CONFIG[currentUserRole]; return r ? r.name + " (" + r.title + ")" : currentUserRole; }
function extLogDenied(sub, what) {
  if (!sub) return;
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 1, decision: "ext_access_denied", by: extActorName(), at: new Date().toISOString().slice(0, 16).replace("T", " "), notes: "Access attempt refused (" + what + "): the submission is outside this user's scope." });
  if (typeof persistAppState === "function") persistAppState();
}

/** Run a renderer with the dataset reduced to what the current persona may see. */
function extScoped(fn) {
  return function () {
    if (!extIsRestricted(currentUserRole)) return fn.apply(this, arguments);
    var full = SUBMISSIONS_DATASET;
    SUBMISSIONS_DATASET = extVisible(currentUserRole, full);
    try { return fn.apply(this, arguments); } finally { SUBMISSIONS_DATASET = full; }
  };
}

function extApplyPersonaUi() {
  var restricted = extIsExternal(currentUserRole);
  document.body.classList.toggle("role-external", restricted);
  var id = "extAccessStyle", st = document.getElementById(id);
  if (!st) {
    st = document.createElement("style"); st.id = id;
    st.textContent = "body.role-external #navItemDecline, body.role-external #navItemQuoteIntel, body.role-external #navItemIntegratingApi, body.role-external #navItemUnifiedAccount { display:none !important; } " +
      EXT_HIDDEN_PANELS.map(function (p) { return "body.role-external #" + p; }).join(", ") + " { display:none !important; }";
    document.head.appendChild(st);
  }
}

/** If the active submission is outside the new persona's scope, move to the first visible one. */
function extReconcileActive() {
  if (!extIsRestricted(currentUserRole)) return;
  var cur = extSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null);
  if (cur && extCanSee(currentUserRole, cur)) return;
  var vis = extVisible(currentUserRole, SUBMISSIONS_DATASET);
  if (typeof selectSubmission === "function") {
    if (vis.length) { try { selectSubmission(vis[0].id, false); } catch (e) { /* screen not mounted */ } }
    else { activeSubmissionId = null; }
  }
}

(function installExternalAccess() {
  Object.keys(EXTERNAL_ROLES).forEach(function (k) { registerExternalRole(k, EXTERNAL_ROLES[k]); });

  // "Reset to Defaults" in User Master rebuilds the matrix; keep the new personas in it.
  var origDefaults = window.defaultPermissionsMatrix;
  if (typeof origDefaults === "function") {
    window.defaultPermissionsMatrix = function () {
      var m = origDefaults.apply(this, arguments);
      Object.keys(EXTERNAL_ROLES).forEach(function (k) { m[k] = extPermissionsFor(k); });
      return m;
    };
  }

  // These are not underwriters: keep them out of assignment and workload lists.
  var origGroups = window.getAssignSubmissionModalRoleGroups;
  if (typeof origGroups === "function") {
    window.getAssignSubmissionModalRoleGroups = function () {
      var saved = {};
      Object.keys(EXTERNAL_ROLES).forEach(function (k) { saved[k] = USER_ROLES_CONFIG[k]; delete USER_ROLES_CONFIG[k]; });
      try { return origGroups.apply(this, arguments); } finally { Object.keys(saved).forEach(function (k) { USER_ROLES_CONFIG[k] = saved[k]; }); }
    };
  }
  var origDash = window.renderRoleDashboard;
  if (typeof origDash === "function") {
    window.renderRoleDashboard = extScoped(function () {
      var saved = {};
      Object.keys(EXTERNAL_ROLES).forEach(function (k) { saved[k] = USER_ROLES_CONFIG[k]; delete USER_ROLES_CONFIG[k]; });
      try { return origDash.apply(this, arguments); } finally { Object.keys(saved).forEach(function (k) { USER_ROLES_CONFIG[k] = saved[k]; }); }
    });
  }

  // List screens render from the visible set only.
  ["renderSubmissionsTable", "renderDeclineCenter", "renderAuditLogFeed", "renderUnifiedAccountView", "renderQuoteCompareSelector", "renderRenewalComparison", "renderRenewalPipeline", "renderTeamActivityBoard", "renderBordereaux", "renderPerformance"].forEach(function (name) {
    if (typeof window[name] === "function") window[name] = extScoped(window[name]);
  });

  // Opening a case outside scope is refused and logged.
  ["selectSubmission", "openCaseAtCurrentStep"].forEach(function (name) {
    var orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function (id) {
      var sub = extSub(id);
      if (sub && !extCanSee(currentUserRole, sub)) {
        extLogDenied(sub, name);
        showToast("⛔ " + id + " is outside your access.", "danger");
        return;
      }
      return orig.apply(this, arguments);
    };
  });

  // Internal pages are not available to external users.
  ["showDeclinePage", "showQuoteVersionsPage", "showQuoteIntelligencePage", "showIntegratingApiPage", "showUnifiedAccountPage"].forEach(function (name) {
    var orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function () {
      if (extIsExternal(currentUserRole)) { showToast("⛔ This page is not available to external users.", "danger"); return; }
      return orig.apply(this, arguments);
    };
  });

  // Switching persona applies the scope immediately.
  var origChange = window.changeUserRole;
  if (typeof origChange === "function") {
    window.changeUserRole = function (role) {
      currentUserRole = role;
      extApplyPersonaUi();
      extReconcileActive();
      var r = origChange.apply(this, arguments);
      extReconcileActive();
      return r;
    };
  }

  if (typeof populateLoginUserSelect === "function") { try { populateLoginUserSelect(); } catch (e) { /* not mounted */ } }

  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.ext_access_denied = { label: "Out-of-Scope Access Refused", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }
})();

window.extCanSee = extCanSee; window.extVisible = extVisible; window.extApplyPersonaUi = extApplyPersonaUi;
