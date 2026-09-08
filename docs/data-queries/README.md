# Data queries for the assessment team

Findings in `Revised costing model and roadmap - List of gaps and interventions
per facility.csv` that need a decision from whoever owns the sheet. **None of
them blocks the build** — the dashboard proceeds on the data as it stands, and
each is either surfaced honestly in the UI or repaired by a named rule that says
so out loud.

Raised from the review in [`../ASSESSMENT_DATA.md`](../ASSESSMENT_DATA.md).
Verified against the revised sheet on 2026-09-08.

Affected facilities are listed in full, one CSV per query.

> **These replace the two queries raised against the superseded costing model,
> and both of those are closed.** The 55 facilities carrying a connectivity gap
> with no intervention no longer carry it — the condition is gone from the
> revised sheet. The 332 unpriced critical connectivity interventions are all
> priced now. What follows is new, and Query A is roughly seven times the size
> of the problem it replaces.

---

## Query A — 2,274 facilities with an unpriced device-maintenance action

**File:** [`query-a-unpriced-interventions.csv`](query-a-unpriced-interventions.csv) (2,274 rows)

`Device-maintenance gap` = one of three conditions
→ *Provide routine device maintenance and repair support.*
→ **`Minor action to complete during EMR deployment`** → **cost blank**

| Condition | Facilities |
|---|---:|
| No formal maintenance arrangement | 1,065 |
| Maintenance only when devices fail or as needed | 774 |
| No maintenance schedule reported | 435 |

These are the **only empty cost cells in the file**. Every other intervention
carries a figure, including the many that are legitimately `₦0` — those are
written as `₦0`, not left blank — so a blank here is distinguishable from a real
zero and reads as *not yet priced* rather than *free*.

In the superseded model this action was priced at ₦90,000, and Device-maintenance
came to ₦219,060,000 nationally. The price has been removed rather than changed,
which is what makes it a question rather than a revision.

### What it does to the numbers today

The action is `minor`, so it lands in no critical or major count and **the bands
are unaffected**. Only the money is missing — but it is missing across 81% of
the survey, in all twelve states:

| State | Facilities | | State | Facilities |
|---|---:|---|---|---:|
| Kano | 327 | | Niger | 180 |
| Anambra | 254 | | Jigawa | 174 |
| Akwa Ibom | 243 | | Lagos | 150 |
| Oyo | 235 | | Nasarawa | 142 |
| Imo | 217 | | Adamawa | 141 |
| Rivers | 137 | | Bauchi | 74 |

At the superseded ₦90,000 the shortfall would be ₦204,660,000 — 3.4% against the
revised national total of ₦6.02bn.

### The question

Is a price coming, or is ₦6.02bn to be presented as an explicitly partial
figure? The removal looks deliberate — device maintenance may now be intended as
a recurrent programme cost rather than a facility line — in which case the
sheet's silence is right and it is the *labelling* that needs to change.

### What the dashboard does meanwhile

Totals the file exactly, with no imputation. The Investment Plan's schedule
prints **unpriced** rather than a dash where the amount goes, so an unpriced
line cannot be misread as a ₦0 one, and the Total investment tile says how many
actions the figure excludes. Inventing a placeholder would put an invented
number inside a total presented as sourced.

---

## Query B — 8,796 gaps recorded with no action behind them

**File:** [`query-b-gaps-with-no-action.csv`](query-b-gaps-with-no-action.csv) (8,796 rows, 2,799 facilities)

Thirteen of the 71 conditions record a gap and trigger nothing at all — no
intervention, no horizon, no cost. Four whole gap areas are in this state: not
one of their conditions has an action.

| Gap area | Gap instances | Every condition actionless? |
|---|---:|---|
| Backup-connectivity | 2,529 | yes |
| Data-backup | 2,488 | yes |
| Backup-power | 2,088 | yes |
| Mobile-network feasibility | 1,531 | yes |
| Device-maintenance | 160 | no — only the two *adequate* conditions |

The last row is a different case from the four above it and is the least
troubling: *Formal quarterly maintenance* and *Formal annual maintenance*
describe facilities that are doing the thing, so an empty action is arguably
right. The sheet's own Minor count still counts them, which is why the ingest
carries a named offset for it.

The four areas above are the substantive question. Mobile-network feasibility is
the sharpest: 731 facilities are on `No serviceable mobile pathway`, which in the
superseded model triggered a ₦3,000,000 satellite install. Removing that charge
was right — most of those facilities were being charged for the same dish a
second time through `Facility-connectivity`, and 152 still carry both conditions
today. But the overlap was never total, and the facilities outside it have lost
a costed action without gaining one elsewhere.

### What it does to the numbers today

Gaps are counted; money is not. These four areas contribute 8,636 gap instances
and ₦0. Because they carry no horizon they cannot reach a critical or major
count, so **no facility's band moves on them either**. They are visible in the
gap list and invisible everywhere a decision gets made.

### The question

Three readings, and they need different responses:

1. **Deliberately de-scoped** — backup power and backup connectivity are not
   day-one requirements, so they are recorded and not funded. If so, the areas
   want a label saying *recorded, not costed*, so a planner does not read ₦0 as
   *free*.
2. **Moved to a shared budget** — the work is real but is state or provider
   level rather than per facility. If so, the shared figure belongs somewhere,
   even if not in this file.
3. **Dropped in the rewrite** — particularly the 579 mobile-network facilities
   above, where the de-duplication may have removed more than the duplicate.

### What the dashboard does meanwhile

Shows them as the sheet does: a gap in the facility's list, with no action
beneath it and no price. The Investment Plan's schedule says how many of its
lines are costed at ₦0 in the source, so a reader can see that two whole domains
sum to nothing by construction rather than by omission.

---

## Two cells the ingest repairs, and would rather not

Both are recoverable from the revised file alone and are applied as named,
scoped rules in `scripts/assessment-source.mjs`. Each is asserted to stay inside
the column it was verified against, so a future export that spreads either one
fails the build instead of being patched wider than it was checked.

**199 Backup-connectivity cells read `0`.** The column holds a sentence in every
other row; these hold the number zero, with a `₦0` cost like every other row in
an area that now funds nothing. Read as *no gap* — there is no condition here to
name. The 199 are all facilities the superseded sheet put on `No backup internet
option confirmed`.

**2,066 Physical service-point actions have no urgency.** The action and its
₦54,378 are present; `When action is needed` is blank, and it is blank in every
row that carries the action, so there is no surviving example to read the
intended value off. Read as `minor` — desks, chairs, fans and lockable doors are
fitted while the EMR goes in. The sheet's own Minor column does *not* count
them, which the ingest accounts for exactly rather than tolerating.

**`Total gaps` is one too high in all 2,806 rows.** Not repaired, because
nothing depends on it: the ingest counts the gap columns that fired and checks
its own count against the sheet's, allowing for this constant. It looks like a
formula covering a range one wider than intended. Worth fixing at source, since
any other reader of the sheet will take the column at face value.

---

## Not a query, but worth noting

**`Airtel nearest site name` and `Airtel serviceability` are empty in all 2,806
rows.** `Average Airtel site distance (m)` is populated for 2,798 of them. If
the two empty columns were meant to be filled, the mobile-network feasibility
assessment is MTN-only — which matters, because 1,549 facilities are classified
`Not currently serviceable` on MTN alone, and that classification is what puts
731 of them on `No serviceable mobile pathway`.
