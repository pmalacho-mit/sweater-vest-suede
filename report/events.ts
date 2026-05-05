import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
 * Starts a short-lived HTTP server that waits for a single `gallery-ready` event
 * from Closet.svelte. Closes itself immediately after receiving the event.
 *
 * @returns `url` — pass as `?reportServer=<url>` when opening the gallery tab.
 *          `paths` — resolves with the component path list when the event arrives.
 */
export const startDiscoveryServer = (timeout = 30_000): Promise<{
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
      rejectPaths(new Error("Discovery server timed out waiting for gallery-ready event"));
    }, timeout);

    server.listen(0, "0.0.0.0", () => {
      const { port } = server.address() as { port: number };
      const ip = getDevcontainerIp();
      resolveServer({ url: `http://${ip}:${port}`, paths });
    });
  });

/**
 * Starts an HTTP server on an OS-assigned port bound to 0.0.0.0.
 * Used once per component tab to collect test results.
 *
 * @returns `url`  — pass as `?reportServer=<url>` when opening the component tab.
 *          `done` — resolves with TestResult[] when suite-ready + all test events received.
 *          `close` — shuts the server down early (e.g. on error).
 */
export const startEventServer = (timeout = 60_000): Promise<{
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
        if (event?.type === "suite-ready" && typeof event.totalTests === "number") {
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
