<script lang="ts">
  import Sweater from "../../dist";
  import Example from "./Example.svelte";
</script>

<Sweater body={async () => {}}>
  {#snippet vest(pocket: {})}
    <Example />
  {/snippet}
</Sweater>
