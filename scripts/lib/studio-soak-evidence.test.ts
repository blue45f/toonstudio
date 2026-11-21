import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateStudioSoakCompletion, parseStudioSoakWorkload, readStudioSoakBuildEvidence,
  shouldChurnStudioSoakHistory, studioSoakDocumentAdvanced, summarizeStudioSoakAccumulation,
} from "./studio-soak-evidence";

import type { HeapSample } from "./studio-soak-telemetry";

const minute = 60_000;
const sourceCommit = "a".repeat(40);
const validStroke = {
  acceptedByDocument: true, historyTotalAppendsBefore: 20, historyTotalAppendsAfter: 21,
  historyEvictedStepsBefore: 10, historyEvictedStepsAfter: 11, historyRetainedBytesAfter: 1_024,
  rejectedStrokeCountBefore: 0, rejectedStrokeCountAfter: 0,
};
const heap = (atMs: number): HeapSample => ({
  atMs, usedBytes: 200 * 1024 * 1024, totalBytes: 300 * 1024 * 1024,
  embedderBytes: 1_024, backingStorageBytes: 2_048, documents: 1, nodes: 200, jsEventListeners: 30,
});
const build = { source: "owned-preview" as const, gitSha: sourceCommit, buildId: "abcdef012345",
  indexSha256: "1".repeat(64), metadataSha256: "2".repeat(64), verified: true, error: null };

function evidence(): Parameters<typeof evaluateStudioSoakCompletion>[0] {
  const times = Array.from({ length: 31 }, (_, index) => index * 10 * minute);
  return {
    requestedDurationMs: 300 * minute, sessionDurationMs: 300 * minute, checkpointIntervalMs: 10 * minute,
    checkpoints: times.map((atMs, index) => ({ phase: index === 0 ? "initial" : index === 30 ? "final" : "periodic",
      scheduledAtMs: atMs, sessionAtMs: atMs + 1, heapBytes: heap(atMs).usedBytes })),
    heapSamples: times.map((atMs) => heap(atMs + 1)), telemetryChecks: 602, telemetryErrors: 0,
    pageEpochs: [1_000], sourceCommit, sourceDirty: false, build, cycles: 600,
    attemptedStrokes: 600, failures: 0, workload: "bounded-churn",
    strokes: Array.from({ length: 600 }, () => ({ ...validStroke })), longTasks: [],
  };
}

describe("소크 결과는 수집한 시간·증거만으로 판정한다", () => {
  it("같은 페이지의 전체 체크포인트와 필수 계측을 갖춘 5시간만 완료로 기록한다", () => {
    const result = evaluateStudioSoakCompletion(evidence());
    expect(result).toMatchObject({ status: "pass", ok: true, fiveHourProofComplete: true,
      checkpointCoverage: { expected: 31, valid: 31, missing: [] },
      accumulation: { attemptedStrokes: 600, acceptedStrokes: 600, missingStrokeEvidence: 0 } });
  });

  it.each([
    { name: "모든 힙 표본 없음", patch: { heapSamples: [] }, issue: "heap-samples" },
    { name: "CDP 수집 오류", patch: { telemetryErrors: 1 }, issue: "telemetry-collection" },
    { name: "마지막 성능 수집 생략", patch: { telemetryChecks: 601 }, issue: "telemetry-collection" },
    { name: "페이지 재시작", patch: { pageEpochs: [1_000, 2_000] }, issue: "session-continuity" },
    { name: "세션 계측 없음", patch: { pageEpochs: [] }, issue: "session-continuity" },
    { name: "5시간 전 중단", patch: { sessionDurationMs: 299 * minute }, issue: "session-duration" },
    { name: "측정할 수 없는 세션 시간", patch: { sessionDurationMs: Number.NaN }, issue: "session-duration" },
    { name: "음수 세션 시간", patch: { sessionDurationMs: -1 }, issue: "session-duration" },
    { name: "오래된 빌드", patch: { build: { ...build, gitSha: "b".repeat(40) } }, issue: "build-provenance" },
    { name: "수정된 소스", patch: { sourceDirty: true }, issue: "build-provenance" },
    { name: "실패한 획의 표본 없음", patch: { attemptedStrokes: 601 }, issue: "stroke-evidence" },
  ])("$name을 PASS로 바꾸지 않는다", ({ patch, issue }) => {
    const result = evaluateStudioSoakCompletion({ ...evidence(), ...patch });
    expect(result.status).toBe("incomplete");
    expect(result.ok).toBe(false);
    expect(result.fiveHourProofComplete).toBe(false);
    expect(result.incomplete).toContain(issue);
  });

  it("중간 측정 누락을 끝의 표본 수로 채울 수 없다", () => {
    const input = evidence();
    input.checkpoints = input.checkpoints.filter((point) => point.scheduledAtMs !== 20 * minute);
    input.heapSamples = [...input.heapSamples, heap(301 * minute)];
    expect(evaluateStudioSoakCompletion(input).checkpointCoverage.missing).toEqual(["periodic:1200000"]);
  });

  it("같은 체크포인트 중복과 NaN 메모리를 거절한다", () => {
    const input = evidence();
    input.checkpoints = [...input.checkpoints, input.checkpoints[1]!];
    expect(evaluateStudioSoakCompletion(input).status).toBe("incomplete");
    input.heapSamples = [heap(Number.NaN), ...input.heapSamples.slice(1)];
    expect(evaluateStudioSoakCompletion(input).incomplete).toContain("heap-samples");
  });

  it("축적 모드에서 보존 진단 누락을 성공으로 보고하지 않는다", () => {
    const input = evidence();
    input.workload = "accumulate";
    input.strokes = [{ ...validStroke, historyRetainedBytesAfter: null }];
    input.attemptedStrokes = 1;
    expect(evaluateStudioSoakCompletion(input).incomplete).toContain("accumulation-diagnostics");
  });

  it("UI 준비·계측·GC 구간의 longtask를 그리기 지연으로 세지 않는다", () => {
    const input = evidence();
    input.longTasks = [{ atMs: 10, durationMs: 900, duringStroke: false }];
    expect(evaluateStudioSoakCompletion(input).status).toBe("pass");
    input.longTasks.push({ atMs: 20, durationMs: 50, duringStroke: true });
    expect(evaluateStudioSoakCompletion(input)).toMatchObject({ status: "fail",
      drawingPerformance: { limitMs: 50, violations: 1, pointerLatencyMeasured: false } });
  });

  it("짧은 진단을 다섯 시간 증거로 표시하지 않는다", () => {
    const input = evidence();
    input.requestedDurationMs = minute;
    input.sessionDurationMs = minute;
    input.checkpoints = [
      { phase: "initial", scheduledAtMs: 0, sessionAtMs: 1, heapBytes: 10 },
      { phase: "final", scheduledAtMs: minute, sessionAtMs: minute + 1, heapBytes: 10 },
    ];
    input.heapSamples = [heap(1), heap(minute + 1)];
    expect(evaluateStudioSoakCompletion(input)).toMatchObject({ status: "pass", fiveHourProofComplete: false });
  });

  it("제품 실패는 계측 누락이 함께 있어도 실패로 유지한다", () => {
    expect(evaluateStudioSoakCompletion({ ...evidence(), failures: 1, telemetryErrors: 1 }).status).toBe("fail");
  });
});

