/**
 * Studio BG3D 환경광(IBL) 설정 — 순수 데이터 모듈.
 *
 * 지금까지 bg3d의 `scene.environment`는 절차 생성 파노라마(그라디언트 하늘 합성)의
 * 등거리 텍스처가 맡아 왔습니다(studio-bg3d-procedural-panorama.ts). 이 모듈은 그
 * 자리를 실제 HDRI 이미지로 승격하기 위한 문서 계약을 정의합니다.
 *
 * - `source: "procedural"` — 현행 동작 그대로 (기본값, 기존 문서의 회귀 없음).
 * - `source: "hdri"` — 카탈로그 에셋을 PMREM으로 변환해 `scene.environment`에 연결.
 *
 * 보이는 배경(scene.background)은 건드리지 않는 것이 기본입니다. 웹툰 배경은 GLB
 * 장면 자체가 주인공이라, HDRI는 반사·환경광 전용으로 쓰는 편이 안전합니다.
 * 배경까지 HDRI로 쓰려면 `useAsBackground`를 명시적으로 켜야 합니다.
 *
 * 이 설정은 `StudioBg3dLightingSettings.environment`에 실립니다(타입 확장 지점은
 * wave6/polyhaven/PATCHES.md). Three.js 객체를 직접 다루지 않습니다.
 */

import {
  isStudioBg3dHdriEnvironmentAssetId,
  type StudioBg3dHdriEnvironmentAssetId,
} from "./studio-bg3d-hdri-environment-assets";

export type StudioBg3dEnvironmentSource = "procedural" | "hdri";

export interface StudioBg3dEnvironmentSettings {
  readonly source: StudioBg3dEnvironmentSource;
  /** source가 "hdri"일 때 쓸 카탈로그 에셋. "procedural"이면 null입니다. */
  readonly assetId: StudioBg3dHdriEnvironmentAssetId | null;
  /** `scene.environmentIntensity` 배율. 0이면 환경광을 끈 것과 같습니다. */
  readonly intensity: number;
  /** 환경(및 배경으로 쓸 때의) 수평 회전, 도 단위 0–360. */
  readonly rotationDegrees: number;
  /** true면 등거리 원본을 `scene.background`에도 연결합니다. 기본 false. */
  readonly useAsBackground: boolean;
}

export const STUDIO_BG3D_ENVIRONMENT_INTENSITY_MIN = 0;
export const STUDIO_BG3D_ENVIRONMENT_INTENSITY_MAX = 4;

/** 기존 문서·신규 문서 모두에 적용되는 기본값. 현행 절차 파노라마 동작과 동일합니다. */
export const STUDIO_BG3D_DEFAULT_ENVIRONMENT_SETTINGS: StudioBg3dEnvironmentSettings =
  Object.freeze({
    source: "procedural",
    assetId: null,
    intensity: 1,
    rotationDegrees: 0,
    useAsBackground: false,
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeRotationDegrees(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * 저장된 문서 값을 안전한 환경 설정으로 정규화합니다.
 * studio-bg3d-scene-document.ts의 normalize* 함수들과 같은 규약(레코드 가드 +
 * 화이트리스트 + 범위 클램프 + 폴백)을 따릅니다. 통합 시 문서 모듈의 공용 헬퍼를
 * 재사용하도록 맞추세요.
 */
export function normalizeStudioBg3dEnvironmentSettings(
  value: unknown,
  fallback: StudioBg3dEnvironmentSettings = STUDIO_BG3D_DEFAULT_ENVIRONMENT_SETTINGS,
): StudioBg3dEnvironmentSettings {
  const candidate = isRecord(value) ? value : {};
  const assetId = isStudioBg3dHdriEnvironmentAssetId(candidate.assetId)
    ? candidate.assetId
    : null;
  // 에셋이 없는데 소스만 "hdri"인 값은 성립하지 않으므로 절차 환경으로 되돌립니다.
  const source: StudioBg3dEnvironmentSource =
    candidate.source === "hdri" && assetId !== null ? "hdri" : "procedural";
  return {
    source,
    assetId: source === "hdri" ? assetId : null,
    intensity: boundedNumber(
      candidate.intensity,
      fallback.intensity,
      STUDIO_BG3D_ENVIRONMENT_INTENSITY_MIN,
      STUDIO_BG3D_ENVIRONMENT_INTENSITY_MAX,
    ),
    rotationDegrees: normalizeRotationDegrees(
      candidate.rotationDegrees,
      fallback.rotationDegrees,
    ),
    useAsBackground:
      typeof candidate.useAsBackground === "boolean"
        ? candidate.useAsBackground
        : fallback.useAsBackground,
  };
}

/** 문서의 lighting 값에서 환경 설정을 꺼냅니다. 필드가 없으면 기본값을 돌립니다. */
export function resolveStudioBg3dEnvironmentSettings(lighting: {
  readonly environment?: StudioBg3dEnvironmentSettings;
}): StudioBg3dEnvironmentSettings {
  return normalizeStudioBg3dEnvironmentSettings(lighting.environment);
}

/** 실제 HDRI가 환경광으로 켜져 있는지 판정합니다(씬 그래프 마운트 조건). */
export function isStudioBg3dHdriEnvironmentActive(
  settings: StudioBg3dEnvironmentSettings,
): boolean {
  return settings.source === "hdri" && settings.assetId !== null;
}
