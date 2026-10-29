/**
 * ============================================================================
 * ACORD FORMS: READ THEM, AND PREFILL THEM
 * ----------------------------------------------------------------------------
 * READ (Step 3). A document recognised as an ACORD 125 (commercial application), 126 (general liability section),
 * 127 (business auto section) or 140 (property section) is read field by field. A field is found two ways, both from
 * the document's text: "LABEL: value" on one line, or the label alone on a line with the value on the next. A field
 * the form does not carry is listed as not on the form; nothing is guessed. The values found fill the case fields that
 * are still empty (named insured, FEIN, address, contact, effective and expiration dates) and, where two documents
 * disagree, the disagreement is listed under conflicts. Premises on an ACORD 140 become the statement of values.
 *
 * PREFILL (Step 4 on, and the Decision Brief). The same forms, filled from the case, as a printable page. Each field
 * is marked Filled (with where it came from) or Confirm (the case does not have it, and who to ask). A carrier
 * supplement for trucking is built the same way from the operations profile.
 *
 * Limits: this reads text. A scanned form needs an OCR service, and a fillable PDF whose field values are not in its text
 * layer cannot be read here. The field labels are the ones printed on the standard ACORD forms; a carrier's own variant
 * of a form may use other words, and then its fields are listed as not found.
 * ============================================================================
 */

function acOps(s) { return s.operationsProfile || {}; }
function acHas(v) { return !(v === undefined || v === null || v === "" || (typeof wsIsPlaceholder === "function" && wsIsPlaceholder(v))); }
function acMoney(v) { const n = typeof v === "number" ? v : anMoney(v); return n === null || n === undefined ? "" : "$" + Math.round(n).toLocaleString("en-US"); }
function acCover(s, re) { const r = (s.coverageRows || []).find(c => re.test(String(c.line || ""))); return r ? r : null; }
function acLimit(s, re) { const r = acCover(s, re); return r ? r.limit : ""; }