describe("기본 Undo와 opt-in 누적 사용", () => {
  it("기본 10획 정리를 유지하고 누적 모드에서는 종료 정리도 생략한다", () => {
    expect(parseStudioSoakWorkload(undefined)).toBe("bounded-churn");
    expect(parseStudioSoakWorkload("accumulate")).toBe("accumulate");
    expect(() => parseStudioSoakWorkload("reset")).toThrow();
    expect(shouldChurnStudioSoakHistory("bounded-churn", 9, 10)).toBe(false);
    expect(shouldChurnStudioSoakHistory("bounded-churn", 10, 10)).toBe(true);
    expect(shouldChurnStudioSoakHistory("accumulate", 8_000, 10)).toBe(false);
    expect(shouldChurnStudioSoakHistory("accumulate", 8_000, 1)).toBe(false);
  });

  it("history depth가 예산 퇴출로 평탄해져도 실제 append를 검증한다", () => {
    const input = { ...validStroke, layerCountBefore: 200, layerCountAfter: 200,
      historyUndoDepthBefore: 200, historyUndoDepthAfter: 200 };
    expect(studioSoakDocumentAdvanced(input)).toBe(true);
    expect(studioSoakDocumentAdvanced({ ...input, historyTotalAppendsAfter: 20 })).toBe(false);
    expect(studioSoakDocumentAdvanced({ ...input, rejectedStrokeCountAfter: 1 })).toBe(false);
  });

  it("시도 수를 성공 수로 바꾸지 않고 퇴출·보존 용량을 그대로 기록한다", () => {
    expect(summarizeStudioSoakAccumulation([
      validStroke, { ...validStroke, acceptedByDocument: false, rejectedStrokeCountAfter: 1 },
    ], 3)).toMatchObject({ attemptedStrokes: 3, acceptedStrokes: 1, missingStrokeEvidence: 1,
      historyBudgetEvictedSteps: 2, maximumHistoryRetainedBytes: 1_024, rejectedStrokes: 1 });
  });
});

describe("검사한 빌드의 증거", () => {
  const temporary: string[] = [];
  afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); vi.unstubAllGlobals(); });
  const fixture = () => {
    const directory = mkdtempSync(join(tmpdir(), "studio-soak-build-"));
    temporary.push(directory);
    mkdirSync(join(directory, ".vite"));
    writeFileSync(join(directory, ".vite/build-meta.json"), JSON.stringify({ gitSha: sourceCommit, buildId: "abcdef012345" }));
    writeFileSync(join(directory, "index.html"), "<html>tested build</html>");
    return directory;
  };

  it("소유한 preview의 전체 SHA·빌드 ID·파일 해시를 기록한다", async () => {
    const result = await readStudioSoakBuildEvidence({ directory: fixture(), origin: "http://localhost:4173", spawnedPreview: true, sourceCommit });
    expect(result).toMatchObject({ verified: true, gitSha: sourceCommit, buildId: "abcdef012345", source: "owned-preview" });
    expect(result.indexSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.metadataSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("다른 SHA와 읽을 수 없는 메타데이터를 검증 완료로 만들지 않는다", async () => {
    const directory = fixture();
    expect((await readStudioSoakBuildEvidence({ directory, origin: "http://localhost", spawnedPreview: true, sourceCommit: "b".repeat(40) })).verified).toBe(false);
    writeFileSync(join(directory, ".vite/build-meta.json"), "{broken");
    expect((await readStudioSoakBuildEvidence({ directory, origin: "http://localhost", spawnedPreview: true, sourceCommit })).verified).toBe(false);
  });

  it("외부 origin에서 메타데이터가 없으면 로컬의 정상 파일로 대체하지 않는다", async () => {
    const remote = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", remote);
    const result = await readStudioSoakBuildEvidence({ directory: fixture(), origin: "https://studio.example.com", spawnedPreview: false, sourceCommit });
    expect(result).toMatchObject({ source: "external-origin", verified: false, gitSha: null });
    expect(remote).toHaveBeenCalledTimes(2);
  });
});
