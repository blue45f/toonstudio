/**
 * studio-psd-adjustment-import.ts
 *
 * PSD 조정 레이어의 비파괴 파라미터를 ToonStudio 조정 모델로 변환하는 순수 모듈.
 *
 * 배경: 예전 `studio-psd-import.ts`는 `layer.adjustment`가 있는 레이어를
 * skipReason:"adjustment" 로 분류해 버리고, 가져오기 리포트에 "조정 레이어 N개는
 * 비파괴 파라미터와 합성 결과를 가져오지 않습니다" 라고만 남겼다. 이 모듈은 그
 * 파라미터를 실제로 읽어 `StudioAdjustmentKind` + parameters 로 옮기는 변환층이며,
 * `studio-psd-import.ts`의 flatten 단계가 변환 결과를 실어 가져오기에서 조정
 * 레이어로 복원한다.
 *
 * 변환 결과는 두 갈래로 쓰인다.
 *  1. 스택형 조정 레이어(`layer/studio-adjustment-layer.ts`)의 spec 재료
 *  2. 대상 레이어 효과 그래프(`filter/studio-adjustment-effect-graph.ts`)의
 *     조정 노드 파라미터
 *
 * 전수 대응(2026-10-15): ag-psd 조정 16종 전부를 변환한다. 남은 4종도 전용
 * 실행기를 새로 붙여 승격했다(실행: filter/studio-adjustment-executor.ts) —
 *  - black & white → black-white: 6색 가중을 헥스콘 분해로 실행(순수 앵커 색은
 *    슬라이더 %가 정확히 재현되고, 무채색은 항등). 틴트는 근사로 고지한다.
 *  - photo filter → photo-filter: 기존 studio-photo-filter 엔진의 파라미터
 *    규약(color #hex·density 0..100·preserveLuminosity)이 PSD와 정확히 같음을
 *    대조해 위임 실행한다(무손실).
 *  - selective color → selective-color: 9범위 CMYK를 전부 보존하고, 실행은
 *    색상 섹터 분류 + 상대/절대 CMYK 보정 근사(notes로 고지).
 *  - color lookup → color-lookup: 조회 종류·파일명·LUT 바이트를 보존한다.
 *    내장 데이터가 .cube 텍스트면 3D LUT를 실제로 실행하고, 데이터가 없거나
 *    프로파일형이면 픽셀은 항등이되 파라미터는 보존한다(notes로 고지).
 * 알 수 없는 미래 종류만 status:"unsupported" 로 돌려주되 원본 type 을 보존해,
 * 리포트가 "버려짐"이 아니라 종류 단위로 정확해지게 한다.
 *
 * 순수·결정적: DOM/ag-psd 런타임에 닿지 않고 타입만 빌린다.
 */
import type { AdjustmentLayer, Color } from "ag-psd";

import type { StudioAdjustmentKind } from "./filter/studio-adjustment-effect-graph";

/** StudioAdjustmentNode.parameters 와 같은 값 유니온. */
export type StudioPsdAdjustmentParameters = Readonly<
  Record<string, number | string | boolean | readonly number[]>
>;

export interface StudioPsdConvertedAdjustment {
  readonly status: "converted";
  /** 변환된 Studio 조정 종류. */
  readonly kind: StudioAdjustmentKind;
  readonly parameters: StudioPsdAdjustmentParameters;
  /** 변환 과정에서 근사·생략된 부분이 있으면 사람이 읽을 메모(리포트용). */
  readonly notes: readonly string[];
}

export interface StudioPsdUnsupportedAdjustment {
  readonly status: "unsupported";
  /** ag-psd 조정 type 원문 (예: "brightness/contrast"). */
  readonly psdType: string;
  readonly reason: string;
}

export type StudioPsdAdjustmentConversion =
  | StudioPsdConvertedAdjustment
  | StudioPsdUnsupportedAdjustment;

const CHANNELS = ["rgb", "red", "green", "blue"] as const;

