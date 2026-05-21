# Sweater Vest — Deep Dive for Maintainers

This document is a technical reference for developers who need to understand, extend, or debug the sweater-vest-suede project. It covers the public library surface (the `release/` folder), the suede dependencies bundled with it, and the test infrastructure built in `docker/` and `src/`.

---

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [What Gets Published](#2-what-gets-published)
3. [Public API — `<Sweater>` and `<Closet>`](#3-public-api--sweater-and-closet)
4. [Internal Architecture](#4-internal-architecture)
   - [Sweater.svelte](#sweatersvelte)
   - [Container.svelte](#containersvelte)
   - [Runner.svelte](#runnersvelte)
   - [Closet.svelte](#closetsvelte)
5. [Utility Modules](#5-utility-modules)
6. [Report System](#6-report-system)
7. [Suede Dependencies](#7-suede-dependencies)
   - [programmatic-docker-suede](#programmatic-docker-suede)
   - [browser-control-container-suede](#browser-control-container-suede)
   - [dockview-svelte-suede](#dockview-svelte-suede)
   - [typescript-cli-suede](#typescript-cli-suede)
8. [Test Infrastructure](#8-test-infrastructure)
   - [Vitest configuration](#vitest-configuration)
   - [Vite harness Docker image](#vite-harness-docker-image)
   - [Test harness API (`docker/vite/.harness/index.ts`)](#test-harness-api)
   - [Single-component tests](#single-component-tests)
   - [Closet tests](#closet-tests)
9. [End-to-End Test Lifecycle](#9-end-to-end-test-lifecycle)
10. [Known Gotchas & Design Decisions](#10-known-gotchas--design-decisions)

---

## 1. Repository Layout

```
release/          ← Published package source (what consumers install)
  index.ts        ← Public entrypoint: exports Sweater component + types
  Sweater.svelte  ← Top-level component; routing logic for config vs test
  Container.svelte← Manages the dockview grid for a group of tests
  Runner.svelte   ← Executes a single test body; mounts the vest snippet
  Closet.svelte   ← Gallery component; renders a browseable tree of test files
  report.sh       ← Shell helper to run the report script
  utils/          ← Shared utilities (defer, abort, capture, options, etc.)
  report/         ← Report system: event types, HTTP server, CLI entry, renderers
  templates/      ← Starter templates (svelte, sveltekit, vite)
  .suede/         ← Suede subdependencies (see §7)

src/              ← Minimal SvelteKit app (dev scaffolding only)
  demo.spec.ts    ← Basic smoke test

docker/           ← Docker-based integration test harness
  vite/
    .harness/     ← Shared harness: Dockerfile, Vitest helpers, base config, entry points
      base/       ← Shared Vite app skeleton (package.json, vite.config.ts, index.html)
      closet.ts   ← Entry point for closet-harness builds
      single.ts   ← Entry point for single-harness builds
    closet/       ← Closet test suite + A/B/C fixture components
    live-reload/  ← Live-reload smoke test
    report/       ← Report-related test cases

tsconfig.json, svelte.config.js, vite.config.ts  ← Build/test configuration
```

---

## 2. What Gets Published

The `release/` folder is the installable package. Consumers import from it as follows:

```ts
import { Sweater } from "<path>/sweater-vest-suede";
import type { TestHarness, PocketElements } from "<path>/sweater-vest-suede";
```

The package has **no build step** — it is consumed directly from source by the host project's bundler (Vite). The `release/.suede/` subdirectories are co-published suede dependencies (see §7).

### Runtime dependencies consumers must have

| Package                      | Use                                      |
| ---------------------------- | ---------------------------------------- |
| `svelte` ≥ 5                 | Framework                                |
| `@storybook/test`            | `expect`, `userEvent` inside test bodies |
| `dockview` + `dockview-core` | Grid layout used by `Container.svelte`   |
| `html-to-image`              | `harness.capture()`                      |

---

## 3. Public API — `<Sweater>` and `<Closet>`

### `<Sweater>`

`<Sweater>` is the primary exported component. It is overloaded: it acts either as a **test** node or as a **config** (group) node depending on which props are passed.

#### Test usage

```svelte
<Sweater
  body={async (harness) => {
    const { set, expect, definition } = harness;
    const pocket = set(new Pocket());
    pocket.value = "hello";
    const { el } = await definition("el");
    expect(el.textContent).toBe("hello");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <span bind:this={pocket.el}>{pocket.value}</span>
  {/snippet}
</Sweater>
```

#### `Props<T>` (test mode)

| Prop       | Type                                                  | Description                                                        |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `vest`     | `Snippet<[pocket: T]>`                                | Required. The rendered markup for the test.                        |
| `body`     | `(harness: TestHarness<T>) => Promise<void>`          | Required. The async test logic.                                    |
| `name`     | `string?`                                             | Display name shown in the panel tab.                               |
| `id`       | `string?`                                             | Stable identifier for targeting a specific test.                   |
| `mode`     | `"parallel" \| "serial"`                              | Scheduling relative to siblings. Default: `"parallel"`.            |
| `manual`   | `boolean`                                             | If `true`, waits for an external trigger before running.           |
| `lazy`     | `boolean`                                             | If `true`, `vest` does not render until `harness.set()` is called. |
| `position` | `"above" \| "below" \| "left" \| "right" \| "within"` | Dockview position relative to the previous panel.                  |

#### `TestHarness<T>` — what `body` receives

| Member                        | Description                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `set(pocket)`                 | Initialize/replace the pocket; triggers render if `lazy`.                                 |
| `definition(...keys)`         | Wait for named pocket fields to become non-null (reactive via `$effect`).                 |
| `preventRender()`             | Block render until the returned function is called. Must be called before any `await`.    |
| `container`                   | The raw `HTMLElement` wrapping the vest snippet.                                          |
| `capture(type, options?)`     | Screenshot/serialize the container. For `"png"`, `"jpeg"`, `"svg"`: returns `{ uri: Promise<string>, download(filename) }`. For `"blob"`, `"canvas"`, `"pixelData"`: returns the raw html-to-image promise. |
| `delay(amount)`               | Sleep for `{ seconds }`, `{ milliseconds }`, `{ minutes }`, or `{ frames }`.              |
| `withUserFocus(fn)`           | Serialize user interaction (click, type, etc.) through a shared queue.                    |
| `onAbort(fn)`                 | Register a teardown callback for when the test is aborted.                                |
| `note(text)`                  | Add a free-form annotation to this test's report card. No-op when no report server is active. |
| All `@storybook/test` exports | `expect`, `vi`, etc. (except `userEvent` — use `withUserFocus` instead).                  |

### Config (group) usage

```svelte
<!-- Nested group -->
<Sweater config>
  <Sweater body={...}>{#snippet vest(p)}{/snippet}</Sweater>
  <Sweater body={...}>{#snippet vest(p)}{/snippet}</Sweater>
</Sweater>

<!-- Sequential group (no children, just a separator) -->
<Sweater config />
<Sweater body={...}>{#snippet vest(p)}{/snippet}</Sweater>
```

Config nodes accept `orientation`, `mode`, `category`, `class`, and `style` forwarded to `Container.svelte`. The `category` prop is reported as part of the container metadata and can be used to filter tests when generating reports.

### `<Closet>`

`Closet.svelte` is a browseable gallery component for navigating test files. Consumers mount it and pass the result of `import.meta.glob(...)`:

```svelte
<script>
  import Closet from "<path>/sweater-vest-suede/Closet.svelte";
</script>

<Closet glob={import.meta.glob("/src/**/*.test.svelte")} />
```

It renders a nested tree of buttons (one per discovered file), sorted so directories appear before files. Clicking a button sets `?component=<path>` in the URL and lazily loads + mounts that component. It also supports fuzzy path resolution so shortened names (e.g. `"ComponentName"`) work in the URL.

When `?reportServer=<url>` is present and no `?component=` is set, `Closet` POSTs a `closet-ready` event to the server with the full list of discovered paths (used by `generateReport` during discovery).

---

## 4. Internal Architecture

### Sweater.svelte

The single-component facade. On `onMount` it:

1. Determines whether it is a **test** or **config** node.
2. Pushes itself into the appropriate `Container` via the `containers` map (a `ContainerMap` Proxy over a `Map<number, Container>`).
3. After all `<Sweater>` instances have mounted (tracked via `counts`), calls `setTotal`, `suiteReady(testCount())` (which POSTs to the report server if active), and `next()` to release the `Container`'s deferred grid API.

Live-reload is handled here: if Vite HMR causes a test to re-mount with a negative index, the page is reloaded (with a guard param to avoid infinite loops).

A standalone test (no enclosing config node) renders its own self-contained `Container` — this is the `selfContained` mechanism.

### Container.svelte

Each config group gets a `Container`. It:

- Wraps a `GridView` (from `dockview-svelte-suede`) inside a `<div>` whose height is split equally among all containers on the page.
- Exposes a `push(props)` method called by `Sweater` after mount.
- Tracks a `mechanism` value (`"nested"`, `"sequential"`, `"self-contained"`) that determines how the container was instantiated.
- Before adding a panel it awaits `pending.abort` to cancel any currently running tests (supports live-reload). The abort waits up to `AbortTimeoutMs` (1000 ms) for all running tests to stop.
- Each panel renders a `Runner` inside a dockview snippet panel.
- Exports a `count()` method used by `Sweater.svelte` to count total tests for the report server.

Layout options (`position`, `orientation`) are passed through to dockview's `addSnippetPanel`.

### Runner.svelte

Runs **one** test. On `onMount`:

1. Calls `reportables()` from `report/client.ts` to obtain `createCapturer`, `note`, `complete`, `fail`, and `skip` hooks (all no-ops if no `?reportServer=` param is present).
2. Checks `skip(signature)` — if the test's name/id/container category doesn't match the `?testFilter=` regex, it short-circuits and posts a `test-skipped` event.
3. Enqueues the test body into the module-level `PromiseQueue` (`queue`).
4. Calls `queue.open()` to allow the queue to start draining.
5. Renders the `vest` snippet inside a `<div>` once the queue reaches this test's turn (guarded by the `gate` promise).

The `harness` object passed to `body` proxies all members through an `AbortController` so that any access after the test has been aborted throws a `TestAborted` error (caught and silently swallowed by `Container`).

`set()` wraps the pocket assignment and — when `lazy` is set — calls `flushSync()` to force an immediate DOM update before the body continues.

`definition()` uses `$effect.root` to subscribe to reactive pocket fields. It races the resolution of all requested keys against the abort signal.

The `begin` callback is supplied by `Container` and manages the set of live abort functions, clearing `pending.abort` when the test begins and removing itself when complete.

### Closet.svelte

See §3 for the consumer-facing API. Internally it:

- Builds a `Tree` (nested record of path strings) from the `glob` keys.
- Renders the tree recursively using a `{#snippet renderTree(node)}` with `<details open>` for directories.
- Sorts entries so directories appear before files.
- On mount, reads `?component=` from the URL to pre-select a component without a click (supports direct navigation from report links).
- Uses `SvelteURLSearchParams` so `selected` is reactive to history pushes.

---

## 5. Utility Modules

| File                     | Purpose                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/index.ts`         | `defer<T>()`, `accumulate()`, `readableTimestamp()`, `Expand<T>`, `sort.byIndex`                                                      |
| `utils/abort.ts`         | `createTestAbortMechanism()` — abort controller, `wrap`, `proxy`, `until`, `tryError`                                                 |
| `utils/capture.ts`       | `createCapturer(root)` — typed wrapper around `html-to-image`; returns `{ uri, download }` for string-valued capture types           |
| `utils/promise-queue.ts` | `PromiseQueue` — serial/parallel task scheduling with deferred start                                                                  |
| `utils/until.ts`         | `nextFrame()`, `milliseconds(ms)` — simple timing primitives                                                                          |
| `utils/container-map.ts` | `createContainerMap()` — Proxy that maps numeric indices to `Container` instances while also tracking Svelte context-based containers |
| `utils/options.ts`       | `getOrDefault`, `getOrDefaults` — type-safe option resolution with defined-defaulted key semantics                                    |
| `utils/types.ts`         | `Fn`, `ExcludeOptional<T>`                                                                                                            |

### PromiseQueue

Tests within a group are added to a single `PromiseQueue`. The `mode` of each task determines ordering:

- `"parallel"` tasks added consecutively share a common `start` and race to complete together.
- A `"serial"` task always waits for the previous task's `complete` promise before starting.

The queue does not start until `queue.open()` is called (done in `Runner.onMount`).

---

## 6. Report System

`release/report/` contains everything needed to programmatically run tests across multiple browsers and produce a Markdown report.

### Key files

| File              | Purpose                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `events.ts`       | `Event` namespace (typed event union), `TestResult`, `startReportServer()`, `ReportServer` type             |
| `client.ts`       | Browser-side helpers: `param()`, `server()`, `tryPost()`, `suiteReady()`, `reportables()`                   |
| `server.ts`       | `createHttpListener()` — raw Node.js HTTP server that reads POST bodies and dispatches to a handler callback |
| `index.ts`        | `generateReport(options?)`, `Report` namespace, defaults, CLI entry point (via `typescript-cli-suede`)       |
| `markdown.ts`     | `renderMarkdown(input)` — converts `Report.RenderInput` into a Markdown string                               |
| `print.ts`        | `printReport(input, options)` — pretty-prints a summary to stdout                                            |

### `generateReport(options?)`

The main entry point for programmatic report generation. Options:

| Option      | Default                           | Description                                              |
| ----------- | --------------------------------- | -------------------------------------------------------- |
| `server`    | `http://<devcontainer-ip>:5173`   | URL of the running Vite dev server.                      |
| `closet`    | `"/"`                             | Path on `server` where `Closet.svelte` is rendered.      |
| `browsers`  | `["chromium"]`                    | Which browsers to run.                                   |
| `output`    | `"./fashion-show.md"`             | Path to write the Markdown report (empty string to skip).|
| `component` | `undefined`                       | Regex filter — only open matching component paths.       |
| `test`      | `undefined`                       | Regex filter — only run tests with matching name or id.  |

`generateReport` builds or reuses browser containers (one per browser), opens a playwright session, discovers components via the Closet, then runs each `(component, browser)` pair. It posts `?reportServer=<url>&component=<path>` URLs to the browser and collects structured `TestResult` objects. On completion it writes the Markdown file and returns a `Report.Result.Summary`.

### Report server routing

The HTTP server receives events at two route patterns:

- `POST /discover` — receives `closet-ready` from the first browser that opens the Closet; resolves `server.paths`.
- `POST /<browser>` — receives `suite-ready`, `test-complete`, and `test-skipped` from `Runner.svelte` and `Sweater.svelte`.

### Browser-side integration

`report/client.ts` is imported by `Sweater.svelte` and `Runner.svelte`. The `?reportServer=` URL query parameter activates reporting mode:

- `suiteReady(n)` — called by `Sweater.svelte` after all instances mount, sends total test count.
- `reportables()` — called by `Runner.svelte`; returns capture/note/complete/fail/skip callbacks that post to the server. When `?testFilter=<regex>` is also present, `skip()` returns `true` for tests whose name, id, or container category doesn't match.

### CLI usage

`release/report/index.ts` can also be run directly as a CLI script (it uses `cli.entry` to detect direct execution):

```sh
node release/report/index.ts --server http://localhost:5173 --browser chromium --output report.md
```

---

## 7. Suede Dependencies

These are git-suede subdependencies living in `release/.suede/`. They are separate repos pulled in via [suede](https://github.com/pmalacho-mit/suede). Each has a `.gitrepo` file pointing at its upstream.

### programmatic-docker-suede

`release/.suede/programmatic-docker-suede/`

A thin, typed Node.js API over Dockerode.

**Key exports:**

```ts
import { image, container, docker, dockerode } from "...";
```

#### `image`

| Method                               | Description                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image.build(tag, context, options)` | Build a Docker image. Returns a `CommandStream`. `options.version = "2"` enables BuildKit. `options.include` restricts the tar context. `options.buildargs` sets `--build-arg`. |
| `image.tryRemove(name)`              | Remove an image, ignoring errors.                                                                                                                                               |

#### `container`

| Method                                | Description                                                      |
| ------------------------------------- | ---------------------------------------------------------------- |
| `container.run(options)`              | Create and start a container. Returns the Dockerode `Container`. |
| `container.exec(container, args)`     | Run a command inside a container. Returns a `CommandStream`.     |
| `container.remove(container, force?)` | Remove a container.                                              |
| `container.tryRemove(container)`      | Remove, ignoring errors.                                         |
| `container.isRunning(container)`      | Check if running.                                                |
| `container.log(container)`            | Stream container logs as a `CommandStream`.                      |

#### `docker`

| Method                          | Description                        |
| ------------------------------- | ---------------------------------- |
| `docker.tryCreateNetwork(name)` | Create a network, ignoring errors. |
| `docker.tryRemoveNetwork(name)` | Remove a network, ignoring errors. |

#### `CommandStream`

A lazy, single-use wrapper around a docker exec/build stream. Supports:

- `.complete(encoding?)` — resolves to `{ out, err, exit }` once the command finishes.
- `.chunks(encoding?)` — async iterator that yields `{ kind: "out" | "err", data }` as the stream produces output.

#### `devcontainer.ts`

Helpers to detect the running devcontainer and obtain its network string:

```ts
import devcontainer from "...";
const network = await devcontainer.network(); // "container:<id>"
const ip = devcontainer.ip();                  // non-loopback IP
const { Config } = await devcontainer.inspect();
```

---

### browser-control-container-suede

`release/.suede/browser-control-container-suede/`

Builds and runs a containerized Playwright CLI (`@playwright/cli`) and exposes a session-based tab API to drive it from Node tests.

**Key exports:**

```ts
import { buildAndRun, playwright, sessionWithTabs, browsers } from "...";
```

#### `buildAndRun(browser, options?)`

Builds the browser container image from `docker/` (inside this suede) and starts it. Options:

| Option          | Description                                                     |
| --------------- | --------------------------------------------------------------- |
| `container`     | Override container name (default: `browser-control-<browser>`). |
| `image`         | Override image tag.                                             |
| `network`       | Docker network to join.                                         |
| `log`           | Stream build output to stdout/stderr.                           |
| `onBuild`       | Custom callback receiving the build `CommandStream`.            |
| `skipIfRunning` | Reuse an already-running container instead of rebuilding.       |

#### `playwright`

| Method                                     | Description                                           |
| ------------------------------------------ | ----------------------------------------------------- |
| `playwright.ready(containerName)`          | Poll until `playwright-cli` is accepting connections. |
| `playwright.close(containerName, session)` | Close a playwright session.                           |

#### `sessionWithTabs(container, session, browser)`

Opens a playwright session inside the running container. Returns an object with:

| Method                        | Description                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `newTab(url)`                 | Opens a new browser tab and navigates to `url`. Returns a `tabIndex`.                          |
| `evaluateOnTab(tabIndex, fn)` | Serialize and evaluate a zero-argument function in the tab's page context. Returns the result. |
| `consoleForTab(tabIndex)`     | Returns a string containing all console output (including error counts) from the tab.          |

#### Browser support

Three browsers are supported: `"chromium"`, `"firefox"`, `"webkit"`. Each has its own Dockerfile template under `browsers/`.

---

### dockview-svelte-suede

`release/.suede/dockview-svelte-suede/`

Svelte 5 wrappers around the [dockview](https://dockview.dev/) panel layout library.

**Key exports:**

```ts
import { GridView, DockView, PaneView, SplitView, reactive, themes } from "...";
import type { ViewAPI, PanelProps, ViewProps } from "...";
```

`Container.svelte` uses only `GridView` with an `onReady` callback to obtain the view API. It then calls `api.addSnippetPanel("child", props, options)` to insert `Runner` panels.

The generic type parameters (`ViewKey`, `Renderables`, etc.) provide strong typing for panel props, ensuring the snippet name passed to `addSnippetPanel` matches a declared `snippets` entry.

---

### typescript-cli-suede

`release/.suede/typescript-cli-suede/`

A lightweight, type-safe CLI argument parser for Node.js scripts. Used by `release/report/index.ts` to expose `generateReport` as a runnable command.

**Key exports:**

```ts
import { cli } from "...";

if (cli.entry(import.meta.url)) {
  const { server, browser, output } = cli(
    "Description of the script.",
    cli.flag(["server", "s"], "URL of the dev server.", "http://localhost:5173"),
    cli.flags(["browser", "b"], "Browser(s) to use.", browsers, ["chromium"]),
    cli.flag(["output", "o"], "Output path."),
  );
  // ...
}
```

| Export         | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `cli(...)`     | Parse `process.argv`, apply defaults, return typed result object.        |
| `cli.flag`     | Define a single-value flag (string or number) with optional shorthand.   |
| `cli.flags`    | Define a multi-value (`multiple: true`) flag with an allowed-values set. |
| `cli.entry`    | Returns `true` when the current file is the process entry point.         |

The result object supports positional argument access via numeric indices (`result[0]`) and iteration. Passing `--help` / `-h` prints usage and exits.

---

## 8. Test Infrastructure

Tests are run with Vitest. There are two Vitest projects defined in `vite.config.ts`:

### Vitest configuration

| Project  | Environment                              | Includes                                                                |
| -------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `client` | `browser` (Playwright/Chromium headless) | `src/**/*.svelte.{test,spec}.{js,ts}`                                   |
| `server` | `node`                                   | `{src,docker}/**/*{test,spec}.{js,ts}` (excluding svelte browser tests) |

The Docker integration tests (`docker/vite/*/test.ts`) run in the **server** project — they are plain Node.js programs that orchestrate Docker containers and drive a Playwright browser.

Run all tests:

```sh
npm test
```

Run a specific test directory:

```sh
npm run test docker/vite/closet/
```

---

### Vite harness Docker image

`docker/vite/.harness/Dockerfile`

A single Dockerfile builds all test cases via two `ARG`s:

- `TEST_CASE` — the name of the subdirectory under `docker/vite/` containing the component-under-test (e.g. `closet`, `live-reload`).
- `HARNESS` — either `single` or `closet`, selecting which entry-point file from `.harness/` to use (`single.ts` or `closet.ts`).

**Layer structure:**

```
FROM node:22-bookworm-slim
COPY docker/vite/.harness/base/package.json → /app/package.json
RUN npm install (BuildKit npm cache mount at /root/.npm)
COPY docker/vite/.harness/base/ → /app/
COPY docker/vite/.harness/${HARNESS}.ts → /app/src/main.ts
COPY docker/vite/${TEST_CASE}/ → /app/src/  (excluding *.test.ts files)
COPY release/ → /app/src/release/
CMD npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

The image is built using BuildKit (`version: "2"` in `image.build`) with the context restricted to `["docker/vite", "release"]` to minimize tar overhead. The `COPY --exclude` flags drop `*.test.ts` files and the `release/` directory from the test-case layer (which is populated separately), avoiding stale artefacts.

---

### Test harness API

`docker/vite/.harness/index.ts`

This module is imported by every `test.ts` file. It provides:

#### `sessionSuite(import_meta_dirname, harness)`

The main setup helper. Call it at the top of a `describe` block:

```ts
const { open, edit, config } = sessionSuite(import.meta.dirname, "single");
```

It registers `beforeAll` / `afterAll` hooks that:

1. Create a Docker network.
2. In parallel: build + start the Vite container (`prepare.vite`); build + start the browser container (`prepare.browser`).
3. Poll `browserCanReachVite` until HTTP connectivity is confirmed.
4. Open a playwright session.
5. On teardown: close the session, remove both containers, remove the network.

The test case name is derived from `basename(import.meta.dirname)`, so the containing folder name becomes the Docker container/image/network name.

Returns:

| Member                       | Description                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `config`                     | Typed name constants for network, containers, URLs (from `configure()`).                 |
| `open(queryParams?)`         | Open a new browser tab at the Vite URL (with optional query params). See below.          |
| `edit(file, sedExpr)`        | Run `sed -i <sedExpr>` on `/app/src/<file>` inside the Vite container.                   |
| `prependToSvelteModule(file, content)` | Insert `content` as the first line inside the `<script lang="ts" module>` block. |

#### `open(queryParams?)`

Opens a new browser tab at the Vite dev server URL (optionally with query params). Returns:

```ts
{
  tabIndex: number,
  evaluate: <T>(fn: () => T) => Promise<T>,
  expectNoConsoleErrors: () => Promise<void>,
  console: () => Promise<string>,
}
```

`evaluate` serializes the function and runs it inside the page via `evaluateOnTab`. **The function must be zero-argument and must not close over any local variables** (it is serialized to a string).

#### `poll(fn, options?)`

```ts
poll(async () => boolean, { timeout?: ms, interval?: ms }): Promise<void>
// or shorthand:
poll(async () => boolean, timeoutMs: number): Promise<void>
```

Retries `fn` until it returns `true` or the timeout expires. Throws on timeout. Default: 30 s timeout, 1 s interval.

#### `catcher(fn)`

Wraps a function to return `false` instead of throwing. Useful inside `poll` callbacks where transient errors should be treated as "not yet ready".

#### `configure(test, harness, browser?)`

Returns the configuration object (container names, image tags, network name, URLs) for a given test. Used internally by `sessionSuite`.

#### `buildViteImage(config)`, `prepare.vite(config)`, `prepare.browser(config)`, `browserCanReachVite(config)`

Lower-level helpers exposed for test cases that need fine-grained control over the setup lifecycle. `prepare.vite` builds the image and removes any existing container concurrently. `prepare.browser` builds and starts the browser container, then waits for Playwright to become ready.

---

### Single-component tests

`docker/vite/.harness/single.ts`

Entry point for testing a single Svelte component in isolation. Mounts a `Component.test.svelte` file directly and runs its `<Sweater body={...}>` test(s). The test file is placed at `/app/src/` by the Dockerfile (as `Component.test.svelte`). The base Vite config resolves `release/` from `/app/src/release/`.

---

### Closet tests

`docker/vite/.harness/closet.ts`

Entry point for the closet gallery harness. It mounts `Closet.svelte` (from `release/`) and passes it the result of:

```ts
import.meta.glob("/src/**/*.test.svelte")
```

(Note the required leading `/` — patterns without it are relative to the file, not the project root.)

`docker/vite/closet/test.ts` tests this harness end-to-end. It verifies:

- All expected links appear in the gallery UI.
- Clicking a link updates the URL and renders the component's output.

The test fixtures (`A.test.svelte`, `B.test.svelte`, `C.test.svelte`) each render a `<Component text="A/B/C" />` where `Component.svelte` outputs `<span>{text}</span>`.

---

## 9. End-to-End Test Lifecycle

A full test run for e.g. `docker/vite/closet/` looks like this:

```
Vitest (server project)
  └─ docker/vite/closet/test.ts
       └─ describe("gallery component")
            └─ beforeAll [sessionSuite]
                 1. docker.tryCreateNetwork("vite-closet-network")
                 2a. prepare.vite(config)
                     → removes old container concurrently with image build
                     → image.build("vite-closet:latest", ..., { TEST_CASE="closet", HARNESS="closet" })
                     → streams Dockerfile build output
                 2b. prepare.browser(config)
                     → buildAndRun("chromium", { network, container })
                     → playwright.ready(browserContainer)
                 3. browserCanReachVite(config)
                     → exec node -e "fetch(viteUrl)" in browser container
                 4. sessionWithTabs(...)
                     → open playwright session
            └─ test("all links")
                 open() → newTab(viteUrl)
                 poll → evaluate querySelectorAll("button")
                 expectNoConsoleErrors()
            └─ test("Component test A/B/C")
                 open({ test: "A" }) → newTab("...?test=A")
                 poll → find + click button matching "A"
                 poll → URL ?component param includes "a.test.svelte"
                 poll → <span> contains "A"
                 expectNoConsoleErrors()
            └─ afterAll
                 playwright.close, container.tryRemove ×2, docker.tryRemoveNetwork
```

---

## 10. Known Gotchas & Design Decisions

**`evaluate` must be a zero-argument closure-free function.** `evaluateOnTab` serializes the function to a string and injects it into the page via `playwright-cli`. Any references to outer scope variables will fail at runtime in the page context.

**`import.meta.glob` requires a leading `/`.** In Vite, glob patterns without a leading `/` are relative to the file, not the project root. The closet harness `main.ts` must use `/src/**/*.test.svelte` (absolute from root).

**BuildKit is required for the Vite harness Dockerfile.** Pass `version: "2"` to `image.build` to enable it. The npm cache mount (`--mount=type=cache,target=/root/.npm`) and `COPY --exclude` directives only work with BuildKit. Do **not** add a `# syntax=docker/dockerfile:1.7` frontend directive — it causes Dockerode's session to fail.

**Context restriction in `image.build`.** The `include: ["docker/vite", "release"]` option prevents dockerode from tarring the entire repo. Without it, the build context transfer alone can take several seconds.

**`PromiseQueue` vs `userFocusQueue`.** There are two queues. The main `queue` (per-group, reset on live-reload) schedules test bodies. The `userFocusQueue` (global, always open) serializes `userEvent` calls across all tests to prevent synthetic event races in the browser.

**`ContainerMap` is a Proxy over a `Map`.** Numeric index access (`containers[i]`) is intercepted and routed to `Map.get(i)`. The `context` getter reads the nearest `Container` from Svelte context (used for the nested-config mechanism). `containers.current = x` calls `setContext` and records `x` in the local `contexts` array. `containers.total`, `containers.find()`, `containers.reset()`, and `containers.each()` are additional helpers used by `Sweater.svelte`.

**Test abort flow.** When a container is about to add a new panel (which happens on live-reload), it first awaits `pending.abort`. Abort propagates via `AbortController.abort("Test has been aborted")`, which the `Runner`'s abort proxy converts to a `TestAborted` error on the next property access. `Container` catches and discards `TestAborted` in the `error` callback of each runner.

**Report server uses devcontainer IP, not `localhost`.** The HTTP listener binds to `0.0.0.0` and reports its URL using the devcontainer's non-loopback IP (from `devcontainer.ip()`). This is necessary because browser containers on the same Docker network can't reach `localhost` on the host.

**`skipIfRunning` in `generateReport`.** When generating reports, `buildAndRun` is called with `skipIfRunning: true` so that a browser container already running for this devcontainer is reused across multiple report invocations, avoiding redundant image builds.

**`harness.note()` is a no-op outside report mode.** When no `?reportServer=` param is in the URL, `reportables()` returns stub functions and `note()` does nothing. This means test bodies that call `note()` are safe to run in normal dev mode without errors.

**The `capture()` return type depends on the capture format.** For `"png"`, `"jpeg"`, and `"svg"` the return is `{ uri: Promise<string>, download(filename) }`. For `"blob"`, `"canvas"`, and `"pixelData"` it is the raw html-to-image Promise. Only the string-returning types are collected as report artifacts by `reportables().createCapturer`.
