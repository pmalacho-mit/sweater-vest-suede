<script lang="ts">
  import { Sweater } from "$dist";

  class Pocket {}
</script>

<Sweater config style="background-color: lightblue;">
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Group 1, Test 1 (nested)</div>
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Group 1, Test 2 (nested)</div>
    {/snippet}
  </Sweater>
</Sweater>

<Sweater config class="custom-config-class">
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Group 2, Test 1 (nested)</div>
    {/snippet}
  </Sweater>
  <Sweater body={async (harness) => {}}>
    {#snippet vest(pocket: Pocket)}
      <div>Group 2, Test 2 (nested)</div>
    {/snippet}
  </Sweater>
</Sweater>

<style>
  :global(.custom-config-class) {
    background-color: greenyellow;
  }
</style>
