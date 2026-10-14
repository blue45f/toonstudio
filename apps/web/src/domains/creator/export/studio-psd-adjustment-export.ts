/**
 * studio-psd-adjustment-export.ts
 *
 * Studio 조정 레이어(kind + parameters)를 ag-psd 네이티브 조정 레이어로 되돌리는
 * 역변환 모듈. 가져오기 변환(`studio-psd-adjustment-import.ts`의
 * `convertPsdAdjustmentLayer`)과 정확히 대칭이 되도록 설계한다 —
 * PSD → Studio → PSD 왕복에서 조정 종류와 파라미터가 유지되는 것이 계약이다.
 *
 * 대칭 규칙:
 *  - 파라미터 키 이름·인코딩은 가져오기 변환이 만든 것을 그대로 되읽는다
 *    (levels 채널별 5키, curves 평탄 점 배열, hsl 마스터+`range.<범위>` 보존 배열,
 *    color balance 밴드별 3키, channel mixer 출력별 4키, gradient map 스톱 문자열).
 *  - 가져오기가 기본값으로 채우지 않은 채널은, Studio 파라미터에 키가 하나라도
 *    있으면 PSD 채널 기본값(레벨 0/255/0/255/1, 나머지 0)으로 나머지를 채워
 *    ag-psd의 필수 필드를 만족시킨다. 키가 전혀 없는 채널은 만들지 않는다.
 *  - PSD에 대응 종류가 없는 Studio 조정(`lab`)은 throw 하지 않고
 *    status:"unsupported" 로 돌려준다 — 호출자(내보내기)가 skipped·손실 명세에
 *    정직하게 기록하고 나머지 레이어 내보내기를 계속할 수 있게 한다.
 *  - 확장 6종(brightness-contrast·exposure·vibrance·invert·posterize·threshold)은
 *    가져오기 변환이 보존한 PSD 네이티브 척도를 그대로 되읽는다 — 파라미터 키가
 *    있는 필드만 기록하고, 없는 필드는 ag-psd 쪽 기본값에 맡긴다(levels 채널과
 *    같은 규약).
 *
 * 순수·결정적: DOM/ag-psd 런타임에 닿지 않고 타입만 빌린다.
 */
import type { AdjustmentLayer } from "ag-psd";

import type { StudioAdjustmentKind } from "../filter/studio-adjustment-effect-graph";

/** StudioAdjustmentNode.parameters / 가져오기 변환 결과와 같은 값 유니온. */
export type StudioPsdAdjustmentParameters = Readonly<
  Record<string, number | string | boolean | readonly number[]>
>;

export type StudioPsdAdjustmentExportConversion =
  | { readonly status: "converted"; readonly adjustment: AdjustmentLayer }
  | { readonly status: "unsupported"; readonly kind: StudioAdjustmentKind; readonly reason: string };

const CHANNELS = ["rgb", "red", "green", "blue"] as const;
const HSL_RANGES = ["reds", "yellows", "greens", "cyans", "blues", "magentas"] as const;
const BALANCE_BANDS = ["shadows", "midtones", "highlights"] as const;
const MIXER_OUTPUTS = ["red", "green", "blue", "gray"] as const;

function numParam(
  parameters: StudioPsdAdjustmentParameters,
  key: string,
): number | undefined {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boolParam(
  parameters: StudioPsdAdjustmentParameters,
  key: string,
): boolean | undefined {
  const value = parameters[key];
  return typeof value === "boolean" ? value : undefined;
}

function convertLevels(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "levels" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "levels" }> = { type: "levels" };
  for (const channel of CHANNELS) {
    const shadowInput = numParam(parameters, `${channel}ShadowInput`);
    const highlightInput = numParam(parameters, `${channel}HighlightInput`);
    const shadowOutput = numParam(parameters, `${channel}ShadowOutput`);
    const highlightOutput = numParam(parameters, `${channel}HighlightOutput`);
    const midtoneInput = numParam(parameters, `${channel}MidtoneInput`);
    if (
      shadowInput === undefined && highlightInput === undefined &&
      shadowOutput === undefined && highlightOutput === undefined &&
      midtoneInput === undefined
    ) {
      continue;
    }
    adjustment[channel] = {
      shadowInput: shadowInput ?? 0,
      highlightInput: highlightInput ?? 255,
      shadowOutput: shadowOutput ?? 0,
      highlightOutput: highlightOutput ?? 255,
      midtoneInput: midtoneInput ?? 1,
    };
  }
  return adjustment;
}

