/**
 * Clip Studio Paint 4.0~5.0 스타일 3D 메쉬 표면 직접 페인팅 & 4층 비파괴 텍스처 레이어링 엔진.
 *
 * - 3종 클린 매니폴드 UV 메쉬(`buildUvSphereHeadMesh` · `buildUvTorsoArmorMesh` · `buildUvPropBoxMesh`)
 * - Möller–Trumbore 레이-삼각형 교차 판정 + 무게중심 보간(`raycastMeshToUv`)
 * - UV 심(Seam) 래핑을 지원하는 부드러운 브러시 스탬프(`paintBrushDabOnTextureLayer`) 및 스트로크 보간
 * - 4층 비파괴 텍스처 스택(`base-pbr` · `fabric-pattern` · `decal-scar` · `ink-guide`) 합성기(`composite3dTextureStack`)
 * - 2D UV 시트 베이크 PNG 내보내기(`exportBakedUvSheetPng`) 및 원근 3D 프리뷰 래스터라이저
 */

import {
  DEFAULT_CAMERA_CONFIG,
  auditUvMeshIntegrity,
  buildSurfacePaintMeshPreset,
  buildUvPropBoxMesh,
  buildUvSphereHeadMesh,
  buildUvTorsoArmorMesh,
  clamp,
  clamp01,
  createPerspectiveRayFromViewport,
  exportBakedUvSheetPng,
  inverseRotateVec3ByYawPitch,
  normalizeVec3,
  rasterizeTexturedMeshPreview,
  renderUvWireframeOverlayRgba,
  rotateVec3ByYawPitch,
  wrapUnit,
  type BakedUvSheetPng,
  type PerspectiveCameraConfig,
  type RgbaColor,
  type SurfacePaintMeshPresetId,
  type UvMesh3d,
  type UvMeshIntegrityReport,
  type Vec3,
} from "./uv-manifold-mesh-and-bake";

export {
  DEFAULT_CAMERA_CONFIG,
  auditUvMeshIntegrity,
  buildSurfacePaintMeshPreset,
  buildUvPropBoxMesh,
  buildUvSphereHeadMesh,
  buildUvTorsoArmorMesh,
  createPerspectiveRayFromViewport,
  exportBakedUvSheetPng,
  rasterizeTexturedMeshPreview,
  renderUvWireframeOverlayRgba,
  rotateVec3ByYawPitch,
};
export type {
  BakedUvSheetPng,
  PerspectiveCameraConfig,
  RgbaColor,
  SurfacePaintMeshPresetId,
  UvMesh3d,
  UvMeshIntegrityReport,
  Vec3,
};

export type TextureLayerRole = "base-pbr" | "fabric-pattern" | "decal-scar" | "ink-guide";
export type TextureBlendMode = "normal" | "multiply" | "screen";
export type PresetStampKind = "ink-guide" | "fabric-pattern" | "decal-scar";

export interface SurfaceBrushSwatch {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly rgba: RgbaColor;
  readonly swatchOklch: string;
}

export interface UvRaycastHit {
  readonly u: number;
  readonly v: number;
  readonly normal: Vec3;
  readonly depth: number;
  readonly worldPosition: Vec3;
  readonly triangleIndex: number;
  readonly barycentric: readonly [number, number, number];
}

export interface BrushDabOptions {
  readonly wrapU?: boolean;
  readonly wrapV?: boolean;
  readonly flow?: number;
}

export interface BrushDabResult {
  readonly modifiedPixels: number;
  readonly wrappedSeam: boolean;
  readonly centerPx: { readonly x: number; readonly y: number };
}

export interface TextureLayer3d {
  readonly id: string;
  readonly role: TextureLayerRole;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: TextureBlendMode;
  readonly rgba: Uint8ClampedArray;
}

export interface Composite3dTextureResult {
  readonly rgba: Uint8ClampedArray;
  readonly texSize: number;
  readonly visibleLayerCount: number;
  readonly activeRoles: readonly TextureLayerRole[];
  readonly paintedPixelCount: number;
}

export const DEFAULT_TEXTURE_SIZE = 128;

