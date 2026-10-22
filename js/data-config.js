/**
 * Submission-to-Quote Underwriting Flow Platform
 * JavaScript State Management, Dynamic LOB Filter, Priority & FIFO Queue Engine
 */

// ============================================================================
// 1. SUBMISSIONS
// ============================================================================


// ----------------------------------------------------------------------------
// SUBMISSION ASSIGNMENT WORKFLOW — "No JSON → No Submission → No Assignment
// → No Underwriting." The Submission Intake queue is EMPTY until a product
// is ingested via the Integrating API module, or a case is created or imported
// by hand. Every submission starts
// Unassigned; the Head of Underwriting (alone) must assign it to a working underwriter before that underwriter
// can see it in their queue or open its workflow.
// ----------------------------------------------------------------------------
const ASSIGNMENT_MANAGER_ROLES = ["admin"]; // Head of Underwriting only; others refer a case (authority referral), they do not assign
const ASSIGNABLE_WORKER_ROLES = ["assistant", "junior", "senior_uw"];

/** Bringing a case into the queue (Create New Submission, Import from Email) belongs to the Head of Underwriting alone. */
function canCreateSubmissions() { return currentUserRole === "admin"; }

function canManageAssignments() {
  return ASSIGNMENT_MANAGER_ROLES.includes(currentUserRole);
}

// The queue starts empty: a case enters through Create New Submission, Import from Email or the Integrating API.
var SUBMISSIONS_DATASET = [];

// Screen & Workflow Steps Configuration. Eight working screens, shown to the user as six stages (WORKFLOW_STAGES):
// 1 Doc Ingestion + 2 Clearance -> stage 1; 3 -> stage 2; 4 UW Workbench + 5 Authority Desk -> stage 3; 6 -> stage 4;
// 7 Quote & Bind -> stage 5; 8 Policy Issuance -> stage 6. Step numbers stay as they are because gates and the audit log use them.
const WORKFLOW_STEPS = [
  { step: 1, stage: 1, id: "screen-2", title: "Doc Ingestion & Schema / OCR", shortTitle: "Doc Ingestion", icon: "ph-receipt" },
  { step: 2, stage: 1, id: "screen-3", title: "FEIN & Appetite Clearance", shortTitle: "Clearance Check", icon: "ph-shield-check" },
  { step: 3, stage: 2, id: "screen-4", title: "Enrichment & Smart Routing", shortTitle: "Data Enrichment", icon: "ph-tree-structure" },
  { step: 4, stage: 3, id: "screen-5", title: "Underwriting Workbench", shortTitle: "UW Workbench", icon: "ph-briefcase" },
  { step: 5, stage: 3, id: "screen-6", title: "Authority & Referral Desk", shortTitle: "Authority Desk", icon: "ph-scales" },
  { step: 6, stage: 4, id: "screen-7", title: "LOB Rating & Pricing Engine", shortTitle: "Rating Engine", icon: "ph-calculator" },
  { step: 7, stage: 5, id: "screen-8", title: "Formal Quote & Policy Binding", shortTitle: "Quote & Bind", icon: "ph-signature" },
  { step: 8, stage: 6, id: "screen-10", title: "Policy Issuance & Terms", shortTitle: "Policy Issuance", icon: "ph-file-text", num: 10 }
];

// The six stages of the underwriting workflow, as the stepper shows them.
const WORKFLOW_STAGES = [
  { stage: 1, title: "Submission Intake & Clearance", desc: "Documents, clearance, legal checks" },
  { stage: 2, title: "Completeness & Data Enrichment", desc: "Requirements, enrichment, discrepancies" },
  { stage: 3, title: "Underwriting Review & Rules", desc: "Rules, exclusions, referral, overrides" },
  { stage: 4, title: "Rating & Pricing", desc: "Technical premium, adjustments" },
  { stage: 5, title: "Quoting & Binding", desc: "Quote, conditions, bind, compliance" },
  { stage: 6, title: "Policy Issuance & Terms", desc: "Policy, term, version, coverages" }
];
const BIND_STEP = 7;   // the Quote & Bind step: a case is "ready to quote" here and "issued" once it is bound
const stageOfStep = n => (WORKFLOW_STEPS.find(w => w.step === n) || WORKFLOW_STEPS[0]).stage;
const stepsOfStage = st => WORKFLOW_STEPS.filter(w => w.stage === st).map(w => w.step);

const SCREEN_ORDER = [
  { id: "screen-1", num: 1, title: "Intake & Submissions Hub", shortTitle: "Intake Hub", phase: "Phase 1", phaseGroup: "phaseGroup1", icon: "ph-tray" },
  ...WORKFLOW_STEPS.map(w => ({ id: w.id, num: w.num || w.step + 1, title: w.title, shortTitle: w.shortTitle, phase: "Workflow", phaseGroup: "workflow", icon: w.icon })),
  { id: "screen-9", num: 9, title: "Decline Archive & System Logs", shortTitle: "Decline Archive", phase: "Exit", phaseGroup: "phaseGroupExit", icon: "ph-prohibit" }
];

