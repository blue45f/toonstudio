/**
 * 미분 가능 선화 역산 솔버(Differentiable Stroke Inverse Solver).
 *
 * 병합된 흑백·RGBA 래스터 선화 타일(`Uint8Array`, `width`, `height`)에서 외부 서버 비용 없이(`₩0`)
 * 2D 유클리드 거리 변환(`O(W·H)`), 위상 보존 중심축 골격화(Zhang-Suen + m-연결 분기 정리),
 * 스트로크 폴리라인 추출, 정점별 정규화 필압(`[0..1]`) 추정, 구심 Catmull-Rom·3차 Bézier 피팅 및
 * 소프트 래스터 역전파 보정을 수행해 즉시 편집 가능한 네이티브 벡터 스트로크로 복원한다.
 */

export const DEFAULT_INK_THRESHOLD = 0.35;
export const DEFAULT_SIMPLIFY_EPSILON_PX = 0.75;
export const DEFAULT_REFINE_ITERATIONS = 8;
export const DEFAULT_SOFT_EDGE_SIGMA_PX = 0.65;

export type RasterPixelFormat = "monochrome" | "rgba";
export type RasterInkPolarity = "dark-on-light" | "light-on-dark" | "alpha-coverage";

export interface Vec2Point { readonly x: number; readonly y: number }
export interface StrokeVertexSample {
  readonly x: number; readonly y: number; readonly radiusPx: number; readonly pressure: number;
}
export interface CatmullRomSpan {
  readonly p0: Vec2Point; readonly p1: Vec2Point; readonly p2: Vec2Point; readonly p3: Vec2Point;
  readonly alpha: number; readonly knotT: readonly [number, number, number, number];
}
export interface CubicBezierStrokeSegment {
  readonly p0: Vec2Point; readonly p1: Vec2Point; readonly p2: Vec2Point; readonly p3: Vec2Point;
  readonly r0: number; readonly r1: number; readonly r2: number; readonly r3: number;
  readonly pressureStart: number; readonly pressureEnd: number; readonly arcLengthPx: number;
}
export interface EditableVectorStroke {
  readonly strokeId: string; readonly closed: boolean;
  readonly points: readonly StrokeVertexSample[];
  readonly catmullRomSpans: readonly CatmullRomSpan[];
  readonly bezierSegments: readonly CubicBezierStrokeSegment[];
  readonly totalArcLengthPx: number; readonly meanRadiusPx: number; readonly maxPressure: number;
}
export interface DifferentiableStrokeInverseInput {
  readonly pixels: Uint8Array; readonly width: number; readonly height: number;
  readonly format?: RasterPixelFormat; readonly inkPolarity?: RasterInkPolarity;
  readonly inkThreshold?: number; readonly spurPruneLengthPx?: number;
  readonly simplifyEpsilonPx?: number; readonly maxBrushRadiusPx?: number;
  readonly pressureGamma?: number; readonly refineIterations?: number;
  readonly learningRate?: number; readonly smoothnessWeight?: number;
}
export interface DifferentiableStrokeInverseResult {
  readonly width: number; readonly height: number;
  readonly targetOpacity: Float32Array; readonly foregroundMask: Uint8Array;
  readonly edtRadiusField: Float32Array; readonly skeletonMask: Uint8Array;
  readonly strokes: readonly EditableVectorStroke[]; readonly predictedOpacity: Float32Array;
  readonly initialLossMse: number; readonly refinedLossMse: number;
  readonly iouScore: number; readonly serverCostKrw: 0;
}

const INF_DIST_SQ = 1e12;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const sigmoid = (z: number): number => (z >= 18 ? 1 : z <= -18 ? 0 : 1 / (1 + Math.exp(-z)));

/** 흑백 또는 RGBA 타일 버퍼에서 연속 잉크 불투명도(`[0..1]`)와 이진 전경 마스크를 추출한다. */
export function extractInkOpacityField(
  pixels: Uint8Array, width: number, height: number,
  format: RasterPixelFormat = "monochrome",
  polarity: RasterInkPolarity = "dark-on-light",
  inkThreshold: number = DEFAULT_INK_THRESHOLD,
): { readonly targetOpacity: Float32Array; readonly foregroundMask: Uint8Array } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`타일 크기는 양의 정수여야 합니다: ${width}x${height}`);
  }
  const pixelCount = width * height;
  const expectedLength = format === "rgba" ? pixelCount * 4 : pixelCount;
  if (pixels.length < expectedLength) {
    throw new RangeError(`픽셀 버퍼 길이(${pixels.length})가 필요한 크기(${expectedLength})보다 작습니다.`);
  }
  const threshold = clamp(inkThreshold, 0.01, 0.99);
  const targetOpacity = new Float32Array(pixelCount);
  const foregroundMask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    let ink: number;
    if (format === "monochrome") {
      const normalized = (pixels[i] ?? 0) / 255;
      ink = polarity === "dark-on-light" ? 1 - normalized : normalized;
    } else {
      const base = i * 4;
      const luma = (0.2126 * (pixels[base] ?? 0) + 0.7152 * (pixels[base + 1] ?? 0) + 0.0722 * (pixels[base + 2] ?? 0)) / 255;
      const a = (pixels[base + 3] ?? 255) / 255;
      ink = polarity === "alpha-coverage" ? a : (polarity === "dark-on-light" ? 1 - luma : luma) * a;
    }
    const c = clamp(ink, 0, 1);
    targetOpacity[i] = c;
    foregroundMask[i] = c >= threshold ? 1 : 0;
  }
  return { targetOpacity, foregroundMask };
}

