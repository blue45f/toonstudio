/**
 * CSP 4.0 동급 LT 추출 벡터 선화 브러시 팁·필압 테이퍼 스타일 변환기.
 *
 * LT 선화에서 추출된 벡터 레이어(`VectorLayer` / `VectorStroke`) 또는
 * 3D 라인아트 폴리라인(`VectorStrokePath`)에 G펜·거친펜·마루펜·수채펜
 * 브러시 팁과 필압·곡률 기반 선폭 프로파일을 순수 함수로 즉시 적용한다.
 * 모든 노이즈/질감 변조는 스트로크 ID 기반 결정적 해시를 사용한다(Math.random 금지).
 */

import {
  createVectorLayer,
  createVectorStroke,
  VECTOR_STROKE_MIN_WIDTH_PX,
  type VectorBrushShapeId,
  type VectorCubicSegment,
  type VectorLayer,
  type VectorPoint2D,
  type VectorStroke,
} from "../vector-layer/vector-layer-model";

import type { VectorStrokePath } from "../scene-3d/studio-3d-line-art-extractor";

export type LtVectorBrushStyleId = "g-pen" | "rough-pen" | "maru-pen" | "watercolor-pen";

export interface LtVectorBrushStyleProfile {
  readonly id: LtVectorBrushStyleId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly brushShapeId: VectorBrushShapeId;
  /** 기준 선 두께 배율. */
  readonly baseWidthMultiplier: number;
  /** 진입부 테이퍼 구간 비율(0..0.45). */
  readonly startTaperRatio: number;
  /** 말단부 테이퍼 구간 비율(0..0.45). */
  readonly endTaperRatio: number;
  /** 필압 최소 선폭 비율(0..1). */
  readonly minWidthRatio: number;
  /** 필압 최대 선폭 비율(>= minWidthRatio). */
  readonly peakWidthRatio: number;
  /** 곡률이 큰 모서리·윤곽에서의 선폭 강조량(-0.4..0.6). */
  readonly curvatureGain: number;
  /** 결정적 브러시 거칠기 진폭(0..0.35). */
  readonly roughnessJitter: number;
  /** 수채·담채 끝점 잉크 고임(pooling) 강조량(0..0.4). */
  readonly endpointPooling: number;
  /** 캘리그래피 펜촉 각도(도, 0..180). */
  readonly nibAngleDeg: number;
  /** 방향성 펜촉 대비(0..0.6). */
  readonly nibAnisotropy: number;
  /** 기본 불투명도(0..1). */
  readonly opacity: number;
}

export const LT_VECTOR_BRUSH_STYLE_PRESETS: Readonly<
  Record<LtVectorBrushStyleId, LtVectorBrushStyleProfile>
> = Object.freeze({
  "g-pen": Object.freeze({
    id: "g-pen",
    labelKo: "G펜",
    descriptionKo: "진입·말단이 날카롭게 빠지고 중앙 필압 강약이 뚜렷한 웹툰 주선 펜.",
    brushShapeId: "round",
    baseWidthMultiplier: 1.0,
    startTaperRatio: 0.16,
    endTaperRatio: 0.22,
    minWidthRatio: 0.28,
    peakWidthRatio: 1.42,
    curvatureGain: 0.25,
    roughnessJitter: 0.0,
    endpointPooling: 0.0,
    nibAngleDeg: 45,
    nibAnisotropy: 0.08,
    opacity: 1.0,
  }),
  "rough-pen": Object.freeze({
    id: "rough-pen",
    labelKo: "거친펜",
    descriptionKo: "종이결에 잉크가 스치는 미세 요철과 강렬한 필압 변화를 살린 거친 펜.",
    brushShapeId: "flat",
    baseWidthMultiplier: 1.12,
    startTaperRatio: 0.14,
    endTaperRatio: 0.18,
    minWidthRatio: 0.34,
    peakWidthRatio: 1.5,
    curvatureGain: 0.3,
    roughnessJitter: 0.24,
    endpointPooling: 0.04,
    nibAngleDeg: 35,
    nibAnisotropy: 0.28,
    opacity: 0.96,
  }),
  "maru-pen": Object.freeze({
    id: "maru-pen",
    labelKo: "마루펜",
    descriptionKo: "머리카락·눈매·건축 세밀선에 맞는 극세밀 둥근 펜촉 프로파일.",
    brushShapeId: "round",
    baseWidthMultiplier: 0.68,
    startTaperRatio: 0.12,
    endTaperRatio: 0.16,
    minWidthRatio: 0.2,
    peakWidthRatio: 0.94,
    curvatureGain: 0.12,
    roughnessJitter: 0.0,
    endpointPooling: 0.0,
    nibAngleDeg: 45,
    nibAnisotropy: 0.04,
    opacity: 1.0,
  }),
  "watercolor-pen": Object.freeze({
    id: "watercolor-pen",
    labelKo: "수채펜",
    descriptionKo: "부드러운 반투명 잉크와 끝점 안료 고임(pooling)이 살아 있는 담채 선화 펜.",
    brushShapeId: "calligraphy",
    baseWidthMultiplier: 1.08,
    startTaperRatio: 0.08,
    endTaperRatio: 0.1,
    minWidthRatio: 0.56,
    peakWidthRatio: 1.24,
    curvatureGain: -0.08,
    roughnessJitter: 0.1,
    endpointPooling: 0.28,
    nibAngleDeg: 52,
    nibAnisotropy: 0.32,
    opacity: 0.72,
  }),
});

