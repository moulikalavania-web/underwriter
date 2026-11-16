/**
 * ============================================================================
 * MY WORK: FOLLOW-UP TASKS AND EXCEPTION QUEUES
 * ----------------------------------------------------------------------------
 * One page for what an underwriter has to chase.
 *
 *   TASKS    a personal task list. A task has a type (New Business, Renewal, Referral, Premium Audit, Loss Control, Follow-up,
 *            Other), a title, an assignee, a due date, a priority and optionally the case it is about. Filters: Today, This
 *            week, This month, All, Past due. A task can be added, reassigned, given a new due date, completed and reopened;
 *            a task past its due date shows in red. An assignee is notified (the bell in the header).
 *   QUEUES   ready-made exception lists, worked out from the cases themselves each time the page is drawn, so they are never
 *            stale: bound but not finalized, accepted but not finalized, endorsements left pending, policies pending
 *            cancellation, cancellation notices waiting to be generated, quotes without options, submissions without a quote.
 *            Each can be narrowed to a date range on one date field. A row opens its case, or becomes a task in one click.
 *
 * Tasks are kept in this browser (localStorage), like the notifications: there is no server, so they do not travel between
 * computers. The Head of Underwriting sees every task and every case; everyone else sees their own tasks and their own cases.
 * ============================================================================
 */

const TASK_STORE_KEY = "FUT_TASKS_V1";
const TASK_TYPES = ["New Business", "Renewal", "Referral", "Premium Audit", "Loss Control", "Follow-up", "Other"];
const TASK_PRIORITIES = ["High", "Medium", "Low"];
var TASKS = [];
try { const raw = localStorage.getItem(TASK_STORE_KEY); if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) TASKS = parsed; } } catch (e) { /* storage unavailable: start empty */ }

var MW = { tab: "tasks", range: "open", showDone: false, queue: "bound_not_finalized", dateField: "", from: "", to: "", draftCase: "" };

function mwEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s); }
function mwSave() { try { localStorage.setItem(TASK_STORE_KEY, JSON.stringify(TASKS)); } catch (e) { /* keep them for this session */ } }
function mwToday() { return new Date().toISOString().slice(0, 10); }
function mwAddDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mwRoleName(key) { const r = typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[key]; return r ? r.name + " (" + r.title + ")" : String(key || "Unassigned"); }
function mwIsManager() { return typeof canManageAssignments === "function" && canManageAssignments(); }
function mwSubs() { return SUBMISSIONS_DATASET.filter(s => mwIsManager() || canSeeAllSubmissions() || isMyCase(s)); }

// ----------------------------------------------------------------------------
// 1. TASKS
// ----------------------------------------------------------------------------
/** Adds a task. Returns { ok: true, task } or { ok: false, message }. */
function mwAddTask(f) {
  const title = String(f.title || "").trim();
  if (title.length < 3) return { ok: false, message: "Give the task a title (at least 3 characters)." };
  if (TASK_TYPES.indexOf(f.type) < 0) return { ok: false, message: "Choose the type of task." };
  if (TASK_PRIORITIES.indexOf(f.priority) < 0) return { ok: false, message: "Choose a priority." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.due || ""))) return { ok: false, message: "Choose a due date." };
  if (f.due < mwToday() && !f.allowPast) return { ok: false, message: "The due date cannot be in the past." };
  if (typeof USER_ROLES_CONFIG === "undefined" || !USER_ROLES_CONFIG[f.assignee]) return { ok: false, message: "Choose who the task is for." };
  if (f.subId && !SUBMISSIONS_DATASET.some(s => s.id === f.subId)) return { ok: false, message: "That case was not found." };
  const t = { id: "TSK-" + (TASKS.reduce((m, x) => Math.max(m, Number(String(x.id).slice(4)) || 0), 0) + 1), title, type: f.type, priority: f.priority, due: f.due, assignee: f.assignee, subId: f.subId || null, notes: String(f.notes || "").trim(),
    status: "open", createdBy: currentUserRole, createdAt: new Date().toISOString().slice(0, 16).replace("T", " "), completedAt: null, source: f.source || "manual" };
  TASKS.push(t); mwSave();
  mwNotifyAssignee(t, "assigned");
  return { ok: true, task: t };
}

