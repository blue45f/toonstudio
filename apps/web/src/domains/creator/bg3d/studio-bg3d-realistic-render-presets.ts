/**
 * Studio BG3D 실사 렌더 프리셋 — PBR·HDRI·Cycles·선화를 한 세트로 묶은 정의.
 *
 * PBR 표면 카탈로그(CC0, studio-bg3d-cc0-surface-material-catalog),
 * HDRI 조명 프리셋(studio-bg3d-hdri-lighting-presets), Cycles 멀티패스
 * 합성기(studio-bg3d-cycles-multipass-compositor)는 각자 존재했지만, 실사
 * 한 장을 뽑는 "세트"는 없었다. 이 모듈은 그 세 가지를 참조로 묶고,
 * 선화는 단일 경로(studio-line-extract-pipeline)로 해석한다.
 *
 * - 텍스처·HDRI 바이트를 복사하지 않는다. 카탈로그 id만 참조하고,
 *   해석 시점에 카탈로그에 실제로 있는지 검증한다(없으면 null).
 * - 렌더링을 실행하지 않는다. Cycles 패스 값은 기존 멀티패스 합성기의
 *   패스 키(beauty/ao/normal/depth)에 그대로 꽂히는 데이터다.
 * - 무거운 로컬 렌더링은 하지 않는다. 프리셋·파이프라인 정의 + 단위
 *   테스트가 이 모듈의 완성 범위다.
 */

import {
  findStudioBg3dCc0SurfaceMaterial,
  type StudioBg3dCc0SurfaceMaterialCategory,
  type StudioBg3dCc0SurfaceMaterialEntry,
} from "./studio-bg3d-cc0-surface-material-catalog";
import {
  getStudioBg3dHdriLightingPreset,
  type StudioBg3dHdriLightingPreset,
  type StudioBg3dHdriLightingPresetId,
} from "./studio-bg3d-hdri-lighting-presets";
import {
  resolveStudioLineExtractJob,
  type StudioLineExtractJob,
} from "./studio-line-extract-pipeline";

import type { StudioBg3dLightingSettings } from "./studio-bg3d-scene-document";
import type { WeatherPresetId } from "../scene-3d/studio-3d-atmosphere-weather";

export type StudioBg3dRealisticRenderPresetId =
  | "daylight-real"
  | "twilight-real"
  | "night-real"
  | "studio-real";

/** Cycles 멀티패스 합성기의 패스 키와 같은 값. */
export type StudioBg3dRealisticRenderPass = "beauty" | "ao" | "normal" | "depth";

export interface StudioBg3dRealisticRenderPassPlan {
  readonly pass: StudioBg3dRealisticRenderPass;
  readonly visible: boolean;
  readonly opacity: number;
}

export interface StudioBg3dRealisticRenderPreset {
  readonly id: StudioBg3dRealisticRenderPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  /** HDRI 조명 프리셋 참조 — 조명·노출·날씨·선 리그 시각을 함께 가져온다. */
  readonly hdriPresetId: StudioBg3dHdriLightingPresetId;
  /** 대표 PBR 표면 카테고리(실내 벽·바닥 기본값의 방향성). */
  readonly pbrSurfaceCategory: StudioBg3dCc0SurfaceMaterialCategory;
  /** 대표 PBR 재질 참조 — 카탈로그에 반드시 존재해야 한다. */
  readonly pbrMaterialId: string;
  readonly cyclesPasses: readonly StudioBg3dRealisticRenderPassPlan[];
  /** 선화 프로파일 — 단일 경로로 해석되는 입력. */
  readonly lineProfile: {
    readonly algorithm: "hybrid" | "normal-depth" | "sobel";
    readonly widthPx: number;
    readonly strength: number;
  };
}

function passPlan(
  pass: StudioBg3dRealisticRenderPass,
  visible: boolean,
  opacity: number,
): StudioBg3dRealisticRenderPassPlan {
  return Object.freeze({ pass, visible, opacity });
}

