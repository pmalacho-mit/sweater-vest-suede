<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater config>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 1, Test 1 (nested)...
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 1, Test 2 (nested)...
    {/snippet}
  </Sweater>
</Sweater>

<Sweater
  config
  class="custom-config-class"
  style="background-color: lightblue;"
>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 2, Test 1 (nested)...
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      ...Group 2, Test 2 (nested)...
    {/snippet}
  </Sweater>
</Sweater>

<style>
  :global(.custom-config-class) {
    background-color: greenyellow;
  }
</style>
