/**
 * ============================================================================
 * UNDERWRITING AUTHORITY: BY PREMIUM, CLASS AND STATE; CARRIER LAYER; NO
 * SELF-APPROVAL (G08)
 * ----------------------------------------------------------------------------
 * Before this module, authority was ONE dollar figure per role, tested against
 * exposure, and nothing stopped the person who priced or referred a risk from
 * signing it off. Real authority is narrower and layered:
 *
 *   INDIVIDUAL AUTHORITY  what each underwriter may bind: a premium ceiling and a
 *                 policy-limit ceiling, which differ by line of business (a high
 *                 hazard casualty class is normally withheld from a junior) and
 *                 by state (for example catastrophe-exposed states). The most
 *                 specific rule that matches the risk applies. A role with no
 *                 matching rule has no authority.
 *   CARRIER LAYER the MGA binds on the carrier's paper under a delegated
 *                 authority agreement: per-risk limit and premium ceilings, a
 *                 permitted line and state list, an expiry date and an
 *                 aggregate capacity. Internal sign-off, however senior, does not
 *                 extend it; the carrier's own approval must be recorded.
 *   FOUR EYES     whoever prepared, repriced or referred a risk cannot approve
 *                 it. Approval must come from a different person whose own
 *                 authority covers the risk.
 *
 * Enforced at quote issue and at bind. A referral approval is tied to the
 * figures that were approved: if the premium or limit later rises, the approval
 * no longer covers the risk and a new one is needed.
 *
 * IMPORTANT: every figure in AUTH_RULES and CARRIER_AUTHORITY below is an
 * ILLUSTRATIVE PLACEHOLDER. The real values come from the company's authority
 * letters and the carrier's delegated authority agreement, and must be loaded
 * and signed off by the carrier-appointed authority owner before use.
 * ============================================================================
 */

var AUTH_ROLE_ORDER = ["assistant", "junior", "senior_uw", "senior"];   // lowest to highest internal authority

// role, lob ("*" = any), states ("*" = any, or a list), ceilings. Most specific match wins.
var AUTH_RULES = [
  { id: "JR-ALL",  role: "junior",    lob: "*",      states: "*",          maxPremium: 250000,  maxLimit: 2000000,  note: "Standard junior authority (limit from the former role limit)" },
  { id: "JR-CAS",  role: "junior",    lob: "gl_cas", states: "*",          maxPremium: 0,       maxLimit: 0,        note: "High-hazard casualty and surplus classes are withheld from junior authority" },
  { id: "JR-CAT",  role: "junior",    lob: "property", states: ["FL", "LA"], maxPremium: 0,     maxLimit: 0,        note: "Catastrophe-exposed states for property are withheld from junior authority" },
  { id: "SU-ALL",  role: "senior_uw", lob: "*",      states: "*",          maxPremium: 1000000, maxLimit: 10000000, note: "Senior line authority" },
  { id: "SU-CAS",  role: "senior_uw", lob: "gl_cas", states: "*",          maxPremium: 500000,  maxLimit: 5000000,  note: "Reduced ceiling for high-hazard casualty" },
  { id: "CUO-ALL", role: "senior",    lob: "*",      states: "*",          maxPremium: 5000000, maxLimit: 25000000, note: "Chief underwriting officer authority" }
];