export const STUDIO_BG3D_REALISTIC_RENDER_PRESETS: readonly StudioBg3dRealisticRenderPreset[] =
  Object.freeze([
    Object.freeze({
      id: "daylight-real",
      labelKo: "낮 실사",
      descriptionKo: "맑은 한낮 — 회벽·원목 마루의 PBR 질감과 짧은 그림자, 또렷한 선화.",
      hdriPresetId: "daylight",
      pbrSurfaceCategory: "plaster-concrete",
      pbrMaterialId: "polyhaven-white-rough-plaster",
      cyclesPasses: Object.freeze([
        passPlan("beauty", true, 1),
        passPlan("ao", true, 0.45),
        passPlan("normal", false, 1),
        passPlan("depth", false, 1),
      ]),
      lineProfile: Object.freeze({ algorithm: "hybrid", widthPx: 2, strength: 0.8 }),
    }),
    Object.freeze({
      id: "twilight-real",
      labelKo: "황혼 실사",
      descriptionKo: "노을 역광 — 벽돌·원목의 따뜻한 반사, 긴 그림자, 굵은 외곽선.",
      hdriPresetId: "twilight",
      pbrSurfaceCategory: "brick-stone",
      pbrMaterialId: "polyhaven-brick-wall-001",
      cyclesPasses: Object.freeze([
        passPlan("beauty", true, 1),
        passPlan("ao", true, 0.55),
        passPlan("normal", false, 1),
        passPlan("depth", false, 1),
      ]),
      lineProfile: Object.freeze({ algorithm: "hybrid", widthPx: 2.5, strength: 0.85 }),
    }),
    Object.freeze({
      id: "night-real",
      labelKo: "야간 실사",
      descriptionKo: "야간 실내 — 데님·금속 패브릭의 낮은 반사, 깊은 AO, 가는 선화.",
      hdriPresetId: "night",
      pbrSurfaceCategory: "metal-fabric",
      pbrMaterialId: "polyhaven-denim-fabric",
      cyclesPasses: Object.freeze([
        passPlan("beauty", true, 1),
        passPlan("ao", true, 0.6),
        passPlan("normal", false, 1),
        passPlan("depth", false, 1),
      ]),
      lineProfile: Object.freeze({ algorithm: "normal-depth", widthPx: 1.5, strength: 0.7 }),
    }),
    Object.freeze({
      id: "studio-real",
      labelKo: "스튜디오 실사",
      descriptionKo: "스튜디오 조명 — 원목 마루·회벽의 균일한 질감, 얕은 AO, 또렷한 선화.",
      hdriPresetId: "studio",
      pbrSurfaceCategory: "wood",
      pbrMaterialId: "polyhaven-wood-floor",
      cyclesPasses: Object.freeze([
        passPlan("beauty", true, 1),
        passPlan("ao", true, 0.35),
        passPlan("normal", false, 1),
        passPlan("depth", false, 1),
      ]),
      lineProfile: Object.freeze({ algorithm: "hybrid", widthPx: 2, strength: 0.8 }),
    }),
  ] as const);

export interface StudioBg3dResolvedRealisticRenderPreset {
  readonly preset: StudioBg3dRealisticRenderPreset;
  readonly hdri: StudioBg3dHdriLightingPreset;
  readonly pbrMaterial: StudioBg3dCc0SurfaceMaterialEntry;
  readonly lineJob: StudioLineExtractJob;
}

function isPresetId(value: unknown): value is StudioBg3dRealisticRenderPresetId {
  return value === "daylight-real"
    || value === "twilight-real"
    || value === "night-real"
    || value === "studio-real";
}

/**
 * 프리셋을 해석한다. HDRI 프리셋·PBR 재질·선화 작업 중 하나라도
 * 해석되지 않으면 null이다(없는 참조로 렌더를 시작하지 않는다).
 */
export function resolveStudioBg3dRealisticRenderPreset(
  id: unknown,
): StudioBg3dResolvedRealisticRenderPreset | null {
  if (!isPresetId(id)) return null;
  const preset = STUDIO_BG3D_REALISTIC_RENDER_PRESETS.find((entry) => entry.id === id);
  if (!preset) return null;
  const hdri = getStudioBg3dHdriLightingPreset(preset.hdriPresetId);
  if (!hdri) return null;
  const pbrMaterial = findStudioBg3dCc0SurfaceMaterial(preset.pbrMaterialId);
  if (!pbrMaterial || pbrMaterial.category !== preset.pbrSurfaceCategory) return null;
  const lineJob = resolveStudioLineExtractJob({
    source: "bg3d-lt",
    algorithm: preset.lineProfile.algorithm,
    widthPx: preset.lineProfile.widthPx,
    strength: preset.lineProfile.strength,
  });
  if (!lineJob) return null;
  return Object.freeze({ preset, hdri, pbrMaterial, lineJob });
}

/** 장면 문서에 꽂히는 형태의 실사 세트 적용 값. */
export interface StudioBg3dRealisticRenderApplication {
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  readonly weatherPresetId: WeatherPresetId;
  readonly sunTimeHours: number;
  readonly pbrMaterialId: string;
  readonly cyclesPasses: readonly StudioBg3dRealisticRenderPassPlan[];
  readonly lineJob: StudioLineExtractJob;
}

/**
 * 실사 프리셋을 장면 문서 적용 값으로 바꾼다. 호출자는 이 값을 기존
 * 장면 문서 갱신 경로로 그대로 쓴다(렌더러·패널이 새로 생기지 않는다).
 */
export function applyStudioBg3dRealisticRenderPreset(
  id: unknown,
): StudioBg3dRealisticRenderApplication | null {
  const resolved = resolveStudioBg3dRealisticRenderPreset(id);
  if (!resolved) return null;
  return Object.freeze({
    lighting: resolved.hdri.lighting,
    exposure: resolved.hdri.exposure,
    weatherPresetId: resolved.hdri.weatherPresetId,
    sunTimeHours: resolved.hdri.sunTimeHours,
    pbrMaterialId: resolved.pbrMaterial.id,
    cyclesPasses: resolved.preset.cyclesPasses,
    lineJob: resolved.lineJob,
  });
}
