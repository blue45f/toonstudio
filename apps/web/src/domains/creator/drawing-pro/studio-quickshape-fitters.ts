/**
 * 클린룸 QuickShape 6종 기하 최소자승 적합 솔버.
 *
 * - 직선: PCA 직교 총최소자승(Total Least Squares)
 * - 원·원호: Kåsa 대수적 최소자승 + Levenberg-Marquardt 기하 반경 정밀화
 * - 타원: PCA 주축 초기화 + 5-매개변수(cx, cy, rx, ry, φ) Levenberg-Marquardt 적합
 * - 삼각형: 최대 면적 꼭짓점 초기화 + 3변 개별 PCA 직선 교점 정밀화
 * - 사각형: 4θ 원형 평균 회전각 추정 + 교대 최소자승(ALS) 4변 적합
 */

export interface QuickShapePoint2D {
  readonly x: number;
  readonly y: number;
}

export interface PcaLineFit {
  readonly mean: QuickShapePoint2D;
  readonly dir: QuickShapePoint2D;
  readonly normal: QuickShapePoint2D;
  readonly start: QuickShapePoint2D;
  readonly end: QuickShapePoint2D;
  readonly rmsePx: number;
  readonly spanLen: number;
}

export interface CircleFit {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly rmsePx: number;
  readonly startAngleRad: number;
  readonly endAngleRad: number;
  readonly signedSweepRad: number;
  readonly monotonicRatio: number;
}

export interface EllipseFit {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly rotationRad: number;
  readonly rmsePx: number;
}

export interface PolygonFit {
  readonly vertices: readonly QuickShapePoint2D[];
  readonly rmsePx: number;
  readonly rotationRad?: number;
}

export function clampRange(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampUnit(v: number): number {
  return clampRange(v, 0, 1);
}

export function pointDistance(a: QuickShapePoint2D, b: QuickShapePoint2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 부분 피벗 가우스 소거법으로 n×n 선형 연립방정식 Ax = b 를 푼다. */
export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const aug = matrix.map((row, i) => [...row, rhs[i]!]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col]![col]!);
    for (let r = col + 1; r < n; r += 1) {
      const val = Math.abs(aug[r]![col]!);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-12 || !Number.isFinite(maxAbs)) return null;
    if (pivotRow !== col) {
      const tmp = aug[col]!;
      aug[col] = aug[pivotRow]!;
      aug[pivotRow] = tmp;
    }
    const pivot = aug[col]![col]!;
    for (let r = col + 1; r < n; r += 1) {
      const factor = aug[r]![col]! / pivot;
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) {
        aug[r]![c] = aug[r]![c]! - factor * aug[col]![c]!;
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let sum = aug[r]![n]!;
    for (let c = r + 1; c < n; c += 1) sum -= aug[r]![c]! * x[c]!;
    x[r] = sum / aug[r]![r]!;
    if (!Number.isFinite(x[r])) return null;
  }
  return x;
}

