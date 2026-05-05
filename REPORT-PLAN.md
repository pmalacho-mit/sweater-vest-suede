# Reporting Feature — Implementation Plan

## Overview

The reporting feature lets consumers generate full HTML reports of their test suites. The user starts their own dev server (`npm run dev`), then invokes a report script that:

1. Starts a short-lived discovery server; opens the gallery URL with `?reportServer=<url>` appended
2. `Gallery.svelte` POSTs all known component paths to the discovery server on mount
3. Starts one or more browser containers on the devcontainer Docker network
4. Opens one tab per component (filtered by any CLI pattern), each with its own event server URL appended
5. `Runner.svelte` POSTs a JSON event per test completion; `Sweater.svelte` POSTs a `suite-ready` count
6. Each event server resolves when its component's tests are done; results are collected in parallel
7. The report script prints results to stdout and writes a self-contained HTML file

This is purely additive. If the `reportServer` query param is absent, `Runner.svelte` does nothing new. To rip out the reporting feature entirely: delete 20 lines from `Runner.svelte`, 7 lines from `Sweater.svelte`, and the new files in `release/`. The core framework is untouched.

---

## Architecture

```
┌─ devcontainer ──────────────────────────────────────────────────────────────┐
│                                                                             │
│  User's dev server (:5173)                                                  │
│  ┌─────────────────────────┐                                                │
│  │ Gallery.svelte          │  Phase 1: discovery                            │
│  │ (has glob of all paths) │  discovery server (:aaaaa)                     │
│  └─────────────────────────┘        ▲                                      │
│                                     │ POST gallery-ready { paths }          │
│                                     │                                       │
│                                Phase 2: per-component results               │
│                                serverA (:xxxxx)  serverB (:yyyyy)  …       │
│                                     ▲                  ▲                   │
│                                     │ POST events       │ POST events       │
└──────────┬──────────────────────────┼──────────────────┬┼─────────────────-┘
           │                          │                  ││
┌─ browser container ─────────────────────────────────────────────────────────┐
│                                                                             │
│  tab 0: galleryUrl?reportServer=:aaaaa                                      │
│    Gallery.svelte onMount → POST gallery-ready { paths: [...] }             │
│                                                                             │
│  report script receives paths, applies componentPattern filter              │
│                                                                             │
│  (filtered paths opened in parallel)                                        │
│  tab 1: ?component=/src/A…&reportServer=:xxxxx  → Runner fires POST        │
│  tab 2: ?component=/src/B…&reportServer=:yyyyy  → Runner fires POST        │
│  …                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

await Promise.all([serverA.done, serverB.done, …])
  → combine all results → printReport() + renderReport() → report.html
```

Results flow one way: browser → HTTP servers → stdout + HTML file. The browser never accumulates state. `window.__SWEATER_VEST__` is not touched by the reporting feature.

Gallery.svelte is the authoritative source of component paths — it holds the `import.meta.glob` result directly. Having it push those paths to the report server is simpler and more reliable than scraping the DOM from outside.

---

## Event Protocol

Four event types flow from the browser to the report servers, all plain JSON POSTs. The first is handled by the discovery server; the remaining three by the per-component event servers.

```ts
// Sent by Gallery.svelte on mount when reportServer is in the URL.
// Provides the complete unfiltered list of component paths from import.meta.glob.
// The report script uses this to decide which tabs to open.
type GalleryReadyEvent = {
  type: "gallery-ready";
  paths: string[];
};

// Sent by Sweater.svelte once all <Sweater> instances have mounted.
// Tells the server the total number of test-complete/test-skipped events to expect.
type SuiteReadyEvent = {
  type: "suite-ready";
  totalTests: number;
};

// Sent by Runner.svelte when a test body resolves or rejects.
type TestCompleteEvent = {
  type: "test-complete";
  name?: string;          // from the `name` prop on <Sweater>
  id?: string;            // from the `id` prop on <Sweater>
  status: "passed" | "failed";
  durationMs: number;
  error?: {
    message: string;
    stack?: string;
    matcherResult?: unknown;   // from @storybook/test matchers
  };
  captures: Array<{
    type: "png" | "jpeg" | "svg";
    dataUri: string;           // base64 data URI
  }>;
  notes: string[];             // from harness.note() calls
};

// Sent by Runner.svelte when a test is skipped due to testFilter not matching.
// Counts toward totalTests so the server knows it is done.
type TestSkippedEvent = {
  type: "test-skipped";
  name?: string;
  id?: string;
};
```

