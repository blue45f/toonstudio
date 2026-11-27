/**
 * Wave 47: 한글 의성어·의태어 비파괴 곡선 경로 워퍼(Path Warper) 및 외곽선·그림자 변환 행렬 생성기.
 *
 * - `"쾅!"`, `"우르르"`, `"스윽"`, `"두근두근"` 등 한글 효과음 글리프 좌표를 아치(Arch),
 *   원근 소실(Perspective Taper), 충격파 방사(Shockwave Burst), 지그재그 진동(Tremor Wave)
 *   4종 곡선 경로로 비파괴 변형하고 마이터 제한 외곽선과 2D 어파인 드롭섀도 행렬을 생성한다.
 */

import type { Point2D, Rect2D } from "./procedural-balloon-contour-generator";

export type HangulSfxWarpMode = "arch" | "perspective_taper" | "shockwave_burst" | "tremor_wave";
/** Canvas2D/SVG 호환 2D 어파인 변환 행렬(`[a, b, c, d, tx, ty]`). */
export type AffineMatrix2D = readonly [number, number, number, number, number, number];

export const DEFAULT_SFX_FONT_SIZE_PX = 64 as const;
export const DEFAULT_SFX_TRACKING_PX = 4 as const;
export const DEFAULT_SFX_STROKE_OFFSET_PX = 5 as const;

export const HANGUL_SFX_WARP_LABELS_KO: Readonly<Record<HangulSfxWarpMode, string>> = {
  arch: "아치 곡선",
  perspective_taper: "원근 소실",
  shockwave_burst: "충격파 방사",
  tremor_wave: "지그재그 진동",
};

export interface SfxGlyphStrokeInput { readonly points: readonly Point2D[]; readonly closed?: boolean; }
export interface SfxGlyphInput { readonly glyph: string; readonly bounds: Rect2D; readonly strokes?: readonly SfxGlyphStrokeInput[]; }

export interface HangulSfxWarpOptions {
  readonly text: string;
  readonly mode: HangulSfxWarpMode;
  readonly glyphs?: readonly SfxGlyphInput[];
  readonly origin?: Point2D;
  readonly fontSizePx?: number;
  readonly trackingPx?: number;
  readonly strength?: number;
  readonly archRadiusPx?: number;
  readonly archSpanDeg?: number;
  readonly perspectiveStartScale?: number;
  readonly perspectiveEndScale?: number;
  readonly perspectiveDirection?: "left_to_right" | "right_to_left";
  readonly burstCenterOffset?: Point2D;
  readonly burstSpreadPx?: number;
  readonly tremorAmplitudePx?: number;
  readonly tremorFrequency?: number;
  readonly strokeOffsetPx?: number;
  readonly dropShadowOffset?: Point2D;
  readonly dropShadowScale?: number;
  readonly dropShadowSkewXDeg?: number;
  readonly seed?: number;
}

export interface WarpedSfxStroke { readonly points: readonly Point2D[]; readonly closed: boolean; readonly svgPath: string; }

export interface WarpedSfxGlyph {
  readonly index: number;
  readonly glyph: string;
  readonly normalizedProgress: number;
  readonly sourceBounds: Rect2D;
  readonly warpedQuad: readonly [Point2D, Point2D, Point2D, Point2D];
  readonly warpedBounds: Rect2D;
  readonly warpedStrokes: readonly WarpedSfxStroke[];
  readonly strokeOffsetPolygon: readonly Point2D[];
  readonly strokeOffsetSvgPath: string;
  readonly glyphTransformMatrix: AffineMatrix2D;
  readonly dropShadowMatrix: AffineMatrix2D;
  readonly effectiveScale: number;
  readonly tangentAngleRad: number;
}

export interface HangulSfxWarpPreset { readonly mode: HangulSfxWarpMode; readonly labelKo: string; readonly recommendedStrength: number; readonly reasonKo: string; }

export interface HangulSfxWarpResult {
  readonly text: string;
  readonly mode: HangulSfxWarpMode;
  readonly modeLabelKo: string;
  readonly strength: number;
  readonly glyphs: readonly WarpedSfxGlyph[];
  readonly overallBounds: Rect2D;
  readonly strokeOffsetPx: number;
  readonly globalDropShadowMatrix: AffineMatrix2D;
  readonly isFiniteGeometry: boolean;
}

const clamp = (v: number, min: number, max: number): number => (!Number.isFinite(v) ? min : v < min ? min : v > max ? max : v);
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const round6 = (v: number): number => Math.round(v * 1_000_000) / 1_000_000;
const roundPt = (x: number, y: number): Point2D => ({ x: round3(x), y: round3(y) });
const fmt = (v: number): string => Number((Math.abs(v) < 1e-6 ? 0 : v).toFixed(2)).toString();