// Current State
let currentPage = "intake"; // 'intake' | 'workflow' | 'archive'
let activeSubmissionId = null;
let currentWorkflowStep = 1; // 1 to 7 (Workflow Stepper starts at Doc Ingestion = Step 1)
let currentLOBFilter = "trucking"; // 'trucking' | 'property' | 'mpl' | 'gl_cpc' | 'gl_cas' | 'all'
let currentTableFilter = "all"; // 'all' | 'broker' | 'direct' | 'referral'
let currentQueueSort = "priority"; // 'priority' | 'fifo' | 'exposure'
let currentSearchTerm = "";
let exposureScenario = "within"; // 'within' | 'exceeds'
let currentScreenId = "screen-1";
let currentUserRole = "assistant"; // 'assistant' | 'junior' | 'senior_uw' | 'senior' | 'admin'
let modalCurrentInspectingStep = 1;
let modalActiveTab = "stepView"; // 'stepView' | 'envelope'

const USER_ROLES_CONFIG = {
  assistant: {
    name: "Emily Watson",
    title: "Underwriting Assistant",
    limit: 0,
    limitText: "$0 Authority (Intake & Triage Only)",
    icon: "📋",
    description: "Clearance, document ingestion and initial data verification persona."
  },
  junior: {
    name: "Sarah Jenkins",
    title: "Underwriter I",
    limit: 2000000,
    limitText: "$2,000,000 Underwriter I Authority",
    icon: "👨‍💼",
    description: "Standard commercial underwriting accounts under $2.0M exposure."
  },
  senior_uw: {
    name: "David Chen",
    title: "Senior Underwriter",
    limit: 10000000,
    limitText: "$10,000,000 Senior Underwriter Authority",
    icon: "👩‍💼",
    description: "Complex fleet and multi-location property risks up to $10.0M."
  },
  senior: {
    name: "Marcus Vance",
    title: "Chief Underwriting Officer (CUO)",
    limit: 25000000,
    limitText: "$25,000,000 CUO Authority",
    icon: "👔",
    description: "Executive referrals, treaty exceptions and sign-off authority."
  },
  admin: {
    name: "Priya Nair",
    title: "Head of Underwriting",
    limit: 0,
    limitText: "Underwriting governance — no case authority",
    icon: "🧭",
    description: "Leads the underwriting department: owns the guidelines, authority and access for the underwriting team, assigns work and oversees performance. Makes no case-level decision."
  }
};

// ============================================================================
// GRANULAR ROLE-BASED ACCESS CONTROL (RBAC) — Requirement #5
// ============================================================================
// Per-role, per-resource permission matrix covering view / edit / approve /
// override / archive. This is the single source of truth for access control
// across the app — enforced at every gated action, and editable live by the
// 'admin' role from the User Master dashboard.
const RBAC_RESOURCES = [
  { key: "documents", label: "Documents" },
  { key: "submissionData", label: "Submission Data" },
  { key: "workflow", label: "Workflow Steps" },
  { key: "archival", label: "Archival Policy & Records" },
  { key: "reviewRules", label: "Review Routing Rules" },
  { key: "appetiteRules", label: "Appetite Rules Override (MGA Authority)" },
  { key: "premiumAdjustment", label: "Premium Adjustment" },
  { key: "teamActivity", label: "Team Activity (Manager View)" },
  { key: "unifiedAccount", label: "Unified Account View (Cross-LOB)" },
  { key: "auditLog", label: "Audit Log (Compliance View)" },
  { key: "sanctions", label: "Sanctions Screening (Run / Clear Matches)" },
  { key: "producerLicensing", label: "Producer Licence & Appointment (Check / Record Verification)" },
  { key: "tria", label: "TRIA Offer & Election (Offer / Record Election)" },
  { key: "notices", label: "Declination & Adverse-Action Notices (Draft / Issue)" },
  { key: "completeness", label: "Submission Completeness (Check / Request / Waive)" },
  { key: "subjectivities", label: "Subjectivities (Add / Receive = Edit, Accept = Approve, Waive / Reopen = Override)" },
  { key: "binders", label: "Binders & Certificates (Certificate = Edit, Issue Binder / Revoke Certificate = Approve, Void Binder = Override)" },
  { key: "policyChanges", label: "Policy Changes (Endorse / Cancel / Reinstate = Approve; Backdate, Flat Cancel, Large Change = Override)" },
  { key: "renewals", label: "Renewals (Review / Request Info = Edit, Renew / Conditional Renewal = Approve, Non-Renew / Late Notice = Override)" },
  { key: "brokerRelations", label: "Broker of Record & Commission (Record BOR Letter = Edit, Accept BOR = Approve, Override Commission / Release Lock / BOR on In-Force Policy = Override)" },
  { key: "surplusLines", label: "Surplus Lines (Record Search / Acknowledge = Edit, Confirm Tax Basis = Approve, Manual Rate / Search Exemption = Override)" },
  { key: "rateConfig", label: "Rates, Fees & Limits Configuration (Propose Change = Edit, Approve / Reject a Change = Approve; the proposer cannot approve their own change)" },
  { key: "authority", label: "Underwriting Authority (Raise Referral = Edit, Decide Referral = Approve, Record Carrier Approval = Override; nobody approves a risk they prepared or referred)" },
  { key: "bordereaux", label: "Carrier Bordereaux (Draft / Export = Edit, Submit to Carrier = Approve)" },
  { key: "performance", label: "Performance Reporting (View = Book-level Measures, Approve = Underwriter-level Measures)" },
  { key: "quoteConditions", label: "Quote Conditions (Draft / Issue / Record Signature / Chat / Extend = Edit, Confirm Condition Met and Add Coverage = Approve)" },
  { key: "accessReview", label: "Access Reviews (View = see the review record, Approve = record a periodic review of a role's access; the administrator cannot)" }
];
const RBAC_ACTIONS = ["view", "edit", "approve", "override", "archive"];

