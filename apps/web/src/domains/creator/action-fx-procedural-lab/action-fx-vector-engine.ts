/**
 * Wave 42B — 한국 웹툰 액션·판타지·로맨스 6종 프로시저럴 벡터 이펙트 생성 엔진.
 *
 * - 결정론적 32비트 Mulberry32 PRNG(BigInt 리터럴·Web Storage·private Map store 미사용)
 * - 6종 파라메트릭 벡터 이펙트(`radial-focus-lines`, `parallel-speed-lines`, `impact-shockwave`,
 *   `arcane-magic-circle`, `motion-afterimage-ghost`, `romance-petal-frame`)
 * - 인물 얼굴 안전 영역(`characterMask`) 침범 0px 기하 클리핑 및 독립 감사기(`verifyCharacterMaskClearance`)
 * - 순수 OKLCH 팔레트 및 독립 SVG 문자열 익스포터(`exportActionFxSvg`)
 */

import { assertExportLayer, assertGeneration, assertMask, assertPreset, assertPrimitive, assertPrimitives, finite } from "./fx-input-contract";

export type ActionFxPresetId =
  | "radial-focus-lines"
  | "parallel-speed-lines"
  | "impact-shockwave"
  | "arcane-magic-circle"
  | "motion-afterimage-ghost"
  | "romance-petal-frame";

export type ActionFxCategory = "action" | "fantasy" | "romance";

export type ActionFxPrimitiveRole =
  | "focus-wedge" | "focus-hairline" | "speed-blade" | "speed-streak"
  | "shockwave-ring" | "shockwave-shard" | "magic-ring" | "magic-star"
  | "magic-rune" | "magic-node" | "ghost-silhouette" | "ghost-trail"
  | "petal" | "starlight" | "bokeh";

export interface Point2D { readonly x: number; readonly y: number; }
export interface CharacterMaskSpec { readonly cx: number; readonly cy: number; readonly radius: number; readonly enabled?: boolean; }
export interface ResolvedCharacterMask { readonly cx: number; readonly cy: number; readonly radius: number; readonly enabled: boolean; }

export interface ActionFxPalette {
  readonly primaryOklch: string; readonly secondaryOklch: string;
  readonly accentOklch: string; readonly subtleOklch: string;
}

export interface ActionFxPresetSpec {
  readonly id: ActionFxPresetId; readonly category: ActionFxCategory;
  readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly useCaseKo: string; readonly useCaseEn: string;
  readonly defaultDensity: number; readonly defaultAngleDeg: number;
  readonly defaultIntensity: number; readonly defaultLineWeight: number;
  readonly palette: ActionFxPalette;
}

export interface ActionFxPolygonPrimitive {
  readonly kind: "polygon"; readonly id: string; readonly role: ActionFxPrimitiveRole;
  readonly points: readonly Point2D[]; readonly fill: string;
  readonly stroke?: string; readonly strokeWidth?: number; readonly opacity: number;
}

export interface ActionFxPolylinePrimitive {
  readonly kind: "polyline"; readonly id: string; readonly role: ActionFxPrimitiveRole;
  readonly points: readonly Point2D[]; readonly fill: "none";
  readonly stroke: string; readonly strokeWidth: number;
  readonly opacity: number; readonly dashArray?: string;
}

export interface ActionFxCirclePrimitive {
  readonly kind: "circle"; readonly id: string; readonly role: ActionFxPrimitiveRole;
  readonly cx: number; readonly cy: number; readonly r: number; readonly fill: string;
  readonly stroke?: string; readonly strokeWidth?: number;
  readonly opacity: number; readonly dashArray?: string;
}

export interface ActionFxEllipsePrimitive {
  readonly kind: "ellipse"; readonly id: string; readonly role: ActionFxPrimitiveRole;
  readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number;
  readonly rotationDeg: number; readonly fill: string;
  readonly stroke?: string; readonly strokeWidth?: number; readonly opacity: number;
}

export type ActionFxVectorPrimitive =
  | ActionFxPolygonPrimitive | ActionFxPolylinePrimitive
  | ActionFxCirclePrimitive | ActionFxEllipsePrimitive;

export interface ActionFxGenerationOptions {
  readonly preset: ActionFxPresetId; readonly width?: number; readonly height?: number;
  readonly seed?: number; readonly density?: number;
  readonly vanishingPointX?: number; readonly vanishingPointY?: number;
  readonly angleDeg?: number; readonly lineWeight?: number; readonly intensity?: number;
  readonly characterMask?: Partial<CharacterMaskSpec>;
}

export interface ResolvedActionFxOptions {
  readonly preset: ActionFxPresetId; readonly width: number; readonly height: number;
  readonly seed: number; readonly density: number;
  readonly vanishingPointX: number; readonly vanishingPointY: number;
  readonly vanishingPointPx: Point2D; readonly angleDeg: number;
  readonly lineWeight: number; readonly intensity: number;
  readonly characterMask: ResolvedCharacterMask;
}

export interface CharacterMaskAuditReport {
  readonly maskEnabled: boolean; readonly safeZoneGuaranteed: boolean;
  readonly checkedPrimitiveCount: number; readonly intrudingPrimitiveIds: readonly string[];
  readonly maxIntrusionPx: number; readonly minClearancePx: number;
}

export interface ActionFxLayerMetrics {
  readonly primitiveCount: number; readonly polygonCount: number; readonly polylineCount: number;
  readonly circleCount: number; readonly ellipseCount: number; readonly estimatedSvgBytes: number;
}

export interface ActionFxLayerResult {
  readonly preset: ActionFxPresetSpec; readonly resolvedOptions: ResolvedActionFxOptions;
  readonly viewBox: string; readonly primitives: readonly ActionFxVectorPrimitive[];
  readonly maskAudit: CharacterMaskAuditReport; readonly metrics: ActionFxLayerMetrics;
}

export interface ExportActionFxSvgOptions {
  readonly includeBackdrop?: boolean; readonly includeSafeMaskGuide?: boolean; readonly includeVanishingGuide?: boolean;
}

export const DEFAULT_ACTION_FX_CANVAS = { width: 800, height: 1000 } as const;
export const DEFAULT_CHARACTER_MASK_RADIUS = 135;

export const ACTION_FX_PRESET_IDS: readonly ActionFxPresetId[] = [
  "radial-focus-lines", "parallel-speed-lines", "impact-shockwave",
  "arcane-magic-circle", "motion-afterimage-ghost", "romance-petal-frame",
] as const;

