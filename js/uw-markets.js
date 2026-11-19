/**
 * ============================================================================
 * MARKET PLACEMENTS: ONE SUBMISSION, SEVERAL MARKETS, EACH WITH ITS OWN ANSWER
 * ----------------------------------------------------------------------------
 * A submission could name one carrier. A broker, wholesaler or MGA often sends the same risk to several markets and waits for each to
 * answer. A placement is one market's handling of the submission:
 *
 *   PLACEMENT  the market (a carrier, an MGA or a wholesaler), when it was sent and the date a response is due, and its status: draft,
 *              sent, quoted, declined, accepted, withdrawn or no response. A decline by a market carries a reason from the governed
 *              list (the notice reasons plus "the market has no capacity for this class") and what the market said.
 *   QUOTE      what a market sent back: its own quote reference (how it is traced), how it arrived (API, ACORD XML, email, upload),
 *              the premium, fees and taxes, the currency, how long it is valid, a summary of cover and terms, and its state
 *              (received, presented to the insured, accepted, declined, expired).
 *   COMPARE    the quotes side by side: premium, fees and taxes, total, and validity, lowest total first.
 *   ACCEPT     accepting a market's quote marks its placement accepted and withdraws the other placements that were still open, each
 *              with the reason "another market's quote was accepted". Only one quote can be accepted on a submission.
 *   OVERDUE    a placement still waiting past its response date is shown as overdue, and can be marked as no response.
 * Nothing is sent from the prototype (there is no mail server or market connection): the person records what was sent and received.
 * ============================================================================
 */

const PL_KINDS = { carrier: "Carrier", mga: "MGA or MGU", wholesaler: "Wholesaler" };
const PL_STATUSES = { draft: "Draft", sent: "Sent", quoted: "Quoted", declined: "Declined", accepted: "Accepted", withdrawn: "Withdrawn", no_response: "No response" };
const PL_VIA = { api: "API", acord_xml: "ACORD XML", email: "Email", upload: "Upload" };
const PL_QUOTE_STATES = { received: "Received", presented: "Presented to the insured", accepted: "Accepted", declined: "Declined", expired: "Expired" };

function plList(sub) { if (!sub.placements) sub.placements = []; return sub.placements; }
function plReasons() { return (typeof NOTICE_REASON_CODES !== "undefined" ? NOTICE_REASON_CODES : [{ code: "OTHER", label: "Another reason" }]).map(r => ({ code: r.code, label: r.label })).concat([{ code: "MARKET_CAPACITY", label: "The market has no capacity for this class" }]); }
function plEdit() { if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return false; } return true; }
function plFind(sub, id) { return plList(sub).find(p => p.id === id) || null; }
function plLog(sub, decision, notes) { logDecision(sub, sub.currentStep || 6, decision, notes); if (typeof persistAppState === "function") persistAppState(); }

