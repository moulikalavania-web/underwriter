/**
 * ============================================================================
 * FEDERAL FILINGS FOR A MOTOR CARRIER POLICY: MCS-90 AND BMC-91 / 91X
 * ----------------------------------------------------------------------------
 * A for-hire motor carrier cannot lawfully operate without proof of financial responsibility on file with the Federal Motor
 * Carrier Safety Administration. Two things come from the insurer once the policy is bound (49 CFR Part 387):
 *
 *   MCS-90   the endorsement attached to the policy. It promises that the insurer will pay a final judgement for public
 *            liability within the limit, whatever the policy's own conditions say. Attaching it needs a bound policy, a
 *            USDOT number, a limit at or above the statutory minimum for the case ($750,000 unless the case says more) and the
 *            name of the person who signs for the insurer.
 *   BMC-91 / the insurer's filing with FMCSA that the carrier has the required liability cover. It is filed by the insurer, not the
 *   BMC-91X  insured, and appears on FMCSA's Licensing and Insurance record after a few working days (the case records the date it
 *            was filed, the reference, and the date it was seen on record). When the cover ends, the insurer files a notice of
 *            cancellation (BMC-35), which takes effect no sooner than 30 days after FMCSA receives it.
 *
 * This prototype keeps the record: what was attached, filed, confirmed and cancelled, by whom and when, and a due date for the
 * filing (FF_DUE_DAYS after bind). It does not file with FMCSA; that needs the insurer's own FMCSA filing credentials. The
 * endorsement text is a template: use the current form from FMCSA before it is issued to anyone.
 * ============================================================================
 */

const FF_DUE_DAYS = 5;                 // placeholder: days after bind by which the filing should be made
const FF_CANCEL_NOTICE_DAYS = 30;      // a BMC-35 cancels no sooner than this many days after it is filed
const FF_DEFAULT_MINIMUM = 750000;     // 49 CFR 387.9, non-hazardous for-hire property, 10,001 lb and over

