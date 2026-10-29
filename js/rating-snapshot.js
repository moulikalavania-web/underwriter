/**
 * ============================================================================
 * RATING SNAPSHOT (Add-On): Submission Intake > Quote & Bind
 * ----------------------------------------------------------------------------
 * The rating engine is only as good as what it was told. This module keeps a record
 * of the risk details that go to the Actuarial Rating Engine, the risk score they
 * produce and the premium that follows, so any quote can be explained later and two
 * versions compared.
 *
 * A snapshot holds:
 *   - the rating inputs (coverage, filing, radius, inspection, commodity, UW factors),
 *   - the vehicles (year, make, model, VIN, value, weight, dashcam) and drivers
 *     (age, licence state and class, experience, violations; no name, date of birth
 *     or licence number: the engine does not need them),
 *   - the loss history by company, the operations profile and the appetite rules not met,
 *   - the coverages on the quote (including any added through a Quote Condition),
 *   - the risk score with every factor and any underwriter override,
 *   - the premium: base, credit or debit, final,
 *   - the request payload as it is sent to the engine (Step 6).
 *
 * Every time the rating details are generated and they differ from the last version, a
 * NEW version is saved. The old versions are never changed or removed. Each version
 * carries what changed against the one before it (field, old value, new value), and any
 * two versions can be compared. Identical details save nothing.
 *
 * When one is generated: the rating payload is produced (Step 6) or downloaded or copied,
 * the engine's output is imported, the premium changes (credit or debit, Quote Condition)
 * or Quote & Bind is opened with details that have changed. Before Step 6 nothing is saved:
 * the case is still being worked up.
 * ============================================================================
 */

var RS_SECTIONS = { insured: "Insured", policy: "Policy", coverages: "Coverages on the quote", ratingInputs: "Rating inputs", vehicles: "Vehicles", drivers: "Drivers", losses: "Loss history", operations: "Operations profile", appetite: "Appetite rules not met", riskScore: "Risk score", premium: "Premium", engineRequest: "Request sent to the rating engine" };
var RS_COMPARE = { from: null, to: null };

