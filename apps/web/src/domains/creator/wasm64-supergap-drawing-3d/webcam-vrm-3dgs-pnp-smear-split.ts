/**
 * Super-Gap Pillar B 통합 진입점 및 (#9) 3D G-Buffer Object-ID Multi-Layer Split Exporter.
 * - #5 Webcam-to-VRM 52 ARKit Blendshapes & Upper-Body Pose Mirroring (`./webcam-vrm-pose-solver`)
 * - #6 3DGS Spherical-Harmonics Time-of-Day Relighting & Weather Pass (`./sh-3dgs-relight-weather`)
 * - #7 2D Rough Vanishing Guides → 3D Camera PnP Perspective Solver (`./camera-pnp-motion-smear`)
 * - #8 3D Bone Motion-Vector Smear Frame & Radial Speedline Synthesizer (`./camera-pnp-motion-smear`)
 * - #9 3D G-Buffer Object-ID Multi-Layer Split Exporter (본 모듈):
 *      렌더된 3D 컷을 `distant-backdrop`, `mid-furniture`, `shadow`, `character`,
 *      `foreground-prop`, `line-art` 6개 RGBA 레이어로 분리해 2D 말풍선이
 *      깊이 평면 사이에 자연스럽게 샌드위치 삽입되도록 한다.
 */

import type { RgbaTuple } from "./wet-paper-lbm-v2";

export {
  ARKIT_52_BLENDSHAPE_NAMES,
  computeArkit52FromLandmarks,
  createNeutralWebcamFaceLandmarks,
  WebcamVrmExpressionPoseSolver,
  type Arkit52BlendshapeMap,
  type Arkit52BlendshapeName,
  type BrowLandmarks,
  type EyeLandmarks,
  type MouthLandmarks,
  type RawLandmarkSolveResult,
  type Vrm10PresetSummary,
  type VrmCutFreezeSnapshot,
  type VrmExpressionPoseOutput,
  type VrmGazePose,
  type VrmUpperBodyPose,
  type WebcamFaceLandmarks,
  type WebcamLandmarkFrame,
  type WebcamUpperBodyLandmarks,
  type WebcamVrmSolverOptions,
} from "./webcam-vrm-pose-solver";

export {
  generateDepthAwareWeatherParticles,
  relight3dgsSceneSh,
  SH_C0,
  SH_C1,
  TIME_OF_DAY_SH_PRESETS,
  validate3dgsRelightWgslSource,
  WGSL_3DGS_SH_RELIGHT_WEATHER,
  type GaussianSplatSceneInput,
  type Relight3dgsOptions,
  type Relight3dgsResult,
  type RelightCameraView,
  type RelightWgslValidation,
  type RgbTuple,
  type TimeOfDayPreset,
  type TimeOfDayShSpec,
  type Vec3Tuple,
  type WeatherParticle,
  type WeatherPassKind,
} from "./sh-3dgs-relight-weather";

export {
  estimateVanishingPointFromLines,
  solveCameraFromVanishingGuides,
  synthesizeMotionSmearAndSpeedlines,
  type BoneMotionVector,
  type HorizonLineSolution,
  type MotionSmearSynthesisInput,
  type MotionSmearSynthesisResult,
  type PerspectiveGuideLine,
  type RadialSpeedlineSegment,
  type SkeletonBoneSample,
  type SmearExtrusionQuad,
  type SolvedPerspectiveCamera,
  type VanishingGuideCameraInput,
  type VanishingPointEstimate,
} from "./camera-pnp-motion-smear";

// ---------------------------------------------------------------------------
// #9. 3D G-Buffer Object-ID Multi-Layer Split Exporter
// ---------------------------------------------------------------------------

export type GbufferObjectLayerTag =
  | "foreground-prop"
  | "character"
  | "mid-furniture"
  | "distant-backdrop";

export type GbufferDepthLayerId =
  | "distant-backdrop"
  | "mid-furniture"
  | "shadow"
  | "character"
  | "foreground-prop"
  | "line-art";