/** Fields of each form. read: label patterns as printed; std: the case field a value fills when it is empty; get: the case's own value for the prefill. */
const ACORD_FORMS = {
  "125": {
    title: "ACORD 125, Commercial Insurance Application", detect: "acord125",
    sections: [
      { title: "Producer and applicant", fields: [
        { key: "agency", label: "Agency / producer", read: ["AGENCY NAME", "AGENCY", "PRODUCER"], std: "broker", get: s => s.broker, ask: "Broker" },
        { key: "applicant", label: "Applicant (first named insured)", read: ["NAME \\(FIRST NAMED INSURED\\)", "FIRST NAMED INSURED", "APPLICANT NAME", "APPLICANT", "NAMED INSURED"], std: "insured", get: s => s.insured, ask: "Broker" },
        { key: "address", label: "Mailing address", read: ["MAILING ADDRESS", "ADDRESS"], std: "address", get: s => s.address, ask: "Broker" },
        { key: "fein", label: "FEIN", read: ["FEIN(?: OR SOC SEC #?)?", "TAX ID"], std: "fein", get: s => s.fein, ask: "Insured (IRS letter)" },
        { key: "naics", label: "NAICS code", read: ["NAICS(?: CODE)?"], get: s => acOps(s).naics, ask: "Broker" },
        { key: "sic", label: "SIC code", read: ["SIC(?: CODE)?"], get: s => acOps(s).sic, ask: "Broker" },
        { key: "phone", label: "Business phone", read: ["BUSINESS PHONE", "PHONE"], get: s => acOps(s).phone, ask: "Broker" },
        { key: "email", label: "E-mail", read: ["E-?MAIL(?: ADDRESS)?", "CONTACT EMAIL"], std: "email", get: s => s.email, ask: "Broker" },
        { key: "entity", label: "Entity type", read: ["ENTITY TYPE", "TYPE OF ENTITY", "BUSINESS TYPE"], get: s => acOps(s).business_type, ask: "Insured" },
        { key: "years", label: "Years in business", read: ["YEARS IN BUSINESS", "YEARS IN OPERATION"], get: s => acOps(s).years_in_business, ask: "Insured" }
      ] },
      { title: "Policy", fields: [
        { key: "effective", label: "Proposed effective date", read: ["PROPOSED EFF(?:ECTIVE)? DATE", "EFFECTIVE DATE", "EFF DATE"], std: "effectiveDate", get: s => s.effectiveDate, ask: "Broker" },
        { key: "expiration", label: "Proposed expiration date", read: ["PROPOSED EXP(?:IRATION)? DATE", "EXPIRATION DATE", "EXP DATE"], std: "expirationDate", get: s => s.expirationDate, ask: "Broker" },
        { key: "limit", label: "Requested limit", read: ["REQUESTED LIMIT", "LIMIT REQUESTED"], std: "exposureVal", get: s => s.exposureVal ? acMoney(s.exposureVal) : "", ask: "Broker" }
      ] },
      { title: "Operations, prior coverage and losses", fields: [
        { key: "operations", label: "Description of operations", read: ["DESCRIPTION OF (?:PRIMARY )?OPERATIONS", "NATURE OF BUSINESS"], get: s => acOps(s).commodities_hauled ? "Hauls " + acOps(s).commodities_hauled : "", ask: "Insured" },
        { key: "priorCarrier", label: "Prior carrier", read: ["PRIOR CARRIER", "CURRENT CARRIER", "EXPIRING CARRIER"], get: s => s.priorCarrier, ask: "Broker (loss run names it)" },
        { key: "losses", label: "Losses in the last 3 years", read: ["NUMBER OF LOSSES", "LOSSES IN (?:THE )?LAST \\d+ YEARS"], get: s => (s.losses && s.losses.length) ? (typeof analyzeLossRuns === "function" ? analyzeLossRuns(s).claims + " claim(s), " + acMoney(analyzeLossRuns(s).incurred) + " incurred" : s.losses.length + " row(s)") : "", ask: "Broker (loss runs)" }
      ] }
    ]
  },
  "126": {
    title: "ACORD 126, Commercial General Liability Section", detect: "acord126",
    sections: [
      { title: "Limits", fields: [
        { key: "occurrence", label: "Each occurrence", read: ["EACH OCCURRENCE"], get: s => acLimit(s, /general liab|liability/i), ask: "Broker" },
        { key: "aggregate", label: "General aggregate", read: ["GENERAL AGGREGATE"], get: s => "", ask: "Broker" },
        { key: "products", label: "Products and completed operations aggregate", read: ["PRODUCTS(?: AND | & |-)COMPLETED OPERATIONS AGGREGATE", "PRODUCTS-COMP/OP AGG"], get: s => "", ask: "Broker" },
        { key: "personal", label: "Personal and advertising injury", read: ["PERSONAL (?:AND|&) ADVERTISING INJURY"], get: s => "", ask: "Broker" },
        { key: "rented", label: "Damage to rented premises", read: ["DAMAGE TO RENTED PREMISES"], get: s => "", ask: "Broker" },
        { key: "medical", label: "Medical expense", read: ["MEDICAL EXPENSE"], get: s => "", ask: "Broker" }
      ] },
      { title: "Coverage basis and exposure", fields: [
        { key: "basis", label: "Occurrence or claims-made", read: ["COVERAGE BASIS", "OCCURRENCE OR CLAIMS[- ]MADE", "CLAIMS[- ]MADE"], get: s => "", ask: "Broker" },
        { key: "retro", label: "Retroactive date", read: ["RETROACTIVE DATE", "RETRO DATE"], get: s => "", ask: "Broker" },
        { key: "hazard", label: "Hazard classification code", read: ["HAZARD CLASSIFICATION(?: CODE)?", "CLASS CODE"], get: s => "", ask: "Broker" },
        { key: "exposure", label: "Exposure basis and amount", read: ["EXPOSURE(?: BASIS)?", "PAYROLL", "ANNUAL SALES"], get: s => acOps(s).annual_revenue ? "Revenue " + acMoney(acOps(s).annual_revenue) : "", ask: "Insured" }
      ] }
    ]
  },
  "127": {
    title: "ACORD 127, Business Auto Section", detect: "acord127",
    sections: [
      { title: "Carrier and fleet", fields: [
        { key: "dot", label: "USDOT number", read: ["US ?DOT(?: NUMBER| NO\\.?)?", "DOT NUMBER"], std: "dot", get: s => s.dot, ask: "Insured" },
        { key: "mc", label: "MC number", read: ["MC(?: NUMBER| NO\\.?| #)?", "DOCKET"], std: "mcNumber", get: s => s.mcNumber, ask: "Insured" },
        { key: "units", label: "Number of power units", read: ["NUMBER OF (?:POWER )?UNITS", "POWER UNITS", "NUMBER OF VEHICLES"], get: s => (s.vehicles || []).length || "", ask: "Broker (vehicle schedule)" },
        { key: "drivers", label: "Number of drivers", read: ["NUMBER OF DRIVERS", "DRIVERS"], get: s => (s.drivers || []).length || "", ask: "Broker (driver list)" },
        { key: "radius", label: "Radius of operations (miles)", read: ["RADIUS(?: OF OPERATIONS)?"], get: s => acOps(s).operating_radius, ask: "Insured" },
        { key: "states", label: "States operated", read: ["STATES OPERATED", "STATES OF OPERATION"], get: s => (acOps(s).states_operated || []).join ? (acOps(s).states_operated || []).join(", ") : acOps(s).states_operated, ask: "Insured (IFTA report)" },
        { key: "hazmat", label: "Hazardous materials hauled", read: ["HAZ(?:ARDOUS)? ?MAT(?:ERIALS?)?(?: OPERATIONS)?"], get: s => acOps(s).hazmat_operations, ask: "Insured" },
        { key: "forhire", label: "For-hire or private carrier", read: ["FOR-?HIRE(?: / PRIVATE CARRIER)?"], get: s => acOps(s).for_hire_private_carrier, ask: "Insured" }
      ] },
      { title: "Liability", fields: [
        { key: "liability", label: "Liability limit", read: ["LIABILITY LIMIT", "COMBINED SINGLE LIMIT", "CSL"], get: s => acLimit(s, /liab/i) || (s.exposureVal ? acMoney(s.exposureVal) : ""), ask: "Broker" }
      ] }
    ]
  },
  "140": {
    title: "ACORD 140, Property Section", detect: "acord140", premises: true,
    sections: [
      { title: "Premises", fields: [
        { key: "address", label: "Street address", read: ["STREET ADDRESS", "ADDRESS", "LOCATION ADDRESS"], get: s => "", ask: "Broker (SOV)" },
        { key: "construction", label: "Construction type", read: ["CONSTRUCTION(?: TYPE| CLASS)?"], get: s => "", ask: "Broker (SOV)" },
        { key: "yearBuilt", label: "Year built", read: ["YEAR BUILT", "YR BUILT"], get: s => "", ask: "Broker (SOV)" },
        { key: "stories", label: "Number of stories", read: ["(?:NUMBER OF |NO\\.? OF )?STORIES"], get: s => "", ask: "Broker (SOV)" },
        { key: "area", label: "Total area (sq ft)", read: ["TOTAL AREA", "SQ(?:UARE)? ?(?:FT|FEET)", "AREA"], get: s => "", ask: "Broker (SOV)" },
        { key: "sprinkler", label: "Sprinkler system", read: ["SPRINKLER(?:S|ED| SYSTEM)?(?: %)?"], get: s => "", ask: "Broker (SOV)" },
        { key: "building", label: "Building amount", read: ["BUILDING(?: AMOUNT| VALUE)?"], get: s => "", ask: "Broker (SOV)" },
        { key: "contents", label: "Contents (business personal property)", read: ["CONTENTS(?: AMOUNT| VALUE)?", "BUSINESS PERSONAL PROPERTY", "BPP"], get: s => "", ask: "Broker (SOV)" },
        { key: "bi", label: "Business income", read: ["BUSINESS INCOME", "RENTAL VALUE"], get: s => "", ask: "Broker (SOV)" },
        { key: "valuation", label: "Valuation", read: ["VALUATION"], get: s => "", ask: "Broker" },
        { key: "coinsurance", label: "Coinsurance", read: ["COINSURANCE"], get: s => "", ask: "Broker" },
        { key: "deductible", label: "Deductible", read: ["DEDUCTIBLE"], get: s => "", ask: "Broker" },
        { key: "cause", label: "Causes of loss", read: ["CAUSES? OF LOSS"], get: s => "", ask: "Broker" }
      ] }
    ]
  }
};

