import { mount } from "svelte";
import Test from "./Component.test.svelte";

const app = mount(Test, {
  target: document.getElementById("app")!,
});

export default app;
