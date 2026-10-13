/**
 * ============================================================================
 * SUBJECTIVITIES: PRE-BIND AND POST-BIND, WITH DUE DATES AND GATING (Add-On) — G14
 * ----------------------------------------------------------------------------
 * A subjectivity is a condition attached to a quote or binder. Two kinds:
 *
 *   PRE-BIND   must be received AND accepted before the policy is bound.
 *   POST-BIND  may be bound without, but is due by a date; the clock starts at
 *              bind (30 days unless the item says otherwise). An item that is
 *              still open after its due date is flagged overdue — the carrier
 *              may cancel the policy for it.
 *
 * Each item moves: open -> received (with a reference) -> accepted by an
 * underwriter, or it is waived (reason required) by someone with authority.
 * Receiving and accepting are separate steps and, by default, separate people.
 *
 * What this replaces: the prototype stored subjectivities as bare strings,
 * labelled every one "Pre-Bind", ticked every box by default and enforced
 * nothing; the quote screen also showed a hard-coded list. The structured items
 * live in sub.subjectivityItems; sub.subjectivities (the strings the quote
 * document, ACORD view and issue-quote email read) is kept as a mirror of the
 * items that are still outstanding, so those screens keep working.
 *
 * Bind gate: open, received-but-unaccepted pre-bind items block the real bind
 * ("Bind & Sync to PAS"). They do NOT block issuing the quote: the quote has to
 * go out with its conditions listed so that they can be satisfied. Post-bind
 * items never block, but are tracked, and their clock starts when the policy is
 * bound.
 * ============================================================================
 */

var SUBJ_DEFAULT_POST_BIND_DAYS = 30;
var SUBJ_REQUIRE_SEPARATE_ACCEPTER = true;   // the person who recorded receipt cannot also accept it

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function subjIso(d) { return d.toISOString().slice(0, 10); }
function subjAddDays(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(n)); return subjIso(d); }

/** Guess timing from the wording of an existing free-text subjectivity. */
function subjParse(text) {
  const t = String(text || "");
  const pre = /(prior to|before)\s+(bind|binding)|pre-?bind/i.test(t);
  const m = t.match(/within\s+(\d+)\s+days?/i);
  if (m && !pre) return { timing: "post_bind", dueDays: Number(m[1]) };
  return { timing: "pre_bind", dueDays: null };
}

function subjIsDone(i) { return i.status === "accepted" || i.status === "waived"; }

function subjEvaluate(items, today) {
  const pre = items.filter(i => i.timing === "pre_bind");
  const post = items.filter(i => i.timing === "post_bind");
  const preBlocking = pre.filter(i => !subjIsDone(i));
  const postOpen = post.filter(i => !subjIsDone(i));
  const overdue = items.filter(i => !subjIsDone(i) && i.status === "open" && (i.timing === "post_bind" ? i.dueDate : i.neededBy) && (i.timing === "post_bind" ? i.dueDate : i.neededBy) < today);
  const awaitingReview = items.filter(i => i.status === "received");
  return { pre, post, preBlocking, postOpen, overdue, awaitingReview, blocked: preBlocking.length > 0 };
}

function subjMirrorText(i) {
  if (i.timing === "pre_bind") return i.text;
  return `${i.text} (within ${i.dueDays || SUBJ_DEFAULT_POST_BIND_DAYS} days of binding${i.dueDate ? ", due " + i.dueDate : ""})`;
}

// ----------------------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------------------
function subjSub(id) { return SUBMISSIONS_DATASET.find(s => s.id === id) || null; }
function subjActiveSub() { return subjSub(typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null); }
function subjNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function subjActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function subjEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function subjLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 4, decision, by: subjActor(), at: subjNow(), notes });
}
function subjPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}

function subjNewItem(sub, f) {
  const items = sub.subjectivityItems;
  const n = items.reduce((m, i) => Math.max(m, Number(String(i.id).replace(/\D/g, "")) || 0), 0) + 1;
  const parsed = f.timing ? { timing: f.timing, dueDays: f.dueDays || null } : subjParse(f.text);
  const item = {
    id: "SJ-" + n, text: String(f.text).trim(), timing: parsed.timing,
    dueDays: parsed.timing === "post_bind" ? (parsed.dueDays || SUBJ_DEFAULT_POST_BIND_DAYS) : null,
    dueDate: null, neededBy: f.neededBy || null, status: "open", source: f.source || "manual",
    createdBy: f.createdBy || subjActor(), createdAt: subjNow()
  };
  if (item.timing === "post_bind" && sub.subjectivityBindDate) item.dueDate = subjAddDays(sub.subjectivityBindDate, item.dueDays);
  items.push(item);
  return item;
}