// ----------------------------------------------------------------------------
// 1. READ
// ----------------------------------------------------------------------------
function acEsc(s) { return typeof wsEsc === "function" ? wsEsc(s) : String(s === null || s === undefined ? "" : s); }

/** The value printed against a label: "LABEL: value" on one line, or the label alone on a line with the value under it. */
function acordFindValue(text, labels) {
  const body = String(text || "").replace(/\r/g, "");
  for (const lab of labels) {
    const same = new RegExp("(?:^|\\n)[ \\t]*(?:" + lab + ")(?:[^\\n:]{0,60})?[ \\t]*:[ \\t]*([^\\n]*\\S[^\\n]*)", "i").exec(body);
    if (same && same[1].trim()) return { value: same[1].trim().replace(/\s{2,}/g, " "), snippet: same[0].trim().slice(0, 120) };
    const below = new RegExp("(?:^|\\n)[ \\t]*(?:" + lab + ")(?:[^\\n:]{0,60})?[ \\t]*\\n[ \\t]*([^\\n:]{1,200}\\S)[ \\t]*(?=\\n|$)", "i").exec(body);
    if (below && below[1].trim()) return { value: below[1].trim().replace(/\s{2,}/g, " "), snippet: below[0].trim().replace(/\n/g, " ").slice(0, 120) };
  }
  return null;
}

