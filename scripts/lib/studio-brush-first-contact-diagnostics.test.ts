import { describe, expect, it } from "vitest";

import { summarizeStudioBrushFirstContactCpu, type StudioBrushDiagnosticInputSample } from "./studio-brush-first-contact-diagnostics";

const input: StudioBrushDiagnosticInputSample = {
  phase: "pointerdown", sampleIndex: 0, latencyMs: 20, changedPixels: 12,
  maxChannelDelta: 40, rafIntervalsMs: [], droppedVisualFrames: 0, timedOut: false,
  clock: { armedAt: 110, eventTime: 130, observedAt: 150, sampleCount: 1 },
};
const anchor = { beforeStartMs: 100, afterStartMs: 104 };
const profile = {
  startTime: 1_000_000, endTime: 1_120_000,
  nodes: [
    { id: 1, callFrame: { functionName: "(idle)", url: "", lineNumber: -1, columnNumber: -1 } },
    { id: 2, callFrame: { functionName: "drawInitialContact", url: "http://localhost/assets/brush.js?token=hidden", lineNumber: 21, columnNumber: 4 } },
  ],
  samples: [1, 2, 2, 2, 1], timeDeltas: [10_000, 19_000, 2_000, 15_000, 5_000],
};

describe("첫 접촉 CPU 표본의 시계와 증거 경계", () => {
  it("시작 호출 bracket을 보존하고 입력·관측 경계의 모호한 표본을 확정 표본과 구별한다", () => {
    const result = summarizeStudioBrushFirstContactCpu(profile, anchor, input, "pen-smoke");
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("진단을 완료하지 못했습니다.");
    expect(result.firstInput).toEqual(input);
    expect(result.clockAlignment.uncertaintyMs).toBe(4);
    expect(result.clockAlignment.basis).toBe("start-only");
    expect(result.clockBrackets).toEqual({ start: anchor, stop: null });
    const window = result.windows.find(entry => entry.id === "input-to-first-observation");
    expect(window).toMatchObject({ startMs: 130, endMs: 150, estimatedSamples: 3,
      definiteSamples: 1, possibleSamples: 3, boundaryAmbiguousSamples: 2 });
    expect(window?.topFunctions[0]).toMatchObject({ functionName: "drawInitialContact", source: "/assets/brush.js", sampleWeightMs: 18 });
    expect(JSON.stringify(result)).not.toContain("token=hidden");
    expect(result.rawProfileSaved).toBe(false);
  });

  it("종료 시각에서 profile duration을 빼 시작 범위를 좁히고 실제 입력 시각은 보존한다", () => {
    const stop = { beforeStopMs: 222, afterStopMs: 223 };
    const result = summarizeStudioBrushFirstContactCpu(profile, anchor, input, "pen-smoke", stop);
    if (result.status !== "complete") throw new Error("일관된 종료 clock을 정렬하지 못했습니다.");
    expect(result.clockBrackets).toEqual({ start: anchor, stop });
    expect(result.clockAlignment).toMatchObject({ alignedStartLowerMs: 102, alignedStartUpperMs: 103,
      uncertaintyMs: 1, basis: "start-stop-intersection" });
    expect(result.firstInput).toEqual(input);
    expect(result.windows.find(window => window.id === "input-to-first-observation"))
      .toMatchObject({ startMs: 130, endMs: 150, definiteSamples: 3, possibleSamples: 3,
        boundaryAmbiguousSamples: 0 });
  });

  it("종료 범위가 시작 범위를 벗어나도 일치하는 교집합만 사용한다", () => {
    const result = summarizeStudioBrushFirstContactCpu(profile, anchor, input, "pen-smoke",
      { beforeStopMs: 219, afterStopMs: 222 });
    if (result.status !== "complete") throw new Error("clock 교집합을 확인하지 못했습니다.");
    expect(result.clockAlignment).toMatchObject({ alignedStartLowerMs: 100, alignedStartUpperMs: 102,
      uncertaintyMs: 2 });
  });

  it("시작·종료 범위가 한 시각에서 만나면 폭0의 일관된 경계를 보존한다", () => {
    const result = summarizeStudioBrushFirstContactCpu(profile, anchor, input, "pen-smoke",
      { beforeStopMs: 224, afterStopMs: 225 });
    if (result.status !== "complete") throw new Error("정확히 만나는 clock 경계를 잃었습니다.");
    expect(result.clockAlignment).toMatchObject({ alignedStartLowerMs: 104, alignedStartUpperMs: 104,
      uncertaintyMs: 0 });
  });

  it.each([
    { beforeStopMs: 222, afterStopMs: 221 },
    { beforeStopMs: Number.NaN, afterStopMs: 223 },
    { beforeStopMs: 149, afterStopMs: 223 },
    { beforeStopMs: 225, afterStopMs: 226 },
    { beforeStopMs: 214, afterStopMs: 219 },
  ])("불가능하거나 시작 범위와 모순되는 종료 clock은 진단 성공으로 바꾸지 않는다: %j", stop => {
    const result = summarizeStudioBrushFirstContactCpu(profile, anchor, input, "pen-smoke", stop);
    expect(result.status).toBe("unavailable");
    expect(result.clockBrackets).toEqual({ start: anchor, stop });
    expect(result.firstInput).toEqual(input);
  });

  it.each([
    { beforeStartMs: 105, afterStartMs: 104 },
    { beforeStartMs: 100, afterStartMs: 131 },
    { beforeStartMs: Number.NaN, afterStartMs: 104 },
  ])("불가능한 시작 clock은 병목 분석 성공으로 보고하지 않는다: %j", invalid => {
    expect(summarizeStudioBrushFirstContactCpu(profile, invalid, input, "pen-smoke").status).toBe("unavailable");
  });

  it.each([
    { ...input, latencyMs: 19 },
    { ...input, clock: { ...input.clock, sampleCount: 0 } },
    { ...input, clock: { ...input.clock, eventTime: null } },
    { ...input, clock: { ...input.clock, armedAt: 131 } },
  ])("원래 latency와 관측 시각이 어긋나면 진단 실패를 명시한다", invalid => {
    expect(summarizeStudioBrushFirstContactCpu(profile, anchor, invalid, "pen-smoke").status).toBe("unavailable");
  });

  it.each([
    { ...profile, samples: [1] },
    { ...profile, timeDeltas: [10_000, -1, 2_000, 15_000, 5_000] },
    { ...profile, samples: [1, 2, 99, 2, 1] },
    { ...profile, nodes: [...profile.nodes, profile.nodes[0]] },
  ])("손상된 CPU 표본을 0ms 제품 처리로 바꾸지 않는다", invalid => {
    expect(summarizeStudioBrushFirstContactCpu(invalid, anchor, input, "pen-smoke").status).toBe("unavailable");
  });

  it("pixel timeout도 원래 실패 상태로 남기고 CPU 진단만 독립적으로 작성한다", () => {
    const failed = { ...input, latencyMs: null, changedPixels: 0, maxChannelDelta: 0, timedOut: true };
    const result = summarizeStudioBrushFirstContactCpu(profile, anchor, failed, "pen-smoke");
    expect(result.status).toBe("complete");
    expect(result.firstInput).toEqual(failed);
    expect(result).not.toHaveProperty("ok");
  });

  it("많은 함수와 긴 원본 이름도 구간별10개·64KiB 이하 summary로 제한한다", () => {
    const nodes = Array.from({ length: 200 }, (_, index) => ({ id: index + 1,
      callFrame: { functionName: `function${index}-${"x".repeat(2_000)}`, url: `http://localhost/${"y".repeat(2_000)}`, lineNumber: index, columnNumber: 1 } }));
    const result = summarizeStudioBrushFirstContactCpu({ ...profile, nodes,
      samples: nodes.map(node => node.id), timeDeltas: nodes.map(() => 500) }, anchor, input, "pen-smoke");
    if (result.status !== "complete") throw new Error("진단을 완료하지 못했습니다.");
    expect(result.windows.every(window => window.topFunctions.length <= 10)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThan(64 * 1024);
    expect(result.profile.sampleCount).toBe(200);
  });
});
