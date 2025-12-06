<script lang="ts">
  import { Sweater } from "_sweater-vest-suede";
  import Component from "_.svelte";
</script>

<Sweater
  body={async ({ set }) => {
    set({});
  }}
>
  {#snippet vest(pocket: {})}
    <Component />
  {/snippet}
</Sweater>
