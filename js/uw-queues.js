/**
 * ============================================================================
 * WORK QUEUES AND SERVICE LEVELS: CAPACITY, BUSINESS HOURS AND ESCALATION
 * ----------------------------------------------------------------------------
 * Cases were handed out one at a time by the Head of Underwriting, and the response times were counted in calendar hours with nothing
 * done when one ran late. Three register records change that:
 *
 *   BUSINESS CALENDAR  working days, the hours of the working day, the time zone (as a UTC offset), and the holidays, optionally for one
 *                      state.
 *   SLA POLICY         the target hours to a first response, whether they are counted in business hours (on a calendar) or calendar
 *                      hours, and an escalation: after so many hours, tell a named role.
 *   QUEUE              who works it (roles, each with a capacity: the most open cases that person may hold), which cases it takes (line,
 *                      state, priority) and its SLA policy.
 *   ROUTING            a case is routed to the member of the matching queue with the fewest open cases who is under capacity; if everyone
 *                      is at capacity it waits in the queue unassigned and says so.
 *   SLA                routing starts the clock: the case records the policy, when it started and when it is due (counted on the
 *                      calendar). A sweep finds the cases past an escalation point and tells the role named, once each, and finds the
 *                      cases past their due date. The clock stops when the case is quoted, declined, closed or bound.
 * Each register is proposed by one person and put in force by a different one, is versioned, and starts empty. Nothing is routed until a
 * queue is registered.
 * ============================================================================
 */

const WQ_KEY = "FUT_UW_QUEUES_V1";
var WQ = { calendars: [], slas: [], queues: [], seq: 0 };
try { const r = JSON.parse(localStorage.getItem(WQ_KEY)); if (r && Array.isArray(r.queues)) WQ = Object.assign(WQ, r); } catch (e) { /* none yet */ }
function wqSave() { try { localStorage.setItem(WQ_KEY, JSON.stringify(WQ)); } catch (e) { /* keep for this session */ } }
function wqNew(p) { return p + "-" + (++WQ.seq); }
function wqRoles() { return typeof AUTH_ROLE_ORDER !== "undefined" ? AUTH_ROLE_ORDER : ["assistant", "junior", "senior_uw", "senior"]; }