function defaultPermissionsMatrix() {
  const all = (v, e, a, o, ar) => ({ view: v, edit: e, approve: a, override: o, archive: ar });
  return {
    assistant: {
      documents: all(true, true, false, false, false),
      submissionData: all(true, true, false, false, false),
      workflow: all(true, false, false, false, false),
      archival: all(true, false, false, false, false),
      reviewRules: all(true, false, false, false, false),
      appetiteRules: all(true, false, false, false, false),
      premiumAdjustment: all(true, false, false, false, false),
      teamActivity: all(false, false, false, false, false),
      unifiedAccount: all(false, false, false, false, false),
      auditLog: all(false, false, false, false, false),
      sanctions: all(true, false, false, false, false),
      producerLicensing: all(true, false, false, false, false),
      tria: all(true, false, false, false, false),
      notices: all(true, false, false, false, false),
      // Intake is the Assistant's job: they run the check and ask the broker for what is missing.
      completeness: all(true, true, false, false, false),
      subjectivities: all(true, false, false, false, false),
      // Certificates are routine servicing work; the Assistant may issue them once a binder is active.
      binders: all(true, true, false, false, false),
      policyChanges: all(true, false, false, false, false),
      renewals: all(true, true, false, false, false),
      brokerRelations: all(true, true, false, false, false),
      surplusLines: all(true, true, false, false, false),
      rateConfig: all(true, false, false, false, false),
      authority: all(true, false, false, false, false),
      bordereaux: all(true, false, false, false, false),
      performance: all(false, false, false, false, false),
      quoteConditions: all(true, false, false, false, false),
      accessReview: all(false, false, false, false, false)
    },
    junior: {
      documents: all(true, true, false, false, false),
      submissionData: all(true, true, false, false, false),
      workflow: all(true, false, true, false, false),
      archival: all(true, false, false, false, false),
      reviewRules: all(true, false, false, false, false),
      appetiteRules: all(true, false, false, false, false),
      premiumAdjustment: all(true, true, false, false, false),
      teamActivity: all(false, false, false, false, false),
      unifiedAccount: all(false, false, false, false, false),
      auditLog: all(false, false, false, false, false),
      sanctions: all(true, true, false, false, false),
      producerLicensing: all(true, true, false, false, false),
      tria: all(true, true, false, false, false),
      notices: all(true, true, false, false, false),
      completeness: all(true, true, false, false, false),
      // Underwriters judge whether a received item is acceptable; only senior authority waives one.
      subjectivities: all(true, true, true, false, false),
      binders: all(true, true, true, false, false),
      policyChanges: all(true, true, true, false, false),
      renewals: all(true, true, true, false, false),
      brokerRelations: all(true, true, true, false, false),
      surplusLines: all(true, true, true, false, false),
      rateConfig: all(true, false, false, false, false),
      authority: all(true, true, false, false, false),
      bordereaux: all(true, false, false, false, false),
      performance: all(false, false, false, false, false),
      quoteConditions: all(true, true, true, false, false),
      accessReview: all(false, false, false, false, false)
    },
    senior_uw: {
      documents: all(true, true, false, false, false),
      submissionData: all(true, true, false, false, false),
      workflow: all(true, false, true, true, false),
      archival: all(true, true, false, false, true),
      reviewRules: all(true, false, false, false, false),
      appetiteRules: all(true, false, false, true, false),
      premiumAdjustment: all(true, true, false, false, false),
      teamActivity: all(false, false, false, false, false),
      unifiedAccount: all(true, false, false, false, false),
      auditLog: all(false, false, false, false, false),
      sanctions: all(true, true, false, false, false),
      producerLicensing: all(true, true, false, false, false),
      tria: all(true, true, true, false, false),
      notices: all(true, true, true, false, false),
      completeness: all(true, true, true, false, false),
      subjectivities: all(true, true, true, true, false),
      binders: all(true, true, true, true, false),
      policyChanges: all(true, true, true, true, false),
      renewals: all(true, true, true, true, false),
      brokerRelations: all(true, true, true, true, false),
      surplusLines: all(true, true, true, true, false),
      rateConfig: all(true, true, false, false, false),
      authority: all(true, true, true, false, false),
      bordereaux: all(true, true, false, false, false),
      performance: all(true, false, false, false, false),
      quoteConditions: all(true, true, true, false, false),
      accessReview: all(false, false, false, false, false)
    },
    senior: {
      documents: all(true, true, true, true, false),
      submissionData: all(true, true, true, true, false),
      workflow: all(true, true, true, true, false),
      archival: all(true, true, true, true, true),
      reviewRules: all(true, true, false, false, false),
      appetiteRules: all(true, false, false, true, false),
      premiumAdjustment: all(true, true, true, true, false),
      teamActivity: all(false, false, false, false, false),
      unifiedAccount: all(true, false, false, false, false),
      auditLog: all(true, false, false, false, false),
      sanctions: all(true, true, true, false, false),
      producerLicensing: all(true, true, true, false, false),
      tria: all(true, true, true, false, false),
      notices: all(true, true, true, false, false),
      completeness: all(true, true, true, false, false),
      subjectivities: all(true, true, true, true, false),
      binders: all(true, true, true, true, false),
      policyChanges: all(true, true, true, true, false),
      renewals: all(true, true, true, true, false),
      brokerRelations: all(true, true, true, true, false),
      surplusLines: all(true, true, true, true, false),
      rateConfig: all(true, true, true, false, false),
      authority: all(true, true, true, true, false),
      bordereaux: all(true, true, true, false, false),
      performance: all(true, false, true, false, false),
      quoteConditions: all(true, true, true, false, false),
      accessReview: all(true, false, false, false, false)
    },
    admin: {
      documents: all(true, false, false, false, false),
      submissionData: all(true, false, false, false, false),
      workflow: all(true, false, true, false, false),
      archival: all(true, true, false, false, true),
      reviewRules: all(true, true, false, false, false),
      appetiteRules: all(true, true, false, false, false),
      premiumAdjustment: all(true, false, false, false, false),
      teamActivity: all(true, false, false, false, false),
      unifiedAccount: all(true, false, false, false, false),
      auditLog: all(true, false, false, false, false),
      // The Head of Underwriting sets guidelines, authority and access for the team and makes no case-level decision (access policy SOD-1).
      sanctions: all(true, false, false, false, false),
      // Admin does not run or attest producer licensing checks.
      producerLicensing: all(true, false, false, false, false),
      // Admin can see TRIA records but does not offer or elect on a policy.
      tria: all(true, false, false, false, false),
      // Admin can read notices but does not draft or issue them.
      notices: all(true, false, false, false, false),
      completeness: all(true, false, false, false, false),
      subjectivities: all(true, false, false, false, false),
      binders: all(true, false, false, false, false),
      policyChanges: all(true, false, false, false, false),
      renewals: all(true, false, false, false, false),
      brokerRelations: all(true, false, false, false, false),
      surplusLines: all(true, false, false, false, false),
      rateConfig: all(true, true, true, false, false),
      authority: all(true, false, false, false, false),
      bordereaux: all(true, false, false, false, false),
      performance: all(true, false, true, false, false),
      quoteConditions: all(true, false, false, false, false),
      accessReview: all(true, false, false, false, false)
    }
  };
}

