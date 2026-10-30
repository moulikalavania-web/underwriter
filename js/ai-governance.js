/**
 * ============================================================================
 * AI GOVERNANCE: MODELS, USE CASES, PROMPTS, EXECUTIONS, EVALUATIONS AND HUMAN REVIEW
 * ----------------------------------------------------------------------------
 * Documents were read by a set of rules, with no record of what read them, how sure it was, or whether a person looked at the result
 * before it was used. The reading is still rule-based: no language model and no OCR service is connected. This is the control layer a
 * model has to pass through before one is, and it already governs the rules.
 *
 *   MODEL        what reads: the rule-based reader that ships with the application, and any model or service registered later. A model is
 *                proposed, evaluated, approved by someone other than whoever proposed it, and can be restricted or retired.
 *   USE CASE     one thing the application uses a model for (document extraction, OCR), with its decision impact (advisory, automated
 *                with review, automated), its risk, and its human-review policy: whether review is mandatory and the confidence below
 *                which a person must look. A fully automated use case cannot sit on a high-risk model.
 *   PROMPT       for a model that takes one: versioned, evaluated, approved by someone other than its author, bound to one model.
 *   EXECUTION    every run is kept: use case, model and version, prompt version, what it read (a fingerprint) and what it produced (a
 *                fingerprint), confidence, tokens, time, cost, and status. A run that policy refuses is kept too, as blocked.
 *   EVALUATION   a measured result for a model or prompt (accuracy, error rate, drift) against a threshold, kept with the data set used.
 *   REVIEW       a person's decision on a run: accepted, modified (with what they changed), rejected or overridden. The Confirm step is
 *                that review for document reading; a run that needs one blocks the quote until it has been done.
 *
 * Only registered use cases on approved models run. A connected OCR service is refused until its model is approved. The prototype keeps
 * no tokens or cost for rules (they are not metered); a connected service reports its own.
 * ============================================================================
 */

const AI_KEY = "FUT_AI_GOV_V1";
const AI_RULES_VERSION = "2026.1";
const AI_PROVIDERS = ["internal", "azure_openai", "anthropic", "external"];
const AI_CAPABILITIES = ["extraction", "classification", "summarisation", "scoring", "generation"];
const AI_TIERS = ["low", "medium", "high"];
const AI_IMPACTS = ["advisory", "automated_with_review", "automated"];
const AI_CONF = { high: 0.95, medium: 0.8, low: 0.5 };
const AI_MIN_REASON = 10;
const AI_RATE_METRICS = ["hallucination_rate", "field_error_rate", "disparity"];
const AI_GOLDEN = [
  { name: "Application with name, FEIN and DOT", text: "Business Name: Links Freight LLC\nFEIN: 74-9842109\nUS DOT: 1234567", expected: { insured: "Links Freight LLC", fein: "74-9842109", dot: "1234567" } },
  { name: "Application with different values", text: "Business Name: Apex Haulers Inc\nFEIN: 12-3456789\nUS DOT: 7654321", expected: { insured: "Apex Haulers Inc", fein: "12-3456789", dot: "7654321" } }
];

function aiEmpty() { return { models: [], useCases: [], prompts: [], promptVersions: [], executions: [], evaluations: [], reviews: [], history: [], seq: {} }; }
var AI = aiEmpty();
function aiEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function aiNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function aiActor() { return typeof authActor === "function" ? authActor() : String(currentUserRole); }
function aiActorKey() { return typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole] ? USER_ROLES_CONFIG[currentUserRole].name : String(currentUserRole); }
function aiClone(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }
function aiStable(v) { if (Array.isArray(v)) return "[" + v.map(aiStable).join(",") + "]"; if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + aiStable(v[k])).join(",") + "}"; return JSON.stringify(v === undefined ? null : v); }
function aiHash(v) { const s = typeof v === "string" ? v : aiStable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) + ":" + s.length; }
function aiNext(kind, prefix) { AI.seq[kind] = (AI.seq[kind] || 0) + 1; return prefix + "-" + AI.seq[kind]; }
function aiSave() { try { const copy = Object.assign({}, AI, { executions: AI.executions.slice(-500) }); localStorage.setItem(AI_KEY, JSON.stringify(copy)); } catch (e) { /* storage unavailable: kept for this session */ } }
function aiHist(action, text) { AI.history.push({ at: aiNow(), by: aiActor(), action: action, text: text }); if (AI.history.length > 100) AI.history = AI.history.slice(-100); }
function aiCanRegister() { if (!hasPermission("reviewRules", "edit")) { denyPermission("reviewRules", "edit"); return false; } return true; }
function aiCanApprove() { if (!hasPermission("accessReview", "approve")) { denyPermission("accessReview", "approve"); return false; } return true; }

