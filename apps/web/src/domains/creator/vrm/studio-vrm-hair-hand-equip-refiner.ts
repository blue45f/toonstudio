import * as THREE from "three";

import { clampStudioVrmJointRotation } from "./studio-vrm-joint-limits";

export type StudioVrmRefinerVec3 = readonly [number, number, number];
export type StudioVrmRefinerSide = "left" | "right";
export type StudioVrmHairZone = "front" | "side" | "back";
export type StudioVrmHairSwapPolicy = "keep" | "atomic-commit" | "dispose";
export type StudioVrmEquipSocketKind = "palm-grip" | "scalp" | "nose-bridge" | "earlobe" | "shoulder-collar";
export type StudioVrmEquipGripKind = "cylinder" | "handle" | "flat" | "pinch" | "support";
export type StudioVrmEmotion12 =
  | "happy" | "sad" | "angry" | "surprised" | "relaxed" | "shy"
  | "smug" | "fear" | "disgust" | "determined" | "sleepy" | "crying";
export type StudioVrmVisemeKey = "aa" | "ih" | "ou" | "ee" | "oh";

export const STUDIO_VRM_HAND_DIP_PIP_RATIO = 0.67;
export const STUDIO_VRM_12_EMOTIONS: readonly StudioVrmEmotion12[] = Object.freeze([
  "happy", "sad", "angry", "surprised", "relaxed", "shy",
  "smug", "fear", "disgust", "determined", "sleepy", "crying",
]);
export const STUDIO_VRM_VISEME_KEYS: readonly StudioVrmVisemeKey[] = Object.freeze([
  "aa", "ih", "ou", "ee", "oh",
]);

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const FINGER_NAMES = ["Index", "Middle", "Ring", "Little"] as const;

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const clamp01 = (v: number): number => clamp(v, 0, 1);
const finiteOr = (v: unknown, fb: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fb);
function smoothstep(e0: number, e1: number, v: number): number {
  if (e0 === e1) return v < e0 ? 0 : 1;
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/* ── 1. 헤어 두피 밀착·관통 0mm 솔버 · 3구역 스프링 감쇠 상한 · 캡슐 콜라이더 · 전환/하이라이트 ── */

export interface StudioVrmHairScalpFitOptions {
  readonly minScalpMargin?: number; readonly crownCompression?: number; readonly crownLatitudeMin?: number;
  readonly headAspectScale?: StudioVrmRefinerVec3; readonly earArchRelief?: number; readonly neckClearance?: number;
}
export interface StudioVrmHairSkullEllipsoid {
  readonly center: StudioVrmRefinerVec3; readonly radiusX: number; readonly radiusY: number; readonly radiusZ: number;
  readonly earCenterY?: number; readonly neckTopY?: number; readonly neckRadius?: number;
}
export interface StudioVrmHairScalpFitReport {
  readonly vertices: readonly StudioVrmRefinerVec3[]; readonly maxPenetrationMm: number;
  readonly maxFloatMm: number; readonly compressedVertexCount: number;
}

/** 단위 두피 캡 정점을 두개골 바깥 껍질에 밀착 정형한다(관통 0mm + 모자 Crown Compression). */
export function fitStudioVrmHairScalpVertex(
  x: number,
  y: number,
  z: number,
  options: StudioVrmHairScalpFitOptions = {},
): StudioVrmRefinerVec3 {
  const minMargin = clamp(finiteOr(options.minScalpMargin, 0.008), 0.002, 0.08);
  const crownCompression = clamp01(finiteOr(options.crownCompression, 0));
  const crownLatMin = clamp(finiteOr(options.crownLatitudeMin, 0.42), 0.1, 0.85);
  const earRelief = clamp01(finiteOr(options.earArchRelief, 0.45));
  const neckClearance = clamp01(finiteOr(options.neckClearance, 0.5));
  const lower = clamp01((0.58 - y) / 1.18);
  const front = clamp01(z);
  const side = clamp01(Math.abs(x));
  const crown = clamp01((y + 0.1) / 1.1);
  const earBand = smoothstep(0.05, 0.42, 1 - Math.abs(y + 0.06) * 2.2) * smoothstep(0.55, 0.92, side);
  const napeBand = smoothstep(-0.15, -0.58, y) * smoothstep(-0.2, -0.75, z);
  const crownWeight = crownCompression > 0 && y > crownLatMin ? smoothstep(crownLatMin, 0.98, y) : 0;

  let nx = x * (1 + crown * 0.022 * (1 - crownCompression * crownWeight * 0.6) + earBand * earRelief * 0.024);
  let ny = y + crown * (1 - side) * (1 - crownCompression * crownWeight) * 0.028;
  let nz = z >= 0
    ? z * (1 + 0.01 * (1 - lower * front) * (1 - crownCompression * crownWeight * 0.5))
    : z * (1 + lower * 0.055 + napeBand * neckClearance * 0.032);
  if (crownWeight > 0) {
    ny -= crownCompression * crownWeight * 0.018;
    const lateralExpand = 1 + crownCompression * crownWeight * 0.04;
    nx *= lateralExpand;
    nz *= lateralExpand;
  }
  const minRadius = 1 + Math.max(0.004, minMargin * (1 - crownCompression * crownWeight * 0.45));
  const radius = Math.hypot(nx, ny, nz);
  if (radius > 1e-6 && radius < minRadius) {
    const push = minRadius / radius;
    nx *= push;
    ny *= push;
    nz *= push;
  }
  return [nx, ny, nz];
}

/** 머리 크기/얼굴 비율 변화에 맞춰 두피 캡 정점군을 자동 밀착 피팅(관통 0mm · 부양 상한 이내). */
export function fitStudioVrmHairScalpCap(
  vertices: readonly StudioVrmRefinerVec3[],
  skull: StudioVrmHairSkullEllipsoid,
  options: StudioVrmHairScalpFitOptions & { readonly maxFloatMm?: number } = {},
): StudioVrmHairScalpFitReport {
  const aspect = options.headAspectScale ?? [1, 1, 1];
  const effRx = Math.max(1e-4, finiteOr(skull.radiusX, 0.1)) * clamp(finiteOr(aspect[0], 1), 0.5, 1.8);
  const effRy = Math.max(1e-4, finiteOr(skull.radiusY, 0.11)) * clamp(finiteOr(aspect[1], 1), 0.5, 1.8);
  const effRz = Math.max(1e-4, finiteOr(skull.radiusZ, 0.105)) * clamp(finiteOr(aspect[2], 1), 0.5, 1.8);
  const meanRadius = (effRx + effRy + effRz) / 3;
  const [cx, cy, cz] = skull.center;
  const minMargin = clamp(finiteOr(options.minScalpMargin, 0.008), 0.002, 0.06);
  const maxFloatM = clamp(finiteOr(options.maxFloatMm, 18), 3, 45) / 1000;
  const crownCompression = clamp01(finiteOr(options.crownCompression, 0));
  const crownLatMin = clamp(finiteOr(options.crownLatitudeMin, 0.42), 0.1, 0.85);
  const neckTopY = finiteOr(skull.neckTopY, cy - effRy * 0.72);
  const neckRadius = Math.max(0.025, finiteOr(skull.neckRadius, effRx * 0.52));
  const maxAllowedNorm = 1 + Math.max(minMargin, maxFloatM / meanRadius);

  let maxPenetrationMm = 0;
  let maxFloatMm = 0;
  let compressedVertexCount = 0;

  const fitted: StudioVrmRefinerVec3[] = vertices.map(([vx, vy, vz]) => {
    let ux = (vx - cx) / effRx;
    let uy = (vy - cy) / effRy;
    let uz = (vz - cz) / effRz;
    let norm = Math.hypot(ux, uy, uz);

    if (crownCompression > 0 && uy > crownLatMin && norm > 1 + minMargin) {
      const weight = smoothstep(crownLatMin, 0.98, uy);
      const targetNorm = Math.max(1 + minMargin, norm - (norm - (1 + minMargin)) * crownCompression * weight * 0.85);
      const scale = targetNorm / norm;
      ux *= scale;
      uy *= scale;
      uz *= scale;
      norm = targetNorm;
      compressedVertexCount += 1;
    }
    if (norm > 1e-6 && norm < 1 + minMargin) {
      const push = (1 + minMargin) / norm;
      ux *= push;
      uy *= push;
      uz *= push;
    } else if (norm > maxAllowedNorm) {
      const pull = maxAllowedNorm / norm;
      ux *= pull;
      uy *= pull;
      uz *= pull;
    }

    let fx = cx + ux * effRx;
    const fy = cy + uy * effRy;
    let fz = cz + uz * effRz;
    let neckGapMm: number | null = null;
    if (fy < neckTopY) {
      const neckDist = Math.hypot(fx - cx, fz - cz);
      const minNeck = neckRadius + 0.002;
      if (neckDist < minNeck) {
        const dirX = neckDist > 1e-6 ? (fx - cx) / neckDist : 0;
        const dirZ = neckDist > 1e-6 ? (fz - cz) / neckDist : -1;
        fx = cx + dirX * minNeck;
        fz = cz + dirZ * minNeck;
      }
      neckGapMm = (Math.hypot(fx - cx, fz - cz) - neckRadius) * 1000;
    }

    const skullGapMm = (Math.hypot((fx - cx) / effRx, (fy - cy) / effRy, (fz - cz) / effRz) - 1) * meanRadius * 1000;
    const surfaceGapMm = neckGapMm !== null ? Math.min(skullGapMm, neckGapMm) : skullGapMm;
    if (surfaceGapMm < 0) maxPenetrationMm = Math.max(maxPenetrationMm, -surfaceGapMm);
    else maxFloatMm = Math.max(maxFloatMm, surfaceGapMm);
    return [fx, fy, fz];
  });

  return Object.freeze({ vertices: Object.freeze(fitted), maxPenetrationMm, maxFloatMm, compressedVertexCount });
}

export interface StudioVrmHairZoneSpringBound {
  readonly stiffnessMin: number; readonly stiffnessMax: number;
  readonly gravityMin: number; readonly gravityMax: number;
  readonly dragMin: number; readonly dragMax: number;
}
/** 앞머리(front) · 옆머리(side) · 뒷머리(back) 3구역 스프링본 감쇠 상한 및 물리 범위. */
export const STUDIO_VRM_HAIR_ZONE_SPRING_BOUNDS: Readonly<
  Record<StudioVrmHairZone, StudioVrmHairZoneSpringBound>
> = Object.freeze({
  front: Object.freeze({ stiffnessMin: 0.92, stiffnessMax: 1.78, gravityMin: 0.04, gravityMax: 0.14, dragMin: 0.56, dragMax: 0.88 }),
  side: Object.freeze({ stiffnessMin: 0.78, stiffnessMax: 1.62, gravityMin: 0.05, gravityMax: 0.18, dragMin: 0.48, dragMax: 0.8 }),
  back: Object.freeze({ stiffnessMin: 0.68, stiffnessMax: 1.56, gravityMin: 0.06, gravityMax: 0.22, dragMin: 0.42, dragMax: 0.74 }),
});

export function resolveStudioVrmHairZone(role: string | undefined, partId = ""): StudioVrmHairZone {
  if (role === "bang" || partId.startsWith("bang")) return "front";
  if (role === "side" || partId.startsWith("side") || partId.includes("lock")) return "side";
  return "back";
}

export function resolveStudioVrmHairZoneSpringTuning(
  length: number,
  heightScale: number,
  zone: StudioVrmHairZone,
): { readonly stiffness: number; readonly gravityPower: number; readonly dragForce: number } {
  const safeHeight = Math.max(0.25, finiteOr(heightScale, 1));
  const slack = clamp01((Math.max(0, finiteOr(length, 0)) - 0.08 * safeHeight) / (0.32 * safeHeight));
  const bound = STUDIO_VRM_HAIR_ZONE_SPRING_BOUNDS[zone];
  return Object.freeze({
    stiffness: bound.stiffnessMax - (bound.stiffnessMax - bound.stiffnessMin) * slack,
    gravityPower: bound.gravityMin + (bound.gravityMax - bound.gravityMin) * slack,
    dragForce: clamp(bound.dragMax - (bound.dragMax - bound.dragMin) * slack, 0, bound.dragMax),
  });
}

export interface StudioVrmHairBodyCollider {
  readonly id: "head" | "neck" | "leftShoulder" | "rightShoulder";
  readonly start: StudioVrmRefinerVec3; readonly end: StudioVrmRefinerVec3; readonly radius: number;
}
export interface StudioVrmHairColliderRigInput {
  readonly headCenter: StudioVrmRefinerVec3; readonly headRadius: number;
  readonly neckBase: StudioVrmRefinerVec3; readonly neckTop: StudioVrmRefinerVec3; readonly neckRadius?: number;
  readonly leftShoulder: StudioVrmRefinerVec3; readonly rightShoulder: StudioVrmRefinerVec3; readonly shoulderRadius?: number;
}

export function buildStudioVrmHairBodyColliders(input: StudioVrmHairColliderRigInput): readonly StudioVrmHairBodyCollider[] {
  const headRadius = Math.max(0.05, finiteOr(input.headRadius, 0.1));
  const neckRadius = Math.max(0.032, finiteOr(input.neckRadius, headRadius * 0.48));
  const shoulderRadius = Math.max(0.045, finiteOr(input.shoulderRadius, headRadius * 0.62));
  const [hx, hy, hz] = input.headCenter;
  const headHalf = headRadius * 0.22;
  return Object.freeze([
    Object.freeze({ id: "head", start: [hx, hy - headHalf, hz] as const, end: [hx, hy + headHalf, hz] as const, radius: headRadius }),
    Object.freeze({ id: "neck", start: input.neckBase, end: input.neckTop, radius: neckRadius }),
    Object.freeze({ id: "leftShoulder", start: input.neckBase, end: input.leftShoulder, radius: shoulderRadius }),
    Object.freeze({ id: "rightShoulder", start: input.neckBase, end: input.rightShoulder, radius: shoulderRadius }),
  ]);
}

function closestOnSegment(p: StudioVrmRefinerVec3, a: StudioVrmRefinerVec3, b: StudioVrmRefinerVec3): StudioVrmRefinerVec3 {
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const sz = b[2] - a[2];
  const lenSq = sx * sx + sy * sy + sz * sz;
  if (lenSq <= 1e-12) return a;
  const t = clamp01(((p[0] - a[0]) * sx + (p[1] - a[1]) * sy + (p[2] - a[2]) * sz) / lenSq);
  return [a[0] + sx * t, a[1] + sy * t, a[2] + sz * t];
}

export interface StudioVrmHairJointSample { readonly worldRest: StudioVrmRefinerVec3; readonly hitRadius: number; }
export interface StudioVrmHairColliderPushoutResult {
  readonly positions: readonly StudioVrmRefinerVec3[];
  readonly pushedJointCount: number;
  readonly residualPenetrationMm: number;
}

/** 헤어 스프링 조인트(뿌리 0번 고정)를 머리·목·어깨 캡슐 밖으로 밀어내 잔여 관통 0mm를 보장한다. */
export function resolveStudioVrmHairColliderPushout(
  joints: readonly StudioVrmHairJointSample[],
  colliders: readonly StudioVrmHairBodyCollider[],
  clearanceM = 0.001,
): StudioVrmHairColliderPushoutResult {
  const margin = Math.max(0, finiteOr(clearanceM, 0.001));
  const positions: [number, number, number][] = joints.map((j) => [j.worldRest[0], j.worldRest[1], j.worldRest[2]]);
  const pushedSet = new Set<number>();

  for (let iter = 0; iter < 4; iter += 1) {
    let anyPushed = false;
    for (let i = 1; i < positions.length; i += 1) {
      const p = positions[i]!;
      const hr = Math.max(0.002, finiteOr(joints[i]!.hitRadius, 0.01));
      for (const c of colliders) {
        const q = closestOnSegment(p, c.start, c.end);
        const dx = p[0] - q[0];
        const dy = p[1] - q[1];
        const dz = p[2] - q[2];
        const dist = Math.hypot(dx, dy, dz);
        const minDist = c.radius + hr + margin;
        if (dist < minDist) {
          const ux = dist > 1e-6 ? dx / dist : (c.id === "rightShoulder" ? -1 : c.id === "leftShoulder" ? 1 : 0);
          const uy = dist > 1e-6 ? dy / dist : 0;
          const uz = dist > 1e-6 ? dz / dist : -1;
          p[0] = q[0] + ux * minDist;
          p[1] = q[1] + uy * minDist;
          p[2] = q[2] + uz * minDist;
          pushedSet.add(i);
          anyPushed = true;
        }
      }
    }
    if (!anyPushed) break;
  }

  let residualPenetrationMm = 0;
  for (let i = 1; i < positions.length; i += 1) {
    const p = positions[i]!;
    const hr = Math.max(0.002, finiteOr(joints[i]!.hitRadius, 0.01));
    for (const c of colliders) {
      const q = closestOnSegment(p, c.start, c.end);
      const gapMm = (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - (c.radius + hr)) * 1000;
      if (gapMm < 0) residualPenetrationMm = Math.max(residualPenetrationMm, -gapMm);
    }
  }
  return Object.freeze({
    positions: Object.freeze(positions.map((p) => Object.freeze([p[0], p[1], p[2]] as const))),
    pushedJointCount: pushedSet.size,
    residualPenetrationMm,
  });
}

export interface StudioVrmHairHighlightRingSpec {
  readonly centerLatitude: number; readonly bandWidth: number; readonly intensity: number; readonly rollRad: number;
}
export function resolveStudioVrmHairHighlightRingSpec(shine: number, style: string): StudioVrmHairHighlightRingSpec {
  const s = clamp01(finiteOr(shine, 0.5));
  return Object.freeze({ centerLatitude: style === "bun" || style === "ponytail" ? 0.54 : 0.48, bandWidth: clamp(0.14 - s * 0.045, 0.08, 0.16), intensity: clamp01(0.18 + s * 0.62), rollRad: 0 });
}
export function evaluateStudioVrmHairHighlightRing(yNormalized: number, shine: number, cross = 0): number {
  const s = clamp01(finiteOr(shine, 0.5));
  const band = Math.exp(-(((clamp(finiteOr(yNormalized, 0), -1, 1) - 0.48) / 0.16) ** 2));
  return clamp01(band * (0.65 + 0.35 * Math.cos(clamp(cross, -1, 1) * Math.PI * 0.5)) * (0.06 + s * 0.24));
}

export interface StudioVrmHairTransitionGuard {
  readonly swapPolicy: StudioVrmHairSwapPolicy; readonly springSettleFrames: number;
  readonly lockNeutralRootBasis: boolean; readonly highlightRing: StudioVrmHairHighlightRingSpec;
}
export function resolveStudioVrmHairTransitionGuard(input: {
  readonly style: string; readonly shine: number; readonly shouldRender: boolean;
  readonly styleChanged: boolean; readonly geometryChanged: boolean;
}): StudioVrmHairTransitionGuard {
  const swapPolicy: StudioVrmHairSwapPolicy = !input.shouldRender ? "dispose" : input.geometryChanged ? "atomic-commit" : "keep";
  return Object.freeze({
    swapPolicy,
    springSettleFrames: !input.shouldRender ? 0 : input.styleChanged ? 3 : input.geometryChanged ? 2 : 0,
    lockNeutralRootBasis: input.geometryChanged && input.shouldRender,
    highlightRing: resolveStudioVrmHairHighlightRingSpec(input.shine, input.style),
  });
}

/* ── 2. 해부학적 15-DOF 손 포즈 정규화 · 역관절·교차 관통 차단 · DIP ≈ 0.67 × PIP 연동 ── */

export interface StudioVrmHand15DofLimits {
  readonly mcpFlexMaxDeg: number; readonly pipFlexMaxDeg: number; readonly dipFlexMaxDeg: number;
  readonly maxSpreadDeg: readonly [number, number, number, number];
  readonly thumbCmcX: readonly [number, number]; readonly thumbCmcY: readonly [number, number]; readonly thumbCmcZ: readonly [number, number];
  readonly thumbMcpY: readonly [number, number]; readonly thumbMcpZ: readonly [number, number]; readonly thumbIpZ: readonly [number, number];
}
export const STUDIO_VRM_HAND_15DOF_LIMITS: StudioVrmHand15DofLimits = Object.freeze({
  mcpFlexMaxDeg: 90, pipFlexMaxDeg: 105, dipFlexMaxDeg: 75,
  maxSpreadDeg: Object.freeze([20, 8, 14, 22] as const),
  thumbCmcX: Object.freeze([-18, 28] as const), thumbCmcY: Object.freeze([-32, 48] as const), thumbCmcZ: Object.freeze([-24, 34] as const),
  thumbMcpY: Object.freeze([-18, 56] as const), thumbMcpZ: Object.freeze([-12, 62] as const), thumbIpZ: Object.freeze([-6, 80] as const),
});

export function resolveStudioVrmAdjacentFingerSpread(
  spreadDeg: readonly [number, number, number, number],
  mcpFlexionDeg: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const c = spreadDeg.map((raw, i) => {
    const dyn = STUDIO_VRM_HAND_15DOF_LIMITS.maxSpreadDeg[i]! * (1 - 0.82 * clamp01(finiteOr(mcpFlexionDeg[i], 0) / 90));
    return clamp(finiteOr(raw, 0), -dyn, dyn);
  });
  const out: [number, number, number, number] = [c[0]!, c[1]!, c[2]!, c[3]!];
  if (out[0] < out[1]) out[0] = out[1];
  if (out[2] > out[1]) out[2] = out[1];
  if (out[3] > out[2]) out[3] = out[2];
  return Object.freeze(out);
}

export interface StudioVrmHandRefineOptions {
  readonly coupleDipToPip?: boolean;
  readonly enforceNonCrossingSpread?: boolean;
  readonly strengthenThumbCmc?: boolean;
}

export function refineStudioVrmHandPose15Dof(
  side: StudioVrmRefinerSide,
  rotations: Readonly<Record<string, readonly [number, number, number]>>,
  options: StudioVrmHandRefineOptions = {},
): Record<string, [number, number, number]> {
  const coupleDip = options.coupleDipToPip ?? true;
  const enforceSpread = options.enforceNonCrossingSpread ?? true;
  const boostCmc = options.strengthenThumbCmc ?? true;
  const sign = side === "left" ? -1 : 1;
  const result: Record<string, [number, number, number]> = {};
  for (const [k, v] of Object.entries(rotations)) {
    if (!k.startsWith(side)) result[k] = [finiteOr(v[0], 0), finiteOr(v[1], 0), finiteOr(v[2], 0)];
  }

  const rawSpreads: number[] = [];
  const mcpDegs: number[] = [];
  const triples: Array<[number, number, number]> = [];
  const present: boolean[] = [];
  for (const name of FINGER_NAMES) {
    const pRot = rotations[`${side}${name}Proximal`];
    const iRot = rotations[`${side}${name}Intermediate`];
    const dRot = rotations[`${side}${name}Distal`];
    present.push(Boolean(pRot || iRot || dRot));
    const mcp = clamp(finiteOr(pRot?.[2], 0) * sign * RAD, 0, STUDIO_VRM_HAND_15DOF_LIMITS.mcpFlexMaxDeg);
    const pip = clamp(finiteOr(iRot?.[2], 0) * sign * RAD, 0, STUDIO_VRM_HAND_15DOF_LIMITS.pipFlexMaxDeg);
    let dip = clamp(finiteOr(dRot?.[2], 0) * sign * RAD, 0, STUDIO_VRM_HAND_15DOF_LIMITS.dipFlexMaxDeg);
    if (coupleDip) {
      const target = Math.min(STUDIO_VRM_HAND_15DOF_LIMITS.dipFlexMaxDeg, pip * STUDIO_VRM_HAND_DIP_PIP_RATIO);
      dip = pip >= 8
        ? clamp(dip, Math.min(pip, target * 0.8), Math.min(pip, Math.min(STUDIO_VRM_HAND_15DOF_LIMITS.dipFlexMaxDeg, target * 1.18)))
        : Math.min(dip, pip);
    }
    rawSpreads.push(finiteOr(pRot?.[1], 0) * sign * RAD);
    mcpDegs.push(mcp);
    triples.push([mcp, pip, dip]);
  }

  const spreads = enforceSpread
    ? resolveStudioVrmAdjacentFingerSpread([rawSpreads[0]!, rawSpreads[1]!, rawSpreads[2]!, rawSpreads[3]!], [mcpDegs[0]!, mcpDegs[1]!, mcpDegs[2]!, mcpDegs[3]!])
    : ([rawSpreads[0]!, rawSpreads[1]!, rawSpreads[2]!, rawSpreads[3]!] as const);

  for (let i = 0; i < FINGER_NAMES.length; i += 1) {
    if (!present[i]) continue;
    const name = FINGER_NAMES[i]!;
    const [mcp, pip, dip] = triples[i]!;
    const pKey = `${side}${name}Proximal`;
    const iKey = `${side}${name}Intermediate`;
    const dKey = `${side}${name}Distal`;
    if (rotations[pKey]) result[pKey] = [...clampStudioVrmJointRotation(pKey, [0, spreads[i]! * sign * DEG, mcp * sign * DEG])];
    if (rotations[iKey]) result[iKey] = [...clampStudioVrmJointRotation(iKey, [0, 0, pip * sign * DEG])];
    if (rotations[dKey]) result[dKey] = [...clampStudioVrmJointRotation(dKey, [0, 0, dip * sign * DEG])];
  }

  const cmcKey = `${side}ThumbMetacarpal`;
  const tmcpKey = `${side}ThumbProximal`;
  const tipKey = `${side}ThumbDistal`;
  const cmcRaw = rotations[cmcKey];
  const tmcpRaw = rotations[tmcpKey];
  const tipRaw = rotations[tipKey];
  if (cmcRaw || tmcpRaw || tipRaw) {
    const tmcpY = clamp(finiteOr(tmcpRaw?.[1], 0) * sign * RAD, ...STUDIO_VRM_HAND_15DOF_LIMITS.thumbMcpY);
    const tmcpZ = clamp(finiteOr(tmcpRaw?.[2], 0) * sign * RAD, ...STUDIO_VRM_HAND_15DOF_LIMITS.thumbMcpZ);
    const tipZ = clamp(finiteOr(tipRaw?.[2], 0) * sign * RAD, ...STUDIO_VRM_HAND_15DOF_LIMITS.thumbIpZ);
    let cmcX = clamp(finiteOr(cmcRaw?.[0], 0) * RAD, ...STUDIO_VRM_HAND_15DOF_LIMITS.thumbCmcX);
    let cmcY = clamp(finiteOr(cmcRaw?.[1], 0) * sign * RAD, ...STUDIO_VRM_HAND_15DOF_LIMITS.thumbCmcY);
    const cmcZ = clamp(finiteOr(cmcRaw?.[2], 0) * sign * RAD, ...STUDIO_VRM_HAND_15DOF_LIMITS.thumbCmcZ);
    if (boostCmc && tmcpZ > 12) {
      cmcX = Math.max(cmcX, Math.min(18, tmcpZ * 0.28));
      cmcY = Math.max(cmcY, Math.min(34, tmcpZ * 0.45));
    }
    if (cmcRaw) result[cmcKey] = [...clampStudioVrmJointRotation(cmcKey, [cmcX * DEG, cmcY * sign * DEG, cmcZ * sign * DEG])];
    if (tmcpRaw) result[tmcpKey] = [...clampStudioVrmJointRotation(tmcpKey, [clamp(finiteOr(tmcpRaw[0], 0) * RAD, -14, 18) * DEG, tmcpY * sign * DEG, tmcpZ * sign * DEG])];
    if (tipRaw) result[tipKey] = [...clampStudioVrmJointRotation(tipKey, [0, clamp(finiteOr(tipRaw[1], 0) * sign * RAD, -10, 14) * sign * DEG, tipZ * sign * DEG])];
  }
  return result;
}

export interface StudioVrmHandAnatomyAudit {
  readonly valid: boolean; readonly reverseJointViolations: number;
  readonly crossingPairs: number; readonly dipPipMaxError: number; readonly thumbCmcActive: boolean;
}
export function auditStudioVrmHandPoseAnatomy(
  side: StudioVrmRefinerSide,
  rotations: Readonly<Record<string, readonly [number, number, number]>>,
): StudioVrmHandAnatomyAudit {
  const sign = side === "left" ? -1 : 1;
  let reverseJointViolations = 0;
  let crossingPairs = 0;
  let dipPipMaxError = 0;
  const spreads: number[] = [];
  for (const name of FINGER_NAMES) {
    const mcp = finiteOr(rotations[`${side}${name}Proximal`]?.[2], 0) * sign * RAD;
    const pip = finiteOr(rotations[`${side}${name}Intermediate`]?.[2], 0) * sign * RAD;
    const dip = finiteOr(rotations[`${side}${name}Distal`]?.[2], 0) * sign * RAD;
    if (mcp < -0.5 || pip < -0.5 || dip < -0.5) reverseJointViolations += 1;
    if (mcp > STUDIO_VRM_HAND_15DOF_LIMITS.mcpFlexMaxDeg + 0.5) reverseJointViolations += 1;
    if (pip > STUDIO_VRM_HAND_15DOF_LIMITS.pipFlexMaxDeg + 0.5) reverseJointViolations += 1;
    if (dip > STUDIO_VRM_HAND_15DOF_LIMITS.dipFlexMaxDeg + 0.5) reverseJointViolations += 1;
    if (pip >= 12) dipPipMaxError = Math.max(dipPipMaxError, Math.abs(dip / pip - STUDIO_VRM_HAND_DIP_PIP_RATIO));
    spreads.push(finiteOr(rotations[`${side}${name}Proximal`]?.[1], 0) * sign * RAD);
  }
  for (let i = 0; i < spreads.length - 1; i += 1) {
    if (spreads[i]! + 0.25 < spreads[i + 1]!) crossingPairs += 1;
  }
  const cmc = rotations[`${side}ThumbMetacarpal`];
  return Object.freeze({
    valid: reverseJointViolations === 0 && crossingPairs === 0 && dipPipMaxError <= 0.22,
    reverseJointViolations,
    crossingPairs,
    dipPipMaxError,
    thumbCmcActive: Boolean(cmc && (Math.abs(cmc[0]) > 0.02 || Math.abs(cmc[1]) > 0.05)),
  });
}

/* ── 3. 소켓별 아이템 밀착 피팅 · 손바닥 법선 정렬 · 모자 상단 헤어 눌림(Crown Compression) ── */

export interface StudioVrmHeadwearCrownCompression {
  readonly active: boolean; readonly compressionFactor: number;
  readonly crownCeilingScale: number; readonly affectedLatitudeMin: number;
}
const CROWN_COMPRESSION_PROFILES: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  cap: [0.68, 0.36], beret: [0.46, 0.44], beanie: [0.76, 0.32], surgicalCap: [0.72, 0.34],
  blender_wizard_hat: [0.58, 0.4], blender_tactical_helmet: [0.85, 0.28], headband: [0.24, 0.48],
});

