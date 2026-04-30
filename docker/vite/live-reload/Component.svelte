<script lang="ts" module>
  export type Props = {
    count?: number;
  };

  let y = "<EDIT TARGET>";
</script>

<script lang="ts">
  let { count = $bindable(0) }: Props = $props();
</script>

<button onclick={() => (count = count + 1)}>
  clicks: {count}
</button>
