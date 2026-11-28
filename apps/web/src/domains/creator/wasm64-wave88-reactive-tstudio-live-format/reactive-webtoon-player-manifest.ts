/**
 * Wave-88: `.tstudio-live` 오프라인 PWA 플레이어 매니페스트, 정적 JPEG 용량 비교 및 60fps 예산 감사기.
 */

import {
  MAX_REDUCED_MOTION_SHIMMER_INTENSITY,
  TARGET_60FPS_FRAME_BUDGET_MS,
  evaluateReactiveWebtoonFrame,
  type ReactiveReaderState,
  type ReactiveWebtoonFrameState,
} from "./gyro-scroll-reactive-frame-evaluator";
import {
  TSTUDIO_LIVE_FILE_EXTENSION,
  TSTUDIO_LIVE_FORMAT_VERSION,
  TSTUDIO_LIVE_MAGIC,
  TSTUDIO_LIVE_MIME_TYPE,
  type DecodedTstudioLivePackage,
  type StaticFallbackRenderMode,
} from "./tstudio-live-container-codec";

export interface PlayerManifestOptions {
  readonly packageUrl?: string;
  readonly fallbackPosterUrl?: string;
  readonly cacheNamespace?: string;
}

/** 브라우저·오프라인 PWA 임베드 플레이어 매니페스트. */
export interface ReactiveWebtoonPlayerManifest {
  readonly manifestVersion: 1;
  readonly packageFormat: {
    readonly extension: typeof TSTUDIO_LIVE_FILE_EXTENSION;
    readonly mimeType: typeof TSTUDIO_LIVE_MIME_TYPE;
    readonly magic: typeof TSTUDIO_LIVE_MAGIC;
    readonly version: typeof TSTUDIO_LIVE_FORMAT_VERSION;
  };
  readonly episode: {
    readonly episodeId: string;
    readonly seriesId: string;
    readonly title: string;
    readonly author: string;
    readonly locale: string;
    readonly canvasWidthPx: number;
    readonly totalHeightPx: number;
    readonly panelCount: number;
    readonly targetFps: number;
  };
  readonly integrity: {
    readonly contentSha256Hex: string;
    readonly headerCrc32Hex: string;
    readonly bodyCrc32Hex: string;
    readonly containerByteLength: number;
  };
  readonly offlinePwa: {
    readonly cacheStrategy: "cache-first-content-addressed";
    readonly cacheKey: string;
    readonly packageUrl: string;
    readonly fallbackPosterUrl: string;
    readonly precacheResources: readonly string[];
    readonly estimatedStorageBytes: number;
    readonly offlineReady: true;
    readonly opfsAuthoritySupported: true;
  };
  readonly capabilities: {
    readonly requiresGyroscope: boolean;
    readonly hasReactiveParticles: boolean;
    readonly hasAudioCues: boolean;
    readonly supportsReducedMotion: true;
    readonly supportsBatterySaver: true;
    readonly staticFallbackGuaranteed: true;
  };
  readonly accessibility: {
    readonly ariaRole: "region";
    readonly ariaLabel: string;
    readonly reducedMotionPolicy: "zero-gyro-parallax-and-static-accents";
    readonly staticFallbackMode: StaticFallbackRenderMode;
    readonly panelAltTextCoverageRatio: number;
    readonly sensorPermissionLabel: string;
  };
  readonly staticFallback: {
    readonly posterAssetIndex: number;
    readonly posterContentHashHex: string;
    readonly posterAltText: string;
    readonly panelCount: number;
  };
  readonly embedHtmlSnippet: string;
}

export interface StaticJpegBaselineOptions {
  readonly measuredStaticJpegStackBytes?: number;
  readonly perCutJpegHeaderOverheadBytes?: number;
}

