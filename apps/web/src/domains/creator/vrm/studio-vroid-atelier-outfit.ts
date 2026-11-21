/**
 * VRoid Studio 클린룸 레이어드 의상 텍스처 믹서 (OKLCH 3색 + 5종 패턴 · Node/Browser 안전 가드).
 *
 * 상의·하의·원피스·아우터·소품 레이어 합성, 절차적 `THREE.DataTexture` 생성,
 * 기존 `harmonizeStudioVrmPropObject` MToon 비파괴 통합 및 GPU 폐기를 담당한다.
 */
import * as THREE from "three";

import { harmonizeStudioVrmPropObject } from "./studio-vrm-custom-part-harmonizer";
import {
  VROID_OUTFIT_LAYER_SPECS,
  formatOklchCss,
  oklchToRgbaBytes,
  type VroidOklchPalette3,
  type VroidOutfitLayerKind,
  type VroidOutfitPatternKind,
} from "./studio-vroid-atelier-presets";

import type { VRM } from "@pixiv/three-vrm";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export interface VroidOutfitLayerConfig {
  readonly layer: VroidOutfitLayerKind;
  readonly visible: boolean;
  readonly pattern: VroidOutfitPatternKind;
  readonly patternScale?: number;
  readonly palette: VroidOklchPalette3;
  readonly trimOpacity?: number;
}

export interface VroidOutfitTextureSynthesisInput {
  readonly layers: readonly VroidOutfitLayerConfig[];
  readonly resolution?: number;
}

export interface VroidOutfitTextureSynthesisResult {
  readonly width: number;
  readonly height: number;
  readonly activeLayers: readonly VroidOutfitLayerKind[];
  readonly rgba: Uint8Array;
  readonly dataTexture: THREE.DataTexture;
  readonly paletteCssSummary: readonly string[];
  readonly toBrowserCanvas: () => HTMLCanvasElement | null;
  readonly applyToMesh: (object: THREE.Object3D, vrm?: VRM | null) => () => void;
  readonly dispose: () => void;
}

const LAYER_BAND_BOUNDS: Readonly<Record<VroidOutfitLayerKind, readonly [number, number]>> = Object.freeze({
  top: [0.04, 0.54],
  bottom: [0.5, 0.96],
  onepiece: [0.06, 0.92],
  outer: [0.02, 0.68],
  accessory: [0.16, 0.34],
});

function sampleOutfitPatternColor(
  pattern: VroidOutfitPatternKind,
  u: number,
  v: number,
  scale: number,
  palette: VroidOklchPalette3,
): readonly [number, number, number, number] {
  const primary = oklchToRgbaBytes(palette.primary, 1);
  const secondary = oklchToRgbaBytes(palette.secondary, 1);
  const accent = oklchToRgbaBytes(palette.accent, 1);

  if (pattern === "solid") return primary;

  const su = u * scale;
  const sv = v * scale;
  const fu = su - Math.floor(su);
  const fv = sv - Math.floor(sv);

  if (pattern === "stripe") {
    if (fu < 0.12) return accent;
    return fu < 0.48 ? secondary : primary;
  }

  if (pattern === "check") {
    const bandU = fu < 0.24;
    const bandV = fv < 0.24;
    if (bandU && bandV) return accent;
    if (bandU || bandV) return secondary;
    return primary;
  }

  if (pattern === "dot") {
    const dist = Math.hypot(fu - 0.5, fv - 0.5);
    if (dist < 0.18) return accent;
    if (dist < 0.24) return secondary;
    return primary;
  }

  const lattice = Math.abs(fu - 0.5) + Math.abs(fv - 0.5);
  const eyelet = Math.hypot(fu - 0.5, fv - 0.5);
  if (eyelet < 0.14) return secondary;
  if (lattice > 0.62) return accent;
  return primary;
}

/**
 * 상의·하의·원피스·아우터·소품 레이어 + 3색 OKLCH 팔레트 + 5종 패턴(무지/체크/스트라이프/도트/레이스)을
 * Node와 브라우저 모두에서 안전하게 합성해 RGBA 버퍼와 `THREE.DataTexture`를 생성한다.
 */
