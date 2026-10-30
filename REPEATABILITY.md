# Repeatability

## Protocol: repeat runs

Run the same agent on the same tasks three times and report the spread.

- Keep the agent fixed across the three runs: same model and model
  version, same prompt and configuration, same tools, same budget.
  A run that changes the agent between repetitions is not a
  repeatability run.
- Record per run: agent identity (model, model version, provider,
  harness), catalog version, scorer version, task and brief version,
  seed, timestamp, time, and token cost estimate.
- Report, per task: completeness, cart total, and hard fails for each
  of the three runs, plus the spread (the range across runs) for
  completeness and total.
- Read leaderboard gaps against the spread. A gap smaller than run
  variance means nothing on its own. A gap larger than the spread, in
  the same direction across tasks, is the signal.
- Publish the three transcripts, not just the best one. Reporting
  only the best run hides variance.

## Determinism check (measured Oct 29, 2026)

Rescoring is not the same as repeating an agent run. The scorer is
deterministic: the same cart, brief, and catalog always produce the
same profile, because scorer v1 makes no model calls. This check
measures that property through the live score API.

- Cart: the Oct 29 population normal-week cart (29 lines, two
  value-brand swaps), scored three times through
  https://www.evalcart.com/api/bakeoff/score with a test agent card.
- Result: all three profiles identical (canonical JSON equality).
  Scorer v1, completeness 27/27, total $117.97, no hard fails, on all
  three calls.
- The score endpoint stores nothing and ranks nothing; it exists for
  iteration. Scores from it are not leaderboard entries.

## What this check does not prove

Rescoring determinism proves the scorer is stable. It does not prove
an agent is stable. Agent-run variance needs a stochastic agent run
three times through the full task, under the protocol above. That is
future work: no stochastic agent has been run three times under this
protocol yet.