function mwNotifyAssignee(t, what) {
  if (typeof notify !== "function" || t.assignee === currentUserRole) return;
  notify(t.assignee, { kind: "info", title: (what === "assigned" ? "Task for you: " : "Task moved to you: ") + t.title, text: `${t.type}, due ${t.due}, ${t.priority} priority${t.subId ? ", case " + t.subId : ""}.`, caseId: t.subId || null, key: "task-" + t.id + "-" + t.assignee });
}

function mwTask(id) { return TASKS.find(t => t.id === id) || null; }
/** Whoever may touch a task: its creator, its assignee, and the Head of Underwriting. */
function mwCanEdit(t) { return !!t && (mwIsManager() || t.assignee === currentUserRole || t.createdBy === currentUserRole); }
function mwVisibleTasks() { return TASKS.filter(t => mwIsManager() || t.assignee === currentUserRole || t.createdBy === currentUserRole); }

function mwComplete(id) { const t = mwTask(id); if (!mwCanEdit(t)) return false; t.status = "done"; t.completedAt = new Date().toISOString().slice(0, 16).replace("T", " "); mwSave(); return true; }
function mwReopen(id) { const t = mwTask(id); if (!mwCanEdit(t)) return false; t.status = "open"; t.completedAt = null; mwSave(); return true; }
function mwReassign(id, role) {
  const t = mwTask(id); if (!mwCanEdit(t) || !USER_ROLES_CONFIG[role] || t.assignee === role) return false;
  t.assignee = role; mwSave(); mwNotifyAssignee(t, "moved"); return true;
}
function mwSetDue(id, iso) {
  const t = mwTask(id); if (!mwCanEdit(t) || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return false;
  t.due = iso; mwSave(); return true;
}
function mwIsPastDue(t) { return t.status === "open" && t.due < mwToday(); }

/** The tasks in a range: today, week, month, all or pastdue. Open tasks only unless `done` is true. */
function mwFilterTasks(list, range, done) {
  const today = mwToday(), weekEnd = mwAddDays(today, 6), monthEnd = mwAddDays(today, 29);
  return list.filter(t => {
    if (!done && t.status !== "open") return false;
    if (range === "today") return t.due === today && t.status === "open";
    if (range === "week") return t.due >= today && t.due <= weekEnd;
    if (range === "month") return t.due >= today && t.due <= monthEnd;
    if (range === "pastdue") return mwIsPastDue(t);
    return true;
  }).sort((a, b) => a.due.localeCompare(b.due) || TASK_PRIORITIES.indexOf(a.priority) - TASK_PRIORITIES.indexOf(b.priority));
}

// ----------------------------------------------------------------------------
// 2. EXCEPTION QUEUES (worked out from the cases)
// ----------------------------------------------------------------------------
const MW_QUEUES = [
  { key: "bound_not_finalized", label: "Bound but not finalized", help: "Bound, but a post-bind condition is still open, so the file is not closed out." },
  { key: "accepted_not_finalized", label: "Accepted but not finalized", help: "The customer accepted the quote, but the policy is not bound yet." },
  { key: "endorsement_pending", label: "Endorsements left pending", help: "An endorsement request is waiting for a decision from the person with authority." },
  { key: "pending_cancellation", label: "Policies pending cancellation", help: "A cancellation has been recorded and has not taken effect yet." },
  { key: "notice_to_generate", label: "Cancellation notices waiting to be generated", help: "An insurer cancellation is recorded, but the notice has no proof of mailing yet." },
  { key: "quote_no_options", label: "Quotes created without options", help: "A quote version exists with no coverage and no limit on it." },
  { key: "no_quote", label: "Submissions created without a quote", help: "Open submissions that have no quote version yet." }
];
const MW_DATE_FIELDS = [
  { key: "received", label: "Received" },
  { key: "account_effective", label: "Account effective (requested)" },
  { key: "policy_effective", label: "Policy effective (bound)" },
  { key: "invoice", label: "Invoice issued" },
  { key: "cancellation_effective", label: "Cancellation effective" },
  { key: "notice_mailed", label: "Cancellation notice mailed" },
  { key: "transaction_effective", label: "Transaction effective (endorsement)" }
];

function mwDay(v) {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  return isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}
function mwBound(s) { return !!(s.pasSync && s.pasSync.status === "success" && s.pasSync.policyNumber); }
function mwOpen(s) { return !s.lifecycleStatus || ["declined", "closed"].indexOf(s.lifecycleStatus) < 0; }
function mwQuotes(s) { const e = (typeof QUOTE_VERSIONS_DATASET !== "undefined" ? QUOTE_VERSIONS_DATASET : []).find(v => v.subId === s.id); return e ? e.quotes : []; }
function mwCancellationEvent(s) { return (s.policyChanges || []).find(c => c.type === "cancellation" && c.id === (s.cancellation || {}).eventId) || null; }

/** The date on a case for one date field, or "" when the case has none. */
function mwDateOf(s, field) {
  const ev = (s.policyChanges || []).filter(c => c.type === "endorsement").slice(-1)[0];
  const c = mwCancellationEvent(s);
  const by = {
    received: () => mwDay(s.receivedTimestamp ? new Date(s.receivedTimestamp).toISOString() : ""),
    account_effective: () => mwDay(s.effectiveDate),
    policy_effective: () => mwDay(s.pasSync && s.pasSync.effectiveDate),
    invoice: () => mwDay(s.invoice && s.invoice.issuedAt),
    cancellation_effective: () => mwDay(c && c.effective),
    notice_mailed: () => mwDay(c && c.mailedOn),
    transaction_effective: () => mwDay(ev && ev.effective)
  };
  return by[field] ? by[field]() : "";
}

/** The cases that belong in a queue, each { sub, why }. */
function mwQueueRows(key, subs) {
  const out = [];
  subs.forEach(s => {
    if (key === "bound_not_finalized") {
      const open = (s.subjectivities || []).filter(x => x.timing === "post_bind" && x.status === "open");
      if (mwBound(s) && open.length && mwOpen(s)) out.push({ sub: s, why: open.length + " post-bind condition" + (open.length === 1 ? "" : "s") + " open: " + open.slice(0, 2).map(x => x.text).join("; ") });
    } else if (key === "accepted_not_finalized") {
      if (s.customerApproved && !mwBound(s) && mwOpen(s)) out.push({ sub: s, why: "Accepted by the customer; not bound." });
    } else if (key === "endorsement_pending") {
      const p = (s.policyReferrals || []).filter(r => r.type === "endorsement" && r.status === "pending");
      if (p.length) out.push({ sub: s, why: p.length + " endorsement request" + (p.length === 1 ? "" : "s") + " waiting for " + p[0].requiredRole + "." });
    } else if (key === "pending_cancellation") {
      if (s.cancellation && s.cancellation.status === "pending") out.push({ sub: s, why: "Cancellation effective " + s.cancellation.effective + " (" + (s.cancellation.initiator || "") + ")." });
    } else if (key === "notice_to_generate") {
      const c = mwCancellationEvent(s);
      if (c && c.status === "pending" && c.initiator === "insurer" && !c.proofRef) out.push({ sub: s, why: "Insurer cancellation effective " + c.effective + " with no proof of mailing." });
    } else if (key === "quote_no_options") {
      const bad = mwQuotes(s).filter(q => q.isLatest && (!q.liabilityLimit || q.liabilityLimit === "Not stated") && (!q.pdDeductible || q.pdDeductible === "Not stated"));
      if (bad.length) out.push({ sub: s, why: "Quote " + bad[0].versionId + " has no limit and no deductible." });
    } else if (key === "no_quote") {
      if (mwOpen(s) && !mwQuotes(s).length && !mwBound(s) && !s.quoteIssued) out.push({ sub: s, why: "At step " + (s.currentStep || 1) + "; no quote version yet." });
    }
  });
  return out;
}

/** A queue's rows, narrowed to a date range on one date field (a case with no date in the field is left out). */
function mwQueue(key, opts) {
  opts = opts || {};
  let rows = mwQueueRows(key, mwSubs());
  if (opts.field && (opts.from || opts.to)) {
    rows = rows.filter(r => { const d = mwDateOf(r.sub, opts.field); return d && (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to); });
  }
  return rows;
}

// ----------------------------------------------------------------------------
// 3. PAGE
// ----------------------------------------------------------------------------
function showMyWorkPage() {
  currentPage = "my-work";
  resetAllTopLevelPages();
  setPageTitle("My Work");
  setBreadcrumb([{ label: "FUT", onClick: "showIntakePage()" }, { label: "My Work" }]);
  const page = document.getElementById("myWorkPageView");
  if (page) { page.style.display = "block"; page.classList.add("active"); }
  const nav = document.getElementById("navItemMyWork");
  if (nav) nav.classList.add("active");
  const footer = document.getElementById("workflowBottomFooter");
  if (footer) footer.style.display = "none";
  document.body.classList.remove("has-bottom-footer");
  mwRender();
}

function mwSwitchTab(tab) { MW.tab = tab; mwRender(); }
function mwSetRange(r) { MW.range = r; mwRender(); }
function mwToggleDone() { MW.showDone = !MW.showDone; mwRender(); }
function mwPickQueue(k) { MW.queue = k; mwRender(); }
function mwRead(id) { const e = document.getElementById(id); return e ? e.value : ""; }

function mwAddFromForm() {
  const r = mwAddTask({ title: mwRead("mw_title"), type: mwRead("mw_type"), priority: mwRead("mw_priority"), due: mwRead("mw_due"), assignee: mwRead("mw_assignee"), subId: mwRead("mw_case"), notes: mwRead("mw_notes") });
  if (!r.ok) { showToast("⛔ " + r.message, "danger"); return; }
  showToast("✅ Task " + r.task.id + " added.", "success");
  MW.draftCase = ""; mwRender();
}
function mwDoComplete(id) { if (!mwComplete(id)) { showToast("⛔ You cannot change that task.", "danger"); return; } mwRender(); }
function mwDoReopen(id) { if (!mwReopen(id)) { showToast("⛔ You cannot change that task.", "danger"); return; } mwRender(); }
function mwDoReassign(id, role) { if (!mwReassign(id, role)) { showToast("⛔ You cannot move that task.", "danger"); } mwRender(); }
function mwDoDue(id, iso) { if (!mwSetDue(id, iso)) { showToast("⛔ Choose a valid date.", "danger"); } mwRender(); }
function mwOpenCase(id) { if (typeof openCaseAtCurrentStep === "function") openCaseAtCurrentStep(id); }

/** One click from a queue row to a task for that case. */
function mwTaskFromQueue(subId, qkey) {
  const q = MW_QUEUES.find(x => x.key === qkey), s = SUBMISSIONS_DATASET.find(x => x.id === subId);
  if (!q || !s) return;
  const type = qkey === "no_quote" ? "New Business" : qkey === "endorsement_pending" ? "Referral" : "Follow-up";
  const r = mwAddTask({ title: q.label + ": " + s.insured, type, priority: "Medium", due: mwAddDays(mwToday(), 2), assignee: s.assignedTo || currentUserRole, subId, source: "queue:" + qkey });
  showToast(r.ok ? "✅ Task " + r.task.id + " added for " + s.id + "." : "⛔ " + r.message, r.ok ? "success" : "danger");
  mwRender();
}

function mwTile(label, n, cls) { return `<div class="mw-tile ${cls || ""}"><div class="mw-tile-n">${n}</div><div class="mw-tile-l">${label}</div></div>`; }

function mwTasksHtml() {
  const mine = mwVisibleTasks(), open = mine.filter(t => t.status === "open");
  const today = mwToday();
  const tiles = mwTile("Open", open.length) + mwTile("Due today", open.filter(t => t.due === today).length) + mwTile("Past due", open.filter(mwIsPastDue).length, open.some(mwIsPastDue) ? "bad" : "") + mwTile("Done", mine.length - open.length);
  const roles = Object.keys(USER_ROLES_CONFIG).filter(k => USER_ROLES_CONFIG[k].name);
  const roleOpts = sel => roles.map(k => `<option value="${k}"${k === sel ? " selected" : ""}>${mwEsc(mwRoleName(k))}</option>`).join("");
  const caseOpts = `<option value="">No case</option>` + mwSubs().map(s => `<option value="${mwEsc(s.id)}"${s.id === MW.draftCase ? " selected" : ""}>${mwEsc(s.id)} · ${mwEsc(s.insured)}</option>`).join("");
  const form = `<details class="card mw-form"${mine.length ? "" : " open"}><summary><i class="ph ph-plus-circle"></i> Add a task</summary><div class="card-body">
    <div class="mw-grid">
      <div class="form-group mw-wide"><label for="mw_title">Task</label><input class="form-control" id="mw_title" placeholder="e.g. Chase signed application from broker"></div>
      <div class="form-group"><label for="mw_type">Type</label><select class="form-control" id="mw_type">${TASK_TYPES.map(t => `<option>${t}</option>`).join("")}</select></div>
      <div class="form-group"><label for="mw_priority">Priority</label><select class="form-control" id="mw_priority">${TASK_PRIORITIES.map(t => `<option${t === "Medium" ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="form-group"><label for="mw_due">Due date</label><input class="form-control" type="date" id="mw_due" value="${mwAddDays(today, 1)}" min="${today}"></div>
      <div class="form-group"><label for="mw_assignee">For</label><select class="form-control" id="mw_assignee">${roleOpts(currentUserRole)}</select></div>
      <div class="form-group mw-wide"><label for="mw_case">Case</label><select class="form-control" id="mw_case">${caseOpts}</select></div>
      <div class="form-group mw-wide"><label for="mw_notes">Note <span class="text-muted">(optional)</span></label><input class="form-control" id="mw_notes"></div>
    </div>
    <div class="p1-actions"><button class="btn btn-primary" onclick="mwAddFromForm()"><i class="ph ph-plus"></i> Add task</button></div></div></details>`;
  const ranges = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["open", "All"], ["pastdue", "Past due"]];
  const bar = `<div class="mw-bar">${ranges.map(r => `<button class="tab-btn${MW.range === r[0] ? " active" : ""}" onclick="mwSetRange('${r[0]}')">${r[1]}${r[0] === "pastdue" && open.filter(mwIsPastDue).length ? ` <span class="badge badge-danger">${open.filter(mwIsPastDue).length}</span>` : ""}</button>`).join("")}
    <label class="mw-check"><input type="checkbox" ${MW.showDone ? "checked" : ""} onchange="mwToggleDone()"> Show completed</label></div>`;
  const list = mwFilterTasks(mine, MW.range === "open" ? "all" : MW.range, MW.showDone);
  const rows = list.map(t => {
    const past = mwIsPastDue(t), can = mwCanEdit(t), dis = can ? "" : " disabled";
    return `<tr class="${past ? "mw-past" : ""}${t.status === "done" ? " mw-done" : ""}">
      <td><span class="badge ${t.priority === "High" ? "badge-danger" : t.priority === "Medium" ? "badge-warning" : "badge-light"}">${t.priority}</span></td>
      <td><strong>${mwEsc(t.title)}</strong><div class="p1-note">${mwEsc(t.type)}${t.notes ? " · " + mwEsc(t.notes) : ""}${t.source && t.source !== "manual" ? " · from a queue" : ""}</div></td>
      <td>${t.subId ? `<a href="#" onclick="mwOpenCase('${mwEsc(t.subId)}'); return false;">${mwEsc(t.subId)}</a>` : "—"}</td>
      <td><select class="form-control" onchange="mwDoReassign('${t.id}', this.value)" aria-label="Reassign ${t.id}"${dis}>${roleOpts(t.assignee)}</select></td>
      <td><input type="date" class="form-control" value="${t.due}" onchange="mwDoDue('${t.id}', this.value)" aria-label="Due date of ${t.id}"${dis}>${past ? `<div class="mw-late">Past due</div>` : ""}</td>
      <td>${t.status === "done" ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="mwDoReopen('${t.id}')"${dis}>Reopen</button>` : `<button class="btn btn-xs btn-success" style="width:auto;" onclick="mwDoComplete('${t.id}')"${dis}><i class="ph ph-check"></i> Done</button>`}</td></tr>`;
  }).join("");
  const table = list.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Priority</th><th>Task</th><th>Case</th><th>For</th><th>Due</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="mw-empty"><i class="ph ph-check-circle"></i> Nothing here. ${MW.range === "pastdue" ? "Nothing is past due." : "Add a task above, or use a queue to make one from a case."}</div>`;
  return `<div class="mw-tiles">${tiles}</div>${form}${bar}${table}`;
}

function mwQueuesHtml() {
  const cards = MW_QUEUES.map(q => `<button type="button" class="mw-qcard${MW.queue === q.key ? " sel" : ""}" onclick="mwPickQueue('${q.key}')"><span class="mw-qn">${mwQueue(q.key).length}</span><span class="mw-ql">${q.label}</span></button>`).join("");
  const q = MW_QUEUES.find(x => x.key === MW.queue), opts = { field: MW.dateField, from: MW.from, to: MW.to };
  const rows = mwQueue(q.key, opts);
  const dateBar = `<div class="mw-dates"><label>Date field <select class="form-control" id="mw_dfield" onchange="mwApplyDates()"><option value="">Any date</option>${MW_DATE_FIELDS.map(f => `<option value="${f.key}"${MW.dateField === f.key ? " selected" : ""}>${f.label}</option>`).join("")}</select></label>
    <label>From <input class="form-control" type="date" id="mw_dfrom" value="${MW.from}" onchange="mwApplyDates()"></label><label>To <input class="form-control" type="date" id="mw_dto" value="${MW.to}" onchange="mwApplyDates()"></label>
    <button class="btn btn-sm btn-outline" style="width:auto;" onclick="mwClearDates()">Clear</button></div>`;
  const body = rows.length ? `<table class="data-table"><thead><tr><th>Case</th><th>Insured</th><th>Why it is here</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><a href="#" onclick="mwOpenCase('${mwEsc(r.sub.id)}'); return false;">${mwEsc(r.sub.id)}</a></td><td>${mwEsc(r.sub.insured)}</td><td>${mwEsc(r.why)}</td><td><button class="btn btn-xs btn-outline" style="width:auto;" onclick="mwTaskFromQueue('${mwEsc(r.sub.id)}', '${q.key}')"><i class="ph ph-list-plus"></i> Make a task</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="mw-empty"><i class="ph ph-check-circle"></i> Nothing in this queue${MW.dateField && (MW.from || MW.to) ? " for that date range" : ""}.</div>`;
  return `<div class="mw-qcards">${cards}</div><div class="card"><div class="card-header"><h3>${q.label}</h3><span class="badge badge-light">${rows.length}</span></div><div class="card-body"><p class="p1-sub" style="margin-bottom:10px;">${q.help} Worked out from the cases each time this page opens.</p>${dateBar}<div class="rules-table-container" style="max-height:none;">${body}</div></div></div>`;
}
function mwApplyDates() { MW.dateField = mwRead("mw_dfield"); MW.from = mwRead("mw_dfrom"); MW.to = mwRead("mw_dto"); mwRender(); }
function mwClearDates() { MW.dateField = ""; MW.from = ""; MW.to = ""; mwRender(); }

function mwRender() {
  const root = document.getElementById("myWorkRoot"); if (!root) return;
  const openN = mwVisibleTasks().filter(t => t.status === "open").length, qn = MW_QUEUES.reduce((n, q) => n + mwQueue(q.key).length, 0);
  root.innerHTML = `<div class="p1-head"><div><h2 class="p1-h" style="margin:0;">My Work</h2><div class="p1-sub" style="margin:0;">Tasks to chase and cases that need attention.</div></div></div>
    <div class="mw-tabs"><button class="tab-btn${MW.tab === "tasks" ? " active" : ""}" onclick="mwSwitchTab('tasks')"><i class="ph ph-check-square"></i> Tasks <span class="badge badge-light">${openN}</span></button>
      <button class="tab-btn${MW.tab === "queues" ? " active" : ""}" onclick="mwSwitchTab('queues')"><i class="ph ph-funnel"></i> Queues <span class="badge badge-light">${qn}</span></button></div>
    ${MW.tab === "tasks" ? mwTasksHtml() : mwQueuesHtml()}`;
}