function pointsToSvgPath(points: readonly Point2D[], closed: boolean): string {
  const first = points[0];
  if (first === undefined) return "";
  const segs = [`M ${fmt(first.x)} ${fmt(first.y)}`];
  for (let i = 1; i < points.length; i += 1) {
    const pt = points[i];
    if (pt !== undefined) segs.push(`L ${fmt(pt.x)} ${fmt(pt.y)}`);
  }
  if (closed) segs.push("Z");
  return segs.join(" ");
}

function boundsFromPoints(points: readonly Point2D[]): Rect2D {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: round3(minX), y: round3(minY), width: round3(maxX - minX), height: round3(maxY - minY) };
}

/** 2D 어파인 행렬(`[a, b, c, d, tx, ty]`)을 점 좌표에 적용한다. */
export function applyAffineMatrix2D(matrix: AffineMatrix2D, point: Point2D): Point2D {
  const [a, b, c, d, tx, ty] = matrix;
  return roundPt(a * point.x + c * point.y + tx, b * point.x + d * point.y + ty);
}

/** 중심점 기준 확대·수평 기울기·이동이 결합된 비파괴 드롭섀도 2D 어파인 행렬을 생성한다. */
export function buildDropShadowMatrix(
  center: Point2D,
  offset: Point2D,
  scale: number,
  skewXDeg: number,
): AffineMatrix2D {
  const a = round6(clamp(scale, 0.4, 2.2));
  const b = 0;
  const c = round6(a * Math.tan((clamp(skewXDeg, -35, 35) * Math.PI) / 180));
  const d = a;
  const tx = round6(center.x + offset.x - (a * center.x + c * center.y));
  const ty = round6(center.y + offset.y - (b * center.x + d * center.y));
  return [a, b, c, d, tx, ty];
}

/** 다각형 감김 방향을 자동 판별해 바깥쪽 마이터 제한(Miter-clamped) 외곽선 오프셋 폴리곤을 계산한다. */
export function computeOutwardStrokeOffsetPolygon(
  polygon: readonly Point2D[],
  offsetPx: number,
  miterLimit = 2.5,
): readonly Point2D[] {
  const n = polygon.length;
  const safeOffset = Math.max(0, Number.isFinite(offsetPx) ? offsetPx : 0);
  if (n < 3 || safeOffset === 0) return polygon.map((p) => roundPt(p.x, p.y));

  let signedArea2 = 0;
  for (let i = 0; i < n; i += 1) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    if (p1 !== undefined && p2 !== undefined) signedArea2 += p1.x * p2.y - p2.x * p1.y;
  }
  const outwardSign = signedArea2 >= 0 ? 1 : -1;
  const normal = (from: Point2D, to: Point2D): Point2D => {
    const len = Math.max(Math.hypot(to.x - from.x, to.y - from.y), 1e-6);
    return { x: ((to.y - from.y) / len) * outwardSign, y: (-(to.x - from.x) / len) * outwardSign };
  };

  const maxMiter = safeOffset * clamp(miterLimit, 1, 6);
  const out: Point2D[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];
    if (prev === undefined || curr === undefined || next === undefined) continue;
    const n1 = normal(prev, curr);
    const n2 = normal(curr, next);
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const bLen = Math.hypot(bx, by);
    if (bLen < 1e-5) {
      out.push(roundPt(curr.x + n1.x * safeOffset, curr.y + n1.y * safeOffset));
      continue;
    }
    const ux = bx / bLen;
    const uy = by / bLen;
    const dist = Math.min(safeOffset / Math.max(ux * n1.x + uy * n1.y, 0.25), maxMiter);
    out.push(roundPt(curr.x + ux * dist, curr.y + uy * dist));
  }
  return out;
}