function edt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF_DIST_SQ;
  z[1] = INF_DIST_SQ;
  for (let q = 1; q < n; q += 1) {
    const fq = f[q] ?? INF_DIST_SQ;
    let s = 0;
    while (k >= 0) {
      const vk = v[k] ?? 0;
      const fvk = f[vk] ?? INF_DIST_SQ;
      s = (fq + q * q - (fvk + vk * vk)) / (2 * q - 2 * vk);
      if (s > (z[k] ?? -INF_DIST_SQ)) break;
      k -= 1;
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF_DIST_SQ;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while ((z[k + 1] ?? INF_DIST_SQ) < q) k += 1;
    const vk = v[k] ?? 0;
    const diff = q - vk;
    out[q] = diff * diff + (f[vk] ?? INF_DIST_SQ);
  }
}

/** 전경 마스크 내부 픽셀에서 가장 가까운 배경 경계까지의 유클리드 반경 필드를 `O(W·H)`로 계산한다. */
export function computeEuclideanDistanceTransform(
  foregroundMask: Uint8Array, targetOpacity: Float32Array, width: number, height: number,
): Float32Array {
  const pixelCount = width * height;
  const radiusField = new Float32Array(pixelCount);
  let fgCount = 0;
  for (let i = 0; i < pixelCount; i += 1) if ((foregroundMask[i] ?? 0) > 0) fgCount += 1;
  if (fgCount === 0) return radiusField;
  if (fgCount === pixelCount) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        radiusField[y * width + x] = Math.max(0.5, Math.min(x + 1, width - x, y + 1, height - y) - 0.5);
      }
    }
    return radiusField;
  }
  const distSq = new Float64Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) distSq[i] = (foregroundMask[i] ?? 0) > 0 ? INF_DIST_SQ : 0;
  const maxDim = Math.max(width, height);
  const fBuf = new Float64Array(maxDim);
  const dBuf = new Float64Array(maxDim);
  const vBuf = new Int32Array(maxDim + 1);
  const zBuf = new Float64Array(maxDim + 2);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) fBuf[y] = distSq[y * width + x] ?? 0;
    edt1d(fBuf, height, dBuf, vBuf, zBuf);
    for (let y = 0; y < height; y += 1) distSq[y * width + x] = dBuf[y] ?? 0;
  }
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) fBuf[x] = distSq[rowOffset + x] ?? 0;
    edt1d(fBuf, width, dBuf, vBuf, zBuf);
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x;
      if ((foregroundMask[idx] ?? 0) > 0) {
        radiusField[idx] = Math.max(0.45, Math.sqrt(Math.max(0, dBuf[x] ?? 0)) - 0.5 + ((targetOpacity[idx] ?? 0.5) - 0.5) * 0.25);
      }
    }
  }
  return radiusField;
}

const sampleBin = (m: Uint8Array, w: number, h: number, x: number, y: number): number =>
  x < 0 || y < 0 || x >= w || y >= h ? 0 : (m[y * w + x] ?? 0) > 0 ? 1 : 0;

function collectMConnectedNeighbors(
  s: Uint8Array, w: number, h: number, x: number, y: number, out: number[],
): void {
  out.length = 0;
  const n = sampleBin(s, w, h, x, y - 1);
  const e = sampleBin(s, w, h, x + 1, y);
  const so = sampleBin(s, w, h, x, y + 1);
  const we = sampleBin(s, w, h, x - 1, y);
  if (n > 0) out.push((y - 1) * w + x);
  if (e > 0) out.push(y * w + x + 1);
  if (so > 0) out.push((y + 1) * w + x);
  if (we > 0) out.push(y * w + x - 1);
  if (n === 0 && e === 0 && sampleBin(s, w, h, x + 1, y - 1) > 0) out.push((y - 1) * w + x + 1);
  if (so === 0 && e === 0 && sampleBin(s, w, h, x + 1, y + 1) > 0) out.push((y + 1) * w + x + 1);
  if (so === 0 && we === 0 && sampleBin(s, w, h, x - 1, y + 1) > 0) out.push((y + 1) * w + x - 1);
  if (n === 0 && we === 0 && sampleBin(s, w, h, x - 1, y - 1) > 0) out.push((y - 1) * w + x - 1);
}

