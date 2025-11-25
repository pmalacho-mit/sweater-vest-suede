<script lang="ts">
  import { Sweater } from "$release";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Defaul Group, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Defaul Group, Test 2...
  {/snippet}
</Sweater>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Nested Group, Test 1...
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Nested Group, Test 2...
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config />

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Sequential Group, Test 1...
  {/snippet}
</Sweater>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Sequential Group, Test 2...
  {/snippet}
</Sweater>
