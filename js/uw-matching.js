/**
 * ============================================================================
 * DUPLICATE MATCHING: A SCORE, THRESHOLDS, REVIEW, MERGE AND UNMERGE
 * ----------------------------------------------------------------------------
 * The duplicate check matched an exact FEIN, or a name that contained the other. A match rule (a register record) now scores two
 * cases on four things, each worth a weight the rule sets: FEIN, name, address and USDOT number.
 *
 *   SCORE      the weighted share of the fields both cases have, from 0 to 1. A name is compared as words with the legal suffix
 *              (LLC, Inc, Corp...) left off, against the insured's name and every alias (a trading name or a former name).
 *   THRESHOLDS at or above the review threshold a case is a candidate and a person decides; at or above the automatic threshold the
 *              duplicate is blocking (a New Submission check fails) until a person clears it.
 *   REVIEW     a candidate is confirmed as a match or cleared as not a match, by a person with the right to approve workflow steps,
 *              with a reason; the result is kept (clear, blocked or overridden).
 *   MERGE      a confirmed match can be merged: the other case is closed as merged into this one (it is never deleted), documents it
 *              had are added, and for each attribute the survivor keeps its own value or, where it has none, takes the other's, each
 *              choice recorded as a survivorship decision with its rule.
 *   UNMERGE    a merge can be undone: the other case is reopened, what the survivor took from it is taken back, and the unmerge is a
 *              new event that names the merge it reverses. History is never edited.
 * With no match rule registered the earlier check stays exactly as it was. Nothing is built in.
 * ============================================================================
 */

const MM_KEY = "FUT_UW_MATCHING_V1";
const MM_FIELDS = { fein: "FEIN", name: "Name", address: "Address", dot: "USDOT number" };
const MM_SUFFIX = /\b(llc|l l c|inc|incorporated|corp|corporation|co|company|ltd|lp|llp|pllc|the)\b/g;
const MM_ATTRS = ["insured", "address", "email", "broker", "dot", "mcNumber", "fein"];
var MM = { rules: [], seq: 0 };
try { const r = JSON.parse(localStorage.getItem(MM_KEY)); if (r && Array.isArray(r.rules)) MM = Object.assign(MM, r); } catch (e) { /* none yet */ }
function mmSave() { try { localStorage.setItem(MM_KEY, JSON.stringify(MM)); } catch (e) { /* keep for this session */ } }

// ----------------------------------------------------------------------------
// 1. THE RULE REGISTER
// ----------------------------------------------------------------------------
function mmValidate(r) {
  const e = [], w = r.weights || {};
  Object.keys(MM_FIELDS).forEach(k => { if (!(Number(w[k]) >= 0)) e.push("the weight for " + MM_FIELDS[k] + " is a number from 0"); });
  if (Object.keys(MM_FIELDS).every(k => Number(w[k]) >= 0) && Object.keys(MM_FIELDS).reduce((a, k) => a + Number(w[k]), 0) <= 0) e.push("at least one weight must be above zero");
  if (!(r.reviewThreshold > 0 && r.reviewThreshold < 1)) e.push("the review threshold is between 0 and 1");
  if (!(r.autoThreshold > 0 && r.autoThreshold <= 1)) e.push("the automatic threshold is above 0 and at most 1");
  if (r.reviewThreshold >= r.autoThreshold) e.push("the review threshold must be below the automatic threshold");
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(r.code || "")) e.push("the code is 2 to 30 letters, numbers, - or _");
  return e;
}
function mmAddRule(f) {
  if (!ucCan("edit")) { denyPermission("reviewRules", "edit"); return { ok: false, error: "permission" }; }
  const r = { id: "MR-" + (++MM.seq), code: String(f.code || "").trim(), version: 1, weights: { fein: Number(f.fein), name: Number(f.name), address: Number(f.address), dot: Number(f.dot) }, reviewThreshold: Number(f.reviewThreshold), autoThreshold: Number(f.autoThreshold), status: "draft", createdBy: ucActor(), createdAt: nowStamp() };
  const errs = mmValidate(r);
  if (MM.rules.some(x => x.code === r.code)) errs.push("a rule with this code exists; start a new version of it");
  if (errs.length) { MM.seq--; return { ok: false, error: "invalid", errors: errs }; }
  MM.rules.push(r); mmSave();
  return { ok: true, rule: r };
}
function mmRuleAct(id, what) {
  const r = MM.rules.find(x => x.id === id); if (!r) return;
  const res = ucAct(MM.rules, r, what, "MR-" + (++MM.seq));
  if (!res.ok && what === "newver") MM.seq--;
  if (res.error !== "cancelled") ucToast(res, "Done.");
  mmSave(); ucRender();
}
function mmActive() { return MM.rules.filter(r => r.status === "active").slice(-1)[0] || null; }

