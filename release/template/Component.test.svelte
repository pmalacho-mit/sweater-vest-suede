<script lang="ts">
  import { Sweater } from "$sweater-vest-suede";
  import Component from ".svelte";
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
