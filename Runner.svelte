<script lang="ts" module>
  /* TODO: should retrieve dynamically in the case of playwright? */
  import * as test from "@storybook/test";
  import {
    PromiseQueue,
    type Deferred,
    retrieve,
    createTestAbortMechanism,
    createCapturer,
    untilNextFrame,
    TestAborted,
    type ValueOrGetter,
  } from "./utils.svelte.js";
  import { type Snippet, flushSync } from "svelte";

  export type PocketElements = Record<string, any>;

  type Flush = (..._: any[]) => void;

  interface Setter<T> {
    /**
     * Set the values of the test elements according to the items provided in the payload.
     * @param payload - The values to set the test elements to.
     */
    (payload: Partial<T>): void;
    /**
     * **_NOTE:_** This overload is intended only for use with <ins>**svelte runes**</ins>.
     *
     * Both sets the values of the test elements according to the object returned by the getter,
     * but also sets up a reactive dependency on `getter` such that when any of the reactive values it references change,
     * the test elements will be updated to the new values.
     * @example
     * ```ts
     * let value = $state(0);
     * set(() => ({ value }));
     * ```
     * @example
     * ```ts
     * let value = $state(0);
     * const flush = set(() => ({ value }));
     * flush((value = 1));
     * ```
     * @param getter - A function that returns the values to set the test elements to.
     * Any reactive values referenced in the function body will be tracked as dependencies.
     * @returns A function that can be used to immediately flush reactive changes (e.g. internally calls `svelte.flushSync`).
     * For syntatic sugar purposes, it takes any abritrary number of arguments,
     * so you can update a rune and flush it's changes in a single line (see the second example above).
     */
    (getter: () => Partial<T>): Flush;
  }

  type TestHarness<T extends PocketElements> = {
    given: (...keys: (keyof T)[]) => Promise<Pick<T, (typeof keys)[number]>>;
    set: Setter<T>;
    root: HTMLElement;
    preventRender: () => () => void;
    signal: AbortSignal;
    onAbort: (fn: () => void) => void;
    capture: ReturnType<typeof createCapturer>;
    untilNextFrame: typeof untilNextFrame;
  } & typeof test;

  type Mode = Required<PromiseQueue>["Types"]["Task"]["mode"];

  export type Props<T extends PocketElements = PocketElements> = {
    vest: Snippet<[pocket: T]>;
    body: (harness: TestHarness<T>) => Promise<void>;
    name?: string;
    id?: string;
    mode?: Mode;
    manual?: boolean;
    position?: "above" | "below" | "left" | "right" | "within";
  };

  type Abort = () => void;
  type Complete = () => void;
  type Begin = (abort: Abort) => Complete;

  export const reset = () => {
    queue = new PromiseQueue();
    console.log("reset");
  };

  let queue: PromiseQueue;

  const errorIfRendered = (rendered: boolean) => {
    if (!rendered) return;
    const msg = `Render has already happened, so it cannot be prevented. 
Make sure to call \`harness.preventRender()\` at the top of your body function before anything is \`await\`ed.`;
    throw new Error(msg);
  };
</script>

<script lang="ts" generics="T extends PocketElements">
  import { onMount } from "svelte";
  import { createSubscriber } from "svelte/reactivity";

  let {
    body,
    vest,
    mode = "parallel",
    manual = false,
    begin,
  }: Props<T> & { begin: Begin } = $props();

  type MapKey = string | symbol;
  type Subscriber = ReturnType<typeof createSubscriber>;
  const subscriberMap = new Map<MapKey, Subscriber>();
  const deferredMap = new Map<MapKey, Deferred<any>>();

  let root = $state.raw<HTMLDivElement>();
  let gate = $state.raw<Promise<any>>();
  let prevented = $state(manual);

  /* svelte-ignore non_reactive_update */
  let rendered = false;

  const pocket: T = new Proxy({} as T, {
    set: (target, prop, value) => {
      target[prop as keyof T] = value;
      retrieve(deferredMap, prop).resolve(value);
      return true;
    },
    get: (target, prop) => {
      subscriberMap.get(prop)?.();
      return target[prop as keyof T];
    },
  });

  type Harness = TestHarness<T>;

  const abort = createTestAbortMechanism();

  const setValue = (obj: Partial<T>) =>
    Object.entries(obj).forEach(([key, value]) => {
      pocket[key as keyof T] = value;
    });

  const set: Harness["set"] = abort.wrap(
    (payload: ValueOrGetter<Partial<T>>) => {
      if (typeof payload !== "function") return setValue(payload);
      for (const key of Object.keys(payload()))
        subscriberMap.set(
          key,
          createSubscriber((update) =>
            $effect.root(() => {
              $effect(() => (setValue(payload()), update()));
            }),
          ),
        );
      return () => flushSync();
    },
  );

  const given: Harness["given"] = async (...keys) => {
    const resolved = await Promise.race([
      Promise.all(keys.map((k) => retrieve(deferredMap, k as string).promise)),
      abort.until,
    ]);
    abort.tryError();
    if (Array.isArray(resolved))
      return resolved.reduce(
        (acc, curr, index) => {
          (acc as any)[keys[index]] = curr;
          return acc;
        },
        {} as Pick<T, (typeof keys)[number]>,
      );
  };

  const preventRender: Harness["preventRender"] = abort.wrap(() => {
    errorIfRendered(rendered);
    prevented = true;
    const render = abort.wrap(() => (prevented = false));
    return render;
  });

  const { controller, signal, on: onAbort } = abort;

  onMount(async () => {
    if (!root) throw new Error("Root element not found");
    const capture = createCapturer(root);
    const harness: TestHarness<T> = abort.proxy({
      ...test,
      root,
      signal,
      set,
      given,
      preventRender,
      capture,
      onAbort,
      untilNextFrame,
    });

    gate = queue.add(mode, () => {
      const complete = begin(() => controller.abort("Test has been aborted"));
      const exit = () => {
        deferredMap.clear();
        subscriberMap.clear();
        complete();
      };
      return body(harness)
        .then(exit)
        .catch((e) => {
          if (e instanceof TestAborted) return exit();
          console.error(e); // do something with the error
          throw e;
        });
    });

    queue.open();
  });
</script>

<div bind:this={root}>
  {#if root && gate}
    {#await gate then}
      {#if !prevented}
        {@render vest(pocket)}
        {void (rendered = true)}
      {/if}
    {/await}
  {/if}
</div>