/** Zhang-Suen 2-하위반복 위상 보존 세선화 및 짧은 잔가지 제거로 1px 중심축 골격을 추출한다. */
export function skeletonizeMedialAxis(
  foregroundMask: Uint8Array, width: number, height: number, spurPruneLengthPx: number = 2,
): Uint8Array {
  const skeleton = new Uint8Array(foregroundMask);
  const toClear: number[] = [];
  const maxPasses = Math.max(width, height) + 4;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (let sub = 0; sub < 2; sub += 1) {
      toClear.length = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if ((skeleton[idx] ?? 0) === 0) continue;
          const p2 = sampleBin(skeleton, width, height, x, y - 1);
          const p3 = sampleBin(skeleton, width, height, x + 1, y - 1);
          const p4 = sampleBin(skeleton, width, height, x + 1, y);
          const p5 = sampleBin(skeleton, width, height, x + 1, y + 1);
          const p6 = sampleBin(skeleton, width, height, x, y + 1);
          const p7 = sampleBin(skeleton, width, height, x - 1, y + 1);
          const p8 = sampleBin(skeleton, width, height, x - 1, y);
          const p9 = sampleBin(skeleton, width, height, x - 1, y - 1);
          const bCount = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (bCount < 2 || bCount > 6) continue;
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let transitions = 0;
          for (let r = 0; r < 8; r += 1) if (ring[r] === 0 && ring[r + 1] === 1) transitions += 1;
          if (transitions !== 1) continue;
          const ok = sub === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
          if (ok) toClear.push(idx);
        }
      }
      if (toClear.length > 0) {
        changed = true;
        for (const idx of toClear) skeleton[idx] = 0;
      }
    }
    if (!changed) break;
  }

  const maxSpur = Math.max(0, Math.floor(spurPruneLengthPx));
  const scratch: number[] = [];
  const nextScratch: number[] = [];
  for (let iter = 0; iter < maxSpur; iter += 1) {
    const endpoints: number[] = [];
    for (let i = 0; i < width * height; i += 1) {
      if ((skeleton[i] ?? 0) === 0) continue;
      collectMConnectedNeighbors(skeleton, width, height, i % width, Math.floor(i / width), scratch);
      if (scratch.length === 1) endpoints.push(i);
    }
    let prunedAny = false;
    for (const ep of endpoints) {
      const chain = [ep];
      let curr = ep;
      let prev = -1;
      let hitsJunction = false;
      for (let step = 0; step < maxSpur; step += 1) {
        collectMConnectedNeighbors(skeleton, width, height, curr % width, Math.floor(curr / width), nextScratch);
        const cands = nextScratch.filter((nb) => nb !== prev);
        if (cands.length !== 1) {
          if (nextScratch.length >= 3) hitsJunction = true;
          break;
        }
        const nxt = cands[0]!;
        collectMConnectedNeighbors(skeleton, width, height, nxt % width, Math.floor(nxt / width), scratch);
        if (scratch.length >= 3) {
          hitsJunction = true;
          break;
        }
        prev = curr;
        curr = nxt;
        chain.push(curr);
      }
      if (hitsJunction && chain.length <= maxSpur) {
        for (const node of chain) skeleton[node] = 0;
        prunedAny = true;
      }
    }
    if (!prunedAny) break;
  }
  return skeleton;
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

function chainEndpointDir(chain: readonly number[], fromStart: boolean, width: number): Vec2Point {
  if (chain.length < 2) return { x: 1, y: 0 };
  const a = fromStart ? chain[0]! : chain[chain.length - 1]!;
  const b = fromStart ? chain[Math.min(chain.length - 1, 3)]! : chain[Math.max(0, chain.length - 4)]!;
  const dx = (b % width) - (a % width);
  const dy = Math.floor(b / width) - Math.floor(a / width);
  const len = Math.hypot(dx, dy);
  return len > 1e-6 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
}

function rdpSimplify(points: readonly StrokeVertexSample[], epsilonPx: number): StrokeVertexSample[] {
  if (points.length <= 2 || epsilonPx <= 0) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<readonly [number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [sIdx, eIdx] = stack.pop()!;
    if (eIdx - sIdx <= 1) continue;
    const a = points[sIdx]!;
    const b = points[eIdx]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abLenSq = abx * abx + aby * aby;
    let maxDev = -1;
    let split = -1;
    for (let i = sIdx + 1; i < eIdx; i += 1) {
      const p = points[i]!;
      const t = abLenSq > 1e-9 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq, 0, 1) : 0;
      const dev = Math.max(
        Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)),
        Math.abs(p.radiusPx - (a.radiusPx + (b.radiusPx - a.radiusPx) * t)) * 0.5,
      );
      if (dev > maxDev) { maxDev = dev; split = i; }
    }
    if (maxDev > epsilonPx && split > sIdx) {
      keep[split] = 1;
      stack.push([sIdx, split], [split, eIdx]);
    }
  }
  return points.filter((_, idx) => (keep[idx] ?? 0) === 1);
}

