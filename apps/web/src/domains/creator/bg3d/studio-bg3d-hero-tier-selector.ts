/**
 * Wave 4 `hero-v1`(6씬) + Wave V2 `hero-v2`(6씬) 총 12종 3D 배경의 기기·뷰포트별 전송 티어
 * (Desktop 8노드 ↔ Mobile 4노드) 자동 해석기.
 *
 * - 모바일 뷰포트(`<= 768px`), 저메모리 기기(`<= 4GB`), 또는 명시적 경량 우선(`preferMobileTier`)일 때
 *   `STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL_MOBILE`의 실측 검증 모바일 GLB 에셋으로 자동 전환한다.
 * - 절감 바이트(`savedBytes`)와 절감률(`savedPercent`)은 카탈로그 실측 `byteSize` 차이에서 계산한다.
 * - 비-히어로 레거시 에셋은 100% 원형 객체 그대로 반환해 하위 호환을 유지한다.
 */

import { getStudioBg3dEnvironmentAsset } from "./studio-bg3d-environment-catalog";
import type { StudioBg3dEnvironmentAsset } from "./studio-bg3d-environment-definition";
import {
  STUDIO_BG3D_HERO_V1_ENTRIES,
  type Bg3dHeroDeviceTier,
  type StudioBg3dHeroV1SceneEntry,
} from "./studio-bg3d-hero-v1-catalog-entries";
import {
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL_MOBILE,
  STUDIO_BG3D_HERO_ALL_ENTRIES,
  type StudioBg3dHeroV2SceneEntry,
} from "./studio-bg3d-hero-v2-catalog-entries";

export type StudioBg3dHeroSceneEntry = StudioBg3dHeroV1SceneEntry | StudioBg3dHeroV2SceneEntry;

export const HERO_BG3D_MOBILE_VIEWPORT_MAX_PX = 768 as const;
export const HERO_BG3D_MOBILE_MEMORY_MAX_GB = 4 as const;
const DEFAULT_DESKTOP_VIEWPORT_WIDTH_PX = 1280;

export interface HeroBg3dDeliveryContext {
  readonly viewportWidthPx: number;
  readonly deviceMemoryGb?: number;
  readonly preferMobileTier?: boolean;
}

export interface HeroBg3dDeliveryResolution {
  readonly asset: StudioBg3dEnvironmentAsset | null;
  readonly requestedAsset: StudioBg3dEnvironmentAsset | null;
  readonly tier: Bg3dHeroDeviceTier;
  /** 히어로 듀얼 티어(v1/v2 12종) 해당 여부 (기존 호출자 호환을 위해 v1·v2 모두 true). */
  readonly isHeroV1: boolean;
  readonly isHeroScene: boolean;
  readonly heroGeneration: "v1" | "v2" | null;
  readonly switchedToMobile: boolean;
  readonly desktopByteSize: number;
  readonly deliveredByteSize: number;
  readonly savedBytes: number;
  readonly savedPercent: number;
  readonly cutawayCapable: boolean;
  readonly heroEntry: StudioBg3dHeroSceneEntry | null;
}

export interface HeroBg3dMobileSavingsSummary {
  readonly sceneCount: number;
  readonly totalDesktopBytes: number;
  readonly totalMobileBytes: number;
  readonly totalSavedBytes: number;
  readonly averageSavedPercent: number;
}

const HERO_V1_SLUG_SET = new Set<string>(STUDIO_BG3D_HERO_V1_ENTRIES.map((entry) => entry.slug));

const MOBILE_ASSET_BY_ID = new Map<string, StudioBg3dEnvironmentAsset>(
  STUDIO_BG3D_ENVIRONMENT_ASSETS_HERO_ALL_MOBILE.map((asset) => [asset.id, asset] as const),
);

const HERO_ENTRY_BY_KEY = new Map<string, StudioBg3dHeroSceneEntry>(
  STUDIO_BG3D_HERO_ALL_ENTRIES.flatMap((entry) => [
    [entry.slug, entry] as const,
    [entry.desktopAsset.id, entry] as const,
    [entry.mobileAsset.id, entry] as const,
    [entry.desktopAsset.url, entry] as const,
    [entry.mobileAsset.url, entry] as const,
    [entry.desktopAsset.sha256, entry] as const,
    [entry.mobileAsset.sha256, entry] as const,
  ]),
);

