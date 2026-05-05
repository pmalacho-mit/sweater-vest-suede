import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  getDevcontainerIp,
  devcontainerNetwork,
} from "../suede/programmatic-docker-suede/devcontainer.js";
import { container } from "../suede/programmatic-docker-suede/index.js";
import {
  buildAndRun,
  playwright,
  sessionWithTabs,
  type Browser,
} from "../suede/browser-control-container-suede/index.js";
import { startReportServer } from "./events.ts";
import { renderReport, type ReportInput } from "./html.ts";
import { printReport } from "./print.ts";

export type { TestResult } from "./events.ts";
export type { ReportInput } from "./html.ts";

export type ReportOptions = {
  /** URL where Closet.svelte is rendered. Defaults to http://<devcontainerIp>:5173 */
  galleryUrl?: string;
  /** Browsers to run. Defaults to ["chromium"]. */
  browsers?: Browser[];
  /** Output path for the HTML report. Defaults to ./sweater-vest-report.html */
  outputPath?: string;
  /** Only open components whose path matches this pattern. */
  componentPattern?: RegExp;
  /** Only run tests whose name or id matches this pattern. */
  testPattern?: RegExp;
};

export type ReportSummary = {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  browsers: ReportInput["browsers"];
};

const containerName = (browser: Browser) => `sweater-vest-report-${browser}`;

export const generateReport = async (
  options: ReportOptions = {},
): Promise<ReportSummary> => {
  const galleryUrl = options.galleryUrl ?? `http://${getDevcontainerIp()}:5173`;
  const browsers: Browser[] = options.browsers ?? ["chromium"];
  const outputPath = options.outputPath ?? "./sweater-vest-report.html";
  const { componentPattern, testPattern } = options;

  const startedBrowsers = new Set<Browser>();
  const sessions = new Map<
    Browser,
    Awaited<ReturnType<typeof sessionWithTabs>>
  >();
  let server: Awaited<ReturnType<typeof startReportServer>> | undefined;

  try {
    // Start all browser containers in parallel.
    const network = await devcontainerNetwork();
    await Promise.all(
      browsers.map(async (browser) => {
        await buildAndRun(browser, {
          container: () => containerName(browser),
          network,
          log: true,
        });
        startedBrowsers.add(browser);
        await playwright.ready(containerName(browser));
      }),
    );

    // Open playwright sessions for all browsers in parallel.
    const entries = await Promise.all(
      browsers.map(
        async (browser) =>
          [
            browser,
            await sessionWithTabs(
              containerName(browser),
              `report-${browser}`,
              browser,
            ),
          ] as const,
      ),
    );
    for (const [browser, session] of entries) sessions.set(browser, session);

    // Start the single shared report server.
    server = await startReportServer();

    // Phase 1: open all gallery tabs simultaneously to discover component paths.
    // Closet.svelte fires gallery-ready on the /discover route; all browsers see the
    // same glob so paths.resolve() fires on the first arrival and ignores the rest.
    await Promise.all(
      browsers.map((browser) => {
        const url = new URL(galleryUrl);
        url.searchParams.set("reportServer", `${server!.url}/discover`);
        return sessions.get(browser)!.newTab(url.toString());
      }),
    );

    const allPaths = await server.paths;
    const paths = componentPattern
      ? allPaths.filter((p) => componentPattern.test(p))
      : allPaths;

    // Phase 2: open every (browser × component) tab simultaneously.
    // Each tab uses a browser-specific route so the server can key results correctly.
    const componentResults = await Promise.all(
      paths.flatMap((componentPath) =>
        browsers.map(async (browser) => {
          const url = new URL(galleryUrl);
          url.searchParams.set("component", componentPath);
          url.searchParams.set("reportServer", `${server!.url}/${browser}`);
          if (testPattern)
            url.searchParams.set("testFilter", testPattern.source);
          await sessions.get(browser)!.newTab(url.toString());
          const results = await server!.waitForComponent(
            browser,
            componentPath,
          );
          return { browser, componentPath, results };
        }),
      ),
    );

    const reportInput: ReportInput = {
      generatedAt: new Date().toISOString(),
      galleryUrl,
      browsers: componentResults.map(({ browser, componentPath, results }) => ({
        kind: browser,
        componentPath,
        results,
      })),
    };

    printReport(reportInput, { outputPath });
    await writeFile(outputPath, renderReport(reportInput), "utf-8");
    console.log(`Report written to ${outputPath}`);

    const allResults = reportInput.browsers.flatMap((b) => b.results);
    return {
      totalTests: allResults.length,
      passed: allResults.filter((r) => r.status === "passed").length,
      failed: allResults.filter((r) => r.status === "failed").length,
      skipped: allResults.filter((r) => r.status === "skipped").length,
      browsers: reportInput.browsers,
    };
  } finally {
    server?.close();
    await Promise.allSettled(
      browsers.map((browser) =>
        playwright
          .close(containerName(browser), `report-${browser}`)
          .catch(() => {}),
      ),
    );
    await Promise.allSettled(
      [...startedBrowsers].map((browser) =>
        container.tryRemove(containerName(browser)),
      ),
    );
  }
};

// CLI entry point — only runs when this file is executed directly.
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const args = process.argv.slice(2);
  const tIdx = args.indexOf("-t");
  const testPatternStr = tIdx !== -1 ? args[tIdx + 1] : undefined;
  const componentPatternStr = args.find((a) => !a.startsWith("-"));

  generateReport({
    componentPattern: componentPatternStr
      ? new RegExp(componentPatternStr, "i")
      : undefined,
    testPattern: testPatternStr ? new RegExp(testPatternStr, "i") : undefined,
  })
    .then((summary) => {
      if (summary.failed > 0) process.exit(1);
    })
    .catch((e) => {
      console.error("Report generation failed:", e);
      process.exit(1);
    });
}
