/**
 * ============================================================================
 * RISK VERSIONS: A FROZEN COPY OF THE RISK FOR EVERY SUBMISSION, QUOTE AND POLICY
 * ----------------------------------------------------------------------------
 * The risk (the vehicles, drivers and locations, the insured's details, and which coverage applies to which of them) lived in
 * one place on the case. The case already kept a list of what changed in the customer's data (submission versions) and a
 * ledger of quotes with their premium, but neither held the risk as it was. A vehicle edited after a quote was issued
 * changed the "quoted" risk, and one edited after bind changed the bound policy.
 *
 *   RISK VERSION   a frozen copy of the risk, made for one context: a submission version, an issued quote version, or the
 *                  policy. It says which version it was copied from and carries a fingerprint, so any change to it is seen.
 *                  The case's own fields are the WORKING COPY: edit them freely, and the next quote or endorsement takes a
 *                  new copy. Nothing that was frozen moves.
 *   LINEAGE KEY    each vehicle, driver and location keeps its key (VEH-2) for the life of the case, through quotes,
 *                  endorsements and renewal. The key is matched on the VIN, licence number or address, is never reused, and
 *                  is why "vehicle 2" is still vehicle 2 after another is removed.
 *   SCHEDULE       the vehicles (or drivers, or locations) as one list, with terms that belong to the list.
 *   COVERAGE LINK  how each coverage applies: BLANKET on a schedule (every unit on it, including one added later), SCHEDULED
 *                  to named units (only those), or to the POLICY as a whole. A link is never both a schedule and units.
 *
 * Rules enforced: the bind is refused if the risk changed after the quote it would bind; a bound policy's risk changes only by
 * endorsement, which makes a new policy version; an endorsement that adds a vehicle puts it under blanket coverages and under
 * scheduled ones only if it is named. The existing modules still read the working copy; use rvPolicyRisk(sub, date) for the
 * risk in force on a date (a loss date, a certificate date).
 * ============================================================================
 */

const RV_TYPES = { vehicle: { prefix: "VEH", label: "Vehicle", list: "vehicles" }, driver: { prefix: "DRV", label: "Driver", list: "drivers" }, location: { prefix: "LOC", label: "Location" } };
const RV_CLEAN_OMIT = ["enrichment", "lineageKey", "overridden"];
const RV_COVERAGE_BASES = { blanket: "Blanket on the schedule", scheduled: "Scheduled units only", policy: "The policy as a whole" };

