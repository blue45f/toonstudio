/**
 * Wave 148 — 2D 기하·교차 판정 프리미티브 및 순수 ES2017 동기 FIPS 180-4 SHA-256.
 * BigInt 리터럴 없이 32비트 부호 없는 산술(`>>> 0`)만 사용한다.
 */

import type { Bounds2D, Rect2D, Vec2 } from "./balloon-tail-types";

const EPSILON = 1e-6;

export function sanitizeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  const safe = sanitizeFinite(value, min);
  if (safe < min) return min;
  if (safe > max) return max;
  return safe;
}

export function roundFixed(value: number, digits = 3): number {
  const safe = sanitizeFinite(value, 0);
  const factor = Math.pow(10, digits);
  const rounded = Math.round(safe * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeAngleDeg(deg: number): number {
  const safe = sanitizeFinite(deg, 0);
  const mod = ((safe % 360) + 360) % 360;
  return Object.is(mod, -0) ? 0 : mod;
}

export function signedAngleDiffDeg(aDeg: number, bDeg: number): number {
  const diff = normalizeAngleDeg(aDeg - bDeg);
  return diff > 180 ? diff - 360 : diff;
}

export function degToRad(deg: number): number {
  return (sanitizeFinite(deg, 0) * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (sanitizeFinite(rad, 0) * 180) / Math.PI;
}

export function sanitizePoint(pt: Vec2): Vec2 {
  return {
    x: sanitizeFinite(pt.x, 0),
    y: sanitizeFinite(pt.y, 0),
  };
}

export function sanitizeRect(rect: Rect2D): Rect2D {
  return {
    x: sanitizeFinite(rect.x, 0),
    y: sanitizeFinite(rect.y, 0),
    width: Math.max(0, sanitizeFinite(rect.width, 0)),
    height: Math.max(0, sanitizeFinite(rect.height, 0)),
  };
}

export function vecAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function vecDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function vecCross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function vecLength(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function vecDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function vecNormalize(v: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len <= EPSILON) return fallback;
  return { x: v.x / len, y: v.y / len };
}

export function vecLerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function evalQuadraticBezier(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const twoUT = 2 * u * t;
  const tt = t * t;
  return {
    x: uu * p0.x + twoUT * p1.x + tt * p2.x,
    y: uu * p0.y + twoUT * p1.y + tt * p2.y,
  };
}

export function sampleQuadraticBezier(p0: Vec2, p1: Vec2, p2: Vec2, steps = 16): Vec2[] {
  const count = Math.max(2, Math.round(steps));
  const out: Vec2[] = [];
  for (let i = 0; i <= count; i += 1) {
    out.push(evalQuadraticBezier(p0, p1, p2, i / count));
  }
  return out;
}

export function computePolylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    total += vecDistance(prev, curr);
  }
  return total;
}

export function computePointsBounds(points: readonly Vec2[]): Bounds2D {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!pt) continue;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

export function doBoundsOverlap(a: Bounds2D, b: Bounds2D, pad = 0): boolean {
  return (
    a.minX - pad <= b.maxX &&
    a.maxX + pad >= b.minX &&
    a.minY - pad <= b.maxY &&
    a.maxY + pad >= b.minY
  );
}

export function rectToBounds(rect: Rect2D): Bounds2D {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };
}

export function isPointInsideRect(pt: Vec2, rect: Rect2D, margin = 0): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    pt.x > rect.x - margin + EPSILON &&
    pt.x < rect.x + rect.width + margin - EPSILON &&
    pt.y > rect.y - margin + EPSILON &&
    pt.y < rect.y + rect.height + margin - EPSILON
  );
}

export function isPointInsideOrOnRect(pt: Vec2, rect: Rect2D, margin = 0): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    pt.x >= rect.x - margin - EPSILON &&
    pt.x <= rect.x + rect.width + margin + EPSILON &&
    pt.y >= rect.y - margin - EPSILON &&
    pt.y <= rect.y + rect.height + margin + EPSILON
  );
}

