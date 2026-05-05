import type { TestResult } from "./events.ts";

export type ReportInput = {
  generatedAt: string;
  galleryUrl: string;
  browsers: Array<{
    kind: string;
    componentPath?: string;
    results: TestResult[];
  }>;
};

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const badge = (status: TestResult["status"]) => {
  const styles: Record<TestResult["status"], string> = {
    passed: "background:#22c55e;color:#fff",
    failed: "background:#ef4444;color:#fff",
    skipped: "background:#a3a3a3;color:#fff",
  };
  return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:11px;font-weight:600;font-family:monospace;${styles[status]}">${status}</span>`;
};

const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${n}ms`);

const renderCaptures = (captures: TestResult["captures"]) =>
  captures
    .map(
      (c) =>
        `<img src="${c.dataUri}" alt="capture (${escape(c.type)})" style="max-width:100%;border:1px solid #e5e7eb;border-radius:4px;display:block;margin-top:8px">`,
    )
    .join("\n");

const renderNotes = (notes: string[]) =>
  notes.length === 0
    ? ""
    : `<ol style="margin:8px 0 0;padding-left:20px;color:#4b5563;font-size:13px">
${notes.map((n) => `  <li>${escape(n)}</li>`).join("\n")}
</ol>`;

const renderError = (error: NonNullable<TestResult["error"]>) => {
  const matcher =
    error.matcherResult != null
      ? `<pre style="margin:6px 0 0;padding:8px;background:#fef2f2;border-radius:4px;font-size:12px;overflow-x:auto;white-space:pre-wrap">${escape(JSON.stringify(error.matcherResult, null, 2))}</pre>`
      : "";
  const stack = error.stack
    ? `<pre style="margin:6px 0 0;padding:8px;background:#f9fafb;border-radius:4px;font-size:11px;overflow-x:auto;white-space:pre-wrap;color:#6b7280">${escape(error.stack)}</pre>`
    : "";
  return `<details style="margin-top:8px">
  <summary style="cursor:pointer;font-size:13px;color:#ef4444;font-weight:500">${escape(error.message)}</summary>
  ${matcher}${stack}
</details>`;
};

const renderTest = (result: TestResult) => {
  const title = result.name ?? result.id ?? "(unnamed)";
  return `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin-bottom:8px">
  <div style="display:flex;align-items:center;gap:10px">
    ${badge(result.status)}
    <span style="font-weight:500;font-size:14px">${escape(title)}</span>
    <span style="margin-left:auto;color:#9ca3af;font-size:12px">${ms(result.durationMs)}</span>
  </div>
  ${result.error ? renderError(result.error) : ""}
  ${renderNotes(result.notes)}
  ${renderCaptures(result.captures)}
</div>`;
};

// Derive a readable label from a component path, stripping common prefixes
// and the .test.svelte suffix. Falls back to the basename if no known prefix matched.
const componentLabel = (componentPath: string): string => {
  // Strip leading /src/, /lib/, /packages/<name>/src/, etc. up to the first
  // directory that looks like actual content (not a build artifact path).
  const withoutPrefix = componentPath
    .replace(/^\/+/, "")
    .replace(/^(src|lib|packages\/[^/]+\/src)\//, "");
  return withoutPrefix.replace(/\.test\.svelte$/, "").replace(/\.svelte$/, "");
};

const renderComponent = (entry: ReportInput["browsers"][number]) => {
  const label = entry.componentPath ? componentLabel(entry.componentPath) : entry.kind;

  const passed = entry.results.filter((r) => r.status === "passed").length;
  const failed = entry.results.filter((r) => r.status === "failed").length;
  const skipped = entry.results.filter((r) => r.status === "skipped").length;
  const totalMs = entry.results.reduce((s, r) => s + r.durationMs, 0);

  const summaryParts = [
    passed > 0 ? `<span style="color:#22c55e">${passed} passed</span>` : "",
    failed > 0 ? `<span style="color:#ef4444">${failed} failed</span>` : "",
    skipped > 0 ? `<span style="color:#a3a3a3">${skipped} skipped</span>` : "",
  ].filter(Boolean);

  return `<section style="margin-bottom:24px">
  <h2 style="font-size:15px;font-weight:600;margin:0 0 8px;display:flex;align-items:center;gap:8px">
    <code style="font-size:13px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${escape(label)}</code>
    <span style="font-size:12px;font-weight:400;color:#6b7280">${summaryParts.join(" · ")} · ${ms(totalMs)}</span>
  </h2>
  ${entry.results.map(renderTest).join("\n")}
</section>`;
};

/**
 * Renders a self-contained HTML report string from accumulated test results.
 * No side effects — pure function suitable for unit testing.
 */
export const renderReport = (input: ReportInput): string => {
  const allResults = input.browsers.flatMap((b) => b.results);

  if (allResults.length === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sweater Vest Report</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f9fafb; color: #111827; }
    .container { max-width: 860px; margin: 0 auto; padding: 32px 24px; }
  </style>
</head>
<body>
<div class="container">
  <header style="margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #e5e7eb">
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700">Sweater Vest Report</h1>
    <p style="color:#6b7280;margin:0">No tests were run.</p>
  </header>
</div>
</body>
</html>`;
  }

  const totalPassed = allResults.filter((r) => r.status === "passed").length;
  const totalFailed = allResults.filter((r) => r.status === "failed").length;
  const totalSkipped = allResults.filter((r) => r.status === "skipped").length;
  const totalMs = allResults.reduce((s, r) => s + r.durationMs, 0);

  const summaryColor = totalFailed > 0 ? "#ef4444" : "#22c55e";
  const summaryLabel = totalFailed > 0 ? `${totalFailed} failed` : "all passed";

  const multipleBrowsers = new Set(input.browsers.map((b) => b.kind)).size > 1;

  const sections = multipleBrowsers
    ? Object.entries(
        input.browsers.reduce<Record<string, ReportInput["browsers"]>>((acc, entry) => {
          (acc[entry.kind] ??= []).push(entry);
          return acc;
        }, {}),
      )
        .map(
          ([kind, entries]) =>
            `<details open style="margin-bottom:32px">
  <summary style="cursor:pointer;font-size:16px;font-weight:700;margin-bottom:12px">${escape(kind)}</summary>
  ${entries.map(renderComponent).join("\n")}
</details>`,
        )
        .join("\n")
    : input.browsers.map(renderComponent).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sweater Vest Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f9fafb; color: #111827; }
    .container { max-width: 860px; margin: 0 auto; padding: 32px 24px; }
    summary::-webkit-details-marker { display: none; }
  </style>
</head>
<body>
<div class="container">
  <header style="margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #e5e7eb">
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700">Sweater Vest Report</h1>
    <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:14px">
      <span style="color:${summaryColor};font-weight:600">${summaryLabel}</span>
      ${totalPassed > 0 ? `<span style="color:#6b7280">${totalPassed} passed</span>` : ""}
      ${totalSkipped > 0 ? `<span style="color:#6b7280">${totalSkipped} skipped</span>` : ""}
      <span style="color:#6b7280">${allResults.length} total</span>
      <span style="color:#6b7280">${ms(totalMs)}</span>
      <span style="color:#9ca3af;margin-left:auto">${escape(input.generatedAt)}</span>
    </div>
  </header>
  <main>
    ${sections}
  </main>
  <footer style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">
    Generated from <a href="${escape(input.galleryUrl)}" style="color:#6b7280">${escape(input.galleryUrl)}</a>
  </footer>
</div>
</body>
</html>`;
};
