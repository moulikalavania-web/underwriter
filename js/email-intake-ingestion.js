/**
 * ============================================================================
 * EMAIL → SUBMISSION → DOCUMENT INGESTION MODULE (Add-On)
 * ----------------------------------------------------------------------------
 * Flow (per spec):
 *   Email → Copy/Paste Raw Data & Documents → Submission → Document Ingestion
 *   → Normalize Data → Standard Data
 *
 * CAVEMAN RULE: the Submission step NEVER cleans, edits, or reinterprets what
 * the customer/broker sent. Raw text and raw files are copied verbatim onto
 * the submission (sub.rawEmailText / sub.rawAttachments) and are NEVER
 * mutated again, by anything in this file. AI normalization is a separate,
 * explicit, worker-triggered action that happens later at the Document
 * Ingestion step (Screen 2 / Workflow Step 1) and writes its cleaned output
 * to the submission's *standard* fields (insured, fein, dot, etc.) — the raw
 * copy sits alongside it, untouched, viewable at any time.
 *
 * Step 1 — Email screen (this modal, opened from Integrating API):
 *   worker pastes raw text + attaches raw documents. No AI runs here.
 * Step 2 — Submission section:
 *   createRawSubmissionFromEmail() creates the Submission with the raw data
 *   attached as-is, status "Raw Intake — Pending Document Ingestion".
 * Step 3 — Document Ingestion (Screen 2):
 *   renderRawEmailCapturePanel() shows the untouched raw data + a
 *   "Run AI Document Ingestion" button. runDocIngestionNormalization() runs
 *   extraction, shows a confidence-scored review, and
 *   applyNormalizedDataToSubmission() writes the cleaned Standard Data onto
 *   the submission's normal fields — raw fields are left exactly as they
 *   were captured.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 0. CONFIG / CONSTANTS
// ----------------------------------------------------------------------------
const EMAIL_DIGEST_LOB_TEMPLATES = ["trucking", "property", "mpl", "gl_cpc", "gl_cas"];

// Simulated inbox used by the "Demo Inbox Connector" tab. In a real
// deployment this would instead be populated by a Gmail API / Microsoft
// Graph / IMAP poller running server-side. Loading a message here still only
// performs RAW CAPTURE — no AI runs until the worker explicitly triggers
// Document Ingestion later.
const DEMO_INBOX_MESSAGES = [
  {
    id: "demo-msg-1",
    from: "submissions@westgatelogistics-broker.com",
    subject: "New Business Submission — Westgate Logistics Fleet (Effective 10/1)",
    receivedLabel: "8 minutes ago",
    lobKey: "trucking",
    body:
`From: Dana Whitfield <submissions@westgatelogistics-broker.com>
Subject: New Business Submission — Westgate Logistics Fleet (Effective 10/1)

Hi Underwriting Desk,

Please find below the new submission for our client, Westgate Logistics LLC
(FEIN 46-2210987), a regional dry-van trucking operation based out of
Nashville, TN. DOT# 2938411, MC-771205. They run 18 tractor units on a
~350 mile average radius. Requesting quote for Commercial Auto Liability,
$2,000,000 requested limit, effective 10/01/2026.

Three-year loss history is clean — one small cargo claim in 2024,
total incurred approx. $8,400. Broker of record is Highline Risk Partners.
Please treat as fast-track, client's current policy lapses in 3 weeks.

Thanks,
Dana Whitfield
Highline Risk Partners
dana.whitfield@highlinerisk.com`
  },
  {
    id: "demo-msg-2",
    from: "riskmgmt@brightharbor-props.com",
    subject: "Property Submission - Bright Harbor Distribution Center",
    receivedLabel: "41 minutes ago",
    lobKey: "property",
    body:
`From: Alan Reyes <riskmgmt@brightharbor-props.com>
Subject: Property Submission - Bright Harbor Distribution Center

Team,

Submitting for coverage: Bright Harbor Distribution Center, a 240,000 sq ft
warehouse in Savannah, GA. Insured legal entity is Bright Harbor Logistics
Inc, FEIN 58-1120044. Building value approx $14,200,000, contents
$2,100,000. Sprinklered, built 2016, no prior losses in past 5 years.
Requested effective date is the 1st of next month. Broker: Gallagher
Commercial Property Group.

Let me know what else you need.

Alan Reyes
Gallagher Commercial Property Group`
  },
  {
    id: "demo-msg-3",
    from: "info@quicklane-couriers.com",
    subject: "insurance quote please - small delivery fleet",
    receivedLabel: "2 hours ago",
    lobKey: "trucking",
    body:
`hey there, we need insurance for our delivery business. company name is
QuickLane Couriers, we have about 6 vans. we're based in Phoenix AZ. can
someone call me back. dot number is somewhere on our permit i think it
starts with 39... will find it. thanks
- Marco`
  }
];

let emailDigestAttachedFiles = [];    // File objects staged for upload during raw capture
let emailDigestActiveTab = "paste";   // 'paste' | 'inbox'
let emailIngestionDraftBySubId = {};  // subId -> last AI extraction draft awaiting review (not yet applied)

// ----------------------------------------------------------------------------
// 1. MODAL OPEN / CLOSE / TAB SWITCHING (raw capture only, no AI)
// ----------------------------------------------------------------------------
function openEmailDigestModal() {
  const modal = document.getElementById("emailDigestModal");
  if (modal) modal.classList.add("active");
  resetEmailCaptureForm();
  switchEmailDigestTab("paste");
}

function closeEmailDigestModal() {
  const modal = document.getElementById("emailDigestModal");
  if (modal) modal.classList.remove("active");
}

function switchEmailDigestTab(tab) {
  emailDigestActiveTab = tab;
  const pasteTab = document.getElementById("emailDigestTabPaste");
  const inboxTab = document.getElementById("emailDigestTabInbox");
  const pastePanel = document.getElementById("emailDigestPastePanel");
  const inboxPanel = document.getElementById("emailDigestInboxPanel");
  if (pasteTab) pasteTab.classList.toggle("active", tab === "paste");
  if (inboxTab) inboxTab.classList.toggle("active", tab === "inbox");
  if (pastePanel) pastePanel.style.display = tab === "paste" ? "block" : "none";
  if (inboxPanel) inboxPanel.style.display = tab === "inbox" ? "block" : "none";
  if (tab === "inbox") renderDemoInboxList();
}

function resetEmailCaptureForm() {
  emailDigestAttachedFiles = [];
  const textarea = document.getElementById("emailDigestRawText");
  const jsonTextarea = document.getElementById("emailDigestSubmissionJsonText");
  const fileList = document.getElementById("emailDigestFileList");
  const createBtn = document.getElementById("emailDigestCreateBtn");
  if (textarea) textarea.value = "";
  if (jsonTextarea) jsonTextarea.value = "";
  if (fileList) fileList.innerHTML = "";
  if (createBtn) { createBtn.disabled = false; createBtn.innerHTML = '<i class="ph ph-tray-arrow-down"></i> Submit'; }
}

// ----------------------------------------------------------------------------
// 2. ATTACHMENT HANDLING — captured and stored verbatim (base64), never
//    modified. Read later, unmodified, by the AI normalization step.
// ----------------------------------------------------------------------------
function handleEmailDigestFileSelect(event) {
  const files = Array.from(event.target.files || []);
  emailDigestAttachedFiles = emailDigestAttachedFiles.concat(files);
  renderEmailDigestFileList();
  event.target.value = "";
}

function removeEmailDigestFile(idx) {
  emailDigestAttachedFiles.splice(idx, 1);
  renderEmailDigestFileList();
}

function renderEmailDigestFileList() {
  const box = document.getElementById("emailDigestFileList");
  if (!box) return;
  if (!emailDigestAttachedFiles.length) { box.innerHTML = ""; return; }
  box.innerHTML = emailDigestAttachedFiles.map((f, idx) => `
    <div class="email-digest-file-chip">
      <i class="ph ${f.type === 'application/pdf' ? 'ph-file-pdf' : 'ph-image'}"></i>
      <span>${f.name}</span>
      <button type="button" onclick="removeEmailDigestFile(${idx})" title="Remove"><i class="ph ph-x"></i></button>
    </div>
  `).join("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------------------------------
// 3. DEMO INBOX CONNECTOR (simulated raw capture only — see header comment)
// ----------------------------------------------------------------------------
function renderDemoInboxList() {
  const box = document.getElementById("emailDigestInboxList");
  if (!box) return;
  box.innerHTML = DEMO_INBOX_MESSAGES.map(msg => `
    <div class="email-digest-inbox-row">
      <div class="email-digest-inbox-meta">
        <div class="email-digest-inbox-subject"><i class="ph ph-envelope-simple"></i> ${msg.subject}</div>
        <div class="email-digest-inbox-from">${msg.from} • ${msg.receivedLabel}</div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="loadDemoInboxMessage('${msg.id}')">
        <i class="ph ph-clipboard-text"></i> Copy Into Paste Pane
      </button>
    </div>
  `).join("");
}

function loadDemoInboxMessage(msgId) {
  const msg = DEMO_INBOX_MESSAGES.find(m => m.id === msgId);
  if (!msg) return;
  switchEmailDigestTab("paste");
  const textarea = document.getElementById("emailDigestRawText");
  const lobSelect = document.getElementById("emailDigestLobSelect");
  if (textarea) textarea.value = msg.body;
  if (lobSelect && msg.lobKey) lobSelect.value = msg.lobKey;
  showToast("📥 Raw message copied into the paste pane — review and click \"Submit\" (no AI runs yet).", "info");
}

// Stub for wiring a REAL inbox in production. Left here (unused by the demo
// button) as the intended integration point:
//   1. Server-side OAuth against Gmail API / Microsoft Graph, or an IMAP
//      IDLE listener, watching the shared submissions@ mailbox.
//   2. On new mail: strip MIME, pull plaintext/HTML body + attachment blobs.
//   3. Write { rawEmailText, rawAttachments[] } straight onto a new
//      Submission record — same as createRawSubmissionFromEmail() below —
//      untouched. Do NOT run AI extraction at ingest time.
//   4. AI normalization stays a separate, explicit Document Ingestion action
//      (runDocIngestionNormalization) so raw data is always preserved.
async function connectRealInboxStub() {
  showToast("🔌 Real inbox connection (Gmail/Outlook/IMAP) requires a backend OAuth service — not available in this browser-only prototype. See code comments in email-intake-ingestion.js for the integration point.", "warning");
}

// ----------------------------------------------------------------------------
// 4. CREATE RAW SUBMISSION — pure capture, NO AI. This is the "Submission
//    section" step: raw data & documents are added to a new submission
//    exactly as received.
// ----------------------------------------------------------------------------
// A genuinely blank submission skeleton — every structural field a
// downstream screen (Underwriting Workbench, Appetite Rules, Vehicles/
// Drivers Schedule, etc.) expects to exist, but with no fabricated values:
// empty arrays/objects only. This replaces cloning a previously-ingested
// submission as a "template" — there is no fake company data anywhere in
// this app anymore for a raw email capture to inherit.
function getBlankSubmissionSkeleton() {
  return {
    vehicles: [],
    drivers: [],
    coverageRows: [],
    enrichmentCards: [],
    subjectivities: [],
    losses: [],
    appetiteRules: [],
    genInfo: {},
    insuredInfo: {},
    coveragesInfo: {},
    filingInfo: {},
    radiusOfOperationsInfo: {},
    serviceInspectionInfo: {},
    commoditiesSelected: [],
    commoditiesInfo: {},
    uwReviewInfo: {},
    decisionLog: [],
    broker_fee: { amount: 0, default: 0 },
    minStatutoryLimit: null,
    desk: null,
    underwriter: null,
    authorityLimit: 2000000,
    insured_id: null,
    endorsement_number: 0,
    quoteNo: null,
    quote_id: null,
    canonicalJson: {},
    isReferral: false,
    lifecycleStatus: null,
    pasSync: null,
    // Business Type, Years in Business, Operating Authority, Interstate/
    // Intrastate, Operating Radius, Annual Mileage, Annual Revenue, States
    // Operated, Primary Garaging State, For-Hire/Private Carrier, Common/
    // Contract Carrier, Owner Operator Usage, Brokerage Operations, Hazmat
    // Operations. Populated only from the raw email text and/or a
    // structured Submission JSON at Document Ingestion — never fabricated.
    operationsProfile: {}
  };
}

async function createRawSubmissionFromEmail() {
  const textarea = document.getElementById("emailDigestRawText");
  const lobSelect = document.getElementById("emailDigestLobSelect");
  const jsonTextarea = document.getElementById("emailDigestSubmissionJsonText");
  const rawText = textarea ? textarea.value.trim() : "";
  const rawSubmissionJsonText = jsonTextarea ? jsonTextarea.value.trim() : "";
  const lobKey = lobSelect ? lobSelect.value : "trucking";

  if (!rawText && emailDigestAttachedFiles.length === 0) {
    showToast("⚠️ Paste the email text or attach at least one document first.", "warning");
    return;
  }

  const createBtn = document.getElementById("emailDigestCreateBtn");
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Capturing Raw Data...';
  }

  try {
    // Capture attachments verbatim as base64 — stored once, read later,
    // never rewritten.
    const rawAttachments = [];
    for (const file of emailDigestAttachedFiles) {
      const base64 = await fileToBase64(file);
      rawAttachments.push({ name: file.name, type: file.type, size: file.size, base64 });
    }

    const newSub = getBlankSubmissionSkeleton();
    const newId = `SUB-EM${Math.floor(10000 + Math.random() * 90000)}`;

    newSub.id = newId;
    newSub.lobKey = lobKey;
    const lobCatalogEntry = (typeof LOB_CATALOG !== "undefined") ? LOB_CATALOG.find(l => l.key === lobKey) : null;
    newSub.lobName = lobCatalogEntry ? lobCatalogEntry.name : lobKey;

    // Real data captured from an actual inbound email — flagged the same as
    // Integrating API ingestions so dashboards that must reflect only real
    // ingested data (e.g. Team Activity) count this submission.
    newSub.apiSourced = true;

    // --- Placeholder / pending display fields. These are NOT extracted from
    // the raw text — they are honest placeholders until a human explicitly
    // runs AI Document Ingestion. Nothing here reads or alters rawEmailText.
    newSub.insured = "(Pending — See Raw Email)";
    newSub.fein = "PENDING";
    newSub.dot = null;
    newSub.mcNumber = null;
    newSub.address = "(Pending)";
    newSub.broker = "(Pending Extraction)";
    newSub.email = "";
    newSub.exposureVal = 0;
    newSub.exposure = "Pending";
    newSub.channelType = "broker";
    newSub.channelName = "Email Intake — Raw Capture (Pending Document Ingestion)";
    newSub.receivedAt = "Just Now";
    newSub.receivedTimestamp = Date.now();
    newSub.assignedTo = null;
    newSub.assignedBy = null;
    newSub.assignedAt = null;
    newSub.priority = "P3";
    // No real priority score exists yet — nothing has been analyzed. This
    // used to be a hardcoded "50", which displayed on the Submission Intake
    // table as if it were an actual calculated score before Document
    // Ingestion ever ran. Stays null (shown as "Pending") until
    // applyNormalizedDataToSubmission() computes the real one.
    newSub.priorityScore = null;
    newSub.slaText = "Pending Triage";
    newSub.slaCountdown = "Awaiting Document Ingestion";
    newSub.priorityReason = "Raw Email Capture — Awaiting AI Normalization at Document Ingestion";
    newSub.statusText = "Raw Intake — Pending Document Ingestion";
    newSub.statusBadge = "badge-light";
    newSub.currentStep = 1;
    newSub.completedSteps = [];

    // Raw docs list shows attachments exactly as received, clearly marked
    // unprocessed — separate from the normalized ocrFields, which stay empty
    // until Document Ingestion runs.
    newSub.docs = rawAttachments.map(a => ({
      name: a.name,
      type: a.type === "application/pdf" ? "pdf" : "xls",
      desc: `Raw Upload — Attached From Email (${(a.size / 1024).toFixed(0)} KB) • Unprocessed`
    }));
    newSub.ocrFields = []; // nothing extracted yet

    newSub.canonicalJson = {
      submission_id: newId,
      source_channel: "Email Intake (Raw Capture — Not Yet Normalized)",
      status: "pending_document_ingestion",
      note: "Raw email text and attachments are stored on this submission (rawEmailText / rawAttachments) exactly as received. Run AI Document Ingestion to populate this canonical record."
    };

    // --- The actual raw capture. Never mutated again by this module. ---
    newSub.rawEmailText = rawText;   // verbatim, as pasted
    newSub.rawAttachments = rawAttachments; // verbatim, as uploaded
    newSub.rawSubmissionJsonText = rawSubmissionJsonText; // verbatim, as pasted — parsed only at Document Ingestion
    newSub.normalizationStatus = "pending"; // 'pending' | 'normalized' | 'needs_review'
    newSub.normalizedMeta = null;

    SUBMISSIONS_DATASET.unshift(newSub);
    closeEmailDigestModal();
    resetEmailCaptureForm();

    if (typeof selectSubmission === "function") selectSubmission(newId, false);
    if (typeof showIntakePage === "function") showIntakePage(); // redirect to the Submission Intake dashboard
    if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
    if (typeof persistAppState === "function") persistAppState();

    showToast(`📥 [${newId}] created with raw email data & documents attached — unchanged. Run Document Ingestion to normalize.`, "success");
  } catch (err) {
    showToast("❌ Could not capture raw submission: " + err.message, "danger");
  } finally {
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = '<i class="ph ph-tray-arrow-down"></i> Submit';
    }
  }
}

window.createRawSubmissionFromEmail = createRawSubmissionFromEmail;

// ============================================================================
// 5. DOCUMENT INGESTION STEP (Screen 2) — AI normalization happens HERE,
//    on demand, and only ever writes to the submission's standard fields.
//    sub.rawEmailText / sub.rawAttachments are read-only inputs to this step
//    and are never modified.
// ============================================================================

// Renders into #rawEmailCaptureContainer on Screen 2. No-op for submissions
// that didn't come from Email Intake (rawEmailText undefined).
function renderRawEmailCapturePanel(sub) {
  const box = document.getElementById("rawEmailCaptureContainer");
  togglePostNormalizationCards(sub);
  if (!box) return;

  if (!sub || (sub.rawEmailText === undefined && (!sub.rawAttachments || !sub.rawAttachments.length))) {
    box.innerHTML = "";
    return;
  }

  if (sub.normalizationStatus === "normalized" || sub.normalizationStatus === "needs_review") {
    // Document Ingestion Complete summary removed — once normalization is
    // done there's nothing left to show here.
    box.innerHTML = "";
    return;
  }

  renderIngestionReviewDirect(sub, box);
}

// The "AI / OCR Extraction Pipeline" card only makes sense once normalization
// has actually happened. For submissions that arrived via raw Email Intake
// and are still sub.normalizationStatus === "pending", it's hidden — there's
// nothing extracted/normalized yet, so showing "100% Normalized" would be
// misleading. It reappears automatically the moment "Confirm & Apply
// Standard Data" completes (status becomes "normalized" or "needs_review").
// Submissions that didn't come through Email Intake (rawEmailText undefined)
// never had this hidden in the first place — they're already normalized on
// ingest.
function togglePostNormalizationCards(sub) {
  const isPendingRawCapture = sub && sub.rawEmailText !== undefined && sub.normalizationStatus === "pending";
  const display = isPendingRawCapture ? "none" : "";
  const ocrCard = document.getElementById("ocrPipelineCard");
  if (ocrCard) ocrCard.style.display = display;
}

window.togglePostNormalizationCards = togglePostNormalizationCards;

// Skips the raw-data staging screen entirely: as soon as Document Ingestion
// is opened for a submission that hasn't been normalized yet, build the AI
// extraction draft and render the review/edit form directly — the same form
// that used to require a separate "Run AI Document Ingestion" click first.
// Single unified card for the whole ingestion review flow — one header, one
// frame. (Used to be two nested cards: an outer "AI Document Ingestion"
// shell wrapping an inner "AI-Normalized Standard Data" panel with its own
// header — same chrome twice, which is what made it feel cluttered.)
function renderIngestionReviewDirect(sub, box) {
  box.innerHTML = `
    <div class="card ingestion-review-card">
      <div class="card-header ingestion-review-header">
        <div class="ingestion-review-heading">
          <span class="ingestion-review-icon"><i class="ph ph-magic-wand"></i></span>
          <div>
            <h3>AI Document Ingestion</h3>
            <p class="ingestion-review-subtitle">Review what the AI extracted below, fix anything that's wrong, then apply it to the submission.</p>
          </div>
        </div>
        <span class="badge badge-info ingestion-review-pill"><i class="ph ph-lock-simple"></i> Review Before Applying</span>
      </div>
      <div class="card-body">
        <div class="email-digest-dupe-banner" id="emailDigestDupeBanner"></div>
        <div id="emailDigestReviewContainer"></div>
      </div>
    </div>
  `;

  const draft = emailIngestionDraftBySubId[sub.id] || buildLocalNormalizationDraft(sub);
  emailIngestionDraftBySubId[sub.id] = draft;
  renderNormalizationReview(sub.id, draft);
}

function renderNormalizedSummaryPanel(sub, box) {
  const isReview = sub.normalizationStatus === "needs_review";
  const meta = sub.normalizedMeta || {};
  box.innerHTML = `
    <div class="card raw-capture-card">
      <div class="card-header">
        <h3><i class="ph ph-check-circle"></i> Document Ingestion Complete</h3>
        <span class="badge ${isReview ? 'badge-warning' : 'badge-success'}">
          <i class="ph ${isReview ? 'ph-flag' : 'ph-check'}"></i> ${isReview ? 'Normalized — Needs Review' : 'Normalized — Standard Data'}
        </span>
      </div>
      <div class="card-body">
        <p class="text-xs text-muted" style="margin-top:0;">
          Standard fields below were written by AI Document Ingestion${meta.normalizedAt ? " on " + new Date(meta.normalizedAt).toLocaleString() : ""}.
          The original raw email/documents are preserved untouched and can be reviewed anytime.
        </p>
        <button class="btn btn-sm btn-outline" onclick="toggleRawEmailView('${sub.id}')" id="toggleRawViewBtn_${sub.id}">
          <i class="ph ph-eye"></i> View Original Raw Email
        </button>
        <div id="rawEmailCollapsed_${sub.id}" style="display:none; margin-top:10px;">
          <div class="raw-email-text-block">${escapeHtml(sub.rawEmailText || "(no text pasted — see attachments)")}</div>
          <div class="email-digest-file-list mt-2">
            ${(sub.rawAttachments || []).map(a => `
              <div class="email-digest-file-chip" title="Raw file, unmodified">
                <i class="ph ${a.type === 'application/pdf' ? 'ph-file-pdf' : 'ph-image'}"></i><span>${a.name}</span>
              </div>`).join("") || ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleRawEmailView(subId) {
  const el = document.getElementById(`rawEmailCollapsed_${subId}`);
  const btn = document.getElementById(`toggleRawViewBtn_${subId}`);
  if (!el) return;
  const showing = el.style.display !== "none";
  el.style.display = showing ? "none" : "block";
  if (btn) btn.innerHTML = showing
    ? '<i class="ph ph-eye"></i> View Original Raw Email'
    : '<i class="ph ph-eye-slash"></i> Hide Original Raw Email';
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Pulls per-driver details (name, age, CDL experience, license state/class)
// out of the raw pasted email text, keyed by driver number (1-based) so
// they can be matched onto sub.drivers[index] later. Nothing here is
// invented — a field is only set if the email text actually contains it;
// everything else on that driver (dob, sex, license number, tenure,
// status, driver_factor) stays exactly as cloned from the LOB template.
// Recognized formats:
//   "Driver 1 Name: Rahul Sharma"
//   "Driver 1: Rahul Sharma, Age 24, TX Class A license, 3 years CDL experience"
//   "Driver 1: Age 24, TX Class A license, 3 years CDL experience"  (no name given)
//   "Driver Name: Rahul Sharma" / "Age: 24"  (single unnumbered driver, applies to Driver 1)
// Text-only, section-agnostic block grabber — returns every non-empty line
// following a header line matching `headerRegex`, up to the next blank line
// or the next section-header-looking line (short line ending in ':'). Used
// by the driver/vehicle fallback parsers below when the email doesn't use
// the rigid "Driver N:" / "Unit N:" numbering the primary regexes expect.
function extractSection(raw, headerRegex) {
  if (!raw) return null;
  const lines = raw.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => headerRegex.test(l));
  if (headerIdx === -1) return null;
  const out = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") break;
    if (/^[A-Za-z][A-Za-z /]{2,40}:\s*$/.test(line.trim()) && out.length) break; // next section header
    out.push(line);
  }
  return out.join("\n");
}

const DRIVER_NAME_PATTERN = "[A-Za-z][A-Za-z.'-]*(?:\\s+[A-Za-z][A-Za-z.'-]*){0,3}";

// Pulls whatever driver fields a single free-text line/clause states
// (age, experience, license state/class, DOB, sex, DL number, violations,
// name) into `d`, only ever setting a field that isn't already present.
// Shared by the numbered "Driver N: ..." parser and the unnumbered
// bulleted-list fallback so both recognize the same phrasing.
function applyDriverLineDetails(rest, d) {
  const namePattern = DRIVER_NAME_PATTERN;

  const ageMatch = rest.match(/age\s*[:\s]?\s*(\d+(?:\.\d+)?)/i) || rest.match(/\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*old\b/i);
  if (ageMatch && d.age === undefined) d.age = parseFloat(ageMatch[1]);

  const expMatch = rest.match(/(\d+)\s*years?\s*(?:CDL\s*)?experience/i);
  if (expMatch && d.experience === undefined) d.experience = `${expMatch[1]} Years`;

  const licMatch = rest.match(/\b([A-Z]{2})\s*Class\s*([A-Za-z0-9]+)\s*licen[sc]e/i);
  if (licMatch && d.licensestate === undefined) {
    d.licensestate = licMatch[1];
    d.licenseclasstype = `Class ${licMatch[2]}`;
  }

  const dobMatch = rest.match(/(?:DOB|Date of Birth)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (dobMatch && d.dob === undefined) d.dob = dobMatch[1];

  const sexMatch = rest.match(/\bSex\s*[:\-]?\s*(Male|Female|M|F)\b/i);
  if (sexMatch && d.sex === undefined) {
    const s = sexMatch[1].toUpperCase();
    d.sex = s.startsWith("M") ? "M" : "F";
  }

  const dlMatch = rest.match(/\bDL\s*(?:No\.?|Number)?\s*[:#]\s*([A-Za-z0-9-]+)/i)
    || rest.match(/(?:Driver'?s?\s*)?Licen[sc]e\s*(?:Number|#)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
  if (dlMatch && d.licenseNumber === undefined) d.licenseNumber = dlMatch[1].toUpperCase();

  const violationsMatch = rest.match(/(\d+)\s*(?:MVR\s*)?Violations?/i);
  if (violationsMatch && d.violations === undefined) d.violations = parseInt(violationsMatch[1], 10);

  // Name directly followed by a parenthetical DL number ("... 3 years CDL
  // experience, Salman Khan ( DL number: TX-DEMO-24001)") won't split
  // cleanly on commas since the name and "(DL..." share the last segment
  // — so this attaches to the name a comma-fallback below would miss.
  if (d.name === undefined) {
    const nameBeforeDl = rest.match(new RegExp(`(${namePattern})\\s*\\(\\s*DL`, "i"));
    if (nameBeforeDl) d.name = nameBeforeDl[1].trim();
  }

  if (d.name === undefined) {
    const segments = rest.split(",").map(s => s.trim()).filter(Boolean);
    const looksLikeName = (s) => !!s
      && !/^age\b/i.test(s)
      && !/^\d+(\.\d+)?\s*(years?|yrs?)?$/i.test(s)
      && s.length >= 2 && s.length <= 40
      && /^[A-Za-z .'-]+$/.test(s)
      && !/licen[sc]e|experience|class|cdl|\bdob\b|\bsex\b|\bdl\b|date of birth/i.test(s);
    // Name can lead the line ("Rahul Sharma, Age 24, ...") or trail it
    // ("Age 24, TX Class A license, 3 years CDL experience, Rahul Sharma").
    if (segments.length && looksLikeName(segments[0])) {
      d.name = segments[0];
    } else if (segments.length > 1 && looksLikeName(segments[segments.length - 1])) {
      d.name = segments[segments.length - 1];
    }
  }
  return d;
}

function extractDriverDetails(raw) {
  const details = {};
  if (!raw) return details;

  function ensure(idx) {
    if (!details[idx]) details[idx] = {};
    return details[idx];
  }

  const namePattern = DRIVER_NAME_PATTERN;

  const reNumberedNamed = new RegExp(`Driver\\s*(\\d+)\\s*Name\\s*[:\\-]\\s*(${namePattern})`, "gi");
  let m;
  while ((m = reNumberedNamed.exec(raw)) !== null) {
    ensure(parseInt(m[1], 10)).name = m[2].trim();
  }

  const reNumberedLine = /Driver\s*(\d+)\s*:\s*([^\n]+)/gi;
  while ((m = reNumberedLine.exec(raw)) !== null) {
    const idx = parseInt(m[1], 10);
    const rest = m[2].trim();
    applyDriverLineDetails(rest, ensure(idx));
  }

  if (Object.keys(details).length === 0) {
    const single = raw.match(new RegExp(`Driver\\s*Name\\s*[:\\-]\\s*(${namePattern})`, "i"));
    if (single) ensure(1).name = single[1].trim();
    const ageSingle = raw.match(/(?:^|\W)age\s*[:\s]?\s*(\d+(?:\.\d+)?)/i);
    if (ageSingle) ensure(1).age = parseFloat(ageSingle[1]);
  }

  // Fallback: the email never used the "Driver N:" numbering at all — parse
  // a bulleted/numbered list sitting under a "Drivers" / "Drivers I need
  // covered" section header instead, assigning sequential driver numbers in
  // the order the lines appear. Covers the common real-world case of a
  // driver schedule written as a plain bullet list with no per-line label.
  if (Object.keys(details).length === 0) {
    const section = extractSection(raw, /^\s*(?:Drivers?(?:\s+I\s+need\s+covered)?|Driver\s+Schedule)\s*:?\s*$/im);
    if (section) {
      const items = section.split(/\n/)
        .map(l => l.replace(/^\s*[-*•]\s*|^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      items.forEach((line, i) => {
        applyDriverLineDetails(line, ensure(i + 1));
      });
    }
  }

  return details;
}

// Parses the "Loss Run History" block into structured rows matching
// sub.losses' shape — one entry per line formatted
// "<year range>: <description> — <status> — $<amount> incurred". Accepts a
// plain hyphen or en dash as the separator too, not just an em dash — most
// pasted emails use "-" rather than the actual "—" character, and this
// used to silently extract zero losses whenever that was the case.
// Pulls a loss-run row out of a single free-text line — a year or year
// range, an optional description, an optional Closed/Open/Clean/Pending
// status word, and an optional $ amount. Only a year is required; everything
// else degrades to a sane default so a looser line (e.g. "2024: Minor fender
// damage, Closed, $4,200") still produces a usable row.
function parseLossLineDetails(line) {
  const rangeMatch = line.match(/\b(\d{4})\s*[-–—]\s*(\d{4})\b/);
  const yearMatch = rangeMatch || line.match(/\b(\d{4})\b/);
  if (!yearMatch) return null;
  const year = rangeMatch ? `${rangeMatch[1]} - ${rangeMatch[2]}` : yearMatch[1];

  const amountMatch = line.match(/\$\s*([\d,]+)\s*incurred/i) || line.match(/\$\s*([\d,]+)/);
  const statusMatch = line.match(/\b(Closed|Open|Clean|Pending|Reserved)\b/i);

  let rest = line.slice(line.indexOf(yearMatch[0]) + yearMatch[0].length).replace(/^[\s:,-]+/, "");
  let desc = rest.split(/\s*[-–—,]\s*|\$/)[0].trim();
  if (statusMatch) desc = desc.replace(new RegExp(statusMatch[0], "i"), "").trim();
  desc = desc.replace(/[-–—,\s]+$/, "").trim();

  return {
    year,
    desc: desc || "No description provided",
    status: statusMatch ? statusMatch[1].replace(/^\w/, c => c.toUpperCase()) : (amountMatch ? "Closed" : "Clean"),
    incurred: amountMatch ? `$${amountMatch[1]}` : "$0"
  };
}

function extractLossHistory(raw) {
  const losses = [];
  if (!raw) return losses;
  const re = /(\d{4}\s*-\s*\d{4}):\s*(.+?)\s+[-–—]\s+(.+?)\s+[-–—]\s+\$?([\d,]+)\s*incurred/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    losses.push({
      year: m[1].replace(/\s+/g, " ").trim(),
      desc: m[2].trim(),
      status: m[3].trim(),
      incurred: `$${m[4]}`
    });
  }

  // Fallback: the email never used the rigid "<year range>: <desc> —
  // <status> — $<amount> incurred" format — parse a bulleted/numbered list
  // under a "Loss Run History" / "Prior Losses" section header instead,
  // one row per line, each field best-effort.
  if (losses.length === 0) {
    const section = extractSection(raw, /^\s*(?:Loss Run History|Loss History|Prior Losses|Loss Runs?)\s*(?:\(.*\))?\s*:?\s*$/im);
    if (section) {
      section.split(/\n/)
        .map(l => l.replace(/^\s*[-*•]\s*|^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean)
        .forEach(line => {
          const parsed = parseLossLineDetails(line);
          if (parsed) losses.push(parsed);
        });
    }
  }

  return losses;
}

// Parses the "Vehicles" block into per-unit details, keyed by unit number
// (1-based) — "Unit <N>: <year> <make> <model> — Stated Value $<amount> —
// assigned to <driver>".
// Common commercial-vehicle body/type words that show up as the trailing
// words of a vehicle's model description (e.g. "Transit 350 Cargo Van",
// "M2 106 Box Truck") — used only to split an existing model description
// into model + type, never to invent a type that isn't actually there.
const VEHICLE_TYPE_KEYWORDS = [
  "Cargo Van", "Box Truck", "Pickup Truck", "Flatbed Truck", "Dump Truck",
  "Tractor Trailer", "Semi Tractor", "Refrigerated Truck", "Tanker Truck",
  "Step Van", "Sprinter Van", "Panel Van", "Van", "Truck", "Trailer", "Pickup", "Sedan", "SUV"
];
function extractVehicleTypeFromModel(modelText) {
  if (!modelText) return null;
  for (const kw of VEHICLE_TYPE_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b\\s*$`, "i");
    if (re.test(modelText)) return kw.replace(/\b\w/g, c => c.toUpperCase());
  }
  return null;
}

// Same dash-tolerant approach as extractLossHistory above — accepts a plain
// hyphen or en dash as the separator, not just an em dash, and uses a
// space-bounded dash as the actual delimiter so a mid-word hyphen in a
// model name (e.g. "M2-106") isn't mistaken for one.
// Pulls whatever vehicle fields a single free-text line/clause states (year,
// make/model, stated value, assigned driver) into a vehicle record. Stated
// value and assigned-driver are both optional — a line just needs a 4-digit
// year to be recognized as a vehicle at all.
function parseVehicleLineDetails(line) {
  const yearMatch = line.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;

  const valueMatch = line.match(/Stated Value\s*\$?\s*([\d,]+)/i) || line.match(/\$\s*([\d,]+)/);
  const assignedMatch = line.match(/assigned to\s*([^\n,;]+)/i);

  let makeModelText = line.slice(line.indexOf(yearMatch[0]) + yearMatch[0].length);
  makeModelText = makeModelText.split(/\s*[-–—,]\s*(?:Stated Value|assigned to)/i)[0]
    .replace(/^[\s:,-]+/, "")
    .trim();
  const makeModelParts = makeModelText.split(/\s+/).filter(Boolean);
  const model = makeModelParts.slice(1).join(" ");

  return {
    year: parseInt(yearMatch[0], 10),
    make: makeModelParts[0] || "",
    model: model,
    vehicle_type: extractVehicleTypeFromModel(model),
    stated_value: valueMatch ? parseInt(valueMatch[1].replace(/,/g, ""), 10) : null,
    assigned_driver: assignedMatch ? assignedMatch[1].trim() : null
  };
}

function extractVehicleDetails(raw) {
  const vehicles = {};
  if (!raw) return vehicles;

  const re = /(?:Unit|Vehicle)\s*(\d+)\s*:\s*([^\n]+)/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const parsed = parseVehicleLineDetails(m[2].trim());
    if (parsed) vehicles[parseInt(m[1], 10)] = parsed;
  }

  // Fallback: the email never used the "Unit N:" / "Vehicle N:" numbering at
  // all — parse a bulleted/numbered list sitting under a "Vehicles" / "Fleet"
  // section header instead, assigning sequential unit numbers in the order
  // the lines appear. Covers a plain bullet-list vehicle schedule with no
  // per-line label, which is the more common real-world email format.
  if (Object.keys(vehicles).length === 0) {
    const section = extractSection(raw, /^\s*(?:Vehicles?|Fleet|Vehicle\s+Schedule)\s*(?:\(.*\))?\s*:?\s*$/im);
    if (section) {
      const items = section.split(/\n/)
        .map(l => l.replace(/^\s*[-*•]\s*|^\s*\d+[.)]\s*/, "").trim())
        .filter(Boolean);
      let next = 1;
      items.forEach(line => {
        const parsed = parseVehicleLineDetails(line);
        if (parsed) vehicles[next++] = parsed;
      });
    }
  }

  return vehicles;
}