/** 뷰포트 폭·기기 메모리·사용자 설정을 기준으로 모바일 경량 GLB 티어 사용 여부를 판별한다. */
export function shouldSelectHeroBg3dMobileTier(context: HeroBg3dDeliveryContext): boolean {
  if (context.preferMobileTier === true) return true;
  if (Number.isFinite(context.viewportWidthPx) && context.viewportWidthPx <= HERO_BG3D_MOBILE_VIEWPORT_MAX_PX) {
    return true;
  }
  if (
    typeof context.deviceMemoryGb === "number"
    && Number.isFinite(context.deviceMemoryGb)
    && context.deviceMemoryGb <= HERO_BG3D_MOBILE_MEMORY_MAX_GB
  ) {
    return true;
  }
  return false;
}

/** 히어로 3D 배경(v1·v2 12종) 에셋 ID·슬러그·URL·해시로부터 대응하는 히어로 씬 메타데이터를 조회한다. */
export function getHeroBg3dEntryByAssetId(
  assetId: string | null | undefined,
): StudioBg3dHeroSceneEntry | null {
  if (!assetId) return null;
  return HERO_ENTRY_BY_KEY.get(assetId.trim()) ?? null;
}

/** 8노드 카메라 앞벽 자동 컷어웨이를 지원하는 히어로 3D 배경(v1·v2 12종)인지 판별한다. */
export function isHeroV1CutawayCapableAsset(assetId: string | null | undefined): boolean {
  const entry = getHeroBg3dEntryByAssetId(assetId);
  return entry !== null && entry.cutawayEnabledWalls.length > 0;
}

export const isHeroCutawayCapableAsset = isHeroV1CutawayCapableAsset;

function roundPercentTenths(savedBytes: number, baselineBytes: number): number {
  if (savedBytes <= 0 || baselineBytes <= 0) return 0;
  return Math.round((savedBytes / baselineBytes) * 1000) / 10;
}

/**
 * 히어로 3D 배경(v1 6씬 + v2 6씬 = 12종)은 모바일/저메모리/경량 우선 컨텍스트에서
 * 실측 검증 모바일 GLB로 자동 해석하고, 비-히어로 레거시 에셋은 100% 원형 그대로 반환한다.
 */
export function resolveHeroBg3dDeliveryAsset(
  asset: StudioBg3dEnvironmentAsset,
  context: HeroBg3dDeliveryContext,
): HeroBg3dDeliveryResolution & {
  readonly asset: StudioBg3dEnvironmentAsset;
  readonly requestedAsset: StudioBg3dEnvironmentAsset;
};
export function resolveHeroBg3dDeliveryAsset(
  assetIdOrAsset: string | StudioBg3dEnvironmentAsset,
  context: HeroBg3dDeliveryContext,
): HeroBg3dDeliveryResolution;
export function resolveHeroBg3dDeliveryAsset(
  assetIdOrAsset: string | StudioBg3dEnvironmentAsset,
  context: HeroBg3dDeliveryContext,
): HeroBg3dDeliveryResolution {
  const lookupKey = typeof assetIdOrAsset === "string" ? assetIdOrAsset.trim() : assetIdOrAsset.id;
  const heroEntry = HERO_ENTRY_BY_KEY.get(lookupKey) ?? null;

  if (!heroEntry) {
    const legacyAsset = typeof assetIdOrAsset === "string"
      ? getStudioBg3dEnvironmentAsset(lookupKey)
      : assetIdOrAsset;
    const byteSize = legacyAsset?.byteSize ?? 0;
    return Object.freeze({
      asset: legacyAsset,
      requestedAsset: legacyAsset,
      tier: "desktop",
      isHeroV1: false,
      isHeroScene: false,
      heroGeneration: null,
      switchedToMobile: false,
      desktopByteSize: byteSize,
      deliveredByteSize: byteSize,
      savedBytes: 0,
      savedPercent: 0,
      cutawayCapable: false,
      heroEntry: null,
    });
  }

  const requestedAsset = typeof assetIdOrAsset === "string"
    ? (getStudioBg3dEnvironmentAsset(lookupKey)
      ?? (lookupKey === heroEntry.mobileAsset.id || lookupKey === heroEntry.mobileAsset.url
        ? heroEntry.mobileAsset
        : heroEntry.desktopAsset))
    : assetIdOrAsset;
  const wantsMobile = shouldSelectHeroBg3dMobileTier(context);
  const verifiedMobileAsset = MOBILE_ASSET_BY_ID.get(heroEntry.mobileAsset.id) ?? heroEntry.mobileAsset;
  const deliveredAsset = wantsMobile ? verifiedMobileAsset : heroEntry.desktopAsset;
  const tier: Bg3dHeroDeviceTier = wantsMobile ? "mobile" : "desktop";
  const desktopByteSize = heroEntry.desktopAsset.byteSize;
  const deliveredByteSize = deliveredAsset.byteSize;
  const savedBytes = wantsMobile ? Math.max(0, desktopByteSize - deliveredByteSize) : 0;
  const savedPercent = roundPercentTenths(savedBytes, desktopByteSize);
  const heroGeneration: "v1" | "v2" = HERO_V1_SLUG_SET.has(heroEntry.slug) ? "v1" : "v2";

  return Object.freeze({
    asset: deliveredAsset,
    requestedAsset,
    tier,
    isHeroV1: true,
    isHeroScene: true,
    heroGeneration,
    switchedToMobile: wantsMobile && requestedAsset.id !== verifiedMobileAsset.id,
    desktopByteSize,
    deliveredByteSize,
    savedBytes,
    savedPercent,
    cutawayCapable: heroEntry.cutawayEnabledWalls.length > 0,
    heroEntry,
  });
}

