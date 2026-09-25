/**
 * Bundle one of the assistant's handlers into a directory a host can run:
 *
 *   <outDir>/<file>        the handler, OpenAI SDK included
 *   <outDir>/data/*.json   the dashboard data it answers from
 *
 * Shared by `build-assistant.mjs` (AWS Lambda) and `build-vercel.mjs` (Vercel).
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = ['facilities-summary.json', 'states.json', 'national.json'];

export async function bundleAssistant({ entry, outDir, file = 'index.mjs', target = 'node20' }) {
  mkdirSync(resolve(outDir, 'data'), { recursive: true });

  await build({
    entryPoints: [resolve(ROOT, entry)],
    outfile: resolve(outDir, file),
    bundle: true,
    platform: 'node',
    target,
    format: 'esm',
    // The `@/` path alias used by the shared dashboard code.
    tsconfig: resolve(ROOT, 'tsconfig.server.json'),
    // ESM output still meets the odd CommonJS dependency; give it `require`.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    legalComments: 'none',
    logLevel: 'info',
  });

  for (const f of DATA) copyFileSync(resolve(ROOT, 'public/data', f), resolve(outDir, 'data', f));
  console.log(`Copied ${DATA.length} data files to ${resolve(outDir, 'data')}.`);
}
