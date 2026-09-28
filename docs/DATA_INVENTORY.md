# Data inventory

What powers the dashboard today, where each piece comes from, and what the
code relies on in it — the blueprint for moving every source into **one
published Google Sheets workbook**, synced hourly.

Checked against the repository on 25 September 2026.

## In one paragraph

Every figure on the dashboard comes from **local Excel files**, turned into the
JSON in `public/data/` by scripts run by hand. **None comes from the Google
Sheets linked in `.env`**: the facility build read the local CSV (its recorded
content hash, `f6d5629…`, is that file's), and the other two links are read by
no script. Four files feed the build; a fifth, `National Coverage.xlsx`, is no
longer in the repository, so its figures are frozen as built on 8 September —
though the same table now sits in the dashboard workbook.

## The chain today

```
ERA Dashboard dataset.xlsx (52 MB, 18 sheets, local)
 ├─ "List of gaps and interventions" ─ data:gaps ─▶ List of gaps and interventions per facility.csv ─┐
 └─ "State Maturity" ────────────────── data:maturity ─▶ scripts/source-data/state-maturity.json ─────┤
                                                                                                    ├─ data:ingest ─▶ public/data/*.json
ERA dataset_v4 (1).xlsx (37 MB, local)                                                              │                src/lib/gapCatalogue.ts
 └─ "Raw data with readiness level" ── (read inside data:ingest) ─ positions, setting ──────────────┤                src/lib/nationalSplit.ts
                                    └─ notes:themes (AI, reviewed) ─▶ public/data/note-themes.json   │
National Coverage.xlsx (gone)                                                                       │
 └─ first sheet ────────────────────── data:coverage ─▶ scripts/source-data/national-coverage.json ─┘
```

`public/data/` is committed; Vercel does not run any of this.

## The datasets

### 1. Facility gaps, interventions and costs — the core dataset

| | |
|---|---|
| **Source** | `ERA Dashboard dataset.xlsx` › **List of gaps and interventions** (the sheet name has a trailing space) |
| **Path in** | `npm run data:gaps` exports it to `List of gaps and interventions per facility.csv` (committed); `npm run data:ingest` reads that CSV |
| **Shape** | 2,806 facilities; 4 header rows (title, scope note, domain band row, column headers), 194 columns (A–GL) |
| **Powers** | Assessed States (facility counts, readiness, gap severity, gaps and interventions, the facility view, the filters), Investment Plan (every section: totals, Where the money goes, Costed interventions, Scenarios), the state briefs' figures, Ask the data, Explain |
| **Also generates code** | `src/lib/gapCatalogue.ts` (gap areas, gaps, interventions, unit prices, urgencies — extracted from this sheet) and `src/lib/nationalSplit.ts` |

Columns the code relies on — **read by position, and each checked against its header**, so a moved column stops the build:

| Column(s) | Header | Used for |
|---|---|---|
| A | Facility UUID | The facility's identity; the join to every other dataset |
| B–D | State · LGA · Facility name | Place and name (fallback join) |
| E | Facility group | BHCPF or not (Funding filter) |
| F | Functionality | Functionality filter |
| G | Zone | Zone breakdowns |
| H | Overall readiness for EMR deployment | The readiness band (checked against the Technical Infrastructure gaps) |
| I–L | Highest {domain} gap severity | Gap severity by domain |
| gap blocks | per gap area: the condition, the intervention(s), when, the cost | Gaps, interventions, urgency, costs. **Found by header wording** (" gap", "intervention cost (₦)"), not position |
| CI · CZ · DM · DZ | each domain's cost total | Checked against the gap blocks |
| BX–CB | MTN base station · distance · serviceability · 4G signal · Airtel distance | The facility view's Mobile network block |
| EC–EE | Moderate · Major · Long-term gaps | Checked against the gap blocks |
| EF | Typical daily client load | Facility view |
| EH | Total facility intervention cost (₦) | Checked against the gap blocks |

Values must be **raw numbers**, not formatted text: the tablet price is ₦700,000 ÷ 3, and the ingest works out quantities from the exact cost.

### 2. Facility positions and setting

| | |
|---|---|
| **Source** | `ERA dataset_v4 (1).xlsx` › **Raw data with readiness level** — the only file with latitudes |
| **Path in** | Read inside `npm run data:ingest`; joined to dataset 1 by UUID, falling back to state + LGA + name |
| **Shape** | 2,804 facilities (2 of the 2,806 have no row), 363 columns; the header row is found, not assumed |
| **Powers** | The facility points on the Assessed States maps; the Setting (rural/urban) filter |

Columns relied on (checked by header): **Name of facility**, **UUID**, **Latitude**, **Longitude**, **Altitude**, **Location accuracy**, **State**, **LGA**, **Geography**. Nothing else in the sheet is read.

The dashboard workbook has a sheet of the same name, but **without a Latitude column** — it cannot stand in for this one.

### 3. Assessor notes

| | |
|---|---|
| **Source** | The same sheet as dataset 2 › column **additional_comments-general_remarks** |
| **Path in** | `npm run notes:themes`: personal details removed, then tagged into themes by AI, then reviewed by a person → `public/data/note-themes.json` |
| **Status** | Not run yet — the file does not exist, so What assessors noted does not show |
| **Powers** | What assessors noted (Assessed States) |

**Contains names and phone numbers** in the raw text. Should not go into a workbook published to the web — see the proposal below.

### 4. State Maturity

| | |
|---|---|
| **Source** | `ERA Dashboard dataset.xlsx` › **State Maturity** |
| **Path in** | `npm run data:maturity` → `scripts/source-data/state-maturity.json` → `data:ingest` |
| **Powers** | National Coverage: the map's colours, the Maturity band block, Leadership & Governance, the map hover; Assessed States: the national map's colours |

Columns relied on — **found by header**: **State**, **Governance Structure**, **State-specific Data Governance Policy**, **State-specific Digital Health Strategy**, **Financial Commitment for EMR**, **Electricity**, **Internet**, **Total**, **Readiness**. Each answer scores 5 / 3 / 1; the build checks every state's Total and band against those scores and against dataset 5's rates.

### 5. National coverage: electricity, internet, subscriptions

| | |
|---|---|
| **Source** | Was `National Coverage.xlsx`, first sheet — **no longer in the repository**. What is live is `scripts/source-data/national-coverage.json`, built 8 September |
| **Now also in** | `ERA Dashboard dataset.xlsx` › **State assessment data** — the same table (header row 11) |
| **Path in** | `npm run data:coverage` → `scripts/source-data/national-coverage.json` → `data:maturity` and `data:ingest` |
| **Powers** | National Coverage: Technical Infrastructure (access rates, subscriptions by type and operator), the rates on the map hover |

Columns relied on — **found by header**: **State**, **Electricity Access Rate**, **Internet Subscription Rate…**, then per operator **MTN, GLO, AIRTEL, EMTS, ipNX, MTN FIXED, INQ, 21ST CENT, SMILE, NTEL, ISP**, **Total**, **NBS Population Projection by state (2025)**. The build checks every state's internet rate equals Total ÷ population.

### 6. Map boundaries — reference data, not a sheet

| File | Built by | Powers |
|---|---|---|
| `scripts/source-data/nga_admin2.geojson` | `npm run geo:build` → `public/geo/lgas/*.json`, `lga-index.json` | LGA shapes, the LGA list |
| `public/geo/nigeria-states.geojson` | `geo:outlines`, `geo:context` → `public/geo/states/*.json`, `nigeria-states-context.json` | State shapes and outlines |

Geometry changes rarely and does not belong in a spreadsheet. **Keep these in the repository.**

### 7. Written and reviewed content — not a sheet

- **State briefs** (`src/content/briefs/*.md`): drafted by AI from the data, approved by a person. None drafted yet. A brief is marked Out of date when its figures change.
- **Page guides** (`src/content/pageGuides.ts`): written text about the pages, not data.

## What has no data behind it

| Section | Why | A source that could fill it |
|---|---|---|
| **Investment Plan › Rollout waves** | No state carries a wave or start quarter; the section renders empty | **Master list** (dashboard workbook) has per-facility *Planned / Approved deployment year*, *Actual go-live year*, *Deployment year used* and *Roadmap pathway*; **State and facility prioritization** sets out states in waves of four; **Five year roadmap** is the timeline |
| **National Coverage › Workforce Capacity** (removed from the pane) | Staff count is empty for every state | None found in the workbooks |

## In the workbooks but not used

**ERA Dashboard dataset.xlsx** — 16 of 18 sheets are not read:

| Sheet | What it holds | Worth bringing in? |
|---|---|---|
| Master list | Facility list with deployment years and roadmap pathway | **Yes — Rollout waves** |
| State and facility prioritization | Sequencing options, states in waves, cost and client load per wave | **Yes — Rollout waves** |
| Five year roadmap | Activity timeline, Aug 2026 – 2029 | Possibly — a roadmap view |
| State assessment data | The coverage table (dataset 5) | **Yes — replaces the missing file** |
| The 12 states and 2806 facilities | Readiness gain per fix package, per state | No — the Scenarios engine computes this from dataset 1 |
| Summary of gaps and readiness · Cost summary · Interventions_summary | Formula summaries of dataset 1 | No — the dashboard computes these; useful as cross-checks |
| Gap_to_intervention_rules · Unit_costs_and_assumptions | The rules and unit prices behind dataset 1 | Possibly — a "how costs are built" reference |
| List of facility gaps | Gap flags per facility, feeding dataset 1 | No — upstream of dataset 1 |
| Raw data with readiness level | Survey export without latitude | No — dataset 2 needs the v4 copy |
| BHCPF | BHCPF facility list and checks | No — dataset 1 carries BHCPF status |
| Solar PV systems calculation | Power sizing | No |
| Cover page · Input | Front matter, inputs | No |

**ERA dataset_v4 (1).xlsx** — only *Raw data with readiness level* is read. Unused: Raw data ODK, the per-domain ODK responses and scoring sheets, MTN and Airtel network coverage data, Internet Speed data, the survey definition (survey, choices), the scoring rubric, State leadership scoring.

**Not read at all:** `Costing model_ERA_Archive.xlsx` (an archive of the earlier costing model), `Raw data with readiness level.xlsx` (an earlier export whose latitudes are empty).

**The Google Sheets in `.env`:** unused. The facility sheet (`gid=757945180`) has the same 2,810 rows and 194 columns as the local CSV but **differs in about 84,000 cells** — costs written as text (`₦3,085,000` for `3085000`) and some labels renamed (`Satellite` → `Starlink`). The build would need changes to read it as it is.

## Proposal: one workbook, one tab per dataset

| Tab | From | Rows | Notes |
|---|---|---|---|
| `facilities` | Dataset 1 | 2,806 | Same columns and header rows as today; numbers as numbers |
| `facility_locations` | Dataset 2 | 2,804 today | Just UUID, Latitude, Longitude, Altitude, Location accuracy, Geography |
| `state_maturity` | Dataset 4 | 37 | As the State Maturity sheet |
| `state_coverage` | Dataset 5 | 37 | As State assessment data's table, starting at row 1 |
| `rollout` | Master list / prioritization | 12 states or 2,806 facilities | New — decides what Rollout waves shows |
| `README` | — | — | The contract: tab names and headers the build expects |

Dataset 3 (the notes) stays **out of the published workbook**: publishing makes every tab readable by anyone with the link, and the notes hold names and phone numbers. It can live in a private sheet and be tagged on demand, as now.

Layout rules that make the hourly sync safe:

1. Tab names and column headers are the contract. Rename or move one and the sync stops, says which, and the live data stays as it was.
2. Values, not presentation: numbers as numbers, no currency symbols or thousands separators in number cells.
3. One header row per tab where possible (dataset 1 keeps its four until the build is changed).
4. New rows are fine; new *categories* (a new gap area, a renamed fix like Starlink) need a code change, and the sync will say so.

## Open questions

1. **Rollout waves:** by state (wave 1–3 and a start quarter) or by facility (deployment year)? And is the source *Master list*'s *Deployment year used*, or *State and facility prioritization*?
2. **Starlink:** is `Satellite` now `Starlink` everywhere? The scenario fix, its label and the build's catalogue would follow.
3. **Formulas:** dataset 1 is formula-driven from other sheets in the dashboard workbook. Keep those formulas in the Google workbook (the published tab carries their results), or paste values only?
4. **The two missing facilities** in dataset 2: known, or to be found?
