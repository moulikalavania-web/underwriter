/**
 * ============================================================================
 * TRIA OFFER & ELECTION RECORD (Add-On) — gap G04
 * ----------------------------------------------------------------------------
 * The Terrorism Risk Insurance Act requires insurers to make coverage for
 * certified acts of terrorism available on covered commercial lines, to
 * disclose the premium and the federal share of compensation (at offer and at
 * renewal, on a separate line item) and the $100 billion cap (at offer,
 * purchase and renewal), and to let the policyholder accept or reject it.
 * An insurer that cannot show that offer and the insured's election has a
 * compliance problem and risks losing federal reimbursement.
 *
 * This module adds, on the Quote & Bind screen:
 *   1. Applicability — whether the line is covered by the federal program.
 *      Excluded: commercial auto, professional liability other than D&O,
 *      medical malpractice (31 CFR 50.4). Rules are in TRIA_LOB_RULES so
 *      Compliance can adjust them.
 *   2. Offer record — premium for certified acts, with the three disclosures
 *      confirmed (premium on a separate line, federal share, cap).
 *   3. Election record — accepted or rejected, by whom, how, with a reference.
 *      A rejection needs "approve" permission on the TRIA resource and a
 *      signed form or e-signature.
 *   4. Quote reconciliation — the quote's TRIA charge must match the election:
 *      a rejected election cannot still carry a charge; an accepted one must
 *      carry the premium that was offered.
 *   5. A bind gate — bind is blocked until an applicable submission has an
 *      offer and an election that reconcile with the quote.
 *
 * IMPORTANT: the notice wording below is a TEMPLATE for Compliance to replace
 * with approved text (Treasury publishes model forms in 31 CFR 50.16). The
 * federal share (80%) and program end date (2027-12-31) are configuration to
 * be confirmed against the current statute.
 * ============================================================================
 */

var TRIA_PROGRAM_END = "2027-12-31";
var TRIA_FEDERAL_SHARE_PCT = 80;
var TRIA_CAP_TEXT = "$100 billion";
var TRIA_REQUIRE_SIGNED_REJECTION = true;
var TRIA_FEE_CODE = "FEE_TRIA";

/** Per line of business. applies: true | false | "partial" (see test). */
var TRIA_LOB_RULES = {
  trucking: { applies: false, reason: "Commercial automobile insurance is excluded from the federal program (31 CFR 50.4)." },
  property: { applies: true,  reason: "Commercial property is a covered line." },
  gl_cpc:   { applies: true,  reason: "Commercial general liability (other liability, products liability) is a covered line." },
  gl_cas:   { applies: true,  reason: "Commercial general liability (other liability, products liability) is a covered line." },
  mpl:      { applies: "partial", reason: "Professional liability is excluded except directors and officers liability; medical malpractice is excluded. Covered only where D&O cover is included.",
              test: sub => (sub.coverageRows || []).some(r => /directors\s*(&|and)\s*officers|\bD&O\b/i.test(String(r.line || ""))) }
};

var TRIA_DELIVERY_METHODS = ["With the quote (email to broker)", "ACORD-format quote document", "Separate offer letter", "Other (explain in notes)"];
var TRIA_ELECTION_METHODS = ["Signed election form", "E-signature", "Email from insured (accept only)"];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function triaApplicability(sub) {
  const rule = TRIA_LOB_RULES[sub.lobKey];
  if (!rule) return { applies: true, reason: `Line "${sub.lobKey}" is not configured for TRIA; treated as covered until Compliance confirms.`, configured: false };
  if (rule.applies === "partial") {
    const covered = !!rule.test(sub);
    return { applies: covered, reason: rule.reason + (covered ? " D&O cover is present, so the offer is required." : " No D&O cover found, so no offer is required."), configured: true };
  }
  return { applies: rule.applies, reason: rule.reason, configured: true };
}

/** TRIA charge on the imported quote: a number, or null when no quote is imported. */
function triaQuotedCharge(sub) {
  const q = sub.importedRatingData && sub.importedRatingData.quote;
  if (!q || !Array.isArray(q.fees)) return null;
  const fee = q.fees.find(f => f && f.code === TRIA_FEE_CODE);
  return fee ? (Number(fee.amt) || 0) : 0;
}

function triaParseDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? String(s).slice(0, 10) : null;
}

function triaPolicyExpiry(sub) {
  return triaParseDate(sub.expirationDate) || triaParseDate(sub.genInfo && sub.genInfo.expiration_date);
}

