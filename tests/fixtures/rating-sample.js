/**
 * TEST FIXTURE: a sample rating-engine output (commercial trucking) for tests that need a quote.
 * The application ships no sample quote: a quote comes from a rating file the user imports.
 */
var SAMPLE_RATING_JSON = {
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
