/**
 * Wave 147 — 3D 벡터/세그먼트 기하, 소품 SDF, ES2017 동기 FIPS 180-4 SHA-256 유틸리티.
 *
 * - 외부 암호 라이브러리나 BigInt 리터럴 없이 순수 32비트 부호 없는 산술(`>>> 0`)만 사용한다.
 * - 원통(검 자루), 직육면체(스마트폰), 구(찻잔) 프리미티브의 정확한 3D 부호 거리(SDF)와
 *   캡슐(선분 + 반지름) 최소 관통 깊이 계산을 결정론적으로 수행한다.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type GraspPropShapeKind = "cylinder" | "box" | "sphere";

export interface GraspPropBase {
  readonly id: string;
  readonly labelKo: string;
  readonly kind: GraspPropShapeKind;
  readonly centerMm: Vec3;
  /** 소품 로컬 회전 (deg, XYZ 순차 오일러 회전) */
  readonly rotationDeg?: Vec3;
}

export interface CylinderGraspProp extends GraspPropBase {
  readonly kind: "cylinder";
  readonly radiusMm: number;
  readonly lengthMm: number;
  /** 소품 로컬 공간 원통 중심축 단위벡터 (기본값: (1, 0, 0)) */
  readonly axis?: Vec3;
}

export interface BoxGraspProp extends GraspPropBase {
  readonly kind: "box";
  /** 직육면체 전체 치수 (widthMm = X, heightMm = Y, depthMm = Z) */
  readonly sizeMm: Vec3;
}

export interface SphereGraspProp extends GraspPropBase {
  readonly kind: "sphere";
  readonly radiusMm: number;
}

export type GraspPropPrimitive = CylinderGraspProp | BoxGraspProp | SphereGraspProp;

export interface CapsuleSdfSample {
  readonly signedDistanceMm: number;
  readonly penetrationDepthMm: number;
  readonly closestSegmentT: number;
  readonly closestPointOnSegmentMm: Vec3;
  readonly outwardNormal: Vec3;
}

