/**
 * Wave 39E — Procreate 돌파 QuickShape 자석 도형 스냅 + ColorDrop 틈새 닫기·할로 방지 엔진.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type QuickShapeKind =
  | "line"
  | "circle"
  | "ellipse"
  | "triangle"
  | "rectangle"
  | "freehand";

export interface QuickShapeResult {
  readonly kind: QuickShapeKind;
  readonly snapped: boolean;
  readonly rmsError: number;
  readonly maxRmsTolerance: number;
  readonly confidence: number;
  readonly snappedPoints: readonly Vec2[];
  readonly summaryKo: string;
}

export interface ColorDropCanvasInput {
  readonly width: number;
  readonly height: number;
  readonly inkAlpha: Float32Array;
}

export interface ColorDropOptions {
  readonly seed: Vec2;
  readonly dragThreshold: number;
  readonly gapCloseRadiusPx: number;
  readonly antiHaloExpandPx: number;
}

export interface ColorDropResult {
  readonly width: number;
  readonly height: number;
  readonly filledPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly gapSealed: boolean;
  readonly haloPixelsBefore: number;
  readonly haloPixelsAfter: number;
  readonly haloEliminationRatio: number;
  readonly filledMask: Uint8Array;
}

const EPS = 1e-9;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function dist2d(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function projectPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) return dist2d(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function resamplePolyline(points: readonly Vec2[], count: number): Vec2[] {
  if (points.length <= 1) return [...points];
  const arcs: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    arcs.push(arcs[i - 1]! + dist2d(points[i - 1]!, points[i]!));
  }
  const total = arcs[arcs.length - 1] ?? 0;
  if (total < EPS) return Array.from({ length: count }, () => points[0]!);
  const resampled: Vec2[] = [];
  for (let k = 0; k < count; k += 1) {
    const s = (k / (count - 1)) * total;
    for (let i = 0; i < points.length - 1; i += 1) {
      const s0 = arcs[i]!;
      const s1 = arcs[i + 1]!;
      if (s <= s1 + 1e-6 || i === points.length - 2) {
        const t = clamp((s - s0) / Math.max(EPS, s1 - s0), 0, 1);
        const p0 = points[i]!;
        const p1 = points[i + 1]!;
        resampled.push({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
        break;
      }
    }
  }
  return resampled;
}

function rmsToPolygonEdges(pts: readonly Vec2[], vertices: readonly Vec2[], normScale: number): number {
  let sumSq = 0;
  for (const p of pts) {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < vertices.length; i += 1) {
      const d = projectPointToSegment(p, vertices[i]!, vertices[(i + 1) % vertices.length]!);
      if (d < best) best = d;
    }
    sumSq += best * best;
  }
  return Math.sqrt(sumSq / Math.max(1, pts.length)) / Math.max(EPS, normScale);
}

/** Procreate 돌파 QuickShape 자석 도형 인식·스냅 (직선/원/타원/삼각형/사각형, RMS < 0.04). */
export function recognizeAndSnapQuickShape(
  rawPoints: readonly Vec2[],
  maxRmsTolerance = 0.04,
): QuickShapeResult {
  if (rawPoints.length < 2) {
    return {
      kind: "freehand",
      snapped: false,
      rmsError: 1,
      maxRmsTolerance,
      confidence: 0,
      snappedPoints: rawPoints,
      summaryKo: "포인트 부족 — 자유곡선 유지",
    };
  }

  const pts = resamplePolyline(rawPoints, 72);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let sumY = 0;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / pts.length;
  const cy = sumY / pts.length;
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (diag < 2) {
    return {
      kind: "freehand",
      snapped: false,
      rmsError: 1,
      maxRmsTolerance,
      confidence: 0,
      snappedPoints: rawPoints,
      summaryKo: "크기 과소 — 자유곡선 유지",
    };
  }

  const isClosed = dist2d(rawPoints[0]!, rawPoints[rawPoints.length - 1]!) < diag * 0.32;
  const lineStart = rawPoints[0]!;
  const lineEnd = rawPoints[rawPoints.length - 1]!;
  const lineLen = Math.max(EPS, dist2d(lineStart, lineEnd));
  let lineSq = 0;
  for (const p of pts) {
    const d = projectPointToSegment(p, lineStart, lineEnd);
    lineSq += d * d;
  }
  const lineRms = Math.sqrt(lineSq / pts.length) / lineLen;
  if (!isClosed && lineRms < maxRmsTolerance) {
    return {
      kind: "line",
      snapped: true,
      rmsError: roundTo(lineRms, 5),
      maxRmsTolerance,
      confidence: roundTo(clamp(1 - lineRms / maxRmsTolerance, 0.5, 0.99), 3),
      snappedPoints: [lineStart, lineEnd],
      summaryKo: `직선 자석 스냅 완료 (RMS ${(lineRms * 100).toFixed(2)}%)`,
    };
  }
  if (!isClosed) {
    return {
      kind: "freehand",
      snapped: false,
      rmsError: roundTo(lineRms, 5),
      maxRmsTolerance,
      confidence: 0,
      snappedPoints: rawPoints,
      summaryKo: "열린 자유곡선 유지",
    };
  }

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= pts.length;
  syy /= pts.length;
  sxy /= pts.length;
  const trace = sxx + syy;
  const detTerm = Math.hypot(sxx - syy, 2 * sxy);
  const lam1 = Math.max(EPS, (trace + detTerm) * 0.5);
  const lam2 = Math.max(EPS, (trace - detTerm) * 0.5);
  const majorAngle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const aspectRatio = Math.sqrt(lam1 / lam2);

  // 원 피팅
  const radii = pts.map((p) => dist2d(p, { x: cx, y: cy }));
  const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
  const circleRms =
    Math.sqrt(radii.reduce((acc, r) => acc + (r - meanR) ** 2, 0) / pts.length) /
    Math.max(EPS, 2 * meanR);
  const circlePts: Vec2[] = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return { x: roundTo(cx + Math.cos(a) * meanR, 2), y: roundTo(cy + Math.sin(a) * meanR, 2) };
  });

  // 타원 피팅
  const cosE = Math.cos(majorAngle);
  const sinE = Math.sin(majorAngle);
  const semiA = Math.sqrt(2 * lam1);
  const semiB = Math.sqrt(2 * lam2);
  let ellSq = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * cosE + dy * sinE;
    const v = -dx * sinE + dy * cosE;
    const err = Math.abs(Math.hypot(u / Math.max(EPS, semiA), v / Math.max(EPS, semiB)) - 1) * Math.sqrt(semiA * semiB);
    ellSq += err * err;
  }
  const ellipseRms = Math.sqrt(ellSq / pts.length) / Math.max(EPS, diag);
  const ellipsePts: Vec2[] = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const ex = Math.cos(a) * semiA;
    const ey = Math.sin(a) * semiB;
    return { x: roundTo(cx + ex * cosE - ey * sinE, 2), y: roundTo(cy + ex * sinE + ey * cosE, 2) };
  });

  // 삼각형 피팅 (최대 면적 3정점 좌표 상승)
  let v0 = pts[0]!;
  let maxD0 = -1;
  for (const p of pts) {
    const d = dist2d(p, { x: cx, y: cy });
    if (d > maxD0) {
      maxD0 = d;
      v0 = p;
    }
  }
  let v1 = pts[0]!;
  let maxD1 = -1;
  for (const p of pts) {
    const d = dist2d(p, v0);
    if (d > maxD1) {
      maxD1 = d;
      v1 = p;
    }
  }
  let v2 = pts[0]!;
  let maxArea = -1;
  for (const p of pts) {
    const area = Math.abs(cross2d(v1.x - v0.x, v1.y - v0.y, p.x - v0.x, p.y - v0.y));
    if (area > maxArea) {
      maxArea = area;
      v2 = p;
    }
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const verts: [Vec2, Vec2, Vec2] = [v0, v1, v2];
    for (let slot = 0; slot < 3; slot += 1) {
      const a = verts[(slot + 1) % 3]!;
      const b = verts[(slot + 2) % 3]!;
      let bestP = verts[slot]!;
      let bestA = -1;
      for (const p of pts) {
        const area = Math.abs(cross2d(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y));
        if (area > bestA) {
          bestA = area;
          bestP = p;
        }
      }
      verts[slot] = bestP;
    }
    [v0, v1, v2] = verts;
  }
  const triCorners: readonly Vec2[] = [v0, v1, v2];
  const triRms = rmsToPolygonEdges(pts, triCorners, diag);

  // 사각형 피팅 (최소 면적 회전 경계 상자 OBB)
  let bestRectArea = Number.POSITIVE_INFINITY;
  let bestRectCorners: Vec2[] = [];
  for (let step = 0; step < 36; step += 1) {
    const theta = (step / 36) * (Math.PI * 0.5);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let uMin = Number.POSITIVE_INFINITY;
    let uMax = Number.NEGATIVE_INFINITY;
    let vMin = Number.POSITIVE_INFINITY;
    let vMax = Number.NEGATIVE_INFINITY;
    for (const p of pts) {
      const u = p.x * c + p.y * s;
      const v = -p.x * s + p.y * c;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    const area = (uMax - uMin) * (vMax - vMin);
    if (area < bestRectArea) {
      bestRectArea = area;
      const toW = (u: number, v: number): Vec2 => ({ x: roundTo(u * c - v * s, 2), y: roundTo(u * s + v * c, 2) });
      bestRectCorners = [toW(uMin, vMin), toW(uMax, vMin), toW(uMax, vMax), toW(uMin, vMax)];
    }
  }
  const rectRms = rmsToPolygonEdges(pts, bestRectCorners, diag);

  const candidates: {
    readonly kind: Exclude<QuickShapeKind, "line" | "freehand">;
    readonly rms: number;
    readonly snappedPoints: readonly Vec2[];
    readonly labelKo: string;
  }[] = [
    { kind: "triangle", rms: triRms, snappedPoints: [...triCorners, triCorners[0]!], labelKo: "삼각형" },
    { kind: "rectangle", rms: rectRms, snappedPoints: [...bestRectCorners, bestRectCorners[0]!], labelKo: "사각형" },
    aspectRatio <= 1.2
      ? { kind: "circle", rms: circleRms, snappedPoints: circlePts, labelKo: "정원" }
      : { kind: "ellipse", rms: ellipseRms, snappedPoints: ellipsePts, labelKo: "타원" },
  ];
  candidates.sort((a, b) => a.rms - b.rms);
  const best = candidates[0]!;
  const snapped = best.rms < maxRmsTolerance;

  return {
    kind: snapped ? best.kind : "freehand",
    snapped,
    rmsError: roundTo(best.rms, 5),
    maxRmsTolerance,
    confidence: snapped ? roundTo(clamp(1 - best.rms / maxRmsTolerance, 0.5, 0.99), 3) : 0,
    snappedPoints: snapped ? best.snappedPoints : rawPoints,
    summaryKo: snapped
      ? `${best.labelKo} 자석 스냅 완료 (RMS ${(best.rms * 100).toFixed(2)}%)`
      : `자유곡선 유지 (최소 RMS ${(best.rms * 100).toFixed(2)}% ≥ 기준)`,
  };
}

