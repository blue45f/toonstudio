/**
 * Wave 157 — 카메라 화각(18~200mm) 배경 압축·박렌즈 피사계 심도(CoC) &
 * 관절 절단 방지 삼분할/황금나선 샷 프레이밍 디렉터 결정론적 단위 테스트(38개).
 */

import { describe, expect, it } from "vitest";
import {
  CINEMA_LENS_PRESETS,
  FULL_FRAME_35MM_SENSOR,
  GOLDEN_RATIO_MAJOR,
  GOLDEN_RATIO_MINOR,
  RULE_OF_THIRDS_MAJOR,
  RULE_OF_THIRDS_MINOR,
  STANDARD_FOCAL_LENGTHS_MM,
  auditPanelShotFraming,
  compareFocalCompressionAcrossPresets,
  computeBlurCircleMmAtDistance,
  computeDepthOfFieldBounds,
  computeFocalBackgroundCompression,
  computeLensFieldOfView,
  createStandingSubjectLandmarks,
  directPanelShotFraming,
  escapeShotFramingXml,
  findNearestCinemaLensPreset,
  listCinemaLensPresets,
  renderShotFramingAuditSvg,
  resolveSafeCutZones,
  sha256ShotFramingUtf8Hex,
  solveOptimalShotReframe,
  summarizeShotFramingAuditKo,
  type ShotFramingPanelInput,
  type SubjectBodyLandmarks,
} from "./index";

describe("Wave 157 — 35mm 광학 렌즈 화각 및 배경 압축 커널", () => {
  it("1. 7종 표준 렌즈(18~200mm)에서 수평·수직·대각 화각이 단조 감소한다", () => {
    const presets = listCinemaLensPresets();
    expect(presets).toHaveLength(7);
    expect(presets.map((p) => p.focalLengthMm)).toEqual([...STANDARD_FOCAL_LENGTHS_MM]);
    for (let i = 1; i < presets.length; i += 1) {
      const prev = presets[i - 1];
      const curr = presets[i];
      if (!prev || !curr) throw new Error("프리셋 누락");
      expect(curr.hfovDeg).toBeLessThan(prev.hfovDeg);
      expect(curr.vfovDeg).toBeLessThan(prev.vfovDeg);
      expect(curr.dfovDeg).toBeLessThan(prev.dfovDeg);
      expect(curr.dfovDeg).toBeGreaterThan(curr.hfovDeg);
      expect(curr.hfovDeg).toBeGreaterThan(curr.vfovDeg);
    }
  });

  it("2. 50mm 풀프레임 표준 렌즈 화각이 해석적 공식과 일치한다", () => {
    const fov = computeLensFieldOfView(50, FULL_FRAME_35MM_SENSOR);
    expect(fov.hfovDeg).toBeCloseTo(39.5978, 3);
    expect(fov.vfovDeg).toBeCloseTo(26.9915, 3);
    expect(fov.dfovDeg).toBeCloseTo(46.793, 2);
  });

  it("3. 18mm 초광각은 90도 수평 화각, 200mm 초망원은 10.29도 수평 화각을 산출한다", () => {
    expect(CINEMA_LENS_PRESETS[18].hfovDeg).toBeCloseTo(90.0, 3);
    expect(CINEMA_LENS_PRESETS[200].hfovDeg).toBeCloseTo(10.2855, 3);
  });

  it("4. 임의 초점거리에서 가장 가까운 표준 시네마 프리셋을 찾는다", () => {
    expect(findNearestCinemaLensPreset(28).focalLengthMm).toBe(24);
    expect(findNearestCinemaLensPreset(42).focalLengthMm).toBe(35);
    expect(findNearestCinemaLensPreset(105).focalLengthMm).toBe(85);
    expect(findNearestCinemaLensPreset(180).focalLengthMm).toBe(200);
  });

  it("5. 사용자 지정 APS-C 센서(23.5×15.6mm)에서 크롭 팩터만큼 좁은 화각을 반환한다", () => {
    const ff = computeLensFieldOfView(50);
    const apsc = computeLensFieldOfView(50, { widthMm: 23.5, heightMm: 15.6, defaultCocMm: 0.02 });
    expect(apsc.hfovDeg).toBeLessThan(ff.hfovDeg);
    expect(apsc.hfovDeg).toBeCloseTo(26.4475, 2);
  });

  it("6. 동일 인물 프레이밍 시 18mm→200mm에서 카메라 거리와 배경 압축률이 단조 증가한다", () => {
    const rows = compareFocalCompressionAcrossPresets({
      backgroundDistanceM: 12,
      subjectHeightM: 1.7,
      subjectFrameFillRatio: 0.6,
      referenceFocalLengthMm: 24,
    });
    expect(rows).toHaveLength(7);
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (!prev || !curr) throw new Error("비교 항목 누락");
      expect(curr.subjectDistanceM).toBeGreaterThan(prev.subjectDistanceM);
      expect(curr.backgroundApparentScale).toBeGreaterThan(prev.backgroundApparentScale);
      expect(curr.backgroundCompressionRatio).toBeGreaterThan(prev.backgroundCompressionRatio);
      expect(curr.perspectiveForeshorteningIndex).toBeLessThan(prev.perspectiveForeshorteningIndex);
    }
  });

  it("7. 200mm 망원은 24mm 광각보다 배경을 선형 3배·면적 10배 이상 크게 끌어당김을 수학 증명한다", () => {
    const wide24 = computeFocalBackgroundCompression({
      focalLengthMm: 24,
      subjectHeightM: 1.7,
      subjectFrameFillRatio: 0.6,
      backgroundDistanceM: 12,
      referenceFocalLengthMm: 24,
    });
    const tele200 = computeFocalBackgroundCompression({
      focalLengthMm: 200,
      subjectHeightM: 1.7,
      subjectFrameFillRatio: 0.6,
      backgroundDistanceM: 12,
      referenceFocalLengthMm: 24,
    });
    expect(wide24.backgroundCompressionRatio).toBeCloseTo(1.0, 6);
    expect(tele200.backgroundCompressionRatio).toBeGreaterThan(3.4);
    expect(tele200.backgroundAreaMagnification).toBeGreaterThan(11.5);
    expect(tele200.subjectDistanceM / wide24.subjectDistanceM).toBeCloseTo(200 / 24, 4);
  });

  it("8. 기준 초점거리 자체의 상대 배경 압축률과 면적 배율은 정확히 1.0이다", () => {
    const res = computeFocalBackgroundCompression({
      focalLengthMm: 50,
      backgroundDistanceM: 15,
      referenceFocalLengthMm: 50,
    });
    expect(res.backgroundCompressionRatio).toBe(1);
    expect(res.backgroundAreaMagnification).toBe(1);
  });

  it("9. 피사체와 배경 사이 거리가 멀수록 200mm vs 24mm 배경 압축 배율 격차가 더 커진다", () => {
    const nearBg = computeFocalBackgroundCompression({
      focalLengthMm: 200,
      backgroundDistanceM: 3,
      referenceFocalLengthMm: 24,
    });
    const farBg = computeFocalBackgroundCompression({
      focalLengthMm: 200,
      backgroundDistanceM: 30,
      referenceFocalLengthMm: 24,
    });
    expect(farBg.backgroundCompressionRatio).toBeGreaterThan(nearBg.backgroundCompressionRatio);
  });

  it("10. compareFocalCompressionAcrossPresets는 반복 호출 시 완전히 동일한 수치를 반환한다", () => {
    const first = compareFocalCompressionAcrossPresets({ backgroundDistanceM: 8 });
    const second = compareFocalCompressionAcrossPresets({ backgroundDistanceM: 8 });
    expect(second).toEqual(first);
  });
});

