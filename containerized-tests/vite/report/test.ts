import { describe, test, beforeAll, afterAll, expect } from "vitest";
import { sessionSuite } from "../.harness/index.ts";
import { dockerode } from "../../../sweater-vest-suede.programmatic-docker-suede/index.ts";
import devcontainer from "../../../sweater-vest-suede.programmatic-docker-suede/devcontainer.js";
import { startReportServer } from "../../../release/report/events.ts";
import { renderMarkdown } from "../../../release/report/markdown.ts";
import { printReport } from "../../../release/report/print.ts";
import type { Report } from "../../../release/report/index.ts";

describe("report", { concurrent: true }, () => {
  const { open, config } = sessionSuite(import.meta.dirname, "closet");

  const COMPONENT = "/src/Component.test.svelte";

  type Membership = (opts: { Container: string }) => Promise<void>;

  const testNetwork = () => dockerode.getNetwork(config.network);

  /**
   * Under `"peer"` the devcontainer is a sibling container with no address on
   * the test network until it joins one. Under `"host"` it already sits at
   * that network's gateway, so there is nothing to join.
   */
  const devcontainerMustJoinTestNetwork = async () =>
    (await devcontainer.topology()) === "peer";

  const joinTestNetwork = (id: string) =>
    (testNetwork().connect as Membership)({ Container: id }).catch(() => {});

  const leaveTestNetwork = (id: string) =>
    (testNetwork().disconnect as Membership)({ Container: id }).catch(() => {});

  /**
   * The address at which a container on the test network reaches the report
   * server, which runs in this process bound to `0.0.0.0`.
   */
  let reportServerHostIp: string;

  let joinedTestNetwork: string | undefined;

  beforeAll(async () => {
    const id = await devcontainer.id();

    if (await devcontainerMustJoinTestNetwork()) {
      await joinTestNetwork(id);
      joinedTestNetwork = id;
    }

    reportServerHostIp = await devcontainer.ip.inspect({
      id,
      filter: () => config.network,
    });
  }, 30_000);

  afterAll(async () => {
    if (joinedTestNetwork) await leaveTestNetwork(joinedTestNetwork);
  });

  // Opens the fixture page via the closet and collects results via the report server.
  const run = async (extraParams?: Record<string, string>) => {
    const server = await startReportServer(60_000);
    server.paths.catch(() => {}); // suppress unhandled rejection — /discover is never hit here

    const port = new URL(server.url).port;
    const reportUrl = `http://${reportServerHostIp}:${port}/chromium`;

    await open({
      reportServer: reportUrl,
      component: COMPONENT,
      ...extraParams,
    });

    const results = await server.waitForComponent("chromium", COMPONENT);
    server.close();
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
    expect(passing!.artifacts).toHaveLength(0);
  }, 90_000);

  test("failing test has error message and stack", async () => {
    const { results } = await run();
    const failing = results.find((r) => r.name === "fails");

    expect(failing).toBeDefined();
    expect(failing!.status).toBe("failed");
    expect(failing!.error).toBeDefined();
    expect(failing!.error!.message).toContain("expected");
    expect(typeof failing!.error!.stack).toBe("string");
    expect(failing!.error!.stack!.length).toBeGreaterThan(0);
    // matcherResult is verified in Node.js unit tests using synthetic data;
    // @storybook/test's matcherResult may not survive evaluateOnTab JSON serialization.
  }, 90_000);

  test("capture is included in artifacts as a data URI", async () => {
    const { results } = await run();
    const capturing = results.find((r) => r.name === "captures");

    expect(capturing).toBeDefined();
    expect(capturing!.status).toBe("passed");

    const pngArtifact = capturing!.artifacts.find(
      (a): a is { type: string; dataUri: string } =>
        typeof a !== "string" && (a as { type: string }).type === "png",
    );
    expect(pngArtifact).toBeDefined();
    expect(pngArtifact!.dataUri).toMatch(/^data:image\/png;base64,/);
  }, 90_000);

  test("notes appear as string artifacts in order around the capture", async () => {
    const { results } = await run();
    const capturing = results.find((r) => r.name === "captures");

    const stringArtifacts = capturing!.artifacts.filter(
      (a) => typeof a === "string",
    );
    expect(stringArtifacts).toEqual(["before screenshot", "after screenshot"]);
  }, 90_000);

  test("testFilter runs only matching tests, recording the rest as skipped", async () => {
    // testFilter is an inclusion regex: only tests whose name, id or category
    // matches it run. Matching "passes" leaves "fails" and "captures" skipped.
    const { results } = await run({ testFilter: "passes" });

    // Skipped tests are still reported, so the run accounts for all three.
    expect(results).toHaveLength(3);

    const ran = results.filter((r) => r.status !== "skipped");
    expect(ran).toHaveLength(1);
    expect(ran[0].name).toBe("passes");
    expect(ran[0].status).toBe("passed");

    // "fails" throws when its body runs, so recording it as skipped rather
    // than failed is what proves the filter suppressed the body entirely.
    for (const name of ["fails", "captures"]) {
      const skipped = results.find((r) => r.name === name);
      expect(skipped!.status).toBe("skipped");
      expect(skipped!.durationMs).toBe(0);
    }
  }, 90_000);

  test("intentional test failure does not prevent run from completing", async () => {
    // The real contract: even with a throwing test body, waitForComponent resolves,
    // meaning the failure was caught and did not hang the run.
    const { results } = await run();
    const failing = results.find((r) => r.name === "fails");
    expect(failing?.status).toBe("failed");
    expect(failing?.error?.message).toContain("expected");
  }, 90_000);

  // --- Node.js-only unit tests (no browser needed) ---

  test("startReportServer resolves paths from a closet-ready POST on /discover", async () => {
    const server = await startReportServer(5_000);
    const port = new URL(server.url).port;

    await fetch(`http://localhost:${port}/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "closet-ready",
        paths: ["/src/A.test.svelte", "/src/B.test.svelte"],
      }),
    });

    const paths = await server.paths;
    server.close();
    expect(paths).toEqual(["/src/A.test.svelte", "/src/B.test.svelte"]);
  });

  test("startReportServer ignores closet-ready on non-discover routes", async () => {
    const server = await startReportServer(5_000);
    const port = new URL(server.url).port;

    // Correct event type but wrong route — should not resolve paths.
    await fetch(`http://localhost:${port}/chromium`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "closet-ready",
        paths: ["/src/Wrong.test.svelte"],
      }),
    });

    // Now the correct route.
    await fetch(`http://localhost:${port}/discover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "closet-ready",
        paths: ["/src/C.test.svelte"],
      }),
    });

    const paths = await server.paths;
    server.close();
    expect(paths).toEqual(["/src/C.test.svelte"]);
  });

  test("startReportServer waitForComponent resolves when all results arrive", async () => {
    const server = await startReportServer(5_000);
    server.paths.catch(() => {});
    const port = new URL(server.url).port;
    const component = "/src/Test.test.svelte";

    const resultPromise = server.waitForComponent("chromium", component);

    const post = (body: object) =>
      fetch(`http://localhost:${port}/chromium`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    await post({ type: "suite-ready", totalTests: 2, component });
    await post({
      type: "test-complete",
      name: "a",
      index: 0,
      container: { index: 0 },
      component,
      status: "passed",
      durationMs: 10,
      artifacts: [],
    });
    await post({
      type: "test-skipped",
      name: "b",
      index: 1,
      container: { index: 0 },
      component,
    });

    const results = await resultPromise;
    server.close();

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.name === "a")?.status).toBe("passed");
    expect(results.find((r) => r.name === "b")?.status).toBe("skipped");
  });

  // Synthetic render input shared by the renderMarkdown and printReport tests.
  const syntheticInput: Report.RenderInput = {
    generatedAt: new Date().toISOString(),
    closet: "http://localhost:5173",
    results: [
      {
        component: "/src/passes.test.svelte",
        containers: [
          {
            index: 0,
            tests: [
              {
                index: 0,
                name: "passes",
                runs: [
                  {
                    browser: "chromium",
                    status: "passed",
                    durationMs: 12,
                    artifacts: [],
                  },
                ],
              },
              {
                index: 2,
                name: "captures",
                runs: [
                  {
                    browser: "chromium",
                    status: "passed",
                    durationMs: 55,
                    artifacts: [
                      "before screenshot",
                      {
                        type: "png",
                        dataUri: "data:image/png;base64,iVBORw0KGgo=",
                      },
                      "after screenshot",
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        component: "/src/fails.test.svelte",
        containers: [
          {
            index: 0,
            tests: [
              {
                index: 1,
                name: "fails",
                runs: [
                  {
                    browser: "chromium",
                    status: "failed",
                    durationMs: 8,
                    artifacts: [],
                    error: {
                      message: 'Expected "actual" to be "expected"',
                      stack:
                        'Error: Expected "actual" to be "expected"\n    at Object.<anonymous> (test.ts:5:1)',
                      matcherResult: {
                        pass: false,
                        actual: "actual",
                        expected: "expected",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  test("renderMarkdown produces a valid markdown report", () => {
    const md = renderMarkdown(syntheticInput);

    expect(md).toContain("# Sweater Vest Report");
    expect(md).toContain("2 passed");
    expect(md).toContain("1 failed");
    // Component labels derived from paths by stripping prefix and extension
    expect(md).toContain("passes");
    expect(md).toContain("fails");
    expect(md).toContain("captures");
    // Error message in the failures section
    expect(md).toContain('Expected "actual"');
    // Capture artifact rendered as markdown image
    expect(md).toContain("data:image/png;base64,iVBORw0KGgo=");
    // Note artifact rendered as bullet
    expect(md).toContain("before screenshot");
  });

  test("renderMarkdown with empty results shows no-tests message", () => {
    const md = renderMarkdown({
      generatedAt: new Date().toISOString(),
      closet: "http://localhost:5173",
      results: [],
    });

    expect(md).toContain("No tests were run");
    expect(md).not.toContain("all passed");
  });

  test("printReport writes expected summary lines", () => {
    const lines: string[] = [];
    const write = (s: string) => {
      lines.push(s);
      return true;
    };

    // Two separate component entries so both PASS and FAIL lines are generated.
    printReport(syntheticInput, { output: "./report.md", write });

    const output = lines.join("");

    expect(output).toContain("PASS"); // passes component: 2 passing, 0 failing
    expect(output).toContain("FAIL"); // fails component: 1 failing
    expect(output).toContain("passes"); // label derived from /src/passes.test.svelte
    expect(output).toContain("fails"); // label + failing test name bullet
    expect(output).toContain('Expected "actual"'); // error excerpt
    expect(output).toMatch(/2 passed/);
    expect(output).toMatch(/1 failed/);
    expect(output).toMatch(/3 total/);
    expect(output).toContain("./report.md");
  });

  test("printReport breakdown includes skipped count when present", () => {
    const withSkipped: Report.RenderInput = {
      generatedAt: new Date().toISOString(),
      closet: "http://localhost:5173",
      results: [
        {
          component: "/src/Foo.test.svelte",
          containers: [
            {
              index: 0,
              tests: [
                {
                  index: 0,
                  name: "a",
                  runs: [
                    {
                      browser: "chromium",
                      status: "passed",
                      durationMs: 5,
                      artifacts: [],
                    },
                  ],
                },
                {
                  index: 1,
                  name: "b",
                  runs: [
                    {
                      browser: "chromium",
                      status: "skipped",
                      durationMs: 0,
                      artifacts: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const lines: string[] = [];
    const write = (s: string) => {
      lines.push(s);
      return true;
    };

    printReport(withSkipped, { write });

    const output = lines.join("");
    expect(output).toContain("PASS");
    expect(output).toContain("1 passed");
    expect(output).toContain("1 skipped");
  });
});
