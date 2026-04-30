import { describe, test, expect } from "vitest";
import { sessionSuite, poll } from "../common";
import "./release/globals.d.ts";

describe("live-reload", { concurrent: false }, async () => {
  const selectAllButtons = () =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent?.trim())
      .join(",");

  const { open } = sessionSuite(import.meta.dirname);

  const filesUnderTest = [
    "Component.svelte",
    "Component.test.svelte",
    "release/Sweater.svelte",
  ].map((files) => `/app/src/${files}`);

  for (const file of filesUnderTest)
    test(`Editing ${file} triggers page reload?`, async () => {
      const { evaluate, expectNoConsoleErrors } = await open();

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
