process.env.PORT = '4060';
delete process.env.ANTHROPIC_API_KEY;
await import('../src/server.js');
