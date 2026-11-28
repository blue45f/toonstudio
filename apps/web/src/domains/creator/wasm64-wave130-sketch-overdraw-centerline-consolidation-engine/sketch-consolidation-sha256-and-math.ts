/**
 * Wave 130 — 순수 ES2017 동기 FIPS 180-4 SHA-256 해시 & 2D 곡선 기하·투영·곡률 유틸리티.
 *
 * - 외부 암호화 API 없이 브라우저/Node 어디서나 100% 결정론적으로 동작하는 SHA-256 구현을 제공한다.
 * - 아크-길이 균일 재샘플링, 선분 투영, Taubin 수축 억제 평활화, Chaikin 세분화,
 *   참 곡선 대비 RMSE 정확도 측정 함수를 제공한다.
 */

import type {
  ConsolidatedInkStroke,
  NormalizedSketchStroke,
  RawSketchStroke,
  ReferenceCurveAccuracyMetrics,
  ResampledSketchSample,
  SketchBBox,
  Vec2,
} from "./sketch-consolidation-types";

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function encodeUtf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/**
 * 순수 ES2017 동기 FIPS 180-4 SHA-256 64자리 소문자 16진수 해시를 계산한다.
 */
export function computeSha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000) >>> 0;
  const bitLenLo = (bytes.length * 8) >>> 0;

  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes, 0);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
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
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
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

  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  let hex = "";
  for (let i = 0; i < words.length; i += 1) {
    hex += (words[i] ?? 0).toString(16).padStart(8, "0");
  }
  return hex;
}

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export interface PointProjectionHit {
  readonly x: number;
  readonly y: number;
  readonly distancePx: number;
  readonly arcLengthPx: number;
  readonly normalizedT: number;
  readonly tx: number;
  readonly ty: number;
  readonly pressure: number;
  readonly withinSpan: boolean;
  readonly longitudinalOverhangPx: number;
}

export interface WeightedPolylinePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

/**
 * 아크-길이 균일 재샘플링과 중앙차분 단위 접선을 계산해 정규화 스트로크를 만든다.
 */
export function normalizeAndResampleSketchStroke(
  stroke: RawSketchStroke,
  resampleStepPx: number,
): { readonly normalized: NormalizedSketchStroke | null; readonly droppedPoints: number } {
  const cleanPoints: WeightedPolylinePoint[] = [];
  let droppedPoints = 0;

  for (let i = 0; i < stroke.points.length; i += 1) {
    const pt = stroke.points[i];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      droppedPoints += 1;
      continue;
    }
    const pressure = clampFinite(pt.pressure ?? 0.55, 0.05, 1.0, 0.55);
    const prev = cleanPoints[cleanPoints.length - 1];
    if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) < 1e-4) {
      continue;
    }
    cleanPoints.push({ x: pt.x, y: pt.y, pressure });
  }

  if (cleanPoints.length < 2) {
    return { normalized: null, droppedPoints };
  }

  const cumArc: number[] = [0];
  let totalLengthPx = 0;
  for (let i = 1; i < cleanPoints.length; i += 1) {
    const a = cleanPoints[i - 1];
    const b = cleanPoints[i];
    if (!a || !b) continue;
    totalLengthPx += Math.hypot(b.x - a.x, b.y - a.y);
    cumArc.push(totalLengthPx);
  }

  if (!Number.isFinite(totalLengthPx) || totalLengthPx <= 1e-3) {
    return { normalized: null, droppedPoints };
  }

  const step = Math.max(1, resampleStepPx);
  const sampleCount = Math.max(2, Math.min(2048, Math.round(totalLengthPx / step) + 1));
  const rawSamples: WeightedPolylinePoint[] = [];
  const sampleArcs: number[] = [];

  let segIdx = 0;
  for (let k = 0; k < sampleCount; k += 1) {
    const targetS = (totalLengthPx * k) / (sampleCount - 1);
    while (segIdx < cumArc.length - 2 && (cumArc[segIdx + 1] ?? 0) < targetS) {
      segIdx += 1;
    }
    const s0 = cumArc[segIdx] ?? 0;
    const s1 = cumArc[segIdx + 1] ?? totalLengthPx;
    const p0 = cleanPoints[segIdx];
    const p1 = cleanPoints[segIdx + 1] ?? p0;
    if (!p0 || !p1) continue;
    const frac = s1 > s0 + 1e-9 ? clampFinite((targetS - s0) / (s1 - s0), 0, 1, 0) : 0;
    rawSamples.push({
      x: p0.x + (p1.x - p0.x) * frac,
      y: p0.y + (p1.y - p0.y) * frac,
      pressure: p0.pressure + (p1.pressure - p0.pressure) * frac,
    });
    sampleArcs.push(targetS);
  }

  const samples = attachTangentsToSamples(rawSamples, sampleArcs, totalLengthPx);
  const bbox = computeSamplesBBox(samples);
  const meanTangent = computeMeanUnitTangent(samples);
  const confidence = clampFinite(stroke.confidence ?? 1.0, 0.1, 1.0, 1.0);

  return {
    normalized: {
      strokeId: stroke.strokeId,
      samples,
      totalLengthPx,
      bbox,
      meanTangent,
      confidence,
      originalPointCount: stroke.points.length,
      droppedPointCount: droppedPoints,
    },
    droppedPoints,
  };
}

