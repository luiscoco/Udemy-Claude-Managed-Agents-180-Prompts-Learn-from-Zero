// Synthetic server secrets prove that browser responses omit credential values.
process.env.ANTHROPIC_API_KEY = 'server-only-fixture-key-do-not-return';
process.env.AGENT_ID = 'server-only-fixture-agent';
process.env.ANTHROPIC_WORKSPACE_ID = 'server-only-fixture-workspace';
process.env.PORT = '4040';
await import('../src/server.js');
