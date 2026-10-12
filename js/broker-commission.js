/**
 * ============================================================================
 * BROKER OF RECORD, MARKET CLEARANCE AND COMMISSION (Add-On) — gap G18
 * ----------------------------------------------------------------------------
 * Two connected things a distribution-driven underwriting desk must get right:
 *
 * 1. WHO HAS THE RISK (market clearance and broker of record)
 *    When two different brokers submit the same insured for the same line, the
 *    carrier does not quote both. The first submission holds a "market lock";
 *    the second is a conflict and cannot leave Step 2 until it is resolved:
 *      - a BOR (broker-of-record) letter signed by the insured appoints the new
 *        broker. It is logged, the incumbent is told, a waiting period runs
 *        unless the incumbent consents, the new broker must be licensed and
 *        appointed, and a user with approval authority accepts it;
 *      - the lock expires on its own if the first submission goes unquoted
 *        for MARKET_LOCK_DAYS;
 *      - or a senior user records that the two are really different risks.
 *    The same BOR process changes the broker on a policy that is already bound;
 *    commission is then split between the old and new broker, pro rata by
 *    default.
 *
 * 2. WHAT THE BROKER IS PAID (commission)
 *    The prototype hard-coded 10% in the issue-quote email (and 15% in the
 *    generated broker data). Commission now comes from the producer's agreement:
 *    a rate by line of business for new and renewal business. A senior user may
 *    override the rate within the agreement's ceiling, with a reason. Commission
 *    is calculated on the commissionable premium (premium excluding taxes and
 *    fees). It is locked when the policy is bound, and then adjusted by
 *    endorsements (commission on additional premium, returned on return premium)
 *    and by cancellation (commission on the returned premium comes back).
 *
 * IMPORTANT: COMMISSION_SCHEDULE holds FICTIONAL producer agreements so the
 * workflow can be shown; production must load the real agreements. The lock
 * period, BOR waiting period and treatment of commission on a mid-term BOR are
 * carrier policy and are configuration. BOR rules also vary by state and by
 * carrier agreement; Compliance should confirm them.
 * ============================================================================
 */

var MARKET_LOCK_DAYS = 60;
var BOR_WAITING_DAYS = 5;
var BOR_COMMISSION_TREATMENT = "prorata";      // "prorata" (new broker from the BOR date) or "at_renewal"
var COMMISSION_DEFAULT = { rate: 10, max: 15 };
var COMMISSION_HARD_CAP = 25;                  // no one may exceed this, whatever the agreement says

