/**
 * 둘러싸기(래소) 채우기 — 드래그로 그린 닫힌 경로 안쪽을 채우는 DOM/canvas 무관 엔진 어댑터.
 *
 * 버킷 채우기는 선이 조금만 열려 있어도 색이 새어 나간다. 둘러싸기 채우기는 사용자가 드래그로
 * 둘러싼 경로 자체를 임시 경계로 삼아, 경로 안쪽에서는 기존 선화를 경계로 인식하고 경로 밖으로는
 * 절대 새지 않게 채운다(ibis 둘러싸기 채우기·Krita Enclose and Fill 방식).
 *
 * 실제 픽셀 연산은 기존 고급 채우기 엔진(`applyAdvancedFill`)이 담당한다. 이 모듈은
 *  1) 래소 경로를 다각형 내부 마스크로 래스터화하고,
 *  2) 그 마스크를 엔진의 referenceMask(allow)로, 선화 판정을 alphaBoundary로 번역해 넘기며,
 *  3) 엔진이 요구하는 시드를 내부 픽셀 중에서 결정적으로 고른다.
 * 틈 메우기(closeGapRadius)·영역 조정(areaAdjustment)·누수 가드(maxAreaRatio)는 기존 채우기와
 * 같은 옵션·같은 기본값을 그대로 공유하므로, 채우기 도구 옵션에서 두 기능이 충돌 없이 공존한다.
 *
 * 입력 버퍼(target/referenceImage/points)는 어떤 상태에서도 변경하지 않는다.
 */

import {
  applyAdvancedFill,
  type AdvancedFillAbortLike,
  type AdvancedFillAlphaBoundary,
  type AdvancedFillImageDataLike,
  type AdvancedFillResult,
  type AdvancedFillRgba,
} from "./studio-advanced-fill";

export interface StudioLassoFillPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * 선으로 인식할 기준 이미지 픽셀의 판정 방식.
 * - "visible": 알파가 임계값보다 큰 픽셀을 선으로 본다(별도 선화 레이어 참조 시 기본값).
 * - "transparent": 알파가 임계값 이하인 픽셀을 경계로 본다(엔진 alphaBoundary와 동일 의미).
 * - "none": 선을 무시하고 둘러싼 내부 전체를 채운다.
 */
export type StudioLassoFillLineBoundary = "visible" | "transparent" | "none";

export interface StudioLassoFillOptions {
  /** 선 판정 방식. 기본 "visible". */
  readonly lineBoundary?: StudioLassoFillLineBoundary;
  /** 선 판정에 쓰는 0..255 알파 임계값. 기본 0(조금이라도 보이는 픽셀은 선). */
  readonly lineAlphaThreshold?: number;
  /**
   * 끊어진 선을 이 반경(0..32)으로 닫는다. 기존 채우기의 "틈 메우기"와 같은 옵션이며
   * 호스트가 공유 설정을 그대로 주입한다. 기본 0(엔진 기본값과 동일).
   */
  readonly closeGapRadius?: number;
  /** 양수는 팽창, 음수는 수축(-64..64). 엔진 옵션을 그대로 전달한다. 기본 0. */
  readonly areaAdjustment?: number;
  /** 최종 선택이 전체 캔버스에서 차지할 수 있는 최대 비율(0 초과, 1 이하). 기본 0.85(엔진 기본값). */
  readonly maxAreaRatio?: number;
}

export interface StudioLassoFillRequest {
  readonly target: AdvancedFillImageDataLike;
  /** 생략하면 target을 기준 이미지로 사용한다. */
  readonly referenceImage?: AdvancedFillImageDataLike;
  /** 드래그 경로 점들. 최소 3개, 끝점은 시작점과 달라도 자동으로 닫힌다. */
  readonly points: readonly StudioLassoFillPoint[];
  readonly fill: AdvancedFillRgba;
  readonly options?: StudioLassoFillOptions;
  /** 함수 또는 AbortSignal 호환 객체. 엔진이 연산 도중 주기적으로 확인한다. */
  readonly abort?: AdvancedFillAbortLike | (() => boolean);
}

