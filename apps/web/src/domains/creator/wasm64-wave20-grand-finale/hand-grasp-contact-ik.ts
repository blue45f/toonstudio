/**
 * Wasm64 Wave 20 Grand Finale — 해부학 15-DOF 손 파지 및 표면 접촉 역기구학(IK) 솔버.
 *
 * 엄지 + 네 손가락(`MCP` 벌림·굽힘, `PIP` 굽힘, 힘줄 연동 `DIP ≈ 0.67 * PIP`)을
 * 원기둥(검 자루·컵), 구체(보주), 직육면체(스마트폰) 해석적 SDF 표면에 관통 없이 밀착시킨다.
 */

import type { Vec3 } from "./perspective-sfx-3d-mesh";

export const HAND_TOTAL_ACTUATED_DOF = 15 as const;
export const DISTAL_TENDON_COUPLING_RATIO = 0.67 as const;

export type HandDigitName = "thumb" | "index" | "middle" | "ring" | "pinky";

export type GraspTargetPrimitive =
  | {
    readonly kind: "cylinder";
    readonly center: Vec3;
    readonly axis: Vec3;
    readonly radius: number;
    readonly halfHeight: number;
    readonly label?: string;
  }
  | {
    readonly kind: "sphere";
    readonly center: Vec3;
    readonly radius: number;
    readonly label?: string;
  }
  | {
    readonly kind: "box";
    readonly center: Vec3;
    readonly halfExtents: Vec3;
    readonly label?: string;
  };

export interface DigitSolvedKinematics {
  readonly digit: HandDigitName;
  readonly mcpAbductionRad: number;
  readonly mcpFlexionRad: number;
  readonly pipFlexionRad: number;
  readonly dipFlexionRad: number;
  readonly tendonCouplingRatio: number;
  readonly joints: {
    readonly mcp: Vec3;
    readonly pip: Vec3;
    readonly dip: Vec3;
    readonly tip: Vec3;
  };
  readonly padRadiusM: number;
  readonly minSurfaceClearanceM: number;
  readonly maxPenetrationDepthM: number;
  readonly inSurfaceContact: boolean;
  readonly contactPointOnSurface: Vec3;
  readonly contactNormal: Vec3;
}

export interface HandGraspSolveInput {
  readonly target: GraspTargetPrimitive;
  readonly handSide?: "right" | "left";
  readonly handScale?: number;
  readonly contactToleranceM?: number;
}

export interface HandGraspSolveResult {
  readonly totalActuatedDof: 15;
  readonly digits: Readonly<Record<HandDigitName, DigitSolvedKinematics>>;
  readonly digitList: readonly DigitSolvedKinematics[];
  readonly palmCenter: Vec3;
  readonly contactDigitCount: number;
  readonly opposingForceClosure: boolean;
  readonly maxPenetrationDepthM: number;
  readonly interPenetrationFree: boolean;
  readonly serverCostKrw: 0;
}

interface DigitAnatomySpec {
  readonly digit: HandDigitName;
  readonly isThumb: boolean;
  readonly axialOffsetM: number;
  readonly lengthsM: readonly [number, number, number];
  readonly padRadiusM: number;
  readonly maxMcpFlexRad: number;
  readonly maxPipFlexRad: number;
}

