import { describe, expect, it } from "vitest";
import {
  DEFAULT_EYELINE_PITCH_TOLERANCE_DEG,
  LEGAL_AXIS_BRIDGE_SHOT_KINDS,
  applySafeCameraBlockingFix,
  auditSceneEyelineAnd180Rule,
  canonicalizeBlockingJson,
  computeCameraBlockingSha256Hex,
  computeExpectedEyelinePitchDeg,
  computeProjectedScreenFacing,
  computeSignedAxisDistanceM,
  cross2DXZ,
  distance2DXZ,
  isLegalAxisBridgeShot,
  reflectPointAcrossLineXZ,
  renderEyeline180StageDiagramSvg,
  sha256EyelineHex,
  summarizeEyeline180AuditKo,
  type CameraCutSpec,
  type DialogueActionSceneSpec,
  type StageCharacterSpec,
} from "./index";

const CHAR_MINSEO: StageCharacterSpec = {
  characterId: "char-a",
  labelKo: "민서",
  positionXZ: { x: -1.0, z: 0.0 },
  eyeHeightM: 1.75,
};
const CHAR_HAEUN: StageCharacterSpec = {
  characterId: "char-b",
  labelKo: "하은",
  positionXZ: { x: 1.0, z: 0.0 },
  eyeHeightM: 1.4,
};
const CHAR_JINHO: StageCharacterSpec = {
  characterId: "char-c",
  labelKo: "진호",
  positionXZ: { x: 0.0, z: -2.2 },
  eyeHeightM: 1.78,
};

function makeScene(
  sceneId: string,
  titleKo: string,
  cuts: readonly CameraCutSpec[],
  characters: readonly StageCharacterSpec[] = [CHAR_MINSEO, CHAR_HAEUN],
  axisAnchorPair: readonly [string, string] = ["char-a", "char-b"],
): DialogueActionSceneSpec {
  return { sceneId, titleKo, characters, axisAnchorPair, cuts };
}

function makeCleanDialogueScene(): DialogueActionSceneSpec {
  const pitchAtoB = computeExpectedEyelinePitchDeg(CHAR_MINSEO, CHAR_HAEUN);
  const pitchBtoA = computeExpectedEyelinePitchDeg(CHAR_HAEUN, CHAR_MINSEO);
  return makeScene("scene-cafe-dialogue", "카페 창가 대치", [
    {
      cutId: "cut-1",
      shotKind: "two-shot",
      cameraXZ: { x: 0.0, z: 3.0 },
      subjectCharacterId: "char-a",
      lookTargetCharacterId: "char-b",
      drawnScreenFacing: "screen-right",
      drawnEyelinePitchDeg: pitchAtoB,
    },
    {
      cutId: "cut-2",
      shotKind: "dialogue-ots",
      cameraXZ: { x: 2.2, z: 1.4 },
      subjectCharacterId: "char-a",
      lookTargetCharacterId: "char-b",
      drawnScreenFacing: "screen-right",
      drawnEyelinePitchDeg: pitchAtoB + 2,
    },
    {
      cutId: "cut-3",
      shotKind: "dialogue-ots",
      cameraXZ: { x: -2.2, z: 1.4 },
      subjectCharacterId: "char-b",
      lookTargetCharacterId: "char-a",
      drawnScreenFacing: "screen-left",
      drawnEyelinePitchDeg: pitchBtoA - 2,
    },
  ]);
}

