import type { CharacterGroomVector3 } from "./character-groom-document";

/**
 * StudioHORANG SHAPER (v1.05, Assembly-CSharp.dll) 역공학 명세 기반
 * 헤어 하이브리드 스플라인·다이아몬드 단면 메쉬·4구역 두피 텍스처 캘리브레이션·DynamicBone 캡슐 충돌 엔진:
 * - `HairData::SetVerticesPosFromControlPoints` (`0x060001c2`): 50/50 Linear-Extrapolated Cardinal Hybrid Spline
 * - `HairData::CreateHairBaseMesh` (`0x060001cf`): 4정점 다이아몬드 단면 + `sin(πt)` 테이퍼 + `0.8` 좌우 능선 샤프니스
 * - `HairBaseData::SetTexture` (`0x060001a9`): 4구역(`0..3`) 두피 UV 스케일·오프셋 보정 테이블
 * - `DynamicBoneCollider` (`0x02000019`): `outside`/`inside` 캡슐 충돌 해결기
 */

export interface ShaperDiamondHairRing {
  readonly ringIndex: number;
  readonly t: number;
  readonly sinTaper: number;
  readonly center: CharacterGroomVector3;
  readonly vertices: readonly [
    CharacterGroomVector3, // 0: top (+normal)
    CharacterGroomVector3, // 1: right (+binormal, 0.8 ridge sharpness)
    CharacterGroomVector3, // 2: bottom (-normal)
    CharacterGroomVector3, // 3: left (-binormal, 0.8 ridge sharpness)
  ];
  readonly vertexSharpness: readonly [number, number, number, number];
}

export interface ShaperDiamondHairMeshResult {
  readonly rings: readonly ShaperDiamondHairRing[];
  readonly positions: Float32Array;
  readonly sharpness: Float32Array;
  readonly indices: Uint16Array;
}

export type ShaperHairBaseZoneIndex = 0 | 1 | 2 | 3;

export interface ShaperHairBaseZoneCalibration {
  readonly zoneIndex: ShaperHairBaseZoneIndex;
  readonly label: string;
  readonly uvScale: readonly [number, number];
  readonly uvOffset: readonly [number, number];
}

export const SHAPER_HAIR_BASE_ZONE_CALIBRATIONS: Readonly<
  Record<ShaperHairBaseZoneIndex, ShaperHairBaseZoneCalibration>
> = Object.freeze({
  0: { zoneIndex: 0, label: "전면 앞머리 (Zone 0)", uvScale: [1.0, 1.0], uvOffset: [0.0, 0.0] },
  1: { zoneIndex: 1, label: "정수리·크라운 (Zone 1)", uvScale: [0.92, 0.95], uvOffset: [0.04, 0.025] },
  2: { zoneIndex: 2, label: "측면 구레나룻 (Zone 2)", uvScale: [0.85, 1.05], uvOffset: [0.075, -0.025] },
  3: { zoneIndex: 3, label: "후두부·목덜미 (Zone 3)", uvScale: [1.08, 0.9], uvOffset: [-0.04, 0.05] },
});

export interface ShaperDynamicBoneCapsuleCollider {
  readonly colliderId: string;
  readonly center: CharacterGroomVector3;
  readonly radius: number;
  readonly height: number;
  readonly direction: "X" | "Y" | "Z";
  readonly bound: "outside" | "inside";
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function add3(a: CharacterGroomVector3, b: CharacterGroomVector3): CharacterGroomVector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(a: CharacterGroomVector3, b: CharacterGroomVector3): CharacterGroomVector3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(v: CharacterGroomVector3, s: number): CharacterGroomVector3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function lerp3(a: CharacterGroomVector3, b: CharacterGroomVector3, t: number): CharacterGroomVector3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function cross3(a: CharacterGroomVector3, b: CharacterGroomVector3): CharacterGroomVector3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(
  v: CharacterGroomVector3,
  fallback: CharacterGroomVector3 = [0, 1, 0],
): CharacterGroomVector3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-7 ? [v[0] / len, v[1] / len, v[2] / len] : fallback;
}

/**
 * `HairData::SetVerticesPosFromControlPoints` (`0x060001c2`) 명세:
 * 제어점 배열에서 선형 보간 `L(t)`과 인접 제어점 외삽 예측 `E(t)`을 50:50으로 혼합하는
 * SHAPER 고유 하이브리드 스플라인 샘플러.
 */
