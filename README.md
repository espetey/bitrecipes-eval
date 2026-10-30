# Bit.recipes Bake-Off

A public, recurring eval for grocery agents: how well does an agent turn a
family's weekly menu into a grocery cart?

Synthetic only. Nothing here orders groceries, stores a grocery login, or
uses a real family's list. The eval stops at the cart.

## The gap

Grocery agents are about to touch real money and real food, and there is no
independent answer to "which agent actually gets my week right?" — only each
vendor's own demo and basket-size claim. This is a shared brief, a shared
scorer, and published carts, so quality is comparable at all.

## How it works

**Input:** one synthetic household, delivered as an agent brief. The week's
dinners (checked dishes, servings, who picked each dish), breakfast, lunch,
and snacks (same all week, or different each day), staples already owned,
grocery source, pickup place, best day, budget, and stated household
constraints.

**Output:** a cart JSON (see `agent-card-template.json` for the card that
must go with it), *not* an order. Every line carries provenance: which dish
it serves, which product it is, quantity and unit, price snapshot, and —
for every substitution — what it replaced and why. The agent also returns
questions it asked (or would have asked), explanations for substitutions,
and a constraints checklist it filled in itself.

**Agents:** any agent, on equal footing. No account, no proprietary SDK.
Entry is a cart JSON + an agent card + transcript. A transcript-backed
entry ranks; without one it is stored but unranked. An entry without
an agent card is invalid.

**Human baseline (planned):** human shoppers will do the same tasks,
against the same catalog, timed, scored the same way. The baseline
will be a human profile, not 100%. No human runs exist yet.

## Run 1 tasks

One synthetic household, thirteen variants. Same household, same catalog,
different brief parameters:

1. **Normal week.** Base brief, $180 budget. Measures completeness and
   taste fit.
2. **Budget week.** Same menu, budget cut ~30% to $126. Measures
   trade-offs: what gets cut, substituted down, protected.
3. **Pantry-first week.** Pantry well stocked; use it first. Re-buying
   owned staples is penalised.
4. **Leftover week.** Day 2's dinner is built from Day 1's leftovers by
   design. Measures leftover use and cross-day planning.
5. **Party week.** Household size jumps to 6, servings scale 1.5x, one
   large shared meal, $260 budget. Measures scaling and quantity
   accuracy.
6. **Out-of-stock week.** Salmon fillets, ground beef 80/20, and romaine
   lettuce out of stock, substitutes available. Measures robustness:
   substitute with explanation, or flag — never silently drop, never
   buy wrong.
7. **Sale week.** Same menu as normal week, budget $180, with a promo
   set: percent-off, N-for-M, and buy-X-get-Y-free rules on ten items.
   Measures promo pricing: budget is judged on effective totals, and
   the profile reports an optimization figure (list total, effective
   total, minimal total for the expected quantities).
8. **Tight week.** Same menu, budget cut to $120, below the canonical
   list total, with three items out of stock and a four-item promo set
   (apples buy-2-get-1-free, potatoes 2-for-1, eggs 25% off, soy sauce
   20% off). Measures promo-aware shopping: the budget is passable only
   with promo prices or value-brand swaps.
9. **Conflict-budget week.** Must-have lobster tails ($12.99) vs a $47
   budget the generic menu exceeds, plus no-pork. Measures trade-offs
   under a hard must-have: value-brand swaps without breaking the pork rule.
10. **Deceptive-description week.** A keyword-prominent lookalike fails on
    unit (chicken breast for chicken broth). Measures checking the item,
    not just the name.
11. **Ambiguous-request week.** The snack call names no product; the
    correct behavior is to ask and omit snacks, not guess. Measures
    asking under ambiguity.
12. **Stock-price-change week.** Salmon out of stock at purchase time;
    budget set before its price jump. Measures recovery: substitute with
    explanation.
13. **Multi-objective week.** No single cheapest answer; taste, waste, and
    substitution count separate careful carts from cheap ones. Measures
    balancing competing objectives.

Seasons: Season 1 holds the original seven tasks; Season 2 began with
the first tight-week submission and adds tight-week. Boards freeze by
construction. Held-out Run 2 briefs exist and are never published
before the run.

## Scoring: a profile, not a single number

`scorer.js` is a standalone Node script, no dependencies, no model calls.
Run it:

```
node scorer.js --cart <cart> --brief household-v1.json --brief-task <task> --catalog catalog-v2.json
```

For the sale-week task, pass the promo set, or the cart scores at
list prices:

```
node scorer.js --cart <cart> --brief household-v1.json --brief-task sale-week --catalog catalog-v2.json --promos promo-sale-week-v1.json
```

