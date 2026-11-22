import { z } from 'zod';
import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents/agents';

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  model: z.enum(['classroom-reviewer', 'classroom-alternate']),
  system: z.string().trim().min(1).max(2000),
  tool: z.enum(['none', 'read']),
  permission: z.enum(['always_allow', 'always_ask']),
  environment: z.enum(['demo_env_limited', 'demo_env_open']),
  task: z.string().trim().min(1).max(4000),
});
export type Profile = z.infer<typeof profileSchema>;
export const strategySchema = z.enum(['reproduce', 'reuse']);
export type Strategy = z.infer<typeof strategySchema>;
export const defaultProfile: Profile = {
  name: 'Document reviewer', model: 'classroom-reviewer',
  system: 'Summarize findings and cite evidence.',
  tool: 'none', permission: 'always_allow', environment: 'demo_env_limited',
  task: 'Review this note. The release is Friday. The owner is Maya. Identify the release day and owner.',
};

export function agentRequest(profile: Profile): AgentCreateParams {
  return {
    name: profile.name,
    model: profile.model,
    system: profile.system,
    description: 'Reviews supplied text',
    metadata: { purpose: 'learning' },
    tools: profile.tool === 'none' ? [] : [{
      type: 'agent_toolset_20260401',
      default_config: { enabled: false },
      configs: [{ name: 'read', type: 'read', enabled: true,
        permission_policy: { type: profile.permission } }],
    }],
  };
}

export function environmentConfig(profile: Profile) {
  const networking = profile.environment === 'demo_env_limited'
    ? { type: 'limited', allowed_hosts: [], allow_mcp_servers: false, allow_package_managers: false }
    : { type: 'unrestricted' };
  return { id: profile.environment, config: { type: 'cloud', networking } };
}

export function effectiveProfile(baseline: Profile, candidate: Profile, strategy: Strategy): Profile {
  if (strategy === 'reproduce') return candidate;
  return { ...baseline, environment: candidate.environment, task: candidate.task };
}

export function compareProfiles(baseline: Profile, candidate: Profile) {
  const rows = [
    { field: 'Model and settings', console: baseline.model, api: candidate.model },
    { field: 'System instructions', console: baseline.system, api: candidate.system },
    { field: 'Tools and permissions', console: agentRequest(baseline).tools, api: agentRequest(candidate).tools },
    { field: 'Environment and networking', console: environmentConfig(baseline), api: environmentConfig(candidate) },
    { field: 'Task input', console: baseline.task, api: candidate.task },
  ];
  return rows.map(row => ({ ...row, matches: JSON.stringify(row.console) === JSON.stringify(row.api) }));
}

export function generatedCode(profile: Profile, strategy: Strategy, consoleAgentId: string) {
  const setup = strategy === 'reproduce'
    ? `const agent = await client.beta.agents.create(${JSON.stringify(agentRequest(profile), null, 2)});\nconst agentId = agent.id;`
    : `const agentId = ${JSON.stringify(consoleAgentId)}; // Reuse the tested agent`;
  return `// TypeScript · classroom values; client is authenticated on the server.\n${setup}\n\nconst session = await client.beta.sessions.create({\n  agent: agentId,\n  environment_id: ${JSON.stringify(profile.environment)},\n  initial_events: [{\n    type: "user.message",\n    content: [{ type: "text", text: ${JSON.stringify(profile.task)} }],\n  }],\n});\n\nconsole.log(session.id);`;
}