export const SURFACE_BRUSH_SWATCHES: readonly SurfaceBrushSwatch[] = [
  { id: "sumi-ink", labelKo: "먹선 잉크", labelEn: "Sumi Ink", rgba: [26, 28, 36, 255], swatchOklch: "oklch(0.24 0.02 260)" },
  { id: "scar-crimson", labelKo: "흉터 크림슨", labelEn: "Scar Crimson", rgba: [194, 54, 62, 255], swatchOklch: "oklch(0.54 0.18 22)" },
  { id: "cobalt-plate", labelKo: "코발트 아머", labelEn: "Cobalt Plate", rgba: [54, 108, 184, 255], swatchOklch: "oklch(0.53 0.14 254)" },
  { id: "warm-ochre", labelKo: "웜 오커", labelEn: "Warm Ochre", rgba: [208, 144, 66, 255], swatchOklch: "oklch(0.71 0.13 72)" },
  { id: "jade-trim", labelKo: "비취 문양", labelEn: "Jade Trim", rgba: [52, 152, 128, 255], swatchOklch: "oklch(0.62 0.11 168)" },
  { id: "chalk-rim", labelKo: "하이라이트 초크", labelEn: "Chalk Highlight", rgba: [246, 244, 238, 255], swatchOklch: "oklch(0.96 0.01 88)" },
];

const EPS = 1e-8;

/**
 * Möller–Trumbore 레이-삼각형 교차 판정 + 무게중심(Barycentric) 보간으로
 * 가장 가까운 전면 표면 히트 `(u, v, normal, depth)`를 계산한다.
 */
export function raycastMeshToUv(
  rayOrigin: Vec3,
  rayDir: Vec3,
  mesh: UvMesh3d,
  yawDeg: number,
  pitchDeg: number,
): UvRaycastHit | null {
  const worldDir = normalizeVec3(rayDir);
  if (Math.hypot(worldDir.x, worldDir.y, worldDir.z) <= EPS) return null;

  const localOrigin = inverseRotateVec3ByYawPitch(rayOrigin, yawDeg, pitchDeg);
  const localDir = inverseRotateVec3ByYawPitch(worldDir, yawDeg, pitchDeg);

  let bestT = Number.POSITIVE_INFINITY;
  let bestTri = -1;
  let bestB1 = 0;
  let bestB2 = 0;

  const { positions, indices, uvs, normals } = mesh;

  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t] ?? 0;
    const i1 = indices[t + 1] ?? 0;
    const i2 = indices[t + 2] ?? 0;

    const v0x = positions[i0 * 3] ?? 0;
    const v0y = positions[i0 * 3 + 1] ?? 0;
    const v0z = positions[i0 * 3 + 2] ?? 0;
    const e1x = (positions[i1 * 3] ?? 0) - v0x;
    const e1y = (positions[i1 * 3 + 1] ?? 0) - v0y;
    const e1z = (positions[i1 * 3 + 2] ?? 0) - v0z;
    const e2x = (positions[i2 * 3] ?? 0) - v0x;
    const e2y = (positions[i2 * 3 + 1] ?? 0) - v0y;
    const e2z = (positions[i2 * 3 + 2] ?? 0) - v0z;

    const px = localDir.y * e2z - localDir.z * e2y;
    const py = localDir.z * e2x - localDir.x * e2z;
    const pz = localDir.x * e2y - localDir.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det <= EPS) continue;

    const invDet = 1 / det;
    const tx = localOrigin.x - v0x;
    const ty = localOrigin.y - v0y;
    const tz = localOrigin.z - v0z;

    const b1 = (tx * px + ty * py + tz * pz) * invDet;
    if (b1 < -1e-6 || b1 > 1 + 1e-6) continue;

    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;

    const b2 = (localDir.x * qx + localDir.y * qy + localDir.z * qz) * invDet;
    if (b2 < -1e-6 || b1 + b2 > 1 + 1e-6) continue;

    const dist = (e2x * qx + e2y * qy + e2z * qz) * invDet;
    if (dist > 1e-6 && dist < bestT) {
      bestT = dist;
      bestTri = t / 3;
      bestB1 = b1;
      bestB2 = b2;
    }
  }

  if (bestTri < 0 || !Number.isFinite(bestT)) return null;

  const w1 = clamp01(bestB1);
  const w2 = clamp01(bestB2);
  const w0 = clamp01(1 - w1 - w2);
  const sumW = w0 + w1 + w2 || 1;
  const bw0 = w0 / sumW;
  const bw1 = w1 / sumW;
  const bw2 = w2 / sumW;

  const i0 = indices[bestTri * 3] ?? 0;
  const i1 = indices[bestTri * 3 + 1] ?? 0;
  const i2 = indices[bestTri * 3 + 2] ?? 0;

  const u = clamp01(bw0 * (uvs[i0 * 2] ?? 0) + bw1 * (uvs[i1 * 2] ?? 0) + bw2 * (uvs[i2 * 2] ?? 0));
  const v = clamp01(bw0 * (uvs[i0 * 2 + 1] ?? 0) + bw1 * (uvs[i1 * 2 + 1] ?? 0) + bw2 * (uvs[i2 * 2 + 1] ?? 0));

  const localNormal = normalizeVec3({
    x: bw0 * (normals[i0 * 3] ?? 0) + bw1 * (normals[i1 * 3] ?? 0) + bw2 * (normals[i2 * 3] ?? 0),
    y: bw0 * (normals[i0 * 3 + 1] ?? 0) + bw1 * (normals[i1 * 3 + 1] ?? 0) + bw2 * (normals[i2 * 3 + 1] ?? 0),
    z: bw0 * (normals[i0 * 3 + 2] ?? 0) + bw1 * (normals[i1 * 3 + 2] ?? 0) + bw2 * (normals[i2 * 3 + 2] ?? 0),
  });
  const worldNormal = normalizeVec3(rotateVec3ByYawPitch(localNormal, yawDeg, pitchDeg));

  return {
    u,
    v,
    normal: worldNormal,
    depth: bestT,
    worldPosition: {
      x: rayOrigin.x + worldDir.x * bestT,
      y: rayOrigin.y + worldDir.y * bestT,
      z: rayOrigin.z + worldDir.z * bestT,
    },
    triangleIndex: bestTri,
    barycentric: [bw0, bw1, bw2],
  };
}

