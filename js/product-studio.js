/**
 * ============================================================================
 * PRODUCT STUDIO: BASE AND OVERRIDE VERSIONS, SHARED LIMIT GROUPS, STATE AVAILABILITY, RELEASES
 * ----------------------------------------------------------------------------
 * A product was one ingested JSON file. Everything the product says about coverages, limits and availability was read straight from
 * it, for every case, with no layers, no state rules and no record of which configuration a quote ran on. This adds four things on top
 * of the ingested product.
 *
 *   BASE AND OVERRIDE  The carrier owns the base version. An MGU (or program) builds an override version that stores only its CHANGES,
 *                      and only those the carrier allowed: an override permission names what may change (remove a coverage, make one
 *                      required, restrict a limit, adjust a rating factor, disable, tighten or add an underwriting rule), by how much,
 *                      and whether the carrier must approve it or file it first. The effective configuration is the base plus the
 *                      APPROVED overrides; a revision of the base reaches the override by itself.
 *   LIMIT GROUPS       One limit shared by several coverages (a 1,000,000 combined single limit over bodily injury and property damage),
 *                      in a hierarchy (per occurrence under an aggregate). A coverage in several groups of one limit type needs a distinct
 *                      EROSION CATEGORY for each (premises and operations against products and completed operations), and is never in a
 *                      group and its ancestor. Option sets pair concurrent options (1M per occurrence with 2M aggregate) and are chosen
 *                      together. A state group replaces the all-states group of the same code for that state. At issue each group
 *                      becomes a limit bucket on the policy; a loss erodes the bucket for its coverage and category, then its ancestors,
 *                      and never below zero.
 *   STATE AVAILABILITY Each coverage is available, required or not available, for all states and then state by state. A required
 *                      coverage may be REJECTABLE in writing (Texas UM/UIM): it is then needed unless a signed rejection on the named
 *                      form is recorded. A coverage outside the product's states is not offered.
 *   RELEASES           A release is the compiled, hashed, immutable configuration a scope runs on (state, program, channel, distributor,
 *                      new or renewal, dates). It is validated (blocking issues stop it), tested against a regression suite, simulated
 *                      against the book, approved by someone other than its author, published (the release it replaces is superseded),
 *                      rolled back by republishing a superseded one, and retired. Quotes record the release they ran on.
 *
 * With no release published for a case nothing here applies and the prototype behaves as before. The rate simulation scales a case's
 * premium by the ratio of the factor multipliers; the rating engine itself is external. Fees, limits and rates in any example are
 * ILLUSTRATIVE; filing and rejection forms must follow each state's own requirements.
 * ============================================================================
 */

const PS_KEY = "FUT_PRODUCT_STUDIO_V1";
const PS_LIMIT_TYPES = ["per_occurrence", "aggregate", "csl", "sublimit"];
const PS_LIMIT_BASES = ["per_accident", "per_vehicle", "per_term"];
const PS_AVAIL = ["available", "required", "not_available"];
const PS_TARGETS = { coverage: ["remove", "make_required"], limit: ["restrict"], factor: ["adjust"], uw_rule: ["disable", "tighten", "add"] };
const PS_MIN_REASON = 10;

function psEmpty() { return { products: {}, releases: [], runs: [], simulations: [], history: [] }; }
var PS = psEmpty();
function psEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function psNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function psToday() { return new Date().toISOString().slice(0, 10); }
function psActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function psActorKey() { return typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole] ? USER_ROLES_CONFIG[currentUserRole].name : String(currentUserRole); }
function psClone(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }
function psMoney(n) { return "$" + Math.round(Number(n) || 0).toLocaleString("en-US"); }
function psParseMoney(v) { const m = /-?[\d,]+(?:\.\d+)?/.exec(String(v === null || v === undefined ? "" : v).replace(/\s/g, "")); const n = m ? parseFloat(m[0].replace(/,/g, "")) : NaN; return isNaN(n) ? null : n; }
function psNorm(v) { return String(v === null || v === undefined ? "" : v).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function psStable(v) { if (Array.isArray(v)) return "[" + v.map(psStable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + psStable(v[k])).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }
function psHash(v) { const s = psStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) + ":" + s.length; }
function psFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(k => psFreeze(o[k])); } return o; }
function psIn(o, d) { return (!o.from || o.from <= d) && (!o.to || d <= o.to); }
function psOverlap(a, b) { return (!a.to || !b.from || a.to >= b.from) && (!b.to || !a.from || b.to >= a.from); }
function psNextId(list, prefix) { let n = 0; (list || []).forEach(x => { const m = new RegExp("^" + prefix + "-(\\d+)$").exec(x.id); if (m) n = Math.max(n, +m[1]); }); return prefix + "-" + (n + 1); }
function psSave() { try { localStorage.setItem(PS_KEY, JSON.stringify(PS)); } catch (e) { /* storage unavailable: kept for this session */ } }
(function psLoadStore() { try { const raw = localStorage.getItem(PS_KEY); if (raw) { const st = JSON.parse(raw); if (st && st.products) PS = Object.assign(psEmpty(), st); } } catch (e) { /* damaged store ignored */ } })();
function psReset() { PS = psEmpty(); try { localStorage.removeItem(PS_KEY); } catch (e) { /* nothing stored */ } }
function psHist(action, text) { PS.history.push({ at: psNow(), by: psActor(), action: action, text: text }); if (PS.history.length > 100) PS.history = PS.history.slice(-100); }
function psProduct(id) { return PS.products[id] || null; }
function psVersion(prod, vid) { return prod ? (prod.versions || []).find(v => v.id === vid) || null : null; }
function psCanEdit() { if (!hasPermission("rateConfig", "edit")) { denyPermission("rateConfig", "edit"); return false; } return true; }
function psCanApprove() { if (!hasPermission("rateConfig", "approve")) { denyPermission("rateConfig", "approve"); return false; } return true; }

// ----------------------------------------------------------------------------
// 1. BASE, OVERRIDES AND THE EFFECTIVE CONFIGURATION
// ----------------------------------------------------------------------------
/** Everything wrong with an override against what the carrier allowed. [] when it is within a permission. */
function psCheckOverride(prod, ov, baseVersionId) {
  const errs = [], perms = (prod.permissions || []).filter(p => p.baseVersionId === baseVersionId);
  if (!PS_TARGETS[ov.targetType]) return ["The target must be one of " + Object.keys(PS_TARGETS).join(", ") + "."];
  if (PS_TARGETS[ov.targetType].indexOf(ov.action) === -1) return ["A " + ov.targetType + " override is " + PS_TARGETS[ov.targetType].join(" or ") + ", not " + ov.action + "."];
  const base = psVersion(prod, baseVersionId);
  if (!base) return ["The base version does not exist."];
  const exists = ov.action === "add" || (ov.targetType === "coverage" && base.coverages.some(c => c.code === ov.targetRef)) || (ov.targetType === "factor" && (base.ratingFactors || []).some(f => f.code === ov.targetRef)) || (ov.targetType === "uw_rule" && (base.uwRules || []).some(r => r.id === ov.targetRef)) || (ov.targetType === "limit" && ((prod.limitOptions || []).some(o => o.coverageCode === ov.targetRef) || (prod.limitGroups || []).some(g => g.code === ov.targetRef)));
  if (!exists) errs.push(ov.targetType + " " + ov.targetRef + " is not in the base version.");
  const perm = perms.find(p => p.targetType === ov.targetType && (p.targetRef === "*" || p.targetRef === ov.targetRef) && p.allowedActions.indexOf(ov.action) > -1);
  if (!perm) { errs.push("The carrier has not allowed " + ov.action + " on " + ov.targetType + " " + ov.targetRef + "."); return errs; }
  if (["adjust", "restrict", "tighten"].indexOf(ov.action) > -1) {
    const v = Number(ov.value);
    if (ov.value === undefined || ov.value === null || ov.value === "" || isNaN(v)) errs.push("Give the value as a number.");
    else { if (perm.min !== null && perm.min !== undefined && v < perm.min) errs.push("The value " + v + " is below the " + perm.min + " the carrier allows."); if (perm.max !== null && perm.max !== undefined && v > perm.max) errs.push("The value " + v + " is above the " + perm.max + " the carrier allows."); }
  }
  ov._permissionId = perm.id;
  return errs;
}

