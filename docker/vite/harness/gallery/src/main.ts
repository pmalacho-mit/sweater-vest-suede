import { mount } from "svelte";
import Gallery from "./release/vite/Gallery.svelte";

const app = mount(Gallery, {
  target: document.getElementById("app")!,
  props: {
    glob: import.meta.glob("/<folder>/**/*.test.svelte"),
  },
});

export default app;