export function resolveStudioVrmHeadwearCrownCompression(propId: string, bone: string, propScale = 1): StudioVrmHeadwearCrownCompression {
  const profile = bone === "head" ? CROWN_COMPRESSION_PROFILES[propId] : undefined;
  if (!profile) return Object.freeze({ active: false, compressionFactor: 0, crownCeilingScale: 1, affectedLatitudeMin: 1 });
  const compressionFactor = clamp01(profile[0] * clamp(1 / Math.max(0.7, finiteOr(propScale, 1)), 0.72, 1.15));
  return Object.freeze({ active: compressionFactor > 0.01, compressionFactor, crownCeilingScale: 1 - compressionFactor * 0.14, affectedLatitudeMin: profile[1] });
}

export interface StudioVrmPalmGripAlignInput {
  readonly gripAxis: THREE.Vector3; readonly palmNormal: THREE.Vector3; readonly palmForward: THREE.Vector3;
  readonly palmCenter: THREE.Vector3; readonly gripRadius: number; readonly handSize: number;
  readonly side: StudioVrmRefinerSide; readonly gripKind?: StudioVrmEquipGripKind;
}
export interface StudioVrmPalmGripAlignment {
  readonly alignedGripAxis: THREE.Vector3; readonly contactCenter: THREE.Vector3;
  readonly alignmentQuaternion: THREE.Quaternion; readonly surfaceOffsetM: number;
  readonly palmNormalOrthogonality: number; readonly penetrationErrorMm: number;
}