export const ACTION_FX_PRESETS: readonly ActionFxPresetSpec[] = [
  {
    id: "radial-focus-lines", category: "action", labelKo: "방사형 집중선", labelEn: "Radial Focus Lines",
    shortLabelKo: "집중선", shortLabelEn: "Focus",
    descriptionKo: "소실점 오프셋과 인물 얼굴 원형 안전 마스킹을 유지하는 테이퍼 삼각 집중선",
    descriptionEn: "Tapered triangular radial focus wedges with vanishing-point offset and face-safe masking",
    useCaseKo: "각성 클로즈업 · 대사 임팩트 · 긴박한 시선 집중", useCaseEn: "Awakening close-ups, reveals, and speech punch",
    defaultDensity: 1.0, defaultAngleDeg: 0, defaultIntensity: 1.0, defaultLineWeight: 1.0,
    palette: { primaryOklch: "oklch(0.93 0.012 80)", secondaryOklch: "oklch(0.76 0.015 74)", accentOklch: "oklch(0.72 0.185 42)", subtleOklch: "oklch(0.58 0.014 70)" },
  },
  {
    id: "parallel-speed-lines", category: "action", labelKo: "질주 평행 스피드라인", labelEn: "Parallel Speed Lines",
    shortLabelKo: "스피드라인", shortLabelEn: "Speed",
    descriptionKo: "각도·밀도·테이퍼를 조절해 돌진과 추격 속도감을 만드는 평행 블레이드 선",
    descriptionEn: "Directional tapered parallel speed blades with edge-weighted lane cadence",
    useCaseKo: "전력 질주 · 검기 돌진 · 차량 추격 연출", useCaseEn: "Sprints, forward lunges, and high-speed chases",
    defaultDensity: 1.0, defaultAngleDeg: -24, defaultIntensity: 1.0, defaultLineWeight: 1.0,
    palette: { primaryOklch: "oklch(0.92 0.014 230)", secondaryOklch: "oklch(0.78 0.11 232)", accentOklch: "oklch(0.72 0.185 42)", subtleOklch: "oklch(0.64 0.04 235)" },
  },
  {
    id: "impact-shockwave", category: "action", labelKo: "타격 충격파 · 파편 쐐기", labelEn: "Impact Shockwave & Shards",
    shortLabelKo: "충격파", shortLabelEn: "Impact",
    descriptionKo: "진원지 다중 충격파 링과 방사형 파편 쐐기를 결합한 타격 임팩트 레이어",
    descriptionEn: "Multi-ring shockwave arcs paired with ballistic wedge debris shards",
    useCaseKo: "필살기 격돌 · 지면 파쇄 · 폭발 반동 컷", useCaseEn: "Heavy strikes, ground shatters, and clash recoil",
    defaultDensity: 1.0, defaultAngleDeg: -15, defaultIntensity: 1.1, defaultLineWeight: 1.1,
    palette: { primaryOklch: "oklch(0.74 0.19 42)", secondaryOklch: "oklch(0.94 0.04 82)", accentOklch: "oklch(0.82 0.15 76)", subtleOklch: "oklch(0.62 0.15 28)" },
  },
  {
    id: "arcane-magic-circle", category: "fantasy", labelKo: "기하 룬 마법진", labelEn: "Arcane Magic Circle",
    shortLabelKo: "마법진", shortLabelEn: "Arcane",
    descriptionKo: "다중 동심원·정다각형 성진·기하 룬 문자로 구성한 판타지 결계 마법진",
    descriptionEn: "Concentric ritual rings, dual polygon star formations, and geometric rune band",
    useCaseKo: "마법 영창 · 소환진 발동 · 성물 결계 전개", useCaseEn: "Spellcasting, summoning seals, and arcane barriers",
    defaultDensity: 1.0, defaultAngleDeg: 15, defaultIntensity: 1.0, defaultLineWeight: 1.0,
    palette: { primaryOklch: "oklch(0.8 0.12 232)", secondaryOklch: "oklch(0.85 0.13 84)", accentOklch: "oklch(0.92 0.05 225)", subtleOklch: "oklch(0.68 0.1 245)" },
  },
  {
    id: "motion-afterimage-ghost", category: "action", labelKo: "액션 모션 잔상", labelEn: "Motion Afterimage Ghost",
    shortLabelKo: "모션 잔상", shortLabelEn: "Ghost",
    descriptionKo: "초고속 이동 뒤로 감쇠하는 단계별 동작 실루엣 잔상과 궤적 리본 오프셋",
    descriptionEn: "Decaying stepped action-figure ghost silhouettes with kinetic motion trails",
    useCaseKo: "순보 회피 · 분신 잔상 · 연속 참격 궤적", useCaseEn: "Flash-step dodges, mirage clones, and combo trails",
    defaultDensity: 1.0, defaultAngleDeg: -22, defaultIntensity: 1.0, defaultLineWeight: 1.0,
    palette: { primaryOklch: "oklch(0.76 0.12 232)", secondaryOklch: "oklch(0.72 0.185 42)", accentOklch: "oklch(0.92 0.03 220)", subtleOklch: "oklch(0.62 0.08 242)" },
  },
  {
    id: "romance-petal-frame", category: "romance", labelKo: "로맨스 꽃잎 · 별빛 프레임", labelEn: "Romance Petal & Starlight Frame",
    shortLabelKo: "로맨스 프레임", shortLabelEn: "Romance",
    descriptionKo: "인물 시선을 비워 둔 채 외곽 비네트를 채우는 벚꽃잎·별빛·빛망울 프레임",
    descriptionEn: "Perimeter vignette of notched blossom petals, starlight glints, and bokeh halos",
    useCaseKo: "로판 첫 만남 · 고백 클로즈업 · 설렘 감정선 강조", useCaseEn: "Romantic encounters, confession portraits, and highlights",
    defaultDensity: 1.0, defaultAngleDeg: 18, defaultIntensity: 1.0, defaultLineWeight: 1.0,
    palette: { primaryOklch: "oklch(0.84 0.11 16)", secondaryOklch: "oklch(0.91 0.09 84)", accentOklch: "oklch(0.95 0.04 34)", subtleOklch: "oklch(0.76 0.09 352)" },
  },
] as const;

const SAFE_MARGIN_PX = 2.5;
const DEG_TO_RAD = Math.PI / 180;
const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const round2 = (v: number): number => Math.round(v * 100) / 100;
const roundPt = (x: number, y: number): Point2D => ({ x: round2(x), y: round2(y) });
const dist2D = (a: Point2D, b: Point2D): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 프리셋 ID에 해당하는 정본 메타데이터를 조회한다. */
export function getActionFxPresetSpec(id: ActionFxPresetId): ActionFxPresetSpec {
  assertPreset(id);
  return ACTION_FX_PRESETS.find((item) => item.id === id) ?? ACTION_FX_PRESETS[0];
}

