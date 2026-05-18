import { writeFile } from "node:fs/promises";
import { devcontainer } from "../suede/programmatic-docker-suede/devcontainer.js";
import { container } from "../suede/programmatic-docker-suede";
import {
  buildAndRun,
  playwright,
  sessionWithTabs,
  type SessionWithTabs,
  type Browser,
} from "../suede/browser-control-container-suede";
import { startReportServer, type ReportServer } from "./events.ts";
//import { renderReport, type ReportInput } from "./html.ts";
import { printReport } from "./print.ts";
import { renderMarkdown } from "./markdown.ts";
import { isCliEntryPoint } from "../utils/node/index.ts";
import { readableTimestamp, sort, type Expand } from "../utils/index.ts";
import { getOrDefaults } from "../utils/options.ts";
import type { TestResult } from "./events.ts";

export { renderMarkdown } from "./markdown.ts";
export type { TestResult, Event } from "./events.ts";

export namespace Report {
  export type Server = ReportServer;

  export type Options = {
    /** URL where the development server is running. */
    server?: string;
    /** Endpoint where Closet.svelte is rendered (relative to the server URL). */
    closet?: string;
    /** Browsers to run. */
    browsers?: Browser[];
    /** Output path for the HTML report. */
    outputPath?: string;
    /** Output path for the Markdown report. Pass an empty string to skip. */
    markdownPath?: string;
    /** Only open components whose path matches this pattern. */
    componentPattern?: RegExp;
    /** Only run tests whose name or id matches this pattern. */
    testPattern?: RegExp;
  };

  /**
   * Structured types for report data, used internally and by renderers.
   * Expresses the remapping of raw TestResult data into a hierarchy of components, containers, and tests,
   * and their execution in a specific browser environment (which should be more intuitive to work with / render),
   */
  export namespace Result {
    /** The execution of a specific test on a specific browser */
    export type Run = Expand<
      Pick<TestResult, "status" | "error" | "durationMs" | "artifacts"> & {
        browser: Browser;
      }
    >;
    export type Test = Expand<
      Omit<TestResult, keyof Run | "container" | "component"> & {
        runs: Run[];
      }
    >;
    export type Container = TestResult["container"] & {
      tests: Test[];
    };
    export type Component = Pick<TestResult, "component"> & {
      containers: Container[];
    };
    export type Summary = {
      total: number;
      passed: number;
      failed: number;
      skipped: number;
      components: Component[];
    };
  }

  export type RenderInput = {
    generatedAt: string;
    closet: string;
    results: Result.Component[];
  };
}

export const defaults = {
  server: `http://${devcontainer.ip()}:5173`,
  closet: `/`,
  browsers: ["chromium"],
  outputPath: "./fashion-show.html",
  markdownPath: "./fashion-show.md",
} as const satisfies Report.Options;

const namer = async () => {
  const { Config } = await devcontainer.inspect();
  const timestamp = readableTimestamp();
  return {
    container: (browser) => `${browser}-${Config.Image}`,
    session: (browser) => `${browser}-sweater-vest-${timestamp}`,
  } satisfies Record<string, (browser: Browser) => string>;
};

const session = async (
  browser: Browser,
  { container, session }: Awaited<ReturnType<typeof namer>>,
) => sessionWithTabs(container(browser), session(browser), browser);

export type SearchParam = "component" | "reportServer" | "testFilter";

const urls = {
  param: ({ searchParams }: URL, key: SearchParam, value: string) =>
    searchParams.set(key, value),
  closet: (options: Pick<Report.Options, "server" | "closet">) => {
    const { server, closet } = getOrDefaults(
      options,
      defaults,
      "server",
      "closet",
    );
    return new URL(closet, server);
  },
  discover: (
    options: Pick<Report.Options, "server" | "closet">,
    server: ReportServer,
  ) => {
    const url = urls.closet(options);
    urls.param(url, "reportServer", `${server.url}/discover`);
    return url.toString();
  },
  test: (
    options: Pick<Report.Options, "server" | "closet">,
    server: ReportServer,
    browser: Browser,
    component: string,
    testPattern?: RegExp,
  ) => {
    const url = urls.closet(options);
    urls.param(url, "component", component);
    urls.param(url, "reportServer", `${server.url}/${browser}`);
    if (testPattern) urls.param(url, "testFilter", testPattern.source);
    return url.toString();
  },
};

