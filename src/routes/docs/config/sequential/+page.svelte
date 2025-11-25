<script lang="ts">
  import { Sweater } from "$release";

  class Pocket {}
</script>

<Sweater config />

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 1, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 1, Test 2...
  {/snippet}
</Sweater>

<Sweater config />

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 2, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Group 2, Test 2...
  {/snippet}
</Sweater>
