/**
 * ============================================================================
 * RECORD SHARES: ANOTHER PARTY SEES A CASE ONLY BY GRANT, AND IT IS LOGGED
 * ----------------------------------------------------------------------------
 * Producers, program administrators and carrier auditors see the cases inside their scope (their agency, their program's lines and states,
 * the carrier's paper). A case outside that scope was simply invisible. A record share is the one way to let a party see a case outside
 * its scope:
 *
 *   SHARE     one case, shared by its owner with a grantee (an agency, a program or a carrier, by name), for a period, at an access
 *             level (read), under a named distribution or program agreement. It can be revoked, with a reason; a revoked share stays on
 *             the record. Only the Head of Underwriting, or someone who may approve workflow steps, grants or revokes.
 *   VISIBLE   a user whose scope is the grantee's sees the case in lists and can open it, for as long as the share is in force. Nothing
 *             is copied: the share is a pointer, and the data stays on the owner's record.
 *   LOGGED    when a user opens a case through a share, the case's decision log says so: who, on behalf of which owner, under which
 *             share and agreement. Opening a case outside scope with no share is refused and logged, as before.
 *
 * LIMIT: this is a single browser workspace, not separate tenants. The share governs what a persona may see; it does not isolate data
 * between companies, which a production build does on the server with a row-level policy per tenant.
 * ============================================================================
 */

const SH_KEY = "FUT_UW_SHARES_V1";
const SH_KINDS = { agency: "Agency", program: "Program", carrier: "Carrier" };
const SH_LEVELS = { read: "Read" };
var SH = { shares: [], seq: 0 };
try { const r = JSON.parse(localStorage.getItem(SH_KEY)); if (r && Array.isArray(r.shares)) SH = Object.assign(SH, r); } catch (e) { /* none yet */ }
function shSave() { try { localStorage.setItem(SH_KEY, JSON.stringify(SH)); } catch (e) { /* keep for this session */ } }
function shCan() { return (typeof canManageAssignments === "function" && canManageAssignments()) || hasPermission("workflow", "approve"); }
function shOwner(sub) { return sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "") || "the owner"; }

/** f: { granteeKind, grantee, agreementRef, effectiveFrom, effectiveTo, level } */
function shGrant(sub, f) {
  if (!shCan()) { denyPermission("workflow", "approve"); return { ok: false, error: "permission" }; }
  const e = [], iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!SH_KINDS[f.granteeKind]) e.push("choose agency, program or carrier");
  if (String(f.grantee || "").trim().length < 2) e.push("name the party the case is shared with");
  if (String(f.agreementRef || "").trim().length < 3) e.push("name the agreement the share is made under");
  if (!iso.test(f.effectiveFrom || "")) e.push("enter the date the share starts");
  if (f.effectiveTo && (!iso.test(f.effectiveTo) || f.effectiveTo < f.effectiveFrom)) e.push("the end date must not be before the start");
  if (!SH_LEVELS[f.level || "read"]) e.push("choose the access level");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  if (SH.shares.some(s => s.status === "active" && s.caseId === sub.id && s.granteeKind === f.granteeKind && s.grantee.toLowerCase() === String(f.grantee).trim().toLowerCase() && ucInForce(s.effectiveFrom, s.effectiveTo))) return { ok: false, error: "duplicate" };
  const s = { id: "SHR-" + (++SH.seq), caseId: sub.id, owner: shOwner(sub), granteeKind: f.granteeKind, grantee: String(f.grantee).trim(), agreementRef: String(f.agreementRef).trim(), level: f.level || "read", effectiveFrom: f.effectiveFrom, effectiveTo: f.effectiveTo || "", status: "active", grantedBy: ucActor(), grantedAt: nowStamp() };
  SH.shares.push(s); shSave();
  logDecision(sub, sub.currentStep || 1, "record_shared", s.id + ": shared with " + SH_KINDS[s.granteeKind].toLowerCase() + " " + s.grantee + " (" + s.level + ") under " + s.agreementRef + ", from " + s.effectiveFrom + (s.effectiveTo ? " to " + s.effectiveTo : "") + ".");
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, share: s };
}
function shRevoke(id, reason) {
  if (!shCan()) { denyPermission("workflow", "approve"); return { ok: false, error: "permission" }; }
  const s = SH.shares.find(x => x.id === id);
  if (!s || s.status !== "active") return { ok: false, error: "state" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  s.status = "revoked"; s.revokedBy = ucActor(); s.revokedAt = nowStamp(); s.revokedReason = String(reason).trim(); shSave();
  const sub = SUBMISSIONS_DATASET.find(x => x.id === s.caseId);
  if (sub) { logDecision(sub, sub.currentStep || 1, "record_share_revoked", s.id + " revoked: " + s.revokedReason); if (typeof persistAppState === "function") persistAppState(); }
  return { ok: true };
}
/** The share, if any, that lets this persona see this case today. */
function shAllows(roleKey, sub, day) {
  const r = typeof EXTERNAL_ROLES !== "undefined" ? EXTERNAL_ROLES[roleKey] : null;
  if (!r || !sub || !r.scope) return null;
  const sc = r.scope;
  return SH.shares.find(s => s.status === "active" && s.caseId === sub.id && ucInForce(s.effectiveFrom, s.effectiveTo, day)
    && ((s.granteeKind === "agency" && sc.kind === "agency" && extSameAgency(s.grantee, sc.agency)) || (s.granteeKind === "program" && sc.kind === "program" && String(s.grantee).toLowerCase() === String(sc.name || "").toLowerCase()) || (s.granteeKind === "carrier" && sc.kind === "carrier" && String(s.grantee).toLowerCase() === String(sc.carrier || "").toLowerCase()))) || null;
}
(function shInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.record_shared = { label: "Case Shared", icon: "ph-share-network", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.record_share_revoked = { label: "Case Share Revoked", icon: "ph-prohibit", badge: "badge-warning", outcome: "outcome-refer" };
    AUDIT_ACTION_META.access_via_share = { label: "Opened Through a Share", icon: "ph-eye", badge: "badge-info", outcome: "outcome-comm" };
  }
  const orig = window.extCanSee;
  if (typeof orig === "function") window.extCanSee = function (roleKey, sub) { return orig.apply(this, arguments) || !!shAllows(roleKey, sub); };
  // opening a case through a share is logged, once a day for each person and share
  const open = window.openCaseAtCurrentStep;
  if (typeof open === "function") window.openCaseAtCurrentStep = function (id) {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === id);
    if (sub && typeof orig === "function" && typeof extIsRestricted === "function" && extIsRestricted(currentUserRole)) {
      const s = !orig(currentUserRole, sub) ? shAllows(currentUserRole, sub) : null;
      if (s) {
        const key = s.id + "|" + currentUserRole + "|" + todayIso();
        if (!(sub.shareAccessLog || []).some(x => x.key === key)) {
          if (!sub.shareAccessLog) sub.shareAccessLog = [];
          sub.shareAccessLog.push({ key: key, shareId: s.id });
          logDecision(sub, sub.currentStep || 1, "access_via_share", extActorName() + " opened the case on behalf of " + s.owner + ", through share " + s.id + " (agreement " + s.agreementRef + ").");
          if (typeof persistAppState === "function") persistAppState();
        }
      }
    }
    return open.apply(this, arguments);
  };
})();