export function attachTangentsToSamples(
  points: readonly WeightedPolylinePoint[],
  arcs: readonly number[],
  totalLengthPx: number,
): ResampledSketchSample[] {
  const n = points.length;
  const out: ResampledSketchSample[] = [];
  const safeTotal = Math.max(totalLengthPx, 1e-6);

  for (let i = 0; i < n; i += 1) {
    const curr = points[i];
    if (!curr) continue;
    const prev = points[Math.max(0, i - 1)] ?? curr;
    const next = points[Math.min(n - 1, i + 1)] ?? curr;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-7) {
      const alt = i + 1 < n ? points[i + 1] : points[Math.max(0, i - 1)];
      if (alt) {
        dx = i + 1 < n ? alt.x - curr.x : curr.x - alt.x;
        dy = i + 1 < n ? alt.y - curr.y : curr.y - alt.y;
        len = Math.hypot(dx, dy);
      }
    }
    const tx = len > 1e-7 ? dx / len : 1;
    const ty = len > 1e-7 ? dy / len : 0;
    const s = arcs[i] ?? 0;
    out.push({
      x: curr.x,
      y: curr.y,
      arcLengthPx: s,
      normalizedT: clampFinite(s / safeTotal, 0, 1, 0),
      tx,
      ty,
      pressure: clampFinite(curr.pressure, 0.05, 1.0, 0.55),
    });
  }

  return out;
}

export function computeSamplesBBox(samples: readonly Vec2[]): SketchBBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i];
    if (!p) continue;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

export function bboxesOverlapWithMargin(a: SketchBBox, b: SketchBBox, marginPx: number): boolean {
  return (
    a.minX - marginPx <= b.maxX &&
    a.maxX + marginPx >= b.minX &&
    a.minY - marginPx <= b.maxY &&
    a.maxY + marginPx >= b.minY
  );
}

export function computeMeanUnitTangent(samples: readonly ResampledSketchSample[]): Vec2 {
  if (samples.length < 2) return { x: 1, y: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first && last) {
    const cdx = last.x - first.x;
    const cdy = last.y - first.y;
    const clen = Math.hypot(cdx, cdy);
    if (clen > 1e-5) {
      return { x: cdx / clen, y: cdy / clen };
    }
  }
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s) continue;
    sx += s.tx;
    sy += s.ty;
  }
  const len = Math.hypot(sx, sy);
  return len > 1e-6 ? { x: sx / len, y: sy / len } : { x: 1, y: 0 };
}

/**
 * 스트로크 방향을 반전하고 아크-길이·접선 부호를 재정렬한다.
 */
export function reverseNormalizedStroke(stroke: NormalizedSketchStroke): NormalizedSketchStroke {
  const n = stroke.samples.length;
  const reversed: ResampledSketchSample[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const s = stroke.samples[i];
    if (!s) continue;
    const arcLengthPx = Math.max(0, stroke.totalLengthPx - s.arcLengthPx);
    reversed.push({
      x: s.x,
      y: s.y,
      arcLengthPx,
      normalizedT: clampFinite(1 - s.normalizedT, 0, 1, 0),
      tx: -s.tx,
      ty: -s.ty,
      pressure: s.pressure,
    });
  }
  return {
    ...stroke,
    samples: reversed,
    meanTangent: { x: -stroke.meanTangent.x, y: -stroke.meanTangent.y },
  };
}

/**
 * 2D 점을 정규화 폴리라인에 직교 투영하고 스팬 내부 여부·국소 접선을 반환한다.
 */
