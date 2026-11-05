/**
 * 자체 잠재 안료 엔진의 공개 CPU API. 외부 구현·계수·LUT를 가져오지 않는다.
 * RGB/RGBA, CSS 색, 선형 RGB와 잠재 색의 입출력 형식만 한 경계에서 정규화한다.
 * 알파는 RGB와 독립적으로 선형 보간한다. 따라서 투명색의 RGB도 혼색에 참여한다.
 * 기존 GPU의 coverage 가중 알파 혼색과는 계약이 다르며, 원본과 색 출력 일치를 보장하지 않는다.
 */
import { parse as parseCssColor } from "culori";

import {
  latentPigmentToRgb,
  mixRgbPigments,
  rgbToLatentPigment,
} from "./latent-pigment-mixer";
import type { LatentPigment, LatentPigmentRgb } from "./latent-pigment-mixer";

export const LATENT_SIZE = 7;
export type PackedLatentPigment = readonly [number, number, number, number, number, number, number];
export type PigmentNumericColor = readonly number[] | Float32Array | Float64Array;
export interface PigmentRgbObject { readonly r: number; readonly g: number; readonly b: number; readonly a?: number; }
export type PigmentRgbInput = PigmentNumericColor | PigmentRgbObject;
export type PigmentColorInput = PigmentRgbInput | string;

