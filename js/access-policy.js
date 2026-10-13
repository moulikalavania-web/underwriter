/**
 * ============================================================================
 * ROLE DEFINITIONS, ACCESS POLICY AND PERIODIC ACCESS REVIEW
 * ----------------------------------------------------------------------------
 * What the permission table means, in writing, and the rules it must obey.
 *
 * BASIS. No US federal body defines underwriting job roles or their permissions: insurance is regulated state by state
 * (the Gramm-Leach-Bliley Act leaves insurers to the state insurance authorities). The federal reference for how to design
 * access is NIST SP 800-53 Rev. 5, and the insurance-specific rule is the NAIC Insurance Data Security Model Law (#668),
 * as each state has adopted it. The policy below applies the principles those documents set out:
 *   - AC-2  Account Management: account types are defined, access is approved, and access is reviewed periodically.
 *   - AC-3  Access Enforcement: the system enforces the approved authorisations.
 *   - AC-5  Separation of Duties: no one person controls a whole sensitive process (here: the Head of Underwriting, who
 *           sets the team's access, makes no case-level decision; the reviewer of access is not the person who changed it).
 *   - AC-6  Least Privilege: each role gets only what its job needs (and AC-6(7), review of privileges).
 *   - AU-9  Protection of Audit Information: the audit log cannot be altered by the people whose actions it records.
 *   - NAIC #668: access to nonpublic information is limited to authorised people with a legitimate business need.
 * This is a design policy, not legal advice. The review interval is a placeholder, and Compliance must confirm the
 * definitions against the applicable state law and the company's written information security program.
 * ============================================================================
 */

var ACCESS_REVIEW_DAYS = 90;                          // how often each role's access must be re-confirmed (organisation-defined; placeholder)
var ACCESS_STORAGE_KEY = "veridex_access_policy_v1";

var ACCESS_POLICY_BASIS = [
  { ref: "NIST SP 800-53 Rev. 5, AC-2", text: "Define account types, approve access, and review it periodically." },
  { ref: "AC-3", text: "The system enforces the approved access." },
  { ref: "AC-5", text: "Separation of duties: no one person controls a whole sensitive process." },
  { ref: "AC-6 and AC-6(7)", text: "Least privilege, and review of user privileges." },
  { ref: "AU-9", text: "Audit records are protected from change by the people they record." },
  { ref: "NAIC Insurance Data Security Model Law (#668), as adopted by each state", text: "Limit access to nonpublic information to authorised people with a legitimate business need." }
];