// ----------------------------------------------------------------------------
// 2. SCORING
// ----------------------------------------------------------------------------
function mmTokens(name) { return String(name || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(MM_SUFFIX, " ").split(/\s+/).filter(Boolean); }
function mmNameSim(a, b) {
  const x = mmTokens(a), y = mmTokens(b);
  if (!x.length || !y.length) return null;
  if (x.join(" ") === y.join(" ")) return 1;
  const sx = new Set(x), sy = new Set(y), inter = x.filter(t => sy.has(t)).length, uni = new Set(x.concat(y)).size;
  return inter / uni;
}
function mmAddr(a) { const t = String(a || "").toLowerCase(); const zip = (/\b(\d{5})(?:-\d{4})?\b/.exec(t) || [])[1] || ""; const num = (/^\s*(\d+)\b/.exec(t) || [])[1] || ""; const word = (/^\s*\d+\s+([a-z]+)/.exec(t) || [])[1] || ""; return { zip: zip, num: num, word: word }; }
function mmAddrSim(a, b) {
  if (!a || !b) return null;
  const x = mmAddr(a), y = mmAddr(b);
  const parts = [["zip", 0.4], ["num", 0.3], ["word", 0.3]].filter(p => x[p[0]] && y[p[0]]);
  if (!parts.length) return null;
  return parts.reduce((s, p) => s + (x[p[0]] === y[p[0]] ? p[1] : 0), 0) / parts.reduce((s, p) => s + p[1], 0);
}
function mmDigits(v) { return String(v || "").replace(/\D/g, ""); }
function mmNames(sub) { return [sub.insured].concat((sub.aliases || []).map(a => a.value)).filter(Boolean); }
/** The score of two cases under a rule: { score, basis, fields }. Fields that either case lacks are left out of the average. */
function mmScore(a, b, rule) {
  const w = rule.weights, fields = {};
  if (mmDigits(a.fein).length >= 7 && mmDigits(b.fein).length >= 7) fields.fein = mmDigits(a.fein) === mmDigits(b.fein) ? 1 : 0;
  let best = null; mmNames(a).forEach(x => mmNames(b).forEach(y => { const s = mmNameSim(x, y); if (s !== null && (best === null || s > best)) best = s; }));
  if (best !== null) fields.name = best;
  const ad = mmAddrSim(a.address, b.address); if (ad !== null) fields.address = ad;
  if (mmDigits(a.dot).length >= 5 && mmDigits(b.dot).length >= 5) fields.dot = mmDigits(a.dot) === mmDigits(b.dot) ? 1 : 0;
  const keys = Object.keys(fields).filter(k => Number(w[k]) > 0), tot = keys.reduce((s, k) => s + Number(w[k]), 0);
  const score = tot ? keys.reduce((s, k) => s + Number(w[k]) * fields[k], 0) / tot : 0;
  return { score: Math.round(score * 1000) / 1000, basis: Object.keys(fields).filter(k => fields[k] >= 0.8), fields: fields };
}
function mmRelated(a, b) { return a.copiedFrom === b.id || b.copiedFrom === a.id || (!!a.copiedFrom && a.copiedFrom === b.copiedFrom) || a.mergedInto === b.id || b.mergedInto === a.id; }
function mmList(sub) { if (!sub.matchCandidates) sub.matchCandidates = []; return sub.matchCandidates; }
/** Scores the case against every other open case and keeps the candidates at or above the review threshold. */
function mmScan(sub) {
  const rule = mmActive();
  if (!rule) return [];
  const list = mmList(sub);
  SUBMISSIONS_DATASET.filter(o => o.id !== sub.id && o.lifecycleStatus !== "merged" && !mmRelated(sub, o)).forEach(o => {
    const sc = mmScore(sub, o, rule);
    const prev = list.find(c => c.otherId === o.id);
    if (sc.score < rule.reviewThreshold) { if (prev && prev.status === "pending_review") { prev.status = "dropped"; } return; }
    const level = sc.score >= rule.autoThreshold ? "auto" : "review";
    if (prev) { if (prev.ruleId !== rule.id || prev.score !== sc.score) Object.assign(prev, { score: sc.score, basis: sc.basis, level: level, ruleId: rule.id, ruleCode: rule.code, ruleVersion: rule.version }); return; }
    list.push({ id: "MC-" + (list.length + 1), otherId: o.id, otherInsured: o.insured, score: sc.score, basis: sc.basis, level: level, ruleId: rule.id, ruleCode: rule.code, ruleVersion: rule.version, status: "pending_review", result: level === "auto" ? "blocked" : "pending", detectedAt: nowStamp() });
  });
  return list.filter(c => c.status !== "dropped");
}
/** What Phase 1's duplicate check adds: blocking matches (automatic level) and notes (review level). */
function mmP1(sub) {
  const rule = mmActive(); if (!rule) return null;
  const out = { auto: [], review: [] };
  SUBMISSIONS_DATASET.filter(o => o.id !== sub.id && o.lifecycleStatus !== "merged" && o.lifecycleStatus !== "declined" && !mmRelated(sub, o)).forEach(o => {
    const sc = mmScore(sub, o, rule); if (sc.score < rule.reviewThreshold) return;
    (sc.score >= rule.autoThreshold ? out.auto : out.review).push({ other: o, score: sc.score, basis: sc.basis, ruleCode: rule.code });
  });
  return out;
}

// ----------------------------------------------------------------------------
// 3. REVIEW
// ----------------------------------------------------------------------------
function mmReview(sub, candId, verdict, reason) {
  if (!hasPermission("workflow", "approve")) { denyPermission("workflow", "approve"); return { ok: false, error: "permission" }; }
  const c = mmList(sub).find(x => x.id === candId);
  if (!c || c.status !== "pending_review") return { ok: false, error: "state" };
  if (["confirmed_match", "not_a_match"].indexOf(verdict) < 0) return { ok: false, error: "verdict" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  c.status = verdict; c.result = verdict === "confirmed_match" ? "blocked" : (c.level === "auto" ? "overridden" : "clear"); c.reviewedBy = ucActor(); c.reviewedAt = nowStamp(); c.reviewReason = String(reason).trim();
  logDecision(sub, sub.currentStep || 2, "duplicate_match_reviewed", c.id + " against " + c.otherId + " (score " + Math.round(c.score * 100) + "%): " + (verdict === "confirmed_match" ? "confirmed as a match" : "cleared as not a match (" + c.result + ")") + ". " + c.reviewReason);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, candidate: c };
}

// ----------------------------------------------------------------------------
// 4. MERGE AND UNMERGE
// ----------------------------------------------------------------------------
function mmEvents(sub) { if (!sub.mergeEvents) sub.mergeEvents = []; return sub.mergeEvents; }
function mmAddAlias(sub, type, value) {
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return { ok: false, error: "permission" }; }
  if (["dba", "former_name", "nickname"].indexOf(type) < 0 || String(value || "").trim().length < 2) return { ok: false, error: "invalid" };
  if (!sub.aliases) sub.aliases = [];
  if (sub.aliases.some(a => a.value.toLowerCase() === String(value).trim().toLowerCase())) return { ok: false, error: "exists" };
  sub.aliases.push({ type: type, value: String(value).trim(), addedBy: ucActor(), addedAt: nowStamp() });
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}
/** The merged case is closed as merged into this one. Allowed once the match is confirmed. */
function mmMerge(sub, candId, reason) {
  if (!hasPermission("workflow", "approve")) { denyPermission("workflow", "approve"); return { ok: false, error: "permission" }; }
  const c = mmList(sub).find(x => x.id === candId), other = c && SUBMISSIONS_DATASET.find(s => s.id === c.otherId);
  if (!c || c.status !== "confirmed_match" || !other) return { ok: false, error: "not_confirmed" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  if (policyIsBound(sub) || policyIsBound(other)) return { ok: false, error: "bound" };
  if (other.lifecycleStatus === "merged") return { ok: false, error: "already" };
  const ev = { id: "MG-" + (mmEvents(sub).length + 1), type: "merge", survivor: sub.id, merged: other.id, candidateId: c.id, reason: String(reason).trim(), by: ucActor(), at: nowStamp(), survivorship: [], previous: {}, docsAdded: [], aliasAdded: null,
    mergedWas: { lifecycleStatus: other.lifecycleStatus || null, lifecycleStatusAt: other.lifecycleStatusAt || null, statusText: other.statusText || null, statusBadge: other.statusBadge || null } };
  MM_ATTRS.forEach(k => {
    const mine = sub[k], theirs = other[k], has = v => v !== undefined && v !== null && String(v).trim() !== "" && !/^(pending|not provided)/i.test(String(v));
    if (has(mine)) ev.survivorship.push({ attribute: k, value: mine, source: sub.id, rule: has(theirs) && String(theirs) !== String(mine) ? "survivor_kept" : "agreed" });
    else if (has(theirs)) { ev.previous[k] = mine === undefined ? null : mine; sub[k] = theirs; ev.survivorship.push({ attribute: k, value: theirs, source: other.id, rule: "filled_from_merged" }); }
  });
  if (!sub.docs) sub.docs = [];
  (other.docs || []).forEach(d => { if (!sub.docs.some(x => x.name === d.name)) { sub.docs.push(JSON.parse(JSON.stringify(d))); ev.docsAdded.push(d.name); } });
  if (other.insured && String(other.insured).toLowerCase() !== String(sub.insured || "").toLowerCase() && !(sub.aliases || []).some(a => a.value.toLowerCase() === String(other.insured).toLowerCase())) {
    if (!sub.aliases) sub.aliases = []; sub.aliases.push({ type: "former_name", value: other.insured, addedBy: ev.by, addedAt: ev.at, viaMerge: ev.id }); ev.aliasAdded = other.insured;
  }
  other.lifecycleStatus = "merged"; other.lifecycleStatusAt = Date.now(); other.mergedInto = sub.id; other.statusText = "Merged into " + sub.id; other.statusBadge = "badge-light";
  mmEvents(sub).push(ev);
  logDecision(sub, sub.currentStep || 2, "party_merged", ev.id + ": " + other.id + " (" + other.insured + ") merged into " + sub.id + ". " + ev.survivorship.filter(s => s.rule === "filled_from_merged").length + " value(s) taken from it. " + ev.reason);
  logDecision(other, other.currentStep || 2, "party_merged", "Closed as merged into " + sub.id + " (" + ev.id + "). " + ev.reason);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, event: ev };
}
function mmUnmerge(sub, eventId, reason) {
  if (!hasPermission("workflow", "approve")) { denyPermission("workflow", "approve"); return { ok: false, error: "permission" }; }
  const ev = mmEvents(sub).find(x => x.id === eventId && x.type === "merge");
  if (!ev) return { ok: false, error: "state" };
  if (mmEvents(sub).some(x => x.reverses === ev.id)) return { ok: false, error: "already" };
  if (String(reason || "").trim().length < 10) return { ok: false, error: "reason" };
  const other = SUBMISSIONS_DATASET.find(s => s.id === ev.merged);
  if (!other) return { ok: false, error: "missing" };
  Object.keys(ev.previous).forEach(k => { const taken = ev.survivorship.find(s => s.attribute === k && s.rule === "filled_from_merged"); if (taken && String(sub[k]) === String(taken.value)) { if (ev.previous[k] === null) delete sub[k]; else sub[k] = ev.previous[k]; } });
  if (ev.docsAdded.length) sub.docs = (sub.docs || []).filter(d => ev.docsAdded.indexOf(d.name) < 0);
  if (ev.aliasAdded) sub.aliases = (sub.aliases || []).filter(a => a.viaMerge !== ev.id);
  const w = ev.mergedWas;
  if (w.lifecycleStatus) other.lifecycleStatus = w.lifecycleStatus; else delete other.lifecycleStatus;
  if (w.lifecycleStatusAt) other.lifecycleStatusAt = w.lifecycleStatusAt; else delete other.lifecycleStatusAt;
  delete other.mergedInto; other.statusText = w.statusText; other.statusBadge = w.statusBadge;
  const un = { id: "MG-" + (mmEvents(sub).length + 1), type: "unmerge", survivor: sub.id, merged: other.id, reverses: ev.id, reason: String(reason).trim(), by: ucActor(), at: nowStamp() };
  mmEvents(sub).push(un);
  logDecision(sub, sub.currentStep || 2, "party_unmerged", un.id + " reverses " + ev.id + ": " + other.id + " is open again. " + un.reason);
  logDecision(other, other.currentStep || 2, "party_unmerged", "Reopened: the merge into " + sub.id + " (" + ev.id + ") was reversed. " + un.reason);
  const cand = mmList(sub).find(x => x.id === ev.candidateId); if (cand) { cand.status = "pending_review"; cand.result = "pending"; }
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, event: un };
}

