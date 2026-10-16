/**
 * 면 모델링 화면의 순수 규칙 모음: 거리 문자열 해석, 도구별 부호·범위 검증, 키보드 한 단계,
 * 핸들 좌표 변환, 그리기 패드의 좌표 변환과 격자 스냅.
 *
 * React와 뷰포트를 모르므로 값만으로 시험할 수 있다. 사용자에게 보이는 문구는 이 모듈이 돌려주는
 * 판정 코드를 messages 모듈이 이중 언어 문구로 바꾼다. 거리의 단위는 항상 미터(m)다.
 */

import { STUDIO_FACE_MODELING_LIMITS } from "./studio-hybrid-dcc-face-modeling-mesh";
import { parseStudioHybridDccPrecisionInput } from "./studio-hybrid-dcc-precision-input";

import type { StudioPlanarPoint } from "./studio-hybrid-dcc-face-modeling-geometry";
import type { StudioFaceModelingTool } from "./studio-hybrid-dcc-face-modeling-workspace";

export type StudioFaceModelingDistanceTool = Exclude<StudioFaceModelingTool, "draw">;
export type StudioFaceModelingStepScale = "fine" | "normal" | "coarse";

/** 도구 해상도(0.1 mm). 입력과 표시는 이 자릿수까지만 의미가 있다. */
const RESOLUTION = STUDIO_FACE_MODELING_LIMITS.minDistance;
/** 끝값 비교에 쓰는 부동소수점 여유. 해상도의 1/10이라 눈에 보이는 차이는 만들지 않는다. */
const TOLERANCE = RESOLUTION / 10;

export interface StudioFaceModelingDistanceBounds {
  readonly min: number;
  readonly max: number;
}

/** 커널이 알려 준 허용 구간과, 그것에서 파생한 입력 구간·핸들 구간. */
export interface StudioFaceModelingRangeView {
  /** 입력할 수 있는 구간. 끝값은 도구 해상도로 안쪽에 다듬어 항상 유효하다. */
  readonly allowed: StudioFaceModelingDistanceBounds;
  /** 핸들이 오가는 구간. 허용 구간을 모델 크기의 2배 안으로 줄여 손으로 잡기 좋게 한다. */
  readonly handle: StudioFaceModelingDistanceBounds;
}

