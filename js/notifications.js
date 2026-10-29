/**
 * ============================================================================
 * NOTIFICATIONS AND REMINDERS
 * ----------------------------------------------------------------------------
 * An in-app inbox. A notice is addressed to a role (David Chen's notices are the Senior Underwriter's), so whoever signs in as
 * that role finds it under the bell in the header, unread ones counted. A notice opens the case at the step it is about.
 *
 *   sent when                                                         to
 *   a case is referred                                                the person it is referred to (the Head of Underwriting when it goes to the carrier)
 *   a referral is decided (approved, returned or declined)            the person who raised it
 *   a case is assigned                                                the person it is assigned to
 *   documents arrive for a case (a message attached at triage)        the person the case is assigned to
 *   an MCS-90 is attached                                             the person the case is assigned to
 *
 * REMINDERS are worked out from the cases themselves each time the page is drawn and every minute: a case is AT RISK in the
 * last quarter of its SLA window (the last hour for a P1) and OVERDUE after it; a referral waiting more than 24 hours; a
 * BMC-91 / 91X filing past its due date. A reminder is sent once per case and state (so "overdue" is not repeated every minute).
 *
 * Notices are kept in this browser (localStorage) and survive a reload, but they do not travel between computers: there is no
 * server. They are not email or push messages.
 * ============================================================================
 */

const NOTIF_STORE_KEY = "FUT_NOTIFICATIONS_V1", NOTIF_MAX = 200, NOTIF_SLA_HOURS = { P1: 4, P2: 24, P3: 48, P4: 72 }, NOTIF_REFERRAL_HOURS = 24;
var NOTIFICATIONS = [];
try { const raw = localStorage.getItem(NOTIF_STORE_KEY); if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) NOTIFICATIONS = parsed; } } catch (e) { NOTIFICATIONS = []; }

function notifSave() { try { localStorage.setItem(NOTIF_STORE_KEY, JSON.stringify(NOTIFICATIONS.slice(-NOTIF_MAX))); } catch (e) { /* storage unavailable: keep them for this session */ } }
function notifEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s === null || s === undefined ? "" : s); }

