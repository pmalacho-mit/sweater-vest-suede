<!-- pd: script -->
<script lang="ts">
  /** pd: import */
  import { Sweater } from "$release";
  /** pd: import */

  /* pd: model */
  class Pocket {
    /* pd: container */
    container = $state<HTMLDivElement>();
    /* pd: container */
    /* pd: value */
    value = $state("");
    /* pd: value */
  }
  /* pd: model */
</script>

<!-- pd: script component component-no-markup-open -->
<Sweater
  body={/* pd: body */ async (harness) => {
    /* pd: implementation */
    const { set, definition, expect } = harness;
    const pocket = set(new Pocket());
    pocket.value = "Hello, world!";
    // NOTE: rendering happens here (effectively whenever you call your first `await`)
    const { container } = await definition("container");
    expect(container.textContent).toBe("Hello, world!");
    /* pd: implementation */
    /* pd: body */
  }}
>
  <!-- pd: snippet -->
  {#snippet vest(
    /* pd: pocket */ pocket: /* pd: type */ Pocket /* pd: type */ /* pd: pocket */
  )}
    <!-- pd: markup component-no-markup-open -->
    <div bind:this={/* pd: bind */ pocket.container}>
      <!-- pd: bind -->
      <!-- pd: templated -->
      {pocket.value}
      <!-- pd: templated -->
    </div>
    <!-- pd: markup component-no-markup-close -->
  {/snippet}
  <!-- pd: snippet -->
</Sweater>
<!-- pd: component component-no-markup-close -->
