/**
 * ============================================================================
 * TEAM TOOLS: MAILMAN, PRINT QUEUE, TICKETS, NOTICE BOARD, CHAT, AUDIT AND LOSS CONTROL, CALCULATOR, PROFILE AND PASSWORD
 * ----------------------------------------------------------------------------
 * Extra tabs on My Work (Mailman, Print queue, Tickets, Notice board, Chat) and on the Case File (Print, Discussion, Audit & loss
 * control), a Calculator in the header and a Profile with change password.
 *
 *   MAILMAN      incoming emails (pasted in) with a kind guessed from the words (binder request, endorsement, renewal), the cases they
 *                probably belong to (found from a policy number, case id, FEIN or the insured's name), and three actions: link to a case
 *                (it goes into that case's email history), make a task, or mark done.
 *   PRINT QUEUE  two queues: Policy documents (quote, binder, certificate, endorsement, reinstatement) and E&O (notices that must be kept
 *                for errors-and-omissions defence: declination and adverse-action notices, non-renewal and conditional-renewal notices,
 *                cancellation notices; this grouping is an assumption to confirm). Documents are added from the case's own record,
 *                printed together, and kept as Printed with who and when.
 *   TICKETS      a small issue tracker for the team: category, priority, assignee, comments, status (Open, In progress, Resolved, Closed).
 *   NOTICE BOARD announcements posted by the Head of Underwriting with a date range, pinned or not, each person confirms they read it.
 *   CHAT         a team channel and a discussion thread on each case; @name or @role mentions notify the person.
 *   AUDIT & LOSS CONTROL (on a bound policy) premium audits and loss-control surveys: scheduled with an assignee and date (which makes a
 *                task), completed with the result. An audit records audited against estimated units and the adjustment the auditor typed;
 *                a survey records findings and recommendations, each recommendation a dated task. No audit rate is built in.
 *   CALCULATOR   pro-rata and short-rate return premium, commission and net, instalments, and premium from a rate and an exposure. Every
 *                figure is typed in; none is built in.
 *   PROFILE      phone and email, and a password. A user with no password set signs in as before; once one is set, sign-in needs it,
 *                five wrong tries lock that user for a minute. THIS IS NOT SECURITY: the password is kept (salted, hashed) in this browser
 *                only, because the prototype has no server; real sign-in needs one.
 *
 * Everything here is kept in this browser (localStorage) or on the case; nothing is sent anywhere.
 * ============================================================================
 */

const TW_KEYS = { mail: "FUT_MAILMAN_V1", print: "FUT_PRINTQ_V1", tickets: "FUT_TICKETS_V1", board: "FUT_BOARD_V1", chat: "FUT_CHAT_V1", profile: "FUT_PROFILE_V1" };
const TW_MAIL_STATUS = ["New", "Linked", "Task created", "Done"];
const TW_TICKET_CATS = ["Bug", "Request", "Question", "Access"], TW_TICKET_STATES = ["Open", "In progress", "Resolved", "Closed"];
const TW_TICKET_NEXT = { Open: ["In progress", "Resolved", "Closed"], "In progress": ["Resolved", "Open"], Resolved: ["Closed", "Open"], Closed: [] };
var TW = { mail: [], print: [], tickets: [], board: [], chat: [], profile: {}, printQueue: "Policy", printView: "Queued", mailFilter: "open", ticketFilter: "open" };
Object.keys(TW_KEYS).forEach(k => { try { const r = JSON.parse(localStorage.getItem(TW_KEYS[k])); if (r && (k === "profile" ? typeof r === "object" && !Array.isArray(r) : Array.isArray(r))) TW[k] = r; } catch (e) { /* none yet */ } });

function twSave(k) { try { localStorage.setItem(TW_KEYS[k], JSON.stringify(TW[k])); } catch (e) { /* keep for this session */ } }
function twAddDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function twName(role) { const r = typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[role]; return r ? r.name : String(role || "—"); }
function twActor() { return twName(currentUserRole); }
function twRead(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function twSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function twVisible(s) { return canSeeAllSubmissions() || isMyCase(s); }
function twRender() { if (currentPage === "my-work" && typeof mwRender === "function") mwRender(); }
function twLog(sub, decision, notes) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 1, decision, by: twActor(), at: nowStamp(), notes }); if (typeof persistAppState === "function") persistAppState(); }
function twNotifyAll(n) { if (typeof notify !== "function") return; Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name && k !== currentUserRole).forEach(k => notify(k, Object.assign({}, n, { key: (n.key || "tw") + "-" + k }))); }

if (typeof AUDIT_ACTION_META !== "undefined") {
  const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
  AUDIT_ACTION_META.audit_scheduled = m("Audit or Survey Scheduled", "ph-clipboard-text", "badge-info", "outcome-comm");
  AUDIT_ACTION_META.audit_completed = m("Audit or Survey Completed", "ph-clipboard-text", "badge-success", "outcome-approve");
  AUDIT_ACTION_META.case_printed = m("Document Printed", "ph-printer", "badge-light", "outcome-comm");
}