/** 골격 마스크와 거리 변환 반경 필드에서 정렬된 스트로크 폴리라인 및 정규화 필압(`[0..1]`)을 추출한다. */
export function extractOrderedStrokePolylines(
  skeletonMask: Uint8Array, edtRadiusField: Float32Array, width: number, height: number,
  options: { readonly simplifyEpsilonPx?: number; readonly maxBrushRadiusPx?: number; readonly pressureGamma?: number } = {},
): Array<{ readonly points: StrokeVertexSample[]; readonly closed: boolean }> {
  const adjacency = new Map<number, number[]>();
  const activeNodes: number[] = [];
  for (let i = 0; i < width * height; i += 1) {
    if ((skeletonMask[i] ?? 0) === 0) continue;
    const nbs: number[] = [];
    collectMConnectedNeighbors(skeletonMask, width, height, i % width, Math.floor(i / width), nbs);
    adjacency.set(i, nbs);
    activeNodes.push(i);
  }
  if (activeNodes.length === 0) return [];

  const visitedEdges = new Set<string>();
  const chains: Array<{ pixels: number[]; closed: boolean }> = [];
  const traceFrom = (startNode: number, firstNb: number): { pixels: number[]; closed: boolean } => {
    const pixels = [startNode, firstNb];
    visitedEdges.add(edgeKey(startNode, firstNb));
    let prev = startNode;
    let curr = firstNb;
    while (curr !== startNode) {
      const nbs = adjacency.get(curr) ?? [];
      if (nbs.length !== 2) return { pixels, closed: false };
      const nextNode = nbs[0] === prev ? nbs[1]! : nbs[0]!;
      const key = edgeKey(curr, nextNode);
      if (visitedEdges.has(key)) return { pixels, closed: false };
      visitedEdges.add(key);
      pixels.push(nextNode);
      prev = curr;
      curr = nextNode;
    }
    return { pixels, closed: true };
  };

  for (const node of activeNodes) if ((adjacency.get(node) ?? []).length === 0) chains.push({ pixels: [node], closed: false });
  for (const deg of [1, 3, 2] as const) {
    for (const node of activeNodes) {
      const nbs = adjacency.get(node) ?? [];
      if (!(deg === 3 ? nbs.length >= 3 : nbs.length === deg)) continue;
      for (const nb of nbs) if (!visitedEdges.has(edgeKey(node, nb))) chains.push(traceFrom(node, nb));
    }
  }

  const isJunc = (n: number): boolean => (adjacency.get(n)?.length ?? 0) >= 3;
  if (chains.some((ch) => ch.pixels.length > 5)) {
    for (let i = chains.length - 1; i >= 0; i -= 1) {
      const ch = chains[i]!;
      if (!ch.closed && ch.pixels.length <= 5 && isJunc(ch.pixels[0]!) && isJunc(ch.pixels[ch.pixels.length - 1]!)) {
        chains.splice(i, 1);
      }
    }
  }

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < chains.length && !merged; i += 1) {
      const ca = chains[i]!;
      if (ca.closed || ca.pixels.length < 2) continue;
      for (let j = i + 1; j < chains.length && !merged; j += 1) {
        const cb = chains[j]!;
        if (cb.closed || cb.pixels.length < 2) continue;
        const aS = ca.pixels[0]!; const aE = ca.pixels[ca.pixels.length - 1]!;
        const bS = cb.pixels[0]!; const bE = cb.pixels[cb.pixels.length - 1]!;
        const join = (nA: number, nB: number, aFromS: boolean, bFromS: boolean): number[] | null => {
          const gap = Math.hypot((nB % width) - (nA % width), Math.floor(nB / width) - Math.floor(nA / width));
          const maxGap = Math.max(5.5, 1.4 * ((edtRadiusField[nA] ?? 1.5) + (edtRadiusField[nB] ?? 1.5)));
          if (nA !== nB && (!isJunc(nA) || !isJunc(nB) || gap > maxGap)) return null;
          const dA = chainEndpointDir(ca.pixels, aFromS, width);
          const dB = chainEndpointDir(cb.pixels, bFromS, width);
          if (dA.x * dB.x + dA.y * dB.y > -0.75) return null;
          if (gap > 1e-4) {
            const bx = ((nB % width) - (nA % width)) / gap;
            const by = (Math.floor(nB / width) - Math.floor(nA / width)) / gap;
            if (-dA.x * bx - dA.y * by < 0.75) return null;
          }
          const left = aFromS ? [...ca.pixels].reverse() : [...ca.pixels];
          const right = bFromS ? (nA === nB ? cb.pixels.slice(1) : cb.pixels) : (nA === nB ? [...cb.pixels].reverse().slice(1) : [...cb.pixels].reverse());
          return [...left, ...right];
        };
        const c = join(aE, bS, false, true) ?? join(aE, bE, false, false) ?? join(aS, bS, true, true) ?? join(aS, bE, true, false);
        if (c !== null) { ca.pixels = c; chains.splice(j, 1); merged = true; }
      }
    }
  }

  const radii = activeNodes.map((n) => Math.max(0.45, edtRadiusField[n] ?? 0.5)).sort((a, b) => a - b);
  const maxBrushR = Math.max(0.5, options.maxBrushRadiusPx ?? (radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.98))] ?? 1));
  const invGamma = 1 / Math.max(0.2, options.pressureGamma ?? 1.0);
  const eps = options.simplifyEpsilonPx ?? DEFAULT_SIMPLIFY_EPSILON_PX;

  return chains.map((ch) => {
    const rawR = ch.pixels.map((idx) => Math.max(0.45, edtRadiusField[idx] ?? 0.5));
    const dense: StrokeVertexSample[] = ch.pixels.map((idx, k) => {
      const r = 0.25 * (rawR[Math.max(0, k - 1)] ?? rawR[k]!) + 0.5 * rawR[k]! + 0.25 * (rawR[Math.min(rawR.length - 1, k + 1)] ?? rawR[k]!);
      return { x: (idx % width) + 0.5, y: Math.floor(idx / width) + 0.5, radiusPx: r, pressure: clamp(Math.pow(clamp(r / maxBrushR, 0, 1), invGamma), 0.02, 1) };
    });
    if (ch.closed && dense.length >= 4) {
      const body = dense.slice(0, -1);
      const simp = rdpSimplify(body, eps);
      return { points: simp.length >= 3 ? simp : body, closed: true };
    }
    return { points: rdpSimplify(dense, eps), closed: false };
  });
}