The server handles out-of-order delivery naturally: `test-complete`/`test-skipped` events may arrive before `suite-ready` (tests start running before all Sweaters have mounted). The server checks `receivedCount >= totalTests` on every event.

CORS: the server responds with `Access-Control-Allow-Origin: *` and handles `OPTIONS` preflight so the browser can POST with `Content-Type: application/json`.

---

## Change to `release/vite/Gallery.svelte`

Gallery.svelte already holds `Object.keys(glob)` — every component path available on this page. When the `reportServer` query param is present, it should POST those paths to the report server immediately on mount, before the user (or automation) has clicked anything.

Add an `onMount` block to the instance `<script>`:

The existing instance `<script lang="ts">` block already has `import type { Component } from "svelte"`. Add `onMount` to that import and append the `onMount` call:

```svelte
<script lang="ts">
  import { onMount, type Component } from "svelte"; // onMount added
  let { glob }: Props = $props();

  // ... existing $derived declarations unchanged ...

  onMount(() => {
    const reportServerUrl = new URL(window.location.href).searchParams.get("reportServer");
    if (!reportServerUrl) return;
    fetch(reportServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "gallery-ready", paths: Object.keys(glob) }),
    }).catch(() => {});
  });
</script>
```

This is the complete change to `Gallery.svelte`: `onMount` added to the existing import, 8-line call appended. No behaviour change for non-reporting use. The report server receives the full, unfiltered path list; filtering is applied in the report script after the paths arrive.

---

## Browser-Side Changes

These are the only changes to library code. All changes are conditional on `reportServerUrl` being present; the code paths are not reached during normal test runs.

### 1. `release/Runner.svelte` — send events on test completion

In `onMount`, before the harness is constructed, read the URL:

```ts
const reportServerUrl =
  new URL(location.href).searchParams.get("reportServer") ?? undefined;
```

**Wrap `capture` to collect pending image promises:**

```ts
const rawCapture = createCapturer(container);
const pendingCaptures: Promise<{ type: string; dataUri: string }>[] = [];

const capture: typeof rawCapture = (type, options?) => {
  const result = rawCapture(type, options as never);
  if (reportServerUrl && (type === "png" || type === "jpeg" || type === "svg")) {
    const { uri } = result as { uri: Promise<string>; download: unknown };
    pendingCaptures.push(uri.then((dataUri) => ({ type, dataUri })));
  }
  return result;
};
```

**Add `note()` to the harness:**

```ts
const collectedNotes: string[] = [];
const note = (text: string) => {
  if (reportServerUrl) collectedNotes.push(text);
};
```

**Check `testFilter` and skip non-matching tests:**

```ts
const testFilterSource = new URL(location.href).searchParams.get("testFilter") ?? undefined;
const testFilter = testFilterSource ? new RegExp(testFilterSource, "i") : undefined;
```

If `testFilter` is set and the test's `name` (or `id`) does not match, the test body is not run. `begin` is still called with a no-op to clear `Container`'s `pending.abort` state, and a `test-skipped` event is sent so the server's total count is satisfied:

```ts
gate = queue.add(mode, async () => {
  const testIdentifier = name ?? id; // `id` is destructured from props alongside `name`
  if (testFilter && testIdentifier && !testFilter.test(testIdentifier)) {
    if (send) await send({ type: "test-skipped", name, id });
    begin(() => {})(); // clears pending.abort; returns and immediately calls complete
    return;
  }
  // ... normal body execution below
}).start;
```

Tests without a `name` or `id` are always run when `testFilter` is active (they cannot be identified, so they are not filtered out).

**Define `send` and replace the existing `.catch(error)` chain:**

The existing chain is:
```ts
body(harness).catch(error).finally(begin(…))
```

