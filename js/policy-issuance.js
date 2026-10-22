/**
 * ============================================================================
 * POLICY ISSUANCE & TERMS (Stage 6, working step 8)
 * ----------------------------------------------------------------------------
 * Read-only view of the policy once it is bound: the policy contract, its term, the new-business transaction, the
 * frozen policy version and the coverages. Everything is taken from the bound quote and the PAS sync result
 * (bndFacts), so it always agrees with the binder and the bordereaux. Before the bind it says so and shows nothing.
 * ============================================================================
 */

function piEsc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function piMoney(n) { const v = Number(n); return isNaN(v) ? "Not stated" : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function renderPolicyIssuance(sub) {
  const el = document.getElementById("policyIssuanceContainer");
  if (!el || !sub) return;
  const f = typeof bndFacts === "function" ? bndFacts(sub) : null;
  const bound = !!(sub.pasSync && sub.pasSync.status === "success" && sub.pasSync.policyNumber);
  if (!f || !bound) {
    el.innerHTML = `<div class="alert alert-warning"><i class="ph ph-lock"></i> <strong>No policy issued yet.</strong> Policy Issuance & Terms opens once the quote is bound and synced to the policy administration system (Stage 5).</div>`;
    return;
  }
  const row = (k, v) => `<tr><td class="text-muted" style="padding:6px 12px 6px 0;white-space:nowrap;">${k}</td><td style="padding:6px 0;"><strong>${piEsc(v)}</strong></td></tr>`;
  const card = (icon, title, rows) => `<div class="card"><div class="card-header"><h3><i class="ph ${icon} text-primary"></i> ${title}</h3></div><div class="card-body"><table>${rows.join("")}</table></div></div>`;
  const cov = f.coverages.length
    ? `<table class="data-table" style="width:100%;"><thead><tr><th>Coverage</th><th>Limit</th><th>Deductible</th></tr></thead><tbody>${f.coverages.map(c => `<tr><td>${piEsc(c.line)}</td><td>${piEsc(c.limit)}</td><td>${piEsc(c.ded)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="text-muted">No coverage schedule on file.</p>`;
  const pending = (f.pendingCoverages || []).length
    ? `<div class="alert alert-info text-xs"><i class="ph ph-hourglass"></i> Not yet in force (quote condition): ${f.pendingCoverages.map(c => piEsc(c.line)).join(", ")}.</div>` : "";
  el.innerHTML = `
    <div class="alert alert-success"><i class="ph ph-check-circle"></i> <strong>Policy ${piEsc(f.policyNumber)} issued</strong> on ${piEsc(sub.pasSync.syncedAt)} by ${piEsc(sub.pasSync.syncedBy)}.</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;">
      ${card("ph-file-text", "Policy Contract", [row("Policy number", f.policyNumber), row("Account", sub.id), row("Insured", f.insured), row("Carrier", f.carrier), row("Producer", f.producer)])}
      ${card("ph-calendar", "Policy Term", [row("Effective", f.effective || "Not stated"), row("Expiration", f.expiration || "Not stated"), row("Term", "12 months")])}
      ${card("ph-arrows-left-right", "Policy Transaction", [row("Transaction", "New business"), row("PAS record", sub.pasSync.pasRecordId), row("Written premium", f.premium ? piMoney(f.premium) : "Not stated")])}
      ${card("ph-git-branch", "Policy Version", [row("Version", "1 (bound)"), row("Rating basis", f.ratingBasis && f.ratingBasis.label ? f.ratingBasis.label : "As bound"), row("Frozen at", sub.pasSync.syncedAt)])}
    </div>
    <div class="card mt-3"><div class="card-header"><h3><i class="ph ph-shield-check text-primary"></i> Policy Coverages</h3></div><div class="card-body">${cov}${pending}</div></div>`;
}

(function installPolicyIssuanceHooks() {
  const origAll = window.renderAllDownstreamScreens;
  if (typeof origAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origAll.apply(this, arguments);
      try { renderPolicyIssuance(sub); } catch (e) { console.warn("Policy issuance failed:", e); }
      return r;
    };
  }
})();
window.renderPolicyIssuance = renderPolicyIssuance;