describe("Wave 125 — 180도 액션 축·시선 매치·스크린 방향 교정 솔버", () => {
  it("1. 정상 대화 시퀀스(동일 반평면 + 좌우 시선 대칭 + 키 차이 피치 일치)는 위반 0건으로 통과한다", () => {
    const audit = auditSceneEyelineAnd180Rule(makeCleanDialogueScene());
    expect(audit.passed).toBe(true);
    expect(audit.totalViolationCount).toBe(0);
    expect(audit.blockerCount).toBe(0);
    expect(audit.warningCount).toBe(0);
    expect(audit.continuityScore).toBe(100);
    expect(audit.axisSummary.isAxisValid).toBe(true);
    expect(audit.axisSummary.initialSafeHalfPlaneSign).toBe(1);
    expect(audit.axisSummary.finalSafeHalfPlaneSign).toBe(1);
  });

  it("2. 브리지 없이 180도 액션 축 반대편으로 넘어가면 axis-180-crossing blocker를 즉시 적발한다", () => {
    const base = makeCleanDialogueScene();
    const broken = makeScene(base.sceneId, base.titleKo, [
      base.cuts[0]!,
      base.cuts[1]!,
      {
        cutId: "cut-3-crossed",
        shotKind: "dialogue-ots",
        cameraXZ: { x: -2.2, z: -1.4 },
        subjectCharacterId: "char-b",
        lookTargetCharacterId: "char-a",
      },
    ]);
    const audit = auditSceneEyelineAnd180Rule(broken);
    expect(audit.passed).toBe(false);
    expect(audit.blockerCount).toBe(1);
    expect(audit.violations[0]?.kind).toBe("axis-180-crossing");
    expect(audit.violations[0]?.severity).toBe("blocker");
    expect(audit.violations[0]?.cutId).toBe("cut-3-crossed");
    expect(audit.violations[0]?.expectedHalfPlaneSign).toBe(1);
    expect(audit.violations[0]?.actualHalfPlaneSign).toBe(-1);
  });

  it("3. neutral-axis-on 중립 컷을 경유한 180도 축 전환은 합법 전환으로 승인하고 오탐 0건을 유지한다", () => {
    const scene = makeScene("scene-neutral-bridge", "정면 중립 컷 경유 축 전환", [
      { cutId: "cut-1", shotKind: "dialogue-ots", cameraXZ: { x: 2.0, z: 1.5 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "screen-right" },
      { cutId: "cut-2-neutral", shotKind: "neutral-axis-on", cameraXZ: { x: -3.0, z: 0.0 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "front" },
      { cutId: "cut-3-flipped", shotKind: "dialogue-ots", cameraXZ: { x: -2.0, z: -1.5 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "screen-right" },
      { cutId: "cut-4-flipped", shotKind: "dialogue-ots", cameraXZ: { x: 2.0, z: -1.5 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "screen-left" },
    ]);
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(0);
    expect(audit.legalAxisTransitions).toHaveLength(1);
    expect(audit.legalAxisTransitions[0]?.bridgeShotKind).toBe("neutral-axis-on");
    expect(audit.legalAxisTransitions[0]?.fromHalfPlaneSign).toBe(1);
    expect(audit.legalAxisTransitions[0]?.toHalfPlaneSign).toBe(-1);
    expect(audit.axisSummary.finalSafeHalfPlaneSign).toBe(-1);
  });

  it("4. top-down-establishing 부감 전경 컷을 경유한 축 전환은 합법으로 승인한다", () => {
    const scene = makeScene("scene-topdown-bridge", "부감 컷 경유 축 전환", [
      { cutId: "cut-1", shotKind: "dialogue-ots", cameraXZ: { x: 1.8, z: 1.6 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "screen-right" },
      { cutId: "cut-2-topdown", shotKind: "top-down-establishing", cameraXZ: { x: 0.0, z: 0.0 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b" },
      { cutId: "cut-3-new-side", shotKind: "closeup", cameraXZ: { x: -1.8, z: -1.6 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "screen-right" },
    ]);
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(0);
    expect(audit.legalAxisTransitions).toHaveLength(1);
    expect(audit.legalAxisTransitions[0]?.bridgeShotKind).toBe("top-down-establishing");
  });

  it("5. camera-dolly-bridge가 직접 반대 반평면에 착지하면 합법 전환 후 새 반평면으로 갱신된다", () => {
    const scene = makeScene("scene-dolly-landing", "돌리 이동 축 횡단", [
      { cutId: "cut-1", shotKind: "dialogue-ots", cameraXZ: { x: 2.0, z: 1.4 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "screen-right" },
      { cutId: "cut-2-dolly", shotKind: "camera-dolly-bridge", cameraXZ: { x: 0.0, z: -2.4 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "screen-right" },
      { cutId: "cut-3-after-dolly", shotKind: "dialogue-ots", cameraXZ: { x: 2.0, z: -1.4 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "screen-left" },
    ]);
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(0);
    expect(audit.legalAxisTransitions).toHaveLength(1);
    expect(audit.legalAxisTransitions[0]?.bridgeCutId).toBe("cut-2-dolly");
    expect(audit.axisSummary.finalSafeHalfPlaneSign).toBe(-1);
  });

  it("6. camera-dolly-bridge로 축을 넘어간 뒤 브리지 없이 원래 반평면으로 되돌아가면 위반을 적발한다", () => {
    const scene = makeScene("scene-dolly-then-illegal-jump", "돌리 후 무단 복귀", [
      { cutId: "cut-1", shotKind: "dialogue-ots", cameraXZ: { x: 2.0, z: 1.4 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b" },
      { cutId: "cut-2-dolly", shotKind: "camera-dolly-bridge", cameraXZ: { x: 0.0, z: -2.4 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a" },
      { cutId: "cut-3-illegal-return", shotKind: "dialogue-ots", cameraXZ: { x: 2.0, z: 1.4 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b" },
    ]);
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(1);
    expect(audit.violations[0]?.kind).toBe("axis-180-crossing");
    expect(audit.violations[0]?.cutId).toBe("cut-3-illegal-return");
    expect(audit.violations[0]?.expectedHalfPlaneSign).toBe(-1);
    expect(audit.violations[0]?.actualHalfPlaneSign).toBe(1);
  });

  it("7. A가 화면 오른쪽을 보는데 리버스 샷의 B도 화면 오른쪽을 보면 eyeline-horizontal-clash를 적발한다", () => {
    const base = makeCleanDialogueScene();
    const clashing = makeScene(base.sceneId, base.titleKo, [
      base.cuts[1]!,
      { ...base.cuts[2]!, drawnScreenFacing: "screen-right" },
    ]);
    const audit = auditSceneEyelineAnd180Rule(clashing);
    expect(audit.totalViolationCount).toBe(1);
    expect(audit.violations[0]?.kind).toBe("eyeline-horizontal-clash");
    expect(audit.violations[0]?.severity).toBe("blocker");
    expect(audit.violations[0]?.expectedScreenFacing).toBe("screen-left");
    expect(audit.violations[0]?.actualScreenFacing).toBe("screen-right");
  });

  it("8. 키 차이 0.35m 인접 대화(거리 0.9m)에서 둘 다 올려다보는 모순을 eyeline-pitch-mismatch로 적발한다", () => {
    const tall: StageCharacterSpec = { characterId: "tall", labelKo: "도윤", positionXZ: { x: 0, z: 0 }, eyeHeightM: 1.75 };
    const short: StageCharacterSpec = { characterId: "short", labelKo: "유나", positionXZ: { x: 0.9, z: 0 }, eyeHeightM: 1.4 };
    expect(computeExpectedEyelinePitchDeg(tall, short)).toBeCloseTo(-21.25, 1);
    expect(computeExpectedEyelinePitchDeg(short, tall)).toBeCloseTo(21.25, 1);

    const scene = makeScene(
      "scene-height-gap",
      "신장 차 인접 대화",
      [
        { cutId: "cut-tall", shotKind: "closeup", cameraXZ: { x: 1.6, z: 1.2 }, subjectCharacterId: "tall", lookTargetCharacterId: "short", drawnScreenFacing: "screen-right", drawnEyelinePitchDeg: 8 },
        { cutId: "cut-short", shotKind: "closeup", cameraXZ: { x: -0.7, z: 1.2 }, subjectCharacterId: "short", lookTargetCharacterId: "tall", drawnScreenFacing: "screen-left", drawnEyelinePitchDeg: 19 },
      ],
      [tall, short],
      ["tall", "short"],
    );
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(1);
    expect(audit.violations[0]?.kind).toBe("eyeline-pitch-mismatch");
    expect(audit.violations[0]?.cutId).toBe("cut-tall");
    expect(audit.violations[0]?.pitchErrorDeg ?? 0).toBeGreaterThan(DEFAULT_EYELINE_PITCH_TOLERANCE_DEG);
  });

  it("9. 시선 피치 오차가 허용치(15°) 이하이면 위반으로 보고하지 않는다", () => {
    const base = makeCleanDialogueScene();
    const expectedA = computeExpectedEyelinePitchDeg(CHAR_MINSEO, CHAR_HAEUN);
    const scene = makeScene(base.sceneId, base.titleKo, [
      { ...base.cuts[1]!, drawnEyelinePitchDeg: expectedA + 14.9 },
    ]);
    expect(auditSceneEyelineAnd180Rule(scene).totalViolationCount).toBe(0);
  });

  it("10. 사용자 정의 pitchToleranceDeg 옵션을 정확히 반영한다", () => {
    const base = makeCleanDialogueScene();
    const expectedA = computeExpectedEyelinePitchDeg(CHAR_MINSEO, CHAR_HAEUN);
    const scene = makeScene(base.sceneId, base.titleKo, [
      { ...base.cuts[1]!, drawnEyelinePitchDeg: expectedA + 9 },
    ]);
    expect(auditSceneEyelineAnd180Rule(scene, { pitchToleranceDeg: 10 }).totalViolationCount).toBe(0);
    expect(auditSceneEyelineAnd180Rule(scene, { pitchToleranceDeg: 5 }).totalViolationCount).toBe(1);
  });

  it("11. 연속 chase-travel 컷에서 브리지 없이 이동 방향이 뒤집히면 screen-direction-reversal을 적발한다", () => {
    const scene = makeScene("scene-alley-chase", "골목 추격전", [
      { cutId: "chase-1", shotKind: "chase-travel", cameraXZ: { x: -1.5, z: 3.0 }, subjectCharacterId: "char-a", motionDirection: "left-to-right" },
      { cutId: "chase-2-flipped", shotKind: "chase-travel", cameraXZ: { x: 1.5, z: 3.0 }, subjectCharacterId: "char-a", motionDirection: "right-to-left" },
    ]);
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(1);
    expect(audit.violations[0]?.kind).toBe("screen-direction-reversal");
    expect(audit.violations[0]?.severity).toBe("blocker");
    expect(audit.violations[0]?.expectedMotionDirection).toBe("left-to-right");
    expect(audit.violations[0]?.actualMotionDirection).toBe("right-to-left");
  });

  it("12. chase-travel 사이에 neutral-axis-on 브리지가 있으면 이동 방향 전환을 합법으로 승인한다", () => {
    const scene = makeScene("scene-chase-bridge", "추격전 중립 컷 전환", [
      { cutId: "chase-1", shotKind: "chase-travel", cameraXZ: { x: -1.5, z: 3.0 }, subjectCharacterId: "char-a", motionDirection: "left-to-right" },
      { cutId: "chase-2-neutral", shotKind: "neutral-axis-on", cameraXZ: { x: 4.0, z: 0.0 }, subjectCharacterId: "char-a" },
      { cutId: "chase-3-right-to-left", shotKind: "chase-travel", cameraXZ: { x: 1.5, z: -3.0 }, subjectCharacterId: "char-a", motionDirection: "right-to-left" },
    ]);
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(0);
    expect(audit.legalScreenDirectionTransitions).toHaveLength(1);
    expect(audit.legalScreenDirectionTransitions[0]?.fromDirection).toBe("left-to-right");
    expect(audit.legalScreenDirectionTransitions[0]?.toDirection).toBe("right-to-left");
  });

  it("13. 추격 컷 사이에 비브리지 클로즈업만 끼어 있으면 이동 방향 반전을 여전히 적발한다", () => {
    const scene = makeScene("scene-chase-cutaway", "추격전 일반 리액션 컷어웨이", [
      { cutId: "chase-1", shotKind: "chase-travel", cameraXZ: { x: -1.5, z: 3.0 }, subjectCharacterId: "char-a", motionDirection: "left-to-right" },
      { cutId: "cutaway-closeup", shotKind: "closeup", cameraXZ: { x: 0.0, z: 2.5 }, subjectCharacterId: "char-b" },
      { cutId: "chase-2-wrong", shotKind: "chase-travel", cameraXZ: { x: 1.5, z: 3.0 }, subjectCharacterId: "char-a", motionDirection: "right-to-left" },
    ]);
    expect(auditSceneEyelineAnd180Rule(scene).violations.some((v) => v.kind === "screen-direction-reversal")).toBe(true);
  });

  it("14. applySafeCameraBlockingFix는 4종 복합 위반 씬을 자동 교정해 재감사 위반 0건을 달성한다", () => {
    const broken = makeScene("scene-all-4-violations", "복합 연출 오류 교정 테스트", [
      { cutId: "cut-1-anchor", shotKind: "dialogue-ots", cameraXZ: { x: 2.2, z: 1.6 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "screen-right", drawnEyelinePitchDeg: -9.5 },
      { cutId: "cut-2-broken-dialogue", shotKind: "dialogue-ots", cameraXZ: { x: -2.2, z: -1.6 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "screen-right", drawnEyelinePitchDeg: -22.0 },
      { cutId: "cut-3-chase-start", shotKind: "chase-travel", cameraXZ: { x: 0.5, z: 3.2 }, subjectCharacterId: "char-a", motionDirection: "left-to-right" },
      { cutId: "cut-4-chase-broken", shotKind: "chase-travel", cameraXZ: { x: 1.5, z: -3.2 }, subjectCharacterId: "char-a", motionDirection: "right-to-left" },
    ]);
    const fix = applySafeCameraBlockingFix(broken);
    expect(fix.beforeAudit.totalViolationCount).toBeGreaterThanOrEqual(4);
    expect(fix.afterAudit.totalViolationCount).toBe(0);
    expect(fix.afterAudit.passed).toBe(true);
    expect(fix.isFullyResolved).toBe(true);
    expect(fix.fixesApplied).toHaveLength(2);
    expect(fix.beforeFingerprintSha256).not.toBe(fix.afterFingerprintSha256);
    expect(broken.cuts[1]?.cameraXZ.z).toBe(-1.6);
    expect(fix.fixedScene.cuts[1]?.cameraXZ.z).toBeCloseTo(1.6, 8);
    expect(fix.fixedScene.cuts[1]?.drawnScreenFacing).toBe("screen-left");
    expect(fix.fixedScene.cuts[3]?.motionDirection).toBe("left-to-right");
  });

  it("15. 이미 정상인 씬에 applySafeCameraBlockingFix를 적용하면 0건 변경·동일 지문을 유지한다", () => {
    const res = applySafeCameraBlockingFix(makeCleanDialogueScene());
    expect(res.beforeAudit.totalViolationCount).toBe(0);
    expect(res.afterAudit.totalViolationCount).toBe(0);
    expect(res.fixesApplied).toHaveLength(0);
    expect(res.isFullyResolved).toBe(true);
    expect(res.beforeFingerprintSha256).toBe(res.afterFingerprintSha256);
  });

  it("16. 기울어진 임의 3D 액션 축 반사는 A·B까지 유클리드 거리를 1e-9 이내로 보존한다", () => {
    const a = { x: -1.7, z: 0.8 };
    const b = { x: 2.9, z: -3.4 };
    const cam = { x: 3.1, z: 2.5 };
    const reflected = reflectPointAcrossLineXZ(cam, a, b);

    expect(distance2DXZ(reflected, a)).toBeCloseTo(distance2DXZ(cam, a), 10);
    expect(distance2DXZ(reflected, b)).toBeCloseTo(distance2DXZ(cam, b), 10);
    const before = computeSignedAxisDistanceM(a, b, cam);
    const after = computeSignedAxisDistanceM(a, b, reflected);
    expect(after.signedCross).toBeCloseTo(-before.signedCross, 10);
    expect(after.signedDistanceM).toBeCloseTo(-before.signedDistanceM, 10);

    const twice = reflectPointAcrossLineXZ(reflected, a, b);
    expect(twice.x).toBeCloseTo(cam.x, 10);
    expect(twice.z).toBeCloseTo(cam.z, 10);
  });

  it("17. 기울어진 대각선 액션 축 대화 씬에서도 축 침범 적발 및 반사 교정이 정확히 동작한다", () => {
    const diagA: StageCharacterSpec = { characterId: "a", labelKo: "시우", positionXZ: { x: -2.0, z: -1.5 }, eyeHeightM: 1.72 };
    const diagB: StageCharacterSpec = { characterId: "b", labelKo: "지안", positionXZ: { x: 2.5, z: 2.0 }, eyeHeightM: 1.62 };
    const scene = makeScene(
      "scene-diagonal-axis",
      "대각선 복도 대치",
      [
        { cutId: "d-1", shotKind: "dialogue-ots", cameraXZ: { x: 0.0, z: 3.5 }, subjectCharacterId: "a", lookTargetCharacterId: "b", drawnScreenFacing: "screen-right" },
        { cutId: "d-2-crossed", shotKind: "dialogue-ots", cameraXZ: { x: 1.0, z: -3.0 }, subjectCharacterId: "b", lookTargetCharacterId: "a", drawnScreenFacing: "screen-right" },
      ],
      [diagA, diagB],
      ["a", "b"],
    );
    const res = applySafeCameraBlockingFix(scene);
    expect(res.beforeAudit.violations.some((v) => v.kind === "axis-180-crossing")).toBe(true);
    expect(res.afterAudit.totalViolationCount).toBe(0);
    expect(res.fixesApplied[0]?.distanceToAnchorAPreservedErrorM ?? 1).toBeLessThan(1e-9);
    expect(res.fixesApplied[0]?.distanceToAnchorBPreservedErrorM ?? 1).toBeLessThan(1e-9);
  });

  it("18. 3인 대화 무대에서 제3자(진호)를 향한 시선 투영 방향도 정확히 계산한다", () => {
    expect(computeProjectedScreenFacing({ x: 0, z: 3.0 }, CHAR_MINSEO.positionXZ, CHAR_JINHO.positionXZ).facing).toBe("screen-right");
    expect(computeProjectedScreenFacing({ x: 3.0, z: 0.0 }, CHAR_HAEUN.positionXZ, CHAR_JINHO.positionXZ).facing).toBe("screen-right");
  });

  it("19. 180도 반평면 대수 정체성: 양(+) 반평면의 모든 카메라에서 A→B는 screen-right, B→A는 screen-left이다", () => {
    const cams = [{ x: -3.5, z: 0.6 }, { x: -1.0, z: 2.5 }, { x: 0.0, z: 4.0 }, { x: 1.5, z: 1.1 }, { x: 4.0, z: 0.5 }];
    for (let i = 0; i < cams.length; i += 1) {
      const cam = cams[i]!;
      expect(computeProjectedScreenFacing(cam, CHAR_MINSEO.positionXZ, CHAR_HAEUN.positionXZ).facing).toBe("screen-right");
      expect(computeProjectedScreenFacing(cam, CHAR_HAEUN.positionXZ, CHAR_MINSEO.positionXZ).facing).toBe("screen-left");
    }
  });

  it("20. 음(-) 반평면의 모든 카메라에서는 반대로 A→B가 screen-left, B→A가 screen-right이다", () => {
    const cams = [{ x: -3.5, z: -0.6 }, { x: 0.0, z: -4.0 }, { x: 4.0, z: -0.5 }];
    for (let i = 0; i < cams.length; i += 1) {
      const cam = cams[i]!;
      expect(computeProjectedScreenFacing(cam, CHAR_MINSEO.positionXZ, CHAR_HAEUN.positionXZ).facing).toBe("screen-left");
      expect(computeProjectedScreenFacing(cam, CHAR_HAEUN.positionXZ, CHAR_MINSEO.positionXZ).facing).toBe("screen-right");
    }
  });

  it("21. 위반 컷 직후에 다시 정상 반평면으로 돌아온 컷은 오탐 없이 위반 컷만 정확히 격리한다", () => {
    const base = makeCleanDialogueScene();
    const scene = makeScene(base.sceneId, base.titleKo, [
      base.cuts[0]!,
      { cutId: "cut-rogue", shotKind: "closeup", cameraXZ: { x: 0.5, z: -2.0 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a" },
      base.cuts[2]!,
    ]);
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.totalViolationCount).toBe(1);
    expect(audit.violations[0]?.cutId).toBe("cut-rogue");

    const fix = applySafeCameraBlockingFix(scene);
    expect(fix.fixesApplied).toHaveLength(1);
    expect(fix.fixesApplied[0]?.cutId).toBe("cut-rogue");
    expect(fix.afterAudit.totalViolationCount).toBe(0);
  });

  it("22. NIST FIPS 180-4 SHA-256 표준 테스트 벡터 3종이 비트 단위로 일치한다", () => {
    expect(sha256EyelineHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256EyelineHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256EyelineHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("23. computeCameraBlockingSha256Hex는 결정론적이며 -0/0 정규화 및 미세 좌표 변경을 민감하게 감지한다", () => {
    const sceneA = makeCleanDialogueScene();
    const sceneNegZero: DialogueActionSceneSpec = {
      ...sceneA,
      cuts: sceneA.cuts.map((c, i) => (i === 0 ? { ...c, cameraXZ: { x: -0, z: c.cameraXZ.z } } : c)),
    };
    const sceneMoved: DialogueActionSceneSpec = {
      ...sceneA,
      cuts: sceneA.cuts.map((c, i) => (i === 0 ? { ...c, cameraXZ: { x: 0.01, z: c.cameraXZ.z } } : c)),
    };
    const hashA = computeCameraBlockingSha256Hex(sceneA);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).toBe(computeCameraBlockingSha256Hex(sceneNegZero));
    expect(hashA).not.toBe(computeCameraBlockingSha256Hex(sceneMoved));
  });

  it("24. canonicalizeBlockingJson은 키 순서가 달라도 동일한 직렬화 문자열을 생성한다", () => {
    expect(canonicalizeBlockingJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalizeBlockingJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
    expect(canonicalizeBlockingJson({ z: -0, y: Number.NaN })).toBe('{"y":null,"z":0}');
  });

  it("25. 빈 컷 목록 씬을 예외·NaN 없이 안전하게 감사하고 SVG로 렌더링한다", () => {
    const emptyScene = makeScene("scene-empty", "빈 무대", []);
    const audit = auditSceneEyelineAnd180Rule(emptyScene);
    expect(audit.passed).toBe(true);
    expect(audit.totalViolationCount).toBe(0);
    expect(applySafeCameraBlockingFix(emptyScene).isFullyResolved).toBe(true);
    const svg = renderEyeline180StageDiagramSvg(emptyScene, audit);
    expect(svg).toContain("<svg ");
    expect(svg).toContain("배치된 카메라 컷이 없습니다");
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("26. 주연 쌍이 동일 좌표(축 길이 0)여도 0으로 나누지 않고 NaN 없이 안전하게 처리한다", () => {
    const sameA: StageCharacterSpec = { characterId: "same-a", labelKo: "겹친 A", positionXZ: { x: 1, z: 1 }, eyeHeightM: 1.7 };
    const sameB: StageCharacterSpec = { characterId: "same-b", labelKo: "겹친 B", positionXZ: { x: 1, z: 1 }, eyeHeightM: 1.7 };
    const scene = makeScene(
      "scene-degenerate-axis",
      "동일 좌표 축 예외",
      [{ cutId: "c1", shotKind: "dialogue-ots", cameraXZ: { x: 1, z: 1 }, subjectCharacterId: "same-a", lookTargetCharacterId: "same-b", drawnEyelinePitchDeg: 0, drawnScreenFacing: "front" }],
      [sameA, sameB],
      ["same-a", "same-b"],
    );
    const audit = auditSceneEyelineAnd180Rule(scene);
    expect(audit.axisSummary.isAxisValid).toBe(false);
    expect(audit.axisSummary.axisLengthM).toBe(0);
    expect(computeExpectedEyelinePitchDeg(sameA, sameB)).toBe(0);
    expect(reflectPointAcrossLineXZ({ x: 3, z: 4 }, sameA.positionXZ, sameB.positionXZ)).toEqual({ x: 3, z: 4 });
    expect(renderEyeline180StageDiagramSvg(scene, audit)).not.toMatch(/NaN|Infinity/);
  });

  it("27. 탑다운 SVG는 순수 oklch(...)만 사용하고 원시 hex/rgb/rgba/hsl 색상과 NaN/Infinity가 0건이다", () => {
    const base = makeCleanDialogueScene();
    const crossed = makeScene(base.sceneId, base.titleKo, [
      ...base.cuts,
      { cutId: "cut-4-alert", shotKind: "dialogue-ots", cameraXZ: { x: 0.2, z: -2.2 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "screen-right" },
    ]);
    const svg = renderEyeline180StageDiagramSvg(crossed, auditSceneEyelineAnd180Rule(crossed));
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("180° 액션 축");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("28. SVG 출력은 제목·캐릭터명·컷 ID의 XML 특수문자(<, >, &, \", ')를 모두 이스케이프해 XSS를 차단한다", () => {
    const xssScene = makeScene(
      'sc<1>&"test"',
      `<script>alert('xss')</script> & "대치"`,
      [{ cutId: `cut<"1">&'a'`, shotKind: "dialogue-ots", cameraXZ: { x: 1.5, z: 2.0 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b" }],
      [{ ...CHAR_MINSEO, labelKo: `민서<A&"1">` }, { ...CHAR_HAEUN, labelKo: `하은'B'` }],
    );
    const svg = renderEyeline180StageDiagramSvg(xssScene, auditSceneEyelineAnd180Rule(xssScene));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;");
    expect(svg).toContain("민서&lt;A&amp;&quot;1&quot;&gt;");
    expect(svg).toContain("하은&apos;B&apos;");
    expect(svg).toContain("cut&lt;&quot;1&quot;&gt;&amp;&apos;a&apos;");
  });

  it("29. summarizeEyeline180AuditKo는 번역투 없는 자연스러운 한국어 연출 감독 브리프를 생성한다", () => {
    const base = makeCleanDialogueScene();
    const scene = makeScene(base.sceneId, base.titleKo, [
      base.cuts[0]!,
      { cutId: "cut-bridge", shotKind: "neutral-axis-on", cameraXZ: { x: 3.0, z: 0.0 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "front" },
      { cutId: "cut-new-side", shotKind: "dialogue-ots", cameraXZ: { x: -2.0, z: -1.6 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "screen-left", drawnEyelinePitchDeg: -12 },
    ]);
    const brief = summarizeEyeline180AuditKo(scene, auditSceneEyelineAnd180Rule(scene));
    expect(brief).toContain("[180° 액션 축 · 시선 매치 연출 점검]");
    expect(brief).toContain("승인된 합법 축 전환");
    expect(brief).toContain("연출 감독 수정 권고");
    expect(brief).not.toContain("하는 것을 가능하게");
    expect(brief).not.toContain("직관적인 경험을 제공");
    expect(brief).not.toContain("원활한 워크플로우");
    expect(brief).not.toContain("성공적으로 수행되었습니다");
  });

  it("30. 헬퍼 유틸리티(cross2DXZ, isLegalAxisBridgeShot, LEGAL_AXIS_BRIDGE_SHOT_KINDS) 계약이 정확하다", () => {
    expect(cross2DXZ({ x: 2, z: 0 }, { x: 0, z: 3 })).toBe(6);
    expect(cross2DXZ({ x: 2, z: 0 }, { x: 0, z: -3 })).toBe(-6);
    expect(LEGAL_AXIS_BRIDGE_SHOT_KINDS).toEqual(["neutral-axis-on", "top-down-establishing", "camera-dolly-bridge"]);
    expect(isLegalAxisBridgeShot("neutral-axis-on")).toBe(true);
    expect(isLegalAxisBridgeShot("top-down-establishing")).toBe(true);
    expect(isLegalAxisBridgeShot("camera-dolly-bridge")).toBe(true);
    expect(isLegalAxisBridgeShot("dialogue-ots")).toBe(false);
    expect(isLegalAxisBridgeShot("chase-travel")).toBe(false);
  });

  it("31. 비유한(NaN/Infinity) 카메라 좌표나 피치 입력이 들어와도 크래시 없이 유한 값으로 방어한다", () => {
    const dirtyScene = makeScene("scene-nonfinite-guard", "비유한 입력 방어", [
      { cutId: "cut-dirty", shotKind: "dialogue-ots", cameraXZ: { x: Number.NaN, z: Number.POSITIVE_INFINITY }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnEyelinePitchDeg: Number.NaN },
    ]);
    const audit = auditSceneEyelineAnd180Rule(dirtyScene);
    expect(Number.isFinite(audit.continuityScore)).toBe(true);
    expect(audit.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(renderEyeline180StageDiagramSvg(dirtyScene, audit)).not.toMatch(/NaN|Infinity/);
  });

  it("32. 연속 다중 위반 컷(2개 연속 축 침범)을 한 번의 applySafeCameraBlockingFix 호출로 모두 해소한다", () => {
    const base = makeCleanDialogueScene();
    const multiCross = makeScene(base.sceneId, base.titleKo, [
      base.cuts[1]!,
      { cutId: "cross-a", shotKind: "dialogue-ots", cameraXZ: { x: -2.0, z: -1.5 }, subjectCharacterId: "char-b", lookTargetCharacterId: "char-a", drawnScreenFacing: "screen-right" },
      { cutId: "cross-b", shotKind: "closeup", cameraXZ: { x: 2.0, z: -1.5 }, subjectCharacterId: "char-a", lookTargetCharacterId: "char-b", drawnScreenFacing: "screen-left" },
    ]);
    const fix = applySafeCameraBlockingFix(multiCross);
    expect(fix.beforeAudit.blockerCount).toBe(4);
    expect(fix.fixesApplied).toHaveLength(2);
    expect(fix.afterAudit.totalViolationCount).toBe(0);
    expect(fix.isFullyResolved).toBe(true);
  });
});
