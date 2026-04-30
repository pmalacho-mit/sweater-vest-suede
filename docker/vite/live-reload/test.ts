import { describe, test, expect } from "vitest";
import { sessionSuite, poll } from "../common";
import "./release/globals.d.ts";

describe("live-reload", { concurrent: false }, async () => {
  const selectAllButtons = () =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent?.trim())
      .join(",");

  const getLoadedAt = () => document.querySelector("#loaded-at")?.textContent;

  const { open, config } = sessionSuite(import.meta.dirname);

  test("Editing Component.svelte triggers page reload", async () => {
    const { evaluate, expectNoConsoleErrors, tabIndex } = await open();

    const loadedAt = await evaluate(getLoadedAt);
    expect(loadedAt).toBeDefined();

    await poll(
      async () => {
        try {
          const result = await evaluate(selectAllButtons);
          if (!result) return false;
          return (
            result.includes("clicks: 3") &&
            result.includes("clicks: 4") &&
            result.includes("clicks: 5") &&
            result.includes("clicks: 6")
          );
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    );

    await expectNoConsoleErrors();
  }, 90_000);
});