// ----------------------------------------------------------------------------
// 1. MAILMAN
// ----------------------------------------------------------------------------
/** What an email is about, from its words. */
function twMailKind(text) {
  const t = String(text || "");
  if (/\bbind(er|ing)?\b/i.test(t)) return "Binder request";
  if (/endorse|add (a |the )?(vehicle|driver|truck|unit)|remove (a |the )?(vehicle|driver|truck|unit)|change of address/i.test(t)) return "Endorsement";
  if (/renew/i.test(t)) return "Renewal";
  return "Other";
}
function twMailAdd(f) {
  const from = String(f.from || "").trim(), subject = String(f.subject || "").trim();
  if (from.length < 2) return { ok: false, message: "Enter who it is from." };
  if (subject.length < 3) return { ok: false, message: "Enter the subject." };
  const m = { id: "MAIL-" + (TW.mail.length + 1), from, subject, body: String(f.body || "").trim(), receivedAt: f.receivedAt || nowStamp(), kind: twMailKind(subject + " " + (f.body || "")), status: "New", caseId: null, taskId: null, by: twActor() };
  TW.mail.push(m); twSave("mail");
  return { ok: true, mail: m };
}
/** The cases an email probably belongs to, with why. Policy number, case id, FEIN and the insured's name are tried. */
function twMailMatches(m) {
  const text = m.subject + "\n" + m.body, out = [], seen = {};
  const add = (s, why) => { if (s && twVisible(s) && !seen[s.id]) { seen[s.id] = 1; out.push({ sub: s, why }); } };
  (text.match(/\bPOL-[A-Z0-9-]+/gi) || []).forEach(p => SUBMISSIONS_DATASET.forEach(s => { if (s.pasSync && String(s.pasSync.policyNumber).toLowerCase() === p.toLowerCase()) add(s, "policy number " + p); }));
  (text.match(/\bSUB-[A-Z0-9-]+/gi) || []).forEach(id => add(SUBMISSIONS_DATASET.find(s => s.id.toLowerCase() === id.toLowerCase()), "case id " + id));
  (text.match(/\b\d{2}-?\d{7}\b/g) || []).forEach(f => SUBMISSIONS_DATASET.forEach(s => { if (String(s.fein || "").replace(/\D/g, "") === f.replace(/\D/g, "")) add(s, "FEIN " + f); }));
  const norm = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  SUBMISSIONS_DATASET.forEach(s => { const n = String(s.insured || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (n.length > 4 && norm.indexOf(n) > -1) add(s, "insured name"); });
  return out;
}
function twMailLink(m, subId) {
  const sub = twSub(subId);
  if (!sub) return { ok: false, message: "That case was not found." };
  if (typeof cfLogEmail !== "function") return { ok: false, message: "Email history is not available." };
  const r = cfLogEmail(sub, { direction: "in", party: m.from, subject: m.subject, body: m.body, at: m.receivedAt });
  if (!r.ok) return r;
  m.caseId = subId; if (m.status === "New") m.status = "Linked"; twSave("mail");
  return { ok: true };
}
function twMailTask(m, subId) {
  const sub = subId ? twSub(subId) : (m.caseId ? twSub(m.caseId) : null);
  if (sub && m.caseId !== sub.id) { const l = twMailLink(m, sub.id); if (!l.ok) return l; }
  const type = m.kind === "Binder request" ? "New Business" : m.kind === "Endorsement" ? "Referral" : m.kind === "Renewal" ? "Renewal" : "Follow-up";
  const r = mwAddTask({ title: m.kind + ": " + m.subject.slice(0, 80), type, priority: m.kind === "Binder request" ? "High" : "Medium", due: twAddDays(todayIso(), m.kind === "Binder request" ? 0 : 1), assignee: (sub && sub.assignedTo) || currentUserRole, subId: sub ? sub.id : null, notes: "From " + m.from + " (" + m.id + ")", source: "mailman" });
  if (!r.ok) return r;
  m.taskId = r.task.id; m.status = "Task created"; twSave("mail");
  return { ok: true, task: r.task };
}
function twMailDone(m) { m.status = "Done"; twSave("mail"); return true; }
function twMailHtml() {
  const list = TW.mail.filter(m => TW.mailFilter === "all" || (TW.mailFilter === "open" ? m.status !== "Done" : m.status === TW.mailFilter)).slice().reverse();
  const form = `<details class="card"${TW.mail.length ? "" : " open"}><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-envelope-simple"></i> Add an incoming email</summary><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="tw_mfrom">From</label><input class="form-control" id="tw_mfrom"></div><div class="form-group mw-wide"><label for="tw_msubj">Subject</label><input class="form-control" id="tw_msubj"></div>
    <div class="form-group mw-wide"><label for="tw_mbody">Message</label><textarea class="form-control" id="tw_mbody" rows="4"></textarea></div></div><div class="p1-note">The prototype does not read a mailbox: paste the email here. The kind and the likely case are worked out from its words.</div><div class="p1-actions"><button class="btn btn-primary" onclick="twMailAddUi()">Add</button></div></div></details>`;
  const bar = `<div class="mw-dates" style="margin-bottom:10px;"><label>Show <select class="form-control" onchange="twMailFilter(this.value)"><option value="open"${TW.mailFilter === "open" ? " selected" : ""}>Not done</option><option value="all"${TW.mailFilter === "all" ? " selected" : ""}>All</option>${TW_MAIL_STATUS.map(s => `<option${TW.mailFilter === s ? " selected" : ""}>${s}</option>`).join("")}</select></label></div>`;
  const rows = list.map(m => { const matches = twMailMatches(m), badge = { "Binder request": "badge-danger", Endorsement: "badge-info", Renewal: "badge-warning", Other: "badge-light" }[m.kind];
    return `<div class="cf-note"><div class="cf-note-h"><span class="badge ${badge}">${m.kind}</span> <strong>${escHtml(m.subject)}</strong><span class="badge badge-light" style="margin-left:auto;">${m.status}</span></div><div class="p1-note" style="margin:0 0 4px;">From ${escHtml(m.from)} · ${escHtml(m.receivedAt)}${m.caseId ? " · case " + escHtml(m.caseId) : ""}${m.taskId ? " · task " + escHtml(m.taskId) : ""}</div>
      ${m.body ? `<details><summary class="text-xs" style="cursor:pointer;">Show message</summary><pre class="cf-pre">${escHtml(m.body)}</pre></details>` : ""}
      <div class="mw-dates" style="margin-top:6px;">${m.caseId ? "" : matches.length ? matches.slice(0, 3).map(x => `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="twMailLinkUi('${m.id}','${escHtml(x.sub.id)}')">Link to ${escHtml(x.sub.insured)} <span class="text-muted">(${escHtml(x.why)})</span></button>`).join("") : `<span class="p1-note">No case matched.</span>`}
      ${m.status !== "Done" && !m.taskId ? `<button class="btn btn-xs btn-primary" style="width:auto;" onclick="twMailTaskUi('${m.id}')"><i class="ph ph-list-plus"></i> Make a task</button>` : ""}${m.status !== "Done" ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="twMailDoneUi('${m.id}')">Done</button>` : ""}</div></div>`; }).join("");
  return form + bar + (list.length ? rows : `<div class="mw-empty">No emails ${TW.mailFilter === "open" ? "waiting" : "match"}.</div>`);
}
function twMailFilter(v) { TW.mailFilter = v; twRender(); }
function twMailAddUi() { const r = twMailAdd({ from: twRead("tw_mfrom"), subject: twRead("tw_msubj"), body: twRead("tw_mbody") }); showToast(r.ok ? "✅ Email added (" + r.mail.kind + ")." : "⛔ " + r.message, r.ok ? "success" : "danger"); twRender(); }
function twMailLinkUi(id, subId) { const m = TW.mail.find(x => x.id === id); if (!m) return; const sub = twSub(subId); if (sub && typeof cfCanEdit === "function" && !cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = twMailLink(m, subId); showToast(r.ok ? "✅ Added to the case's email history." : "⛔ " + r.message, r.ok ? "success" : "danger"); twRender(); }
function twMailTaskUi(id) { const m = TW.mail.find(x => x.id === id); if (!m) return; const r = twMailTask(m, null); showToast(r.ok ? "✅ Task " + r.task.id + " added." : "⛔ " + r.message, r.ok ? "success" : "danger"); twRender(); }
function twMailDoneUi(id) { const m = TW.mail.find(x => x.id === id); if (m) twMailDone(m); twRender(); }

// ----------------------------------------------------------------------------
// 2. PRINT QUEUE
// ----------------------------------------------------------------------------
/** The documents a case can print, from its own record. eo marks the ones kept for errors-and-omissions defence. */
function twDocs(sub) {
  const out = [], add = (kind, id, title, html, eo) => { if (html) out.push({ kind, id, title, html, eo: !!eo, key: sub.id + "|" + id }); };
  if (sub.issuedQuoteEmail) add("Quote", "QUOTE", "Quotation " + (sub.quoteNo || sub.id), sub.issuedQuoteEmail.html, false);
  (sub.binders || []).forEach(b => add("Binder", b.id, "Binder " + b.id, b.html, false));
  (sub.certificates || []).forEach(c => add("Certificate", c.id, "Certificate " + c.id + (c.holderName ? " (" + c.holderName + ")" : ""), c.html, false));
  (sub.policyChanges || []).forEach(e => add(e.type === "cancellation" ? "Cancellation notice" : e.type === "reinstatement" ? "Reinstatement" : "Endorsement", e.id, (e.type === "cancellation" ? "Cancellation " : e.type === "reinstatement" ? "Reinstatement " : "Endorsement ") + e.id, e.html, e.type === "cancellation"));
  if (sub.renewal && sub.renewal.notice && sub.renewal.notice.html) add(sub.renewal.notice.kind === "non_renewal" ? "Non-renewal notice" : "Conditional renewal notice", "RENEWAL-NOTICE", (sub.renewal.notice.kind === "non_renewal" ? "Non-renewal notice " : "Conditional renewal notice ") + sub.id, sub.renewal.notice.html, true);
  (sub.notices || []).filter(n => n.text).forEach(n => add("Declination / adverse-action notice", n.id, "Notice " + n.id, "<pre style=\"white-space:pre-wrap;font-family:inherit;\">" + escHtml(n.text) + "</pre>", true));
  return out;
}
function twPrintAdd(sub, docId) {
  const d = twDocs(sub).find(x => x.id === docId);
  if (!d) return { ok: false, message: "That document does not exist on the case." };
  const queue = d.eo ? "E&O" : "Policy";
  if (TW.print.some(p => p.key === d.key && p.status === "Queued")) return { ok: false, message: d.title + " is already in the " + queue + " queue." };
  const it = { id: "PRT-" + (TW.print.length + 1), key: d.key, queue, subId: sub.id, docId: d.id, kind: d.kind, title: d.title, insured: sub.insured, addedBy: twActor(), addedAt: nowStamp(), status: "Queued", printedAt: null, printedBy: null };
  TW.print.push(it); twSave("print");
  return { ok: true, item: it };
}
function twPrintAddAll(sub) { const r = { added: 0, skipped: [] }; twDocs(sub).forEach(d => { const x = twPrintAdd(sub, d.id); if (x.ok) r.added++; else r.skipped.push(x.message); }); return r; }
/** One printable document for the chosen items. Marks them Printed. */
function twPrintItems(ids) {
  const items = TW.print.filter(p => ids.indexOf(p.id) > -1);
  if (!items.length) return { ok: false, message: "Select at least one document." };
  const parts = [];
  items.forEach((p, i) => { const sub = twSub(p.subId), d = sub ? twDocs(sub).find(x => x.id === p.docId) : null; if (d) parts.push(`<div style="${i ? "page-break-before:always;" : ""}">${d.html}</div>`); });
  if (!parts.length) return { ok: false, message: "The documents are no longer on their cases." };
  items.forEach(p => { p.status = "Printed"; p.printedAt = nowStamp(); p.printedBy = twActor(); const sub = twSub(p.subId); if (sub) twLog(sub, "case_printed", p.title + " printed from the " + p.queue + " print queue."); });
  twSave("print");
  return { ok: true, count: parts.length, html: `<!doctype html><html><head><meta charset="utf-8"><title>Print queue</title></head><body style="font-family:Calibri,Arial,sans-serif;max-width:760px;margin:30px auto;font-size:14px;color:#111;">${parts.join("")}</body></html>` };
}
var TW_PRINT_SEL = {};
function twPrintHtml() {
  const list = TW.print.filter(p => p.queue === TW.printQueue && p.status === TW.printView).slice().reverse();
  const count = q => TW.print.filter(p => p.queue === q && p.status === "Queued").length;
  const tabs = `<div class="mw-bar">${["Policy", "E&O"].map(q => `<button class="tab-btn${TW.printQueue === q ? " active" : ""}" onclick="twPrintQueue('${q}')">${q === "Policy" ? "Policy documents" : "E&O"} <span class="badge badge-light">${count(q)}</span></button>`).join("")}<label class="mw-check"><select class="form-control" onchange="twPrintView(this.value)"><option${TW.printView === "Queued" ? " selected" : ""}>Queued</option><option${TW.printView === "Printed" ? " selected" : ""}>Printed</option></select></label></div>`;
  const sel = list.filter(p => TW_PRINT_SEL[p.id]).length;
  const rows = list.map(p => `<tr><td><input type="checkbox" aria-label="Select ${escHtml(p.id)}" ${TW_PRINT_SEL[p.id] ? "checked" : ""} onchange="twPrintToggle('${p.id}', this.checked)"></td><td><strong>${escHtml(p.title)}</strong><div class="p1-note">${escHtml(p.kind)}</div></td><td>${escHtml(p.insured)}<div class="p1-note">${escHtml(p.subId)}</div></td><td>${escHtml(p.addedBy)}<div class="p1-note">${escHtml(p.addedAt)}</div></td><td>${p.status === "Printed" ? escHtml(p.printedBy) + "<div class=\"p1-note\">" + escHtml(p.printedAt) + "</div>" : "—"}</td></tr>`).join("");
  return tabs + (list.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th></th><th>Document</th><th>Case</th><th>Added</th><th>Printed</th></tr></thead><tbody>${rows}</tbody></table></div><div class="p1-actions"><button class="btn btn-primary" onclick="twPrintGo()"${sel ? "" : " disabled"}><i class="ph ph-printer"></i> ${TW.printView === "Printed" ? "Print again" : "Print"} selected (${sel})</button></div>` : `<div class="mw-empty">Nothing ${TW.printView === "Queued" ? "is waiting to be printed" : "has been printed"} in this queue. Add documents from a case's Print tab.</div>`) + `<div class="p1-note">E&amp;O holds notices kept for errors-and-omissions defence: declination, adverse-action, non-renewal, conditional-renewal and cancellation notices. That grouping is an assumption to confirm.</div>`;
}
function twPrintQueue(q) { TW.printQueue = q; TW_PRINT_SEL = {}; twRender(); }
function twPrintView(v) { TW.printView = v; TW_PRINT_SEL = {}; twRender(); }
function twPrintToggle(id, on) { TW_PRINT_SEL[id] = !!on; twRender(); }
function twPrintGo() {
  const r = twPrintItems(Object.keys(TW_PRINT_SEL).filter(k => TW_PRINT_SEL[k]));
  if (!r.ok) { showToast("⛔ " + r.message, "danger"); return; }
  const w = window.open(URL.createObjectURL(new Blob([r.html], { type: "text/html" })), "_blank");
  if (w) setTimeout(() => { try { w.print(); } catch (e) { /* the person prints from the new tab */ } }, 500); else showToast("The browser blocked the new tab; allow pop-ups to print.", "warning");
  TW_PRINT_SEL = {}; twRender();
}
function twPrintTabHtml(sub) {
  const docs = twDocs(sub), queued = TW.print.filter(p => p.subId === sub.id && p.status === "Queued");
  if (!docs.length) return `<div class="mw-empty">This case has no document to print yet. Quotations, binders, certificates, endorsements and notices appear here once they exist.</div>`;
  return `<div class="p1-actions" style="margin:0 0 8px;"><button class="btn btn-primary" onclick="twPrintAddAllUi()"><i class="ph ph-printer"></i> Add all to the print queues</button></div><div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Document</th><th>Queue</th><th></th></tr></thead><tbody>${docs.map(d => `<tr><td><strong>${escHtml(d.title)}</strong><div class="p1-note">${escHtml(d.kind)}</div></td><td>${d.eo ? "E&amp;O" : "Policy documents"}</td><td>${queued.some(p => p.key === d.key) ? '<span class="badge badge-light">Queued</span>' : `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="twPrintAddUi('${escHtml(d.id)}')">Add to queue</button>`}</td></tr>`).join("")}</tbody></table></div>`;
}
function twPrintAddUi(docId) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = twPrintAdd(sub, docId); showToast(r.ok ? "✅ Added to the " + r.item.queue + " queue." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }
function twPrintAddAllUi() { const sub = cfSub(); if (!sub) return; const r = twPrintAddAll(sub); showToast(r.added ? `✅ ${r.added} document(s) added.` : "Nothing new to add.", r.added ? "success" : "info"); cfRender(); }

// ----------------------------------------------------------------------------
// 3. TICKETS
// ----------------------------------------------------------------------------
function twTicketAdd(f) {
  if (String(f.title || "").trim().length < 4) return { ok: false, message: "Give the ticket a title (at least 4 characters)." };
  if (TW_TICKET_CATS.indexOf(f.category) < 0) return { ok: false, message: "Choose a category." };
  if (["High", "Medium", "Low"].indexOf(f.priority) < 0) return { ok: false, message: "Choose a priority." };
  if (String(f.description || "").trim().length < 10) return { ok: false, message: "Describe it (at least 10 characters)." };
  const t = { id: "TKT-" + (TW.tickets.length + 1), title: String(f.title).trim(), description: String(f.description).trim(), category: f.category, priority: f.priority, status: "Open", assignee: null, createdBy: currentUserRole, createdAt: nowStamp(), comments: [], history: [{ status: "Open", by: twActor(), at: nowStamp() }] };
  TW.tickets.push(t); twSave("tickets");
  return { ok: true, ticket: t };
}
function twTicketCanEdit(t) { return !!t && (canManageAssignments() || t.assignee === currentUserRole || t.createdBy === currentUserRole); }
function twTicketAssign(id, role) {
  const t = TW.tickets.find(x => x.id === id);
  if (!t || !canManageAssignments()) return { ok: false, message: "Only the Head of Underwriting assigns tickets." };
  if (!USER_ROLES_CONFIG[role]) return { ok: false, message: "Choose who it is for." };
  t.assignee = role; twSave("tickets");
  if (typeof notify === "function" && role !== currentUserRole) notify(role, { kind: "assignment", title: "Ticket for you: " + t.title, text: t.id + ", " + t.priority + " priority.", key: "tkt-" + t.id + "-" + role });
  return { ok: true };
}
function twTicketMove(id, status, note) {
  const t = TW.tickets.find(x => x.id === id);
  if (!t) return { ok: false, message: "Ticket not found." };
  if (!twTicketCanEdit(t)) return { ok: false, message: "Only the creator, the assignee or the Head of Underwriting can change this ticket." };
  if (TW_TICKET_NEXT[t.status].indexOf(status) < 0) return { ok: false, message: "A ticket that is " + t.status.toLowerCase() + " cannot become " + status.toLowerCase() + "." };
  if (status === "Resolved" && String(note || "").trim().length < 5) return { ok: false, message: "Say how it was resolved (at least 5 characters)." };
  t.status = status; t.history.push({ status, by: twActor(), at: nowStamp(), note: String(note || "").trim() }); twSave("tickets");
  return { ok: true };
}
function twTicketComment(id, text) {
  const t = TW.tickets.find(x => x.id === id);
  if (!t) return { ok: false, message: "Ticket not found." };
  if (String(text || "").trim().length < 2) return { ok: false, message: "Write the comment." };
  t.comments.push({ by: twActor(), at: nowStamp(), text: String(text).trim() }); twSave("tickets");
  return { ok: true };
}
function twTicketsHtml() {
  const roles = Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name);
  const list = TW.tickets.filter(t => TW.ticketFilter === "all" || (TW.ticketFilter === "open" ? t.status !== "Closed" : t.status === TW.ticketFilter)).slice().reverse();
  const form = `<details class="card"${TW.tickets.length ? "" : " open"}><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> Raise a ticket</summary><div class="card-body"><div class="mw-grid"><div class="form-group mw-wide"><label for="tw_ttitle">Title</label><input class="form-control" id="tw_ttitle"></div><div class="form-group"><label for="tw_tcat">Category</label><select class="form-control" id="tw_tcat">${TW_TICKET_CATS.map(c => `<option>${c}</option>`).join("")}</select></div><div class="form-group"><label for="tw_tpri">Priority</label><select class="form-control" id="tw_tpri"><option>High</option><option selected>Medium</option><option>Low</option></select></div>
    <div class="form-group mw-wide"><label for="tw_tdesc">What is wrong or needed</label><textarea class="form-control" id="tw_tdesc" rows="3"></textarea></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="twTicketAddUi()">Raise ticket</button></div></div></details>`;
  const bar = `<div class="mw-dates" style="margin-bottom:10px;"><label>Show <select class="form-control" onchange="twTicketFilter(this.value)"><option value="open"${TW.ticketFilter === "open" ? " selected" : ""}>Not closed</option><option value="all"${TW.ticketFilter === "all" ? " selected" : ""}>All</option>${TW_TICKET_STATES.map(s => `<option${TW.ticketFilter === s ? " selected" : ""}>${s}</option>`).join("")}</select></label></div>`;
  const rows = list.map(t => { const next = TW_TICKET_NEXT[t.status], can = twTicketCanEdit(t);
    return `<div class="cf-note"><div class="cf-note-h"><span class="badge badge-light">${t.id}</span> <strong>${escHtml(t.title)}</strong> <span class="badge ${t.priority === "High" ? "badge-danger" : t.priority === "Medium" ? "badge-warning" : "badge-light"}">${t.priority}</span> <span class="badge badge-info">${t.category}</span><span class="badge badge-light" style="margin-left:auto;">${t.status}</span></div>
      <div class="cf-note-t">${escHtml(t.description)}</div><div class="p1-note">Raised by ${escHtml(twName(t.createdBy))} · ${escHtml(t.createdAt)} · for ${t.assignee ? escHtml(twName(t.assignee)) : "nobody yet"}</div>
      ${t.comments.map(c => `<div class="p1-note" style="border-left:2px solid var(--bg-subtle);padding-left:8px;margin:4px 0;"><strong>${escHtml(c.by)}</strong> ${escHtml(c.at)}: ${escHtml(c.text)}</div>`).join("")}
      <div class="mw-dates" style="margin-top:6px;"><input class="form-control" id="tw_tc_${t.id}" placeholder="Comment or resolution" style="min-width:220px;"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="twTicketCommentUi('${t.id}')">Comment</button>
      ${next.length && can ? `<select class="form-control" id="tw_tn_${t.id}" style="width:130px;">${next.map(s => `<option>${s}</option>`).join("")}</select><button class="btn btn-xs btn-primary" style="width:auto;" onclick="twTicketMoveUi('${t.id}')">Move</button>` : ""}
      ${canManageAssignments() && t.status !== "Closed" ? `<select class="form-control" style="width:160px;" onchange="twTicketAssignUi('${t.id}', this.value)" aria-label="Assign ${t.id}"><option value="">Assign to…</option>${roles.map(k => `<option value="${k}"${t.assignee === k ? " selected" : ""}>${escHtml(twName(k))}</option>`).join("")}</select>` : ""}</div></div>`; }).join("");
  return form + bar + (list.length ? rows : `<div class="mw-empty">No tickets.</div>`);
}
function twTicketFilter(v) { TW.ticketFilter = v; twRender(); }
function twTicketAddUi() { const r = twTicketAdd({ title: twRead("tw_ttitle"), category: twRead("tw_tcat"), priority: twRead("tw_tpri"), description: twRead("tw_tdesc") }); showToast(r.ok ? "✅ Ticket " + r.ticket.id + " raised." : "⛔ " + r.message, r.ok ? "success" : "danger"); twRender(); }
function twTicketCommentUi(id) { const r = twTicketComment(id, twRead("tw_tc_" + id)); if (!r.ok) showToast("⛔ " + r.message, "danger"); twRender(); }
function twTicketMoveUi(id) { const r = twTicketMove(id, twRead("tw_tn_" + id), twRead("tw_tc_" + id)); if (!r.ok) showToast("⛔ " + r.message, "danger"); twRender(); }
function twTicketAssignUi(id, role) { if (!role) return; const r = twTicketAssign(id, role); showToast(r.ok ? "Assigned." : "⛔ " + r.message, r.ok ? "info" : "danger"); twRender(); }

