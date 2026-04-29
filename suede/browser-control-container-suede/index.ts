import { resolve } from "node:path";
import { container, image } from "../programmatic-docker-suede";
import { devcontainerNetwork } from "../programmatic-docker-suede/devcontainer.js";
import CommandStream, {
  type CompletedResult,
} from "../programmatic-docker-suede/CommandStream.js";
import defaults from "./defaults.js";

/**
 * Currently, `chrome` is not supported on Apple Silicon due to Playwright's bundled Chromium not supporting ARM64 Linux.
 * This is supposed to be fixed in Q2 2026: https://blog.google/chromium/bringing-chrome-to-arm64-linux-devices/
 */
export const browsers = [
  "chromium",
  "firefox",
  "webkit",
  /** chrome */
] as const;
export type Browser = (typeof browsers)[number];

const __dirname = resolve(import.meta.dirname);
const context = resolve(__dirname, "docker");

type Options = Partial<
  typeof defaults & {
    onBuild: (stream: CommandStream) => void;
    log?: boolean;
  }
>;

export const tryRemove = async (
  browser: Browser,
  details?: Pick<Options, "container" | "log">,
) => {
  try {
    await container.remove((details?.container ?? defaults.container)(browser));
    if (details?.log) console.log(`Removed existing container for ${browser}`);
  } catch {}
};

/**
 *
 * @param BROWSER
 * @param details
 * @returns
 * @throws
 */
export const buildAndRun = async (BROWSER: Browser, details?: Options) => {
  const name = (details?.container ?? defaults.container)(BROWSER);
  const tag = (details?.image ?? defaults.image)(BROWSER);

  await tryRemove(BROWSER, details);

  if (details?.log) console.log(`Building image ${tag} from ${context}...`);

  const build = await image.build(tag, context, { buildargs: { BROWSER } });

  details?.onBuild?.(build);

  if (details?.log)
    for await (const chunk of build.chunks())
      process[chunk.kind === "err" ? "stderr" : "stdout"].write(chunk.data);

  const { exit, err } = await build.complete();

  if (exit !== 0)
    throw new Error(`Build failed for ${tag} with error:\n${err}`);

  const network = await devcontainerNetwork();

  const command = details?.command ?? defaults.command;
  return container.run({ network, name, command, image: tag });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type PlaywrightCliOptions = {
  session?: string;
  /** output response as JSON */
  json?: boolean;
  /** output only the result value, without status and code */
  raw?: boolean;
};

export const playwright = {
  args: (args: string[], options?: PlaywrightCliOptions) => [
    "playwright-cli",
    ...(options?.session ? [`-s=${options.session}`] : []),
    ...(options?.json ? ["--json"] : []),
    ...(options?.raw ? ["--raw"] : []),
    ...args,
  ],
  exec: (name: string, args: string[], options?: PlaywrightCliOptions) =>
    container.exec(name, playwright.args(args, options)),
  /** CLI does not return non-zero exit codes on error */
  errored: async (stream: CommandStream) => {
    const { out } = await stream.complete();
    return out.startsWith("### Error\n");
  },
  run: async (
    container: string,
    args: string[],
    options?: PlaywrightCliOptions,
  ) => {
    const result = await playwright.exec(container, args, options).complete();

    if (result.exit !== 0)
      throw new Error(`playwright-cli ${args[0]} failed: ${result.err}`);

    return result;
  },
  json: async <T>(
    container: string,
    args: string[],
    options?: Omit<PlaywrightCliOptions, "json">,
  ) => {
    const result = await playwright.run(container, args, {
      ...options,
      json: true,
    });
    return result.out.trim() ? (JSON.parse(result.out) as T) : undefined;
  },
  open: (
    container: string,
    browser: Browser,
    session: string,
    url: string = "about:blank",
  ) =>
    playwright.run(container, ["open", url, "--browser", browser], { session }),
  close: (container: string, session: string) =>
    playwright.run(container, ["close"], { session }),
  list: (container: string) =>
    playwright
      .json<{ browsers: Array<Record<string, unknown>> }>(container, ["list"])
      .then((result) => result?.browsers ?? []),
  ready: async (
    name: string,
    maxAttempts: number = 20,
    delayMs: number = 250,
  ): Promise<void> => {
    for (let i = 0; i < maxAttempts; i++) {
      if (await container.isRunning(name))
        if (await playwright.json(name, ["list"])) return;
      await sleep(delayMs);
    }
    throw new Error(`Playwright CLI not ready in container ${name}`);
  },
};

export const readFile = (name: string, path: string) =>
  container.exec(name, ["cat", path]).complete({ out: "buffer" });
