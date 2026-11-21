import { studioBrushFramePercentile } from "../studio-brush-frame-budget-policy";

interface ScriptPage { evaluate(source: string): Promise<unknown> }
export type StudioSoakPointerMode = "mouse" | "pen" | "touch";
export interface StudioSoakPointerLatencyEvent {
  readonly observedAtMs: number;
  readonly nextRafAtMs: number;
  readonly latencyMs: number;
}
export interface StudioSoakPointerLatency {
  readonly sessionId: string;
  readonly cycle: number;
  readonly pageEpoch: number;
  readonly documentUrl: string;
  readonly inputMode: StudioSoakPointerMode;
  readonly expectedMoves: number;
  readonly observedMoves: number;
  readonly observedPointerTypes: readonly string[];
  readonly pointerDownAtMs: number | null;
  readonly pointerUpAtMs: number | null;
  readonly cancelled: boolean;
  readonly pendingMoves: number;
  readonly events: readonly StudioSoakPointerLatencyEvent[];
  readonly errors: readonly string[];
}
interface ProbeIdentity {
  readonly sessionId: string;
  readonly cycle: number;
  readonly inputMode: StudioSoakPointerMode;
  readonly expectedMoves: number;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value: unknown): value is number => nonnegative(value) && Number.isSafeInteger(value);

/** 기존 입력만 관측한다. 합성 입력·픽셀 읽기·microtask append 추정은 수행하지 않는다. */
export async function armStudioSoakPointerLatency(page: ScriptPage, identity: ProbeIdentity): Promise<void> {
  if (!identity.sessionId || !count(identity.cycle) || identity.cycle < 1
    || !count(identity.expectedMoves) || identity.expectedMoves < 1 || identity.expectedMoves > 240
    || !["mouse", "pen", "touch"].includes(identity.inputMode)) {
    throw new Error("소크 입력 지연의 세션·획·입력 수가 올바르지 않습니다.");
  }
  await page.evaluate(`(() => {
    const identity = ${JSON.stringify(identity)};
    const telemetry = window.__studioFiveHourTelemetry;
    if (!telemetry || telemetry.sessionId !== identity.sessionId || telemetry.pageEpoch !== performance.timeOrigin) {
      throw new Error("같은 페이지의 소크 세션 계측이 필요합니다.");
    }
    if (window.__studioSoakPointerLatency) throw new Error("소크 입력 지연 관측이 중첩되었습니다.");
    const stage = document.querySelector(".konvajs-content");
    if (!stage) throw new Error("소크 입력 지연의 실제 캔버스가 없습니다.");
    const state = { ...identity, pageEpoch: performance.timeOrigin, documentUrl: location.href,
      observedMoves: 0, observedPointerTypes: [], pointerDownAtMs: null, pointerUpAtMs: null,
      cancelled: false, pendingMoves: 0, events: [], errors: [] };
    let pointerId = null, raf = null;
    const pending = [];
    const error = (code) => { if (!state.errors.includes(code)) state.errors.push(code); };
    const checkEvent = (event) => {
      if (!state.observedPointerTypes.includes(event.pointerType)) {
        if (state.observedPointerTypes.length < 4) state.observedPointerTypes.push(event.pointerType);
        else error("pointer-type-overflow");
      }
      if (event.pointerType !== identity.inputMode) error("pointer-type");
      if (event.isTrusted !== true) error("untrusted-event");
    };
    const tick = () => {
      raf = null;
      const nextRafAtMs = performance.now();
      for (const observedAtMs of pending.splice(0)) {
        state.events.push({ observedAtMs, nextRafAtMs, latencyMs: nextRafAtMs - observedAtMs });
      }
    };
    const down = (event) => {
      if (!stage.contains(event.target)) return;
      if (state.pointerDownAtMs !== null) { error("duplicate-pointerdown"); return; }
      checkEvent(event); pointerId = event.pointerId; state.pointerDownAtMs = performance.now();
    };
    const move = (event) => {
      if (state.pointerDownAtMs === null || state.pointerUpAtMs !== null) return;
      if (event.pointerId !== pointerId) { error("pointer-id"); return; }
      checkEvent(event); state.observedMoves += 1;
      if (state.observedMoves > identity.expectedMoves) { error("move-overflow"); return; }
      pending.push(performance.now());
      if (raf === null) raf = requestAnimationFrame(tick);
    };
    const up = (event) => {
      if (state.pointerDownAtMs === null || state.pointerUpAtMs !== null) return;
      if (event.pointerId !== pointerId) { error("pointer-id"); return; }
      checkEvent(event); state.pointerUpAtMs = performance.now();
      if (event.type === "pointercancel") { state.cancelled = true; error("pointer-cancelled"); }
    };
    const bindings = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]];
    for (const [name, listener] of bindings) window.addEventListener(name, listener, { capture: true, passive: true });
    window.__studioSoakPointerLatency = {
      take() {
        state.pendingMoves = pending.length;
        if (performance.timeOrigin !== state.pageEpoch || location.href !== state.documentUrl) error("page-changed");
        return state;
      },
      dispose() {
        if (raf !== null) cancelAnimationFrame(raf);
        for (const [name, listener] of bindings) window.removeEventListener(name, listener, true);
        pending.length = 0;
      }
    };
  })()`);
}