/** Splits an ACORD 140 into one block per premises ("Premises 1", "Location #2", "Building 1"). */
function acordPremisesBlocks(text) {
  const body = String(text || "");
  const re = /(?:^|\n)[ \t]*(?:PREMISES|LOCATION|LOC|BLDG|BUILDING)[ \t]*(?:#|NO\.?|NUMBER)?[ \t]*(\d+)[ \t]*[:\-]?[ \t]*(?=\n|[A-Za-z0-9])/gi;
  const marks = []; let m;
  while ((m = re.exec(body)) !== null) marks.push({ at: m.index, no: m[1] });
  if (!marks.length) return [{ no: "1", text: body }];
  return marks.map((mk, i) => ({ no: mk.no, text: body.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : body.length) }));
}

/** Reads one form's fields from a document's text. Returns { form, title, found, missing, count, premises }. */
function acordRead(formId, text) {
  const def = ACORD_FORMS[formId];
  const fields = def.sections.reduce((a, s) => a.concat(s.fields), []);
  const readFields = (t) => {
    const found = {};
    fields.forEach(f => { const r = acordFindValue(t, f.read); if (r) found[f.key] = r; });
    return found;
  };
  if (def.premises) {
    const blocks = acordPremisesBlocks(text).map(b => ({ no: b.no, found: readFields(b.text) })).filter(b => Object.keys(b.found).length > 1);
    const found = blocks.length ? blocks[0].found : readFields(text);
    return { form: formId, title: def.title, found: found, premises: blocks, count: blocks.reduce((n, b) => n + Object.keys(b.found).length, 0) || Object.keys(found).length, missing: fields.filter(f => !found[f.key]).map(f => f.label) };
  }
  const found = readFields(text);
  return { form: formId, title: def.title, found: found, premises: null, count: Object.keys(found).length, missing: fields.filter(f => !found[f.key]).map(f => f.label) };
}

