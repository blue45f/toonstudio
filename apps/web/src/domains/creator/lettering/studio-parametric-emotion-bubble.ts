/**
 * Studio Parametric Emotion Bubble — Tooning Plus 초월 8파라미터 감정 말풍선 +
 * 2D Boolean Union 이어진 말풍선 병합/비파괴 분할 순수 코어.
 *
 * - 6종 기본형: `ellipse`, `squircle`, `rectangle`, `self-talk`, `shout`, `thought`
 * - 9종 감정 프리셋: `general`, `daily`, `serious`, `severe`, `action`, `fury`, `comedy`, `romance`, `custom`
 * - 8개 형상 슬라이더: `numPoints`, `sharpness`, `dynamic`, `needleSpace`, `length`, `thickness`, `numCurves`, `convexity`
 * - 이어진 말풍선(`mergedGroupId`): 저장소 `polygon-clipping` 기반 `unionStudioPolygons`로
 *   내부 교차 외곽선을 완전히 제거하고, 분할 시 원본 개별 파라미터를 100% 무손실 복원한다.
 *
 * 전부 순수·결정적 — DOM/Konva/Math.random 의존성 없음.
 */

import {
  unionStudioPolygons,
  type StudioPathPolygon,
  type StudioPathRing,
} from "../studio-path-boolean";
import { BUBBLE_ANCHOR_BLAMBOT_LENGTH_RATIO, BUBBLE_ANCHOR_LENGTH_RANGE } from "./studio-bubble-anchor";
import { clamp, clamp01, formatCoord, mulberry32 } from "./studio-bubble-math";

import type { BubbleVariant } from "../studio-assets";

export const PARAMETRIC_BUBBLE_BASE_SHAPES = [
  "ellipse",
  "squircle",
  "rectangle",
  "self-talk",
  "shout",
  "thought",
] as const;
export type ParametricBubbleBaseShape = (typeof PARAMETRIC_BUBBLE_BASE_SHAPES)[number];

export const PARAMETRIC_BUBBLE_EMOTION_PRESETS = [
  "general",
  "daily",
  "serious",
  "severe",
  "action",
  "fury",
  "comedy",
  "romance",
  "custom",
] as const;
export type ParametricBubbleEmotionPreset = (typeof PARAMETRIC_BUBBLE_EMOTION_PRESETS)[number];

export interface ParametricBubbleGeometryParams {
  /** 꼭지점 개수 (외침/충격 가시, 6..40) */
  readonly numPoints: number;
  /** 뾰족함 (0..1) */
  readonly sharpness: number;
  /** 비대칭 역동성 (0..1) */
  readonly dynamic: number;
  /** 가시·방사선 간 간격 (2..24) */
  readonly needleSpace: number;
  /** 가시·돌기 길이 (0..48) */
  readonly length: number;
  /** 외곽선 두께 (1..10) */
  readonly thickness: number;
  /** 구름·생각 곡선 개수 (6..28) */
  readonly numCurves: number;
  /** 볼록함 (-1..1) */
  readonly convexity: number;
}

export type ParametricBubbleSliderKey = keyof ParametricBubbleGeometryParams;

export interface ParametricBubbleSliderSpec {
  readonly key: ParametricBubbleSliderKey;
  readonly labelKo: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
}

export const PARAMETRIC_BUBBLE_SLIDER_SPECS: readonly ParametricBubbleSliderSpec[] = Object.freeze([
  { key: "numPoints", labelKo: "꼭지점 개수", min: 6, max: 40, step: 1, unit: "개" },
  { key: "sharpness", labelKo: "뾰족함", min: 0, max: 1, step: 0.05, unit: "" },
  { key: "dynamic", labelKo: "역동성", min: 0, max: 1, step: 0.05, unit: "" },
  { key: "needleSpace", labelKo: "가시 간격", min: 2, max: 24, step: 1, unit: "px" },
  { key: "length", labelKo: "가시 길이", min: 0, max: 48, step: 1, unit: "px" },
  { key: "thickness", labelKo: "선 두께", min: 1, max: 10, step: 0.5, unit: "px" },
  { key: "numCurves", labelKo: "곡선 개수", min: 6, max: 28, step: 1, unit: "개" },
  { key: "convexity", labelKo: "볼록함", min: -1, max: 1, step: 0.05, unit: "" },
]);

