/**
 * Wave 147 — 물체 파지(Grasp) 관통 제로 솔버, 손가락 자체 관통 감사 및 21-관절 SHA-256 지문.
 *
 * - 20개 캡슐과 소품(cylinder/box/sphere) 표면 간 3D SDF 관통 깊이·접촉 감사(`auditGraspPropPenetration`)
 * - 얇은 스마트폰·원통 검 자루·구형 찻잔 모두에서 국소 최솟값 없이 수렴하는
 *   전역 굴곡 스윕 + 이진 경계 탐색 + 좌표 미세 교정 파지 솔버(`solveCollisionFreeHandGrasp`)
 * - 2D 실루엣 가독성 감사기(`auditHandSilhouetteClarity`)와 ES2017 동기 SHA-256 지문 통합 제공
 */

import {
  HAND_FINGER_IDS,
  HAND_FINGER_ROM_LIMITS,
  auditHandAnatomicalRom,
  buildHand21JointPose,
  clampHandPoseSpecToRom,
  type FingerPoseAngles,
  type Hand21JointPose,
  type HandAnatomicalRomAudit,
  type HandBoneCapsule,
  type HandFingerId,
  type HandPoseSpec,
} from "./hand-21joint-kinematics";
import {
  addVec3,
  clampNumber,
  normalizeVec3,
  roundFixed,
  sampleCapsuleToPropSdf,
  scaleVec3,
  segmentToSegmentDistanceMm,
  sha256CanonicalObjectHex,
  vec3,
  type GraspPropPrimitive,
  type Vec3,
} from "./hand-pose-math-and-sha256";
import {
  DEFAULT_HAND_CAMERA_SPEC,
  runHandSilhouetteClarityAudit,
  type HandCameraProjectionSpec,
  type HandSilhouetteClarityAudit,
  type SilhouetteAuditOptions,
} from "./hand-silhouette-clarity-auditor";

export {
  DEFAULT_HAND_CAMERA_SPEC,
  projectHandPose2D,
  projectPoint3DToCamera2D,
  type FingertipPairSeparation,
  type HandCameraProjectionSpec,
  type HandSilhouetteClarityAudit,
  type HandSilhouetteRefinement,
  type ProjectedHandJoint2D,
  type SilhouetteAuditOptions,
} from "./hand-silhouette-clarity-auditor";

export const GRASP_PENETRATION_THRESHOLD_MM = 0.05;
export const DEFAULT_CONTACT_TOLERANCE_MM = 3.0;
const SOLVER_CLEARANCE_TARGET_MM = 0.35;

export interface CapsulePropContactSample {
  readonly segmentIndex: number;
  readonly capsuleId: string;
  readonly finger: HandFingerId;
  readonly kind: HandBoneCapsule["kind"];
  readonly signedDistanceMm: number;
  readonly penetrationDepthMm: number;
  readonly isPenetrating: boolean;
  readonly isContacting: boolean;
  readonly isCleanContact: boolean;
  readonly closestSegmentT: number;
  readonly closestPointMm: Vec3;
  readonly outwardNormal: Vec3;
}

export interface GraspPropPenetrationAudit {
  readonly propId: string;
  readonly propKind: GraspPropPrimitive["kind"];
  readonly penetrationCount: number;
  readonly maxPenetrationMm: number;
  readonly contactCount: number;
  readonly cleanContactCount: number;
  readonly collidingFingers: readonly HandFingerId[];
  readonly capsuleSamples: readonly CapsulePropContactSample[];
}

export interface FingerSelfCollisionPair {
  readonly capsuleAId: string;
  readonly capsuleBId: string;
  readonly fingerA: HandFingerId;
  readonly fingerB: HandFingerId;
  readonly clearanceMm: number;
  readonly penetrationDepthMm: number;
}

export interface HandSelfPenetrationAudit {
  readonly selfPenetrationCount: number;
  readonly maxSelfPenetrationMm: number;
  readonly pairs: readonly FingerSelfCollisionPair[];
}

export interface SolveGraspOptions {
  readonly maxIterations?: number;
  readonly contactToleranceMm?: number;
  readonly clearanceMarginMm?: number;
  readonly allowWristOffset?: boolean;
}