export interface StudioLassoFillDiagnostics {
  /** 중복 제거 후 사용된 경로 점 수. */
  readonly pointCount: number;
  /** 다각형 내부 픽셀 수(선 픽셀 포함). */
  readonly interiorPixelCount: number;
  /** 엔진에 넘긴 시드. 내부가 비어 있으면 null이며 결과 status는 "empty"가 된다. */
  readonly seed: StudioLassoFillPoint | null;
  readonly lineBoundary: StudioLassoFillLineBoundary;
  readonly closeGapRadius: number;
}

export interface StudioLassoFillResult extends AdvancedFillResult {
  /** 다각형 내부 마스크(0/1). target과 같은 크기. */
  readonly lassoMask: Uint8Array;
  readonly lasso: StudioLassoFillDiagnostics;
}

export const STUDIO_LASSO_FILL_DEFAULTS = Object.freeze({
  lineBoundary: "visible" as StudioLassoFillLineBoundary,
  lineAlphaThreshold: 0,
  closeGapRadius: 0,
  areaAdjustment: 0,
});

function normalizePoints(
  points: readonly StudioLassoFillPoint[],
): StudioLassoFillPoint[] {
  if (!Array.isArray(points)) throw new TypeError("points must be an array of points.");
  const deduped: StudioLassoFillPoint[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!point || typeof point !== "object") {
      throw new TypeError(`points[${index}] must be a point.`);
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError(`points[${index}] must have finite x/y coordinates.`);
    }
    const previous = deduped[deduped.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    deduped.push({ x: point.x, y: point.y });
  }
  // 드래그 종료점이 시작점과 같으면 닫힘 중복을 제거한다(래스터화는 어차피 경로를 닫는다).
  if (deduped.length > 1) {
    const first = deduped[0]!;
    const last = deduped[deduped.length - 1]!;
    if (first.x === last.x && first.y === last.y) deduped.pop();
  }
  if (deduped.length < 3) {
    throw new RangeError("points must contain at least three distinct points to enclose an area.");
  }
  return deduped;
}

/**
 * 다각형 내부를 픽셀 중심 기준으로 래스터화한다(even-odd 규칙).
 * 픽셀 중심 (x+0.5, y+0.5)이 다각형 안쪽일 때만 1이다. 경계에 걸친 픽셀은 중심 판정으로
 * 결정적으로 갈리므로 같은 입력은 항상 같은 마스크를 만든다.
 */