export interface ParametricBubbleShapeMeta {
  readonly id: ParametricBubbleBaseShape;
  readonly labelKo: string;
  readonly studioVariant: BubbleVariant;
}

export const PARAMETRIC_BUBBLE_SHAPE_META: readonly ParametricBubbleShapeMeta[] = Object.freeze([
  { id: "ellipse", labelKo: "원형", studioVariant: "speech" },
  { id: "squircle", labelKo: "스쿼클", studioVariant: "speech" },
  { id: "rectangle", labelKo: "사각", studioVariant: "box" },
  { id: "self-talk", labelKo: "혼잣말", studioVariant: "whisper" },
  { id: "shout", labelKo: "외침", studioVariant: "shout" },
  { id: "thought", labelKo: "생각", studioVariant: "thought" },
]);

export interface ParametricBubblePresetMeta {
  readonly id: ParametricBubbleEmotionPreset;
  readonly labelKo: string;
  readonly recommendedShape: ParametricBubbleBaseShape;
  readonly dashed: boolean;
  readonly geometryParams: ParametricBubbleGeometryParams;
}

function definePreset(
  id: ParametricBubbleEmotionPreset,
  labelKo: string,
  recommendedShape: ParametricBubbleBaseShape,
  dashed: boolean,
  p: readonly [number, number, number, number, number, number, number, number],
): ParametricBubblePresetMeta {
  return Object.freeze({
    id,
    labelKo,
    recommendedShape,
    dashed,
    geometryParams: Object.freeze({
      numPoints: p[0],
      sharpness: p[1],
      dynamic: p[2],
      needleSpace: p[3],
      length: p[4],
      thickness: p[5],
      numCurves: p[6],
      convexity: p[7],
    }),
  });
}

export const PARAMETRIC_BUBBLE_PRESET_TABLE: Readonly<
  Record<ParametricBubbleEmotionPreset, ParametricBubblePresetMeta>
> = Object.freeze({
  general: definePreset("general", "일반", "ellipse", false, [16, 0.15, 0.05, 10, 6, 2.5, 12, 0.25]),
  daily: definePreset("daily", "일상", "squircle", false, [14, 0.1, 0.1, 12, 8, 2, 10, 0.45]),
  serious: definePreset("serious", "진지함", "rectangle", false, [18, 0.4, 0.15, 8, 12, 3, 12, -0.1]),
  severe: definePreset("severe", "심각함", "self-talk", false, [26, 0.65, 0.35, 5, 20, 2.5, 16, -0.35]),
  action: definePreset("action", "액션", "shout", false, [22, 0.8, 0.65, 7, 28, 3.5, 14, -0.45]),
  fury: definePreset("fury", "분노", "shout", false, [32, 0.95, 0.85, 4, 36, 4.5, 18, -0.75]),
  comedy: definePreset("comedy", "코미디", "thought", false, [16, 0.25, 0.55, 9, 16, 2.5, 14, 0.75]),
  romance: definePreset("romance", "설렘", "thought", true, [14, 0.05, 0.2, 14, 14, 2, 16, 0.85]),
  custom: definePreset("custom", "사용자 지정", "ellipse", false, [20, 0.5, 0.3, 8, 18, 2.5, 14, 0.3]),
});

export interface ParametricBubbleTail {
  readonly visible: boolean;
  readonly targetCanvasPos: readonly [number, number];
  readonly curveBias: number;
}

export interface ParametricEmotionBubble {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly baseShape: ParametricBubbleBaseShape;
  readonly emotionPreset: ParametricBubbleEmotionPreset;
  readonly geometryParams: ParametricBubbleGeometryParams;
  readonly tail: ParametricBubbleTail;
  readonly seed?: number;
  readonly text?: string;
  readonly mergedGroupId?: string;
}

export interface ParametricBubbleBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ParametricBubbleGeometryResult {
  readonly localRing: StudioPathRing;
  readonly canvasRing: StudioPathRing;
  readonly bodyPathD: string;
  readonly tailPathD: string;
  readonly needlePathsD: readonly string[];
  readonly strokeWidth: number;
  readonly strokeDasharray?: string;
  readonly bounds: ParametricBubbleBounds;
}

