import { beforeAll, afterAll, expect } from "vitest";
import {
  container,
  docker,
  image,
} from "../../release/suede/programmatic-docker-suede";
import {
  type Browser,
  buildAndRun,
  playwright,
} from "../../release/suede/browser-control-container-suede";
import { basename, relative, resolve } from "node:path";

const dirname = resolve(import.meta.dirname);
const root = resolve(dirname, "..", "..");
const dockerfile = relative(root, resolve(dirname, "Dockerfile"));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const poll = async (
  fn: () => Promise<boolean>,
  { timeout = 30_000, interval = 1_000 } = {},
) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await sleep(interval);
  }
  throw new Error(`Poll timed out: ${fn.toString()}`);
};

export const configure = <const T extends string>(
  test: T,
  browser: Browser = "chromium",
) => {
  const name = `vite-${test}` as const;
  return {
    test,
    name,
    network: `${name}-network` as const,
    vite: {
      container: name,
      url: `http://${name}:5173` as const,
      tag: `${name}:latest` as const,
    } as const,
    browser: {
      kind: browser,
      session: name,
      container: `sweater-vest-browser-control-${browser}` as const,
    } as const,
  };
};

type Config = ReturnType<typeof configure>;

export const tryCreateNetwork = async (name: Config["network"] | Config) =>
  docker([
    "network",
    "create",
    typeof name === "string" ? name : name.network,
  ]).catch(() => {});

export const tryRemoveNetwork = async (name: Config["network"] | Config) =>
  docker([
    "network",
    "rm",
    typeof name === "string" ? name : name.network,
  ]).catch(() => {});

export const tryRemoveContainer = async (name: string) =>
  container.remove(name).catch(() => {});

export const buildViteImage = async ({
  test: TEST_CASE,
  vite: { tag },
}: Pick<Config, "name" | "test"> & {
  vite: Pick<Config["vite"], "tag">;
}) => {
  const build = image.build(tag, root, {
    dockerfile,
    buildargs: { TEST_CASE },
  });
  for await (const chunk of build.chunks()) process.stdout.write(chunk.data);
  const result = await build.complete();
  if (result.exit !== 0) {
    const cause = "error" in result ? result.error : undefined;
    throw new Error(
      `Vite image build failed:\nout: ${result.out}\nerr: ${result.err}\ncause: ${cause?.message}`,
    );
  }
};

export const prepare = {
  vite: async (config: Config) => {
    const [vite] = await Promise.allSettled([
      buildViteImage(config),
      container.remove(config.vite.container).catch(() => {}),
    ]);
    if (vite.status === "rejected")
      throw new Error(`Failed to build Vite image: ${vite.reason}`);
    return container.run({
      image: config.vite.tag,
      name: config.vite.container,
      network: config.network,
      removeOnStop: true,
    });
  },
  browser: async (config: Config) => {
    await buildAndRun(config.browser.kind, {
      container: () => config.browser.container,
      network: config.network,
      log: true,
    });
    await playwright.ready(config.browser.container);
  },
};

const checkConnectionTemplate = () =>
  fetch("<URL>")
    .then((r) => {
      process.stdout.write(String(r.status));
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      process.stderr.write(e.cause?.code ?? e.message);
      process.exit(1);
    });

const checkConnection = (url: string) =>
  `(${checkConnectionTemplate.toString().replace("<URL>", url)})()`;

export const browserCanReachVite = async (
  { browser, vite }: Config,
  timeout = 30_000,
) =>
  poll(
    async () => {
      const { exit, out, err } = await container
        .exec(browser.container, ["node", "-e", checkConnection(vite.url)])
        .complete();

      if (exit !== 0)
        console.log(
          `browser could not reach vite: ${err.trim() || out.trim() || "(exec failed with no output)"}`,
        );
      return exit === 0;
    },
    { timeout },
  );

export const openSession = async (config: Config) => {
  const result = await playwright.open(
    config.browser.container,
    config.browser.kind,
    config.browser.session,
    config.vite.url,
  );
  if (result.exit !== 0)
    throw new Error(
      `Failed to open Playwright session: ${result.out}\n${result.err}${"error" in result ? `\n${result.error}` : ""}`,
    );
};

export const expectNoConsoleErrors = async ({
  browser: { container, session },
}: Config) =>
  playwright
    .exec(container, ["console"], { session })
    .complete()
    .then(({ out }) => expect(out).toContain("Errors: 0"));

export const evaluate = async <Return>(
  { browser: { container, session } }: Config,
  fn: () => Return,
) => {
  const value = await playwright.json<{ result: string }>(
    container,
    ["eval", fn.toString()],
    { session },
  );
  if (value?.result) return JSON.parse(value.result) as Return;
};

export const singleSessionSuite = (import_meta_dirname: string) => {
  const config = configure(basename(import_meta_dirname));

  beforeAll(async () => {
    await tryCreateNetwork(config);
    const [vite] = await Promise.allSettled([
      prepare.vite(config),
      prepare.browser(config),
    ]);
    if (vite.status === "rejected")
      throw new Error(`Failed to prepare Vite container: ${vite.reason}`);
    await browserCanReachVite(config);
    await openSession(config);
  }, 300_000);

  afterAll(async () =>
    Promise.allSettled([
      playwright
        .close(config.browser.container, config.browser.session)
        .catch(() => {}),
      tryRemoveContainer(config.vite.container),
      tryRemoveContainer(config.browser.container),
      tryRemoveNetwork(config),
    ]),
  );

  return {
    config,
    open: () => {},
    evaluate: evaluate.bind(null, config) as <Return>(
      fn: () => Return,
    ) => Promise<Return>,
    expectNoConsoleErrors: expectNoConsoleErrors.bind(null, config),
  };
};