/** 한글 의성어·의태어 텍스트 패턴에 맞는 대표 워프 프리셋을 추천한다. */
export function suggestHangulSfxWarpPreset(text: string): HangulSfxWarpPreset {
  const clean = text.trim();
  if (/(쾅|펑|퍽|빡|쩍|콰앙|쩌억|퍼엉|BOOM|CRASH)/iu.test(clean)) {
    return { mode: "shockwave_burst", labelKo: HANGUL_SFX_WARP_LABELS_KO.shockwave_burst, recommendedStrength: 0.85, reasonKo: "파열·타격 의성어에 맞춰 중심에서 사방으로 퍼지는 충격파 방사를 권장합니다." };
  }
  if (/(우르르|두근|덜덜|부들|지잉|웅웅|쿠구궁|RUMBLE)/iu.test(clean)) {
    return { mode: "tremor_wave", labelKo: HANGUL_SFX_WARP_LABELS_KO.tremor_wave, recommendedStrength: 0.78, reasonKo: "울림·심장 박동·진동 의성어에 지그재그 진동 곡선을 권장합니다." };
  }
  if (/(스윽|슈욱|휘익|쏴아|휙|쓩|WHOOSH|SWISH)/iu.test(clean)) {
    return { mode: "perspective_taper", labelKo: HANGUL_SFX_WARP_LABELS_KO.perspective_taper, recommendedStrength: 0.8, reasonKo: "속도감·이동 궤적 의성어에 원근 소실 테이퍼를 권장합니다." };
  }
  return { mode: "arch", labelKo: HANGUL_SFX_WARP_LABELS_KO.arch, recommendedStrength: 0.65, reasonKo: "탄성·환호·부유감 효과음에 부드러운 아치 곡선 조판을 권장합니다." };
}

function synthesizeGlyphInputs(text: string, fontSizePx: number, trackingPx: number): SfxGlyphInput[] {
  const glyphs: SfxGlyphInput[] = [];
  let cursorX = 0;
  for (const ch of Array.from(text).filter((c) => !/\s/u.test(c))) {
    const width = /^[!?,.;:'"~·]$/u.test(ch) ? fontSizePx * 0.44 : fontSizePx * 0.92;
    const b: Rect2D = { x: round3(cursorX), y: 0, width: round3(width), height: round3(fontSizePx) };
    glyphs.push({
      glyph: ch,
      bounds: b,
      strokes: [
        { closed: true, points: [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }] },
        { closed: false, points: [{ x: b.x + b.width * 0.18, y: b.y + b.height * 0.5 }, { x: b.x + b.width * 0.82, y: b.y + b.height * 0.5 }] },
      ],
    });
    cursorX += width + trackingPx;
  }
  return glyphs;
}

interface WarpCtx {
  readonly mode: HangulSfxWarpMode;
  readonly origin: Point2D;
  readonly totalWidth: number;
  readonly centerY: number;
  readonly fontSizePx: number;
  readonly strength: number;
  readonly archRadiusPx: number;
  readonly archSpanRad: number;
  readonly sStart: number;
  readonly sEnd: number;
  readonly dir: "left_to_right" | "right_to_left";
  readonly burstCenter: Point2D;
  readonly burstSpreadPx: number;
  readonly tremorAmpPx: number;
  readonly tremorFreq: number;
  readonly seed: number;
}

function evalWarp(localPt: Point2D, idx: number, ctx: WarpCtx): { readonly point: Point2D; readonly scale: number; readonly tangent: number } {
  const safeW = Math.max(ctx.totalWidth, 1);
  const t = clamp(localPt.x / safeW, 0, 1);
  const dy = localPt.y - ctx.centerY;

  if (ctx.mode === "arch") {
    const sign = ctx.archSpanRad >= 0 ? 1 : -1;
    const phi = (t - 0.5) * Math.abs(ctx.archSpanRad);
    const localR = Math.max(ctx.archRadiusPx * 0.25, ctx.archRadiusPx - sign * dy);
    return {
      point: roundPt(ctx.origin.x + safeW / 2 + localR * Math.sin(phi), ctx.origin.y + ctx.centerY + sign * (ctx.archRadiusPx - localR * Math.cos(phi))),
      scale: 1,
      tangent: round3(sign * phi),
    };
  }
  if (ctx.mode === "perspective_taper") {
    const isLtr = ctx.dir === "left_to_right";
    const scale = ctx.sStart + (ctx.sEnd - ctx.sStart) * (isLtr ? t : 1 - t);
    const intX = isLtr ? localPt.x * (ctx.sStart + 0.5 * (ctx.sEnd - ctx.sStart) * t) : localPt.x * (ctx.sEnd + 0.5 * (ctx.sStart - ctx.sEnd) * t);
    const slope = ((ctx.sEnd - ctx.sStart) * (isLtr ? 1 : -1) * ctx.fontSizePx * 0.25) / safeW;
    return { point: roundPt(ctx.origin.x + intX, ctx.origin.y + ctx.centerY + dy * scale), scale: round3(scale), tangent: round3(Math.atan(slope)) };
  }
  if (ctx.mode === "shockwave_burst") {
    const vx = localPt.x - ctx.burstCenter.x;
    const vy = localPt.y - ctx.burstCenter.y;
    const dist = Math.hypot(vx, vy);
    const normD = Math.min(dist / Math.max(safeW * 0.5, ctx.fontSizePx), 1.5);
    const scale = 1 + ctx.strength * (0.24 + 0.22 * normD);
    const ux = dist > 1e-4 ? vx / dist : Math.cos((idx + 1) * 1.1);
    const uy = dist > 1e-4 ? vy / dist : Math.sin((idx + 1) * 1.1);
    const push = ctx.burstSpreadPx * ctx.strength * (0.35 + 0.65 * normD);
    const tilt = ((idx % 2 === 0 ? 1 : -1) * 0.14 + (t - 0.5) * 0.36) * ctx.strength;
    const rx = vx * scale + ux * push;
    const ry = vy * scale + uy * push;
    return {
      point: roundPt(ctx.origin.x + ctx.burstCenter.x + rx * Math.cos(tilt) - ry * Math.sin(tilt), ctx.origin.y + ctx.burstCenter.y + rx * Math.sin(tilt) + ry * Math.cos(tilt)),
      scale: round3(scale),
      tangent: round3(tilt),
    };
  }

  const phase = t * ctx.tremorFreq * Math.PI * 2 + ctx.seed * 0.17;
  const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
  const waveY = ctx.tremorAmpPx * ctx.strength * (0.72 * tri + 0.28 * Math.sin(phase * 2));
  const shearX = (idx % 2 === 0 ? 1 : -1) * ctx.strength * 0.14 * dy;
  const tangent = Math.atan2(ctx.tremorAmpPx * ctx.strength * Math.sign(Math.cos(phase) || 1) * 0.8, Math.max(safeW / Math.max(ctx.tremorFreq * 4, 1), 12));
  return { point: roundPt(ctx.origin.x + localPt.x + shearX, ctx.origin.y + localPt.y + waveY), scale: 1, tangent: round3(tangent) };
}