let PERMISSIONS_MATRIX = defaultPermissionsMatrix();

/** Checks whether the CURRENT active persona has a given action on a resource. */
function hasPermission(resource, action) {
  const roleMatrix = PERMISSIONS_MATRIX[currentUserRole];
  if (!roleMatrix || !roleMatrix[resource]) return false;
  return !!roleMatrix[resource][action];
}

/** Shows a standard "access denied" toast for a blocked action. */
function denyPermission(resource, action) {
  const resourceLabel = (RBAC_RESOURCES.find(r => r.key === resource) || {}).label || resource;
  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  showToast(`⛔ ${roleConfig.title} does not have "${action}" permission on ${resourceLabel}. Switch to an authorized persona or ask an Admin to update permissions in User Master.`, "danger");
}

// ============================================================================
// UNDERWRITER JURISDICTION & LOB AUTHORITY
// ----------------------------------------------------------------------------
// Extends the User Master roster (separate from the RBAC action matrix above,
// which governs WHAT a role can do) with WHERE and on WHICH lines each roster
// member is authorized to underwrite: licensed states, lines of business, and
// the specific coverages within those lines. Editable live by 'admin' from
// the User Master dashboard, same as the RBAC matrix.
// ============================================================================
const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }
];
const ALL_STATE_CODES = US_STATES.map(s => s.code);