export function alignStudioVrmPropGripToPalm(input: StudioVrmPalmGripAlignInput): StudioVrmPalmGripAlignment {
  const palmNormal = input.palmNormal.lengthSq() > 1e-10 ? input.palmNormal.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const palmForward = input.palmForward.lengthSq() > 1e-10
    ? input.palmForward.clone().addScaledVector(palmNormal, -input.palmForward.dot(palmNormal))
    : new THREE.Vector3(0, 0, 1);
  if (palmForward.lengthSq() <= 1e-10) {
    palmForward.set(Math.abs(palmNormal.x) < 0.8 ? 1 : 0, Math.abs(palmNormal.x) < 0.8 ? 0 : 1, 0);
    palmForward.addScaledVector(palmNormal, -palmForward.dot(palmNormal));
  }
  palmForward.normalize();
  const rawAxis = input.gripAxis.lengthSq() > 1e-10 ? input.gripAxis.clone().normalize() : palmForward.clone();
  const projected = rawAxis.clone().addScaledVector(palmNormal, -rawAxis.dot(palmNormal));
  const alignedGripAxis = projected.lengthSq() > 1e-8 ? projected.normalize() : new THREE.Vector3().crossVectors(palmNormal, palmForward).normalize();
  const alignmentQuaternion = new THREE.Quaternion().setFromUnitVectors(rawAxis, alignedGripAxis).normalize();
  const safeRadius = clamp(finiteOr(input.gripRadius, 0.014), 0.002, 0.08);
  const palmPadM = clamp(clamp(finiteOr(input.handSize, 0.08), 0.04, 0.24) * 0.08, 0.003, 0.01);
  const surfaceOffsetM = safeRadius * (input.gripKind === "flat" ? 0.55 : input.gripKind === "pinch" ? 0.72 : 1) + palmPadM;
  const contactCenter = input.palmCenter.clone().addScaledVector(palmNormal, surfaceOffsetM);
  const signedPalmGap = contactCenter.clone().sub(input.palmCenter).dot(palmNormal) - surfaceOffsetM;
  return Object.freeze({
    alignedGripAxis,
    contactCenter,
    alignmentQuaternion,
    surfaceOffsetM,
    palmNormalOrthogonality: Math.abs(alignedGripAxis.dot(palmNormal)),
    penetrationErrorMm: Math.abs(signedPalmGap) * 1000,
  });
}

