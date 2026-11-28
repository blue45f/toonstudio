/**
 * Wave 125 — 3D 스테이지 180도 액션 축(Line-of-Action)·시선 매치(Eyeline Match)·
 * 추격 스크린 방향 일관성 감사기 및 축 대칭 반사 자동 교정 솔버.
 */

import {
  computeCameraBlockingSha256Hex,
  computeExpectedEyelinePitchDeg,
  computeProjectedScreenFacing,
  computeSignedAxisDistanceM,
  cross2DXZ,
  distance2DXZ,
  reflectPointAcrossLineXZ,
  roundToDecimals,
  sanitizeFiniteNumber,
  sanitizeVec2XZ,
  type ProjectedScreenFacingResult,
  type SignedAxisDistanceResult,
} from "./eyeline-180-geometry";
import {
  CAMERA_SHOT_KIND_LABELS_KO,
  DEFAULT_AXIS_ON_LINE_TOLERANCE_M,
  DEFAULT_EYELINE_PITCH_TOLERANCE_DEG,
  DEFAULT_FRONT_FACING_DEADZONE_DEG,
  GEOMETRY_EPSILON,
  MOTION_DIRECTION_LABELS_KO,
  SCREEN_FACING_LABELS_KO,
  isLegalAxisBridgeShot,
  type AuditEyeline180Options,
  type AxisGeometrySummary,
  type CameraBlockingFixActionKind,
  type CameraBlockingFixRecord,
  type CameraCutSpec,
  type CameraShotKind,
  type CutGeometryAnalysis,
  type DialogueActionSceneSpec,
  type Eyeline180AuditResult,
  type EyelineViolation,
  type HalfPlaneSign,
  type LegalAxisTransitionRecord,
  type LegalScreenDirectionTransitionRecord,
  type MotionTravelDirection,
  type SafeCameraBlockingFixResult,
  type ScreenFacingDirection,
  type StageCharacterSpec,
  type Vec2XZ,
} from "./eyeline-180-rule-types";

export {
  computeCameraBlockingSha256Hex,
  computeExpectedEyelinePitchDeg,
  computeProjectedScreenFacing,
  computeSignedAxisDistanceM,
  cross2DXZ,
  distance2DXZ,
  reflectPointAcrossLineXZ,
  type ProjectedScreenFacingResult,
  type SignedAxisDistanceResult,
};

interface ReciprocalFacingRecord {
  readonly cutId: string;
  readonly subjectId: string;
  readonly targetId: string;
  readonly facing: ScreenFacingDirection;
}

interface PendingBridgeState {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly shotKind: CameraShotKind;
}

function oppositeScreenFacing(facing: ScreenFacingDirection): ScreenFacingDirection {
  if (facing === "screen-left") return "screen-right";
  if (facing === "screen-right") return "screen-left";
  return "front";
}

function resolveHalfPlaneSign(
  signedDistanceM: number,
  isAxisValid: boolean,
  onLineToleranceM: number,
): HalfPlaneSign {
  if (!isAxisValid) return 0;
  if (Math.abs(signedDistanceM) <= onLineToleranceM) return 0;
  return signedDistanceM > 0 ? 1 : -1;
}

function buildRemediationHintsKo(
  violations: readonly EyelineViolation[],
  axisSummary: AxisGeometrySummary,
): string[] {
  if (violations.length === 0) {
    if (!axisSummary.isAxisValid) {
      return ["주연 쌍 위치가 겹치거나 비어 있어 액션 축 기준을 먼저 확인하세요."];
    }
    return ["모든 컷의 180도 액션 축, 시선 매치, 스크린 이동 방향이 일관되게 유지되고 있습니다."];
  }
  const hints: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < violations.length; i += 1) {
    const v = violations[i];
    if (!v) continue;
    const line = `[${v.cutId}] ${v.fixHintKo}`;
    if (!seen.has(line)) {
      seen.add(line);
      hints.push(line);
    }
  }
  return hints;
}

/**
 * 웹툰 대화·추격 시퀀스 컷의 180도 액션 축, 좌우 시선 매치, 시선 고도(피치),
 * 추격 이동 방향 일관성을 종합 감사한다.
 */
