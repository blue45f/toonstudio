/**
 * Wave 120 — 비파괴 가변 필압 벡터 먹선 교차점 지우개 · 부분 선폭 조각 & 4K/600DPI SDF 재렌더링 커널 단위 테스트.
 */

import { describe, expect, it } from "vitest";
import {
  buildVectorInkSdfWgsl,
  compareVectorRerenderVsRasterUpscale,
  computeStrokeCumulativeArcLengths,
  computeStrokeTotalLength,
  computeVectorInkLayerSha256Hex,
  createVectorInkHistory,
  eraseVectorStrokeToIntersections,
  evaluateEffectiveStrokeWidth,
  findStrokeIntersections,
  getCurrentHistoryLayer,
  pushVectorInkEdit,
  redoVectorInkEdit,
  renderVectorInkReeditAuditSvg,
  rerenderVectorInkToAlphaTile,
  sampleStrokeAtArcLength,
  sculptVectorInkLayerStrokeWidth,
  sculptVectorInkStrokeWidth,
  sha256VectorInkHex,
  signedDistanceToVariableWidthCapsule,
  summarizeVectorInkKernelKo,
  undoVectorInkEdit,
  validateVectorInkSdfWgsl,
  verifyVectorInkUndoParity,
  type VectorInkLayer,
  type VectorInkPoint,
  type VectorInkStroke,
} from "./index";

function makeLinearStroke(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
  widthPx: number,
  taperStartPx = 0,
  taperEndPx = 0,
): VectorInkStroke {
  const points: VectorInkPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, widthPx, pressure: 0.65 });
  }
  return { id, points, closed: false, taperStartPx, taperEndPx };
}

function makeLayer(
  strokes: readonly VectorInkStroke[],
  layerId = "ink-page-01",
  sizePx = 120,
): VectorInkLayer {
  return { layerId, widthPx: sizePx, heightPx: sizePx, dpi: 150, strokes };
}