// ----------------------------------------------------------------------------
// 1. HELPERS
// ----------------------------------------------------------------------------
function rvEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function rvNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function rvToday() { return new Date().toISOString().slice(0, 10); }
function rvActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function rvSave() { if (typeof persistAppState === "function") persistAppState(); }
function rvClone(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }
function rvLog(sub, decision, notes) { if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 5, decision: decision, by: rvActor(), at: rvNow(), notes: notes }); }
function rvIsBound(sub) { return !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber); }
function rvActiveSub() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }
function rvStable(v) {
  if (Array.isArray(v)) return "[" + v.map(rvStable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + rvStable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
function rvHash(v) { const s = rvStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) + ":" + s.length; }
function rvDeepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(k => rvDeepFreeze(o[k])); } return o; }
function rvNorm(v) { return String(v === null || v === undefined ? "" : v).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function rvNum(key) { const m = /-(\d+)$/.exec(key || ""); return m ? +m[1] : 0; }
function rvCovKey(line) { return rvNorm(line); }
function rvClean(o) { const c = rvClone(o); RV_CLEAN_OMIT.forEach(k => { delete c[k]; }); return c; }

// ----------------------------------------------------------------------------
// 2. LINEAGE KEYS
// ----------------------------------------------------------------------------
function rvIdentOf(type, o) {
  if (type === "vehicle") { const vin = String(o.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); return vin.length >= 11 ? vin : ""; }
  if (type === "driver") return rvNorm(o.licenseNumber) || rvNorm((o.given_name || "") + (o.last_name || "")) || rvNorm(o.name || o.driver_name);
  return rvNorm(o.address);
}
function rvLocations(sub) { return sub.sov && sub.sov.kind === "locations" && Array.isArray(sub.sov.rows) ? sub.sov.rows : []; }
function rvListOf(sub, type) { return type === "vehicle" ? (sub.vehicles || []) : type === "driver" ? (sub.drivers || []) : rvLocations(sub); }

/** Gives every vehicle, driver and location a key that stays with it. A key already given is kept; a returning VIN, licence or address gets its old key back; otherwise a new key is issued and never reused. */
function rvEnsureLineage(sub) {
  const L = sub.riskLineage = sub.riskLineage || { next: { VEH: 0, DRV: 0, LOC: 0 }, byId: {} };
  Object.keys(RV_TYPES).forEach(type => {
    const p = RV_TYPES[type].prefix, list = rvListOf(sub, type);
    list.forEach(o => { if (o.lineageKey) L.next[p] = Math.max(L.next[p] || 0, rvNum(o.lineageKey)); });
    list.forEach(o => {
      const id = rvIdentOf(type, o);
      if (o.lineageKey) { if (id) L.byId[p + ":" + id] = o.lineageKey; return; }
      let key = id ? L.byId[p + ":" + id] : null;
      if (key && list.some(x => x !== o && x.lineageKey === key)) key = null;
      if (!key) key = p + "-" + (L.next[p] = (L.next[p] || 0) + 1);
      o.lineageKey = key;
      if (id) L.byId[p + ":" + id] = key;
    });
  });
  return L;
}
function rvNewKey(sub, type) { const L = rvEnsureLineage(sub), p = RV_TYPES[type].prefix; return p + "-" + (L.next[p] = (L.next[p] || 0) + 1); }

// ----------------------------------------------------------------------------
// 3. COVERAGE LINKS
// ----------------------------------------------------------------------------
/** How a coverage applies when nobody has said: physical damage is scheduled unit by unit, liability and cargo are blanket on the vehicles. */
function rvDefaultLink(line, types) {
  const l = String(line || "");
  if (/physical|collision|comprehensive|own damage|\bpd\b/i.test(l) && types.vehicle) return { basis: "scheduled", schedule: "vehicle", items: null };
  if (/liab|cargo|hired|non-?owned|medical|uninsured|underinsured|um\/?uim|pip/i.test(l) && types.vehicle) return { basis: "blanket", schedule: "vehicle", items: null };
  if (/property|building|premises|contents|business income/i.test(l) && types.location) return { basis: "blanket", schedule: "location", items: null };
  return { basis: "policy", schedule: null, items: null };
}
function rvLinkOverrides(sub) { return sub.coverageRisk || {}; }

/** Every coverage on the case with its link, defaults filled in. Scheduled links list their units explicitly. */
function rvResolveLinks(sub, objs, coverages) {
  const types = {}; objs.forEach(o => { if (o.status === "active") types[o.type] = true; });
  const ov = rvLinkOverrides(sub);
  return coverages.map(c => {
    const set = ov[c.key] || rvDefaultLink(c.line, types);
    const sched = set.basis === "policy" ? null : set.schedule;
    const active = objs.filter(o => o.status === "active" && o.type === sched).map(o => o.lineageKey);
    return { coverageKey: c.key, line: c.line, basis: set.basis, schedule: sched, itemKeys: set.basis === "scheduled" ? (set.items ? set.items.filter(k => active.indexOf(k) > -1) : active) : null };
  });
}

/** What is wrong with a coverage link: [] when it is fine. Never a schedule and units together; scheduled needs units; units must exist and be of the schedule's kind. */
function rvValidateLink(link, objs) {
  const errs = [];
  if (!RV_COVERAGE_BASES[link.basis]) return ["Pick how the coverage applies."];
  if (link.basis === "policy") { if (link.schedule || (link.items && link.items.length)) errs.push("A coverage on the policy as a whole names neither a schedule nor units."); return errs; }
  if (!RV_TYPES[link.schedule]) return ["Pick the schedule the coverage applies to."];
  const ofType = objs.filter(o => o.type === link.schedule && o.status === "active");
  if (!ofType.length) errs.push("There is no " + RV_TYPES[link.schedule].label.toLowerCase() + " on the schedule.");
  if (link.basis === "blanket" && link.items && link.items.length) errs.push("A blanket coverage applies to the whole schedule, so it does not list units.");
  if (link.basis === "scheduled") {
    if (!link.items || !link.items.length) errs.push("A scheduled coverage names at least one unit.");
    (link.items || []).forEach(k => { if (!ofType.some(o => o.lineageKey === k)) errs.push(k + " is not on the " + link.schedule + " schedule."); });
  }
  return errs;
}

// ----------------------------------------------------------------------------
// 4. THE RISK AS IT IS NOW, AND A FROZEN COPY OF IT
// ----------------------------------------------------------------------------
function rvObjectsOf(sub) {
  rvEnsureLineage(sub);
  const objs = [];
  Object.keys(RV_TYPES).forEach(type => rvListOf(sub, type).forEach(o => objs.push({ lineageKey: o.lineageKey, type: type, itemNo: rvNum(o.lineageKey), status: "active", attributes: rvClean(o) })));
  return objs;
}
function rvCoveragesOf(sub) { return (sub.coverageRows || []).map(r => ({ key: rvCovKey(r.line), line: r.line, limit: r.limit === undefined ? null : r.limit, ded: r.ded === undefined ? null : r.ded })); }
function rvSchedulesOf(sub, objs) {
  const terms = sub.riskScheduleTerms || {}, out = [];
  Object.keys(RV_TYPES).forEach(type => {
    const keys = objs.filter(o => o.type === type && o.status === "active").map(o => o.lineageKey);
    if (keys.length || terms[type]) out.push({ id: "SCH-" + RV_TYPES[type].prefix, type: type, name: RV_TYPES[type].label + " schedule", itemKeys: keys, terms: rvClone(terms[type] || {}) });
  });
  return out;
}
/** The content of a risk version, built from the working copy. */
function rvContentOf(sub) {
  const objs = rvObjectsOf(sub), coverages = rvCoveragesOf(sub);
  return {
    header: { insured: sub.insured || "", address: sub.address || "", state: typeof deriveRiskState === "function" ? deriveRiskState(sub) : null, lob: sub.lobKey || "", exposureVal: Number(sub.exposureVal) || 0, effectiveDate: sub.effectiveDate || "", expirationDate: sub.expirationDate || "" },
    objects: objs, schedules: rvSchedulesOf(sub, objs), coverages: coverages, coverageLinks: rvResolveLinks(sub, objs, coverages)
  };
}
/** The part of a content two versions are compared on: units that are on the policy, not ones removed from it. */
function rvActiveContent(c) { const x = rvClone(c); x.objects = x.objects.filter(o => o.status === "active"); return x; }
function rvHashActive(c) { return rvHash(rvActiveContent(c)); }

function rvList(sub) { return sub.riskVersions || []; }
function rvGet(sub, id) { return rvList(sub).find(r => r.id === id) || null; }
function rvLatest(sub, type) { return rvList(sub).filter(r => !type || r.contextType === type).slice(-1)[0] || null; }
/** True when the frozen content still matches its fingerprint. */
function rvVerify(rv) { return !!rv && rvHash(rv.content) === rv.snapshotHash; }

/** Freezes a copy of the risk for a context. `from` is a version to copy instead of the working copy (the policy copies the quote that was bound). */
function rvCapture(sub, contextType, contextRef, opts) {
  opts = opts || {};
  const content = opts.content || (opts.from ? rvClone(opts.from.content) : rvContentOf(sub));
  const hash = rvHash(content);
  if (!sub.riskVersions) sub.riskVersions = [];
  if (contextType === "submission") {
    const last = rvLatest(sub, "submission");
    if (last && last.snapshotHash === hash) return last;
  }
  const prev = opts.copiedFrom !== undefined ? opts.copiedFrom : (opts.from ? opts.from.id : (rvLatest(sub) || {}).id || null);
  const n = sub.riskVersions.length + 1;
  const rec = { id: "RV-" + n, versionNo: n, contextType: contextType, contextRef: contextRef || null, copiedFromId: prev, createdAt: rvNow(), createdBy: rvActor(), effectiveFrom: opts.effectiveFrom || null, effectiveTo: null, isFrozen: true, frozenAt: rvNow(), snapshotHash: hash, content: content };
  rvDeepFreeze(rec.content);
  sub.riskVersions.push(rec);
  rvSave();
  return rec;
}

/** Field-level differences between two contents, by lineage key: { added, removed, changed, header, links }. */
function rvDiff(a, b) {
  const ka = {}, kb = {};
  (a.objects || []).forEach(o => { if (o.status === "active") ka[o.lineageKey] = o; });
  (b.objects || []).forEach(o => { if (o.status === "active") kb[o.lineageKey] = o; });
  const out = { added: [], removed: [], changed: [], header: [], links: [] };
  Object.keys(kb).forEach(k => { if (!ka[k]) out.added.push(kb[k]); });
  Object.keys(ka).forEach(k => { if (!kb[k]) out.removed.push(ka[k]); });
  Object.keys(kb).forEach(k => {
    if (!ka[k]) return;
    const fa = {}, fb = {};
    const flat = (v, p, o) => { if (v && typeof v === "object") Object.keys(v).forEach(x => flat(v[x], p ? p + "." + x : x, o)); else o[p] = v === null || v === undefined ? "" : String(v); return o; };
    flat(ka[k].attributes, "", fa); flat(kb[k].attributes, "", fb);
    const fields = Object.keys(fa).concat(Object.keys(fb).filter(x => !(x in fa))).filter(x => fa[x] !== fb[x]);
    if (fields.length) out.changed.push({ lineageKey: k, type: kb[k].type, fields: fields.map(f => ({ path: f, from: fa[f] === undefined ? "" : fa[f], to: fb[f] === undefined ? "" : fb[f] })) });
  });
  Object.keys(Object.assign({}, a.header, b.header)).forEach(f => { if (String((a.header || {})[f]) !== String((b.header || {})[f])) out.header.push({ field: f, from: (a.header || {})[f], to: (b.header || {})[f] }); });
  const la = {}, lb = {}; (a.coverageLinks || []).forEach(l => { la[l.coverageKey] = l; }); (b.coverageLinks || []).forEach(l => { lb[l.coverageKey] = l; });
  Object.keys(Object.assign({}, la, lb)).forEach(k => { if (rvStable(la[k] || null) !== rvStable(lb[k] || null)) out.links.push({ coverageKey: k, from: la[k] || null, to: lb[k] || null }); });
  return out;
}
function rvDiffCount(d) { return d.added.length + d.removed.length + d.changed.length + d.header.length + d.links.length; }
function rvDiffText(d) {
  const t = [];
  d.added.forEach(o => t.push(RV_TYPES[o.type].label + " " + o.itemNo + " (" + o.lineageKey + ") added"));
  d.removed.forEach(o => t.push(RV_TYPES[o.type].label + " " + o.itemNo + " (" + o.lineageKey + ") removed"));
  d.changed.forEach(c => t.push(c.lineageKey + ": " + c.fields.slice(0, 3).map(f => f.path + " " + (f.from || "-") + " to " + (f.to || "-")).join(", ") + (c.fields.length > 3 ? " and " + (c.fields.length - 3) + " more" : "")));
  d.header.forEach(h => t.push(h.field + " " + (h.from === "" || h.from === undefined ? "-" : h.from) + " to " + (h.to === "" || h.to === undefined ? "-" : h.to)));
  d.links.forEach(l => t.push("coverage " + (l.to || l.from).line + ": how it applies changed"));
  return t;
}

// ----------------------------------------------------------------------------
// 5. WHICH VERSION IS IN FORCE, WHAT HAS DRIFTED, WHAT IS COVERED
// ----------------------------------------------------------------------------
/** The risk of the policy in force on a date (today if none): the policy version whose period holds it. */
function rvPolicyRisk(sub, date) {
  const d = date || rvToday();
  const pol = rvList(sub).filter(r => r.contextType === "policy");
  return pol.filter(r => (!r.effectiveFrom || r.effectiveFrom <= d) && (!r.effectiveTo || d < r.effectiveTo)).slice(-1)[0] || null;
}
/** The version the working copy is measured against: the latest policy version once bound (an endorsement dated later is already part of it), otherwise the latest quote, otherwise the latest submission version. */
function rvReference(sub) { return rvIsBound(sub) ? rvLatest(sub, "policy") : (rvLatest(sub, "quote") || rvLatest(sub, "submission")); }
/** How the working copy differs from the reference version: { reference, changes, count }. */
function rvDrift(sub) {
  const ref = rvReference(sub); if (!ref) return { reference: null, count: 0, changes: [] };
  const live = rvContentOf(sub), d = rvDiff(rvActiveContent(ref.content), rvActiveContent(live));
  return { reference: ref, count: rvDiffCount(d), changes: rvDiffText(d), diff: d };
}

/** Is a unit covered by a coverage in a version? Blanket: every active unit on the schedule, including one added later. Scheduled: only those named. */
function rvCovered(content, coverageKey, lineageKey) {
  const link = (content.coverageLinks || []).find(l => l.coverageKey === coverageKey); if (!link) return false;
  const o = (content.objects || []).find(x => x.lineageKey === lineageKey); if (!o || o.status !== "active") return false;
  if (link.basis === "policy") return true;
  if (o.type !== link.schedule) return false;
  return link.basis === "blanket" ? true : (link.itemKeys || []).indexOf(lineageKey) > -1;
}

/** Sets how a coverage applies on the working copy. Needs permission; not after bind (that is an endorsement). */
function rvSetCoverageLink(sub, coverageKey, link) {
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return { ok: false, error: "permission" }; }
  if (rvIsBound(sub)) return { ok: false, error: "bound" };
  const objs = rvObjectsOf(sub);
  if (!rvCoveragesOf(sub).some(c => c.key === coverageKey)) return { ok: false, error: "coverage" };
  const errs = rvValidateLink(link, objs);
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  if (!sub.coverageRisk) sub.coverageRisk = {};
  sub.coverageRisk[coverageKey] = { basis: link.basis, schedule: link.basis === "policy" ? null : link.schedule, items: link.basis === "scheduled" ? link.items.slice() : null };
  rvLog(sub, "risk_link_set", "Coverage " + coverageKey + ": " + RV_COVERAGE_BASES[link.basis] + (link.basis === "scheduled" ? " (" + link.items.join(", ") + ")" : link.schedule ? " (" + link.schedule + " schedule)" : "") + ".");
  rvSave();
  return { ok: true };
}
function rvSetScheduleTerms(sub, type, terms) {
  if (!hasPermission("submissionData", "edit")) { denyPermission("submissionData", "edit"); return { ok: false, error: "permission" }; }
  if (rvIsBound(sub)) return { ok: false, error: "bound" };
  if (!RV_TYPES[type]) return { ok: false, error: "type" };
  const lim = terms.blanketLimit === "" || terms.blanketLimit === undefined || terms.blanketLimit === null ? null : Number(terms.blanketLimit);
  if (lim !== null && !(lim >= 0)) return { ok: false, error: "limit" };
  if (!sub.riskScheduleTerms) sub.riskScheduleTerms = {};
  sub.riskScheduleTerms[type] = { blanketLimit: lim, basis: String(terms.basis || "").trim(), note: String(terms.note || "").trim() };
  rvSave();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 6. ENDORSEMENT: A NEW POLICY VERSION
// ----------------------------------------------------------------------------
/** What an endorsement that changes the schedule must say. [] when it can go ahead. */
function rvValidateChange(sub, ch) {
  const p = [];
  if (!RV_TYPES[ch.type]) return ["choose vehicle, driver or location"];
  const cur = rvLatest(sub, "policy");
  if (!cur) return ["the policy has no risk version"];
  if (ch.effective && cur.effectiveFrom && ch.effective < cur.effectiveFrom) p.push("the change cannot take effect before the current risk version starts (" + cur.effectiveFrom + ")");
  const active = cur.content.objects.filter(o => o.type === ch.type && o.status === "active");
  if (ch.action === "add") {
    const a = ch.attributes || {};
    if (ch.type === "vehicle" && !(String(a.vin || "").trim() || (a.year && a.make))) p.push("a vehicle needs a VIN, or a year and make");
    if (ch.type === "driver" && !(String(a.name || "").trim() || String(a.licenseNumber || "").trim())) p.push("a driver needs a name or licence number");
    if (ch.type === "location" && !String(a.address || "").trim()) p.push("a location needs an address");
    const id = rvIdentOf(ch.type, a);
    if (id && active.some(o => rvIdentOf(ch.type, o.attributes) === id)) p.push("that " + RV_TYPES[ch.type].label.toLowerCase() + " is already on the policy (" + active.filter(o => rvIdentOf(ch.type, o.attributes) === id)[0].lineageKey + ")");
  } else if (ch.action === "remove" || ch.action === "modify") {
    if (!active.some(o => o.lineageKey === ch.lineageKey)) p.push("choose a " + RV_TYPES[ch.type].label.toLowerCase() + " that is on the policy");
    if (ch.action === "modify" && !Object.keys(ch.attributes || {}).some(k => String(ch.attributes[k]).trim() !== "")) p.push("enter what changes");
  } else p.push("choose add, remove or change");
  if (ch.coverages) { const keys = cur.content.coverages.map(c => c.key); ch.coverages.forEach(k => { if (keys.indexOf(k) === -1) p.push("unknown coverage " + k); }); }
  return p;
}

/**
 * Makes the new policy version for an endorsement: a copy of the version in force with the change applied, effective from the
 * endorsement date. The version before it ends that day and stays as it was. The working copy is brought into line.
 */
function rvEndorse(sub, ch) {
  const errs = rvValidateChange(sub, ch);
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  const cur = rvLatest(sub, "policy"), content = rvClone(cur.content), type = ch.type;
  let key = ch.lineageKey, label;
  if (ch.action === "add") {
    key = rvNewKey(sub, type);
    content.objects.push({ lineageKey: key, type: type, itemNo: rvNum(key), status: "active", addedEffective: ch.effective, attributes: rvClone(ch.attributes) });
    const list = rvListOf(sub, type), live = Object.assign({}, rvClone(ch.attributes), { lineageKey: key });
    if (type === "location") { if (!sub.sov || sub.sov.kind !== "locations") sub.sov = { kind: "locations", rows: [], docs: [] }; sub.sov.rows.push(live); } else list.push(live);
    label = RV_TYPES[type].label + " " + rvNum(key) + " added";
  } else if (ch.action === "remove") {
    const o = content.objects.find(x => x.lineageKey === key); o.status = "excluded"; o.removedEffective = ch.effective;
    const list = rvListOf(sub, type), i = list.findIndex(x => x.lineageKey === key); if (i > -1) list.splice(i, 1);
    label = RV_TYPES[type].label + " " + rvNum(key) + " removed";
  } else {
    const o = content.objects.find(x => x.lineageKey === key);
    Object.keys(ch.attributes).forEach(k => { if (String(ch.attributes[k]).trim() !== "") o.attributes[k] = ch.attributes[k]; });
    const live = rvListOf(sub, type).find(x => x.lineageKey === key); if (live) Object.assign(live, ch.attributes);
    label = RV_TYPES[type].label + " " + rvNum(key) + " changed";
  }
  // The schedules and coverage links follow. A blanket coverage takes in a new unit by itself; a scheduled one only if it is named.
  const active = content.objects.filter(o => o.status === "active");
  content.schedules = Object.keys(RV_TYPES).map(t => ({ id: "SCH-" + RV_TYPES[t].prefix, type: t, name: RV_TYPES[t].label + " schedule", itemKeys: active.filter(o => o.type === t).map(o => o.lineageKey), terms: ((content.schedules.find(s => s.type === t) || {}).terms) || {} })).filter(s => s.itemKeys.length || Object.keys(s.terms).length);
  content.coverageLinks.forEach(l => {
    if (l.basis !== "scheduled" || l.schedule !== type) return;
    if (ch.action === "remove") l.itemKeys = l.itemKeys.filter(k => k !== key);
    else if (ch.action === "add" && (ch.coverages || []).indexOf(l.coverageKey) > -1) l.itemKeys = l.itemKeys.concat([key]);
  });
  content.coverageLinks.forEach(l => { if (l.basis === "scheduled") sub.coverageRisk = Object.assign(sub.coverageRisk || {}, { [l.coverageKey]: { basis: "scheduled", schedule: l.schedule, items: l.itemKeys.slice() } }); });
  const eff = ch.effective || rvToday();
  cur.effectiveTo = eff;
  const rec = rvCapture(sub, "policy", ch.ref || null, { content: content, copiedFrom: cur.id, effectiveFrom: eff });
  rvLog(sub, "risk_endorsed", label + ", effective " + eff + (ch.ref ? " (" + ch.ref + ")" : "") + ". New policy risk version " + rec.id + " from " + cur.id + ".");
  rvSave();
  return { ok: true, version: rec, lineageKey: key, label: label };
}

// ----------------------------------------------------------------------------
// 7. HOOKS INTO THE EXISTING FLOW
// ----------------------------------------------------------------------------
// the risk is taken in at Confirm: a submission risk version
var _rvOrigApply = window.applyNormalizedDataToSubmission;
window.applyNormalizedDataToSubmission = function (subId) {
  const r = _rvOrigApply.apply(this, arguments);
  try { const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (sub && !rvIsBound(sub) && !sub.quoteIssued) { const rv = rvCapture(sub, "submission", "V" + ((sub.submissionVersions || []).length || 1)); rvRender(sub); return r; } } catch (e) { console.warn("Risk version at Confirm failed:", e); }
  return r;
};

// a new submission version (the customer changed something) is a new risk version, and the version points at it
var _rvOrigSaveEdit = window.saveSubmissionDataEdit;
window.saveSubmissionDataEdit = function () {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === editSubmissionTargetId);
  if (sub && rvIsBound(sub) && hasPermission("submissionData", "edit")) {
    const changed = ["insured", "fein", "address", "exposureVal"].filter(k => { const e = document.getElementById("editSubField_" + k); return e && String(e.value) !== String(sub[k] === undefined ? "" : sub[k]); });
    if (changed.length) {
      rvLog(sub, "risk_edit_blocked", "Edit of " + changed.join(", ") + " refused: the policy is bound, so a change to the risk is an endorsement.");
      showToast("⛔ The policy is bound. A change to " + changed.map(k => ({ insured: "the named insured", fein: "the FEIN", address: "the address", exposureVal: "the exposure" })[k]).join(", ") + " is made by endorsement in Policy Changes.", "danger");
      return;
    }
  }
  const before = sub ? (sub.submissionVersions || []).length : 0;
  const r = _rvOrigSaveEdit.apply(this, arguments);
  try {
    if (sub && (sub.submissionVersions || []).length > before) {
      const v = sub.submissionVersions[sub.submissionVersions.length - 1];
      if (!rvIsBound(sub)) { const rv = rvCapture(sub, "submission", "V" + v.version); v.riskVersionId = rv.id; }
      rvRender(sub);
    }
  } catch (e) { console.warn("Risk version for the submission version failed:", e); }
  return r;
};