var ROLE_DEFINITIONS = {
  assistant: {
    purpose: "Underwriting Assistant: checks assigned submissions them against the line's application requirements, asks the producer for what is missing and runs clearance and sanctions screening.",
    may: ["View cases and documents", "Enter intake data, documents and completeness items on assigned cases", "Run clearance, sanctions screening and producer checks", "Request missing information from the producer", "Log producer correspondence and renewal tasks"],
    mustNot: ["Approve, override or waive anything", "Clear a sanctions match", "Change pricing, issue a quote or bind", "See underwriter-level performance", "Draft and issue quote conditions, extend a deadline, and confirm a met condition"],
    separation: "No approval authority of any kind; every decision is made by someone else."
  },
  junior: {
    purpose: "Underwriter I: underwrites straightforward risks inside a written authority letter (premium and policy-limit ceilings by line and state) and inside the carrier's delegated authority, and refers anything beyond it.",
    may: ["Edit the underwriting file and apply credits or debits within the permitted band", "Approve workflow steps and bind inside their own authority, subject to the producer, surplus lines and carrier checks", "Raise a referral to a senior underwriter", "Record a producer licence lookup", "Draft quote conditions and confirm a met condition (adds the coverage and premium) inside their authority"],
    mustNot: ["Approve a referral they raised or a price they set", "Go beyond their authority ceilings", "Override rates or appetite rules", "Clear a sanctions match", "Change guidelines, configuration or access"],
    separation: "A risk above their authority needs a different, more senior approver; their own sign-off never covers it."
  },
  senior_uw: {
    purpose: "Senior Underwriter: underwrites complex risks to a higher authority letter and decides referrals from Underwriters I.",
    may: ["Approve referrals within their authority", "Grant diligent-search exemptions and enter a state surplus lines rate with a cited source", "Override appetite and rate rules with a written reason", "Waive a pre-bind subjectivity with a reason", "Propose rate, fee and limit changes", "Draft and issue quote conditions, extend a deadline, and confirm a met condition"],
    mustNot: ["Approve a referral they raised or a price they set", "Approve a configuration change they proposed", "Record the carrier's approval or submit a bordereau (CUO)", "Clear a sanctions match (CUO)", "Change guidelines or access"],
    separation: "Proposes but does not approve configuration changes; a risk beyond their authority goes to the Chief Underwriting Officer."
  },
  senior: {
    purpose: "Chief Underwriting Officer: the highest case-level underwriting authority and the decision-maker on escalations and exceptions.",
    may: ["Approve referrals up to the CUO authority ceilings", "Resolve sanctions potential matches with a written reason", "Record the carrier's written approval for a risk outside delegated authority", "Submit the premium bordereau to the carrier", "Approve rate, fee and limit changes proposed by someone else", "See underwriter-level performance"],
    mustNot: ["Approve their own referral, price or configuration change", "Exceed the carrier's delegated authority without the carrier's written approval", "Change guidelines, access or the audit log"],
    separation: "Cannot approve what they prepared; a risk beyond every internal level can only proceed with the carrier's written exception."
  },
  admin: {
    purpose: "Head of Underwriting: leads the department. Owns the underwriting guidelines (appetite, review routing, rates and limits, authority letters), assigns work, sets what each underwriting role may do and oversees performance. Not a system administrator and not a case decision-maker.",
    may: ["Set which underwriting role can do what in the permission table, within the access policy", "Add and maintain team members", "Create and import submissions and assign them to underwriters (the only role that does either)", "Advance a case through every workflow step", "Edit appetite rules and review-routing thresholds", "Propose and approve rate, fee and limit changes (never their own)", "Run records retention and archiving", "See every case, the audit log and underwriter-level performance"],
    mustNot: ["Override, waive or decide on risk: referral, waiver, sanctions or pricing", "Edit case data, a document or a price", "Alter or archive the audit log", "Record a review of the access they set", "Approve a configuration change they proposed"],
    separation: "Sets the rules and the access but does not use them to underwrite; the Compliance Officer independently reviews that access. Technical account provisioning (single sign-on, passwords) belongs to IT and is outside this prototype."
  },
  compliance: {
    purpose: "Compliance Officer: independent oversight of what was done and of who was allowed to do it.",
    may: ["Read every case, decision and the audit log", "Record the periodic review of each role's access"],
    mustNot: ["Create, edit, approve, override or archive anything else", "Hold underwriting authority"],
    separation: "Read-only apart from recording access reviews, so oversight is independent of the work it oversees."
  }
};

// The role that sets everyone's access (internal key "admin": the Head of Underwriting).
var ACCESS_OWNER_ROLE = "admin";

// Resources where a decision is made on a case or a price: the access owner must hold no edit, approve or override on these.
// (Guidelines and configuration - appetite rules, review routing, rates and limits, archival - are governance, not case decisions.)
var ACCESS_CASE_RESOURCES = ["documents", "submissionData", "premiumAdjustment", "unifiedAccount", "sanctions", "producerLicensing", "tria", "notices", "completeness", "subjectivities", "binders", "policyChanges", "renewals", "brokerRelations", "surplusLines", "authority", "bordereaux", "quoteConditions"];

var ACCESS_RULES = [
  { id: "SOD-1", basis: "AC-5, AC-6", text: "The Head of Underwriting, who sets everyone's access, holds no edit, approve or override right on case data, pricing or underwriting decisions (workflow steps are the exception: they run the department's process)." },
  { id: "SOD-2", basis: "AC-5, AU-9", text: "The Compliance Officer holds no edit, approve, override or archive right, except to record access reviews." },
  { id: "SOD-3", basis: "AC-5, AC-2", text: "The Head of Underwriting cannot record access reviews (nobody reviews the access they set)." },
  { id: "LP-1", basis: "AC-6", text: "An Underwriting Assistant holds no approve or override right anywhere." },
  { id: "LP-2", basis: "AC-3, AC-6", text: "Any role that can edit, approve, override or archive a resource can also view it." },
  { id: "AU-1", basis: "AU-9", text: "No role can edit, approve, override or archive the audit log." }
];

