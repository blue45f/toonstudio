/**
 * 3D→2D 작가 그림체 6패스 동기화용 조명 프리셋 · 공유 3D 배경 씬 · 합성 선화 샘플 빌더.
 */

import { clampNumber, type OklchColor, type RgbColor } from "./pro-drawing-8-tools-color";

export const SIX_PASS_LUT_NODE_COUNT = 17;

export type CutLightingPresetId =
  | "indoor-fluorescent"
  | "outdoor-sunset"
  | "night-neon"
  | "overcast-daylight"
  | "warm-atelier";

export interface CutLightingPresetSpec {
  readonly id: CutLightingPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly targetKelvin: number;
  readonly shadowHueTargetDeg: number;
  readonly tintMixWeight: number;
  readonly warmthBias: number;
  readonly contrastBoost: number;
}

export const CUT_LIGHTING_PRESETS: Readonly<Record<CutLightingPresetId, CutLightingPresetSpec>> = {
  "indoor-fluorescent": {
    id: "indoor-fluorescent",
    labelKo: "실내 형광등 (5200K)",
    descriptionKo: "약간 차가운 백색 형광 조명 · 깔끔한 청회색 그림자",
    targetKelvin: 5200,
    shadowHueTargetDeg: 228,
    tintMixWeight: 0.24,
    warmthBias: -0.18,
    contrastBoost: 1.02,
  },
  "outdoor-sunset": {
    id: "outdoor-sunset",
    labelKo: "야외 석양 (3100K)",
    descriptionKo: "붉은 노을빛 사광 · 따뜻한 주홍 하이라이트와 자줏빛 음영",
    targetKelvin: 3100,
    shadowHueTargetDeg: 332,
    tintMixWeight: 0.42,
    warmthBias: 0.68,
    contrastBoost: 1.14,
  },
  "night-neon": {
    id: "night-neon",
    labelKo: "야간 네온 (6800K)",
    descriptionKo: "짙은 남색 야경 · 시안/마젠타 림라이트 강조",
    targetKelvin: 6800,
    shadowHueTargetDeg: 268,
    tintMixWeight: 0.36,
    warmthBias: -0.52,
    contrastBoost: 1.22,
  },
  "overcast-daylight": {
    id: "overcast-daylight",
    labelKo: "흐린 주간 (5800K)",
    descriptionKo: "확산 자연광 · 부드러운 중립 회색 그림자",
    targetKelvin: 5800,
    shadowHueTargetDeg: 245,
    tintMixWeight: 0.16,
    warmthBias: -0.05,
    contrastBoost: 0.94,
  },
  "warm-atelier": {
    id: "warm-atelier",
    labelKo: "따뜻한 실내등 (3800K)",
    descriptionKo: "부드러운 백열·스탠드 조명 · 크림빛 피부 톤 유지",
    targetKelvin: 3800,
    shadowHueTargetDeg: 36,
    tintMixWeight: 0.3,
    warmthBias: 0.38,
    contrastBoost: 1.05,
  },
};

export const CUT_LIGHTING_PRESET_IDS: readonly CutLightingPresetId[] = [
  "indoor-fluorescent",
  "outdoor-sunset",
  "night-neon",
  "overcast-daylight",
  "warm-atelier",
];

export interface CharacterLineLayerSample {
  readonly layerId: string;
  readonly layerName: string;
  readonly width: number;
  readonly height: number;
  /** 길이 = width * height * 4 (RGBA 0..255) */
  readonly rgba: Uint8ClampedArray | readonly number[];
  /** 선택적 종이 질감 힌트(투명 배경 선화 전용 보조치 0..1) */
  readonly paperTextureHint?: number;
}

export interface Shared3dMaterialSpec {
  readonly materialId: string;
  readonly materialName: string;
  readonly baseAlbedoOklch: OklchColor;
  readonly roughness: number;
  readonly lineTintOklch: OklchColor;
  readonly emissionKelvin: number;
}

export interface Shared3dBackgroundScene {
  readonly sceneId: string;
  readonly sceneName: string;
  readonly baseMaterials: readonly Shared3dMaterialSpec[];
  readonly materialsIntegrityHash: string;
}