// an issued quote freezes the risk it was priced on; the bound quote and the policy copy that same version
var _rvOrigRecordQuote = window.recordQuoteVersion;
window.recordQuoteVersion = function (sub, isBound) {
  const q = _rvOrigRecordQuote.apply(this, arguments);
  try {
    const s = sub || rvActiveSub();
    if (s && q) {
      if (!isBound) { const rv = rvCapture(s, "quote", q.versionId, { copiedFrom: (rvLatest(s, "submission") || rvLatest(s) || {}).id || null }); q.riskVersionId = rv.id; s.quoteRiskVersionId = rv.id; }
      else {
        const qrv = rvGet(s, s.quoteRiskVersionId) || rvLatest(s, "quote") || rvCapture(s, "quote", q.versionId);
        q.riskVersionId = qrv.id;
        if (!rvLatest(s, "policy")) { const pol = rvCapture(s, "policy", s.pasSync ? s.pasSync.policyNumber : q.versionId, { from: qrv, effectiveFrom: (s.pasSync && s.pasSync.effectiveDate) || rvToday() }); q.policyRiskVersionId = pol.id; rvLog(s, "risk_policy_frozen", "The policy's risk was frozen as " + pol.id + ", a copy of the quoted risk " + qrv.id + "."); }
      }
      rvRender(s);
    }
  } catch (e) { console.warn("Risk version for the quote failed:", e); }
  return q;
};

