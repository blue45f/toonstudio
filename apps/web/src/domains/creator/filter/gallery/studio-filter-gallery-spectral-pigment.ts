/**
 * 필터 갤러리 · 7밴드 분광 Kubelka-Munk 안료 필터 4종 (WebGPU Compute + CPU 동등 폴백).
 *
 * 1. 분광 감산 그라데이션 맵 (`color.km7-spectral-gradient-map`)
 * 2. 안료 색온도 시프트 (`color.km7-pigment-temperature-shift`)
 * 3. 전통 화구 글레이징 필터 (`color.km7-traditional-glazing`)
 * 4. 안료 색조화 하모나이저 (`color.km7-pigment-harmonizer`)
 *
 * 모든 커널은 알파 채널을 보존하고 결정적으로 동작한다(`Math.random`·시계 없음).
 * WebGPU Compute 셰이더(`STUDIO_WEBGPU_KM7_FILTER_COMPUTE_WGSL`)와 동일한 7밴드 KM·Oklab 수식을 공유한다.
 */

import {
  KM7_FILTER_OP_GLAZING,
  KM7_FILTER_OP_GRADIENT_MAP,
  KM7_FILTER_OP_HARMONIZER,
  KM7_FILTER_OP_TEMP_SHIFT,
  StudioWebGpuKm7FilterComputePipeline,
  type Km7FilterComputeUniformInput,
  type Km7WebGpuFilterDispatchReceipt,
} from "../../render/studio-webgpu-km-wgsl";
import {
  glazeKm7SpectralSrgb,
  km7LinearRgbToOklab,
  km7LinearToSrgb,
  km7OklabToLinearRgb,
  km7SrgbToLinear,
  mixKm7SpectralSrgb,
  type Km7Rgb01,
} from "../../render/studio-webgpu-km7-spectral-core";

import { clamp, clamp01, clamp255 } from "./studio-filter-gallery-kernel-utils";
import {
  paramChoices,
  paramColor,
  paramSelect,
  paramSlider,
  paramToggle,
  readColor,
  readSelect,
  readSlider,
  readToggle,
  type Rgb,
} from "./studio-filter-gallery-param-specs";

