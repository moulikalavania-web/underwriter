# VeriDex — Commercial Underwriting Engine (Prototype)

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
| **audit-intelligence-admin.js** | Audit Log, Quote Intelligence, Unified Account View, User Master (admin) |
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
