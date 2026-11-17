/**
 * ============================================================================
 * EXTRACTION LAYER: ANY READER, ONE RESULT FORMAT
 * ----------------------------------------------------------------------------
 * Whatever reads a submission (the built-in rule-based reader, or a document-AI / LLM service run by your backend) must answer in
 * the same format, so that the rest of the application never depends on who read it:
 *
 *   {
 *     provider: "name",
 *     fields: {                               // only the fields it found; a value that is not in the documents is simply absent
 *       insured:  { value: "Acme Haulers LLC", confidence: 0.93, source: "ACORD 125, page 1" },
 *       fein:     { value: "74-1234567",       confidence: "high", source: "Email text" },
 *       ...
 *     },
 *     lists: { driverDetails, lossHistory, vehicleDetails, operationsProfile }   // optional, in the shapes the case already uses
 *   }
 *
 * Allowed field keys: EXL_FIELDS. confidence is a number from 0 to 1 or "high" / "medium" / "low" (0.85 or more is high, 0.6 or more
 * is medium, below that is low). EVERY field must name its source. A field that breaks the format is dropped and reported; a result
 * that is not an object with a provider and fields is refused as a whole, and the case stops at the Extract step with the reason
 * (the application never quietly swaps in another reader).
 *
 * Providers:
 *   local-rules  (default) the rule-based reader of the email text. It reads text only, not the contents of PDFs or scans.
 *   http         posts { submissionId, emailText, files: [{ name, type }] } to the endpoint an administrator sets, and expects the result
 *                above as JSON. The endpoint is YOUR server: it holds the API keys and calls the AI service. Nothing is sent anywhere
 *                until an endpoint is set. A second provider can be added with exlRegisterProvider(name, fn).
 *
 * The validated result is stored on the case (sub.extraction): each field with its value, confidence and source, which the
 * Workbench shows. The critical fields are the insured and FEIN (and the USDOT number for trucking); if one is missing the case
 * stops at Confirm so a person supplies it.
 * ============================================================================
 */

const EXL_KEY = "FUT_EXTRACTION_V1";
const EXL_FIELDS = ["insured", "fein", "dot", "mcNumber", "broker", "email", "address", "effectiveDate", "expirationDate", "exposureVal", "lobKey",
  "policyType", "program", "priorPolicyPeriod", "assignedUnderwriter", "primaryCommodity"];
const EXL_LISTS = ["driverDetails", "lossHistory", "vehicleDetails", "operationsProfile"];
var EXL_PROVIDERS = {};
var EXL_DRAFTS = {};
var EXL_CFG = { provider: "local-rules", endpoint: "" };
try { const r = JSON.parse(localStorage.getItem(EXL_KEY)); if (r && typeof r === "object") EXL_CFG = Object.assign(EXL_CFG, r); } catch (e) { /* defaults */ }

function exlRegisterProvider(name, fn) { EXL_PROVIDERS[name] = fn; }
function exlSave() { try { localStorage.setItem(EXL_KEY, JSON.stringify(EXL_CFG)); } catch (e) { /* keep for this session */ } }
function exlIsLocal() { return EXL_CFG.provider === "local-rules" || !EXL_PROVIDERS[EXL_CFG.provider]; }

/** "high" / "medium" / "low" from a number or a word; null when it is neither. */
function exlBucket(c) {
  if (typeof c === "number" && isFinite(c) && c >= 0 && c <= 1) return c >= 0.85 ? "high" : c >= 0.6 ? "medium" : "low";
  return ["high", "medium", "low"].indexOf(c) > -1 ? c : null;
}

/** Checks a provider's answer. Returns { ok, fields, lists, errors }; a field that breaks the format is dropped and named in errors. */
function exlValidate(res) {
  const errors = [];
  if (!res || typeof res !== "object" || typeof res.provider !== "string" || !res.provider.trim() || !res.fields || typeof res.fields !== "object" || Array.isArray(res.fields)) {
    return { ok: false, fields: {}, lists: {}, errors: ["The answer is not in the agreed format (it needs a provider name and a fields object)."] };
  }
  const fields = {};
  Object.keys(res.fields).forEach(k => {
    const f = res.fields[k];
    if (EXL_FIELDS.indexOf(k) < 0) { errors.push(k + ": not a known field"); return; }
    if (!f || typeof f !== "object") { errors.push(k + ": needs value, confidence and source"); return; }
    if (f.value === null || f.value === undefined || String(f.value).trim() === "") return;   // nothing found: left blank
    const b = exlBucket(f.confidence);
    if (!b) { errors.push(k + ": confidence must be 0 to 1 or high, medium or low"); return; }
    if (typeof f.source !== "string" || !f.source.trim()) { errors.push(k + ": the source is missing"); return; }
    if (k === "exposureVal" && !/\d/.test(String(f.value))) { errors.push(k + ": not a number"); return; }
    fields[k] = { value: f.value, confidence: b, source: f.source.trim() };
  });
  const lists = {};
  EXL_LISTS.forEach(k => { if (res.lists && res.lists[k] !== undefined && res.lists[k] !== null) lists[k] = res.lists[k]; });
  return { ok: true, fields: fields, lists: lists, errors: errors };
}