Replace with:
```ts
const startedAt = Date.now();

// Typed as `object` rather than a named union to avoid importing event types
// into browser component scope — the server validates the `type` field at runtime.
const send = reportServerUrl
  ? (event: object) =>
      fetch(reportServerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }).catch(() => {}) // server gone — don't crash the test
  : undefined;

await body(harness)
  .then(
    async () => {
      if (send) {
        const captures = await Promise.all(pendingCaptures);
        await send({ type: "test-complete", name, id, status: "passed", durationMs: Date.now() - startedAt, captures, notes: collectedNotes });
      }
    },
    async (e) => {
      if (!(e instanceof TestAborted) && send) {
        const captures = await Promise.all(pendingCaptures);
        await send({ type: "test-complete", name, id, status: "failed", durationMs: Date.now() - startedAt, error: { message: e?.message, stack: e?.stack, matcherResult: e?.matcherResult }, captures, notes: collectedNotes });
      }
      error(e); // original Container error handler still called
    },
  )
  .finally(begin(() => controller.abort("Test has been aborted")));
```

The `.then(onFulfilled, onRejected)` form is used instead of `.then().catch()` so that a failure in `onFulfilled` does not feed into `onRejected`. The `error(e)` call in `onRejected` preserves the existing console-logging behaviour.

Add `note` to the harness object passed to `body`:
```ts
const harness = abort.proxy({ ...test, container, set, preventRender, capture, onAbort, definition, withUserFocus, delay, note });
```

**Total additions to `Runner.svelte`: ~25 lines**, all behind `if (reportServerUrl)` guards.

---

### 2. `release/Sweater.svelte` — send `suite-ready` after all tests mount

In the `onMount` block, replacing the existing `setTotal(containers.total)` call:

```ts
// Capture total BEFORE containers.reset() clears the map to 0.
const totalTests = containers.total;
setTotal(totalTests);
containers.reset();
next();
const reportServerUrl = location().searchParams.get("reportServer");
if (reportServerUrl)
  fetch(reportServerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "suite-ready", totalTests }),
  }).catch(() => {});
```

Note: `location` is already defined in Sweater.svelte's module scope as `const location = () => new URL(window.location.href)`, so `location()` is used rather than `new URL(location.href)`. `totalTests` must be captured before `containers.reset()` because `reset()` calls `target.clear()`, making `containers.total` return 0.

**Total additions to `Sweater.svelte`: 8 lines** (one extra to capture `totalTests` before the reset).

---

### 3. `release/index.ts` — export updated `TestHarness` type

`harness.note` is new public API. Export it from the type:

```ts
export type { TestHarness, Pocket as PocketElements } from "./Runner.svelte";
```

No change to the export line itself; the type change happens inside `Runner.svelte`. But `note` needs to appear in the `TestHarness<T>` type definition:

```ts
/**
 * Adds a text annotation to the report for this test.
 * A no-op when not running under a report server.
 */
note: (text: string) => void;
```

---

## `harness.capture()` Image Flow

```
Runner.svelte (browser)
  │
  │  harness.capture("png") called in test body
  │
  ▼
createCapturer(container)   ←── html-to-image renders the vest container
  │
  ├─► returns { uri: Promise<string>, download }   to the test author (unchanged)
  │
  └─► (if reportServerUrl) pendingCaptures.push(uri.then(dataUri => ({ type, dataUri })))

                    ─── test body resolves ───

  await Promise.all(pendingCaptures)   ←── wait for all images to render
  │
  POST /events  { type: "test-complete", captures: [{ type: "png", dataUri: "data:..." }] }
  │
  ▼
Report server (Node.js)
  │
  results.push(event)
  │
  ▼
renderReport()  →  <img src="data:image/png;base64,…">  in HTML file
```

The `await Promise.all(pendingCaptures)` before sending the event ensures that even if the test body returns without awaiting the capture URI, the image is still included. The test author does not need to do anything special — calling `harness.capture("png")` is sufficient.

---

## Tools for Test Writers

The following `harness` members are relevant to producing informative reports. None require reporting to be active — they work normally in interactive dev use too.

### `harness.capture(type, options?)`

Takes a screenshot of the `vest` container at the moment it is called. Call it multiple times during a test body to capture a sequence of states — e.g. before and after a user interaction. Each call produces a separate image in the report, displayed in call order.

