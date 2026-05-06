<script lang="ts">
  import Sweater from "./release";
  import Component from "./Component.svelte";
</script>

<Sweater
  body={async ({ set }) => {
    set({ text: "A" });
  }}
>
  {#snippet vest(pocket: { text: string })}
    <Component {...pocket} />
  {/snippet}
</Sweater>
