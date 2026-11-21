import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS } from "../studio-brush-frame-budget-policy";

import { STUDIO_SOAK_HEAP_MIN_SLOPE_SAMPLES, STUDIO_SOAK_HEAP_MIN_SLOPE_WINDOW_MS } from "./studio-memory-growth-policy.mjs";
import { summarizeStudioSoakPointerLatency, type StudioSoakPointerLatencyStroke } from "./studio-soak-pointer-latency";

import type { HeapSample, LongTaskSample } from "./studio-soak-telemetry";

export type StudioSoakWorkload = "bounded-churn" | "accumulate";

export function parseStudioSoakWorkload(value: string | undefined): StudioSoakWorkload {
  const mode = value?.trim() || "bounded-churn";
  if (mode !== "bounded-churn" && mode !== "accumulate") {
    throw new Error("TOONSPECTRUM_SOAK_WORKLOAD는 bounded-churn 또는 accumulate여야 합니다.");
  }
  return mode;
}

export function shouldChurnStudioSoakHistory(
  workload: StudioSoakWorkload,
  acceptedStrokes: number,
  interval: number,
): boolean {
  return workload === "bounded-churn" && acceptedStrokes >= interval;
}

interface AdvanceEvidence {
  layerCountBefore: number | null;
  layerCountAfter: number | null;
  historyUndoDepthBefore: number | null;
  historyUndoDepthAfter: number | null;
  historyTotalAppendsBefore: number | null;
  historyTotalAppendsAfter: number | null;
  rejectedStrokeCountBefore: number | null;
  rejectedStrokeCountAfter: number | null;
}

/** history 예산 퇴출로 깊이가 평탄해져도 실제 append 증가를 확인한다. */
export function studioSoakDocumentAdvanced(evidence: AdvanceEvidence): boolean {
  const advanced = (before: number | null, after: number | null) =>
    before !== null && after !== null && Number.isSafeInteger(before)
    && Number.isSafeInteger(after) && before >= 0 && after > before;
  if (advanced(evidence.rejectedStrokeCountBefore, evidence.rejectedStrokeCountAfter)) return false;
  return advanced(evidence.layerCountBefore, evidence.layerCountAfter)
    || advanced(evidence.historyUndoDepthBefore, evidence.historyUndoDepthAfter)
    || advanced(evidence.historyTotalAppendsBefore, evidence.historyTotalAppendsAfter);
}

interface StrokeEvidence extends StudioSoakPointerLatencyStroke {
  acceptedByDocument: boolean;
  historyTotalAppendsBefore: number | null;
  historyTotalAppendsAfter: number | null;
  historyEvictedStepsBefore: number | null;
  historyEvictedStepsAfter: number | null;
  historyRetainedBytesAfter: number | null;
  rejectedStrokeCountBefore: number | null;
  rejectedStrokeCountAfter: number | null;
}

export function summarizeStudioSoakAccumulation(samples: readonly StrokeEvidence[], attemptedStrokes = samples.length) {
  const delta = (before: number | null, after: number | null) =>
    before === null || after === null ? 0 : Math.max(0, after - before);
  const observed = samples.filter((sample) => [
    sample.historyTotalAppendsBefore, sample.historyTotalAppendsAfter,
    sample.historyEvictedStepsBefore, sample.historyEvictedStepsAfter,
    sample.historyRetainedBytesAfter, sample.rejectedStrokeCountBefore, sample.rejectedStrokeCountAfter,
  ].every((value) => value !== null && Number.isSafeInteger(value) && value >= 0));
  return {
    attemptedStrokes,
    missingStrokeEvidence: attemptedStrokes - samples.length,
    acceptedStrokes: samples.filter((sample) => sample.acceptedByDocument).length,
    missingDiagnosticStrokes: samples.length - observed.length,
    observedHistoryAppends: observed.reduce((sum, sample) =>
      sum + delta(sample.historyTotalAppendsBefore, sample.historyTotalAppendsAfter), 0),
    historyBudgetEvictedSteps: observed.reduce((sum, sample) =>
      sum + delta(sample.historyEvictedStepsBefore, sample.historyEvictedStepsAfter), 0),
    maximumHistoryRetainedBytes: observed.reduce((maximum, sample) =>
      Math.max(maximum, sample.historyRetainedBytesAfter ?? 0), 0),
    rejectedStrokes: observed.reduce((sum, sample) =>
      sum + delta(sample.rejectedStrokeCountBefore, sample.rejectedStrokeCountAfter), 0),
  };
}

