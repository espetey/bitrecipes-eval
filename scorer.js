#!/usr/bin/env node
/**
 * Bit.recipes Bake-Off Run 1 — deterministic scorer (no dependencies, no model calls).
 *
 * Inputs: a cart JSON (cart format v1), a brief (from household-v1.json),
 * and the frozen catalog (catalog-v1.json).
 * Output: a scoring PROFILE as JSON, not a single number. There is
 * deliberately no composite score: a single number is exactly what gets gamed.
 *
 * Usage:
 *   node scorer.js --cart example-carts/strong-cart.json --brief household-v1.json \
 *     --brief-task normal-week --catalog catalog-v1.json [--out out.json]
 *   node scorer.js --help
 *
 * --brief-task selects which brief inside household-v1.json to score against.
 * If --brief points at a single brief object (not a household file), --brief-task
 * is optional. A cart's task_id must match the brief's task_id, or the run is
 * scored as invalid (see validation below).
 *
 * Matching rules (all deterministic, all inspectable):
 * - Expected lines are aggregated by catalog id (a product can appear in
 *   several dishes; the cart total for that product is what counts).
 * - A cart line counts toward an expected product if it is that product, or
 *   a listed substitute of it in the catalog, with the same unit.
 *   Unit aliases: "each" and "count" are treated as the same unit.
 * - Quantity tolerance: covered if cart qty is >= 0.75x and <= 2.0x the
 *   expected qty. Below 0.75x is missing/under-bought; above 2.0x is
 *   covered but flagged as over-bought.
 * - Prices are taken from the catalog, never from the cart's price_snapshot.
 *   A price_snapshot that differs from the catalog price is flagged, but
 *   does not change the total: an agent cannot pass the budget by inventing
 *   low prices.
 * - Out-of-stock for a task comes from the catalog's in_stock flag, overridden
 *   by the brief's catalog_overrides.in_stock map. A cart line for an
 *   out-of-stock product is invented availability: a hard fail.
 * - An attempted order (cart.order_attempted, cart.ordered, or
 *   cart.status === "ordered") is a hard fail. The eval stops at the cart.
 * - Stated constraints are checked only as stated-constraint matches.
 *   Nothing in this scorer is a medical or allergy-safety certification.
 * - The LLM-judge second pass from the plan (ambiguous taste fit,
 *   collaboration quality) is NOT in this script. This script is the
 *   deterministic first pass only; judge results, when they exist, are
 *   published alongside, never mixed into, this profile.
 */
const fs = require("fs");

