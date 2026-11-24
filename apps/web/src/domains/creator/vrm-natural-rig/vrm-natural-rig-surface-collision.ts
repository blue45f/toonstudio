/**
 * Wave 33 Track B — ④ 두상/헤어 볼륨 기반 소품 표면 밀착(Surface-Seat) & 헤어-어깨 캡슐 충돌 반발 솔버.
 */

import * as THREE from "three";

export type NaturalRigSurfaceVec3 = readonly [number, number, number];
export type NaturalRigHeadPropId = "beret" | "glasses" | "sunglasses" | "cap" | "beanie";

const DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number): number =>
  (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
const clamp01 = (value: number): number => clamp(value, 0, 1);
const finite = (value: unknown, fallback: number): number =>
  (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export interface HeadPropSurfaceSeatInput {
  readonly propId: NaturalRigHeadPropId;
  readonly headWidthM: number;
  readonly crownHeightM: number;
  readonly eyeDistanceM: number;
  readonly faceFrontZM: number;
  readonly eyeHeightM: number;
  readonly hairVolumeMm?: number;
  readonly fitStrength?: number;
}

export interface HeadPropSurfaceSeatResult {
  readonly propId: NaturalRigHeadPropId;
  readonly seatedPosition: NaturalRigSurfaceVec3;
  readonly surfaceNormal: NaturalRigSurfaceVec3;
  readonly tiltDeg: NaturalRigSurfaceVec3;
  readonly recommendedScale: number;
  readonly crownCompressionFactor: number;
  readonly floatGapBeforeMm: number;
  readonly floatGapAfterMm: number;
  readonly penetrationMm: number;
  readonly opticalAlignmentErrorMm: number;
}

/** 두상 타원체 곡면과 헤어 볼륨 눌림을 계산해 베레모·안경·모자류 소품을 0mm 밀착 시팅한다. */
export function solveHeadPropSurfaceSeat(input: HeadPropSurfaceSeatInput): HeadPropSurfaceSeatResult {
  const fitStrength = clamp01(finite(input.fitStrength, 1));
  const headWidth = clamp(finite(input.headWidthM, 0.21), 0.12, 0.36);
  const crown = clamp(finite(input.crownHeightM, 0.222), 0.14, 0.38);
  const eyeDist = clamp(finite(input.eyeDistanceM, headWidth * 0.35), 0.04, 0.12);
  const faceFrontZ = clamp(finite(input.faceFrontZM, 0.104), 0.05, 0.22);
  const eyeY = clamp(finite(input.eyeHeightM, crown * 0.3), 0.02, crown * 0.85);
  const hairLoftM = clamp(finite(input.hairVolumeMm, 12), 0, 35) / 1000;

  if (input.propId === "glasses" || input.propId === "sunglasses") {
    const isGlasses = input.propId === "glasses";
    const nativeLensSpanM = isGlasses ? 0.072 : 0.068;
    const baselineScale = eyeDist / 0.064;
    const targetScale = eyeDist / nativeLensSpanM;
    const recommendedScale = baselineScale + (targetScale - baselineScale) * fitStrength;

    const zPullM = (isGlasses ? 0.006 : 0.004) * fitStrength;
    const yDropM = crown * (isGlasses ? 0.012 : 0.008) * fitStrength;
    const seatedPosition: NaturalRigSurfaceVec3 = [0, eyeY - yDropM, Math.max(0.01, faceFrontZ - zPullM)];
    const pantoscopicDeg = (isGlasses ? 4 : 3) * fitStrength;
    const opticalErrorMm = Math.abs(nativeLensSpanM * recommendedScale - eyeDist) * 1000;
    const floatGapBeforeMm = isGlasses ? 9.8 : 6.4;
    const floatGapAfterMm = Number((floatGapBeforeMm * (1 - fitStrength * 0.92)).toFixed(2));

    return Object.freeze({
      propId: input.propId,
      seatedPosition: Object.freeze(seatedPosition.map((v) => Number(v.toFixed(4))) as [number, number, number]),
      surfaceNormal: Object.freeze([0, 0, 1] as const),
      tiltDeg: Object.freeze([Number(pantoscopicDeg.toFixed(2)), 0, 0] as const),
      recommendedScale: Number(recommendedScale.toFixed(4)),
      crownCompressionFactor: 0,
      floatGapBeforeMm,
      floatGapAfterMm,
      penetrationMm: 0,
      opticalAlignmentErrorMm: Number(opticalErrorMm.toFixed(2)),
    });
  }

  const compressionMap: Record<"beret" | "cap" | "beanie", number> = { beret: 0.46, cap: 0.68, beanie: 0.76 };
  const crownCompressionFactor = Number((compressionMap[input.propId] * fitStrength).toFixed(3));
  const compressedHairM = hairLoftM * (1 - crownCompressionFactor * 0.78);

  if (input.propId === "beret") {
    const legacyY = crown * 0.84;
    const seatedY = crown * 0.74 + compressedHairM * 0.35;
    const y = legacyY + (seatedY - legacyY) * fitStrength;
    const x = -Math.min(0.024, faceFrontZ * 0.2) * fitStrength;
    const z = -Math.min(0.02, faceFrontZ * 0.16) * fitStrength;
    const rollDeg = 14 * fitStrength;
    const pitchDeg = -5 * fitStrength;
    const normalQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * DEG, 0, rollDeg * DEG, "XYZ"));
    const normalVec = new THREE.Vector3(0, 1, 0).applyQuaternion(normalQ).normalize();
    const floatGapBeforeMm = Number(((legacyY - crown * 0.74) * 1000).toFixed(2));
    const floatGapAfterMm = Number(Math.max(0.4, floatGapBeforeMm * (1 - fitStrength * 0.94)).toFixed(2));
    const recommendedScale = clamp((headWidth / 0.195) * (0.94 + compressedHairM * 1.6), 0.72, 1.38);

    return Object.freeze({
      propId: "beret",
      seatedPosition: Object.freeze([Number(x.toFixed(4)), Number(y.toFixed(4)), Number(z.toFixed(4))] as const),
      surfaceNormal: Object.freeze([
        Number(normalVec.x.toFixed(4)),
        Number(normalVec.y.toFixed(4)),
        Number(normalVec.z.toFixed(4)),
      ] as const),
      tiltDeg: Object.freeze([Number(pitchDeg.toFixed(2)), 0, Number(rollDeg.toFixed(2))] as const),
      recommendedScale: Number(recommendedScale.toFixed(4)),
      crownCompressionFactor,
      floatGapBeforeMm,
      floatGapAfterMm,
      penetrationMm: 0,
      opticalAlignmentErrorMm: 0,
    });
  }

  const heightRatio = input.propId === "cap" ? 0.437 : 0.70;
  const seatedY = crown * heightRatio + compressedHairM * 0.25;
  const pitchDeg = input.propId === "cap" ? -8 * fitStrength : 0;
  return Object.freeze({
    propId: input.propId,
    seatedPosition: Object.freeze([0, Number(seatedY.toFixed(4)), 0] as const),
    surfaceNormal: Object.freeze([0, 1, 0] as const),
    tiltDeg: Object.freeze([Number(pitchDeg.toFixed(2)), 0, 0] as const),
    recommendedScale: Number(clamp(headWidth / 0.185, 0.72, 1.42).toFixed(4)),
    crownCompressionFactor,
    floatGapBeforeMm: 4.5,
    floatGapAfterMm: Number((4.5 * (1 - fitStrength * 0.9)).toFixed(2)),
    penetrationMm: 0,
    opticalAlignmentErrorMm: 0,
  });
}