function colorToHex(color: Color | undefined): string | undefined {
  if (!color || typeof color !== "object") return undefined;
  const candidate = color as { r?: unknown; g?: unknown; b?: unknown };
  if (
    typeof candidate.r !== "number" ||
    typeof candidate.g !== "number" ||
    typeof candidate.b !== "number"
  ) {
    return undefined;
  }
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(candidate.r)}${channel(candidate.g)}${channel(candidate.b)}`;
}

function convertLevels(adjustment: Extract<AdjustmentLayer, { type: "levels" }>): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  for (const channel of CHANNELS) {
    const values = adjustment[channel];
    if (!values) continue;
    parameters[`${channel}ShadowInput`] = values.shadowInput;
    parameters[`${channel}HighlightInput`] = values.highlightInput;
    parameters[`${channel}ShadowOutput`] = values.shadowOutput;
    parameters[`${channel}HighlightOutput`] = values.highlightOutput;
    parameters[`${channel}MidtoneInput`] = values.midtoneInput;
  }
  return { status: "converted", kind: "levels", parameters, notes: [] };
}

function convertCurves(adjustment: Extract<AdjustmentLayer, { type: "curves" }>): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  for (const channel of CHANNELS) {
    const points = adjustment[channel];
    if (!points || points.length === 0) continue;
    // [in0, out0, in1, out1, ...] 평탄 배열 — 그래프 파라미터 유니온(수 배열)에 맞춘다.
    parameters[`${channel}Points`] = points.flatMap((point) => [point.input, point.output]);
  }
  return { status: "converted", kind: "curves", parameters, notes: [] };
}

function convertHueSaturation(
  adjustment: Extract<AdjustmentLayer, { type: "hue/saturation" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const notes: string[] = [];
  if (adjustment.master) {
    parameters.hue = adjustment.master.hue;
    parameters.saturation = adjustment.master.saturation;
    parameters.lightness = adjustment.master.lightness;
  }
  const rangeNames = ["reds", "yellows", "greens", "cyans", "blues", "magentas"] as const;
  const presentRanges = rangeNames.filter((name) => adjustment[name]);
  if (presentRanges.length > 0) {
    // Studio hsl 조정은 마스터 채널만 모델링한다. 범위별 조정은 버리지 않고
    // 범위 경계(a..d)와 값을 파라미터에 남겨 후속 단계에서 확장할 수 있게 한다.
    for (const name of presentRanges) {
      const range = adjustment[name];
      if (!range) continue;
      parameters[`range.${name}`] = [range.a, range.b, range.c, range.d, range.hue, range.saturation, range.lightness];
    }
    notes.push(`색상 범위 조정 ${presentRanges.length}개는 보존 파라미터로만 가져왔습니다(마스터만 즉시 적용).`);
  }
  return { status: "converted", kind: "hsl", parameters, notes };
}

function convertColorBalance(
  adjustment: Extract<AdjustmentLayer, { type: "color balance" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const bands = ["shadows", "midtones", "highlights"] as const;
  for (const band of bands) {
    const values = adjustment[band];
    if (!values) continue;
    parameters[`${band}CyanRed`] = values.cyanRed;
    parameters[`${band}MagentaGreen`] = values.magentaGreen;
    parameters[`${band}YellowBlue`] = values.yellowBlue;
  }
  if (typeof adjustment.preserveLuminosity === "boolean") {
    parameters.preserveLuminosity = adjustment.preserveLuminosity;
  }
  return { status: "converted", kind: "color-balance", parameters, notes: [] };
}

function convertChannelMixer(
  adjustment: Extract<AdjustmentLayer, { type: "channel mixer" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const outputs = ["red", "green", "blue", "gray"] as const;
  for (const output of outputs) {
    const values = adjustment[output];
    if (!values) continue;
    parameters[`${output}FromRed`] = values.red;
    parameters[`${output}FromGreen`] = values.green;
    parameters[`${output}FromBlue`] = values.blue;
    parameters[`${output}Constant`] = values.constant;
  }
  if (typeof adjustment.monochrome === "boolean") {
    parameters.monochrome = adjustment.monochrome;
  }
  return { status: "converted", kind: "channel-mixer", parameters, notes: [] };
}

function convertGradientMap(
  adjustment: Extract<AdjustmentLayer, { type: "gradient map" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const notes: string[] = [];
  const stops: string[] = [];
  for (const stop of adjustment.colorStops ?? []) {
    const hex = colorToHex(stop.color);
    if (hex) stops.push(`${stop.location}:${hex}:${stop.midpoint}`);
    else notes.push("RGB가 아닌 색상 모델의 그라디언트 스톱이 있어 해당 스톱은 건너뜀");
  }
  // 그래프 파라미터 유니온(number|string|boolean|number[])에 문자열 배열이 없어,
  // 스톱 목록은 "location:#hex:midpoint" 항목을 쉼표로 이은 단일 문자열로 인코딩한다.
  parameters.stops = stops.join(",");
  if (typeof adjustment.reverse === "boolean") parameters.reverse = adjustment.reverse;
  if (typeof adjustment.dither === "boolean") parameters.dither = adjustment.dither;
  if (adjustment.gradientType === "noise") {
    notes.push("노이즈 그라디언트 맵은 솔리드 스톱 근사로 가져왔습니다.");
  }
  return { status: "converted", kind: "gradient-map", parameters, notes };
}

function convertBrightnessContrast(
  adjustment: Extract<AdjustmentLayer, { type: "brightness/contrast" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const notes: string[] = [];
  // PSD 척도 그대로 보존한다(brightness -150..150, contrast -50..100) —
  // 실행기(studio-adjustment-executor.ts)가 같은 척도로 정규화·적용한다.
  parameters.brightness = adjustment.brightness ?? 0;
  parameters.contrast = adjustment.contrast ?? 0;
  if (typeof adjustment.useLegacy === "boolean") {
    parameters.useLegacy = adjustment.useLegacy;
    if (adjustment.useLegacy) {
      notes.push("레거시 밝기/대비는 Studio 실행기의 선형 근사로 적용됩니다.");
    }
  }
  return { status: "converted", kind: "brightness-contrast", parameters, notes };
}

function convertExposure(
  adjustment: Extract<AdjustmentLayer, { type: "exposure" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  parameters.exposure = adjustment.exposure ?? 0;
  parameters.offset = adjustment.offset ?? 0;
  parameters.gamma = adjustment.gamma ?? 1;
  return { status: "converted", kind: "exposure", parameters, notes: [] };
}

function convertVibrance(
  adjustment: Extract<AdjustmentLayer, { type: "vibrance" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  // PSD와 Studio 실행기(studio-vibrance) 모두 -100..100 척도라 무변환으로 옮긴다.
  parameters.vibrance = adjustment.vibrance ?? 0;
  parameters.saturation = adjustment.saturation ?? 0;
  return { status: "converted", kind: "vibrance", parameters, notes: [] };
}

function convertPosterize(
  adjustment: Extract<AdjustmentLayer, { type: "posterize" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  parameters.levels = adjustment.levels ?? 4;
  return { status: "converted", kind: "posterize", parameters, notes: [] };
}

function convertThreshold(
  adjustment: Extract<AdjustmentLayer, { type: "threshold" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  parameters.level = adjustment.level ?? 128;
  return { status: "converted", kind: "threshold", parameters, notes: [] };
}

const BW_RANGES = ["reds", "yellows", "greens", "cyans", "blues", "magentas"] as const;
/** Photoshop 흑백 기본 가중 — 필드가 비어 있는 조정에서 실행기 기본값으로 쓴다. */
const BW_DEFAULTS: Readonly<Record<(typeof BW_RANGES)[number], number>> = {
  reds: 40, yellows: 60, greens: 40, cyans: 60, blues: 20, magentas: 80,
};

function convertBlackAndWhite(
  adjustment: Extract<AdjustmentLayer, { type: "black & white" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const notes: string[] = [];
  for (const name of BW_RANGES) parameters[name] = adjustment[name] ?? BW_DEFAULTS[name];
  if (typeof adjustment.useTint === "boolean") parameters.useTint = adjustment.useTint;
  const tint = colorToHex(adjustment.tintColor);
  if (tint) parameters.tintColor = tint;
  else if (adjustment.tintColor) notes.push("RGB가 아닌 틴트 색상이 있어 틴트는 가져오지 않았습니다.");
  if (adjustment.useTint) notes.push("흑백 틴트는 Studio 실행기의 근사로 적용됩니다.");
  return { status: "converted", kind: "black-white", parameters, notes };
}

function convertPhotoFilter(
  adjustment: Extract<AdjustmentLayer, { type: "photo filter" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const notes: string[] = [];
  const hex = colorToHex(adjustment.color);
  if (hex) parameters.color = hex;
  else {
    // Photoshop 기본 워밍 필터 색 — 색이 없으면 실행기 기본값과 같은 값을 채운다.
    parameters.color = "#ec8a00";
    notes.push("포토 필터 색상이 없어 기본 워밍 색(#ec8a00)으로 가져왔습니다.");
  }
  parameters.density = adjustment.density ?? 25;
  parameters.preserveLuminosity = adjustment.preserveLuminosity ?? true;
  return { status: "converted", kind: "photo-filter", parameters, notes };
}

const SELECTIVE_RANGES = [
  "reds", "yellows", "greens", "cyans", "blues", "magentas", "whites", "neutrals", "blacks",
] as const;

function convertSelectiveColor(
  adjustment: Extract<AdjustmentLayer, { type: "selective color" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  parameters.mode = adjustment.mode ?? "relative";
  for (const name of SELECTIVE_RANGES) {
    const values = adjustment[name];
    if (!values) continue;
    parameters[`range.${name}`] = [values.c ?? 0, values.m ?? 0, values.y ?? 0, values.k ?? 0];
  }
  return {
    status: "converted",
    kind: "selective-color",
    parameters,
    notes: ["선택 색상은 색상 섹터 분류 기준 CMYK 근사로 적용됩니다(파라미터는 무손실 보존)."],
  };
}

/** LUT 바이트 보존 상한 — 이보다 큰 내장 데이터는 파라미터만 남기고 notes로 고지한다. */
export const PSD_COLOR_LOOKUP_MAX_PRESERVED_BYTES = 1_048_576;

function bytesToNumberArray(bytes: Uint8Array | undefined): readonly number[] | undefined {
  if (!bytes || bytes.length === 0 || bytes.length > PSD_COLOR_LOOKUP_MAX_PRESERVED_BYTES) return undefined;
  return Array.from(bytes);
}

function convertColorLookup(
  adjustment: Extract<AdjustmentLayer, { type: "color lookup" }>,
): StudioPsdConvertedAdjustment {
  const parameters: Record<string, number | string | boolean | readonly number[]> = {};
  const notes: string[] = [];
  if (adjustment.lookupType) parameters.lookupType = adjustment.lookupType;
  if (adjustment.name) parameters.name = adjustment.name;
  if (adjustment.lut3DFileName) parameters.lut3DFileName = adjustment.lut3DFileName;
  if (adjustment.lutFormat) parameters.lutFormat = adjustment.lutFormat;
  if (adjustment.dataOrder) parameters.dataOrder = adjustment.dataOrder;
  if (adjustment.tableOrder) parameters.tableOrder = adjustment.tableOrder;
  if (typeof adjustment.dither === "boolean") parameters.dither = adjustment.dither;
  const lutBytes = bytesToNumberArray(adjustment.lut3DFileData);
  if (lutBytes) parameters.lutBytes = lutBytes;
  const profileBytes = bytesToNumberArray(adjustment.profile);
  if (profileBytes) parameters.profileBytes = profileBytes;
  if (adjustment.lut3DFileData && !lutBytes) {
    notes.push(`내장 LUT 데이터(${adjustment.lut3DFileData.length}바이트)가 보존 상한을 넘어 파라미터만 가져왔습니다 — 픽셀에는 적용되지 않습니다.`);
  } else if (adjustment.profile && !profileBytes) {
    notes.push("프로파일 데이터가 보존 상한을 넘어 파라미터만 가져왔습니다 — 픽셀에는 적용되지 않습니다.");
  } else if (!lutBytes && !profileBytes) {
    notes.push("LUT 데이터가 PSD에 내장돼 있지 않아 파라미터만 보존했습니다 — 픽셀에는 적용되지 않습니다.");
  } else if (profileBytes && !lutBytes) {
    notes.push("프로파일형 컬러 룩업은 파라미터만 보존했습니다 — 픽셀에는 적용되지 않습니다.");
  } else if (adjustment.lutFormat && adjustment.lutFormat !== "cube") {
    notes.push(`${adjustment.lutFormat} 형식 LUT는 바이트만 보존했습니다 — 픽셀 적용은 .cube 형식만 지원합니다.`);
  }
  return { status: "converted", kind: "color-lookup", parameters, notes };
}

const UNSUPPORTED_REASONS: Readonly<Record<string, string>> = {};

/**
 * ag-psd 조정 레이어 1건을 Studio 조정으로 변환한다.
 * 변환 불가 종류는 throw 하지 않고 status:"unsupported" 로 돌려준다 —
 * 가져오기 전체를 막지 않고 리포트 정밀도만 높이는 것이 목적이다.
 */
export function convertPsdAdjustmentLayer(
  adjustment: AdjustmentLayer,
): StudioPsdAdjustmentConversion {
  switch (adjustment.type) {
    case "levels":
      return convertLevels(adjustment);
    case "curves":
      return convertCurves(adjustment);
    case "hue/saturation":
      return convertHueSaturation(adjustment);
    case "color balance":
      return convertColorBalance(adjustment);
    case "channel mixer":
      return convertChannelMixer(adjustment);
    case "gradient map":
      return convertGradientMap(adjustment);
    case "brightness/contrast":
      return convertBrightnessContrast(adjustment);
    case "exposure":
      return convertExposure(adjustment);
    case "vibrance":
      return convertVibrance(adjustment);
    case "invert":
      // 반전은 파라미터가 없는 종류다 — 빈 파라미터로 변환한다.
      return { status: "converted", kind: "invert", parameters: {}, notes: [] };
    case "posterize":
      return convertPosterize(adjustment);
    case "threshold":
      return convertThreshold(adjustment);
    case "black & white":
      return convertBlackAndWhite(adjustment);
    case "photo filter":
      return convertPhotoFilter(adjustment);
    case "selective color":
      return convertSelectiveColor(adjustment);
    case "color lookup":
      return convertColorLookup(adjustment);
    default: {
      // 미래의 ag-psd 조정 종류를 위한 런타임 폴백. 현재 유니온은 switch에서
      // 완전하게 좁혀지므로, 새 런타임 값만 별도 구조로 읽는다.
      const psdTypeValue = (adjustment as { type?: unknown }).type;
      const psdType = typeof psdTypeValue === "string" ? psdTypeValue : "unknown";
      return {
        status: "unsupported",
        psdType,
        reason: UNSUPPORTED_REASONS[psdType] ?? `알 수 없는 PSD 조정 종류(${psdType})입니다.`,
      };
    }
  }
}

/** 가져오기 리포트용: 변환 결과 묶음을 종류별 건수로 요약한다. */
export function summarizePsdAdjustmentConversions(
  conversions: readonly StudioPsdAdjustmentConversion[],
): { converted: number; unsupported: number; byKind: Readonly<Record<string, number>> } {
  const byKind: Record<string, number> = {};
  let converted = 0;
  let unsupported = 0;
  for (const conversion of conversions) {
    if (conversion.status === "converted") {
      converted += 1;
      byKind[conversion.kind] = (byKind[conversion.kind] ?? 0) + 1;
    } else {
      unsupported += 1;
      byKind[`psd:${conversion.psdType}`] = (byKind[`psd:${conversion.psdType}`] ?? 0) + 1;
    }
  }
  return { converted, unsupported, byKind };
}
