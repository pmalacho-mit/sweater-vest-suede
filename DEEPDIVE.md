# Sweater Vest — Deep Dive for Maintainers

This document is a technical reference for developers who need to understand, extend, or debug the sweater-vest-suede project. It covers the public library surface (the `release/` folder), the suede dependencies bundled with it, and the test infrastructure built in `docker/` and `src/`.

---

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [What Gets Published](#2-what-gets-published)
3. [Public API — `<Sweater>`](#3-public-api--sweater)
4. [Internal Architecture](#4-internal-architecture)
   - [Sweater.svelte](#sweatersvelte)
   - [Container.svelte](#containersvelte)
   - [Runner.svelte](#runnersvelte)
5. [Utility Modules](#5-utility-modules)
6. [Suede Dependencies](#6-suede-dependencies)
   - [programmatic-docker-suede](#programmatic-docker-suede)
   - [browser-control-container-suede](#browser-control-container-suede)
   - [dockview-svelte-suede](#dockview-svelte-suede)
7. [Test Infrastructure](#7-test-infrastructure)
   - [Vitest configuration](#vitest-configuration)
   - [Vite harness Docker image](#vite-harness-docker-image)
   - [Test harness API (`docker/vite/.harness/index.ts`)](#test-harness-api)
   - [Single-component tests](#single-component-tests)
   - [Gallery tests](#gallery-tests)
8. [End-to-End Test Lifecycle](#8-end-to-end-test-lifecycle)
9. [Known Gotchas & Design Decisions](#9-known-gotchas--design-decisions)

---

## 1. Repository Layout

```
release/          ← Published package source (what consumers install)
  index.ts        ← Public entrypoint: exports Sweater component + types
  Sweater.svelte  ← Top-level component; routing logic for config vs test
  Container.svelte← Manages the dockview grid for a group of tests
  Runner.svelte   ← Executes a single test body; mounts the vest snippet
  globals.d.ts    ← Window.__SWEATER_VEST__ type declaration
  utils/          ← Shared utilities (defer, abort, capture, etc.)
  suede/          ← Suede subdependencies (see §6)

src/              ← SvelteKit app used to develop/browse tests locally
  routes/         ← Pages including /tests/[...path] which hosts test files
  lib/            ← Example component + its test

docker/           ← Docker-based integration test harness
  vite/
    .harness/     ← Shared harness: Dockerfile, Vitest helpers, gallery/single runners
    gallery/      ← Gallery test suite + A/B/C fixture components
    live-reload/  ← Live-reload smoke test (the default TEST_CASE)
    report/       ← (other) test cases

tsconfig.json, svelte.config.js, vite.config.ts  ← Build/test configuration
```

---

## 2. What Gets Published

The `release/` folder is the installable package. Consumers import from it as follows:

```ts
import { Sweater } from "<path>/sweater-vest-suede";
import type { TestHarness, PocketElements } from "<path>/sweater-vest-suede";
```

The package has **no build step** — it is consumed directly from source by the host project's bundler (Vite). The `release/suede/` subdirectories are co-published suede dependencies (see §6).

### Runtime dependencies consumers must have

| Package                      | Use                                      |
| ---------------------------- | ---------------------------------------- |
| `svelte` ≥ 5                 | Framework                                |
| `@storybook/test`            | `expect`, `userEvent` inside test bodies |
| `dockview` + `dockview-core` | Grid layout used by `Container.svelte`   |
| `html-to-image`              | `harness.capture()`                      |

---

## 3. Public API — `<Sweater>`

`<Sweater>` is the only exported component. It is overloaded: it acts either as a **test** node or as a **config** (group) node depending on which props are passed.

### Test usage

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
| `capture(type, options?)`     | Screenshot/serialize the container (`png`, `jpeg`, `svg`, `blob`, `canvas`, `pixelData`). |
| `delay(amount)`               | Sleep for `{ seconds }`, `{ milliseconds }`, `{ minutes }`, or `{ frames }`.              |
| `withUserFocus(fn)`           | Serialize user interaction (click, type, etc.) through a shared queue.                    |
| `onAbort(fn)`                 | Register a teardown callback for when the test is aborted.                                |
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

Config nodes accept `orientation`, `mode`, `class`, and `style` forwarded to `Container.svelte`.

---

## 4. Internal Architecture

### Sweater.svelte

The single-component facade. On `onMount` it:

1. Determines whether it is a **test** or **config** node.
2. Pushes itself into the appropriate `Container` via the `containers` map (a `ContainerMap` Proxy over a `Map<number, Container>`).
3. After all `<Sweater>` instances have mounted (tracked via `counts`), calls `setTotal` and `next()` to release the `Container`'s deferred grid API.

A `window.__SWEATER_VEST__` global is set so browser automation can inspect test state.

Live-reload is also handled here: if Vite HMR causes a test to re-mount with a negative index, the page is reloaded (with a guard param to avoid infinite loops).

### Container.svelte

Each config group gets a `Container`. It:

- Wraps a `GridView` (from `dockview-svelte-suede`) inside a `<div>` whose height is split equally among all containers on the page.
- Exposes a `push(props)` method called by `Sweater` after mount.
- Before adding a panel it calls `abort()` to cancel any currently running tests (supports live-reload). The abort waits up to `AbortTimeoutMs` (1000 ms) for all running tests to stop.
- Each panel renders a `Runner` inside a dockview snippet panel.

Layout options (`position`, `orientation`) are passed through to dockview's `addSnippetPanel`.

### Runner.svelte

Runs **one** test. On `onMount`:

1. Enqueues the test body into the module-level `PromiseQueue` (`queue`).
2. Calls `queue.open()` to allow the queue to start draining.
3. Renders the `vest` snippet inside a `<div>` once the queue reaches this test's turn (guarded by the `gate` promise).

The `harness` object passed to `body` proxies all members through an `AbortController` so that any access after the test has been aborted throws a `TestAborted` error (which is caught and silently swallowed by `Container`).

`set()` wraps the pocket assignment and — when `lazy` is set — calls `flushSync()` to force an immediate DOM update before the body continues.

`definition()` uses `$effect.root` to subscribe to reactive pocket fields. It races the resolution of all requested keys against the abort signal.

---

## 5. Utility Modules

| File                     | Purpose                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/index.ts`         | `defer<T>()` (a `Promise.withResolvers` polyfill), `accumulate()`                                                                     |
| `utils/abort.ts`         | `createTestAbortMechanism()` — abort controller, `wrap`, `proxy`, `until`, `tryError`                                                 |
| `utils/capture.ts`       | `createCapturer(root)` — thin wrapper around `html-to-image`                                                                          |
| `utils/promise-queue.ts` | `PromiseQueue` — serial/parallel task scheduling with deferred start                                                                  |
| `utils/until.ts`         | `nextFrame()`, `milliseconds(ms)` — simple timing primitives                                                                          |
| `utils/container-map.ts` | `createContainerMap()` — Proxy that maps numeric indices to `Container` instances while also tracking Svelte context-based containers |
| `utils/types.ts`         | `Fn`, `ExcludeOptional<T>`                                                                                                            |

### PromiseQueue

Tests within a group are added to a single `PromiseQueue`. The `mode` of each task determines ordering:

- `"parallel"` tasks added consecutively share a common `start` and race to complete together.
- A `"serial"` task always waits for the previous task's `complete` promise before starting.

The queue does not start until `queue.open()` is called (done in `Runner.onMount`).

---

## 6. Suede Dependencies

These are git-suede subdependencies living in `release/suede/`. They are separate repos pulled in via [suede](https://github.com/pmalacho-mit/suede). Each has a `.gitrepo` file pointing at its upstream.

### programmatic-docker-suede

`release/suede/programmatic-docker-suede/`

A thin, typed Node.js API over Dockerode.

**Key exports:**

```ts
import { image, container, dockerode } from "...";
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

#### `CommandStream`

A lazy, single-use wrapper around a docker exec/build stream. Supports:

- `.complete(encoding?)` — resolves to `{ out, err, exit }` once the command finishes.
- `.chunks(encoding?)` — async iterator that yields `{ kind: "out" | "err", data }` as the stream produces output.

#### `devcontainer.ts`

Helpers to detect the running devcontainer and obtain its network string:

```ts
import { devcontainerNetwork, getDevcontainerIp } from "...";
const network = await devcontainerNetwork(); // "container:<id>"
```

---

### browser-control-container-suede

`release/suede/browser-control-container-suede/`

Builds and runs a containerized Playwright CLI (`@playwright/cli`) and exposes a session-based tab API to drive it from Node tests.

**Key exports:**

```ts
import { buildAndRun, playwright, sessionWithTabs, browsers } from "...";
```

#### `buildAndRun(browser, options?)`

Builds the browser container image from `docker/` (inside this suede) and starts it. Options:

| Option      | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| `container` | Override container name (default: `browser-control-<browser>`). |
| `image`     | Override image tag.                                             |
| `network`   | Docker network to join.                                         |
| `log`       | Stream build output to stdout/stderr.                           |
| `onBuild`   | Custom callback receiving the build `CommandStream`.            |

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

`release/suede/dockview-svelte-suede/`

Svelte 5 wrappers around the [dockview](https://dockview.dev/) panel layout library.

**Key exports:**

```ts
import { GridView, DockView, PaneView, SplitView, reactive, themes } from "...";
import type { ViewAPI, PanelProps, ViewProps } from "...";
```

`Container.svelte` uses only `GridView` with an `onReady` callback to obtain the view API. It then calls `api.addSnippetPanel("child", props, options)` to insert `Runner` panels.

The generic type parameters (`ViewKey`, `Renderables`, etc.) provide strong typing for panel props, ensuring the snippet name passed to `addSnippetPanel` matches a declared `snippets` entry.

---

## 7. Test Infrastructure

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
npm run test docker/vite/gallery/
```

---

### Vite harness Docker image

`docker/vite/.harness/Dockerfile`

A single Dockerfile builds all test cases via two `ARG`s:

- `TEST_CASE` — the name of the subdirectory under `docker/vite/` containing the component-under-test (e.g. `gallery`, `live-reload`).
- `HARNESS` — either `single` or `gallery`, selecting the Vite entry point and config from `.harness/single/` or `.harness/gallery/`.

**Layer structure:**

```
FROM node:22-bookworm-slim
COPY docker/vite/.harness/${HARNESS}/package.json → /app/package.json
RUN npm install (BuildKit npm cache mount at /root/.npm)
COPY docker/vite/.harness/${HARNESS}/ → /app/
COPY docker/vite/${TEST_CASE}/ → /app/src/
COPY release/ → /app/src/release/
CMD npm run dev -- --host 0.0.0.0 --port 5173
```

The image is built using BuildKit (`version: "2"` in `image.build`) with the context restricted to `["docker/vite", "release"]` to minimize tar overhead.

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
2. In parallel: build + start the Vite container; build + start the browser container.
3. Poll `browserCanReachVite` until HTTP connectivity is confirmed.
4. Open a playwright session.
5. On teardown: close the session, remove both containers, remove the network.

The test case name is derived from `basename(import.meta.dirname)`, so the containing folder name becomes the Docker container/image/network name.

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
```

Retries `fn` until it returns `true` or the timeout expires. Throws on timeout. Default: 30 s timeout, 1 s interval.

#### `catcher(fn)`

Wraps a function to return `false` instead of throwing. Useful inside `poll` callbacks where transient errors should be treated as "not yet ready".

#### `configure(test, harness, browser?)`

Returns the configuration object (container names, image tags, network name, URLs) for a given test. Used internally by `sessionSuite`.

---

### Single-component tests

`docker/vite/.harness/single/`

Entry point for testing a single Svelte component in isolation. The harness mounts the test's `.test.svelte` file directly and runs its `<Sweater body={...}>` test(s).

The test file is placed at `/app/src/` by the Dockerfile. The Vite config in `single/` resolves `$release` to `/app/src/release` so the component can import from the published package.

`optimizeDeps.include` is set explicitly in `docker/vite/harness/single/vite.config.ts` to prevent Vite's esbuild dep-scan from failing on Svelte virtual modules (which have no filesystem path, causing esbuild to be unable to locate `node_modules`).

---

### Gallery tests

`docker/vite/.harness/gallery/`

The gallery harness mounts `Gallery.svelte` (from `release/vite/`) which:

1. Uses `import.meta.glob("/src/**/*.test.svelte")` (note the required leading `/`) to discover all test files.
2. Renders a button for each discovered file.
3. On click, navigates to `?component=<path>` and lazy-loads + mounts that component.

`docker/vite/gallery/test.ts` tests this harness end-to-end. It verifies:

- All expected links appear in the gallery UI.
- Clicking a link updates the URL and renders the component's output.

The test fixtures (`A.test.svelte`, `B.test.svelte`, `C.test.svelte`) each render a `<Component text="A/B/C" />` where `Component.svelte` outputs `<span>{text}</span>`.

---

## 8. End-to-End Test Lifecycle

A full test run for e.g. `docker/vite/gallery/` looks like this:

```
Vitest (server project)
  └─ docker/vite/gallery/test.ts
       └─ describe("gallery component")
            └─ beforeAll [sessionSuite]
                 1. docker.tryCreateNetwork("vite-gallery-network")
                 2a. image.build("vite-gallery:latest", ..., { TEST_CASE="gallery", HARNESS="gallery" })
                     → streams Dockerfile build output
                 2b. buildAndRun("chromium", { network, container })
                     → builds browser image, starts container
                 3. playwright.ready(browserContainer)
                     → polls 20× / 250 ms for CLI readiness
                 4. browserCanReachVite(config)
                     → exec node -e "fetch(viteUrl)" in browser container
                 5. sessionWithTabs(...)
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

## 9. Known Gotchas & Design Decisions

**`evaluate` must be a zero-argument closure-free function.** `evaluateOnTab` serializes the function to a string and injects it into the page via `playwright-cli`. Any references to outer scope variables will fail at runtime in the page context.

**`import.meta.glob` requires a leading `/`.** In Vite, glob patterns without a leading `/` are relative to the file, not the project root. Gallery's `main.ts` must use `/src/**/*.test.svelte` (absolute from root).

**BuildKit is required for the Vite harness Dockerfile.** Pass `version: "2"` to `image.build` to enable it. The npm cache mount (`--mount=type=cache,target=/root/.npm`) only works with BuildKit. Do **not** add a `# syntax=docker/dockerfile:1.7` frontend directive — it causes Dockerode's session to fail.

**Context restriction in `image.build`.** The `include: ["docker/vite", "release"]` option prevents dockerode from tarring the entire repo. Without it, the build context transfer alone can take several seconds.

**`optimizeDeps.include` in single harness Vite config.** Vite's esbuild pre-bundling scan fails for Svelte virtual modules (e.g. `Runner.svelte?id=0`) because they have no filesystem path, so esbuild cannot walk up to find `node_modules`. Explicitly listing deps in `optimizeDeps.include` bypasses the scan and eliminates a ~14 s cold-start delay.

**`PromiseQueue` vs `userFocusQueue`.** There are two queues. The main `queue` (per-group, reset on live-reload) schedules test bodies. The `userFocusQueue` (global, always open) serializes `userEvent` calls across all tests to prevent synthetic event races in the browser.

**`ContainerMap` is a Proxy over a `Map`.** Numeric index access (`containers[i]`) is intercepted and routed to `Map.get(i)`. The `context` getter reads the nearest `Container` from Svelte context (used for the nested-config mechanism). `containers.current = x` calls `setContext` and records `x` in the local `contexts` array.

**Test abort flow.** When a container is about to add a new panel (which happens on live-reload), it first aborts all currently running tests. Abort propagates via `AbortController.abort("Test has been aborted")`, which the `Runner`'s abort proxy converts to a `TestAborted` error on the next property access. `Container` catches and discards `TestAborted` in the `error` callback of each runner.
