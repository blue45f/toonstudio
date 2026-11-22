/**
 * 3D 배경 → 2D 캐릭터 1클릭 광원·림라이트 색온도 동기화 엔진.
 *
 * 3D 씬의 태양/키 라이트 방위각·고도각·색온도(2400K~10000K)·환경광 틴트·강도를
 * 2D 캐릭터 레이어에 바로 적용할 수 있는 결정적 데이터로 변환한다:
 *   1. 3단계 그라데이션 맵(shadow / midtone / highlight — sRGB + OKLCH)
 *   2. 역광 림라이트 벡터·두께(px)·불투명도·블렌드 모드(`screen` | `add` | `soft-light`)
 *   3. 그림자 투사 방향·길이 배율·흐림·2D 레이어 그림자 패치
 *   4. 웹툰 현장 즉시 프리셋 5종(석양 3200K · 교실 형광등 5400K · 네온 골목 7800K · 정오 야외 6500K · 새벽 달빛 8800K)
 *   5. 사용자 3D 씬(`StudioBg3dLightingSettings` / `StudioBg3dSceneDocument`) 직결 API 및 2D 브리지 이벤트
 */

import {
  STUDIO_BG3D_2D_LIGHT_SYNC_DEFAULT_AMBIENT_HEX,
  STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
  STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
  STUDIO_BG3D_2D_LIGHT_SYNC_NEUTRAL_KELVIN,
  clampLightSync01,
  clampLightSyncNumber,
  deepFreezeLightSync,
  estimateColorTemperatureKFromHex,
  kelvinToSrgbHex,
  kelvinToStudioTemperatureFilter,
  mixLightSyncOklab,
  normalizeAzimuthDeg,
  normalizeLightSyncHex,
  oklabToOklch,
  oklchToLightSyncColor,
  roundLightSync,
  srgbHexToLightSyncColor,
  type StudioBg3d2dLightSyncColor,
  type StudioBg3d2dLightSyncOklch,
} from "./studio-bg3d-2d-character-light-sync-color";
import {
  studioBg3dLightAnglesToDirection,
  studioBg3dLightDirectionToAngles,
} from "./studio-bg3d-light-direction";

import type { GradientMap } from "../studio-gradient-map";
import type {
  StudioBg3dLightingSettings,
  StudioBg3dSceneDocument,
  StudioBg3dVec3,
} from "./studio-bg3d-scene-document";

export {
  STUDIO_BG3D_2D_LIGHT_SYNC_DEFAULT_AMBIENT_HEX,
  STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
  STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
  STUDIO_BG3D_2D_LIGHT_SYNC_NEUTRAL_KELVIN,
  estimateColorTemperatureKFromHex,
  kelvinToSrgbHex,
  normalizeAzimuthDeg,
  normalizeLightSyncHex,
  oklchToLightSyncColor,
  srgbHexToLightSyncColor,
  type StudioBg3d2dLightSyncColor,
  type StudioBg3d2dLightSyncOklch,
};

export const STUDIO_BG3D_2D_LIGHT_SYNC_EVENT = "toonstudio:bg3d:character-light-sync";
export const STUDIO_BG3D_2D_LIGHT_SYNC_STORAGE_KEY =
  "toonstudio:bg3d:character-light-sync:latest:v1";

export type StudioBg3d2dRimBlendMode = "screen" | "add" | "soft-light";

export type StudioBg3d2dLightSyncPresetId =
  | "sunset"
  | "classroom-fluorescent"
  | "neon-alley"
  | "noon-outdoor"
  | "dawn-moonlight";

export interface StudioBg3d2dVector2 {
  readonly x: number;
  readonly y: number;
}