/** UV 심(u=0↔1) 래핑과 경도(Hardness) 폴오프를 지원하는 부드러운 브러시 스탬프를 찍는다. */
export function paintBrushDabOnTextureLayer(
  layerRgba: Uint8ClampedArray,
  texSize: number,
  u: number,
  v: number,
  radiusPx: number,
  colorRgba: RgbaColor,
  hardness: number,
  options: BrushDabOptions = {},
): BrushDabResult {
  const size = Math.max(2, Math.floor(texSize));
  const wrapU = options.wrapU ?? true;
  const wrapV = options.wrapV ?? false;
  const flow = clamp01(options.flow ?? 1);
  const radius = Math.max(0.75, radiusPx);
  const h = clamp01(hardness);

  const cx = wrapU ? wrapUnit(u) * size : clamp01(u) * (size - 1);
  const cy = wrapV ? wrapUnit(v) * size : clamp01(v) * (size - 1);
  const span = Math.ceil(radius);
  const baseX = Math.floor(cx);
  const baseY = Math.floor(cy);

  const srcR = clamp(colorRgba[0], 0, 255) / 255;
  const srcG = clamp(colorRgba[1], 0, 255) / 255;
  const srcB = clamp(colorRgba[2], 0, 255) / 255;
  const baseAlpha = (clamp(colorRgba[3], 0, 255) / 255) * flow;

  let modifiedPixels = 0;
  let wrappedSeam = false;

  for (let dy = -span; dy <= span; dy += 1) {
    const rawY = baseY + dy;
    let ty = rawY;
    if (rawY < 0 || rawY >= size) {
      if (!wrapV) continue;
      ty = ((rawY % size) + size) % size;
    }

    for (let dx = -span; dx <= span; dx += 1) {
      const rawX = baseX + dx;
      let tx = rawX;
      if (rawX < 0 || rawX >= size) {
        if (!wrapU) continue;
        tx = ((rawX % size) + size) % size;
        wrappedSeam = true;
      }

      const nd = Math.hypot(rawX - cx, rawY - cy) / radius;
      if (nd > 1) continue;

      let falloff = 1;
      if (h < 0.999 && nd > h) {
        const t = (nd - h) / (1 - h);
        falloff = 1 - t * t * (3 - 2 * t);
      }

      const srcA = baseAlpha * falloff;
      if (srcA <= 1e-4) continue;

      const off = (ty * size + tx) * 4;
      const dstR = (layerRgba[off] ?? 0) / 255;
      const dstG = (layerRgba[off + 1] ?? 0) / 255;
      const dstB = (layerRgba[off + 2] ?? 0) / 255;
      const dstA = (layerRgba[off + 3] ?? 0) / 255;

      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 1e-6) continue;

      layerRgba[off] = Math.round(((srcR * srcA + dstR * dstA * (1 - srcA)) / outA) * 255);
      layerRgba[off + 1] = Math.round(((srcG * srcA + dstG * dstA * (1 - srcA)) / outA) * 255);
      layerRgba[off + 2] = Math.round(((srcB * srcA + dstB * dstA * (1 - srcA)) / outA) * 255);
      layerRgba[off + 3] = Math.round(outA * 255);
      modifiedPixels += 1;
    }
  }

  return {
    modifiedPixels,
    wrappedSeam,
    centerPx: { x: Math.round(cx) % size, y: clamp(Math.round(cy), 0, size - 1) },
  };
}