/** What ships: the rule-based reader, approved as code under change control, and an OCR service slot that is not approved. */
function aiSeeds() {
  return {
    models: [
      { id: "MDL-RULES", provider: "internal", modelName: "document-reader-rules", modelVersion: AI_RULES_VERSION, deploymentRef: "js/document-ingestion.js", capability: "extraction", riskTier: "medium", requiresPrompt: false, status: "approved", builtIn: true, proposedBy: "Application", approvedBy: "Built-in rule engine, under code change control", approvedAt: "" },
      { id: "MDL-OCR", provider: "external", modelName: "ocr-service", modelVersion: "unspecified", deploymentRef: "window.DOCUMENT_OCR_PROVIDER", capability: "extraction", riskTier: "high", requiresPrompt: false, status: "proposed", builtIn: true, proposedBy: "Application", approvedBy: null, approvedAt: null }],
    useCases: [
      { id: "UC-DOC", code: "document_extraction", moduleCode: "INTAKE", decisionImpact: "automated_with_review", riskTier: "medium", modelId: "MDL-RULES", humanReview: { mandatory: true, confidenceThreshold: 0.9 }, owner: "Head of Underwriting", status: "active" },
      { id: "UC-OCR", code: "ocr_reading", moduleCode: "INTAKE", decisionImpact: "automated_with_review", riskTier: "high", modelId: "MDL-OCR", humanReview: { mandatory: true, confidenceThreshold: 0.9 }, owner: "Head of Underwriting", status: "active" }]
  };
}
function aiEnsureSeeds() {
  const s = aiSeeds();
  s.models.forEach(m => { if (!AI.models.some(x => x.id === m.id)) AI.models.push(m); });
  s.useCases.forEach(u => { if (!AI.useCases.some(x => x.id === u.id)) AI.useCases.push(u); });
}
(function aiLoad() { try { const raw = localStorage.getItem(AI_KEY); if (raw) { const st = JSON.parse(raw); if (st && st.models) AI = Object.assign(aiEmpty(), st); } } catch (e) { /* damaged store ignored */ } aiEnsureSeeds(); })();
/** Back to what ships; forgets every run, evaluation and registration. */
function aiReset() { AI = aiEmpty(); aiEnsureSeeds(); try { localStorage.removeItem(AI_KEY); } catch (e) { /* nothing stored */ } }

const ai = { model: id => AI.models.find(m => m.id === id) || null, useCase: code => AI.useCases.find(u => u.code === code) || null, promptVersion: id => AI.promptVersions.find(v => v.id === id) || null };

