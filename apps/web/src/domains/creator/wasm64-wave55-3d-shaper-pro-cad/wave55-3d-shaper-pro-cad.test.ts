import { describe, expect, it } from "vitest";

import {
  applyParametricEdgeBevel,
  auditSolidManifoldIntegrity,
  booleanSolidIntersect,
  booleanSolidSubtract,
  booleanSolidUnion,
  createBoxSolidPrimitive,
  extractComicNprInkStrokes,
  extrudeSketchPushPull,
  insetExtrudePlanarFace,
  loftCrossSectionsSolid,
  ParametricCadFeatureTree,
  revolveProfileSolid,
  type CadSolidMesh,
  type Vec2,
} from "./index";

const RECT_ROOM_POLYGON: readonly Vec2[] = [
  [-2, -1.5],
  [2, -1.5],
  [2, 1.5],
  [-2, 1.5],
];

const L_SHAPED_ROOM_POLYGON: readonly Vec2[] = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
];

describe("wasm64-wave55-3d-shaper-pro-cad", () => {
  it("1. 2D 직사각형 평면도 Push/Pull 돌출은 수밀 솔리드·바닥 접지(Y=0)·실측 부피를 만족한다", () => {
    const solid = extrudeSketchPushPull({
      id: "room-rect",
      label: "웹툰 원룸 매스",
      polygon: RECT_ROOM_POLYGON,
      heightMeters: 2.8,
    });
    const audit = auditSolidManifoldIntegrity(solid);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.boundaryEdges).toBe(0);
    expect(audit.reversedWindingEdges).toBe(0);
    expect(audit.looseVertices).toBe(0);
    expect(audit.eulerCharacteristic).toBe(2);
    expect(audit.estimatedGenus).toBe(0);
    expect(audit.minY).toBe(0);
    expect(audit.isFloorGrounded).toBe(true);
    expect(audit.hasValidUvs).toBe(true);
    expect(solid.signedVolumeM3).toBeCloseTo(4 * 3 * 2.8, 4);
  });

  it("2. 오목 L자형 실내 평면도 Push/Pull 돌출도 누락 없이 수밀 삼각분할된다", () => {
    const solid = extrudeSketchPushPull({
      id: "room-l-shape",
      polygon: L_SHAPED_ROOM_POLYGON,
      heightMeters: 3.0,
    });
    const audit = auditSolidManifoldIntegrity(solid);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.eulerCharacteristic).toBe(2);
    expect(audit.minY).toBe(0);
    // L자 면적 = 4*2 + 2*2 = 12 m² -> 부피 36 m³
    expect(solid.signedVolumeM3).toBeCloseTo(36, 4);
  });

  it("3. 상단 테이퍼(topScale)와 공중 오프셋 입력을 자동 바닥 접지(Y=0) 각뿔대로 생성한다", () => {
    const solid = extrudeSketchPushPull({
      polygon: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
      heightMeters: 3.0,
      topScale: 0.5,
      baseElevationY: 4.5,
      groundToFloorY0: true,
    });
    const audit = auditSolidManifoldIntegrity(solid);

    expect(audit.isWatertight).toBe(true);
    expect(audit.minY).toBe(0);
    expect(solid.bounds.max[1]).toBeCloseTo(3.0, 5);
    // 각뿔대 부피 = h/3 * (A1 + A2 + sqrt(A1*A2)) = 1 * (4 + 1 + 2) = 7 m³
    expect(solid.signedVolumeM3).toBeCloseTo(7.0, 4);
  });

  it("4. 축 회전(Revolve) 화병/기둥 솔리드는 극점 퇴화 없이 수밀성과 외향 법선을 유지한다", () => {
    const solid = revolveProfileSolid({
      id: "studio-pillar",
      profile: [
        [0.45, 0],
        [0.5, 0.3],
        [0.35, 1.4],
        [0.42, 2.2],
        [0.42, 2.5],
      ],
      segments: 24,
    });
    const audit = auditSolidManifoldIntegrity(solid);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.degenerateTriangles).toBe(0);
    expect(audit.eulerCharacteristic).toBe(2);
    expect(audit.estimatedGenus).toBe(0);
    expect(audit.outwardNormalsConsistent).toBe(true);
    expect(audit.minY).toBe(0);
    expect(solid.signedVolumeM3).toBeGreaterThan(1.1);
  });

  it("5. 닫힌 루프 축 회전(토러스형 소품)은 오일러 지표 0(종수 1)의 수밀 솔리드를 생성한다", () => {
    const torus = revolveProfileSolid({
      id: "arch-ring",
      closedLoop: true,
      segments: 20,
      profile: [
        [0.8, 0.5],
        [1.1, 0.5],
        [1.1, 0.8],
        [0.8, 0.8],
      ],
    });
    const audit = auditSolidManifoldIntegrity(torus);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.eulerCharacteristic).toBe(0);
    expect(audit.estimatedGenus).toBe(1);
    expect(audit.minY).toBe(0);
    // 파푸스 정리: 단면적(0.09) * 중심원 둘레(2π * 0.95) ≈ 0.537 m³ (20분할 다각형 근사)
    expect(torus.signedVolumeM3).toBeGreaterThan(0.5);
    expect(torus.signedVolumeM3).toBeLessThan(0.56);
  });

  it("6. 다단 단면 로프트(Loft)는 사각->팔각->축소 단면을 꼬임 없이 수밀 솔리드로 연결한다", () => {
    const octagon: Vec2[] = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return [Math.cos(a) * 1.4, Math.sin(a) * 1.4];
    });
    const solid = loftCrossSectionsSolid({
      id: "hero-tower-loft",
      resampleCount: 16,
      sections: [
        { yMeters: 0.4, polygon: [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]] },
        { yMeters: 2.4, polygon: octagon },
        { yMeters: 5.4, polygon: [[-0.7, -0.7], [0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]] },
      ],
    });
    const audit = auditSolidManifoldIntegrity(solid);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.eulerCharacteristic).toBe(2);
    expect(audit.estimatedGenus).toBe(0);
    expect(audit.minY).toBe(0);
    expect(solid.bounds.size[1]).toBeCloseTo(5.0, 4);
    expect(solid.signedVolumeM3).toBeGreaterThan(20);
  });

  it("7. 상단 면 오프셋 인셋 양수 돌출(옥탑 보스)은 부피가 정확히 증가하고 수밀을 유지한다", () => {
    const base = createBoxSolidPrimitive({ widthX: 4, heightY: 2, depthZ: 4 });
    const boss = insetExtrudePlanarFace(base, {
      insetMeters: 0.5,
      extrudeDepthMeters: 1.0,
    });
    const audit = auditSolidManifoldIntegrity(boss);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.minY).toBe(0);
    // 본체 32 + 상단 보스(3 * 3 * 1 = 9) = 41 m³
    expect(boss.signedVolumeM3).toBeCloseTo(41, 4);
  });

  it("8. 상단 면 오프셋 인셋 음수 돌출(오목 천창 리세스)은 부피가 감소하며 수밀을 유지한다", () => {
    const base = createBoxSolidPrimitive({ widthX: 4, heightY: 2, depthZ: 4 });
    const recessed = insetExtrudePlanarFace(base, {
      insetMeters: 0.5,
      extrudeDepthMeters: -0.5,
    });
    const audit = auditSolidManifoldIntegrity(recessed);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.reversedWindingEdges).toBe(0);
    // 본체 32 - 리세스(3 * 3 * 0.5 = 4.5) = 27.5 m³
    expect(recessed.signedVolumeM3).toBeCloseTo(27.5, 4);
  });

  it("9. 수밀 무결성 감사기는 열린 구멍과 고립 정점이 있는 결함 메쉬를 정확히 적발한다", () => {
    const valid = createBoxSolidPrimitive({ widthX: 1, heightY: 1, depthZ: 1 });
    const broken: CadSolidMesh = {
      ...valid,
      vertices: [...valid.vertices, [9, 9, 9]],
      normals: [...valid.normals, [0, 1, 0]],
      uvs: [...valid.uvs, [0, 0]],
      triangles: valid.triangles.slice(1),
    };
    const audit = auditSolidManifoldIntegrity(broken);

    expect(audit.isWatertight).toBe(false);
    expect(audit.boundaryEdges).toBeGreaterThan(0);
    expect(audit.looseVertices).toBe(1);
    expect(audit.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("10. 파라메트릭 챔퍼 베벨(segments=1)은 모서리 수를 늘리면서도 수밀 솔리드를 유지한다", () => {
    const cube = createBoxSolidPrimitive({ widthX: 2, heightY: 2, depthZ: 2 });
    const beforeAudit = auditSolidManifoldIntegrity(cube);
    const bevel = applyParametricEdgeBevel(cube, {
      radiusMeters: 0.15,
      segments: 1,
    });
    const afterAudit = auditSolidManifoldIntegrity(bevel.solid);

    expect(bevel.wasClamped).toBe(false);
    expect(bevel.beveledEdgeCount).toBe(12);
    expect(afterAudit.isWatertight).toBe(true);
    expect(afterAudit.nonManifoldEdges).toBe(0);
    expect(afterAudit.boundaryEdges).toBe(0);
    expect(afterAudit.eulerCharacteristic).toBe(2);
    expect(afterAudit.uniqueEdgeCount).toBeGreaterThan(beforeAudit.uniqueEdgeCount);
    expect(bevel.solid.signedVolumeM3).toBeLessThan(cube.signedVolumeM3);
    expect(bevel.solid.signedVolumeM3).toBeGreaterThan(cube.signedVolumeM3 * 0.9);
    expect(afterAudit.minY).toBe(0);
  });

  it("11. 파라메트릭 원호 필렛 베벨(segments=3)은 챔퍼보다 더 촘촘한 곡면 분할과 수밀성을 보장한다", () => {
    const cube = createBoxSolidPrimitive({ widthX: 2, heightY: 2, depthZ: 2 });
    const chamfer = applyParametricEdgeBevel(cube, { radiusMeters: 0.18, segments: 1 });
    const fillet = applyParametricEdgeBevel(cube, { radiusMeters: 0.18, segments: 3 });
    const filletAudit = auditSolidManifoldIntegrity(fillet.solid);

    expect(filletAudit.isWatertight).toBe(true);
    expect(filletAudit.nonManifoldEdges).toBe(0);
    expect(filletAudit.eulerCharacteristic).toBe(2);
    expect(fillet.solid.triangles.length).toBeGreaterThan(chamfer.solid.triangles.length);
  });

  it("12. 베벨 반경이 모서리 길이를 초과하면 안전 반경으로 자동 클램핑해 붕괴를 방지한다", () => {
    const thinPanel = createBoxSolidPrimitive({ widthX: 1.5, heightY: 2.0, depthZ: 0.3 });
    const result = applyParametricEdgeBevel(thinPanel, {
      radiusMeters: 2.5,
      segments: 2,
    });
    const audit = auditSolidManifoldIntegrity(result.solid);

    expect(result.wasClamped).toBe(true);
    expect(result.appliedRadiusMeters).toBeLessThan(0.3 * 0.4);
    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
  });

  it("13. 상단 모서리 한정(top-edges) 및 수직 모서리 한정(vertical-edges) 베벨 모두 수밀을 유지한다", () => {
    const pillar = createBoxSolidPrimitive({ widthX: 1.2, heightY: 2.4, depthZ: 1.2 });
    const topBevel = applyParametricEdgeBevel(pillar, {
      radiusMeters: 0.12,
      segments: 2,
      edgeScope: "top-edges",
    });
    const vertBevel = applyParametricEdgeBevel(pillar, {
      radiusMeters: 0.12,
      segments: 2,
      edgeScope: "vertical-edges",
    });

    expect(topBevel.beveledEdgeCount).toBe(4);
    expect(vertBevel.beveledEdgeCount).toBe(4);
    expect(auditSolidManifoldIntegrity(topBevel.solid).isWatertight).toBe(true);
    expect(auditSolidManifoldIntegrity(vertBevel.solid).isWatertight).toBe(true);
  });

  it("14. 오목 L자 실내 매스에도 내각 270도 모서리 포함 파라메트릭 베벨이 수밀하게 적용된다", () => {
    const lRoom = extrudeSketchPushPull({
      polygon: L_SHAPED_ROOM_POLYGON,
      heightMeters: 2.6,
    });
    const bevel = applyParametricEdgeBevel(lRoom, {
      radiusMeters: 0.1,
      segments: 2,
    });
    const audit = auditSolidManifoldIntegrity(bevel.solid);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.boundaryEdges).toBe(0);
    expect(audit.eulerCharacteristic).toBe(2);
  });

  it("15. 3D CSG 차집합으로 벽체에 창문 개구부를 관통 타공하면 종수 1 수밀 벽체가 된다", () => {
    const wall = createBoxSolidPrimitive({
      id: "wall",
      widthX: 4.0,
      heightY: 2.8,
      depthZ: 0.25,
    });
    const windowCutter = createBoxSolidPrimitive({
      id: "window-cutter",
      widthX: 1.2,
      heightY: 1.2,
      depthZ: 0.6,
      centerOffset: [0, 1.5, 0],
      groundToFloorY0: false,
    });
    const piercedWall = booleanSolidSubtract(wall, windowCutter, { groundToFloorY0: true });
    const audit = auditSolidManifoldIntegrity(piercedWall);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.boundaryEdges).toBe(0);
    expect(audit.reversedWindingEdges).toBe(0);
    expect(audit.eulerCharacteristic).toBe(0);
    expect(audit.estimatedGenus).toBe(1);
    // 4.0 * 2.8 * 0.25 - 1.2 * 1.2 * 0.25 = 2.8 - 0.36 = 2.44 m³
    expect(piercedWall.signedVolumeM3).toBeCloseTo(2.44, 3);
  });

  it("16. 바닥(Y=0)과 공면인 출입문 개구부 CSG 차집합도 공면 중복 없이 수밀 타공된다", () => {
    const wall = createBoxSolidPrimitive({ widthX: 4.0, heightY: 2.8, depthZ: 0.25 });
    const doorCutter = createBoxSolidPrimitive({
      widthX: 1.0,
      heightY: 2.1,
      depthZ: 0.6,
      centerOffset: [0.6, 1.05, 0],
      groundToFloorY0: true,
    });
    const doorwayWall = booleanSolidSubtract(wall, doorCutter, { groundToFloorY0: true });
    const audit = auditSolidManifoldIntegrity(doorwayWall);

    expect(audit.isWatertight).toBe(true);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.estimatedGenus).toBe(0);
    expect(audit.minY).toBe(0);
    // 2.8 - (1.0 * 2.1 * 0.25 = 0.525) = 2.275 m³
    expect(doorwayWall.signedVolumeM3).toBeCloseTo(2.275, 3);
  });

  it("17. 3D CSG 합집합(Union)과 교집합(Intersect)의 부피 보존식(V_A + V_B - V_∩ = V_∪)이 성립한다", () => {
    const a = createBoxSolidPrimitive({ widthX: 2, heightY: 2, depthZ: 2, centerOffset: [0, 1, 0] });
    const b = createBoxSolidPrimitive({ widthX: 2, heightY: 2, depthZ: 2, centerOffset: [1, 1, 0] });
    const union = booleanSolidUnion(a, b, { groundToFloorY0: true });
    const intersect = booleanSolidIntersect(a, b, { groundToFloorY0: true });

    expect(auditSolidManifoldIntegrity(union).isWatertight).toBe(true);
    expect(auditSolidManifoldIntegrity(intersect).isWatertight).toBe(true);
    expect(intersect.signedVolumeM3).toBeCloseTo(4.0, 3);
    expect(union.signedVolumeM3).toBeCloseTo(a.signedVolumeM3 + b.signedVolumeM3 - intersect.signedVolumeM3, 3);
  });

  it("18. 비파괴 파라메트릭 히스토리 트리는 피처 치수 수정 시 전체 솔리드를 결정론적으로 재평가한다", () => {
    const tree = new ParametricCadFeatureTree()
      .addFeature({
        featureId: "base-wall",
        kind: "sketch-extrude",
        params: {
          polygon: [[-2, -0.125], [2, -0.125], [2, 0.125], [-2, 0.125]],
          heightMeters: 2.8,
        },
      })
      .addFeature({
        featureId: "cut-window",
        kind: "boolean-csg",
        params: {
          operation: "subtract",
          operand: {
            primitive: "box",
            box: {
              widthX: 1.0,
              heightY: 1.0,
              depthZ: 0.6,
              centerOffset: [0, 1.5, 0],
              groundToFloorY0: false,
            },
          },
          groundToFloorY0: true,
        },
      });

    const eval1 = tree.evaluate();
    const eval1Repeat = tree.evaluate();
    expect(eval1.deterministicHash).toBe(eval1Repeat.deterministicHash);
    expect(eval1.audit.isWatertight).toBe(true);
    expect(eval1.solid.signedVolumeM3).toBeCloseTo(2.8 - 0.25, 3);

    // 과거 피처의 벽체 높이와 창문 폭을 수정한 뒤 재평가
    tree
      .updateFeatureParams("base-wall", "sketch-extrude", (prev) => ({
        ...prev,
        heightMeters: 3.2,
      }))
      .updateFeatureParams("cut-window", "boolean-csg", (prev) => ({
        ...prev,
        operand: {
          primitive: "box",
          box: {
            widthX: 1.6,
            heightY: 1.0,
            depthZ: 0.6,
            centerOffset: [0, 1.6, 0],
            groundToFloorY0: false,
          },
        },
      }));

    const eval2 = tree.evaluate();
    expect(eval2.audit.isWatertight).toBe(true);
    expect(eval2.deterministicHash).not.toBe(eval1.deterministicHash);
    // 4 * 3.2 * 0.25 - 1.6 * 1.0 * 0.25 = 3.2 - 0.4 = 2.8 m³
    expect(eval2.solid.signedVolumeM3).toBeCloseTo(2.8, 3);
    expect(eval2.solid.bounds.max[1]).toBeCloseTo(3.2, 4);
  });

  it("19. 파라메트릭 히스토리에서 창문 피처를 끄고 켤 때 원상 복구와 재타공이 정확히 동작한다", () => {
    const tree = new ParametricCadFeatureTree([
      {
        featureId: "wall",
        kind: "sketch-extrude",
        params: {
          polygon: [[-2, -0.125], [2, -0.125], [2, 0.125], [-2, 0.125]],
          heightMeters: 2.8,
        },
      },
      {
        featureId: "window",
        kind: "boolean-csg",
        params: {
          operation: "subtract",
          operand: {
            primitive: "box",
            box: {
              widthX: 1.2,
              heightY: 1.2,
              depthZ: 0.6,
              centerOffset: [0, 1.4, 0],
              groundToFloorY0: false,
            },
          },
          groundToFloorY0: true,
        },
      },
    ]);

    tree.toggleFeature("window", false);
    const suppressed = tree.evaluate();
    expect(suppressed.steps[1]?.skipped).toBe(true);
    expect(suppressed.audit.estimatedGenus).toBe(0);
    expect(suppressed.solid.signedVolumeM3).toBeCloseTo(2.8, 3);

    tree.toggleFeature("window", true);
    const restored = tree.evaluate();
    expect(restored.audit.estimatedGenus).toBe(1);
    expect(restored.solid.signedVolumeM3).toBeCloseTo(2.44, 3);
  });

  it("20. 만화 NPR 선화 추출기는 정육면체 앞면 실루엣·크리즈를 추출하고 반대편 뒷면 모서리는 은선 제거한다", () => {
    const cube = createBoxSolidPrimitive({ widthX: 2, heightY: 2, depthZ: 2 });
    const projection = extractComicNprInkStrokes(
      cube,
      {
        position: [5, 4, 6],
        target: [0, 1, 0],
        viewportWidthPx: 1280,
        viewportHeightPx: 720,
      },
      { creaseAngleDeg: 30, includeHiddenDebugStrokes: true },
    );

    // 3면이 보이는 아이소메트릭 시점: 외곽 실루엣 6개 + 내부 Y자 앞면 모서리 3개 = 정확히 9개 가시 모서리
    expect(projection.stats.silhouetteCount).toBe(6);
    expect(projection.stats.visibleStrokeCount).toBe(9);
    // 카메라 반대편 숨은 꼭짓점(-1, 0, -1)에 닿은 선분이 스트로크에 노출되지 않아야 함
    const touchesHiddenBackCorner = projection.strokes.some((stroke) =>
      stroke.sourceEdge3D.some(
        (pt) => Math.abs(pt[0] + 1) < 0.05 && Math.abs(pt[1]) < 0.05 && Math.abs(pt[2] + 1) < 0.05,
      ),
    );
    expect(touchesHiddenBackCorner).toBe(false);
  });

  it("21. 전경 벽체 뒤에 일부 가려진 후경 기둥의 은선 제거(HLR)가 숨은 선을 가리고 앞면 선만 추출한다", () => {
    const frontWall = createBoxSolidPrimitive({
      widthX: 3.0,
      heightY: 2.2,
      depthZ: 0.3,
      centerOffset: [0, 1.1, 1.0],
    });
    const backPillar = createBoxSolidPrimitive({
      widthX: 0.8,
      heightY: 3.4,
      depthZ: 0.8,
      centerOffset: [0, 1.7, -0.5],
    });
    const scene = booleanSolidUnion(frontWall, backPillar, { groundToFloorY0: true });

    const result = extractComicNprInkStrokes(
      scene,
      {
        position: [0.2, 1.4, 6.0],
        target: [0, 1.4, 0],
        viewportWidthPx: 1280,
        viewportHeightPx: 720,
      },
      { creaseAngleDeg: 25, includeHiddenDebugStrokes: true },
    );

    expect(result.stats.visibleStrokeCount).toBeGreaterThan(4);
    expect(result.stats.fullyHiddenEdgeCount + result.stats.partiallyOccludedEdgeCount).toBeGreaterThan(0);

    const silhouettes = result.strokes.filter((s) => s.category === "silhouette");
    const hardFrames = result.strokes.filter((s) => s.category === "hard-frame");
    expect(silhouettes.length).toBeGreaterThan(0);
    if (hardFrames.length > 0 && silhouettes[0] && hardFrames[0]) {
      // 동일 거리 기준 실루엣 외곽선 계층이 내부 선보다 더 굵은 펜 가중치를 갖는다
      const avgSilWidth = silhouettes.reduce((sum, s) => sum + s.strokeWidthPx, 0) / silhouettes.length;
      const avgFrameWidth = hardFrames.reduce((sum, s) => sum + s.strokeWidthPx, 0) / hardFrames.length;
      expect(avgSilWidth).toBeGreaterThan(avgFrameWidth * 0.95);
    }
  });

  it("22. 창문 타공 벽체 NPR 추출은 2D 화면 좌표 내 창틀 선을 추출하고 creaseAngleDeg 필터에 반응한다", () => {
    const wall = createBoxSolidPrimitive({ widthX: 4.0, heightY: 2.8, depthZ: 0.25 });
    const windowCutter = createBoxSolidPrimitive({
      widthX: 1.2,
      heightY: 1.2,
      depthZ: 0.6,
      centerOffset: [0, 1.5, 0],
      groundToFloorY0: false,
    });
    const piercedWall = booleanSolidSubtract(wall, windowCutter, { groundToFloorY0: true });
    const beveledBox = applyParametricEdgeBevel(
      createBoxSolidPrimitive({ widthX: 2, heightY: 2, depthZ: 2 }),
      { radiusMeters: 0.2, segments: 2 },
    ).solid;

    const wallInk = extractComicNprInkStrokes(piercedWall, {
      position: [1.5, 1.6, 5.5],
      target: [0, 1.4, 0],
      projectionMode: "perspective",
      viewportWidthPx: 1200,
      viewportHeightPx: 800,
    });
    expect(wallInk.stats.visibleStrokeCount).toBeGreaterThanOrEqual(8);
    for (const stroke of wallInk.strokes) {
      expect(stroke.points2D.length).toBeGreaterThanOrEqual(2);
      for (const [px, py] of stroke.points2D) {
        expect(px).toBeGreaterThanOrEqual(0);
        expect(px).toBeLessThanOrEqual(1200);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(py).toBeLessThanOrEqual(800);
      }
    }

    const lowCrease = extractComicNprInkStrokes(
      beveledBox,
      { position: [4, 3.5, 5], target: [0, 1, 0], viewportWidthPx: 1000, viewportHeightPx: 800 },
      { creaseAngleDeg: 20, hardFrameAngleDeg: 85 },
    );
    const highCrease = extractComicNprInkStrokes(
      beveledBox,
      { position: [4, 3.5, 5], target: [0, 1, 0], viewportWidthPx: 1000, viewportHeightPx: 800 },
      { creaseAngleDeg: 65, hardFrameAngleDeg: 85 },
    );
    expect(lowCrease.stats.creaseCount).toBeGreaterThan(highCrease.stats.creaseCount);
  });
});