const DIGIT_ANATOMY_SPECS: readonly DigitAnatomySpec[] = [
  { digit: "thumb", isThumb: true, axialOffsetM: 0.010, lengthsM: [0.036, 0.028, 0.022], padRadiusM: 0.0075, maxMcpFlexRad: 1.25, maxPipFlexRad: 1.45 },
  { digit: "index", isThumb: false, axialOffsetM: 0.026, lengthsM: [0.042, 0.025, 0.018], padRadiusM: 0.0065, maxMcpFlexRad: 1.55, maxPipFlexRad: 1.85 },
  { digit: "middle", isThumb: false, axialOffsetM: 0.009, lengthsM: [0.046, 0.028, 0.019], padRadiusM: 0.0068, maxMcpFlexRad: 1.57, maxPipFlexRad: 1.85 },
  { digit: "ring", isThumb: false, axialOffsetM: -0.009, lengthsM: [0.042, 0.026, 0.018], padRadiusM: 0.0063, maxMcpFlexRad: 1.55, maxPipFlexRad: 1.85 },
  { digit: "pinky", isThumb: false, axialOffsetM: -0.026, lengthsM: [0.034, 0.020, 0.016], padRadiusM: 0.0056, maxMcpFlexRad: 1.52, maxPipFlexRad: 1.82 },
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale3(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len3(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize3(a: Vec3, fallback: Vec3): Vec3 {
  const l = len3(a);
  return l > 1e-9 ? scale3(a, 1 / l) : fallback;
}

/** 해석적 프리미티브(원기둥·구체·직육면체)의 정확한 부호 거리 함수(SDF)와 표면 법선을 계산한다. */
export function evaluatePrimitiveSdf(target: GraspTargetPrimitive, p: Vec3): {
  readonly sdf: number;
  readonly normal: Vec3;
} {
  const rel = sub3(p, target.center);
  if (target.kind === "sphere") {
    const dist = len3(rel);
    const normal = dist > 1e-9 ? scale3(rel, 1 / dist) : vec3(1, 0, 0);
    return { sdf: dist - target.radius, normal };
  }
  if (target.kind === "cylinder") {
    const axis = normalize3(target.axis, vec3(0, 1, 0));
    const axial = dot3(rel, axis);
    const radialVec = sub3(rel, scale3(axis, axial));
    const radialDist = len3(radialVec);
    const dPerp = radialDist - target.radius;
    const dPara = Math.abs(axial) - target.halfHeight;
    const outX = Math.max(dPerp, 0);
    const outY = Math.max(dPara, 0);
    const sdf = Math.min(Math.max(dPerp, dPara), 0) + Math.hypot(outX, outY);
    const rDir = radialDist > 1e-9 ? scale3(radialVec, 1 / radialDist) : vec3(1, 0, 0);
    const aDir = scale3(axis, axial >= 0 ? 1 : -1);
    const normal = outX > 0 || outY > 0
      ? normalize3(add3(scale3(rDir, outX), scale3(aDir, outY)), rDir)
      : (dPerp > dPara ? rDir : aDir);
    return { sdf, normal };
  }
  const hx = Math.max(1e-4, target.halfExtents.x);
  const hy = Math.max(1e-4, target.halfExtents.y);
  const hz = Math.max(1e-4, target.halfExtents.z);
  const qx = Math.abs(rel.x) - hx;
  const qy = Math.abs(rel.y) - hy;
  const qz = Math.abs(rel.z) - hz;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  const outsideLen = Math.hypot(ox, oy, oz);
  const sdf = outsideLen + Math.min(Math.max(qx, qy, qz), 0);
  const sx = rel.x >= 0 ? 1 : -1;
  const sy = rel.y >= 0 ? 1 : -1;
  const sz = rel.z >= 0 ? 1 : -1;
  let normal: Vec3;
  if (outsideLen > 1e-9) {
    normal = vec3((ox * sx) / outsideLen, (oy * sy) / outsideLen, (oz * sz) / outsideLen);
  } else if (qx >= qy && qx >= qz) {
    normal = vec3(sx, 0, 0);
  } else if (qy >= qz) {
    normal = vec3(0, sy, 0);
  } else {
    normal = vec3(0, 0, sz);
  }
  return { sdf, normal };
}

function forwardDigitChain(
  mcp: Vec3,
  forwardDir: Vec3,
  inwardDir: Vec3,
  axialDir: Vec3,
  spec: DigitAnatomySpec,
  scale: number,
  mcpAbd: number,
  mcpFlex: number,
  pipFlex: number,
): { readonly mcp: Vec3; readonly pip: Vec3; readonly dip: Vec3; readonly tip: Vec3; readonly dipFlex: number } {
  const tangentDir = normalize3(
    add3(scale3(forwardDir, Math.cos(mcpAbd)), scale3(axialDir, Math.sin(mcpAbd))),
    forwardDir,
  );
  const dipFlex = DISTAL_TENDON_COUPLING_RATIO * pipFlex;
  const segDir = (ang: number): Vec3 =>
    add3(scale3(tangentDir, Math.cos(ang)), scale3(inwardDir, Math.sin(ang)));

  const pip = add3(mcp, scale3(segDir(mcpFlex), spec.lengthsM[0] * scale));
  const dip = add3(pip, scale3(segDir(mcpFlex + pipFlex), spec.lengthsM[1] * scale));
  const tip = add3(dip, scale3(segDir(mcpFlex + pipFlex + dipFlex), spec.lengthsM[2] * scale));
  return { mcp, pip, dip, tip, dipFlex };
}

function evaluateChainClearance(
  target: GraspTargetPrimitive,
  joints: { readonly mcp: Vec3; readonly pip: Vec3; readonly dip: Vec3; readonly tip: Vec3 },
  padRadiusM: number,
  maxSegmentIndex: 1 | 3,
): { readonly minClearanceM: number; readonly contactPoint: Vec3; readonly contactNormal: Vec3 } {
  const segs: ReadonlyArray<readonly [Vec3, Vec3]> = maxSegmentIndex === 1
    ? [[joints.mcp, joints.pip]]
    : [[joints.mcp, joints.pip], [joints.pip, joints.dip], [joints.dip, joints.tip]];

  let minClearanceM = Infinity;
  let contactPoint = joints.tip;
  let contactNormal = vec3(0, 0, 1);

  for (const [p0, p1] of segs) {
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const samplePt = add3(scale3(p0, 1 - t), scale3(p1, t));
      const { sdf, normal } = evaluatePrimitiveSdf(target, samplePt);
      const clearance = sdf - padRadiusM;
      if (clearance < minClearanceM) {
        minClearanceM = clearance;
        contactNormal = normal;
        contactPoint = sub3(samplePt, scale3(normal, sdf));
      }
    }
  }
  return { minClearanceM, contactPoint, contactNormal };
}

/**
 * 해부학 15-DOF(엄지 + 네 손가락, `DIP = 0.67 * PIP` 힘줄 연동) 손 모델을
 * 해석적 오브젝트 표면에 관통 없이 감싸 쥐도록 접촉 역기구학을 푼다.
 */
export function solveAnatomicalHandGraspIk(input: HandGraspSolveInput): HandGraspSolveResult {
  const { target } = input;
  const handSide = input.handSide ?? "right";
  const scale = clamp(input.handScale ?? 1, 0.5, 1.8);
  const contactTol = Math.max(5e-4, input.contactToleranceM ?? 0.0025);
  const sideSign = handSide === "right" ? 1 : -1;

  const vAxis = target.kind === "cylinder" ? normalize3(target.axis, vec3(0, 1, 0)) : vec3(0, 1, 0);
  const refUp = Math.abs(dot3(vAxis, vec3(0, 0, 1))) < 0.9 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  const uAxis = scale3(normalize3(cross3(vAxis, refUp), vec3(1, 0, 0)), sideSign);
  const wAxis = normalize3(cross3(uAxis, vAxis), vec3(0, 0, 1));

  const halfWidthU = target.kind === "sphere"
    ? target.radius
    : target.kind === "cylinder"
      ? target.radius
      : Math.abs(dot3(uAxis, vec3(target.halfExtents.x, 0, 0)))
        + Math.abs(dot3(uAxis, vec3(0, target.halfExtents.y, 0)))
        + Math.abs(dot3(uAxis, vec3(0, 0, target.halfExtents.z)));

  const halfDepthW = target.kind === "sphere"
    ? target.radius
    : target.kind === "cylinder"
      ? target.radius
      : Math.abs(dot3(wAxis, vec3(target.halfExtents.x, 0, 0)))
        + Math.abs(dot3(wAxis, vec3(0, target.halfExtents.y, 0)))
        + Math.abs(dot3(wAxis, vec3(0, 0, target.halfExtents.z)));

  const axialHalfSpan = target.kind === "sphere"
    ? target.radius * 0.7
    : target.kind === "cylinder"
      ? target.halfHeight * 0.82
      : target.halfExtents.y * 0.85;

  const palmCenter = add3(target.center, scale3(wAxis, halfDepthW + 0.016 * scale));

  const solvedList: DigitSolvedKinematics[] = [];
  const solvedMap = {} as Record<HandDigitName, DigitSolvedKinematics>;

  for (const spec of DIGIT_ANATOMY_SPECS) {
    const padR = spec.padRadiusM * scale;
    const clampedAxial = clamp(spec.axialOffsetM * scale, -axialHalfSpan, axialHalfSpan);

    // 대향 파지: 네 손가락은 (+U -> -W) 사분면을 감싸고, 엄지는 반대편 (-U -> +W) 사분면을 감싸 힘 평형을 이룬다.
    const uSign = spec.isThumb ? -1 : 1;
    const wStartSign = spec.isThumb ? -1 : 1;
    const mcp = add3(
      target.center,
      add3(
        scale3(uAxis, uSign * (halfWidthU + padR + 0.005 * scale)),
        add3(scale3(vAxis, clampedAxial), scale3(wAxis, wStartSign * Math.min(halfDepthW * 0.35, 0.010 * scale))),
      ),
    );

    const digitForwardDir = scale3(wAxis, spec.isThumb ? 1 : -1);
    const inwardDir = scale3(uAxis, -uSign);
    const mcpAbd = target.kind === "sphere"
      ? clamp(-clampedAxial / Math.max(target.radius * 2.2, 0.03), -0.28, 0.28)
      : (spec.isThumb ? 0.10 : clamp(-spec.axialOffsetM * 1.8, -0.12, 0.12));

    let loMcp = 0;
    let hiMcp = Math.min(spec.maxMcpFlexRad, spec.isThumb ? 0.62 : 0.68);
    for (let iter = 0; iter < 18; iter++) {
      const mid = (loMcp + hiMcp) * 0.5;
      const chain = forwardDigitChain(mcp, digitForwardDir, inwardDir, vAxis, spec, scale, mcpAbd, mid, 0);
      if (evaluateChainClearance(target, chain, padR, 3).minClearanceM >= 1.5e-4) loMcp = mid;
      else hiMcp = mid;
    }

    let loPip = 0;
    let hiPip = spec.maxPipFlexRad;
    for (let iter = 0; iter < 22; iter++) {
      const mid = (loPip + hiPip) * 0.5;
      const chain = forwardDigitChain(mcp, digitForwardDir, inwardDir, vAxis, spec, scale, mcpAbd, loMcp, mid);
      if (evaluateChainClearance(target, chain, padR, 3).minClearanceM >= 1.5e-4) loPip = mid;
      else hiPip = mid;
    }

    let finalMcpFlex = loMcp;
    const solvedPipFlex = loPip;
    let finalChain = forwardDigitChain(mcp, digitForwardDir, inwardDir, vAxis, spec, scale, mcpAbd, finalMcpFlex, solvedPipFlex);
    let evalRes = evaluateChainClearance(target, finalChain, padR, 3);

    if (evalRes.minClearanceM > contactTol && finalMcpFlex < spec.maxMcpFlexRad) {
      let mLo = finalMcpFlex;
      let mHi = spec.maxMcpFlexRad;
      for (let iter = 0; iter < 18; iter++) {
        const mid = (mLo + mHi) * 0.5;
        const cTry = forwardDigitChain(mcp, digitForwardDir, inwardDir, vAxis, spec, scale, mcpAbd, mid, solvedPipFlex);
        if (evaluateChainClearance(target, cTry, padR, 3).minClearanceM >= 1.5e-4) mLo = mid;
        else mHi = mid;
      }
      finalMcpFlex = mLo;
      finalChain = forwardDigitChain(mcp, digitForwardDir, inwardDir, vAxis, spec, scale, mcpAbd, finalMcpFlex, solvedPipFlex);
      evalRes = evaluateChainClearance(target, finalChain, padR, 3);
    }

    const penetration = Math.max(0, -evalRes.minClearanceM);
    const digitRes: DigitSolvedKinematics = {
      digit: spec.digit,
      mcpAbductionRad: mcpAbd,
      mcpFlexionRad: finalMcpFlex,
      pipFlexionRad: solvedPipFlex,
      dipFlexionRad: finalChain.dipFlex,
      tendonCouplingRatio: solvedPipFlex > 1e-6 ? finalChain.dipFlex / solvedPipFlex : DISTAL_TENDON_COUPLING_RATIO,
      joints: { mcp: finalChain.mcp, pip: finalChain.pip, dip: finalChain.dip, tip: finalChain.tip },
      padRadiusM: padR,
      minSurfaceClearanceM: evalRes.minClearanceM,
      maxPenetrationDepthM: penetration,
      inSurfaceContact: evalRes.minClearanceM <= contactTol && penetration <= 1e-4,
      contactPointOnSurface: evalRes.contactPoint,
      contactNormal: evalRes.contactNormal,
    };
    solvedList.push(digitRes);
    solvedMap[spec.digit] = digitRes;
  }

  let contactDigitCount = 0;
  let maxPenetrationDepthM = 0;
  for (const d of solvedList) {
    if (d.inSurfaceContact) contactDigitCount++;
    if (d.maxPenetrationDepthM > maxPenetrationDepthM) maxPenetrationDepthM = d.maxPenetrationDepthM;
  }

  const thumbRes = solvedMap.thumb;
  let opposingFingerContacts = 0;
  for (const d of solvedList) {
    if (d.digit !== "thumb" && d.inSurfaceContact && dot3(thumbRes.contactNormal, d.contactNormal) < -0.15) {
      opposingFingerContacts++;
    }
  }

  return {
    totalActuatedDof: HAND_TOTAL_ACTUATED_DOF,
    digits: solvedMap,
    digitList: solvedList,
    palmCenter,
    contactDigitCount,
    opposingForceClosure: thumbRes.inSurfaceContact && opposingFingerContacts >= 2,
    maxPenetrationDepthM,
    interPenetrationFree: maxPenetrationDepthM <= 1e-4,
    serverCostKrw: 0,
  };
}
