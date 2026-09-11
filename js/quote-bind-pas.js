// 6B. STEP 7: ACTUARIAL IMPORTED RATING ENGINE & FINAL QUOTE STUDIO
// ============================================================================
const DEFAULT_IMPORTED_RATING_JSON = {
  "quote": {
    "lob": "Commercial Trucking",
    "state": "TX",
    "ratingVersion": "v2026.03",
    "coveragePremium": 35062,
    "discounts": [
      {
        "name": "Claims-Free Credit",
        "value": -0.08,
        "amt": -2805,
        "why": "No claims in prior 3 years"
      }
    ],
    "surcharges": [],
    "creditsNotApplied": [
      {
        "name": "Renewal Discount",
        "code": "DISC_RENEWAL",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "CDL Experience Discount",
        "code": "DISC_CDL",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "Dashcam / Telematics",
        "code": "DISC_DASHCAM",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "Multi-Policy Discount",
        "code": "DISC_MULTI",
        "reason": "Submission does not carry the data to evaluate: Bundled with GL or Property",
        "undetermined": true
      },
      {
        "name": "Paid-In-Full Discount",
        "code": "DISC_PIF",
        "reason": "Condition not met: Premium paid in full at binding",
        "undetermined": false
      },
      {
        "name": "Safety Program Credit",
        "code": "DISC_SAFETY",
        "reason": "Submission does not carry the data to evaluate: Documented written safety program",
        "undetermined": true
      },
      {
        "name": "FMCSA Alert Surcharge",
        "code": "SUR_FMCSA",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "OOS Vehicle Violations",
        "code": "SUR_OOSV",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "OOS Driver Violations",
        "code": "SUR_OOSD",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "Hazmat Operations",
        "code": "SUR_HAZMAT",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "High-Risk Driver",
        "code": "SUR_DRV",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "No Dashcam Surcharge",
        "code": "SUR_NODASH",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      },
      {
        "name": "Unassigned Driver",
        "code": "SUR_UNASSIGN",
        "reason": "Submission does not carry the data to evaluate: Vehicle with no rated driver assigned",
        "undetermined": true
      },
      {
        "name": "New Venture Debit",
        "code": "SUR_NEWVEN",
        "reason": "Already priced in the rating chain",
        "undetermined": false
      }
    ],
    "fees": [
      {
        "name": "Policy Fee",
        "code": "FEE_POLICY",
        "valueType": "Fixed",
        "unit": 150,
        "qty": 1,
        "amt": 150,
        "chargeType": "Per Policy",
        "taxable": false
      },
      {
        "name": "Broker Fee",
        "code": "FEE_BROKER",
        "valueType": "Percent",
        "pct": 8,
        "percentOf": "Premium Before Fees",
        "base": 32257,
        "capped": "max",
        "minFee": 250,
        "maxFee": 2500,
        "qty": 1,
        "amt": 2500,
        "chargeType": "Per Policy",
        "taxable": false
      },
      {
        "name": "Inspection Fee",
        "code": "FEE_INSPECT",
        "valueType": "Fixed",
        "unit": 75,
        "qty": 1,
        "amt": 75,
        "chargeType": "Per Policy",
        "taxable": false
      },
      {
        "name": "Driver Surcharge Fee",
        "code": "FEE_DRVSUR",
        "valueType": "Fixed",
        "unit": 85,
        "qty": 2,
        "amt": 170,
        "chargeType": "Per Driver",
        "taxable": false
      },
      {
        "name": "MVR / CSA Report Fee",
        "code": "FEE_MVR",
        "valueType": "Fixed",
        "unit": 12,
        "qty": 3,
        "amt": 36,
        "chargeType": "Per Driver",
        "taxable": false
      },
      {
        "name": "Vehicle Inspection Fee",
        "code": "FEE_VEHINSP",
        "valueType": "Fixed",
        "unit": 45,
        "qty": 1,
        "amt": 45,
        "chargeType": "Per Vehicle",
        "taxable": false
      },
      {
        "name": "Managing General Agent Fee",
        "code": "FEE_MGA",
        "valueType": "Percent",
        "pct": 5,
        "percentOf": "Premium Before Fees",
        "base": 32257,
        "capped": null,
        "minFee": 100,
        "maxFee": 0,
        "qty": 1,
        "amt": 1613,
        "chargeType": "Per Policy",
        "taxable": false
      },
      {
        "name": "Surplus Lines Filing Fee",
        "code": "FEE_SLFILE",
        "valueType": "Percent",
        "pct": 0.35,
        "percentOf": "Premium + Taxes",
        "base": 33821,
        "capped": null,
        "minFee": 25,
        "maxFee": 500,
        "qty": 1,
        "amt": 118,
        "chargeType": "Per Policy",
        "taxable": false
      },
      {
        "name": "Terrorism (TRIA) Charge",
        "code": "FEE_TRIA",
        "valueType": "Percent",
        "pct": 1.5,
        "percentOf": "Coverage Premium",
        "base": 35062,
        "capped": null,
        "minFee": 0,
        "maxFee": 0,
        "qty": 1,
        "amt": 526,
        "chargeType": "Per Policy",
        "taxable": true
      }
    ],
    "taxPct": 0.048499999999999995,
    "tax": 1590,
    "countyName": "Denton County",
    "countyRate": 0.55,
    "countyTax": 180,
    "finalPremium": 39260,
    "minimumApplied": false
  },
  "coverages": [
    {
      "name": "Auto Liability",
      "subtotal": 15440,
      "factors": [
        {
          "label": "Territory Base Loss Cost (per unit)",
          "value": 837,
          "base": null,
          "driver": "Garaging State + ZIP",
          "input": "TX 76262",
          "matched": "CA_Liab_LC — TX territory 027 (from ZIP 76262)"
        },
        {
          "label": "Increased Limits Factor (ILF)",
          "value": 2.06,
          "base": 1,
          "driver": "Liability Limit",
          "input": "$1,000,000",
          "matched": "$1,000,000 limit in TX"
        },
        {
          "label": "Liability Deductible Factor",
          "value": 0,
          "base": 0,
          "driver": "Liability Deductible",
          "input": "$0",
          "matched": "$0 deductible × 0.75 program deviation"
        },
        {
          "label": "Loss Cost Multiplier (LCM)",
          "value": 1.67,
          "base": 1.67,
          "driver": null,
          "input": null,
          "matched": "Program constant — same for every quote"
        },
        {
          "label": "Primary Class Factor",
          "value": 1.8,
          "base": null,
          "driver": "Vehicle Class (per unit)",
          "input": "Heavy Truck-Tractor - Long Distance D",
          "matched": "Class 332"
        },
        {
          "label": "Secondary Class Factor",
          "value": 1.98,
          "base": 1.98,
          "driver": "Secondary Class (per unit)",
          "input": "Account default",
          "matched": "Account default"
        },
        {
          "label": "Fleet Size Factor",
          "value": 0.97,
          "base": 1,
          "driver": "Number of rated power units",
          "input": "1 unit",
          "matched": "1-unit band, Heavy Trucks curve"
        },
        {
          "label": "Vehicle Age Factor",
          "value": 1.12,
          "base": 1,
          "driver": "Model Year (per unit)",
          "input": "3 yr old",
          "matched": "3 model years old"
        },
        {
          "label": "OCN Factor",
          "value": 1.14,
          "base": 1,
          "driver": "Vehicle stated value (per unit)",
          "input": "$500,000",
          "matched": "value band containing $500,000"
        },
        {
          "label": "Liability Radius Factor",
          "value": 0.95,
          "base": 1,
          "driver": "Radius of Operation",
          "input": "Intermediate",
          "matched": "Local-Intermediate · Local-200 (0 - 200 Miles)"
        },
        {
          "label": "NAICS Industry Factor",
          "value": 1.1,
          "base": 1,
          "driver": "Industry Classification (NAICS)",
          "input": "484110",
          "matched": "484110 — General Freight Trucking, Local"
        },
        {
          "label": "Tort Limitation Factor",
          "value": 1,
          "base": 1,
          "driver": "Garaging State",
          "input": "TX",
          "matched": "TX — standard tort"
        },
        {
          "label": "Vehicle Ownership Factor",
          "value": 0.95,
          "base": 1,
          "driver": "Vehicle ownership",
          "input": "Owned",
          "matched": "Owned"
        },
        {
          "label": "Pollution Factor",
          "value": 1.03,
          "base": 1,
          "driver": "Auto liability pollution grade",
          "input": "Low",
          "matched": "Low"
        },
        {
          "label": "Driver Criteria Factor",
          "value": 1,
          "base": 1,
          "driver": "Driver schedule vs filed criteria",
          "input": "All drivers meet criteria",
          "matched": "All drivers meet criteria"
        },
        {
          "label": "Loss Experience Factor",
          "value": 1,
          "base": 1,
          "driver": "Prior-term loss ratio",
          "input": "no prior experience",
          "matched": "No prior experience"
        },
        {
          "label": "Payment Plan Factor",
          "value": 1,
          "base": 1,
          "driver": "Bill type",
          "input": "Agency Bill",
          "matched": "Agency Bill"
        },
        {
          "label": "UW Credit / Debit",
          "value": 1,
          "base": 1,
          "driver": "Underwriter judgment",
          "input": "1",
          "matched": "clamped to 0.75–1.25"
        },
        {
          "label": "Heavy Farm Factor",
          "value": 1,
          "base": 1,
          "driver": "Vehicle use type",
          "input": "General Freight",
          "matched": "General Freight"
        },
        {
          "label": "Heavy Dumping Factor",
          "value": 1,
          "base": 1,
          "driver": "Vehicle use type",
          "input": "General Freight",
          "matched": "General Freight"
        },
        {
          "label": "Miles Driven Factor",
          "value": 1.03,
          "base": 1,
          "driver": "Annual Miles + Radius category",
          "input": "87,500 mi",
          "matched": "Local-Intermediate band"
        },
        {
          "label": "Rating Class Factor",
          "value": 1,
          "base": 1,
          "driver": "Cargo / Hauling Type",
          "input": "Dry Van or Box - Single Trailer",
          "matched": "Dry Van or Box - Single Trailer"
        },
        {
          "label": "Dashcam Factor",
          "value": 1.2,
          "base": 1,
          "driver": "Dashcams Installed",
          "input": "NO Dashcams",
          "matched": "NO Dashcams"
        },
        {
          "label": "CDL Experience Discount",
          "value": 1,
          "base": 1,
          "driver": "Driver CDL experience (per driver)",
          "input": "0 of 1 rated drivers have 3+ yrs",
          "matched": "0% qualified × 10% max discount"
        },
        {
          "label": "Driver Class Factor",
          "value": 0.95,
          "base": 1,
          "driver": "Driver age, violations & accidents",
          "input": "3 drivers, 2 with violations",
          "matched": "average of best 1 driver"
        },
        {
          "label": "Account-Level Factor",
          "value": 1.1,
          "base": 1,
          "driver": "8 underwriting questions",
          "input": "Business Experience +5%, Carrier Safety / FMCSA Alerts +10%, ICC Filing -5%",
          "matched": "1 + sum of credits/debits"
        },
        {
          "label": "Experience Mod",
          "value": 0.9,
          "base": 1,
          "driver": "Loss history (3yr claims & incurred)",
          "input": "0 claims > $500, $0 incurred",
          "matched": "credibility-weighted, 1 units × 36 mo"
        },
        {
          "label": "Rated Power Units",
          "value": 1,
          "base": null,
          "driver": "Vehicle Schedule",
          "input": "1 unit",
          "matched": "count of vehicles on the schedule"
        }
      ]
    },
    {
      "name": "Physical Damage",
      "subtotal": 19622,
      "factors": [
        {
          "label": "Total Insured Value (units + trailers)",
          "value": 500000,
          "base": null,
          "driver": "Vehicle & trailer stated values",
          "input": "1 unit",
          "matched": "sum of every unit's stated value plus its trailer"
        },
        {
          "label": "APD Rate (per $ of value)",
          "value": 0.0475,
          "base": 0.0475,
          "driver": "Vehicle stated value (per unit)",
          "input": "$500,000",
          "matched": "value band containing $500,000"
        },
        {
          "label": "APD Deductible Factor",
          "value": 0.875,
          "base": 1,
          "driver": "Physical Damage Deductible",
          "input": "$5,000",
          "matched": "$5,000 deductible"
        },
        {
          "label": "APD Radius Factor",
          "value": 0.95,
          "base": 1,
          "driver": "Radius of Operation",
          "input": "Intermediate",
          "matched": "Local-Intermediate · Local-200 (0 - 200 Miles)"
        },
        {
          "label": "Trailer PhysDam Factor",
          "value": 1,
          "base": 1,
          "driver": "Trailer Type (per unit)",
          "input": "None",
          "matched": "None"
        },
        {
          "label": "APD State Factor",
          "value": 0.95,
          "base": 1,
          "driver": "Garaging State",
          "input": "TX",
          "matched": "TX"
        },
        {
          "label": "APD Package Factor",
          "value": 0.9,
          "base": 1,
          "driver": "Coverages selected",
          "input": "Liability + Physical Damage",
          "matched": "Package policy — Yes"
        },
        {
          "label": "Miles Driven Factor",
          "value": 1.03,
          "base": 1,
          "driver": "Annual Miles + Radius category",
          "input": "87,500 mi",
          "matched": "Local-Intermediate band"
        },
        {
          "label": "Rating Class Factor",
          "value": 1,
          "base": 1,
          "driver": "Cargo / Hauling Type",
          "input": "Dry Van or Box - Single Trailer",
          "matched": "Dry Van or Box - Single Trailer"
        },
        {
          "label": "Dashcam Factor",
          "value": 1.2,
          "base": 1,
          "driver": "Dashcams Installed",
          "input": "NO Dashcams",
          "matched": "NO Dashcams"
        },
        {
          "label": "Experience Mod",
          "value": 0.9,
          "base": 1,
          "driver": "Loss history (3yr claims & incurred)",
          "input": "0 claims > $500, $0 incurred",
          "matched": "same mod as Auto Liability"
        }
      ]
    }
  ],
  "eligibility": {
    "declines": [],
    "refers": [
      "Fleet Size Minimum"
    ]
  },
  "adapter": {
    "fieldsMapped": 23,
    "warnings": []
  }
};