import type {
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

export const KM7_SPECTRAL_FILTER_IDS = Object.freeze([
  "color.km7-spectral-gradient-map",
  "color.km7-pigment-temperature-shift",
  "color.km7-traditional-glazing",
  "color.km7-pigment-harmonizer",
] as const);

export type Km7SpectralFilterId = (typeof KM7_SPECTRAL_FILTER_IDS)[number];

/* -------------------------------------------------------------------------- */
/* 파라미터 명세                                                               */
/* -------------------------------------------------------------------------- */

const GRAD_SHADOW = paramColor("shadowColor", "암부 안료", "#0a2f8f");
const GRAD_MIDTONE = paramColor("midtoneColor", "중간 안료", "#2d9b58");
const GRAD_HIGHLIGHT = paramColor("highlightColor", "명부 안료", "#fde030");
const GRAD_USE_MIDTONE = paramToggle("useMidtone", "중간 안료 사용 (끄면 2색 감산)", false);
const GRAD_MIDPOINT = paramSlider("midpoint", "명암 중심점", 15, 85, 50, "%");
const GRAD_CHROMA = paramSlider("chromaPreserve", "Oklab 채도 보존", 0, 100, 40, "%");
const GRAD_MIX = paramSlider("mixAmount", "적용 강도", 0, 100, 100, "%");

const TEMP_TEMPERATURE = paramSlider("temperature", "안료 색온도 (청 ↔ 황적)", -100, 100, 32);
const TEMP_TINT = paramSlider("tint", "안료 색조 (비리디안 ↔ 로즈)", -100, 100, 0);
const TEMP_LUMA_KEEP = paramSlider("preserveLightness", "Oklab 명도 보존", 0, 100, 82, "%");
const TEMP_CHROMA = paramSlider("chromaPreserve", "채도 보존", 0, 100, 35, "%");
const TEMP_STRENGTH = paramSlider("strength", "적용 강도", 0, 100, 100, "%");

const GLAZE_COLOR = paramColor("glazeColor", "글레이즈 안료", "#f5c418");
const GLAZE_OPACITY = paramSlider("glazeOpacity", "유약 농도", 0, 100, 38, "%");
const GLAZE_LAYERS = paramSlider("layers", "글레이징 겹 수", 1, 5, 2, "겹");
const GLAZE_SCATTER = paramSlider("scatter", "안료 표층 산란", 0, 100, 22, "%");
const GLAZE_PAPER = paramSlider("paperPreserve", "하이라이트 종이 보호", 0, 100, 30, "%");

const HARMONY_MOTHER = paramColor("motherColor", "기조 안료 (Mother Color)", "#d97724");
const HARMONY_MODE = paramSelect(
  "harmonyMode",
  "조화 방식",
  paramChoices(
    ["analogous-mother", "단일 기조 안료 통일"],
    ["complementary-shadow", "보색 암부 조화"],
    ["split-warm-cool", "난색 명부 · 한색 암부"],
  ),
  "analogous-mother",
);
const HARMONY_STRENGTH = paramSlider("strength", "조화 강도", 0, 100, 48, "%");
const HARMONY_CHROMA = paramSlider("chromaPreserve", "채도 보존", 0, 100, 35, "%");

const WARM_PIGMENT: Km7Rgb01 = Object.freeze({ r: 0.97, g: 0.62, b: 0.16 });
const COOL_PIGMENT: Km7Rgb01 = Object.freeze({ r: 0.12, g: 0.42, b: 0.88 });
const GREEN_PIGMENT: Km7Rgb01 = Object.freeze({ r: 0.14, g: 0.68, b: 0.42 });
const ROSE_PIGMENT: Km7Rgb01 = Object.freeze({ r: 0.84, g: 0.24, b: 0.56 });
const WARM_HIGHLIGHT_ANCHOR: Km7Rgb01 = Object.freeze({ r: 0.98, g: 0.78, b: 0.34 });
const COOL_SHADOW_ANCHOR: Km7Rgb01 = Object.freeze({ r: 0.16, g: 0.34, b: 0.72 });

function rgb255To01(rgb: Rgb): Km7Rgb01 {
  return { r: rgb[0] / 255, g: rgb[1] / 255, b: rgb[2] / 255 };
}

function rgb255ToTuple01(rgb: Rgb): readonly [number, number, number] {
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

function linearLuma(srgb: Km7Rgb01): number {
  const lr = km7SrgbToLinear(srgb.r);
  const lg = km7SrgbToLinear(srgb.g);
  const lb = km7SrgbToLinear(srgb.b);
  return clamp01(0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
}

/* -------------------------------------------------------------------------- */
/* CPU 7밴드 KM 필터 커널 4종 (WGSL Compute와 동일 수식)                        */
/* -------------------------------------------------------------------------- */

export function applyKm7SpectralGradientMap(
  image: StudioFilterGalleryImage,
  params: StudioFilterGalleryParams,
): void {
  const shadow = rgb255To01(readColor(params, GRAD_SHADOW));
  const midtone = rgb255To01(readColor(params, GRAD_MIDTONE));
  const highlight = rgb255To01(readColor(params, GRAD_HIGHLIGHT));
  const useMidtone = readToggle(params, GRAD_USE_MIDTONE);
  const midpoint = clamp(readSlider(params, GRAD_MIDPOINT) / 100, 0.1, 0.9);
  const chromaPreserve = readSlider(params, GRAD_CHROMA) / 100;
  const mixAmount = readSlider(params, GRAD_MIX) / 100;
  if (mixAmount <= 0) return;

  const { width, height, data } = image;
  const pixelCount = width * height;
  const gammaExponent = Math.log(0.5) / Math.log(midpoint);

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if ((data[off + 3] ?? 0) === 0) continue;
    const src: Km7Rgb01 = {
      r: (data[off] ?? 0) / 255,
      g: (data[off + 1] ?? 0) / 255,
      b: (data[off + 2] ?? 0) / 255,
    };
    const luma = linearLuma(src);
    let mapped: Km7Rgb01;
    if (!useMidtone) {
      const warped = Math.pow(luma, gammaExponent);
      mapped = mixKm7SpectralSrgb(shadow, highlight, warped, { chromaPreserve });
    } else if (luma < midpoint) {
      mapped = mixKm7SpectralSrgb(shadow, midtone, luma / midpoint, { chromaPreserve });
    } else {
      mapped = mixKm7SpectralSrgb(
        midtone,
        highlight,
        (luma - midpoint) / Math.max(1e-4, 1 - midpoint),
        { chromaPreserve },
      );
    }
    const rOut = src.r + (mapped.r - src.r) * mixAmount;
    const gOut = src.g + (mapped.g - src.g) * mixAmount;
    const bOut = src.b + (mapped.b - src.b) * mixAmount;
    data[off] = clamp255(Math.round(rOut * 255));
    data[off + 1] = clamp255(Math.round(gOut * 255));
    data[off + 2] = clamp255(Math.round(bOut * 255));
  }
}

export function applyKm7PigmentTemperatureShift(
  image: StudioFilterGalleryImage,
  params: StudioFilterGalleryParams,
): void {
  const temp = clamp(readSlider(params, TEMP_TEMPERATURE) / 100, -1, 1);
  const tint = clamp(readSlider(params, TEMP_TINT) / 100, -1, 1);
  const preserveLightness = clamp01(readSlider(params, TEMP_LUMA_KEEP) / 100);
  const chromaPreserve = clamp01(readSlider(params, TEMP_CHROMA) / 100);
  const strength = clamp01(readSlider(params, TEMP_STRENGTH) / 100);
  if (strength <= 0 || (Math.abs(temp) < 1e-4 && Math.abs(tint) < 1e-4)) return;

  const tempTarget = temp >= 0 ? WARM_PIGMENT : COOL_PIGMENT;
  const tintTarget = tint >= 0 ? ROSE_PIGMENT : GREEN_PIGMENT;
  const tempWeight = Math.abs(temp) * 0.52 * strength;
  const tintWeight = Math.abs(tint) * 0.36 * strength;

  const { width, height, data } = image;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if ((data[off + 3] ?? 0) === 0) continue;
    const src: Km7Rgb01 = {
      r: (data[off] ?? 0) / 255,
      g: (data[off + 1] ?? 0) / 255,
      b: (data[off + 2] ?? 0) / 255,
    };
    const step1 = tempWeight > 0
      ? mixKm7SpectralSrgb(src, tempTarget, tempWeight, { chromaPreserve })
      : src;
    const step2 = tintWeight > 0
      ? mixKm7SpectralSrgb(step1, tintTarget, tintWeight, { chromaPreserve })
      : step1;

    let out = step2;
    if (preserveLightness > 0) {
      const okSrc = km7LinearRgbToOklab({
        r: km7SrgbToLinear(src.r),
        g: km7SrgbToLinear(src.g),
        b: km7SrgbToLinear(src.b),
      });
      const okDst = km7LinearRgbToOklab({
        r: km7SrgbToLinear(step2.r),
        g: km7SrgbToLinear(step2.g),
        b: km7SrgbToLinear(step2.b),
      });
      const restoredLin = km7OklabToLinearRgb({
        L: okDst.L + (okSrc.L - okDst.L) * preserveLightness,
        a: okDst.a,
        b: okDst.b,
      });
      out = {
        r: km7LinearToSrgb(restoredLin.r),
        g: km7LinearToSrgb(restoredLin.g),
        b: km7LinearToSrgb(restoredLin.b),
      };
    }

    data[off] = clamp255(Math.round(out.r * 255));
    data[off + 1] = clamp255(Math.round(out.g * 255));
    data[off + 2] = clamp255(Math.round(out.b * 255));
  }
}

export function applyKm7TraditionalGlazing(
  image: StudioFilterGalleryImage,
  params: StudioFilterGalleryParams,
): void {
  const glazeColor = rgb255To01(readColor(params, GLAZE_COLOR));
  const opacity = clamp01(readSlider(params, GLAZE_OPACITY) / 100);
  const layers = Math.round(readSlider(params, GLAZE_LAYERS));
  const scatter = clamp01(readSlider(params, GLAZE_SCATTER) / 100);
  const paperPreserve = clamp01(readSlider(params, GLAZE_PAPER) / 100);
  if (opacity <= 0) return;

  const { width, height, data } = image;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if ((data[off + 3] ?? 0) === 0) continue;
    const src: Km7Rgb01 = {
      r: (data[off] ?? 0) / 255,
      g: (data[off + 1] ?? 0) / 255,
      b: (data[off + 2] ?? 0) / 255,
    };
    const out = glazeKm7SpectralSrgb(src, glazeColor, {
      opacity,
      layers,
      scatter,
      paperPreserve,
    });
    data[off] = clamp255(Math.round(out.r * 255));
    data[off + 1] = clamp255(Math.round(out.g * 255));
    data[off + 2] = clamp255(Math.round(out.b * 255));
  }
}