export interface ArtistLineSamplePreset {
  readonly id: string;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly strokeWidthPx: number;
  readonly lineRgb: RgbColor;
  readonly paperGrainLevel: number;
  readonly sample: CharacterLineLayerSample;
}

function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computeShared3dMaterialsHash(materials: readonly Shared3dMaterialSpec[]): string {
  const canonical = materials
    .map(
      (mat) =>
        `${mat.materialId}:${mat.materialName}:${mat.baseAlbedoOklch.l.toFixed(4)},${mat.baseAlbedoOklch.c.toFixed(4)},${mat.baseAlbedoOklch.h.toFixed(2)}:${mat.roughness.toFixed(3)}:${mat.lineTintOklch.l.toFixed(4)},${mat.lineTintOklch.c.toFixed(4)},${mat.lineTintOklch.h.toFixed(2)}:${mat.emissionKelvin}`,
    )
    .join("|");
  return fnv1aHash(canonical);
}

export function createShared3dBackgroundScene(
  sceneId: string,
  sceneName: string,
  materials: readonly Shared3dMaterialSpec[],
): Shared3dBackgroundScene {
  const frozenMaterials = Object.freeze(
    materials.map((mat) =>
      Object.freeze({
        ...mat,
        baseAlbedoOklch: Object.freeze({ ...mat.baseAlbedoOklch }),
        lineTintOklch: Object.freeze({ ...mat.lineTintOklch }),
      }),
    ),
  );
  return Object.freeze({
    sceneId,
    sceneName,
    baseMaterials: frozenMaterials,
    materialsIntegrityHash: computeShared3dMaterialsHash(frozenMaterials),
  });
}

export const DEFAULT_SHARED_3D_CLASSROOM_SCENE: Shared3dBackgroundScene =
  createShared3dBackgroundScene("bg3d-shared-classroom-v1", "공유 3D 교실·복도 배경 세트", [
    {
      materialId: "mat-wall-plaster",
      materialName: "석고 벽면",
      baseAlbedoOklch: { l: 0.89, c: 0.015, h: 88 },
      roughness: 0.78,
      lineTintOklch: { l: 0.24, c: 0.02, h: 255 },
      emissionKelvin: 5400,
    },
    {
      materialId: "mat-desk-wood",
      materialName: "책상 원목",
      baseAlbedoOklch: { l: 0.68, c: 0.085, h: 66 },
      roughness: 0.56,
      lineTintOklch: { l: 0.22, c: 0.035, h: 52 },
      emissionKelvin: 5400,
    },
    {
      materialId: "mat-window-frame",
      materialName: "알루미늄 창틀",
      baseAlbedoOklch: { l: 0.72, c: 0.014, h: 235 },
      roughness: 0.34,
      lineTintOklch: { l: 0.2, c: 0.024, h: 248 },
      emissionKelvin: 5400,
    },
  ]);

/**
 * 결정론적 테스트·프리셋용 합성 캐릭터 선화 레이어 RGBA 생성기.
 */