export interface StudioSoakBuildEvidence {
  readonly source: "owned-preview" | "external-origin";
  readonly gitSha: string | null;
  readonly buildId: string | null;
  readonly indexSha256: string | null;
  readonly metadataSha256: string | null;
  readonly verified: boolean;
  readonly error: string | null;
}

/** 외부 origin의 증거를 로컬 dist의 SHA로 대신하지 않는다. */
export async function readStudioSoakBuildEvidence(input: {
  origin: string;
  directory: string;
  spawnedPreview: boolean;
  sourceCommit: string;
}): Promise<StudioSoakBuildEvidence> {
  const source = input.spawnedPreview ? "owned-preview" : "external-origin";
  try {
    const read = async (path: string): Promise<string> => {
      if (input.spawnedPreview) return readFileSync(join(input.directory, path), "utf8");
      const response = await fetch(new URL(path, input.origin + "/"), {
        cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("빌드 증거 응답 실패: " + response.status + " " + path);
      return response.text();
    };
    const [metadataText, index] = await Promise.all([read(".vite/build-meta.json"), read("index.html")]);
    const metadata: unknown = JSON.parse(metadataText);
    const parsed = metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata as Record<string, unknown> : {};
    const gitSha = typeof parsed.gitSha === "string" ? parsed.gitSha : null;
    const buildId = typeof parsed.buildId === "string" ? parsed.buildId : null;
    const verified = gitSha !== null && /^[0-9a-f]{40}$/u.test(gitSha)
      && gitSha === input.sourceCommit && buildId !== null && /^[0-9a-f]{12,64}$/u.test(buildId)
      && index.length > 0;
    return {
      source, gitSha, buildId, verified,
      indexSha256: createHash("sha256").update(index).digest("hex"),
      metadataSha256: createHash("sha256").update(metadataText).digest("hex"),
      error: verified ? null : "빌드의 전체 SHA·buildId가 소크 소스와 일치하지 않습니다.",
    };
  } catch (error) {
    return { source, gitSha: null, buildId: null, indexSha256: null, metadataSha256: null,
      verified: false, error: String(error instanceof Error ? error.message : error) };
  }
}

export interface StudioSoakCheckpoint {
  readonly phase: "initial" | "periodic" | "final";
  readonly scheduledAtMs: number;
  readonly sessionAtMs: number;
  readonly heapBytes: number | null;
}

export function evaluateStudioSoakCompletion(input: {
  requestedDurationMs: number;
  sessionDurationMs: number;
  checkpointIntervalMs: number;
  checkpoints: readonly StudioSoakCheckpoint[];
  heapSamples: readonly HeapSample[];
  telemetryChecks: number;
  telemetryErrors: number;
  pageEpochs: readonly number[];
  sourceCommit: string;
  sourceDirty: boolean;
  build: StudioSoakBuildEvidence | null;
  cycles: number;
  attemptedStrokes: number;
  failures: number;
  workload: StudioSoakWorkload;
  strokes: readonly StrokeEvidence[];
  longTasks: readonly LongTaskSample[];
  measurePointerLatency?: boolean;
  sessionId?: string;
  sessionStartedAt?: number | null;
}) {
  if (!Number.isFinite(input.requestedDurationMs) || input.requestedDurationMs <= 0
    || !Number.isFinite(input.checkpointIntervalMs) || input.checkpointIntervalMs <= 0) {
    throw new RangeError("소크 시간과 체크포인트 간격은 양의 유한 값이어야 합니다.");
  }
  const incomplete: string[] = [];
  const failed: string[] = [];
  const expected = [{ phase: "initial", scheduledAtMs: 0 }];
  for (let atMs = input.checkpointIntervalMs; atMs < input.requestedDurationMs; atMs += input.checkpointIntervalMs) {
    expected.push({ phase: "periodic", scheduledAtMs: atMs });
  }
  expected.push({ phase: "final", scheduledAtMs: input.requestedDurationMs });
  const key = (point: { phase: string; scheduledAtMs: number }) => point.phase + ":" + point.scheduledAtMs;
  const valid = input.checkpoints.filter((point) =>
    Number.isFinite(point.heapBytes) && point.heapBytes !== null && point.heapBytes >= 0
    && Number.isFinite(point.sessionAtMs) && point.sessionAtMs >= point.scheduledAtMs
    && (point.phase === "final" || point.sessionAtMs < point.scheduledAtMs + input.checkpointIntervalMs));
  const missing = expected.filter((point) => valid.filter((candidate) => key(candidate) === key(point)).length !== 1);
  if (missing.length > 0) incomplete.push("checkpoint-coverage");
  if (!Number.isFinite(input.sessionDurationMs) || input.sessionDurationMs < input.requestedDurationMs) incomplete.push("session-duration");
  if (!/^[0-9a-f]{40}$/u.test(input.sourceCommit) || input.sourceDirty
    || !input.build?.verified || input.build.gitSha !== input.sourceCommit) incomplete.push("build-provenance");
  if (!Number.isSafeInteger(input.telemetryChecks) || !Number.isSafeInteger(input.telemetryErrors)
    || input.telemetryErrors !== 0 || input.telemetryChecks < input.cycles + 2) incomplete.push("telemetry-collection");
  if (new Set(input.pageEpochs).size !== 1 || input.pageEpochs.some((value) => !Number.isFinite(value))) {
    incomplete.push("session-continuity");
  }
  const samples = input.heapSamples;
  if (samples.length < expected.length || samples.some((sample, index) =>
    !Number.isFinite(sample.atMs) || !Number.isFinite(sample.usedBytes) || sample.usedBytes < 0
    || (index > 0 && sample.atMs <= samples[index - 1]!.atMs))) incomplete.push("heap-samples");
  const accumulation = summarizeStudioSoakAccumulation(input.strokes, input.attemptedStrokes);
  if (!Number.isSafeInteger(input.cycles) || input.cycles <= 0 || accumulation.acceptedStrokes === 0) incomplete.push("accepted-strokes");
  if (!Number.isSafeInteger(input.attemptedStrokes) || input.attemptedStrokes < input.strokes.length
    || accumulation.missingStrokeEvidence > 0) incomplete.push("stroke-evidence");
  if (input.workload === "accumulate" && accumulation.missingDiagnosticStrokes > 0) {
    incomplete.push("accumulation-diagnostics");
  }
  const slopeSamples = samples.slice(1);
  const slopeWindowMs = (slopeSamples.at(-1)?.atMs ?? 0) - (slopeSamples[0]?.atMs ?? 0);
  const slopeReady = slopeSamples.length >= STUDIO_SOAK_HEAP_MIN_SLOPE_SAMPLES
    && slopeWindowMs >= STUDIO_SOAK_HEAP_MIN_SLOPE_WINDOW_MS;
  if (input.requestedDurationMs >= STUDIO_SOAK_HEAP_MIN_SLOPE_WINDOW_MS + input.checkpointIntervalMs
    && !slopeReady) incomplete.push("heap-slope-window");
  const drawingLongTasks = input.longTasks.filter((task) => task.duringStroke
    && task.durationMs >= STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.longTaskMs);
  if (drawingLongTasks.length > 0) failed.push("drawing-longtask");
  if (input.failures > 0) failed.push("recorded-failures");
  const pointerLatency = summarizeStudioSoakPointerLatency({
    requested: input.measurePointerLatency === true, sessionId: input.sessionId,
    sessionStartedAt: input.sessionStartedAt, requestedDurationMs: input.requestedDurationMs,
    pageEpochs: input.pageEpochs, attemptedStrokes: input.attemptedStrokes, strokes: input.strokes,
  });
  if (pointerLatency.requested && !pointerLatency.measured) incomplete.push("pointer-latency-evidence");
  const status = failed.length > 0 ? "fail" : incomplete.length > 0 ? "incomplete" : "pass";
  return {
    status, ok: status === "pass", incomplete, failed, accumulation,
    fiveHourProofComplete: status === "pass" && input.requestedDurationMs >= 300 * 60_000,
    checkpointCoverage: { expected: expected.length, valid: valid.length, missing: missing.map(key) },
    heapSlopeCoverage: { ready: slopeReady, samples: slopeSamples.length, windowMs: slopeWindowMs },
    drawingPerformance: { policy: "competitive-longtask", limitMs: STUDIO_BRUSH_COMPETITIVE_FRAME_BUDGETS.longTaskMs,
      violations: drawingLongTasks.length, pointerLatencyMeasured: pointerLatency.measured },
    pointerLatency,
  };
}
