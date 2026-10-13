/**
 * ============================================================================
 * SURPLUS LINES: STATE TAX AND FEES, DILIGENT SEARCH, AFFIDAVIT, FILING (G06)
 * ----------------------------------------------------------------------------
 * When a risk is placed with a non-admitted (surplus lines) insurer, state law
 * adds obligations that an admitted placement does not have:
 *
 *   TAX AND FEES  a premium tax, and in many states a stamping fee, both set by
 *                 the insured's home state and both changing over time. The
 *                 prototype used four different figures in four places (3.2%,
 *                 4.85% + 0.15%, 4.85% + 0.075%, and a hard-coded "Texas" line).
 *   DILIGENT SEARCH  the broker must first try the admitted market and record
 *                 the declinations (commonly three) unless the class is on the
 *                 state's export list.
 *   LICENSED BROKER  only a surplus lines licensed broker may place the risk.
 *   DISCLOSURE    the insured must be told the insurer is not admitted and the
 *                 state guaranty fund does not apply.
 *   AFFIDAVIT AND FILING  the placing broker attests to the above and files and
 *                 pays the tax with the state or its stamping office.
 *
 * What this module does:
 *   - SL_STATE_TABLE is the one place the rates live. A state that is not in the
 *     table has NO rate: the system never falls back to a default.
 *   - A table entry still marked verified:false needs a person with approval
 *     authority to confirm it for the submission, citing the schedule and date;
 *     a state that is not in the table needs a senior user to enter and source
 *     the rate. The confirmed basis is stored on the submission.
 *   - The issue-quote email, the ingested-product quote builder and discretionary
 *     pricing now take their rates from this basis.
 *   - Quote: cannot be issued until the tax basis is confirmed.
 *   - Bind: needs the diligent search (or an authorized exemption), a licensed
 *     surplus lines placing broker, and the insured's disclosure acknowledged.
 *   - After bind a filing record is created with the tax and fee due.
 *
 * IMPORTANT: The table below is NOT authoritative. Every entry is marked
 * verified:false with its source and the date it was gathered. Tax rates,
 * stamping fees, filing deadlines and search rules change and different
 * sources disagree (for example California's stamping fee is reported as both
 * 0.10% and 0.18%). Compliance must verify each state against the state's own
 * current schedule before relying on any figure, then set verified:true.
 * ============================================================================
 */

var SL_DEFAULT_DECLINATIONS = 3;     // used where a state's own count is not recorded
var SL_SEARCH_MAX_AGE_DAYS = 90;     // a declination older than this before bind is stale (configuration)
var SL_TOLERANCE = 1.5;              // dollars of rounding tolerance when reconciling a quote
var SL_DISCLOSURE = "NOTICE TO THE INSURED: This insurance is placed with an insurer that is not licensed in this state (a surplus lines or non-admitted insurer). The insurer is not subject to the state's usual rate and form regulation, and if it becomes insolvent the state's insurance guaranty fund will not pay your claims. (Template: Compliance to replace with the state's required wording.)";