export const GBUFFER_DEPTH_LAYER_ORDER: readonly GbufferDepthLayerId[] = [
  "distant-backdrop",
  "mid-furniture",
  "shadow",
  "character",
  "foreground-prop",
  "line-art",
];

const LAYER_LABELS_KO: Readonly<Record<GbufferDepthLayerId, string>> = {
  "distant-backdrop": "원경 배경",
  "mid-furniture": "중경 소품·가구",
  shadow: "접촉·투영 그림자",
  character: "캐릭터 본체",
  "foreground-prop": "전경 오브젝트",
  "line-art": "3D 윤곽 선화",
};

export interface GbufferSplitInput {
  readonly width: number;
  readonly height: number;
  /** 원시 3D 렌더 RGBA (width * height * 4) */
  readonly colorRgba: Uint8ClampedArray;
  /** 선형 깊이 버퍼 (width * height, 미터 단위 또는 0..1) */
  readonly depth: Float32Array;
  /** 픽셀별 Object ID (width * height, 0 = 배경/하늘) */
  readonly objectIds: Uint32Array;
  /** 선택적 노멀 버퍼 (width * height * 3) */
  readonly normals?: Float32Array;
  /** 선택적 그림자 마스크 (width * height, 0 = 비그림자, 1 = 완전 그림자) */
  readonly shadowMask?: Float32Array;
  /** Object ID → 깊이 레이어 태그 매핑표 */
  readonly objectRegistry: Readonly<Record<number, GbufferObjectLayerTag>>;
  /** 미등록 Object ID 분류용 깊이 임계치 */
  readonly nearDepthThreshold?: number;
  readonly farDepthThreshold?: number;
  /** 선화 추출 민감도 */
  readonly lineArtDepthThreshold?: number;
  readonly lineArtNormalThreshold?: number;
  readonly lineArtInkRgba?: RgbaTuple;
  readonly shadowTintRgba?: RgbaTuple;
  readonly maxShadowAlpha?: number;
}

export interface GbufferExportedLayer {
  readonly id: GbufferDepthLayerId;
  readonly zOrder: number;
  readonly labelKo: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly nonTransparentPixels: number;
  readonly coverageRatio: number;
  readonly minDepth: number;
  readonly maxDepth: number;
}

export interface BalloonSandwichSlot {
  readonly slotId: string;
  readonly insertAfterLayer: GbufferDepthLayerId;
  readonly labelKo: string;
  readonly recommendedUseKo: string;
}

export interface GbufferMultiLayerSplitResult {
  readonly width: number;
  readonly height: number;
  readonly layers: Readonly<Record<GbufferDepthLayerId, GbufferExportedLayer>>;
  readonly orderedLayers: readonly GbufferExportedLayer[];
  readonly sandwichSlots: readonly BalloonSandwichSlot[];
  readonly totalLineArtPixels: number;
  readonly totalShadowPixels: number;
  readonly elapsedMs: number;
}

export interface SandwichOverlay2D {
  readonly id: string;
  readonly insertAfterLayer: GbufferDepthLayerId;
  readonly rgba: Uint8ClampedArray;
}

const DEFAULT_SANDWICH_SLOTS: readonly BalloonSandwichSlot[] = [
  {
    slotId: "behind-character",
    insertAfterLayer: "shadow",
    labelKo: "캐릭터 뒤(배경·가구 앞)",
    recommendedUseKo: "원경 효과음·실내 배경 말풍선",
  },
  {
    slotId: "between-character-and-foreground",
    insertAfterLayer: "character",
    labelKo: "캐릭터 앞 · 전경 소품 뒤",
    recommendedUseKo: "전경 기둥·소품 뒤로 자연스럽게 겹치는 대사 말풍선",
  },
  {
    slotId: "above-foreground-below-lineart",
    insertAfterLayer: "foreground-prop",
    labelKo: "전경 앞 · 선화 아래",
    recommendedUseKo: "컷 외곽선 아래 들어가는 강조 말풍선",
  },
  {
    slotId: "above-line-art",
    insertAfterLayer: "line-art",
    labelKo: "최상단(선화 위)",
    recommendedUseKo: "일반 대사 말풍선·내레이션 박스",
  },
];

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function toByte(unit01: number): number {
  return Math.round(clamp01(unit01) * 255);
}

