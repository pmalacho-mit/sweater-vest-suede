<script lang="ts">
  import { Sweater } from "$release";

  class Pocket {}
</script>

<!-- Test 1: straightforward pass -->
<Sweater
  name="passes"
  body={async ({ expect }) => {
    expect(1 + 1).toBe(2);
  }}
>
  {#snippet vest(p: Pocket)}
    <span>passing content</span>
  {/snippet}
</Sweater>

<!-- Test 2: intentional failure — exercises error recording -->
<Sweater
  name="fails"
  body={async ({ expect }) => {
    expect("actual").toBe("expected");
  }}
>
  {#snippet vest(p: Pocket)}
    <span>failing content</span>
  {/snippet}
</Sweater>

<!-- Test 3: capture + note — exercises both reporting paths -->
<Sweater
  name="captures"
  body={async (harness) => {
    harness.note("before screenshot");
    const { uri } = harness.capture("png");
    await uri;
    harness.note("after screenshot");
    harness.expect(true).toBe(true);
  }}
>
  {#snippet vest(p: Pocket)}
    <span style="padding: 8px; background: #e0f0ff;">capture me</span>
  {/snippet}
</Sweater>
