/**
 * ============================================================================
 * POLICIES: EXPIRING AND EXPIRED, EXPIRATION LETTERS, CLAIM RENEWALS, ENDORSEMENT REQUESTS, TRANSFERS, UNDERWRITER CHANGE,
 * CANCELLATION REPORT
 * ----------------------------------------------------------------------------
 * One page for the book of bound policies, beside the per-case Policy Changes and Renewals:
 *
 *   EXPIRING & EXPIRED   every bound policy by expiry: expiring in 30 / 60 / 90 / 120 days, or already expired (with how it
 *                        ended: renewed, non-renewed, lapsed). Select several for a BATCH: start the renewal review, or
 *                        issue EXPIRATION LETTERS (one letter per policy, wording by where the policy stands; downloaded as
 *                        one printable file; each letter is recorded). Renewal decisions stay one policy at a time, because each
 *                        needs its own reason, notice date and proof of mailing.
 *   CLAIM RENEWALS       a policy with at least RN_CLAIMS_APPROVAL.minClaims claims cannot be renewed (or renewed with
 *                        conditions) until a person with renewal authority has approved it, with a note. The threshold is a
 *                        PLACEHOLDER for the carrier's guideline.
 *   ENDORSEMENT REQUESTS a change a broker or insured asks for after bind, kept with a status (Received, In review, Approved,
 *                        Issued, Declined, Withdrawn), an assignee, a due date and the date asked for. A request is closed as
 *                        Issued only against an endorsement actually issued on that policy.
 *   TRANSFERS            a policy moved to another carrier or market: requested, approved by someone other than the person who
 *                        asked, then completed. A completed transfer takes the policy off the renewal pipeline.
 *   UNDERWRITERS         change the underwriter on a bound policy, with a reason; the Head of Underwriting alone. The history is kept.
 *   CANCELLATION REPORT  every cancellation, rescission and reinstatement across the book, by date and status, as CSV.
 *
 * The data lives on the cases (sub.endorsementRequests, sub.transfer, sub.uwHistory, sub.renewal) and is built into the
 * existing renewal and policy-change records; nothing is invented. There is no server.
 * ============================================================================
 */

var RN_CLAIMS_APPROVAL = { minClaims: 3 };   // placeholder: confirm with the carrier's renewal guideline
const PO_REQ_STATUS = ["Received", "In review", "Approved", "Issued", "Declined", "Withdrawn"];
const PO_REQ_NEXT = { Received: ["In review", "Declined", "Withdrawn"], "In review": ["Approved", "Declined", "Withdrawn"], Approved: ["Issued", "Declined", "Withdrawn"], Issued: [], Declined: [], Withdrawn: [] };
const PO_REQ_CHANNELS = ["Email", "Phone", "Broker portal", "Letter", "Other"];
var PO = { tab: "claims", reqFilter: "open", reqAssignee: "", cFrom: "", cTo: "", cStatus: "", cField: "effective", claimFilter: "all" };

