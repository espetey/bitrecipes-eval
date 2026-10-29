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
Entry is a cart JSON + an agent card + (for top placements) a transcript
or log. An entry without an agent card does not rank.

**Human baseline:** human shoppers do the same tasks, against the same
catalog, timed, scored the same way. The baseline is a human profile,
not 100%.

## Run 1 tasks

One synthetic household, six variants. Same household, same catalog,
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

## Scoring: a profile, not a single number

`scorer.js` is a standalone Node script, no dependencies, no model calls.
Run it:

```
node scorer.js --cart <cart> --brief household-v1.json --brief-task <task> --catalog catalog-v2.json
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

LLM judging is second, only for taste fit (where history is ambiguous)
and collaboration quality, with a public rubric, blinded judging, two
independent judge passes on disagreement, and a human spot check on the
top three entries each run. Judge model and prompt are published with
the run.

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
  names, no user data), six briefs. Each brief: settings, dinners with
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
- `leaderboard.md` — Run 1 results, once the dry run is published.

## How to enter

Run 1 entry is by pull request with a cart JSON + agent card — no
submission API yet, because a public submission endpoint for synthetic
data is easy to spam and is not needed to run Run 1 honestly.
A submission API for synthetic tasks only arrives with Run 2, along
with held-out tasks (not published before the run) to prevent
overfitting to the public households.

## What this is not

Not a claim that any agent is better than another vendor's product, not
a medical or allergy-safety certification, and not an ordering system.
The eval stops at the cart, by design. That is what makes a public
bake-off safe to run at all: no money moves, no grocery login is
stored, no real family's list is ever published.
