/**
 * studio-adjustment-executor.ts
 *
 * PSD 미지원 10종 확장 검토(2026-10-14) 판정으로 `StudioAdjustmentKind`에 추가된
 * 6종의 픽셀 실행기: brightness-contrast · exposure · vibrance · invert ·
 * posterize · threshold.
 *
 * 판정 근거 — 6종은 전부 이미 제품 안에 픽셀 실행 의미론이 있었다:
 *  - exposure: `studio-advanced-pixel-filters.ts`의 applyStudioExposureAdjustment
 *    (exposure EV·gamma·offset, 클램프 포함)를 그대로 위임한다.
 *  - vibrance: `studio-vibrance.ts`의 applyVibrance(vibrance·saturation 각
 *    -100..100 — PSD 범위와 정확히 일치)를 그대로 위임한다.
 *  - threshold: `studio-filters.ts` applyInkThreshold와 같은 휘도 가중치
 *    (0.299/0.587/0.114)·같은 경계 규칙(휘도 < level → 검정, 아니면 흰색)을 쓴다.
 *    PSD level 1..255를 그대로 받는 점만 다르다(inkThreshold는 0..1).
 *  - brightness-contrast·posterize·invert: 요소 필드(brightness/contrast/
 *    posterize/invert)와 조정 스택 엔진이 이미 같은 이름으로 존재하고, 여기서
 *    PSD 네이티브 파라미터 척도(아래 정규화 범위)로 실행 의미를 고정한다.
 *
 * 남은 PSD 미지원 4종(black & white·photo filter·selective color·color lookup)은
 * 전용 실행기가 없어 이 실행기에도 없다 — 종류를 늘려놓고 실행이 비는 상태를
 * 만들지 않는 것이 이 판정의 핵심이다.
 *
 * 파라미터는 효과 그래프 노드와 같은 값 유니온(number|string|boolean|number[])을
 * 받는다. 숫자 아닌 값·누락 키는 각 종류 기본값으로 떨어진다(외부 입력 안전장치 —
 * 기존 실행기들의 normalize 규약과 동일). 알파는 전 종류에서 보존한다.
 * 순수·결정적: DOM/Konva에 닿지 않는다.
 */
import {
  applyStudioExposureAdjustment,
} from "../studio-advanced-pixel-filters";
import type { StudioImageDataLike } from "../studio-filters";
import { applyVibrance, normalizeVibrance } from "../studio-vibrance";

import type { StudioAdjustmentKind } from "./studio-adjustment-effect-graph";

/** 효과 그래프 노드 파라미터와 같은 값 유니온. */
export type StudioAdjustmentParameters = Readonly<
  Record<string, number | string | boolean | readonly number[]>
>;

/** 이 실행기가 픽셀로 실행할 수 있는 조정 종류 — 신규 6종뿐이다. */
export const STUDIO_ADJUSTMENT_EXECUTOR_KINDS = [
  "brightness-contrast",
  "exposure",
  "vibrance",
  "invert",
  "posterize",
  "threshold",
] as const satisfies readonly StudioAdjustmentKind[];

export type StudioAdjustmentExecutorKind =
  (typeof STUDIO_ADJUSTMENT_EXECUTOR_KINDS)[number];

function numParam(
  parameters: StudioAdjustmentParameters,
  key: string,
): number | undefined {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// brightness/contrast — PSD 척도: brightness -150..150, contrast -50..100
// ---------------------------------------------------------------------------

export interface StudioBrightnessContrast {
  readonly brightness: number;
  readonly contrast: number;
  readonly useLegacy: boolean;
}

export function normalizeBrightnessContrast(
  parameters: StudioAdjustmentParameters,
): StudioBrightnessContrast {
  const useLegacy = parameters.useLegacy;
  return {
    brightness: clamp(numParam(parameters, "brightness") ?? 0, -150, 150),
    contrast: clamp(numParam(parameters, "contrast") ?? 0, -50, 100),
    useLegacy: typeof useLegacy === "boolean" ? useLegacy : false,
  };
}

/**
 * 밝기/대비 적용. Photoshop 비레거시 알고리즘은 비공개 곡선이라, 여기서는
 * 선형 근사로 고정한다(가져오기 변환이 useLegacy인 경우도 같은 근사임을
 * 메모로 고지한다):
 *   factor = 1 + contrast/100        (contrast 100 → 2배, -50 → 0.5배)
 *   shift  = brightness/150 * 127.5  (brightness ±150 → ±127.5)
 *   c' = (c - 127.5) * factor + 127.5 + shift
 */
export function applyBrightnessContrast(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  const { brightness, contrast } = normalizeBrightnessContrast(parameters);
  if (brightness === 0 && contrast === 0) return;
  const factor = 1 + contrast / 100;
  const shift = (brightness / 150) * 127.5;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[i + channel] = (data[i + channel]! - 127.5) * factor + 127.5 + shift;
    }
  }
}