/** QuickShape 테스트/프리뷰용 손떨림 포함 자유곡선 포인트열 생성기. */
export function createDemoQuickShapeStroke(
  shape: "line" | "circle" | "ellipse" | "triangle" | "rectangle" | "scribble",
): readonly Vec2[] {
  const jitter = (i: number, amp: number): Vec2 => ({
    x: Math.sin(i * 2.17) * amp,
    y: Math.cos(i * 1.73) * amp,
  });

  if (shape === "line") {
    return Array.from({ length: 28 }, (_, i) => {
      const t = i / 27;
      const j = jitter(i, 1.4);
      return { x: 24 + t * 190 + j.x, y: 148 - t * 92 + j.y };
    });
  }
  if (shape === "circle" || shape === "ellipse") {
    const rx = shape === "circle" ? 62 : 82;
    const ry = shape === "circle" ? 62 : 42;
    return Array.from({ length: 54 }, (_, i) => {
      const a = (i / 53) * Math.PI * 2;
      const j = jitter(i, 1.5);
      return { x: 120 + Math.cos(a) * rx + j.x, y: 100 + Math.sin(a) * ry + j.y };
    });
  }
  if (shape === "triangle" || shape === "rectangle") {
    const corners: readonly Vec2[] =
      shape === "triangle"
        ? [{ x: 120, y: 30 }, { x: 196, y: 162 }, { x: 44, y: 162 }, { x: 120, y: 30 }]
        : [{ x: 46, y: 42 }, { x: 194, y: 42 }, { x: 194, y: 158 }, { x: 46, y: 158 }, { x: 46, y: 42 }];
    const out: Vec2[] = [];
    const stepsPerEdge = shape === "triangle" ? 16 : 14;
    for (let e = 0; e < corners.length - 1; e += 1) {
      for (let s = 0; s < stepsPerEdge; s += 1) {
        const t = s / stepsPerEdge;
        const a = corners[e]!;
        const b = corners[e + 1]!;
        const j = jitter(e * stepsPerEdge + s, 1.15);
        out.push({ x: a.x + (b.x - a.x) * t + j.x, y: a.y + (b.y - a.y) * t + j.y });
      }
    }
    out.push(corners[0]!);
    return out;
  }
  return Array.from({ length: 42 }, (_, i) => {
    const t = i / 41;
    return { x: 24 + t * 188, y: 100 + Math.sin(t * Math.PI * 7) * 44 + Math.cos(t * Math.PI * 3) * 18 };
  });
}