function getTriaStatus(sub) {
  const app = triaApplicability(sub);
  const t = sub.tria || {};
  let state;
  if (!app.applies) state = "not_applicable";
  else if (!t.offer) state = "offer_required";
  else if (!t.election) state = "awaiting_election";
  else state = t.election.decision === "accepted" ? "accepted" : "rejected";

  const issues = [];
  const quoted = triaQuotedCharge(sub);
  if (state === "not_applicable" && quoted > 0) {
    issues.push({ level: "warn", text: `The quote carries a TRIA charge of $${quoted.toLocaleString("en-US")} although this line is outside the federal program. Confirm with Compliance or re-rate without it.` });
  }
  if (state === "rejected" && quoted > 0) {
    issues.push({ level: "block", text: `The insured rejected terrorism coverage but the quote still carries a TRIA charge of $${quoted.toLocaleString("en-US")}. Re-rate without it before binding.` });
  }
  if (state === "accepted" && quoted !== null && Math.abs(quoted - Number(t.offer.premium)) > 1) {
    issues.push({ level: "block", text: `The quote's TRIA charge ($${quoted.toLocaleString("en-US")}) does not match the premium that was offered ($${Number(t.offer.premium).toLocaleString("en-US")}). The disclosed premium must be the premium charged — withdraw and re-offer.` });
  }
  if (state === "awaiting_election" && quoted !== null && Math.abs(quoted - Number(t.offer.premium)) > 1) {
    issues.push({ level: "warn", text: `The quote's TRIA charge ($${quoted.toLocaleString("en-US")}) differs from the offered premium ($${Number(t.offer.premium).toLocaleString("en-US")}). Withdraw and re-offer before the insured elects.` });
  }
  const expiry = triaPolicyExpiry(sub);
  if (app.applies && expiry && expiry > TRIA_PROGRAM_END) {
    issues.push({ level: "info", text: `The policy expires ${expiry}, after the federal program's scheduled end (${TRIA_PROGRAM_END}). The offer should say that federal reimbursement after that date depends on reauthorization.` });
  }
  const blocked = state === "offer_required" || state === "awaiting_election" || issues.some(i => i.level === "block");
  return { state, app, quoted, issues, blocked };
}

function triaNoticeText(sub, premium) {
  const money = Number(premium || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const expiry = triaPolicyExpiry(sub);
  const endNote = expiry && expiry > TRIA_PROGRAM_END
    ? ` The Program is scheduled to end on ${TRIA_PROGRAM_END}; coverage for certified acts after that date depends on the Program being reauthorized.` : "";
  return [
    "DISCLOSURE OF PREMIUM — TERRORISM RISK INSURANCE ACT (TEMPLATE — Compliance to replace with approved wording)",
    `Coverage for acts of terrorism certified by the Secretary of the Treasury is offered under this policy. The premium for certified acts of terrorism is ${money}, shown as a separate line item in the quote.`,
    `Under the Terrorism Risk Insurance Program, the United States Government shares in covered losses: the federal share of compensation is ${TRIA_FEDERAL_SHARE_PCT}% of insured losses above the insurer's deductible.`,
    `If total insured losses from certified acts exceed ${TRIA_CAP_TEXT} in a calendar year, the insurer is not liable for the portion above that amount, and Congress would determine any further payment.${endNote}`,
    "You may accept or reject this coverage. If you reject it, coverage for certified acts of terrorism will not apply, subject to any state requirements."
  ].join("\n\n");
}

// ----------------------------------------------------------------------------
// 2. STATE + AUDIT
// ----------------------------------------------------------------------------
function triaActiveSub() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }
function triaNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function triaActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function triaEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function triaMoney(n) { return "$" + Number(n || 0).toLocaleString("en-US"); }
function triaLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 7, decision, by: triaActor(), at: triaNow(), notes });
}
function triaPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function triaVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ""; }
function triaChecked(id) { const el = document.getElementById(id); return !!(el && el.checked); }

