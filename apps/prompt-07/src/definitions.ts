import { z } from 'zod';
import { parse, stringify } from 'yaml';

export const editorSchema = z.object({
  agentPath: z.enum(['./agents/reviewer.md', './agents/reviewer-renamed.md']),
  agentName: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  system: z.string().trim().min(1).max(4000),
  environmentName: z.string().trim().min(1).max(100),
  network: z.enum(['limited', 'unrestricted']),
});
export type Editor = z.infer<typeof editorSchema>;
export const defaults: Editor = {
  agentPath: './agents/reviewer.md', agentName: 'Document reviewer', model: 'claude-opus-5-5',
  system: 'Summarize supplied text and cite supporting passages.',
  environmentName: 'reviewer-env', network: 'limited',
};
export const fileSchema = z.object({
  path: z.enum(['./agents/reviewer.md', './agents/reviewer-renamed.md', './environments/reviewer.yaml']),
  text: z.string().min(1).max(8000),
});
export type DefinitionFile = z.infer<typeof fileSchema>;
export type Definition = { path: string; kind: 'agent' | 'environment'; config: Record<string, unknown> };

export function definitionFiles(input: Editor): DefinitionFile[] {
  return [
    { path: input.agentPath, text: `---\n${stringify({ name: input.agentName, model: input.model })}---\n${input.system}\n` },
    { path: './environments/reviewer.yaml', text: stringify({ name: input.environmentName,
      config: { type: 'cloud', networking: { type: input.network } } }) },
  ];
}

const agentSchema = z.object({ name: z.string().min(1), model: z.string().min(1) }).strict();
const environmentSchema = z.object({ name: z.string().min(1), config: z.object({
  type: z.literal('cloud'), networking: z.object({ type: z.enum(['limited', 'unrestricted']) }).strict(),
}).strict() }).strict();

export function parseDefinitions(files: DefinitionFile[]): Definition[] {
  if (files.length !== 2 || new Set(files.map(file => file.path)).size !== 2) {
    throw new Error('Provide one agent Markdown file and one environment YAML file.');
  }
  const parsed = files.map(file => {
    if (file.path.startsWith('./agents/')) {
      const frontmatter = file.text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
      if (!frontmatter) throw new Error('Agent Markdown needs YAML frontmatter between --- lines.');
      const header = agentSchema.parse(parse(frontmatter[1]));
      const system = z.string().trim().min(1).parse(frontmatter[2]);
      return { path: file.path, kind: 'agent' as const, config: { ...header, system } };
    }
    return { path: file.path, kind: 'environment' as const,
      config: environmentSchema.parse(parse(file.text)) as Record<string, unknown> };
  });
  if (parsed.filter(file => file.kind === 'agent').length !== 1) throw new Error('Provide one agent and one environment.');
  return parsed;
}

export function editorFromFiles(files: DefinitionFile[]): Editor {
  if (files.length === 0) return defaults;
  const definitions = parseDefinitions(files);
  const agent = definitions.find(file => file.kind === 'agent')!;
  const environment = definitions.find(file => file.kind === 'environment')!;
  const config = environment.config.config as { networking: { type: string } };
  return editorSchema.parse({ agentPath: agent.path, agentName: agent.config.name,
    model: agent.config.model, system: agent.config.system, environmentName: environment.config.name,
    network: config.networking.type });
}