/** The configuration a version stands for: the base, or the base with the APPROVED overrides of an override version applied. Pure. */
function psEffective(prod, versionId) {
  const v = psVersion(prod, versionId); if (!v) return null;
  const baseId = v.kind === "override" ? v.baseVersionId : v.id, base = psVersion(prod, baseId);
  const vo = x => x.versionId || psFirstBase(prod);   // rows without a version belong to the first base version
  const cfg = { productId: prod.productId, name: prod.name, baseVersionId: baseId, versionId: versionId, jurisdictions: (prod.jurisdictions || []).slice(),
    coverages: psClone(base.coverages), uwRules: psClone(base.uwRules || []), ratingFactors: psClone(base.ratingFactors || []),
    limitGroups: psClone((prod.limitGroups || []).filter(g => vo(g) === baseId)), groupCoverages: [], limitOptions: psClone(prod.limitOptions || []), coverageStates: psClone((prod.coverageStates || []).filter(s => vo(s) === baseId)), applied: [], pending: [] };
  const gids = cfg.limitGroups.map(g => g.id);
  cfg.groupCoverages = psClone((prod.groupCoverages || []).filter(m => gids.indexOf(m.groupId) > -1));
  cfg.limitOptions = cfg.limitOptions.filter(o => (o.groupId && gids.indexOf(o.groupId) > -1) || (o.coverageCode && vo(o) === baseId && base.coverages.some(c => c.code === o.coverageCode)));
  if (v.kind === "override") (v.overrides || []).forEach(o => {
    if (o.approvalStatus !== "approved") { cfg.pending.push(o.id); return; }
    cfg.applied.push(o.id);
    if (o.targetType === "coverage" && o.action === "remove") {
      cfg.coverages = cfg.coverages.filter(c => c.code !== o.targetRef);
      cfg.coverageStates = cfg.coverageStates.filter(s => s.coverageCode !== o.targetRef);
      cfg.limitOptions = cfg.limitOptions.filter(x => x.coverageCode !== o.targetRef);
      cfg.groupCoverages = cfg.groupCoverages.filter(m => m.coverageCode !== o.targetRef);
    } else if (o.targetType === "coverage" && o.action === "make_required") {
      const c = cfg.coverages.find(x => x.code === o.targetRef); if (c) c.availability = "mandatory";
      cfg.coverageStates.forEach(s => { if (s.coverageCode === o.targetRef && s.availability === "available") s.availability = "required"; });
    } else if (o.targetType === "limit" && o.action === "restrict") {
      const max = Number(o.value), keep = x => Number(x.amount) <= max;
      const owner = x => (x.coverageCode === o.targetRef) || (x.groupId && (cfg.limitGroups.find(g => g.id === x.groupId) || {}).code === o.targetRef);
      const sets = {}; cfg.limitOptions.filter(owner).forEach(x => { (sets[(x.coverageCode || x.groupId) + "|" + (x.jurisdiction || "*")] = sets[(x.coverageCode || x.groupId) + "|" + (x.jurisdiction || "*")] || []).push(x); });
      cfg.limitOptions = cfg.limitOptions.filter(x => !owner(x) || keep(x));
      Object.keys(sets).forEach(k => { const left = cfg.limitOptions.filter(x => sets[k].some(y => y.id === x.id)); if (left.length && !left.some(x => x.isDefault)) left.sort((a, b) => b.amount - a.amount)[0].isDefault = true; });
    } else if (o.targetType === "factor" && o.action === "adjust") {
      const f = cfg.ratingFactors.find(x => x.code === o.targetRef); if (f) f.multiplier = Math.round(Number(f.multiplier) * Number(o.value) * 10000) / 10000;
    } else if (o.targetType === "uw_rule") {
      if (o.action === "add") cfg.uwRules.push({ id: o.targetRef, name: o.name || o.targetRef, type: o.ruleType || "refer", threshold: o.value === undefined ? null : o.value, active: true, addedBy: "override" });
      else { const r = cfg.uwRules.find(x => x.id === o.targetRef); if (r) { if (o.action === "disable") r.active = false; else r.threshold = Number(o.value); } }
    }
  });
  return cfg;
}

// ----------------------------------------------------------------------------
// 2. VALIDATION
// ----------------------------------------------------------------------------
function psIssue(check, item, message, blocking) { return { check: check, item: item || "", message: message, blocking: blocking !== false }; }

/** Every check a version must pass before it can be released, as issues. Blocking issues stop the release. */
function psValidateVersion(prod, versionId) {
  const out = [], v = psVersion(prod, versionId); if (!v) return [psIssue("version", versionId, "The version does not exist.")];
  const baseId = v.kind === "override" ? v.baseVersionId : v.id, base = psVersion(prod, baseId);
  if (!base) return [psIssue("version", versionId, "The base version does not exist.")];
  const cfg = psEffective(prod, versionId), codes = cfg.coverages.map(c => c.code), states = prod.jurisdictions || [];
  const groups = cfg.limitGroups, G = {}; groups.forEach(g => { G[g.id] = g; });
  // overrides against the carrier's permissions
  if (v.kind === "override") (v.overrides || []).forEach(o => {
    const e = psCheckOverride(prod, Object.assign({}, o), baseId); e.forEach(m => out.push(psIssue("override_permission", o.id, m)));
    const perm = (prod.permissions || []).find(p => p.id === (o._permissionId || ""));
    const perm2 = (prod.permissions || []).find(p => p.baseVersionId === baseId && p.targetType === o.targetType && (p.targetRef === "*" || p.targetRef === o.targetRef) && p.allowedActions.indexOf(o.action) > -1);
    const p = perm || perm2;
    if (p && p.requiresFiling && !String(o.filingRef || "").trim()) out.push(psIssue("missing_filing", o.id, "The carrier must file " + o.action + " on " + o.targetRef + " before this version can go live; no filing reference is recorded."));
    if (o.approvalStatus === "rejected") out.push(psIssue("override_rejected", o.id, o.action + " on " + o.targetRef + " was rejected, so it does not apply.", false));
    if (o.approvalStatus === "pending") out.push(psIssue("override_not_approved", o.id, o.action + " on " + o.targetRef + " is awaiting approval, so it does not apply yet.", false));
  });
  // coverage availability by state
  cfg.coverages.forEach(c => {
    const rows = cfg.coverageStates.filter(s => s.coverageCode === c.code);
    if (!rows.some(s => !s.jurisdiction)) out.push(psIssue("coverage_state", c.code, c.name + " has no all-states availability row; every coverage needs one, and state rows override it."));
    rows.forEach(s => {
      if (PS_AVAIL.indexOf(s.availability) === -1) out.push(psIssue("coverage_state", c.code, c.name + ": availability must be one of " + PS_AVAIL.join(", ") + "."));
      if (s.jurisdiction && states.length && states.indexOf(s.jurisdiction) === -1) out.push(psIssue("coverage_state", c.code, c.name + " is set for " + s.jurisdiction + ", a state the product is not offered in."));
      if (s.availability === "required" && s.rejectionAllowed && !String(s.rejectionFormRef || "").trim()) out.push(psIssue("rejection_form", c.code, c.name + " can be rejected in writing in " + (s.jurisdiction || "all states") + " but names no rejection form."));
      if (s.rejectionAllowed && s.availability !== "required") out.push(psIssue("rejection_form", c.code, c.name + ": only a required coverage can be rejectable.", false));
    });
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if ((rows[i].jurisdiction || "*") === (rows[j].jurisdiction || "*") && psOverlap(rows[i], rows[j])) out.push(psIssue("coverage_state", c.code, c.name + ": two availability rows for " + (rows[i].jurisdiction || "all states") + " overlap in time."));
  });
  // limit groups
  groups.forEach(g => {
    if (PS_LIMIT_TYPES.indexOf(g.limitType) === -1) out.push(psIssue("limit_group", g.code, "Group " + g.code + ": the limit type must be one of " + PS_LIMIT_TYPES.join(", ") + "."));
    if (g.limitBasis && PS_LIMIT_BASES.indexOf(g.limitBasis) === -1) out.push(psIssue("limit_group", g.code, "Group " + g.code + ": the limit basis must be one of " + PS_LIMIT_BASES.join(", ") + "."));
    if (g.parentGroupId) {
      const p = G[g.parentGroupId];
      if (!p) out.push(psIssue("limit_group", g.code, "Group " + g.code + ": the parent " + g.parentGroupId + " is not in this version."));
      else if ((p.from && g.from && g.from < p.from) || (p.to && (!g.to || g.to > p.to))) out.push(psIssue("limit_group", g.code, "Group " + g.code + ": its period must lie within its parent's."));
      let n = g, hops = 0; while (n && n.parentGroupId && hops++ < 50) { if (n.parentGroupId === g.id) { out.push(psIssue("limit_group", g.code, "Group " + g.code + ": the hierarchy loops back on itself.")); break; } n = G[n.parentGroupId]; }
    }
  });
  const ancestors = g => { const a = []; let n = G[g.parentGroupId], hops = 0; while (n && hops++ < 50) { a.push(n.id); n = G[n.parentGroupId]; } return a; };
  const mem = cfg.groupCoverages;
  mem.forEach(m => {
    if (!G[m.groupId]) return;
    if (codes.indexOf(m.coverageCode) === -1) out.push(psIssue("limit_group", m.coverageCode, "Group " + G[m.groupId].code + " lists " + m.coverageCode + ", which is not a coverage of this version."));
  });
  for (let i = 0; i < mem.length; i++) for (let j = i + 1; j < mem.length; j++) {
    const a = mem[i], b = mem[j], ga = G[a.groupId], gb = G[b.groupId]; if (!ga || !gb || a.coverageCode !== b.coverageCode) continue;
    if (a.groupId === b.groupId) { out.push(psIssue("limit_group", a.coverageCode, "Coverage " + a.coverageCode + " is listed twice in group " + ga.code + ".")); continue; }
    if (ancestors(ga).indexOf(gb.id) > -1 || ancestors(gb).indexOf(ga.id) > -1) { const kid = ancestors(ga).indexOf(gb.id) > -1 ? ga : gb, up = kid === ga ? gb : ga; out.push(psIssue("limit_group", a.coverageCode, "Coverage " + a.coverageCode + " is in group " + kid.code + " and its ancestor " + up.code + "; erosion flows up the hierarchy, so it would erode twice.")); continue; }
    if (ga.limitType === gb.limitType && psOverlap(ga, gb)) {
      const ka = [ga.limitType, ga.jurisdiction || "*", a.erosionCategory || "*"].join("|"), kb = [gb.limitType, gb.jurisdiction || "*", b.erosionCategory || "*"].join("|");
      if (ka === kb && ga.code !== gb.code) out.push(psIssue("limit_group", a.coverageCode, "Coverage " + a.coverageCode + " is in groups " + ga.code + " and " + gb.code + " of the same limit type" + (a.erosionCategory ? "" : " without an erosion category") + "; each membership needs a distinct erosion category."));
    }
  }
  // options
  const O = cfg.limitOptions;
  O.forEach(o => {
    const n = (o.coverageCode ? 1 : 0) + (o.groupId ? 1 : 0);
    if (n !== 1) { out.push(psIssue("limit_option", o.id, "Option " + o.id + " names either a coverage or a group, exactly one.")); return; }
    if (!(Number(o.amount) >= 0)) out.push(psIssue("limit_option", o.id, "Option " + o.id + ": the amount must be a number from 0."));
    if (o.groupId) {
      const g = G[o.groupId]; if (!g) { out.push(psIssue("limit_option", o.id, "Option " + o.id + ": the group " + o.groupId + " is not in this version.")); return; }
      if (o.limitType !== g.limitType) out.push(psIssue("limit_option", o.id, "Option " + o.id + " is " + o.limitType + " but its group " + g.code + " is " + g.limitType + "."));
      if (g.jurisdiction && o.jurisdiction !== g.jurisdiction) out.push(psIssue("limit_option", o.id, "Option " + o.id + ": a state group accepts only its own state's options; an all-states group accepts state options."));
    }
  });
  const sets = {}; O.filter(o => o.optionSetCode).forEach(o => { (sets[o.optionSetCode] = sets[o.optionSetCode] || []).push(o); });
  Object.keys(sets).forEach(k => {
    const s = sets[k];
    if (new Set(s.map(o => o.currency || "USD")).size > 1) out.push(psIssue("limit_option", k, "Option set " + k + " mixes currencies."));
    s.forEach(c => { const g = G[c.groupId]; if (!g || !g.parentGroupId) return; const p = s.find(x => x.groupId === g.parentGroupId); if (p && Number(c.amount) > Number(p.amount)) out.push(psIssue("limit_option", k, "Option set " + k + ": " + g.code + " (" + psMoney(c.amount) + ") is more than its parent group (" + psMoney(p.amount) + ")." )); });
  });
  // exactly one default per coverage or group and state; a required coverage has a default limit
  const owners = {}; O.forEach(o => { const key = (o.coverageCode || o.groupId); (owners[key] = owners[key] || []).push(o); });
  Object.keys(owners).forEach(key => {
    const list = owners[key], sts = Array.from(new Set(list.map(o => o.jurisdiction || "*")));
    ["*"].concat(sts.filter(s => s !== "*")).forEach(st => {
      const eff = st === "*" ? list.filter(o => !o.jurisdiction) : (list.filter(o => o.jurisdiction === st).length ? list.filter(o => o.jurisdiction === st) : list.filter(o => !o.jurisdiction));
      if (!eff.length) return;
      const byType = {}; eff.forEach(o => { (byType[o.groupId ? o.limitType : "single"] = byType[o.groupId ? o.limitType : "single"] || []).push(o); });
      Object.keys(byType).forEach(t => { const d = byType[t].filter(o => o.isDefault).length; if (d !== 1) out.push(psIssue("default_limit", key, (G[key] ? "Group " + G[key].code : "Coverage " + key) + (st === "*" ? "" : " in " + st) + " has " + d + " default limit options" + (t === "single" ? "" : " (" + t + ")") + "; it needs exactly one.")); });
    });
  });
  cfg.coverageStates.filter(s => s.availability === "required").forEach(s => {
    const direct = O.filter(o => o.coverageCode === s.coverageCode), grouped = mem.some(m => m.coverageCode === s.coverageCode);
    if (!direct.length && !grouped) out.push(psIssue("default_limit", s.coverageCode, "Coverage " + s.coverageCode + " is required" + (s.jurisdiction ? " in " + s.jurisdiction : "") + " but has no limit options, so it has no default limit.", true));
  });
  // broken references among states
  (prod.coverageStates || []).forEach(s => { if (!base.coverages.some(c => c.code === s.coverageCode)) out.push(psIssue("broken_reference", s.id, "An availability row names " + s.coverageCode + ", which is not a coverage.", false)); });
  return out;
}