function classifyPixelGeometryLayer(
  objectId: number,
  depthVal: number,
  registry: Readonly<Record<number, GbufferObjectLayerTag>>,
  nearDepthThreshold: number,
  farDepthThreshold: number,
): GbufferObjectLayerTag {
  const mapped = registry[objectId];
  if (mapped !== undefined) {
    return mapped;
  }
  if (objectId === 0 || depthVal >= farDepthThreshold) {
    return "distant-backdrop";
  }
  if (depthVal <= nearDepthThreshold) {
    return "foreground-prop";
  }
  return "mid-furniture";
}

/**
 * 3D G-Buffer(Color · Depth · ObjectID · Normal · Shadow)를 6개 RGBA 깊이 레이어로 분할한다.
 */
export function split3dGbufferIntoDepthLayers(
  input: GbufferSplitInput,
): GbufferMultiLayerSplitResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const width = Math.max(2, Math.floor(input.width));
  const height = Math.max(2, Math.floor(input.height));
  const pixelCount = width * height;

  const nearThreshold = input.nearDepthThreshold ?? 2.5;
  const farThreshold = input.farDepthThreshold ?? 22.0;
  const lineDepthThresh = Math.max(0.005, input.lineArtDepthThreshold ?? 0.08);
  const lineNormalThresh = Math.max(0.05, input.lineArtNormalThreshold ?? 0.35);
  const inkRgba: RgbaTuple = input.lineArtInkRgba ?? [0.06, 0.06, 0.08, 1];
  const shadowRgba: RgbaTuple = input.shadowTintRgba ?? [0.08, 0.09, 0.16, 1];
  const maxShadowAlpha = clamp01(input.maxShadowAlpha ?? 0.58);

  const buffers: Record<GbufferDepthLayerId, Uint8ClampedArray> = {
    "distant-backdrop": new Uint8ClampedArray(pixelCount * 4),
    "mid-furniture": new Uint8ClampedArray(pixelCount * 4),
    shadow: new Uint8ClampedArray(pixelCount * 4),
    character: new Uint8ClampedArray(pixelCount * 4),
    "foreground-prop": new Uint8ClampedArray(pixelCount * 4),
    "line-art": new Uint8ClampedArray(pixelCount * 4),
  };

  const nonTransparent: Record<GbufferDepthLayerId, number> = {
    "distant-backdrop": 0,
    "mid-furniture": 0,
    shadow: 0,
    character: 0,
    "foreground-prop": 0,
    "line-art": 0,
  };
  const minDepths: Record<GbufferDepthLayerId, number> = {
    "distant-backdrop": Number.POSITIVE_INFINITY,
    "mid-furniture": Number.POSITIVE_INFINITY,
    shadow: Number.POSITIVE_INFINITY,
    character: Number.POSITIVE_INFINITY,
    "foreground-prop": Number.POSITIVE_INFINITY,
    "line-art": Number.POSITIVE_INFINITY,
  };
  const maxDepths: Record<GbufferDepthLayerId, number> = {
    "distant-backdrop": Number.NEGATIVE_INFINITY,
    "mid-furniture": Number.NEGATIVE_INFINITY,
    shadow: Number.NEGATIVE_INFINITY,
    character: Number.NEGATIVE_INFINITY,
    "foreground-prop": Number.NEGATIVE_INFINITY,
    "line-art": Number.NEGATIVE_INFINITY,
  };

  const inkR = toByte(inkRgba[0]);
  const inkG = toByte(inkRgba[1]);
  const inkB = toByte(inkRgba[2]);
  const inkBaseA = clamp01(inkRgba[3]);

  const shR = toByte(shadowRgba[0]);
  const shG = toByte(shadowRgba[1]);
  const shB = toByte(shadowRgba[2]);

  const hasNormals = input.normals !== undefined && input.normals.length >= pixelCount * 3;
  const hasShadowMask = input.shadowMask !== undefined && input.shadowMask.length >= pixelCount;

  const recordPixelDepth = (layer: GbufferDepthLayerId, d: number): void => {
    nonTransparent[layer] += 1;
    if (d < minDepths[layer]) minDepths[layer] = d;
    if (d > maxDepths[layer]) maxDepths[layer] = d;
  };

  for (let y = 0; y < height; y += 1) {
    const yU = y > 0 ? y - 1 : 0;
    const yD = y < height - 1 ? y + 1 : height - 1;
    for (let x = 0; x < width; x += 1) {
      const xL = x > 0 ? x - 1 : 0;
      const xR = x < width - 1 ? x + 1 : width - 1;
      const idx = y * width + x;
      const rgbaOff = idx * 4;

      const dCenter = input.depth[idx];
      const objId = input.objectIds[idx];
      const geomLayer = classifyPixelGeometryLayer(
        objId,
        dCenter,
        input.objectRegistry,
        nearThreshold,
        farThreshold,
      );

      // 1) 물리 깊이 레이어(distant-backdrop / mid-furniture / character / foreground-prop)로 컬러 분리
      const srcA = input.colorRgba[rgbaOff + 3];
      if (srcA > 0) {
        const dst = buffers[geomLayer];
        dst[rgbaOff] = input.colorRgba[rgbaOff];
        dst[rgbaOff + 1] = input.colorRgba[rgbaOff + 1];
        dst[rgbaOff + 2] = input.colorRgba[rgbaOff + 2];
        dst[rgbaOff + 3] = srcA;
        recordPixelDepth(geomLayer, dCenter);
      }

      // 2) 그림자 레이어 분리 (명시 shadowMask 우선, 미제공 시 국소 깊이 오목부 접촉 AO 추정)
      let shadowStrength = 0;
      if (hasShadowMask && input.shadowMask) {
        shadowStrength = clamp01(input.shadowMask[idx]);
      } else {
        const avgNeighborDepth =
          0.25 *
          (input.depth[y * width + xL] +
            input.depth[y * width + xR] +
            input.depth[yU * width + x] +
            input.depth[yD * width + x]);
        const occlusionDelta = dCenter - avgNeighborDepth;
        if (occlusionDelta > 0.15) {
          shadowStrength = clamp01((occlusionDelta - 0.15) / 1.2);
        }
      }

      const shAlpha = Math.round(shadowStrength * maxShadowAlpha * 255);
      if (shAlpha > 0) {
        const shBuf = buffers.shadow;
        shBuf[rgbaOff] = shR;
        shBuf[rgbaOff + 1] = shG;
        shBuf[rgbaOff + 2] = shB;
        shBuf[rgbaOff + 3] = shAlpha;
        recordPixelDepth("shadow", dCenter);
      }

      // 3) 윤곽 선화(line-art) 레이어 추출 (Object-ID 경계 + 깊이 불연속 + 노멀 크리즈)
      const nIndices = [
        y * width + xL,
        y * width + xR,
        yU * width + x,
        yD * width + x,
      ];
      let idBoundary = false;
      let maxRelDepthDiff = 0;
      let maxNormalDiff = 0;
      const denomDepth = Math.max(0.1, Math.abs(dCenter));

      for (let k = 0; k < 4; k += 1) {
        const nIdx = nIndices[k];
        if (input.objectIds[nIdx] !== objId) {
          // 전경 쪽 픽셀에만 경계선을 찍어 1px 깔끔한 실루엣을 유지한다.
          if (dCenter <= input.depth[nIdx] + 1e-4) {
            idBoundary = true;
          }
        }
        const relDiff = Math.abs(input.depth[nIdx] - dCenter) / denomDepth;
        if (relDiff > maxRelDepthDiff) {
          maxRelDepthDiff = relDiff;
        }
        if (hasNormals && input.normals) {
          const c3 = idx * 3;
          const n3 = nIdx * 3;
          const dotN =
            input.normals[c3] * input.normals[n3] +
            input.normals[c3 + 1] * input.normals[n3 + 1] +
            input.normals[c3 + 2] * input.normals[n3 + 2];
          const crease = 1 - Math.max(-1, Math.min(1, dotN));
          if (crease > maxNormalDiff) {
            maxNormalDiff = crease;
          }
        }
      }

      const depthEdge =
        maxRelDepthDiff > lineDepthThresh
          ? clamp01((maxRelDepthDiff - lineDepthThresh) / (lineDepthThresh * 1.5))
          : 0;
      const normalEdge =
        maxNormalDiff > lineNormalThresh
          ? clamp01((maxNormalDiff - lineNormalThresh) / (lineNormalThresh * 1.2))
          : 0;
      const lineStrength = idBoundary ? 1 : Math.max(depthEdge, normalEdge);
      const lineAlpha = Math.round(lineStrength * inkBaseA * 255);

      if (lineAlpha > 0) {
        const lnBuf = buffers["line-art"];
        lnBuf[rgbaOff] = inkR;
        lnBuf[rgbaOff + 1] = inkG;
        lnBuf[rgbaOff + 2] = inkB;
        lnBuf[rgbaOff + 3] = lineAlpha;
        recordPixelDepth("line-art", dCenter);
      }
    }
  }

  const layersMap = {} as Record<GbufferDepthLayerId, GbufferExportedLayer>;
  const orderedLayers: GbufferExportedLayer[] = [];

  for (let i = 0; i < GBUFFER_DEPTH_LAYER_ORDER.length; i += 1) {
    const id = GBUFFER_DEPTH_LAYER_ORDER[i];
    const count = nonTransparent[id];
    const layer: GbufferExportedLayer = {
      id,
      zOrder: i,
      labelKo: LAYER_LABELS_KO[id],
      width,
      height,
      rgba: buffers[id],
      nonTransparentPixels: count,
      coverageRatio: count / pixelCount,
      minDepth: count > 0 ? minDepths[id] : 0,
      maxDepth: count > 0 ? maxDepths[id] : 0,
    };
    layersMap[id] = layer;
    orderedLayers.push(layer);
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    width,
    height,
    layers: layersMap,
    orderedLayers,
    sandwichSlots: DEFAULT_SANDWICH_SLOTS,
    totalLineArtPixels: nonTransparent["line-art"],
    totalShadowPixels: nonTransparent.shadow,
    elapsedMs: Math.max(0, t1 - t0),
  };
}

