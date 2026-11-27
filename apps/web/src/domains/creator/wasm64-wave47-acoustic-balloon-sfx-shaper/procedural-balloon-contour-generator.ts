/**
 * Wave 47: 감정 연동 절차적 말풍선 벡터 윤곽선 및 곡선 베지어 꼬리 생성기.
 *
 * - 감정·강도·텍스트 바운딩 박스·화자 앵커 좌표로 비파괴 벡터 윤곽선(타원·구름·떨림 웨이브·
 *   폭발 스파이크·이중 테두리)과 화자 방향으로 자연스럽게 휘는 2차/3차 베지어 꼬리를 생성한다.
 * - 말풍선 내부 안전 패딩과 텍스트 비충돌 여백, 꼬리 무교차를 기하학적으로 검증·보장한다.
 */

import type { DialogueEmotionKind } from "./dialogue-prosody-emotion-analyzer";

export interface Point2D { readonly x: number; readonly y: number; }
export interface Rect2D { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

export type BalloonContourVariant = "ellipse" | "cloud" | "tremor_wave" | "burst_spike" | "double_border";
export type BalloonTailCurveMode = "quadratic" | "cubic" | "thought_dots" | "none";

export const DEFAULT_BALLOON_PADDING_X = 22 as const;
export const DEFAULT_BALLOON_PADDING_Y = 18 as const;
export const DEFAULT_CONTOUR_SAMPLE_COUNT = 48 as const;
export const MIN_BALLOON_TEXT_CLEARANCE_PX = 10 as const;

export interface BalloonContourInput {
  readonly emotion: DialogueEmotionKind;
  readonly intensity: number;
  readonly textBounds: Rect2D;
  readonly speakerAnchor?: Point2D | null;
  readonly variantOverride?: BalloonContourVariant;
  readonly tailModeOverride?: BalloonTailCurveMode;
  readonly minPaddingX?: number;
  readonly minPaddingY?: number;
  readonly sampleCount?: number;
  readonly tailCurveBend?: number;
  readonly seed?: number;
}

export interface BalloonTailBezierSegment {
  readonly mode: "quadratic" | "cubic";
  readonly baseLeft: Point2D;
  readonly baseRight: Point2D;
  readonly tip: Point2D;
  readonly leftControl1: Point2D;
  readonly leftControl2?: Point2D;
  readonly rightControl1: Point2D;
  readonly rightControl2?: Point2D;
  readonly attachmentAngleRad: number;
  readonly svgPath: string;
  readonly sampledPolygon: readonly Point2D[];
  readonly selfIntersects: boolean;
}

export interface ThoughtBubbleDot { readonly cx: number; readonly cy: number; readonly radius: number; }

export interface BalloonContourOutput {
  readonly variant: BalloonContourVariant;
  readonly emotion: DialogueEmotionKind;
  readonly intensity: number;
  readonly center: Point2D;
  readonly innerSafeRect: Rect2D;
  readonly outerBounds: Rect2D;
  readonly safePadding: { readonly x: number; readonly y: number };
  readonly contourPolygon: readonly Point2D[];
  readonly contourSvgPath: string;
  readonly secondaryContourPolygon: readonly Point2D[] | null;
  readonly secondaryContourSvgPath: string | null;
  readonly strokeDashArray: readonly number[] | null;
  readonly strokeWidthPx: number;
  readonly tail: BalloonTailBezierSegment | null;
  readonly thoughtDots: readonly ThoughtBubbleDot[];
  readonly combinedSvgPath: string;
  readonly clearanceVerified: boolean;
  readonly minTextClearancePx: number;
}

const clamp = (v: number, min: number, max: number): number =>
  !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const roundPt = (x: number, y: number): Point2D => ({ x: round3(x), y: round3(y) });
const fmt = (v: number): string => Number((Math.abs(v) < 1e-6 ? 0 : v).toFixed(2)).toString();
const seededWave = (index: number, seed: number): number => {
  const x = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** 점과 축 정렬 사각형(`Rect2D`) 사이의 최단 유클리드 거리를 계산한다(내부면 `0`). */
export function distancePointToRect(point: Point2D, rect: Rect2D): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

function distanceSegmentToRect(a: Point2D, b: Point2D, rect: Rect2D): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    best = Math.min(best, distancePointToRect({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, rect));
  }
  return best;
}

const cross2D = (a: Point2D, b: Point2D, c: Point2D): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function segmentsProperlyIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const eps = 1e-6;
  const d1 = cross2D(a, b, c);
  const d2 = cross2D(a, b, d);
  const d3 = cross2D(c, d, a);
  const d4 = cross2D(c, d, b);
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

/** 닫힌 다각형 경로에 비인접 변의 자기 교차가 있는지 검증한다. */
export function hasPolygonSelfIntersection(points: readonly Point2D[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (c !== undefined && d !== undefined && segmentsProperlyIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function resolveDefaultVariant(emotion: DialogueEmotionKind): BalloonContourVariant {
  if (emotion === "inner_thought") return "cloud";
  if (emotion === "tremor") return "tremor_wave";
  if (emotion === "shout") return "burst_spike";
  return emotion === "shock" || emotion === "narration" ? "double_border" : "ellipse";
}

function resolveDefaultTailMode(emotion: DialogueEmotionKind, variant: BalloonContourVariant, hasSpeaker: boolean): BalloonTailCurveMode {
  if (!hasSpeaker || emotion === "narration") return "none";
  if (emotion === "inner_thought" || variant === "cloud") return "thought_dots";
  return emotion === "shout" || emotion === "shock" || emotion === "tremor" ? "cubic" : "quadratic";
}

const superEllipseVec = (theta: number, rx: number, ry: number, exp: number): Point2D => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: rx * Math.sign(c) * Math.abs(c) ** (2 / exp), y: ry * Math.sign(s) * Math.abs(s) ** (2 / exp) };
};

function radiusMultiplier(
  variant: BalloonContourVariant,
  emotion: DialogueEmotionKind,
  theta: number,
  index: number,
  total: number,
  intensity: number,
  seed: number,
): number {
  if (variant === "ellipse") return 1;
  if (variant === "cloud") {
    const lobes = 10 + Math.round(intensity * 4);
    return 1 + Math.abs(Math.sin((theta * lobes) / 2)) * (0.09 + intensity * 0.08);
  }
  if (variant === "tremor_wave") {
    const f1 = 14 + Math.round(intensity * 8);
    const wave = 0.5 + 0.32 * Math.sin(theta * f1 + seed * 0.7) + 0.18 * Math.cos(theta * (f1 + 7) - seed * 1.1);
    return 1 + clamp(wave, 0, 1) * (0.06 + intensity * 0.11);
  }
  if (variant === "burst_spike") {
    return index % 2 === 0 ? 1 + (0.14 + intensity * 0.24) * (0.8 + seededWave(index, seed) * 0.4) : 1;
  }
  if (emotion === "shock" && index % 3 === 0) {
    const cycle = Math.floor((index * 16) / Math.max(total, 1));
    return 1 + (0.1 + intensity * 0.15) * (0.85 + seededWave(cycle, seed) * 0.3);
  }
  return 1;
}

function polygonToSvgPath(points: readonly Point2D[]): string {
  const first = points[0];
  if (first === undefined) return "";
  const parts = [`M ${fmt(first.x)} ${fmt(first.y)}`];
  for (let i = 1; i < points.length; i += 1) {
    const pt = points[i];
    if (pt !== undefined) parts.push(`L ${fmt(pt.x)} ${fmt(pt.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function polygonBounds(points: readonly Point2D[]): Rect2D {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }
  return { x: round3(minX), y: round3(minY), width: round3(maxX - minX), height: round3(maxY - minY) };
}

function measureMinClearance(points: readonly Point2D[], rect: Rect2D): number {
  let minD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a !== undefined && b !== undefined) minD = Math.min(minD, distanceSegmentToRect(a, b, rect));
  }
  return Number.isFinite(minD) ? round3(minD) : 0;
}

function enforceClearance(points: readonly Point2D[], center: Point2D, rect: Rect2D, minClear: number): Point2D[] {
  const out = points.map((p) => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < 3; pass += 1) {
    const curMin = measureMinClearance(out, rect);
    if (curMin >= minClear) break;
    const deficit = minClear - curMin + 1.5;
    for (let i = 0; i < out.length; i += 1) {
      const p = out[i];
      if (p === undefined) continue;
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const len = Math.max(Math.hypot(dx, dy), 1);
      out[i] = roundPt(center.x + (dx * (len + deficit)) / len, center.y + (dy * (len + deficit)) / len);
    }
  }
  return out;
}

const evalQuad = (p0: Point2D, p1: Point2D, p2: Point2D, t: number): Point2D => {
  const m = 1 - t;
  return roundPt(m * m * p0.x + 2 * m * t * p1.x + t * t * p2.x, m * m * p0.y + 2 * m * t * p1.y + t * t * p2.y);
};

const evalCubic = (p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D => {
  const m = 1 - t;
  return roundPt(
    m ** 3 * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t ** 3 * p3.x,
    m ** 3 * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t ** 3 * p3.y,
  );
};

function buildCurvedTail(
  center: Point2D,
  rx: number,
  ry: number,
  exp: number,
  speaker: Point2D,
  mode: "quadratic" | "cubic",
  intensity: number,
  curveBendInput?: number,
): BalloonTailBezierSegment {
  const dx = speaker.x - center.x;
  const dy = speaker.y - center.y;
  const rawDist = Math.hypot(dx, dy);
  const angle = rawDist > 1e-3 ? Math.atan2(dy, dx) : Math.PI / 2;
  const edgeVec = superEllipseVec(angle, rx, ry, exp);
  const edgeR = Math.hypot(edgeVec.x, edgeVec.y);
  const tipDist = clamp(rawDist, edgeR + Math.max(24, Math.min(rx, ry) * 0.32), edgeR + 460);

  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const tip = roundPt(center.x + ux * tipDist, center.y + uy * tipDist);
  const halfAngle = clamp((13 + intensity * 6) / Math.max(edgeR, 24), 0.09, 0.22);

  const lVec = superEllipseVec(angle - halfAngle, rx, ry, exp);
  const rVec = superEllipseVec(angle + halfAngle, rx, ry, exp);
  const baseLeft = roundPt(center.x + lVec.x, center.y + lVec.y);
  const baseRight = roundPt(center.x + rVec.x, center.y + rVec.y);
  const baseMid = { x: (baseLeft.x + baseRight.x) / 2, y: (baseLeft.y + baseRight.y) / 2 };
  const baseHalfW = Math.hypot(baseRight.x - baseLeft.x, baseRight.y - baseLeft.y) / 2;
  const tailLen = Math.max(Math.hypot(tip.x - baseMid.x, tip.y - baseMid.y), 16);
  const bendPx = clamp(curveBendInput ?? (dx >= 0 ? -0.55 : 0.55), -1, 1) * Math.min(tailLen * 0.2, baseHalfW * 0.65);

  const sx = (baseLeft.x - baseMid.x) / Math.max(baseHalfW, 1e-4);
  const sy = (baseLeft.y - baseMid.y) / Math.max(baseHalfW, 1e-4);
  const sampled: Point2D[] = [baseLeft];

  if (mode === "quadratic") {
    const mx = baseMid.x + (tip.x - baseMid.x) * 0.52 + nx * bendPx;
    const my = baseMid.y + (tip.y - baseMid.y) * 0.52 + ny * bendPx;
    const lc1 = roundPt(mx + sx * baseHalfW * 0.42, my + sy * baseHalfW * 0.42);
    const rc1 = roundPt(mx - sx * baseHalfW * 0.42, my - sy * baseHalfW * 0.42);
    for (let i = 1; i <= 8; i += 1) sampled.push(evalQuad(baseLeft, lc1, tip, i / 8));
    for (let i = 1; i <= 8; i += 1) sampled.push(evalQuad(tip, rc1, baseRight, i / 8));
    return {
      mode, baseLeft, baseRight, tip, leftControl1: lc1, rightControl1: rc1,
      attachmentAngleRad: Math.round(angle * 10000) / 10000,
      svgPath: `M ${fmt(baseLeft.x)} ${fmt(baseLeft.y)} Q ${fmt(lc1.x)} ${fmt(lc1.y)} ${fmt(tip.x)} ${fmt(tip.y)} Q ${fmt(rc1.x)} ${fmt(rc1.y)} ${fmt(baseRight.x)} ${fmt(baseRight.y)} Z`,
      sampledPolygon: sampled,
      selfIntersects: hasPolygonSelfIntersection(sampled),
    };
  }

  const s1x = baseMid.x + (tip.x - baseMid.x) * 0.34 + nx * bendPx * 0.78;
  const s1y = baseMid.y + (tip.y - baseMid.y) * 0.34 + ny * bendPx * 0.78;
  const s2x = baseMid.x + (tip.x - baseMid.x) * 0.68 + nx * bendPx * 0.96;
  const s2y = baseMid.y + (tip.y - baseMid.y) * 0.68 + ny * bendPx * 0.96;
  const lc1 = roundPt(s1x + sx * baseHalfW * 0.56, s1y + sy * baseHalfW * 0.56);
  const lc2 = roundPt(s2x + sx * baseHalfW * 0.22, s2y + sy * baseHalfW * 0.22);
  const rc2 = roundPt(s2x - sx * baseHalfW * 0.22, s2y - sy * baseHalfW * 0.22);
  const rc1 = roundPt(s1x - sx * baseHalfW * 0.56, s1y - sy * baseHalfW * 0.56);
  for (let i = 1; i <= 8; i += 1) sampled.push(evalCubic(baseLeft, lc1, lc2, tip, i / 8));
  for (let i = 1; i <= 8; i += 1) sampled.push(evalCubic(tip, rc2, rc1, baseRight, i / 8));

  return {
    mode, baseLeft, baseRight, tip, leftControl1: lc1, leftControl2: lc2, rightControl1: rc1, rightControl2: rc2,
    attachmentAngleRad: Math.round(angle * 10000) / 10000,
    svgPath: `M ${fmt(baseLeft.x)} ${fmt(baseLeft.y)} C ${fmt(lc1.x)} ${fmt(lc1.y)} ${fmt(lc2.x)} ${fmt(lc2.y)} ${fmt(tip.x)} ${fmt(tip.y)} C ${fmt(rc2.x)} ${fmt(rc2.y)} ${fmt(rc1.x)} ${fmt(rc1.y)} ${fmt(baseRight.x)} ${fmt(baseRight.y)} Z`,
    sampledPolygon: sampled,
    selfIntersects: hasPolygonSelfIntersection(sampled),
  };
}

function buildThoughtDots(center: Point2D, rx: number, ry: number, exp: number, speaker: Point2D): ThoughtBubbleDot[] {
  const dx = speaker.x - center.x;
  const dy = speaker.y - center.y;
  const rawDist = Math.hypot(dx, dy);
  const angle = rawDist > 1e-3 ? Math.atan2(dy, dx) : Math.PI / 2;
  const edge = superEllipseVec(angle, rx, ry, exp);
  const startD = Math.hypot(edge.x, edge.y) + 14;
  const endD = Math.max(startD + 36, Math.min(rawDist, startD + 180));
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const radii = [8.5, 5.8, 3.4] as const;
  return ([0.15, 0.52, 0.88] as const).map((frac, idx) => {
    const dist = startD + (endD - startD) * frac;
    const arc = Math.sin(frac * Math.PI) * 8 * (dx >= 0 ? -1 : 1);
    const pt = roundPt(center.x + ux * dist - uy * arc, center.y + uy * dist + ux * arc);
    return { cx: pt.x, cy: pt.y, radius: radii[idx] ?? 4 };
  });
}

/** 감정·강도·텍스트 영역·화자 좌표를 기반으로 비파괴 말풍선 벡터 윤곽과 베지어 꼬리를 생성한다. */
export function generateProceduralBalloonContour(input: BalloonContourInput): BalloonContourOutput {
  const intensity = clamp(input.intensity, 0, 1);
  const seed = input.seed ?? 47;
  const safeText: Rect2D = {
    x: Number.isFinite(input.textBounds.x) ? input.textBounds.x : 0,
    y: Number.isFinite(input.textBounds.y) ? input.textBounds.y : 0,
    width: Math.max(8, Number.isFinite(input.textBounds.width) ? input.textBounds.width : 80),
    height: Math.max(8, Number.isFinite(input.textBounds.height) ? input.textBounds.height : 32),
  };

  const variant = input.variantOverride ?? resolveDefaultVariant(input.emotion);
  const padBoost = variant === "burst_spike" || variant === "double_border" ? 6 + intensity * 6 : 0;
  const safePadX = round3(Math.max(MIN_BALLOON_TEXT_CLEARANCE_PX, input.minPaddingX ?? DEFAULT_BALLOON_PADDING_X) + padBoost);
  const safePadY = round3(Math.max(MIN_BALLOON_TEXT_CLEARANCE_PX, input.minPaddingY ?? DEFAULT_BALLOON_PADDING_Y) + padBoost * 0.8);

  const center = roundPt(safeText.x + safeText.width / 2, safeText.y + safeText.height / 2);
  const innerSafeRect: Rect2D = {
    x: round3(safeText.x - safePadX),
    y: round3(safeText.y - safePadY),
    width: round3(safeText.width + safePadX * 2),
    height: round3(safeText.height + safePadY * 2),
  };

  const exp = variant === "double_border" && input.emotion === "narration" ? 5.2 : 2.15;
  const scale = exp > 4 ? 1.12 : Math.SQRT2 * 1.04;
  const baseRx = (innerSafeRect.width / 2) * scale;
  const baseRy = (innerSafeRect.height / 2) * scale;

  const rawSamples = Math.round(clamp(input.sampleCount ?? DEFAULT_CONTOUR_SAMPLE_COUNT, 24, 160));
  const samples = variant === "burst_spike" && rawSamples % 2 !== 0 ? rawSamples + 1 : rawSamples;

  const primaryRaw: Point2D[] = [];
  for (let i = 0; i < samples; i += 1) {
    const theta = (i / samples) * Math.PI * 2;
    const baseVec = superEllipseVec(theta, baseRx, baseRy, exp);
    const mult = radiusMultiplier(variant, input.emotion, theta, i, samples, intensity, seed);
    primaryRaw.push(roundPt(center.x + baseVec.x * mult, center.y + baseVec.y * mult));
  }

  const reqClear = Math.max(MIN_BALLOON_TEXT_CLEARANCE_PX, Math.min(safePadX, safePadY) * 0.65);
  let secondaryPolygon: Point2D[] | null = null;
  let contourPolygon: Point2D[];

  if (variant === "double_border") {
    const innerRaw: Point2D[] = [];
    for (let i = 0; i < samples; i += 1) {
      const vec = superEllipseVec((i / samples) * Math.PI * 2, baseRx, baseRy, exp);
      innerRaw.push(roundPt(center.x + vec.x, center.y + vec.y));
    }
    secondaryPolygon = enforceClearance(innerRaw, center, safeText, reqClear);
    const ringGap = 7 + intensity * 4;
    const outerRaw = primaryRaw.map((pt) => {
      const dx = pt.x - center.x;
      const dy = pt.y - center.y;
      const len = Math.max(Math.hypot(dx, dy), 1);
      const s = (len + ringGap) / len;
      return roundPt(center.x + dx * s, center.y + dy * s);
    });
    contourPolygon = enforceClearance(outerRaw, center, safeText, reqClear + ringGap * 0.6);
  } else {
    contourPolygon = enforceClearance(primaryRaw, center, safeText, reqClear);
  }

  const hasSpeaker = input.speakerAnchor !== undefined && input.speakerAnchor !== null;
  const tailMode = input.tailModeOverride ?? resolveDefaultTailMode(input.emotion, variant, hasSpeaker);
  const tail =
    hasSpeaker && input.speakerAnchor && (tailMode === "quadratic" || tailMode === "cubic")
      ? buildCurvedTail(center, baseRx, baseRy, exp, input.speakerAnchor, tailMode, intensity, input.tailCurveBend)
      : null;
  const thoughtDots =
    hasSpeaker && input.speakerAnchor && tailMode === "thought_dots"
      ? buildThoughtDots(center, baseRx, baseRy, exp, input.speakerAnchor)
      : [];

  const allPts: Point2D[] = [...contourPolygon, ...(tail?.sampledPolygon ?? [])];
  for (const d of thoughtDots) allPts.push({ x: d.cx - d.radius, y: d.cy - d.radius }, { x: d.cx + d.radius, y: d.cy + d.radius });

  const contourSvgPath = polygonToSvgPath(contourPolygon);
  const secondarySvgPath = secondaryPolygon !== null ? polygonToSvgPath(secondaryPolygon) : null;
  const minTextClearancePx = measureMinClearance(secondaryPolygon ?? contourPolygon, safeText);
  const combinedParts = [contourSvgPath, ...(secondarySvgPath ? [secondarySvgPath] : []), ...(tail ? [tail.svgPath] : [])];
  const strokeWidthPx = input.emotion === "whisper"
    ? 1.6
    : variant === "burst_spike" || input.emotion === "shock" ? Math.round((2.4 + intensity * 1.4) * 100) / 100 : 2.2;

  return {
    variant, emotion: input.emotion, intensity: round3(intensity), center, innerSafeRect,
    outerBounds: polygonBounds(allPts), safePadding: { x: safePadX, y: safePadY },
    contourPolygon, contourSvgPath, secondaryContourPolygon: secondaryPolygon, secondaryContourSvgPath: secondarySvgPath,
    strokeDashArray: input.emotion === "whisper" ? [6, 5] : null, strokeWidthPx, tail, thoughtDots,
    combinedSvgPath: combinedParts.join(" "),
    clearanceVerified: minTextClearancePx >= reqClear - 1e-2 && !hasPolygonSelfIntersection(contourPolygon),
    minTextClearancePx,
  };
}
