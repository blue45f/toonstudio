/**
 * studio-bg3d-cycles-multipass-compositor.ts
 *
 * V6 Blender Cycles 4-패스 렌더 세트(Beauty / AO / Normal / Depth, 12세트·48 PNG)를
 * 실시간 가시성·불투명도 오버라이드로 2D RGBA8 합성하고, 클립스튜디오·포토샵 호환
 * 4레이어 PSD 파일(ag-psd)로 직렬화하는 순수 파이프라인.
 */

import { writePsdUint8Array, type BlendMode, type Layer, type Psd } from "ag-psd";

import type { StudioBg3dCyclesCompositorLayerDescriptor } from "./studio-bg3d-environment-catalog";
import {
  STUDIO_BG3D_SHOT_PSD_MAX_AGGREGATE_LAYER_PIXELS,
  STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS,
  STUDIO_BG3D_SHOT_PSD_MAX_LAYERS,
  STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES,
  STUDIO_BG3D_SHOT_PSD_MIME,
} from "./studio-bg3d-shot-psd-contract";

export type StudioBg3dCyclesPassKey = StudioBg3dCyclesCompositorLayerDescriptor["pass"];

export interface StudioBg3dCyclesLayerOverride {
  readonly visible?: boolean;
  readonly opacity?: number;
}

export type StudioBg3dCyclesLayerOverrideMap = Readonly<
  Partial<Record<StudioBg3dCyclesPassKey, StudioBg3dCyclesLayerOverride>>
>;

export type StudioBg3dCyclesPassBufferMap = Readonly<
  Partial<Record<StudioBg3dCyclesPassKey, Uint8ClampedArray>>
>;

export interface BuildStudioBg3dCyclesMultiPassPsdInput {
  readonly environmentId: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly StudioBg3dCyclesCompositorLayerDescriptor[];
  readonly buffers: StudioBg3dCyclesPassBufferMap;
}

export interface BuildStudioBg3dCyclesMultiPassPsdResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly layerNames: readonly string[];
  readonly visiblePassCount: number;
}

function clampOpacity(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Number(value.toFixed(3))));
}

/**
 * 기본 Cycles 4-패스 레이어 플랜에 사용자의 가시성·불투명도 조작값을 적용한다.
 */
export function applyStudioBg3dCyclesLayerOverrides(
  basePlan: readonly StudioBg3dCyclesCompositorLayerDescriptor[],
  overrides: StudioBg3dCyclesLayerOverrideMap,
): readonly StudioBg3dCyclesCompositorLayerDescriptor[] {
  return Object.freeze(
    basePlan.map((layer) => {
      const patch = overrides[layer.pass];
      if (!patch) return layer;
      return Object.freeze({
        ...layer,
        visible: patch.visible !== undefined ? Boolean(patch.visible) : layer.visible,
        opacity: clampOpacity(patch.opacity, layer.opacity),
      });
    }),
  );
}

/**
 * 아래→위 순서(beauty → ao → normal → depth)로 Cycles 패스 버퍼를 합성해
 * straight-alpha RGBA8 프리뷰 버퍼를 생성한다.
 */
export function compositeStudioBg3dCyclesLayers(
  width: number,
  height: number,
  layers: readonly StudioBg3dCyclesCompositorLayerDescriptor[],
  buffers: StudioBg3dCyclesPassBufferMap,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError("Cycles 멀티패스 합성 캔버스 크기가 올바르지 않습니다.");
  }
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(pixelCount * 4);

  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const src = buffers[layer.pass];
    if (!src) continue;
    if (src.length !== pixelCount * 4) {
      throw new TypeError(`${layer.pass} 패스 버퍼 크기가 ${width}×${height}와 일치하지 않습니다.`);
    }
    const opacity = clampOpacity(layer.opacity, 1);
    const isMultiply = layer.blendMode === "multiply";

    for (let i = 0; i < pixelCount * 4; i += 4) {
      const sa = (src[i + 3]! / 255) * opacity;
      if (sa <= 0) continue;
      const sr = src[i]!;
      const sg = src[i + 1]!;
      const sb = src[i + 2]!;

      const da = out[i + 3]! / 255;
      if (da <= 0) {
        out[i] = sr;
        out[i + 1] = sg;
        out[i + 2] = sb;
        out[i + 3] = Math.round(sa * 255);
        continue;
      }

      const dr = out[i]!;
      const dg = out[i + 1]!;
      const db = out[i + 2]!;

      const br = isMultiply ? (dr * sr) / 255 : sr;
      const bg = isMultiply ? (dg * sg) / 255 : sg;
      const bb = isMultiply ? (db * sb) / 255 : sb;

      const outA = sa + da * (1 - sa);
      if (outA <= 0) continue;
      out[i] = Math.round((br * sa + dr * da * (1 - sa)) / outA);
      out[i + 1] = Math.round((bg * sa + dg * da * (1 - sa)) / outA);
      out[i + 2] = Math.round((bb * sa + db * da * (1 - sa)) / outA);
      out[i + 3] = Math.round(outA * 255);
    }
  }

  return out;
}