export interface StudioVrmEquipSocketSnapMetrics {
  readonly headRadius: number; readonly eyeDistance: number; readonly shoulderWidth: number;
  readonly handSize: number; readonly frontSign?: 1 | -1;
}
export interface StudioVrmEquipSocketSnapResult {
  readonly socketKind: StudioVrmEquipSocketKind; readonly localPosition: StudioVrmRefinerVec3;
  readonly localRotationDeg: StudioVrmRefinerVec3; readonly surfaceClearanceM: number;
}

export function resolveStudioVrmEquipSocketSnap(
  socketKind: StudioVrmEquipSocketKind,
  metrics: StudioVrmEquipSocketSnapMetrics,
  side: StudioVrmRefinerSide = "right",
): StudioVrmEquipSocketSnapResult {
  const headR = clamp(finiteOr(metrics.headRadius, 0.1), 0.05, 0.35);
  const eyeDist = clamp(finiteOr(metrics.eyeDistance, headR * 0.62), 0.025, 0.18);
  const shoulderW = clamp(finiteOr(metrics.shoulderWidth, 0.34), 0.14, 0.85);
  const handSize = clamp(finiteOr(metrics.handSize, 0.08), 0.03, 0.24);
  const front = metrics.frontSign === -1 ? -1 : 1;
  const sideSign = side === "left" ? 1 : -1;
  const yaw = front < 0 ? 180 : 0;
  if (socketKind === "scalp") return Object.freeze({ socketKind, localPosition: [0, headR * 0.98, 0] as const, localRotationDeg: [0, yaw, 0] as const, surfaceClearanceM: 0.002 });
  if (socketKind === "nose-bridge") return Object.freeze({ socketKind, localPosition: [0, headR * 0.18, front * (headR * 0.94 + eyeDist * 0.08)] as const, localRotationDeg: [0, yaw, 0] as const, surfaceClearanceM: 0.003 });
  if (socketKind === "earlobe") return Object.freeze({ socketKind, localPosition: [sideSign * headR * 0.98, -headR * 0.14, -front * headR * 0.08] as const, localRotationDeg: [0, yaw, 0] as const, surfaceClearanceM: 0.002 });
  if (socketKind === "shoulder-collar") return Object.freeze({ socketKind, localPosition: [0, shoulderW * 0.16, -front * shoulderW * 0.12] as const, localRotationDeg: [0, yaw, 0] as const, surfaceClearanceM: 0.005 });
  return Object.freeze({ socketKind, localPosition: [0, -handSize * 0.12, handSize * 0.48] as const, localRotationDeg: [0, 0, 0] as const, surfaceClearanceM: 0.004 });
}