/** The draft that applyNormalizedDataToSubmission reads, built from a validated result. */
function exlToDraft(sub, v) {
  const val = k => v.fields[k] ? v.fields[k].value : null;
  const conf = {};
  Object.keys(v.fields).forEach(k => { conf[k] = v.fields[k].confidence; });
  const lobKey = val("lobKey") || sub.lobKey;
  const missing = ["insured", "fein"].filter(k => !val(k));
  if (lobKey === "trucking" && !val("dot")) missing.push("dot");
  const low = Object.keys(conf).filter(k => conf[k] === "low");
  const exposure = val("exposureVal");
  return Object.assign({
    lobKey: lobKey, driverDetails: null, lossHistory: [], vehicleDetails: null, operationsProfile: null,
    insured: val("insured"), fein: val("fein"), dot: val("dot"), mcNumber: val("mcNumber"), broker: val("broker"), email: val("email"),
    exposureVal: exposure === null ? null : Number(String(exposure).replace(/[^0-9.]/g, "")),
    channelType: val("broker") ? "broker" : "direct", address: val("address"),
    effectiveDate: val("effectiveDate"), expirationDate: val("expirationDate"), policyType: val("policyType"), program: val("program"),
    priorPolicyPeriod: val("priorPolicyPeriod"), assignedUnderwriter: val("assignedUnderwriter"), primaryCommodity: val("primaryCommodity"),
    coveragesInfo: null, filingInfo: null, uwReviewInfo: null, commoditiesInfo: null, endorsements: null, vehicleExtras: null, driverExtras: null, lossExtras: null,
    coverageSummary: "Coverage requested in the submission; verify details.", lossHistorySummary: null, brokerNote: null,
    fields_confidence: conf, missing_critical_fields: missing, needs_review: !!(missing.length || low.length),
    review_reasons: missing.map(k => k + " is missing").concat(low.map(k => k + " has low confidence")).slice(0, 3)
  }, v.lists, v.lists.lossHistory ? { lossHistorySummary: v.lists.lossHistory.length + " prior loss(es) read from the submission" } : {});
}

// ----------------------------------------------------------------------------
// PROVIDERS
// ----------------------------------------------------------------------------
exlRegisterProvider("local-rules", function (sub) {
  const d = buildLocalNormalizationDraft(sub);
  const fields = {};
  EXL_FIELDS.forEach(k => {
    if (d[k] === null || d[k] === undefined || d[k] === "") return;
    if (k === "lobKey") return;   // the line of business is the case's own, not read from the text
    fields[k] = { value: d[k], confidence: (d.fields_confidence && d.fields_confidence[k]) || "medium", source: "Email text (rule-based reader)" };
  });
  return { provider: "local-rules", fields: fields, lists: { driverDetails: d.driverDetails, lossHistory: d.lossHistory, vehicleDetails: d.vehicleDetails, operationsProfile: d.operationsProfile } };
});

exlRegisterProvider("http", async function (sub) {
  if (!EXL_CFG.endpoint) throw new Error("no endpoint is set");
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(EXL_CFG.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ submissionId: sub.id, emailText: sub.rawEmailText || "", files: (sub.rawAttachments || []).map(a => ({ name: a.name, type: a.type || "" })) }) });
    if (!r.ok) throw new Error("the service answered " + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
});

/**
 * Reads the case with the chosen provider and stores the result. Returns { ok, draft, provider, reason }.
 * A failure of any kind is returned as a reason, never swallowed or replaced by another reader.
 */