// ----------------------------------------------------------------------------
// 5. SCREENS
// ----------------------------------------------------------------------------
function mmRulesHtml() {
  const edit = ucCan("edit");
  const form = edit ? `<details class="card"><summary style="cursor:pointer;padding:12px 16px;font-weight:700;"><i class="ph ph-plus-circle"></i> New match rule</summary><div class="card-body"><div class="mw-grid">
    <div class="form-group"><label for="mm_code">Code</label><input class="form-control" id="mm_code"></div>
    ${Object.keys(MM_FIELDS).map(k => `<div class="form-group"><label for="mm_w_${k}">Weight: ${escHtml(MM_FIELDS[k])}</label><input class="form-control" id="mm_w_${k}"></div>`).join("")}
    <div class="form-group"><label for="mm_rev">Review threshold (0 to 1)</label><input class="form-control" id="mm_rev"></div><div class="form-group"><label for="mm_auto">Automatic threshold (0 to 1)</label><input class="form-control" id="mm_auto"></div></div>
    <div class="p1-note">With no rule in force the earlier check (exact FEIN, or one name containing the other) stays as it was.</div><div class="p1-actions"><button class="btn btn-primary" onclick="mmAddRuleUi()">Create draft</button></div></div></details>` : `<div class="p1-note">Changing match rules needs edit rights on review rules.</div>`;
  const rows = MM.rules.slice().reverse().map(r => `<tr><td><strong>${escHtml(r.code)}</strong> v${r.version}</td><td>${Object.keys(MM_FIELDS).map(k => MM_FIELDS[k] + " " + r.weights[k]).join(" · ")}</td><td>review ${r.reviewThreshold} · automatic ${r.autoThreshold}</td><td>${ucStatusBadge(r.status)}${r.rejectedReason ? `<div class="p1-note">Sent back: ${escHtml(r.rejectedReason)}</div>` : ""}</td><td>${ucActionsHtml("mmRuleAct", r)}</td></tr>`).join("");
  return form + (MM.rules.length ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Rule</th><th>Weights</th><th>Thresholds</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="mw-empty">No match rule is registered.</div>`);
}
function mmAddRuleUi() {
  const r = mmAddRule({ code: ucV("mm_code"), fein: ucV("mm_w_fein"), name: ucV("mm_w_name"), address: ucV("mm_w_address"), dot: ucV("mm_w_dot"), reviewThreshold: ucV("mm_rev"), autoThreshold: ucV("mm_auto") });
  ucToast(r, "Draft created."); ucRender();
}
function mmCaseHtml(sub) {
  const rule = mmActive(), canApprove = hasPermission("workflow", "approve");
  const head = rule ? `<div class="p1-note">Match rule ${escHtml(rule.code)} v${rule.version}: review at ${rule.reviewThreshold}, automatic at ${rule.autoThreshold}.</div><button class="btn btn-sm btn-outline" style="margin:6px 0;" onclick="mmScanUi()">Look for duplicates</button>` : '<div class="p1-note">No match rule is in force, so only the earlier check (exact FEIN, or a contained name) runs.</div>';
  const cands = mmList(sub).filter(c => c.status !== "dropped").map(c => `<tr><td>${escHtml(c.id)}</td><td>${escHtml(c.otherId)}<div class="p1-note">${escHtml(c.otherInsured)}</div></td><td>${Math.round(c.score * 100)}%<div class="p1-note">${escHtml(c.basis.map(b => MM_FIELDS[b]).join(", ") || "no single field")} · ${escHtml(c.level)}</div></td><td><span class="badge ${c.status === "confirmed_match" ? "badge-danger" : c.status === "not_a_match" ? "badge-success" : "badge-warning"}">${escHtml(c.status.replace(/_/g, " "))}</span>${c.reviewReason ? `<div class="p1-note">${escHtml(c.reviewedBy)}: ${escHtml(c.reviewReason)}</div>` : ""}<div class="p1-note">check: ${escHtml(c.result)}</div></td>
    <td>${c.status === "pending_review" && canApprove ? `<button class="btn btn-xs btn-outline" onclick="mmReviewUi('${c.id}','confirmed_match')">Confirm match</button> <button class="btn btn-xs btn-outline" onclick="mmReviewUi('${c.id}','not_a_match')">Not a match</button>` : ""}${c.status === "confirmed_match" && canApprove && !mmEvents(sub).some(e => e.type === "merge" && e.candidateId === c.id && !mmEvents(sub).some(u => u.reverses === e.id)) ? `<button class="btn btn-xs btn-primary" onclick="mmMergeUi('${c.id}')">Merge ${escHtml(c.otherId)} into this</button>` : ""}</td></tr>`).join("");
  const evs = mmEvents(sub).slice().reverse().map(e => `<tr><td>${escHtml(e.id)}</td><td>${e.type === "merge" ? "Merge" : "Unmerge"}</td><td>${escHtml(e.merged)}${e.reverses ? " (reverses " + escHtml(e.reverses) + ")" : ""}</td><td>${(e.survivorship || []).map(s => `<div class="p1-note">${escHtml(s.attribute)}: ${escHtml(s.value)} (${escHtml(s.rule.replace(/_/g, " "))})</div>`).join("")}</td><td>${escHtml(e.by)}<div class="p1-note">${escHtml(e.at)}: ${escHtml(e.reason)}</div></td><td>${e.type === "merge" && canApprove && !mmEvents(sub).some(u => u.reverses === e.id) ? `<button class="btn btn-xs btn-outline" onclick="mmUnmergeUi('${e.id}')">Unmerge</button>` : ""}</td></tr>`).join("");
  const alias = hasPermission("submissionData", "edit") ? `<div class="mw-grid" style="margin-top:8px;"><div class="form-group"><label for="mm_al_t">Alias</label><select class="form-control" id="mm_al_t"><option value="dba">Trading name (DBA)</option><option value="former_name">Former name</option><option value="nickname">Nickname</option></select></div><div class="form-group"><label for="mm_al_v">Name</label><input class="form-control" id="mm_al_v"></div></div><button class="btn btn-xs btn-outline" onclick="mmAliasUi()">Add alias</button>` : "";
  return head + (cands ? `<div class="rules-table-container" style="max-height:none;"><table class="data-table"><thead><tr><th>Candidate</th><th>Case</th><th>Score</th><th>Status</th><th></th></tr></thead><tbody>${cands}</tbody></table></div>` : (rule ? '<div class="mw-empty">No candidate duplicate was found.</div>' : "")) + (evs ? `<div class="rules-table-container" style="max-height:none;margin-top:8px;"><table class="data-table"><thead><tr><th>Event</th><th>Kind</th><th>Case</th><th>Survivorship</th><th>By</th><th></th></tr></thead><tbody>${evs}</tbody></table></div>` : "") + ((sub.aliases || []).length ? `<div class="p1-note">Aliases: ${sub.aliases.map(a => escHtml(a.value) + " (" + escHtml(a.type.replace(/_/g, " ")) + ")").join("; ")}</div>` : "") + alias;
}
function mmScanUi() { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const l = mmScan(sub); showToast(l.length ? l.length + " candidate(s) found." : "No candidate duplicate was found.", "info"); if (typeof cfRender === "function") cfRender(); }
function mmReviewUi(id, verdict) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const why = window.prompt("Why? (at least 10 characters; recorded with your name)", ""); if (why === null) return; const r = mmReview(sub, id, verdict, why); showToast(r.ok ? "✅ Recorded." : "⛔ " + (r.error === "reason" ? "Give a reason of at least 10 characters." : r.error), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function mmMergeUi(id) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const why = window.prompt("Why are these the same customer? (at least 10 characters)", ""); if (why === null) return; const r = mmMerge(sub, id, why); showToast(r.ok ? "✅ Merged." : "⛔ " + ({ bound: "A bound policy cannot be merged.", reason: "Give a reason of at least 10 characters." }[r.error] || r.error), r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function mmUnmergeUi(id) { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const why = window.prompt("Why is the merge reversed? (at least 10 characters)", ""); if (why === null) return; const r = mmUnmerge(sub, id, why); showToast(r.ok ? "✅ Unmerged." : "⛔ " + r.error, r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }
function mmAliasUi() { const sub = typeof cfSub === "function" ? cfSub() : null; if (!sub) return; const r = mmAddAlias(sub, ucV("mm_al_t"), ucV("mm_al_v")); showToast(r.ok ? "✅ Alias added." : "⛔ " + r.error, r.ok ? "success" : "danger"); if (typeof cfRender === "function") cfRender(); }

(function mmInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    const m = (label, icon, badge, outcome) => ({ label, icon, badge, outcome });
    AUDIT_ACTION_META.duplicate_match_reviewed = m("Duplicate Match Reviewed", "ph-copy", "badge-info", "outcome-refer");
    AUDIT_ACTION_META.party_merged = m("Customer Merged", "ph-git-merge", "badge-warning", "outcome-refer");
    AUDIT_ACTION_META.party_unmerged = m("Customer Merge Reversed", "ph-git-fork", "badge-warning", "outcome-refer");
  }
  // Phase 1's duplicate check: an automatic-level match fails it, a review-level match is a note
  const orig = window.p1CheckFein;
  if (typeof orig === "function") window.p1CheckFein = function (sub) {
    const r = orig.apply(this, arguments);
    if (r.status === "fail") return r;
    const mm = mmP1(sub); if (!mm) return r;
    if (mm.auto.length) {
      const a = mm.auto[0], lines = mm.auto.map(x => ({ ok: false, text: `${x.other.id}: ${x.other.insured}, sent by ${x.other.broker || "unknown"}; score ${Math.round(x.score * 100)}% on ${x.basis.map(b => MM_FIELDS[b]).join(", ") || "several fields"} (rule ${x.ruleCode}).` }));
      return Object.assign(r, { status: "fail", summary: `Very likely the same customer as ${a.other.id} (${a.other.insured}): score ${Math.round(a.score * 100)}%.`, lines: lines.concat(r.lines || []) });
    }
    mm.review.forEach(x => r.lines.push({ ok: true, text: `Possible duplicate: ${x.other.id} (${x.other.insured}), score ${Math.round(x.score * 100)}%; a person decides on the Underwriting record.` }));
    return r;
  };
})();
ucRegisterTab("matching", "Duplicate matching", "ph-copy", mmRulesHtml, () => MM.rules.filter(r => r.status === "pending").length);
if (typeof urRegisterSection === "function") urRegisterSection("matching", "Duplicate matching", mmCaseHtml);