// Delegated authority from each carrier. "*" under lines is the default for a line not listed.
var CARRIER_AUTHORITY = {
  "Vikram & Sons": {
    paper: "Vikram & Sons (demonstration carrier)", agreementRef: "DAA-DEMO-2026", expires: "2027-06-30",
    lines: {
      "*":      { maxPremium: 2000000, maxLimit: 10000000, states: "*", capacity: 60000000 },
      "gl_cas": { maxPremium: 750000,  maxLimit: 5000000,  states: ["TX", "OH", "IL", "MA"], capacity: 15000000 },
      "mpl":    { maxPremium: 1000000, maxLimit: 5000000,  states: "*", capacity: 20000000 }
    }
  }
};

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function authMoney(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("en-US"); }
function authToday() { return new Date().toISOString().slice(0, 10); }
function authNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function authEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
function authRoleLabel(r) { var c = typeof USER_ROLES_CONFIG !== "undefined" ? USER_ROLES_CONFIG[r] : null; return c ? c.title : r; }
function authRoleIdent(r) { var c = typeof USER_ROLES_CONFIG !== "undefined" ? USER_ROLES_CONFIG[r] : null; return c ? c.name + " (" + c.title + ")" : String(r); }
function authActor() { return authRoleIdent(currentUserRole); }

/** The figures authority is tested against. */
function authMeasures(sub) {
  var dp = sub.discretionaryPricing, q = sub.importedRatingData && sub.importedRatingData.quote;
  var premium = (dp && dp.finalPremium) || (q && q.finalPremium) || (typeof getSubmissionPremium === "function" ? getSubmissionPremium(sub) : 0) || 0;
  var state = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  return { premium: Number(premium) || 0, limit: Number(sub.exposureVal) || 0, lob: sub.lobKey || "", state: state };
}

function authStatesMatch(spec, state) { return spec === "*" || (Array.isArray(spec) && state && spec.indexOf(state) > -1); }

/** Most specific rule for a role and risk: line-and-state > line > state > catch-all. Null when the role has no matching rule. */
function authRuleFor(role, m) {
  var best = null, bestScore = -1;
  AUTH_RULES.forEach(function (r) {
    if (r.role !== role) return;
    if (r.lob !== "*" && r.lob !== m.lob) return;
    if (!authStatesMatch(r.states, m.state)) return;
    var score = (r.lob !== "*" ? 2 : 0) + (r.states !== "*" ? 1 : 0);
    if (score > bestScore) { best = r; bestScore = score; }
  });
  return best;
}

/** Does a role hold authority over this risk? */
function authRoleCovers(role, m) {
  if (m.state === null) return { ok: false, rule: null, reasons: ["The risk's state could not be determined, so state-specific authority cannot be confirmed."] };
  var rule = authRuleFor(role, m);
  if (!rule) return { ok: false, rule: null, reasons: [authRoleLabel(role) + " holds no authority for this class or state."] };
  var why = [];
  if (m.premium > rule.maxPremium) why.push("premium " + authMoney(m.premium) + " exceeds the " + authMoney(rule.maxPremium) + " ceiling (" + rule.id + ")");
  if (m.limit > rule.maxLimit) why.push("policy limit " + authMoney(m.limit) + " exceeds the " + authMoney(rule.maxLimit) + " ceiling (" + rule.id + ")");
  if (rule.maxPremium === 0 && rule.maxLimit === 0) why = [rule.note + " (" + rule.id + ")"];
  return { ok: why.length === 0, rule: rule, reasons: why };
}

/** Lowest internal role whose authority covers the risk, or null if none does. */
function authRequiredRole(m) {
  for (var i = 0; i < AUTH_ROLE_ORDER.length; i++) { if (authRoleCovers(AUTH_ROLE_ORDER[i], m).ok) return AUTH_ROLE_ORDER[i]; }
  return null;
}

/**
 * The internal role whose desk a submission sits on: the assigned underwriter's role, or, for older records with no
 * assignment, the lowest role whose limit reaches the figure the record carries in authorityLimit. This is the one
 * definition of "referral needed" for the queue, the counts, the status labels and the review-routing rules.
 */