/** Fictional agreements. rates[lob] = { new, renewal } in percent; "default" applies to any other line. */
var COMMISSION_SCHEDULE = [
  { id: "AGR-MARSH-2026", producers: ["Marsh & McLennan Commercial Brokerage", "Marsh & McLennan"], effective: "2026-01-01", expires: "2026-12-31", max: 15,
    rates: { trucking: { new: 12, renewal: 10 }, property: { new: 12.5, renewal: 10 }, gl_cpc: { new: 12, renewal: 10 }, gl_cas: { new: 15, renewal: 12.5 }, mpl: { new: 15, renewal: 12.5 }, default: { new: 10, renewal: 10 } } },
  { id: "AGR-AON-2026", producers: ["Aon Commercial Risk Solutions"], effective: "2026-01-01", expires: "2026-12-31", max: 15,
    rates: { property: { new: 12.5, renewal: 10 }, gl_cpc: { new: 12, renewal: 10 }, default: { new: 10, renewal: 10 } } },
  { id: "AGR-ARORA-2026", producers: ["Arora & Sons"], effective: "2026-01-01", expires: "2026-12-31", max: 18,
    rates: { trucking: { new: 15, renewal: 12 }, default: { new: 12, renewal: 10 } } },
  { id: "AGR-WTW-2026", producers: ["Willis Towers Watson Commercial"], effective: "2026-01-01", expires: "2026-12-31", max: 17.5,
    rates: { mpl: { new: 15, renewal: 12.5 }, default: { new: 12, renewal: 10 } } },
  { id: "AGR-GALLAGHER-2026", producers: ["Gallagher Commercial Brokers"], effective: "2026-01-01", expires: "2026-12-31", max: 15,
    rates: { gl_cpc: { new: 12, renewal: 10 }, default: { new: 10, renewal: 10 } } },
  { id: "AGR-AMWINS-2026", producers: ["Amwins Specialty Wholesale Brokerage"], effective: "2026-01-01", expires: "2026-12-31", max: 17.5,
    rates: { gl_cas: { new: 15, renewal: 15 }, default: { new: 12.5, renewal: 12.5 } } }
];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
var COM_NOISE = ["llc", "inc", "ltd", "corp", "co", "company", "the", "and", "group"];
function comKey(name) {
  return String(name || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t && COM_NOISE.indexOf(t) === -1).join(" ");
}
function comSameBroker(a, b) {
  const x = comKey(a), y = comKey(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 5 && y.length >= 5 && (x.indexOf(y) === 0 || y.indexOf(x) === 0));
}
function comIdKey(v) { return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function comToday() { return new Date().toISOString().slice(0, 10); }
function comAdd(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(n)); return d.toISOString().slice(0, 10); }
function comDays(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000); }
function comRound(n) { return Math.round(n * 100) / 100; }
function comMoney(n) { return (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function comSameInsured(a, b) {
  const fa = comIdKey(a.fein), fb = comIdKey(b.fein);
  if (fa && fb && fa === fb) return true;
  const na = comKey(a.insured), nb = comKey(b.insured);
  return !!na && na === nb;
}

function comIsLive(s) { return s.lifecycleStatus !== "declined" && !s.archived; }

/**
 * Who holds the market lock on this insured and line?
 * Returns { state: "clear"|"holder"|"conflict"|"lock_expired", holder, peers[] }
 */
function comFindConflicts(sub, all, nowMs) {
  const peers = all.filter(s => s.id !== sub.id && comIsLive(s) && s.channelType === "broker" && sub.channelType === "broker" &&
    s.lobKey === sub.lobKey && comSameInsured(s, sub) && !comSameBroker(s.broker, sub.broker) && s.renewalOf !== sub.id && sub.renewalOf !== s.id);
  if (!peers.length) return { state: "clear", holder: null, peers: [] };
  const ts = s => (typeof s.receivedTimestamp === "number" ? s.receivedTimestamp : Infinity);
  const all2 = peers.concat([sub]).sort((a, b) => ts(a) - ts(b));
  const holder = all2[0];
  if (holder.id === sub.id) return { state: "holder", holder, peers };
  const ageDays = (nowMs - ts(holder)) / 86400000;
  const quoted = !!(holder.quoteIssued || holder.pasSync);
  if (ageDays > MARKET_LOCK_DAYS && !quoted) return { state: "lock_expired", holder, peers };
  return { state: "conflict", holder, peers };
}

/** The agreement for a producer on a date, or null. */
function comFindAgreement(producer, today) {
  const t = today || comToday();
  return COMMISSION_SCHEDULE.find(a => a.producers.some(p => comSameBroker(p, producer)) && a.effective <= t && a.expires >= t) || null;
}

/** Rate and where it came from. Override beats agreement beats default. */
function comResolveRate(sub, today, producerOverride) {
  const producer = producerOverride || sub.broker;
  const type = (sub.renewalOf || (sub.genInfo && /renewal/i.test(sub.genInfo.policytype || ""))) ? "renewal" : "new";
  const ag = comFindAgreement(producer, today);
  const band = { max: Math.min(COMMISSION_HARD_CAP, ag ? ag.max : COMMISSION_DEFAULT.max) };
  let base = { rate: COMMISSION_DEFAULT.rate, source: "default", contractId: null };
  if (ag) {
    const r = ag.rates[sub.lobKey] || ag.rates.default;
    base = r ? { rate: r[type], source: "agreement", contractId: ag.id } : base;
  }
  if (sub.commissionOverride && !producerOverride) return { rate: sub.commissionOverride.rate, source: "override", contractId: base.contractId, agreementRate: base.rate, band, producer, businessType: type, override: sub.commissionOverride };
  return { rate: base.rate, source: base.source, contractId: base.contractId, agreementRate: base.rate, band, producer, businessType: type };
}

/**
 * Premium on which commission is paid. The Final Quoted Premium from discretionary pricing is already the policy premium
 * before tax and fees, so it is commissionable as it stands. If only the rating engine's figure exists, that figure includes
 * the quote's taxes and fees, which are taken out.
 */
function comCommissionable(sub) {
  const dp = sub.discretionaryPricing, q = sub.importedRatingData && sub.importedRatingData.quote;
  if (dp && dp.finalPremium) return { final: dp.finalPremium, commissionable: dp.finalPremium, deducted: 0 };
  const final = (q && q.finalPremium) || 0;
  if (!q) return { final, commissionable: final, deducted: 0 };
  const fees = (q.fees || []).reduce((s, f) => s + (Number(f.amt) || 0), 0);
  const tax = (Number(q.tax) || 0) + (Number(q.countyTax) || 0);
  const ded = comRound(fees + tax);
  return { final, commissionable: comRound(Math.max(0, final - ded)), deducted: ded };
}

function comAmount(commissionable, ratePct) { return comRound(commissionable * ratePct / 100); }

/** Validation of a BOR letter record. ctx: { today, brokerNow, producerStatus } */
function comValidateBor(ctx, f) {
  const p = [];
  if (!f.toBroker || String(f.toBroker).trim().length < 2) p.push("enter the new broker");
  if (!f.fromBroker || String(f.fromBroker).trim().length < 2) p.push("enter the broker being replaced");
  if (f.toBroker && f.fromBroker && comSameBroker(f.toBroker, f.fromBroker)) p.push("the new broker is the same agency as the broker being replaced");
  if (!f.signedByInsured) p.push("confirm the letter is signed by an authorized officer of the insured");
  if (String(f.signerName || "").trim().length < 3) p.push("enter the name of the person who signed for the insured");
  if (String(f.signerTitle || "").trim().length < 2) p.push("enter their title");
  if (String(f.docRef || "").trim().length < 3) p.push("enter the reference of the filed letter");
  if (!f.signedOn || !f.receivedOn) p.push("enter the date signed and the date received");
  else {
    if (f.signedOn > f.receivedOn) p.push("the letter cannot be signed after it was received");
    if (f.receivedOn > ctx.today) p.push("the received date cannot be in the future");
  }
  if (!f.effectiveOn) p.push("enter the date the change is to take effect");
  else if (f.receivedOn && f.effectiveOn < f.receivedOn) p.push("the change cannot take effect before the letter was received");
  if (!f.incumbentNotifiedOn && !f.incumbentConsented) p.push("record when the incumbent broker was notified, or that the incumbent consented");
  if (f.incumbentNotifiedOn && f.incumbentNotifiedOn < f.receivedOn) p.push("the incumbent cannot be notified before the letter was received");
  if (ctx.producerStatus && ctx.producerStatus !== "verified") p.push(`the new broker's licence and appointment are not verified (${ctx.producerStatus.replace(/_/g, " ")})`);
  return p;
}

/** Can an accepted BOR take effect today? Returns { ok, earliest } */
function comBorWaiting(rec, today) {
  if (rec.incumbentConsented) return { ok: true, earliest: rec.receivedOn };
  const start = rec.incumbentNotifiedOn || rec.receivedOn;
  const earliest = comAdd(start, BOR_WAITING_DAYS);
  return { ok: today >= earliest && today >= rec.effectiveOn, earliest: earliest > rec.effectiveOn ? earliest : rec.effectiveOn };
}

/** Split of the commission between the outgoing and incoming broker on a mid-term BOR. */
function comSplit(p) {
  const total = Math.max(1, comDays(p.policyEffective, p.policyExpiration));
  const elapsed = Math.min(total, Math.max(0, comDays(p.policyEffective, p.borEffective)));
  const frac = elapsed / total;
  const oldShare = comRound(p.commissionable * p.oldRate / 100 * frac);
  const newShare = comRound(p.commissionable * p.newRate / 100 * (1 - frac));
  return { elapsedDays: elapsed, totalDays: total, oldShare, newShare };
}

// ----------------------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------------------
function comSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function comActiveSub() { return comSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); }
function comNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function comActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function comEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function comLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 2, decision, by: comActor(), at: comNow(), notes });
}
function comPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}
function comIsBound(sub) { return !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }
function comBors(sub) { if (!sub.borRecords) sub.borRecords = []; return sub.borRecords; }
function comV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function comC(id) { const e = document.getElementById(id); return !!(e && e.checked); }