// ----------------------------------------------------------------------------
// 1. THE REGISTERS
// ----------------------------------------------------------------------------
function wqCalValidate(c) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(c.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (!Array.isArray(c.workingDays) || !c.workingDays.length || c.workingDays.some(d => !(d >= 0 && d <= 6 && Number.isInteger(d)))) e.push("working days are numbers from 0 (Sunday) to 6");
  if (!(Number.isInteger(c.startHour) && c.startHour >= 0 && c.startHour < 24) || !(Number.isInteger(c.endHour) && c.endHour > c.startHour && c.endHour <= 24)) e.push("the working day starts and ends on whole hours, the end after the start");
  if (!(Number.isInteger(c.utcOffsetMinutes) && Math.abs(c.utcOffsetMinutes) <= 840)) e.push("the time zone is a UTC offset in minutes (for example -360)");
  if ((c.holidays || []).some(h => !/^\d{4}-\d{2}-\d{2}$/.test(h))) e.push("holidays are dates");
  return e;
}
function wqAddCalendar(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const c = { id: wqNew("BC"), code: String(f.code || "").trim(), version: 1, workingDays: f.workingDays, startHour: f.startHour, endHour: f.endHour, utcOffsetMinutes: f.utcOffsetMinutes, holidays: f.holidays || [], state: f.state || "*", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = wqCalValidate(c); if (WQ.calendars.some(x => x.code === c.code)) errs.push("a calendar with this code exists; start a new version of it");
  if (errs.length) { WQ.seq--; return { ok: false, error: "invalid", errors: errs }; }
  WQ.calendars.push(c); wqSave(); return { ok: true, calendar: c };
}
function wqSlaValidate(p) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(p.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (!(Number(p.targetHours) > 0)) e.push("the target is a number of hours above zero");
  if (p.businessHoursOnly && !p.calendarCode) e.push("business hours need a calendar");
  if (p.businessHoursOnly && p.calendarCode && !WQ.calendars.some(c => c.code === p.calendarCode)) e.push("that calendar is not registered");
  (p.escalation || []).forEach((s, i) => { if (!(Number(s.afterHours) > 0)) e.push("escalation " + (i + 1) + ": hours is above zero"); if (wqRoles().concat(["admin"]).indexOf(s.toRole) < 0) e.push("escalation " + (i + 1) + ": choose the role to tell"); });
  return e;
}
function wqAddSla(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const p = { id: wqNew("SP"), code: String(f.code || "").trim(), version: 1, targetHours: Number(f.targetHours), businessHoursOnly: !!f.businessHoursOnly, calendarCode: f.calendarCode || "", escalation: (f.escalation || []).map(s => ({ afterHours: Number(s.afterHours), toRole: s.toRole })), status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = wqSlaValidate(p); if (WQ.slas.some(x => x.code === p.code)) errs.push("a policy with this code exists; start a new version of it");
  if (errs.length) { WQ.seq--; return { ok: false, error: "invalid", errors: errs }; }
  WQ.slas.push(p); wqSave(); return { ok: true, sla: p };
}
function wqQueueValidate(q) {
  const e = [];
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(q.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  if (String(q.name || "").trim().length < 3) e.push("name the queue");
  if (!(q.members || []).length) e.push("a queue needs at least one member");
  (q.members || []).forEach(m => { if (wqRoles().indexOf(m.role) < 0) e.push("member " + m.role + ": choose an underwriter role"); if (!(Number.isInteger(m.capacity) && m.capacity >= 1)) e.push("member " + m.role + ": capacity is a whole number of 1 or more"); });
  if (q.slaCode && !WQ.slas.some(p => p.code === q.slaCode)) e.push("that SLA policy is not registered");
  return e;
}
function wqAddQueue(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const q = { id: wqNew("WQ"), code: String(f.code || "").trim(), version: 1, name: String(f.name || "").trim(), members: (f.members || []).map(m => ({ role: m.role, capacity: Number(m.capacity) })), lob: f.lob || "*", state: f.state || "*", priority: f.priority || "*", slaCode: f.slaCode || "", status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = wqQueueValidate(q); if (WQ.queues.some(x => x.code === q.code)) errs.push("a queue with this code exists; start a new version of it");
  if (errs.length) { WQ.seq--; return { ok: false, error: "invalid", errors: errs }; }
  WQ.queues.push(q); wqSave(); return { ok: true, queue: q };
}
function wqAct(kind, id, what) {
  const list = kind === "cal" ? WQ.calendars : kind === "sla" ? WQ.slas : WQ.queues, r = list.find(x => x.id === id); if (!r) return;
  const res = ucAct(list, r, what, wqNew(kind === "cal" ? "BC" : kind === "sla" ? "SP" : "WQ"));
  if (!res.ok && what === "newver") WQ.seq--;
  if (res.error !== "cancelled") ucToast(res, "Done.");
  wqSave(); ucRender();
}
function wqCalAct(id, what) { wqAct("cal", id, what); }
function wqSlaAct(id, what) { wqAct("sla", id, what); }
function wqQueueAct(id, what) { wqAct("queue", id, what); }
function wqCal(code) { return WQ.calendars.filter(c => c.code === code && c.status === "active").slice(-1)[0] || null; }
function wqSla(code) { return WQ.slas.filter(p => p.code === code && p.status === "active").slice(-1)[0] || null; }

// ----------------------------------------------------------------------------
// 2. BUSINESS-HOURS ARITHMETIC (the calendar's own time zone, as a UTC offset)
// ----------------------------------------------------------------------------
function wqLocal(ms, cal) { return new Date(ms + cal.utcOffsetMinutes * 60000); }
function wqIsWorkingDay(d, cal) { return cal.workingDays.indexOf(d.getUTCDay()) > -1 && cal.holidays.indexOf(d.toISOString().slice(0, 10)) < 0; }
/** The moment (ms) that is `hours` of working time after `startMs`. */
function wqAddWorkHours(startMs, hours, cal) {
  let left = hours * 3600000, t = startMs, guard = 0;
  while (left > 0 && guard++ < 4000) {
    const L = wqLocal(t, cal), dayStart = Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate()) - cal.utcOffsetMinutes * 60000;
    const open = dayStart + cal.startHour * 3600000, close = dayStart + cal.endHour * 3600000;
    if (!wqIsWorkingDay(L, cal) || t >= close) { t = dayStart + 86400000 + cal.startHour * 3600000; continue; }
    if (t < open) t = open;
    const room = close - t;
    if (left <= room) return t + left;
    left -= room; t = dayStart + 86400000 + cal.startHour * 3600000;
  }
  return t;
}
/** Working hours between two moments. */
function wqWorkHoursBetween(aMs, bMs, cal) {
  if (bMs <= aMs) return 0;
  let total = 0, t = aMs, guard = 0;
  while (t < bMs && guard++ < 4000) {
    const L = wqLocal(t, cal), dayStart = Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate()) - cal.utcOffsetMinutes * 60000;
    const open = dayStart + cal.startHour * 3600000, close = dayStart + cal.endHour * 3600000;
    if (wqIsWorkingDay(L, cal)) { const from = Math.max(t, open), to = Math.min(bMs, close); if (to > from) total += to - from; }
    t = dayStart + 86400000;
  }
  return total / 3600000;
}

// ----------------------------------------------------------------------------
// 3. ROUTING, SLA AND ESCALATION
// ----------------------------------------------------------------------------
function wqLoad(role) { return SUBMISSIONS_DATASET.filter(s => s.apiSourced && s.assignedTo === role && caseIsOpen(s)).length; }
function wqQueueFor(sub) {
  const st = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  const fit = WQ.queues.filter(q => q.status === "active" && ucScopeHas(q.lob, sub.lobKey) && (q.state === "*" || (st && ucScopeHas(q.state, st))) && (q.priority === "*" || q.priority === sub.priority));
  const score = q => (q.lob === "*" ? 0 : 1) + (q.state === "*" ? 0 : 1) + (q.priority === "*" ? 0 : 1);
  return fit.sort((a, b) => score(a) - score(b)).slice(-1)[0] || null;
}
function wqStartSla(sub, q, nowMs) {
  const pol = q && q.slaCode ? wqSla(q.slaCode) : null;
  if (!pol) return null;
  const cal = pol.businessHoursOnly ? wqCal(pol.calendarCode) : null, start = nowMs || Date.now();
  if (pol.businessHoursOnly && !cal) return null;
  const due = cal ? wqAddWorkHours(start, pol.targetHours, cal) : start + pol.targetHours * 3600000;
  sub.sla = { queue: q.code, policyCode: pol.code, policyVersion: pol.version, businessHours: !!cal, startedAt: new Date(start).toISOString(), dueAt: new Date(due).toISOString(), escalations: [] };
  return sub.sla;
}
/** Routes a case to the member with the fewest open cases who is under capacity; starts the SLA. */
function wqRoute(sub, nowMs) {
  if (!canManageAssignments() && !hasPermission("workflow", "approve")) { denyPermission("workflow", "approve"); return { ok: false, error: "permission" }; }
  const q = wqQueueFor(sub);
  if (!q) return { ok: false, error: "no_queue" };
  const open = q.members.map(m => ({ role: m.role, capacity: m.capacity, load: wqLoad(m.role) })).filter(m => m.load < m.capacity).sort((a, b) => (a.load / a.capacity) - (b.load / b.capacity) || a.load - b.load);
  sub.queue = q.code; sub.queuedAt = sub.queuedAt || new Date(nowMs || Date.now()).toISOString();
  if (!open.length) { logDecision(sub, sub.currentStep || 1, "queue_waiting", "Queue " + q.code + ": every member is at capacity (" + q.members.map(m => m.role + " " + wqLoad(m.role) + "/" + m.capacity).join(", ") + "). The case waits unassigned."); if (typeof persistAppState === "function") persistAppState(); return { ok: false, error: "at_capacity", queue: q }; }
  const pick = open[0];
  sub.assignedTo = pick.role; sub.assignedBy = ucActor(); sub.assignedAt = nowStamp();
  const sla = wqStartSla(sub, q, nowMs);
  logDecision(sub, sub.currentStep || 1, "queue_routed", "Routed by queue " + q.code + " to " + pick.role + " (" + pick.load + " of " + pick.capacity + " open)." + (sla ? " SLA " + sla.policyCode + " v" + sla.policyVersion + ": due " + sla.dueAt + (sla.businessHours ? " (business hours)." : " (calendar hours).") : ""));
  if (typeof persistAppState === "function") persistAppState();
  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
  return { ok: true, queue: q, role: pick.role, sla: sla };
}
function wqElapsed(sub, nowMs) {
  const s = sub.sla, start = Date.parse(s.startedAt), pol = wqSla(s.policyCode) || WQ.slas.filter(p => p.code === s.policyCode).slice(-1)[0], cal = s.businessHours && pol ? wqCal(pol.calendarCode) || WQ.calendars.filter(c => c.code === pol.calendarCode).slice(-1)[0] : null;
  return cal ? wqWorkHoursBetween(start, nowMs, cal) : (nowMs - start) / 3600000;
}
/** Finds cases past an escalation point or their due date. Tells each role once. Returns what it did. */
function wqSweep(nowMs) {
  const now = nowMs || Date.now(), done = { escalated: [], breached: [], completed: [] };
  SUBMISSIONS_DATASET.forEach(sub => {
    const s = sub.sla; if (!s || s.completedAt) return;
    const st = caseStatus(sub);
    if (["Quoted", "Pending Bind", "Bound", "Declined", "Closed"].indexOf(st) > -1) { s.completedAt = new Date(now).toISOString(); s.completedStatus = st; s.metSla = now <= Date.parse(s.dueAt); done.completed.push(sub.id); return; }
    const pol = WQ.slas.filter(p => p.code === s.policyCode && p.version === s.policyVersion)[0]; if (!pol) return;
    const el = wqElapsed(sub, now);
    pol.escalation.slice().sort((a, b) => a.afterHours - b.afterHours).forEach(step => {
      if (el >= step.afterHours && !s.escalations.some(x => x.afterHours === step.afterHours && x.toRole === step.toRole)) {
        s.escalations.push({ afterHours: step.afterHours, toRole: step.toRole, at: new Date(now).toISOString() });
        logDecision(sub, sub.currentStep || 1, "sla_escalated", "SLA " + pol.code + ": no response after " + step.afterHours + " " + (s.businessHours ? "business " : "") + "hour(s); " + step.toRole + " told.", "System (automatic)");
        if (typeof notify === "function") notify(step.toRole, { kind: "info", title: "SLA escalation: " + (sub.insured || sub.id), text: "No response after " + step.afterHours + " hour(s) (policy " + pol.code + ").", caseId: sub.id, key: "sla-" + sub.id + "-" + step.afterHours + "-" + step.toRole });
        done.escalated.push({ id: sub.id, toRole: step.toRole });
      }
    });
    if (now > Date.parse(s.dueAt) && !s.breachedAt) { s.breachedAt = new Date(now).toISOString(); logDecision(sub, sub.currentStep || 1, "sla_breached", "SLA " + pol.code + " breached: due " + s.dueAt + ".", "System (automatic)"); done.breached.push(sub.id); }
  });
  if (done.escalated.length || done.breached.length || done.completed.length) { if (typeof persistAppState === "function") persistAppState(); }
  return done;
}

// ----------------------------------------------------------------------------
// 4. SCREENS
// ----------------------------------------------------------------------------
function wqHtml() {
  const edit = ucCan("edit"), roleOpts = wqRoles().map(r => `<option value="${r}">${escHtml(typeof authRoleLabel === "function" ? authRoleLabel(r) : r)}</option>`).join("");
  const calForm = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-calendar"></i> New business calendar</summary><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="bc_code">Code</label><input class="form-control" id="bc_code"></div><div class="form-group"><label for="bc_days">Working days (0=Sun … 6=Sat)</label><input class="form-control" id="bc_days" placeholder="1,2,3,4,5"></div><div class="form-group"><label for="bc_s">Day starts (hour)</label><input class="form-control" id="bc_s"></div><div class="form-group"><label for="bc_e">Day ends (hour)</label><input class="form-control" id="bc_e"></div><div class="form-group"><label for="bc_tz">UTC offset (minutes)</label><input class="form-control" id="bc_tz" placeholder="-360"></div><div class="form-group mw-wide"><label for="bc_h">Holidays (dates, comma list)</label><input class="form-control" id="bc_h"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="wqAddCalUi()">Create draft</button></div></div></details>` : "";
  const slaForm = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-timer"></i> New SLA policy</summary><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="sp_code">Code</label><input class="form-control" id="sp_code"></div><div class="form-group"><label for="sp_h">Target hours</label><input class="form-control" id="sp_h"></div><div class="form-group"><label><input type="checkbox" id="sp_b"> Count business hours</label></div><div class="form-group"><label for="sp_cal">Calendar code</label><input class="form-control" id="sp_cal"></div><div class="form-group"><label for="sp_e1">Escalate after (hours)</label><input class="form-control" id="sp_e1"></div><div class="form-group"><label for="sp_r1">Tell</label><select class="form-control" id="sp_r1">${roleOpts}<option value="admin">Head of Underwriting</option></select></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="wqAddSlaUi()">Create draft</button></div></div></details>` : "";
  const qForm = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-users-three"></i> New work queue</summary><div class="card-body"><div class="mw-grid"><div class="form-group"><label for="wq_code">Code</label><input class="form-control" id="wq_code"></div><div class="form-group mw-wide"><label for="wq_name">Name</label><input class="form-control" id="wq_name"></div><div class="form-group"><label for="wq_m1">Member</label><select class="form-control" id="wq_m1">${roleOpts}</select></div><div class="form-group"><label for="wq_c1">Capacity</label><input class="form-control" id="wq_c1"></div><div class="form-group"><label for="wq_m2">Second member (optional)</label><select class="form-control" id="wq_m2"><option value="">None</option>${roleOpts}</select></div><div class="form-group"><label for="wq_c2">Capacity</label><input class="form-control" id="wq_c2"></div><div class="form-group"><label for="wq_lob">Line key (or all)</label><input class="form-control" id="wq_lob" placeholder="*"></div><div class="form-group"><label for="wq_state">States (or all)</label><input class="form-control" id="wq_state" placeholder="*"></div><div class="form-group"><label for="wq_pri">Priority (or all)</label><input class="form-control" id="wq_pri" placeholder="*"></div><div class="form-group"><label for="wq_sla">SLA policy code</label><input class="form-control" id="wq_sla"></div></div><div class="p1-actions"><button class="btn btn-primary" onclick="wqAddQueueUi()">Create draft</button></div></div></details>` : "";
  const calRows = WQ.calendars.slice().reverse().map(c => `<tr><td><strong>${escHtml(c.code)}</strong> v${c.version}</td><td>days ${c.workingDays.join(",")} · ${c.startHour}:00 to ${c.endHour}:00 · UTC${c.utcOffsetMinutes >= 0 ? "+" : ""}${c.utcOffsetMinutes}min${c.holidays.length ? " · " + c.holidays.length + " holiday(s)" : ""}</td><td>${ucStatusBadge(c.status)}</td><td>${ucActionsHtml("wqCalAct", c)}</td></tr>`).join("");
  const slaRows = WQ.slas.slice().reverse().map(p => `<tr><td><strong>${escHtml(p.code)}</strong> v${p.version}</td><td>${p.targetHours} ${p.businessHoursOnly ? "business hours on " + escHtml(p.calendarCode) : "calendar hours"}${p.escalation.length ? "<div class=\"p1-note\">" + p.escalation.map(s => "after " + s.afterHours + "h tell " + escHtml(s.toRole)).join("; ") + "</div>" : ""}</td><td>${ucStatusBadge(p.status)}</td><td>${ucActionsHtml("wqSlaAct", p)}</td></tr>`).join("");
  const qRows = WQ.queues.slice().reverse().map(q => `<tr><td><strong>${escHtml(q.code)}</strong> v${q.version}<div class="p1-note">${escHtml(q.name)}</div></td><td>${q.members.map(m => escHtml(m.role) + " " + wqLoad(m.role) + "/" + m.capacity).join(", ")}<div class="p1-note">line ${escHtml(ucListText(q.lob))} · state ${escHtml(ucListText(q.state))} · priority ${escHtml(q.priority)} · SLA ${escHtml(q.slaCode || "none")}</div></td><td>${ucStatusBadge(q.status)}</td><td>${ucActionsHtml("wqQueueAct", q)}</td></tr>`).join("");
  const tbl = (head, rows, empty) => rows ? `<div class="rules-table-container" style="max-height:none;margin-bottom:12px;"><table class="data-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">${empty}</div>`;
  return `<h3 class="p1-h" style="font-size:15px;margin:0 0 6px;">Work queues</h3>${qForm}${tbl(["Queue", "Members (open / capacity) and routing", "Status", ""], qRows, "No queue is registered; cases are assigned by hand.")}<h3 class="p1-h" style="font-size:15px;margin:12px 0 6px;">SLA policies</h3>${slaForm}${tbl(["Policy", "Target and escalation", "Status", ""], slaRows, "No SLA policy is registered.")}<h3 class="p1-h" style="font-size:15px;margin:12px 0 6px;">Business calendars</h3>${calForm}${tbl(["Calendar", "Working time", "Status", ""], calRows, "No business calendar is registered.")}`;
}
function wqAddCalUi() { const r = wqAddCalendar({ code: ucV("bc_code"), workingDays: ucV("bc_days").split(",").map(x => x.trim()).filter(x => x !== "").map(Number), startHour: ucV("bc_s") === "" ? NaN : Number(ucV("bc_s")), endHour: ucV("bc_e") === "" ? NaN : Number(ucV("bc_e")), utcOffsetMinutes: ucV("bc_tz") === "" ? NaN : Number(ucV("bc_tz")), holidays: ucV("bc_h").split(",").map(x => x.trim()).filter(Boolean) }); ucToast(r, "Draft created."); ucRender(); }
function wqAddSlaUi() { const r = wqAddSla({ code: ucV("sp_code"), targetHours: ucV("sp_h"), businessHoursOnly: !!(document.getElementById("sp_b") || {}).checked, calendarCode: ucV("sp_cal"), escalation: ucV("sp_e1") ? [{ afterHours: ucV("sp_e1"), toRole: ucV("sp_r1") }] : [] }); ucToast(r, "Draft created."); ucRender(); }
function wqAddQueueUi() { const m = [{ role: ucV("wq_m1"), capacity: ucV("wq_c1") === "" ? NaN : Number(ucV("wq_c1")) }]; if (ucV("wq_m2")) m.push({ role: ucV("wq_m2"), capacity: ucV("wq_c2") === "" ? NaN : Number(ucV("wq_c2")) }); const r = wqAddQueue({ code: ucV("wq_code"), name: ucV("wq_name"), members: m, lob: ucV("wq_lob") || "*", state: ucList(ucV("wq_state") || "*"), priority: ucV("wq_pri") || "*", slaCode: ucV("wq_sla") }); ucToast(r, "Draft created."); ucRender(); }
function wqCaseHtml(sub) {
  const q = wqQueueFor(sub), s = sub.sla, canRoute = (canManageAssignments() || hasPermission("workflow", "approve")) && !!q && !sub.assignedTo;
  const head = q ? `<div class="p1-note">Queue that takes this case: <strong>${escHtml(q.code)}</strong> (${q.members.map(m => escHtml(m.role) + " " + wqLoad(m.role) + "/" + m.capacity).join(", ")}).${sub.queue ? " On queue " + escHtml(sub.queue) + "." : ""}</div>` : '<div class="p1-note">No queue is registered for this case.</div>';
  const sla = s ? `<div class="p1-note">SLA ${escHtml(s.policyCode)} v${s.policyVersion}: started ${escHtml(s.startedAt)}, due ${escHtml(s.dueAt)} (${s.businessHours ? "business hours" : "calendar hours"})${s.completedAt ? "; stopped " + escHtml(s.completedAt) + " at " + escHtml(s.completedStatus) + (s.metSla ? " (met)" : " (missed)") : s.breachedAt ? "; BREACHED " + escHtml(s.breachedAt) : ""}.${s.escalations.map(e => " Escalated to " + escHtml(e.toRole) + " after " + e.afterHours + "h (" + escHtml(e.at) + ").").join("")}</div>` : "";
  return head + sla + (canRoute ? `<button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="wqRouteUi()">Route this case</button>` : "");
}
function wqRouteUi() { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = wqRoute(sub); showToast(r.ok ? "✅ Routed to " + r.role + "." : "⛔ " + ({ at_capacity: "Everyone on the queue is at capacity; the case waits.", no_queue: "No queue takes this case.", permission: "You do not have the right to route cases." }[r.error] || r.error), r.ok ? "success" : "warning"); if (typeof cfRender === "function") cfRender(); }
(function wqInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.queue_routed = m("Routed by Queue", "ph-users-three", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.queue_waiting = m("Waiting in Queue — At Capacity", "ph-hourglass", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.sla_escalated = m("SLA Escalation", "ph-bell-ringing", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.sla_breached = m("SLA Breached", "ph-alarm", "badge-danger", "outcome-decline");
  }
  // the sweep runs whenever a dashboard is drawn: it only acts on cases with a running SLA
  const dash = window.renderRoleDashboard;
  if (typeof dash === "function") window.renderRoleDashboard = function () { try { wqSweep(); } catch (e) { console.warn("SLA sweep failed:", e); } return dash.apply(this, arguments); };
})();
ucRegisterTab("queues", "Queues and SLA", "ph-users-three", wqHtml, () => WQ.queues.concat(WQ.slas, WQ.calendars).filter(x => x.status === "pending").length);
if (typeof urRegisterSection === "function") urRegisterSection("queue", "Work queue and SLA", wqCaseHtml);
