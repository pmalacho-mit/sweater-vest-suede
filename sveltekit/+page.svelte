<script lang="ts">
  export const routes = Object.keys(
    import.meta.glob("/src/lib/**/*.test.svelte"),
  ).map((path) => ({
    href: "./tests" + (path.startsWith("/") ? path : "/" + path),
    display: path.replace("/src/lib/", ""),
  }));
</script>

<h1>Tests</h1>

<ul>
  {#each routes as route}
    <li>
      <a href={route.href}>
        {route.display}
      </a>
    </li>
  {/each}
</ul>
