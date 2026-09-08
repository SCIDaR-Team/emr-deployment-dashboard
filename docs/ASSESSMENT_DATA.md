# The assessment dataset

`Revised costing model and roadmap - List of gaps and interventions per
facility.csv` — 2,806 assessed facilities across 12 states, every gap they
carry, the intervention each gap calls for, when it is needed and what it costs.

This is the dataset behind `public/data/`. It replaced a synthetic stand-in,
whose generator and documentation were retired once the ingest landed — both are
in git history if the invented population is ever wanted again.

**Two sources.** The revised costing sheet is the primary one, verified on
2026-09-08. `ERA dataset_v4 (1).xlsx` — the raw ODK export the gaps CSV was
summarised from — is joined on top of it for the rural/urban setting and each
facility's coordinate. See
[Part 2 §7](#7-the-raw-odk-workbook--the-second-source).

> **This is the revised costing model, and it supersedes an earlier one.** Same
> 2,806 facilities, same geography, same four domain readings — and a different
> answer to almost every question about money. The national total fell from
> ₦16.26bn to ₦6.02bn, six of the twenty gap areas stopped being funded, the
> second overall reading was withdrawn, and one condition can now be costed more
> than one way. The superseded file is gone from the repository; where this doc
> refers to it, it is explaining why something is shaped the way it is, never
> sourcing a figure from it.

---

## Part 1 — What is in the file

### Shape

A four-row header over 2,806 data rows and 113 columns:

| Row | Contents |
|---|---|
| 1 | Title — `FACILITY GAPS, INTERVENTIONS AND INDICATIVE COSTS` |
| 2 | Scope note — optional actions are labelled; shared state/provider network-expansion costs are **excluded** |
| 3 | Domain band — sparse, forward-fill: `Facility and readiness overview`, `Technical Infrastructure`, `Workforce Capacity`, `Workflow and Transition`, `Data Use and Reporting`, `Summary` |
| 4 | Column headers — **not unique**; `Intervention 1`, `When action is needed` and `Cost 1 (₦)` repeat 20+ times and are only meaningful relative to the gap column they follow |

That last point is the single most important parsing fact in the file. **A
header-name lookup will silently read the wrong column.** Every parser must work
positionally: find the columns ending in `" gap"`, then walk forward in strides
of three while the header reads `Intervention N`.

One row per facility. 2,806 rows, 2,806 distinct UUIDs — no duplicates.

### 1. Geography and identity — columns 0–6

| Col | Field | Notes |
|---|---|---|
| 0 | Facility UUID | v4 UUID, unique |
| 1 | State | snake_case slug — 12 values |
| 2 | LGA | snake_case slug — 305 distinct (state, LGA) pairs |
| 3 | Facility name | snake_case slug, e.g. `umunze_maternal_and_child_health` — needs un-slugging for display |
| 4 | Facility group | `BHCPF` 2,525 · `Non-BHCPF` 281 |
| 5 | Functionality | `Functional L1` 1,695 · `Functional L2` 585 · `Partially Functional` 526 |
| 6 | Zone | 6 geopolitical zones |

Facilities per state:

| State | Facilities | LGAs |
|---|---|---|
| kano | 438 | 44 |
| anambra | 275 | 21 |
| jigawa | 267 | 27 |
| oyo | 257 | 33 |
| akwa_ibom | 255 | 31 |
| niger | 253 | 25 |
| imo | 227 | 27 |
| adamawa | 200 | 21 |
| bauchi | 179 | 20 |
| lagos | 159 | 20 |
| nasarawa | 152 | 13 |
| rivers | 144 | 23 |

Zones: north_west 705 · south_east 502 · south_west 416 · north_central 405 ·
south_south 399 · north_east 379.

### 2. Readiness — columns 7–11

Five band columns, three levels each (`Not Ready` / `Moderately Ready` /
`Ready`). No nulls anywhere — every facility carries every band.

| Col | Field | Not | Moderate | Ready |
|---|---|---|---|---|
| 7 | Overall readiness for EMR **deployment** | 744 | 1,892 | 170 |
| 8 | Technical infrastructure | 744 | 1,892 | 170 |
| 9 | Workforce | 1,013 | 592 | 1,201 |
| 10 | Workflow | 2,393 | 185 | 228 |
| 11 | Data use | 349 | 350 | 2,107 |

**One overall reading, not two.** The superseded sheet carried a sixth column,
`Overall readiness for EMR use`, and the dashboard reported the pair because the
distance between them was the finding. It has been withdrawn. Everything from
`FacilitySummary` up now carries a single `deploymentBand`.

**Two derivations hold exactly, in all 2,806 rows**, and both are asserted by
`validateRow`:

1. **Overall readiness is a copy of technical infrastructure readiness.**
   Identical in every row — not the minimum of the four domains. Infrastructure
   is treated as the binding constraint, full stop. This was true of the
   withdrawn *use* column before; what the revision did was bring the deployment
   band onto the same footing, which is what collapsed the two into one.

2. **Overall readiness is also a function of the summary gap counts:**

   ```
   critical > 0                → Not Ready for EMR deployment         (744)
   critical = 0 and major > 0  → Moderately Ready for EMR deployment (1,892)
   critical = 0 and major = 0  → Ready for EMR deployment              (170)
   ```

   Zero exceptions. The two derivations agreeing is the whole reason one column
   could go: blockers and infrastructure quality now answer the same question.

The revision moved this distribution a long way. Not ready nearly halved, Ready
fell to a sixth of what it was, and two thirds of the survey is now Moderately
ready — a consequence of the re-pricing, since the band is read off the horizons
of the actions a facility's gaps trigger and many of those actions changed
urgency or disappeared.

### 3. Gaps and interventions — columns 12–105

Four domains. Within each domain, a repeating block:

```
<Sub-domain> gap | Intervention 1 | When action is needed | Cost 1 (₦) [| Intervention 2 | When … | Cost 2 (₦)]
```

**20 gap columns** — the **gap areas**, the level between a domain and a gap.
Each is a real entity in the model now (`GAP_AREAS`), and the Gap area filter
offers exactly these twenty, scoped by the Domain control. Every area, every
condition inside it and the facility counts behind both are written out in
[GAP_TAXONOMY.md](GAP_TAXONOMY.md).

| Domain | Gap area columns |
|---|---|
| Technical Infrastructure (12–57) | Power · Wiring · Facility-connectivity · Device-sufficiency · Backup-power · Backup-connectivity · Device-maintenance · Data-backup · Mobile-network feasibility |
| Workforce Capacity (59–74) | Digital-competency · EMR/Data focal-person · Training · Technical-support |
| Workflow and Transition (76–91) | Duplicate-entry · Workflow-bottleneck · Physical service-point · Staff-willingness support |
| Data Use and Reporting (93–104) | Routine-data-use · Data-validation · Report-review support |

Each gap column holds either `No gap` or **a named condition** — the gap is
ordinal, not boolean. `Power gap` for instance carries one of:

- `No functional electricity source or 0 hours/day` (571)
- `Estimated combined power coverage is 5–8 hours/day` (382)
- `Estimated combined power coverage is 1–4 hours/day` (375)

Across the 20 columns there are **71 distinct (column, value) conditions** —
this is the real gap catalogue, extracted rather than hand-maintained.

**A condition no longer implies one set of interventions.** It used to: every
row carrying a given gap value fired the same actions at the same prices, which
is what made the extraction lossless in one step. The revised costing model broke
that deliberately, and four conditions now carry **variants**:

| Condition | Facilities | Ways it is costed |
|---|---:|---:|
| Power: No functional electricity source or 0 hours/day | 571 | 2 |
| Power: Estimated combined power coverage is 1–4 hours/day | 375 | 4 |
| Power: Estimated combined power coverage is 5–8 hours/day | 382 | 4 |
| Backup-power: Backup is partially functional | 217 | 2 |

The choice is real work rather than an inconsistency: a facility already on the
grid is not sold a ₦500,000 connection to it, and a facility with some supply
draws a ₦1,200,000 top-up where one with none draws the full ₦3,000,000 install.

Three consequences run all the way to the UI. **A facility is costed from its own
row**, never from the catalogue. **`gapCostNGN` takes a variant**, carried per
facility in `FacilitySummary.gapVariants` — sparse, since 67 of the 71 conditions
have only one. And **a population cost cannot be a count times a price**; it has
to be summed as the facilities are walked.

What the extraction still refuses is a condition whose variants disagree about
**severity**, since severity is what the band is computed from. That holds for
all 71 today.

24 distinct (label, horizon, cost) interventions. Only `Power gap` has a second
intervention slot; every other area has one.

**Costs are flat per intervention, not per quantity.** `Give each place where
staff enter EMR data the number of tablets it is missing` is ₦233,333 in all
1,769 rows that carry it. Nothing in this file is multiplied by a service-point
or device count — which is a departure from the synthetic model's `unitBasis`
machinery, and simplifies it away entirely.

### 4. Horizons — the "When action is needed" columns

Four values, and they carry the severity:

| Value | Instances |
|---|---|
| Minor action to complete during EMR deployment | 17,715 |
| Major gap to fix before EMR deployment | 2,970 |
| Critical gap to fix before EMR deployment | 879 |
| Optional long-term improvement after EMR deployment | 753 |

This is the file's severity model. There is no separate severity column — a
gap's weight *is* the horizon of the intervention it triggers.

The counts above are the ingest's, and the Minor one differs from the sheet's own
Minor column by a known, exact amount. Two artefacts pull opposite ways: the
sheet leaves the urgency cell blank on all 2,066 Physical service-point actions
and does not count them, where the ingest reads the blank as `minor`; and 160
Device-maintenance rows carry an urgency against an empty intervention cell,
which the sheet counts and the ingest cannot. `validateRow` asserts the identity
rather than allowing a tolerance. See
[`data-queries/README.md`](data-queries/README.md).

### 5. Network measurement — columns 47–53

Sitting inside the Technical Infrastructure block, ahead of the mobile-network
feasibility gap that is derived from them:

| Col | Field | State |
|---|---|---|
| 47 | MTN base station | Populated — 863 distinct sites |
| 48 | MTN base-station distance (km) | Populated · 20 `Not available` |
| 49 | MTN serviceability | `Not currently serviceable` 1,549 · `Immediately serviceable` 812 · `Serviceable with network extension` 423 · `Not available` 20 · blank 2 |
| 50 | MTN 4G signal | `Excellent` 1,700 · `Good` 676 · `no signal` 408 · `Not available` 20 · blank 2 |
| 51 | Average Airtel site distance (m) | Populated · 8 without a reading |
| 52 | Airtel nearest site name | **Empty in all 2,806 rows** |
| 53 | Airtel serviceability | **Empty in all 2,806 rows** |

MTN serviceability aggregates cleanly to state level and is a genuine measure
for the pane — Lagos is 86.2% immediately serviceable, Jigawa 7.9%, Bauchi 8.4%.

### 6. Summary — columns 107–113

| Col | Field | Notes |
|---|---|---|
| 106 | Total gaps | 3–18 per facility, mean 10.8, **30,200 total**. No facility has zero. |
| 107 | Minor gaps | Count of *minor* interventions |
| 108 | Major gaps | Count of *major* interventions |
| 109 | Critical/foundational gaps | Count of *critical* interventions |
| 110 | Long-term gaps | Count of *long-term* interventions |
| 111 | Typical daily client load | `<10` 797 · `11-30` 1,278 · `31-50` 442 · `>50` 289 |
| 112 | Total facility intervention cost (₦) | ₦0 – ₦7,642,378 · median ₦1,254,378 |

**Careful: 107–110 count interventions, not gaps.** They do not sum to column
106, because `Power gap` fires two interventions on two different horizons from
one gap while thirteen conditions fire none at all.

**Column 106 is one too high in every row.** Not in some rows — in all 2,806,
by exactly one, plus one more in the 199 facilities whose Backup-connectivity
cell reads `0` and is read here as no gap. It looks like a formula covering a
range one wider than intended. `validateRow` asserts the identity rather than
tolerating a range, so the day it stops being constant the build stops.

So the page has two legitimate but different denominators — "30,200 gaps" and
"22,157 interventions" — and must not mix them in one sentence.

### 7. Money

Costs roll up cleanly, with one ₦1 rounding artefact in the sheet:

- each domain cost column = sum of its own `Cost N` cells — **exact, all 2,806 rows**
- `Total facility intervention cost` = sum of the four domain cost columns —
  exact in 1,543 rows, **₦1 high in the other 1,263**

**The ₦1.** Two interventions have fractional true values: the device top-up at
₦233,333 (₦700,000 ÷ 3) and the service-point kit at ₦54,378. The sheet rounds
each domain subtotal for display but computes the grand total at full precision
and rounds once. A facility carrying *both* fractions loses them from the
subtotals and keeps them in the grand total — so the two differ by exactly ₦1,
in precisely the 1,263 facilities that carry both, and nowhere else.

₦1,263 nationally against ₦6.02bn: 0.00002%. It is noted rather than fixed
because there is nothing to fix — the underlying figures are fractional and the
sheet is rounding them, which is the correct thing for it to do.

**What the dashboard sums.** The cost *cells*, not the grand total. The cells
are what the gap catalogue is built from, and a facility's cost has to be the
sum of the gaps shown beside it or the card contradicts itself. The national
total is therefore ₦6,016,283,025 here against the sheet's ₦6,016,284,288 — the
same ₦1,263. `ingest-assessment.mjs` tolerates exactly ₦1 per facility and
totals the drift in its build report, so a rounding artefact cannot quietly grow
into something that is not rounding.

**Two whole domains now cost nothing.** Every condition in Workforce Capacity
and Data Use & Reporting still fires an action, and every one of those actions
is priced ₦0. This is the revised model's largest single move, and it is a real
₦0 rather than a blank — the work is recorded and not costed here. A further
2,274 device-maintenance actions carry no price at all, which is a different
claim again and the subject of
[Query A](data-queries/README.md#query-a--2274-facilities-with-an-unpriced-device-maintenance-action).

| Domain | Total | Share |
|---|---|---|
| Technical infrastructure | ₦5,903,938,077 | 98.1% |
| Workflow and transition | ₦112,344,948 | 1.9% |
| Workforce capacity | ₦0 | — |
| Data use and reporting | ₦0 | — |
| **National total** | **₦6,016,283,025** | |

By state, and this is the ranking the programme allocates against:

| State | Total | Per facility | % Not ready to deploy |
|---|---|---|---|
| Kano | ₦910,168,402 | ₦2,078,010 | 26.3% |
| Akwa Ibom | ₦875,928,538 | ₦3,435,014 | 49.8% |
| Niger | ₦787,072,533 | ₦3,110,959 | 39.1% |
| Imo | ₦665,867,837 | ₦2,933,338 | 34.8% |
| Anambra | ₦522,163,893 | ₦1,898,778 | 20.7% |
| Adamawa | ₦483,622,065 | ₦2,418,110 | 30.0% |
| Oyo | ₦378,638,824 | ₦1,473,303 | 15.2% |
| Bauchi | ₦316,971,749 | ₦1,770,792 | 27.4% |
| Nasarawa | ₦299,394,929 | ₦1,969,703 | 19.7% |
| Jigawa | ₦283,892,839 | ₦1,063,269 | 13.1% |
| Rivers | ₦255,231,702 | ₦1,772,442 | 30.6% |
| Lagos | ₦237,329,714 | ₦1,492,640 | 6.3% |

Kano is the largest bill and Akwa Ibom the most expensive facility-for-facility —
two different findings, and the pane shows both.

### 8. Commonest gaps nationally

| Prevalence | Gap |
|---|---|
| 69.0% | Backup-connectivity: no backup internet option confirmed |
| 68.1% | Data-backup: no data-backup capability reported |
| 54.3% | Physical service-point: 0% of service points meet minimum conditions |
| 43.9% | Facility-connectivity: individual connection at or above 5 Mbps |
| 39.7% | Device-sufficiency: usable devices cover <75% of requirement |
| 38.0% | Device-maintenance: no formal maintenance arrangement |
| 36.8% | Duplicate-entry: ≥75% of documenting service points affected |
| 34.5% | Technical-support: no defined technical-support process |

Four of the top eight sit in areas the revised model no longer funds. The
commonest gap in the country costs nothing to close, on paper.

---

## Part 2 — What is *not* in the file

None of these blocks the build. Each is settled below.

### 1. No coordinates — the facility *points layer* degrades, the page does not

There is no latitude or longitude column.

This is narrower than it first looks. Assessed States is a map *and* a pane, and
the pane is where this dataset actually lands — it reads a `FacilitySummary[]`
and touches no coordinate. Everything it shows survives: band distributions, gap
counts and costs at every level, the facility card, the state and LGA lists, all
of the filter row, and the state and LGA choropleths, which are painted from
boundary polygons and not from facility positions.

What a missing coordinate costs is exactly one thing: **the dots inside an LGA.**

And the codebase already handles it. `projectFacilities`
([facilityPoints.ts:47](../src/components/map/facilityPoints.ts:47)) filters to
finite coordinates before projecting, with the reasoning already written down —
a facility with no coordinate "belongs in the pane's list rather than plotted at
the origin of the map, which is in the Gulf of Guinea". `LGAFacilityMap`
resolves its selection out of that same projected array, so a coordinate-less
facility yields no point, no camera fly and no coordinate card, while remaining
fully selectable from the pane's list, which is what writes the URL anyway.

So the drill-down keeps working to all four levels. At the LGA level the map
shows the boundary and the pane lists the facilities inside it; selecting one
opens its card. The dots come back the day a GPS source arrives, with no other
change.

**Decision:** ship without coordinates. Make `lat`/`lon` nullable, drop the
Coordinates row from the facility card when absent, and never invent a position.
The synthetic generator's LGA-bounding-box coordinates do not carry over — an
invented position presented as a surveyed one is the one error this dataset
cannot afford.

### 2. No leadership & governance — dropped from the model

The domain has no column in this file, because it is not assessed at facility
level.

**Decision:** leave it out, exactly as the data leaves it out. Remove
`leadership_governance` from `ThemeId`, `GapDomainId` and `GAP_DOMAINS`; drop
`DeploymentPhase.stateGaps`; drop the `picked.includes('leadership_governance')`
branch in `FacilityBlocks` and the "state level" excusing note that goes with
it. Four domains, all of them facility-level, all of them carrying a band and
gaps from this file.

This simplifies more than it removes. A good deal of machinery in the current
model exists solely to hold one state-level domain apart from four
facility-level ones — the `FacilityThemeId = Exclude<ThemeId, …>` split, the
`stateGaps` field, the widened `GapDomainId` in the pane. All of it goes.

### 3. UUIDs do not join to anything the app currently holds

Zero overlap between the CSV's UUIDs and `public/data/facilities-summary.json` —
the latter is synthetic (`f-00001`…). Expected, but it means this is a
replacement, not a merge, and every facility ID in a saved URL or bookmark
changes.

### 4. 25 of 305 LGA slugs do not match the boundary layer

229 facilities
affected. All 25 resolve unambiguously — I checked each one against
`public/geo/lga-index.json`:

| CSV slug | Boundary slug | | CSV slug | Boundary slug |
|---|---|---|---|---|
| jigawa/birnin_kudu | birni_kudu | | jigawa/birniwa | biriniwa |
| rivers/obioakpor | obia_akpor | | rivers/ogubolo | ogu_bolo |
| rivers/ogbaegbemandoni | ogba_egbema_ndoni | | rivers/abuaodual | abua_odual |
| rivers/opobonkoro | opobo_nkoro | | rivers/omuma | omumma |
| kano/kano_minicipal_council | kano_municipal | | kano/danbatta | dambatta |
| kano/nassarawa | nasarawa | | kano/garun_malam | garum_mallam |
| oyo/atisbo | atigbo | | oyo/afijo | afijio |
| lagos/oshodi | oshodi_isolo | | lagos/ifako_ijaiye | ifako_ijaye |
| bauchi/itasgadau | itas_gadau | | bauchi/jamaare | jama_are |
| bauchi/dambam | damban | | akwa_ibom/ndung_uko | udung_uko |
| akwa_ibom/ibesikpoasutan | ibesikpo_asutan | | akwa_ibom/urueoffongoruko | urue_offong_oruko |
| imo/ohajiegbema | ohaji_egbema | | imo/onuimo | unuimo |
| niger/munya | muya | | | |

A checked-in alias table plus separator-insensitive normalisation closes the
join. The build must **fail loudly** on any unmatched slug rather than dropping
facilities — a silent drop is a state quietly losing 13 facilities and its cost
total going with them.

### 5 & 6. Two data queries, and two cells repaired

Documented for the assessment team in
[`data-queries/README.md`](data-queries/README.md), with the affected facilities
listed in full, one CSV per query.

> The two queries raised against the superseded costing model are both **closed**.
> The 55 facilities carrying a connectivity gap with no intervention no longer
> carry it — the condition is gone. The 332 unpriced critical connectivity
> interventions are all priced. What follows is new.

**Query A — 2,274 facilities have an unpriced device-maintenance action.**
Three Device-maintenance conditions all fire *Provide routine device maintenance
and repair support* at `minor` with the cost cell **blank**. These are the only
empty cost cells in the file; genuine zeroes elsewhere are written `₦0`, so a
blank is distinguishable from free and reads as *not yet priced*. The action is
minor, so no band moves — only the money is missing, across 81% of the survey
and all twelve states. The superseded model priced this at ₦90,000, which would
put the shortfall at ₦204,660,000 against a national total of ₦6.02bn.

**Query B — 8,796 gaps are recorded with no action behind them.** Thirteen of
the 71 conditions trigger nothing at all: no intervention, no horizon, no cost.
Four whole areas are in this state — Backup-connectivity, Data-backup,
Backup-power and Mobile-network feasibility — plus the two Device-maintenance
conditions that describe a facility already maintaining its devices. Carrying no
horizon, none of them can move a band either. They are visible in the gap list
and invisible everywhere a decision gets made.

**Decision:** build on the data as it stands. No imputation, no placeholder
prices.

- Query A's action shows **unpriced** where the amount goes — a word, not a
  dash, so it cannot be read as a ₦0 — and the Investment Plan's total tile says
  how many actions the figure excludes.
- Query B's gaps are counted as the sheet counts them and shown with no action
  beneath them. The schedule says how many of its lines are costed at ₦0, so two
  domains summing to nothing reads as a decision rather than an omission.

**Two cells are repaired, by named rules in `scripts/assessment-source.mjs`.**
Both are recoverable from this file alone, and each is asserted to stay inside
the column it was verified against, so an export that spreads either one fails
the build instead of being patched wider than it was checked:

- **199 Backup-connectivity cells read `0`** where every other row holds a
  sentence. Their cost is `₦0`, like every row in an area that funds nothing.
  Read as *no gap*.
- **2,066 Physical service-point actions have a blank urgency.** The action and
  its ₦54,378 are present; the urgency is blank in every row that carries the
  action, so there is no surviving example to read the intended value off. Read
  as `minor` — desks, chairs, fans and lockable doors are fitted while the EMR
  goes in.

Inventing a placeholder price would put a made-up number inside a total
presented as sourced. Rendering the absence is the honest alternative and costs
one label.

### 7. The raw ODK workbook — the second source

`ERA dataset_v4 (1).xlsx`, sheet `Raw data with readiness level` — one row per
facility, 2,804 rows, the survey export the gaps CSV was summarised from, so it
holds everything the instrument collected.

**It is not committed.** 37 MB against a repo whose next largest file is 7.5 MB,
and it changes rarely. `public/data/` *is* committed, so a clone that only
builds and runs the app never needs it; only `npm run data:ingest` does, and it
names the path when the file is absent.

**Only `Geography` and the coordinate are read from it.** The workbook also
carries service points, staff counts, devices, connectivity transport media and
every per-question response; each of those is a decision about what the page
should say rather than a free upgrade, so they are taken one at a time.

| Excel | Field | State |
|---|---|---|
| L | Latitude | Populated |
| M | Longitude | Populated |
| N | Altitude | Populated |
| O | Location accuracy | Populated (~4.5 m) |
| S | Geography | `rural` 2,203 · `urban` 601 |

**The coordinate arrived late, and the reason is worth keeping.** An earlier
export — `Raw data with readiness level.xlsx`, since dropped — had these same
columns in the same positions with **column L empty in 2,805 of its 2,807
rows**. A longitude without a latitude is a meridian rather than a place, so
`lat`/`lon` were null and the map plotted nothing.

Column M was checked against known state positions rather than trusted by its
label, because Nigeria's latitude and longitude ranges overlap: it tracked
longitude in all twelve states — Lagos 2.71–4.13 against a true longitude range
of 3.1–4.4 and a latitude range of 6.4–6.7 — confirming the label was right and
latitude really was absent. The field had been collected: an accuracy of 4.5 m
in every row means the device held a lock. It was the export that lost it.

The ERA workbook carries the same sheet with column L populated. 2,804 of 2,806
facilities now plot; the two that do not are the pair that matches no workbook
row at all. Verified by state centroid — Lagos 6.54/3.40, Kano 11.88/8.49,
Rivers 4.85/7.02. `parseFacilityWorkbook` guards the rest: a coordinate outside
Nigeria throws rather than drops, because a blank is a facility whose GPS did
not record while a point in the Atlantic is a column that has moved.

#### The join

**Primary key: UUID.** 2,804 of 2,806 facilities match directly.

**Fallback: `state/lga/name`.** Two facilities — `Opeki Primary Health Centre`
(Lagos, Alimosho) and `Saja Isaleora Primary Health Centre` (Oyo, Ogbomosho
North) — carry `1.23E+19` and `9.88E+18` where a UUID should be. Spreadsheet
auto-formatting turned a long numeric id into scientific notation, and it
happened **in both files**, so neither can be matched on id. The fallback key is
unique across all 2,807 workbook rows (zero collisions, asserted at build time),
and it recovers both: Opeki urban, Saja Isaleora rural.

A third query for the assessment team, then: those two facilities have no usable
identifier in either file. Nothing downstream is wrong today, but any future
join on id will drop them.

**Result: 2,205 rural, 601 urban, 0 unmatched.** Coverage is reported in the
build output rather than asserted — a hard floor would need an arbitrary
threshold, whereas a number that moves shows up in the committed diff.

### Fields the app has that this file does not

`servicePoints`, `staffCount`, `deviceCount`, `deviceShortfall`, and the
`CoverageMeasures` figures (`networkAirtelPct`, `gridConnectionPct`). All were
invented by the generator.

`geography` is no longer among them — it comes from the raw ODK workbook (§7).
The service-point, staff and device counts are *also* in that workbook and could
be recovered the same way, one deliberate decision at a time.

Some are recoverable in a different form — device shortfall is *implied* by the
device-sufficiency gap band (`<75%`, `75–99%`), MTN coverage is derivable from
column 50, `Typical daily client load` is a genuine new field that partly
replaces `staffCount` as a size proxy. Grid connection and Airtel coverage are
not recoverable at all.

The honest move is to drop the fields that have no source rather than carry
invented numbers next to real ones on the same card.

**Since superseded:** all three `CoverageMeasures` network/power fields —
`networkMtnPct` included — were removed outright. The two that had no source
printed a dash on every area, and the one that did answers a facility-level
question National Coverage is not asking. Per-facility `mtnServiceability` is
unaffected.

---

## Part 3 — The plan

### Principle

Replace the generator with an **ETL that reads the sheet and emits the same JSON
contract**. Every component already reads through `DataSource` →
`public/data/*.json`, so if the ETL emits the same shapes, the map, the filters,
the pane and the scope resolver keep working. The changes to the app itself are
then limited to the places where the real data says something the synthetic data
could not.

Do not fetch the sheet at runtime. Two reasons, both measured:

- **Speed.** 7.8 MB at ~80 KB/s from this endpoint — roughly 100 seconds on a
  good connection. The app currently paints from a 2 MB precomputed JSON.
- **CORS.** The published URL answers `307` to
  `doc-0s-1c-sheets.googleusercontent.com`, and **the redirect response carries
  no `Access-Control-Allow-Origin`**. A browser `fetch()` fails on the first
  hop. (The final hop does send `ACAO: *`, which is why `curl` succeeds and a
  browser would not.)

Build-time ingest keeps the sheet as the editable source of truth *and* keeps
the app fast: re-run the ETL when the sheet changes, commit the diff.

### Step 1 — `scripts/ingest-assessment.mjs` ✅ built

`npm run data:ingest`. The dummy generator stays in place for now so the two can
be compared; nothing calls it.

Two files, split so the parts that make *claims about the source* can be tested
without running a build:

| | |
|---|---|
| `scripts/assessment-source.mjs` | Parsing, geography reconciliation, catalogue extraction. Pure — bytes in, structures out. |
| `scripts/ingest-assessment.mjs` | The build: fetch, roll-up, validation, emit. |
| `scripts/assessment-source.test.mjs` | 16 tests over the first, against a fixture that reproduces the duplicate headers. |

1. **Source.** Reads the committed CSV by default; `--fetch` re-downloads from
   the sheet and caches to `scripts/source-data/assessment.csv`; `--local <path>`
   for anything else. The URL is read from `.env` — by name if someone adds
   `ASSESSMENT_CSV_URL`, otherwise recognised by shape, since the current key
   (`facility gaps and intervention`) has spaces and never reaches
   `process.env`. A fetch shorter than 1 MB is rejected rather than cached: a
   Google error page is HTML and small, and caching one over a good CSV is worse
   than failing.
2. **Parse positionally.** Forward-fill row 3 for domains, find `" gap"` columns,
   walk `Intervention N` triples. No column is ever looked up by header name.
3. **Normalise** state/LGA/facility slugs and apply the alias table; **throw** on
   any unmatched (state, LGA) pair.
4. **Extract the catalogue** — 71 conditions and the variants each is costed
   under, asserting severity agreement as it goes and naming both disagreeing
   facilities if it ever breaks.
5. **Validate**, per row, six relationships (below).
6. **Emit** the five JSON files plus `src/lib/gapCatalogue.ts` and
   `src/lib/nationalSplit.ts`.

**The six assertions**, all passing on 2,806 of 2,806 rows:

| | Check |
|---|---|
| 1 | `Total gaps` = the gap columns that fired, plus the sheet's constant overcount |
| 2 | each domain subtotal = the sum of that facility's own cost cells |
| 3 | facility total = the four subtotals, within the sheet's ₦1 rounding |
| 4 | columns 107–110 = the per-horizon action counts, allowing for the two named artefacts |
| 5 | overall band = the critical/major rule |
| 6 | overall band = the technical infrastructure band |

Assertions 1 and 4 carry an offset rather than a tolerance. Each is a computed
identity — the overcount is +1 everywhere and +2 where Backup-connectivity reads
`0`; the Minor offset is −1 per Physical service-point action and +1 per
actionless Device-maintenance row — so the checks stay checks. Widen either into
a range and the drift they exist to catch walks straight through.

Plus one cross-source check outside the sheet: **every facility's zone column
agrees with the boundary layer's** for the state it names. Free, and a real
signal if a facility is ever filed under the wrong state. It passes on all
2,806.

Assertion 3 is the only one carrying a true tolerance, and it is exactly ₦1 —
see Part 1 §7. The drift is totalled in the build report rather than swallowed, so a
rounding artefact cannot quietly grow into something that is not rounding.

**Build output**, for reference:

```
  facilities        2,806        gap variants      71
  states assessed   12           gap instances     30,200
  LGAs assessed     305          unpriced actions  2,274
  total investment  ₦6,016,283,025
  sheet rounding    ₦1,263 over 1,263 facilities

  readiness         not ready   moderately       ready
  EMR deployment         744         1892         170
```

### Step 2 — the catalogue

`scripts/gap-catalogue.mjs` becomes **derived, not declared**. Its prevalence
weights existed only to drive the random generator and have no meaning against
real data.

Gap id: `<sub_domain>__<value_slug>`, e.g.
`power__no_functional_electricity_source_or_0_hours_day`. Stable across runs as
long as the sheet's wording is stable — and if the wording changes, the id
changes, which is correct: it is a different gap.

Per gap: `domain`, `area` (the gap area id, from the gap column), `label` (the
value text), `horizon` and `costNGN` (from its interventions), and
`interventions[]`. The area's own label lives once, on `GAP_AREA_BY_ID`, so
nothing downstream renders a sliced column header.

`unitBasis` and `gapCostNGN(gap, facility)` collapse to a flat `costNGN`, since
nothing in the file is quantity-scaled. That removes a whole layer of machinery
from `gapCatalogue.ts` and from `AssessmentPane`.

**Severity** maps from horizon: critical/major → `blocking`, minor/long-term →
`partial`. Note the file's own bands are *given*, so nothing needs to be
recomputed from severity — but the Gap area filter still wants it, to colour an
area by whether anything inside it can block deployment (`gapAreaSeverity`).
Three of the twenty can; see GAP_TAXONOMY.md.

### Step 3 — model changes

In `src/lib/types.ts`:

- **Rename the overall band.** `archetype` → `deploymentBand`. This step
  originally split it in two, for a source that reported every facility twice;
  the revised model reports it once, and the second field has been removed
  again.
- **`AreaProfile` carries one distribution.** `archetypeDistribution` →
  `deploymentDistribution`, and `band` → `deploymentBand`.
  `aggregateAreaProfiles` and `pooledThemeBand` in `areaProfile.ts` pool it as
  counts, never means.
- **`facilityBandUnder` keeps its signature.** Its domain branch reads
  `themeBands`; its no-domain branch returns `deploymentBand` — the band the map
  points and the Readiness filter use when no domain is ticked.
- **Drop what has no source:** `servicePoints`, `staffCount`, `deviceCount`,
  `deviceShortfall`, `geography`. Removes the `geography` filter from
  `FilterState` and the Setting/Service points/Permanent staff rows from
  `FacilityBlocks`.
- **Add what does:** `dailyClientLoad`, `mtnServiceability`, `mtn4gSignal`,
  `mtnDistanceKm`, `airtelDistanceM`, and a `gapDetails[]` carrying each gap's
  own interventions, horizons and costs — the facility card needs the
  intervention text, not just the gap id.
- **`lat`/`lon` become `number | null`** (Part 2 §1). `projectFacilities`
  already drops nulls; the card hides its Coordinates row when absent.
- **Remove `leadership_governance`** (Part 2 §2) — from `ThemeId`,
  `GapDomainId`, `GAP_DOMAINS` and `THEMES`. `FacilityThemeId` stops being an
  `Exclude<…>` and becomes `ThemeId` outright; `DeploymentPhase.stateGaps` goes.
- **`CoverageMeasures`:** `networkMtnPct` becomes real (share immediately
  serviceable, from column 50). `networkAirtelPct` and `gridConnectionPct` go
  null — the file has neither. `staffCount` goes. *(Superseded: all three
  network/power fields were later dropped from the type — see §"Fields the app
  has that this file does not".)*

### Step 4 — the facility card

This is the "each facility should capture all the information about it" ask.
`FacilityBlocks` in `AssessmentPane.tsx` grows from four blocks to five:

1. **Identity** — name, LGA, state, zone, facility group, functionality level,
   typical daily client load, UUID. Coordinates only when present; the row is
   absent rather than blank, since this dataset has none today.
2. **Readiness** — the overall band, labelled `EMR deployment`, then the four
   domain bands beneath. Under a Domain selection the overall band gives way to
   the domain in view, so the card answers the same question the map is
   painting.
3. **Gaps** — grouped by domain, each row: the gap condition text, its
   intervention(s), the horizon as a severity chip, and the cost. Sorted
   critical → major → minor → long-term. A gap with no intervention (Query B)
   shows the condition alone; an intervention with no price (Query A) shows
   `unpriced`.
4. **Cost** — the four domain subtotals and the facility total, matching column
   112 exactly. Annotated where the total excludes an unpriced action.
5. **Connectivity** — MTN base station, distance, serviceability, 4G signal,
   Airtel distance. A distinct block because it is measurement, not judgement,
   and per the model note must never take band colour.

### Step 5 — rollups for the pane

Every level's figures are sums over the facilities in scope — which is what
`AssessmentPane` already does, so this mostly comes for free:

| Level | Investment need |
|---|---|
| Facility | Column 112 |
| LGA | Σ facilities in LGA |
| State | Σ facilities in state |
| National | Σ all — ₦6,016,283,025 |

Same for gap counts, band distributions, per-domain cost splits and horizon
splits. The one thing that is *not* a sum is a band: bands stay counted, per
`areaProfile.ts` — no averaging, which the existing `dominantBand` already
enforces.

For state and LGA rows, `PaneRow.need` already carries `{ gaps, costNGN }` —
that machinery is in place and just needs real numbers behind it.

### Step 6 — provenance

`snapshot.json` gains `sourceUrl`, `fetchedAt` and a content hash of the CSV.
`DataSource.meta.label` changes from `Synthetic dataset` to one naming the sheet
and its date. The landing page and README banner declaring every figure
synthetic come down — every figure on Assessed States is then sourced, with the
one documented exclusion (Query A's unpriced actions) stated where it bites
rather than as a blanket disclaimer. Coordinates were the other, until the ERA workbook
supplied the latitude the standalone export had dropped — see
`scripts/facility-workbook.mjs`.

### The two encodings, settled

The page paints two different things at two different levels, and they are
different on purpose.

**States and LGAs: total intervention cost.** Already the behaviour —
`nationalMapData` and `lgaMapData` in
[AssessedStatesPage.tsx](../src/modules/assessedStates/AssessedStatesPage.tsx)
both fill from `needOf(rows).costNGN` on the sequential ramp, fitted to the
features actually drawn rather than anchored at zero. Real data only changes the
numbers. An area is a population, not a thing with a readiness level, and money
is what the programme allocates against it.

One simplification falls out. The `costed` flag exists because two domains in
the *synthetic* model carried gaps and no money, so a reader who narrowed to
them would get a map painted entirely in zero — the fallback counts gaps
instead. In the real file **every domain carries money** (data use is the
smallest at ₦36.8m and still non-zero), so `costed` is always true. The flag,
its fallback branch, and the legend's dual labelling all go.

**Facilities: readiness band, with a Use / Deployment toggle.** A facility *is*
one thing with a reading, so it takes a band — but the file carries two overall
bands and they disagree for 553 facilities. A toggle at the top of the page
switches which one is in play.

### One reading — what this replaced

This section used to argue for showing **two** overall bands together rather
than switching between them: the source reported every facility twice, once for
readiness to *use* an EMR and once for readiness to *deploy* one, and the
distance between the two was the most interesting fact in the dataset.

The revised costing model withdrew the use column, and brought the deployment
band onto the definition the use band had — the technical infrastructure
reading. So the two readings are one reading, and the apparatus built to hold
them apart is gone: `useBand`, `useDistribution`, the paired `BandLine` in the
facility card, and the second row in the pane's band block.

| | Not ready | Moderately | Ready |
|---|---|---|---|
| **EMR deployment** | 744 (26.5%) | 1,892 (67.4%) | 170 (6.1%) |

What survives from the old argument is the rule it produced: **never show a band
twice under two names.** The four domain readings sit on the same scale as the
overall one, so ticking a domain narrows the question rather than swapping it,
and one swatch of colour means one thing across the whole app.

### What each level shows

**State and LGA — the distribution, count and percentage.** The fill stays cost;
the pane carries the reading. `BandCards` in `AssessmentPane` shows count and
share together, since the count is what a budget is built from and the share is
what makes two states comparable.

The state picture, worst-first by the share of facilities blocked outright:

| State | n | Not / Mod / Ready | % Not ready |
|---|---|---|---|
| Akwa Ibom | 255 | 127 / 127 / 1 | 49.8% |
| Niger | 253 | 99 / 153 / 1 | 39.1% |
| Imo | 227 | 79 / 148 / **0** | 34.8% |
| Rivers | 144 | 44 / 82 / 18 | 30.6% |
| Adamawa | 200 | 60 / 136 / 4 | 30.0% |
| Bauchi | 179 | 49 / 127 / 3 | 27.4% |
| Kano | 438 | 115 / 251 / 72 | 26.3% |
| Anambra | 275 | 57 / 176 / 42 | 20.7% |
| Nasarawa | 152 | 30 / 121 / 1 | 19.7% |
| Oyo | 257 | 39 / 217 / 1 | 15.2% |
| Jigawa | 267 | 35 / 222 / 10 | 13.1% |
| Lagos | 159 | 10 / 132 / 17 | 6.3% |

Ready is scarce almost everywhere: Imo has none, and six more states are in
single figures. What separates the states is the split between the two lower
bands — Akwa Ibom is half blocked outright, where Jigawa and Oyo are
overwhelmingly Moderately ready and therefore deployable after major but not
foundational work. That is the distinction the ranking is for, and it is why the
map fills on cost rather than on band.

**Facility — one band on the card.** `EMR deployment`, above the four domain
bands.

**Under a Domain selection — that domain's readiness, everywhere.** The moment a
domain is ticked, both the map's facility points and the pane show that domain's
band instead of the overall one. This falls out of `facilityBandUnder`
([archetype.ts](../src/lib/archetype.ts)) — its domain branch reads `themeBands`
and never touches the overall band. The pane and the card follow the same rule.

So the page has exactly two modes, and which one it is in is decided by whether
the Domain filter is empty:

| Domain filter | Map points | Pane (area) | Pane (facility) |
|---|---|---|---|
| Empty | Overall band | Overall distribution | Overall band |
| One or more ticked | That domain's band | That domain's distribution | That domain's band |

**Map points take the overall band when no domain is ticked**, and the ticked
domain's band otherwise. Both are on the same scale, so the point colour means
the same thing either way, and the Readiness filter follows the map exactly —
`facilityBandUnder` makes that decision once for the whole page.

State-level `AreaProfile` bands and the pooled roll-ups in `areaProfile.ts`
carry the same reading the pane shows: a state's badge and its facilities' split
must not answer different questions.

---
### Order of work

1. ~~ETL + catalogue extraction + validation assertions (Steps 1–2)~~ ✅ done
2. Model changes: two overall bands and two distributions, leadership removed,
   nullable coordinates (Step 3)
3. The dual-distribution pane block and the `costed` removal — both small once
   the model is in place
4. Facility card (Step 4)
5. Rollups and pane wiring (Step 5)
6. Provenance and banner removal (Step 6)

### Settled

| | |
|---|---|
| State & LGA fill | Total intervention cost, sequential ramp. Already the behaviour; `costed` fallback removed. |
| State & LGA pane | **Both** band distributions — use and deployment, count and share. |
| National, state & LGA pane | One **Gaps and interventions** block: four figures on a line (gaps · interventions · facilities · cost), four horizon cards (what blocks deployment, what waits for it), then the source's own chain as one tree — **domain → sub-domain → gap → intervention**. The tree carries facilities and cost only: below the domain row an intervention count equals the facility count by construction, so it would print the figure beside it twice. An intervention row carries its urgency and its **unit** price, marked `each` — the one figure in the tree that does not roll up. Computed from the facilities in scope, never from `deployment.lines`, which are unfiltered. |
| Facility card | **Both** overall bands, labelled, above the four domain bands. |
| Facility map points | Use band (a point is one colour; use is the scale the domains are on). |
| Domain selected | Everything collapses to that domain's **EMR-use** band — map and pane alike. |
| Coordinates | Ship without — the raw workbook's latitude column is empty too. The points layer degrades on its own; the pane is unaffected. |
| Setting (rural/urban) | Joined from the raw ODK workbook on UUID, falling back to state/LGA/name. |
| Leadership & governance | Dropped from the model, as the data drops it. |
| Query A (55 facilities) | Counted as the sheet counts it. Raised with the team. |
| Query B (332 facilities) | Totalled as-is, `Not costed` shown, totals annotated. Raised with the team. |


*Verified against the local CSV and the published sheet on 2026-08-26. Both are
byte-identical. Every count, total and invariant above was computed from the
file, not estimated.*