// Operations Profile — best-effort label-based extraction from free-form
// email text. Only ever fills a field the email actually states under
// that label; everything else stays absent ("Not Provided").
const OPERATIONS_PROFILE_FIELD_PATTERNS = {
  business_type: /Business Type\s*:\s*([^\n,]+)/i,
  years_in_business: /Years in Business\s*:\s*(\d+)/i,
  operating_authority: /Operating Authority\s*:\s*([^\n,]+)/i,
  interstate_intrastate: /Interstate\s*\/\s*Intrastate\s*:\s*([^\n,]+)/i,
  operating_radius: /Operating Radius\s*:\s*([\d,]+)\s*(?:miles)?/i,
  annual_mileage: /Annual Mileage\s*:\s*([\d,]+)/i,
  annual_revenue: /Annual Revenue\s*:\s*\$?\s*([\d,]+)/i,
  states_operated: /States Operated\s*:\s*([^\n]+)/i,
  primary_garaging_state: /Primary Garaging State\s*:\s*([A-Za-z ]+)/i,
  for_hire_private_carrier: /For-?Hire\s*\/\s*Private Carrier\s*:\s*([^\n,]+)/i,
  common_contract_carrier: /Common\s*\/\s*Contract Carrier\s*:\s*([^\n,]+)/i,
  owner_operator_usage: /Owner Operator Usage\s*:\s*([^\n,]+)/i,
  brokerage_operations: /Brokerage Operations\s*:\s*([^\n,]+)/i,
  hazmat_operations: /Hazmat Operations\s*:\s*([^\n,]+)/i
};

