/**
 * ============================================================================
 * PRODUCER LICENCE & CARRIER APPOINTMENT CHECK (Add-On) — gap G03
 * ----------------------------------------------------------------------------
 * In the US a producer (the broker or agency placing the risk) must hold an
 * active licence in the risk state with the right line of authority, and be
 * appointed by the carrier in that state, before the carrier may accept
 * business from them. This module checks all of that for a broker-sourced
 * submission:
 *
 *   1. Producer record found (National Producer Number — NPN)
 *   2. Active, unexpired licence in the state where the risk is located
 *   3. Line of authority covers Property & Casualty
 *   4. Active carrier appointment for that state and line of business
 *
 * It runs automatically when the underwriter opens Step 2 (Clearance) and
 * again right before bind. Bind is blocked unless the producer is verified.
 * If the registry is wrong or out of date, a user with "approve" permission on
 * the Producer Licensing resource can record a manual verification with its
 * source and reference; that record is audited and is the only override.
 * Direct (no-intermediary) submissions are marked not applicable.
 *
 * IMPORTANT — NO REGISTRY IS SHIPPED: PRODUCER_REGISTRY is empty. Production must
 * fill it from, or replace lookupProducerRecord() with, a licensing-data provider
 * (for example NIPR's PDB / carrier appointment feeds) and treat that as the system
 * of record. Until then every producer reads "Record Not Found" and an approver
 * records a verified lookup (NPN, licence, appointment, source and reference).
 * ============================================================================
 */

var PRODUCER_DEFAULT_CARRIER = "Vikram & Sons";   // used when a submission names no carrier
var PRODUCER_REQUIRED_AUTHORITY = "Property & Casualty";

/**
 * The licensing registry. The application ships none (a real deployment connects NIPR or a state licensing feed).
 * Each record: { names: [], npn, licenses: [{ state, number, lines: [], status, expires }],
 *                appointments: [{ carrier, state, lobs: [], status, effective }] }.
 * With no record, the producer check reports "Record Not Found" and an approver records a verified lookup.
 */
var PRODUCER_REGISTRY = [];

var PRODUCER_VERIFICATION_SOURCES = ["NIPR / state DOI licence lookup", "Carrier appointment confirmation", "Signed producer agreement and licence copy", "Other (explain in notes)"];

var US_STATE_CODES_FOR_PRODUCER = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

// ----------------------------------------------------------------------------
// 1. PURE LOGIC (no DOM, no globals besides the registry)
// ----------------------------------------------------------------------------
var PRODUCER_NOISE = ["llc", "inc", "ltd", "corp", "co", "company", "the", "and"];

function producerNameKey(name) {
  return String(name || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(t => t && PRODUCER_NOISE.indexOf(t) === -1).join(" ");
}

function lookupProducerRecord(brokerName) {
  const key = producerNameKey(brokerName);
  if (!key) return null;
  for (let i = 0; i < PRODUCER_REGISTRY.length; i++) {
    const rec = PRODUCER_REGISTRY[i];
    for (let j = 0; j < rec.names.length; j++) {
      const k = producerNameKey(rec.names[j]);
      if (k === key || (k.length >= 5 && key.length >= 5 && (k.indexOf(key) === 0 || key.indexOf(k) === 0))) return rec;
    }
  }
  return null;
}

var PRODUCER_STATE_NAMES = { "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR", "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE", "DISTRICT OF COLUMBIA": "DC", "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS", "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD", "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS", "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK", "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT", "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY" };

/** The state in a piece of address-like text: "..., Dallas, TX 75202", "Dallas, TX", "Dallas, Texas" or a bare "TX" or "Texas" as the whole value. Null when there is none. */
function stateFromAddressText(text) {
  const valid = c => (c && US_STATE_CODES_FOR_PRODUCER.indexOf(String(c).toUpperCase()) > -1) ? String(c).toUpperCase() : null;
  const s = String(text || "").trim().replace(/[.;]+$/, "");
  if (!s) return null;
  let m = s.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (m && valid(m[1])) return valid(m[1]);
  if (/^[A-Z]{2}$/.test(s)) return valid(s);
  m = s.match(/,\s*([A-Z]{2})\s*$/);
  if (m && valid(m[1])) return valid(m[1]);
  const up = s.toUpperCase();
  const names = Object.keys(PRODUCER_STATE_NAMES).sort((a, b) => b.length - a.length);
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (up === n || new RegExp("(?:,|\\s)\\s*" + n + "(?:\\s+\\d{5}(?:-\\d{4})?)?\\s*$").test(up)) return PRODUCER_STATE_NAMES[n];
  }
  return null;
}