function poSave() { if (typeof persistAppState === "function") persistAppState(); }
function poRead(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function poDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s)); }
function poLog(sub, decision, notes) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 1, decision, by: actorLabel(), at: nowStamp(), notes }); poSave(); }
function poMoney(n) { return n === null || n === undefined || isNaN(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function poSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function poVisible(s) { return canSeeAllSubmissions() || isMyCase(s); }

if (typeof AUDIT_ACTION_META !== "undefined") {
  const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
  AUDIT_ACTION_META.claim_renewal_requested = m("Claim Renewal Approval Requested", "ph-hand-waving", "badge-warning", "outcome-refer");
  AUDIT_ACTION_META.claim_renewal_approved = m("Claim Renewal Approved", "ph-check-circle", "badge-success", "outcome-approve");
  AUDIT_ACTION_META.claim_renewal_rejected = m("Claim Renewal Not Approved", "ph-x-circle", "badge-danger", "outcome-decline");
  AUDIT_ACTION_META.endorsement_request = m("Endorsement Request", "ph-pencil-line", "badge-info", "outcome-comm");
  AUDIT_ACTION_META.policy_transfer = m("Policy Transfer", "ph-arrows-left-right", "badge-warning", "outcome-refer");
  AUDIT_ACTION_META.underwriter_changed = m("Underwriter Changed", "ph-user-switch", "badge-light", "outcome-comm");
}

// ----------------------------------------------------------------------------
// 2. CLAIM RENEWALS
// ----------------------------------------------------------------------------
function poClaims(sub) { return (sub.losses || []).length; }
function poClaimIncurred(sub) { return (sub.losses || []).reduce((n, l) => n + (Number(l.incurred !== undefined ? l.incurred : l.amount) || 0), 0); }
/** A renewal of this policy needs claim approval first. */
function poClaimRenewalRequired(sub) { return RN_CLAIMS_APPROVAL.minClaims > 0 && poClaims(sub) >= RN_CLAIMS_APPROVAL.minClaims; }
function poClaimStatus(sub) { return (sub.renewal && sub.renewal.claimApproval && sub.renewal.claimApproval.status) || "none"; }
function poClaimRequest(sub, note) {
  if (!hasPermission("renewals", "edit")) { denyPermission("renewals", "edit"); return { ok: false, message: "permission" }; }
  if (!poClaimRenewalRequired(sub)) return { ok: false, message: "This policy has fewer than " + RN_CLAIMS_APPROVAL.minClaims + " claims, so no approval is needed." };
  if (["pending", "approved"].indexOf(poClaimStatus(sub)) > -1) return { ok: false, message: "Approval is already " + poClaimStatus(sub) + "." };
  if (String(note || "").trim().length < 10) return { ok: false, message: "Describe the claims and why renewal is proposed (at least 10 characters)." };
  const r = rnRecord(sub);
  r.claimApproval = { status: "pending", claims: poClaims(sub), incurred: poClaimIncurred(sub), requestedBy: actorLabel(), requestedRole: currentUserRole, requestedAt: nowStamp(), note: String(note).trim() };
  poLog(sub, "claim_renewal_requested", `Approval requested to renew policy ${rnFacts(sub).policyNumber} with ${poClaims(sub)} claim(s): ${r.claimApproval.note}`);
  if (typeof rnPersist === "function") rnPersist();
  return { ok: true };
}
function poClaimDecide(sub, approve, note) {
  if (!hasPermission("renewals", "override")) { denyPermission("renewals", "override"); return { ok: false, message: "permission" }; }
  const r = rnRecord(sub), c = r.claimApproval;
  if (!c || c.status !== "pending") return { ok: false, message: "There is no request waiting." };
  if (c.requestedRole === currentUserRole) return { ok: false, message: "A different person must decide: you asked for this approval." };
  if (String(note || "").trim().length < 10) return { ok: false, message: "Add your reasoning (at least 10 characters)." };
  c.status = approve ? "approved" : "rejected"; c.decidedBy = actorLabel(); c.decidedAt = nowStamp(); c.decisionNote = String(note).trim();
  poLog(sub, approve ? "claim_renewal_approved" : "claim_renewal_rejected", `Renewal ${approve ? "approved" : "not approved"} for policy ${rnFacts(sub).policyNumber}: ${c.decisionNote}`);
  if (typeof rnPersist === "function") rnPersist();
  return { ok: true };
}
function poClaimsHtml() {
  const list = rnPolicies().filter(p => poVisible(p.sub) && poClaims(p.sub) > 0 && ["renewed", "non_renewed", "lapsed", "non_renewal_notified"].indexOf(p.stage) < 0);
  const can = hasPermission("renewals", "edit"), canDecide = hasPermission("renewals", "override");
  if (!list.length) return `<div class="mw-empty">No open renewal has claims on it. Policies with claims appear here; those with ${RN_CLAIMS_APPROVAL.minClaims} or more need approval before they can be renewed.</div>`;
  return `<div class="p1-note" style="margin-bottom:8px;">A renewal with ${RN_CLAIMS_APPROVAL.minClaims} or more claims needs approval from someone with renewal authority, who is not the person who asked. The threshold is a placeholder for the carrier's guideline.</div>` +
    `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Insured</th><th>Policy</th><th>Expires</th><th>Claims</th><th>Incurred</th><th>Approval</th><th></th></tr></thead><tbody>${list.map(p => {
      const st = poClaimStatus(p.sub), need = poClaimRenewalRequired(p.sub), c = (p.sub.renewal || {}).claimApproval;
      const badge = { none: need ? '<span class="badge badge-warning">Needed</span>' : '<span class="badge badge-light">Not needed</span>', pending: '<span class="badge badge-warning">Waiting</span>', approved: '<span class="badge badge-success">Approved</span>', rejected: '<span class="badge badge-danger">Not approved</span>' }[st];
      let act = "";
      if (need && st === "none" && can) act = `<input class="form-control" id="po_cn_${escHtml(p.sub.id)}" placeholder="Why renew despite the claims" style="width:190px;display:inline-block;"> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="poClaimAsk('${escHtml(p.sub.id)}')">Ask for approval</button>`;
      else if (st === "pending" && canDecide) act = `<input class="form-control" id="po_cn_${escHtml(p.sub.id)}" placeholder="Reasoning" style="width:150px;display:inline-block;"> <button class="btn btn-xs btn-success" style="width:auto;" onclick="poClaimDo('${escHtml(p.sub.id)}', true)">Approve</button> <button class="btn btn-xs btn-outline-danger" style="width:auto;" onclick="poClaimDo('${escHtml(p.sub.id)}', false)">Decline</button>`;
      else if (c && c.decisionNote) act = `<span class="p1-note">${escHtml(c.decidedBy)}: ${escHtml(c.decisionNote)}</span>`;
      return `<tr><td><strong>${escHtml(p.sub.insured)}</strong><div class="p1-note">${escHtml(p.sub.id)}</div></td><td class="font-mono">${escHtml(p.f.policyNumber)}</td><td>${escHtml(p.f.expiration)}</td><td>${poClaims(p.sub)}</td><td>${poMoney(poClaimIncurred(p.sub))}</td><td>${badge}</td><td>${act}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}
function poClaimAsk(id) { const sub = poSub(id); if (!sub) return; const r = poClaimRequest(sub, poRead("po_cn_" + id)); if (r.message !== "permission") showToast(r.ok ? "✅ Approval requested." : "⛔ " + r.message, r.ok ? "success" : "danger"); poRender(); }
function poClaimDo(id, approve) { const sub = poSub(id); if (!sub) return; const r = poClaimDecide(sub, approve, poRead("po_cn_" + id)); if (r.message !== "permission") showToast(r.ok ? (approve ? "✅ Approved." : "Not approved.") : "⛔ " + r.message, r.ok ? "success" : "danger"); poRender(); }

// ----------------------------------------------------------------------------
// 3. ENDORSEMENT REQUESTS
// ----------------------------------------------------------------------------
function poReqs(sub) { if (!sub.endorsementRequests) sub.endorsementRequests = []; return sub.endorsementRequests; }
/** Every request on every visible case, each { sub, req }. */
function poAllReqs() { const out = []; SUBMISSIONS_DATASET.filter(poVisible).forEach(s => (s.endorsementRequests || []).forEach(r => out.push({ sub: s, req: r }))); return out; }
function poReqOpen(r) { return ["Received", "In review", "Approved"].indexOf(r.status) > -1; }
function poAddReq(sub, f) {
  if (!sub) return { ok: false, message: "Choose the policy." };
  if (!hasPermission("policyChanges", "edit")) { denyPermission("policyChanges", "edit"); return { ok: false, message: "permission" }; }
  if (!policyIsBound(sub)) return { ok: false, message: "The policy is not bound, so it cannot be endorsed." };
  if (["cancelled", "transferred"].indexOf(sub.policyState) > -1) return { ok: false, message: "The policy is " + sub.policyState + "." };
  if (!PC_ENDORSEMENT_TYPES.some(t => t.key === f.type)) return { ok: false, message: "Choose what the change is." };
  if (String(f.description || "").trim().length < 10) return { ok: false, message: "Describe the change (at least 10 characters)." };
  if (String(f.requestedBy || "").trim().length < 2) return { ok: false, message: "Enter who asked for it." };
  if (PO_REQ_CHANNELS.indexOf(f.channel) < 0) return { ok: false, message: "Choose how it was received." };
  if (!poDate(f.effective)) return { ok: false, message: "Enter the date the change should take effect." };
  const facts = typeof pcFacts === "function" ? pcFacts(sub) : {};
  if (facts.expiration && f.effective > facts.expiration) return { ok: false, message: "The date is after the policy expires (" + facts.expiration + ")." };
  if (f.due && !poDate(f.due)) return { ok: false, message: "Enter a valid due date." };
  if (!USER_ROLES_CONFIG[f.assignee]) return { ok: false, message: "Choose who will handle it." };
  const list = poReqs(sub), rec = { id: "ENR-" + sub.id.replace(/^SUB-/, "") + "-" + (list.length + 1), type: f.type, typeLabel: PC_ENDORSEMENT_TYPES.find(t => t.key === f.type).label, description: String(f.description).trim(), requestedBy: String(f.requestedBy).trim(), channel: f.channel,
    effective: f.effective, due: f.due || null, assignee: f.assignee, status: "Received", history: [{ status: "Received", by: actorLabel(), at: nowStamp(), note: "" }], endorsementId: null, createdAt: nowStamp() };
  list.push(rec);
  poLog(sub, "endorsement_request", `Endorsement request ${rec.id} received (${rec.typeLabel}) from ${rec.requestedBy} by ${rec.channel.toLowerCase()}; effective ${rec.effective}. Assigned to ${typeof USER_ROLES_CONFIG[rec.assignee] !== "undefined" ? USER_ROLES_CONFIG[rec.assignee].name : rec.assignee}.`);
  if (typeof notify === "function" && rec.assignee !== currentUserRole) notify(rec.assignee, { kind: "assignment", title: "Endorsement request: " + sub.insured, text: `${rec.typeLabel}, effective ${rec.effective}.`, caseId: sub.id, key: "enr-" + rec.id });
  return { ok: true, req: rec };
}
/** Moves a request on. Declined needs a reason; Issued needs the endorsement actually issued on the policy. */
function poSetReq(sub, id, status, note, endorsementId) {
  const r = poReqs(sub).find(x => x.id === id);
  if (!r) return { ok: false, message: "Request not found." };
  if (!hasPermission("policyChanges", status === "Approved" || status === "Issued" ? "approve" : "edit")) { denyPermission("policyChanges", status === "Approved" || status === "Issued" ? "approve" : "edit"); return { ok: false, message: "permission" }; }
  if (PO_REQ_NEXT[r.status].indexOf(status) < 0) return { ok: false, message: "A request that is " + r.status.toLowerCase() + " cannot become " + status.toLowerCase() + "." };
  if ((status === "Declined" || status === "Withdrawn") && String(note || "").trim().length < 5) return { ok: false, message: "Give a reason (at least 5 characters)." };
  if (status === "Issued") {
    const ev = (sub.policyChanges || []).find(c => c.id === endorsementId && c.type === "endorsement");
    if (!ev) return { ok: false, message: "Choose the endorsement that was issued on this policy." };
    if (poAllReqs().some(x => x.req.endorsementId === endorsementId)) return { ok: false, message: "That endorsement is already linked to another request." };
    r.endorsementId = endorsementId;
  }
  r.status = status; r.history.push({ status, by: actorLabel(), at: nowStamp(), note: String(note || "").trim() });
  poLog(sub, "endorsement_request", `Request ${r.id} ${status.toLowerCase()}${r.endorsementId && status === "Issued" ? " (endorsement " + r.endorsementId + ")" : ""}${note ? ": " + String(note).trim() : ""}.`);
  return { ok: true, req: r };
}
function poReassignReq(sub, id, role) {
  const r = poReqs(sub).find(x => x.id === id);
  if (!r || !poReqOpen(r) || !USER_ROLES_CONFIG[role] || r.assignee === role) return false;
  if (!hasPermission("policyChanges", "edit")) return false;
  r.assignee = role; r.history.push({ status: r.status, by: actorLabel(), at: nowStamp(), note: "Reassigned to " + USER_ROLES_CONFIG[role].name }); poSave();
  if (typeof notify === "function" && role !== currentUserRole) notify(role, { kind: "assignment", title: "Endorsement request moved to you: " + sub.insured, text: r.typeLabel, caseId: sub.id, key: "enr-" + r.id + "-" + role });
  return true;
}
function poReqHtml() {
  const roles = Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name), bound = SUBMISSIONS_DATASET.filter(s => poVisible(s) && policyIsBound(s) && ["cancelled", "transferred"].indexOf(s.policyState) < 0);
  const can = hasPermission("policyChanges", "edit");
  let list = poAllReqs();
  if (PO.reqFilter === "open") list = list.filter(x => poReqOpen(x.req)); else if (PO.reqFilter !== "all") list = list.filter(x => x.req.status === PO.reqFilter);
  if (PO.reqAssignee) list = list.filter(x => x.req.assignee === PO.reqAssignee);
  list.sort((a, b) => (a.req.due || "9999").localeCompare(b.req.due || "9999") || b.req.createdAt.localeCompare(a.req.createdAt));
  const form = can ? `<details class="card"${poAllReqs().length ? "" : " open"}><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> Record a request</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group mw-wide"><label for="po_rsub">Policy</label><select class="form-control" id="po_rsub">${bound.length ? bound.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.insured)} · ${escHtml(s.pasSync.policyNumber)}</option>`).join("") : '<option value="">No bound policy</option>'}</select></div>
    <div class="form-group"><label for="po_rtype">Change</label><select class="form-control" id="po_rtype">${PC_ENDORSEMENT_TYPES.map(t => `<option value="${t.key}">${escHtml(t.label)}</option>`).join("")}</select></div><div class="form-group"><label for="po_rby">Asked by</label><input class="form-control" id="po_rby" placeholder="Name at the broker or insured"></div>
    <div class="form-group"><label for="po_rch">Received by</label><select class="form-control" id="po_rch">${PO_REQ_CHANNELS.map(c => `<option>${c}</option>`).join("")}</select></div><div class="form-group"><label for="po_reff">Effective</label><input type="date" class="form-control" id="po_reff" value="${todayIso()}"></div>
    <div class="form-group"><label for="po_rdue">Due</label><input type="date" class="form-control" id="po_rdue"></div><div class="form-group"><label for="po_rass">Handled by</label><select class="form-control" id="po_rass">${roles.map(k => `<option value="${k}"${k === currentUserRole ? " selected" : ""}>${escHtml(USER_ROLES_CONFIG[k].name)}</option>`).join("")}</select></div>
    <div class="form-group mw-wide"><label for="po_rdesc">What is being asked</label><input class="form-control" id="po_rdesc" placeholder="e.g. Add 2023 Freightliner VIN …; remove unit 4"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="poAddReqUi()">Record request</button></div></div></details>` : "";
  const bar = `<div class="mw-dates" style="margin-bottom:10px;"><label>Status <select class="form-control" onchange="poReqFilter(this.value)"><option value="open"${PO.reqFilter === "open" ? " selected" : ""}>Open</option><option value="all"${PO.reqFilter === "all" ? " selected" : ""}>All</option>${PO_REQ_STATUS.map(s => `<option${PO.reqFilter === s ? " selected" : ""}>${s}</option>`).join("")}</select></label>
    <label>Handled by <select class="form-control" onchange="poReqAssignee(this.value)"><option value="">Anyone</option>${roles.map(k => `<option value="${k}"${PO.reqAssignee === k ? " selected" : ""}>${escHtml(USER_ROLES_CONFIG[k].name)}</option>`).join("")}</select></label></div>`;
  const rows = list.map(x => {
    const r = x.req, past = poReqOpen(r) && r.due && r.due < todayIso(), next = PO_REQ_NEXT[r.status];
    const ends = (x.sub.policyChanges || []).filter(c => c.type === "endorsement" && !poAllReqs().some(y => y.req.endorsementId === c.id));
    const acts = next.length && can ? `<select class="form-control" id="po_rn_${escHtml(r.id)}" style="width:120px;display:inline-block;">${next.map(s => `<option>${s}</option>`).join("")}</select> <select class="form-control" id="po_re_${escHtml(r.id)}" style="width:130px;display:inline-block;" aria-label="Endorsement issued"><option value="">Endorsement…</option>${ends.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.id)}</option>`).join("")}</select> <input class="form-control" id="po_rw_${escHtml(r.id)}" placeholder="Reason / note" style="width:130px;display:inline-block;"> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="poReqMove('${escHtml(x.sub.id)}', '${escHtml(r.id)}')">Move</button>` : "";
    return `<tr class="${past ? "mw-past" : ""}"><td><strong>${escHtml(r.id)}</strong><div class="p1-note">${escHtml(x.sub.insured)} · ${escHtml((x.sub.pasSync || {}).policyNumber || "")}</div></td><td>${escHtml(r.typeLabel)}<div class="p1-note">${escHtml(r.description)}</div><div class="p1-note">${escHtml(r.requestedBy)} · ${escHtml(r.channel)}</div></td><td>${escHtml(r.effective)}</td><td>${r.due ? escHtml(r.due) + (past ? '<div class="mw-late">Past due</div>' : "") : "—"}</td>
      <td><select class="form-control" onchange="poReqReassign('${escHtml(x.sub.id)}', '${escHtml(r.id)}', this.value)" aria-label="Reassign ${escHtml(r.id)}"${poReqOpen(r) && can ? "" : " disabled"}>${roles.map(k => `<option value="${k}"${k === r.assignee ? " selected" : ""}>${escHtml(USER_ROLES_CONFIG[k].name)}</option>`).join("")}</select></td><td><span class="badge ${{ Received: "badge-info", "In review": "badge-warning", Approved: "badge-primary", Issued: "badge-success", Declined: "badge-danger", Withdrawn: "badge-light" }[r.status]}">${r.status}</span>${r.endorsementId ? `<div class="p1-note">${escHtml(r.endorsementId)}</div>` : ""}</td><td>${acts}</td></tr>`;
  }).join("");
  return form + bar + (list.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Request</th><th>Change</th><th>Effective</th><th>Due</th><th>Handled by</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No endorsement requests ${PO.reqFilter === "open" ? "open" : "match"}.</div>`) +
    `<div class="p1-note">A request is closed as Issued only against an endorsement that was actually issued on that policy in Policy Changes. Issuing the endorsement itself is done there, with its own authority rules.</div>`;
}
function poAddReqUi() {
  const sub = poSub(poRead("po_rsub"));
  const r = poAddReq(sub, { type: poRead("po_rtype"), description: poRead("po_rdesc"), requestedBy: poRead("po_rby"), channel: poRead("po_rch"), effective: poRead("po_reff"), due: poRead("po_rdue"), assignee: poRead("po_rass") });
  if (r.message !== "permission") showToast(r.ok ? "✅ Request " + r.req.id + " recorded." : "⛔ " + r.message, r.ok ? "success" : "danger"); poRender();
}
function poReqMove(subId, id) { const sub = poSub(subId); if (!sub) return; const r = poSetReq(sub, id, poRead("po_rn_" + id), poRead("po_rw_" + id), poRead("po_re_" + id)); if (r.message !== "permission") showToast(r.ok ? "Moved to " + r.req.status + "." : "⛔ " + r.message, r.ok ? "success" : "danger"); poRender(); }
function poReqReassign(subId, id, role) { const sub = poSub(subId); if (sub) poReassignReq(sub, id, role); poRender(); }
function poReqFilter(v) { PO.reqFilter = v; poRender(); }
function poReqAssignee(v) { PO.reqAssignee = v; poRender(); }

// ----------------------------------------------------------------------------
// 4. TRANSFERS
// ----------------------------------------------------------------------------
function poTransferRequest(sub, f) {
  if (!hasPermission("policyChanges", "approve")) { denyPermission("policyChanges", "approve"); return { ok: false, message: "permission" }; }
  if (!policyIsBound(sub)) return { ok: false, message: "The policy is not bound." };
  if (["cancelled", "transferred"].indexOf(sub.policyState) > -1) return { ok: false, message: "The policy is already " + sub.policyState + "." };
  if (sub.cancellation && ["pending", "effective"].indexOf(sub.cancellation.status) > -1) return { ok: false, message: "The policy has a cancellation recorded." };
  if (sub.transfer && ["Requested", "Approved"].indexOf(sub.transfer.status) > -1) return { ok: false, message: "A transfer is already " + sub.transfer.status.toLowerCase() + "." };
  const to = String(f.to || "").trim();
  if (to.length < 2) return { ok: false, message: "Enter the carrier or market it moves to." };
  if (!poDate(f.effective)) return { ok: false, message: "Enter the effective date." };
  if (String(f.reason || "").trim().length < 10) return { ok: false, message: "Give the reason (at least 10 characters)." };
  const from = (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" && (sub.carrier || PRODUCER_DEFAULT_CARRIER)) || sub.carrier || "";
  sub.transfer = { status: "Requested", from, to, effective: f.effective, reason: String(f.reason).trim(), requestedBy: actorLabel(), requestedRole: currentUserRole, requestedAt: nowStamp(), history: [{ status: "Requested", by: actorLabel(), at: nowStamp() }] };
  poLog(sub, "policy_transfer", `Transfer of policy ${sub.pasSync.policyNumber} to ${to} requested, effective ${f.effective}: ${sub.transfer.reason}`);
  return { ok: true, transfer: sub.transfer };
}
function poTransferDecide(sub, action, note) {
  const t = sub.transfer; if (!t) return { ok: false, message: "There is no transfer." };
  const need = action === "complete" ? "approve" : "override";
  if (!hasPermission("policyChanges", need)) { denyPermission("policyChanges", need); return { ok: false, message: "permission" }; }
  if (action === "approve" || action === "reject") {
    if (t.status !== "Requested") return { ok: false, message: "The transfer is " + t.status.toLowerCase() + "." };
    if (t.requestedRole === currentUserRole) return { ok: false, message: "A different person must decide: you requested this transfer." };
    if (String(note || "").trim().length < 5) return { ok: false, message: "Add your reasoning (at least 5 characters)." };
    t.status = action === "approve" ? "Approved" : "Rejected"; t.decidedBy = actorLabel(); t.decidedAt = nowStamp(); t.decisionNote = String(note).trim();
  } else if (action === "complete") {
    if (t.status !== "Approved") return { ok: false, message: "Only an approved transfer can be completed." };
    t.status = "Completed"; t.completedBy = actorLabel(); t.completedAt = nowStamp(); sub.policyState = "transferred";
  } else return { ok: false, message: "Unknown action." };
  t.history.push({ status: t.status, by: actorLabel(), at: nowStamp(), note: String(note || "").trim() });
  poLog(sub, "policy_transfer", `Transfer to ${t.to} ${t.status.toLowerCase()}${note ? ": " + String(note).trim() : ""}.`);
  return { ok: true, transfer: t };
}
function poTransfersHtml() {
  const bound = SUBMISSIONS_DATASET.filter(s => poVisible(s) && policyIsBound(s) && ["cancelled", "transferred"].indexOf(s.policyState) < 0 && !(s.transfer && ["Requested", "Approved"].indexOf(s.transfer.status) > -1));
  const withT = SUBMISSIONS_DATASET.filter(s => poVisible(s) && s.transfer);
  const can = hasPermission("policyChanges", "approve"), canDecide = hasPermission("policyChanges", "override");
  const companies = typeof fdCompanies === "function" ? fdCompanies().map(c => `<option value="${escHtml(c.name)}"></option>`).join("") : "";
  const form = can ? `<details class="card"${withT.length ? "" : " open"}><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-arrows-left-right"></i> Request a transfer</summary><div class="card-body"><div class="mw-grid"><div class="form-group mw-wide"><label for="po_tsub">Policy</label><select class="form-control" id="po_tsub">${bound.length ? bound.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.insured)} · ${escHtml(s.pasSync.policyNumber)}</option>`).join("") : '<option value="">No policy can be transferred</option>'}</select></div>
    <div class="form-group"><label for="po_tto">Moves to</label><input class="form-control" id="po_tto" list="po_tcos"><datalist id="po_tcos">${companies}</datalist></div><div class="form-group"><label for="po_teff">Effective</label><input type="date" class="form-control" id="po_teff" value="${todayIso()}"></div><div class="form-group mw-wide"><label for="po_trs">Reason</label><input class="form-control" id="po_trs"></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="poTransferUi()">Request transfer</button></div></div></details>` : "";
  const rows = withT.map(s => { const t = s.transfer; let act = "";
    if (t.status === "Requested" && canDecide) act = `<input class="form-control" id="po_tn_${escHtml(s.id)}" placeholder="Reasoning" style="width:140px;display:inline-block;"> <button class="btn btn-xs btn-success" style="width:auto;" onclick="poTransferDo('${escHtml(s.id)}','approve')">Approve</button> <button class="btn btn-xs btn-outline-danger" style="width:auto;" onclick="poTransferDo('${escHtml(s.id)}','reject')">Reject</button>`;
    else if (t.status === "Approved" && can) act = `<button class="btn btn-xs btn-primary" style="width:auto;" onclick="poTransferDo('${escHtml(s.id)}','complete')">Complete transfer</button>`;
    return `<tr><td><strong>${escHtml(s.insured)}</strong><div class="p1-note">${escHtml(s.pasSync.policyNumber)}</div></td><td>${escHtml(t.from || "—")} → <strong>${escHtml(t.to)}</strong></td><td>${escHtml(t.effective)}</td><td>${escHtml(t.reason)}<div class="p1-note">${escHtml(t.requestedBy)}</div></td><td><span class="badge ${{ Requested: "badge-warning", Approved: "badge-primary", Completed: "badge-success", Rejected: "badge-danger" }[t.status]}">${t.status}</span>${t.decisionNote ? `<div class="p1-note">${escHtml(t.decidedBy)}: ${escHtml(t.decisionNote)}</div>` : ""}</td><td>${act}</td></tr>`; }).join("");
  return form + (withT.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Policy</th><th>Move</th><th>Effective</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No transfers.</div>`) +
    `<div class="p1-note">A transfer is approved by someone other than the person who asked. A completed transfer takes the policy off the renewal pipeline. No premium or document is moved by this record; accounting and the policy admin system do that.</div>`;
}
function poTransferUi() { const sub = poSub(poRead("po_tsub")); if (!sub) { showToast("⛔ Choose a policy.", "danger"); return; } const r = poTransferRequest(sub, { to: poRead("po_tto"), effective: poRead("po_teff"), reason: poRead("po_trs") }); if (r.message !== "permission") showToast(r.ok ? "✅ Transfer requested." : "⛔ " + r.message, r.ok ? "success" : "danger"); poRender(); }
function poTransferDo(id, action) { const sub = poSub(id); if (!sub) return; const r = poTransferDecide(sub, action, poRead("po_tn_" + id)); if (r.message !== "permission") showToast(r.ok ? "✅ " + sub.transfer.status + "." : "⛔ " + r.message, r.ok ? "success" : "danger"); poRender(); }

