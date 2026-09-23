# Data queries for the assessment team

Findings in the **"List of gaps and interventions"** sheet of `ERA Dashboard
dataset.xlsx` (exported to `List of gaps and interventions per facility.csv` by
`npm run data:gaps`) that need a decision from whoever owns the sheet. **None of
them blocks the build.** The dashboard proceeds on the data as it stands, and
each one is either shown in the UI or handled by a named rule in the ingest.

Verified against the sheet on 2026-09-23. Affected facilities are listed in
full, one CSV per query.

> These replace the queries raised against the earlier costing model. That
> model's unpriced connectivity blockers and its gaps with no action are gone
> from this sheet. Its unpriced device maintenance is still here, as part of
> Query A.

---

## Query A — 4,654 unpriced actions

**File:** [`query-a-unpriced-actions.csv`](query-a-unpriced-actions.csv)

| Action | Facilities | Urgency |
|---|---:|---|
| Provide routine device maintenance and repair support | 2,274 | Minor, before deployment |
| Assign the full-time HRO/M&E officer, or designate the OIC | 1,135 | Major or Moderate, before deployment |
| Confirm whether a lockable door is required (3,431 service points) | 1,245 | Minor, during deployment |

The first two leave the cost cell **blank**. The third writes ₦0, but its own
text says "before costing", so it is read as not yet priced rather than free.
Every other action carries a figure, including the many that are really ₦0.

**What the dashboard does.** It totals the sheet exactly and imputes nothing.
Unpriced lines print *unpriced* rather than ₦0, and every total that leaves one
out says so. The landing page's footer states the count.

**The question.** Is a price coming for any of the three? If device maintenance
and the focal person are meant to be recurrent or state-level costs rather than
facility lines, the blanks are right and only the labelling needs to change.

---

## Query B — 604 facilities costed for work under "No gap"

**File:** [`query-b-costed-without-a-gap.csv`](query-b-costed-without-a-gap.csv)

| Area | Facilities | Action |
|---|---:|---|
| Wiring | 380 | Install 1–5 socket points (₦3,000 each) |
| Physical service-point | 224 | Desks, chairs, fans, lockable-door checks |

The gap column reads **No gap**, yet the action and cost cells are filled. The
cost is part of the sheet's ₦7.26bn.

**What the dashboard does.** It keeps the cost, as agreed, under a condition
labelled **"No gap recorded"** in each area, and does not count it as a gap. So
totals reconcile to the sheet, while gap counts and "facilities with a gap"
exclude these rows.

**The question.** Are these real gaps whose condition was not written in, or
work that should not be costed here?

---

## Query C — 3 facilities whose severity column disagrees with their own actions

**File:** [`query-c-severity-column-disagrees.csv`](query-c-severity-column-disagrees.csv)

Each has a recorded service-point gap with a Minor action to complete during
deployment, yet `Highest Technical Infrastructure gap severity` reads **No gap
present**. About 2,000 other facilities with the same pattern read Minor.

**What the dashboard does.** It shows the sheet's own column. The ingest names
these three in `SEVERITY_EXCEPTIONS`, so a fourth stops the build instead of
passing unnoticed.

**The question.** Should these three read Minor gap present?

---

## Query D — 113 service-point gaps with no action

**File:** [`query-d-service-point-gaps-with-no-action.csv`](query-d-service-point-gaps-with-no-action.csv)

The gap is recorded (0%, 1–49% or 50–74% of service points meet the minimum),
but the action cell reads **No gap** and costs ₦0. Every other facility with
these conditions is costed for furniture or a door check.

**What the dashboard does.** It lists the gap with "No intervention recorded"
rather than hiding it or inventing a fix.

**The question.** Is an action missing, or is the gap column wrong?

---

## Query E — 131 Ready facilities with a Major gap in another domain

**File:** [`query-e-ready-with-a-major-gap-elsewhere.csv`](query-e-ready-with-a-major-gap-elsewhere.csv)

The sheet decides readiness from Technical Infrastructure alone. Workforce,
workflow and data-use actions are now graded Major, Moderate or Minor, and
every one of them is labelled "to fix *before* EMR deployment". Yet none of
them changes a facility's readiness. 131 facilities read **Ready for EMR
deployment** while carrying a Major gap elsewhere, most often the EMR focal
person or technical support.

**What the dashboard does.** It keeps the sheet's rule, and says so. Assessed
States shows each domain's highest gap severity beside readiness, with a note
that a Ready facility can still show a Major gap. The landing page's
explanation of readiness names Technical Infrastructure as what decides it.

**The question.** Is Technical-Infrastructure-only readiness the intended rule?
If Major workforce or workflow gaps should hold a facility back, the readiness
column needs to change. The dashboard will follow it.

---

## Query F — 4 of the 14 scenario packages disagree with the readiness rule

**File:** [`query-f-scenario-readiness-disagrees.csv`](query-f-scenario-readiness-disagrees.csv) (2,778 facility × package rows)

The facility sheet's closure-summary columns give each facility's readiness if
only one package of power and connectivity fixes were funded, and the Cost
summary totals them. Ten of the fourteen packages agree, in every row, with
the sheet's own readiness rule (any Major infrastructure fix left unfunded is
Not ready, any Moderate one Moderately ready). Four do not:

| Package | Workbook Ready | Rule gives | Facilities | What the sheet does |
|---|---:|---:|---:|---|
| Router only | 1,940 | **1,295** | 645 | Marks Ready facilities whose Moderate power gap is still open — 519 that need a full solar system, 126 a top-up |
| Full solar system only | 56 | **271** | 2,049 | Reads the wrong connectivity column, so 2,357 facilities come out Not ready |
| FibreX only | 330 | **253** | 77 | Lets FibreX replace the router at 175 "installation required" facilities here, but not in the FibreX combinations |
| Solar top-up + Network extension | 231 | **238** | 7 | Leaves the top-up open at 43 facilities in this package's power column |

**Also: the "Approximate investment required" column** prices only the
facilities whose need is *exactly* the package — for Solar top-up + Router,
the 112 that need both — while its "Additional facilities unlocked" counts
every facility the package makes Ready, including the 1,125 that needed only a
router. The two do not describe the same facilities.

**What the dashboard does.** The Investment Plan's "What unlocks readiness"
section recomputes every package from each facility's own actions with the
rule, and prices it as the package's fixes at the facilities it makes Ready —
so a figure and the facilities beside it always go together. The ingest checks
the ten consistent packages against the sheet in every row and pins the four
counts above, so a change to the workbook's scenarios stops the build.

**The question.** Are the four columns' formulas meant as they stand? In
particular, is "FibreX only" meant to include replacing routers?

---

## Also noted, no action needed from the dashboard

- **The Interventions_summary sheet is a draft.** Its total is ₦6,557,271,333
  against the Cost summary's ₦7,255,194,333. Socket, desk, chair and fan lines
  carry a ₦0 total, and wiring repair reads ₦167,228,000 where 1,034 × ₦388,000
  is ₦401,192,000. Its **quantities** all agree with the facility sheet. The
  dashboard builds from the facility sheet, which reconciles to the Cost
  summary to the naira.
- **The Minor summary column** (`Minor gaps (e.g. training or workflow
  support)`) counts some Technical Infrastructure actions and not others, with
  no rule that reproduces it. The Moderate, Major and Long-term columns
  reconcile exactly and are checked. The dashboard does not read the Minor
  column.
- **The Cost summary's readiness rule** still says "major or
  critical/foundational gaps". The facility sheet's own urgencies are Major and
  Moderate, and the dashboard uses those.