/** Re-evaluates market clearance, keeps any valid resolution, logs on change. */
function runMarketCheck(sub, trigger) {
  const res = comFindConflicts(sub, SUBMISSIONS_DATASET, Date.now());
  const mc = sub.marketClearance || {};
  let status = res.state === "conflict" ? "conflict" : "clear";
  let how = res.state;
  if (res.state === "conflict" && mc.resolution) { status = "resolved"; how = "resolved: " + mc.resolution.type; }
  const snap = `${status}:${res.holder ? res.holder.id : ""}:${(res.peers || []).map(p => p.id).sort().join(",")}`;
  const next = Object.assign({}, mc, { status, state: res.state, holderId: res.holder ? res.holder.id : null, holderBroker: res.holder ? res.holder.broker : null,
    peers: (res.peers || []).map(p => ({ id: p.id, broker: p.broker, receivedAt: p.receivedAt, receivedTimestamp: p.receivedTimestamp, status: p.statusText })), checkedAt: comNow() });
  const changed = mc._snap !== snap;
  next._snap = snap;
  sub.marketClearance = next;
  if (changed && res.state !== "clear") {
    comLog(sub, res.state === "holder" ? "market_lock_held" : (status === "conflict" ? "market_conflict_detected" : "market_conflict_resolved"),
      res.state === "holder" ? `This submission holds the market lock on ${sub.insured} for ${sub.lobName}; ${res.peers.length} later submission(s) from other brokers are in conflict (${res.peers.map(p => p.id + " / " + p.broker).join(", ")}).`
      : res.state === "lock_expired" ? `Market lock held by ${res.holder.id} (${res.holder.broker}) has expired after ${MARKET_LOCK_DAYS} days without a quote; no conflict.`
      : status === "resolved" ? `Market conflict with ${res.holder.id} (${res.holder.broker}) is resolved (${mc.resolution.type}).`
      : `Market conflict: ${res.holder.id} from ${res.holder.broker} was received first and holds the lock on ${sub.insured} for ${sub.lobName}. This submission (${sub.broker}) cannot proceed until a broker-of-record letter is accepted or the conflict is otherwise resolved.`);
    comPersist();
  }
  return next;
}

function comBlocksStep(sub) {
  const mc = sub.marketClearance;
  return !!(mc && mc.status === "conflict");
}

// ----------------------------------------------------------------------------
// 3. BOR ACTIONS
// ----------------------------------------------------------------------------
function comBorForm(sub) {
  return { toBroker: comV("com_borTo") || sub.broker, fromBroker: comV("com_borFrom"), signedOn: comV("com_borSigned"), receivedOn: comV("com_borReceived"),
    signerName: comV("com_borSigner"), signerTitle: comV("com_borTitle"), docRef: comV("com_borDoc"), signedByInsured: comC("com_borAttest"),
    incumbentNotifiedOn: comV("com_borNotified"), incumbentConsented: comC("com_borConsent"), effectiveOn: comV("com_borEffective") };
}

function comRecordBor(subId) {
  const sub = comSub(subId || (typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null)); if (!sub) return;
  if (!hasPermission("brokerRelations", "edit")) { denyPermission("brokerRelations", "edit"); return; }
  const bound = comIsBound(sub);
  const f = comBorForm(sub);
  if (!bound) f.toBroker = sub.broker;
  const ps = typeof evaluateProducerCompliance === "function" ? evaluateProducerCompliance(Object.assign({}, sub, { broker: f.toBroker, channelType: "broker" }), new Date()).status : null;
  const problems = comValidateBor({ today: comToday(), producerStatus: ps }, f);
  if (comBors(sub).some(b => b.status === "pending")) problems.push("a BOR letter is already pending on this submission");
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  const rec = Object.assign({ id: `BOR-${sub.id}-${comBors(sub).length + 1}`, scope: bound ? "policy" : "submission", status: "pending", recordedBy: comActor(), recordedAt: comNow() }, f);
  comBors(sub).push(rec);
  comLog(sub, "bor_recorded", `BOR letter ${rec.id} logged: ${f.fromBroker} → ${f.toBroker}, signed ${f.signedOn} by ${f.signerName}, ${f.signerTitle} (ref ${f.docRef}), received ${f.receivedOn}; ${f.incumbentConsented ? "incumbent consented" : "incumbent notified " + f.incumbentNotifiedOn}; effective ${f.effectiveOn}. Awaiting acceptance.`);
  comPersist(); renderMarketCard(sub); renderCommissionCard(sub);
  showToast("BOR letter logged. It needs acceptance by an approver.", "info");
}