// ----------------------------------------------------------------------------
// 1. MODELS, USE CASES, PROMPTS
// ----------------------------------------------------------------------------
/** A model is proposed by whoever registers it, with nothing approved until it is evaluated and someone else approves it. */
function aiRegisterModel(def) {
  if (!aiCanRegister()) return { ok: false, error: "permission" };
  const errs = [];
  if (AI_PROVIDERS.indexOf(def.provider) === -1) errs.push("The provider is one of " + AI_PROVIDERS.join(", ") + ".");
  if (!String(def.modelName || "").trim()) errs.push("Name the model."); if (!String(def.modelVersion || "").trim()) errs.push("Give the model version.");
  if (AI_CAPABILITIES.indexOf(def.capability) === -1) errs.push("The capability is one of " + AI_CAPABILITIES.join(", ") + ".");
  if (AI_TIERS.indexOf(def.riskTier) === -1) errs.push("The risk tier is low, medium or high.");
  if (AI.models.some(m => m.modelName === def.modelName && m.modelVersion === def.modelVersion)) errs.push("That model and version are already registered.");
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  const m = { id: aiNext("model", "MDL"), provider: def.provider, modelName: String(def.modelName).trim(), modelVersion: String(def.modelVersion).trim(), deploymentRef: String(def.deploymentRef || "").trim(), capability: def.capability, riskTier: def.riskTier, requiresPrompt: !!def.requiresPrompt, status: "proposed", builtIn: false, proposedBy: aiActor(), proposedByKey: aiActorKey(), proposedAt: aiNow(), approvedBy: null, approvedAt: null };
  AI.models.push(m); aiHist("model_proposed", m.id + " " + m.modelName + " " + m.modelVersion + " proposed."); aiSave();
  return { ok: true, model: m };
}
function aiLatestEval(match, type) { return AI.evaluations.filter(e => match(e) && (!type || e.evaluationType === type)).slice(-1)[0] || null; }
/** Approved by someone other than the proposer, and only once an evaluation of the model has passed. */
function aiApproveModel(id, note) {
  if (!aiCanApprove()) return { ok: false, error: "permission" };
  const m = ai.model(id); if (!m) return { ok: false, error: "none" };
  if (m.status !== "proposed" && m.status !== "restricted") return { ok: false, error: "status" };
  if (m.proposedByKey && m.proposedByKey === aiActorKey()) return { ok: false, error: "self" };
  if (!m.builtIn || m.provider !== "internal") { const ev = aiLatestEval(e => e.modelId === id && !e.promptVersionId, "pre_release"); if (!ev) return { ok: false, error: "no_evaluation" }; if (!ev.passed) return { ok: false, error: "failed_evaluation" }; }
  m.status = "approved"; m.approvedBy = aiActor(); m.approvedAt = aiNow(); m.approvalNote = String(note || "").trim();
  aiHist("model_approved", m.id + " approved by " + aiActor() + "."); aiSave();
  return { ok: true };
}
function aiSetModelStatus(id, status, reason) {
  if (!aiCanApprove()) return { ok: false, error: "permission" };
  const m = ai.model(id); if (!m) return { ok: false, error: "none" };
  if (["restricted", "retired"].indexOf(status) === -1) return { ok: false, error: "status" };
  if (String(reason || "").trim().length < AI_MIN_REASON) return { ok: false, error: "reason" };
  m.status = status; m.statusNote = String(reason).trim(); m.statusBy = aiActor(); m.statusAt = aiNow();
  aiHist("model_" + status, m.id + " " + status + ": " + reason); aiSave();
  return { ok: true };
}
function aiRegisterUseCase(def) {
  if (!aiCanRegister()) return { ok: false, error: "permission" };
  const errs = [], m = ai.model(def.modelId);
  if (!/^[a-z][a-z0-9_]+$/.test(String(def.code || ""))) errs.push("The code is lower case with underscores.");
  if (ai.useCase(def.code)) errs.push("Use case " + def.code + " is already registered.");
  if (!m) errs.push("The model " + def.modelId + " is not registered.");
  if (AI_IMPACTS.indexOf(def.decisionImpact) === -1) errs.push("The decision impact is one of " + AI_IMPACTS.join(", ") + ".");
  if (AI_TIERS.indexOf(def.riskTier) === -1) errs.push("The risk tier is low, medium or high.");
  const hr = def.humanReview || {};
  if (typeof hr.mandatory !== "boolean") errs.push("Say whether human review is mandatory.");
  if (!(Number(hr.confidenceThreshold) >= 0 && Number(hr.confidenceThreshold) <= 1)) errs.push("The confidence threshold is from 0 to 1.");
  if (def.decisionImpact === "automated" && (def.riskTier === "high" || (m && m.riskTier === "high"))) errs.push("A use case that runs fully automated cannot sit on a high-risk model or be high risk itself.");
  if (def.decisionImpact === "automated_with_review" && hr.mandatory !== true) errs.push("Automated with review means the review is mandatory.");
  if (errs.length) return { ok: false, error: "invalid", errors: errs };
  const u = { id: aiNext("uc", "UC"), code: def.code, moduleCode: def.moduleCode || "", decisionImpact: def.decisionImpact, riskTier: def.riskTier, modelId: def.modelId, humanReview: { mandatory: hr.mandatory, confidenceThreshold: Number(hr.confidenceThreshold) }, owner: def.owner || aiActor(), status: "active" };
  AI.useCases.push(u); aiHist("use_case_registered", u.code + " on " + def.modelId + "."); aiSave();
  return { ok: true, useCase: u };
}
function aiAddPrompt(def) {
  if (!aiCanRegister()) return { ok: false, error: "permission" };
  if (!ai.useCase(def.useCaseCode)) return { ok: false, error: "use_case" };
  if (!String(def.code || "").trim()) return { ok: false, error: "code" };
  const p = { id: aiNext("prompt", "PRM"), useCaseCode: def.useCaseCode, code: def.code, purpose: String(def.purpose || "") };
  AI.prompts.push(p); aiSave(); return { ok: true, prompt: p };
}
function aiAddPromptVersion(promptId, def) {
  if (!aiCanRegister()) return { ok: false, error: "permission" };
  const p = AI.prompts.find(x => x.id === promptId); if (!p) return { ok: false, error: "none" };
  if (!ai.model(def.modelId)) return { ok: false, error: "model" };
  if (!String(def.template || "").trim()) return { ok: false, error: "template" };
  const n = AI.promptVersions.filter(v => v.promptId === promptId).length + 1;
  const v = { id: aiNext("pv", "PV"), promptId: promptId, versionNo: n, modelId: def.modelId, template: String(def.template), templateHash: aiHash(String(def.template)), parameters: aiClone(def.parameters || {}), outputSchema: aiClone(def.outputSchema || null), status: "draft", authorKey: aiActorKey(), author: aiActor(), createdAt: aiNow(), approvedBy: null };
  AI.promptVersions.push(v); aiHist("prompt_version_added", p.code + " v" + n + " on " + def.modelId + "."); aiSave();
  return { ok: true, version: v };
}
function aiApprovePromptVersion(id) {
  if (!aiCanApprove()) return { ok: false, error: "permission" };
  const v = ai.promptVersion(id); if (!v) return { ok: false, error: "none" };
  if (v.status !== "draft") return { ok: false, error: "status" };
  if (v.authorKey === aiActorKey()) return { ok: false, error: "self" };
  const ev = aiLatestEval(e => e.promptVersionId === id); if (!ev) return { ok: false, error: "no_evaluation" }; if (!ev.passed) return { ok: false, error: "failed_evaluation" };
  AI.promptVersions.filter(x => x.promptId === v.promptId && x.status === "approved").forEach(x => { x.status = "retired"; x.retiredAt = aiNow(); });
  v.status = "approved"; v.approvedBy = aiActor(); v.approvedAt = aiNow(); v.effectiveFrom = new Date().toISOString().slice(0, 10);
  aiHist("prompt_version_approved", v.id + " approved; the earlier approved version is retired."); aiSave();
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 2. EVALUATIONS
// ----------------------------------------------------------------------------
/** Records a measured result for a model or prompt against a threshold. A rate (an error or hallucination rate) passes when it is at or below it; anything else when at or above. */
function aiEvaluate(o) {
  if (!aiCanRegister()) return { ok: false, error: "permission" };
  if (!ai.model(o.modelId)) return { ok: false, error: "model" };
  if (["pre_release", "regression", "drift", "bias"].indexOf(o.evaluationType) === -1) return { ok: false, error: "type" };
  if (!String(o.datasetRef || "").trim()) return { ok: false, error: "dataset" };
  if (!String(o.metricCode || "").trim()) return { ok: false, error: "metric" };
  const value = Number(o.value), threshold = Number(o.threshold);
  if (isNaN(value) || isNaN(threshold)) return { ok: false, error: "numbers" };
  const e = { id: aiNext("eval", "EV"), modelId: o.modelId, promptVersionId: o.promptVersionId || null, evaluationType: o.evaluationType, datasetRef: String(o.datasetRef).trim(), metricCode: o.metricCode, metricValue: value, threshold: threshold, passed: AI_RATE_METRICS.indexOf(o.metricCode) > -1 ? value <= threshold : value >= threshold, runBy: aiActor(), evaluatedAt: aiNow() };
  AI.evaluations.push(e); aiHist("evaluated", e.id + " " + e.metricCode + " " + value + " against " + threshold + ": " + (e.passed ? "passed" : "failed") + "."); aiSave();
  return { ok: true, evaluation: e };
}
/** Runs the rule-based reader over the built-in golden documents and records field accuracy. */
function aiRunGoldenEvaluation(modelId, threshold) {
  const m = ai.model(modelId); if (!m || m.provider !== "internal") return { ok: false, error: "model" };
  let right = 0, total = 0;
  AI_GOLDEN.forEach(c => { const d = buildLocalNormalizationDraft({ rawEmailText: c.text, lobKey: "trucking", id: "GOLDEN" }); Object.keys(c.expected).forEach(k => { total++; if (diNorm(d[k]) === diNorm(c.expected[k])) right++; }); });
  return aiEvaluate({ modelId: modelId, evaluationType: "regression", datasetRef: "built-in golden set (" + AI_GOLDEN.length + " documents, " + total + " fields)", metricCode: "field_accuracy", value: total ? right / total : 0, threshold: threshold === undefined ? 0.9 : threshold });
}

// ----------------------------------------------------------------------------
// 3. EXECUTIONS
// ----------------------------------------------------------------------------
/** May this use case run now? Registered and active, on an approved model, and with an approved prompt where the model needs one. */
function aiGate(code) {
  const uc = ai.useCase(code), reasons = [];
  if (!uc) return { ok: false, reasons: ["The use case " + code + " is not registered."], uc: null, model: null, prompt: null };
  if (uc.status !== "active") reasons.push("The use case " + code + " is " + uc.status + ".");
  const m = ai.model(uc.modelId);
  if (!m) reasons.push("The model " + uc.modelId + " is not registered.");
  else if (m.status !== "approved") reasons.push("The model " + m.modelName + " " + m.modelVersion + " is " + m.status + ", not approved.");
  let prompt = null;
  if (m && m.requiresPrompt) { prompt = AI.promptVersions.filter(v => v.status === "approved" && v.modelId === m.id && (AI.prompts.find(p => p.id === v.promptId) || {}).useCaseCode === code).slice(-1)[0] || null; if (!prompt) reasons.push("No approved prompt version exists for " + code + " on " + m.modelName + "."); }
  return { ok: reasons.length === 0, reasons: reasons, uc: uc, model: m, prompt: prompt };
}
function aiConfidenceOf(draft) {
  const vals = Object.keys((draft && draft.fields_confidence) || {}).map(k => AI_CONF[draft.fields_confidence[k]]).filter(v => v !== undefined);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 1000) / 1000 : null;
}
function aiRecord(g, code, o) {
  const uc = g.uc, thr = uc ? uc.humanReview.confidenceThreshold : 1, ok = o.status === "succeeded";
  const need = ok && uc && (uc.humanReview.mandatory || (o.confidence !== null && o.confidence !== undefined && o.confidence < thr));
  const ex = { id: aiNext("exec", "AX"), useCaseCode: code, modelId: g.model ? g.model.id : null, modelName: g.model ? g.model.modelName : null, modelVersion: g.model ? g.model.modelVersion : null, promptVersionId: g.prompt ? g.prompt.id : null, relatedEntityType: o.entityType || null, relatedEntityId: o.entityId || null, inputReference: o.inputReference || "", inputHash: o.inputHash || null, outputHash: o.outputHash || null, confidence: o.confidence === undefined ? null : o.confidence, tokensIn: o.tokensIn === undefined ? null : o.tokensIn, tokensOut: o.tokensOut === undefined ? null : o.tokensOut, latencyMs: o.latencyMs === undefined ? null : o.latencyMs, costAmount: o.costAmount === undefined ? null : o.costAmount, currency: "USD", status: o.status, reasons: o.reasons || [], startedAt: aiNow(), by: aiActor(), reviewRequired: !!need, reviewStatus: need ? "pending" : "not_required", reviewIds: [] };
  AI.executions.push(ex); if (AI.executions.length > 1000) AI.executions = AI.executions.slice(-1000); aiSave();
  return ex;
}

