# The assessment dataset

`List of gaps and interventions per facility.csv` — 2,806 assessed facilities
across 12 states, every gap they carry, the intervention each gap calls for,
when it is needed and what it costs.

This is the dataset behind `public/data/`. It replaced a synthetic stand-in,
whose generator and documentation were retired once the ingest landed — both are
in git history if the invented population is ever wanted again.

**Two sources.** The published Google Sheet in `.env` (`facility gaps and
intervention`) is the primary one; the local CSV is a byte-identical export of
it, verified on 2026-08-26. `Raw data with readiness level.xlsx` — the raw ODK
export the gaps CSV was summarised from — is joined on top of it for the
rural/urban setting. See [Part 2 §7](#7-the-raw-odk-workbook--the-second-source).

---

## Part 1 — What is in the file

### Shape

A four-row header over 2,806 data rows and 114 columns:

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

### 2. Readiness — columns 7–12

Six band columns, three levels each (`Not Ready` / `Moderately Ready` /
`Ready`). No nulls anywhere — every facility carries every band.

| Col | Field | Not | Moderate | Ready |
|---|---|---|---|---|
| 7 | Overall readiness for EMR **deployment** | 1,340 | 842 | 624 |
| 8 | Overall readiness for EMR **use** | 1,340 | 1,395 | 71 |
| 9 | Technical infrastructure | 1,340 | 1,395 | 71 |
| 10 | Workforce | 1,013 | 592 | 1,201 |
| 11 | Workflow | 2,393 | 185 | 228 |
| 12 | Data use | 349 | 350 | 2,107 |

**Two derivations hold exactly, in all 2,806 rows.** Both were verified, and
both matter for the UI:

1. **Overall readiness for EMR use is a copy of technical infrastructure
   readiness.** Identical in every row — not the minimum of the four domains
   (that holds in only 1,510 rows). Infrastructure is treated as the binding
   constraint on EMR *use*, full stop.

2. **Overall readiness for EMR deployment is a function of the summary gap
   counts:**

   ```
   critical > 0                → Not Ready for EMR deployment       (1,340)
   critical = 0 and major > 0  → Moderately Ready for EMR deployment  (842)
   critical = 0 and major = 0  → Ready for EMR deployment             (624)
   ```

   Zero exceptions. So *deployment* readiness is about blockers, and *use*
   readiness is about infrastructure quality. They answer different questions
   and the page should not conflate them.

Note the consequence for the app's existing model: `FacilitySummary.archetype`
is currently one band. This dataset has **two** overall bands, and they
disagree for 553 facilities (Ready to deploy, only Moderately ready to use).

### 3. Gaps and interventions — columns 13–106

Four domains. Within each domain, a repeating block:

```
<Sub-domain> gap | Intervention 1 | When action is needed | Cost 1 (₦) [| Intervention 2 | When … | Cost 2 (₦)]
```

**20 gap columns** — the sub-domains:

| Domain | Sub-domain gap columns |
|---|---|
| Technical Infrastructure (13–58) | Power · Wiring · Facility-connectivity · Device-sufficiency · Backup-power · Backup-connectivity · Device-maintenance · Data-backup · Mobile-network feasibility |
| Workforce Capacity (60–75) | Digital-competency · EMR/Data focal-person · Training · Technical-support |
| Workflow and Transition (77–92) | Duplicate-entry · Workflow-bottleneck · Physical service-point · Staff-willingness support |
| Data Use and Reporting (94–105) | Routine-data-use · Data-validation · Report-review support |

Each gap column holds either `No gap` or **a named condition** — the gap is
ordinal, not boolean. `Power gap` for instance carries one of:

- `No functional electricity source or 0 hours/day` (571)
- `Best usable source provides 1–4 hours/day` (450)
- `Best usable source provides 5–8 hours/day` (227)

Across the 20 columns there are **73 distinct (column, value) gap variants** —
this is the real gap catalogue, and it is what replaces the 30-odd invented gaps
in `scripts/gap-catalogue.mjs`.

**The variant → intervention mapping is deterministic.** Verified: the same gap
value always produces the same interventions, the same horizons and the same
costs, in every row of the file. That means the catalogue can be *extracted*
from the data rather than hand-maintained, and the extraction is lossless.

29 distinct intervention labels, 30 distinct (label, horizon, cost) tuples. Only
`Power gap` has a second intervention slot; every other sub-domain has one.

**Costs are flat per intervention, not per quantity.** `Give each place where
staff enter EMR data the number of tablets it is missing` is ₦233,333 in all
1,769 rows that carry it. Nothing in this file is multiplied by a service-point
or device count — which is a departure from the synthetic model's `unitBasis`
machinery, and simplifies it away entirely.

### 4. Horizons — the "When action is needed" columns

Four values, and they carry the severity:

| Value | Instances |
|---|---|
| Minor action to complete during EMR deployment | 27,347 |
| Critical gap to fix before EMR deployment | 2,355 |
| Major gap to fix before EMR deployment | 1,477 |
| Optional long-term improvement after EMR deployment | 571 |

This is the file's severity model. There is no separate severity column — a
gap's weight *is* the horizon of the intervention it triggers.

### 5. Network measurement — columns 48–54

Sitting inside the Technical Infrastructure block, ahead of the mobile-network
feasibility gap that is derived from them:

| Col | Field | State |
|---|---|---|
| 48 | MTN base station | Populated — 863 distinct sites |
| 49 | MTN base-station distance (km) | Populated · 20 `Not available` |
| 50 | MTN serviceability | `Not currently serviceable` 1,549 · `Immediately serviceable` 812 · `Serviceable with network extension` 423 · `Not available` 20 · blank 2 |
| 51 | MTN 4G signal | `Excellent` 1,700 · `Good` 676 · `no signal` 408 · `Not available` 20 · blank 2 |
| 52 | Average Airtel site distance (m) | Populated · 6 `Not available` |
| 53 | Airtel nearest site name | **Empty in all 2,806 rows** |
| 54 | Airtel serviceability | **Empty in all 2,806 rows** |

MTN serviceability aggregates cleanly to state level and is a genuine measure
for the pane — Lagos is 86.2% immediately serviceable, Jigawa 7.9%, Bauchi 8.4%.

### 6. Summary — columns 107–113

| Col | Field | Notes |
|---|---|---|
| 107 | Total gaps | 3–19 per facility, mean 10.9, **30,557 total**. No facility has zero. |
| 108 | Minor gaps | Count of *minor* interventions |
| 109 | Major gaps | Count of *major* interventions |
| 110 | Critical gaps | Count of *critical* interventions |
| 111 | Long-term gaps | Count of *long-term* interventions |
| 112 | Typical daily client load | `<10` 797 · `11-30` 1,278 · `31-50` 442 · `>50` 289 |
| 113 | Total facility intervention cost (₦) | ₦217,000 – ₦13,741,378 · median ₦6,402,666 |

**Careful: 108–111 count interventions, not gaps.** They do not sum to column
107 — they disagree in 1,259 rows, because `Power gap` fires two interventions
on two different horizons from one gap. Verified: 108–111 match the per-horizon
intervention counts exactly, in every row.

So the page has two legitimate but different denominators — "30,557 gaps" and
"31,750 interventions" — and must not mix them in one sentence.

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

₦1,263 nationally against ₦16.26bn: 0.000008%. It is noted rather than fixed
because there is nothing to fix — the underlying figures are fractional and the
sheet is rounding them, which is the correct thing for it to do.

**What the dashboard sums.** The cost *cells*, not the grand total. The cells
are what the gap catalogue is built from, and a facility's cost has to be the
sum of the gaps shown beside it or the card contradicts itself. The national
total is therefore ₦16,256,516,025 here against the sheet's ₦16,256,517,288 —
the same ₦1,263. `ingest-assessment.mjs` tolerates exactly ₦1 per facility and
totals the drift in its build report, so a rounding artefact cannot quietly
grow into something that is not rounding.

The per-domain and per-state figures below are the sheet's own, and so carry
the ₦1s.

| Domain | Total | Share |
|---|---|---|
| Technical infrastructure | ₦12,888,426,077 | 79.3% |
| Workforce capacity | ₦2,960,130,000 | 18.2% |
| Workflow and transition | ₦371,119,948 | 2.3% |
| Data use and reporting | ₦36,840,000 | 0.2% |
| **National total** | **₦16,256,517,288** | |

By state, and this is the ranking the programme allocates against:

| State | Total | Per facility | % Not ready to deploy |
|---|---|---|---|
| kano | ₦2,405,048,632 | ₦5,490,979 | 36.5% |
| niger | ₦2,024,342,661 | ₦8,001,354 | 71.1% |
| jigawa | ₦1,622,263,896 | ₦6,075,895 | 63.3% |
| akwa_ibom | ₦1,555,200,576 | ₦6,098,826 | 60.8% |
| adamawa | ₦1,388,436,196 | ₦6,942,181 | 55.5% |
| imo | ₦1,352,126,932 | ₦5,956,506 | 37.9% |
| bauchi | ₦1,247,069,871 | ₦6,966,871 | 67.0% |
| anambra | ₦1,126,838,026 | ₦4,097,593 | 28.7% |
| oyo | ₦1,101,667,956 | ₦4,286,646 | 28.8% |
| nasarawa | ₦1,084,204,007 | ₦7,132,921 | 61.8% |
| lagos | ₦713,997,775 | ₦4,490,552 | 31.4% |
| rivers | ₦635,320,760 | ₦4,411,950 | 43.1% |

Kano is the largest bill and Niger the most expensive facility-for-facility —
two different findings, and the pane should be able to show both.

### 8. Commonest gaps nationally

| Prevalence | Gap |
|---|---|
| 76.1% | Backup-connectivity: no backup internet option confirmed |
| 68.1% | Data-backup: no data-backup capability reported |
| 54.3% | Physical service-point: 0% of service points meet minimum conditions |
| 39.7% | Device-sufficiency: usable devices cover <75% of requirement |
| 38.0% | Device-maintenance: no formal maintenance arrangement |
| 36.8% | Duplicate-entry: ≥75% of documenting service points affected |
| 34.5% | Technical-support: no defined technical-support process |
| 33.4% | Facility-connectivity: individual connection at or above 5 Mbps |

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

### 5 & 6. Two data queries — raised with the team, built on as-is

Both are documented for the assessment team in
[`data-queries/README.md`](data-queries/README.md), with the affected facilities
listed in full, one CSV per query. The two sets do not overlap.

**Query A — 55 facilities carry a gap with no intervention.**
`Facility-connectivity gap: Facility-managed connection at or above 5 Mbps and
consistently reliable` — the only one of the 73 variants with no intervention
and no horizon (its cost cell reads a real `₦0`, correctly, since nothing is
called for). The condition describes a facility that is *fine*, so it
reads like it belongs under `No gap`. It inflates `Total gaps` by 55 nationally
and does nothing else — carrying no horizon, it cannot move a band, and 9 of the
55 are still `Ready for EMR deployment` while holding it. Concentrated in Kano
(34 of 55).

**Query B — 332 facilities have a critical intervention with a blank cost.**
`No internet access or network coverage` → *Check which connection works at the
facility…* → critical → no price. These are the only empty cost cells in the
file; genuine zeroes elsewhere are written `₦0`, so a blank is distinguishable
from free and reads as *not yet priced*. The bands are right — all 332 are
`Not Ready for EMR deployment` — and only the money is missing. The shortfall is
between ~₦120m and ~₦996m depending on whether these end up needing a fixed
connection or satellite, against a national total of ₦16.26bn.

**Decision:** build on the data exactly as it stands. No imputation, no
correction, no placeholder prices.

- Query A's gap is counted as the sheet counts it, and shown in the facility's
  gap list with no intervention and no price beneath it — which is what the row
  says.
- Query B's intervention shows `Not costed` where the amount goes, and totals
  covering any of those 332 facilities are annotated so the reader knows a
  critical item is excluded.

Inventing a placeholder would put a made-up number inside a total presented as
sourced. Rendering the absence is the honest alternative and costs one label.

### 7. The raw ODK workbook — the second source

`Raw data with readiness level.xlsx` — one sheet, one row per facility, 335
columns, 2,807 rows under a three-row header. It is the survey export the gaps
CSV was summarised from, so it holds everything the instrument collected.

**Only `Geography` is read from it.** The workbook also carries service points,
staff counts, devices and every per-question response; each of those is a
decision about what the page should say rather than a free upgrade, so they are
taken one at a time.

| Excel | Field | State |
|---|---|---|
| L | *(latitude — no header)* | **Empty in 2,805 of 2,807 rows** |
| M | Longitude | Populated |
| N | Altitude | Populated |
| O | Location accuracy | Populated |
| S | Geography | `rural` 2,205 · `urban` 601 · 1 blank |

**Latitude is missing, and this is why the map still plots nothing.** Column L
sits exactly where ODK puts latitude — between the data collector's name and
Longitude — with no header and two values. Those two (both Kano: 11.677 and
10.699, against longitudes of 8.13 and 8.63) are plausible latitudes for their
LGAs, so the column is correctly positioned and its values were lost in whatever
produced the export.

Column M was checked against known state positions rather than trusted by its
label, because Nigeria's latitude and longitude ranges overlap. It tracks
longitude in all twelve states — Kano 8.49 (true lon 8.52, true lat 11.75),
Lagos 3.40 (3.50 / 6.55), Adamawa 12.55 (12.68 / 9.55) — so the label is right
and latitude really is absent. A longitude without a latitude is a meridian, so
`lat`/`lon` stay null. A re-export including column L is all that is needed.

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
4. **Extract the catalogue** — 73 variants, asserting determinism as it goes,
   naming both disagreeing facilities if it ever breaks.
5. **Validate**, per row, seven relationships (below).
6. **Emit** the five JSON files plus `src/lib/gapCatalogue.ts` and
   `src/lib/nationalSplit.ts`.

**The seven assertions**, all passing on 2,806 of 2,806 rows:

| | Check |
|---|---|
| 1 | `Total gaps` = the number of gap columns that fired |
| 2 | each domain subtotal = the sum of its own cost cells |
| 3 | facility total = the four subtotals, within the sheet's ₦1 rounding |
| 4 | columns 108–111 = the per-horizon intervention counts |
| 5 | deployment band = the critical/major rule |
| 6 | use band = the technical infrastructure band |
| 7 | deployment band is never worse than use band |

Plus one cross-source check outside the sheet: **every facility's zone column
agrees with the boundary layer's** for the state it names. Free, and a real
signal if a facility is ever filed under the wrong state. It passes on all
2,806.

Assertion 3 is the only one carrying a tolerance, and it is exactly ₦1 — see
Part 1 §7. The drift is totalled in the build report rather than swallowed, so a
rounding artefact cannot quietly grow into something that is not rounding.

**Build output**, for reference:

```
  facilities        2,806        gap variants      73
  states assessed   12           gap instances     30,557
  LGAs assessed     305          unpriced actions  332
  total investment  ₦16,256,516,025
  sheet rounding    ₦1,263 over 1,263 facilities

  readiness         not ready   moderately       ready
  EMR use               1340         1395          71
  EMR deployment        1340          842         624
```

`--fetch` was verified end to end: it produces the identical content hash
(`c278e78f95aba37f`) to the committed CSV, so the live sheet and the local file
are provably the same and the pipeline is reproducible from either.

### Step 2 — the catalogue

`scripts/gap-catalogue.mjs` becomes **derived, not declared**. Its prevalence
weights existed only to drive the random generator and have no meaning against
real data.

Gap id: `<sub_domain>__<value_slug>`, e.g.
`power__no_functional_electricity_source_or_0_hours_day`. Stable across runs as
long as the sheet's wording is stable — and if the wording changes, the id
changes, which is correct: it is a different gap.

Per gap: `domain`, `subDomain` (from the gap column), `label` (the value text),
`horizon` and `costNGN` (from its interventions), and `interventions[]`.

`unitBasis` and `gapCostNGN(gap, facility)` collapse to a flat `costNGN`, since
nothing in the file is quantity-scaled. That removes a whole layer of machinery
from `gapCatalogue.ts` and from `AssessmentPane`.

**Severity** maps from horizon: critical/major → `blocking`, minor/long-term →
`partial`. Note the file's own bands are *given*, so nothing needs to be
recomputed from severity — but the Gap filter's grouping still wants it.

### Step 3 — model changes

In `src/lib/types.ts`:

- **Split the overall band.** `archetype` → `useBand` and `deploymentBand`. They
  disagree for 553 facilities and the page currently has one field for both.
  Both are shown together wherever a readiness reading appears; neither is
  hidden behind a control.
- **`AreaProfile` carries two distributions.** `archetypeDistribution` →
  `useDistribution` and `deploymentDistribution`, both `BandDistribution`, and
  `band` → `useBand` / `deploymentBand`. `aggregateAreaProfiles` and
  `pooledThemeBand` in `areaProfile.ts` sum both the same way they sum one —
  still counts, never means.
- **`facilityBandUnder` keeps its signature.** Its domain branch already reads
  `themeBands` and never touches the overall band, so it needs no change. What
  changes is its no-domain branch, which returns `useBand` in place of
  `archetype` — that is the band the map points and the Readiness filter use
  when no domain is ticked.
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
  null — the file has neither. `staffCount` goes.

### Step 4 — the facility card

This is the "each facility should capture all the information about it" ask.
`FacilityBlocks` in `AssessmentPane.tsx` grows from four blocks to five:

1. **Identity** — name, LGA, state, zone, facility group, functionality level,
   typical daily client load, UUID. Coordinates only when present; the row is
   absent rather than blank, since this dataset has none today.
2. **Readiness** — **both** overall bands, labelled `EMR use` and
   `EMR deployment`, then the four domain bands beneath. Under a Domain
   selection the two overall bands give way to the domain in view, so the card
   answers the same question the map is painting.
3. **Gaps** — grouped by domain, each row: the gap condition text, its
   intervention(s), the horizon as a severity chip, and the cost. Sorted
   critical → major → minor → long-term. This is where the file's real value
   lands and it is currently a bare list of gap labels. A gap with no
   intervention (Query A) shows the condition alone; an intervention with no
   price (Query B) shows `Not costed`.
4. **Cost** — the four domain subtotals and the facility total, matching column
   113 exactly. Annotated on the 332 Query B facilities to say the total
   excludes a critical unpriced item.
5. **Connectivity** — MTN base station, distance, serviceability, 4G signal,
   Airtel distance. A distinct block because it is measurement, not judgement,
   and per the model note must never take band colour.

### Step 5 — rollups for the pane

Every level's figures are sums over the facilities in scope — which is what
`AssessmentPane` already does, so this mostly comes for free:

| Level | Investment need |
|---|---|
| Facility | Column 113 |
| LGA | Σ facilities in LGA |
| State | Σ facilities in state |
| National | Σ all — ₦16,256,517,288 |

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
two documented exclusions (no coordinates, Query B's unpriced item) stated where
they bite rather than as a blanket disclaimer.

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

### Both readings, side by side

The two overall bands are shown **together**, not switched between, everywhere a
readiness reading appears. A toggle would make the reader hold one number in
their head while looking at the other; the interesting fact about this dataset
is the *distance* between the two, and distance is only visible when both are on
screen at once.

Two structural facts make this cheap to render and safe to reason about. Both
verified across all 2,806 rows:

**1. Deployment is never worse than use.** `deploymentBand >= useBand` in every
single row — 2,253 equal, 553 better, zero worse. The readings are nested, not
crossing, so "deployment is the more forgiving lens" is a property of the data
rather than a generalisation from the totals.

**2. The Not-ready set is *identical* under both.** Not merely equal in count —
literally the same 1,340 facilities, and the same ones state by state. A
critical gap sinks both readings, so the entire divergence is 553 facilities
moving from *Moderately ready to use* up to *Ready to deploy*.

That means one shared row and two that differ, which is exactly the compact
two-row shape to render:

| | Not ready | Moderately | Ready |
|---|---|---|---|
| **EMR use** | 1,340 (47.8%) | 1,395 (49.7%) | 71 (2.5%) |
| **EMR deployment** | 1,340 (47.8%) | 842 (30.0%) | 624 (22.2%) |

### What each level shows

**State and LGA — both distributions, count and percentage.** The fill stays
cost; the pane carries the readings. `BandCounts` in `AssessmentPane` grows from
one `BandCards` to the two-row table above — count and share in each cell, since
the count is what a budget is built from and the share is what makes two states
comparable.

This is where showing both earns its keep, because the lens changes the state
picture drastically:

| State | n | Use: Not / Mod / Ready | Deployment: Not / Mod / Ready |
|---|---|---|---|
| niger | 253 | 180 / 73 / **0** | 180 / 52 / 21 |
| bauchi | 179 | 120 / 59 / **0** | 120 / 38 / 21 |
| jigawa | 267 | 169 / 98 / **0** | 169 / 79 / 19 |
| nasarawa | 152 | 94 / 58 / **0** | 94 / 36 / 22 |
| akwa_ibom | 255 | 155 / 99 / 1 | 155 / 71 / 29 |
| adamawa | 200 | 111 / 89 / **0** | 111 / 61 / 28 |
| rivers | 144 | 62 / 71 / 11 | 62 / 37 / 45 |
| imo | 227 | 86 / 141 / **0** | 86 / 109 / 32 |
| kano | 438 | 160 / 260 / 18 | 160 / 188 / 90 |
| lagos | 159 | 50 / 95 / 14 | 50 / 43 / 66 |
| oyo | 257 | 74 / 181 / 2 | 74 / 59 / 124 |
| anambra | 275 | 79 / 171 / 25 | 79 / 69 / 127 |

**Six of the twelve states have zero facilities ready for EMR use**, and Oyo has
2 of 257. The same states show 19–124 ready to *deploy* into. A single-band page
has to pick one of those two stories and suppress the other. Both together are
the actual finding: these states can be deployed into, and almost nothing in
them is currently in shape to run an EMR.

**Facility — both bands on the card.** `EMR use` and `EMR deployment`, labelled,
above the four domain bands. Same reasoning at n=1: the useful thing about a
facility is often that it is clear to deploy into but not ready to run an EMR.

**Under a Domain selection — that domain's EMR-use readiness, everywhere.** The
moment a domain is ticked, both the map's facility points and the pane collapse
to a single band: that domain's, which is always a use band, because there is no
per-domain deployment reading anywhere in the file. The dual table is replaced
by one distribution, and the card's two overall bands give way to the domain in
view. This already falls out of `facilityBandUnder`
([archetype.ts:95](../src/lib/archetype.ts:95)) — its domain branch reads
`themeBands` and never touches the overall band. It needs no new logic, only the
pane and the card following the same rule.

So the page has exactly two modes, and which one it is in is decided by whether
the Domain filter is empty:

| Domain filter | Map points | Pane (area) | Pane (facility) |
|---|---|---|---|
| Empty | Use band | Both distributions | Both bands |
| One or more ticked | That domain's use band | That domain's distribution | That domain's band |

**Map points take the use band when no domain is ticked.** A point is one colour
and cannot show two readings; use is the right one to pick for the same reason
it was the right default — it is the scale the domain bands are on, so the point
colour means the same thing whether or not a domain is ticked.

**The Readiness filter is unaffected by the ambiguity.** Because the Not-ready
sets are identical, a "Not ready" selection returns the same 1,340 facilities
under either reading. Only Moderately and Ready differ, and there the filter
follows the map: the use band when no domain is ticked, the domain's band
otherwise.

State-level `AreaProfile` bands and the pooled roll-ups in `areaProfile.ts`
carry both readings for the same reason the pane shows both — a state's badge
and its facilities' split must not answer different questions.

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
