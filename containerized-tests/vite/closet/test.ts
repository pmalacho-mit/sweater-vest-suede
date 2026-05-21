import { describe, test, expect } from "vitest";
import { sessionSuite, poll, catcher } from "../.harness/index.ts";

describe("gallery component", { concurrent: true }, () => {
  const { open } = sessionSuite(import.meta.dirname, "closet");

  const components = ["A", "B", "C"] as const;

  test("all links", async () => {
    const tab = await open();

    await expect(
      poll(
        () =>
          tab
            .evaluate(() =>
              [...document.querySelectorAll("button")]
                .map((button) => button.textContent?.trim() ?? "")
                .filter(Boolean),
            )
            .then((links) =>
              components.every((component) => links.includes(component)),
            ),
        30_000,
      ),
    ).resolves.not.toThrow();

    await tab.expectNoConsoleErrors();
  }, 90_000);

  for (const component of components)
    test(`Component test ${component}`, async () => {
      const tab = await open({ test: component });

      await expect(
        poll(
          () =>
            tab.evaluate(() => {
              const url = new URL(window.location.href);
              console.warn("Current URL:", url.href);
              const button = [...document.querySelectorAll("button")].find(
                (candidate) =>
                  candidate.textContent?.trim() ===
                  url.searchParams.get("test"),
              );

              if (!button) return false;

              button.dispatchEvent(
                new MouseEvent("click", {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                }),
              );
              return true;
            }),
          30_000,
        ),
      ).resolves.not.toThrow();

      await expect(
        poll(
          catcher(() =>
            tab
              .evaluate(() =>
                new URL(window.location.href).searchParams.get("component"),
              )
              .then((selected) =>
                Boolean(
                  selected &&
                  selected
                    .toLowerCase()
                    .includes(`${component.toLowerCase()}.test.svelte`),
                ),
              ),
          ),
          30_000,
        ),
      ).resolves.not.toThrow();

      await expect(
        poll(
          catcher(() =>
            tab
              .evaluate(() =>
                [...document.querySelectorAll("span")]
                  .map((span) => span.textContent?.trim() ?? "")
                  .filter(Boolean),
              )
              .then((values) => values.includes(component)),
          ),
          30_000,
        ),
      ).resolves.not.toThrow();

      await tab.expectNoConsoleErrors();
    }, 90_000);
});