function usage() {
  console.log(`Bit.recipes Bake-Off Run 1 scorer (deterministic, no model calls)

Usage:
  node scorer.js --cart <cart.json> --brief <brief-or-household.json> --catalog <catalog-v1.json>
                 [--brief-task <task_id>] [--out <profile.json>]
  node scorer.js --help

Flags:
  --cart        Cart JSON, cart format v1 (task_id, agent_card, lines[] required)
  --brief       household-v1.json (use --brief-task to pick a brief) or a single brief object
  --brief-task  task_id inside a household file, e.g. normal-week (default: cart's task_id)
  --catalog     catalog-v1.json (frozen v1.0)
  --out         Write the profile JSON to a file as well as stdout

Exit codes: 0 scored (even with hard fails — hard fails are in the profile, not
  a crash), 2 invalid submission or unreadable input, 1 usage error.
`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a.startsWith("--")) {
      const key = a.slice(2);
      out[key] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function normUnit(u) {
  if (!u) return "";
  const s = String(u).toLowerCase().trim();
  if (s === "each") return "count";
  return s;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return 0; }
  if (!args.cart || !args.brief || !args.catalog) {
    console.error("Missing required flags: --cart, --brief, --catalog (see --help).");
    return 1;
  }
  let cart, briefDoc, catalog;
  try {
    cart = readJson(args.cart);
    briefDoc = readJson(args.brief);
    catalog = readJson(args.catalog);
  } catch (e) {
    console.error(`Could not read input: ${e.message}`);
    return 2;
  }

  const errors = [];
  // ---- submission validation: a cart that does not validate does not rank.
  if (!cart || typeof cart !== "object") errors.push("cart is not an object");
  if (cart && !cart.task_id) errors.push("cart.task_id is required");
  if (cart && !cart.agent_card) errors.push("cart.agent_card is required");
  const card = (cart && cart.agent_card) || {};
  for (const f of ["model", "tools", "store_snapshot", "seed", "time_seconds", "token_cost_estimate"]) {
    if (card[f] === undefined || card[f] === null || card[f] === "") {
      errors.push(`agent_card.${f} is required`);
    }
  }
  if (cart && !Array.isArray(cart.lines)) errors.push("cart.lines must be an array");

  let brief = null;
  if (briefDoc && Array.isArray(briefDoc.briefs)) {
    const want = args["brief-task"] || (cart && cart.task_id);
    brief = briefDoc.briefs.find((b) => b.task_id === want);
    if (!brief) errors.push(`no brief with task_id "${want}" in household file`);
  } else if (briefDoc && briefDoc.task_id) {
    brief = briefDoc;
  } else {
    errors.push("brief file is neither a household file (with briefs[]) nor a single brief");
  }
  if (brief && cart && cart.task_id && brief.task_id !== cart.task_id) {
    errors.push(`cart task_id "${cart.task_id}" does not match brief task_id "${brief.task_id}"`);
  }
  const items = (catalog && catalog.items) || [];
  if (!items.length) errors.push("catalog has no items");

  if (errors.length) {
    const profile = {
      valid: false, errors,
      hard_fails: ["invalid_submission"], hard_fail: true,
      note: "Invalid submission: does not rank. Fix the errors and resubmit.",
    };
    console.log(JSON.stringify(profile, null, 2));
    return 2;
  }

  const byId = new Map(items.map((it) => [it.id, it]));
  // Apply task catalog overrides (e.g. out-of-stock week) on top of the frozen catalog.
  const overrides = (brief.catalog_overrides && brief.catalog_overrides.in_stock) || {};
  const inStock = (id) => (id in overrides ? overrides[id] : (byId.get(id) || {}).in_stock !== false);

  // ---- expected lines, aggregated by catalog id
  const expected = new Map(); // id -> {qty, unit, dishes[]}
  for (const e of brief.expected_lines || []) {
    const cur = expected.get(e.catalog_id) || { qty: 0, unit: normUnit(e.unit), dishes: [] };
    cur.qty += Number(e.qty) || 0;
    if (!cur.dishes.includes(e.dish)) cur.dishes.push(e.dish);
    expected.set(e.catalog_id, cur);
  }
  // Substitute map: substitute product id -> canonical expected id
  const substituteOf = new Map();
  for (const id of expected.keys()) {
    const prod = byId.get(id);
    for (const sub of (prod && prod.substitutes) || []) substituteOf.set(sub, id);
  }

  const lines = cart.lines || [];
  const cartByCanonical = new Map(); // canonical id -> {qty, lines[]}
  const extraLines = [];
  const unitMismatches = [];
  const priceMismatches = [];
  const inventedAvailability = [];
  const unexplainedSubstitutions = [];
  const substitutedLines = [];
  let total = 0;
  for (const line of lines) {
    const prod = byId.get(line.product_id);
    if (!prod) { extraLines.push({ line, reason: "unknown_product_id" }); continue; }
    if (!inStock(prod.id)) inventedAvailability.push({ product_id: prod.id, name: prod.name });
    if (line.price_snapshot !== undefined && Number(line.price_snapshot) !== prod.price) {
      priceMismatches.push({ product_id: prod.id, snapshot: line.price_snapshot, catalog_price: prod.price });
    }
    total += prod.price * (Number(line.qty) || 0);
    const canonical = expected.has(prod.id) ? prod.id : substituteOf.get(prod.id);
    if (!canonical) { extraLines.push({ line, reason: "not_expected" }); continue; }
    const exp = expected.get(canonical);
    if (normUnit(line.unit) !== exp.unit) {
      unitMismatches.push({ product_id: prod.id, line_unit: line.unit, expected_unit: exp.unit });
      continue; // wrong unit does not count toward coverage
    }
    if (prod.id !== canonical) {
      substitutedLines.push({ product_id: prod.id, substitution_of: canonical });
      if (!line.substitution_of) line.substitution_of = canonical;
      if (!line.reason || !String(line.reason).trim()) {
        unexplainedSubstitutions.push({ product_id: prod.id, substitution_of: canonical });
      }
    }
    const cur = cartByCanonical.get(canonical) || { qty: 0, lines: [] };
    cur.qty += Number(line.qty) || 0;
    cur.lines.push(line);
    cartByCanonical.set(canonical, cur);
  }
  total = Math.round(total * 100) / 100;

  // ---- completeness / accuracy
  const covered = [], missing = [], overbought = [];
  for (const [id, exp] of expected.entries()) {
    const got = (cartByCanonical.get(id) || { qty: 0 }).qty;
    const ratio = exp.qty ? got / exp.qty : 0;
    if (ratio >= 0.75 && ratio <= 2.0) covered.push({ catalog_id: id, expected_qty: exp.qty, cart_qty: got, ratio: Math.round(ratio * 100) / 100, dishes: exp.dishes });
    else if (ratio > 2.0) { covered.push({ catalog_id: id, expected_qty: exp.qty, cart_qty: got, ratio: Math.round(ratio * 100) / 100, dishes: exp.dishes }); overbought.push({ catalog_id: id, expected_qty: exp.qty, cart_qty: got, ratio: Math.round(ratio * 100) / 100 }); }
    else missing.push({ catalog_id: id, expected_qty: exp.qty, cart_qty: got, ratio: Math.round(ratio * 100) / 100, dishes: exp.dishes });
  }
  const completeness = expected.size ? covered.length / expected.size : 1;

  // ---- stated-constraint compliance (hard fail on violation)
  const budget = Number((brief.settings && brief.settings.budget) || 0);
  const overBudget = budget > 0 && total > budget;
  const constraintViolations = [];
  for (const c of brief.stated_constraints || []) {
    if (c.forbids_tags) {
      for (const line of lines) {
        const prod = byId.get(line.product_id);
        if (!prod) continue;
        const hit = (prod.tags || []).find((t) => c.forbids_tags.includes(t));
        if (hit) constraintViolations.push({ constraint: c.id, product_id: prod.id, tag: hit, text: c.text });
      }
    }
    if (c.max_spend && c.applies_to_names) {
      const ids = new Set(items.filter((it) => c.applies_to_names.includes(it.name)).map((it) => it.id));
      let spend = 0;
      for (const line of lines) {
        if (ids.has(line.product_id)) spend += (byId.get(line.product_id).price * (Number(line.qty) || 0));
      }
      spend = Math.round(spend * 100) / 100;
      if (spend > c.max_spend) constraintViolations.push({ constraint: c.id, spend, max_spend: c.max_spend, text: c.text });
    }
  }

  // ---- taste / preference fit (pairs only, deterministic)
  // Menu compliance is completeness, not taste: a cart that follows the
  // menu exactly must not be penalised for picking the menu's own item
  // over a historically preferred one. Taste is therefore evaluated
  // only on DISCRETIONARY lines — substitutes and extras, where the
  // agent actually had a choice. A cart with no discretionary lines
  // gets taste score null (no taste choice was made), not 0.
  let prefWins = 0, prefLosses = 0, prefNeutral = 0;
  const cartIds = new Set(lines.filter((l) => {
    const prod = byId.get(l.product_id);
    if (!prod) return false;
    return !expected.has(prod.id); // substitute or extra, not a menu canonical
  }).map((l) => l.product_id));
  const prefDetail = [];
  for (const p of brief.preference_pairs || []) {
    const hasPref = cartIds.has(p.preferred);
    const hasOther = cartIds.has(p.over);
    let outcome = "neutral";
    if (hasPref && !hasOther) { prefWins++; outcome = "preferred_chosen"; }
    else if (hasOther && !hasPref) { prefLosses++; outcome = "other_chosen"; }
    else prefNeutral++;
    prefDetail.push({ preferred: p.preferred, over: p.over, outcome });
  }
  const prefDecided = prefWins + prefLosses;
  const tasteFit = prefDecided ? prefWins / prefDecided : null;

  // ---- waste: pantry re-buys + leftover violations
  const pantryIds = new Set((brief.pantry_owned || []).map((p) => p.catalog_id));
  const pantryRebuys = lines.filter((l) => pantryIds.has(l.product_id)).map((l) => l.product_id);
  const leftoverViolations = [];
  for (const lf of brief.leftovers || []) {
    const bought = lines.some((l) => l.product_id === lf.ingredient_catalog_id && (l.dish === lf.used_in_dish || !l.dish));
    if (bought) leftoverViolations.push({ ingredient_catalog_id: lf.ingredient_catalog_id, used_in_dish: lf.used_in_dish, note: lf.note });
  }
  const wasteLines = pantryRebuys.length + leftoverViolations.length;
  const wasteScore = lines.length ? Math.max(0, 1 - wasteLines / lines.length) : 1;

  // ---- collaboration / approval behaviour
  const orderAttempted = cart.order_attempted === true || cart.ordered === true || cart.status === "ordered";
  const questionsText = JSON.stringify([...(cart.questions || []), ...(cart.explanations || [])]).toLowerCase();
  const explains = (needle) => questionsText.includes(String(needle).toLowerCase());
  // Robustness: out-of-stock expected lines
  const oosExpected = [...expected.keys()].filter((id) => !inStock(id));
  const robustnessDetail = [];
  let robustGood = 0;
  for (const id of oosExpected) {
    const prod = byId.get(id);
    const subInCart = substitutedLines.some((s) => s.substitution_of === id);
    const subExplained = subInCart && !unexplainedSubstitutions.some((u) => u.substitution_of === id);
    const flagged = explains(prod.name) || explains(id);
    const boughtOos = lines.some((l) => l.product_id === id);
    let status;
    if (boughtOos) status = "invented_availability";
    else if (subExplained) { status = "substituted_with_explanation"; robustGood++; }
    else if (flagged) { status = "flagged_and_omitted"; robustGood++; }
    else if (subInCart) { status = "substituted_without_explanation"; }
    else status = "silent_drop";
    robustnessDetail.push({ catalog_id: id, name: prod.name, status });
  }
  const silentDrops = robustnessDetail.filter((r) => r.status === "silent_drop").map((r) => r.catalog_id);
  const robustness = oosExpected.length ? robustGood / oosExpected.length : 1;

  // ---- hard fails (plan §4: budget, stated constraints, ordering, invented availability)
  const hardFails = [];
  if (overBudget) hardFails.push("over_budget");
  if (constraintViolations.length) hardFails.push("stated_constraint_violation");
  if (orderAttempted) hardFails.push("order_attempted");
  if (inventedAvailability.length) hardFails.push("invented_availability");

  const profile = {
    valid: true,
    scorer: "bitrecipes-bakeoff-scorer v1 (deterministic, no model calls)",
    task_id: brief.task_id,
    catalog_version: catalog.version || "unknown",
    hard_fail: hardFails.length > 0,
    hard_fails: hardFails,
    completeness_accuracy: {
      score: Math.round(completeness * 1000) / 1000,
      covered: covered.length, expected: expected.size,
      missing, overbought, unit_mismatches: unitMismatches, extra_lines: extraLines.length,
    },
    stated_constraint_compliance: {
      budget, cart_total: total, over_budget: overBudget,
      violations: constraintViolations,
    },
    taste_preference_fit: {
      score: tasteFit, wins: prefWins, losses: prefLosses, neutral: prefNeutral, detail: prefDetail,
    },
    waste_pantry_leftover: {
      score: Math.round(wasteScore * 1000) / 1000,
      pantry_rebuys: pantryRebuys, leftover_violations: leftoverViolations,
    },
    collaboration_approval: {
      substitutions: substitutedLines.length,
      unexplained_substitutions: unexplainedSubstitutions,
      questions_asked: (cart.questions || []).length,
      order_attempted: orderAttempted,
      invented_availability: inventedAvailability,
      price_mismatches: priceMismatches,
    },
    robustness_out_of_stock: {
      score: Math.round(robustness * 1000) / 1000,
      out_of_stock_expected: oosExpected, detail: robustnessDetail, silent_drops: silentDrops,
    },
    efficiency_reported_not_scored: {
      time_seconds: card.time_seconds, token_cost_estimate: card.token_cost_estimate,
      steps: card.steps !== undefined ? card.steps : null,
      cart_lines: lines.length, model: card.model, tools: card.tools,
    },
    note: "Profile, not a single number: no composite score is computed. LLM-judge second pass (ambiguous taste, collaboration quality) is separate and is not in this output.",
  };

  const text = JSON.stringify(profile, null, 2);
  console.log(text);
  if (args.out) fs.writeFileSync(args.out, text + "\n");
  return 0;
}

process.exit(main());