/** 32비트 Mulberry32 기반 결정론적 난수 생성기(0 <= x < 1). */
export function createSeededPrng(seed: number): () => number {
  finite([seed]);
  let state = (Math.trunc(Number.isFinite(seed) ? seed : 4201) >>> 0) || 1;
  return () => {
    state = (state + 1831565813) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointToSegmentDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function isPointInsidePolygon(p: Point2D, pts: readonly Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const pi = pts[i];
    const pj = pts[j];
    if (pi && pj && (pi.y > p.y) !== (pj.y > p.y) && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

function minPointsEdgeDistance(center: Point2D, pts: readonly Point2D[], closed: boolean): number {
  if (pts.length === 0) return Number.POSITIVE_INFINITY;
  if (pts.length === 1 && pts[0]) return dist2D(center, pts[0]);
  let minDist = Number.POSITIVE_INFINITY;
  const limit = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < limit; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a && b) minDist = Math.min(minDist, pointToSegmentDistance(center, a, b));
  }
  return minDist;
}

/** 단일 벡터 프리미티브가 인물 얼굴 안전 원형 영역을 침범하는 깊이(px)와 여유 거리(px)를 정확히 계측한다. */
export function measurePrimitiveIntrusion(
  primitive: ActionFxVectorPrimitive,
  mask: ResolvedCharacterMask,
): { readonly intrusionPx: number; readonly clearancePx: number } {
  assertMask(mask); assertPrimitive(primitive);
  if (!mask.enabled || mask.radius <= 0) return { intrusionPx: 0, clearancePx: Number.POSITIVE_INFINITY };
  const center: Point2D = { x: mask.cx, y: mask.cy };
  const halfStroke = primitive.stroke && primitive.stroke !== "none" ? (primitive.strokeWidth ?? 0) / 2 : 0;
  // 양의 침범을 소수 둘째 자리에서 버려 0px 통과로 만들지 않는다.
  const toRes = (clearance: number) => ({ intrusionPx: clearance < 0 ? Math.ceil(-clearance * 100) / 100 : 0, clearancePx: round2(clearance) });

  if (primitive.kind === "polygon") {
    if (primitive.points.length === 0) return { intrusionPx: 0, clearancePx: Number.POSITIVE_INFINITY };
    if (primitive.points.length >= 3 && isPointInsidePolygon(center, primitive.points)) return toRes(-(mask.radius + halfStroke));
    return toRes(minPointsEdgeDistance(center, primitive.points, true) - halfStroke - mask.radius);
  }
  if (primitive.kind === "polyline") {
    if (primitive.points.length === 0) return { intrusionPx: 0, clearancePx: Number.POSITIVE_INFINITY };
    return toRes(minPointsEdgeDistance(center, primitive.points, false) - halfStroke - mask.radius);
  }
  if (primitive.kind === "circle") {
    const centerDist = Math.hypot(primitive.cx - mask.cx, primitive.cy - mask.cy);
    if (primitive.fill !== "none") return toRes(centerDist - primitive.r - halfStroke - mask.radius);
    const rOut = primitive.r + halfStroke;
    const rIn = Math.max(0, primitive.r - halfStroke);
    const ringDist = centerDist > rOut ? centerDist - rOut : centerDist < rIn ? rIn - centerDist : 0;
    return toRes(ringDist - mask.radius);
  }
  return toRes(Math.hypot(primitive.cx - mask.cx, primitive.cy - mask.cy) - (Math.max(primitive.rx, primitive.ry) + halfStroke) - mask.radius);
}

/** 생성된 전체 벡터 프리미티브 집합에 대해 인물 얼굴 안전 영역 0px 침범 여부를 감사한다. */
export function verifyCharacterMaskClearance(
  primitives: readonly ActionFxVectorPrimitive[],
  mask: ResolvedCharacterMask,
): CharacterMaskAuditReport {
  assertMask(mask); assertPrimitives(primitives);
  if (!mask.enabled || mask.radius <= 0) {
    return { maskEnabled: false, safeZoneGuaranteed: true, checkedPrimitiveCount: primitives.length, intrudingPrimitiveIds: [], maxIntrusionPx: 0, minClearancePx: 0 };
  }
  const intrudingIds: string[] = [];
  let maxIntrusion = 0;
  let minClearance = Number.POSITIVE_INFINITY;
  for (const primitive of primitives) {
    const measured = measurePrimitiveIntrusion(primitive, mask);
    if (measured.intrusionPx > 0) {
      intrudingIds.push(primitive.id);
      if (measured.intrusionPx > maxIntrusion) maxIntrusion = measured.intrusionPx;
    }
    if (measured.clearancePx < minClearance) minClearance = measured.clearancePx;
  }
  return {
    maskEnabled: true, safeZoneGuaranteed: intrudingIds.length === 0 && maxIntrusion === 0,
    checkedPrimitiveCount: primitives.length, intrudingPrimitiveIds: intrudingIds,
    maxIntrusionPx: round2(maxIntrusion), minClearancePx: Number.isFinite(minClearance) ? round2(Math.max(0, minClearance)) : 0,
  };
}

function clipSegmentOutsideCircle(
  a: Point2D, b: Point2D, mask: ResolvedCharacterMask, padPx: number, minLen = 8,
): readonly (readonly [Point2D, Point2D])[] {
  if (!mask.enabled || mask.radius <= 0) return dist2D(a, b) >= minLen ? [[a, b]] : [];
  const effR = mask.radius + Math.max(SAFE_MARGIN_PX, padPx);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - mask.cx;
  const fy = a.y - mask.cy;
  const coefA = dx * dx + dy * dy;
  if (coefA <= 1e-6) return [];
  const coefB = 2 * (fx * dx + fy * dy);
  const disc = coefB * coefB - 4 * coefA * (fx * fx + fy * fy - effR * effR);
  if (disc <= 0) return Math.sqrt(coefA) >= minLen ? [[a, b]] : [];

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-coefB - sqrtDisc) / (2 * coefA);
  const t2 = (-coefB + sqrtDisc) / (2 * coefA);
  const out: [Point2D, Point2D][] = [];
  if (t1 > 0) {
    const pEnd = { x: a.x + dx * Math.min(1, t1), y: a.y + dy * Math.min(1, t1) };
    if (dist2D(a, pEnd) >= minLen) out.push([a, pEnd]);
  }
  if (t2 < 1) {
    const pStart = { x: a.x + dx * Math.max(0, t2), y: a.y + dy * Math.max(0, t2) };
    if (dist2D(pStart, b) >= minLen) out.push([pStart, b]);
  }
  return out;
}

function rayExitDistanceToRect(o: Point2D, dx: number, dy: number, w: number, h: number, bleed = 18): number {
  let tMax = Number.POSITIVE_INFINITY;
  if (Math.abs(dx) > 1e-6) {
    const tx = dx > 0 ? (w + bleed - o.x) / dx : (-bleed - o.x) / dx;
    if (tx > 0 && tx < tMax) tMax = tx;
  }
  if (Math.abs(dy) > 1e-6) {
    const ty = dy > 0 ? (h + bleed - o.y) / dy : (-bleed - o.y) / dy;
    if (ty > 0 && ty < tMax) tMax = ty;
  }
  return Number.isFinite(tMax) ? tMax : Math.hypot(w, h);
}

function pushSafe(target: ActionFxVectorPrimitive[], primitive: ActionFxVectorPrimitive, mask: ResolvedCharacterMask): boolean {
  if (measurePrimitiveIntrusion(primitive, mask).intrusionPx > 0) return false;
  target.push(primitive);
  return true;
}

function pushPoly(
  target: ActionFxVectorPrimitive[], mask: ResolvedCharacterMask, id: string, role: ActionFxPrimitiveRole,
  points: readonly Point2D[], fill: string, opacity: number, stroke?: string, strokeWidth?: number,
): boolean {
  return pushSafe(target, { kind: "polygon", id, role, points, fill, opacity, ...(stroke ? { stroke, strokeWidth: strokeWidth ?? 1 } : {}) }, mask);
}

function pushLine(
  target: ActionFxVectorPrimitive[], mask: ResolvedCharacterMask, id: string, role: ActionFxPrimitiveRole,
  points: readonly Point2D[], stroke: string, strokeWidth: number, opacity: number, dashArray?: string,
): boolean {
  return pushSafe(target, { kind: "polyline", id, role, points, fill: "none", stroke, strokeWidth, opacity, ...(dashArray ? { dashArray } : {}) }, mask);
}

function buildTaperedWedge(tip: Point2D, base: Point2D, baseHalfW: number, tipHalfW = 0): readonly Point2D[] {
  const dx = base.x - tip.x;
  const dy = base.y - tip.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return [];
  const nx = -dy / len;
  const ny = dx / len;
  return tipHalfW <= 0.1
    ? [roundPt(tip.x, tip.y), roundPt(base.x + nx * baseHalfW, base.y + ny * baseHalfW), roundPt(base.x - nx * baseHalfW, base.y - ny * baseHalfW)]
    : [roundPt(tip.x + nx * tipHalfW, tip.y + ny * tipHalfW), roundPt(base.x + nx * baseHalfW, base.y + ny * baseHalfW), roundPt(base.x - nx * baseHalfW, base.y - ny * baseHalfW), roundPt(tip.x - nx * tipHalfW, tip.y - ny * tipHalfW)];
}

function sampleSafeArcPolylines(
  center: Point2D, radius: number, startRad: number, endRad: number,
  steps: number, mask: ResolvedCharacterMask, padPx: number,
): readonly (readonly Point2D[])[] {
  const effR = mask.enabled && mask.radius > 0 ? mask.radius + Math.max(SAFE_MARGIN_PX, padPx) : 0;
  const chains: Point2D[][] = [];
  let current: Point2D[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const theta = startRad + ((endRad - startRad) * i) / steps;
    const pt = roundPt(center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius);
    if (effR > 0 && Math.hypot(pt.x - mask.cx, pt.y - mask.cy) <= effR) {
      if (current.length >= 2) chains.push(current);
      current = [];
    } else {
      current.push(pt);
    }
  }
  if (current.length >= 2) chains.push(current);
  return chains;
}

function generateRadialFocusLines(opts: ResolvedActionFxOptions, preset: ActionFxPresetSpec, rand: () => number): ActionFxVectorPrimitive[] {
  const out: ActionFxVectorPrimitive[] = [];
  const { width, height, vanishingPointPx: vp, density, lineWeight, intensity, characterMask } = opts;
  const rayCount = Math.round(clamp(68 * density, 24, 180));
  const baseInnerR = Math.min(width, height) * clamp(0.24 - (intensity - 1) * 0.06, 0.12, 0.34);

  for (let i = 0; i < rayCount; i += 1) {
    const angle = (Math.PI * 2 * i) / rayCount + (rand() - 0.5) * ((Math.PI * 2) / rayCount) * 0.72;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const exitDist = rayExitDistanceToRect(vp, dirX, dirY, width, height, 14);
    const innerDist = baseInnerR * (0.72 + rand() * 0.68);
    if (exitDist - innerDist < 18) continue;

    const pStart: Point2D = { x: vp.x + dirX * innerDist, y: vp.y + dirY * innerDist };
    const pEnd: Point2D = { x: vp.x + dirX * exitDist, y: vp.y + dirY * exitDist };
    const isAccent = i % 7 === 0 && rand() > 0.35;
    const isHairline = !isAccent && rand() < 0.28;
    const baseHalfW = (isHairline ? 0.9 + rand() * 0.8 : 2.1 + rand() * 4.4) * lineWeight;

    clipSegmentOutsideCircle(pStart, pEnd, characterMask, baseHalfW + 5, 14).forEach(([s0, s1], segIdx) => {
      const tipCloser = dist2D(s0, vp) <= dist2D(s1, vp);
      const tip = tipCloser ? s0 : s1;
      const base = tipCloser ? s1 : s0;
      if (isHairline) {
        pushLine(out, characterMask, `focus-hair-${i}-${segIdx}`, "focus-hairline", [roundPt(tip.x, tip.y), roundPt(base.x, base.y)], preset.palette.secondaryOklch, round2(clamp(1.1 * lineWeight, 0.6, 3.2)), round2(0.45 + rand() * 0.38));
      } else {
        pushPoly(out, characterMask, `focus-wedge-${i}-${segIdx}`, "focus-wedge", buildTaperedWedge(tip, base, baseHalfW, 0), isAccent ? preset.palette.accentOklch : preset.palette.primaryOklch, round2(isAccent ? 0.72 + rand() * 0.22 : 0.62 + rand() * 0.32));
      }
    });
  }
  return out;
}

function generateParallelSpeedLines(opts: ResolvedActionFxOptions, preset: ActionFxPresetSpec, rand: () => number): ActionFxVectorPrimitive[] {
  const out: ActionFxVectorPrimitive[] = [];
  const { width, height, angleDeg, density, lineWeight, intensity, characterMask } = opts;
  const rad = angleDeg * DEG_TO_RAD;
  const dirX = Math.cos(rad);
  const dirY = Math.sin(rad);
  const normX = -dirY;
  const normY = dirX;
  const diag = Math.hypot(width, height);
  const laneCount = Math.round(clamp(56 * density, 22, 160));

  for (let i = 0; i < laneCount; i += 1) {
    const laneNorm = (i / Math.max(1, laneCount - 1)) * 2 - 1;
    const edgeWeight = Math.abs(laneNorm);
    const offsetPerp = (laneNorm + (rand() - 0.5) * 0.045) * (diag * 0.54);
    const halfLen = diag * clamp(0.28 + edgeWeight * 0.22 + rand() * 0.14 * intensity, 0.18, 0.6);
    const shift = (rand() - 0.5) * diag * 0.36;
    const p0: Point2D = { x: width * 0.5 + normX * offsetPerp + dirX * (shift - halfLen), y: height * 0.5 + normY * offsetPerp + dirY * (shift - halfLen) };
    const p1: Point2D = { x: width * 0.5 + normX * offsetPerp + dirX * (shift + halfLen), y: height * 0.5 + normY * offsetPerp + dirY * (shift + halfLen) };
    const halfW = (0.8 + edgeWeight * 3.1 + rand() * 1.9) * lineWeight;
    const isStreak = rand() < 0.34;

    clipSegmentOutsideCircle(p0, p1, characterMask, halfW + 5, 18).forEach(([a, b], segIdx) => {
      if (isStreak) {
        pushLine(out, characterMask, `speed-streak-${i}-${segIdx}`, "speed-streak", [roundPt(a.x, a.y), roundPt(b.x, b.y)], i % 5 === 0 ? preset.palette.accentOklch : preset.palette.secondaryOklch, round2(clamp(1.2 * lineWeight, 0.6, 3.6)), round2(0.38 + edgeWeight * 0.35 + rand() * 0.18));
      } else {
        pushPoly(out, characterMask, `speed-blade-${i}-${segIdx}`, "speed-blade", buildTaperedWedge(a, b, halfW, 0.25), i % 8 === 0 ? preset.palette.accentOklch : preset.palette.primaryOklch, round2(0.45 + edgeWeight * 0.35 + rand() * 0.16));
      }
    });
  }
  return out;
}

function generateImpactShockwave(opts: ResolvedActionFxOptions, preset: ActionFxPresetSpec, rand: () => number): ActionFxVectorPrimitive[] {
  const out: ActionFxVectorPrimitive[] = [];
  const { width, height, vanishingPointPx: epi, density, lineWeight, intensity, characterMask } = opts;
  const minSpan = Math.min(width, height);
  const distToMask = Math.hypot(epi.x - characterMask.cx, epi.y - characterMask.cy);
  const clearStart = characterMask.enabled ? Math.max(minSpan * 0.2, distToMask + characterMask.radius + 18) : minSpan * 0.16;
  const ringCount = Math.round(clamp(3 + density * 1.5, 2, 6));
  const ringStep = clamp((minSpan * 0.34 * intensity) / ringCount, 28, 92);

  for (let rIdx = 0; rIdx < ringCount; rIdx += 1) {
    const ringR = round2(clearStart + rIdx * ringStep);
    const strokeW = round2(clamp((4.2 - rIdx * 0.65) * lineWeight, 1.2, 8.5));
    const arcPieces = 4 + (rIdx % 3) * 2;
    const strokeColor = rIdx === 0 ? preset.palette.secondaryOklch : preset.palette.primaryOklch;
    const opacity = round2(clamp(0.92 - rIdx * 0.14, 0.32, 0.95));
    for (let p = 0; p < arcPieces; p += 1) {
      const startDeg = (360 / arcPieces) * p + rand() * 14;
      const spanDeg = (360 / arcPieces) * (0.58 + rand() * 0.28);
      sampleSafeArcPolylines(epi, ringR, startDeg * DEG_TO_RAD, (startDeg + spanDeg) * DEG_TO_RAD, 24, characterMask, strokeW / 2 + 4).forEach((chain, cIdx) => {
        pushLine(out, characterMask, `shock-ring-${rIdx}-${p}-${cIdx}`, "shockwave-ring", chain, strokeColor, strokeW, opacity);
      });
    }
  }

  const shardCount = Math.round(clamp(30 * density, 14, 96));
  for (let i = 0; i < shardCount; i += 1) {
    const angle = (Math.PI * 2 * i) / shardCount + (rand() - 0.5) * 0.2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const shardLen = (24 + rand() * 68) * intensity;
    const shardHalfW = (3.2 + rand() * 7.5) * lineWeight;
    let dist = clearStart + 8 + rand() * (minSpan * 0.34);
    if (characterMask.enabled && characterMask.radius > 0) {
      const fromMask = Math.hypot(epi.x + dirX * dist - characterMask.cx, epi.y + dirY * dist - characterMask.cy);
      const reqClear = characterMask.radius + shardLen * 0.65 + shardHalfW + 10;
      if (fromMask < reqClear) dist += reqClear - fromMask + 12;
    }
    const nx = -dirY;
    const ny = dirX;
    const midX = epi.x + dirX * dist;
    const midY = epi.y + dirY * dist;
    const skew = (rand() - 0.5) * 0.35;
    const pts: Point2D[] = [
      roundPt(epi.x + dirX * (dist + shardLen * 0.6), epi.y + dirY * (dist + shardLen * 0.6)),
      roundPt(midX + nx * shardHalfW * (1 + skew), midY + ny * shardHalfW * (1 + skew)),
      roundPt(epi.x + dirX * (dist - shardLen * 0.4), epi.y + dirY * (dist - shardLen * 0.4)),
      roundPt(midX - nx * shardHalfW * (1 - skew), midY - ny * shardHalfW * (1 - skew)),
    ];
    const fill = i % 4 === 0 ? preset.palette.secondaryOklch : i % 3 === 0 ? preset.palette.accentOklch : preset.palette.primaryOklch;
    pushPoly(out, characterMask, `shock-shard-${i}`, "shockwave-shard", pts, fill, round2(0.58 + rand() * 0.38));
  }
  return out;
}

function generateArcaneMagicCircle(opts: ResolvedActionFxOptions, preset: ActionFxPresetSpec, rand: () => number): ActionFxVectorPrimitive[] {
  const out: ActionFxVectorPrimitive[] = [];
  const { width, height, vanishingPointPx: origin, density, angleDeg, lineWeight, intensity, characterMask } = opts;
  const minSpan = Math.min(width, height);
  const distToMask = Math.hypot(origin.x - characterMask.cx, origin.y - characterMask.cy);
  const desiredOuterR = minSpan * clamp(0.37 * intensity, 0.24, 0.46);
  const outerR = round2(Math.min(minSpan * 0.48, Math.max(desiredOuterR, characterMask.enabled ? distToMask + characterMask.radius + 64 : desiredOuterR)));
  const midRingR = round2(outerR * 0.91);
  const runeInnerR = round2(outerR * 0.78);
  const innerRingR = round2(outerR * 0.58);
  const rotRad = angleDeg * DEG_TO_RAD;

  const rings: readonly { readonly r: number; readonly sw: number; readonly color: string; readonly dash?: string; readonly op: number }[] = [
    { r: outerR, sw: 2.6 * lineWeight, color: preset.palette.primaryOklch, op: 0.92 },
    { r: midRingR, sw: 1.5 * lineWeight, color: preset.palette.accentOklch, dash: "8 5", op: 0.78 },
    { r: runeInnerR, sw: 2.0 * lineWeight, color: preset.palette.secondaryOklch, op: 0.86 },
    { r: innerRingR, sw: 1.3 * lineWeight, color: preset.palette.subtleOklch, dash: "4 4", op: 0.65 },
  ];

  rings.forEach((spec, idx) => {
    const circle: ActionFxCirclePrimitive = {
      kind: "circle", id: `magic-ring-${idx}`, role: "magic-ring",
      cx: round2(origin.x), cy: round2(origin.y), r: spec.r, fill: "none",
      stroke: spec.color, strokeWidth: round2(spec.sw), opacity: spec.op, ...(spec.dash ? { dashArray: spec.dash } : {}),
    };
    if (!pushSafe(out, circle, characterMask)) {
      sampleSafeArcPolylines(origin, spec.r, 0, Math.PI * 2, 64, characterMask, spec.sw / 2 + 4).forEach((chain, cIdx) => {
        pushLine(out, characterMask, `magic-arc-${idx}-${cIdx}`, "magic-ring", chain, spec.color, round2(spec.sw), spec.op, spec.dash);
      });
    }
  });

  const polySides = rand() > 0.45 ? 3 : 4;
  const starR = runeInnerR * 0.97;
  const starStroke = round2(1.9 * lineWeight);
  for (let layer = 0; layer < 2; layer += 1) {
    const offset = rotRad + (layer * Math.PI) / polySides;
    for (let s = 0; s < polySides; s += 1) {
      const a0 = offset + (Math.PI * 2 * s) / polySides;
      const a1 = offset + (Math.PI * 2 * ((s + 1) % polySides)) / polySides;
      const p0: Point2D = { x: origin.x + Math.cos(a0) * starR, y: origin.y + Math.sin(a0) * starR };
      const p1: Point2D = { x: origin.x + Math.cos(a1) * starR, y: origin.y + Math.sin(a1) * starR };
      clipSegmentOutsideCircle(p0, p1, characterMask, starStroke / 2 + 4, 12).forEach(([c0, c1], segIdx) => {
        pushLine(out, characterMask, `magic-star-${layer}-${s}-${segIdx}`, "magic-star", [roundPt(c0.x, c0.y), roundPt(c1.x, c1.y)], layer === 0 ? preset.palette.primaryOklch : preset.palette.secondaryOklch, starStroke, 0.85);
      });
      const nr = round2(7.5 * lineWeight);
      pushPoly(out, characterMask, `magic-node-${layer}-${s}`, "magic-node", [roundPt(p0.x, p0.y - nr), roundPt(p0.x + nr, p0.y), roundPt(p0.x, p0.y + nr), roundPt(p0.x - nr, p0.y)], preset.palette.accentOklch, 0.9);
    }
  }

  const runeCount = Math.round(clamp(18 * density, 8, 48));
  const runeBandR = (runeInnerR + midRingR) * 0.5;
  const rs = clamp((midRingR - runeInnerR) * 0.38, 6, 18);
  for (let i = 0; i < runeCount; i += 1) {
    const theta = rotRad + (Math.PI * 2 * i) / runeCount;
    const radX = Math.cos(theta);
    const radY = Math.sin(theta);
    const tanX = -radY;
    const tanY = radX;
    const rx = origin.x + radX * runeBandR;
    const ry = origin.y + radY * runeBandR;
    const variant = Math.floor(rand() * 3);
    const pts: Point2D[] = variant === 0
      ? [roundPt(rx - radX * rs, ry - radY * rs), roundPt(rx + radX * rs, ry + radY * rs), roundPt(rx + tanX * rs * 0.72, ry + tanY * rs * 0.72), roundPt(rx - radX * rs * 0.35, ry - radY * rs * 0.35)]
      : variant === 1
        ? [roundPt(rx - tanX * rs * 0.65, ry - tanY * rs * 0.65), roundPt(rx + radX * rs * 0.85, ry + radY * rs * 0.85), roundPt(rx + tanX * rs * 0.65, ry + tanY * rs * 0.65), roundPt(rx - radX * rs * 0.85, ry - radY * rs * 0.85)]
        : [roundPt(rx - radX * rs * 0.85 - tanX * rs * 0.5, ry - radY * rs * 0.85 - tanY * rs * 0.5), roundPt(rx + radX * rs * 0.85, ry + radY * rs * 0.85), roundPt(rx - radX * rs * 0.85 + tanX * rs * 0.5, ry - radY * rs * 0.85 + tanY * rs * 0.5)];
    pushLine(out, characterMask, `magic-rune-${i}`, "magic-rune", pts, i % 2 === 0 ? preset.palette.secondaryOklch : preset.palette.accentOklch, round2(clamp(1.35 * lineWeight, 0.8, 3)), 0.82);
  }
  return out;
}

function generateMotionAfterimageGhost(opts: ResolvedActionFxOptions, preset: ActionFxPresetSpec, rand: () => number): ActionFxVectorPrimitive[] {
  const out: ActionFxVectorPrimitive[] = [];
  const { width, height, angleDeg, density, lineWeight, intensity, characterMask, vanishingPointPx } = opts;
  const anchor: Point2D = characterMask.enabled ? { x: characterMask.cx, y: characterMask.cy } : vanishingPointPx;
  const rad = angleDeg * DEG_TO_RAD;
  const backX = -Math.cos(rad);
  const backY = -Math.sin(rad);
  const perpX = -backY;
  const perpY = backX;
  const ghostCount = Math.round(clamp(3 + density * 2.5, 3, 8));
  const runway = rayExitDistanceToRect(anchor, backX, backY, width, height, -24);
  const availableRunway = Math.max(84, runway - (characterMask.enabled ? characterMask.radius + 54 : 68));
  const baseScale = clamp((availableRunway / 220) * intensity, 0.42, 0.95);
  const ghostHalfExtent = 46 * baseScale;
  const startOffset = characterMask.enabled ? characterMask.radius + ghostHalfExtent + 14 : 64;
  const stepDist = clamp((availableRunway - ghostHalfExtent) / Math.max(1, ghostCount), 26, 72);

  for (let g = 0; g < ghostCount; g += 1) {
    const progress = g / Math.max(1, ghostCount - 1);
    const s = 42 * baseScale * (1 - progress * 0.24);
    const sway = (rand() - 0.5) * 14 * (g + 1);
    const dist = startOffset + g * stepDist;
    const gx = clamp(anchor.x + backX * dist + perpX * sway, 46, width - 46);
    const gy = clamp(anchor.y + backY * dist + perpY * sway, 56, height - 56);
    const opacity = round2(clamp(0.76 - progress * 0.56, 0.14, 0.82));
    const bodyPts: Point2D[] = [
      roundPt(gx + backX * -s * 0.55 + perpX * -s * 0.22, gy + backY * -s * 0.55 + perpY * -s * 0.22),
      roundPt(gx + backX * -s * 0.25 + perpX * s * 0.48, gy + backY * -s * 0.25 + perpY * s * 0.48),
      roundPt(gx + backX * s * 0.65 + perpX * s * 0.88, gy + backY * s * 0.65 + perpY * s * 0.88),
      roundPt(gx + backX * s * 0.92 + perpX * s * 0.18, gy + backY * s * 0.92 + perpY * s * 0.18),
      roundPt(gx + backX * s * 0.72 + perpX * -s * 0.74, gy + backY * s * 0.72 + perpY * -s * 0.74),
      roundPt(gx + backX * -s * 0.1 + perpX * -s * 0.52, gy + backY * -s * 0.1 + perpY * -s * 0.52),
    ];
    pushPoly(out, characterMask, `ghost-body-${g}`, "ghost-silhouette", bodyPts, g % 2 === 0 ? preset.palette.primaryOklch : preset.palette.subtleOklch, opacity, preset.palette.accentOklch, round2(clamp(1.6 * lineWeight, 0.8, 3.2)));

    for (let t = -1; t <= 1; t += 1) {
      const trailStart: Point2D = { x: gx + perpX * t * s * 0.44, y: gy + perpY * t * s * 0.44 };
      const trailLen = (55 + rand() * 72) * intensity;
      const trailEnd: Point2D = { x: trailStart.x + backX * trailLen, y: trailStart.y + backY * trailLen };
      clipSegmentOutsideCircle(trailStart, trailEnd, characterMask, 4, 14).forEach(([c0, c1], segIdx) => {
        pushLine(out, characterMask, `ghost-trail-${g}-${t + 1}-${segIdx}`, "ghost-trail", [roundPt(c0.x, c0.y), roundPt(c1.x, c1.y)], t === 0 ? preset.palette.secondaryOklch : preset.palette.accentOklch, round2(clamp((2.2 - progress * 1.1) * lineWeight, 0.7, 4.2)), round2(clamp(opacity * 0.9, 0.12, 0.86)));
      });
    }
  }
  return out;
}

function buildBlossomPetal(cx: number, cy: number, size: number, rotRad: number): readonly Point2D[] {
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  const local: readonly Point2D[] = [
    { x: 0, y: -size * 0.92 }, { x: size * 0.56, y: -size * 0.35 }, { x: size * 0.46, y: size * 0.58 },
    { x: size * 0.16, y: size * 0.95 }, { x: 0, y: size * 0.68 }, { x: -size * 0.16, y: size * 0.95 },
    { x: -size * 0.46, y: size * 0.58 }, { x: -size * 0.56, y: -size * 0.35 },
  ];
  return local.map((pt) => roundPt(cx + pt.x * cos - pt.y * sin, cy + pt.x * sin + pt.y * cos));
}

function buildStarlight(cx: number, cy: number, outerR: number, innerR: number, spikes: number, rotRad: number): readonly Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(roundPt(cx + Math.cos(rotRad + (Math.PI * i) / spikes) * r, cy + Math.sin(rotRad + (Math.PI * i) / spikes) * r));
  }
  return pts;
}