```ts
body={async (harness) => {
  const pocket = harness.set(new Pocket());
  const { el } = await harness.definition("el");

  const before = harness.capture("png");   // state 1

  await harness.withUserFocus(async (userEvent) => {
    await userEvent.click(el.button);
  });

  const after = harness.capture("png");    // state 2

  harness.expect(el.result.textContent).toBe("clicked");
}}
```

Both images appear in the report card for this test. Supported types that embed in the report: `"png"`, `"jpeg"`, `"svg"`. Types `"blob"`, `"canvas"`, `"pixelData"` are still returned to the test author unchanged but do not appear in the report (they have no string URI).

### `harness.note(text)`

Adds a free-form text annotation to this test's report card. Useful for labelling state transitions, recording measurements, or providing context that isn't obvious from pass/fail alone.

```ts
body={async (harness) => {
  harness.note("Before render — pocket not yet set");
  const pocket = harness.set(new Pocket());
  await harness.delay({ milliseconds: 100 });
  harness.note(`After 100ms — value is: ${pocket.value}`);
  harness.capture("png");
  harness.note("Screenshot taken");
}}
```

Notes appear in the report in the order they were called, interleaved with captures if the report orders by call sequence. When not reporting, this is a no-op.

### `name` prop on `<Sweater>`

The test name appears as the heading of each report card and in the stdout summary. Without a name, tests are anonymous in the report — fine for small files but hard to read in a large suite.

```svelte
<Sweater name="renders correct value after debounce" body={…}>
```

### `id` prop on `<Sweater>`

A stable identifier used to correlate results across runs (e.g. when diffing reports). If omitted, the name is used as the identifier. Useful when test names might change but identity should remain stable.

---

## New Node.js Files

### `release/utils/report-events.ts` (new)

Contains two server primitives, both kept separate from `report.ts` so they can be imported independently in tests.

```ts
export type TestResult = {
  name?: string;
  id?: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  error?: { message: string; stack?: string; matcherResult?: unknown };
  captures: Array<{ type: string; dataUri: string }>;
  notes: string[];
};

/**
 * Starts a short-lived HTTP server that waits for a single `gallery-ready` event.
 * Used by generateReport to receive the component path list from Gallery.svelte.
 *
 * Returns { url, paths }:
 *   url   — pass as ?reportServer=<url> when opening the gallery tab
 *   paths — resolves with string[] when the gallery-ready event is received;
 *           server closes itself immediately after
 */
export const startDiscoveryServer = (timeout = 30_000): Promise<{
  url: string;
  paths: Promise<string[]>;
}> => { … }

/**
 * Starts an HTTP server on a random port bound to 0.0.0.0.
 * Used once per component tab to collect test results.
 *
 * Returns { url, done, close }:
 *   url  — pass as ?reportServer=<url> when opening the component tab
 *   done — resolves with TestResult[] when suite-ready + all test events received;
 *          server closes itself immediately after
 *   close — shuts the server down early if needed
 */
export const startEventServer = (timeout = 60_000): Promise<{
  url: string;
  done: Promise<TestResult[]>;
  close: () => void;
}> => { … }
```

Both servers bind to `0.0.0.0` so they are reachable from browser containers sharing the devcontainer network. Both use `getDevcontainerIp()` to build their `url`. Both close automatically on success and reject on timeout.

### `release/utils/report-html.ts` (new)

A pure function. No side effects, no I/O.

```ts
type ReportInput = {
  generatedAt: string;
  galleryUrl: string;
  browsers: Array<{
    kind: string;
    componentPath?: string;  // undefined = single-component run; set = gallery run
    results: TestResult[];
  }>;
};

export const renderReport = (input: ReportInput): string
```

Output: a self-contained HTML string with:
- Summary bar: total, passed, failed, total duration
- Per-browser section (collapsed if only one browser)
- Per-test card: status badge, name, duration, error block (`<details>`), notes list, inline `<img>` captures
- All styles inlined, no external CDN dependencies

### `release/utils/report-print.ts` (new)

Writes a Vitest-style summary to a provided `write` function (defaults to `process.stdout.write`). Accepting `write` as a parameter makes the function testable without monkey-patching.