// the bind is refused if the risk changed after the quote it would bind
if (typeof registerGuard === "function") {
  registerGuard("bind", "risk changed since the quote", args => {
    const sub = SUBMISSIONS_DATASET.find(s => s.id === args[0]) || rvActiveSub(); if (!sub) return true;
    const q = rvGet(sub, sub.quoteRiskVersionId); if (!q) return true;
    if (rvHashActive(rvContentOf(sub)) === rvHashActive(q.content)) return true;
    const d = rvDrift(sub);
    rvLog(sub, "risk_bind_blocked", "Bind refused: the risk changed after quote " + q.contextRef + " (" + d.changes.slice(0, 3).join("; ") + ").");
    showToast("⛔ The risk changed after the quote was issued (" + d.changes.slice(0, 2).join("; ") + "). Issue a new quote before binding.", "danger");
    return false;
  });
}

// a renewal starts its own risk versions, but keeps the keys, so a vehicle is the same vehicle next year
if (typeof RN_RESET_FIELDS !== "undefined") ["riskVersions", "quoteRiskVersionId"].forEach(k => { if (RN_RESET_FIELDS.indexOf(k) === -1) RN_RESET_FIELDS.push(k); });
var _rvOrigRenewal = window.rnCreateRenewalSubmission;
if (typeof _rvOrigRenewal === "function") {
  window.rnCreateRenewalSubmission = function (sub) {
    const polRv = rvPolicyRisk(sub) || rvLatest(sub, "policy");
    const copy = _rvOrigRenewal.apply(this, arguments);
    try { if (copy && polRv) { copy.riskSource = { subId: sub.id, riskVersionId: polRv.id, policyNumber: sub.pasSync ? sub.pasSync.policyNumber : null }; rvLog(copy, "risk_renewal_source", "Renewal risk starts from " + sub.id + " " + polRv.id + "; vehicle, driver and location keys carry over."); } } catch (e) { console.warn("Renewal risk source failed:", e); }
    return copy;
  };
}