export function buildSyntheticCharacterLineLayer(options: {
  readonly layerId: string;
  readonly layerName: string;
  readonly width?: number;
  readonly height?: number;
  readonly lineRgb: RgbColor;
  readonly strokeWidthPx: number;
  readonly paperGrainLevel: number;
  readonly transparentPaper?: boolean;
}): CharacterLineLayerSample {
  const width = Math.max(24, Math.round(options.width ?? 64));
  const height = Math.max(24, Math.round(options.height ?? 64));
  const stroke = clampNumber(options.strokeWidthPx, 1, 8);
  const grain = clampNumber(options.paperGrainLevel, 0, 1);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const transparentPaper = options.transparentPaper === true;

  const hLineY1 = Math.round(height * 0.25);
  const hLineY2 = Math.round(height * 0.72);
  const vLineX1 = Math.round(width * 0.28);
  const vLineX2 = Math.round(width * 0.74);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const inH1 = y >= hLineY1 && y < hLineY1 + Math.round(stroke) && x >= 8 && x < width - 8;
      const inH2 = y >= hLineY2 && y < hLineY2 + Math.round(stroke) && x >= 10 && x < width - 10;
      const inV1 = x >= vLineX1 && x < vLineX1 + Math.round(stroke) && y >= 8 && y < height - 8;
      const inV2 = x >= vLineX2 && x < vLineX2 + Math.round(stroke) && y >= 10 && y < height - 10;
      const isInk = inH1 || inH2 || inV1 || inV2;

      const grainSign = ((x * 7 + y * 13) % 2 === 0 ? 1 : -1) * (((x * 3 + y * 5) % 3) + 1) / 3;
      const grainDelta = Math.round(grain * 36 * grainSign);

      if (isInk) {
        rgba[idx] = clampNumber(options.lineRgb.r + Math.round(grainDelta * 0.15), 0, 255);
        rgba[idx + 1] = clampNumber(options.lineRgb.g + Math.round(grainDelta * 0.15), 0, 255);
        rgba[idx + 2] = clampNumber(options.lineRgb.b + Math.round(grainDelta * 0.15), 0, 255);
        rgba[idx + 3] = transparentPaper
          ? clampNumber(245 - Math.round(grain * 50 * ((x + y) % 2)), 140, 255)
          : 248;
      } else if (transparentPaper) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      } else {
        const paperBase = 244;
        rgba[idx] = clampNumber(paperBase + grainDelta, 180, 255);
        rgba[idx + 1] = clampNumber(paperBase - 2 + grainDelta, 178, 255);
        rgba[idx + 2] = clampNumber(paperBase - 6 + grainDelta, 174, 255);
        rgba[idx + 3] = 255;
      }
    }
  }

  return {
    layerId: options.layerId,
    layerName: options.layerName,
    width,
    height,
    rgba,
    ...(transparentPaper ? { paperTextureHint: grain } : {}),
  };
}

export const DEFAULT_ARTIST_LINE_PRESETS: readonly ArtistLineSamplePreset[] = [
  {
    id: "sepia-maru-rough",
    labelKo: "세피아 마루펜 · 2.0px · 황마지",
    summaryKo: "따뜻한 세피아 갈색 잉크와 중간 종이 입자",
    strokeWidthPx: 2,
    lineRgb: { r: 62, g: 38, b: 28 },
    paperGrainLevel: 0.52,
    sample: buildSyntheticCharacterLineLayer({
      layerId: "layer-sepia-maru",
      layerName: "주인공 선화 (세피아 마루펜)",
      lineRgb: { r: 62, g: 38, b: 28 },
      strokeWidthPx: 2,
      paperGrainLevel: 0.52,
    }),
  },
  {
    id: "indigo-gpen-smooth",
    labelKo: "딥네이비 G펜 · 3.0px · 켄트지",
    summaryKo: "굵고 선명한 남색 잉크와 매끄러운 디지털 켄트지",
    strokeWidthPx: 3,
    lineRgb: { r: 26, g: 34, b: 64 },
    paperGrainLevel: 0.12,
    sample: buildSyntheticCharacterLineLayer({
      layerId: "layer-indigo-gpen",
      layerName: "주인공 선화 (딥네이비 G펜)",
      lineRgb: { r: 26, g: 34, b: 64 },
      strokeWidthPx: 3,
      paperGrainLevel: 0.12,
    }),
  },
  {
    id: "charcoal-pencil-grainy",
    labelKo: "먹색 연필선 · 1.5px · 수채지",
    summaryKo: "가늘고 거친 연필 질감과 강한 수채 종이 입자",
    strokeWidthPx: 1.5,
    lineRgb: { r: 44, g: 42, b: 46 },
    paperGrainLevel: 0.82,
    sample: buildSyntheticCharacterLineLayer({
      layerId: "layer-charcoal-pencil",
      layerName: "주인공 선화 (연필 질감)",
      lineRgb: { r: 44, g: 42, b: 46 },
      strokeWidthPx: 2,
      paperGrainLevel: 0.82,
    }),
  },
];