export function applyKm7PigmentHarmonizer(
  image: StudioFilterGalleryImage,
  params: StudioFilterGalleryParams,
): void {
  const mother = rgb255To01(readColor(params, HARMONY_MOTHER));
  const mode = readSelect(params, HARMONY_MODE);
  const strength = clamp01(readSlider(params, HARMONY_STRENGTH) / 100);
  const chromaPreserve = clamp01(readSlider(params, HARMONY_CHROMA) / 100);
  if (strength <= 0) return;

  const comp: Km7Rgb01 = { r: 1 - mother.r, g: 1 - mother.g, b: 1 - mother.b };
  const warmHi = mode === "split-warm-cool"
    ? mixKm7SpectralSrgb(mother, WARM_HIGHLIGHT_ANCHOR, 0.45, { chromaPreserve })
    : mother;
  const coolSh = mode === "split-warm-cool"
    ? mixKm7SpectralSrgb(comp, COOL_SHADOW_ANCHOR, 0.45, { chromaPreserve })
    : comp;

  const { width, height, data } = image;
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if ((data[off + 3] ?? 0) === 0) continue;
    const src: Km7Rgb01 = {
      r: (data[off] ?? 0) / 255,
      g: (data[off + 1] ?? 0) / 255,
      b: (data[off + 2] ?? 0) / 255,
    };
    let target = mother;
    let weight = strength * 0.55;
    if (mode === "complementary-shadow") {
      const shadowW = clamp01(1 - linearLuma(src));
      target = mixKm7SpectralSrgb(mother, comp, shadowW, { chromaPreserve });
      weight = strength * (0.25 + 0.45 * shadowW);
    } else if (mode === "split-warm-cool") {
      target = mixKm7SpectralSrgb(coolSh, warmHi, linearLuma(src), { chromaPreserve });
      weight = strength * 0.5;
    }
    const out = mixKm7SpectralSrgb(src, target, weight, { chromaPreserve });
    data[off] = clamp255(Math.round(out.r * 255));
    data[off + 1] = clamp255(Math.round(out.g * 255));
    data[off + 2] = clamp255(Math.round(out.b * 255));
  }
}

