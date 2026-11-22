/**
 * Studio BG3D 환경광(IBL) 설정 계약 — 에셋 카탈로그 메타데이터와 분리된 순수 정규화 리프.
 * 문서 정규화(studio-bg3d-scene-document)가 카탈로그 설명·CDN URL·체크섬을 초기 그래프에 끌지 않고
 * 환경 설정과 에셋 ID 유효성만 검증할 수 있게 한다.
 */

export const STUDIO_BG3D_HDRI_ENVIRONMENT_ASSET_IDS = [
  "combination-room",
  "cobblestone-street-night",
  "konigsallee",
] as const;

export type StudioBg3dHdriEnvironmentAssetId =
  (typeof STUDIO_BG3D_HDRI_ENVIRONMENT_ASSET_IDS)[number];

const STUDIO_BG3D_HDRI_ENVIRONMENT_ASSET_ID_SET = new Set<string>(
  STUDIO_BG3D_HDRI_ENVIRONMENT_ASSET_IDS,
);

/** 저장된 문서 값 등이 카탈로그 ID인지 판정합니다(정규화용 타입 가드). */
export function isStudioBg3dHdriEnvironmentAssetId(
  value: unknown,
): value is StudioBg3dHdriEnvironmentAssetId {
  return typeof value === "string" && STUDIO_BG3D_HDRI_ENVIRONMENT_ASSET_ID_SET.has(value);
}

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
 * 화이트리스트 + 범위 클램프 + 폴백)을 따릅니다.
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