let isQuoteImported = false;
let currentImportedRatingData = null;

function toggleStep7View(mode) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
  if (mode === "summary") {
    isQuoteImported = false;
  } else {
    isQuoteImported = true;
    if (!currentImportedRatingData) {
      currentImportedRatingData = DEFAULT_IMPORTED_RATING_JSON;
    }
  }
  // Persist per-submission so this doesn't leak onto whichever submission
  // gets selected next.
  if (sub) {
    sub.isQuoteImported = isQuoteImported;
    sub.importedRatingData = currentImportedRatingData;
  }
  renderStep7View(sub);
}

function triggerSystemJsonUpload() {
  const input = document.getElementById("quoteJsonSystemDirectInput");
  if (input) {
    input.value = "";
    input.click();
  }
}

function handleSystemJsonFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  readAndProcessJsonFile(file);
}

function handleJsonDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const box = document.getElementById("jsonDropzoneBox");
  if (box) box.classList.add("dragover");
}

function handleJsonDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  const box = document.getElementById("jsonDropzoneBox");
  if (box) box.classList.remove("dragover");
}

function handleJsonFileDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const box = document.getElementById("jsonDropzoneBox");
  if (box) box.classList.remove("dragover");

  if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
    readAndProcessJsonFile(event.dataTransfer.files[0]);
  }
}