export function distancePointToRect(pt: Vec2, rect: Rect2D): number {
  const dx = Math.max(rect.x - pt.x, 0, pt.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - pt.y, 0, pt.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/**
 * 시작점 `origin`에서 단위 방향 `dir`로 나가는 반직선이 사각형 `rect`를 빠져나가는 양수 거리를 구한다.
 * 시작점이 사각형 밖에 있으면 0을 반환한다.
 */
export function rayExitDistanceFromRect(origin: Vec2, dir: Vec2, rect: Rect2D): number {
  if (!isPointInsideOrOnRect(origin, rect)) return 0;
  const xMin = rect.x;
  const xMax = rect.x + rect.width;
  const yMin = rect.y;
  const yMax = rect.y + rect.height;

  let tExit = Number.POSITIVE_INFINITY;
  if (Math.abs(dir.x) > EPSILON) {
    const tx = dir.x > 0 ? (xMax - origin.x) / dir.x : (xMin - origin.x) / dir.x;
    if (tx >= 0 && tx < tExit) tExit = tx;
  }
  if (Math.abs(dir.y) > EPSILON) {
    const ty = dir.y > 0 ? (yMax - origin.y) / dir.y : (yMin - origin.y) / dir.y;
    if (ty >= 0 && ty < tExit) tExit = ty;
  }
  return Number.isFinite(tExit) ? Math.max(0, tExit) : 0;
}

export interface SegmentIntersectionResult {
  readonly intersects: boolean;
  readonly point: Vec2 | null;
}

export function segmentsIntersect2D(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): SegmentIntersectionResult {
  const r = vecSub(a2, a1);
  const s = vecSub(b2, b1);
  const rxs = vecCross(r, s);
  const qp = vecSub(b1, a1);
  const qpxr = vecCross(qp, r);

  if (Math.abs(rxs) <= EPSILON) {
    if (Math.abs(qpxr) > EPSILON) {
      return { intersects: false, point: null };
    }
    const rr = vecDot(r, r);
    if (rr <= EPSILON) {
      const hit = vecDistance(a1, b1) <= EPSILON || vecDistance(a1, b2) <= EPSILON;
      return { intersects: hit, point: hit ? a1 : null };
    }
    const t0 = vecDot(qp, r) / rr;
    const t1 = vecDot(vecSub(b2, a1), r) / rr;
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    if (lo <= hi + EPSILON) {
      const midT = clamp((lo + hi) * 0.5, 0, 1);
      return { intersects: true, point: vecLerp(a1, a2, midT) };
    }
    return { intersects: false, point: null };
  }

  const t = vecCross(qp, s) / rxs;
  const u = qpxr / rxs;
  if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
    return {
      intersects: true,
      point: vecLerp(a1, a2, clamp(t, 0, 1)),
    };
  }
  return { intersects: false, point: null };
}

export function segmentIntersectsRect2D(a: Vec2, b: Vec2, rect: Rect2D): SegmentIntersectionResult {
  if (rect.width <= 0 || rect.height <= 0) {
    return { intersects: false, point: null };
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;

  const pValues = [-dx, dx, -dy, dy];
  const qValues = [
    a.x - rect.x,
    rect.x + rect.width - a.x,
    a.y - rect.y,
    rect.y + rect.height - a.y,
  ];

  for (let i = 0; i < 4; i += 1) {
    const p = pValues[i] ?? 0;
    const q = qValues[i] ?? 0;
    if (Math.abs(p) <= EPSILON) {
      if (q < -EPSILON) return { intersects: false, point: null };
    } else {
      const ratio = q / p;
      if (p < 0) {
        if (ratio > t1) return { intersects: false, point: null };
        if (ratio > t0) t0 = ratio;
      } else {
        if (ratio < t0) return { intersects: false, point: null };
        if (ratio < t1) t1 = ratio;
      }
    }
  }

  if (t0 <= t1 + EPSILON) {
    const hitT = clamp((t0 + t1) * 0.5, 0, 1);
    return { intersects: true, point: vecLerp(a, b, hitT) };
  }
  return { intersects: false, point: null };
}

export function polylineIntersectsRect2D(
  points: readonly Vec2[],
  rect: Rect2D,
): SegmentIntersectionResult {
  if (rect.width <= 0 || rect.height <= 0 || points.length === 0) {
    return { intersects: false, point: null };
  }
  if (points.length === 1) {
    const first = points[0];
    if (first && isPointInsideOrOnRect(first, rect)) {
      return { intersects: true, point: first };
    }
    return { intersects: false, point: null };
  }
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const hit = segmentIntersectsRect2D(a, b, rect);
    if (hit.intersects) return hit;
  }
  return { intersects: false, point: null };
}

export function polylinesIntersect2D(
  polyA: readonly Vec2[],
  polyB: readonly Vec2[],
): SegmentIntersectionResult {
  for (let i = 1; i < polyA.length; i += 1) {
    const a1 = polyA[i - 1];
    const a2 = polyA[i];
    if (!a1 || !a2) continue;
    for (let j = 1; j < polyB.length; j += 1) {
      const b1 = polyB[j - 1];
      const b2 = polyB[j];
      if (!b1 || !b2) continue;
      const hit = segmentsIntersect2D(a1, a2, b1, b2);
      if (hit.intersects) return hit;
    }
  }
  return { intersects: false, point: null };
}

export function distancePointToSegment(pt: Vec2, a: Vec2, b: Vec2): number {
  const ab = vecSub(b, a);
  const lenSq = vecDot(ab, ab);
  if (lenSq <= EPSILON) return vecDistance(pt, a);
  const t = clamp(vecDot(vecSub(pt, a), ab) / lenSq, 0, 1);
  return vecDistance(pt, vecLerp(a, b, t));
}

export function minDistancePolylineToRect(points: readonly Vec2[], rect: Rect2D): number {
  if (polylineIntersectsRect2D(points, rect).intersects) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!pt) continue;
    const d = distancePointToRect(pt, rect);
    if (d < best) best = d;
  }
  return Number.isFinite(best) ? best : 0;
}