function evalBezierPt(s: CubicBezierStrokeSegment, t: number): Vec2Point {
  const u = 1 - t;
  const b0 = u * u * u; const b1 = 3 * u * u * t; const b2 = 3 * u * t * t; const b3 = t * t * t;
  return { x: b0 * s.p0.x + b1 * s.p1.x + b2 * s.p2.x + b3 * s.p3.x, y: b0 * s.p0.y + b1 * s.p1.y + b2 * s.p2.y + b3 * s.p3.y };
}

const evalBezierR = (s: CubicBezierStrokeSegment, t: number): number => {
  const u = 1 - t;
  return u * u * u * s.r0 + 3 * u * u * t * s.r1 + 3 * u * t * t * s.r2 + t * t * t * s.r3;
};

function bezierArcLen(seg: CubicBezierStrokeSegment, steps: number = 12): number {
  let len = 0;
  let prev = seg.p0;
  for (let i = 1; i <= steps; i += 1) {
    const curr = evalBezierPt(seg, i / steps);
    len += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    prev = curr;
  }
  return len;
}

/** 정렬된 정점 시퀀스를 구심 Catmull-Rom(`alpha = 0.5`) 스팬과 `C1` 연속 3차 Bézier 세그먼트로 변환한다. */
export function fitCatmullRomAndCubicBeziers(
  points: readonly StrokeVertexSample[], closed: boolean, maxBrushRadiusPx: number,
): { readonly catmullRomSpans: CatmullRomSpan[]; readonly bezierSegments: CubicBezierStrokeSegment[] } {
  const alpha = 0.5;
  if (points.length === 0) return { catmullRomSpans: [], bezierSegments: [] };
  if (points.length === 1) {
    const pt = points[0]!;
    const p = { x: pt.x, y: pt.y };
    return { catmullRomSpans: [], bezierSegments: [{ p0: p, p1: p, p2: p, p3: p, r0: pt.radiusPx, r1: pt.radiusPx, r2: pt.radiusPx, r3: pt.radiusPx, pressureStart: pt.pressure, pressureEnd: pt.pressure, arcLengthPx: 0 }] };
  }
  const spanCount = closed ? points.length : points.length - 1;
  const catmullRomSpans: CatmullRomSpan[] = [];
  const bezierSegments: CubicBezierStrokeSegment[] = [];
  const getV = (idx: number): StrokeVertexSample => {
    const n = points.length;
    if (closed) return points[((idx % n) + n) % n]!;
    if (idx < 0) return { x: 2 * points[0]!.x - points[1]!.x, y: 2 * points[0]!.y - points[1]!.y, radiusPx: points[0]!.radiusPx, pressure: points[0]!.pressure };
    if (idx >= n) return { x: 2 * points[n - 1]!.x - points[n - 2]!.x, y: 2 * points[n - 1]!.y - points[n - 2]!.y, radiusPx: points[n - 1]!.radiusPx, pressure: points[n - 1]!.pressure };
    return points[idx]!;
  };

  for (let i = 0; i < spanCount; i += 1) {
    const v0 = getV(i - 1); const v1 = getV(i); const v2 = getV(i + 1); const v3 = getV(i + 2);
    const d01 = Math.max(1e-3, Math.pow(Math.hypot(v1.x - v0.x, v1.y - v0.y), alpha));
    const d12 = Math.max(1e-3, Math.pow(Math.hypot(v2.x - v1.x, v2.y - v1.y), alpha));
    const d23 = Math.max(1e-3, Math.pow(Math.hypot(v3.x - v2.x, v3.y - v2.y), alpha));
    catmullRomSpans.push({ p0: { x: v0.x, y: v0.y }, p1: { x: v1.x, y: v1.y }, p2: { x: v2.x, y: v2.y }, p3: { x: v3.x, y: v3.y }, alpha, knotT: [0, d01, d01 + d12, d01 + d12 + d23] });
    const m1x = d12 * ((v1.x - v0.x) / d01 - (v2.x - v0.x) / (d01 + d12) + (v2.x - v1.x) / d12);
    const m1y = d12 * ((v1.y - v0.y) / d01 - (v2.y - v0.y) / (d01 + d12) + (v2.y - v1.y) / d12);
    const m2x = d12 * ((v2.x - v1.x) / d12 - (v3.x - v1.x) / (d12 + d23) + (v3.x - v2.x) / d23);
    const m2y = d12 * ((v2.y - v1.y) / d12 - (v3.y - v1.y) / (d12 + d23) + (v3.y - v2.y) / d23);
    const draft: CubicBezierStrokeSegment = {
      p0: { x: v1.x, y: v1.y }, p1: { x: v1.x + m1x / 3, y: v1.y + m1y / 3 },
      p2: { x: v2.x - m2x / 3, y: v2.y - m2y / 3 }, p3: { x: v2.x, y: v2.y },
      r0: v1.radiusPx, r1: Math.max(0.35, v1.radiusPx + (v2.radiusPx - v0.radiusPx) / 6),
      r2: Math.max(0.35, v2.radiusPx - (v3.radiusPx - v1.radiusPx) / 6), r3: v2.radiusPx,
      pressureStart: clamp(v1.radiusPx / Math.max(0.5, maxBrushRadiusPx), 0.02, 1),
      pressureEnd: clamp(v2.radiusPx / Math.max(0.5, maxBrushRadiusPx), 0.02, 1), arcLengthPx: 0,
    };
    bezierSegments.push({ ...draft, arcLengthPx: bezierArcLen(draft) });
  }
  return { catmullRomSpans, bezierSegments };
}

