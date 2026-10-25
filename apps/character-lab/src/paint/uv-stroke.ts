/**
 * UV 공간 스트로크 보간: 두 입력점 사이를 brush.spacing(반지름 비율) 간격으로 dab을 채운다.
 * - 간격은 픽셀 거리 기준(du·width, dv·height)이며 세그먼트 사이의 잔여 거리(carry)를 이어받아
 *   스트로크 전체에서 dab 간격이 일정하다.
 * - wrap이면 UV 경계(0↔1)를 넘는 최단 경로로 보간하고 결과 UV를 [0,1)로 감는다.
 */
import { wrapUnit } from "./paint-layer";

import type { BrushDab, BrushSettings, Vec3 } from "../contracts";

export interface LayerSize {
  readonly width: number;
  readonly height: number;
}

export interface InterpolateOptions {
  readonly wrap?: boolean;
  /** 이전 세그먼트에서 마지막 dab 이후 진행한 픽셀 거리(0 = 새 스트로크) */
  readonly carry?: number;
}

export interface DabInterpolation {
  /** `from`을 제외하고 `to` 방향으로 배치한 dab(간격 순) */
  readonly dabs: BrushDab[];
  /** 마지막 dab 이후 `to`까지 남은 픽셀 거리(다음 세그먼트의 carry) */
  readonly carry: number;
  /** 이 세그먼트의 픽셀 길이 */
  readonly lengthPx: number;
}

/** dab 간격(px). 최소 0.5px. */
export function spacingPx(brush: Pick<BrushSettings, "radiusPx" | "spacing">): number {
  return Math.max(0.5, brush.spacing * brush.radiusPx);
}

/** 최단 UV 델타. wrap이면 ±0.5를 넘는 성분을 반대 방향으로 감는다. */
export function shortestUvDelta(from: BrushDab, to: BrushDab, wrap: boolean): readonly [number, number] {
  let du = to.u - from.u;
  let dv = to.v - from.v;
  if (wrap) {
    du -= Math.round(du);
    dv -= Math.round(dv);
  }
  return [du, dv];
}

export function uvDistancePx(from: BrushDab, to: BrushDab, size: LayerSize, wrap: boolean): number {
  const [du, dv] = shortestUvDelta(from, to, wrap);
  return Math.hypot(du * size.width, dv * size.height);
}

export function interpolateDabs(from: BrushDab, to: BrushDab, brush: BrushSettings, size: LayerSize, options: InterpolateOptions = {}): DabInterpolation {
  const wrap = options.wrap ?? true;
  const carry = Math.max(0, options.carry ?? 0);
  const [du, dv] = shortestUvDelta(from, to, wrap);
  const lengthPx = Math.hypot(du * size.width, dv * size.height);
  const step = spacingPx(brush);
  const dabs: BrushDab[] = [];
  if (!(lengthPx > 0)) return { dabs, carry, lengthPx: 0 };
  let next = step - carry;
  let lastPlaced = -carry;
  while (next <= lengthPx + 1e-9) {
    const t = Math.min(1, next / lengthPx);
    const u = from.u + du * t;
    const v = from.v + dv * t;
    dabs.push({
      u: wrap ? wrapUnit(u) : u,
      v: wrap ? wrapUnit(v) : v,
      pressure: from.pressure + (to.pressure - from.pressure) * t,
    });
    lastPlaced = next;
    next += step;
  }
  return { dabs, carry: lengthPx - lastPlaced, lengthPx };
}

/**
 * SHAPER LinePoint(LineData::AddLinePoint 0x06000219)의 삼각형 내 Ray-Edge 극좌표 앵커:
 * - V0에서 히트점 P 방향으로 쏜 반직선과 변 V1-V2의 교점을 I라 할 때:
 *   v0d = min(1, ||P - V0|| / ||I - V0||) ∈ [0, 1]
 *   v1d = min(1, ||I - V1|| / ||V2 - V1||) ∈ [0, 1]
 */
export interface SurfacePolarAnchor {
  readonly triangleVertices: readonly [number, number, number];
  readonly v0d: number;
  readonly v1d: number;
  readonly pressure: number;
  readonly alpha: number;
}