export interface ParametricBubbleMergedGroup {
  readonly groupId: string;
  /** 분할 시 원본 개별 파라미터·좌표·꼬리 설정을 100% 무손실 복원하는 스냅샷. */
  readonly members: readonly ParametricEmotionBubble[];
  readonly unionPolygons: readonly StudioPathPolygon[];
  readonly unionPathD: string;
  readonly tailPathsD: readonly string[];
  readonly needlePathsD: readonly string[];
  readonly strokeWidth: number;
  readonly isSingleConnectedOutline: boolean;
  readonly bounds: ParametricBubbleBounds;
}

export type ParametricBubbleMergeResult =
  | {
      readonly ok: true;
      readonly group: ParametricBubbleMergedGroup;
      readonly taggedMembers: readonly ParametricEmotionBubble[];
    }
  | { readonly ok: false; readonly reason: string };

export interface MergeParametricBubbleOptions {
  readonly groupId?: string;
  /** 기본 `true` — 이어진 말풍선으로 내부 교차선이 실제로 합쳐지도록 겹침을 요구한다. */
  readonly requireOverlap?: boolean;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function hashStringSeed(input: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeParametricGeometryParams(
  raw: Partial<ParametricBubbleGeometryParams>,
  fallback: ParametricBubbleGeometryParams = PARAMETRIC_BUBBLE_PRESET_TABLE.general.geometryParams,
): ParametricBubbleGeometryParams {
  return Object.freeze({
    numPoints: Math.round(clamp(finiteOr(raw.numPoints, fallback.numPoints), 6, 40)),
    sharpness: round2(clamp01(finiteOr(raw.sharpness, fallback.sharpness))),
    dynamic: round2(clamp01(finiteOr(raw.dynamic, fallback.dynamic))),
    needleSpace: Math.round(clamp(finiteOr(raw.needleSpace, fallback.needleSpace), 2, 24)),
    length: round2(clamp(finiteOr(raw.length, fallback.length), 0, 48)),
    thickness: round2(clamp(finiteOr(raw.thickness, fallback.thickness), 1, 10)),
    numCurves: Math.round(clamp(finiteOr(raw.numCurves, fallback.numCurves), 6, 28)),
    convexity: round2(clamp(finiteOr(raw.convexity, fallback.convexity), -1, 1)),
  });
}

export function mapParametricShapeToBubbleVariant(
  shape: ParametricBubbleBaseShape,
  preset: ParametricBubbleEmotionPreset = "general",
): BubbleVariant {
  if (preset === "fury" || shape === "shout") return "shout";
  if (shape === "thought") return "thought";
  if (shape === "rectangle") return "box";
  if (shape === "self-talk" || preset === "romance") return "whisper";
  return "speech";
}

export function createParametricEmotionBubble(
  overrides: Partial<Omit<ParametricEmotionBubble, "geometryParams" | "tail">> & {
    readonly geometryParams?: Partial<ParametricBubbleGeometryParams>;
    readonly tail?: Partial<ParametricBubbleTail>;
  } = {},
): ParametricEmotionBubble {
  const emotionPreset = overrides.emotionPreset ?? "general";
  const presetMeta = PARAMETRIC_BUBBLE_PRESET_TABLE[emotionPreset];
  const baseShape = overrides.baseShape ?? presetMeta.recommendedShape;
  const x = finiteOr(overrides.x, 20);
  const y = finiteOr(overrides.y, 20);
  const width = Math.max(60, finiteOr(overrides.width, 220));
  const height = Math.max(48, finiteOr(overrides.height, 130));
  const tailTarget: readonly [number, number] = overrides.tail?.targetCanvasPos ?? [
    round2(x + width * 0.35),
    round2(y + height + 54),
  ];

  return Object.freeze({
    id: overrides.id ?? "parametric-bubble-1",
    x,
    y,
    width,
    height,
    baseShape,
    emotionPreset,
    geometryParams: normalizeParametricGeometryParams(
      overrides.geometryParams ?? {},
      presetMeta.geometryParams,
    ),
    tail: Object.freeze({
      visible: overrides.tail?.visible ?? baseShape !== "self-talk",
      targetCanvasPos: Object.freeze([tailTarget[0], tailTarget[1]] as const),
      curveBias: round2(clamp(finiteOr(overrides.tail?.curveBias, 0.2), -1, 1)),
    }),
    ...(overrides.seed !== undefined ? { seed: overrides.seed } : {}),
    ...(overrides.text !== undefined ? { text: overrides.text } : {}),
    ...(overrides.mergedGroupId !== undefined ? { mergedGroupId: overrides.mergedGroupId } : {}),
  });
}

export function applyParametricEmotionPreset(
  bubble: ParametricEmotionBubble,
  preset: ParametricBubbleEmotionPreset,
  syncBaseShape = true,
): ParametricEmotionBubble {
  const meta = PARAMETRIC_BUBBLE_PRESET_TABLE[preset];
  return Object.freeze({
    ...bubble,
    emotionPreset: preset,
    baseShape: syncBaseShape ? meta.recommendedShape : bubble.baseShape,
    geometryParams: normalizeParametricGeometryParams(meta.geometryParams),
  });
}

function ringToSvgPath(ring: StudioPathRing): string {
  if (ring.length === 0) return "";
  return `${ring.map(([px, py], i) => `${i === 0 ? "M" : "L"} ${formatCoord(px)} ${formatCoord(py)}`).join(" ")} Z`;
}

function buildSuperEllipseRing(
  width: number,
  height: number,
  params: ParametricBubbleGeometryParams,
  rand: () => number,
  mode: "ellipse" | "squircle",
): StudioPathRing {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(8, width / 2 - params.thickness - 2);
  const ry = Math.max(8, height / 2 - params.thickness - 2);
  const steps = 64;
  const phase = rand() * Math.PI * 2;
  const exponent =
    mode === "squircle"
      ? clamp(4.2 + params.convexity * 2.2 + params.sharpness * 2.0, 2.2, 9.0)
      : clamp(2 + params.convexity * 0.65, 1.35, 3.2);
  const waveFreq = mode === "squircle" ? 4 : Math.max(4, Math.round(params.numCurves * 0.5));
  const ring: StudioPathRing = [];

  for (let i = 0; i < steps; i += 1) {
    const theta = (i / steps) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const baseScale =
      mode === "squircle"
        ? 1 + params.dynamic * 0.06 * Math.sin(theta * waveFreq + phase)
        : 1
          + params.dynamic * 0.08 * Math.sin(theta * waveFreq + phase)
          - params.sharpness * 0.05 * Math.abs(Math.sin((theta * params.numPoints) / 2));
    const sx = Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / exponent);
    const sy = Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / exponent);
    ring.push([round2(cx + rx * sx * baseScale), round2(cy + ry * sy * baseScale)]);
  }
  return ring;
}

