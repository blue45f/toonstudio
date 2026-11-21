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

import {
  buildGradientMapLut,
  type StudioGradientStop,
} from "../drawing/studio-gradient-map";
import type { StudioAdjustmentKind } from "../filter/studio-adjustment-effect-graph";
import type { StudioAdjustmentLayerSpec } from "../layer/studio-adjustment-layer";

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


function hexToRgbColor(hex: string | undefined): { r: number; g: number; b: number } | undefined {
  if (!hex) return undefined;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return undefined;
  const packed = Number.parseInt(m[1]!, 16);
  return { r: (packed >> 16) & 0xff, g: (packed >> 8) & 0xff, b: packed & 0xff };
}

function strParam(
  parameters: StudioPsdAdjustmentParameters,
  key: string,
): string | undefined {
  const value = parameters[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
    // 평탄 배열 [in0, out0, in1, out1, ...] — 홀수 꼬리와 비유한 수치는 버린다.
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const input = flat[i]!;
      const output = flat[i + 1]!;
      if (Number.isFinite(input) && Number.isFinite(output)) {
        points.push({ input, output });
      }
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
    if (!range.slice(0, 7).every((item) => typeof item === "number" && Number.isFinite(item))) continue;
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
  const rawStops: { color: { r: number; g: number; b: number }; location: number; midpoint: number }[] = [];
  if (typeof stopsValue === "string" && stopsValue.length > 0) {
    for (const entry of stopsValue.split(",")) {
      const stop = parseGradientStop(entry);
      if (stop) rawStops.push(stop);
    }
  }
  const useOklabResample =
    parameters.interpolationSpace === "oklab" && rawStops.length >= 2;
  const colorStops = useOklabResample
    ? resampleGradientStopsInOklab(rawStops, 17)
    : rawStops;

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

/**
 * OKLab 지각 균일 보간 그라데이션 맵을 Photoshop 네이티브 PSD 스톱(0..4096)으로
 * 고밀도 재샘플링해 보색 구간의 회색 탁 현상을 방지한다.
 */
function resampleGradientStopsInOklab(
  stops: readonly { color: { r: number; g: number; b: number }; location: number; midpoint: number }[],
  sampleCount: number,
): { color: { r: number; g: number; b: number }; location: number; midpoint: number }[] {
  const scale = stops.some((stop) => stop.location > 1) ? 4096 : 1;
  const studioStops: StudioGradientStop[] = stops.map((stop) => ({
    position: Math.min(1, Math.max(0, stop.location / scale)),
    color: [stop.color.r, stop.color.g, stop.color.b] as const,
  }));
  const count = Math.max(2, Math.min(32, Math.round(sampleCount)));
  const lut = buildGradientMapLut(studioStops, count, { interpolationSpace: "oklab" });
  const resampled: { color: { r: number; g: number; b: number }; location: number; midpoint: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    resampled.push({
      color: { r: lut[i * 3]!, g: lut[i * 3 + 1]!, b: lut[i * 3 + 2]! },
      location: Math.round((i / (count - 1)) * 4096),
      midpoint: 50,
    });
  }
  return resampled;
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


const BW_RANGES = ["reds", "yellows", "greens", "cyans", "blues", "magentas"] as const;
const SELECTIVE_RANGES = [
  "reds", "yellows", "greens", "cyans", "blues", "magentas", "whites", "neutrals", "blacks",
] as const;

function convertBlackWhite(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "black & white" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "black & white" }> = { type: "black & white" };
  for (const name of BW_RANGES) {
    const v = numParam(parameters, name);
    if (v !== undefined) adjustment[name] = v;
  }
  const useTint = boolParam(parameters, "useTint");
  if (useTint !== undefined) adjustment.useTint = useTint;
  const tint = hexToRgbColor(strParam(parameters, "tintColor"));
  if (tint) adjustment.tintColor = tint;
  return adjustment;
}

function convertPhotoFilter(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "photo filter" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "photo filter" }> = { type: "photo filter" };
  const color = hexToRgbColor(strParam(parameters, "color"));
  if (color) adjustment.color = color;
  const density = numParam(parameters, "density");
  if (density !== undefined) adjustment.density = density;
  const preserve = boolParam(parameters, "preserveLuminosity");
  if (preserve !== undefined) adjustment.preserveLuminosity = preserve;
  return adjustment;
}

function convertSelectiveColor(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "selective color" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "selective color" }> = { type: "selective color" };
  const mode = strParam(parameters, "mode");
  if (mode === "relative" || mode === "absolute") adjustment.mode = mode;
  for (const name of SELECTIVE_RANGES) {
    const range = parameters[`range.${name}`];
    if (!Array.isArray(range) || range.length < 4) continue;
    if (!range.slice(0, 4).every((item) => typeof item === "number" && Number.isFinite(item))) continue;
    adjustment[name] = { c: range[0]!, m: range[1]!, y: range[2]!, k: range[3]! };
  }
  return adjustment;
}

