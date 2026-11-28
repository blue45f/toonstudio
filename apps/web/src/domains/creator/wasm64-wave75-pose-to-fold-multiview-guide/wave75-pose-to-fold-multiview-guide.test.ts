import { describe, expect, it } from "vitest";

import {
  GARMENT_FABRIC_PRESETS,
  auditDrawingAgainstMultiviewGuide,
  buildCharacterMultiviewModel,
  createStandardPoseSkeleton3d,
  exportGarmentFoldAndGuideOverlay,
  projectMultiviewTurnaroundGuide,
  solvePoseToGarmentFolds,
  type CharacterSheetInput,
  type DrawnLandmarkObservation,
  type GarmentFabricPresetId,
} from "./index";

function createSampleCharacterSheet(): CharacterSheetInput {
  return {
    characterId: "char-seoyeon-01",
    characterName: "서연",
    views: [
      { view: "front", eyeLineRatio: 0.5, chinTaper: 0.62, earTopRatio: 0.54, earBottomRatio: 0.34, headWidthToHeight: 0.72, hairCrownVolume: 1.22, hairSilhouetteSpread: 1.18 },
      { view: "three-quarter", eyeLineRatio: 0.5, chinTaper: 0.6, jawAngleDeg: 124, headWidthToHeight: 0.73, headDepthToHeight: 0.84, hairCrownVolume: 1.2 },
      { view: "side", eyeLineRatio: 0.5, earTopRatio: 0.54, earBottomRatio: 0.34, jawAngleDeg: 122, headDepthToHeight: 0.83, noseProtrusionRatio: 0.12, hairCrownVolume: 1.2 },
    ],
    signatureLandmarks: [
      { id: "left-cheek-scar", labelKo: "왼쪽 볼 흉터", kind: "scar", anatomicalSide: "left", verticalRatio: 0.37, lateralRatio: 0.38 },
      { id: "right-cheek-mole", labelKo: "오른쪽 볼 점", kind: "mole", anatomicalSide: "right", verticalRatio: 0.37, lateralRatio: 0.38 },
      { id: "left-earring", labelKo: "왼쪽 귀걸이", kind: "earring", anatomicalSide: "left", verticalRatio: 0.33, lateralRatio: 0.96 },
    ],
    inkDna: { baseOuterContourWidthPx: 2.6, baseHairStrokeWidthPx: 1.75, baseInteriorDetailWidthPx: 1.0, silhouetteEmphasis: 1.35, depthAttenuation: 0.3 },
  };
}