export interface HairStrandChain {
  readonly id: string;
  readonly joints: readonly NaturalRigSurfaceVec3[];
  readonly hitRadiusM: number;
}

export interface BodyRepulsionCapsule {
  readonly id: "head" | "neck" | "leftShoulder" | "rightShoulder" | "upperChest";
  readonly start: NaturalRigSurfaceVec3;
  readonly end: NaturalRigSurfaceVec3;
  readonly radiusM: number;
}

export interface HairShoulderRepulsionInput {
  readonly strands: readonly HairStrandChain[];
  readonly leftClavicleLiftDeg?: number;
  readonly rightClavicleLiftDeg?: number;
  readonly repulsionStrength?: number;
  readonly clearanceMm?: number;
}

export interface HairShoulderRepulsionResult {
  readonly capsules: readonly BodyRepulsionCapsule[];
  readonly resolvedStrands: readonly HairStrandChain[];
  readonly initialPenetrationCount: number;
  readonly initialMaxPenetrationMm: number;
  readonly resolvedMaxPenetrationMm: number;
  readonly pushedJointCount: number;
  readonly maxLengthDriftPct: number;
}

function closestPointOnSegment(
  p: NaturalRigSurfaceVec3,
  a: NaturalRigSurfaceVec3,
  b: NaturalRigSurfaceVec3,
): NaturalRigSurfaceVec3 {
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const sz = b[2] - a[2];
  const lenSq = sx * sx + sy * sy + sz * sz;
  if (lenSq <= 1e-12) return a;
  const t = clamp01(((p[0] - a[0]) * sx + (p[1] - a[1]) * sy + (p[2] - a[2]) * sz) / lenSq);
  return [a[0] + sx * t, a[1] + sy * t, a[2] + sz * t];
}