export function minDistancePolylineToPolyline(
  polyA: readonly Vec2[],
  polyB: readonly Vec2[],
): number {
  if (polylinesIntersect2D(polyA, polyB).intersects) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyA.length; i += 1) {
    const pt = polyA[i];
    if (!pt) continue;
    for (let j = 1; j < polyB.length; j += 1) {
      const b1 = polyB[j - 1];
      const b2 = polyB[j];
      if (!b1 || !b2) continue;
      const d = distancePointToSegment(pt, b1, b2);
      if (d < best) best = d;
    }
  }
  for (let j = 0; j < polyB.length; j += 1) {
    const pt = polyB[j];
    if (!pt) continue;
    for (let i = 1; i < polyA.length; i += 1) {
      const a1 = polyA[i - 1];
      const a2 = polyA[i];
      if (!a1 || !a2) continue;
      const d = distancePointToSegment(pt, a1, a2);
      if (d < best) best = d;
    }
  }
  return Number.isFinite(best) ? best : 0;
}

export function isPointInsideEllipse(
  pt: Vec2,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  scale = 0.96,
): boolean {
  const safeRx = Math.max(1, rx * scale);
  const safeRy = Math.max(1, ry * scale);
  const nx = (pt.x - cx) / safeRx;
  const ny = (pt.y - cy) / safeRy;
  return nx * nx + ny * ny < 1;
}

// ---------------------------------------------------------------------------
// 순수 ES2017 동기 FIPS 180-4 SHA-256
// ---------------------------------------------------------------------------

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

export function encodeUtf8Bytes(text: string): Uint8Array {
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

export function sha256BytesHex(data: Uint8Array): string {
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

export function sha256Utf8Hex(input: string): string {
  return sha256BytesHex(encodeUtf8Bytes(input));
}
