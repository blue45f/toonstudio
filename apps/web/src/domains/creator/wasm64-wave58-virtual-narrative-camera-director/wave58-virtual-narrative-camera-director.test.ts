import { describe, expect, it } from "vitest";

import {
  GOLDEN_SPIRAL_ANCHORS,
  MAX_SAFE_DUTCH_ROLL_DEG,
  NARRATIVE_SHOT_GRAMMARS,
  RULE_OF_THIRDS_ANCHORS,
  SHOT_GRAMMAR_PRESETS,
  auditSequenceCameraContinuity,
  computeCameraFovDegrees,
  evaluateCameraEasing,
  evaluateFramingCompositionScore,
  generateCameraWorkingKeyframes,
  projectWorldPointToScreen,
  recommendNarrativeShotPlan,
  solveVirtualCameraRig,
  type NormalizedRect2D,
  type SequenceCutCameraNode,
  type SubjectFramingTarget,
  type Vec3,
} from "./index";

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

function makeCharacterTarget(
  id: string,
  x: number,
  z: number,
  gazeDirection: Vec3 = { x: 0.8, y: 0, z: 0.6 },
  heightMeters = 1.72,
): SubjectFramingTarget {
  return {
    bounds: {
      max: { x: x + 0.28, y: heightMeters, z: z + 0.22 },
      min: { x: x - 0.28, y: 0, z: z - 0.22 },
    },
    gazeDirection,
    id,
  };
}

function makeCutNode(
  cutId: string,
  shotGrammar: SequenceCutCameraNode["shotGrammar"],
  cameraPosition: Vec3,
  cameraTarget: Vec3,
  focalLengthMm: number,
  overrides: Partial<SequenceCutCameraNode> = {},
): SequenceCutCameraNode {
  return {
    cameraPosition,
    cameraTarget,
    cutId,
    focalLengthMm,
    primarySubjectId: "hero",
    primarySubjectPosition: ORIGIN,
    shotGrammar,
    ...overrides,
  };
}