var SL_STATE_TABLE = {
  TX: { name: "Texas", taxPct: 4.85, stampingPct: 0.04, declinations: 3, filingDays: null, verified: false, asOf: "2026-10-08",
    source: "Tax 4.85% (Texas surplus lines tax). Stamping fee cut from 0.075% to 0.04% for policies effective on or after 2024-01-01 (Locke Lord, Nov 2023).",
    note: "One search result listed 0.1%; verify the stamping fee with the Surplus Lines Stamping Office of Texas." },
  NY: { name: "New York", taxPct: 3.6, stampingPct: 0.15, declinations: 3, filingDays: null, verified: false, asOf: "2026-10-08",
    source: "Tax 3.6% plus a 0.15% stamping fee to the Excess Line Association of New York (search result summary).",
    note: "New York also has an excess line export list and other fees; verify with ELANY." },
  CA: { name: "California", taxPct: 3.0, stampingPct: 0.18, declinations: 3, filingDays: null, verified: false, asOf: "2026-10-08",
    source: "Tax 3.0%; stamping fee 0.18% (Business Insurance, 2019, 'California adjusts stamping fee').",
    note: "Sources disagree: another listing shows 0.10%. Verify with the Surplus Line Association of California before use." }
};

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function slToday() { return new Date().toISOString().slice(0, 10); }
function slDays(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000); }
function slAdd(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); }
function slRound(n) { return Math.round(n * 100) / 100; }
function slMoney(n) { return (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function slEntry(state) { return state && SL_STATE_TABLE[state] ? SL_STATE_TABLE[state] : null; }

/** The tax basis that applies to a submission, and whether it can be used. */
function slBasisFor(sub, state) {
  const e = slEntry(state);
  if (sub.slTaxBasis && sub.slTaxBasis.state === state) {
    const b = sub.slTaxBasis;
    return { state, taxPct: b.taxPct, stampingPct: b.stampingPct, source: b.basedOn, usable: true, confirmed: true, entry: e, basis: b };
  }
  if (e && e.verified === true) return { state, taxPct: e.taxPct, stampingPct: e.stampingPct, source: "table", usable: true, confirmed: false, entry: e };
  if (e) return { state, taxPct: e.taxPct, stampingPct: e.stampingPct, source: "table", usable: false, confirmed: false, entry: e, reason: `${e.name}'s schedule is in the table but has not been verified; an approver must confirm it for this submission.` };
  return { state, taxPct: null, stampingPct: null, source: "none", usable: false, confirmed: false, entry: null, reason: state ? `No surplus lines schedule is loaded for ${state}; a senior user must enter and source the rate.` : "The home state could not be determined." };
}

/**
 * Premium the tax applies to. The discretionary-pricing Final Quoted Premium is the policy premium before tax, so it is the
 * base as it stands. Only when there is no priced premium and just the rating engine's figure (which includes tax) is the
 * quote's tax taken back out.
 */
function slPremiumBase(sub) {
  const dp = sub.discretionaryPricing, q = sub.importedRatingData && sub.importedRatingData.quote;
  if (dp && dp.finalPremium) return { final: dp.finalPremium, tax: 0, county: 0, base: dp.finalPremium, hasQuote: !!q };
  const final = (q && q.finalPremium) || 0;
  if (!q) return { final, tax: 0, county: 0, base: final, hasQuote: false };
  const tax = Number(q.tax) || 0, county = Number(q.countyTax) || 0;
  return { final, tax, county, base: slRound(Math.max(0, final - tax - county)), hasQuote: true };
}

/** The tax lines for the quote screen: what applies on this submission's premium, from the one confirmed basis. */
function slTaxFor(sub) {
  const county = Number(sub.importedRatingData && sub.importedRatingData.quote && sub.importedRatingData.quote.countyTax) || 0;
  if (!slIsSurplus(sub)) return { applicable: false, tax: 0, stamping: 0, county, total: county, note: "Admitted placement: no surplus lines tax" };
  const basis = slBasisFor(sub, slHomeState(sub)), base = slPremiumBase(sub).base;
  if (!basis.usable) return { applicable: true, usable: false, tax: 0, stamping: 0, county, total: county, note: basis.reason };
  const e = slExpected(base, basis);
  return { applicable: true, usable: true, tax: e.tax, stamping: e.stamping, county, total: slRound(e.tax + e.stamping + county), taxPct: basis.taxPct, stampingPct: basis.stampingPct, state: basis.state,
    note: `${basis.state} surplus lines tax ${basis.taxPct}% + stamping fee ${basis.stampingPct}%` };
}

function slExpected(base, basis) {
  if (!basis || basis.taxPct == null) return null;
  return { tax: slRound(base * basis.taxPct / 100), stamping: slRound(base * (basis.stampingPct || 0) / 100) };
}

/** Compares the quote's tax and stamping fee with the basis. Returns a list of findings. */
function slReconcile(sub, basis) {
  const out = [];
  const pb = slPremiumBase(sub);
  if (!pb.hasQuote || !basis || !basis.usable) return out;
  const exp = slExpected(pb.base, basis);
  const q = sub.importedRatingData.quote;
  if (Math.abs((Number(q.tax) || 0) - exp.tax) > SL_TOLERANCE) out.push({ level: "warn", text: `The quote carries surplus lines tax of ${slMoney(q.tax || 0)}; ${basis.taxPct}% of ${slMoney(pb.base)} is ${slMoney(exp.tax)} (difference ${slMoney((Number(q.tax) || 0) - exp.tax)}).` });
  const stampFee = (q.fees || []).find(f => f && f.code === "FEE_STAMP");
  if (stampFee && Math.abs((Number(stampFee.amt) || 0) - exp.stamping) > SL_TOLERANCE) out.push({ level: "warn", text: `The quote's stamping fee is ${slMoney(stampFee.amt)}; ${basis.stampingPct}% is ${slMoney(exp.stamping)}.` });
  return out;
}

function slValidateBasisForm(f) {
  const p = [];
  const tax = Number(f.taxPct), st = Number(f.stampingPct);
  if (f.taxPct === "" || isNaN(tax) || tax < 0 || tax > 15) p.push("enter the premium tax rate (0 to 15%)");
  if (f.stampingPct === "" || isNaN(st) || st < 0 || st > 5) p.push("enter the stamping fee rate (0 to 5%; enter 0 if the state has none)");
  if (String(f.reference || "").trim().length < 5) p.push("cite the schedule or bulletin the rate comes from (at least 5 characters)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.asOf || ""))) p.push("enter the date of that schedule");
  return p;
}

/** Diligent search status. entries: [{insurer, contactedOn, response, reference}] */
function slSearchStatus(sub, state, today) {
  const t = today || slToday();
  const ds = sub.diligentSearch || { entries: [], exemption: null };
  const e = slEntry(state);
  const required = e && e.declinations ? e.declinations : SL_DEFAULT_DECLINATIONS;
  const seen = {};
  const entries = (ds.entries || []).map(x => {
    const key = String(x.insurer || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const dup = !!seen[key]; seen[key] = true;
    const stale = slDays(x.contactedOn, t) > SL_SEARCH_MAX_AGE_DAYS;
    const qualifying = !dup && !stale && (x.response === "declined" || x.response === "no_appetite");
    return Object.assign({}, x, { duplicate: dup, stale, qualifying });
  });
  const count = entries.filter(x => x.qualifying).length;
  const exempt = !!ds.exemption;
  return { required, count, entries, exemption: ds.exemption || null, satisfied: exempt || count >= required, usedDefault: !(e && e.declinations) };
}

function slValidateDeclination(ctx, f) {
  const p = [];
  if (String(f.insurer || "").trim().length < 2) p.push("enter the admitted insurer contacted");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.contactedOn || ""))) p.push("enter the date contacted");
  else if (f.contactedOn > ctx.today) p.push("the contact date cannot be in the future");
  if (["declined", "no_appetite", "quoted"].indexOf(f.response) === -1) p.push("record the insurer's response");
  if (String(f.reference || "").trim().length < 3) p.push("enter the reference (email id, portal case, declination letter)");
  const key = String(f.insurer || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key && (ctx.existing || []).some(x => String(x.insurer || "").toLowerCase().replace(/[^a-z0-9]/g, "") === key)) p.push("that insurer is already on the list");
  return p;
}

/** Is the placing broker licensed for surplus lines in the state? */
function slPlacingBrokerStatus(sub, state) {
  const name = sub.slPlacingBroker || (sub.channelType === "direct" ? "" : sub.broker);
  if (!name) return { ok: false, broker: "", reason: "No placing broker is recorded. A surplus lines licensed broker must place the risk." };
  if (typeof lookupProducerRecord !== "function") return { ok: false, broker: name, reason: "Producer licensing data is not available." };
  const rec = lookupProducerRecord(name);
  if (!state) return { ok: false, broker: name, reason: "The home state could not be determined." };
  const today = slToday();
  // No registry record: a verified lookup recorded on the Producer Licence card (for the submitting broker) stands in for it.
  const man = sub.producerCheck && sub.producerCheck.manual;
  if (!rec && man && (!sub.slPlacingBroker || sub.slPlacingBroker === sub.broker)) {
    if (man.state !== state) return { ok: false, broker: name, reason: `The recorded lookup for ${name} is for ${man.state}, not ${state}.` };
    if (man.licenseExpires < today) return { ok: false, broker: name, reason: `The recorded ${state} licence for ${name} has expired.` };
    if (!man.surplusLines) return { ok: false, broker: name, reason: `The recorded lookup does not show surplus lines authority in ${state}. Record a lookup that does, or place the risk through a licensed surplus lines broker.` };
    return { ok: true, broker: name, license: man.licenseNumber, reason: `${name} holds surplus lines authority in ${state} (licence ${man.licenseNumber}, recorded lookup).` };
  }
  if (!rec) return { ok: false, broker: name, reason: `No licensing record found for ${name}. Record a verified lookup on the Producer Licence card (Step 2), including surplus lines authority.` };
  const lic = (rec.licenses || []).filter(l => l.state === state)[0];
  if (!lic) return { ok: false, broker: name, reason: `${name} holds no licence in ${state}.` };
  if (String(lic.status).toLowerCase() !== "active" || lic.expires < today) return { ok: false, broker: name, reason: `${name}'s ${state} licence is not active.` };
  if ((lic.lines || []).indexOf("Surplus Lines") === -1) return { ok: false, broker: name, reason: `${name} is not licensed for surplus lines in ${state}. Place the risk through a licensed surplus lines broker.` };
  return { ok: true, broker: name, license: lic.number, reason: `${name} holds surplus lines authority in ${state} (licence ${lic.number}).` };
}

// ----------------------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------------------
function slSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function slActiveSub() { return slSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); }
function slNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function slActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function slEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function slLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 7, decision, by: slActor(), at: slNow(), notes });
}
function slPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function slV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function slC(id) { const e = document.getElementById(id); return !!(e && e.checked); }
function slHomeState(sub) { return typeof deriveRiskState === "function" ? deriveRiskState(sub) : null; }
function slIsSurplus(sub) { return (sub.placementType || "surplus") === "surplus"; }
function slIsBound(sub) { return !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }

/** Rates for other modules (the email, the quote builder, discretionary pricing). Null when not a usable surplus basis. */
function slRatesFor(sub) {
  if (!sub || !slIsSurplus(sub)) return null;
  const b = slBasisFor(sub, slHomeState(sub));
  return b.usable ? { taxPct: b.taxPct, stampingPct: b.stampingPct, state: b.state, source: b.source } : null;
}

// ----------------------------------------------------------------------------
// 3. ACTIONS
// ----------------------------------------------------------------------------
function slSetPlacement(value) {
  const sub = slActiveSub(); if (!sub) return;
  if (!hasPermission("surplusLines", "edit")) { denyPermission("surplusLines", "edit"); renderSurplusCard(sub); return; }
  if (slIsBound(sub)) { showToast("⛔ The policy is bound; the placement type can no longer change.", "danger"); renderSurplusCard(sub); return; }
  if (value !== "surplus" && value !== "admitted") return;
  if ((sub.placementType || "surplus") === value) return;
  sub.placementType = value;
  slLog(sub, "sl_placement_set", `Placement recorded as ${value === "surplus" ? "surplus lines (non-admitted)" : "admitted"}.`);
  slPersist(); renderSurplusCard(sub);
}

function slConfirmTableBasis() {
  const sub = slActiveSub(); if (!sub) return;
  if (!hasPermission("surplusLines", "approve")) { denyPermission("surplusLines", "approve"); return; }
  const state = slHomeState(sub), e = slEntry(state);
  if (!e) { showToast("⛔ That state is not in the table. A senior user must enter the rate.", "danger"); return; }
  const ref = slV("sl_confRef"), asOf = slV("sl_confAsOf");
  const problems = slValidateBasisForm({ taxPct: String(e.taxPct), stampingPct: String(e.stampingPct), reference: ref, asOf });
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  sub.slTaxBasis = { state, taxPct: e.taxPct, stampingPct: e.stampingPct, basedOn: "table (confirmed)", reference: ref, asOf, confirmedBy: slActor(), confirmedAt: slNow() };
  slLog(sub, "sl_tax_confirmed", `Surplus lines basis for ${state} confirmed against the state schedule: tax ${e.taxPct}%, stamping fee ${e.stampingPct}%. Source cited: ${ref} (schedule dated ${asOf}).`);
  slPersist(); renderSurplusCard(sub);
  if (typeof renderStep7View === "function") { try { renderStep7View(sub); } catch (x) { /* screen not mounted */ } }
  showToast(`${state} surplus lines basis confirmed.`, "success");
}