function authDeskRole(sub) {
  if (sub.assignedTo && AUTH_ROLE_ORDER.indexOf(sub.assignedTo) > 0) return sub.assignedTo;
  var want = Number(sub.authorityLimit) || 0;
  for (var i = 1; i < AUTH_ROLE_ORDER.length; i++) {
    var c = USER_ROLES_CONFIG[AUTH_ROLE_ORDER[i]];
    if (c && c.limit >= want) return AUTH_ROLE_ORDER[i];
  }
  return AUTH_ROLE_ORDER[AUTH_ROLE_ORDER.length - 1];
}
// An unknown state does not by itself make a queue item a referral (the gates at quote and bind still need a state).
function authDeskCover(sub) { var m = authMeasures(sub); if (m.state === null) m.state = "??"; return authRoleCovers(authDeskRole(sub), m); }
function authNeedsReferral(sub) { return !authDeskCover(sub).ok; }

/** Aggregate limit already bound on a carrier's paper for a line (other policies only). */
function authBoundAggregate(carrier, lob, excludeId, dataset) {
  var tot = 0;
  (dataset || []).forEach(function (s) {
    if (s.id === excludeId || !s.pasSync || s.pasSync.status !== "success") return;
    if ((s.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "")) !== carrier) return;
    if (lob && s.lobKey !== lob) return;
    tot += Number(s.exposureVal) || 0;
  });
  return tot;
}

/** The carrier's delegated authority over the risk. */
function authCarrierCheck(sub, m, dataset, today) {
  var carrier = sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "");
  var ag = CARRIER_AUTHORITY[carrier];
  if (!ag) return { carrier: carrier, ok: false, reasons: ["No delegated authority agreement is loaded for " + (carrier || "the carrier") + "; the carrier must approve this risk."] };
  var why = [], t = today || authToday();
  if (ag.expires < t) why.push("the delegated authority agreement " + ag.agreementRef + " expired " + ag.expires);
  var line = ag.lines[m.lob] || ag.lines["*"];
  if (!line) why.push("no delegated authority for this line");
  else {
    if (!authStatesMatch(line.states, m.state)) why.push((m.state || "the risk's state") + " is outside the carrier's permitted states for this line");
    if (m.premium > line.maxPremium) why.push("premium " + authMoney(m.premium) + " exceeds the carrier's " + authMoney(line.maxPremium) + " per-policy ceiling");
    if (m.limit > line.maxLimit) why.push("policy limit " + authMoney(m.limit) + " exceeds the carrier's " + authMoney(line.maxLimit) + " per-risk ceiling");
    var used = authBoundAggregate(carrier, m.lob, sub.id, dataset);
    if (used + m.limit > line.capacity) why.push("binding it would take aggregate limit on this line to " + authMoney(used + m.limit) + ", over the " + authMoney(line.capacity) + " capacity");
  }
  return { carrier: carrier, ok: why.length === 0, reasons: why, agreement: ag.agreementRef };
}

/** People who prepared, repriced or referred the risk. They may not approve it. */
function authPreparers(sub) {
  var s = {};
  if (sub.authorityRef && sub.authorityRef.raisedBy) s[sub.authorityRef.raisedBy] = true;
  if (sub.discretionaryPricing && sub.discretionaryPricing.appliedBy) s[sub.discretionaryPricing.appliedBy] = true;   // whoever priced it
  if (sub.authPreparedBy) Object.keys(sub.authPreparedBy).forEach(function (k) { s[k] = true; });
  return Object.keys(s);
}

/** An approval covers the risk only while the figures stay at or below what was approved. */
function authApprovalCurrent(approved, m) {
  return !!approved && m.premium <= approved.premium && m.limit <= approved.limit;
}

