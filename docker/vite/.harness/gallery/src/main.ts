import { mount } from "svelte";
import Gallery from "./release/vite/Closet.svelte";

const app = mount(Gallery, {
  target: document.getElementById("app")!,
  props: {
    glob: import.meta.glob("/src/**/*.test.svelte"),
  },
});

export default app;
