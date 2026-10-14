/**
 * studio-adjustment-executor.ts
 *
 * PSD 미지원 10종 확장 검토(2026-10-14) 판정으로 `StudioAdjustmentKind`에 추가된
 * 6종의 픽셀 실행기: brightness-contrast · exposure · vibrance · invert ·
 * posterize · threshold. 여기에 전수 대응(2026-10-15)으로 4종을 더했다:
 * black-white(헥스콘 분해) · photo-filter(기존 studio-photo-filter 위임) ·
 * selective-color(CMYK 근사) · color-lookup(.cube 3D LUT 삼선형 보간).
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
 * color-lookup만은 데이터 의존이다: 내장 .cube 바이트가 있을 때만 픽셀에
 * 적용하고(적용했으면 true), 없거나 다른 형식이면 false를 돌려 호출자가
 * "적용한 척"을 하지 않게 한다 — 변환 단계의 notes 고지와 쌍을 이룬다.
 *
 * 파라미터는 효과 그래프 노드와 같은 값 유니온(number|string|boolean|number[])을
 * 받는다. 숫자 아닌 값·누락 키는 각 종류 기본값으로 떨어진다(외부 입력 안전장치 —
 * 기존 실행기들의 normalize 규약과 동일). 알파는 전 종류에서 보존한다.
 * 순수·결정적: DOM/Konva에 닿지 않는다.
 */
import {
  applyStudioExposureAdjustment,
} from "../studio-advanced-pixel-filters";
import { applyPhotoFilter } from "../studio-photo-filter";
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
  "black-white",
  "photo-filter",
  "selective-color",
  "color-lookup",
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
// black-white — PSD 척도: 6색 가중 -200..300 (기본 40/60/40/60/20/80)
// ---------------------------------------------------------------------------

export interface StudioBlackWhiteWeights {
  readonly reds: number;
  readonly yellows: number;
  readonly greens: number;
  readonly cyans: number;
  readonly blues: number;
  readonly magentas: number;
}

const BW_DEFAULTS: StudioBlackWhiteWeights = {
  reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80,
};

export function normalizeBlackWhite(
  parameters: StudioAdjustmentParameters,
): StudioBlackWhiteWeights {
  const pick = (key: keyof StudioBlackWhiteWeights): number =>
    clamp(numParam(parameters, key) ?? BW_DEFAULTS[key], -200, 300);
  return {
    reds: pick("reds"), yellows: pick("yellows"), greens: pick("greens"),
    cyans: pick("cyans"), blues: pick("blues"), magentas: pick("magentas"),
  };
}

function hexChannels(hex: string | undefined): readonly [number, number, number] | undefined {
  if (!hex) return undefined;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return undefined;
  const packed = Number.parseInt(m[1]!, 16);
  return [(packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff];
}

/**
 * 흑백 적용 — 헥스콘(hexcone) 분해 근사. 픽셀을 "중립 성분(min) + 인접한 두
 * 앵커 색 사이의 성분"으로 나누고, 각 성분에 해당 앵커 가중(%/100)을 곱해
 * 합산한다. 이 분해는 다음을 보장한다:
 *  - 순수 앵커 색(빨강·노랑·초록·청록·파랑·마젠타)은 정확히 가중% × 255
 *  - 무채색(r=g=b)은 가중과 무관하게 항등
 * Photoshop의 내부 곡선은 비공개라 중간 색조는 근사다. 틴트(useTint)는
 * gray에 틴트색 계수(0.4 + 1.2·tint/255)를 곱하는 근사로 적용한다.
 * 알파는 보존한다.
 */
export function applyBlackWhiteAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  const w = normalizeBlackWhite(parameters);
  const tintRaw = parameters.tintColor;
  const tint = parameters.useTint === true
    ? hexChannels(typeof tintRaw === "string" ? tintRaw : undefined)
    : undefined;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const mn = Math.min(r, g, b);
    let gray = mn; // 중립 성분은 가중 없이 그대로 (무채색 항등의 근거)
    if (b === mn) {
      // 나머지는 빨강↔노랑↔초록 구간
      const rr = r - mn;
      const gg = g - mn;
      if (rr >= gg) gray += (rr - gg) * (w.reds / 100) + gg * (w.yellows / 100);
      else gray += (gg - rr) * (w.greens / 100) + rr * (w.yellows / 100);
    } else if (r === mn) {
      const gg = g - mn;
      const bb = b - mn;
      if (gg >= bb) gray += (gg - bb) * (w.greens / 100) + bb * (w.cyans / 100);
      else gray += (bb - gg) * (w.blues / 100) + gg * (w.cyans / 100);
    } else {
      const rr = r - mn;
      const bb = b - mn;
      if (bb >= rr) gray += (bb - rr) * (w.blues / 100) + rr * (w.magentas / 100);
      else gray += (rr - bb) * (w.reds / 100) + bb * (w.magentas / 100);
    }
    if (tint) {
      data[i] = gray * (0.4 + 1.2 * (tint[0] / 255));
      data[i + 1] = gray * (0.4 + 1.2 * (tint[1] / 255));
      data[i + 2] = gray * (0.4 + 1.2 * (tint[2] / 255));
    } else {
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  }
}

