# State briefs

One file per assessed state, `<state-id>.md`, holding the written part of that
state's brief. The figures on the brief page are computed from the data; this
file is the narrative around them.

## Drafting

```bash
npm run briefs:draft
```

This drafts every assessed state that doesn't have a file yet, using the
OpenAI key and model in `.env.local`. Other forms:

- `npm run briefs:draft -- --state kano` drafts one state.
- `npm run briefs:draft -- --force` redrafts existing drafts. It never
  overwrites an approved brief unless `--include-approved` is added too.

The script says, for each state, whether every figure in the text matches the
data, or which figures to check.

## Reviewing

1. Open the brief. With `npm run dev`, go to Assessed States, pick the state
   and choose **State brief**. Drafts show with a yellow banner listing any
   figure that isn't in the data.
2. Edit this file as you would any text: reword, cut, correct.
   - Keep every figure exactly as the data gives it (e.g. `₦1.2bn`, `16.4%`).
   - Keep the `## ` section headings.
3. When it's right, set these in the header:
   - `status: approved`
   - `reviewedBy:` your name
4. Commit. Only approved briefs appear on the live site.

## When the data changes

- Each brief records the version of the data it was written against
  (`factsVersion`). If the data changes, the brief page marks the brief
  **out of date**.
- The test suite also fails until the brief is redrafted and approved again,
  so an approved brief never quietly disagrees with the dashboard.