export const LT_VECTOR_BRUSH_STYLE_LIST: readonly LtVectorBrushStyleProfile[] = Object.freeze([
  LT_VECTOR_BRUSH_STYLE_PRESETS["g-pen"],
  LT_VECTOR_BRUSH_STYLE_PRESETS["rough-pen"],
  LT_VECTOR_BRUSH_STYLE_PRESETS["maru-pen"],
  LT_VECTOR_BRUSH_STYLE_PRESETS["watercolor-pen"],
]);

export interface ApplyLtVectorBrushStyleOptions {
  /** 스타일 ID. */
  readonly styleId: LtVectorBrushStyleId;
  /** 기본 선 굵기(px). 생략 시 각 스트로크의 평균 기존 선폭을 유지한다. */
  readonly baseWidthPx?: number;
  /** 필압 강도 배율(0~2). 기본값 1. */
  readonly pressureIntensity?: number;
  /** 선 색상 오버라이드(선택). */
  readonly color?: string;
  /** 불투명도 오버라이드(선택, 0~1). */
  readonly opacityOverride?: number;
}

export interface StyledLtVectorLayerResult {
  readonly style: LtVectorBrushStyleProfile;
  readonly layer: VectorLayer;
  readonly strokeCount: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  readonly avgWidthPx: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 스트로크 ID와 앵커 인덱스로 [-1, 1] 결정적 해시를 계산한다. */
function deterministicSignedNoise(strokeId: string, anchorIndex: number): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < strokeId.length; i += 1) {
    hash ^= strokeId.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= Math.imul(anchorIndex + 1, 2654435761) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822519) >>> 0;
  hash ^= hash >>> 13;
  return ((hash & 0xffff) / 0x7fff) - 1;
}

function extractAnchorPoints(segments: readonly VectorCubicSegment[]): VectorPoint2D[] {
  if (segments.length === 0) return [];
  const anchors: VectorPoint2D[] = [segments[0]!.p0];
  for (const seg of segments) {
    anchors.push(seg.p3);
  }
  return anchors;
}

function computeCumulativeArcRatios(anchors: readonly VectorPoint2D[]): number[] {
  const count = anchors.length;
  if (count === 0) return [];
  if (count === 1) return [0.5];

  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < count; i += 1) {
    const prev = anchors[i - 1]!;
    const curr = anchors[i]!;
    total += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    cum.push(total);
  }
  if (total <= 1e-6) {
    return anchors.map((_, idx) => idx / (count - 1));
  }
  return cum.map((d) => d / total);
}

function computeAnchorCurvature(anchors: readonly VectorPoint2D[], index: number): number {
  if (anchors.length < 3 || index <= 0 || index >= anchors.length - 1) return 0;
  const a = anchors[index - 1]!;
  const b = anchors[index]!;
  const c = anchors[index + 1]!;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 <= 1e-6 || m2 <= 1e-6) return 0;
  const cosTheta = clamp((v1x * v2x + v1y * v2y) / (m1 * m2), -1, 1);
  // 직선이면 0, 90° 꺾이면 0.5, 180° 반전이면 1.0
  return (1 - cosTheta) * 0.5;
}

