import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { API_VERSION, BETA, demoBody, httpSession, inspectRequest, rawBody, rawHeaders,
  sdkSession, type Input, type RequestProjection } from './requests.js';

const fixtureKey = 'classroom-only-synthetic-key';
type FixtureSession = { id: string; type: 'session'; status: 'idle'; agent: { id: string; version: number }; environment_id: string };
type Trace = { request: RequestProjection; status: number; response: unknown };

export function classroomTransport() {
  const traces: Trace[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const projection = await inspectRequest(request);
    const authorized = request.headers.get('authorization') === `Bearer ${fixtureKey}`
      || request.headers.get('x-api-key') === fixtureKey;
    const betas = (request.headers.get('anthropic-beta') || '').split(',').map(value => value.trim()).filter(Boolean);
    let status = 200;
    let message = '';
    if (!authorized) { status = 401; message = 'The fixture requires an API-key credential.'; }
    else if (request.headers.get('anthropic-version') !== API_VERSION) {
      status = 400; message = `The fixture expects anthropic-version ${API_VERSION}.`;
    } else if (!betas.includes(BETA) || betas.some(beta => beta !== BETA)) {
      status = 400; message = `The fixture requires the supported beta ${BETA}.`;
    } else if (request.headers.get('content-type') !== 'application/json') {
      status = 415; message = 'The fixture expects application/json.';
    }
    let response: unknown;
    if (status === 200) {
      const session: FixtureSession = { id: `demo_session_${randomUUID()}`, type: 'session', status: 'idle',
        agent: { id: projection.body.agent, version: 1 }, environment_id: projection.body.environment_id };
      response = session;
    } else response = { type: 'error', error: { type: status === 401 ? 'authentication_error' : 'invalid_request_error', message } };
    traces.push({ request: projection, status, response });
    return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { transport, traces };
}

function authentication(request: RequestProjection) {
  if (request.headers.authorization || request.headers['x-api-key']) return 'API-key authentication';
  return 'Missing authentication';
}

export function compareRequests(sdk: RequestProjection, http: RequestProjection) {
  const rows = [
    { field: 'Method and endpoint', sdk: `${sdk.method} ${sdk.endpoint}`, http: `${http.method} ${http.endpoint}` },
    { field: 'Authentication', sdk: authentication(sdk), http: authentication(http) },
    { field: 'Base API version', sdk: sdk.headers['anthropic-version'] || null, http: http.headers['anthropic-version'] || null },
    { field: 'Managed Agents beta', sdk: sdk.headers['anthropic-beta'] || null, http: http.headers['anthropic-beta'] || null },
    { field: 'JSON content type', sdk: sdk.headers['content-type'] || null, http: http.headers['content-type'] || null },
    { field: 'Resource references', sdk: sdk.body, http: http.body },
  ];
  return rows.map(row => ({ ...row, matches: JSON.stringify(row.sdk) === JSON.stringify(row.http) }));
}

export async function runPair(input: Input) {
  const fixture = classroomTransport();
  const client = new Anthropic({ apiKey: fixtureKey, baseURL: 'https://classroom.invalid',
    maxRetries: 0, timeout: 5000, fetch: fixture.transport });
  await sdkSession(client, demoBody, input.sdkMode === 'explicit');
  const raw = await httpSession(fixture.transport, 'https://classroom.invalid/v1/sessions',
    rawHeaders(input, fixtureKey), rawBody(input));
  await raw.json();
  const [sdk, http] = fixture.traces;
  return { sdk, http, rows: compareRequests(sdk.request, http.request),
    created: fixture.traces.filter(trace => trace.status === 200).length,
    scope: 'In-process classroom fixture', externalRequests: 0 };
}