function recordQuoteVersion(sub, isBound = false) {
  if (!sub) sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];

  let subEntry = QUOTE_VERSIONS_DATASET.find(v => v.subId === sub.id);
  if (!subEntry) {
    subEntry = {
      subId: sub.id,
      insured: sub.insured,
      lob: sub.lobName || "Commercial Auto / Trucking",
      broker: sub.broker || "Marsh & McLennan Commercial Brokerage",
      apiSourced: !!sub.apiSourced,
      quotes: []
    };
    QUOTE_VERSIONS_DATASET.push(subEntry);
  }

  const existingCount = subEntry.quotes.length;
  const majorVer = existingCount + 1;
  const verTag = `v${majorVer}.0`;
  const baseQuoteId = sub.quoteNo || sub.quote_id || `QT-2026-${sub.id.replace(/[^0-9]/g, '')}`;
  const rawId = baseQuoteId.split('-v')[0];
  const versionId = `${rawId}-${verTag}`;

  subEntry.quotes.forEach(q => {
    q.isLatest = false;
    if (q.status === "Official Bindable Quote" || q.status === "Active Quote") {
      q.status = "Previous Version (Revised)";
      q.statusBadge = "badge-secondary";
    }
  });

  const dp = ensureDiscretionaryPricingSeed(sub);
  const currentPrem = dp.finalPremium || (currentImportedRatingData && currentImportedRatingData.quote && currentImportedRatingData.quote.finalPremium) || getSubmissionPremium(sub);
  const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;

  const newQuoteVersion = {
    versionId: versionId,
    versionTag: verTag,
    quoteNo: versionId,
    type: isBound ? "Bound & Policy Issued" : (isQuoteImported ? "Imported JSON Rating Engine Quote" : "Underwriter Issued Quote"),
    date: new Date().toISOString().slice(0, 16).replace("T", " "),
    author: `${roleConfig.name} (${roleConfig.title})`,
    baseCoveragePremium: Math.round(currentPrem * 0.85),
    appliedDiscounts: 0,
    feesAndTaxes: Math.round(currentPrem * 0.15),
    premium: currentPrem,
    finalPremium: currentPrem,
    liabilityLimit: sub.exposure ? `$${sub.exposure} CSL` : "$1,000,000 CSL",
    pdDeductible: "$2,500",
    status: isBound ? "Bound Policy Issued" : "Official Bindable Quote",
    statusBadge: isBound ? "badge-success" : "badge-primary",
    isBound: isBound,
    isLatest: true,
    notes: `Quote ${verTag} recorded with Final Quoted Premium: $${currentPrem.toLocaleString()}`,
    ratingPayload: currentImportedRatingData || getSubmissionRatingPayload(sub)
  };

  subEntry.quotes.push(newQuoteVersion);
  sub.quoteNo = versionId;
  sub.quote_id = versionId;

  if (currentPage === "quote-versions") {
    renderQuoteVersionsLedger();
  }

  return newQuoteVersion;
}

function applyImportedRatingDataToSubmission(parsed, sub) {
  currentImportedRatingData = parsed;
  isQuoteImported = true;
  // Persist onto the submission itself — this is the real fix for rating
  // data leaking across submissions: each submission now remembers its own
  // imported payload, and selectSubmission() re-syncs the globals from here
  // whenever the active submission changes.
  if (sub) {
    sub.importedRatingData = parsed;
    sub.isQuoteImported = true;
  }

  if (parsed && parsed.quote) {
    const rawPrem = parsed.quote.finalPremium !== undefined 
      ? parsed.quote.finalPremium 
      : (parsed.quote.totalPremium !== undefined ? parsed.quote.totalPremium : parsed.quote.annualPremium);

    if (rawPrem !== undefined && rawPrem !== null) {
      const numPrem = parseFloat(String(rawPrem).replace(/[^0-9.]/g, ""));
      if (!isNaN(numPrem) && numPrem > 0) {
        parsed.quote.finalPremium = numPrem;
        
        // Sync discretionary pricing so Final Quoted Premium, TOTAL BINDABLE POLICY PREMIUM, and Final Annual Total match
        sub.discretionaryPricing = {
          basePremium: numPrem,
          adjustmentType: null,
          adjustmentPercent: 0,
          reason: "Imported Rating Engine Output JSON",
          appliedBy: "System Rating Import",
          appliedAt: new Date().toISOString(),
          finalPremium: numPrem
        };
        sub.currentPremium = numPrem;
      }
    }
  }

  recordQuoteVersion(sub, false);
}

/**
 * Accepts either a genuine rating-engine-output JSON ({quote, coverages})
 * or a product-schema JSON (the "Integrating API" shape — productId/product/
 * studios) and normalizes both into a rating-engine payload. This bridges
 * the two previously-unrelated JSON formats so feeding the wrong one in
 * doesn't just fail — it gets adapted automatically when it can be.
 * Returns { payload, adapted } on success, or { error } listing exactly
 * what's missing/wrong so the caller can show an actionable message.
 */
function normalizeRatingEngineJson(parsed, sub) {
  if (!parsed || typeof parsed !== "object") {
    return { error: "File does not contain a valid JSON object." };
  }
  if (parsed.quote && parsed.coverages) {
    return { payload: parsed, adapted: false };
  }
  if (parsed.productId || parsed.product || parsed.studios) {
    try {
      const adapted = buildDynamicRatingPayloadFromProduct(parsed, sub);
      return { payload: adapted, adapted: true };
    } catch (e) {
      return { error: "Recognized this as a product-schema JSON, but couldn't derive a rating payload from it: " + e.message };
    }
  }
  return { error: "Unrecognized JSON shape — expected either a rating-engine payload ('quote' + 'coverages' keys) or a product-schema JSON ('productId'/'product'/'studios' keys)." };
}

function readAndProcessJsonFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    try {
      const parsed = JSON.parse(text);
      const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
      const normalized = normalizeRatingEngineJson(parsed, sub);
      if (normalized.error) {
        throw new Error(normalized.error);
      }
      const ratingPayload = normalized.payload;

      applyImportedRatingDataToSubmission(ratingPayload, sub);

      // Update textarea and file indicator if modal is open
      const textarea = document.getElementById("importQuoteJsonTextarea");
      if (textarea) textarea.value = JSON.stringify(ratingPayload, null, 2);

      const fileIndicator = document.getElementById("loadedFileIndicator");
      const fileNameSpan = document.getElementById("loadedFileName");
      const fileSizeSpan = document.getElementById("loadedFileSize");
      if (fileIndicator && fileNameSpan && fileSizeSpan) {
        fileNameSpan.textContent = file.name;
        fileSizeSpan.textContent = (file.size / 1024).toFixed(1) + " KB";
        fileIndicator.style.display = "flex";
      }

      // Render quote directly below summary
      renderStep7View(sub);
      closeImportQuoteJsonModal();

      setTimeout(() => {
        const quoteArea = document.getElementById("step7GeneratedQuoteArea");
        if (quoteArea) {
          quoteArea.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);

      const adaptedNote = normalized.adapted ? " (auto-adapted from a product-schema JSON)" : "";
      showToast(`🎉 File "${file.name}" imported successfully${adaptedNote}! Final Quoted Premium: $${ratingPayload.quote.finalPremium ? ratingPayload.quote.finalPremium.toLocaleString() : '39,260'}`, "success");
      persistAppState();
    } catch (err) {
      showToast("⛔ JSON File Parsing Error: " + err.message, "danger");
    }
  };
  reader.onerror = function() {
    showToast("Failed to read JSON file from system", "danger");
  };
  reader.readAsText(file);
}