function comAcceptBor(subId, borId) {
  const sub = comSub(subId); if (!sub) return;
  if (!hasPermission("brokerRelations", "approve")) { denyPermission("brokerRelations", "approve"); return; }
  const rec = comBors(sub).find(b => b.id === borId);
  if (!rec || rec.status !== "pending") return;
  if (rec.scope === "policy" && !hasPermission("brokerRelations", "override")) { denyPermission("brokerRelations", "override"); return; }
  const w = comBorWaiting(rec, comToday());
  if (!w.ok) { showToast(`⛔ The waiting period has not run. The earliest this BOR can be accepted is ${w.earliest}.`, "danger"); return; }

  rec.status = "accepted"; rec.acceptedBy = comActor(); rec.acceptedAt = comNow();
  if (rec.scope === "submission") {
    sub.marketClearance = Object.assign({}, sub.marketClearance, { resolution: { type: "bor", borId, by: comActor(), at: comNow() }, status: "resolved" });
    const holder = sub.marketClearance.holderId && comSub(sub.marketClearance.holderId);
    if (holder) {
      holder.marketClearance = Object.assign({}, holder.marketClearance, { lockReleased: { to: sub.id, reason: "BOR", at: comNow() } });
      comLog(holder, "bor_effective", `Market lock released: ${sub.insured} appointed ${rec.toBroker} by BOR letter ${rec.docRef}. Submission ${sub.id} now holds the lock.`);
    }
    comLog(sub, "bor_effective", `BOR letter ${rec.id} accepted: ${rec.toBroker} is broker of record for ${sub.insured}. Market conflict resolved.`);
    runMarketCheck(sub, "bor accepted");
  } else {
    comTransferPolicyBroker(sub, rec);
  }
  comPersist(); renderMarketCard(sub); renderCommissionCard(sub);
  showToast("BOR accepted.", "success");
}

function comRejectBor(subId, borId) {
  const sub = comSub(subId); if (!sub) return;
  if (!hasPermission("brokerRelations", "approve")) { denyPermission("brokerRelations", "approve"); return; }
  const rec = comBors(sub).find(b => b.id === borId);
  if (!rec || rec.status !== "pending") return;
  const why = comV("com_borReject");
  if (why.length < 10) { showToast("Give the reason for rejecting the letter (at least 10 characters).", "danger"); return; }
  rec.status = "rejected"; rec.rejectedBy = comActor(); rec.rejectedAt = comNow(); rec.rejectReason = why;
  comLog(sub, "bor_rejected", `BOR letter ${rec.id} rejected: ${why}`);
  comPersist(); renderMarketCard(sub); renderCommissionCard(sub);
}

/** Mid-term BOR: the broker on the policy changes and commission is split. */
function comTransferPolicyBroker(sub, rec) {
  const facts = typeof pcFacts === "function" ? pcFacts(sub) : { effective: null, expiration: null };
  const treatment = BOR_COMMISSION_TREATMENT;
  if (treatment === "at_renewal") {
    rec.status = "accepted_at_renewal";
    comLog(sub, "bor_effective", `BOR letter ${rec.id} accepted: ${rec.toBroker} becomes broker of record at renewal (${facts.expiration}). ${rec.fromBroker} keeps this policy's commission.`);
    return;
  }
  const c = comLockedOrCurrent(sub);
  const oldRate = c.rate, newRes = comResolveRate(sub, rec.effectiveOn, rec.toBroker);
  const split = facts.effective && facts.expiration ? comSplit({ commissionable: c.commissionable, oldRate, newRate: newRes.rate, policyEffective: facts.effective, policyExpiration: facts.expiration, borEffective: rec.effectiveOn }) : null;
  const history = { borId: rec.id, from: rec.fromBroker, to: rec.toBroker, effective: rec.effectiveOn, oldRate, newRate: newRes.rate, newContract: newRes.contractId, split, at: comNow() };
  if (!sub.borHistory) sub.borHistory = [];
  sub.borHistory.push(history);
  const previous = sub.broker;
  sub.broker = rec.toBroker;
  if (sub.commission) { sub.commission.rate = newRes.rate; sub.commission.source = newRes.source; sub.commission.contractId = newRes.contractId; sub.commission.producer = rec.toBroker; if (split) sub.commission.splits = (sub.commission.splits || []).concat([history]); }
  if (typeof runProducerCheck === "function") { sub.producerCheck = null; runProducerCheck(sub, "BOR"); }
  const certs = (sub.certificates || []).filter(x => x.status === "issued").length;
  comLog(sub, "bor_policy_transfer", `BOR letter ${rec.id} accepted: broker on policy ${facts.policyNumber || ""} changes from ${previous} to ${rec.toBroker} effective ${rec.effectiveOn}. Commission: rate ${oldRate}% → ${newRes.rate}%${split ? `; to ${rec.effectiveOn} ${previous} earns ${comMoney(split.oldShare)}, afterwards ${rec.toBroker} earns ${comMoney(split.newShare)}` : ""}.${certs ? ` ${certs} issued certificate(s) still name the previous producer; reissue them.` : ""}`);
}

function comOverrideConflict(subId) {
  const sub = comSub(subId); if (!sub) return;
  if (!hasPermission("brokerRelations", "override")) { denyPermission("brokerRelations", "override"); return; }
  const mc = sub.marketClearance;
  if (!mc || mc.status !== "conflict") return;
  const why = comV("com_ovrWhy");
  if (why.length < 15) { showToast("Explain why these are separate risks (at least 15 characters).", "danger"); return; }
  sub.marketClearance = Object.assign({}, mc, { resolution: { type: "separate_risk", reason: why, by: comActor(), at: comNow() }, status: "resolved" });
  comLog(sub, "market_conflict_resolved", `Market conflict with ${mc.holderId} (${mc.holderBroker}) overridden as separate risks: ${why}`);
  runMarketCheck(sub, "override");
  comPersist(); renderMarketCard(sub);
  showToast("Conflict cleared as separate risks, and logged.", "success");
}