/* -------------------------------------------------------------------------- */
/* WebGPU Compute 유니폼 빌더 + GPU/CPU 통합 실행 디스패처                     */
/* -------------------------------------------------------------------------- */

export function buildKm7SpectralFilterComputeUniforms(
  effectId: Km7SpectralFilterId,
  width: number,
  height: number,
  params: StudioFilterGalleryParams,
): Km7FilterComputeUniformInput {
  switch (effectId) {
    case "color.km7-spectral-gradient-map":
      return {
        width,
        height,
        op: KM7_FILTER_OP_GRADIENT_MAP,
        color0: rgb255ToTuple01(readColor(params, GRAD_SHADOW)),
        color1: rgb255ToTuple01(readColor(params, GRAD_MIDTONE)),
        color2: rgb255ToTuple01(readColor(params, GRAD_HIGHLIGHT)),
        params0: [
          clamp(readSlider(params, GRAD_MIDPOINT) / 100, 0.1, 0.9),
          readSlider(params, GRAD_CHROMA) / 100,
          readSlider(params, GRAD_MIX) / 100,
          readToggle(params, GRAD_USE_MIDTONE) ? 1 : 0,
        ],
      };
    case "color.km7-pigment-temperature-shift":
      return {
        width,
        height,
        op: KM7_FILTER_OP_TEMP_SHIFT,
        params0: [
          clamp(readSlider(params, TEMP_TEMPERATURE) / 100, -1, 1),
          clamp(readSlider(params, TEMP_TINT) / 100, -1, 1),
          readSlider(params, TEMP_CHROMA) / 100,
          readSlider(params, TEMP_STRENGTH) / 100,
        ],
        params1: [readSlider(params, TEMP_LUMA_KEEP) / 100, 0, 0, 0],
      };
    case "color.km7-traditional-glazing":
      return {
        width,
        height,
        op: KM7_FILTER_OP_GLAZING,
        color0: rgb255ToTuple01(readColor(params, GLAZE_COLOR)),
        params0: [
          readSlider(params, GLAZE_OPACITY) / 100,
          Math.round(readSlider(params, GLAZE_LAYERS)),
          readSlider(params, GLAZE_SCATTER) / 100,
          readSlider(params, GLAZE_PAPER) / 100,
        ],
      };
    case "color.km7-pigment-harmonizer": {
      const mode = readSelect(params, HARMONY_MODE);
      const flags = mode === "complementary-shadow" ? 1 : mode === "split-warm-cool" ? 2 : 0;
      return {
        width,
        height,
        op: KM7_FILTER_OP_HARMONIZER,
        flags,
        color0: rgb255ToTuple01(readColor(params, HARMONY_MOTHER)),
        params0: [
          readSlider(params, HARMONY_STRENGTH) / 100,
          readSlider(params, HARMONY_CHROMA) / 100,
          0,
          0,
        ],
      };
    }
  }
}