export function projectPointOntoSamples(
  pt: Vec2,
  samples: readonly ResampledSketchSample[],
  totalLengthPx: number,
  overhangTolerancePx: number,
): PointProjectionHit {
  const n = samples.length;
  if (n === 0) {
    return {
      x: 0,
      y: 0,
      distancePx: 0,
      arcLengthPx: 0,
      normalizedT: 0,
      tx: 1,
      ty: 0,
      pressure: 0.55,
      withinSpan: false,
      longitudinalOverhangPx: 0,
    };
  }
  if (n === 1) {
    const only = samples[0];
    if (!only) {
      return {
        x: 0,
        y: 0,
        distancePx: 0,
        arcLengthPx: 0,
        normalizedT: 0,
        tx: 1,
        ty: 0,
        pressure: 0.55,
        withinSpan: false,
        longitudinalOverhangPx: 0,
      };
    }
    const d = Math.hypot(pt.x - only.x, pt.y - only.y);
    return {
      x: only.x,
      y: only.y,
      distancePx: d,
      arcLengthPx: 0,
      normalizedT: 0,
      tx: only.tx,
      ty: only.ty,
      pressure: only.pressure,
      withinSpan: d <= overhangTolerancePx,
      longitudinalOverhangPx: d,
    };
  }

  const firstSample = samples[0];
  let bestDistSq = Number.POSITIVE_INFINITY;
  let bestX = firstSample ? firstSample.x : 0;
  let bestY = firstSample ? firstSample.y : 0;
  let bestArc = 0;
  let bestTx = firstSample ? firstSample.tx : 1;
  let bestTy = firstSample ? firstSample.ty : 0;
  let bestPressure = firstSample ? firstSample.pressure : 0.55;
  let bestSegIdx = 0;
  let bestRawU = 0;
  let bestSegLen = 1;

  for (let i = 0; i < n - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const segLen = Math.sqrt(lenSq);
    const rawU = lenSq > 1e-12 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq : 0;
    const u = clampFinite(rawU, 0, 1, 0);
    const px = a.x + dx * u;
    const py = a.y + dy * u;
    const distSq = (pt.x - px) * (pt.x - px) + (pt.y - py) * (pt.y - py);

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestX = px;
      bestY = py;
      bestArc = a.arcLengthPx + (b.arcLengthPx - a.arcLengthPx) * u;
      if (segLen > 1e-7) {
        bestTx = dx / segLen;
        bestTy = dy / segLen;
      } else {
        bestTx = a.tx;
        bestTy = a.ty;
      }
      bestPressure = a.pressure + (b.pressure - a.pressure) * u;
      bestSegIdx = i;
      bestRawU = rawU;
      bestSegLen = segLen;
    }
  }

  let overhang = 0;
  if (bestSegIdx === 0 && bestRawU < 0) {
    overhang = Math.abs(bestRawU) * bestSegLen;
  } else if (bestSegIdx === n - 2 && bestRawU > 1) {
    overhang = (bestRawU - 1) * bestSegLen;
  }

  const safeTotal = Math.max(totalLengthPx, 1e-6);
  return {
    x: bestX,
    y: bestY,
    distancePx: Math.sqrt(bestDistSq),
    arcLengthPx: bestArc,
    normalizedT: clampFinite(bestArc / safeTotal, 0, 1, 0),
    tx: bestTx,
    ty: bestTy,
    pressure: bestPressure,
    withinSpan: overhang <= overhangTolerancePx,
    longitudinalOverhangPx: overhang,
  };
}

/**
 * 끝점을 고정한 채 수축 없는 Taubin 평활화와 선택적 Chaikin 세분화를 적용한다.
 */
export function smoothOpenPolylinePreservingEndpoints(
  points: readonly WeightedPolylinePoint[],
  taubinPasses: number,
  chaikinSubdivisions: number,
): WeightedPolylinePoint[] {
  if (points.length < 3) {
    return points.slice();
  }

  let current: WeightedPolylinePoint[] = points.slice();
  const lambda = 0.38;
  const mu = -0.39;

  for (let pass = 0; pass < taubinPasses; pass += 1) {
    const step1 = applyLaplacianPass(current, lambda);
    current = applyLaplacianPass(step1, mu);
  }

  for (let sub = 0; sub < chaikinSubdivisions; sub += 1) {
    if (current.length < 3) break;
    const first = current[0];
    const last = current[current.length - 1];
    if (!first || !last) break;
    const next: WeightedPolylinePoint[] = [first];
    for (let i = 0; i < current.length - 1; i += 1) {
      const a = current[i];
      const b = current[i + 1];
      if (!a || !b) continue;
      next.push({
        x: 0.75 * a.x + 0.25 * b.x,
        y: 0.75 * a.y + 0.25 * b.y,
        pressure: 0.75 * a.pressure + 0.25 * b.pressure,
      });
      next.push({
        x: 0.25 * a.x + 0.75 * b.x,
        y: 0.25 * a.y + 0.75 * b.y,
        pressure: 0.25 * a.pressure + 0.75 * b.pressure,
      });
    }
    next.push(last);
    current = next;
  }

  return current;
}

