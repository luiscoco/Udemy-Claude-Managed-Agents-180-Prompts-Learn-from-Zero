delete process.env.ANTHROPIC_API_KEY;
delete process.env.AGENT_ID;
delete process.env.ENVIRONMENT_ID;
process.env.PORT = '4030';
await import('../src/server.js');