export function evaluateShaperHybridHairSpline(
  controlPoints: readonly CharacterGroomVector3[],
  subdivisionsPerSegment = 4,
): readonly CharacterGroomVector3[] {
  if (controlPoints.length <= 1) return [...controlPoints];
  const steps = Math.max(1, Math.floor(subdivisionsPerSegment));
  const segCount = controlPoints.length - 1;
  const sampled: CharacterGroomVector3[] = [];

  for (let i = 0; i < segCount; i += 1) {
    const pCurr = controlPoints[i]!;
    const pNext = controlPoints[i + 1]!;
    const pPrev = i > 0 ? controlPoints[i - 1]! : pCurr;
    const pNext2 = i + 2 < controlPoints.length ? controlPoints[i + 2]! : pNext;

    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const linear = lerp3(pCurr, pNext, t);
      const extrapPrevFactor = i > 0 ? (i + t) / i : t;
      const extrapNextFactor = (1 - t) / (i + 2);
      const e1 = add3(pCurr, scale3(sub3(pCurr, pPrev), extrapPrevFactor));
      const e2 = add3(pNext, scale3(sub3(pNext, pNext2), extrapNextFactor));
      const extrapolated = lerp3(e1, e2, t);
      const hybrid = lerp3(linear, extrapolated, 0.5);
      sampled.push([
        Number(hybrid[0].toFixed(6)),
        Number(hybrid[1].toFixed(6)),
        Number(hybrid[2].toFixed(6)),
      ]);
    }
  }

  const last = controlPoints[controlPoints.length - 1]!;
  sampled.push([last[0], last[1], last[2]]);
  return sampled;
}

/**
 * `HairData::CreateHairBaseMesh` (`0x060001cf`) 명세:
 * 스플라인 중심선으로부터 링당 4정점 다이아몬드 단면(`top`, `right`, `bottom`, `left`)과
 * `sin((ring / (totalRings - 1)) * π)` 테이퍼, 좌우 능선 `0.8` / 루트·팁 `1.0` 샤프니스를 생성한다.
 */
export function createShaperDiamondHairBaseMesh(input: {
  readonly centerline: readonly CharacterGroomVector3[];
  readonly baseWidth: number;
  readonly thicknessRatio?: number;
  readonly referenceNormal?: CharacterGroomVector3;
}): ShaperDiamondHairMeshResult {
  const pts = input.centerline;
  if (pts.length < 2) {
    return {
      rings: [],
      positions: new Float32Array(0),
      sharpness: new Float32Array(0),
      indices: new Uint16Array(0),
    };
  }

  const halfWidth = Math.max(1e-4, input.baseWidth * 0.5);
  const depthScale = clamp(input.thicknessRatio ?? 0.45, 0.1, 2.0);
  const refNormal = normalize3(input.referenceNormal ?? [0, 0, 1], [0, 0, 1]);
  const totalRings = pts.length;
  const rings: ShaperDiamondHairRing[] = [];
  const positions = new Float32Array(totalRings * 4 * 3);
  const sharpness = new Float32Array(totalRings * 4);

  for (let r = 0; r < totalRings; r += 1) {
    const center = pts[r]!;
    const prev = r > 0 ? pts[r - 1]! : center;
    const next = r + 1 < totalRings ? pts[r + 1]! : center;
    const tangent = normalize3(
      r === 0 ? sub3(next, center) : r === totalRings - 1 ? sub3(center, prev) : sub3(next, prev),
      [0, -1, 0],
    );
    const binormal = normalize3(cross3(tangent, refNormal), [1, 0, 0]);
    const normal = normalize3(cross3(binormal, tangent), [0, 0, 1]);

    const t = r / (totalRings - 1);
    const sinTaper = Math.max(0.08, Math.sin(t * Math.PI));
    const w = halfWidth * sinTaper;
    const d = w * depthScale;

    const vTop = add3(center, scale3(normal, d));
    const vRight = add3(center, scale3(binormal, w));
    const vBottom = add3(center, scale3(normal, -d));
    const vLeft = add3(center, scale3(binormal, -w));

    const isEndpoint = r === 0 || r === totalRings - 1;
    const ringSharpness: readonly [number, number, number, number] = isEndpoint
      ? [1.0, 1.0, 1.0, 1.0]
      : [0.0, 0.8, 0.0, 0.8];

    rings.push({
      ringIndex: r,
      t: Number(t.toFixed(6)),
      sinTaper: Number(sinTaper.toFixed(6)),
      center,
      vertices: [vTop, vRight, vBottom, vLeft],
      vertexSharpness: ringSharpness,
    });

    const ringVerts = [vTop, vRight, vBottom, vLeft] as const;
    for (let vIdx = 0; vIdx < 4; vIdx += 1) {
      const v = ringVerts[vIdx]!;
      const flatIdx = (r * 4 + vIdx) * 3;
      positions[flatIdx] = v[0];
      positions[flatIdx + 1] = v[1];
      positions[flatIdx + 2] = v[2];
      sharpness[r * 4 + vIdx] = ringSharpness[vIdx]!;
    }
  }

  const segCount = totalRings - 1;
  const indices = new Uint16Array(segCount * 4 * 6);
  let writeIdx = 0;
  for (let seg = 0; seg < segCount; seg += 1) {
    const r0 = seg * 4;
    const r1 = (seg + 1) * 4;
    for (let side = 0; side < 4; side += 1) {
      const s0 = side;
      const s1 = (side + 1) % 4;
      indices[writeIdx++] = r0 + s0;
      indices[writeIdx++] = r1 + s0;
      indices[writeIdx++] = r1 + s1;
      indices[writeIdx++] = r0 + s0;
      indices[writeIdx++] = r1 + s1;
      indices[writeIdx++] = r0 + s1;
    }
  }

  return { rings, positions, sharpness, indices };
}