function shHtml() {
  const rows = SH.shares.slice().reverse().map(s => `<tr><td>${escHtml(s.id)}</td><td>${escHtml(s.caseId)}<div class="p1-note">owner ${escHtml(s.owner)}</div></td><td>${escHtml(SH_KINDS[s.granteeKind])}: ${escHtml(s.grantee)}<div class="p1-note">${escHtml(SH_LEVELS[s.level])} · ${escHtml(s.agreementRef)}</div></td><td>${escHtml(s.effectiveFrom)} to ${escHtml(s.effectiveTo || "open")}</td><td><span class="badge ${s.status === "active" ? "badge-success" : "badge-light"}">${escHtml(s.status)}</span>${s.revokedReason ? `<div class="p1-note">${escHtml(s.revokedBy)}: ${escHtml(s.revokedReason)}</div>` : ""}</td><td>${s.status === "active" && shCan() ? `<button class="btn btn-xs btn-outline" onclick="shRevokeUi('${s.id}')">Revoke</button>` : ""}</td></tr>`).join("");
  return SH.shares.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Share</th><th>Case</th><th>Shared with</th><th>Period</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No case is shared outside its owner's scope. A share is made from the case's Underwriting record.</div>`;
}
function shCaseHtml(sub) {
  const list = SH.shares.filter(s => s.caseId === sub.id), can = shCan();
  const form = can ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="sh_k">Share with</label><select class="form-control" id="sh_k">${Object.keys(SH_KINDS).map(k => `<option value="${k}">${SH_KINDS[k]}</option>`).join("")}</select></div><div class="form-group"><label for="sh_g">Name</label><input class="form-control" id="sh_g"></div><div class="form-group"><label for="sh_a">Agreement</label><input class="form-control" id="sh_a"></div><div class="form-group"><label for="sh_f">From</label><input type="date" class="form-control" id="sh_f" value="${todayIso()}"></div><div class="form-group"><label for="sh_t">To (optional)</label><input type="date" class="form-control" id="sh_t"></div></div><button class="btn btn-xs btn-outline" onclick="shGrantUi()">Share this case</button>` : "";
  return (list.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Share</th><th>With</th><th>Agreement</th><th>Period</th><th>Status</th></tr></thead><tbody>${list.map(s => `<tr><td>${escHtml(s.id)}</td><td>${escHtml(SH_KINDS[s.granteeKind])}: ${escHtml(s.grantee)}</td><td>${escHtml(s.agreementRef)}</td><td>${escHtml(s.effectiveFrom)} to ${escHtml(s.effectiveTo || "open")}</td><td>${escHtml(s.status)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="mw-empty">This case is not shared outside its own scope.</div>') + form;
}
function shGrantUi() { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = shGrant(sub, { granteeKind: ucV("sh_k"), grantee: ucV("sh_g"), agreementRef: ucV("sh_a"), effectiveFrom: ucV("sh_f"), effectiveTo: ucV("sh_t") }); showToast(r.ok ? "✅ Shared." : "⛔ " + (r.errors ? r.errors.join("; ") : ({ duplicate: "That share already exists.", permission: "You do not have the right to share cases." }[r.error] || r.error)), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function shRevokeUi(id) { const why = window.prompt("Why is the share revoked? (at least 10 characters)", ""); if (why === null) return; const r = shRevoke(id, why); showToast(r.ok ? "✅ Revoked." : "⛔ " + (r.error === "reason" ? "Give a reason of at least 10 characters." : r.error), r.ok ? "success" : "danger"); if (typeof ucRender === "function" && currentPage === "uwcontrols") ucRender(); else if (typeof cfRender === "function") cfRender(); }
ucRegisterTab("shares", "Record shares", "ph-share-network", shHtml, () => SH.shares.filter(s => s.status === "active").length);
if (typeof urRegisterSection === "function") urRegisterSection("shares", "Sharing", shCaseHtml);
