import type { ReportInput } from "./html.ts";
import type { TestResult } from "./events.ts";

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n}ms`);

const firstErrorLine = (error: NonNullable<TestResult["error"]>): string => {
  const line = error.message.split("\n")[0] ?? "";
  return line.length > 120 ? line.slice(0, 120) + "…" : line;
};

/**
 * Writes a Vitest-style summary to `write` (defaults to process.stdout).
 * Accepts a `write` override so the function can be tested without monkey-patching stdout.
 */
export const printReport = (
  input: ReportInput,
  options?: { outputPath?: string; write?: (s: string) => void },
): void => {
  const write = options?.write ?? process.stdout.write.bind(process.stdout);
  const tty = !options?.write && process.stdout.isTTY;

  const green = (s: string) => (tty ? `\x1b[32m${s}\x1b[0m` : s);
  const red = (s: string) => (tty ? `\x1b[31m${s}\x1b[0m` : s);
  const yellow = (s: string) => (tty ? `\x1b[33m${s}\x1b[0m` : s);
  const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[0m` : s);
  const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[0m` : s);

  const divider = dim("─".repeat(45));

  write(`\n${bold("sweater-vest report")}\n`);
  write(`${divider}\n`);

  // Group entries by browser so multi-browser runs print browser headers.
  const byBrowser = input.browsers.reduce<Record<string, ReportInput["browsers"]>>(
    (acc, entry) => {
      (acc[entry.kind] ??= []).push(entry);
      return acc;
    },
    {},
  );

  const multipleBrowsers = Object.keys(byBrowser).length > 1;

  for (const [browser, entries] of Object.entries(byBrowser)) {
    if (multipleBrowsers) write(`\n${bold(browser)}\n`);

    for (const entry of entries) {
      const label =
        entry.componentPath
          ?.replace(/^\/+/, "")
          .replace(/^(src|lib|packages\/[^/]+\/src)\//, "")
          .replace(/\.test\.svelte$/, "")
          .replace(/\.svelte$/, "") ?? entry.kind;

      const passed = entry.results.filter((r) => r.status === "passed").length;
      const failed = entry.results.filter((r) => r.status === "failed").length;
      const skipped = entry.results.filter((r) => r.status === "skipped").length;
      const total = entry.results.length;
      const totalMs = entry.results.reduce((s, r) => s + r.durationMs, 0);

      // Build a breakdown string that omits zero-counts.
      const breakdown = [
        passed > 0 ? `${passed} passed` : "",
        failed > 0 ? `${failed} failed` : "",
        skipped > 0 ? `${skipped} skipped` : "",
        `${total} total`,
      ]
        .filter(Boolean)
        .join(", ");

      if (failed > 0) {
        write(` ${red("FAIL")}  ${label}   ${dim(`(${breakdown}, ${ms(totalMs)})`)}\n`);
        for (const r of entry.results.filter((r) => r.status === "failed")) {
          const testName = r.name ?? r.id ?? "(unnamed)";
          write(`       ${red("●")} ${testName}\n`);
          if (r.error) write(`         ${dim(firstErrorLine(r.error))}\n`);
        }
      } else if (skipped === total) {
        write(` ${yellow("SKIP")}  ${label}   ${dim(`(${total} tests skipped)`)}\n`);
      } else {
        write(` ${green("PASS")}  ${label}   ${dim(`(${breakdown}, ${ms(totalMs)})`)}\n`);
      }
    }
  }

  write(`${divider}\n`);

  const allResults = input.browsers.flatMap((b) => b.results);
  const totalPassed = allResults.filter((r) => r.status === "passed").length;
  const totalFailed = allResults.filter((r) => r.status === "failed").length;
  const totalSkipped = allResults.filter((r) => r.status === "skipped").length;
  const grandTotalMs = allResults.reduce((s, r) => s + r.durationMs, 0);

  const countParts = [
    totalPassed > 0 ? green(`${totalPassed} passed`) : "",
    totalFailed > 0 ? red(`${totalFailed} failed`) : "",
    totalSkipped > 0 ? yellow(`${totalSkipped} skipped`) : "",
    dim(`${allResults.length} total`),
  ].filter(Boolean);

  write(`Tests:  ${countParts.join(", ")}\n`);
  write(`Time:   ${ms(grandTotalMs)}\n`);
  if (options?.outputPath) write(`Report: ${options.outputPath}\n`);
  write("\n");
};