function ffToday() { return new Date().toISOString().slice(0, 10); }
function ffDays(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000); }
function ffAdd(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function ffValid(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) && !isNaN(new Date(iso + "T00:00:00Z")); }
function ffV(id) { const e = document.getElementById(id); return e ? String(e.value).trim() : ""; }
function ffSub() { return wsSub(); }
function ffBound(sub) { return !!(sub && sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }
function ffApplicable(sub) { return !!sub && (sub.lobKey || "trucking") === "trucking"; }
function ffStore(sub) { if (!sub.federalFilings) sub.federalFilings = { mcs90: null, bmc91: null, cancel: null }; return sub.federalFilings; }
function ffMinimum(sub) { return Math.max(Number(sub.minStatutoryLimit) || 0, FF_DEFAULT_MINIMUM); }
function ffBoundOn(sub) { const m = /(\d{4}-\d{2}-\d{2})/.exec(String(sub.pasSync && sub.pasSync.syncedAt || "")); return m ? m[1] : ffToday(); }
function ffLog(sub, decision, notes) { wsLog(sub, decision, notes); wsPersist(); if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible(); }
function ffMoney(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("en-US"); }

/** Where each filing stands now. Pure: reads the case. */
function ffStatus(sub) {
  const st = ffStore(sub), today = ffToday();
  const out = { bound: ffBound(sub), mcs90: st.mcs90 ? "attached" : "not_attached", bmc91: "not_filed", due: null, overdue: false, daysLate: 0, cancel: st.cancel ? "filed" : "none" };
  if (st.bmc91) out.bmc91 = st.bmc91.onRecordOn ? "on_record" : "filed";
  if (out.bound) {
    out.due = ffAdd(ffBoundOn(sub), FF_DUE_DAYS);
    if (!st.bmc91 && today > out.due) { out.overdue = true; out.daysLate = ffDays(out.due, today); }
  }
  out.complete = out.bound && out.mcs90 === "attached" && out.bmc91 === "on_record";
  return out;
}

// ----------------------------------------------------------------------------
// ACTIONS
// ----------------------------------------------------------------------------
function ffCan(level) {
  if (!hasPermission("binders", level)) { denyPermission("binders", level); return false; }
  return true;
}

function ffAttachMcs90() {
  const sub = ffSub(); if (!sub || !ffApplicable(sub)) return;
  if (!ffCan("approve")) return;
  const st = ffStore(sub);
  if (!ffBound(sub)) { showToast("⛔ The MCS-90 is attached to a bound policy. Bind first.", "danger"); return; }
  if (st.mcs90) { showToast("The MCS-90 is already attached.", "info"); return; }
  if (!sub.dot) { showToast("⛔ A USDOT number is needed on the case before the MCS-90 can be issued.", "danger"); return; }
  const limit = parseFloat(ffV("ff_mcsLimit").replace(/[^0-9.]/g, "")), signer = ffV("ff_mcsSigner");
  const min = ffMinimum(sub);
  if (!(limit >= min)) { showToast("⛔ The limit must be at least the statutory minimum for this case, " + ffMoney(min) + ".", "danger"); return; }
  if (signer.length < 5) { showToast("⛔ Enter the name of the person who signs the endorsement for the insurer.", "danger"); return; }
  st.mcs90 = { limit: limit, signer: signer, attachedAt: wsNow(), attachedBy: wsActor(), policyNumber: sub.pasSync.policyNumber };
  if (!sub.docs) sub.docs = [];
  if (!sub.docs.some(d => /MCS-90/.test(d.name))) sub.docs.push({ name: "MCS-90 endorsement " + sub.pasSync.policyNumber + ".html", type: "pdf", desc: "MCS-90 endorsement attached to the policy • " + ffMoney(limit) });
  ffLog(sub, "ff_mcs90_attached", "MCS-90 endorsement attached to policy " + sub.pasSync.policyNumber + " at " + ffMoney(limit) + ", signed for the insurer by " + signer + ".");
  if (typeof notify === "function") notify(sub.assignedTo, { title: "MCS-90 attached on " + sub.id, text: sub.insured + ": the endorsement is on policy " + sub.pasSync.policyNumber + ".", caseId: sub.id, kind: "filing" });
  showToast("✅ MCS-90 attached to " + sub.pasSync.policyNumber + ".", "success");
  renderFederalFilings(sub);
}

function ffRecordFiling() {
  const sub = ffSub(); if (!sub || !ffApplicable(sub)) return;
  if (!ffCan("approve")) return;
  const st = ffStore(sub);
  if (!ffBound(sub)) { showToast("⛔ The filing follows the bind.", "danger"); return; }
  if (st.bmc91) { showToast("A filing is already recorded.", "info"); return; }
  const form = ffV("ff_form") || "BMC-91X", filedOn = ffV("ff_filedOn"), ref = ffV("ff_ref");
  if (!ffValid(filedOn)) { showToast("⛔ Enter the date the filing was made.", "danger"); return; }
  if (filedOn > ffToday()) { showToast("⛔ The filing date cannot be in the future.", "danger"); return; }
  if (filedOn < ffBoundOn(sub)) { showToast("⛔ The filing cannot be dated before the policy was bound (" + ffBoundOn(sub) + ").", "danger"); return; }
  if (ref.length < 3) { showToast("⛔ Enter the reference FMCSA or your filing service gave the filing.", "danger"); return; }
  st.bmc91 = { form: form, filedOn: filedOn, ref: ref, filedBy: wsActor(), recordedAt: wsNow(), onRecordOn: null };
  ffLog(sub, "ff_bmc91_filed", form + " filing recorded for USDOT " + sub.dot + " on " + filedOn + ", reference " + ref + ".");
  showToast("✅ " + form + " filing recorded. Check FMCSA's L&I record in a few working days and record the date it shows.", "success");
  renderFederalFilings(sub);
}

function ffConfirmOnRecord() {
  const sub = ffSub(); if (!sub) return;
  if (!ffCan("approve")) return;
  const st = ffStore(sub);
  if (!st.bmc91) { showToast("⛔ Record the filing first.", "danger"); return; }
  const on = ffV("ff_onRecordOn");
  if (!ffValid(on)) { showToast("⛔ Enter the date the filing shows on FMCSA's record.", "danger"); return; }
  if (on < st.bmc91.filedOn) { showToast("⛔ It cannot be on record before it was filed (" + st.bmc91.filedOn + ").", "danger"); return; }
  if (on > ffToday()) { showToast("⛔ The date cannot be in the future.", "danger"); return; }
  st.bmc91.onRecordOn = on; st.bmc91.confirmedBy = wsActor();
  ffLog(sub, "ff_bmc91_on_record", st.bmc91.form + " seen on FMCSA's Licensing and Insurance record on " + on + " (" + ffDays(st.bmc91.filedOn, on) + " day(s) after it was filed).");
  showToast("✅ The filing is on FMCSA's record.", "success");
  renderFederalFilings(sub);
}

function ffRecordCancellation() {
  const sub = ffSub(); if (!sub) return;
  if (!ffCan("override")) return;
  const st = ffStore(sub);
  if (!st.bmc91 || !st.bmc91.onRecordOn) { showToast("⛔ There is no filing on record to cancel.", "danger"); return; }
  if (st.cancel) { showToast("A notice of cancellation is already recorded.", "info"); return; }
  const filedOn = ffV("ff_cancelFiledOn"), eff = ffV("ff_cancelEffective"), why = ffV("ff_cancelWhy");
  if (!ffValid(filedOn) || !ffValid(eff)) { showToast("⛔ Enter the date the notice was filed and the date it takes effect.", "danger"); return; }
  if (filedOn > ffToday()) { showToast("⛔ The notice cannot be dated in the future.", "danger"); return; }
  if (ffDays(filedOn, eff) < FF_CANCEL_NOTICE_DAYS) { showToast("⛔ A notice of cancellation takes effect no sooner than " + FF_CANCEL_NOTICE_DAYS + " days after it is filed (earliest " + ffAdd(filedOn, FF_CANCEL_NOTICE_DAYS) + ").", "danger"); return; }
  if (why.length < 10) { showToast("⛔ Say why the cover is ending (at least 10 characters).", "danger"); return; }
  st.cancel = { form: "BMC-35", filedOn: filedOn, effective: eff, reason: why, by: wsActor(), recordedAt: wsNow() };
  ffLog(sub, "ff_bmc35_filed", "Notice of cancellation (BMC-35) filed " + filedOn + ", effective " + eff + ": " + why);
  showToast("✅ Notice of cancellation recorded. It takes effect on " + eff + ".", "warning");
  renderFederalFilings(sub);
}

// ----------------------------------------------------------------------------
// THE ENDORSEMENT TEXT AND THE CARD
// ----------------------------------------------------------------------------
function ffMcs90Html(sub) {
  const m = (sub.federalFilings || {}).mcs90; if (!m) return "";
  return `<h3>ENDORSEMENT FOR MOTOR CARRIER POLICIES OF INSURANCE FOR PUBLIC LIABILITY UNDER SECTIONS 29 AND 30 OF THE MOTOR CARRIER ACT OF 1980 (MCS-90)</h3>
    <p class="ws-small">Template for review. Use the current form published by FMCSA before issuing it.</p>
    <table class="data-table"><tbody>
    <tr><td>Insurer</td><td>${wsEsc(sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : ""))}</td></tr>
    <tr><td>Policy number</td><td>${wsEsc(m.policyNumber)}</td></tr><tr><td>Effective date</td><td>${wsEsc((sub.pasSync && sub.pasSync.effectiveDate) || sub.effectiveDate || "")}</td></tr>
    <tr><td>Named insured</td><td>${wsEsc(sub.insured)}</td></tr><tr><td>USDOT / MC</td><td>${wsEsc(sub.dot || "")} / ${wsEsc(sub.mcNumber || "not stated")}</td></tr>
    <tr><td>Limit of liability (each accident)</td><td>${ffMoney(m.limit)}</td></tr><tr><td>Signed for the insurer</td><td>${wsEsc(m.signer)}, ${wsEsc(m.attachedAt)}</td></tr></tbody></table>
    <p class="ws-small">The insurer agrees to pay, within the limit above, any final judgement recovered against the insured for public liability resulting from negligence in the operation, maintenance or use of motor vehicles subject to the financial responsibility requirements of Sections 29 and 30 of the Motor Carrier Act of 1980, regardless of whether each motor vehicle is specifically described in the policy.</p>`;
}
function ffPrintMcs90() {
  const sub = ffSub(); if (!sub) return;
  const w = window.open("", "_blank"); if (!w) { showToast("The browser blocked the print window.", "warning"); return; }
  w.document.write("<html><head><title>MCS-90</title><style>body{font-family:Segoe UI,Arial,sans-serif;font-size:12px;padding:20px}table{border-collapse:collapse;width:100%}td{border:1px solid #cbd5e1;padding:4px 8px}.ws-small{font-size:11px;color:#475569}</style></head><body>" + ffMcs90Html(sub) + "</body></html>");
  w.document.close(); w.focus(); w.print();
}

function renderFederalFilings(sub) {
  const box = document.getElementById("federalFilingsContainer");
  if (!box) return;
  if (!sub || !ffApplicable(sub)) { box.innerHTML = ""; return; }
  const s = ffStatus(sub), st = ffStore(sub), min = ffMinimum(sub);
  const badge = (cls, t) => `<span class="badge ${cls}">${t}</span>`;
  const head = !s.bound ? badge("badge-light", "After bind") : s.complete ? badge("badge-success", "Complete") : s.overdue ? badge("badge-danger", "Filing overdue by " + s.daysLate + " day(s)") : badge("badge-warning", "Open");
  const input = (id, ph, w, val) => `<input id="${id}" class="form-control" style="width:${w}px;" placeholder="${ph}"${val ? ` value="${wsEsc(val)}"` : ""}>`;
  let body = "";
  if (!s.bound) body = `<p class="ws-small text-muted" style="margin:0;">The MCS-90 endorsement and the BMC-91 / 91X filing follow the bind. Until the policy is bound there is nothing to attach or file.</p>`;
  else {
    const m = st.mcs90;
    body += `<h4 style="margin:6px 0; font-size:13px;">MCS-90 endorsement ${m ? badge("badge-success", "Attached") : badge("badge-warning", "Not attached")}</h4>` + (m
      ? `<p class="ws-small" style="margin:0 0 6px;">Attached to ${wsEsc(m.policyNumber)} at ${ffMoney(m.limit)}, signed for the insurer by ${wsEsc(m.signer)} on ${wsEsc(m.attachedAt)} (${wsEsc(m.attachedBy)}). <a href="#" onclick="ffPrintMcs90(); return false;">Print the endorsement</a></p>`
      : `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">${input("ff_mcsLimit", "Limit (minimum " + ffMoney(min) + ")", 190, String(min))}${input("ff_mcsSigner", "Signed for the insurer by (name)", 230)}<button class="btn btn-primary btn-sm" onclick="ffAttachMcs90()"><i class="ph ph-paperclip"></i> Attach MCS-90</button></div>`);
    const b = st.bmc91;
    body += `<h4 style="margin:10px 0 6px; font-size:13px;">BMC-91 / 91X filing with FMCSA ${b ? (b.onRecordOn ? badge("badge-success", "On record") : badge("badge-warning", "Filed, not yet seen on record")) : (s.overdue ? badge("badge-danger", "Not filed, was due " + s.due) : badge("badge-warning", "Not filed, due " + s.due))}</h4>`;
    if (!b) body += `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;"><select id="ff_form" class="form-control" style="width:120px;"><option>BMC-91X</option><option>BMC-91</option></select>${input("ff_filedOn", "Filed on (yyyy-mm-dd)", 170, ffToday())}${input("ff_ref", "FMCSA reference", 200)}<button class="btn btn-primary btn-sm" onclick="ffRecordFiling()"><i class="ph ph-paper-plane-tilt"></i> Record the filing</button></div><p class="ws-small text-muted" style="margin:6px 0 0;">The insurer files with FMCSA; this records that it was done. It is not sent from here.</p>`;
    else {
      body += `<p class="ws-small" style="margin:0 0 6px;">${wsEsc(b.form)} filed ${wsEsc(b.filedOn)}, reference ${wsEsc(b.ref)} (${wsEsc(b.filedBy)}).${b.onRecordOn ? " Seen on FMCSA's record on " + wsEsc(b.onRecordOn) + "." : ""}</p>`;
      if (!b.onRecordOn) body += `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">${input("ff_onRecordOn", "Shown on L&I record on (yyyy-mm-dd)", 250, ffToday())}<button class="btn btn-outline btn-sm" onclick="ffConfirmOnRecord()"><i class="ph ph-check"></i> It is on record</button></div>`;
    }
    if (b && b.onRecordOn) {
      body += `<h4 style="margin:10px 0 6px; font-size:13px;">Notice of cancellation (BMC-35) ${st.cancel ? badge("badge-danger", "Filed") : badge("badge-light", "None")}</h4>` + (st.cancel
        ? `<p class="ws-small" style="margin:0;">Filed ${wsEsc(st.cancel.filedOn)}, takes effect ${wsEsc(st.cancel.effective)}: ${wsEsc(st.cancel.reason)}</p>`
        : `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">${input("ff_cancelFiledOn", "Notice filed on", 130, "")}${input("ff_cancelEffective", "Takes effect on (30+ days later)", 220, "")}${input("ff_cancelWhy", "Why the cover is ending", 260)}<button class="btn btn-outline btn-sm text-danger" onclick="ffRecordCancellation()"><i class="ph ph-prohibit"></i> Record the notice</button></div>`);
    }
  }
  box.innerHTML = `<div class="card"><div class="card-header"><h3><i class="ph ph-truck"></i> Federal filings (motor carrier)</h3>${head}</div><div class="card-body">${body}</div></div>`;
}

(function ffWire() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.ff_mcs90_attached = { label: "MCS-90 Attached", icon: "ph-paperclip", badge: "badge-success", outcome: "outcome-approve" };
    AUDIT_ACTION_META.ff_bmc91_filed = { label: "BMC-91 / 91X Filing Recorded", icon: "ph-paper-plane-tilt", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.ff_bmc91_on_record = { label: "Filing Seen On FMCSA Record", icon: "ph-seal-check", badge: "badge-success", outcome: "outcome-approve" };
    AUDIT_ACTION_META.ff_bmc35_filed = { label: "Notice Of Cancellation (BMC-35) Recorded", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }
})();
registerStepRenderer("federalFilings", renderFederalFilings);

window.ffStatus = ffStatus; window.ffAttachMcs90 = ffAttachMcs90; window.ffRecordFiling = ffRecordFiling; window.ffConfirmOnRecord = ffConfirmOnRecord;
window.ffRecordCancellation = ffRecordCancellation; window.ffPrintMcs90 = ffPrintMcs90; window.renderFederalFilings = renderFederalFilings; window.ffMcs90Html = ffMcs90Html;