// Lines of business the platform underwrites, keyed the same way as
// currentLOBFilter / submission.lobKey, each with its real coverage lines
// (pulled from the Screen-4 coverage schedules already in the dataset).
const LOB_CATALOG = [
  {
    key: "trucking",
    name: "Commercial Auto / Trucking",
    coverages: [
      "Commercial Auto Liability (Combined Single Limit)",
      "Auto Physical Damage (Comp & Collision)",
      "Motor Truck Cargo Legal Liability"
    ]
  },
  {
    key: "property",
    name: "Commercial Property",
    coverages: [
      "Building Real Property Coverage (Special Form / RC)",
      "Business Personal Property (Contents / Inventory)",
      "Business Income with Extra Expense",
      "Building & Refrigeration Structure"
    ]
  },
  {
    key: "mpl",
    name: "MPL - Professional Liability",
    coverages: [
      "Errors & Omissions (E&O) Professional Liability",
      "Directors & Officers (D&O) Management Liability"
    ]
  },
  {
    key: "gl_cpc",
    name: "GL CPC - Commercial Package & Contractors",
    coverages: [
      "Commercial General Liability (Each Occurrence)",
      "General Aggregate Limit",
      "Products / Completed Operations Aggregate"
    ]
  },
  {
    key: "gl_cas",
    name: "GL CAS - High Hazard Casualty & Surplus",
    coverages: [
      "Commercial General Liability (High Hazard Casualty)",
      "Site Pollution Incident Liability Endorsement"
    ]
  }
];
const ALL_LOB_KEYS = LOB_CATALOG.map(l => l.key);

/** Union of coverage names across a set of LOB keys, de-duplicated. */
function getCoveragesForLOBs(lobKeys) {
  const set = new Set();
  (lobKeys || []).forEach(key => {
    const lob = LOB_CATALOG.find(l => l.key === key);
    if (lob) lob.coverages.forEach(c => set.add(c));
  });
  return Array.from(set);
}

// ============================================================================
// SHARED HELPERS: DERIVED PREMIUM & TRUST SCORE (used by #2, #3, #7)
// ============================================================================
// The dataset does not carry a distinct "quoted premium" separate from
// exposure, and no trust/risk score. Both are derived deterministically per
// submission (stable across renders) unless the user has since adjusted the
// premium, in which case the adjusted value is authoritative.
// ----------------------------------------------------------------------------
// SLA: the target hours are the performance module's table (PERF_SLA_HOURS); the wording and the countdown are worked out from
// the case's own receipt time, never typed in. A case with no priority score shows none.
// ----------------------------------------------------------------------------
function slaHoursFor(priority) { return (typeof PERF_SLA_HOURS !== "undefined" && PERF_SLA_HOURS[priority]) || null; }
function slaTextFor(priority) {
  const h = slaHoursFor(priority);
  return h ? `${h}h ${priority === "P1" ? "Fast-Track" : (priority === "P2" ? "Standard" : "FIFO")} SLA` : "Standard FIFO";
}
/** Time left to the SLA target, from the receipt time; falls back to the stored wording when the case has no target. */
function slaCountdownFor(sub) {
  if (typeof sub.slaHours !== "number" || typeof sub.receivedTimestamp !== "number") return sub.slaCountdown;
  const left = sub.receivedTimestamp + sub.slaHours * 3600000 - Date.now();
  const mins = left >= 0 ? Math.ceil(left / 60000) : Math.floor(-left / 60000), h = Math.floor(mins / 60), m = mins % 60;
  return left >= 0 ? `${h}h ${String(m).padStart(2, "0")}m remaining` : `Overdue by ${h}h ${String(m).padStart(2, "0")}m`;
}
function priorityScoreText(sub) { return typeof sub.priorityScore === "number" ? `(Score: ${sub.priorityScore}/100)` : "(no score set)"; }

/** The case's premium, or 0 while nothing has been rated. It is never estimated from the exposure. */
function getSubmissionPremium(sub) {
  return typeof sub.currentPremium === "number" ? sub.currentPremium : 0;
}

/** For display: the premium, or "Not rated" while there is none. */
function getSubmissionPremiumLabel(sub) {
  const rated = typeof sub.currentPremium === "number" || (sub.discretionaryPricing && typeof sub.discretionaryPricing.finalPremium === "number");
  return rated ? "$" + getSubmissionPremium(sub).toLocaleString("en-US") : "Not rated";
}

// ============================================================================
// UNDERWRITING DISCRETIONARY PRICING (POST-RATING)
// ----------------------------------------------------------------------------
// Real insurance workflow: 1) Base Rating Engine computes Base Premium from
// standard factors. 2) AFTER rating, the underwriter reviews the account's
// safety scores, loss history and overall risk profile and applies a manual
// Credit (discount, up to -15%) or Debit (surcharge, up to +25%). 3) Taxes
// & fees are applied on top to produce the Final Quoted Premium.
// ============================================================================
var DISCRETIONARY_MAX_CREDIT_PCT = 15;   // underwriter can discount up to -15%
var DISCRETIONARY_MAX_DEBIT_PCT = 25;    // underwriter can surcharge up to +25%