function clean(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value: number, bounds: StudioFaceModelingDistanceBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

/** 0에서 멀어지지 않는 쪽으로(안쪽으로) 해상도 배수에 맞춘다. */
function towardZero(value: number): number {
  const steps = Math.floor(Math.abs(value) / RESOLUTION + 1e-9);
  return clean(Math.sign(value) * steps * RESOLUTION);
}

/** 1-2-5 열에 가장 가까운, 해상도 이상의 눈금 크기. */
export function niceStudioFaceModelingStep(target: number): number {
  if (!(target > 0) || !Number.isFinite(target)) return RESOLUTION;
  const scale = 10 ** Math.floor(Math.log10(target));
  const base = target / scale;
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return Math.max(RESOLUTION, Number((nice * scale).toPrecision(6)));
}

export function studioFaceModelingRangeView(
  range: { readonly minDistance: number; readonly maxDistance: number },
  extent: number,
): StudioFaceModelingRangeView {
  const allowed = {
    min: towardZero(Math.min(0, range.minDistance)),
    max: towardZero(Math.max(0, range.maxDistance)),
  };
  const reach = towardZero(Math.max(RESOLUTION * 10, extent * 2));
  return {
    allowed,
    handle: { min: Math.max(allowed.min, -reach), max: Math.min(allowed.max, reach) },
  };
}

export type StudioFaceModelingParse =
  | { readonly kind: "empty" }
  | { readonly kind: "value"; readonly value: number }
  | { readonly kind: "invalid" };

/** 거리 문자열을 미터 값으로 읽는다. 단위를 생략하면 m이고, 사칙연산·괄호·cm·mm를 쓸 수 있다. */
export function parseStudioFaceModelingDistance(text: string): StudioFaceModelingParse {
  if (text.trim() === "") return { kind: "empty" };
  try {
    return { kind: "value", value: parseStudioHybridDccPrecisionInput(text, "length") };
  } catch {
    return { kind: "invalid" };
  }
}

export type StudioFaceModelingDistanceCheck =
  | { readonly ok: true; readonly distance: number }
  | { readonly ok: false; readonly reason: "zero" | "negative-not-allowed" }
  | { readonly ok: false; readonly reason: "above-max" | "below-min"; readonly limit: number }
  | { readonly ok: false; readonly reason: "no-room"; readonly side: "push" | "pull" };

/**
 * 도구별 부호·범위 규칙. 밀기/당기기만 음수(당기기)를 허용하고, 안쪽 테두리와 오프셋은 0보다 큰
 * 값만 받는다. `limit`은 사용자에게 보여 줄 양수 한계다(당김 한계도 깊이로 양수).
 */
export function checkStudioFaceModelingDistance(
  tool: StudioFaceModelingDistanceTool,
  distance: number,
  allowed: StudioFaceModelingDistanceBounds,
): StudioFaceModelingDistanceCheck {
  if (Math.abs(distance) < RESOLUTION / 2) return { ok: false, reason: "zero" };
  if (distance < 0 && tool !== "push-pull") return { ok: false, reason: "negative-not-allowed" };
  if (distance > 0 && allowed.max < RESOLUTION) return { ok: false, reason: "no-room", side: "push" };
  if (distance < 0 && allowed.min > -RESOLUTION) return { ok: false, reason: "no-room", side: "pull" };
  if (distance > allowed.max + TOLERANCE) return { ok: false, reason: "above-max", limit: allowed.max };
  if (distance < allowed.min - TOLERANCE) return { ok: false, reason: "below-min", limit: -allowed.min };
  return { ok: true, distance };
}

/** 화살표 한 번의 기본 크기. 모델이 클수록 커지고 1-2-5 열에 맞춘다. */
export function studioFaceModelingStepSize(extent: number): number {
  return niceStudioFaceModelingStep(extent / 100);
}

/** 키보드 한 단계. Shift는 1/10, PageUp/PageDown은 10배이며 결과는 항상 핸들 구간 안이다. */
export function stepStudioFaceModelingDistance(
  current: number | null,
  direction: 1 | -1,
  scale: StudioFaceModelingStepScale,
  baseStep: number,
  bounds: StudioFaceModelingDistanceBounds,
): number {
  const size = Math.max(
    RESOLUTION,
    scale === "fine" ? baseStep / 10 : scale === "coarse" ? baseStep * 10 : baseStep,
  );
  return clean(clamp((current ?? 0) + direction * size, bounds));
}

/** 거리를 핸들 막대 위의 0~1 위치로. 구간 밖 값은 가장자리에 붙인다. */
export function studioFaceModelingHandleFraction(
  value: number | null,
  bounds: StudioFaceModelingDistanceBounds,
): number {
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return 0;
  return (clamp(value ?? 0, bounds) - bounds.min) / span;
}

/** 막대 위의 0~1 위치를 거리로. 눈금에 붙이되 양 끝은 정확히 구간의 끝값이다. */
export function studioFaceModelingHandleValue(
  fraction: number,
  bounds: StudioFaceModelingDistanceBounds,
): number {
  const span = bounds.max - bounds.min;
  if (!(span > 0) || !Number.isFinite(fraction)) return bounds.min;
  if (fraction <= 0) return bounds.min;
  if (fraction >= 1) return bounds.max;
  const unit = niceStudioFaceModelingStep(span / 200);
  return clean(clamp(Math.round((bounds.min + fraction * span) / unit) * unit, bounds));
}

/** 표시용 거리 문자열: 소수점 넷째 자리까지, 불필요한 0과 `-0`은 없앤다. */
export function formatStudioFaceModelingDistance(value: number): string {
  const trimmed = value.toFixed(4).replace(/\.?0+$/u, "");
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
}

export interface StudioFaceDrawViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface StudioFaceDrawBounds {
  readonly minU: number;
  readonly maxU: number;
  readonly minV: number;
  readonly maxV: number;
}

function outlineBounds(outline: readonly StudioPlanarPoint[]): StudioFaceDrawBounds | null {
  if (outline.length === 0) return null;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const [u, v] of outline) {
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  return { minU, maxU, minV, maxV };
}

/** 윤곽을 모두 담는 SVG 뷰박스. 세로 v는 위쪽이 +라서 SVG y에는 부호를 뒤집어 쓴다. */
export function studioFaceDrawViewBox(outline: readonly StudioPlanarPoint[]): StudioFaceDrawViewBox {
  const bounds = outlineBounds(outline);
  if (!bounds) return { x: -1, y: -1, width: 2, height: 2 };
  const width = bounds.maxU - bounds.minU;
  const height = bounds.maxV - bounds.minV;
  const pad = Math.max(width, height, RESOLUTION) * 0.1;
  return { x: bounds.minU - pad, y: -bounds.maxV - pad, width: width + pad * 2, height: height + pad * 2 };
}

/** 패드 안의 화면 좌표를 면 좌표(u, v)로. SVG의 기본 "가운데 맞춤" 배치(여백 포함)를 그대로 따른다. */
export function studioFaceDrawClientToPoint(
  viewBox: StudioFaceDrawViewBox,
  rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  clientX: number,
  clientY: number,
): StudioPlanarPoint | null {
  if (!(rect.width > 0) || !(rect.height > 0) || !(viewBox.width > 0) || !(viewBox.height > 0)) return null;
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
  const offsetX = (rect.width - viewBox.width * scale) / 2;
  const offsetY = (rect.height - viewBox.height * scale) / 2;
  const x = viewBox.x + (clientX - rect.left - offsetX) / scale;
  const y = viewBox.y + (clientY - rect.top - offsetY) / scale;
  const u = clean(x);
  const v = clean(-y);
  return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null;
}

/** 격자 간격: 면의 짧은 쪽을 약 12칸으로 나눈 1-2-5 눈금. 면 중심이 격자 원점이다. */
export function studioFaceDrawGridStep(outline: readonly StudioPlanarPoint[]): number {
  const bounds = outlineBounds(outline);
  if (!bounds) return niceStudioFaceModelingStep(0.1);
  const shortSide = Math.min(bounds.maxU - bounds.minU, bounds.maxV - bounds.minV);
  return niceStudioFaceModelingStep(shortSide / 12);
}

export function snapStudioFaceDrawPoint(point: StudioPlanarPoint, step: number): StudioPlanarPoint {
  if (!(step > 0)) return point;
  return [clean(Math.round(point[0] / step) * step), clean(Math.round(point[1] / step) * step)];
}

/** 패드 좌표 입력칸 해석(m 단위, 부호 허용). 읽을 수 없으면 null. */
export function parseStudioFaceDrawCoordinate(text: string): number | null {
  const parsed = parseStudioFaceModelingDistance(text);
  return parsed.kind === "value" ? clean(parsed.value) : null;
}
