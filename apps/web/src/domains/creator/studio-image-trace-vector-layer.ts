/**
 * Studio Image Trace — 트레이싱 결과 → 벡터 레이어 주입.
 *
 * 트레이스 브리지는 결과를 채움 DrawEl 로만 착지시켰고, `vector-layer/` 도메인
 * (VectorLayer·VectorStroke, 제어점·선폭 편집·SVG 내보내기)은 받을 그릇이 없었다.
 * 이 모듈이 그 사이를 잇는다: 트레이싱 조각의 폴리곤 정점을 그대로 앵커로 삼아
 * 닫힌 VectorStroke 로 만들고, `createVectorLayer` 로 묶어 벡터 레이어 편집
 * 도구(`vector-stroke-edit`·`vector-control-points`·`VectorStrokeEditor`)가
 * 그대로 다룰 수 있는 값을 돌려준다.
 *
 * 곡선 근사를 쓰지 않는 이유: 트레이싱 윤곽은 로고·소품의 각진 경계가 본질이라
 * Catmull-Rom 으로 둥글리면 모양이 달라진다. 세그먼트는 직선 큐빅(제어점을
 * 1/3·2/3 지점에 배치)으로 만들어 폴리곤과 기하가 정확히 일치하게 하고,
 * 곡선화는 사용자가 제어점을 직접 편집할 때의 몫으로 남긴다.
 *
 * 주의(표현 경계): DrawEl 조각은 키홀 평탄화로 구멍을 표현하지만 VectorStroke 는
 * 단일 닫힌 윤곽이라, 주입된 스트로크는 "편집 가능한 윤곽"이 본질이다. 채움의
 * 짝·홀 렌더 의미가 필요한 내보내기는 기존 DrawEl/SVG 경로가 계속 담당한다.
 * 순수 모듈: DOM/시간/난수 의존이 없고 입력은 변형하지 않는다.
 */

import type { DrawEl } from "./studio-element-model";
import type { StudioImageTraceResult } from "./studio-image-trace";
import {
  createVectorLayer,
  createVectorStroke,
  VECTOR_STROKE_MIN_WIDTH_PX,
  type VectorCubicSegment,
  type VectorLayer,
  type VectorPoint2D,
  type VectorStroke,
} from "./vector-layer/vector-layer-model";

export interface TraceVectorStrokeOptions {
  /** 지정하면 요소의 strokeWidth 대신 이 굵기를 쓴다(px). */
  readonly strokeWidth?: number;
}

export interface TraceVectorLayerInit extends TraceVectorStrokeOptions {
  readonly id: string;
  /** 생략하면 첫 요소 이름에서 원본명을 뽑아 "… · 벡터 레이어"로 만든다. */
  readonly name?: string;
}

export interface StudioTraceVectorLayerConversion {
  readonly layer: VectorLayer;
  readonly convertedCount: number;
  readonly skippedCount: number;
}

/** DrawEl 의 평탄한 [x, y, …] 점열 → 앵커 목록. 연속 중복과 닫힘 반복을 제거한다. */
export function traceElementAnchors(element: Pick<DrawEl, "points">): VectorPoint2D[] {
  const anchors: VectorPoint2D[] = [];
  const points = element.points;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const last = anchors[anchors.length - 1];
    if (last && last.x === x && last.y === y) continue;
    anchors.push({ x, y });
  }
  // 닫힌 링은 첫 정점이 끝에 반복된다 — 앵커로는 한 번만 둔다.
  if (anchors.length > 1) {
    const first = anchors[0]!;
    const last = anchors[anchors.length - 1]!;
    if (first.x === last.x && first.y === last.y) anchors.pop();
  }
  return anchors;
}

/** 앵커 폴리곤 → 닫힌 직선 큐빅 세그먼트(마지막 앵커 → 첫 앵커 구간 포함). */
export function traceAnchorsToClosedSegments(
  anchors: readonly VectorPoint2D[],
): VectorCubicSegment[] {
  const segments: VectorCubicSegment[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors[i]!;
    const b = anchors[(i + 1) % anchors.length]!;
    segments.push({
      p0: { x: a.x, y: a.y },
      p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      p2: { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
      p3: { x: b.x, y: b.y },
    });
  }
  return segments;
}

/**
 * 트레이싱 DrawEl 1개 → 닫힌 VectorStroke. 앵커가 3개 미만(면이 없는 조각)이면 null.
 * 색은 채움색을 우선하고, 채움이 투명이면 선 색을 쓴다 — 트레이싱 조각의 시각
 * 정체성은 채움에 있기 때문이다.
 */
export function traceDrawElementToVectorStroke(
  element: DrawEl,
  options: TraceVectorStrokeOptions = {},
): VectorStroke | null {
  const anchors = traceElementAnchors(element);
  if (anchors.length < 3) return null;
  const segments = traceAnchorsToClosedSegments(anchors);
  const rawWidth = options.strokeWidth ?? element.strokeWidth;
  const width = Number.isFinite(rawWidth)
    ? Math.max(VECTOR_STROKE_MIN_WIDTH_PX, rawWidth)
    : 1;
  const color =
    element.fill && element.fill !== "transparent" ? element.fill : element.stroke;
  return createVectorStroke({
    id: `${element.id}-vector`,
    segments,
    widths: Array.from({ length: segments.length + 1 }, () => width),
    color,
    opacity: element.opacity ?? 1,
    closed: true,
  });
}

function deriveLayerName(elements: readonly DrawEl[]): string {
  const firstName = elements[0]?.name?.trim();
  if (firstName) {
    const source = firstName.split(" · ")[0]?.trim();
    if (source) return `${source} · 벡터 레이어`;
    return "트레이싱 벡터 레이어";
  }
  return "트레이싱 벡터 레이어";
}

/** 트레이싱 DrawEl 목록 → VectorLayer. 변환 불가 조각은 건너뛰고 수를 보고한다. */
export function traceElementsToVectorLayer(
  elements: readonly DrawEl[],
  init: TraceVectorLayerInit,
): StudioTraceVectorLayerConversion {
  const strokes: VectorStroke[] = [];
  let skippedCount = 0;
  for (const element of elements) {
    const stroke = traceDrawElementToVectorStroke(element, init);
    if (stroke) strokes.push(stroke);
    else skippedCount += 1;
  }
  const layer = createVectorLayer({
    id: init.id,
    name: init.name ?? deriveLayerName(elements),
    strokes,
  });
  return Object.freeze({
    layer,
    convertedCount: strokes.length,
    skippedCount,
  });
}

/** 트레이스 브리지 결과 전체를 벡터 레이어로 주입한다. */
export function traceResultToVectorLayer(
  result: Pick<StudioImageTraceResult, "elements">,
  init: TraceVectorLayerInit,
): StudioTraceVectorLayerConversion {
  return traceElementsToVectorLayer(result.elements, init);
}