/* ── 4. 12감정 표정 전이 · 음성 립싱크 Blendshape 관통 클램프 ── */

const EMOTION_12_CHANNELS: Readonly<Record<StudioVrmEmotion12, Readonly<Record<string, number>>>> = Object.freeze({
  happy: { happy: 1 }, sad: { sad: 1 }, angry: { angry: 1 }, surprised: { surprised: 1 }, relaxed: { relaxed: 1 },
  shy: { happy: 0.35, relaxed: 0.35, blink: 0.18 }, smug: { happy: 0.55, angry: 0.22, relaxed: 0.2 },
  fear: { surprised: 0.65, sad: 0.45 }, disgust: { angry: 0.58, sad: 0.28, blink: 0.24 },
  determined: { angry: 0.48, relaxed: 0.18 }, sleepy: { relaxed: 0.62, blink: 0.52 },
  crying: { sad: 0.88, blink: 0.35, oh: 0.18 },
});
const MOUTH_FACTOR: Readonly<Record<string, number>> = Object.freeze({
  aa: 1, ih: 0.85, ou: 0.9, ee: 0.82, oh: 0.95,
  happy: 0.45, sad: 0.35, angry: 0.38, surprised: 0.65, relaxed: 0.25,
});

export function transitionStudioVrmExpression12(
  from: Readonly<Partial<Record<StudioVrmEmotion12, number>>>,
  to: Readonly<Partial<Record<StudioVrmEmotion12, number>>>,
  progress: number,
): Readonly<Record<StudioVrmEmotion12, number>> {
  const t = clamp01(finiteOr(progress, 1));
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  const out = {} as Record<StudioVrmEmotion12, number>;
  for (const e of STUDIO_VRM_12_EMOTIONS) {
    const s = clamp01(finiteOr(from[e], 0));
    out[e] = clamp01(s + (clamp01(finiteOr(to[e], 0)) - s) * eased);
  }
  return Object.freeze(out);
}

