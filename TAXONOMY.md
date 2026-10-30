# Failure taxonomy

Tags for why a run fails or falls short. A tag is a label on a run,
not a separate score. There is no composite score; the profile stays
the record. Examples come from the Oct 29 random-cart probe (local
scorer, normal-week), the Oct 29 tight-week validation (local scorer,
tight-week promo file applied), and the Oct 29 population runs
(receipts 2-9, live). Two entries state the rule with an illustration
instead of a run, because no observed run triggered them; those are
marked as illustrations, not runs.

## over_budget

Rule: cart total above the brief budget. Totals come from catalog
prices. On promo tasks, effective promo prices apply.

Example (probe, normal-week): correct items plus 15 random extras,
27/27 complete, $191.22 against a $180 budget.

Example (tight-week validation): premium organic substitutes, 27/27
complete, $120.62 against a $120 budget, $0.62 over.

What it tells you: completeness does not save a cart that costs too
much. The fix is cheaper allowed products, fewer extras, or smaller
quantities inside the band.

## stated_constraint_violation (pork trap)

Rule: a stated constraint is broken. The household no-pork constraint
matches catalog tags. It is a stated household preference, not a
medical or allergy-safety certification.

Example (probe, normal-week): cheapest-per-line cart, 24/27 complete,
$87.77. The cheapest deli meat is ham, and ham carries the pork tag.

Example (tight-week validation): the cheapest turkey substitute is
ham. The cart is 27/27 complete at $113.12 and still fails.

What it tells you: the cheapest product per line is not always an
allowed product. Constraint checks have to run before price
optimization, not after.

## invented_availability

Rule: the cart buys an out-of-stock item.

Example (tight-week validation): the canonical tight-week cart with
no substitutions, 27/27 complete, $115.82 against a $120 budget. It
fails because deli-turkey-slices, cheddar-cheese-shredded, and
spaghetti are out of stock that week.

Note the nuance: completeness still reads 27/27. The hard fail is
separate from completeness. Buying the expected item is not always
correct. Out-of-stock lines need a substitute or a flagged omission.

## silent_drop

Rule: an out-of-stock line is dropped with no substitute and no flag.
The scorer marks it `silent_drop` in the robustness detail and gives
no credit for the line.

No probe or population run produced a pure silent drop: the
population out-of-stock runs substituted every out-of-stock line.
This entry therefore states the rule with an illustration, not a run.
Illustration: on out-of-stock-week, omitting salmon-fillets entirely,
with no substitute and no flag, leaves the line uncovered and marks a
silent drop. The correct moves are a listed substitute or a flagged
omission. The other robustness statuses are
`substituted_with_explanation`, `flagged_and_omitted`, and
`substituted_without_explanation`.

## unexplained_substitution

Rule: not a hard fail. A substituted line with no explanation is
recorded in the robustness detail and in `collaboration_approval`.
It costs nothing today.

Example (population runs, rescored locally): receipt 7
(out-of-stock-week) substitutes all three out-of-stock lines without
explanation: romaine-lettuce to butter-lettuce, ground-beef-80-20 to
ground-beef-90-10, salmon-fillets to cod-fillets. Receipt 9
(tight-week) substitutes its three out-of-stock lines the same way.
Both runs still pass.

What it tells you: substitution without explanation is visible in the
profile even though it is not scored. A future version can score
explanation quality from this field.

## sloppy_quantity

Rule: quantities inside the 0.75x-2.0x band count as covered.
Overbuying inside the band passes completeness and inflates the total.

Example (probe, normal-week): expected items with quantities
randomized inside the band, 27/27 complete, $175.80 against the
control $120.67, no hard fails.

Example (tight-week validation): sloppy quantities on the feasible
items, 27/27 complete, $163.99 against a $120 budget, over budget.

What it tells you: read the optimization gap beside completeness.
The tight-week feasible cart has a $14.80 gap over the $98.72 minimal
total. The sloppy tight cart has a $65.27 gap.

## pantry_rebuy

Rule: buying an item already in the brief's `pantry_owned` list, or a
leftover ingredient outside its planned dish, counts against the
`waste_pantry_leftover` score.

No probe or population run triggered a pantry rebuy: the probe waste
score was 1.0 for every cart, and the population pantry-first-week
cart follows a brief whose expected lines already exclude pantry
items. This entry therefore states the rule with an illustration, not
a run. Illustration: normal-week pantry owns olive oil, salt, black
pepper, and flour, so adding olive oil to a normal-week cart counts
as a pantry rebuy and lowers the waste score.

What it tells you: the brief's pantry list is part of the task. A cart
that ignores it spends money on items the household already owns.

## half_cart_pass

Rule: no hard fail does not mean a good cart.

Example (probe, normal-week): 14 of 27 lines, $75.52, no hard fails.
Under the old "Passes" label this showed as passing. The leaderboard
label now reads "No hard fails", which states what the label means.

What it tells you: always read completeness beside the label. A 52%
cart with no hard fails is still a 52% cart.

## invalid_submission (not a failure tag)

A submission missing the task id or required agent-card fields
returns 400 and is not stored. It never appears on the leaderboard.
Fix the errors and resubmit.