const DEG_TO_RAD = Math.PI / 180;
const EPSILON = 1e-9;

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function roundFixed(value: number, digits: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = Math.pow(10, digits);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleVec3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthVec3(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function distanceVec3(a: Vec3, b: Vec3): number {
  return lengthVec3(subVec3(a, b));
}

export function normalizeVec3(v: Vec3, fallback: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 {
  const len = lengthVec3(v);
  if (len <= EPSILON) {
    return fallback;
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** XYZ 순차 오일러 회전 (정방향: Rx -> Ry -> Rz). */
export function rotateVec3EulerDeg(v: Vec3, eulerDeg: Vec3): Vec3 {
  const rx = degToRad(eulerDeg.x);
  const ry = degToRad(eulerDeg.y);
  const rz = degToRad(eulerDeg.z);

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y1 = v.y * cx - v.z * sx;
  const z1 = v.y * sx + v.z * cx;
  const x1 = v.x;

  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;

  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return {
    x: x2 * cz - y2 * sz,
    y: x2 * sz + y2 * cz,
    z: z2,
  };
}

/** XYZ 순차 오일러 회전의 역회전 (Rz^-1 -> Ry^-1 -> Rx^-1). */
export function inverseRotateVec3EulerDeg(v: Vec3, eulerDeg: Vec3): Vec3 {
  const rx = degToRad(-eulerDeg.x);
  const ry = degToRad(-eulerDeg.y);
  const rz = degToRad(-eulerDeg.z);

  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x1 = v.x * cz - v.y * sz;
  const y1 = v.x * sz + v.y * cz;
  const z1 = v.z;

  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  return {
    x: x2,
    y: y2 * cx - z2 * sx,
    z: y2 * sx + z2 * cx,
  };
}

/** 3D 두 선분 AB, CD 사이의 정확한 최단 거리를 반환한다. */
export function segmentToSegmentDistanceMm(
  a0: Vec3,
  a1: Vec3,
  b0: Vec3,
  b1: Vec3,
): number {
  const u = subVec3(a1, a0);
  const v = subVec3(b1, b0);
  const w = subVec3(a0, b0);
  const a = dotVec3(u, u);
  const b = dotVec3(u, v);
  const c = dotVec3(v, v);
  const d = dotVec3(u, w);
  const e = dotVec3(v, w);
  const denom = a * c - b * b;

  let sNum: number;
  let sDen = denom;
  let tNum: number;
  let tDen = denom;

  if (denom < EPSILON) {
    sNum = 0;
    sDen = 1;
    tNum = e;
    tDen = c;
  } else {
    sNum = b * e - c * d;
    tNum = a * e - b * d;
    if (sNum < 0) {
      sNum = 0;
      tNum = e;
      tDen = c;
    } else if (sNum > sDen) {
      sNum = sDen;
      tNum = e + b;
      tDen = c;
    }
  }

  if (tNum < 0) {
    tNum = 0;
    if (-d < 0) {
      sNum = 0;
    } else if (-d > a) {
      sNum = sDen;
    } else {
      sNum = -d;
      sDen = a;
    }
  } else if (tNum > tDen) {
    tNum = tDen;
    if (-d + b < 0) {
      sNum = 0;
    } else if (-d + b > a) {
      sNum = sDen;
    } else {
      sNum = -d + b;
      sDen = a;
    }
  }

  const sc = Math.abs(sNum) < EPSILON || Math.abs(sDen) < EPSILON ? 0 : sNum / sDen;
  const tc = Math.abs(tNum) < EPSILON || Math.abs(tDen) < EPSILON ? 0 : tNum / tDen;
  const diff = subVec3(addVec3(w, scaleVec3(u, sc)), scaleVec3(v, tc));
  return lengthVec3(diff);
}

/** 단일 3D 점과 소품 프리미티브 표면 사이의 정확한 부호 거리(mm)를 반환한다. 음수는 관통이다. */
export function signedDistancePointToPropMm(point: Vec3, prop: GraspPropPrimitive): number {
  const shifted = subVec3(point, prop.centerMm);
  const local = prop.rotationDeg ? inverseRotateVec3EulerDeg(shifted, prop.rotationDeg) : shifted;

  if (prop.kind === "sphere") {
    return lengthVec3(local) - Math.max(0.1, prop.radiusMm);
  }

  if (prop.kind === "box") {
    const hx = Math.max(0.1, prop.sizeMm.x * 0.5);
    const hy = Math.max(0.1, prop.sizeMm.y * 0.5);
    const hz = Math.max(0.1, prop.sizeMm.z * 0.5);
    const qx = Math.abs(local.x) - hx;
    const qy = Math.abs(local.y) - hy;
    const qz = Math.abs(local.z) - hz;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
    const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
    return outside + inside;
  }

  const axis = normalizeVec3(prop.axis ?? { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const halfLen = Math.max(0.1, prop.lengthMm * 0.5);
  const radius = Math.max(0.1, prop.radiusMm);
  const axial = dotVec3(local, axis);
  const radialVec = subVec3(local, scaleVec3(axis, axial));
  const radialDist = lengthVec3(radialVec);
  const dx = radialDist - radius;
  const dy = Math.abs(axial) - halfLen;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  const outside = Math.sqrt(ox * ox + oy * oy);
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside;
}

/** 소품 SDF의 단위 외향 법선 벡터를 중앙 차분으로 계산한다. */
export function computePropOutwardNormal(point: Vec3, prop: GraspPropPrimitive): Vec3 {
  const h = 0.05;
  const gx =
    signedDistancePointToPropMm({ x: point.x + h, y: point.y, z: point.z }, prop) -
    signedDistancePointToPropMm({ x: point.x - h, y: point.y, z: point.z }, prop);
  const gy =
    signedDistancePointToPropMm({ x: point.x, y: point.y + h, z: point.z }, prop) -
    signedDistancePointToPropMm({ x: point.x, y: point.y - h, z: point.z }, prop);
  const gz =
    signedDistancePointToPropMm({ x: point.x, y: point.y, z: point.z + h }, prop) -
    signedDistancePointToPropMm({ x: point.x, y: point.y, z: point.z - h }, prop);
  const fallback = normalizeVec3(subVec3(point, prop.centerMm), { x: 0, y: 0, z: 1 });
  return normalizeVec3({ x: gx, y: gy, z: gz }, fallback);
}

/**
 * 3D 캡슐(선분 a->b, 반지름 radiusMm)과 볼록 소품 표면 간의 최소 부호 거리를 계산한다.
 * 볼록 소품에 대한 선분 SDF는 단봉(볼록) 함수이므로 황금분할 탐색으로 전역 최솟값에 수렴한다.
 */
export function sampleCapsuleToPropSdf(
  a: Vec3,
  b: Vec3,
  radiusMm: number,
  prop: GraspPropPrimitive,
): CapsuleSdfSample {
  const evalAt = (t: number): number => signedDistancePointToPropMm(lerpVec3(a, b, t), prop);

  let bestT = 0;
  let bestVal = evalAt(0);
  const coarseSteps = 8;
  for (let i = 1; i <= coarseSteps; i += 1) {
    const t = i / coarseSteps;
    const v = evalAt(t);
    if (v < bestVal) {
      bestVal = v;
      bestT = t;
    }
  }

  let lo = Math.max(0, bestT - 1 / coarseSteps);
  let hi = Math.min(1, bestT + 1 / coarseSteps);
  const invPhi = (Math.sqrt(5) - 1) * 0.5;
  let c = hi - invPhi * (hi - lo);
  let d = lo + invPhi * (hi - lo);
  let fc = evalAt(c);
  let fd = evalAt(d);

  for (let iter = 0; iter < 22; iter += 1) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - invPhi * (hi - lo);
      fc = evalAt(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + invPhi * (hi - lo);
      fd = evalAt(d);
    }
  }

  const finalT = fc < fd ? c : d;
  const centerSdf = fc < fd ? fc : fd;
  const closestPoint = lerpVec3(a, b, finalT);
  const signedDistanceMm = centerSdf - radiusMm;
  const penetrationDepthMm = signedDistanceMm < 0 ? -signedDistanceMm : 0;
  const outwardNormal = computePropOutwardNormal(closestPoint, prop);

  return {
    signedDistanceMm,
    penetrationDepthMm,
    closestSegmentT: finalT,
    closestPointOnSegmentMm: closestPoint,
    outwardNormal,
  };
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function toHex32(value: number): string {
  const raw = (value >>> 0).toString(16);
  return raw.length >= 8 ? raw : "00000000".slice(raw.length) + raw;
}

/** UTF-16 문자열을 UTF-8 바이트 배열로 결정론적 변환한다. */
export function encodeHandUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/** FIPS 180-4 SHA-256 동기 해시를 64자리 소문자 16진수 문자열로 반환한다. */
export function sha256HandBytesHex(data: Uint8Array): string {
  const byteLen = data.length;
  const totalLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[byteLen] = 0x80;

  const bitLen = byteLen * 8;
  const bitLenHi = Math.floor(bitLen / 4294967296) >>> 0;
  const bitLenLo = bitLen >>> 0;
  padded[totalLen - 8] = (bitLenHi >>> 24) & 0xff;
  padded[totalLen - 7] = (bitLenHi >>> 16) & 0xff;
  padded[totalLen - 6] = (bitLenHi >>> 8) & 0xff;
  padded[totalLen - 5] = bitLenHi & 0xff;
  padded[totalLen - 4] = (bitLenLo >>> 24) & 0xff;
  padded[totalLen - 3] = (bitLenLo >>> 16) & 0xff;
  padded[totalLen - 2] = (bitLenLo >>> 8) & 0xff;
  padded[totalLen - 1] = bitLenLo & 0xff;

  let h0 = SHA256_INIT[0] ?? 0;
  let h1 = SHA256_INIT[1] ?? 0;
  let h2 = SHA256_INIT[2] ?? 0;
  let h3 = SHA256_INIT[3] ?? 0;
  let h4 = SHA256_INIT[4] ?? 0;
  let h5 = SHA256_INIT[5] ?? 0;
  let h6 = SHA256_INIT[6] ?? 0;
  let h7 = SHA256_INIT[7] ?? 0;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        (((padded[idx] ?? 0) << 24) |
          ((padded[idx + 1] ?? 0) << 16) |
          ((padded[idx + 2] ?? 0) << 8) |
          (padded[idx + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    toHex32(h0) +
    toHex32(h1) +
    toHex32(h2) +
    toHex32(h3) +
    toHex32(h4) +
    toHex32(h5) +
    toHex32(h6) +
    toHex32(h7)
  );
}

/** 키 순서에 무관한 정규 JSON 직렬화 문자열을 생성한다. */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "0";
    }
    return JSON.stringify(roundFixed(value, 4));
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      items.push(canonicalJsonStringify(value[i]));
    }
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (k === undefined) {
        continue;
      }
      const v = record[k];
      if (v === undefined) {
        continue;
      }
      parts.push(`${JSON.stringify(k)}:${canonicalJsonStringify(v)}`);
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}

/** 임의 직렬화 가능 객체의 결정론적 SHA-256 16진 지문을 반환한다. */
export function sha256CanonicalObjectHex(payload: unknown): string {
  return sha256HandBytesHex(encodeHandUtf8Bytes(canonicalJsonStringify(payload)));
}
