/**
 * Wave 147 — 핀홀 3D->2D 손 투영 및 5손가락 끝(TIP) 실루엣 가독성 감사·자동 개선 모듈.
 *
 * - 핀홀 카메라 기준 21관절 투영 및 손가락 끝 10쌍의 2D 분리 간격 감사
 * - 겹쳐 뭉개지는(Ambiguous Finger Silhouette Overlap) 손가락 끝과 손바닥 뒤 가려짐 탐지
 * - 미세 손목 회전(회내/편위)·외전·굴곡 단차로 5손가락 실루엣 분리도를 ROM·소품 관통 0건 조건 하에 개선
 */

import {
  HAND_FINGER_ROM_LIMITS,
  WRIST_ROM_LIMITS,
  buildHand21JointPose,
  clampHandPoseSpecToRom,
  type FingerPoseAngles,
  type Hand21JointPose,
  type HandFingerId,
  type HandJointId,
  type HandPoseSpec,
  type WristPoseAngles,
} from "./hand-21joint-kinematics";
import {
  clampNumber,
  crossVec3,
  dotVec3,
  normalizeVec3,
  roundFixed,
  subVec3,
  vec3,
  type GraspPropPrimitive,
  type Vec2,
  type Vec3,
} from "./hand-pose-math-and-sha256";

export interface HandCameraProjectionSpec {
  readonly positionMm: Vec3;
  readonly targetMm: Vec3;
  readonly up?: Vec3;
  readonly focalLengthPx: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
}

export interface ProjectedHandJoint2D {
  readonly index: number;
  readonly id: HandJointId;
  readonly finger: HandFingerId | "palm";
  readonly screen: Vec2;
  readonly depthMm: number;
  readonly radiusPx: number;
}

export interface FingertipPairSeparation {
  readonly fingerA: HandFingerId;
  readonly fingerB: HandFingerId;
  readonly distancePx: number;
  readonly combinedRadiusPx: number;
  readonly clearancePx: number;
  readonly isAmbiguousOverlap: boolean;
}

export interface HandSilhouetteRefinement {
  readonly applied: boolean;
  readonly beforeScore: number;
  readonly afterScore: number;
  readonly scoreGain: number;
  readonly beforeOverlapCount: number;
  readonly afterOverlapCount: number;
  readonly wristDeltaDeg: WristPoseAngles;
  readonly abductionBoostDeg: number;
  readonly fingerStaggerDeg: number;
  readonly refinedSpec: HandPoseSpec;
  readonly refinedPose: Hand21JointPose;
  readonly refinedProjectedJoints: readonly ProjectedHandJoint2D[];
  readonly refinedHandPoseSha256Hex: string;
}

export interface HandSilhouetteClarityAudit {
  readonly camera: HandCameraProjectionSpec;
  readonly projectedJoints: readonly ProjectedHandJoint2D[];
  readonly tipSeparations: readonly FingertipPairSeparation[];
  readonly overlappingTipPairs: readonly FingertipPairSeparation[];
  readonly occludedTips: readonly HandFingerId[];
  readonly minTipDistancePx: number;
  readonly minTipClearancePx: number;
  readonly silhouetteClarityScore: number;
  readonly hasAmbiguousOverlap: boolean;
  readonly refinement: HandSilhouetteRefinement;
}

export interface SilhouetteAuditOptions {
  readonly minTipClearancePx?: number;
  readonly autoRefine?: boolean;
  readonly prop?: GraspPropPrimitive;
}

export interface SilhouetteConstraintHooks {
  readonly isCollisionFree: (pose: Hand21JointPose, prop?: GraspPropPrimitive) => boolean;
  readonly computePoseSha256: (pose: Hand21JointPose, prop?: GraspPropPrimitive) => string;
}

export const DEFAULT_HAND_CAMERA_SPEC: HandCameraProjectionSpec = {
  positionMm: vec3(0, 82, 420),
  targetMm: vec3(0, 82, 0),
  up: vec3(0, 1, 0),
  focalLengthPx: 540,
  viewportWidthPx: 480,
  viewportHeightPx: 480,
};

const FINGERTIP_IDS: readonly { readonly finger: HandFingerId; readonly jointId: HandJointId }[] = [
  { finger: "thumb", jointId: "thumb_tip" },
  { finger: "index", jointId: "index_tip" },
  { finger: "middle", jointId: "middle_tip" },
  { finger: "ring", jointId: "ring_tip" },
  { finger: "pinky", jointId: "pinky_tip" },
];

interface CameraBasis {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
}