function slSetManualBasis() {
  const sub = slActiveSub(); if (!sub) return;
  if (!hasPermission("surplusLines", "override")) { denyPermission("surplusLines", "override"); return; }
  const state = slHomeState(sub);
  if (!state) { showToast("⛔ The home state could not be determined; add the address first.", "danger"); return; }
  const f = { taxPct: slV("sl_manTax"), stampingPct: slV("sl_manStamp"), reference: slV("sl_manRef"), asOf: slV("sl_manAsOf") };
  const problems = slValidateBasisForm(f);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  sub.slTaxBasis = { state, taxPct: Number(f.taxPct), stampingPct: Number(f.stampingPct), basedOn: "manual entry", reference: f.reference, asOf: f.asOf, confirmedBy: slActor(), confirmedAt: slNow() };
  slLog(sub, "sl_tax_confirmed", `Surplus lines basis for ${state} entered manually (no verified schedule loaded): tax ${f.taxPct}%, stamping fee ${f.stampingPct}%. Source cited: ${f.reference} (schedule dated ${f.asOf}).`);
  slPersist(); renderSurplusCard(sub);
  if (typeof renderStep7View === "function") { try { renderStep7View(sub); } catch (x) { /* screen not mounted */ } }
  showToast(`${state} surplus lines basis entered.`, "success");
}

function slClearBasis() {
  const sub = slActiveSub(); if (!sub || !sub.slTaxBasis) return;
  if (!hasPermission("surplusLines", "approve")) { denyPermission("surplusLines", "approve"); return; }
  if (slIsBound(sub)) { showToast("⛔ The policy is bound; the tax basis is fixed.", "danger"); return; }
  slLog(sub, "sl_tax_confirmed", `Surplus lines basis for ${sub.slTaxBasis.state} withdrawn; it must be confirmed again.`);
  sub.slTaxBasis = null; slPersist(); renderSurplusCard(sub);
}

function slAddDeclination() {
  const sub = slActiveSub(); if (!sub) return;
  if (!hasPermission("surplusLines", "edit")) { denyPermission("surplusLines", "edit"); return; }
  if (slIsBound(sub)) { showToast("⛔ The policy is bound; the search record is closed.", "danger"); return; }
  const f = { insurer: slV("sl_dsInsurer"), contactedOn: slV("sl_dsDate"), response: slV("sl_dsResponse"), reference: slV("sl_dsRef") };
  if (!sub.diligentSearch) sub.diligentSearch = { entries: [], exemption: null };
  const problems = slValidateDeclination({ today: slToday(), existing: sub.diligentSearch.entries }, f);
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  sub.diligentSearch.entries.push(Object.assign({}, f, { recordedBy: slActor(), recordedAt: slNow() }));
  slLog(sub, "sl_search_entry", `Admitted market contacted: ${f.insurer} on ${f.contactedOn} — ${f.response.replace("_", " ")} (ref ${f.reference}).`);
  slPersist(); renderSurplusCard(sub);
}

function slSetExemption() {
  const sub = slActiveSub(); if (!sub) return;
  if (!hasPermission("surplusLines", "override")) { denyPermission("surplusLines", "override"); return; }
  if (slIsBound(sub)) { showToast("⛔ The policy is bound; the search record is closed.", "danger"); return; }
  const kind = slV("sl_exKind"), why = slV("sl_exWhy"), ref = slV("sl_exRef");
  const problems = [];
  if (["export_list", "unavailable", "other"].indexOf(kind) === -1) problems.push("choose the exemption basis");
  if (why.length < 15) problems.push("explain the exemption (at least 15 characters)");
  if (ref.length < 5) problems.push("cite the export list entry or the rule relied on (at least 5 characters)");
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  if (!sub.diligentSearch) sub.diligentSearch = { entries: [], exemption: null };
  sub.diligentSearch.exemption = { kind, reason: why, reference: ref, by: slActor(), at: slNow() };
  slLog(sub, "sl_search_exempt", `Diligent search exemption (${kind.replace("_", " ")}): ${why} (${ref}).`);
  slPersist(); renderSurplusCard(sub);
}

function slRemoveExemption() {
  const sub = slActiveSub(); if (!sub || !sub.diligentSearch || !sub.diligentSearch.exemption) return;
  if (!hasPermission("surplusLines", "override")) { denyPermission("surplusLines", "override"); return; }
  slLog(sub, "sl_search_exempt", "Diligent search exemption removed.");
  sub.diligentSearch.exemption = null; slPersist(); renderSurplusCard(sub);
}

function slSetPlacingBroker() {
  const sub = slActiveSub(); if (!sub) return;
  if (!hasPermission("surplusLines", "edit")) { denyPermission("surplusLines", "edit"); return; }
  if (slIsBound(sub)) { showToast("⛔ The policy is bound.", "danger"); return; }
  const name = slV("sl_placer");
  sub.slPlacingBroker = name || null;
  slLog(sub, "sl_placing_broker", name ? `Surplus lines placing broker set to ${name}.` : "Placing broker reset to the submitting broker.");
  slPersist(); renderSurplusCard(sub);
}

function slAckDisclosure() {
  const sub = slActiveSub(); if (!sub) return;
  if (!hasPermission("surplusLines", "edit")) { denyPermission("surplusLines", "edit"); return; }
  const ref = slV("sl_ackRef");
  if (!slC("sl_ackBox")) { showToast("Tick the box to confirm the insured received the disclosure.", "danger"); return; }
  if (ref.length < 3) { showToast("Enter how and when it was delivered (reference).", "danger"); return; }
  sub.slDisclosure = { ref, by: slActor(), at: slNow() };
  slLog(sub, "sl_disclosure", `Surplus lines disclosure delivered to the insured and acknowledged (${ref}).`);
  slPersist(); renderSurplusCard(sub);
}