describe("wasm64-wave58-virtual-narrative-camera-director", () => {
  describe("narrative-beat-shot-classifier", () => {
    it("장면 도입부 차분한 서사 비트에서 전경 확립 샷(establishing-wide)과 광각 초점거리를 추천한다", () => {
      const plan = recommendNarrativeShotPlan({
        cutId: "cut-open-1", cutImportance: 0.4, dialogueCharCount: 24,
        emotion: "calm", emotionIntensity: 0.45, isSceneOpening: true,
        listener: { id: "mentor", position: { x: 4.8, y: 0, z: 0 } },
        speaker: { gazeDirection: { x: 1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      expect(plan.shotGrammar).toBe("establishing-wide");
      expect(plan.focalLengthMm).toBeGreaterThanOrEqual(18);
      expect(plan.focalLengthMm).toBeLessThanOrEqual(28);
      expect(plan.verticalFovDeg).toBeGreaterThan(45);
      expect(plan.candidates).toHaveLength(NARRATIVE_SHOT_GRAMMARS.length);
      expect(plan.confidence).toBeGreaterThan(0.5);
    });

    it("전경 확립 이후 대화 거리의 2인 차분한 비트에서는 미디엄 투샷(medium-two-shot)을 선택한다", () => {
      const plan = recommendNarrativeShotPlan({
        cutId: "cut-dialogue-2", cutImportance: 0.5, dialogueCharCount: 8, emotion: "calm", emotionIntensity: 0.5,
        listener: { id: "partner", position: { x: 2.4, y: 0, z: 0 } },
        previousShotGrammar: "establishing-wide",
        speaker: { gazeDirection: { x: 1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      expect(plan.shotGrammar).toBe("medium-two-shot");
      expect(plan.focalLengthMm).toBeGreaterThanOrEqual(32);
      expect(plan.focalLengthMm).toBeLessThanOrEqual(50);
    });

    it("미디엄 투샷 직후 대사 비중이 큰 2인 대치에서는 오버 더 숄더(over-the-shoulder)를 선택한다", () => {
      const plan = recommendNarrativeShotPlan({
        cutId: "cut-ots-3", cutImportance: 0.62, dialogueCharCount: 42, emotion: "curious", emotionIntensity: 0.6,
        listener: { id: "rival", position: { x: 1.9, y: 0, z: 0.2 } },
        previousShotGrammar: "medium-two-shot",
        speaker: { gazeDirection: { x: 1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      expect(plan.shotGrammar).toBe("over-the-shoulder");
      expect(plan.focalLengthMm).toBeGreaterThanOrEqual(48);
      expect(plan.focalLengthMm).toBeLessThanOrEqual(75);
    });

    it("영웅적 승리감과 고속 액션 또는 고지대 우위에서는 드라마틱 로우 앵글을 선택한다", () => {
      const plan = recommendNarrativeShotPlan({
        actionVelocity: { x: 3.6, y: 1.4, z: 0.8 }, cutId: "cut-hero-low-4", cutImportance: 0.85,
        emotion: "triumph", emotionIntensity: 0.9,
        listener: { id: "boss", position: { x: 2.2, y: 0, z: 0 } },
        speaker: { gazeDirection: { x: 1, y: -0.2, z: 0 }, id: "hero", position: { x: 0, y: 0.6, z: 0 } },
      });
      expect(plan.shotGrammar).toBe("dramatic-low-angle");
      expect(plan.recommendedElevationDeg).toBeLessThan(-10);
      expect(plan.recommendedDutchRollDeg).toBe(0);
    });

    it("강한 불안·공포 긴장 비트에서는 더치 틸트 긴장 샷(dutch-tension)과 ±22° 이내 틸트를 산출한다", () => {
      const plan = recommendNarrativeShotPlan({
        actionVelocity: { x: -2.2, y: 0, z: 1.1 }, cutId: "cut-tension-5", cutImportance: 0.74,
        emotion: "fear", emotionIntensity: 0.92,
        speaker: { gazeDirection: { x: -1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      expect(plan.shotGrammar).toBe("dutch-tension");
      expect(Math.abs(plan.recommendedDutchRollDeg)).toBeGreaterThan(5);
      expect(Math.abs(plan.recommendedDutchRollDeg)).toBeLessThanOrEqual(MAX_SAFE_DUTCH_ROLL_DEG);
    });

    it("정지된 클라이맥스 충격 비트에서는 익스트림 클로즈업과 망원 초점거리를 선택한다", () => {
      const plan = recommendNarrativeShotPlan({
        actionVelocity: { x: 0.1, y: 0, z: 0 }, cutId: "cut-shock-ecu-6", cutImportance: 0.96,
        emotion: "shock", emotionIntensity: 0.95, previousShotGrammar: "over-the-shoulder",
        speaker: { gazeDirection: { x: 0, y: 0, z: 1 }, id: "hero", position: ORIGIN },
      });
      expect(plan.shotGrammar).toBe("extreme-closeup");
      expect(plan.focalLengthMm).toBeGreaterThanOrEqual(82);
      expect(plan.verticalFovDeg).toBeLessThan(20);
    });

    it("공간 배치·지형 전개 리빌 비트에서는 버즈아이 조감 리빌(birds-eye-reveal)을 선택한다", () => {
      const plan = recommendNarrativeShotPlan({
        cutId: "cut-birds-eye-7", cutImportance: 0.78, emotion: "mystery", emotionIntensity: 0.72,
        isSpatialReveal: true, listener: { id: "squad", position: { x: 8.5, y: 0, z: 3.0 } },
        speaker: { id: "hero", position: ORIGIN },
      });
      expect(plan.shotGrammar).toBe("birds-eye-reveal");
      expect(plan.recommendedElevationDeg).toBeGreaterThanOrEqual(52);
    });

    it("동일 샷 연속 반복 시 감점이 누적되어 자연스럽게 대비 샷으로 전환된다", () => {
      const base = {
        cutImportance: 0.62, dialogueCharCount: 30, emotion: "curious" as const, emotionIntensity: 0.6,
        listener: { id: "partner", position: { x: 2.0, y: 0, z: 0 } },
        speaker: { id: "hero", position: ORIGIN },
      };
      const first = recommendNarrativeShotPlan({ ...base, cutId: "cut-rhythm-1", previousShotGrammar: "medium-two-shot" });
      const repeated = recommendNarrativeShotPlan({
        ...base, consecutiveSameShotCount: 3, cutId: "cut-rhythm-2", previousShotGrammar: first.shotGrammar,
      });
      expect(first.shotGrammar).toBe("over-the-shoulder");
      expect(repeated.shotGrammar).not.toBe(first.shotGrammar);
    });

    it("세로 웹툰 비율과 대사 분량에 맞춰 말풍선 네거티브 스페이스 영역과 면적 비율을 확장한다", () => {
      const shortDialogue = recommendNarrativeShotPlan({
        aspectRatio: 16 / 9, cutId: "cut-short-text", cutImportance: 0.5, dialogueCharCount: 6, emotion: "calm",
        speaker: { gazeDirection: { x: 1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      const longWebtoon = recommendNarrativeShotPlan({
        aspectRatio: 0.62, cutId: "cut-webtoon-long", cutImportance: 0.5, dialogueCharCount: 110, dialogueCount: 2, emotion: "calm",
        speaker: { gazeDirection: { x: 1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      expect(shortDialogue.negativeSpace.preferredZone).toBe("top-right");
      expect(shortDialogue.negativeSpace.subjectAnchorHint).toBe("left-third");
      expect(longWebtoon.negativeSpace.preferredZone).toBe("upper-band");
      expect(longWebtoon.negativeSpace.recommendedAreaRatio).toBeGreaterThan(shortDialogue.negativeSpace.recommendedAreaRatio);
    });

    it("초점거리가 길어질수록 수직·수평·대각 화각(FOV)이 단조 감소한다", () => {
      const wide = computeCameraFovDegrees(24, 16 / 9);
      const standard = computeCameraFovDegrees(50, 16 / 9);
      const tele = computeCameraFovDegrees(105, 16 / 9);
      expect(wide.verticalFovDeg).toBeGreaterThan(standard.verticalFovDeg);
      expect(standard.verticalFovDeg).toBeGreaterThan(tele.verticalFovDeg);
      expect(wide.horizontalFovDeg).toBeGreaterThan(wide.verticalFovDeg);
      expect(wide.diagonalFovDeg).toBeGreaterThan(wide.horizontalFovDeg);
    });
  });

  describe("virtual-camera-framing-solver", () => {
    it("피사체 얼굴 중심을 삼분할(Rule of Thirds) 교점에 정밀 투영 정렬한다", () => {
      const hero = makeCharacterTarget("hero", 0, 0, { x: 1, y: 0, z: 0.2 });
      const rig = solveVirtualCameraRig({ compositionMode: "rule-of-thirds", shotGrammar: "dramatic-low-angle", subject: hero });
      const minDist = Math.min(...RULE_OF_THIRDS_ANCHORS.map((a) => Math.hypot(rig.projectedFaceCenter.x - a.x, rig.projectedFaceCenter.y - a.y)));
      expect(minDist).toBeLessThan(0.015);

      const directProj = projectWorldPointToScreen(
        { x: 0, y: 1.72 * 0.85, z: 0 }, rig.cameraPosition, rig.cameraTarget, rig.verticalFovDeg, rig.aspectRatio, rig.dutchRollDeg,
      );
      expect(directProj.inFrontOfCamera).toBe(true);
      expect(Math.abs(directProj.u - rig.projectedFaceCenter.x)).toBeLessThan(0.01);
      expect(Math.abs(directProj.v - rig.projectedFaceCenter.y)).toBeLessThan(0.01);
    });

    it("황금나선(Golden Spiral) 모드에서는 황금비 초점 교점에 피사체를 정렬한다", () => {
      const hero = makeCharacterTarget("hero", 1.2, -0.5, { x: -1, y: 0, z: 0.3 });
      const rig = solveVirtualCameraRig({ compositionMode: "golden-spiral", shotGrammar: "over-the-shoulder", subject: hero });
      const minDist = Math.min(...GOLDEN_SPIRAL_ANCHORS.map((a) => Math.hypot(rig.projectedFaceCenter.x - a.x, rig.projectedFaceCenter.y - a.y)));
      expect(minDist).toBeLessThan(0.015);
    });

    it("더치 틸트 입력이 ±22°를 초과하면 안전 상한(±22°)으로 강제 클램핑하고 플래그를 기록한다", () => {
      const hero = makeCharacterTarget("hero", 0, 0);
      const posOver = solveVirtualCameraRig({ dutchRollDeg: 45, shotGrammar: "dutch-tension", subject: hero });
      const negOver = solveVirtualCameraRig({ dutchRollDeg: -37, shotGrammar: "dutch-tension", subject: hero });
      expect(posOver.dutchRollDeg).toBe(MAX_SAFE_DUTCH_ROLL_DEG);
      expect(posOver.dutchRollWasClamped).toBe(true);
      expect(negOver.dutchRollDeg).toBe(-MAX_SAFE_DUTCH_ROLL_DEG);
      expect(negOver.dutchRollWasClamped).toBe(true);
      expect(Math.hypot(posOver.cameraUp.x, posOver.cameraUp.y, posOver.cameraUp.z)).toBeCloseTo(1, 3);
    });

    it("말풍선 안전 영역이 초기 얼굴 위치와 겹칠 때 프레이밍을 보정해 겹침을 0으로 해소한다", () => {
      const hero = makeCharacterTarget("hero", 0, 0, { x: 1, y: 0, z: 0.2 });
      const topLeftBalloon: NormalizedRect2D = { height: 0.42, width: 0.46, x: 0.04, y: 0.04 };
      const rig = solveVirtualCameraRig({
        balloonSafeZones: [topLeftBalloon], preferredCompositionPoint: { x: 1 / 3, y: 1 / 3 },
        shotGrammar: "medium-two-shot", subject: hero,
      });
      expect(rig.balloonAvoidanceApplied).toBe(true);
      expect(rig.balloonFaceOverlapRatio).toBe(0);
      expect(rig.minBalloonClearance).toBeGreaterThan(0);
    });

    it("세로 웹툰 상단 전체를 덮는 넓은 말풍선 띠에서도 얼굴을 하단 안전 영역으로 회피시킨다", () => {
      const hero = makeCharacterTarget("hero", 0, 0);
      const upperBand: NormalizedRect2D = { height: 0.44, width: 0.92, x: 0.04, y: 0.03 };
      const rig = solveVirtualCameraRig({
        aspectRatio: 0.65, balloonSafeZones: [upperBand], shotGrammar: "over-the-shoulder", subject: hero,
      });
      expect(rig.balloonAvoidanceApplied).toBe(true);
      expect(rig.balloonFaceOverlapRatio).toBe(0);
      expect(rig.projectedFaceRect.y).toBeGreaterThanOrEqual(upperBand.y + upperBand.height - 1e-4);
    });

    it("얇은 렌즈 피사계 심도(DoF)가 조리개 개방과 망원 렌즈일수록 얕아지고 근거리<초점<원거리 부등식을 만족한다", () => {
      const hero = makeCharacterTarget("hero", 0, 0);
      const shallowEcu = solveVirtualCameraRig({ apertureFStop: 1.8, focalLengthMm: 90, shotGrammar: "extreme-closeup", subject: hero });
      const deepWide = solveVirtualCameraRig({ apertureFStop: 8.0, focalLengthMm: 24, shotGrammar: "establishing-wide", subject: hero });
      expect(shallowEcu.depthOfField.nearFocusMeters).toBeLessThan(shallowEcu.depthOfField.focusDistanceMeters);
      expect(shallowEcu.depthOfField.farFocusMeters).toBeGreaterThan(shallowEcu.depthOfField.focusDistanceMeters);
      expect(shallowEcu.depthOfField.totalDepthOfFieldMeters).toBeLessThan(deepWide.depthOfField.totalDepthOfFieldMeters);
    });

    it("구도 품질 채점기가 삼분할 정렬·말풍선 회피된 리깅에는 높은 점수를, 겹침·초과 틸트 리깅에는 낮은 점수를 부여한다", () => {
      const hero = makeCharacterTarget("hero", 0, 0, { x: 1, y: 0, z: 0.2 });
      const balloon: NormalizedRect2D = { height: 0.3, width: 0.34, x: 0.6, y: 0.05 };
      const goodRig = solveVirtualCameraRig({ balloonSafeZones: [balloon], shotGrammar: "medium-two-shot", subject: hero });
      const goodScore = evaluateFramingCompositionScore(goodRig, { balloonSafeZones: [balloon], subjectGazeDirection: hero.gazeDirection });
      const badScore = evaluateFramingCompositionScore(
        { ...goodRig, dutchRollDeg: 35, projectedFaceCenter: { x: 0.74, y: 0.16 }, projectedFaceRect: { height: 0.18, width: 0.14, x: 0.67, y: 0.07 } },
        { balloonSafeZones: [balloon], subjectGazeDirection: hero.gazeDirection },
      );
      expect(goodScore.overallScore).toBeGreaterThanOrEqual(82);
      expect(["S", "A"]).toContain(goodScore.grade);
      expect(goodScore.issuesKo).toHaveLength(0);
      expect(badScore.overallScore).toBeLessThan(goodScore.overallScore - 25);
      expect(badScore.balloonClearanceScore).toBeLessThan(0.5);
      expect(badScore.dutchSafetyScore).toBeLessThan(0.5);
      expect(badScore.issuesKo.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("continuity-180-rule-auditor", () => {
    it("2인 리버스 샷 시퀀스에서 180도 시선 축 위반을 적발하고 반대측 대칭 보정으로 복구한다", () => {
      const villainPos: Vec3 = { x: 3, y: 0, z: 0 };
      const cuts: readonly SequenceCutCameraNode[] = [
        makeCutNode("cut-1-master", "medium-two-shot", { x: 1.5, y: 1.5, z: 3.2 }, { x: 1.5, y: 1.4, z: 0 }, 38, {
          secondarySubjectId: "villain", secondarySubjectPosition: villainPos,
        }),
        makeCutNode("cut-2-reverse-bad", "over-the-shoulder", { x: 3.4, y: 1.55, z: -2.4 }, { x: 0, y: 1.45, z: 0 }, 55, {
          dutchRollDeg: 8, primarySubjectId: "villain", primarySubjectPosition: villainPos,
          secondarySubjectId: "hero", secondarySubjectPosition: ORIGIN,
        }),
      ];

      const audit = auditSequenceCameraContinuity(cuts);
      expect(audit.passed).toBe(false);
      expect(audit.axisCrossingCount).toBe(1);
      expect(audit.violations[0].kind).toBe("axis-180-crossing");
      expect(audit.correctedCuts[1].cameraPosition.z).toBeCloseTo(2.4, 3);
      expect(audit.correctedCuts[1].dutchRollDeg).toBe(-8);
      expect(audit.correctedCuts[1].axisSideSign).toBe(audit.establishedAxisSideSign);

      const reAudit = auditSequenceCameraContinuity(audit.correctedCuts);
      expect(reAudit.axisCrossingCount).toBe(0);
      expect(reAudit.passed).toBe(true);
    });

    it("의도적 축 재설정(isIntentionalAxisReset) 컷은 180도 위반으로 오탐하지 않는다", () => {
      const villainPos: Vec3 = { x: 3, y: 0, z: 0 };
      const cuts: readonly SequenceCutCameraNode[] = [
        makeCutNode("cut-1", "medium-two-shot", { x: 1.5, y: 1.5, z: 3.0 }, { x: 1.5, y: 1.4, z: 0 }, 38, {
          secondarySubjectId: "villain", secondarySubjectPosition: villainPos,
        }),
        makeCutNode("cut-2-reset", "establishing-wide", { x: 1.5, y: 2.2, z: -3.6 }, { x: 1.5, y: 1.2, z: 0 }, 24, {
          isIntentionalAxisReset: true, secondarySubjectId: "villain", secondarySubjectPosition: villainPos,
        }),
      ];
      const audit = auditSequenceCameraContinuity(cuts);
      expect(audit.axisCrossingCount).toBe(0);
      expect(audit.passed).toBe(true);
    });

    it("각도 변화 30° 미만이고 프레임 크기가 유사한 연속 컷을 점프컷으로 진단하고 안전 측면으로 교정한다", () => {
      const villainPos: Vec3 = { x: 3.2, y: 0, z: 0 };
      const cuts: readonly SequenceCutCameraNode[] = [
        makeCutNode("cut-a", "over-the-shoulder", { x: 0, y: 1.5, z: 3.0 }, { x: 0, y: 1.45, z: 0 }, 50, {
          secondarySubjectId: "villain", secondarySubjectPosition: villainPos,
        }),
        makeCutNode("cut-b-jumpcut", "over-the-shoulder", { x: 0.45, y: 1.5, z: 2.95 }, { x: 0, y: 1.45, z: 0 }, 52, {
          secondarySubjectId: "villain", secondarySubjectPosition: villainPos,
        }),
      ];

      const audit = auditSequenceCameraContinuity(cuts);
      expect(audit.jumpCutCount).toBe(1);
      expect(audit.violations[0].kind).toBe("jump-cut-angle-size");
      expect(audit.violations[0].angleDeltaDeg).toBeLessThan(30);

      const reAudit = auditSequenceCameraContinuity(audit.correctedCuts);
      expect(reAudit.jumpCutCount).toBe(0);
      expect(reAudit.axisCrossingCount).toBe(0);
      expect(reAudit.passed).toBe(true);
    });

    it("동일 샷 문법이 3회 이상 연속 반복되면 단조 반복 경고를 기록하고 대비 샷 문법으로 교정한다", () => {
      const villainPos: Vec3 = { x: 3.0, y: 0, z: 0 };
      const cuts: readonly SequenceCutCameraNode[] = [
        makeCutNode("cut-1", "medium-two-shot", { x: -1.8, y: 1.5, z: 2.6 }, { x: 1.5, y: 1.4, z: 0 }, 38, {
          secondarySubjectId: "villain", secondarySubjectPosition: villainPos,
        }),
        makeCutNode("cut-2", "medium-two-shot", { x: 1.5, y: 1.5, z: 3.2 }, { x: 1.5, y: 1.4, z: 0 }, 38, {
          primarySubjectId: "villain", primarySubjectPosition: villainPos, secondarySubjectId: "hero", secondarySubjectPosition: ORIGIN,
        }),
        makeCutNode("cut-3-monotone", "medium-two-shot", { x: 4.5, y: 1.5, z: 2.5 }, { x: 1.5, y: 1.4, z: 0 }, 38, {
          secondarySubjectId: "villain", secondarySubjectPosition: villainPos,
        }),
      ];
      const audit = auditSequenceCameraContinuity(cuts);
      expect(audit.monotonousRepetitionCount).toBe(1);
      expect(audit.violations.find((v) => v.kind === "monotonous-shot-repetition")?.suggestedShotGrammar).toBe("over-the-shoulder");
      expect(audit.correctedCuts[2].shotGrammar).toBe("over-the-shoulder");
      expect(audit.correctedCuts[2].focalLengthMm).toBe(SHOT_GRAMMAR_PRESETS["over-the-shoulder"].defaultFocalLengthMm);
    });

    it("돌리/패닝 키프레임 트랙이 엄격한 시간 단조성과 부드러운 cubic-in-out 속도 곡선을 보장한다", () => {
      const cuts: readonly SequenceCutCameraNode[] = [
        makeCutNode("cut-pan", "establishing-wide", { x: 0, y: 1.6, z: 5.0 }, { x: 0, y: 1.4, z: 0 }, 24, { durationSec: 2.4 }),
        makeCutNode("cut-dolly", "extreme-closeup", { x: 1.4, y: 1.5, z: 2.6 }, { x: 0, y: 1.45, z: 0 }, 85, { durationSec: 1.6 }),
      ];
      const track = generateCameraWorkingKeyframes(cuts, { easing: "cubic-in-out", fps: 60, samplesPerCut: 9 });
      expect(track.isStrictlyMonotonicTime).toBe(true);
      expect(track.keyframes).toHaveLength(18);
      for (let i = 1; i < track.keyframes.length; i += 1) {
        expect(track.keyframes[i].timeSec).toBeGreaterThan(track.keyframes[i - 1].timeSec);
      }

      const cut1 = track.keyframes.slice(0, 9);
      expect(cut1[4].instantaneousSpeedMps).toBeGreaterThan(cut1[1].instantaneousSpeedMps);
      expect(cut1[4].instantaneousSpeedMps).toBeGreaterThan(cut1[8].instantaneousSpeedMps);

      const cut2 = track.keyframes.slice(9);
      const dist = (kf: (typeof cut2)[number]): number =>
        Math.hypot(kf.position.x - kf.target.x, kf.position.y - kf.target.y, kf.position.z - kf.target.z);
      expect(dist(cut2[8])).toBeLessThan(dist(cut2[0]));
      expect(cut2[8].focalLengthMm).toBeGreaterThan(cut2[0].focalLengthMm);
    });

    it("이징 함수가 모든 모드에서 [0, 1] 경계 조건과 단조 증가를 만족한다", () => {
      for (const mode of ["linear", "sine-in-out", "cubic-in-out", "quintic-in-out"] as const) {
        expect(evaluateCameraEasing(0, mode)).toBeCloseTo(0, 6);
        expect(evaluateCameraEasing(0.5, mode)).toBeCloseTo(0.5, 6);
        expect(evaluateCameraEasing(1, mode)).toBeCloseTo(1, 6);
        let prev = -1;
        for (let step = 0; step <= 10; step += 1) {
          const val = evaluateCameraEasing(step / 10, mode);
          expect(val).toBeGreaterThanOrEqual(prev);
          prev = val;
        }
      }
    });

    it("prefersReducedMotion 활성화 시 모든 컷의 카메라 모션이 정지(static-hold) 자세로 고정된다", () => {
      const track = generateCameraWorkingKeyframes(
        [makeCutNode("cut-rm-1", "dutch-tension", { x: 0, y: 1.6, z: 4.0 }, { x: 0, y: 1.4, z: 0 }, 35, { dutchRollDeg: 10 })],
        { prefersReducedMotion: true, samplesPerCut: 5 },
      );
      expect(track.prefersReducedMotion).toBe(true);
      expect(track.cutSegments[0].motionStyle).toBe("static-hold");
      for (const kf of track.keyframes) {
        expect(kf.position).toEqual({ x: 0, y: 1.6, z: 4.0 });
        expect(kf.dutchRollDeg).toBe(10);
        expect(kf.instantaneousSpeedMps).toBe(0);
      }
    });

    it("전체 엔드투엔드 파이프라인(분류 → 프레이밍 솔빙 → 연속성 감사 → 키프레임 생성)이 일관되게 연동된다", () => {
      const heroTarget = makeCharacterTarget("hero", 0, 0, { x: 1, y: 0, z: 0.1 });
      const rivalTarget = makeCharacterTarget("rival", 2.4, 0, { x: -1, y: 0, z: 0.1 });
      const rivalPos: Vec3 = { x: 2.4, y: 0, z: 0 };

      const plan1 = recommendNarrativeShotPlan({
        cutId: "seq-1", cutImportance: 0.45, dialogueCharCount: 16, emotion: "calm", isSceneOpening: true,
        listener: { id: "rival", position: rivalPos }, speaker: { gazeDirection: { x: 1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      const plan2 = recommendNarrativeShotPlan({
        cutId: "seq-2", cutImportance: 0.65, dialogueCharCount: 32, emotion: "curious",
        listener: { id: "rival", position: rivalPos }, previousShotGrammar: plan1.shotGrammar,
        speaker: { gazeDirection: { x: 1, y: 0, z: 0 }, id: "hero", position: ORIGIN },
      });
      const plan3 = recommendNarrativeShotPlan({
        cutId: "seq-3", cutImportance: 0.94, dialogueCharCount: 14, emotion: "shock", emotionIntensity: 0.95,
        listener: { id: "hero", position: ORIGIN }, previousShotGrammar: plan2.shotGrammar,
        speaker: { gazeDirection: { x: -1, y: 0, z: 0 }, id: "rival", position: rivalPos },
      });

      const rig1 = solveVirtualCameraRig({ cameraSideSign: 1, secondarySubject: rivalTarget, shotGrammar: plan1.shotGrammar, shotPlan: plan1, subject: heroTarget });
      const rig2 = solveVirtualCameraRig({ cameraSideSign: 1, secondarySubject: rivalTarget, shotGrammar: plan2.shotGrammar, shotPlan: plan2, subject: heroTarget });
      const rig3 = solveVirtualCameraRig({ cameraSideSign: 1, secondarySubject: heroTarget, shotGrammar: plan3.shotGrammar, shotPlan: plan3, subject: rivalTarget });

      const seqNodes: readonly SequenceCutCameraNode[] = [
        makeCutNode(plan1.cutId, plan1.shotGrammar, rig1.cameraPosition, rig1.cameraTarget, rig1.focalLengthMm, {
          cameraUp: rig1.cameraUp, dutchRollDeg: rig1.dutchRollDeg, secondarySubjectId: "rival", secondarySubjectPosition: rivalPos,
        }),
        makeCutNode(plan2.cutId, plan2.shotGrammar, rig2.cameraPosition, rig2.cameraTarget, rig2.focalLengthMm, {
          cameraUp: rig2.cameraUp, dutchRollDeg: rig2.dutchRollDeg, secondarySubjectId: "rival", secondarySubjectPosition: rivalPos,
        }),
        makeCutNode(plan3.cutId, plan3.shotGrammar, rig3.cameraPosition, rig3.cameraTarget, rig3.focalLengthMm, {
          cameraUp: rig3.cameraUp, dutchRollDeg: rig3.dutchRollDeg,
          primarySubjectId: "rival", primarySubjectPosition: rivalPos, secondarySubjectId: "hero", secondarySubjectPosition: ORIGIN,
        }),
      ];

      const audit = auditSequenceCameraContinuity(seqNodes);
      const reAudit = auditSequenceCameraContinuity(audit.correctedCuts);
      const track = generateCameraWorkingKeyframes(audit.correctedCuts, { samplesPerCut: 5 });
      expect(reAudit.passed).toBe(true);
      expect(reAudit.continuityScore).toBe(100);
      expect(track.isStrictlyMonotonicTime).toBe(true);
      expect(track.keyframes).toHaveLength(15);
      for (const kf of track.keyframes) {
        expect(Math.abs(kf.dutchRollDeg)).toBeLessThanOrEqual(MAX_SAFE_DUTCH_ROLL_DEG);
      }
    });
  });
});