/** Everything wrong with a product document as loaded: shape errors, as sentences. Version checks are made when a release is compiled. */
function psValidateDoc(doc) {
  const errs = [];
  if (!doc || !String(doc.productId || "").trim()) errs.push("The product has no id.");
  if (!Array.isArray(doc.versions) || !doc.versions.length) errs.push("The product has no versions.");
  const ids = {}; (doc.versions || []).forEach(v => {
    if (ids[v.id]) errs.push("Version " + v.id + ": the id is used twice."); ids[v.id] = v;
    if (["base", "override"].indexOf(v.kind) === -1) errs.push("Version " + v.id + ": the kind is base or override.");
    if (v.kind === "base" && !Array.isArray(v.coverages)) errs.push("Version " + v.id + " has no coverages.");
    if (v.kind === "override" && !ids[v.baseVersionId] && !(doc.versions || []).some(x => x.id === v.baseVersionId && x.kind === "base")) errs.push("Version " + v.id + ": its base " + v.baseVersionId + " is not a base version.");
  });
  (doc.versions || []).forEach(v => { if (v.kind === "base") { const seen = {}; (v.coverages || []).forEach(c => { if (!c.code) errs.push("A coverage in " + v.id + " has no code."); else if (seen[c.code]) errs.push("Coverage " + c.code + " is listed twice in " + v.id + "."); seen[c.code] = true; }); } });
  (doc.permissions || []).forEach(p => { if (!PS_TARGETS[p.targetType]) errs.push("Permission " + p.id + ": the target must be one of " + Object.keys(PS_TARGETS).join(", ") + "."); else if (!Array.isArray(p.allowedActions) || p.allowedActions.some(a => PS_TARGETS[p.targetType].indexOf(a) === -1)) errs.push("Permission " + p.id + ": the actions for " + p.targetType + " are " + PS_TARGETS[p.targetType].join(", ") + "."); });
  return errs;
}