async function exlRun(sub) {
  const name = exlIsLocal() ? "local-rules" : EXL_CFG.provider;
  let res;
  try { res = await EXL_PROVIDERS[name](sub); }
  catch (e) { const reason = "The reader (" + name + ") failed: " + e.message + "."; sub.extraction = { provider: name, at: nowStamp(), error: e.message, reason: reason, fields: {} }; return { ok: false, provider: name, reason: reason }; }
  const v = exlValidate(res);
  if (!v.ok) { const reason = "The reader (" + name + ") gave an unusable answer. " + v.errors[0]; sub.extraction = { provider: name, at: nowStamp(), error: v.errors[0], reason: reason, fields: {} }; return { ok: false, provider: name, reason: reason }; }
  sub.extraction = { provider: name, at: nowStamp(), fields: v.fields, dropped: v.errors };
  const draft = exlToDraft(sub, v);
  EXL_DRAFTS[sub.id] = draft;
  if (typeof emailIngestionDraftBySubId !== "undefined") emailIngestionDraftBySubId[sub.id] = draft;
  return { ok: true, provider: name, draft: draft };
}
/** The provider runs on a promise, so the one synchronous reader is exposed for the automatic steps. */
function exlRunLocalNow(sub) {
  const v = exlValidate(EXL_PROVIDERS["local-rules"](sub));
  sub.extraction = { provider: "local-rules", at: nowStamp(), fields: v.fields, dropped: v.errors };
  const draft = exlToDraft(sub, v);
  EXL_DRAFTS[sub.id] = draft;
  if (typeof emailIngestionDraftBySubId !== "undefined") emailIngestionDraftBySubId[sub.id] = draft;
  return draft;
}

// ----------------------------------------------------------------------------
// WORKBENCH VIEW: what was read, how sure, from where; and the reader setting
// ----------------------------------------------------------------------------
var EXL_LABELS = { insured: "Insured", fein: "FEIN", dot: "USDOT", mcNumber: "MC number", broker: "Broker", email: "Email", address: "Address", effectiveDate: "Effective date",
  expirationDate: "Expiration date", exposureVal: "Requested limit / TIV", lobKey: "Line of business", policyType: "Policy type", program: "Program",
  priorPolicyPeriod: "Prior policy period", assignedUnderwriter: "Assigned underwriter", primaryCommodity: "Primary commodity" };

function exlTableHtml(sub) {
  const x = sub && sub.extraction;
  if (!x) return "";
  const keys = Object.keys(x.fields || {});
  const badge = { high: "badge-success", medium: "badge-warning", low: "badge-danger" };
  const rows = keys.map(k => `<tr><td>${escHtml(EXL_LABELS[k] || k)}</td><td>${escHtml(String(x.fields[k].value))}</td><td><span class="badge ${badge[x.fields[k].confidence]}">${x.fields[k].confidence}</span></td><td>${escHtml(x.fields[k].source)}</td></tr>`).join("");
  return `<div class="ai-read"><div class="p1-note">Read by <strong>${escHtml(x.provider)}</strong> at ${escHtml(x.at)}${x.error ? " · failed: " + escHtml(x.error) : ""}${(x.dropped || []).length ? " · dropped: " + x.dropped.map(escHtml).join("; ") : ""}</div>
    ${keys.length ? `<table class="data-table"><thead><tr><th>Field</th><th>Value</th><th>Confidence</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="mw-empty">Nothing was read.</div>`}</div>`;
}

function exlSettingsHtml() {
  if (!hasPermission("reviewRules", "edit")) return `<div class="p1-note">Reader: ${escHtml(exlIsLocal() ? "local-rules (email text only)" : EXL_CFG.provider)}. Changing it needs edit rights on review rules.</div>`;
  return `<div class="ai-reader"><label for="exl_provider">Reader</label> <select class="form-control" id="exl_provider"><option value="local-rules"${exlIsLocal() ? " selected" : ""}>Built-in rules (email text only)</option><option value="http"${EXL_CFG.provider === "http" ? " selected" : ""}>Your AI service (HTTP endpoint)</option></select>
    <input class="form-control" id="exl_endpoint" placeholder="https://your-server/extract" value="${escHtml(EXL_CFG.endpoint)}"> <button class="btn btn-outline btn-sm" onclick="exlApplySettings()">Save</button>
    <div class="p1-note">The endpoint is your own server, which holds the API keys. Nothing is sent until one is set.</div></div>`;
}
function exlApplySettings() {
  if (!hasPermission("reviewRules", "edit")) { denyPermission("reviewRules", "edit"); return; }
  const p = document.getElementById("exl_provider").value, url = document.getElementById("exl_endpoint").value.trim();
  if (p === "http" && !/^https?:\/\/\S+$/i.test(url)) { showToast("⛔ Enter the address of your extraction service (it starts with http:// or https://).", "danger"); return; }
  EXL_CFG.provider = p; EXL_CFG.endpoint = url; exlSave();
  showToast("✅ Reader set to " + (p === "http" ? "your AI service" : "the built-in rules") + ". It applies to cases opened from now on.", "success");
  if (typeof aiRenderStrip === "function") aiRenderStrip();
}
