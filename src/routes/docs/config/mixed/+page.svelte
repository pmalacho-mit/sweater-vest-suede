<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Defaul Group, Test 1</div>
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Defaul Group, Test 2</div>
  {/snippet}
</Sweater>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Nested Group, Test 1</div>
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Nested Group, Test 2</div>
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config />

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Sequential Group, Test 1</div>
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    <div>Sequential Group, Test 2</div>
  {/snippet}
</Sweater>
