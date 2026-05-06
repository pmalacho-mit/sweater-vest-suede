import type { SearchParam, Event } from "./report";
import { createCapturer as rawCreateCapturer } from "./utils/capture";

export const param = (key: SearchParam, url?: URL) =>
  (url ?? new URL(window.location.href)).searchParams.get(key) ?? undefined;

export const server = (url?: URL) => param("reportServer", url);

export const tryPost = (event: Event.Any, url?: URL | string) => {
  const endpoint = url
    ? typeof url === "string"
      ? url
      : server(url)
    : undefined;
  if (!endpoint) return;
  fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {});
};

export const suiteReady = (totalTests: number) => {
  const url = new URL(window.location.href);
  tryPost(
    {
      type: "suite-ready",
      totalTests,
      component: param("component", url),
    },
    url,
  );
};

export const reportables = () => {
  const url = new URL(window.location.href);
  const endpoint = server(url);

  if (!endpoint)
    return {
      createCapturer: rawCreateCapturer,
      note: (_: string) => {}, // no-op
    };

  const pendingCaptures = new Array<
    Promise<{ type: string; dataUri: string }>
  >();

  const createCapturer: typeof rawCreateCapturer = (container) => {
    const rawCapture = rawCreateCapturer(container);

    const reportable = (() => {
      type Type = Parameters<typeof rawCapture>[0];
      const reportable = ["png", "jpeg", "svg"] as const satisfies Type[];
      type Reportable = (typeof reportable)[number];
      type Captured<T extends Type = Type> = ReturnType<typeof rawCapture<T>>;
      return (type: Type, _: Captured): _ is Captured<Reportable> =>
        (reportable as Type[]).includes(type);
    })();

    return (type, options) => {
      const captured = rawCapture(type, options);
      if (reportable(type, captured))
        pendingCaptures.push(
          captured.uri.then((dataUri) => ({ type, dataUri })),
        );
      return captured;
    };
  };

  const notes: string[] = [];
  const note = (text: string) => notes.push(text);

  const component = param("component", url);

  const complete = async (startedAt: number, name?: string, id?: string) =>
    tryPost(
      {
        type: "test-complete",
        name,
        id,
        component,
        status: "passed",
        durationMs: Date.now() - startedAt,
        captures: await Promise.all(pendingCaptures),
        notes,
      },
      endpoint,
    );

  const fail = async (
    startedAt: number,
    error?: any,
    name?: string,
    id?: string,
  ) =>
    tryPost(
      {
        type: "test-complete",
        name,
        id,
        component,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: {
          message: error?.message,
          stack: error?.stack,
          matcherResult: error?.matcherResult,
        },
        captures: await Promise.all(pendingCaptures),
        notes,
      },
      endpoint,
    );

  const testFilterSource = param("testFilter", url);
  const testFilter = testFilterSource
    ? new RegExp(testFilterSource, "i")
    : undefined;

  const skip = (name?: string, id?: string) => {
    const testIdentifier = name ?? id;
    const skipped =
      testFilter && testIdentifier && !testFilter.test(testIdentifier);
    if (skipped)
      tryPost({ type: "test-skipped", name, id, component }, endpoint);
    return Boolean(skipped);
  };

  return {
    createCapturer,
    note,
    complete,
    fail,
    /**
     * Returns `true` if the test with the given `name` or `id` should be skipped based on the `testFilter`
     */
    skip,
  };
};
