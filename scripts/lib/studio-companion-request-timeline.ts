import type { Frame, Page, Request } from "playwright";

type RequestFact = Readonly<{
  id: number;
  url: string;
  method: string;
  resourceType: string;
  startedAtMs: number | null;
  error?: string;
}>;
type TimelineEvent = Readonly<{
  kind: "phase" | "request" | "requestfinished" | "requestfailed" | "navigation" | "close";
  atMs: number;
  phase: string;
  pageUrl: string;
  request?: RequestFact;
  frameUrl?: string;
}>;
export interface CompanionRequestTimeline {
  readonly startedAt: string;
  readonly maxEvents: number;
  readonly maxFailureEvents: number;
  droppedEvents: number;
  droppedFailureEvents: number;
  readonly events: TimelineEvent[];
  readonly failureEvents: TimelineEvent[];
}

function diagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    if (["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return `${url.protocol}//${url.host}${url.pathname}`;
    return url.protocol === "about:" ? `about:${url.pathname}` : `${url.protocol}[omitted]`;
  } catch {
    return "invalid-url";
  }
}

/** 관측만 수행한다. 최근 160개 이벤트와 최초 32개 실패를 보존하고 원래 오류 리스너·대기를 바꾸지 않는다. */
export function observeCompanionRequestTimeline(page: Page, initialPhase: string, now: () => number = Date.now) {
  const startedAt = now();
  let phase = initialPhase, nextId = 0;
  const requests = new WeakMap<Request, { id: number; startedAtMs: number | null }>();
  const timeline: CompanionRequestTimeline = {
    startedAt: new Date(startedAt).toISOString(), maxEvents: 160, maxFailureEvents: 32,
    droppedEvents: 0, droppedFailureEvents: 0, events: [], failureEvents: [],
  };
  const elapsed = () => Math.max(0, now() - startedAt);
  const append = (event: TimelineEvent) => {
    timeline.events.push(event);
    if (timeline.events.length > timeline.maxEvents) { timeline.events.shift(); timeline.droppedEvents += 1; }
    if (event.kind !== "requestfailed") return;
    if (timeline.failureEvents.length < timeline.maxFailureEvents) timeline.failureEvents.push(event);
    else timeline.droppedFailureEvents += 1;
  };
  const record = (kind: TimelineEvent["kind"], detail: Pick<TimelineEvent, "request" | "frameUrl"> = {}) => {
    append({ kind, atMs: elapsed(), phase, pageUrl: diagnosticUrl(page.url()), ...detail });
  };
  const requestEvent = (kind: "request" | "requestfinished" | "requestfailed", request: Request) => {
    let observed = requests.get(request);
    if (!observed) { observed = { id: ++nextId, startedAtMs: null }; requests.set(request, observed); }
    if (kind === "request") observed.startedAtMs = elapsed();
    record(kind, { request: {
      ...observed, url: diagnosticUrl(request.url()), method: request.method(), resourceType: request.resourceType(),
      ...(kind === "requestfailed" ? { error: request.failure()?.errorText ?? "unknown failure" } : {}),
    } });
  };
  const onRequest = (request: Request) => requestEvent("request", request);
  const onFinished = (request: Request) => requestEvent("requestfinished", request);
  const onFailed = (request: Request) => requestEvent("requestfailed", request);
  const onNavigation = (frame: Frame) => {
    if (frame === page.mainFrame()) record("navigation", { frameUrl: diagnosticUrl(frame.url()) });
  };
  const onClose = () => record("close");
  const markPhase = (next: string) => {
    if (!next.trim()) throw new Error("요청 관측 단계 이름이 비어 있습니다.");
    phase = next; record("phase");
  };
  page.on("request", onRequest); page.on("requestfinished", onFinished); page.on("requestfailed", onFailed);
  page.on("framenavigated", onNavigation); page.on("close", onClose);
  markPhase(initialPhase);
  return {
    timeline, markPhase,
    dispose() {
      page.off("request", onRequest); page.off("requestfinished", onFinished); page.off("requestfailed", onFailed);
      page.off("framenavigated", onNavigation); page.off("close", onClose);
    },
  };
}