export interface CollisionFreeGraspResult {
  readonly converged: boolean;
  readonly iterationsUsed: number;
  readonly beforePose: Hand21JointPose;
  readonly solvedPose: Hand21JointPose;
  readonly solvedSpec: HandPoseSpec;
  readonly beforeRomAudit: HandAnatomicalRomAudit;
  readonly afterRomAudit: HandAnatomicalRomAudit;
  readonly beforePropAudit: GraspPropPenetrationAudit;
  readonly afterPropAudit: GraspPropPenetrationAudit;
  readonly beforeSelfAudit: HandSelfPenetrationAudit;
  readonly afterSelfAudit: HandSelfPenetrationAudit;
  readonly wristOffsetAppliedMm: Vec3;
  readonly handPoseSha256Hex: string;
}

/** 21-관절 손 포즈의 결정론적 매니페스트 지문(`handPoseSha256Hex`)을 생성한다. */
export function computeHandPoseManifestSha256(
  pose: Hand21JointPose,
  prop?: GraspPropPrimitive,
): string {
  return sha256CanonicalObjectHex({
    schema: "toonstudio.wave147.hand21.v1",
    handedness: pose.handedness,
    palmWidthMm: pose.palmWidthMm,
    presetId: pose.presetId,
    wristAngles: pose.wristAngles,
    wristTranslationMm: pose.wristTranslationMm,
    fingerAngles: pose.fingerAngles,
    joints: pose.joints.map((j) => ({
      id: j.id,
      x: j.positionMm.x,
      y: j.positionMm.y,
      z: j.positionMm.z,
      r: j.radiusMm,
    })),
    prop: prop
      ? {
          id: prop.id,
          kind: prop.kind,
          centerMm: prop.centerMm,
          rotationDeg: prop.rotationDeg ?? vec3(0, 0, 0),
        }
      : null,
  });
}

/** 20개 손 캡슐과 소품 표면 간 3D SDF 관통 깊이 및 접촉 여부를 감사한다. */
export function auditGraspPropPenetration(
  pose: Hand21JointPose,
  prop: GraspPropPrimitive,
  contactToleranceMm: number = DEFAULT_CONTACT_TOLERANCE_MM,
): GraspPropPenetrationAudit {
  const samples: CapsulePropContactSample[] = [];
  const collidingSet = new Set<HandFingerId>();
  let penetrationCount = 0;
  let maxPenetrationMm = 0;
  let contactCount = 0;
  let cleanContactCount = 0;

  for (let i = 0; i < pose.capsules.length; i += 1) {
    const cap = pose.capsules[i];
    if (cap === undefined) {
      continue;
    }
    const sdf = sampleCapsuleToPropSdf(cap.startMm, cap.endMm, cap.radiusMm, prop);
    const isPenetrating = sdf.penetrationDepthMm >= GRASP_PENETRATION_THRESHOLD_MM;
    const isContacting = sdf.signedDistanceMm <= contactToleranceMm;
    const isCleanContact = !isPenetrating && isContacting;

    if (isPenetrating) {
      penetrationCount += 1;
      collidingSet.add(cap.finger);
    }
    if (sdf.penetrationDepthMm > maxPenetrationMm) {
      maxPenetrationMm = sdf.penetrationDepthMm;
    }
    if (isContacting) {
      contactCount += 1;
    }
    if (isCleanContact) {
      cleanContactCount += 1;
    }

    samples.push({
      segmentIndex: cap.segmentIndex,
      capsuleId: cap.id,
      finger: cap.finger,
      kind: cap.kind,
      signedDistanceMm: roundFixed(sdf.signedDistanceMm, 4),
      penetrationDepthMm: roundFixed(sdf.penetrationDepthMm, 4),
      isPenetrating,
      isContacting,
      isCleanContact,
      closestSegmentT: roundFixed(sdf.closestSegmentT, 4),
      closestPointMm: vec3(
        roundFixed(sdf.closestPointOnSegmentMm.x, 4),
        roundFixed(sdf.closestPointOnSegmentMm.y, 4),
        roundFixed(sdf.closestPointOnSegmentMm.z, 4),
      ),
      outwardNormal: vec3(
        roundFixed(sdf.outwardNormal.x, 4),
        roundFixed(sdf.outwardNormal.y, 4),
        roundFixed(sdf.outwardNormal.z, 4),
      ),
    });
  }

  return {
    propId: prop.id,
    propKind: prop.kind,
    penetrationCount,
    maxPenetrationMm: roundFixed(maxPenetrationMm, 4),
    contactCount,
    cleanContactCount,
    collidingFingers: HAND_FINGER_IDS.filter((f) => collidingSet.has(f)),
    capsuleSamples: samples,
  };
}