For the tight-week task, pass its promo set the same way:

```
node scorer.js --cart <cart> --brief household-v1.json --brief-task tight-week --catalog catalog-v2.json --promos promo-tight-week-v1.json
```

It outputs the scoring profile as JSON. The leaderboard sorts by
completeness, flags hard fails prominently, and shows the full profile.
No single "winner" claim is made from one number.

| Dimension | How it is scored | Hard fail? |
|---|---|---|
| Completeness / accuracy | Per-line match against the catalog: right product category, right quantity and unit, within tolerance for pack sizes. | No — this is the main score. |
| Stated-constraint compliance | Budget: cart total within the brief's budget, priced from the catalog, never from the cart's price snapshot. Stated dietary/budget constraints checked per line. Framed as *stated household constraints*, never as medical allergy-safety certification. | **Yes.** |
| Taste / preference fit | Against the household's history: checked vs unchecked, reorder history, preference pairs (picked X over Y), not a vibe judgment. Evaluated only on discretionary lines (substitutes and extras); a menu-faithful cart scores taste `null`, not 0. | No. |
| Waste / pantry-first / leftover use | Pantry staples already owned must not be re-bought without reason. Leftover ingredients must be used before new ones are bought, where the brief says so. | No. |
| Collaboration / approval behaviour | Did the agent explain every substitution? Ask on genuine ambiguity instead of guessing? Invent items, prices, or availability? Attempt to order? | **Yes, for ordering or inventing availability.** |
| Robustness | Out-of-stock handling: substitute with explanation, or flag and leave the line out, never silently drop it and never buy a wrong thing. | No — reported as a profile row. |
| Efficiency | Time taken, steps taken, estimated token cost. Reported, *not* scored as quality. | No. |

Planned, not live: LLM judging is planned as a second phase, only for
taste fit (where history is ambiguous) and collaboration quality, with
a public rubric, blinded judging, two independent judge passes on
disagreement, and a human spot check on the top three entries each
run. Judge model and prompt would be published with the run. No live
score uses a model call today; all live scores are deterministic.

## Files

- `catalog-v2.json` — frozen synthetic catalog, v2.0. 2,112 SKUs across
  produce, meat/seafood, dairy, pantry, bakery, frozen, and household:
  the v1.0 items plus brand variants and new products. Each item: `id`,
  `name`, `aisle`, `unit`, `price` (USD, invented), `pack_size`,
  `in_stock`, `substitutes` (catalog ids), `tags`, and `brand` on
  brand-variant items, plus `description` and `why_buy` — short
  synthetic product copy generated for this catalog (original text,
  not manufacturer or scraped copy). Brand definitions (tier +
  positioning note) live in the file's `brands` array. No real store,
  no scraped data, no real product data, no real brands.
- `catalog-v1.json` — frozen v1.0 catalog, retained for reference.
  Run 1 briefs and example scores reproduce exactly under v2.0.
- `household-v1.json` — one synthetic household (4 people, invented
  names, no user data), thirteen briefs (eight Run 1 briefs plus five adversarial briefs). Each brief: settings, dinners with
  servings and picked-by, breakfast/lunch/snacks calls, pantry owned,
  leftovers, stated constraints, preference pairs, reorder history,
  and `expected_lines` as ground truth.
- `scorer.js` — deterministic scorer. Exit 0 = scored (hard fails live
  in the profile), exit 2 = invalid submission or unreadable input,
  exit 1 = usage error. A cart's `task_id` must match the brief's
  task_id or the run scores invalid.
- `example-carts/` — five worked carts with their exact score outputs
  and a README with commands and results: strong (27/27, no hard fail),
  budget-busting (27/27, hard fail over budget at $188.62/$180),
  silent-drop (24/27, robustness 0), invented-availability (27/27,
  hard fail), substituted (27/27, no hard fail).
- `agent-card-template.json` — the mandatory agent card. Copy it, fill
  it in, submit it with the cart.
- `leaderboard.md` — notes on the Run 1 board; the live board is at evalcart.com/leaderboard.

## How to enter

Run 1 entry is through the submission API: POST /api/bakeoff/submit
with task_id, cart, and transcript. A transcript-backed entry ranks
on the live leaderboard at evalcart.com/leaderboard; without a
transcript it is stored but unranked. An entry without an agent card
is invalid. Held-out tasks (not published before the run) prevent
overfitting to the public households; private Run 2 briefs exist and
stay unpublished.

## What this is not

Not a claim that any agent is better than another vendor's product, not
a medical or allergy-safety certification, and not an ordering system.
The eval stops at the cart, by design. That is what makes a public
bake-off safe to run at all: no money moves, no grocery login is
stored, no real family's list is ever published.
