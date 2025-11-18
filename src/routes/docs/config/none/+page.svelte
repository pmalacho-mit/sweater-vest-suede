<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Test 1 (Default Group)</div>
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Test 2 (Default Group)</div>
  {/snippet}
</Sweater>
