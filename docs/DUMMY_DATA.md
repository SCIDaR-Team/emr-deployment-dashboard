# The synthetic dataset

Everything under `public/data/` is invented. No assessment data, no source
workbook and no ETL exist in this repository.

## Generating it

```bash
npm run data:generate
```

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

## There are no scores

The model carries bands and counts only — see the header comment in
`src/lib/types.ts` for why. If you find yourself wanting to average something,
count it instead.