/** Every ACORD form among the sources, read; and what they add to the draft. */
function acordReadSources(sources, draft) {
  const forms = [];
  (sources || []).forEach(src => {
    const t = recognizeDocument(src.name, src.text);
    const id = Object.keys(ACORD_FORMS).find(k => ACORD_FORMS[k].detect === t.key);
    if (!id) return;
    const r = acordRead(id, src.text);
    r.document = src.name;
    forms.push(r);
  });
  if (!forms.length) return null;
  draft.fieldSources = draft.fieldSources || {}; draft.conflicts = draft.conflicts || []; draft.fields_confidence = draft.fields_confidence || {};
  const labels = typeof DI_FIELD_LABELS !== "undefined" ? DI_FIELD_LABELS : {};
  forms.forEach(f => {
    const def = ACORD_FORMS[f.form];
    def.sections.forEach(sec => sec.fields.forEach(fd => {
      const hit = f.found[fd.key];
      if (!hit || !fd.std) return;
      let v = hit.value;
      if (fd.std === "exposureVal") { const n = anMoney(v); if (n === null) return; v = n; }
      const cur = draft[fd.std];
      if (cur === null || cur === undefined || cur === "") {
        draft[fd.std] = v;
        draft.fieldSources[fd.std] = { document: f.document, method: "ACORD " + f.form + " field read", snippet: hit.snippet };
        draft.fields_confidence[fd.std] = "medium";
      } else if (typeof diNorm === "function" && diNorm(cur) !== diNorm(v)) {
        draft.conflicts.push({ field: fd.std, label: labels[fd.std] || fd.label, kept: { value: cur, document: (draft.fieldSources[fd.std] || {}).document || "earlier document" }, others: [{ value: v, document: f.document }] });
      }
    }));
  });
  // premises on an ACORD 140 become the statement of values when no SOV was found
  const f140 = forms.find(f => f.form === "140" && f.premises && f.premises.length);
  if (f140 && !draft.sov) {
    const rows = f140.premises.map(p => {
      const g = k => (p.found[k] ? p.found[k].value : "");
      const b = anMoney(g("building")), c = anMoney(g("contents")), bi = anMoney(g("bi"));
      return { loc: p.no, address: g("address"), building: b, contents: c, bi: bi, tiv: (b || 0) + (c || 0) + (bi || 0) || null, tivStated: false, construction: g("construction") || null, yearBuilt: (/\b(?:1[89]|20)\d{2}\b/.exec(g("yearBuilt")) || [null])[0], sprinkler: g("sprinkler") || null, sourceDocument: f140.document };
    }).filter(r => r.address);
    if (rows.length) draft.sov = { kind: "locations", rows: rows, docs: [f140.document] };
  }
  return { forms: forms.map(f => ({ form: f.form, title: f.title, document: f.document, count: f.count, missing: f.missing, found: Object.keys(f.found).reduce((o, k) => { o[k] = f.found[k].value; return o; }, {}), premises: f.premises ? f.premises.length : 0 })) };
}

(function acordWire() {
  const origCons = window.diConsolidate;
  if (typeof origCons === "function") {
    window.diConsolidate = function (sub, sources) {
      const draft = origCons.apply(this, arguments);
      try { draft.acord = acordReadSources(sources, draft); } catch (e) { console.warn("ACORD read failed:", e); draft.acord = null; }
      if (draft.conflicts && draft.conflicts.length) draft.needs_review = true;
      return draft;
    };
  }
  const origApply = window.applyNormalizedDataToSubmission;
  if (typeof origApply === "function") {
    window.applyNormalizedDataToSubmission = function (subId) {
      const draft = (typeof emailIngestionDraftBySubId !== "undefined") ? emailIngestionDraftBySubId[subId] : null;
      const r = origApply.apply(this, arguments);
      const sub = SUBMISSIONS_DATASET.find(s => s.id === subId);
      if (sub && draft && draft.acord) sub.acordRead = draft.acord;
      return r;
    };
  }
})();

