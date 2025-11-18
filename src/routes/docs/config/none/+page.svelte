<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Test 1 (Default Group)...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Test 2 (Default Group)...
  {/snippet}
</Sweater>
