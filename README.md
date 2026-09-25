# EMR Deployment Dashboard

Decision-support dashboard for planning EMR deployment across Nigeria's primary
healthcare facilities, for **NPHCDA**, in partnership with NTBLCP, The Global
Fund and Solina.

>  **The figures are the assessment's.** `public/data/` is built by
> `npm run data:ingest` from `List of gaps and interventions per facility.csv`
> — the "List of gaps and interventions" sheet of `ERA Dashboard dataset.xlsx`,
> exported by `npm run data:gaps`; 2,806 facilities across 12 states — joined
> with `ERA dataset_v4 (1).xlsx`, the raw ODK export, for each facility's
> rural/urban setting and coordinate. See
> [`docs/ASSESSMENT_DATA.md`](docs/ASSESSMENT_DATA.md) for what the dataset
> contains, and [`docs/data-queries/`](docs/data-queries/) for what the
> assessment team still needs to settle.

Sibling to `emr-dashboard`, which reports the assessment itself. This one is a
narrower cut: three pages behind a landing page, no scores, and a deployment
plan at the end of it.

---

## Stack

React 18 · TypeScript 5 · Vite 5 · Tailwind 3 · Zustand 4 ·
React Router 7 · Vercel (static)

No charting library. Every measure on screen is a bar, a track or a stat tile
built from plain DOM in `src/components/ui/Meter.tsx`, and the maps are
hand-projected SVG — so the readiness palette, its textures and the dark scheme
are defined once in CSS and inherited rather than restated in a canvas theme.

No backend. The app fetches static JSON through the `DataSource` interface in
`src/data/datasource/`, which is the seam a live feed would arrive on. The
assessment is ingested at build time rather than fetched at run time: the
published sheet serves 7.8 MB at ~80 KB/s and its redirect carries no CORS
header, so a browser could not read it even slowly.

## Getting started

```bash
npm install
npm run dev
```

`public/data/` is committed, so the app runs immediately after install. When
the workbook changes, run `npm run data:gaps` to refresh the committed CSV from
it, then `npm run data:ingest`.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build |
| `npm run geo:build` | Rebuild the per-state LGA boundary files |
| `npm run data:maturity` | Rebuild `scripts/source-data/state-maturity.json` from the State Maturity sheet |
| `npm run data:gaps` | Export the facility gap sheet to the committed CSV |
| `npm run data:ingest` | Rebuild `public/data/` from the assessment CSV |
| `npm run briefs:draft` | Draft the state briefs with OpenAI, for review (`src/content/briefs/README.md`) |
| `npm run notes:themes` | Tag the assessors' notes with themes, for review — personal details removed before anything is sent; `--dry-run` sends nothing (`scripts/note-themes.ts`) |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |

## Modules

| Route | Module |
|---|---|
| `/` | Landing page — the front door, outside the app shell |
| `/states` | National Coverage — all 37 states and how each was evidenced |
| `/assessment` | Assessed States — the 12 states visited, down to LGA |
| `/investment` | Investment Plan — what deployment will take, itemised and costed |

Filters are shared across modules and live in the URL, so any scoped view is a
link: `/assessment?state=Kano&archetype=not_ready`.

## The map

Not a chart of a country — a small GIS. Every geography is a real feature at
real coordinates, and the same Web Mercator projection in
`src/lib/mapProjection.ts` serves all three layers, so moving between them is a
viewBox change and never a reprojection.

