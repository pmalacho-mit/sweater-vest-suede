import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { getDevcontainerIp } from "../suede/programmatic-docker-suede/devcontainer.js";

export type TestResult = {
  name?: string;
  id?: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  error?: { message: string; stack?: string; matcherResult?: unknown };
  captures: Array<{ type: string; dataUri: string }>;
  notes: string[];
};

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB

const setCors = (res: ServerResponse) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const readBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      if (body.length + chunk.length > MAX_BODY_BYTES) {
        req.destroy(new Error("Request body exceeded 50 MB limit"));
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });

/**
 * Low-level test utility server that waits for a single `gallery-ready` event
 * from Closet.svelte. Production report generation should use `startReportServer`
 * instead.
 *
 * @returns `url` — pass as `?reportServer=<url>` when opening the gallery tab.
 *          `paths` — resolves with the component path list when the event arrives.
 */
export const startDiscoveryServer = (
  timeout = 30_000,
): Promise<{
  url: string;
  paths: Promise<string[]>;
}> =>
  new Promise((resolveServer) => {
    let resolvePaths!: (paths: string[]) => void;
    let rejectPaths!: (err: Error) => void;
    const paths = new Promise<string[]>((res, rej) => {
      resolvePaths = res;
      rejectPaths = rej;
    });

    const server = createServer(async (req, res) => {
      setCors(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
      try {
        const event = (await readBody(req)) as Record<string, unknown>;
        if (event?.type === "gallery-ready" && Array.isArray(event.paths)) {
          clearTimeout(timer);
          server.close();
          resolvePaths(event.paths as string[]);
        }
      } catch {
        // malformed body — ignore
      }
    });

    const timer = setTimeout(() => {
      server.close();
      rejectPaths(
        new Error("Discovery server timed out waiting for gallery-ready event"),
      );
    }, timeout);

    server.listen(0, "0.0.0.0", () => {
      const { port } = server.address() as { port: number };
      const ip = getDevcontainerIp();
      resolveServer({ url: `http://${ip}:${port}`, paths });
    });
  });

/**
 * Low-level test utility server on an OS-assigned port bound to 0.0.0.0.
 * Used by focused tests; production report generation should use
 * `startReportServer`.
 *
 * @returns `url`  — pass as `?reportServer=<url>` when opening the component tab.
 *          `done` — resolves with TestResult[] when suite-ready + all test events received.
 *          `close` — shuts the server down early (e.g. on error).
 */
export const startEventServer = (
  timeout = 60_000,
): Promise<{
  url: string;
  done: Promise<TestResult[]>;
  close: () => void;
}> =>
  new Promise((resolveServer) => {
    let totalTests: number | undefined;
    const results: TestResult[] = [];
    let resolveDone!: (r: TestResult[]) => void;
    let rejectDone!: (e: Error) => void;
    const done = new Promise<TestResult[]>((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });

    const checkDone = () => {
      if (totalTests !== undefined && results.length >= totalTests) {
        clearTimeout(timer);
        server.close();
        resolveDone([...results]);
      }
    };

    const server = createServer(async (req, res) => {
      setCors(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
      try {
        const event = (await readBody(req)) as Record<string, unknown>;
        if (
          event?.type === "suite-ready" &&
          typeof event.totalTests === "number"
        ) {
          totalTests = event.totalTests;
          checkDone();
        } else if (event?.type === "test-complete") {
          results.push({
            name: event.name as string | undefined,
            id: event.id as string | undefined,
            status: event.status === "failed" ? "failed" : "passed",
            durationMs: (event.durationMs as number) ?? 0,
            error: event.error as TestResult["error"],
            captures: (event.captures as TestResult["captures"]) ?? [],
            notes: (event.notes as string[]) ?? [],
          });
          checkDone();
        } else if (event?.type === "test-skipped") {
          results.push({
            name: event.name as string | undefined,
            id: event.id as string | undefined,
            status: "skipped",
            durationMs: 0,
            captures: [],
            notes: [],
          });
          checkDone();
        }
        // Unknown types (e.g. gallery-ready arriving at a component server) are silently ignored
      } catch {
        // malformed body — ignore
      }
    });

    const timer = setTimeout(() => {
      server.close();
      rejectDone(new Error("Event server timed out waiting for test results"));
    }, timeout);

    server.listen(0, "0.0.0.0", () => {
      const { port } = server.address() as { port: number };
      const ip = getDevcontainerIp();
      resolveServer({
        url: `http://${ip}:${port}`,
        done,
        close: () => {
          clearTimeout(timer);
          server.close();
        },
      });
    });
  });

// ---------------------------------------------------------------------------

type ComponentState = {
  total: number | undefined;
  results: TestResult[];
  promise: Promise<TestResult[]>;
  resolve: (r: TestResult[]) => void;
  reject: (e: Error) => void;
};

/**
 * A single HTTP server that handles discovery and all browser×component test
 * events for a full multi-browser report run.
 *
 * Routing:
 *   POST /discover        ← gallery-ready from Closet.svelte (any browser)
 *   POST /<browser>       ← suite-ready / test-complete / test-skipped events
 *                           The browser name comes from the URL path; the component
 *                           path comes from the `component` field in the event body.
 *
 * @returns
 *   `url`               — base URL. Append `/discover` or `/<browser>` when building
 *                         the `?reportServer=` query parameter.
 *   `paths`             — resolves with component paths on the first gallery-ready event
 *                         (all browsers see the same glob, so subsequent events are ignored).
 *   `waitForComponent`  — returns a promise for a specific (browser, componentPath) pair
 *                         that resolves when all its test events have been received.
 *                         Safe to call before or after events arrive.
 *   `close`             — shuts the server down early; rejects any still-pending promises.
 */
export const startReportServer = (
  timeout = 120_000,
): Promise<{
  url: string;
  paths: Promise<string[]>;
  waitForComponent: (
    browser: string,
    componentPath: string,
  ) => Promise<TestResult[]>;
  close: () => void;
}> =>
  new Promise((resolveServer) => {
    // Discovery state
    let discoveryResolved = false;
    let resolveDiscovery!: (paths: string[]) => void;
    let rejectDiscovery!: (e: Error) => void;
    const paths = new Promise<string[]>((res, rej) => {
      resolveDiscovery = res;
      rejectDiscovery = rej;
    });

    // Per-(browser, component) state, keyed as "<browser>::<componentPath>"
    const components = new Map<string, ComponentState>();

    const getState = (
      browser: string,
      componentPath: string,
    ): ComponentState => {
      const k = `${browser}::${componentPath}`;
      if (!components.has(k)) {
        let resolve!: (r: TestResult[]) => void;
        let reject!: (e: Error) => void;
        const promise = new Promise<TestResult[]>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        components.set(k, {
          total: undefined,
          results: [],
          promise,
          resolve,
          reject,
        });
      }
      return components.get(k)!;
    };

    const checkComplete = (browser: string, componentPath: string) => {
      const state = components.get(`${browser}::${componentPath}`);
      if (!state) return;
      if (state.total !== undefined && state.results.length >= state.total)
        state.resolve([...state.results]);
    };

    const server = createServer(async (req, res) => {
      setCors(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");

      const route = (req.url ?? "/").replace(/^\/+/, "").split("?")[0];

      try {
        const event = (await readBody(req)) as Record<string, unknown>;

        if (route === "discover") {
          if (
            !discoveryResolved &&
            event?.type === "gallery-ready" &&
            Array.isArray(event.paths)
          ) {
            discoveryResolved = true;
            resolveDiscovery(event.paths as string[]);
          }
          return;
        }

        // All other routes are browser names (e.g. "chromium", "firefox", "webkit").
        const browser = route;
        const componentPath = event?.component as string | undefined;

        if (!componentPath) {
          if (
            event?.type === "suite-ready" ||
            event?.type === "test-complete" ||
            event?.type === "test-skipped"
          ) {
            console.warn(
              `[sweater-vest] Received ${String(event?.type)} event with no component field — ignoring.`,
            );
          }
          return;
        }

        if (
          event?.type === "suite-ready" &&
          typeof event.totalTests === "number"
        ) {
          getState(browser, componentPath).total = event.totalTests;
          checkComplete(browser, componentPath);
        } else if (event?.type === "test-complete") {
          const state = getState(browser, componentPath);
          state.results.push({
            name: event.name as string | undefined,
            id: event.id as string | undefined,
            status: event.status === "failed" ? "failed" : "passed",
            durationMs: (event.durationMs as number) ?? 0,
            error: event.error as TestResult["error"],
            captures: (event.captures as TestResult["captures"]) ?? [],
            notes: (event.notes as string[]) ?? [],
          });
          checkComplete(browser, componentPath);
        } else if (event?.type === "test-skipped") {
          const state = getState(browser, componentPath);
          state.results.push({
            name: event.name as string | undefined,
            id: event.id as string | undefined,
            status: "skipped",
            durationMs: 0,
            captures: [],
            notes: [],
          });
          checkComplete(browser, componentPath);
        }
      } catch {
        // malformed body — ignore
      }
    });

    const timer = setTimeout(() => {
      const err = new Error("Report server timed out");
      server.close();
      if (!discoveryResolved) rejectDiscovery(err);
      for (const state of components.values()) state.reject(err);
    }, timeout);

    server.listen(0, "0.0.0.0", () => {
      const { port } = server.address() as { port: number };
      const ip = getDevcontainerIp();

      resolveServer({
        url: `http://${ip}:${port}`,
        paths,
        waitForComponent: (browser, componentPath) =>
          getState(browser, componentPath).promise,
        close: () => {
          const err = new Error("Report server closed");
          clearTimeout(timer);
          server.close();
          if (!discoveryResolved) rejectDiscovery(err);
          for (const state of components.values()) state.reject(err);
        },
      });
    });
  });