// ----------------------------------------------------------------------------
// 3. ACTIONS
// ----------------------------------------------------------------------------
function triaCreateOffer() {
  const sub = triaActiveSub();
  if (!sub) return;
  if (!hasPermission("tria", "edit")) { denyPermission("tria", "edit"); return; }
  const st = getTriaStatus(sub);
  if (!st.app.applies) { showToast("This line is outside the federal program; no TRIA offer is required.", "info"); return; }
  if (st.state !== "offer_required") { showToast("An offer already exists. Withdraw it to create a new one.", "info"); return; }

  const premiumRaw = triaVal("triaOfferPremium");
  const premium = Number(premiumRaw);
  const problems = [];
  if (premiumRaw === "" || isNaN(premium) || premium < 0) problems.push("enter the premium for certified acts (0 or more)");
  if (!triaChecked("triaDiscPremium")) problems.push("confirm the premium is shown on a separate line item");
  if (!triaChecked("triaDiscShare")) problems.push("confirm the federal share of compensation is disclosed");
  if (!triaChecked("triaDiscCap")) problems.push(`confirm the ${TRIA_CAP_TEXT} cap is disclosed`);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  sub.tria = sub.tria || { history: [] };
  sub.tria.offer = {
    premium, deliveryMethod: triaVal("triaDelivery"), notes: triaVal("triaOfferNotes"),
    federalSharePct: TRIA_FEDERAL_SHARE_PCT, capText: TRIA_CAP_TEXT,
    disclosures: { premiumSeparateLine: true, federalShare: true, cap: true },
    noticeText: triaNoticeText(sub, premium),
    offeredBy: triaActor(), offeredAt: triaNow()
  };
  triaLog(sub, "tria_offered", `TRIA offer made: premium for certified acts ${triaMoney(premium)}; federal share ${TRIA_FEDERAL_SHARE_PCT}% and ${TRIA_CAP_TEXT} cap disclosed. Delivered: ${sub.tria.offer.deliveryMethod}.`);
  triaPersist();
  renderTriaCard(sub);
  showToast("TRIA offer recorded.", "success");
}

function triaRecordElection() {
  const sub = triaActiveSub();
  if (!sub) return;
  const st = getTriaStatus(sub);
  if (st.state !== "awaiting_election") { showToast("There is no open TRIA offer to elect against.", "info"); return; }
  const decision = triaVal("triaDecision");
  if (decision !== "accepted" && decision !== "rejected") { showToast("Choose accept or reject.", "danger"); return; }
  const needed = decision === "rejected" ? "approve" : "edit";
  if (!hasPermission("tria", needed)) { denyPermission("tria", needed); return; }

  const e = { decision, signer: triaVal("triaSigner"), title: triaVal("triaSignerTitle"), method: triaVal("triaMethod"), reference: triaVal("triaReference"), notes: triaVal("triaElectionNotes") };
  const problems = [];
  if (e.signer.length < 3) problems.push("enter the name of the person at the insured who made the election");
  if (e.title.length < 2) problems.push("enter their title");
  if (e.reference.length < 3) problems.push("enter the form or document reference");
  if (decision === "rejected" && TRIA_REQUIRE_SIGNED_REJECTION && e.method === TRIA_ELECTION_METHODS[2]) problems.push("a rejection must be on a signed form or by e-signature, not email");
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  e.recordedBy = triaActor();
  e.recordedAt = triaNow();
  sub.tria.election = e;
  triaLog(sub, decision === "accepted" ? "tria_accepted" : "tria_rejected",
    `Insured ${decision === "accepted" ? "ACCEPTED" : "REJECTED"} terrorism coverage: ${e.signer}, ${e.title}; ${e.method}; ref ${e.reference}. Offered premium ${triaMoney(sub.tria.offer.premium)}.${e.notes ? " Notes: " + e.notes : ""}`);
  triaPersist();
  renderTriaCard(sub);
  showToast(decision === "accepted" ? "Acceptance recorded." : "Rejection recorded. Re-rate the quote without the TRIA charge before binding.", decision === "accepted" ? "success" : "warning");
}

function triaWithdrawOffer() {
  const sub = triaActiveSub();
  if (!sub || !sub.tria || !sub.tria.offer) return;
  if (!hasPermission("tria", "edit")) { denyPermission("tria", "edit"); return; }
  const reason = triaVal("triaWithdrawReason");
  if (reason.length < 5) { showToast("Enter a reason for withdrawing the offer.", "danger"); return; }
  if (!sub.tria.history) sub.tria.history = [];
  sub.tria.history.push({ offer: sub.tria.offer, election: sub.tria.election || null, withdrawnBy: triaActor(), withdrawnAt: triaNow(), reason });
  triaLog(sub, "tria_offer_withdrawn", `TRIA offer withdrawn${sub.tria.election ? " (including the recorded election)" : ""}: ${reason}`);
  sub.tria.offer = null;
  sub.tria.election = null;
  triaPersist();
  renderTriaCard(sub);
  showToast("Offer withdrawn. Create a new offer.", "info");
}

