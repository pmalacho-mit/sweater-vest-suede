import { writeFile } from "node:fs/promises";
import {
  getDevcontainerIp,
  devcontainerNetwork,
} from "../suede/programmatic-docker-suede/devcontainer.js";
import { container } from "../suede/programmatic-docker-suede";
import {
  buildAndRun,
  playwright,
  sessionWithTabs,
  type SessionWithTabs,
  type Browser,
} from "../suede/browser-control-container-suede";
import { startReportServer, type ReportServer } from "./events.ts";
import { renderReport, type ReportInput } from "./html.ts";
import { printReport } from "./print.ts";
import { isCliEntryPoint } from "../utils/node/index.ts";

export type { TestResult, Event } from "./events.ts";
export type { ReportInput } from "./html.ts";

export type ReportOptions = {
  /** URL where Closet.svelte is rendered. */
  galleryUrl?: string;
  /** Browsers to run. */
  browsers?: Browser[];
  /** Output path for the HTML report. */
  outputPath?: string;
  /** Only open components whose path matches this pattern. */
  componentPattern?: RegExp;
  /** Only run tests whose name or id matches this pattern. */
  testPattern?: RegExp;
};

export const defaults = {
  galleryUrl: `http://${getDevcontainerIp()}:5173`,
  browsers: ["chromium"],
  outputPath: "./fashion-show.html",
} as const satisfies ReportOptions;

export type Defaults = typeof defaults;

const getOrDefaults = <K extends keyof ReportOptions>(
  options: ReportOptions,
  ...keys: K[]
) => {
  type Result<Key extends K> = Key extends keyof Defaults
    ? NonNullable<ReportOptions[Key]> | Defaults[Key]
    : ReportOptions[Key];
  type Results = { [k in K]: Result<k> };
  const result = {} as Results;
  for (const key of keys)
    result[key] = (options[key] ?? (defaults as ReportOptions)[key]) as Result<
      typeof key
    >;
  return result;
};

export type ReportSummary = {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  browsers: ReportInput["browsers"];
};

const names = {
  container: (browser: Browser) => `sweater-vest-${browser}`,
  session: (browser: Browser) => `sweater-vest-report-${browser}`, // should be more unique to project
};

export type SearchParam = "component" | "reportServer" | "testFilter";

const urls = {
  param: ({ searchParams }: URL, key: SearchParam, value: string) =>
    searchParams.set(key, value),
  discover: (gallery: string, server: ReportServer) => {
    const url = new URL(gallery);
    urls.param(url, "reportServer", `${server.url}/discover`);
    return url.toString();
  },
  test: (
    gallery: string,
    server: ReportServer,
    browser: Browser,
    component: string,
    testPattern?: RegExp,
  ) => {
    const url = new URL(gallery);
    urls.param(url, "component", component);
    urls.param(url, "reportServer", `${server.url}/${browser}`);
    if (testPattern) urls.param(url, "testFilter", testPattern.source);
    return url.toString();
  },
};

export const generateReport = async (
  options: ReportOptions = {},
): Promise<ReportSummary> => {
  const { galleryUrl, browsers, outputPath, componentPattern, testPattern } =
    getOrDefaults(
      options,
      "galleryUrl",
      "browsers",
      "outputPath",
      "componentPattern",
      "testPattern",
    );

  const startedBrowsers = new Set<Browser>();
  const sessions = new Map<Browser, SessionWithTabs>();
  let server: ReportServer | undefined;

  try {
    const network = await devcontainerNetwork();

    const prepare = async (browser: Browser) => {
      await buildAndRun(browser, {
        container: () => names.container(browser),
        network,
        log: true,
        skipIfRunning: true,
      });
      startedBrowsers.add(browser);
      await playwright.ready(names.container(browser));
    };

    await Promise.all(browsers.map(prepare));

    const session = async (browser: Browser) =>
      [
        browser,
        await sessionWithTabs(
          names.container(browser),
          names.session(browser),
          browser,
        ),
      ] as const;

    for (const entry of await Promise.all(browsers.map(session)))
      sessions.set(...entry);

    server = await startReportServer();

    const discover = (browser: Browser) =>
      sessions.get(browser)!.newTab(urls.discover(galleryUrl, server!));

    await Promise.all(browsers.map(discover));

    const allPaths = await server.paths;
    const paths = componentPattern
      ? allPaths.filter((path) => componentPattern.test(path))
      : allPaths;

    const componentResults = await Promise.all(
      paths.flatMap((path) =>
        browsers.map(async (browser) => {
          await sessions
            .get(browser)!
            .newTab(urls.test(galleryUrl, server!, browser, path, testPattern));
          const results = await server!.waitForComponent(browser, path);
          return { kind: browser, path, results };
        }),
      ),
    );

    const reported: ReportInput = {
      galleryUrl,
      browsers: componentResults,
      generatedAt: new Date().toISOString(),
    };

    printReport(reported, { outputPath });
    await writeFile(outputPath, renderReport(reported), "utf-8");
    console.log(`Report written to ${outputPath}`);

    const results = reported.browsers.flatMap((b) => b.results);
    return {
      totalTests: results.length,
      passed: results.filter((r) => r.status === "passed").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      browsers: reported.browsers,
    };
  } finally {
    server?.close();
    await Promise.allSettled(
      browsers.map((browser) =>
        playwright
          .close(names.container(browser), names.session(browser))
          .catch(() => {}),
      ),
    );
    await Promise.allSettled(
      [...startedBrowsers].map((browser) =>
        container.tryRemove(names.container(browser)),
      ),
    );
  }
};

if (isCliEntryPoint(import.meta.url)) {
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