function placeInVignette(w: number, h: number, mask: ResolvedCharacterMask, itemR: number, rand: () => number): Point2D {
  const angle = rand() * Math.PI * 2;
  let x = clamp(w * 0.5 + Math.cos(angle) * w * (0.34 + rand() * 0.15), itemR + 10, w - itemR - 10);
  let y = clamp(h * 0.5 + Math.sin(angle) * h * (0.34 + rand() * 0.15), itemR + 10, h - itemR - 10);
  if (mask.enabled && mask.radius > 0) {
    const dx = x - mask.cx;
    const dy = y - mask.cy;
    const d = Math.hypot(dx, dy);
    const minDist = mask.radius + itemR + 12;
    if (d < minDist) {
      const ux = d > 1e-4 ? dx / d : Math.cos(angle);
      const uy = d > 1e-4 ? dy / d : Math.sin(angle);
      x = clamp(mask.cx + ux * (minDist + 8 + rand() * 24), itemR + 8, w - itemR - 8);
      y = clamp(mask.cy + uy * (minDist + 8 + rand() * 24), itemR + 8, h - itemR - 8);
    }
  }
  return { x: round2(x), y: round2(y) };
}

function generateRomancePetalFrame(opts: ResolvedActionFxOptions, preset: ActionFxPresetSpec, rand: () => number): ActionFxVectorPrimitive[] {
  const out: ActionFxVectorPrimitive[] = [];
  const { width, height, density, angleDeg, intensity, characterMask } = opts;
  const baseTilt = angleDeg * DEG_TO_RAD;

  for (let i = 0; i < Math.round(clamp(28 * density, 12, 84)); i += 1) {
    const size = round2((12 + rand() * 19) * clamp(intensity, 0.65, 1.5));
    const pos = placeInVignette(width, height, characterMask, size + 4, rand);
    const fill = i % 3 === 0 ? preset.palette.accentOklch : i % 2 === 0 ? preset.palette.primaryOklch : preset.palette.subtleOklch;
    pushPoly(out, characterMask, `romance-petal-${i}`, "petal", buildBlossomPetal(pos.x, pos.y, size, baseTilt + (rand() - 0.5) * Math.PI), fill, round2(0.46 + rand() * 0.44));
  }
  for (let i = 0; i < Math.round(clamp(16 * density, 6, 48)); i += 1) {
    const outerR = round2((9 + rand() * 16) * clamp(intensity, 0.7, 1.45));
    const pos = placeInVignette(width, height, characterMask, outerR + 4, rand);
    pushPoly(out, characterMask, `romance-star-${i}`, "starlight", buildStarlight(pos.x, pos.y, outerR, outerR * 0.24, i % 3 === 0 ? 8 : 4, baseTilt * 0.4), i % 2 === 0 ? preset.palette.secondaryOklch : preset.palette.accentOklch, round2(0.55 + rand() * 0.4));
  }
  for (let i = 0; i < Math.round(clamp(12 * density, 5, 34)); i += 1) {
    const r = round2(10 + rand() * 24);
    const pos = placeInVignette(width, height, characterMask, r + 5, rand);
    const isHalo = i % 2 === 0;
    pushSafe(out, {
      kind: "circle", id: `romance-bokeh-${i}`, role: "bokeh", cx: pos.x, cy: pos.y, r,
      fill: isHalo ? "none" : preset.palette.secondaryOklch,
      ...(isHalo ? { stroke: preset.palette.accentOklch, strokeWidth: 1.4 } : {}),
      opacity: round2(isHalo ? 0.34 + rand() * 0.28 : 0.16 + rand() * 0.22),
    }, characterMask);
  }
  return out;
}