// ----------------------------------------------------------------------------
// 4. NOTICE BOARD
// ----------------------------------------------------------------------------
function twNoticePost(f) {
  if (!canManageAssignments()) return { ok: false, message: "Only the Head of Underwriting posts notices." };
  if (String(f.title || "").trim().length < 3) return { ok: false, message: "Give the notice a title." };
  if (String(f.text || "").trim().length < 5) return { ok: false, message: "Write the notice (at least 5 characters)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.from || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.to || ""))) return { ok: false, message: "Choose the dates it shows from and to." };
  if (f.to < f.from) return { ok: false, message: "The end date cannot be before the start date." };
  if (f.to < todayIso()) return { ok: false, message: "The notice would already be over." };
  const n = { id: "NTC-" + (TW.board.length + 1), title: String(f.title).trim(), text: String(f.text).trim(), from: f.from, to: f.to, pinned: !!f.pinned, by: twActor(), at: nowStamp(), ack: [] };
  TW.board.push(n); twSave("board");
  twNotifyAll({ kind: "info", title: "Notice: " + n.title, text: n.text.slice(0, 140), key: "ntc-" + n.id });
  return { ok: true, notice: n };
}
function twNoticesActive(on) { const d = on || todayIso(); return TW.board.filter(n => n.from <= d && n.to >= d).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at.localeCompare(a.at)); }
function twNoticeAck(id) { const n = TW.board.find(x => x.id === id); if (!n) return false; if (n.ack.indexOf(currentUserRole) < 0) { n.ack.push(currentUserRole); twSave("board"); } return true; }
function twNoticeUnread(role) { return twNoticesActive().filter(n => n.ack.indexOf(role || currentUserRole) < 0).length; }
function twBanner() {
  const un = twNoticesActive().filter(n => n.ack.indexOf(currentUserRole) < 0);
  return un.length ? `<div class="p1-banner warn"><i class="ph ph-megaphone"></i><div><strong>${un.length} notice${un.length === 1 ? "" : "s"} to read.</strong> ${escHtml(un[0].title)}${un.length > 1 ? " and " + (un.length - 1) + " more" : ""}. <a href="#" onclick="mwSwitchTab('board'); return false;">Open the notice board</a></div></div>` : "";
}
function twBoardHtml() {
  const mgr = canManageAssignments(), active = twNoticesActive(), past = TW.board.filter(n => active.indexOf(n) < 0).slice().reverse();
  const form = mgr ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-megaphone"></i> Post a notice</summary><div class="card-body"><div class="mw-grid"><div class="form-group mw-wide"><label for="tw_ntitle">Title</label><input class="form-control" id="tw_ntitle"></div><div class="form-group mw-wide"><label for="tw_ntext">Notice</label><textarea class="form-control" id="tw_ntext" rows="3"></textarea></div>
    <div class="form-group"><label for="tw_nfrom">Shows from</label><input type="date" class="form-control" id="tw_nfrom" value="${todayIso()}"></div><div class="form-group"><label for="tw_nto">Shows to</label><input type="date" class="form-control" id="tw_nto" value="${twAddDays(todayIso(), 14)}"></div><div class="form-group"><label><input type="checkbox" id="tw_npin"> Pin to the top</label></div></div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="twNoticePostUi()">Post notice</button></div></div></details>` : "";
  const card = n => `<div class="cf-note${n.pinned ? " pinned" : ""}"><div class="cf-note-h"><strong>${escHtml(n.title)}</strong>${n.pinned ? ' <i class="ph ph-push-pin"></i>' : ""}<span class="text-muted" style="margin-left:auto;">${escHtml(n.from)} to ${escHtml(n.to)}</span></div><div class="cf-note-t">${escHtml(n.text)}</div><div class="p1-note">Posted by ${escHtml(n.by)} · read by ${n.ack.length}</div>${n.ack.indexOf(currentUserRole) < 0 && active.indexOf(n) > -1 ? `<button class="btn btn-xs btn-primary" style="width:auto;" onclick="twNoticeAckUi('${n.id}')">I have read this</button>` : ""}</div>`;
  return form + (active.length ? active.map(card).join("") : `<div class="mw-empty">No notices at the moment.</div>`) + (past.length ? `<details style="margin-top:10px;"><summary style="cursor:pointer;">Earlier notices (${past.length})</summary>${past.map(card).join("")}</details>` : "");
}
function twNoticePostUi() { const r = twNoticePost({ title: twRead("tw_ntitle"), text: twRead("tw_ntext"), from: twRead("tw_nfrom"), to: twRead("tw_nto"), pinned: !!(document.getElementById("tw_npin") || {}).checked }); showToast(r.ok ? "✅ Notice posted; everyone was told." : "⛔ " + r.message, r.ok ? "success" : "danger"); twRender(); }
function twNoticeAckUi(id) { twNoticeAck(id); twRender(); }

// ----------------------------------------------------------------------------
// 5. CHAT
// ----------------------------------------------------------------------------
/** The roles an @mention names: @role key, or @ a first name. */
function twMentions(text) {
  const out = [], roles = Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name);
  (String(text || "").match(/@([a-z_]+)/gi) || []).forEach(tok => { const w = tok.slice(1).toLowerCase(); roles.forEach(k => { if ((k.toLowerCase() === w || USER_ROLES_CONFIG[k].name.toLowerCase().split(" ")[0] === w) && out.indexOf(k) < 0) out.push(k); }); });
  return out;
}
function twChatPost(channel, text) {
  const t = String(text || "").trim();
  if (!t) return { ok: false, message: "Write a message." };
  if (t.length > 1000) return { ok: false, message: "Keep a message under 1,000 characters." };
  if (channel !== "team" && !twSub(channel)) return { ok: false, message: "That case was not found." };
  const m = { id: "MSG-" + (TW.chat.length + 1), channel, by: currentUserRole, text: t, at: nowStamp(), mentions: twMentions(t).filter(r => r !== currentUserRole) };
  TW.chat.push(m); if (TW.chat.length > 2000) TW.chat = TW.chat.slice(-2000); twSave("chat");
  if (typeof notify === "function") m.mentions.forEach(r => notify(r, { kind: "info", title: twName(currentUserRole) + " mentioned you" + (channel === "team" ? " in the team chat" : " on " + channel), text: t.slice(0, 140), caseId: channel === "team" ? null : channel, key: "chat-" + m.id }));
  return { ok: true, message: m };
}
function twChatMessages(channel) { return TW.chat.filter(m => m.channel === channel).slice(-50); }
function twChatHtml(channel, field) {
  const msgs = twChatMessages(channel), mine = m => m.by === currentUserRole;
  return `<div class="tw-chat">${msgs.length ? msgs.map(m => `<div class="tw-msg${mine(m) ? " mine" : ""}"><div class="tw-msg-h"><strong>${escHtml(twName(m.by))}</strong> <span class="text-muted">${escHtml(m.at)}</span></div><div>${escHtml(m.text).replace(/@([a-z_]+)/gi, '<span class="tw-at">@$1</span>')}</div></div>`).join("") : `<div class="mw-empty">No messages yet. Use @name to get someone's attention.</div>`}</div>
    <div class="mw-dates" style="margin-top:8px;"><input class="form-control" id="${field}" style="flex:1;min-width:240px;" placeholder="Message… (@name to mention)" onkeydown="if(event.key==='Enter')twChatSend('${escHtml(channel)}','${field}')"><button class="btn btn-primary" style="width:auto;" onclick="twChatSend('${escHtml(channel)}','${field}')">Send</button></div>`;
}
function twChatSend(channel, field) { const r = twChatPost(channel, twRead(field)); if (!r.ok) showToast("⛔ " + r.message, "danger"); if (channel === "team") twRender(); else if (typeof cfRender === "function") cfRender(); }

// ----------------------------------------------------------------------------
// 6. AUDIT AND LOSS CONTROL (Case File)
// ----------------------------------------------------------------------------
const TW_AUDIT_KINDS = ["Premium audit", "Loss control survey"], TW_AUDIT_METHODS = ["Physical", "Voluntary", "Mail"];
function twAudits(sub) { if (!sub.audits) sub.audits = []; return sub.audits; }
function twAuditSchedule(sub, f) {
  if (!policyIsBound(sub)) return { ok: false, message: "The policy is not bound." };
  if (TW_AUDIT_KINDS.indexOf(f.kind) < 0) return { ok: false, message: "Choose premium audit or loss control survey." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || ""))) return { ok: false, message: "Choose the date." };
  if (f.date < todayIso()) return { ok: false, message: "The date cannot be in the past." };
  if (!USER_ROLES_CONFIG[f.assignee]) return { ok: false, message: "Choose who will do it." };
  if (f.kind === "Premium audit" && TW_AUDIT_METHODS.indexOf(f.method) < 0) return { ok: false, message: "Choose the audit method." };
  if (twAudits(sub).some(a => a.kind === f.kind && ["Scheduled", "In progress"].indexOf(a.status) > -1)) return { ok: false, message: "A " + f.kind.toLowerCase() + " is already open on this policy." };
  const a = { id: (f.kind === "Premium audit" ? "AUD-" : "LCS-") + sub.id.replace(/^SUB-/, "") + "-" + (twAudits(sub).length + 1), kind: f.kind, status: "Scheduled", date: f.date, assignee: f.assignee, method: f.kind === "Premium audit" ? f.method : null, periodStart: f.periodStart || null, periodEnd: f.periodEnd || null, estimatedUnits: (sub.vehicles || []).length, taskId: null, createdBy: twActor(), createdAt: nowStamp() };
  const t = mwAddTask({ title: f.kind + ": " + sub.insured, type: f.kind === "Premium audit" ? "Premium Audit" : "Loss Control", priority: "Medium", due: f.date, assignee: f.assignee, subId: sub.id, source: "audit" });
  if (t.ok) a.taskId = t.task.id;
  twAudits(sub).push(a);
  twLog(sub, "audit_scheduled", `${f.kind} ${a.id} scheduled for ${f.date}, assigned to ${twName(f.assignee)}.`);
  return { ok: true, audit: a };
}
function twAuditStart(sub, id) { const a = twAudits(sub).find(x => x.id === id); if (!a || a.status !== "Scheduled") return false; a.status = "In progress"; a.startedAt = nowStamp(); if (typeof persistAppState === "function") persistAppState(); return true; }
/** Completes an audit (audited units, adjustment the auditor typed, reason when it is not zero) or a survey (findings and recommendations). */
function twAuditComplete(sub, id, f) {
  const a = twAudits(sub).find(x => x.id === id);
  if (!a || ["Scheduled", "In progress"].indexOf(a.status) < 0) return { ok: false, message: "That audit is not open." };
  if (a.kind === "Premium audit") {
    const units = Number(f.auditedUnits), adj = Number(f.adjustment);
    if (f.auditedUnits === "" || !(units >= 0) || !Number.isInteger(units)) return { ok: false, message: "Enter the audited number of units (a whole number)." };
    if (f.adjustment === "" || isNaN(adj)) return { ok: false, message: "Enter the premium adjustment in dollars (0 if none; negative for a return)." };
    if (adj !== 0 && String(f.reason || "").trim().length < 10) return { ok: false, message: "Explain the adjustment (at least 10 characters)." };
    a.auditedUnits = units; a.adjustment = Math.round(adj * 100) / 100; a.reason = String(f.reason || "").trim();
    a.variancePct = a.estimatedUnits > 0 ? Math.round((units - a.estimatedUnits) / a.estimatedUnits * 1000) / 10 : null;
  } else {
    if (String(f.findings || "").trim().length < 10) return { ok: false, message: "Record the findings (at least 10 characters)." };
    const recs = (f.recommendations || []).filter(r => String(r.text || "").trim());
    for (const r of recs) { if (String(r.text).trim().length < 5) return { ok: false, message: "Each recommendation needs a description (at least 5 characters)." }; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.due || "")) || r.due < todayIso()) return { ok: false, message: "Each recommendation needs a due date that is not in the past." }; }
    a.findings = String(f.findings).trim();
    a.recommendations = recs.map((r, i) => { const t = mwAddTask({ title: "Loss control: " + String(r.text).trim().slice(0, 70), type: "Loss Control", priority: "Medium", due: r.due, assignee: a.assignee, subId: sub.id, source: "audit" }); return { id: "REC-" + (i + 1), text: String(r.text).trim(), due: r.due, status: "Open", taskId: t.ok ? t.task.id : null }; });
  }
  a.status = "Completed"; a.completedAt = nowStamp(); a.completedBy = twActor();
  if (a.taskId && typeof mwComplete === "function") mwComplete(a.taskId);
  twLog(sub, "audit_completed", a.kind === "Premium audit" ? `Premium audit ${a.id} completed: ${a.auditedUnits} units audited against ${a.estimatedUnits} estimated; adjustment ${a.adjustment}${a.reason ? " (" + a.reason + ")" : ""}.` : `Loss control survey ${a.id} completed with ${a.recommendations.length} recommendation(s).`);
  return { ok: true, audit: a };
}
function twAuditCancel(sub, id, reason) {
  const a = twAudits(sub).find(x => x.id === id);
  if (!a || ["Scheduled", "In progress"].indexOf(a.status) < 0) return { ok: false, message: "That audit is not open." };
  if (String(reason || "").trim().length < 5) return { ok: false, message: "Give a reason (at least 5 characters)." };
  a.status = "Cancelled"; a.cancelReason = String(reason).trim(); if (a.taskId && typeof mwComplete === "function") mwComplete(a.taskId);
  twLog(sub, "audit_completed", `${a.kind} ${a.id} cancelled: ${a.cancelReason}`);
  return { ok: true };
}
function twRecDone(sub, auditId, recId) { const a = twAudits(sub).find(x => x.id === auditId), r = a && (a.recommendations || []).find(x => x.id === recId); if (!r || r.status === "Done") return false; r.status = "Done"; r.doneAt = nowStamp(); r.doneBy = twActor(); if (r.taskId && typeof mwComplete === "function") mwComplete(r.taskId); if (typeof persistAppState === "function") persistAppState(); return true; }
function twAuditHtml(sub) {
  if (!policyIsBound(sub)) return `<div class="mw-empty">Premium audits and loss-control surveys are scheduled on a bound policy.</div>`;
  const can = typeof cfCanEdit === "function" && cfCanEdit(sub), roles = Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name), list = twAudits(sub);
  const form = can ? `<details class="card"${list.length ? "" : " open"}><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> Schedule</summary><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="tw_akind">What</label><select class="form-control" id="tw_akind">${TW_AUDIT_KINDS.map(k => `<option>${k}</option>`).join("")}</select></div><div class="form-group"><label for="tw_adate">On</label><input type="date" class="form-control" id="tw_adate" value="${twAddDays(todayIso(), 14)}" min="${todayIso()}"></div>
    <div class="form-group"><label for="tw_aass">Done by</label><select class="form-control" id="tw_aass">${roles.map(k => `<option value="${k}"${k === currentUserRole ? " selected" : ""}>${escHtml(twName(k))}</option>`).join("")}</select></div><div class="form-group"><label for="tw_ameth">Audit method</label><select class="form-control" id="tw_ameth">${TW_AUDIT_METHODS.map(k => `<option>${k}</option>`).join("")}</select></div></div>
    <div class="p1-note">Scheduling makes a task for the person, due on that date.</div><div class="p1-actions"><button class="btn btn-primary" onclick="twAuditScheduleUi()">Schedule</button></div></div></details>` : "";
  const items = list.slice().reverse().map(a => { const open = ["Scheduled", "In progress"].indexOf(a.status) > -1;
    const done = a.status === "Completed" ? (a.kind === "Premium audit" ? `<div class="p1-note">Audited ${a.auditedUnits} units against ${a.estimatedUnits} estimated${a.variancePct === null ? "" : " (" + (a.variancePct > 0 ? "+" : "") + a.variancePct + "%)"}. Adjustment ${a.adjustment === 0 ? "none" : (a.adjustment > 0 ? "additional " : "return ") + "$" + Math.abs(a.adjustment).toLocaleString("en-US")}${a.reason ? ": " + escHtml(a.reason) : ""}. Billing for the adjustment is handled in Billing.</div>` : `<div class="cf-note-t">${escHtml(a.findings)}</div>${(a.recommendations || []).map(r => `<div class="p1-note">${r.status === "Done" ? "✔" : "○"} ${escHtml(r.text)} (due ${escHtml(r.due)})${r.status === "Open" && can ? ` <button class="btn btn-xs btn-outline" style="width:auto;" onclick="twRecDoneUi('${a.id}','${r.id}')">Done</button>` : ""}</div>`).join("")}`) : "";
    const complete = open && can ? (a.kind === "Premium audit" ? `<div class="mw-dates"><input class="form-control" id="tw_au_${a.id}" placeholder="Audited units" style="width:130px;"><input class="form-control" id="tw_aj_${a.id}" placeholder="Adjustment $ (negative = return)" style="width:210px;"><input class="form-control" id="tw_ar_${a.id}" placeholder="Reason for the adjustment" style="min-width:220px;"><button class="btn btn-xs btn-primary" style="width:auto;" onclick="twAuditCompleteUi('${a.id}')">Complete</button></div>`
      : `<div class="mw-dates"><input class="form-control" id="tw_af_${a.id}" placeholder="Findings" style="min-width:260px;"><input class="form-control" id="tw_rt_${a.id}" placeholder="Recommendation (optional)" style="min-width:220px;"><input type="date" class="form-control" id="tw_rd_${a.id}" value="${twAddDays(todayIso(), 30)}" style="width:150px;"><button class="btn btn-xs btn-primary" style="width:auto;" onclick="twAuditCompleteUi('${a.id}')">Complete</button></div>`) + `<div class="mw-dates" style="margin-top:4px;">${a.status === "Scheduled" ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="twAuditStartUi('${a.id}')">Start</button>` : ""}<input class="form-control" id="tw_ac_${a.id}" placeholder="Reason to cancel" style="width:200px;"><button class="btn btn-xs btn-outline-danger" style="width:auto;" onclick="twAuditCancelUi('${a.id}')">Cancel</button></div>` : "";
    return `<div class="cf-note"><div class="cf-note-h"><span class="badge badge-light">${escHtml(a.id)}</span> <strong>${a.kind}</strong> <span class="badge ${{ Scheduled: "badge-info", "In progress": "badge-warning", Completed: "badge-success", Cancelled: "badge-light" }[a.status]}">${a.status}</span><span class="text-muted" style="margin-left:auto;">${escHtml(a.date)} · ${escHtml(twName(a.assignee))}${a.method ? " · " + a.method : ""}</span></div>${a.status === "Cancelled" ? `<div class="p1-note">Cancelled: ${escHtml(a.cancelReason)}</div>` : ""}${done}${complete}</div>`; }).join("");
  return form + (items || `<div class="mw-empty">No audits or surveys on this policy.</div>`);
}
function twAuditScheduleUi() { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = twAuditSchedule(sub, { kind: twRead("tw_akind"), date: twRead("tw_adate"), assignee: twRead("tw_aass"), method: twRead("tw_ameth") }); showToast(r.ok ? "✅ Scheduled." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender(); }
function twAuditStartUi(id) { const sub = cfSub(); if (sub && cfCanEdit(sub)) twAuditStart(sub, id); cfRender(); }
function twAuditCompleteUi(id) {
  const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; }
  const a = twAudits(sub).find(x => x.id === id); if (!a) return;
  const f = a.kind === "Premium audit" ? { auditedUnits: twRead("tw_au_" + id), adjustment: twRead("tw_aj_" + id).replace(/[$,]/g, ""), reason: twRead("tw_ar_" + id) } : { findings: twRead("tw_af_" + id), recommendations: [{ text: twRead("tw_rt_" + id), due: twRead("tw_rd_" + id) }] };
  const r = twAuditComplete(sub, id, f); showToast(r.ok ? "✅ Completed." : "⛔ " + r.message, r.ok ? "success" : "danger"); cfRender();
}
function twAuditCancelUi(id) { const sub = cfSub(); if (!sub) return; if (!cfCanEdit(sub)) { denyPermission("submissionData", "edit"); return; } const r = twAuditCancel(sub, id, twRead("tw_ac_" + id)); if (!r.ok) showToast("⛔ " + r.message, "danger"); cfRender(); }
function twRecDoneUi(a, r) { const sub = cfSub(); if (sub && cfCanEdit(sub)) twRecDone(sub, a, r); cfRender(); }