/** Overall position of a submission for a given acting role. */
function authAssess(sub, actorRole, dataset) {
  var m = authMeasures(sub);
  var own = authRoleCovers(actorRole, m);
  var req = authRequiredRole(m);
  var ref = sub.authorityRef || null;
  var refValid = !!(ref && ref.status === "approved" && authApprovalCurrent(ref.approvedMeasures, m));
  var refStale = !!(ref && ref.status === "approved" && !refValid);
  var carrier = authCarrierCheck(sub, m, dataset || (typeof SUBMISSIONS_DATASET !== "undefined" ? SUBMISSIONS_DATASET : []));
  var ca = sub.carrierApproval || null;
  var carrierCovered = carrier.ok || (!!ca && authApprovalCurrent(ca.approvedMeasures, m));
  var internalOk = own.ok || refValid;
  var blockers = [];
  if (!internalOk) {
    if (refStale) blockers.push("The earlier referral approval covered " + authMoney(ref.approvedMeasures.premium) + " premium and " + authMoney(ref.approvedMeasures.limit) + " limit; the risk now stands at " + authMoney(m.premium) + " and " + authMoney(m.limit) + ", so it must be referred again.");
    else if (req === null) blockers.push("The risk exceeds every internal authority level" + (own.reasons.length ? " (" + own.reasons[0] + ")" : "") + "; it can only go ahead with a written exception from the carrier.");
    else blockers.push(authRoleLabel(actorRole) + " lacks authority (" + own.reasons.join("; ") + "). It needs " + authRoleLabel(req) + " or above" + (ref && ref.status === "pending" ? "; a referral is awaiting decision." : "."));
  }
  if (!carrierCovered) blockers.push("Outside the carrier's delegated authority: " + carrier.reasons.join("; ") + ". The carrier's approval must be recorded.");
  return { measures: m, own: own, requiredRole: req, ref: ref, refValid: refValid, refStale: refStale, carrier: carrier, carrierApproval: ca, carrierCovered: carrierCovered, ok: blockers.length === 0, blockers: blockers };
}

// ----------------------------------------------------------------------------
// 2. STATE HELPERS
// ----------------------------------------------------------------------------
function authSub(id) { return SUBMISSIONS_DATASET.filter(function (s) { return s.id === id; })[0] || null; }
function authActive() { return authSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); }
function authV(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
function authLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 7, decision: decision, by: authActor(), at: authNow(), notes: notes });
}
function authPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function authIsBound(sub) { return !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }

// ----------------------------------------------------------------------------
// 3. ACTIONS
// ----------------------------------------------------------------------------
/** Records a referral. Used by the card and by the existing "refer to senior" button. */
function authRaiseCore(sub, note) {
  var a = authAssess(sub, currentUserRole);
  if (!sub.authPreparedBy) sub.authPreparedBy = {};
  sub.authPreparedBy[authActor()] = true;
  sub.authorityRef = { status: "pending", requiredRole: a.requiredRole, raisedBy: authActor(), raisedAt: authNow(), note: note, reasons: a.own.reasons.slice(), measures: a.measures, history: ((sub.authorityRef && sub.authorityRef.history) || []).concat(sub.authorityRef ? [{ status: sub.authorityRef.status, decidedBy: sub.authorityRef.decidedBy, decidedAt: sub.authorityRef.decidedAt }] : []) };
  authLog(sub, "auth_referral_raised", "Referral raised to " + (a.requiredRole ? authRoleLabel(a.requiredRole) : "carrier (exceeds all internal authority)") + ": " + a.own.reasons.join("; ") + ". Note: " + note);
  authPersist();
  return sub.authorityRef;
}
function authRaise() {
  var sub = authActive(); if (!sub) return;
  if (!hasPermission("authority", "edit")) { denyPermission("authority", "edit"); return; }
  var a = authAssess(sub, currentUserRole);
  if (a.own.ok) { showToast("The risk is within your authority; no referral is needed.", "info"); return; }
  if (sub.authorityRef && sub.authorityRef.status === "pending") { showToast("⛔ A referral is already awaiting decision.", "danger"); return; }
  var note = authV("auth_note");
  if (note.length < 10) { showToast("⛔ Explain the referral for the approver (at least 10 characters).", "danger"); return; }
  authRaiseCore(sub, note); renderAuthorityCard(sub);
}

