<script lang="ts">
  import Closet from "$release/Closet.svelte";
</script>

<Closet glob={import.meta.glob("/src/lib/**/*.test.svelte")} />