/** `.tstudio-live` vs 정적 JPEG 용량 비교 결과. */
export interface TstudioLiveStorageBudgetComparison {
  readonly baselineSource: "measured-static-jpeg" | "derived-non-deduplicated-layers";
  readonly containerByteLength: number;
  readonly baselineStaticJpegBytes: number;
  readonly savedBytes: number;
  readonly savingsRatio: number;
  readonly savingsPercent: number;
  readonly meetsFiftyPercentSavingsTarget: boolean;
  readonly uniqueAssetCount: number;
  readonly totalAssetReferenceCount: number;
  readonly assetReuseFactor: number;
}

export interface PerformanceAuditOptions {
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly frameBudgetMs?: number;
}

export interface PerformanceAuditScenarioResult {
  readonly scenarioId: string;
  readonly label: string;
  readonly cpuEvalMs: number;
  readonly estimatedGpuFrameMs: number;
  readonly combinedFrameMs: number;
  readonly maxExposedBlackBorderPx: number;
  readonly totalAudioWeight: number;
  readonly activeParticleCount: number;
  readonly hasNanValue: boolean;
}

/** 60fps 성능 및 접근성 불변식 종합 감사 결과. */
export interface ReactiveWebtoonPerformanceAudit {
  readonly episodeId: string;
  readonly frameBudgetMs: number;
  readonly sampledScenarioCount: number;
  readonly maxCpuEvalMs: number;
  readonly meanCpuEvalMs: number;
  readonly maxEstimatedGpuFrameMs: number;
  readonly maxCombinedFrameMs: number;
  readonly within60fpsBudget: boolean;
  readonly zeroBlackBorderViolations: boolean;
  readonly zeroNanViolations: boolean;
  readonly reducedMotionVerified: boolean;
  readonly audioWeightBounded: boolean;
  readonly passed: boolean;
  readonly scenarios: readonly PerformanceAuditScenarioResult[];
  readonly diagnostics: readonly string[];
}

function escapeHtmlAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function containsNonFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some((item) => containsNonFiniteNumber(item));
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) => containsNonFiniteNumber(entry));
  }
  return false;
}

