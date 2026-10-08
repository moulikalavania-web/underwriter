/**
 * ============================================================================
 * EXTERNAL AND OVERSIGHT ROLES, PRODUCER AND PROGRAM SEGREGATION (G31)
 * ----------------------------------------------------------------------------
 * Until now every persona was an internal underwriter or the administrator, and
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
var EXTERNAL_ROLES = {
  broker_user: {
    name: "Jordan Reyes", title: "Producer, Marsh & McLennan Commercial Brokerage (External)", icon: "🤝",
    limit: 0, limitText: "External · own agency book only", description: "Broker user: sees only their own agency's submissions and quotes.",
    external: true, scope: { kind: "agency", agency: "Marsh & McLennan Commercial Brokerage" }
  },
  broker_user_2: {
    name: "Meera Arora", title: "Producer, Arora & Sons (External)", icon: "🤝",
    limit: 0, limitText: "External · own agency book only", description: "Broker user at a second agency; proves producers cannot see each other's business.",
    external: true, scope: { kind: "agency", agency: "Arora & Sons" }
  },
  mga_user: {
    name: "Taylor Brooks", title: "Program Administrator, Contractors GL Program (External)", icon: "🏗️",
    limit: 0, limitText: "External · program lines only", description: "Program or MGA administrator: sees only the lines of their program.",
    external: true, scope: { kind: "program", name: "Contractors GL Program", lobs: ["gl_cpc", "gl_cas"], states: null }
  },
  carrier_auditor: {
    name: "Helen Park", title: "Carrier Auditor, Vikram & Sons (External, read-only)", icon: "🔎",
    limit: 0, limitText: "External · read-only · carrier paper only", description: "Reads policies written on the carrier's paper; cannot change anything.",
    external: true, readOnly: true, scope: { kind: "carrier", carrier: "Vikram & Sons" }
  },
  compliance: {
    name: "Robert Okafor", title: "Compliance Officer (Read-only)", icon: "🧾",
    limit: 0, limitText: "Read-only · whole book · audit log", description: "Internal oversight: reads everything, changes nothing.",
    external: false, readOnly: true, scope: { kind: "all" }
  }
};

var EXT_VIEW_ALL = ["documents", "submissionData", "workflow", "archival", "reviewRules", "appetiteRules", "premiumAdjustment", "unifiedAccount", "auditLog", "sanctions", "producerLicensing", "tria", "notices", "completeness", "subjectivities", "binders", "policyChanges", "renewals", "brokerRelations", "surplusLines", "rateConfig", "authority", "bordereaux"];
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
  if (roleKey === "carrier_auditor" && p.auditLog) p.auditLog.view = false;   // carrier sees policies, not the company's internal log
  return p;
}

// ----------------------------------------------------------------------------
// 1. SCOPE (pure)
// ----------------------------------------------------------------------------
function extRole(roleKey) { return EXTERNAL_ROLES[roleKey] || null; }
function extIsExternal(roleKey) { var r = EXTERNAL_ROLES[roleKey]; return !!(r && r.external); }
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
    st.textContent = "body.role-external #navItemDecline, body.role-external #navItemQuoteVersions, body.role-external #navItemQuoteIntel, body.role-external #navItemIntegratingApi, body.role-external #navItemUnifiedAccount { display:none !important; } " +
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
  Object.keys(EXTERNAL_ROLES).forEach(function (k) {
    if (!USER_ROLES_CONFIG[k]) {
      var r = EXTERNAL_ROLES[k];
      USER_ROLES_CONFIG[k] = { name: r.name, title: r.title, limit: r.limit, limitText: r.limitText, icon: r.icon, description: r.description, external: !!r.external, readOnly: !!r.readOnly };
    }
    if (typeof PERMISSIONS_MATRIX !== "undefined" && !PERMISSIONS_MATRIX[k]) PERMISSIONS_MATRIX[k] = extPermissionsFor(k);
    if (typeof TEAM_USERS !== "undefined" && !TEAM_USERS.some(function (u) { return u.roleKey === k; })) {
      var rr = EXTERNAL_ROLES[k];
      TEAM_USERS.push({ id: "u_" + k, name: rr.name, title: rr.title, email: "", roleKey: k, limit: 0, description: rr.description, states: [], lobs: [], coverages: [], isDefault: true });
    }
  });

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
  ["renderSubmissionsTable", "renderDeclineCenter", "renderAuditLogFeed", "renderUnifiedAccountView", "renderQuoteCompareSelector", "renderRenewalComparison", "renderRenewalPipeline", "renderTeamActivityBoard", "renderBordereaux"].forEach(function (name) {
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

  if (typeof refreshUserRoleDropdown === "function") { try { refreshUserRoleDropdown(); } catch (e) { /* not mounted */ } }
  if (typeof populateLoginUserSelect === "function") { try { populateLoginUserSelect(); } catch (e) { /* not mounted */ } }

  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.ext_access_denied = { label: "Out-of-Scope Access Refused", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }
})();

window.extCanSee = extCanSee; window.extVisible = extVisible; window.extApplyPersonaUi = extApplyPersonaUi;
