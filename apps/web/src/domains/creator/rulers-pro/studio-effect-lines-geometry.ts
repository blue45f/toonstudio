/**
 * 절차적 효과선 기하·클리핑·테이퍼 리본·PRNG·SVG 직렬화 유틸리티.
 */

import type {
  CubicBezierControlPoints,
  CutFrameClip,
  EffectLineBounds,
  EffectPolygonStrip,
  EffectTaperMode,
  Point2D,
  ProceduralEffectLineConfig,
  ProceduralEffectLineKind,
  ProceduralEffectLineResult,
} from "./studio-effect-lines-types";
import type { El } from "../studio-element-model";

const GEOM_EPS = 1e-7;

export function clampEffectNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundEffectCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 시드를 결정적 32비트 부호 없는 정수로 정규화한다. */
export function normalizeEffectSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 20261122;
  return (Math.trunc(seed) >>> 0) || 1;
}

/** SplitMix32 초기 확산 + Mulberry32 기반 결정적 PRNG([0, 1)). */
export function createDeterministicPrng(seed: number): () => number {
  let z = (normalizeEffectSeed(seed) + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  let state = (z ^ (z >>> 16)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeCutPolygonVertices(frame: CutFrameClip): readonly Point2D[] {
  if (frame.kind === "rect") {
    const x0 = Math.min(frame.x, frame.x + frame.width);
    const y0 = Math.min(frame.y, frame.y + frame.height);
    const x1 = Math.max(frame.x, frame.x + frame.width);
    const y1 = Math.max(frame.y, frame.y + frame.height);
    if (x1 - x0 <= GEOM_EPS || y1 - y0 <= GEOM_EPS) return [];
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  }
  const pts = frame.vertices.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) return [];
  let signedArea2 = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    signedArea2 += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(signedArea2) <= GEOM_EPS) return [];
  return signedArea2 > 0 ? pts : [...pts].reverse();
}

function edgeCross(a: Point2D, b: Point2D, p: Point2D): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/** 점이 컷 프레임(사각형 또는 볼록 다각형) 내부/경계에 있는지 검사한다. */
export function isPointInsideCutFrame(
  point: Point2D,
  frame: CutFrameClip,
  epsilon = 1e-5,
): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (frame.kind === "rect") {
    const x0 = Math.min(frame.x, frame.x + frame.width);
    const y0 = Math.min(frame.y, frame.y + frame.height);
    const x1 = Math.max(frame.x, frame.x + frame.width);
    const y1 = Math.max(frame.y, frame.y + frame.height);
    return (
      point.x >= x0 - epsilon &&
      point.x <= x1 + epsilon &&
      point.y >= y0 - epsilon &&
      point.y <= y1 + epsilon
    );
  }
  const clipPoly = normalizeCutPolygonVertices(frame);
  if (clipPoly.length < 3) return false;
  for (let i = 0; i < clipPoly.length; i += 1) {
    const a = clipPoly[i]!;
    const b = clipPoly[(i + 1) % clipPoly.length]!;
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (edgeCross(a, b, point) < -epsilon * Math.max(1, edgeLen)) return false;
  }
  return true;
}

