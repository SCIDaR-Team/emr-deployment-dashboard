# The synthetic dataset

Everything under `public/data/` is invented. No assessment data, no source
workbook and no ETL exist in this repository.

## Generating it

```bash
npm run geo:build      # boundaries — only after changing the source or the simplifier
npm run data:generate  # the dataset itself
```

`geo:build` reads OCHA's COD-AB ADM2 layer (774 LGAs, 5.8 MB) and writes
`public/geo/lgas/<stateId>.json` — 37 files, 927 kB in total, largest state
50 kB — plus `public/geo/lga-index.json`. Nothing ever draws more than one
state's LGAs at a time, so splitting by the unit the UI actually asks for is
what keeps the drill-down instant. `data:generate` then reads that index, which
is the source of truth for which LGAs exist.

Writes five files to `public/data/` and one generated module to
`src/lib/nationalSplit.ts`. All six are committed — the Vercel build does not
run the generator, so nothing in CI can recreate them.

The generator is seeded (`SEED` at the top of
`scripts/generate-dummy-data.mjs`). Two runs produce byte-identical output, so
re-running it without changing the script produces an empty diff. That is the
only reason it is safe to commit a 2 MB generated dataset.

## What is real

The geography. State names, their geopolitical zones, and the 305 LGAs of the
12 primary states are read out of `public/geo/*.geojson`, so every `stateId` and
`lgaId` in the data joins to a polygon the maps can draw. Facility coordinates
are jittered inside their own LGA's bounding box, which is why a state map looks
like a state rather than a scatter plot.

The sample sizes are real too — Kano's 444 facilities, Rivers' 146 — carried
over from the assessment so the synthetic population is distributed the way the
real one was.

## What is invented

Every finding. Bands, domain readings, investment quantities and all costs.

The invented findings are shaped rather than uniform, because a flat random
split would demonstrate nothing about how the dashboard reads. `DOMAIN_WEIGHTS`
in the generator is the whole national result in one table:

| Domain | Not ready | Moderately ready | Ready |
|---|---|---|---|
| Technical infrastructure | 45 | 38 | 17 |
| Workforce capacity | 12 | 46 | 42 |
| Workflow & transition | 34 | 46 | 20 |
| Data use & reporting | 28 | 45 | 27 |

Technical infrastructure is the binding constraint; workforce capacity is the
strongest domain. Each state draws a strength offset applied to every facility
in it, so states differ from each other and a ranked table has something to
rank. Urban facilities do better than rural ones.

Current output: **3.2% ready, 39.4% moderately ready, 57.4% not ready** across
2,825 facilities.

## The coverage layer holds together

`AreaProfile.coverage` — what National Coverage reads — is built bottom-up and
obeys three rules, enforced by a validator that fails the generator rather than
letting an incoherent dataset reach the page:

1. **An area is no readier than its weakest core domain, or than its parts.**
   Overall = min(technical infrastructure, workforce, majority of children). No
   state reads Ready above a Moderately ready domain, and none reads Moderately
   ready while two-thirds of its LGAs are Not ready.
2. **A parent's domain band is its children's majority.** More than half must
   agree, or the parent lands Moderately ready — an even split is not a strong
   result.
3. **The figures match the band above them.** An LGA's network and grid
   percentages come from ranges belonging to its infrastructure band, its staff
   count from ranges belonging to its workforce band. The ranges overlap at the
   edges, so a reader cannot simply read the band off the number.

Rule 3 is where the synthetic data is *tidier* than reality: sub-domain figures
do not determine bands in the real source model, and a genuinely Ready state
might have mediocre coverage. But a demo whose numbers contradict its colours
teaches people to distrust the page, so the demo is coherent even where reality
may not be.

Current spread: **6 states ready, 13 moderately ready, 18 not ready.**

## There are no scores

The model carries bands and counts only — see the header comment in
`src/lib/types.ts` for why. If you find yourself wanting to average something,
count it instead.
