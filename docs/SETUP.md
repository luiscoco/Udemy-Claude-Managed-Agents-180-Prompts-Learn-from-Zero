# Student setup guide

## Requirements

- Node.js 24 or later and npm. The `.nvmrc` file selects the course's Node.js major version.
- A modern browser for the application interface.
- Git to clone the repository, or download and extract the ZIP from GitHub.
- Internet access for initial npm installs and browser downloads. Application syntax highlighting is served locally.

Check your tools:

```shell
node --version
npm --version
```

## Start from the repository root

```shell
npm run setup -- 1
npm start -- 1
```

Open http://127.0.0.1:4010 and use **Classroom demo**. The root launcher defaults to Lesson 1. Replace `1` with a number from `1` to `180` for another lesson. Each lesson's URL appears in the [curriculum](CURRICULUM.md).

Use Ctrl+C to stop the application before changing lessons. The setup command uses the selected lesson's lockfile and disables workspace installation, so you can install one lesson at a time.

## Install a lesson manually

From the repository root:

```shell
cd apps/prompt-09
npm ci --workspaces=false
npm start
```

Use `--workspaces=false` during installation to keep the install inside the selected folder. Lessons 9–180 are also members of the optional `apps` workspace. Running `npm ci` from `apps` installs the full workspace, which is larger and unnecessary for a first lesson.

## Check and test

From the repository root, after installing the selected lesson:

```shell
npm run check -- 9
npm run browser -- 9
npm run test:browser -- 9
```

The browser command downloads Playwright's Chromium. Browser checks launch and stop their own server; stop any server already using that lesson's port first. Browser tests exercise the default classroom path, not a live provider account.

Lessons 1–8 can use an installed Windows Chrome automatically; otherwise they use Playwright's browser. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for a custom browser in those lessons. Lessons 9–180 and the combined browser use downloaded Chromium by default; set `CHROME_PATH` for a custom browser.

Some lessons also have unit tests. See the lesson's package scripts and README before running additional commands.

## Combined classroom browser

For Lessons 9–180 in one interface:

```shell
cd apps/course-lab
npm ci --workspaces=false
npm start
```

Open http://127.0.0.1:4090/lesson/9. Use the lesson selector to move through the exercises. This shares port 4090 with standalone Lesson 9, so run one at a time.

## Optional live modes

The default exercises need no API key. A lesson that supports live calls documents its requirements in its own README and `.env.example`. Copy the example to `.env`, edit it locally and restart that lesson's server. A local `.env` belongs only on your machine.

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux shell:

```shell
cp .env.example .env
```

Use resources and model settings available to your own account. Live calls can incur provider charges. Setting an API key does not turn the classroom simulations into hosted integrations.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `npm` or `node` is missing | Install Node.js, reopen your terminal and check both version commands. |
| Unsupported engine or SQLite error | Use Node.js 24 or later, then rerun the selected lesson's setup. |
| Missing `tsx` or module | Run `npm run setup -- <number>` from the repository root. |
| Address already in use | Stop the server using that port. Tests also require their port to be free. |
| Browser executable missing | Run `npm run browser -- <number>` before browser testing. |
| Playwright missing Linux libraries | Inside the lesson folder, use `npx playwright install --with-deps chromium`; this may require administrator access. |
| Page keeps an old exercise state | Use **Reset this lesson**. Theme preferences are stored in the browser. |
| Key configured but operations remain simulated | This is expected in classroom lessons; check the execution scope and lesson README. |
| `npm ci` fails downloading packages | Check network/proxy settings and retry with the committed lockfile. |

When asking for help, include the lesson number, OS, Node.js version, exact command and a sanitised error message.
