/**
 * ============================================================================
 * GUARD REGISTRY
 * ----------------------------------------------------------------------------
 * Three actions are the gates of a quote: opening the e-signature step, issuing the quote, and the bind to the policy admin system.
 * Each module that has a rule about them (sanctions, producer licence, TRIA, adverse-action notices, surplus lines, authority,
 * subjectivities, broker of record) used to wrap the function itself, so a call passed through up to seven nested wrappers whose
 * order depended on the order the scripts were loaded and could not be seen anywhere.
 *
 * Now each module registers a guard here, and the action is wrapped once:
 *
 *   registerGuard(action, name, check)      check(args) returns true to go on, or false after showing its own message
 *   registerAfter(action, name, hook)       runs after the action has completed
 *   listGuards(action)                      the guards in the order they run
 *
 * Guards run newest-registered first (the order the nested wrappers ran in, so every message and every outcome is unchanged) and the
 * first one to refuse stops the action. Actions: "eSign" (openESignatureModal), "issueQuote" (issueQuoteAction),
 * "bind" (simulatePASBindSync).
 * ============================================================================
 */

var GUARD_REGISTRY = {
  eSign: { fn: "openESignatureModal", guards: [], after: [], installed: false },
  issueQuote: { fn: "issueQuoteAction", guards: [], after: [], installed: false },
  bind: { fn: "simulatePASBindSync", guards: [], after: [], installed: false }
};

/** Wraps window[fn] once. The function must already exist when the first guard is registered. */
function installGuardedAction(action) {
  const entry = GUARD_REGISTRY[action];
  if (!entry || entry.installed) return;
  const original = window[entry.fn];
  if (typeof original !== "function") return;
  entry.installed = true;
  window[entry.fn] = function () {
    const args = arguments;
    const guards = entry.guards.slice().reverse();
    for (let i = 0; i < guards.length; i++) {
      if (guards[i].check(args) === false) return undefined;
    }
    const result = original.apply(this, args);
    entry.after.forEach(a => { try { a.hook(args, result); } catch (e) { console.warn("After-hook failed:", action, a.name, e); } });
    return result;
  };
}

function registerGuard(action, name, check) {
  if (!GUARD_REGISTRY[action]) throw new Error("Unknown guarded action: " + action);
  GUARD_REGISTRY[action].guards.push({ name: name, check: check });
  installGuardedAction(action);
}

function registerAfter(action, name, hook) {
  if (!GUARD_REGISTRY[action]) throw new Error("Unknown guarded action: " + action);
  GUARD_REGISTRY[action].after.push({ name: name, hook: hook });
  installGuardedAction(action);
}

/** The names of the guards on an action, in the order they run. */
function listGuards(action) {
  return GUARD_REGISTRY[action] ? GUARD_REGISTRY[action].guards.map(g => g.name).reverse() : [];
}

window.registerGuard = registerGuard; window.registerAfter = registerAfter; window.listGuards = listGuards;
