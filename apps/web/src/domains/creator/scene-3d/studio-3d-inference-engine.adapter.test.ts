import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_INFERENCE_AXIS_STYLE,
  STUDIO_BG3D_INFERENCE_KIND_STYLE,
} from "../bg3d/studio-bg3d-inference-kinds";

import { Studio3DInferenceEngine } from "./studio-3d-inference-engine";

import type { InferenceCandidate } from "./studio-3d-inference-engine";

const P = (x: number, y: number, z: number) => ({ x, y, z });

describe("Studio3DInferenceEngine 호환 어댑터", () => {
  it("후보의 종류와 라벨은 호출자가 붙인 그대로 돌려준다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    const candidates: InferenceCandidate[] = [
      { point: P(1, 1, 1), type: "face-centroid", label: "윗면 중심", sourceId: "face-1" },
    ];
    const result = engine.findBestSnap(P(1.05, 1, 1), candidates, 0);
    expect(result?.type).toBe("face-centroid");
    expect(result?.label).toBe("윗면 중심");
    expect(result?.snappedPoint).toEqual(P(1, 1, 1));
    expect(result?.distance).toBeCloseTo(0.05, 9);
    expect(result?.guideRay).toBeUndefined();
  });

  it("허용오차 안에서 가장 가까운 후보가 이기고, 밖이면 null이다 (격자 끔)", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    const candidates: InferenceCandidate[] = [
      { point: P(0, 0, 0), type: "endpoint", label: "멀다" },
      { point: P(0.15, 0, 0), type: "midpoint", label: "가깝다" },
    ];
    expect(engine.findBestSnap(P(0.12, 0, 0), candidates, 0)?.label).toBe("가깝다");
    expect(engine.findBestSnap(P(3, 3, 3), candidates, 0)).toBeNull();
  });

  it("안내선 색은 파이프라인의 종류·축 스타일과 같은 값을 쓴다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    const pairs = [
      ["endpoint", STUDIO_BG3D_INFERENCE_KIND_STYLE.endpoint.hex],
      ["midpoint", STUDIO_BG3D_INFERENCE_KIND_STYLE.midpoint.hex],
      ["center", STUDIO_BG3D_INFERENCE_KIND_STYLE.center.hex],
      ["axis-x", STUDIO_BG3D_INFERENCE_AXIS_STYLE.x.hex],
      ["axis-y", STUDIO_BG3D_INFERENCE_AXIS_STYLE.y.hex],
      ["axis-z", STUDIO_BG3D_INFERENCE_AXIS_STYLE.z.hex],
    ] as const;
    for (const [type, hex] of pairs) {
      const result = engine.findBestSnap(P(2, 2, 2), [{ point: P(2, 2, 2), type, label: type }], 0);
      expect(result?.guideRay?.colorHex).toBe(hex);
    }
    // 색 값 자체도 기존 레거시 값과 같다 (회귀 방지).
    expect(STUDIO_BG3D_INFERENCE_AXIS_STYLE.x.hex).toBe("#e63946");
    expect(STUDIO_BG3D_INFERENCE_AXIS_STYLE.y.hex).toBe("#2a9d8f");
    expect(STUDIO_BG3D_INFERENCE_AXIS_STYLE.z.hex).toBe("#457b9d");
  });

  it("호버 기준점 정렬은 X·Y·Z 라벨과 안내선(원점은 기준점)을 돌려준다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    engine.registerHoverReference(P(5, 0, 0));
    const x = engine.findBestSnap(P(9, 0.03, 0.02), [], 0);
    expect(x?.type).toBe("axis-x");
    expect(x?.label).toBe("X축 정렬 (Red Axis)");
    expect(x?.guideRay?.origin).toEqual(P(5, 0, 0));
    expect(x?.guideRay?.direction).toEqual(P(1, 0, 0));
    const z = engine.findBestSnap(P(5.02, 0.01, 8), [], 0);
    expect(z?.type).toBe("axis-z");
    expect(z?.label).toBe("Z축 정렬 (Blue Axis)");
    expect(z?.snappedPoint.z).toBeCloseTo(8, 9);
  });

  it("기준점 자리 바로 위(5cm 이내)는 정렬 후보가 아니다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    engine.registerHoverReference(P(5, 0, 0));
    expect(engine.findBestSnap(P(5.01, 0.01, 0.01), [], 0)).toBeNull();
  });

  it("호버 기준점은 5cm 안 중복을 무시하고 최대 4개를 유지한다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    engine.registerHoverReference(P(0, 0, 0));
    engine.registerHoverReference(P(0.03, 0, 0));
    for (let i = 1; i <= 5; i += 1) engine.registerHoverReference(P(i * 10, 0, 0));
    // 가장 오래된 (0,0,0)·(10,0,0)·(20,0,0)은 밀려났고 (50,0,0)에는 정렬한다.
    expect(engine.findBestSnap(P(50.01, 7, 0.02), [], 0)?.type).toBe("axis-y");
    expect(engine.findBestSnap(P(0.01, 7, 0.02), [], 0)).toBeNull();
    engine.clearHoverReferences();
    expect(engine.findBestSnap(P(50.01, 7, 0.02), [], 0)).toBeNull();
  });

  it("축 잠금은 마지막 호버 기준점을 지나는 축선으로 커서를 투영한다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    engine.registerHoverReference(P(0, 2, 3));
    engine.setAxisLock("x");
    // 커서는 (5, 9, 9)지만 X축 잠금이라 (5, 2, 3) 근처만 후보가 된다.
    const near = engine.findBestSnap(P(5, 9, 9), [{ point: P(5, 2, 3.05), type: "endpoint", label: "축 위" }], 0);
    expect(near?.label).toBe("축 위");
    expect(near?.distance).toBeCloseTo(0.05, 9);
    // 커서가 있는 곳(5,9,9)의 후보는 투영된 커서(5,2,3)에서 멀어 고르지 않고, 기준점 X 정렬로 남는다.
    const aligned = engine.findBestSnap(P(5, 9, 9), [{ point: P(5, 9, 9), type: "endpoint", label: "축 밖" }], 0);
    expect(aligned?.type).toBe("axis-x");
    expect(aligned?.snappedPoint).toEqual(P(5, 2, 3));
  });

  it("후보와 정렬이 모두 없으면 격자로 폴백하고, 격자 크기 0이면 끈다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    expect(engine.findBestSnap(P(0.52, 0, 0.98), [], 0.5)?.type).toBe("grid");
    expect(engine.findBestSnap(P(0.52, 0, 0.98), [], 0.5)?.label).toBe("격자 (0.5m)");
    expect(engine.findBestSnap(P(0.52, 0, 0.98), [], 0)).toBeNull();
  });

  it("허용오차는 0.01~2m로 제한된다", () => {
    const engine = new Studio3DInferenceEngine(0.2);
    engine.setSnapTolerance(100);
    expect(engine.findBestSnap(P(1.9, 0, 0), [{ point: P(0, 0, 0), type: "endpoint", label: "멀리" }], 0)).not.toBeNull();
    expect(engine.findBestSnap(P(2.2, 0, 0), [{ point: P(0, 0, 0), type: "endpoint", label: "멀리" }], 0)).toBeNull();
    engine.setSnapTolerance(0);
    expect(engine.findBestSnap(P(0.02, 0, 0), [{ point: P(0, 0, 0), type: "endpoint", label: "가까이" }], 0)).toBeNull();
  });

  it("선분 최근접점은 끝으로 클램프하고 길이 0 선분은 시작점을 돌려준다", () => {
    const engine = new Studio3DInferenceEngine();
    const segment = { id: "s", start: P(0, 0, 0), end: P(10, 0, 0) };
    expect(engine.computeNearestPointOnSegment(P(-5, 3, 0), segment)).toEqual(P(0, 0, 0));
    expect(engine.computeNearestPointOnSegment(P(15, 3, 0), segment)).toEqual(P(10, 0, 0));
    expect(engine.computeNearestPointOnSegment(P(4, 3, 0), { id: "z", start: P(1, 1, 1), end: P(1, 1, 1) })).toEqual(P(1, 1, 1));
  });

  it("후보 수학을 자체로 구현하지 않고 단일 추론 파이프라인에 위임한다", () => {
    const source = readFileSync(new URL("./studio-3d-inference-engine.ts", import.meta.url), "utf8");
    expect(source).toContain("resolveStudioBg3dAdhocInference");
    expect(source).not.toMatch(/Math\.round\(effectiveCursor/u);
    expect(source).not.toContain("distX");
  });
});
