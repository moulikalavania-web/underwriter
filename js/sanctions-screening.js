/**
 * ============================================================================
 * SANCTIONS & WATCHLIST SCREENING (Add-On) — gap G02
 * ----------------------------------------------------------------------------
 * Screens the named insured, producing broker, named drivers and any extra
 * parties the underwriter adds against a watchlist, at three points:
 *
 *   1. Clearance — runs automatically when the underwriter opens Step 2
 *      (FEIN & Appetite Clearance).
 *   2. On demand — "Run screening" and whenever a party is added.
 *   3. Bind — re-screened right before the e-signature / Issue Quote action.
 *
 * A potential match must be reviewed by a user with "approve" permission on
 * the Sanctions resource. Clearing it (false positive) needs a written reason;
 * confirming it leaves a permanent hold. Bind is blocked until every
 * potential match is resolved, and blocked for good on a confirmed match.
 *
 * IMPORTANT — DEMO LIST: SANCTIONS_DEMO_WATCHLIST below contains FICTIONAL
 * names so the workflow can be demonstrated. It is NOT the OFAC SDN list or
 * any government list. Production must replace screenForSanctions()'s data
 * source with a licensed screening provider or the official lists, and a
 * compliance owner must set the match threshold.
 *
 * Everything is stored on sub.sanctions and written to sub.decisionLog, so it
 * shows in the Audit Log and survives the existing localStorage persistence.
 * ============================================================================
 */

var SANCTIONS_MATCH_THRESHOLD = 0.8;                 // 0–1; compliance to set
var SANCTIONS_LIST_NAME = "DEMO WATCHLIST (fictional — not the OFAC SDN list)";
var SANCTIONS_LIST_VERSION = "demo-2026-10";

var SANCTIONS_DEMO_WATCHLIST = [
  { name: "Northwind Demo Sanctioned Holdings", aliases: ["Northwind DSH"], type: "entity", program: "DEMO-A" },
  { name: "Zarvan Trading Demo", aliases: ["Zarvan Demo Trading Co"], type: "entity", program: "DEMO-A" },
  { name: "Crimson Harbor Shipping Demo", aliases: [], type: "entity", program: "DEMO-B" },
  { name: "Ivan Demoff", aliases: ["Ivan Demov"], type: "individual", program: "DEMO-B" },
  { name: "Test Blocked Person", aliases: [], type: "individual", program: "DEMO-C" },
  { name: "Obsidian Freight Demo Group", aliases: ["Obsidian Freight Demo"], type: "entity", program: "DEMO-C" }
];

var SANCTIONS_PARTY_ROLES = ["Principal / Owner", "Additional Insured", "Subsidiary / Affiliate", "Other Named Party"];

// ----------------------------------------------------------------------------
// 1. MATCHING — pure functions (no DOM, no globals) so they can be tested
// ----------------------------------------------------------------------------
var SANCTIONS_NOISE_TOKENS = ["llc", "inc", "incorporated", "ltd", "limited", "corp", "corporation", "co", "company", "lp", "llp", "the", "and"];

function sanctionsTokens(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t && SANCTIONS_NOISE_TOKENS.indexOf(t) === -1);
}

function sanctionsNameKey(name) {
  return sanctionsTokens(name).sort().join(" ");
}

/** 1.0 for the same words in any order; otherwise the overlap of word sets, with
 *  a floor of 0.9 when every word of the shorter name appears in the longer
 *  (two or more words) — e.g. "Zarvan Trading Demo" inside "Zarvan Trading Demo Ltd Co". */
function sanctionsNameScore(a, b) {
  const ta = sanctionsTokens(a), tb = sanctionsTokens(b);
  if (!ta.length || !tb.length) return 0;
  const sa = new Set(ta), sb = new Set(tb);
  let inter = 0;
  sa.forEach(t => { if (sb.has(t)) inter++; });
  const union = sa.size + sb.size - inter;
  let score = union ? inter / union : 0;
  const shorter = sa.size <= sb.size ? sa : sb;
  const longer = sa.size <= sb.size ? sb : sa;
  if (shorter.size >= 2) {
    let contained = true;
    shorter.forEach(t => { if (!longer.has(t)) contained = false; });
    if (contained) score = Math.max(score, 0.9);
  }
  return Math.round(score * 100) / 100;
}

