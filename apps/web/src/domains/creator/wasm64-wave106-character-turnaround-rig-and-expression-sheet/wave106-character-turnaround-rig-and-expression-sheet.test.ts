import { describe, expect, it } from "vitest";
import {
  ALL_EXPRESSION_PRESET_IDS,
  auditDrawnPanelFaceAgainstCanon,
  buildFiveAngleTurnaroundSheet,
  CANONICAL_FIVE_TURNAROUND_ANGLES_DEG,
  computeCanonSheetFingerprints,
  computeFipsSha256Hex,
  computeFnv1a32Hex,
  createDefaultCharacterHeadCanonSheet,
  escapeTurnaroundSvgXml,
  EXPRESSION_PRESET_TABLE,
  normalizeYawDeg,
  projectCharacterHeadAtView,
  renderCharacterTurnaroundSheetSvg,
  rotateHeadLocalToCamera,
  summarizeCharacterTurnaroundAuditKo,
  type AsymmetricFacialLandmark,
  type CharacterHeadCanonSheet,
} from "./index";

describe("Wave 106 — 3D 루미스 두상 턴어라운드 리깅·좌우 잠금 & 작붕 감사 엔진", () => {
  const defaultCanon = createDefaultCharacterHeadCanonSheet();

  describe("1. 해부학적 좌우(Chirality) 불변식 및 360° 백페이스 가림", () => {
    it("정면(yaw = 0°)에서 해부학적 왼쪽 특징점은 화면 오른쪽(x > 0), 해부학적 오른쪽 특징점은 화면 왼쪽(x < 0)에 투영된다", () => {
      const front = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      const leftScar = front.asymmetricLandmarks.find((l) => l.landmarkId === "left-cheek-scar");
      const rightMole = front.asymmetricLandmarks.find((l) => l.landmarkId === "right-under-eye-mole");

      expect(leftScar).toBeDefined();
      expect(rightMole).toBeDefined();
      expect(leftScar?.visible).toBe(true);
      expect(leftScar?.position2D.x).toBeGreaterThan(front.originPx.x);
      expect(leftScar?.expectedScreenSide).toBe("screen-right");

      expect(rightMole?.visible).toBe(true);
      expect(rightMole?.position2D.x).toBeLessThan(front.originPx.x);
      expect(rightMole?.expectedScreenSide).toBe("screen-left");
    });

    it("해부학적 왼쪽 뺨 흉터는 정면(0°)과 좌 3/4(-45°, 왼쪽 뺨 노출)에서 보이고, 우측면(+90°)과 후면(180°)에서 완전히 가려진다", () => {
      const view0 = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      const viewNeg45 = projectCharacterHeadAtView(defaultCanon, { yawDeg: -45, pitchDeg: 0 });
      const viewNeg90 = projectCharacterHeadAtView(defaultCanon, { yawDeg: -90, pitchDeg: 0 });
      const viewPos90 = projectCharacterHeadAtView(defaultCanon, { yawDeg: 90, pitchDeg: 0 });
      const view180 = projectCharacterHeadAtView(defaultCanon, { yawDeg: 180, pitchDeg: 0 });

      const getScar = (view: ReturnType<typeof projectCharacterHeadAtView>) =>
        view.asymmetricLandmarks.find((l) => l.landmarkId === "left-cheek-scar");

      expect(getScar(view0)?.visible).toBe(true);
      expect(getScar(viewNeg45)?.visible).toBe(true);
      expect(getScar(viewNeg45)?.normalDotView).toBeGreaterThan(0.9);
      expect(getScar(viewNeg90)?.visible).toBe(true);

      expect(getScar(viewPos90)?.visible).toBe(false);
      expect(getScar(viewPos90)?.normalDotView).toBeLessThan(0);
      expect(getScar(view180)?.visible).toBe(false);
      expect(getScar(view180)?.normalDotView).toBeLessThan(0);
    });

    it("해부학적 오른쪽 눈밑 점은 정면(0°)과 우 3/4(+45°)에서 보이고, 좌측면(-90°)과 후면(180°)에서 가려진다", () => {
      const view0 = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      const viewPos45 = projectCharacterHeadAtView(defaultCanon, { yawDeg: 45, pitchDeg: 0 });
      const viewNeg90 = projectCharacterHeadAtView(defaultCanon, { yawDeg: -90, pitchDeg: 0 });
      const view180 = projectCharacterHeadAtView(defaultCanon, { yawDeg: 180, pitchDeg: 0 });

      const getMole = (view: ReturnType<typeof projectCharacterHeadAtView>) =>
        view.asymmetricLandmarks.find((l) => l.landmarkId === "right-under-eye-mole");

      expect(getMole(view0)?.visible).toBe(true);
      expect(getMole(viewPos45)?.visible).toBe(true);
      expect(getMole(viewNeg90)?.visible).toBe(false);
      expect(getMole(view180)?.visible).toBe(false);
    });

    it("비대칭 귀걸이(surfaceAngleDeg=90°)는 정면(0°)과 해당 측면에서 노출되고 반대편 측면에서 가려진다", () => {
      const earringLandmark: AsymmetricFacialLandmark = {
        landmarkId: "left-ear-pendant",
        kind: "earring",
        labelKo: "왼쪽 은귀걸이",
        anatomicalSide: "anatomical-left",
        surfaceAngleDeg: 90,
        elevationNorm: 0.67,
      };
      const canon = createDefaultCharacterHeadCanonSheet({
        asymmetricLandmarks: [earringLandmark],
      });

      const front = projectCharacterHeadAtView(canon, { yawDeg: 0, pitchDeg: 0 });
      const leftProf = projectCharacterHeadAtView(canon, { yawDeg: -90, pitchDeg: 0 });
      const rightProf = projectCharacterHeadAtView(canon, { yawDeg: 90, pitchDeg: 0 });

      expect(front.asymmetricLandmarks[0]?.visible).toBe(true);
      expect(front.asymmetricLandmarks[0]?.expectedScreenSide).toBe("screen-right");
      expect(leftProf.asymmetricLandmarks[0]?.visible).toBe(true);
      expect(rightProf.asymmetricLandmarks[0]?.visible).toBe(false);
    });

    it("후면(180°)에서는 귀의 화면 좌우가 정면(0°)과 정확히 반전된다(해부학적 왼쪽 귀가 화면 왼쪽)", () => {
      const front = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      const back = projectCharacterHeadAtView(defaultCanon, { yawDeg: 180, pitchDeg: 0 });

      expect(front.facialFeatures.leftEar.screenSide).toBe("screen-right");
      expect(front.facialFeatures.rightEar.screenSide).toBe("screen-left");
      expect(back.facialFeatures.leftEar.screenSide).toBe("screen-left");
      expect(back.facialFeatures.rightEar.screenSide).toBe("screen-right");
    });

    it("안대(eyepatch)와 가르마(hair-part)도 3D 회전 중 반대쪽 뺨으로 절대 뒤집히지 않는다", () => {
      const canon = createDefaultCharacterHeadCanonSheet({
        asymmetricLandmarks: [
          {
            landmarkId: "right-eyepatch",
            kind: "eyepatch",
            labelKo: "오른쪽 안대",
            anatomicalSide: "anatomical-right",
            surfaceAngleDeg: 24,
            elevationNorm: 0.48,
          },
          {
            landmarkId: "left-hair-part",
            kind: "hair-part",
            labelKo: "왼쪽 가르마",
            anatomicalSide: "anatomical-left",
            surfaceAngleDeg: 32,
            elevationNorm: 0.16,
          },
        ],
      });

      for (const yawDeg of [-30, -15, 0, 15, 30]) {
        const view = projectCharacterHeadAtView(canon, { yawDeg, pitchDeg: 0 });
        const patch = view.asymmetricLandmarks.find((l) => l.landmarkId === "right-eyepatch");
        const part = view.asymmetricLandmarks.find((l) => l.landmarkId === "left-hair-part");
        expect(patch?.visible).toBe(true);
        expect(patch?.expectedScreenSide).toBe("screen-left");
        expect(part?.visible).toBe(true);
        expect(part?.expectedScreenSide).toBe("screen-right");
      }
    });

    it("요(yaw) 정규화가 360° 주기(-540°, +540°, +360°, NaN)를 안전하게 처리한다", () => {
      expect(normalizeYawDeg(360)).toBe(0);
      expect(normalizeYawDeg(-360)).toBe(0);
      expect(normalizeYawDeg(270)).toBe(-90);
      expect(normalizeYawDeg(-270)).toBe(90);
      expect(normalizeYawDeg(180)).toBe(180);
      expect(normalizeYawDeg(Number.NaN)).toBe(0);
    });

    it("3D 회전 행렬은 직교 변환으로 벡터 길이를 보존하고 pitch=0에서 Y좌표를 엄밀히 유지한다", () => {
      const v = { x: 0.31, y: -0.17, z: 0.42 };
      const origLen = Math.hypot(v.x, v.y, v.z);
      for (const yaw of [-180, -90, -45, 0, 45, 90, 135]) {
        const rotatedFlat = rotateHeadLocalToCamera(v, yaw, 0);
        expect(Math.abs(rotatedFlat.y - v.y)).toBeLessThan(1e-12);
        expect(Math.abs(Math.hypot(rotatedFlat.x, rotatedFlat.y, rotatedFlat.z) - origLen)).toBeLessThan(1e-12);

        const rotatedPitched = rotateHeadLocalToCamera(v, yaw, 28);
        expect(Math.abs(Math.hypot(rotatedPitched.x, rotatedPitched.y, rotatedPitched.z) - origLen)).toBeLessThan(
          1e-12,
        );
      }
    });
  });

  describe("2. 5각 수평 턴어라운드 정렬 및 피치(Pitch) 단축 원근", () => {
    it("5각 턴어라운드 시트는 [-90, -45, 0, +45, +180] 각도를 생성하고 정수리·눈썹·눈·코·턱 수직 오차가 < 1e-4 px이다", () => {
      const sheet = buildFiveAngleTurnaroundSheet(defaultCanon, "neutral");
      expect(sheet.panels.map((p) => p.yawDeg)).toEqual(CANONICAL_FIVE_TURNAROUND_ANGLES_DEG);
      expect(sheet.railAlignmentAudit.withinTolerance).toBe(true);
      expect(sheet.railAlignmentAudit.maxVerticalDriftPx).toBeLessThan(1e-4);
      expect(sheet.railAlignmentAudit.crownDriftPx).toBeLessThan(1e-4);
      expect(sheet.railAlignmentAudit.eyeDriftPx).toBeLessThan(1e-4);
      expect(sheet.railAlignmentAudit.chinDriftPx).toBeLessThan(1e-4);
    });

    it("정면(0°, pitch=0°) 투영 두상 가로/세로 비율·눈 간격·하악 비율이 캐논 설정값과 일치한다", () => {
      const front = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      expect(Math.abs(front.cranialBounds.widthToHeightRatio - defaultCanon.headWidthToHeightRatio)).toBeLessThan(
        1e-6,
      );
      expect(
        Math.abs(front.facialFeatures.effectiveEyeSpacingRatio - defaultCanon.eyeSpacingInEyeWidths),
      ).toBeLessThan(1e-6);
      expect(Math.abs(front.facialFeatures.effectiveJawToHeadRatio - defaultCanon.jawHeightRatio)).toBeLessThan(1e-6);
      expect(
        Math.abs(front.facialFeatures.effectiveEyeLineVerticalRatio - defaultCanon.eyeLineVerticalRatio),
      ).toBeLessThan(1e-6);
    });

    it("고개를 숙이면(pitch > 0) 눈선이 정수리 대비 아래로 하강하고, 고개를 들면(pitch < 0) 턱 대비 위로 상승한다", () => {
      const neutral = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      const lookDown = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 28 });
      const lookUp = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: -28 });

      const neutralCrownToEye = neutral.canonGuideRails.eyeY - neutral.canonGuideRails.crownY;
      const downCrownToEye = lookDown.canonGuideRails.eyeY - lookDown.canonGuideRails.crownY;
      const upCrownToEye = lookUp.canonGuideRails.eyeY - lookUp.canonGuideRails.crownY;

      expect(downCrownToEye).toBeGreaterThan(neutralCrownToEye + 20);
      expect(lookDown.facialFeatures.effectiveEyeLineVerticalRatio).toBeGreaterThan(
        neutral.facialFeatures.effectiveEyeLineVerticalRatio + 0.08,
      );

      const neutralEyeToChinRatio =
        (neutral.canonGuideRails.chinY - neutral.canonGuideRails.eyeY) /
        (neutral.canonGuideRails.chinY - neutral.canonGuideRails.crownY);
      const upEyeToChinRatio =
        (lookUp.canonGuideRails.chinY - lookUp.canonGuideRails.eyeY) /
        (lookUp.canonGuideRails.chinY - lookUp.canonGuideRails.crownY);

      expect(upCrownToEye).toBeLessThan(neutralCrownToEye - 20);
      expect(upEyeToChinRatio).toBeGreaterThan(neutralEyeToChinRatio + 0.08);
    });

    it("측면(±90°) 투영에서는 정면(0°) 대비 코 돌출(profileProtrusionPx)이 뚜렷하게 나타난다", () => {
      const front = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      const leftProfile = projectCharacterHeadAtView(defaultCanon, { yawDeg: -90, pitchDeg: 0 });
      const rightProfile = projectCharacterHeadAtView(defaultCanon, { yawDeg: 90, pitchDeg: 0 });

      expect(front.facialFeatures.nose.profileProtrusionPx).toBeLessThan(1e-6);
      expect(leftProfile.facialFeatures.nose.profileProtrusionPx).toBeGreaterThan(10);
      expect(rightProfile.facialFeatures.nose.profileProtrusionPx).toBeGreaterThan(10);
      expect(leftProfile.facialFeatures.nose.tip2D.x).toBeLessThan(leftProfile.facialFeatures.nose.base2D.x);
      expect(rightProfile.facialFeatures.nose.tip2D.x).toBeGreaterThan(rightProfile.facialFeatures.nose.base2D.x);
    });

    it("귀 상하 범위는 루미스 눈썹-코밑 기준을 반영한다", () => {
      const front = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 });
      expect(Math.abs(front.facialFeatures.leftEar.top2D.y - front.canonGuideRails.browY)).toBeLessThan(1e-3);
      expect(Math.abs(front.facialFeatures.leftEar.bottom2D.y - front.canonGuideRails.noseY)).toBeLessThan(1e-3);
    });

    it("머리카락 볼륨 스케일(hairVolumeCrownScale)이 클수록 헤어 정수리선이 두개골 정수리 위로 확장된다", () => {
      const flatHair = projectCharacterHeadAtView(
        createDefaultCharacterHeadCanonSheet({ hairVolumeCrownScale: 1.0 }),
        { yawDeg: 0, pitchDeg: 0 },
      );
      const voluminousHair = projectCharacterHeadAtView(
        createDefaultCharacterHeadCanonSheet({ hairVolumeCrownScale: 1.32 }),
        { yawDeg: 0, pitchDeg: 0 },
      );

      expect(Math.abs(flatHair.canonGuideRails.hairCrownY - flatHair.canonGuideRails.crownY)).toBeLessThan(1e-6);
      expect(voluminousHair.canonGuideRails.hairCrownY).toBeLessThan(voluminousHair.canonGuideRails.crownY - 10);
      // 두개골 외곽 경계는 헤어 볼륨 변화에도 불변
      expect(Math.abs(voluminousHair.cranialBounds.heightPx - flatHair.cranialBounds.heightPx)).toBeLessThan(1e-6);
    });
  });

  describe("3. 7종 표정 프리셋 불변성 및 고유 시그니처", () => {
    it("7종 표정 프리셋이 모두 등록되어 있으며 두개골 외곽 비율(cranialBounds)을 100% 보존한다", () => {
      expect(ALL_EXPRESSION_PRESET_IDS).toHaveLength(7);
      const neutralView = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "neutral");

      for (const presetId of ALL_EXPRESSION_PRESET_IDS) {
        const view = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, presetId);
        expect(Math.abs(view.cranialBounds.widthPx - neutralView.cranialBounds.widthPx)).toBeLessThan(1e-6);
        expect(Math.abs(view.cranialBounds.heightPx - neutralView.cranialBounds.heightPx)).toBeLessThan(1e-6);
        expect(
          Math.abs(view.cranialBounds.widthToHeightRatio - neutralView.cranialBounds.widthToHeightRatio),
        ).toBeLessThan(1e-6);
        expect(Math.abs(view.canonGuideRails.eyeY - neutralView.canonGuideRails.eyeY)).toBeLessThan(1e-6);
      }
    });

    it("7종 표정 프리셋은 각각 고유한 눈 개방도·눈썹 기울기·입 곡률/개방도/비대칭 시그니처를 갖는다", () => {
      const signatures = new Set<string>();
      for (const presetId of ALL_EXPRESSION_PRESET_IDS) {
        const view = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, presetId);
        const sig = [
          view.facialFeatures.leftEye.apertureHeightPx.toFixed(2),
          view.facialFeatures.rightEye.apertureHeightPx.toFixed(2),
          view.facialFeatures.leftBrow.slantDeg.toFixed(1),
          view.facialFeatures.rightBrow.slantDeg.toFixed(1),
          view.facialFeatures.mouth.curvature.toFixed(2),
          view.facialFeatures.mouth.openness.toFixed(2),
          view.facialFeatures.mouth.skew.toFixed(2),
        ].join("|");
        signatures.add(sig);
      }
      expect(signatures.size).toBe(7);
    });

    it("shock-wide는 최대 눈 개방도·축소 동공을, exhausted-sigh는 최소 눈 개방도를, smirk-confident는 비대칭 눈·눈썹·입꼬리를 생성한다", () => {
      const neutral = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "neutral");
      const shock = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "shock-wide");
      const anger = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "anger-glare");
      const joy = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "joy-grin");
      const smirk = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "smirk-confident");
      const exhausted = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "exhausted-sigh");

      expect(shock.facialFeatures.leftEye.apertureHeightPx).toBeGreaterThan(
        neutral.facialFeatures.leftEye.apertureHeightPx * 1.3,
      );
      expect(shock.facialFeatures.leftEye.pupilRadiusPx).toBeLessThan(
        neutral.facialFeatures.leftEye.pupilRadiusPx * 0.7,
      );
      expect(exhausted.facialFeatures.leftEye.apertureHeightPx).toBeLessThan(
        neutral.facialFeatures.leftEye.apertureHeightPx * 0.5,
      );
      expect(anger.facialFeatures.leftBrow.slantDeg).toBeLessThan(-15);
      expect(joy.facialFeatures.mouth.curvature).toBeGreaterThan(0.8);
      expect(smirk.facialFeatures.leftEye.apertureHeightPx).not.toBeCloseTo(
        smirk.facialFeatures.rightEye.apertureHeightPx,
        2,
      );
      expect(smirk.facialFeatures.mouth.skew).toBeGreaterThan(0.5);
      expect(EXPRESSION_PRESET_TABLE["anger-glare"].comicMarkers).toContain("anger-vein");
    });

    it("후면(180°) 시점에서는 안면 만화 표정 기호가 백페이스 컬링되어 숨겨진다", () => {
      const frontShock = projectCharacterHeadAtView(defaultCanon, { yawDeg: 0, pitchDeg: 0 }, "shock-wide");
      const backShock = projectCharacterHeadAtView(defaultCanon, { yawDeg: 180, pitchDeg: 0 }, "shock-wide");

      expect(frontShock.activeComicMarkers.some((m) => m.visible)).toBe(true);
      expect(backShock.activeComicMarkers.every((m) => !m.visible)).toBe(true);
    });
  });

  describe("4. 작붕 감사 엔진 (Off-Model Drift Auditor)", () => {
    it("기준 캐논과 일치하는 정상 정면 패널은 95점 이상(100점)으로 'on-model' 통과한다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP14-P08",
        episodeLabel: "14화",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedEyeSpacingRatio: 1.0,
        observedJawToHeadRatio: 0.32,
        observedHeadWidthToHeightRatio: 0.76,
        observedEyeLineVerticalRatio: 0.48,
        observedLandmarks: [
          { landmarkId: "left-cheek-scar", observedScreenSide: "screen-right" },
          { landmarkId: "right-under-eye-mole", observedScreenSide: "screen-left" },
        ],
      });

      expect(report.passStatus).toBe("on-model");
      expect(report.blockerCount).toBe(0);
      expect(report.warningCount).toBe(0);
      expect(report.onModelConsistencyScore).toBeGreaterThanOrEqual(95);
      expect(report.onModelConsistencyScore).toBe(100);
    });

    it("캔버스 좌우 반전으로 왼쪽 뺨 흉터가 화면 왼쪽에 그려진 경우 'mirrored-asymmetric-landmark' blocker로 즉시 차단한다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP14-P19",
        episodeLabel: "14화",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedEyeSpacingRatio: 1.02,
        observedJawToHeadRatio: 0.32,
        observedLandmarks: [
          { landmarkId: "left-cheek-scar", observedScreenSide: "screen-left" },
          { landmarkId: "right-under-eye-mole", observedScreenSide: "screen-left" },
        ],
      });

      expect(report.passStatus).toBe("blocked");
      expect(report.blockerCount).toBe(1);
      const mirrorFinding = report.findings.find((f) => f.code === "mirrored-asymmetric-landmark");
      expect(mirrorFinding).toBeDefined();
      expect(mirrorFinding?.severity).toBe("blocker");
      expect(mirrorFinding?.landmarkId).toBe("left-cheek-scar");
      expect(report.onModelConsistencyScore).toBeLessThan(70);
    });

    it("좌 3/4(-45°) 각도에서도 흉터가 코 기준 반대편으로 뒤집히면 'mirrored-asymmetric-landmark' blocker를 검출한다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP15-P03",
        estimatedYawDeg: -45,
        estimatedPitchDeg: 0,
        observedLandmarks: [{ landmarkId: "left-cheek-scar", observedScreenSide: "screen-left" }],
      });

      expect(report.passStatus).toBe("blocked");
      expect(report.findings.some((f) => f.code === "mirrored-asymmetric-landmark" && f.severity === "blocker")).toBe(
        true,
      );
    });

    it("우측면(+90°)에서 반대편으로 가려져야 할 왼쪽 뺨 흉터를 그린 경우 'impossible-occluded-landmark' warning을 발생시킨다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP15-P11",
        estimatedYawDeg: 90,
        estimatedPitchDeg: 0,
        observedLandmarks: [{ landmarkId: "left-cheek-scar", observedScreenSide: "screen-right" }],
      });

      expect(report.passStatus).toBe("needs-revision");
      expect(report.blockerCount).toBe(0);
      expect(report.warningCount).toBe(1);
      const occludedFinding = report.findings.find((f) => f.code === "impossible-occluded-landmark");
      expect(occludedFinding).toBeDefined();
      expect(occludedFinding?.severity).toBe("warning");
      expect(occludedFinding?.landmarkId).toBe("left-cheek-scar");
    });

    it("후면(180°)에서 안면 특징점이 그려진 경우도 'impossible-occluded-landmark'로 검출한다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP15-P22",
        estimatedYawDeg: 180,
        estimatedPitchDeg: 0,
        observedLandmarks: [{ landmarkId: "right-under-eye-mole", observedScreenSide: "screen-left" }],
      });

      expect(report.findings.some((f) => f.code === "impossible-occluded-landmark")).toBe(true);
    });

    it("눈 사이 간격이 허용 오차(±0.18)를 넘으면 'eye-spacing-drift'를 검출한다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP16-P04",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedEyeSpacingRatio: 1.34,
        observedLandmarks: [
          { landmarkId: "left-cheek-scar", observedScreenSide: "screen-right" },
          { landmarkId: "right-under-eye-mole", observedScreenSide: "screen-left" },
        ],
      });

      expect(report.findings.some((f) => f.code === "eye-spacing-drift")).toBe(true);
      expect(report.passStatus).not.toBe("on-model");
      expect(report.onModelConsistencyScore).toBeLessThan(90);
    });

    it("하악 비율·두상 가로세로 비율 이탈 시 'craniofacial-proportion-drift'를 검출한다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP16-P09",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedJawToHeadRatio: 0.44,
        observedHeadWidthToHeightRatio: 0.94,
        observedLandmarks: [],
      });

      const proportionFindings = report.findings.filter((f) => f.code === "craniofacial-proportion-drift");
      expect(proportionFindings).toHaveLength(2);
      expect(proportionFindings.map((f) => f.metricName)).toEqual(["jawToHeadRatio", "headWidthToHeightRatio"]);
    });

    it("flagMissingVisibleLandmarks=true이면 정면에서 누락된 필수 특징점을 'missing-visible-landmark'로 잡는다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP17-P02",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedLandmarks: [{ landmarkId: "right-under-eye-mole", observedScreenSide: "screen-left" }],
        flagMissingVisibleLandmarks: true,
      });

      expect(
        report.findings.some((f) => f.code === "missing-visible-landmark" && f.landmarkId === "left-cheek-scar"),
      ).toBe(true);
    });

    it("등록되지 않은 미지 특징점이 관측되면 'unknown-asymmetric-landmark' 경고를 기록한다", () => {
      const report = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP17-P05",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedLandmarks: [{ landmarkId: "unregistered-forehead-tattoo", observedScreenSide: "screen-left" }],
      });

      expect(report.findings.some((f) => f.code === "unknown-asymmetric-landmark")).toBe(true);
    });
  });

  describe("5. 결정론적 FIPS 180-4 SHA-256 / FNV-1a 캐논 지문", () => {
    it("표준 NIST 테스트 벡터('abc')에 대해 정확한 FIPS 180-4 SHA-256과 FNV-1a 해시를 계산한다", () => {
      expect(computeFipsSha256Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(computeFipsSha256Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(computeFnv1a32Hex("abc")).toBe("1a47e90b");
    });

    it("캐논 시트 키 삽입 순서가 달라도 동일한 SHA-256 및 FNV-1a 지문을 산출하고, 흉터 측면 변경 시 지문이 바뀐다", () => {
      const reorderedCanon: CharacterHeadCanonSheet = {
        asymmetricLandmarks: defaultCanon.asymmetricLandmarks,
        hairVolumeCrownScale: defaultCanon.hairVolumeCrownScale,
        earSpanStartToEnd: {
          bottomRatioFromCrown: defaultCanon.earSpanStartToEnd.bottomRatioFromCrown,
          topRatioFromCrown: defaultCanon.earSpanStartToEnd.topRatioFromCrown,
        },
        jawHeightRatio: defaultCanon.jawHeightRatio,
        chinTaperSharpness: defaultCanon.chinTaperSharpness,
        noseLengthRatio: defaultCanon.noseLengthRatio,
        eyeSpacingInEyeWidths: defaultCanon.eyeSpacingInEyeWidths,
        eyeLineVerticalRatio: defaultCanon.eyeLineVerticalRatio,
        headWidthToHeightRatio: defaultCanon.headWidthToHeightRatio,
        styleArchetype: defaultCanon.styleArchetype,
        sheetVersion: defaultCanon.sheetVersion,
        characterName: defaultCanon.characterName,
        characterId: defaultCanon.characterId,
      };

      const fpA = computeCanonSheetFingerprints(defaultCanon);
      const fpB = computeCanonSheetFingerprints(reorderedCanon);
      expect(fpA.sha256Hex).toBe(fpB.sha256Hex);
      expect(fpA.fnv1aHex).toBe(fpB.fnv1aHex);

      const flippedScarCanon = createDefaultCharacterHeadCanonSheet({
        asymmetricLandmarks: [
          { ...defaultCanon.asymmetricLandmarks[0], anatomicalSide: "anatomical-right" },
          defaultCanon.asymmetricLandmarks[1],
        ],
      });
      const fpFlipped = computeCanonSheetFingerprints(flippedScarCanon);
      expect(fpFlipped.sha256Hex).not.toBe(fpA.sha256Hex);
    });
  });

  describe("6. 인쇄 대응 순수 OKLCH SVG 렌더러 및 자연스러운 한국어 QA 보고서", () => {
    it("5각 턴어라운드 SVG는 NaN/Infinity 0건, 원시 hex/rgb 색상 0건, 순수 oklch() 색상 및 5개 기준선 라벨을 포함한다", () => {
      const sheet = buildFiveAngleTurnaroundSheet(defaultCanon, "smirk-confident");
      const svg = renderCharacterTurnaroundSheetSvg(sheet);

      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");

      // 원시 hex / rgb / rgba / hsl 금지 검증
      expect(/#[0-9a-fA-F]{3,8}\b/.test(svg)).toBe(false);
      expect(/\brgba?\s*\(/i.test(svg)).toBe(false);
      expect(/\bhsla?\s*\(/i.test(svg)).toBe(false);
      expect(svg).toContain("oklch(");

      // 5개 수평 기준선 및 5개 턴어라운드 각도 라벨 포함 검증
      for (const railLabel of ["정수리", "눈썹", "눈", "코", "턱"]) {
        expect(svg).toContain(railLabel);
      }
      for (const angleLabel of ["좌측면 (-90°)", "좌 3/4 (-45°)", "정면 (0°)", "우 3/4 (+45°)", "후면 (+180°)"]) {
        expect(svg).toContain(angleLabel);
      }
    });

    it("캐릭터명·특징점 이름의 XML 특수문자(<, >, &, \", ')를 안전하게 이스케이프한다", () => {
      const hazardousCanon = createDefaultCharacterHeadCanonSheet({
        characterName: `세현 <주인공> & "리더" 'A'`,
        asymmetricLandmarks: [
          {
            landmarkId: "xml-scar",
            kind: "scar",
            labelKo: `<흉터 & "특이점">`,
            anatomicalSide: "anatomical-left",
            surfaceAngleDeg: 38,
            elevationNorm: 0.56,
          },
        ],
      });
      const sheet = buildFiveAngleTurnaroundSheet(hazardousCanon, "neutral");
      const svg = renderCharacterTurnaroundSheetSvg(sheet);

      expect(escapeTurnaroundSvgXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
      expect(svg).not.toContain("<주인공>");
      expect(svg).not.toContain(`<흉터 & "특이점">`);
      expect(svg).toContain("&lt;주인공&gt;");
      expect(svg).toContain("&lt;흉터 &amp; &quot;특이점&quot;&gt;");
    });

    it("한국어 작화 감독 QA 보고서가 번역투 없이 차단/수정/통과 상태를 명확히 요약한다", () => {
      const blockedReport = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP21-P14",
        episodeLabel: "21화",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedEyeSpacingRatio: 1.42,
        observedLandmarks: [{ landmarkId: "left-cheek-scar", observedScreenSide: "screen-left" }],
      });
      const cleanReport = auditDrawnPanelFaceAgainstCanon(defaultCanon, {
        panelId: "EP21-P15",
        episodeLabel: "21화",
        estimatedYawDeg: 0,
        estimatedPitchDeg: 0,
        observedEyeSpacingRatio: 1.0,
        observedJawToHeadRatio: 0.32,
        observedLandmarks: [
          { landmarkId: "left-cheek-scar", observedScreenSide: "screen-right" },
          { landmarkId: "right-under-eye-mole", observedScreenSide: "screen-left" },
        ],
      });

      const blockedSummary = summarizeCharacterTurnaroundAuditKo(blockedReport);
      const cleanSummary = summarizeCharacterTurnaroundAuditKo(cleanReport);

      expect(blockedSummary.verdictLabelKo).toContain("출고 차단");
      expect(blockedSummary.headlineKo).toContain("EP21-P14");
      expect(blockedSummary.chiralityNotesKo[0]).toContain("좌우 반전 작붕");
      expect(blockedSummary.proportionNotesKo[0]).toContain("눈 사이 간격 비율 이탈");
      expect(blockedSummary.markdownReportKo).toContain("권장 수정 조치");

      expect(cleanSummary.verdictLabelKo).toBe("작화 통과");
      expect(cleanSummary.summaryParagraphKo).toContain("100.0점");

      // 번역투 표현 금지 검증
      for (const text of [blockedSummary.markdownReportKo, cleanSummary.markdownReportKo]) {
        expect(text).not.toContain("가능하게 합니다");
        expect(text).not.toContain("직관적인 경험을 제공");
        expect(text).not.toContain("원활한 워크플로우를 보장");
      }
    });
  });
});