function convertCurves(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "curves" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "curves" }> = { type: "curves" };
  for (const channel of CHANNELS) {
    const flat = parameters[`${channel}Points`];
    if (!Array.isArray(flat) || flat.length < 2) continue;
    const points: { input: number; output: number }[] = [];
    // 평탄 배열 [in0, out0, in1, out1, ...] — 홀수 꼬리는 점으로 성립하지 않아 버린다.
    for (let i = 0; i + 1 < flat.length; i += 2) {
      points.push({ input: flat[i]!, output: flat[i + 1]! });
    }
    if (points.length > 0) adjustment[channel] = points;
  }
  return adjustment;
}

function convertHueSaturation(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "hue/saturation" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "hue/saturation" }> = {
    type: "hue/saturation",
  };
  const hue = numParam(parameters, "hue");
  const saturation = numParam(parameters, "saturation");
  const lightness = numParam(parameters, "lightness");
  if (hue !== undefined || saturation !== undefined || lightness !== undefined) {
    // 마스터 채널의 범위 경계(a..d)는 Photoshop에서도 쓰지 않으므로 0으로 고정한다.
    adjustment.master = {
      a: 0, b: 0, c: 0, d: 0,
      hue: hue ?? 0,
      saturation: saturation ?? 0,
      lightness: lightness ?? 0,
    };
  }
  for (const name of HSL_RANGES) {
    const range = parameters[`range.${name}`];
    if (!Array.isArray(range) || range.length < 7) continue;
    adjustment[name] = {
      a: range[0]!, b: range[1]!, c: range[2]!, d: range[3]!,
      hue: range[4]!, saturation: range[5]!, lightness: range[6]!,
    };
  }
  return adjustment;
}

function convertColorBalance(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "color balance" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "color balance" }> = {
    type: "color balance",
  };
  for (const band of BALANCE_BANDS) {
    const cyanRed = numParam(parameters, `${band}CyanRed`);
    const magentaGreen = numParam(parameters, `${band}MagentaGreen`);
    const yellowBlue = numParam(parameters, `${band}YellowBlue`);
    if (cyanRed === undefined && magentaGreen === undefined && yellowBlue === undefined) {
      continue;
    }
    adjustment[band] = {
      cyanRed: cyanRed ?? 0,
      magentaGreen: magentaGreen ?? 0,
      yellowBlue: yellowBlue ?? 0,
    };
  }
  const preserveLuminosity = boolParam(parameters, "preserveLuminosity");
  if (preserveLuminosity !== undefined) adjustment.preserveLuminosity = preserveLuminosity;
  return adjustment;
}

function convertChannelMixer(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "channel mixer" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "channel mixer" }> = {
    type: "channel mixer",
  };
  for (const output of MIXER_OUTPUTS) {
    const red = numParam(parameters, `${output}FromRed`);
    const green = numParam(parameters, `${output}FromGreen`);
    const blue = numParam(parameters, `${output}FromBlue`);
    const constant = numParam(parameters, `${output}Constant`);
    if (red === undefined && green === undefined && blue === undefined && constant === undefined) {
      continue;
    }
    adjustment[output] = {
      red: red ?? 0,
      green: green ?? 0,
      blue: blue ?? 0,
      constant: constant ?? 0,
    };
  }
  const monochrome = boolParam(parameters, "monochrome");
  if (monochrome !== undefined) adjustment.monochrome = monochrome;
  return adjustment;
}

/** 가져오기 인코딩 "location:#rrggbb:midpoint" 한 항목을 ag-psd 색상 스톱으로 되돌린다. */
function parseGradientStop(
  entry: string,
): { color: { r: number; g: number; b: number }; location: number; midpoint: number } | null {
  const parts = entry.split(":");
  if (parts.length !== 3) return null;
  const location = Number(parts[0]);
  const midpoint = Number(parts[2]);
  const hex = /^#([0-9a-fA-F]{6})$/.exec(parts[1]!);
  if (!Number.isFinite(location) || !Number.isFinite(midpoint) || !hex) return null;
  const packed = Number.parseInt(hex[1]!, 16);
  return {
    color: { r: (packed >> 16) & 0xff, g: (packed >> 8) & 0xff, b: packed & 0xff },
    location,
    midpoint,
  };
}