/** 복호화된 `.tstudio-live` 패키지에서 오프라인 PWA 임베드 플레이어 매니페스트를 생성한다. */
export function buildReactiveWebtoonPlayerManifest(
  pkg: DecodedTstudioLivePackage,
  options?: PlayerManifestOptions,
): ReactiveWebtoonPlayerManifest {
  const shortHash = pkg.integrity.contentSha256Hex.slice(0, 16);
  const cacheNamespace = options?.cacheNamespace?.trim() || "tstudio-live-v1";
  const cacheKey = `${cacheNamespace}:${pkg.episode.episodeId}:${shortHash}`;
  const packageUrl =
    options?.packageUrl?.trim() || `/episodes/${pkg.episode.episodeId}.${shortHash}${TSTUDIO_LIVE_FILE_EXTENSION}`;
  const posterAsset = pkg.assets[pkg.staticFallback.posterAssetIndex];
  const posterHash = posterAsset ? posterAsset.contentHashHex : pkg.integrity.contentSha256Hex;
  const fallbackPosterUrl =
    options?.fallbackPosterUrl?.trim() || `/episodes/${pkg.episode.episodeId}/poster.${posterHash.slice(0, 12)}.webp`;

  let requiresGyroscope = false;
  let hasReactiveParticles = false;
  let panelsWithAlt = 0;
  for (const p of pkg.panels) {
    if (p.altText.trim().length > 0) panelsWithAlt += 1;
    if (p.emitters.length > 0) hasReactiveParticles = true;
    if (p.layers.length > 1) requiresGyroscope = true;
  }

  const precacheResources: string[] = [packageUrl, fallbackPosterUrl];
  for (const track of pkg.audioTracks) {
    if (track.resourceUri.trim() && !precacheResources.includes(track.resourceUri)) {
      precacheResources.push(track.resourceUri);
    }
  }

  const ariaLabel = `${pkg.episode.title} — 리액티브 웹툰 뷰어 (${pkg.panels.length}컷)`;
  const embedHtmlSnippet = [
    `<figure class="tstudio-live-embed" role="region" aria-label="${escapeHtmlAttr(ariaLabel)}"`,
    ` data-tstudio-live-src="${escapeHtmlAttr(packageUrl)}"`,
    ` data-tstudio-live-sha256="${escapeHtmlAttr(pkg.integrity.contentSha256Hex)}"`,
    ` data-tstudio-live-fallback-mode="${escapeHtmlAttr(pkg.staticFallback.renderMode)}">`,
    `  <noscript><img src="${escapeHtmlAttr(fallbackPosterUrl)}" alt="${escapeHtmlAttr(pkg.staticFallback.posterAltText)}" loading="lazy" /></noscript>`,
    `</figure>`,
  ].join("\n");

  return {
    manifestVersion: 1,
    packageFormat: {
      extension: TSTUDIO_LIVE_FILE_EXTENSION,
      mimeType: TSTUDIO_LIVE_MIME_TYPE,
      magic: TSTUDIO_LIVE_MAGIC,
      version: TSTUDIO_LIVE_FORMAT_VERSION,
    },
    episode: { ...pkg.episode, panelCount: pkg.panels.length },
    integrity: {
      contentSha256Hex: pkg.integrity.contentSha256Hex,
      headerCrc32Hex: pkg.integrity.headerCrc32Hex,
      bodyCrc32Hex: pkg.integrity.bodyCrc32Hex,
      containerByteLength: pkg.header.totalLength,
    },
    offlinePwa: {
      cacheStrategy: "cache-first-content-addressed",
      cacheKey,
      packageUrl,
      fallbackPosterUrl,
      precacheResources,
      estimatedStorageBytes: pkg.header.totalLength,
      offlineReady: true,
      opfsAuthoritySupported: true,
    },
    capabilities: {
      requiresGyroscope,
      hasReactiveParticles,
      hasAudioCues: pkg.audioTracks.length > 0,
      supportsReducedMotion: true,
      supportsBatterySaver: true,
      staticFallbackGuaranteed: true,
    },
    accessibility: {
      ariaRole: "region",
      ariaLabel,
      reducedMotionPolicy: "zero-gyro-parallax-and-static-accents",
      staticFallbackMode: pkg.staticFallback.renderMode,
      panelAltTextCoverageRatio: pkg.panels.length > 0 ? panelsWithAlt / pkg.panels.length : 0,
      sensorPermissionLabel: "기울기 반응을 켜면 컷의 시차와 빛 반사가 살아납니다",
    },
    staticFallback: {
      posterAssetIndex: pkg.staticFallback.posterAssetIndex,
      posterContentHashHex: posterHash,
      posterAltText: pkg.staticFallback.posterAltText,
      panelCount: pkg.staticFallback.panelFallbacks.length,
    },
    embedHtmlSnippet,
  };
}

/** `.tstudio-live` 컨테이너 용량과 비중복 정적 JPEG 컷 스택의 바이트 절감률을 계산한다. */
export function compareTstudioLiveVsStaticJpegBudget(
  pkg: DecodedTstudioLivePackage,
  baselineOptions?: StaticJpegBaselineOptions,
): TstudioLiveStorageBudgetComparison {
  const containerByteLength = pkg.header.totalLength;
  const measured = baselineOptions?.measuredStaticJpegStackBytes;
  const hasMeasured = typeof measured === "number" && Number.isFinite(measured) && measured > 0;
  const overhead = Math.max(0, Math.round(baselineOptions?.perCutJpegHeaderOverheadBytes ?? 620));
  const baselineStaticJpegBytes = hasMeasured
    ? Math.round(measured)
    : pkg.deduplicationStats.rawUncompressedReferenceBytes + pkg.panels.length * overhead;

  const savedBytes = baselineStaticJpegBytes - containerByteLength;
  const savingsRatio = baselineStaticJpegBytes > 0 ? savedBytes / baselineStaticJpegBytes : 0;
  const { uniqueAssetCount, totalAssetReferenceCount } = pkg.deduplicationStats;
  return {
    baselineSource: hasMeasured ? "measured-static-jpeg" : "derived-non-deduplicated-layers",
    containerByteLength,
    baselineStaticJpegBytes,
    savedBytes,
    savingsRatio,
    savingsPercent: Math.round(savingsRatio * 10000) / 100,
    meetsFiftyPercentSavingsTarget: savingsRatio >= 0.5,
    uniqueAssetCount,
    totalAssetReferenceCount,
    assetReuseFactor: uniqueAssetCount > 0 ? Math.round((totalAssetReferenceCount / uniqueAssetCount) * 100) / 100 : 0,
  };
}

