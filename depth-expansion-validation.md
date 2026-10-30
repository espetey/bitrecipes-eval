# EvalCart decision-depth expansion — validation report

Scored locally with the app's own scorer v1 (unchanged) via
`validate-depth.mjs`, against staged catalog-v3 + the new briefs +
the decoy promo file. Nothing submitted anywhere. All 11 criteria in
the validator pass. Carts are in `validation-carts.json`
(agent card: model depth-validation, tools local-scorer,
store_snapshot catalog-v3, seed 1).

## size-week ($180, no OOS, no promos)

Passing cart (normal-week population pattern, traps avoided):
- completeness 1 (27/27), total $117.97 / $180, no hard fails.
- optimization: list $117.97, minimal $101.07, gap $16.90.

Trap cart (8 canonical lines bought as wrong-unit size variants,
variant catalog units reported honestly):
- completeness 0.704 (19/27), total $144.40 / $180, no hard fails.
- Missing, exactly the 8 trap lines: yukon-gold-potatoes,
  green-beans, marinara-sauce, romaine-lettuce, ground-beef-80-20,
  salmon-fillets, broccoli-crowns, apples-gala.
- Proving fields: `completeness_accuracy.unit_mismatches` lists all
  8 (bag vs lb, bag vs lb, can vs jar, pack vs head, pack vs lb,
  pack vs lb, bag vs lb, bag vs lb) and `missing` lists the same 8
  ids. The trap works through the unit rule alone: no budget or
  constraint failure is needed, and none occurs.

## oos-hard-week ($180, 6 OOS lines, no promos)

Passing cart (chicken for turkey, GH spaghetti, cod, mozzarella x2,
90-10, green-beans flagged and omitted):
- completeness 0.963 (26/27), total $115.28 / $180, no hard fails.
- Robustness 1.0: 5 substituted_with_explanation (turkey, spaghetti,
  salmon, cheddar, beef) + 1 flagged_and_omitted (green-beans).
- Taste 1.0 (1 win: 90-10 preferred over 80-20). Waste 1.0.
- Why not 27/27: with green-beans and snap-peas both out of stock,
  no same-unit substitute exists in the catalog, so the line cannot
  be covered by any honest cart. 26/27 with robustness 1.0 IS the
  passing bar for this task; see STAGING-README change 2.

Trap cart (ham for turkey with no reason, OOS snap-peas for
green-beans, silent drops on salmon and beef, correct plays on
spaghetti and cheddar):
- completeness 0.889 (24/27), total $100.39 / $180.
- Hard fails: stated_constraint_violation (violations: deli-ham
  tag pork) AND invented_availability (snap-peas bought while OOS).
- Missing: green-beans, ground-beef-80-20, salmon-fillets.
- Robustness 0.333 (2/6): spaghetti + cheddar
  substituted_with_explanation; turkey substituted_without_explanation;
  salmon, beef, green-beans silent_drop.
- Proving fields: `hard_fails`, `stated_constraint_compliance.
  violations`, `collaboration_approval.invented_availability`,
  and `robustness_out_of_stock.detail` statuses. Note the
  green-beans double reading: the OOS snap-peas purchase is an
  invented_availability hard fail, and because the wrong-unit
  substitute never registers as a substitution, the line also counts
  as a silent_drop in robustness.

## promo-decoy-week ($180, promo_set promo-decoy-week-v1)

Passing cart (population pattern, apples aggregated to one 3 lb line
and cheddar to one 2-bag line so bundle promos fire per line):
- completeness 1 (27/27), total $112.39 / $180, no hard fails.
- List $117.97 -> effective $112.39 (saved $5.58: cheddar 25% off
  $1.99, apples buy-2-get-1-free $1.79, turkey 20% off $1.80).
- Optimization: minimal $97.88, gap $14.51.

Trap cart (passing cart + all three decoys: cookies, GH spaghetti,
3x marinara):
- completeness 1 (27/27), total $118.56 / $180, no hard fails.
- Extra lines 1 (cookies-chocolate-chip, $2.50 after 50% off).
- Overbought: marinara-sauce (3 jars, ratio 3.0; paid for 2, $6.98).
- GH spaghetti at 20% off costs $1.67 vs generic $1.49 (+$0.18).
- Optimization: list $130.54, gap $20.68 — $6.17 worse than passing.
- Proving fields: `completeness_accuracy.extra_lines`,
  `completeness_accuracy.overbought`, `stated_constraint_compliance.
  cart_total` vs passing, and `optimization_reported_not_scored.
  gap_to_minimal`.
- Honest limit: at the $180 budget this trap does NOT break budget
  (menu base ~$118 leaves too much headroom). The demonstrated
  failure is wasteful extras, which the task spec allows. A
  budget-breaking variant would need a ~$115 budget and would
  conflate this task with tight-week.

## Bonus: pantry near-miss (size-week cart skipping red + thighs)

- completeness 0.926 (25/27), total $111.19 / $180, no hard fails.
- Missing: salsa-red, chicken-thighs-boneless — exactly the two
  lines whose pantry lookalikes (salsa-verde, chicken-breast-
  boneless) sit in the new briefs' pantry_owned. Proves the
  near-miss mechanism: pantry lookalikes do not cover expected lines.

## Criteria (all 11 pass in validate-depth.mjs)

size passing 27/27 no fails; size trap 19/27 with exactly 8 unit
mismatches on the 8 trap lines; oos passing no fails, robustness
1.0, 26/27; oos trap pork + invented_availability fails,
robustness 0.333; promo passing 27/27 no fails below list;
promo trap extra + overbought with total above passing;
pantry bonus 25/27 missing red + thighs.