var _aiOrigConsolidate = window.diConsolidate;
window.diConsolidate = function (sub, sources) {
  const g = aiGate("document_extraction"), t0 = performance.now();
  if (!g.ok) {
    const ex = aiRecord(g, "document_extraction", { status: "blocked_by_policy", reasons: g.reasons, entityType: "submission", entityId: sub && sub.id, inputReference: (sources || []).map(s => s.name).join(", ") });
    const empty = _aiOrigConsolidate.call(this, sub, []);
    empty.aiBlocked = g.reasons; empty.needs_review = true; empty.review_reasons = ["Nothing was read: " + g.reasons[0]].concat(empty.review_reasons || []);
    if (sub && sub.id) { if (!sub.aiExecutionIds) sub.aiExecutionIds = []; sub.aiExecutionIds.push(ex.id); }
    return empty;
  }
  let draft;
  try { draft = _aiOrigConsolidate.apply(this, arguments); }
  catch (e) { aiRecord(g, "document_extraction", { status: "failed", reasons: [e.message], entityType: "submission", entityId: sub && sub.id, inputReference: (sources || []).map(s => s.name).join(", ") }); throw e; }
  try {
    const ex = aiRecord(g, "document_extraction", { status: "succeeded", entityType: "submission", entityId: sub && sub.id, inputReference: (sources || []).map(s => s.name).join(", "), inputHash: aiHash((sources || []).map(s => s.name + "|" + (s.text || "")).join("\n")), outputHash: aiHash({ f: Object.keys(draft).filter(k => typeof draft[k] !== "object" || draft[k] === null).map(k => k + "=" + draft[k]), v: draft.vehicleDetails, d: draft.driverDetails, l: draft.lossHistory }), confidence: aiConfidenceOf(draft), latencyMs: Math.round((performance.now() - t0) * 10) / 10, tokensIn: null, tokensOut: null, costAmount: 0 });
    if (sub && sub.id) {
      if (!sub.aiExecutionIds) sub.aiExecutionIds = []; sub.aiExecutionIds.push(ex.id);
      (sub.dataObservations || []).forEach(o => { if (o.status === "current" && (o.sourceType === "DOCUMENT" || o.sourceType === "EMAIL") && !o.aiExecutionId) o.aiExecutionId = ex.id; });
    }
    draft.aiExecutionId = ex.id;
  } catch (e) { console.warn("AI execution record failed:", e); }
  return draft;
};