// ----------------------------------------------------------------------------
// 1. THE POLICY CHECK (pure)
// ----------------------------------------------------------------------------
/** Returns [{ rule, role, resource, action, text }] for every rule the matrix breaks. */
function validatePermissionMatrix(matrix, roleKeys) {
  const out = [];
  const roles = roleKeys || Object.keys(matrix);
  const add = (rule, role, resource, action, text) => out.push({ rule, role, resource, action, text });
  roles.forEach(role => {
    const m = matrix[role] || {};
    Object.keys(m).forEach(res => {
      const p = m[res] || {};
      const acts = ["edit", "approve", "override", "archive"].filter(a => p[a]);
      if (acts.length && !p.view) add("LP-2", role, res, acts[0], role + " can " + acts[0] + " " + res + " but not view it.");
      if (role === ACCESS_OWNER_ROLE && ACCESS_CASE_RESOURCES.indexOf(res) > -1) {
        ["edit", "approve", "override"].forEach(a => { if (p[a]) add("SOD-1", role, res, a, "The Head of Underwriting may not " + a + " " + res + "."); });
      }
      if (role === "compliance" && res !== "accessReview") {
        ["edit", "approve", "override", "archive"].forEach(a => { if (p[a]) add("SOD-2", role, res, a, "The Compliance Officer may not " + a + " " + res + "."); });
      }
      if (role === "assistant") {
        ["approve", "override"].forEach(a => { if (p[a]) add("LP-1", role, res, a, "The Underwriting Assistant may not " + a + " " + res + "."); });
      }
      if (res === "auditLog") {
        ["edit", "approve", "override", "archive"].forEach(a => { if (p[a]) add("AU-1", role, res, a, role + " may not " + a + " the audit log."); });
      }
      if (role === ACCESS_OWNER_ROLE && res === "accessReview" && p.approve) add("SOD-3", role, res, "approve", "The Head of Underwriting may not record access reviews.");
    });
  });
  return out;
}

function accessViolationKey(v) { return v.rule + "|" + v.role + "|" + v.resource + "|" + v.action; }

/** A short fingerprint of one role's permissions, to notice when they change after a review. */
function accessDigest(roleKey, matrix) {
  const m = (matrix || PERMISSIONS_MATRIX)[roleKey] || {};
  const s = Object.keys(m).sort().map(r => r + ":" + ["view", "edit", "approve", "override", "archive"].map(a => (m[r][a] ? 1 : 0)).join("")).join(";");
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return ("00000000" + h.toString(16)).slice(-8);
}

/** Status of a role's access review: never | current | due | changed. */
function accessReviewStatus(roleKey, state, today) {
  const st = state || ACCESS_STATE, t = today || new Date().toISOString().slice(0, 10);
  const last = (st.reviews || []).filter(r => r.role === roleKey).slice(-1)[0];
  if (!last) return { status: "never", last: null };
  if (last.digest !== accessDigest(roleKey)) return { status: "changed", last };
  const due = new Date(last.at.slice(0, 10) + "T00:00:00Z"); due.setUTCDate(due.getUTCDate() + ACCESS_REVIEW_DAYS);
  const dueIso = due.toISOString().slice(0, 10);
  return { status: dueIso < t ? "due" : "current", last, dueOn: dueIso };
}