export interface StudioVrmLipSyncExpressionResult {
  readonly channels: Readonly<Record<string, number>>;
  readonly visemeSum: number;
  readonly mouthBudgetLoad: number;
  readonly eyelidBudgetLoad: number;
  readonly clampedMouth: boolean;
  readonly clampedEyelid: boolean;
}

export function resolveStudioVrmLipSyncExpressionBlend(
  emotions: Readonly<Partial<Record<StudioVrmEmotion12, number>>>,
  visemes: Readonly<Partial<Record<StudioVrmVisemeKey, number>>>,
  blink: Readonly<{ readonly blink?: number; readonly blinkLeft?: number; readonly blinkRight?: number }> = {},
  options: Readonly<{ readonly mouthCeiling?: number }> = {},
): StudioVrmLipSyncExpressionResult {
  const mouthCeiling = clamp(finiteOr(options.mouthCeiling, 1.15), 0.6, 1.35);
  const channels: Record<string, number> = {
    happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0, aa: 0, ih: 0, ou: 0, ee: 0, oh: 0,
    blink: clamp01(finiteOr(blink.blink, 0)), blinkLeft: clamp01(finiteOr(blink.blinkLeft, 0)), blinkRight: clamp01(finiteOr(blink.blinkRight, 0)),
  };
  for (const e of STUDIO_VRM_12_EMOTIONS) {
    const w = clamp01(finiteOr(emotions[e], 0));
    if (w <= 0) continue;
    for (const [ch, g] of Object.entries(EMOTION_12_CHANNELS[e])) channels[ch] = clamp01((channels[ch] ?? 0) + w * g);
  }
  let rawVisemeSum = 0;
  const speech: Record<StudioVrmVisemeKey, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  for (const k of STUDIO_VRM_VISEME_KEYS) {
    speech[k] = Math.max(channels[k] ?? 0, clamp01(finiteOr(visemes[k], 0)));
    rawVisemeSum += speech[k];
  }
  const vScale = rawVisemeSum > 1 ? 1 / rawVisemeSum : 1;
  for (const k of STUDIO_VRM_VISEME_KEYS) channels[k] = speech[k] * vScale;

  const emotionKeys = ["happy", "sad", "angry", "surprised", "relaxed"] as const;
  const computeMouth = () => {
    let visLoad = 0;
    let emoLoad = 0;
    for (const k of STUDIO_VRM_VISEME_KEYS) visLoad += (channels[k] ?? 0) * (MOUTH_FACTOR[k] ?? 1);
    for (const k of emotionKeys) emoLoad += (channels[k] ?? 0) * (MOUTH_FACTOR[k] ?? 0.35);
    return { visLoad, emoLoad, total: visLoad + emoLoad };
  };
  let mouth = computeMouth();
  let clampedMouth = rawVisemeSum > 1;
  if (mouth.total > mouthCeiling) {
    clampedMouth = true;
    if (mouth.emoLoad > 1e-6) {
      const eScale = Math.min(1, Math.max(0, mouthCeiling - mouth.visLoad) / mouth.emoLoad);
      for (const k of emotionKeys) channels[k] = (channels[k] ?? 0) * eScale;
    }
    mouth = computeMouth();
    if (mouth.total > mouthCeiling && mouth.total > 1e-6) {
      const gScale = mouthCeiling / mouth.total;
      for (const k of [...STUDIO_VRM_VISEME_KEYS, ...emotionKeys]) channels[k] = (channels[k] ?? 0) * gScale;
      mouth = computeMouth();
    }
  }
  const squint = (channels.happy ?? 0) * 0.25 + (channels.relaxed ?? 0) * 0.15;
  const eyelidRaw = Math.max(channels.blink ?? 0, channels.blinkLeft ?? 0, channels.blinkRight ?? 0) + squint;
  let clampedEyelid = false;
  if (eyelidRaw > 1) {
    clampedEyelid = true;
    const allowed = Math.max(0, 1 - squint);
    channels.blink = Math.min(channels.blink ?? 0, allowed);
    channels.blinkLeft = Math.min(channels.blinkLeft ?? 0, allowed);
    channels.blinkRight = Math.min(channels.blinkRight ?? 0, allowed);
  }
  return Object.freeze({
    channels: Object.freeze(channels),
    visemeSum: STUDIO_VRM_VISEME_KEYS.reduce((a, k) => a + (channels[k] ?? 0), 0),
    mouthBudgetLoad: mouth.total,
    eyelidBudgetLoad: Math.max(channels.blink ?? 0, channels.blinkLeft ?? 0, channels.blinkRight ?? 0) + squint,
    clampedMouth,
    clampedEyelid,
  });
}