function applyLaplacianPass(
  pts: readonly WeightedPolylinePoint[],
  weight: number,
): WeightedPolylinePoint[] {
  const n = pts.length;
  const first = pts[0];
  const last = pts[n - 1];
  if (!first || !last || n < 3) return pts.slice();
  const out: WeightedPolylinePoint[] = [first];
  for (let i = 1; i < n - 1; i += 1) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    if (!prev || !curr || !next) continue;
    const avgX = 0.5 * (prev.x + next.x);
    const avgY = 0.5 * (prev.y + next.y);
    const avgP = 0.5 * (prev.pressure + next.pressure);
    out.push({
      x: curr.x + weight * (avgX - curr.x),
      y: curr.y + weight * (avgY - curr.y),
      pressure: clampFinite(curr.pressure + weight * (avgP - curr.pressure), 0.05, 1.0, 0.55),
    });
  }
  out.push(last);
  return out;
}

/**
 * 폴리라인의 각 정점에서 이산 곡률 |dTheta / ds| (rad/px)을 계산한다.
 */
export function computeDiscreteCurvatures(samples: readonly ResampledSketchSample[]): number[] {
  const n = samples.length;
  const curvatures: number[] = new Array<number>(n).fill(0);
  if (n < 3) return curvatures;

  for (let i = 1; i < n - 1; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    if (!prev || !curr || !next) continue;
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    const ds = 0.5 * (l1 + l2);
    if (l1 < 1e-6 || l2 < 1e-6 || ds < 1e-6) {
      curvatures[i] = 0;
      continue;
    }
    const dot = clampFinite((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1, 1);
    const angle = Math.acos(dot);
    curvatures[i] = angle / ds;
  }
  curvatures[0] = curvatures[1] ?? 0;
  curvatures[n - 1] = curvatures[n - 2] ?? 0;
  return curvatures;
}

/**
 * 참(ground-truth) 기준 곡선 대비 통합 중앙선 RMSE와 개별 러프 스트로크 평균 RMSE를 비교한다.
 */
export function evaluateCenterlineAccuracyAgainstReference(
  referencePoints: readonly Vec2[],
  consolidatedStroke: ConsolidatedInkStroke,
  rawStrokes: readonly RawSketchStroke[],
  resampleStepPx = 2,
): ReferenceCurveAccuracyMetrics {
  const refNorm = normalizeAndResampleSketchStroke(
    { strokeId: "__reference__", points: referencePoints },
    resampleStepPx,
  ).normalized;

  if (!refNorm || consolidatedStroke.samples.length === 0) {
    return {
      centerlineRmsePx: 0,
      meanRawStrokeRmsePx: 0,
      rmseImprovementRatio: 1,
      rmseReductionPercent: 0,
      maxCenterlineErrorPx: 0,
      passesAccuracyTarget: false,
    };
  }

  let sumSqCenter = 0;
  let maxCenterErr = 0;
  for (let i = 0; i < consolidatedStroke.samples.length; i += 1) {
    const s = consolidatedStroke.samples[i];
    if (!s) continue;
    const hit = projectPointOntoSamples(s, refNorm.samples, refNorm.totalLengthPx, 1000);
    sumSqCenter += hit.distancePx * hit.distancePx;
    if (hit.distancePx > maxCenterErr) maxCenterErr = hit.distancePx;
  }
  const centerlineRmsePx = Math.sqrt(sumSqCenter / consolidatedStroke.samples.length);

  let rawRmseSum = 0;
  let validRawCount = 0;
  for (let r = 0; r < rawStrokes.length; r += 1) {
    const rawStroke = rawStrokes[r];
    if (!rawStroke) continue;
    const normRaw = normalizeAndResampleSketchStroke(rawStroke, resampleStepPx).normalized;
    if (!normRaw || normRaw.samples.length === 0) continue;
    let sq = 0;
    for (let i = 0; i < normRaw.samples.length; i += 1) {
      const sample = normRaw.samples[i];
      if (!sample) continue;
      const hit = projectPointOntoSamples(
        sample,
        refNorm.samples,
        refNorm.totalLengthPx,
        1000,
      );
      sq += hit.distancePx * hit.distancePx;
    }
    rawRmseSum += Math.sqrt(sq / normRaw.samples.length);
    validRawCount += 1;
  }

  const meanRawStrokeRmsePx = validRawCount > 0 ? rawRmseSum / validRawCount : 0;
  const rmseImprovementRatio =
    meanRawStrokeRmsePx > 1e-9 ? centerlineRmsePx / meanRawStrokeRmsePx : 0;
  const rmseReductionPercent =
    meanRawStrokeRmsePx > 1e-9 ? (1 - rmseImprovementRatio) * 100 : 0;

  return {
    centerlineRmsePx,
    meanRawStrokeRmsePx,
    rmseImprovementRatio,
    rmseReductionPercent,
    maxCenterlineErrorPx: maxCenterErr,
    passesAccuracyTarget:
      meanRawStrokeRmsePx > 1e-9 && centerlineRmsePx < meanRawStrokeRmsePx * 0.65,
  };
}