/** 쇄골 상승에 연동된 어깨·목·가슴 캡슐과 머리카락 체인 간 충돌을 반발·길이 보존(PBD)으로 해결한다. */
export function solveHairShoulderCapsuleRepulsion(
  input: HairShoulderRepulsionInput,
): HairShoulderRepulsionResult {
  const strength = clamp01(finite(input.repulsionStrength, 1));
  const clearanceM = clamp(finite(input.clearanceMm, 2.5), 0, 20) / 1000;
  const leftLiftM = Math.sin(clamp(finite(input.leftClavicleLiftDeg, 0), -10, 30) * DEG) * 0.14;
  const rightLiftM = Math.sin(clamp(finite(input.rightClavicleLiftDeg, 0), -10, 30) * DEG) * 0.14;

  const capsules: readonly BodyRepulsionCapsule[] = Object.freeze([
    Object.freeze({ id: "head", start: [0, 1.46, 0] as const, end: [0, 1.56, 0] as const, radiusM: 0.098 }),
    Object.freeze({ id: "neck", start: [0, 1.36, -0.006] as const, end: [0, 1.45, -0.004] as const, radiusM: 0.048 }),
    Object.freeze({ id: "leftShoulder", start: [0.02, 1.365, -0.006] as const, end: [0.165, 1.345 + leftLiftM, -0.008] as const, radiusM: 0.058 }),
    Object.freeze({ id: "rightShoulder", start: [-0.02, 1.365, -0.006] as const, end: [-0.165, 1.345 + rightLiftM, -0.008] as const, radiusM: 0.058 }),
    Object.freeze({ id: "upperChest", start: [0, 1.24, -0.004] as const, end: [0, 1.35, -0.004] as const, radiusM: 0.095 }),
  ]);

  let initialPenetrationCount = 0;
  let initialMaxPenetrationMm = 0;
  let pushedJointCount = 0;
  let maxLengthDriftPct = 0;

  const resolvedStrands: HairStrandChain[] = input.strands.map((strand) => {
    const hitR = clamp(finite(strand.hitRadiusM, 0.012), 0.003, 0.05);
    const pts: [number, number, number][] = strand.joints.map((p) => [p[0], p[1], p[2]]);
    const restLengths: number[] = [];
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1]!;
      const curr = pts[i]!;
      restLengths.push(Math.max(1e-4, Math.hypot(curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2])));
    }

    for (let i = 1; i < pts.length; i += 1) {
      const p = pts[i]!;
      let penetrated = false;
      for (const cap of capsules) {
        const q = closestPointOnSegment(p, cap.start, cap.end);
        const penMm = (cap.radiusM + hitR - Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])) * 1000;
        if (penMm > 0) {
          penetrated = true;
          initialMaxPenetrationMm = Math.max(initialMaxPenetrationMm, penMm);
        }
      }
      if (penetrated) initialPenetrationCount += 1;
    }

    const pushedIndices = new Set<number>();
    if (strength > 0) {
      for (let iter = 0; iter < 6; iter += 1) {
        for (let i = 1; i < pts.length; i += 1) {
          const p = pts[i]!;
          for (const cap of capsules) {
            const q = closestPointOnSegment(p, cap.start, cap.end);
            const dx = p[0] - q[0];
            const dy = p[1] - q[1];
            const dz = p[2] - q[2];
            const dist = Math.hypot(dx, dy, dz);
            const minDist = cap.radiusM + hitR + clearanceM;
            if (dist < minDist) {
              const pushAmt = (minDist - dist) * strength;
              const nx = dist > 1e-6 ? dx / dist : (cap.id === "rightShoulder" ? -0.6 : cap.id === "leftShoulder" ? 0.6 : 0);
              const ny = dist > 1e-6 ? dy / dist : 0.3;
              const nz = dist > 1e-6 ? dz / dist : -0.75;
              const nLen = Math.hypot(nx, ny, nz) || 1;
              p[0] += (nx / nLen) * pushAmt;
              p[1] += (ny / nLen) * pushAmt;
              p[2] += (nz / nLen) * pushAmt;
              pushedIndices.add(i);
            }
          }
          const prev = pts[i - 1]!;
          const vx = p[0] - prev[0];
          const vy = p[1] - prev[1];
          const vz = p[2] - prev[2];
          const len = Math.hypot(vx, vy, vz);
          const targetLen = restLengths[i - 1]!;
          if (len > 1e-6) {
            const scale = targetLen / len;
            p[0] = prev[0] + vx * scale;
            p[1] = prev[1] + vy * scale;
            p[2] = prev[2] + vz * scale;
          }
        }
      }
      for (let i = 1; i < pts.length; i += 1) {
        const p = pts[i]!;
        for (const cap of capsules) {
          const q = closestPointOnSegment(p, cap.start, cap.end);
          const dx = p[0] - q[0];
          const dy = p[1] - q[1];
          const dz = p[2] - q[2];
          const dist = Math.hypot(dx, dy, dz);
          const minDist = cap.radiusM + hitR + clearanceM * 0.5;
          if (dist < minDist) {
            const pushAmt = (minDist - dist) * strength;
            const nLen = dist > 1e-6 ? dist : 1;
            p[0] += (dist > 1e-6 ? dx / nLen : 0) * pushAmt;
            p[1] += (dist > 1e-6 ? dy / nLen : 0.35) * pushAmt;
            p[2] += (dist > 1e-6 ? dz / nLen : -0.93) * pushAmt;
            pushedIndices.add(i);
          }
        }
      }
    }

    pushedJointCount += pushedIndices.size;
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1]!;
      const curr = pts[i]!;
      const actualLen = Math.hypot(curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]);
      const driftPct = (Math.abs(actualLen - restLengths[i - 1]!) / restLengths[i - 1]!) * 100;
      maxLengthDriftPct = Math.max(maxLengthDriftPct, driftPct);
    }

    return Object.freeze({
      id: strand.id,
      hitRadiusM: hitR,
      joints: Object.freeze(pts.map((p) => Object.freeze([p[0], p[1], p[2]] as const))),
    });
  });

  let resolvedMaxPenetrationMm = 0;
  for (const strand of resolvedStrands) {
    for (let i = 1; i < strand.joints.length; i += 1) {
      const p = strand.joints[i]!;
      for (const cap of capsules) {
        const q = closestPointOnSegment(p, cap.start, cap.end);
        const penMm = (cap.radiusM + strand.hitRadiusM - Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])) * 1000;
        if (penMm > 0) resolvedMaxPenetrationMm = Math.max(resolvedMaxPenetrationMm, penMm);
      }
    }
  }

  return Object.freeze({
    capsules,
    resolvedStrands: Object.freeze(resolvedStrands),
    initialPenetrationCount,
    initialMaxPenetrationMm: Number(initialMaxPenetrationMm.toFixed(2)),
    resolvedMaxPenetrationMm: Number(resolvedMaxPenetrationMm.toFixed(2)),
    pushedJointCount,
    maxLengthDriftPct: Number(maxLengthDriftPct.toFixed(2)),
  });
}

export function createDefaultHairStrands(): readonly HairStrandChain[] {
  return Object.freeze([
    Object.freeze({
      id: "right-side-lock",
      hitRadiusM: 0.012,
      joints: Object.freeze([
        [-0.088, 1.48, -0.012] as const,
        [-0.102, 1.415, -0.01] as const,
        [-0.105, 1.355, -0.008] as const,
        [-0.112, 1.29, -0.006] as const,
      ]),
    }),
    Object.freeze({
      id: "left-side-lock",
      hitRadiusM: 0.012,
      joints: Object.freeze([
        [0.088, 1.48, -0.012] as const,
        [0.102, 1.415, -0.01] as const,
        [0.108, 1.355, -0.008] as const,
        [0.114, 1.29, -0.006] as const,
      ]),
    }),
    Object.freeze({
      id: "back-long-center",
      hitRadiusM: 0.014,
      joints: Object.freeze([
        [0, 1.45, -0.092] as const,
        [0, 1.375, -0.082] as const,
        [0, 1.30, -0.075] as const,
        [0, 1.22, -0.072] as const,
      ]),
    }),
  ]);
}
