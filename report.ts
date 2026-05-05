import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  getDevcontainerIp,
  devcontainerNetwork,
} from "./suede/programmatic-docker-suede/devcontainer.js";
import { container } from "./suede/programmatic-docker-suede/index.js";
import {
  buildAndRun,
  playwright,
  sessionWithTabs,
  type Browser,
} from "./suede/browser-control-container-suede/index.js";
import {
  startDiscoveryServer,
  startEventServer,
} from "./utils/report-events.ts";
import { renderReport, type ReportInput } from "./utils/report-html.ts";
import { printReport } from "./utils/report-print.ts";

export type ReportOptions = {
  /** URL where Gallery.svelte is rendered. Defaults to http://<devcontainerIp>:5173 */
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

const containerName = (browser: Browser) => `sweater-vest-report-${browser}`;

export const generateReport = async (options: ReportOptions = {}): Promise<void> => {
  const galleryUrl = options.galleryUrl ?? `http://${getDevcontainerIp()}:5173`;
  const browsers: Browser[] = options.browsers ?? ["chromium"];
  const outputPath = options.outputPath ?? "./sweater-vest-report.html";
  const { componentPattern, testPattern } = options;

  // Start all browser containers in parallel before opening any tabs.
  const network = await devcontainerNetwork();
  await Promise.all(
    browsers.map(async (browser) => {
      await buildAndRun(browser, {
        container: () => containerName(browser),
        network,
        log: true,
      });
      await playwright.ready(containerName(browser));
    }),
  );

  const reportInput: ReportInput = {
    generatedAt: new Date().toISOString(),
    galleryUrl,
    browsers: [],
  };

  try {
    for (const browser of browsers) {
      const session = await sessionWithTabs(
        containerName(browser),
        `report-${browser}`,
        browser,
      );

      // Phase 1: discover component paths via Gallery.svelte.
      const discovery = await startDiscoveryServer();
      const discoveryTabUrl = new URL(galleryUrl);
      discoveryTabUrl.searchParams.set("reportServer", discovery.url);
      await session.newTab(discoveryTabUrl.toString());
      const allPaths = await discovery.paths;

      const paths = componentPattern
        ? allPaths.filter((p) => componentPattern.test(p))
        : allPaths;

      // Phase 2: open all component tabs in parallel, one event server each.
      const componentResults = await Promise.all(
        paths.map(async (componentPath) => {
          const server = await startEventServer();
          const url = new URL(galleryUrl);
          url.searchParams.set("component", componentPath);
          url.searchParams.set("reportServer", server.url);
          if (testPattern) url.searchParams.set("testFilter", testPattern.source);
          await session.newTab(url.toString());
          const results = await server.done;
          return { componentPath, results };
        }),
      );

      for (const { componentPath, results } of componentResults)
        reportInput.browsers.push({ kind: browser, componentPath, results });

      await playwright.close(containerName(browser), `report-${browser}`).catch(() => {});
    }
  } finally {
    await Promise.allSettled(browsers.map((b) => container.tryRemove(containerName(b))));
  }

  printReport(reportInput, { outputPath });
  await writeFile(outputPath, renderReport(reportInput), "utf-8");
  console.log(`Report written to ${outputPath}`);
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
  }).catch((e) => {
    console.error("Report generation failed:", e);
    process.exit(1);
  });
}