function clampUnit(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * 삼각형 (v0, v1, v2) 위의 3D 점 p를 SHAPER Ray-Edge 극좌표 (v0d, v1d)로 인코딩한다.
 */
export function encodeRayEdgePolarPoint(
  v0: Vec3,
  v1: Vec3,
  v2: Vec3,
  p: Vec3,
): { readonly v0d: number; readonly v1d: number } {
  const e0x = v1[0] - v0[0];
  const e0y = v1[1] - v0[1];
  const e0z = v1[2] - v0[2];
  const e1x = v2[0] - v0[0];
  const e1y = v2[1] - v0[1];
  const e1z = v2[2] - v0[2];
  const vx = p[0] - v0[0];
  const vy = p[1] - v0[1];
  const vz = p[2] - v0[2];

  const d00 = e0x * e0x + e0y * e0y + e0z * e0z;
  const d01 = e0x * e1x + e0y * e1y + e0z * e1z;
  const d11 = e1x * e1x + e1y * e1y + e1z * e1z;
  const d20 = vx * e0x + vy * e0y + vz * e0z;
  const d21 = vx * e1x + vy * e1y + vz * e1z;
  const denom = d00 * d11 - d01 * d01;

  if (Math.abs(denom) <= 1e-12) {
    return { v0d: 0, v1d: 0 };
  }
  let w1 = Math.max(0, (d11 * d20 - d01 * d21) / denom);
  let w2 = Math.max(0, (d00 * d21 - d01 * d20) / denom);
  const sum12 = w1 + w2;
  if (sum12 > 1) {
    w1 /= sum12;
    w2 /= sum12;
  }
  const v0d = clampUnit(w1 + w2);
  const v1d = v0d > 1e-8 ? clampUnit(w2 / v0d) : 0;
  return { v0d, v1d };
}

/**
 * SHAPER LineData::UpdateLine(0x06000222) 공식:
 * 변형·세분화·스키닝된 삼각형 정점 (v0', v1', v2')에서 물리 레이캐스트 없이
 * 단 2회의 선형 보간으로 표면 위 3D 위치를 정확히 복원한다:
 * - I' = lerp(v1', v2', v1d)
 * - P' = lerp(v0', I', v0d)
 */
export function reprojectRayEdgePolarPoint(v0: Vec3, v1: Vec3, v2: Vec3, v0d: number, v1d: number): Vec3 {
  const t1 = clampUnit(v1d);
  const t0 = clampUnit(v0d);
  const ix = v1[0] + (v2[0] - v1[0]) * t1;
  const iy = v1[1] + (v2[1] - v1[1]) * t1;
  const iz = v1[2] + (v2[2] - v1[2]) * t1;
  return [
    v0[0] + (ix - v0[0]) * t0,
    v0[1] + (iy - v0[1]) * t0,
    v0[2] + (iz - v0[2]) * t0,
  ];
}

/**
 * SHAPER LineData::SetStepLine(0x0600021f)의 Dyn–Levin–Gregory 4-점 보간 중점 공식:
 * - 선형 중점: M = 0.5 * (P_i + P_{i+1})
 * - 외삽 평균: E = 0.5 * ((2 * P_i - P_{i-1}) + (2 * P_{i+1} - P_{i+2}))
 * - P_step = 0.75 * M + 0.25 * E = (9/16) * (P_i + P_{i+1}) - (1/16) * (P_{i-1} + P_{i+2})
 */
export function evaluateDynLevinGregoryMidpoint(pPrev: Vec3, p0: Vec3, p1: Vec3, pNext: Vec3): Vec3 {
  return [
    (9 / 16) * (p0[0] + p1[0]) - (1 / 16) * (pPrev[0] + pNext[0]),
    (9 / 16) * (p0[1] + p1[1]) - (1 / 16) * (pPrev[1] + pNext[1]),
    (9 / 16) * (p0[2] + p1[2]) - (1 / 16) * (pPrev[2] + pNext[2]),
  ];
}

/**
 * 3D 제어점 배열에 Dyn–Levin–Gregory 4-점 보간 세분화를 subdivisions회 적용한다.
 * 원래 찍은 제어점을 그대로 통과하면서 C¹ 연속 곡선 스텝 포인트를 생성한다.
 */
export function subdivideDynLevinGregory4Point(points: readonly Vec3[], subdivisions = 2): readonly Vec3[] {
  if (points.length < 2 || subdivisions <= 0) {
    return [...points];
  }
  let current: readonly Vec3[] = points;
  for (let step = 0; step < subdivisions; step += 1) {
    const n = current.length;
    const next: Vec3[] = [];
    for (let i = 0; i < n - 1; i += 1) {
      const pPrev = current[Math.max(0, i - 1)];
      const p0 = current[i];
      const p1 = current[i + 1];
      const pNext = current[Math.min(n - 1, i + 2)];
      next.push(p0);
      next.push(evaluateDynLevinGregoryMidpoint(pPrev, p0, p1, pNext));
    }
    next.push(current[n - 1]);
    current = next;
  }
  return current;
}

export type ShaperPressureMode = "fake" | "pen";

/**
 * SHAPER LineData::DrawLine(0x06000220)의 필압 두께 프로파일:
 * - "fake"(가상 필압): w_i = thickness * sin((i / N) * π)
 * - "pen"(타블렛 필압): w_i = thickness * p_i * 2.0
 */
export function computeShaperStrokeWidths(options: {
  readonly count: number;
  readonly thickness: number;
  readonly pressureMode: ShaperPressureMode;
  readonly pressures?: ArrayLike<number>;
}): Float32Array {
  const { count, thickness, pressureMode, pressures } = options;
  const widths = new Float32Array(count);
  if (count <= 0) return widths;
  const denom = Math.max(1, count - 1);
  for (let i = 0; i < count; i += 1) {
    if (pressureMode === "fake") {
      widths[i] = thickness * Math.sin((i / denom) * Math.PI);
    } else {
      const p = clampUnit(pressures?.[i] ?? 0.5);
      widths[i] = thickness * p * 2.0;
    }
  }
  return widths;
}

export interface TriangularPrismStrokeTube {
  /** 정점 위치(3 * count * 3 floats): 각 스텝마다 0°/+120°/-120° 3정점 */
  readonly positions: Float32Array;
  /** 정점 법선(3 * count * 3 floats) */
  readonly normals: Float32Array;
  /** 정점별 불투명도 알파(3 * count floats) */
  readonly alphas: Float32Array;
  /** 삼각형 인덱스(18 * (count - 1) uint32s: 구간당 3쿼드 = 6삼각형) */
  readonly indices: Uint32Array;
}

/**
 * SHAPER LineData::DrawLine(0x06000220)의 3각기둥(Triangular Prism) 튜브 메싱:
 * - 각 스텝 포인트 P_i에서 표면 법선 방향으로 +0.2 * w_i 만큼 띄운 중심축 C_i를 만들고,
 * - 진행 방향 축 주위로 0°, +120°, -120° 회전한 반경 0.5 * w_i 정삼각형 단면 정점 3개를 압출한다.
 */
export function extrudeTriangularPrismStrokeTube(options: {
  readonly points: readonly Vec3[];
  readonly surfaceNormals: readonly Vec3[];
  readonly widths: ArrayLike<number>;
  readonly alphas?: ArrayLike<number>;
}): TriangularPrismStrokeTube {
  const { points, surfaceNormals, widths, alphas } = options;
  const n = points.length;
  if (n < 2) {
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      alphas: new Float32Array(0),
      indices: new Uint32Array(0),
    };
  }
  const positions = new Float32Array(n * 3 * 3);
  const normals = new Float32Array(n * 3 * 3);
  const outAlphas = new Float32Array(n * 3);
  const indices = new Uint32Array((n - 1) * 18);

  const cos120 = -0.5;
  const sin120 = 0.5 * Math.sqrt(3);
  const rollCos = [1, cos120, cos120] as const;
  const rollSin = [0, sin120, -sin120] as const;

  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const rawN = surfaceNormals[i] ?? [0, 1, 0];
    const nLen = Math.hypot(rawN[0], rawN[1], rawN[2]) || 1;
    let nx = rawN[0] / nLen;
    let ny = rawN[1] / nLen;
    let nz = rawN[2] / nLen;

    const pPrev = points[Math.max(0, i - 1)];
    const pNext = points[Math.min(n - 1, i + 1)];
    let tx = pNext[0] - pPrev[0];
    let ty = pNext[1] - pPrev[1];
    let tz = pNext[2] - pPrev[2];
    const tLen = Math.hypot(tx, ty, tz);
    if (tLen > 1e-8) {
      tx /= tLen;
      ty /= tLen;
      tz /= tLen;
    } else {
      tx = 0;
      ty = 0;
      tz = 1;
    }

    // b = normalize(t × n)
    let bx = ty * nz - tz * ny;
    let by = tz * nx - tx * nz;
    let bz = tx * ny - ty * nx;
    const bLen = Math.hypot(bx, by, bz);
    if (bLen > 1e-8) {
      bx /= bLen;
      by /= bLen;
      bz /= bLen;
    } else {
      bx = 1;
      by = 0;
      bz = 0;
    }
    // n을 다시 b × t로 직교 정규화
    const onx = by * tz - bz * ty;
    const ony = bz * tx - bx * tz;
    const onz = bx * ty - by * tx;
    const onLen = Math.hypot(onx, ony, onz);
    if (onLen > 1e-8) {
      nx = onx / onLen;
      ny = ony / onLen;
      nz = onz / onLen;
    }

    const w = Math.max(0, widths[i] ?? 0);
    const radius = 0.5 * w;
    // SHAPER DrawLine: 표면 법선 방향으로 +0.2 * w_i 오프셋
    const cx = p[0] + 0.2 * w * nx;
    const cy = p[1] + 0.2 * w * ny;
    const cz = p[2] + 0.2 * w * nz;
    const alpha = clampUnit(alphas?.[i] ?? 1);

    for (let k = 0; k < 3; k += 1) {
      const dx = rollCos[k] * nx + rollSin[k] * bx;
      const dy = rollCos[k] * ny + rollSin[k] * by;
      const dz = rollCos[k] * nz + rollSin[k] * bz;
      const vIdx = i * 3 + k;
      positions[vIdx * 3] = cx + radius * dx;
      positions[vIdx * 3 + 1] = cy + radius * dy;
      positions[vIdx * 3 + 2] = cz + radius * dz;
      normals[vIdx * 3] = dx;
      normals[vIdx * 3 + 1] = dy;
      normals[vIdx * 3 + 2] = dz;
      outAlphas[vIdx] = alpha;
    }
  }

  for (let i = 0; i < n - 1; i += 1) {
    const base = i * 18;
    const ring0 = i * 3;
    const ring1 = (i + 1) * 3;
    for (let k = 0; k < 3; k += 1) {
      const nextK = (k + 1) % 3;
      const a = ring0 + k;
      const b = ring0 + nextK;
      const c = ring1 + nextK;
      const d = ring1 + k;
      const triOffset = base + k * 6;
      indices[triOffset] = a;
      indices[triOffset + 1] = b;
      indices[triOffset + 2] = c;
      indices[triOffset + 3] = a;
      indices[triOffset + 4] = c;
      indices[triOffset + 5] = d;
    }
  }

  return { positions, normals, alphas: outAlphas, indices };
}