function convertColorLookup(
  parameters: StudioPsdAdjustmentParameters,
): Extract<AdjustmentLayer, { type: "color lookup" }> {
  const adjustment: Extract<AdjustmentLayer, { type: "color lookup" }> = { type: "color lookup" };
  const lookupType = strParam(parameters, "lookupType");
  if (lookupType === "3dlut" || lookupType === "abstractProfile" || lookupType === "deviceLinkProfile") {
    adjustment.lookupType = lookupType;
  }
  const name = strParam(parameters, "name");
  if (name !== undefined) adjustment.name = name;
  const fileName = strParam(parameters, "lut3DFileName");
  if (fileName !== undefined) adjustment.lut3DFileName = fileName;
  const lutFormat = strParam(parameters, "lutFormat");
  if (lutFormat === "look" || lutFormat === "cube" || lutFormat === "3dl") adjustment.lutFormat = lutFormat;
  const dataOrder = strParam(parameters, "dataOrder");
  if (dataOrder === "rgb" || dataOrder === "bgr") adjustment.dataOrder = dataOrder;
  const tableOrder = strParam(parameters, "tableOrder");
  if (tableOrder === "rgb" || tableOrder === "bgr") adjustment.tableOrder = tableOrder;
  const dither = boolParam(parameters, "dither");
  if (dither !== undefined) adjustment.dither = dither;
  const lutBytes = parameters.lutBytes;
  if (Array.isArray(lutBytes) && lutBytes.length > 0) {
    adjustment.lut3DFileData = Uint8Array.from(lutBytes);
  }
  const profileBytes = parameters.profileBytes;
  if (Array.isArray(profileBytes) && profileBytes.length > 0) {
    adjustment.profile = Uint8Array.from(profileBytes);
  }
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
    case "black-white":
      return { status: "converted", adjustment: convertBlackWhite(parameters) };
    case "photo-filter":
      return { status: "converted", adjustment: convertPhotoFilter(parameters) };
    case "selective-color":
      return { status: "converted", adjustment: convertSelectiveColor(parameters) };
    case "color-lookup":
      return { status: "converted", adjustment: convertColorLookup(parameters) };
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

// ---------------------------------------------------------------------------
// 비파괴 스택형 조정 레이어 PSD Descriptor 직렬화기 (Top 25 #12)
// ---------------------------------------------------------------------------

/** Photoshop 조정 레이어 4바이트 리소스/디스크립터 키 매핑. */
export const PSD_ADJUSTMENT_DESCRIPTOR_TAGS: Readonly<
  Partial<Record<StudioAdjustmentKind, string>>
> = Object.freeze({
  levels: "levl",
  curves: "curv",
  hsl: "hue2",
  "color-balance": "blnc",
  "channel-mixer": "mixr",
  "gradient-map": "grdm",
  "brightness-contrast": "brit",
  exposure: "expA",
  vibrance: "vibA",
  invert: "nvrt",
  posterize: "post",
  threshold: "thrs",
  "black-white": "blwh",
  "photo-filter": "phfl",
  "selective-color": "selc",
  "color-lookup": "clrL",
});

export type StudioPsdAdjustmentDescriptorFidelity = "exact" | "oklab-resampled";

export interface StudioPsdAdjustmentDescriptorExported {
  readonly status: "exported";
  readonly layerId: string;
  readonly name: string;
  readonly kind: StudioAdjustmentKind;
  readonly descriptorTag: string;
  readonly adjustment: AdjustmentLayer;
  readonly clipping: boolean;
  /** Photoshop 0..255 정수 불투명도 바이트. */
  readonly opacityByte: number;
  readonly blendMode: string;
  readonly hidden: boolean;
  readonly fidelity: StudioPsdAdjustmentDescriptorFidelity;
  readonly notes: readonly string[];
}

export interface StudioPsdAdjustmentDescriptorUnsupported {
  readonly status: "unsupported";
  readonly layerId: string;
  readonly name: string;
  readonly kind: StudioAdjustmentKind;
  readonly reason: string;
}

export type StudioPsdAdjustmentDescriptorResult =
  | StudioPsdAdjustmentDescriptorExported
  | StudioPsdAdjustmentDescriptorUnsupported;

export interface StudioPsdAdjustmentStackExportBundle {
  /** PSD 패널 순서(위→아래)로 정렬된 비파괴 조정 디스크립터 목록. */
  readonly descriptors: readonly StudioPsdAdjustmentDescriptorExported[];
  readonly skipped: readonly StudioPsdAdjustmentDescriptorUnsupported[];
  readonly stats: {
    readonly total: number;
    readonly exportedCount: number;
    readonly oklabResampledCount: number;
    readonly skippedCount: number;
  };
}

function byteHex2(value: number): string {
  return Math.min(255, Math.max(0, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

/** Studio RGB 그라데이션 스톱 목록을 PSD 파라미터 문자열(`location:#rrggbb:50`)로 인코딩한다. */
export function encodeGradientStopsForPsdParameter(
  stops: readonly StudioGradientStop[],
): string {
  const prefix = String.fromCharCode(35);
  return [...stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => {
      const location = Math.round(Math.min(1, Math.max(0, stop.position)) * 4096);
      const color = `${prefix}${byteHex2(stop.color[0])}${byteHex2(stop.color[1])}${byteHex2(stop.color[2])}`;
      return `${location}:${color}:50`;
    })
    .join(",");
}

/**
 * 1급 스택형 `StudioAdjustmentLayerSpec` 1건을 래스터화 없는 PSD 네이티브 디스크립터로 직렬화한다.
 */
export function serializeAdjustmentLayerPsdDescriptor(
  spec: StudioAdjustmentLayerSpec,
): StudioPsdAdjustmentDescriptorResult {
  const converted = convertStudioAdjustmentToPsd(spec.adjustment, spec.parameters);
  if (converted.status !== "converted") {
    return {
      status: "unsupported",
      layerId: spec.id,
      name: spec.name,
      kind: spec.adjustment,
      reason: converted.reason,
    };
  }

  const descriptorTag = PSD_ADJUSTMENT_DESCRIPTOR_TAGS[spec.adjustment] ?? "adjL";
  const isOklabResampled =
    spec.adjustment === "gradient-map" &&
    spec.parameters.interpolationSpace === "oklab" &&
    converted.adjustment.type === "gradient map" &&
    (converted.adjustment.colorStops?.length ?? 0) >= 2;

  const notes: string[] = [];
  if (isOklabResampled) {
    notes.push(
      "OKLab 지각 균일 보간 그라데이션 맵을 17스톱 고밀도 PSD 스톱으로 재샘플링해 색감 왜곡을 최소화했습니다.",
    );
  }

  const clampedOpacity = Number.isFinite(spec.opacity)
    ? Math.min(1, Math.max(0, spec.opacity))
    : 1;

  return {
    status: "exported",
    layerId: spec.id,
    name: spec.name,
    kind: spec.adjustment,
    descriptorTag,
    adjustment: converted.adjustment,
    clipping: spec.clipToBelow,
    opacityByte: Math.round(clampedOpacity * 255),
    blendMode: spec.blendMode || "source-over",
    hidden: !spec.enabled,
    fidelity: isOklabResampled ? "oklab-resampled" : "exact",
    notes,
  };
}

/**
 * Studio 스택 순서(아래→위)의 조정 레이어 목록을 PSD 패널 순서(위→아래)의 비파괴 디스크립터 번들로 직렬화한다.
 */
export function serializeAdjustmentStackToPsdDescriptors(
  specsBottomToTop: readonly StudioAdjustmentLayerSpec[],
): StudioPsdAdjustmentStackExportBundle {
  const descriptors: StudioPsdAdjustmentDescriptorExported[] = [];
  const skipped: StudioPsdAdjustmentDescriptorUnsupported[] = [];
  let oklabResampledCount = 0;

  for (let i = specsBottomToTop.length - 1; i >= 0; i -= 1) {
    const spec = specsBottomToTop[i]!;
    const result = serializeAdjustmentLayerPsdDescriptor(spec);
    if (result.status === "exported") {
      descriptors.push(result);
      if (result.fidelity === "oklab-resampled") oklabResampledCount += 1;
    } else {
      skipped.push(result);
    }
  }

  return {
    descriptors,
    skipped,
    stats: {
      total: specsBottomToTop.length,
      exportedCount: descriptors.length,
      oklabResampledCount,
      skippedCount: skipped.length,
    },
  };
}
