# TODO

Outstanding improvements identified by post-implementation review of the reporting feature.

---

## Improvements

### `report/index.ts` — multiple browsers run sequentially

The outer `for (const browser of browsers)` loop runs discovery + component tabs for each browser in sequence. All component tabs within one browser already run in parallel. Running browsers simultaneously would reduce wall-clock time for multi-browser reports. Implementation location: `release/report/index.ts` around the `for (const browser of browsers)` loop.

### `report/index.ts` — `generateReport` exits with code 0 on test failures

The CLI entry point (`isMain` block) always exits cleanly, even if `summary.failed > 0`. CI pipelines that want to fail the build on test failures need to check `summary.failed` manually. The CLI should exit with code 1 when there are failures:

```ts
const summary = await generateReport({ ... });
if (summary.failed > 0) process.exit(1);
```