function screenForSanctions(name) {
  const matches = [];
  SANCTIONS_DEMO_WATCHLIST.forEach(entry => {
    let best = sanctionsNameScore(name, entry.name);
    (entry.aliases || []).forEach(al => { best = Math.max(best, sanctionsNameScore(name, al)); });
    if (best >= SANCTIONS_MATCH_THRESHOLD) {
      matches.push({ entryName: entry.name, type: entry.type, program: entry.program, score: best });
    }
  });
  matches.sort((x, y) => y.score - x.score);
  return matches;
}

// ----------------------------------------------------------------------------
// 2. STATE — everything lives on sub.sanctions
// ----------------------------------------------------------------------------
function sanctionsStore(sub) {
  if (!sub.sanctions) sub.sanctions = { screens: [], reviews: [], extraParties: [] };
  if (!sub.sanctions.screens) sub.sanctions.screens = [];
  if (!sub.sanctions.reviews) sub.sanctions.reviews = [];
  if (!sub.sanctions.extraParties) sub.sanctions.extraParties = [];
  return sub.sanctions;
}

function sanctionsNow() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function sanctionsActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}

function sanctionsActiveSub() {
  return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null;
}

function sanctionsEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sanctionsGatherParties(sub) {
  const out = [];
  const seen = new Set();
  const add = (name, role) => {
    const n = String(name || "").trim();
    if (!n) return;
    const k = sanctionsNameKey(n) + "|" + role;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ name: n, role });
  };
  add(sub.insured, "Named Insured");
  add(sub.broker, "Producing Broker");
  (sub.drivers || []).forEach(d => {
    const full = (d.given_name || d.last_name) ? `${d.given_name || ""} ${d.last_name || ""}`.trim() : d.name;
    add(full, "Driver");
  });
  sanctionsStore(sub).extraParties.forEach(p => add(p.name, p.role));
  return out;
}

function sanctionsLog(sub, decision, notes, byOverride) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: sub.currentStep || 2,
    decision,
    by: byOverride || sanctionsActor(),
    at: sanctionsNow(),
    notes
  });
}

/** Runs a screening over the current party list and records it. */
function runSanctionsScreening(sub, trigger) {
  const store = sanctionsStore(sub);
  const parties = sanctionsGatherParties(sub).map(p => {
    const matches = screenForSanctions(p.name);
    return { name: p.name, role: p.role, result: matches.length ? "potential_match" : "clear", matches };
  });
  const screen = {
    id: "SCR-" + (store.screens.length + 1),
    at: sanctionsNow(),
    trigger,
    by: sanctionsActor(),
    listName: SANCTIONS_LIST_NAME,
    listVersion: SANCTIONS_LIST_VERSION,
    threshold: SANCTIONS_MATCH_THRESHOLD,
    parties
  };
  store.screens.push(screen);

  const hits = parties.filter(p => p.result === "potential_match");
  const triggerLabel = { clearance: "at clearance", bind: "at bind", manual: "on demand", party_added: "after a party was added" }[trigger] || trigger;
  if (hits.length) {
    sanctionsLog(sub, "sanctions_potential_match",
      `Sanctions screening ${triggerLabel}: ${hits.length} potential match(es) in ${parties.length} parties screened — ` +
      hits.map(h => `${h.name} ~ ${h.matches[0].entryName} (${Math.round(h.matches[0].score * 100)}%)`).join("; ") +
      `. Review required before bind. List: ${SANCTIONS_LIST_VERSION}.`);
  } else {
    sanctionsLog(sub, "sanctions_screened",
      `Sanctions screening ${triggerLabel}: ${parties.length} parties screened, no matches. List: ${SANCTIONS_LIST_VERSION}.`);
  }
  persistSanctions();
  return screen;
}

/** Derives the current state from the latest screen and the review history. */
function getSanctionsStatus(sub) {
  const store = sanctionsStore(sub);
  const latest = store.screens[store.screens.length - 1];
  if (!latest) return { state: "not_screened", latest: null, items: [] };

  const items = [];
  latest.parties.forEach(p => {
    p.matches.forEach(m => {
      const key = sanctionsNameKey(p.name) + "|" + sanctionsNameKey(m.entryName);
      let review = null;
      store.reviews.forEach(r => { if (r.key === key) review = r; });   // last one wins
      items.push({ partyName: p.name, role: p.role, entryName: m.entryName, program: m.program, type: m.type, score: m.score, key, review });
    });
  });
  const confirmed = items.filter(i => i.review && i.review.decision === "confirmed");
  const unresolved = items.filter(i => !i.review);
  let state = "clear";
  if (confirmed.length) state = "blocked";
  else if (unresolved.length) state = "review_required";
  else if (items.length) state = "cleared_reviewed";
  return { state, latest, items, confirmed, unresolved };
}