/** The wrapper document-ingestion.js calls for a connected OCR service: refused (null) unless the use case and its model are approved. */
async function aiGovernOcrCall(provider, name, bytes, kind) {
  const g = aiGate("ocr_reading"), t0 = performance.now();
  if (!g.ok) { aiRecord(g, "ocr_reading", { status: "blocked_by_policy", reasons: g.reasons, entityType: "document", entityId: name, inputReference: name }); return null; }
  try {
    const o = await provider(name, bytes, kind);
    aiRecord(g, "ocr_reading", { status: "succeeded", entityType: "document", entityId: name, inputReference: name, inputHash: aiHash(Array.prototype.slice.call(bytes.slice ? bytes.slice(0, 4096) : bytes).join(",") + ":" + (bytes.length || 0)), outputHash: aiHash(String((o && o.text) || "")), confidence: o && typeof o.confidence === "number" ? o.confidence : null, tokensIn: o && o.tokensIn !== undefined ? o.tokensIn : null, tokensOut: o && o.tokensOut !== undefined ? o.tokensOut : null, costAmount: o && o.cost !== undefined ? o.cost : null, latencyMs: Math.round((performance.now() - t0) * 10) / 10 });
    return o;
  } catch (e) { aiRecord(g, "ocr_reading", { status: "failed", reasons: [e.message], entityType: "document", entityId: name, inputReference: name }); throw e; }
}

// ----------------------------------------------------------------------------
// 4. HUMAN REVIEW
// ----------------------------------------------------------------------------
function aiSubExecutions(sub) {
  const names = (sub.rawAttachments || []).map(a => a.name);
  return AI.executions.filter(x => (x.relatedEntityType === "submission" && x.relatedEntityId === sub.id) || (x.relatedEntityType === "document" && names.indexOf(x.relatedEntityId) > -1));
}
function aiPending(sub) { return aiSubExecutions(sub).filter(x => x.reviewRequired && x.reviewStatus === "pending"); }
/** A person's decision on a run. Rejected and overridden need a reason; modified says what changed. */
function aiReview(executionId, o) {
  if (!hasPermission("completeness", "edit")) { denyPermission("completeness", "edit"); return { ok: false, error: "permission" }; }
  return aiRecordReview(executionId, o);
}
/** Writes the review. Confirming the fields at the Confirm step is itself the review, so it does not ask for a second permission. */
function aiRecordReview(executionId, o) {
  o = o || {};
  const ex = AI.executions.find(x => x.id === executionId); if (!ex) return { ok: false, error: "none" };
  if (["accepted", "modified", "rejected", "overridden"].indexOf(o.decision) === -1) return { ok: false, error: "decision" };
  if (["rejected", "overridden"].indexOf(o.decision) > -1 && String(o.reason || "").trim().length < AI_MIN_REASON) return { ok: false, error: "reason" };
  if (o.decision === "modified" && !(o.changes && o.changes.length)) return { ok: false, error: "changes" };
  const r = { id: aiNext("review", "AR"), executionId: executionId, reviewerRole: currentUserRole, reviewer: aiActor(), decision: o.decision, changes: aiClone(o.changes || []), reason: String(o.reason || "").trim(), reviewedAt: aiNow() };
  AI.reviews.push(r); ex.reviewIds.push(r.id); if (ex.reviewRequired) ex.reviewStatus = "reviewed"; aiHist("reviewed", ex.id + " " + o.decision + " by " + aiActor() + "."); aiSave();
  return { ok: true, review: r };
}
// confirming the reading is the review of it: accepted if nothing was changed, modified (with what) if the person changed it
var _aiOrigApply = window.applyNormalizedDataToSubmission;
window.applyNormalizedDataToSubmission = function (subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId), before = sub ? (sub.dataObservations || []).map(o => o.id) : [];
  const r = _aiOrigApply.apply(this, arguments);
  try {
    if (sub) {
      const pend = aiPending(sub);
      if (pend.length) {
        const changes = (sub.dataObservations || []).filter(o => o.sourceType === "USER" && before.indexOf(o.id) === -1).map(o => ({ field: o.path, to: o.value }));
        pend.forEach(ex => aiRecordReview(ex.id, changes.length ? { decision: "modified", changes: changes, reason: "Confirmed at the Confirm step with changes." } : { decision: "accepted", reason: "Confirmed at the Confirm step." }));
        renderAiReview(sub);
      }
    }
  } catch (e) { console.warn("AI review at Confirm failed:", e); }
  return r;
};