/** Sutherland–Hodgman 반평면 클리핑으로 폴리곤을 컷 프레임 내부로 절단한다. */
export function clipPolygonToCutFrame(
  polygon: readonly Point2D[],
  frame: CutFrameClip,
): { readonly points: readonly Point2D[]; readonly clipped: boolean } {
  const clipVerts = normalizeCutPolygonVertices(frame);
  if (clipVerts.length < 3 || polygon.length < 3) return { points: [], clipped: true };
  let output: Point2D[] = polygon.map((p) => ({ x: p.x, y: p.y }));
  let clipped = false;

  for (let edgeIdx = 0; edgeIdx < clipVerts.length; edgeIdx += 1) {
    const a = clipVerts[edgeIdx]!;
    const b = clipVerts[(edgeIdx + 1) % clipVerts.length]!;
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (edgeLen <= GEOM_EPS) continue;
    const tol = -1e-9 * edgeLen;
    const input = output;
    output = [];
    if (input.length === 0) break;

    let prev = input[input.length - 1]!;
    let prevDist = edgeCross(a, b, prev);
    for (let i = 0; i < input.length; i += 1) {
      const curr = input[i]!;
      const currDist = edgeCross(a, b, curr);
      const currInside = currDist >= tol;
      const prevInside = prevDist >= tol;
      if (currInside) {
        if (!prevInside) {
          clipped = true;
          const denom = prevDist - currDist;
          if (Math.abs(denom) > GEOM_EPS) {
            const t = clampEffectNumber(prevDist / denom, 0, 1);
            output.push({ x: prev.x + (curr.x - prev.x) * t, y: prev.y + (curr.y - prev.y) * t });
          }
        }
        output.push(curr);
      } else if (prevInside) {
        clipped = true;
        const denom = prevDist - currDist;
        if (Math.abs(denom) > GEOM_EPS) {
          const t = clampEffectNumber(prevDist / denom, 0, 1);
          output.push({ x: prev.x + (curr.x - prev.x) * t, y: prev.y + (curr.y - prev.y) * t });
        }
      } else {
        clipped = true;
      }
      prev = curr;
      prevDist = currDist;
    }
  }

  const deduped: Point2D[] = [];
  for (const pt of output) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) > 1e-5) deduped.push(pt);
  }
  if (
    deduped.length >= 2 &&
    Math.hypot(deduped[0]!.x - deduped[deduped.length - 1]!.x, deduped[0]!.y - deduped[deduped.length - 1]!.y) <= 1e-5
  ) {
    deduped.pop();
  }
  return { points: deduped.length >= 3 ? deduped : [], clipped };
}

/** Cyrus–Beck 선분 클리핑: 중심선을 컷 프레임 내부 구간으로 절단한다. */
export function clipSegmentToCutFrame(
  p0: Point2D,
  p1: Point2D,
  frame: CutFrameClip,
): readonly [Point2D, Point2D] | null {
  const clipVerts = normalizeCutPolygonVertices(frame);
  if (clipVerts.length < 3) return null;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  let tMin = 0;
  let tMax = 1;

  for (let i = 0; i < clipVerts.length; i += 1) {
    const a = clipVerts[i]!;
    const b = clipVerts[(i + 1) % clipVerts.length]!;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const num = nx * (p0.x - a.x) + ny * (p0.y - a.y);
    const den = nx * dx + ny * dy;
    if (Math.abs(den) <= GEOM_EPS) {
      if (num < -1e-7) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) {
      if (t > tMin) tMin = t;
    } else if (t < tMax) {
      tMax = t;
    }
    if (tMin > tMax + 1e-9) return null;
  }

  const c0 = clampEffectNumber(tMin, 0, 1);
  const c1 = clampEffectNumber(tMax, 0, 1);
  if (c1 - c0 <= 1e-7) return null;
  return [
    { x: p0.x + dx * c0, y: p0.y + dy * c0 },
    { x: p0.x + dx * c1, y: p0.y + dy * c1 },
  ];
}

function polygonToSvgPath(points: readonly Point2D[]): string {
  if (points.length < 3) return "";
  return `${points.map((pt, idx) => `${idx === 0 ? "M" : "L"} ${roundEffectCoord(pt.x)} ${roundEffectCoord(pt.y)}`).join(" ")} Z`;
}

function computeTaperHalfWidth(
  t: number,
  maxHalf: number,
  tipHalf: number,
  taperMode: EffectTaperMode,
  taperExponent: number,
): number {
  const u = clampEffectNumber(t, 0, 1);
  const exp = clampEffectNumber(taperExponent, 0.4, 3.5);
  if (taperMode === "none") return maxHalf;
  if (taperMode === "inward") return tipHalf + (maxHalf - tipHalf) * Math.pow(u, exp);
  if (taperMode === "outward") return tipHalf + (maxHalf - tipHalf) * Math.pow(1 - u, exp);
  return tipHalf + (maxHalf - tipHalf) * Math.pow(Math.sin(Math.PI * u), exp);
}