/**
 * Base Premium for the Discretionary Pricing flow comes directly from the
 * Live Rating Engine Payload JSON (Screen 6) — the same per-coverage-line
 * premium figures shown in that JSON viewer — NOT a separately derived
 * number. This keeps "Base Rating" genuinely tied to the rating payload
 * output, per the required flow: Base Rating (from JSON) → Underwriter
 * Discretionary Credit/Debit → Final Quote.
 */
function getBasePremiumFromRatingPayload(sub) {
  const payload = getSubmissionRatingPayload(sub);
  const vehicles = payload.vehicles || payload.vehicle_list || [];
  let total = 0;
  let found = false;

  vehicles.forEach(v => {
    const raw = v.liability_premium || v.al_premium_wo_mod_factor || v.pd_premium;
    if (raw) {
      const num = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) { total += num; found = true; }
    }
  });

  // Fallback: sum coverageRows directly if the payload didn't expose vehicles,
  // then fall back further to the generic derived premium as a last resort.
  if (!found && sub.coverageRows && sub.coverageRows.length) {
    sub.coverageRows.forEach(row => {
      if (row.viaQuoteCondition) return;   // added by a met quote condition: counted once, through qcMetPremium below
      const num = parseFloat(String(row.prem || "").replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) { total += num; found = true; }
    });
  }

  return found ? Math.round(total) : getSubmissionPremium(sub);
}

function ensureDiscretionaryPricingSeed(sub) {
  if (!sub.discretionaryPricing) {
    const baseFromPayload = getBasePremiumFromRatingPayload(sub) + (typeof qcMetPremium === "function" ? qcMetPremium(sub) : 0);
    sub.discretionaryPricing = {
      basePremium: baseFromPayload,
      adjustmentType: null,   // 'credit' | 'debit' | null
      adjustmentPercent: 0,
      reason: null,
      appliedBy: null,
      appliedAt: null,
      finalPremium: baseFromPayload
    };
    recomputeFinalQuotedPremium(sub);
  } else if (sub.discretionaryPricing.commissionRate !== commissionLoadPct(sub) && !(typeof comIsBound === "function" && comIsBound(sub))) {
    // The broker's commission rate changed (override, new producer, new line): the premium follows it until the policy is bound.
    recomputeFinalQuotedPremium(sub);
  }
  return sub.discretionaryPricing;
}

/**
 * The broker commission rate (percent) that is loaded onto the premium: the rate in force on the Broker & Commission card
 * (agreement, or a senior override), frozen once the policy is bound. A direct submission has no broker, so no load.
 */
function commissionLoadPct(sub) {
  if (!sub || sub.channelType === "direct" || typeof comLockedOrCurrent !== "function") return 0;
  return Number(comLockedOrCurrent(sub).rate) || 0;
}

/**
 * Final Quoted Premium = the base premium with the underwriter credit or debit, then the broker commission loaded on top
 * (pass the submission to include it). Tax is not in it: that is the state surplus lines basis (surplus-lines.js), shown on its own card.
 */
function computeFinalQuotedPremium(basePremium, adjustmentType, adjustmentPercent, sub) {
  const signedPct = adjustmentType === "credit" ? -Math.abs(adjustmentPercent) : Math.abs(adjustmentPercent);
  const adjusted = Math.round(basePremium * (1 + signedPct / 100));
  const load = commissionLoadPct(sub);
  return load ? Math.round(adjusted * (1 + load / 100)) : adjusted;
}

/** Re-prices the submission from its base premium, credit/debit and current commission rate. Keeps the premium before commission, which is what commission is paid on. */
function recomputeFinalQuotedPremium(sub) {
  const dp = sub && sub.discretionaryPricing;
  if (!dp) return null;
  dp.premiumBeforeCommission = computeFinalQuotedPremium(dp.basePremium, dp.adjustmentType, dp.adjustmentPercent || 0);
  dp.commissionRate = commissionLoadPct(sub);
  dp.finalPremium = computeFinalQuotedPremium(dp.basePremium, dp.adjustmentType, dp.adjustmentPercent || 0, sub);
  if (typeof sub.currentPremium === "number") sub.currentPremium = dp.finalPremium;
  return dp.finalPremium;
}

