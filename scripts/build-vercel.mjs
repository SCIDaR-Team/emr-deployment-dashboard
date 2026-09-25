/**
 * The Vercel deployment, written in Vercel's Build Output API format so the
 * assistant's endpoint can ship with the static site:
 *
 *   .vercel/output/static/                     the site (`dist/`, from `vite build`)
 *   .vercel/output/functions/api/assistant.func the endpoint, bundled with its data
 *   .vercel/output/config.json                 caching headers and routes
 *
 * Runs after `npm run build` — `vercel.json` sets the build command. Vercel's
 * own `api/` folder can't be used: it compiles file by file, which leaves the
 * server's ESM imports without extensions and the `@/` alias unresolved.
 *
 * The routes here are the whole routing config; Vercel ignores `vercel.json`'s
 * `headers` and `rewrites` once this output exists.
 */
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, bundleAssistant } from './bundle-assistant.mjs';

const OUT = resolve(ROOT, '.vercel/output');
const DIST = resolve(ROOT, 'dist');
if (!existsSync(resolve(DIST, 'index.html'))) {
  throw new Error('dist/ is missing — run `npm run build` first.');
}

rmSync(OUT, { recursive: true, force: true });
cpSync(DIST, resolve(OUT, 'static'), { recursive: true });

const FUNC = resolve(OUT, 'functions/api/assistant.func');
await bundleAssistant({ entry: 'server/assistant/vercel.ts', outDir: FUNC, target: 'node22' });
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
json(resolve(FUNC, '.vc-config.json'), {
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  supportsResponseStreaming: true,
  maxDuration: 60,
  memory: 1024,
});

// The scenario and explain endpoints are the same function, so each request
// keeps its own path and the handler can tell them apart.
mkdirSync(resolve(OUT, 'functions/api/assistant'), { recursive: true });
for (const name of ['scenario', 'explain']) {
  symlinkSync('../assistant.func', resolve(OUT, `functions/api/assistant/${name}.func`), 'dir');
}

json(resolve(OUT, 'config.json'), {
  version: 3,
  routes: [
    {
      src: '^/assets/(.*)$',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    {
      src: '^/(data|geo)/(.*)$',
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
      continue: true,
    },
    { handle: 'filesystem' },
    // Anything else that isn't a data file or asset is a page of the app.
    { src: '^/(?!api/|data/|geo/|assets/|favicon).*$', dest: '/index.html' },
  ],
});
console.log(`Wrote the Vercel build output to ${OUT}.`);