// ----------------------------------------------------------------------------
// 3. LOADING AND CHANGING THE PRODUCT (drafts; nothing is live until a release is published)
// ----------------------------------------------------------------------------
/** The hash of everything a version stands on: its record, the groups, options, states and permissions. A release remembers it. */
function psFirstBase(prod) { const b = (prod.versions || []).find(x => x.kind === "base"); return b ? b.id : null; }
function psSourceHash(prod, versionId) {
  const v = psVersion(prod, versionId), baseId = v.kind === "override" ? v.baseVersionId : v.id, vo = x => x.versionId || psFirstBase(prod);
  const gids = (prod.limitGroups || []).filter(g => vo(g) === baseId).map(g => g.id);
  return psHash({ base: psVersion(prod, baseId), version: v, jur: prod.jurisdictions || [], perms: (prod.permissions || []).filter(p => p.baseVersionId === baseId), groups: (prod.limitGroups || []).filter(g => vo(g) === baseId), mem: (prod.groupCoverages || []).filter(m => gids.indexOf(m.groupId) > -1), opts: (prod.limitOptions || []).filter(o => o.groupId ? gids.indexOf(o.groupId) > -1 : vo(o) === baseId), states: (prod.coverageStates || []).filter(s => vo(s) === baseId) });
}
/** Loads or replaces a product's draft configuration. A version that a release already stands on cannot be changed: make a new version. */
function psLoadProduct(doc) {
  if (!psCanEdit()) return { ok: false, error: "permission" };
  const errs = psValidateDoc(doc); if (errs.length) return { ok: false, error: "invalid", errors: errs };
  const next = psClone(doc); next.ownerTenantId = next.ownerTenantId || null;
  ["permissions", "limitGroups", "groupCoverages", "limitOptions", "coverageStates", "testSuites"].forEach(k => { next[k] = next[k] || []; });
  const old = psProduct(next.productId);
  const core = o => psStable({ t: o.targetType, r: o.targetRef, a: o.action, v: o.value === undefined ? null : o.value, f: o.filingRef || "" });
  next.versions.forEach(v => {
    v.status = v.status || "draft";
    if (v.kind === "override") (v.overrides || []).forEach((o, i) => {
      o.id = o.id || "OVR-" + (i + 1);
      const prev = old && psVersion(old, v.id) && (psVersion(old, v.id).overrides || []).find(x => x.id === o.id && core(x) === core(o));
      if (prev) { o.approvalStatus = prev.approvalStatus; o.decidedBy = prev.decidedBy; o.decidedAt = prev.decidedAt; o.decisionNote = prev.decisionNote; o.addedBy = prev.addedBy; }
      else o.approvalStatus = psNeedsApproval(next, o, v.baseVersionId) ? "pending" : "approved";   // a file cannot approve its own override
    });
  });
  if (old) {
    const frozen = PS.releases.filter(r => r.productId === next.productId && ["approved", "published", "testing"].indexOf(r.status) > -1);
    const clash = frozen.find(r => !psVersion(next, r.versionId) || psSourceHash(next, r.versionId) !== r.sourceHash);
    if (clash) return { ok: false, error: "released", release: clash.id, version: clash.versionId };
  }
  PS.products[next.productId] = next; psHist("loaded", "Loaded product " + next.productId + " with " + next.versions.length + " version(s)."); psSave();
  return { ok: true };
}
function psNeedsApproval(prod, o, baseVersionId) {
  const p = (prod.permissions || []).find(x => x.baseVersionId === baseVersionId && x.targetType === o.targetType && (x.targetRef === "*" || x.targetRef === o.targetRef) && x.allowedActions.indexOf(o.action) > -1);
  return !!(p && p.requiresCarrierApproval);
}
/** An override is added to an override version only if the carrier's permission allows it. */
function psAddOverride(productId, versionId, ov) {
  if (!psCanEdit()) return { ok: false, error: "permission" };
  const prod = psProduct(productId), v = psVersion(prod, versionId);
  if (!v || v.kind !== "override") return { ok: false, error: "version" };
  const live = PS.releases.find(r => r.productId === productId && r.versionId === versionId && ["approved", "published", "testing"].indexOf(r.status) > -1);
  if (live) return { ok: false, error: "released", release: live.id };
  const o = psClone(ov), errs = psCheckOverride(prod, o, v.baseVersionId);
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  if (!v.overrides) v.overrides = [];
  o.id = psNextId(v.overrides, "OVR"); o.addedBy = psActor(); o.addedAt = psNow(); o.approvalStatus = psNeedsApproval(prod, o, v.baseVersionId) ? "pending" : "approved"; delete o._permissionId;
  v.overrides.push(o); psHist("override_added", productId + " " + o.id + ": " + o.action + " on " + o.targetRef + (o.approvalStatus === "pending" ? ", awaiting the carrier" : "") + "."); psSave();
  return { ok: true, override: o };
}
/** The carrier approves or rejects an override; not the person who added it. */
function psDecideOverride(productId, versionId, ovId, decision, reason) {
  if (!psCanApprove()) return { ok: false, error: "permission" };
  const prod = psProduct(productId), v = psVersion(prod, versionId), o = v && (v.overrides || []).find(x => x.id === ovId);
  if (!o) return { ok: false, error: "none" };
  if (o.approvalStatus !== "pending") return { ok: false, error: "decided" };
  if (o.addedBy === psActor()) return { ok: false, error: "self" };
  if (decision === "rejected" && String(reason || "").trim().length < PS_MIN_REASON) return { ok: false, error: "reason" };
  const live = PS.releases.find(r => r.productId === productId && r.versionId === versionId && ["approved", "published", "testing"].indexOf(r.status) > -1);
  if (live) return { ok: false, error: "released", release: live.id };
  o.approvalStatus = decision === "approved" ? "approved" : "rejected"; o.decidedBy = psActor(); o.decidedAt = psNow(); o.decisionNote = String(reason || "").trim();
  psHist("override_" + o.approvalStatus, productId + " " + o.id + " " + o.approvalStatus + " by " + psActor() + "."); psSave();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 4. WHAT A CONFIGURATION SAYS ABOUT A STATE, AND ABOUT A CASE
// ----------------------------------------------------------------------------
/** The availability of a coverage in a state on a date: the state row if there is one, else the all-states row. */
function psAvailability(cfg, code, state, date) {
  const d = date || psToday(), rows = cfg.coverageStates.filter(s => s.coverageCode === code && psIn(s, d));
  return (state && rows.find(s => s.jurisdiction === state)) || rows.find(s => !s.jurisdiction) || null;
}
/** The limit options in force for a coverage in a state: the state's own set replaces the all-states set. */
function psOptionsFor(cfg, code, state) {
  const own = cfg.limitOptions.filter(o => o.coverageCode === code), st = own.filter(o => o.jurisdiction && o.jurisdiction === state);
  return st.length ? st : own.filter(o => !o.jurisdiction);
}
/** What a configuration decides for a state and a set of selected coverages. Pure. */
function psEvaluate(cfg, input) {
  const state = input.state || null, d = input.date || psToday(), issues = [], sel = (input.coverages || []).slice(), rej = input.rejections || {};
  const out = { offered: true, required: [], notAvailable: [], missingRequired: [], rejected: [], defaults: {}, optionAmounts: {}, issues: issues };
  if (state && cfg.jurisdictions.length && cfg.jurisdictions.indexOf(state) === -1) { out.offered = false; issues.push("The product is not offered in " + state + "."); return out; }
  cfg.coverages.forEach(c => {
    const a = psAvailability(cfg, c.code, state, d), av = a ? a.availability : (c.availability === "mandatory" ? "required" : "available");
    if (av === "required") {
      out.required.push(c.code);
      if (sel.indexOf(c.code) === -1) {
        if (a && a.rejectionAllowed && rej[c.code]) out.rejected.push(c.code);
        else { out.missingRequired.push(c.code); issues.push(c.name + " is required" + (state ? " in " + state : "") + (a && a.rejectionAllowed ? " unless the insured rejects it in writing on " + a.rejectionFormRef : "") + "."); }
      } else if (rej[c.code]) issues.push(c.name + " is selected and also rejected; one of them is wrong.");
    } else if (av === "not_available") { out.notAvailable.push(c.code); if (sel.indexOf(c.code) > -1) issues.push(c.name + " is not available" + (state ? " in " + state : "") + "."); }
    const opts = psOptionsFor(cfg, c.code, state); if (opts.length) { out.optionAmounts[c.code] = opts.map(o => Number(o.amount)); const df = opts.find(o => o.isDefault); if (df) out.defaults[c.code] = Number(df.amount); }
  });
  (input.limits || []).forEach(l => { const opts = psOptionsFor(cfg, l.coverage, state); if (opts.length && !opts.some(o => Number(o.amount) === Number(l.amount))) issues.push((cfg.coverages.find(c => c.code === l.coverage) || { name: l.coverage }).name + " limit " + psMoney(l.amount) + " is not one of the limits offered" + (state ? " in " + state : "") + " (" + opts.map(o => psMoney(o.amount)).join(", ") + ")."); });
  sel.forEach(c => { if (!cfg.coverages.some(x => x.code === c)) issues.push("Coverage " + c + " is not part of this product."); });
  return out;
}

// ----------------------------------------------------------------------------
// 5. LIMIT GROUPS AT RUN TIME: BUCKETS AND EROSION
// ----------------------------------------------------------------------------
/** The groups that apply in a state: a state group replaces the all-states group of the same code. */
function psGroupsFor(cfg, state, date) {
  const d = date || psToday(), live = cfg.limitGroups.filter(g => psIn(g, d) && (!g.jurisdiction || g.jurisdiction === state));
  return live.filter(g => g.jurisdiction || !live.some(x => x.jurisdiction === state && x.code === g.code));
}
/** The option set a case runs on for a group hierarchy: the one chosen, else the default. */
function psSetFor(cfg, group, state, chosen) {
  const opts = cfg.limitOptions.filter(o => o.groupId === group.id), st = opts.filter(o => o.jurisdiction === state), pool = st.length ? st : opts.filter(o => !o.jurisdiction);
  if (chosen) { const m = pool.find(o => o.optionSetCode === chosen); if (m) return m; }
  return pool.find(o => o.isDefault) || null;
}
/** At issue each group of the release becomes a bucket on the policy, with its coverages and their erosion categories. */
function psIssueBuckets(sub, release, opts) {
  opts = opts || {};
  const cfg = release.config, state = opts.state || (typeof deriveRiskState === "function" ? deriveRiskState(sub) : null), groups = psGroupsFor(cfg, state, opts.date);
  const chosen = opts.sets !== undefined ? opts.sets : (sub.limitSets || {}), buckets = [];
  const idOf = {}, codeOf = id => (cfg.limitGroups.find(x => x.id === id) || {}).code, byCode = {};
  groups.forEach(g => {
    const o = psSetFor(cfg, g, state, chosen[g.code] || chosen[codeOf(g.parentGroupId)]) || psSetFor(cfg, g, state, null);
    const b = { id: "LB-" + (buckets.length + 1), groupId: g.id, code: g.code, limitType: g.limitType, limitBasis: g.limitBasis || null, amount: o ? Number(o.amount) : null, currency: o ? (o.currency || "USD") : "USD", optionSetCode: o ? o.optionSetCode || null : null, parentBucketId: null, memberships: cfg.groupCoverages.filter(m => m.groupId === g.id).map(m => ({ coverageCode: m.coverageCode, erosionCategory: m.erosionCategory || null })), status: "active", releaseId: release.id };
    idOf[g.id] = b.id; byCode[g.code] = b.id; buckets.push(b);
  });
  groups.forEach((g, i) => { if (g.parentGroupId) buckets[i].parentBucketId = idOf[g.parentGroupId] || byCode[codeOf(g.parentGroupId)] || null; });
  sub.limitBuckets = buckets; sub.limitTxns = []; sub.limitSets = Object.assign({}, chosen);
  return buckets;
}
function psBucketUsed(sub, bucket, occurrenceKey) {
  return (sub.limitTxns || []).filter(t => t.bucketId === bucket.id && (bucket.limitBasis === "per_accident" || bucket.limitType === "per_occurrence" ? t.occurrenceKey === (occurrenceKey || null) : true)).reduce((s, t) => s + t.consumed, 0);
}
/** What is left in a bucket (for one occurrence, if the bucket is per occurrence). Never below zero. */
function psAvailable(sub, bucket, occurrenceKey) { return Math.max(0, (bucket.amount === null ? 0 : bucket.amount) - psBucketUsed(sub, bucket, occurrenceKey)); }

/**
 * Erodes the limits a loss falls on. The bucket is the one that lists the coverage with the loss's erosion category, or the only bucket
 * of that type when there is no category; then its ancestors. What is payable is the least left anywhere on the way up, so no bucket
 * goes below zero; the rest is excess. Each bucket gets a numbered transaction.
 */
function psErode(sub, l) {
  if (!sub.limitBuckets || !sub.limitBuckets.length) return { ok: false, error: "no_buckets" };
  const amount = Number(l.amount); if (!(amount > 0)) return { ok: false, error: "amount" };
  const B = sub.limitBuckets, byId = {}; B.forEach(b => { byId[b.id] = b; });
  let cands = B.filter(b => b.memberships.some(m => m.coverageCode === l.coverageCode && (!l.erosionCategory || m.erosionCategory === l.erosionCategory)));
  if (l.erosionCategory === undefined || l.erosionCategory === null || l.erosionCategory === "") {
    const types = {}; cands.forEach(b => { (types[b.limitType] = types[b.limitType] || []).push(b); });
    // a coverage in two same-type groups cannot erode until the category says which
    const amb = Object.keys(types).find(t => types[t].length > 1 && !types[t].every(b => byId[b.parentBucketId] && types[t].some(x => x.id === b.parentBucketId)));
    if (amb && types[amb].length > 1) return { ok: false, error: "category_required", detail: "Coverage " + l.coverageCode + " is in more than one " + amb + " group; say which erosion category the loss belongs to." };
  } else cands = cands.filter(b => b.memberships.some(m => m.coverageCode === l.coverageCode && m.erosionCategory === l.erosionCategory));
  if (!cands.length) return { ok: false, error: "no_bucket", detail: "No limit applies to " + l.coverageCode + (l.erosionCategory ? " / " + l.erosionCategory : "") + "." };
  // leaf buckets: the candidates that are not an ancestor of another candidate
  const leafs = cands.filter(b => !cands.some(x => x.id !== b.id && (function up(n) { while (n && n.parentBucketId) { if (n.parentBucketId === b.id) return true; n = byId[n.parentBucketId]; } return false; })(x)));
  const chain = []; leafs.forEach(lf => { let n = lf, hops = 0; while (n && hops++ < 50) { if (!chain.some(c => c.id === n.id)) chain.push(n); n = n.parentBucketId ? byId[n.parentBucketId] : null; } });
  const occ = l.occurrenceKey || null;
  const payable = Math.min(amount, ...chain.map(b => psAvailable(sub, b, occ)));
  const txns = [];
  chain.forEach(b => {
    const n = (sub.limitTxns || []).filter(t => t.bucketId === b.id).length + 1;
    const before = psAvailable(sub, b, occ), t = { id: "LT-" + ((sub.limitTxns || []).length + 1), bucketId: b.id, sequenceNo: n, kind: l.kind || "payment", coverageCode: l.coverageCode, erosionCategory: l.erosionCategory || null, occurrenceKey: occ, claimId: l.claimId || null, requested: amount, consumed: payable, excess: Math.max(0, amount - payable), availableAfter: before - payable, reversesId: null, at: psNow(), by: psActor() };
    sub.limitTxns.push(t); txns.push(t);
  });
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, payable: payable, excess: Math.max(0, amount - payable), txns: txns, buckets: chain.map(b => b.id) };
}
/** A reversal gives back what a transaction took, once; the original is never edited. */
function psReverseErosion(sub, txnId) {
  const t = (sub.limitTxns || []).find(x => x.id === txnId); if (!t) return { ok: false, error: "none" };
  if (t.reversesId) return { ok: false, error: "is_reversal" };
  if ((sub.limitTxns || []).some(x => x.reversesId === txnId)) return { ok: false, error: "already" };
  const b = (sub.limitBuckets || []).find(x => x.id === t.bucketId), n = (sub.limitTxns || []).filter(x => x.bucketId === t.bucketId).length + 1;
  const r = { id: "LT-" + ((sub.limitTxns || []).length + 1), bucketId: t.bucketId, sequenceNo: n, kind: "reversal", coverageCode: t.coverageCode, erosionCategory: t.erosionCategory, occurrenceKey: t.occurrenceKey, claimId: t.claimId, requested: -t.consumed, consumed: -t.consumed, excess: 0, availableAfter: 0, reversesId: t.id, at: psNow(), by: psActor() };
  sub.limitTxns.push(r); r.availableAfter = psAvailable(sub, b, t.occurrenceKey);
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true, reversal: r };
}