```ts
export const printReport = (
  input: ReportInput,
  options?: { outputPath?: string; write?: (s: string) => void }
): void
```

Format:
```
sweater-vest report
─────────────────────────────────────────────
 PASS  ComponentA   (3 tests, 142ms)
 FAIL  ComponentB   (2 tests, 89ms)
       ● My failing test
         Expected: "hello"
         Received: "world"
 SKIP  ComponentC   (4 tests skipped)
─────────────────────────────────────────────
Tests:  4 passed, 1 failed, 4 skipped, 9 total
Time:   231ms
Report: ./sweater-vest-report.html
```

A component line shows `SKIP` (yellow/dim) when all its tests were skipped (i.e., it matched `componentPattern` but no tests matched `testPattern`). Individual skipped tests within an otherwise-run component are counted in the totals but not printed as separate lines.

Uses ANSI colour codes when `process.stdout.isTTY` is true and no `write` override is provided (`tty = !options?.write && process.stdout.isTTY`). This means injected `write` functions used in tests always receive plain text, so test assertions never need to strip escape codes. Per-test error lines show the message and first relevant stack frame only; full traces are in the HTML file.

### `release/report.ts` (new — consumer-facing entry point)

Orchestrates the full flow. Exports `generateReport` and, when run directly as a script, invokes it with defaults.

```ts
export type ReportOptions = {
  /** URL where Gallery.svelte is rendered. Default: http://<devcontainerIp>:5173 */
  galleryUrl?: string;
  browsers?: Browser[];         // default: ["chromium"]
  outputPath?: string;          // default: ./sweater-vest-report.html
  componentPattern?: RegExp;    // filter received paths — only open matching components
  testPattern?: RegExp;         // filter test names within each opened component
};

export const generateReport = async (options: ReportOptions = {}): Promise<void>
```

When invoked as a script, CLI arguments are parsed into these options:

```sh
# run all components
npm run report

# only components whose path matches /Button/i
npm run report Button

# only tests whose name matches /hover/i, across all components
npm run report -- -t hover

# both: only the Button component, only tests named hover
npm run report Button -t hover
```

The positional argument and `-t` value are treated as case-insensitive regular expressions, matching Vitest's convention. Parsing uses `process.argv` directly — no argument-parser dependency needed for two flags.

The CLI entry point guard uses `fileURLToPath(import.meta.url) === process.argv[1]` to detect when the script is run directly, which works correctly under both `node --experimental-strip-types` and compiled output.

**Steps inside `generateReport`:**

1. **Resolve `galleryUrl`** via `getDevcontainerIp()` if not provided.

2. **Start browser containers in parallel** via `buildAndRun` + `playwright.ready` for each requested browser.

3. **Open playwright sessions** via `sessionWithTabs` for each browser.

4. **For each browser, receive component paths from Gallery.svelte:**
   ```ts
   const discovery = await startDiscoveryServer();
   const discoveryTabUrl = new URL(options.galleryUrl!);
   discoveryTabUrl.searchParams.set("reportServer", discovery.url);
   await session.newTab(discoveryTabUrl.toString());
   // Gallery.svelte onMount fires → POSTs gallery-ready { paths }
   const allPaths = await discovery.paths;

   const paths = componentPattern
     ? allPaths.filter((p) => componentPattern.test(p))
     : allPaths;
   ```
   No DOM scraping, no polling for buttons — Gallery.svelte pushes the paths.

5. **Open all filtered component tabs in parallel**, one event server per component:
   ```ts
   const componentResults = await Promise.all(
     paths.map(async (componentPath) => {
       const server = await startEventServer(timeout);
       const url = new URL(options.galleryUrl);
       url.searchParams.set("component", componentPath);
       url.searchParams.set("reportServer", server.url);
       if (testPattern) url.searchParams.set("testFilter", testPattern.source);
       await session.newTab(url.toString());
       const results = await server.done;
       return { componentPath, results };
     }),
   );
   ```
   All component tabs run simultaneously. `server.done` resolves when `suite-ready` plus all `test-complete`/`test-skipped` events for that component have been received.

   Note: when a component tab opens with `?component=<path>`, Gallery.svelte also fires its `onMount` again and would POST another `gallery-ready` to the `reportServer` URL. Since the component tabs use per-component servers (not the discovery server), this event arrives at an active event server which simply ignores unknown event types — no interference.