const findOrCreate = Object.assign(
  (
    map: Map<string, Report.Result.Component>,
    component: string,
    result: TestResult,
  ) =>
    findOrCreate.test(
      findOrCreate.container(findOrCreate.component(map, component), result),
      result,
    ),
  {
    component: (
      map: Map<string, Report.Result.Component>,
      component: string,
    ) => {
      const entry = map.get(component) ?? { component, containers: [] };
      if (!map.has(component)) map.set(component, entry);
      return entry;
    },
    container: (component: Report.Result.Component, result: TestResult) => {
      const existing = component.containers.find(
        ({ index }) => index === result.container.index,
      );
      if (existing) return existing;
      const length = component.containers.push({
        ...result.container,
        tests: [],
      });
      return component.containers[length - 1];
    },
    test: (container: Report.Result.Container, result: TestResult) => {
      const existing = container.tests.find(
        ({ index }) => index === result.index,
      );
      if (existing) return existing;
      const length = container.tests.push({
        name: result.name,
        id: result.id,
        index: result.index,
        runs: [],
      });
      return container.tests[length - 1];
    },
  },
);

const results = async (
  server: Report.Server,
  options: Report.Options,
  sessions: Map<Browser, SessionWithTabs>,
): Promise<Report.Result.Component[]> => {
  const { browsers, componentPattern, testPattern } = getOrDefaults(
    options,
    defaults,
    "browsers",
    "componentPattern",
    "testPattern",
  );

  const paths = await server.paths.then((paths) =>
    componentPattern
      ? paths.filter((path) => componentPattern.test(path))
      : paths,
  );

  const results = await Promise.all(
    paths.flatMap((component) =>
      browsers.map(async (browser) => {
        const url = urls.test(options, server, browser, component, testPattern);
        await sessions.get(browser)!.newTab(url);
        const testResults = await server.waitForComponent(browser, component);
        return testResults.map((result) => ({ component, browser, result }));
      }),
    ),
  );

  const byComponent = new Map<string, Report.Result.Component>();

  for (const { component, browser, result } of results.flat())
    findOrCreate(byComponent, component, result).runs.push({
      browser,
      status: result.status,
      error: result.error,
      durationMs: result.durationMs,
      artifacts: result.artifacts,
    });

  const sorted = [...byComponent.values()];

  for (const component of sorted)
    for (const container of component.containers.sort(sort.byIndex))
      container.tests.sort(sort.byIndex);

  return sorted;
};

export const generateReport = async (
  options: Report.Options = {},
): Promise<Report.Result.Summary | undefined> => {
  const { closet, outputPath, markdownPath, browsers } = getOrDefaults(
    options,
    defaults,
    "browsers",
    "closet",
    "outputPath",
    "markdownPath",
  );

  let server: ReportServer | undefined;

  const names = await namer();

  try {
    const prepare = async (browser: Browser) => {
      const name = names.container(browser);
      await buildAndRun(browser, {
        container: () => name,
        network: await devcontainer.network(),
        log: true,
        skipIfRunning: true, // can re-use browser container specific to this devcontainer
      });
      await playwright.ready(name);
    };

    await Promise.all(browsers.map(prepare));

    const sessions = new Map<Browser, SessionWithTabs>();
    await Promise.all(
      browsers.map(async (browser) =>
        sessions.set(browser, await session(browser, names)),
      ),
    );

    server = await startReportServer();

    const discover = (browser: Browser) =>
      sessions.get(browser)!.newTab(urls.discover(options, server!));

    await Promise.all(browsers.map(discover));

    const reported: Report.RenderInput = {
      closet,
      generatedAt: new Date().toISOString(),
      results: await results(server, options, sessions),
    };

    printReport(reported, { outputPath });
    //await writeFile(outputPath, renderReport(reported), "utf-8");
    if (markdownPath)
      await writeFile(markdownPath, renderMarkdown(reported), "utf-8");
    console.log(
      `Report written to ${outputPath}${markdownPath ? ` and ${markdownPath}` : ""}`,
    );

    const flat = reported.results.flatMap(({ containers }) =>
      containers.flatMap(({ tests }) => tests.flatMap(({ runs }) => runs)),
    );
    return {
      components: reported.results,
      total: flat.length,
      passed: flat.filter(({ status }) => status === "passed").length,
      failed: flat.filter(({ status }) => status === "failed").length,
      skipped: flat.filter(({ status }) => status === "skipped").length,
    };
  } catch (e) {
    console.error("Report generation failed:", e);
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
      browsers.map((browser) => container.tryRemove(names.container(browser))),
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
      if ((summary?.failed ?? 1) > 0) process.abort();
    })
    .catch((e) => {
      console.error("Report generation failed:", e);
      process.abort();
    });
}
