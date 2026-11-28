import { describe, expect, it } from "vitest";

import {
  applyCameraRigDelta,
  buildCameraBasis,
  exportParametricSceneMeshManifest,
  liftRoughSketchToParametricScene3d,
  projectDirectionToVanishingPoint,
  projectWorldPointToScreen,
  renderReprojectedSceneInkSvg,
  reprojectParametricSceneWithInkDna,
  serializeParametricSceneMeshManifestJson,
  solveCameraFromRoughPerspectiveStrokes,
  unprojectScreenPointToFloorPlane,
  type ArtistInkDnaConfig,
  type CalibratedCameraState,
  type ParametricScene3d,
  type PerspectiveAxisHint,
  type RoughPerspectiveStroke2d,
  type SketchStrokeSemanticRole,
  type Vec3,
} from "./index";

const DEFAULT_INK_DNA: ArtistInkDnaConfig = {
  profileName: "webtoon-gpen-v1",
  baseWidthPx: 1.8, silhouetteBoost: 1.85,
  structuralWeightMultiplier: 1.25, detailWeightMultiplier: 0.8, textureWeightMultiplier: 0.5,
  depthAttenuationStrength: 0.7, referenceDepthMeters: 3.5,
  wobbleAmplitudePx: 0.55, wobbleFrequency: 2.5, taperRatio: 0.48, deterministicSeed: 20261128,
};