/** 서로 다른 손가락 지골 캡슐 간의 자체 관통(Self-Penetration)을 감사한다. */
export function auditHandSelfPenetration(pose: Hand21JointPose): HandSelfPenetrationAudit {
  const phalanges = pose.capsules.filter((c) => c.kind !== "metacarpal");
  const pairs: FingerSelfCollisionPair[] = [];
  let maxSelfPenetrationMm = 0;

  for (let i = 0; i < phalanges.length; i += 1) {
    const a = phalanges[i];
    if (a === undefined) {
      continue;
    }
    for (let j = i + 1; j < phalanges.length; j += 1) {
      const b = phalanges[j];
      if (b === undefined || a.finger === b.finger) {
        continue;
      }
      const dist = segmentToSegmentDistanceMm(a.startMm, a.endMm, b.startMm, b.endMm);
      const clearance = dist - (a.radiusMm + b.radiusMm);
      const depth = clearance < 0 ? -clearance : 0;
      if (depth >= GRASP_PENETRATION_THRESHOLD_MM) {
        if (depth > maxSelfPenetrationMm) {
          maxSelfPenetrationMm = depth;
        }
        pairs.push({
          capsuleAId: a.id,
          capsuleBId: b.id,
          fingerA: a.finger,
          fingerB: b.finger,
          clearanceMm: roundFixed(clearance, 4),
          penetrationDepthMm: roundFixed(depth, 4),
        });
      }
    }
  }

  return {
    selfPenetrationCount: pairs.length,
    maxSelfPenetrationMm: roundFixed(maxSelfPenetrationMm, 4),
    pairs,
  };
}

function withFingerAngles(
  spec: HandPoseSpec,
  finger: HandFingerId,
  angles: FingerPoseAngles,
): HandPoseSpec {
  return {
    ...spec,
    fingers: { ...spec.fingers, [finger]: angles },
  };
}

function measureFingerMinClearanceMm(
  pose: Hand21JointPose,
  finger: HandFingerId,
  prop: GraspPropPrimitive,
): number {
  let minClearance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pose.capsules.length; i += 1) {
    const cap = pose.capsules[i];
    if (cap === undefined || cap.finger !== finger || cap.kind === "metacarpal") {
      continue;
    }
    const sdf = sampleCapsuleToPropSdf(cap.startMm, cap.endMm, cap.radiusMm, prop);
    if (sdf.signedDistanceMm < minClearance) {
      minClearance = sdf.signedDistanceMm;
    }
  }
  const selfAudit = auditHandSelfPenetration(pose);
  for (let i = 0; i < selfAudit.pairs.length; i += 1) {
    const pair = selfAudit.pairs[i];
    if (pair !== undefined && (pair.fingerA === finger || pair.fingerB === finger)) {
      if (pair.clearanceMm < minClearance) {
        minClearance = pair.clearanceMm;
      }
    }
  }
  return minClearance;
}

