import { describe, expect, it } from "vitest";

import {
  createProportionCanonFromPreset,
  extractProportionCanonFromFrontSheet,
  multiplyMat4,
  PROPORTION_CANON_PRESETS,
  projectCharacterRigToCanvas,
  transformPointByMat4,
  validateArtistProportionDrift,
  verifyProportionCanonInvariants,
  type ArtistDrawingLandmarksInput,
  type CanvasViewportSize,
  type CutCameraParams,
  type ProjectedPerspectiveRigResult,
  type ProportionCanonPresetId,
} from "./index";

const STUDIO_VIEWPORT: CanvasViewportSize = { width: 1200, height: 1600 };

function makeCamera(overrides: Partial<CutCameraParams> = {}): CutCameraParams {
  return {
    fovDeg: 50,
    pitchDeg: 0,
    yawDeg: 0,
    rollDeg: 0,
    cameraDistanceM: 2.5,
    ...overrides,
  };
}

function makeExactDrawnFromRig(rig: ProjectedPerspectiveRigResult): ArtistDrawingLandmarksInput {
  return {
    crown: { ...rig.landmarkMap.crown.canvas },
    chin: { ...rig.landmarkMap.chin.canvas },
    shoulderLeft: { ...rig.landmarkMap.shoulderLeft.canvas },
    shoulderRight: { ...rig.landmarkMap.shoulderRight.canvas },
    pelvisLeft: { ...rig.landmarkMap.pelvisLeft.canvas },
    pelvisRight: { ...rig.landmarkMap.pelvisRight.canvas },
    kneeLeft: { ...rig.landmarkMap.kneeLeft.canvas },
    kneeRight: { ...rig.landmarkMap.kneeRight.canvas },
    ankleLeft: { ...rig.landmarkMap.ankleLeft.canvas },
    ankleRight: { ...rig.landmarkMap.ankleRight.canvas },
    footSole: { ...rig.landmarkMap.footSole.canvas },
  };
}

