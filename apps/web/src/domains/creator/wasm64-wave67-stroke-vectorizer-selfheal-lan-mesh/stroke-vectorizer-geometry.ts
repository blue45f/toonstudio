/**
 * Wave 67 내부 기하 커널:
 * - Felzenszwalb-Huttenlocher 정밀 유클리드 거리 변환(EDT)
 * - Zhang-Suen 세선화 + 8-연결성 보존 L-코너 계단 제거
 * - Philip Schneider 3차 베지에 커브 피팅 및 평가기
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface CubicBezierSegment {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
  readonly startRadiusPx: number;
  readonly endRadiusPx: number;
  readonly startPressure: number;
  readonly endPressure: number;
  readonly maxFitErrorPx: number;
}

const INF_DIST_SQ = 1e12;
const MAX_BEZIER_DEPTH = 14;
const MAX_NEWTON_ITERS = 4;

export function clampNumber(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function vecDist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function vecDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function vecNormalize(dx: number, dy: number): Vec2 {
  const len = Math.hypot(dx, dy);
  return len <= 1e-9 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len };
}

function edt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF_DIST_SQ;
  z[1] = INF_DIST_SQ;
  for (let q = 1; q < n; q += 1) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (k > 0 && s <= z[k]) {
      k -= 1;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF_DIST_SQ;
  }
  let idx = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[idx + 1] < q) idx += 1;
    const diff = q - v[idx];
    out[q] = diff * diff + f[v[idx]];
  }
}

/**
 * 전경 마스크에서 가장 가까운 배경(또는 이미지 바깥)까지의 정밀 유클리드 거리 변환(EDT)을 계산한다.
 */
export function computeEuclideanDistanceTransform(
  binaryMask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height);
  if (width <= 0 || height <= 0) return out;

  const pw = width + 2;
  const ph = height + 2;
  const grid = new Float64Array(pw * ph);
  for (let y = 0; y < ph; y += 1) {
    for (let x = 0; x < pw; x += 1) {
      const inside = x >= 1 && x <= width && y >= 1 && y <= height;
      const isFg = inside && binaryMask[(y - 1) * width + (x - 1)] !== 0;
      grid[y * pw + x] = isFg ? INF_DIST_SQ : 0;
    }
  }

  const maxDim = Math.max(pw, ph);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let x = 0; x < pw; x += 1) {
    for (let y = 0; y < ph; y += 1) f[y] = grid[y * pw + x];
    edt1d(f, ph, d, v, z);
    for (let y = 0; y < ph; y += 1) grid[y * pw + x] = d[y];
  }
  for (let y = 0; y < ph; y += 1) {
    const rowOff = y * pw;
    for (let x = 0; x < pw; x += 1) f[x] = grid[rowOff + x];
    edt1d(f, pw, d, v, z);
    for (let x = 0; x < pw; x += 1) grid[rowOff + x] = d[x];
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sq = grid[(y + 1) * pw + (x + 1)];
      out[y * width + x] = sq >= INF_DIST_SQ * 0.5 ? 0 : Math.sqrt(sq);
    }
  }
  return out;
}

/**
 * Zhang-Suen 2단계 세선화 + 8-연결성 보존 L-코너 계단 제거로 1픽셀 중심선 스켈레톤을 추출한다.
 */
export function zhangSuenThinning(binaryMask: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  if (width <= 0 || height <= 0) return result;

  const pw = width + 2;
  const ph = height + 2;
  const img = new Uint8Array(pw * ph);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      img[(y + 1) * pw + (x + 1)] = binaryMask[y * width + x] !== 0 ? 1 : 0;
    }
  }

  const toDelete: number[] = [];
  let changed = true;
  let guard = 0;
  const maxIterations = Math.max(64, Math.min(width, height) * 2);

  while (changed && guard < maxIterations) {
    changed = false;
    guard += 1;
    for (let pass = 0; pass < 2; pass += 1) {
      toDelete.length = 0;
      for (let y = 1; y <= height; y += 1) {
        const row = y * pw;
        for (let x = 1; x <= width; x += 1) {
          const idx = row + x;
          if (img[idx] === 0) continue;

          const p2 = img[idx - pw];
          const p3 = img[idx - pw + 1];
          const p4 = img[idx + 1];
          const p5 = img[idx + pw + 1];
          const p6 = img[idx + pw];
          const p7 = img[idx + pw - 1];
          const p8 = img[idx - 1];
          const p9 = img[idx - pw - 1];

          const neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbors < 2 || neighbors > 6) continue;

          const transitions =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0);
          if (transitions !== 1) continue;

          const cond =
            pass === 0
              ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0
              : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
          if (cond) toDelete.push(idx);
        }
      }
      if (toDelete.length > 0) {
        changed = true;
        for (let i = 0; i < toDelete.length; i += 1) img[toDelete[i]] = 0;
      }
    }
  }

  for (let y = 1; y <= height; y += 1) {
    const row = y * pw;
    for (let x = 1; x <= width; x += 1) {
      const idx = row + x;
      if (img[idx] === 0) continue;
      const n = img[idx - pw];
      const ne = img[idx - pw + 1];
      const e = img[idx + 1];
      const se = img[idx + pw + 1];
      const s = img[idx + pw];
      const sw = img[idx + pw - 1];
      const w = img[idx - 1];
      const nw = img[idx - pw - 1];

      if (
        (n === 1 && e === 1 && s === 0 && w === 0 && sw === 0) ||
        (e === 1 && s === 1 && w === 0 && n === 0 && nw === 0) ||
        (s === 1 && w === 1 && n === 0 && e === 0 && ne === 0) ||
        (w === 1 && n === 1 && e === 0 && s === 0 && se === 0)
      ) {
        img[idx] = 0;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      result[y * width + x] = img[(y + 1) * pw + (x + 1)];
    }
  }
  return result;
}

