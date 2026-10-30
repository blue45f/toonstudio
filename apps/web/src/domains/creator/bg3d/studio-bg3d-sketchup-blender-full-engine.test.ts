import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { makeGeometry } from "../studio-background-3d-primitives";

import {
  buildBlenderPresetScenePrimitives,
  evaluateBlenderCameraRig,
  evaluateBlenderCompositorPipeline,
  evaluateBlenderEditSculptSession,
  evaluateBlenderGp3AndFreestylePipeline,
  evaluateBlenderModifierStack,
  evaluateBlenderPhysicsSuite,
} from "./studio-bg3d-blender-full-engine";
import {
  applySketchUpDrapePath,
  applySketchUpSmooveTerrain,
  applySketchUpStampPad,
  buildSketchUpArchitecturalComponentPrimitives,
  buildSketchUpLayOutVectorCutawaySvg,
  buildSketchUpSandboxFromContours,
  buildSketchUpSandboxGrid,
  calibrateSketchUpMatchPhotoCamera,
  evaluateSketchUpSolidOperation,
  inspectSketchUpManifoldSolid,
  synthesizeSketchUpTerrainPrimitives,
  type SketchUpArchitecturalComponentKind,
} from "./studio-bg3d-sketchup-full-engine";

describe("SketchUp 3D 전 기능 엔진 (Sandbox · Solid Tools · Match Photo · 건축 컴포넌트)", () => {
  it("Sandbox: From Contours, Smoove, Stamp, Drape 및 3D 장면 프리미티브를 합성한다", () => {
    const scratch = buildSketchUpSandboxGrid({ cols: 5, rows: 5, widthMeters: 10, depthMeters: 10 });
    expect(scratch.heights).toHaveLength(25);

    const contoured = buildSketchUpSandboxFromContours(
      [
        { elevationY: 0.5, pointsXZ: [[-4, -4], [4, -4]] },
        { elevationY: 2.0, pointsXZ: [[0, 4]] },
      ],
      { cols: 7, rows: 7, widthMeters: 12, depthMeters: 12 },
    );
    const smooved = applySketchUpSmooveTerrain(contoured, {
      centerX: 0,
      centerZ: 0,
      radiusMeters: 4,
      displacementY: 1.5,
    });
    expect(Math.max(...smooved.heights)).toBeGreaterThan(Math.max(...contoured.heights));

    const stamped = applySketchUpStampPad(smooved, {
      centerX: 0,
      centerZ: 0,
      width: 4,
      depth: 4,
      elevationY: 1.8,
      embankmentSlopeMeters: 1.5,
    });
    expect(stamped.stampedPad?.elevationY).toBe(1.8);

    const draped = applySketchUpDrapePath(stamped, [
      [-4, -4],
      [0, 0],
      [4, 4],
    ]);
    expect(draped.drapedPathPoints3D).toHaveLength(3);

    const primitives = synthesizeSketchUpTerrainPrimitives(draped);
    expect(primitives.length).toBeGreaterThan(5);
    expect(primitives.some((p) => p.tags?.includes("Sandbox_Stamp"))).toBe(true);
    expect(primitives.some((p) => p.tags?.includes("Sandbox_Drape"))).toBe(true);
  });

  it("Solid Tools 6대 불리언 연산과 Manifold Solid Inspector 진단을 정확히 수행한다", () => {
    const bodyA = {
      id: "a",
      nameKo: "본관",
      center: [0, 1, 0] as const,
      size: [2, 2, 2] as const,
      colorHex: "#cccccc",
    };
    const bodyB = {
      id: "b",
      nameKo: "별관",
      center: [1, 1, 0] as const,
      size: [2, 2, 2] as const,
      colorHex: "#999999",
    };

    const outerShell = evaluateSketchUpSolidOperation("outer-shell", bodyA, bodyB);
    expect(outerShell.isManifoldWatertight).toBe(true);
    expect(outerShell.volumeCubicMeters).toBe(12);
    expect(outerShell.internalWallsRemoved).toBeGreaterThan(0);

    const split = evaluateSketchUpSolidOperation("split", bodyA, bodyB);
    expect(split.resultingBodyCount).toBe(3);
    expect(split.primitives).toHaveLength(3);

    const trim = evaluateSketchUpSolidOperation("trim", bodyA, bodyB);
    expect(trim.resultingBodyCount).toBe(2);

    const intersect = evaluateSketchUpSolidOperation("intersect", bodyA, bodyB);
    expect(intersect.volumeCubicMeters).toBe(4);

    const cleanReport = inspectSketchUpManifoldSolid({
      vertexCount: 8,
      edgeCount: 12,
      faceCount: 6,
      strayEdgeCount: 0,
      internalFaceCount: 0,
      reversedNormalFaceCount: 0,
      boundaryHoleLoopCount: 0,
      boundingBoxSizeMeters: [2, 2, 2],
    });
    expect(cleanReport.isSolidManifold).toBe(true);
    expect(cleanReport.eulerCharacteristic).toBe(2);

    const dirtyReport = inspectSketchUpManifoldSolid({
      vertexCount: 8,
      edgeCount: 13,
      faceCount: 6,
      strayEdgeCount: 2,
      internalFaceCount: 1,
      reversedNormalFaceCount: 0,
      boundaryHoleLoopCount: 0,
      boundingBoxSizeMeters: [2, 2, 2],
    });
    expect(dirtyReport.isSolidManifold).toBe(false);
    expect(dirtyReport.totalIssueCount).toBe(3);
  });

  it("Match Photo 2소실점(2-VP) 카메라 역산 및 건축 컴포넌트·LayOut SVG 생성을 수행한다", () => {
    const match = calibrateSketchUpMatchPhotoCamera({
      vp1Normalized: [-1.4, -0.05],
      vp2Normalized: [1.2, 0.05],
      originNormalized: [0, -0.1],
      referenceHeightMeters: 3.0,
      targetDistanceMeters: 8.0,
    });
    expect(match.focalLength35mmEquiv).toBeGreaterThanOrEqual(14);
    expect(match.verticalFovDeg).toBeGreaterThan(15);
    expect(match.cameraSettings.projection).toBe("perspective");
    expect(match.cameraSettings.position).toHaveLength(3);

    const spiral = buildSketchUpArchitecturalComponentPrimitives({
      kind: "staircase-spiral",
      widthMeters: 3.0,
      heightMeters: 3.2,
      depthMeters: 3.0,
      stepOrBayCount: 10,
    });
    expect(spiral.primitiveCount).toBe(11);

    const hanok = buildSketchUpArchitecturalComponentPrimitives({
      kind: "roof-hanok",
      widthMeters: 5.0,
      heightMeters: 2.0,
      depthMeters: 4.0,
      stepOrBayCount: 6,
    });
    expect(hanok.primitiveCount).toBe(3);

    const svg = buildSketchUpLayOutVectorCutawaySvg({
      title: "Hanok Section",
      widthMeters: 5.0,
      heightMeters: 3.0,
      sectionElevationMeters: 1.2,
    });
    expect(svg.svg).toContain("<svg");
    expect(svg.byteLength).toBeGreaterThan(100);
  });

  const roofCases: readonly { kind: SketchUpArchitecturalComponentKind; width: number; height: number; depth: number }[] = [
    { kind: "roof-gable", width: 3.6, height: 3.2, depth: 4.2 },
    { kind: "roof-gable", width: 7.3, height: 1.7, depth: 9.5 },
    { kind: "roof-hanok", width: 3.6, height: 3.2, depth: 4.2 },
    { kind: "roof-hanok", width: 7.3, height: 1.7, depth: 9.5 },
  ];
  it.each(roofCases)("$kind 본체의 실제 렌더 지오메트리에 치수와 수평 용마루를 보존한다 ($width/$height/$depth m)", ({ kind, width, height, depth }) => {
    const result = buildSketchUpArchitecturalComponentPrimitives({
      kind, widthMeters: width, heightMeters: height, depthMeters: depth, stepOrBayCount: 8,
    });
    const main = result.primitives.find(({ id }) => id === "skp-arch-roof-main");
    if (!main) throw new Error("지붕 본체가 없습니다.");
    // SceneNodes와 동일한 실제 도형 및 T·R·S 변환으로 축과 크기를 검사한다.
    const geometry = makeGeometry(main.kind);
    try {
      geometry.applyMatrix4(new Matrix4().compose(
        new Vector3(...main.position), new Quaternion().setFromEuler(new Euler(...main.rotation)), new Vector3(...main.scale),
      ));
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) throw new Error("지붕 경계를 계산하지 못했습니다.");
      const size = bounds.getSize(new Vector3());
      expect(size.x).toBeCloseTo(width, 2);
      expect(size.y).toBeCloseTo(height, 2);
      expect(size.z).toBeCloseTo(depth, 2);
      expect(bounds.min.y).toBeCloseTo(2.4, 2);
      expect(bounds.max.y).toBeCloseTo(2.4 + height, 2);
      const positions = geometry.getAttribute("position");
      const ridge = Array.from({ length: positions.count }, (_, index) => new Vector3().fromBufferAttribute(positions, index))
        .filter(({ y }) => Math.abs(y - bounds.max.y) < 0.001);
      expect(ridge.length).toBeGreaterThan(0);
      expect(ridge.every(({ x }) => Math.abs(x) < 0.001)).toBe(true);
      expect(Math.max(...ridge.map(({ z }) => z)) - Math.min(...ridge.map(({ z }) => z))).toBeCloseTo(depth, 2);
    } finally {
      geometry.dispose();
    }
  });
});