interface NormalizedColor {
  readonly rgb: LatentPigmentRgb;
  readonly alpha: number;
  readonly hasAlpha: boolean;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label}은 유한한 수여야 합니다.`);
  }
  return value;
}

function boundedNumber(value: unknown, maximum: number, label: string): number {
  const checked = finiteNumber(value, label);
  if (checked < 0 || checked > maximum) {
    throw new RangeError(`${label}은 0부터 ${maximum} 사이여야 합니다.`);
  }
  return checked;
}

function numericColor(value: PigmentRgbInput, maximum: number): NormalizedColor {
  if (value !== null && typeof value === "object" && "r" in value && "g" in value && "b" in value) {
    return {
      rgb: [boundedNumber(value.r, maximum, "R") / maximum, boundedNumber(value.g, maximum, "G") / maximum, boundedNumber(value.b, maximum, "B") / maximum],
      alpha: value.a === undefined ? 1 : boundedNumber(value.a, maximum, "알파") / maximum,
      hasAlpha: value.a !== undefined,
    };
  }
  if (!Array.isArray(value) && !(value instanceof Float32Array) && !(value instanceof Float64Array)) {
    throw new TypeError("색은 RGB 또는 RGBA 배열이어야 합니다.");
  }
  if (value.length !== 3 && value.length !== 4) {
    throw new RangeError("색 배열은 RGB 3개 또는 RGBA 4개 채널이어야 합니다.");
  }
  return {
    rgb: [
      boundedNumber(value[0], maximum, "R") / maximum,
      boundedNumber(value[1], maximum, "G") / maximum,
      boundedNumber(value[2], maximum, "B") / maximum,
    ],
    alpha: value.length === 4 ? boundedNumber(value[3], maximum, "알파") / maximum : 1,
    hasAlpha: value.length === 4,
  };
}

function cssNumber(token: string, maximum: number, label: string): number {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%)?$/iu.exec(token);
  if (match === null) throw new TypeError(`${label}의 CSS 숫자 형식이 잘못됐습니다.`);
  const scale = match[2] === "%" ? 100 : maximum;
  return boundedNumber(Number(match[1]), scale, label) / scale;
}

function cssColor(value: string): NormalizedColor {
  const source = value.trim();
  if (/^[a-z]+$/iu.test(source)) {
    const named = parseCssColor(source.toLowerCase());
    if (named?.mode !== "rgb") throw new TypeError("알 수 없는 CSS 색 이름입니다.");
    return numericColor(named.alpha === undefined ? [named.r, named.g, named.b] : [named.r, named.g, named.b, named.alpha], 1);
  }
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.exec(source);
  if (hex !== null) {
    const expanded = hex[1].length <= 4
      ? [...hex[1]].map((digit) => digit + digit).join("")
      : hex[1];
    const channels: number[] = [];
    for (let index = 0; index < expanded.length; index += 2) {
      channels.push(Number.parseInt(expanded.slice(index, index + 2), 16));
    }
    return numericColor(channels, 255);
  }
  const functional = /^(rgb|rgba)\(([^()]*)\)$/iu.exec(source);
  if (functional === null) throw new TypeError("CSS 색은 #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() 또는 rgba()여야 합니다.");
  const body = functional[2].trim();
  let components: readonly string[];
  if (body.includes(",")) {
    if (body.includes("/")) throw new TypeError("CSS 쉼표 형식에 슬래시를 함께 쓸 수 없습니다.");
    components = body.split(",").map((component) => component.trim());
  } else {
    const sections = body.split("/");
    if (sections.length > 2) throw new TypeError("CSS 알파 구분자는 하나만 쓸 수 있습니다.");
    const rgb = sections[0].trim().split(/\s+/u);
    components = sections.length === 2 ? [...rgb, sections[1].trim()] : rgb;
  }
  if ((components.length !== 3 && components.length !== 4)
    || (functional[1].toLowerCase() === "rgba" && components.length !== 4)) {
    throw new RangeError("CSS 색의 RGB 또는 RGBA 채널 개수가 잘못됐습니다.");
  }
  return {
    rgb: [cssNumber(components[0], 255, "R"), cssNumber(components[1], 255, "G"), cssNumber(components[2], 255, "B")],
    alpha: components.length === 4 ? cssNumber(components[3], 1, "알파") : 1,
    hasAlpha: components.length === 4,
  };
}

function byteColor(value: PigmentColorInput): NormalizedColor {
  return typeof value === "string" ? cssColor(value) : numericColor(value, 255);
}

function ratio(value: number): number {
  return Math.min(1, Math.max(0, finiteNumber(value, "혼합 비율")));
}

/** 표준 sRGB 전달함수. 알파에는 적용하지 않는다. */
export function pigmentSrgbToLinear(value: number): number {
  const channel = boundedNumber(value, 1, "sRGB 채널");
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function pigmentLinearToSrgb(value: number): number {
  const channel = boundedNumber(value, 1, "선형 RGB 채널");
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function mapRgb(rgb: LatentPigmentRgb, convert: (value: number) => number): LatentPigmentRgb {
  return [convert(rgb[0]), convert(rgb[1]), convert(rgb[2])];
}

function mixColors(first: NormalizedColor, second: NormalizedColor, weight: number): NormalizedColor {
  const t = ratio(weight);
  // 끝점은 원본의 부동소수 값까지 보존하고 불필요한 역변환을 피한다.
  const rgb = t === 0 ? first.rgb : t === 1 ? second.rgb : mixRgbPigments([
    { rgb: first.rgb, weight: 1 - t },
    { rgb: second.rgb, weight: t },
  ]);
  return {
    rgb,
    alpha: first.alpha * (1 - t) + second.alpha * t,
    hasAlpha: first.hasAlpha || second.hasAlpha,
  };
}

function colorArray(color: NormalizedColor, maximum: number, round: boolean): number[] {
  const channel = (value: number): number => round ? Math.round(value * maximum) : value * maximum;
  const output = color.rgb.map(channel);
  if (color.hasAlpha) output.push(channel(color.alpha));
  return output;
}

/** 8비트 RGB/RGBA 또는 CSS 색을 섞고 8비트 배열을 반환한다. 배열의 알파도 0~255다. */
export function lerp(first: PigmentColorInput, second: PigmentColorInput, weight: number): number[] {
  return colorArray(mixColors(byteColor(first), byteColor(second), weight), 255, true);
}

/** 감마 인코딩 sRGB의 모든 채널과 알파는 0~1이다. */
export function lerpFloat(first: PigmentRgbInput, second: PigmentRgbInput, weight: number): number[] {
  return colorArray(mixColors(numericColor(first, 1), numericColor(second, 1), weight), 1, false);
}

/** 선형 RGB를 sRGB로 인코딩해 자체 안료 공간에서 섞은 뒤 선형 RGB로 반환한다. */
export function lerpLinearFloat(first: PigmentRgbInput, second: PigmentRgbInput, weight: number): number[] {
  const a = numericColor(first, 1);
  const b = numericColor(second, 1);
  const t = ratio(weight);
  if (t === 0) return colorArray({ ...a, hasAlpha: a.hasAlpha || b.hasAlpha }, 1, false);
  if (t === 1) return colorArray({ ...b, hasAlpha: a.hasAlpha || b.hasAlpha }, 1, false);
  const mixed = mixColors(
    { ...a, rgb: mapRgb(a.rgb, pigmentLinearToSrgb) },
    { ...b, rgb: mapRgb(b.rgb, pigmentLinearToSrgb) },
    t,
  );
  return colorArray({ ...mixed, rgb: mapRgb(mixed.rgb, pigmentSrgbToLinear) }, 1, false);
}

/** 잠재 색 배열은 자체 모델 전용이다. 외부 엔진의 7채널 데이터와 교환할 수 없다. */
export function unpackLatentPigment(value: PigmentNumericColor): LatentPigment {
  if ((!Array.isArray(value) && !(value instanceof Float32Array) && !(value instanceof Float64Array))
    || value.length !== LATENT_SIZE) {
    throw new RangeError("자체 잠재 색은 숫자 7개 배열이어야 합니다.");
  }
  for (let index = 0; index < LATENT_SIZE; index += 1) finiteNumber(value[index], `잠재 색 ${index}`);
  const latent: LatentPigment = {
    concentrations: [value[0], value[1], value[2], value[3]],
    residual: [value[4], value[5], value[6]],
  };
  latentPigmentToRgb(latent); // 농도 합·음수 허용치는 기존 혼합기의 계약을 그대로 적용한다.
  return latent;
}

export function packLatentPigment(value: LatentPigment): PackedLatentPigment {
  latentPigmentToRgb(value);
  return [
    value.concentrations[0], value.concentrations[1], value.concentrations[2], value.concentrations[3],
    value.residual[0], value.residual[1], value.residual[2],
  ];
}

function components(first: PigmentRgbInput | number, green: number | undefined, blue: number | undefined): PigmentRgbInput {
  if (typeof first === "number") return [first, green ?? Number.NaN, blue ?? Number.NaN];
  if (green !== undefined || blue !== undefined) throw new TypeError("RGB 배열과 개별 채널을 함께 전달할 수 없습니다.");
  return first;
}

export function rgbToLatent(color: PigmentColorInput): PackedLatentPigment;
export function rgbToLatent(red: number, green: number, blue: number): PackedLatentPigment;
export function rgbToLatent(first: PigmentColorInput | number, green?: number, blue?: number): PackedLatentPigment {
  if (typeof first === "string") {
    if (green !== undefined || blue !== undefined) throw new TypeError("CSS 색과 개별 채널을 함께 전달할 수 없습니다.");
    return packLatentPigment(rgbToLatentPigment(cssColor(first).rgb));
  }
  return packLatentPigment(rgbToLatentPigment(numericColor(components(first, green, blue), 255).rgb));
}

export function floatRgbToLatent(color: PigmentRgbInput): PackedLatentPigment;
export function floatRgbToLatent(red: number, green: number, blue: number): PackedLatentPigment;
export function floatRgbToLatent(first: PigmentRgbInput | number, green?: number, blue?: number): PackedLatentPigment {
  return packLatentPigment(rgbToLatentPigment(numericColor(components(first, green, blue), 1).rgb));
}

export function linearFloatRgbToLatent(color: PigmentRgbInput): PackedLatentPigment;
export function linearFloatRgbToLatent(red: number, green: number, blue: number): PackedLatentPigment;
export function linearFloatRgbToLatent(first: PigmentRgbInput | number, green?: number, blue?: number): PackedLatentPigment {
  const rgb = numericColor(components(first, green, blue), 1).rgb;
  return packLatentPigment(rgbToLatentPigment(mapRgb(rgb, pigmentLinearToSrgb)));
}

export function latentToFloatRgb(latent: PigmentNumericColor): number[] {
  return [...latentPigmentToRgb(unpackLatentPigment(latent))];
}

export function latentToRgb(latent: PigmentNumericColor): number[] {
  return latentToFloatRgb(latent).map((value) => Math.round(value * 255));
}

export function latentToLinearFloatRgb(latent: PigmentNumericColor): number[] {
  return latentToFloatRgb(latent).map(pigmentSrgbToLinear);
}

export const toonstudioPigment = Object.freeze({
  LATENT_SIZE,
  lerp,
  lerpFloat,
  lerpLinearFloat,
  rgbToLatent,
  latentToRgb,
  floatRgbToLatent,
  latentToFloatRgb,
  linearFloatRgbToLatent,
  latentToLinearFloatRgb,
});