// ----------------------------------------------------------------------------
// 7. CALCULATOR (every figure is typed; none is built in)
// ----------------------------------------------------------------------------
function tcRound(n) { return Math.round(Number(n) * 100) / 100; }
function tcDays(a, b) { return Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000); }
/** Return premium on cancellation. method: prorata or shortrate (the penalty percent is typed). */
function tcReturn(p) {
  const prem = Number(p.premium), total = tcDays(p.start, p.end), used = tcDays(p.start, p.cancel);
  if (!(prem > 0)) return { ok: false, message: "Enter the premium." };
  if (!(total > 0)) return { ok: false, message: "The end date must be after the start date." };
  if (used < 0 || used > total) return { ok: false, message: "The cancellation date must fall inside the term." };
  const pr = pcProRata(prem, p.start, p.end, p.cancel);   // the same pro-rata the cancellation refund uses (js/policy-changes.js)
  const earnedProRata = pr.proRataEarned, unearned = pr.unearned;
  if (p.method !== "shortrate") return { ok: true, totalDays: total, earnedDays: used, earned: earnedProRata, returned: unearned, penalty: 0 };
  const pct = Number(p.penaltyPct);
  if (p.penaltyPct === "" || p.penaltyPct === undefined || p.penaltyPct === null || !(pct >= 0 && pct <= 100)) return { ok: false, message: "Enter the short-rate penalty as a percent of the unearned premium (0 to 100)." };
  const penalty = tcRound(unearned * pct / 100);
  return { ok: true, totalDays: total, earnedDays: used, earned: tcRound(earnedProRata + penalty), returned: tcRound(unearned - penalty), penalty };
}
function tcCommission(p) {
  const gross = Number(p.gross), pct = Number(p.commissionPct), fee = Number(p.fee || 0), tax = Number(p.taxPct || 0);
  if (!(gross > 0)) return { ok: false, message: "Enter the gross premium." };
  if (!(pct >= 0 && pct <= 100)) return { ok: false, message: "Enter the commission as a percent (0 to 100)." };
  if (!(fee >= 0) || !(tax >= 0 && tax <= 100)) return { ok: false, message: "Fee must be 0 or more and tax a percent from 0 to 100." };
  const commission = tcRound(gross * pct / 100), taxAmt = tcRound(gross * tax / 100);
  return { ok: true, commission, net: tcRound(gross - commission), tax: taxAmt, totalDue: tcRound(gross + taxAmt + fee) };
}
function tcInstalments(p) {
  const financed = Number(p.financed), charge = Number(p.charge || 0), n = Number(p.n);
  if (!(financed > 0)) return { ok: false, message: "Enter the amount financed." };
  if (!(charge >= 0)) return { ok: false, message: "The finance charge must be 0 or more." };
  if (!Number.isInteger(n) || n < 2 || n > 12) return { ok: false, message: "Choose 2 to 12 instalments." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.first || ""))) return { ok: false, message: "Enter the first instalment date." };
  return { ok: true, schedule: cmSchedule(financed, charge, n, p.first), total: tcRound(financed + charge) };
}
function tcRate(p) {
  const exposure = Number(p.exposure), rate = Number(p.rate), per = Number(p.per), min = Number(p.min || 0);
  if (!(exposure > 0) || !(rate > 0)) return { ok: false, message: "Enter the exposure and the rate." };
  if ([1, 100, 1000].indexOf(per) < 0) return { ok: false, message: "Choose what the rate is per." };
  const r = cmRatePremium(exposure, rate, per, min);   // the same maths as the premium estimate (js/case-money.js)
  return { ok: true, base: r.base, premium: r.premium, minApplied: r.minApplied };
}
function openCalculator() {
  let o = document.getElementById("calcModal");
  if (!o) { o = document.createElement("div"); o.id = "calcModal"; o.className = "modal-overlay"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); document.body.appendChild(o); }
  o.innerHTML = `<div class="modal-content" style="max-width:760px;"><div class="modal-header"><h3><i class="ph ph-calculator text-primary"></i> Calculator</h3><button class="btn-close" aria-label="Close" onclick="closeCalculator()"><i class="ph ph-x"></i></button></div><div class="modal-body">
    <p class="p1-note" style="margin-top:0;">Every figure is typed in. Nothing here is a filed rate or a rule.</p>
    <details open><summary style="cursor:pointer;font-weight:700;">Return premium</summary><div class="mw-grid"><div class="form-group"><label for="tc_prem">Premium</label><input class="form-control" id="tc_prem" inputmode="decimal"></div><div class="form-group"><label for="tc_start">Term start</label><input type="date" class="form-control" id="tc_start"></div><div class="form-group"><label for="tc_end">Term end</label><input type="date" class="form-control" id="tc_end"></div><div class="form-group"><label for="tc_canc">Cancel on</label><input type="date" class="form-control" id="tc_canc"></div>
      <div class="form-group"><label for="tc_meth">Method</label><select class="form-control" id="tc_meth"><option value="prorata">Pro-rata</option><option value="shortrate">Short-rate</option></select></div><div class="form-group"><label for="tc_pen">Short-rate penalty (% of unearned)</label><input class="form-control" id="tc_pen" inputmode="decimal"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="tcRunReturn()">Work out</button></div><div id="tc_out_return"></div></details>
    <details><summary style="cursor:pointer;font-weight:700;">Commission and net</summary><div class="mw-grid"><div class="form-group"><label for="tc_gross">Gross premium</label><input class="form-control" id="tc_gross" inputmode="decimal"></div><div class="form-group"><label for="tc_cpct">Commission %</label><input class="form-control" id="tc_cpct" inputmode="decimal"></div><div class="form-group"><label for="tc_fee">Broker fee ($)</label><input class="form-control" id="tc_fee" inputmode="decimal"></div><div class="form-group"><label for="tc_tax">Tax %</label><input class="form-control" id="tc_tax" inputmode="decimal"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="tcRunCommission()">Work out</button></div><div id="tc_out_commission"></div></details>
    <details><summary style="cursor:pointer;font-weight:700;">Instalments</summary><div class="mw-grid"><div class="form-group"><label for="tc_fin">Amount financed</label><input class="form-control" id="tc_fin" inputmode="decimal"></div><div class="form-group"><label for="tc_chg">Finance charge ($)</label><input class="form-control" id="tc_chg" inputmode="decimal"></div><div class="form-group"><label for="tc_n">Instalments</label><input class="form-control" id="tc_n" type="number" min="2" max="12"></div><div class="form-group"><label for="tc_first">First on</label><input type="date" class="form-control" id="tc_first"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="tcRunInstalments()">Work out</button></div><div id="tc_out_instalments"></div></details>
    <details><summary style="cursor:pointer;font-weight:700;">Premium from a rate</summary><div class="mw-grid"><div class="form-group"><label for="tc_exp">Exposure (units, value or revenue)</label><input class="form-control" id="tc_exp" inputmode="decimal"></div><div class="form-group"><label for="tc_rate">Rate ($)</label><input class="form-control" id="tc_rate" inputmode="decimal"></div><div class="form-group"><label for="tc_per">Per</label><select class="form-control" id="tc_per"><option value="1">unit</option><option value="100">$100</option><option value="1000">$1,000</option></select></div><div class="form-group"><label for="tc_min">Minimum premium ($)</label><input class="form-control" id="tc_min" inputmode="decimal"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="tcRunRate()">Work out</button></div><div id="tc_out_rate"></div></details></div></div>`;
  o.classList.add("active");
}
function closeCalculator() { const o = document.getElementById("calcModal"); if (o) o.classList.remove("active"); }
function tcShow(id, r, lines) { const e = document.getElementById("tc_out_" + id); if (e) e.innerHTML = r.ok ? `<div class="p1-banner ok" style="margin:8px 0 0;"><i class="ph ph-check-circle"></i><div>${lines(r)}</div></div>` : `<div class="p1-banner bad" style="margin:8px 0 0;"><i class="ph ph-x-circle"></i><div>${escHtml(r.message)}</div></div>`; }
const tcM = v => "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function tcRunReturn() { tcShow("return", tcReturn({ premium: twRead("tc_prem"), start: twRead("tc_start"), end: twRead("tc_end"), cancel: twRead("tc_canc"), method: twRead("tc_meth"), penaltyPct: twRead("tc_pen") }), r => `${r.earnedDays} of ${r.totalDays} days used. Earned <strong>${tcM(r.earned)}</strong>; return <strong>${tcM(r.returned)}</strong>${r.penalty ? " (short-rate penalty " + tcM(r.penalty) + ")" : ""}.`); }
function tcRunCommission() { tcShow("commission", tcCommission({ gross: twRead("tc_gross"), commissionPct: twRead("tc_cpct"), fee: twRead("tc_fee"), taxPct: twRead("tc_tax") }), r => `Commission <strong>${tcM(r.commission)}</strong>; net to carrier <strong>${tcM(r.net)}</strong>; tax ${tcM(r.tax)}; total due from the insured <strong>${tcM(r.totalDue)}</strong>.`); }
function tcRunInstalments() { tcShow("instalments", tcInstalments({ financed: twRead("tc_fin"), charge: twRead("tc_chg"), n: twRead("tc_n"), first: twRead("tc_first") }), r => `Total ${tcM(r.total)} in ${r.schedule.length} instalments: ${r.schedule.map(i => i.due + " " + tcM(i.amount)).join("; ")}.`); }
function tcRunRate() { tcShow("rate", tcRate({ exposure: twRead("tc_exp"), rate: twRead("tc_rate"), per: twRead("tc_per"), min: twRead("tc_min") }), r => `Premium <strong>${tcM(r.premium)}</strong>${r.minApplied ? " (the minimum applies; the rate gives " + tcM(r.base) + ")" : ""}.`); }