function renderDiscretionaryPricingCard(sub) {
  const dp = ensureDiscretionaryPricingSeed(sub);
  const basePremium = dp.basePremium;
  const hasApplied = !!dp.adjustmentType;

  const previewFinal = hasApplied
    ? dp.finalPremium
    : computeFinalQuotedPremium(basePremium, null, 0, sub);

  return `
    <div class="card mb-3" id="discretionaryPricingCard">
      <div class="card-header">
        <h3><i class="ph ph-sliders"></i> Underwriting Discretionary Pricing (Post-Rating)</h3>
        <span class="badge ${hasApplied ? 'badge-success' : 'badge-warning'}">${hasApplied ? 'Applied' : 'Not Yet Applied'}</span>
      </div>
      <div class="card-body">
        <p class="text-xs text-muted mb-2">After the base rating engine computes the standard premium, the underwriter reviews the account's safety scores, loss history and overall risk profile, then applies a manual credit or debit before final quote generation.</p>

        <table class="data-table mb-3">
          <tbody>
            <tr>
              <td style="width:60%;"><strong>1. Base Premium</strong><br><span class="text-xs text-muted">From standard rating factors (coverages, fleet size, commodity, loss runs)</span></td>
              <td class="font-mono text-right"><strong>$${basePremium.toLocaleString()}</strong></td>
            </tr>
            <tr>
              <td><strong>2. Underwriter Credit / Debit</strong><br><span class="text-xs text-muted">${hasApplied ? (dp.reason || '—') : 'Not yet applied'}</span></td>
              <td class="font-mono text-right">
                ${hasApplied
                  ? `<strong style="color:${dp.adjustmentType === 'credit' ? 'var(--color-success)' : 'var(--color-danger)'};">${dp.adjustmentType === 'credit' ? '−' : '+'}${dp.adjustmentPercent}%</strong>`
                  : `<span class="text-muted">—</span>`}
              </td>
            </tr>
            ${dp.commissionRate ? `<tr>
              <td><strong>3. Broker Commission</strong><br><span class="text-xs text-muted">Loaded on top of the premium; follows the Broker &amp; Commission card</span></td>
              <td class="font-mono text-right"><strong>+${dp.commissionRate}%</strong></td>
            </tr>` : ""}
            <tr style="background:var(--color-surface); font-weight:700;">
              <td style="text-align:right;">Final Quoted Premium</td>
              <td class="font-mono text-right" style="font-size:15px; color:var(--color-brand-dark);">$${previewFinal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        ${hasApplied ? `
        <div class="alert alert-success u-fs-12">
          <i class="ph ph-check-circle"></i> Applied by <strong>${dp.appliedBy}</strong> on ${dp.appliedAt}.
        </div>
        <button class="btn btn-outline btn-sm mt-2" onclick="openDiscretionaryPricingModal('${sub.id}')"><i class="ph ph-pencil-simple"></i> Revise Credit/Debit</button>
        ` : `
        <button class="btn btn-primary" onclick="openDiscretionaryPricingModal('${sub.id}')"><i class="ph ph-sliders"></i> Apply Discretionary Pricing</button>
        `}
      </div>
    </div>`;
}

let discretionaryPricingTargetId = null;

function openDiscretionaryPricingModal(subId) {
  if (!hasPermission("premiumAdjustment", "edit")) {
    denyPermission("premiumAdjustment", "edit");
    return;
  }

  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  const dp = ensureDiscretionaryPricingSeed(sub);
  const modal = document.getElementById("discretionaryPricingModal");
  const body = document.getElementById("discretionaryPricingModalBody");
  if (!sub || !modal || !body) return;

  discretionaryPricingTargetId = subId;
  const riskScore = getEffectiveRiskScore(sub);

  body.innerHTML = `
    <div style="font-size:13px; margin-bottom:10px;">
      <strong>Submission:</strong> <code>${sub.id}</code> — ${sub.insured || "N/A"}
    </div>
    <div class="alert alert-info mb-3 u-fs-12-5">
      <i class="ph ph-info"></i> Base Premium: <strong>$${dp.basePremium.toLocaleString()}</strong> • Risk Score: <strong>${riskScore}/100</strong> (higher = riskier). Review safety scores, loss history and overall risk profile before deciding.
    </div>

    <div class="form-group mb-3">
      <label class="u-label-sm">Adjustment Type</label>
      <select id="dpAdjustmentType" class="form-control" onchange="updateDiscretionaryPricingPreview()">
        <option value="credit" ${dp.adjustmentType === "credit" || !dp.adjustmentType ? "selected" : ""}>Credit (Discount) — favorable risk profile</option>
        <option value="debit" ${dp.adjustmentType === "debit" ? "selected" : ""}>Debit (Surcharge) — elevated risk profile</option>
      </select>
    </div>

    <div class="form-group mb-3">
      <label class="u-label-sm" id="dpPercentLabel">Credit Percentage (0–${DISCRETIONARY_MAX_CREDIT_PCT}%)</label>
      <input type="number" id="dpPercentInput" class="form-control" min="0" max="${DISCRETIONARY_MAX_DEBIT_PCT}" value="${dp.adjustmentPercent || 0}" oninput="updateDiscretionaryPricingPreview()">
      <p class="text-xs text-muted u-mt-4">Credit capped at −${DISCRETIONARY_MAX_CREDIT_PCT}% (e.g. telematics installed, clean inspection record). Debit capped at +${DISCRETIONARY_MAX_DEBIT_PCT}% (e.g. driver turnover, adverse losses).</p>
    </div>

    <div class="form-group mb-3">
      <label class="u-label-sm">Underwriting Rationale <span class="u-text-danger">*</span></label>
      <textarea id="dpReason" class="form-control" rows="3" placeholder="e.g. Telematics installed fleet-wide, clean DOT inspection record over 24 months, no preventable accidents..." oninput="clearFieldError('dpReason')">${dp.reason || ""}</textarea>
      <span class="field-error-text u-hidden" id="dpReasonError">Underwriting Rationale is required.</span>
    </div>

    <div id="dpPreviewArea"></div>
  `;

  modal.style.display = "flex";
  updateDiscretionaryPricingPreview();
}