// an endorsement that changes the schedule makes a new policy version
function rvFormChange() {
  const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ""; };
  const action = v("rv_action"); if (!action) return null;
  const type = ({ vehicle: "vehicle", driver: "driver", location: "location" })[v("pc_endType")] || v("rv_type");
  const attrs = {};
  if (type === "vehicle") { ["year", "make", "model", "vin"].forEach(k => { if (v("rv_a_" + k)) attrs[k] = k === "year" ? Number(v("rv_a_year")) || v("rv_a_year") : v("rv_a_" + k); }); if (v("rv_a_value")) attrs.stated_value = Number(v("rv_a_value")) || v("rv_a_value"); }
  else if (type === "driver") { if (v("rv_a_name")) attrs.name = v("rv_a_name"); if (v("rv_a_lic")) attrs.licenseNumber = v("rv_a_lic"); }
  else if (v("rv_a_address")) attrs.address = v("rv_a_address");
  const cov = Array.prototype.slice.call(document.querySelectorAll(".rv-cov-cb:checked")).map(e => e.value);
  return { action: action, type: type, lineageKey: v("rv_item"), attributes: attrs, coverages: cov };
}
var _rvOrigEndorse = window.pcIssueEndorsement;
if (typeof _rvOrigEndorse === "function") {
  window.pcIssueEndorsement = function () {
    const sub = typeof pcActiveSub === "function" ? pcActiveSub() : rvActiveSub();
    let ch = sub ? rvFormChange() : null;
    if (ch && !RV_TYPES[ch.type]) ch = null;
    if (sub && ch) {
      ch.effective = (document.getElementById("pc_endEff") || {}).value || rvToday();
      const errs = rvValidateChange(sub, ch);
      if (errs.length) { showToast("⛔ " + errs.join("; ") + ".", "danger"); return; }
    }
    const n = sub && typeof pcChanges === "function" ? pcChanges(sub).length : 0;
    const r = _rvOrigEndorse.apply(this, arguments);
    try {
      if (sub && ch && typeof pcChanges === "function" && pcChanges(sub).length > n) {
        const ev = pcChanges(sub)[pcChanges(sub).length - 1];
        const res = rvEndorse(sub, Object.assign({}, ch, { effective: ev.effective, ref: ev.id }));
        if (res.ok) { ev.riskVersionId = res.version.id; ev.riskChange = res.label; showToast(res.label + ". New policy risk version " + res.version.id + ".", "success"); }
        if (typeof renderPolicyChangesCard === "function") renderPolicyChangesCard(sub);
        rvRender(sub);
      }
    } catch (e) { console.warn("Risk version for the endorsement failed:", e); }
    return r;
  };
}