// ----------------------------------------------------------------------------
// 8. PROFILE AND PASSWORD (local to this browser; not security)
// ----------------------------------------------------------------------------
/** SHA-256 of a string, as hex (synchronous, so sign-in stays synchronous). */
function twSha256(str) {
  const rr = (n, x) => (x >>> n) | (x << (32 - n)), K = [], H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let p = 2, n = 0; n < 64; p++) { let prime = true; for (let d = 2; d * d <= p; d++) if (p % d === 0) { prime = false; break; } if (prime) { K[n++] = (Math.pow(p, 1 / 3) * 4294967296) | 0; } }
  const bytes = Array.from(new TextEncoder().encode(str)), bl = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bl >>> (i * 8)) & 255);
  for (let o = 0; o < bytes.length; o += 64) {
    const w = []; for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) { const s0 = rr(7, w[i - 15]) ^ rr(18, w[i - 15]) ^ (w[i - 15] >>> 3), s1 = rr(17, w[i - 2]) ^ rr(19, w[i - 2]) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) { const S1 = rr(6, e) ^ rr(11, e) ^ rr(25, e), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) | 0, S0 = rr(2, a) ^ rr(13, a) ^ rr(22, a), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => ("00000000" + (x >>> 0).toString(16)).slice(-8)).join("");
}
function tpProfile(role) { return TW.profile[role] || {}; }
function tpHasPassword(role) { return !!tpProfile(role).hash; }
function tpSaveProfile(role, f) {
  if (!USER_ROLES_CONFIG[role]) return { ok: false, message: "Unknown user." };
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return { ok: false, message: "That email address does not look right." };
  if (f.phone && !/^[0-9+()\-.\s]{7,20}$/.test(f.phone)) return { ok: false, message: "That phone number does not look right." };
  TW.profile[role] = Object.assign({}, tpProfile(role), { phone: String(f.phone || "").trim(), email: String(f.email || "").trim(), updatedAt: nowStamp() }); twSave("profile");
  return { ok: true };
}
/** The rules a new password must meet. */
function tpPasswordProblems(pw, role) {
  const p = [];
  if (String(pw).length < 10) p.push("at least 10 characters");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) p.push("both upper and lower case letters");
  if (!/\d/.test(pw)) p.push("a digit");
  const u = USER_ROLES_CONFIG[role] || {}, low = String(pw).toLowerCase();
  if ((u.name || "").toLowerCase().split(" ").some(w => w.length > 2 && low.indexOf(w) > -1) || low.indexOf(String(role).toLowerCase()) > -1) p.push("no part of the user's name");
  return p;
}
function tpChangePassword(role, current, next, confirm) {
  if (!USER_ROLES_CONFIG[role]) return { ok: false, message: "Unknown user." };
  const pr = tpProfile(role);
  if (pr.hash && twSha256((pr.salt || "") + String(current || "")) !== pr.hash) return { ok: false, message: "The current password is not right." };
  if (next !== confirm) return { ok: false, message: "The new password and its confirmation do not match." };
  const prob = tpPasswordProblems(next, role);
  if (prob.length) return { ok: false, message: "The new password needs " + prob.join(", ") + "." };
  if (pr.hash && twSha256((pr.salt || "") + next) === pr.hash) return { ok: false, message: "Choose a password different from the current one." };
  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  TW.profile[role] = Object.assign({}, pr, { salt, hash: twSha256(salt + next), passwordChangedAt: nowStamp() }); twSave("profile");
  return { ok: true };
}
var TP_FAILS = {};
/** Whether a sign-in may go ahead: any password while none is set; the right one once it is set; five wrong tries lock a minute. */
function tpCheckLogin(role, password, now) {
  const t = now || Date.now(), f = TP_FAILS[role] || { n: 0, until: 0 };
  if (f.until > t) return { ok: false, message: "Too many wrong passwords. Try again in " + Math.ceil((f.until - t) / 1000) + " seconds." };
  if (!tpHasPassword(role)) return { ok: true };
  const pr = tpProfile(role);
  if (twSha256((pr.salt || "") + String(password || "")) === pr.hash) { TP_FAILS[role] = { n: 0, until: 0 }; return { ok: true }; }
  f.n++; if (f.n >= 5) { f.until = t + 60000; f.n = 0; } TP_FAILS[role] = f;
  return { ok: false, message: "That password is not right." };
}
function tpResetPassword(role) {
  if (!canManageAssignments()) return { ok: false, message: "Only the Head of Underwriting resets a password." };
  if (!tpHasPassword(role)) return { ok: false, message: "No password is set for that user." };
  delete TW.profile[role].hash; delete TW.profile[role].salt; TW.profile[role].passwordResetAt = nowStamp(); TW.profile[role].passwordResetBy = twActor(); twSave("profile");
  return { ok: true };
}
function openProfile() {
  let o = document.getElementById("profileModal");
  if (!o) { o = document.createElement("div"); o.id = "profileModal"; o.className = "modal-overlay"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); document.body.appendChild(o); }
  const u = USER_ROLES_CONFIG[currentUserRole] || {}, p = tpProfile(currentUserRole);
  o.innerHTML = `<div class="modal-content" style="max-width:560px;"><div class="modal-header"><h3><i class="ph ph-user-circle text-primary"></i> My profile</h3><button class="btn-close" aria-label="Close" onclick="closeProfile()"><i class="ph ph-x"></i></button></div><div class="modal-body">
    <div class="p1-summary"><div><div class="p1-k">Name</div><div class="p1-v">${escHtml(u.name)}</div></div><div><div class="p1-k">Role</div><div class="p1-v">${escHtml(u.title)}</div></div></div>
    <div class="mw-grid"><div class="form-group"><label for="tp_phone">Phone</label><input class="form-control" id="tp_phone" value="${escHtml(p.phone || "")}"></div><div class="form-group"><label for="tp_email">Email</label><input class="form-control" id="tp_email" type="email" value="${escHtml(p.email || "")}"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="tpSaveProfileUi()">Save profile</button></div>
    <div class="cl-subhead">Change password</div>${tpHasPassword(currentUserRole) ? `<div class="form-group"><label for="tp_cur">Current password</label><input class="form-control" id="tp_cur" type="password" autocomplete="current-password"></div>` : `<div class="p1-note">No password is set, so sign-in accepts anything. Set one to require it.</div>`}
    <div class="mw-grid"><div class="form-group"><label for="tp_new">New password</label><input class="form-control" id="tp_new" type="password" autocomplete="new-password"></div><div class="form-group"><label for="tp_conf">Confirm</label><input class="form-control" id="tp_conf" type="password" autocomplete="new-password"></div></div>
    <div class="p1-note">At least 10 characters, upper and lower case, a digit, and no part of your name. This prototype keeps the password (salted, hashed) in this browser only; it is not security.</div><div class="p1-actions"><button class="btn btn-primary" onclick="tpPasswordUi()">Change password</button></div>
    ${canManageAssignments() ? `<div class="cl-subhead">Reset someone's password</div>${Object.keys(TW.profile).filter(k => tpHasPassword(k)).length ? `<div class="mw-dates"><select class="form-control" id="tp_resetwho">${Object.keys(TW.profile).filter(k => tpHasPassword(k)).map(k => `<option value="${k}">${escHtml(twName(k))}</option>`).join("")}</select><button class="btn btn-sm btn-outline" style="width:auto;" onclick="tpResetUi()">Reset password</button></div><div class="p1-note">The user signs in with anything until they set a new one.</div>` : `<div class="p1-note">No user has a password set.</div>`}` : ""}</div></div>`;
  o.classList.add("active");
}
function closeProfile() { const o = document.getElementById("profileModal"); if (o) o.classList.remove("active"); }
function tpResetUi() { const r = tpResetPassword(twRead("tp_resetwho")); showToast(r.ok ? "Password reset." : "⛔ " + r.message, r.ok ? "info" : "danger"); openProfile(); }
function tpSaveProfileUi() { const r = tpSaveProfile(currentUserRole, { phone: twRead("tp_phone"), email: twRead("tp_email") }); showToast(r.ok ? "✅ Profile saved." : "⛔ " + r.message, r.ok ? "success" : "danger"); }
function tpPasswordUi() { const r = tpChangePassword(currentUserRole, (document.getElementById("tp_cur") || {}).value || "", (document.getElementById("tp_new") || {}).value || "", (document.getElementById("tp_conf") || {}).value || ""); showToast(r.ok ? "✅ Password changed. It is needed at your next sign-in." : "⛔ " + r.message, r.ok ? "success" : "danger"); if (r.ok) openProfile(); }