/** Adds a notice for a role. A notice with the same key for the same role is not added twice. */
function notify(toRole, n) {
  if (!toRole || !n) return null;
  if (n.key && NOTIFICATIONS.some(x => x.to === toRole && x.key === n.key)) return null;
  const rec = { id: "N-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36), to: toRole, kind: n.kind || "info", title: n.title || "", text: n.text || "", caseId: n.caseId || null, key: n.key || null, at: new Date().toISOString(), read: false };
  NOTIFICATIONS.push(rec);
  if (NOTIFICATIONS.length > NOTIF_MAX) NOTIFICATIONS = NOTIFICATIONS.slice(-NOTIF_MAX);
  notifSave();
  notifRenderBell();
  return rec;
}
function notificationsFor(role) { return NOTIFICATIONS.map((n, i) => ({ n: n, i: i })).filter(x => x.n.to === role).sort((a, b) => b.n.at.localeCompare(a.n.at) || b.i - a.i).map(x => x.n); }
function notificationsUnread(role) { return NOTIFICATIONS.filter(n => n.to === role && !n.read).length; }
function notifClear() { NOTIFICATIONS = []; notifSave(); notifRenderBell(); }

const NOTIF_ICON = { referral: "ph-paper-plane-tilt", decision: "ph-stamp", assignment: "ph-user-plus", sla: "ph-alarm", documents: "ph-paperclip", filing: "ph-truck", info: "ph-info" };
function notifStep(n) { return n.kind === "referral" || n.kind === "decision" ? AUTH_STEP : n.kind === "filing" ? ISSUANCE_STEP : null; }
function notifAgo(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago";
}

// ----------------------------------------------------------------------------
// REMINDERS, worked out from the cases
// ----------------------------------------------------------------------------
function notifOpenCase(sub) {
  return sub.apiSourced && !["declined", "merged", "discarded"].includes(sub.lifecycleStatus) && !sub.quoteIssued && !(sub.pasSync && sub.pasSync.status === "success");
}
/** { due, hours, left, state } for a case's SLA: ok, risk (last quarter, or last hour for a P1) or overdue. Null when there is no clock to read. */
function notifSla(sub, now) {
  now = now || Date.now();
  const hours = NOTIF_SLA_HOURS[sub.priority], start = Number(sub.receivedTimestamp);
  if (!hours || !start) return null;
  const due = start + hours * 3600000, left = due - now;
  const riskAt = Math.max(hours * 3600000 * 0.25, sub.priority === "P1" ? 3600000 : 0);
  return { due: due, hours: hours, left: left, state: left < 0 ? "overdue" : left <= riskAt ? "risk" : "ok" };
}

function notificationsCheck(now) {
  now = now || Date.now();
  const fresh = [];
  SUBMISSIONS_DATASET.forEach(sub => {
    if (!sub.apiSourced) return;
    const label = sub.insured + " (" + sub.id + ")";
    if (notifOpenCase(sub) && sub.assignedTo) {
      const s = notifSla(sub, now);
      if (s && s.state === "risk") fresh.push(notify(sub.assignedTo, { kind: "sla", title: "SLA at risk: " + sub.insured, text: sub.priority + " case " + sub.id + " has " + Math.max(1, Math.round(s.left / 60000)) + " minute(s) left of its " + s.hours + "-hour clock.", caseId: sub.id, key: "sla-risk-" + sub.id }));
      if (s && s.state === "overdue") {
        fresh.push(notify(sub.assignedTo, { kind: "sla", title: "SLA overdue: " + sub.insured, text: sub.priority + " case " + sub.id + " is " + Math.round(-s.left / 3600000) + " hour(s) past its " + s.hours + "-hour clock.", caseId: sub.id, key: "sla-overdue-" + sub.id }));
        fresh.push(notify("admin", { kind: "sla", title: "SLA overdue: " + sub.insured, text: sub.priority + " case " + sub.id + ", assigned to " + ((USER_ROLES_CONFIG[sub.assignedTo] || {}).name || sub.assignedTo) + ".", caseId: sub.id, key: "sla-overdue-" + sub.id }));
      }
    }
    const ref = sub.authorityRef;
    if (ref && ref.status === "pending" && ref.requiredRole) {
      const raised = Date.parse(String(ref.raisedAt || "").replace(" ", "T") + "Z");
      if (!isNaN(raised) && now - raised > NOTIF_REFERRAL_HOURS * 3600000) {
        const key = "ref-wait-" + sub.id + "-" + ref.raisedAt;
        const msg = { kind: "referral", title: "Referral waiting over " + NOTIF_REFERRAL_HOURS + " h: " + sub.insured, text: label + " was referred to " + (typeof authRoleOwnerName === "function" ? authRoleOwnerName(ref.requiredRole) : ref.requiredRole) + " on " + ref.raisedAt + " and has no decision.", caseId: sub.id, key: key };
        fresh.push(notify(ref.requiredRole, msg)); fresh.push(notify("admin", msg));
      }
    }
    if (typeof ffStatus === "function" && (sub.lobKey || "trucking") === "trucking" && sub.pasSync && sub.pasSync.status === "success") {
      const f = ffStatus(sub);
      if (f.overdue) {
        const msg = { kind: "filing", title: "BMC-91 / 91X not filed: " + sub.insured, text: label + ": the filing was due " + f.due + " (" + f.daysLate + " day(s) late).", caseId: sub.id, key: "ff-overdue-" + sub.id };
        if (sub.assignedTo) fresh.push(notify(sub.assignedTo, msg)); fresh.push(notify("admin", msg));
      }
    }
  });
  const made = fresh.filter(Boolean);
  if (made.length) notifRenderBell();
  return made;
}

// ----------------------------------------------------------------------------
// THE BELL AND THE PANEL
// ----------------------------------------------------------------------------
function notifRenderBell() {
  const badge = document.getElementById("notifBadge"), btn = document.getElementById("btnNotifications");
  if (!btn) return;
  const n = typeof currentUserRole !== "undefined" ? notificationsUnread(currentUserRole) : 0;
  if (badge) { badge.textContent = n > 99 ? "99+" : String(n); badge.style.display = n ? "inline-flex" : "none"; }
  btn.title = n ? n + " unread notification" + (n === 1 ? "" : "s") : "Notifications";
  const panel = document.getElementById("notificationPanel");
  if (panel && panel.style.display !== "none") notifRenderPanel();
}

function notifRenderPanel() {
  let panel = document.getElementById("notificationPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "notificationPanel";
    panel.style.cssText = "display:none; position:fixed; top:56px; right:16px; width:380px; max-height:70vh; overflow:auto; background:#fff; color:#1f2933; border:1px solid #cbd5e1; border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,.25); z-index:2100;";
    document.body.appendChild(panel);
  }
  const list = notificationsFor(currentUserRole).slice(0, 40);
  panel.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid #e2e8f0;"><strong>Notifications</strong><span><button class="btn btn-outline btn-sm" onclick="notifMarkAllRead()">Mark all read</button> <button class="btn btn-outline btn-sm" onclick="toggleNotificationPanel(false)">Close</button></span></div>` +
    (list.length ? list.map(n => `<div onclick="notifOpen('${n.id}')" style="cursor:pointer; padding:10px 12px; border-bottom:1px solid #f1f5f9; ${n.read ? "" : "background:#fff7ed;"}"><div style="display:flex; gap:8px;"><i class="ph ${NOTIF_ICON[n.kind] || "ph-info"}" style="margin-top:2px;"></i><div style="flex:1;"><div style="font-weight:${n.read ? 500 : 700}; font-size:12.5px;">${notifEsc(n.title)}</div><div style="font-size:11.5px; color:#475569;">${notifEsc(n.text)}</div><div style="font-size:10.5px; color:#94a3b8; margin-top:2px;">${notifAgo(n.at)}${n.caseId ? " · " + notifEsc(n.caseId) : ""}</div></div></div></div>`).join("")
      : `<div style="padding:18px 12px; font-size:12px; color:#64748b;">Nothing for you yet. Referrals to you, decisions on referrals you sent, assignments and SLA reminders appear here.</div>`);
}

function toggleNotificationPanel(open) {
  notificationsCheck();
  notifRenderPanel();
  const panel = document.getElementById("notificationPanel");
  const show = typeof open === "boolean" ? open : panel.style.display === "none";
  panel.style.display = show ? "block" : "none";
  notifRenderBell();
}
function notifMarkAllRead() { NOTIFICATIONS.forEach(n => { if (n.to === currentUserRole) n.read = true; }); notifSave(); notifRenderPanel(); notifRenderBell(); }
function notifOpen(id) {
  const n = NOTIFICATIONS.find(x => x.id === id); if (!n) return;
  n.read = true; notifSave(); notifRenderBell();
  toggleNotificationPanel(false);
  const sub = n.caseId ? SUBMISSIONS_DATASET.find(s => s.id === n.caseId) : null;
  if (!sub) { showToast("That case is not in this session.", "warning"); return; }
  if (typeof selectSubmission === "function") selectSubmission(sub.id, false);
  const step = notifStep(n) || sub.currentStep || 1;
  showWorkflowPage(Math.min(step, ISSUANCE_STEP));
}

(function notifWire() {
  // the dashboards are redrawn whenever the role or the cases change: redraw the bell and look for reminders then
  const origDash = window.renderRoleDashboard;
  if (typeof origDash === "function") {
    window.renderRoleDashboard = function () {
      const r = origDash.apply(this, arguments);
      try { notificationsCheck(); notifRenderBell(); } catch (e) { console.warn("Notifications failed:", e); }
      return r;
    };
  }
  if (typeof setInterval === "function") setInterval(() => { try { if (typeof appInitialised !== "undefined" && appInitialised) notificationsCheck(); } catch (e) { /* not ready */ } }, 60000);
  document.addEventListener("click", ev => {
    const panel = document.getElementById("notificationPanel"); if (!panel || panel.style.display === "none") return;
    if (!panel.contains(ev.target) && !ev.target.closest("#btnNotifications")) panel.style.display = "none";
  });
})();

window.notify = notify; window.notificationsFor = notificationsFor; window.notificationsUnread = notificationsUnread; window.notificationsCheck = notificationsCheck;
window.notifSla = notifSla; window.toggleNotificationPanel = toggleNotificationPanel; window.notifMarkAllRead = notifMarkAllRead; window.notifOpen = notifOpen; window.notifClear = notifClear; window.notifRenderBell = notifRenderBell;
