import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BUILD_INFERENCE_REVISION,
  cycleStudioInferenceAxisLock,
  resolveStudioBuildInferenceSnap,
} from "../studio-build-inference-snap";

import type { StudioInferenceSnapQuery } from "../studio-build-inference-snap";

const P = (x: number, y: number, z: number) => ({ x, y, z });

function query(partial: Partial<StudioInferenceSnapQuery>): StudioInferenceSnapQuery {
  return {
    cursor: P(0, 0, 0),
    segments: [{ id: "s1", a: P(0, 0, 0), b: P(2, 0, 0) }],
    pixelThreshold: 10,
    pixelsPerUnit: 100,
    pointerVelocity: 0,
    axisLock: "none",
    ...partial,
  };
}

describe("studio-build-inference-snap 호환 어댑터", () => {
  it("공개 상수·반환 모양을 유지한다", () => {
    const result = resolveStudioBuildInferenceSnap(query({ cursor: P(0.02, 0, 0) }));
    expect(result.revision).toBe(STUDIO_BUILD_INFERENCE_REVISION);
    expect(result.snapped).toBe(true);
    expect(result.candidate).toBe(result.candidates[0]);
  });

  it("월드 임계값 공식은 기존과 같다: max(1,px)/ppu × (1 + min(2, |속도|×0.01))", () => {
    expect(resolveStudioBuildInferenceSnap(query({})).worldThreshold).toBeCloseTo(0.1, 12);
    expect(resolveStudioBuildInferenceSnap(query({ pointerVelocity: 50 })).worldThreshold).toBeCloseTo(0.15, 12);
    expect(resolveStudioBuildInferenceSnap(query({ pointerVelocity: 1000 })).worldThreshold).toBeCloseTo(0.3, 12);
    expect(resolveStudioBuildInferenceSnap(query({ pixelThreshold: 0 })).worldThreshold).toBeCloseTo(0.01, 12);
  });

  it("끝점이 가장 가까우면 끝점, 후보 거리는 월드 단위다", () => {
    const result = resolveStudioBuildInferenceSnap(query({ cursor: P(0.03, 0, 0.04) }));
    expect(result.candidate?.kind).toBe("endpoint");
    expect(result.candidate?.point).toEqual(P(0, 0, 0));
    expect(result.candidate?.distance).toBeCloseTo(0.05, 9);
    expect(result.candidate?.sourceIds).toEqual(["s1"]);
    expect(result.candidate?.locked).toBe(false);
  });

  it("중간점과 교차점도 찾는다", () => {
    const mid = resolveStudioBuildInferenceSnap(query({ cursor: P(1.02, 0, 0.01) }));
    expect(mid.candidate?.kind).toBe("midpoint");
    const crossing = resolveStudioBuildInferenceSnap(
      query({
        cursor: P(0.51, 0, 0.02),
        segments: [
          { id: "a", a: P(0, 0, 0), b: P(1, 0, 0) },
          { id: "b", a: P(0.5, 0, -1), b: P(0.5, 0, 1) },
        ],
      }),
    );
    expect(crossing.candidates.some((candidate) => candidate.kind === "intersection")).toBe(true);
    expect([...(crossing.candidates.find((candidate) => candidate.kind === "intersection")?.sourceIds ?? [])].sort()).toEqual(["a", "b"]);
  });

  it("preferKinds에 든 종류가 거리보다 먼저다", () => {
    const base = query({ cursor: P(0.01, 0, 0), segments: [{ id: "s1", a: P(0, 0, 0), b: P(0.04, 0, 0) }] });
    expect(resolveStudioBuildInferenceSnap(base).candidate?.kind).toBe("endpoint");
    const preferred = resolveStudioBuildInferenceSnap({ ...base, preferKinds: ["midpoint"] });
    expect(preferred.candidate?.kind).toBe("midpoint");
  });

  it("축 잠금이면 첫 세그먼트 시작점을 원점으로 축 후보를 만들고 모든 후보에 잠금 표시를 단다", () => {
    const result = resolveStudioBuildInferenceSnap(
      query({
        cursor: P(2, 0.5, 0.1),
        pixelThreshold: 20,
        pixelsPerUnit: 10,
        pointerVelocity: 5,
        axisLock: "x",
      }),
    );
    const axis = result.candidates.find((candidate) => candidate.kind === "axis");
    expect(axis).toBeDefined();
    expect(axis?.locked).toBe(true);
    expect(axis?.axis).toBe("x");
    expect(axis?.point.y).toBeCloseTo(0, 9);
    expect(axis?.point.z).toBeCloseTo(0, 9);
    expect(result.candidates.every((candidate) => candidate.locked)).toBe(true);
  });

  it("후보가 없으면 snapped=false, 빈 목록이다", () => {
    const result = resolveStudioBuildInferenceSnap(query({ cursor: P(50, 50, 50) }));
    expect(result.snapped).toBe(false);
    expect(result.candidate).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("세그먼트가 없어도 던지지 않는다", () => {
    const result = resolveStudioBuildInferenceSnap(query({ segments: [], axisLock: "y" }));
    expect(result.snapped).toBe(false);
  });

  it("tangent는 더는 생성하지 않는다 (타입은 호환을 위해 유지)", () => {
    const result = resolveStudioBuildInferenceSnap(query({ cursor: P(0.01, 0, 0.01), preferKinds: ["tangent"] }));
    expect(result.candidates.some((candidate) => candidate.kind === "tangent")).toBe(false);
  });

  it("축 잠금 순환은 기존과 같다", () => {
    expect(cycleStudioInferenceAxisLock("none")).toBe("x");
    expect(cycleStudioInferenceAxisLock("x")).toBe("y");
    expect(cycleStudioInferenceAxisLock("y")).toBe("z");
    expect(cycleStudioInferenceAxisLock("z")).toBe("none");
  });

  it("후보 수학을 자체로 구현하지 않고 단일 추론 파이프라인에 위임한다", () => {
    const source = readFileSync(new URL("../studio-build-inference-snap.ts", import.meta.url), "utf8");
    expect(source).toContain("resolveStudioBg3dAdhocInference");
    expect(source).not.toMatch(/function (closestOnSegment|segmentIntersection|axisPoint)/u);
    expect(source.split("\n").length).toBeLessThan(220);
  });
});