// ----------------------------------------------------------------------------
// 1. PURE LOGIC
// ----------------------------------------------------------------------------
function rsStable(v) {
  if (Array.isArray(v)) return "[" + v.map(rsStable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + rsStable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
function rsHash(v) { const s = rsStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) + ":" + s.length; }

function rsFlatten(v, prefix, out) {
  if (Array.isArray(v)) { if (!v.length) out[prefix] = "[]"; v.forEach((x, i) => rsFlatten(x, prefix + "[" + i + "]", out)); }
  else if (v && typeof v === "object") { const ks = Object.keys(v); if (!ks.length && prefix) out[prefix] = "{}"; ks.forEach(k => rsFlatten(v[k], prefix ? prefix + "." + k : k, out)); }
  else out[prefix] = v === null || v === undefined ? "—" : String(v);
  return out;
}

/** Field-level differences between two snapshot contents: [{ section, path, from, to }]. */
function rsDiff(a, b) {
  const fa = rsFlatten(a || {}, "", {}), fb = rsFlatten(b || {}, "", {});
  const keys = Object.keys(fa).concat(Object.keys(fb).filter(k => !(k in fa)));
  const out = [];
  keys.forEach(k => {
    const from = k in fa ? fa[k] : "—", to = k in fb ? fb[k] : "—";
    if (from !== to) out.push({ section: k.split(/[.[]/)[0], path: k, from: from, to: to });
  });
  return out;
}

function rsMoney(n) { return n === null || n === undefined || n === "" || isNaN(Number(n)) ? "—" : "$" + Number(n).toLocaleString("en-US"); }
function rsEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function rsNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function rsActor() { const r = USER_ROLES_CONFIG[currentUserRole]; return r ? `${r.name} (${r.title})` : "System"; }
function rsStore(sub) { if (!Array.isArray(sub.ratingSnapshots)) sub.ratingSnapshots = []; return sub.ratingSnapshots; }
function rsLatest(sub) { const s = rsStore(sub); return s.length ? s[s.length - 1] : null; }
function rsActiveSub() { return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null; }

// ----------------------------------------------------------------------------
// 2. WHAT IS SNAPSHOTTED
// ----------------------------------------------------------------------------
function rsPick(src, keys) { const o = {}; keys.forEach(k => { if (src && src[k] !== undefined && src[k] !== null && src[k] !== "") o[k] = src[k]; }); return o; }

function rsBuildContent(sub) {
  const fin = (typeof buildFinalUnderwritingJSON === "function" && buildFinalUnderwritingJSON(sub)) || { ratingInputs: {} };
  const ri = fin.ratingInputs || {};
  const auto = typeof calculateRiskScore === "function" ? calculateRiskScore(sub) : { score: null, factors: [] };
  const dp = sub.discretionaryPricing || null;
  const req = typeof getSubmissionRatingPayload === "function" ? JSON.parse(JSON.stringify(getSubmissionRatingPayload(sub))) : null;
  if (req && req.genInfo) delete req.genInfo.binding;           // workflow state, not a rating detail
  const open = (sub.appetiteRules || []).filter(r => !r.pass && !r.manualPassOverride).map(r => ({ rule: r.name || r.factor, found: r.val, requirement: r.threshold || r.guardrail }));
  const overridden = (sub.appetiteRules || []).filter(r => r.manualPassOverride).map(r => r.name || r.factor);
  // Stored and reloaded as JSON, so the hash is taken on exactly what survives that (no undefined values).
  return JSON.parse(JSON.stringify({
    insured: rsPick({ name: sub.insured, fein: sub.fein, dot: sub.dot, mcNumber: sub.mcNumber, address: sub.address, garagingState: sub.insuredInfo && sub.insuredInfo.insured_garaging_state, channel: sub.channelType, producer: sub.broker }, ["name", "fein", "dot", "mcNumber", "address", "garagingState", "channel", "producer"]),
    policy: rsPick({ lob: sub.lobKey, effectiveDate: sub.effectiveDate, expirationDate: sub.expirationDate, requestedLimit: sub.exposureVal }, ["lob", "effectiveDate", "expirationDate", "requestedLimit"]),
    coverages: (sub.coverageRows || []).map(r => ({ line: r.line, limit: r.limit, deductible: r.ded, premium: r.prem, addedByQuoteCondition: r.viaQuoteCondition || undefined })),
    ratingInputs: { coveragesInfo: ri.coveragesInfo || {}, filingInfo: ri.filingInfo || {}, radiusOfOperationsInfo: ri.radiusOfOperationsInfo || {}, serviceInspectionInfo: ri.serviceInspectionInfo || {}, commoditiesInfo: ri.commoditiesInfo || {}, uwReviewFactors: ri.uwReviewFactors || {} },
    vehicles: (sub.vehicles || []).map(v => rsPick(v, ["id", "year", "make", "model", "vin", "vehicle_type", "weight", "ownership", "rating_class", "stated_value", "al_value", "dashcam", "plateState"])),
    drivers: (sub.drivers || []).map(d => rsPick(d, ["id", "age", "licensestate", "licenseclasstype", "experience", "violations", "tenure", "status"])),
    losses: (sub.losses || []).map(l => rsPick(l, ["carrier", "year", "status", "incurred", "claimNo"])),
    operations: sub.operationsProfile ? JSON.parse(JSON.stringify(sub.operationsProfile)) : {},
    appetite: { notMet: open, overriddenByUnderwriter: overridden },
    riskScore: { calculated: auto.score, effective: typeof getEffectiveRiskScore === "function" ? getEffectiveRiskScore(sub) : auto.score, manualOverride: typeof sub.riskScore === "number" ? sub.riskScore : null, factors: auto.factors.map(f => ({ factor: f.label, points: f.points })) },
    premium: { basePremium: dp ? dp.basePremium : null, adjustment: dp && dp.adjustmentType ? dp.adjustmentType + " " + dp.adjustmentPercent + "%" : "none", finalPremium: dp ? dp.finalPremium : null, addedByQuoteConditions: typeof qcMetPremium === "function" ? qcMetPremium(sub) : 0, ratingOutputImported: !!sub.importedRatingData },
    engineRequest: req
  }));
}

/** The latest saved version, in the short form the quote, the binder and the final JSON quote: which rating the premium rests on. */
function rsBasis(sub) {
  const s = rsLatest(sub);
  return s ? { version: s.version, savedAt: s.at, riskScore: s.summary.riskScore, finalPremium: s.summary.finalPremium, basePremium: s.summary.basePremium, hash: s.hash, trigger: s.trigger } : null;
}

// ----------------------------------------------------------------------------
// 3. SAVING A VERSION
// ----------------------------------------------------------------------------
function rsReachedRating(sub) { return Math.max(sub.currentStep || 1, typeof currentWorkflowStep !== "undefined" ? currentWorkflowStep || 1 : 1) >= RATING_STEP; }

/** Saves a new version if the details differ from the latest one; returns the version saved, or null when nothing changed. */
function rsCapture(sub, trigger, force) {
  if (!sub || !SUBMISSIONS_DATASET.some(s => s.id === sub.id)) return null;
  if (!force && !rsReachedRating(sub)) return null;
  const content = rsBuildContent(sub), hash = rsHash(content), prev = rsLatest(sub);
  if (prev && prev.hash === hash) return null;
  const changes = prev ? rsDiff(prev.content, content) : [];
  const snap = {
    version: prev ? prev.version + 1 : 1, at: rsNow(), by: rsActor(), trigger: trigger || "Rating details generated", hash: hash, previousVersion: prev ? prev.version : null,
    summary: { riskScore: content.riskScore.effective, finalPremium: content.premium.finalPremium, basePremium: content.premium.basePremium, units: content.vehicles.length, drivers: content.drivers.length },
    changes: changes, content: content
  };
  rsStore(sub).push(snap);
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: 7, decision: "rating_snapshot_saved", by: snap.by, at: snap.at, notes: `Rating snapshot v${snap.version} saved (${snap.trigger}). Risk score ${snap.summary.riskScore}, final premium ${rsMoney(snap.summary.finalPremium)}${prev ? `; ${changes.length} change(s) since v${prev.version}` : ""}.` });
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
  return snap;
}

