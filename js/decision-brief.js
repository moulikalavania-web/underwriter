/**
 * ============================================================================
 * DECISION BRIEF AND BROKER RESPONSE (Step 8)
 * ----------------------------------------------------------------------------
 * By this step the case has been ingested, cleared, extracted, confirmed, checked and scored. The brief puts it on one
 * page: the appetite fit, how complete the file is, the risk score, and every check with the result it gave, then says
 * what the evidence points to:
 *
 *   QUOTE       within appetite, complete, legal checks passed          -> tell the broker we will quote
 *   NEED MORE   the file is incomplete, a legal check has not passed,   -> ask the broker for what is missing
 *               or another broker holds the market
 *   DECLINE     a rule the product does not allow to be overridden fails -> tell the broker no
 *
 * The recommendation is a suggestion. The underwriter picks the reply, can edit the draft, and records it. Recording a
 * reply writes it to the case log and to sub.brokerResponses; nothing is sent from the prototype (there is no mail
 * server). A decline goes through the existing decline flow so its adverse-action notice rules still apply, and a
 * request for more goes through the existing RFI so the missing items are registered on the case.
 * ============================================================================
 */

function dbCheck(label, status, detail) { return { label: label, status: status, detail: detail || "" }; }

/** Every result the brief shows, and what it adds up to. Pure: reads the case, writes nothing. */
function buildDecisionBrief(sub) {
  const ap = appetiteMatch(sub);
  const comp = typeof evaluateCompleteness === "function" ? evaluateCompleteness(sub) : null;
  const checks = [];

  let cc = null;
  try { cc = clearanceChecks(sub); } catch (e) { cc = null; }
  if (cc) {
    checks.push(dbCheck("Producer licence and appointment", cc.producer.ok ? "ok" : "fail", cc.producer.label + (cc.producer.detail ? ": " + cc.producer.detail : "")));
    checks.push(dbCheck("Sanctions screening", cc.sanctions.ok ? "ok" : "fail", cc.sanctions.label + (cc.sanctions.detail ? ": " + cc.sanctions.detail : "")));
  }
  const mc = sub.marketClearance;
  checks.push(mc && mc.status === "conflict"
    ? dbCheck("Market clearance", "fail", "Another broker holds the market on this insured (" + (mc.holderId || "") + ", " + (mc.holderBroker || "") + ").")
    : dbCheck("Market clearance", "ok", mc && mc.status === "resolved" ? "A conflict was resolved." : "No competing broker."));
  const dup = typeof findDuplicateSubmission === "function" ? findDuplicateSubmission(sub.insured, sub.fein, sub.id) : null;
  checks.push(dup ? dbCheck("Duplicate check", "warn", dup.id + " has the same FEIN or insured name.") : dbCheck("Duplicate check", "ok", "No other case matches."));
  if (comp) checks.push(comp.status === "complete" ? dbCheck("Completeness", "ok", comp.percent + "% of required items present.") : dbCheck("Completeness", "warn", comp.missingRequired.length + " required item(s) missing: " + comp.missingRequired.slice(0, 4).map(i => i.label).join("; ") + (comp.missingRequired.length > 4 ? "…" : "")));

  const loss = analyzeLossRuns(sub);
  const lossWarn = loss.flags.filter(f => f.level === "warn");
  checks.push(loss.noRows ? dbCheck("Loss history", "warn", "No loss data on the case.") : (lossWarn.length ? dbCheck("Loss history", "warn", lossWarn.slice(0, 2).map(f => f.text).join(" ")) : dbCheck("Loss history", "ok", loss.claims + " claim(s), " + anUsd(loss.incurred) + " incurred over " + ANALYSIS_TERMS + " policy years.")));
  const sov = buildSov(sub);
  if (sov) {
    const sa = analyzeSov(sub, sov), warn = sa.flags.filter(f => f.level === "warn");
    checks.push(warn.length ? dbCheck("Statement of values", "warn", warn.slice(0, 2).map(f => f.text).join(" ")) : dbCheck("Statement of values", "ok", sa.count + " item(s), " + anUsd(sa.total) + " in total."));
  }
  checks.push(dbCheck("Registry verification (FMCSA, NHTSA, DMV)", "pending", "No registry is connected, so these were not checked by the system. Verify with the source."));
  checks.push(dbCheck("Placement", "info", (sub.placementType || "surplus") === "surplus" ? "Surplus lines: diligent search, tax and licensed broker are handled at the Surplus Lines step." : "Admitted placement."));
  try {
    const req = authRequiredRole(authMeasures(sub));
    checks.push(dbCheck("Authority needed", "info", req === null ? "Above every internal authority level; it can only be placed with the carrier's approval." : authRoleLabel(req) + " or above."));
  } catch (e) { /* authority module not loaded */ }

  const reasons = [];
  let recommendation = "quote";
  if (ap.verdict === "out") { recommendation = "decline"; reasons.push("Fails a rule the product does not allow to be overridden: " + ap.hard.map(r => r.factor).join("; ") + "."); }
  else {
    if (cc && !cc.ok) { recommendation = "info"; reasons.push("A legal check has not passed."); }
    if (mc && mc.status === "conflict") { recommendation = "info"; reasons.push("Another broker holds the market."); }
    if (comp && comp.status !== "complete") { recommendation = "info"; reasons.push(comp.missingRequired.length + " required item(s) are missing."); }
  }
  if (recommendation === "quote") reasons.push(ap.verdict === "exceptions" ? "Within appetite once the exceptions are approved." : "Within appetite, complete, and the legal checks passed.");
  return { appetite: ap, completeness: comp, checks: checks, recommendation: recommendation, reasons: reasons, loss: loss };
}
window.buildDecisionBrief = buildDecisionBrief;

