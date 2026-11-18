import { describe, expect, it } from "vitest";

import {
  authorBalloonFromCurveControlPoints,
  authorBalloonFromFreehandStroke,
  buildMultiJointBalloonTail,
  computePolygonPoleOfInaccessibility,
  signedDistanceToPolygon,
} from "./studio-balloon-pen-and-tails";

describe("studio-balloon-pen-and-tails", () => {
  it("오목(C자형) 말풍선에서도 난접근성 극점이 도형 외부 무게중심이 아닌 내부 안전 지점을 찾는다", () => {
    // C자형 오목 다각형: 기하 무게중심은 가운데 파인 바깥 빈 공간에 위치한다.
    const concaveC = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 50 },
      { x: 60, y: 50 },
      { x: 60, y: 150 },
      { x: 200, y: 150 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];

    const pole = computePolygonPoleOfInaccessibility(concaveC, 0.5);
    expect(pole.maxInscribedRadius).toBeGreaterThan(24);
    expect(signedDistanceToPolygon({ x: pole.x, y: pole.y }, concaveC)).toBeGreaterThan(24);
  });

  it("말풍선 펜(var 163)과 곡선 말풍선(var 161)이 customShapePoints 및 내부 텍스트 박스를 생성한다", () => {
    const rawFreehand = Array.from({ length: 36 }, (_, idx) => {
      const a = (idx * 2 * Math.PI) / 36;
      return {
        x: 300 + 110 * Math.cos(a),
        y: 220 + 75 * Math.sin(a),
      };
    });
    const penBalloon = authorBalloonFromFreehandStroke(rawFreehand, {
      simplifyEpsilonPx: 2,
      chaikinIterations: 2,
    });
    expect(penBalloon).not.toBeNull();
    expect(penBalloon!.customShapePoints.length).toBeGreaterThanOrEqual(24);
    expect(penBalloon!.interiorTextBox.width).toBeGreaterThan(80);
    expect(penBalloon!.interiorTextBox.height).toBeGreaterThan(50);

    const splineBalloon = authorBalloonFromCurveControlPoints(
      [
        { x: 100, y: 40 },
        { x: 240, y: 40 },
        { x: 280, y: 120 },
        { x: 240, y: 200 },
        { x: 100, y: 200 },
        { x: 60, y: 120 },
      ],
      { samplesPerSegment: 8 },
    );
    expect(splineBalloon).not.toBeNull();
    expect(splineBalloon!.localVertices).toHaveLength(48);
    expect(splineBalloon!.interiorTextBox.inscribedRadius).toBeGreaterThan(45);
  });

  it("1~3관절 대사 꼬리·전파 번개 꼬리·생각 방울 체인(vars 157, 159)을 모두 정확히 생성한다", () => {
    const speechTail = buildMultiJointBalloonTail({
      kind: "speech",
      root: { x: 120, y: 180 },
      joints: [
        { x: 105, y: 215 },
        { x: 135, y: 245 },
        { x: 110, y: 275 },
      ],
      tip: { x: 95, y: 310 },
      baseWidthPx: 24,
    });
    expect(speechTail.effectiveJoints).toHaveLength(3);
    expect(speechTail.polygonVertices.length).toBeGreaterThan(12);
    expect(speechTail.svgPathData.endsWith("Z")).toBe(true);

    const lightningTail = buildMultiJointBalloonTail({
      kind: "lightning",
      root: { x: 120, y: 180 },
      joints: [
        { x: 145, y: 215 },
        { x: 105, y: 235 },
      ],
      tip: { x: 135, y: 290 },
      baseWidthPx: 20,
    });
    expect(lightningTail.effectiveJoints).toHaveLength(2);
    expect(lightningTail.polygonPoints.length).toBeGreaterThanOrEqual(14);

    const thoughtTail = buildMultiJointBalloonTail({
      kind: "thought",
      root: { x: 150, y: 180 },
      joints: [{ x: 170, y: 230 }],
      tip: { x: 140, y: 290 },
      thoughtDotCount: 5,
      thoughtStartRadiusPx: 12,
      thoughtEndRadiusPx: 4,
    });
    expect(thoughtTail.thoughtDots).toHaveLength(5);
    expect(thoughtTail.thoughtDots[0]!.rx).toBe(12);
    expect(thoughtTail.thoughtDots[4]!.rx).toBe(4);
    for (let i = 1; i < thoughtTail.thoughtDots.length; i += 1) {
      expect(thoughtTail.thoughtDots[i]!.rx).toBeLessThan(thoughtTail.thoughtDots[i - 1]!.rx);
    }
  });
});