function convertGradientMap(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "gradient map" }> {
  const stopsValue = parameters.stops;
  const colorStops: { color: { r: number; g: number; b: number }; location: number; midpoint: number }[] = [];
  if (typeof stopsValue === "string" && stopsValue.length > 0) {
    for (const entry of stopsValue.split(",")) {
      const stop = parseGradientStop(entry);
      if (stop) colorStops.push(stop);
    }
  }
  const adjustment: Extract<AdjustmentLayer, { type: "gradient map" }> = {
    type: "gradient map",
    // 가져오기 변환은 노이즈 여부를 파라미터가 아니라 근사 메모로만 남기므로
    // 내보내기는 항상 솔리드 그라디언트로 기록한다(메모가 이미 사용자에게 고지됨).
    gradientType: "solid",
    colorStops,
  };
  const reverse = boolParam(parameters, "reverse");
  if (reverse !== undefined) adjustment.reverse = reverse;
  const dither = boolParam(parameters, "dither");
  if (dither !== undefined) adjustment.dither = dither;
  return adjustment;
}

function convertBrightnessContrast(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "brightness/contrast" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "brightness/contrast" }> = {
    type: "brightness/contrast",
  };
  const brightness = numParam(parameters, "brightness");
  if (brightness !== undefined) adjustment.brightness = brightness;
  const contrast = numParam(parameters, "contrast");
  if (contrast !== undefined) adjustment.contrast = contrast;
  const useLegacy = boolParam(parameters, "useLegacy");
  if (useLegacy !== undefined) adjustment.useLegacy = useLegacy;
  return adjustment;
}

function convertExposure(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "exposure" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "exposure" }> = { type: "exposure" };
  const exposure = numParam(parameters, "exposure");
  if (exposure !== undefined) adjustment.exposure = exposure;
  const offset = numParam(parameters, "offset");
  if (offset !== undefined) adjustment.offset = offset;
  const gamma = numParam(parameters, "gamma");
  if (gamma !== undefined) adjustment.gamma = gamma;
  return adjustment;
}

function convertVibrance(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "vibrance" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "vibrance" }> = { type: "vibrance" };
  const vibrance = numParam(parameters, "vibrance");
  if (vibrance !== undefined) adjustment.vibrance = vibrance;
  const saturation = numParam(parameters, "saturation");
  if (saturation !== undefined) adjustment.saturation = saturation;
  return adjustment;
}

function convertPosterize(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "posterize" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "posterize" }> = { type: "posterize" };
  const levels = numParam(parameters, "levels");
  if (levels !== undefined) adjustment.levels = levels;
  return adjustment;
}

function convertThreshold(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "threshold" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "threshold" }> = { type: "threshold" };
  const level = numParam(parameters, "level");
  if (level !== undefined) adjustment.level = level;
  return adjustment;
}

const UNSUPPORTED_REASONS: Readonly<Partial<Record<StudioAdjustmentKind, string>>> = {
  lab: "Lab 조정은 PSD 조정 레이어에 대응 종류가 없어 네이티브 조정 레이어로 기록할 수 없습니다.",
};

/**
 * Studio 조정 레이어 1건을 ag-psd 조정 레이어로 변환한다.
 * `convertPsdAdjustmentLayer`(가져오기)의 정확한 역변환이며, 대응이 없는 종류는
 * throw 하지 않고 status:"unsupported" 로 돌려준다.
 */
export function convertStudioAdjustmentToPsd(
  kind: StudioAdjustmentKind,
  parameters: StudioPsdAdjustmentParameters,
): StudioPsdAdjustmentExportConversion {
  switch (kind) {
    case "levels":
      return { status: "converted", adjustment: convertLevels(parameters) };
    case "curves":
      return { status: "converted", adjustment: convertCurves(parameters) };
    case "hsl":
      return { status: "converted", adjustment: convertHueSaturation(parameters) };
    case "color-balance":
      return { status: "converted", adjustment: convertColorBalance(parameters) };
    case "channel-mixer":
      return { status: "converted", adjustment: convertChannelMixer(parameters) };
    case "gradient-map":
      return { status: "converted", adjustment: convertGradientMap(parameters) };
    case "brightness-contrast":
      return { status: "converted", adjustment: convertBrightnessContrast(parameters) };
    case "exposure":
      return { status: "converted", adjustment: convertExposure(parameters) };
    case "vibrance":
      return { status: "converted", adjustment: convertVibrance(parameters) };
    case "invert":
      return { status: "converted", adjustment: { type: "invert" } };
    case "posterize":
      return { status: "converted", adjustment: convertPosterize(parameters) };
    case "threshold":
      return { status: "converted", adjustment: convertThreshold(parameters) };
    default:
      return {
        status: "unsupported",
        kind,
        reason:
          UNSUPPORTED_REASONS[kind] ??
          `알 수 없는 Studio 조정 종류(${kind})는 PSD 조정 레이어로 기록할 수 없습니다.`,
      };
  }
}
