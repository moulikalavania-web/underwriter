/**
 * ============================================================================
 * PARTY SCREENING: KYC, KYB, PEP AND ADVERSE MEDIA, WITH AN EXPIRY
 * ----------------------------------------------------------------------------
 * Sanctions screening (js/sanctions-screening.js) was the only screening. A person or business can also need identity checks (KYC for a
 * person, KYB for a business), a politically-exposed-person check and an adverse-media check. Each is a record on the case:
 *
 *   WHO        the party screened (the insured, an owner or a principal), as a person or an organisation.
 *   WHAT       the type, the result (clear, potential match, confirmed match), the provider's reference (NO PROVIDER IS CONNECTED: the
 *              result is recorded from the source the person used, and the reference is required so it can be traced), the date
 *              screened, and the date it expires.
 *   EXPIRY     how long a result is good for comes from the compliance requirement for that screening (js/uw-compliance.js, type
 *              party_screening); with none registered a result does not expire.
 *   REVIEW     a potential match is not a pass. A different person with the right to approve sanctions reviews it and either clears it or
 *              confirms it, with a reason. A confirmed match is never a pass.
 *   GATE       a registered party_screening requirement is checked at bind like any other: not screened, expired, awaiting review or
 *              confirmed all fail it.
 * ============================================================================
 */

const SC_TYPES = { kyc: "KYC (identity of a person)", kyb: "KYB (identity of a business)", pep: "Politically exposed person", adverse_media: "Adverse media" };
const SC_RESULTS = { clear: "Clear", potential_match: "Potential match", confirmed_match: "Confirmed match" };
const SC_ROLES = { insured: "Insured", owner: "Owner", principal: "Principal" };

