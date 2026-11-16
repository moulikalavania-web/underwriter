/**
 * ============================================================================
 * CASE FILE, PART 2: BILLING AND PREMIUM FINANCE, PREMIUM ESTIMATE, COPY QUOTE / SUBMISSION, ADDITIONAL INSUREDS,
 * ELIGIBILITY AND IFTA TABS
 * ----------------------------------------------------------------------------
 * More tabs on the Case File page (js/case-file.js asks this file for them):
 *
 *   ADDITIONAL INSURED  the parties added to the policy: lender or loss payee, landlord, customer or shipper. Added with a relationship
 *                       and a basis; ended with a reason, never deleted. CERTIFICATE HOLDERS are not entered here: they are recorded once, on
 *                       the certificate (Binders & certificates), and this tab lists them from there, read-only.
 *   ELIGIBILITY         the product's eligibility questions with the case's answers ("Not Provided" where the case has none) and
 *                       the appetite rules with their pass or fail. A view of what the case already holds.
 *   IFTA MILEAGE        the IFTA reports read for the case: miles by jurisdiction, annual miles, miles per gallon, share of miles
 *                       in the home state, and the checks against the application. A view of what the case already holds.
 *   BILLING             the invoice made at bind, the payments received against it (recorded by a person, voidable with a reason,
 *                       never over the balance), the status (Unpaid, Partial, Paid, Overdue) and premium finance: the finance
 *                       company, the down payment, the number of instalments and the finance charge are entered; the instalment
 *                       schedule is worked out. No rate, fee or finance charge is built in.
 *   QUOTE & ESTIMATE    (1) a PREMIUM ESTIMATE from a rate table that an authorised person fills in (a rate per power unit, per $100 of
 *                       value or per $1,000 of revenue, with a minimum). It is an estimate only: the imported rating file sets the
 *                       quoted premium, and the page shows the difference. With no rate for the line it says so. (2) QUOTE OPTIONS:
 *                       copy the latest quote as an option with a different limit, deductible or premium; options sit in the quote
 *                       ledger and can be compared, and are never the bindable quote. (3) COPY SUBMISSION: a new case from this one
 *                       (another line, or a new term) with the insured, the fleet and the drivers copied, and none of the quotes, notes,
 *                       documents or policy; it goes through the Phase 1 checks like any other new case.
 * ============================================================================
 */

const CM_RATES_KEY = "FUT_RATE_TABLE_V1";
const CM_PAY_METHODS = ["Check", "ACH", "Wire", "Card", "Premium finance company", "Other"];
const CM_AI_KINDS = ["Lender / loss payee", "Landlord", "Customer / shipper", "Other"];   // certificate holders are not here: they are recorded once, on the certificate
const CM_BASES = { power_unit: { label: "per power unit", per: 1 }, tiv: { label: "per $100 of value", per: 100 }, revenue: { label: "per $1,000 of revenue", per: 1000 } };
var CM_RATES = [];
try { const r = JSON.parse(localStorage.getItem(CM_RATES_KEY)); if (Array.isArray(r)) CM_RATES = r; } catch (e) { /* none yet */ }

function cmMoney(n) { return n === null || n === undefined || isNaN(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function cmCents(n) { return Math.round(Number(n) * 100) / 100; }
function cmLog(sub, decision, notes) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 1, decision, by: actorLabel(), at: nowStamp(), notes }); cfSave(); }
function cmDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s)); }
function cmAddMonths(iso, n) { const d = new Date(iso + "T00:00:00Z"), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); }

if (typeof AUDIT_ACTION_META !== "undefined") {
  const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
  AUDIT_ACTION_META.additional_insured_added = m("Additional Insured Added", "ph-user-plus", "badge-light", "outcome-comm");
  AUDIT_ACTION_META.additional_insured_ended = m("Additional Insured Ended", "ph-user-minus", "badge-light", "outcome-comm");
  AUDIT_ACTION_META.payment_recorded = m("Payment Recorded", "ph-currency-dollar", "badge-success", "outcome-comm");
  AUDIT_ACTION_META.payment_voided = m("Payment Voided", "ph-arrow-u-up-left", "badge-warning", "outcome-refer");
  AUDIT_ACTION_META.premium_finance_set = m("Premium Finance Recorded", "ph-bank", "badge-info", "outcome-comm");
  AUDIT_ACTION_META.premium_finance_cancelled = m("Premium Finance Ended", "ph-bank", "badge-warning", "outcome-refer");
  AUDIT_ACTION_META.quote_option_added = m("Quote Option Added", "ph-copy", "badge-light", "outcome-comm");
  AUDIT_ACTION_META.submission_copied = m("Submission Copied", "ph-copy", "badge-light", "outcome-comm");
  AUDIT_ACTION_META.quote_reopened = m("Quote Reopened", "ph-arrow-counter-clockwise", "badge-warning", "outcome-refer");
}

