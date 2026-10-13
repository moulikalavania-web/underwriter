/**
 * ============================================================================
 * INTAKE QUESTIONNAIRE FROM THE INGESTED PRODUCT
 * ----------------------------------------------------------------------------
 * The questions come from the ingested product (what to ask); the answers come only from the case itself, and a question the
 * case cannot answer reads "Not Provided". Used when Document Ingestion is confirmed (email-intake-ingestion.js) and when the
 * Underwriting Workbench opens (case-documents-downstream.js).
 * ============================================================================
 */
// Builds sub.questionnaireGroups directly from whatever questionnaire data
// the ingested product JSON actually contains — every question it defines
// is shown, nothing invented. Two possible shapes are supported (Product
// Studio uses both across different exports):
//   1. schemaObj.questionnaire: [{ label, questions: [{ label, type, required }] }]
//   2. schemaObj.riskAttributes: [{ name, category, options, description, required }]
// This panel is part of the Underwriting Workbench, so an item explicitly
// tagged for another department (department/gate/team/audience field not
// matching "Underwriting") is dropped — see isUnderwriterOwned() below.
// If neither shape exists, sub.questionnaireGroups is left unset and the
// Workbench falls back to its static default questions.
function mapQuestionnaireFromProduct(schemaObj, sub) {
  if (!schemaObj || !sub) return;
  var studiosObj = schemaObj.studios || {};
  var qGroups = studiosObj.questionnaire || schemaObj.questionnaire || schemaObj.questionGroups || [];
  var riskAttrs = studiosObj.riskAttributes || schemaObj.riskAttributes || [];

  // Best-effort answer lookup from the actual submission data — reuses the
  // same fields the rest of the Workbench already displays. Returns null
  // (shown as "Not Provided") when nothing on the submission matches.
  function findAnswer(label) {
    var t = (label || "").toLowerCase();
    var vehicles = sub.vehicles || [];
    var drivers = sub.drivers || [];
    if (t.indexOf("radius") !== -1) {
      return (sub.radiusOfOperationsInfo && sub.radiusOfOperationsInfo.radius !== undefined)
        ? `${sub.radiusOfOperationsInfo.radius} Miles (${sub.radiusOfOperationsInfo.Intrastate_interstate || 'N/A'})` : null;
    }
    if (t.indexOf("fleet size") !== -1 || t.indexOf("power unit") !== -1) {
      return vehicles.length ? `${vehicles.length} Power Units` : null;
    }
    if (t.indexOf("vehicle type") !== -1) {
      return vehicles.length ? vehicles.map(function (v) { return v.vehicle_type; }).filter(Boolean).join(", ") || null : null;
    }
    if (t.indexOf("make") !== -1 && t.indexOf("model") !== -1) {
      return vehicles.length ? vehicles.map(function (v) { return `${v.make || ''} ${v.model || ''}`.trim(); }).filter(Boolean).join("; ") || null : null;
    }
    if (t.indexOf("year") !== -1 && t.indexOf("manufactur") !== -1) {
      return vehicles.length ? vehicles.map(function (v) { return v.year; }).filter(Boolean).join(", ") || null : null;
    }
    if (t.indexOf("insured value") !== -1 || t.indexOf("stated value") !== -1) {
      var total = vehicles.reduce(function (s, v) { return s + (v.stated_value || 0); }, 0);
      return total ? `$${total.toLocaleString()} Total Stated Value` : null;
    }
    if (t.indexOf("cargo") !== -1 || t.indexOf("hazmat") !== -1) {
      return (sub.commoditiesInfo && sub.commoditiesInfo.secondary_class) || null;
    }
    if (t.indexOf("driver") !== -1 && (t.indexOf("experience") !== -1 || t.indexOf("licen") !== -1)) {
      return drivers.length ? drivers.map(function (d) { return d.experience; }).filter(Boolean).join(", ") || null : null;
    }
    if (t.indexOf("business type") !== -1 || t.indexOf("operation") !== -1) {
      return sub.channelType ? (sub.channelType === "broker" ? "Broker-Placed Business" : "Direct Business") : null;
    }
    if (t.indexOf("claim") !== -1 || t.indexOf("loss") !== -1) {
      var losses = sub.losses || [];
      return losses.length ? `${losses.filter(function (l) { return l.status !== "Clean"; }).length} Closed Claim(s)` : null;
    }
    return null;
  }

  // This panel lives on the Underwriting Workbench, so only questions/risk
  // attributes owned by Underwriting belong here — items explicitly tagged
  // for another department (Actuarial, Compliance, Ops/Tech, Product, etc.,
  // matching the same department vocabulary used by the product's
  // governance gates) must not show up in the underwriter's own review.
  // An item with no department/owner/gate tag at all is assumed to be
  // underwriting-relevant (that's the only data this schema currently
  // provides) — nothing is invented, only filtered.
  function isUnderwriterOwned(item) {
    var tag = item.department || item.gate || item.team || item.audience || item.owner_department;
    if (!tag) return true;
    return /underwrit/i.test(String(tag));
  }

  var groups = [];

  if (qGroups.length) {
    qGroups.forEach(function (g) {
      if (!isUnderwriterOwned(g)) return;
      var items = (g.questions || []).filter(isUnderwriterOwned).map(function (q) {
        return { q: q.label || q.name || "Question", a: findAnswer(q.label || q.name) };
      });
      if (items.length) {
        groups.push({ title: g.label || g.name || "Questionnaire Group", items: items });
      }
    });
  }

  if (riskAttrs.length) {
    var byCategory = {};
    riskAttrs.forEach(function (attr) {
      if (!isUnderwriterOwned(attr)) return;
      var cat = attr.category || "Risk Attributes";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ q: attr.name || attr.code || "Attribute", a: findAnswer(attr.name) });
    });
    Object.keys(byCategory).forEach(function (cat) {
      groups.push({ title: cat, items: byCategory[cat] });
    });
  }

  if (groups.length) {
    sub.questionnaireGroups = groups;
  }
}
window.mapQuestionnaireFromProduct = mapQuestionnaireFromProduct;
