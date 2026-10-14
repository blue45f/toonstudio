import { describe, expect, it } from "vitest";

import {
  bezierSegmentsToSvgPathData,
  evaluateTraceBezier,
  fitClosedContourToBezier,
  fitOpenChainToBezier,
  fitTraceColorLayersToBezier,
  measureBezierFitError,
} from "./studio-image-trace-bezier";

function circlePoints(cx: number, cy: number, r: number, count = 64) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

describe("fitOpenChainToBezier", () => {
  it("직선은 세그먼트 1개로 정확히 재현한다", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }];
    const segs = fitOpenChainToBezier(pts, { maxError: 0.5 });
    expect(segs).toHaveLength(1);
    expect(evaluateTraceBezier(segs[0]!, 0.5).x).toBeCloseTo(15);
    expect(evaluateTraceBezier(segs[0]!, 0.5).y).toBeCloseTo(0);
  });

  it("반원은 적은 세그먼트로 허용 오차 안에 든다", () => {
    const pts = circlePoints(0, 0, 50, 33).slice(0, 17);
    const segs = fitOpenChainToBezier(pts, { maxError: 1 });
    expect(segs.length).toBeGreaterThanOrEqual(1);
    expect(segs.length).toBeLessThanOrEqual(6);
    expect(measureBezierFitError(pts, segs)).toBeLessThanOrEqual(1.2);
  });
});

describe("fitClosedContourToBezier", () => {
  it("정사각형은 코너 4개가 앵커로 고정돼 각이 유지된다", () => {
    const square = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
      { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 },
      { x: 0, y: 20 }, { x: 0, y: 10 },
    ];
    const segs = fitClosedContourToBezier(square, { maxError: 0.5 });
    expect(segs).toHaveLength(4);
    const anchors = segs.map((s) => s.p0);
    expect(anchors).toEqual([
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ]);
    // 닫힘: 마지막 p3 === 첫 p0
    expect(segs[segs.length - 1]!.p3).toEqual(segs[0]!.p0);
  });

  it("원은 직선 근사보다 훨씬 적은 세그먼트로 오차 안에 든다", () => {
    const pts = circlePoints(100, 100, 40, 64);
    const segs = fitClosedContourToBezier(pts, { maxError: 1 });
    expect(segs.length).toBeGreaterThanOrEqual(2);
    expect(segs.length).toBeLessThanOrEqual(10);
    expect(measureBezierFitError(pts, segs)).toBeLessThanOrEqual(1.2);
    expect(segs[segs.length - 1]!.p3).toEqual(segs[0]!.p0);
  });

  it("점 3개 미만이면 빈 배열이다", () => {
    expect(fitClosedContourToBezier([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });
});

describe("fitTraceColorLayersToBezier — 색상별 분리 유지", () => {
  it("두 색 레이어가 섞이지 않고 색상·순서 그대로 곡선화된다", () => {
    const red = circlePoints(20, 20, 10, 32).flatMap((p) => [p.x, p.y]);
    const blue = [
      60, 60, 80, 60, 80, 80, 60, 80,
    ];
    const layers = fitTraceColorLayersToBezier([
      { color: "#ff0000", contours: [red] },
      { color: "#0000ff", contours: [blue] },
    ], { maxError: 0.75 });
    expect(layers.map((l) => l.color)).toEqual(["#ff0000", "#0000ff"]);
    expect(layers[0]!.pathData).toContain("C ");
    expect(layers[0]!.segmentCount).toBe(layers[0]!.segments.length);
    // 파랑 정사각형은 코너 고정으로 4세그먼트
    expect(layers[1]!.segmentCount).toBe(4);
  });

  it("SVG path data는 M으로 시작해 Z로 닫힌다", () => {
    const segs = fitClosedContourToBezier(circlePoints(0, 0, 10, 24), { maxError: 0.5 });
    const d = bezierSegmentsToSvgPathData(segs, true);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("C ");
  });
});
