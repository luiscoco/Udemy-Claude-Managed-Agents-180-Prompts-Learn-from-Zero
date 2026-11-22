import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  system: z.string().trim().min(1).max(2000),
});
const eventSchema = z.object({
  id: z.string(), type: z.string(), text: z.string().optional(),
  stopReason: z.string().optional(),
});
export const stateSchema = z.object({
  version: z.literal(1), mode: z.enum(['demo', 'live']),
  settings: settingsSchema.nullable(), task: z.string(),
  agentId: z.string().nullable(), environmentId: z.string().nullable(), sessionId: z.string().nullable(),
  status: z.string(), stopReason: z.string().nullable(),
  events: z.array(eventSchema), polls: z.number().int().nonnegative(),
  pending: z.enum(['agent', 'environment', 'session']).nullable(),
});
export type State = z.infer<typeof stateSchema>;
export type Settings = z.infer<typeof settingsSchema>;

export function emptyState(mode: State['mode']): State {
  return { version: 1, mode, settings: null, task: '', agentId: null,
    environmentId: null, sessionId: null, status: 'not-started', stopReason: null,
    events: [], polls: 0, pending: null };
}

export class ResourceStore {
  private value: State;
  constructor(readonly file: string, mode: State['mode']) {
    this.value = emptyState(mode);
  }
  async load() {
    try {
      const saved = stateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
      if (saved.mode !== this.value.mode) throw new Error('Resource file mode does not match this workflow.');
      this.value = saved;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  snapshot() { return structuredClone(this.value); }
  async save(value: State) {
    const next = stateSchema.parse(value);
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(this.file + '.tmp', this.file);
    this.value = next;
    return this.snapshot();
  }
}