// ---------------------------------------------------------------------------
// photo-filter — 기존 studio-photo-filter 엔진 위임 (PSD 규약과 동일함을 대조)
// ---------------------------------------------------------------------------

export function applyPhotoFilterAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  const color = parameters.color;
  applyPhotoFilter(img, {
    color: typeof color === "string" ? color : "#ec8a00",
    density: clamp(numParam(parameters, "density") ?? 25, 0, 100),
    preserveLuminosity: parameters.preserveLuminosity !== false,
  });
}

// ---------------------------------------------------------------------------
// selective-color — PSD 척도: mode relative|absolute, 9범위 × CMYK -100..100
// ---------------------------------------------------------------------------

const SELECTIVE_RANGE_NAMES = [
  "reds", "yellows", "greens", "cyans", "blues", "magentas", "whites", "neutrals", "blacks",
] as const;

type SelectiveRangeName = (typeof SELECTIVE_RANGE_NAMES)[number];

function selectiveCategory(r: number, g: number, b: number): SelectiveRangeName {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 12) {
    const lightness = (mx + mn) / 2 / 255;
    if (lightness > 0.8) return "whites";
    if (lightness < 0.2) return "blacks";
    return "neutrals";
  }
  // hue(도) — 표준 hexcone 계산
  const d = mx - mn;
  let h: number;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  if (h < 30 || h >= 330) return "reds";
  if (h < 90) return "yellows";
  if (h < 150) return "greens";
  if (h < 210) return "cyans";
  if (h < 270) return "blues";
  return "magentas";
}

/**
 * 선택 색상 적용 — 근사. 픽셀을 9범위 중 하나로 분류(유채색은 hue 섹터 경계
 * 30° 단위, 무채색은 명도 0.8/0.2 경계)하고, 그 범위의 CMYK 보정을 단순
 * CMYK(c=255-r …) 공간에서 적용한다.
 *  - absolute: 보정값 %를 255 스케일 절대량으로 더한다.
 *  - relative: 보정값 %를 현재 채널량의 비율로 더한다.
 * k 보정은 세 채널 공통의 어둡기 이동으로 적용한다. Photoshop의 범위 겹침
 * (퍼지 경계)과 CMYK 분리 곡선은 비공개라 경계 근처는 근사다 — 파라미터
 * 자체는 변환 단계에서 무손실 보존된다.
 */
export function applySelectiveColorAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): void {
  const mode = parameters.mode === "absolute" ? "absolute" : "relative";
  const ranges = new Map<SelectiveRangeName, readonly number[]>();
  for (const name of SELECTIVE_RANGE_NAMES) {
    const values = parameters[`range.${name}`];
    if (Array.isArray(values) && values.length >= 4) ranges.set(name, values);
  }
  if (ranges.size === 0) return;
  const delta = (channel: number, adjust: number): number =>
    mode === "absolute" ? (adjust / 100) * 255 : (adjust / 100) * channel;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const adjust = ranges.get(selectiveCategory(r, g, b));
    if (!adjust) continue;
    const [ac, am, ay, ak] = [
      clamp(adjust[0] ?? 0, -100, 100), clamp(adjust[1] ?? 0, -100, 100),
      clamp(adjust[2] ?? 0, -100, 100), clamp(adjust[3] ?? 0, -100, 100),
    ];
    if (ac === 0 && am === 0 && ay === 0 && ak === 0) continue;
    let c = 255 - r;
    let m = 255 - g;
    let y = 255 - b;
    c += delta(c, ac);
    m += delta(m, am);
    y += delta(y, ay);
    const kBase = 255 - Math.max(255 - c, 255 - m, 255 - y);
    const kShift = delta(Math.max(0, kBase), ak);
    data[i] = 255 - c - kShift;
    data[i + 1] = 255 - m - kShift;
    data[i + 2] = 255 - y - kShift;
  }
}

// ---------------------------------------------------------------------------
// color-lookup — 내장 .cube 3D LUT (LUT_3D_SIZE + RGB 트리플, R 최속 순서)
// ---------------------------------------------------------------------------

export interface StudioCubeLut {
  readonly size: number;
  /** size^3 × 3, 0..1 float — 인덱스 ((b*size + g)*size + r)*3 (.cube 규약) */
  readonly table: readonly number[];
}