describe("Wave 157 — 박렌즈(Thin-Lens) 피사계 심도(DoF) & 착란원(CoC) 정확도", () => {
  it("11. 과초점 거리 H = f²/(N·c) + f 공식이 정확히 성립한다", () => {
    const dof = computeDepthOfFieldBounds({
      focalLengthMm: 50,
      fNumber: 8,
      focusDistanceM: 3,
      cocMm: 0.03,
    });
    const expectedH = ((50 * 50) / (8 * 0.03) + 50) / 1000;
    expect(dof.hyperfocalDistanceM).toBeCloseTo(expectedH, 4);
  });

  it("12. 동일 초점거리·피사체 거리에서 f/1.4 개방 심도가 f/8 조임 심도보다 현저히 얕다", () => {
    const wideOpen = computeDepthOfFieldBounds({
      focalLengthMm: 85,
      fNumber: 1.4,
      focusDistanceM: 3,
      sampleBackgroundDistanceM: 10,
    });
    const stoppedDown = computeDepthOfFieldBounds({
      focalLengthMm: 85,
      fNumber: 8,
      focusDistanceM: 3,
      sampleBackgroundDistanceM: 10,
    });
    expect(wideOpen.totalDofM).toBeLessThan(stoppedDown.totalDofM);
    expect(wideOpen.totalDofM).toBeLessThan(0.15);
    expect(wideOpen.blurCircleMm).toBeGreaterThan(stoppedDown.blurCircleMm * 5);
  });

  it("13. 근측 한계(Dn) 및 원측 한계(Df)에서의 물리 착란원 직경이 허용 착란원(cocMm)과 정확히 일치한다", () => {
    const cocMm = 0.03;
    const dof = computeDepthOfFieldBounds({ focalLengthMm: 50, fNumber: 2.0, focusDistanceM: 2.5, cocMm });
    const blurAtNear = computeBlurCircleMmAtDistance({
      focalLengthMm: 50,
      fNumber: 2.0,
      focusDistanceM: 2.5,
      objectDistanceM: dof.nearFocusLimitM,
    });
    const blurAtFar = computeBlurCircleMmAtDistance({
      focalLengthMm: 50,
      fNumber: 2.0,
      focusDistanceM: 2.5,
      objectDistanceM: dof.farFocusLimitM,
    });
    expect(blurAtNear).toBeCloseTo(cocMm, 4);
    expect(blurAtFar).toBeCloseTo(cocMm, 4);
  });

  it("14. 초점 거리가 과초점 거리 H와 같으면 Dn = H/2, Df = Infinity, totalDof = Infinity가 성립한다", () => {
    const probe = computeDepthOfFieldBounds({ focalLengthMm: 35, fNumber: 8, focusDistanceM: 3, cocMm: 0.03 });
    const atHyper = computeDepthOfFieldBounds({
      focalLengthMm: 35,
      fNumber: 8,
      focusDistanceM: probe.hyperfocalDistanceM,
      cocMm: 0.03,
    });
    expect(atHyper.isFarLimitInfinite).toBe(true);
    expect(atHyper.farFocusLimitM).toBe(Number.POSITIVE_INFINITY);
    expect(atHyper.totalDofM).toBe(Number.POSITIVE_INFINITY);
    expect(atHyper.nearFocusLimitM).toBeCloseTo(probe.hyperfocalDistanceM / 2, 3);
  });

  it("15. 배경 거리 zM이 멀어질수록 착란원 직경이 단조 증가하며 보케 등급이 상향된다", () => {
    const d1 = computeDepthOfFieldBounds({
      focalLengthMm: 85,
      fNumber: 1.8,
      focusDistanceM: 2.5,
      sampleBackgroundDistanceM: 2.52,
    });
    const d2 = computeDepthOfFieldBounds({
      focalLengthMm: 85,
      fNumber: 1.8,
      focusDistanceM: 2.5,
      sampleBackgroundDistanceM: 3.5,
    });
    const d3 = computeDepthOfFieldBounds({
      focalLengthMm: 85,
      fNumber: 1.8,
      focusDistanceM: 2.5,
      sampleBackgroundDistanceM: 12,
    });
    expect(d1.isSampleInFocus).toBe(true);
    expect(d1.bokehSeparationGrade).toBe("tack-sharp");
    expect(d2.blurCircleMm).toBeGreaterThan(d1.blurCircleMm);
    expect(d3.blurCircleMm).toBeGreaterThan(d2.blurCircleMm);
    expect(d3.bokehSeparationGrade).toBe("creamy-isolation");
  });

  it("16. 초점 평면(z === s)에서 물리 착란원은 정확히 0mm이다", () => {
    const dof = computeDepthOfFieldBounds({
      focalLengthMm: 50,
      fNumber: 1.4,
      focusDistanceM: 4,
      sampleBackgroundDistanceM: 4,
    });
    expect(dof.blurCircleMm).toBe(0);
    expect(dof.isSampleInFocus).toBe(true);
  });

  it("17. 동일 피사체 거리에서 200mm f/2.8 초망원이 24mm f/8 광각보다 배경 보케 분리가 훨씬 강하다", () => {
    const tele = computeDepthOfFieldBounds({
      focalLengthMm: 200,
      fNumber: 2.8,
      focusDistanceM: 6,
      sampleBackgroundDistanceM: 18,
    });
    const wide = computeDepthOfFieldBounds({
      focalLengthMm: 24,
      fNumber: 8,
      focusDistanceM: 6,
      sampleBackgroundDistanceM: 18,
    });
    expect(tele.blurCircleMm).toBeGreaterThan(wide.blurCircleMm * 20);
    expect(wide.isSampleInFocus).toBe(true);
    expect(tele.isSampleInFocus).toBe(false);
  });
});