/**
 * 3차 베지에 곡선 상의 매개변수 t in [0..1] 위치 좌표를 계산한다.
 */
export function evaluateCubicBezier(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

function evalCubicDeriv1(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

function evalCubicDeriv2(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
    y: 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
  };
}

function chordLengthParameterize(pts: readonly Vec2[], first: number, last: number): Float64Array {
  const n = last - first + 1;
  const u = new Float64Array(n);
  for (let i = 1; i < n; i += 1) {
    u[i] = u[i - 1] + vecDist(pts[first + i - 1], pts[first + i]);
  }
  const total = u[n - 1];
  if (total > 1e-9) {
    for (let i = 1; i < n; i += 1) u[i] /= total;
  } else {
    for (let i = 1; i < n; i += 1) u[i] = i / Math.max(1, n - 1);
  }
  return u;
}

function generateBezierSegment(
  pts: readonly Vec2[],
  first: number,
  last: number,
  uPrime: Float64Array,
  tHat1: Vec2,
  tHat2: Vec2,
): [Vec2, Vec2, Vec2, Vec2] {
  const n = last - first + 1;
  const p0 = pts[first];
  const p3 = pts[last];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < n; i += 1) {
    const u = uPrime[i];
    const mu = 1 - u;
    const b0 = mu * mu * mu;
    const b1 = 3 * u * mu * mu;
    const b2 = 3 * u * u * mu;
    const b3 = u * u * u;
    const a1x = tHat1.x * b1;
    const a1y = tHat1.y * b1;
    const a2x = tHat2.x * b2;
    const a2y = tHat2.y * b2;
    c00 += a1x * a1x + a1y * a1y;
    c01 += a1x * a2x + a1y * a2y;
    c11 += a2x * a2x + a2y * a2y;
    const tmpX = pts[first + i].x - (p0.x * (b0 + b1) + p3.x * (b2 + b3));
    const tmpY = pts[first + i].y - (p0.y * (b0 + b1) + p3.y * (b2 + b3));
    x0 += a1x * tmpX + a1y * tmpY;
    x1 += a2x * tmpX + a2y * tmpY;
  }

  const det = c00 * c11 - c01 * c01;
  let alphaL = Math.abs(det) > 1e-12 ? (x0 * c11 - x1 * c01) / det : 0;
  let alphaR = Math.abs(det) > 1e-12 ? (c00 * x1 - c01 * x0) / det : 0;
  const segLen = vecDist(p0, p3);
  if (alphaL < 1e-6 * segLen || alphaR < 1e-6 * segLen) {
    alphaL = segLen / 3;
    alphaR = segLen / 3;
  }
  return [
    p0,
    { x: p0.x + tHat1.x * alphaL, y: p0.y + tHat1.y * alphaL },
    { x: p3.x + tHat2.x * alphaR, y: p3.y + tHat2.y * alphaR },
    p3,
  ];
}

function computeMaxFitError(
  pts: readonly Vec2[],
  first: number,
  last: number,
  bez: readonly [Vec2, Vec2, Vec2, Vec2],
  u: Float64Array,
): { maxDistSq: number; splitPoint: number } {
  let maxDistSq = 0;
  let splitPoint = Math.floor((first + last) / 2);
  for (let i = first + 1; i < last; i += 1) {
    const evalPt = evaluateCubicBezier(bez[0], bez[1], bez[2], bez[3], u[i - first]);
    const dx = evalPt.x - pts[i].x;
    const dy = evalPt.y - pts[i].y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= maxDistSq) {
      maxDistSq = distSq;
      splitPoint = i;
    }
  }
  return { maxDistSq, splitPoint };
}

function reparameterizeNewton(
  pts: readonly Vec2[],
  first: number,
  last: number,
  u: Float64Array,
  bez: readonly [Vec2, Vec2, Vec2, Vec2],
): Float64Array {
  const n = last - first + 1;
  const next = new Float64Array(n);
  next[n - 1] = 1;
  for (let i = 1; i < n - 1; i += 1) {
    const t = u[i];
    const q = evaluateCubicBezier(bez[0], bez[1], bez[2], bez[3], t);
    const q1 = evalCubicDeriv1(bez[0], bez[1], bez[2], bez[3], t);
    const q2 = evalCubicDeriv2(bez[0], bez[1], bez[2], bez[3], t);
    const diffX = q.x - pts[first + i].x;
    const diffY = q.y - pts[first + i].y;
    const num = diffX * q1.x + diffY * q1.y;
    const den = q1.x * q1.x + q1.y * q1.y + diffX * q2.x + diffY * q2.y;
    next[i] = Math.abs(den) > 1e-12 ? clampNumber(t - num / den, 0, 1) : t;
  }
  return next;
}

