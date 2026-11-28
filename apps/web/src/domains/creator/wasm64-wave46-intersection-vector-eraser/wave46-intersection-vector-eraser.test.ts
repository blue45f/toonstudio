import { describe, expect, it } from "vitest";

import {
  PolylineSpatialIntersectionIndex,
  buildPolylineSpatialIntersectionIndex,
  computePolylineCurvatures,
  eraseUpToIntersections,
  pruneMicroOverhangs,
  sliceStrokeByArcRange,
  weldMagneticEndpoints,
  type VectorLineartStroke,
} from "./index";

function makeStroke(
  id: string,
  coords: readonly (readonly [number, number])[],
  pressures?: readonly number[],
  closed = false,
): VectorLineartStroke {
  const points = coords.map(([x, y]) => ({ x, y }));
  const resolvedPressures = pressures ?? coords.map(() => 0.7);
  return { id, points, pressures: resolvedPressures, closed };
}

describe("wasm64-wave46-intersection-vector-eraser", () => {
  it("1. 공간 해시 인덱스가 X자 선분-선분 정확 교차점(tA, tB, x, y)을 추출한다", () => {
    const strokes = [
      makeStroke("h", [[0, 50], [100, 50]]),
      makeStroke("v", [[40, 0], [40, 100]]),
    ];
    const result = buildPolylineSpatialIntersectionIndex(strokes, { cellSizePx: 24 }).extractIntersections();

    expect(result.intersections).toHaveLength(1);
    const ix = result.intersections[0];
    expect(ix).toBeDefined();
    expect(ix?.kind).toBe("crossing");
    expect(ix?.x).toBeCloseTo(40, 5);
    expect(ix?.y).toBeCloseTo(50, 5);
    expect(ix?.tA).toBeCloseTo(0.4, 5);
    expect(ix?.tB).toBeCloseTo(0.5, 5);
    expect(ix?.distancePx).toBe(0);
  });

  it("2. 근접 T-접합점을 snapTolerancePx 이내에서만 검출하고 초과 시 배제한다", () => {
    const strokes = [
      makeStroke("wall", [[50, 0], [50, 100]]),
      makeStroke("near-stem", [[0, 40], [47.5, 40]]),
      makeStroke("far-stem", [[0, 70], [44, 70]]),
    ];
    const result = new PolylineSpatialIntersectionIndex(strokes, {
      cellSizePx: 20,
      snapTolerancePx: 3.0,
    }).extractIntersections();

    expect(result.intersections).toHaveLength(1);
    const ix = result.intersections[0];
    expect(ix?.kind).toBe("t-junction");
    expect(ix?.x).toBeCloseTo(50, 5);
    expect(ix?.y).toBeCloseTo(40, 5);
    expect(ix?.distancePx).toBeCloseTo(2.5, 5);
    expect(result.junctionsByStrokeId.get("far-stem")).toBeUndefined();
  });

  it("3. 근접한 평행 비-교차 선분에서는 거짓 T-접합점을 생성하지 않는다", () => {
    const strokes = [
      makeStroke("p1", [[0, 10], [100, 10]]),
      makeStroke("p2", [[0, 12], [100, 12]]),
    ];
    const result = buildPolylineSpatialIntersectionIndex(strokes, {
      snapTolerancePx: 4.0,
    }).extractIntersections();

    expect(result.intersections).toHaveLength(0);
  });

  it("4. 폴리라인 내부 공유 꼭짓점을 관통하는 교차선은 중복 없이 1건으로 병합한다", () => {
    const strokes = [
      makeStroke("poly", [[0, 50], [50, 50], [100, 50]]),
      makeStroke("cutter", [[50, 0], [50, 100]]),
    ];
    const result = buildPolylineSpatialIntersectionIndex(strokes).extractIntersections();

    expect(result.intersections).toHaveLength(1);
    expect(result.intersections[0]?.x).toBeCloseTo(50, 5);
    expect(result.intersections[0]?.y).toBeCloseTo(50, 5);
  });

  it("5. 동일 스트로크의 비인접 선분 자기교차 검출 및 비활성화 옵션을 지원한다", () => {
    const ribbonLoop = makeStroke("loop", [[0, 0], [60, 60], [60, 0], [0, 60]]);
    const enabled = buildPolylineSpatialIntersectionIndex([ribbonLoop], {
      includeSelfIntersections: true,
    }).extractIntersections();
    const disabled = buildPolylineSpatialIntersectionIndex([ribbonLoop], {
      includeSelfIntersections: false,
    }).extractIntersections();

    expect(enabled.intersections).toHaveLength(1);
    expect(enabled.intersections[0]?.x).toBeCloseTo(30, 5);
    expect(enabled.intersections[0]?.y).toBeCloseTo(30, 5);
    expect(disabled.intersections).toHaveLength(0);
  });

  it("6. 대량 격자 선화(240선·120교차)에서 균일 격자 공간 해시가 높은 가지치기 효율로 전수 교차를 찾는다", () => {
    const spacedStrokes: VectorLineartStroke[] = [];
    for (let i = 0; i < 120; i += 1) {
      const base = i * 40;
      spacedStrokes.push(makeStroke(`cell-h-${i}`, [[base, base], [base + 30, base]]));
      spacedStrokes.push(makeStroke(`cell-v-${i}`, [[base + 15, base - 15], [base + 15, base + 15]]));
    }
    const result = buildPolylineSpatialIntersectionIndex(spacedStrokes, {
      cellSizePx: 32,
      snapTolerancePx: 1,
    }).extractIntersections();

    expect(result.intersections).toHaveLength(120);
    expect(result.stats.pruningRatio).toBeGreaterThan(0.95);
    expect(result.stats.candidatePairsTested).toBeLessThan(result.stats.bruteForcePairCount * 0.05);
  });

  it("7. X자 교차 잔선을 1회 스침으로 교차점까지만 정밀 절단하고 본체와 상대 선을 보존한다", () => {
    const strokes = [
      makeStroke("line-a", [[0, 50], [80, 50]], [0.2, 1.0]),
      makeStroke("line-b", [[50, 0], [50, 100]], [0.5, 0.5]),
    ];
    const erased = eraseUpToIntersections(strokes, [{ x: 65, y: 42 }, { x: 65, y: 58 }], {
      eraserRadiusPx: 3,
    });

    expect(erased.erasedSpans).toHaveLength(1);
    expect(erased.erasedSpans[0]?.strokeId).toBe("line-a");
    expect(erased.erasedSpans[0]?.removedLengthPx).toBeCloseTo(30, 4);
    expect(erased.strokes).toHaveLength(2);

    const remainingA = erased.strokes.find((s) => s.id === "line-a");
    const remainingB = erased.strokes.find((s) => s.id === "line-b");
    expect(remainingA?.points[0]).toEqual({ x: 0, y: 50 });
    expect(remainingA?.points[remainingA.points.length - 1]?.x).toBeCloseTo(50, 5);
    expect(remainingA?.points[remainingA.points.length - 1]?.y).toBeCloseTo(50, 5);
    expect(remainingB?.points).toEqual(strokes[1]?.points);
  });

  it("8. 두 교차점 사이 중간 구간을 스치면 양쪽 교차점을 경계로 2개 세그먼트로 정밀 분할한다", () => {
    const strokes = [
      makeStroke("rail", [[0, 50], [100, 50]], [0.1, 0.9]),
      makeStroke("left-cut", [[30, 0], [30, 100]]),
      makeStroke("right-cut", [[70, 0], [70, 100]]),
    ];
    const erased = eraseUpToIntersections(strokes, [{ x: 50, y: 40 }, { x: 50, y: 60 }]);

    expect(erased.splitStrokeCount).toBe(1);
    const leftPart = erased.strokes.find((s) => s.id === "rail__part-0");
    const rightPart = erased.strokes.find((s) => s.id === "rail__part-1");
    expect(leftPart).toBeDefined();
    expect(rightPart).toBeDefined();
    expect(leftPart?.points[0]?.x).toBeCloseTo(0, 5);
    expect(leftPart?.points[leftPart.points.length - 1]?.x).toBeCloseTo(30, 5);
    expect(rightPart?.points[0]?.x).toBeCloseTo(70, 5);
    expect(rightPart?.points[rightPart.points.length - 1]?.x).toBeCloseTo(100, 5);
  });

  it("9. 근접 T-접합점 경계를 인식해 가로막대의 한쪽 구간만 정밀 절단한다", () => {
    const strokes = [
      makeStroke("bar", [[0, 50], [100, 50]]),
      makeStroke("stem", [[40, 0], [40, 48]]),
    ];
    const erased = eraseUpToIntersections(strokes, [{ x: 75, y: 44 }, { x: 75, y: 56 }], {
      snapTolerancePx: 3.0,
    });

    const bar = erased.strokes.find((s) => s.id === "bar");
    expect(bar).toBeDefined();
    expect(bar?.points[0]?.x).toBeCloseTo(0, 5);
    expect(bar?.points[bar.points.length - 1]?.x).toBeCloseTo(40, 5);
    expect(erased.erasedSpans[0]?.startBoundaryKind).toBe("t-junction");
  });

  it("10. 절단 후 남은 세그먼트의 원본 내부 필압을 무손실 보존하고 절단 경계 필압·곡률을 단조 보간한다", () => {
    const curved = makeStroke(
      "curve",
      [[0, 0], [20, 6], [40, 16], [60, 20], [80, 12], [100, 0]],
      [0.15, 0.45, 0.85, 0.92, 0.55, 0.2],
    );
    const originalCurvatures = computePolylineCurvatures(curved.points);
    const sliced = sliceStrokeByArcRange(curved, 10, 75, "curve-sliced");

    expect(sliced).not.toBeNull();
    expect(sliced?.points.length).toBe(sliced?.pressures.length);
    expect(sliced?.points.length).toBe(sliced?.curvatures?.length);

    // 내부 원본 정점 [20, 6], [40, 16], [60, 20] 과 원본 필압이 손실 없이 그대로 남아 있어야 한다.
    const idx20 = sliced?.points.findIndex((p) => Math.abs(p.x - 20) < 1e-6 && Math.abs(p.y - 6) < 1e-6) ?? -1;
    const idx40 = sliced?.points.findIndex((p) => Math.abs(p.x - 40) < 1e-6 && Math.abs(p.y - 16) < 1e-6) ?? -1;
    const idx60 = sliced?.points.findIndex((p) => Math.abs(p.x - 60) < 1e-6 && Math.abs(p.y - 20) < 1e-6) ?? -1;
    expect(idx20).toBeGreaterThan(0);
    expect(idx40).toBe(idx20 + 1);
    expect(idx60).toBe(idx40 + 1);
    expect(sliced?.pressures[idx20]).toBe(0.45);
    expect(sliced?.pressures[idx40]).toBe(0.85);
    expect(sliced?.pressures[idx60]).toBe(0.92);
    expect(sliced?.curvatures?.[idx40]).toBeCloseTo(originalCurvatures[2] ?? 0, 6);

    // 절단 경계 필압은 양 끝 정점 범위 안쪽에 단조 보간되어야 한다(오버슈트 금지).
    const firstP = sliced?.pressures[0] ?? -1;
    const lastP = sliced?.pressures[sliced.pressures.length - 1] ?? -1;
    expect(firstP).toBeGreaterThanOrEqual(0.15);
    expect(firstP).toBeLessThanOrEqual(0.45);
    expect(lastP).toBeGreaterThanOrEqual(0.55);
    expect(lastP).toBeLessThanOrEqual(0.92);
  });

  it("11. 교차점 바로 옆 짧은 잔선을 단일 점 지우개로 탭해도 반대편 본체는 보호한다", () => {
    const strokes = [
      makeStroke("main", [[0, 50], [56, 50]]),
      makeStroke("wall", [[50, 0], [50, 100]]),
    ];
    const erased = eraseUpToIntersections(strokes, [{ x: 52, y: 50 }], {
      eraserRadiusPx: 5,
    });

    const main = erased.strokes.find((s) => s.id === "main");
    expect(main).toBeDefined();
    expect(main?.points[0]?.x).toBeCloseTo(0, 5);
    expect(main?.points[main.points.length - 1]?.x).toBeCloseTo(50, 5);
  });

  it("12. 평행·비교차 선은 기본 보호 모드에서 유지되고 erase-whole 지정 시에만 제거된다", () => {
    const strokes = [
      makeStroke("parallel-safe", [[0, 20], [100, 20]]),
      makeStroke("parallel-neighbor", [[0, 22], [100, 22]]),
    ];
    const path = [{ x: 50, y: 18 }, { x: 50, y: 24 }];

    const preserved = eraseUpToIntersections(strokes, path, { eraserRadiusPx: 3 });
    expect(preserved.strokes).toHaveLength(2);
    expect(preserved.protectedUnintersectedStrokeIds).toEqual(["parallel-safe", "parallel-neighbor"]);

    const forceErased = eraseUpToIntersections(strokes, path, {
      eraserRadiusPx: 3,
      unintersectedBehavior: "erase-whole",
    });
    expect(forceErased.strokes).toHaveLength(0);
    expect(forceErased.removedStrokeIds).toEqual(["parallel-safe", "parallel-neighbor"]);
  });

  it("13. pruneMicroOverhangs가 L자 이중 돌출 잔선을 단일 패스로 직각 모서리로 일괄 정리한다", () => {
    const strokes = [
      makeStroke("top", [[0, 50], [56, 50]], [0.4, 0.8]),
      makeStroke("right", [[50, 0], [50, 57]], [0.3, 0.9]),
    ];
    const pruned = pruneMicroOverhangs(strokes, { maxOverhangPx: 10 });

    expect(pruned.prunedCount).toBe(2);
    expect(pruned.totalRemovedLengthPx).toBeCloseTo(13, 4);
    const top = pruned.strokes.find((s) => s.id === "top");
    const right = pruned.strokes.find((s) => s.id === "right");
    expect(top?.points[top.points.length - 1]).toEqual({ x: 50, y: 50 });
    expect(right?.points[right.points.length - 1]).toEqual({ x: 50, y: 50 });
  });

  it("14. pruneMicroOverhangs는 maxOverhangPx를 초과하는 연장선과 비교차 독립 단선을 보호한다", () => {
    const strokes = [
      makeStroke("cross-h", [[0, 50], [100, 50]]),
      makeStroke("cross-v", [[50, 0], [50, 100]]),
      makeStroke("eyebrow-isolated", [[120, 20], [126, 20]]),
    ];
    const pruned = pruneMicroOverhangs(strokes, { maxOverhangPx: 12 });

    expect(pruned.prunedCount).toBe(0);
    expect(pruned.untouchedStrokeCount).toBe(3);
    expect(pruned.strokes).toHaveLength(3);
  });

  it("15. 양쪽 끝이 모두 maxOverhangPx 이하인 짧은 단일 교차 선은 본체를 남기고 짧은 꼬리만 정리한다", () => {
    const strokes = [
      makeStroke("short-dash", [[42, 50], [53, 50]]),
      makeStroke("wall", [[50, 0], [50, 100]]),
    ];
    const pruned = pruneMicroOverhangs(strokes, {
      maxOverhangPx: 12,
      preserveCoreStroke: true,
    });

    expect(pruned.prunedCount).toBe(1);
    const dash = pruned.strokes.find((s) => s.id === "short-dash");
    expect(dash?.points[0]?.x).toBeCloseTo(42, 5);
    expect(dash?.points[dash.points.length - 1]?.x).toBeCloseTo(50, 5);
  });

  it("16. 완만하게 벌어진 열린 끝점 쌍(각도 <= 35°)을 3차 베지어 브리지로 매끄럽게 용접한다", () => {
    const rad20 = (20 * Math.PI) / 180;
    const strokes = [
      makeStroke("s1", [[0, 0], [45, 0]], [0.3, 0.6]),
      makeStroke(
        "s2",
        [[55, 2], [55 + Math.cos(rad20) * 40, 2 + Math.sin(rad20) * 40]],
        [0.8, 0.5],
      ),
    ];
    const welded = weldMagneticEndpoints(strokes, {
      weldRadiusPx: 15,
      maxAngleErrorDeg: 35,
      bridgeSubdivisions: 6,
      enableTSnap: false,
    });

    expect(welded.weldedBridges).toHaveLength(1);
    expect(welded.weldedBridges[0]?.angleErrorDeg).toBeLessThanOrEqual(35);
    expect(welded.weldedBridges[0]?.bridgePointCount).toBe(5);
    expect(welded.strokes).toHaveLength(1);
    const merged = welded.strokes[0];
    expect(merged?.points.length).toBe(2 + 5 + 2);
    expect(merged?.pressures.length).toBe(merged?.points.length);
    // 베지어 브리지 중간 정점의 필압이 0.6과 0.8 사이에서 단조 전이된다.
    const midBridgePressure = merged?.pressures[4] ?? 0;
    expect(midBridgePressure).toBeGreaterThan(0.65);
    expect(midBridgePressure).toBeLessThan(0.75);
  });

  it("17. 방향 벡터 각도 오차가 35°를 초과하는 끝점 쌍은 자석 용접 가드가 차단한다", () => {
    const rad50 = (50 * Math.PI) / 180;
    const strokes = [
      makeStroke("arm-a", [[0, 0], [46, 0]]),
      makeStroke("arm-b", [[52, 2], [52 + Math.cos(rad50) * 40, 2 + Math.sin(rad50) * 40]]),
    ];
    const welded = weldMagneticEndpoints(strokes, {
      weldRadiusPx: 15,
      maxAngleErrorDeg: 35,
      enableTSnap: false,
    });

    expect(welded.weldedBridges).toHaveLength(0);
    expect(welded.rejectedNearEndpointPairs).toBeGreaterThanOrEqual(1);
    expect(welded.strokes).toHaveLength(2);
  });

  it("18. 방향은 일직선이어도 weldRadiusPx를 초과한 끝점 쌍은 용접하지 않는다", () => {
    const strokes = [
      makeStroke("left", [[0, 0], [40, 0]]),
      makeStroke("right", [[65, 0], [100, 0]]),
    ];
    const welded = weldMagneticEndpoints(strokes, {
      weldRadiusPx: 14,
      maxAngleErrorDeg: 35,
      enableTSnap: false,
    });

    expect(welded.weldedBridges).toHaveLength(0);
    expect(welded.strokes).toHaveLength(2);
  });

  it("19. 가까운 평행 선분 끝점은 방향 불일치로 잘못 루프 용접되거나 T-스냅되지 않는다", () => {
    const strokes = [
      makeStroke("top", [[0, 0], [60, 0]]),
      makeStroke("bottom", [[0, 6], [60, 6]]),
    ];
    const welded = weldMagneticEndpoints(strokes, {
      weldRadiusPx: 14,
      maxAngleErrorDeg: 35,
      enableTSnap: true,
    });

    expect(welded.weldedBridges).toHaveLength(0);
    expect(welded.tSnaps).toHaveLength(0);
    expect(welded.strokes).toHaveLength(2);
  });

  it("20. 3개 단절 체인(역방향 포함) 연쇄 용접 및 거의 닫힌 원호의 자기 폐곡선 용접을 수행한다", () => {
    const chainStrokes = [
      makeStroke("c1", [[0, 0], [30, 0]], [0.4, 0.5]),
      // c2는 의도적으로 역방향(66 -> 36)으로 입력
      makeStroke("c2", [[66, 0], [36, 0]], [0.7, 0.6]),
      makeStroke("c3", [[72, 0], [105, 0]], [0.8, 0.9]),
    ];
    const chainResult = weldMagneticEndpoints(chainStrokes, {
      weldRadiusPx: 10,
      maxAngleErrorDeg: 35,
      enableTSnap: false,
    });
    expect(chainResult.strokes).toHaveLength(1);
    expect(chainResult.weldedBridges).toHaveLength(2);
    expect(chainResult.strokes[0]?.points[0]?.x).toBeCloseTo(0, 5);
    expect(chainResult.strokes[0]?.points[chainResult.strokes[0].points.length - 1]?.x).toBeCloseTo(105, 5);

    // 반지름 50 원호에서 5°..355°(약 8.7px 틈) 구간 -> 자기 폐곡선 루프로 닫힘
    const arcCoords: [number, number][] = [];
    for (let deg = 5; deg <= 355; deg += 10) {
      const r = (deg * Math.PI) / 180;
      arcCoords.push([Math.cos(r) * 50, Math.sin(r) * 50]);
    }
    const loopResult = weldMagneticEndpoints([makeStroke("almost-circle", arcCoords)], {
      weldRadiusPx: 12,
      maxAngleErrorDeg: 35,
      allowSelfLoopClose: true,
    });
    expect(loopResult.weldedBridges).toHaveLength(1);
    expect(loopResult.weldedBridges[0]?.closedLoop).toBe(true);
    expect(loopResult.strokes[0]?.closed).toBe(true);
  });

  it("21. 미용접 열린 끝점의 인접 선분 T-스냅과 지우개→잔선 정리→자석 용접 통합 흐름이 일관되게 동작한다", () => {
    const rawLineart = [
      makeStroke("contour", [[100, 0], [100, 120]], [0.6, 0.6]),
      makeStroke("cross-top", [[0, 30], [125, 30]], [0.4, 0.8]),
      makeStroke("tail-short", [[0, 60], [106, 60]], [0.5, 0.7]),
      makeStroke("undershoot-rib", [[20, 90], [93, 90]], [0.5, 0.75]),
    ];

    // 1단계: 길게 삐져나온 cross-top의 오른쪽 잔선(25px)을 지우개 1회 스침으로 제거
    const afterErase = eraseUpToIntersections(rawLineart, [{ x: 112, y: 24 }, { x: 112, y: 36 }]);
    // 2단계: tail-short의 6px 미세 잔선을 자동 프루닝
    const afterPrune = pruneMicroOverhangs(afterErase.strokes, { maxOverhangPx: 10 });
    // 3단계: 7px 덜 닿은 undershoot-rib 끝점을 contour에 직선 연장 T-스냅
    const afterWeld = weldMagneticEndpoints(afterPrune.strokes, {
      weldRadiusPx: 10,
      enableTSnap: true,
    });

    const crossTop = afterWeld.strokes.find((s) => s.id === "cross-top");
    const tailShort = afterWeld.strokes.find((s) => s.id === "tail-short");
    const rib = afterWeld.strokes.find((s) => s.id === "undershoot-rib");

    expect(crossTop?.points[crossTop.points.length - 1]?.x).toBeCloseTo(100, 4);
    expect(tailShort?.points[tailShort.points.length - 1]?.x).toBeCloseTo(100, 4);
    expect(afterWeld.tSnaps).toHaveLength(1);
    expect(afterWeld.tSnaps[0]?.snapMode).toBe("ray-extension");
    expect(rib?.points[rib.points.length - 1]?.x).toBeCloseTo(100, 4);
    expect(rib?.points[rib.points.length - 1]?.y).toBeCloseTo(90, 4);
  });
});
