# FUT — Commercial Underwriting Engine (Prototype)

Plain HTML/CSS/JS app — no build step, no bundler, no npm install required.
Open `index.html` directly in a browser, or open this folder in VS Code and
use an extension like **Live Server** for auto-reload while editing.

## Folder structure

```
veridex/
├── index.html              All markup — screens, modals, workflow steps
├── css/
│   └── styles.css          Single stylesheet for the entire app
└── js/                     14 modules, loaded in this order (see index.html <script> tags)
    ├── data-config.js
    ├── shell-navigation.js
    ├── archive-decline-team.js
    ├── audit-intelligence-admin.js
    ├── intake-dashboard-assignment.js
    ├── case-documents-downstream.js
    ├── quote-bind-pas.js
    ├── actions-versions.js
    ├── bindings-ingestion.js
    ├── email-intake-ingestion.js
    ├── risk-score.js
    ├── generate-final-json.js
    ├── issue-quote-email.js
    └── golden-path-data.js
```

Scripts are loaded as plain `<script>` tags (no ES modules, no imports) — all
functions and variables share one global scope, so any module can call
functions defined in any other module. Load order matters: a module can only
call functions from modules that were loaded **before** it in `index.html`.

## What each module does

| File | Responsibility |
|---|---|
| **data-config.js** | Seed submission dataset, LOB catalog, user roles/personas, permissions, Underwriting Discretionary Pricing (Post-Rating) engine |
| **shell-navigation.js** | App shell: top nav, sidebar, page routing (`showXPage()` functions), role switcher, localStorage save/restore |
| **archive-decline-team.js** | Decline Center, Archive, Team Activity screens |
| **audit-intelligence-admin.js** | Audit Log, Quote Intelligence, User Master (admin); the cross-line customer view is the Customer tab of Search & Lookup |
| **intake-dashboard-assignment.js** | Submission Intake table, Assignment Dashboard, submission detail card |
| **case-documents-downstream.js** | Document Ingestion (Screen 2), Underwriting Workbench (Screen 5), Authority Desk (Screen 6), document preview modals |
| **quote-bind-pas.js** | Rating Engine payload viewer, Quote & Bind (Screen 8), PAS/Policy screens, Discretionary Pricing UI |
| **actions-versions.js** | Quote issuance action, quote version history, referral/escalation actions |
| **bindings-ingestion.js** | Product Studio (Integrating API) — product JSON ingestion, product schema editor tabs |
| **email-intake-ingestion.js** | Email → Submission raw capture, AI Document Ingestion (Claude API call + review UI) |
| **risk-score.js** | Auto-calculated + underwriter-editable Risk Score (Workbench → Authority Desk) |
| **generate-final-json.js** | "Generate JSON" button on Authority Desk — builds the `ratingInputs`-shaped final record |
| **issue-quote-email.js** | Auto-generates the Issue Quote → broker email using the rating JSON + Post-Rating pricing override |
| **golden-path-data.js** | **Loads last.** Golden Path Demo Mode: single-story seed data (Vikram & Sons / Vikas & Co / Arora & Sons / Ayushi), UI trimming, and the `ingestProductSchema()` override — this is what makes Appetite Rules, the Intake Questionnaire, and Attached Documents all dynamically rebuild from whatever product JSON you ingest via Integrating API (see below). Set `GOLDEN_PATH_MODE = false` at the top of this file to fall back to the original generic multi-submission demo. |

## Phase 1 (new submission)

`js/phase1-flow.js` is the guided entry: **Create → Received → four automatic checks (producer licence, FEIN duplicate,
appetite, watchlist) → human review**. A failed check leads to the Decline screen; the assigned reviewer must comment before
approving or declining. Appetite limits are placeholders in `P1_APPETITE`. Tests: `tests/suites/c39-phase1-flow.html`.

## Clearance screen (Step 2)

`js/clearance-board.js` draws one verdict, a five-gate lane (producer licence, sanctions, broker of record, FEIN duplicate,
appetite) and a short "what needs you" list; the existing cards sit inside folded gates and only the gates that need a person
open by themselves. The rules and the hold on leaving Step 2 are unchanged. Tests: `tests/suites/c40-clearance-board.html`.

## Underwriter work areas (added after Phase 1)

| File | What it adds |
|---|---|
| `js/my-work.js` | My Work: follow-up tasks and the seven exception queues |
| `js/find-lookup.js` | Header search, Recent, queue filters, Search & Lookup (advanced search, insured, agents and brokers, companies, phone book) |
| `js/case-file.js`, `js/case-money.js` | Case File: notes, email history, telematics, forms pack, additional insured, eligibility, IFTA, billing and premium finance, premium estimate, quote options, copy submission, reopen quote |
| `js/policy-ops.js` | Policies: expiring and expired, batch review and expiration letters, claim renewals, endorsement requests, transfers, underwriter change, cancellation report |
| `js/reports.js`, `js/state-guidelines.js` | Reports library (12-month matrix, loss run, aggregate exposure and more) and the state guidelines register read by Phase 1 |
| `js/team-tools.js` | Mailman, print queue, tickets, notice board, chat, audit and loss control, calculator, profile and password |