const escXml = (v: string): string => v.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const fmtPts = (pts: readonly Point2D[]): string => pts.map((pt) => `${pt.x},${pt.y}`).join(" ");

function serializePrimitive(p: ActionFxVectorPrimitive): string {
  const stroke = p.stroke && p.stroke !== "none" ? ` stroke="${escXml(p.stroke)}" stroke-width="${p.strokeWidth ?? 1}"` : "";
  if (p.kind === "polygon") return `    <polygon id="${escXml(p.id)}" data-role="${escXml(p.role)}" points="${fmtPts(p.points)}" fill="${escXml(p.fill)}"${stroke ? `${stroke} stroke-linejoin="round"` : ""} opacity="${p.opacity}" />`;
  if (p.kind === "polyline") return `    <polyline id="${escXml(p.id)}" data-role="${escXml(p.role)}" points="${fmtPts(p.points)}" fill="none" stroke="${escXml(p.stroke)}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${p.dashArray ? ` stroke-dasharray="${escXml(p.dashArray)}"` : ""} opacity="${p.opacity}" />`;
  if (p.kind === "circle") return `    <circle id="${escXml(p.id)}" data-role="${escXml(p.role)}" cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${escXml(p.fill)}"${stroke}${p.dashArray ? ` stroke-dasharray="${escXml(p.dashArray)}"` : ""} opacity="${p.opacity}" />`;
  const rot = p.rotationDeg !== 0 ? ` transform="rotate(${p.rotationDeg} ${p.cx} ${p.cy})"` : "";
  return `    <ellipse id="${escXml(p.id)}" data-role="${escXml(p.role)}" cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${escXml(p.fill)}"${stroke}${rot} opacity="${p.opacity}" />`;
}

