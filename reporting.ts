import type { SearchParam, Event } from "./report";
import { createCapturer as rawCreateCapturer } from "./utils/capture";

const param = (key: SearchParam, url?: URL) =>
  (url ?? new URL(window.location.href)).searchParams.get(key) ?? undefined;

export const suiteReady = (totalTests: number) => {
  const url = new URL(window.location.href);
  const reportServerUrl = param("reportServer", url);
  if (reportServerUrl)
    fetch(reportServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "suite-ready",
        totalTests,
        component: param("component", url),
      } satisfies Event.SuiteReady),
    }).catch(() => {});
};

export const reportables = () => {
  const url = new URL(window.location.href);
  const reportServerUrl = param("reportServer", url);

  if (!reportServerUrl)
    return {
      createCapturer: rawCreateCapturer,
      note: (_: string) => {},
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

  const send = (event: Event.Any) =>
    fetch(reportServerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => {});

  const component = param("component", url);

  const complete = async (startedAt: number, name?: string, id?: string) =>
    send({
      type: "test-complete",
      name,
      id,
      component,
      status: "passed",
      durationMs: Date.now() - startedAt,
      captures: await Promise.all(pendingCaptures),
      notes,
    });

  const fail = async (
    startedAt: number,
    error?: any,
    name?: string,
    id?: string,
  ) =>
    send({
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
    });

  const testFilterSource = param("testFilter", url);
  const testFilter = testFilterSource
    ? new RegExp(testFilterSource, "i")
    : undefined;

  /**
   * Skip tests that don't match the filter (name or id must be present to filter).
   * @param name
   * @param id
   * @returns
   */
  const skip = (name?: string, id?: string) => {
    const testIdentifier = name ?? id;
    const skipped =
      testFilter && testIdentifier && !testFilter.test(testIdentifier);
    if (skipped) send({ type: "test-skipped", name, id, component });
    return Boolean(skipped);
  };

  return {
    createCapturer,
    note,
    complete,
    fail,
    /** Skip tests that don't match the filter (name or id must be present to filter). */
    skip,
  };
};