function buildRectangleRing(
  width: number,
  height: number,
  params: ParametricBubbleGeometryParams,
  rand: () => number,
): StudioPathRing {
  const inset = params.thickness + 3;
  const w = Math.max(16, width - inset * 2);
  const h = Math.max(16, height - inset * 2);
  const maxCorner = Math.min(w, h) * 0.32;
  const radius = clamp(
    maxCorner * (0.45 + params.convexity * 0.45) * (1 - params.sharpness * 0.85),
    0,
    maxCorner,
  );
  const cornerSegs = radius > 0.5 ? 6 : 1;
  const basePts: StudioPathRing = [];
  const pushArc = (cx: number, cy: number, startAngle: number): void => {
    if (radius <= 0.5) {
      basePts.push([cx, cy]);
      return;
    }
    for (let i = 0; i <= cornerSegs; i += 1) {
      const a = startAngle + ((Math.PI / 2) * i) / cornerSegs;
      basePts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
  };
  pushArc(inset + radius, inset + radius, Math.PI);
  pushArc(inset + w - radius, inset + radius, -Math.PI / 2);
  pushArc(inset + w - radius, inset + h - radius, 0);
  pushArc(inset + radius, inset + h - radius, Math.PI / 2);

  if (params.dynamic <= 0.01) return basePts.map(([px, py]) => [round2(px), round2(py)]);
  const amp = params.dynamic * Math.min(6, params.length * 0.2 + 2);
  const out: StudioPathRing = [];
  for (let i = 0; i < basePts.length; i += 1) {
    const [ax, ay] = basePts[i]!;
    const [bx, by] = basePts[(i + 1) % basePts.length]!;
    out.push([round2(ax), round2(ay)]);
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen > 24) {
      const jitter = (rand() - 0.5) * 2 * amp;
      out.push([
        round2((ax + bx) / 2 - ((by - ay) / segLen) * jitter),
        round2((ay + by) / 2 + ((bx - ax) / segLen) * jitter),
      ]);
    }
  }
  return out;
}

