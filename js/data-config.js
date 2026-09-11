/**
 * Submission-to-Quote Underwriting Flow Platform
 * JavaScript State Management, Dynamic LOB Filter, Priority & FIFO Queue Engine
 */

// ============================================================================
// 1. MASTER SUBMISSIONS DATASET (5 LINES OF BUSINESS × BROKER & DIRECT PORTALS)
// ============================================================================
var SEED_SUBMISSIONS_DATASET = [
  // --------------------------------------------------------------------------
  // 1. TRUCKING / COMMERCIAL AUTO
  // --------------------------------------------------------------------------
  {
    id: "SUB-48213-TX",
    lobKey: "trucking",
    lobName: "Commercial Auto / Trucking",
    channelType: "broker", // 'broker' | 'direct'
    channelName: "Broker Intake: Marsh & McLennan (Email)",
    priority: "P1", // 'P1' | 'P2' | 'P3' | 'P4'
    priorityScore: 96,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "3h 45m remaining",
    priorityReason: "Tier-1 Platinum Broker • Clean Appetite Match • Approaching Effective Date",
    // Unified Account View demo: parent account grouping across LOBs.
    accountName: "Apex Freight Holdings",
    insured: "Apex Freight LLC",
    fein: "81-440000TX",
    dot: "3194022",
    mcNumber: "MC-881924",
    mcs90Filed: true,
    minStatutoryLimit: 750000,
    address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
    broker: "Marsh & McLennan Commercial Brokerage",
    email: "submissions@marshbrokerage.com",
    desk: "Specialty Transportation & Fleet UW Team",
    underwriter: "Sarah Jenkins (Senior Fleet UW)",
    exposure: "$1,850,000",
    exposureVal: 1850000,
    authorityLimit: 2000000,
    receivedAt: "2026-08-25 09:14 AM",
    receivedTimestamp: 1787658840000,
    statusText: "Intake Ingested",
    statusBadge: "badge-primary",
    currentStep: 1,
    completedSteps: [],
    docs: [
      { name: "ACORD_137_Commercial_Auto_Application.pdf", type: "pdf", desc: "Application Form • 4 Pages • 1.4 MB" },
      { name: "Apex_Freight_Vehicle_SOV_Schedule.xlsx", type: "xls", desc: "Statement of Values (SOV) • 12 Units • 420 KB" },
      { name: "Prior_3_Years_Loss_Runs_Official.pdf", type: "pdf", desc: "Loss Run History • 2 Claims Logged • 2.1 MB" },
      { name: "Driver_MVR_Verification_Report_2026.pdf", type: "pdf", desc: "Official MVR Audit • 100% Active Verified • 850 KB" },
      { name: "FMCSA_Safety_Inspection_Certificate.pdf", type: "pdf", desc: "FMCSA Compliance Audit • Grade A • 1.2 MB" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "DOT / MC Number", val: "USDOT 3194022", conf: "99.8%" },
      { key: "Total Power Units", val: "12 Tractor Units", conf: "99.5%" },
      { key: "Operating Radius", val: "450 Miles (Regional)", conf: "98.9%" },
      { key: "Cargo Type", val: "Dry Van / General Freight", conf: "99.2%" },
      { key: "Garaging Location", val: "Harris County, TX", conf: "99.0%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48213-TX",
      source_channel: "Broker Intake (Email / ACORD)",
      applicant: {
        legal_name: "Apex Freight LLC",
        fein: "81-440000TX",
        dot_number: "3194022",
        fleet_size: 12,
        operating_radius_miles: 450,
        garaged_state: "TX"
      },
      loss_history: {
        total_incurred: 14200,
        claims_3yr: 2,
        loss_ratio: "18.4%"
                                                                 },
      enrichment: {
        fmcsa_safety_percentile: 94,
        iss_score: "Pass (No Action Required)",
        driver_mvr_clean_rate: "91.6%"
      }
    },
    appetiteRules: [
      { ruleId: "UW-001", category: "Underwriting", factor: "Maximum Fleet Size", operator: "<=", baseValue: 100, unit: "Vehicles", canOverride: true, guardrail: "<= 150", val: "12 Vehicles", pass: true },
      { ruleId: "UW-002", category: "Underwriting", factor: "Maximum Vehicle Age", operator: "<=", baseValue: 15, unit: "Years", canOverride: false, guardrail: "<= 15", val: "6 Years", pass: true },
      { ruleId: "UW-003", category: "Underwriting", factor: "Minimum Driver Experience", operator: ">=", baseValue: 2, unit: "Years", canOverride: true, guardrail: ">= 2", val: "5 Years", pass: true },
      { ruleId: "UW-004", category: "Underwriting", factor: "Maximum 3-Yr Loss Ratio", operator: "<=", baseValue: 60, unit: "%", canOverride: true, guardrail: "<= 60%", val: "18.4%", pass: true },
      { ruleId: "UW-005", category: "Underwriting", factor: "Hazardous Cargo Allowed", operator: "=", baseValue: "Yes", unit: "Yes/No", canOverride: true, guardrail: "Carrier permits; MGA may restrict", val: "No (General Dry Van)", pass: true }
    ],
    enrichmentCards: [
      { title: "FMCSA / DOT Safety Score", icon: "ph-truck", val: "94th Percentile", label: "ISS-D Recommendation: PASS", tag: "badge-success" },
      { title: "DOT Inspection Violations", icon: "ph-warning", val: "0.12 / 100k mi", label: "National Average: 0.48 (Superior)", tag: "badge-success" },
      { title: "Experian Commercial Credit", icon: "ph-chart-pie", val: "88 / 100", label: "Low Financial Default Risk", tag: "badge-info" }
    ],
    subjectivities: [
      "Receipt and satisfactory verification of 100% driver MVRs prior to bind.",
      "Submission of signed Statement of Values with vehicle VIN verification.",
      "Receipt of pre-employment drug and alcohol testing protocol document."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Minor fender damage during backing maneuver", status: "Closed", incurred: "$4,200" },
      { year: "2023 - 2024", desc: "Windshield replacement & minor debris strike", status: "Closed", incurred: "$1,800" },
      { year: "2022 - 2023", desc: "No claims recorded", status: "Clean", incurred: "$0" }
    ],
    insured_id: 748921043,
    submission_id: "SUB-48213-TX",
    quote_id: "QT-TRK-2026-89412",
    endorsement_number: 0,
    broker_fee: { amount: 2574, default: 1 },
    genInfo: {
      quotetype: "Commercial Auto / Trucking",
      application_type_id: 483,
      company: 210,
      lob: "trucking",
      policytype: "New Business",
      billtype: "Agency Bill",
      effective_date: "09/01/2026",
      expiration_date: "09/01/2027",
      lock_rate_effective_date: "08/25/2026",
      business_yrs_exp: "5",
      binding: "pending",
      al_check: true,
      cargo_check: true,
      pd_check: true
    },
    insuredInfo: {
      entity_type: "Corporation / LLC",
      insured_name: "Apex Freight LLC",
      fein: "81-440000TX",
      dot_number: "3194022",
      address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
      insured_garaging_city: "Suite 400",
      insured_garaging_state: "Houston",
      insured_garaging_county: "Suite 400 County",
      years_of_experience: 5,
      dot_yes_no: "Yes",
      icc_filings_yes_no: "No",
      description_of_operation: "Tier-1 Platinum Broker • Clean Appetite Match • Approaching Effective Date"
    },
    coveragesInfo: {
      rating_type: "Composite Rating Engine",
      liability: 1850000,
      al_deductions: 0,
      pd: "Yes",
      cargo: "Yes",
      cargo_limit: 250000,
      pd_high_deductible: "5000",
      pd_deductible_amount: 2500,
      naics_code: 484110,
      rating_class: 5,
      dashcam: "No",
      al_check: true,
      pd_check: true,
      cargo_check: true,
      towing: "10000"
    },
    filingInfo: {
      safer_factor: "1.0",
      FMCSA_alert: "0",
      uw_credit_debit_factor: "0.95"
    },
    radiusOfOperationsInfo: {
      radius: 450,
      Intrastate_interstate: "Interstate"
    },
    serviceInspectionInfo: {
      number_of_inspection_si: 0,
      oos_violation_si: 0,
      account_percent_si: "-",
      account_percent_driver: "-"
    },
    commoditiesSelected: [1, 2],
    commoditiesInfo: { secondary_class: "Commercial Auto / Trucking" },
    uwReviewInfo: {
      driver_factor: 1,
      og_driver_count: 12,
      cr_driver_count: 5,
      al_pollution: "Low",
      al_pollution_factor: "1.00",
      uw_credit_debit_factor: "1.0",
      loss_experience_factor: "1.0",
      min_earn_factor: 25,
      broker_fee_amount: 2574,
      original_driver_exclude_count: 0
    },
    vehicles: [
      {
        id: 903100,
        xid: 1,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$36,200.00",
        liability_premium: "$36,200.00",
        pd_premium: "$36,200.00"
      },
      {
        id: 903101,
        xid: 2,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$10,252.00",
        liability_premium: "$10,252.00",
        pd_premium: "$10,252.00"
      },
      {
        id: 903102,
        xid: 3,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$2,148.00",
        liability_premium: "$2,148.00",
        pd_premium: "$2,148.00"
      }
    ],
    drivers: [
      {
        id: 942561,
        given_name: "Apex",
        last_name: "Freight LLC",
        dob: "01/01/1990",
        licensestate: "Houston",
        licenseclasstype: "Class A",
        experience: "5 Years",
        tenure: 3,
        exclude: 0,
        status: "Active Verified",
        driver_factor: 1
      }
    ],
    quoteNo: "QT-TRK-2026-89412",
    coverageRows: [
      { line: "Commercial Auto Liability (Combined Single Limit)", limit: "$1,850,000 CSL", ded: "$2,500", prem: "$36,200.00" },
      { line: "Auto Physical Damage (Comp & Collision - 12 Units)", limit: "$1,850,000 Stated Value", ded: "$2,500", prem: "$10,252.00" },
      { line: "Motor Truck Cargo Legal Liability", limit: "$250,000 Per Occurrence", ded: "$1,000", prem: "$2,148.00" }
    ]
  },

  {
    id: "SUB-48901-TX",
    lobKey: "trucking",
    lobName: "Commercial Auto / Trucking",
    channelType: "broker", // 'broker' | 'direct'
    channelName: "Broker Intake: Marsh & McLennan (Email)",
    priority: "P2", // 'P1' | 'P2' | 'P3' | 'P4'
    priorityScore: 78,
    slaText: "24h Standard SLA",
    slaCountdown: "3h 45m remaining",
    priorityReason: "Example record for Premium Visibility demo — same customer as Meridian Logistics Group, quoted separately by David Chen",
    currentPremium: 178500,
    // Prior policy this SAME customer already held with us — used for
    // Old vs New (Renewal) comparison, distinct from cross-submission compare.
    priorPolicy: {
      policyNumber: "POL-2025-TRK-77341",
      policyPeriod: "2025-08-22 to 2026-08-22",
      premium: 162000,
      lossRatio: "28%",
      claimsCount: 1,
      claimsNote: "1 minor cargo claim ($4,200 paid), no fleet safety violations",
      coverageRows: [
        { line: "Commercial Auto Liability (Combined Single Limit)", limit: "$1,750,000 CSL", ded: "$2,500", prem: "$134,500.00" },
        { line: "Auto Physical Damage (Comp & Collision - 10 Units)", limit: "$1,750,000 Stated Value", ded: "$2,500", prem: "$22,300.00" },
        { line: "Motor Truck Cargo Legal Liability", limit: "$200,000 Per Occurrence", ded: "$1,000", prem: "$5,200.00" }
      ]
    },
    missingItems: {
      documents: ["Signed ACORD 137 Application", "Prior 3-Year Loss Run History"],
      dataFields: ["Garaging Address Confirmation"]
    },
    communicationThread: [
      {
        direction: "inbound",
        via: "Broker Email (Marsh & McLennan Commercial Brokerage)",
        from: "Marsh & McLennan Commercial Brokerage",
        to: "Underwriting Team",
        at: "2026-08-22 10:05 AM",
        updateType: null,
        message: "Original submission received via broker intake."
      },
      {
        direction: "outbound",
        via: "Broker Email (Marsh & McLennan Commercial Brokerage)",
        from: "Marsh & McLennan Commercial Brokerage",
        to: "David Chen",
        at: "2026-08-22 03:40 PM",
        updateType: null,
        message: "Thanks for the submission. Before we can finalize a quote we still need: the Signed ACORD 137 Application, Prior 3-Year Loss Run History, and confirmation of the garaging address. Please send these at your earliest convenience."
      }
    ],
    insured: "Meridian Logistics Group",
    fein: "81-3340219",
    dot: "3194022",
    mcNumber: "MC-772104",
    mcs90Filed: true,
    minStatutoryLimit: 750000,
    address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
    broker: "Marsh & McLennan Commercial Brokerage",
    email: "submissions@marshbrokerage.com",
    desk: "Specialty Transportation & Fleet UW Team",
    underwriter: "David Chen (Senior Commercial Underwriter)",
    exposure: "$4,200,000",
    exposureVal: 4200000,
    authorityLimit: 10000000,
    receivedAt: "2026-08-22 10:05 AM",
    receivedTimestamp: 1787433900000,
    statusText: "Quote Generated",
    statusBadge: "badge-primary",
    currentStep: 7,
    completedSteps: [1, 2, 3, 4, 5, 6],
    docs: [
      { name: "ACORD_137_Commercial_Auto_Application.pdf", type: "pdf", desc: "Application Form • 4 Pages • 1.4 MB" },
      { name: "Apex_Freight_Vehicle_SOV_Schedule.xlsx", type: "xls", desc: "Statement of Values (SOV) • 12 Units • 420 KB" },
      { name: "Prior_3_Years_Loss_Runs_Official.pdf", type: "pdf", desc: "Loss Run History • 2 Claims Logged • 2.1 MB" },
      { name: "Driver_MVR_Verification_Report_2026.pdf", type: "pdf", desc: "Official MVR Audit • 100% Active Verified • 850 KB" },
      { name: "FMCSA_Safety_Inspection_Certificate.pdf", type: "pdf", desc: "FMCSA Compliance Audit • Grade A • 1.2 MB" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "DOT / MC Number", val: "USDOT 3194022", conf: "99.8%" },
      { key: "Total Power Units", val: "12 Tractor Units", conf: "99.5%" },
      { key: "Operating Radius", val: "450 Miles (Regional)", conf: "98.9%" },
      { key: "Cargo Type", val: "Dry Van / General Freight", conf: "99.2%" },
      { key: "Garaging Location", val: "Harris County, TX", conf: "99.0%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48901-TX",
      source_channel: "Broker Intake (Email / ACORD)",
      applicant: {
        legal_name: "Apex Freight LLC",
        fein: "81-3340219",
        dot_number: "3194022",
        fleet_size: 12,
        operating_radius_miles: 450,
        garaged_state: "TX"
      },
      loss_history: {
        total_incurred: 14200,
        claims_3yr: 2,
        loss_ratio: "18.4%"
      },
      enrichment: {
        fmcsa_safety_percentile: 94,
        iss_score: "Pass (No Action Required)",
        driver_mvr_clean_rate: "91.6%"
      }
    },
    appetiteRules: [
      { ruleId: "UW-001", category: "Underwriting", factor: "Maximum Fleet Size", operator: "<=", baseValue: 100, unit: "Vehicles", canOverride: true, guardrail: "<= 150", val: "12 Vehicles", pass: true },
      { ruleId: "UW-002", category: "Underwriting", factor: "Maximum Vehicle Age", operator: "<=", baseValue: 15, unit: "Years", canOverride: false, guardrail: "<= 15", val: "6 Years", pass: true },
      { ruleId: "UW-003", category: "Underwriting", factor: "Minimum Driver Experience", operator: ">=", baseValue: 2, unit: "Years", canOverride: true, guardrail: ">= 2", val: "5 Years", pass: true },
      { ruleId: "UW-004", category: "Underwriting", factor: "Maximum 3-Yr Loss Ratio", operator: "<=", baseValue: 60, unit: "%", canOverride: true, guardrail: "<= 60%", val: "18.4%", pass: true },
      { ruleId: "UW-005", category: "Underwriting", factor: "Hazardous Cargo Allowed", operator: "=", baseValue: "Yes", unit: "Yes/No", canOverride: true, guardrail: "Carrier permits; MGA may restrict", val: "No (General Dry Van)", pass: true }
    ],
    enrichmentCards: [
      { title: "FMCSA / DOT Safety Score", icon: "ph-truck", val: "94th Percentile", label: "ISS-D Recommendation: PASS", tag: "badge-success" },
      { title: "DOT Inspection Violations", icon: "ph-warning", val: "0.12 / 100k mi", label: "National Average: 0.48 (Superior)", tag: "badge-success" },
      { title: "Experian Commercial Credit", icon: "ph-chart-pie", val: "88 / 100", label: "Low Financial Default Risk", tag: "badge-info" }
    ],
    subjectivities: [
      "Receipt and satisfactory verification of 100% driver MVRs prior to bind.",
      "Submission of signed Statement of Values with vehicle VIN verification.",
      "Receipt of pre-employment drug and alcohol testing protocol document."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Minor fender damage during backing maneuver", status: "Closed", incurred: "$4,200" },
      { year: "2023 - 2024", desc: "Windshield replacement & minor debris strike", status: "Closed", incurred: "$1,800" },
      { year: "2022 - 2023", desc: "No claims recorded", status: "Clean", incurred: "$0" }
    ],
    insured_id: 748921043,
    submission_id: "SUB-48901-TX",
    quote_id: "QT-TRK-2026-89412",
    endorsement_number: 0,
    broker_fee: { amount: 2574, default: 1 },
    genInfo: {
      quotetype: "Commercial Auto / Trucking",
      application_type_id: 483,
      company: 210,
      lob: "trucking",
      policytype: "New Business",
      billtype: "Agency Bill",
      effective_date: "09/01/2026",
      expiration_date: "09/01/2027",
      lock_rate_effective_date: "08/25/2026",
      business_yrs_exp: "5",
      binding: "pending",
      al_check: true,
      cargo_check: true,
      pd_check: true
    },
    insuredInfo: {
      entity_type: "Corporation / LLC",
      insured_name: "Apex Freight LLC",
      fein: "81-3340219",
      dot_number: "3194022",
      address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
      insured_garaging_city: "Suite 400",
      insured_garaging_state: "Houston",
      insured_garaging_county: "Suite 400 County",
      years_of_experience: 5,
      dot_yes_no: "Yes",
      icc_filings_yes_no: "No",
      description_of_operation: "Tier-1 Platinum Broker • Clean Appetite Match • Approaching Effective Date"
    },
    coveragesInfo: {
      rating_type: "Composite Rating Engine",
      liability: 1850000,
      al_deductions: 0,
      pd: "Yes",
      cargo: "Yes",
      cargo_limit: 250000,
      pd_high_deductible: "5000",
      pd_deductible_amount: 2500,
      naics_code: 484110,
      rating_class: 5,
      dashcam: "No",
      al_check: true,
      pd_check: true,
      cargo_check: true,
      towing: "10000"
    },
    filingInfo: {
      safer_factor: "1.0",
      FMCSA_alert: "0",
      uw_credit_debit_factor: "0.95"
    },
    radiusOfOperationsInfo: {
      radius: 450,
      Intrastate_interstate: "Interstate"
    },
    serviceInspectionInfo: {
      number_of_inspection_si: 0,
      oos_violation_si: 0,
      account_percent_si: "-",
      account_percent_driver: "-"
    },
    commoditiesSelected: [1, 2],
    commoditiesInfo: { secondary_class: "Commercial Auto / Trucking" },
    uwReviewInfo: {
      driver_factor: 1,
      og_driver_count: 12,
      cr_driver_count: 5,
      al_pollution: "Low",
      al_pollution_factor: "1.00",
      uw_credit_debit_factor: "1.0",
      loss_experience_factor: "1.0",
      min_earn_factor: 25,
      broker_fee_amount: 2574,
      original_driver_exclude_count: 0
    },
    vehicles: [
      {
        id: 903100,
        xid: 1,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$36,200.00",
        liability_premium: "$36,200.00",
        pd_premium: "$36,200.00"
      },
      {
        id: 903101,
        xid: 2,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$10,252.00",
        liability_premium: "$10,252.00",
        pd_premium: "$10,252.00"
      },
      {
        id: 903102,
        xid: 3,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$2,148.00",
        liability_premium: "$2,148.00",
        pd_premium: "$2,148.00"
      }
    ],
    drivers: [
      {
        id: 942561,
        given_name: "Apex",
        last_name: "Freight LLC",
        dob: "01/01/1990",
        licensestate: "Houston",
        licenseclasstype: "Class A",
        experience: "5 Years",
        tenure: 3,
        exclude: 0,
        status: "Active Verified",
        driver_factor: 1
      }
    ],
    quoteNo: "QT-TRK-2026-51177",
    coverageRows: [
      { line: "Commercial Auto Liability (Combined Single Limit)", limit: "$1,850,000 CSL", ded: "$2,500", prem: "$36,200.00" },
      { line: "Auto Physical Damage (Comp & Collision - 12 Units)", limit: "$1,850,000 Stated Value", ded: "$2,500", prem: "$10,252.00" },
      { line: "Motor Truck Cargo Legal Liability", limit: "$250,000 Per Occurrence", ded: "$1,000", prem: "$2,148.00" }
    ]
  },

  {
    id: "SUB-48902-TX",
    lobKey: "trucking",
    lobName: "Commercial Auto / Trucking",
    channelType: "broker", // 'broker' | 'direct'
    channelName: "Broker Intake: Marsh & McLennan (Email)",
    priority: "P3", // 'P1' | 'P2' | 'P3' | 'P4'
    priorityScore: 55,
    slaText: "48h Referral SLA",
    slaCountdown: "3h 45m remaining",
    priorityReason: "Example record for Premium Visibility demo — same customer as Meridian Logistics Group, quoted separately by Marcus Vance",
    currentPremium: 205400,
    insured: "Meridian Logistics Group",
    fein: "81-3340219",
    dot: "3194022",
    mcNumber: "MC-905317",
    mcs90Filed: true,
    minStatutoryLimit: 750000,
    address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
    broker: "Marsh & McLennan Commercial Brokerage",
    email: "submissions@marshbrokerage.com",
    desk: "Specialty Transportation & Fleet UW Team",
    underwriter: "Marcus Vance (Chief Underwriting Officer)",
    exposure: "$4,200,000",
    exposureVal: 4200000,
    authorityLimit: 25000000,
    receivedAt: "2026-08-27 02:40 PM",
    receivedTimestamp: 1787840400000,
    statusText: "Policy Issued",
    statusBadge: "badge-success",
    currentStep: 7,
    completedSteps: [1, 2, 3, 4, 5, 6, 7],
    docs: [
      { name: "ACORD_137_Commercial_Auto_Application.pdf", type: "pdf", desc: "Application Form • 4 Pages • 1.4 MB" },
      { name: "Apex_Freight_Vehicle_SOV_Schedule.xlsx", type: "xls", desc: "Statement of Values (SOV) • 12 Units • 420 KB" },
      { name: "Prior_3_Years_Loss_Runs_Official.pdf", type: "pdf", desc: "Loss Run History • 2 Claims Logged • 2.1 MB" },
      { name: "Driver_MVR_Verification_Report_2026.pdf", type: "pdf", desc: "Official MVR Audit • 100% Active Verified • 850 KB" },
      { name: "FMCSA_Safety_Inspection_Certificate.pdf", type: "pdf", desc: "FMCSA Compliance Audit • Grade A • 1.2 MB" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "DOT / MC Number", val: "USDOT 3194022", conf: "99.8%" },
      { key: "Total Power Units", val: "12 Tractor Units", conf: "99.5%" },
      { key: "Operating Radius", val: "450 Miles (Regional)", conf: "98.9%" },
      { key: "Cargo Type", val: "Dry Van / General Freight", conf: "99.2%" },
      { key: "Garaging Location", val: "Harris County, TX", conf: "99.0%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48902-TX",
      source_channel: "Broker Intake (Email / ACORD)",
      applicant: {
        legal_name: "Apex Freight LLC",
        fein: "81-3340219",
        dot_number: "3194022",
        fleet_size: 12,
        operating_radius_miles: 450,
        garaged_state: "TX"
      },
      loss_history: {
        total_incurred: 14200,
        claims_3yr: 2,
        loss_ratio: "18.4%"
      },
      enrichment: {
        fmcsa_safety_percentile: 94,
        iss_score: "Pass (No Action Required)",
        driver_mvr_clean_rate: "91.6%"
      }
    },
    appetiteRules: [
      { ruleId: "UW-001", category: "Underwriting", factor: "Maximum Fleet Size", operator: "<=", baseValue: 100, unit: "Vehicles", canOverride: true, guardrail: "<= 150", val: "12 Vehicles", pass: true },
      { ruleId: "UW-002", category: "Underwriting", factor: "Maximum Vehicle Age", operator: "<=", baseValue: 15, unit: "Years", canOverride: false, guardrail: "<= 15", val: "6 Years", pass: true },
      { ruleId: "UW-003", category: "Underwriting", factor: "Minimum Driver Experience", operator: ">=", baseValue: 2, unit: "Years", canOverride: true, guardrail: ">= 2", val: "5 Years", pass: true },
      { ruleId: "UW-004", category: "Underwriting", factor: "Maximum 3-Yr Loss Ratio", operator: "<=", baseValue: 60, unit: "%", canOverride: true, guardrail: "<= 60%", val: "18.4%", pass: true },
      { ruleId: "UW-005", category: "Underwriting", factor: "Hazardous Cargo Allowed", operator: "=", baseValue: "Yes", unit: "Yes/No", canOverride: true, guardrail: "Carrier permits; MGA may restrict", val: "No (General Dry Van)", pass: true }
    ],
    enrichmentCards: [
      { title: "FMCSA / DOT Safety Score", icon: "ph-truck", val: "94th Percentile", label: "ISS-D Recommendation: PASS", tag: "badge-success" },
      { title: "DOT Inspection Violations", icon: "ph-warning", val: "0.12 / 100k mi", label: "National Average: 0.48 (Superior)", tag: "badge-success" },
      { title: "Experian Commercial Credit", icon: "ph-chart-pie", val: "88 / 100", label: "Low Financial Default Risk", tag: "badge-info" }
    ],
    subjectivities: [
      "Receipt and satisfactory verification of 100% driver MVRs prior to bind.",
      "Submission of signed Statement of Values with vehicle VIN verification.",
      "Receipt of pre-employment drug and alcohol testing protocol document."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Minor fender damage during backing maneuver", status: "Closed", incurred: "$4,200" },
      { year: "2023 - 2024", desc: "Windshield replacement & minor debris strike", status: "Closed", incurred: "$1,800" },
      { year: "2022 - 2023", desc: "No claims recorded", status: "Clean", incurred: "$0" }
    ],
    insured_id: 748921043,
    submission_id: "SUB-48902-TX",
    quote_id: "QT-TRK-2026-89412",
    endorsement_number: 0,
    broker_fee: { amount: 2574, default: 1 },
    genInfo: {
      quotetype: "Commercial Auto / Trucking",
      application_type_id: 483,
      company: 210,
      lob: "trucking",
      policytype: "New Business",
      billtype: "Agency Bill",
      effective_date: "09/01/2026",
      expiration_date: "09/01/2027",
      lock_rate_effective_date: "08/25/2026",
      business_yrs_exp: "5",
      binding: "pending",
      al_check: true,
      cargo_check: true,
      pd_check: true
    },
    insuredInfo: {
      entity_type: "Corporation / LLC",
      insured_name: "Apex Freight LLC",
      fein: "81-3340219",
      dot_number: "3194022",
      address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
      insured_garaging_city: "Suite 400",
      insured_garaging_state: "Houston",
      insured_garaging_county: "Suite 400 County",
      years_of_experience: 5,
      dot_yes_no: "Yes",
      icc_filings_yes_no: "No",
      description_of_operation: "Tier-1 Platinum Broker • Clean Appetite Match • Approaching Effective Date"
    },
    coveragesInfo: {
      rating_type: "Composite Rating Engine",
      liability: 1850000,
      al_deductions: 0,
      pd: "Yes",
      cargo: "Yes",
      cargo_limit: 250000,
      pd_high_deductible: "5000",
      pd_deductible_amount: 2500,
      naics_code: 484110,
      rating_class: 5,
      dashcam: "No",
      al_check: true,
      pd_check: true,
      cargo_check: true,
      towing: "10000"
    },
    filingInfo: {
      safer_factor: "1.0",
      FMCSA_alert: "0",
      uw_credit_debit_factor: "0.95"
    },
    radiusOfOperationsInfo: {
      radius: 450,
      Intrastate_interstate: "Interstate"
    },
    serviceInspectionInfo: {
      number_of_inspection_si: 0,
      oos_violation_si: 0,
      account_percent_si: "-",
      account_percent_driver: "-"
    },
    commoditiesSelected: [1, 2],
    commoditiesInfo: { secondary_class: "Commercial Auto / Trucking" },
    uwReviewInfo: {
      driver_factor: 1,
      og_driver_count: 12,
      cr_driver_count: 5,
      al_pollution: "Low",
      al_pollution_factor: "1.00",
      uw_credit_debit_factor: "1.0",
      loss_experience_factor: "1.0",
      min_earn_factor: 25,
      broker_fee_amount: 2574,
      original_driver_exclude_count: 0
    },
    vehicles: [
      {
        id: 903100,
        xid: 1,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$36,200.00",
        liability_premium: "$36,200.00",
        pd_premium: "$36,200.00"
      },
      {
        id: 903101,
        xid: 2,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$10,252.00",
        liability_premium: "$10,252.00",
        pd_premium: "$10,252.00"
      },
      {
        id: 903102,
        xid: 3,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$2,148.00",
        liability_premium: "$2,148.00",
        pd_premium: "$2,148.00"
      }
    ],
    drivers: [
      {
        id: 942561,
        given_name: "Apex",
        last_name: "Freight LLC",
        dob: "01/01/1990",
        licensestate: "Houston",
        licenseclasstype: "Class A",
        experience: "5 Years",
        tenure: 3,
        exclude: 0,
        status: "Active Verified",
        driver_factor: 1
      }
    ],
    quoteNo: "QT-TRK-2026-51290",
    coverageRows: [
      { line: "Commercial Auto Liability (Combined Single Limit)", limit: "$1,850,000 CSL", ded: "$2,500", prem: "$36,200.00" },
      { line: "Auto Physical Damage (Comp & Collision - 12 Units)", limit: "$1,850,000 Stated Value", ded: "$2,500", prem: "$10,252.00" },
      { line: "Motor Truck Cargo Legal Liability", limit: "$250,000 Per Occurrence", ded: "$1,000", prem: "$2,148.00" }
    ]
  },

  {
    id: "SUB-49010-TX",
    lobKey: "trucking",
    lobName: "Commercial Auto / Trucking",
    channelType: "broker", // 'broker' | 'direct'
    channelName: "Broker Intake: Marsh & McLennan (Email)",
    priority: "P1", // 'P1' | 'P2' | 'P3' | 'P4'
    priorityScore: 96,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "3h 45m remaining",
    priorityReason: "Escalation Demo: exposure exceeds Sarah Jenkins' $2M Junior authority — routed for Senior CUO sign-off",
    // Unified Account View demo: parent account grouping across LOBs.
    insured: "Titan Logistics Partners",
    fein: "82-5510934",
    dot: "3194022",
    mcNumber: "MC-660238",
    mcs90Filed: true,
    minStatutoryLimit: 750000,
    address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
    broker: "Marsh & McLennan Commercial Brokerage",
    email: "submissions@marshbrokerage.com",
    desk: "Specialty Transportation & Fleet UW Team",
    underwriter: "Sarah Jenkins (Junior Underwriter)",
    exposure: "$3,200,000",
    exposureVal: 3200000,
    authorityLimit: 2000000,
    receivedAt: "2026-08-30 09:30 AM",
    receivedTimestamp: 1788082200000,
    statusText: "Authority Review",
    statusBadge: "badge-primary",
    currentStep: 5,
    completedSteps: [1, 2, 3, 4],
    docs: [
      { name: "ACORD_137_Commercial_Auto_Application.pdf", type: "pdf", desc: "Application Form • 4 Pages • 1.4 MB" },
      { name: "Apex_Freight_Vehicle_SOV_Schedule.xlsx", type: "xls", desc: "Statement of Values (SOV) • 12 Units • 420 KB" },
      { name: "Prior_3_Years_Loss_Runs_Official.pdf", type: "pdf", desc: "Loss Run History • 2 Claims Logged • 2.1 MB" },
      { name: "Driver_MVR_Verification_Report_2026.pdf", type: "pdf", desc: "Official MVR Audit • 100% Active Verified • 850 KB" },
      { name: "FMCSA_Safety_Inspection_Certificate.pdf", type: "pdf", desc: "FMCSA Compliance Audit • Grade A • 1.2 MB" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "DOT / MC Number", val: "USDOT 3194022", conf: "99.8%" },
      { key: "Total Power Units", val: "12 Tractor Units", conf: "99.5%" },
      { key: "Operating Radius", val: "450 Miles (Regional)", conf: "98.9%" },
      { key: "Cargo Type", val: "Dry Van / General Freight", conf: "99.2%" },
      { key: "Garaging Location", val: "Harris County, TX", conf: "99.0%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-49010-TX",
      source_channel: "Broker Intake (Email / ACORD)",
      applicant: {
        legal_name: "Apex Freight LLC",
        fein: "82-5510934",
        dot_number: "3194022",
        fleet_size: 12,
        operating_radius_miles: 450,
        garaged_state: "TX"
      },
      loss_history: {
        total_incurred: 14200,
        claims_3yr: 2,
        loss_ratio: "18.4%"
      },
      enrichment: {
        fmcsa_safety_percentile: 94,
        iss_score: "Pass (No Action Required)",
        driver_mvr_clean_rate: "91.6%"
      }
    },
    appetiteRules: [
      { ruleId: "UW-001", category: "Underwriting", factor: "Maximum Fleet Size", operator: "<=", baseValue: 100, unit: "Vehicles", canOverride: true, guardrail: "<= 150", val: "12 Vehicles", pass: true },
      { ruleId: "UW-002", category: "Underwriting", factor: "Maximum Vehicle Age", operator: "<=", baseValue: 15, unit: "Years", canOverride: false, guardrail: "<= 15", val: "6 Years", pass: true },
      { ruleId: "UW-003", category: "Underwriting", factor: "Minimum Driver Experience", operator: ">=", baseValue: 2, unit: "Years", canOverride: true, guardrail: ">= 2", val: "5 Years", pass: true },
      { ruleId: "UW-004", category: "Underwriting", factor: "Maximum 3-Yr Loss Ratio", operator: "<=", baseValue: 60, unit: "%", canOverride: true, guardrail: "<= 60%", val: "18.4%", pass: true },
      { ruleId: "UW-005", category: "Underwriting", factor: "Hazardous Cargo Allowed", operator: "=", baseValue: "Yes", unit: "Yes/No", canOverride: true, guardrail: "Carrier permits; MGA may restrict", val: "No (General Dry Van)", pass: true }
    ],
    enrichmentCards: [
      { title: "FMCSA / DOT Safety Score", icon: "ph-truck", val: "94th Percentile", label: "ISS-D Recommendation: PASS", tag: "badge-success" },
      { title: "DOT Inspection Violations", icon: "ph-warning", val: "0.12 / 100k mi", label: "National Average: 0.48 (Superior)", tag: "badge-success" },
      { title: "Experian Commercial Credit", icon: "ph-chart-pie", val: "88 / 100", label: "Low Financial Default Risk", tag: "badge-info" }
    ],
    subjectivities: [
      "Receipt and satisfactory verification of 100% driver MVRs prior to bind.",
      "Submission of signed Statement of Values with vehicle VIN verification.",
      "Receipt of pre-employment drug and alcohol testing protocol document."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Minor fender damage during backing maneuver", status: "Closed", incurred: "$4,200" },
      { year: "2023 - 2024", desc: "Windshield replacement & minor debris strike", status: "Closed", incurred: "$1,800" },
      { year: "2022 - 2023", desc: "No claims recorded", status: "Clean", incurred: "$0" }
    ],
    insured_id: 748921043,
    submission_id: "SUB-49010-TX",
    quote_id: "QT-TRK-2026-89412",
    endorsement_number: 0,
    broker_fee: { amount: 2574, default: 1 },
    genInfo: {
      quotetype: "Commercial Auto / Trucking",
      application_type_id: 483,
      company: 210,
      lob: "trucking",
      policytype: "New Business",
      billtype: "Agency Bill",
      effective_date: "09/01/2026",
      expiration_date: "09/01/2027",
      lock_rate_effective_date: "08/25/2026",
      business_yrs_exp: "5",
      binding: "pending",
      al_check: true,
      cargo_check: true,
      pd_check: true
    },
    insuredInfo: {
      entity_type: "Corporation / LLC",
      insured_name: "Apex Freight LLC",
      fein: "82-5510934",
      dot_number: "3194022",
      address: "10440 Highway 290 West, Suite 400, Houston, TX 77040",
      insured_garaging_city: "Suite 400",
      insured_garaging_state: "Houston",
      insured_garaging_county: "Suite 400 County",
      years_of_experience: 5,
      dot_yes_no: "Yes",
      icc_filings_yes_no: "No",
      description_of_operation: "Tier-1 Platinum Broker • Clean Appetite Match • Approaching Effective Date"
    },
    coveragesInfo: {
      rating_type: "Composite Rating Engine",
      liability: 1850000,
      al_deductions: 0,
      pd: "Yes",
      cargo: "Yes",
      cargo_limit: 250000,
      pd_high_deductible: "5000",
      pd_deductible_amount: 2500,
      naics_code: 484110,
      rating_class: 5,
      dashcam: "No",
      al_check: true,
      pd_check: true,
      cargo_check: true,
      towing: "10000"
    },
    filingInfo: {
      safer_factor: "1.0",
      FMCSA_alert: "0",
      uw_credit_debit_factor: "0.95"
    },
    radiusOfOperationsInfo: {
      radius: 450,
      Intrastate_interstate: "Interstate"
    },
    serviceInspectionInfo: {
      number_of_inspection_si: 0,
      oos_violation_si: 0,
      account_percent_si: "-",
      account_percent_driver: "-"
    },
    commoditiesSelected: [1, 2],
    commoditiesInfo: { secondary_class: "Commercial Auto / Trucking" },
    uwReviewInfo: {
      driver_factor: 1,
      og_driver_count: 12,
      cr_driver_count: 5,
      al_pollution: "Low",
      al_pollution_factor: "1.00",
      uw_credit_debit_factor: "1.0",
      loss_experience_factor: "1.0",
      min_earn_factor: 25,
      broker_fee_amount: 2574,
      original_driver_exclude_count: 0
    },
    vehicles: [
      {
        id: 903100,
        xid: 1,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$36,200.00",
        liability_premium: "$36,200.00",
        pd_premium: "$36,200.00"
      },
      {
        id: 903101,
        xid: 2,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$10,252.00",
        liability_premium: "$10,252.00",
        pd_premium: "$10,252.00"
      },
      {
        id: 903102,
        xid: 3,
        year: 2024,
        make: "Apex",
        model: "Commercial Vehicle",
        state_code: "Houston",
        weight: "Commercial",
        ownership: "Owned",
        primary_code: 332,
        rating_class: 5,
        stated_value: 1850000,
        al_value: 370000,
        miles_driven: 450,
        no_of_units: 1,
        vehicle_age: 2,
        Liability: "Yes",
        pd_opted: "Yes",
        naics_code: 484110,
        liab_baserate: 837,
        liab_ilf_factor: 2.06,
        liab_lcm_factor: 1.67,
        liab_primary_factor: 1.8,
        liab_secondary_factor: 1.98,
        liab_fleet_factor: 0.97,
        vehicle_age_factor: 1.12,
        liab_ocn_factor: 1.14,
        radius_factor: 0.95,
        naics_factor: 1.1,
        vehicle_owned_factor: 0.95,
        al_premium_wo_mod_factor: "$2,148.00",
        liability_premium: "$2,148.00",
        pd_premium: "$2,148.00"
      }
    ],
    drivers: [
      {
        id: 942561,
        given_name: "Apex",
        last_name: "Freight LLC",
        dob: "01/01/1990",
        licensestate: "Houston",
        licenseclasstype: "Class A",
        experience: "5 Years",
        tenure: 3,
        exclude: 0,
        status: "Active Verified",
        driver_factor: 1
      }
    ],
    quoteNo: "QT-TRK-2026-91055",
    coverageRows: [
      { line: "Commercial Auto Liability (Combined Single Limit)", limit: "$1,850,000 CSL", ded: "$2,500", prem: "$36,200.00" },
      { line: "Auto Physical Damage (Comp & Collision - 12 Units)", limit: "$1,850,000 Stated Value", ded: "$2,500", prem: "$10,252.00" },
      { line: "Motor Truck Cargo Legal Liability", limit: "$250,000 Per Occurrence", ded: "$1,000", prem: "$2,148.00" }
    ]
  },

  {
    id: "SUB-48450-IL",
    lobKey: "trucking",
    lobName: "Commercial Auto / Trucking",
    channelType: "direct",
    channelName: "Direct Customer Portal (Self-Service Form)",
    priority: "P2",
    priorityScore: 84,
    slaText: "24h Standard SLA",
    slaCountdown: "18h 10m remaining",
    priorityReason: "Direct Ingestion • Standard Verification Required",
    insured: "Prairie State Express Freight",
    fein: "36-8842109",
    dot: "3491028",
    mcNumber: "MC-514902",
    mcs90Filed: true,
    minStatutoryLimit: 750000,
    address: "2200 Interstate Blvd, Chicago, IL 60607",
    broker: "Direct Customer (Online Intake)",
    email: "operations@prairiestatefreight.com",
    desk: "Specialty Transportation & Fleet UW Team",
    underwriter: "Sarah Jenkins (Senior Fleet UW)",
    exposure: "$1,200,000",
    exposureVal: 1200000,
    authorityLimit: 2000000,
    receivedAt: "2026-08-25 02:40 PM",
    receivedTimestamp: 1787678400000,
    statusText: "Intake Ingested",
    statusBadge: "badge-primary",
    // Monthly pipeline chart demo: blocked before quote generation due to
    // missing information from the customer.
    missingItems: {
      documents: ["Signed ACORD 137 Application", "DOT Safety Rating Letter"],
      dataFields: []
    },
    currentStep: 1,
    completedSteps: [],
    docs: [
      { name: "ACORD_137_Prairie_Auto.pdf", type: "pdf", desc: "Customer Self-Service Form • 3 Pages" },
      { name: "Fleet_Units_SOV_Prairie.xlsx", type: "xls", desc: "8 Power Units Schedule • 290 KB" },
      { name: "Prior_3_Years_Loss_History.pdf", type: "pdf", desc: "Loss Runs • 1 Claim Logged" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "DOT / MC Number", val: "USDOT 3491028", conf: "99.9%" },
      { key: "Total Power Units", val: "8 Tractor Units", conf: "99.3%" },
      { key: "Operating Radius", val: "300 Miles (Regional Midwest)", conf: "98.7%" },
      { key: "Cargo Type", val: "Refrigerated Food Goods", conf: "99.1%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48450-IL",
      source_channel: "Direct Customer Online Portal",
      applicant: {
        legal_name: "Prairie State Express Freight",
        fein: "36-8842109",
        dot_number: "3491028",
        fleet_size: 8,
        operating_radius_miles: 300
      }
    },
    appetiteRules: [
      { ruleId: "UW-001", category: "Underwriting", factor: "Maximum Fleet Size", operator: "<=", baseValue: 100, unit: "Vehicles", canOverride: true, guardrail: "<= 150", val: "8 Vehicles", pass: true },
      { ruleId: "UW-002", category: "Underwriting", factor: "Maximum Vehicle Age", operator: "<=", baseValue: 15, unit: "Years", canOverride: false, guardrail: "<= 15", val: "4 Years", pass: true },
      { ruleId: "UW-003", category: "Underwriting", factor: "Minimum Driver Experience", operator: ">=", baseValue: 2, unit: "Years", canOverride: true, guardrail: ">= 2", val: "6 Years", pass: true },
      { ruleId: "UW-004", category: "Underwriting", factor: "Maximum 3-Yr Loss Ratio", operator: "<=", baseValue: 60, unit: "%", canOverride: true, guardrail: "<= 60%", val: "12.0%", pass: true },
      { ruleId: "UW-005", category: "Underwriting", factor: "Hazardous Cargo Allowed", operator: "=", baseValue: "Yes", unit: "Yes/No", canOverride: true, guardrail: "Carrier permits; MGA may restrict", val: "No (Refrigerated Goods)", pass: true }
    ],
    enrichmentCards: [
      { title: "FMCSA / DOT Safety Score", icon: "ph-truck", val: "91st Percentile", label: "ISS-D Recommendation: PASS", tag: "badge-success" },
      { title: "DOT Inspection Violations", icon: "ph-warning", val: "0.18 / 100k mi", label: "Clean Safety Record", tag: "badge-success" },
      { title: "Experian Commercial Credit", icon: "ph-chart-pie", val: "82 / 100", label: "Good Standing", tag: "badge-info" }
    ],
    subjectivities: [
      "Receipt of driver list with verified MVRs.",
      "Signed electronic Statement of Values."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Tire blowout & minor rim damage", status: "Closed", incurred: "$2,200" },
      { year: "2023 - 2024", desc: "Clean loss record", status: "Clean", incurred: "$0" }
    ],
    quoteNo: "QT-TRK-2026-44019",
    coverageRows: [
      { line: "Commercial Auto Liability (Combined Single Limit)", limit: "$1,000,000 CSL", ded: "$2,500", prem: "$28,400.00" },
      { line: "Auto Physical Damage (8 Units)", limit: "$850,000 Stated Value", ded: "$2,500", prem: "$8,200.00" }
    ]
  },

  // --------------------------------------------------------------------------
  // 2. COMMERCIAL PROPERTY
  // --------------------------------------------------------------------------
  {
    id: "SUB-48290-PX",
    lobKey: "property",
    lobName: "Commercial Property",
    channelType: "broker",
    channelName: "Broker Intake: Aon Risk (Portal Upload)",
    priority: "P1",
    priorityScore: 94,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "2h 30m remaining",
    priorityReason: "Tier-1 Aon Producer • $14.2M High TIV • Complete ESFR Schedule",
    // Unified Account View demo: warehousing subsidiary under the same
    // parent account as the Apex Freight trucking line.
    accountName: "Apex Freight Holdings",
    insured: "Summit Warehousing & Logistics",
    fein: "81-440000PX",
    dot: "N/A (Fixed Facility)",
    address: "8800 Logistics Parkway, Dallas, TX 75261",
    broker: "Aon Commercial Risk Solutions",
    email: "property@aonrisk.com",
    desk: "Commercial Property & Real Estate Desk",
    underwriter: "David Chen (Property Senior UW)",
    exposure: "$14,200,000",
    exposureVal: 14200000,
    authorityLimit: 15000000,
    receivedAt: "2026-08-25 10:30 AM",
    receivedTimestamp: 1787663400000,
    statusText: "UW Review",
    statusBadge: "badge-info",
    currentStep: 4,
    completedSteps: [1, 2, 3],
    docs: [
      { name: "ACORD_140_Commercial_Property_Application.pdf", type: "pdf", desc: "Property Application • 6 Pages • 2.2 MB" },
      { name: "Summit_Warehouse_Building_SOV_Schedule.xlsx", type: "xls", desc: "Building & BPP Statement of Values • 380 KB" },
      { name: "Prior_3_Years_Property_Loss_Runs.pdf", type: "pdf", desc: "Carrier Verified Loss Runs • $9,600 Incurred" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Total Insured Value (TIV)", val: "$14,200,000", conf: "99.9%" },
      { key: "Construction Class", val: "ISO Class 4 (Masonry Non-Combustible)", conf: "99.1%" },
      { key: "Square Footage", val: "185,000 Sq. Ft.", conf: "98.7%" },
      { key: "Fire Protection", val: "100% ESFR Wet Sprinklered", conf: "99.5%" },
      { key: "Roof Year / Type", val: "2021 TPO Membrane", conf: "97.8%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48290-PX",
      source_channel: "Broker Portal (Aon)",
      applicant: {
        legal_name: "Summit Warehousing & Logistics",
        fein: "81-440000PX",
        tiv_total: 14200000,
        building_value: 9800000,
        contents_bpp: 4400000,
        occupancy: "Dry Warehousing / Palletized Storage"
      },
      cope: {
        construction: "Masonry Non-Combustible",
        protection_class: "ISO Class 3 (Hydrant 250ft)",
        exposure: "Minimal (Isolated Industrial Park)"
      }
    },
    appetiteRules: [
      { ruleId: "PROP-001", category: "Property Eligibility", factor: "Maximum Single Location TIV", operator: "<=", baseValue: 25000000, unit: "$", canOverride: true, guardrail: "<= $25.0M", val: "$14.2M", pass: true },
      { ruleId: "PROP-002", category: "Property Eligibility", factor: "Minimum Sprinkler Protection Coverage", operator: ">=", baseValue: 85, unit: "%", canOverride: true, guardrail: ">= 85% for Warehouse", val: "100% ESFR", pass: true },
      { ruleId: "PROP-003", category: "Property Eligibility", factor: "High Hazard Flood / Surge Zone", operator: "=", baseValue: "No High Hazard A/V", unit: "Zone", canOverride: false, guardrail: "No High Hazard A/V Zone", val: "Zone X (Minimal)", pass: true },
      { ruleId: "PROP-004", category: "Property Eligibility", factor: "Maximum Wildfire Hazard Index", operator: "<=", baseValue: 45, unit: "Score", canOverride: true, guardrail: "<= 45", val: "Score 12 (Very Low)", pass: true }
    ],
    enrichmentCards: [
      { title: "HazardHub Property Risk", icon: "ph-fire", val: "Grade A (Low Risk)", label: "PPC Class 3 • Fire Station 1.2 mi", tag: "badge-success" },
      { title: "Catastrophe / Flood Model", icon: "ph-cloud-rain", val: "Zone X (100-Yr Safe)", label: "Distance to Coast: 240 Miles", tag: "badge-info" },
      { title: "Dun & Bradstreet Paydex", icon: "ph-bank", val: "84 / 100", label: "Punctual Premium & Payment Record", tag: "badge-success" }
    ],
    subjectivities: [
      "Satisfactory visual roof inspection report verifying 2021 installation.",
      "Confirmation of central station alarm monitoring certificate.",
      "Annual testing certification of ESFR sprinkler system pumps."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Water pipe freeze during January cold snap (Repaired)", status: "Closed", incurred: "$7,500" },
      { year: "2023 - 2024", desc: "No losses recorded", status: "Clean", incurred: "$0" },
      { year: "2022 - 2023", desc: "Small outdoor pallet burn - No structural impact", status: "Closed", incurred: "$2,100" }
    ],
    quoteNo: "QT-PRP-2026-51209",
    coverageRows: [
      { line: "Building Real Property Coverage (Special Form / RC)", limit: "$9,800,000", ded: "$10,000", prem: "$20,500.00" },
      { line: "Business Personal Property (Contents / Inventory)", limit: "$4,400,000", ded: "$10,000", prem: "$8,900.00" },
      { line: "Business Income with Extra Expense (12 Months ALS)", limit: "$1,500,000", ded: "72 Hours", prem: "$3,000.00" }
    ]
  },

  {
    id: "SUB-48501-PX",
    lobKey: "property",
    lobName: "Commercial Property",
    channelType: "direct",
    channelName: "Direct Customer Portal (Self-Service Online)",
    priority: "P3",
    priorityScore: 72,
    slaText: "48h Standard FIFO",
    slaCountdown: "34h 15m remaining",
    priorityReason: "Direct Portal Intake • Standard FIFO Processing Order",
    // Unified Account View demo: second example account, spanning exactly
    // two lines of business (Property + GL CPC).
    accountName: "Sunstate Industrial Group",
    insured: "Sunstate Cold Storage & Distribution",
    fein: "59-3391024",
    dot: "N/A (Property)",
    address: "500 Port Blvd, Tampa, FL 33605",
    broker: "Direct Customer Portal",
    email: "insurance@sunstatecold.com",
    desk: "Commercial Property & Real Estate Desk",
    underwriter: "David Chen (Property Senior UW)",
    exposure: "$9,500,000",
    exposureVal: 9500000,
    authorityLimit: 15000000,
    receivedAt: "2026-08-25 03:10 PM",
    receivedTimestamp: 1787680200000,
    statusText: "Ingestion Pipeline",
    statusBadge: "badge-primary",
    currentStep: 1,
    completedSteps: [],
    docs: [
      { name: "Sunstate_SelfService_App.pdf", type: "pdf", desc: "Customer Property Portal Form • 4 Pages" },
      { name: "Cold_Storage_Equipment_SOV.xlsx", type: "xls", desc: "Freezer & Building SOV • 310 KB" },
      { name: "Prior_Loss_Runs_5Yr.pdf", type: "pdf", desc: "Prior 5-Year Loss History • $5,000 Incurred" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Total Insured Value (TIV)", val: "$9,500,000", conf: "99.8%" },
      { key: "Occupancy", val: "Cold Storage / Ammonia Refrigeration", conf: "99.2%" },
      { key: "Sprinkler Protection", val: "Wet Pipe with Anti-Freeze Loops", conf: "98.9%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48501-PX",
      source_channel: "Direct Customer Portal",
      applicant: {
        legal_name: "Sunstate Cold Storage & Distribution",
        fein: "59-3391024",
        tiv_total: 9500000
      }
    },
    appetiteRules: [
      { ruleId: "PROP-001", category: "Property Eligibility", factor: "Maximum Single Location TIV", operator: "<=", baseValue: 25000000, unit: "$", canOverride: true, guardrail: "<= $25.0M", val: "$9.5M", pass: true },
      { ruleId: "PROP-005", category: "Property Eligibility", factor: "Windstorm Tier 1 County Exclusion", operator: "=", baseValue: "Meets Tier 2 distance", unit: "Zone", canOverride: false, guardrail: "Meets Tier 2 distance", val: "Inland Tampa", pass: true },
      { ruleId: "PROP-006", category: "Property Eligibility", factor: "Ammonia Refrigeration Safety System", operator: "=", baseValue: "Mandatory Auto Shutoff", unit: "System", canOverride: false, guardrail: "Mandatory Auto Shutoff", val: "Sensors Active", pass: true }
    ],
    enrichmentCards: [
      { title: "HazardHub Property Risk", icon: "ph-fire", val: "Grade B (Moderate)", label: "ISO PPC Class 4", tag: "badge-info" },
      { title: "Wind / Hurricane Score", icon: "ph-wind", val: "Cat 2 Rating", label: "Hurricane Straps in Place", tag: "badge-warning" },
      { title: "D&B Credit Rating", icon: "ph-bank", val: "79 / 100", label: "Good Financial Health", tag: "badge-success" }
    ],
    subjectivities: [
      "Inspection of ammonia refrigeration pressure relief valves within 30 days.",
      "Windstorm mitigation questionnaire completed and signed."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Minor roof flashing leak during heavy rain", status: "Closed", incurred: "$5,000" }
    ],
    quoteNo: "QT-PRP-2026-61028",
    coverageRows: [
      { line: "Building & Refrigeration Structure", limit: "$6,500,000", ded: "$10,000", prem: "$16,500.00" },
      { line: "Business Personal Property / Perishable Inventory", limit: "$3,000,000", ded: "$10,000", prem: "$7,200.00" }
    ]
  },

  // --------------------------------------------------------------------------
  // 3. MPL - MANAGEMENT & PROFESSIONAL LIABILITY
  // --------------------------------------------------------------------------
  {
    id: "SUB-48301-NY",
    lobKey: "mpl",
    lobName: "MPL - Professional Liability",
    channelType: "direct",
    channelName: "Direct Customer Portal (Online Self-Service)",
    priority: "P1",
    priorityScore: 92,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "1h 50m remaining",
    priorityReason: "Clean Loss Free History (0 Claims / 5 Yrs) • Fast-Track Digital Bind",
    insured: "Vanguard Advisory Partners LLC",
    fein: "22-9901452",
    dot: "N/A (Financial Services)",
    address: "200 Park Avenue, 35th Floor, New York, NY 10166",
    broker: "Direct Customer (No Intermediary)",
    email: "legal@vanguardpartners.com",
    desk: "Financial & Professional Executive Lines Desk",
    underwriter: "Elena Rostova (MPL Practice Lead)",
    exposure: "$8,500,000",
    exposureVal: 8500000,
    authorityLimit: 10000000,
    receivedAt: "2026-08-25 11:45 AM",
    receivedTimestamp: 1787667900000,
    statusText: "Ready for Quote",
    statusBadge: "badge-success",
    currentStep: 7,
    completedSteps: [1, 2, 3, 4, 5, 6],
    docs: [
      { name: "MPL_Application_Financial_Consulting.pdf", type: "pdf", desc: "Self-Service Digital Application • 1.1 MB" },
      { name: "Vanguard_Client_Fee_Schedule.xlsx", type: "xls", desc: "Annual Revenue by Practice Area • 210 KB" },
      { name: "5_Year_EandO_Loss_Runs_Carrier_Signed.pdf", type: "pdf", desc: "Zero Claims Verification Letter • 850 KB" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Annual Gross Revenue", val: "$8,500,000", conf: "99.8%" },
      { key: "Practice Area", val: "Corporate Strategy & M&A Advisory", conf: "99.4%" },
      { key: "Number of Consultants", val: "28 Full-Time Professionals", conf: "98.9%" },
      { key: "Standard Client Contract", val: "100% Written Engagement Letters", conf: "99.1%" },
      { key: "Retroactive Date", val: "09/01/2018 (Full Prior Acts)", conf: "99.0%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48301-NY",
      source_channel: "Direct Customer Intake Portal",
      applicant: {
        legal_name: "Vanguard Advisory Partners LLC",
        fein: "22-9901452",
        annual_revenue: 8500000,
        professional_staff_count: 28,
        services: "Management Consulting / Mergers & Acquisitions"
      },
      underwriting: {
        risk_management: "Mandatory Limitation of Liability Clauses in 100% contracts",
        loss_history_5yr: 0
      }
    },
    appetiteRules: [
      { ruleId: "MPL-001", category: "Professional Liability Eligibility", factor: "Prohibited Practice Classes", operator: "=", baseValue: "Excluded high-risk financial", unit: "Class", canOverride: false, guardrail: "Excludes Securities / Crypto", val: "Strategy / M&A", pass: true },
      { ruleId: "MPL-002", category: "Professional Liability Eligibility", factor: "Minimum Years in Business", operator: ">=", baseValue: 3, unit: "Years", canOverride: true, guardrail: ">= 3", val: "8 Years", pass: true },
      { ruleId: "MPL-003", category: "Professional Liability Eligibility", factor: "Standard Limitation of Liability Clause", operator: "=", baseValue: "Required", unit: "Clause", canOverride: true, guardrail: "Required in all master agreements", val: "Present in 100%", pass: true },
      { ruleId: "MPL-004", category: "Professional Liability Eligibility", factor: "Maximum Prior Claims (5-Yr)", operator: "<=", baseValue: 2, unit: "Claims", canOverride: true, guardrail: "<= 2", val: "0 Claims", pass: true }
    ],
    enrichmentCards: [
      { title: "State Bar & Licensing Board", icon: "ph-certificate", val: "100% Active / Clean", label: "No Regulatory Inquiries Found", tag: "badge-success" },
      { title: "Financial Stability Score", icon: "ph-chart-line", val: "Tier 1 (Prime)", label: "Revenue CAGR +14% YoY", tag: "badge-info" },
      { title: "Adverse Media / Litigation", icon: "ph-newspaper", val: "Zero Matches", label: "Checked 450+ Legal Databases", tag: "badge-success" }
    ],
    subjectivities: [
      "Signed Warranty and Representation Letter by Managing Partner.",
      "Sample standard client master service agreement with limitation of liability clause.",
      "Confirmation of no knowledge of potential errors or omissions."
    ],
    losses: [
      { year: "2024 - 2025", desc: "No claims / incidents reported", status: "Clean", incurred: "$0" },
      { year: "2023 - 2024", desc: "No claims / incidents reported", status: "Clean", incurred: "$0" },
      { year: "2022 - 2023", desc: "No claims / incidents reported", status: "Clean", incurred: "$0" }
    ],
    quoteNo: "QT-MPL-2026-10492",
    coverageRows: [
      { line: "Errors & Omissions (E&O) Professional Liability", limit: "$3,000,000 Each Claim / $5,000,000 Aggregate", ded: "$25,000", prem: "$14,500.00" },
      { line: "Directors & Officers (D&O) Management Liability", limit: "$2,000,000 Limit", ded: "$15,000", prem: "$3,700.00" }
    ]
  },

  {
    id: "SUB-48302-MA",
    lobKey: "mpl",
    lobName: "MPL - Professional Liability",
    channelType: "broker",
    channelName: "Broker Intake: Willis Towers Watson (WTW)",
    priority: "P2",
    priorityScore: 82,
    slaText: "24h Standard SLA",
    slaCountdown: "14h 20m remaining",
    priorityReason: "Tier-1 WTW Broker • $12M Exposure • Audit In Progress",
    // Archival Policy demo: retired 150 days ago — eligible for archival
    // under the default policy (retired + 90 day retention).
    lifecycleStatus: "retired",
    lifecycleStatusAt: Date.now() - (150 * 24 * 60 * 60 * 1000),
    insured: "Beacon Financial & Legal Advisory Group",
    fein: "04-8831920",
    dot: "N/A (Professional Lines)",
    address: "100 High Street, 22nd Floor, Boston, MA 02110",
    broker: "Willis Towers Watson Commercial",
    email: "finpro@wtwco.com",
    desk: "Financial & Professional Executive Lines Desk",
    underwriter: "Elena Rostova (MPL Practice Lead)",
    exposure: "$12,000,000",
    exposureVal: 12000000,
    authorityLimit: 15000000,
    receivedAt: "2026-08-25 01:10 PM",
    receivedTimestamp: 1787673000000,
    statusText: "UW Review",
    statusBadge: "badge-primary",
    currentStep: 4,
    completedSteps: [1, 2, 3],
    docs: [
      { name: "WTW_Executive_MPL_Submission.pdf", type: "pdf", desc: "Executive Package Application • 8 Pages" },
      { name: "Beacon_Fee_Revenue_Audit.xlsx", type: "xls", desc: "Audited Financials • 340 KB" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Annual Gross Fee Revenue", val: "$12,000,000", conf: "99.8%" },
      { key: "Practice Specialization", val: "Corporate Tax & Executive Retained Advisory", conf: "99.2%" },
      { key: "Partner Count", val: "18 Senior Partners", conf: "98.9%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48302-MA",
      source_channel: "Broker Ingestion (WTW)",
      applicant: {
        legal_name: "Beacon Financial & Legal Advisory Group",
        fein: "04-8831920",
        annual_revenue: 12000000
      }
    },
    appetiteRules: [
      { ruleId: "MPL-002", category: "Professional Liability Eligibility", factor: "Minimum Years in Business", operator: ">=", baseValue: 3, unit: "Years", canOverride: true, guardrail: ">= 3", val: "12 Years", pass: true },
      { ruleId: "MPL-003", category: "Professional Liability Eligibility", factor: "Mandatory Limitation of Liability Clause", operator: "=", baseValue: "Required", unit: "Clause", canOverride: true, guardrail: "Required in all client MSAs", val: "Present in 100%", pass: true }
    ],
    enrichmentCards: [
      { title: "Massachusetts Board of Bar Overseers", icon: "ph-certificate", val: "100% Clean", label: "Zero Disciplinary Actions", tag: "badge-success" },
      { title: "Financial Solvency Rating", icon: "ph-chart-line", val: "Tier 1 (AAA)", label: "Top-Quartile Balance Sheet", tag: "badge-success" },
      { title: "Litigation & PACER Search", icon: "ph-newspaper", val: "Clean Record", label: "Zero Open Federal Suits", tag: "badge-info" }
    ],
    subjectivities: [
      "Signed statement of no known losses or potential claims.",
      "Copy of standard master services agreement."
    ],
    losses: [
      { year: "2024 - 2025", desc: "No claims recorded", status: "Clean", incurred: "$0" }
    ],
    quoteNo: "QT-MPL-2026-88129",
    coverageRows: [
      { line: "E&O Professional Liability", limit: "$5,000,000 Aggregate", ded: "$50,000", prem: "$24,000.00" }
    ]
  },

  // --------------------------------------------------------------------------
  // 4. GL CPC - COMMERCIAL PACKAGE & CONTRACTORS
  // --------------------------------------------------------------------------
  {
    id: "SUB-48315-OH",
    lobKey: "gl_cpc",
    lobName: "GL CPC - Commercial Package & Contractors",
    channelType: "broker",
    channelName: "Broker Intake: Gallagher (Broker API)",
    priority: "P1",
    priorityScore: 91,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "2h 15m remaining",
    priorityReason: "Direct API Ingestion • Zero OSHA Violations • Complete Subcontractor SOV",
    // Unified Account View demo: contracting/yard-operations subsidiary
    // under the same parent account as Apex Freight Holdings.
    accountName: "Apex Freight Holdings",
    insured: "BuildCraft Commercial Contracting Inc.",
    fein: "81-440000OH",
    dot: "N/A (Contracting)",
    address: "410 Industrial Way, Columbus, OH 43215",
    broker: "Gallagher Commercial Brokers",
    email: "commercial@ajg.com",
    desk: "Construction & Commercial Package Team",
    underwriter: "Michael Rossi (Casualty Specialist)",
    exposure: "$4,200,000",
    exposureVal: 4200000,
    authorityLimit: 5000000,
    receivedAt: "2026-08-25 12:15 PM",
    receivedTimestamp: 1787669700000,
    statusText: "Clearance Cleared",
    statusBadge: "badge-primary",
    currentStep: 3,
    completedSteps: [1, 2],
    docs: [
      { name: "ACORD_125_Commercial_Package_Application.pdf", type: "pdf", desc: "Package Application • 5 Pages • 1.8 MB" },
      { name: "BuildCraft_Contractor_Payroll_Schedule.xlsx", type: "xls", desc: "Direct Payroll & Subcontractor breakdown" },
      { name: "BuildCraft_3_Year_GL_Loss_Runs.pdf", type: "pdf", desc: "Loss Runs • 2 Minor Closed Claims" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Annual Direct Payroll", val: "$4,200,000", conf: "99.7%" },
      { key: "Subcontracted Cost", val: "$1,800,000", conf: "98.9%" },
      { key: "Contractor Class", val: "Commercial Interior Buildout & Fit-out", conf: "99.1%" },
      { key: "Subcontractor Risk Transfer", val: "Mandatory Hold Harmless & AI", conf: "99.3%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48315-OH",
      source_channel: "Broker API (Gallagher)",
      applicant: {
        legal_name: "BuildCraft Commercial Contracting Inc.",
        fein: "81-440000OH",
        direct_payroll: 4200000,
        subcontractor_cost: 1800000,
        class_code: "91580 - Commercial Carpentry / Interiors"
      },
      compliance: {
        written_subcontract_agreement: "Enforced 100%",
        minimum_sub_limit_required: "$1,000,000 CSL"
      }
    },
    appetiteRules: [
      { ruleId: "GL-001", category: "Casualty Eligibility", factor: "Contractor Operations Class", operator: "=", baseValue: "Commercial Interior Only", unit: "Class", canOverride: false, guardrail: "No Residential Tract / Roofing", val: "Interior Commercial", pass: true },
      { ruleId: "GL-002", category: "Casualty Eligibility", factor: "Subcontractor Hold Harmless Agreement", operator: "=", baseValue: "Required", unit: "Agreement", canOverride: true, guardrail: "Mandatory Hold Harmless Clause", val: "100% In Place", pass: true },
      { ruleId: "GL-003", category: "Casualty Eligibility", factor: "Maximum Subcontractor Ratio", operator: "<=", baseValue: 50, unit: "%", canOverride: true, guardrail: "<= 50%", val: "30.0%", pass: true },
      { ruleId: "GL-004", category: "Casualty Eligibility", factor: "Maximum 3-Yr Incurred Loss Ratio", operator: "<=", baseValue: 45, unit: "%", canOverride: true, guardrail: "<= 45%", val: "22.1%", pass: true }
    ],
    enrichmentCards: [
      { title: "OSHA Safety Inspection Record", icon: "ph-hard-hat", val: "Zero Violations", label: "Clean Safety Log across 14 Job Sites", tag: "badge-success" },
      { title: "State Contractor License", icon: "ph-identification-badge", val: "Class A Verified", label: "Active in OH, PA, IN with zero bonds revoked", tag: "badge-success" },
      { title: "Credit & Lien Registry", icon: "ph-scales", val: "Zero Mechanic Liens", label: "D&B Score: 86/100", tag: "badge-info" }
    ],
    subjectivities: [
      "Copy of standard Subcontractor Agreement with indemnification and waiver of subrogation.",
      "Certificates of insurance from top 3 subcontractors evidencing $1M GL limits.",
      "Written safety manual and tailgate safety meeting log."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Minor slip & fall on job site (subcontractor fault)", status: "Closed", incurred: "$3,800" },
      { year: "2023 - 2024", desc: "Material damage to adjacent drywall (repaired)", status: "Closed", incurred: "$1,200" },
      { year: "2022 - 2023", desc: "No losses recorded", status: "Clean", incurred: "$0" }
    ],
    quoteNo: "QT-CPC-2026-33901",
    coverageRows: [
      { line: "Commercial General Liability (Each Occurrence)", limit: "$1,000,000 Limit", ded: "$2,500", prem: "$22,000.00" },
      { line: "General Aggregate Limit", limit: "$2,000,000 Aggregate", ded: "N/A", prem: "Included" },
      { line: "Products / Completed Operations Aggregate", limit: "$2,000,000 Aggregate", ded: "$2,500", prem: "$5,500.00" }
    ]
  },

  {
    id: "SUB-48316-IL",
    lobKey: "gl_cpc",
    lobName: "GL CPC - Commercial Package & Contractors",
    channelType: "direct",
    channelName: "Direct Customer Portal (Contractor Portal)",
    priority: "P3",
    priorityScore: 74,
    slaText: "48h FIFO SLA",
    slaCountdown: "32h remaining",
    priorityReason: "Direct Self-Service Submission • Standard Queue Queue",
    // Unified Account View demo: second LOB (GL CPC) for the same
    // Sunstate Industrial Group parent account.
    accountName: "Sunstate Industrial Group",
    insured: "Tri-State General Contractors Group",
    fein: "36-9912048",
    dot: "N/A (Contracting)",
    address: "950 Construction Blvd, Peoria, IL 61602",
    broker: "Direct Customer (Online Portal)",
    email: "bids@tristategc.com",
    desk: "Construction & Commercial Package Team",
    underwriter: "Michael Rossi (Casualty Specialist)",
    exposure: "$3,600,000",
    exposureVal: 3600000,
    authorityLimit: 5000000,
    receivedAt: "2026-08-25 03:30 PM",
    receivedTimestamp: 1787681400000,
    statusText: "Intake Ingested",
    statusBadge: "badge-primary",
    currentStep: 1,
    completedSteps: [],
    docs: [
      { name: "TriState_Commercial_App.pdf", type: "pdf", desc: "Contractor Portal Submission • 4 Pages" },
      { name: "Equipment_and_Payroll_SOV.xlsx", type: "xls", desc: "Equipment schedule & direct labor" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Annual Direct Payroll", val: "$3,600,000", conf: "99.8%" },
      { key: "Contractor Class", val: "Commercial Structural & Electrical", conf: "99.1%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48316-IL",
      source_channel: "Direct Customer Online Portal",
      applicant: {
        legal_name: "Tri-State General Contractors Group",
        fein: "36-9912048",
        annual_payroll: 3600000
      }
    },
    appetiteRules: [
      { ruleId: "GL-001", category: "Casualty Eligibility", factor: "Contractor Operations Class", operator: "=", baseValue: "Eligible Class", unit: "Class", canOverride: false, guardrail: "Eligible Contractor Class", val: "Commercial Grade", pass: true },
      { ruleId: "GL-002", category: "Casualty Eligibility", factor: "Subcontractor Risk Transfer In Place", operator: "=", baseValue: "Required", unit: "Agreement", canOverride: true, guardrail: "Mandatory Hold Harmless", val: "Verified Active", pass: true }
    ],
    enrichmentCards: [
      { title: "OSHA Safety Record", icon: "ph-hard-hat", val: "Zero Major Violations", label: "Past 4 Years Audited", tag: "badge-success" },
      { title: "Illinois State License Board", icon: "ph-identification-badge", val: "Active & Good Standing", label: "License #IL-99412", tag: "badge-success" },
      { title: "Credit Registry Score", icon: "ph-scales", val: "83 / 100", label: "Low Risk Profile", tag: "badge-info" }
    ],
    subjectivities: [
      "Receipt of certificates of insurance from all scheduled subcontractors."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Clean loss record", status: "Clean", incurred: "$0" }
    ],
    quoteNo: "QT-CPC-2026-90412",
    coverageRows: [
      { line: "Commercial General Liability", limit: "$1,000,000 / $2,000,000 Agg", ded: "$2,500", prem: "$19,500.00" }
    ]
  },

  // --------------------------------------------------------------------------
  // 5. GL CAS - HIGH HAZARD CASUALTY & SURPLUS
  // --------------------------------------------------------------------------
  {
    id: "SUB-48420-TX",
    lobKey: "gl_cas",
    lobName: "GL CAS - High Hazard Casualty & Surplus",
    channelType: "broker",
    channelName: "Broker Intake: Amwins Wholesale (Email Submission)",
    priority: "P1",
    priorityScore: 98,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "1h 10m remaining",
    priorityReason: "Amwins Wholesale • $15M High Hazard Exposure • CUO Referral Desk",
    // Archival Policy demo: retired long ago and already archived by a
    // manager — remains fully accessible for audit per policy.
    lifecycleStatus: "retired",
    lifecycleStatusAt: Date.now() - (280 * 24 * 60 * 60 * 1000),
    archived: true,
    archivedAt: Date.now() - (95 * 24 * 60 * 60 * 1000),
    archivedBy: "Elena Rostova (Head of Binding & Policy Operations)",
    insured: "Quantum Energy & Chemical Solutions LLC",
    fein: "95-1049281",
    dot: "N/A (Surplus Casualty)",
    address: "700 Chemical Row, Pasadena, TX 77506",
    broker: "Amwins Specialty Wholesale Brokerage",
    email: "casualty@amwins.com",
    desk: "Complex Surplus Casualty & Energy Desk",
    underwriter: "Victoria Thorne (Senior Casualty Underwriter)",
    exposure: "$15,000,000",
    exposureVal: 15000000,
    authorityLimit: 5000000, // triggers senior referral!
    receivedAt: "2026-08-25 01:20 PM",
    receivedTimestamp: 1787673600000,
    statusText: "Senior Referral",
    statusBadge: "badge-warning",
    currentStep: 5,
    completedSteps: [1, 2, 3, 4],
    docs: [
      { name: "ACORD_Surplus_Casualty_Specialty.pdf", type: "pdf", desc: "Surplus Lines Supplemental • 3.4 MB" },
      { name: "Quantum_Chemical_Bulk_Facility_Schedule.xlsx", type: "xls", desc: "Bulk Storage Tank SOV • 490 KB" },
      { name: "10_Year_Complete_Environmental_Loss_Runs.pdf", type: "pdf", desc: "Full Environmental Loss History" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Total Production Revenue", val: "$15,000,000", conf: "99.6%" },
      { key: "Hazard Classification", val: "Specialty Industrial Lubricants & Polymers", conf: "98.8%" },
      { key: "EPA Tier II Reporting", val: "Full Compliance Verified", conf: "99.0%" },
      { key: "Environmental Containment", val: "110% Secondary Concrete Bunding", conf: "99.4%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48420-TX",
      source_channel: "Wholesale Broker Intake (Amwins)",
      applicant: {
        legal_name: "Quantum Energy & Chemical Solutions LLC",
        fein: "95-1049281",
        annual_revenue: 15000000,
        hazard_class: "Industrial Specialty Blending"
      },
      exposure_risk: {
        requires_senior_signoff: true,
        authority_threshold: 5000000,
        submission_exposure: 15000000
      }
    },
    appetiteRules: [
      { ruleId: "CAS-001", category: "Environmental / Casualty Eligibility", factor: "Minimum Secondary Containment (Bulk Chemical)", operator: ">=", baseValue: 100, unit: "%", canOverride: true, guardrail: ">= 100%", val: "110% Double Bunded", pass: true },
      { ruleId: "CAS-002", category: "Environmental / Casualty Eligibility", factor: "EPA / TCEQ Notice of Violation", operator: "=", baseValue: "Clean Record", unit: "Status", canOverride: false, guardrail: "Clean record past 3 years", val: "0 Active Violations", pass: true },
      { ruleId: "CAS-003", category: "Environmental / Casualty Eligibility", factor: "PFAS / Forever Chemicals Synthesis", operator: "=", baseValue: "No PFAS Operations", unit: "Status", canOverride: false, guardrail: "Strictly Excluded", val: "0% (Strictly Excluded)", pass: true },
      { ruleId: "CAS-004", category: "Environmental / Casualty Eligibility", factor: "Maximum Cumulative 5-Yr Loss History", operator: "<=", baseValue: 100000, unit: "$", canOverride: true, guardrail: "<= $100,000", val: "$12,000 Incurred", pass: true }
    ],
    enrichmentCards: [
      { title: "EPA ECHO Compliance Registry", icon: "ph-flask", val: "100% In Compliance", label: "Clean Air & Clean Water Act Clear", tag: "badge-success" },
      { title: "Hazard hazardous Materials Matrix", icon: "ph-skull", val: "Class 3 Flammable Liquids", label: "NFPA 30 Compliant Storage", tag: "badge-warning" },
      { title: "Moody's Risk Evaluation", icon: "ph-shield-check", val: "Investment Grade B+", label: "Strong Balance Sheet Reserves", tag: "badge-info" }
    ],
    subjectivities: [
      "Third-party engineering inspection of bulk tank secondary containment within 45 days.",
      "Copy of comprehensive emergency spill response plan and contract with certified HAZMAT responder.",
      "Signed and completed pollution exclusion questionnaire."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Minor contained spill in yard - Cleaned per protocol", status: "Closed", incurred: "$6,500" },
      { year: "2023 - 2024", desc: "No losses recorded", status: "Clean", incurred: "$0" },
      { year: "2022 - 2023", desc: "Worker PPE eye irritation incident (Closed)", status: "Closed", incurred: "$5,500" }
    ],
    quoteNo: "QT-CAS-2026-99044",
    coverageRows: [
      { line: "Commercial General Liability (High Hazard Casualty)", limit: "$1,000,000 Each Occurrence / $2,000,000 Agg", ded: "$50,000", prem: "$62,000.00" },
      { line: "Site Pollution Incident Liability Endorsement", limit: "$1,000,000 Limit", ded: "$50,000", prem: "$22,000.00" }
    ]
  },

  {
    id: "SUB-48512-CA",
    lobKey: "gl_cas",
    lobName: "GL CAS - High Hazard Casualty & Surplus",
    channelType: "broker",
    channelName: "Broker Intake: Marsh (API Ingestion)",
    priority: "P2",
    priorityScore: 86,
    slaText: "24h Standard SLA",
    slaCountdown: "16h 40m remaining",
    priorityReason: "Marsh Wholesale • $20M Capacity • Excess Surplus Review",
    // Archival Policy demo: retired only 20 days ago — NOT YET eligible
    // under the default 90-day retention policy.
    lifecycleStatus: "retired",
    lifecycleStatusAt: Date.now() - (20 * 24 * 60 * 60 * 1000),
    insured: "Pacific BioChemical Energy Ltd",
    fein: "94-2201948",
    dot: "N/A (Casualty)",
    address: "1200 Refinery Road, Richmond, CA 94801",
    broker: "Marsh & McLennan Commercial Brokerage",
    email: "energy@marshbrokerage.com",
    desk: "Complex Surplus Casualty & Energy Desk",
    underwriter: "Victoria Thorne (Senior Casualty Underwriter)",
    exposure: "$20,000,000",
    exposureVal: 20000000,
    authorityLimit: 5000000,
    receivedAt: "2026-08-25 04:00 PM",
    receivedTimestamp: 1787683200000,
    statusText: "Senior Referral",
    statusBadge: "badge-warning",
    currentStep: 5,
    completedSteps: [1, 2, 3, 4],
    docs: [
      { name: "Pacific_BioChem_Casualty_App.pdf", type: "pdf", desc: "Surplus Lines Casualty App • 8 Pages" },
      { name: "Environmental_Risk_Assessment.pdf", type: "pdf", desc: "Third-party Phase 1 Audit • 5.1 MB" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Annual Revenue", val: "$20,000,000", conf: "99.7%" },
      { key: "Biofuel Processing Type", val: "Ethanol & Biodiesel Blending", conf: "99.1%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-48512-CA",
      source_channel: "Broker API (Marsh)",
      applicant: {
        legal_name: "Pacific BioChemical Energy Ltd",
        fein: "94-2201948",
        annual_revenue: 20000000
      }
    },
    appetiteRules: [
      { ruleId: "CAS-001", category: "Environmental / Casualty Eligibility", factor: "Minimum Secondary Containment Level", operator: ">=", baseValue: 100, unit: "%", canOverride: true, guardrail: ">= 100%", val: "120% Reinforced", pass: true },
      { ruleId: "CAS-005", category: "Environmental / Casualty Eligibility", factor: "Active EPA Consent Decrees", operator: "=", baseValue: "Zero Outstanding", unit: "Status", canOverride: false, guardrail: "Zero Outstanding Orders", val: "None Active", pass: true }
    ],
    enrichmentCards: [
      { title: "EPA ECHO Compliance", icon: "ph-flask", val: "100% Clear", label: "Clean Air Compliance", tag: "badge-success" },
      { title: "California Cal/OSHA", icon: "ph-identification-badge", val: "Grade A", label: "Zero Major Violations", tag: "badge-success" },
      { title: "Moody's Risk Grade", icon: "ph-shield-check", val: "A- Rated", label: "Excellent Solvency", tag: "badge-info" }
    ],
    subjectivities: [
      "Annual third-party leak detection audit report.",
      "Certified spill prevention control and countermeasure (SPCC) plan."
    ],
    losses: [
      { year: "2023 - 2024", desc: "Minor gasket leak in valve station (Cleaned)", status: "Closed", incurred: "$8,000" }
    ],
    quoteNo: "QT-CAS-2026-77890",
    coverageRows: [
      { line: "Commercial General Liability (Casualty Surplus)", limit: "$1,000,000 / $2,000,000 Agg", ded: "$50,000", prem: "$74,000.00" }
    ]
  },

  // --------------------------------------------------------------------------
  // 6. PRD-016: PRODUCT STUDIO MOTOR CONFIGURATION (Yash_new v2026.08)
  // --------------------------------------------------------------------------
  {
    id: "SUB-PRD016-01-TX",
    lobKey: "prd016",
    lobName: "PRD-016 Yash_new (Motor v2026.08)",
    channelType: "direct",
    channelName: "Direct Web Portal (Product Studio Engine)",
    priority: "P1",
    priorityScore: 95,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "3h 10m remaining",
    priorityReason: "Product Studio PRD-016 Registered Risk • Clean Driving Record",
    insured: "Vikram Sinha (Toyota Fortuner 2024)",
    fein: "IND-8829012",
    dot: "N/A (Personal Lines Motor)",
    address: "B-402 Green Park Extension, New Delhi, DL 110016",
    broker: "Direct Customer (Web Intake)",
    email: "vikram.sinha@example.com",
    desk: "Personal Lines Motor UW Desk",
    underwriter: "Anika Sharma (Product Manager & Motor UW)",
    exposure: "$52,000",
    exposureVal: 52000,
    authorityLimit: 2000000,
    receivedAt: "2026-08-27 11:30 AM",
    receivedTimestamp: 1787827800000,
    statusText: "Ready for Quote",
    statusBadge: "badge-success",
    currentStep: 6,
    completedSteps: [1, 2, 3, 4, 5],
    docs: [
      { name: "PRD016_Motor_Application_VikramSinha.pdf", type: "pdf", desc: "Product Studio Questionnaire • 3 Pages" },
      { name: "Vehicle_Registration_Fortuner.pdf", type: "pdf", desc: "RC & Valuation Document • 1.1 MB" },
      { name: "Driver_Licence_Verification.pdf", type: "pdf", desc: "DL Verification Record • Clean 5 Yrs" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Vehicle Make & Model", val: "Toyota Fortuner 2.8L 4x4 AT", conf: "99.9%" },
      { key: "Year of Manufacture", val: "2024", conf: "99.8%" },
      { key: "Insured Value (IDV)", val: "$50,000", conf: "99.5%" },
      { key: "Primary Driver Age", val: "28 Years", conf: "99.2%" },
      { key: "Jurisdiction", val: "India", conf: "99.7%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-PRD016-01-TX",
      source_channel: "Direct Web Portal (PRD-016 Studio)",
      product_id: "PRD-016",
      product_version: "2026.08",
      applicant: {
        legal_name: "Vikram Sinha",
        driver_age: 28,
        vehicle_make: "Toyota",
        vehicle_model: "Fortuner",
        vehicle_year: 2024,
        vehicle_insured_value: 50000,
        policy_jurisdiction: "India",
        conviction_count: 0
      }
    },
    appetiteRules: [
      { ruleId: "ELG-001", category: "Eligibility", factor: "Minimum Driver Age", operator: ">=", baseValue: 21, unit: "Years", canOverride: true, guardrail: ">= 21", val: "28 Years", pass: true },
      { ruleId: "ELG-002", category: "Eligibility", factor: "Maximum Vehicle Age", operator: "<=", baseValue: 15, unit: "Years", canOverride: false, guardrail: "<= 15", val: "2 Years", pass: true },
      { ruleId: "ELG-003", category: "Eligibility", factor: "Jurisdiction Check", operator: "=", baseValue: "India, UAE, UK", unit: "Jurisdiction", canOverride: false, guardrail: "India, UAE, UK", val: "India", pass: true },
      { ruleId: "ELG-004", category: "Eligibility", factor: "Vehicle Type Allowlist", operator: "=", baseValue: "Private Car / SUV", unit: "Type", canOverride: true, guardrail: "Private Car / SUV", val: "SUV", pass: true }
    ],
    enrichmentCards: [
      { title: "RTO Registration Verification", icon: "ph-car", val: "Active & Verified", label: "DL-01-2024-99120", tag: "badge-success" },
      { title: "NCB History (No Claim Bonus)", icon: "ph-medal", val: "50% NCB Applied", label: "Clean 5-Year History", tag: "badge-success" },
      { title: "CIBIL / Credit Score", icon: "ph-chart-pie", val: "810 / 900", label: "Low Risk Profile", tag: "badge-info" }
    ],
    subjectivities: [
      "Copy of vehicle pre-inspection report.",
      "Self-declaration of zero pending traffic challans."
    ],
    losses: [
      { year: "2024 - 2025", desc: "Clean loss record", status: "Clean", incurred: "$0" }
    ],
    quoteNo: "QT-PRD016-2026-00421",
    coverageRows: [
      { line: "COV-001 Own Damage (Agreed Value)", limit: "$50,000", ded: "$300", prem: "$300.00" },
      { line: "COV-002 Third Party Liability", limit: "$100,000", ded: "$0", prem: "$64.04" },
      { line: "COV-003 Personal Accident", limit: "$25,000", ded: "$0", prem: "$30.00" }
    ]
  },
  {
    id: "SUB-PRD016-02-UAE",
    lobKey: "prd016",
    lobName: "PRD-016 Yash_new (Motor v2026.08)",
    channelType: "broker",
    channelName: "Broker Intake: Marsh UAE",
    priority: "P1",
    priorityScore: 98,
    slaText: "4h Fast-Track SLA",
    slaCountdown: "1h 45m remaining",
    priorityReason: "High-Value Vehicle ($145k Range Rover) • Triggers UW-REF-001 Referral & UW-RSTR-001 Theft Cap",
    insured: "Rashid Al-Maktoum (Range Rover Autobiography)",
    fein: "UAE-9910482",
    dot: "N/A (Personal Lines Motor)",
    address: "Villa 14, Palm Jumeirah, Dubai, UAE",
    broker: "Marsh Specialty Middle East",
    email: "motor@marsh.ae",
    desk: "High-Value Motor Specialist Team",
    underwriter: "Sarah Chen (Senior Motor UW)",
    exposure: "$145,000",
    exposureVal: 145000,
    authorityLimit: 100000,
    receivedAt: "2026-08-27 02:15 PM",
    receivedTimestamp: 1787837700000,
    statusText: "Senior Referral",
    statusBadge: "badge-warning",
    currentStep: 5,
    completedSteps: [1, 2, 3, 4],
    docs: [
      { name: "PRD016_Motor_Application_Rashid.pdf", type: "pdf", desc: "Product Studio Questionnaire • 4 Pages" },
      { name: "RangeRover_Valuation_Certificate.pdf", type: "pdf", desc: "Official Valuation $145,000" },
      { name: "Handwritten_Broker_Cover_Note.pdf", type: "pdf", desc: "Handwritten Broker Cover Note (Scanned) • 1 Page • 210 KB" }
    ],
    ocrFields: [
      { key: "Vehicle Make & Model", val: "Land Rover Range Rover Autobiography", conf: "99.9%" },
      { key: "Insured Value (IDV)", val: "$145,000", conf: "99.8%" },
      { key: "Primary Driver Age", val: "35 Years", conf: "99.4%" },
      { key: "Jurisdiction", val: "UAE", conf: "99.9%" },
      { key: "Broker Handling Note", val: "Fast-track requested; client eager to bind before renewal lapse", conf: "Manual Transcription", source: "Handwritten_Broker_Cover_Note.pdf" }
    ],
    canonicalJson: {
      submission_id: "SUB-PRD016-02-UAE",
      source_channel: "Broker Intake (Marsh UAE)",
      product_id: "PRD-016",
      applicant: {
        legal_name: "Rashid Al-Maktoum",
        driver_age: 35,
        vehicle_make: "Land Rover",
        vehicle_model: "Range Rover",
        vehicle_insured_value: 145000,
        policy_jurisdiction: "UAE",
        conviction_count: 1,
        conviction_severity: "Minor"
      }
    },
    appetiteRules: [
      { ruleId: "ELG-005", category: "Eligibility", factor: "Maximum Insured Value", operator: "<=", baseValue: 200000, unit: "$", canOverride: true, guardrail: "<= $200,000", val: "$145,000", pass: true },
      { ruleId: "UW-REF-001", category: "Referral", factor: "High-Value Referral Threshold", operator: "<=", baseValue: 40000, unit: "$", canOverride: true, guardrail: "<= $40,000", val: "$145,000", pass: false },
      { ruleId: "UW-LOAD-001", category: "Underwriting", factor: "Minor Conviction Loading", operator: "<=", baseValue: 0, unit: "Convictions", canOverride: true, guardrail: "0 Minor Convictions", val: "1 Minor", pass: false },
      { ruleId: "UW-RSTR-001", category: "Underwriting", factor: "Theft Cover Cap", operator: "<=", baseValue: 55000, unit: "$", canOverride: false, guardrail: "<= $55,000 Cap", val: "Active (Capped)", pass: false }
    ],
    enrichmentCards: [
      { title: "Dubai RTO & Police Clear", icon: "ph-shield-check", val: "Verified Clean", label: "TC-990142-DXB", tag: "badge-success" },
      { title: "High-Value Exotic Make", icon: "ph-diamond", val: "Specialist Review Required", label: "UW-REF-001 Triggered", tag: "badge-warning" }
    ],
    subjectivities: [
      "Senior Underwriter sign-off for theft cover limit increase above $55,000.",
      "Installation of certified GPS tracker & anti-theft immobilizer."
    ],
    losses: [
      { year: "2024 - 2025", desc: "No losses reported", status: "Clean", incurred: "$0" }
    ],
    quoteNo: "QT-PRD016-2026-99012",
    coverageRows: [
      { line: "COV-001 Own Damage (Agreed Value)", limit: "$145,000", ded: "$500", prem: "$870.00" },
      { line: "COV-004 Theft & Total Loss (Restricted Cap)", limit: "$55,000 (Capped)", ded: "10%", prem: "$145.00" },
      { line: "UW-LOAD-001 Conviction Loading", limit: "+25% Net Premium", ded: "N/A", prem: "$253.75" }
    ]
  }
];

// ----------------------------------------------------------------------------
// SUBMISSION ASSIGNMENT WORKFLOW — "No JSON → No Submission → No Assignment
// → No Underwriting." The Submission Intake queue is EMPTY until a product
// is ingested via the Integrating API module (or, for demo purposes, the
// seed dataset above is explicitly loaded). Every submission starts
// Unassigned; a manager-tier persona (Senior UW, CUO, Head of Binding Ops,
// or Admin) must assign it to a working underwriter before that underwriter
// can see it in their queue or open its workflow.
// ----------------------------------------------------------------------------
const ASSIGNMENT_MANAGER_ROLES = ["senior_uw", "senior", "binder", "admin"];
const ASSIGNABLE_WORKER_ROLES = ["assistant", "junior", "senior_uw"];

function canManageAssignments() {
  return ASSIGNMENT_MANAGER_ROLES.includes(currentUserRole);
}

// Seed data starts pre-assigned round-robin across the two primary
// underwriter desks so the queue-filtering/assignment demo has realistic
// variety the moment seed data is loaded — without hand-editing all 14
// hardcoded submissions above.
(function seedDemoAssignments() {
  const rotation = ["junior", "senior_uw"];
  SEED_SUBMISSIONS_DATASET.forEach((sub, idx) => {
    if (idx % 3 === 2) {
      // Every 3rd seed submission stays Unassigned so the manager's
      // "needs assignment" view has something to act on immediately.
      sub.assignedTo = null;
      sub.assignedBy = null;
      sub.assignedAt = null;
    } else {
      sub.assignedTo = rotation[idx % rotation.length];
      sub.assignedBy = "Marcus Vance (CUO)";
      sub.assignedAt = "2026-08-25 08:30";
    }
  });
})();

// The LIVE queue starts empty — nothing is created until a product is
// ingested through the Integrating API module. Use loadSeedDemoData() to
// explicitly opt into the pre-built demo dataset instead.
var SUBMISSIONS_DATASET = [];

// Sidebar badge counts must reflect ONLY data ingested through the
// Integrating API (submissions/quotes/declines flagged apiSourced: true) —
// never the hardcoded seed/demo dataset or golden-path sample data. When no
// API data has been ingested yet, badges show 0.
function updateSidebarApiCounts() {
  const intakeBadge = document.getElementById("sidebarIntakeCount");
  if (intakeBadge) {
    intakeBadge.textContent = (typeof SUBMISSIONS_DATASET !== "undefined")
      ? SUBMISSIONS_DATASET.filter(s => s.apiSourced).length
      : 0;
  }

  const declineBadge = document.getElementById("sidebarDeclineCount");
  if (declineBadge) {
    declineBadge.textContent = (typeof DECLINE_LOG !== "undefined")
      ? DECLINE_LOG.filter(e => e.apiSourced).length
      : 0;
  }

  const versionsBadge = document.getElementById("sidebarVersionsCount");
  if (versionsBadge) {
    versionsBadge.textContent = (typeof QUOTE_VERSIONS_DATASET !== "undefined")
      ? QUOTE_VERSIONS_DATASET.filter(v => v.apiSourced).reduce((n, v) => n + v.quotes.length, 0)
      : 0;
  }
}
window.updateSidebarApiCounts = updateSidebarApiCounts;

function loadSeedDemoData() {
  SUBMISSIONS_DATASET = SEED_SUBMISSIONS_DATASET.map(s => Object.assign({}, s));
  window.SUBMISSIONS_DATASET = SUBMISSIONS_DATASET;
  activeSubmissionId = SUBMISSIONS_DATASET[0] ? SUBMISSIONS_DATASET[0].id : null;
  showToast("📂 Loaded demo submissions (pre-assigned across the underwriting desk).", "info");
  showIntakePage();
  if (typeof filterSubmissionsTable === "function") filterSubmissionsTable("all");
  if (activeSubmissionId && typeof selectSubmission === "function") selectSubmission(activeSubmissionId, false);
  if (typeof persistAppState === "function") persistAppState();
}
window.loadSeedDemoData = loadSeedDemoData;

// Screen & Workflow Steps Configuration (7 Workflow Steps: Doc Ingestion -> Quote & Bind)
const WORKFLOW_STEPS = [
  { step: 1, id: "screen-2", title: "Doc Ingestion & Schema / OCR", shortTitle: "Doc Ingestion", icon: "ph-receipt" },
  { step: 2, id: "screen-3", title: "FEIN & Appetite Clearance", shortTitle: "Clearance Check", icon: "ph-shield-check" },
  { step: 3, id: "screen-4", title: "Enrichment & Smart Routing", shortTitle: "Data Enrichment", icon: "ph-tree-structure" },
  { step: 4, id: "screen-5", title: "Underwriting Workbench", shortTitle: "UW Workbench", icon: "ph-briefcase" },
  { step: 5, id: "screen-6", title: "Authority & Referral Desk", shortTitle: "Authority Desk", icon: "ph-scales" },
  { step: 6, id: "screen-7", title: "LOB Rating & Pricing Engine", shortTitle: "Rating Engine", icon: "ph-calculator" },
  { step: 7, id: "screen-8", title: "Formal Quote & Policy Binding", shortTitle: "Quote & Bind", icon: "ph-signature" }
];

const SCREEN_ORDER = [
  { id: "screen-1", num: 1, title: "Intake & Submissions Hub", shortTitle: "Intake Hub", phase: "Phase 1", phaseGroup: "phaseGroup1", icon: "ph-tray" },
  ...WORKFLOW_STEPS.map(w => ({ id: w.id, num: w.step + 1, title: w.title, shortTitle: w.shortTitle, phase: "Workflow", phaseGroup: "workflow", icon: w.icon })),
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
let currentUserRole = "junior"; // 'assistant' | 'junior' | 'senior_uw' | 'senior' | 'binder' | 'auditor'
let modalCurrentInspectingStep = 1;
let modalActiveTab = "stepView"; // 'stepView' | 'envelope'

const USER_ROLES_CONFIG = {
  assistant: {
    name: "Emily Watson",
    title: "Intake & Clearance Assistant (UA)",
    limit: 0,
    limitText: "$0 Authority (Clearance & Triage Only)",
    icon: "📋",
    description: "Clearance, document ingestion and initial data verification persona."
  },
  junior: {
    name: "Sarah Jenkins",
    title: "Junior Underwriter (Level 2 Primary Desk)",
    limit: 2000000,
    limitText: "$2,000,000 Level-2 Junior Authority",
    icon: "👨‍💼",
    description: "Standard commercial underwriting accounts under $2.0M exposure."
  },
  senior_uw: {
    name: "David Chen",
    title: "Senior Commercial Underwriter (Level 3 Line Desk)",
    limit: 10000000,
    limitText: "$10,000,000 Senior Line Authority",
    icon: "👩‍💼",
    description: "Complex fleet and multi-location property risks up to $10.0M."
  },
  senior: {
    name: "Marcus Vance",
    title: "Chief Underwriting Officer (CUO / Referral Desk)",
    limit: 25000000,
    limitText: "$25,000,000 Executive CUO Limit",
    icon: "👔",
    description: "Executive referrals, treaty exceptions and sign-off authority."
  },
  binder: {
    name: "Elena Rostova",
    title: "Head of Binding & Policy Operations",
    limit: 50000000,
    limitText: "$50,000,000 Enterprise Binding Limit",
    icon: "⚡",
    description: "Formal binder approval, policy issuance and operational execution."
  },
  auditor: {
    name: "Jonathan Reed",
    title: "Risk & Compliance Auditor",
    limit: 999999999,
    limitText: "Read-Only Audit & Compliance Authority",
    icon: "🛡️",
    description: "Sanctions checking, loss run audits and regulatory compliance inspection."
  },
  admin: {
    name: "Priya Nair",
    title: "System Administrator",
    limit: 999999999,
    limitText: "Full System Administration Authority",
    icon: "🛠️",
    description: "Manages team-wide process visibility and configures role-based permissions across the platform."
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
  { key: "auditLog", label: "Audit Log (Compliance View)" }
];
const RBAC_ACTIONS = ["view", "edit", "approve", "override", "archive"];

function defaultPermissionsMatrix() {
  const all = (v, e, a, o, ar) => ({ view: v, edit: e, approve: a, override: o, archive: ar });
  return {
    assistant: {
      documents: all(true, false, false, false, false),
      submissionData: all(true, false, false, false, false),
      workflow: all(true, false, false, false, false),
      archival: all(true, false, false, false, false),
      reviewRules: all(true, false, false, false, false),
      appetiteRules: all(true, false, false, false, false),
      premiumAdjustment: all(true, false, false, false, false),
      teamActivity: all(false, false, false, false, false),
      unifiedAccount: all(false, false, false, false, false),
      auditLog: all(false, false, false, false, false)
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
      auditLog: all(false, false, false, false, false)
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
      auditLog: all(false, false, false, false, false)
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
      auditLog: all(true, false, false, false, false)
    },
    binder: {
      documents: all(true, true, true, true, true),
      submissionData: all(true, true, true, true, true),
      workflow: all(true, true, true, true, false),
      archival: all(true, true, true, true, true),
      reviewRules: all(true, true, false, false, false),
      appetiteRules: all(true, false, false, true, false),
      premiumAdjustment: all(true, true, true, true, false),
      teamActivity: all(false, false, false, false, false),
      unifiedAccount: all(true, false, false, false, false),
      auditLog: all(true, false, false, false, false)
    },
    auditor: {
      documents: all(true, false, false, false, false),
      submissionData: all(true, false, false, false, false),
      workflow: all(true, false, false, false, false),
      archival: all(true, false, false, false, false),
      reviewRules: all(true, false, false, false, false),
      appetiteRules: all(true, false, false, false, false),
      premiumAdjustment: all(true, false, false, false, false),
      teamActivity: all(false, false, false, false, false),
      unifiedAccount: all(true, false, false, false, false),
      auditLog: all(true, false, false, false, false)
    },
    admin: {
      documents: all(true, true, true, true, true),
      submissionData: all(true, true, true, true, true),
      workflow: all(true, true, true, true, true),
      archival: all(true, true, true, true, true),
      reviewRules: all(true, true, true, true, true),
      appetiteRules: all(true, true, true, true, true),
      premiumAdjustment: all(true, true, true, true, true),
      teamActivity: all(true, true, true, true, true),
      unifiedAccount: all(true, true, true, true, true),
      auditLog: all(true, true, true, true, true)
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
function getSubmissionPremium(sub) {
  if (typeof sub.currentPremium === "number") return sub.currentPremium;
  const base = Math.round((sub.exposureVal || 0) * 0.045 / 100) * 100;
  return Math.max(base, 500);
}

function getSubmissionTrustScore(sub) {
  if (typeof sub.trustScore === "number") return sub.trustScore;
  // Deterministic pseudo-score derived from submission id so it's stable.
  let hash = 0;
  for (let i = 0; i < sub.id.length; i++) hash = (hash * 31 + sub.id.charCodeAt(i)) >>> 0;
  const score = 55 + (hash % 41); // 55–95 range
  sub.trustScore = score;
  return score;
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
var DISCRETIONARY_TAX_RATE_PCT = 3.2;    // fixed taxes & fees applied last

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
      const num = parseFloat(String(row.prem || "").replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) { total += num; found = true; }
    });
  }

  return found ? Math.round(total) : getSubmissionPremium(sub);
}

function ensureDiscretionaryPricingSeed(sub) {
  if (!sub.discretionaryPricing) {
    const baseFromPayload = getBasePremiumFromRatingPayload(sub);
    sub.discretionaryPricing = {
      basePremium: baseFromPayload,
      adjustmentType: null,   // 'credit' | 'debit' | null
      adjustmentPercent: 0,
      reason: null,
      appliedBy: null,
      appliedAt: null,
      finalPremium: baseFromPayload
    };
  }
  return sub.discretionaryPricing;
}

function computeFinalQuotedPremium(basePremium, adjustmentType, adjustmentPercent) {
  const signedPct = adjustmentType === "credit" ? -Math.abs(adjustmentPercent) : Math.abs(adjustmentPercent);
  const afterAdjustment = basePremium * (1 + signedPct / 100);
  const afterTax = afterAdjustment * (1 + DISCRETIONARY_TAX_RATE_PCT / 100);
  return Math.round(afterTax);
}

function renderDiscretionaryPricingCard(sub) {
  const dp = ensureDiscretionaryPricingSeed(sub);
  const basePremium = dp.basePremium;
  const hasApplied = !!dp.adjustmentType;

  const previewFinal = hasApplied
    ? dp.finalPremium
    : computeFinalQuotedPremium(basePremium, null, 0);

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
            <tr>
              <td><strong>3. Taxes & Fees</strong><br><span class="text-xs text-muted">Applied on top of adjusted premium</span></td>
              <td class="font-mono text-right">+${DISCRETIONARY_TAX_RATE_PCT}%</td>
            </tr>
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
  const trustScore = getSubmissionTrustScore(sub);

  body.innerHTML = `
    <div style="font-size:13px; margin-bottom:10px;">
      <strong>Submission:</strong> <code>${sub.id}</code> — ${sub.insured || "N/A"}
    </div>
    <div class="alert alert-info mb-3 u-fs-12-5">
      <i class="ph ph-info"></i> Base Premium: <strong>$${dp.basePremium.toLocaleString()}</strong> • Trust/Risk Score: <strong>${trustScore}/100</strong>. Review safety scores, loss history and overall risk profile before deciding.
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

  const finalPremium = computeFinalQuotedPremium(dp.basePremium, type, pct);
  previewArea.innerHTML = `
    <div class="alert ${type === 'credit' ? 'alert-success' : 'alert-warning'} u-fs-12-5">
      <i class="ph ph-calculator"></i> Base $${dp.basePremium.toLocaleString()} ${type === 'credit' ? '−' : '+'} ${pct}% ${type} + ${DISCRETIONARY_TAX_RATE_PCT}% taxes = <strong>Final Quoted Premium: $${finalPremium.toLocaleString()}</strong>
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
  const finalPremium = computeFinalQuotedPremium(dp.basePremium, type, pct);

  dp.adjustmentType = type;
  dp.adjustmentPercent = pct;
  dp.reason = reason;
  dp.appliedBy = `${roleConfig.name} (${roleConfig.title})`;
  dp.appliedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  dp.finalPremium = finalPremium;

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