function extractOperationsProfileFromEmail(raw) {
  const profile = {};
  if (!raw) return profile;
  Object.keys(OPERATIONS_PROFILE_FIELD_PATTERNS).forEach(key => {
    const match = raw.match(OPERATIONS_PROFILE_FIELD_PATTERNS[key]);
    if (!match) return;
    let val = match[1].trim();
    if (key === "years_in_business" || key === "operating_radius" || key === "annual_mileage" || key === "annual_revenue") {
      val = Number(val.replace(/,/g, ""));
    } else if (key === "states_operated") {
      val = val.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
    profile[key] = val;
  });
  return profile;
}

// A structured Submission JSON (pasted alongside the email) is a more
// reliable source for these fields than regex guesswork — only recognized
// keys are pulled out, everything else in the pasted JSON is ignored.
function extractOperationsProfileFromJson(rawJsonText) {
  if (!rawJsonText) return {};
  try {
    const parsed = JSON.parse(rawJsonText);
    const source = parsed.operationsProfile || parsed.operations_profile || parsed;
    const profile = {};
    Object.keys(OPERATIONS_PROFILE_FIELD_PATTERNS).forEach(key => {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
        profile[key] = source[key];
      }
    });
    return profile;
  } catch (e) {
    return {}; // invalid/malformed JSON — silently ignored, never blocks the raw-text extraction
  }
}

