process.env.PORT = '4080';
delete process.env.ANTHROPIC_API_KEY;
await import('../src/server.js');
