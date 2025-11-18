<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater config />

<Sweater name="Group 1, Test 1" body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}{/snippet}
</Sweater>

<Sweater name="Group 1, Test 2" body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}{/snippet}
</Sweater>

<Sweater config />

<Sweater name="Group 2, Test 1" body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}{/snippet}
</Sweater>

<Sweater name="Group 2, Test 2" body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}{/snippet}
</Sweater>