Nothing here ships demo data or built-in rates; reference data is entered or loaded. Tests: `c41` to `c46` in `tests/suites/`.

## Add-on modules

`risk-score.js`, `generate-final-json.js`, `issue-quote-email.js`,
`email-intake-ingestion.js`, and `golden-path-data.js` were all added on top
of the original app — each is self-contained and can be removed by deleting
its `<script>` tag in `index.html` without breaking the rest of the app
(aside from features that depend on it, e.g. removing `risk-score.js` will
make the Risk Score card on the Workbench disappear, but nothing else
breaks).

## Dynamic ingestion (golden-path-data.js)

When a product JSON is ingested via the Integrating API screen, several
Workbench sections rebuild themselves live from that JSON instead of
showing fixed demo data:

| Function (in golden-path-data.js) | Rebuilds |
|---|---|
| `mapAppetiteRulesFromProduct()` | Step 7: Appetite Rules & Automated Knockouts — every rule comes from the ingested product's `eligibility`/`underwriting` arrays; Minimum Driver Age is auto-split into one row per driver |
| `mapQuestionnaireFromProduct()` | Intake Questionnaire & Risk Assessment Responses — built from the ingested product's `questionnaire`/`riskAttributes` |
| `mapDocumentsFromProduct()` | Attached Underwriting Documents — only shows documents the ingested JSON actually provides; empty if it provides none |

If the ingested JSON has no data for one of these, that section falls back
to the golden-path default rather than showing nothing/breaking.

## Notes

- The Claude API calls in `email-intake-ingestion.js` (`fetch("https://api.anthropic.com/v1/messages", ...)`) only work inside the claude.ai artifact runtime, which proxies/authenticates the request. They will not work if this app is hosted elsewhere without wiring up your own API key/backend.
- No npm dependencies. Phosphor Icons are loaded from a CDN (`unpkg.com`) in `index.html` — requires internet access for icons to render.

## Automatic intake (js/auto-intake.js)

Once a reviewer approves Phase 1, the system does Ingest, Clearance (already decided in Phase 1), Extract, Confirm and Enrich itself, and the underwriter opens the case at Step 6, the Underwriting Workbench with its Appetite match. The case stops at the step that needs a person only when Phase 1 was not approved, the message is not new business, or a critical field could not be read. Each automatic step is written to the decision log by "System (automatic)", and the Workbench shows what was done and anything flagged, with a link back to the intake details.

## UW Controls and the underwriting record

Registers the underwriting rules run on live on the **UW Controls** page (sidebar). Every register starts empty, is proposed by one person and put in force by a different one, and is versioned (`js/uw-controls.js` has the shared maker-checker helpers):

| Tab | File | What it holds |
|---|---|---|
| Rule sets | `uw-rulesets.js` | Versioned rule sets (kind, source, period, product/line/state/coverage), one stage per rule, tighten-only for administration sets, opt-in automatic decline, reproducible rule runs, triage rules in Phase 1 |
| Approval chains | `uw-approvals.js` | Ordered approval steps by role and amount; distinct approvers; used by pricing adjustments and knockout overrides |
| Pricing adjustments | `uw-pricing.js` | Filed percentage ranges, technical or running basis, order, filing reference, authority and approval |
| Compliance checks / Product filings | `uw-compliance.js` | State requirements checked at bind, the filing register and "can this product be sold here today", notice triggers, reason limits, due dates and delivery proof |
| Duplicate matching | `uw-matching.js` | Weighted score, review and automatic thresholds, merge and unmerge with survivorship |
| Data freshness / Coverage relationships | `uw-freshness.js` | Maximum age by attribute with warn, refresh or block; requires, allows, excludes, defaults-on, constrains |
| Accumulation limits | `uw-capacity.js` | Buckets by state, zip, county, cat zone, industry or fleet band; carrier capacity |
| Queues and SLA | `uw-queues.js` | Queues with member capacity, business calendars, SLA policies, escalation |
| Record shares | `uw-sharing.js` | A case visible to another agency, program or carrier by agreement, logged when used |

The Case File has an **Underwriting record** tab (`uw-records.js`): the underwriting case, referrals (reason code, named person, limit breached), decisions, every authority check, approvals, pricing adjustments, compliance checks, notices and their deliveries, party screening (`uw-screening.js`), duplicate matches, market placements (`uw-markets.js`), freshness, accumulation, queue and SLA, structured loss history, scores per object and third-party records (`uw-riskdata.js`), and shares.

No provider, model, registry or market is connected: screening results, scores, third-party rows and market quotes are recorded from what the underwriter obtained, with the reference needed to trace them.