// a reading nobody has reviewed does not become a quote
const aiQuoteGuard = () => {
  const sub = SUBMISSIONS_DATASET.find(x => x.id === activeSubmissionId); if (!sub) return true;
  const p = aiPending(sub); if (!p.length) return true;
  if (!sub.decisionLog) sub.decisionLog = []; sub.decisionLog.push({ step: sub.currentStep || 12, decision: "ai_review_blocked", by: aiActor(), at: aiNow(), notes: "Quote refused: " + p.length + " reading(s) by " + p.map(x => x.modelName + " " + x.modelVersion).join(", ") + " await a person's review (" + p.map(x => x.id).join(", ") + ")." });
  showToast("⛔ The reading of the documents (" + p[0].id + ") has not been reviewed by a person. Confirm it at the Confirm step first.", "danger");
  return false;
};
if (typeof registerGuard === "function") { registerGuard("issueQuote", "AI output reviewed", aiQuoteGuard); registerGuard("eSign", "AI output reviewed", aiQuoteGuard); }
var _aiOrigBrief = window.buildDecisionBrief;
window.buildDecisionBrief = function (sub) {
  const b = _aiOrigBrief.apply(this, arguments);
  try {
    const ex = aiSubExecutions(sub);
    if (ex.length) { const p = ex.filter(x => x.reviewRequired && x.reviewStatus === "pending"), blocked = ex.filter(x => x.status === "blocked_by_policy");
      b.checks.push(blocked.length ? dbCheck("AI governance", "fail", blocked.length + " reading(s) were refused by policy: " + blocked[0].reasons[0])
        : p.length ? dbCheck("AI governance", "fail", p.length + " reading(s) await a person's review before a quote: " + p.map(x => x.modelName + " " + x.modelVersion).join(", ") + ".")
          : dbCheck("AI governance", "ok", ex.length + " reading(s) by " + Array.from(new Set(ex.map(x => x.modelName + " " + x.modelVersion))).join(", ") + ", reviewed by a person.")); }
  } catch (e) { console.warn("Brief additions failed:", e); }
  return b;
};