export interface Km7SpectralFilterWebGpuTarget {
  readonly pipeline: StudioWebGpuKm7FilterComputePipeline;
  readonly sourceView: GPUTextureView;
  readonly targetView: GPUTextureView;
}

export type Km7SpectralFilterExecutionReceipt =
  | Km7WebGpuFilterDispatchReceipt
  | {
      readonly backend: "cpu-fallback";
      readonly effectId: Km7SpectralFilterId;
      readonly pixelsProcessed: number;
    };

/**
 * WebGPU Compute 파이프라인이 주입되면 GPU Compute로 실행하고,
 * GPU 미지원·CPU 컨텍스트에서는 동일 7밴드 KM 수학의 CPU 커널로 실행한다.
 */
export function dispatchKm7SpectralFilterWebGpuOrCpu(
  effectId: Km7SpectralFilterId,
  image: StudioFilterGalleryImage,
  params: StudioFilterGalleryParams,
  gpuTarget?: Km7SpectralFilterWebGpuTarget | null,
): Km7SpectralFilterExecutionReceipt {
  if (gpuTarget) {
    const uniforms = buildKm7SpectralFilterComputeUniforms(
      effectId,
      image.width,
      image.height,
      params,
    );
    return gpuTarget.pipeline.dispatch(gpuTarget.sourceView, gpuTarget.targetView, uniforms);
  }
  switch (effectId) {
    case "color.km7-spectral-gradient-map":
      applyKm7SpectralGradientMap(image, params);
      break;
    case "color.km7-pigment-temperature-shift":
      applyKm7PigmentTemperatureShift(image, params);
      break;
    case "color.km7-traditional-glazing":
      applyKm7TraditionalGlazing(image, params);
      break;
    case "color.km7-pigment-harmonizer":
      applyKm7PigmentHarmonizer(image, params);
      break;
  }
  return {
    backend: "cpu-fallback",
    effectId,
    pixelsProcessed: Math.max(0, image.width) * Math.max(0, image.height),
  };
}

