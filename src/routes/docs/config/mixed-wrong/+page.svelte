<script lang="ts">
  import { Sweater } from "$release";

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

<!-- 
This test can't be associated with a config and is therefore "danling".
This will cause your test to error out or not load at all.
-->
<Sweater body={async (harness) => {}}>
  {#snippet vest(pocket: Pocket)}
    !!!DANGLING TEST!!!
  {/snippet}
</Sweater>