describe("Wave 157 — 5대 샷 프레이밍 결함 감지기 및 연출 예외 규칙", () => {
  it("18. 컷 하단이 무릎 관절을 정면 절단하면 tangent-joint-crop 블로커와 안전 절단대를 권고한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.34, crownY: 0.12, bodyHeight: 0.82, gazeDirection: "right" });
    const kneeY = subject.joints.knees?.[0]?.y ?? 0.71;
    const audit = auditPanelShotFraming({
      panelId: "P-18",
      titleKo: "무릎 절단 오류 컷",
      subject,
      crop: { x: 0, y: 0, width: 1, height: kneeY },
    });
    const kneeDefects = audit.defects.filter(
      (d) => d.code === "tangent-joint-crop" && d.jointDetail?.jointKind === "knees",
    );
    expect(kneeDefects.length).toBeGreaterThanOrEqual(1);
    expect(kneeDefects[0]?.severity).toBe("blocker");
    expect(kneeDefects[0]?.jointDetail?.edge).toBe("bottom");
    expect(kneeDefects[0]?.jointDetail?.recommendedSafeZone).not.toBeNull();
    expect(audit.grade).toBe("F");
    expect(audit.passed).toBe(false);
  });

  it("19. 목·손목·발목 관절 각각을 컷 하단이 정면 절단할 때 모두 블로커로 탐지한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.34, crownY: 0.08, bodyHeight: 0.86, gazeDirection: "right" });
    const targetCases: readonly { readonly kind: "neck" | "wrists" | "ankles"; readonly y: number }[] = [
      { kind: "neck", y: subject.joints.neck?.y ?? 0.21 },
      { kind: "wrists", y: subject.joints.wrists?.[0]?.y ?? 0.5 },
      { kind: "ankles", y: subject.joints.ankles?.[0]?.y ?? 0.89 },
    ];
    for (let i = 0; i < targetCases.length; i += 1) {
      const tc = targetCases[i];
      if (!tc) continue;
      const audit = auditPanelShotFraming({
        panelId: `P-19-${tc.kind}`,
        titleKo: `${tc.kind} 절단 테스트`,
        subject,
        crop: { x: 0, y: 0, width: 1, height: tc.y },
      });
      expect(audit.jointCropViolations.some((v) => v.jointKind === tc.kind && v.edge === "bottom")).toBe(true);
      expect(audit.blockerCount).toBeGreaterThan(0);
    }
  });

  it("20. 컷 좌/우 측면 경계가 팔꿈치·손목 관절 중심을 자를 때도 블로커로 탐지한다", () => {
    const subject: SubjectBodyLandmarks = {
      crownY: 0.14,
      eyeCenter: { x: 0.35, y: 0.24 },
      gazeDirection: "right",
      joints: {
        neck: { x: 0.35, y: 0.35 },
        elbows: [{ x: 0.1, y: 0.55 }, { x: 0.895, y: 0.55 }],
        wrists: [{ x: 0.99, y: 0.62 }],
      },
    };
    const audit = auditPanelShotFraming({
      panelId: "P-20",
      titleKo: "측면 팔꿈치 절단",
      subject,
      crop: { x: 0.1, y: 0, width: 0.8, height: 1 },
    });
    expect(audit.jointCropViolations.some((v) => v.jointKind === "elbows" && v.edge === "left")).toBe(true);
    expect(audit.jointCropViolations.some((v) => v.jointKind === "elbows" && v.edge === "right")).toBe(true);
  });

  it("21. 가슴·허리·허벅지 중간·정강이 중간 안전 절단대 크롭은 관절 블로커가 0건이다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.34, crownY: 0.1, bodyHeight: 0.84, gazeDirection: "right" });
    const safe = resolveSafeCutZones(subject);
    const heights = [safe.chest, safe.waist, safe["mid-thigh"], safe["mid-shin"]];
    for (let i = 0; i < heights.length; i += 1) {
      const h = heights[i];
      if (h === undefined) continue;
      const audit = auditPanelShotFraming({
        panelId: `P-21-${i}`,
        titleKo: "안전 절단 검증",
        subject,
        crop: { x: 0, y: 0, width: 1, height: h },
      });
      expect(audit.jointCropViolations).toHaveLength(0);
    }
  });

  it("22. 정수리가 컷 상단에 닿거나 잘리면 cramped-headroom 결함을 탐지한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.35, crownY: 0.015, bodyHeight: 0.8, gazeDirection: "right" });
    const cramped = auditPanelShotFraming({
      panelId: "P-22A",
      titleKo: "상단 밀착",
      subject,
      crop: { x: 0, y: 0, width: 1, height: 0.52 },
    });
    expect(cramped.defects.some((d) => d.code === "cramped-headroom")).toBe(true);

    const clipped = auditPanelShotFraming({
      panelId: "P-22B",
      titleKo: "정수리 절단",
      subject,
      crop: { x: 0, y: 0.05, width: 1, height: 0.5 },
    });
    expect(clipped.defects.find((d) => d.code === "cramped-headroom")?.severity).toBe("blocker");
  });

  it("23. 익스트림 클로즈업(extreme-close-up)에서는 정수리 절단 시 cramped-headroom을 면제한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.36, crownY: 0.02, bodyHeight: 0.9, gazeDirection: "right" });
    const ecuAudit = auditPanelShotFraming({
      panelId: "P-23",
      titleKo: "눈동자 익스트림 클로즈업",
      subject,
      shotScale: "extreme-close-up",
      crop: { x: 0.1, y: 0.04, width: 0.65, height: 0.25 },
    });
    expect(ecuAudit.defects.some((d) => d.code === "cramped-headroom")).toBe(false);
    expect(ecuAudit.exemptionsApplied.length).toBeGreaterThan(0);
  });

  it("24. 머리 위 여백이 35%를 넘으면 excessive-dead-headroom 결함을 탐지한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.35, crownY: 0.44, bodyHeight: 0.52, gazeDirection: "right" });
    const audit = auditPanelShotFraming({ panelId: "P-24", titleKo: "과다 여백 컷", subject });
    expect(audit.headroomRatio).toBeGreaterThan(0.35);
    expect(audit.defects.some((d) => d.code === "excessive-dead-headroom")).toBe(true);
  });

  it("25. 의도된 고독·부감 여백(intentionalNegativeSpace: true)은 과다 헤드룸 경고를 면제한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.35, crownY: 0.45, bodyHeight: 0.5, gazeDirection: "right" });
    const audit = auditPanelShotFraming({
      panelId: "P-25",
      titleKo: "의도된 고독 부감 샷",
      subject,
      intentionalNegativeSpace: true,
    });
    expect(audit.defects.some((d) => d.code === "excessive-dead-headroom")).toBe(false);
    expect(audit.exemptionsApplied.some((e) => e.indexOf("여백") >= 0)).toBe(true);
  });

  it("26. 시선 앞쪽 리드룸이 뒤쪽 여백보다 좁으면 insufficient-lead-room을 탐지하고 정면 시선은 면제한다", () => {
    const rightBlocked = auditPanelShotFraming({
      panelId: "P-26R",
      titleKo: "우측 벽 막힘",
      subject: createStandingSubjectLandmarks({ centerX: 0.72, crownY: 0.14, bodyHeight: 0.8, gazeDirection: "right" }),
    });
    expect(rightBlocked.leadRoomRatio).toBeLessThan(rightBlocked.backRoomRatio);
    expect(rightBlocked.defects.some((d) => d.code === "insufficient-lead-room")).toBe(true);

    const leftBlocked = auditPanelShotFraming({
      panelId: "P-26L",
      titleKo: "좌측 벽 막힘",
      subject: createStandingSubjectLandmarks({ centerX: 0.25, crownY: 0.14, bodyHeight: 0.8, gazeDirection: "left" }),
    });
    expect(leftBlocked.defects.some((d) => d.code === "insufficient-lead-room")).toBe(true);

    const frontGaze = auditPanelShotFraming({
      panelId: "P-26F",
      titleKo: "정면 시선",
      subject: createStandingSubjectLandmarks({ centerX: 0.34, crownY: 0.14, bodyHeight: 0.8, gazeDirection: "front" }),
    });
    expect(frontGaze.defects.some((d) => d.code === "insufficient-lead-room")).toBe(false);
  });

  it("27. 주요 눈이 삼분할/황금비 교점에서 이탈(정중앙·구석)하면 weak-power-point-alignment를 탐지한다", () => {
    const bullseyeAudit = auditPanelShotFraming({
      panelId: "P-27A",
      titleKo: "정중앙 이탈 구도",
      subject: { crownY: 0.25, eyeCenter: { x: 0.5, y: 0.5 }, gazeDirection: "front", joints: { neck: { x: 0.5, y: 0.62 } } },
    });
    expect(bullseyeAudit.defects.some((d) => d.code === "weak-power-point-alignment")).toBe(true);

    const alignedAudit = auditPanelShotFraming({
      panelId: "P-27B",
      titleKo: "삼분할 교점 정렬",
      subject: {
        crownY: 0.18,
        eyeCenter: { x: RULE_OF_THIRDS_MINOR, y: RULE_OF_THIRDS_MINOR },
        gazeDirection: "right",
        joints: { neck: { x: RULE_OF_THIRDS_MINOR, y: 0.48 } },
      },
    });
    expect(alignedAudit.defects.some((d) => d.code === "weak-power-point-alignment")).toBe(false);
    expect(alignedAudit.powerPointAlignmentScore).toBeGreaterThan(99);
    expect(alignedAudit.passed).toBe(true);
  });

  it("28. compositionGrid 모드(rule-of-thirds vs golden-ratio)에 따라 기준 교점 거리를 정확히 구분한다", () => {
    const goldenEyeSubject: SubjectBodyLandmarks = {
      crownY: 0.2,
      eyeCenter: { x: GOLDEN_RATIO_MAJOR, y: GOLDEN_RATIO_MINOR },
      gazeDirection: "left",
      joints: { neck: { x: GOLDEN_RATIO_MAJOR, y: 0.52 } },
    };
    const goldenAudit = auditPanelShotFraming({ panelId: "P-28G", titleKo: "황금비 평가", subject: goldenEyeSubject, compositionGrid: "golden-ratio" });
    const thirdsAudit = auditPanelShotFraming({ panelId: "P-28T", titleKo: "삼분할 평가", subject: goldenEyeSubject, compositionGrid: "rule-of-thirds" });
    expect(goldenAudit.nearestPowerPoint.grid).toBe("golden-ratio");
    expect(goldenAudit.powerPointDistanceNorm).toBeCloseTo(0, 4);
    expect(thirdsAudit.nearestPowerPoint.grid).toBe("rule-of-thirds");
    expect(thirdsAudit.powerPointDistanceNorm).toBeGreaterThan(0.06);
  });
});