function computeAnchorDirectionFactor(
  anchors: readonly VectorPoint2D[],
  index: number,
  nibAngleDeg: number,
  anisotropy: number,
): number {
  if (anisotropy <= 0 || anchors.length < 2) return 1;
  const prev = anchors[Math.max(0, index - 1)]!;
  const next = anchors[Math.min(anchors.length - 1, index + 1)]!;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (Math.hypot(dx, dy) <= 1e-6) return 1;
  const strokeAngle = Math.atan2(dy, dx);
  const nibAngle = (nibAngleDeg * Math.PI) / 180;
  const perpStrength = Math.abs(Math.sin(strokeAngle - nibAngle));
  return 1 + (perpStrength - 0.5) * 2 * anisotropy;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * 단일 `VectorStroke`에 지정된 브러시 팁·필압 테이퍼 프로파일을 적용한다.
 */
export function applyBrushStyleToVectorStroke(
  stroke: VectorStroke,
  options: ApplyLtVectorBrushStyleOptions,
): VectorStroke {
  const profile = LT_VECTOR_BRUSH_STYLE_PRESETS[options.styleId];
  const anchors = extractAnchorPoints(stroke.segments);
  const ratios = computeCumulativeArcRatios(anchors);
  const intensity = clamp(
    typeof options.pressureIntensity === "number" && Number.isFinite(options.pressureIntensity)
      ? options.pressureIntensity
      : 1,
    0,
    2,
  );

  const avgExistingWidth = stroke.widths.length > 0
    ? stroke.widths.reduce((sum, w) => sum + w, 0) / stroke.widths.length
    : 1.5;
  const baseWidth = Math.max(
    VECTOR_STROKE_MIN_WIDTH_PX,
    typeof options.baseWidthPx === "number" && Number.isFinite(options.baseWidthPx)
      ? options.baseWidthPx
      : avgExistingWidth,
  );

  const styledWidths = anchors.map((_, index) => {
    const t = ratios[index] ?? 0.5;
    let taperEnvelope = 1;
    if (!stroke.closed) {
      const startFactor = profile.startTaperRatio > 0 ? smoothstep01(t / profile.startTaperRatio) : 1;
      const endFactor = profile.endTaperRatio > 0 ? smoothstep01((1 - t) / profile.endTaperRatio) : 1;
      taperEnvelope = Math.min(startFactor, endFactor);
    }

    // 중앙부 자연 필압 곡선(0..1)
    const midSwell = Math.sin(t * Math.PI);
    const pressureMix = clamp(taperEnvelope * (0.45 + 0.55 * midSwell), 0, 1);
    const dynamicRatio = profile.minWidthRatio + (profile.peakWidthRatio - profile.minWidthRatio) * pressureMix;
    const blendedRatio = 1 + (dynamicRatio - 1) * intensity;

    // 곡률·펜촉 방향·거칠기·수채 끝점 고임 반영
    const curvature = computeAnchorCurvature(anchors, index);
    const curvatureTerm = 1 + curvature * profile.curvatureGain * intensity;
    const directionTerm = computeAnchorDirectionFactor(
      anchors,
      index,
      profile.nibAngleDeg,
      profile.nibAnisotropy * intensity,
    );
    const jitterTerm = profile.roughnessJitter > 0
      ? 1 + deterministicSignedNoise(stroke.id, index) * profile.roughnessJitter * intensity
      : 1;
    const edgeProximity = stroke.closed ? 0 : Math.max(0, 1 - Math.min(t, 1 - t) / 0.18);
    const poolingTerm = 1 + edgeProximity * profile.endpointPooling * intensity;

    const computed = baseWidth
      * profile.baseWidthMultiplier
      * blendedRatio
      * curvatureTerm
      * directionTerm
      * jitterTerm
      * poolingTerm;

    return round3(Math.max(VECTOR_STROKE_MIN_WIDTH_PX, computed));
  });

  return createVectorStroke({
    id: stroke.id,
    segments: stroke.segments,
    widths: styledWidths,
    color: options.color ?? stroke.color,
    brushShapeId: profile.brushShapeId,
    opacity: options.opacityOverride ?? profile.opacity,
    ...(stroke.closed ? { closed: true } : {}),
  });
}

/**
 * `VectorLayer`(LT 벡터 선화 레이어) 전체에 브러시 팁·필압 프로파일을 일괄 적용한다.
 */
export function applyBrushStyleToLtVectorLayer(
  layer: VectorLayer,
  options: ApplyLtVectorBrushStyleOptions,
): StyledLtVectorLayerResult {
  const profile = LT_VECTOR_BRUSH_STYLE_PRESETS[options.styleId];
  const styledStrokes = layer.strokes.map((stroke) => applyBrushStyleToVectorStroke(stroke, options));

  let minWidth = Infinity;
  let maxWidth = 0;
  let sumWidth = 0;
  let countWidth = 0;
  for (const stroke of styledStrokes) {
    for (const w of stroke.widths) {
      if (w < minWidth) minWidth = w;
      if (w > maxWidth) maxWidth = w;
      sumWidth += w;
      countWidth += 1;
    }
  }

  const styledLayer = createVectorLayer({
    id: layer.id,
    name: `${layer.name} · ${profile.labelKo}`,
    strokes: styledStrokes,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
  });

  return {
    style: profile,
    layer: styledLayer,
    strokeCount: styledStrokes.length,
    minWidthPx: countWidth > 0 ? round3(minWidth) : 0,
    maxWidthPx: countWidth > 0 ? round3(maxWidth) : 0,
    avgWidthPx: countWidth > 0 ? round3(sumWidth / countWidth) : 0,
  };
}

/**
 * 3D 라인아트 추출기(`extractVectorStrokesFromEdgeMask`)의 폴리라인 배열을
 * Catmull-Rom 3차 베지어 `VectorLayer`로 변환하고 지정한 브러시 스타일을 즉시 입힌다.
 */
export function styleExtractedLineArtPaths(
  paths: readonly VectorStrokePath[],
  options: ApplyLtVectorBrushStyleOptions & {
    readonly layerId?: string;
    readonly layerName?: string;
  },
): StyledLtVectorLayerResult {
  const rawStrokes: VectorStroke[] = [];
  for (const path of paths) {
    if (path.points.length < 2) continue;
    const pts = path.points;
    const segments: VectorCubicSegment[] = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const pPrev = pts[Math.max(0, i - 1)]!;
      const p0 = pts[i]!;
      const p3 = pts[i + 1]!;
      const pNext = pts[Math.min(pts.length - 1, i + 2)]!;
      segments.push({
        p0: { x: p0.x, y: p0.y },
        p1: { x: round3(p0.x + (p3.x - pPrev.x) / 6), y: round3(p0.y + (p3.y - pPrev.y) / 6) },
        p2: { x: round3(p3.x - (pNext.x - p0.x) / 6), y: round3(p3.y - (pNext.y - p0.y) / 6) },
        p3: { x: p3.x, y: p3.y },
      });
    }
    const baseW = options.baseWidthPx ?? 2.0;
    rawStrokes.push(
      createVectorStroke({
        id: path.id,
        segments,
        widths: pts.map((pt) => Math.max(VECTOR_STROKE_MIN_WIDTH_PX, baseW * (pt.pressure ?? 1))),
        color: options.color ?? "#111111",
        brushShapeId: "round",
        opacity: 1,
        ...(path.isClosed ? { closed: true } : {}),
      }),
    );
  }

  const baseLayer = createVectorLayer({
    id: options.layerId ?? "lt-styled-vector-line",
    name: options.layerName ?? "LT 3D 선화",
    strokes: rawStrokes,
  });

  return applyBrushStyleToLtVectorLayer(baseLayer, options);
}