// Extended Underwriting Workbench fields — Policy Information (expiration
// date, policy type, program, prior policy period), Assigned Underwriter,
// Coverages/Limits/Deductibles, UW rating add-ons (SAFER safety factor,
// driver pool counts, pollution risk, UW discretionary factor), Primary
// Commodity/Cargo Type, Endorsements, and per-record extras on vehicles/
// drivers/losses (VIN, body/weight/ownership, actuarial rating factors,
// base rate, item premium, driver tenure/status/factor, loss paid amount).
// A structured Submission JSON is the only reliable source for most of
// these (free-form email text rarely states a base rate or an ILF factor),
// so this reads directly from recognized JSON keys — nothing is invented
// when a key is absent.
function extractExtendedWorkbenchFieldsFromJson(rawJsonText) {
  if (!rawJsonText) return {};
  let parsed;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch (e) {
    return {};
  }
  const out = {};
  const genInfo = parsed.genInfo || {};
  if (genInfo.expiration_date) out.expirationDate = genInfo.expiration_date;
  if (genInfo.policytype || genInfo.policyType) out.policyType = genInfo.policytype || genInfo.policyType;
  if (genInfo.program || parsed.program) out.program = genInfo.program || parsed.program;
  if (parsed.priorPolicyPeriod || parsed.prior_policy_period) out.priorPolicyPeriod = parsed.priorPolicyPeriod || parsed.prior_policy_period;
  if (parsed.underwriter || parsed.assignedUnderwriter) out.assignedUnderwriter = parsed.underwriter || parsed.assignedUnderwriter;

  if (parsed.coveragesInfo && typeof parsed.coveragesInfo === "object") out.coveragesInfo = parsed.coveragesInfo;
  if (parsed.filingInfo && typeof parsed.filingInfo === "object") out.filingInfo = parsed.filingInfo;
  if (parsed.uwReviewInfo && typeof parsed.uwReviewInfo === "object") out.uwReviewInfo = parsed.uwReviewInfo;
  if (parsed.commoditiesInfo && typeof parsed.commoditiesInfo === "object") out.commoditiesInfo = parsed.commoditiesInfo;
  if (Array.isArray(parsed.endorsements)) out.endorsements = parsed.endorsements;

  // Per-unit / per-driver / per-loss extras, keyed the same way as the
  // vehicle/driver/loss arrays are ordered (index 0 = Unit 1 / Driver 1 /
  // first loss line) so they line up with whatever the email text (or this
  // same JSON) already established for that record.
  if (Array.isArray(parsed.vehicles)) out.vehicleExtras = parsed.vehicles;
  if (Array.isArray(parsed.drivers)) out.driverExtras = parsed.drivers;
  if (Array.isArray(parsed.losses)) out.lossExtras = parsed.losses;

  return out;
}

// The insured's name is never explicitly labeled in this email template —
// it's only the sign-off ("Thanks,\n<Name>" / "Regards,\n<Name>" / etc.).
function extractSignOffName(raw) {
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const closingIdx = lines.findIndex(l => /^(thanks|regards|best|sincerely|best regards|kind regards)[,]?$/i.test(l));
  const isPlausibleName = (s) => !!s && /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(s);
  if (closingIdx !== -1 && isPlausibleName(lines[closingIdx + 1])) return lines[closingIdx + 1];
  const last = lines[lines.length - 1];
  if (isPlausibleName(last) && !/^(thanks|regards|best|sincerely)/i.test(last)) return last;
  return null;
}