6. **Call `printReport`** to write the stdout summary (including skipped count if any).

7. **Call `renderReport`** and write to `outputPath` via `fs/promises.writeFile`. Log the output path to `console.log` afterwards.

8. **Clean up:** close sessions (inside the loop per browser), remove browser containers in a `finally` block via `Promise.allSettled` so cleanup always runs even if a browser errors.

---

## `docker/vite/report/` Test Plan

All tests run under the `single` Vite harness in the Vitest `server` project. The event server replaces all `evaluateOnTab`-based polling in the result assertions.

---

### Fixture: `docker/vite/report/Component.test.svelte` (new)

```svelte
<script lang="ts">
  import { Sweater } from "./release";
  class Pocket {
    el = $state<HTMLSpanElement | undefined>(undefined);
  }
</script>

<!-- Test 1: passes cleanly -->
<Sweater name="passes" body={async ({ expect }) => {
  expect(1 + 1).toBe(2);
}}>
  {#snippet vest(p: Pocket)}
    <span>passing content</span>
  {/snippet}
</Sweater>

<!-- Test 2: intentional failure to exercise error recording -->
<Sweater name="fails" body={async ({ expect }) => {
  expect("actual").toBe("expected");
}}>
  {#snippet vest(p: Pocket)}
    <span>failing content</span>
  {/snippet}
</Sweater>

<!-- Test 3: capture + note to exercise both reporting paths -->
<Sweater name="captures" body={async (harness) => {
  harness.note("before screenshot");
  const { uri } = harness.capture("png");
  await uri;
  harness.note("after screenshot");
  harness.expect(true).toBe(true);
}}>
  {#snippet vest(p: Pocket)}
    <span bind:this={p.el} style="padding: 8px; background: #e0f0ff;">
      capture me
    </span>
  {/snippet}
</Sweater>
```

---

### Test Suite: `docker/vite/report/test.ts` (new)

**Setup:**

```ts
import { describe, test, expect } from "vitest";
import { sessionSuite } from "../.harness/index.ts";
import { startEventServer, type TestResult } from "../../../release/utils/report-events.ts";
import { renderReport } from "../../../release/utils/report-html.ts";
import { printReport } from "../../../release/utils/report-print.ts";

describe("report", { concurrent: true }, () => {
  const { open } = sessionSuite(import.meta.dirname, "single");

  // Opens the fixture page with a fresh event server.
  // Returns { results } — resolves when all 3 tests have reported in.
  const run = async () => {
    const server = await startEventServer();
    await open({ reportServer: server.url });
    return { results: await server.done };
  };

  // ...tests
});
```

Each test calls `run()` independently. The event server is per-invocation on a random OS-assigned port, so concurrent tests don't collide.

---

#### Test 1 — Event server receives exactly 3 results

```ts
test("receives one result per test", async () => {
  const { results } = await run();
  expect(results).toHaveLength(3);
}, 90_000);
```

If `suite-ready` never fires or any `test-complete` event is lost, `server.done` times out and the test fails. This is the fundamental liveness check.

---

#### Test 2 — Passing test recorded correctly

```ts
test("passing test has correct fields", async () => {
  const { results } = await run();
  const passing = results.find((r) => r.name === "passes");

  expect(passing).toBeDefined();
  expect(passing!.status).toBe("passed");
  expect(passing!.error).toBeUndefined();
  expect(passing!.durationMs).toBeGreaterThanOrEqual(0);
  expect(passing!.captures).toHaveLength(0);
  expect(passing!.notes).toHaveLength(0);
}, 90_000);
```

---

#### Test 3 — Failing test recorded with error details

```ts
test("failing test has error message, stack, and matcherResult", async () => {
  const { results } = await run();
  const failing = results.find((r) => r.name === "fails");

  expect(failing).toBeDefined();
  expect(failing!.status).toBe("failed");
  expect(failing!.error).toBeDefined();
  expect(failing!.error!.message).toContain("expected");
  expect(typeof failing!.error!.stack).toBe("string");
  expect(failing!.error!.stack!.length).toBeGreaterThan(0);
  expect(failing!.error!.matcherResult).toBeDefined();
}, 90_000);
```