/** 드레인은 RAF를 강제로 만들어 누락을 숨기지 않고, 성공·실패 모두 관측기를 해제한다. */
export async function drainStudioSoakPointerLatency(page: ScriptPage): Promise<StudioSoakPointerLatency> {
  const raw = await page.evaluate(`(() => {
    const probe = window.__studioSoakPointerLatency;
    if (!probe) throw new Error("소크 입력 지연 관측기가 사라졌습니다.");
    try { return probe.take(); }
    finally { probe.dispose(); delete window.__studioSoakPointerLatency; }
  })()`);
  if (!isStudioSoakPointerLatency(raw)) throw new Error("소크 입력 지연의 원시 표본이 올바르지 않습니다.");
  return raw;
}

function isStudioSoakPointerLatency(value: unknown): value is StudioSoakPointerLatency {
  return record(value) && typeof value.sessionId === "string" && count(value.cycle) && value.cycle > 0
    && nonnegative(value.pageEpoch) && typeof value.documentUrl === "string" && value.documentUrl.length > 0
    && typeof value.inputMode === "string" && ["mouse", "pen", "touch"].includes(value.inputMode)
    && count(value.expectedMoves) && value.expectedMoves > 0 && value.expectedMoves <= 240
    && count(value.observedMoves) && count(value.pendingMoves) && typeof value.cancelled === "boolean"
    && (value.pointerDownAtMs === null || nonnegative(value.pointerDownAtMs))
    && (value.pointerUpAtMs === null || nonnegative(value.pointerUpAtMs))
    && Array.isArray(value.observedPointerTypes) && value.observedPointerTypes.every((mode) => typeof mode === "string")
    && Array.isArray(value.errors) && value.errors.every((error) => typeof error === "string")
    && Array.isArray(value.events) && value.events.length <= value.expectedMoves
    && value.events.every((event: unknown) => record(event) && nonnegative(event.observedAtMs)
      && nonnegative(event.nextRafAtMs) && nonnegative(event.latencyMs)
      && Math.abs(event.nextRafAtMs - event.observedAtMs - event.latencyMs) < 0.001);
}

export function studioSoakPointerLatencyIssues(sample: StudioSoakPointerLatency): string[] {
  const issues = [...sample.errors];
  if (sample.pointerDownAtMs === null || sample.pointerUpAtMs === null
    || sample.pointerUpAtMs < sample.pointerDownAtMs) issues.push("stroke-boundary");
  if (sample.cancelled) issues.push("pointer-cancelled");
  if (sample.observedPointerTypes.length !== 1 || sample.observedPointerTypes[0] !== sample.inputMode) issues.push("pointer-type");
  if (sample.pendingMoves !== 0 || sample.observedMoves !== sample.expectedMoves
    || sample.events.length !== sample.expectedMoves) issues.push("move-coverage");
  if (sample.events.some((event, index) => sample.pointerDownAtMs === null || sample.pointerUpAtMs === null
    || event.observedAtMs < sample.pointerDownAtMs || event.observedAtMs > sample.pointerUpAtMs
    || (index > 0 && event.observedAtMs < sample.events[index - 1]!.observedAtMs))) issues.push("event-order");
  return [...new Set(issues)];
}

export interface StudioSoakPointerLatencyStroke {
  readonly cycle?: number;
  readonly brushId?: string | null;
  readonly inputMode?: StudioSoakPointerMode;
  readonly pointerPoints?: number;
  readonly pointerLatency?: StudioSoakPointerLatency | null;
}