export function cleanAndResampleStroke(
  raw: readonly QuickShapePoint2D[],
  count: number,
): {
  readonly cleaned: readonly QuickShapePoint2D[];
  readonly resampled: readonly QuickShapePoint2D[];
  readonly totalLength: number;
  readonly diagonal: number;
  readonly centroid: QuickShapePoint2D;
} {
  const cleaned: QuickShapePoint2D[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const pt = raw[i]!;
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const prev = cleaned[cleaned.length - 1];
    if (!prev || pointDistance(prev, pt) > 1e-4) cleaned.push({ x: pt.x, y: pt.y });
  }
  if (cleaned.length < 2) {
    return {
      cleaned,
      resampled: cleaned,
      totalLength: 0,
      diagonal: 0,
      centroid: cleaned[0] ?? { x: 0, y: 0 },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const cum: number[] = [0];
  let totalLength = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const p = cleaned[i]!;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (i > 0) {
      totalLength += pointDistance(cleaned[i - 1]!, p);
      cum.push(totalLength);
    }
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  if (totalLength <= 1e-6) {
    return { cleaned, resampled: cleaned, totalLength: 0, diagonal, centroid: cleaned[0]! };
  }

  const m = Math.max(8, Math.round(count));
  const resampled: QuickShapePoint2D[] = [];
  let seg = 0;
  let sumX = 0;
  let sumY = 0;
  for (let k = 0; k < m; k += 1) {
    const target = (k / (m - 1)) * totalLength;
    while (seg < cum.length - 2 && cum[seg + 1]! < target) seg += 1;
    const segLen = cum[seg + 1]! - cum[seg]!;
    const t = segLen > 1e-9 ? clampUnit((target - cum[seg]!) / segLen) : 0;
    const a = cleaned[seg]!;
    const b = cleaned[seg + 1]!;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    resampled.push({ x: px, y: py });
    sumX += px;
    sumY += py;
  }

  return { cleaned, resampled, totalLength, diagonal, centroid: { x: sumX / m, y: sumY / m } };
}

function pointToSegmentDist(
  p: QuickShapePoint2D,
  a: QuickShapePoint2D,
  b: QuickShapePoint2D,
): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-12) return pointDistance(p, a);
  const t = clampUnit(((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq);
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

function polygonPerimeterRmse(
  pts: readonly QuickShapePoint2D[],
  vertices: readonly QuickShapePoint2D[],
): number {
  let sqSum = 0;
  const k = vertices.length;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    let best = Infinity;
    for (let e = 0; e < k; e += 1) {
      const d = pointToSegmentDist(p, vertices[e]!, vertices[(e + 1) % k]!);
      if (d < best) best = d;
    }
    sqSum += best * best;
  }
  return Math.sqrt(sqSum / Math.max(1, pts.length));
}

export function fitPcaLine(pts: readonly QuickShapePoint2D[]): PcaLineFit {
  const n = pts.length;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const ux = p.x - mx;
    const uy = p.y - my;
    sxx += ux * ux;
    syy += uy * uy;
    sxy += ux * uy;
  }

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let dx = Math.cos(theta);
  let dy = Math.sin(theta);
  const first = pts[0]!;
  const last = pts[n - 1]!;
  if ((last.x - first.x) * dx + (last.y - first.y) * dy < 0) {
    dx = -dx;
    dy = -dy;
  }
  const nx = -dy;
  const ny = dx;

  let tMin = Infinity;
  let tMax = -Infinity;
  let sqErr = 0;
  for (const p of pts) {
    const ux = p.x - mx;
    const uy = p.y - my;
    const t = ux * dx + uy * dy;
    const perp = ux * nx + uy * ny;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
    sqErr += perp * perp;
  }

  return {
    mean: { x: mx, y: my },
    dir: { x: dx, y: dy },
    normal: { x: nx, y: ny },
    start: { x: mx + tMin * dx, y: my + tMin * dy },
    end: { x: mx + tMax * dx, y: my + tMax * dy },
    rmsePx: Math.sqrt(sqErr / Math.max(1, n)),
    spanLen: Math.max(0, tMax - tMin),
  };
}

export function fitCircleLeastSquares(pts: readonly QuickShapePoint2D[]): CircleFit | null {
  const n = pts.length;
  if (n < 3) return null;

  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let suu = 0;
  let suv = 0;
  let svv = 0;
  let su = 0;
  let sv = 0;
  let suz = 0;
  let svz = 0;
  let sz = 0;
  for (const p of pts) {
    const u = p.x - mx;
    const v = p.y - my;
    const z = u * u + v * v;
    suu += u * u;
    suv += u * v;
    svv += v * v;
    su += u;
    sv += v;
    suz += u * z;
    svz += v * z;
    sz += z;
  }

  const sol = solveLinearSystem(
    [
      [suu, suv, su],
      [suv, svv, sv],
      [su, sv, n],
    ],
    [-suz, -svz, -sz],
  );
  if (!sol) return null;

  let cx = mx - sol[0]! * 0.5;
  let cy = my - sol[1]! * 0.5;
  const rSq = (sol[0]! * sol[0]! + sol[1]! * sol[1]!) * 0.25 - sol[2]!;
  if (!Number.isFinite(rSq) || rSq <= 1) return null;
  let r = Math.sqrt(rSq);

  const evalCost = (x0: number, y0: number, rad: number): number => {
    let s = 0;
    for (const p of pts) {
      const e = Math.hypot(p.x - x0, p.y - y0) - rad;
      s += e * e;
    }
    return s;
  };

  let lambda = 1e-3;
  let cost = evalCost(cx, cy, r);
  for (let iter = 0; iter < 10; iter += 1) {
    const jtj: number[][] = [
      [lambda, 0, 0],
      [0, lambda, 0],
      [0, 0, lambda],
    ];
    const jtr = [0, 0, 0];
    for (const p of pts) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.max(1e-6, Math.hypot(dx, dy));
      const res = d - r;
      const j = [-dx / d, -dy / d, -1];
      for (let a = 0; a < 3; a += 1) {
        jtr[a] = jtr[a]! - j[a]! * res;
        for (let b = 0; b < 3; b += 1) jtj[a]![b] = jtj[a]![b]! + j[a]! * j[b]!;
      }
    }
    const delta = solveLinearSystem(jtj, jtr);
    if (!delta) break;
    const ncx = cx + delta[0]!;
    const ncy = cy + delta[1]!;
    const nr = r + delta[2]!;
    if (nr > 1 && Number.isFinite(nr)) {
      const nextCost = evalCost(ncx, ncy, nr);
      if (nextCost < cost) {
        cx = ncx;
        cy = ncy;
        r = nr;
        cost = nextCost;
        lambda = Math.max(1e-6, lambda * 0.5);
        if (Math.hypot(delta[0]!, delta[1]!, delta[2]!) < 1e-4) break;
        continue;
      }
    }
    lambda *= 4;
  }

  const startAngleRad = Math.atan2(pts[0]!.y - cy, pts[0]!.x - cx);
  let prevAngle = startAngleRad;
  let signedSweepRad = 0;
  let posSteps = 0;
  let negSteps = 0;
  for (let i = 1; i < n; i += 1) {
    const cur = Math.atan2(pts[i]!.y - cy, pts[i]!.x - cx);
    let diff = cur - prevAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    signedSweepRad += diff;
    if (diff > 1e-4) posSteps += 1;
    else if (diff < -1e-4) negSteps += 1;
    prevAngle = cur;
  }

  return {
    cx,
    cy,
    radius: r,
    rmsePx: Math.sqrt(cost / n),
    startAngleRad,
    endAngleRad: startAngleRad + signedSweepRad,
    signedSweepRad,
    monotonicRatio: Math.max(posSteps, negSteps) / Math.max(1, posSteps + negSteps),
  };
}

