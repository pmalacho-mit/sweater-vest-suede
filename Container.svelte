<script lang="ts" module>
  export type Props = {
    theme?: Theme;
    orientation?: "HORIZONTAL" | "VERTICAL";
    mode?: RunnerProps["mode"];
  };

  const warnIfFirstAndHasPosition = (index: number, props: RunnerProps) => {
    if (index > 0 || !props.position) return;
    console.warn("Position can not be applied to the first panel");
  };

  type Options = Exclude<
    Parameters<ViewAPI<"grid", any>["addSnippetPanel"]>[2],
    undefined
  >;

  const id = (index: number) => `vest-${index}` satisfies Options["id"];

  const position = (index: number, props: RunnerProps): Options["position"] =>
    index === 0
      ? undefined
      : {
          direction: props.position ?? "right",
          referencePanel: id(index - 1),
        };

  const options = (index: number, props: RunnerProps): Options => ({
    id: id(index),
    position: position(index, props),
  });

  let version = 0;
  export const next = () => version++;

  const aborts = new Set<() => void>();

  const untilEmpty = async (signal: AbortSignal) => {
    let cancelled = false;
    onAbort(signal, () => (cancelled = true));
    let currentTime = Date.now();
    while (aborts.size > 0 && !cancelled) {
      if (Date.now() - currentTime > 500) {
        console.log("waiting");
        currentTime = Date.now();
      }
      await new Promise(requestAnimationFrame);
    }
  };

  const timeout = (signal: AbortSignal) => {
    let timeout: ReturnType<typeof setTimeout>;
    onAbort(signal, () => clearTimeout(timeout));
    return new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        console.log("timeout");
        resolve();
      }, 1000);
    });
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
</script>

<script lang="ts">
  import {
    GridView,
    type PanelProps,
    type ViewAPI,
    type Theme,
  } from "@p-buddy/dockview-svelte";
  import Runner, { type Props as RunnerProps, reset } from "./Runner.svelte";
  import { deferred, onAbort } from "./utils.svelte.js";

  let { orientation = "HORIZONTAL", theme = "dark", mode }: Props = $props();

  let total = $state(1);

  export const setTotal = (n: number) => (total = n);

  let count = 0;

  type API = ViewAPI<"grid", { child: typeof child }>;

  const { promise, resolve } = deferred<API>();

  const withDefaults = (props: RunnerProps) => ({
    ...props,
    mode: props.mode ?? mode,
  });

  export const push = async (props: RunnerProps) => {
    pending.abort ??= abort();
    const [api] = await Promise.all([promise, pending.abort]);
    const index = count++;
    props = withDefaults(props);
    warnIfFirstAndHasPosition(index, props);
    api.addSnippetPanel("child", props, options(index, props));
  };
</script>

<svelte:head>
  <style>
    body {
      margin: 0;
    }
  </style>
</svelte:head>

{#snippet child({ params }: PanelProps<"grid", RunnerProps>)}
  <Runner
    {...params}
    begin={(abort) => {
      aborts.add(abort);
      pending.abort = undefined;
      return () => aborts.delete(abort);
    }}
  />
{/snippet}

<div style:width="100vw" style:height={100 / total + "vh"}>
  <GridView
    {orientation}
    {theme}
    snippets={{ child }}
    onReady={({ api }) => resolve(api)}
  />
</div>