`matcherResult` is provided by `@storybook/test`'s matcher error objects and is used for the diff display in the HTML report.

---

#### Test 4 — Capture is delivered to the server

```ts
test("capture is included in test-complete event as a data URI", async () => {
  const { results } = await run();
  const capturing = results.find((r) => r.name === "captures");

  expect(capturing).toBeDefined();
  expect(capturing!.status).toBe("passed");
  expect(capturing!.captures).toHaveLength(1);
  expect(capturing!.captures[0].type).toBe("png");
  expect(capturing!.captures[0].dataUri).toMatch(/^data:image\/png;base64,/);
}, 90_000);
```

The `await uri` in the fixture ensures the image renders before the body returns. If the `pendingCaptures` tracking in `Runner.svelte` is broken, `captures` will be empty.

---

#### Test 5 — Notes are included in the event

```ts
test("notes are recorded in order", async () => {
  const { results } = await run();
  const capturing = results.find((r) => r.name === "captures");

  expect(capturing!.notes).toEqual(["before screenshot", "after screenshot"]);
}, 90_000);
```

---

#### Test 6 — `TestAborted` does not produce a test-complete event

Aborting a test (live-reload) should not produce a `test-complete` event — the abort is a framework concern, not a test result. This is tested indirectly: the fixture has exactly 3 tests. If an abort were incorrectly reported as a failure, `results.length` would be > 3 or a `"failed"` result would appear with no matching test name.

Tests 1 and 2 together cover this: Test 1 asserts exactly 3 results, and Test 3 confirms the only `"failed"` entry is the intentional one named `"fails"`.

---

#### Test 7 — No console errors

```ts
test("no console errors despite intentional test failure", async () => {
  const server = await startEventServer();
  const tab = await open({ reportServer: server.url });
  await server.done;
  await tab.expectNoConsoleErrors();
}, 90_000);
```

Confirms that the intentional `expect` failure in the `"fails"` test is caught by `Container.svelte`'s error handler and does not surface as an unhandled browser error. This is the existing framework contract.

---

#### Test 8 — HTML generator output (Node.js-only, no browser)

```ts
test("renderReport produces valid self-contained HTML", () => {
  const results: TestResult[] = [
    { name: "passes", status: "passed", durationMs: 12, captures: [], notes: [] },
    {
      name: "fails",
      status: "failed",
      durationMs: 8,
      captures: [],
      notes: [],
      error: {
        message: 'Expected "actual" to be "expected"',
        stack: "Error: Expected...\n    at Object.<anonymous>",
        matcherResult: { pass: false },
      },
    },
    {
      name: "captures",
      status: "passed",
      durationMs: 55,
      captures: [{ type: "png", dataUri: "data:image/png;base64,iVBORw0KGgo=" }],
      notes: ["before screenshot", "after screenshot"],
    },
  ];

  const html = renderReport({
    generatedAt: new Date().toISOString(),
    galleryUrl: "http://localhost:5173",
    browsers: [{ kind: "chromium", results }],
  });

  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("</html>");
  expect(html).toContain("2 passed");
  expect(html).toContain("1 failed");
  expect(html).toContain("passes");
  expect(html).toContain("fails");
  expect(html).toContain("captures");
  expect(html).toContain('Expected "actual" to be "expected"');
  expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
  expect(html).toContain("<img");
  expect(html).toContain("before screenshot");
  // Self-contained — no external resources
  expect(html).not.toMatch(/src="https?:/);
  expect(html).not.toMatch(/href="https?:/);
});
```

---

#### Test 9 — Console print output (Node.js-only, no browser)

```ts
test("printReport writes expected summary to stdout", () => {
  const lines: string[] = [];
  const write = (s: string) => { lines.push(s); return true; };

  printReport(
    {
      generatedAt: new Date().toISOString(),
      galleryUrl: "http://localhost:5173",
      browsers: [{ kind: "chromium", results: [ /* same as Test 8 */ ] }],
    },
    { outputPath: "./report.html", write },
  );

  const output = lines.join("");
  expect(output).toContain("PASS");
  expect(output).toContain("FAIL");
  expect(output).toContain("passes");
  expect(output).toContain("fails");
  expect(output).toContain('Expected "actual"');
  expect(output).toMatch(/2 passed/);
  expect(output).toMatch(/1 failed/);
  expect(output).toMatch(/3 total/);
  expect(output).toContain("./report.html");
});
```