function computeFingerCost(
  pose: Hand21JointPose,
  finger: HandFingerId,
  prop: GraspPropPrimitive,
  targetAngles: FingerPoseAngles,
  clearanceMarginMm: number,
): number {
  let penalty = 0;
  for (let i = 0; i < pose.capsules.length; i += 1) {
    const cap = pose.capsules[i];
    if (cap === undefined || cap.finger !== finger || cap.kind === "metacarpal") {
      continue;
    }
    const sdf = sampleCapsuleToPropSdf(cap.startMm, cap.endMm, cap.radiusMm, prop);
    const shortfall = clearanceMarginMm - sdf.signedDistanceMm;
    if (shortfall > 0) {
      penalty += shortfall * shortfall * 120 + shortfall * 24;
    }
  }
  const selfAudit = auditHandSelfPenetration(pose);
  for (let i = 0; i < selfAudit.pairs.length; i += 1) {
    const pair = selfAudit.pairs[i];
    if (pair !== undefined && (pair.fingerA === finger || pair.fingerB === finger)) {
      const shortfall = clearanceMarginMm - pair.clearanceMm;
      if (shortfall > 0) {
        penalty += shortfall * shortfall * 90 + shortfall * 18;
      }
    }
  }
  const cur = pose.fingerAngles[finger];
  const dMcp = cur.mcpFlexDeg - targetAngles.mcpFlexDeg;
  const dPip = cur.pipFlexDeg - targetAngles.pipFlexDeg;
  const dDip = cur.dipFlexDeg - targetAngles.dipFlexDeg;
  const dAbd = cur.mcpAbductDeg - targetAngles.mcpAbductDeg;
  const dOpp = (cur.oppositionDeg ?? 0) - (targetAngles.oppositionDeg ?? 0);
  return penalty + (dMcp * dMcp + dPip * dPip + dDip * dDip + dAbd * dAbd + dOpp * dOpp) * 0.0005;
}

function interpolateFingerAngles(
  a: FingerPoseAngles,
  b: FingerPoseAngles,
  t: number,
): FingerPoseAngles {
  return {
    mcpFlexDeg: roundFixed(a.mcpFlexDeg + (b.mcpFlexDeg - a.mcpFlexDeg) * t, 3),
    mcpAbductDeg: roundFixed(a.mcpAbductDeg + (b.mcpAbductDeg - a.mcpAbductDeg) * t, 3),
    pipFlexDeg: roundFixed(a.pipFlexDeg + (b.pipFlexDeg - a.pipFlexDeg) * t, 3),
    dipFlexDeg: roundFixed(a.dipFlexDeg + (b.dipFlexDeg - a.dipFlexDeg) * t, 3),
    oppositionDeg: roundFixed((a.oppositionDeg ?? 0) + ((b.oppositionDeg ?? 0) - (a.oppositionDeg ?? 0)) * t, 3),
  };
}

/**
 * 얇은 소품(스마트폰)을 손가락이 관통한 경우 발생하는 국소 최솟값 장벽을 넘기 위해
 * 목표각 -> 완전 신전/외전 경계까지 전역 1D 스윕 후 이진 탐색으로 정확한 접촉 경계를 찾는다.
 */