export interface StudioBg3d2dLightSyncInput {
  /** 3D 광원 방위각(도). 0°=+Z(정면), +90°=+X(우측), ±180°=-Z(역광). */
  readonly azimuthDeg: number;
  /** 3D 광원 고도각(도). -90°..90° 범위로 클램프된다. */
  readonly elevationDeg: number;
  /** 색온도(Kelvin). 2400K~10000K 범위로 클램프된다. */
  readonly colorTemperatureK: number;
  /** 환경광 틴트(#rrggbb 또는 #rgb). */
  readonly ambientTintHex: string;
  /** 주광 강도(0..20, 일반 구간 0.5..2.5). */
  readonly intensity: number;
  /** 환경광 강도(선택, 기본 0.55). */
  readonly ambientIntensity?: number;
  /** 3D 씬 키 라이트 원천 색상(선택 — 네온·강조 색조 보존). */
  readonly keyColorHex?: string;
  /** 3D 씬 필 라이트 원천 색상(선택 — 그림자 틴트 조화). */
  readonly fillColorHex?: string;
  /** 3D 씬 렌더 노출(선택, 기본 1.0). */
  readonly exposure?: number;
}

export interface StudioBg3d2dGradientMapStage {
  readonly pos: 0 | 0.5 | 1;
  readonly role: "shadow" | "midtone" | "highlight";
  readonly color: StudioBg3d2dLightSyncColor;
}

export interface StudioBg3d2dCharacterGradientMap {
  readonly shadow: StudioBg3d2dGradientMapStage;
  readonly midtone: StudioBg3d2dGradientMapStage;
  readonly highlight: StudioBg3d2dGradientMapStage;
  readonly recommendedOpacity: number;
  readonly studioGradientMap: GradientMap;
}

export interface StudioBg3d2dRimLightSpec {
  readonly vector2d: StudioBg3d2dVector2;
  readonly angleDeg: number;
  readonly backlightFactor: number;
  readonly thicknessPx: number;
  readonly opacity: number;
  readonly blendMode: StudioBg3d2dRimBlendMode;
  readonly color: StudioBg3d2dLightSyncColor;
}

export interface StudioBg3d2dShadowCastSpec {
  readonly direction2d: StudioBg3d2dVector2;
  readonly angleDeg: number;
  readonly lengthRatio: number;
  readonly softnessPx: number;
  readonly opacity: number;
  readonly color: StudioBg3d2dLightSyncColor;
  readonly layerShadowPatch: {
    readonly shadowColor: string;
    readonly shadowBlur: number;
    readonly shadowOffsetX: number;
    readonly shadowOffsetY: number;
    readonly shadowOpacity: number;
  };
}

export interface StudioBg3d2dCharacterLayerPatch {
  readonly gradientMap: GradientMap;
  readonly gradientMapOpacity: number;
  readonly temperature: number;
  readonly shadowColor: string;
  readonly shadowBlur: number;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
  readonly shadowOpacity: number;
  readonly rimLight: {
    readonly colorHex: string;
    readonly colorOklchCss: string;
    readonly blendMode: StudioBg3d2dRimBlendMode;
    readonly thicknessPx: number;
    readonly opacity: number;
    readonly vector2d: StudioBg3d2dVector2;
    readonly angleDeg: number;
  };
}

export interface StudioBg3d2dCharacterLightSyncResult {
  readonly normalizedInput: {
    readonly azimuthDeg: number;
    readonly elevationDeg: number;
    readonly colorTemperatureK: number;
    readonly ambientTintHex: string;
    readonly intensity: number;
    readonly ambientIntensity: number;
    readonly exposure: number;
  };
  readonly lightDirection3d: StudioBg3dVec3;
  readonly keyColor: StudioBg3d2dLightSyncColor;
  readonly ambientColor: StudioBg3d2dLightSyncColor;
  readonly gradientMap: StudioBg3d2dCharacterGradientMap;
  readonly rimLight: StudioBg3d2dRimLightSpec;
  readonly shadowCast: StudioBg3d2dShadowCastSpec;
  readonly characterLayerPatch: StudioBg3d2dCharacterLayerPatch;
}

export interface StudioBg3d2dLightSyncPreset {
  readonly id: StudioBg3d2dLightSyncPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly kelvinLabel: string;
  readonly input: StudioBg3d2dLightSyncInput;
  readonly bg3dLighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  readonly preview: StudioBg3d2dCharacterLightSyncResult;
}