// the endorsement form gains the schedule change
var _rvOrigPcCard = window.renderPolicyChangesCard;
if (typeof _rvOrigPcCard === "function") {
  window.renderPolicyChangesCard = function (sub) {
    const r = _rvOrigPcCard.apply(this, arguments);
    try {
      const anchor = document.getElementById("pc_endDesc");
      if (anchor && sub && rvLatest(sub, "policy") && !document.getElementById("rv_action")) {
        const cur = rvLatest(sub, "policy").content;
        const items = cur.objects.filter(o => o.status === "active").map(o => `<option value="${o.lineageKey}" data-type="${o.type}">${rvEsc(RV_TYPES[o.type].label + " " + o.itemNo + " (" + o.lineageKey + "): " + rvObjectLabel(o))}</option>`).join("");
        const covs = cur.coverageLinks.filter(l => l.basis === "scheduled").map(l => `<label class="text-xs" style="margin-right:10px;"><input type="checkbox" class="rv-cov-cb" value="${l.coverageKey}"> ${rvEsc(l.line)}</label>`).join("");
        const d = document.createElement("div"); d.id = "rv_block"; d.style.cssText = "margin-top:8px;padding:8px;border:1px dashed var(--border-color,#cbd5e1);border-radius:6px;";
        d.innerHTML = `<div class="text-xs text-muted" style="margin-bottom:4px;">If this endorsement changes the schedule, say what changes. It makes a new policy risk version; the earlier one stays as it was.</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            <select id="rv_action" class="form-control form-control-sm" style="width:auto;"><option value="">No schedule change</option><option value="add">Add one</option><option value="remove">Remove one</option><option value="modify">Change one</option></select>
            <select id="rv_item" class="form-control form-control-sm" style="width:auto;max-width:330px;"><option value="">Which one (remove or change)</option>${items}</select>
            <input id="rv_a_year" class="form-control form-control-sm" style="width:80px;" placeholder="Year"><input id="rv_a_make" class="form-control form-control-sm" style="width:110px;" placeholder="Make"><input id="rv_a_model" class="form-control form-control-sm" style="width:110px;" placeholder="Model"><input id="rv_a_vin" class="form-control form-control-sm" style="width:170px;" placeholder="VIN"><input id="rv_a_value" class="form-control form-control-sm" style="width:110px;" placeholder="Stated value">
            <input id="rv_a_name" class="form-control form-control-sm" style="width:150px;" placeholder="Driver name"><input id="rv_a_lic" class="form-control form-control-sm" style="width:130px;" placeholder="Licence no."><input id="rv_a_address" class="form-control form-control-sm" style="width:220px;" placeholder="Location address">
          </div>${covs ? `<div style="margin-top:4px;" class="text-xs"><span class="text-muted">A new unit is covered by every blanket coverage. Also add it to:</span> ${covs}</div>` : ""}`;
        anchor.parentNode.insertBefore(d, anchor.nextSibling);
      }
    } catch (e) { console.warn("Schedule change block failed:", e); }
    return r;
  };
}
function rvObjectLabel(o) {
  const a = o.attributes || {};
  return o.type === "vehicle" ? [a.year, a.make, a.model].filter(Boolean).join(" ") + (a.vin ? " " + String(a.vin).slice(-6) : "") : o.type === "driver" ? (a.name || [a.given_name, a.last_name].filter(Boolean).join(" ") || a.licenseNumber || "") : (a.address || "");
}