/** 틈새(gap) + 안티앨리어싱 프린지가 포함된 ColorDrop 테스트 캔버스 생성. */
export function createDemoColorDropCanvas(gapWidthPx = 4): ColorDropCanvasInput {
  const width = 44;
  const height = 44;
  const inkAlpha = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - 21.5;
      const dy = y - 21.5;
      const ringDist = Math.abs(Math.hypot(dx, dy) - 14);
      if (dx > 0 && Math.abs(dy) <= gapWidthPx * 0.5) continue;
      if (ringDist <= 0.7) {
        inkAlpha[y * width + x] = 1.0;
      } else if (ringDist <= 1.8) {
        inkAlpha[y * width + x] = roundTo(clamp(1 - (ringDist - 0.7) / 1.25, 0.12, 0.72), 3);
      }
    }
  }
  return { width, height, inkAlpha };
}

function morphMask(mask: Uint8Array, width: number, height: number, radius: number, dilate: boolean): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const out = new Uint8Array(mask.length);
  const rCeil = Math.ceil(radius);
  const rSq = radius * radius + 0.25;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = dilate ? 0 : 1;
      for (let ky = -rCeil; ky <= rCeil; ky += 1) {
        for (let kx = -rCeil; kx <= rCeil; kx += 1) {
          if (kx * kx + ky * ky > rSq) continue;
          const nx = x + kx;
          const ny = y + ky;
          const val = nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : mask[ny * width + nx]!;
          if (dilate && val === 1) hit = 1;
          else if (!dilate && val === 0) hit = 0;
        }
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

/** Procreate급 드래그 임계값(threshold) 기반 틈새 닫기(gap-close) & 할로 방지 채우기 시뮬레이터. */
export function simulateColorDropFill(canvas: ColorDropCanvasInput, options: ColorDropOptions): ColorDropResult {
  const { width, height, inkAlpha } = canvas;
  const threshold = clamp(options.dragThreshold, 0.05, 0.96);
  const gapRadius = clamp(options.gapCloseRadiusPx, 0, 6);
  const antiHaloPx = clamp(Math.round(options.antiHaloExpandPx), 0, 3);

  const rawBarrier = new Uint8Array(width * height);
  for (let i = 0; i < inkAlpha.length; i += 1) {
    rawBarrier[i] = inkAlpha[i]! >= threshold ? 1 : 0;
  }
  const closedBarrier =
    gapRadius > 0
      ? morphMask(morphMask(rawBarrier, width, height, gapRadius, true), width, height, gapRadius, false)
      : rawBarrier;

  const filledMask = new Uint8Array(width * height);
  const sx = clamp(Math.round(options.seed.x), 0, width - 1);
  const sy = clamp(Math.round(options.seed.y), 0, height - 1);
  let leakedToBorder = false;

  if (closedBarrier[sy * width + sx] === 0) {
    const queue: number[] = [sy * width + sx];
    filledMask[sy * width + sx] = 1;
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head]!;
      head += 1;
      const x = idx % width;
      const y = (idx - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) leakedToBorder = true;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (filledMask[nIdx] === 1 || closedBarrier[nIdx] === 1) continue;
        filledMask[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  const countHalos = (mask: Uint8Array): number => {
    let halos = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        const alpha = inkAlpha[idx]!;
        if (mask[idx] === 1 || alpha <= 0.05 || alpha >= 0.92) continue;
        if (mask[idx - 1] === 1 || mask[idx + 1] === 1 || mask[idx - width] === 1 || mask[idx + width] === 1) {
          halos += 1;
        }
      }
    }
    return halos;
  };

  const haloPixelsBefore = countHalos(filledMask);
  for (let pass = 0; pass < antiHaloPx; pass += 1) {
    const snap = new Uint8Array(filledMask);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        if (snap[idx] === 1 || inkAlpha[idx]! >= 0.95) continue;
        if (snap[idx - 1] === 1 || snap[idx + 1] === 1 || snap[idx - width] === 1 || snap[idx + width] === 1) {
          filledMask[idx] = 1;
        }
      }
    }
  }

  const haloPixelsAfter = countHalos(filledMask);
  let filledPixelCount = 0;
  for (let i = 0; i < filledMask.length; i += 1) {
    if (filledMask[i] === 1) filledPixelCount += 1;
  }

  return {
    width,
    height,
    filledPixelCount,
    leakedToBorder,
    gapSealed: !leakedToBorder && filledPixelCount > 0,
    haloPixelsBefore,
    haloPixelsAfter,
    haloEliminationRatio:
      haloPixelsBefore === 0 ? 1 : roundTo(clamp(1 - haloPixelsAfter / haloPixelsBefore, 0, 1), 3),
    filledMask,
  };
}
