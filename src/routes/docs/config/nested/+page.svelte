<script lang="ts">
  import { Sweater } from /** pkg */ "$lib/index.js" /** pkg */;
</script>

<Sweater config>
  <Sweater name="Test 1" body={async (harness) => {}}>
    {#snippet vest(pocket: {})}{/snippet}
  </Sweater>
  <Sweater name="Test 2" body={async (harness) => {}}>
    {#snippet vest(pocket: {})}{/snippet}
  </Sweater>
</Sweater>
