/**
 * ============================================================================
 * RISK SCORE MODULE (Add-On)
 * ----------------------------------------------------------------------------
 * Simple Caveman Flow:
 *   All Risk Data -> Auto Risk Score -> Underwriter Can Edit -> Authority
 *   Desk -> Check Authority vs Exposure -> Within Limit = Approve |
 *   Over Limit = High Exposure -> Refer to Senior -> Senior Approval
 *
 * - calculateRiskScore() reads everything already on the Workbench
 *   (coverages, loss runs, exposure, drivers, vehicles, appetite rule
 *   failures) and produces a 0-100 score with a visible breakdown.
 * - Rendered at the END of the Underwriting Workbench (screen-5), with an
 *   editable override the underwriter can change before moving on.
 * - The same score (auto or overridden) is carried over and shown read-only
 *   on the Authority Desk (screen-6), next to the existing authority-limit
 *   vs exposure check — nothing about that existing check is altered here,
 *   this only adds the Risk Score alongside it.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. CALCULATION — transparent, additive, 0-100 (higher = riskier)
// ----------------------------------------------------------------------------
function calculateRiskScore(sub) {
  const factors = [];
  let score = 20;
  factors.push({ label: "Base Risk", points: 20 });

  // Exposure — bigger exposure, bigger risk.
  const exposureVal = sub.exposureVal || 0;
  const exposurePts = Math.min(30, Math.round((exposureVal / 1000000) * 15));
  score += exposurePts;
  factors.push({ label: `Exposure ($${exposureVal.toLocaleString()})`, points: exposurePts });

  // Loss history — total incurred across sub.losses.
  const losses = sub.losses || [];
  const totalIncurred = losses.reduce((sum, l) => sum + (parseFloat(String(l.incurred || "0").replace(/[^0-9.]/g, "")) || 0), 0);
  const lossPts = Math.min(20, Math.round(totalIncurred / 1000));
  score += lossPts;
  factors.push({ label: `Loss History ($${totalIncurred.toLocaleString()} incurred, ${losses.filter(l => l.status !== "Clean").length} claim(s))`, points: lossPts });

  // Drivers — pending verification and/or young/inexperienced drivers add risk.
  const drivers = sub.drivers || [];
  const pendingDrivers = drivers.filter(d => String(d.status || "").toLowerCase().includes("pending")).length;
  const youngDrivers = drivers.filter(d => (d.age !== undefined && d.age < 25)).length;
  const driverPts = pendingDrivers * 5 + youngDrivers * 8;
  score += driverPts;
  factors.push({ label: `Drivers (${pendingDrivers} pending verification, ${youngDrivers} under 25)`, points: driverPts });

  // Appetite rule failures not yet overridden — each is a real open risk.
  const rules = sub.appetiteRules || [];
  const failedRules = rules.filter(r => !r.pass && !r.overridden).length;
  const rulePts = failedRules * 15;
  score += rulePts;
  factors.push({ label: `Appetite Rule Failures (${failedRules} open)`, points: rulePts });

  // Vehicle count — larger schedules carry marginally more risk surface.
  const vehicles = sub.vehicles || [];
  const vehiclePts = vehicles.length >= 3 ? 5 : 0;
  score += vehiclePts;
  factors.push({ label: `Vehicle Schedule (${vehicles.length} unit(s))`, points: vehiclePts });

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, factors };
}

function riskBand(score) {
  if (score <= 35) return { label: "Low Risk", cls: "badge-success", color: "#16a34a" };
  if (score <= 65) return { label: "Medium Risk", cls: "badge-warning", color: "#d97706" };
  return { label: "High Risk", cls: "badge-danger", color: "#dc2626" };
}

// ----------------------------------------------------------------------------
// 2. WORKBENCH CARD — auto-calculated, underwriter-editable
// ----------------------------------------------------------------------------
function renderRiskScoreCard(sub) {
  const box = document.getElementById("wbRiskScoreContainer");
  if (!box || !sub) return;

  const auto = calculateRiskScore(sub);
  // Preserve an existing manual override across re-renders; otherwise use
  // the freshly auto-calculated score.
  const currentScore = (typeof sub.riskScore === "number") ? sub.riskScore : auto.score;
  const isOverridden = !!sub.riskScoreOverridden;
  const band = riskBand(currentScore);

  box.innerHTML = `
    <div class="card risk-score-card">
      <div class="card-header">
        <h3><i class="ph ph-gauge"></i> Risk Score</h3>
        <span class="badge ${band.cls}" id="riskScoreBandBadge"><i class="ph ph-activity"></i> ${band.label}</span>
      </div>
      <div class="card-body">
        <div class="risk-score-layout">
          <div class="risk-score-number-box">
            <div class="risk-score-number" id="riskScoreBigNumber" style="color:${band.color};">${currentScore}</div>
            <div class="text-xs text-muted">out of 100</div>
            ${isOverridden ? `<span class="badge badge-light text-xs mt-1"><i class="ph ph-pencil-simple"></i> Manually Edited (Auto: ${auto.score})</span>` : `<span class="badge badge-light text-xs mt-1"><i class="ph ph-robot"></i> System Calculated</span>`}
          </div>
          <div class="risk-score-breakdown">
            <div class="text-xs text-muted mb-1"><i class="ph ph-list-checks"></i> Calculated from all Workbench data above:</div>
            ${auto.factors.map(f => `
              <div class="risk-factor-row">
                <span>${f.label}</span>
                <strong class="${f.points > 0 ? 'text-danger' : 'text-muted'}">${f.points > 0 ? '+' : ''}${f.points}</strong>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="risk-score-edit-row mt-3">
          <label class="form-label" style="margin:0;">Underwriter Override:</label>
          <input type="number" min="0" max="100" class="form-control form-control-sm" id="riskScoreOverrideInput" style="max-width:100px;" value="${currentScore}">
          <button class="btn btn-sm btn-outline" onclick="saveRiskScoreOverride('${sub.id}')"><i class="ph ph-floppy-disk"></i> Save Score</button>
          <button class="btn btn-sm btn-outline" onclick="resetRiskScoreToAuto('${sub.id}')"><i class="ph ph-arrow-counter-clockwise"></i> Reset to Auto (${auto.score})</button>
        </div>
      </div>
    </div>
  `;

  // Persist the auto-calculated baseline even if no override has been saved
  // yet, so the Authority Desk always has a score to show.
  if (typeof sub.riskScore !== "number") {
    sub.riskScore = auto.score;
    sub.riskScoreAutoCalculated = auto.score;
    sub.riskScoreOverridden = false;
  } else if (sub.riskScoreAutoCalculated === undefined) {
    sub.riskScoreAutoCalculated = auto.score;
  }
}

function saveRiskScoreOverride(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  const input = document.getElementById("riskScoreOverrideInput");
  if (!sub || !input) return;
  let val = parseInt(input.value, 10);
  if (isNaN(val)) { showToast("⚠️ Enter a valid number 0-100.", "warning"); return; }
  val = Math.max(0, Math.min(100, val));

  const auto = calculateRiskScore(sub);
  sub.riskScore = val;
  sub.riskScoreAutoCalculated = auto.score;
  sub.riskScoreOverridden = (val !== auto.score);

  renderRiskScoreCard(sub);
  if (typeof renderRiskScoreOnAuthorityDesk === "function") renderRiskScoreOnAuthorityDesk(sub);
  if (typeof persistAppState === "function") persistAppState();
  showToast(`✅ Risk Score saved: ${val}/100${sub.riskScoreOverridden ? " (manually overridden)" : ""}.`, "success");
}

function resetRiskScoreToAuto(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;
  const auto = calculateRiskScore(sub);
  sub.riskScore = auto.score;
  sub.riskScoreAutoCalculated = auto.score;
  sub.riskScoreOverridden = false;

  renderRiskScoreCard(sub);
  if (typeof renderRiskScoreOnAuthorityDesk === "function") renderRiskScoreOnAuthorityDesk(sub);
  if (typeof persistAppState === "function") persistAppState();
  showToast(`🔄 Risk Score reset to system-calculated value: ${auto.score}/100.`, "info");
}

window.calculateRiskScore = calculateRiskScore;
window.renderRiskScoreCard = renderRiskScoreCard;
window.saveRiskScoreOverride = saveRiskScoreOverride;
window.resetRiskScoreToAuto = resetRiskScoreToAuto;

// ----------------------------------------------------------------------------
// 3. AUTHORITY DESK DISPLAY — read-only, carried over from the Workbench
// ----------------------------------------------------------------------------
function renderRiskScoreOnAuthorityDesk(sub) {
  const box = document.getElementById("authRiskScoreContainer");
  if (!box || !sub) return;

  const score = (typeof sub.riskScore === "number") ? sub.riskScore : calculateRiskScore(sub).score;
  const band = riskBand(score);

  box.innerHTML = `
    <div class="auth-stat-row">
      <span class="lbl">Risk Score <span class="text-xs text-muted">(from Underwriting Workbench)</span>:</span>
      <strong class="val font-mono" style="color:${band.color};">
        ${score}/100 — ${band.label}
        ${sub.riskScoreOverridden ? '<span class="badge badge-light text-xs ml-1"><i class="ph ph-pencil-simple"></i> Edited</span>' : ''}
      </strong>
    </div>
  `;
}

window.renderRiskScoreOnAuthorityDesk = renderRiskScoreOnAuthorityDesk;