/** Builds the structured list from the legacy string list, and imports strings added by older code. */
function ensureSubjectivityItems(sub) {
  if (!Array.isArray(sub.subjectivityItems)) {
    sub.subjectivityItems = [];
    (sub.subjectivities || []).forEach(s => subjNewItem(sub, { text: s, source: "existing", createdBy: "Imported from submission" }));
  } else {
    const known = sub._subjMirror || [];
    (sub.subjectivities || []).forEach(s => {
      if (known.indexOf(s) === -1 && !sub.subjectivityItems.some(i => i.text === s || subjMirrorText(i) === s)) {
        subjNewItem(sub, { text: s, source: "imported", createdBy: "Imported from submission" });
      }
    });
  }
  subjSync(sub);
  return sub.subjectivityItems;
}

/** Keeps the legacy string array (read by the quote document, ACORD view and email) in step. */
function subjSync(sub) {
  const mirror = sub.subjectivityItems.filter(i => !subjIsDone(i)).map(subjMirrorText);
  if (!Array.isArray(sub.subjectivities)) sub.subjectivities = [];
  sub.subjectivities.length = 0;
  mirror.forEach(m => sub.subjectivities.push(m));
  sub._subjMirror = mirror.slice();
}

function subjStatus(sub, today) {
  return subjEvaluate(ensureSubjectivityItems(sub), today || subjIso(new Date()));
}

/** Logs a change in the set of overdue items (once per change). */
function subjCheckOverdue(sub) {
  const st = subjStatus(sub);
  const key = st.overdue.map(i => i.id).sort().join(",");
  if (key !== (sub._subjOverdueKey || "")) {
    if (st.overdue.length) subjLog(sub, "subjectivity_overdue", `${st.overdue.length} overdue: ${st.overdue.map(i => `${i.text} (due ${i.timing === "post_bind" ? i.dueDate : i.neededBy})`).join("; ")}. Consider a cancellation review for open post-bind items.`);
    sub._subjOverdueKey = key;
    subjPersist();
  }
  return st;
}

/** Starts the post-bind clock when the quote is issued and bound. */
function startPostBindClock(sub, today) {
  const items = ensureSubjectivityItems(sub);
  const day = today || subjIso(new Date());
  sub.subjectivityBindDate = day;
  const started = [];
  items.forEach(i => {
    if (i.timing === "post_bind" && !i.dueDate && !subjIsDone(i)) {
      i.dueDate = subjAddDays(day, i.dueDays || SUBJ_DEFAULT_POST_BIND_DAYS);
      started.push(`${i.text} — due ${i.dueDate}`);
    }
  });
  if (started.length) subjLog(sub, "subjectivity_clock_started", `Bound ${day}. Post-bind clock started for ${started.length} item(s): ${started.join("; ")}.`);
  subjSync(sub);
  subjPersist();
}

// ----------------------------------------------------------------------------
// 3. ACTIONS (host = which screen's inputs to read: "wb" workbench, "qb" quote & bind)
// ----------------------------------------------------------------------------
function subjNote(id, host) { const el = document.getElementById(`sj_note_${host}_${id}`); return el ? el.value.trim() : ""; }

function subjFind(sub, id) { return ensureSubjectivityItems(sub).find(i => i.id === id) || null; }

function subjAfter(sub, host) {
  subjSync(sub);
  subjPersist();
  renderSubjectivityViews(sub);
  // keep the bind panel's banners in step
  if (typeof renderStep7View === "function" && sub.id === (typeof activeSubmissionId !== "undefined" ? activeSubmissionId : null)) {
    try { renderStep7View(sub); } catch (e) { /* screen not mounted */ }
  }
}

