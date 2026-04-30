import { describe, test, expect } from "vitest";
import { sessionSuite, poll, catcher } from "../common";

type Variables = {
  editMarker?: string;
};

type VariableAssignment = `${string}.${keyof Variables} = ${string}`;

declare global {
  interface Window {
    __SWEATER_VEST_TEST__: Variables;
  }
}

describe("live-reload", { concurrent: true }, async () => {
  const { open, edit } = sessionSuite(import.meta.dirname);

  type Case = {
    file: string;
    handlers: (
      tab: Awaited<ReturnType<typeof open>>,
      marker: string,
    ) => {
      ready: () => Promise<boolean>;
      edit: () => Promise<any>;
      expectation: () => Promise<boolean>;
    };
  };

  /**
   * Leaf component: Vite+Svelte HMR patches it in-place — no full reload.
   * Change the button label to a unique marker so detection works even
   * without a page remount.
   */
  const componentUnderTest = (): Case => {
    const file = "Component.svelte" as const;
    return {
      file,
      handlers: (tab, marker) => {
        const buttons = () =>
          tab.evaluate(() =>
            [...document.querySelectorAll("button")]
              .map((b) => b.textContent)
              .join(),
          );

        const buttonsInclude = async (query: string) =>
          buttons().then((text) => text.includes(query));

        return {
          ready: () => buttonsInclude("clicks:"),
          edit: () =>
            edit(file, `s/clicks: {count}/clicks-${marker}: {count}/g`),
          expectation: () => buttonsInclude(`clicks-${marker}:`),
        };
      },
    };
  };

  /**
   * HMR remounts the whole component tree, so
   * Date.now() re-evaluates and #loaded-at gets a new value.
   * Replace Date.now() with a static marker string to detect the remount
   * without relying on timestamp comparison (avoids concurrent-test races).
   */
  const testComponent = (): Case => {
    const file = "Component.test.svelte" as const;

    return {
      file,
      handlers: (tab, marker) => {
        const loadedAt = () =>
          tab.evaluate(() => document.getElementById("loaded-at")?.textContent);

        return {
          ready: () => loadedAt().then(Boolean),
          edit: () => edit(file, `s/{Date.now()}/{"loaded:${marker}"}/`),
          expectation: () =>
            loadedAt().then((text) => text === `loaded:${marker}`),
        };
      },
    };
  };

  /**
   * Shared framework component: changing it likely triggers HMR that
   * re-executes the module script. We append a property onto the existing
   * __SWEATER_VEST__ window object — which persists across ??= reinit —
   * and poll for it to appear.
   */
  const frameworkComponent = (): Case => {
    const file = "release/Sweater.svelte" as const;
    const key = "editMarker" as const;
    return {
      file,
      handlers: (tab, marker) => ({
        ready: () =>
          tab.evaluate(() => window["__SWEATER_VEST__"]?.counts !== undefined),
        edit: () =>
          edit(
            file,
            `s/window\\["__SWEATER_VEST__"\\]\\.counts = counts;/window\\["__SWEATER_VEST_TEST__"\\]\\.editMarker = "${marker}";/` as const satisfies VariableAssignment,
          ),
        expectation: () =>
          tab
            .evaluate(() => window["__SWEATER_VEST_TEST__"]?.editMarker)
            .then((value) => value === marker),
      }),
    };
  };

  for (const { file, handlers } of [
    componentUnderTest(),
    testComponent(),
    frameworkComponent(),
  ]) {
    test(`Editing ${file} triggers live reload`, async () => {
      const tab = await open();
      const marker = String(Date.now());
      const { ready, edit, expectation } = handlers(tab, marker);
      await poll(catcher(ready), 30_000);
      await edit();
      await expect(poll(catcher(expectation), 30_000)).resolves.not.toThrow();
    }, 90_000);
  }
});
