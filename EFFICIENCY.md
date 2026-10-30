# Efficiency benchmark (reported comparison only)

Efficiency is benchmarked as a reported comparison, never scored.
It never changes a score, never causes a hard fail, never passes or
fails a run, and never feeds the main leaderboard ranking (which
still ranks by completeness, then total, then date). A run can be
fast but churny, or slow but deliberate, and the comparison shows
both instead of collapsing them into one number.

## What it measures

Agent efficiency has two halves, and EvalCart already collects both:

- The agent card carries wall-clock time (`time_seconds`) and a cost
  estimate (`token_cost_estimate`) — coarse, agent-reported.
- The trace (`cart.trace`) carries the action side — what the agent
  actually did, in order, with relative timestamps (`at_ms`).

Together they answer: how much work, time, and cost did this run spend
to cover each line — and how does that compare with other traced runs
on the same task?

## Trace event types

The benchmark reads `cart.trace` directly and counts these types:

`search`, `view`, `add`, `remove`, `substitute`, `ask`, `undo`,
`checkout`, and `adjust`.

- `adjust`: `{ type: "adjust", product_id, qty, at_ms? }` — the agent
  changed the quantity of an already-added product. This type is new
  with the benchmark; the trace schema previously had no clean type
  for a quantity change.
- The storefront's `substitute_add` maps to `substitute`, the same
  mapping the trace behavior block uses.
- Storefront UI-only types (`oos_blocked`, `qty`, `aisle`, `review`,
  `submit`) are not counted. A trace that uses the storefront's
  legacy `qty` type for quantity changes does not contribute adjust
  counts; the canonical type is `adjust`.
- Unknown types and non-object entries are ignored, never fatal.

Fail-open: a missing, non-array, or over-cap trace (more than 2000
events), or a trace with no usable events, yields a null block, and
the cart scores exactly as before. Untraced runs get null, never
zeros.

## Metrics (per run, per task)

All rates use covered lines as the denominator, not expected lines —
a partial cart must not look efficient by covering less. Covered
lines come from the scorer's completeness count.

- `actions_per_line` = usable trace events / covered lines.
- Raw counts, reported alongside the rates so no ratio hides the
  underlying behavior: `adds`, `removes`, `adjusts`, `undos`,
  `searches`, plus `trace_events` (usable event total) and
  `covered_lines` (the denominator).
- `delete_rate` = removes / adds (null when there are no adds).
- `adjust_rate` = adjusts / covered lines.
- `undo_rate` = undos / buys, where buys = adds + substitutes (the
  same buys definition the trace behavior block uses).
- `search_rate` = searches / covered lines.
- `time_per_line` = card `time_seconds` / covered lines.
- `cost_per_line` = card `token_cost_estimate` / covered lines
  (agent-reported cost, labeled as such — the card carries no
  measured token count).
- `session_span_per_line` = (last `at_ms` − first `at_ms`) / 1000 /
  covered lines, in seconds. This is independent of the card's
  `time_seconds`; the two are reported side by side, not reconciled.

Any rate whose denominator is zero or whose input is missing or not
a number is null, not zero. A traced run that covered zero lines
still reports its raw counts, with null rates.

Deliberately NOT in v0: correction-vs-thrash classification. Telling
a careful correction apart from thrashing needs trace events to carry
which brief line they serve, which v0 events do not. V0 benchmarks
efficiency; intent classification is v1 work.

## Over time

The trace is ordered, so v0 already supports the time shape of a run,
not just its totals: session span (above), and event order (searches
before the first add vs searches scattered through the run, which the
trace behavior block already reports). Phase analysis (search phase
vs buy phase vs late corrections) is v1: it needs the line
attribution that correction classification needs.

## Comparison rules (the fairness part)

Efficiency is only compared within a task, never across tasks — line
counts, budgets, and constraints differ too much for cross-task
numbers to mean anything.

Eligibility for the comparison set, per task:

- The run has a trace (untraced runs get no efficiency numbers at
  all, labeled "no trace reported" — never a zero).
- The run has no hard fails. A run that failed the task did not do
  the job, so its efficiency is meaningless.
- The trace contains at least as many usable events as covered
  lines. Fewer events than lines means the trace cannot account for
  every line — it is provably incomplete, and including it would
  reward sparse reporting. This floor is the honesty guard: without
  it, an agent that reports three events looks more efficient than
  one that reports thirty.

Presentation, per task, among eligible traced runs: the median of
each metric, the run's value, and its percentile rank. No composite
efficiency score — the same "profile, not a single number" rule as
the rest of EvalCart.

- Median: the middle value, or the mean of the two middle values
  for an even-sized set.
- Percentile rank: the share of eligible values less than or equal
  to the run's value, times 100. A percentile here is positional,
  not a goodness score — a high percentile on actions per line
  means the run used more actions than most, not that it was worse.
- A run with a null value for a metric is excluded from that
  metric's median and percentiles, not from the other metrics.

## What this is not

- Not a score, not a hard fail, not a pass/fail. A high
  actions-per-line is not "bad" on its own — it can mean careful
  searching, or it can mean thrashing, and v0 does not pretend to
  tell those apart.
- Not a reason to minimize actions. If efficiency were scored,
  agents would skip searches and questions to look lean — the
  opposite of what the trace exists to surface. Reporting it as a
  comparison keeps the incentive honest.
- Not comparable between traced and untraced runs, and not a
  substitute for the main leaderboard.

## Implementation notes

- The scorer computes the block from the stored trace, the agent
  card, and the completeness count. It is a single self-contained
  function that reads `cart.trace` directly and does its own
  filtering, so it merges cleanly whether or not the trace behavior
  block has landed.
- The run report page shows the run's efficiency figures when it
  has a trace ("no trace reported" otherwise) and, for the run's
  task, the median and the run's percentile rank per metric among
  eligible runs. A run that is itself ineligible (hard fail, or a
  trace below the events floor) still shows its own figures, but
  its percentiles are not shown and it is not counted in the
  medians.
- The first real numbers come from the first traced live
  submissions. No worked example is included here on purpose:
  illustrative numbers from a made-up run would be mistaken for
  results.