function slMarkFiled() {
  const sub = slActiveSub(); if (!sub || !sub.slFiling) return;
  if (!hasPermission("surplusLines", "edit")) { denyPermission("surplusLines", "edit"); return; }
  const ref = slV("sl_fileRef"), on = slV("sl_fileOn") || slToday();
  if (ref.length < 3) { showToast("Enter the filing confirmation reference.", "danger"); return; }
  if (on > slToday()) { showToast("The filing date cannot be in the future.", "danger"); return; }
  sub.slFiling.status = "filed"; sub.slFiling.filedOn = on; sub.slFiling.reference = ref; sub.slFiling.filedBy = slActor();
  slLog(sub, "sl_filed", `Surplus lines tax and stamping fee filed on ${on} (ref ${ref}): tax ${slMoney(sub.slFiling.taxDue)}, stamping fee ${slMoney(sub.slFiling.stampingDue)}.`);
  slPersist(); renderSurplusCard(sub);
}

/** Creates the filing record when the bound version is recorded. */
function slCreateFiling(sub) {
  if (!sub || !slIsSurplus(sub) || sub.slFiling) return;
  const state = slHomeState(sub), b = slBasisFor(sub, state), pb = slPremiumBase(sub);
  const exp = b.usable ? slExpected(pb.base, b) : null;
  const e = slEntry(state);
  const today = slToday();
  sub.slFiling = { status: "pending", state, taxDue: exp ? exp.tax : null, stampingDue: exp ? exp.stamping : null, basis: pb.base, taxPct: b.taxPct, stampingPct: b.stampingPct,
    dueDate: e && e.filingDays ? slAdd(today, e.filingDays) : null, createdAt: slNow() };
  slLog(sub, "sl_filing_created", `Surplus lines filing opened for ${state || "unknown state"}: tax ${exp ? slMoney(exp.tax) : "not calculable"}, stamping fee ${exp ? slMoney(exp.stamping) : "not calculable"}${sub.slFiling.dueDate ? `, due ${sub.slFiling.dueDate}` : "; the filing deadline for this state is not configured"}. Basis ${slMoney(pb.base)}.`);
  slPersist();
}