/** Adds a placement as a draft. f: { marketName, marketKind, programRef } */
function plAdd(sub, f) {
  if (!plEdit()) return { ok: false, error: "permission" };
  const e = [];
  if (String(f.marketName || "").trim().length < 2) e.push("name the market");
  if (!PL_KINDS[f.marketKind]) e.push("choose carrier, MGA or wholesaler");
  if (plList(sub).some(p => p.marketName.toLowerCase() === String(f.marketName || "").trim().toLowerCase() && ["withdrawn", "declined", "no_response"].indexOf(p.status) < 0)) e.push("this market already has a placement open on the submission");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  if (policyIsBound(sub)) return { ok: false, error: "bound" };
  const p = { id: "PL-" + (plList(sub).length + 1), marketName: String(f.marketName).trim(), marketKind: f.marketKind, programRef: String(f.programRef || "").trim(), status: "draft", sentAt: null, responseDueAt: null, quotes: [], createdBy: ucActor(), createdAt: nowStamp() };
  plList(sub).push(p); plLog(sub, "placement_added", p.id + ": " + p.marketName + " (" + PL_KINDS[p.marketKind] + ") added as a draft.");
  return { ok: true, placement: p };
}
function plSend(sub, id, dueOn, sentOn) {
  if (!plEdit()) return { ok: false, error: "permission" };
  const p = plFind(sub, id);
  if (!p || p.status !== "draft") return { ok: false, error: "state" };
  const iso = /^\d{4}-\d{2}-\d{2}$/, sent = sentOn || todayIso();
  if (!iso.test(dueOn || "") || dueOn < sent) return { ok: false, error: "due" };
  p.status = "sent"; p.sentAt = sent; p.responseDueAt = dueOn;
  plLog(sub, "placement_sent", p.id + " sent to " + p.marketName + " on " + sent + "; a response is due " + dueOn + ".");
  return { ok: true, placement: p };
}
/** Records a quote a market sent back. q: { reference, via, premium, feesTaxes, currency, validUntil, summary } */
function plRecordQuote(sub, id, q) {
  if (!plEdit()) return { ok: false, error: "permission" };
  const p = plFind(sub, id);
  if (!p || ["sent", "quoted"].indexOf(p.status) < 0) return { ok: false, error: "state" };
  const e = [], iso = /^\d{4}-\d{2}-\d{2}$/;
  if (String(q.reference || "").trim().length < 3) e.push("enter the market's quote reference");
  if (!PL_VIA[q.via]) e.push("say how the quote arrived");
  if (!(Number(q.premium) > 0)) e.push("enter the premium");
  if (q.feesTaxes !== "" && q.feesTaxes !== undefined && !(Number(q.feesTaxes) >= 0)) e.push("fees and taxes are a number from 0");
  if (!/^[A-Z]{3}$/.test(q.currency || "USD")) e.push("the currency is a three-letter code");
  if (!iso.test(q.validUntil || "")) e.push("enter the date the quote is valid until");
  if (e.length) return { ok: false, error: "invalid", errors: e };
  if (p.quotes.some(x => x.reference === String(q.reference).trim())) return { ok: false, error: "duplicate" };
  const rec = { id: "MQ-" + sub.id.slice(-5) + "-" + p.id.replace("PL-", "") + "-" + (p.quotes.length + 1), reference: String(q.reference).trim(), via: q.via, premium: Number(q.premium), feesTaxes: Number(q.feesTaxes) || 0, currency: q.currency || "USD", validUntil: q.validUntil, summary: String(q.summary || "").trim(), status: "received", receivedAt: nowStamp(), recordedBy: ucActor() };
  p.quotes.push(rec); p.status = "quoted";
  plLog(sub, "placement_quote_recorded", p.id + ": " + p.marketName + " quoted " + rec.premium + " " + rec.currency + " (ref " + rec.reference + ", valid until " + rec.validUntil + ").");
  return { ok: true, quote: rec };
}
function plDecline(sub, id, reasonCode, text) {
  if (!plEdit()) return { ok: false, error: "permission" };
  const p = plFind(sub, id);
  if (!p || ["sent", "quoted"].indexOf(p.status) < 0) return { ok: false, error: "state" };
  if (!plReasons().some(r => r.code === reasonCode)) return { ok: false, error: "reason_code" };
  if (String(text || "").trim().length < 10) return { ok: false, error: "reason" };
  p.status = "declined"; p.declinedReasonCode = reasonCode; p.declinedText = String(text).trim(); p.declinedAt = nowStamp();
  plLog(sub, "placement_declined", p.id + ": " + p.marketName + " declined (" + reasonCode + "). " + p.declinedText);
  return { ok: true, placement: p };
}
function plMarkNoResponse(sub, id) {
  if (!plEdit()) return { ok: false, error: "permission" };
  const p = plFind(sub, id);
  if (!p || p.status !== "sent") return { ok: false, error: "state" };
  if (!plOverdue(p)) return { ok: false, error: "not_overdue" };
  p.status = "no_response"; plLog(sub, "placement_no_response", p.id + ": " + p.marketName + " did not respond by " + p.responseDueAt + ".");
  return { ok: true };
}
function plOverdue(p, day) { return p.status === "sent" && !!p.responseDueAt && p.responseDueAt < (day || todayIso()); }
/** Marks a quote presented to the insured, declined by the insured, or expired. */
function plSetQuote(sub, id, quoteId, state) {
  if (!plEdit()) return { ok: false, error: "permission" };
  const p = plFind(sub, id), q = p && p.quotes.find(x => x.id === quoteId);
  if (!q || ["presented", "declined", "expired"].indexOf(state) < 0 || q.status === "accepted") return { ok: false, error: "state" };
  q.status = state; plLog(sub, "placement_quote_" + state, p.id + " quote " + q.reference + " " + state + ".");
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}
/** Accepting a market's quote withdraws the other open placements. Only one quote is accepted on a submission. */
function plAccept(sub, id, quoteId, day) {
  if (!plEdit()) return { ok: false, error: "permission" };
  const p = plFind(sub, id), q = p && p.quotes.find(x => x.id === quoteId);
  if (!q || p.status !== "quoted") return { ok: false, error: "state" };
  if (plList(sub).some(x => x.status === "accepted")) return { ok: false, error: "already" };
  if (q.validUntil < (day || todayIso())) return { ok: false, error: "expired" };
  q.status = "accepted"; p.status = "accepted"; p.acceptedAt = nowStamp(); p.acceptedBy = ucActor();
  plList(sub).filter(x => x.id !== p.id && ["draft", "sent", "quoted"].indexOf(x.status) > -1).forEach(x => { x.status = "withdrawn"; x.withdrawnReason = "Another market's quote was accepted (" + p.id + ")."; x.withdrawnAt = nowStamp(); });
  plLog(sub, "placement_accepted", p.id + ": " + p.marketName + "'s quote " + q.reference + " accepted. Other open placements withdrawn.");
  return { ok: true, placement: p, quote: q };
}
/** The live quotes side by side, lowest total first. */
function plCompare(sub, day) {
  const d = day || todayIso(), rows = [];
  plList(sub).forEach(p => p.quotes.forEach(q => { if (q.status !== "declined") rows.push({ placement: p.id, market: p.marketName, reference: q.reference, premium: q.premium, feesTaxes: q.feesTaxes, total: q.premium + q.feesTaxes, currency: q.currency, validUntil: q.validUntil, expired: q.validUntil < d || q.status === "expired", status: q.status, quoteId: q.id }); }));
  return rows.sort((a, b) => (a.expired - b.expired) || (a.total - b.total));
}

