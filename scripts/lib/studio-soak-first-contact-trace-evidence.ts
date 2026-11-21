import type { StudioFirstContactTraceIdentity, StudioFirstContactTraceMarker, StudioFirstContactTraceSnapshot } from "./studio-soak-first-contact-trace-probe";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown): value is number => nonnegative(value) && Number.isSafeInteger(value);
const PHASES = ["session-start", "pointerdown", "first-move", "first-raf", "pointerup", "session-end"];
function requireValue(condition: unknown, issue: string): asserts condition {
  if (!condition) throw new Error(`첫 접촉 trace 증거가 불완전합니다: ${issue}`);
}

function snapshotFrom(raw: unknown, identity: StudioFirstContactTraceIdentity): StudioFirstContactTraceSnapshot {
  requireValue(record(raw) && raw.sessionId === identity.sessionId && raw.frameId === identity.frameId
    && nonnegative(raw.pageEpoch) && raw.mainFrame === true && Array.isArray(raw.markers)
    && raw.markers.length >= 6 && raw.markers.length <= 258 && Array.isArray(raw.cycles)
    && raw.cycles.length >= 1 && raw.cycles.length <= 64 && Array.isArray(raw.errors) && raw.errors.length === 0,
  "marker-session-or-probe-errors");
  const names = new Set<string>();
  let previousAt = -1;
  for (const marker of raw.markers) {
    requireValue(record(marker) && marker.sessionId === identity.sessionId && marker.frameId === identity.frameId
      && marker.pageEpoch === raw.pageEpoch && integer(marker.cycle) && typeof marker.phase === "string"
      && PHASES.includes(marker.phase) && typeof marker.name === "string" && marker.name.startsWith(`toonstudio:soak-first-contact:${identity.sessionId}:`)
      && !names.has(marker.name) && nonnegative(marker.startTime) && marker.startTime >= previousAt,
    "marker-identity-or-time");
    names.add(marker.name); previousAt = marker.startTime;
  }
  let previousCycle = 0;
  for (const cycle of raw.cycles) {
    requireValue(record(cycle) && integer(cycle.cycle) && cycle.cycle > previousCycle
      && ["mouse", "pen", "touch"].includes(String(cycle.inputMode)), "stroke-identity");
    previousCycle = cycle.cycle;
  }
  return raw as unknown as StudioFirstContactTraceSnapshot;
}

interface TraceEvent extends RecordValue {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  pid: number;
  tid: number;
}
function traceEvent(value: unknown): value is TraceEvent {
  return record(value) && typeof value.name === "string" && typeof value.cat === "string"
    && typeof value.ph === "string" && finite(value.ts) && integer(value.pid) && integer(value.tid);
}
function dataOf(event: TraceEvent): RecordValue {
  return record(event.args) && record(event.args.data) ? event.args.data : {};
}
function detailOf(event: TraceEvent): unknown {
  const data = dataOf(event), args = record(event.args) ? event.args : {};
  const detail = data.detail ?? args.detail;
  if (typeof detail === "string") {
    requireValue(Buffer.byteLength(detail) <= 4096, "marker-detail-overflow");
    return JSON.parse(detail);
  }
  return detail;
}
function nativeFrame(event: TraceEvent): unknown {
  const data = dataOf(event), args = record(event.args) ? event.args : {};
  return data.frame ?? data.frameId ?? args.frame ?? args.frameId;
}
const runTask = (event: TraceEvent) => /(?:^|::)RunTask$/u.test(event.name);
const gc = (event: TraceEvent) => /(?:GC|GarbageCollect)/u.test(event.name);
const layout = (event: TraceEvent) => ["Layout", "UpdateLayoutTree", "RecalculateStyles"].includes(event.name);
const duration = (event: TraceEvent): number => nonnegative(event.dur) ? event.dur : 0;
const contains = (event: TraceEvent, timestamp: number) => event.ts <= timestamp && event.ts + duration(event) >= timestamp;
function phaseMarker(snapshot: StudioFirstContactTraceSnapshot, cycle: number, phase: string): StudioFirstContactTraceMarker {
  const matches = snapshot.markers.filter((marker) => marker.cycle === cycle && marker.phase === phase);
  requireValue(matches.length === 1, `marker-count:${cycle}:${phase}`);
  return matches[0]!;
}