/**
 * `HairBaseData::SetTexture` (`0x060001a9`) 명세:
 * 두피 4구역(`0..3`) 인덱스에 따른 UV 스케일·오프셋 캘리브레이션을 적용한다.
 */
export function calibrateShaperHairBaseZoneUv(
  uv: readonly [number, number],
  zoneIndex: ShaperHairBaseZoneIndex,
): readonly [number, number] {
  const cal = SHAPER_HAIR_BASE_ZONE_CALIBRATIONS[zoneIndex];
  return [
    Number(clamp(uv[0] * cal.uvScale[0] + cal.uvOffset[0], 0, 1).toFixed(6)),
    Number(clamp(uv[1] * cal.uvScale[1] + cal.uvOffset[1], 0, 1).toFixed(6)),
  ];
}

/**
 * `DynamicBoneCollider` (`0x02000019`) 명세:
 * X/Y/Z 축 방향 캡슐 콜라이더의 `outside`(바깥 밀어내기) 및 `inside`(내부 가두기) 충돌을 해결한다.
 */
export function resolveShaperDynamicBoneCapsuleCollision(
  particlePos: CharacterGroomVector3,
  particleRadius: number,
  collider: ShaperDynamicBoneCapsuleCollider,
): { readonly position: CharacterGroomVector3; readonly collided: boolean } {
  const r = Math.max(1e-5, collider.radius);
  const halfSegment = Math.max(0, collider.height * 0.5 - r);
  const axis: CharacterGroomVector3 =
    collider.direction === "X" ? [1, 0, 0] : collider.direction === "Z" ? [0, 0, 1] : [0, 1, 0];

  const p0 = add3(collider.center, scale3(axis, -halfSegment));
  const p1 = add3(collider.center, scale3(axis, halfSegment));
  const seg = sub3(p1, p0);
  const segLenSq = seg[0] * seg[0] + seg[1] * seg[1] + seg[2] * seg[2];
  const rel = sub3(particlePos, p0);
  const t = segLenSq > 1e-8 ? clamp((rel[0] * seg[0] + rel[1] * seg[1] + rel[2] * seg[2]) / segLenSq, 0, 1) : 0;
  const closest = add3(p0, scale3(seg, t));
  const delta = sub3(particlePos, closest);
  const dist = Math.hypot(delta[0], delta[1], delta[2]);

  if (collider.bound === "outside") {
    const minAllowed = r + Math.max(0, particleRadius);
    if (dist < minAllowed) {
      const dir = normalize3(delta, [0, 1, 0]);
      const pushed = add3(closest, scale3(dir, minAllowed));
      return {
        position: [Number(pushed[0].toFixed(6)), Number(pushed[1].toFixed(6)), Number(pushed[2].toFixed(6))],
        collided: true,
      };
    }
    return { position: particlePos, collided: false };
  }

  // inside bound: keep particle within (r - particleRadius)
  const maxAllowed = Math.max(1e-5, r - Math.max(0, particleRadius));
  if (dist > maxAllowed) {
    const dir = normalize3(delta, [0, 1, 0]);
    const clampedPos = add3(closest, scale3(dir, maxAllowed));
    return {
      position: [Number(clampedPos[0].toFixed(6)), Number(clampedPos[1].toFixed(6)), Number(clampedPos[2].toFixed(6))],
      collided: true,
    };
  }
  return { position: particlePos, collided: false };
}

/**
 * `DynamicBone::UpdateParticles1` & `UpdateParticles2` (`0x02000018`) 명세:
 * 베를레 속도 감쇠(`(pos - prevPos) * (1 - damping)`), 부모 이동 관성(`parentDelta * inert`),
 * 탄성 복원(`elasticity`) 및 강성 반경 제한(`stiffness`)을 적분한다.
 */