export interface BodyMaskTexture {
  readonly width: number;
  readonly height: number;
  /** RGBA8 바이트 배열 (길이 = width * height * 4) */
  readonly rgba: Uint8Array;
}

/**
 * SHAPER LineData::UpdateBodyLineAlphas(0x06000224):
 * 장착된 의상 마스크(bodyMaskTex)의 해당 UV 픽셀 Red 채널이 0.5(127.5/255)를 초과하면
 * 신체 위 펜선의 정점 알파를 0으로 마스킹해 의상 밖으로 뚫고 나오지 않게 한다.
 */
export function computeBodyLineMaskAlphas(
  pointUvs: readonly (readonly [number, number])[],
  masks: readonly BodyMaskTexture[],
): Float32Array {
  const alphas = new Float32Array(pointUvs.length);
  alphas.fill(1);
  if (masks.length === 0) return alphas;

  for (let i = 0; i < pointUvs.length; i += 1) {
    const [u, v] = pointUvs[i];
    const wu = clampUnit(u);
    const wv = clampUnit(v);
    for (const mask of masks) {
      if (mask.width <= 0 || mask.height <= 0) continue;
      const px = Math.min(mask.width - 1, Math.max(0, Math.floor(wu * mask.width)));
      const py = Math.min(mask.height - 1, Math.max(0, Math.floor(wv * mask.height)));
      const rByte = mask.rgba[(py * mask.width + px) * 4] ?? 0;
      if (rByte / 255 > 0.5) {
        alphas[i] = 0;
        break;
      }
    }
  }
  return alphas;
}
