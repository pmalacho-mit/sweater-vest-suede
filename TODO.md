# TODO

Issues and improvements identified by post-implementation review of the reporting feature.

---

## Bugs

### `Runner.svelte` — `new URL(location.href)` parsed twice

`onMount` calls `new URL(location.href)` twice — once for `reportServerUrl` and once for `testFilterSource`. Both reads are synchronous and the URL cannot change between them, so this is safe, but wasteful. Parse once and reuse.

```ts
// current
const reportServerUrl = new URL(location.href).searchParams.get("reportServer") ?? undefined;
const testFilterSource = new URL(location.href).searchParams.get("testFilter") ?? undefined;

// fix
const params = new URL(location.href).searchParams;
const reportServerUrl = params.get("reportServer") ?? undefined;
const testFilterSource = params.get("testFilter") ?? undefined;
```

---

## Missing Tests

### No integration test for `testFilter` / skipping behaviour

`docker/vite/report/test.ts` has no test that verifies the `testFilter` query param causes a test to be skipped and a `test-skipped` event to be sent. This is the most non-trivial new code path in `Runner.svelte` and is untested end-to-end.

**Add a test that:**
1. Passes `testFilter=passes` to the page URL (should skip `fails` and `captures`)
2. Asserts `results.length === 3` (all three still appear, two as `skipped`)
3. Asserts the two non-matching tests have `status: "skipped"`
4. Asserts `durationMs === 0` for skipped tests

### No direct unit test for `startDiscoveryServer`

The implementation sequence called for a unit test of both `startDiscoveryServer` and `startEventServer` (Step 1). `startEventServer` is exercised by the integration suite, but `startDiscoveryServer` is only tested indirectly through the full `generateReport` flow (which is not automated). A standalone unit test would verify the `gallery-ready` event path without needing a browser.

**Add a test (plain Node.js, no Docker) that:**
1. Calls `startDiscoveryServer()`
2. Posts `{ type: "gallery-ready", paths: ["/src/A.svelte"] }` to `http://localhost:<port>`
3. Asserts `await discovery.paths` resolves to `["/src/A.svelte"]`
4. Verifies the server closes itself after receiving the event (i.e. a second POST returns ECONNREFUSED)

---

## Improvements

### `report-print.ts` — `passed` variable computed but never used

```ts
const passed = entry.results.filter((r) => r.status === "passed").length;
// 'passed' is never referenced in the output below
```

Either remove it, or use it on the PASS line to show a breakdown when some tests are skipped. For example, when a component has 3 passed and 1 skipped, printing `(3 passed, 1 skipped, 4 total)` would be more informative than `(4 tests)`.

### `report-print.ts` — PASS line counts all non-failing tests as a single lump

Currently a component with mixed passed/skipped results prints as `PASS`. It would be clearer to show an intermediate status (e.g. `PASS` but with a note about skipped count) so the user knows the full picture without opening the HTML report.

### `report-events.ts` — no body size limit in `readBody`

`readBody` accumulates all request data into a string with no maximum size. Captures are base64-encoded and can be 100–400 KB each. A test with many captures could produce a multi-MB payload per `test-complete` event. Under heavy load or accidental misuse this could exhaust Node.js heap.

Add a configurable max (e.g. 50 MB) and reject with a clear error if exceeded:

```ts
const MAX_BODY_BYTES = 50 * 1024 * 1024;
req.on("data", (chunk: Buffer) => {
  if (body.length + chunk.length > MAX_BODY_BYTES)
    return req.destroy(new Error("Request body too large"));
  body += chunk.toString();
});
```

### `report.ts` — `generateReport` returns `void`; failures are not detectable programmatically

As noted in `AUTOMATED-TESTING.md`, the HTML file is currently the only way to detect test failures. CI pipelines that want to fail on test failures need to parse the report or inspect results themselves. `generateReport` should return a structured summary:

```ts
export type ReportSummary = {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  browsers: ReportInput["browsers"];
};

export const generateReport = async (options?: ReportOptions): Promise<ReportSummary>
```

This is a breaking change to the return type but the function is new, so the right time to do it is now before consumers depend on `void`.

### `report.ts` — multiple browsers run sequentially

The outer `for (const browser of browsers)` loop runs discovery + component tabs for each browser in sequence. All component tabs within a single browser already run in parallel. Running browsers in parallel too would reduce wall-clock time for multi-browser runs. Tracked as a known limitation in `REPORT-PLAN.md`; noting here as the concrete implementation location.

### `report-html.ts` — `componentPath` label only strips `/src/` prefix

```ts
entry.componentPath.replace(/^\/src\//, "").replace(/\.test\.svelte$/, "")
```

This assumes test files always live under `/src/`. A glob like `/lib/**/*.test.svelte` or a monorepo with `/packages/ui/src/...` would produce unexpectedly long or unsimplified labels. Consider stripping any leading path up to the first meaningful segment, or just using the basename as a fallback.

### `report-html.ts` — empty report shows "all passed" misleadingly

When `input.browsers` is empty (e.g. no components matched the filter), `allResults` is `[]`, `totalFailed` is 0, and the summary header shows "all passed" in green. A zero-test run should instead show a neutral "no tests run" state.

### `Gallery.svelte` — fires `gallery-ready` on every component tab load

When a component tab opens (`?component=X&reportServer=Y`), `Gallery.svelte` mounts and fires `gallery-ready` to the per-component event server. The event server silently ignores it (unknown event type), so there is no correctness issue. But it is wasted work on every component tab. The `onMount` could skip the POST when `?component=` is already set:

```ts
onMount(() => {
  const params = new URL(window.location.href).searchParams;
  const reportServerUrl = params.get("reportServer");
  if (!reportServerUrl || params.has("component")) return;
  fetch(reportServerUrl, { ... });
});
```

### `docker/vite/report/test.ts` — event servers not cleaned up on test timeout

`run()` starts an event server and awaits `server.done`. If the test times out before `server.done` resolves, the event server continues running until its own internal timeout (60 s). This leaves an open port handle during the cleanup phase of Vitest.

Wrap the event server in a `try/finally` in the test helper, or close the server in an `afterAll`:

```ts
const run = async () => {
  const server = await startEventServer();
  try {
    await open({ reportServer: server.url });
    return { results: await server.done };
  } catch (e) {
    server.close();
    throw e;
  }
};
```
