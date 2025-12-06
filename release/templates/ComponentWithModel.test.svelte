<script lang="ts">
  import { Sweater } from "_sweater-vest-suede";
  import Component, { Model } from "_.svelte";
</script>

<Sweater
  body={async ({ set }) => {
    const model = new Model();
    set({ model });
  }}
>
  {#snippet vest({ model }: { model: Model })}
    <Component {model} />
  {/snippet}
</Sweater>