---

### What the test plan does NOT cover (and why)

| Scenario | Reason |
|---|---|
| `harness.capture("jpeg")` and `"svg"` | Same `pendingCaptures` path as `"png"` — one type is sufficient. |
| Multi-browser runs | The orchestration layer is tested manually or in a future suite; per-browser data collection uses the same `startEventServer` path. |
| SvelteKit harness | Out of scope for v1; browser-side changes are harness-agnostic. |
| `Gallery.svelte` → `startDiscoveryServer` integration | `startDiscoveryServer` is unit-tested in Step 1 (synthetic POST), and Gallery.svelte's `onMount` fetch is verified against the existing gallery test. But the two are never exercised together in a browser in this suite — that path is only covered by running `generateReport` end-to-end. |
| Server timeout / hung page | Covered by Vitest's per-test timeout; `startEventServer` rejects after its own timeout as a secondary guard. |

---

## Implementation Sequence

### Step 1 — `release/utils/report-events.ts`

Implement `startDiscoveryServer` and `startEventServer`. Unit test each independently: POST a synthetic `gallery-ready` event and assert `paths` resolves; POST `suite-ready` + `test-complete` events and assert `done` resolves with the expected results. No Docker needed.

### Step 2 — `release/vite/Gallery.svelte` — add `onMount` POST

Add the 7-line `onMount` block. Verify the existing gallery test still passes (button click behaviour is unchanged; the new `fetch` is a no-op when `reportServer` is absent).

### Step 3 — Instrument `Runner.svelte`

Add URL reading, `testFilter`, `pendingCaptures`, `note`, and the `.then(onFulfilled, onRejected)` send chain. Verify existing tests still pass (new code paths are only reached when `reportServerUrl` is non-null).

### Step 4 — Instrument `Sweater.svelte`

Add the 7-line `suite-ready` fetch. Verify existing tests still pass.

### Step 5 — `release/utils/report-html.ts` and `report-print.ts`

Implement both as pure functions. Tests 8 and 9 from the test plan can be written and run at this point without Docker.

### Step 6 — `release/report.ts`

Wire the full `generateReport` flow using the pieces from Steps 1–5.

### Step 7 — `docker/vite/report/Component.test.svelte` and `test.ts`

Add the fixture and the Vitest integration suite. This validates the end-to-end event flow (Steps 1–4) inside a real browser container.

---

## Consumer Usage

### Vite project

```jsonc
// package.json
{
  "scripts": {
    "dev": "vite",
    "report": "node --experimental-strip-types ./node_modules/sweater-vest-suede/release/report.ts"
  }
}
```

```sh
# Terminal 1
npm run dev

# Terminal 2
npm run report
# → prints summary, writes sweater-vest-report.html
```

### Multi-browser

```ts
import { generateReport } from "sweater-vest-suede/release/report";

await generateReport({
  browsers: ["chromium", "firefox", "webkit"],
  outputPath: "./reports/latest.html",
});
```

---

## Open Questions / Future Work

- **Multi-browser parallelism:** Currently each browser runs its full gallery pass in sequence. All component tabs within one browser run in parallel already. Running multiple browsers simultaneously would further reduce total time; punted to keep the orchestration obvious in v1.
- **Report diffing:** Compare current results against a stored baseline to surface regressions. Out of scope.
- **`harness.note` in non-report runs:** Currently a no-op. Could also `console.log` so it's visible in browser devtools during interactive development. Deferred — easy to change without touching the protocol.
- **`harness.capture` with `blob`/`canvas`/`pixelData`:** No string URI, so these types don't appear in the report. A future wrapper could call `.toPng()` internally if the user opts in.
- **SvelteKit:** Handled separately. The same event-server protocol applies; the gallery enumeration step will use the equivalent SvelteKit gallery page once that is built.