/** 중심선 폴리라인으로부터 테이퍼링이 적용된 닫힌 리본 폴리곤을 생성한다. */
export function buildTaperedRibbonPolygon(
  centerline: readonly Point2D[],
  width: number,
  tipWidth: number,
  taperMode: EffectTaperMode,
  taperExponent: number,
): readonly Point2D[] {
  if (centerline.length < 2) return [];
  const effectiveLine: Point2D[] =
    centerline.length === 2 && taperMode === "both"
      ? [
          centerline[0]!,
          { x: (centerline[0]!.x + centerline[1]!.x) * 0.5, y: (centerline[0]!.y + centerline[1]!.y) * 0.5 },
          centerline[1]!,
        ]
      : [...centerline];

  const cumLen: number[] = [0];
  let totalLen = 0;
  for (let i = 1; i < effectiveLine.length; i += 1) {
    totalLen += Math.hypot(effectiveLine[i]!.x - effectiveLine[i - 1]!.x, effectiveLine[i]!.y - effectiveLine[i - 1]!.y);
    cumLen.push(totalLen);
  }
  if (totalLen <= 1e-4) return [];

  const maxHalf = Math.max(0.15, width * 0.5);
  const minHalf = clampEffectNumber(tipWidth * 0.5, 0, maxHalf);
  const leftEdge: Point2D[] = [];
  const rightEdge: Point2D[] = [];

  for (let i = 0; i < effectiveLine.length; i += 1) {
    const prev = effectiveLine[Math.max(0, i - 1)]!;
    const next = effectiveLine[Math.min(effectiveLine.length - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty);
    if (tLen <= GEOM_EPS) {
      tx = 1;
      ty = 0;
    } else {
      tx /= tLen;
      ty /= tLen;
    }
    const nx = -ty;
    const ny = tx;
    const half = computeTaperHalfWidth(cumLen[i]! / totalLen, maxHalf, minHalf, taperMode, taperExponent);
    const pt = effectiveLine[i]!;
    if (half <= 1e-4 && (i === 0 || i === effectiveLine.length - 1)) {
      leftEdge.push({ x: pt.x, y: pt.y });
    } else {
      leftEdge.push({ x: pt.x + nx * half, y: pt.y + ny * half });
      rightEdge.push({ x: pt.x - nx * half, y: pt.y - ny * half });
    }
  }
  return [...leftEdge, ...rightEdge.reverse()];
}

export function finalizeEffectStrip(
  id: string,
  kind: ProceduralEffectLineKind,
  rawPolygon: readonly Point2D[],
  centerline: readonly Point2D[],
  width: number,
  opacity: number,
  clipFrame: CutFrameClip | null,
): EffectPolygonStrip | null {
  if (rawPolygon.length < 3) return null;
  let finalPoints = rawPolygon;
  let clipped = false;
  let finalCenterline = centerline;
  if (clipFrame) {
    const clipResult = clipPolygonToCutFrame(rawPolygon, clipFrame);
    if (clipResult.points.length < 3) return null;
    finalPoints = clipResult.points;
    clipped = clipResult.clipped;
    if (centerline.length === 2) {
      const clippedSeg = clipSegmentToCutFrame(centerline[0]!, centerline[1]!, clipFrame);
      if (clippedSeg) finalCenterline = clippedSeg;
    }
  }
  const svgPath = polygonToSvgPath(finalPoints);
  if (!svgPath) return null;
  return { id, kind, points: finalPoints, centerline: finalCenterline, width, opacity, clipped, svgPath };
}

export function finalizeEffectResult(
  kind: ProceduralEffectLineKind,
  seed: number,
  strips: readonly EffectPolygonStrip[],
  clipFrame: CutFrameClip | null,
): ProceduralEffectLineResult {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let vertexCount = 0;
  let clippedStripCount = 0;

  for (const strip of strips) {
    if (strip.clipped) clippedStripCount += 1;
    vertexCount += strip.points.length;
    for (const pt of strip.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const bounds: EffectLineBounds =
    strips.length > 0 ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    kind,
    seed,
    strips,
    combinedSvgPath: strips.map((strip) => strip.svgPath).join(" "),
    bounds,
    clipFrame,
    stats: { stripCount: strips.length, vertexCount, clippedStripCount },
  };
}

/** 3차 베지어 곡선 위 점 평가. */
export function evaluateCubicBezierPoint(curve: CubicBezierControlPoints, t: number): Point2D {
  const u = clampEffectNumber(t, 0, 1);
  const inv = 1 - u;
  const b0 = inv * inv * inv;
  const b1 = 3 * inv * inv * u;
  const b2 = 3 * inv * u * u;
  const b3 = u * u * u;
  return {
    x: b0 * curve[0].x + b1 * curve[1].x + b2 * curve[2].x + b3 * curve[3].x,
    y: b0 * curve[0].y + b1 * curve[1].y + b2 * curve[2].y + b3 * curve[3].y,
  };
}

/** 3차 베지어 곡선의 정규화된 접선 벡터 평가. */
export function evaluateCubicBezierTangent(curve: CubicBezierControlPoints, t: number): Point2D {
  const u = clampEffectNumber(t, 0, 1);
  const inv = 1 - u;
  const dx =
    3 * inv * inv * (curve[1].x - curve[0].x) +
    6 * inv * u * (curve[2].x - curve[1].x) +
    3 * u * u * (curve[3].x - curve[2].x);
  const dy =
    3 * inv * inv * (curve[1].y - curve[0].y) +
    6 * inv * u * (curve[2].y - curve[1].y) +
    3 * u * u * (curve[3].y - curve[2].y);
  const len = Math.hypot(dx, dy);
  if (len <= GEOM_EPS) {
    const chordLen = Math.hypot(curve[3].x - curve[0].x, curve[3].y - curve[0].y);
    return chordLen > GEOM_EPS
      ? { x: (curve[3].x - curve[0].x) / chordLen, y: (curve[3].y - curve[0].y) / chordLen }
      : { x: 1, y: 0 };
  }
  return { x: dx / len, y: dy / len };
}

/** 호길이 기반으로 폴리라인을 파선 조각 배열로 분할한다. */
export function splitPolylineIntoDashes(
  polyline: readonly Point2D[],
  dashLength: number,
  gapLength: number,
): Point2D[][] {
  if (polyline.length < 2) return [];
  const cum: number[] = [0];
  for (let i = 1; i < polyline.length; i += 1) {
    cum.push(cum[i - 1]! + Math.hypot(polyline[i]!.x - polyline[i - 1]!.x, polyline[i]!.y - polyline[i - 1]!.y));
  }
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 1e-3) return [];

  const sampleAtDistance = (dist: number): Point2D => {
    const d = clampEffectNumber(dist, 0, total);
    for (let i = 1; i < cum.length; i += 1) {
      if (d <= cum[i]! + 1e-7) {
        const segLen = Math.max(1e-6, cum[i]! - cum[i - 1]!);
        const ratio = clampEffectNumber((d - cum[i - 1]!) / segLen, 0, 1);
        const a = polyline[i - 1]!;
        const b = polyline[i]!;
        return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
      }
    }
    return polyline[polyline.length - 1]!;
  };

  const chunks: Point2D[][] = [];
  let cursor = 0;
  while (cursor < total - 2) {
    const end = Math.min(total, cursor + dashLength);
    if (end - cursor >= 2) {
      const sub: Point2D[] = [sampleAtDistance(cursor)];
      for (let i = 1; i < polyline.length - 1; i += 1) {
        if (cum[i]! > cursor + 1e-4 && cum[i]! < end - 1e-4) sub.push(polyline[i]!);
      }
      sub.push(sampleAtDistance(end));
      chunks.push(sub);
    }
    cursor = end + gapLength;
  }
  return chunks;
}

function sanitizeSvgColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (/^(#[0-9a-fA-F]{3,8}|currentColor|none|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/u.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

/** 생성 결과를 독립 SVG 마크업 문자열로 직렬화한다. */
export function renderProceduralEffectLinesToSvg(
  result: ProceduralEffectLineResult,
  options: {
    readonly width?: number;
    readonly height?: number;
    readonly fill?: string;
    readonly background?: string;
  } = {},
): string {
  const width = Math.max(1, Math.round(options.width ?? Math.max(100, result.bounds.maxX - result.bounds.minX)));
  const height = Math.max(1, Math.round(options.height ?? Math.max(100, result.bounds.maxY - result.bounds.minY)));
  const fill = sanitizeSvgColor(options.fill, "currentColor");
  const background = options.background ? sanitizeSvgColor(options.background, "none") : "none";
  const bgRect = background !== "none" ? `<rect width="${width}" height="${height}" fill="${background}" />` : "";
  const paths = result.strips
    .map(
      (strip) =>
        `<path data-strip-id="${strip.id}" d="${strip.svgPath}" fill="${fill}" fill-opacity="${roundEffectCoord(strip.opacity)}" />`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${bgRect}${paths}</svg>`;
}

/** 기존 스튜디오 집중선/스피드선 요소(`FocusLinesEl`/`SpeedLinesEl`)로 호환 패치를 생성한다. */
export function proceduralEffectToStudioElementPatch(
  config: ProceduralEffectLineConfig,
  targetType: "focusLines" | "speedLines",
): Partial<El> {
  if (targetType === "focusLines") {
    if (config.kind === "concentration") {
      return {
        lineCount: Math.round(clampEffectNumber(config.lineCount, 12, 180)),
        innerRadius: Math.round(Math.max(8, (config.innerRadiusX + config.innerRadiusY) * 0.5)),
        outerRadius: Math.round(Math.max(40, config.outerRadius)),
        strokeWidth: roundEffectCoord(clampEffectNumber(config.baseWidth, 0.5, 16)),
        noise: roundEffectCoord(clampEffectNumber(config.unevenSpacing ?? 0.35, 0, 1)),
        rotation: roundEffectCoord(config.ellipseRotationDeg ?? 0),
        opacity: roundEffectCoord(clampEffectNumber(config.opacity ?? 1, 0.1, 1)),
      } as Partial<El>;
    }
    if (config.kind === "burst") {
      return {
        lineCount: Math.round(clampEffectNumber(config.spikeCount * 2, 16, 180)),
        innerRadius: Math.round(Math.max(8, (config.innerRadiusX + config.innerRadiusY) * 0.5)),
        outerRadius: Math.round(Math.max(40, config.outerRadius)),
        strokeWidth: roundEffectCoord(clampEffectNumber(config.baseWidth ?? 3.2, 0.5, 16)),
        noise: roundEffectCoord(clampEffectNumber(config.spikeJitter ?? 0.3, 0, 1)),
        rotation: roundEffectCoord(config.rotationDeg ?? 0),
        opacity: roundEffectCoord(clampEffectNumber(config.opacity ?? 1, 0.1, 1)),
      } as Partial<El>;
    }
  }
  if (config.kind === "speed") {
    const normalizedDeg = ((config.angleDeg % 180) + 180) % 180;
    const isVertical = normalizedDeg >= 45 && normalizedDeg <= 135;
    return {
      lineCount: Math.round(clampEffectNumber(config.lineCount, 8, 160)),
      direction: isVertical ? "vertical" : "horizontal",
      strokeWidth: roundEffectCoord(clampEffectNumber((config.minWidth + config.maxWidth) * 0.5, 0.5, 16)),
      noise: roundEffectCoord(clampEffectNumber(config.unevenSpacing ?? 0.3, 0, 1)),
      rotation: roundEffectCoord(config.angleDeg),
      opacity: roundEffectCoord(clampEffectNumber(config.opacity ?? 1, 0.1, 1)),
    } as Partial<El>;
  }
  return {
    lineCount: config.kind === "flow" ? Math.round(clampEffectNumber(config.lineCount, 8, 160)) : 48,
    opacity: roundEffectCoord(clampEffectNumber(config.opacity ?? 1, 0.1, 1)),
  } as Partial<El>;
}