function buildShoutRing(
  width: number,
  height: number,
  params: ParametricBubbleGeometryParams,
  rand: () => number,
): StudioPathRing {
  const cx = width / 2;
  const cy = height / 2;
  const maxSpike = Math.min(params.length, Math.min(width, height) * 0.34);
  const outerRx = Math.max(12, width / 2 - params.thickness - 2);
  const outerRy = Math.max(12, height / 2 - params.thickness - 2);
  const valleyDepth = clamp(
    0.12 + maxSpike / Math.max(24, Math.min(width, height)) + params.sharpness * 0.16,
    0.08,
    0.52,
  );
  const points = params.numPoints;
  const angleStep = (Math.PI * 2) / points;
  const spaceBias = clamp((params.needleSpace - 2) / 22, 0, 1);
  const ring: StudioPathRing = [];

  for (let i = 0; i < points; i += 1) {
    const baseAngle = i * angleStep;
    const tipAngle = baseAngle + (rand() - 0.5) * angleStep * 0.45 * params.dynamic;
    const tipScale = 1 + (rand() - 0.5) * 0.22 * params.dynamic;
    const valleyAngle = baseAngle + angleStep * (0.42 + spaceBias * 0.16);
    const valleyScale = clamp(
      1 - valleyDepth * (1 - params.convexity * 0.25) + (rand() - 0.5) * 0.12 * params.dynamic,
      0.38,
      0.96,
    );
    ring.push([round2(cx + outerRx * tipScale * Math.cos(tipAngle)), round2(cy + outerRy * tipScale * Math.sin(tipAngle))]);
    if (params.convexity < -0.25) {
      const midAngle = (tipAngle + valleyAngle) / 2;
      const midScale = (tipScale + valleyScale) / 2 - Math.abs(params.convexity) * 0.05;
      ring.push([round2(cx + outerRx * midScale * Math.cos(midAngle)), round2(cy + outerRy * midScale * Math.sin(midAngle))]);
    }
    ring.push([round2(cx + outerRx * valleyScale * Math.cos(valleyAngle)), round2(cy + outerRy * valleyScale * Math.sin(valleyAngle))]);
  }
  return ring;
}

function buildThoughtRing(
  width: number,
  height: number,
  params: ParametricBubbleGeometryParams,
  rand: () => number,
): StudioPathRing {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(12, width / 2 - params.thickness - 8);
  const ry = Math.max(12, height / 2 - params.thickness - 8);
  const lobes = params.numCurves;
  const puffAmp = clamp(0.06 + (params.length / 48) * 0.14 + Math.max(0, params.convexity) * 0.12, 0.04, 0.3);
  const lobeFactors = Array.from({ length: lobes }, () => 1 + (rand() - 0.5) * 0.28 * params.dynamic);
  const ring: StudioPathRing = [];

  for (let i = 0; i < lobes; i += 1) {
    const startAngle = (i / lobes) * Math.PI * 2;
    const endAngle = ((i + 1) / lobes) * Math.PI * 2;
    const lobeScale = lobeFactors[i]!;
    for (let s = 0; s < 4; s += 1) {
      const t = s / 4;
      const theta = startAngle + (endAngle - startAngle) * t;
      const arch = Math.pow(Math.sin(t * Math.PI), 1 - params.sharpness * 0.45);
      const rScale = 1 - puffAmp * 0.35 + puffAmp * lobeScale * arch;
      ring.push([round2(cx + rx * rScale * Math.cos(theta)), round2(cy + ry * rScale * Math.sin(theta))]);
    }
  }
  return ring;
}