function sanctionsAllowsBind(status) {
  return status.state === "clear" || status.state === "cleared_reviewed";
}

function persistSanctions() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}

// ----------------------------------------------------------------------------
// 3. ACTIONS
// ----------------------------------------------------------------------------
function sanctionsRunClicked() {
  const sub = sanctionsActiveSub();
  if (!sub) return;
  if (!hasPermission("sanctions", "edit")) { denyPermission("sanctions", "edit"); return; }
  runSanctionsScreening(sub, "manual");
  renderSanctionsCard(sub);
  showToast("Sanctions screening completed.", "info");
}

function sanctionsAddParty() {
  const sub = sanctionsActiveSub();
  if (!sub) return;
  if (!hasPermission("sanctions", "edit")) { denyPermission("sanctions", "edit"); return; }
  const nameEl = document.getElementById("sanctionsNewPartyName");
  const roleEl = document.getElementById("sanctionsNewPartyRole");
  const name = nameEl ? nameEl.value.trim() : "";
  if (name.length < 2) { showToast("Enter the party's full legal name.", "danger"); return; }
  sanctionsStore(sub).extraParties.push({ name, role: roleEl ? roleEl.value : "Other Named Party", addedBy: sanctionsActor(), addedAt: sanctionsNow() });
  runSanctionsScreening(sub, "party_added");
  renderSanctionsCard(sub);
  showToast(`Added "${name}" and re-ran screening.`, "info");
}

/** decision: "false_positive" | "confirmed" */
function sanctionsReviewMatch(itemIdx, decision) {
  const sub = sanctionsActiveSub();
  if (!sub) return;
  if (!hasPermission("sanctions", "approve")) { denyPermission("sanctions", "approve"); return; }
  const status = getSanctionsStatus(sub);
  const item = status.items[itemIdx];
  if (!item || item.review) return;
  const reasonEl = document.getElementById("sanctionsReason_" + itemIdx);
  const reason = reasonEl ? reasonEl.value.trim() : "";
  if (reason.length < 10) {
    showToast("A written reason (at least 10 characters) is required to resolve a potential match.", "danger");
    if (reasonEl) reasonEl.focus();
    return;
  }
  const store = sanctionsStore(sub);
  store.reviews.push({
    key: item.key, partyName: item.partyName, entryName: item.entryName,
    decision, by: sanctionsActor(), at: sanctionsNow(), reason, screenId: status.latest.id
  });
  if (decision === "false_positive") {
    sanctionsLog(sub, "sanctions_cleared",
      `Potential match cleared as a false positive: "${item.partyName}" vs "${item.entryName}" (${Math.round(item.score * 100)}%). Reason: ${reason}`);
    showToast("Match cleared as a false positive and logged.", "success");
  } else {
    sanctionsLog(sub, "sanctions_confirmed_match",
      `CONFIRMED sanctions match: "${item.partyName}" vs "${item.entryName}" (${Math.round(item.score * 100)}%). Reason: ${reason}. Do not proceed; escalate to Compliance for blocking / reporting decisions.`);
    showToast("Match confirmed. Bind is blocked. Escalate to Compliance.", "danger");
  }
  persistSanctions();
  renderSanctionsCard(sub);
}

// ----------------------------------------------------------------------------
// 4. RENDERING — Step 2 card and the banner on Quote & Bind
// ----------------------------------------------------------------------------
var SANCTIONS_STATE_UI = {
  not_screened:     { badge: "badge-light",   icon: "ph-hourglass",        label: "Not Screened" },
  clear:            { badge: "badge-success", icon: "ph-check-circle",     label: "Clear" },
  cleared_reviewed: { badge: "badge-success", icon: "ph-check-circle",     label: "Cleared After Review" },
  review_required:  { badge: "badge-warning", icon: "ph-warning",          label: "Review Required" },
  blocked:          { badge: "badge-danger",  icon: "ph-prohibit",         label: "Confirmed Match — Blocked" }
};