/** Decide a pending referral. Returns {ok, why}. */
function authDecideCore(sub, verb, note, quiet) {
  var ref = sub.authorityRef;
  var fail = function (m) { if (!quiet) showToast("⛔ " + m, "danger"); return { ok: false, why: m }; };
  if (!hasPermission("authority", "approve")) { if (!quiet) denyPermission("authority", "approve"); return { ok: false, why: "no permission" }; }
  if (!ref || ref.status !== "pending") return fail("There is no referral awaiting a decision.");
  var me = authActor();
  if (authPreparers(sub).indexOf(me) > -1) return fail("You prepared, repriced or referred this risk, so you cannot approve it. A different approver with authority must decide.");
  if (verb !== "approve" && String(note || "").trim().length < 10) return fail("Give a reason for returning or declining (at least 10 characters).");
  var m = authMeasures(sub);
  if (verb === "approve") {
    var cover = authRoleCovers(currentUserRole, m);
    if (!cover.ok) return fail("This risk is beyond your own authority (" + cover.reasons.join("; ") + "). It must go to " + (authRequiredRole(m) ? authRoleLabel(authRequiredRole(m)) + " or above." : "the carrier."));
    ref.status = "approved"; ref.approvedMeasures = { premium: m.premium, limit: m.limit };
  } else ref.status = verb === "return" ? "returned" : "declined";
  ref.decidedBy = me; ref.decidedAt = authNow(); ref.decisionNote = note || "";
  authLog(sub, verb === "approve" ? "auth_referral_approved" : "auth_referral_closed", (verb === "approve" ? "Referral approved within " + authRoleLabel(currentUserRole) + " authority at premium " + authMoney(m.premium) + ", limit " + authMoney(m.limit) + "." : "Referral " + (verb === "return" ? "returned for revision" : "declined") + ": " + note));
  authPersist();
  return { ok: true };
}
function authDecide(verb) {
  var sub = authActive(); if (!sub) return;
  var r = authDecideCore(sub, verb, authV("auth_decNote"), false);
  if (r.ok) renderAuthorityCard(sub);
}

function authRecordCarrier() {
  var sub = authActive(); if (!sub) return;
  if (!hasPermission("authority", "override")) { denyPermission("authority", "override"); return; }
  if (authIsBound(sub)) { showToast("⛔ The policy is bound.", "danger"); return; }
  var f = { ref: authV("auth_cRef"), uw: authV("auth_cUw"), on: authV("auth_cOn"), terms: authV("auth_cTerms") }, p = [];
  if (f.ref.length < 3) p.push("enter the carrier's approval reference");
  if (f.uw.length < 3) p.push("name the carrier underwriter who approved");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.on)) p.push("enter the approval date");
  else if (f.on > authToday()) p.push("the approval date cannot be in the future");
  if (f.terms.length < 10) p.push("record the terms approved (at least 10 characters)");
  if (p.length) { showToast("⛔ " + p.join("; ") + ".", "danger"); return; }
  var m = authMeasures(sub);
  sub.carrierApproval = { ref: f.ref, carrierUnderwriter: f.uw, approvedOn: f.on, terms: f.terms, approvedMeasures: { premium: m.premium, limit: m.limit }, recordedBy: authActor(), recordedAt: authNow() };
  authLog(sub, "auth_carrier_approval", "Carrier approval recorded (" + f.ref + ", " + f.uw + ", " + f.on + ") for premium " + authMoney(m.premium) + ", limit " + authMoney(m.limit) + ": " + f.terms);
  authPersist(); renderAuthorityCard(sub);
}
function authClearCarrier() {
  var sub = authActive(); if (!sub || !sub.carrierApproval) return;
  if (!hasPermission("authority", "override")) { denyPermission("authority", "override"); return; }
  if (authIsBound(sub)) { showToast("⛔ The policy is bound.", "danger"); return; }
  authLog(sub, "auth_carrier_approval", "Carrier approval " + sub.carrierApproval.ref + " withdrawn.");
  sub.carrierApproval = null; authPersist(); renderAuthorityCard(sub);
}