function buildSelfTalkRingAndNeedles(
  width: number,
  height: number,
  params: ParametricBubbleGeometryParams,
  rand: () => number,
): { readonly ring: StudioPathRing; readonly needlePathsD: readonly string[] } {
  const cx = width / 2;
  const cy = height / 2;
  const needleLen = Math.min(params.length, Math.min(width, height) * 0.25);
  const rx = Math.max(12, width / 2 - needleLen - params.thickness - 2);
  const ry = Math.max(12, height / 2 - needleLen - params.thickness - 2);
  const pad = params.thickness + 2;
  const ring = buildSuperEllipseRing(rx * 2 + pad * 2, ry * 2 + pad * 2, params, rand, "ellipse").map(
    ([px, py]): [number, number] => [round2(px + (cx - (rx + pad))), round2(py + (cy - (ry + pad)))],
  );
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const count = Math.round(clamp(perimeter / Math.max(2, params.needleSpace), 12, 96));
  const needles: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const effectiveLen = Math.max(3, needleLen * (1 + (rand() - 0.5) * 0.5 * params.dynamic));
    const innerR = 1 - params.sharpness * 0.08;
    needles.push(
      `M ${formatCoord(cx + rx * innerR * cosT)} ${formatCoord(cy + ry * innerR * sinT)} `
      + `L ${formatCoord(cx + (rx + effectiveLen) * cosT)} ${formatCoord(cy + (ry + effectiveLen) * sinT)}`,
    );
  }
  return { ring, needlePathsD: Object.freeze(needles) };
}

function buildParametricTailPath(bubble: ParametricEmotionBubble): string {
  if (!bubble.tail.visible) return "";
  const cx = bubble.x + bubble.width / 2;
  const cy = bubble.y + bubble.height / 2;
  const [rawTipX, rawTipY] = bubble.tail.targetCanvasPos;
  const angle = Math.atan2(rawTipY - cy, rawTipX - cx);
  const edgeX = cx + Math.cos(angle) * (bubble.width * 0.44);
  const edgeY = cy + Math.sin(angle) * (bubble.height * 0.44);
  const clampedDist = clamp(
    Math.round(Math.hypot(rawTipX - edgeX, rawTipY - edgeY) * BUBBLE_ANCHOR_BLAMBOT_LENGTH_RATIO),
    BUBBLE_ANCHOR_LENGTH_RANGE.min,
    BUBBLE_ANCHOR_LENGTH_RANGE.max,
  );
  const tipX = edgeX + Math.cos(angle) * clampedDist;
  const tipY = edgeY + Math.sin(angle) * clampedDist;

  if (bubble.baseShape === "thought") {
    return [1, 2, 3]
      .map((i) => {
        const t = i / 4;
        const dotX = edgeX + (tipX - edgeX) * t;
        const dotY = edgeY + (tipY - edgeY) * t;
        const r = Math.max(2.5, 7.5 * (1 - t * 0.65));
        return (
          `M ${formatCoord(dotX - r)} ${formatCoord(dotY)} `
          + `A ${formatCoord(r)} ${formatCoord(r)} 0 1 0 ${formatCoord(dotX + r)} ${formatCoord(dotY)} `
          + `A ${formatCoord(r)} ${formatCoord(r)} 0 1 0 ${formatCoord(dotX - r)} ${formatCoord(dotY)} Z`
        );
      })
      .join(" ");
  }

  const perp = angle + Math.PI / 2;
  const halfBase = clamp(Math.min(bubble.width, bubble.height) * 0.08, 6, 18);
  const b1x = edgeX + Math.cos(perp) * halfBase;
  const b1y = edgeY + Math.sin(perp) * halfBase;
  const b2x = edgeX - Math.cos(perp) * halfBase;
  const b2y = edgeY - Math.sin(perp) * halfBase;

  if (bubble.baseShape === "shout" || bubble.emotionPreset === "fury") {
    const mid1X = (edgeX + tipX) * 0.5 + Math.cos(perp) * 10;
    const mid1Y = (edgeY + tipY) * 0.5 + Math.sin(perp) * 10;
    const mid2X = (edgeX + tipX) * 0.5 - Math.cos(perp) * 6;
    const mid2Y = (edgeY + tipY) * 0.5 - Math.sin(perp) * 6;
    return `M ${formatCoord(b1x)} ${formatCoord(b1y)} L ${formatCoord(mid1X)} ${formatCoord(mid1Y)} L ${formatCoord(tipX)} ${formatCoord(tipY)} L ${formatCoord(mid2X)} ${formatCoord(mid2Y)} L ${formatCoord(b2x)} ${formatCoord(b2y)} Z`;
  }

  const biasOffset = bubble.tail.curveBias * Math.min(28, clampedDist * 0.45);
  const ctrlX = (edgeX + tipX) / 2 + Math.cos(perp) * biasOffset;
  const ctrlY = (edgeY + tipY) / 2 + Math.sin(perp) * biasOffset;
  return `M ${formatCoord(b1x)} ${formatCoord(b1y)} Q ${formatCoord(ctrlX)} ${formatCoord(ctrlY)} ${formatCoord(tipX)} ${formatCoord(tipY)} Q ${formatCoord(ctrlX)} ${formatCoord(ctrlY)} ${formatCoord(b2x)} ${formatCoord(b2y)} Z`;
}