/** 현재 브라우저의 뷰포트 폭과 기기 메모리(지원 시)를 안전하게 읽어 전송 컨텍스트를 구성한다. */
export function readBrowserHeroBg3dDeliveryContext(
  overrides: Partial<HeroBg3dDeliveryContext> = {},
): HeroBg3dDeliveryContext {
  const viewportWidthPx = overrides.viewportWidthPx
    ?? (typeof window !== "undefined" && Number.isFinite(window.innerWidth) && window.innerWidth > 0
      ? window.innerWidth
      : DEFAULT_DESKTOP_VIEWPORT_WIDTH_PX);

  let deviceMemoryGb = overrides.deviceMemoryGb;
  if (deviceMemoryGb === undefined && typeof navigator !== "undefined") {
    const rawMemory = (navigator as Navigator & { readonly deviceMemory?: unknown }).deviceMemory;
    if (typeof rawMemory === "number" && Number.isFinite(rawMemory) && rawMemory > 0) {
      deviceMemoryGb = rawMemory;
    }
  }

  return Object.freeze({
    viewportWidthPx,
    ...(deviceMemoryGb !== undefined ? { deviceMemoryGb } : {}),
    ...(overrides.preferMobileTier !== undefined ? { preferMobileTier: overrides.preferMobileTier } : {}),
  });
}

/** 바이트 용량을 읽기 쉬운 MB 표기(`2.6 MB`)로 변환한다. */
export function formatHeroBg3dMegabytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0.0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 현재 전송 티어와 실측 절감 용량을 자연스러운 한국어 뱃지 문구로 요약한다. */
export function formatHeroBg3dDeliveryBadgeKo(
  resolution: Pick<HeroBg3dDeliveryResolution, "tier" | "deliveredByteSize" | "savedBytes" | "savedPercent">,
): string {
  if (resolution.tier === "mobile" && resolution.savedBytes > 0) {
    return `모바일 경량 -${resolution.savedPercent.toFixed(1)}% (${formatHeroBg3dMegabytes(resolution.savedBytes)} 절감)`;
  }
  return `데스크톱 8노드 · ${formatHeroBg3dMegabytes(resolution.deliveredByteSize)}`;
}

function summarizeMobileSavingsForEntries(
  entries: readonly StudioBg3dHeroSceneEntry[],
): HeroBg3dMobileSavingsSummary {
  let totalDesktopBytes = 0;
  let totalMobileBytes = 0;
  for (const entry of entries) {
    totalDesktopBytes += entry.desktopAsset.byteSize;
    totalMobileBytes += entry.mobileAsset.byteSize;
  }
  const totalSavedBytes = Math.max(0, totalDesktopBytes - totalMobileBytes);
  return Object.freeze({
    sceneCount: entries.length,
    totalDesktopBytes,
    totalMobileBytes,
    totalSavedBytes,
    averageSavedPercent: roundPercentTenths(totalSavedBytes, totalDesktopBytes),
  });
}

/** 6종 `hero-v1` 전체의 데스크톱 대비 모바일 실측 용량 절감 합계를 계산한다. */
export function summarizeHeroV1MobileSavings(): HeroBg3dMobileSavingsSummary {
  return summarizeMobileSavingsForEntries(STUDIO_BG3D_HERO_V1_ENTRIES);
}

/** 12종(v1 6씬 + v2 6씬) 전체의 데스크톱 대비 모바일 실측 용량 절감 합계를 계산한다. */
export function summarizeHeroAllMobileSavings(): HeroBg3dMobileSavingsSummary {
  return summarizeMobileSavingsForEntries(STUDIO_BG3D_HERO_ALL_ENTRIES);
}