// ----------------------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------------------
var ACCESS_STATE = { reviews: [], changes: [] };
function accessLoad() { try { const s = JSON.parse(localStorage.getItem(ACCESS_STORAGE_KEY) || "null"); if (s && s.reviews) ACCESS_STATE = s; } catch (e) { /* storage unavailable */ } }
function accessSave() { try { localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(ACCESS_STATE)); } catch (e) { /* storage unavailable */ } }
function accessActor() { const r = USER_ROLES_CONFIG[currentUserRole]; return r ? r.name + " (" + r.title + ")" : "Unknown"; }
function accessNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function accessEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function accessRecordReview(roleKey) {
  if (!hasPermission("accessReview", "approve")) { denyPermission("accessReview", "approve"); return false; }
  if (!USER_ROLES_CONFIG[roleKey]) return false;
  const noteEl = document.getElementById("accessNote_" + roleKey), refEl = document.getElementById("accessRef_" + roleKey);
  const note = noteEl ? noteEl.value.trim() : "", reference = refEl ? refEl.value.trim() : "";
  if (note.length < 10) { showToast("⛔ Write what was reviewed and the outcome (at least 10 characters).", "danger"); return false; }
  if (reference.length < 3) { showToast("⛔ Enter the review reference (ticket, minutes or report).", "danger"); return false; }
  const violations = validatePermissionMatrix(PERMISSIONS_MATRIX, [roleKey]);
  if (violations.length) { showToast("⛔ This role breaks the access policy (" + violations[0].rule + "); the Head of Underwriting must correct it before a review can confirm it.", "danger"); return false; }
  ACCESS_STATE.reviews.push({ role: roleKey, at: accessNow(), by: accessActor(), note, reference, digest: accessDigest(roleKey) });
  accessSave();
  showToast("Access review recorded for " + USER_ROLES_CONFIG[roleKey].title + ".", "success");
  renderAccessReviews();
  return true;
}

// ----------------------------------------------------------------------------
// 3. RENDERING
// ----------------------------------------------------------------------------
function renderRoleDefinitions() {
  const box = document.getElementById("roleDefinitionsContainer");
  if (!box) return;
  const violations = validatePermissionMatrix(PERMISSIONS_MATRIX, Object.keys(USER_ROLES_CONFIG));
  const list = items => '<ul style="margin:2px 0 8px 18px; padding:0;">' + items.map(i => "<li>" + accessEsc(i) + "</li>").join("") + "</ul>";
  const rows = Object.keys(USER_ROLES_CONFIG).map(k => {
    const r = USER_ROLES_CONFIG[k], d = ROLE_DEFINITIONS[k];
    const vs = violations.filter(v => v.role === k);
    if (!d) return '<tr><td>' + accessEsc(r.icon) + ' <strong>' + accessEsc(r.title) + '</strong><div class="text-xs text-muted">' + accessEsc(r.name) + '</div></td><td colspan="3"><span class="badge badge-warning text-xs">No written definition</span> <span class="text-xs text-muted">Add a definition before granting access (AC-2).</span></td></tr>';
    return '<tr><td style="min-width:150px;">' + accessEsc(r.icon) + ' <strong>' + accessEsc(r.title) + '</strong><div class="text-xs text-muted">' + accessEsc(r.name) + '</div><div class="text-xs text-muted">' + accessEsc(r.limitText) + '</div>' + (vs.length ? '<div class="badge badge-danger text-xs" style="margin-top:4px;">' + vs.length + ' policy breach(es)</div>' : "") + '</td>' +
      '<td class="text-xs">' + accessEsc(d.purpose) + '<div style="margin-top:6px;"><strong>Separation of duties:</strong> ' + accessEsc(d.separation) + '</div></td>' +
      '<td class="text-xs"><strong>May</strong>' + list(d.may) + '</td><td class="text-xs"><strong>Must not</strong>' + list(d.mustNot) + '</td></tr>';
  }).join("");
  const banner = violations.length
    ? '<div class="alert alert-danger text-xs"><i class="ph ph-warning"></i> <strong>' + violations.length + ' permission(s) break the access policy:</strong> ' + violations.slice(0, 4).map(v => accessEsc(v.rule + " " + v.text)).join(" · ") + (violations.length > 4 ? " …" : "") + '</div>'
    : '<div class="alert alert-success text-xs"><i class="ph ph-shield-check"></i> The permission table meets all ' + ACCESS_RULES.length + ' access-policy rules.</div>';
  box.innerHTML = '<div style="margin-top:16px;"><h4 style="margin:0 0 6px;">Role definitions and access policy</h4>' + banner +
    '<div class="rules-table-container" style="max-height:340px; overflow:auto;"><table class="data-table"><thead><tr><th>Role</th><th>Purpose</th><th>May</th><th>Must not</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<details style="margin-top:8px;"><summary class="text-xs" style="cursor:pointer;">Rules every permission change is checked against, and their basis</summary>' +
    '<ul class="text-xs" style="margin:6px 0 6px 18px;">' + ACCESS_RULES.map(r => "<li><strong>" + r.id + "</strong> (" + r.basis + "): " + accessEsc(r.text) + "</li>").join("") + '</ul>' +
    '<ul class="text-xs text-muted" style="margin:6px 0 6px 18px;">' + ACCESS_POLICY_BASIS.map(b => "<li><strong>" + accessEsc(b.ref) + ":</strong> " + accessEsc(b.text) + "</li>").join("") + '</ul>' +
    '<p class="text-xs text-muted">No federal body defines underwriting roles; insurance is regulated by the states. These are the federal and industry reference points the policy is built on, to be confirmed by Compliance against the applicable state law. The ' + ACCESS_REVIEW_DAYS + '-day review interval is a placeholder.</p></details></div>';
}