describe("Blender 5.2 전 기능 엔진 (모디파이어 · Edit/Sculpt · GPv3/Freestyle · Compositor · 물리 · 카메라)", () => {
  it("6대 카테고리 모디파이어 스택과 Geometry Nodes 에셋 노드를 평가한다", () => {
    const res = evaluateBlenderModifierStack([
      { type: "ARRAY", category: "Generate", enabled: true, primaryValue: 4 },
      { type: "SUBSURF", category: "Generate", enabled: true, primaryValue: 2 },
      { type: "MOD_CURVE_TO_TUBE", category: "Generate", enabled: true, primaryValue: 1 },
      { type: "MOD_SCATTER_ON_SURFACE", category: "Generate", enabled: true, primaryValue: 8 },
      { type: "WEIGHTED_NORMAL", category: "Normals", enabled: true, primaryValue: 50 },
      { type: "LINEART", category: "Generate", enabled: true, primaryValue: 1 },
    ]);
    expect(res.activeModifierCount).toBe(6);
    expect(res.weightedNormalsActive).toBe(true);
    expect(res.lineArtGeneratedStrokes).toBeGreaterThan(0);
    expect(res.assetNodePathsUsed).toContain("nodes/geometry_nodes_essentials.blend/NodeTree/Array");
    expect(res.primitives.length).toBeGreaterThan(4);
  });

  it("Edit Mesh 오퍼레이터, Sculpt Dyntopo, GPv3 레이어·마스크 및 Freestyle 9종 엣지를 평가한다", () => {
    const editSculpt = evaluateBlenderEditSculptSession({
      editOperator: "extrude_manifold",
      editIntensity: 1.5,
      sculptTool: "dyntopo_density",
      dyntopoDetailSizePx: 3,
      symmetryAxes: ["X", "Y"],
    });
    expect(editSculpt.symmetryMultiplier).toBe(4);
    expect(editSculpt.dyntopoTriangleCount).toBeGreaterThan(1000);

    const gp3 = evaluateBlenderGp3AndFreestylePipeline({
      layerCount: 6,
      useLayerMasks: true,
      onionSkinFramesBefore: 2,
      onionSkinFramesAfter: 2,
      radiusOffsetPx: 0.8,
      tintFactor: 0.4,
      activeGp3Modifiers: ["GREASE_PENCIL_NOISE", "GREASE_PENCIL_OUTLINE"],
      enabledFreestyleEdgeTypes: [
        "silhouette",
        "crease",
        "border",
        "material_boundary",
        "ridge_valley",
      ],
      creaseAngleDeg: 134,
      qiStart: 0,
      qiEnd: 1,
      krDerivativeEpsilon: 0.001,
    });
    expect(gp3.maskedLayerCount).toBe(3);
    expect(gp3.onionSkinGhostCount).toBe(4);
    expect(gp3.freestyleEdgeTypeCount).toBe(5);
    expect(gp3.total3dStrokes).toBeGreaterThan(300);
  });

  it("Compositor 노드 그래프, 물리 시뮬레이션 3종(RigidBody·Cloth·Mantaflow), 시네마틱 카메라를 평가한다", () => {
    const comp = evaluateBlenderCompositorPipeline({
      glareType: "FOG_GLOW",
      glareMix: 0.5,
      lensDistortion: -0.03,
      lensDispersionChromatic: 0.15,
      colorBalanceLiftGammaGain: [1, 1, 1.1],
      enableCryptomatteV2: true,
      enableOpenImageDenoise: true,
      enableMaskToSdfInpaint: true,
    });
    expect(comp.activeNodeClassNames).toContain("CompositorNodeCryptomatteV2");
    expect(comp.activeNodeClassNames).toContain("CompositorNodeMaskToSDF");

    const phys = evaluateBlenderPhysicsSuite({
      rigidBodyType: "ACTIVE",
      rigidBodyShape: "COMPOUND",
      massKg: 10,
      friction: 0.4,
      restitution: 0.3,
      clothBendingModel: "ANGULAR",
      clothTensionStiffness: 20,
      clothUsePressure: true,
      clothPressureForce: 2.0,
      clothUseSewingSprings: true,
      fluidDomainType: "LIQUID",
      fluidResolutionDivisions: 64,
      fluidUseNoiseOrFlipParticles: true,
    });
    expect(phys.mantaflowVoxelCount).toBe(64 * 64 * 64);
    expect(phys.mantaflowSecondaryParticleCount).toBeGreaterThan(0);
    expect(phys.primitives).toHaveLength(3);

    const cam = evaluateBlenderCameraRig({
      type: "PANO",
      panoramaType: "FISHEYE_LENS_POLYNOMIAL",
      focalLengthMm: 24,
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      shiftX: 0.1,
      shiftY: -0.15,
      apertureFstop: 2.0,
      apertureBlades: 7,
      apertureRatioAnamorphic: 1.33,
      fisheyePolynomialK: [0, -0.5, -0.01, 0, 0],
      passepartoutAlpha: 0.9,
    });
    expect(cam.fisheyeMaxAngleDeg).toBeGreaterThan(150);
    expect(cam.cameraSettings.lensShift).toEqual([0.1, -0.15]);

    const scene = buildBlenderPresetScenePrimitives("fantasy-citadel");
    expect(scene.primitives.length).toBeGreaterThanOrEqual(5);
  });
});