/** 생성된 웹툰 액션·판타지·로맨스 벡터 레이어를 독립 순수 SVG 문자열로 직렬화한다. */
export function exportActionFxSvg(layer: ActionFxLayerResult, options?: ExportActionFxSvgOptions): string {
  const { width, height, seed, characterMask, vanishingPointPx } = layer.resolvedOptions;
  assertExportLayer(layer);
  const audit = verifyCharacterMaskClearance(layer.primitives, characterMask);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escXml(layer.viewBox)}" width="${width}" height="${height}" role="img" aria-label="${escXml(`${layer.preset.labelKo} (${layer.preset.labelEn})`)}">`,
    `  <title>${escXml(layer.preset.labelKo)}</title>`,
    `  <desc>${escXml(`Preset: ${layer.preset.id} | Seed: ${seed} | MaskIntrusion: ${audit.maxIntrusionPx}px`)}</desc>`,
  ];
  if (options?.includeBackdrop) lines.push(`  <rect x="0" y="0" width="${width}" height="${height}" fill="oklch(0.155 0.008 70)" />`);
  lines.push(`  <g data-fx-preset="${escXml(layer.preset.id)}" data-seed="${seed}" data-safe-zone="${!audit.maskEnabled ? "disabled" : audit.safeZoneGuaranteed ? "verified" : "breach"}">`);
  for (const p of layer.primitives) lines.push(serializePrimitive(p));
  lines.push("  </g>");
  if (options?.includeSafeMaskGuide && characterMask.enabled && characterMask.radius > 0) {
    lines.push(`  <g data-guide="character-safe-mask"><circle cx="${characterMask.cx}" cy="${characterMask.cy}" r="${characterMask.radius}" fill="oklch(0.8 0.15 150 / 0.1)" stroke="oklch(0.8 0.15 150)" stroke-width="2" stroke-dasharray="8 6" /></g>`);
  }
  if (options?.includeVanishingGuide) {
    lines.push(`  <g data-guide="vanishing-point" stroke="oklch(0.72 0.185 42)" stroke-width="1.8"><line x1="${round2(vanishingPointPx.x - 14)}" y1="${vanishingPointPx.y}" x2="${round2(vanishingPointPx.x + 14)}" y2="${vanishingPointPx.y}" /><line x1="${vanishingPointPx.x}" y1="${round2(vanishingPointPx.y - 14)}" x2="${vanishingPointPx.x}" y2="${round2(vanishingPointPx.y + 14)}" /></g>`);
  }
  lines.push("</svg>");
  return lines.join("\n");
}