function buildCameraBasis(camera: HandCameraProjectionSpec): CameraBasis {
  const forward = normalizeVec3(subVec3(camera.targetMm, camera.positionMm), vec3(0, 0, -1));
  const worldUp = normalizeVec3(camera.up ?? vec3(0, 1, 0), vec3(0, 1, 0));
  const right = normalizeVec3(crossVec3(forward, worldUp), vec3(1, 0, 0));
  const up = normalizeVec3(crossVec3(right, forward), vec3(0, 1, 0));
  return { right, up, forward };
}

/** 단일 3D 좌표를 핀홀 카메라로 2D 화면 픽셀 좌표로 투영한다. */
export function projectPoint3DToCamera2D(
  pointMm: Vec3,
  camera: HandCameraProjectionSpec,
): { readonly screen: Vec2; readonly depthMm: number } {
  const basis = buildCameraBasis(camera);
  const rel = subVec3(pointMm, camera.positionMm);
  const camX = dotVec3(rel, basis.right);
  const camY = dotVec3(rel, basis.up);
  const depthMm = Math.max(20, dotVec3(rel, basis.forward));
  const scale = camera.focalLengthPx / depthMm;
  return {
    screen: {
      x: roundFixed(camera.viewportWidthPx * 0.5 + camX * scale, 3),
      y: roundFixed(camera.viewportHeightPx * 0.5 - camY * scale, 3),
    },
    depthMm: roundFixed(depthMm, 3),
  };
}

/** 21-관절 손 포즈를 핀홀 카메라로 2D 투영한다. */
export function projectHandPose2D(
  pose: Hand21JointPose,
  camera: HandCameraProjectionSpec = DEFAULT_HAND_CAMERA_SPEC,
): readonly ProjectedHandJoint2D[] {
  const result: ProjectedHandJoint2D[] = [];
  for (let i = 0; i < pose.joints.length; i += 1) {
    const j = pose.joints[i];
    if (j === undefined) {
      continue;
    }
    const proj = projectPoint3DToCamera2D(j.positionMm, camera);
    result.push({
      index: j.index,
      id: j.id,
      finger: j.finger,
      screen: proj.screen,
      depthMm: proj.depthMm,
      radiusPx: roundFixed((j.radiusMm * camera.focalLengthPx) / proj.depthMm, 3),
    });
  }
  return result;
}

function pointInPolygon2D(pt: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (pi === undefined || pj === undefined) {
      continue;
    }
    const intersects =
      pi.y > pt.y !== pj.y > pt.y &&
      pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y + 1e-9) + pi.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

interface RawSilhouetteScore {
  readonly projectedJoints: readonly ProjectedHandJoint2D[];
  readonly tipSeparations: readonly FingertipPairSeparation[];
  readonly overlappingTipPairs: readonly FingertipPairSeparation[];
  readonly occludedTips: readonly HandFingerId[];
  readonly minTipDistancePx: number;
  readonly minTipClearancePx: number;
  readonly score: number;
}