function ellipseResidualPx(
  p: QuickShapePoint2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phi: number,
): number {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const qx = (dx * cos + dy * sin) / rx;
  const qy = (-dx * sin + dy * cos) / ry;
  const gradNorm = Math.max(1e-6, Math.hypot(qx / rx, qy / ry));
  return (Math.hypot(qx, qy) - 1) / gradNorm;
}

export function fitEllipseLeastSquares(pts: readonly QuickShapePoint2D[]): EllipseFit | null {
  const n = pts.length;
  if (n < 5) return null;

  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const ux = p.x - mx;
    const uy = p.y - my;
    sxx += ux * ux;
    syy += uy * uy;
    sxy += ux * uy;
  }
  const initPhi = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos0 = Math.cos(initPhi);
  const sin0 = Math.sin(initPhi);
  let varU = 0;
  let varV = 0;
  for (const p of pts) {
    const u = (p.x - mx) * cos0 + (p.y - my) * sin0;
    const v = -(p.x - mx) * sin0 + (p.y - my) * cos0;
    varU += u * u;
    varV += v * v;
  }

  let params = [
    mx,
    my,
    Math.max(2, Math.sqrt((2 * varU) / n)),
    Math.max(2, Math.sqrt((2 * varV) / n)),
    initPhi,
  ];
  const costOf = (pr: readonly number[]): number => {
    let s = 0;
    for (const p of pts) {
      const e = ellipseResidualPx(p, pr[0]!, pr[1]!, pr[2]!, pr[3]!, pr[4]!);
      s += e * e;
    }
    return s;
  };

  let cost = costOf(params);
  let lambda = 1e-2;
  const epsStep = [1e-3, 1e-3, 1e-3, 1e-3, 1e-4];

  for (let iter = 0; iter < 12; iter += 1) {
    const jtj: number[][] = Array.from({ length: 5 }, (_, i) =>
      Array.from({ length: 5 }, (__, j) => (i === j ? lambda : 0)),
    );
    const jtr = [0, 0, 0, 0, 0];

    for (const p of pts) {
      const r0 = ellipseResidualPx(p, params[0]!, params[1]!, params[2]!, params[3]!, params[4]!);
      const grad = [0, 0, 0, 0, 0];
      for (let k = 0; k < 5; k += 1) {
        const h = epsStep[k]!;
        const shifted = [...params];
        shifted[k] = shifted[k]! + h;
        const r1 = ellipseResidualPx(p, shifted[0]!, shifted[1]!, shifted[2]!, shifted[3]!, shifted[4]!);
        grad[k] = (r1 - r0) / h;
      }
      for (let a = 0; a < 5; a += 1) {
        jtr[a] = jtr[a]! - grad[a]! * r0;
        for (let b = 0; b < 5; b += 1) jtj[a]![b] = jtj[a]![b]! + grad[a]! * grad[b]!;
      }
    }

    const delta = solveLinearSystem(jtj, jtr);
    if (!delta) break;
    const candidate = params.map((v, i) => v + delta[i]!);
    if (candidate[2]! > 1.5 && candidate[3]! > 1.5 && candidate.every(Number.isFinite)) {
      const nextCost = costOf(candidate);
      if (nextCost < cost) {
        params = candidate;
        cost = nextCost;
        lambda = Math.max(1e-5, lambda * 0.5);
        if (Math.hypot(...delta) < 1e-3) break;
        continue;
      }
    }
    lambda *= 4;
  }

  let rx = params[2]!;
  let ry = params[3]!;
  let phi = params[4]!;
  if (ry > rx) {
    const tmp = rx;
    rx = ry;
    ry = tmp;
    phi += Math.PI * 0.5;
  }
  while (phi >= Math.PI * 0.5) phi -= Math.PI;
  while (phi < -Math.PI * 0.5) phi += Math.PI;
  if (rx / ry > 6) return null;

  return { cx: params[0]!, cy: params[1]!, rx, ry, rotationRad: phi, rmsePx: Math.sqrt(cost / n) };
}

