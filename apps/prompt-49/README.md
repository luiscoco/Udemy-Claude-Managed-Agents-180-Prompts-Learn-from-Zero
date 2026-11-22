# Lesson 49 · Reading files

Have the agent read selected files and produce a summary grounded in their actual contents.

[All lessons](../../docs/CURRICULUM.md) · [Setup help](../../docs/SETUP.md)

## Run

Use Node.js 24 or later. From this folder:

```shell
npm ci --workspaces=false
npm start
```

Open **http://127.0.0.1:4490/**. Stop the server with Ctrl+C.

## Guided exercise

Use **Next walkthrough step** to follow the exercise, inspect the results, then change the controls and run it again. Expected denials or conflicts teach the boundary being exercised.

1. **Read selected source** — inspect the result and timeline.
2. **Summarize with exact source evidence** — inspect the result and timeline.

Use **Reset this lesson** to restart the classroom exercise.

## Explore the implementation

- [Server](src/server.ts)
- [Operation handlers](src/engine.ts)
- [Lesson configuration and reference snippets](data/lesson.json)
- [Frontend](public/)
- [Browser exercise](tests/browser.spec.ts)

Run `npm run check` for TypeScript checks. Install Chromium with `npx playwright install chromium`, then use `npm run test:e2e` for the browser exercise. You can set `CHROME_PATH` to use an installed browser.

## Classroom scope

This local application uses classroom fixtures for provider operations and account capabilities. Reference snippets are separate from executing local handlers. Synthetic usage metrics do not establish live provider performance. See [execution boundaries](../../docs/EXECUTION-SCOPE.md).

The UI includes light/dark themes, presentation mode and locally served coloured syntax highlighting. Add `?presentation=1` to the lesson URL to enter presentation mode. Course videos are distributed separately.