describe("Wave 75: 3D 포즈 연동 의상 주름 물리 엔진 (Pose-to-Fold Physics)", () => {
  it("6종 원단 프리셋이 물리적 강성·중량·주파수 범위를 일관되게 정의한다", () => {
    const presetIds: GarmentFabricPresetId[] = ["cotton-shirt", "wool-blazer", "silk-dress", "denim-jacket", "pleated-skirt", "flowing-cape"];
    for (const id of presetIds) {
      const spec = GARMENT_FABRIC_PRESETS[id];
      expect(spec.id).toBe(id);
      expect(spec.bendingStiffness).toBeGreaterThan(0);
      expect(spec.bendingStiffness).toBeLessThanOrEqual(1);
      expect(spec.arealDensityGsm).toBeGreaterThan(30);
      expect(spec.foldFrequencyScale).toBeGreaterThan(0.3);
      expect(spec.curvatureSoftness).toBeGreaterThan(0);
    }
    expect(GARMENT_FABRIC_PRESETS["silk-dress"].bendingStiffness).toBeLessThan(GARMENT_FABRIC_PRESETS["wool-blazer"].bendingStiffness);
    expect(GARMENT_FABRIC_PRESETS["wool-blazer"].bendingStiffness).toBeLessThan(GARMENT_FABRIC_PRESETS["denim-jacket"].bendingStiffness);
  });

  it("팔꿈치 굴곡을 5°에서 115°로 증가시키면 안쪽 zigzag-compression 주름 수와 밀도가 단조 증가한다", () => {
    const counts = [5, 35, 70, 115].map((angle) => {
      const skeleton = createStandardPoseSkeleton3d({ leftElbow: { flexionDeg: angle }, rightElbow: { flexionDeg: 5 } });
      return solvePoseToGarmentFolds({ skeleton, fabricPreset: "cotton-shirt" }).folds.filter(
        (f) => f.region === "left-elbow" && f.topology === "zigzag-compression",
      ).length;
    });
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThanOrEqual(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThanOrEqual(counts[2]);
  });

  it("관절 flexionDeg가 생략되어도 3D 뼈 벡터 각도로 자동 굴곡을 계산해 주름을 생성한다", () => {
    const straight = createStandardPoseSkeleton3d({
      leftShoulder: { position: { x: 0.21, y: 1.41, z: 0 } },
      leftElbow: { position: { x: 0.21, y: 1.11, z: 0 }, flexionDeg: undefined },
      leftWrist: { position: { x: 0.21, y: 0.81, z: 0 } },
    });
    const bent = createStandardPoseSkeleton3d({
      leftShoulder: { position: { x: 0.21, y: 1.41, z: 0 } },
      leftElbow: { position: { x: 0.21, y: 1.11, z: 0 }, flexionDeg: undefined },
      leftWrist: { position: { x: 0.21, y: 1.24, z: 0.26 } },
    });
    const straightZig = solvePoseToGarmentFolds({ skeleton: straight, fabricPreset: "cotton-shirt" }).folds.filter(
      (f) => f.region === "left-elbow" && f.topology === "zigzag-compression",
    ).length;
    const bentZig = solvePoseToGarmentFolds({ skeleton: bent, fabricPreset: "cotton-shirt" }).folds.filter(
      (f) => f.region === "left-elbow" && f.topology === "zigzag-compression",
    ).length;
    expect(straightZig).toBe(0);
    expect(bentZig).toBeGreaterThanOrEqual(3);
  });

  it("동일 포즈에서 silk-dress는 denim-jacket 및 wool-blazer보다 주름 주파수가 높고 곡률이 더 부드럽다", () => {
    const pose = createStandardPoseSkeleton3d({
      leftElbow: { flexionDeg: 95, twistDeg: 35 },
      rightElbow: { flexionDeg: 85, twistDeg: -30 },
      spineUpper: { twistDeg: 28 },
    });
    const silk = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "silk-dress" });
    const wool = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "wool-blazer" });
    const denim = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "denim-jacket" });

    expect(silk.metrics.averageFoldFrequencyPerMeter).toBeGreaterThan(wool.metrics.averageFoldFrequencyPerMeter);
    expect(silk.metrics.averageFoldFrequencyPerMeter).toBeGreaterThan(denim.metrics.averageFoldFrequencyPerMeter);
    expect(silk.metrics.averageCurvatureSoftness).toBeGreaterThan(wool.metrics.averageCurvatureSoftness);
    expect(silk.metrics.averageCurvatureSoftness).toBeGreaterThan(denim.metrics.averageCurvatureSoftness);
    expect(silk.metrics.totalFolds).toBeGreaterThan(denim.metrics.totalFolds);
  });

  it("몸통과 전완의 축 비틀림(twistDeg)이 나선형 spiral-twist 주름을 유도하고 방향 부호를 반영한다", () => {
    const neutral = solvePoseToGarmentFolds({
      skeleton: createStandardPoseSkeleton3d({ spineUpper: { twistDeg: 0 }, leftElbow: { twistDeg: 0 }, rightElbow: { twistDeg: 0 } }),
      fabricPreset: "cotton-shirt",
    });
    const posSol = solvePoseToGarmentFolds({
      skeleton: createStandardPoseSkeleton3d({ spineUpper: { twistDeg: 55 }, leftElbow: { twistDeg: 48 } }),
      fabricPreset: "cotton-shirt",
    });
    const negSol = solvePoseToGarmentFolds({
      skeleton: createStandardPoseSkeleton3d({ spineUpper: { twistDeg: -55 }, leftElbow: { twistDeg: -48 } }),
      fabricPreset: "cotton-shirt",
    });

    expect(neutral.topologyCounts["spiral-twist"]).toBe(0);
    expect(posSol.topologyCounts["spiral-twist"]).toBeGreaterThanOrEqual(4);
    expect(negSol.topologyCounts["spiral-twist"]).toBeGreaterThanOrEqual(4);

    const posTorso = posSol.folds.find((f) => f.topology === "spiral-twist" && f.region === "torso-twist");
    const negTorso = negSol.folds.find((f) => f.topology === "spiral-twist" && f.region === "torso-twist");
    expect(posTorso).toBeDefined();
    expect(negTorso).toBeDefined();
    if (posTorso && negTorso) {
      expect((posTorso.curve.p3.x - posTorso.curve.p0.x) * (negTorso.curve.p3.x - negTorso.curve.p0.x)).toBeLessThan(0);
    }
  });

  it("깊은 관절 굴곡(>= 45°)에서 급격한 방향 전환 half-lock 주름이 함께 생성된다", () => {
    const solStraight = solvePoseToGarmentFolds({
      skeleton: createStandardPoseSkeleton3d({ leftElbow: { flexionDeg: 10 }, rightElbow: { flexionDeg: 10 } }),
      fabricPreset: "denim-jacket",
    });
    const solBent = solvePoseToGarmentFolds({
      skeleton: createStandardPoseSkeleton3d({ leftElbow: { flexionDeg: 92 }, rightElbow: { flexionDeg: 68 } }),
      fabricPreset: "denim-jacket",
    });
    expect(solStraight.topologyCounts["half-lock"]).toBe(0);
    expect(solBent.topologyCounts["half-lock"]).toBeGreaterThanOrEqual(2);
  });

  it("양쪽 어깨에 고정된 flowing-cape는 중력 방향 현수선 diaper-sling 곡선을 생성한다", () => {
    const pose = createStandardPoseSkeleton3d();
    const normalGrav = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "flowing-cape", gravity: { x: 0, y: -9.81, z: 0 } });
    const windGrav = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "flowing-cape", gravity: { x: 6.5, y: -7.5, z: 0 } });

    expect(normalGrav.topologyCounts["diaper-sling"]).toBeGreaterThanOrEqual(4);
    const slingN = normalGrav.folds.find((f) => f.topology === "diaper-sling");
    const slingW = windGrav.folds.find((f) => f.topology === "diaper-sling");
    expect(slingN).toBeDefined();
    expect(slingW).toBeDefined();
    if (slingN && slingW) {
      expect(0.5 * (slingN.curve.p1.y + slingN.curve.p2.y)).toBeGreaterThan(0.5 * (slingN.curve.p0.y + slingN.curve.p3.y));
      expect(0.5 * (slingW.curve.p1.x + slingW.curve.p2.x)).toBeGreaterThan(0.5 * (slingN.curve.p1.x + slingN.curve.p2.x));
    }
  });

  it("중력 드레이프 pipe-fold와 지지선 이탈 drop-fold가 pleated-skirt 및 flowing-cape에서 생성된다", () => {
    const pose = createStandardPoseSkeleton3d();
    const skirt = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "pleated-skirt" });
    const cape = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "flowing-cape" });
    expect(skirt.topologyCounts["pipe-fold"]).toBeGreaterThanOrEqual(5);
    expect(cape.topologyCounts["pipe-fold"]).toBeGreaterThanOrEqual(6);
    expect(cape.topologyCounts["drop-fold"]).toBeGreaterThanOrEqual(4);
  });

  it("바닥에 닿는 긴 silk-dress와 flowing-cape는 inert-pool 주름을 만들고 짧은 denim-jacket은 만들지 않는다", () => {
    const pose = createStandardPoseSkeleton3d();
    expect(solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "silk-dress" }).topologyCounts["inert-pool"]).toBeGreaterThanOrEqual(2);
    expect(solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "flowing-cape" }).topologyCounts["inert-pool"]).toBeGreaterThanOrEqual(2);
    expect(solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "denim-jacket" }).topologyCounts["inert-pool"]).toBe(0);
  });

  it("만화 펜선 굵기 변조가 그림자 측 압축 주름을 장력 능선보다 굵고 선명하게 표현한다", () => {
    const pose = createStandardPoseSkeleton3d({ leftElbow: { flexionDeg: 95 }, spineUpper: { twistDeg: 35 } });
    const sol = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "cotton-shirt" });
    expect(sol.metrics.averageShadowStrokeWidthPx).toBeGreaterThan(sol.metrics.averageTensionStrokeWidthPx);
    for (const fold of sol.folds) {
      expect(fold.strokeWidthMidPx).toBeGreaterThanOrEqual(fold.strokeWidthStartPx);
      expect(fold.strokeWidthMidPx).toBeGreaterThanOrEqual(fold.strokeWidthEndPx);
    }
  });

  it("변형률 텐서가 굽힌 팔꿈치의 압축 주응력(음수)과 비틀린 몸통의 전단 변형률을 정확히 보고하고 모든 좌표가 유한하다", () => {
    const pose = createStandardPoseSkeleton3d({ leftElbow: { flexionDeg: 100 }, spineUpper: { twistDeg: 45 } });
    const sol = solvePoseToGarmentFolds({ skeleton: pose, fabricPreset: "silk-dress" });
    expect(sol.regionStrains.find((r) => r.region === "left-elbow")?.principalStrain2 ?? 0).toBeLessThan(0);
    expect(sol.regionStrains.find((r) => r.region === "torso-twist")?.gammaShear ?? 0).toBeGreaterThan(0);
    for (const f of sol.folds) {
      for (const v of [f.curve.p0.x, f.curve.p0.y, f.curve.p1.x, f.curve.p1.y, f.curve.p2.x, f.curve.p2.y, f.curve.p3.x, f.curve.p3.y]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("Wave 75: 멀티뷰 캐릭터 턴어라운드 가이드 및 비례 감사 엔진", () => {
  it("2~3컷 시트를 3D 두상 모델로 융합하고 1컷 이하 입력은 한국어 오류로 거부한다", () => {
    const sheet = createSampleCharacterSheet();
    const model3 = buildCharacterMultiviewModel(sheet);
    expect(model3.sourceViews).toEqual(["front", "three-quarter", "side"]);
    expect(model3.sheetConsistencyScore).toBeGreaterThan(0.9);
    expect(model3.proportions.hairRadii.y).toBeGreaterThan(model3.proportions.headRadii.y);

    const model2 = buildCharacterMultiviewModel({ ...sheet, views: [sheet.views[0], sheet.views[2]] });
    expect(model2.sourceViews).toEqual(["front", "side"]);
    expect(() => buildCharacterMultiviewModel({ ...sheet, views: [sheet.views[0]] })).toThrow(/최소 2개/);
  });

  it("요(yaw) 회전 시 해부학적 왼쪽 볼 흉터가 오른쪽 화면 경계로 단조 이동하고 yaw <= -85°에서 가려짐(occluded) 처리된다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const screenXs: number[] = [];
    for (const yawDeg of [45, 15, 0, -20, -45]) {
      const guide = projectMultiviewTurnaroundGuide(model, { yawDeg, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
      const scar = guide.landmarks.find((lm) => lm.id === "left-cheek-scar");
      expect(scar).toBeDefined();
      expect(scar?.occluded).toBe(false);
      if (scar) screenXs.push(scar.x);
    }
    for (let i = 1; i < screenXs.length; i += 1) {
      expect(screenXs[i]).toBeGreaterThan(screenXs[i - 1]);
    }
    for (const hiddenYaw of [-85, -90, -110]) {
      const guide = projectMultiviewTurnaroundGuide(model, { yawDeg: hiddenYaw, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
      expect(guide.landmarks.find((lm) => lm.id === "left-cheek-scar")?.occluded).toBe(true);
    }
  });

  it("오른쪽 볼 점은 왼쪽 볼 흉터와 정확한 좌우 대칭 카이랄성 및 가림 반전을 유지한다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const front = projectMultiviewTurnaroundGuide(model, { yawDeg: 0, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    const leftScar = front.landmarks.find((lm) => lm.id === "left-cheek-scar");
    const rightMole = front.landmarks.find((lm) => lm.id === "right-cheek-mole");
    expect(leftScar && leftScar.x > front.headCenter2d.x).toBe(true);
    expect(rightMole && rightMole.x < front.headCenter2d.x).toBe(true);

    const turnedLeft = projectMultiviewTurnaroundGuide(model, { yawDeg: 85, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    const turnedRight = projectMultiviewTurnaroundGuide(model, { yawDeg: -85, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    expect(turnedLeft.landmarks.find((lm) => lm.id === "right-cheek-mole")?.occluded).toBe(true);
    expect(turnedLeft.landmarks.find((lm) => lm.id === "left-cheek-scar")?.occluded).toBe(false);
    expect(turnedRight.landmarks.find((lm) => lm.id === "right-cheek-mole")?.occluded).toBe(false);
  });

  it("피치(pitch) 변화에 따라 Loomis 눈높이 교차선이 하이앵글(+35°)에서는 아래로, 로우앵글(-35°)에서는 위로 휘어진다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const highAngle = projectMultiviewTurnaroundGuide(model, { yawDeg: 0, pitchDeg: 35, viewportWidth: 800, viewportHeight: 800 });
    const lowAngle = projectMultiviewTurnaroundGuide(model, { yawDeg: 0, pitchDeg: -35, viewportWidth: 800, viewportHeight: 800 });
    const bow = (pts: readonly { readonly y: number }[]) => pts[Math.floor(pts.length / 2)].y - 0.5 * (pts[0].y + pts[pts.length - 1].y);

    expect(bow(highAngle.contours.eyeLine.points)).toBeGreaterThan(8);
    expect(bow(lowAngle.contours.eyeLine.points)).toBeLessThan(-8);
  });

  it("극단적인 요(-180..+180)·피치(-60..+60)·롤 조합에서도 모든 투영 좌표가 NaN 없이 유한하다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const cams = [
      { yawDeg: -180, pitchDeg: -60, rollDeg: -25, focalLengthMm: 24 },
      { yawDeg: -90, pitchDeg: 35, rollDeg: 15, focalLengthMm: 35 },
      { yawDeg: 90, pitchDeg: -35, rollDeg: -15, focalLengthMm: 85 },
      { yawDeg: 180, pitchDeg: 60, rollDeg: 25, focalLengthMm: 135 },
    ];
    for (const cam of cams) {
      const guide = projectMultiviewTurnaroundGuide(model, { ...cam, viewportWidth: 900, viewportHeight: 900 });
      expect(Number.isFinite(guide.projectedHeadHeightPx)).toBe(true);
      for (const lm of guide.landmarks) {
        expect(Number.isFinite(lm.x) && Number.isFinite(lm.y) && Number.isFinite(lm.adaptedStrokeWidthPx)).toBe(true);
      }
    }
  });

  it("28mm 광각 렌즈는 105mm 망원 렌즈보다 코/눈썹·코/귀 깊이 원근 단축 비율을 뚜렷하게 크게 만든다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const wide28 = projectMultiviewTurnaroundGuide(model, { yawDeg: -25, pitchDeg: 5, focalLengthMm: 28, viewportWidth: 800, viewportHeight: 800 });
    const tele105 = projectMultiviewTurnaroundGuide(model, { yawDeg: -25, pitchDeg: 5, focalLengthMm: 105, viewportWidth: 800, viewportHeight: 800 });

    expect(wide28.perspectiveMetrics.noseToBrowScaleRatio).toBeGreaterThan(tele105.perspectiveMetrics.noseToBrowScaleRatio);
    expect(wide28.perspectiveMetrics.noseToEarScaleRatio).toBeGreaterThan(tele105.perspectiveMetrics.noseToEarScaleRatio);
    expect(wide28.perspectiveMetrics.foreshorteningIntensity).toBeGreaterThan(tele105.perspectiveMetrics.foreshorteningIntensity * 2);
  });

  it("작가 Ink DNA 적응이 외곽 실루엣 > 헤어 볼륨 > 내부 가이드 선 굵기 위계를 유지한다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const guide = projectMultiviewTurnaroundGuide(model, { yawDeg: -30, pitchDeg: 8, focalLengthMm: 50, viewportWidth: 800, viewportHeight: 800 });

    expect(guide.inkStrokeHierarchyPx.outerContourPx).toBeGreaterThan(guide.inkStrokeHierarchyPx.hairVolumePx);
    expect(guide.inkStrokeHierarchyPx.hairVolumePx).toBeGreaterThan(guide.inkStrokeHierarchyPx.interiorDetailPx);
    expect(guide.contours.headSilhouette.adaptedStrokeWidthPx).toBeGreaterThan(guide.contours.hairVolumeSilhouette.adaptedStrokeWidthPx);
    expect(guide.contours.hairVolumeSilhouette.adaptedStrokeWidthPx).toBeGreaterThan(guide.contours.eyeLine.adaptedStrokeWidthPx);
  });

  it("비례 이탈 감사기가 정확한 투영 좌표 일치 시 driftPercent < 1% 및 passed=true를 반환한다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const guide = projectMultiviewTurnaroundGuide(model, { yawDeg: -25, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    const drawnExact: DrawnLandmarkObservation[] = guide.landmarks.filter((lm) => !lm.occluded).map((lm) => ({ id: lm.id, x: lm.x, y: lm.y }));
    const report = auditDrawingAgainstMultiviewGuide(guide, drawnExact);

    expect(report.overallDriftPercent).toBeLessThan(1);
    expect(report.maxDriftPercent).toBeLessThan(1);
    expect(report.chiralityViolationCount).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("오른쪽 눈을 두상 높이의 6.4% 위로 올려 그리면 이탈률과 한국어 교정 가이드를 정확히 보고한다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const guide = projectMultiviewTurnaroundGuide(model, { yawDeg: 0, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    const rightEye = guide.landmarks.find((lm) => lm.id === "right-eye");
    expect(rightEye).toBeDefined();
    if (!rightEye) return;

    const report = auditDrawingAgainstMultiviewGuide(guide, [
      { id: "right-eye", x: rightEye.x, y: rightEye.y - guide.projectedHeadHeightPx * 0.064 },
    ]);
    expect(report.passed).toBe(false);
    expect(report.findings[0].driftPercent).toBeCloseTo(6.4, 1);
    expect(report.findings[0].guidanceKo).toContain("오른쪽 눈 높이가 정면 설정보다");
    expect(report.findings[0].guidanceKo).toContain("6.4% 높습니다");
  });

  it("턱각 너비 과장 시 턱 비례 이탈을 감지하고 한국어 안내를 생성한다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const guide = projectMultiviewTurnaroundGuide(model, { yawDeg: 0, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    const leftJaw = guide.landmarks.find((lm) => lm.id === "left-jaw-corner");
    expect(leftJaw).toBeDefined();
    if (!leftJaw) return;

    const report = auditDrawingAgainstMultiviewGuide(guide, [
      { id: "left-jaw-corner", x: leftJaw.x + guide.projectedHeadHeightPx * 0.09, y: leftJaw.y },
    ]);
    expect(report.passed).toBe(false);
    expect(report.findings[0].driftPercent).toBeGreaterThan(8);
    expect(report.findings[0].guidanceKo).toContain("왼쪽 턱각");
  });

  it("왼쪽 볼 흉터를 반대쪽 볼에 그리면 좌우 반전을, 가려진 각도에서 그리면 가림 위반을 탐지한다", () => {
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const front = projectMultiviewTurnaroundGuide(model, { yawDeg: 0, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    const rightMole = front.landmarks.find((lm) => lm.id === "right-cheek-mole");
    expect(rightMole).toBeDefined();
    if (!rightMole) return;

    const inv = auditDrawingAgainstMultiviewGuide(front, [{ id: "left-cheek-scar", x: rightMole.x, y: rightMole.y }]);
    expect(inv.passed).toBe(false);
    expect(inv.chiralityViolationCount).toBe(1);
    expect(inv.findings[0].chiralityInverted).toBe(true);
    expect(inv.findings[0].guidanceKo).toContain("좌우 반전");

    const away = projectMultiviewTurnaroundGuide(model, { yawDeg: -90, pitchDeg: 0, viewportWidth: 800, viewportHeight: 800 });
    const hiddenScar = away.landmarks.find((lm) => lm.id === "left-cheek-scar");
    expect(hiddenScar?.occluded).toBe(true);
    const occ = auditDrawingAgainstMultiviewGuide(away, [{ id: "left-cheek-scar", x: hiddenScar?.x ?? 400, y: hiddenScar?.y ?? 400 }]);
    expect(occ.passed).toBe(false);
    expect(occ.occlusionViolationCount).toBe(1);
    expect(occ.findings[0].drawnWhileOccluded).toBe(true);
  });
});

describe("Wave 75: 비파괴 5레이어 SVG 및 Canvas 오버레이 익스포터", () => {
  function buildFixtures() {
    const skeleton = createStandardPoseSkeleton3d({ leftElbow: { flexionDeg: 90, twistDeg: 40 }, spineUpper: { twistDeg: 35 } });
    const folds = solvePoseToGarmentFolds({ skeleton, fabricPreset: "flowing-cape" });
    const model = buildCharacterMultiviewModel(createSampleCharacterSheet());
    const guide = projectMultiviewTurnaroundGuide(model, { yawDeg: -85, pitchDeg: 10, viewportWidth: 800, viewportHeight: 1000 });
    return { folds, guide };
  }

  it("5개 분리 레이어를 가진 유효한 SVG를 생성하며 NaN 또는 Infinity 좌표가 전혀 없다", () => {
    const { folds, guide } = buildFixtures();
    const bundle = exportGarmentFoldAndGuideOverlay({ folds, guide });

    expect(bundle.svg.startsWith("<svg ")).toBe(true);
    expect(bundle.svg.endsWith("</svg>")).toBe(true);
    expect(bundle.svg).not.toContain("NaN");
    expect(bundle.svg).not.toContain("Infinity");
    for (const layer of ["tension-ridges", "compression-creases", "head-proportion-cage", "hair-volume-silhouette", "chirality-markers"] as const) {
      expect(bundle.svg).toContain(`data-layer="${layer}"`);
      expect(bundle.layerStats[layer].commandCount).toBeGreaterThan(0);
    }
  });

  it("prefersReducedOpacity=true 시 모든 활성 레이어 불투명도가 차분하게 낮아진다", () => {
    const { folds, guide } = buildFixtures();
    const normal = exportGarmentFoldAndGuideOverlay({ folds, guide, prefersReducedOpacity: false });
    const reduced = exportGarmentFoldAndGuideOverlay({ folds, guide, prefersReducedOpacity: true });
    expect(reduced.prefersReducedOpacity).toBe(true);
    for (const key of Object.keys(normal.layerStats) as Array<keyof typeof normal.layerStats>) {
      expect(reduced.layerStats[key].opacity).toBeLessThan(normal.layerStats[key].opacity);
    }
  });

  it("visibleLayers 옵션으로 특정 레이어를 비활성화하면 SVG와 Canvas 명령에서 깔끔히 제외된다", () => {
    const { folds, guide } = buildFixtures();
    const bundle = exportGarmentFoldAndGuideOverlay({
      folds, guide, visibleLayers: { "hair-volume-silhouette": false, "tension-ridges": false },
    });
    expect(bundle.svg).not.toContain('data-layer="hair-volume-silhouette"');
    expect(bundle.svg).not.toContain('data-layer="tension-ridges"');
    expect(bundle.svg).toContain('data-layer="compression-creases"');
    expect(bundle.layerStats["hair-volume-silhouette"].visible).toBe(false);
    expect(bundle.canvasCommands.some((c) => c.layer === "hair-volume-silhouette")).toBe(false);
  });

  it("익스포트된 Ink DNA 선 굵기 위계(외곽 > 헤어 > 내부, 압축 > 장력)가 보존된다", () => {
    const folds = solvePoseToGarmentFolds({
      skeleton: createStandardPoseSkeleton3d({ leftElbow: { flexionDeg: 100 }, spineUpper: { twistDeg: 30 } }),
      fabricPreset: "cotton-shirt",
    });
    const guide = projectMultiviewTurnaroundGuide(buildCharacterMultiviewModel(createSampleCharacterSheet()), {
      yawDeg: -25, pitchDeg: 0, viewportWidth: 800, viewportHeight: 1000,
    });
    const bundle = exportGarmentFoldAndGuideOverlay({ folds, guide });

    expect(bundle.inkWidthHierarchy.outerContourPx).toBeGreaterThan(bundle.inkWidthHierarchy.hairVolumePx);
    expect(bundle.inkWidthHierarchy.hairVolumePx).toBeGreaterThan(bundle.inkWidthHierarchy.interiorDetailPx);
    expect(bundle.inkWidthHierarchy.compressionCreasePx).toBeGreaterThan(bundle.inkWidthHierarchy.tensionRidgePx);
  });

  it("가려진 카이랄성 랜드마크는 showOcclusionGhosts 설정에 따라 점선 고스트로 표시되거나 숨겨진다", () => {
    const { guide } = buildFixtures();
    const withGhosts = exportGarmentFoldAndGuideOverlay({ guide, showOcclusionGhosts: true });
    const withoutGhosts = exportGarmentFoldAndGuideOverlay({ guide, showOcclusionGhosts: false });
    expect(withGhosts.svg).toContain('data-occluded="true"');
    expect(withGhosts.svg).toContain('stroke-dasharray="3 3"');
    expect(withoutGhosts.svg).not.toContain('data-occluded="true"');
  });

  it("Canvas 드로우 명령은 beginLayer/endLayer 쌍이 일치하며 의상 단독 또는 두상 단독 익스포트를 지원한다", () => {
    const { folds, guide } = buildFixtures();
    const foldsOnly = exportGarmentFoldAndGuideOverlay({ folds });
    const guideOnly = exportGarmentFoldAndGuideOverlay({ guide });
    for (const bundle of [foldsOnly, guideOnly]) {
      const begins = bundle.canvasCommands.filter((c) => c.type === "beginLayer").length;
      const ends = bundle.canvasCommands.filter((c) => c.type === "endLayer").length;
      expect(begins).toBe(ends);
      expect(begins).toBe(5);
    }
    expect(foldsOnly.canvasCommands.some((c) => c.type === "cubicBezier")).toBe(true);
    expect(guideOnly.canvasCommands.some((c) => c.type === "polyline")).toBe(true);
    expect(guideOnly.canvasCommands.some((c) => c.type === "circleMarker")).toBe(true);
  });
});
