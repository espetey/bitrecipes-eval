# EvalCart seasons

Seasons are how this benchmark stays honest as agents improve. A static
test saturates: once every agent passes it, it stops ranking and starts
gating. A season is a task set plus a date rule, not a snapshot, so the
test evolves without breaking comparability with the past.

## The rules

**Anchor task.** Normal week is the anchor. It is carried into every
season, unchanged, so a season-to-season comparison always has a common
task. If the anchor ever changes, that is a new benchmark, not a new
season, and the version number changes with it.

**What starts a season.** A new headliner task goes live. Season 2
started with tight week: the normal-week menu under a $120 budget, three
out-of-stock items, and a promo set. The headliner is the season's hard
task; the rest of the season's tasks are the ones that came before it.
Season 3's headliners are three depth tasks at once — size-week,
oos-hard-week, and promo-decoy-week — shipped together as one
expansion; the season begins with the first submission of any of them.

**Seasons are additive by default.** A season's task list is the previous
season's tasks plus the headliner. Dropping a task from a later season
is allowed, but it is a deliberate decision recorded in seasons.json,
not something that happens by forgetting to carry a task forward.

**The boundary derives from data, not config.** Season 2 begins at the
created_at of the first tight-week submission, ranked or not. Season 1
is everything before that. Season 3 begins at the created_at of the
first size-week, oos-hard-week, or promo-decoy-week submission,
ranked or not; Season 2 is everything from the tight-week boundary
up to that point. There is no deploy date to configure and
nothing to update at launch: until the headliner gets its first run,
everything is Season 1, and Season 2 shows empty. The leaderboard API
takes `?season=all|season-1|season-2|season-3` and filters entries by that
boundary.

**Boards freeze by construction.** Submissions are immutable: no entry
is ever edited, deleted, or moved. A season board therefore cannot
change after its season ends. No snapshotting step is needed, and none
should be added: a snapshot would be a second copy of the truth that
could drift from it.

**Cadence.** Monthly-ish rhythm, not faster than agents actually
improve. A season runs until the next headliner ships; it is not on a
fixed calendar. Shipping a headliner every two weeks because the
calendar says so, when agents have not moved, produces churn, not
signal. The right trigger for a new season is evidence the current
season stopped discriminating: headliner completeness clustering at
the top, or every serious agent clearing it.

## What seasons are not

**Seasons are not an anti-contamination mechanism.** Briefs are public
by design: inspectable testing is the point, and anyone can read the
test. An agent can therefore train on last season's briefs. Seasons
limit the damage (training on Season 1 does not ace Season 2's
headliner), but they do not prevent it. The anti-contamination
mechanism is the held-out brief set, which is private, never served,
and never published before its run.

**Seasons do not change scoring.** Ranking within a task is still
completeness first, with the lower cart total breaking ties, and hard
fails still only flag, never hide. A season changes which runs are
shown together, never what a run means.

## Starting a season (checklist)

1. Ship the headliner brief (and a promo set, if the week uses one)
   through the normal brief path: eval repo first, vendored into the
   app.
2. Add the season to seasons.json with its task list, anchor included.
3. Nothing else. The boundary appears when the headliner's first
   submission lands, and the leaderboard picker picks it up.