function intersectInfiniteLines(a: PcaLineFit, b: PcaLineFit): QuickShapePoint2D | null {
  const det = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(det) < 1e-4) return null;
  const wx = b.mean.x - a.mean.x;
  const wy = b.mean.y - a.mean.y;
  const t = (wx * b.dir.y - wy * b.dir.x) / det;
  return { x: a.mean.x + t * a.dir.x, y: a.mean.y + t * a.dir.y };
}

export function fitTriangleLeastSquares(
  pts: readonly QuickShapePoint2D[],
  centroid: QuickShapePoint2D,
  diagonal: number,
): PolygonFit | null {
  const n = pts.length;
  if (n < 6) return null;

  let i0 = 0;
  let maxD = -1;
  for (let i = 0; i < n; i += 1) {
    const d = pointDistance(pts[i]!, centroid);
    if (d > maxD) {
      maxD = d;
      i0 = i;
    }
  }
  let i1 = i0;
  maxD = -1;
  for (let i = 0; i < n; i += 1) {
    const d = pointDistance(pts[i]!, pts[i0]!);
    if (d > maxD) {
      maxD = d;
      i1 = i;
    }
  }
  const triArea2 = (a: QuickShapePoint2D, b: QuickShapePoint2D, c: QuickShapePoint2D): number =>
    Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

  let i2 = i0;
  let maxA = -1;
  for (let i = 0; i < n; i += 1) {
    const a = triArea2(pts[i0]!, pts[i1]!, pts[i]!);
    if (a > maxA) {
      maxA = a;
      i2 = i;
    }
  }

  const indices = [i0, i1, i2];
  for (let pass = 0; pass < 3; pass += 1) {
    for (let slot = 0; slot < 3; slot += 1) {
      const otherA = pts[indices[(slot + 1) % 3]!]!;
      const otherB = pts[indices[(slot + 2) % 3]!]!;
      let bestIdx = indices[slot]!;
      let bestArea = triArea2(pts[bestIdx]!, otherA, otherB);
      for (let i = 0; i < n; i += 1) {
        const a = triArea2(pts[i]!, otherA, otherB);
        if (a > bestArea) {
          bestArea = a;
          bestIdx = i;
        }
      }
      indices[slot] = bestIdx;
    }
  }

  indices.sort((a, b) => a - b);
  const rawVerts: readonly QuickShapePoint2D[] = [pts[indices[0]!]!, pts[indices[1]!]!, pts[indices[2]!]!];
  if (triArea2(rawVerts[0]!, rawVerts[1]!, rawVerts[2]!) < diagonal * diagonal * 0.04) return null;

  const sliceCyclic = (from: number, to: number): QuickShapePoint2D[] => {
    const out: QuickShapePoint2D[] = [];
    let cur = from;
    for (let guard = 0; guard <= n; guard += 1) {
      out.push(pts[cur]!);
      if (cur === to) break;
      cur = (cur + 1) % n;
    }
    return out;
  };
  const edgeClusters = [
    sliceCyclic(indices[0]!, indices[1]!),
    sliceCyclic(indices[1]!, indices[2]!),
    sliceCyclic(indices[2]!, indices[0]!),
  ];

  let bestVerts = rawVerts;
  let bestRmse = polygonPerimeterRmse(pts, rawVerts);
  if (edgeClusters.every((c) => c.length >= 4)) {
    const lines = edgeClusters.map((cluster) => {
      const trim = Math.max(1, Math.floor(cluster.length * 0.12));
      const inner = cluster.slice(trim, cluster.length - trim);
      return fitPcaLine(inner.length >= 2 ? inner : cluster);
    });
    const v0 = intersectInfiniteLines(lines[2]!, lines[0]!);
    const v1 = intersectInfiniteLines(lines[0]!, lines[1]!);
    const v2 = intersectInfiniteLines(lines[1]!, lines[2]!);
    if (
      v0 && v1 && v2
      && pointDistance(v0, centroid) < diagonal * 1.4
      && pointDistance(v1, centroid) < diagonal * 1.4
      && pointDistance(v2, centroid) < diagonal * 1.4
    ) {
      const refined = [v0, v1, v2];
      const refinedRmse = polygonPerimeterRmse(pts, refined);
      if (refinedRmse <= bestRmse * 1.05) {
        bestVerts = refined;
        bestRmse = refinedRmse;
      }
    }
  }

  for (let e = 0; e < 3; e += 1) {
    if (pointDistance(bestVerts[e]!, bestVerts[(e + 1) % 3]!) < diagonal * 0.1) return null;
  }
  return { vertices: bestVerts, rmsePx: bestRmse };
}