// ----------------------------------------------------------------------------
// 9. HOOKS FOR MY WORK, THE CASE FILE, SIGN-IN AND THE PHONE BOOK
// ----------------------------------------------------------------------------
function twTabs() {
  const open = TW.mail.filter(m => m.status !== "Done").length, q = TW.print.filter(p => p.status === "Queued").length, tk = TW.tickets.filter(t => t.status !== "Closed").length, nb = twNoticeUnread();
  return [["mail", "Mailman", "ph-envelope-simple", open], ["print", "Print queue", "ph-printer", q], ["tickets", "Tickets", "ph-lifebuoy", tk], ["board", "Notice board", "ph-megaphone", nb], ["chat", "Team chat", "ph-chats", ""]];
}
function twBody(tab) { return { mail: twMailHtml, print: twPrintHtml, tickets: twTicketsHtml, board: twBoardHtml, chat: () => twChatHtml("team", "tw_chat_team") }[tab](); }
function twCaseTabs() { return [["print", "Print", "ph-printer"], ["discuss", "Discussion", "ph-chats"], ["audit", "Audit & loss control", "ph-clipboard-text"]]; }
function twCaseBody(tab, sub) { return { print: twPrintTabHtml, discuss: s => twChatHtml(s.id, "tw_chat_case"), audit: twAuditHtml }[tab](sub); }

(function twInstall() {
  const orig = window.submitLogin;
  if (typeof orig === "function") window.submitLogin = function () {
    const sel = document.getElementById("loginUserSelect"), pw = document.getElementById("loginPasswordInput");
    if (sel && sel.value && pw && pw.value.trim()) { const c = tpCheckLogin(sel.value, pw.value); if (!c.ok) { showToast("⛔ " + c.message, "danger"); return; } }
    return orig.apply(this, arguments);
  };
})();