/**
 * Philip Schneider(Graphics Gems) 알고리즘으로 폴리라인을 허용 오차 내 3차 베지에 커브 시퀀스로 피팅한다.
 */
export function fitCubicBezierSchneider(
  points: readonly Vec2[],
  maxErrorPx: number,
  radiiPx?: readonly number[],
  pressures?: readonly number[],
): CubicBezierSegment[] {
  if (points.length < 2) return [];
  const errorSq = Math.max(1e-4, maxErrorPx * maxErrorPx);
  const iterationErrorSq = Math.max(errorSq * 4, errorSq + 1e-3);
  const segments: CubicBezierSegment[] = [];

  const pushSeg = (bez: readonly [Vec2, Vec2, Vec2, Vec2], first: number, last: number, errPx: number): void => {
    segments.push({
      p0: bez[0],
      p1: bez[1],
      p2: bez[2],
      p3: bez[3],
      startRadiusPx: radiiPx?.[first] ?? 1,
      endRadiusPx: radiiPx?.[last] ?? 1,
      startPressure: pressures?.[first] ?? 0.5,
      endPressure: pressures?.[last] ?? 0.5,
      maxFitErrorPx: errPx,
    });
  };

  const fitRange = (first: number, last: number, tHat1: Vec2, tHat2: Vec2, depth: number): void => {
    if (last - first + 1 === 2) {
      const p0 = points[first];
      const p3 = points[last];
      const dist = vecDist(p0, p3) / 3;
      pushSeg(
        [
          p0,
          { x: p0.x + tHat1.x * dist, y: p0.y + tHat1.y * dist },
          { x: p3.x + tHat2.x * dist, y: p3.y + tHat2.y * dist },
          p3,
        ],
        first,
        last,
        0,
      );
      return;
    }

    let u = chordLengthParameterize(points, first, last);
    let bez = generateBezierSegment(points, first, last, u, tHat1, tHat2);
    let { maxDistSq, splitPoint } = computeMaxFitError(points, first, last, bez, u);
    if (maxDistSq <= errorSq) {
      pushSeg(bez, first, last, Math.sqrt(maxDistSq));
      return;
    }

    if (maxDistSq < iterationErrorSq) {
      for (let iter = 0; iter < MAX_NEWTON_ITERS; iter += 1) {
        u = reparameterizeNewton(points, first, last, u, bez);
        bez = generateBezierSegment(points, first, last, u, tHat1, tHat2);
        const evalRes = computeMaxFitError(points, first, last, bez, u);
        maxDistSq = evalRes.maxDistSq;
        splitPoint = evalRes.splitPoint;
        if (maxDistSq <= errorSq) {
          pushSeg(bez, first, last, Math.sqrt(maxDistSq));
          return;
        }
      }
    }

    if (depth >= MAX_BEZIER_DEPTH || splitPoint <= first || splitPoint >= last) {
      pushSeg(bez, first, last, Math.sqrt(maxDistSq));
      return;
    }

    const tHatCenter = vecNormalize(
      (points[splitPoint - 1].x - points[splitPoint + 1].x) * 0.5,
      (points[splitPoint - 1].y - points[splitPoint + 1].y) * 0.5,
    );
    fitRange(first, splitPoint, tHat1, tHatCenter, depth + 1);
    fitRange(splitPoint, last, { x: -tHatCenter.x, y: -tHatCenter.y }, tHat2, depth + 1);
  };

  const isClosed = points.length >= 4 && vecDist(points[0], points[points.length - 1]) < 1e-4;
  if (isClosed) {
    let split = Math.floor(points.length / 2);
    let bestDist = -1;
    for (let i = 1; i < points.length - 1; i += 1) {
      const d = vecDist(points[0], points[i]);
      if (d > bestDist) {
        bestDist = d;
        split = i;
      }
    }
    const tStart = vecNormalize(
      points[1].x - points[points.length - 2].x,
      points[1].y - points[points.length - 2].y,
    );
    const tMid = vecNormalize(points[split - 1].x - points[split + 1].x, points[split - 1].y - points[split + 1].y);
    fitRange(0, split, tStart, tMid, 0);
    fitRange(split, points.length - 1, { x: -tMid.x, y: -tMid.y }, { x: -tStart.x, y: -tStart.y }, 0);
    return segments;
  }

  const leftSpan = Math.min(points.length - 1, 2);
  const rightSpan = Math.max(0, points.length - 3);
  const tHat1 = vecNormalize(points[leftSpan].x - points[0].x, points[leftSpan].y - points[0].y);
  const tHat2 = vecNormalize(
    points[rightSpan].x - points[points.length - 1].x,
    points[rightSpan].y - points[points.length - 1].y,
  );
  fitRange(0, points.length - 1, tHat1, tHat2, 0);
  return segments;
}