function fitRectangleAtAngle(
  pts: readonly QuickShapePoint2D[],
  phi: number,
  diagonal: number,
): PolygonFit | null {
  const cos = Math.cos(-phi);
  const sin = Math.sin(-phi);
  const rotated = pts.map((p) => ({ u: p.x * cos - p.y * sin, v: p.x * sin + p.y * cos }));

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const r of rotated) {
    if (r.u < uMin) uMin = r.u;
    if (r.u > uMax) uMax = r.u;
    if (r.v < vMin) vMin = r.v;
    if (r.v > vMax) vMax = r.v;
  }

  const sideCounts = [0, 0, 0, 0];
  for (let iter = 0; iter < 4; iter += 1) {
    const sums = [0, 0, 0, 0];
    sideCounts.fill(0);
    for (const r of rotated) {
      const dLeft = Math.abs(r.u - uMin);
      const dRight = Math.abs(r.u - uMax);
      const dTop = Math.abs(r.v - vMin);
      const dBottom = Math.abs(r.v - vMax);
      const minD = Math.min(dLeft, dRight, dTop, dBottom);
      const side = minD === dLeft ? 0 : minD === dRight ? 1 : minD === dTop ? 2 : 3;
      sums[side] = sums[side]! + (side < 2 ? r.u : r.v);
      sideCounts[side] = sideCounts[side]! + 1;
    }
    if (sideCounts[0]! > 0) uMin = sums[0]! / sideCounts[0]!;
    if (sideCounts[1]! > 0) uMax = sums[1]! / sideCounts[1]!;
    if (sideCounts[2]! > 0) vMin = sums[2]! / sideCounts[2]!;
    if (sideCounts[3]! > 0) vMax = sums[3]! / sideCounts[3]!;
  }

  const minSupport = Math.max(2, Math.floor(pts.length * 0.06));
  if (
    uMax - uMin < diagonal * 0.1
    || vMax - vMin < diagonal * 0.1
    || sideCounts.some((c) => c < minSupport)
  ) {
    return null;
  }

  const cosB = Math.cos(phi);
  const sinB = Math.sin(phi);
  const unrot = (u: number, v: number): QuickShapePoint2D => ({
    x: u * cosB - v * sinB,
    y: u * sinB + v * cosB,
  });
  const vertices: readonly QuickShapePoint2D[] = [
    unrot(uMin, vMin),
    unrot(uMax, vMin),
    unrot(uMax, vMax),
    unrot(uMin, vMax),
  ];
  return { vertices, rmsePx: polygonPerimeterRmse(pts, vertices), rotationRad: phi };
}

