<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    ...Default Group Test...
  {/snippet}
</Sweater>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Nested Group Test...
    {/snippet}
  </Sweater>
</Sweater>

<!-- This test is "dangling" and will cause issues -->
<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    !!!DANGLING TEST!!!
  {/snippet}
</Sweater>
