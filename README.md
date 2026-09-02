# EMR Deployment Dashboard

Decision-support dashboard for planning EMR deployment across Nigeria's primary
healthcare facilities, for **NPHCDA**, in partnership with NTBLCP, The Global
Fund and Solina.

>  **The figures are the assessment's.** `public/data/` is built by
> `npm run data:ingest` from `List of gaps and interventions per facility.csv` —
> 2,806 facilities across 12 states — joined with `Raw data with readiness
> level.xlsx`, the raw ODK export, for each facility's rural/urban setting. See
> [`docs/ASSESSMENT_DATA.md`](docs/ASSESSMENT_DATA.md) for what the dataset
> contains, and [`docs/data-queries/`](docs/data-queries/) for the two things in
> it the assessment team still needs to settle.

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

`public/data/` is committed, so the app runs immediately after install. Run
`npm run data:ingest` only when the sheet has changed — add `-- --fetch` to
re-download it first.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build |
| `npm run geo:build` | Rebuild the per-state LGA boundary files |
| `npm run data:ingest` | Rebuild `public/data/` from the assessment CSV |
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
| **Drill-down** | Strictly progressive: a state resolves into its LGAs, an LGA into the facilities inside it, and a facility into itself. Each level only draws the features that belong to it, so facility points never appear above their own LGA. Click a feature, or simply keep zooming — overshooting a layer's useful range drills through it, and pulling back out past its extent drills back up. |
| **Selecting a facility** | A drill like any other, not a highlight: the camera flies to the facility at the layer's deepest zoom, names it on the map, and shows its coordinate card. Clicking it again, or the breadcrumb, flies back out to the LGA. |
| **Transitions** | A level change is a camera move, not a cut. The outgoing layer leaves its viewport in `viewHandoff.ts` and the incoming one flies in from it, easing geometrically so a 40x zoom reads as constant motion. Honours `prefers-reduced-motion`. |
| **Layers** | Boundaries, place names, thematic fill and facility points toggle independently (`store/mapLayerStore.ts`), over an optional OpenStreetMap or Esri satellite base map. Only the layers a level actually has appear in the panel. |
| **Coordinates** | Live lat/lon under the pointer, and a selected facility's surveyed position copyable and openable in OpenStreetMap. `lonAtX`/`latAtY` are exact inverses of the forward projection. |
| **Scale** | A real surveyor's bar, measured at the view's centre latitude — Mercator's scale factor is 1/cos(lat), so a viewBox unit is not a fixed distance. |
| **Find a place** | A locator in the map's own toolbar, separate from the filter row's Search: it narrows nothing, it resolves a name to a place and goes there, opening the levels in between. Assessed States resolves to a facility; National Coverage stops at the LGA. |
| **Shareable views** | Pan and zoom ride in the URL as `?v=<layer>~x,y,w`, so a link reopens on the framing the sender chose — not just the same scope. Stamped with the layer that wrote it, so a stale value is ignored rather than misapplied, and dropped entirely at full extent. |
| **Save as image** | One click writes a PNG of the map frame — legend, scale bar and attribution included, which is what a screenshot loses — with provenance burnt in underneath. Raster base-map tiles cannot be captured (a serialised SVG may not fetch external resources), so the export warns and Plain is lossless. |
| **Clustering** | Facility points that overlap at the current zoom collapse into a counted marker and dissolve as the reader goes in; the cell is sized in screen pixels, so there is no threshold to tune. |

Base maps default to **plain**, which makes no third-party request. Streets and
satellite tiles are fetched at runtime from `tile.openstreetmap.org` and
`arcgisonline.com` — whether a ministry network may reach either is a deployment
question, so the reader opts in.

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

Beneath the two domains sit sub-domains — Access rates (electricity, internet)
and Staff — and **these carry no readiness band, by design**. They are
measurements, not judgements, so band colour never touches them. Network
Coverage and Power were removed: Airtel serviceability and grid connection were
blank in every source row, and MTN serviceability is a per-facility finding that
belongs on Assessed States, where it still is.

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

What replaces it is **counts**. Where the sibling ranks states by mean score,
this one ranks them by how many of their facilities are not ready — a figure a
reader can act on without being taught how to read it first.

### Two readings, not one

The assessment reports every facility twice: readiness to **use** an EMR, and
readiness to **deploy** one. They are different questions — one is about how
well a facility could run the system, the other about whether anything blocks
installing it — and they disagree for 553 of the 2,806 facilities.

Both are shown together, everywhere: an area gets both distributions, a facility
gets both bands. A control to switch between them would make the reader hold one
number in their head while looking at the other, and the interesting fact here is
the *distance* between the two.

|  | Not ready | Moderately | Ready |
|---|---|---|---|
| **EMR use** | 1,340 | 1,395 | 71 |
| **EMR deployment** | 1,340 | 842 | 624 |

The Not-ready column is the same 1,340 facilities under both readings, not
merely the same count — a critical gap sinks either. So 624 facilities are clear
to deploy into and 71 are in shape to actually run an EMR, and six of the twelve
states have none at all in the second column.

Tick a domain and both collapse to that domain's band. All four domain readings
are EMR-*use* readings; the source has no per-domain deployment band, so under a
domain the pair would be one row printed twice.

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

## Deployment

Vercel, static, from `vercel.json`. The build is `npm run build`; the output is
`dist/`. The rewrite rule sends everything that is not `/data`, `/geo`,
`/assets` or the favicon to `index.html`, which is what a client-side router
needs to survive a hard refresh on a deep link.

One invariant is worth repeating here, because the intuitive change breaks
production silently: **`public/data/` is committed, generated though it is.**
`npm run build` never runs the generator, so nothing on Vercel can rebuild it.
Ignoring it still yields a green build and an app whose every page renders
empty.