/** .cube 텍스트를 파싱한다. 형식이 아니거나 표가 부족하면 undefined. */
export function parseCubeLut(text: string): StudioCubeLut | undefined {
  let size: number | undefined;
  const values: number[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("LUT_3D_SIZE")) {
      const n = Number(line.split(/\s+/)[1]);
      if (Number.isInteger(n) && n >= 2 && n <= 64) size = n;
      continue;
    }
    if (/^(TITLE|DOMAIN_MIN|DOMAIN_MAX|LUT_1D_SIZE|LUT_1D_INPUT_RANGE|LUT_3D_INPUT_RANGE)\b/.test(line)) continue;
    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every((v) => Number.isFinite(v))) values.push(...parts);
  }
  if (size === undefined || values.length < size * size * size * 3) return undefined;
  return { size, table: values.slice(0, size * size * size * 3) };
}

function decodeBytesText(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.slice(i, i + 8192).map((v) => v & 0xff));
  }
  return out;
}

/**
 * 컬러 룩업 적용. lutBytes 파라미터(가져오기가 보존한 바이트 배열)가 .cube
 * 텍스트일 때만 삼선형 보간으로 적용하고 true를 돌려준다. 데이터가 없거나
 * .cube가 아니면 픽셀을 건드리지 않고 false — 호출자가 미적용을 알 수 있다.
 * dataOrder="bgr"이면 입력 채널 순서를 바꿔 조회한다.
 */
export function applyColorLookupAdjustment(
  img: StudioImageDataLike,
  parameters: StudioAdjustmentParameters,
): boolean {
  const bytes = parameters.lutBytes;
  if (!Array.isArray(bytes) || bytes.length === 0) return false;
  const lut = parseCubeLut(decodeBytesText(bytes));
  if (!lut) return false;
  const { size, table } = lut;
  const bgr = parameters.dataOrder === "bgr" || parameters.tableOrder === "bgr";
  const at = (ri: number, gi: number, bi: number, ch: number): number =>
    table[(((bi * size + gi) * size + ri) * 3) + ch]!;
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    let rn = data[i]! / 255;
    let gn = data[i + 1]! / 255;
    let bn = data[i + 2]! / 255;
    if (bgr) [rn, bn] = [bn, rn];
    const rp = rn * (size - 1);
    const gp = gn * (size - 1);
    const bp = bn * (size - 1);
    const r0 = Math.floor(rp);
    const g0 = Math.floor(gp);
    const b0 = Math.floor(bp);
    const r1 = Math.min(size - 1, r0 + 1);
    const g1 = Math.min(size - 1, g0 + 1);
    const b1 = Math.min(size - 1, b0 + 1);
    const fr = rp - r0;
    const fg = gp - g0;
    const fb = bp - b0;
    for (let ch = 0; ch < 3; ch += 1) {
      const c000 = at(r0, g0, b0, ch);
      const c100 = at(r1, g0, b0, ch);
      const c010 = at(r0, g1, b0, ch);
      const c110 = at(r1, g1, b0, ch);
      const c001 = at(r0, g0, b1, ch);
      const c101 = at(r1, g0, b1, ch);
      const c011 = at(r0, g1, b1, ch);
      const c111 = at(r1, g1, b1, ch);
      const x00 = c000 + (c100 - c000) * fr;
      const x10 = c010 + (c110 - c010) * fr;
      const x01 = c001 + (c101 - c001) * fr;
      const x11 = c011 + (c111 - c011) * fr;
      const y0 = x00 + (x10 - x00) * fg;
      const y1 = x01 + (x11 - x01) * fg;
      data[i + ch] = (y0 + (y1 - y0) * fb) * 255;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// 디스패치
// ---------------------------------------------------------------------------

/**
 * 조정 종류 1건을 픽셀에 적용한다. 이 실행기가 담당하는 10종이면 적용하고
 * true를 돌려준다(color-lookup은 .cube 데이터가 있을 때만 true). 기존 7종
 * (levels·curves·hsl·color-balance·channel-mixer·gradient-map·lab)은 각자의
 * 기존 엔진 경로가 있어 여기서 적용한 척하지 않고 false를 돌려준다 —
 * 호출자(그래프 실행기)가 경로를 선택할 수 있게 하기 위함이다.
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
    case "black-white":
      applyBlackWhiteAdjustment(img, parameters);
      return true;
    case "photo-filter":
      applyPhotoFilterAdjustment(img, parameters);
      return true;
    case "selective-color":
      applySelectiveColorAdjustment(img, parameters);
      return true;
    case "color-lookup":
      return applyColorLookupAdjustment(img, parameters);
    default:
      return false;
  }
}