function evaluateSilhouetteSnapshot(
  pose: Hand21JointPose,
  camera: HandCameraProjectionSpec,
  minTipClearancePx: number,
): RawSilhouetteScore {
  const projected = projectHandPose2D(pose, camera);
  const byId = new Map<HandJointId, ProjectedHandJoint2D>();
  for (let i = 0; i < projected.length; i += 1) {
    const p = projected[i];
    if (p !== undefined) {
      byId.set(p.id, p);
    }
  }

  const palmIds: readonly HandJointId[] = [
    "wrist",
    "thumb_cmc",
    "index_mcp",
    "middle_mcp",
    "ring_mcp",
    "pinky_mcp",
  ];
  const palmPoly: Vec2[] = [];
  let palmDepthSum = 0;
  for (let i = 0; i < palmIds.length; i += 1) {
    const id = palmIds[i];
    const p = id !== undefined ? byId.get(id) : undefined;
    if (p !== undefined) {
      palmPoly.push(p.screen);
      palmDepthSum += p.depthMm;
    }
  }
  const avgPalmDepth = palmPoly.length > 0 ? palmDepthSum / palmPoly.length : 400;

  const occludedTips: HandFingerId[] = [];
  const tipNodes: { readonly finger: HandFingerId; readonly node: ProjectedHandJoint2D }[] = [];
  for (let i = 0; i < FINGERTIP_IDS.length; i += 1) {
    const entry = FINGERTIP_IDS[i];
    if (entry === undefined) {
      continue;
    }
    const node = byId.get(entry.jointId);
    if (node !== undefined) {
      tipNodes.push({ finger: entry.finger, node });
      if (node.depthMm > avgPalmDepth + 6 && pointInPolygon2D(node.screen, palmPoly)) {
        occludedTips.push(entry.finger);
      }
    }
  }

  const separations: FingertipPairSeparation[] = [];
  const overlapping: FingertipPairSeparation[] = [];
  let minDist = Number.POSITIVE_INFINITY;
  let minClearance = Number.POSITIVE_INFINITY;
  let clearanceSum = 0;

  for (let i = 0; i < tipNodes.length; i += 1) {
    const a = tipNodes[i];
    if (a === undefined) {
      continue;
    }
    for (let j = i + 1; j < tipNodes.length; j += 1) {
      const b = tipNodes[j];
      if (b === undefined) {
        continue;
      }
      const dx = a.node.screen.x - b.node.screen.x;
      const dy = a.node.screen.y - b.node.screen.y;
      const distancePx = Math.sqrt(dx * dx + dy * dy);
      const combinedRadiusPx = a.node.radiusPx + b.node.radiusPx;
      const clearancePx = distancePx - combinedRadiusPx;
      const isAmbiguousOverlap = clearancePx < minTipClearancePx;

      if (distancePx < minDist) {
        minDist = distancePx;
      }
      if (clearancePx < minClearance) {
        minClearance = clearancePx;
      }
      clearanceSum += clampNumber(clearancePx, -20, 60);

      const pair: FingertipPairSeparation = {
        fingerA: a.finger,
        fingerB: b.finger,
        distancePx: roundFixed(distancePx, 3),
        combinedRadiusPx: roundFixed(combinedRadiusPx, 3),
        clearancePx: roundFixed(clearancePx, 3),
        isAmbiguousOverlap,
      };
      separations.push(pair);
      if (isAmbiguousOverlap) {
        overlapping.push(pair);
      }
    }
  }

  const meanClearance = separations.length > 0 ? clearanceSum / separations.length : 0;
  const minClearanceTerm = clampNumber((minClearance + 8) / 28, 0, 1) * 42;
  const meanClearanceTerm = clampNumber((meanClearance + 4) / 42, 0, 1) * 38;
  const rawScore =
    20 + minClearanceTerm + meanClearanceTerm - overlapping.length * 11 - occludedTips.length * 9;

  return {
    projectedJoints: projected,
    tipSeparations: separations,
    overlappingTipPairs: overlapping,
    occludedTips,
    minTipDistancePx: Number.isFinite(minDist) ? roundFixed(minDist, 3) : 0,
    minTipClearancePx: Number.isFinite(minClearance) ? roundFixed(minClearance, 3) : 0,
    score: roundFixed(clampNumber(rawScore, 0, 100), 2),
  };
}

function buildSilhouetteCandidateSpec(
  basePose: Hand21JointPose,
  pronationDelta: number,
  radialDelta: number,
  abductBoost: number,
  staggerDeg: number,
): HandPoseSpec {
  const w = basePose.wristAngles;
  const nextWrist: WristPoseAngles = {
    flexionDeg: clampNumber(
      w.flexionDeg,
      WRIST_ROM_LIMITS.flexion.minDeg,
      WRIST_ROM_LIMITS.flexion.maxDeg,
    ),
    radialUlnarDeg: clampNumber(
      w.radialUlnarDeg + radialDelta,
      WRIST_ROM_LIMITS.radialUlnar.minDeg,
      WRIST_ROM_LIMITS.radialUlnar.maxDeg,
    ),
    pronationDeg: clampNumber(
      w.pronationDeg + pronationDelta,
      WRIST_ROM_LIMITS.pronation.minDeg,
      WRIST_ROM_LIMITS.pronation.maxDeg,
    ),
  };

  const adjustFinger = (finger: HandFingerId, staggerIndex: number): FingerPoseAngles => {
    const src = basePose.fingerAngles[finger];
    const lim = HAND_FINGER_ROM_LIMITS[finger];
    const abdDelta = finger === "middle" ? 0 : abductBoost;
    const flexDelta = staggerIndex * staggerDeg;
    return {
      mcpFlexDeg: clampNumber(src.mcpFlexDeg + flexDelta * 0.6, lim.mcpFlex.minDeg, lim.mcpFlex.maxDeg),
      mcpAbductDeg: clampNumber(src.mcpAbductDeg + abdDelta, lim.mcpAbduct.minDeg, lim.mcpAbduct.maxDeg),
      pipFlexDeg: clampNumber(src.pipFlexDeg + flexDelta, lim.pipFlex.minDeg, lim.pipFlex.maxDeg),
      dipFlexDeg: clampNumber(src.dipFlexDeg + flexDelta * 0.5, lim.dipFlex.minDeg, lim.dipFlex.maxDeg),
      oppositionDeg: src.oppositionDeg,
    };
  };

  return clampHandPoseSpecToRom({
    handedness: basePose.handedness,
    palmWidthMm: basePose.palmWidthMm,
    presetId: basePose.presetId === "custom" ? undefined : basePose.presetId,
    wristAngles: nextWrist,
    wristTranslationMm: basePose.wristTranslationMm,
    fingers: {
      thumb: adjustFinger("thumb", 0),
      index: adjustFinger("index", 0),
      middle: adjustFinger("middle", 1),
      ring: adjustFinger("ring", 2),
      pinky: adjustFinger("pinky", 3),
    },
  });
}