/** 벡터 스트로크 집합을 미분 가능한 소프트 시그모이드 캡슐 필드로 래스터화한다. */
export function rasterizeVectorStrokesSoft(
  strokes: readonly EditableVectorStroke[], width: number, height: number,
  softEdgeSigmaPx: number = DEFAULT_SOFT_EDGE_SIGMA_PX,
): Float32Array {
  const out = new Float32Array(width * height);
  const sigma = Math.max(0.15, softEdgeSigmaPx);
  for (const stroke of strokes) {
    for (const seg of stroke.bezierSegments) {
      const steps = Math.max(4, Math.min(48, Math.ceil(seg.arcLengthPx * 1.5) + 2));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const pt = evalBezierPt(seg, t);
        const radius = Math.max(0.35, evalBezierR(seg, t));
        const m = radius + sigma * 3.5;
        const x0 = Math.max(0, Math.floor(pt.x - m));
        const x1 = Math.min(width - 1, Math.ceil(pt.x + m));
        const y0 = Math.max(0, Math.floor(pt.y - m));
        const y1 = Math.min(height - 1, Math.ceil(pt.y + m));
        for (let y = y0; y <= y1; y += 1) {
          const row = y * width;
          for (let x = x0; x <= x1; x += 1) {
            const cov = sigmoid((radius - Math.hypot(x + 0.5 - pt.x, y + 0.5 - pt.y)) / sigma);
            if (cov > (out[row + x] ?? 0)) out[row + x] = cov;
          }
        }
      }
    }
  }
  return out;
}

/** 목표 잉크 필드와 예측 소프트 래스터 간의 MSE 손실 및 전경 IoU 점수를 계산한다. */
export function evaluateRasterReconstructionMetrics(
  targetOpacity: Float32Array, predictedOpacity: Float32Array, threshold: number = DEFAULT_INK_THRESHOLD,
): { readonly mse: number; readonly iou: number } {
  const n = targetOpacity.length;
  if (n === 0) return { mse: 0, iou: 1 };
  let sqSum = 0; let inter = 0; let union = 0;
  for (let i = 0; i < n; i += 1) {
    const target = targetOpacity[i] ?? 0;
    const pred = predictedOpacity[i] ?? 0;
    const diff = pred - target;
    sqSum += diff * diff;
    if (target >= threshold && pred >= threshold) inter += 1;
    if (target >= threshold || pred >= threshold) union += 1;
  }
  return { mse: sqSum / n, iou: union === 0 ? 1 : inter / union };
}

interface MutableSeg {
  p0x: number; p0y: number; p1x: number; p1y: number;
  p2x: number; p2y: number; p3x: number; p3y: number;
  r0: number; r1: number; r2: number; r3: number;
}

function toImmutableStroke(t: EditableVectorStroke, segs: readonly MutableSeg[], maxBrushR: number): EditableVectorStroke {
  let totalLen = 0; let rSum = 0; let maxP = 0;
  const bezierSegments: CubicBezierStrokeSegment[] = segs.map((m) => {
    const pS = clamp(m.r0 / Math.max(0.5, maxBrushR), 0.02, 1);
    const pE = clamp(m.r3 / Math.max(0.5, maxBrushR), 0.02, 1);
    maxP = Math.max(maxP, pS, pE);
    rSum += 0.5 * (m.r0 + m.r3);
    const draft: CubicBezierStrokeSegment = {
      p0: { x: m.p0x, y: m.p0y }, p1: { x: m.p1x, y: m.p1y }, p2: { x: m.p2x, y: m.p2y }, p3: { x: m.p3x, y: m.p3y },
      r0: m.r0, r1: m.r1, r2: m.r2, r3: m.r3, pressureStart: pS, pressureEnd: pE, arcLengthPx: 0,
    };
    const arcLengthPx = bezierArcLen(draft);
    totalLen += arcLengthPx;
    return { ...draft, arcLengthPx };
  });
  return { ...t, bezierSegments, totalArcLengthPx: totalLen, meanRadiusPx: segs.length > 0 ? rSum / segs.length : t.meanRadiusPx, maxPressure: Math.max(maxP, t.maxPressure) };
}

