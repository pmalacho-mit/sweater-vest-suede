<script lang="ts" module>
  import { type PanelProps, type ViewAPI } from "./suede/dockview-svelte-suede";
  import "./suede/dockview-svelte-suede/styles/dockview.css";
  import Runner, {
    type Props as RunnerProps,
    type Error,
    reset,
  } from "./Runner.svelte";
  import { onAbort, TestAborted } from "./utils/abort";

  const orientations = {
    horizontal: "HORIZONTAL",
    vertical: "VERTICAL",
  } as const;

  type Orientation = keyof typeof orientations;

  export type Props = {
    orientation?: Orientation;
    mode?: RunnerProps["mode"];
    class?: string;
    style?: string;
  };

  export const mechanism = {
    /** Tests are childed under a config Sweater */
    nested: "nested",
    /** Configs are provided sequentially (so subsequent tests fall under the closest previous config Sweater) */
    sequential: "sequential",
    /** Tests are self-contained / standalone (so no config Sweater is used) */
    selfContained: "self-contained",
  } as const;

  export type Mechanism = (typeof mechanism)[keyof typeof mechanism];

  const warnIfFirstAndHasPosition = (index: number, props: RunnerProps) => {
    if (index > 0 || !props.position) return;
    console.warn("Position can not be applied to the first panel");
  };

  type Options = Exclude<
    Parameters<ViewAPI<"grid", any>["addSnippetPanel"]>[2],
    undefined
  >;

  const id = (index: number) => `vest-${index}` satisfies Options["id"];

  const defaultDirection = (orientation: Orientation) =>
    orientation === "horizontal" ? "right" : "below";

  const position = (
    index: number,
    props: RunnerProps,
    orientation: Orientation,
  ): Options["position"] =>
    index === 0
      ? undefined
      : {
          direction: props.position ?? defaultDirection(orientation),
          referencePanel: id(index - 1),
        };

  const options = (
    index: number,
    props: RunnerProps,
    orientation: Orientation,
  ): Options => ({
    id: id(index),
    position: position(index, props, orientation),
  });

  let version = 0;
  export const next = () => version++;

  const aborts = new Set<() => void>();

  const untilEmpty = async (signal: AbortSignal) => {
    let cancelled = false;
    onAbort(signal, () => (cancelled = true));
    while (aborts.size > 0 && !cancelled)
      await new Promise(requestAnimationFrame);
  };

  /**
   * Time in milliseconds to wait before forcefully aborting ongoing operations.
   */
  const AbortTimeoutMs = 1000;

  const timeout = (signal: AbortSignal) => {
    let timeout: ReturnType<typeof setTimeout>;
    onAbort(signal, () => clearTimeout(timeout));
    return new Promise<void>(
      (resolve) => (timeout = setTimeout(resolve, AbortTimeoutMs)),
    );
  };

  const pending = {
    abort: undefined as ReturnType<typeof abort> | undefined,
  };

  const abort = async () => {
    aborts.forEach((abort) => abort());
    const controller = new AbortController();
    const { signal } = controller;
    await Promise.race([untilEmpty(signal), timeout(signal)]);
    controller.abort();
    reset();
  };

  let total = $state(1);
  export const setTotal = (n: number) => (total = n);
  const heightPercentage = $derived(100 / total);

  let count = 0;
</script>

<script lang="ts">
  import { GridView } from "./suede/dockview-svelte-suede";
  import { defer } from "./utils";

  let {
    orientation = "horizontal",
    mode,
    ...rest
  }: Props & { mechanism: Mechanism } = $props();

  let tests = 0;

  const index = count++;

  type API = ViewAPI<"grid", { child: typeof child }>;

  const { promise, resolve } = defer<API>();

  const withDefaults = (props: RunnerProps) => ({
    ...props,
    mode: props.mode ?? mode,
    error: (e: any) => {
      if (e instanceof TestAborted) return;
      console.group("❌ Test Failed");
      console.error("Error:", e);
      console.error("Message:", e?.message);
      console.error("Name:", e?.name);
      console.error("Stack:", e?.stack);
      if (e?.matcherResult) console.error("Matcher Result:", e.matcherResult);
      console.groupEnd();
    },
  });

  export const push = async (props: RunnerProps) => {
    pending.abort ??= abort();
    const [api] = await Promise.all([promise, pending.abort]);
    const test = tests++;
    const resolved = withDefaults(props);
    warnIfFirstAndHasPosition(test, resolved);
    api.addSnippetPanel("child", resolved, options(test, props, orientation));
  };
</script>

<svelte:head>
  <style>
    body {
      margin: 0;
    }
  </style>
</svelte:head>

{#snippet child({ params }: PanelProps<"grid", RunnerProps & { error: Error }>)}
  <Runner
    {...params}
    begin={(abort) => {
      aborts.add(abort);
      pending.abort = undefined;
      return () => aborts.delete(abort);
    }}
  />
{/snippet}

<div
  {...rest}
  style:width="max(100%, 100vw)"
  style:height={`max(${heightPercentage}%, ${heightPercentage}vh)`}
>
  <GridView
    snippets={{ child }}
    onReady={({ api }) => resolve(api)}
    orientation={orientations[orientation]}
  />
</div>
