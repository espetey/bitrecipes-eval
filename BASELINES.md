# Discrimination baselines

Oct 29, 2026. This document publishes the random-cart probe as the
baseline set for the normal-week task. It shows what the benchmark
separates and what it does not.

## Method

- Task: normal-week, budget $180, 27 canonical lines (29 expected
  lines aggregated by product).
- Scorer: bitrecipes-bakeoff-scorer v1, deterministic, no model calls.
  Catalog v2.0 (2,112 SKUs).
- The probe ran against the local scorer only. Nothing was submitted
  to the live leaderboard or store.
- Random policies use a seeded generator (mulberry32), so every run
  reproduces exactly: uniform-random seeds 1-3, aisle-matched seeds
  4-5, in-band quantities seed 6, extras seed 7, half-drop seed 10.
- The control is the published strong cart: the canonical items at
  expected quantities.
- For worked examples of good and bad carts, see `example-carts/`
  (five carts with published scores).

## Results

| Policy | Covered | Total | Hard fails |
| --- | --- | --- | --- |
| Control, strong cart | 27/27 (100%) | $120.67 / $180 | none |
| Uniform random, seed 1 (27 lines) | 0/27 (0%) | $241.78 / $180 | over_budget, stated_constraint_violation |
| Uniform random, seed 2 (27 lines) | 0/27 (0%) | $261.73 / $180 | over_budget |
| Uniform random, seed 3 (40 lines) | 4/27 (15%) | $255.84 / $180 | over_budget, stated_constraint_violation |
| Aisle-matched random, seed 4 | 1/27 (4%) | $144.77 / $180 | stated_constraint_violation |
| Aisle-matched random, seed 5 | 2/27 (7%) | $147.87 / $180 | stated_constraint_violation |
| Cheapest per line | 24/27 (89%) | $87.77 / $180 | stated_constraint_violation |
| Premium per line | 21/27 (78%) | $166.67 / $180 | none |
| Sloppy quantities, in band | 27/27 (100%) | $175.80 / $180 | none |
| Correct items + 15 random extras | 27/27 (100%) | $191.22 / $180 | over_budget |
| Half cart (14 of 27 lines) | 14/27 (52%) | $75.52 / $180 | none |

Waste scored 1.0 for every probe cart. Taste was null for
menu-faithful carts (no discretionary decision exists to score) and
1 or 0 on the two aisle-matched runs that made a preference-pair
choice.

## What each baseline proves

**Uniform random (0-15%).** Chance scores near zero and blows the
budget on all three seeds. The benchmark is not passable by guessing.

**Aisle-matched random (4-7%).** Knowing the right aisle is not
knowing the product. A cart drawn from the right shelves still fails
completeness and can trip a stated constraint.

**Cheapest per line (89%, hard fail).** The cheapest deli meat is ham,
and ham carries the pork tag, which violates the household no-pork
constraint. Price optimization without constraint checks fails. The
cheapest allowed product per line is not always an allowed product.

**Premium per line (78%, no hard fail).** Paying more does not buy
coverage. Six lines miss even at the highest price per line.

**Sloppy quantities (100%, $175.80).** Expected items with quantities
randomized inside the 0.75x-2.0x band score the same completeness as
the control ($120.67). Completeness alone cannot separate a careful
cart from a sloppy one. Read the total and the optimization gap beside
completeness.

**Correct items + 15 extras (100%, hard fail).** Extras are not free.
Full completeness with an over-budget total still fails the run.

**Half cart (52%, no hard fail).** Under the old "Passes" label this
showed as passing. The leaderboard label now reads "No hard fails",
which states what the label means: no hard fail, not a good cart.
Always read completeness beside the label.

## What the benchmark separates

- Chance from knowledge: random 0-15% against control 100%.
- Aisle knowledge from product knowledge: 4-7% against 100%.
- Price optimization from constraint compliance: cheapest 89% but
  fails on a constraint.
- Careful from sloppy: only through total and optimization gap, not
  through completeness.
- Complete from passing: a half cart passes the no-hard-fail label
  at 52%.

## What it does not separate

- Careful from sloppy on completeness alone (see the sloppy row).
- Taste when no discretionary decision exists: taste is null, not 0,
  for menu-faithful carts.
- Anything about the agent's process. The probe scored carts, not
  traces. Process evaluation needs trace data, which the current
  submission format does not carry in structured form.