// ----------------------------------------------------------------------------
// 6. RELEASES
// ----------------------------------------------------------------------------
function psRelease(id) { return PS.releases.find(r => r.id === id) || null; }
function psScopesOverlap(a, b) {
  const same = (x, y) => !x || !y || x === y;
  return same(a.jurisdiction, b.jurisdiction) && same(a.program, b.program) && same(a.channel, b.channel) && same(a.distributionAgreementId, b.distributionAgreementId) && (a.businessType === "both" || b.businessType === "both" || !a.businessType || !b.businessType || a.businessType === b.businessType) && psOverlap(a, b);
}
function psScopeSame(a, b) {
  const eq = (x, y) => (x || null) === (y || null);
  return eq(a.jurisdiction, b.jurisdiction) && eq(a.program, b.program) && eq(a.channel, b.channel) && eq(a.distributionAgreementId, b.distributionAgreementId) && (a.businessType || "both") === (b.businessType || "both") && psOverlap(a, b);
}
function psSetStatus(r, status, note) { r.status = status; r.statusHistory.push({ status: status, at: psNow(), by: psActor(), note: note || "" }); }
function psScopeErrors(s, prod) {
  const e = [], ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!s.from || !ymd.test(s.from)) e.push("The scope starts on a date (yyyy-mm-dd).");
  if (s.to && !ymd.test(s.to)) e.push("The scope ends on a date or is open.");
  if (s.from && s.to && s.to < s.from) e.push("The scope ends before it starts.");
  if (s.jurisdiction && (prod.jurisdictions || []).length && prod.jurisdictions.indexOf(s.jurisdiction) === -1) e.push("The product is not offered in " + s.jurisdiction + ".");
  if (s.businessType && ["new", "renewal", "both"].indexOf(s.businessType) === -1) e.push("Business type is new, renewal or both.");
  return e;
}
/** Compiles a version into a release: the resolved configuration, frozen and hashed, with its validation issues. A draft until tested and approved. */
function psCreateRelease(productId, versionId, scope, notes) {
  if (!psCanEdit()) return { ok: false, error: "permission" };
  const prod = psProduct(productId), v = psVersion(prod, versionId); if (!v) return { ok: false, error: "version" };
  const sc = Object.assign({ jurisdiction: null, program: null, channel: null, distributionAgreementId: null, businessType: "both", from: v.from || psToday(), to: v.to || null }, psClone(scope || {}));
  const se = psScopeErrors(sc, prod); if (se.length) return { ok: false, error: "scope", errors: se };
  const cfg = psEffective(prod, versionId), issues = psValidateVersion(prod, versionId);
  const prev = PS.releases.filter(r => r.productId === productId && r.status === "published" && psScopeSame(r.scope, sc));
  const rec = { id: psNextId(PS.releases, "REL"), productId: productId, versionId: versionId, baseVersionId: cfg.baseVersionId, releaseNo: PS.releases.filter(r => r.productId === productId).length + 1, scope: sc, status: "draft", statusHistory: [], notes: String(notes || "").trim(), sourceHash: psSourceHash(prod, versionId), manifestHash: psHash(cfg), config: psFreeze(cfg), issues: issues, createdBy: psActor(), createdByKey: psActorKey(), createdAt: psNow(), supersedesId: prev.length ? prev[prev.length - 1].id : null, testRunIds: [], simulationIds: [], approval: null, publishedBy: null, publishedAt: null, retiredAt: null };
  psSetStatus(rec, "draft", "compiled");
  PS.releases.push(rec); psHist("release_created", rec.id + " compiled from " + productId + " " + versionId + " with " + issues.filter(i => i.blocking).length + " blocking issue(s)."); psSave();
  return { ok: true, release: rec };
}
function psVerifyRelease(r) { return !!r && psHash(r.config) === r.manifestHash; }
function psBlocking(r) { return r.issues.filter(i => i.blocking); }

/** Runs a regression suite against a release's compiled configuration. Each case says what it expects of the configuration. */
function psRunTests(releaseId, suiteId) {
  if (!psCanEdit()) return { ok: false, error: "permission" };
  const r = psRelease(releaseId); if (!r) return { ok: false, error: "release" };
  if (["draft", "testing"].indexOf(r.status) === -1) return { ok: false, error: "status" };
  const prod = psProduct(r.productId), suite = (prod.testSuites || []).find(s => s.id === suiteId); if (!suite) return { ok: false, error: "suite" };
  if (!(suite.cases || []).length) return { ok: false, error: "empty" };
  const results = suite.cases.map(c => {
    const got = psEvaluate(r.config, c.input || {}), ex = c.expected || {}, fails = [];
    if (ex.offered !== undefined && got.offered !== ex.offered) fails.push("offered " + got.offered + ", expected " + ex.offered);
    ["required", "notAvailable", "missingRequired", "rejected"].forEach(k => { if (ex[k] !== undefined && psStable(got[k].slice().sort()) !== psStable(ex[k].slice().sort())) fails.push(k + " " + JSON.stringify(got[k]) + ", expected " + JSON.stringify(ex[k])); });
    if (ex.defaults) Object.keys(ex.defaults).forEach(k => { if (got.defaults[k] !== ex.defaults[k]) fails.push("default limit of " + k + " is " + got.defaults[k] + ", expected " + ex.defaults[k]); });
    if (ex.optionAmounts) Object.keys(ex.optionAmounts).forEach(k => { if (psStable((got.optionAmounts[k] || []).slice().sort((a, b) => a - b)) !== psStable(ex.optionAmounts[k].slice().sort((a, b) => a - b))) fails.push("limit options of " + k + " are " + JSON.stringify(got.optionAmounts[k] || []) + ", expected " + JSON.stringify(ex.optionAmounts[k])); });
    if (ex.issueCount !== undefined && got.issues.length !== ex.issueCount) fails.push(got.issues.length + " issue(s), expected " + ex.issueCount);
    (ex.issuesContain || []).forEach(s => { if (!got.issues.some(i => i.indexOf(s) > -1)) fails.push("no issue mentions \"" + s + "\""); });
    return { name: c.name, outcome: fails.length ? "fail" : "pass", diff: fails };
  });
  const run = { id: psNextId(PS.runs, "RUN"), releaseId: releaseId, suiteId: suiteId, manifestHash: r.manifestHash, passed: results.filter(x => x.outcome === "pass").length, failed: results.filter(x => x.outcome === "fail").length, results: results, by: psActor(), at: psNow() };
  PS.runs.push(run); r.testRunIds.push(run.id); if (r.status === "draft") psSetStatus(r, "testing", "tests run");
  psHist("tests_run", r.id + " " + suite.name + ": " + run.passed + " passed, " + run.failed + " failed."); psSave();
  return { ok: true, run: run };
}

/** What a configuration does to the cases in scope: which would now breach availability or offered limits, and the premium effect of the rating factors. */
function psSimulate(candidateId, baselineId, dataset) {
  if (!psCanEdit()) return { ok: false, error: "permission" };
  const c = psRelease(candidateId); if (!c) return { ok: false, error: "release" };
  const b = baselineId ? psRelease(baselineId) : (c.supersedesId ? psRelease(c.supersedesId) : null);
  const data = dataset || (typeof SUBMISSIONS_DATASET !== "undefined" ? SUBMISSIONS_DATASET : []);
  const inScope = data.filter(s => psSubMatchesScope(s, c.scope, c.productId));
  const impacted = [], counts = { quotes: 0, policies: 0, renewals: 0 }, items = {}; let basePrem = 0, candPrem = 0;
  const fp = cfg => (cfg.ratingFactors || []).reduce((p, f) => p * (Number(f.multiplier) || 1), 1);
  const ratio = b ? fp(c.config) / fp(b.config) : 1;
  inScope.forEach(s => {
    const input = psCaseInput(s), st = input.state;
    const nc = psEvaluate(c.config, psCaseInput(s, c)), nb = b ? psEvaluate(b.config, psCaseInput(s, b)) : { issues: [] };
    const fresh = nc.issues.filter(i => nb.issues.indexOf(i) === -1);
    const prem = typeof authMeasures === "function" ? authMeasures(s).premium : 0;
    if (s.quoteIssued || (s.pasSync && s.pasSync.status === "success")) { basePrem += prem; candPrem += prem * ratio; }
    if (fresh.length) {
      impacted.push({ subId: s.id, insured: s.insured, state: st, issues: fresh });
      if (s.renewalOf) counts.renewals++; else if (s.pasSync && s.pasSync.status === "success") counts.policies++; else counts.quotes++;
      fresh.forEach(i => { items[i] = (items[i] || 0) + 1; });
    }
  });
  const sim = { id: psNextId(PS.simulations, "SIM"), candidateReleaseId: c.id, baselineReleaseId: b ? b.id : null, policyCount: inScope.length, impactedQuotes: counts.quotes, impactedPolicies: counts.policies, impactedRenewals: counts.renewals, impactedItems: items, impacted: impacted, baselinePremium: Math.round(basePrem), candidatePremium: Math.round(candPrem), changePct: basePrem ? Math.round((candPrem - basePrem) / basePrem * 10000) / 100 : 0, factorRatio: Math.round(ratio * 10000) / 10000, note: "Premium is scaled by the ratio of the rating factor multipliers; the rating engine is external.", runBy: psActor(), at: psNow() };
  PS.simulations.push(sim); c.simulationIds.push(sim.id); psHist("simulated", c.id + " against " + (b ? b.id : "no baseline") + ": " + impacted.length + " case(s) affected, premium " + sim.changePct + "%."); psSave();
  return { ok: true, simulation: sim };
}