describe("wasm64-wave48-perspective-proportion-lock", () => {
  it("1. 4개 등신대 프리셋(6·7.5·8.5·3등신 SD)이 바닥 접지·좌우 대칭·1등신 턱 불변량을 모두 만족한다", () => {
    const presetIds: readonly ProportionCanonPresetId[] = [
      "daily-6-head",
      "rofan-modern-7.5-head",
      "action-8.5-head",
      "sd-3-head",
    ];
    for (const presetId of presetIds) {
      const canon = createProportionCanonFromPreset(presetId);
      const report = verifyProportionCanonInvariants(canon);
      expect(report.valid, `${presetId}: ${report.violations.join(", ")}`).toBe(true);
      expect(canon.headCount).toBe(PROPORTION_CANON_PRESETS[presetId].headCount);
      expect(canon.landmarkMap.footSole.positionMeters.y).toBe(0);
      expect(canon.landmarkMap.chin.headUnitsFromCrown).toBe(1.0);
      expect(canon.crossSectionRings).toHaveLength(4);
      expect(canon.toleranceTable.lowerBodyLength.warningPercent).toBeGreaterThan(0);
    }
  });

  it("2. 3등신 SD는 좁은 어깨·낮은 눈높이를, 8.5등신 액션은 넓은 어깨와 높은 등신 비율을 유지한다", () => {
    const sd = createProportionCanonFromPreset("sd-3-head");
    const action = createProportionCanonFromPreset("action-8.5-head");

    expect(sd.headCount).toBe(3.0);
    expect(sd.ratiosInHeadUnits.shoulderWidth).toBeLessThan(1.0);
    expect(sd.ratiosInHeadUnits.eyeFromCrown).toBeGreaterThan(0.55);

    expect(action.headCount).toBe(8.5);
    expect(action.ratiosInHeadUnits.shoulderWidth).toBeGreaterThan(2.0);
    expect(action.ratiosInHeadUnits.shoulderWidth).toBeGreaterThan(sd.ratiosInHeadUnits.shoulderWidth);
  });

  it("3. 단일 2D 정면 캐릭터 시트에서 headUnit 기준 3D 랜드마크 비율과 좌우 어깨·골반 폭을 정확히 추출한다", () => {
    const canon = extractProportionCanonFromFrontSheet({
      characterName: "은하수 주인공",
      crownY: 100,
      eyeY: 160,
      chinY: 220, // headUnit = 120px
      shoulderY: 262, // 1.35 head
      shoulderLeft: { x: 280, y: 262 },
      shoulderRight: { x: 520, y: 262 }, // width = 240px = 2.0 head
      chestY: 334, // 1.95 head
      waistY: 424, // 2.70 head
      pelvisY: 514, // 3.45 head
      pelvisLeft: { x: 316, y: 514 },
      pelvisRight: { x: 484, y: 514 }, // width = 168px = 1.4 head
      kneeY: 754, // 5.45 head
      ankleY: 964, // 7.20 head
      footSoleY: 1000, // 7.50 head
    });

    expect(canon.source).toBe("front-sheet");
    expect(canon.sheetHeadUnitPx).toBe(120);
    expect(canon.headCount).toBeCloseTo(7.5, 4);
    expect(canon.ratiosInHeadUnits.eyeFromCrown).toBeCloseTo(0.5, 4);
    expect(canon.ratiosInHeadUnits.shoulderWidth).toBeCloseTo(2.0, 4);
    expect(canon.ratiosInHeadUnits.pelvisWidth).toBeCloseTo(1.4, 4);
    expect(verifyProportionCanonInvariants(canon).valid).toBe(true);
  });

  it("4. 정면 시트에서 가슴·허리·무릎·발바닥을 생략해도 최근접 프리셋 사전값으로 불변량을 보완한다", () => {
    const canon = extractProportionCanonFromFrontSheet({
      crownY: 50,
      chinY: 150, // headUnit = 100px
      shoulderY: 182,
      pelvisY: 345,
      ankleY: 622,
    });

    expect(canon.presetId).toBe("daily-6-head");
    expect(canon.headCount).toBeCloseTo(6.0, 1);
    expect(verifyProportionCanonInvariants(canon).valid).toBe(true);
  });

  it("5. 정면 시트의 역전된 세로 좌표(chinY <= crownY)나 비단조 랜드마크 입력을 명시적으로 거부한다", () => {
    expect(() =>
      extractProportionCanonFromFrontSheet({
        crownY: 200,
        chinY: 180,
        shoulderY: 260,
        pelvisY: 500,
        ankleY: 850,
      }),
    ).toThrow(RangeError);

    expect(() =>
      extractProportionCanonFromFrontSheet({
        crownY: 100,
        chinY: 200,
        shoulderY: 260,
        pelvisY: 240, // 어깨보다 위에 있는 비정상 골반
        ankleY: 700,
      }),
    ).toThrow(RangeError);
  });

  it("6. 4×4 투영 행렬 곱셈(P * V)이 viewProjectionMatrix와 수치적으로 일치한다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const rig = projectCharacterRigToCanvas(
      canon,
      makeCamera({ pitchDeg: 25, yawDeg: -18, rollDeg: 7 }),
      STUDIO_VIEWPORT,
    );
    const recomputed = multiplyMat4(rig.projectionMatrix, rig.viewMatrix);
    for (let i = 0; i < 16; i += 1) {
      expect(rig.viewProjectionMatrix[i]).toBeCloseTo(recomputed[i] ?? 0, 8);
    }
    const crownClip = transformPointByMat4(
      rig.viewProjectionMatrix,
      canon.landmarkMap.crown.positionMeters,
    );
    expect(crownClip.w).toBeGreaterThan(0);
    expect(crownClip.x / crownClip.w).toBeCloseTo(rig.landmarkMap.crown.ndc.x, 4);
    expect(crownClip.y / crownClip.w).toBeCloseTo(rig.landmarkMap.crown.ndc.y, 4);
  });

  it("7. 정면 0° 카메라 투영은 좌우 X 대칭과 캐논 등신대 비율을 그대로 보존한다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const rig = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 0 }), STUDIO_VIEWPORT);

    expect(rig.metrics.angleClassification).toBe("eye-level");
    const leftX = rig.landmarkMap.shoulderLeft.canvas.x;
    const rightX = rig.landmarkMap.shoulderRight.canvas.x;
    expect((leftX + rightX) * 0.5).toBeCloseTo(STUDIO_VIEWPORT.width * 0.5, 1);
    expect(rig.metrics.apparentHeadCount).toBeGreaterThan(6.5);
    expect(rig.metrics.apparentHeadCount).toBeLessThan(8.2);
  });

  it("8. 정면 0° 대비 하이앵글 +45° 투영은 머리 비중을 확대하고 하체(다리) 비중을 단축한다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const front = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 0 }), STUDIO_VIEWPORT);
    const high = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 45 }), STUDIO_VIEWPORT);

    expect(high.metrics.angleClassification).toBe("high-angle");
    expect(high.metrics.headShareRatio).toBeGreaterThan(front.metrics.headShareRatio * 1.15);
    expect(high.metrics.lowerBodyShareRatio).toBeLessThan(front.metrics.lowerBodyShareRatio * 0.92);
    expect(high.metrics.headToLowerBodyRatio).toBeGreaterThan(
      front.metrics.headToLowerBodyRatio * 1.25,
    );
    expect(high.metrics.apparentHeadCount).toBeLessThan(front.metrics.apparentHeadCount);
    expect(high.landmarkMap.crown.cameraDepthM).toBeLessThan(high.landmarkMap.footSole.cameraDepthM);
  });

  it("9. 정면 0° 대비 로우앵글 -35° 투영은 하체 비중을 강조하고 머리 비중을 축소한다", () => {
    const canon = createProportionCanonFromPreset("action-8.5-head");
    const front = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 0 }), STUDIO_VIEWPORT);
    const low = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: -35 }), STUDIO_VIEWPORT);

    expect(low.metrics.angleClassification).toBe("low-angle");
    expect(low.metrics.lowerBodyShareRatio).toBeGreaterThan(front.metrics.lowerBodyShareRatio * 1.08);
    expect(low.metrics.headShareRatio).toBeLessThan(front.metrics.headShareRatio * 0.9);
    expect(low.metrics.apparentHeadCount).toBeGreaterThan(front.metrics.apparentHeadCount);
    expect(low.landmarkMap.footSole.cameraDepthM).toBeLessThan(low.landmarkMap.crown.cameraDepthM);
  });

  it("10. 단축 원근 타원(흉곽·골반 링)은 +45°에서 윗면, -35°에서 아랫면을 드러내며 타원 개방도가 커진다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const front = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 0 }), STUDIO_VIEWPORT);
    const high = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 45 }), STUDIO_VIEWPORT);
    const low = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: -35 }), STUDIO_VIEWPORT);

    expect(high.ellipseMap.ribcage.visibleFace).toBe("top");
    expect(high.ellipseMap.pelvis.visibleFace).toBe("top");
    expect(high.ellipseMap.ribcage.foreshorteningRatio).toBeGreaterThan(
      front.ellipseMap.ribcage.foreshorteningRatio + 0.15,
    );
    expect(high.ellipseMap.pelvis.foreshorteningRatio).toBeGreaterThan(
      front.ellipseMap.pelvis.foreshorteningRatio + 0.15,
    );

    expect(low.ellipseMap.ribcage.visibleFace).toBe("bottom");
    expect(low.ellipseMap.pelvis.visibleFace).toBe("bottom");
    expect(low.ellipseMap.ribcage.frontArcPoints.length).toBeGreaterThan(4);
    expect(low.ellipseMap.ribcage.backArcPoints.length).toBeGreaterThan(4);
  });

  it("11. 깊이 정렬(depthOrder)은 오름차순 깊이를 유지하며 하이앵글과 로우앵글에서 상하 순위가 정확히 반전된다", () => {
    const canon = createProportionCanonFromPreset("daily-6-head");
    const high = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 45 }), STUDIO_VIEWPORT);
    const low = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: -35 }), STUDIO_VIEWPORT);

    for (const rig of [high, low]) {
      for (let i = 1; i < rig.depthOrder.length; i += 1) {
        const prev = rig.depthOrder[i - 1];
        const curr = rig.depthOrder[i];
        expect(prev && curr && curr.cameraDepthM >= prev.cameraDepthM).toBe(true);
        expect(curr?.depthRank).toBe(i);
      }
    }

    expect(high.landmarkMap.crown.depthRank).toBeLessThan(high.landmarkMap.pelvisCenter.depthRank);
    expect(high.landmarkMap.pelvisCenter.depthRank).toBeLessThan(
      high.landmarkMap.footSole.depthRank,
    );

    expect(low.landmarkMap.footSole.depthRank).toBeLessThan(low.landmarkMap.pelvisCenter.depthRank);
    expect(low.landmarkMap.pelvisCenter.depthRank).toBeLessThan(low.landmarkMap.crown.depthRank);
  });

  it("12. 수평 회전(yawDeg = +35°) 시 카메라 쪽 어깨가 더 가까워지고 정면 대비 어깨 투영 폭이 줄어든다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const front = projectCharacterRigToCanvas(canon, makeCamera({ yawDeg: 0 }), STUDIO_VIEWPORT);
    const threeQuarter = projectCharacterRigToCanvas(
      canon,
      makeCamera({ yawDeg: 35 }),
      STUDIO_VIEWPORT,
    );

    expect(threeQuarter.landmarkMap.shoulderRight.cameraDepthM).toBeLessThan(
      threeQuarter.landmarkMap.shoulderLeft.cameraDepthM,
    );
    expect(threeQuarter.metrics.shoulderScreenWidthPx).toBeLessThan(
      front.metrics.shoulderScreenWidthPx,
    );
  });

  it("13. 더치 앵글(rollDeg = +20°) 적용 시 지평선과 단면 타원 축이 기울어진다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const level = projectCharacterRigToCanvas(canon, makeCamera({ rollDeg: 0 }), STUDIO_VIEWPORT);
    const dutch = projectCharacterRigToCanvas(
      canon,
      makeCamera({ pitchDeg: 15, rollDeg: 20 }),
      STUDIO_VIEWPORT,
    );

    expect(level.horizonLine.start.y).toBeCloseTo(level.horizonLine.end.y, 2);
    expect(dutch.horizonLine.end.y).toBeGreaterThan(dutch.horizonLine.start.y + 100);
    expect(Math.abs(dutch.ellipseMap.ribcage.tiltAngleDeg)).toBeGreaterThan(10);
  });

  it("14. 지평선 Y(horizonYNormalized) 지정 시 오프액시스 투영 행렬이 지평선을 요청 캔버스 높이에 고정한다", () => {
    const canon = createProportionCanonFromPreset("daily-6-head");
    const rig = projectCharacterRigToCanvas(
      canon,
      makeCamera({ pitchDeg: 30, horizonYNormalized: 0.2 }),
      STUDIO_VIEWPORT,
    );

    expect(rig.horizonLine.normalizedY).toBeCloseTo(0.2, 3);
    expect(rig.horizonLine.canvasY).toBeCloseTo(STUDIO_VIEWPORT.height * 0.2, 1);
    expect(rig.horizonLine.isWithinCanvas).toBe(true);
    expect(Math.abs(rig.horizonLine.principalShiftY)).toBeGreaterThan(0.1);
  });

  it("15. 광각(75° 근접)은 망원(28° 원거리)보다 하이앵글 머리 확대·다리 단축 대비를 훨씬 강하게 만든다", () => {
    const canon = createProportionCanonFromPreset("action-8.5-head");
    const telephoto = projectCharacterRigToCanvas(
      canon,
      makeCamera({ fovDeg: 28, pitchDeg: 40, cameraDistanceM: 4.5 }),
      STUDIO_VIEWPORT,
    );
    const wide = projectCharacterRigToCanvas(
      canon,
      makeCamera({ fovDeg: 75, pitchDeg: 40, cameraDistanceM: 1.6 }),
      STUDIO_VIEWPORT,
    );

    expect(wide.metrics.headToLowerBodyRatio).toBeGreaterThan(
      telephoto.metrics.headToLowerBodyRatio * 1.25,
    );
  });

  it("16. 허용 범위를 벗어난 카메라 FOV·피치·거리 또는 0 크기 뷰포트를 거부한다", () => {
    const canon = createProportionCanonFromPreset("daily-6-head");
    expect(() =>
      projectCharacterRigToCanvas(canon, makeCamera({ fovDeg: 140 }), STUDIO_VIEWPORT),
    ).toThrow(RangeError);
    expect(() =>
      projectCharacterRigToCanvas(canon, makeCamera({ cameraDistanceM: 0.2 }), STUDIO_VIEWPORT),
    ).toThrow(RangeError);
    expect(() =>
      projectCharacterRigToCanvas(canon, makeCamera(), { width: 0, height: 1200 }),
    ).toThrow(RangeError);
  });

  it("17. 투영 가이드와 일치하는 2D 선화는 왜곡률 0%, 100점, 보정 화살표 0건으로 통과한다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const rig = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 45 }), STUDIO_VIEWPORT);
    const drawn = makeExactDrawnFromRig(rig);

    const report = validateArtistProportionDrift(canon, rig, drawn);
    expect(report.overallStatus).toBe("ok");
    expect(report.proportionScore).toBe(100);
    expect(report.correctionArrows).toHaveLength(0);
    for (const diag of report.regionDiagnoses) {
      expect(diag.driftPercent).toBe(0);
      expect(diag.severity).toBe("ok");
    }
  });

  it("18. 하이앵글 +45°에서 다리를 단축하지 않고 길게 그리면 하체 과대 왜곡(%)과 위쪽 보정 화살표를 정확히 제시한다", () => {
    const canon = createProportionCanonFromPreset("rofan-modern-7.5-head");
    const rig = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 45 }), STUDIO_VIEWPORT);
    const drawn = makeExactDrawnFromRig(rig);
    const distorted: ArtistDrawingLandmarksInput = {
      ...drawn,
      footSole: { x: drawn.footSole.x, y: drawn.footSole.y + 95 },
    };

    const report = validateArtistProportionDrift(canon, rig, distorted);
    expect(report.overallStatus).toBe("critical");
    expect(report.diagnosisMap.lowerBodyLength.direction).toBe("oversized");
    expect(report.diagnosisMap.lowerBodyLength.driftPercent).toBeGreaterThan(20);
    expect(report.diagnosisMap.lowerBodyLength.messageKo).toContain("하이앵글");

    const footArrow = report.correctionArrows.find((item) => item.landmarkId === "footSole");
    expect(footArrow).toBeDefined();
    expect(footArrow?.delta.y).toBeCloseTo(-95, 1);
    expect(footArrow?.normalizedDirection.y).toBeLessThan(-0.98);
    expect(footArrow?.instructionKo).toContain("위쪽");
  });

  it("19. 로우앵글 -35°에서 머리를 과대하게 키우고 어깨를 과도하게 벌리면 안쪽·아래쪽 보정 벡터를 생성한다", () => {
    const canon = createProportionCanonFromPreset("action-8.5-head");
    const rig = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: -35 }), STUDIO_VIEWPORT);
    const drawn = makeExactDrawnFromRig(rig);
    const distorted: ArtistDrawingLandmarksInput = {
      ...drawn,
      crown: { x: drawn.crown.x, y: drawn.crown.y - 36 },
      shoulderLeft: { x: drawn.shoulderLeft.x - 42, y: drawn.shoulderLeft.y },
      shoulderRight: { x: drawn.shoulderRight.x + 42, y: drawn.shoulderRight.y },
    };

    const report = validateArtistProportionDrift(canon, rig, distorted);
    expect(report.overallStatus).toBe("critical");
    expect(report.diagnosisMap.headHeight.direction).toBe("oversized");
    expect(report.diagnosisMap.shoulderWidth.direction).toBe("oversized");

    const crownArrow = report.correctionArrows.find((item) => item.landmarkId === "crown");
    const leftShoulderArrow = report.correctionArrows.find(
      (item) => item.landmarkId === "shoulderLeft",
    );
    const rightShoulderArrow = report.correctionArrows.find(
      (item) => item.landmarkId === "shoulderRight",
    );

    expect(crownArrow?.delta.y).toBeCloseTo(36, 1); // 아래로 축소
    expect(leftShoulderArrow?.delta.x).toBeCloseTo(42, 1); // 오른쪽(안쪽)으로 축소
    expect(rightShoulderArrow?.delta.x).toBeCloseTo(-42, 1); // 왼쪽(안쪽)으로 축소
  });

  it("20. fit-total-height 정렬 모드는 전체 위치·배율 차이를 보정한 뒤 국소 머리 비율 왜곡만 정확히 잡아낸다", () => {
    const canon = createProportionCanonFromPreset("daily-6-head");
    const rig = projectCharacterRigToCanvas(canon, makeCamera({ pitchDeg: 35 }), STUDIO_VIEWPORT);
    const base = makeExactDrawnFromRig(rig);

    const scalePoint = (pt: { readonly x: number; readonly y: number }) => ({
      x: pt.x * 0.8 + 140,
      y: pt.y * 0.8 - 60,
    });
    const uniformlyMoved: ArtistDrawingLandmarksInput = {
      crown: scalePoint(base.crown),
      chin: scalePoint(base.chin),
      shoulderLeft: scalePoint(base.shoulderLeft),
      shoulderRight: scalePoint(base.shoulderRight),
      pelvisLeft: scalePoint(base.pelvisLeft),
      pelvisRight: scalePoint(base.pelvisRight),
      footSole: scalePoint(base.footSole),
    };

    const alignedReport = validateArtistProportionDrift(canon, rig, uniformlyMoved, {
      alignmentMode: "fit-total-height",
    });
    expect(alignedReport.overallStatus).toBe("ok");
    expect(alignedReport.proportionScore).toBe(100);
    expect(alignedReport.alignmentTransform.scale).toBeCloseTo(0.8, 3);

    const headHeightPx = uniformlyMoved.chin.y - uniformlyMoved.crown.y;
    const headOversized: ArtistDrawingLandmarksInput = {
      ...uniformlyMoved,
      chin: { x: uniformlyMoved.chin.x, y: uniformlyMoved.chin.y + headHeightPx * 0.3 },
    };
    const driftReport = validateArtistProportionDrift(canon, rig, headOversized, {
      alignmentMode: "fit-total-height",
    });
    expect(driftReport.diagnosisMap.headHeight.direction).toBe("oversized");
    expect(driftReport.diagnosisMap.headHeight.driftPercent).toBeCloseTo(30, 0);
    expect(driftReport.overallStatus).toBe("critical");
  });
});
