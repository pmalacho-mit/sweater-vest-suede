<script lang="ts" module>
  import { type PanelProps, type ViewAPI } from "../dockview-svelte-suede";
  import "../dockview-svelte-suede/styles/dockview.css";

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
    orientation: Orientation
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
    orientation: Orientation
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

  let total = $state(1);
  export const setTotal = (n: number) => (total = n);
  const heightPercentage = $derived(100 / total);
</script>

<script lang="ts">
  import { GridView } from "../dockview-svelte-suede";
  import Runner, { type Props as RunnerProps, reset } from "./Runner.svelte";
  import { defer } from "./utils";
  import { onAbort } from "./utils/abort";

  let { orientation = "horizontal", mode, ...rest }: Props = $props();

  let count = 0;

  type API = ViewAPI<"grid", { child: typeof child }>;

  const { promise, resolve } = defer<API>();

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
    api.addSnippetPanel("child", props, options(index, props, orientation));
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