/** 한글 의성어 글리프 좌표와 스트로크를 4종 곡선 경로로 비파괴 변형하고 외곽선·드롭섀도 행렬을 생성한다. */
export function warpHangulSfxPath(options: HangulSfxWarpOptions): HangulSfxWarpResult {
  const fontSizePx = clamp(options.fontSizePx ?? DEFAULT_SFX_FONT_SIZE_PX, 12, 320);
  const trackingPx = clamp(options.trackingPx ?? DEFAULT_SFX_TRACKING_PX, -fontSizePx * 0.2, fontSizePx);
  const strength = clamp(options.strength ?? 0.72, 0, 1);
  const origin = options.origin ?? { x: 0, y: 0 };
  const strokeOffsetPx = Math.max(0, options.strokeOffsetPx ?? DEFAULT_SFX_STROKE_OFFSET_PX);
  const shadowOffset = options.dropShadowOffset ?? { x: 6, y: 8 };
  const shadowScale = clamp(options.dropShadowScale ?? 1.04, 0.5, 2);
  const shadowSkew = clamp(options.dropShadowSkewXDeg ?? -6, -35, 35);

  const sourceGlyphs = options.glyphs && options.glyphs.length > 0 ? options.glyphs : synthesizeGlyphInputs(options.text, fontSizePx, trackingPx);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const g of sourceGlyphs) {
    minX = Math.min(minX, g.bounds.x);
    maxX = Math.max(maxX, g.bounds.x + g.bounds.width);
    minY = Math.min(minY, g.bounds.y);
    maxY = Math.max(maxY, g.bounds.y + g.bounds.height);
  }
  const baseMinX = Number.isFinite(minX) ? minX : 0;
  const totalWidth = Number.isFinite(maxX - minX) ? Math.max(maxX - minX, 1) : 1;
  const centerY = Number.isFinite(minY + maxY) ? (minY + maxY) / 2 : fontSizePx / 2;

  const archSpanRad = (clamp(options.archSpanDeg ?? 68, -160, 160) * (0.25 + 0.75 * strength) * Math.PI) / 180;
  const archRadiusPx = Math.max(fontSizePx * 1.4, options.archRadiusPx ?? Math.max(totalWidth / Math.max(Math.abs(archSpanRad), 0.25), fontSizePx * 2.1));
  const burstOff = options.burstCenterOffset ?? { x: 0, y: fontSizePx * 0.25 };

  const ctx: WarpCtx = {
    mode: options.mode,
    origin,
    totalWidth,
    centerY,
    fontSizePx,
    strength,
    archRadiusPx,
    archSpanRad,
    sStart: 1 + (clamp(options.perspectiveStartScale ?? 1.35, 0.25, 3) - 1) * strength,
    sEnd: 1 + (clamp(options.perspectiveEndScale ?? 0.48, 0.2, 3) - 1) * strength,
    dir: options.perspectiveDirection ?? "left_to_right",
    burstCenter: { x: totalWidth * 0.5 + burstOff.x, y: centerY + burstOff.y },
    burstSpreadPx: clamp(options.burstSpreadPx ?? 26, 0, 200),
    tremorAmpPx: clamp(options.tremorAmplitudePx ?? 14, 0, 120),
    tremorFreq: clamp(options.tremorFrequency ?? 2.5, 0.5, 12),
    seed: options.seed ?? 47,
  };

  const glyphs: WarpedSfxGlyph[] = [];
  const allPts: Point2D[] = [];
  let isFiniteGeometry = true;

  for (let i = 0; i < sourceGlyphs.length; i += 1) {
    const src = sourceGlyphs[i];
    if (src === undefined) continue;
    const b = src.bounds;
    const shift = (pt: Point2D): Point2D => ({ x: pt.x - baseMinX, y: pt.y });
    const quad: readonly [Point2D, Point2D, Point2D, Point2D] = [
      evalWarp(shift({ x: b.x, y: b.y }), i, ctx).point,
      evalWarp(shift({ x: b.x + b.width, y: b.y }), i, ctx).point,
      evalWarp(shift({ x: b.x + b.width, y: b.y + b.height }), i, ctx).point,
      evalWarp(shift({ x: b.x, y: b.y + b.height }), i, ctx).point,
    ];
    const cEval = evalWarp(shift({ x: b.x + b.width / 2, y: b.y + b.height / 2 }), i, ctx);

    const srcStrokes: readonly SfxGlyphStrokeInput[] = src.strokes && src.strokes.length > 0
      ? src.strokes
      : [{ closed: true, points: [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }] }];

    const warpedStrokes: WarpedSfxStroke[] = srcStrokes.map((s) => {
      const pts = s.points.map((pt) => evalWarp(shift(pt), i, ctx).point);
      return { points: pts, closed: s.closed === true, svgPath: pointsToSvgPath(pts, s.closed === true) };
    });

    const strokeOffsetPolygon = computeOutwardStrokeOffsetPolygon(quad, strokeOffsetPx);
    const gPts: Point2D[] = [...quad, ...warpedStrokes.flatMap((s) => s.points)];
    const cosT = Math.cos(cEval.tangent);
    const sinT = Math.sin(cEval.tangent);
    const glyphTransformMatrix: AffineMatrix2D = [
      round6(cEval.scale * cosT), round6(cEval.scale * sinT), round6(-cEval.scale * sinT), round6(cEval.scale * cosT), cEval.point.x, cEval.point.y,
    ];
    const dropShadowMatrix = buildDropShadowMatrix(cEval.point, shadowOffset, shadowScale, shadowSkew);

    if (
      !quad.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
      !strokeOffsetPolygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
      !glyphTransformMatrix.every((v) => Number.isFinite(v)) ||
      !dropShadowMatrix.every((v) => Number.isFinite(v))
    ) isFiniteGeometry = false;

    allPts.push(...gPts, ...strokeOffsetPolygon);
    glyphs.push({
      index: i,
      glyph: src.glyph,
      normalizedProgress: round3(sourceGlyphs.length <= 1 ? 0.5 : i / (sourceGlyphs.length - 1)),
      sourceBounds: { ...b },
      warpedQuad: quad,
      warpedBounds: boundsFromPoints(gPts),
      warpedStrokes,
      strokeOffsetPolygon,
      strokeOffsetSvgPath: pointsToSvgPath(strokeOffsetPolygon, true),
      glyphTransformMatrix,
      dropShadowMatrix,
      effectiveScale: cEval.scale,
      tangentAngleRad: cEval.tangent,
    });
  }

  const overallBounds = boundsFromPoints(allPts);
  const globalDropShadowMatrix = buildDropShadowMatrix(
    roundPt(overallBounds.x + overallBounds.width / 2, overallBounds.y + overallBounds.height / 2),
    shadowOffset,
    shadowScale,
    shadowSkew,
  );
  if (!globalDropShadowMatrix.every((v) => Number.isFinite(v))) isFiniteGeometry = false;

  return {
    text: options.text,
    mode: options.mode,
    modeLabelKo: HANGUL_SFX_WARP_LABELS_KO[options.mode],
    strength: round3(strength),
    glyphs,
    overallBounds,
    strokeOffsetPx: round3(strokeOffsetPx),
    globalDropShadowMatrix,
    isFiniteGeometry,
  };
}