function updateDiscretionaryPricingPreview() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === discretionaryPricingTargetId);
  if (!sub) return;
  const dp = ensureDiscretionaryPricingSeed(sub);

  const typeSelect = document.getElementById("dpAdjustmentType");
  const percentInput = document.getElementById("dpPercentInput");
  const percentLabel = document.getElementById("dpPercentLabel");
  const previewArea = document.getElementById("dpPreviewArea");
  if (!typeSelect || !percentInput || !previewArea) return;

  const type = typeSelect.value;
  const maxAllowed = type === "credit" ? DISCRETIONARY_MAX_CREDIT_PCT : DISCRETIONARY_MAX_DEBIT_PCT;
  percentLabel.textContent = `${type === "credit" ? "Credit" : "Debit"} Percentage (0–${maxAllowed}%)`;
  percentInput.max = maxAllowed;

  let pct = parseFloat(percentInput.value) || 0;
  if (pct > maxAllowed) { pct = maxAllowed; percentInput.value = maxAllowed; }
  if (pct < 0) { pct = 0; percentInput.value = 0; }

  const finalPremium = computeFinalQuotedPremium(dp.basePremium, type, pct, sub);
  const loadPct = commissionLoadPct(sub);
  previewArea.innerHTML = `
    <div class="alert ${type === 'credit' ? 'alert-success' : 'alert-warning'} u-fs-12-5">
      <i class="ph ph-calculator"></i> Base $${dp.basePremium.toLocaleString()} ${type === 'credit' ? '−' : '+'} ${pct}% ${type}${loadPct ? ` + ${loadPct}% broker commission` : ""} = <strong>Final Quoted Premium: $${finalPremium.toLocaleString()}</strong>
    </div>`;
}

function closeDiscretionaryPricingModal() {
  const modal = document.getElementById("discretionaryPricingModal");
  if (modal) modal.style.display = "none";
  discretionaryPricingTargetId = null;
}

function saveDiscretionaryPricing() {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === discretionaryPricingTargetId);
  if (!sub) return;

  if (!hasPermission("premiumAdjustment", "edit")) {
    denyPermission("premiumAdjustment", "edit");
    return;
  }

  const type = document.getElementById("dpAdjustmentType").value;
  const maxAllowed = type === "credit" ? DISCRETIONARY_MAX_CREDIT_PCT : DISCRETIONARY_MAX_DEBIT_PCT;
  let pct = parseFloat(document.getElementById("dpPercentInput").value) || 0;
  const reason = document.getElementById("dpReason").value.trim();

  if (!reason) {
    showFieldError("dpReason");
    showToast("⛔ Underwriting Rationale is required.", "danger");
    return;
  }
  clearFieldError("dpReason");
  if (pct < 0 || pct > maxAllowed) {
    showToast(`⛔ ${type === "credit" ? "Credit" : "Debit"} must be between 0% and ${maxAllowed}%.`, "danger");
    return;
  }

  const dp = ensureDiscretionaryPricingSeed(sub);
  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
  dp.adjustmentType = type;
  dp.adjustmentPercent = pct;
  dp.reason = reason;
  dp.appliedBy = `${roleConfig.name} (${roleConfig.title})`;
  dp.appliedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  const finalPremium = recomputeFinalQuotedPremium(sub);

  sub.currentPremium = finalPremium;

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: 7,
    decision: `discretionary_${type}`,
    by: dp.appliedBy,
    at: dp.appliedAt,
    notes: `Applied ${type === "credit" ? "-" : "+"}${pct}% ${type} (${reason}). Base $${dp.basePremium.toLocaleString()} → Final $${finalPremium.toLocaleString()}.`
  });

  showToast(`✅ ${type === "credit" ? "Credit" : "Debit"} of ${pct}% applied. Final Quoted Premium: $${finalPremium.toLocaleString()}.`, "success");
  closeDiscretionaryPricingModal();

  // Refresh the whole Step 7 view (not just the discretionary pricing card)
  // so "TOTAL BINDABLE POLICY PREMIUM" and "Final Annual Total" on the quote
  // hero card immediately reflect the new Final Quoted Premium.
  renderStep7View(sub);

  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
}

// ============================================================================