export interface StudioBg3d2dCharacterLightSyncPayload {
  readonly version: 1;
  readonly source: "scene-3d" | "preset";
  readonly presetId: StudioBg3d2dLightSyncPresetId | null;
  readonly labelKo: string;
  readonly syncedAt: string;
  readonly result: StudioBg3d2dCharacterLightSyncResult;
}

export interface StudioBg3d2dLightSyncDispatchReceipt {
  readonly payload: StudioBg3d2dCharacterLightSyncPayload;
  readonly persistedToStorage: boolean;
  readonly dispatchedEvent: boolean;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DIRECTION_EPSILON = 1e-6;

let latestInMemoryLightSync: StudioBg3d2dCharacterLightSyncPayload | null = null;

function vector2AngleDeg(vector: StudioBg3d2dVector2): number {
  const raw = Math.atan2(vector.y, vector.x) * RAD_TO_DEG;
  const normalized = (raw + 360) % 360;
  return roundLightSync(normalized === 360 ? 0 : normalized, 1);
}

function resolveRimBlendMode(params: {
  readonly backlightFactor: number;
  readonly effectiveIntensity: number;
  readonly ambientRatio: number;
}): StudioBg3d2dRimBlendMode {
  const { backlightFactor, effectiveIntensity, ambientRatio } = params;
  if ((backlightFactor >= 0.65 && effectiveIntensity >= 1.35) || effectiveIntensity >= 1.65) {
    return "add";
  }
  if (ambientRatio >= 0.68 && effectiveIntensity <= 1.2 && backlightFactor < 0.55) {
    return "soft-light";
  }
  return "screen";
}

/**
 * 3D 광원(방위각·고도각·색온도·환경광 틴트·강도)을 2D 캐릭터 그라데이션 맵,
 * 역광 림라이트 벡터/두께/블렌드 모드, 그림자 투사 방향으로 결정적 변환한다.
 */
export function computeStudioBg3d2dCharacterLightSync(
  input: StudioBg3d2dLightSyncInput,
): StudioBg3d2dCharacterLightSyncResult {
  const azimuthDeg = normalizeAzimuthDeg(input.azimuthDeg);
  const elevationDeg = roundLightSync(clampLightSyncNumber(input.elevationDeg, -90, 90, 35), 2);
  const colorTemperatureK = Math.round(
    clampLightSyncNumber(
      input.colorTemperatureK,
      STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
      STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
      6_500,
    ),
  );
  const ambientTintHex = normalizeLightSyncHex(
    input.ambientTintHex,
    STUDIO_BG3D_2D_LIGHT_SYNC_DEFAULT_AMBIENT_HEX,
  );
  const intensity = roundLightSync(clampLightSyncNumber(input.intensity, 0, 20, 1.2), 3);
  const ambientIntensity = roundLightSync(
    clampLightSyncNumber(input.ambientIntensity ?? 0.55, 0, 10, 0.55),
    3,
  );
  const exposure = roundLightSync(clampLightSyncNumber(input.exposure ?? 1, 0.1, 8, 1), 3);

  const lightDirection3d = studioBg3dLightAnglesToDirection({ azimuthDeg, elevationDeg });
  const [lx, ly, lz] = lightDirection3d;

  const kelvinColor = srgbHexToLightSyncColor(kelvinToSrgbHex(colorTemperatureK));
  const keyColor = input.keyColorHex
    ? oklchToLightSyncColor(
        oklabToOklch(mixLightSyncOklab(kelvinColor, srgbHexToLightSyncColor(input.keyColorHex), 0.55)),
      )
    : kelvinColor;

  const baseAmbientColor = srgbHexToLightSyncColor(ambientTintHex);
  const ambientColor = input.fillColorHex
    ? oklchToLightSyncColor(
        oklabToOklch(
          mixLightSyncOklab(baseAmbientColor, srgbHexToLightSyncColor(input.fillColorHex), 0.25),
        ),
      )
    : baseAmbientColor;

  const effectiveIntensity = clampLightSyncNumber(
    intensity * clampLightSyncNumber(exposure, 0.5, 2.5, 1),
    0.1,
    4,
    1.2,
  );
  const intensityNorm = clampLightSync01((effectiveIntensity - 0.3) / 2.2);
  const elevationNorm = clampLightSync01(Math.max(0, elevationDeg) / 90);
  const ambientRatio = ambientIntensity / Math.max(0.25, effectiveIntensity);

  // 1) 3단계 그라데이션 맵(shadow / midtone / highlight) — OKLCH 지각 균일 보간
  const shadowColor = oklchToLightSyncColor({
    l: clampLightSyncNumber(
      0.15 + 0.11 * clampLightSync01(ambientIntensity) - 0.04 * intensityNorm,
      0.12,
      0.29,
      0.2,
    ),
    c: clampLightSyncNumber(Math.max(ambientColor.oklch.c * 0.85, 0.035), 0.025, 0.14, 0.06),
    h: ambientColor.oklch.c > 0.015 ? ambientColor.oklch.h : (keyColor.oklch.h + 180) % 360,
  });

  const midtoneOklchRaw = oklabToOklch(mixLightSyncOklab(ambientColor, keyColor, 0.56));
  const midtoneColor = oklchToLightSyncColor({
    l: clampLightSyncNumber(0.47 + 0.08 * elevationNorm + 0.05 * intensityNorm, 0.45, 0.63, 0.53),
    c: clampLightSyncNumber(midtoneOklchRaw.c * 0.82, 0.02, 0.16, 0.06),
    h: midtoneOklchRaw.h,
  });

  const highlightOklchRaw = oklabToOklch(mixLightSyncOklab(ambientColor, keyColor, 0.86));
  const highlightColor = oklchToLightSyncColor({
    l: clampLightSyncNumber(0.85 + 0.09 * intensityNorm + 0.03 * elevationNorm, 0.83, 0.97, 0.9),
    c: clampLightSyncNumber(
      Math.max(highlightOklchRaw.c * (0.76 + 0.22 * intensityNorm), 0.018),
      0.015,
      0.17,
      0.06,
    ),
    h: highlightOklchRaw.h,
  });

  const recommendedOpacity = roundLightSync(
    clampLightSyncNumber(0.24 + intensityNorm * 0.18 + (1 - elevationNorm) * 0.08, 0.18, 0.52, 0.34),
    2,
  );
  const studioGradientMap: GradientMap = {
    stops: [
      { pos: 0, color: shadowColor.srgbHex },
      { pos: 0.5, color: midtoneColor.srgbHex },
      { pos: 1, color: highlightColor.srgbHex },
    ],
  };

  // 2) 2D 림라이트 벡터(+x 우측, -y 상단)·역광 지수·두께·블렌드 모드
  const rawRimLen = Math.hypot(lx, -ly);
  const rimVector2d: StudioBg3d2dVector2 =
    rawRimLen > DIRECTION_EPSILON
      ? { x: roundLightSync(lx / rawRimLen, 4), y: roundLightSync(-ly / rawRimLen, 4) }
      : { x: 0, y: -1 };
  const rimAngleDeg = vector2AngleDeg(rimVector2d);

  const backlightFactor = roundLightSync(
    clampLightSync01((1 - lz) * 0.5 + clampLightSync01((35 - Math.abs(elevationDeg)) / 35) * 0.14),
    3,
  );
  const rimBlendMode = resolveRimBlendMode({
    backlightFactor,
    effectiveIntensity,
    ambientRatio,
  });
  const rimThicknessPx = roundLightSync(
    clampLightSyncNumber(
      1.5 + backlightFactor * 3.3 + (1 - elevationNorm) * 1.4 + intensityNorm * 1.7,
      1.5,
      8,
      3,
    ),
    2,
  );
  const rimOpacity = roundLightSync(
    clampLightSyncNumber(0.28 + backlightFactor * 0.38 + intensityNorm * 0.25, 0.25, 0.95, 0.6),
    3,
  );
  const rimColor = oklchToLightSyncColor({
    l: clampLightSyncNumber(0.84 + 0.12 * intensityNorm, 0.82, 0.98, 0.92),
    c: clampLightSyncNumber(Math.max(keyColor.oklch.c * 1.15, 0.04), 0.03, 0.22, 0.09),
    h: keyColor.oklch.h,
  });

  // 3) 그림자 투사 방향(림라이트 정반대)·길이·흐림·2D 패치
  const shadowDirection2d: StudioBg3d2dVector2 = {
    x: roundLightSync(-rimVector2d.x, 4),
    y: roundLightSync(-rimVector2d.y, 4),
  };
  const shadowAngleDeg = vector2AngleDeg(shadowDirection2d);
  const shadowLengthRatio =
    elevationDeg <= 0
      ? 3.5
      : roundLightSync(
          clampLightSyncNumber(
            1 / Math.tan(clampLightSyncNumber(elevationDeg, 12, 85, 45) * DEG_TO_RAD),
            0.25,
            3.5,
            1,
          ),
          2,
        );
  const shadowSoftnessPx = roundLightSync(
    clampLightSyncNumber(5 + clampLightSync01(ambientRatio) * 15 + elevationNorm * 5, 4, 28, 12),
    1,
  );
  const shadowOpacity = roundLightSync(
    clampLightSyncNumber(
      0.24 + intensityNorm * 0.3 - clampLightSync01(ambientRatio) * 0.12 + (1 - elevationNorm) * 0.1,
      0.18,
      0.68,
      0.42,
    ),
    3,
  );

  const shadowDistancePx = clampLightSyncNumber(12 * shadowLengthRatio, 3, 36, 12);
  const layerShadowPatch = {
    shadowColor: shadowColor.srgbHex,
    shadowBlur: shadowSoftnessPx,
    shadowOffsetX: roundLightSync(shadowDirection2d.x * shadowDistancePx, 1),
    shadowOffsetY: roundLightSync(shadowDirection2d.y * shadowDistancePx, 1),
    shadowOpacity,
  };

  return deepFreezeLightSync({
    normalizedInput: {
      azimuthDeg,
      elevationDeg,
      colorTemperatureK,
      ambientTintHex,
      intensity,
      ambientIntensity,
      exposure,
    },
    lightDirection3d,
    keyColor,
    ambientColor,
    gradientMap: {
      shadow: { pos: 0, role: "shadow", color: shadowColor },
      midtone: { pos: 0.5, role: "midtone", color: midtoneColor },
      highlight: { pos: 1, role: "highlight", color: highlightColor },
      recommendedOpacity,
      studioGradientMap,
    },
    rimLight: {
      vector2d: rimVector2d,
      angleDeg: rimAngleDeg,
      backlightFactor,
      thicknessPx: rimThicknessPx,
      opacity: rimOpacity,
      blendMode: rimBlendMode,
      color: rimColor,
    },
    shadowCast: {
      direction2d: shadowDirection2d,
      angleDeg: shadowAngleDeg,
      lengthRatio: shadowLengthRatio,
      softnessPx: shadowSoftnessPx,
      opacity: shadowOpacity,
      color: shadowColor,
      layerShadowPatch,
    },
    characterLayerPatch: {
      gradientMap: studioGradientMap,
      gradientMapOpacity: recommendedOpacity,
      temperature: kelvinToStudioTemperatureFilter(colorTemperatureK),
      ...layerShadowPatch,
      rimLight: {
        colorHex: rimColor.srgbHex,
        colorOklchCss: rimColor.oklchCss,
        blendMode: rimBlendMode,
        thicknessPx: rimThicknessPx,
        opacity: rimOpacity,
        vector2d: rimVector2d,
        angleDeg: rimAngleDeg,
      },
    },
  });
}

interface PresetSeed {
  readonly id: StudioBg3d2dLightSyncPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly input: StudioBg3d2dLightSyncInput;
  readonly fillColorHex: string;
  readonly fillIntensity: number;
  readonly exposure: number;
}

const PRESET_SEEDS: readonly PresetSeed[] = [
  {
    id: "sunset",
    labelKo: "석양",
    labelEn: "Sunset",
    summaryKo: "낮은 노을 역광과 보랏빛 그림자로 감성적인 황혼 컷 연출",
    summaryEn: "Low golden backlight with plum shadows for dramatic dusk scenes",
    input: {
      azimuthDeg: 118,
      elevationDeg: 16,
      colorTemperatureK: 3_200,
      ambientTintHex: "#4a2844",
      intensity: 1.75,
      ambientIntensity: 0.42,
      keyColorHex: "#ff9b52",
      fillColorHex: "#9b72cf",
      exposure: 1.1,
    },
    fillColorHex: "#9b72cf",
    fillIntensity: 0.45,
    exposure: 1.1,
  },
  {
    id: "classroom-fluorescent",
    labelKo: "교실 형광등",
    labelEn: "Classroom",
    summaryKo: "천장 직하 형광등과 부드러운 실내 반사광으로 깔끔한 일상 컷",
    summaryEn: "Overhead fluorescent glow with soft bounce for clean indoor dialogue",
    input: {
      azimuthDeg: 28,
      elevationDeg: 68,
      colorTemperatureK: 5_400,
      ambientTintHex: "#cfe0e6",
      intensity: 1.05,
      ambientIntensity: 0.84,
      keyColorHex: "#f7f8f2",
      fillColorHex: "#d5e4ea",
      exposure: 1.02,
    },
    fillColorHex: "#d5e4ea",
    fillIntensity: 0.58,
    exposure: 1.02,
  },
  {
    id: "neon-alley",
    labelKo: "네온 골목",
    labelEn: "Neon Alley",
    summaryKo: "시안 측후면 발광 림과 짙은 자주빛 암부로 야간 거리 대비 극대화",
    summaryEn: "Electric cyan rim and deep magenta shadow for vivid night alleys",
    input: {
      azimuthDeg: -128,
      elevationDeg: 28,
      colorTemperatureK: 7_800,
      ambientTintHex: "#2b1442",
      intensity: 1.8,
      ambientIntensity: 0.32,
      keyColorHex: "#38d9f5",
      fillColorHex: "#e14a8b",
      exposure: 1.16,
    },
    fillColorHex: "#e14a8b",
    fillIntensity: 0.72,
    exposure: 1.16,
  },
  {
    id: "noon-outdoor",
    labelKo: "정오 야외",
    labelEn: "Noon Outdoor",
    summaryKo: "높은 한낮 주광과 맑은 하늘 반사광으로 선명한 야외 컷",
    summaryEn: "High midday sun with clear sky ambient for crisp outdoor clarity",
    input: {
      azimuthDeg: 36,
      elevationDeg: 64,
      colorTemperatureK: 6_500,
      ambientTintHex: "#bdd9f2",
      intensity: 1.45,
      ambientIntensity: 0.6,
      keyColorHex: "#fffdf6",
      fillColorHex: "#a9cef4",
      exposure: 1.0,
    },
    fillColorHex: "#a9cef4",
    fillIntensity: 0.44,
    exposure: 1.0,
  },
  {
    id: "dawn-moonlight",
    labelKo: "새벽 달빛",
    labelEn: "Dawn Moonlight",
    summaryKo: "차가운 푸른 달빛 역광과 깊은 남색 그림자로 고요한 새벽 분위기",
    summaryEn: "Cool pale moonlight rim and deep navy shadows for quiet dawn scenes",
    input: {
      azimuthDeg: 142,
      elevationDeg: 38,
      colorTemperatureK: 8_800,
      ambientTintHex: "#172540",
      intensity: 1.15,
      ambientIntensity: 0.28,
      keyColorHex: "#b8d4ff",
      fillColorHex: "#33528c",
      exposure: 0.94,
    },
    fillColorHex: "#33528c",
    fillIntensity: 0.3,
    exposure: 0.94,
  },
];

function buildPreset(seed: PresetSeed): StudioBg3d2dLightSyncPreset {
  const preview = computeStudioBg3d2dCharacterLightSync(seed.input);
  const bg3dLighting: StudioBg3dLightingSettings = {
    ambientColor: seed.input.ambientTintHex,
    ambientIntensity: seed.input.ambientIntensity ?? 0.55,
    key: {
      color: seed.input.keyColorHex ?? kelvinToSrgbHex(seed.input.colorTemperatureK),
      direction: studioBg3dLightAnglesToDirection({
        azimuthDeg: seed.input.azimuthDeg,
        elevationDeg: seed.input.elevationDeg,
      }),
      intensity: seed.input.intensity,
      castsShadow: true,
    },
    fill: {
      color: seed.fillColorHex,
      direction: studioBg3dLightAnglesToDirection({
        azimuthDeg: normalizeAzimuthDeg(seed.input.azimuthDeg + 180),
        elevationDeg: Math.max(18, Math.min(48, Math.round(seed.input.elevationDeg * 0.65 + 14))),
      }),
      intensity: seed.fillIntensity,
      castsShadow: false,
    },
  };

  return {
    id: seed.id,
    labelKo: seed.labelKo,
    labelEn: seed.labelEn,
    summaryKo: seed.summaryKo,
    summaryEn: seed.summaryEn,
    kelvinLabel: `${seed.input.colorTemperatureK}K`,
    input: seed.input,
    bg3dLighting,
    exposure: seed.exposure,
    preview,
  };
}

/** 웹툰 현장 즉시 적용용 3D→2D 캐릭터 광원 동기화 프리셋 5종. */
export const STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS: readonly StudioBg3d2dLightSyncPreset[] =
  deepFreezeLightSync(PRESET_SEEDS.map(buildPreset));

export function getStudioBg3d2dLightSyncPreset(
  presetId: StudioBg3d2dLightSyncPresetId,
): StudioBg3d2dLightSyncPreset | null {
  return STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

/** 현재 3D 조명이 5종 프리셋 중 하나와 일치하면 해당 프리셋을 반환한다. */
export function resolveStudioBg3d2dLightSyncPreset(
  lighting: StudioBg3dLightingSettings,
  exposure: number,
): StudioBg3d2dLightSyncPreset | null {
  const epsilon = 1e-3;
  return (
    STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS.find(
      (preset) =>
        preset.bg3dLighting.ambientColor.toLowerCase() === lighting.ambientColor.toLowerCase()
        && Math.abs(preset.bg3dLighting.ambientIntensity - lighting.ambientIntensity) <= epsilon
        && preset.bg3dLighting.key.color.toLowerCase() === lighting.key.color.toLowerCase()
        && Math.abs(preset.bg3dLighting.key.intensity - lighting.key.intensity) <= epsilon
        && Math.abs(preset.exposure - exposure) <= epsilon
        && preset.bg3dLighting.key.direction.every(
          (component, index) => Math.abs(component - (lighting.key.direction[index] ?? Number.NaN)) <= epsilon,
        ),
    ) ?? null
  );
}

/**
 * 현재 3D 배경 편집기의 `StudioBg3dLightingSettings`와 노출로부터
 * 2D 캐릭터 광원 동기화 파라미터를 즉시 추출한다(사용자 3D 씬 직결 API).
 */
export function deriveCharacterLightSyncFromBg3dLighting(
  lighting: StudioBg3dLightingSettings,
  exposure = 1,
): StudioBg3d2dCharacterLightSyncResult {
  const matchedPreset = resolveStudioBg3d2dLightSyncPreset(lighting, exposure);
  if (matchedPreset) return matchedPreset.preview;
  const keyAngles = studioBg3dLightDirectionToAngles(lighting.key.direction);
  return computeStudioBg3d2dCharacterLightSync({
    azimuthDeg: keyAngles.azimuthDeg,
    elevationDeg: keyAngles.elevationDeg,
    colorTemperatureK: estimateColorTemperatureKFromHex(lighting.key.color),
    ambientTintHex: lighting.ambientColor,
    intensity: lighting.key.intensity,
    ambientIntensity: lighting.ambientIntensity,
    keyColorHex: lighting.key.color,
    fillColorHex: lighting.fill.color,
    exposure,
  });
}

/**
 * 전체 3D 씬 문서(`StudioBg3dSceneDocument`)에서 2D 캐릭터 광원 동기화 결과를 산출한다.
 */
export function deriveCharacterLightSyncFromSceneDocument(
  scene: Pick<StudioBg3dSceneDocument, "lighting" | "render">,
): StudioBg3d2dCharacterLightSyncResult {
  return deriveCharacterLightSyncFromBg3dLighting(scene.lighting, scene.render.exposure);
}

function defaultSyncStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 2D 캐릭터 광원 동기화 페이로드를 조립해 브리지 저장소와 커스텀 이벤트로 발행한다.
 */
export function dispatchStudioBg3d2dCharacterLightSync(
  result: StudioBg3d2dCharacterLightSyncResult,
  options: {
    readonly source?: "scene-3d" | "preset";
    readonly presetId?: StudioBg3d2dLightSyncPresetId | null;
    readonly labelKo?: string;
    readonly syncedAt?: string;
    readonly storage?: Storage | null;
  } = {},
): StudioBg3d2dLightSyncDispatchReceipt {
  const preset = options.presetId ? getStudioBg3d2dLightSyncPreset(options.presetId) : null;
  const payload: StudioBg3d2dCharacterLightSyncPayload = deepFreezeLightSync({
    version: 1,
    source: options.source ?? (preset ? "preset" : "scene-3d"),
    presetId: preset?.id ?? null,
    labelKo:
      options.labelKo
      ?? (preset
        ? `${preset.labelKo} ${preset.kelvinLabel}`
        : `3D 씬 ${result.normalizedInput.colorTemperatureK}K`),
    syncedAt: options.syncedAt ?? new Date().toISOString(),
    result,
  });

  latestInMemoryLightSync = payload;

  const storage = options.storage === undefined ? defaultSyncStorage() : options.storage;
  let persistedToStorage = false;
  if (storage) {
    try {
      storage.setItem(STUDIO_BG3D_2D_LIGHT_SYNC_STORAGE_KEY, JSON.stringify(payload));
      persistedToStorage = true;
    } catch {
      persistedToStorage = false;
    }
  }

  let dispatchedEvent = false;
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(
        new CustomEvent<StudioBg3d2dCharacterLightSyncPayload>(STUDIO_BG3D_2D_LIGHT_SYNC_EVENT, {
          detail: payload,
        }),
      );
      dispatchedEvent = true;
    } catch {
      dispatchedEvent = false;
    }
  }

  return Object.freeze({ payload, persistedToStorage, dispatchedEvent });
}

export function getLatestStudioBg3d2dCharacterLightSync(
  storage: Storage | null = defaultSyncStorage(),
): StudioBg3d2dCharacterLightSyncPayload | null {
  if (latestInMemoryLightSync) return latestInMemoryLightSync;
  if (!storage) return null;
  try {
    const raw = storage.getItem(STUDIO_BG3D_2D_LIGHT_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object"
      || parsed === null
      || (parsed as { version?: unknown }).version !== 1
      || typeof (parsed as { result?: unknown }).result !== "object"
      || (parsed as { result?: unknown }).result === null
    ) {
      return null;
    }
    const payload = parsed as StudioBg3d2dCharacterLightSyncPayload;
    latestInMemoryLightSync = payload;
    return payload;
  } catch {
    return null;
  }
}

export function clearLatestStudioBg3d2dCharacterLightSync(
  storage: Storage | null = defaultSyncStorage(),
): void {
  latestInMemoryLightSync = null;
  if (!storage) return;
  try {
    storage.removeItem(STUDIO_BG3D_2D_LIGHT_SYNC_STORAGE_KEY);
  } catch {
    // 스토리지 정리 실패는 무시한다.
  }
}