function makeSyntheticCamera(params: {
  width?: number; height?: number; focalLengthPx?: number;
  yawDeg?: number; pitchDeg?: number; rollDeg?: number; eyeHeightMeters?: number;
}): CalibratedCameraState {
  const [w, h, f] = [params.width ?? 1280, params.height ?? 720, params.focalLengthPx ?? 960];
  const [yawDeg, pitchDeg, rollDeg] = [params.yawDeg ?? 0, params.pitchDeg ?? 0, params.rollDeg ?? 0];
  const eyeHeightMeters = params.eyeHeightMeters ?? 1.55;
  const pp = { x: w * 0.5, y: h * 0.5 };
  const basis = buildCameraBasis(yawDeg, pitchDeg, rollDeg);
  const partial = { basis, focalLengthPx: f, principalPointPx: pp };
  const vpX = projectDirectionToVanishingPoint({ x: 1, y: 0, z: 0 }, partial);
  const vpZ = projectDirectionToVanishingPoint({ x: 0, y: 0, z: -1 }, partial);
  const vpY = projectDirectionToVanishingPoint({ x: 0, y: 1, z: 0 }, partial);
  const [rollRad, pitchRad] = [(rollDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180];
  return {
    viewportWidthPx: w, viewportHeightPx: h, principalPointPx: pp,
    focalLengthPx: f, focalLengthMm: (f / w) * 36,
    horizontalFovDeg: (2 * Math.atan(w / (2 * f)) * 180) / Math.PI,
    verticalFovDeg: (2 * Math.atan(h / (2 * f)) * 180) / Math.PI,
    positionMeters: { x: 0, y: eyeHeightMeters, z: 0 }, eyeHeightMeters,
    yawDeg, pitchDeg, rollDeg,
    horizonYPx: pp.y + (f * Math.tan(pitchRad)) / Math.cos(rollRad),
    horizonSlope: Math.tan(rollRad),
    perspectiveType: vpX && vpZ && vpY ? "3-point" : vpX && vpZ ? "2-point" : "1-point",
    vanishingPoints: { vpX, vpZ, vpY }, basis,
  };
}

function projectSegmentToStroke(
  id: string, a: Vec3, b: Vec3, camera: CalibratedCameraState,
  opts: { axisHint?: PerspectiveAxisHint; role?: SketchStrokeSemanticRole; groupId?: string; label?: string; parentGroupId?: string; jitterPx?: number } = {},
): RoughPerspectiveStroke2d {
  const pa = projectWorldPointToScreen(a, camera);
  const pb = projectWorldPointToScreen(b, camera);
  if (!pa || !pb) throw new Error(`테스트 세그먼트 ${id}가 카메라 뒤에 위치함`);
  const jitter = opts.jitterPx ?? 0;
  const seed = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [jx, jy] = [jitter * Math.sin(seed * 1.7), jitter * Math.cos(seed * 2.3)];
  return {
    id, start: { x: pa.screenPx.x + jx, y: pa.screenPx.y + jy },
    end: { x: pb.screenPx.x - jx * 0.5, y: pb.screenPx.y - jy * 0.5 },
    axisHint: opts.axisHint, role: opts.role, groupId: opts.groupId, label: opts.label, parentGroupId: opts.parentGroupId,
  };
}

function buildBoxStrokes(
  groupId: string, role: SketchStrokeSemanticRole, center: Vec3, size: Vec3,
  camera: CalibratedCameraState, extra: { label?: string; parentGroupId?: string } = {},
): RoughPerspectiveStroke2d[] {
  const [hx, hy, hz] = [size.x * 0.5, size.y * 0.5, size.z * 0.5];
  const c = [
    { x: center.x - hx, y: center.y - hy, z: center.z + hz }, { x: center.x + hx, y: center.y - hy, z: center.z + hz },
    { x: center.x + hx, y: center.y - hy, z: center.z - hz }, { x: center.x - hx, y: center.y - hy, z: center.z - hz },
    { x: center.x - hx, y: center.y + hy, z: center.z + hz }, { x: center.x + hx, y: center.y + hy, z: center.z + hz },
    { x: center.x + hx, y: center.y + hy, z: center.z - hz }, { x: center.x - hx, y: center.y + hy, z: center.z - hz },
  ];
  const pairs: Array<readonly [number, number, PerspectiveAxisHint]> = [
    [0, 1, "x"], [2, 3, "x"], [4, 5, "x"], [0, 3, "z"], [1, 2, "z"], [0, 4, "y"], [1, 5, "y"],
  ];
  return pairs.map(([i0, i1, axisHint], idx) =>
    projectSegmentToStroke(`${groupId}-s${idx}`, c[i0]!, c[i1]!, camera, {
      axisHint, role, groupId, label: extra.label, parentGroupId: extra.parentGroupId,
    }),
  );
}

function buildSyntheticCorridorStrokes(camera: CalibratedCameraState, jitterPx = 0.2): RoughPerspectiveStroke2d[] {
  return [
    projectSegmentToStroke("cor-fl", { x: -1.3, y: 0, z: -1.5 }, { x: -1.3, y: 0, z: -10 }, camera, { axisHint: "z", role: "floor-grid", jitterPx }),
    projectSegmentToStroke("cor-fr", { x: 1.3, y: 0, z: -1.5 }, { x: 1.3, y: 0, z: -10 }, camera, { axisHint: "z", role: "floor-grid", jitterPx }),
    projectSegmentToStroke("cor-cl", { x: -1.3, y: 2.9, z: -1.5 }, { x: -1.3, y: 2.9, z: -10 }, camera, { axisHint: "z", role: "ceiling-line", jitterPx }),
    projectSegmentToStroke("cor-cr", { x: 1.3, y: 2.9, z: -1.5 }, { x: 1.3, y: 2.9, z: -10 }, camera, { axisHint: "z", role: "ceiling-line", jitterPx }),
    projectSegmentToStroke("cor-midl", { x: -1.3, y: 1.2, z: -2.0 }, { x: -1.3, y: 1.2, z: -9.5 }, camera, { axisHint: "z", role: "wall-boundary", jitterPx }),
    projectSegmentToStroke("cor-midr", { x: 1.3, y: 1.2, z: -2.0 }, { x: 1.3, y: 1.2, z: -9.5 }, camera, { axisHint: "z", role: "wall-boundary", jitterPx }),
    projectSegmentToStroke("cor-xb", { x: -1.3, y: 0, z: -6.0 }, { x: 1.3, y: 0, z: -6.0 }, camera, { axisHint: "x", role: "floor-grid", jitterPx }),
    projectSegmentToStroke("cor-xt", { x: -1.3, y: 2.9, z: -6.0 }, { x: 1.3, y: 2.9, z: -6.0 }, camera, { axisHint: "x", role: "ceiling-line", jitterPx }),
    projectSegmentToStroke("cor-vl", { x: -1.3, y: 0, z: -5.0 }, { x: -1.3, y: 2.9, z: -5.0 }, camera, { axisHint: "y", role: "wall-boundary", jitterPx }),
    projectSegmentToStroke("cor-vr", { x: 1.3, y: 0, z: -5.0 }, { x: 1.3, y: 2.9, z: -5.0 }, camera, { axisHint: "y", role: "wall-boundary", jitterPx }),
  ];
}

function buildSyntheticTwoPointRoomStrokes(
  camera: CalibratedCameraState, opts: { useAutoHint?: boolean; jitterPx?: number } = {},
): RoughPerspectiveStroke2d[] {
  const jitterPx = opts.jitterPx ?? 0.18;
  const h = (axis: PerspectiveAxisHint): PerspectiveAxisHint => (opts.useAutoHint ? "auto" : axis);
  return [
    projectSegmentToStroke("rm-z1", { x: -1.6, y: 0, z: -2.2 }, { x: -1.6, y: 0, z: -7.0 }, camera, { axisHint: h("z"), role: "floor-grid", jitterPx }),
    projectSegmentToStroke("rm-z2", { x: 1.4, y: 0, z: -2.2 }, { x: 1.4, y: 0, z: -7.0 }, camera, { axisHint: h("z"), role: "floor-grid", jitterPx }),
    projectSegmentToStroke("rm-z3", { x: -1.6, y: 2.8, z: -2.2 }, { x: -1.6, y: 2.8, z: -7.0 }, camera, { axisHint: h("z"), role: "ceiling-line", jitterPx }),
    projectSegmentToStroke("rm-z4", { x: 1.4, y: 2.8, z: -2.2 }, { x: 1.4, y: 2.8, z: -7.0 }, camera, { axisHint: h("z"), role: "ceiling-line", jitterPx }),
    projectSegmentToStroke("rm-x1", { x: -2.2, y: 0, z: -4.2 }, { x: 2.4, y: 0, z: -4.2 }, camera, { axisHint: h("x"), role: "floor-grid", jitterPx }),
    projectSegmentToStroke("rm-x2", { x: -2.2, y: 0, z: -6.2 }, { x: 2.4, y: 0, z: -6.2 }, camera, { axisHint: h("x"), role: "wall-boundary", jitterPx }),
    projectSegmentToStroke("rm-x3", { x: -2.2, y: 2.8, z: -4.2 }, { x: 2.4, y: 2.8, z: -4.2 }, camera, { axisHint: h("x"), role: "ceiling-line", jitterPx }),
    projectSegmentToStroke("rm-x4", { x: -2.2, y: 2.8, z: -6.2 }, { x: 2.4, y: 2.8, z: -6.2 }, camera, { axisHint: h("x"), role: "ceiling-line", jitterPx }),
    projectSegmentToStroke("rm-y1", { x: -1.6, y: 0, z: -5.2 }, { x: -1.6, y: 2.8, z: -5.2 }, camera, { axisHint: h("y"), role: "wall-boundary", jitterPx }),
    projectSegmentToStroke("rm-y2", { x: 1.4, y: 0, z: -5.2 }, { x: 1.4, y: 2.8, z: -5.2 }, camera, { axisHint: h("y"), role: "wall-boundary", jitterPx }),
  ];
}

function buildInteriorSceneFixture(): ParametricScene3d {
  const gtCam = makeSyntheticCamera({ yawDeg: 0, pitchDeg: -4, focalLengthPx: 960, eyeHeightMeters: 1.55 });
  const strokes: RoughPerspectiveStroke2d[] = [
    ...buildSyntheticCorridorStrokes(gtCam, 0.1),
    ...buildBoxStrokes("desk-main", "desk", { x: -0.2, y: 0.38, z: -3.2 }, { x: 1.4, y: 0.76, z: 0.72 }, gtCam, { label: "작업 책상" }),
    ...buildBoxStrokes("lamp-top", "tabletop-prop", { x: -0.1, y: 0.9, z: -3.2 }, { x: 0.28, y: 0.26, z: 0.24 }, gtCam, { label: "스탠드 조명", parentGroupId: "desk-main" }),
    ...buildBoxStrokes("chair-study", "chair", { x: 0.9, y: 0.44, z: -4.0 }, { x: 0.55, y: 0.88, z: 0.55 }, gtCam, { label: "작업 의자" }),
    ...buildBoxStrokes("cabinet-front", "cabinet", { x: 0.0, y: 0.85, z: -2.2 }, { x: 1.0, y: 1.7, z: 0.5 }, gtCam, { label: "전경 캐비닛" }),
    ...buildBoxStrokes("window-back", "window", { x: -0.6, y: 1.6, z: -5.8 }, { x: 1.4, y: 1.2, z: 0.16 }, gtCam, { label: "후면 창문" }),
  ];
  return liftRoughSketchToParametricScene3d({
    sceneId: "room-studio-01", archetype: "interior-room", strokes,
    cameraOptions: { viewportWidthPx: 1280, viewportHeightPx: 720, eyeHeightMeters: 1.55 },
    roomDimensionsOverrideMeters: { width: 5.4, depth: 6.4, height: 2.85 },
  });
}

describe("Wave 81 — 소실점 보정 및 카메라 자세 추정", () => {
  it("1점 투시 복도 러프 스트로크에서 소실점을 3px 이내 오차로 복원한다", () => {
    const gt = makeSyntheticCamera({ yawDeg: 0, pitchDeg: -3, focalLengthPx: 960 });
    const res = solveCameraFromRoughPerspectiveStrokes(buildSyntheticCorridorStrokes(gt, 0.2), {
      viewportWidthPx: 1280, viewportHeightPx: 720, defaultFocalLengthMm: 27,
    });
    expect(res.camera.perspectiveType).toBe("1-point");
    expect(Math.hypot(res.camera.vanishingPoints.vpZ!.x - gt.vanishingPoints.vpZ!.x, res.camera.vanishingPoints.vpZ!.y - gt.vanishingPoints.vpZ!.y)).toBeLessThan(3);
    expect(res.camera.focalLengthPx).toBeGreaterThan(400);
    expect(res.camera.focalLengthMm).toBeGreaterThan(14);
    expect(res.diagnostics.converged).toBe(true);
  });

  it("2점 투시 실내 스트로크에서 vpX·vpZ를 3px 이내로 복원하고 직교 제약 초점거리를 계산한다", () => {
    const gt = makeSyntheticCamera({ yawDeg: 32, pitchDeg: 0, focalLengthPx: 960 });
    const res = solveCameraFromRoughPerspectiveStrokes(buildSyntheticTwoPointRoomStrokes(gt, { jitterPx: 0.15 }), {
      viewportWidthPx: 1280, viewportHeightPx: 720,
    });
    expect(res.camera.perspectiveType).toBe("2-point");
    expect(Math.hypot(res.camera.vanishingPoints.vpX!.x - gt.vanishingPoints.vpX!.x, res.camera.vanishingPoints.vpX!.y - gt.vanishingPoints.vpX!.y)).toBeLessThan(3);
    expect(Math.hypot(res.camera.vanishingPoints.vpZ!.x - gt.vanishingPoints.vpZ!.x, res.camera.vanishingPoints.vpZ!.y - gt.vanishingPoints.vpZ!.y)).toBeLessThan(3);
    expect(res.diagnostics.focalLengthSource).toBe("orthogonality-xz");
    expect(Math.abs(res.camera.focalLengthPx - gt.focalLengthPx)).toBeLessThan(12);
    expect(Math.abs(res.camera.yawDeg - 32)).toBeLessThan(1.5);
  });

  it("axisHint 없는 auto 스트로크도 각도·RANSAC 자동 군집으로 2점 소실점을 3px 이내로 분리한다", () => {
    const gt = makeSyntheticCamera({ yawDeg: 35, pitchDeg: 0, focalLengthPx: 900 });
    const res = solveCameraFromRoughPerspectiveStrokes(
      buildSyntheticTwoPointRoomStrokes(gt, { useAutoHint: true, jitterPx: 0.1 }),
      { viewportWidthPx: 1280, viewportHeightPx: 720 },
    );
    expect(res.camera.perspectiveType).toBe("2-point");
    expect(Math.hypot(res.camera.vanishingPoints.vpZ!.x - gt.vanishingPoints.vpZ!.x, res.camera.vanishingPoints.vpZ!.y - gt.vanishingPoints.vpZ!.y)).toBeLessThan(3);
    expect(Math.hypot(res.camera.vanishingPoints.vpX!.x - gt.vanishingPoints.vpX!.x, res.camera.vanishingPoints.vpX!.y - gt.vanishingPoints.vpX!.y)).toBeLessThan(3);
  });

  it("이상치 낙서 스트로크가 섞여도 RANSAC+IRLS가 소실점을 3px 이내로 유지한다", () => {
    const gt = makeSyntheticCamera({ yawDeg: 28, pitchDeg: 0, focalLengthPx: 920 });
    const outliers: RoughPerspectiveStroke2d[] = [
      { id: "out-1", start: { x: 100, y: 120 }, end: { x: 640, y: 690 }, axisHint: "z" },
      { id: "out-2", start: { x: 1120, y: 80 }, end: { x: 320, y: 640 }, axisHint: "x" },
    ];
    const res = solveCameraFromRoughPerspectiveStrokes(
      [...buildSyntheticTwoPointRoomStrokes(gt, { jitterPx: 0.1 }), ...outliers],
      { viewportWidthPx: 1280, viewportHeightPx: 720 },
    );
    expect(Math.hypot(res.camera.vanishingPoints.vpZ!.x - gt.vanishingPoints.vpZ!.x, res.camera.vanishingPoints.vpZ!.y - gt.vanishingPoints.vpZ!.y)).toBeLessThan(3);
  });

  it("3점 투시 부감 구도에서 vpX·vpZ·vpY 3개 소실점과 평균 직교 초점거리를 복원한다", () => {
    const gt = makeSyntheticCamera({ yawDeg: 28, pitchDeg: -22, focalLengthPx: 880, eyeHeightMeters: 2.6 });
    const strokes: RoughPerspectiveStroke2d[] = [
      ...buildSyntheticTwoPointRoomStrokes(gt, { jitterPx: 0.08 }),
      projectSegmentToStroke("rm-y3", { x: 0.0, y: 0, z: -3.5 }, { x: 0.0, y: 2.8, z: -3.5 }, gt, { axisHint: "y" }),
      projectSegmentToStroke("rm-y4", { x: 2.1, y: 0, z: -3.8 }, { x: 2.1, y: 2.8, z: -3.8 }, gt, { axisHint: "y" }),
    ];
    const res = solveCameraFromRoughPerspectiveStrokes(strokes, { viewportWidthPx: 1280, viewportHeightPx: 720, eyeHeightMeters: 2.6 });
    expect(res.camera.perspectiveType).toBe("3-point");
    expect(res.diagnostics.focalLengthSource).toBe("orthogonality-3pt-mean");
    expect(Math.hypot(res.camera.vanishingPoints.vpY!.x - gt.vanishingPoints.vpY!.x, res.camera.vanishingPoints.vpY!.y - gt.vanishingPoints.vpY!.y)).toBeLessThan(3);
    expect(Math.abs(res.camera.pitchDeg - -22)).toBeLessThan(1.5);
  });

  it("기울어진 더치 앵글 2점 투시에서 카메라 roll 각도와 지평선 기울기를 복원한다", () => {
    const gt = makeSyntheticCamera({ yawDeg: 30, pitchDeg: -4, rollDeg: 6, focalLengthPx: 920 });
    const res = solveCameraFromRoughPerspectiveStrokes(buildSyntheticTwoPointRoomStrokes(gt, { jitterPx: 0.05 }), {
      viewportWidthPx: 1280, viewportHeightPx: 720,
    });
    expect(Math.abs(res.camera.rollDeg - 6)).toBeLessThan(0.8);
    expect(res.camera.horizonSlope).toBeGreaterThan(0.08);
  });

  it("바닥 평면(Y=0) 투영과 역투영이 미터 정밀도로 왕복 일치한다", () => {
    const cam = makeSyntheticCamera({ yawDeg: 18, pitchDeg: -8, rollDeg: 2, focalLengthPx: 940, eyeHeightMeters: 1.6 });
    const worldPt: Vec3 = { x: 1.15, y: 0, z: -4.4 };
    const projected = projectWorldPointToScreen(worldPt, cam)!;
    const restored = unprojectScreenPointToFloorPlane(projected.screenPx, cam, 0)!;
    expect(Math.abs(restored.x - worldPt.x)).toBeLessThan(1e-4);
    expect(restored.y).toBe(0);
    expect(Math.abs(restored.z - worldPt.z)).toBeLessThan(1e-4);
  });

  it("빈 입력이나 NaN/길이 0 퇴화 스트로크에서도 NaN 없이 안전하게 폴백한다", () => {
    const res = solveCameraFromRoughPerspectiveStrokes(
      [
        { id: "zero", start: { x: 100, y: 100 }, end: { x: 100, y: 100 } },
        { id: "nan", start: { x: Number.NaN, y: 10 }, end: { x: 20, y: 30 } },
      ],
      { viewportWidthPx: 1280, viewportHeightPx: 720 },
    );
    expect(Number.isFinite(res.camera.focalLengthPx)).toBe(true);
    expect(Number.isFinite(res.camera.horizonYPx)).toBe(true);
    expect(res.diagnostics.converged).toBe(false);
  });
});

describe("Wave 81 — 3D 파라메트릭 씬 리프트 및 접지 불변식", () => {
  it("interior-room 아키타입이 미터 규격 건축 면과 모든 소품을 수밀 박스로 리프트한다", () => {
    const scene = buildInteriorSceneFixture();
    expect(scene.units).toBe("meters");
    expect(scene.coordinateSystem).toBe("right-handed-y-up-gltf");
    expect(scene.enclosureBoundsMeters.minY).toBe(0);
    expect(scene.enclosurePlanes.map((p) => p.role)).toEqual(
      expect.arrayContaining(["floor", "ceiling", "wall-back", "wall-left", "wall-right"]),
    );
    expect(scene.props.length).toBe(5);
    for (const prop of scene.props) expect(prop.volumeCubicMeters).toBeGreaterThan(0);
  });

  it("모든 기립 소품(책상·의자·캐비닛)은 정확히 minY === 0에 바닥 접지된다", () => {
    const scene = buildInteriorSceneFixture();
    const standing = scene.props.filter((p) => p.groundedOn === "floor");
    expect(standing.length).toBeGreaterThanOrEqual(3);
    for (const prop of standing) {
      expect(prop.minYMeters).toBe(0);
      expect(prop.centerMeters.y).toBeCloseTo(prop.sizeMeters.y * 0.5, 6);
    }
    expect(scene.groundingAudit.allStandingPropsFloorSeated).toBe(true);
    expect(scene.groundingAudit.floatingPropIds).toEqual([]);
  });

  it("탁상 소품은 부모 책상 상판(maxY)에 오차 0으로 밀착 적층되며 수평 범위를 벗어나지 않는다", () => {
    const scene = buildInteriorSceneFixture();
    const desk = scene.props.find((p) => p.id === "desk-main")!;
    const lamp = scene.props.find((p) => p.id === "lamp-top")!;
    expect(lamp.groundedOn).toBe("parent-prop");
    expect(lamp.parentPropId).toBe(desk.id);
    expect(lamp.minYMeters).toBeCloseTo(desk.maxYMeters, 9);
    expect(Math.abs(lamp.centerMeters.x - desk.centerMeters.x)).toBeLessThanOrEqual(desk.sizeMeters.x * 0.5);
    expect(scene.groundingAudit.allStackedPropsFlush).toBe(true);
  });

  it("corridor-hallway 아키타입이 깊고 좁은 복도 규격과 5면 인클로저를 생성한다", () => {
    const cam = makeSyntheticCamera({ yawDeg: 0, pitchDeg: -2, focalLengthPx: 920 });
    const scene = liftRoughSketchToParametricScene3d({
      archetype: "corridor-hallway",
      strokes: [
        ...buildSyntheticCorridorStrokes(cam, 0.1),
        ...buildBoxStrokes("door-end", "door", { x: 0, y: 1.05, z: -8.5 }, { x: 0.95, y: 2.1, z: 0.15 }, cam),
      ],
      cameraOptions: { viewportWidthPx: 1280, viewportHeightPx: 720 },
    });
    const width = scene.enclosureBoundsMeters.maxX - scene.enclosureBoundsMeters.minX;
    const depth = scene.enclosureBoundsMeters.maxZ - scene.enclosureBoundsMeters.minZ;
    expect(depth).toBeGreaterThan(width * 2);
    expect(scene.enclosurePlanes.length).toBe(5);
    expect(scene.props[0]!.minYMeters).toBe(0);
  });

  it("urban-street-alley 아키타입이 천장 없는 노면·좌우 파사드와 접지된 건물·가로등을 생성한다", () => {
    const cam = makeSyntheticCamera({ yawDeg: 0, pitchDeg: 4, focalLengthPx: 840, eyeHeightMeters: 1.65 });
    const scene = liftRoughSketchToParametricScene3d({
      archetype: "urban-street-alley",
      strokes: [
        ...buildSyntheticCorridorStrokes(cam, 0.1),
        ...buildBoxStrokes("bldg-left", "building", { x: -2.6, y: 3.6, z: -9.0 }, { x: 2.6, y: 7.2, z: 4.0 }, cam),
        ...buildBoxStrokes("lamp-street", "streetlamp", { x: 1.8, y: 2.1, z: -6.0 }, { x: 0.25, y: 4.2, z: 0.25 }, cam),
      ],
      cameraOptions: { viewportWidthPx: 1280, viewportHeightPx: 720, eyeHeightMeters: 1.65 },
    });
    expect(scene.enclosurePlanes.map((p) => p.role)).toEqual(["road-surface", "facade-left", "facade-right"]);
    expect(scene.groundingAudit.allStandingPropsFloorSeated).toBe(true);
    expect(scene.props.every((p) => p.minYMeters === 0)).toBe(true);
  });

  it("roomDimensionsOverrideMeters 지정 시 건축 공간 치수가 정확히 반영된다", () => {
    const cam = makeSyntheticCamera({ yawDeg: 0, pitchDeg: 0, focalLengthPx: 960 });
    const scene = liftRoughSketchToParametricScene3d({
      archetype: "interior-room",
      strokes: buildSyntheticCorridorStrokes(cam),
      cameraOptions: { viewportWidthPx: 1280, viewportHeightPx: 720 },
      roomDimensionsOverrideMeters: { width: 8.0, depth: 9.0, height: 3.4 },
    });
    expect(scene.enclosureBoundsMeters.maxX - scene.enclosureBoundsMeters.minX).toBeCloseTo(8.0, 6);
    expect(scene.enclosureBoundsMeters.maxY).toBeCloseTo(3.4, 6);
    expect(scene.enclosureBoundsMeters.minZ).toBeCloseTo(-9.0, 6);
  });
});

describe("Wave 81 — 다각도 재투영, HLR 은선 제거, Ink DNA 일관성", () => {
  it("카메라를 -20°, 0°, +15° 회전해도 3D 월드 좌표는 100% 불변이며 스크린 X가 단조 이동한다", () => {
    const scene = buildInteriorSceneFixture();
    const leftCut = reprojectParametricSceneWithInkDna(scene, { deltaYawDeg: -20 }, DEFAULT_INK_DNA);
    const centerCut = reprojectParametricSceneWithInkDna(scene, { deltaYawDeg: 0 }, DEFAULT_INK_DNA);
    const rightCut = reprojectParametricSceneWithInkDna(scene, { deltaYawDeg: 15 }, DEFAULT_INK_DNA);

    expect(leftCut.zeroDriftVerified && centerCut.zeroDriftVerified && rightCut.zeroDriftVerified).toBe(true);
    const aL = leftCut.propAnchors.find((a) => a.id === "desk-main")!;
    const aC = centerCut.propAnchors.find((a) => a.id === "desk-main")!;
    const aR = rightCut.propAnchors.find((a) => a.id === "desk-main")!;
    expect(aL.centerMeters).toEqual(aC.centerMeters);
    expect(aR.centerMeters).toEqual(aC.centerMeters);
    expect(aL.sizeMeters).toEqual(aR.sizeMeters);
    expect(aL.projectedCenterPx!.x).toBeGreaterThan(aC.projectedCenterPx!.x);
    expect(aC.projectedCenterPx!.x).toBeGreaterThan(aR.projectedCenterPx!.x);
  });

  it("카메라 피치 변경 시 눈높이 지평선과 소실점 가이드가 물리적으로 동기화된다", () => {
    const scene = buildInteriorSceneFixture();
    const lookUp = reprojectParametricSceneWithInkDna(scene, { deltaPitchDeg: 10 }, DEFAULT_INK_DNA);
    const lookDown = reprojectParametricSceneWithInkDna(scene, { deltaPitchDeg: -10 }, DEFAULT_INK_DNA);
    expect(lookUp.perspectiveGuides.horizonLine.yAtCenterPx).toBeGreaterThan(lookDown.perspectiveGuides.horizonLine.yAtCenterPx);
    expect(lookUp.perspectiveGuides.convergenceRays.length).toBeGreaterThan(0);
    expect(lookDown.perspectiveGuides.convergenceRays.length).toBeGreaterThan(0);
  });

  it("카메라 돌리 전진 및 24mm→85mm 렌즈 화각 변화가 깊이와 화각을 정확히 갱신한다", () => {
    const scene = buildInteriorSceneFixture();
    const wide = applyCameraRigDelta(scene.calibratedCamera, { focalLengthMm: 24 });
    const tele = applyCameraRigDelta(scene.calibratedCamera, { focalLengthMm: 85 });
    expect(wide.horizontalFovDeg).toBeGreaterThan(tele.horizontalFovDeg);
    expect(tele.focalLengthPx).toBeGreaterThan(wide.focalLengthPx);
    const d0 = reprojectParametricSceneWithInkDna(scene, { dollyMeters: 0 }, DEFAULT_INK_DNA).propAnchors.find((a) => a.id === "desk-main")!.depthMeters!;
    const d1 = reprojectParametricSceneWithInkDna(scene, { dollyMeters: 0.7 }, DEFAULT_INK_DNA).propAnchors.find((a) => a.id === "desk-main")!.depthMeters!;
    expect(d1).toBeLessThan(d0);
  });

  it("HLR 은선 제거: 전경 캐비닛이 바로 뒤 의자와 후면 벽 모서리를 정확히 가린다", () => {
    const base = buildInteriorSceneFixture();
    const focused: ParametricScene3d = {
      ...base,
      props: [
        { id: "front-cabinet", label: "전경 대형 캐비닛", category: "cabinet", centerMeters: { x: 0, y: 1.0, z: -2.2 }, sizeMeters: { x: 1.4, y: 2.0, z: 0.5 }, yawDeg: 0, minYMeters: 0, maxYMeters: 2.0, groundedOn: "floor", parentPropId: null, volumeCubicMeters: 1.4, isSolidOccluder: true, sourceStrokeIds: ["s1"] },
        { id: "hidden-rear-chair", label: "가려진 후면 의자", category: "chair", centerMeters: { x: 0, y: 0.42, z: -4.8 }, sizeMeters: { x: 0.5, y: 0.84, z: 0.5 }, yawDeg: 0, minYMeters: 0, maxYMeters: 0.84, groundedOn: "floor", parentPropId: null, volumeCubicMeters: 0.21, isSolidOccluder: true, sourceStrokeIds: ["s2"] },
      ],
    };
    const reproj = reprojectParametricSceneWithInkDna(focused, {}, DEFAULT_INK_DNA);
    expect(reproj.hlrStats.occludedEdgeCount).toBeGreaterThan(0);
    expect(reproj.visibleSegments.filter((s) => s.sourceEntityId === "hidden-rear-chair").length).toBe(0);
    expect(reproj.visibleSegments.filter((s) => s.sourceEntityId === "front-cabinet").length).toBeGreaterThanOrEqual(4);
  });

  it("부분 HLR 분할: 전경 캐비닛 뒤를 가로지르는 후면 바닥 경계선이 좌우 가시 구간으로 절단된다", () => {
    const base = buildInteriorSceneFixture();
    const partial: ParametricScene3d = {
      ...base,
      props: [
        { id: "center-blocker", label: "중앙 차단 캐비닛", category: "cabinet", centerMeters: { x: 0, y: 0.9, z: -2.6 }, sizeMeters: { x: 1.1, y: 1.8, z: 0.48 }, yawDeg: 0, minYMeters: 0, maxYMeters: 1.8, groundedOn: "floor", parentPropId: null, volumeCubicMeters: 0.9504, isSolidOccluder: true, sourceStrokeIds: ["b1"] },
      ],
    };
    const reproj = reprojectParametricSceneWithInkDna(partial, {}, DEFAULT_INK_DNA);
    expect(reproj.hlrStats.partiallyOccludedEdgeCount).toBeGreaterThan(0);
    expect(reproj.visibleSegments.filter((s) => s.visibilityRatio < 0.98).length).toBeGreaterThan(0);
  });

  it("볼록 솔리드 박스의 뒷면 모서리는 자가 은선 컬링으로 투과 렌더링되지 않는다", () => {
    const reproj = reprojectParametricSceneWithInkDna(buildInteriorSceneFixture(), { deltaYawDeg: 8 }, DEFAULT_INK_DNA);
    expect(reproj.hlrStats.fullyOccludedEdgeCount).toBeGreaterThan(0);
  });

  it("Artist Ink DNA 계층: 외곽 실루엣이 내부 디테일보다 두껍고 건축 코너가 텍스처보다 두껍다", () => {
    const reproj = reprojectParametricSceneWithInkDna(
      buildInteriorSceneFixture(), { deltaYawDeg: 12 }, { ...DEFAULT_INK_DNA, depthAttenuationStrength: 0 },
    );
    const avg = (role: "silhouette-outer" | "structural-corner" | "prop-detail" | "surface-texture"): number => {
      const segs = reproj.visibleSegments.filter((s) => s.edgeRole === role);
      expect(segs.length).toBeGreaterThan(0);
      return segs.reduce((acc, s) => acc + s.strokeWidthPx, 0) / segs.length;
    };
    expect(avg("silhouette-outer")).toBeGreaterThan(avg("structural-corner"));
    expect(avg("structural-corner")).toBeGreaterThan(avg("prop-detail"));
    expect(avg("prop-detail")).toBeGreaterThan(avg("surface-texture"));
  });

  it("원근 깊이 감쇠(1/depth): 근거리 전경 소품 외곽선이 원거리 소품·벽보다 두껍게 그려진다", () => {
    const base = buildInteriorSceneFixture();
    const depthScene: ParametricScene3d = {
      ...base,
      props: [
        { id: "near-box", label: "근경 소품", category: "cabinet", centerMeters: { x: -1.1, y: 0.5, z: -2.0 }, sizeMeters: { x: 0.6, y: 1.0, z: 0.5 }, yawDeg: 0, minYMeters: 0, maxYMeters: 1.0, groundedOn: "floor", parentPropId: null, volumeCubicMeters: 0.3, isSolidOccluder: true, sourceStrokeIds: ["n1"] },
        { id: "far-box", label: "원경 소품", category: "cabinet", centerMeters: { x: 1.1, y: 0.5, z: -5.8 }, sizeMeters: { x: 0.6, y: 1.0, z: 0.5 }, yawDeg: 0, minYMeters: 0, maxYMeters: 1.0, groundedOn: "floor", parentPropId: null, volumeCubicMeters: 0.3, isSolidOccluder: true, sourceStrokeIds: ["f1"] },
      ],
    };
    const reproj = reprojectParametricSceneWithInkDna(depthScene, {}, DEFAULT_INK_DNA);
    const nearSil = reproj.visibleSegments.filter((s) => s.sourceEntityId === "near-box" && s.edgeRole === "silhouette-outer");
    const farSil = reproj.visibleSegments.filter((s) => s.sourceEntityId === "far-box" && s.edgeRole === "silhouette-outer");
    const nearAvg = nearSil.reduce((acc, s) => acc + s.strokeWidthPx, 0) / nearSil.length;
    const farAvg = farSil.reduce((acc, s) => acc + s.strokeWidthPx, 0) / farSil.length;
    expect(nearAvg).toBeGreaterThan(farAvg);
  });

  it("Ink DNA 펜 떨림은 양 끝점을 모서리에 고정하고 테이퍼·결정적 시드 재현성을 만족한다", () => {
    const scene = buildInteriorSceneFixture();
    const runA = reprojectParametricSceneWithInkDna(scene, { deltaYawDeg: 10 }, DEFAULT_INK_DNA);
    const runB = reprojectParametricSceneWithInkDna(scene, { deltaYawDeg: 10 }, DEFAULT_INK_DNA);
    const longSegA = runA.visibleSegments.find((s) => s.polylinePx.length > 2)!;
    const longSegB = runB.visibleSegments.find((s) => s.id === longSegA.id)!;
    expect(longSegA.polylinePx).toEqual(longSegB.polylinePx);
    expect(longSegA.polylinePx[0]).toEqual(longSegA.startPx);
    expect(longSegA.polylinePx[longSegA.polylinePx.length - 1]).toEqual(longSegA.endPx);
    expect(longSegA.startTipWidthPx).toBeLessThan(longSegA.strokeWidthPx);
    expect(longSegA.endTipWidthPx).toBeLessThan(longSegA.strokeWidthPx);
  });
});

describe("Wave 81 — SVG 비파괴 선화 및 glTF 호환 메쉬 매니페스트 익스포트", () => {
  it("renderReprojectedSceneInkSvg가 4개 분리 <g> 레이어와 NaN/Infinity 없는 SVG를 생성한다", () => {
    const reproj = reprojectParametricSceneWithInkDna(buildInteriorSceneFixture(), { deltaYawDeg: 15 }, DEFAULT_INK_DNA);
    const rendered = renderReprojectedSceneInkSvg(reproj);
    expect(rendered.svg).toContain('id="horizon-guides"');
    expect(rendered.svg).toContain('id="architecture-shell"');
    expect(rendered.svg).toContain('id="foreground-props"');
    expect(rendered.svg).toContain('id="ink-silhouette"');
    expect(rendered.svg).not.toContain("NaN");
    expect(rendered.svg).not.toContain("Infinity");
    expect(rendered.layerSegmentCounts.horizonGuides).toBeGreaterThan(0);
    expect(rendered.layerSegmentCounts.architectureShell).toBeGreaterThan(0);
    expect(rendered.layerSegmentCounts.inkSilhouette).toBeGreaterThan(0);
    expect(rendered.totalPaths).toBe(reproj.visibleSegments.length);
  });

  it("includeHorizonGuides=false 시 가이드 레이어가 비워지고 XML 특수문자가 안전하게 이스케이프된다", () => {
    const scene = { ...buildInteriorSceneFixture(), sceneId: 'cut-<1>&"hero"' };
    const rendered = renderReprojectedSceneInkSvg(reprojectParametricSceneWithInkDna(scene, {}, DEFAULT_INK_DNA), {
      includeHorizonGuides: false,
    });
    expect(rendered.layerSegmentCounts.horizonGuides).toBe(0);
    expect(rendered.svg).toContain("cut-&lt;1&gt;&amp;&quot;hero&quot;");
    expect(rendered.totalPaths).toBeGreaterThan(0);
  });

  it("exportParametricSceneMeshManifest가 수밀 매니폴드 박스와 Y=0 바닥 접지 감사를 검증한다", () => {
    const scene = buildInteriorSceneFixture();
    const manifest = exportParametricSceneMeshManifest(scene);
    expect(manifest.units).toBe("meters");
    expect(manifest.coordinateSystem).toBe("right-handed-y-up-gltf");
    expect(manifest.audit.floorPlaneY).toBe(0);
    expect(manifest.audit.hasNonFiniteVertex).toBe(false);
    expect(manifest.audit.allStandingPropsGroundedAtZero).toBe(true);
    expect(manifest.audit.allStackedPropsFlush).toBe(true);
    expect(manifest.audit.allPropMeshesWatertightManifold).toBe(true);
    const propNodes = manifest.nodes.filter((n) => n.kind === "parametric-prop");
    expect(propNodes.length).toBe(scene.props.length);
    for (const node of propNodes) {
      expect(node.vertexCount).toBe(8);
      expect(node.quadCount).toBe(6);
      expect(node.triangleCount).toBe(12);
      expect(node.nonManifoldEdgeCount).toBe(0);
      expect(node.openBoundaryEdgeCount).toBe(0);
      expect(node.eulerCharacteristic).toBe(2);
    }
    const serialized = serializeParametricSceneMeshManifestJson(manifest);
    expect(serialized).not.toContain("NaN");
    expect(serialized).not.toContain("Infinity");
    const parsed = JSON.parse(serialized) as { schemaVersion: string; nodes: unknown[] };
    expect(parsed.schemaVersion).toBe("toonstudio.wave81.gltf-mesh-manifest.v1");
    expect(parsed.nodes.length).toBe(manifest.nodes.length);
  });

  it("glTF 메쉬 매니페스트의 PBR 재질 슬롯은 3~6개 규율과 이진 금속성(0 또는 1)을 지킨다", () => {
    const manifest = exportParametricSceneMeshManifest(buildInteriorSceneFixture());
    expect(manifest.materialSlots.length).toBeGreaterThanOrEqual(3);
    expect(manifest.materialSlots.length).toBeLessThanOrEqual(6);
    const slotIds = new Set(manifest.materialSlots.map((s) => s.id));
    for (const slot of manifest.materialSlots) expect([0, 1]).toContain(slot.metallicFactor);
    for (const node of manifest.nodes) expect(slotIds.has(node.materialSlotId)).toBe(true);
  });
});