function refineStrokesDifferentiable(
  initialStrokes: readonly EditableVectorStroke[], targetOpacity: Float32Array,
  width: number, height: number, maxBrushR: number, iterations: number, lr: number, smoothW: number,
): { readonly strokes: EditableVectorStroke[]; readonly predictedOpacity: Float32Array; readonly initialMse: number; readonly refinedMse: number } {
  const sigma = DEFAULT_SOFT_EDGE_SIGMA_PX;
  let strokes = [...initialStrokes];
  let pred = rasterizeVectorStrokesSoft(strokes, width, height, sigma);
  const initialMse = evaluateRasterReconstructionMetrics(targetOpacity, pred).mse;
  let currentMse = initialMse;
  if (iterations <= 0 || strokes.length === 0) return { strokes, predictedOpacity: pred, initialMse, refinedMse: currentMse };

  let stepScale = Math.max(0.05, lr);
  for (let iter = 0; iter < iterations; iter += 1) {
    const candidateStrokes: EditableVectorStroke[] = [];
    for (const stroke of strokes) {
      const segs: MutableSeg[] = stroke.bezierSegments.map((s) => ({
        p0x: s.p0.x, p0y: s.p0.y, p1x: s.p1.x, p1y: s.p1.y, p2x: s.p2.x, p2y: s.p2.y, p3x: s.p3.x, p3y: s.p3.y,
        r0: s.r0, r1: s.r1, r2: s.r2, r3: s.r3,
      }));
      const grads = new Float64Array(segs.length * 8);
      for (let si = 0; si < segs.length; si += 1) {
        const seg = stroke.bezierSegments[si]!;
        const gB = si * 8;
        const sc = Math.max(5, Math.min(24, Math.ceil(seg.arcLengthPx) + 2));
        const samples: Array<{ x: number; y: number; r: number; t: number }> = [];
        let minX = width; let maxX = 0; let minY = height; let maxY = 0;
        for (let s = 0; s <= sc; s += 1) {
          const t = s / sc;
          const pt = evalBezierPt(seg, t);
          const r = Math.max(0.35, evalBezierR(seg, t));
          samples.push({ x: pt.x, y: pt.y, r, t });
          const mg = r + sigma * 3;
          minX = Math.min(minX, pt.x - mg); maxX = Math.max(maxX, pt.x + mg);
          minY = Math.min(minY, pt.y - mg); maxY = Math.max(maxY, pt.y + mg);
        }
        const x0 = Math.max(0, Math.floor(minX)); const x1 = Math.min(width - 1, Math.ceil(maxX));
        const y0 = Math.max(0, Math.floor(minY)); const y1 = Math.min(height - 1, Math.ceil(maxY));
        const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
        for (let y = y0; y <= y1; y += 1) {
          const row = y * width;
          for (let x = x0; x <= x1; x += 1) {
            const idx = row + x;
            const curP = pred[idx] ?? 0;
            const err = curP - (targetOpacity[idx] ?? 0);
            if (Math.abs(err) < 1e-4) continue;
            let best = samples[0]!;
            let bestSc = -1e9;
            for (const sp of samples) {
              const sVal = sp.r - Math.hypot(x + 0.5 - sp.x, y + 0.5 - sp.y);
              if (sVal > bestSc) { bestSc = sVal; best = sp; }
            }
            const dx = best.x - (x + 0.5);
            const dy = best.y - (y + 0.5);
            const dist = Math.max(1e-4, Math.hypot(dx, dy));
            const cov = sigmoid((best.r - dist) / sigma);
            if (cov < curP - 0.08) continue;
            const dL = (2 * err * ((cov * (1 - cov)) / sigma)) / area;
            const t = best.t; const u = 1 - t;
            const b0 = u * u * u; const b1 = 3 * u * u * t; const b2 = 3 * u * t * t; const b3 = t * t * t;
            grads[gB] = (grads[gB] ?? 0) + dL * (-dx / dist) * b1;
            grads[gB + 1] = (grads[gB + 1] ?? 0) + dL * (-dy / dist) * b1;
            grads[gB + 2] = (grads[gB + 2] ?? 0) + dL * (-dx / dist) * b2;
            grads[gB + 3] = (grads[gB + 3] ?? 0) + dL * (-dy / dist) * b2;
            grads[gB + 4] = (grads[gB + 4] ?? 0) + dL * b0;
            grads[gB + 5] = (grads[gB + 5] ?? 0) + dL * b1;
            grads[gB + 6] = (grads[gB + 6] ?? 0) + dL * b2;
            grads[gB + 7] = (grads[gB + 7] ?? 0) + dL * b3;
          }
        }
        const m = segs[si]!;
        grads[gB] = (grads[gB] ?? 0) + smoothW * (m.p1x - (m.p0x + (m.p3x - m.p0x) / 3));
        grads[gB + 1] = (grads[gB + 1] ?? 0) + smoothW * (m.p1y - (m.p0y + (m.p3y - m.p0y) / 3));
        grads[gB + 2] = (grads[gB + 2] ?? 0) + smoothW * (m.p2x - (m.p0x + ((m.p3x - m.p0x) * 2) / 3));
        grads[gB + 3] = (grads[gB + 3] ?? 0) + smoothW * (m.p2y - (m.p0y + ((m.p3y - m.p0y) * 2) / 3));
      }
      for (let si = 0; si < segs.length; si += 1) {
        const m = segs[si]!; const gB = si * 8;
        m.p1x -= stepScale * clamp(grads[gB] ?? 0, -1.5, 1.5);
        m.p1y -= stepScale * clamp(grads[gB + 1] ?? 0, -1.5, 1.5);
        m.p2x -= stepScale * clamp(grads[gB + 2] ?? 0, -1.5, 1.5);
        m.p2y -= stepScale * clamp(grads[gB + 3] ?? 0, -1.5, 1.5);
        m.r1 = clamp(m.r1 - stepScale * 0.6 * clamp(grads[gB + 5] ?? 0, -1.0, 1.0), 0.3, width);
        m.r2 = clamp(m.r2 - stepScale * 0.6 * clamp(grads[gB + 6] ?? 0, -1.0, 1.0), 0.3, width);
      }
      for (let si = 0; si < segs.length; si += 1) {
        const m = segs[si]!; const gB = si * 8;
        if (si === 0 && !stroke.closed) m.r0 = clamp(m.r0 - stepScale * 0.5 * clamp(grads[4] ?? 0, -1.0, 1.0), 0.3, width);
        const nxt = si + 1 < segs.length ? si + 1 : stroke.closed ? 0 : -1;
        if (nxt >= 0) {
          const sharedR = clamp(m.r3 - stepScale * 0.25 * clamp((grads[gB + 7] ?? 0) + (grads[nxt * 8 + 4] ?? 0), -2, 2), 0.3, width);
          m.r3 = sharedR; segs[nxt]!.r0 = sharedR;
        } else {
          m.r3 = clamp(m.r3 - stepScale * 0.5 * clamp(grads[gB + 7] ?? 0, -1.0, 1.0), 0.3, width);
        }
      }
      candidateStrokes.push(toImmutableStroke(stroke, segs, maxBrushR));
    }
    const candPred = rasterizeVectorStrokesSoft(candidateStrokes, width, height, sigma);
    const candMse = evaluateRasterReconstructionMetrics(targetOpacity, candPred).mse;
    if (candMse <= currentMse) { strokes = candidateStrokes; pred = candPred; currentMse = candMse; }
    else { stepScale *= 0.5; if (stepScale < 0.02) break; }
  }
  return { strokes, predictedOpacity: pred, initialMse, refinedMse: currentMse };
}