// ----------------------------------------------------------------------------
// 4. RENDERING
// ----------------------------------------------------------------------------
function renderAuthorityCard(sub) {
  var box = document.getElementById("authorityContainer");
  if (!box || !sub) return;
  var a = authAssess(sub, currentUserRole), m = a.measures, me = authActor();
  var canEdit = hasPermission("authority", "edit"), canApprove = hasPermission("authority", "approve"), canOverride = hasPermission("authority", "override");
  var bound = authIsBound(sub), ref = a.ref;
  var head = a.ok ? '<span class="badge badge-success">Within authority</span>' : '<span class="badge badge-danger">Authority needed</span>';

  var levels = AUTH_ROLE_ORDER.filter(function (r) { return r !== "assistant"; }).map(function (r) {
    var c = authRoleCovers(r, m);
    return '<tr><td>' + authEsc(authRoleLabel(r)) + (r === currentUserRole ? ' <span class="badge badge-info text-xs">you</span>' : '') + '</td><td>' + (c.rule ? authMoney(c.rule.maxPremium) : "—") + '</td><td>' + (c.rule ? authMoney(c.rule.maxLimit) : "—") + '</td><td>' + (c.ok ? '<span class="badge badge-success text-xs">Covers</span>' : '<span class="badge badge-light text-xs">Does not cover</span>') + '<div class="text-xs text-muted">' + authEsc(c.ok ? (c.rule ? c.rule.id : "") : c.reasons.join("; ")) + '</div></td></tr>';
  }).join("");

  var refHtml = "";
  if (ref) {
    var st = { pending: "badge-warning", approved: a.refStale ? "badge-danger" : "badge-success", returned: "badge-light", declined: "badge-danger" }[ref.status] || "badge-light";
    refHtml = '<div class="text-xs" style="margin-top:8px;"><span class="badge ' + st + '">' + authEsc(ref.status === "approved" && a.refStale ? "approval no longer covers the risk" : ref.status) + '</span> Referred to ' + authEsc(ref.requiredRole ? authRoleLabel(ref.requiredRole) : "carrier") + ' by ' + authEsc(ref.raisedBy) + ' on ' + authEsc(ref.raisedAt) + '.<br><span class="text-muted">' + authEsc(ref.note) + '</span>' + (ref.decidedBy ? '<br>Decided by ' + authEsc(ref.decidedBy) + ' on ' + authEsc(ref.decidedAt) + (ref.decisionNote ? ': ' + authEsc(ref.decisionNote) : '') : '') + '</div>';
  }
  var actions = "";
  if (!bound) {
    if (ref && ref.status === "pending") {
      if (canApprove) {
        var mine = authPreparers(sub).indexOf(me) > -1;
        actions = mine ? '<div class="text-xs text-muted" style="margin-top:6px;"><i class="ph ph-lock"></i> You prepared or referred this risk; a different approver must decide.</div>'
          : '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;"><input id="auth_decNote" class="form-control" style="width:280px;" placeholder="Decision note (required to return or decline)"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="authDecide(\'approve\')">Approve</button><button class="btn btn-sm btn-outline" style="width:auto;" onclick="authDecide(\'return\')">Return</button><button class="btn btn-sm btn-outline" style="width:auto;" onclick="authDecide(\'decline\')">Decline</button></div>';
      }
    } else if (!a.own.ok && !a.refValid && canEdit) {
      actions = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;"><input id="auth_note" class="form-control" style="width:380px;" placeholder="Why this risk should be accepted (10+ characters)"><button class="btn btn-sm btn-warning" style="width:auto;" onclick="authRaise()">Refer to ' + authEsc(a.requiredRole ? authRoleLabel(a.requiredRole) : "carrier") + '</button></div>';
    }
  }

  var c = a.carrier, ca = a.carrierApproval;
  var carrierHtml = '<h4 style="margin:14px 0 6px;">Carrier delegated authority <span class="badge ' + (a.carrierCovered ? "badge-success" : "badge-danger") + ' text-xs">' + (c.ok ? "Within" : (ca && authApprovalCurrent(ca.approvedMeasures, m) ? "Carrier approved" : "Outside")) + '</span></h4>' +
    '<div class="text-xs">' + authEsc(c.carrier || "No carrier") + (c.agreement ? " · agreement " + authEsc(c.agreement) : "") + '</div>' +
    (c.ok ? '<div class="text-xs text-muted">Premium, limit, line, state and aggregate capacity are all inside the delegated authority.</div>' : '<div class="alert alert-warning text-xs" style="margin-top:6px;"><i class="ph ph-warning"></i> ' + authEsc(c.reasons.join("; ")) + '.</div>');
  if (ca) carrierHtml += '<div class="text-xs" style="margin-top:6px;"><i class="ph ph-seal-check"></i> Carrier approval ' + authEsc(ca.ref) + ' from ' + authEsc(ca.carrierUnderwriter) + ' on ' + authEsc(ca.approvedOn) + ' (covers ' + authMoney(ca.approvedMeasures.premium) + ' premium, ' + authMoney(ca.approvedMeasures.limit) + ' limit): ' + authEsc(ca.terms) + (canOverride && !bound ? ' <a href="#" onclick="authClearCarrier();return false;">Withdraw</a>' : '') + '</div>';
  if (!c.ok && !bound && canOverride) carrierHtml += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;"><input id="auth_cRef" class="form-control" style="width:150px;" placeholder="Carrier reference"><input id="auth_cUw" class="form-control" style="width:180px;" placeholder="Carrier underwriter"><input id="auth_cOn" type="date" class="form-control" style="width:140px;"><input id="auth_cTerms" class="form-control" style="width:260px;" placeholder="Terms approved"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="authRecordCarrier()">Record carrier approval</button></div>';
  else if (!c.ok && !bound) carrierHtml += '<div class="text-xs text-muted" style="margin-top:6px;"><i class="ph ph-lock"></i> A senior user records the carrier\'s approval.</div>';

  box.innerHTML = '<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-shield-star"></i> Underwriting Authority</h3>' + head + '</div><div class="card-body">' +
    '<div class="text-xs" style="margin-bottom:8px;">Risk: premium <strong>' + authMoney(m.premium) + '</strong>, policy limit <strong>' + authMoney(m.limit) + '</strong>, ' + authEsc(sub.lobName || m.lob) + ', ' + authEsc(m.state || "state unknown") + '.</div>' +
    '<div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Level</th><th>Premium ceiling</th><th>Limit ceiling</th><th>For this risk</th></tr></thead><tbody>' + levels + '</tbody></table></div>' +
    (a.blockers.length && !a.own.ok ? '<div class="alert alert-warning text-xs" style="margin-top:8px;"><i class="ph ph-warning"></i> ' + authEsc(a.blockers[0]) + '</div>' : '') +
    refHtml + actions + carrierHtml +
    '<p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> The ceilings shown are illustrative placeholders until the company\'s authority letters and the carrier\'s delegated authority agreement are loaded and signed off. Whoever prepared, repriced or referred a risk cannot approve it.</p></div></div>';
}

