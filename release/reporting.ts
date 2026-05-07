import type { SearchParam, Event } from "./report";
import { createCapturer as rawCreateCapturer } from "./utils/capture.js";
import type { Props as RunnerProps, Container } from "./Runner.svelte";

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

type TestSignature = Pick<RunnerProps, "name" | "id"> & {
  index: number;
  container: Container;
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

  const complete = async (startedAt: number, signature: TestSignature) =>
    tryPost(
      {
        ...signature,
        type: "test-complete",
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
    signature: TestSignature,
    error?: any,
  ) =>
    tryPost(
      {
        ...signature,
        type: "test-complete",
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

  const skip = ({ name, id, index, container }: TestSignature) => {
    const testIdentifier = name ?? id;
    // A test is skipped when testFilter is set and neither its name/id
    // nor its container's category matches the pattern.
    const skipped =
      testFilter &&
      !(testIdentifier && testFilter.test(testIdentifier)) &&
      !(container.category && testFilter.test(container.category));
    if (skipped)
      tryPost(
        { type: "test-skipped", name, id, index, container, component },
        endpoint,
      );
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