describe("Wave 120: 가변 필압 벡터 먹선 모델 · 부분 선폭 조각 · SHA-256 & Undo", () => {
  it("1. 누적 호장·총 길이·보간 샘플링과 시작/끝 테이퍼 유효 선폭을 정확히 계산한다", () => {
    const stroke: VectorInkStroke = {
      id: "tapered-hair",
      points: [
        { x: 0, y: 10, widthPx: 2, pressure: 0.3 },
        { x: 30, y: 10, widthPx: 6, pressure: 0.9 },
        { x: 60, y: 10, widthPx: 4, pressure: 0.6 },
      ],
      closed: false,
      taperStartPx: 10,
      taperEndPx: 10,
    };
    expect(computeStrokeCumulativeArcLengths(stroke)).toEqual([0, 30, 60]);
    expect(computeStrokeTotalLength(stroke)).toBeCloseTo(60, 8);
    const mid = sampleStrokeAtArcLength(stroke, 30);
    expect(mid.x).toBeCloseTo(30, 8);
    expect(mid.effectiveWidthPx).toBeCloseTo(6, 8);
    const startSample = sampleStrokeAtArcLength(stroke, 0);
    expect(startSample.effectiveWidthPx).toBeLessThan(startSample.widthPx);
    expect(evaluateEffectiveStrokeWidth(4, 60, 60, 10, 10, false)).toBeLessThan(4);
  });

  it("2. thicken 모드: 브러시 내부만 두꺼워지고 maxWidthPx 상한 및 반경 밖 0.0px 불변을 지킨다", () => {
    const stroke = makeLinearStroke("jawline", 0, 50, 100, 50, 10, 4.0);
    const result = sculptVectorInkStrokeWidth(stroke, {
      centerX: 50, centerY: 50, brushRadiusPx: 22, mode: "thicken", strengthPx: 10, minWidthPx: 0.5, maxWidthPx: 8.5,
    });
    expect(result.stroke.points[5].widthPx).toBeCloseTo(8.5, 8);
    expect(result.stroke.points[4].widthPx).toBeGreaterThan(4.0);
    for (const idx of [0, 1, 2, 8, 9, 10]) expect(result.stroke.points[idx].widthPx).toBe(4.0);
    expect(result.maxOutsideRadiusDeltaPx).toBe(0);
    expect(result.affectedPointCount).toBe(5);
    expect(result.untouchedPointCount).toBe(6);
  });

  it("3. thin 모드: 브러시 내부만 가늘어지고 minWidthPx 하한 및 원거리 0.0px 불변을 지킨다", () => {
    const stroke = makeLinearStroke("eyelash", 0, 40, 100, 40, 10, 5.0);
    const result = sculptVectorInkStrokeWidth(stroke, {
      centerX: 30, centerY: 40, brushRadiusPx: 18, mode: "thin", strengthPx: 8.0, minWidthPx: 0.75, maxWidthPx: 12,
    });
    expect(result.stroke.points[3].widthPx).toBeCloseTo(0.75, 8);
    expect(result.stroke.points[2].widthPx).toBeLessThan(5.0);
    for (const idx of [0, 1, 5, 6, 7, 8, 9, 10]) expect(result.stroke.points[idx].widthPx).toBe(5.0);
    expect(result.maxOutsideRadiusDeltaPx).toBe(0);
  });

  it("4. 가우시안 감쇠 단조성: 중심에 가까운 제어점이 반경 가장자리 제어점보다 변화량이 크다", () => {
    const stroke = makeLinearStroke("monotone", 0, 0, 100, 0, 20, 3.0);
    const res = sculptVectorInkStrokeWidth(stroke, {
      centerX: 50, centerY: 0, brushRadiusPx: 26, mode: "thicken", strengthPx: 4.0, maxWidthPx: 20,
    });
    const deltas = [10, 11, 12, 13, 14].map((idx) => res.stroke.points[idx].widthPx - 3.0);
    expect(deltas[0]).toBeGreaterThan(deltas[1]);
    expect(deltas[1]).toBeGreaterThan(deltas[2]);
    expect(deltas[2]).toBeGreaterThan(deltas[3]);
    expect(deltas[3]).toBeGreaterThan(deltas[4]);
    expect(deltas[4]).toBeGreaterThan(0);
    expect(res.stroke.points[16].widthPx - 3.0).toBe(0);
  });

  it("5. sharpen-tips 모드: 끝단 제어점을 내부보다 더 날카롭게 깎고 원거리 구간은 0.0px 보존한다", () => {
    const stroke = makeLinearStroke("hair-tip", 0, 20, 100, 20, 10, 6.0);
    const res = sculptVectorInkStrokeWidth(stroke, {
      centerX: 10, centerY: 20, brushRadiusPx: 25, mode: "sharpen-tips", strengthPx: 4.5, minWidthPx: 0.4, maxWidthPx: 12,
    });
    expect(res.stroke.points[0].widthPx).toBeLessThan(6.0);
    expect(res.stroke.points[0].widthPx).toBeLessThan(res.stroke.points[2].widthPx);
    expect(res.stroke.points[0].widthPx).toBeGreaterThanOrEqual(0.4);
    for (const idx of [4, 5, 6, 7, 8, 9, 10]) expect(res.stroke.points[idx].widthPx).toBe(6.0);
  });

  it("6. uniform-clamp 모드: 반경 내부의 과대·과소 선폭을 목표 범위로 균일 고정하고 외부는 보존한다", () => {
    const stroke: VectorInkStroke = {
      id: "erratic-width",
      points: [
        { x: 0, y: 0, widthPx: 15.0, pressure: 1.0 },
        { x: 25, y: 0, widthPx: 12.0, pressure: 0.9 },
        { x: 50, y: 0, widthPx: 0.1, pressure: 0.1 },
        { x: 75, y: 0, widthPx: 14.0, pressure: 0.95 },
        { x: 100, y: 0, widthPx: 16.0, pressure: 1.0 },
      ],
      closed: false,
      taperStartPx: 0,
      taperEndPx: 0,
    };
    const clamped = sculptVectorInkStrokeWidth(stroke, {
      centerX: 50, centerY: 0, brushRadiusPx: 30, mode: "uniform-clamp", minWidthPx: 1.5, maxWidthPx: 4.5,
    });
    expect(clamped.stroke.points[1].widthPx).toBe(4.5);
    expect(clamped.stroke.points[2].widthPx).toBe(1.5);
    expect(clamped.stroke.points[3].widthPx).toBe(4.5);
    expect(clamped.stroke.points[0].widthPx).toBe(15.0);
    expect(clamped.stroke.points[4].widthPx).toBe(16.0);

    const targeted = sculptVectorInkStrokeWidth(stroke, {
      centerX: 50, centerY: 0, brushRadiusPx: 30, mode: "uniform-clamp", targetWidthPx: 3.0, minWidthPx: 1.0, maxWidthPx: 5.0,
    });
    expect(targeted.stroke.points[2].widthPx).toBeCloseTo(3.0, 6);
    expect(targeted.stroke.points[0].widthPx).toBe(15.0);
  });

  it("7. 반경 0 또는 원거리 클릭 조각은 제어점 변동 0건과 동일 SHA-256을 유지한다", () => {
    const stroke = makeLinearStroke("untouched", 0, 0, 50, 0, 5, 3.0);
    const res = sculptVectorInkStrokeWidth(stroke, {
      centerX: 300, centerY: 300, brushRadiusPx: 20, mode: "thicken", strengthPx: 5,
    });
    expect(res.affectedPointCount).toBe(0);
    expect(res.afterSha256).toBe(res.beforeSha256);
  });

  it("8. FIPS 180-4 SHA-256 NIST 표준 벡터(빈 문자열·abc·2블록·한글 UTF-8)가 비트-정확하다", () => {
    expect(sha256VectorInkHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256VectorInkHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256VectorInkHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    const ko = sha256VectorInkHex("툰스튜디오-웨이브120-벡터먹선");
    expect(ko).toMatch(/^[0-9a-f]{64}$/);
    expect(ko).toBe(sha256VectorInkHex("툰스튜디오-웨이브120-벡터먹선"));
  });

  it("9. computeVectorInkLayerSha256Hex는 결정론적으로 일치하며 0.01px 변경에도 즉시 달라진다", () => {
    const layerA = makeLayer([makeLinearStroke("s1", 10, 10, 80, 10, 4, 2.5)]);
    const layerB = makeLayer([makeLinearStroke("s1", 10, 10, 80.01, 10, 4, 2.5)]);
    expect(computeVectorInkLayerSha256Hex(layerA)).toBe(computeVectorInkLayerSha256Hex(layerA));
    expect(computeVectorInkLayerSha256Hex(layerA)).not.toBe(computeVectorInkLayerSha256Hex(layerB));
  });

  it("10. 가역 Undo/Redo 스택이 선폭 조각과 교차 절단 후 원본 SHA-256을 비트-동일하게 복원한다", () => {
    const original = makeLayer([
      makeLinearStroke("main", 10, 50, 100, 50, 9, 3.0),
      makeLinearStroke("cross", 70, 10, 70, 90, 4, 3.0),
    ]);
    let history = createVectorInkHistory(original);
    const sculpted = sculptVectorInkLayerStrokeWidth(original, "main", {
      centerX: 40, centerY: 50, brushRadiusPx: 20, mode: "thicken", strengthPx: 2.5,
    });
    history = pushVectorInkEdit(history, sculpted.layer, "부분 선폭 두껍게 조각");
    const erased = eraseVectorStrokeToIntersections(sculpted.layer, "main", { x: 90, y: 50 });
    history = pushVectorInkEdit(history, erased.layer, "끝단 돌출 자투리 절단");

    const undoOnce = undoVectorInkEdit(history);
    expect(computeVectorInkLayerSha256Hex(getCurrentHistoryLayer(undoOnce))).toBe(
      computeVectorInkLayerSha256Hex(sculpted.layer),
    );
    const undoTwice = undoVectorInkEdit(undoOnce);
    const parity = verifyVectorInkUndoParity(original, erased.layer, getCurrentHistoryLayer(undoTwice));
    expect(parity.editedDiffersFromOriginal).toBe(true);
    expect(parity.restoredExactSha256).toBe(true);
    const redone = redoVectorInkEdit(redoVectorInkEdit(undoTwice));
    expect(computeVectorInkLayerSha256Hex(getCurrentHistoryLayer(redone))).toBe(
      computeVectorInkLayerSha256Hex(erased.layer),
    );
  });
});

describe("Wave 120: 만화 벡터 교차점 정밀 지우개 (Vector Intersection Eraser)", () => {
  it("11. X-교차 끝단 돌출 자투리를 교차점에서 정밀 절단한다 (residualOvershootPx < 1e-4)", () => {
    const layer = makeLayer([
      makeLinearStroke("collar", 10, 50, 95, 50, 5, 3.2),
      makeLinearStroke("shoulder", 70, 10, 70, 90, 4, 3.0),
    ]);
    const res = eraseVectorStrokeToIntersections(layer, "collar", { x: 88, y: 50 });
    expect(res.status).toBe("trimmed-end-tail");
    expect(res.residualOvershootPx).toBeLessThan(1e-4);
    expect(res.removedSpanPx).toBeCloseTo(25, 5);
    const lastPt = res.resultingStrokes[0].points[res.resultingStrokes[0].points.length - 1];
    expect(lastPt.x).toBeCloseTo(70, 6);
    expect(lastPt.y).toBeCloseTo(50, 6);
    expect(res.layer.strokes).toHaveLength(2);
  });

  it("12. X-교차 시작단 돌출 자투리를 교차점에서 정밀 절단한다 (residualOvershootPx < 1e-4)", () => {
    const layer = makeLayer([
      makeLinearStroke("brow", 15, 40, 100, 40, 5, 2.8),
      makeLinearStroke("nose-bridge", 35, 10, 35, 80, 4, 2.6),
    ]);
    const res = eraseVectorStrokeToIntersections(layer, "brow", { x: 20, y: 40 });
    expect(res.status).toBe("trimmed-start-tail");
    expect(res.residualOvershootPx).toBeLessThan(1e-4);
    expect(res.removedSpanPx).toBeCloseTo(20, 5);
    expect(res.resultingStrokes[0].points[0].x).toBeCloseTo(35, 6);
  });

  it("13. T-교차 장벽선 너머 삐져나온 자투리를 정밀 절단한다", () => {
    const layer = makeLayer([
      makeLinearStroke("hair-strand", 10, 60, 90, 60, 4, 2.5),
      makeLinearStroke("face-contour", 65, 20, 65, 60, 2, 3.0),
    ]);
    const hits = findStrokeIntersections(layer, "hair-strand");
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("t-junction");
    const res = eraseVectorStrokeToIntersections(layer, "hair-strand", { x: 82, y: 60 });
    expect(res.status).toBe("trimmed-end-tail");
    expect(res.residualOvershootPx).toBeLessThan(1e-4);
    expect(res.resultingStrokes[0].points[res.resultingStrokes[0].points.length - 1].x).toBeCloseTo(65, 6);
  });

  it("14. 두 교차점 사이 중간 구간 클릭 시 2개의 독립 서브 스트로크로 분할하고 선폭을 보존한다", () => {
    const variableStroke: VectorInkStroke = {
      id: "scarf",
      points: [
        { x: 10, y: 50, widthPx: 2.0, pressure: 0.4 },
        { x: 60, y: 50, widthPx: 6.0, pressure: 0.9 },
        { x: 110, y: 50, widthPx: 2.0, pressure: 0.4 },
      ],
      closed: false,
      taperStartPx: 4,
      taperEndPx: 4,
    };
    const layer = makeLayer([
      variableStroke,
      makeLinearStroke("bar-left", 35, 10, 35, 90, 2, 2.5),
      makeLinearStroke("bar-right", 85, 10, 85, 90, 2, 2.5),
    ]);
    const res = eraseVectorStrokeToIntersections(layer, "scarf", { x: 60, y: 50 });
    expect(res.status).toBe("split-middle-bridge");
    expect(res.residualOvershootPx).toBeLessThan(1e-4);
    expect(res.resultingStrokes).toHaveLength(2);
    const [partA, partB] = res.resultingStrokes;
    expect(partA.id).toBe("scarf__partA");
    expect(partB.id).toBe("scarf__partB");
    expect(partA.points[partA.points.length - 1].widthPx).toBeCloseTo(4.0, 5);
    expect(partB.points[0].widthPx).toBeCloseTo(4.0, 5);
  });

  it("15. 3곳 이상 교차하는 획에서 중간 슬롯 클릭 시 인접 두 교차점 사이만 정확히 절단한다", () => {
    const layer = makeLayer([
      makeLinearStroke("grid-h", 0, 50, 120, 50, 6, 2.4),
      makeLinearStroke("v1", 30, 10, 30, 90, 2, 2.0),
      makeLinearStroke("v2", 60, 10, 60, 90, 2, 2.0),
      makeLinearStroke("v3", 90, 10, 90, 90, 2, 2.0),
    ]);
    const res = eraseVectorStrokeToIntersections(layer, "grid-h", { x: 74, y: 50 });
    expect(res.status).toBe("split-middle-bridge");
    expect(res.intersections).toHaveLength(3);
    expect(res.removedSpanPx).toBeCloseTo(30, 5);
    expect(res.residualOvershootPx).toBeLessThan(1e-4);
    expect(res.resultingStrokes[0].points[res.resultingStrokes[0].points.length - 1].x).toBeCloseTo(60, 6);
    expect(res.resultingStrokes[1].points[0].x).toBeCloseTo(90, 6);
  });

  it("16. 사선·다중 세그먼트 곡선 먹선 교차 시 정확한 교차 좌표와 보간 선폭을 유지한다", () => {
    const diagonal: VectorInkStroke = {
      id: "diag-ink",
      points: [
        { x: 10, y: 10, widthPx: 2.0, pressure: 0.3 },
        { x: 50, y: 50, widthPx: 4.0, pressure: 0.7 },
        { x: 90, y: 90, widthPx: 6.0, pressure: 1.0 },
      ],
      closed: false,
      taperStartPx: 0,
      taperEndPx: 0,
    };
    const layer = makeLayer([diagonal, makeLinearStroke("counter-diag", 90, 10, 10, 90, 2, 3.0)]);
    const res = eraseVectorStrokeToIntersections(layer, "diag-ink", { x: 80, y: 80 });
    expect(res.status).toBe("trimmed-end-tail");
    expect(res.residualOvershootPx).toBeLessThan(1e-4);
    const cutPt = res.resultingStrokes[0].points[res.resultingStrokes[0].points.length - 1];
    expect(cutPt.x).toBeCloseTo(50, 6);
    expect(cutPt.y).toBeCloseTo(50, 6);
    expect(cutPt.widthPx).toBeCloseTo(4.0, 5);
  });

  it("17. 자기 교차(Self-Intersection) 고리 먹선의 자투리를 옵션에 따라 절단 또는 전체 삭제한다", () => {
    const loopStroke: VectorInkStroke = {
      id: "ribbon-loop",
      points: [
        { x: 10, y: 50, widthPx: 2.4, pressure: 0.5 },
        { x: 70, y: 50, widthPx: 3.0, pressure: 0.7 },
        { x: 70, y: 20, widthPx: 3.0, pressure: 0.7 },
        { x: 40, y: 20, widthPx: 3.0, pressure: 0.7 },
        { x: 40, y: 80, widthPx: 2.4, pressure: 0.5 },
      ],
      closed: false,
      taperStartPx: 0,
      taperEndPx: 0,
    };
    const layer = makeLayer([loopStroke]);
    const withSelf = eraseVectorStrokeToIntersections(layer, "ribbon-loop", { x: 40, y: 72 }, { includeSelfIntersections: true });
    expect(withSelf.status).toBe("trimmed-end-tail");
    expect(withSelf.residualOvershootPx).toBeLessThan(1e-4);
    expect(withSelf.resultingStrokes[0].points[withSelf.resultingStrokes[0].points.length - 1].y).toBeCloseTo(50, 6);

    const withoutSelf = eraseVectorStrokeToIntersections(layer, "ribbon-loop", { x: 40, y: 72 }, { includeSelfIntersections: false });
    expect(withoutSelf.status).toBe("whole-stroke-removed");
    expect(withoutSelf.layer.strokes).toHaveLength(0);
  });

  it("18. 닫힌 외곽선(closed: true)이 2곳 교차할 때 클릭한 호만 제거하고 단일 열린 획으로 개방한다", () => {
    const squareLoop: VectorInkStroke = {
      id: "frame-box",
      points: [
        { x: 20, y: 20, widthPx: 3.0, pressure: 0.7 },
        { x: 80, y: 20, widthPx: 3.0, pressure: 0.7 },
        { x: 80, y: 80, widthPx: 3.0, pressure: 0.7 },
        { x: 20, y: 80, widthPx: 3.0, pressure: 0.7 },
      ],
      closed: true,
      taperStartPx: 0,
      taperEndPx: 0,
    };
    const layer = makeLayer([squareLoop, makeLinearStroke("cutter", 50, 0, 50, 100, 2, 2.5)]);
    const res = eraseVectorStrokeToIntersections(layer, "frame-box", { x: 80, y: 50 });
    expect(res.status).toBe("opened-closed-loop");
    expect(res.residualOvershootPx).toBeLessThan(1e-4);
    expect(res.resultingStrokes[0].closed).toBe(false);
    expect(res.removedSpanPx).toBeCloseTo(120, 4);
  });

  it("19. 교차점이 없는 단독 스트로크 클릭 시 whole-stroke-removed 상태로 깔끔히 제거한다", () => {
    const layer = makeLayer([
      makeLinearStroke("solo-line", 10, 20, 60, 20, 3, 2.0),
      makeLinearStroke("keep-me", 10, 80, 90, 80, 3, 3.0),
    ]);
    const res = eraseVectorStrokeToIntersections(layer, "solo-line", { x: 35, y: 20 });
    expect(res.status).toBe("whole-stroke-removed");
    expect(res.layer.strokes).toHaveLength(1);
    expect(res.layer.strokes[0].id).toBe("keep-me");
  });

  it("20. 존재하지 않는 strokeId는 stroke-not-found를 반환하며 레이어를 변경하지 않는다", () => {
    const layer = makeLayer([makeLinearStroke("only", 10, 10, 60, 10, 2, 2.0)]);
    const res = eraseVectorStrokeToIntersections(layer, "missing-id", { x: 30, y: 10 });
    expect(res.status).toBe("stroke-not-found");
    expect(res.afterSha256).toBe(res.beforeSha256);
  });

  it("21. 허용 거리 밖 클릭은 click-too-far를 반환하며 레이어를 보존한다", () => {
    const layer = makeLayer([makeLinearStroke("top-line", 10, 10, 80, 10, 3, 2.0)]);
    const res = eraseVectorStrokeToIntersections(layer, "top-line", { x: 40, y: 110 }, { maxClickDistancePx: 24 });
    expect(res.status).toBe("click-too-far");
    expect(res.afterSha256).toBe(res.beforeSha256);
  });
});

describe("Wave 120: 해상도 독립 4K/600DPI SDF 재래스터화 & WebGPU WGSL", () => {
  it("22. 가변 폭 캡슐 SDF는 내부 음수·정확한 경계 0·외부 양수 및 비대칭 반경을 해석적으로 계산한다", () => {
    // A=(0,0) r0=4, B=(20,0) r1=1 -> ny = (4-1)/20 = 0.15, nx = sqrt(1 - 0.15^2)
    const ny = 0.15;
    const nx = Math.sqrt(1 - ny * ny);
    expect(signedDistanceToVariableWidthCapsule(0, 0, 0, 0, 4, 20, 0, 1)).toBeCloseTo(-4, 6);
    expect(signedDistanceToVariableWidthCapsule(20, 0, 0, 0, 4, 20, 0, 1)).toBeCloseTo(-1, 6);
    expect(signedDistanceToVariableWidthCapsule(-4, 0, 0, 0, 4, 20, 0, 1)).toBeCloseTo(0, 6);
    expect(signedDistanceToVariableWidthCapsule(21, 0, 0, 0, 4, 20, 0, 1)).toBeCloseTo(0, 6);
    // 원추 접선 위의 정확한 접점 (20 + r1*ny, r1*nx) 에서 SDF = 0
    expect(signedDistanceToVariableWidthCapsule(20 + ny, nx, 0, 0, 4, 20, 0, 1)).toBeCloseTo(0, 6);
    // (20, 1)은 접선 높이(1/nx ≈ 1.0114) 안쪽이므로 미세 음수
    expect(signedDistanceToVariableWidthCapsule(20, 1, 0, 0, 4, 20, 0, 1)).toBeLessThan(0);
    expect(signedDistanceToVariableWidthCapsule(20, 5, 0, 0, 4, 20, 0, 1)).toBeGreaterThan(3.5);
    expect(signedDistanceToVariableWidthCapsule(2, 3, 0, 0, 4, 20, 0, 1)).toBeLessThan(0);
    expect(signedDistanceToVariableWidthCapsule(18, 3, 0, 0, 4, 20, 0, 1)).toBeGreaterThan(0);
  });

  it("23. 1x(150DPI)·2x(300DPI)·4x(600DPI) SDF 타일이 유한 알파 [0,1]·결정론 SHA-256·면적 일관성을 유지한다", () => {
    const layer = makeLayer(
      [makeLinearStroke("line-a", 12, 32, 52, 32, 4, 3.6, 4, 4), makeLinearStroke("line-b", 32, 12, 32, 52, 4, 3.2)],
      "dpi-scale-test",
      64,
    );
    const t1 = rerenderVectorInkToAlphaTile(layer, 64, 64, 1);
    const t2 = rerenderVectorInkToAlphaTile(layer, 128, 128, 2);
    const t4 = rerenderVectorInkToAlphaTile(layer, 256, 256, 4);
    expect(t1.effectiveDpi).toBe(150);
    expect(t2.effectiveDpi).toBe(300);
    expect(t4.effectiveDpi).toBe(600);
    expect(t4.sha256Hex).toBe(rerenderVectorInkToAlphaTile(layer, 256, 256, 4).sha256Hex);
    expect(Math.abs(t4.coverageRatio - t1.coverageRatio)).toBeLessThan(0.02);
    for (let i = 0; i < t4.alpha.length; i += 1) {
      expect(Number.isFinite(t4.alpha[i]) && t4.alpha[i] >= 0 && t4.alpha[i] <= 1).toBe(true);
    }
  });

  it("24. 1x→4x(600DPI) 벡터 SDF 재렌더링이 래스터 바이리니어 확대 대비 선명도 우위 > 1.8x를 입증한다", () => {
    const layer = makeLayer(
      [makeLinearStroke("frame-top", 8, 20, 56, 20, 4, 3.4), makeLinearStroke("frame-vert", 32, 8, 32, 56, 4, 3.0)],
      "panel-ink-sharp",
      64,
    );
    const comp = compareVectorRerenderVsRasterUpscale(layer, 64, 64, 4);
    expect(comp.targetWidth).toBe(256);
    expect(comp.targetDpi).toBe(600);
    expect(comp.sharpnessAdvantageRatio).toBeGreaterThan(1.8);
    expect(comp.passedAdvantageGate).toBe(true);
    expect(comp.vectorTransitionBandPx).toBeLessThan(comp.rasterUpscaleTransitionBandPx);
    expect(comp.vectorTransitionPixelCount).toBeLessThan(comp.rasterTransitionPixelCount);
  });

  it("25. 대각선·가변 필압 만화 펜선 곡선에서도 4x SDF 직접 재렌더링이 1.8x 초과 선명도 우위를 달성한다", () => {
    const curvedInk: VectorInkStroke = {
      id: "hero-cape-curve",
      points: [
        { x: 10, y: 54, widthPx: 1.8, pressure: 0.3 },
        { x: 24, y: 34, widthPx: 4.2, pressure: 0.8 },
        { x: 42, y: 20, widthPx: 5.0, pressure: 0.95 },
        { x: 56, y: 12, widthPx: 1.6, pressure: 0.25 },
      ],
      closed: false,
      taperStartPx: 4,
      taperEndPx: 4,
    };
    const comp = compareVectorRerenderVsRasterUpscale(makeLayer([curvedInk], "curved-ink-4k", 64), 64, 64, 4);
    expect(comp.sharpnessAdvantageRatio).toBeGreaterThan(1.8);
    expect(comp.passedAdvantageGate).toBe(true);
    expect(comp.transitionTighteningRatio).toBeGreaterThan(1.5);
  });

  it("26. buildVectorInkSdfWgsl()는 16바이트 정렬 유니폼·컴퓨트/프래그먼트 진입점 WGSL을 생성하고 검증을 통과한다", () => {
    const artifact = buildVectorInkSdfWgsl({ workgroupSizeX: 8, workgroupSizeY: 8 });
    const validation = validateVectorInkSdfWgsl(artifact);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.uniformAligned16).toBe(true);
    expect(validation.glslForbiddenHits).toEqual([]);
    expect(validation.entryPoints).toContain("cs_rerender_sdf");
    expect(validation.entryPoints).toContain("fs_rerender_sdf");
    expect(artifact.uniformStrideBytes % 16).toBe(0);
    expect(artifact.segmentStrideBytes % 16).toBe(0);
    expect(artifact.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("27. validateVectorInkSdfWgsl()는 빈 소스·중괄호 불균형·NaN 손상 WGSL을 거부한다", () => {
    expect(validateVectorInkSdfWgsl("").valid).toBe(false);
    const valid = buildVectorInkSdfWgsl();
    expect(validateVectorInkSdfWgsl({ ...valid, wgsl: `${valid.wgsl}\n{` }).valid).toBe(false);
    expect(validateVectorInkSdfWgsl(valid.wgsl.replace("0.550000", "NaN")).valid).toBe(false);
  });

  it("28. validateVectorInkSdfWgsl()는 GLSL 금지 토큰(gl_FragColor·#version·layout·vec3()을 검출·거부한다", () => {
    const valid = buildVectorInkSdfWgsl();
    const glslInjected = `#version 450\nlayout(binding = 0) uniform float u;\n${valid.wgsl}\n// gl_FragColor = vec4(1.0);`;
    const result = validateVectorInkSdfWgsl(glslInjected);
    expect(result.valid).toBe(false);
    expect(result.glslForbiddenHits).toContain("#version");
    expect(result.glslForbiddenHits).toContain("layout(...)");
    expect(result.glslForbiddenHits).toContain("gl_FragColor");
    expect(result.glslForbiddenHits).toContain("bare-vec-ctor");
  });

  it("29. validateVectorInkSdfWgsl()는 16바이트 비정렬 스트라이드 및 비정렬 vec3 유니폼 필드를 거부한다", () => {
    const valid = buildVectorInkSdfWgsl();
    const badStride = validateVectorInkSdfWgsl({ ...valid, uniformStrideBytes: 20, segmentStrideBytes: 24 });
    expect(badStride.valid).toBe(false);
    expect(badStride.uniformAligned16).toBe(false);
    const badField = validateVectorInkSdfWgsl(valid.wgsl.replace("ink_rgba: vec4<f32>,", "ink_rgb: vec3<f32>,"));
    expect(badField.valid).toBe(false);
    expect(badField.uniformAligned16).toBe(false);
  });

  it("30. validateVectorInkSdfWgsl()는 필수 바인딩(@group/@binding) 또는 진입점 누락을 거부한다", () => {
    const valid = buildVectorInkSdfWgsl();
    expect(validateVectorInkSdfWgsl(valid.wgsl.replace("@group(0) @binding(1) var<storage, read>", "var<private>")).valid).toBe(false);
    const noEntry = validateVectorInkSdfWgsl(
      valid.wgsl.replace("@compute @workgroup_size(8, 8, 1)", "// removed").replace("@fragment", "// removed"),
    );
    expect(noEntry.valid).toBe(false);
    expect(noEntry.entryPoints).toHaveLength(0);
  });
});

describe("Wave 120: 순수 OKLCH 검수 SVG · 번역투 없는 한국어 QA 브리프 & E2E", () => {
  it("31. renderVectorInkReeditAuditSvg는 순수 oklch(...)만 사용하고 원시 색상·NaN/Infinity가 0건이다", () => {
    const before = makeLayer(
      [makeLinearStroke("hair", 8, 32, 58, 32, 4, 3.4), makeLinearStroke("cheek", 44, 10, 44, 54, 4, 3.0)],
      "svg-oklch-test",
      64,
    );
    const erased = eraseVectorStrokeToIntersections(before, "hair", { x: 54, y: 32 });
    const comp = compareVectorRerenderVsRasterUpscale(erased.layer, 64, 64, 4);
    const svg = renderVectorInkReeditAuditSvg(before, erased.layer, comp, {
      eraserResult: erased,
      sculptZone: { centerX: 24, centerY: 32, brushRadiusPx: 10 },
    });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(/#[0-9a-fA-F]{3,8}\b/.test(svg)).toBe(false);
    expect(/\brgba?\s*\(/i.test(svg)).toBe(false);
    expect(/\bhsla?\s*\(/i.test(svg)).toBe(false);
    expect(/\b(?:NaN|Infinity|undefined)\b/.test(svg)).toBe(false);
  });

  it("32. renderVectorInkReeditAuditSvg는 제목·레이어 ID의 XML/XSS 특수문자를 안전하게 이스케이프한다", () => {
    const dangerousLayer = makeLayer(
      [makeLinearStroke("s1", 10, 30, 54, 30, 3, 3.0)],
      `ink<script>alert("xss")</script>&'test'`,
      64,
    );
    const comp = compareVectorRerenderVsRasterUpscale(dangerousLayer, 64, 64, 4);
    const svg = renderVectorInkReeditAuditSvg(dangerousLayer, dangerousLayer, comp, {
      titleOverrideKo: `검수 <img src=x onerror="1"> & '체크'`,
    });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("33. summarizeVectorInkKernelKo는 절단 상태와 실측 선명도 지표를 한국어로 명확히 요약한다", () => {
    const baseLayer = makeLayer(
      [
        makeLinearStroke("s-main", 8, 32, 56, 32, 4, 3.2),
        makeLinearStroke("s-cut1", 24, 8, 24, 56, 2, 2.8),
        makeLinearStroke("s-cut2", 42, 8, 42, 56, 2, 2.8),
      ],
      "qa-page",
      64,
    );
    const splitRes = eraseVectorStrokeToIntersections(baseLayer, "s-main", { x: 33, y: 32 });
    const comp = compareVectorRerenderVsRasterUpscale(splitRes.layer, 64, 64, 4);
    const brief = summarizeVectorInkKernelKo(splitRes, comp, { inspectedDateIso: "2026-11-28" });
    expect(brief).toContain("2026-11-28");
    expect(brief).toContain("독립 획 2개로 분리");
    expect(brief).toContain("600 DPI");
    expect(brief).toContain("최종 판정: 합격");
    expect(brief).toContain(splitRes.afterSha256.slice(0, 16));
  });

  it("34. summarizeVectorInkKernelKo는 금지 AI 번역투 표현이 0건이다", () => {
    const layer = makeLayer(
      [makeLinearStroke("line-1", 8, 30, 56, 30, 4, 3.0), makeLinearStroke("line-2", 44, 10, 44, 52, 2, 3.0)],
      "natural-ko-check",
      64,
    );
    const sculpt = sculptVectorInkStrokeWidth(layer.strokes[0], {
      centerX: 20, centerY: 30, brushRadiusPx: 14, mode: "thicken", strengthPx: 1.6,
    });
    const erased = eraseVectorStrokeToIntersections(layer, "line-1", { x: 52, y: 30 });
    const comp = compareVectorRerenderVsRasterUpscale(erased.layer, 64, 64, 4);
    const brief = summarizeVectorInkKernelKo(erased, comp, { sculptResult: sculpt });
    for (const phrase of ["가능하게 합니다", "직관적인 경험을 제공", "원활한 워크플로우를 보장", "혁신적인", "극대화합니다"]) {
      expect(brief).not.toContain(phrase);
    }
    expect(brief).toContain("부분 선폭 조각(thicken)");
  });

  it("35. sculptVectorInkLayerStrokeWidth는 대상 외 스트로크 참조를 그대로 유지한다", () => {
    const s1 = makeLinearStroke("hero-line", 0, 20, 80, 20, 4, 3.0);
    const s2 = makeLinearStroke("bg-line", 0, 60, 80, 60, 4, 2.0);
    const { layer: nextLayer, sculptResult } = sculptVectorInkLayerStrokeWidth(makeLayer([s1, s2]), "hero-line", {
      centerX: 40, centerY: 20, brushRadiusPx: 25, mode: "thicken", strengthPx: 2.0,
    });
    expect(sculptResult).not.toBeNull();
    expect(nextLayer.strokes[1]).toBe(s2);
    expect(nextLayer.strokes[0]).not.toBe(s1);
  });

  it("36. E2E 만화 펜선 파이프라인: 선폭 조각 → 자투리 절단 → Undo 복원 → 4x SDF → SVG·브리프", () => {
    const initial = makeLayer(
      [
        makeLinearStroke("collar-ink", 6, 32, 60, 32, 9, 3.0, 3, 3),
        makeLinearStroke("left-frame", 20, 8, 20, 56, 4, 3.2),
        makeLinearStroke("right-frame", 46, 8, 46, 56, 4, 3.2),
      ],
      "ep120-cut04-ink",
      64,
    );
    let history = createVectorInkHistory(initial, "원본 먹선");
    const sculptOp = sculptVectorInkLayerStrokeWidth(initial, "collar-ink", {
      centerX: 33, centerY: 32, brushRadiusPx: 12, mode: "thicken", strengthPx: 1.8, maxWidthPx: 6.0,
    });
    expect(sculptOp.sculptResult?.maxOutsideRadiusDeltaPx).toBe(0);
    history = pushVectorInkEdit(history, sculptOp.layer, "선폭 조각");

    const trimEnd = eraseVectorStrokeToIntersections(sculptOp.layer, "collar-ink", { x: 54, y: 32 });
    expect(trimEnd.status).toBe("trimmed-end-tail");
    expect(trimEnd.residualOvershootPx).toBeLessThan(1e-4);
    history = pushVectorInkEdit(history, trimEnd.layer, "우측 자투리 절단");

    const trimStart = eraseVectorStrokeToIntersections(trimEnd.layer, "collar-ink", { x: 10, y: 32 });
    expect(trimStart.status).toBe("trimmed-start-tail");
    expect(trimStart.residualOvershootPx).toBeLessThan(1e-4);
    history = pushVectorInkEdit(history, trimStart.layer, "좌측 자투리 절단");

    const restored = getCurrentHistoryLayer(undoVectorInkEdit(undoVectorInkEdit(undoVectorInkEdit(history))));
    expect(verifyVectorInkUndoParity(initial, trimStart.layer, restored).restoredExactSha256).toBe(true);

    const comp = compareVectorRerenderVsRasterUpscale(trimStart.layer, 64, 64, 4);
    expect(comp.passedAdvantageGate).toBe(true);
    expect(comp.sharpnessAdvantageRatio).toBeGreaterThan(1.8);

    const svg = renderVectorInkReeditAuditSvg(initial, trimStart.layer, comp, {
      eraserResult: trimStart,
      sculptZone: { centerX: 33, centerY: 32, brushRadiusPx: 12 },
    });
    expect(svg).toContain("4K 재렌더링 합격");
    expect(/#[0-9a-fA-F]{3,8}\b/.test(svg)).toBe(false);

    const brief = summarizeVectorInkKernelKo(trimStart, comp, {
      sculptResult: sculptOp.sculptResult ?? undefined,
      inspectedDateIso: "2026-11-28",
    });
    expect(brief).toContain("최종 판정: 합격");
  });
});