/** 병합된 래스터 선화 타일에서 거리 변환·중심축 골격화·필압 추정·3차 Bézier 역산 보정을 일괄 수행한다. */
export function solveDifferentiableStrokeInverse(
  input: DifferentiableStrokeInverseInput,
): DifferentiableStrokeInverseResult {
  const format = input.format ?? "monochrome";
  const polarity = input.inkPolarity ?? "dark-on-light";
  const inkThreshold = input.inkThreshold ?? DEFAULT_INK_THRESHOLD;
  const { targetOpacity, foregroundMask } = extractInkOpacityField(
    input.pixels, input.width, input.height, format, polarity, inkThreshold,
  );
  const edtRadiusField = computeEuclideanDistanceTransform(foregroundMask, targetOpacity, input.width, input.height);
  const skeletonMask = skeletonizeMedialAxis(foregroundMask, input.width, input.height, input.spurPruneLengthPx ?? 2);
  const polylineChains = extractOrderedStrokePolylines(skeletonMask, edtRadiusField, input.width, input.height, {
    simplifyEpsilonPx: input.simplifyEpsilonPx,
    maxBrushRadiusPx: input.maxBrushRadiusPx,
    pressureGamma: input.pressureGamma,
  });

  let inferredMaxR = input.maxBrushRadiusPx ?? 0;
  if (inferredMaxR <= 0) {
    for (const ch of polylineChains) for (const pt of ch.points) if (pt.radiusPx > inferredMaxR) inferredMaxR = pt.radiusPx;
    inferredMaxR = Math.max(0.5, inferredMaxR);
  }

  const draftStrokes: EditableVectorStroke[] = polylineChains.map((chain, index) => {
    const { catmullRomSpans, bezierSegments } = fitCatmullRomAndCubicBeziers(chain.points, chain.closed, inferredMaxR);
    let totalArcLengthPx = 0;
    for (const seg of bezierSegments) totalArcLengthPx += seg.arcLengthPx;
    let sumR = 0; let maxP = 0;
    for (const pt of chain.points) { sumR += pt.radiusPx; if (pt.pressure > maxP) maxP = pt.pressure; }
    return {
      strokeId: `stroke-${index}`, closed: chain.closed, points: chain.points,
      catmullRomSpans, bezierSegments, totalArcLengthPx,
      meanRadiusPx: chain.points.length > 0 ? sumR / chain.points.length : 0, maxPressure: maxP,
    };
  });

  const refined = refineStrokesDifferentiable(
    draftStrokes, targetOpacity, input.width, input.height, inferredMaxR,
    input.refineIterations ?? DEFAULT_REFINE_ITERATIONS,
    input.learningRate ?? 0.8, input.smoothnessWeight ?? 0.015,
  );
  const finalMetrics = evaluateRasterReconstructionMetrics(targetOpacity, refined.predictedOpacity, inkThreshold);
  return {
    width: input.width, height: input.height, targetOpacity, foregroundMask,
    edtRadiusField, skeletonMask, strokes: refined.strokes,
    predictedOpacity: refined.predictedOpacity,
    initialLossMse: refined.initialMse, refinedLossMse: refined.refinedMse,
    iouScore: finalMetrics.iou, serverCostKrw: 0,
  };
}

/** 기본 파라미터를 보관하며 타일 단위 선화 역산을 반복 실행하는 솔버 클래스. */
export class DifferentiableStrokeInverseSolver {
  private readonly defaultOptions: Omit<DifferentiableStrokeInverseInput, "pixels" | "width" | "height">;

  public constructor(defaultOptions: Omit<DifferentiableStrokeInverseInput, "pixels" | "width" | "height"> = {}) {
    this.defaultOptions = defaultOptions;
  }

  public solveTile(
    pixels: Uint8Array, width: number, height: number,
    overrides: Partial<Omit<DifferentiableStrokeInverseInput, "pixels" | "width" | "height">> = {},
  ): DifferentiableStrokeInverseResult {
    return solveDifferentiableStrokeInverse({ ...this.defaultOptions, ...overrides, pixels, width, height });
  }
}