const PRESET_GENERATORS: Readonly<Record<ActionFxPresetId, (opts: ResolvedActionFxOptions, preset: ActionFxPresetSpec, rand: () => number) => ActionFxVectorPrimitive[]>> = {
  "radial-focus-lines": generateRadialFocusLines,
  "parallel-speed-lines": generateParallelSpeedLines,
  "impact-shockwave": generateImpactShockwave,
  "arcane-magic-circle": generateArcaneMagicCircle,
  "motion-afterimage-ghost": generateMotionAfterimageGhost,
  "romance-petal-frame": generateRomancePetalFrame,
};

/** 6종 웹툰 프로시저럴 벡터 이펙트 레이어를 결정론적으로 생성하고 얼굴 안전 영역 침범 0px를 검증한다. */
export function generateActionFxLayer(options: ActionFxGenerationOptions): ActionFxLayerResult {
  assertGeneration(options);
  const preset = getActionFxPresetSpec(options.preset);
  const width = Math.round(clamp(options.width ?? DEFAULT_ACTION_FX_CANVAS.width, 320, 2400));
  const height = Math.round(clamp(options.height ?? DEFAULT_ACTION_FX_CANVAS.height, 320, 3200));
  const seed = Math.trunc(Number.isFinite(options.seed ?? 4201) ? (options.seed ?? 4201) : 4201);
  const density = round2(clamp(options.density ?? preset.defaultDensity, 0.2, 2.0));
  const vanishingPointX = round2(clamp(options.vanishingPointX ?? 0.5, 0.08, 0.92));
  const vanishingPointY = round2(clamp(options.vanishingPointY ?? 0.44, 0.08, 0.92));
  const vanishingPointPx = roundPt(width * vanishingPointX, height * vanishingPointY);
  const angleDeg = round2(clamp(options.angleDeg ?? preset.defaultAngleDeg, -180, 180));
  const lineWeight = round2(clamp(options.lineWeight ?? preset.defaultLineWeight, 0.4, 2.5));
  const intensity = round2(clamp(options.intensity ?? preset.defaultIntensity, 0.35, 2.0));
  const maskRadius = round2(clamp(options.characterMask?.radius ?? DEFAULT_CHARACTER_MASK_RADIUS, 0, Math.floor(Math.min(width, height) * 0.34)));
  const characterMask: ResolvedCharacterMask = {
    cx: round2(clamp(options.characterMask?.cx ?? width * 0.5, 0, width)),
    cy: round2(clamp(options.characterMask?.cy ?? height * 0.45, 0, height)),
    radius: maskRadius,
    enabled: (options.characterMask?.enabled ?? true) && maskRadius > 0,
  };
  const resolvedOptions: ResolvedActionFxOptions = {
    preset: preset.id, width, height, seed, density, vanishingPointX, vanishingPointY,
    vanishingPointPx, angleDeg, lineWeight, intensity, characterMask,
  };
  const rand = createSeededPrng(seed ^ (ACTION_FX_PRESET_IDS.indexOf(preset.id) * 2654435761));
  const primitives = PRESET_GENERATORS[preset.id](resolvedOptions, preset, rand);
  const maskAudit = verifyCharacterMaskClearance(primitives, characterMask);
  const counts = { polygon: 0, polyline: 0, circle: 0, ellipse: 0 };
  for (const item of primitives) counts[item.kind] += 1;

  const draft: ActionFxLayerResult = {
    preset, resolvedOptions, viewBox: `0 0 ${width} ${height}`, primitives, maskAudit,
    metrics: {
      primitiveCount: primitives.length, polygonCount: counts.polygon, polylineCount: counts.polyline,
      circleCount: counts.circle, ellipseCount: counts.ellipse, estimatedSvgBytes: 0,
    },
  };
  return { ...draft, metrics: { ...draft.metrics, estimatedSvgBytes: new TextEncoder().encode(exportActionFxSvg(draft)).byteLength } };
}