const DB_KINDS = {
  quote: { label: "Yes, we will quote", badge: "badge-success", icon: "ph-check-circle" },
  info: { label: "Need more information", badge: "badge-warning", icon: "ph-question" },
  decline: { label: "No, we will not quote", badge: "badge-danger", icon: "ph-prohibit" }
};

/** The draft reply to the broker for one answer. It uses only what is on the case. */
function brokerResponseDraft(sub, kind, brief) {
  brief = brief || buildDecisionBrief(sub);
  const who = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || {};
  const sign = "\n\nRegards,\n" + (who.name || "Underwriting") + (who.title ? "\n" + who.title : "");
  const head = "Subject: " + sub.insured + " (" + sub.id + ")\n\nHello" + (sub.broker && !wsIsPlaceholder(sub.broker) ? " " + sub.broker : "") + ",\n\n";
  if (kind === "quote") {
    const ex = brief.appetite.failed.length ? "\nA few items need an approver before we can finalise terms: " + brief.appetite.failed.map(r => r.factor).join("; ") + ".\n" : "";
    return head + "Thank you for submitting " + sub.insured + (sub.lobName ? " (" + sub.lobName + ")" : "") + ". The risk is within our appetite and we are moving to pricing." + ex + "\nThe quote will list any subjectivities that must be met before binding. We will come back to you with the quote." + sign;
  }
  if (kind === "decline") {
    const why = brief.appetite.hard.length ? brief.appetite.hard.map(r => "- " + r.factor + ": submitted " + r.val + ", required " + (r.guardrail || r.baseValue)).join("\n") : "- (state the reason here)";
    return head + "Thank you for submitting " + sub.insured + ". After review we are unable to offer terms on this risk, because:\n" + why + "\n\nA formal notice follows if one is required." + sign;
  }
  const miss = brief.completeness && brief.completeness.missingRequired.length ? brief.completeness.missingRequired.map(i => "- " + i.label).join("\n") : "- (list what you need)";
  const triage = triageExpectedDocs(sub).filter(d => !d.present).map(d => "- " + d.label);
  const items = miss === "- (list what you need)" && triage.length ? triage.join("\n") : miss;
  return head + "Thank you for submitting " + sub.insured + ". To go further we still need:\n" + items + "\n\nPlease send these and we will continue straight away." + sign;
}

function dbStatusBadge(s) {
  const m = { ok: ["badge-success", "Passed"], warn: ["badge-warning", "Check"], fail: ["badge-danger", "Failed"], pending: ["badge-light", "Not checked"], info: ["badge-light", "Note"] }[s] || ["badge-light", s];
  return '<span class="badge ' + m[0] + '">' + m[1] + "</span>";
}

