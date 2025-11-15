<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

{#await import(data.component) then { default: Component }}
  <Component />
{/await}