var _rvOrigBrief = window.buildDecisionBrief;
window.buildDecisionBrief = function (sub) {
  const b = _rvOrigBrief.apply(this, arguments);
  try {
    if (rvList(sub).length) {
      const d = rvDrift(sub);
      b.checks.push(d.count ? dbCheck("Risk since the " + (rvIsBound(sub) ? "policy" : "last version"), "warn", d.count + " change(s) on the working copy that are not in " + d.reference.id + ": " + d.changes.slice(0, 2).join("; ") + ".") : dbCheck("Risk version", "ok", "The working copy matches " + d.reference.id + "."));
    }
  } catch (e) { console.warn("Brief additions failed:", e); }
  return b;
};

// ----------------------------------------------------------------------------
// 8. SCREENS
// ----------------------------------------------------------------------------
function rvCtxLabel(rv) { return { submission: "Submission", quote: "Quote", policy: "Policy" }[rv.contextType] + (rv.contextRef ? " " + rv.contextRef : ""); }
function rvRender(sub) {
  const hosts = ["riskVersionsContainer", "riskVersionsContainer2"].map(id => document.getElementById(id)).filter(Boolean);
  if (!hosts.length) return;
  if (!sub || (!rvList(sub).length && !(sub.vehicles || []).length && !(sub.drivers || []).length)) { hosts.forEach(h => { h.innerHTML = ""; }); return; }
  rvEnsureLineage(sub);
  const bound = rvIsBound(sub), drift = rvDrift(sub), vers = rvList(sub);
  const ref = drift.reference;
  const badge = !ref ? '<span class="badge badge-light">Working copy only</span>' : drift.count ? `<span class="badge badge-warning">${drift.count} change(s) not in ${rvEsc(ref.id)}</span>` : `<span class="badge badge-success">Matches ${rvEsc(ref.id)}</span>`;
  const verRows = vers.slice().reverse().map(rv => `<tr><td><strong>${rvEsc(rv.id)}</strong></td><td>${rvEsc(rvCtxLabel(rv))}</td><td>${rvEsc(rv.copiedFromId || "-")}</td><td>${rv.content.objects.filter(o => o.status === "active").length}${rv.content.objects.some(o => o.status === "excluded") ? " (+" + rv.content.objects.filter(o => o.status === "excluded").length + " removed)" : ""}</td><td>${rvEsc(rv.effectiveFrom || "-")}${rv.effectiveTo ? " to " + rvEsc(rv.effectiveTo) : rv.contextType === "policy" ? " to open" : ""}</td><td class="font-mono ws-small">${rvEsc(rv.snapshotHash.split(":")[0])}</td><td>${rvVerify(rv) ? '<span class="badge badge-success">Frozen, intact</span>' : '<span class="badge badge-danger">Altered</span>'}</td><td class="ws-small">${rvEsc(rv.createdBy)}<div class="text-xs text-muted">${rvEsc(rv.createdAt)}</div></td></tr>`).join("");
  const cur = ref ? ref.content : rvContentOf(sub), live = rvContentOf(sub);
  const objRows = live.objects.map(o => {
    const covers = live.coverageLinks.filter(l => rvCovered(live, l.coverageKey, o.lineageKey)).map(l => l.line);
    return `<tr><td><strong>${rvEsc(o.lineageKey)}</strong></td><td>${rvEsc(RV_TYPES[o.type].label)} ${o.itemNo}</td><td>${rvEsc(rvObjectLabel(o))}</td><td class="ws-small">${covers.length ? rvEsc(covers.join(", ")) : '<span class="text-muted">No coverage</span>'}</td></tr>`;
  }).join("");
  const canEdit = hasPermission("submissionData", "edit") && !bound;
  const linkRows = live.coverageLinks.map(l => {
    const keys = l.basis === "scheduled" ? l.itemKeys.join(", ") : l.basis === "blanket" ? "all " + (l.schedule || "") + "s on the schedule" : "the policy";
    const edit = canEdit ? `<select id="rv_basis_${l.coverageKey}" class="form-control form-control-sm" style="width:auto;display:inline-block;" onchange="rvUiLinkBasis('${sub.id}','${l.coverageKey}')">${Object.keys(RV_COVERAGE_BASES).map(b => `<option value="${b}" ${l.basis === b ? "selected" : ""}>${rvEsc(RV_COVERAGE_BASES[b])}</option>`).join("")}</select>` : rvEsc(RV_COVERAGE_BASES[l.basis]);
    return `<tr><td>${rvEsc(l.line)}</td><td>${edit}</td><td class="ws-small">${rvEsc(keys)}</td></tr>`;
  }).join("");
  const driftHtml = drift.count ? `<div class="alert alert-warning ws-small" style="margin:8px 0;"><strong>The working copy differs from ${rvEsc(ref.id)} (${rvEsc(rvCtxLabel(ref))}).</strong> ${bound ? "These changes are not in force. A change to a bound policy is made by endorsement." : (ref.contextType === "quote" ? "Issue a new quote before binding; the bind is refused while they stand." : "The next quote takes a new copy.")}<ul style="margin:4px 0 0 18px;">${drift.changes.slice(0, 6).map(c => `<li>${rvEsc(c)}</li>`).join("")}</ul></div>` : "";
  const html = `<div class="card" style="margin-top:12px;"><div class="card-header"><h3><i class="ph ph-lock-key"></i> Risk versions and schedules</h3>${badge}</div><div class="card-body">
    <p class="ws-small text-muted" style="margin:0 0 6px;">Each submission version, issued quote and the policy keeps its own frozen copy of the risk. The fields on the case are the working copy. A unit keeps its key (VEH-2) through quotes, endorsements and renewal.</p>
    ${driftHtml}
    <table class="data-table"><thead><tr><th>Version</th><th>For</th><th>Copied from</th><th>Units</th><th>In force</th><th>Fingerprint</th><th>State</th><th>By</th></tr></thead><tbody>${verRows || '<tr><td colspan="8" class="text-muted">Nothing frozen yet. The first copy is made when the submission is confirmed or a quote is issued.</td></tr>'}</tbody></table>
    <div class="uwp-subsection-title" style="margin-top:10px;">Units on the working copy and what covers them</div>
    <table class="data-table"><thead><tr><th>Key</th><th>Unit</th><th>Description</th><th>Covered by</th></tr></thead><tbody>${objRows || '<tr><td colspan="4" class="text-muted">No vehicles, drivers or locations.</td></tr>'}</tbody></table>
    <div class="uwp-subsection-title" style="margin-top:10px;">How each coverage applies</div>
    <table class="data-table"><thead><tr><th>Coverage</th><th>Applies</th><th>To</th></tr></thead><tbody>${linkRows || '<tr><td colspan="3" class="text-muted">No coverages on the case.</td></tr>'}</tbody></table>
    ${bound ? '<p class="ws-small text-muted" style="margin:6px 0 0;">The policy is bound; how a coverage applies changes by endorsement.</p>' : ""}
  </div></div>`;
  hosts.forEach(h => { h.innerHTML = html; });
}
function rvUiLinkBasis(subId, covKey) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId); if (!sub) return;
  const sel = document.getElementById("rv_basis_" + covKey), basis = sel ? sel.value : "";
  const objs = rvObjectsOf(sub), schedule = ["vehicle", "driver", "location"].find(t => objs.some(o => o.type === t && o.status === "active")) || null;
  const link = basis === "policy" ? { basis: "policy" } : { basis: basis, schedule: (rvResolveLinks(sub, objs, rvCoveragesOf(sub)).find(l => l.coverageKey === covKey) || {}).schedule || schedule, items: basis === "scheduled" ? objs.filter(o => o.type === ((rvResolveLinks(sub, objs, rvCoveragesOf(sub)).find(l => l.coverageKey === covKey) || {}).schedule || schedule) && o.status === "active").map(o => o.lineageKey) : null };
  const r = rvSetCoverageLink(sub, covKey, link);
  if (!r.ok && r.errors) showToast(r.errors[0], "warning"); else if (!r.ok && r.error === "bound") showToast("The policy is bound; change how a coverage applies by endorsement.", "warning");
  rvRender(sub);
}
registerStepRenderer("riskVersions", rvRender);