export function auditSceneEyelineAnd180Rule(
  scene: DialogueActionSceneSpec,
  options: AuditEyeline180Options = {},
): Eyeline180AuditResult {
  const pitchToleranceDeg = Math.max(
    0.1,
    sanitizeFiniteNumber(
      options.pitchToleranceDeg ?? DEFAULT_EYELINE_PITCH_TOLERANCE_DEG,
      DEFAULT_EYELINE_PITCH_TOLERANCE_DEG,
    ),
  );
  const axisOnLineToleranceM = Math.max(
    GEOMETRY_EPSILON,
    sanitizeFiniteNumber(
      options.axisOnLineToleranceM ?? DEFAULT_AXIS_ON_LINE_TOLERANCE_M,
      DEFAULT_AXIS_ON_LINE_TOLERANCE_M,
    ),
  );
  const frontDeadzoneDeg = Math.max(
    0,
    Math.min(
      45,
      sanitizeFiniteNumber(
        options.frontFacingDeadzoneDeg ?? DEFAULT_FRONT_FACING_DEADZONE_DEG,
        DEFAULT_FRONT_FACING_DEADZONE_DEG,
      ),
    ),
  );

  const characterMap = new Map<string, StageCharacterSpec>();
  for (let i = 0; i < scene.characters.length; i += 1) {
    const ch = scene.characters[i];
    if (ch) characterMap.set(ch.characterId, ch);
  }

  const [anchorAId, anchorBId] = scene.axisAnchorPair;
  const anchorA = characterMap.get(anchorAId);
  const anchorB = characterMap.get(anchorBId);
  const anchorAXZ = anchorA ? sanitizeVec2XZ(anchorA.positionXZ) : null;
  const anchorBXZ = anchorB ? sanitizeVec2XZ(anchorB.positionXZ) : null;
  const axisLengthM = anchorAXZ && anchorBXZ ? distance2DXZ(anchorAXZ, anchorBXZ) : 0;
  const isAxisValid = Boolean(anchorAXZ && anchorBXZ && axisLengthM > GEOMETRY_EPSILON);

  const violations: EyelineViolation[] = [];
  const cutAnalyses: CutGeometryAnalysis[] = [];
  const legalAxisTransitions: LegalAxisTransitionRecord[] = [];
  const legalScreenDirectionTransitions: LegalScreenDirectionTransitionRecord[] = [];

  let activeHalfPlaneSign: HalfPlaneSign = 0;
  let initialHalfPlaneSign: HalfPlaneSign = 0;
  let lastAxisCutId: string | null = null;
  let pendingAxisBridge: PendingBridgeState | null = null;

  let activeChaseDirection: MotionTravelDirection | null = null;
  let lastChaseCutId: string | null = null;
  let pendingChaseBridge: PendingBridgeState | null = null;

  const reciprocalRecords: ReciprocalFacingRecord[] = [];
  let violationCounter = 0;
  const nextViolationId = (kind: string, cutId: string): string => {
    violationCounter += 1;
    return `w125-${violationCounter}-${kind}-${cutId}`;
  };

  for (let idx = 0; idx < scene.cuts.length; idx += 1) {
    const cut = scene.cuts[idx];
    if (!cut) continue;

    const cutViolationIds: string[] = [];
    const camXZ = sanitizeVec2XZ(cut.cameraXZ);
    const isBridge = isLegalAxisBridgeShot(cut.shotKind);
    const axisDist =
      isAxisValid && anchorAXZ && anchorBXZ
        ? computeSignedAxisDistanceM(anchorAXZ, anchorBXZ, camXZ)
        : { signedCross: 0, signedDistanceM: 0, axisLengthM: 0, isDegenerateAxis: true };
    const rawSign = resolveHalfPlaneSign(
      axisDist.signedDistanceM,
      isAxisValid,
      axisOnLineToleranceM,
    );

    let crossedAxisIllegally = false;
    let legalAxisTransitionApplied = false;

    // 1) 180도 액션 축 반평면 감사 및 합법 브리지 상태 전이
    if (isBridge) {
      if (activeChaseDirection !== null) {
        pendingChaseBridge = { cutIndex: idx, cutId: cut.cutId, shotKind: cut.shotKind };
      }
      if (
        cut.shotKind === "camera-dolly-bridge" &&
        isAxisValid &&
        activeHalfPlaneSign !== 0 &&
        rawSign !== 0 &&
        rawSign !== activeHalfPlaneSign
      ) {
        legalAxisTransitions.push({
          bridgeCutIndex: idx,
          bridgeCutId: cut.cutId,
          bridgeShotKind: cut.shotKind,
          fromCutId: lastAxisCutId ?? cut.cutId,
          toCutId: cut.cutId,
          fromHalfPlaneSign: activeHalfPlaneSign,
          toHalfPlaneSign: rawSign,
        });
        activeHalfPlaneSign = rawSign;
        lastAxisCutId = cut.cutId;
        pendingAxisBridge = null;
        legalAxisTransitionApplied = true;
        reciprocalRecords.length = 0;
      } else {
        if (cut.shotKind === "camera-dolly-bridge" && activeHalfPlaneSign === 0 && rawSign !== 0) {
          activeHalfPlaneSign = rawSign;
          initialHalfPlaneSign = rawSign;
          lastAxisCutId = cut.cutId;
        }
        pendingAxisBridge = { cutIndex: idx, cutId: cut.cutId, shotKind: cut.shotKind };
        reciprocalRecords.length = 0;
      }
    } else if (isAxisValid && rawSign !== 0) {
      if (activeHalfPlaneSign === 0) {
        activeHalfPlaneSign = rawSign;
        initialHalfPlaneSign = rawSign;
        lastAxisCutId = cut.cutId;
        pendingAxisBridge = null;
      } else if (rawSign !== activeHalfPlaneSign) {
        if (pendingAxisBridge !== null) {
          legalAxisTransitions.push({
            bridgeCutIndex: pendingAxisBridge.cutIndex,
            bridgeCutId: pendingAxisBridge.cutId,
            bridgeShotKind: pendingAxisBridge.shotKind,
            fromCutId: lastAxisCutId ?? pendingAxisBridge.cutId,
            toCutId: cut.cutId,
            fromHalfPlaneSign: activeHalfPlaneSign,
            toHalfPlaneSign: rawSign,
          });
          activeHalfPlaneSign = rawSign;
          lastAxisCutId = cut.cutId;
          pendingAxisBridge = null;
          legalAxisTransitionApplied = true;
          reciprocalRecords.length = 0;
        } else {
          crossedAxisIllegally = true;
          const vId = nextViolationId("axis-180-crossing", cut.cutId);
          cutViolationIds.push(vId);
          violations.push({
            violationId: vId,
            kind: "axis-180-crossing",
            severity: "blocker",
            cutIndex: idx,
            cutId: cut.cutId,
            relatedCutId: lastAxisCutId ?? undefined,
            summaryKo: `컷 ${cut.cutId} 카메라가 브리지 없이 180도 액션 축(${anchorA?.labelKo ?? anchorAId}–${anchorB?.labelKo ?? anchorBId}) 반대편으로 넘어갔습니다.`,
            fixHintKo:
              "카메라를 액션 축 반대편 안전 반평면으로 대칭 이동하거나 직전에 중립·부감·돌리 브리지 컷을 넣으세요.",
            expectedHalfPlaneSign: activeHalfPlaneSign,
            actualHalfPlaneSign: rawSign,
          });
        }
      } else {
        lastAxisCutId = cut.cutId;
        pendingAxisBridge = null;
      }
    }

    const safeReferenceCameraXZ =
      crossedAxisIllegally && anchorAXZ && anchorBXZ
        ? reflectPointAcrossLineXZ(camXZ, anchorAXZ, anchorBXZ)
        : camXZ;

    // 2) 좌우 시선 대칭(Screen-Facing Match) 감사
    const subject = characterMap.get(cut.subjectCharacterId);
    const target =
      cut.lookTargetCharacterId !== undefined
        ? characterMap.get(cut.lookTargetCharacterId)
        : undefined;
    let projectedFromActual: ScreenFacingDirection | null = null;
    let expectedScreenFacing: ScreenFacingDirection | null = null;

    if (
      subject &&
      target &&
      subject.characterId !== target.characterId &&
      cut.shotKind !== "top-down-establishing"
    ) {
      projectedFromActual = computeProjectedScreenFacing(
        camXZ,
        subject.positionXZ,
        target.positionXZ,
        cut.shotKind,
        frontDeadzoneDeg,
      ).facing;
      expectedScreenFacing = computeProjectedScreenFacing(
        safeReferenceCameraXZ,
        subject.positionXZ,
        target.positionXZ,
        cut.shotKind,
        frontDeadzoneDeg,
      ).facing;

      if (cut.drawnScreenFacing !== undefined) {
        let reciprocalPartner: ReciprocalFacingRecord | undefined;
        for (let r = reciprocalRecords.length - 1; r >= 0; r -= 1) {
          const rec = reciprocalRecords[r];
          if (rec && rec.subjectId === target.characterId && rec.targetId === subject.characterId) {
            reciprocalPartner = rec;
            break;
          }
        }
        const geometricMismatch = cut.drawnScreenFacing !== expectedScreenFacing;
        const reciprocalClash =
          reciprocalPartner !== undefined &&
          reciprocalPartner.facing !== "front" &&
          cut.drawnScreenFacing !== "front" &&
          cut.drawnScreenFacing === reciprocalPartner.facing;

        if (geometricMismatch || reciprocalClash) {
          const targetFacing = geometricMismatch
            ? expectedScreenFacing
            : oppositeScreenFacing(reciprocalPartner?.facing ?? cut.drawnScreenFacing);
          const vId = nextViolationId("eyeline-horizontal-clash", cut.cutId);
          cutViolationIds.push(vId);
          const partnerNote = reciprocalPartner
            ? ` (직전 ${reciprocalPartner.cutId} 컷에서 ${target.labelKo}도 ${SCREEN_FACING_LABELS_KO[reciprocalPartner.facing]}을 보고 있어 서로 등을 돌린 구도가 됩니다)`
            : "";
          violations.push({
            violationId: vId,
            kind: "eyeline-horizontal-clash",
            severity: "blocker",
            cutIndex: idx,
            cutId: cut.cutId,
            relatedCutId: reciprocalPartner?.cutId,
            summaryKo: `컷 ${cut.cutId}에서 ${subject.labelKo}의 시선이 ${SCREEN_FACING_LABELS_KO[cut.drawnScreenFacing]}으로 그려져 기대 방향(${SCREEN_FACING_LABELS_KO[targetFacing]})과 충돌합니다${partnerNote}.`,
            fixHintKo: `${subject.labelKo}의 시선을 ${SCREEN_FACING_LABELS_KO[targetFacing]}으로 맞춰 대화 시선 대칭을 복원하세요.`,
            expectedScreenFacing: targetFacing,
            actualScreenFacing: cut.drawnScreenFacing,
          });
        }
      }
      if (!isBridge && expectedScreenFacing !== "front") {
        reciprocalRecords.push({
          cutId: cut.cutId,
          subjectId: subject.characterId,
          targetId: target.characterId,
          facing: expectedScreenFacing,
        });
      }
    }

    // 3) 시선 고도(피치각) 매치 감사
    let expectedEyelinePitchDeg: number | null = null;
    let eyelinePitchErrorDeg: number | null = null;

    if (subject && target && subject.characterId !== target.characterId) {
      expectedEyelinePitchDeg = roundToDecimals(computeExpectedEyelinePitchDeg(subject, target), 2);
      if (cut.drawnEyelinePitchDeg !== undefined && Number.isFinite(cut.drawnEyelinePitchDeg)) {
        const actualPitch = sanitizeFiniteNumber(cut.drawnEyelinePitchDeg);
        const pitchErr = roundToDecimals(Math.abs(actualPitch - expectedEyelinePitchDeg), 2);
        eyelinePitchErrorDeg = pitchErr;
        if (pitchErr > pitchToleranceDeg) {
          const vId = nextViolationId("eyeline-pitch-mismatch", cut.cutId);
          cutViolationIds.push(vId);
          const dirKo =
            expectedEyelinePitchDeg > 2
              ? "올려다봄"
              : expectedEyelinePitchDeg < -2
                ? "내려다봄"
                : "수평 시선";
          violations.push({
            violationId: vId,
            kind: "eyeline-pitch-mismatch",
            severity: "warning",
            cutIndex: idx,
            cutId: cut.cutId,
            summaryKo: `컷 ${cut.cutId}에서 ${subject.labelKo}→${target.labelKo} 시선 피치(${actualPitch}°)가 눈높이·거리 기준 기대각(${expectedEyelinePitchDeg}°, ${dirKo})과 ${pitchErr}° 차이납니다(허용 ±${pitchToleranceDeg}°).`,
            fixHintKo: `시선 고도를 ${expectedEyelinePitchDeg}° 부근(${dirKo})으로 조정하세요.`,
            expectedPitchDeg: expectedEyelinePitchDeg,
            actualPitchDeg: actualPitch,
            pitchErrorDeg: pitchErr,
          });
        }
      }
    }

    // 4) 추격·이동 스크린 방향 일관성 감사
    let expectedMotionDirection: MotionTravelDirection | null = null;
    if (cut.shotKind === "chase-travel" && cut.motionDirection !== undefined) {
      if (activeChaseDirection === null) {
        activeChaseDirection = cut.motionDirection;
        lastChaseCutId = cut.cutId;
        expectedMotionDirection = cut.motionDirection;
        pendingChaseBridge = null;
      } else if (cut.motionDirection !== activeChaseDirection) {
        if (pendingChaseBridge !== null) {
          legalScreenDirectionTransitions.push({
            bridgeCutIndex: pendingChaseBridge.cutIndex,
            bridgeCutId: pendingChaseBridge.cutId,
            bridgeShotKind: pendingChaseBridge.shotKind,
            fromCutId: lastChaseCutId ?? pendingChaseBridge.cutId,
            toCutId: cut.cutId,
            fromDirection: activeChaseDirection,
            toDirection: cut.motionDirection,
          });
          activeChaseDirection = cut.motionDirection;
          lastChaseCutId = cut.cutId;
          expectedMotionDirection = cut.motionDirection;
          pendingChaseBridge = null;
        } else {
          expectedMotionDirection = activeChaseDirection;
          const vId = nextViolationId("screen-direction-reversal", cut.cutId);
          cutViolationIds.push(vId);
          violations.push({
            violationId: vId,
            kind: "screen-direction-reversal",
            severity: "blocker",
            cutIndex: idx,
            cutId: cut.cutId,
            relatedCutId: lastChaseCutId ?? undefined,
            summaryKo: `컷 ${cut.cutId}(${CAMERA_SHOT_KIND_LABELS_KO[cut.shotKind]})에서 이동 방향이 브리지 없이 ${MOTION_DIRECTION_LABELS_KO[activeChaseDirection]}에서 ${MOTION_DIRECTION_LABELS_KO[cut.motionDirection]}으로 반전되었습니다.`,
            fixHintKo: `이동 방향을 ${MOTION_DIRECTION_LABELS_KO[activeChaseDirection]}으로 통일하거나 직전에 중립·부감·돌리 브리지 컷을 삽입하세요.`,
            expectedMotionDirection: activeChaseDirection,
            actualMotionDirection: cut.motionDirection,
          });
        }
      } else {
        lastChaseCutId = cut.cutId;
        expectedMotionDirection = activeChaseDirection;
        pendingChaseBridge = null;
      }
    }

    cutAnalyses.push({
      cutIndex: idx,
      cutId: cut.cutId,
      shotKind: cut.shotKind,
      isBridgeShot: isBridge,
      signedCross2D: roundToDecimals(axisDist.signedCross, 4),
      signedDistanceToAxisM: roundToDecimals(axisDist.signedDistanceM, 4),
      rawHalfPlaneSign: rawSign,
      activeSafeHalfPlaneSign: activeHalfPlaneSign,
      crossedAxisIllegally,
      legalAxisTransitionApplied,
      safeReferenceCameraXZ,
      projectedScreenFacingFromActualCamera: projectedFromActual,
      expectedScreenFacing,
      expectedEyelinePitchDeg,
      eyelinePitchErrorDeg,
      expectedMotionDirection,
      violationIds: cutViolationIds,
    });
  }

  let blockerCount = 0;
  let warningCount = 0;
  for (let i = 0; i < violations.length; i += 1) {
    const v = violations[i];
    if (!v) continue;
    if (v.severity === "blocker") blockerCount += 1;
    else warningCount += 1;
  }

  const axisSummary: AxisGeometrySummary = {
    anchorAId,
    anchorBId,
    anchorALabelKo: anchorA?.labelKo ?? anchorAId,
    anchorBLabelKo: anchorB?.labelKo ?? anchorBId,
    anchorAXZ,
    anchorBXZ,
    axisLengthM: roundToDecimals(axisLengthM, 4),
    isAxisValid,
    initialSafeHalfPlaneSign: initialHalfPlaneSign,
    finalSafeHalfPlaneSign: activeHalfPlaneSign,
  };

  return {
    sceneId: scene.sceneId,
    titleKo: scene.titleKo,
    axisSummary,
    cutAnalyses,
    violations,
    legalAxisTransitions,
    legalScreenDirectionTransitions,
    totalViolationCount: violations.length,
    blockerCount,
    warningCount,
    pitchToleranceDeg,
    continuityScore: Math.max(0, Math.min(100, 100 - blockerCount * 25 - warningCount * 12)),
    passed: violations.length === 0,
    remediationHintsKo: buildRemediationHintsKo(violations, axisSummary),
    fingerprintSha256: computeCameraBlockingSha256Hex(scene),
  };
}