// ----------------------------------------------------------------------------
// 4. COMMISSION ACTIONS
// ----------------------------------------------------------------------------
function comCurrent(sub) {
  const r = comResolveRate(sub);
  const p = comCommissionable(sub);
  return { rate: r.rate, source: r.source, contractId: r.contractId, producer: sub.broker, businessType: r.businessType, band: r.band, final: p.final, commissionable: p.commissionable, deducted: p.deducted, amount: comAmount(p.commissionable, r.rate), agreementRate: r.agreementRate };
}
function comLockedOrCurrent(sub) { return sub.commission && sub.commission.locked ? sub.commission : comCurrent(sub); }

function comSetOverride(subId) {
  const sub = comSub(subId); if (!sub) return;
  if (!hasPermission("brokerRelations", "override")) { denyPermission("brokerRelations", "override"); return; }
  if (sub.commission && sub.commission.locked) { showToast("⛔ Commission is locked at bind. Change the producer agreement or use a BOR instead.", "danger"); return; }
  const rate = Number(comV("com_ovrRate")), why = comV("com_ovrReason");
  const cur = comResolveRate(Object.assign({}, sub, { commissionOverride: null }));
  const problems = [];
  if (isNaN(rate) || comV("com_ovrRate") === "") problems.push("enter the commission rate in percent");
  else {
    if (rate < 0) problems.push("the rate cannot be negative");
    if (rate > cur.band.max) problems.push(`the rate cannot exceed ${cur.band.max}% (${cur.contractId ? "the agreement's ceiling" : "the default ceiling"}; absolute cap ${COMMISSION_HARD_CAP}%)`);
    if (rate === cur.agreementRate) problems.push("that is already the agreement rate");
  }
  if (why.length < 10) problems.push("give the reason for the override (at least 10 characters)");
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  sub.commissionOverride = { rate, reason: why, by: comActor(), at: comNow(), agreementRate: cur.agreementRate };
  comLog(sub, "commission_override", `Commission overridden from ${cur.agreementRate}% to ${rate}% for ${sub.broker}: ${why}`);
  comPersist(); renderCommissionCard(sub);
  showToast("Commission override recorded.", "success");
}

function comClearOverride(subId) {
  const sub = comSub(subId); if (!sub || !sub.commissionOverride) return;
  if (!hasPermission("brokerRelations", "override")) { denyPermission("brokerRelations", "override"); return; }
  if (sub.commission && sub.commission.locked) { showToast("⛔ Commission is locked at bind.", "danger"); return; }
  comLog(sub, "commission_override", `Commission override of ${sub.commissionOverride.rate}% removed; the agreement rate applies.`);
  sub.commissionOverride = null;
  comPersist(); renderCommissionCard(sub);
}

/** Freezes the commission when the policy is bound. */
function comLockAtBind(sub) {
  if (!sub || (sub.commission && sub.commission.locked)) return;
  const c = comCurrent(sub);
  sub.commission = Object.assign({}, c, { locked: true, lockedAt: comNow(), adjustments: [], splits: [] });
  comLog(sub, "commission_locked", `Commission locked at bind: ${c.rate}% of ${comMoney(c.commissionable)} commissionable premium = ${comMoney(c.amount)} (${c.source}${c.contractId ? " " + c.contractId : ""}; ${c.producer}, ${c.businessType} business).`);
  comPersist();
}

/** Net commission now: the locked amount plus any adjustments. */
function comNet(sub) {
  const c = comLockedOrCurrent(sub);
  const adj = (c.adjustments || []).reduce((s, a) => s + a.commission, 0);
  return { base: c.amount, adjustments: comRound(adj), net: comRound(c.amount + adj) };
}

// ----------------------------------------------------------------------------
// 5. RENDERING
// ----------------------------------------------------------------------------
function comBorFormHtml(sub, scope) {
  const bound = scope === "policy";
  return `<h4 style="margin:14px 0 6px;">Record a broker-of-record letter</h4>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      ${bound ? `<input id="com_borTo" class="form-control" style="width:260px;" placeholder="New broker (agency name)">` : `<span class="text-xs">New broker: <strong>${comEsc(sub.broker)}</strong></span>`}
      <input id="com_borFrom" class="form-control" style="width:340px;" placeholder="Broker being replaced" value="${comEsc(!bound && sub.marketClearance ? (sub.marketClearance.holderBroker || "") : sub.broker)}">
      <input id="com_borSigner" class="form-control" style="width:200px;" placeholder="Signed for the insured by">
      <input id="com_borTitle" class="form-control" style="width:150px;" placeholder="Title">
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;">
      <label class="text-xs text-muted" style="font-size:12px;">Signed <input id="com_borSigned" type="date" class="form-control" style="width:150px;"></label>
      <label class="text-xs text-muted" style="font-size:12px;">Received <input id="com_borReceived" type="date" class="form-control" style="width:150px;"></label>
      <label class="text-xs text-muted" style="font-size:12px;">Effective <input id="com_borEffective" type="date" class="form-control" style="width:150px;"></label>
      <input id="com_borDoc" class="form-control" style="width:200px;" placeholder="Filed letter reference">
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px;font-size:12.5px;">
      <label><input type="checkbox" id="com_borAttest"> Signed by an authorized officer of the insured</label>
      <label class="text-xs text-muted" style="font-size:12px;">Incumbent notified <input id="com_borNotified" type="date" class="form-control" style="width:150px;"></label>
      <label><input type="checkbox" id="com_borConsent"> or the incumbent consented</label>
      <button class="btn btn-sm btn-primary" style="width:auto;" onclick="comRecordBor('${comEsc(sub.id)}')"><i class="ph ph-file-text"></i> Log letter</button>
    </div>
    <p class="text-xs text-muted" style="margin-top:4px;">The new broker must be licensed and appointed. A ${BOR_WAITING_DAYS}-day waiting period runs from the incumbent's notice unless the incumbent consents.</p>`;
}

