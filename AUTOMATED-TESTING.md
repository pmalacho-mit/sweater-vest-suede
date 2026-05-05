# Automated Testing with sweater-vest-suede

This document describes how to write tests, set up the gallery entry point, and generate HTML reports of your Svelte component test suites.

---

## How it works

Tests are written as Svelte components (`.test.svelte` files) and rendered inside your running dev server. To generate a report:

1. Start your dev server (`npm run dev`)
2. Run the report script, which starts a containerised browser and drives it through every test file
3. Results are collected and written to a self-contained `report.html` file

The report script requires Docker — it launches a Playwright browser container on the same network as your devcontainer. No browser needs to be installed on your machine.

---

## Vite setup

### 1. Configure `main.ts`

Mount `Gallery.svelte` as the root component, passing an `import.meta.glob` pattern that covers all your test files:

```ts
// src/main.ts
import { mount } from "svelte";
import Gallery from "<path-to-sweater-vest-suede>/vite/Gallery.svelte";

mount(Gallery, {
  target: document.getElementById("app")!,
  props: {
    glob: import.meta.glob("/src/**/*.test.svelte"),
  },
});
```

> **Note:** The glob pattern must be absolute from the project root (starting with `/`). Relative patterns are scoped to the file and will not pick up files in other directories.

The gallery page serves two purposes: it renders a clickable list of test files for interactive browsing, and it tells the report script which files exist.

### 2. Add report script to `package.json`

```jsonc
{
  "scripts": {
    "dev": "vite",
    "report": "node --experimental-strip-types ./node_modules/sweater-vest-suede/release/report.ts"
  }
}
```

---

## SvelteKit setup

> **Note:** Full SvelteKit report support is in progress. The steps below describe interactive browsing of test files; automated report generation for SvelteKit will follow the same workflow as Vite once the gallery integration is complete.

Copy the provided route files into your SvelteKit project:

```
release/sveltekit/+page.svelte          → src/routes/tests/+page.svelte
release/sveltekit/[...path]/+page.svelte → src/routes/tests/[...path]/+page.svelte
release/sveltekit/[...path]/+page.ts    → src/routes/tests/[...path]/+page.ts
```

Tests placed under `src/lib/` are automatically discoverable via the `/tests` route. Visit `/tests` in your dev server to browse them interactively.

---

## Writing tests

Each test is a `.test.svelte` file containing one or more `<Sweater>` components. Place test files alongside the components they test (e.g. `Button.test.svelte` next to `Button.svelte`).

### Basic structure

```svelte
<!-- src/lib/Button.test.svelte -->
<script lang="ts">
  import { Sweater } from "sweater-vest-suede";
  import Button from "./Button.svelte";

  class Pocket {
    button = $state<HTMLButtonElement | undefined>(undefined);
    clicked = $state(false);
  }
</script>

<Sweater
  name="calls onClick when clicked"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { button } = await harness.definition("button");

    await harness.withUserFocus(async (userEvent) => {
      await userEvent.click(button);
    });

    harness.expect(pocket.clicked).toBe(true);
  }}
>
  {#snippet vest(p: Pocket)}
    <Button
      bind:el={p.button}
      onclick={() => (p.clicked = true)}
    />
  {/snippet}
</Sweater>
```

### `<Sweater>` props

| Prop | Type | Description |
|---|---|---|
| `body` | `(harness) => Promise<void>` | The test logic. Required. |
| `vest` | `Snippet<[pocket]>` | The rendered component under test. Required. |
| `name` | `string` | Display name shown in the report and stdout summary. Strongly recommended. |
| `id` | `string` | Stable identifier for cross-run result correlation. |
| `mode` | `"parallel" \| "serial"` | Scheduling relative to siblings. Default: `"parallel"`. |
| `lazy` | `boolean` | Defer rendering until `harness.set()` is called. |

### `TestHarness` API