// ----------------------------------------------------------------------------
// 5. GUARDS AND HOOKS
// ----------------------------------------------------------------------------
function authGuard(source, sub, kind) {
  if (!sub) return true;
  var a = authAssess(sub, currentUserRole);
  if (a.ok) return true;
  authLog(sub, kind === "bind" ? "auth_bind_blocked" : "auth_quote_blocked", (kind === "bind" ? "Bind" : "Quote issue") + " attempt blocked (" + source + "): " + a.blockers.join(" "));
  authPersist();
  showToast("⛔ " + (kind === "bind" ? "Bind" : "Quote") + " blocked (authority): " + a.blockers[0], "danger");
  renderAuthorityCard(sub);
  return false;
}
function authGuardQuote(source) { return authGuard(source, authActive(), "quote"); }
function authGuardBind(source, subId) { return authGuard(source, subId ? authSub(subId) : authActive(), "bind"); }

(function installAuthorityHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    var m = function (label, icon, badge, outcome) { return { label: label, icon: icon, badge: badge, outcome: outcome }; };
    AUDIT_ACTION_META.auth_referral_raised = m("Authority Referral Raised", "ph-paper-plane-tilt", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.auth_referral_approved = m("Authority Referral Approved", "ph-stamp", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.auth_referral_closed = m("Authority Referral Returned or Declined", "ph-arrow-counter-clockwise", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.auth_carrier_approval = m("Carrier Approval Recorded", "ph-seal-check", "badge-info", "outcome-approve");
    AUDIT_ACTION_META.auth_quote_blocked = m("Quote Blocked — Authority", "ph-prohibit", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.auth_bind_blocked = m("Bind Blocked — Authority", "ph-prohibit", "badge-danger", "outcome-decline");
  }
  var origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      var r = origStep7.apply(this, arguments);
      try { var s = sub || authActive(); if (s) renderAuthorityCard(s); } catch (e) { console.warn("Authority card failed:", e); }
      return r;
    };
  }
  var origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      var r = origAll.apply(this, arguments);
      try { renderAuthorityCard(sub); } catch (e) { console.warn("Authority card failed:", e); }
      return r;
    };
  }
  var origESig = window.openESignatureModal;
  if (typeof origESig === "function") window.openESignatureModal = function () { if (!authGuardQuote("e-signature")) return; return origESig.apply(this, arguments); };
  var origIssue = window.issueQuoteAction;
  if (typeof origIssue === "function") window.issueQuoteAction = function () { if (!authGuardQuote("issue quote")) return; return origIssue.apply(this, arguments); };
  var origPas = window.simulatePASBindSync;
  if (typeof origPas === "function") window.simulatePASBindSync = function (subId) { if (!authGuardBind("PAS bind", subId)) return; return origPas.apply(this, arguments); };

  // The existing "Refer to Senior" button now creates a tracked referral.
  var origEsc = window.submitJuniorEscalation;
  if (typeof origEsc === "function") {
    window.submitJuniorEscalation = function () {
      var sub = authActive(), txt = document.getElementById("juniorEscalationText");
      var r = origEsc.apply(this, arguments);
      try {
        if (sub && !(sub.authorityRef && sub.authorityRef.status === "pending")) authRaiseCore(sub, (txt && txt.value.trim()) || "Risk exceeds authority; referred for sign-off from the Step 5 desk.");
        renderAuthorityCard(sub);
      } catch (e) { console.warn("Referral record failed:", e); }
      return r;
    };
  }
  // The existing CUO sign-off button must pass the same tests as the card: authority, and not the preparer.
  var origSenior = window.seniorUWAction;
  if (typeof origSenior === "function") {
    window.seniorUWAction = function (action) {
      var sub = authActive();
      if (action === "approve" && sub) {
        var a = authAssess(sub, currentUserRole);
        if (sub.authorityRef && sub.authorityRef.status === "pending") {
          if (!authDecideCore(sub, "approve", "Sign-off at the Step 5 referral desk.", false).ok) return;
        } else if (!a.own.ok) {
          showToast("⛔ This risk is beyond your authority: " + a.own.reasons.join("; ") + ".", "danger"); return;
        } else if (authPreparers(sub).indexOf(authActor()) > -1 && sub.authorityRef) {
          showToast("⛔ You prepared or referred this risk, so you cannot sign it off.", "danger"); return;
        }
        renderAuthorityCard(sub);
      }
      return origSenior.apply(this, arguments);
    };
  }
})();

window.authRaise = authRaise; window.authDecide = authDecide; window.authRecordCarrier = authRecordCarrier; window.authClearCarrier = authClearCarrier;
window.renderAuthorityCard = renderAuthorityCard;
