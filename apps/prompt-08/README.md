# Prompt 8 · API Headers

Runnable lesson for “Explain the required Managed Agents beta header and show equivalent SDK and raw HTTP requests.”

The application retains the approved navy/orange course style, astronaut artwork, light/dark themes and presentation mode. Its TypeScript, HTTP with JSON, response JSON and PowerShell panels use locally served coloured syntax highlighting.

## Run

Use Node.js 24+. In PowerShell, run the following commands.

```powershell
cd apps/prompt-08
npm ci --workspaces=false
npm start
```

Open http://127.0.0.1:4080. For recording, use http://127.0.0.1:4080/?presentation=1.

## Teach the requests

1. Send the equivalent requests. Inspect the six core comparisons and the two distinct session IDs.
2. Expand the captured SDK request to inspect redacted authentication, base version and beta header.
3. Choose **Missing raw beta header**, send again and inspect the fixture rejection and comparison row.
4. Try the other header scenarios, then restore equivalent requests.
5. Select legacy x-api-key authentication. Both paths remain accepted by the fixture, with matching authentication semantics.
6. Change the raw agent reference. Both fixture requests succeed, while the body comparison identifies their different resource references.

The official SDK runs against an in-process fetch fixture with synthetic credentials. The raw request uses the same fixture. It creates local response objects and makes zero external provider requests. The fixture supports the selected lesson cases and returns a subset of session fields. Its validation messages and statuses illustrate the failures. Actual provider errors may vary.

The request inspector exposes an allowlisted projection and redacts credentials. The code panels use placeholders. The browser never receives the synthetic key or a configured account key. Changing a control clears the previous result, and request code updates to the selected settings.

## Headers observed in the pinned SDK

The application pins `@anthropic-ai/sdk` 1.8.0. Its session-create method automatically adds `anthropic-beta: managed-agents-2026-04-01`. The SDK also supplies bearer API-key authentication and `anthropic-version: 2026-10-21`. These values are asserted against captured SDK requests. The explicit mode sets the beta header through the request's `headers` option.

Raw HTTP supplies authentication, base version, beta opt-in and JSON content type directly. Current authentication documentation also supports the legacy x-api-key header. The app compares its authentication semantics with bearer API-key authentication. A successful create returns a separate session resource for each call. This example submits no initial task.

The examples reflect the installed SDK and official documentation inspected November 13, 2026. Check the reference and captured behavior when updating the SDK or API version.

## Run with your account

```powershell
Copy-Item .env.example .env
# Edit .env with ANTHROPIC_API_KEY, AGENT_ID and ENVIRONMENT_ID.
# Set ANTHROPIC_WORKSPACE_ID when required by your key.
npm run headers:live
```

This command makes **two session-creation requests** against the official HTTPS API host using the same existing agent and environment references. Each invocation creates a new pair. The first request uses the SDK and the second uses fetch with explicit headers. General retries are disabled, and requests have 30-second timeouts.

Returned IDs are printed and appended to `.runtime/live-sessions.jsonl` after each creation. A later failure leaves completed records available. Inspect Console before retrying an uncertain creation. A created ID is printed before its local write, so it can be recovered if that write fails. Failure diagnostics omit raw provider bodies and credentials. `.env` and `.runtime` are ignored by version control.

Account-backed execution remains untested in this session. The classroom tests verify SDK request construction and the raw HTTP path through the local fixture.

## Verification and recording

```powershell
npm run check
npm test
npm run test:e2e
npm run record
```

Core checks cover actual SDK headers, automatic and explicit beta configuration, equivalent legacy authentication, header failures, distinct session IDs, body differences, generated examples and credential redaction. Browser checks cover the scenarios, exact displayed code, dynamic highlighting in both themes, mobile layout and HTTP boundaries.

Playwright starts and stops its own server on port 4080. Close an existing lesson server first. It uses installed Chrome on Windows or Playwright Chromium elsewhere. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to override it.

The 1920×1080 WebM walkthrough is generated in `test-results`, with a review copy at `artifacts/prompt-08-demo.webm`. Screenshots are saved alongside it for later MP4 lesson production.

## References

- [Create Session](https://platform.claude.com/docs/en/api/typescript/beta/sessions/create)
- [Beta headers](https://platform.claude.com/docs/en/api/beta-headers)
- [API versions](https://platform.claude.com/docs/en/api/versioning)
- [Authentication](https://platform.claude.com/docs/en/manage-claude/authentication)
- [Official TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)




[Student setup guide](../../docs/SETUP.md) · [Full curriculum](../../docs/CURRICULUM.md)
