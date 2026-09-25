# The "Ask the data" assistant

A chat panel on the dashboard that answers questions about readiness, gaps,
costs, scenarios and State Maturity. The answers are written by an OpenAI model,
but every figure comes from the dashboard's own data. The model calls lookup
tools over the published JSON (`public/data`) and quotes what they return. It
never answers figures from memory. Each answer links to the page that shows it.

```
browser ──POST /api/assistant──▶ Vercel function or Lambda ──▶ OpenAI Responses API
   ▲                                 │   ▲
   └────── streamed answer ◀─────────┘   └── tools over facilities-summary / states / national JSON
```

## Files

| File | What it does |
|---|---|
| `assistant/data.ts` | Loads and indexes the dashboard data. Coordinates and free-text notes never reach the model. |
| `assistant/tools.ts` | The eight lookup tools, reusing the dashboard's own calculations (scenario engine, cost split). |
| `assistant/prompt.ts` | The model's standing instructions. |
| `assistant/scenario.ts` | "Describe a scenario": words to the Scenarios section's settings, every value checked against the data. |
| `assistant/agent.ts` | One answer: stream, run the tools the model asks for, repeat. |
| `assistant/http.ts` | The endpoint: input limits, rate limit, server-sent events, friendly errors. |
| `assistant/node.ts` | The endpoint as a Node `(req, res)` handler, shared by dev and Vercel. |
| `assistant/lambda.ts` | AWS Lambda handler (Function URL, response streaming). |
| `assistant/vercel.ts` | Vercel function handler. |
| `assistant/dev.ts` | The same endpoint inside `npm run dev`. |
| `src/modules/assistant/` | The chat panel in the dashboard. |
| `src/modules/investment/scenario/DescribeScenario.tsx` | The "Describe" box in the Scenarios section. |
| `assistant/explain.ts` | "Explain this chart": one call, no tools, from the figures a section is showing. |
| `src/lib/explain/charts.ts` | The charts that can be explained, how each is read, and the request's limits. |
| `src/modules/explain/` | The Explain button and panel, and how sections hand over their figures. |

## Endpoints

| Path | What it does |
|---|---|
| `POST /api/assistant` | The chat. `{ messages }` in; a stream of server-sent events out. |
| `POST /api/assistant/explain` | Explain a chart. `{ chart, title, scope, tables }` in — the figures the section shows, as text; a stream of server-sent events out, like the chat. The chart must be one in `src/lib/explain/charts.ts`, and the request is capped in size. |
| `POST /api/assistant/scenario` | Describe a scenario. `{ text }` in; `{ view, specs, summary, ignored }` or `{ error }` out, as JSON. The model only reads the words as settings; the section's own engine computes the figures. |

## Settings

| Variable | Where | Required | Meaning |
|---|---|---|---|
| `OPENAI_API_KEY` | server | yes | OpenAI project key, or the key for the provider in `OPENAI_BASE_URL`. On AWS, keep it in Secrets Manager. |
| `OPENAI_MODEL` | server | yes | The model to use. Pick a current model that supports function calling and JSON-schema output. |
| `OPENAI_BASE_URL` | server | no | Another provider with an OpenAI-compatible Responses API. Groq: `https://api.groq.com/openai/v1` with `openai/gpt-oss-120b`. Leave `OPENAI_REASONING_EFFORT` unset there — it asks for OpenAI's encrypted reasoning. Unset means OpenAI. |
| `OPENAI_REASONING_EFFORT` | server | no | `low` / `medium` / `high`. Set this **only** for a reasoning model; leave unset otherwise. |
| `OPENAI_MAX_OUTPUT_TOKENS` | server | no | Cap on one response's length. Default 1500. |
| `ASSISTANT_ALLOWED_ORIGIN` | server | no | Only if the page and the endpoint are on different origins (see CORS below). |
| `DATA_DIR` | server | no | Where the data JSON is. Defaults to `data/` beside the handler. |
| `VITE_ASSISTANT_ENABLED` | site build | for production | `true` to show the panel in a production build. Leave it off for any deployment without the endpoint. `npm run dev` always shows it. |
| `VITE_ASSISTANT_URL` | site build | no | The endpoint's URL. Defaults to `/api/assistant` on the site's own origin. |