function renderDecisionBrief(sub) {
  const box = document.getElementById("decisionBriefContainer"), resp = document.getElementById("brokerResponseContainer");
  if (!box || !resp) return;
  if (!sub) { box.innerHTML = ""; resp.innerHTML = ""; return; }
  const b = buildDecisionBrief(sub), k = DB_KINDS[b.recommendation], ap = b.appetite;
  const tile = (title, big, small) => `<div><div class="ws-small text-muted">${title}</div><div style="font-size:24px; font-weight:700;">${big}</div><div class="ws-small text-muted">${small}</div></div>`;
  box.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-clipboard-text"></i> Decision Brief</h3><span class="badge ${k.badge}"><i class="ph ${k.icon}"></i> Suggested: ${k.label}</span></div>
    <div class="card-body">
      <p class="text-sm" style="margin:0 0 10px;"><strong>${wsEsc(sub.insured)}</strong> <span class="text-muted">${wsEsc(sub.id)} · ${wsEsc(sub.lobName || "")}</span><br>${wsEsc(b.reasons.join(" "))}</p>
      <div style="display:flex; gap:28px; flex-wrap:wrap; margin-bottom:12px;">
        ${tile("Appetite fit", ap.percent === null ? "—" : ap.percent + "%", ap.label)}
        ${tile("Completeness", b.completeness ? b.completeness.percent + "%" : "—", b.completeness ? (b.completeness.status === "complete" ? "complete" : b.completeness.missingRequired.length + " missing") : "")}
        ${tile("Risk score", ap.risk === null ? "—" : ap.risk, ap.band ? ap.band.label : "")}
        ${tile("Claims (3 yrs)", b.loss.noRows ? "—" : b.loss.claims, b.loss.noRows ? "no loss data" : anUsd(b.loss.incurred) + " incurred")}
      </div>
      <table class="data-table"><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>
        ${b.checks.map(c => `<tr><td>${wsEsc(c.label)}</td><td>${dbStatusBadge(c.status)}</td><td class="ws-small">${wsEsc(c.detail)}</td></tr>`).join("")}
      </tbody></table>
    </div>
  </div>`;
  sub.brokerDrafts = sub.brokerDrafts || {};
  const sent = (sub.brokerResponses || []).slice(-1)[0];
  resp.innerHTML = `<div class="card">
    <div class="card-header"><h3><i class="ph ph-envelope-simple"></i> Reply to the broker</h3><span class="ws-small text-muted">Nothing is sent from the prototype; recording a reply writes it to the case log.</span></div>
    <div class="card-body">
      ${sent ? `<div class="alert alert-info ws-small" style="margin-bottom:10px;"><i class="ph ph-check"></i> Last recorded: <strong>${wsEsc(DB_KINDS[sent.kind].label)}</strong> by ${wsEsc(sent.by)} on ${wsEsc(sent.at)}.</div>` : ""}
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:14px;">
        ${Object.keys(DB_KINDS).map(kind => {
          const text = sub.brokerDrafts[kind] !== undefined ? sub.brokerDrafts[kind] : brokerResponseDraft(sub, kind, b);
          const rec = kind === b.recommendation;
          return `<div style="border:1px solid ${rec ? "var(--primary,#2563eb)" : "var(--border-color,#e2e8f0)"}; border-radius:8px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><strong><i class="ph ${DB_KINDS[kind].icon}"></i> ${DB_KINDS[kind].label}</strong>${rec ? '<span class="badge badge-info">Suggested</span>' : ""}</div>
            <textarea id="brokerDraft_${kind}" class="form-control" rows="9" style="font-size:12px; width:100%;" oninput="brokerDraftEdited('${kind}', this.value)">${wsEsc(text)}</textarea>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
              <button class="btn btn-primary btn-sm" onclick="recordBrokerResponse('${kind}')"><i class="ph ph-paper-plane-tilt"></i> Record this reply</button>
              ${kind === "decline" ? `<button class="btn btn-outline btn-sm" onclick="openDeclineSubmissionModal('${sub.id}')"><i class="ph ph-prohibit"></i> Decline with notice</button>` : ""}
              ${kind === "info" ? `<button class="btn btn-outline btn-sm" onclick="brokerRequestMissing()"><i class="ph ph-envelope-open"></i> Register as RFI</button>` : ""}
            </div></div>`;
        }).join("")}
      </div>
    </div>
  </div>`;
}

function brokerDraftEdited(kind, value) {
  const sub = wsSub();
  if (!sub) return;
  sub.brokerDrafts = sub.brokerDrafts || {};
  sub.brokerDrafts[kind] = value;
}

function recordBrokerResponse(kind) {
  const sub = wsSub();
  if (!sub || !DB_KINDS[kind]) return;
  if (!hasPermission("workflow", "approve")) { denyPermission("workflow", "approve"); return; }
  const el = document.getElementById("brokerDraft_" + kind);
  const text = (el ? el.value : (sub.brokerDrafts || {})[kind] || "").trim();
  if (text.length < 20) { showToast("⛔ The reply is empty. Write it, or keep the draft, before recording.", "danger"); return; }
  if (!sub.brokerResponses) sub.brokerResponses = [];
  sub.brokerResponses.push({ kind: kind, text: text, by: wsActor(), at: wsNow() });
  wsLog(sub, "broker_response_" + kind, DB_KINDS[kind].label + ": reply to " + (sub.broker || "the broker") + " recorded (" + text.length + " characters).");
  wsPersist();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
  renderDecisionBrief(sub);
  showToast("✅ Reply recorded: " + DB_KINDS[kind].label + ". It is in the case log; send it from your own mail.", "success");
}

function brokerRequestMissing() {
  if (typeof completenessRequestMissing === "function") completenessRequestMissing();
  else if (typeof openRFIModal === "function") openRFIModal(activeSubmissionId);
}

(function briefWire() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.broker_response_quote = { label: "Broker told: we will quote", icon: "ph-check-circle", badge: "badge-success", outcome: "outcome-approve" };
    AUDIT_ACTION_META.broker_response_info = { label: "Broker asked for more information", icon: "ph-question", badge: "badge-warning", outcome: "outcome-comm" };
    AUDIT_ACTION_META.broker_response_decline = { label: "Broker told: we will not quote", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }
})();

registerStepRenderer("decisionBrief", renderDecisionBrief);
window.renderDecisionBrief = renderDecisionBrief;
window.recordBrokerResponse = recordBrokerResponse;
window.brokerDraftEdited = brokerDraftEdited;
window.brokerRequestMissing = brokerRequestMissing;
window.brokerResponseDraft = brokerResponseDraft;
