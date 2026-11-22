# Prompt 5 · First Working Agent

Runnable teaching application for “Create an agent and environment, start a session, send a task, display its response, and save the resource IDs.”

The application uses the approved navy/orange course style, astronaut artwork, light/dark themes and presentation mode. TypeScript, JSON and PowerShell panels use local coloured syntax highlighting.

## Run the classroom application

Use Node.js 24+. In PowerShell, run the following commands.

```powershell
cd apps/prompt-05
npm ci --workspaces=false
npm start
```

Open http://127.0.0.1:4050. The recording view is http://127.0.0.1:4050/?presentation=1.

The classroom app uses the pinned official SDK with an in-process fetch fixture. Resources have `demo_` IDs and responses are scripted. It runs with zero external provider requests and requires no credentials.

## Teach the workflow

1. Choose the working classroom model and create an agent. Its ID is saved immediately.
2. Create a cloud environment. Its ID is saved alongside the agent ID.
3. Start a session. The selected task is submitted as `initial_events` in the creation request. The UI displays the accepted state.
4. Read event history. The first classroom read shows the running state. The second includes the agent response and an idle event with stop reason `end_turn`.
5. Select an event to inspect its JSON. Review the response, session state and stop reason together.
6. Download the resource IDs and reload the page. The saved resources, response and history are restored.

The unsupported-model fixture demonstrates an API rejection. Select the working model and retry after inspecting the error. Agent settings become fixed after successful creation. This lesson tracks one complete workflow and reuses its saved resources.

The application persists its record in `.runtime/demo-resource-ids.json`. The download contains execution mode, agent ID, environment ID and session ID. Source files are served from an explicit allowlist. Credentials remain outside browser state and resource files.

## Run the account-backed workflow

```powershell
Copy-Item .env.example .env
# Edit .env with ANTHROPIC_API_KEY and an available MODEL_ID.
# Optionally set workspace, agent name, instructions and task.
npm run agent:run
```

Choose a model available to your Managed Agents account. The runner uses the official HTTPS API host and the `managed-agents-2026-04-01` beta header. It creates an agent and environment as needed, creates a session with the initial user message, then polls persisted event history. The SDK iterator reads every event page. Polling checks both the history and current session state.

IDs and history are saved in `.runtime/live-resource-ids.json`. Rerunning resumes the saved workflow and reads its existing session. The CLI prints agent messages and requires an idle session, `end_turn` and a recorded text response for a successful exit. Its observation deadline is three minutes. Existing sessions remain available for a later history check after a timeout. Raw provider errors and authentication headers are excluded from diagnostics. General automatic retries are disabled.

Each creation writes pending intent before its API request and saves the returned ID immediately. A definite API rejection clears the pending marker. A connection failure or uncertain provider response keeps the marker so the next run can inspect the operation before creating another resource. Check Console, enter the recovered ID into the matching field of the saved record, then set `pending` to null. If no resource was created, clear the pending marker after verifying that outcome. A disk failure after a returned ID reports that ID for recovery.

A lock file prevents simultaneous CLI runners from writing the same resource record. Normal exits release it. If a process was forcibly stopped, confirm it has exited before removing `.runtime/live-resource-ids.json.lock`. The browser workflow uses a separate demo record and serializes its operations.

For a fresh classroom example, stop the server and rename `.runtime/demo-resource-ids.json` to an archive filename. Restarting creates a fresh local record. For account-backed workflows, retain your saved IDs for resource reuse and inspection in Console. Keep `.env` private and outside version control.

## Verification and recording

```powershell
npm run check
npm test
npm run test:e2e
npm run record
```

The tests cover resource reuse after reload, SDK request payloads, event pagination, concurrent creation attempts, uncertain creation failures and disk failures after resource creation. Browser checks cover the full workflow, ID download, restoration, dynamic syntax highlighting in both themes and mobile layout. Account-backed execution requires your credentials and remains separately verifiable through the terminal runner.

Playwright starts and stops its own server on port 4050. Close an existing lesson server before running browser checks. It uses installed Chrome on Windows or Playwright Chromium elsewhere. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to override the executable. Browser tests use a dedicated record under `.runtime/playwright`.

The 1920×1080 WebM walkthrough is generated in `test-results`. Its review copy is `artifacts/prompt-05-demo.webm`, with screenshots alongside it, for later MP4 lesson production.

## References

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
- [Agent creation](https://platform.claude.com/docs/en/api/typescript/beta/agents/create)
- [Environment creation](https://platform.claude.com/docs/en/api/http/beta/environments/create)
- [Session event history and state](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)

API references and installed SDK inspected November 13, 2026. Dependencies are pinned with a lockfile.




[Student setup guide](../../docs/SETUP.md) · [Full curriculum](../../docs/CURRICULUM.md)
