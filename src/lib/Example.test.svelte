<script lang="ts">
  import { flushSync } from "svelte";
  import Sweater from "$release";
  import Example, { type Props } from "./Example.svelte";

  class Pocket implements Props {
    count = $state(0);
    div = $state<HTMLDivElement>();

    constructor(initial: number = 0) {
      this.count = initial;
    }
  }
</script>

<Sweater config orientation={"vertical"} />

{#each [0, 1, 2, 3] as testCase}
  <Sweater
    body={async ({ set, delay, expect, definition }) => {
      const pocket = set(new Pocket(testCase));
      const { div } = await definition("div");
      expect(div).toBeDefined();

      const iterations = 3;

      for (let i = 0; i < iterations; i++) {
        await delay({ seconds: 0.5 });
        pocket.count += 1;
      }

      flushSync();

      expect(div).toBe(pocket.div);

      const expected = testCase + iterations;
      expect(pocket.count).toBe(expected);
      expect(pocket.div!.textContent).toBe(`count is ${expected}`);
    }}
  >
    {#snippet vest(pocket: Pocket)}
      <Example bind:count={pocket.count} />
      <div bind:this={pocket.div}>count is {pocket.count}</div>
    {/snippet}
  </Sweater>
{/each}