function subjReceive(id, host) {
  const sub = subjActiveSub(); if (!sub) return;
  if (!hasPermission("subjectivities", "edit")) { denyPermission("subjectivities", "edit"); return; }
  const i = subjFind(sub, id); if (!i || i.status !== "open") return;
  const ref = subjNote(id, host);
  if (ref.length < 3) { showToast("Enter the reference of what was received (document name, email id).", "danger"); return; }
  i.status = "received"; i.receivedBy = subjActor(); i.receivedAt = subjNow(); i.evidence = ref; i.returnedNote = null;
  subjLog(sub, "subjectivity_received", `Received: "${i.text}" — ${ref}. Awaiting underwriter acceptance.`);
  subjAfter(sub, host);
  showToast("Receipt recorded. An underwriter must accept it.", "info");
}

function subjAccept(id, host) {
  const sub = subjActiveSub(); if (!sub) return;
  if (!hasPermission("subjectivities", "approve")) { denyPermission("subjectivities", "approve"); return; }
  const i = subjFind(sub, id); if (!i || i.status !== "received") return;
  if (SUBJ_REQUIRE_SEPARATE_ACCEPTER && i.receivedBy === subjActor()) { showToast("⛔ The person who recorded receipt cannot also accept it. Ask another underwriter.", "danger"); return; }
  i.status = "accepted"; i.acceptedBy = subjActor(); i.acceptedAt = subjNow();
  subjLog(sub, "subjectivity_accepted", `Accepted: "${i.text}" (${i.evidence}).`);
  subjAfter(sub, host);
  showToast("Subjectivity accepted.", "success");
}

function subjReturn(id, host) {
  const sub = subjActiveSub(); if (!sub) return;
  if (!hasPermission("subjectivities", "approve")) { denyPermission("subjectivities", "approve"); return; }
  const i = subjFind(sub, id); if (!i || i.status !== "received") return;
  const note = subjNote(id, host);
  if (note.length < 5) { showToast("Say why it is not acceptable (at least 5 characters).", "danger"); return; }
  i.status = "open"; i.returnedNote = note;
  subjLog(sub, "subjectivity_returned", `Not acceptable: "${i.text}" (${i.evidence}) — ${note}. Back to open.`);
  subjAfter(sub, host);
  showToast("Returned to open.", "warning");
}

function subjWaive(id, host) {
  const sub = subjActiveSub(); if (!sub) return;
  if (!hasPermission("subjectivities", "override")) { denyPermission("subjectivities", "override"); return; }
  const i = subjFind(sub, id); if (!i || subjIsDone(i)) return;
  const reason = subjNote(id, host);
  if (reason.length < 10) { showToast("A written reason (at least 10 characters) is required to waive a subjectivity.", "danger"); return; }
  i.status = "waived"; i.waivedBy = subjActor(); i.waivedAt = subjNow(); i.waivedReason = reason;
  subjLog(sub, "subjectivity_waived", `Waived (${i.timing === "pre_bind" ? "pre-bind" : "post-bind"}): "${i.text}" — ${reason}`);
  subjAfter(sub, host);
  showToast("Subjectivity waived and logged.", "success");
}

function subjReopen(id, host) {
  const sub = subjActiveSub(); if (!sub) return;
  if (!hasPermission("subjectivities", "override")) { denyPermission("subjectivities", "override"); return; }
  const i = subjFind(sub, id); if (!i || !subjIsDone(i)) return;
  const reason = subjNote(id, host);
  if (reason.length < 5) { showToast("Give a reason for reopening (at least 5 characters).", "danger"); return; }
  const was = i.status;
  i.status = "open"; i.acceptedBy = i.acceptedAt = i.waivedBy = i.waivedAt = i.waivedReason = null;
  subjLog(sub, "subjectivity_reopened", `Reopened (was ${was}): "${i.text}" — ${reason}`);
  subjAfter(sub, host);
}

