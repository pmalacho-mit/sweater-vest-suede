import { mount } from "svelte";
import "./app.css";
import Gallery from "<path>/sweater-vest-suede/vite/Closet.svelte";

const app = mount(Gallery, {
  target: document.getElementById("app")!,
  props: {
    glob: import.meta.glob("/<folder>/**/*.test.svelte"),
  },
});

export default app;