/** 두 UV 좌표 사이를 심 최단 경로로 보간하며 연속 브러시 스트로크를 찍는다. */
export function paintBrushStrokeOnTextureLayer(
  layerRgba: Uint8ClampedArray,
  texSize: number,
  fromU: number,
  fromV: number,
  toU: number,
  toV: number,
  radiusPx: number,
  colorRgba: RgbaColor,
  hardness: number,
  options: BrushDabOptions = {},
): number {
  const wrapU = options.wrapU ?? true;
  let du = toU - fromU;
  if (wrapU) {
    if (du > 0.5) du -= 1;
    else if (du < -0.5) du += 1;
  }
  const dv = toV - fromV;
  const distPx = Math.hypot(du * texSize, dv * texSize);
  const steps = Math.max(1, Math.ceil(distPx / Math.max(1, radiusPx * 0.35)));
  let totalModified = 0;

  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const u = wrapU ? wrapUnit(fromU + du * t) : clamp01(fromU + du * t);
    const v = clamp01(fromV + dv * t);
    totalModified += paintBrushDabOnTextureLayer(layerRgba, texSize, u, v, radiusPx, colorRgba, hardness, options).modifiedPixels;
  }
  return totalModified;
}

/** 지정 메쉬 프리셋에 맞는 초기 4층 비파괴 텍스처 레이어 스택을 생성한다. */
export function createDefault3dTextureStack(
  texSize = DEFAULT_TEXTURE_SIZE,
  meshPreset: SurfacePaintMeshPresetId = "sphere-head",
): readonly TextureLayer3d[] {
  const size = Math.max(8, Math.floor(texSize));
  const byteLen = size * size * 4;
  const baseRgba = new Uint8ClampedArray(byteLen);

  for (let y = 0; y < size; y += 1) {
    const vf = y / Math.max(1, size - 1);
    for (let x = 0; x < size; x += 1) {
      const uf = x / Math.max(1, size - 1);
      const off = (y * size + x) * 4;
      const shade = 0.92 + 0.08 * Math.cos((vf - 0.38) * Math.PI);
      if (meshPreset === "torso-armor") {
        const sheen = 0.94 + 0.06 * Math.sin(uf * Math.PI * 2);
        baseRgba[off] = Math.round(182 * shade * sheen);
        baseRgba[off + 1] = Math.round(190 * shade * sheen);
        baseRgba[off + 2] = Math.round(204 * shade * sheen);
      } else if (meshPreset === "prop-box") {
        const grain = 0.95 + 0.05 * Math.sin((uf * 14 + vf * 6) * Math.PI);
        baseRgba[off] = Math.round(196 * shade * grain);
        baseRgba[off + 1] = Math.round(166 * shade * grain);
        baseRgba[off + 2] = Math.round(132 * shade * grain);
      } else {
        const cheekL = Math.exp(-(((uf - 0.41) / 0.08) ** 2 + ((vf - 0.56) / 0.08) ** 2));
        const cheekR = Math.exp(-(((uf - 0.59) / 0.08) ** 2 + ((vf - 0.56) / 0.08) ** 2));
        const blush = Math.min(1, cheekL + cheekR) * 14;
        baseRgba[off] = Math.min(255, Math.round(238 * shade + blush * 0.5));
        baseRgba[off + 1] = Math.max(0, Math.round(212 * shade - blush * 0.55));
        baseRgba[off + 2] = Math.max(0, Math.round(194 * shade - blush * 0.6));
      }
      baseRgba[off + 3] = 255;
    }
  }

  return [
    { id: "layer-base-pbr", role: "base-pbr", nameKo: "1. 베이스 PBR", nameEn: "1. Base PBR", visible: true, opacity: 1, blendMode: "normal", rgba: baseRgba },
    { id: "layer-fabric-pattern", role: "fabric-pattern", nameKo: "2. 의상·표면 패턴", nameEn: "2. Fabric Pattern", visible: true, opacity: 0.85, blendMode: "multiply", rgba: new Uint8ClampedArray(byteLen) },
    { id: "layer-decal-scar", role: "decal-scar", nameKo: "3. 흉터·문양 데칼", nameEn: "3. Decal & Scar", visible: true, opacity: 0.95, blendMode: "normal", rgba: new Uint8ClampedArray(byteLen) },
    { id: "layer-ink-guide", role: "ink-guide", nameKo: "4. 선화·해부학 가이드", nameEn: "4. Ink Guide", visible: true, opacity: 0.9, blendMode: "multiply", rgba: new Uint8ClampedArray(byteLen) },
  ];
}

