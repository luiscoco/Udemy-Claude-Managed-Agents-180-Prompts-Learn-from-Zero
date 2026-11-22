# Prompt 3 · Project Setup Lab

Runnable teaching application for: “Create a TypeScript Managed Agents project with a compatible SDK version, configuration validation, and clear setup instructions.”

Uses the approved Prompt 1 course design, local Prism syntax highlighting, light/dark themes and presentation mode. No credentials are needed for the classroom workbench.

## Run

Requires Node.js 24 or newer. In PowerShell:

```powershell
cd apps/prompt-03
npm ci --workspaces=false
npm start
```

Open http://127.0.0.1:4030. For recording, open http://127.0.0.1:4030/?presentation=1.

## Teach the concept

1. Choose **Missing agent ID** and validate. Zod reports AGENT_ID; no client or provider request is created.
2. Fill the agent field and validate again. Inspect the Node.js version, installed SDK capability and unsent request plan.
3. Try missing key/environment scenarios and the explicitly injected SDK fault. The latter simulates an absent method; it does not install an older SDK.
4. Inspect the actual config, client, CLI and package files. Every source panel and dynamic JSON report uses locally served coloured syntax highlighting.
5. Check server configuration to validate the real environment without sending a provider request or returning its key/resource values to the browser.

The browser always uses synthetic configuration. A successful local report proves field presence and the installed method surface, not credential validity, resource existence, beta access or server compatibility. Classroom IDs are placeholders.

## Configure the real project

```powershell
Copy-Item .env.example .env
# Edit .env: ANTHROPIC_API_KEY, AGENT_ID, ENVIRONMENT_ID
npm run setup:check
```

Use your existing saved agent/environment IDs. Keep `.env` private; it is ignored by git. `setup:check` prints a safe report and makes zero provider requests; missing configuration exits with code 1. Real IDs can appear in terminal request plans, but the API key is omitted. The browser's server check omits both key and IDs. Environment variables already set in the shell take precedence over `.env`.

This ESM TypeScript project pins `@anthropic-ai/sdk` 1.8.0 and the other dependencies, includes `package-lock.json`, and uses `npm ci --workspaces=false` for repeatable installation. Its runtime check verifies `client.beta.sessions.create`. Node.js 24 is the lesson baseline, not a claim about the SDK's minimum supported Node version.

Only when you want to create an actual Managed Agents resource:

```powershell
npm run session:create
```

This validates first, then calls `client.beta.sessions.create` with `agent` and `environment_id`, using the `managed-agents-2026-04-01` beta header. It has a 30-second timeout and retries disabled. Check Console before retrying an uncertain creation. Creation prints a session ID; send a user event separately to start a task. There is no live creation action in the browser.

## Verify and record

```powershell
npm run check
npm test
npm run test:e2e
npm run record
```

Playwright uses installed Chrome on Windows, or its installed Chromium elsewhere. Override with PLAYWRIGHT_CHROMIUM_EXECUTABLE if necessary. Tests start and stop their own server on port 4030; stop an existing lesson server first. The test server removes provider configuration to keep server-check results deterministic.

Core tests cover missing configuration before client construction, safe reports, actual installed SDK capability, the real SDK request shape against an in-process fetch fixture, and CLI exit codes. Browser tests cover scenarios, source fidelity, highlighting in both themes, mobile layout and API input boundaries. No account-backed request is part of verification.

The lesson recording is a 1920×1080 WebM in Playwright's test-results folder. A review copy is saved as `artifacts/prompt-03-demo.webm`; screenshots are also in `artifacts`. It shows a missing ID, a repair, the unsent plan, highlighted TypeScript and terminal setup commands. WebM is available for later MP4 lesson production.

## Sources

- [Official SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
- [TypeScript session creation API](https://platform.claude.com/docs/en/api/typescript/beta/sessions/create)
- [Zod validation](https://zod.dev/basics)

API shape checked against the official reference on November 13, 2026. Managed Agents is a beta API; check the official reference before changing the pinned SDK or beta version.




[Student setup guide](../../docs/SETUP.md) · [Full curriculum](../../docs/CURRICULUM.md)