export function rasterizeStudioLassoFillMask(
  points: readonly StudioLassoFillPoint[],
  width: number,
  height: number,
): Uint8Array {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError("width and height must be positive integers.");
  }
  const polygon = normalizePoints(points);
  const mask = new Uint8Array(width * height);
  const edges: Array<readonly [number, number, number, number]> = [];
  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index]!;
    const to = polygon[(index + 1) % polygon.length]!;
    if (from.y !== to.y) edges.push([from.x, from.y, to.x, to.y]);
  }
  if (edges.length === 0) return mask;

  const crossings: number[] = [];
  for (let y = 0; y < height; y++) {
    const centerY = y + 0.5;
    crossings.length = 0;
    for (const [x1, y1, x2, y2] of edges) {
      if ((y1 <= centerY && centerY < y2) || (y2 <= centerY && centerY < y1)) {
        crossings.push(x1 + ((centerY - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    const row = y * width;
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const startX = Math.max(0, Math.ceil(crossings[pair]! - 0.5));
      const endX = Math.min(width - 1, Math.ceil(crossings[pair + 1]! - 0.5) - 1);
      for (let x = startX; x <= endX; x++) mask[row + x] = 1;
    }
  }
  return mask;
}

function isLinePixel(
  reference: AdvancedFillImageDataLike,
  position: number,
  lineBoundary: StudioLassoFillLineBoundary,
  lineAlphaThreshold: number,
): boolean {
  if (lineBoundary === "none") return false;
  const alpha = reference.data[position * 4 + 3]!;
  return lineBoundary === "visible" ? alpha > lineAlphaThreshold : alpha <= lineAlphaThreshold;
}

/**
 * 둘러싸기 채우기를 원자적으로 실행한다. 반환 계약은 엔진과 같다:
 * status가 applied/noop일 때만 mask가 칠해진 결과를 담고, leak-guarded/aborted/empty는
 * imageData를 원본과 같은 내용으로, 최종 mask를 전부 0으로 반환한다.
 */
export function applyStudioLassoFill(request: StudioLassoFillRequest): StudioLassoFillResult {
  if (!request || typeof request !== "object") throw new TypeError("request must be an object.");
  const target = request.target;
  if (!target || typeof target !== "object") throw new TypeError("target must be an image-data object.");
  const reference = request.referenceImage ?? target;

  const lineBoundary = request.options?.lineBoundary ?? STUDIO_LASSO_FILL_DEFAULTS.lineBoundary;
  if (lineBoundary !== "visible" && lineBoundary !== "transparent" && lineBoundary !== "none") {
    throw new TypeError('options.lineBoundary must be "visible", "transparent", or "none".');
  }
  const lineAlphaThreshold =
    request.options?.lineAlphaThreshold ?? STUDIO_LASSO_FILL_DEFAULTS.lineAlphaThreshold;
  if (!Number.isInteger(lineAlphaThreshold) || lineAlphaThreshold < 0 || lineAlphaThreshold > 255) {
    throw new RangeError("options.lineAlphaThreshold must be an integer between 0 and 255.");
  }
  const closeGapRadius =
    request.options?.closeGapRadius ?? STUDIO_LASSO_FILL_DEFAULTS.closeGapRadius;

  const points = normalizePoints(request.points);
  const lassoMask = rasterizeStudioLassoFillMask(points, target.width, target.height);

  // 행 우선 순서로 내부 픽셀을 세면서, 선이 아닌 첫 내부 픽셀을 시드로 고른다(결정적 선택).
  // 선이 아닌 픽셀이 하나도 없으면 첫 내부 픽셀을 넘겨 엔진이 거부→"empty"로 답하게 한다.
  // 기준 이미지 크기가 target과 다르면 선 판정을 건너뛰고, 크기 검증은 엔진이 그대로 던진다.
  const referenceMatches =
    reference.width === target.width &&
    reference.height === target.height &&
    reference.data.length === target.data.length;
  let interiorPixelCount = 0;
  let seed: StudioLassoFillPoint | null = null;
  let fallbackSeed: StudioLassoFillPoint | null = null;
  for (let y = 0; y < target.height; y++) {
    for (let x = 0; x < target.width; x++) {
      const position = y * target.width + x;
      if (!lassoMask[position]) continue;
      interiorPixelCount++;
      if (!fallbackSeed) fallbackSeed = { x, y };
      if (
        !seed &&
        (!referenceMatches || !isLinePixel(reference, position, lineBoundary, lineAlphaThreshold))
      ) {
        seed = { x, y };
      }
    }
  }

  const engineSeed = seed ?? fallbackSeed;
  const alphaBoundary: AdvancedFillAlphaBoundary =
    lineBoundary === "none" ? "none" : lineBoundary;
  const result = applyAdvancedFill({
    target,
    referenceImage: request.referenceImage,
    referenceMask: { data: lassoMask, width: target.width, height: target.height },
    // 내부가 완전히 비어 있으면 어떤 시드도 거부되어 엔진이 "empty"로 답한다.
    seeds: [engineSeed ?? { x: 0, y: 0 }],
    fill: request.fill,
    abort: request.abort,
    options: {
      matchMode: "boundary-only",
      contiguous: false,
      alphaBoundary,
      alphaThreshold: lineAlphaThreshold,
      maskMode: "allow",
      maskThreshold: 0,
      closeGapRadius,
      areaAdjustment: request.options?.areaAdjustment,
      maxAreaRatio: request.options?.maxAreaRatio,
    },
  });

  return {
    ...result,
    lassoMask,
    lasso: {
      pointCount: points.length,
      interiorPixelCount,
      seed: engineSeed,
      lineBoundary,
      closeGapRadius: result.diagnostics.closeGapRadius,
    },
  };
}
