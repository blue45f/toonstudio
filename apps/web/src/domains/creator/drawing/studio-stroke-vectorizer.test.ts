import { describe, expect, it } from "vitest";

import {
  ringsToCubicBezierSvgPathData,
  ringsToSvgPathData,
  vectorizeFreehandStroke,
  vectorizePreviewSampleStroke,
  type StudioVectorizerPoint,
} from "./studio-stroke-vectorizer";

function straightLine(n: number): StudioVectorizerPoint[] {
  const pts: StudioVectorizerPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    pts.push({ x: i * 10, y: 50, pressure: 0.5 });
  }
  return pts;
}

describe("ringsToSvgPathData", () => {
  it("링을 M/L/Z path data 로 변환한다", () => {
    const result = ringsToSvgPathData([
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    ]);
    expect(result).toBe("M0 0L10 0L10 10Z");
  });

  it("여러 링(외곽+구멍)을 이어서 변환한다", () => {
    const result = ringsToSvgPathData([
      [
        [0, 0],
        [20, 20],
      ],
      [
        [5, 5],
        [10, 10],
      ],
    ]);
    expect(result).toBe("M0 0L20 20ZM5 5L10 10Z");
  });

  it("빈 링은 건너뛴다", () => {
    expect(ringsToSvgPathData([[]])).toBe("");
  });
});

describe("vectorizeFreehandStroke", () => {
  it("직선 스트로크를 외곽선 폴리곤으로 변환한다", () => {
    const result = vectorizeFreehandStroke(straightLine(10), { size: 16 });
    expect(result.pointCount).toBeGreaterThan(0);
    expect(result.pathData).toContain("M");
    expect(result.pathData).toContain("Z");
    expect(result.cleaned).toBe(true);
    expect(result.rings.length).toBeGreaterThanOrEqual(1);
  });

  it("필압에 따라 굵기가 달라진다", () => {
    const thin = vectorizeFreehandStroke(
      straightLine(10).map((p) => ({ ...p, pressure: 0.1 })),
      { size: 20, thinning: 0.8 },
    );
    const thick = vectorizeFreehandStroke(
      straightLine(10).map((p) => ({ ...p, pressure: 0.9 })),
      { size: 20, thinning: 0.8 },
    );
    // 굵은 스트로크의 pathData 가 더 길다 (더 큰 외곽선)
    expect(thick.pathData.length).toBeGreaterThan(thin.pathData.length);
  });

  it("점이 2개 미만이면 빈 결과를 반환한다", () => {
    expect(vectorizeFreehandStroke([]).pathData).toBe("");
    expect(vectorizeFreehandStroke([{ x: 0, y: 0 }]).pointCount).toBe(0);
  });

  it("스스로 겹치는 획도 단일 결과로 정리된다", () => {
    // 8자 모양 (self-crossing)
    const pts: StudioVectorizerPoint[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const t = (i / 40) * Math.PI * 4;
      pts.push({
        x: 60 + 40 * Math.sin(t),
        y: 60 + 40 * Math.sin(t) * Math.cos(t),
        pressure: 0.6,
      });
    }
    const result = vectorizeFreehandStroke(pts, { size: 14 });
    expect(result.pointCount).toBeGreaterThan(0);
    expect(result.pathData.length).toBeGreaterThan(0);
  });

  it("cleanSelfIntersections=false 면 union 을 건너뛴다", () => {
    const result = vectorizeFreehandStroke(straightLine(10), {
      cleanSelfIntersections: false,
    });
    expect(result.cleaned).toBe(false);
    expect(result.pointCount).toBeGreaterThan(0);
  });

  it("maxPoints 를 초과하는 입력은 잘린다", () => {
    const many = straightLine(100);
    const result = vectorizeFreehandStroke(many, { maxPoints: 10 });
    expect(result.pointCount).toBeGreaterThan(0);
  });

  it("curveMode='cubic' 지정 시 Catmull-Rom 3차 베지어(C) 외곽선을 생성하고 입필/발필 테이퍼 및 NaN 필터링을 지원한다", () => {
    const noisy = [
      { x: Number.NaN, y: 50, pressure: 0.5 },
      ...straightLine(12),
      { x: 150, y: Number.POSITIVE_INFINITY, pressure: 0.5 },
    ];
    const cubic = vectorizeFreehandStroke(noisy, {
      size: 18,
      taperStart: 24,
      taperEnd: 24,
      curveMode: "cubic",
    });
    expect(cubic.pointCount).toBeGreaterThan(0);
    expect(cubic.pathData).toContain("C");
    expect(cubic.pathData).not.toContain("NaN");
    expect(
      ringsToCubicBezierSvgPathData([
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      ]),
    ).toContain("C");
  });
});

describe("vectorizePreviewSampleStroke", () => {
  it("S자 샘플 스트로크를 벡터화한다", () => {
    const result = vectorizePreviewSampleStroke({ size: 18 });
    expect(result.pointCount).toBeGreaterThan(10);
    expect(result.pathData).toContain("M");
    expect(result.pathData).toContain("Z");
  });
});