// ----------------------------------------------------------------------------
// 1. ADDITIONAL INSUREDS
// ----------------------------------------------------------------------------
function cmAddAI(sub, f) {
  if (!sub) return { ok: false, message: "No case is open." };
  const name = String(f.name || "").trim();
  if (name.length < 2) return { ok: false, message: "Enter the name of the additional insured." };
  if (CM_AI_KINDS.indexOf(f.kind) < 0) return { ok: false, message: "Choose the relationship." };
  if (["Specific", "Blanket"].indexOf(f.basis) < 0) return { ok: false, message: "Choose whether it is specific or blanket." };
  if (!sub.additionalInsureds) sub.additionalInsureds = [];
  if (sub.additionalInsureds.some(a => !a.endedAt && a.name.toLowerCase() === name.toLowerCase() && a.kind === f.kind)) return { ok: false, message: name + " is already listed as " + f.kind.toLowerCase() + "." };
  const a = { id: "AI-" + (sub.additionalInsureds.length + 1), name, kind: f.kind, basis: f.basis, address: String(f.address || "").trim(), addedBy: actorLabel(), addedAt: nowStamp(), endedAt: null, endReason: null };
  sub.additionalInsureds.push(a);
  cmLog(sub, "additional_insured_added", `${name} added as ${f.kind.toLowerCase()} (${f.basis.toLowerCase()}).`);
  return { ok: true, item: a };
}
function cmEndAI(sub, id, reason) {
  const a = (sub.additionalInsureds || []).find(x => x.id === id);
  if (!a || a.endedAt) return { ok: false, message: "That entry is not active." };
  if (String(reason || "").trim().length < 5) return { ok: false, message: "Give a reason (at least 5 characters)." };
  a.endedAt = nowStamp(); a.endReason = String(reason).trim();
  cmLog(sub, "additional_insured_ended", `${a.name} ended: ${a.endReason}`);
  return { ok: true, item: a };
}
/** The certificate holders on a case, read from its certificates (the one place they are recorded). */
function cmCertHolders(sub) {
  return (sub.certificates || []).filter(c => c.holderName).map(c => ({ id: c.id, name: c.holderName, type: c.holderType || "Certificate holder", status: c.status || "issued" }));
}
function cmAIHtml(sub) {
  const can = cfCanEdit(sub), list = sub.additionalInsureds || [], holders = cmCertHolders(sub);
  const form = can ? `<div class="card"><div class="card-body"><div class="mw-grid"><div class="form-group mw-wide"><label for="cm_ainame">Name</label><input class="form-control" id="cm_ainame"></div><div class="form-group"><label for="cm_aikind">Relationship</label><select class="form-control" id="cm_aikind">${CM_AI_KINDS.map(k => `<option>${k}</option>`).join("")}</select></div>
    <div class="form-group"><label for="cm_aibasis">Basis</label><select class="form-control" id="cm_aibasis"><option>Specific</option><option>Blanket</option></select></div><div class="form-group mw-wide"><label for="cm_aiaddr">Address <span class="text-muted">(optional)</span></label><input class="form-control" id="cm_aiaddr"></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="cmAddAIUi()">Add</button></div></div></div>` : "";
  const rows = list.length ? `<div class="card"><div class="card-body"><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Name</th><th>Relationship</th><th>Basis</th><th>Added</th><th></th></tr></thead><tbody>${list.map(a => `<tr${a.endedAt ? ' class="mw-done"' : ""}><td><strong>${escHtml(a.name)}</strong><div class="p1-note">${escHtml(a.address || "")}</div></td><td>${escHtml(a.kind)}</td><td>${a.basis}</td><td>${escHtml(a.addedAt)} · ${escHtml(a.addedBy)}</td><td>${a.endedAt ? `Ended ${escHtml(a.endedAt)}: ${escHtml(a.endReason)}` : (can ? `<input class="form-control" id="cm_aiwhy_${a.id}" placeholder="Reason to end" style="width:170px;display:inline-block;"> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="cmEndAIUi('${a.id}')">End</button>` : "")}</td></tr>`).join("")}</tbody></table></div></div></div>` : `<div class="mw-empty">No additional insureds on this case.</div>`;
  const certs = holders.length ? `<div class="card"><div class="card-header"><h3><i class="ph ph-certificate"></i> Certificate holders</h3><span class="badge badge-light">from Certificates</span></div><div class="card-body"><table class="data-table"><thead><tr><th>Holder</th><th>Type</th><th>Certificate</th><th>Status</th></tr></thead><tbody>${holders.map(h => `<tr><td><strong>${escHtml(h.name)}</strong></td><td>${escHtml(h.type)}</td><td>${escHtml(h.id)}</td><td>${escHtml(h.status)}</td></tr>`).join("")}</tbody></table><div class="p1-note">Certificate holders are recorded once, when a certificate is issued, and are not entered again here. A party that needs additional-insured rights is added above.</div></div></div>` : "";
  return form + rows + certs;
}
function cmAddAIUi() { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = cmAddAI(sub, { name: cfRead("cm_ainame"), kind: cfRead("cm_aikind"), basis: cfRead("cm_aibasis"), address: cfRead("cm_aiaddr") }); showToast(r.ok ? "✅ Added." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }
function cmEndAIUi(id) { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = cmEndAI(sub, id, cfRead("cm_aiwhy_" + id)); showToast(r.ok ? "Ended." : "⛔ " + r.message, r.ok ? "info" : "danger"); cfRender(); }

// ----------------------------------------------------------------------------
// 2. ELIGIBILITY AND IFTA (views of what the case holds)
// ----------------------------------------------------------------------------
function cmEligibilityHtml(sub) {
  const groups = sub.questionnaireGroups || [], rules = sub.appetiteRules || [];
  if (!groups.length && !rules.length) return `<div class="mw-empty">No eligibility questions or appetite rules are on this case. They come from the product loaded in Product Studio.</div>`;
  const qs = groups.map(g => `<div class="card"><div class="card-header"><h3>${escHtml(g.title)}</h3></div><div class="card-body"><table class="data-table"><tbody>${(g.items || []).map(i => `<tr><td style="width:55%;">${escHtml(i.q)}</td><td>${i.a === null || i.a === undefined || i.a === "" ? '<span class="text-muted">Not Provided</span>' : escHtml(i.a)}</td></tr>`).join("")}</tbody></table></div></div>`).join("");
  const ap = rules.length ? `<div class="card"><div class="card-header"><h3>Appetite rules</h3></div><div class="card-body"><table class="data-table"><thead><tr><th>Rule</th><th>Submitted</th><th>Required</th><th>Result</th></tr></thead><tbody>${rules.map(r => `<tr><td>${escHtml(r.factor)}</td><td>${escHtml(r.val)}</td><td>${escHtml(r.guardrail || ((r.operator || "") + " " + (r.baseValue === undefined ? "" : r.baseValue)))}</td><td>${r.pass === true ? '<span class="badge badge-success">Pass</span>' : r.pass === false ? '<span class="badge badge-danger">Fail</span>' : '<span class="badge badge-light">Not evaluated</span>'}</td></tr>`).join("")}</tbody></table></div></div>` : "";
  return qs + ap;
}
function cmIftaHtml(sub) {
  const a = typeof iftaAnalyze === "function" ? iftaAnalyze(sub) : null;
  if (!a) return `<div class="mw-empty">No IFTA report has been read for this case. Attach the quarterly IFTA reports and confirm the extracted data.</div>`;
  const tile = (n, l) => `<div class="mw-tile"><div class="mw-tile-n">${n}</div><div class="mw-tile-l">${l}</div></div>`;
  return `<div class="mw-tiles">${tile(Math.round(a.miles).toLocaleString("en-US"), "Miles read")}${tile(Math.round(a.annual).toLocaleString("en-US"), "Annualised miles")}${tile(a.mpg ? a.mpg.toFixed(1) : "—", "Miles per gallon")}${tile(a.homeShare === null ? "—" : Math.round(a.homeShare * 100) + "%", "Miles in " + (a.home || "home state"))}${tile(a.jurisdictions, "Jurisdictions")}</div>
    <div class="card"><div class="card-header"><h3>Miles by jurisdiction (${a.quarters} quarter${a.quarters === 1 ? "" : "s"})</h3></div><div class="card-body"><table class="data-table"><thead><tr><th>Jurisdiction</th><th>Miles</th><th>Share</th></tr></thead><tbody>${a.states.map(s => `<tr><td>${escHtml(s.state)}</td><td>${Math.round(s.miles).toLocaleString("en-US")}</td><td>${Math.round(s.share * 100)}%</td></tr>`).join("")}</tbody></table></div></div>
    ${a.flags.length ? `<div class="card"><div class="card-header"><h3>Checks against the application</h3></div><div class="card-body"><ul class="cl-lines">${a.flags.map(f => `<li class="${f.level === "warn" ? "bad" : ""}"><i class="ph ${f.level === "warn" ? "ph-warning" : "ph-info"}"></i> ${escHtml(f.text)}</li>`).join("")}</ul></div></div>` : ""}`;
}

// ----------------------------------------------------------------------------
// 3. BILLING AND PREMIUM FINANCE
// ----------------------------------------------------------------------------
function cmBilling(sub) { if (!sub.billing) sub.billing = { payments: [], finance: null }; return sub.billing; }
function cmInvoice(sub) { return sub.invoice || null; }
function cmTotalDue(sub) { const i = cmInvoice(sub); return i ? cmCents(i.totalCharges || 0) : 0; }
function cmPaid(sub) { return cmCents(cmBilling(sub).payments.filter(p => !p.voidedAt).reduce((n, p) => n + p.amount, 0)); }
function cmBalance(sub) { return cmCents(cmTotalDue(sub) - cmPaid(sub)); }
/** No invoice, Paid, Partial, Overdue (a balance after the due date) or Unpaid. */
function cmBillStatus(sub, today) {
  if (!cmInvoice(sub)) return "No invoice";
  const bal = cmBalance(sub);
  if (bal <= 0) return "Paid";
  const due = String(cmInvoice(sub).paymentDue || "").slice(0, 10);
  if (due && due < (today || todayIso())) return "Overdue";
  return cmPaid(sub) > 0 ? "Partial" : "Unpaid";
}
function cmRecordPayment(sub, f) {
  if (!cmInvoice(sub)) return { ok: false, message: "There is no invoice yet. It is made when the policy is bound." };
  const amount = cmCents(f.amount);
  if (!(amount > 0)) return { ok: false, message: "Enter the amount received." };
  if (amount > cmBalance(sub) + 0.001) return { ok: false, message: "That is more than the balance of " + cmMoney(cmBalance(sub)) + "." };
  if (!cmDate(f.date)) return { ok: false, message: "Enter the date received." };
  if (f.date > todayIso()) return { ok: false, message: "The date received cannot be in the future." };
  if (CM_PAY_METHODS.indexOf(f.method) < 0) return { ok: false, message: "Choose how it was paid." };
  if (String(f.reference || "").trim().length < 2) return { ok: false, message: "Enter a reference (check number, transaction id)." };
  const b = cmBilling(sub), p = { id: "PAY-" + (b.payments.length + 1), date: f.date, amount, method: f.method, reference: String(f.reference).trim(), by: actorLabel(), at: nowStamp(), voidedAt: null, voidReason: null };
  b.payments.push(p);
  cmLog(sub, "payment_recorded", `${cmMoney(amount)} received by ${f.method.toLowerCase()} (${p.reference}); balance ${cmMoney(cmBalance(sub))}.`);
  return { ok: true, payment: p };
}
function cmVoidPayment(sub, id, reason) {
  const p = cmBilling(sub).payments.find(x => x.id === id);
  if (!p || p.voidedAt) return { ok: false, message: "That payment cannot be voided." };
  if (String(reason || "").trim().length < 5) return { ok: false, message: "Give a reason (at least 5 characters)." };
  p.voidedAt = nowStamp(); p.voidReason = String(reason).trim();
  cmLog(sub, "payment_voided", `${p.id} (${cmMoney(p.amount)}) voided: ${p.voidReason}`);
  return { ok: true, payment: p };
}
/** The instalment schedule: (financed + charge) split over n instalments; the last takes the rounding. */
function cmSchedule(financed, charge, n, firstDue) {
  const total = cmCents(financed + charge), each = Math.floor(total / n * 100) / 100, out = [];
  let left = total;
  for (let i = 0; i < n; i++) { const amt = i === n - 1 ? cmCents(left) : each; left = cmCents(left - amt); out.push({ no: i + 1, due: cmAddMonths(firstDue, i), amount: amt, paidAt: null, paidBy: null }); }
  return out;
}
function cmSetFinance(sub, f) {
  const inv = cmInvoice(sub);
  if (!inv) return { ok: false, message: "There is no invoice yet. Premium finance is recorded after the policy is bound." };
  const b = cmBilling(sub);
  if (b.finance && b.finance.status === "active") return { ok: false, message: "Premium finance is already recorded. End it first to record a different arrangement." };
  if (String(f.company || "").trim().length < 2) return { ok: false, message: "Enter the premium finance company." };
  const total = cmTotalDue(sub), down = cmCents(f.down), charge = cmCents(f.charge), n = Number(f.n);
  if (!(down >= 0) || down >= total) return { ok: false, message: "The down payment must be at least 0 and less than the total of " + cmMoney(total) + "." };
  if (!(charge >= 0) || String(f.charge) === "") return { ok: false, message: "Enter the finance charge in dollars (0 if there is none)." };
  if (!Number.isInteger(n) || n < 2 || n > 12) return { ok: false, message: "Choose 2 to 12 instalments." };
  if (!cmDate(f.firstDue)) return { ok: false, message: "Enter the date of the first instalment." };
  if (f.firstDue < String(inv.issuedAt || "").slice(0, 10)) return { ok: false, message: "The first instalment cannot be before the invoice date." };
  const financed = cmCents(total - down);
  b.finance = { status: "active", company: String(f.company).trim(), total, down, financed, charge, n, firstDue: f.firstDue, schedule: cmSchedule(financed, charge, n, f.firstDue), by: actorLabel(), at: nowStamp(), endedAt: null, endReason: null };
  cmLog(sub, "premium_finance_set", `Premium finance with ${b.finance.company}: ${cmMoney(financed)} financed over ${n} instalments, finance charge ${cmMoney(charge)}, down payment ${cmMoney(down)}.`);
  return { ok: true, finance: b.finance };
}
function cmEndFinance(sub, reason) {
  const fin = cmBilling(sub).finance;
  if (!fin || fin.status !== "active") return { ok: false, message: "There is no active premium finance." };
  if (String(reason || "").trim().length < 5) return { ok: false, message: "Give a reason (at least 5 characters)." };
  fin.status = "ended"; fin.endedAt = nowStamp(); fin.endReason = String(reason).trim();
  cmLog(sub, "premium_finance_cancelled", `Premium finance with ${fin.company} ended: ${fin.endReason}`);
  return { ok: true };
}
function cmPayInstallment(sub, no) {
  const fin = cmBilling(sub).finance; if (!fin || fin.status !== "active") return false;
  const i = fin.schedule.find(x => x.no === no); if (!i || i.paidAt) return false;
  i.paidAt = nowStamp(); i.paidBy = actorLabel(); cfSave(); return true;
}
function cmBillingHtml(sub) {
  const inv = cmInvoice(sub), can = cfCanEdit(sub);
  if (!inv) return `<div class="mw-empty">No invoice yet. The invoice is made when the policy is bound; payments and premium finance are recorded against it.</div>`;
  const st = cmBillStatus(sub), b = cmBilling(sub), fin = b.finance;
  const cls = { Paid: "badge-success", Partial: "badge-warning", Unpaid: "badge-light", Overdue: "badge-danger" }[st];
  const tile = (n, l) => `<div class="mw-tile"><div class="mw-tile-n" style="font-size:20px;">${n}</div><div class="mw-tile-l">${l}</div></div>`;
  const head = `<div class="card"><div class="card-header"><h3><i class="ph ph-receipt"></i> Invoice ${escHtml(inv.invoiceNumber)}</h3><span class="badge ${cls}">${st}</span></div><div class="card-body">
    <div class="mw-tiles">${tile(cmMoney(cmTotalDue(sub)), "Total charges")}${tile(cmMoney(cmPaid(sub)), "Received")}${tile(cmMoney(cmBalance(sub)), "Balance")}${tile(escHtml(String(inv.paymentDue || "").slice(0, 10) || "—"), "Payment due")}</div>
    <div class="p1-summary"><div><div class="p1-k">Policy</div><div class="p1-v">${escHtml(inv.policyNumber)}</div></div><div><div class="p1-k">Billing model</div><div class="p1-v">${escHtml(inv.billingModel || "—")}</div></div><div><div class="p1-k">Gross premium</div><div class="p1-v">${cmMoney(inv.grossPremium)}</div></div><div><div class="p1-k">Broker fee</div><div class="p1-v">${cmMoney(inv.brokerFee)}</div></div><div><div class="p1-k">Taxes and fees</div><div class="p1-v">${cmMoney((inv.surplusTax || 0) + (inv.stampingFee || 0))}</div></div><div><div class="p1-k">Net due to MGA</div><div class="p1-v">${cmMoney(inv.netDueToMga)}</div></div></div></div></div>`;
  const payForm = can && cmBalance(sub) > 0 ? `<div class="mw-grid"><div class="form-group"><label for="cm_pdate">Date received</label><input type="date" class="form-control" id="cm_pdate" value="${todayIso()}" max="${todayIso()}"></div><div class="form-group"><label for="cm_pamt">Amount</label><input class="form-control" id="cm_pamt" inputmode="decimal" placeholder="${cmBalance(sub).toFixed(2)}"></div>
    <div class="form-group"><label for="cm_pmeth">Method</label><select class="form-control" id="cm_pmeth">${CM_PAY_METHODS.map(m => `<option>${m}</option>`).join("")}</select></div><div class="form-group"><label for="cm_pref">Reference</label><input class="form-control" id="cm_pref"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="cmPayUi()">Record payment</button></div>` : "";
  const rows = b.payments.length ? `<table class="data-table" style="margin-top:10px;"><thead><tr><th>Payment</th><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th></th></tr></thead><tbody>${b.payments.map(p => `<tr${p.voidedAt ? ' class="mw-done"' : ""}><td>${p.id}</td><td>${p.date}</td><td>${cmMoney(p.amount)}</td><td>${escHtml(p.method)}</td><td>${escHtml(p.reference)}</td><td>${p.voidedAt ? "Voided: " + escHtml(p.voidReason) : (can ? `<input class="form-control" id="cm_vwhy_${p.id}" placeholder="Reason to void" style="width:150px;display:inline-block;"> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="cmVoidUi('${p.id}')">Void</button>` : "")}</td></tr>`).join("")}</tbody></table>` : `<div class="p1-note">No payments recorded.</div>`;
  const pay = `<div class="card"><div class="card-header"><h3>Payments</h3></div><div class="card-body">${payForm}${rows}</div></div>`;
  let finHtml;
  if (fin && fin.status === "active") {
    finHtml = `<div class="card"><div class="card-header"><h3><i class="ph ph-bank"></i> Premium finance: ${escHtml(fin.company)}</h3><span class="badge badge-info">Active</span></div><div class="card-body"><div class="p1-summary"><div><div class="p1-k">Financed</div><div class="p1-v">${cmMoney(fin.financed)}</div></div><div><div class="p1-k">Down payment</div><div class="p1-v">${cmMoney(fin.down)}</div></div><div><div class="p1-k">Finance charge</div><div class="p1-v">${cmMoney(fin.charge)}</div></div><div><div class="p1-k">Instalments</div><div class="p1-v">${fin.n}</div></div></div>
      <table class="data-table"><thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${fin.schedule.map(i => `<tr><td>${i.no}</td><td>${i.due}</td><td>${cmMoney(i.amount)}</td><td>${i.paidAt ? "Paid " + escHtml(i.paidAt) : (i.due < todayIso() ? '<span class="mw-late">Past due</span>' : "Open")}</td><td>${!i.paidAt && can ? `<button class="btn btn-xs btn-success" style="width:auto;" onclick="cmInstUi(${i.no})">Mark paid</button>` : ""}</td></tr>`).join("")}</tbody></table>
      <div class="p1-note">The insured pays the finance company. The finance company pays us: record that as a payment with the method "Premium finance company". ${sub.cancellation ? "<strong>This policy has a cancellation recorded: any return premium goes to the finance company, not the insured.</strong>" : ""}</div>
      ${can ? `<div class="mw-dates" style="margin-top:8px;"><input class="form-control" id="cm_fendwhy" placeholder="Reason to end premium finance" style="min-width:260px;"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="cmEndFinUi()">End premium finance</button></div>` : ""}</div></div>`;
  } else {
    finHtml = `<div class="card"><div class="card-header"><h3><i class="ph ph-bank"></i> Premium finance</h3></div><div class="card-body">${fin && fin.status === "ended" ? `<div class="p1-note">Ended ${escHtml(fin.endedAt)}: ${escHtml(fin.endReason)}</div>` : ""}${can ? `<div class="mw-grid"><div class="form-group mw-wide"><label for="cm_fco">Finance company</label><input class="form-control" id="cm_fco"></div><div class="form-group"><label for="cm_fdown">Down payment ($)</label><input class="form-control" id="cm_fdown" inputmode="decimal" value="0"></div>
      <div class="form-group"><label for="cm_fchg">Finance charge ($)</label><input class="form-control" id="cm_fchg" inputmode="decimal" placeholder="0.00"></div><div class="form-group"><label for="cm_fn">Instalments</label><input class="form-control" id="cm_fn" type="number" min="2" max="12" value="10"></div><div class="form-group"><label for="cm_ffirst">First instalment</label><input class="form-control" type="date" id="cm_ffirst" value="${cmAddMonths(todayIso(), 1)}"></div></div>
      <div class="p1-note">The finance charge is typed from the finance agreement; none is built in. The instalment schedule is worked out and the last instalment takes any rounding.</div><div class="p1-actions"><button class="btn btn-primary" onclick="cmFinUi()">Record premium finance</button></div>` : `<div class="p1-note">Recording premium finance needs edit rights on submission data.</div>`}</div></div>`;
  }
  return head + pay + finHtml;
}
function cmPayUi() { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = cmRecordPayment(sub, { date: cfRead("cm_pdate"), amount: cfRead("cm_pamt").replace(/[$,]/g, ""), method: cfRead("cm_pmeth"), reference: cfRead("cm_pref") }); showToast(r.ok ? "✅ Payment recorded." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }
function cmVoidUi(id) { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = cmVoidPayment(sub, id, cfRead("cm_vwhy_" + id)); showToast(r.ok ? "Payment voided." : "⛔ " + r.message, r.ok ? "info" : "danger"); cfRender(); }
function cmFinUi() { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = cmSetFinance(sub, { company: cfRead("cm_fco"), down: cfRead("cm_fdown").replace(/[$,]/g, ""), charge: cfRead("cm_fchg").replace(/[$,]/g, ""), n: Number(cfRead("cm_fn")), firstDue: cfRead("cm_ffirst") }); showToast(r.ok ? "✅ Premium finance recorded." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }
function cmEndFinUi() { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = cmEndFinance(sub, cfRead("cm_fendwhy")); showToast(r.ok ? "Premium finance ended." : "⛔ " + r.message, r.ok ? "info" : "danger"); cfRender(); }
function cmInstUi(no) { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } cmPayInstallment(sub, no); cfRender(); }

// ----------------------------------------------------------------------------
// 4. PREMIUM ESTIMATE
// ----------------------------------------------------------------------------
function cmSaveRates() { try { localStorage.setItem(CM_RATES_KEY, JSON.stringify(CM_RATES)); } catch (e) { /* keep for this session */ } }
function cmAddRate(f) {
  if (!LOB_CATALOG.some(l => l.key === f.lobKey)) return { ok: false, message: "Choose the line of business." };
  if (!CM_BASES[f.basis]) return { ok: false, message: "Choose what the rate applies to." };
  const rate = Number(f.rate), min = f.minPremium === "" || f.minPremium === undefined ? 0 : Number(f.minPremium);
  if (!(rate > 0)) return { ok: false, message: "Enter a rate greater than 0." };
  if (!(min >= 0)) return { ok: false, message: "The minimum premium must be 0 or more." };
  if (!cmDate(f.effective)) return { ok: false, message: "Enter the date the rate takes effect." };
  const r = { id: "RATE-" + (CM_RATES.length + 1), lobKey: f.lobKey, basis: f.basis, rate, minPremium: min, effective: f.effective, note: String(f.note || "").trim(), by: typeof actorLabel === "function" ? actorLabel() : "", at: nowStamp() };
  CM_RATES.push(r); cmSaveRates();
  return { ok: true, rate: r };
}
/** Premium from a rate: exposure ÷ per × rate, never below the minimum. The one place this is worked out: the estimate and the Calculator both use it. */
function cmRatePremium(exposure, rate, per, min) {
  const units = exposure / per, base = cmCents(units * rate), floor = cmCents(min || 0);
  return { units, base, premium: Math.max(base, floor), minApplied: base < floor };
}
/** The rate in force for a line on a date: the latest one effective on or before it. */
function cmRateFor(lobKey, onDate) {
  const d = onDate || todayIso();
  return CM_RATES.filter(r => r.lobKey === lobKey && r.effective <= d).sort((a, b) => b.effective.localeCompare(a.effective) || b.id.localeCompare(a.id, undefined, { numeric: true }))[0] || null;
}
function cmExposure(sub, basis) {
  if (basis === "power_unit") return (sub.vehicles || []).length;
  if (basis === "tiv") return Number(sub.exposureVal) || 0;
  const n = typeof dfNum === "function" ? dfNum((sub.operationsProfile || {}).annual_revenue) : null;
  return n || 0;
}
/** { ok: true, premium, base, rate, exposure, units, compare } or { ok: false, message }. An estimate, never the quote. */
function cmEstimate(sub, onDate) {
  const rate = cmRateFor(sub.lobKey, onDate);
  if (!rate) return { ok: false, message: "No rate is loaded for " + (sub.lobName || sub.lobKey) + ". Add one in the rate table below." };
  const exposure = cmExposure(sub, rate.basis);
  if (!(exposure > 0)) return { ok: false, message: "The case has no " + { power_unit: "vehicles", tiv: "exposure value", revenue: "annual revenue" }[rate.basis] + " to rate." };
  const rp = cmRatePremium(exposure, rate.rate, CM_BASES[rate.basis].per, rate.minPremium), units = rp.units, base = rp.base, premium = rp.premium;
  const imported = typeof getSubmissionPremium === "function" ? Number(getSubmissionPremium(sub)) || 0 : 0;
  return { ok: true, premium: cmCents(premium), base, rate, exposure, units, minApplied: base < rate.minPremium, compare: imported > 0 ? { imported, diff: cmCents(imported - premium), pct: Math.round((imported - premium) / premium * 1000) / 10 } : null };
}
function cmEstimateHtml(sub) {
  const e = cmEstimate(sub), canRate = hasPermission("rateConfig", "edit");
  const est = e.ok ? `<div class="card"><div class="card-header"><h3><i class="ph ph-calculator"></i> Premium estimate</h3><span class="badge badge-warning">Estimate only</span></div><div class="card-body"><div class="mw-tiles"><div class="mw-tile"><div class="mw-tile-n" style="font-size:22px;">${cmMoney(e.premium)}</div><div class="mw-tile-l">Estimated premium</div></div>${e.compare ? `<div class="mw-tile ${Math.abs(e.compare.pct) > 15 ? "bad" : ""}"><div class="mw-tile-n" style="font-size:22px;">${cmMoney(e.compare.imported)}</div><div class="mw-tile-l">Imported rating (${e.compare.pct > 0 ? "+" : ""}${e.compare.pct}% vs estimate)</div></div>` : ""}</div>
    <div class="p1-note">${escHtml(e.units.toLocaleString("en-US"))} ${CM_BASES[e.rate.basis].label.replace("per ", "")} × ${cmMoney(e.rate.rate)} ${CM_BASES[e.rate.basis].label} (rate ${e.rate.id}, effective ${e.rate.effective})${e.minApplied ? "; the minimum premium of " + cmMoney(e.rate.minPremium) + " applies" : ""}. The rating file sets the quoted premium; this is a check on it.</div></div></div>`
    : `<div class="card"><div class="card-header"><h3><i class="ph ph-calculator"></i> Premium estimate</h3></div><div class="card-body"><div class="mw-empty">${escHtml(e.message)}</div></div></div>`;
  const rates = CM_RATES.filter(r => r.lobKey === sub.lobKey).sort((a, b) => b.effective.localeCompare(a.effective));
  const rateCard = `<details class="card"${CM_RATES.length ? "" : " open"}><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-table"></i> Rate table (${CM_RATES.length})</summary><div class="card-body">${rates.length ? `<table class="data-table"><thead><tr><th>Rate</th><th>Basis</th><th>Rate</th><th>Minimum</th><th>Effective</th><th>By</th></tr></thead><tbody>${rates.map(r => `<tr><td>${r.id}</td><td>${CM_BASES[r.basis].label}</td><td>${cmMoney(r.rate)}</td><td>${cmMoney(r.minPremium)}</td><td>${r.effective}</td><td>${escHtml(r.by)}</td></tr>`).join("")}</tbody></table>` : `<div class="p1-note">No rate for this line yet.</div>`}
    ${canRate ? `<div class="mw-grid" style="margin-top:10px;"><div class="form-group"><label for="cm_rlob">Line</label><select class="form-control" id="cm_rlob">${LOB_CATALOG.map(l => `<option value="${l.key}"${l.key === sub.lobKey ? " selected" : ""}>${escHtml(l.name)}</option>`).join("")}</select></div><div class="form-group"><label for="cm_rbasis">Applies to</label><select class="form-control" id="cm_rbasis">${Object.keys(CM_BASES).map(k => `<option value="${k}">${CM_BASES[k].label}</option>`).join("")}</select></div>
      <div class="form-group"><label for="cm_rrate">Rate ($)</label><input class="form-control" id="cm_rrate" inputmode="decimal"></div><div class="form-group"><label for="cm_rmin">Minimum premium ($)</label><input class="form-control" id="cm_rmin" inputmode="decimal" placeholder="0"></div><div class="form-group"><label for="cm_reff">Effective</label><input type="date" class="form-control" id="cm_reff" value="${todayIso()}"></div></div>
      <div class="p1-note">Rates are entered by hand from the carrier's rate filing. None is built in.</div><div class="p1-actions"><button class="btn btn-primary" onclick="cmAddRateUi()">Add rate</button></div>` : `<div class="p1-note">Adding a rate needs edit rights on rates, fees and limits.</div>`}</div></details>`;
  return est + rateCard;
}
function cmAddRateUi() { const r = cmAddRate({ lobKey: cfRead("cm_rlob"), basis: cfRead("cm_rbasis"), rate: cfRead("cm_rrate"), minPremium: cfRead("cm_rmin"), effective: cfRead("cm_reff") }); showToast(r.ok ? "✅ Rate added." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }

// ----------------------------------------------------------------------------
// 5. QUOTE OPTIONS AND COPY SUBMISSION
// ----------------------------------------------------------------------------
function cmQuoteEntry(sub) { return (typeof QUOTE_VERSIONS_DATASET !== "undefined" ? QUOTE_VERSIONS_DATASET : []).find(v => v.subId === sub.id) || null; }
/** Copies the latest quote as an option with its own limit, deductible and premium. It is never the bindable quote. */
function cmAddQuoteOption(sub, f) {
  const e = cmQuoteEntry(sub), base = e && e.quotes.filter(q => !q.isOption).slice(-1)[0];
  if (!base) return { ok: false, message: "There is no quote to copy yet." };
  if (policyIsBound(sub)) return { ok: false, message: "The policy is bound; quote options can no longer be added." };
  const label = String(f.label || "").trim();
  if (label.length < 2) return { ok: false, message: "Name the option (for example Option B, higher limit)." };
  if (e.quotes.some(q => q.isOption && q.optionLabel.toLowerCase() === label.toLowerCase())) return { ok: false, message: "An option with that name already exists." };
  const premium = cmCents(f.premium);
  if (!(premium > 0)) return { ok: false, message: "Enter the option's premium." };
  const n = e.quotes.filter(q => q.isOption).length + 1, id = base.versionId + "-opt" + n;
  const q = Object.assign({}, base, { versionId: id, versionTag: "opt" + n, quoteNo: id, type: "Quote option (copy of " + base.versionId + ")", date: nowStamp(), author: actorLabel(), liabilityLimit: String(f.limit || "").trim() || base.liabilityLimit, pdDeductible: String(f.deductible || "").trim() || base.pdDeductible,
    premium, finalPremium: premium, status: "Quote Option", statusBadge: "badge-info", isBound: false, isLatest: false, isOption: true, optionLabel: label, copyOf: base.versionId, notes: "Option \"" + label + "\" copied from " + base.versionId + " with premium " + cmMoney(premium) + "." });
  e.quotes.push(q);
  cmLog(sub, "quote_option_added", `Option "${label}" copied from ${base.versionId}: premium ${cmMoney(premium)}.`);
  return { ok: true, quote: q };
}

/** A new case from this one: the insured, address, fleet, drivers and operations are copied; quotes, notes, documents and the policy are not. */
function cmCopySubmission(sub, f) {
  if (!canCreateSubmissions()) return { ok: false, message: "Only the Head of Underwriting can create submissions." };
  const lobKey = f.lobKey || sub.lobKey;
  const r = createSubmissionRecord({ channel: sub.channelType, lobKey, insured: sub.insured, fein: sub.fein, broker: sub.channelType === "broker" ? sub.broker : "", email: sub.email });
  if (!r.ok) return r;
  const n = r.sub, clone = o => JSON.parse(JSON.stringify(o === undefined ? null : o));
  n.address = sub.address || ""; n.dot = sub.dot || null; n.mcNumber = sub.mcNumber || null; n.exposureVal = sub.exposureVal || 0; n.exposure = sub.exposure || "Not provided";
  ["vehicles", "drivers"].forEach(k => { n[k] = clone(sub[k] || []); });
  ["operationsProfile", "genInfo", "insuredInfo"].forEach(k => { n[k] = clone(sub[k] || {}); });
  if (sub.riskStateSet) n.riskStateSet = { state: sub.riskStateSet.state, by: actorLabel(), at: nowStamp() };
  n.copiedFrom = sub.id;
  n.statusText = "Phase 1: Received"; n.statusBadge = "badge-primary";
  n.phase1 = { stage: "received", reviewer: currentUserRole, checks: null, ranAt: null, runs: 0, review: null };
  if (f.note) cmLog(n, "submission_copied", "Copied from " + sub.id + ". " + String(f.note).trim());
  else cmLog(n, "submission_copied", "Copied from " + sub.id + ". Quotes, notes, documents and the policy were not copied.");
  cmLog(sub, "submission_copied", "Copied to " + n.id + (lobKey !== sub.lobKey ? " for " + n.lobName : "") + ".");
  if (typeof p1RunChecks === "function") p1RunChecks(n);
  cfSave();
  return { ok: true, sub: n };
}
/** The outcome that closed this quote, if the quote can be reopened: the insured did not take it, it expired, or it was lost or withdrawn. */
function cmQuoteReopenable(sub) {
  const cur = typeof outCurrent === "function" ? outCurrent(sub) : null, e = cmQuoteEntry(sub);
  if (!cur || !e || !e.quotes.length || policyIsBound(sub)) return null;
  return ["not_taken_by_insured", "quote_expired", "lost_to_competitor", "withdrawn_by_broker", "closed_incomplete"].indexOf(cur.type) > -1 ? cur : null;
}
/** Reopens the quote after the broker or insured comes back. The latest quote version stays as it was; the case goes back to work. */
function cmReopenQuote(sub, reason) {
  const cur = cmQuoteReopenable(sub);
  if (!cur) return { ok: false, message: "This quote has no closing outcome to reopen." };
  const r = outReopen(sub, reason, {});
  if (!r.ok) return { ok: false, message: r.error === "permission" ? "permission" : r.error === "reason" ? "Give a reason (at least " + OUT_MIN_REASON + " characters)." : "The quote could not be reopened (" + r.error + ")." };
  cmLog(sub, "quote_reopened", "Quote reopened after: " + cur.reasonLabel + ". " + String(reason).trim());
  return { ok: true };
}
function cmReopenUi() { const sub = cfSub(); if (!sub) return; const r = cmReopenQuote(sub, cfRead("cm_reopenwhy")); if (r.message !== "permission") showToast(r.ok ? "✅ Quote reopened." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }
function cmQuoteHtml(sub) {
  const e = cmQuoteEntry(sub), can = cfCanEdit(sub);
  const closed = cmQuoteReopenable(sub);
  const reopen = closed ? `<div class="card"><div class="card-header"><h3><i class="ph ph-arrow-counter-clockwise"></i> Reopen this quote</h3></div><div class="card-body"><div class="p1-banner warn" style="margin-top:0;"><i class="ph ph-info"></i><div>This quote was closed: <strong>${escHtml(closed.reasonLabel)}</strong>. If the broker or insured has come back, reopen it with a reason. The quote versions are kept as they were.</div></div>
    <div class="mw-dates"><input class="form-control" id="cm_reopenwhy" placeholder="Why it is being reopened" style="min-width:320px;"><button class="btn btn-primary" style="width:auto;" onclick="cmReopenUi()">Reopen quote</button></div></div></div>` : "";
  const ledger = e && e.quotes.length ? `<div class="card"><div class="card-header"><h3>Quotes and options</h3></div><div class="card-body"><table class="data-table"><thead><tr><th>Version</th><th>Type</th><th>Limit</th><th>Deductible</th><th>Premium</th><th>Status</th></tr></thead><tbody>${e.quotes.map(q => `<tr><td>${escHtml(q.versionId)}</td><td>${escHtml(q.isOption ? "Option: " + q.optionLabel : q.type)}</td><td>${escHtml(q.liabilityLimit || "—")}</td><td>${escHtml(q.pdDeductible || "—")}</td><td>${cmMoney(q.finalPremium)}</td><td><span class="badge ${q.statusBadge || "badge-light"}">${escHtml(q.status)}</span></td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card"><div class="card-body"><div class="mw-empty">No quote has been recorded for this case yet.</div></div></div>`;
  const optForm = e && e.quotes.some(q => !q.isOption) && can && !policyIsBound(sub) ? `<div class="card"><div class="card-header"><h3><i class="ph ph-copy"></i> Copy quote as an option</h3></div><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="cm_olabel">Option name</label><input class="form-control" id="cm_olabel" placeholder="Option B"></div><div class="form-group"><label for="cm_olimit">Liability limit</label><input class="form-control" id="cm_olimit" placeholder="same as the quote"></div>
    <div class="form-group"><label for="cm_oded">Deductible</label><input class="form-control" id="cm_oded" placeholder="same as the quote"></div><div class="form-group"><label for="cm_oprem">Premium ($)</label><input class="form-control" id="cm_oprem" inputmode="decimal"></div></div>
    <div class="p1-note">An option is a copy for comparison. It is never the bindable quote; it appears in the quote ledger and in the multiple-quote comparison.</div><div class="p1-actions"><button class="btn btn-primary" onclick="cmOptionUi()">Add option</button></div></div></div>` : "";
  const copy = canCreateSubmissions() ? `<div class="card"><div class="card-header"><h3><i class="ph ph-copy-simple"></i> Copy this submission</h3></div><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="cm_clob">Line of business</label><select class="form-control" id="cm_clob">${LOB_CATALOG.map(l => `<option value="${l.key}"${l.key === sub.lobKey ? " selected" : ""}>${escHtml(l.name)}</option>`).join("")}</select></div><div class="form-group mw-wide"><label for="cm_cnote">Note <span class="text-muted">(optional)</span></label><input class="form-control" id="cm_cnote"></div></div>
    <div class="p1-note">Copies the insured, address, vehicles, drivers and operations. Does not copy quotes, notes, documents or the policy. The copy goes through the Phase 1 checks like any new case.</div><div class="p1-actions"><button class="btn btn-primary" onclick="cmCopyUi()">Copy submission</button></div></div></div>` : "";
  return reopen + ledger + optForm + copy + cmEstimateHtml(sub);
}
function cmOptionUi() { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = cmAddQuoteOption(sub, { label: cfRead("cm_olabel"), limit: cfRead("cm_olimit"), deductible: cfRead("cm_oded"), premium: cfRead("cm_oprem").replace(/[$,]/g, "") }); showToast(r.ok ? "✅ Option added." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }
function cmCopyUi() {
  const sub = cfSub(); if (!sub) return;
  const r = cmCopySubmission(sub, { lobKey: cfRead("cm_clob"), note: cfRead("cm_cnote") });
  showToast(r.ok ? "✅ Copied to " + r.sub.id + ". Opening its Phase 1 review." : "⛔ " + r.message, r.ok ? "success" : "danger");
  if (r.ok && typeof p1Open === "function") { if (typeof renderSubmissionsTable === "function") renderSubmissionsTable(); p1Open(r.sub.id); }
}

// ----------------------------------------------------------------------------
// 6. TABS FOR THE CASE FILE PAGE
// ----------------------------------------------------------------------------
function cmTabs() { return [["ai", "Additional insured", "ph-user-plus"], ["elig", "Eligibility", "ph-list-checks"], ["ifta", "IFTA mileage", "ph-road-horizon"], ["billing", "Billing", "ph-receipt"], ["quote", "Quote & estimate", "ph-copy"]]; }
function cmBody(tab, sub) { return { ai: cmAIHtml, elig: cmEligibilityHtml, ifta: cmIftaHtml, billing: cmBillingHtml, quote: cmQuoteHtml }[tab](sub); }
