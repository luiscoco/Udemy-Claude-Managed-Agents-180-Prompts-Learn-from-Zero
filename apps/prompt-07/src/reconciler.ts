import { createHash, randomUUID } from 'node:crypto';
import { parseDefinitions, type DefinitionFile } from './definitions.js';
import { ClassroomStore, emptyLock, type State } from './storage.js';

// Classroom fingerprints use SHA-256. The real CLI owns its hash algorithm.
export function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export function fingerprint(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export class PlanError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
type Action = 'create' | 'update' | 'unchanged' | 'blocked';
export type PlanRow = { path: string; kind: string; action: Action; id: string | null;
  before: Record<string, unknown> | null; after: Record<string, unknown>; changedFields: string[] };

export function makePlan(state: State, files: DefinitionFile[], missingLock: boolean) {
  const definitions = parseDefinitions(files);
  const lock = missingLock ? null : state.lock;
  const warnings: string[] = [];
  if (!lock && state.remote.length > 0) warnings.push('The simulated lockfile is missing. Matching names do not recover the previous resource IDs.');
  const rows: PlanRow[] = definitions.map(definition => {
    const entry = lock?.resources[definition.path];
    const remote = state.remote.find(resource => resource.id === entry?.id);
    let action: Action = 'create';
    if (entry) {
      const drifted = !remote || entry.kind !== definition.kind || remote.kind !== definition.kind || entry.remote_hash !== fingerprint(remote.config);
      action = drifted ? 'blocked' : fingerprint(definition.config) === fingerprint(remote.config) ? 'unchanged' : 'update';
    }
    const before = remote?.config ?? null;
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(definition.config)]);
    const changedFields = [...keys].filter(key => canonical(before?.[key]) !== canonical(definition.config[key]));
    return { path: definition.path, kind: definition.kind, action, id: remote?.id ?? null,
      before, after: definition.config, changedFields };
  });
  const retained = Object.entries(lock?.resources || {}).filter(([path]) => !definitions.some(definition => definition.path === path));
  for (const [path] of retained) warnings.push(`Retained mapping ${path}. Its resource stays in the classroom inventory.`);
  const summary = { created: rows.filter(row => row.action === 'create').length,
    updated: rows.filter(row => row.action === 'update').length,
    unchanged: rows.filter(row => row.action === 'unchanged').length };
  return { token: fingerprint({ revision: state.revision, files, missingLock }), revision: state.revision,
    rows, warnings, summary, blocked: rows.some(row => row.action === 'blocked') };
}

export class Reconciler {
  private applying = false;
  constructor(readonly store: ClassroomStore) {}
  plan(files: DefinitionFile[], missingLock: boolean) { return makePlan(this.store.snapshot(), files, missingLock); }
  async apply(files: DefinitionFile[], missingLock: boolean, token: string) {
    if (this.applying) throw new PlanError('An apply is in progress. Review the latest state before continuing.', 409);
    this.applying = true;
    try {
      const state = this.store.snapshot();
      const plan = makePlan(state, files, missingLock);
      if (token !== plan.token) throw new PlanError('This plan is stale. Review a new plan before applying.', 409);
      if (plan.blocked) throw new PlanError('A mapped resource differs from its last recorded state. Inspect it before applying.', 409);
      const lock = missingLock || !state.lock ? emptyLock() : structuredClone(state.lock);
      const remote = structuredClone(state.remote);
      for (const row of plan.rows) {
        let resource = remote.find(item => item.id === row.id);
        if (row.action === 'create') {
          resource = { id: `demo_${row.kind}_${randomUUID()}`, kind: row.kind as 'agent' | 'environment',
            config: row.after, ...(row.kind === 'agent' ? { agentVersion: 1 } : {}) };
          remote.push(resource);
        }
        if (!resource) throw new PlanError('The resource mapping could not be resolved.');
        if (row.action === 'update') {
          resource.config = row.after;
          if (resource.kind === 'agent') resource.agentVersion = (resource.agentVersion || 1) + 1;
        }
        lock.resources[row.path] = { id: resource.id, kind: resource.kind,
          ...(resource.agentVersion ? { version: String(resource.agentVersion) } : {}),
          hash: fingerprint(row.after), remote_hash: fingerprint(resource.config) };
      }
      const agent = plan.rows.find(row => row.kind === 'agent')!;
      const environment = plan.rows.find(row => row.kind === 'environment')!;
      const agentEntry = lock.resources[agent.path];
      const run = { number: state.history.length + 1, at: new Date().toISOString(), ...plan.summary,
        agentId: agentEntry.id, agentVersion: Number(agentEntry.version),
        environmentId: lock.resources[environment.path].id };
      // Commit the local model as one snapshot, then publish it to callers.
      return await this.store.save({ revision: state.revision + 1, lock, remote,
        history: [...state.history, run], files });
    } finally { this.applying = false; }
  }
}
