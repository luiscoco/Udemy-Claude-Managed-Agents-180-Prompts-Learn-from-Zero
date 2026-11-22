import { z } from 'zod';

export const configSchema = z.object({
  ANTHROPIC_API_KEY: z.string().trim().min(1, 'Required'),
  AGENT_ID: z.string().trim().min(1, 'Required'),
  ENVIRONMENT_ID: z.string().trim().min(1, 'Required'),
});

export type Config = z.infer<typeof configSchema>;

// Return field names and safe messages, never configuration values.
export function validateConfig(input: unknown) {
  const result = configSchema.safeParse(input);
  if (result.success) return { ok: true as const, config: result.data };
  return { ok: false as const, issues: result.error.issues.map(issue => ({
    field: String(issue.path[0]), message: 'Set a non-empty value in .env.',
  })) };
}