function scList(sub) { if (!sub.screenings) sub.screenings = []; return sub.screenings; }
function scAddDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); }
/** How many days a result of this type is good for, from the registered requirement, or null when none is registered. */
function scValidityDays(sub, type) {
  const f = typeof cqSubFacts === "function" ? cqSubFacts(sub) : { state: null, lob: sub.lobKey };
  const q = CQ.reqs.filter(x => x.type === "party_screening" && x.rule && x.rule.screening === type && x.status === "active" && ucInForce(x.effectiveFrom, x.effectiveTo) && ucScopeHas(x.lob, f.lob) && (x.state === "*" || (f.state && ucScopeHas(x.state, f.state)))).slice(-1)[0];
  return q ? Number(q.rule.validity_days) : null;
}
/** Records a screening result. f: { partyName, partyKind, role, type, result, providerRef, screenedOn, note } */
function scRecord(sub, f) {
  if (!hasPermission("sanctions", "edit")) { denyPermission("sanctions", "edit"); return { ok: false, error: "permission" }; }
  const e = [], iso = /^\d{4}-\d{2}-\d{2}$/;
  if (String(f.partyName || "").trim().length < 2) e.push("name the party screened");
  if (["person", "organization"].indexOf(f.partyKind) < 0) e.push("say whether the party is a person or an organisation");
  if (!SC_ROLES[f.role]) e.push("choose the party's role");
  if (!SC_TYPES[f.type]) e.push("choose the type of screening");
  if (f.type === "kyc" && f.partyKind === "organization") e.push("KYC is for a person; use KYB for a business");
  if (f.type === "kyb" && f.partyKind === "person") e.push("KYB is for a business; use KYC for a person");
  if (!SC_RESULTS[f.result]) e.push("choose the result");
  if (String(f.providerRef || "").trim().length < 3) e.push("enter the provider's reference for the result (no provider is connected, so it is how the result is traced)");
  if (!iso.test(f.screenedOn || "") || f.screenedOn > todayIso()) e.push("enter the date screened (not in the future)");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  const days = scValidityDays(sub, f.type);
  const r = { id: "SC-" + (scList(sub).length + 1), party: { name: String(f.partyName).trim(), kind: f.partyKind, role: f.role }, type: f.type, result: f.result, providerRef: String(f.providerRef).trim(), screenedOn: f.screenedOn,
    expiresOn: days ? scAddDays(f.screenedOn, days) : null, validityDays: days, note: String(f.note || "").trim(), reviewStatus: f.result === "potential_match" ? "pending" : "none", recordedBy: ucActor(), recordedAt: nowStamp() };
  scList(sub).push(r);
  logDecision(sub, sub.currentStep || 2, "party_screening_recorded", r.id + ": " + SC_TYPES[r.type] + " of " + r.party.name + " (" + SC_ROLES[r.party.role] + "): " + SC_RESULTS[r.result] + (r.expiresOn ? ", good until " + r.expiresOn : "") + ".");
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, screening: r };
}
/** A different person clears or confirms a potential match. */
function scResolve(sub, id, verdict, reason) {
  if (!hasPermission("sanctions", "approve")) { denyPermission("sanctions", "approve"); return { ok: false, error: "permission" }; }
  const r = scList(sub).find(x => x.id === id);
  if (!r || r.reviewStatus !== "pending") return { ok: false, error: "state" };
  if (r.recordedBy === ucActor()) return { ok: false, error: "self" };
  if (["clear", "confirmed_match"].indexOf(verdict) < 0) return { ok: false, error: "verdict" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  r.reviewStatus = "resolved"; r.resolution = verdict; r.reviewedBy = ucActor(); r.reviewedAt = nowStamp(); r.resolutionReason = String(reason).trim();
  logDecision(sub, sub.currentStep || 2, "party_screening_resolved", r.id + " " + (verdict === "clear" ? "cleared" : "CONFIRMED as a match") + " by " + r.reviewedBy + ": " + r.resolutionReason);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, screening: r };
}
/** Where the insured stands for one screening type: not_screened, clear, expired, review or confirmed. */
function scStatus(sub, type, day) {
  const d = day || todayIso();
  const rec = [].concat(scList(sub)).reverse().find(x => x.type === type && x.party.role === "insured");
  if (!rec) return { state: "not_screened", record: null };
  const effective = rec.reviewStatus === "resolved" ? rec.resolution : rec.result;
  if (effective === "confirmed_match") return { state: "confirmed", record: rec };
  if (effective === "potential_match") return { state: "review", record: rec };
  if (rec.expiresOn && rec.expiresOn < d) return { state: "expired", record: rec };
  return { state: "clear", record: rec };
}

