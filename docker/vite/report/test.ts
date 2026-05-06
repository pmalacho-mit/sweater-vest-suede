import { describe, test, expect } from "vitest";
import { sessionSuite, poll, catcher } from "../.harness/index.ts";
import {
  createEventListener,
  type TestResult,
} from "../../../release/report/events.ts";
import { renderReport } from "../../../release/report/html.ts";
import { printReport } from "../../../release/report/print.ts";
import { defer } from "../../../release/utils/index.ts";

/**
 * Starts a short-lived server that waits for a single `gallery-ready` event
 * from Closet.svelte, then closes itself.
 */
const startDiscoveryServer = async (timeout = 30_000) => {
  let resolved = false;
  const { promise: paths, resolve, reject } = defer<string[]>();
  const { url, close } = await createEventListener({
    timeout,
    onEvent: (_, event, close) => {
      if (event.type !== "closet-ready" || resolved) return;
      resolved = true;
      close();
      resolve(event.paths);
    },
    onTimeout: () =>
      reject(
        new Error("Discovery server timed out waiting for gallery-ready event"),
      ),
  });
  return { url, paths, close };
};


describe("report", { concurrent: true }, () => {
  const { open } = sessionSuite(import.meta.dirname, "single");

  // Opens the fixture page and waits for all tests to complete.
  //
  // The browser container sits on an isolated Docker network that cannot reach the
  // devcontainer's IP, so HTTP events never arrive at a devcontainer-hosted server.
  // reporting.ts populates window.__SWEATER_VEST__.report as a parallel accumulator
  // alongside the HTTP posts, so we read results from there via evaluateOnTab instead.
  const run = async (queryParams?: Record<string, string>) => {
    const tab = await open({ reportServer: "http://localhost:19999", ...queryParams });
    await poll(
      catcher(() =>
        tab.evaluate(() => window.__SWEATER_VEST__?.report?.done === true),
      ),
      { timeout: 30_000, interval: 500 },
    );
    const results = await tab.evaluate(
      () => window.__SWEATER_VEST__.report?.results ?? [],
    );
    return { results };
  };

  // --- browser integration tests ---

  test("receives one result per test", async () => {
    const { results } = await run();
    expect(results).toHaveLength(3);
  }, 90_000);

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

  test("failing test has error message, stack, and matcherResult", async () => {
    const { results } = await run();
    const failing = results.find((r) => r.name === "fails");

    expect(failing).toBeDefined();
    expect(failing!.status).toBe("failed");
    expect(failing!.error).toBeDefined();
    expect(failing!.error!.message).toContain("expected");
    expect(typeof failing!.error!.stack).toBe("string");
    expect(failing!.error!.stack!.length).toBeGreaterThan(0);
    // matcherResult is verified in the Node.js unit test using synthetic data;
    // @storybook/test's matcherResult may not survive evaluateOnTab's JSON serialization.
  }, 90_000);

  test("capture is included in test-complete event as a data URI", async () => {
    const { results } = await run();
    const capturing = results.find((r) => r.name === "captures");

    expect(capturing).toBeDefined();
    expect(capturing!.status).toBe("passed");
    expect(capturing!.captures).toHaveLength(1);
    expect(capturing!.captures[0].type).toBe("png");
    expect(capturing!.captures[0].dataUri).toMatch(/^data:image\/png;base64,/);
  }, 90_000);

  test("notes are recorded in order", async () => {
    const { results } = await run();
    const capturing = results.find((r) => r.name === "captures");

    expect(capturing!.notes).toEqual(["before screenshot", "after screenshot"]);
  }, 90_000);

  test("testFilter skips non-matching tests and records them as skipped", async () => {
    // Only "passes" matches — "fails" and "captures" should be skipped.
    const { results } = await run({ testFilter: "passes" });

    expect(results).toHaveLength(3);

    const passing = results.find((r) => r.name === "passes");
    expect(passing!.status).toBe("passed");

    const skipped = results.filter((r) => r.status === "skipped");
    expect(skipped).toHaveLength(2);
    expect(skipped.every((r) => r.durationMs === 0)).toBe(true);
  }, 90_000);

  test("intentional test failure does not prevent run from completing", async () => {
    // Container.svelte intentionally calls console.error() for test failures, so
    // the error count is never 0 — expectNoConsoleErrors() is not the right check.
    // The real contract: even with a throwing test body, report.done becomes true,
    // meaning the failure was caught and did not hang the run.
    const { results } = await run();
    const failing = results.find((r) => r.name === "fails");
    expect(failing?.status).toBe("failed");
    expect(failing?.error?.message).toContain("expected");
  }, 90_000);

  // --- Node.js-only unit tests (no browser needed) ---

  test("startDiscoveryServer resolves paths from a gallery-ready POST", async () => {
    const discovery = await startDiscoveryServer(5_000);
    const port = new URL(discovery.url).port;

    await fetch(`http://localhost:${port}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "closet-ready",
        paths: ["/src/A.test.svelte", "/src/B.test.svelte"],
      }),
    });

    const paths = await discovery.paths;
    expect(paths).toEqual(["/src/A.test.svelte", "/src/B.test.svelte"]);
  });

  test("startDiscoveryServer ignores unknown event types", async () => {
    const discovery = await startDiscoveryServer(2_000);
    const port = new URL(discovery.url).port;

    // Send an unknown event — should not resolve paths.
    await fetch(`http://localhost:${port}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "suite-ready", totalTests: 1 }),
    });

    // Now send the correct event.
    await fetch(`http://localhost:${port}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "closet-ready",
        paths: ["/src/C.test.svelte"],
      }),
    });

    const paths = await discovery.paths;
    expect(paths).toEqual(["/src/C.test.svelte"]);
  });

  const syntheticResults: TestResult[] = [
    {
      name: "passes",
      status: "passed",
      durationMs: 12,
      captures: [],
      notes: [],
    },
    {
      name: "fails",
      status: "failed",
      durationMs: 8,
      captures: [],
      notes: [],
      error: {
        message: 'Expected "actual" to be "expected"',
        stack:
          'Error: Expected "actual" to be "expected"\n    at Object.<anonymous> (test.ts:5:1)',
        matcherResult: { pass: false, actual: "actual", expected: "expected" },
      },
    },
    {
      name: "captures",
      status: "passed",
      durationMs: 55,
      captures: [
        { type: "png", dataUri: "data:image/png;base64,iVBORw0KGgo=" },
      ],
      notes: ["before screenshot", "after screenshot"],
    },
  ];

  test("renderReport produces valid self-contained HTML", () => {
    const html = renderReport({
      generatedAt: new Date().toISOString(),
      galleryUrl: "http://localhost:5173",
      browsers: [{ kind: "chromium", results: syntheticResults }],
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain("2 passed");
    expect(html).toContain("1 failed");
    expect(html).toContain("passes");
    expect(html).toContain("fails");
    expect(html).toContain("captures");
    // The error message is HTML-escaped inside the <summary> tag
    expect(html).toContain('Expected &quot;actual&quot; to be &quot;expected&quot;');
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(html).toContain("<img");
    expect(html).toContain("before screenshot");
    // Self-contained: no external resource-loading URLs.
    // The footer <a href="..."> is a legitimate navigation link, not a resource.
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/<link[^>]*href="https?:/);
  });

  test("renderReport with empty results shows no-tests message", () => {
    const html = renderReport({
      generatedAt: new Date().toISOString(),
      galleryUrl: "http://localhost:5173",
      browsers: [],
    });

    expect(html).toContain("No tests were run");
    expect(html).not.toContain("all passed");
  });

  test("printReport writes expected summary lines", () => {
    const lines: string[] = [];
    const write = (s: string) => {
      lines.push(s);
      return true;
    };

    // Split into two component entries so both PASS and FAIL lines are generated.
    // A single entry with mixed results produces only a FAIL line.
    printReport(
      {
        generatedAt: new Date().toISOString(),
        galleryUrl: "http://localhost:5173",
        browsers: [
          {
            kind: "chromium",
            componentPath: "/src/passes.test.svelte",
            results: [syntheticResults[0], syntheticResults[2]], // passes + captures
          },
          {
            kind: "chromium",
            componentPath: "/src/fails.test.svelte",
            results: [syntheticResults[1]], // fails
          },
        ],
      },
      { outputPath: "./report.html", write },
    );

    const output = lines.join("");

    expect(output).toContain("PASS");   // first entry: 2 passing, 0 failing
    expect(output).toContain("FAIL");   // second entry: 1 failing
    expect(output).toContain("passes"); // label derived from componentPath
    expect(output).toContain("fails");  // label + failing test name bullet
    expect(output).toContain('Expected "actual"'); // error excerpt (plain text, not HTML)
    expect(output).toMatch(/2 passed/);
    expect(output).toMatch(/1 failed/);
    expect(output).toMatch(/3 total/);
    expect(output).toContain("./report.html");
  });

  test("printReport breakdown includes skipped count when present", () => {
    const withSkipped: TestResult[] = [
      { name: "a", status: "passed", durationMs: 5, captures: [], notes: [] },
      { name: "b", status: "skipped", durationMs: 0, captures: [], notes: [] },
    ];
    const lines: string[] = [];
    const write = (s: string) => {
      lines.push(s);
      return true;
    };

    printReport(
      {
        generatedAt: new Date().toISOString(),
        galleryUrl: "http://localhost:5173",
        browsers: [
          {
            kind: "chromium",
            componentPath: "/src/Foo.test.svelte",
            results: withSkipped,
          },
        ],
      },
      { write },
    );

    const output = lines.join("");
    expect(output).toContain("PASS");
    expect(output).toContain("1 passed");
    expect(output).toContain("1 skipped");
  });
});
