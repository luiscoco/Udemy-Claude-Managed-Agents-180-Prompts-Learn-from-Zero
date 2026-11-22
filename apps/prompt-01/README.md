# Prompt 1 · Claude Product Lab

A runnable local teaching application for the catalog task “Compare Claude Managed Agents, Claude Agent SDK, and the Messages API using the same document-analysis application.”


## Start

Requires Node.js 22.9 or later and npm. The application was checked with Node 24 on Windows.

```powershell
cd apps/prompt-01
npm ci --workspaces=false
npm start
```

Open **http://127.0.0.1:4010**. Use `npm run dev` for server watch mode. Refresh the browser after editing frontend files.

The classroom demo runs immediately with the included synthetic Northstar report. Click **Run all three**, select the source-reference buttons, and switch between **Analysis**, **Execution**, and **Code**. You can edit the report or upload a UTF-8 `.txt` file. Changing the document clears the earlier results. Export lesson results downloads the document, results, mode, execution steps, and any hosted session ID as JSON.

## Execution modes

**Classroom demo** uses an actual local sentence-extraction algorithm. Findings are selected source sentences. Risks are sentences matching a small documented keyword rule in `src/core.ts`. All three demo adapters share that analyzer, so their outputs are deliberately comparable. The displayed product execution flows are illustrative. The mode label remains visible during recordings.

**Live Claude** calls the selected product through its real installed SDK. It sends the same task and report, expects JSON, and validates both its schema and exact source quotes. The two clients use the server's selected `CLAUDE_MODEL`. The Managed Agents model and tools come from the configured agent. Use matching model settings if you want a controlled comparison. Outputs can vary. Quote matching verifies that a passage exists, while students should still assess whether it supports the claim.

## Configure real Claude runs

Copy `.env.example` to `.env` and fill in the relevant values, then restart the server.

| Variable | Used by |
| --- | --- |
| `ANTHROPIC_API_KEY` | All live adapters |
| `CLAUDE_MODEL` | Messages API and Agent SDK, using a model available to your account |
| `MANAGED_AGENT_ID` | Managed Agents, using an existing agent configured for text analysis |
| `MANAGED_ENVIRONMENT_ID` | Managed Agents, using an existing compatible environment |
| `CLAUDE_CODE_GIT_BASH_PATH` | Optional Agent SDK setup on Windows |
| `PORT` | Local server, default `4010` |

For Managed Agents, create a text-analysis agent and a cloud environment in Claude Console, then copy their IDs. For this text-only lesson, configure the agent with an empty tools list and instructions to analyze the supplied text and follow the requested JSON format. The application adds `managed-agents-2026-04-01` to its requests. Confirm beta access and model availability in your account. Starting a live run creates a real session or model request and incurs provider usage charges.

The Agent SDK runs in a temporary working directory with tools disabled, project/user setting discovery disabled, a five-turn cap, and session persistence disabled. On Windows, install Git for Windows and configure its Bash executable if the SDK cannot find it. The `@anthropic-ai/claude-agent-sdk` package supplies its runtime.

Managed Agents opens the event stream before sending the task, reads complete agent messages, and waits for an idle event with `end_turn`. A paused approval or custom-tool call is surfaced as an error with the retained session ID. A stopped or timed-out run attempts a session interrupt. Check that session in Console if interruption cannot be confirmed. Hosted sessions remain available for inspection, and the application does not archive or delete them.

The app binds to `127.0.0.1`. Credentials stay in server configuration. Documents and results stay in browser/server memory for the run and in any JSON export you request. Live product requests also transmit the document to Claude and may create provider-retained session state. Treat this as a local single-instructor teaching app. Add authentication and user isolation before hosting it for multiple users.

## Browser verification and recording

```powershell
npm run check
npm test
npm run test:e2e
npm run record
```

Playwright uses installed Chrome at its standard Windows path when available. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for another Chromium executable. Otherwise install the Playwright browser with `npx playwright install chromium`.

`npm run record` runs the deterministic classroom walkthrough at 1920 × 1080. Its WebM recording and screenshots are saved under `test-results/`. The script demonstrates the actual application UI using local demo analysis. The recording uses deliberate pauses for narration. Edit `tests/lesson.spec.ts` to change timing. No live Claude calls are made by the included tests or recording.

For a later MP4 export, convert the recorded WebM with FFmpeg, for example

```powershell
ffmpeg -i "test-results/<lesson-run>/video.webm" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "prompt-01.mp4"
```

Presentation view hides the side navigation and expands the workbench. Open `/?presentation=1` to start in that view. The current recording has no narration or audio track.

The verified sample recording is saved at artifacts/prompt-01-demo.webm (instructor media, distributed separately), with execution (instructor media, distributed separately) and comparison (instructor media, distributed separately) screenshots. These copies survive subsequent Playwright test runs.

Verification on 12 November 2026 passed TypeScript checking, five core tests, four browser tests and the 1080p lesson recording. The Messages and Managed Agents tests used local HTTP fixtures. Account-backed calls and the authenticated Agent SDK subprocess remain to be verified with your credentials.

## Implementation and verification scope

- `src/core.ts` contains the shared task, input/result validation, demo extraction, product descriptions and code excerpts.
- `src/adapters.ts` contains three actual live adapters and the three illustrative demo traces.
- `src/server.ts` serves the interface and streams run updates as newline-delimited JSON. Each run has a three-minute deadline. API retries are disabled to keep mutation replay explicit.
- `public/` contains a buildless browser interface with source highlighting, recording layout and JSON export.
- `tests/core.test.ts` covers citations, edited inputs, cancellation and installed-SDK HTTP fixtures for the Messages and Managed adapters.
- `tests/app.spec.ts` covers browser interactions and error paths.
- `tests/lesson.spec.ts` is the repeatable recording walkthrough.

The HTTP fixtures verify API wiring without an external account. A live account run for each product still requires configured credentials and has not been validated by these fixture tests. The Agent SDK authentication/subprocess path must also be checked in your account before a live-product lesson.

## Official references

### Visual style

The interface follows the slide-inspired style of the [C01 lesson app](https://github.com/luiscoco/Udemy-claude-managed-agents-lesson-c01-app) and [C32 lesson app](https://github.com/luiscoco/Udemy-claude-managed-agents-lesson-c32-app). It uses navy headings, orange highlights, blue controls, rounded pastel panels and larger reading sizes. The astronaut artwork comes from C01's `public/astronaut.png`. Light and dark themes are available, and the selected theme is saved in this browser.

The restyled interface was verified on 13 November 2026 with the browser interaction suite, including mobile layout and theme persistence. Updated screenshots and the 1080p classroom recording are in `artifacts/`.

Code snippets use locally served Prism TypeScript highlighting, preserving their exact source text and indentation. Keywords, strings, functions, numbers and comments have distinct colours on navy code panels in both themes. The recording walkthrough verifies that coloured tokens are visible and pauses on the code view. This is a standing requirement for subsequent lesson apps and videos, recorded in the workspace `AGENTS.md`.

### Claude documentation

- [Managed Agents sessions](https://platform.claude.com/docs/en/managed-agents/sessions)
- [Managed Agents event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Messages API](https://platform.claude.com/docs/en/api/messages)

The lockfile captures the installed versions used for this implementation. Start with `npm ci --workspaces=false` to reproduce them.




[Student setup guide](../../docs/SETUP.md) · [Full curriculum](../../docs/CURRICULUM.md)