// --- add dialog
function subjOpenAddDialog() {
  const sub = subjActiveSub(); if (!sub) return;
  if (!hasPermission("subjectivities", "edit")) { denyPermission("subjectivities", "edit"); return; }
  let m = document.getElementById("subjectivityAddModal");
  if (!m) {
    m = document.createElement("div");
    m.id = "subjectivityAddModal"; m.className = "modal-overlay";
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <div class="modal-content modal-lg">
      <div class="modal-header">
        <div class="u-row-gap10"><i class="ph ph-list-plus text-primary u-fs-22"></i>
          <div><h3 class="u-title-16">Add Subjectivity</h3><p class="text-xs text-muted u-m0">${subjEsc(sub.id)} — ${subjEsc(sub.insured || "")}</p></div></div>
        <button class="btn-close" aria-label="Close" onclick="subjCloseAddDialog()"><i class="ph ph-x"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group mb-3"><label class="u-label-sm">Condition <span class="u-text-danger">*</span></label>
          <textarea id="sjAddText" class="form-control" rows="3" placeholder="e.g. Receipt of signed statement of no known losses."></textarea></div>
        <div class="form-group mb-3"><label class="u-label-sm">When is it needed?</label>
          <select id="sjAddTiming" class="form-control" onchange="subjToggleAddFields()">
            <option value="pre_bind">Before binding (must be received and accepted to bind)</option>
            <option value="post_bind">After binding (due by a date; may be bound without it)</option>
          </select></div>
        <div id="sjAddPre" class="form-group mb-3"><label class="u-label-sm">Needed by (optional)</label><input id="sjAddNeededBy" type="date" class="form-control" style="width:200px;"></div>
        <div id="sjAddPost" class="form-group mb-3" style="display:none;"><label class="u-label-sm">Due within (days after bind)</label>
          <input id="sjAddDays" type="number" min="1" max="180" class="form-control" style="width:140px;" value="${SUBJ_DEFAULT_POST_BIND_DAYS}"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="subjCloseAddDialog()">Cancel</button>
        <button class="btn btn-primary" onclick="subjSubmitAdd()"><i class="ph ph-plus"></i> Add subjectivity</button>
      </div>
    </div>`;
  m.style.display = "flex";
}
function subjCloseAddDialog() { const m = document.getElementById("subjectivityAddModal"); if (m) m.style.display = "none"; }
function subjToggleAddFields() {
  const post = (document.getElementById("sjAddTiming") || {}).value === "post_bind";
  const a = document.getElementById("sjAddPre"), b = document.getElementById("sjAddPost");
  if (a) a.style.display = post ? "none" : "block";
  if (b) b.style.display = post ? "block" : "none";
}
function subjSubmitAdd() {
  const sub = subjActiveSub(); if (!sub) return;
  if (!hasPermission("subjectivities", "edit")) { denyPermission("subjectivities", "edit"); return; }
  const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  const text = val("sjAddText"), timing = val("sjAddTiming") || "pre_bind";
  const days = Number(val("sjAddDays")), neededBy = val("sjAddNeededBy");
  const problems = [];
  if (text.length < 10) problems.push("describe the condition (at least 10 characters)");
  if (timing === "post_bind" && (!(days >= 1) || days > 180)) problems.push("enter days after bind between 1 and 180");
  if (timing === "pre_bind" && neededBy && neededBy < subjIso(new Date())) problems.push("the needed-by date is in the past");
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }
  ensureSubjectivityItems(sub);
  const item = subjNewItem(sub, { text, timing, dueDays: timing === "post_bind" ? days : null, neededBy: timing === "pre_bind" ? neededBy : null });
  subjLog(sub, "subjectivity_added", `${timing === "pre_bind" ? "Pre-bind" : `Post-bind (within ${item.dueDays} days)`}: ${text}`);
  subjCloseAddDialog();
  subjAfter(sub, "wb");
  showToast("Subjectivity added.", "success");
}

// ----------------------------------------------------------------------------
// 4. RENDERING
// ----------------------------------------------------------------------------
var SUBJ_STATUS_UI = {
  open: { badge: "badge-warning", label: "Open" }, received: { badge: "badge-info", label: "Received — awaiting acceptance" },
  accepted: { badge: "badge-success", label: "Accepted" }, waived: { badge: "badge-light", label: "Waived" }
};

function subjDueText(i, today) {
  if (i.timing === "pre_bind") return i.neededBy ? `Needed by ${i.neededBy}` : "Before binding";
  if (i.dueDate) return (i.status === "open" && i.dueDate < today ? "OVERDUE — due " : "Due ") + i.dueDate;
  return `Due ${i.dueDays || SUBJ_DEFAULT_POST_BIND_DAYS} days after bind`;
}

/**
 * One board, two views. The Quote & Bind screen ("qb") is where subjectivities are tracked: received, accepted, waived,
 * reopened. The Underwriting Workbench ("wb") is where conditions are set while the risk is reviewed, so it shows the
 * list (with Add) and points to Quote & Bind for tracking, instead of repeating the tracking controls in two places.
 */
function subjBoardHtml(sub, host) {
  const compact = host === "wb";
  const today = subjIso(new Date());
  const items = ensureSubjectivityItems(sub);
  const st = subjEvaluate(items, today);
  const canEdit = hasPermission("subjectivities", "edit");
  const canAccept = hasPermission("subjectivities", "approve");
  const canWaive = hasPermission("subjectivities", "override");

  const row = i => {
    const ui = SUBJ_STATUS_UI[i.status];
    const overdue = st.overdue.includes(i);
    let facts = "";
    if (i.status === "received") facts = `Received ${subjEsc(i.receivedAt)} by ${subjEsc(i.receivedBy)} — ${subjEsc(i.evidence)}`;
    if (i.status === "accepted") facts = `Accepted ${subjEsc(i.acceptedAt)} by ${subjEsc(i.acceptedBy)} (${subjEsc(i.evidence)})`;
    if (i.status === "waived") facts = `Waived ${subjEsc(i.waivedAt)} by ${subjEsc(i.waivedBy)}: ${subjEsc(i.waivedReason)}`;
    if (i.status === "open" && i.returnedNote) facts = `Returned: ${subjEsc(i.returnedNote)}`;

    const noteInput = `<input id="sj_note_${host}_${i.id}" class="form-control" style="width:230px; display:inline-block;" placeholder="Reference, or reason">`;
    const b = (fn, label, cls, perm) => perm ? `<button class="btn btn-xs ${cls}" style="width:auto;" onclick="${fn}('${i.id}','${host}')">${label}</button>` : "";
    let actions = "";
    if (compact) actions = "";
    else if (i.status === "open") actions = (canEdit || canWaive) ? `${noteInput} ${b("subjReceive", "Mark received", "btn-primary", canEdit)} ${b("subjWaive", "Waive", "btn-outline", canWaive)}` : "";
    else if (i.status === "received") actions = (canAccept || canWaive) ? `${noteInput} ${b("subjAccept", "Accept", "btn-success", canAccept)} ${b("subjReturn", "Not acceptable", "btn-outline-danger", canAccept)} ${b("subjWaive", "Waive", "btn-outline", canWaive)}` : "";
    else actions = canWaive ? `${noteInput} ${b("subjReopen", "Reopen", "btn-outline", canWaive)}` : "";

    return `<div style="border:1px solid ${overdue ? "#fecaca" : "#e2e8f0"}; background:${overdue ? "#fef2f2" : "#fff"}; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between;">
        <div style="flex:1; min-width:260px;">
          <span class="badge ${i.timing === "pre_bind" ? "badge-warning" : "badge-primary"} text-xs">${i.timing === "pre_bind" ? "Pre-bind" : "Post-bind"}</span>
          <span style="font-size:13px; margin-left:6px;">${subjEsc(i.text)}</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="text-xs ${overdue ? "text-danger" : "text-muted"}" style="font-size:12px; ${overdue ? "font-weight:700;" : ""}">${subjEsc(subjDueText(i, today))}</span>
          <span class="badge ${ui.badge} text-xs">${subjEsc(ui.label)}</span>
        </div>
      </div>
      ${facts ? `<div class="text-xs text-muted" style="margin-top:4px; font-size:12px;">${facts}</div>` : ""}
      ${actions ? `<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">${actions}</div>` : ""}
    </div>`;
  };

  const preDone = st.pre.length - st.preBlocking.length;
  const summary = `<div style="display:flex; flex-wrap:wrap; gap:14px; font-size:12.5px; margin-bottom:10px;">
      <span><strong>Pre-bind:</strong> ${preDone} of ${st.pre.length} cleared${st.blocked ? ` <span class="badge badge-danger text-xs">blocks bind</span>` : ""}</span>
      <span><strong>Post-bind:</strong> ${st.postOpen.length} open${st.overdue.some(i => i.timing === "post_bind") ? ` <span class="badge badge-danger text-xs">${st.overdue.filter(i => i.timing === "post_bind").length} overdue</span>` : ""}</span>
      ${st.awaitingReview.length ? `<span><strong>${st.awaitingReview.length}</strong> awaiting acceptance</span>` : ""}
      ${sub.subjectivityBindDate ? `<span class="text-muted">Bound ${subjEsc(sub.subjectivityBindDate)}</span>` : ""}
    </div>`;
  const ordered = items.slice().sort((a, b) => (a.timing === b.timing ? 0 : (a.timing === "pre_bind" ? -1 : 1)));
  const note = compact ? `<div class="text-xs text-muted" style="margin-top:6px;"><i class="ph ph-info"></i> Receipt, acceptance and waiver are tracked on the Quote &amp; Bind screen.</div>` : "";
  return summary + (ordered.length ? ordered.map(row).join("") : `<div class="text-muted text-xs">No subjectivities on this submission.</div>`) + note;
}

function renderSubjectivityViews(sub) {
  const wb = document.getElementById("subjectivityList");
  if (wb && sub && sub.id === (typeof activeSubmissionId !== "undefined" ? activeSubmissionId : sub.id)) wb.innerHTML = subjBoardHtml(sub, "wb");
  const qb = document.getElementById("subjectivitiesContainer");
  if (qb && sub) {
    qb.innerHTML = `<div class="card" style="margin-bottom:16px;">
      <div class="card-header"><h3><i class="ph ph-clipboard-text"></i> Subjectivities &amp; Bind Conditions</h3>
        ${subjStatus(sub).blocked ? '<span class="badge badge-danger">Blocks bind</span>' : '<span class="badge badge-success">Clear to bind</span>'}</div>
      <div class="card-body">${subjBoardHtml(sub, "qb")}
        <div style="margin-top:6px;"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="addNewSubjectivity()"><i class="ph ph-plus"></i> Add subjectivity</button></div>
      </div></div>`;
  }
}

/** Replaces the hard-coded list inside the generated quote. */
function renderSubjectivitiesQuoteList(sub) {
  const items = ensureSubjectivityItems(sub).filter(i => !subjIsDone(i));
  if (!items.length) return `<div>No open subjectivities. All conditions have been accepted or waived.</div>`;
  const pre = items.filter(i => i.timing === "pre_bind"), post = items.filter(i => i.timing === "post_bind");
  const li = i => `<li>${subjEsc(i.text)}${i.timing === "post_bind" ? ` <em>(within ${i.dueDays || SUBJ_DEFAULT_POST_BIND_DAYS} days of binding${i.dueDate ? ", due " + subjEsc(i.dueDate) : ""})</em>` : ""}</li>`;
  return (pre.length ? `<div style="font-weight:700;">Before binding</div><ul style="margin:2px 0 8px; padding-left:18px; line-height:1.5;">${pre.map(li).join("")}</ul>` : "") +
         (post.length ? `<div style="font-weight:700;">After binding</div><ul style="margin:2px 0 0; padding-left:18px; line-height:1.5;">${post.map(li).join("")}</ul>` : "");
}

function renderSubjectivitiesBindBanner(sub, stage) {
  if (!sub) return "";
  const st = subjStatus(sub);
  if (st.blocked && stage === "quote") return `<div class="alert alert-warning text-xs" style="margin-bottom:12px;"><i class="ph ph-clipboard-text"></i> ${st.preBlocking.length} pre-bind subjectivity item(s) are open. The quote can be issued with them listed, but the policy cannot be bound until each is received and accepted (or waived).</div>`;
  if (st.blocked) return `<div class="alert alert-danger text-xs" style="margin-bottom:12px;"><i class="ph ph-prohibit"></i> <strong>Bind blocked.</strong> ${st.preBlocking.length} pre-bind subjectivity item(s) must be received and accepted (or waived): ${subjEsc(st.preBlocking.map(i => i.text).join("; "))}</div>`;
  const od = st.overdue.filter(i => i.timing === "post_bind");
  if (od.length) return `<div class="alert alert-warning text-xs" style="margin-bottom:12px;"><i class="ph ph-warning"></i> ${od.length} post-bind subjectivity item(s) are overdue. The carrier may cancel for non-compliance; consider a cancellation review.</div>`;
  return `<div class="alert alert-success text-xs" style="margin-bottom:12px;"><i class="ph ph-clipboard-text"></i> Pre-bind subjectivities are clear.${st.postOpen.length ? ` ${st.postOpen.length} post-bind item(s) will be tracked after binding.` : ""}</div>`;
}

// ----------------------------------------------------------------------------
// 5. HOOKS
// ----------------------------------------------------------------------------
function subjectivitiesGuardBind(source, subId) {
  const sub = subId ? subjSub(subId) : subjActiveSub();
  if (!sub) return true;
  const st = subjCheckOverdue(sub);
  if (!st.blocked) return true;
  subjLog(sub, "subjectivity_bind_blocked", `Bind attempt blocked (${source}): ${st.preBlocking.length} pre-bind item(s) not yet accepted or waived — ${st.preBlocking.map(i => i.text).join("; ")}.`);
  subjPersist();
  showToast(`⛔ Bind blocked: ${st.preBlocking.length} pre-bind subjectivity item(s) are not yet accepted. See Subjectivities on Quote & Bind.`, "danger");
  renderSubjectivityViews(sub);
  return false;
}

(function installSubjectivityHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.subjectivity_received = m("Subjectivity Received", "ph-tray-arrow-down", "badge-info", "outcome-comm");
    AUDIT_ACTION_META.subjectivity_accepted = m("Subjectivity Accepted", "ph-check-circle", "badge-success", "outcome-approve");
    AUDIT_ACTION_META.subjectivity_returned = m("Subjectivity Not Acceptable", "ph-arrow-counter-clockwise", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.subjectivity_waived = m("Subjectivity Waived", "ph-seal-check", "badge-info", "outcome-approve");
    AUDIT_ACTION_META.subjectivity_reopened = m("Subjectivity Reopened", "ph-arrow-counter-clockwise", "badge-light", "outcome-comm");
    AUDIT_ACTION_META.subjectivity_clock_started = m("Post-Bind Clock Started", "ph-timer", "badge-primary", "outcome-bind");
    AUDIT_ACTION_META.subjectivity_overdue = m("Subjectivity Overdue", "ph-warning-circle", "badge-danger", "outcome-refer");
    AUDIT_ACTION_META.subjectivity_bind_blocked = m("Bind Blocked — Subjectivities", "ph-prohibit", "badge-danger", "outcome-decline");
  }

  // Workbench list: the original renderer only knew bare strings
  window.renderSubjectivities = function (subjs) {
    const sub = SUBMISSIONS_DATASET.find(s => s.subjectivities === subjs) || subjActiveSub();
    if (!sub) return;
    ensureSubjectivityItems(sub);
    const wb = document.getElementById("subjectivityList");
    if (wb) wb.innerHTML = subjBoardHtml(sub, "wb");
  };
  window.addNewSubjectivity = function () { subjOpenAddDialog(); };

  const origStep7 = window.renderStep7View;
  if (typeof origStep7 === "function") {
    window.renderStep7View = function (sub) {
      const r = origStep7.apply(this, arguments);
      try { const s = sub || subjActiveSub(); if (s) renderSubjectivityViews(s); } catch (e) { console.warn("Subjectivities view failed:", e); }
      return r;
    };
  }
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { if (sub) { subjCheckOverdue(sub); renderSubjectivityViews(sub); } } catch (e) { console.warn("Subjectivities view failed:", e); }
      return r;
    };
  }
  // Pre-bind subjectivities gate the real bind ("Bind & Sync to PAS"), not the issuing of the quote:
  // the quote has to go out with its conditions listed so they can be satisfied.
  registerGuard("bind", "subjectivities", function (a) { return subjectivitiesGuardBind("PAS bind", a[0]); });
  // The post-bind clock starts when the policy is actually bound (the bound quote version is recorded).
  const origRecord = window.recordQuoteVersion;
  if (typeof origRecord === "function") {
    window.recordQuoteVersion = function (sub, isBound) {
      const r = origRecord.apply(this, arguments);
      if (isBound === true && sub) startPostBindClock(sub);
      return r;
    };
  }
})();

window.subjReceive = subjReceive; window.subjAccept = subjAccept; window.subjReturn = subjReturn;
window.subjWaive = subjWaive; window.subjReopen = subjReopen;
window.subjCloseAddDialog = subjCloseAddDialog; window.subjSubmitAdd = subjSubmitAdd; window.subjToggleAddFields = subjToggleAddFields;
window.renderSubjectivitiesQuoteList = renderSubjectivitiesQuoteList;
window.renderSubjectivitiesBindBanner = renderSubjectivitiesBindBanner;
window.renderSubjectivityViews = renderSubjectivityViews;
window.startPostBindClock = startPostBindClock;
window.ensureSubjectivityItems = ensureSubjectivityItems;