function compositeOverRgba(dst: Uint8ClampedArray, src: Uint8ClampedArray): void {
  const len = Math.min(dst.length, src.length);
  for (let i = 0; i < len; i += 4) {
    const sa = src[i + 3] / 255;
    if (sa <= 0) continue;
    const da = dst[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 1e-6) continue;
    dst[i] = Math.round((src[i] * sa + dst[i] * da * (1 - sa)) / outA);
    dst[i + 1] = Math.round((src[i + 1] * sa + dst[i + 1] * da * (1 - sa)) / outA);
    dst[i + 2] = Math.round((src[i + 2] * sa + dst[i + 2] * da * (1 - sa)) / outA);
    dst[i + 3] = Math.round(outA * 255);
  }
}

/**
 * 분할된 6개 깊이 레이어 사이에 2D 말풍선·효과음 오버레이를 샌드위치 합성한다.
 */
export function composeSandwichPreviewRgba(
  split: GbufferMultiLayerSplitResult,
  overlays: readonly SandwichOverlay2D[],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(split.width * split.height * 4);
  for (let i = 0; i < split.orderedLayers.length; i += 1) {
    const layer = split.orderedLayers[i];
    compositeOverRgba(out, layer.rgba);
    for (let k = 0; k < overlays.length; k += 1) {
      if (overlays[k].insertAfterLayer === layer.id) {
        compositeOverRgba(out, overlays[k].rgba);
      }
    }
  }
  return out;
}