function computeRingsBounds(rings: readonly StudioPathRing[]): ParametricBubbleBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (const [px, py] of ring) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  if (!Number.isFinite(minX)) return Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
  return Object.freeze({
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  });
}

/** 단일 8파라미터 감정 말풍선의 로컬/캔버스 폴리곤 링, SVG 패스, 꼬리·방사선 패스를 생성한다. */
export function generateParametricBubbleGeometry(
  bubble: ParametricEmotionBubble,
): ParametricBubbleGeometryResult {
  const params = normalizeParametricGeometryParams(bubble.geometryParams);
  const rand = mulberry32(bubble.seed ?? hashStringSeed(bubble.id));
  const presetMeta = PARAMETRIC_BUBBLE_PRESET_TABLE[bubble.emotionPreset];

  let localRing: StudioPathRing;
  let needlePathsD: readonly string[] = [];
  if (bubble.baseShape === "squircle") {
    localRing = buildSuperEllipseRing(bubble.width, bubble.height, params, rand, "squircle");
  } else if (bubble.baseShape === "rectangle") {
    localRing = buildRectangleRing(bubble.width, bubble.height, params, rand);
  } else if (bubble.baseShape === "shout") {
    localRing = buildShoutRing(bubble.width, bubble.height, params, rand);
  } else if (bubble.baseShape === "thought") {
    localRing = buildThoughtRing(bubble.width, bubble.height, params, rand);
  } else if (bubble.baseShape === "self-talk") {
    const built = buildSelfTalkRingAndNeedles(bubble.width, bubble.height, params, rand);
    localRing = built.ring;
    needlePathsD = built.needlePathsD;
  } else {
    localRing = buildSuperEllipseRing(bubble.width, bubble.height, params, rand, "ellipse");
  }

  const canvasRing: StudioPathRing = localRing.map(([px, py]) => [
    round2(px + bubble.x),
    round2(py + bubble.y),
  ]);
  const canvasNeedles = needlePathsD.map((d) =>
    d.replace(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_m, cmd: string, sx: string, sy: string) =>
      `${cmd} ${formatCoord(Number(sx) + bubble.x)} ${formatCoord(Number(sy) + bubble.y)}`,
    ),
  );

  return Object.freeze({
    localRing,
    canvasRing,
    bodyPathD: ringToSvgPath(canvasRing),
    tailPathD: buildParametricTailPath(bubble),
    needlePathsD: Object.freeze(canvasNeedles),
    strokeWidth: params.thickness,
    ...(presetMeta.dashed ? { strokeDasharray: "7 5" } : {}),
    bounds: computeRingsBounds([canvasRing]),
  });
}

function cloneBubbleWithGroup(
  bubble: ParametricEmotionBubble,
  mergedGroupId: string | undefined,
): ParametricEmotionBubble {
  return Object.freeze({
    ...bubble,
    geometryParams: Object.freeze({ ...bubble.geometryParams }),
    tail: Object.freeze({
      ...bubble.tail,
      targetCanvasPos: Object.freeze([bubble.tail.targetCanvasPos[0], bubble.tail.targetCanvasPos[1]] as const),
    }),
    mergedGroupId,
  });
}

/**
 * 동일 `mergedGroupId` 멤버를 2D Boolean Union(`polygon-clipping`)으로 병합해
 * 내부 교차 외곽선을 제거한 이어진 말풍선 그룹을 생성한다.
 */