| | |
| --- | --- |
| **Hierarchy** | Nigeria → State → LGA → PHC. Boundaries are GRID3/COD-AB ADM1 and ADM2 (all 774 LGAs, one file per state); facilities sit at their surveyed GPS coordinate. |
| **Drill-down** | Strictly progressive: a state resolves into its LGAs, an LGA into the facilities inside it, and a facility into itself. Each level only draws the features that belong to it, so facility points never appear above their own LGA. Click a feature, or simply keep zooming — zooming past a level's handover point drills through it, and pulling back out past its extent drills back up. The +/- buttons cross levels on the same terms the wheel does. |
| **Zoom range** | Every level's camera limit is a *ground distance*, not a multiple of its own extent: 2 km across the frame nationally, 500 m at state level, 70 m at LGA level. A ratio would mean a different depth in every state and every LGA; a distance reaches the same thing everywhere. The drill fires long before the camera runs out, so an unsurveyed state — which has no layer below it — can still be zoomed to its streets. |
| **Context** | No level stops at the edge of its subject. The base map is drawn across the whole frame and the ground beyond the subject is *set back* rather than cut away, neighbouring states are outlined below state level, and neighbouring LGAs below that. Panning is allowed to leave the subject, which at street zoom is most of the point. |
| **Selecting a facility** | A drill like any other, not a highlight: the camera flies to the facility and opens onto roughly 400 m of its neighbourhood — close enough to place it, wide enough to check it against the road it is on, with the rest of the range left in the reader's hands. Clicking it again, or the breadcrumb, flies back out to the LGA. |
| **Anchor precision** | viewBox strings are formatted at a precision taken from their own span (`viewBoxString`), not at a fixed number of decimals. A flat `toFixed(1)` is 130 m of ground — invisible against a country 1,000 units wide and, against a 0.3-unit facility frame, enough to put "zoom to this facility" most of a frame-height off the coordinate it was aiming at. |
| **Facilities with no fix** | Not plotted, and *said*. Selecting one shows the same card in the same place with "exact location unavailable" in place of a coordinate; where some in scope are missing, the map reports the count. Two of the 2,806 are in this position. Nothing is ever placed at a centroid or a guess. |
| **Transitions** | A level change is a camera move, not a cut. The outgoing layer leaves its viewport in `viewHandoff.ts` and the incoming one flies in from it, easing geometrically so a 40x zoom reads as constant motion. Honours `prefers-reduced-motion`. |
| **Base map** | Streets (OpenStreetMap) / Satellite (Esri World Imagery) / Plain, as a segmented control on the map itself, under the toolbar. Both sources are cut to z19, which is roofs and compound walls. |
| **Imagery coverage** | Satellite coverage is not uniform and Esri does not error where it is missing — it returns a grey "Map data not yet available" tile with `200 OK`, which loads fine and hides the good imagery underneath. So the map asks Esri's `tilemap` endpoint how deep the photography goes for the current view (one small cached request above z16), requests that level, and says so: *"Sharpest imagery here is z 18. Closer views are enlarged, not more detailed."* Kano city has z19; Rano and Yola North stop at z18. |
| **Layers** | Boundaries, place names, thematic fill and facility points toggle independently (`store/mapLayerStore.ts`). Only the layers a level actually has appear in the panel. |
| **Coordinates** | Live lat/lon under the pointer and the slippy-map zoom level, in a status strip beside the scale bar; a selected facility's surveyed position is copyable and openable in OpenStreetMap. `lonAtX`/`latAtY` are exact inverses of the forward projection. |
| **My location** | The browser's own fix, on a press and never on mount — the one control that relates the map to the person reading it. A refusal is reported once and dropped. |
| **Scale** | A real surveyor's bar, measured at the view's centre latitude — Mercator's scale factor is 1/cos(lat), so a viewBox unit is not a fixed distance. |
| **Find a place** | A locator in the map's own toolbar, separate from the filter row's Search: it narrows nothing, it resolves a name to a place and goes there, opening the levels in between. Assessed States resolves to a facility; National Coverage stops at the LGA. |
| **Shareable views** | Pan and zoom ride in the URL as `?v=<layer>~x,y,w`, so a link reopens on the framing the sender chose — not just the same scope. Stamped with the layer that wrote it, so a stale value is ignored rather than misapplied, and dropped entirely at full extent. |
| **Save as image** | One click writes a PNG of the map frame — legend, scale bar and attribution included, which is what a screenshot loses — with provenance burnt in underneath. Raster base-map tiles cannot be captured (a serialised SVG may not fetch external resources), so the export warns and Plain is lossless. |
| **Clustering** | Facility points that overlap at the current zoom collapse into a counted marker and dissolve as the reader goes in; the cell is sized in screen pixels, so there is no threshold to tune. |

Base maps default to **Streets**. Tiles are fetched at runtime from
`tile.openstreetmap.org` and `arcgisonline.com`; whether a ministry network may
reach either is a deployment question, and it is answered directly rather than
by abstaining — failed tiles are counted, and a base map that is plainly not
arriving says so and offers **Plain**, which makes no third-party request at
all. The neighbour outlines below national level come from a 65 kB simplified
copy of the ADM1 layer (`npm run geo:context`), not the 2.0 MB original.

## National Coverage

The map is the page: filters across the top, a full-bleed choropleth, and a pane
that always describes whatever is selected. Clicking a state drills into its
LGAs and re-scopes the pane; clicking an LGA goes one level further. Scope lives
in the URL and nowhere else, so the filter row and the map cannot disagree and
every view is a link — `/states/kano/dala?domain=workforce_capacity` is a whole
sentence.

Nothing on that page counts facilities. It answers "where does the country
stand", and the answer is 37 state-level readings from `AreaProfile.coverage` —
a different claim from the facility survey, which lives on Assessed States. The
two are held apart in the type system for that reason.

### The band is state maturity