export function synthesizeVroidOutfitTextureSpec(
  input: VroidOutfitTextureSynthesisInput,
): VroidOutfitTextureSynthesisResult {
  const size = Math.round(clamp(input.resolution ?? 128, 32, 512));
  const rgba = new Uint8Array(size * size * 4);
  const layerOrderMap = new Map(VROID_OUTFIT_LAYER_SPECS.map((spec) => [spec.id, spec.zOrder]));

  const visibleLayers = [...input.layers]
    .filter((entry) => entry.visible)
    .sort((a, b) => (layerOrderMap.get(a.layer) ?? 0) - (layerOrderMap.get(b.layer) ?? 0));

  const baseUnderlay = oklchToRgbaBytes({ l: 0.92, c: 0.01, h: 85 }, 1);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = baseUnderlay[0];
    rgba[i * 4 + 1] = baseUnderlay[1];
    rgba[i * 4 + 2] = baseUnderlay[2];
    rgba[i * 4 + 3] = 255;
  }

  for (const cfg of visibleLayers) {
    const [vMin, vMax] = LAYER_BAND_BOUNDS[cfg.layer];
    const scale = clamp(cfg.patternScale ?? 8, 2, 24);
    const trimColor = oklchToRgbaBytes(cfg.palette.accent, 1);
    const trimOpacity = clamp(cfg.trimOpacity ?? 0.85, 0, 1);

    for (let y = 0; y < size; y += 1) {
      const v = y / (size - 1);
      if (v < vMin || v > vMax) continue;
      const isTrim = Math.abs(v - vMin) < 0.02 || Math.abs(v - vMax) < 0.02;
      for (let x = 0; x < size; x += 1) {
        const u = x / (size - 1);
        if (cfg.layer === "outer" && Math.abs(u - 0.5) < 0.14) continue;
        if (cfg.layer === "accessory" && Math.hypot(u - 0.5, (v - 0.25) * 4) > 0.28) continue;

        const sampled = sampleOutfitPatternColor(cfg.pattern, u, v, scale, cfg.palette);
        const offset = (y * size + x) * 4;
        if (isTrim && trimOpacity > 0) {
          rgba[offset] = Math.round(sampled[0] * (1 - trimOpacity) + trimColor[0] * trimOpacity);
          rgba[offset + 1] = Math.round(sampled[1] * (1 - trimOpacity) + trimColor[1] * trimOpacity);
          rgba[offset + 2] = Math.round(sampled[2] * (1 - trimOpacity) + trimColor[2] * trimOpacity);
          rgba[offset + 3] = 255;
        } else {
          rgba[offset] = sampled[0];
          rgba[offset + 1] = sampled[1];
          rgba[offset + 2] = sampled[2];
          rgba[offset + 3] = sampled[3];
        }
      }
    }
  }

  const dataTexture = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  dataTexture.name = `vroid-outfit-layered:${visibleLayers.map((l) => `${l.layer}-${l.pattern}`).join("+") || "empty"}`;
  dataTexture.colorSpace = THREE.SRGBColorSpace;
  dataTexture.wrapS = THREE.RepeatWrapping;
  dataTexture.wrapT = THREE.RepeatWrapping;
  dataTexture.minFilter = THREE.LinearFilter;
  dataTexture.magFilter = THREE.LinearFilter;
  dataTexture.generateMipmaps = false;
  dataTexture.needsUpdate = true;

  const paletteCssSummary = visibleLayers.map(
    (entry) =>
      `${entry.layer}(${entry.pattern}): ${formatOklchCss(entry.palette.primary)} / ${formatOklchCss(entry.palette.secondary)} / ${formatOklchCss(entry.palette.accent)}`,
  );

  const toBrowserCanvas = (): HTMLCanvasElement | null => {
    if (typeof document === "undefined" || typeof ImageData === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
    return canvas;
  };

  const applyToMesh = (object: THREE.Object3D, vrm?: VRM | null): (() => void) => {
    const prevMaps = new Map<THREE.MeshStandardMaterial, THREE.Texture | null>();
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const std = raw as THREE.MeshStandardMaterial;
        if ("map" in std && !prevMaps.has(std)) {
          prevMaps.set(std, std.map ?? null);
          std.map = dataTexture;
          std.needsUpdate = true;
        }
      }
    });
    const undoHarmonize = harmonizeStudioVrmPropObject(object, vrm, { propId: "vroid-outfit" });
    return () => {
      undoHarmonize();
      for (const [mat, prevMap] of prevMaps) {
        mat.map = prevMap;
        mat.needsUpdate = true;
      }
    };
  };

  return Object.freeze({
    width: size,
    height: size,
    activeLayers: Object.freeze(visibleLayers.map((l) => l.layer)),
    rgba,
    dataTexture,
    paletteCssSummary: Object.freeze(paletteCssSummary),
    toBrowserCanvas,
    applyToMesh,
    dispose: () => {
      dataTexture.dispose();
    },
  });
}