/** native UserTiming의 ts와 그 mark가 반환한 startTime을 직접 짝짓는다. CPU 추정 offset을 보정하지 않는다. */
export function summarizeStudioFirstContactTrace(raw: unknown, probe: unknown, identity: StudioFirstContactTraceIdentity) {
  const snapshot = snapshotFrom(probe, identity);
  requireValue(record(raw) && Array.isArray(raw.traceEvents) && raw.traceEvents.length > 0 && raw.traceEvents.length <= 1_000_000,
    "trace-event-array");
  const events = raw.traceEvents.filter(traceEvent);
  const markerPairs: Array<StudioFirstContactTraceMarker & { traceTsUs: number; pid: number; tid: number; pageMinusTraceMs: number; nativeFrameId: string | null }> = [];
  for (const marker of snapshot.markers) {
    const matches = events.filter((event) => event.name === marker.name && event.cat.split(",").includes("blink.user_timing")
      && ["R", "I"].includes(event.ph));
    requireValue(matches.length === 1, `native-marker-count:${marker.name}`);
    const event = matches[0]!, detail = detailOf(event), observedFrame = nativeFrame(event);
    requireValue(record(detail) && detail.sessionId === marker.sessionId && detail.frameId === marker.frameId
      && detail.cycle === marker.cycle && detail.phase === marker.phase && detail.pageEpoch === marker.pageEpoch,
    "native-marker-detail");
    requireValue(observedFrame === undefined || observedFrame === identity.frameId, "native-frame-mismatch");
    markerPairs.push({ ...marker, traceTsUs: event.ts, pid: event.pid, tid: event.tid,
      pageMinusTraceMs: marker.startTime - event.ts / 1000,
      nativeFrameId: typeof observedFrame === "string" ? observedFrame : null });
  }
  requireValue(new Set(markerPairs.map((marker) => `${marker.pid}:${marker.tid}`)).size === 1, "renderer-thread-changed");
  const pid = markerPairs[0]!.pid, tid = markerPairs[0]!.tid;
  const offsets = markerPairs.map((marker) => marker.pageMinusTraceMs);
  const offsetMinMs = Math.min(...offsets), offsetMaxMs = Math.max(...offsets);
  // 성능 합격 기준이 아니라 clock 일관성 한도다. 실측 spread도 원문 그대로 보존한다.
  requireValue(offsetMaxMs - offsetMinMs <= 1, "native-marker-clock-spread-above-1ms");
  const start = phaseMarker(snapshot, 0, "session-start"), end = phaseMarker(snapshot, 0, "session-end");
  requireValue(start === snapshot.markers[0] && end === snapshot.markers.at(-1), "session-marker-order");
  requireValue(snapshot.markers.length === snapshot.cycles.length * 4 + 2, "unexpected-marker-count");
  const spans = events.filter((event) => event.pid === pid && event.tid === tid && event.ph === "X" && nonnegative(event.dur));
  const pairFor = (marker: StudioFirstContactTraceMarker) => markerPairs.find((pair) => pair.name === marker.name)!;
  const strokes = snapshot.cycles.map(({ cycle, inputMode }) => {
    const down = phaseMarker(snapshot, cycle, "pointerdown"), move = phaseMarker(snapshot, cycle, "first-move");
    const raf = phaseMarker(snapshot, cycle, "first-raf"), up = phaseMarker(snapshot, cycle, "pointerup");
    requireValue(start.startTime <= down.startTime && down.startTime <= move.startTime && move.startTime <= up.startTime
      && down.startTime <= raf.startTime && Math.max(raf.startTime, up.startTime) <= end.startTime,
    `stroke-marker-order:${cycle}`);
    for (const [marker, eventType] of [[down, "pointerdown"], [move, "pointermove"], [up, "pointerup"]] as const) {
      requireValue(marker.pointerType === inputMode && marker.eventType === eventType, `stroke-input-type:${cycle}`);
    }
    const downTs = pairFor(down).traceTsUs, moveTs = pairFor(move).traceTsUs;
    const task = spans.filter((event) => runTask(event) && contains(event, downTs)).sort((a, b) => duration(b) - duration(a))[0];
    const dispatch = spans.filter((event) => event.name === "EventDispatch" && dataOf(event).type === "pointerdown" && contains(event, downTs));
    requireValue(task && dispatch.length >= 1, `first-contact-task-or-pointerdown-dispatch:${cycle}`);
    const relevant = spans.filter((event) => event.ts < Math.max(moveTs, task.ts + duration(task))
      && event.ts + duration(event) > task.ts && (runTask(event) || event.name === "EventDispatch" || layout(event) || gc(event)));
    return { cycle, inputMode, pointerdownTraceTsUs: downTs, firstMoveTraceTsUs: moveTs,
      firstRafTraceTsUs: pairFor(raf).traceTsUs, pointerupTraceTsUs: pairFor(up).traceTsUs,
      taskStartTsUs: task.ts, taskDurationUs: duration(task),
      events: relevant.map((event) => ({ name: event.name, category: event.cat, ts: event.ts, dur: duration(event),
        eventType: typeof dataOf(event).type === "string" ? dataOf(event).type : null,
        args: event.args ?? null })) };
  });
  return { kind: "toonstudio-soak-first-contact-native-trace-v1", diagnosticOnly: true, acceptanceProven: false,
    sessionId: identity.sessionId, frameId: identity.frameId, pageEpoch: snapshot.pageEpoch, pid, tid,
    frameAssociation: "same CDP main frame before/after capture; unique in-page marker identity and matching native frame when present",
    markerPairs, nativeFrameMarkerCount: markerPairs.filter((marker) => marker.nativeFrameId !== null).length,
    clock: { basis: "native UserTiming ts paired with the returned PerformanceMark.startTime", pageMinusTraceOffsetMinMs: offsetMinMs,
      pageMinusTraceOffsetMaxMs: offsetMaxMs, observedOffsetSpreadMs: offsetMaxMs - offsetMinMs,
      cpuClockBoundsModified: false, absoluteClockAccuracyClaimed: false },
    rendererEventCounts: { runTask: spans.filter(runTask).length, eventDispatch: spans.filter((event) => event.name === "EventDispatch").length,
      layoutAndStyle: spans.filter(layout).length, garbageCollection: spans.filter(gc).length }, strokes,
    limitations: ["Trace와 CPU profiling은 실행 비용을 바꾼다. 이 결과는 성능·장시간 합격 증거가 아니다.",
      "첫 RAF는 ink·compositor 표시·기기 펜 지연을 증명하지 않는다.",
      "native mark 쌍의 spread를 보존하며 측정하지 않은 절대 시계 정확도를 주장하지 않는다."] };
}