export async function mergeParametricEmotionBubbles(
  bubbles: readonly ParametricEmotionBubble[],
  options: MergeParametricBubbleOptions = {},
): Promise<ParametricBubbleMergeResult> {
  if (bubbles.length < 2) {
    return { ok: false, reason: "이어진 말풍선을 만들려면 말풍선 2개 이상이 필요해요." };
  }
  const requireOverlap = options.requireOverlap !== false;
  const resolvedGroupId =
    options.groupId
    ?? bubbles.find((b) => typeof b.mergedGroupId === "string" && b.mergedGroupId.length > 0)?.mergedGroupId
    ?? `merged-bubble-group-${bubbles.map((b) => b.id).join("-")}`;

  const geometries = bubbles.map((bubble) => generateParametricBubbleGeometry(bubble));
  let unionPolygons: StudioPathPolygon[];
  try {
    unionPolygons = await unionStudioPolygons(geometries.map((g): StudioPathPolygon => [g.canvasRing]));
  } catch {
    return { ok: false, reason: "말풍선 합치기 연산이 실패했어요. 위치를 살짝 조정해 다시 시도해 주세요." };
  }
  if (unionPolygons.length === 0) {
    return { ok: false, reason: "합쳐진 외곽선이 비어 있어요." };
  }
  const isSingleConnectedOutline = unionPolygons.length === 1;
  if (requireOverlap && !isSingleConnectedOutline) {
    return {
      ok: false,
      reason: "서로 겹치지 않는 말풍선이 있어요 — 말풍선끼리 겹치게 배치한 뒤 병합해 주세요.",
    };
  }

  const outerRings = unionPolygons.map((poly) => poly[0]!).filter((ring) => ring.length >= 3);
  const taggedMembers = Object.freeze(bubbles.map((b) => cloneBubbleWithGroup(b, resolvedGroupId)));
  const group: ParametricBubbleMergedGroup = Object.freeze({
    groupId: resolvedGroupId,
    members: taggedMembers,
    unionPolygons: Object.freeze(unionPolygons),
    unionPathD: outerRings.map((ring) => ringToSvgPath(ring)).join(" "),
    tailPathsD: Object.freeze(geometries.map((g) => g.tailPathD).filter((d) => d.length > 0)),
    needlePathsD: Object.freeze(geometries.flatMap((g) => g.needlePathsD)),
    strokeWidth: round2(bubbles.reduce((acc, item) => Math.max(acc, item.geometryParams.thickness), 2)),
    isSingleConnectedOutline,
    bounds: computeRingsBounds(outerRings),
  });
  return { ok: true, group, taggedMembers };
}

/** 병합 그룹을 비파괴 분할해 원본 개별 멤버(8파라미터·좌표·꼬리)를 100% 무손실 복원한다. */
export function splitParametricEmotionBubbleGroup(
  group: ParametricBubbleMergedGroup,
): readonly ParametricEmotionBubble[] {
  return Object.freeze(group.members.map((member) => cloneBubbleWithGroup(member, undefined)));
}

/** 병합 그룹 내 특정 멤버를 수정하고 Boolean Union 외곽선을 실시간 재계산한다. */
export async function updateParametricBubbleInGroup(
  group: ParametricBubbleMergedGroup,
  memberId: string,
  updater: (member: ParametricEmotionBubble) => ParametricEmotionBubble,
  options: Omit<MergeParametricBubbleOptions, "groupId"> = {},
): Promise<ParametricBubbleMergeResult> {
  const nextMembers = group.members.map((m) => (m.id === memberId ? updater(m) : m));
  return mergeParametricEmotionBubbles(nextMembers, { ...options, groupId: group.groupId });
}

/** 말풍선 배열에서 동일한 `mergedGroupId`를 공유하는 멤버 묶음을 수집한다. */
export function collectParametricMergedGroups(
  bubbles: readonly ParametricEmotionBubble[],
): Map<string, ParametricEmotionBubble[]> {
  const groups = new Map<string, ParametricEmotionBubble[]>();
  for (const bubble of bubbles) {
    if (!bubble.mergedGroupId) continue;
    const list = groups.get(bubble.mergedGroupId) ?? [];
    list.push(bubble);
    groups.set(bubble.mergedGroupId, list);
  }
  return groups;
}