/** 1클릭 선화 가이드 · 의상 패턴 · 흉터 데칼 프로시저럴 스탬프를 비파괴 복사본 레이어에 적용한다. */
export function applyPresetStampToTextureLayer(
  layer: TextureLayer3d,
  texSize: number,
  stampKind: PresetStampKind,
  meshPreset: SurfacePaintMeshPresetId = "sphere-head",
): TextureLayer3d {
  const nextRgba = new Uint8ClampedArray(layer.rgba);
  const wrapU = meshPreset !== "prop-box";

  if (stampKind === "ink-guide") {
    const ink: RgbaColor = [28, 32, 44, 240];
    const r = Math.max(1.1, texSize * 0.012);
    if (meshPreset === "prop-box") {
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.04, 0.05, 0.29, 0.05, r, ink, 0.85, { wrapU: false });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.04, 0.45, 0.29, 0.45, r, ink, 0.85, { wrapU: false });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.04, 0.05, 0.04, 0.45, r, ink, 0.85, { wrapU: false });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.29, 0.05, 0.29, 0.45, r, ink, 0.85, { wrapU: false });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.06, 0.08, 0.27, 0.42, r * 0.85, ink, 0.75, { wrapU: false });
    } else if (meshPreset === "torso-armor") {
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.5, 0.14, 0.5, 0.86, r, ink, 0.9, { wrapU });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.34, 0.26, 0.66, 0.26, r, ink, 0.85, { wrapU });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.36, 0.48, 0.64, 0.48, r, ink, 0.85, { wrapU });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.39, 0.68, 0.61, 0.68, r, ink, 0.85, { wrapU });
    } else {
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.5, 0.16, 0.5, 0.86, r, ink, 0.9, { wrapU });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.34, 0.46, 0.66, 0.46, r, ink, 0.9, { wrapU });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.42, 0.58, 0.58, 0.58, r * 0.9, ink, 0.85, { wrapU });
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, 0.44, 0.69, 0.56, 0.69, r * 0.9, ink, 0.85, { wrapU });
    }
  } else if (stampKind === "fabric-pattern") {
    const stripe: RgbaColor = [82, 118, 176, 175];
    const accent: RgbaColor = [212, 166, 92, 150];
    const period = Math.max(8, Math.round(texSize / 12));
    for (let y = 0; y < texSize; y += 1) {
      for (let x = 0; x < texSize; x += 1) {
        const isStripe = (x + y) % period < 2 || (x - y + texSize * 4) % period < 2;
        const isDot = x % period === 0 && y % period === 0;
        if (!isStripe && !isDot) continue;
        const off = (y * texSize + x) * 4;
        const col = isDot ? accent : stripe;
        nextRgba[off] = col[0];
        nextRgba[off + 1] = col[1];
        nextRgba[off + 2] = col[2];
        nextRgba[off + 3] = col[3];
      }
    }
  } else {
    const scar: RgbaColor = [194, 54, 62, 245];
    const stitch: RgbaColor = [122, 30, 38, 235];
    const r = Math.max(1.5, texSize * 0.018);
    const baseU = meshPreset === "prop-box" ? 0.16 : 0.56;
    const baseV = meshPreset === "prop-box" ? 0.25 : 0.46;
    paintBrushStrokeOnTextureLayer(nextRgba, texSize, baseU - 0.05, baseV - 0.07, baseU + 0.05, baseV + 0.07, r, scar, 0.55, { wrapU });
    for (const step of [-0.03, 0, 0.03]) {
      paintBrushStrokeOnTextureLayer(nextRgba, texSize, baseU + step - 0.02, baseV + step + 0.018, baseU + step + 0.02, baseV + step - 0.018, r * 0.65, stitch, 0.8, { wrapU });
    }
  }

  return { ...layer, visible: true, rgba: nextRgba };
}