/** A release is approved by someone other than its author, once it has no blocking issue, a passing test run on this exact configuration and a simulation. */
function psApproveRelease(releaseId, note) {
  if (!psCanApprove()) return { ok: false, error: "permission" };
  const r = psRelease(releaseId); if (!r) return { ok: false, error: "release" };
  if (r.status !== "testing") return { ok: false, error: "status" };
  if (r.createdByKey === psActorKey()) return { ok: false, error: "self" };
  const problems = [];
  if (psBlocking(r).length) problems.push(psBlocking(r).length + " blocking issue(s): " + psBlocking(r)[0].message);
  const runs = r.testRunIds.map(id => PS.runs.find(x => x.id === id)).filter(x => x && x.manifestHash === r.manifestHash);
  if (!runs.length) problems.push("no test run on this configuration"); else if (runs[runs.length - 1].failed) problems.push("the latest test run has " + runs[runs.length - 1].failed + " failing case(s)");
  if (!r.simulationIds.length) problems.push("no simulation has been run");
  if (!psVerifyRelease(r)) problems.push("the release no longer matches its fingerprint");
  if (problems.length) return { ok: false, error: "not_ready", problems: problems };
  r.approval = { by: psActor(), at: psNow(), note: String(note || "").trim() }; psSetStatus(r, "approved", note); psHist("release_approved", r.id + " approved by " + psActor() + "."); psSave();
  return { ok: true };
}
/** Publishing puts it in force for its scope and supersedes the release it replaces. */
function psPublish(releaseId) {
  if (!psCanApprove()) return { ok: false, error: "permission" };
  const r = psRelease(releaseId); if (!r) return { ok: false, error: "release" };
  if (r.status !== "approved") return { ok: false, error: "status" };
  if (!psVerifyRelease(r)) return { ok: false, error: "tampered" };
  const clash = PS.releases.filter(x => x.id !== r.id && x.productId === r.productId && x.status === "published" && psScopeSame(x.scope, r.scope));
  clash.forEach(x => { psSetStatus(x, "superseded", "replaced by " + r.id); });
  r.supersedesId = clash.length ? clash[clash.length - 1].id : r.supersedesId; r.publishedBy = psActor(); r.publishedAt = psNow(); psSetStatus(r, "published", "published");
  psHist("release_published", r.id + " published" + (clash.length ? "; " + clash.map(x => x.id).join(", ") + " superseded" : "") + "."); psSave();
  return { ok: true, superseded: clash.map(x => x.id) };
}
/** Rolling back republishes a superseded release; the one in force for the scope is marked rolled back. */
function psRollback(releaseId, reason) {
  if (!psCanApprove()) return { ok: false, error: "permission" };
  const r = psRelease(releaseId); if (!r) return { ok: false, error: "release" };
  if (r.status !== "superseded") return { ok: false, error: "status" };
  if (String(reason || "").trim().length < PS_MIN_REASON) return { ok: false, error: "reason" };
  if (!psVerifyRelease(r)) return { ok: false, error: "tampered" };
  const cur = PS.releases.filter(x => x.productId === r.productId && x.status === "published" && psScopeSame(x.scope, r.scope));
  cur.forEach(x => psSetStatus(x, "rolled_back", "rolled back to " + r.id + ": " + reason));
  psSetStatus(r, "published", "rolled back to: " + reason); r.publishedBy = psActor(); r.publishedAt = psNow();
  psHist("release_rolled_back", "Rolled back to " + r.id + (cur.length ? " from " + cur.map(x => x.id).join(", ") : "") + ": " + reason); psSave();
  return { ok: true, rolledBack: cur.map(x => x.id) };
}
function psRetire(releaseId, reason) {
  if (!psCanApprove()) return { ok: false, error: "permission" };
  const r = psRelease(releaseId); if (!r) return { ok: false, error: "release" };
  if (["published", "superseded", "rolled_back", "approved"].indexOf(r.status) === -1) return { ok: false, error: "status" };
  if (String(reason || "").trim().length < PS_MIN_REASON) return { ok: false, error: "reason" };
  r.retiredAt = psNow(); psSetStatus(r, "retired", reason); psHist("release_retired", r.id + " retired: " + reason); psSave();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 7. THE RELEASE A CASE RUNS ON, AND THE RULES IT MEANS
// ----------------------------------------------------------------------------
function psSubProductId(sub) { return sub.productId || ((typeof ACTIVE_INSURANCE_PRODUCT !== "undefined" && ACTIVE_INSURANCE_PRODUCT) ? (ACTIVE_INSURANCE_PRODUCT.productId || (ACTIVE_INSURANCE_PRODUCT.product || ACTIVE_INSURANCE_PRODUCT.identity || {}).id) : null); }
function psSubMatchesScope(sub, sc, productId) {
  const st = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  if (productId && psSubProductId(sub) && psSubProductId(sub) !== productId) return false;
  if (sc.jurisdiction && sc.jurisdiction !== st) return false;
  if (sc.program && String(sc.program).toLowerCase() !== String(sub.program || "").toLowerCase()) return false;
  if (sc.channel && sc.channel !== (sub.channelType || "broker")) return false;
  if (sc.distributionAgreementId && sc.distributionAgreementId !== sub.agreementId) return false;
  const bt = sub.renewalOf ? "renewal" : "new"; if (sc.businessType && sc.businessType !== "both" && sc.businessType !== bt) return false;
  return true;
}
/** The published release a case runs on: the most specific scope that matches it on the date. Null when none is published. */
function psReleaseFor(sub, date) {
  const d = date || psToday(), pid = psSubProductId(sub);
  const c = PS.releases.filter(r => r.status === "published" && (!pid || r.productId === pid) && psIn(r.scope, d) && psSubMatchesScope(sub, r.scope, r.productId));
  const score = s => (s.program ? 16 : 0) + (s.distributionAgreementId ? 8 : 0) + (s.channel ? 4 : 0) + (s.jurisdiction ? 2 : 0) + (s.businessType && s.businessType !== "both" ? 1 : 0);
  return c.sort((a, b) => score(a.scope) - score(b.scope) || (a.id < b.id ? -1 : 1)).pop() || null;
}
function psCaseCodes(sub, cfg) {
  const out = [];
  (sub.coverageRows || []).forEach(r => { const key = psNorm(r.code || r.id || r.line), c = cfg.coverages.find(x => psNorm(x.code) === key || psNorm(x.name) === psNorm(r.line) || psNorm(x.code) === psNorm(r.id)); out.push(c ? c.code : (r.code || r.id || r.line)); });
  return out;
}
function psCaseInput(sub, release) {
  const cfg = (release || psReleaseFor(sub) || {}).config;
  const state = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null;
  const rej = {}; Object.keys(sub.coverageRejections || {}).forEach(k => { if ((sub.coverageRejections[k] || {}).formRef) rej[k] = true; });
  return { state: state, businessType: sub.renewalOf ? "renewal" : "new", coverages: cfg ? psCaseCodes(sub, cfg) : (sub.coverageRows || []).map(r => r.code || r.id || r.line), rejections: rej, limits: cfg ? (sub.coverageRows || []).map(r => ({ coverage: psCaseCodes({ coverageRows: [r] }, cfg)[0], amount: psParseMoney(r.limit) })).filter(l => l.amount !== null && cfg.limitOptions.some(o => o.coverageCode === l.coverage)) : [] };
}
/** What the release says about the case: the release it runs on and its issues. { applies:false } when no release is published for it. */
function psCaseCheck(sub, date) {
  const r = psReleaseFor(sub, date); if (!r) return { applies: false };
  const ev = psEvaluate(r.config, psCaseInput(sub, r)); ev.applies = true; ev.release = r; return ev;
}
/** Records that the insured rejected a rejectable coverage in writing, on the form the product names. */
function psRecordRejection(sub, code, o) {
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return { ok: false, error: "permission" }; }
  const r = psReleaseFor(sub); if (!r) return { ok: false, error: "no_release" };
  const st = typeof deriveRiskState === "function" ? deriveRiskState(sub) : null, a = psAvailability(r.config, code, st);
  if (!a || a.availability !== "required") return { ok: false, error: "not_required" };
  if (!a.rejectionAllowed) return { ok: false, error: "not_rejectable" };
  const form = String((o && o.formRef) || "").trim(), by = String((o && o.signedBy) || "").trim(), at = (o && o.signedAt) || "";
  if (form !== a.rejectionFormRef) return { ok: false, error: "form", expected: a.rejectionFormRef };
  if (!by) return { ok: false, error: "signer" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return { ok: false, error: "date" };
  if (!sub.coverageRejections) sub.coverageRejections = {};
  sub.coverageRejections[code] = { formRef: form, signedBy: by, signedAt: at, recordedBy: psActor(), recordedAt: psNow(), state: st, note: String((o && o.note) || "").trim() };
  if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 9, decision: "coverage_rejected", by: psActor(), at: psNow(), notes: code + " rejected in writing by " + by + " on " + form + " (" + at + ")." });
  if (typeof persistAppState === "function") persistAppState();
  return { ok: true };
}

