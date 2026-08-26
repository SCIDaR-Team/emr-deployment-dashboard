# Data queries for the assessment team

Two findings in `List of gaps and interventions per facility.csv` that need a
decision from whoever owns the sheet. **Neither blocks the build** — the
dashboard proceeds on the data exactly as it stands, and both are surfaced
honestly in the UI rather than silently corrected.

Raised from the review in [`../ASSESSMENT_DATA.md`](../ASSESSMENT_DATA.md).
Verified against the published sheet on 2026-08-26.

Affected facilities are listed in full, one CSV per query. The two sets do not
overlap.

---

## Query A — 55 facilities flagged with a connectivity gap that has no intervention

**File:** [`query-a-connectivity-gap-no-intervention.csv`](query-a-connectivity-gap-no-intervention.csv) (55 rows)

`Facility-connectivity gap` = **`Facility-managed connection at or above 5 Mbps
and consistently reliable`**

This is the only one of the 73 gap variants in the file with **no intervention
and no horizon** — its intervention and timing cells are empty and its cost cell
reads `₦0`. Every other gap value triggers at least one action.

Note that the `₦0` here is a real zero, not a blank: it is the correct total for
a gap that calls for nothing. That is a different thing from Query B below,
where the cell is genuinely empty because the price is unknown.

The reason it looks like a sheet error is that the condition describes a
facility that is *fine*: a facility-managed connection, at or above the 5 Mbps
threshold, consistently reliable. That is the target state for the other
connectivity gaps — three of them exist precisely to get a facility here:

| Gap value | Intervention | Cost |
|---|---|---|
| Individual connection at or above 5 Mbps | Move the account into the facility's name, connect to an EMR router | ₦40,000 |
| Individual/facility connection below 5 Mbps | Set up internet at ≥5 Mbps | ₦360,000 |
| Facility-managed ≥5 Mbps **with disruption** | Dedicated backup SIM and router | ₦52,000 |
| **Facility-managed ≥5 Mbps and consistently reliable** | **— none —** | **₦0** |

So the value reads like it belongs under `No gap` rather than in the gap column.

### What it does to the numbers today

It inflates `Total gaps` by exactly 55 nationally — one per affected facility —
and nothing else. Because it carries no intervention, it produces no horizon, so
it does not touch the critical/major counts and therefore does not affect the
deployment band. Confirmed: 9 of the 55 are still `Ready for EMR deployment`
while carrying it.

That is the tell. A gap that cannot change a band, cannot be costed and cannot
be acted on is not doing any work in the model.

### By state

| State | Facilities |
|---|---|
| Kano | 34 |
| Anambra | 9 |
| Jigawa | 5 |
| Rivers | 4 |
| Adamawa, Bauchi, Lagos | 1 each |

Concentrated in Kano — 34 of 55 — which is worth a look on its own, since it
suggests the classification rule fired differently there.

### The question

Should this value be `No gap`? If yes, national gaps drop 30,557 → 30,502 and
55 facilities lose one gap each. No cost changes either way.

### What the dashboard does meanwhile

Counts it as the sheet counts it, and shows it in the facility's gap list with
no intervention beneath it and no price — which is what the row actually says.

---

## Query B — 332 facilities with a critical, unpriced intervention

**File:** [`query-b-critical-intervention-no-cost.csv`](query-b-critical-intervention-no-cost.csv) (332 rows)

`Facility-connectivity gap` = **`No internet access or network coverage`**
→ *Check which connection works at the facility, then use one: FibreX, managed
mobile internet, fixed radio…*
→ **`Critical gap to fix before EMR deployment`** → **cost blank**

These 332 cells are the **only empty cost cells in the entire file**. Every
other intervention carries a figure, including the ones that are legitimately
₦0 (the two focal-person interventions, which cost nothing but attention — those
are written as `₦0`, not left blank). A blank here is therefore distinguishable
from a real zero, and reads as *not yet priced* rather than *free*.

The intervention text explains why: it is a **survey action, not a purchase**.
Nobody can price the fix until someone establishes which connection type is
even available at the site. The eventual cost is presumably one of the known
connectivity figures — ₦360,000 for a fixed connection, or ₦3,000,000 for
satellite if nothing terrestrial reaches — but which one is unknown per facility.

### What it does to the numbers today

All 332 are `Not Ready for EMR deployment`, correctly — the critical horizon
lands even though the cost does not. So the **bands are right and only the money
is missing**.

The gap in the money is material:

- These 332 facilities are priced at **₦1,744,998,903** for everything *else*
  they need.
- Their connectivity fix — the critical blocker, the thing that has to happen
  first — is priced at **₦0**.
- At ₦360,000 each the shortfall is ~₦120m; at ₦3,000,000 each it is ~₦996m.
  Against a national total of ₦16.26bn that is between 0.7% and 6.1%.

### By state

| State | Facilities | | State | Facilities |
|---|---|---|---|---|
| Akwa Ibom | 109 | | Imo | 15 |
| Lagos | 41 | | Jigawa | 12 |
| Niger | 40 | | Adamawa | 11 |
| Rivers | 30 | | Nasarawa | 7 |
| Anambra | 27 | | Bauchi | 5 |
| Kano | 19 | | | |
| Oyo | 16 | | | |

Akwa Ibom carries a third of them. Lagos having 41 is the surprising one — the
state is 86.2% immediately MTN-serviceable, the highest in the dataset, so 41
facilities with no internet access or coverage at all is worth confirming.

### The question

Is a price coming, or is ₦16.26bn to be presented as an explicitly partial
figure? If a per-facility survey is planned, its cost is also currently
unrepresented.

### What the dashboard does meanwhile

Totals the file exactly — ₦16,256,517,288, no imputation. The facility card
shows the intervention with `Not costed` where the amount goes, and any total
covering one of these 332 facilities is annotated so the reader knows the figure
excludes a critical item. Inventing a placeholder price would put an invented
number inside a total presented as sourced, which is the one thing this dataset
should never do.

---

## Not a query, but worth noting

**`Airtel nearest site name` and `Airtel serviceability` are empty in all 2,806
rows.** `Average Airtel site distance (m)` is populated. If the two empty
columns were meant to be filled, the mobile-network feasibility assessment is
currently MTN-only — which matters, because 1,549 facilities are classified
`Not currently serviceable` on MTN alone, and 731 of those get a ₦3,000,000
satellite intervention off the back of it.