Every fill, badge and count on the page is the **State Maturity** sheet of
`ERA Dashboard dataset.xlsx`, extracted and checked by `npm run data:maturity`
into the committed `scripts/source-data/state-maturity.json`. The sheet scores
each state 5 / 3 / 1 on six items — governance structure, data governance
policy, digital health strategy, financial commitment for EMR, electricity and
internet — averages them, and cuts the mean at ≥ 4 **Mature**, ≥ 3 **Moderately
mature**, below that **Not mature**.

Maturity is carried on the band scale (Mature → `ready` and so on), so it takes
the band colours and icons, and it is labelled in its own words everywhere it
shows (`MATURITY_LABEL`). Assessed States fills its twelve surveyed states with
the same band under the same labels, so a state is the same colour on both maps.

It covers 31 states. Gombe, Yobe, Kebbi, Enugu, Delta and Ogun read **Not
assessed**: their band is null, the map paints them grey with the key switched
on to say so, and the pane's counts read "31 states classified · 6 not yet
assessed" rather than three shares of a denominator nobody was given.

The domain blocks under the band keep their own sources:

| Domain | Source | States |
|---|---|---|
| Technical Infrastructure | `National Coverage.xlsx` — electricity access and internet subscription | 37 |
| Workforce Capacity | *no desk reading* — null everywhere | 0 |
| Leadership & Governance | the State Maturity sheet's four governance answers | 31 |

### Sub-domains carry no band

Beneath Technical Infrastructure sit Access rates (electricity, internet) and
beneath Workforce, Staff — and **these carry no readiness band, by design**.
They are measurements, not judgements, so band colour never touches them.
Network Coverage and Power were removed: Airtel serviceability and grid
connection were blank in every source row, and MTN serviceability is a
per-facility finding that belongs on Assessed States, where it still is.

### The one banded sub-domain, and why the rule bends here

Leadership's four sub-domains — governance structure, data governance policy,
digital health strategy, financial commitment — **do** carry a band,
and they are the only sub-domains in the model that do. The exception is the
source's own, not this page's.

The sheet scores each answer Yes 5 / Partial 3 / No 1, and bands a state by
cutting the mean of its six items at ≥ 4 and ≥ 3 — on that same 1–5 scale. So one
answer put through the sheet's own cut points lands exactly on a band name:

| Answer | Score | Sheet's band for that score |
|---|---|---|
| Yes | 5 | Ready |
| Partial | 3 | Moderately ready |
| No | 1 | Not ready |

That is the same function on the same scale, not an analogy — which is what
separates these from electricity access, where 45% is a *quantity* and calling
it Not ready would invent a threshold nobody set. `build-maturity.mjs` derives
each sub-domain band by calling the sheet's own banding function rather than
writing a table, so the mapping cannot be typed in wrongly or drift if the cut
points move. The Yes/Partial/No wording is dropped entirely: carrying both would
only raise the question of which is authoritative.

What it buys is one vocabulary — a reader learns the three bands on the map and
reads them unchanged down to the last row of the pane.

**The four do not roll up to the state's band.** The sheet *averages* them with
the two access scores, which is neither of this codebase's rollup rules: Rivers
is Mature with a No on its data governance policy. That is a finding — a state
can be mature overall and still be missing the policy that governs the record —
and nothing rebuilds the state band from the four.

They read two ways, by scope. A state shows its own four rows, answered Yes /
Partial / No; the country shows how the 31 scored states split across each, one
square per state. Roughly half have built the *institution* — a body that owns
digital health, money against an EMR — and very few have written down what
either is for.

## Bands, not scores

This is the one deliberate departure from the sibling dashboard, and it runs all
the way down to the type level. A facility, an LGA, a state or a domain is
**Not ready**, **Moderately ready**, **Ready**, or has no reading at all. There
is no 1–5 score anywhere and no five-level maturity scale.

The reason is that a score invites arithmetic — means, deltas, rankings by
fractions of a point — and every one of those operations claims a precision the
underlying evidence does not carry. Removing the number removes the temptation
structurally: there is no `number` in `AreaProfile` to average, so nothing
downstream can quietly invent one.

The State Maturity sheet is the one source that tested this. It scores its six
items 5 / 3 / 1, averages them, and bands the mean — so the mean was there for
the taking. `build-maturity.mjs` checks it against the sheet's own band and then
drops it: what reaches `AreaProfile` is the state's band and a band per
governance answer, which says everything the average does and one thing more,
namely which of the four is missing. A 2.67 against a 2.33 is a distance six
answers cannot support.

What replaces it is **counts**. Where the sibling ranks states by mean score,
this one ranks them by how many of their facilities are not ready — a figure a
reader can act on without being taught how to read it first.

### One reading

The assessment reports every facility once: **readiness to deploy an EMR** — is
anything blocking installation. It is a mechanical reading of the blocking gaps,
not a judgement:

| | Not ready | Moderately | Ready |
|---|---|---|---|
| **EMR deployment** | 744 | 1,892 | 170 |

Any **Major** Technical Infrastructure action is Not ready; any **Moderate** one
and nothing Major is Moderately ready; neither is Ready. Only Power and
Facility-connectivity produce a Major infrastructure gap, so the bottom band is,
in practice, *this facility has no electricity or no usable connection*.

The rule reads Technical Infrastructure alone. Workforce, workflow and data-use
gaps are graded Major, Moderate or Minor too, but do not enter readiness — 131
Ready facilities carry a Major gap elsewhere, which is raised as a data query.

An earlier costing model reported each facility twice, adding readiness to *run*
an EMR beside readiness to deploy one, and this dashboard showed the pair
because the distance between them was the finding. The revised model withdrew
that column and brought the deployment band onto the same definition — the
technical infrastructure reading — so the two collapsed into one. The rule that
came out of it survives: **never show one band twice under two names.**

The source carries no readiness band per domain. It reports each domain as
its **highest gap severity** — Major, Moderate, Minor or no gap — and Assessed
States shows that beside readiness, in the urgency inks rather than the band
fills, because it is the urgency scale: a domain's severity is the worst urgency
among the actions its gaps call for. Ticking a domain narrows the gaps and
costs counted; it never re-reads readiness.

### Urgency

Every action carries one of four urgencies, worst first — **Major**,
**Moderate**, **Minor**, **Long-term** — and a **phase**: before, during or
after deployment. They are separate because Minor spans two phases: the sheet
has minor gaps to fix before go-live (tablets, device maintenance, most
workforce work) and minor actions to complete during it (wiring, sockets,
furniture). The Investment Plan groups by either.

Two rules do all the rolling up, both in `src/lib/bands.ts`:

- `dominantBand(distribution)` — a population is Ready if a majority of its
  banded members are Ready, Not ready if a majority are Not ready, and
  Moderately ready otherwise. Conservative on purpose: an even split is not a
  strong result.
- `bandShare(distribution, band)` — the share of a population in one band.
  Returns `null` rather than `0` for an empty population, so "nothing was
  measured" never renders as a finding.

A `null` band means *not assessed* and must stay visually distinct from Not
ready everywhere.

## Evidence grades

12 states were assessed by facility survey; the remaining 24 plus the FCT by
desk review, which yields a state-level reading and nothing underneath it. The
two are different kinds of claim and never render in the same visual language —
the choropleth hatches desk-reviewed polygons, and tables show a dash where a
facility count would go rather than a zero.

## What it costs, and what the total leaves out

**₦7.26bn** across the 2,806 facilities, every figure the source's own and
reconciled to the workbook's Cost summary to the naira. The Investment Plan
itemises it; three properties of the source are worth knowing before reading
that page.

**All of it is Technical Infrastructure.** Every workforce, workflow and
data-use action is priced ₦0 or left unpriced — recorded work, costed elsewhere
or not at all. A real zero is not a blank, and the schedule says how many lines
carry each.

| Urgency | Total |
|---|---:|
| Major | ₦2,334,535,000 |
| Moderate | ₦2,321,235,000 |
| Minor | ₦2,222,924,333 |
| Long-term | ₦376,500,000 |

**4,654 actions carry no price at all** — routine device maintenance, naming an
EMR focal person, and the lockable-door checks the sheet leaves "before
costing". The total excludes them and says so. See
[`docs/data-queries/`](docs/data-queries/).

**Some actions are bought by the unit.** One cell can buy five tablets, or two
desks and a fan, for one cost. The ingest splits each into unit actions — a
type, a quantity, a unit price — and checks the split adds back to the cell, so
the plan reads *5,920 tablets at ₦233,333* rather than a line for every
combination. The quantities live on each facility (`FacilitySummary.actions`),
the unit prices in the generated catalogue, and `facilityGapActions` joins them.

## Deployment

Vercel for now; AWS is the final home (`server/README.md` covers both). The
build is `npm run build:vercel`, set in `vercel.json`: `npm run build` writes
`dist/`, then `scripts/build-vercel.mjs` writes Vercel's build output — the
site, the AI assistant's endpoint as a function, and the routes. The routes
live in that script, not `vercel.json`. Everything that is not `/api`, `/data`,
`/geo`, `/assets` or the favicon goes to `index.html`, which is what a
client-side router needs to survive a hard refresh on a deep link.

One invariant is worth repeating here, because the intuitive change breaks
production silently: **`public/data/` is committed, generated though it is.**
`npm run build` never runs the generator, so nothing on Vercel can rebuild it.
Ignoring it still yields a green build and an app whose every page renders
empty.
