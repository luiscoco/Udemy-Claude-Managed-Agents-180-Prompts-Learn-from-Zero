# Prompt 4 · Authentication Lab

Runnable lesson for: “Configure API-key authentication and explain the documented CLI-login alternative, keeping credentials outside source code.”

The app retains the approved navy/orange course style, astronaut artwork, light/dark themes, presentation view and local coloured syntax highlighting for TypeScript, JSON and PowerShell.

## Run the classroom application

Requires Node.js 24+. In PowerShell:

```powershell
cd apps/prompt-04
npm ci --workspaces=false
npm start
```

Open http://127.0.0.1:4040. Recording view: http://127.0.0.1:4040/?presentation=1. The classroom workbench needs no account, API key or CLI installation.

Choose **API key** or **CLI login**, select a credential state, and run the check. A missing credential stops locally. The other scenarios exercise the pinned official SDK against an in-process fetch fixture: 200 success, 401 credential rejection, 403 access denied, and 404 missing or hidden resource. The SDK fixture request counter reports calls into this local fixture; external network requests remain zero. Authentication is checked before the selected resource outcome.

The CLI classroom path models the credential provider after login. It does not open a real login flow or inspect your profile files. Both paths return a redacted request projection. Real secrets are never entered in or returned to the browser. The separate server-status action reports configuration presence only and does not prove valid authentication.

## Optional account-backed API-key check

```powershell
Copy-Item .env.example .env
# Edit .env locally with your API key and an existing AGENT_ID.
# Add ANTHROPIC_WORKSPACE_ID if your key needs a workspace header.
npm run auth:check
```

`src/api-client.ts` reads the key on the server and passes it explicitly to the SDK. `.env` is excluded from version control. The installed SDK 1.8.0 sends the API key using its bearer authentication support; the lab inspects the actual serialized headers through its fixture rather than assuming a header format.

The command retrieves an existing agent with `client.beta.agents.retrieve`. It does not create or change a resource. Missing key/agent configuration exits before a request. Failures print a fixed safe diagnostic, never raw errors, headers, credential files or provider bodies. A successful check prints the existing agent ID. The client pins the official HTTPS API host, has a 15-second timeout and disables general automatic retries.

## Documented local CLI-login alternative

Install the official **ant CLI** using its [quickstart](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/quickstart). In your terminal:

```powershell
ant auth login --profile lesson
ant auth status --profile lesson
# Set AGENT_ID in your local .env, then optionally verify access:
npm run auth:cli
```

Complete the CLI's browser sign-in flow and choose the intended workspace. Login stores local OAuth credentials. The pinned SDK supports reading those credentials through `profile`; `src/cli-client.ts` explicitly selects `ANTHROPIC_PROFILE` or the lesson profile. Explicit profile selection overrides API-key/auth-token environment credentials for that client. In automatic credential selection, an environment API key can win over local login; inspect your selected source with `ant auth status`.

The status command reports source/profile/workspace selection; it is not a provider health check, and its exit code should not be treated as one. The optional `auth:cli` command performs the read-only agent retrieval. The SDK may refresh local OAuth credentials when needed; the lesson does not implement or copy tokens into application code. Do not hand-edit real CLI credential files. For unattended workloads, consult the official workload-identity guidance rather than relying on an interactive developer login.

Authentication alone does not guarantee resource access. For 403 check workspace, permissions and beta access; for 404 check the resource ID and its visibility. Keep secrets in environment/deployment secret storage, avoid logging them, and revoke leaked keys.

## Verify and record

```powershell
npm run check
npm test
npm run test:e2e
npm run record
```

Playwright uses installed Chrome on Windows or Playwright Chromium elsewhere. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to override. Tests own port 4040 and stop their server; close an existing lesson server first.

Core tests verify missing configuration, the actual SDK's authentication headers and read-only request, both fixture paths and error distinctions, safe error reporting, CLI exit behaviour, and actual named OAuth-profile resolution using synthetic files under ignored `.runtime/profile-fixture`. That isolated fixture never reads your real login directory. Browser tests cover both workflows, source fidelity, dynamic syntax highlighting in both themes, mobile layout and credential/file disclosure boundaries. No account-backed request is part of automated verification.

The 1920×1080 Playwright WebM walkthrough is generated under `test-results`. The review copy is `artifacts/prompt-04-demo.webm`, with theme/mobile and code screenshots alongside it. WebM is prepared for later MP4 lesson production.

## Official references

- [Authentication](https://platform.claude.com/docs/en/manage-claude/authentication)
- [CLI authentication and login](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication)
- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
- [Official TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)

Docs and installed SDK inspected November 13, 2026. The SDK and dependencies are pinned with a lockfile. Managed Agents remains a beta API; check current official documentation before changing the SDK or beta header.




[Student setup guide](../../docs/SETUP.md) · [Full curriculum](../../docs/CURRICULUM.md)
