import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { StudioBrushInputLatencySample } from "../studio-brush-latency-policy";
import type { Page } from "playwright";

export interface StudioBrushInputProbeClock {
  readonly armedAt: number;
  readonly eventTime: number | null;
  readonly observedAt: number;
  /** 입력 이후 실제 compositor 패치를 읽은 횟수다. */
  readonly sampleCount: number;
}

export type StudioBrushDiagnosticInputSample = StudioBrushInputLatencySample & {
  readonly clock: StudioBrushInputProbeClock;
};

interface CpuClockAnchor {
  readonly beforeStartMs: number;
  readonly afterStartMs: number;
}
interface CpuStopClockAnchor {
  readonly beforeStopMs: number;
  readonly afterStopMs: number;
}
interface CpuFrame {
  readonly nodeId: number;
  readonly functionName: string;
  readonly source: string;
  readonly line: number;
  readonly column: number;
}
interface CpuSample {
  readonly frame: CpuFrame;
  readonly elapsedMs: number;
  readonly deltaMs: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function sourcePath(value: string): string {
  try { return new URL(value, "http://profile.invalid").pathname.slice(0, 256); }
  catch { return value.split(/[?#]/u)[0]!.slice(0, 256); }
}

/** 시작·종료 호출 전후의 일관된 browser clock 교집합에 CPU 표본을 정렬한다. */
export function summarizeStudioBrushFirstContactCpu(
  profile: unknown,
  anchor: CpuClockAnchor | null,
  firstInput: StudioBrushDiagnosticInputSample | null,
  caseId: string,
  stopAnchor: CpuStopClockAnchor | null = null,
) {
  const envelope = { kind: "toonstudio-studio-brush-first-contact-cpu-v1", schemaVersion: 1,
    caseId, rawProfileSaved: false, firstInput,
    clockBrackets: { start: anchor, stop: stopAnchor },
    limitation: "CPU 표본은 함수 실행 시간의 추정이다. browser 시작 bracket에 걸친 표본은 경계가 모호하며, 별도 continuous 획의 수치를 첫 접촉 비용으로 간주하지 않는다." } as const;
  const unavailable = (issue: string) => ({ ...envelope, status: "unavailable" as const, issues: [issue] });
  const clock = firstInput?.clock;
  if (!clock || !finite(clock.armedAt) || !finite(clock.eventTime) || !finite(clock.observedAt)
    || clock.armedAt > clock.eventTime || clock.eventTime > clock.observedAt
    || !Number.isSafeInteger(clock.sampleCount) || clock.sampleCount < 1
    || firstInput.phase !== "pointerdown" || firstInput.sampleIndex !== 0
    || (firstInput.latencyMs !== null && Math.abs(firstInput.latencyMs - (clock.observedAt - clock.eventTime)) > 0.000001)) {
    return unavailable("첫 입력의 원래 관측 시각과 표본 횟수가 유효하지 않다.");
  }
  if (!anchor || !finite(anchor.beforeStartMs) || !finite(anchor.afterStartMs)
    || anchor.beforeStartMs > anchor.afterStartMs || anchor.afterStartMs > clock.eventTime) {
    return unavailable("CPU profile 시작의 browser clock 범위를 확인하지 못했다.");
  }
  const data = record(profile);
  if (!data || !finite(data.startTime) || !finite(data.endTime) || data.startTime > data.endTime
    || !Array.isArray(data.nodes) || !Array.isArray(data.samples) || !Array.isArray(data.timeDeltas)
    || data.samples.length === 0 || data.samples.length !== data.timeDeltas.length) {
    return unavailable("CPU profile의 clock 또는 sample 배열이 유효하지 않다.");
  }
  const durationMs = (data.endTime - data.startTime) / 1_000;
  if (stopAnchor && (!finite(stopAnchor.beforeStopMs) || !finite(stopAnchor.afterStopMs)
    || stopAnchor.beforeStopMs > stopAnchor.afterStopMs || stopAnchor.beforeStopMs < clock.observedAt)) {
    return unavailable("CPU profile 종료의 browser clock 범위를 확인하지 못했다.");
  }
  const alignedStartLowerMs = Math.max(anchor.beforeStartMs,
    stopAnchor ? stopAnchor.beforeStopMs - durationMs : anchor.beforeStartMs);
  const alignedStartUpperMs = Math.min(anchor.afterStartMs,
    stopAnchor ? stopAnchor.afterStopMs - durationMs : anchor.afterStartMs);
  if (alignedStartLowerMs > alignedStartUpperMs) {
    return unavailable("CPU profile 시작·종료 clock 범위가 일치하지 않는다.");
  }
  const frames = new Map<number, CpuFrame>();
  for (const value of data.nodes) {
    const node = record(value), callFrame = record(node?.callFrame);
    if (!node || typeof node.id !== "number" || !Number.isSafeInteger(node.id) || frames.has(node.id)
      || !callFrame || typeof callFrame.functionName !== "string" || typeof callFrame.url !== "string"
      || !finite(callFrame.lineNumber) || !finite(callFrame.columnNumber)) {
      return unavailable("CPU profile의 함수 표본 정체성이 유효하지 않다.");
    }
    frames.set(node.id, { nodeId: node.id, functionName: callFrame.functionName.slice(0, 160) || "(anonymous)",
      source: sourcePath(callFrame.url), line: callFrame.lineNumber, column: callFrame.columnNumber });
  }
  let elapsedMs = 0;
  const samples: CpuSample[] = [];
  for (let index = 0; index < data.samples.length; index += 1) {
    const delta = data.timeDeltas[index], id = data.samples[index];
    const frame = typeof id === "number" ? frames.get(id) : undefined;
    if (!finite(delta) || delta < 0 || !frame) return unavailable("CPU profile의 sample clock 또는 함수 연결이 유효하지 않다.");
    elapsedMs += delta / 1_000;
    samples.push({ frame, elapsedMs, deltaMs: delta / 1_000 });
  }
  const midpoint = (alignedStartLowerMs + alignedStartUpperMs) / 2;
  const windows = [
    { id: "before-input-50ms", startMs: clock.eventTime - 50, endMs: clock.eventTime },
    { id: "input-to-first-observation", startMs: clock.eventTime, endMs: clock.observedAt },
    { id: "after-observation-50ms", startMs: clock.observedAt, endMs: clock.observedAt + 50 },
  ].map(window => {
    let estimatedSamples = 0, definiteSamples = 0, possibleSamples = 0;
    const aggregate = new Map<number, CpuFrame & { sampleCount: number; sampleWeightMs: number }>();
    for (const sample of samples) {
      const lower = alignedStartLowerMs + sample.elapsedMs, upper = alignedStartUpperMs + sample.elapsedMs;
      const estimate = midpoint + sample.elapsedMs;
      if (upper >= window.startMs && lower < window.endMs) possibleSamples += 1;
      if (lower >= window.startMs && upper < window.endMs) definiteSamples += 1;
      if (estimate >= window.startMs && estimate < window.endMs) estimatedSamples += 1;
      const weight = Math.max(0, Math.min(estimate, window.endMs) - Math.max(estimate - sample.deltaMs, window.startMs));
      if (weight === 0) continue;
      const entry = aggregate.get(sample.frame.nodeId) ?? { ...sample.frame, sampleCount: 0, sampleWeightMs: 0 };
      entry.sampleCount += 1;
      entry.sampleWeightMs += weight;
      aggregate.set(sample.frame.nodeId, entry);
    }
    return { ...window, estimatedSamples, definiteSamples, possibleSamples,
      boundaryAmbiguousSamples: possibleSamples - definiteSamples,
      topFunctions: [...aggregate.values()].sort((a, b) => b.sampleWeightMs - a.sampleWeightMs || a.nodeId - b.nodeId)
        .slice(0, 10).map(entry => ({ ...entry, sampleWeightMs: Math.round(entry.sampleWeightMs * 1_000) / 1_000 })) };
  });
  return { ...envelope, status: "complete" as const, issues: [],
    clockAlignment: { ...anchor, alignedStartLowerMs, alignedStartUpperMs,
      uncertaintyMs: alignedStartUpperMs - alignedStartLowerMs,
      basis: stopAnchor ? "start-stop-intersection" : "start-only",
      estimate: "midpoint of consistent browser clock bounds; CPU sample offsets are relative to profile.startTime" },
    profile: { startTimeUs: data.startTime, endTimeUs: data.endTime, durationMs,
      nodeCount: frames.size, sampleCount: samples.length, samplingWeight: "timeDeltas clipped to each estimated window" }, windows };
}

/** 기존 profiling 경로의 수명만 묶는다. 전체 profile 대신 작은 원인 분석 JSON만 남긴다. */
export async function createStudioBrushFirstContactCpuCapture(page: Page, directory: string, caseId: string) {
  const session = await page.context().newCDPSession(page);
  let started = false;
  let anchor: CpuClockAnchor | null = null;
  let firstInput: StudioBrushDiagnosticInputSample | null = null;
  return {
    async start() {
      await session.send("Profiler.enable");
      const beforeStartMs = await page.evaluate(() => performance.now());
      await session.send("Profiler.start");
      started = true;
      anchor = { beforeStartMs, afterStartMs: await page.evaluate(() => performance.now()) };
    },
    recordFirstInput(input: StudioBrushDiagnosticInputSample) { firstInput = input; },
    async finish() {
      try {
        const beforeStopMs = started ? await page.evaluate(() => performance.now()).catch(() => null) : null;
        const captured = started ? await session.send("Profiler.stop").catch(() => null) : null;
        const afterStopMs = started ? await page.evaluate(() => performance.now()).catch(() => null) : null;
        const stopAnchor = beforeStopMs !== null && afterStopMs !== null ? { beforeStopMs, afterStopMs } : null;
        const summary = summarizeStudioBrushFirstContactCpu(captured?.profile, anchor, firstInput, caseId, stopAnchor);
        const encoded = `${JSON.stringify(summary, null, 2)}\n`;
        if (Buffer.byteLength(encoded, "utf8") > 64 * 1024) throw new Error("첫 접촉 CPU 진단의 64KiB 상한을 초과했습니다.");
        writeFileSync(join(directory, `studio-brush-latency-${caseId}-cpu-summary.json`), encoded);
      } finally { await session.detach().catch(() => undefined); }
    },
  };
}
