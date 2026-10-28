# Example carts — commands and results

Run from the `bakeoff/` folder. Each `.score.json` next to a cart is the
exact scorer output for that cart (produced with `--out`), not a summary.

```sh
node scorer.js --cart example-carts/strong-cart.json \
  --brief household-v1.json --brief-task normal-week \
  --catalog catalog-v1.json --out example-carts/strong-cart.score.json
node scorer.js --cart example-carts/budget-busting-cart.json \
  --brief household-v1.json --brief-task normal-week \
  --catalog catalog-v1.json --out example-carts/budget-busting-cart.score.json
node scorer.js --cart example-carts/silent-drop-cart.json \
  --brief household-v1.json --brief-task out-of-stock-week \
  --catalog catalog-v1.json --out example-carts/silent-drop-cart.score.json
node scorer.js --cart example-carts/invented-availability-cart.json \
  --brief household-v1.json --brief-task out-of-stock-week \
  --catalog catalog-v1.json --out example-carts/invented-availability-cart.score.json
node scorer.js --cart example-carts/substituted-cart.json \
  --brief household-v1.json --brief-task out-of-stock-week \
  --catalog catalog-v1.json --out example-carts/substituted-cart.score.json
```

## Results (all exit code 0 — hard fails are in the profile, not a crash)

| Cart | Task | Completeness | Total / budget | Hard fail | Other profile notes |
|---|---|---|---|---|---|
| strong-cart | normal-week | 1.0 (27/27) | $120.67 / $180 | none | Taste null (no discretionary lines — see below). Waste 1.0. Robustness 1.0 (no OOS lines in this task). |
| budget-busting-cart | normal-week | 1.0 (27/27) | $188.62 / $180 | `over_budget` | Same menu as strong, plus premium proteins. Completeness is untouched — the hard fail is the budget alone, which is the point: a complete cart can still fail. |
| silent-drop-cart | out-of-stock-week | 0.889 (24/27) | $100.20 / $180 | none | Robustness 0. Three silent drops: salmon-fillets, ground-beef-80-20, romaine-lettuce. Penalised through completeness and robustness, deliberately NOT a hard fail (plan §4). |
| invented-availability-cart | out-of-stock-week | 1.0 (27/27) | $120.67 / $180 | `invented_availability` | Includes all three out-of-stock products as if in stock. Completeness is perfect and the cart still fails — another case where a single completeness number would mislead. |
| substituted-cart | out-of-stock-week | 1.0 (27/27) | $118.87 / $180 | none | Robustness 1.0: all three OOS items substituted with listed substitutes and a reason on each line, plus one question. Taste 1.0: one discretionary win (salsa verde over red salsa). This is the correct handling of the out-of-stock week. |

## Two honest notes on these results

1. **Taste is null on four of the five examples, and that is correct.**
   Taste is evaluated only on discretionary lines (substitutes and
   extras), because menu compliance is completeness, not taste. A cart
   that follows the menu exactly makes no taste choice, so it scores
   null here rather than a misleading number. The substituted cart is
   the one example that does make a taste choice, and it scores 1.0.
   An earlier version of the scorer evaluated taste on all lines, which
   made the strong cart score 0.2 for following the menu's own items
   over historically preferred ones. That was the wrong measurement, and
   it was fixed before these outputs were produced.
2. **A scorer bug was found and fixed during this run.** The first
   scorer run crashed with `ReferenceError: unit_mismatches is not
   defined` (a variable-name mismatch in the profile output). It was
   fixed in `scorer.js` and all five examples were re-run from scratch;
   the `.score.json` files above are the post-fix outputs. Negative
   tests also pass: a cart missing `agent_card.seed` scores
   `valid: false`, `hard_fails: ["invalid_submission"]`, exit code 2;
   a cart with `order_attempted: true` scores hard fail
   `order_attempted`; `node scorer.js --help` prints usage.