// ----------------------------------------------------------------------------
// 4. DISPLAY
// ----------------------------------------------------------------------------
function rsChangeHeadline(snap) {
  if (!snap.previousVersion) return "First version";
  if (!snap.changes.length) return "No change";
  const prev = rsStore(rsActiveSub() || {}).find(x => x.version === snap.previousVersion);
  const bits = [];
  if (prev && prev.summary.riskScore !== snap.summary.riskScore) bits.push(`Risk score ${prev.summary.riskScore} → ${snap.summary.riskScore}`);
  if (prev && prev.summary.finalPremium !== snap.summary.finalPremium) bits.push(`Premium ${rsMoney(prev.summary.finalPremium)} → ${rsMoney(snap.summary.finalPremium)}`);
  return `${snap.changes.length} field(s) changed` + (bits.length ? ": " + bits.join("; ") : "");
}

function rsDiffTableHtml(changes) {
  if (!changes.length) return `<div class="text-sm text-muted">The two versions are identical.</div>`;
  const bySection = {};
  changes.forEach(c => { (bySection[c.section] = bySection[c.section] || []).push(c); });
  return Object.keys(bySection).map(sec => `<div style="margin-top:8px;"><div class="text-xs" style="font-weight:700;">${rsEsc(RS_SECTIONS[sec] || sec)} (${bySection[sec].length})</div>
    <table class="data-table"><thead><tr><th>Field</th><th>Old</th><th>New</th></tr></thead><tbody>${bySection[sec].map(c => `<tr><td class="font-mono text-xs">${rsEsc(c.path)}</td><td class="text-xs">${rsEsc(String(c.from).slice(0, 120))}</td><td class="text-xs"><strong>${rsEsc(String(c.to).slice(0, 120))}</strong></td></tr>`).join("")}</tbody></table></div>`).join("");
}