// ----------------------------------------------------------------------------
// 4. RENDERING
// ----------------------------------------------------------------------------
var TRIA_STATE_UI = {
  not_applicable:    { badge: "badge-light",   icon: "ph-minus-circle", label: "Not Required" },
  offer_required:    { badge: "badge-warning", icon: "ph-warning",      label: "Offer Required" },
  awaiting_election: { badge: "badge-warning", icon: "ph-hourglass",    label: "Awaiting Election" },
  accepted:          { badge: "badge-success", icon: "ph-check-circle", label: "Accepted" },
  rejected:          { badge: "badge-info",    icon: "ph-x-circle",     label: "Rejected by Insured" }
};

function renderTriaCard(sub) {
  const box = document.getElementById("triaOfferContainer");
  if (!box || !sub) return;
  const st = getTriaStatus(sub);
  const ui = TRIA_STATE_UI[st.state];
  const canEdit = hasPermission("tria", "edit");
  const canApprove = hasPermission("tria", "approve");
  const t = sub.tria || {};

  const issues = st.issues.map(i => {
    const cls = i.level === "block" ? "alert-danger" : (i.level === "warn" ? "alert-warning" : "");
    const icon = i.level === "block" ? "ph-prohibit" : (i.level === "warn" ? "ph-warning" : "ph-info");
    const neutral = i.level === "info" ? " background:#eff6ff; border-color:#bfdbfe; color:#1e40af;" : "";
    return `<div class="alert ${cls} text-xs" style="margin-top:8px;${neutral}"><i class="ph ${icon}"></i> ${triaEsc(i.text)}</div>`;
  }).join("");

  let body = `<div class="text-xs text-muted" style="margin-bottom:8px;"><i class="ph ph-info"></i> ${triaEsc(st.app.reason)}</div>`;

  if (st.state === "not_applicable") {
    body += `<div class="alert alert-success text-xs"><i class="ph ph-minus-circle"></i> No TRIA offer is required for this submission.</div>`;
  } else if (st.state === "offer_required") {
    const defaultPrem = st.quoted > 0 ? st.quoted : "";
    body += `<div class="alert alert-warning text-xs"><i class="ph ph-warning"></i> <strong>Offer required before bind.</strong> Make the offer, then record the insured's election.</div>`;
    if (canEdit) {
      body += `
      <div class="simulation-tool-box" style="display:block;">
        <span class="tool-label" style="display:block; margin-bottom:8px;"><i class="ph ph-paper-plane-tilt"></i> Make the offer</span>
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          <label class="text-xs text-muted" style="font-size:12px;">Premium for certified acts ($) <input id="triaOfferPremium" type="number" min="0" step="1" class="form-control" style="width:140px;" value="${defaultPrem}"></label>
          <select id="triaDelivery" class="form-control" style="width:250px;">${TRIA_DELIVERY_METHODS.map(m => `<option>${triaEsc(m)}</option>`).join("")}</select>
          <input id="triaOfferNotes" class="form-control" style="flex:1; min-width:180px;" placeholder="Notes (optional)">
        </div>
        <div style="margin-top:8px; font-size:12px;">
          <label style="display:block;"><input type="checkbox" id="triaDiscPremium"> The premium is shown to the insured as a separate line item (not described as a "surcharge")</label>
          <label style="display:block;"><input type="checkbox" id="triaDiscShare"> The federal share of compensation (${TRIA_FEDERAL_SHARE_PCT}%) is disclosed</label>
          <label style="display:block;"><input type="checkbox" id="triaDiscCap"> The ${triaEsc(TRIA_CAP_TEXT)} cap on insured losses is disclosed</label>
        </div>
        <button class="btn btn-sm btn-primary" style="width:auto; margin-top:8px;" onclick="triaCreateOffer()"><i class="ph ph-check"></i> Record offer</button>
      </div>`;
    } else {
      body += `<p class="text-xs text-muted"><i class="ph ph-lock"></i> Your role can view but not make the offer.</p>`;
    }
  } else {
    // there is an offer
    body += `<div class="clean-meta-list" style="margin-bottom:10px;">
      <div class="clean-meta-row"><span class="meta-label">Premium offered (certified acts)</span><span class="meta-value">${triaMoney(t.offer.premium)}</span></div>
      <div class="clean-meta-row"><span class="meta-label">Offered</span><span class="meta-value">${triaEsc(t.offer.offeredAt)} · ${triaEsc(t.offer.offeredBy)}</span></div>
      <div class="clean-meta-row"><span class="meta-label">Delivered by</span><span class="meta-value">${triaEsc(t.offer.deliveryMethod)}</span></div>
      <div class="clean-meta-row"><span class="meta-label">Disclosures</span><span class="meta-value">Premium (separate line) · Federal share ${t.offer.federalSharePct}% · ${triaEsc(t.offer.capText)} cap</span></div>
      ${st.quoted !== null ? `<div class="clean-meta-row"><span class="meta-label">TRIA charge on the quote</span><span class="meta-value">${triaMoney(st.quoted)}</span></div>` : ""}
    </div>
    <details style="margin-bottom:10px;"><summary class="text-xs" style="cursor:pointer;">View notice text sent with the offer</summary>
      <pre style="white-space:pre-wrap; font-size:11.5px; background:#f8fafc; padding:10px; border:1px solid #e2e8f0; border-radius:6px; margin-top:6px;">${triaEsc(t.offer.noticeText)}</pre>
    </details>`;

    if (st.state === "awaiting_election") {
      if (canEdit) {
        body += `
        <div class="simulation-tool-box" style="display:block;">
          <span class="tool-label" style="display:block; margin-bottom:8px;"><i class="ph ph-signature"></i> Record the insured's election${canApprove ? "" : " (accept only — a rejection needs approval authority)"}</span>
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
            <select id="triaDecision" class="form-control" style="width:150px;"><option value="accepted">Accepted</option>${canApprove ? '<option value="rejected">Rejected</option>' : ""}</select>
            <input id="triaSigner" class="form-control" style="width:200px;" placeholder="Name at the insured">
            <input id="triaSignerTitle" class="form-control" style="width:150px;" placeholder="Title">
            <select id="triaMethod" class="form-control" style="width:230px;">${TRIA_ELECTION_METHODS.map(m => `<option>${triaEsc(m)}</option>`).join("")}</select>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:8px;">
            <input id="triaReference" class="form-control" style="width:240px;" placeholder="Form / document reference">
            <input id="triaElectionNotes" class="form-control" style="flex:1; min-width:180px;" placeholder="Notes (optional)">
            <button class="btn btn-sm btn-primary" style="width:auto;" onclick="triaRecordElection()"><i class="ph ph-check"></i> Record election</button>
          </div>
        </div>`;
      } else {
        body += `<p class="text-xs text-muted"><i class="ph ph-lock"></i> Your role can view but not record the election.</p>`;
      }
    } else {
      const e = t.election;
      body += `<div class="clean-meta-list" style="margin-bottom:10px;">
        <div class="clean-meta-row"><span class="meta-label">Election</span><span class="meta-value"><span class="badge ${e.decision === "accepted" ? "badge-success" : "badge-info"} text-xs">${e.decision === "accepted" ? "Accepted" : "Rejected"}</span></span></div>
        <div class="clean-meta-row"><span class="meta-label">By</span><span class="meta-value">${triaEsc(e.signer)}, ${triaEsc(e.title)}</span></div>
        <div class="clean-meta-row"><span class="meta-label">Method / reference</span><span class="meta-value">${triaEsc(e.method)} · ${triaEsc(e.reference)}</span></div>
        <div class="clean-meta-row"><span class="meta-label">Recorded</span><span class="meta-value">${triaEsc(e.recordedAt)} · ${triaEsc(e.recordedBy)}</span></div>
      </div>`;
    }
    if (canEdit) {
      body += `<div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
        <input id="triaWithdrawReason" class="form-control" style="width:300px;" placeholder="Reason to withdraw and re-offer">
        <button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="triaWithdrawOffer()"><i class="ph ph-arrow-counter-clockwise"></i> Withdraw &amp; re-offer</button>
      </div>`;
    }
  }

  const hist = (t.history || []).slice(-3).reverse().map(h =>
    `<tr><td>${triaMoney(h.offer.premium)}</td><td>${h.election ? triaEsc(h.election.decision) : "no election"}</td><td>${triaEsc(h.withdrawnAt)}</td><td>${triaEsc(h.withdrawnBy)}</td><td>${triaEsc(h.reason)}</td></tr>`).join("");

  box.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <h3><i class="ph ph-shield-star"></i> Terrorism Risk Insurance Act (TRIA) Offer &amp; Election</h3>
        <span class="badge ${ui.badge}"><i class="ph ${ui.icon}"></i> ${ui.label}</span>
      </div>
      <div class="card-body">
        ${body}
        ${issues}
        ${hist ? `<h4 style="margin:14px 0 6px;">Earlier offers</h4><div class="rules-table-container"><table class="data-table"><thead><tr><th>Premium</th><th>Election</th><th>Withdrawn</th><th>By</th><th>Reason</th></tr></thead><tbody>${hist}</tbody></table></div>` : ""}
        <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> The notice wording is a template and must be replaced with Compliance-approved text (Treasury model forms: 31 CFR 50.16). Federal share and program end date are configuration. State requirements on terrorism and fire-following cover are not modelled yet.</p>
      </div>
    </div>`;
}

function renderTriaBindBanner(sub) {
  if (!sub) return "";
  const st = getTriaStatus(sub);
  if (!st.blocked) {
    const note = st.state === "not_applicable" ? "TRIA: no offer required for this line." : `TRIA: ${TRIA_STATE_UI[st.state].label.toLowerCase()}, reconciled with the quote.`;
    return `<div class="alert alert-success text-xs" style="margin-bottom:12px;"><i class="ph ph-shield-star"></i> ${note}</div>`;
  }
  const why = st.state === "offer_required" ? "no TRIA offer has been recorded"
    : st.state === "awaiting_election" ? "the insured has not accepted or rejected the TRIA offer"
    : st.issues.filter(i => i.level === "block").map(i => i.text).join(" ");
  return `<div class="alert alert-danger text-xs" style="margin-bottom:12px;"><i class="ph ph-prohibit"></i> <strong>Bind blocked.</strong> ${triaEsc(why)}</div>`;
}

// ----------------------------------------------------------------------------
// 5. HOOKS
// ----------------------------------------------------------------------------
function triaGuardBind(source) {
  const sub = triaActiveSub();
  if (!sub) return true;
  const st = getTriaStatus(sub);
  if (!st.blocked) return true;
  const why = st.state === "offer_required" ? "no TRIA offer recorded"
    : st.state === "awaiting_election" ? "TRIA election not recorded"
    : st.issues.filter(i => i.level === "block").map(i => i.text).join(" ");
  triaLog(sub, "tria_bind_blocked", `Bind attempt blocked (${source}): ${why}`);
  triaPersist();
  showToast(`⛔ Bind blocked: ${why}. See the TRIA section on Quote & Bind.`, "danger");
  renderTriaCard(sub);
  return false;
}

(function installTriaHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.tria_offered = { label: "TRIA Offer Made", icon: "ph-shield-star", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.tria_accepted = { label: "TRIA Coverage Accepted", icon: "ph-shield-check", badge: "badge-success", outcome: "outcome-approve" };
    AUDIT_ACTION_META.tria_rejected = { label: "TRIA Coverage Rejected by Insured", icon: "ph-shield-slash", badge: "badge-warning", outcome: "outcome-refer" };
    AUDIT_ACTION_META.tria_offer_withdrawn = { label: "TRIA Offer Withdrawn", icon: "ph-arrow-counter-clockwise", badge: "badge-light", outcome: "outcome-comm" };
    AUDIT_ACTION_META.tria_bind_blocked = { label: "Bind Blocked — TRIA", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }

  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || triaActiveSub(); if (s) renderTriaCard(s); } catch (e) { console.warn("TRIA card render failed:", e); }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderTriaCard(sub); } catch (e) { console.warn("TRIA card render failed:", e); }
      return r;
    };
  }
  const origESig = window.openESignatureModal;
  if (typeof origESig === "function") {
    window.openESignatureModal = function () {
      if (!triaGuardBind("e-signature")) return;
      return origESig.apply(this, arguments);
    };
  }
  const origIssue = window.issueQuoteAction;
  if (typeof origIssue === "function") {
    window.issueQuoteAction = function () {
      if (!triaGuardBind("issue quote")) return;
      return origIssue.apply(this, arguments);
    };
  }
})();

window.triaCreateOffer = triaCreateOffer;
window.triaRecordElection = triaRecordElection;
window.triaWithdrawOffer = triaWithdrawOffer;
window.renderTriaCard = renderTriaCard;
window.renderTriaBindBanner = renderTriaBindBanner;
window.getTriaStatus = getTriaStatus;