function buildLocalNormalizationDraft(sub) {
  const raw = sub.rawEmailText || "";
  const find = (pattern) => {
    const match = raw.match(pattern);
    return match ? match[1].trim() : null;
  };

  // Insured: this email template never labels it directly — it's the
  // sign-off name. Falls back to the old label-based patterns for emails
  // that don't follow the template.
  const insured = extractSignOffName(raw)
    || find(/(?:legal\s+(?:named\s+)?insured|insured\s+legal\s+entity|company\s+name|client)\s*(?:is|:|,)\s*([^\n,.]+(?:\s+(?:LLC|Inc\.?|Corp\.?|Corporation|Co\.?))?)/i)
    || find(/(?:for\s+coverage|for)\s*:\s*([^\n,.]+)/i);

  // Broker: this template addresses them directly in the greeting line
  // ("Hi Arora & Sons team,"), rather than a labeled "Broker:" field.
  const brokerGreetingMatch = raw.match(/^(?:Hi|Hello|Dear)\s+([^,\n]+?)(?:\s+team)?\s*,/im);
  const broker = (brokerGreetingMatch ? brokerGreetingMatch[1].trim() : null)
    || find(/(?:broker(?:\s+of\s+record)?|brokerage)\s*(?:is|:)\s*([^\n,.]+)/i);

  const email = find(/From:\s*[^<\n]*<([^>]+)>/i) || find(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/);
  const address = find(/Address\s*:\s*([^\n]+)/i);
  const effectiveDate = find(/Effective Date\s*:\s*([^\n]+)/i);
  const expirationDate = find(/Expiration Date\s*:\s*([^\n]+)/i);
  const policyType = find(/Policy Type\s*:\s*([^\n]+)/i);
  const program = find(/\bProgram\s*:\s*([^\n]+)/i);
  const priorPolicyPeriod = find(/Prior Policy Period\s*:\s*([^\n]+)/i);
  const assignedUnderwriter = find(/Assigned Underwriter\s*:\s*([^\n]+)/i);
  const primaryCommodity = find(/(?:Primary Commodity|Commodity(?:\s*\/\s*Cargo)?\s*Type|Cargo Type)\s*:\s*([^\n]+)/i);
  const fein = find(/\bFEIN\b\s*(?:\/\s*Tax\s*ID)?\s*[:#]?\s*([A-Z0-9-]+)/i);
  const dot = find(/\bDOT\b\s*(?:Number)?\s*#?\s*:?\s*([A-Z0-9-]+)/i);
  const mcNumber = find(/\bMC\b\s*(?:Number)?\s*#?\s*:?\s*(MC-?\d+|[A-Z0-9-]+)/i);
  const limit = find(/Requested Limit\s*\/?\s*TIV\s*\(\$\)\s*:\s*\$?\s*([\d,]+)/i)
    || find(/\$([\d,]+)\s*(?:requested\s+limit|limit)/i);
  const lobKey = sub.lobKey || (/(?:warehouse|building|contents|property)/i.test(raw) ? "property" : "trucking");
  const driverDetails = extractDriverDetails(raw);
  const lossHistory = extractLossHistory(raw);
  const vehicleDetails = extractVehicleDetails(raw);
  // Structured Submission JSON (if pasted) takes priority per-field over
  // best-effort email-text extraction.
  const operationsProfile = Object.assign(
    {},
    extractOperationsProfileFromEmail(raw),
    extractOperationsProfileFromJson(sub.rawSubmissionJsonText)
  );
  const extendedFromJson = extractExtendedWorkbenchFieldsFromJson(sub.rawSubmissionJsonText);
  const fields = { insured, fein, dot, mcNumber, broker, email, exposureVal: limit ? Number(limit.replace(/,/g, "")) : null };
  const confidence = {};
  Object.keys(fields).forEach(key => { if (fields[key] !== null) confidence[key] = "medium"; });
  const missing = ["insured", "fein"].filter(key => !fields[key]);
  if (lobKey === "trucking" && !fields.dot) missing.push("dot");
  return {
    lobKey,
    driverDetails,
    lossHistory,
    vehicleDetails,
    operationsProfile,
    ...fields,
    channelType: broker ? "broker" : "direct",
    address,
    effectiveDate,
    expirationDate: extendedFromJson.expirationDate || expirationDate,
    policyType: extendedFromJson.policyType || policyType,
    program: extendedFromJson.program || program,
    priorPolicyPeriod: extendedFromJson.priorPolicyPeriod || priorPolicyPeriod,
    assignedUnderwriter: extendedFromJson.assignedUnderwriter || assignedUnderwriter,
    primaryCommodity: primaryCommodity,
    coveragesInfo: extendedFromJson.coveragesInfo || null,
    filingInfo: extendedFromJson.filingInfo || null,
    uwReviewInfo: extendedFromJson.uwReviewInfo || null,
    commoditiesInfo: extendedFromJson.commoditiesInfo || null,
    endorsements: extendedFromJson.endorsements || null,
    vehicleExtras: extendedFromJson.vehicleExtras || null,
    driverExtras: extendedFromJson.driverExtras || null,
    lossExtras: extendedFromJson.lossExtras || null,
    coverageSummary: "Coverage requested in the captured submission; verify details.",
    lossHistorySummary: lossHistory.length ? `${lossHistory.length} prior loss(es) captured from email` : null,
    brokerNote: null,
    fields_confidence: confidence,
    missing_critical_fields: missing,
    needs_review: true,
    review_reasons: ["Local fallback requires verification", ...missing.map(key => `${key} is missing`)].slice(0, 3),
    _localFallback: true
  };
}

window.renderRawEmailCapturePanel = renderRawEmailCapturePanel;
window.toggleRawEmailView = toggleRawEmailView;

// ----------------------------------------------------------------------------
// 6. AI EXTRACTION (reads raw fields, writes nothing until confirmed)
// ----------------------------------------------------------------------------
async function runDocIngestionNormalization(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  const extractBtn = document.getElementById("docIngestExtractBtn");
  if (extractBtn) {
    extractBtn.disabled = true;
    extractBtn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Extracting & Normalizing...';
  }

  // This is a browser-only prototype with no backend: there is no server-side
  // proxy to hold an API key, and a direct browser fetch to api.anthropic.com
  // is blocked by CORS/auth regardless. Rather than always failing and
  // falling back silently, run the same field-extraction logic synchronously
  // as the actual (simulated) ingestion pipeline, with a brief delay so the
  // "Extracting & Normalizing..." state is visible.
  try {
    await new Promise(resolve => setTimeout(resolve, 900));
    const draft = buildLocalNormalizationDraft(sub);
    emailIngestionDraftBySubId[subId] = draft;
    // Show the extracted data as a review form first — nothing is applied
    // to the submission yet. Blank fields (nothing found in the email/JSON)
    // are flagged with a visible error. The form's own "Confirm & Apply
    // Standard Data" button is what actually runs applyNormalizedDataToSubmission()
    // — the same function this used to call immediately, just now gated
    // behind the underwriter reviewing the draft first.
    renderNormalizationReview(subId, draft);
  } catch (err) {
    showToast("❌ Document Ingestion failed: " + err.message, "danger");
  } finally {
    const btn = document.getElementById("docIngestExtractBtn");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-sparkle"></i> Run AI Document Ingestion (Normalize)';
    }
  }
}

window.runDocIngestionNormalization = runDocIngestionNormalization;

function confBadge(conf) {
  const map = {
    high: '<span class="badge badge-success email-digest-conf-badge">High Confidence</span>',
    medium: '<span class="badge badge-warning email-digest-conf-badge">Medium — Verify</span>',
    low: '<span class="badge badge-danger email-digest-conf-badge">Low — Needs Review</span>',
    edited: '<span class="badge badge-info email-digest-conf-badge"><i class="ph ph-pencil-simple"></i> Manually Verified</span>'
  };
  return map[conf] || '<span class="badge badge-light email-digest-conf-badge">Unscored</span>';
}

// When the underwriter/worker fixes a field in the review draft, its
// confidence badge should stop claiming "Low — Needs Review" (or whatever
// the AI originally scored it) and instead show that a human has now
// verified/corrected it — reverting back to the original AI badge if the
// value is edited back to what the AI originally extracted.
function handleNormFieldEdit(key, inputEl) {
  const badgeEl = document.getElementById(`confBadge_${key}`);
  if (badgeEl) {
    const original = inputEl.dataset.originalValue || "";
    const edited = inputEl.value !== original;
    badgeEl.innerHTML = edited ? confBadge("edited") : confBadge(inputEl.dataset.originalConf);
  }

  // Live-clear the blank-field error the moment the underwriter types a
  // value in; re-show it if they clear the field back out.
  const errorEl = inputEl.parentElement ? inputEl.parentElement.querySelector(".field-error-text") : null;
  const isBlank = inputEl.value.trim() === "";
  inputEl.classList.toggle("is-invalid", isBlank);
  if (errorEl) errorEl.classList.toggle("u-hidden", !isBlank);
  if (inputEl.parentElement) inputEl.parentElement.classList.toggle("email-digest-field-row--blank", isBlank);

  updateNormalizationProgress();
}
window.handleNormFieldEdit = handleNormFieldEdit;

// Purely cosmetic: keeps the "N of M fields filled" progress bar/label in
// the review header in sync as the underwriter edits fields, without
// touching any validation or apply logic.
function updateNormalizationProgress() {
  const inputs = document.querySelectorAll('#emailDigestReviewContainer .email-digest-field-grid input[id^="normField_"]');
  if (!inputs.length) return;
  const total = inputs.length;
  const filled = Array.from(inputs).filter(el => el.value.trim() !== "").length;

  const fill = document.querySelector("#emailDigestReviewContainer .email-digest-progress-fill");
  if (fill) fill.style.width = `${Math.round((filled / total) * 100)}%`;

  const label = document.querySelector("#emailDigestReviewContainer .email-digest-progress-label");
  if (label) {
    const blank = total - filled;
    label.innerHTML = `<i class="ph ph-list-checks"></i> ${filled} of ${total} fields filled` +
      (blank > 0 ? ` <span class="text-danger">— ${blank} need attention</span>` : ` <span class="text-success">— all set</span>`);
  }
}

function renderNormalizationReview(subId, draft) {
  const reviewBox = document.getElementById("emailDigestReviewContainer");
  const dupeBanner = document.getElementById("emailDigestDupeBanner");
  if (!reviewBox) return;

  const fc = draft.fields_confidence || {};
  const REQUIRED_KEYS = new Set(["insured", "fein", "address", "email", "exposureVal", "effectiveDate"]);
  // Grouped into logical sections instead of one flat list — matches how an
  // underwriter actually scans a submission (who they are, how to reach
  // them, what they want covered).
  const fieldSections = [
    { title: "Business Identity", icon: "ph-buildings", fields: [
      ["insured", "Named Insured"],
      ["fein", "FEIN / Tax ID"],
      ["dot", "DOT Number"],
      ["mcNumber", "MC Number"],
      ["address", "Address"]
    ]},
    { title: "Broker & Contact", icon: "ph-user-circle", fields: [
      ["broker", "Broker / Agency"],
      ["email", "Contact Email"]
    ]},
    { title: "Coverage & Financials", icon: "ph-currency-dollar", fields: [
      ["exposureVal", "Requested Limit / TIV ($)"],
      ["effectiveDate", "Effective Date"]
    ]}
  ];
  const fieldRows = fieldSections.flatMap(s => s.fields);

  let blankCount = 0;
  const fieldRowHtml = ([key, label]) => {
    const val = draft[key] === null || draft[key] === undefined ? "" : draft[key];
    const conf = fc[key] || (val ? "medium" : "low");
    const safeVal = String(val).replace(/"/g, '&quot;');
    // Blank field = nothing found in the email/JSON for this field — flagged
    // visibly (not just the confidence badge) so it's obvious before
    // applying, same pattern as every other required-field validation in
    // this app (showFieldError/clearFieldError + field-error-text span).
    const isBlank = val === "" || val === null || val === undefined;
    if (isBlank) blankCount++;
    const isRequired = REQUIRED_KEYS.has(key);
    return `
      <div class="email-digest-field-row ${isBlank ? 'email-digest-field-row--blank' : ''}">
        <label>${label}${isRequired ? ' <span class="email-digest-required-mark">*</span>' : ''} <span id="confBadge_${key}">${confBadge(conf)}</span></label>
        <input type="text" class="form-control form-control-sm ${isBlank ? 'is-invalid' : ''}" id="normField_${key}" value="${safeVal}" data-original-value="${safeVal}" data-original-conf="${conf}" oninput="handleNormFieldEdit('${key}', this)">
        <span class="field-error-text ${isBlank ? '' : 'u-hidden'}">Not found in the email/JSON — enter it manually or leave blank if genuinely not provided.</span>
      </div>`;
  };

  const sectionsHtml = fieldSections.map(section => `
    <div class="email-digest-section">
      <div class="email-digest-section-title"><i class="ph ${section.icon}"></i> ${section.title}</div>
      <div class="email-digest-field-grid">${section.fields.map(fieldRowHtml).join("")}</div>
    </div>
  `).join("");
  const filledCount = fieldRows.length - blankCount;

  const dedupeMatch = findDuplicateSubmission(draft.insured, draft.fein, subId);
  if (dupeBanner) {
    if (dedupeMatch) {
      dupeBanner.style.display = "flex";
      dupeBanner.innerHTML = `
        <i class="ph ph-warning-circle"></i>
        <div>
          <strong>Possible duplicate:</strong> matches existing submission
          <strong>${dedupeMatch.id}</strong> (${dedupeMatch.insured}) already in the intake queue.
          Review before applying to avoid a duplicate case file.
        </div>`;
    } else {
      dupeBanner.style.display = "none";
      dupeBanner.innerHTML = "";
    }
  }

  const reviewReasons = draft.review_reasons || [];
  const reviewFlagHtml = draft.needs_review
    ? `<div class="email-digest-needs-review-flag">
         <div class="email-digest-flag-title"><i class="ph ph-flag"></i> Flagged for Human Review</div>
         ${reviewReasons.length
           ? `<ul class="email-digest-flag-list">${reviewReasons.map(r => `<li>${r}</li>`).join("")}</ul>`
           : `<span class="text-xs">One or more fields have low confidence.</span>`}
       </div>`
    : `<div class="email-digest-clean-flag"><i class="ph ph-check-circle"></i> No blocking issues detected — high confidence across required fields.</div>`;

  reviewBox.style.display = "block";
  reviewBox.innerHTML = `
    <div class="email-digest-toolbar">
      <div class="email-digest-toolbar-progress">
        <div class="email-digest-progress-bar" title="${filledCount} of ${fieldRows.length} fields have a value">
          <div class="email-digest-progress-fill" style="width:${Math.round((filledCount / fieldRows.length) * 100)}%;"></div>
        </div>
        <div class="email-digest-progress-label">
          <i class="ph ph-list-checks"></i> ${filledCount} of ${fieldRows.length} fields filled
          ${blankCount > 0 ? `<span class="text-danger">— ${blankCount} need attention</span>` : `<span class="text-success">— all set</span>`}
        </div>
      </div>
      <div class="form-group email-digest-lob-field">
        <label>Line of Business</label>
        <select class="form-control form-control-sm" id="normField_lobKey">
          ${EMAIL_DIGEST_LOB_TEMPLATES.map(l => `<option value="${l}" ${l === draft.lobKey ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
    </div>

    ${reviewFlagHtml}

    ${sectionsHtml}

    <div class="email-digest-section">
      <div class="email-digest-section-title"><i class="ph ph-note-pencil"></i> Notes</div>
      <div class="email-digest-field-row email-digest-field-row--wide">
        <label>Coverage Summary</label>
        <textarea class="form-control form-control-sm" id="normField_coverageSummary" rows="2" placeholder="e.g. Auto liability, cargo, and general liability requested...">${draft.coverageSummary || ""}</textarea>
      </div>
      <div class="email-digest-field-row email-digest-field-row--wide">
        <label>Loss History Summary</label>
        <textarea class="form-control form-control-sm" id="normField_lossHistorySummary" rows="2" placeholder="e.g. No losses reported in the last 3 years...">${draft.lossHistorySummary || ""}</textarea>
      </div>
    </div>

    <div class="modal-footer email-digest-review-footer mt-3" style="margin: 16px 0 0 0; padding: 0;">
      <div class="email-digest-review-footer-left">
        <button type="button" class="btn btn-outline" onclick="discardNormalizationDraft('${subId}')"><i class="ph ph-arrow-counter-clockwise"></i> Discard Draft</button>
        <button type="button" class="btn btn-outline text-danger" style="border-color:var(--color-danger,#dc3545);" onclick="openMissingFieldsModal('${subId}')">
          <i class="ph ph-warning-circle"></i> Request Missing Information
        </button>
      </div>
      <button type="button" class="btn btn-primary" onclick="applyNormalizedDataToSubmission('${subId}')">
        <i class="ph ph-cloud-arrow-up"></i> Confirm & Apply Standard Data
      </button>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// 6b. REQUEST MISSING INFORMATION — lets the underwriter pick which blank/
//     low-confidence fields to chase down, and from whom (broker or
//     customer), without blocking the Confirm & Apply action. Prototype only:
//     "sending" the request just confirms via toast, no email is dispatched.
// ----------------------------------------------------------------------------
const MISSING_FIELD_DEFS = [
  { key: "insured", label: "Named Insured", required: true, requestTo: "Broker / Agency" },
  { key: "fein", label: "FEIN / Tax ID", required: true, requestTo: "Customer" },
  { key: "dot", label: "DOT Number", required: false, requestTo: "Broker / Agency" },
  { key: "mcNumber", label: "MC Number", required: false, requestTo: "Broker / Agency" },
  { key: "address", label: "Address", required: true, requestTo: "Customer" },
  { key: "broker", label: "Broker / Agency Name", required: false, requestTo: "Broker / Agency" },
  { key: "email", label: "Contact Email", required: true, requestTo: "Broker / Agency" },
  { key: "exposureVal", label: "Requested Limit / TIV ($)", required: true, requestTo: "Customer" },
  { key: "effectiveDate", label: "Effective Date", required: true, requestTo: "Customer" },
  { key: "coverageSummary", label: "Coverage Summary", required: false, requestTo: "Broker / Agency" },
  { key: "lossHistorySummary", label: "Loss History Summary", required: true, requestTo: "Customer" },
  { key: "additionalDriverDetails", label: "Additional Driver Details", required: false, requestTo: "Broker / Agency" }
];

let missingFieldsModalSubId = null;

function getCurrentFieldValue(key) {
  const el = document.getElementById(`normField_${key}`);
  if (el) return el.value.trim();
  const draft = emailIngestionDraftBySubId[missingFieldsModalSubId] || {};
  const v = draft[key];
  return v === null || v === undefined ? "" : String(v).trim();
}

function openMissingFieldsModal(subId) {
  missingFieldsModalSubId = subId;
  const missing = MISSING_FIELD_DEFS.filter(f => !getCurrentFieldValue(f.key));

  const body = document.getElementById("missingFieldsTableBody");
  if (body) {
    body.innerHTML = missing.length
      ? missing.map(f => `
        <tr>
          <td><input type="checkbox" class="missing-field-checkbox" data-key="${f.key}" data-request-to="${f.requestTo}" ${f.required ? "checked" : ""} onchange="updateMissingFieldsSelectedCount()"></td>
          <td>${f.label}</td>
          <td class="text-muted">—</td>
          <td>${f.required ? '<span class="text-danger" style="font-weight:600;">Yes</span>' : '<span class="text-muted">No</span>'}</td>
          <td>${f.requestTo}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="text-center text-muted" style="padding:16px;">No missing fields detected — everything required has a value.</td></tr>`;
  }

  updateMissingFieldsSelectedCount();
  const modal = document.getElementById("missingFieldsModal");
  if (modal) modal.classList.add("active");
}

function closeMissingFieldsModal() {
  const modal = document.getElementById("missingFieldsModal");
  if (modal) modal.classList.remove("active");
  missingFieldsModalSubId = null;
}

function updateMissingFieldsSelectedCount() {
  const count = document.querySelectorAll(".missing-field-checkbox:checked").length;
  const countEl = document.getElementById("missingFieldsSelectedCount");
  if (countEl) countEl.textContent = String(count);
  const btn = document.getElementById("missingFieldsRequestBtn");
  if (btn) btn.disabled = count === 0;
}

function sendMissingFieldsRequest() {
  const checked = Array.from(document.querySelectorAll(".missing-field-checkbox:checked"));
  if (!checked.length) return;

  const byRecipient = {};
  checked.forEach(cb => {
    const to = cb.getAttribute("data-request-to");
    byRecipient[to] = (byRecipient[to] || 0) + 1;
  });
  const summary = Object.entries(byRecipient).map(([to, n]) => `${n} to ${to}`).join(", ");

  showToast(`📨 Missing information request sent — ${summary}.`, "success");
  closeMissingFieldsModal();
}

window.openMissingFieldsModal = openMissingFieldsModal;
window.closeMissingFieldsModal = closeMissingFieldsModal;
window.updateMissingFieldsSelectedCount = updateMissingFieldsSelectedCount;
window.sendMissingFieldsRequest = sendMissingFieldsRequest;

function discardNormalizationDraft(subId) {
  delete emailIngestionDraftBySubId[subId];
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (sub) renderRawEmailCapturePanel(sub);
}

window.discardNormalizationDraft = discardNormalizationDraft;

// Fuzzy dedupe: exact FEIN match, or normalized-name substring match.
// Excludes the submission being normalized itself.
function findDuplicateSubmission(insuredName, fein, excludeId) {
  if (typeof SUBMISSIONS_DATASET === "undefined") return null;
  const normName = (insuredName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normName && !fein) return null;
  return SUBMISSIONS_DATASET.find(s => {
    if (s.id === excludeId) return false;
    const sFein = (s.fein || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const sName = (s.insured || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const feinMatch = fein && sFein && sFein === fein.toLowerCase().replace(/[^a-z0-9]/g, "");
    const nameMatch = normName && sName && (sName.includes(normName) || normName.includes(sName)) && normName.length > 3;
    return feinMatch || nameMatch;
  }) || null;
}

// ----------------------------------------------------------------------------
// 7. APPLY — writes cleaned Standard Data onto the submission's normal
//    fields. Deliberately never touches sub.rawEmailText / sub.rawAttachments.
// ----------------------------------------------------------------------------
function applyNormalizedDataToSubmission(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  const draft = emailIngestionDraftBySubId[subId];
  if (!sub || !draft) return;

  // The review-form fields (normField_*) only exist when the draft was
  // rendered for manual review/editing. Ingestion now applies the draft
  // immediately without ever rendering that review form, so fall back to
  // the draft's own values whenever the corresponding input isn't on the
  // page.
  const getVal = (id, draftKey) => {
    const el = document.getElementById(id);
    if (el) return el.value.trim();
    const v = draft[draftKey];
    return v === null || v === undefined ? "" : String(v);
  };

  const lobKey = getVal("normField_lobKey", "lobKey") || sub.lobKey;
  const insured = getVal("normField_insured", "insured") || "Unnamed Entity (Needs Review)";
  const fein = getVal("normField_fein", "fein") || "PENDING-VERIFICATION";
  const dot = getVal("normField_dot", "dot");
  const mcNumber = getVal("normField_mcNumber", "mcNumber");
  const address = getVal("normField_address", "address");
  const broker = getVal("normField_broker", "broker") || "Direct / Unassigned Producer";
  const email = getVal("normField_email", "email");
  const exposureRaw = getVal("normField_exposureVal", "exposureVal");
  const exposureVal = parseFloat(exposureRaw.replace(/[^0-9.]/g, "")) || 0;
  const coverageSummary = getVal("normField_coverageSummary", "coverageSummary");
  const lossHistorySummary = getVal("normField_lossHistorySummary", "lossHistorySummary");

  const needsReview = !!draft.needs_review || fein === "PENDING-VERIFICATION";

  // --- Standard / structured fields — these are what get overwritten. ---
  sub.lobKey = lobKey;
  const lobCatalogEntry = (typeof LOB_CATALOG !== "undefined") ? LOB_CATALOG.find(l => l.key === lobKey) : null;
  if (lobCatalogEntry) sub.lobName = lobCatalogEntry.name;
  sub.insured = insured;
  sub.fein = fein;
  if (dot) sub.dot = dot;
  if (mcNumber) sub.mcNumber = mcNumber;
  if (address) sub.address = address;
  // Effective Date was extracted into the draft but never actually written
  // back onto the submission — Applicant/Policy Information's Effective
  // Date field stayed blank even when the email clearly stated it.
  const effectiveDateVal = getVal("normField_effectiveDate", "effectiveDate");
  if (effectiveDateVal) {
    sub.effectiveDate = effectiveDateVal;
    if (!sub.genInfo) sub.genInfo = {};
    if (!sub.genInfo.effective_date) sub.genInfo.effective_date = effectiveDateVal;
  }

  // --- Policy Information card: Expiration Date, Policy Type, Program,
  // Prior Policy Period. Assigned Underwriter (UW Tag / Summary Strip).
  // Primary Commodity/Cargo Type. Only set when the email text or the
  // structured Submission JSON actually stated it. ---
  if (!sub.genInfo) sub.genInfo = {};
  if (draft.expirationDate) {
    sub.expirationDate = draft.expirationDate;
    if (!sub.genInfo.expiration_date) sub.genInfo.expiration_date = draft.expirationDate;
  }
  if (draft.policyType && !sub.genInfo.policytype) sub.genInfo.policytype = draft.policyType;
  if (draft.program && !sub.program) sub.program = draft.program;
  if (draft.priorPolicyPeriod && !sub.priorPolicyPeriod) sub.priorPolicyPeriod = draft.priorPolicyPeriod;
  if (draft.assignedUnderwriter && !sub.underwriter) sub.underwriter = draft.assignedUnderwriter;
  if (draft.primaryCommodity) {
    if (!sub.commoditiesInfo) sub.commoditiesInfo = {};
    if (!sub.commoditiesInfo.secondary_class) sub.commoditiesInfo.secondary_class = draft.primaryCommodity;
  }

  // --- Structured-JSON-only extras: Coverages/Limits/Deductibles, UW rating
  // add-ons (SAFER factor, driver pool counts, pollution risk, UW
  // discretionary factor), full Commodities info, Endorsements. Merged
  // (not replaced) so anything already set (e.g. commoditiesInfo above)
  // isn't clobbered by an absent JSON key. ---
  if (draft.coveragesInfo) sub.coveragesInfo = Object.assign({}, sub.coveragesInfo, draft.coveragesInfo);
  if (draft.filingInfo) sub.filingInfo = Object.assign({}, sub.filingInfo, draft.filingInfo);
  if (draft.uwReviewInfo) sub.uwReviewInfo = Object.assign({}, sub.uwReviewInfo, draft.uwReviewInfo);
  if (draft.commoditiesInfo) sub.commoditiesInfo = Object.assign({}, sub.commoditiesInfo, draft.commoditiesInfo);
  if (draft.endorsements) sub.endorsements = draft.endorsements;

  sub.broker = broker;
  sub.email = email || sub.email;
  sub.channelType = draft.channelType === "direct" ? "direct" : "broker";
  sub.channelName = sub.channelType === "direct"
    ? "Direct Customer Portal (Email → AI-Normalized)"
    : `Broker Intake: ${broker} (Email → AI-Normalized)`;
  sub.exposureVal = exposureVal || sub.exposureVal;
  sub.exposure = exposureVal ? `$${exposureVal.toLocaleString()}` : sub.exposure;

  sub.priority = needsReview ? "P2" : "P1";
  sub.priorityScore = needsReview ? 70 : 92;
  sub.slaText = needsReview ? "Manual Review Required" : "4h Fast-Track SLA";
  sub.slaCountdown = needsReview ? "Pending underwriter triage" : "4h 00m remaining";
  const reviewReasons = draft.review_reasons || [];
  sub.priorityReason = needsReview
    ? `AI-Normalized from Raw Email • Needs Review (${reviewReasons.length} item${reviewReasons.length === 1 ? '' : 's'}): ${reviewReasons.slice(0, 2).join("; ")}${reviewReasons.length > 2 ? "…" : ""}`
    : "AI-Normalized from Raw Email • High-Confidence Extraction • Fast-Track FIFO Position #1";
  sub.statusText = needsReview ? "Needs Review (AI-Normalized)" : "Intake Ingested (AI-Normalized)";
  sub.statusBadge = needsReview ? "badge-warning" : "badge-primary";

  // Confidence trail as OCR-style rows, alongside (not replacing) whatever
  // was already there.
  const confidenceOcrRows = Object.entries(draft.fields_confidence || {}).map(([k, v]) => ({
    key: `Email Extraction: ${k}`,
    val: String(draft[k] ?? "—"),
    conf: v === "high" ? "99%+ (AI High-Confidence)" : v === "medium" ? "~70% (AI Medium-Confidence)" : "Low — Manual Verification Required",
    source: "AI Document Ingestion (from Raw Email)"
  }));
  sub.ocrFields = [...confidenceOcrRows, ...(sub.ocrFields || [])];

  sub.canonicalJson = Object.assign({}, sub.canonicalJson, {
    submission_id: sub.id,
    source_channel: "Email Intake → AI Document Ingestion (Normalized)",
    status: needsReview ? "normalized_needs_review" : "normalized",
    applicant: Object.assign({}, sub.canonicalJson?.applicant, {
      legal_name: insured,
      fein: fein,
      dot_number: dot || sub.canonicalJson?.applicant?.dot_number
    }),
    ai_extraction_meta: {
      needs_review: needsReview,
      missing_critical_fields: draft.missing_critical_fields || [],
      review_reasons: draft.review_reasons || [],
      coverage_summary: coverageSummary,
      loss_history_summary: lossHistorySummary
    }
  });

  // --- Driver details captured from the raw email itself (Drivers Schedule
  // & Verification Status, and therefore the Minimum Driver Age eligibility
  // check, reflect this email's actual drivers — not the cloned LOB
  // template's placeholder ones). Only fields the email actually stated are
  // overwritten; anything not mentioned (dob, sex, license number, tenure,
  // status, driver_factor) stays as cloned from the template. If the email
  // names more drivers than the template had, new driver rows are added —
  // the submission's driver count is driven by the email, not the template. ---
  if (draft.driverDetails && Object.keys(draft.driverDetails).length) {
    if (!sub.drivers) sub.drivers = [];
    const templateDriverShape = sub.drivers[0] || {};
    Object.keys(draft.driverDetails).forEach(driverNum => {
      const idx = parseInt(driverNum, 10) - 1;
      if (idx < 0) return;
      const d = draft.driverDetails[driverNum];

      while (sub.drivers.length <= idx) {
        sub.drivers.push(Object.assign({}, templateDriverShape, {
          id: `DRV-${sub.drivers.length + 1}`,
          given_name: null, last_name: null, age: null, dob: null, sex: null,
          licenseNumber: null, licensestate: null, licenseclasstype: null,
          experience: null, tenure: null, status: "Pending Verification", driver_factor: null
        }));
      }
      const driverRecord = sub.drivers[idx];

      if (d.name) {
        const nameParts = d.name.trim().split(/\s+/);
        driverRecord.given_name = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : nameParts[0];
        driverRecord.last_name = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
      }
      if (d.age !== undefined) driverRecord.age = d.age;
      if (d.experience !== undefined) driverRecord.experience = d.experience;
      if (d.licensestate !== undefined) driverRecord.licensestate = d.licensestate;
      if (d.licenseclasstype !== undefined) driverRecord.licenseclasstype = d.licenseclasstype;
      if (d.dob !== undefined) driverRecord.dob = d.dob;
      if (d.sex !== undefined) driverRecord.sex = d.sex;
      if (d.licenseNumber !== undefined) driverRecord.licenseNumber = d.licenseNumber;
      if (d.violations !== undefined) driverRecord.violations = d.violations;
    });

    // Minimum Driver Age eligibility (Underwriting Workbench) must re-check
    // against these email-sourced ages the moment they land — never leave
    // it showing eligibility computed off the old template ages.
    sub.driverAgeGuardrail = undefined;
  }
  // Per-driver Tenure / Status / Driver Factor — only ever present in a
  // structured Submission JSON, matched to the same driver by array
  // position (Driver 1 = index 0, matching the "Driver N" numbering the
  // email itself uses).
  if (draft.driverExtras && sub.drivers && sub.drivers.length) {
    draft.driverExtras.forEach((extra, idx) => {
      if (!extra || !sub.drivers[idx]) return;
      if (extra.tenure !== undefined) sub.drivers[idx].tenure = extra.tenure;
      if (extra.status !== undefined) sub.drivers[idx].status = extra.status;
      if (extra.driver_factor !== undefined) sub.drivers[idx].driver_factor = extra.driver_factor;
    });
  }

  // --- Loss history captured from the "Loss Run History" block — replaces
  // the cloned template's losses entirely, since these are this submission's
  // actual prior losses, not the template's placeholder ones. ---
  if (draft.lossHistory && draft.lossHistory.length) {
    sub.losses = draft.lossHistory;
  }
  // Paid Amount per loss — only ever present in a structured Submission
  // JSON (never labeled in the free-form email text), matched to the same
  // loss row by position.
  if (draft.lossExtras && sub.losses && sub.losses.length) {
    draft.lossExtras.forEach((extra, idx) => {
      if (sub.losses[idx] && extra && extra.paid !== undefined) sub.losses[idx].paid = extra.paid;
    });
  }

  // --- Vehicle details captured from the "Vehicles" block. Only the fields
  // the email actually stated are overwritten (year/make/model/stated
  // value/assigned driver) — every rating-specific field (base rate,
  // factors, etc.) stays as cloned from the template. New vehicle rows are
  // added if the email names more units than the template had. ---
  if (draft.vehicleDetails && Object.keys(draft.vehicleDetails).length) {
    if (!sub.vehicles) sub.vehicles = [];
    const templateVehicleShape = sub.vehicles[0] || {};
    Object.keys(draft.vehicleDetails).forEach(unitNum => {
      const idx = parseInt(unitNum, 10) - 1;
      if (idx < 0) return;
      const v = draft.vehicleDetails[unitNum];

      while (sub.vehicles.length <= idx) {
        sub.vehicles.push(Object.assign({}, templateVehicleShape, {
          id: Date.now() + sub.vehicles.length,
          xid: sub.vehicles.length + 1
        }));
      }
      const vehicleRecord = sub.vehicles[idx];
      vehicleRecord.year = v.year;
      vehicleRecord.make = v.make;
      vehicleRecord.model = v.model;
      vehicleRecord.stated_value = v.stated_value;
      vehicleRecord.assigned_driver = v.assigned_driver;
      if (v.vehicle_type) vehicleRecord.vehicle_type = v.vehicle_type;
    });
  }
  // Per-unit rating/actuarial extras (VIN, model number, weight, ownership,
  // miles driven, base rate, AL value, rating class, ILF/LCM/fleet/age/
  // radius factors, item premium) — only ever present in a structured
  // Submission JSON, matched to the same vehicle by array position (Unit 1
  // = index 0, matching the "Unit N" numbering the email itself uses).
  if (draft.vehicleExtras && sub.vehicles && sub.vehicles.length) {
    const vehicleExtraFields = [
      "vin", "model_number", "weight", "ownership", "miles_driven", "radius_miles",
      "liab_baserate", "al_value", "rating_class", "liab_ilf_factor", "liab_lcm_factor",
      "liab_fleet_factor", "vehicle_age_factor", "radius_factor",
      "liability_premium", "al_premium_wo_mod_factor"
    ];
    draft.vehicleExtras.forEach((extra, idx) => {
      if (!extra || !sub.vehicles[idx]) return;
      vehicleExtraFields.forEach(f => {
        if (extra[f] !== undefined && extra[f] !== null && extra[f] !== "") sub.vehicles[idx][f] = extra[f];
      });
    });
  }

  // --- Operations Profile — Business Type, Years in Business, Operating
  // Authority, Interstate/Intrastate, Operating Radius, Annual Mileage,
  // Annual Revenue, States Operated, Primary Garaging State, For-Hire/
  // Private Carrier, Common/Contract Carrier, Owner Operator Usage,
  // Brokerage Operations, Hazmat Operations. Only fields the structured
  // Submission JSON or the raw email text actually provided are set. ---
  if (draft.operationsProfile && Object.keys(draft.operationsProfile).length) {
    sub.operationsProfile = Object.assign({}, sub.operationsProfile, draft.operationsProfile);

    // Keep insuredInfo.insured_garaging_state (used across the Workbench —
    // Summary Strip's State field, jurisdiction-based appetite rules, etc.)
    // in sync with the same real value, so the same fact isn't shown
    // differently in different places.
    if (draft.operationsProfile.primary_garaging_state) {
      if (!sub.insuredInfo) sub.insuredInfo = {};
      if (!sub.insuredInfo.insured_garaging_state) {
        sub.insuredInfo.insured_garaging_state = draft.operationsProfile.primary_garaging_state;
      }
    }

    // Keep radiusOfOperationsInfo.radius/Intrastate_interstate (used by the
    // Questionnaire panel, the Operational Profile & Rating Factors tile,
    // and the Vehicles Schedule) in sync with the same real Operating
    // Radius value, so it shows consistently everywhere on the page.
    if (draft.operationsProfile.operating_radius !== undefined) {
      if (!sub.radiusOfOperationsInfo) sub.radiusOfOperationsInfo = {};
      if (sub.radiusOfOperationsInfo.radius === undefined) {
        sub.radiusOfOperationsInfo.radius = draft.operationsProfile.operating_radius;
      }
    }
    if (draft.operationsProfile.interstate_intrastate) {
      if (!sub.radiusOfOperationsInfo) sub.radiusOfOperationsInfo = {};
      if (!sub.radiusOfOperationsInfo.Intrastate_interstate) {
        sub.radiusOfOperationsInfo.Intrastate_interstate = draft.operationsProfile.interstate_intrastate;
      }
    }
  }

  // --- Appetite Rules (Step 7) are built from whichever product was last
  // ingested via the Integrating API, now that this submission's real
  // drivers/vehicles exist — this is what actually applies the ingested
  // product's eligibility/underwriting rules (e.g. Minimum Driver Age, one
  // row per driver) to this email-sourced submission. Never fabricated:
  // if no product has been ingested yet, this stays empty. ---
  const activeProduct = window.ACTIVE_INSURANCE_PRODUCT || (typeof ACTIVE_INSURANCE_PRODUCT !== "undefined" ? ACTIVE_INSURANCE_PRODUCT : null);
  if (activeProduct && typeof buildProductAppetiteRules === "function") {
    sub.appetiteRules = buildProductAppetiteRules(activeProduct, sub);
  }

  // --- Intake Questionnaire (Underwriting Workbench) — the QUESTIONS come
  // from the ingested product's own questionnaire/riskAttributes schema
  // (what to ask), the ANSWERS come only from this submission's real data
  // (findAnswer() inside mapQuestionnaireFromProduct reads sub.vehicles/
  // drivers/losses/etc. and returns null — "Not Provided" — for anything
  // not actually known). Nothing here is fabricated; if the product
  // declares no questionnaire, sub.questionnaireGroups is left unset and
  // the Workbench falls back to its static default question list. ---
  if (activeProduct && typeof mapQuestionnaireFromProduct === "function") {
    mapQuestionnaireFromProduct(activeProduct, sub);
  }

  // --- Bookkeeping — rawEmailText / rawAttachments are intentionally NOT
  // referenced or modified anywhere above. ---
  sub.normalizationStatus = needsReview ? "needs_review" : "normalized";
  sub.normalizedMeta = { normalizedAt: Date.now(), draft };

  delete emailIngestionDraftBySubId[subId];

  // The LOB switcher must reflect this submission's now-known LOB the
  // moment Document Ingestion completes — not just when the table's LOB
  // filter happens to already be set to something other than "All". If a
  // Product JSON ingestion has since replaced the dropdown's option list
  // with just that product, this submission's LOB option may no longer
  // exist there — add it back rather than silently failing to select it.
  const lobSelectEl = document.getElementById("lobSelect");
  if (lobSelectEl && activeSubmissionId === subId) {
    const hasOption = Array.from(lobSelectEl.options).some(o => o.value === sub.lobKey);
    if (!hasOption) {
      const catalogEntry = (typeof LOB_CATALOG !== "undefined") ? LOB_CATALOG.find(l => l.key === sub.lobKey) : null;
      const opt = document.createElement("option");
      opt.value = sub.lobKey;
      opt.textContent = catalogEntry ? catalogEntry.name : (sub.lobName || sub.lobKey);
      lobSelectEl.appendChild(opt);
    }
    lobSelectEl.value = sub.lobKey;
  }

  if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
  if (typeof renderRoleDashboard === "function") renderRoleDashboard();
  if (typeof selectSubmission === "function" && activeSubmissionId === subId) selectSubmission(subId, false);
  if (typeof persistAppState === "function") persistAppState();

  showToast(
    needsReview
      ? `⚠️ [${sub.id}] normalized but flagged Needs Review — raw email preserved, verify low-confidence fields.`
      : `✅ [${sub.id}] normalized into Standard Data — raw email preserved and viewable anytime.`,
    needsReview ? "warning" : "success"
  );
}

window.applyNormalizedDataToSubmission = applyNormalizedDataToSubmission;
window.openEmailDigestModal = openEmailDigestModal;
window.closeEmailDigestModal = closeEmailDigestModal;
window.switchEmailDigestTab = switchEmailDigestTab;
window.handleEmailDigestFileSelect = handleEmailDigestFileSelect;
window.removeEmailDigestFile = removeEmailDigestFile;
window.loadDemoInboxMessage = loadDemoInboxMessage;
window.connectRealInboxStub = connectRealInboxStub;

// ============================================================================
// 8. BULK SUBMISSION JSON UPLOAD (Submission Intake) — creates many real
// submissions from ONE JSON file at once, instead of one-at-a-time. Each
// array entry is mapped onto a fresh getBlankSubmissionSkeleton() using the
// exact same "only set what's actually present" rule as every other
// ingestion path in this app — nothing is fabricated for entries/fields the
// file doesn't provide, they stay blank/"Not Provided". Accepts either a
// bare JSON array, or { "submissions": [ ... ] }.
// ============================================================================
function mapBulkFieldsOntoSubmission(sub, item) {
  if (!item || typeof item !== "object") return;

  if (item.insured) sub.insured = item.insured;
  if (item.fein) sub.fein = item.fein;
  if (item.dot) sub.dot = item.dot;
  if (item.mcNumber) sub.mcNumber = item.mcNumber;
  if (item.address) sub.address = item.address;
  if (item.broker) sub.broker = item.broker;
  if (item.email) sub.email = item.email;
  if (item.underwriter) sub.underwriter = item.underwriter;
  if (item.effectiveDate) {
    sub.effectiveDate = item.effectiveDate;
    if (!sub.genInfo) sub.genInfo = {};
    sub.genInfo.effective_date = item.effectiveDate;
  }
  if (item.exposureVal !== undefined) {
    sub.exposureVal = Number(item.exposureVal) || 0;
    sub.exposure = `$${sub.exposureVal.toLocaleString()}`;
  }
  if (item.lobKey) {
    sub.lobKey = item.lobKey;
    const lobCatalogEntry = (typeof LOB_CATALOG !== "undefined") ? LOB_CATALOG.find(l => l.key === item.lobKey) : null;
    if (lobCatalogEntry) sub.lobName = lobCatalogEntry.name;
  }
  sub.channelType = item.channelType === "direct" ? "direct" : "broker";

  if (Array.isArray(item.drivers)) {
    sub.drivers = item.drivers.map((d, i) => Object.assign({
      id: `DRV-${i + 1}`, given_name: null, last_name: null, age: null, dob: null, sex: null,
      licenseNumber: null, licensestate: null, licenseclasstype: null, experience: null,
      tenure: null, status: "Pending Verification", driver_factor: null, violations: undefined
    }, d));
  }
  if (Array.isArray(item.vehicles)) {
    sub.vehicles = item.vehicles.map((v, i) => Object.assign({ id: Date.now() + i, xid: i + 1 }, v));
  }
  if (Array.isArray(item.losses)) sub.losses = item.losses;
  if (item.operationsProfile) sub.operationsProfile = Object.assign({}, sub.operationsProfile, item.operationsProfile);
  if (item.coveragesInfo) sub.coveragesInfo = Object.assign({}, sub.coveragesInfo, item.coveragesInfo);
  if (item.filingInfo) sub.filingInfo = Object.assign({}, sub.filingInfo, item.filingInfo);
  if (item.uwReviewInfo) sub.uwReviewInfo = Object.assign({}, sub.uwReviewInfo, item.uwReviewInfo);
  if (item.commoditiesInfo) sub.commoditiesInfo = Object.assign({}, sub.commoditiesInfo, item.commoditiesInfo);
  if (item.radiusOfOperationsInfo) sub.radiusOfOperationsInfo = Object.assign({}, sub.radiusOfOperationsInfo, item.radiusOfOperationsInfo);
  if (item.insuredInfo) sub.insuredInfo = Object.assign({}, sub.insuredInfo, item.insuredInfo);

  const activeProduct = window.ACTIVE_INSURANCE_PRODUCT || (typeof ACTIVE_INSURANCE_PRODUCT !== "undefined" ? ACTIVE_INSURANCE_PRODUCT : null);
  if (activeProduct && typeof buildProductAppetiteRules === "function") {
    sub.appetiteRules = buildProductAppetiteRules(activeProduct, sub);
  }
  if (activeProduct && typeof mapQuestionnaireFromProduct === "function") {
    mapQuestionnaireFromProduct(activeProduct, sub);
  }
}

function handleBulkSubmissionJsonUpload(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;

  const btn = document.getElementById("btnBulkSubmissionUpload");
  const originalBtnHtml = btn ? btn.innerHTML : null;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Uploading...';
  }
  const restoreBtn = () => {
    if (btn) { btn.disabled = false; btn.innerHTML = originalBtnHtml; }
  };

  const reader = new FileReader();
  reader.onload = (e) => {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch (err) {
      showToast("❌ Invalid JSON file: " + err.message, "danger");
      restoreBtn();
      return;
    }

    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.submissions) ? parsed.submissions : null);
    if (!items || !items.length) {
      showToast("⚠️ File must contain a JSON array of submissions (or { \"submissions\": [...] }).", "warning");
      restoreBtn();
      return;
    }

    let created = 0;
    items.forEach((item) => {
      const newSub = getBlankSubmissionSkeleton();
      newSub.id = `SUB-BULK${Math.floor(10000 + Math.random() * 90000)}`;
      newSub.apiSourced = true;
      newSub.lobKey = item.lobKey || "trucking";
      const lobCatalogEntry = (typeof LOB_CATALOG !== "undefined") ? LOB_CATALOG.find(l => l.key === newSub.lobKey) : null;
      newSub.lobName = lobCatalogEntry ? lobCatalogEntry.name : newSub.lobKey;
      newSub.channelName = "Bulk JSON Upload";
      newSub.receivedAt = "Just Now";
      newSub.receivedTimestamp = Date.now();
      newSub.priority = "P3";
      // Same as raw email capture — no real score has been calculated for
      // this submission, so it stays null ("Pending") rather than a
      // hardcoded placeholder number.
      newSub.priorityScore = null;
      newSub.slaText = "Pending Triage";
      newSub.slaCountdown = "Awaiting Underwriter Assignment";
      newSub.priorityReason = "Bulk JSON Upload — Awaiting Assignment";
      newSub.statusText = "Intake Ingested";
      newSub.statusBadge = "badge-primary";
      newSub.currentStep = 1;
      newSub.completedSteps = [];
      newSub.docs = [];
      newSub.ocrFields = [];
      newSub.canonicalJson = { submission_id: newSub.id, source_channel: "Bulk JSON Upload", status: "ingested" };
      newSub.normalizationStatus = "normalized";

      mapBulkFieldsOntoSubmission(newSub, item);

      SUBMISSIONS_DATASET.unshift(newSub);
      created++;
    });

    if (typeof renderSubmissionsTable === "function") renderSubmissionsTable();
    if (typeof renderRoleDashboard === "function") renderRoleDashboard();
    if (typeof persistAppState === "function") persistAppState();

    showToast(`✅ Bulk upload complete — ${created} submission${created === 1 ? "" : "s"} created from ${file.name}.`, "success");
    restoreBtn();
  };
  reader.onerror = () => { showToast("❌ Could not read the file.", "danger"); restoreBtn(); };
  reader.readAsText(file);
}
window.handleBulkSubmissionJsonUpload = handleBulkSubmissionJsonUpload;
