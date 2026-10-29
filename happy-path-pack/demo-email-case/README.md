# Demo: one email case that shows every new feature

Files in this folder (all plain text, so the prototype reads them without OCR):

| File | What it is |
|---|---|
| `email.txt` | The covering email. Paste it into "Import from Email". |
| `ACORD_125_Delta.txt` | An ACORD 125 application. |
| `MVR_batch.txt` | MVRs for two drivers (one clean-ish, one with a DUI and a suspended licence). |
| `IFTA_Q3_2026.txt` | One quarter of IFTA miles and gallons. |
| `Loss_Runs_2023-2025.csv` | Two claims, one still open. |
| `FOLLOWUP_email.txt`, `NOT_A_SUBMISSION.txt` | For the triage actions (see step 6). |

## Click path (sign in as the Head of Underwriting, Priya Nair, to import; then as David Chen, Senior Underwriter)

1. **Submission Intake, Import from Email.** Paste `email.txt`, attach the four files (ACORD, MVR, IFTA, loss run), Submit. Assign the case to David Chen.
2. **Step 1 Ingest.** The email and the files are shown exactly as received.
3. **Step 2 Triage & Clearance.** The Triage card names the insured, FEIN, DOT, MC and producer read from the email, and ticks off the documents received. The legal checks need a producer registry and a watchlist loaded (User Master or the reference-data loader); with none loaded the case is held here, which is correct.
4. **Step 3 Extract.** Each file is listed with what it was detected as. The ACORD card shows the fields read from the 125 and what is not on the form. Use "Prefill ACORD forms from the case" to see the forms filled from the case with Confirm marks.
5. **Step 4 Confirm.** The bar says how many fields need you; "Show all 9 fields" opens the rest. Apply. The completeness check follows.
6. **Triage actions (any time at Step 2).**
   - Import `FOLLOWUP_email.txt` as a second case after putting the real case id in it: "Attach to SUB-...".
   - Import `NOT_A_SUBMISSION.txt`: "Discard" with a reason.
7. **Step 5 Enrich & Check.** Loss run analysis (one open claim, the year with no loss run), Driver records (Dana Ortiz is High risk, her licence is suspended), Fleet mileage from IFTA (the application's states omit NM), statement of values.
8. **Step 8 Decision Brief.** Every check with its result and the reply drafts.
9. **Step 9 Authority.** A $1,000,000 risk is within a Senior Underwriter; to show a referral, sign in as Sarah Jenkins with a larger exposure.
10. **After the bind (Step 13 then 14).** The Federal filings card: attach the MCS-90, record the BMC-91X filing, record that it is on FMCSA's record.
11. **Bell in the header.** Referral, decision, assignment and reminder notices for whoever is signed in.

Everything here is invented sample data.