function renderAccessReviews() {
  let box = document.getElementById("accessReviewContainer");
  if (!box) {
    const content = document.getElementById("auditLogPageContent");        // the Audit Log page carries the reviews
    if (!content) return;
    box = document.createElement("div"); box.id = "accessReviewContainer"; content.appendChild(box);
  }
  if (!hasPermission("accessReview", "view")) { box.innerHTML = ""; return; }
  const canRecord = hasPermission("accessReview", "approve");
  const label = { never: ["badge-danger", "Never reviewed"], current: ["badge-success", "Current"], due: ["badge-warning", "Review due"], changed: ["badge-danger", "Permissions changed since review"] };
  const rows = Object.keys(USER_ROLES_CONFIG).map(k => {
    const r = USER_ROLES_CONFIG[k], s = accessReviewStatus(k), ui = label[s.status];
    const form = canRecord ? '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;"><input id="accessNote_' + k + '" class="form-control" style="width:240px;" placeholder="What was reviewed and the outcome"><input id="accessRef_' + k + '" class="form-control" style="width:150px;" placeholder="Reference"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="accessReviewClicked(\'' + k + '\')">Record review</button></div>' : "";
    return '<tr><td>' + accessEsc(r.icon) + ' <strong>' + accessEsc(r.title) + '</strong><div class="text-xs text-muted">' + accessEsc(r.name) + '</div></td><td><span class="badge ' + ui[0] + ' text-xs">' + ui[1] + '</span>' + (s.last ? '<div class="text-xs text-muted">' + accessEsc(s.last.at) + ' · ' + accessEsc(s.last.by) + '<br>' + accessEsc(s.last.note) + ' (' + accessEsc(s.last.reference) + ')</div>' + (s.dueOn ? '<div class="text-xs text-muted">Next review by ' + accessEsc(s.dueOn) + '</div>' : "") : "") + form + '</td></tr>';
  }).join("");
  const changes = (ACCESS_STATE.changes || []).slice(-8).reverse().map(c => '<li class="text-xs">' + accessEsc(c.at) + ' · ' + accessEsc(c.by) + ': ' + accessEsc(c.summary) + '</li>').join("");
  box.innerHTML = '<div class="card mt-3"><div class="card-header"><h3><i class="ph ph-identification-badge"></i> Access reviews</h3><span class="badge badge-info">Every ' + ACCESS_REVIEW_DAYS + ' days</span></div><div class="card-body">' +
    '<p class="text-xs text-muted">The Compliance Officer re-confirms each role\'s access on a fixed cycle, and again whenever its permissions change. The Head of Underwriting, who sets access, cannot record the review.</p>' +
    '<div class="rules-table-container" style="max-height:none; overflow:visible;"><table class="data-table"><thead><tr><th>Role</th><th>Review</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (changes ? '<h4 style="margin:12px 0 4px;">Recent permission changes</h4><ul style="margin:0 0 0 18px; padding:0;">' + changes + '</ul>' : '') + '</div></div>';
}
window.accessReviewClicked = function (k) { accessRecordReview(k); };

