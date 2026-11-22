# Combined classroom browser

Browse Lessons 9–180 in one local application. Lessons 1–8 run from their own folders.

```shell
npm ci --workspaces=false
npm start
```

Open http://127.0.0.1:4090/lesson/9 and choose a lesson from the selector. Stop any standalone lesson using port 4090 first.

Use **Next walkthrough step**, inspect the timeline and highlighted code, then experiment with the controls. Light/dark themes and presentation mode are included. State is saved locally in `.runtime/`.

`npm run check` checks TypeScript; `npm test` runs engine tests. For browser tests, install Chromium with `npx playwright install chromium`, then run `npm run test:e2e`. Set `CHROME_PATH` for an alternative executable.

[Execution boundaries](../../docs/EXECUTION-SCOPE.md) · [Full curriculum](../../docs/CURRICULUM.md)
