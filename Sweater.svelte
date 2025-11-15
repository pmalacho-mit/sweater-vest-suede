<script lang="ts" module>
  import type { Props as RunnerProps, PocketElements } from "./Runner.svelte";
  import type { Props as ContainerProps } from "./Container.svelte";
  import Container, { next } from "./Container.svelte";
  import { onMount, type Snippet } from "svelte";
  import { createContainerMap } from "./utils.svelte.js";

  type ConfigProps = ContainerProps & {
    target?: HTMLElement;
    config: true;
    children?: Snippet;
  };

  type Props<T extends PocketElements> = PocketElements extends T
    ? keyof T extends never
      ? RunnerProps<{}>
      : ConfigProps
    : RunnerProps<T>;

  const is = <T extends "config" | "test">(
    type: T,
    props: ConfigProps | RunnerProps<any>,
  ): props is T extends "config" ? ConfigProps : RunnerProps<any> => {
    const hasConfig = "config" in props && props.config;
    return type === "config" ? hasConfig : !hasConfig;
  };

  const containers = createContainerMap();

  const counts = {
    tests: 0,
    configs: 0,
    sum: () => counts.tests + counts.configs,
  };
</script>

<script lang="ts" generics="T extends PocketElements">
  let props: Props<T> = $props();

  const index = counts.sum();

  onMount(() => {
    const test = is("test", props);
    if (test) (containers.context ?? containers.find(index)).push(props);
    counts[test ? "tests" : "configs"]--;
    if (counts.sum() > 0) return;
    containers.each((container) => container.setTotal(containers.total));
    containers.reset();
    next();
  });
</script>

{#if is("config", props)}
  {#if props.children}
    <Container bind:this={containers.current} {...props} />
    {@render props.children()}
  {:else}
    <Container bind:this={containers[index]} {...props} />
  {/if}
  {void counts.configs++}
{:else}
  {#if index === 0}
    <Container bind:this={containers[index]} />
  {/if}
  {void counts.tests++}
{/if}