function globalUncurlBoundarySearch(
  spec: HandPoseSpec,
  targetAngles: FingerPoseAngles,
  finger: HandFingerId,
  prop: GraspPropPrimitive,
  clearanceMarginMm: number,
): HandPoseSpec | null {
  const lim = HAND_FINGER_ROM_LIMITS[finger];
  const escapeTargets: readonly FingerPoseAngles[] =
    finger === "thumb"
      ? [
          { mcpFlexDeg: lim.mcpFlex.minDeg, mcpAbductDeg: lim.mcpAbduct.maxDeg, pipFlexDeg: 0, dipFlexDeg: 0, oppositionDeg: 0 },
          { mcpFlexDeg: 0, mcpAbductDeg: lim.mcpAbduct.maxDeg, pipFlexDeg: 0, dipFlexDeg: 0, oppositionDeg: lim.opposition.maxDeg },
          { mcpFlexDeg: lim.mcpFlex.minDeg, mcpAbductDeg: targetAngles.mcpAbductDeg, pipFlexDeg: lim.pipFlex.minDeg, dipFlexDeg: lim.dipFlex.minDeg, oppositionDeg: Math.max(0, (targetAngles.oppositionDeg ?? 0) - 25) },
        ]
      : [
          { mcpFlexDeg: lim.mcpFlex.minDeg, mcpAbductDeg: targetAngles.mcpAbductDeg, pipFlexDeg: 0, dipFlexDeg: 0, oppositionDeg: 0 },
          { mcpFlexDeg: lim.mcpFlex.minDeg, mcpAbductDeg: lim.mcpAbduct.maxDeg, pipFlexDeg: 0, dipFlexDeg: 0, oppositionDeg: 0 },
          { mcpFlexDeg: lim.mcpFlex.maxDeg, mcpAbductDeg: lim.mcpAbduct.maxDeg, pipFlexDeg: lim.pipFlex.maxDeg, dipFlexDeg: lim.dipFlex.maxDeg, oppositionDeg: 0 },
        ];

  let bestSpec: HandPoseSpec | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  for (let eIdx = 0; eIdx < escapeTargets.length; eIdx += 1) {
    const escapeAngles = escapeTargets[eIdx];
    if (escapeAngles === undefined) {
      continue;
    }
    let cleanT: number | null = null;
    const samples = 16;
    for (let s = 1; s <= samples; s += 1) {
      const t = s / samples;
      const candSpec = withFingerAngles(spec, finger, interpolateFingerAngles(targetAngles, escapeAngles, t));
      if (measureFingerMinClearanceMm(buildHand21JointPose(candSpec), finger, prop) >= clearanceMarginMm) {
        cleanT = t;
        break;
      }
    }
    if (cleanT === null) {
      continue;
    }
    let lo = Math.max(0, cleanT - 1 / samples);
    let hi = cleanT;
    for (let b = 0; b < 10; b += 1) {
      const mid = (lo + hi) * 0.5;
      const midSpec = withFingerAngles(spec, finger, interpolateFingerAngles(targetAngles, escapeAngles, mid));
      if (measureFingerMinClearanceMm(buildHand21JointPose(midSpec), finger, prop) >= clearanceMarginMm) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    const finalSpec = withFingerAngles(spec, finger, interpolateFingerAngles(targetAngles, escapeAngles, hi));
    const cost = computeFingerCost(buildHand21JointPose(finalSpec), finger, prop, targetAngles, clearanceMarginMm);
    if (cost < bestCost) {
      bestCost = cost;
      bestSpec = finalSpec;
    }
  }

  return bestSpec;
}

function solveSingleFinger(
  spec: HandPoseSpec,
  targetSpec: HandPoseSpec,
  finger: HandFingerId,
  prop: GraspPropPrimitive,
  clearanceMarginMm: number,
): HandPoseSpec {
  const lim = HAND_FINGER_ROM_LIMITS[finger];
  const targetAngles = targetSpec.fingers[finger];
  let bestSpec = spec;
  let bestCost = computeFingerCost(buildHand21JointPose(bestSpec), finger, prop, targetAngles, clearanceMarginMm);

  const swept = globalUncurlBoundarySearch(spec, targetAngles, finger, prop, clearanceMarginMm);
  if (swept !== null) {
    const sweptCost = computeFingerCost(buildHand21JointPose(swept), finger, prop, targetAngles, clearanceMarginMm);
    if (sweptCost < bestCost) {
      bestSpec = swept;
      bestCost = sweptCost;
    }
  }

  const fields: readonly ("mcpFlexDeg" | "pipFlexDeg" | "dipFlexDeg" | "mcpAbductDeg" | "oppositionDeg")[] =
    finger === "thumb"
      ? ["mcpFlexDeg", "pipFlexDeg", "dipFlexDeg", "mcpAbductDeg", "oppositionDeg"]
      : ["mcpFlexDeg", "pipFlexDeg", "dipFlexDeg", "mcpAbductDeg"];

  for (const step of [10, 4, 1.5, 0.4]) {
    for (let repeat = 0; repeat < 2; repeat += 1) {
      let improved = false;
      for (const field of fields) {
        const cur = bestSpec.fingers[finger];
        const range =
          field === "mcpFlexDeg"
            ? lim.mcpFlex
            : field === "pipFlexDeg"
              ? lim.pipFlex
              : field === "dipFlexDeg"
                ? lim.dipFlex
                : field === "mcpAbductDeg"
                  ? lim.mcpAbduct
                  : lim.opposition;
        const baseVal = field === "oppositionDeg" ? (cur.oppositionDeg ?? 0) : cur[field];
        for (const val of [clampNumber(baseVal - step, range.minDeg, range.maxDeg), clampNumber(baseVal + step, range.minDeg, range.maxDeg)]) {
          if (Math.abs(val - baseVal) < 1e-6) {
            continue;
          }
          const candSpec = withFingerAngles(bestSpec, finger, { ...cur, [field]: roundFixed(val, 3) });
          const candCost = computeFingerCost(buildHand21JointPose(candSpec), finger, prop, targetAngles, clearanceMarginMm);
          if (candCost + 1e-7 < bestCost) {
            bestCost = candCost;
            bestSpec = candSpec;
            improved = true;
          }
        }
      }
      if (!improved) {
        break;
      }
    }
  }

  return bestSpec;
}

/**
 * 소품 관통 0건(`penetrationCount === 0`, 최대 관통 `< 0.05mm`) 및 손가락 간 자체 관통 0건을
 * 달성하는 결정론 파지 교정 솔버.
 */
export function solveCollisionFreeHandGrasp(
  rawSpec: HandPoseSpec,
  prop: GraspPropPrimitive,
  options?: SolveGraspOptions,
): CollisionFreeGraspResult {
  const maxIterations = clampNumber(options?.maxIterations ?? 20, 4, 50);
  const contactToleranceMm = options?.contactToleranceMm ?? DEFAULT_CONTACT_TOLERANCE_MM;
  const clearanceMarginMm = clampNumber(
    options?.clearanceMarginMm ?? SOLVER_CLEARANCE_TARGET_MM,
    0.1,
    2.5,
  );
  const allowWristOffset = options?.allowWristOffset ?? true;

  const beforeRomAudit = auditHandAnatomicalRom(rawSpec);
  const beforePose = buildHand21JointPose(rawSpec);
  const beforePropAudit = auditGraspPropPenetration(beforePose, prop, contactToleranceMm);
  const beforeSelfAudit = auditHandSelfPenetration(beforePose);

  const targetClampedSpec = clampHandPoseSpecToRom(rawSpec);
  let workingSpec: HandPoseSpec = targetClampedSpec;
  const initialTranslation = rawSpec.wristTranslationMm ?? vec3(0, 0, 0);
  let iterationsUsed = 0;

  // 1단계: 손바닥 중수골 자체가 소품에 파묻힌 경우 외향 법선 방향으로 최소 후퇴
  if (allowWristOffset) {
    for (let k = 0; k < 14; k += 1) {
      const pose = buildHand21JointPose(workingSpec);
      const audit = auditGraspPropPenetration(pose, prop, contactToleranceMm);
      const metaHits = audit.capsuleSamples.filter(
        (s) => s.kind === "metacarpal" && s.signedDistanceMm < clearanceMarginMm,
      );
      if (metaHits.length === 0) {
        break;
      }
      let pushVec = vec3(0, 0, 0);
      let maxPush = 0;
      for (let i = 0; i < metaHits.length; i += 1) {
        const hit = metaHits[i];
        if (hit === undefined) {
          continue;
        }
        const need = clearanceMarginMm - hit.signedDistanceMm + 0.15;
        if (need > maxPush) {
          maxPush = need;
        }
        pushVec = addVec3(pushVec, scaleVec3(hit.outwardNormal, need));
      }
      const pushDir = normalizeVec3(pushVec, scaleVec3(pose.palmNormal, -1));
      const curTrans = workingSpec.wristTranslationMm ?? vec3(0, 0, 0);
      workingSpec = {
        ...workingSpec,
        wristTranslationMm: addVec3(curTrans, scaleVec3(pushDir, maxPush)),
      };
      iterationsUsed += 1;
    }
  }

  // 2단계: 각 충돌 손가락에 전역 굴곡 스윕 + 미세 좌표 교정 수행
  for (let iter = 0; iter < maxIterations; iter += 1) {
    const pose = buildHand21JointPose(workingSpec);
    const propAudit = auditGraspPropPenetration(pose, prop, contactToleranceMm);
    const selfAudit = auditHandSelfPenetration(pose);

    if (
      propAudit.penetrationCount === 0 &&
      propAudit.maxPenetrationMm < GRASP_PENETRATION_THRESHOLD_MM &&
      selfAudit.selfPenetrationCount === 0 &&
      selfAudit.maxSelfPenetrationMm < GRASP_PENETRATION_THRESHOLD_MM
    ) {
      break;
    }

    iterationsUsed += 1;
    const activeFingers = new Set<HandFingerId>(propAudit.collidingFingers);
    for (let i = 0; i < selfAudit.pairs.length; i += 1) {
      const pair = selfAudit.pairs[i];
      if (pair !== undefined) {
        activeFingers.add(pair.fingerA);
        activeFingers.add(pair.fingerB);
      }
    }

    for (let i = 0; i < HAND_FINGER_IDS.length; i += 1) {
      const finger = HAND_FINGER_IDS[i];
      if (finger !== undefined && activeFingers.has(finger)) {
        workingSpec = solveSingleFinger(
          workingSpec,
          targetClampedSpec,
          finger,
          prop,
          clearanceMarginMm,
        );
      }
    }

    // 3단계: 관절 ROM 한계만으로도 남는 불가피한 관통이 있을 때만 손바닥 법선 반대 방향으로 진동 없이 후퇴
    if (allowWristOffset) {
      const postPose = buildHand21JointPose(workingSpec);
      const postAudit = auditGraspPropPenetration(postPose, prop, contactToleranceMm);
      if (postAudit.penetrationCount > 0) {
        const retreatDir = normalizeVec3(scaleVec3(postPose.palmNormal, -1), vec3(0, 0, -1));
        const nudge = postAudit.maxPenetrationMm + clearanceMarginMm;
        const curTrans = workingSpec.wristTranslationMm ?? vec3(0, 0, 0);
        workingSpec = {
          ...workingSpec,
          wristTranslationMm: addVec3(curTrans, scaleVec3(retreatDir, nudge)),
        };
      }
    }
  }

  const solvedSpec = clampHandPoseSpecToRom(workingSpec);
  const solvedPose = buildHand21JointPose(solvedSpec);
  const afterRomAudit = auditHandAnatomicalRom(solvedSpec);
  const afterPropAudit = auditGraspPropPenetration(solvedPose, prop, contactToleranceMm);
  const afterSelfAudit = auditHandSelfPenetration(solvedPose);
  const finalTrans = solvedSpec.wristTranslationMm ?? vec3(0, 0, 0);

  const converged =
    afterRomAudit.passed &&
    afterPropAudit.penetrationCount === 0 &&
    afterPropAudit.maxPenetrationMm < GRASP_PENETRATION_THRESHOLD_MM &&
    afterSelfAudit.selfPenetrationCount === 0 &&
    afterSelfAudit.maxSelfPenetrationMm < GRASP_PENETRATION_THRESHOLD_MM;

  return {
    converged,
    iterationsUsed,
    beforePose,
    solvedPose,
    solvedSpec,
    beforeRomAudit,
    afterRomAudit,
    beforePropAudit,
    afterPropAudit,
    beforeSelfAudit,
    afterSelfAudit,
    wristOffsetAppliedMm: vec3(
      roundFixed(finalTrans.x - initialTranslation.x, 4),
      roundFixed(finalTrans.y - initialTranslation.y, 4),
      roundFixed(finalTrans.z - initialTranslation.z, 4),
    ),
    handPoseSha256Hex: computeHandPoseManifestSha256(solvedPose, prop),
  };
}

/**
 * 핀홀 3D->2D 투영에서 5손가락 끝(TIP) 겹침을 감사하고 미세 손목 회전·외전으로 분리도를 개선한다.
 */
export function auditHandSilhouetteClarity(
  pose: Hand21JointPose,
  camera: HandCameraProjectionSpec = DEFAULT_HAND_CAMERA_SPEC,
  options?: SilhouetteAuditOptions,
): HandSilhouetteClarityAudit {
  return runHandSilhouetteClarityAudit(
    pose,
    camera,
    {
      isCollisionFree: (candPose, prop): boolean => {
        if (auditHandSelfPenetration(candPose).selfPenetrationCount > 0) {
          return false;
        }
        if (prop !== undefined && auditGraspPropPenetration(candPose, prop).penetrationCount > 0) {
          return false;
        }
        return true;
      },
      computePoseSha256: computeHandPoseManifestSha256,
    },
    options,
  );
}
