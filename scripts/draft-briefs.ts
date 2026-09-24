/**
 * Draft the state briefs.
 *
 *   npm run briefs:draft                 every assessed state without a brief yet
 *   npm run briefs:draft -- --state kano one state
 *   npm run briefs:draft -- --force      redraft drafts too (never an approved brief)
 *   npm run briefs:draft -- --force --include-approved   …and approved ones
 *
 * For each state: compute its facts from the dashboard data (the same
 * `briefFacts` the brief page shows), have the OpenAI model write six short
 * sections around them, check every figure in the text against the facts, and
 * write `src/content/briefs/<state-id>.md` with `status: draft`. A person then
 * reviews it and sets `status: approved`; only approved briefs reach the live
 * site. Reads OPENAI_API_KEY and OPENAI_MODEL from `.env.local`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import OpenAI from 'openai';
import { briefFacts, type BriefFacts } from '../src/lib/briefs/facts';
import { parseBrief, serializeBrief } from '../src/lib/briefs/document';
import { unverifiedFigures } from '../src/lib/briefs/verify';
import { loadDashboardData } from '../server/assistant/data';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'src/content/briefs');

const SECTIONS = [
  ['summary', 'Summary'],
  ['readiness', 'Readiness'],
  ['gaps', 'Main gaps'],
  ['investment', 'Investment'],
  ['unlocks', 'What funding unlocks'],
  ['maturity', 'Leadership and maturity'],
] as const;

const INSTRUCTIONS = `You write one-page state briefs for NPHCDA planners about how ready a state's primary health care facilities are for an electronic medical record (EMR) system, and what it will cost.

You are given the state's facts as JSON. Write six short sections from them:
- summary: two or three sentences — the state's position and the single most useful thing to know.
- readiness: how many facilities are Ready, Moderately ready and Not ready, and how the state compares with the national share Ready and its rank.
- gaps: the most common gaps and the domains with the most Major gaps; name the LGAs with the most Not ready facilities.
- investment: the plan's total, what is needed before, during and after deployment, and cost per facility against the national figure.
- unlocks: what each of the six fixes would do alone and what the four combinations would do (Ready before + Unlocked = Total Ready), naming the fix that unlocks most for its cost, and what the given budgets buy.
- maturity: the State Maturity band, the leadership and governance scores, and electricity and internet access where given.

Rules:
- Use ONLY figures from the facts, copied exactly as written there (for example "₦1.2bn", "67.4%", "1,125"). Do not calculate, round, add or invent any number, year or percentage.
- If a fact is missing or null, leave it out rather than guess.
- Plain, neutral English for health managers. No jargon, no hype, no recommendations beyond what the figures show.
- Each section 40 to 110 words. Prose, or up to four short bullets starting with "- ". No headings inside a section.
- Ready, Moderately ready and Not ready describe facility readiness; Mature, Moderately mature and Not mature describe the state's maturity. Do not mix them.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: SECTIONS.map(([k]) => k),
  properties: Object.fromEntries(SECTIONS.map(([k]) => [k, { type: 'string' }])),
};

function args() {
  const a = process.argv.slice(2);
  const i = a.indexOf('--state');
  return {
    state: i >= 0 ? a[i + 1]?.toLowerCase() : undefined,
    force: a.includes('--force'),
    includeApproved: a.includes('--include-approved'),
  };
}

async function draft(client: OpenAI, model: string, facts: BriefFacts): Promise<string> {
  // The fingerprint means nothing to the model; everything else is the brief.
  const forModel: Partial<BriefFacts> = { ...facts };
  delete forModel.version;
  const response = await client.responses.create({
    model,
    instructions: INSTRUCTIONS,
    input: [{ role: 'user', content: JSON.stringify(forModel, null, 2) }],
    store: false,
    max_output_tokens: 2500,
    text: { format: { type: 'json_schema', name: 'state_brief', schema: SCHEMA, strict: true } },
    ...(process.env.OPENAI_REASONING_EFFORT
      ? { reasoning: { effort: process.env.OPENAI_REASONING_EFFORT as 'low' | 'medium' | 'high' } }
      : {}),
  });
  const sections = JSON.parse(response.output_text) as Record<string, string>;
  return SECTIONS.map(([key, heading]) => `## ${heading}\n\n${(sections[key] ?? '').trim()}`).join(
    '\n\n',
  );
}

async function main() {
  const envFile = resolve(ROOT, '.env.local');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const { OPENAI_API_KEY, OPENAI_MODEL } = process.env;
  if (!OPENAI_API_KEY || !OPENAI_MODEL) {
    console.error('Set OPENAI_API_KEY and OPENAI_MODEL in .env.local first.');
    process.exit(1);
  }

  const opts = args();
  const data = await loadDashboardData(resolve(ROOT, 'public/data'));
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  mkdirSync(OUT, { recursive: true });

  const states = data.states.filter(
    (s) => data.facilitiesByState.get(s.name)?.length && (!opts.state || s.id === opts.state),
  );
  if (!states.length) {
    console.error(
      opts.state ? `No assessed state with id "${opts.state}".` : 'No assessed states.',
    );
    process.exit(1);
  }

  let written = 0;
  for (const state of states) {
    const file = resolve(OUT, `${state.id}.md`);
    const existing = existsSync(file) ? parseBrief(readFileSync(file, 'utf8')) : null;
    if (existing?.status === 'approved' && !(opts.force && opts.includeApproved)) {
      console.log(`- ${state.name}: approved, left alone`);
      continue;
    }
    if (existing && !opts.force) {
      console.log(`- ${state.name}: draft exists (use --force to redraft)`);
      continue;
    }

    const facts = briefFacts(state, data.facilities)!;
    process.stdout.write(`- ${state.name}: drafting… `);
    const body = await draft(client, OPENAI_MODEL, facts);
    writeFileSync(
      file,
      serializeBrief({
        state: state.name,
        status: 'draft',
        factsVersion: facts.version,
        drafted: new Date().toISOString().slice(0, 10),
        model: OPENAI_MODEL,
        reviewedBy: '',
        body,
      }),
    );
    written += 1;
    const unknown = unverifiedFigures(body, facts);
    console.log(
      unknown.length
        ? `done — CHECK these figures, not in the data: ${unknown.join(', ')}`
        : 'done — every figure matches the data',
    );
  }
  console.log(
    `\n${written} draft(s) written to src/content/briefs/. Review, then set status: approved.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
