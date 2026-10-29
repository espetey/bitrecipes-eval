#!/usr/bin/env node
/**
 * Bit.recipes Bake-Off Run 1 — deterministic scorer (no dependencies, no model calls).
 *
 * Inputs: a cart JSON (cart format v1), a brief (from household-v1.json),
 * and the frozen catalog (catalog-v2.json).
 * Output: a scoring PROFILE as JSON, not a single number. There is
 * deliberately no composite score: a single number is exactly what gets gamed.
 *
 * Usage:
 *   node scorer.js --cart example-carts/strong-cart.json --brief household-v1.json \
 *     --brief-task normal-week --catalog catalog-v2.json [--out out.json]
 *   node scorer.js --cart <cart.json> --brief household-v1.json \
 *     --brief-task sale-week --catalog catalog-v2.json --promos promo-sale-week-v1.json
 *   node scorer.js --help
 *
 * --brief-task selects which brief inside household-v1.json to score against.
 * If --brief points at a single brief object (not a household file), --brief-task
 * is optional. A cart's task_id must match the brief's task_id, or the run is
 * scored as invalid (see validation below).
 *
 * Promotions (sale-week): --promos points at a promo set file. A brief opts
 * into it with settings.promo_set = the set's id; any other brief scores
 * with list prices exactly as before. When a brief does opt in, line totals,
 * the cart total, budget, and name-cap spend all use effective promo prices,
 * and the profile gains optimization_reported_not_scored. One promo per item
 * by construction (the set is a map keyed by catalog id).
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
  node scorer.js --cart <cart.json> --brief <brief-or-household.json> --catalog <catalog-v2.json>
                 [--brief-task <task_id>] [--promos <promo-set.json>] [--out <profile.json>]
  node scorer.js --help

Flags:
  --cart        Cart JSON, cart format v1 (task_id, agent_card, lines[] required)
  --brief       household-v1.json (use --brief-task to pick a brief) or a single brief object
  --brief-task  task_id inside a household file, e.g. normal-week (default: cart's task_id)
  --catalog     catalog-v2.json (frozen v2.0)
  --promos      promo set file, e.g. promo-sale-week-v1.json (applies only when the brief opts in)
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

// Promo math, identical to the importable edition's. One promo per item
// by construction; malformed promos fall back to list price. Bundle
// promos prorate fractional quantities: below the threshold the buyer
// pays list, at and above it the deal applies.
function effectiveLineTotal(price, qty, promo) {
  const p = Number(price) || 0;
  const q = Number(qty) || 0;
  const list = Math.round(p * q * 100) / 100;
  if (!promo || typeof promo !== "object") return list;
  if (promo.type === "percent_off") {
    const v = Number(promo.value);
    if (!Number.isFinite(v) || v < 0 || v > 100) return list;
    return Math.round(p * q * (1 - v / 100) * 100) / 100;
  }
  if (promo.type === "n_for_m") {
    const n = Number(promo.n), m = Number(promo.m);
    if (!Number.isInteger(n) || !Number.isInteger(m) || n <= 0 || m < 0 || m >= n) return list;
    const paid = Math.floor(q / n) * m + (q % n);
    return Math.round(p * paid * 100) / 100;
  }
  if (promo.type === "buy_x_get_y_free") {
    const x = Number(promo.x), y = Number(promo.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x <= 0 || y < 0) return list;
    const paid = q - Math.floor(q / (x + y)) * y;
    return Math.round(p * paid * 100) / 100;
  }
  return list;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { usage(); return 0; }
  if (!args.cart || !args.brief || !args.catalog) {
    console.error("Missing required flags: --cart, --brief, --catalog (see --help).");
    return 1;
  }
  let cart, briefDoc, catalog, promoSetFile = null;
  try {
    cart = readJson(args.cart);
    briefDoc = readJson(args.brief);
    catalog = readJson(args.catalog);
    if (args.promos) promoSetFile = readJson(args.promos);
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

  // Promotions, fail-closed: the set applies only when this brief
  // names it in settings.promo_set. Otherwise promos is empty and
  // every total below is a list-price total, exactly as before.
  const promoSet = (brief && brief.settings && brief.settings.promo_set && promoSetFile && brief.settings.promo_set === promoSetFile.id) ? promoSetFile : null;
  const promos = (promoSet && promoSet.promos) || {};
  const promoFor = (id) => promos[id] || null;

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
  let listTotal = 0;
  for (const line of lines) {
    const prod = byId.get(line.product_id);
    if (!prod) { extraLines.push({ line, reason: "unknown_product_id" }); continue; }
    if (!inStock(prod.id)) inventedAvailability.push({ product_id: prod.id, name: prod.name });
    // Promo'd lines skip the snapshot check: an honest snapshot of a
    // bundle deal is a per-line effective price, not one unit price.
    if (!promoFor(prod.id) && line.price_snapshot !== undefined && Number(line.price_snapshot) !== prod.price) {
      priceMismatches.push({ product_id: prod.id, snapshot: line.price_snapshot, catalog_price: prod.price });
    }
    const qty = Number(line.qty) || 0;
    listTotal += prod.price * qty;
    total += effectiveLineTotal(prod.price, qty, promoFor(prod.id));
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
  listTotal = Math.round(listTotal * 100) / 100;

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
        if (ids.has(line.product_id)) spend += effectiveLineTotal(byId.get(line.product_id).price, Number(line.qty) || 0, promoFor(line.product_id));
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

  // ---- optimization (promo tasks only, reported not scored)
  // Minimal total: the cheapest way to buy exactly the expected
  // quantities, choosing per line the cheapest allowed product
  // (canonical or a listed substitute, same unit) with promos
  // applied. A gap below zero means the cart bought less than the
  // expected quantities while staying inside the coverage band.
  let optimization = null;
  if (promoSet) {
    let minimalTotal = 0;
    for (const [id, exp] of expected.entries()) {
      const candidates = [id, ...((byId.get(id) && byId.get(id).substitutes) || [])];
      let best = Infinity;
      for (const cid of candidates) {
        const cprod = byId.get(cid);
        if (!cprod || normUnit(cprod.unit) !== exp.unit) continue;
        const cost = effectiveLineTotal(cprod.price, exp.qty, promoFor(cid));
        if (cost < best) best = cost;
      }
      if (best !== Infinity) minimalTotal += best;
    }
    minimalTotal = Math.round(minimalTotal * 100) / 100;
    optimization = {
      list_total: listTotal,
      effective_total: total,
      minimal_total_for_expected: minimalTotal,
      savings_vs_list: Math.round((listTotal - total) * 100) / 100,
      gap_to_minimal: Math.round((total - minimalTotal) * 100) / 100,
      promo_set: promoSet.id,
      note: "Minimal total buys exactly the expected quantities through the cheapest allowed product per line, promos applied. Reported, not scored.",
    };
  }

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
    ...(optimization ? { optimization_reported_not_scored: optimization } : {}),
    note: "Profile, not a single number: no composite score is computed. LLM-judge second pass (ambiguous taste, collaboration quality) is separate and is not in this output.",
  };

  const text = JSON.stringify(profile, null, 2);
  console.log(text);
  if (args.out) fs.writeFileSync(args.out, text + "\n");
  return 0;
}

process.exit(main());