/**
 * 5손가락 끝 겹침 감사 및 미세 손목 회전/외전 보정 엔진 코어.
 */
export function runHandSilhouetteClarityAudit(
  pose: Hand21JointPose,
  camera: HandCameraProjectionSpec,
  hooks: SilhouetteConstraintHooks,
  options?: SilhouetteAuditOptions,
): HandSilhouetteClarityAudit {
  const minTipClearancePx = options?.minTipClearancePx ?? 4.0;
  const autoRefine = options?.autoRefine ?? true;
  const prop = options?.prop;

  const baseEval = evaluateSilhouetteSnapshot(pose, camera, minTipClearancePx);
  let bestEval = baseEval;
  let bestSpec = buildSilhouetteCandidateSpec(pose, 0, 0, 0, 0);
  let bestPose = pose;
  let bestPronationDelta = 0;
  let bestRadialDelta = 0;
  let bestAbductBoost = 0;
  let bestStagger = 0;

  if (autoRefine && (baseEval.overlappingTipPairs.length > 0 || baseEval.score < 88)) {
    const pronationOffsets = [0, -16, 16, -28, 28];
    const radialOffsets = [0, -10, 10];
    const abductBoosts = [0, 6, 12];
    const staggerOptions = [0, 5, 10];

    for (let pIdx = 0; pIdx < pronationOffsets.length; pIdx += 1) {
      const pDelta = pronationOffsets[pIdx] ?? 0;
      for (let rIdx = 0; rIdx < radialOffsets.length; rIdx += 1) {
        const rDelta = radialOffsets[rIdx] ?? 0;
        for (let aIdx = 0; aIdx < abductBoosts.length; aIdx += 1) {
          const aBoost = abductBoosts[aIdx] ?? 0;
          for (let stIdx = 0; stIdx < staggerOptions.length; stIdx += 1) {
            const stagger = staggerOptions[stIdx] ?? 0;
            if (pDelta === 0 && rDelta === 0 && aBoost === 0 && stagger === 0) {
              continue;
            }
            const candSpec = buildSilhouetteCandidateSpec(pose, pDelta, rDelta, aBoost, stagger);
            const candPose = buildHand21JointPose(candSpec);
            if (!hooks.isCollisionFree(candPose, prop)) {
              continue;
            }
            const candEval = evaluateSilhouetteSnapshot(candPose, camera, minTipClearancePx);
            const fewerOverlaps =
              candEval.overlappingTipPairs.length < bestEval.overlappingTipPairs.length;
            const sameOverlapsHigherScore =
              candEval.overlappingTipPairs.length === bestEval.overlappingTipPairs.length &&
              candEval.score > bestEval.score + 0.5;

            if (fewerOverlaps || sameOverlapsHigherScore) {
              bestEval = candEval;
              bestSpec = candSpec;
              bestPose = candPose;
              bestPronationDelta = pDelta;
              bestRadialDelta = rDelta;
              bestAbductBoost = aBoost;
              bestStagger = stagger;
            }
          }
        }
      }
    }
  }

  const applied =
    bestEval.score > baseEval.score + 0.25 ||
    bestEval.overlappingTipPairs.length < baseEval.overlappingTipPairs.length;

  return {
    camera,
    projectedJoints: baseEval.projectedJoints,
    tipSeparations: baseEval.tipSeparations,
    overlappingTipPairs: baseEval.overlappingTipPairs,
    occludedTips: baseEval.occludedTips,
    minTipDistancePx: baseEval.minTipDistancePx,
    minTipClearancePx: baseEval.minTipClearancePx,
    silhouetteClarityScore: baseEval.score,
    hasAmbiguousOverlap: baseEval.overlappingTipPairs.length > 0,
    refinement: {
      applied,
      beforeScore: baseEval.score,
      afterScore: bestEval.score,
      scoreGain: roundFixed(bestEval.score - baseEval.score, 2),
      beforeOverlapCount: baseEval.overlappingTipPairs.length,
      afterOverlapCount: bestEval.overlappingTipPairs.length,
      wristDeltaDeg: {
        flexionDeg: 0,
        radialUlnarDeg: bestRadialDelta,
        pronationDeg: bestPronationDelta,
      },
      abductionBoostDeg: bestAbductBoost,
      fingerStaggerDeg: bestStagger,
      refinedSpec: bestSpec,
      refinedPose: bestPose,
      refinedProjectedJoints: bestEval.projectedJoints,
      refinedHandPoseSha256Hex: hooks.computePoseSha256(bestPose, prop),
    },
  };
}
