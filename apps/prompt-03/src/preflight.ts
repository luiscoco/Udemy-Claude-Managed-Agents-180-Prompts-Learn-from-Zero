import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createClient, hasSessions } from './client.js';
import { validateConfig } from './config.js';

const require = createRequire(import.meta.url);
const sdkVersion = JSON.parse(readFileSync(join(dirname(require.resolve('@anthropic-ai/sdk')), 'package.json'), 'utf8')).version as string;

export function preflight(input: unknown, simulateMissingSurface = false) {
  const validated = validateConfig(input);
  const runtime = { node: process.version, sdk: sdkVersion, nodeSupported: Number(process.versions.node.split('.')[0]) >= 24 };
  const trace = [{ step: 'Validate configuration', state: validated.ok ? 'passed' : 'failed' }];
  if (!validated.ok) return { ready: false, runtime, issues: validated.issues, trace, providerRequests: 0 };
  const client = createClient(validated.config);
  const compatible = hasSessions(simulateMissingSurface ? {} : client);
  trace.push({ step: 'Check beta.sessions.create', state: compatible ? 'passed' : 'failed' });
  trace.push({ step: 'Check Node.js 24+', state: runtime.nodeSupported ? 'passed' : 'failed' });
  const ready = compatible && runtime.nodeSupported;
  trace.push({ step: 'Provider request', state: 'not sent' });
  return {
    ready, runtime, trace, providerRequests: 0,
    issues: [
      ...(!compatible ? [{ field: 'SDK', message: 'beta.sessions.create is unavailable. Restore pinned packages with npm ci.' }] : []),
      ...(!runtime.nodeSupported ? [{ field: 'Node.js', message: 'Use Node.js 24 or newer.' }] : []),
    ],
    requestPlan: ready ? { method: 'POST', path: '/v1/sessions', headers: { 'anthropic-beta': 'managed-agents-2026-04-01' },
      body: { agent: validated.config.AGENT_ID, environment_id: validated.config.ENVIRONMENT_ID } } : undefined,
  };
}
