import { describe, expect, it } from "vitest";

import {
  buildFrameElFromPolygonStroke,
  computeEffectiveDualGutterPx,
  generateRoughFrameOutline,
  hasPolygonSelfIntersection,
  snapAngleTo15Deg,
  splitFramePolygonWithDualGutters,
} from "./studio-frame-polygon-author";

import type { FrameEl } from "../studio-element-model";

describe("studio-frame-polygon-author", () => {
  it("15도 각도 스냅과 클릭 다각형(Polyline frame, var 43)으로 비정형 FrameEl을 생성한다", () => {
    const snapped = snapAngleTo15Deg({ x: 100, y: 100 }, { x: 200, y: 129 }, true);
    const angleDeg = (Math.atan2(snapped.y - 100, snapped.x - 100) * 180) / Math.PI;
    expect(angleDeg).toBeCloseTo(15, 1);

    const res = buildFrameElFromPolygonStroke({
      id: "poly-frame-1",
      mode: "polyline",
      snap15Deg: true,
      points: [
        { x: 60, y: 80 },
        { x: 660, y: 80 },
        { x: 660, y: 420 },
        { x: 60, y: 500 },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.frame.x).toBe(60);
    expect(res.frame.y).toBe(80);
    expect(res.frame.width).toBeGreaterThan(500);
    expect(res.frame.points?.length).toBe(8);
  });

  it("자유곡선 프레임 펜(var 491) RDP 단순화를 수행하고 자기교차·최소 면적 미달을 거부한다", () => {
    const denseStroke = [
      { x: 100, y: 100 },
      { x: 250, y: 101 },
      { x: 400, y: 100 },
      { x: 402, y: 250 },
      { x: 400, y: 380 },
      { x: 240, y: 382 },
      { x: 100, y: 380 },
      { x: 99, y: 240 },
      { x: 100, y: 101 },
    ];
    const freehand = buildFrameElFromPolygonStroke({
      id: "pen-frame-1",
      mode: "freehand-pen",
      simplifyEpsilonPx: 5,
      points: denseStroke,
    });
    expect(freehand.ok).toBe(true);
    if (freehand.ok) {
      expect(freehand.globalVertices.length).toBe(4);
    }

    // 나비넥타이(bowtie) 자기교차 다각형 거부 확인
    const bowtie = [
      { x: 100, y: 100 },
      { x: 300, y: 300 },
      { x: 300, y: 100 },
      { x: 100, y: 300 },
    ];
    expect(hasPolygonSelfIntersection(bowtie)).toBe(true);
    const rejectedBowtie = buildFrameElFromPolygonStroke({
      id: "bad-bowtie",
      mode: "polyline",
      points: bowtie,
    });
    expect(rejectedBowtie).toMatchObject({ ok: false, reason: "self-intersecting" });

    // 최소 면적 미달 거부 확인
    const tiny = buildFrameElFromPolygonStroke({
      id: "tiny-frame",
      mode: "polyline",
      minAreaPx2: 1000,
      points: [
        { x: 10, y: 10 },
        { x: 25, y: 10 },
        { x: 25, y: 25 },
      ],
    });
    expect(tiny).toMatchObject({ ok: false, reason: "area-too-small" });
  });

  it("거친 사각형(var 785) 테두리를 시드 결정적으로 생성하고 코너 오버슈트·이중선을 지원한다", () => {
    const baseFrame: FrameEl = {
      id: "rough-cut-1",
      type: "frame",
      x: 40,
      y: 60,
      width: 500,
      height: 360,
    };
    const first = generateRoughFrameOutline(baseFrame, {
      seed: "ink-rough-1",
      roughnessPx: 3,
      bowingPx: 2.5,
      cornerOvershootPx: 6,
      doubleStroke: true,
    });
    const second = generateRoughFrameOutline(baseFrame, {
      seed: "ink-rough-1",
      roughnessPx: 3,
      bowingPx: 2.5,
      cornerOvershootPx: 6,
      doubleStroke: true,
    });

    expect(first).toEqual(second);
    expect(first.closedLocalPoints.length).toBeGreaterThanOrEqual(24);
    // 4변 × 이중선(2패스) = 8개 스트로크 폴리라인
    expect(first.strokePolylines).toHaveLength(8);
    expect(first.svgPathData).toContain("M ");
  });

  it("가로/세로 독립 컷 여백(CutFrameHorizontalGap, CutFrameVerticalGap)으로 정확히 분할한다", () => {
    const baseFrame: FrameEl = {
      id: "panel-main",
      type: "frame",
      x: 50,
      y: 100,
      width: 600,
      height: 800,
      bgColor: "#ffffff",
      stroke: "#16100c",
      strokeWidth: 3,
    };

    const gutters = { horizontalGapPx: 40, verticalGapPx: 14 };

    // 수평 칼선 -> 상하 컷 사이 간격이 정확히 40px 이어야 한다.
    const hSplit = splitFramePolygonWithDualGutters(
      baseFrame,
      { start: { x: 0, y: 500 }, end: { x: 700, y: 500 } },
      gutters,
    );
    expect(hSplit).not.toBeNull();
    const [topFrame, bottomFrame] = hSplit!;
    expect(topFrame.height).toBeCloseTo(380, 2);
    expect(bottomFrame.y - (topFrame.y + topFrame.height)).toBeCloseTo(40, 2);

    // 수직 칼선 -> 좌우 컷 사이 간격이 정확히 14px 이어야 한다.
    const vSplit = splitFramePolygonWithDualGutters(
      baseFrame,
      { start: { x: 350, y: 0 }, end: { x: 350, y: 1000 } },
      gutters,
    );
    expect(vSplit).not.toBeNull();
    const [leftFrame, rightFrame] = vSplit!;
    expect(rightFrame.x - (leftFrame.x + leftFrame.width)).toBeCloseTo(14, 2);

    // 사선 칼선 -> 유효 여백이 14px와 40px 사이에서 부드럽게 보간된다.
    const diagGap = computeEffectiveDualGutterPx(
      { x: 0, y: 200 },
      { x: 600, y: 500 },
      gutters,
    );
    expect(diagGap).toBeGreaterThan(14);
    expect(diagGap).toBeLessThan(40);
  });
});