// the quote runs on a release, and the release's rules are enforced when the quote is issued
var _psOrigRecord = window.recordQuoteVersion;
if (typeof _psOrigRecord === "function") window.recordQuoteVersion = function (sub, isBound) {
  const q = _psOrigRecord.apply(this, arguments);
  try { const s = sub || SUBMISSIONS_DATASET.find(x => x.id === activeSubmissionId); const r = s ? psReleaseFor(s) : null; if (s && q && r) { q.releaseId = r.id; if (!isBound) s.releaseId = r.id; } } catch (e) { console.warn("Release on the quote failed:", e); }
  return q;
};
const psQuoteGuard = () => {
  const sub = SUBMISSIONS_DATASET.find(x => x.id === activeSubmissionId); if (!sub) return true;
  const ck = psCaseCheck(sub); if (!ck.applies || !ck.issues.length) return true;
  if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 12, decision: "product_rules_blocked", by: psActor(), at: psNow(), notes: "Quote refused by release " + ck.release.id + ": " + ck.issues.join(" ") });
  showToast("⛔ The product's rules (" + ck.release.id + ") stop this quote: " + ck.issues[0], "danger");
  return false;
};
if (typeof registerGuard === "function") { registerGuard("issueQuote", "product release rules", psQuoteGuard); registerGuard("eSign", "product release rules", psQuoteGuard); }
var _psOrigBrief = window.buildDecisionBrief;
if (typeof _psOrigBrief === "function") window.buildDecisionBrief = function (sub) {
  const b = _psOrigBrief.apply(this, arguments);
  try { const ck = psCaseCheck(sub); if (ck.applies) b.checks.push(dbCheck("Product rules (" + ck.release.id + ")", ck.issues.length ? "fail" : "ok", ck.issues.length ? ck.issues.slice(0, 2).join(" ") : "Coverages and limits agree with release " + ck.release.id + " for " + (ck.state || "the case's state") + ".")); } catch (e) { console.warn("Brief additions failed:", e); }
  return b;
};

// ----------------------------------------------------------------------------
// 8. SCREEN: A TAB IN QUOTE INTELLIGENCE
// ----------------------------------------------------------------------------
var PS_UI = { productId: null, open: null };
const PS_STATUS_BADGE = { draft: "badge-light", testing: "badge-warning", approved: "badge-info", published: "badge-success", superseded: "badge-light", rolled_back: "badge-warning", retired: "badge-light" };
function psUiV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function psUiToast(r, ok) {
  if (r.ok) { if (ok) showToast(ok, "success"); return; }
  const m = { version: "Pick a version.", scope: (r.errors || [])[0], invalid: (r.errors || [])[0], released: "A release (" + r.release + ") already stands on this version. Make a new version instead.", reason: "Give a reason (at least " + PS_MIN_REASON + " characters).", self: "You made this; someone else must decide it.", status: "That is not possible at this stage.", suite: "Pick a test suite.", empty: "The suite has no cases.", tampered: "The release no longer matches its fingerprint.", decided: "It was already decided.", none: "Not found.", not_ready: "Not ready: " + (r.problems || []).join("; ") + ".", form: "That is not the form this product names (" + r.expected + ").", signer: "Name who signed.", date: "Enter the signing date (yyyy-mm-dd).", not_required: "That coverage is not required here.", not_rejectable: "That coverage cannot be rejected in writing here.", no_release: "No release is published for this case." };
  if (m[r.error]) showToast(m[r.error], "warning");
}
function psUiRefresh() { renderProductStudio(); }
function psUiLoad() {
  let doc; try { doc = JSON.parse(psUiV("ps_json")); } catch (e) { showToast("That is not valid JSON.", "danger"); return; }
  const r = psLoadProduct(doc); if (r.ok) PS_UI.productId = doc.productId; psUiToast(r, "Product " + doc.productId + " loaded as a draft."); psUiRefresh();
}
function psUiProduct() { PS_UI.productId = psUiV("ps_product") || null; psUiRefresh(); }
function psUiCreate() {
  const sc = { jurisdiction: psUiV("ps_sc_state") || null, program: psUiV("ps_sc_program") || null, channel: psUiV("ps_sc_channel") || null, distributionAgreementId: psUiV("ps_sc_agr") || null, businessType: psUiV("ps_sc_bt") || "both", from: psUiV("ps_sc_from") || undefined, to: psUiV("ps_sc_to") || null };
  psUiToast(psCreateRelease(PS_UI.productId, psUiV("ps_sc_version"), sc, psUiV("ps_sc_notes")), "Release compiled as a draft."); psUiRefresh();
}
function psUiTests(id) { psUiToast(psRunTests(id, psUiV("ps_suite_" + id)), "Test run recorded."); psUiRefresh(); }
function psUiSim(id) { psUiToast(psSimulate(id, null, null), "Simulation recorded."); psUiRefresh(); }
function psUiApprove(id) { psUiToast(psApproveRelease(id, psUiV("ps_reason_" + id)), "Release approved."); psUiRefresh(); }
function psUiPublish(id) { psUiToast(psPublish(id), "Release published."); psUiRefresh(); }
function psUiRollback(id) { psUiToast(psRollback(id, psUiV("ps_reason_" + id)), "Rolled back."); psUiRefresh(); }
function psUiRetire(id) { psUiToast(psRetire(id, psUiV("ps_reason_" + id)), "Release retired."); psUiRefresh(); }
function psUiOverride(vid, oid, decision) { psUiToast(psDecideOverride(PS_UI.productId, vid, oid, decision, psUiV("ps_ovr_reason")), "Override " + decision + "."); psUiRefresh(); }
function psUiToggle(id) { PS_UI.open = PS_UI.open === id ? null : id; psUiRefresh(); }