// ---------------------------------------------------------------------------
// exposure — 기존 실행기에 위임 (PSD 척도: exposure -20..20 → 실행기 클램프 -5..5,
// offset -0.5..0.5 → 클램프 -1..1, gamma 0.01..9.99 → 클램프 0.1..3)
// ---------------------------------------------------------------------------

export function applyExposureAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  applyStudioExposureAdjustment(img, {
    exposure: numParam(parameters, "exposure") ?? 0,
    gamma: numParam(parameters, "gamma") ?? 1,
    offset: numParam(parameters, "offset") ?? 0,
  });
}

// ---------------------------------------------------------------------------
// vibrance — 기존 실행기에 위임 (PSD·실행기 모두 vibrance/saturation -100..100)
// ---------------------------------------------------------------------------

export function applyVibranceAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  applyVibrance(
    img,
    normalizeVibrance({
      vibrance: numParam(parameters, "vibrance"),
      saturation: numParam(parameters, "saturation"),
    }),
  );
}

// ---------------------------------------------------------------------------
// invert — 파라미터 없음
// ---------------------------------------------------------------------------

export function applyInvertAdjustment(img: StudioImageDataLike): void {
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i]!;
    data[i + 1] = 255 - data[i + 1]!;
    data[i + 2] = 255 - data[i + 2]!;
  }
}

// ---------------------------------------------------------------------------
// posterize — PSD 척도: levels 2..255 (기본 4)
// ---------------------------------------------------------------------------

export function normalizePosterizeLevels(
  parameters: StudioAdjustmentParameters,
): number {
  return Math.round(clamp(numParam(parameters, "levels") ?? 4, 2, 255));
}

/**
 * 포스터라이즈 적용: 채널 값을 levels개 구간으로 양자화한다.
 *   band = 256/levels, scale = 255/(levels-1)
 *   c' = min(levels-1, floor(c/band)) * scale
 */
export function applyPosterizeAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  const levels = normalizePosterizeLevels(parameters);
  const band = 256 / levels;
  const scale = 255 / (levels - 1);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const step = Math.min(levels - 1, Math.floor(data[i + channel]! / band));
      data[i + channel] = step * scale;
    }
  }
}

// ---------------------------------------------------------------------------
// threshold — PSD 척도: level 1..255 (기본 128)
// ---------------------------------------------------------------------------

export function normalizeThresholdLevel(
  parameters: StudioAdjustmentParameters,
): number {
  return Math.round(clamp(numParam(parameters, "level") ?? 128, 1, 255));
}

/**
 * 임계값 적용: 휘도(0.299r+0.587g+0.114b — applyInkThreshold와 동일 가중치)를
 * 정수 레벨로 반올림해 level보다 작으면 순흑, 아니면 순백. 경계(휘도 == level)는
 * 흰색이다(PSD 규칙) — 반올림은 부동소수점 오차로 경계 픽셀이 흔들리지 않게 한다.
 */
export function applyThresholdAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  const level = normalizeThresholdLevel(parameters);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    const value = lum < level ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
}

// ---------------------------------------------------------------------------
// 디스패치
// ---------------------------------------------------------------------------

/**
 * 조정 종류 1건을 픽셀에 적용한다. 이 실행기가 담당하는 6종이면 적용하고
 * true를 돌려준다. 기존 7종(levels·curves·hsl·color-balance·channel-mixer·
 * gradient-map·lab)은 각자의 기존 엔진 경로가 있어 여기서 적용한 척하지 않고
 * false를 돌려준다 — 호출자(그래프 실행기)가 경로를 선택할 수 있게 하기 위함이다.
 */
export function applyStudioAdjustmentPixels(
  img: StudioImageDataLike,
  kind: StudioAdjustmentKind,
  parameters: StudioAdjustmentParameters,
): boolean {
  switch (kind) {
    case "brightness-contrast":
      applyBrightnessContrast(img, parameters);
      return true;
    case "exposure":
      applyExposureAdjustment(img, parameters);
      return true;
    case "vibrance":
      applyVibranceAdjustment(img, parameters);
      return true;
    case "invert":
      applyInvertAdjustment(img);
      return true;
    case "posterize":
      applyPosterizeAdjustment(img, parameters);
      return true;
    case "threshold":
      applyThresholdAdjustment(img, parameters);
      return true;
    default:
      return false;
  }
}
