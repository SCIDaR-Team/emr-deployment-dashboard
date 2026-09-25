/**
 * Bundle the AI assistant for AWS Lambda.
 *
 *   dist-server/index.mjs   the handler (`index.handler`), OpenAI SDK included
 *   dist-server/data/*.json the dashboard data it answers from
 *
 * Zip `dist-server/` and deploy it as a Node.js 20+ function with a Function
 * URL in RESPONSE_STREAM mode. See server/README.md.
 */
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, bundleAssistant } from './bundle-assistant.mjs';

const OUT = resolve(ROOT, 'dist-server');
rmSync(OUT, { recursive: true, force: true });
await bundleAssistant({ entry: 'server/assistant/lambda.ts', outDir: OUT });