function rsRender(sub) {
  const box = document.getElementById("ratingSnapshotContainer");
  if (!box || !sub) return;
  if (!hasPermission("workflow", "view")) { box.innerHTML = ""; return; }
  const list = rsStore(sub), latest = rsLatest(sub);
  if (!list.length) {
    box.innerHTML = `<div class="card mt-3"><div class="card-header"><h3><i class="ph ph-camera"></i> Rating Snapshot</h3><span class="badge badge-light">None yet</span></div>
      <div class="card-body"><p class="text-sm text-muted" style="margin:0;">${rsReachedRating(sub) ? "A snapshot is saved when the rating details are generated." : "A snapshot is saved once the case reaches the rating step (Step 6), when the rating details are generated."} It keeps the risk details sent to the Actuarial Rating Engine, the risk score and the premium, and a new version whenever they change.</p></div></div>`;
    return;
  }
  const from = RS_COMPARE.from && list.find(x => x.version === RS_COMPARE.from) ? RS_COMPARE.from : (list.length > 1 ? list[list.length - 2].version : list[0].version);
  const to = RS_COMPARE.to && list.find(x => x.version === RS_COMPARE.to) ? RS_COMPARE.to : latest.version;
  const opts = sel => list.map(x => `<option value="${x.version}" ${x.version === sel ? "selected" : ""}>v${x.version} · ${rsEsc(x.at)}</option>`).join("");
  const a = list.find(x => x.version === from), b2 = list.find(x => x.version === to);
  const band = typeof riskBand === "function" ? riskBand(latest.summary.riskScore) : { label: "", cls: "badge-light" };
  const rows = list.slice().reverse().map(s => `<tr><td><strong>v${s.version}</strong>${s === latest ? ' <span class="badge badge-info text-xs">current</span>' : ""}</td><td class="text-xs">${rsEsc(s.at)}<br><span class="text-muted">${rsEsc(s.by)}</span></td><td class="text-xs">${rsEsc(s.trigger)}</td>
      <td class="font-mono">${s.summary.riskScore === null ? "—" : s.summary.riskScore}</td><td class="font-mono">${rsMoney(s.summary.finalPremium)}</td><td class="text-xs">${rsEsc(rsChangeHeadline(s))}</td>
      <td style="white-space:nowrap;"><button class="btn btn-xs btn-outline" style="width:auto;" onclick="rsView(${s.version})">View</button> ${s.previousVersion ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="rsCompare(${s.previousVersion}, ${s.version})">Compare with v${s.previousVersion}</button>` : ""}</td></tr>`).join("");
  box.innerHTML = `<div class="card mt-3">
    <div class="card-header"><h3><i class="ph ph-camera"></i> Rating Snapshot</h3><span class="badge badge-info">v${latest.version} · ${list.length} version${list.length === 1 ? "" : "s"}</span></div>
    <div class="card-body">
      <p class="text-xs text-muted" style="margin:0 0 8px;">The risk details sent to the Actuarial Rating Engine, the risk score they give and the premium that follows. A new version is saved each time they change; earlier versions are never altered.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px;">
        <div class="summary-field-box"><div class="summary-field-label">Risk score</div><div class="summary-field-val">${latest.summary.riskScore === null ? "—" : latest.summary.riskScore} <span class="badge ${band.cls} text-xs">${rsEsc(band.label)}</span></div></div>
        <div class="summary-field-box"><div class="summary-field-label">Base premium</div><div class="summary-field-val">${rsMoney(latest.summary.basePremium)}</div></div>
        <div class="summary-field-box"><div class="summary-field-label">Final premium</div><div class="summary-field-val">${rsMoney(latest.summary.finalPremium)}</div></div>
        <div class="summary-field-box"><div class="summary-field-label">Vehicles · drivers</div><div class="summary-field-val">${latest.summary.units} · ${latest.summary.drivers}</div></div>
      </div>
      <table class="data-table"><thead><tr><th>Version</th><th>Saved</th><th>Why</th><th>Risk score</th><th>Final premium</th><th>Changes since the version before</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      ${list.length > 1 ? `<div style="margin-top:12px;"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><strong class="text-sm">Compare</strong>
        <select id="rs_from" class="form-control" style="width:auto;">${opts(from)}</select><span>with</span><select id="rs_to" class="form-control" style="width:auto;">${opts(to)}</select>
        <button class="btn btn-sm btn-primary" style="width:auto;" onclick="rsCompare(parseInt(document.getElementById('rs_from').value,10), parseInt(document.getElementById('rs_to').value,10))">Compare</button></div>
        <div id="rs_compare_out" style="margin-top:8px;">${rsCompareHtml(a, b2)}</div></div>` : ""}
    </div></div>`;
}

function rsCompareHtml(a, b) {
  if (!a || !b) return "";
  if (a.version === b.version) return `<div class="text-sm text-muted">Pick two different versions.</div>`;
  const older = a.version < b.version ? a : b, newer = a.version < b.version ? b : a;
  const changes = rsDiff(older.content, newer.content);
  const head = [];
  if (older.summary.riskScore !== newer.summary.riskScore) head.push(`Risk score ${older.summary.riskScore} → <strong>${newer.summary.riskScore}</strong>`);
  if (older.summary.finalPremium !== newer.summary.finalPremium) head.push(`Final premium ${rsMoney(older.summary.finalPremium)} → <strong>${rsMoney(newer.summary.finalPremium)}</strong>`);
  return `<div class="alert alert-info text-xs"><strong>v${older.version} (${rsEsc(older.at)}) → v${newer.version} (${rsEsc(newer.at)})</strong>: ${changes.length} field(s) changed${head.length ? ". " + head.join("; ") : ""}</div>${rsDiffTableHtml(changes)}`;
}

function rsCompare(fromV, toV) {
  const sub = rsActiveSub(); if (!sub) return;
  RS_COMPARE.from = fromV; RS_COMPARE.to = toV;
  rsRender(sub);
}

function rsView(version) {
  const sub = rsActiveSub(); if (!sub) return;
  const s = rsStore(sub).find(x => x.version === version); if (!s) return;
  let m = document.getElementById("rsViewModal");
  if (!m) { m = document.createElement("div"); m.id = "rsViewModal"; m.className = "modal-overlay"; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal-content" style="max-width:900px;"><div class="modal-header"><h3><i class="ph ph-camera"></i> Rating Snapshot v${s.version} · ${rsEsc(s.at)}</h3><button class="btn-close" aria-label="Close" onclick="rsCloseView()"><i class="ph ph-x"></i></button></div>
    <div class="modal-body"><div class="text-xs text-muted" style="margin-bottom:6px;">${rsEsc(s.trigger)} · saved by ${rsEsc(s.by)}${s.previousVersion ? " · changes since v" + s.previousVersion + ": " + s.changes.length : ""}</div>
    <pre id="rsViewJson" style="max-height:480px;overflow:auto;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;">${rsEsc(JSON.stringify(s.content, null, 2))}</pre></div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="rsDownload(${s.version})"><i class="ph ph-download-simple"></i> Download</button><button class="btn btn-primary" onclick="rsCloseView()">Close</button></div></div>`;
  m.style.display = "flex";
}
function rsCloseView() { const m = document.getElementById("rsViewModal"); if (m) m.style.display = "none"; }
function rsDownload(version) {
  const sub = rsActiveSub(); if (!sub) return;
  const s = rsStore(sub).find(x => x.version === version); if (!s) return;
  const blob = new Blob([JSON.stringify({ submission: sub.id, version: s.version, savedAt: s.at, savedBy: s.by, trigger: s.trigger, changesSincePreviousVersion: s.changes, snapshot: s.content }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `RatingSnapshot-${sub.id}-v${s.version}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ----------------------------------------------------------------------------
// 5. HOOKS: whenever rating details are generated
// ----------------------------------------------------------------------------
(function rsInstall() {
  if (typeof AUDIT_ACTION_META !== "undefined") AUDIT_ACTION_META.rating_snapshot_saved = { label: "Rating Snapshot Saved", icon: "ph-camera", badge: "badge-info", outcome: "outcome-comm" };
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig === "function") window[name] = function () { const r = orig.apply(this, arguments); try { fn.apply(this, arguments); } catch (e) { console.warn("Rating snapshot hook failed:", name, e); } return r; }; };
  const subOf = a => (a && a.id && typeof a === "object" && a.vehicles !== undefined) ? a : rsActiveSub();
  wrap("renderRatingEnginePayload", function (sub) { const s = subOf(sub); if (s) { rsCapture(s, "Rating payload generated (Rating step)"); if (s.id === activeSubmissionId) rsRender(s); } });
  wrap("renderStep7View", function (sub) { const s = subOf(sub); if (s) { rsCapture(s, "Quote & Bind opened with changed details"); rsRender(s); } });
  wrap("downloadRatingJSON", function () { const s = rsActiveSub(); if (s) { rsCapture(s, "Rating payload downloaded for the engine", true); rsRender(s); } });
  wrap("copyRatingJSON", function () { const s = rsActiveSub(); if (s) { rsCapture(s, "Rating payload copied for the engine", true); rsRender(s); } });
  wrap("applyImportedRatingDataToSubmission", function (parsed, sub) { if (sub) { rsCapture(sub, "Rating engine output imported", true); if (sub.id === activeSubmissionId) rsRender(sub); } });
})();

window.rsBasis = rsBasis; window.rsCapture = rsCapture; window.rsRender = rsRender; window.rsCompare = rsCompare; window.rsView = rsView; window.rsCloseView = rsCloseView; window.rsDownload = rsDownload;