function renderSanctionsCard(sub) {
  const box = document.getElementById("sanctionsScreeningContainer");
  if (!box || !sub) return;
  const status = getSanctionsStatus(sub);
  const ui = SANCTIONS_STATE_UI[status.state];
  const canEdit = hasPermission("sanctions", "edit");
  const canApprove = hasPermission("sanctions", "approve");
  const store = sanctionsStore(sub);

  let banner = "";
  if (status.state === "not_screened") {
    banner = `<div class="alert alert-warning text-xs"><i class="ph ph-hourglass"></i> This submission has not been screened yet. Screening also runs automatically again at bind.</div>`;
  } else if (status.state === "review_required") {
    banner = `<div class="alert alert-warning text-xs"><i class="ph ph-warning"></i> <strong>${status.unresolved.length} potential match(es) need review.</strong> Quote cannot be signed or bound until each is resolved by a user with sanctions approval authority.</div>`;
  } else if (status.state === "blocked") {
    banner = `<div class="alert alert-danger text-xs"><i class="ph ph-prohibit"></i> <strong>Confirmed sanctions match.</strong> Bind is blocked. Do not proceed — escalate to Compliance for blocking and reporting decisions.</div>`;
  } else {
    banner = `<div class="alert alert-success text-xs"><i class="ph ph-check-circle"></i> No unresolved matches. Screening is repeated at bind.</div>`;
  }

  // Party results
  const partyRows = status.latest ? status.latest.parties.map(p => {
    const resultBadge = p.result === "clear"
      ? `<span class="badge badge-success text-xs">Clear</span>`
      : `<span class="badge badge-warning text-xs">Potential Match</span>`;
    return `<tr><td>${sanctionsEsc(p.name)}</td><td>${sanctionsEsc(p.role)}</td><td>${resultBadge}</td></tr>`;
  }).join("") : `<tr><td colspan="3" class="text-muted" style="text-align:center;">No screening has been run.</td></tr>`;

  // Match review rows
  const matchRows = status.items.map((it, idx) => {
    const pct = Math.round(it.score * 100);
    let action;
    if (it.review) {
      const isConf = it.review.decision === "confirmed";
      action = `<span class="badge ${isConf ? "badge-danger" : "badge-success"} text-xs">${isConf ? "Confirmed match" : "Cleared — false positive"}</span>
        <div class="text-xs text-muted" style="margin-top:4px;">${sanctionsEsc(it.review.by)} · ${sanctionsEsc(it.review.at)}<br>${sanctionsEsc(it.review.reason)}</div>`;
    } else if (canApprove) {
      action = `<textarea id="sanctionsReason_${idx}" class="form-control" rows="3" placeholder="Reason (min. 10 characters): how was this resolved?" style="margin-bottom:6px; min-width:260px; width:100%;"></textarea>
        <button class="btn btn-sm btn-success" style="width:auto;" onclick="sanctionsReviewMatch(${idx}, 'false_positive')"><i class="ph ph-check"></i> Clear — false positive</button>
        <button class="btn btn-sm btn-outline-danger" style="width:auto;" onclick="sanctionsReviewMatch(${idx}, 'confirmed')"><i class="ph ph-prohibit"></i> Confirm match</button>`;
    } else {
      action = `<span class="text-xs text-muted"><i class="ph ph-lock"></i> Needs a user with sanctions approval authority (for example the Chief Underwriting Officer).</span>`;
    }
    return `<tr>
      <td><strong>${sanctionsEsc(it.partyName)}</strong><div class="text-xs text-muted">${sanctionsEsc(it.role)}</div></td>
      <td>${sanctionsEsc(it.entryName)}<div class="text-xs text-muted">${sanctionsEsc(it.type)} · ${sanctionsEsc(it.program)}</div></td>
      <td class="font-mono">${pct}%</td>
      <td>${action}</td>
    </tr>`;
  }).join("");

  const history = store.screens.slice(-5).reverse().map(s => {
    const hits = s.parties.filter(p => p.result === "potential_match").length;
    return `<tr><td>${sanctionsEsc(s.id)}</td><td>${sanctionsEsc(s.at)}</td><td>${sanctionsEsc(s.trigger)}</td><td>${s.parties.length}</td><td>${hits}</td><td>${sanctionsEsc(s.by)}</td></tr>`;
  }).join("");

  const addForm = canEdit ? `
    <div class="simulation-tool-box" style="display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; gap:8px; margin-top:14px;">
      <span class="tool-label"><i class="ph ph-user-plus"></i> Add a named party</span>
      <input id="sanctionsNewPartyName" class="form-control" style="width:240px; flex:0 0 auto;" placeholder="Full legal name">
      <select id="sanctionsNewPartyRole" class="form-control" style="width:190px; flex:0 0 auto;">
        ${SANCTIONS_PARTY_ROLES.map(r => `<option>${sanctionsEsc(r)}</option>`).join("")}
      </select>
      <button class="btn btn-sm btn-primary" style="width:auto; flex:0 0 auto;" onclick="sanctionsAddParty()"><i class="ph ph-plus"></i> Add &amp; screen</button>
      <button class="btn btn-sm btn-outline" style="width:auto; flex:0 0 auto;" onclick="sanctionsRunClicked()"><i class="ph ph-arrows-clockwise"></i> Run screening</button>
    </div>` : `<div class="text-xs text-muted"><i class="ph ph-lock"></i> Your role can view screening results but not run or add parties.</div>`;

  box.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3><i class="ph ph-shield-warning"></i> Sanctions &amp; Watchlist Screening</h3>
        <span class="badge ${ui.badge}"><i class="ph ${ui.icon}"></i> ${ui.label}</span>
      </div>
      <div class="card-body">
        ${banner}
        <div class="rules-table-container">
          <table class="data-table">
            <thead><tr><th>Party screened</th><th>Role</th><th>Result</th></tr></thead>
            <tbody>${partyRows}</tbody>
          </table>
        </div>
        ${status.items.length ? `
        <h4 style="margin:14px 0 6px;">Potential matches</h4>
        <div class="rules-table-container">
          <table class="data-table">
            <thead><tr><th>Party</th><th>Watchlist entry</th><th>Score</th><th>Resolution</th></tr></thead>
            <tbody>${matchRows}</tbody>
          </table>
        </div>` : ""}
        ${addForm}
        ${history ? `
        <h4 style="margin:14px 0 6px;">Screening history</h4>
        <div class="rules-table-container">
          <table class="data-table">
            <thead><tr><th>ID</th><th>When</th><th>Trigger</th><th>Parties</th><th>Matches</th><th>Run by</th></tr></thead>
            <tbody>${history}</tbody>
          </table>
        </div>` : ""}
        <p class="text-xs text-muted" style="margin-top:10px;">
          <i class="ph ph-info"></i> List used: ${sanctionsEsc(SANCTIONS_LIST_NAME)}, version ${sanctionsEsc(SANCTIONS_LIST_VERSION)}, match threshold ${Math.round(SANCTIONS_MATCH_THRESHOLD * 100)}%.
          This is a demonstration list. A production deployment must screen against the official lists or a licensed provider.
        </p>
      </div>
    </div>`;
}

/** Banner for the Quote & Bind screen, next to the Issue Quote button. */
function renderSanctionsBindBanner(sub) {
  if (!sub) return "";
  const status = getSanctionsStatus(sub);
  if (sanctionsAllowsBind(status) || status.state === "not_screened") {
    const note = status.state === "not_screened"
      ? "Sanctions screening has not been run yet; it will run automatically when you sign and bind."
      : "Sanctions screening: no unresolved matches. It will run again at bind.";
    return `<div class="alert alert-success text-xs" style="margin-bottom:12px;"><i class="ph ph-shield-check"></i> ${note}</div>`;
  }
  const msg = status.state === "blocked"
    ? "Confirmed sanctions match — bind is blocked. Escalate to Compliance."
    : `${status.unresolved.length} sanctions potential match(es) must be resolved before this quote can be signed and bound. Open Step 2 — Clearance.`;
  return `<div class="alert alert-danger text-xs" style="margin-bottom:12px;"><i class="ph ph-prohibit"></i> <strong>Bind blocked.</strong> ${msg}</div>`;
}

// ----------------------------------------------------------------------------
// 5. HOOKS — clearance step, bind actions, audit-log labels
// ----------------------------------------------------------------------------
/** Re-screen right before bind (re-using a bind-time screen from the last two
 *  minutes whose party list has not changed), then allow or block. */
function sanctionsGuardBind(source, subId) {
  const sub = subId ? (SUBMISSIONS_DATASET.find(s => s.id === subId) || null) : sanctionsActiveSub();
  if (!sub) return true;
  const store = sanctionsStore(sub);
  const last = store.screens[store.screens.length - 1];
  const partyKey = sanctionsGatherParties(sub).map(p => sanctionsNameKey(p.name) + "|" + p.role).sort().join(";");
  const lastKey = last ? last.parties.map(p => sanctionsNameKey(p.name) + "|" + p.role).sort().join(";") : null;
  const fresh = last && last.trigger === "bind" && lastKey === partyKey &&
    (Date.now() - (sub._sanctionsBindScreenAt || 0)) < 120000;
  if (!fresh) {
    runSanctionsScreening(sub, "bind");
    sub._sanctionsBindScreenAt = Date.now();
  }
  const status = getSanctionsStatus(sub);
  if (sanctionsAllowsBind(status)) return true;

  sanctionsLog(sub, "sanctions_bind_blocked",
    `Bind attempt blocked (${source}): sanctions status "${SANCTIONS_STATE_UI[status.state].label}". ` +
    (status.state === "blocked" ? "Confirmed match on file." : `${status.unresolved.length} unresolved potential match(es).`));
  persistSanctions();
  showToast(status.state === "blocked"
    ? "⛔ Bind blocked: confirmed sanctions match. Escalate to Compliance."
    : `⛔ Bind blocked: ${status.unresolved.length} sanctions potential match(es) need review in Step 2 — Clearance.`, "danger");
  if (typeof renderSanctionsCard === "function") renderSanctionsCard(sub);
  return false;
}

(function installSanctionsHooks() {
  // Audit-log labels for the new decision types
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.sanctions_screened = { label: "Sanctions Screening — Clear", icon: "ph-shield-check", badge: "badge-success", outcome: "outcome-approve" };
    AUDIT_ACTION_META.sanctions_potential_match = { label: "Sanctions — Potential Match", icon: "ph-shield-warning", badge: "badge-warning", outcome: "outcome-refer" };
    AUDIT_ACTION_META.sanctions_cleared = { label: "Sanctions Match Cleared (False Positive)", icon: "ph-shield-check", badge: "badge-info", outcome: "outcome-approve" };
    AUDIT_ACTION_META.sanctions_confirmed_match = { label: "Sanctions Match Confirmed", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
    AUDIT_ACTION_META.sanctions_bind_blocked = { label: "Bind Blocked — Sanctions", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }

  // Step 2 (Clearance): screen automatically on first open, then draw the card
  const origShowWorkflowPage = window.showWorkflowPage;
  if (typeof origShowWorkflowPage === "function") {
    window.showWorkflowPage = function (stepNum) {
      const result = origShowWorkflowPage.apply(this, arguments);
      if (stepNum === 2) {
        const sub = sanctionsActiveSub();
        if (sub) {
          if (!sanctionsStore(sub).screens.length) runSanctionsScreening(sub, "clearance");
          renderSanctionsCard(sub);
        }
      }
      return result;
    };
  }

  // Keep the card current whenever downstream screens re-render
  const origRenderAll = window.renderAllDownstreamScreens;
  if (typeof origRenderAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const result = origRenderAll.apply(this, arguments);
      try { renderSanctionsCard(sub); } catch (e) { console.warn("Sanctions card render failed:", e); }
      return result;
    };
  }

  // Bind gates: opening e-signature, and the Issue Quote action itself
  const origOpenESig = window.openESignatureModal;
  if (typeof origOpenESig === "function") {
    window.openESignatureModal = function () {
      if (!sanctionsGuardBind("e-signature")) return;
      return origOpenESig.apply(this, arguments);
    };
  }
  const origIssue = window.issueQuoteAction;
  if (typeof origIssue === "function") {
    window.issueQuoteAction = function () {
      if (!sanctionsGuardBind("issue quote")) return;
      return origIssue.apply(this, arguments);
    };
  }
  // The actual bind is "Bind & Sync to PAS", a separate step after the customer approves the quote.
  const origPasBind = window.simulatePASBindSync;
  if (typeof origPasBind === "function") {
    window.simulatePASBindSync = function (subId) {
      if (!sanctionsGuardBind("PAS bind", subId)) return;
      return origPasBind.apply(this, arguments);
    };
  }
})();

window.sanctionsRunClicked = sanctionsRunClicked;
window.sanctionsAddParty = sanctionsAddParty;
window.sanctionsReviewMatch = sanctionsReviewMatch;
window.renderSanctionsCard = renderSanctionsCard;
window.renderSanctionsBindBanner = renderSanctionsBindBanner;
window.getSanctionsStatus = getSanctionsStatus;
window.runSanctionsScreening = runSanctionsScreening;