function renderAcordRead(sub) {
  const box = document.getElementById("acordReadContainer");
  if (!box) return;
  const draft = sub && typeof emailIngestionDraftBySubId !== "undefined" ? emailIngestionDraftBySubId[sub.id] : null;
  const a = (draft && draft.acord) || (sub && sub.acordRead) || null;
  if (!sub) { box.innerHTML = ""; return; }
  const btn = `<button class="btn btn-outline btn-sm" onclick="openAcordPrefill('125')"><i class="ph ph-file-text"></i> Prefill ACORD forms from the case</button>`;
  if (!a || !a.forms.length) {
    box.innerHTML = `<div class="card"><div class="card-header"><h3><i class="ph ph-file-text"></i> ACORD forms</h3>${btn}</div><div class="card-body ws-small text-muted">No ACORD 125, 126, 127 or 140 was found among the documents. (A form is recognised by its file name or its title line.)</div></div>`;
    return;
  }
  box.innerHTML = `<div class="card"><div class="card-header"><h3><i class="ph ph-file-text"></i> ACORD forms read</h3>${btn}</div><div class="card-body">${a.forms.map(f => `
    <div style="margin-bottom:12px;"><strong>${acEsc(f.title)}</strong> <span class="ws-small text-muted">from ${acEsc(f.document)}: ${f.count} field(s) found${f.premises ? ", " + f.premises + " premises" : ""}</span>
    <table class="data-table"><tbody>${Object.keys(f.found).map(k => `<tr><td class="text-muted">${acEsc(acordFieldLabel(f.form, k))}</td><td>${acEsc(f.found[k])}</td></tr>`).join("")}</tbody></table>
    ${f.missing.length ? `<div class="ws-small text-muted">Not on the form: ${acEsc(f.missing.join(", "))}.</div>` : ""}</div>`).join("")}</div></div>`;
}
function acordFieldLabel(formId, key) {
  for (const s of ACORD_FORMS[formId].sections) { const f = s.fields.find(x => x.key === key); if (f) return f.label; }
  return key;
}
registerStepRenderer("acordRead", renderAcordRead);
// the read finishes after the page is first drawn: draw the card again then
(function acordPipelineWire() {
  const origPipe = window.diRenderPipelineCard;
  if (typeof origPipe === "function") {
    window.diRenderPipelineCard = function (sub) {
      const r = origPipe.apply(this, arguments);
      try { renderAcordRead(sub); } catch (e) { /* the card is optional */ }
      return r;
    };
  }
})();

