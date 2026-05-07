import { mount } from "svelte";
import Closet from "./release/Closet.svelte";

const app = mount(Closet, {
  target: document.getElementById("app")!,
  props: {
    glob: import.meta.glob("/src/**/*.test.svelte"),
  },
});

export default app;