## Try it locally

1. Copy `.env.example` to `.env.local` and fill in `OPENAI_API_KEY` and
   `OPENAI_MODEL`. `.env.local` is git-ignored.
2. `npm run dev`. The endpoint is served at `/api/assistant` by the dev server,
   and the "Ask the data" button is at the top right of every module page's
   header (not the landing page or the state briefs), or press `/`. Below
   1024px wide it is the icon in the top bar. Without a key, the panel shows
   what is missing.

## Deploy on Vercel (for now)

`vercel.json` already sets the build command, `npm run build:vercel`. It builds
the site and bundles the endpoint as a Vercel function at `/api/assistant`
(with `/scenario` and `/explain`), with the data beside it.

1. In the Vercel project's **Settings → Environment Variables**, add
   `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_BASE_URL` if not OpenAI.
   Mark the key **Sensitive**.
2. Add `VITE_ASSISTANT_ENABLED=true` to show the panel. It is read at build
   time, so redeploy after adding it.
3. Redeploy. The function answers from the data in that deployment, so a data
   change ships with the site as usual.

The function runs for up to 60 seconds per answer and streams it. Nothing is
needed for CORS: the endpoint is on the site's own origin.

## Deploy on AWS

1. **Build the function:** `npm run build:assistant` writes `dist-server/`
   (the handler plus the three data files). Zip the *contents* of `dist-server/`.
2. **Create the Lambda:**
   - Runtime: Node.js 20 or later.
   - Handler: `index.handler`.
   - Memory: 512 MB is enough. The data is about 6 MB in memory.
   - Timeout: 60 seconds.
   - Environment: the variables above. Read the key from Secrets Manager.
3. **Function URL:** auth type `NONE`, **invoke mode `RESPONSE_STREAM`**.
   Without streaming, the answer arrives all at once at the end.
4. **CloudFront:** on the site's distribution, add an origin for the Function
   URL and a behaviour for `/api/assistant*`, so it covers both endpoints:
   - Methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`
   - Caching: disabled
   - Origin request policy: `AllViewerExceptHostHeader`

   The site then calls the endpoint on its own origin. No CORS is needed and
   `ASSISTANT_ALLOWED_ORIGIN` stays unset.
5. **Build the site** with `VITE_ASSISTANT_ENABLED=true npm run build`.
6. **Redeploy the function whenever the data changes.** It answers from the
   copy of the data bundled into it.

## Cost and abuse controls

The dashboard has no sign-in, so anyone who can open it can use the assistant.
Layered controls:

- **Per request:** at most 20 messages of history, 2,000 characters per
  question, 6 lookup rounds, and a capped answer length.
- **Per visitor:** 20 questions per 10 minutes per IP, per function instance.
  This slows down one person; it isn't a hard limit across many instances.
- **At the edge:** add an AWS WAF rate-based rule on `/api/assistant`, e.g.
  100 requests per 5 minutes per IP. **Recommended before going live.**
- **At OpenAI:** set a monthly budget and usage alerts on the OpenAI project.
  This is the only hard cap on spend.

## Data sent to OpenAI

- The conversation text.
- The results of the lookups the model asks for. These are names, places,
  readiness bands, gaps and costs from the published dashboard data. They
  **never include facility coordinates or assessors' free-text notes.**
- For "Explain", the totals a section shows (counts, shares, costs by state,
  band or group), the area, and the active filters. No facility-level rows.

Requests are sent with `store: false`, so OpenAI does not keep the conversation
as a stored response.

With `OPENAI_BASE_URL` set, all of this goes to that provider instead, under
its own data terms.

There is no agreed data policy yet for sending facility data to a model
provider. Confirm with NPHCDA before going live.