/**
 * The state of the customer's own business, read from the email it came in. Only places that say where the business is are read: an Address
 * line, "based in / located in / headquartered in City, ST", or a State line for the insured. "States operated" is where it drives, not where it is.
 */
function stateFromEmailText(raw) {
  const t = String(raw || "");
  if (!t) return null;
  const lines = t.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:(?:insured|business|mailing|principal|physical|garaging|risk|home)\s+)?address\s*:\s*(.+)$/i);
    if (m) { const st = stateFromAddressText(m[1]); if (st) return st; }
  }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:insured|business|mailing|principal|physical|garaging|risk|home)?\s*state\s*(?:of\s+(?:domicile|operations\s+base))?\s*:\s*(.+)$/i);
    if (m && !/operat|licen[cs]e|filing/i.test(lines[i].split(":")[0])) { const st = stateFromAddressText(m[1]); if (st) return st; }
  }
  const b = t.match(/(?:based\s+(?:out\s+of|in)|located\s+(?:in|at)|headquartered\s+in)\s+([A-Za-z .'-]+,\s*[A-Za-z]{2,}(?:\s+\d{5})?)/);
  return b ? stateFromAddressText(b[1]) : null;
}

/** State where the risk is located: a valid 2-letter garaging state, else the canonical JSON, else the address, else what the email says about where the business is. */
function deriveRiskState(sub) {
  const valid = c => (c && US_STATE_CODES_FOR_PRODUCER.indexOf(String(c).toUpperCase()) > -1) ? String(c).toUpperCase() : null;
  const stated = valid(sub.riskStateSet && sub.riskStateSet.state);   // a person set it on the producer card
  if (stated) return stated;
  const fromInsured = valid(sub.insuredInfo && sub.insuredInfo.insured_garaging_state);
  if (fromInsured) return fromInsured;
  const fromCanon = valid(sub.canonicalJson && sub.canonicalJson.applicant && sub.canonicalJson.applicant.garaged_state);
  if (fromCanon) return fromCanon;
  const fromAddress = stateFromAddressText(sub.address);
  if (fromAddress) return fromAddress;
  return stateFromEmailText(sub.rawEmailText);
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function producerLobLabel(key) {
  const lob = (typeof LOB_CATALOG !== "undefined" ? LOB_CATALOG : []).find(l => l.key === key);
  return lob ? lob.name : key;
}

/**
 * Evaluates the four checks. `manual` (optional) is a recorded manual
 * verification that stands in for the registry record.
 * Returns { status, checks[], npn, producerName, riskState, carrier, source }.
 * status: verified | failed | not_found | cannot_determine | not_applicable
 */
function evaluateProducerCompliance(sub, asOf, manual) {
  const today = isoDate(asOf || new Date());
  const result = { status: "not_applicable", checks: [], npn: null, producerName: sub.broker || "", riskState: null, carrier: null, source: "registry" };
  if (sub.channelType === "direct" || !sub.broker) {
    result.checks.push({ id: "applicable", label: "Producer involved", pass: null, detail: "Direct submission with no intermediary — producer licensing does not apply." });
    return result;
  }

  const state = deriveRiskState(sub);
  const carrier = sub.carrier || PRODUCER_DEFAULT_CARRIER;
  result.riskState = state;
  result.carrier = carrier;

  let rec = lookupProducerRecord(sub.broker);
  if (manual) {
    result.source = "manual";
    rec = {
      npn: manual.npn,
      licenses: [{ state: state || manual.state, number: manual.licenseNumber, lines: [PRODUCER_REQUIRED_AUTHORITY].concat(manual.surplusLines ? ["Surplus Lines"] : []), status: "Active", expires: manual.licenseExpires }],
      appointments: [{ carrier, state: state || manual.state, lobs: [sub.lobKey], status: "Active", effective: manual.appointmentEffective }]
    };
  }

  if (!rec) {
    result.status = "not_found";
    result.checks.push({ id: "record", label: "Producer record (NPN)", pass: false, detail: `No licensing record found for "${sub.broker}". Verify with NIPR or the state, then record the verification.` });
    return result;
  }
  result.npn = rec.npn;
  result.checks.push({ id: "record", label: "Producer record (NPN)", pass: true, detail: `NPN ${rec.npn}${manual ? " (manually verified)" : ""}.` });

  if (!state) {
    result.status = "cannot_determine";
    result.checks.push({ id: "state", label: "Risk state", pass: false, detail: "The state of the customer's business could not be found on the case (garaging state, address) or in the email (an Address line, \"based in City, ST\", a State line). Set the state on this card, or add the address to the case." });
    return result;
  }

  // Licence in the risk state
  const lic = (rec.licenses || []).filter(l => l.state === state)[0];
  if (!lic) {
    result.checks.push({ id: "license", label: `Licence in ${state}`, pass: false, detail: `No licence on record for ${state}. Licensed states: ${(rec.licenses || []).map(l => l.state).join(", ") || "none"}.` });
  } else if (String(lic.status).toLowerCase() !== "active") {
    result.checks.push({ id: "license", label: `Licence in ${state}`, pass: false, detail: `Licence ${lic.number} status is ${lic.status}.` });
  } else if (lic.expires < today) {
    result.checks.push({ id: "license", label: `Licence in ${state}`, pass: false, detail: `Licence ${lic.number} expired on ${lic.expires}.` });
  } else {
    result.checks.push({ id: "license", label: `Licence in ${state}`, pass: true, detail: `Licence ${lic.number} active until ${lic.expires}.` });
  }

  // Line of authority
  if (!lic) {
    result.checks.push({ id: "authority", label: "Line of authority", pass: false, detail: "Cannot be assessed without a licence in the risk state." });
  } else {
    const ok = (lic.lines || []).indexOf(PRODUCER_REQUIRED_AUTHORITY) > -1;
    result.checks.push({ id: "authority", label: "Line of authority", pass: ok, detail: ok ? `${PRODUCER_REQUIRED_AUTHORITY} authority held.` : `Licence does not carry ${PRODUCER_REQUIRED_AUTHORITY} authority.` });
  }

  // Carrier appointment for this state and line of business
  const appts = (rec.appointments || []).filter(a => a.carrier === carrier && a.state === state);
  const appt = appts.filter(a => (a.lobs || []).indexOf(sub.lobKey) > -1)[0];
  if (!appts.length) {
    result.checks.push({ id: "appointment", label: `Appointment with ${carrier}`, pass: false, detail: `No appointment with ${carrier} in ${state} on record.` });
  } else if (!appt) {
    result.checks.push({ id: "appointment", label: `Appointment with ${carrier}`, pass: false, detail: `Appointed in ${state} for ${appts.map(a => a.lobs.map(producerLobLabel).join(", ")).join("; ")}, but not for ${sub.lobName || producerLobLabel(sub.lobKey)}.` });
  } else if (String(appt.status).toLowerCase() !== "active") {
    result.checks.push({ id: "appointment", label: `Appointment with ${carrier}`, pass: false, detail: `Appointment status is ${appt.status}.` });
  } else if (appt.effective > today) {
    result.checks.push({ id: "appointment", label: `Appointment with ${carrier}`, pass: false, detail: `Appointment is not effective until ${appt.effective}.` });
  } else {
    result.checks.push({ id: "appointment", label: `Appointment with ${carrier}`, pass: true, detail: `Active in ${state} for ${sub.lobName || sub.lobKey} since ${appt.effective}.` });
  }

  result.status = result.checks.every(c => c.pass) ? "verified" : "failed";
  return result;
}

function producerAllowsBind(status) {
  return status === "verified" || status === "not_applicable";
}

// ----------------------------------------------------------------------------
// 2. STATE — sub.producerCheck = { result, at, by, trigger, manual }
// ----------------------------------------------------------------------------
function producerActiveSub() {
  return SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || null;
}
function producerNow() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function producerActor() {
  const r = (typeof USER_ROLES_CONFIG !== "undefined" && USER_ROLES_CONFIG[currentUserRole]) || null;
  return r ? `${r.name} (${r.title})` : "Unknown user";
}
function producerEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function producerLog(sub, decision, notes) {
  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({ step: sub.currentStep || 2, decision, by: producerActor(), at: producerNow(), notes });
}
function producerPersist() {
  if (typeof persistAppState === "function") persistAppState();
  if (typeof refreshAuditLogIfVisible === "function") refreshAuditLogIfVisible();
}

/** Runs the check, stores it, and logs a decision when the outcome changed. */
/** Producers verified in this browser session, so a bind does not repeat a check that was just passed. Not saved: a new sign-in starts empty. */
var PRODUCER_SESSION = { verified: {} };

/** Identifies the registry in force: a new file gives a different stamp. */
function producerRegistryStamp() {
  const m = typeof REF_META !== "undefined" ? REF_META.registry : null;
  return JSON.stringify([PRODUCER_REGISTRY.length, m ? m.loadedAt : null, typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : ""]);
}
/** The producer, risk state and carrier a verification is about. */
function producerSessionKey(sub) {
  const carrier = sub.carrier || (typeof PRODUCER_DEFAULT_CARRIER !== "undefined" ? PRODUCER_DEFAULT_CARRIER : "");
  return [producerNameKey(sub.broker || ""), deriveRiskState(sub) || "", carrier, sub.channelType || ""].join("|");
}
/** True when this same producer, for this state and carrier, passed in this session and the registry has not changed since. */
function producerVerifiedThisSession(sub) {
  const cur = producerCurrent(sub), rec = PRODUCER_SESSION.verified[sub.id];
  return !!(cur && producerAllowsBind(cur.status) && rec && rec.key === producerSessionKey(sub) && rec.stamp === producerRegistryStamp());
}

function runProducerCheck(sub, trigger) {
  const prev = sub.producerCheck && sub.producerCheck.result ? sub.producerCheck.result.status : null;
  const manual = sub.producerCheck && sub.producerCheck.manual ? sub.producerCheck.manual : null;
  const result = evaluateProducerCompliance(sub, new Date(), manual);
  sub.producerCheck = { result, at: producerNow(), by: producerActor(), trigger, manual };

  const failedBits = result.checks.filter(c => c.pass === false).map(c => `${c.label}: ${c.detail}`).join(" | ");
  if (result.status === "verified" && prev !== "verified") {
    producerLog(sub, "producer_license_verified", `Producer ${result.producerName} (NPN ${result.npn}) verified for ${result.riskState} and ${result.carrier}${result.source === "manual" ? " by manual verification" : ""}.`);
  } else if (["failed", "not_found", "cannot_determine"].indexOf(result.status) > -1 && prev !== result.status) {
    producerLog(sub, "producer_license_failed", `Producer check ${trigger}: ${result.status.replace("_", " ")} for ${result.producerName}. ${failedBits}`);
  }
  if (producerAllowsBind(result.status)) PRODUCER_SESSION.verified[sub.id] = { key: producerSessionKey(sub), stamp: producerRegistryStamp() };
  else delete PRODUCER_SESSION.verified[sub.id];
  producerPersist();
  return result;
}

function producerCurrent(sub) {
  return sub.producerCheck && sub.producerCheck.result ? sub.producerCheck.result : null;
}

// ----------------------------------------------------------------------------
// 3. ACTIONS
// ----------------------------------------------------------------------------
function producerRecheckClicked() {
  const sub = producerActiveSub();
  if (!sub) return;
  if (!hasPermission("producerLicensing", "edit")) { denyPermission("producerLicensing", "edit"); return; }
  runProducerCheck(sub, "manual");
  renderProducerCard(sub);
  showToast("Producer licence and appointment check re-run.", "info");
}

/** A person states where the customer's business is when neither the case nor the email says. Logged; the check re-runs. */
function producerSetRiskState() {
  const sub = producerActiveSub();
  if (!sub) return;
  if (!hasPermission("producerLicensing", "edit")) { denyPermission("producerLicensing", "edit"); return; }
  const el = document.getElementById("plRiskState");
  const code = el ? el.value.trim().toUpperCase() : "";
  if (US_STATE_CODES_FOR_PRODUCER.indexOf(code) < 0) { showToast("⛔ Choose the state where the customer's business is located.", "danger"); return; }
  const before = deriveRiskState(sub);
  sub.riskStateSet = { state: code, by: producerActor(), at: producerNow() };
  producerLog(sub, "producer_risk_state_set", `Risk state set to ${code} by ${sub.riskStateSet.by}${before ? ` (it was read as ${before})` : " (none could be read from the case or the email)"}.`);
  runProducerCheck(sub, "risk state set");
  renderProducerCard(sub);
  if (typeof renderClearanceHold === "function") renderClearanceHold(sub);
  showToast(`Risk state set to ${code} and the check re-run.`, "success");
}

function producerRecordManualVerification() {
  const sub = producerActiveSub();
  if (!sub) return;
  if (!hasPermission("producerLicensing", "approve")) { denyPermission("producerLicensing", "approve"); return; }
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const rec = {
    npn: val("plNpn"), licenseNumber: val("plLicNo"), licenseExpires: val("plLicExp"),
    appointmentEffective: val("plApptEff"), surplusLines: !!(document.getElementById("plSurplus") && document.getElementById("plSurplus").checked), source: val("plSource"), reference: val("plRef"), notes: val("plNotes"),
    by: producerActor(), at: producerNow()
  };
  const today = isoDate(new Date());
  const problems = [];
  if (!/^\d{5,10}$/.test(rec.npn)) problems.push("NPN must be 5 to 10 digits");
  if (!rec.licenseNumber) problems.push("licence number is required");
  if (!rec.licenseExpires || rec.licenseExpires < today) problems.push("licence expiry must be a future date");
  if (!rec.appointmentEffective || rec.appointmentEffective > today) problems.push("appointment effective date must be today or earlier");
  if (!rec.source) problems.push("choose the verification source");
  if (rec.reference.length < 3) problems.push("enter the lookup reference or document id");
  if (problems.length) { showToast("⛔ " + problems.join("; ") + ".", "danger"); return; }

  const state = deriveRiskState(sub);
  if (!state) { showToast("⛔ Add the risk state to the submission before recording a verification.", "danger"); return; }
  rec.state = state;
  if (!sub.producerCheck) sub.producerCheck = {};
  sub.producerCheck.manual = rec;
  producerLog(sub, "producer_manual_verification",
    `Manual producer verification recorded for ${sub.broker}: NPN ${rec.npn}, licence ${rec.licenseNumber} (${state}) valid to ${rec.licenseExpires}, appointment effective ${rec.appointmentEffective}. Source: ${rec.source}; reference ${rec.reference}.${rec.notes ? " Notes: " + rec.notes : ""}`);
  runProducerCheck(sub, "manual verification");
  renderProducerCard(sub);
  showToast("Manual verification recorded and the check re-run.", "success");
}

// ----------------------------------------------------------------------------
// 4. RENDERING
// ----------------------------------------------------------------------------
var PRODUCER_STATE_UI = {
  verified:          { badge: "badge-success", icon: "ph-check-circle", label: "Verified" },
  failed:            { badge: "badge-danger",  icon: "ph-x-circle",     label: "Check Failed" },
  not_found:         { badge: "badge-danger",  icon: "ph-magnifying-glass", label: "Record Not Found" },
  cannot_determine:  { badge: "badge-warning", icon: "ph-warning",      label: "Risk State Unknown" },
  not_applicable:    { badge: "badge-light",   icon: "ph-minus-circle", label: "Not Applicable (Direct)" },
  not_checked:       { badge: "badge-light",   icon: "ph-hourglass",    label: "Not Checked" }
};

/** What the loaded registry holds for this case's producer, risk state and carrier, to fill the verification form. Null when there is no record by name. */
function producerPrefill(sub) {
  const rec = lookupProducerRecord(sub.broker);
  if (!rec) return null;
  const state = deriveRiskState(sub), carrier = sub.carrier || PRODUCER_DEFAULT_CARRIER;
  const lic = (rec.licenses || []).filter(l => l.state === state)[0];
  const appt = (rec.appointments || []).filter(a => a.carrier === carrier && a.state === state)[0];
  const missing = [];
  if (!lic) missing.push("licence");
  if (!appt) missing.push("appointment");
  return { name: rec.names[0], npn: rec.npn || "", licenseNumber: lic ? lic.number : "", licenseExpires: lic ? lic.expires : "", appointmentEffective: appt ? appt.effective : "", missing: missing };
}

/** The producer's record as read from the loaded registry file: NPN, every licence and every appointment, with the ones that decide this case marked. */
function producerRegistryRecordHtml(sub, result) {
  if (!PRODUCER_REGISTRY.length) return "";
  const meta = typeof REF_META !== "undefined" ? REF_META.registry : null;
  const from = meta ? ` (${producerEsc(meta.fileName)}, loaded ${producerEsc(meta.loadedAt)})` : "";
  const rec = lookupProducerRecord(sub.broker);
  if (!rec) return `<div class="alert alert-warning text-xs" style="margin-bottom:12px;"><i class="ph ph-magnifying-glass"></i> The loaded registry${from} has ${PRODUCER_REGISTRY.length.toLocaleString("en-US")} producer(s), but none matches "${producerEsc(sub.broker)}". Check the producer name in the file against the case.</div>`;
  const state = result ? result.riskState : deriveRiskState(sub), carrier = result ? result.carrier : (sub.carrier || PRODUCER_DEFAULT_CARRIER);
  const licRow = l => `<tr><td>${producerEsc(l.state)}</td><td class="font-mono">${producerEsc(l.number)}</td><td>${producerEsc((l.lines || []).join(", ") || "-")}</td><td>${producerEsc(l.status)}</td><td>${producerEsc(l.expires)}</td></tr>`;
  const appRow = a => `<tr><td>${producerEsc(a.carrier)}</td><td>${producerEsc(a.state)}</td><td>${producerEsc((a.lobs || []).map(producerLobLabel).join(", ") || "-")}</td><td>${producerEsc(a.status)}</td><td>${producerEsc(a.effective)}</td></tr>`;
  const licHead = "<thead><tr><th>Licence state</th><th>Licence number</th><th>Lines of authority</th><th>Status</th><th>Expires</th></tr></thead>";
  const appHead = "<thead><tr><th>Appointed by</th><th>State</th><th>Lines of business</th><th>Status</th><th>Effective</th></tr></thead>";
  const inState = l => l.state === state;
  const licHere = (rec.licenses || []).filter(inState), licElse = (rec.licenses || []).filter(l => !inState(l));
  const appHere = (rec.appointments || []).filter(inState), appElse = (rec.appointments || []).filter(a => !inState(a));
  const none = what => `<tr><td colspan="5" class="text-muted">The file has no ${what} for ${producerEsc(state || "this state")}.</td></tr>`;
  const others = licElse.length + appElse.length ? `<details style="margin-top:8px;"><summary class="text-xs text-muted">Other states in the file (${licElse.length} licence(s), ${appElse.length} appointment(s))</summary>${licElse.length ? `<div class="rules-table-container"><table class="data-table">${licHead}<tbody>${licElse.map(licRow).join("")}</tbody></table></div>` : ""}${appElse.length ? `<div class="rules-table-container" style="margin-top:6px;"><table class="data-table">${appHead}<tbody>${appElse.map(appRow).join("")}</tbody></table></div>` : ""}</details>` : "";
  if (!state) return `<div class="alert alert-warning text-xs" style="margin-bottom:12px;"><i class="ph ph-map-pin"></i> ${producerEsc(rec.names[0])} (NPN <span class="font-mono">${producerEsc(rec.npn)}</span>) is in the registry${from}, but the state of the customer's business is not known, so no state's details can be shown. Set the state below.</div>`;
  return `<div style="margin-bottom:12px;">
      <div class="text-xs" style="margin-bottom:6px;"><i class="ph ph-database"></i> <strong>Read from the licensing registry${from} for ${producerEsc(state)}, where the customer's business is:</strong> ${producerEsc(rec.names[0])}, NPN <span class="font-mono">${producerEsc(rec.npn)}</span>.</div>
      <div class="rules-table-container"><table class="data-table">${licHead}<tbody>${licHere.map(licRow).join("") || none("licence")}</tbody></table></div>
      <div class="rules-table-container" style="margin-top:8px;"><table class="data-table">${appHead}<tbody>${appHere.map(appRow).join("") || none("appointment")}</tbody></table></div>
      ${others}
    </div>`;
}

function renderProducerCard(sub) {
  const box = document.getElementById("producerLicensingContainer");
  if (!box || !sub) return;
  const result = producerCurrent(sub);
  const state = result ? result.status : "not_checked";
  const noRegistry = state === "not_found" && PRODUCER_REGISTRY.length === 0;   // nothing to look the producer up in: not a failure
  const ui = noRegistry ? { badge: "badge-warning", icon: "ph-database", label: "No Registry Loaded" } : PRODUCER_STATE_UI[state];
  const canEdit = hasPermission("producerLicensing", "edit");
  const canApprove = hasPermission("producerLicensing", "approve");

  let banner;
  if (!result) banner = `<div class="alert alert-warning text-xs"><i class="ph ph-hourglass"></i> The producer has not been checked yet. The check also runs again at bind.</div>`;
  else if (state === "verified") banner = `<div class="alert alert-success text-xs"><i class="ph ph-check-circle"></i> Producer is licensed and appointed. The check is repeated at bind.</div>`;
  else if (state === "not_applicable") banner = `<div class="alert alert-success text-xs"><i class="ph ph-minus-circle"></i> Direct submission — no producer to check.</div>`;
  else banner = `<div class="alert ${noRegistry ? "alert-warning" : "alert-danger"} text-xs"><i class="ph ph-prohibit"></i> <strong>Bind is blocked.</strong> Business cannot be accepted through a producer who is not licensed in the risk state and appointed by the carrier. Correct the record, or have an authorized user record a verified lookup.</div>`;

  const rows = result ? result.checks.map(c => {
    const badge = c.pass === true ? `<span class="badge badge-success text-xs">Pass</span>` : (c.pass === false ? `<span class="badge badge-danger text-xs">Fail</span>` : `<span class="badge badge-light text-xs">n/a</span>`);
    return `<tr><td>${producerEsc(c.label)}</td><td>${badge}</td><td>${producerEsc(c.detail)}</td></tr>`;
  }).join("") : `<tr><td colspan="3" class="text-muted" style="text-align:center;">No check has been run.</td></tr>`;

  const meta = result && state !== "not_applicable" ? `
    <div class="clean-meta-list" style="margin-bottom:12px;">
      <div class="clean-meta-row"><span class="meta-label">Producer</span><span class="meta-value">${producerEsc(result.producerName)}</span></div>
      <div class="clean-meta-row"><span class="meta-label">Risk state / carrier</span><span class="meta-value">${producerEsc(result.riskState || "unknown")} · ${producerEsc(result.carrier)}</span></div>
      <div class="clean-meta-row"><span class="meta-label">Checked</span><span class="meta-value">${producerEsc(sub.producerCheck.at)} · ${producerEsc(sub.producerCheck.trigger)} · ${producerEsc(sub.producerCheck.by)}</span></div>
      ${sub.producerCheck.manual ? `<div class="clean-meta-row"><span class="meta-label">Manual verification</span><span class="meta-value">${producerEsc(sub.producerCheck.manual.source)} · ref ${producerEsc(sub.producerCheck.manual.reference)} · ${producerEsc(sub.producerCheck.manual.by)}</span></div>` : ""}
    </div>` : "";

  const registryBlock = state !== "not_applicable" ? producerRegistryRecordHtml(sub, result) : "";

  const recheck = canEdit && state !== "not_applicable"
    ? `<button class="btn btn-sm btn-outline" style="width:auto;" onclick="producerRecheckClicked()"><i class="ph ph-arrows-clockwise"></i> Re-run check</button>` : "";

  const needsManual = ["failed", "not_found", "cannot_determine"].indexOf(state) > -1;
  const stateForm = state === "cannot_determine" && canEdit ? `
      <div class="simulation-tool-box" style="display:block; margin-top:14px;">
        <span class="tool-label" style="display:block; margin-bottom:8px;"><i class="ph ph-map-pin"></i> Set the risk state (the state where the customer's business is located)</span>
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          <select id="plRiskState" class="form-control" style="width:200px;"><option value="">Choose a state</option>${US_STATE_CODES_FOR_PRODUCER.map(c => `<option value="${c}">${c}</option>`).join("")}</select>
          <button class="btn btn-sm btn-primary" style="width:auto;" onclick="producerSetRiskState()"><i class="ph ph-check"></i> Set &amp; re-check</button>
        </div>
      </div>` : "";
  let manualForm = stateForm;
  if (needsManual && canApprove) {
    const pre = producerPrefill(sub), pv = k => producerEsc(pre ? pre[k] : "");
    manualForm += `
      <div class="simulation-tool-box" style="display:block; margin-top:14px;">
        <span class="tool-label" style="display:block; margin-bottom:8px;"><i class="ph ph-clipboard-text"></i> Record a verified lookup (replaces the registry record for this submission)</span>
        ${pre ? `<p class="text-xs text-muted" style="margin:0 0 8px;"><i class="ph ph-magic-wand"></i> Filled in from the loaded registry's record for ${producerEsc(pre.name)}${pre.missing.length ? " (the registry has no " + producerEsc(pre.missing.join(" or ")) + " for this state and carrier, so that is left blank)" : ""}. Check the values against the source before recording.</p>` : ""}
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          <input id="plNpn" class="form-control" style="width:130px;" placeholder="NPN" value="${pv("npn")}">
          <input id="plLicNo" class="form-control" style="width:170px;" placeholder="Licence number" value="${pv("licenseNumber")}">
          <label class="text-xs text-muted" style="font-size:12px;">Licence expires <input id="plLicExp" type="date" class="form-control" style="width:150px;" value="${pv("licenseExpires")}"></label>
          <label class="text-xs text-muted" style="font-size:12px;">Appointment effective <input id="plApptEff" type="date" class="form-control" style="width:150px;" value="${pv("appointmentEffective")}"></label>
          <label style="font-size:12.5px;"><input type="checkbox" id="plSurplus"> Holds a surplus lines licence in this state</label>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:8px;">
          <select id="plSource" class="form-control" style="width:260px;">${PRODUCER_VERIFICATION_SOURCES.map(s => `<option>${producerEsc(s)}</option>`).join("")}</select>
          <input id="plRef" class="form-control" style="width:220px;" placeholder="Lookup reference / document id">
          <input id="plNotes" class="form-control" style="flex:1; min-width:200px;" placeholder="Notes (optional)">
          <button class="btn btn-sm btn-primary" style="width:auto;" onclick="producerRecordManualVerification()"><i class="ph ph-check"></i> Record &amp; re-check</button>
        </div>
      </div>`;
  } else if (needsManual) {
    manualForm += `<p class="text-xs text-muted" style="margin-top:12px;"><i class="ph ph-lock"></i> Recording a verified lookup needs a user with producer-licensing approval authority (for example the Chief Underwriting Officer).</p>`;
  }

  box.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3><i class="ph ph-identification-card"></i> Producer Licence &amp; Carrier Appointment</h3>
        <span class="badge ${ui.badge}"><i class="ph ${ui.icon}"></i> ${ui.label}</span>
      </div>
      <div class="card-body">
        ${banner}
        ${meta}
        ${registryBlock}
        <div class="rules-table-container">
          <table class="data-table">
            <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${recheck ? `<div style="margin-top:12px;">${recheck}</div>` : ""}
        ${manualForm}
        <p class="text-xs text-muted" style="margin-top:10px;">
          <i class="ph ph-info"></i> Source: ${PRODUCER_REGISTRY.length ? "the loaded licensing registry" : "no licensing registry is connected; each producer is verified by recording a lookup above"}. A production deployment must read licensing and appointment data from NIPR or a licensed provider.
        </p>
      </div>
    </div>`;
}

function renderProducerBindBanner(sub) {
  if (!sub) return "";
  const result = producerCurrent(sub);
  if (!result || producerAllowsBind(result.status)) {
    const note = !result ? "The producer licence and appointment check will run when you sign and bind." : "Producer licence and appointment: verified. It is checked again at bind.";
    return `<div class="alert alert-success text-xs" style="margin-bottom:12px;"><i class="ph ph-identification-card"></i> ${note}</div>`;
  }
  return `<div class="alert alert-danger text-xs" style="margin-bottom:12px;"><i class="ph ph-prohibit"></i> <strong>Bind blocked.</strong> Producer licence / appointment check: ${PRODUCER_STATE_UI[result.status].label.toLowerCase()}. Open Step 2 — Clearance.</div>`;
}

// ----------------------------------------------------------------------------
// 5. HOOKS
// ----------------------------------------------------------------------------
function producerGuardBind(source, subId) {
  const sub = subId ? (SUBMISSIONS_DATASET.find(s => s.id === subId) || null) : producerActiveSub();
  if (!sub) return true;
  // Not repeated when this producer already passed in this session and no registry was loaded since.
  const result = producerVerifiedThisSession(sub) ? producerCurrent(sub) : runProducerCheck(sub, "bind");
  if (producerAllowsBind(result.status)) return true;
  producerLog(sub, "producer_bind_blocked", `Bind attempt blocked (${source}): producer check is "${PRODUCER_STATE_UI[result.status].label}".`);
  producerPersist();
  showToast(`⛔ Bind blocked: producer licence / appointment ${PRODUCER_STATE_UI[result.status].label.toLowerCase()}. See Step 2 — Clearance.`, "danger");
  renderProducerCard(sub);
  return false;
}

(function installProducerHooks() {
  if (typeof AUDIT_ACTION_META !== "undefined") {
    AUDIT_ACTION_META.producer_license_verified = { label: "Producer Licence & Appointment Verified", icon: "ph-identification-card", badge: "badge-success", outcome: "outcome-approve" };
    AUDIT_ACTION_META.producer_license_failed = { label: "Producer Licence / Appointment Check Failed", icon: "ph-identification-card", badge: "badge-danger", outcome: "outcome-decline" };
    AUDIT_ACTION_META.producer_manual_verification = { label: "Producer Verification Recorded Manually", icon: "ph-clipboard-text", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.producer_risk_state_set = { label: "Producer Check: Risk State Set", icon: "ph-map-pin", badge: "badge-info", outcome: "outcome-comm" };
    AUDIT_ACTION_META.producer_bind_blocked = { label: "Bind Blocked — Producer Check", icon: "ph-prohibit", badge: "badge-danger", outcome: "outcome-decline" };
  }

  const origShow = window.showWorkflowPage;
  if (typeof origShow === "function") {
    window.showWorkflowPage = function (stepNum) {
      const r = origShow.apply(this, arguments);
      if (stepNum === 2) {
        const sub = producerActiveSub();
        if (sub) {
          if (!sub.producerCheck || !sub.producerCheck.result) runProducerCheck(sub, "clearance");
          renderProducerCard(sub);
        }
      }
      return r;
    };
  }
  const origRenderAll = window.renderAllDownstreamScreens;
  if (typeof origRenderAll === "function") {
    window.renderAllDownstreamScreens = function (sub) {
      const r = origRenderAll.apply(this, arguments);
      try { renderProducerCard(sub); } catch (e) { console.warn("Producer card render failed:", e); }
      return r;
    };
  }
  // A new sign-in is a new session: earlier verifications are no longer reused at bind.
  const origInit = window.initAppAfterLogin;
  if (typeof origInit === "function") {
    window.initAppAfterLogin = function () { PRODUCER_SESSION.verified = {}; return origInit.apply(this, arguments); };
  }
  registerGuard("eSign", "producer licence", function () { return producerGuardBind("e-signature"); });
  registerGuard("issueQuote", "producer licence", function () { return producerGuardBind("issue quote"); });
  registerGuard("bind", "producer licence", function (a) { return producerGuardBind("PAS bind", a[0]); });
})();

window.producerRecheckClicked = producerRecheckClicked;
window.producerRecordManualVerification = producerRecordManualVerification;
window.renderProducerCard = renderProducerCard;
window.renderProducerBindBanner = renderProducerBindBanner;
window.runProducerCheck = runProducerCheck;
window.producerVerifiedThisSession = producerVerifiedThisSession;
window.PRODUCER_SESSION = PRODUCER_SESSION;
window.evaluateProducerCompliance = evaluateProducerCompliance;