function checkReducedMotionFrame(frame: ReactiveWebtoonFrameState): boolean {
  if (frame.degradationMode !== "reduced-motion-calm") return false;
  for (const panel of frame.panels) {
    for (const l of panel.layers) {
      if (l.parallaxXPx !== 0 || l.parallaxYPx !== 0) return false;
      if (l.specular.shimmerIntensity > MAX_REDUCED_MOTION_SHIMMER_INTENSITY + 1e-9) return false;
    }
    for (const em of panel.emitters) {
      if (em.mode !== "static-calm-accent" || em.effectiveTurbulence !== 0 || em.slantAngleDeg !== 0) return false;
    }
  }
  return true;
}

/** 6개 대표 상호작용 시나리오로 60fps 예산, 0px 검은 여백, NaN 무결성, 전정 보호를 감사한다. */
export function auditReactiveWebtoonPerformanceBudget(
  pkg: DecodedTstudioLivePackage,
  options?: PerformanceAuditOptions,
): ReactiveWebtoonPerformanceAudit {
  const viewportWidthPx = Math.max(280, Math.round(options?.viewportWidthPx ?? 390));
  const viewportHeightPx = Math.max(480, Math.round(options?.viewportHeightPx ?? 844));
  const frameBudgetMs = Math.max(1, options?.frameBudgetMs ?? TARGET_60FPS_FRAME_BUDGET_MS);
  const midY = Math.max(0, Math.floor((pkg.episode.totalHeightPx - viewportHeightPx) * 0.5));
  const lateY = Math.max(0, Math.floor((pkg.episode.totalHeightPx - viewportHeightPx) * 0.85));

  const makeState = (patch: Partial<ReactiveReaderState>): ReactiveReaderState => ({
    scrollY: 0,
    scrollVelocityPxPerSec: 0,
    gyroBetaDeg: 0,
    gyroGammaDeg: 0,
    elapsedTimeMs: 0,
    viewportWidthPx,
    viewportHeightPx,
    prefersReducedMotion: false,
    batterySaverMode: false,
    ...patch,
  });

  const cases: ReadonlyArray<{ readonly id: string; readonly label: string; readonly state: ReactiveReaderState }> = [
    { id: "idle-neutral", label: "기본 정지 상태", state: makeState({}) },
    { id: "tilt-left-20", label: "좌측 20도 기울기", state: makeState({ scrollY: midY, scrollVelocityPxPerSec: 120, gyroBetaDeg: -8, gyroGammaDeg: -20, elapsedTimeMs: 420 }) },
    { id: "tilt-right-20", label: "우측 20도 기울기", state: makeState({ scrollY: midY, scrollVelocityPxPerSec: 240, gyroBetaDeg: 10, gyroGammaDeg: 20, elapsedTimeMs: 840 }) },
    { id: "fast-scroll-1800", label: "고속 스크롤 1800px/s", state: makeState({ scrollY: lateY, scrollVelocityPxPerSec: 1800, gyroBetaDeg: 14, gyroGammaDeg: 18, elapsedTimeMs: 1680 }) },
    { id: "reduced-motion", label: "동작 줄이기(전정 보호)", state: makeState({ scrollY: midY, scrollVelocityPxPerSec: 1800, gyroBetaDeg: 25, gyroGammaDeg: 25, elapsedTimeMs: 1200, prefersReducedMotion: true }) },
    { id: "battery-saver", label: "절전 모드", state: makeState({ scrollY: midY, scrollVelocityPxPerSec: 900, gyroBetaDeg: 12, gyroGammaDeg: -16, elapsedTimeMs: 2100, batterySaverMode: true }) },
  ];

  const scenarios: PerformanceAuditScenarioResult[] = [];
  const diagnostics: string[] = [];
  let maxCpuEvalMs = 0, totalCpuEvalMs = 0, maxEstimatedGpuFrameMs = 0, maxCombinedFrameMs = 0;
  let zeroBlackBorderViolations = true, zeroNanViolations = true, reducedMotionVerified = false, audioWeightBounded = true;

  for (const item of cases) {
    const start = nowMs();
    const frame = evaluateReactiveWebtoonFrame(pkg, item.state);
    const cpuEvalMs = Math.max(0, nowMs() - start);
    const combinedFrameMs = cpuEvalMs + frame.metrics.estimatedGpuFrameMs;
    const hasNanValue = containsNonFiniteNumber(frame);

    if (cpuEvalMs > maxCpuEvalMs) maxCpuEvalMs = cpuEvalMs;
    totalCpuEvalMs += cpuEvalMs;
    if (frame.metrics.estimatedGpuFrameMs > maxEstimatedGpuFrameMs) maxEstimatedGpuFrameMs = frame.metrics.estimatedGpuFrameMs;
    if (combinedFrameMs > maxCombinedFrameMs) maxCombinedFrameMs = combinedFrameMs;
    if (frame.metrics.maxExposedBlackBorderPx > 0) {
      zeroBlackBorderViolations = false;
      diagnostics.push(`시나리오(${item.id}) 검은 여백 감지: ${frame.metrics.maxExposedBlackBorderPx}px`);
    }
    if (hasNanValue) {
      zeroNanViolations = false;
      diagnostics.push(`시나리오(${item.id}) 비유한 수치(NaN/Infinity) 감지`);
    }
    if (frame.metrics.totalAudioWeight > 1.0 + 1e-6) {
      audioWeightBounded = false;
      diagnostics.push(`시나리오(${item.id}) 오디오 가중치 합 초과: ${frame.metrics.totalAudioWeight}`);
    }
    if (item.id === "reduced-motion") {
      reducedMotionVerified = checkReducedMotionFrame(frame);
      if (!reducedMotionVerified) diagnostics.push("동작 줄이기 시나리오 불변식 위반");
    }

    scenarios.push({
      scenarioId: item.id,
      label: item.label,
      cpuEvalMs,
      estimatedGpuFrameMs: frame.metrics.estimatedGpuFrameMs,
      combinedFrameMs,
      maxExposedBlackBorderPx: frame.metrics.maxExposedBlackBorderPx,
      totalAudioWeight: frame.metrics.totalAudioWeight,
      activeParticleCount: frame.metrics.activeParticleCount,
      hasNanValue,
    });
  }

  const within60fpsBudget = maxCombinedFrameMs < frameBudgetMs;
  if (!within60fpsBudget) diagnostics.push(`최대 프레임 시간(${maxCombinedFrameMs.toFixed(2)}ms)이 60fps 예산 초과`);

  return {
    episodeId: pkg.episode.episodeId,
    frameBudgetMs,
    sampledScenarioCount: scenarios.length,
    maxCpuEvalMs,
    meanCpuEvalMs: scenarios.length > 0 ? totalCpuEvalMs / scenarios.length : 0,
    maxEstimatedGpuFrameMs,
    maxCombinedFrameMs,
    within60fpsBudget,
    zeroBlackBorderViolations,
    zeroNanViolations,
    reducedMotionVerified,
    audioWeightBounded,
    passed: within60fpsBudget && zeroBlackBorderViolations && zeroNanViolations && reducedMotionVerified && audioWeightBounded,
    scenarios,
    diagnostics,
  };
}
