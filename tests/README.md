# Veridex tests

One command runs everything:

    python tests/run.py

It exits `0` when all checks pass and `1` otherwise, so it can gate a commit or a CI job.
Other options: `--suite g06` (repeatable, matches by file-name prefix), `--list`,
`--static-only`, `--junit report.xml`, `--keep` (keep the generated pages in `tests/.out`),
`-v` (print passing checks too).

**Needs:** Python 3.8+ and Microsoft Edge or Chrome (set `EDGE_PATH` if it is not found).
Node.js is optional; when present every file in `js/` is also syntax-checked.

## What is checked

**Static checks** (no browser): every script tag in `index.html` points at a file that exists;
no script is loaded twice; every file in `js/` is loaded; no duplicate element ids; no function is
defined twice (with two definitions, whichever file loads last silently wins); every JS file
parses; every RBAC resource has a default for each internal role.

**Browser suites** (`tests/suites/`), one per add-on module. Each runs the real application in
headless Edge against fixtures it builds itself, and checks behaviour (rules, guards, permissions,
persistence, rendering), not source text:

| Suite | Covers |
|---|---|
| c01 | Consolidation of duplicated features: one way to change price, one risk measure, one "needs referral" rule, one way to request missing information, one subjectivity tracking board |
| c03 | Discretionary pricing carries only the credit or debit; tax is the surplus lines basis; commission is on the priced premium |
| c05 | Written role definitions; the six access-policy rules (separation of duties, least privilege, audit-log protection); every permission change checked; periodic access review by the Compliance Officer |
| c06 | Only the Head of Underwriting creates, imports and assigns; a pending referral puts the case on the deciding role's desk |
| c07 | Document ingestion: detection by file content, refusal of renamed files and programs, extraction by type (PDF, Word, Excel, PowerPoint, CSV, JSON, EML), OCR hook, consolidation with sources and conflicts, validation, canonical record |
| c08 | Quote Conditions in the Notice Studio popup: drafting rules, the document to sign, met on time (coverage added, premium updated), not met (nothing added, premium unchanged), extensions kept as versions, chat with the broker, permissions |
| c09 | Sample product PRD-021 "Dashcam Required" rule: judged unit by unit, suggests a Quote Condition, coverage withheld; met in time = Own Damage added and premium updated; not met = coverage stays out, premium unchanged |
| c10 | Rating Snapshot in Quote & Bind: risk details, risk score and premium saved as versions when rating details are generated; unchanged = nothing saved; old versions kept; changes and comparison |
| c11 | Saved state restored on load: version key, storage-size guard (attachments first, then derived text), failed writes never break the app |
| c12 | No invented premium, rating-request or SLA values |
| c13 | Offline assets: fonts, icons and the PDF library are local |
| c14 | Document viewer shows the attached file (no made-up previews) |
| c15 | Quote Conditions and the Rating Snapshot wired into the quote, the binder and the final JSON |
| c16 | Quote and invoice documents: nothing cut off or invented, schedule agrees with the premium, invoice made at bind |
| c17 | Guard registry for e-signature, issue quote and bind |
| c20 | Step 2 legal gates: producer licence and sanctions run by themselves once ingestion is confirmed, before market clearance, FEIN and appetite; the case is held at Step 2 until both pass; the bind re-check is skipped right after a screening with the same parties and list, or after the same producer passed in this session with no new registry |
| c21 | The fourteen workflow steps: the order, which cards each step shows on a shared page, ingest and extract views, triage (kind of message, quick read before the legal checks, documents expected, duplicates), the Confirm gate, loss run analysis, statement of values, appetite match, the decision brief and the broker reply, and Next walking the steps in order |
| c22 | The referral board: the button names the real target, one tracked referral, the receiver's board says "Referred to you", the sender's case says "Awaiting <name>", the Head of Underwriting sees the referral list, decisions follow the referral |
| c23 | Shell fixes: the workflow footer is hidden on the sign-in screen, the header product list is readable, the breadcrumb follows the step, the Compliance Officer sees their own name and a book overview |
| c24 | ACORD forms: a 125, 126, 127 or 140 is read field by field from its text; what is found fills empty case fields and conflicts are listed; premises on a 140 become the statement of values; the forms are prefilled from the case with each field marked Filled or Confirm, plus a trucking supplement |
| c25 | The Confirm step shows only what needs a person (accepted fields folded away but still applied); each kind of message at triage has its action: attach to an open case, attach to a policy and open Policy Changes, open the renewal pipeline or treat as new, discard with a reason |
| c26 | Motor vehicle records and IFTA reports read from text or tables: violations by severity and age, points and band per driver, matched to the driver list; miles, gallons, mpg and state shares compared with the application; both in the Decision Brief |
| c27 | Federal filings after the bind: MCS-90 attached at no less than the statutory minimum, BMC-91 / 91X filed and seen on FMCSA's record, BMC-35 notice of cancellation 30 days or more ahead; each step refused when out of order; an overdue filing |
| c28 | Notifications and reminders: referrals, decisions, assignments and attached documents reach the right role through the bell; SLA at risk and overdue, a referral waiting a day and an overdue filing are worked out from the cases and sent once |
| c19 | Broker commission loaded onto the premium: the agreement rate or a senior override moves the Final Quoted Premium and TOTAL BINDABLE POLICY PREMIUM; credit/debit applies first; commission is paid on the premium before the load; direct business carries none; a bound policy keeps its premium |
| c18 | Licensing registry and sanctions watchlist loaded from a file in the cards (OFAC SDN.CSV, CSV, JSON): parsing, pass/flag from real data, amber when nothing is loaded, kept across reloads |
| c04 | A tester's path with no demonstration data in the app: fresh start, Create New Submission, no-watchlist / no-registry / no-producer-record gates, fixture cases through Steps 1-7, imported rating file, issue, accept, bind |
| c02 | One home for each overlapping page: audit history, declines, quote history, choosing a user |
| g02 | Sanctions / OFAC screening |
| g03 | Producer licensing and appointment |
| g04 | TRIA offer and election |
| g05 | Adverse action and declination notices |
| g06 | Surplus lines tax, diligent search, filing |
| g07 | Versioned rates, fees and limits; maker-checker; quote pinning |
| g08 | Authority by premium, class and state; carrier layer; no self-approval |
| g11 | Submission completeness |
| g14 | Subjectivities |
| g15 | Bind gates (stacked guards at the real bind) |
| g16 | Binders, certificates, endorsement, cancellation, reinstatement |
| g17 | Renewals |
| g18 | Broker of record, market lock, commission |
| g23 | Carrier bordereaux |
| g30 | Performance reporting |
| g31 | External and oversight roles, producer / program segregation |