// ----------------------------------------------------------------------------
// 5. SCREENS
// ----------------------------------------------------------------------------
function aiPct(c) { return c === null || c === undefined ? "n/a" : Math.round(c * 100) + "%"; }
function renderAiReview(sub) {
  const box = document.getElementById("aiReviewContainer"); if (!box) return;
  if (!sub) { box.innerHTML = ""; return; }
  const ex = aiSubExecutions(sub); if (!ex.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="card" style="margin-top:12px;"><div class="card-header"><h3><i class="ph ph-robot"></i> How the documents were read</h3><span class="badge ${ex.some(x => x.reviewRequired && x.reviewStatus === "pending") ? "badge-warning" : "badge-success"}">${ex.some(x => x.reviewRequired && x.reviewStatus === "pending") ? "Awaiting your review" : "Reviewed"}</span></div><div class="card-body">
    <p class="ws-small text-muted" style="margin:0 0 6px;">The reader is a set of rules, not a language model. Confirming the fields below is the person's review of its reading.</p>
    <table class="data-table"><thead><tr><th>Run</th><th>Use</th><th>Model</th><th>Confidence</th><th>Review</th></tr></thead><tbody>${ex.slice(-5).reverse().map(x => { const r = AI.reviews.find(y => y.id === x.reviewIds[x.reviewIds.length - 1]); return `<tr><td>${aiEsc(x.id)}<div class="text-xs text-muted">${aiEsc(x.startedAt)}</div></td><td>${aiEsc(x.useCaseCode)}<div class="text-xs text-muted">${aiEsc(x.inputReference.slice(0, 60))}</div></td><td>${aiEsc(x.modelName || "-")} ${aiEsc(x.modelVersion || "")}</td><td>${aiPct(x.confidence)}</td><td>${x.status === "blocked_by_policy" ? '<span class="badge badge-danger">Refused by policy</span>' : x.reviewStatus === "reviewed" && r ? `<span class="badge badge-success">${aiEsc(r.decision)}</span> <span class="text-xs text-muted">${aiEsc(r.reviewer)}${r.changes.length ? ", " + r.changes.length + " change(s)" : ""}</span>` : x.reviewRequired ? '<span class="badge badge-warning">Pending</span>' : '<span class="badge badge-light">Not required</span>'}</td></tr>`; }).join("")}</tbody></table></div></div>`;
}
registerStepRenderer("aiReview", renderAiReview);

var AI_UI = { open: null };
function aiUiV(id) { const e = document.getElementById(id); return e ? e.value.trim() : ""; }
function aiUiToast(r, ok) {
  if (r.ok) { if (ok) showToast(ok, "success"); return; }
  const m = { invalid: (r.errors || [])[0], self: "You proposed or wrote this; someone else must approve it.", status: "That is not possible at this stage.", no_evaluation: "It has not been evaluated yet.", failed_evaluation: "Its latest evaluation failed.", reason: "Give a reason (at least " + AI_MIN_REASON + " characters).", none: "Not found.", model: "That model is not available for this.", dataset: "Name the data set.", metric: "Name the metric.", numbers: "Value and threshold are numbers.", type: "Unknown evaluation type.", decision: "Unknown decision.", changes: "Say what was changed." };
  if (m[r.error]) showToast(m[r.error], "warning");
}
function aiUiRegister() {
  const kind = aiUiV("ai_kind"); let o; try { o = JSON.parse(aiUiV("ai_json")); } catch (e) { showToast("That is not valid JSON.", "danger"); return; }
  const r = kind === "model" ? aiRegisterModel(o) : kind === "use_case" ? aiRegisterUseCase(o) : kind === "evaluation" ? aiEvaluate(o) : (function () { const p = AI.prompts.find(x => x.code === o.promptCode) || (aiAddPrompt({ useCaseCode: o.useCaseCode, code: o.promptCode, purpose: o.purpose }) || {}).prompt; return p ? aiAddPromptVersion(p.id, o) : { ok: false, error: "none" }; })();
  aiUiToast(r, "Registered."); renderAiGovernance();
}
function aiUiApproveModel(id) { aiUiToast(aiApproveModel(id, aiUiV("ai_reason")), "Model approved."); renderAiGovernance(); }
function aiUiStatus(id, status) { aiUiToast(aiSetModelStatus(id, status, aiUiV("ai_reason")), "Model " + status + "."); renderAiGovernance(); }
function aiUiGolden(id) { aiUiToast(aiRunGoldenEvaluation(id), "Evaluation recorded."); renderAiGovernance(); }
function aiUiApprovePrompt(id) { aiUiToast(aiApprovePromptVersion(id), "Prompt version approved."); renderAiGovernance(); }

function renderAiGovernance() {
  const box = document.getElementById("aiGovernanceRoot"); if (!box) return;
  const canReg = hasPermission("reviewRules", "edit"), canApp = hasPermission("accessReview", "approve");
  const stats = {}; AI.executions.forEach(x => { const s = stats[x.useCaseCode] = stats[x.useCaseCode] || { n: 0, blocked: 0, failed: 0, conf: [], need: 0, reviewed: 0, modified: 0 }; s.n++; if (x.status === "blocked_by_policy") s.blocked++; if (x.status === "failed") s.failed++; if (typeof x.confidence === "number") s.conf.push(x.confidence); if (x.reviewRequired) s.need++; if (x.reviewStatus === "reviewed") { s.reviewed++; if (x.reviewIds.some(id => (AI.reviews.find(r => r.id === id) || {}).decision === "modified")) s.modified++; } });
  let h = `<div class="card"><div class="card-header"><h3><i class="ph ph-robot"></i> AI governance: models, use cases, runs and review</h3><span class="badge badge-light">${AI.executions.length} run(s) kept</span></div><div class="card-body">
    <p class="ws-small text-muted" style="margin:0 0 8px;">The documents are read by a set of rules. No language model and no OCR service is connected. Anything that reads must be a registered use case on an approved model; a connected OCR service is refused until its model is evaluated and approved by someone other than the person who proposed it. A person's review of each reading is kept.</p>`;
  h += `<div class="uwp-subsection-title">Models</div><input id="ai_reason" class="form-control form-control-sm" style="width:300px;margin-bottom:4px;" placeholder="Reason or note (needed to restrict or retire)"><table class="data-table"><thead><tr><th>Model</th><th>Provider</th><th>Risk</th><th>Evaluation</th><th>Status</th><th></th></tr></thead><tbody>${AI.models.map(m => { const ev = aiLatestEval(e => e.modelId === m.id && !e.promptVersionId); return `<tr><td><strong>${aiEsc(m.id)}</strong> ${aiEsc(m.modelName)} ${aiEsc(m.modelVersion)}<div class="text-xs text-muted">${aiEsc(m.capability)}${m.builtIn ? ", ships with the application" : ""}</div></td><td>${aiEsc(m.provider)}</td><td>${aiEsc(m.riskTier)}</td><td class="ws-small">${ev ? aiEsc(ev.metricCode + " " + ev.metricValue + " vs " + ev.threshold) + ' <span class="badge ' + (ev.passed ? "badge-success" : "badge-danger") + '">' + (ev.passed ? "passed" : "failed") + "</span>" : "none"}</td><td><span class="badge ${m.status === "approved" ? "badge-success" : m.status === "proposed" ? "badge-warning" : "badge-light"}">${aiEsc(m.status)}</span>${m.approvedBy ? `<div class="text-xs text-muted">${aiEsc(m.approvedBy)}</div>` : ""}</td><td>${[canReg && m.provider === "internal" ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="aiUiGolden('${m.id}')">Run golden evaluation</button>` : "", canApp && (m.status === "proposed" || m.status === "restricted") ? `<button class="btn btn-xs btn-primary" style="width:auto;" onclick="aiUiApproveModel('${m.id}')">Approve</button>` : "", canApp && m.status === "approved" ? `<button class="btn btn-xs btn-outline" style="width:auto;" onclick="aiUiStatus('${m.id}','restricted')">Restrict</button> <button class="btn btn-xs btn-outline" style="width:auto;" onclick="aiUiStatus('${m.id}','retired')">Retire</button>` : ""].join(" ")}</td></tr>`; }).join("")}</tbody></table>`;
  h += `<div class="uwp-subsection-title" style="margin-top:12px;">Use cases</div><table class="data-table"><thead><tr><th>Use case</th><th>Impact</th><th>Human review</th><th>Model</th><th>Runs</th><th>Mean confidence</th><th>Review</th></tr></thead><tbody>${AI.useCases.map(u => { const s = stats[u.code] || { n: 0, blocked: 0, conf: [], need: 0, reviewed: 0, modified: 0 }; const mean = s.conf.length ? s.conf.reduce((a, b) => a + b, 0) / s.conf.length : null; return `<tr><td><strong>${aiEsc(u.code)}</strong><div class="text-xs text-muted">${aiEsc(u.id)}, ${aiEsc(u.riskTier)} risk, ${aiEsc(u.status)}</div></td><td>${aiEsc(u.decisionImpact.replace(/_/g, " "))}</td><td class="ws-small">${u.humanReview.mandatory ? "Mandatory" : "When below"} ${aiPct(u.humanReview.confidenceThreshold)}</td><td class="ws-small">${aiEsc(u.modelId)}</td><td>${s.n}${s.blocked ? ` <span class="badge badge-danger">${s.blocked} refused</span>` : ""}</td><td>${aiPct(mean)}</td><td class="ws-small">${s.reviewed} of ${s.need} reviewed${s.reviewed ? ", " + s.modified + " modified" : ""}</td></tr>`; }).join("")}</tbody></table>`;
  if (AI.promptVersions.length) h += `<div class="uwp-subsection-title" style="margin-top:12px;">Prompt versions</div><table class="data-table"><thead><tr><th>Version</th><th>Prompt</th><th>Model</th><th>Fingerprint</th><th>Status</th><th></th></tr></thead><tbody>${AI.promptVersions.map(v => { const p = AI.prompts.find(x => x.id === v.promptId) || {}; return `<tr><td>${aiEsc(v.id)} v${v.versionNo}</td><td>${aiEsc(p.code)}<div class="text-xs text-muted">${aiEsc(p.useCaseCode)}</div></td><td>${aiEsc(v.modelId)}</td><td class="font-mono ws-small">${aiEsc(v.templateHash.split(":")[0])}</td><td><span class="badge ${v.status === "approved" ? "badge-success" : "badge-light"}">${aiEsc(v.status)}</span></td><td>${canApp && v.status === "draft" ? `<button class="btn btn-xs btn-primary" style="width:auto;" onclick="aiUiApprovePrompt('${v.id}')">Approve</button>` : ""}</td></tr>`; }).join("")}</tbody></table>`;
  if (AI.evaluations.length) h += `<div class="uwp-subsection-title" style="margin-top:12px;">Evaluations</div><table class="data-table"><thead><tr><th>Evaluation</th><th>For</th><th>Data set</th><th>Result</th></tr></thead><tbody>${AI.evaluations.slice(-8).reverse().map(e => `<tr><td>${aiEsc(e.id)} ${aiEsc(e.evaluationType)}<div class="text-xs text-muted">${aiEsc(e.evaluatedAt)} ${aiEsc(e.runBy)}</div></td><td class="ws-small">${aiEsc(e.modelId)}${e.promptVersionId ? " / " + aiEsc(e.promptVersionId) : ""}</td><td class="ws-small">${aiEsc(e.datasetRef)}</td><td>${aiEsc(e.metricCode)} ${e.metricValue} vs ${e.threshold} <span class="badge ${e.passed ? "badge-success" : "badge-danger"}">${e.passed ? "passed" : "failed"}</span></td></tr>`).join("")}</tbody></table>`;
  h += `<div class="uwp-subsection-title" style="margin-top:12px;">Recent runs</div>${AI.executions.length ? `<table class="data-table"><thead><tr><th>Run</th><th>Use</th><th>On</th><th>Model</th><th>Confidence</th><th>Time</th><th>Status</th><th>Review</th></tr></thead><tbody>${AI.executions.slice(-12).reverse().map(x => `<tr><td>${aiEsc(x.id)}<div class="text-xs text-muted">${aiEsc(x.startedAt)}</div></td><td>${aiEsc(x.useCaseCode)}</td><td class="ws-small">${aiEsc(x.relatedEntityId || "-")}</td><td class="ws-small">${aiEsc(x.modelName || "-")} ${aiEsc(x.modelVersion || "")}</td><td>${aiPct(x.confidence)}</td><td>${x.latencyMs === null ? "-" : x.latencyMs + " ms"}</td><td><span class="badge ${x.status === "succeeded" ? "badge-success" : "badge-danger"}">${aiEsc(x.status.replace(/_/g, " "))}</span>${x.reasons.length ? `<div class="text-xs text-muted">${aiEsc(x.reasons[0])}</div>` : ""}</td><td class="ws-small">${x.reviewStatus.replace("_", " ")}</td></tr>`).join("")}</tbody></table>` : '<p class="ws-small text-muted">Nothing has been read yet.</p>'}`;
  if (canReg) h += `<details style="margin-top:10px;"><summary class="ws-small">Register a model, use case, prompt version or evaluation (JSON)</summary><select id="ai_kind" class="form-control form-control-sm" style="width:auto;margin:4px 0;"><option value="model">Model</option><option value="use_case">Use case</option><option value="prompt_version">Prompt version</option><option value="evaluation">Evaluation</option></select><textarea id="ai_json" class="form-control" rows="4" placeholder='{"provider":"azure_openai","modelName":"...","modelVersion":"...","capability":"extraction","riskTier":"medium","requiresPrompt":true}'></textarea><button class="btn btn-sm btn-warning" style="width:auto;margin-top:4px;" onclick="aiUiRegister()">Register</button></details>`;
  if (AI.history.length) h += `<div class="text-xs text-muted" style="margin-top:8px;">History: ${AI.history.slice(-3).reverse().map(x => aiEsc(x.at + " " + x.text)).join("; ")}</div>`;
  box.innerHTML = h + "</div></div>";
}
(function installAiTab() {
  const origSwitch = window.switchQuoteIntelTab; if (typeof origSwitch !== "function") return;
  window.switchQuoteIntelTab = function (tab) {
    const panel = document.getElementById("qiPanelAi"), tb = document.getElementById("qiTabAi");
    if (tab === "ai") {
      origSwitch.call(this, "renewal"); quoteIntelActiveTab = "ai";
      document.querySelectorAll('[id^="qiPanel"]').forEach(e => { e.style.display = "none"; }); document.querySelectorAll('[id^="qiTab"]').forEach(e => { e.classList.remove("active"); });
      if (tb) tb.classList.add("active"); if (panel) panel.style.display = "block"; renderAiGovernance(); return;
    }
    const r = origSwitch.apply(this, arguments); if (panel) panel.style.display = "none"; if (tb) tb.classList.remove("active"); return r;
  };
})();
(function installAiAudit() {
  if (typeof AUDIT_ACTION_META === "undefined") return;
  AUDIT_ACTION_META.ai_review_blocked = { label: "Quote Refused: Reading Not Reviewed", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
})();

Object.assign(window, { aiRegisterModel, aiApproveModel, aiSetModelStatus, aiRegisterUseCase, aiAddPrompt, aiAddPromptVersion, aiApprovePromptVersion, aiEvaluate, aiRunGoldenEvaluation, aiGate, aiGovernOcrCall, aiReview, aiRecordReview, aiPending, aiSubExecutions, aiReset, renderAiReview, renderAiGovernance, aiUiRegister, aiUiApproveModel, aiUiStatus, aiUiGolden, aiUiApprovePrompt });