function openImportQuoteJsonModal() {
  const modal = document.getElementById("importQuoteJsonModal");
  const textarea = document.getElementById("importQuoteJsonTextarea");
  if (!modal) return;

  if (textarea) {
    textarea.value = JSON.stringify(currentImportedRatingData || DEFAULT_IMPORTED_RATING_JSON, null, 2);
  }

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeImportQuoteJsonModal() {
  const modal = document.getElementById("importQuoteJsonModal");
  if (modal) {
    modal.style.display = "none";
    document.body.style.overflow = "auto";
  }
}

function loadSampleRatingJson() {
  const textarea = document.getElementById("importQuoteJsonTextarea");
  if (textarea) {
    textarea.value = JSON.stringify(DEFAULT_IMPORTED_RATING_JSON, null, 2);
    showToast("Loaded standard Commercial Trucking rating JSON sample", "info");
  }
}

function handleApplyImportedJson() {
  const textarea = document.getElementById("importQuoteJsonTextarea");
  if (!textarea) return;

  try {
    const parsed = JSON.parse(textarea.value);
    const sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];
    const normalized = normalizeRatingEngineJson(parsed, sub);
    if (normalized.error) {
      throw new Error(normalized.error);
    }
    const ratingPayload = normalized.payload;

    applyImportedRatingDataToSubmission(ratingPayload, sub);

    renderStep7View(sub);
    closeImportQuoteJsonModal();

    setTimeout(() => {
      const quoteArea = document.getElementById("step7GeneratedQuoteArea");
      if (quoteArea) {
        quoteArea.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);

    const adaptedNote = normalized.adapted ? " (auto-adapted from a product-schema JSON)" : "";
    showToast(`⚡ Rating JSON successfully applied${adaptedNote}! Final Quoted Premium: $${ratingPayload.quote.finalPremium ? ratingPayload.quote.finalPremium.toLocaleString() : '39,260'}`, "success");
    persistAppState();
  } catch (err) {
    showToast("⛔ JSON Parsing Error: " + err.message, "danger");
  }
}

function renderStep7View(sub) {
  const container = document.getElementById("step7MainContentContainer");
  if (!container) return;
  if (!sub) sub = SUBMISSIONS_DATASET.find(s => s.id === activeSubmissionId) || SUBMISSIONS_DATASET[0];

  // Discretionary Pricing (Base Premium, Credit/Debit, Taxes & Fees) is only
  // shown AFTER the rating engine JSON has been imported — there is no
  // rated base premium to apply a credit/debit against before that.
  const dpContainer = document.getElementById("discretionaryPricingContainer");
  if (dpContainer) {
    dpContainer.innerHTML = (isQuoteImported && currentImportedRatingData)
      ? renderDiscretionaryPricingCard(sub)
      : "";
  }

  const titleEl = document.getElementById("step7HeaderTitle");
  const descEl = document.getElementById("step7HeaderDesc");
  const pillEl = document.getElementById("step7PhasePill");

  if (!isQuoteImported || !currentImportedRatingData) {
    if (pillEl) pillEl.innerHTML = `<i class="ph ph-calculator"></i> Step 7 • Quote & Bind Studio`;
    if (titleEl) titleEl.textContent = "Commercial Trucking Formal Quote & Binding";
    if (descEl) descEl.textContent = "Import rating engine JSON output from your local system to generate and bind the commercial quote.";

    container.innerHTML = `
      <div class="import-rating-hub-card">
        <div class="import-hub-header">
          <div class="import-hub-header-left">
            <div class="import-hub-badge-icon">
              <i class="ph ph-cpu"></i>
            </div>
            <div>
              <h3>Actuarial Rating Engine Integration</h3>
              <p>Connect and parse external rating engine computation payload</p>
            </div>
          </div>
          <span class="badge badge-warning font-mono" style="font-size: 11px; padding: 5px 10px;">
            <i class="ph ph-circle-notch ph-spin"></i> Awaiting Payload
          </span>
        </div>

        <div class="import-hub-dropzone-body" id="step7JsonDropzone" onclick="triggerSystemJsonUpload()" ondragover="handleJsonDragOver(event)" ondragleave="handleJsonDragLeave(event)" ondrop="handleJsonFileDrop(event)" title="Click to browse .json file from your system">
          <div class="import-hub-icon-wrapper">
            <i class="ph ph-cloud-arrow-up"></i>
          </div>
          <div class="import-hub-title">Import Rating Engine Output JSON</div>
          <p class="import-hub-desc">
            Drag & drop the actuarial output <code>.json</code> file from your computer here, or click the button below to browse your local filesystem.
          </p>

          <div class="import-hub-btn-row">
            <button type="button" class="btn btn-warning btn-lg" onclick="event.stopPropagation(); triggerSystemJsonUpload();" style="font-weight: 800; padding: 12px 28px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border: none; color: #ffffff; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4); font-size: 14.5px; border-radius: 8px;">
              <i class="ph ph-folder-open"></i> Browse Rating JSON from System
            </button>
          </div>

          <div class="import-features-strip">
            <div class="import-feature-chip"><i class="ph ph-lightning text-warning"></i> Auto Liability & PhysDam Rates</div>
            <div class="import-feature-chip"><i class="ph ph-chart-pie text-primary"></i> 28 Actuarial Factor Dimensions</div>
            <div class="import-feature-chip"><i class="ph ph-tag text-success"></i> Discretionary Credits</div>
            <div class="import-feature-chip"><i class="ph ph-receipt text-danger"></i> Itemized Taxes & Fees</div>
            <div class="import-feature-chip"><i class="ph ph-shield-check text-info"></i> 14 Underwriting Rule Evaluations</div>
          </div>
        </div>

        <div class="import-hub-footer">
          <span><i class="ph ph-shield-check text-primary"></i> Schema: <strong>Trucking Rating Payload (v2026.03)</strong></span>
          <span><i class="ph ph-checks text-success"></i> Real-Time Quote Calculation Ready</span>
        </div>
      </div>
    `;
    return;
  }

  // Once JSON is imported, render the generated quote!
  if (pillEl) pillEl.innerHTML = `<i class="ph ph-check-circle text-success"></i> Step 7 • Quote Generated`;
  if (titleEl) titleEl.textContent = "Commercial Trucking Formal Quote & Binding";
  if (descEl) descEl.textContent = "Generated from imported rating engine output JSON. Actuarial factors decomposed, fees itemized, and terms bindable.";

  container.innerHTML = getGeneratedQuoteHtml(currentImportedRatingData, sub) + getPASSyncCardHtml(sub);
}

// ============================================================================
// QUOTE-BIND-ISSUE → PAS (POLICY ADMIN SYSTEM) INTEGRATION — simulated but
// functionally real: generates a policy number, records a PAS sync
// timestamp/record ID, and gates on RBAC + human decision, mirroring a real
// async system-to-system bind request rather than being purely decorative.
// ============================================================================
const PAS_LOB_PREFIX = {
  trucking: "CAT", property: "CPP", mpl: "PRO", gl_cpc: "GLC", gl_cas: "GLX", prd016: "MTR"
};

function generatePASPolicyNumber(sub) {
  const prefix = PAS_LOB_PREFIX[sub.lobKey] || "POL";
  const year = new Date().getFullYear();
  let hash = 0;
  const seed = sub.id + Date.now();
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const serial = String(hash % 900000 + 100000);
  return `${prefix}-${year}-${serial}`;
}

function getPASSyncCardHtml(sub) {
  if (sub.pasSync && sub.pasSync.status === "success") {
    const p = sub.pasSync;
    return `
      <div class="card mt-3" style="border-color:#a7f3d0;">
        <div class="card-header">
          <h3><i class="ph ph-check-circle" style="color:var(--color-success);"></i> Synced to Policy Admin System (PAS)</h3>
          <span class="badge badge-success">Sync Successful</span>
        </div>
        <div class="card-body">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:12px; font-size:13px;">
            <div><span class="text-xs text-muted">Policy Number</span><br><strong class="font-mono">${p.policyNumber}</strong></div>
            <div><span class="text-xs text-muted">PAS Record ID</span><br><strong class="font-mono">${p.pasRecordId}</strong></div>
            <div><span class="text-xs text-muted">Effective Date</span><br><strong>${p.effectiveDate}</strong></div>
            <div><span class="text-xs text-muted">Synced By</span><br><strong>${p.syncedBy}</strong></div>
            <div><span class="text-xs text-muted">Synced At</span><br><strong>${p.syncedAt}</strong></div>
          </div>
        </div>
      </div>`;
  }

  // Gate 1: Underwriter must have pressed "Issue Quote" first. Before that,
  // there's nothing to bind — the quote hasn't gone to the customer/broker yet.
  if (!sub.quoteIssued) {
    return `
      <div class="card mt-3" id="pasSyncCard">
        <div class="card-header">
          <h3><i class="ph ph-arrows-clockwise"></i> Policy Admin System (PAS) Integration</h3>
          <span class="badge badge-secondary">Locked</span>
        </div>
        <div class="card-body">
          <p class="text-xs text-muted mb-0"><i class="ph ph-lock"></i> Available once the quote has been issued to the broker/customer via <strong>Issue Quote</strong> above, and the customer has approved it.</p>
        </div>
      </div>`;
  }

  // Gate 2: Customer approval — the quote was sent, but nothing binds it to
  // a policy until the customer has actually approved it. This simulates
  // that external customer-side action (e.g. a signed acceptance in their
  // portal) since there's no real customer system to call here.
  if (!sub.customerApproved) {
    return `
      <div class="card mt-3" id="pasSyncCard">
        <div class="card-header">
          <h3><i class="ph ph-arrows-clockwise"></i> Policy Admin System (PAS) Integration</h3>
          <span class="badge badge-warning">Awaiting Customer Approval</span>
        </div>
        <div class="card-body">
          <p class="text-xs text-muted mb-2">Quote has been issued. Binding is disabled until the customer approves the quote (simulates the customer's acceptance of the issued quote).</p>
          <button class="btn btn-outline" id="customerApproveBtn" onclick="simulateCustomerApproval('${sub.id}')">
            <i class="ph ph-user-check"></i> Simulate Customer Approval
          </button>
        </div>
      </div>`;
  }

  const priorFailure = (sub.pasSync && sub.pasSync.status === "failed") ? sub.pasSync : null;

  return `
    <div class="card mt-3" id="pasSyncCard">
      <div class="card-header">
        <h3><i class="ph ph-arrows-clockwise"></i> Policy Admin System (PAS) Integration</h3>
        <span class="badge ${priorFailure ? 'badge-danger' : 'badge-success'}">${priorFailure ? 'Last Attempt Failed' : 'Customer Approved • Ready to Bind'}</span>
      </div>
      <div class="card-body">
        <p class="text-xs text-muted mb-2">Binding this quote submits a bind request to the downstream Policy Admin System, which returns a system-of-record policy number and confirms issuance.</p>
        <div id="pasSyncStatusArea">${priorFailure ? `<div class="alert alert-danger u-fs-12"><i class="ph ph-warning-circle"></i> <strong>Bind failed (${priorFailure.code}):</strong> ${priorFailure.message}</div>` : ''}</div>
        <button class="btn btn-primary" id="pasSyncBindBtn" onclick="simulatePASBindSync('${sub.id}')">
          <i class="ph ph-arrows-clockwise"></i> ${priorFailure ? 'Retry Bind &amp; Sync to PAS' : 'Bind &amp; Sync to PAS'}
        </button>
      </div>
    </div>`;
}

function simulateCustomerApproval(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  sub.customerApproved = true;
  sub.customerApprovedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

  if (!sub.decisionLog) sub.decisionLog = [];
  sub.decisionLog.push({
    step: 7,
    decision: "customer_approved",
    by: sub.insured || "Customer",
    at: sub.customerApprovedAt,
    notes: "Customer approved the issued quote — ready to bind & sync to PAS."
  });

  showToast(`✅ ${sub.insured} approved the quote. Ready to bind & sync to PAS.`, "success");
  renderStep7View(sub);
  renderSubmissionsTable();
  refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
}
window.simulateCustomerApproval = simulateCustomerApproval;

function simulatePASBindSync(subId) {
  const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
  if (!sub) return;

  if (!hasPermission("workflow", "approve")) {
    denyPermission("workflow", "approve");
    return;
  }

  // Defense-in-depth: even if this got called out of band, don't allow a
  // bind unless the quote was actually issued and the customer approved it.
  if (!sub.quoteIssued) {
    showToast("⛔ Issue the quote before binding & syncing to PAS.", "danger");
    return;
  }
  if (!sub.customerApproved) {
    showToast("⛔ Customer approval is required before binding & syncing to PAS.", "danger");
    return;
  }

  const btn = document.getElementById("pasSyncBindBtn");
  const statusArea = document.getElementById("pasSyncStatusArea");
  if (btn) { btn.disabled = true; btn.innerHTML = `<i class="ph ph-circle-notch"></i> Submitting bind request to PAS...`; }
  if (statusArea) statusArea.innerHTML = `<div class="alert alert-info u-fs-12"><i class="ph ph-circle-notch"></i> Contacting Policy Admin System...</div>`;

  setTimeout(() => {
    if (btn) btn.innerHTML = `<i class="ph ph-circle-notch"></i> PAS validating bind request...`;

    setTimeout(() => {
      // Simulated failure path — a real downstream PAS integration doesn't
      // always succeed (timeout, duplicate policy number rejection, etc.).
      // ~15% failure rate here so the workflow actually demonstrates
      // handling an integration failure, not just the happy path.
      const failureRoll = Math.random();
      if (failureRoll < 0.15) {
        const failureReasons = [
          { code: "PAS_TIMEOUT", msg: "Policy Admin System did not respond within the expected window (timeout after 30s)." },
          { code: "PAS_DUP_POLICY", msg: "PAS rejected the bind request: a policy record already exists for this submission ID." },
          { code: "PAS_VALIDATION_FAILED", msg: "PAS validation failed: coverage/limit combination does not match a filed program in the target state." }
        ];
        const failure = failureReasons[Math.floor(Math.random() * failureReasons.length)];

        sub.pasSync = { status: "failed", code: failure.code, message: failure.msg, failedAt: new Date().toISOString().slice(0, 16).replace("T", " ") };

        if (!sub.decisionLog) sub.decisionLog = [];
        sub.decisionLog.push({
          step: 7,
          decision: "bind_sync_failed",
          by: (USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior).name,
          at: sub.pasSync.failedAt,
          notes: `PAS bind/sync failed (${failure.code}): ${failure.msg}`
        });

        if (statusArea) statusArea.innerHTML = `<div class="alert alert-danger u-fs-12"><i class="ph ph-warning-circle"></i> <strong>Bind failed (${failure.code}):</strong> ${failure.msg}</div>`;
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="ph ph-arrows-clockwise"></i> Retry Bind &amp; Sync to PAS`; }

        showToast(`⛔ PAS bind/sync failed: ${failure.msg}`, "danger");
        renderSubmissionsTable();
        refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
        return;
      }

      const roleConfig = USER_ROLES_CONFIG[currentUserRole] || USER_ROLES_CONFIG.junior;
      const policyNumber = generatePASPolicyNumber(sub);
      const pasRecordId = `PAS-REC-${Math.floor(100000 + Math.random() * 900000)}`;
      const now = new Date();
      const effectiveDate = now.toISOString().slice(0, 10);
      const syncedAt = now.toISOString().slice(0, 16).replace("T", " ");

      sub.pasSync = {
        status: "success",
        policyNumber,
        pasRecordId,
        effectiveDate,
        syncedBy: `${roleConfig.name} (${roleConfig.title})`,
        syncedAt
      };

      if (!sub.decisionLog) sub.decisionLog = [];
      sub.decisionLog.push({
        step: 7,
        decision: "bound_and_synced",
        by: sub.pasSync.syncedBy,
        at: syncedAt,
        notes: `Bound and synced to PAS. Policy Number: ${policyNumber}, PAS Record ID: ${pasRecordId}.`
      });

      sub.statusText = "Policy Issued";
      sub.statusBadge = "badge-success";
      if (!sub.completedSteps) sub.completedSteps = [];
      if (!sub.completedSteps.includes(7)) sub.completedSteps.push(7);

      recordQuoteVersion(sub, true);

      const container = document.getElementById("step7MainContentContainer");
      if (container) {
        container.innerHTML = getGeneratedQuoteHtml(currentImportedRatingData, sub) + getPASSyncCardHtml(sub);
      }

      showToast(`✅ Bound and synced to PAS. Policy Number: ${policyNumber}`, "success");
      renderSubmissionsTable();
      refreshTeamActivityIfVisible(); refreshAuditLogIfVisible(); persistAppState();
    }, 900);
  }, 900);
}

// Cost-Breakdown-by-Category helpers (Fee Schedule / Credits redesign) —
// classify each fee into a display category using its code/name/chargeType,
// since the source rating payload doesn't carry an explicit category field.
function categorizeFee(f) {
  var n = ((f.name || "") + " " + (f.code || "")).toLowerCase();
  if (n.indexOf("surcharge") !== -1 || n.indexOf("hrisk") !== -1 || n.indexOf("high-risk") !== -1 || n.indexOf("yngdrv") !== -1 || n.indexOf("young") !== -1 || n.indexOf("sr22") !== -1 || n.indexOf("sr-22") !== -1) return "Surcharges";
  if (n.indexOf("inspect") !== -1 || n.indexOf("mvr") !== -1 || n.indexOf("csa") !== -1 || n.indexOf("report") !== -1) return "Reports & Verification";
  if (f.chargeType === "Per Driver") return "Driver-Level Fees";
  return "Policy-Level Fees";
}

const FEE_CATEGORY_COLORS = {
  "Policy-Level Fees": "#475569",
  "Driver-Level Fees": "#C2540D",
  "Reports & Verification": "#65783F",
  "Surcharges": "#B45309"
};
const FEE_CATEGORY_ORDER = ["Policy-Level Fees", "Driver-Level Fees", "Reports & Verification", "Surcharges"];

function renderCostBreakdownSection(title, subtitleCount, totalLabel, totalAmt, rows, opts) {
  opts = opts || {};
  const grouped = opts.grouped;
  let barAndLegendHtml = "";
  let bodyHtml = "";

  if (grouped) {
    // Group rows by category, compute per-category subtotal + % of total.
    const groups = {};
    rows.forEach(r => {
      const cat = categorizeFee(r);
      if (!groups[cat]) groups[cat] = { rows: [], subtotal: 0 };
      groups[cat].rows.push(r);
      groups[cat].subtotal += (r.amt || 0);
    });
    const orderedCats = FEE_CATEGORY_ORDER.filter(c => groups[c]);
    const grandTotal = orderedCats.reduce((s, c) => s + groups[c].subtotal, 0) || 1;

    barAndLegendHtml = `
      <div class="cbc-bar-track">
        ${orderedCats.map(c => `<div class="cbc-bar-seg" style="width:${(groups[c].subtotal / grandTotal * 100).toFixed(1)}%; background:${FEE_CATEGORY_COLORS[c]};"></div>`).join("")}
      </div>
      <div class="cbc-legend">
        ${orderedCats.map(c => `<span class="cbc-legend-item"><span class="cbc-legend-dot" style="background:${FEE_CATEGORY_COLORS[c]};"></span>${c} ${(groups[c].subtotal / grandTotal * 100).toFixed(0)}%</span>`).join("")}
      </div>`;

    bodyHtml = orderedCats.map(c => `
      <div class="cbc-group-header">
        <span><span class="cbc-legend-dot" style="background:${FEE_CATEGORY_COLORS[c]};"></span><strong>${c}</strong></span>
        <strong class="font-mono">$${groups[c].subtotal.toLocaleString()}</strong>
      </div>
      ${groups[c].rows.map(f => renderCostBreakdownRow(f)).join("")}
    `).join("");
  } else {
    bodyHtml = rows.length ? rows.map(r => renderCostBreakdownRow(r)).join("") : `<div class="text-xs text-muted" style="padding:14px 0;">${opts.emptyText || 'None on file.'}</div>`;
  }

  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-body">
        <div class="cbc-header">
          <div>
            <div class="cbc-title">${title}</div>
            <div class="cbc-subtitle">${subtitleCount}</div>
          </div>
          <div class="cbc-total">
            <div class="cbc-total-label">${totalLabel}</div>
            <div class="cbc-total-val">${totalAmt}</div>
          </div>
        </div>
        ${barAndLegendHtml}
        <div class="table-responsive" style="max-height: 420px; overflow-y: auto;">
          ${bodyHtml}
        </div>
      </div>
    </div>`;
}

function renderCostBreakdownRow(r) {
  // Works for fees (name/code/chargeType/amt), discounts (name/value/amt/why),
  // and evaluated-not-applied rules (name/code/reason/undetermined) — whichever
  // fields exist are used, nothing invented.
  const name = r.name || "—";
  const code = r.code || "";
  const desc = r.valueType === "Percent" ? `${r.pct}% of ${r.percentOf}` :
               (r.unit !== undefined ? `$${r.unit} Flat${r.qty > 1 ? ` × ${r.qty}` : ''}` :
               (r.value !== undefined ? `${(r.value * 100).toFixed(0)}% Credit` : (r.reason || '')));
  const pillText = r.chargeType || (r.value !== undefined ? "Discount" : (r.undetermined ? "Undetermined" : (r.reason && r.reason.includes("priced") ? "Priced in Chain" : "Condition Not Met")));
  const amtDisplay = r.amt !== undefined ? `${r.value !== undefined || (r.amt < 0) ? '-' : ''}$${Math.abs(r.amt).toLocaleString()}` : null;
  const subDesc = r.why || r.reason || "";

  return `
    <div class="cbc-row">
      <div class="cbc-row-name">
        <strong>${name}</strong>
        ${code ? `<span class="cbc-row-code">${code}</span>` : (subDesc ? `<span class="cbc-row-code">${subDesc}</span>` : '')}
      </div>
      <div class="cbc-row-desc">${desc}</div>
      <div class="cbc-row-badge"><span class="cbc-pill">${pillText}</span></div>
      <div class="cbc-row-amt">${amtDisplay !== null ? amtDisplay : ''}</div>
    </div>`;
}

function getGeneratedQuoteHtml(data, sub) {
  const q = data.quote || {};
  const coverages = data.coverages || [];
  const fees = q.fees || [];
  const discounts = q.discounts || [];
  const notApplied = q.creditsNotApplied || [];
  const eligibility = data.eligibility || { declines: [], refers: [] };
  const adapter = data.adapter || { fieldsMapped: 23, warnings: [] };

  // Map the quote's final premium to the Underwriting Discretionary Pricing
  // (Post-Rating) outcome, so "TOTAL BINDABLE POLICY PREMIUM" and "Final
  // Annual Total" always match the Final Quoted Premium shown on that card.
  // Only applies when `sub` is a real tracked submission (this function is
  // also called from the Quote Version History preview with a different,
  // unrelated flat quote-record shape that has no discretionary pricing).
  const isTrackedSubmission = sub && sub.id && SUBMISSIONS_DATASET.some(s => s.id === sub.id);
  if (isTrackedSubmission) {
    const dp = ensureDiscretionaryPricingSeed(sub);
    q.finalPremium = dp.finalPremium;
  }

  const totalFeeAmt = fees.reduce((sum, f) => sum + (f.amt || 0), 0);
  const totalTaxAmt = (q.tax || 0) + (q.countyTax || 0);
  const discountAmt = discounts.reduce((sum, d) => sum + Math.abs(d.amt || 0), 0);

  return `
    <!-- Top Quote Generated Status Header -->
    <div class="quote-generated-badge-strip mb-3">
      <div class="u-row-gap10">
        <i class="ph ph-check-circle text-success" style="font-size: 20px;"></i>
        <div>
          <span style="font-size: 13.5px; font-weight: 800; color: #166534;">Commercial Trucking Formal Bindable Quote</span>
          <div class="text-xs text-muted u-m0">Generated from rating engine output JSON payload (${q.ratingVersion || 'v2026.03'})</div>
        </div>
      </div>
      <div class="u-row-gap8">
        <button class="btn btn-xs btn-warning u-fw-700" onclick="triggerSystemJsonUpload()">
          <i class="ph ph-file-arrow-up"></i> Re-Import JSON
        </button>
      </div>
    </div>

    <!-- Top Executive Carrier Quote Sheet Card -->
    <div class="quote-hero-card">
      <div class="quote-hero-left">
        <div class="quote-hero-title-row">
          <i class="ph ph-shield-check text-warning u-fs-24"></i>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase;">APEX MUTUAL INSURANCE GROUP • NAIC #40921</div>
            <h2>${q.lob || 'Commercial Trucking'} • Formal Bindable Quote</h2>
          </div>
          <span class="badge badge-primary font-mono">${q.ratingVersion || 'v2026.03'}</span>
          ${eligibility.refers && eligibility.refers.length > 0 ? `<span class="badge badge-warning font-bold"><i class="ph ph-warning"></i> Referral: ${eligibility.refers.join(', ')}</span>` : '<span class="badge badge-success"><i class="ph ph-shield-check"></i> Standard Clear</span>'}
        </div>
        <div class="quote-hero-meta mt-1">
          <span><i class="ph ph-building-office"></i> Insured: <strong>${sub.insured}</strong></span>
          <span><i class="ph ph-hash"></i> Quote #: <strong>${sub.quoteNo || 'QT-2026-89412'}</strong></span>
          <span><i class="ph ph-map-pin"></i> Garaging: <strong>${q.state || 'TX'} (${q.countyName || 'Denton County'})</strong></span>
          <span><i class="ph ph-handshake"></i> Producing Broker: <strong>${sub.broker}</strong></span>
          <span><i class="ph ph-calendar"></i> Term: <strong>12 Months</strong> (Valid 30 Days)</span>
        </div>
      </div>
      <div class="quote-hero-right">
        <div class="quote-hero-price-box">
          <div class="qhp-lbl">TOTAL BINDABLE POLICY PREMIUM</div>
          <div class="qhp-val">$${(q.finalPremium || 39260).toLocaleString()}</div>
        </div>
      </div>
    </div>

    <!-- 5-Metric Financial Decomposition Strip -->
    <div class="quote-kpi-summary-strip">
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-stack text-primary"></i> 1. Base Coverage Premium</span>
        <strong class="qkpi-val text-primary">$${(q.coveragePremium || 35062).toLocaleString()}</strong>
        <span class="qkpi-sub">Liability ($${((coverages[0] && coverages[0].subtotal) || 15440).toLocaleString()}) + PhysDam ($${((coverages[1] && coverages[1].subtotal) || 19622).toLocaleString()})</span>
      </div>
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-tag text-success"></i> 2. Applied Discounts</span>
        <strong class="qkpi-val text-success">-$${discountAmt.toLocaleString()}</strong>
        <span class="qkpi-sub">${discounts.map(d => d.name).join(', ') || '0 Applied'}</span>
      </div>
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-receipt text-warning"></i> 3. Statutory & Broker Fees</span>
        <strong class="qkpi-val text-warning">+$${totalFeeAmt.toLocaleString()}</strong>
        <span class="qkpi-sub">${fees.length} Mandatory Fees Schedule</span>
      </div>
      <div class="qkpi-card">
        <span class="qkpi-lbl"><i class="ph ph-bank text-danger"></i> 4. State & County Taxes</span>
        <strong class="qkpi-val text-danger">+$${totalTaxAmt.toLocaleString()}</strong>
        <span class="qkpi-sub">SL 4.85% ($${(q.tax||1590).toLocaleString()}) + Denton 0.55% ($${(q.countyTax||180).toLocaleString()})</span>
      </div>
      <div class="qkpi-card" style="background: #f0fdf4; border-color: #86efac;">
        <span class="qkpi-lbl text-success"><i class="ph ph-lock"></i> 5. Final Annual Total</span>
        <strong class="qkpi-val text-success font-bold" style="font-size: 20px;">$${(q.finalPremium || 39260).toLocaleString()}</strong>
        <span class="qkpi-sub text-success font-bold">12-Month Bind Terms</span>
      </div>
    </div>

    <!-- Main Split Grid (Coverage Decomposition & Factors VS Fees & Rules) -->
    <!-- Coverage Lines — side by side, equal height, timeline design -->
    <div class="coverage-lines-row">
      ${coverages.map((cov, idx) => {
        const factors = cov.factors || [];
        return `
        <div class="tl-card">
          <div class="tl-header">
            <div>
              <div class="tl-label">Coverage Line ${idx + 1}</div>
              <div class="tl-title">${cov.name} Coverage</div>
            </div>
            <div class="tl-subtotal-box">
              <div class="tl-subtotal-label">Subtotal</div>
              <div class="tl-subtotal-val">$${(cov.subtotal || 0).toLocaleString()}</div>
            </div>
          </div>
          <div class="tl-timeline">
            ${factors.map((f, fIdx) => {
              const displayVal = typeof f.value === "number" ? (f.value >= 100 ? f.value.toLocaleString() : f.value) : f.value;
              const subText = [f.input, f.matched].filter(Boolean).join(" — ") || f.matched || f.input || "";
              return `
              <div class="tl-item">
                <div class="tl-item-content">
                  <div class="tl-item-top">
                    <strong>${f.label}</strong>
                    <span class="tl-item-val">${displayVal}</span>
                  </div>
                  ${subText ? `<div class="tl-item-sub">${subText}</div>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
          <div class="tl-summary">
            <i class="ph ph-arrow-bend-down-right"></i> Rated exposure resolves to a subtotal of <strong>$${(cov.subtotal || 0).toLocaleString()}</strong>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Applied Credits & Deductions — full width, below the coverage lines -->
    ${renderCostBreakdownSection(
      "Applied Credits & Deductions",
      `${discounts.length} credit${discounts.length === 1 ? '' : 's'} applied to this policy`,
      "Total savings",
      `-$${discounts.reduce((s, d) => s + Math.abs(d.amt || 0), 0).toLocaleString()}`,
      discounts,
      { grouped: false, emptyText: "No discretionary discounts applied." }
    )}

    <!-- Remaining itemized cards — stacked full width below -->
    <div style="display: flex; flex-direction: column; gap: 20px;">

        <!-- Statutory & Broker Fee Schedule Card -->
        ${renderCostBreakdownSection(
          "Cost breakdown by category",
          `${fees.length} fee${fees.length === 1 ? '' : 's'} applied to this policy`,
          "Total fees",
          `$${totalFeeAmt.toLocaleString()}`,
          fees,
          { grouped: true }
        )}

        <!-- Underwriting Eligibility & Credits Evaluated Log -->
        ${renderCostBreakdownSection(
          "Credits & Surcharges Evaluated",
          `${adapter.fieldsMapped || 23} fields mapped from the rating engine`,
          "Not applied",
          `${notApplied.length}`,
          notApplied,
          { grouped: false, emptyText: "All evaluated credits and surcharges were applied." }
        )}

        <!-- Mandatory Subjectivities & Bind Conditions Box -->
        <div class="card">
          <div class="card-header" style="background: #fffbeb; border-bottom-color: #fef3c7;">
            <h3 style="margin: 0; font-size: 13.5px; color: #92400e;"><i class="ph ph-clipboard-text text-warning"></i> Mandatory Bind Subjectivities</h3>
          </div>
          <div class="card-body py-2 px-3" style="font-size: 11.5px; color: #78350f;">
            <ul style="margin: 0; padding-left: 18px; line-height: 1.5;">
              <li>Receipt & satisfactory review of Motor Vehicle Records (MVRs) for all 4 drivers within 15 days of bind.</li>
              <li>Signed and dated ACORD 125 & ACORD 137 applications on file.</li>
              <li>Satisfactory verification of down payment installment ($3,926.00).</li>
            </ul>
          </div>
        </div>

    </div>

    <!-- Bottom Quote Issuance & Delivery Action Panel -->
    <div class="card mt-3" style="border: 1px solid #cbd5e1; box-shadow: var(--shadow-md);">
      <div class="card-header" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; display: flex; justify-content: space-between; align-items: center;">
        <div class="u-row-gap10">
          <i class="ph ph-paper-plane-tilt text-warning" style="font-size: 18px;"></i>
          <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #ffffff;">Issue Commercial Trucking Formal Quote</h3>
        </div>
        <span class="badge badge-success font-mono" id="quoteIssuanceStatusBadge">30-Day Bind Window Active</span>
      </div>
      <div class="card-body p-4">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
          <div>
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 800; color: #0f172a;">Select Quote Delivery Target:</h4>
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #334155;">
                <input type="radio" name="policyRecipientTarget" value="broker" checked onchange="updateIssuanceRecipientUI()">
                <span>Producing Broker Agency (${(sub.broker || 'Marsh').split(' ')[0]})</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #334155;">
                <input type="radio" name="policyRecipientTarget" value="customer" onchange="updateIssuanceRecipientUI()">
                <span>Direct Insured Customer (${sub.insured})</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: #334155;">
                <input type="radio" name="policyRecipientTarget" value="both" onchange="updateIssuanceRecipientUI()">
                <span>Simultaneous Dual Dispatch (Both)</span>
              </label>
            </div>
          </div>
          <div>
            <button type="button" class="btn btn-success btn-lg" id="btnIssueQuote" onclick="issueQuoteAction()" ${sub.quoteIssued ? "disabled" : ""} style="font-weight: 800; padding: 12px 28px; font-size: 15px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);" class="${sub.quoteIssued ? "disabled" : ""}">
              <i class="ph ${sub.quoteIssued ? "ph-check-circle" : "ph-paper-plane-tilt"}"></i> ${sub.quoteIssued ? "QUOTE OFFICIALLY ISSUED" : "Issue Quote"}
            </button>
          </div>
        </div>

        <!-- Dynamic Success Banner when Issued -->
        <div id="issuedQuoteSuccessBanner" style="display: ${sub.quoteIssued ? "flex" : "none"}; margin-top: 18px; padding: 16px 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: var(--radius-md); align-items: center; gap: 14px;">
          <div style="width: 42px; height: 42px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;">
            <i class="ph ph-check-circle"></i>
          </div>
          <div>
            <h4 style="margin: 0; font-size: 14.5px; font-weight: 800; color: #166534;">Commercial Trucking Quote Issued Successfully!</h4>
            <p style="margin: 3px 0 0 0; font-size: 12.5px; color: #15803d;" id="issuedQuoteRecipientDetails">
              Quote documentation & bind terms have been dispatched to the selected recipient inbox.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