// ----------------------------------------------------------------------------
// 2. PREFILL
// ----------------------------------------------------------------------------
const ACORD_SUPPLEMENT = {
  title: "Carrier supplement: trucking", sections: [
    { title: "Operations", fields: [
      { key: "mileage", label: "Annual mileage", get: s => acOps(s).annual_mileage ? Number(acOps(s).annual_mileage).toLocaleString("en-US") : "", ask: "Insured (IFTA report)" },
      { key: "radius", label: "Operating radius (miles)", get: s => acOps(s).operating_radius, ask: "Insured" },
      { key: "states", label: "States operated", get: s => Array.isArray(acOps(s).states_operated) ? acOps(s).states_operated.join(", ") : acOps(s).states_operated, ask: "Insured (IFTA report)" },
      { key: "garaging", label: "Primary garaging state", get: s => acOps(s).primary_garaging_state, ask: "Broker" },
      { key: "ownerop", label: "Owner-operator usage", get: s => acOps(s).owner_operator_usage, ask: "Insured" },
      { key: "brokerage", label: "Brokerage operations", get: s => acOps(s).brokerage_operations, ask: "Insured" },
      { key: "hazmat", label: "Hazmat operations", get: s => acOps(s).hazmat_operations, ask: "Insured" },
      { key: "cargo", label: "Commodities hauled", get: s => acOps(s).commodities_hauled, ask: "Insured" }
    ] },
    { title: "Fleet and drivers", fields: [
      { key: "units", label: "Power units on the schedule", get: s => (s.vehicles || []).length || "", ask: "Broker" },
      { key: "value", label: "Total stated value", get: s => { const v = typeof buildSov === "function" ? buildSov(s) : null; return v ? acMoney(analyzeSov(s, v).total) : ""; }, ask: "Broker" },
      { key: "dashcam", label: "Units with a dashcam", get: s => (s.vehicles || []).length ? (s.vehicles.filter(v => v.dashcam === true).length + " of " + s.vehicles.length) : "", ask: "Insured" },
      { key: "drivers", label: "Drivers on the list", get: s => (s.drivers || []).length || "", ask: "Broker" },
      { key: "mvr", label: "MVR review", get: s => s.mvrAnalysis ? (s.mvrAnalysis.drivers + " driver(s), " + s.mvrAnalysis.major + " major violation(s)") : "", ask: "Broker (MVRs)" }
    ] },
    { title: "Loss history", fields: [
      { key: "claims", label: "Claims, last 3 policy years", get: s => (s.losses && s.losses.length && typeof analyzeLossRuns === "function") ? analyzeLossRuns(s).claims : "", ask: "Broker (loss runs)" },
      { key: "incurred", label: "Total incurred", get: s => (s.losses && s.losses.length && typeof analyzeLossRuns === "function") ? acMoney(analyzeLossRuns(s).incurred) : "", ask: "Broker (loss runs)" }
    ] }
  ]
};

/** A form filled from the case. Returns { title, sections:[{title, rows:[{label,value,state,ask}]}], total, filled, confirm }. */
function acordPrefill(sub, formId) {
  const def = formId === "TRK" ? ACORD_SUPPLEMENT : ACORD_FORMS[formId];
  let total = 0, filled = 0;
  const sections = [];
  const premises = (formId === "140" && typeof buildSov === "function" && buildSov(sub) && buildSov(sub).kind === "locations") ? buildSov(sub).rows : null;
  const build = (fields, rowSov) => fields.map(f => {
    let v = f.get ? f.get(sub) : "";
    if (rowSov) { const map = { address: rowSov.address, construction: rowSov.construction, yearBuilt: rowSov.yearBuilt, sprinkler: rowSov.sprinkler, building: acMoney(rowSov.building), contents: acMoney(rowSov.contents), bi: acMoney(rowSov.bi) }; if (map[f.key] !== undefined) v = map[f.key]; }
    const has = acHas(v) && String(v).trim() !== "";
    total++; if (has) filled++;
    return { label: f.label, value: has ? String(v) : "", state: has ? "filled" : "confirm", ask: f.ask || "" };
  });
  if (premises && premises.length) {
    premises.forEach(p => def.sections.forEach(sec => sections.push({ title: "Premises " + p.loc, rows: build(sec.fields, p) })));
  } else {
    def.sections.forEach(sec => sections.push({ title: sec.title, rows: build(sec.fields, null) }));
  }
  return { title: def.title, sections: sections, total: total, filled: filled, confirm: total - filled };
}

function acordPrefillHtml(sub, formId) {
  const p = acordPrefill(sub, formId);
  return `<div class="ws-small text-muted" style="margin-bottom:6px;">${acEsc(sub.insured || "")} · ${acEsc(sub.id)} · ${p.filled} of ${p.total} fields filled from the case, <strong>${p.confirm} to confirm</strong>. Filled values come from the case record; a field marked Confirm is not on the case.</div>` +
    p.sections.map(s => `<h4 style="margin:10px 0 4px; font-size:12px;">${acEsc(s.title)}</h4><table class="data-table"><tbody>${s.rows.map(r => `<tr><td style="width:36%;" class="text-muted">${acEsc(r.label)}</td><td>${r.state === "filled" ? acEsc(r.value) : `<span style="background:#fef3c7; padding:1px 6px; border-radius:4px;">Confirm</span> <span class="ws-small text-muted">ask: ${acEsc(r.ask)}</span>`}</td></tr>`).join("")}</tbody></table>`).join("");
}

