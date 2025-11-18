<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Group 1, Test 1</div>
  {/snippet}
</Sweater>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Group 2, Test 1</div>
    {/snippet}
  </Sweater>

  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Group 2, Test 2</div>
    {/snippet}
  </Sweater>
</Sweater>

<!-- This test is "dangling" and will cause issues -->
<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Group 3, Test 1</div>
  {/snippet}
</Sweater>