// ----------------------------------------------------------------------------
// SCREEN
// ----------------------------------------------------------------------------
function scCaseHtml(sub) {
  const list = scList(sub).slice().reverse();
  const canRec = hasPermission("sanctions", "edit"), canRes = hasPermission("sanctions", "approve");
  const form = canRec ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="sc_name">Party</label><input class="form-control" id="sc_name" value="${escHtml(sub.insured || "")}"></div>
    <div class="form-group"><label for="sc_kind">Person or organisation</label><select class="form-control" id="sc_kind"><option value="organization">Organisation</option><option value="person">Person</option></select></div><div class="form-group"><label for="sc_role">Role</label><select class="form-control" id="sc_role">${Object.keys(SC_ROLES).map(k => `<option value="${k}">${SC_ROLES[k]}</option>`).join("")}</select></div>
    <div class="form-group"><label for="sc_type">Screening</label><select class="form-control" id="sc_type">${Object.keys(SC_TYPES).map(k => `<option value="${k}">${escHtml(SC_TYPES[k])}</option>`).join("")}</select></div><div class="form-group"><label for="sc_result">Result</label><select class="form-control" id="sc_result">${Object.keys(SC_RESULTS).map(k => `<option value="${k}">${SC_RESULTS[k]}</option>`).join("")}</select></div>
    <div class="form-group"><label for="sc_ref">Provider reference</label><input class="form-control" id="sc_ref"></div><div class="form-group"><label for="sc_on">Screened on</label><input type="date" class="form-control" id="sc_on" value="${todayIso()}"></div><div class="form-group mw-wide"><label for="sc_note">Note</label><input class="form-control" id="sc_note"></div></div><button class="btn btn-sm btn-outline" onclick="scRecordUi()">Record the screening</button>` : "";
  const rows = list.map(r => { const st = r.type && r.party.role === "insured" ? scStatus(sub, r.type).state : ""; return `<tr><td>${escHtml(r.id)}</td><td>${escHtml(r.party.name)}<div class="p1-note">${escHtml(SC_ROLES[r.party.role])} · ${r.party.kind === "person" ? "person" : "organisation"}</div></td><td>${escHtml(SC_TYPES[r.type])}</td><td><span class="badge ${(r.reviewStatus === "resolved" ? r.resolution : r.result) === "clear" ? "badge-success" : (r.reviewStatus === "resolved" ? r.resolution : r.result) === "confirmed_match" ? "badge-danger" : "badge-warning"}">${escHtml(SC_RESULTS[r.reviewStatus === "resolved" ? r.resolution : r.result])}</span>${r.reviewStatus === "pending" ? '<div class="p1-note">awaiting review</div>' : r.reviewStatus === "resolved" ? `<div class="p1-note">reviewed by ${escHtml(r.reviewedBy)}: ${escHtml(r.resolutionReason)}</div>` : ""}</td>
    <td>${escHtml(r.screenedOn)}<div class="p1-note">${r.expiresOn ? "expires " + escHtml(r.expiresOn) + (r.expiresOn < todayIso() ? " · EXPIRED" : "") : "does not expire"}</div></td><td>${escHtml(r.providerRef)}</td><td>${r.reviewStatus === "pending" && canRes ? `<button class="btn btn-xs btn-outline" onclick="scResolveUi('${r.id}','clear')">Clear</button> <button class="btn btn-xs btn-outline" onclick="scResolveUi('${r.id}','confirmed_match')">Confirm match</button>` : ""}</td></tr>`; }).join("");
  return (rows ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Record</th><th>Party</th><th>Screening</th><th>Result</th><th>Date</th><th>Reference</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="mw-empty">No party has been screened for KYC, KYB, PEP or adverse media on this case.</div>') + form;
}
function scRecordUi() {
  const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return;
  const r = scRecord(sub, { partyName: ucV("sc_name"), partyKind: ucV("sc_kind"), role: ucV("sc_role"), type: ucV("sc_type"), result: ucV("sc_result"), providerRef: ucV("sc_ref"), screenedOn: ucV("sc_on"), note: ucV("sc_note") });
  showToast(r.ok ? "✅ Screening recorded." : "⛔ " + (r.errors ? r.errors.join("; ") : r.error), r.ok ? "success" : "danger");
  if (typeof cfRender === "function") cfRender();
}
function scResolveUi(id, verdict) {
  const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return;
  const why = window.prompt((verdict === "clear" ? "Why is this match cleared?" : "Why is this match confirmed?") + " (at least 10 characters; recorded with your name)", ""); if (why === null) return;
  const r = scResolve(sub, id, verdict, why);
  showToast(r.ok ? "✅ Recorded." : "⛔ " + ({ self: "A different person must review it: you recorded it.", reason: "Give a reason of at least 10 characters." }[r.error] || r.error), r.ok ? "success" : "danger");
  if (typeof cfRender === "function") cfRender();
}
(function scInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.party_screening_recorded = { label: "Party Screening Recorded", icon: "ph-shield-check", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.party_screening_resolved = { label: "Party Screening Match Reviewed", icon: "ph-shield-warning", badge: "badge-warning", outcome: "outcome-refer" };
  }
})();
if (typeof urRegisterSection === "function") urRegisterSection("screening", "Party screening", scCaseHtml);