/** 단일 레이어만 비파괴적으로 초기화한다(베이스 PBR은 기본 재질로 복원, 나머지는 투명화). */
export function clearSingleTextureLayer(
  layer: TextureLayer3d,
  texSize: number,
  meshPreset: SurfacePaintMeshPresetId = "sphere-head",
): TextureLayer3d {
  if (layer.role === "base-pbr") {
    const freshBase = createDefault3dTextureStack(texSize, meshPreset)[0];
    return freshBase ? { ...layer, rgba: freshBase.rgba } : { ...layer, rgba: new Uint8ClampedArray(texSize * texSize * 4) };
  }
  return { ...layer, rgba: new Uint8ClampedArray(texSize * texSize * 4) };
}

function applyBlendChannel(dst: number, src: number, mode: TextureBlendMode): number {
  if (mode === "multiply") return dst * src;
  if (mode === "screen") return 1 - (1 - dst) * (1 - src);
  return src;
}

/**
 * 4층 비파괴 텍스처 스택을 레이어별 `visible`, `opacity`, `blendMode(normal/multiply/screen)`로
 * 실제 W3C Compositing & Blending RGBA 수식에 따라 합성한다.
 */
export function composite3dTextureStack(
  layers: readonly TextureLayer3d[],
  texSize: number,
): Composite3dTextureResult {
  const size = Math.max(2, Math.floor(texSize));
  const pixelCount = size * size;
  const out = new Uint8ClampedArray(pixelCount * 4);
  const activeRoles: TextureLayerRole[] = [];

  for (const layer of layers) {
    const opacity = clamp01(layer.opacity);
    if (!layer.visible || opacity <= 0) continue;
    activeRoles.push(layer.role);

    const src = layer.rgba;
    const mode = layer.blendMode;
    const limit = Math.min(pixelCount, Math.floor(src.length / 4));

    for (let i = 0; i < limit; i += 1) {
      const off = i * 4;
      const sa = ((src[off + 3] ?? 0) / 255) * opacity;
      if (sa <= 1e-6) continue;

      const sr = (src[off] ?? 0) / 255;
      const sg = (src[off + 1] ?? 0) / 255;
      const sb = (src[off + 2] ?? 0) / 255;

      const dr = (out[off] ?? 0) / 255;
      const dg = (out[off + 1] ?? 0) / 255;
      const db = (out[off + 2] ?? 0) / 255;
      const da = (out[off + 3] ?? 0) / 255;

      const outA = sa + da * (1 - sa);
      if (outA <= 1e-6) continue;

      const br = applyBlendChannel(dr, sr, mode);
      const bg = applyBlendChannel(dg, sg, mode);
      const bb = applyBlendChannel(db, sb, mode);

      out[off] = Math.round(clamp01(((1 - da) * sa * sr + (1 - sa) * da * dr + sa * da * br) / outA) * 255);
      out[off + 1] = Math.round(clamp01(((1 - da) * sa * sg + (1 - sa) * da * dg + sa * da * bg) / outA) * 255);
      out[off + 2] = Math.round(clamp01(((1 - da) * sa * sb + (1 - sa) * da * db + sa * da * bb) / outA) * 255);
      out[off + 3] = Math.round(clamp01(outA) * 255);
    }
  }

  let paintedPixelCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if ((out[i * 4 + 3] ?? 0) > 0) paintedPixelCount += 1;
  }

  return { rgba: out, texSize: size, visibleLayerCount: activeRoles.length, activeRoles, paintedPixelCount };
}
