import { describe, test, expect } from "vitest";
import { sessionSuite } from "../.harness/index.ts";
import {
  startEventServer,
  type TestResult,
} from "../../../release/utils/report-events.ts";
import { renderReport } from "../../../release/utils/report-html.ts";
import { printReport } from "../../../release/utils/report-print.ts";

describe("report", { concurrent: true }, () => {
  const { open } = sessionSuite(import.meta.dirname, "single");

  // Opens the fixture page with a fresh event server, awaits all 3 results.
  const run = async () => {
    const server = await startEventServer();
    await open({ reportServer: server.url });
    return { results: await server.done };
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
    expect(failing!.error!.matcherResult).toBeDefined();
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

  test("no console errors despite intentional test failure", async () => {
    const server = await startEventServer();
    const tab = await open({ reportServer: server.url });
    await server.done;
    await tab.expectNoConsoleErrors();
  }, 90_000);

  // --- Node.js-only unit tests (no browser needed) ---

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
        stack: 'Error: Expected "actual" to be "expected"\n    at Object.<anonymous> (test.ts:5:1)',
        matcherResult: { pass: false, actual: "actual", expected: "expected" },
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

  test("renderReport produces valid self-contained HTML", () => {
    const html = renderReport({
      generatedAt: new Date().toISOString(),
      galleryUrl: "http://localhost:5173",
      browsers: [{ kind: "chromium", results: syntheticResults }],
    });

    // Well-formed document
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");

    // Summary counts
    expect(html).toContain("2 passed");
    expect(html).toContain("1 failed");

    // Test names
    expect(html).toContain("passes");
    expect(html).toContain("fails");
    expect(html).toContain("captures");

    // Error detail
    expect(html).toContain('Expected "actual" to be "expected"');

    // Inline capture image
    expect(html).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(html).toContain("<img");

    // Note annotation
    expect(html).toContain("before screenshot");

    // Self-contained — no external resource loading
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:/);
  });

  test("printReport writes expected summary lines", () => {
    const lines: string[] = [];
    const write = (s: string) => {
      lines.push(s);
      return true;
    };

    printReport(
      {
        generatedAt: new Date().toISOString(),
        galleryUrl: "http://localhost:5173",
        browsers: [{ kind: "chromium", results: syntheticResults }],
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
});
