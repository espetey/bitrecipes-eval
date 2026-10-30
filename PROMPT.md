# Bit.recipes Bake-Off: agent run prompt

Copy this whole file into an agent with no prior context. It holds
everything the agent needs to run the test: what to fetch, what to
build, how to score it, and how to submit it.

## What this is

The Bit.recipes Bake-Off is a public test of how well an agent turns
a household menu into a grocery cart. The household is synthetic.
All names, preferences, and history are invented. No real person,
family, or store data is used. The test stops at the cart. No order
is placed, no money moves, and no grocery login is stored or used.
The eval never certifies medical or allergy safety. It checks stated
household constraints, such as a budget, a no-pork rule, and a snack
spending cap, as stated constraints only.

## Step 1: fetch these files

Repo: https://github.com/espetey/bitrecipes-eval

- Briefs (one synthetic household, seven tasks):
  https://raw.githubusercontent.com/espetey/bitrecipes-eval/main/household-v1.json
- Store catalog (frozen v2.0, 2,112 products, fixed prices):
  https://raw.githubusercontent.com/espetey/bitrecipes-eval/main/catalog-v2.json
- Scorer (deterministic, no model calls, runs under node):
  https://raw.githubusercontent.com/espetey/bitrecipes-eval/main/scorer.js
- Agent card template (mandatory, copy it and fill it in):
  https://raw.githubusercontent.com/espetey/bitrecipes-eval/main/agent-card-template.json
- Rules, scoring details, and worked examples:
  https://raw.githubusercontent.com/espetey/bitrecipes-eval/main/README.md
- Worked example carts with their exact score outputs:
  https://github.com/espetey/bitrecipes-eval/tree/main/example-carts

## Step 2: read the brief and the catalog

`household-v1.json` holds one household of 4 people and seven briefs.
Each brief has settings, dinners with servings and picked-by,
breakfast, lunch, and snacks calls, pantry owned, leftovers, stated
constraints, preference pairs, reorder history, and `expected_lines`
as ground truth. Pick a task and read only that brief plus the
catalog. The six tasks:

- `normal-week`, budget $180
- `budget-week`, budget $126, same menu with about 30 percent cut
- `pantry-first-week`, budget $180, pantry-owned items stay out
- `leftover-week`, budget $180, Monday roast chicken feeds Tuesday soup
- `party-week`, budget $260, household 6, quantities scaled up
- `out-of-stock-week`, budget $180, salmon fillets, ground beef 80/20,
  and romaine lettuce out of stock, with listed substitutes available
- `sale-week`, budget $180, same menu as normal week with a promo set:
  percent-off, N-for-M, and buy-X-get-Y-free rules on ten items

## Step 3: build the cart

Build one cart JSON per task you run. A full Run 1 entry covers all
seven tasks. Cart format v1, top-level fields:

- `task_id`: must match the brief task you ran, or the run scores invalid
- `agent_card`: copied from the template, filled in with your model,
  tools, store snapshot, seed, time taken, and token and cost estimate,
  plus, when known, the exact model version, provider, and harness
  (optional; shown on the leaderboard as reported, not verified)
- `lines`: one line per item
- `questions`: questions you asked instead of guessing
- `explanations`: short notes on choices you made
- `constraints_checked`: constraints you checked, such as budget, no-pork, snack-cap
- `order_attempted`: must be false. The eval stops at the cart.

Each line has `dish`, `ingredient`, `product_id`, `qty`, `unit`, and
`price_snapshot`. A substituted line also has `substitution_of`
(the catalog id it replaces) and `reason` (why this substitute).
Example:

```json
{
  "dish": "Salmon, rice, broccoli",
  "ingredient": "Cod Fillets",
  "product_id": "cod-fillets",
  "qty": 1,
  "unit": "lb",
  "price_snapshot": 10.99,
  "substitution_of": "salmon-fillets",
  "reason": "Salmon was out of stock; cod is a listed substitute with a similar fillet."
}
```

Rules:

- Shop checked items only. The brief defines what is expected.
- Stay inside the brief budget. The scorer prices from the catalog,
  never from your price snapshot, so a low snapshot cannot hide an
  over-budget cart.
- Leave out pantry-owned items and apply the leftover plan.
- Use listed substitutes only, each with a reason. A substitute with
  no reason counts as unexplained.
- Never invent availability. Listing an out-of-stock item as in stock
  is a hard fail, even if the rest of the cart is complete.
- Never drop an item silently. A dropped item with no substitute and
  no question lowers completeness and robustness.
- Ask a question instead of guessing when the brief leaves a real
  choice open, such as whether a substitute is acceptable.

## Step 4: score the cart

Run the scorer on your own cart before you submit. Fix the cart and
rescore as needed. The scorer takes no model calls and gives the
same output for the same cart every time.

```
node scorer.js --cart <cart.json> --brief household-v1.json --brief-task <task_id> --catalog catalog-v2.json --out <profile.json>
```

For sale-week, add `--promos promo-sale-week-v1.json`; without it the
cart scores at list prices. Budget is judged on effective totals, and
the profile reports an optimization figure (list, effective, and
minimal totals).

Exit 0 means scored. A hard fail still exits 0; hard fails live in
the profile, they are not a crash. Exit 2 means invalid submission
or unreadable input. Exit 1 means a usage error.

You can also score through the hosted endpoint instead of running
node locally. It runs the same deterministic scorer against the
same frozen catalog and briefs, needs no login, and is rate-limited:

POST https://www.bit.recipes/api/bakeoff/score
Body: { "task_id": "<task_id>", "cart": { ... } }
Response: { "scorer_version": "v1", "task_id": "<task_id>", "profile": { ... } }

Scores from the endpoint are for iteration only and are not ranked.
A GET on the same URL returns the task list and usage.

Report the full profile, including any hard fails. The profile has
seven parts, and there is no single composite score:

- completeness and accuracy
- stated constraint compliance
- taste and preference fit, measured only on discretionary lines
  such as substitutes and extras (a menu-faithful cart scores taste
  as null, not zero)
- waste, pantry-first, and leftover handling
- collaboration and approval (questions, reasons, explanations)
- robustness on out-of-stock items
- efficiency, reported and not scored (time, tokens, cost)

Hard fails: over budget, stated constraint violated, order
attempted, invented availability, invalid submission.

## Step 5: submit

Run 1 entry is by pull request to
https://github.com/espetey/bitrecipes-eval with your cart JSON files
plus your filled-in agent card. There is no submission API yet.
A submission with no agent card gets no ranking. Top placements
also publish a transcript of the run.

For shape reference, `example-carts/` holds five worked carts with
their exact score outputs: a strong cart (27/27, no hard fail), a
budget-busting cart (27/27, hard fail over budget at $188.62/$180),
a silent-drop cart (24/27, robustness 0), an invented-availability
cart (27/27, hard fail), and a substituted cart (27/27, no hard fail).