// ----------------------------------------------------------------------------
// 4. HOOKS
// ----------------------------------------------------------------------------
(function installAccessPolicy() {
  accessLoad();
  if (typeof AUDIT_ACTION_META !== "undefined") AUDIT_ACTION_META.access_review_recorded = { label: "Access Review Recorded", icon: "ph-identification-badge", badge: "badge-info", outcome: "outcome-approve" };

  // Integrating API loads product definitions (eligibility rules, rating set-up): guideline ownership, not case work.
  const origApi = window.showIntegratingApiPage;
  if (typeof origApi === "function") {
    window.showIntegratingApiPage = function () {
      if (!hasPermission("appetiteRules", "edit")) { denyPermission("appetiteRules", "edit"); if (typeof showIntakePage === "function") showIntakePage(); return; }
      return origApi.apply(this, arguments);
    };
  }
  const origRole = window.changeUserRole;
  if (typeof origRole === "function") {
    window.changeUserRole = function () {
      const r = origRole.apply(this, arguments);
      const nav = document.getElementById("navItemIntegratingApi");
      if (nav) nav.style.display = hasPermission("appetiteRules", "edit") ? "" : "none";
      return r;
    };
  }

  // The permission table editor: show the definitions and the policy status beneath it.
  const origRender = window.renderPermissionMatrixEditor;
  if (typeof origRender === "function") {
    window.renderPermissionMatrixEditor = function () {
      const r = origRender.apply(this, arguments);
      try {
        const host = document.getElementById("permissionMatrixEditorContainer");
        if (host && !document.getElementById("roleDefinitionsContainer")) { const d = document.createElement("div"); d.id = "roleDefinitionsContainer"; host.parentNode.insertBefore(d, host.nextSibling); }
        renderRoleDefinitions();
      } catch (e) { console.warn("Role definitions failed:", e); }
      return r;
    };
  }

  // Saving: refuse a change that creates a new policy breach; log the change that is made.
  const origSave = window.savePermissionMatrixEditor;
  if (typeof origSave === "function") {
    window.savePermissionMatrixEditor = function () {
      if (currentUserRole !== "admin") return origSave.apply(this, arguments);
      const resource = userMasterSelectedResource, proposed = JSON.parse(JSON.stringify(PERMISSIONS_MATRIX)), changes = [];
      document.querySelectorAll(".rbac-editor-cb").forEach(cb => {
        const p = proposed[cb.dataset.role] && proposed[cb.dataset.role][resource];
        if (p && p[cb.dataset.action] !== cb.checked) { changes.push(cb.dataset.role + " " + cb.dataset.action + " " + resource + ": " + (p[cb.dataset.action] ? "on" : "off") + " → " + (cb.checked ? "on" : "off")); p[cb.dataset.action] = cb.checked; }
      });
      const before = new Set(validatePermissionMatrix(PERMISSIONS_MATRIX).map(accessViolationKey));
      const fresh = validatePermissionMatrix(proposed).filter(v => !before.has(accessViolationKey(v)));
      if (fresh.length) {
        showToast("⛔ Not saved: " + fresh[0].rule + " — " + fresh[0].text + (fresh.length > 1 ? " (and " + (fresh.length - 1) + " more)" : ""), "danger");
        return;
      }
      const r = origSave.apply(this, arguments);
      if (changes.length) {
        ACCESS_STATE.changes.push({ at: accessNow(), by: accessActor(), summary: changes.join("; ") });
        accessSave();
        if (typeof renderRoleDefinitions === "function") renderRoleDefinitions();
      }
      return r;
    };
  }

  // The Audit Log page carries the access reviews (the Compliance Officer's page).
  const origAudit = window.showAuditLogPage;
  if (typeof origAudit === "function") {
    window.showAuditLogPage = function () {
      const r = origAudit.apply(this, arguments);
      try {
        renderAccessReviews();
      } catch (e) { console.warn("Access reviews failed:", e); }
      return r;
    };
  }
})();

window.renderRoleDefinitions = renderRoleDefinitions; window.renderAccessReviews = renderAccessReviews;
window.validatePermissionMatrix = validatePermissionMatrix; window.accessRecordReview = accessRecordReview;