// ----------------------------------------------------------------------------
// SCREEN
// ----------------------------------------------------------------------------
function plCaseHtml(sub) {
  const edit = hasPermission("submissionData", "edit") && !policyIsBound(sub), list = plList(sub), cmp = plCompare(sub);
  const money = (n, c) => escHtml(Number(n).toLocaleString("en-US")) + " " + escHtml(c);
  const rows = list.map(p => `<tr><td>${escHtml(p.id)}</td><td>${escHtml(p.marketName)}<div class="p1-note">${escHtml(PL_KINDS[p.marketKind])}${p.programRef ? " · " + escHtml(p.programRef) : ""}</div></td><td><span class="badge ${p.status === "accepted" ? "badge-success" : p.status === "declined" || p.status === "no_response" ? "badge-danger" : plOverdue(p) ? "badge-danger" : "badge-light"}">${escHtml(PL_STATUSES[p.status])}${plOverdue(p) ? " · overdue" : ""}</span>${p.declinedReasonCode ? `<div class="p1-note">${escHtml(p.declinedReasonCode)}: ${escHtml(p.declinedText)}</div>` : ""}${p.withdrawnReason ? `<div class="p1-note">${escHtml(p.withdrawnReason)}</div>` : ""}</td>
    <td>${p.sentAt ? "sent " + escHtml(p.sentAt) + "<div class=\"p1-note\">response due " + escHtml(p.responseDueAt) + "</div>" : "—"}</td><td>${p.quotes.map(q => `<div class="p1-note">${escHtml(q.reference)}: ${money(q.premium, q.currency)} (${escHtml(PL_VIA[q.via])}, ${escHtml(PL_QUOTE_STATES[q.status])})${edit && ["received", "presented"].indexOf(q.status) > -1 ? ` <button class="btn btn-xs btn-outline" onclick="plQuoteStateUi('${p.id}','${q.id}','${q.status === "received" ? "presented" : "expired"}')">${q.status === "received" ? "Presented" : "Expired"}</button>` : ""}</div>`).join("") || "—"}</td>
    <td>${!edit ? "" : [p.status === "draft" ? `<button class="btn btn-xs btn-outline" onclick="plSendUi('${p.id}')">Mark sent</button>` : "", ["sent", "quoted"].indexOf(p.status) > -1 ? `<button class="btn btn-xs btn-outline" onclick="plQuoteUi('${p.id}')">Record quote</button> <button class="btn btn-xs btn-outline" onclick="plDeclineUi('${p.id}')">Market declined</button>` : "", plOverdue(p) ? `<button class="btn btn-xs btn-outline" onclick="plNoResponseUi('${p.id}')">No response</button>` : ""].join(" ")}</td></tr>`).join("");
  const cmpHtml = cmp.length ? `<div class="p1-note" style="margin-top:8px;">Quotes side by side (lowest total first)</div><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Market</th><th>Reference</th><th>Premium</th><th>Fees and taxes</th><th>Total</th><th>Valid until</th><th></th></tr></thead><tbody>${cmp.map(r => `<tr><td>${escHtml(r.market)}</td><td>${escHtml(r.reference)}</td><td>${money(r.premium, r.currency)}</td><td>${money(r.feesTaxes, r.currency)}</td><td><strong>${money(r.total, r.currency)}</strong></td><td>${escHtml(r.validUntil)}${r.expired ? " · expired" : ""}</td><td>${edit && r.status !== "accepted" && !r.expired && !list.some(x => x.status === "accepted") ? `<button class="btn btn-xs btn-primary" onclick="plAcceptUi('${r.placement}','${r.quoteId}')">Accept</button>` : escHtml(PL_QUOTE_STATES[r.status])}</td></tr>`).join("")}</tbody></table></div>` : "";
  const form = edit ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="pl_name">Market</label><input class="form-control" id="pl_name"></div><div class="form-group"><label for="pl_kind">Kind</label><select class="form-control" id="pl_kind">${Object.keys(PL_KINDS).map(k => `<option value="${k}">${PL_KINDS[k]}</option>`).join("")}</select></div><div class="form-group"><label for="pl_prog">Program (optional)</label><input class="form-control" id="pl_prog"></div></div><button class="btn btn-xs btn-outline" onclick="plAddUi()">Add a market</button>` : "";
  return (rows ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Placement</th><th>Market</th><th>Status</th><th>Sent</th><th>Quotes</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="mw-empty">This submission has not been placed with any market.</div>') + cmpHtml + form;
}
function plSubUi() { return typeof cfSub === "function" ? cfSub() : null; }
function plToast(r, ok) { showToast(r.ok ? "✅ " + ok : "⛔ " + (r.errors ? r.errors.join("; ") : ({ due: "Enter a response date that is not before the day it was sent.", reason: "Say what the market said (at least 10 characters).", reason_code: "Choose a reason.", already: "A quote has already been accepted.", expired: "That quote has expired.", duplicate: "That quote reference is already recorded.", not_overdue: "It is not overdue yet.", bound: "The policy is bound.", state: "That cannot be done in its present state." }[r.error] || r.error)), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function plAddUi() { const s = plSubUi(); if (s) plToast(plAdd(s, { marketName: ucV("pl_name"), marketKind: ucV("pl_kind"), programRef: ucV("pl_prog") }), "Market added."); }
function plSendUi(id) { const s = plSubUi(); if (!s) return; const d = window.prompt("The date a response is due (YYYY-MM-DD)", ""); if (d === null) return; plToast(plSend(s, id, d), "Marked sent."); }
function plQuoteUi(id) {
  const s = plSubUi(); if (!s) return;
  const ref = window.prompt("The market's quote reference", ""); if (ref === null) return;
  const prem = window.prompt("Premium", ""); if (prem === null) return;
  const until = window.prompt("Valid until (YYYY-MM-DD)", ""); if (until === null) return;
  plToast(plRecordQuote(s, id, { reference: ref, via: "email", premium: prem, feesTaxes: 0, currency: "USD", validUntil: until, summary: "" }), "Quote recorded.");
}
function plDeclineUi(id) { const s = plSubUi(); if (!s) return; const why = window.prompt("What did the market say? (at least 10 characters)", ""); if (why === null) return; plToast(plDecline(s, id, "CAPACITY", why), "Recorded."); }
function plNoResponseUi(id) { const s = plSubUi(); if (s) plToast(plMarkNoResponse(s, id), "Marked."); }
function plQuoteStateUi(id, qid, state) { const s = plSubUi(); if (s) plToast(plSetQuote(s, id, qid, state), "Updated."); }
function plAcceptUi(id, qid) { const s = plSubUi(); if (s) plToast(plAccept(s, id, qid), "Accepted; the other open placements were withdrawn."); }
(function plInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    ["placement_added:Placement Added", "placement_sent:Placement Sent to a Market", "placement_quote_recorded:Market Quote Recorded", "placement_declined:Market Declined", "placement_no_response:Market Did Not Respond", "placement_accepted:Market Quote Accepted", "placement_quote_presented:Quote Presented", "placement_quote_declined:Quote Declined by the Insured", "placement_quote_expired:Market Quote Expired"].forEach(x => { const [k, l] = x.split(":"); AUDIT_ACTION_META[k] = m(l, "ph-buildings", "badge-info", "outcome-comm"); });
  }
})();
if (typeof urRegisterSection === "function") urRegisterSection("placements", "Market placements", plCaseHtml);