export function stepShaperDynamicBoneVerletParticle(input: {
  readonly position: CharacterGroomVector3;
  readonly prevPosition: CharacterGroomVector3;
  readonly restPosition: CharacterGroomVector3;
  readonly parentDisplacement?: CharacterGroomVector3;
  readonly segmentLength: number;
  readonly damping: number;
  readonly elasticity: number;
  readonly stiffness: number;
  readonly inert: number;
}): {
  readonly nextPosition: CharacterGroomVector3;
  readonly velocityMagnitude: number;
  readonly stiffnessClamped: boolean;
} {
  const damping = clamp(input.damping, 0, 1);
  const elasticity = clamp(input.elasticity, 0, 1);
  const stiffness = clamp(input.stiffness, 0, 1);
  const inert = clamp(input.inert, 0, 1);
  const parentDelta = input.parentDisplacement ?? [0, 0, 0];

  const vel = scale3(sub3(input.position, input.prevPosition), 1 - damping);
  const withInert = add3(add3(input.position, vel), scale3(parentDelta, inert));
  const pulled = add3(withInert, scale3(sub3(input.restPosition, withInert), elasticity));

  const maxOffset = Math.max(0, input.segmentLength * (1 - stiffness));
  const offsetFromRest = sub3(pulled, input.restPosition);
  const distFromRest = Math.hypot(offsetFromRest[0], offsetFromRest[1], offsetFromRest[2]);

  let finalPos = pulled;
  let stiffnessClamped = false;
  if (distFromRest > maxOffset && distFromRest > 1e-7) {
    finalPos = add3(input.restPosition, scale3(normalize3(offsetFromRest), maxOffset));
    stiffnessClamped = true;
  }

  return {
    nextPosition: [
      Number(finalPos[0].toFixed(6)),
      Number(finalPos[1].toFixed(6)),
      Number(finalPos[2].toFixed(6)),
    ],
    velocityMagnitude: Number(Math.hypot(vel[0], vel[1], vel[2]).toFixed(6)),
    stiffnessClamped,
  };
}

/**
 * `HairData::Update` (`0x060001df`) 식모 휠/키보드 단축키 명세:
 * - `Shift+Scroll`: 길이 배율(`lengthScale`) `±0.2 * scrollSteps`
 * - `Alt+Scroll`: 굽힘/말림(`curl`) `±0.05 * scrollSteps`
 * - `Ctrl+Scroll`: 모근 회전(`rootRotation`) `±10° (0.174533 rad) * scrollSteps`
 * - `=` / `-`: 가닥 두께(`baseWidth`) `±0.01m`
 */
export function applyShaperHairScrollWheelShortcut(
  profile: {
    readonly lengthScale: number;
    readonly baseWidth: number;
    readonly curl: number;
    readonly rootRotation: number;
  },
  action: "shift-scroll-up" | "shift-scroll-down" | "alt-scroll-up" | "alt-scroll-down" | "ctrl-scroll-up" | "ctrl-scroll-down" | "width-inc" | "width-dec",
): {
  readonly lengthScale: number;
  readonly baseWidth: number;
  readonly curl: number;
  readonly rootRotation: number;
} {
  const stepRad = Number(((10 * Math.PI) / 180).toFixed(4));
  switch (action) {
    case "shift-scroll-up":
      return { ...profile, lengthScale: Number(clamp(profile.lengthScale + 0.2, 0.1, 4).toFixed(3)) };
    case "shift-scroll-down":
      return { ...profile, lengthScale: Number(clamp(profile.lengthScale - 0.2, 0.1, 4).toFixed(3)) };
    case "alt-scroll-up":
      return { ...profile, curl: Number(clamp(profile.curl + 0.05, 0, 1).toFixed(3)) };
    case "alt-scroll-down":
      return { ...profile, curl: Number(clamp(profile.curl - 0.05, 0, 1).toFixed(3)) };
    case "ctrl-scroll-up":
      return { ...profile, rootRotation: Number(clamp(profile.rootRotation + stepRad, -Math.PI, Math.PI).toFixed(3)) };
    case "ctrl-scroll-down":
      return { ...profile, rootRotation: Number(clamp(profile.rootRotation - stepRad, -Math.PI, Math.PI).toFixed(3)) };
    case "width-inc":
      return { ...profile, baseWidth: Number(clamp(profile.baseWidth + 0.01, 0.005, 0.25).toFixed(3)) };
    case "width-dec":
      return { ...profile, baseWidth: Number(clamp(profile.baseWidth - 0.01, 0.005, 0.25).toFixed(3)) };
  }
}