// ----------------------------------------------------------------------------
// 4. DOCUMENTS
// ----------------------------------------------------------------------------
function slAffidavitHtml(sub) {
  const state = slHomeState(sub), b = slBasisFor(sub, state), pb = slPremiumBase(sub), exp = b.usable ? slExpected(pb.base, b) : null;
  const ss = slSearchStatus(sub, state), pl = slPlacingBrokerStatus(sub, state), facts = typeof pcFacts === "function" ? pcFacts(sub) : { policyNumber: sub.pasSync ? sub.pasSync.policyNumber : "" };
  const row = (a, v) => `<tr><td style="padding:3px 12px 3px 0;color:#475569;vertical-align:top;white-space:nowrap;">${slEsc(a)}</td><td style="padding:3px 0;">${slEsc(v)}</td></tr>`;
  const list = ss.entries.filter(x => x.qualifying).map(x => `<li>${slEsc(x.insurer)} — ${slEsc(x.response.replace("_", " "))} on ${slEsc(x.contactedOn)} (ref ${slEsc(x.reference)})</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Surplus lines affidavit ${slEsc(sub.id)}</title></head><body style="font-family:Calibri,Arial,sans-serif;max-width:760px;margin:30px auto;font-size:14px;line-height:1.45;color:#111;">
    <h2 style="margin:0 0 4px;">SURPLUS LINES PLACEMENT AFFIDAVIT</h2>
    <div style="color:#64748b;font-size:11.5px;margin-bottom:10px;">Template — not the state's prescribed form. Compliance must replace it with the form or filing the state requires. The table figures used are ${b.entry && b.entry.verified ? "marked verified" : "NOT verified"}.</div>
    <table style="font-size:13px;margin-bottom:10px;">${row("Named insured", sub.insured || "")}${row("Home state", state || "unknown")}${row("Policy number", facts.policyNumber || "")}${row("Placing broker", pl.broker || "")}${row("Surplus lines licence", pl.ok ? pl.license : "not verified")}${row("Premium tax", exp ? `${b.taxPct}% = ${slMoney(exp.tax)}` : "not calculated")}${row("Stamping fee", exp ? `${b.stampingPct}% = ${slMoney(exp.stamping)}` : "not calculated")}${row("Tax basis", b.source + (b.basis ? " — " + b.basis.reference + " (" + b.basis.asOf + ")" : ""))}</table>
    <h3 style="font-size:13px;margin:10px 0 2px;">Diligent search of the admitted market</h3>
    ${ss.exemption ? `<p style="font-size:13px;">Exempt from the search: ${slEsc(ss.exemption.kind.replace("_", " "))} — ${slEsc(ss.exemption.reason)} (${slEsc(ss.exemption.reference)}).</p>` : `<p style="font-size:13px;">${ss.count} of ${ss.required} required admitted insurers declined or have no appetite:</p><ul style="font-size:13px;margin:2px 0 8px 20px;">${list}</ul>`}
    <h3 style="font-size:13px;margin:10px 0 2px;">Disclosure</h3><p style="font-size:13px;">${sub.slDisclosure ? `Delivered to the insured and acknowledged (${slEsc(sub.slDisclosure.ref)}) on ${slEsc(sub.slDisclosure.at)}.` : "Not yet acknowledged."}</p>
    <p style="font-size:13px;margin-top:18px;">I attest that the above is true and that the placement complies with the surplus lines laws of ${slEsc(state || "the state")}.</p>
    <p style="font-size:13px;margin-top:24px;">Signed: ______________________  Surplus lines broker licence no. __________  Date: __________</p></body></html>`;
}
function slDownloadAffidavit() {
  const sub = slActiveSub(); if (!sub) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([slAffidavitHtml(sub)], { type: "text/html" })); a.download = `SL-AFFIDAVIT-${sub.id}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ----------------------------------------------------------------------------
// 5. RENDERING
// ----------------------------------------------------------------------------
function slStatus(sub) {
  if (!slIsSurplus(sub)) return { applicable: false };
  const state = slHomeState(sub);
  const basis = slBasisFor(sub, state);
  const search = slSearchStatus(sub, state);
  const placer = slPlacingBrokerStatus(sub, state);
  const disclosure = !!sub.slDisclosure;
  const quoteBlockers = basis.usable ? [] : [basis.reason];
  const bindBlockers = [];
  if (!search.satisfied) bindBlockers.push(`the diligent search has ${search.count} of ${search.required} qualifying admitted-market declinations and no exemption`);
  if (!placer.ok) bindBlockers.push(placer.reason);
  if (!disclosure) bindBlockers.push("the insured has not acknowledged the surplus lines disclosure");
  return { applicable: true, state, basis, search, placer, disclosure, quoteBlockers, bindBlockers, reconcile: slReconcile(sub, basis) };
}

function renderSurplusCard(sub) {
  const box = document.getElementById("surplusLinesContainer");
  if (!box || !sub) return;
  const st = slStatus(sub);
  const canEdit = hasPermission("surplusLines", "edit"), canApprove = hasPermission("surplusLines", "approve"), canOverride = hasPermission("surplusLines", "override");
  const bound = slIsBound(sub);
  const placementSel = `<select class="form-control" style="width:300px;" ${canEdit && !bound ? "" : "disabled"} onchange="slSetPlacement(this.value)"><option value="surplus" ${slIsSurplus(sub) ? "selected" : ""}>Surplus lines (non-admitted)</option><option value="admitted" ${slIsSurplus(sub) ? "" : "selected"}>Admitted</option></select>`;

  if (!st.applicable) {
    const q = sub.importedRatingData && sub.importedRatingData.quote;
    const warn = q && (Number(q.tax) > 0) ? `<div class="alert alert-warning text-xs" style="margin-top:8px;"><i class="ph ph-warning"></i> The quote carries a tax of ${slMoney(q.tax)} but this is recorded as an admitted placement; surplus lines tax is not collected on admitted business. Re-rate or correct the placement type.</div>` : "";
    box.innerHTML = `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-bank"></i> Surplus Lines</h3><span class="badge badge-light">Not applicable (admitted)</span></div><div class="card-body"><div style="display:flex;gap:10px;align-items:center;">${placementSel}<span class="text-xs text-muted">No surplus lines tax, diligent search or affidavit applies to an admitted placement.</span></div>${warn}</div></div>`;
    return;
  }

  const ready = st.quoteBlockers.length === 0;
  const head = !ready ? `<span class="badge badge-danger">Tax basis needed</span>` : (st.bindBlockers.length ? `<span class="badge badge-warning">${st.bindBlockers.length} item(s) before bind</span>` : `<span class="badge badge-success">Ready to bind</span>`);
  const b = st.basis, pb = slPremiumBase(sub), exp = b.usable ? slExpected(pb.base, b) : null;

  // tax basis
  let basisHtml;
  if (b.usable) {
    basisHtml = `<div class="clean-meta-list" style="margin-bottom:8px;">
      <div class="clean-meta-row"><span class="meta-label">Home state</span><span class="meta-value">${slEsc(st.state)}</span></div>
      <div class="clean-meta-row"><span class="meta-label">Premium tax / stamping fee</span><span class="meta-value"><strong>${b.taxPct}%</strong> / <strong>${b.stampingPct}%</strong> <span class="text-muted">(${slEsc(b.source)})</span></span></div>
      ${b.confirmed ? `<div class="clean-meta-row"><span class="meta-label">Confirmed</span><span class="meta-value">${slEsc(b.basis.confirmedAt)} · ${slEsc(b.basis.confirmedBy)}<div class="text-xs text-muted">${slEsc(b.basis.reference)} (schedule dated ${slEsc(b.basis.asOf)})</div></span></div>` : ""}
      ${exp ? `<div class="clean-meta-row"><span class="meta-label">On this quote</span><span class="meta-value">tax ${slMoney(exp.tax)} + stamping fee ${slMoney(exp.stamping)} on ${slMoney(pb.base)}</span></div>` : ""}
    </div>${b.confirmed && canApprove && !bound ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="slClearBasis()">Withdraw confirmation</button>` : ""}`;
  } else {
    const e = b.entry;
    basisHtml = `<div class="alert alert-danger text-xs"><i class="ph ph-prohibit"></i> <strong>The quote cannot be issued.</strong> ${slEsc(b.reason)}</div>
      ${e ? `<div class="text-xs" style="margin-bottom:6px;">Table entry for ${slEsc(e.name)}: tax ${e.taxPct}%, stamping fee ${e.stampingPct}% (as of ${slEsc(e.asOf)}, <strong>not verified</strong>).<br><span class="text-muted">${slEsc(e.source)} ${slEsc(e.note || "")}</span></div>
      ${canApprove ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;"><input id="sl_confRef" class="form-control" style="width:300px;" placeholder="Schedule or bulletin checked (reference)"><label class="text-xs text-muted" style="font-size:12px;">Schedule dated <input id="sl_confAsOf" type="date" class="form-control" style="width:150px;"></label><button class="btn btn-sm btn-primary" style="width:auto;" onclick="slConfirmTableBasis()">Confirm for this submission</button></div>` : `<p class="text-xs text-muted"><i class="ph ph-lock"></i> An approver must confirm the schedule.</p>`}` : ""}
      ${!e ? (canOverride ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;"><input id="sl_manTax" type="number" step="0.01" class="form-control" style="width:130px;" placeholder="Tax %"><input id="sl_manStamp" type="number" step="0.01" class="form-control" style="width:150px;" placeholder="Stamping fee %"><input id="sl_manRef" class="form-control" style="width:280px;" placeholder="Schedule or bulletin (reference)"><label class="text-xs text-muted" style="font-size:12px;">Dated <input id="sl_manAsOf" type="date" class="form-control" style="width:150px;"></label><button class="btn btn-sm btn-primary" style="width:auto;" onclick="slSetManualBasis()">Enter rate</button></div>` : `<p class="text-xs text-muted"><i class="ph ph-lock"></i> A senior user must enter and source the rate for ${slEsc(st.state || "this state")}.</p>`) : ""}`;
  }
  const recon = st.reconcile.map(r => `<div class="alert alert-warning text-xs" style="margin-top:6px;"><i class="ph ph-warning"></i> ${slEsc(r.text)}</div>`).join("");

  // diligent search
  const s = st.search;
  const rows = s.entries.map(x => `<tr><td>${slEsc(x.insurer)}</td><td>${slEsc(x.contactedOn)}</td><td>${slEsc(x.response.replace("_", " "))}</td><td>${slEsc(x.reference)}</td><td>${x.qualifying ? '<span class="badge badge-success text-xs">Counts</span>' : `<span class="badge badge-light text-xs">${x.duplicate ? "duplicate" : (x.stale ? "stale" : "does not count")}</span>`}</td></tr>`).join("");
  const searchHtml = `<h4 style="margin:14px 0 6px;">Diligent search of the admitted market <span class="badge ${s.satisfied ? "badge-success" : "badge-warning"} text-xs">${s.exemption ? "Exempt" : s.count + " of " + s.required}</span></h4>
    ${s.usedDefault ? `<div class="text-xs text-muted">The required number (${s.required}) is the default; this state's own rule is not recorded.</div>` : ""}
    ${rows ? `<div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Insurer</th><th>Contacted</th><th>Response</th><th>Reference</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    ${s.exemption ? `<div class="alert alert-info text-xs" style="margin-top:6px;"><i class="ph ph-seal-check"></i> Exempt (${slEsc(s.exemption.kind.replace("_", " "))}): ${slEsc(s.exemption.reason)} — ${slEsc(s.exemption.reference)}, ${slEsc(s.exemption.by)}. ${canOverride && !bound ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="slRemoveExemption()">Remove</button>` : ""}</div>` : ""}
    ${canEdit && !bound ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;"><input id="sl_dsInsurer" class="form-control" style="width:230px;" placeholder="Admitted insurer contacted"><input id="sl_dsDate" type="date" class="form-control" style="width:150px;"><select id="sl_dsResponse" class="form-control" style="width:180px;"><option value="declined">Declined</option><option value="no_appetite">No appetite</option><option value="quoted">Offered cover (does not count)</option></select><input id="sl_dsRef" class="form-control" style="width:220px;" placeholder="Reference (email, case id)"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="slAddDeclination()">Add</button></div>` : ""}
    ${canOverride && !bound && !s.exemption ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;"><select id="sl_exKind" class="form-control" style="width:260px;"><option value="export_list">Class is on the state's export list</option><option value="unavailable">Coverage unavailable in the admitted market</option><option value="other">Other statutory exemption</option></select><input id="sl_exRef" class="form-control" style="width:220px;" placeholder="List entry / rule cited"><input id="sl_exWhy" class="form-control" style="flex:1;min-width:220px;" placeholder="Why the search is not needed (15+ characters)"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="slSetExemption()">Record exemption</button></div>` : ""}`;

  // broker, disclosure
  const brokerHtml = `<h4 style="margin:14px 0 6px;">Placing broker <span class="badge ${st.placer.ok ? "badge-success" : "badge-danger"} text-xs">${st.placer.ok ? "Licensed" : "Not verified"}</span></h4>
    <div class="text-xs ${st.placer.ok ? "" : "text-danger"}">${slEsc(st.placer.reason)}</div>
    ${canEdit && !bound ? `<div style="display:flex;gap:8px;align-items:center;margin-top:6px;"><input id="sl_placer" class="form-control" style="width:340px;" placeholder="Surplus lines broker placing the risk (blank = submitting broker)" value="${slEsc(sub.slPlacingBroker || "")}"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="slSetPlacingBroker()">Set</button></div>` : ""}`;
  const discHtml = `<h4 style="margin:14px 0 6px;">Disclosure to the insured <span class="badge ${st.disclosure ? "badge-success" : "badge-warning"} text-xs">${st.disclosure ? "Acknowledged" : "Pending"}</span></h4>
    <details style="margin-bottom:6px;"><summary class="text-xs" style="cursor:pointer;">View disclosure wording (template)</summary><p class="text-xs" style="background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:6px;margin-top:6px;">${slEsc(SL_DISCLOSURE)}</p></details>
    ${st.disclosure ? `<div class="text-xs text-muted">${slEsc(sub.slDisclosure.at)} · ${slEsc(sub.slDisclosure.by)} · ${slEsc(sub.slDisclosure.ref)}</div>` : (canEdit ? `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;"><label style="font-size:12.5px;"><input type="checkbox" id="sl_ackBox"> The insured received this disclosure</label><input id="sl_ackRef" class="form-control" style="width:260px;" placeholder="How and when (reference)"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="slAckDisclosure()">Record acknowledgement</button></div>` : "")}`;

  // filing
  let filingHtml = "";
  if (sub.slFiling) {
    const f = sub.slFiling, overdue = f.status === "pending" && f.dueDate && f.dueDate < slToday();
    filingHtml = `<h4 style="margin:14px 0 6px;">Filing and remittance <span class="badge ${f.status === "filed" ? "badge-success" : (overdue ? "badge-danger" : "badge-warning")} text-xs">${f.status === "filed" ? "Filed" : (overdue ? "Overdue" : "Pending")}</span></h4>
      <div class="text-xs">Tax ${f.taxDue == null ? "not calculable" : slMoney(f.taxDue)} + stamping fee ${f.stampingDue == null ? "not calculable" : slMoney(f.stampingDue)} on ${slMoney(f.basis)} for ${slEsc(f.state || "?")}. ${f.dueDate ? "Due " + slEsc(f.dueDate) + "." : "The filing deadline for this state is not configured."}${f.status === "filed" ? ` Filed ${slEsc(f.filedOn)} (ref ${slEsc(f.reference)}).` : ""}</div>
      ${f.status !== "filed" && canEdit ? `<div style="display:flex;gap:8px;align-items:center;margin-top:6px;"><input id="sl_fileRef" class="form-control" style="width:260px;" placeholder="Filing confirmation reference"><input id="sl_fileOn" type="date" class="form-control" style="width:150px;"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="slMarkFiled()">Mark filed</button></div>` : ""}`;
  }

  box.innerHTML = `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-bank"></i> Surplus Lines</h3>${head}</div>
    <div class="card-body">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">${placementSel}</div>
      <h4 style="margin:6px 0;">State tax and fees</h4>${basisHtml}${recon}
      ${searchHtml}${brokerHtml}${discHtml}${filingHtml}
      <div style="margin-top:14px;"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="slDownloadAffidavit()"><i class="ph ph-download-simple"></i> Affidavit (template)</button></div>
      <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> The state table is not authoritative: every entry is marked unverified, with its source and date, until Compliance checks it against the state's current schedule. Rates, filing deadlines and search rules change and are state law.</p>
    </div></div>`;
}

// ----------------------------------------------------------------------------
// 6. GUARDS AND HOOKS
// ----------------------------------------------------------------------------
function slGuardQuote(source) {
  const sub = slActiveSub();
  if (!sub) return true;
  const st = slStatus(sub);
  if (!st.applicable || !st.quoteBlockers.length) return true;
  slLog(sub, "sl_quote_blocked", `Quote issue attempt blocked (${source}): ${st.quoteBlockers.join("; ")}`);
  slPersist();
  showToast(`⛔ Quote cannot be issued: ${st.quoteBlockers[0]}`, "danger");
  renderSurplusCard(sub);
  return false;
}
function slGuardBind(source, subId) {
  const sub = subId ? slSub(subId) : slActiveSub();
  if (!sub) return true;
  const st = slStatus(sub);
  if (!st.applicable) return true;
  const why = st.quoteBlockers.concat(st.bindBlockers);
  if (!why.length) return true;
  slLog(sub, "sl_bind_blocked", `Bind attempt blocked (${source}): ${why.join("; ")}.`);
  slPersist();
  showToast(`⛔ Bind blocked (surplus lines): ${why[0]}`, "danger");
  renderSurplusCard(sub);
  return false;
}

(function installSurplusHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.sl_placement_set = m("Placement Type Recorded", "ph-bank", "badge-light", "outcome-comm");
    AUDIT_ACTION_META.sl_tax_confirmed = m("Surplus Lines Tax Basis Confirmed", "ph-percent", "badge-info", "outcome-approve");
    AUDIT_ACTION_META.sl_search_entry = m("Diligent Search Entry", "ph-magnifying-glass", "badge-light", "outcome-comm");
    AUDIT_ACTION_META.sl_search_exempt = m("Diligent Search Exemption", "ph-seal-check", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.sl_placing_broker = m("Surplus Lines Placing Broker Set", "ph-identification-card", "badge-light", "outcome-comm");
    AUDIT_ACTION_META.sl_disclosure = m("Surplus Lines Disclosure Acknowledged", "ph-check-circle", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.sl_filing_created = m("Surplus Lines Filing Opened", "ph-folder-open", "badge-info", "outcome-bind");
    AUDIT_ACTION_META.sl_filed = m("Surplus Lines Filing Made", "ph-check-circle", "badge-success", "outcome-bind");
    AUDIT_ACTION_META.sl_quote_blocked = m("Quote Blocked — Surplus Lines Tax Basis", "ph-prohibit", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.sl_bind_blocked = m("Bind Blocked — Surplus Lines", "ph-prohibit", "badge-danger", "outcome-decline");
  }

  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || slActiveSub(); if (s) renderSurplusCard(s); } catch (e) { console.warn("Surplus lines card failed:", e); }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderSurplusCard(sub); } catch (e) { console.warn("Surplus lines card failed:", e); }
      return r;
    };
  }
  registerGuard("eSign", "surplus lines", function () { return slGuardQuote("e-signature"); });
  registerGuard("issueQuote", "surplus lines", function () { return slGuardQuote("issue quote"); });
  registerGuard("bind", "surplus lines", function (a) { return slGuardBind("PAS bind", a[0]); });
  const origRecord = window.recordQuoteVersion;
  if (typeof origRecord === "function") {
    window.recordQuoteVersion = function (sub, isBound) {
      const r = origRecord.apply(this, arguments);
      if (isBound === true && sub) slCreateFiling(sub);
      return r;
    };
  }
})();

window.slSetPlacement = slSetPlacement; window.slConfirmTableBasis = slConfirmTableBasis; window.slSetManualBasis = slSetManualBasis;
window.slClearBasis = slClearBasis; window.slAddDeclination = slAddDeclination; window.slSetExemption = slSetExemption; window.slRemoveExemption = slRemoveExemption;
window.slSetPlacingBroker = slSetPlacingBroker; window.slAckDisclosure = slAckDisclosure; window.slMarkFiled = slMarkFiled; window.slDownloadAffidavit = slDownloadAffidavit;
window.slTaxFor = slTaxFor; window.renderSurplusCard = renderSurplusCard; window.slRatesFor = slRatesFor;