/* -------------------------------------------------------------------------- */
/* 필터 갤러리 등록 정의 4종                                                   */
/* -------------------------------------------------------------------------- */

export const STUDIO_FILTER_GALLERY_SPECTRAL_PIGMENT_EFFECTS: readonly StudioFilterGalleryEffectDef[] =
  Object.freeze([
    {
      id: "color.km7-spectral-gradient-map",
      category: "color",
      label: "분광 감산 그라데이션 맵",
      description:
        "7밴드 Kubelka-Munk 감산 혼색으로 명암을 안료 그라데이션에 매핑해 파랑→노랑 구간도 탁한 회색 없이 선명한 녹색으로 이행합니다.",
      references: ["ToonStudio · 7-Band Spectral KM", "Subtractive Gradient Map"],
      params: [
        GRAD_SHADOW,
        GRAD_HIGHLIGHT,
        GRAD_USE_MIDTONE,
        GRAD_MIDTONE,
        GRAD_MIDPOINT,
        GRAD_CHROMA,
        GRAD_MIX,
      ],
      cost: 4,
      apply: (image, params) => {
        dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-spectral-gradient-map", image, params);
      },
    },
    {
      id: "color.km7-pigment-temperature-shift",
      category: "color",
      label: "안료 색온도 시프트",
      description:
        "물감 안료의 난색(카드뮴·오커)·한색(울트라마린·세룰리안) 흡수 스펙트럼과 Oklab 명도 보존으로 화폭의 온도감을 자연스럽게 이동합니다.",
      references: ["ToonStudio · 7-Band Spectral KM", "Pigment Temperature Shift"],
      params: [TEMP_TEMPERATURE, TEMP_TINT, TEMP_LUMA_KEEP, TEMP_CHROMA, TEMP_STRENGTH],
      cost: 4,
      apply: (image, params) => {
        dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-pigment-temperature-shift", image, params);
      },
    },
    {
      id: "color.km7-traditional-glazing",
      category: "color",
      label: "전통 화구 글레이징 필터",
      description:
        "건조한 밑그림 위에 투명 유화·수채 유약(Glaze)을 여러 겹 얹는 Beer-Lambert/KM 광학 투과 적층을 시뮬레이션합니다.",
      references: ["ToonStudio · 7-Band Spectral KM", "Traditional Oil & Watercolor Glazing"],
      params: [GLAZE_COLOR, GLAZE_OPACITY, GLAZE_LAYERS, GLAZE_SCATTER, GLAZE_PAPER],
      cost: 4,
      apply: (image, params) => {
        dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-traditional-glazing", image, params);
      },
    },
    {
      id: "color.km7-pigment-harmonizer",
      category: "color",
      label: "안료 색조화 하모나이저",
      description:
        "전통 회화의 기조 안료(Mother Color) 및 보색 암부 원리를 7밴드 감산 혼색으로 적용해 컷 전체의 색채를 하나의 팔레트로 통합합니다.",
      references: ["ToonStudio · 7-Band Spectral KM", "Mother-Color Pigment Harmonizer"],
      params: [HARMONY_MOTHER, HARMONY_MODE, HARMONY_STRENGTH, HARMONY_CHROMA],
      cost: 5,
      apply: (image, params) => {
        dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-pigment-harmonizer", image, params);
      },
    },
  ]);