/**
 * Cycles 4-패스(Beauty / AO / Normal / Depth)를 클립스튜디오·포토샵 호환 4레이어 PSD로 조립한다.
 * PSD 레이어 트리는 위→아래 순서(Depth → Normal → AO → Beauty)로 배치되어
 * AO 곱하기(Multiply)가 Beauty 원화 바로 위에서 자연스럽게 작동한다.
 */
export function buildStudioBg3dCyclesMultiPassPsd(
  input: BuildStudioBg3dCyclesMultiPassPsdInput,
): BuildStudioBg3dCyclesMultiPassPsdResult {
  const { width, height, layers, buffers } = input;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError("Cycles PSD 캔버스 크기가 올바르지 않습니다.");
  }
  const pixels = width * height;
  if (pixels > STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS) {
    throw new RangeError(
      `Cycles PSD 캔버스는 최대 ${STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS.toLocaleString("ko-KR")}px까지 지원합니다.`,
    );
  }

  const availableLayers = layers.filter((layer) => Boolean(buffers[layer.pass]));
  if (availableLayers.length === 0) {
    throw new RangeError("PSD로 내보낼 Cycles 렌더 패스 버퍼가 없습니다.");
  }
  if (availableLayers.length > STUDIO_BG3D_SHOT_PSD_MAX_LAYERS) {
    throw new RangeError(
      `Cycles PSD는 최대 ${STUDIO_BG3D_SHOT_PSD_MAX_LAYERS}레이어까지 지원합니다.`,
    );
  }
  if (pixels * availableLayers.length > STUDIO_BG3D_SHOT_PSD_MAX_AGGREGATE_LAYER_PIXELS) {
    throw new RangeError("Cycles PSD 레이어 합계 픽셀이 예산을 초과했습니다.");
  }

  // ag-psd children[0]은 레이어 패널 최상단이므로 아래→위 합성 순서를 뒤집어 위→아래로 배치한다.
  const topToBottom = [...availableLayers].reverse();
  const children: Layer[] = topToBottom.map((layer) => {
    const rgba = buffers[layer.pass]!;
    if (rgba.length !== pixels * 4) {
      throw new TypeError(`${layer.pass} 패스 버퍼 크기가 ${width}×${height}와 맞지 않습니다.`);
    }
    const blendMode: BlendMode = layer.blendMode === "multiply" ? "multiply" : "normal";
    return {
      name: layer.label,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      opacity: clampOpacity(layer.opacity, 1),
      blendMode,
      hidden: !layer.visible,
      imageData: { width, height, data: rgba },
    };
  });

  const previewData = compositeStudioBg3dCyclesLayers(width, height, availableLayers, buffers);
  const psd: Psd = {
    width,
    height,
    children,
    imageData: {
      width,
      height,
      data: previewData,
    },
  };

  const bytes = writePsdUint8Array(psd, {
    noBackground: true,
    generateThumbnail: false,
    trimImageData: false,
    compress: false,
  });

  if (
    bytes.byteLength < 6 ||
    bytes.byteLength > STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES ||
    bytes[0] !== 0x38 ||
    bytes[1] !== 0x42 ||
    bytes[2] !== 0x50 ||
    bytes[3] !== 0x53
  ) {
    throw new RangeError("Cycles 멀티패스 PSD 인코딩 결과가 유효하지 않거나 출력 예산을 초과했습니다.");
  }

  const blobBuffer =
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : Uint8Array.from(bytes).buffer;

  const safeSlug = input.environmentId.replace(/[^a-z0-9_-]+/giu, "-");
  return {
    blob: new Blob([blobBuffer], { type: STUDIO_BG3D_SHOT_PSD_MIME }),
    fileName: `${safeSlug}-cycles-4pass.psd`,
    width,
    height,
    byteLength: bytes.byteLength,
    layerNames: Object.freeze(children.map((child) => child.name ?? "")),
    visiblePassCount: availableLayers.filter((layer) => layer.visible).length,
  };
}