describe("Wave 157 — 자동 리프레이밍 크롭 솔버 & 통합 촬영 디렉터", () => {
  it("29. 무릎 절단·리드룸 부족·과다 헤드룸 복합 결함 컷을 리프레임해 관절 절단 0건·리드룸 확보·점수 향상을 입증한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.58, crownY: 0.36, bodyHeight: 0.6, gazeDirection: "right" });
    const kneeY = subject.joints.knees?.[0]?.y ?? 0.795;
    const outcome = solveOptimalShotReframe(
      { panelId: "P-29", titleKo: "복합 결함 마감 컷", subject, crop: { x: 0, y: 0, width: 0.82, height: kneeY } },
      { preferredGrid: "rule-of-thirds" },
    );
    expect(outcome.beforeAudit.jointCropViolations.length).toBeGreaterThan(0);
    expect(outcome.beforeAudit.defects.some((d) => d.code === "insufficient-lead-room")).toBe(true);
    expect(outcome.beforeAudit.defects.some((d) => d.code === "excessive-dead-headroom")).toBe(true);
    expect(outcome.afterAudit.jointCropViolations).toHaveLength(0);
    expect(outcome.afterAudit.blockerCount).toBe(0);
    expect(outcome.afterAudit.leadRoomRatio).toBeGreaterThan(outcome.afterAudit.backRoomRatio);
    expect(outcome.afterAudit.headroomRatio).toBeGreaterThanOrEqual(0.04);
    expect(outcome.afterAudit.headroomRatio).toBeLessThanOrEqual(0.35);
    expect(outcome.afterAudit.framingScore).toBeGreaterThan(outcome.beforeAudit.framingScore);
    expect(outcome.afterAudit.powerPointAlignmentScore).toBeGreaterThan(outcome.beforeAudit.powerPointAlignmentScore);
    expect(outcome.jointCropsEliminated).toBe(outcome.beforeAudit.jointCropViolations.length);
    expect(outcome.improved).toBe(true);
  });

  it("30. 황금비(golden-ratio) 우선 리프레임이 마스터 [0,1] 경계를 지키며 황금 교점으로 정렬한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.42, crownY: 0.2, bodyHeight: 0.72, gazeDirection: "left" });
    const wristY = subject.joints.wrists?.[0]?.y ?? 0.56;
    const outcome = solveOptimalShotReframe(
      { panelId: "P-30", titleKo: "황금비 리프레임 대상", subject, crop: { x: 0, y: 0, width: 1, height: wristY }, compositionGrid: "golden-ratio" },
      { preferredGrid: "golden-ratio" },
    );
    const rc = outcome.reframedCrop;
    expect(rc.x).toBeGreaterThanOrEqual(0);
    expect(rc.y).toBeGreaterThanOrEqual(0);
    expect(rc.x + rc.width).toBeLessThanOrEqual(1.0001);
    expect(rc.y + rc.height).toBeLessThanOrEqual(1.0001);
    expect(outcome.afterAudit.jointCropViolations).toHaveLength(0);
    expect(outcome.afterAudit.leadRoomRatio).toBeGreaterThan(outcome.afterAudit.backRoomRatio);
    expect(outcome.afterAudit.framingScore).toBeGreaterThan(outcome.beforeAudit.framingScore);
  });

  it("31. preserveAspectRatio: true 옵션은 원본 종횡비를 유지하면서 관절 절단을 해소한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.48, crownY: 0.16, bodyHeight: 0.78, gazeDirection: "right" });
    const kneeY = subject.joints.knees?.[0]?.y ?? 0.725;
    const origAspect = 0.8 / kneeY;
    const outcome = solveOptimalShotReframe(
      { panelId: "P-31", titleKo: "종횡비 고정 리프레임", subject, crop: { x: 0.05, y: 0, width: 0.8, height: kneeY } },
      { preserveAspectRatio: true },
    );
    const reframedAspect = outcome.reframedCrop.width / outcome.reframedCrop.height;
    expect(Math.abs(reframedAspect - origAspect)).toBeLessThan(0.05);
    expect(outcome.afterAudit.jointCropViolations).toHaveLength(0);
    expect(outcome.afterAudit.framingScore).toBeGreaterThan(outcome.beforeAudit.framingScore);
  });

  it("32. 이미 최적화된 컷을 리프레임할 때 점수가 떨어지거나 새 결함이 생기지 않는다", () => {
    const perfectSubject: SubjectBodyLandmarks = {
      crownY: 0.14,
      eyeCenter: { x: RULE_OF_THIRDS_MINOR, y: RULE_OF_THIRDS_MINOR },
      gazeDirection: "right",
      footY: 0.96,
      joints: { neck: { x: RULE_OF_THIRDS_MINOR, y: 0.45 }, elbows: [{ x: 0.24, y: 0.68 }, { x: 0.42, y: 0.68 }] },
      safeCutZones: { chest: 0.56, waist: 0.76, midThigh: 0.86, midShin: 0.93 },
    };
    const outcome = solveOptimalShotReframe({
      panelId: "P-32",
      titleKo: "완성 구도 유지",
      subject: perfectSubject,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(outcome.beforeAudit.passed).toBe(true);
    expect(outcome.afterAudit.defects).toHaveLength(0);
    expect(outcome.afterAudit.framingScore).toBeGreaterThanOrEqual(outcome.beforeAudit.framingScore);
  });

  it("33. directPanelShotFraming 통합 오케스트레이터가 압축률·DoF·리프레임·SHA-256 지문을 일괄 산출한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.55, crownY: 0.18, bodyHeight: 0.76, gazeDirection: "right" });
    const plan = directPanelShotFraming({
      panel: { panelId: "P-33", titleKo: "200mm 초망원 대치 컷", subject, crop: { x: 0, y: 0, width: 0.85, height: subject.joints.knees?.[0]?.y ?? 0.73 } },
      focalLengthMm: 200,
      fNumber: 2.8,
      backgroundDistanceM: 15,
      referenceFocalLengthMm: 24,
    });
    expect(plan.compression.backgroundCompressionRatio).toBeGreaterThan(3.5);
    expect(plan.dof.focusDistanceM).toBeCloseTo(plan.compression.subjectDistanceM, 3);
    expect(plan.dof.sampleBackgroundDistanceM).toBeCloseTo(plan.compression.cameraToBackgroundM, 3);
    expect(plan.reframe.afterAudit.jointCropViolations).toHaveLength(0);
    expect(plan.directorManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Wave 157 — 순수 OKLCH SVG, XSS 방어, 한국어 브리프 & SHA-256 결정론", () => {
  it("34. renderShotFramingAuditSvg는 원시 색상(#hex, rgb, hsl) 없이 순수 oklch(...)와 필수 레이어를 출력한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.56, crownY: 0.24, bodyHeight: 0.7, gazeDirection: "right" });
    const plan = directPanelShotFraming({
      panel: { panelId: "P-34", titleKo: "SVG 레이어 검증", subject, crop: { x: 0, y: 0, width: 0.85, height: subject.joints.knees?.[0]?.y ?? 0.75 } },
      focalLengthMm: 135,
      fNumber: 2.0,
      backgroundDistanceM: 10,
    });
    const svg = renderShotFramingAuditSvg(
      { panelId: "P-34", titleKo: "SVG 레이어 검증", subject, crop: plan.reframe.originalCrop },
      plan.reframe.beforeAudit,
      { reframe: plan.reframe, dof: plan.dof, compression: plan.compression },
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).toContain('data-layer="joint-danger-bands"');
    expect(svg).toContain('data-layer="safe-cut-zones"');
    expect(svg).toContain('data-layer="composition-grids"');
    expect(svg).toContain('data-layer="golden-spiral"');
    expect(svg).toContain('data-crop-role="original"');
    expect(svg).toContain('data-crop-role="reframed"');
    expect(svg).toContain('data-layer="dof-bar"');
  });

  it("35. SVG 출력 및 escapeShotFramingXml이 스크립트·속성 XSS 페이로드를 완전 이스케이프한다", () => {
    const xss = `<script>alert("xss")</script> & 'cut'`;
    expect(escapeShotFramingXml(xss)).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;cut&apos;");
    const subject = createStandingSubjectLandmarks({ centerX: 0.34, crownY: 0.14, bodyHeight: 0.8, gazeDirection: "right" });
    const panel: ShotFramingPanelInput = { panelId: `P-<35>&"`, titleKo: xss, subject };
    const svg = renderShotFramingAuditSvg(panel, auditPanelShotFraming(panel));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
  });

  it("36. summarizeShotFramingAuditKo가 번역투 없이 자연스러운 한국어 촬영 감독 브리프를 생성한다", () => {
    const subject = createStandingSubjectLandmarks({ centerX: 0.58, crownY: 0.18, bodyHeight: 0.76, gazeDirection: "right" });
    const panel: ShotFramingPanelInput = {
      panelId: "P-36",
      titleKo: "옥상 대치 롱렌즈 컷",
      subject,
      crop: { x: 0, y: 0, width: 0.85, height: subject.joints.knees?.[0]?.y ?? 0.73 },
    };
    const plan = directPanelShotFraming({ panel, focalLengthMm: 200, fNumber: 2.8, backgroundDistanceM: 14 });
    const brief = summarizeShotFramingAuditKo({
      panel,
      audit: plan.reframe.beforeAudit,
      reframe: plan.reframe,
      compression: plan.compression,
      dof: plan.dof,
    });
    expect(brief).toContain("[샷 프레이밍 디렉터 QA]");
    expect(brief).toContain("관절 정면 절단");
    expect(brief).toContain("자동 리프레임 결과");
    expect(brief).toContain("배경 압축률");
    expect(brief).toContain("피사계 심도(DoF)");
    expect(brief).not.toContain("하는 것을 가능하게 합니다");
    expect(brief).not.toContain("직관적인 경험을 제공합니다");
    expect(brief).not.toContain("원활한 워크플로우를 보장합니다");
  });

  it("37. FIPS 180-4 SHA-256이 NIST 표준 벡터와 일치하고 framingManifestSha256Hex가 결정론·민감도를 만족한다", () => {
    expect(sha256ShotFramingUtf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256ShotFramingUtf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const subject = createStandingSubjectLandmarks({ centerX: RULE_OF_THIRDS_MAJOR, crownY: 0.14, bodyHeight: 0.8, gazeDirection: "left" });
    const basePanel: ShotFramingPanelInput = { panelId: "P-37", titleKo: "결정론 지문 테스트", subject, crop: { x: 0, y: 0, width: 1, height: 0.85 } };
    const a1 = auditPanelShotFraming(basePanel);
    const a2 = auditPanelShotFraming(basePanel);
    const aChanged = auditPanelShotFraming({ ...basePanel, crop: { x: 0.01, y: 0, width: 0.99, height: 0.85 } });
    expect(a1.framingManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(a2.framingManifestSha256Hex).toBe(a1.framingManifestSha256Hex);
    expect(aChanged.framingManifestSha256Hex).not.toBe(a1.framingManifestSha256Hex);
  });

  it("38. resolveSafeCutZones는 안전 절단대 미지정 시 관절 좌표 사이 중간 높이로 자동 보간한다", () => {
    const manualJoints: SubjectBodyLandmarks = {
      crownY: 0.1,
      eyeCenter: { x: 0.35, y: 0.16 },
      gazeDirection: "right",
      joints: {
        neck: { x: 0.35, y: 0.24 },
        elbows: [{ x: 0.25, y: 0.42 }],
        wrists: [{ x: 0.24, y: 0.54 }],
        knees: [{ x: 0.32, y: 0.74 }],
        ankles: [{ x: 0.32, y: 0.94 }],
      },
    };
    const zones = resolveSafeCutZones(manualJoints);
    expect(zones.chest).toBeCloseTo(0.33, 4);
    expect(zones.waist).toBeCloseTo(0.48, 4);
    expect(zones["mid-thigh"]).toBeCloseTo(0.64, 4);
    expect(zones["mid-shin"]).toBeCloseTo(0.84, 4);
    expect(zones.chest).toBeLessThan(zones.waist);
    expect(zones.waist).toBeLessThan(zones["mid-thigh"]);
    expect(zones["mid-thigh"]).toBeLessThan(zones["mid-shin"]);
  });
});