function comBorTableHtml(sub) {
  const canApprove = hasPermission("brokerRelations", "approve");
  const rows = comBors(sub).slice().reverse().map(b => {
    const badge = b.status === "accepted" || b.status === "accepted_at_renewal" ? "badge-success" : (b.status === "rejected" ? "badge-danger" : "badge-warning");
    const w = comBorWaiting(b, comToday());
    return `<tr><td>${comEsc(b.id)}</td><td>${comEsc(b.fromBroker)} → ${comEsc(b.toBroker)}<div class="text-xs text-muted">${comEsc(b.signerName)}, ${comEsc(b.signerTitle)} · ref ${comEsc(b.docRef)}</div></td>
      <td>${comEsc(b.effectiveOn)}</td><td><span class="badge ${badge} text-xs">${comEsc(b.status.replace(/_/g, " "))}</span>${b.status === "pending" && !w.ok ? `<div class="text-xs text-muted">earliest ${comEsc(w.earliest)}</div>` : ""}</td>
      <td>${b.status === "pending" && canApprove ? `<button class="btn btn-xs btn-success" style="width:auto;" onclick="comAcceptBor('${comEsc(sub.id)}','${comEsc(b.id)}')">Accept</button>
        <input id="com_borReject" class="form-control" style="width:170px;display:inline-block;" placeholder="Reason to reject"> <button class="btn btn-xs btn-outline-danger" style="width:auto;" onclick="comRejectBor('${comEsc(sub.id)}','${comEsc(b.id)}')">Reject</button>` : (b.rejectReason ? `<span class="text-xs text-muted">${comEsc(b.rejectReason)}</span>` : "")}</td></tr>`;
  }).join("");
  return rows ? `<div class="rules-table-container" style="max-height:none;overflow:visible;margin-top:8px;"><table class="data-table"><thead><tr><th>Letter</th><th>Change</th><th>Effective</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : "";
}

function renderMarketCard(sub) {
  const box = document.getElementById("marketClearanceContainer");
  if (!box || !sub) return;
  const mc = runMarketCheck(sub, "view");
  const canEdit = hasPermission("brokerRelations", "edit"), canOverride = hasPermission("brokerRelations", "override");
  const ui = mc.status === "conflict" ? { b: "badge-danger", l: "Conflict — blocked" } : (mc.status === "resolved" ? { b: "badge-success", l: "Resolved" } : (mc.state === "holder" ? { b: "badge-info", l: "Holds the lock" } : { b: "badge-success", l: "Clear" }));
  let body = "";
  if (sub.channelType !== "broker") body = `<div class="alert alert-success text-xs"><i class="ph ph-minus-circle"></i> Direct submission: no broker, so no market conflict is possible.</div>`;
  else if (mc.state === "clear") body = `<div class="alert alert-success text-xs"><i class="ph ph-check-circle"></i> No other broker has a live submission for ${comEsc(sub.insured)} on ${comEsc(sub.lobName || "this line")}.</div>`;
  else if (mc.state === "lock_expired") body = `<div class="alert alert-success text-xs"><i class="ph ph-timer"></i> The earlier submission by ${comEsc(mc.holderBroker)} (${comEsc(mc.holderId)}) went ${MARKET_LOCK_DAYS} days without a quote, so its lock has expired.</div>`;
  else if (mc.state === "holder") body = `<div class="alert alert-info text-xs"><i class="ph ph-lock-key"></i> This submission was received first and holds the market lock. Later submissions from other brokers (${mc.peers.map(p => comEsc(p.id + " / " + p.broker)).join("; ")}) are blocked until they obtain a BOR letter.</div>`;
  else if (mc.status === "resolved") body = `<div class="alert alert-success text-xs"><i class="ph ph-check-circle"></i> The conflict with ${comEsc(mc.holderId)} (${comEsc(mc.holderBroker)}) is resolved: ${comEsc(mc.resolution.type === "bor" ? "broker-of-record letter accepted (" + mc.resolution.borId + ")" : "cleared as separate risks — " + (mc.resolution.reason || ""))}.</div>`;
  else body = `<div class="alert alert-danger text-xs"><i class="ph ph-prohibit"></i> <strong>Market conflict.</strong> ${comEsc(mc.holderBroker)} submitted this insured for this line first (${comEsc(mc.holderId)}, received ${comEsc(mc.peers.find(p => p.id === mc.holderId) ? mc.peers.find(p => p.id === mc.holderId).receivedAt : "")}) and holds the lock. Step 2 cannot be completed until an insured-signed broker-of-record letter naming ${comEsc(sub.broker)} is accepted, or the conflict is cleared.</div>`;

  const bound = comIsBound(sub);
  const forms = (mc.status === "conflict" && canEdit && !bound ? comBorFormHtml(sub, "submission") : "") +
    (mc.status === "conflict" && canOverride ? `<h4 style="margin:14px 0 6px;">Or clear as separate risks</h4><div style="display:flex;gap:8px;"><input id="com_ovrWhy" class="form-control" style="flex:1;" placeholder="Why these are different risks (15+ characters)"><button class="btn btn-sm btn-outline" style="width:auto;" onclick="comOverrideConflict('${comEsc(sub.id)}')">Clear conflict</button></div>` : "") +
    (mc.status === "conflict" && typeof triggerDuplicateExit === "function" && hasPermission("workflow", "approve") ? `<div style="margin-top:10px;"><button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="triggerDuplicateExit()"><i class="ph ph-prohibit"></i> Decline as duplicate</button></div>` : "");

  box.innerHTML = `<div class="card"><div class="card-header"><h3><i class="ph ph-users-three"></i> Market Clearance &amp; Broker of Record</h3><span class="badge ${ui.b}">${ui.l}</span></div>
    <div class="card-body">${body}${comBorTableHtml(sub)}${forms}
    <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> The first broker to submit an insured for a line holds the lock for ${MARKET_LOCK_DAYS} days if it goes unquoted. Matching uses the FEIN or the insured's name, the same line of business, and a different agency.</p></div></div>`;
}

