<script lang="ts">
  import { Sweater } from "_sweater-vest-suede";
  import Component from "_.svelte";

  class Pocket {
    container = $state<HTMLDivElement>();
  }
</script>

<Sweater
  body={async ({ set, definition }) => {
    const pocket = set(new Pocket());
    const { container } = await definition("container");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <div bind:this={pocket.container}>
      <Component />
    </div>
  {/snippet}
</Sweater>