(function installRvAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  const m = (label, icon, badge, outcome) => ({ label: label, icon: icon, badge: badge, outcome: outcome });
  AUDIT_ACTION_META.risk_policy_frozen = m("Policy Risk Frozen", "ph-lock-key", "badge-success", "outcome-approve");
  AUDIT_ACTION_META.risk_endorsed = m("Policy Risk Endorsed", "ph-pencil-simple", "badge-info", "outcome-approve");
  AUDIT_ACTION_META.risk_bind_blocked = m("Bind Refused: Risk Changed", "ph-prohibit", "badge-danger", "outcome-decline");
  AUDIT_ACTION_META.risk_edit_blocked = m("Risk Edit Refused After Bind", "ph-prohibit", "badge-danger", "outcome-decline");
  AUDIT_ACTION_META.risk_link_set = m("Coverage Link Set", "ph-link", "badge-info", "outcome-approve");
  AUDIT_ACTION_META.risk_renewal_source = m("Renewal Risk Source", "ph-arrows-clockwise", "badge-info", "outcome-approve");
})();

Object.assign(window, { rvEnsureLineage, rvNewKey, rvContentOf, rvCapture, rvList, rvGet, rvLatest, rvVerify, rvDiff, rvDiffText, rvDrift, rvPolicyRisk, rvReference, rvCovered, rvResolveLinks, rvValidateLink, rvSetCoverageLink, rvSetScheduleTerms, rvValidateChange, rvEndorse, rvHashActive, rvRender, rvUiLinkBasis, rvDefaultLink, RV_TYPES });