## Fixtures (`tests/fixtures/`)

The application ships **no demonstration data**: it starts empty and holds no seeded submissions, no sanctions watchlist, no
licensing registry and no sample quote. The suites bring their own, loaded after the application and before each suite:

| File | Provides |
|---|---|
| `seed-submissions.js` | `SEED_SUBMISSIONS_DATASET`: 15 cases across the five lines, pre-assigned to underwriters |
| `registries-and-watchlist.js` | A fictional sanctions watchlist and producer registry (invented names, NPNs and licence numbers) |
| `rating-sample.js` | `SAMPLE_RATING_JSON`: a sample rating-engine output for suites that need a quote |
| `external-personas.js` | Four restricted users (two producers, a program administrator, a carrier auditor) registered with `registerExternalRole()`; the application itself ships only the six internal users |
| `complete-case.js` | `completeFixtureCase()` / `loadFixtureCases()`: fills only the missing required items on a fixture case, tagged as samples, so it can be walked through all seven steps |

A suite that wants "no list" or "no registry" empties `SANCTIONS_WATCHLIST` or `PRODUCER_REGISTRY` and puts it back afterwards (see c04).

## Writing or changing a suite

A suite file is an HTML fragment containing one `<script>` block. The runner appends it to a copy
of `index.html`, so every global function of the app is available. The script pushes one line per
check into an array and finally writes them into `<pre id="__t">`:

    PASS <name>          FAIL <name>   [detail]          EXCEPTION <message>
    INFO <text>          WARN <text>                     PAGE ERRORS: none | <messages>

A suite fails on any `FAIL` or `EXCEPTION`, on any page error, or when it reports nothing.
`PAGE ERRORS: none` counts as one passing check, which is why a suite's "passed" figure is one
higher than its number of named checks.

Conventions that keep the suites stable:

* Assert behaviour (state, permissions, rendered text), never the source text of a function.
  Add-on modules wrap each other's functions, so source-text checks break whenever a module is added.
* Older suites (g03, g04, g05, g14, g15, g06) replace `slGuardQuote`, `slGuardBind`, `authGuardQuote`
  and `authGuardBind` with pass-through functions, because their fixtures are not built to satisfy the
  later surplus-lines and authority gates. Those gates are tested in g06 and g08.
* Build fixtures by cloning a seed submission from `SEED_SUBMISSIONS_DATASET` and deleting any field
  the module under test will set.
* Do not rely on today's date; compute dates relative to it, or pass an explicit "now" to the function.

## Known limits

The suites run in a real browser but with no server, no real login and no network, because the
prototype has none. They do not cover visual layout (check screenshots by eye), and the external
integrations (rating engine, PAS, registries) are still simulated, so they are not tested as
integrations. Authority, segregation and other controls are tested as browser behaviour; they must be
re-tested against the server once enforcement moves there (gap G01).