| Member | Description |
|---|---|
| `set(pocket)` | Initialise or replace the pocket; triggers render if `lazy`. |
| `definition(...keys)` | Wait for named pocket fields to become non-null. |
| `expect` | All `@storybook/test` matchers (`expect(x).toBe(...)`, etc.). |
| `withUserFocus(fn)` | Serialise user interactions (click, type, etc.) through a shared queue. |
| `capture(type, options?)` | Screenshot the vest container. See [Captures](#captures) below. |
| `note(text)` | Add a text annotation to the report card. See [Notes](#notes) below. |
| `delay(amount)` | Sleep for `{ seconds }`, `{ milliseconds }`, `{ minutes }`, or `{ frames }`. |
| `container` | The raw `HTMLElement` wrapping the vest snippet. |
| `preventRender()` | Block render until the returned function is called. |
| `onAbort(fn)` | Register a teardown callback for when the test is aborted. |

---

## Running the report

### Full run

```sh
# Terminal 1 — keep this running
npm run dev

# Terminal 2
npm run report
# → prints a summary to stdout
# → writes sweater-vest-report.html
```

Open `sweater-vest-report.html` in any browser to view the full report with error diffs and screenshots.

### Filtering

Run only a subset of tests without changing any code:

```sh
# Only components whose file path matches /Button/i
npm run report Button

# Only tests whose name matches /hover/i, across all components
npm run report -- -t hover

# Both: only the Button component, only tests named hover
npm run report Button -t hover
```

Patterns are case-insensitive regular expressions. Tests that do not match the name filter are recorded as `skipped` in the report rather than omitted entirely, so you can see what was excluded.

### Multi-browser

Use the programmatic API to run across multiple browsers:

```ts
// scripts/report.ts
import { generateReport } from "sweater-vest-suede/release/report";

await generateReport({
  browsers: ["chromium", "firefox", "webkit"],
  outputPath: "./reports/latest.html",
});
```

Each browser's results appear in a separate section of the report. Tests that fail in one browser but pass in others are immediately visible.

---

## Making reports informative

### Captures

Call `harness.capture("png")` at any point in the test body to take a screenshot of the vest container at that moment. Call it multiple times to capture a sequence of states.

```ts
body={async (harness) => {
  const pocket = harness.set(new Pocket());
  await harness.definition("el");

  const before = harness.capture("png");          // state before interaction

  await harness.withUserFocus(async (userEvent) => {
    await userEvent.click(pocket.button);
  });

  harness.capture("png");                         // state after interaction
  harness.expect(pocket.result).toBe("clicked");
}}
```

Captures appear in the report in call order, embedded directly in the HTML as inline images — no separate image files. Supported types: `"png"`, `"jpeg"`, `"svg"`.

You do not need to `await` the capture for it to appear in the report. The report script waits for all pending images to resolve before recording the test result.

### Notes

Call `harness.note(text)` to add a free-form text annotation that appears in the report card alongside captures:

```ts
body={async (harness) => {
  harness.note("Initial render — no value set yet");

  const pocket = harness.set(new Pocket({ value: "hello" }));
  await harness.delay({ milliseconds: 50 });

  harness.note(`After 50ms — value is "${pocket.value}"`);
  harness.capture("png");

  harness.expect(pocket.value).toBe("hello");
}}
```

Notes are a no-op when the dev server is running without a report server attached, so they never affect interactive development.

### Named tests

Always give tests a `name`. Without one, test cards in the report are labelled `(unnamed)` and the stdout summary cannot identify which tests failed.

```svelte
<Sweater name="renders placeholder when value is empty" body={…}>
```

---

## CI / automation

The report script needs:

1. **A running dev server** — start it before invoking the script, and ensure it is reachable at the expected URL.
2. **Docker** — the script starts a browser container. In a CI environment, ensure Docker is available and the runner is configured as a devcontainer (or pass `galleryUrl` explicitly if running outside one).

```ts
// Explicit URL — useful when the dev server is on a known host/port
await generateReport({
  galleryUrl: "http://localhost:5173",
  outputPath: "./ci-report.html",
});
```

The report script exits with a non-zero code if generation fails. It does **not** currently exit non-zero on test failures — the HTML report is the source of truth for pass/fail. If you need CI to fail on test failures, inspect `reportInput.browsers` programmatically using `generateReport`'s return value (this is a planned future addition).