export function fitRectangleLeastSquares(
  pts: readonly QuickShapePoint2D[],
  diagonal: number,
): PolygonFit | null {
  if (pts.length < 8) return null;

  let sumCos4 = 0;
  let sumSin4 = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    const dy = pts[i + 1]!.y - pts[i]!.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;
    const ang = Math.atan2(dy, dx);
    sumCos4 += len * Math.cos(4 * ang);
    sumSin4 += len * Math.sin(4 * ang);
  }
  const phiQuad = 0.25 * Math.atan2(sumSin4, sumCos4);
  const pcaPhi = Math.atan2(fitPcaLine(pts).dir.y, fitPcaLine(pts).dir.x);

  let best: PolygonFit | null = null;
  for (const ang of [phiQuad, pcaPhi, 0]) {
    const res = fitRectangleAtAngle(pts, ang, diagonal);
    if (res && (!best || res.rmsePx < best.rmsePx)) best = res;
  }
  if (!best) return null;

  for (const stepDeg of [4, 1.5, 0.4]) {
    const stepRad = (stepDeg * Math.PI) / 180;
    for (const dir of [-1, 1]) {
      const cand = fitRectangleAtAngle(pts, (best.rotationRad ?? 0) + dir * stepRad, diagonal);
      if (cand && cand.rmsePx < best.rmsePx) best = cand;
    }
  }
  return best;
}

export function sampleEllipseOrArcPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationRad: number,
  startAngle: number,
  endAngle: number,
  sampleCount: number,
  closed: boolean,
): readonly QuickShapePoint2D[] {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const out: QuickShapePoint2D[] = [];
  const steps = Math.max(8, sampleCount);
  for (let i = 0; i <= steps; i += 1) {
    const a = startAngle + ((endAngle - startAngle) * i) / steps;
    const lx = rx * Math.cos(a);
    const ly = ry * Math.sin(a);
    out.push({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos });
  }
  if (closed && out.length > 1) out[out.length - 1] = out[0]!;
  return out;
}