/**
 * 가변 선폭이 적용된 `VectorLayer`를 필압 리본 폴리곤 SVG 마크업으로 직렬화한다.
 */
export function renderStyledLtVectorLayerToSvg(
  layer: VectorLayer,
  width: number,
  height: number,
): string {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const elements: string[] = [];

  for (const stroke of layer.strokes) {
    const anchors = extractAnchorPoints(stroke.segments);
    if (anchors.length < 2) continue;

    const leftEdge: string[] = [];
    const rightEdge: string[] = [];
    for (let i = 0; i < anchors.length; i += 1) {
      const curr = anchors[i]!;
      const prev = anchors[Math.max(0, i - 1)]!;
      const next = anchors[Math.min(anchors.length - 1, i + 1)]!;
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const mag = Math.hypot(tx, ty) || 1;
      const nx = -ty / mag;
      const ny = tx / mag;
      const halfW = (stroke.widths[i] ?? 1) * 0.5;
      leftEdge.push(`${round3(curr.x + nx * halfW)} ${round3(curr.y + ny * halfW)}`);
      rightEdge.push(`${round3(curr.x - nx * halfW)} ${round3(curr.y - ny * halfW)}`);
    }

    const polygonPoints = [...leftEdge, ...rightEdge.reverse()];
    const d = `M ${polygonPoints[0]} ${polygonPoints.slice(1).map((pt) => `L ${pt}`).join(" ")} Z`;
    elements.push(
      `<path data-stroke-id="${stroke.id}" data-brush="${stroke.brushShapeId}" d="${d}" fill="${stroke.color}" fill-opacity="${round3(stroke.opacity)}" />`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${safeW} ${safeH}" width="${safeW}" height="${safeH}">${elements.join("")}</svg>`;
}