function openAcordPrefill(formId) {
  const sub = wsSub();
  if (!sub) { showToast("Open a case first.", "warning"); return; }
  let modal = document.getElementById("acordPrefillModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "acordPrefillModal"; modal.className = "modal-overlay";
    modal.style.cssText = "display:none; position:fixed; inset:0; background:rgba(15,23,42,.55); z-index:2000; align-items:center; justify-content:center;";
    modal.innerHTML = `<div style="background:#fff; border-radius:10px; width:min(860px,94vw); max-height:88vh; display:flex; flex-direction:column;">
      <div style="padding:12px 16px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;"><strong>ACORD forms, prefilled from the case</strong><span><button class="btn btn-outline btn-sm" onclick="printAcordPrefill()"><i class="ph ph-printer"></i> Print</button> <button class="btn btn-outline btn-sm" onclick="closeAcordPrefill()">Close</button></span></div>
      <div id="acordPrefillTabs" style="padding:8px 16px; display:flex; gap:6px; flex-wrap:wrap;"></div>
      <div id="acordPrefillBody" style="padding:4px 16px 16px; overflow:auto;"></div></div>`;
    document.body.appendChild(modal);
  }
  const lob = sub.lobKey || "trucking";
  const ids = ["125"].concat(lob === "property" ? ["140"] : lob === "trucking" ? ["127", "TRK"] : ["126"]);
  window.__acordForms = ids;
  modal.style.display = "flex";
  showAcordPrefillTab(ids.indexOf(formId) > -1 ? formId : ids[0]);
}
function showAcordPrefillTab(id) {
  const sub = wsSub(); if (!sub) return;
  const names = { "125": "ACORD 125", "126": "ACORD 126", "127": "ACORD 127", "140": "ACORD 140", "TRK": "Trucking supplement" };
  document.getElementById("acordPrefillTabs").innerHTML = (window.__acordForms || []).map(i => `<button class="btn ${i === id ? "btn-primary" : "btn-outline"} btn-sm" onclick="showAcordPrefillTab('${i}')">${names[i]}</button>`).join("");
  document.getElementById("acordPrefillBody").innerHTML = `<h3 style="margin:6px 0;">${acEsc((id === "TRK" ? ACORD_SUPPLEMENT : ACORD_FORMS[id]).title)}</h3>` + acordPrefillHtml(sub, id);
  window.__acordTab = id;
  if (!sub.acordPrefilled) sub.acordPrefilled = {};
  sub.acordPrefilled[id] = { at: wsNow(), by: wsActor() };
}
function closeAcordPrefill() { const m = document.getElementById("acordPrefillModal"); if (m) m.style.display = "none"; }
function printAcordPrefill() {
  const body = document.getElementById("acordPrefillBody"); if (!body) return;
  const w = window.open("", "_blank");
  if (!w) { showToast("The browser blocked the print window.", "warning"); return; }
  w.document.write("<html><head><title>ACORD prefill</title><style>body{font-family:Segoe UI,Arial,sans-serif;font-size:12px;padding:16px}table{border-collapse:collapse;width:100%}td{border:1px solid #cbd5e1;padding:4px 8px}h3,h4{margin:8px 0 4px}.ws-small{font-size:11px;color:#475569}</style></head><body>" + body.innerHTML + "</body></html>");
  w.document.close(); w.focus(); w.print();
}

window.acordRead = acordRead; window.acordFindValue = acordFindValue; window.acordPrefill = acordPrefill;
window.openAcordPrefill = openAcordPrefill; window.closeAcordPrefill = closeAcordPrefill; window.showAcordPrefillTab = showAcordPrefillTab; window.printAcordPrefill = printAcordPrefill;
window.renderAcordRead = renderAcordRead;