/** 기존 정상 cycle 하나로 요청 시간 이후 같은 페이지의 입력을 증명한다. */
export function shouldRunStudioSoakCycle(now: number, deadline: number, measureLatency: boolean, terminalAttempted: boolean): boolean {
  return now < deadline || (measureLatency && !terminalAttempted);
}

export function summarizeStudioSoakPointerLatency(input: {
  requested: boolean;
  sessionId?: string;
  sessionStartedAt?: number | null;
  requestedDurationMs: number;
  pageEpochs: readonly number[];
  attemptedStrokes: number;
  strokes: readonly StudioSoakPointerLatencyStroke[];
}) {
  const windowMs = 10 * 60_000;
  const issues: string[] = [];
  const windows = new Map<number, { events: number[]; ages: number[]; cycles: Set<number>; brushes: Set<string> }>();
  const cycles = new Set<number>(), urls = new Set<string>();
  let measuredStrokes = 0, lastStrokeAgeMs: number | null = null, lastInputAgeMs: number | null = null;
  if (input.requested) {
    if (!input.sessionId || !nonnegative(input.sessionStartedAt) || input.pageEpochs.length !== 1) issues.push("session-identity");
    for (const stroke of input.strokes) {
      const sample = stroke.pointerLatency;
      if (!isStudioSoakPointerLatency(sample)) { issues.push("missing-or-invalid-stroke:" + String(stroke.cycle)); continue; }
      const errors = studioSoakPointerLatencyIssues(sample);
      if (sample.sessionId !== input.sessionId || sample.pageEpoch !== input.pageEpochs[0]
        || sample.cycle !== stroke.cycle || cycles.has(sample.cycle)) errors.push("session-cycle");
      if (sample.inputMode !== stroke.inputMode || sample.expectedMoves !== (stroke.pointerPoints ?? 0) - 1) errors.push("input-identity");
      cycles.add(sample.cycle); urls.add(sample.documentUrl);
      if (errors.length > 0 || !nonnegative(input.sessionStartedAt)) {
        issues.push(...errors.map((error) => sample.cycle + ":" + error)); continue;
      }
      const strokeAge = sample.pageEpoch + sample.pointerDownAtMs! - input.sessionStartedAt;
      if (strokeAge < 0) { issues.push(sample.cycle + ":negative-age"); continue; }
      measuredStrokes += 1;
      lastStrokeAgeMs = Math.max(lastStrokeAgeMs ?? 0, strokeAge);
      for (const event of sample.events) {
        const age = sample.pageEpoch + event.observedAtMs - input.sessionStartedAt;
        const start = Math.floor(age / windowMs) * windowMs;
        const window = windows.get(start) ?? { events: [], ages: [], cycles: new Set<number>(), brushes: new Set<string>() };
        window.events.push(event.latencyMs); window.ages.push(age); window.cycles.add(sample.cycle);
        if (stroke.brushId) window.brushes.add(stroke.brushId);
        windows.set(start, window); lastInputAgeMs = Math.max(lastInputAgeMs ?? 0, age);
      }
    }
    if (urls.size !== 1) issues.push("document-url");
    if (measuredStrokes !== input.attemptedStrokes || measuredStrokes === 0) issues.push("stroke-coverage");
    if (lastStrokeAgeMs === null || lastStrokeAgeMs < input.requestedDurationMs) issues.push("terminal-stroke-age");
    for (let start = 0; start <= input.requestedDurationMs; start += windowMs) {
      if (!windows.has(start)) issues.push("age-window:" + start);
    }
  }
  return {
    requested: input.requested, measured: input.requested && issues.length === 0,
    metric: "pointermove-capture-to-next-raf" as const,
    physicalDeviceCertified: false, pixelPresentationMeasured: false, appendCompletionMeasured: false,
    windowMs, measuredStrokes, expectedStrokes: input.attemptedStrokes,
    lastStrokeAgeMs, lastInputAgeMs, issues: [...new Set(issues)],
    windows: [...windows].sort(([left], [right]) => left - right).map(([start, window]) => ({
      startAgeMs: start, endAgeMs: start + windowMs,
      firstInputAgeMs: Math.min(...window.ages), lastInputAgeMs: Math.max(...window.ages),
      sampleCount: window.events.length, strokeCount: window.cycles.size, brushIds: [...window.brushes].sort(),
      p50Ms: studioBrushFramePercentile(window.events, 0.5), p95Ms: studioBrushFramePercentile(window.events, 0.95),
      p99Ms: studioBrushFramePercentile(window.events, 0.99), maxMs: Math.max(...window.events),
    })),
  };
}