// ----------------------------------------------------------------------------
// 5. UNDERWRITER CHANGE
// ----------------------------------------------------------------------------
function poChangeUnderwriter(sub, role, reason) {
  if (!canManageAssignments()) { denyPermission("workflow", "approve"); return { ok: false, message: "permission" }; }
  if (!policyIsBound(sub)) return { ok: false, message: "The policy is not bound." };
  if (ASSIGNABLE_WORKER_ROLES.indexOf(role) < 0) return { ok: false, message: "Choose an underwriter." };
  if (sub.assignedTo === role) return { ok: false, message: "That underwriter already has the policy." };
  if (String(reason || "").trim().length < 5) return { ok: false, message: "Give a reason (at least 5 characters)." };
  const from = sub.assignedTo || null;
  if (!sub.uwHistory) sub.uwHistory = [];
  sub.uwHistory.push({ from, to: role, by: actorLabel(), at: nowStamp(), reason: String(reason).trim() });
  sub.assignedTo = role; sub.assignedBy = actorLabel(); sub.assignedAt = nowStamp();
  poLog(sub, "underwriter_changed", `Underwriter on policy ${sub.pasSync.policyNumber} changed from ${from ? USER_ROLES_CONFIG[from].name : "nobody"} to ${USER_ROLES_CONFIG[role].name}: ${String(reason).trim()}`);
  if (typeof notify === "function") notify(role, { kind: "assignment", title: "Policy assigned to you: " + sub.insured, text: sub.pasSync.policyNumber + " (" + sub.id + "), reason: " + String(reason).trim(), caseId: sub.id, key: "uw-" + sub.id + "-" + role + "-" + sub.uwHistory.length });
  return { ok: true };
}
function poUwHtml() {
  const list = SUBMISSIONS_DATASET.filter(s => poVisible(s) && policyIsBound(s)), can = canManageAssignments();
  if (!list.length) return `<div class="mw-empty">No bound policies.</div>`;
  return `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Policy</th><th>Underwriter</th><th>Last change</th><th>${can ? "Change to" : ""}</th></tr></thead><tbody>${list.map(s => {
    const h = (s.uwHistory || []).slice(-1)[0], cur = s.assignedTo ? USER_ROLES_CONFIG[s.assignedTo].name : "Unassigned";
    return `<tr><td><strong>${escHtml(s.insured)}</strong><div class="p1-note">${escHtml(s.pasSync.policyNumber)} · ${escHtml(s.id)}</div></td><td>${escHtml(cur)}</td><td>${h ? escHtml(h.at) + " by " + escHtml(h.by) + ": " + escHtml(h.reason) : "—"}</td><td>${can ? `<select class="form-control" id="po_us_${escHtml(s.id)}" style="width:150px;display:inline-block;">${ASSIGNABLE_WORKER_ROLES.map(k => `<option value="${k}"${k === s.assignedTo ? " selected" : ""}>${escHtml(USER_ROLES_CONFIG[k].name)}</option>`).join("")}</select> <input class="form-control" id="po_uw_${escHtml(s.id)}" placeholder="Reason" style="width:140px;display:inline-block;"> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="poUwDo('${escHtml(s.id)}')">Change</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>${can ? "" : `<div class="p1-note">Only the Head of Underwriting changes the underwriter on a policy.</div>`}`;
}
function poUwDo(id) { const sub = poSub(id); if (!sub) return; const r = poChangeUnderwriter(sub, poRead("po_us_" + id), poRead("po_uw_" + id)); if (r.message !== "permission") showToast(r.ok ? "✅ Underwriter changed." : "⛔ " + r.message, r.ok ? "success" : "danger"); poRender(); }

// ----------------------------------------------------------------------------
// 6. CANCELLATION REPORT
// ----------------------------------------------------------------------------
const PO_CANC_FIELDS = { effective: "Effective date", mailedOn: "Notice mailed", at: "Recorded" };
/** Cancellations, rescissions and reinstatements across the book, newest effective date first. */
function poCancelRows(o) {
  o = o || {}; const out = [];
  SUBMISSIONS_DATASET.filter(poVisible).forEach(s => (s.policyChanges || []).filter(c => ["cancellation", "reinstatement"].indexOf(c.type) > -1).forEach(c => {
    const date = String(c[o.field || "effective"] || "").slice(0, 10);
    if ((o.from || o.to) && (!date || (o.from && date < o.from) || (o.to && date > o.to))) return;
    if (o.status && c.status !== o.status) return;
    out.push({ sub: s, ev: c, type: c.type === "cancellation" ? (c.status === "rescinded" ? "Rescinded cancellation" : "Cancellation") : "Reinstatement", policy: (s.pasSync || {}).policyNumber || "", refund: c.refund && c.refund.refund !== undefined ? c.refund.refund : null });
  }));
  return out.sort((a, b) => String(b.ev.effective || "").localeCompare(String(a.ev.effective || "")));
}
function poCancelCsv(rows) {
  const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  return ["Policy,Case,Insured,Transaction,Status,Initiated by,Reason,Notice mailed,Effective,Return premium,Recorded by,Recorded at"].concat(rows.map(r => [r.policy, r.sub.id, r.sub.insured, r.type, r.ev.status, r.ev.initiator || r.ev.reinstateType || "", r.ev.reasonLabel || r.ev.reason || "", r.ev.mailedOn || "", r.ev.effective || "", r.refund === null ? "" : r.refund, r.ev.by || "", r.ev.at || ""].map(q).join(","))).join("\n");
}
function poCancelHtml() {
  const rows = poCancelRows({ field: PO.cField, from: PO.cFrom, to: PO.cTo, status: PO.cStatus });
  const bar = `<div class="mw-dates" style="margin-bottom:10px;"><label>Date <select class="form-control" id="po_cf" onchange="poCancelApply()">${Object.keys(PO_CANC_FIELDS).map(k => `<option value="${k}"${PO.cField === k ? " selected" : ""}>${PO_CANC_FIELDS[k]}</option>`).join("")}</select></label><label>From <input type="date" class="form-control" id="po_cfrom" value="${escHtml(PO.cFrom)}" onchange="poCancelApply()"></label><label>To <input type="date" class="form-control" id="po_cto" value="${escHtml(PO.cTo)}" onchange="poCancelApply()"></label>
    <label>Status <select class="form-control" id="po_cs" onchange="poCancelApply()"><option value="">Any</option>${["pending", "effective", "rescinded", "issued"].map(s => `<option${PO.cStatus === s ? " selected" : ""}>${s}</option>`).join("")}</select></label><button class="btn btn-sm btn-outline" style="width:auto;" onclick="poCancelClear()">Clear</button><button class="btn btn-sm btn-primary" style="width:auto;margin-left:auto;" onclick="poCancelExport()"${rows.length ? "" : " disabled"}><i class="ph ph-download-simple"></i> Export CSV</button></div>`;
  return bar + (rows.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Policy</th><th>Insured</th><th>Transaction</th><th>Status</th><th>By</th><th>Reason</th><th>Notice</th><th>Effective</th><th>Return premium</th></tr></thead><tbody>${rows.map(r => `<tr><td class="font-mono">${escHtml(r.policy)}</td><td>${escHtml(r.sub.insured)}</td><td>${r.type}</td><td>${escHtml(r.ev.status)}</td><td>${escHtml(r.ev.initiator || r.ev.reinstateType || "—")}</td><td>${escHtml(r.ev.reasonLabel || r.ev.reason || "—")}</td><td>${escHtml(r.ev.mailedOn || "—")}</td><td>${escHtml(r.ev.effective || "—")}</td><td>${r.refund === null ? "—" : poMoney(r.refund)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="mw-empty">No cancellation, rescission or reinstatement matches.</div>`) + `<div class="p1-note">Return premiums are estimates; the policy and state law govern the amounts and accounting settles them.</div>`;
}
function poCancelApply() { PO.cField = poRead("po_cf") || "effective"; PO.cFrom = poRead("po_cfrom"); PO.cTo = poRead("po_cto"); PO.cStatus = poRead("po_cs"); poRender(); }
function poCancelClear() { PO.cFrom = ""; PO.cTo = ""; PO.cStatus = ""; PO.cField = "effective"; poRender(); }
function poCancelExport() {
  const csv = poCancelCsv(poCancelRows({ field: PO.cField, from: PO.cFrom, to: PO.cTo, status: PO.cStatus }));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "cancellation-transactions-" + todayIso() + ".csv"; document.body.appendChild(a); a.click(); a.remove();
}

// ----------------------------------------------------------------------------
// 7. THE PAGE, AND THE CLAIM-RENEWAL GATE
// ----------------------------------------------------------------------------
const PO_TABS = [["claims", "Claim renewals", "ph-warning-diamond"], ["requests", "Endorsement requests", "ph-pencil-line"], ["transfers", "Transfers", "ph-arrows-left-right"], ["uw", "Underwriters", "ph-user-switch"], ["cancellations", "Cancellation report", "ph-prohibit"]];
function showPoliciesPage() {
  currentPage = "policies";
  resetAllTopLevelPages();
  setPageTitle("Policies");
  setBreadcrumb([{ label: "FUT", onClick: "showIntakePage()" }, { label: "Policies" }]);
  const page = document.getElementById("policiesPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }
  const nav = document.getElementById("navItemPolicies"); if (nav) nav.classList.add("active");
  const footer = document.getElementById("workflowBottomFooter"); if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");
  poRender();
}
function poTab(t) { PO.tab = t; poRender(); }
/** The one renewal list lives in Quote Intelligence. */
function poOpenRenewals() { showQuoteIntelligencePage(); if (typeof switchQuoteIntelTab === "function") switchQuoteIntelTab("pipeline"); }
function poRender() {
  const root = document.getElementById("policiesRoot"); if (!root) return;
  const counts = { claims: rnPolicies().filter(p => poVisible(p.sub) && poClaimRenewalRequired(p.sub) && poClaimStatus(p.sub) !== "approved").length, requests: poAllReqs().filter(x => poReqOpen(x.req)).length, transfers: SUBMISSIONS_DATASET.filter(s => poVisible(s) && s.transfer && ["Requested", "Approved"].indexOf(s.transfer.status) > -1).length };
  const body = { claims: poClaimsHtml, requests: poReqHtml, transfers: poTransfersHtml, uw: poUwHtml, cancellations: poCancelHtml }[PO.tab]();
  root.innerHTML = `<div class="p1-head"><div><h2 class="p1-h" style="margin:0;">Policies</h2><div class="p1-sub" style="margin:0;">The book of bound policies: what needs approval, what was asked for, and what ended.</div></div><button class="btn btn-sm btn-outline" style="width:auto;" onclick="poOpenRenewals()"><i class="ph ph-calendar-check"></i> Renewal pipeline</button></div>
    <div class="mw-tabs">${PO_TABS.map(t => `<button class="tab-btn${PO.tab === t[0] ? " active" : ""}" onclick="poTab('${t[0]}')"><i class="ph ${t[2]}"></i> ${t[1]}${counts[t[0]] ? ` <span class="badge badge-light">${counts[t[0]]}</span>` : ""}</button>`).join("")}</div>${body}`;
}

(function poInstall() {
  // a policy with enough claims cannot be renewed, or renewed with conditions, until the claim renewal is approved
  const orig = window.rnDecide;
  if (typeof orig === "function") window.rnDecide = function (subId, kind) {
    const sub = poSub(subId);
    if (sub && (kind === "renew" || kind === "conditional") && poClaimRenewalRequired(sub) && poClaimStatus(sub) !== "approved") {
      showToast(`⛔ This policy has ${poClaims(sub)} claims (${RN_CLAIMS_APPROVAL.minClaims} or more need approval). Ask for approval under Policies, Claim renewals, before renewing.`, "danger");
      return;
    }
    return orig.apply(this, arguments);
  };
  // a transferred policy is no longer ours to renew
  const origRenewable = window.rnIsRenewable;
  if (typeof origRenewable === "function") window.rnIsRenewable = function (sub) { return sub.policyState !== "transferred" && origRenewable.apply(this, arguments); };
})();