/* ── 5. 팔·어깨 굽힘 의상·근육 볼륨 보정기 · 6. 통합 품질 감사 ── */

export interface StudioVrmArmBendInput {
  readonly shoulderRaiseDeg: number; readonly elbowFlexDeg: number; readonly garmentThicknessM?: number;
}
export interface StudioVrmArmVolumeCompensation {
  readonly deltoidVolumeScale: number; readonly axillaSleeveClearanceM: number; readonly clavicleLiftRad: number;
  readonly bicepBulgeScale: number; readonly elbowCreaseReliefM: number; readonly sleeveFoldTension: number;
}

export function resolveStudioVrmJointVolumeCompensation(
  input: Readonly<{ readonly left: StudioVrmArmBendInput; readonly right: StudioVrmArmBendInput }>,
): Readonly<{ readonly left: StudioVrmArmVolumeCompensation; readonly right: StudioVrmArmVolumeCompensation }> {
  const solve = (arm: StudioVrmArmBendInput): StudioVrmArmVolumeCompensation => {
    const raise = clamp(finiteOr(arm.shoulderRaiseDeg, 0), 0, 175);
    const flex = clamp(finiteOr(arm.elbowFlexDeg, 0), 0, 155);
    const clothM = clamp(finiteOr(arm.garmentThicknessM, 0.004), 0.001, 0.02);
    const rF = smoothstep(20, 145, raise);
    const fF = smoothstep(18, 130, flex);
    return Object.freeze({
      deltoidVolumeScale: 1 + rF * 0.16,
      axillaSleeveClearanceM: clamp(rF * (0.011 + clothM * 0.8), 0, 0.02),
      clavicleLiftRad: clamp(smoothstep(45, 160, raise) * 0.34, 0, 0.36),
      bicepBulgeScale: 1 + fF * 0.15,
      elbowCreaseReliefM: clamp(fF * (0.009 + clothM * 0.7), 0, 0.016),
      sleeveFoldTension: clamp01(Math.max(rF * 0.75, fF)),
    });
  };
  return Object.freeze({ left: solve(input.left), right: solve(input.right) });
}

