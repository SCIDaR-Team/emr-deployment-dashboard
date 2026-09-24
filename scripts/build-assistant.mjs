/**
 * Bundle the AI assistant for AWS Lambda.
 *
 *   dist-server/index.mjs   the handler (`index.handler`), OpenAI SDK included
 *   dist-server/data/*.json the dashboard data it answers from
 *
 * Zip `dist-server/` and deploy it as a Node.js 20+ function with a Function
 * URL in RESPONSE_STREAM mode. See server/README.md.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist-server');
const DATA = ['facilities-summary.json', 'states.json', 'national.json'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(resolve(OUT, 'data'), { recursive: true });

await build({
  entryPoints: [resolve(ROOT, 'server/assistant/lambda.ts')],
  outfile: resolve(OUT, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // The `@/` path alias used by the shared dashboard code.
  tsconfig: resolve(ROOT, 'tsconfig.server.json'),
  // ESM output still meets the odd CommonJS dependency; give it `require`.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'info',
});

for (const f of DATA) copyFileSync(resolve(ROOT, 'public/data', f), resolve(OUT, 'data', f));
console.log(`Copied ${DATA.length} data files to dist-server/data.`);
