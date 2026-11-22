import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { fileSchema } from './definitions.js';

const kindSchema = z.enum(['agent', 'environment']);
export const lockSchema = z.object({
  version: z.literal(1),
  origin: z.object({ base_url: z.literal('https://classroom.invalid'),
    organization_id: z.literal('demo_organization'), workspace_id: z.literal('demo_workspace') }),
  resources: z.record(z.string(), z.object({ kind: kindSchema, id: z.string(),
    version: z.string().optional(), hash: z.string(), remote_hash: z.string() })),
});
export const remoteSchema = z.object({ id: z.string(), kind: kindSchema,
  config: z.record(z.string(), z.unknown()), agentVersion: z.number().int().positive().optional() });
const historySchema = z.object({ number: z.number(), at: z.string(), created: z.number(),
  updated: z.number(), unchanged: z.number(), agentId: z.string(), agentVersion: z.number(), environmentId: z.string() });
export const stateSchema = z.object({ revision: z.number().int().nonnegative(), lock: lockSchema.nullable(),
  remote: z.array(remoteSchema), history: z.array(historySchema), files: z.array(fileSchema) });
export type State = z.infer<typeof stateSchema>;
export type Remote = z.infer<typeof remoteSchema>;
export type Lock = z.infer<typeof lockSchema>;

export function emptyState(): State { return { revision: 0, lock: null, remote: [], history: [], files: [] }; }
export function emptyLock(): Lock {
  return { version: 1, origin: { base_url: 'https://classroom.invalid',
    organization_id: 'demo_organization', workspace_id: 'demo_workspace' }, resources: {} };
}

export class ClassroomStore {
  private state = emptyState();
  constructor(readonly file: string) {}
  async load() {
    try { this.state = stateSchema.parse(JSON.parse(await readFile(this.file, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  snapshot() { return structuredClone(this.state); }
  async save(state: State) {
    const next = stateSchema.parse(state);
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(this.file + '.tmp', this.file);
    this.state = next;
    return this.snapshot();
  }
}