export interface StudioVrmHairHandEquipAuditInput {
  readonly hairScalpReport: StudioVrmHairScalpFitReport; readonly hairColliderReport: StudioVrmHairColliderPushoutResult;
  readonly handAudit: StudioVrmHandAnatomyAudit; readonly palmAlignment: StudioVrmPalmGripAlignment;
  readonly crownCompression: StudioVrmHeadwearCrownCompression; readonly expressionBlend: StudioVrmLipSyncExpressionResult;
  readonly armVolume: Readonly<{ readonly left: StudioVrmArmVolumeCompensation; readonly right: StudioVrmArmVolumeCompensation }>;
}
export interface StudioVrmHairHandEquipAuditReport {
  readonly overallPass: boolean; readonly hairPenetrationMm: number; readonly hairColliderPenetrationMm: number;
  readonly propContactErrorMm: number; readonly handAnatomyValid: boolean; readonly crownCompressionActive: boolean;
  readonly expressionSafe: boolean; readonly armVolumeSafe: boolean; readonly issues: readonly string[];
}

export function auditStudioVrmHairHandEquipQuality(input: StudioVrmHairHandEquipAuditInput): StudioVrmHairHandEquipAuditReport {
  const issues: string[] = [];
  if (input.hairScalpReport.maxPenetrationMm > 0.01) issues.push(`헤어 두피 관통(${input.hairScalpReport.maxPenetrationMm.toFixed(2)}mm)`);
  if (input.hairColliderReport.residualPenetrationMm > 0.01) issues.push(`헤어 콜라이더 관통(${input.hairColliderReport.residualPenetrationMm.toFixed(2)}mm)`);
  if (!input.handAudit.valid) issues.push(`손 15-DOF 위반(역관절 ${input.handAudit.reverseJointViolations}, 교차 ${input.handAudit.crossingPairs})`);
  if (input.palmAlignment.penetrationErrorMm > 0.1 || input.palmAlignment.palmNormalOrthogonality > 1e-4) {
    issues.push(`소품 손바닥 그립 오차(${input.palmAlignment.penetrationErrorMm.toFixed(2)}mm)`);
  }
  const expressionSafe = input.expressionBlend.visemeSum <= 1.0001
    && input.expressionBlend.mouthBudgetLoad <= 1.3501
    && input.expressionBlend.eyelidBudgetLoad <= 1.0001;
  if (!expressionSafe) issues.push("표정·립싱크 Blendshape 관통 예산 초과");
  const armVolumeSafe = [input.armVolume.left, input.armVolume.right].every(
    (s) => s.deltoidVolumeScale >= 1 && s.deltoidVolumeScale <= 1.2
      && s.bicepBulgeScale >= 1 && s.bicepBulgeScale <= 1.2
      && s.axillaSleeveClearanceM >= 0 && s.elbowCreaseReliefM >= 0,
  );
  if (!armVolumeSafe) issues.push("팔·어깨 볼륨 보정 범위 초과");
  return Object.freeze({
    overallPass: issues.length === 0,
    hairPenetrationMm: input.hairScalpReport.maxPenetrationMm,
    hairColliderPenetrationMm: input.hairColliderReport.residualPenetrationMm,
    propContactErrorMm: input.palmAlignment.penetrationErrorMm,
    handAnatomyValid: input.handAudit.valid,
    crownCompressionActive: input.crownCompression.active,
    expressionSafe,
    armVolumeSafe,
    issues: Object.freeze(issues),
  });
}