function renderCommissionCard(sub) {
  const box = document.getElementById("commissionContainer");
  if (!box || !sub) return;
  const bound = comIsBound(sub);
  const c = comLockedOrCurrent(sub);
  const net = comNet(sub);
  const canOverride = hasPermission("brokerRelations", "override"), canEdit = hasPermission("brokerRelations", "edit");
  const adj = (c.adjustments || []).map(a => `<tr><td>${comEsc(a.at)}</td><td>${comEsc(a.label)}</td><td class="font-mono">${comMoney(a.premium)}</td><td class="font-mono">${comMoney(a.commission)}</td></tr>`).join("");
  const splits = (sub.borHistory || []).map(h => `<tr><td>${comEsc(h.effective)}</td><td>${comEsc(h.from)} → ${comEsc(h.to)}</td><td>${h.split ? comMoney(h.split.oldShare) + " / " + comMoney(h.split.newShare) : "—"}</td><td>${h.oldRate}% → ${h.newRate}%</td></tr>`).join("");
  const ovr = sub.commissionOverride;
  const controls = (!bound && canOverride) ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;">
      <input id="com_ovrRate" type="number" step="0.1" class="form-control" style="width:150px;" placeholder="Rate %"><input id="com_ovrReason" class="form-control" style="flex:1;min-width:220px;" placeholder="Reason for the override (10+ characters)">
      <button class="btn btn-sm btn-outline" style="width:auto;" onclick="comSetOverride('${comEsc(sub.id)}')">Override rate</button>
      ${ovr ? `<button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="comClearOverride('${comEsc(sub.id)}')">Remove override</button>` : ""}</div>` : "";
  box.innerHTML = `<div class="card" style="margin-bottom:16px;"><div class="card-header"><h3><i class="ph ph-percent"></i> Broker &amp; Commission</h3>
      <span class="badge ${c.locked ? "badge-success" : "badge-light"}">${c.locked ? "Locked at bind" : "Estimate until bound"}</span></div>
    <div class="card-body">
      <div class="clean-meta-list" style="margin-bottom:10px;">
        <div class="clean-meta-row"><span class="meta-label">Broker</span><span class="meta-value">${comEsc(sub.broker || "Direct")}</span></div>
        <div class="clean-meta-row"><span class="meta-label">Agreement</span><span class="meta-value">${c.contractId ? comEsc(c.contractId) : "No agreement on file — default rate"} · ${comEsc(c.businessType)} business</span></div>
        <div class="clean-meta-row"><span class="meta-label">Rate</span><span class="meta-value"><strong>${c.rate}%</strong> <span class="text-muted">(${comEsc(c.source)}${c.source === "override" ? `, agreement ${c.agreementRate}%` : ""}; ceiling ${c.band ? c.band.max : COMMISSION_DEFAULT.max}%)</span></span></div>
        <div class="clean-meta-row"><span class="meta-label">Commissionable premium</span><span class="meta-value">${comMoney(c.commissionable)} <span class="text-muted">(final ${comMoney(c.final)} less ${comMoney(c.deducted)} taxes and fees)</span></span></div>
        <div class="clean-meta-row"><span class="meta-label">Commission</span><span class="meta-value"><strong>${comMoney(net.net)}</strong>${net.adjustments ? ` <span class="text-muted">(${comMoney(net.base)} at bind ${net.adjustments >= 0 ? "+" : "−"} ${comMoney(Math.abs(net.adjustments))} adjustments)</span>` : ""}</span></div>
      </div>
      ${ovr ? `<div class="alert alert-warning text-xs"><i class="ph ph-pencil-simple"></i> Override ${ovr.rate}% (agreement ${ovr.agreementRate}%) by ${comEsc(ovr.by)}: ${comEsc(ovr.reason)}</div>` : ""}
      ${adj ? `<h4 style="margin:10px 0 4px;">Adjustments</h4><div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>When</th><th>Event</th><th>Premium</th><th>Commission</th></tr></thead><tbody>${adj}</tbody></table></div>` : ""}
      ${splits ? `<h4 style="margin:10px 0 4px;">Broker changes on this policy</h4><div class="rules-table-container" style="max-height:none;overflow:visible;"><table class="data-table"><thead><tr><th>Effective</th><th>Change</th><th>Commission old / new broker</th><th>Rate</th></tr></thead><tbody>${splits}</tbody></table></div>` : ""}
      ${controls}
      ${bound ? comBorTableHtml(sub) + (canEdit ? comBorFormHtml(sub, "policy") : "") : ""}
      <p class="text-xs text-muted" style="margin-top:10px;"><i class="ph ph-info"></i> Rates come from fictional demonstration agreements; production must load the real producer agreements. Commission is locked at bind and adjusted by endorsements and cancellation. A mid-term BOR is treated as "${BOR_COMMISSION_TREATMENT === "prorata" ? "pro rata from the BOR date" : "effective at renewal"}".</p>
    </div></div>`;
}

// ----------------------------------------------------------------------------
// 6. HOOKS
// ----------------------------------------------------------------------------
function comBorGuardBind(source, subId) {
  const sub = subId ? comSub(subId) : comActiveSub();
  if (!sub) return true;
  runMarketCheck(sub, "bind");
  const pending = comBors(sub).filter(b => b.status === "pending");
  let why = null;
  if (comBlocksStep(sub)) why = `a market conflict with ${sub.marketClearance.holderId} (${sub.marketClearance.holderBroker}) is unresolved`;
  else if (pending.length) why = `broker-of-record letter ${pending[0].id} is pending; the broker is not settled`;
  if (!why) return true;
  comLog(sub, "bor_bind_blocked", `Bind attempt blocked (${source}): ${why}.`);
  comPersist();
  showToast(`⛔ Bind blocked: ${why}.`, "danger");
  renderMarketCard(sub);
  return false;
}

(function installBrokerHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.market_conflict_detected = m("Market Conflict Detected", "ph-users-three", "badge-danger", "outcome-refer");
    AUDIT_ACTION_META.market_conflict_resolved = m("Market Conflict Resolved", "ph-users-three", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.market_lock_held = m("Market Lock Held", "ph-lock-key", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.bor_recorded = m("BOR Letter Logged", "ph-file-text", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.bor_effective = m("Broker of Record Changed", "ph-swap", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.bor_rejected = m("BOR Letter Rejected", "ph-x-circle", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.bor_policy_transfer = m("Policy Broker Transferred", "ph-swap", "badge-info", "outcome-bind");
    AUDIT_ACTION_META.bor_bind_blocked = m("Bind Blocked — Broker of Record", "ph-prohibit", "badge-danger", "outcome-decline");
    AUDIT_ACTION_META.commission_override = m("Commission Rate Overridden", "ph-percent", "badge-warning", "outcome-pricing");
    AUDIT_ACTION_META.commission_locked = m("Commission Locked at Bind", "ph-lock", "badge-info", "outcome-bind");
    AUDIT_ACTION_META.commission_adjusted = m("Commission Adjusted", "ph-percent", "badge-light", "outcome-pricing");
  }

  // Step 2: the Clearance screen
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { if (sub) { renderMarketCard(sub); renderCommissionCard(sub); } } catch (e) { console.warn("Broker cards failed:", e); }
      return r;
    };
  }
  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || comActiveSub(); if (s) renderCommissionCard(s); } catch (e) { console.warn("Commission card failed:", e); }
      return r;
    };
  }
  // Leaving Step 2 is blocked while there is an unresolved market conflict
  const origNext = window.goToNextStep;
  if (typeof origNext === "function") {
    window.goToNextStep = function () {
      if (typeof currentWorkflowStep !== "undefined" && currentWorkflowStep === 2) {
        const sub = comActiveSub();
        if (sub) {
          runMarketCheck(sub, "step 2 exit");
          if (comBlocksStep(sub)) {
            comLog(sub, "bor_bind_blocked", `Step 2 exit blocked: market conflict with ${sub.marketClearance.holderId} (${sub.marketClearance.holderBroker}).`);
            comPersist();
            showToast(`⛔ Cannot leave Step 2: ${sub.marketClearance.holderBroker} holds the market lock on this insured. Log and accept a broker-of-record letter, or clear the conflict.`, "danger");
            renderMarketCard(sub);
            return;
          }
        }
      }
      return origNext.apply(this, arguments);
    };
  }
  // The real bind
  const origPas = window.simulatePASBindSync;
  if (typeof origPas === "function") {
    window.simulatePASBindSync = function (subId) {
      if (!comBorGuardBind("PAS bind", subId)) return;
      return origPas.apply(this, arguments);
    };
  }
  // Commission locks when the bound quote version is recorded
  const origRecord = window.recordQuoteVersion;
  if (typeof origRecord === "function") {
    window.recordQuoteVersion = function (sub, isBound) {
      const r = origRecord.apply(this, arguments);
      if (isBound === true && sub) comLockAtBind(sub);
      return r;
    };
  }
  // Endorsements move commission with the premium
  const origEnd = window.pcIssueEndorsement;
  if (typeof origEnd === "function") {
    window.pcIssueEndorsement = function () {
      const sub = comActiveSub();
      const before = sub && typeof pcLedger === "function" ? pcLedger(sub).adjustments.length : 0;
      const r = origEnd.apply(this, arguments);
      if (sub && typeof pcLedger === "function") {
        const L = pcLedger(sub);
        if (L.adjustments.length > before && sub.commission && sub.commission.locked) {
          const a = L.adjustments[L.adjustments.length - 1];
          sub.commission.adjustments.push({ at: comNow(), label: `Endorsement ${a.endorsement}`, premium: a.proRata, commission: comRound(a.proRata * sub.commission.rate / 100) });
          comLog(sub, "commission_adjusted", `Endorsement ${a.endorsement}: premium ${comMoney(a.proRata)} → commission ${comMoney(a.proRata * sub.commission.rate / 100)} at ${sub.commission.rate}%.`);
          comPersist(); renderCommissionCard(sub);
        }
      }
      return r;
    };
  }
  // Cancellation returns commission on the returned premium
  const origDue = window.pcApplyDue;
  if (typeof origDue === "function") {
    window.pcApplyDue = function (sub) {
      const before = sub && sub.policyState;
      const r = origDue.apply(this, arguments);
      if (sub && before !== "cancelled" && sub.policyState === "cancelled" && sub.commission && sub.commission.locked && !sub.commission.cancelAdjusted) {
        const ev = (sub.policyChanges || []).find(c => c.id === (sub.cancellation && sub.cancellation.eventId));
        if (ev && ev.refund) {
          sub.commission.cancelAdjusted = true;
          const ret = -comRound(ev.refund.refund * sub.commission.rate / 100);
          sub.commission.adjustments.push({ at: comNow(), label: `Cancellation ${ev.id}`, premium: -ev.refund.refund, commission: ret });
          comLog(sub, "commission_adjusted", `Cancellation ${ev.id}: commission of ${comMoney(Math.abs(ret))} on the ${comMoney(ev.refund.refund)} return premium is returned by ${sub.broker}.`);
          comPersist();
        }
      }
      return r;
    };
  }
})();

window.comRecordBor = comRecordBor; window.comAcceptBor = comAcceptBor; window.comRejectBor = comRejectBor;
window.comOverrideConflict = comOverrideConflict; window.comSetOverride = comSetOverride; window.comClearOverride = comClearOverride;
window.renderMarketCard = renderMarketCard; window.renderCommissionCard = renderCommissionCard;
window.resolveCommissionRate = function (sub) { return comResolveRate(sub).rate / 100; };
window.commissionAmountFor = function (sub, finalPremium, rate) { const p = comCommissionable(sub); return comRound((p.commissionable || finalPremium) * rate); };
