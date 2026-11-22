# Prompt 6 · Console Workflow

Runnable lesson for “Guide me through creating and testing an agent in Claude Console, then reproduce its configuration through the API.”

The app includes a Console workflow guide, a local rehearsal builder, an API configuration comparison, generated TypeScript, captured-configuration downloads and an optional account-backed runner. It retains the approved navy/orange course design, astronaut artwork, light/dark themes, presentation mode and locally served coloured syntax highlighting.

## Run

Use Node.js 24+. In PowerShell, run the following commands.

```powershell
cd apps/prompt-06
npm ci --workspaces=false
npm start
```

Open http://127.0.0.1:4060. For recording, use http://127.0.0.1:4060/?presentation=1.

## Teach the Console workflow

The guide links to Claude Console and its official instructions. In your actual workspace, configure the agent in the Managed Agents builder, choose the environment, run a test session and inspect its messages and tool activity. Record the equivalent API create request, agent ID, environment ID, environment settings and exact input.

The application supplies a local rehearsal of that process. Its models, resource IDs, responses and tool traces are synthetic classroom fixtures. The official SDK formats the requests against an in-process fetch implementation. The browser application runs without credentials or an external provider connection. Your Console workspace is accessed through the provided external link.

1. Run the Console rehearsal to capture the current profile and its result.
2. Run an API test with matching configuration. Both fixtures report the same facts and stop reason with different wording.
3. Select a comparison scenario. The matrix checks model, system instructions, tools/permissions, environment/networking and exact task input. Select a row to inspect its JSON values.
4. Enable the read tool with confirmation required. The scripted API session emits a tool-use event and stops with `requires_action`. The fixture includes a `review.txt` tool scenario for this exercise.
5. Restore the captured configuration, then switch to reusing the tested agent ID. Inspect the generated code and the returned agent reference.
6. Download the captured configuration. The download retains the tested baseline even when API settings differ. Changing the baseline form requires a new rehearsal to capture it.

An API `agents.create` request creates a separate resource. Reusing an existing agent ID uses that resource's configuration, while environment and task remain session inputs. The classroom comparison covers the visible lesson fields. For a real agent, include all relevant model settings, tools, permissions, MCP servers, skills and environment settings in your comparison. Model responses and tool choices can vary between actual runs.

## Reproduce an actual Console configuration

```powershell
Copy-Item .env.example .env
Copy-Item console-profile.example.json console-profile.json
# Edit .env with ANTHROPIC_API_KEY and optional workspace ID.
# Edit console-profile.json with your actual Console configuration and IDs.
npm run console:reproduce
```

Copy Console's equivalent **agent create request** into the `agent` object. Keep its model settings and any additional tools, permissions, MCP servers or skills. The runner preserves additional request fields. Set `consoleAgentId`, `environmentId` and the exact `task` from the Console test. The supplied runner submits its task as text. File-based tests require your own matching session-resource setup. The example uses inline text and an empty tools array.

The classroom download contains synthetic references and model IDs. Use the real Console values in `console-profile.json` for account-backed execution. Both `.env` and `console-profile.json` are ignored by version control. Keep credentials in the server environment or appropriate secret storage.

The reproduction command retrieves the specified environment, creates a new agent from the captured request and starts a test session with the task in `initial_events`. To start a session with the existing Console agent, use the following command.

```powershell
npm run console:reuse
```

Reuse retrieves the existing Console agent and uses its current resource definition. The profile's copied `agent` request is used when reproducing a separate agent. Compare the current Console configuration before each account-backed test if the resource has been edited.

The client uses SDK 1.8.0, the official HTTPS API host and the `managed-agents-2026-04-01` beta header. The runner polls all event-history pages and current session state for up to three minutes. It prints observed messages, tool names and stop reason. Successful completion requires an idle session with `end_turn` and a recorded text response. A confirmation pause requires further action through your Console workflow.

## Saved creation state

The runner saves IDs in `.runtime/reproduce-ids.json` or `.runtime/reuse-ids.json`. Rerunning an unchanged profile resumes the saved session. Each creation records pending intent before the request and saves its returned ID immediately. IDs are printed for recovery if a subsequent disk write fails. Definitive API rejection clears the pending marker. Uncertain creation keeps it for inspection in Console.

After an uncertain creation, inspect Console and update the matching `agentId` or `sessionId` in the saved record, then clear `pending`. Clear a pending marker without an ID only after verifying that the resource was not created. If you intentionally change the captured profile, archive the existing creation record and keep its IDs before starting a fresh run.

Each strategy uses a lock file to serialize its terminal runner. Normal exits release it. After a forced termination, confirm that the process has stopped before removing the corresponding `.lock` file. Provider error bodies and authentication headers are excluded from diagnostics.

## Verify and record

```powershell
npm run check
npm test
npm run test:e2e
npm run record
```

Tests cover individual configuration differences, inactive permission settings, clone/reuse semantics, tool confirmation pauses, exact fixture evidence, SDK request preservation and event pagination. Browser checks cover baseline capture, scenario repair, downloads, source fidelity, syntax highlighting in both themes and mobile layout. Account-backed execution remains separately verifiable using your credentials.

Playwright starts and stops a server on port 4060. Close an existing lesson server before running browser checks. It uses installed Chrome on Windows or Playwright Chromium elsewhere. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to override the executable.

The 1920×1080 WebM walkthrough is generated in `test-results`. Its review copy is `artifacts/prompt-06-demo.webm`, with screenshots alongside it, for later MP4 production.

## References

- [Build in Console](https://platform.claude.com/docs/en/managed-agents/onboarding)
- [Define your agent](https://platform.claude.com/docs/en/managed-agents/agent-setup)
- [Session events](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [Official TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)

Official guides and installed SDK inspected November 13, 2026. Dependencies are pinned with a lockfile.




[Student setup guide](../../docs/SETUP.md) · [Full curriculum](../../docs/CURRICULUM.md)