function renderProductStudio() {
  const box = document.getElementById("productStudioRoot"); if (!box) return;
  const ids = Object.keys(PS.products), canEdit = hasPermission("rateConfig", "edit"), canApprove = hasPermission("rateConfig", "approve");
  if (!PS_UI.productId || !PS.products[PS_UI.productId]) PS_UI.productId = ids[0] || null;
  const prod = psProduct(PS_UI.productId);
  let h = `<div class="card"><div class="card-header"><h3><i class="ph ph-package"></i> Product Studio: versions, limits, availability and releases</h3>${ids.length ? `<select id="ps_product" class="form-control form-control-sm" style="width:auto;" onchange="psUiProduct()">${ids.map(i => `<option value="${psEsc(i)}" ${i === PS_UI.productId ? "selected" : ""}>${psEsc(i + " " + PS.products[i].name)}</option>`).join("")}</select>` : ""}</div><div class="card-body">
    <p class="ws-small text-muted" style="margin:0 0 8px;">The carrier owns the base version; an MGU's override version stores only the changes the carrier allowed. Nothing is live until a release is tested, simulated, approved by someone else and published. With no release published for a case, none of this applies to it.</p>`;
  if (canEdit) h += `<details><summary class="ws-small">Load a product configuration (JSON)</summary><textarea id="ps_json" class="form-control" rows="5" placeholder='{"productId":"PRD-TRK","name":"...","jurisdictions":["TX"],"versions":[...],"permissions":[...],"limitGroups":[...],"groupCoverages":[...],"limitOptions":[...],"coverageStates":[...],"testSuites":[...]}'></textarea><button class="btn btn-sm btn-warning" style="width:auto;margin-top:4px;" onclick="psUiLoad()">Load as a draft</button></details>`;
  if (!prod) { box.innerHTML = h + '<p class="ws-small text-muted" style="margin-top:10px;">No product configuration is loaded.</p></div></div>'; return; }
  h += `<div class="uwp-subsection-title" style="margin-top:12px;">Versions</div><table class="data-table"><thead><tr><th>Version</th><th>Kind</th><th>Based on</th><th>Owner</th><th>Period</th><th>Changes</th></tr></thead><tbody>${prod.versions.map(v => `<tr><td>${psEsc(v.id)}</td><td>${psEsc(v.kind)}</td><td>${psEsc(v.baseVersionId || "-")}</td><td>${psEsc(v.ownerTenantId || prod.ownerTenantId || "")}</td><td>${psEsc(v.from || "")} to ${psEsc(v.to || "open")}</td><td>${v.kind === "override" ? (v.overrides || []).length + " override(s)" : v.coverages.length + " coverage(s)"}</td></tr>`).join("")}</tbody></table>`;
  const ovs = []; prod.versions.filter(v => v.kind === "override").forEach(v => (v.overrides || []).forEach(o => ovs.push({ v: v, o: o })));
  if (ovs.length) h += `<div class="uwp-subsection-title" style="margin-top:12px;">Overrides and what the carrier allowed</div>${canApprove ? '<input id="ps_ovr_reason" class="form-control form-control-sm" style="width:300px;margin-bottom:4px;" placeholder="Reason (needed to reject)">' : ""}<table class="data-table"><thead><tr><th>Override</th><th>Change</th><th>Status</th><th></th></tr></thead><tbody>${ovs.map(x => `<tr><td>${psEsc(x.v.id + " " + x.o.id)}</td><td>${psEsc(x.o.action + " " + x.o.targetType + " " + x.o.targetRef + (x.o.value !== undefined && x.o.value !== null ? " (" + x.o.value + ")" : ""))}${x.o.filingRef ? `<div class="text-xs text-muted">filing ${psEsc(x.o.filingRef)}</div>` : ""}</td><td><span class="badge ${x.o.approvalStatus === "approved" ? "badge-success" : x.o.approvalStatus === "rejected" ? "badge-danger" : "badge-warning"}">${psEsc(x.o.approvalStatus)}</span></td><td>${x.o.approvalStatus === "pending" && canApprove ? `<button class="btn btn-xs btn-primary" style="width:auto;" onclick="psUiOverride('${x.v.id}','${x.o.id}','approved')">Approve</button> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="psUiOverride('${x.v.id}','${x.o.id}','rejected')">Reject</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
  const base = prod.versions.find(v => v.kind === "base");
  if ((prod.limitGroups || []).length) h += `<div class="uwp-subsection-title" style="margin-top:12px;">Shared limit groups</div><table class="data-table"><thead><tr><th>Group</th><th>Type</th><th>Parent</th><th>State</th><th>Coverages (erosion category)</th><th>Options</th></tr></thead><tbody>${prod.limitGroups.map(g => `<tr><td><strong>${psEsc(g.code)}</strong></td><td>${psEsc(g.limitType)}${g.limitBasis ? '<div class="text-xs text-muted">' + psEsc(g.limitBasis) + "</div>" : ""}</td><td>${psEsc((prod.limitGroups.find(x => x.id === g.parentGroupId) || {}).code || "-")}</td><td>${psEsc(g.jurisdiction || "all")}</td><td class="ws-small">${(prod.groupCoverages || []).filter(m => m.groupId === g.id).map(m => psEsc(m.coverageCode + (m.erosionCategory ? " (" + m.erosionCategory + ")" : ""))).join(", ")}</td><td class="ws-small">${(prod.limitOptions || []).filter(o => o.groupId === g.id).map(o => psEsc((o.optionSetCode || "") + " " + psMoney(o.amount) + (o.jurisdiction ? " " + o.jurisdiction : "") + (o.isDefault ? " default" : ""))).join("; ")}</td></tr>`).join("")}</tbody></table>`;
  if (base) h += `<div class="uwp-subsection-title" style="margin-top:12px;">Availability by state</div><table class="data-table"><thead><tr><th>Coverage</th><th>All states</th><th>State rows</th></tr></thead><tbody>${base.coverages.map(c => { const rows = (prod.coverageStates || []).filter(s => s.coverageCode === c.code); const all = rows.find(s => !s.jurisdiction); return `<tr><td>${psEsc(c.name)} <span class="text-xs text-muted">${psEsc(c.code)}</span></td><td>${all ? psEsc(all.availability) : '<span class="text-danger">none</span>'}</td><td class="ws-small">${rows.filter(s => s.jurisdiction).map(s => psEsc(s.jurisdiction + ": " + s.availability + (s.rejectionAllowed ? " (can be rejected in writing, " + s.rejectionFormRef + ")" : ""))).join("; ") || "-"}</td></tr>`; }).join("")}</tbody></table>`;
  const rels = PS.releases.filter(r => r.productId === prod.productId);
  h += `<div class="uwp-subsection-title" style="margin-top:12px;">Releases</div>`;
  if (canEdit) h += `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;" class="ws-small"><select id="ps_sc_version" class="form-control form-control-sm" style="width:auto;">${prod.versions.map(v => `<option value="${v.id}">${psEsc(v.id + " (" + v.kind + ")")}</option>`).join("")}</select>
    <input id="ps_sc_state" class="form-control form-control-sm" style="width:80px;" placeholder="State"><input id="ps_sc_program" class="form-control form-control-sm" style="width:120px;" placeholder="Program"><input id="ps_sc_channel" class="form-control form-control-sm" style="width:100px;" placeholder="Channel"><input id="ps_sc_agr" class="form-control form-control-sm" style="width:140px;" placeholder="Agreement id">
    <select id="ps_sc_bt" class="form-control form-control-sm" style="width:auto;"><option value="both">New and renewal</option><option value="new">New business</option><option value="renewal">Renewal</option></select><input id="ps_sc_from" class="form-control form-control-sm" style="width:120px;" placeholder="From yyyy-mm-dd"><input id="ps_sc_to" class="form-control form-control-sm" style="width:120px;" placeholder="To"><input id="ps_sc_notes" class="form-control form-control-sm" style="width:160px;" placeholder="Notes"><button class="btn btn-sm btn-primary" style="width:auto;" onclick="psUiCreate()">Compile a release</button></div>`;
  h += rels.length ? `<table class="data-table"><thead><tr><th>Release</th><th>Version</th><th>Scope</th><th>Status</th><th>Checks</th><th>Actions</th></tr></thead><tbody>${rels.slice().reverse().map(r => {
    const runs = r.testRunIds.map(id => PS.runs.find(x => x.id === id)).filter(Boolean), last = runs[runs.length - 1], sim = PS.simulations.find(s => s.id === r.simulationIds[r.simulationIds.length - 1]);
    const scope = [r.scope.jurisdiction, r.scope.program, r.scope.channel, r.scope.distributionAgreementId, r.scope.businessType !== "both" ? r.scope.businessType : null].filter(Boolean).join(", ") || "everything";
    const suites = (prod.testSuites || []).map(s => `<option value="${s.id}">${psEsc(s.name)}</option>`).join("");
    const acts = [];
    if (canEdit && ["draft", "testing"].indexOf(r.status) > -1) acts.push(`<select id="ps_suite_${r.id}" class="form-control form-control-sm" style="width:auto;display:inline-block;">${suites}</select> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="psUiTests('${r.id}')">Run tests</button> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="psUiSim('${r.id}')">Simulate</button>`);
    if (canApprove && r.status === "testing") acts.push(`<button class="btn btn-xs btn-primary" style="width:auto;" onclick="psUiApprove('${r.id}')">Approve</button>`);
    if (canApprove && r.status === "approved") acts.push(`<button class="btn btn-xs btn-primary" style="width:auto;" onclick="psUiPublish('${r.id}')">Publish</button>`);
    if (canApprove && r.status === "superseded") acts.push(`<button class="btn btn-xs btn-outline" style="width:auto;" onclick="psUiRollback('${r.id}')">Roll back to this</button>`);
    if (canApprove && ["published", "superseded", "rolled_back", "approved"].indexOf(r.status) > -1) acts.push(`<button class="btn btn-xs btn-outline" style="width:auto;" onclick="psUiRetire('${r.id}')">Retire</button>`);
    if (canApprove && acts.length) acts.push(`<input id="ps_reason_${r.id}" class="form-control form-control-sm" style="width:180px;display:inline-block;" placeholder="Note or reason">`);
    return `<tr><td><strong>${psEsc(r.id)}</strong><div class="text-xs text-muted">no. ${r.releaseNo}, ${psEsc(r.createdBy)}</div><div class="text-xs font-mono text-muted">${psEsc(r.manifestHash.split(":")[0])} ${psVerifyRelease(r) ? "intact" : '<span class="text-danger">ALTERED</span>'}</div></td><td>${psEsc(r.versionId)}</td><td class="ws-small">${psEsc(scope)}<div class="text-xs text-muted">${psEsc(r.scope.from)} to ${psEsc(r.scope.to || "open")}</div></td><td><span class="badge ${PS_STATUS_BADGE[r.status] || "badge-light"}">${psEsc(r.status.replace("_", " "))}</span></td>
      <td class="ws-small"><a href="#" onclick="psUiToggle('${r.id}');return false;">${psBlocking(r).length} blocking, ${r.issues.length - psBlocking(r).length} other issue(s)</a><br>${last ? "Tests: " + last.passed + " passed, " + last.failed + " failed" : "No tests run"}<br>${sim ? "Simulated: " + sim.impacted.length + " case(s) affected, premium " + sim.changePct + "%" : "Not simulated"}</td><td>${acts.join(" ") || ""}</td></tr>
      ${PS_UI.open === r.id ? `<tr><td colspan="6" class="ws-small">${r.issues.length ? "<ul style='margin:0 0 0 16px;'>" + r.issues.map(i => `<li><span class="badge ${i.blocking ? "badge-danger" : "badge-light"}">${psEsc(i.check)}</span> ${psEsc(i.message)}</li>`).join("") + "</ul>" : "No issues."}${runs.length ? "<div style='margin-top:4px;'>" + runs.slice(-2).map(x => psEsc(x.id + ": " + x.passed + " passed, " + x.failed + " failed" + x.results.filter(y => y.outcome === "fail").map(y => "; FAIL " + y.name + " (" + y.diff.join(", ") + ")").join(""))).join("<br>") + "</div>" : ""}${sim ? `<div style="margin-top:4px;">${psEsc(sim.id)}: ${sim.policyCount} case(s) in scope; ${sim.impactedQuotes} quote(s), ${sim.impactedPolicies} polic${sim.impactedPolicies === 1 ? "y" : "ies"}, ${sim.impactedRenewals} renewal(s) affected; premium ${psMoney(sim.baselinePremium)} to ${psMoney(sim.candidatePremium)}. <span class="text-muted">${psEsc(sim.note)}</span></div>` : ""}</td></tr>` : ""}`;
  }).join("")}</tbody></table>` : '<p class="ws-small text-muted">No release has been compiled.</p>';
  if (PS.history.length) h += `<div class="text-xs text-muted" style="margin-top:8px;">History: ${PS.history.slice(-3).reverse().map(x => psEsc(x.at + " " + x.text)).join("; ")}</div>`;
  box.innerHTML = h + "</div></div>";
}

(function installProductStudioTab() {
  const origSwitch = window.switchQuoteIntelTab;
  if (typeof origSwitch !== "function") return;
  window.switchQuoteIntelTab = function (tab) {
    const panel = document.getElementById("qiPanelProduct"), tb = document.getElementById("qiTabProduct");
    if (tab === "product") {
      origSwitch.call(this, "renewal");
      quoteIntelActiveTab = "product";
      document.querySelectorAll('[id^="qiPanel"]').forEach(e => { e.style.display = "none"; });
      document.querySelectorAll('[id^="qiTab"]').forEach(e => { e.classList.remove("active"); });
      if (tb) tb.classList.add("active");
      if (panel) panel.style.display = "block";
      renderProductStudio();
      return;
    }
    const r = origSwitch.apply(this, arguments);
    if (panel) panel.style.display = "none";
    if (tb) tb.classList.remove("active");
    return r;
  };
})();

(function installPsAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  AUDIT_ACTION_META.product_rules_blocked = { label: "Quote Refused by the Product's Rules", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  AUDIT_ACTION_META.coverage_rejected = { label: "Coverage Rejected in Writing", icon: "ph-file-x", badge: "badge-info", outcome: "outcome-approve" };
})();

Object.assign(window, { psLoadProduct, psAddOverride, psDecideOverride, psEffective, psValidateVersion, psEvaluate, psAvailability, psOptionsFor, psGroupsFor, psIssueBuckets, psAvailable, psErode, psReverseErosion, psCreateRelease, psRunTests, psSimulate, psApproveRelease, psPublish, psRollback, psRetire, psReleaseFor, psCaseCheck, psRecordRejection, psVerifyRelease, psReset, psProduct, psRelease, renderProductStudio, psUiLoad, psUiProduct, psUiCreate, psUiTests, psUiSim, psUiApprove, psUiPublish, psUiRollback, psUiRetire, psUiOverride, psUiToggle, psCheckOverride, psValidateDoc, psSourceHash, psScopesOverlap, psSetFor, psCaseInput, psScopeSame });
