import { describe, test, expect } from "vitest";
import { singleSessionSuite, poll } from "../common";
import { container } from "./release/suede/programmatic-docker-suede";

describe("live-reload", { concurrent: false }, async () => {
  const selectAllButtons = () =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent?.trim())
      .join(",");

  const getLoadedAt = () => document.querySelector("#loaded-at")?.textContent;

  const { evaluate, expectNoConsoleErrors, config } = singleSessionSuite(
    import.meta.dirname,
  );

  test("Editing Component.svelte triggers page reload", async () => {
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

    // Search for 'Edit Target' and delete entire line.
    // NOTE: Removing just a comment does not trigger the reload.
    await container
      .exec(config.vite.container, [
        "sed",
        "-i",
        "/EDIT TARGET/d",
        "/app/src/Component.svelte",
      ])
      .complete();

    await poll(
      async () => {
        try {
          const newLoadedAt = await evaluate(getLoadedAt);
          return newLoadedAt !== undefined && newLoadedAt !== loadedAt;
        } catch {
          return false;
        }
      },
      { timeout: 30_000 },
    );

    // Verify the tests re-ran and passed after the live reload.
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