/**
 * 감사 결과에서 적발된 위반 컷의 카메라를 A→B 액션 축 기준으로 대칭 반사하고
 * 기대 좌우 시선·피치각·추격 이동 방향을 자동 교정한 뒤 재감사로 무위반을 검증한다.
 */
export function applySafeCameraBlockingFix(
  scene: DialogueActionSceneSpec,
  options: AuditEyeline180Options = {},
): SafeCameraBlockingFixResult {
  const beforeAudit = auditSceneEyelineAnd180Rule(scene, options);
  const violationsByCutIndex = new Map<number, EyelineViolation[]>();
  for (let i = 0; i < beforeAudit.violations.length; i += 1) {
    const v = beforeAudit.violations[i];
    if (!v) continue;
    const bucket = violationsByCutIndex.get(v.cutIndex);
    if (bucket) bucket.push(v);
    else violationsByCutIndex.set(v.cutIndex, [v]);
  }

  const { anchorAXZ, anchorBXZ, isAxisValid } = beforeAudit.axisSummary;
  const fixedCuts: CameraCutSpec[] = [];
  const fixesApplied: CameraBlockingFixRecord[] = [];

  for (let idx = 0; idx < scene.cuts.length; idx += 1) {
    const cut = scene.cuts[idx];
    const analysis = beforeAudit.cutAnalyses[idx];
    if (!cut || !analysis) continue;

    const cutViolations = violationsByCutIndex.get(idx) ?? [];
    if (cutViolations.length === 0) {
      fixedCuts.push({ ...cut, cameraXZ: sanitizeVec2XZ(cut.cameraXZ) });
      continue;
    }

    const actions: CameraBlockingFixActionKind[] = [];
    const noteParts: string[] = [];
    const originalCam = sanitizeVec2XZ(cut.cameraXZ);
    let nextCam: Vec2XZ = originalCam;
    let nextScreenFacing = cut.drawnScreenFacing;
    let nextPitchDeg = cut.drawnEyelinePitchDeg;
    let nextMotionDir = cut.motionDirection;

    const hasAxisCross = cutViolations.some((v) => v.kind === "axis-180-crossing");
    const horizontalViolation = cutViolations.find((v) => v.kind === "eyeline-horizontal-clash");
    const pitchViolation = cutViolations.find((v) => v.kind === "eyeline-pitch-mismatch");
    const motionViolation = cutViolations.find((v) => v.kind === "screen-direction-reversal");

    if (hasAxisCross && anchorAXZ && anchorBXZ && isAxisValid) {
      nextCam = reflectPointAcrossLineXZ(originalCam, anchorAXZ, anchorBXZ);
      actions.push("reflect-camera-across-axis");
      noteParts.push("카메라를 액션 축 반대편 안전 반평면으로 대칭 반사");
    }

    if (horizontalViolation?.expectedScreenFacing !== undefined) {
      nextScreenFacing = horizontalViolation.expectedScreenFacing;
      actions.push("align-screen-facing");
      noteParts.push(
        `좌우 시선을 ${SCREEN_FACING_LABELS_KO[horizontalViolation.expectedScreenFacing]}으로 정렬`,
      );
    } else if (
      hasAxisCross &&
      cut.drawnScreenFacing !== undefined &&
      analysis.expectedScreenFacing !== null &&
      cut.drawnScreenFacing !== analysis.expectedScreenFacing
    ) {
      nextScreenFacing = analysis.expectedScreenFacing;
      actions.push("align-screen-facing");
      noteParts.push(
        `반사 카메라 기준 좌우 시선을 ${SCREEN_FACING_LABELS_KO[analysis.expectedScreenFacing]}으로 정렬`,
      );
    }

    if (pitchViolation?.expectedPitchDeg !== undefined) {
      nextPitchDeg = roundToDecimals(pitchViolation.expectedPitchDeg, 2);
      actions.push("align-eyeline-pitch");
      noteParts.push(`시선 피치각을 ${nextPitchDeg}°로 보정`);
    }

    if (motionViolation?.expectedMotionDirection !== undefined) {
      nextMotionDir = motionViolation.expectedMotionDirection;
      actions.push("align-motion-direction");
      noteParts.push(
        `추격 이동 방향을 ${MOTION_DIRECTION_LABELS_KO[motionViolation.expectedMotionDirection]}으로 복원`,
      );
    }

    fixedCuts.push({
      ...cut,
      cameraXZ: nextCam,
      ...(nextScreenFacing !== undefined ? { drawnScreenFacing: nextScreenFacing } : {}),
      ...(nextPitchDeg !== undefined ? { drawnEyelinePitchDeg: nextPitchDeg } : {}),
      ...(nextMotionDir !== undefined ? { motionDirection: nextMotionDir } : {}),
    });

    fixesApplied.push({
      cutIndex: idx,
      cutId: cut.cutId,
      actions,
      originalCameraXZ: originalCam,
      fixedCameraXZ: nextCam,
      distanceToAnchorAPreservedErrorM:
        anchorAXZ !== null
          ? Math.abs(distance2DXZ(originalCam, anchorAXZ) - distance2DXZ(nextCam, anchorAXZ))
          : 0,
      distanceToAnchorBPreservedErrorM:
        anchorBXZ !== null
          ? Math.abs(distance2DXZ(originalCam, anchorBXZ) - distance2DXZ(nextCam, anchorBXZ))
          : 0,
      originalScreenFacing: cut.drawnScreenFacing,
      fixedScreenFacing: nextScreenFacing,
      originalEyelinePitchDeg: cut.drawnEyelinePitchDeg,
      fixedEyelinePitchDeg: nextPitchDeg,
      originalMotionDirection: cut.motionDirection,
      fixedMotionDirection: nextMotionDir,
      noteKo: noteParts.join(", "),
    });
  }

  const fixedScene: DialogueActionSceneSpec = { ...scene, cuts: fixedCuts };
  const afterAudit = auditSceneEyelineAnd180Rule(fixedScene, options);

  return {
    originalScene: scene,
    fixedScene,
    beforeAudit,
    afterAudit,
    fixesApplied,
    isFullyResolved: afterAudit.totalViolationCount === 0,
    beforeFingerprintSha256: beforeAudit.fingerprintSha256,
    afterFingerprintSha256: afterAudit.fingerprintSha256,
  };
}
