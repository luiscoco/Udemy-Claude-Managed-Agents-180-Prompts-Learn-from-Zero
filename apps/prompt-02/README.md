# Prompt 2 · Architecture Lab

Runnable classroom application for “Explain agents, environments, sessions, and events, then show how they interact in one minimal runnable example.”


## Start locally

Requires Node.js 22.9 or later and npm. Verified with Node 24 on Windows.

```powershell
cd apps/prompt-02
npm ci --workspaces=false
npm start
```

Open **http://127.0.0.1:4020**. The app uses its own port and data directory. `npm run dev` watches server changes. Refresh the browser after editing frontend assets.

## Classroom exercise

1. Choose the architecture tutor and classroom cloud configuration.
2. Click **Create session**. Inspect its ID and the four resource cards.
3. Choose an example task or write your own, then click **Send task**.
4. Inspect `user.message`, `session.status_running`, `agent.message` and `session.status_idle` in the event feed. Select an event to see its coloured JSON projection.
5. Create a second session using the same agent and environment. Its history starts separately. Switch between saved sessions to verify the difference.
6. Open **Create**, **Send & stream** and **History** in the TypeScript panel. All snippets use locally served syntax highlighting.
7. Select **Missing environment · failure exercise** and attempt session creation. Inspect the error and confirm that it added no session.

**Classroom demo** runs a local session state machine with scripted replies. Resource IDs use a `demo_` prefix and simulated events are labelled `demo`. The cloud configuration card illustrates the hosted architecture while all local demo execution runs in the Node server. The JSON inspector shows an application projection rather than a complete provider object.

## Live Managed Agents

Copy `.env.example` to `.env`, set the following values and restart the app.

```dotenv
ANTHROPIC_API_KEY=your-server-side-key
MANAGED_AGENT_ID=your-existing-agent-id
MANAGED_ENVIRONMENT_ID=your-existing-environment-id
PORT=4020
```

Use an agent and compatible environment already configured in Claude Console. A text-only agent with tools disabled is suitable for this lesson. Model and tool settings come from that agent. Confirm Managed Agents beta access in your account.

Switch to **Live Managed Agents** to read the configured agent and environment. Creating a session references those existing definitions. Sending a task opens the event stream first, then sends `user.message`, and stores projected provider events until an idle event arrives. The live API client uses the `managed-agents-2026-04-01` beta header.

Live mode makes real Claude calls and can incur usage charges. It sends the task text to the provider. Hosted sessions remain available in Console. **Stop turn** requests an interrupt and inspects the resulting status. If the connection fails or interruption cannot be confirmed, use **Refresh stored history** or inspect the retained ID in Console before continuing.

The refresh action retrieves the provider's session and paginated event history. Event IDs prevent duplicate provider entries during refresh. Application notes are retained separately within the stored list. Receipt timestamps are recorded by this server. The app retains event ID, type, text and stop reason, while other provider event fields are omitted from its projection.

## Persistence and scope

The app writes session records atomically to `.runtime/sessions.json`. Reloading the browser or restarting the server retains them. Each session has its own event history. On a server restart during a turn, demo sessions recover to idle and live sessions require inspection. Transcript and event projections are stored locally, including task and response text.

This is a local single-instructor application bound to `127.0.0.1`. Credentials stay on the server. It accepts operations only for locally registered sessions and uses configured resource references for live creation. Add authentication, user ownership and deployment storage before hosting it for several students.

There is one active operation per session and a three-minute message deadline. API retries are disabled so a timeout does not automatically replay session creation. The live adapter reports the created ID if saving its local record fails.

## Verify and record

```powershell
npm run check
npm test
npm run test:e2e
npm run record
```

The browser suite starts a dedicated fixture server and resets only `.runtime/playwright/sessions.json`. It clears provider credentials from that server's process. Normal application records stay in `.runtime/sessions.json`. Stop a manually running app on port 4020 before starting the browser suite.

Playwright uses Chrome in the standard Windows installation directory when available. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to another Chromium executable or install Chromium with `npx playwright install chromium`.

The lesson walkthrough records the actual demo application at 1920 × 1080, creates two sessions, inspects an event, and pauses on highlighted TypeScript and JSON. The WebM and screenshots are generated under `test-results/`. Published local copies are placed in `artifacts/`. The recording contains no narration. Its timing can be edited in `tests/lesson.spec.ts`.

The verified sample recording (instructor media, distributed separately), architecture preview (instructor media, distributed separately) and coloured code and evidence preview (instructor media, distributed separately) are saved alongside the application. The 1080p recording walkthrough also passed on 13 November 2026.

For a future MP4, convert the WebM using an installed FFmpeg, for example

```powershell
ffmpeg -i "artifacts/prompt-02-demo.webm" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "prompt-02.mp4"
```

## Implementation and validation

- `src/core.ts` defines the local resources, event/session schemas, atomic store and teaching snippets.
- `src/lesson.ts` implements local and live session creation, task turns, interruption and history inspection.
- `src/server.ts` serves the application and streams durable snapshots as newline-delimited JSON.
- `public/` uses the approved navy/orange course style, astronaut artwork from the C01 reference, persistent light/dark themes and coloured code panels.
- `tests/core.test.ts` verifies persistence, independent histories, invalid references, cancellation, turn exclusion and live SDK wiring through local HTTP fixtures.
- `tests/app.spec.ts` verifies the classroom interactions, mobile layout, themes and syntax highlighting.
- `tests/lesson.spec.ts` drives the recording.

TypeScript checks, four core tests and four browser tests passed on 13 November 2026. SDK fixtures verify stream-before-send ordering and multi-page history retrieval without an external account. Account-backed live calls still require credentials and verification in your Claude workspace.

## References

- [Managed Agents sessions](https://platform.claude.com/docs/en/managed-agents/sessions)
- [Managed Agents event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [C01 visual reference](https://github.com/luiscoco/Udemy-claude-managed-agents-lesson-c01-app)
- [C32 visual reference](https://github.com/luiscoco/Udemy-claude-managed-agents-lesson-c32-app)




[Student setup guide](../../docs/SETUP.md) · [Full curriculum](../../docs/CURRICULUM.md)
