/**
 * Wave 44C — 모바일 독자 뷰어 9:16 라이브 시뮬레이터 엔진 (네이버·카카오·글로벌 × 4대 실기기).
 *
 * - 4대 실기기 프로필: `iphone-se-375`, `galaxy-s25-390`, `iphone-16-promax-430`, `ipad-mini-744`
 * - 3대 연재 플랫폼 크롬: `naver-webtoon`, `kakao-page`, `global-vertical` × 라이트/다크 뷰어 모드
 * - 물리적 가독성·레이아웃 감사(`auditMobileReaderCuts`):
 *   - 원고 폭(800/690/1080px) → 기기 폭 다운스케일 배율 및 말풍선 실효 폰트 px(`< 11.5px` 가독성 위험 경고)
 *   - 다크 모드 흰 배경 컷 경계 눈부심(white-edge bleed) 위험 탐지
 *   - 한 화면 가시 컷 수 및 독자 엄지·하단 댓글바 간섭 검증
 *   - 회차 예상 완독 시간(초/분, 모든 추정 지표에 `dataSourceKind: "estimate"` 명시)
 * - 순수 시맨틱 SVG 모바일 목업 프리뷰 생성기(`buildMobilePreviewSvg`) 및 감사 JSON 내보내기(`exportMobileReaderAuditJson`)
 *
 * 순수 함수형 모듈: Web Storage · BigInt 리터럴 · private Map store · 원시 hex/rgb/hsl 색 미사용.
 */

export type SimulationDataSourceKind = "estimate";
export type MobileDeviceProfileId = "iphone-se-375" | "galaxy-s25-390" | "iphone-16-promax-430" | "ipad-mini-744";
export type MobileDeviceFormFactor = "compact-phone" | "standard-phone" | "large-phone" | "tablet";
export type DeviceNotchKind = "status-bar" | "punch-hole" | "dynamic-island" | "tablet-bar";
export type ReaderPlatformId = "naver-webtoon" | "kakao-page" | "global-vertical";
export type ViewerThemeMode = "light" | "dark";
export type ManuscriptWidthPresetPx = 690 | 800 | 1080;

export type CutBackgroundTone = "white-paper" | "off-white" | "tinted" | "dark-noir";
export type CutEdgeTreatment = "hard-white-border" | "soft-vignette" | "full-bleed-dark" | "gutter-fade";
export type CaptionPlacementZone = "top" | "middle" | "bottom-edge";
export type CutReadabilityStatus = "danger" | "tight" | "comfortable";
export type MobileAuditWarningSeverity = "info" | "warn" | "critical";
export type MobileAuditWarningCode =
  | "readability-font-too-small" | "dark-mode-white-edge-bleed"
  | "thumb-comment-bar-overlap" | "viewport-cut-overcrowding" | "cut-exceeds-single-viewport";

export interface EstimateProvenance {
  readonly dataSourceKind: SimulationDataSourceKind;
  readonly badgeLabelKo: "추정"; readonly badgeLabelEn: "Estimate";
  readonly noticeKo: string; readonly noticeEn: string;
}

export interface MobileDeviceProfile {
  readonly id: MobileDeviceProfileId; readonly formFactor: MobileDeviceFormFactor;
  readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly aspectRatioLabel: string; readonly cssWidthPx: number; readonly cssHeightPx: number;
  readonly devicePixelRatio: number; readonly topSafeAreaPx: number; readonly notchKind: DeviceNotchKind;
  readonly bottomHomeIndicatorPx: number; readonly thumbReachZoneHeightPx: number; readonly cornerRadiusPx: number;
}

export interface ReaderPlatformChromeProfile {
  readonly id: ReaderPlatformId;
  readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly recommendedManuscriptWidthPx: ManuscriptWidthPresetPx;
  readonly topChromeHeightPx: number; readonly bottomChromeHeightPx: number; readonly commentBarHeightPx: number;
  readonly supportsAutoHideChrome: boolean;
  readonly topBarTitleKo: string; readonly topBarTitleEn: string;
  readonly bottomBarHintKo: string; readonly bottomBarHintEn: string;
  readonly chromeNoteKo: string; readonly chromeNoteEn: string;
}

export interface MobileViewportGeometry {
  readonly deviceId: MobileDeviceProfileId; readonly platformId: ReaderPlatformId; readonly chromeVisible: boolean;
  readonly screenWidthPx: number; readonly screenHeightPx: number;
  readonly topSafeAreaPx: number; readonly topChromeHeightPx: number; readonly topObstructedPx: number;
  readonly bottomChromeHeightPx: number; readonly bottomHomeIndicatorPx: number; readonly bottomObstructedPx: number;
  readonly commentBarHeightPx: number; readonly thumbInterferenceBandPx: number;
  readonly visibleViewportHeightPx: number; readonly usableViewportRatioPct: number;
}

export interface MobileReaderCutInput {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly cutHeightPx: number; readonly gutterAfterPx: number;
  readonly bubbleFontPx: number; readonly dialogueCharCount: number;
  readonly backgroundTone: CutBackgroundTone; readonly edgeTreatment: CutEdgeTreatment;
  readonly captionPlacement: CaptionPlacementZone;
}

export interface AuditedMobileReaderCut extends MobileReaderCutInput {
  readonly index: number; readonly dataSourceKind: SimulationDataSourceKind;
  readonly scaledCutHeightPx: number; readonly scaledGutterAfterPx: number;
  readonly scaledTopY: number; readonly scaledBottomY: number; readonly scaledGutterEndY: number;
  readonly effectiveFontPx: number; readonly readabilityStatus: CutReadabilityStatus;
  readonly glareContrastRiskScore: number; readonly whiteEdgeBleedRisk: boolean;
  readonly thumbOverlapRisk: boolean; readonly requiredBottomGutterPx: number; readonly estimatedDwellSec: number;
}

export interface MobileAuditWarning {
  readonly code: MobileAuditWarningCode; readonly severity: MobileAuditWarningSeverity;
  readonly affectedCutIndices: readonly number[];
  readonly titleKo: string; readonly titleEn: string;
  readonly detailKo: string; readonly detailEn: string;
  readonly recommendationKo: string; readonly recommendationEn: string;
}

export interface EstimatedEpisodeReadTime {
  readonly dataSourceKind: SimulationDataSourceKind; readonly provenance: EstimateProvenance;
  readonly readingCharsPerSec: number; readonly scrollSpeedCssPxPerSec: number; readonly auditedCutCount: number;
  readonly sequenceReadTimeSec: number; readonly sequenceReadTimeMin: number;
  readonly sequenceDurationLabelKo: string; readonly sequenceDurationLabelEn: string;
  readonly projectedEpisodeCutCount: number;
  readonly projectedEpisodeReadTimeSec: number; readonly projectedEpisodeReadTimeMin: number;
  readonly projectedDurationLabelKo: string; readonly projectedDurationLabelEn: string;
}

export interface MobileReaderAuditSummary {
  readonly dataSourceKind: SimulationDataSourceKind;
  readonly cutCount: number; readonly manuscriptWidthPx: number;
  readonly downscaleRatio: number; readonly downscalePct: number;
  readonly minRecommendedManuscriptFontPx: number; readonly minEffectiveFontPx: number; readonly averageEffectiveFontPx: number;
  readonly unreadableCutCount: number; readonly whiteEdgeBleedCutCount: number; readonly thumbOverlapCutCount: number;
  readonly totalScaledHeightCssPx: number; readonly viewportScreenCount: number;
  readonly averageCutsPerScreen: number; readonly maxSimultaneousCutsInViewport: number;
  readonly overallReadinessScore: number; readonly criticalWarningCount: number; readonly warnCount: number;
}

export interface AuditMobileReaderCutsOptions {
  readonly cuts: readonly MobileReaderCutInput[];
  readonly deviceId?: MobileDeviceProfileId; readonly platformId?: ReaderPlatformId;
  readonly viewerTheme?: ViewerThemeMode; readonly manuscriptWidthPx?: number;
  readonly chromeVisible?: boolean; readonly readingCharsPerSec?: number;
  readonly scrollSpeedCssPxPerSec?: number; readonly projectedEpisodeCutCount?: number;
}

export interface MobileReaderAuditResult {
  readonly dataSourceKind: SimulationDataSourceKind; readonly provenance: EstimateProvenance;
  readonly device: MobileDeviceProfile; readonly platform: ReaderPlatformChromeProfile;
  readonly viewerTheme: ViewerThemeMode; readonly manuscriptWidthPx: number; readonly chromeVisible: boolean;
  readonly viewport: MobileViewportGeometry; readonly cuts: readonly AuditedMobileReaderCut[];
  readonly warnings: readonly MobileAuditWarning[]; readonly readTimeEstimate: EstimatedEpisodeReadTime;
  readonly summary: MobileReaderAuditSummary;
}

export interface CutAutoFixRecord {
  readonly cutId: string; readonly index: number;
  readonly changesKo: readonly string[]; readonly changesEn: readonly string[];
}

export interface AutoFixMobileReaderCutsResult {
  readonly cuts: readonly MobileReaderCutInput[]; readonly fixes: readonly CutAutoFixRecord[];
  readonly beforeAudit: MobileReaderAuditResult; readonly afterAudit: MobileReaderAuditResult;
}

export interface BuildMobilePreviewSvgOptions {
  readonly scrollOffsetCssPx?: number; readonly locale?: "ko" | "en"; readonly showSafeZones?: boolean;
}

export const READABILITY_MIN_EFFECTIVE_FONT_PX = 11.5;
export const READABILITY_COMFORT_FONT_PX = 13.0;
export const DEFAULT_READING_CHARS_PER_SEC = 13;
export const DEFAULT_SCROLL_SPEED_CSS_PX_PER_SEC = 260;
export const DEFAULT_PROJECTED_EPISODE_CUTS = 60;
export const OVERCROWDED_CUTS_PER_VIEWPORT_LIMIT = 4;
export const SINGLE_CUT_OVERFLOW_MULTIPLIER = 1.45;
export const WHITE_EDGE_BLEED_RISK_THRESHOLD = 65;

export const MANUSCRIPT_WIDTH_PRESETS: readonly ManuscriptWidthPresetPx[] = [690, 800, 1080] as const;
export const MOBILE_DEVICE_IDS: readonly MobileDeviceProfileId[] = [
  "iphone-se-375", "galaxy-s25-390", "iphone-16-promax-430", "ipad-mini-744",
] as const;

export const MOBILE_DEVICE_PROFILES: readonly MobileDeviceProfile[] = [
  {
    id: "iphone-se-375", formFactor: "compact-phone", aspectRatioLabel: "9:16",
    labelKo: "iPhone SE (375×667)", labelEn: "iPhone SE (375×667)", shortLabelKo: "iPhone SE", shortLabelEn: "iPhone SE",
    cssWidthPx: 375, cssHeightPx: 667, devicePixelRatio: 2,
    topSafeAreaPx: 20, notchKind: "status-bar", bottomHomeIndicatorPx: 0, thumbReachZoneHeightPx: 138, cornerRadiusPx: 20,
  },
  {
    id: "galaxy-s25-390", formFactor: "standard-phone", aspectRatioLabel: "9:19.5",
    labelKo: "Galaxy S25 (390×844)", labelEn: "Galaxy S25 (390×844)", shortLabelKo: "Galaxy S25", shortLabelEn: "Galaxy S25",
    cssWidthPx: 390, cssHeightPx: 844, devicePixelRatio: 3,
    topSafeAreaPx: 36, notchKind: "punch-hole", bottomHomeIndicatorPx: 18, thumbReachZoneHeightPx: 154, cornerRadiusPx: 30,
  },
  {
    id: "iphone-16-promax-430", formFactor: "large-phone", aspectRatioLabel: "9:19.5",
    labelKo: "iPhone 16 Pro Max (430×932)", labelEn: "iPhone 16 Pro Max (430×932)", shortLabelKo: "iPhone 16 PM", shortLabelEn: "iPhone 16 PM",
    cssWidthPx: 430, cssHeightPx: 932, devicePixelRatio: 3,
    topSafeAreaPx: 59, notchKind: "dynamic-island", bottomHomeIndicatorPx: 34, thumbReachZoneHeightPx: 172, cornerRadiusPx: 40,
  },
  {
    id: "ipad-mini-744", formFactor: "tablet", aspectRatioLabel: "2:3",
    labelKo: "iPad mini (744×1133)", labelEn: "iPad mini (744×1133)", shortLabelKo: "iPad mini", shortLabelEn: "iPad mini",
    cssWidthPx: 744, cssHeightPx: 1133, devicePixelRatio: 2,
    topSafeAreaPx: 24, notchKind: "tablet-bar", bottomHomeIndicatorPx: 20, thumbReachZoneHeightPx: 146, cornerRadiusPx: 26,
  },
] as const;

export const READER_PLATFORM_IDS: readonly ReaderPlatformId[] = [
  "naver-webtoon", "kakao-page", "global-vertical",
] as const;

export const READER_PLATFORM_PROFILES: readonly ReaderPlatformChromeProfile[] = [
  {
    id: "naver-webtoon", labelKo: "네이버 웹툰 (800px)", labelEn: "Naver Webtoon (800px)",
    shortLabelKo: "네이버 웹툰", shortLabelEn: "Naver Webtoon", recommendedManuscriptWidthPx: 800,
    topChromeHeightPx: 48, bottomChromeHeightPx: 56, commentBarHeightPx: 46, supportsAutoHideChrome: true,
    topBarTitleKo: "제14화 · 새벽 아틀리에", topBarTitleEn: "Ep. 14 · Dawn Atelier",
    bottomBarHintKo: "좋아요 1.2만 · 댓글 842 · 다음화", bottomBarHintEn: "12K Likes · 842 Comments · Next",
    chromeNoteKo: "상단 회차 바 48px + 하단 좋아요·댓글·회차이동 바 56px",
    chromeNoteEn: "48px top episode bar + 56px reaction, comment & nav bar",
  },
  {
    id: "kakao-page", labelKo: "카카오페이지 (690px)", labelEn: "KakaoPage (690px)",
    shortLabelKo: "카카오페이지", shortLabelEn: "KakaoPage", recommendedManuscriptWidthPx: 690,
    topChromeHeightPx: 52, bottomChromeHeightPx: 64, commentBarHeightPx: 54, supportsAutoHideChrome: true,
    topBarTitleKo: "14화 · 기다무 회차 뷰어", topBarTitleEn: "Ep. 14 · Reader Bar",
    bottomBarHintKo: "진행 스크러버 · 베스트 댓글 · 보관함", bottomBarHintEn: "Scrubber · Top Comments · Library",
    chromeNoteKo: "상단 52px + 하단 스크러버·댓글 바 64px (하단 간섭 범위 넓음)",
    chromeNoteEn: "52px top bar + 64px scrubber & comment bar",
  },
  {
    id: "global-vertical", labelKo: "글로벌 세로 뷰어 (1080px)", labelEn: "Global Vertical (1080px)",
    shortLabelKo: "글로벌 뷰어", shortLabelEn: "Global Vertical", recommendedManuscriptWidthPx: 1080,
    topChromeHeightPx: 44, bottomChromeHeightPx: 52, commentBarHeightPx: 44, supportsAutoHideChrome: true,
    topBarTitleKo: "EP.14 · GLOBAL HD", topBarTitleEn: "EP.14 · GLOBAL HD",
    bottomBarHintKo: "Like · Episode List · Comments", bottomBarHintEn: "Like · Episode List · Comments",
    chromeNoteKo: "1080px 고해상도 원고 축소율 주의 · 상단 44px + 하단 52px",
    chromeNoteEn: "Watch 1080px downscale · 44px top + 52px slim bottom nav",
  },
] as const;

export const DEFAULT_READER_CUTS: readonly MobileReaderCutInput[] = [
  {
    id: "cut-opening", labelKo: "오프닝 전경 · 새벽 골목", labelEn: "Opening Establishing Shot",
    cutHeightPx: 680, gutterAfterPx: 180, bubbleFontPx: 28, dialogueCharCount: 22,
    backgroundTone: "white-paper", edgeTreatment: "hard-white-border", captionPlacement: "top",
  },
  {
    id: "cut-whisper", labelKo: "주인공 클로즈업 · 속삭임 대사", labelEn: "Lead Close-Up Whisper",
    cutHeightPx: 540, gutterAfterPx: 140, bubbleFontPx: 22, dialogueCharCount: 34,
    backgroundTone: "off-white", edgeTreatment: "gutter-fade", captionPlacement: "middle",
  },
  {
    id: "cut-footsteps", labelKo: "계단 발소리 · 하단 나레이션", labelEn: "Staircase Footsteps Caption",
    cutHeightPx: 520, gutterAfterPx: 50, bubbleFontPx: 26, dialogueCharCount: 26,
    backgroundTone: "tinted", edgeTreatment: "soft-vignette", captionPlacement: "bottom-edge",
  },
  {
    id: "cut-impact", labelKo: "문 열림 반전 · 누아르 컷", labelEn: "Doorway Noir Reveal",
    cutHeightPx: 860, gutterAfterPx: 220, bubbleFontPx: 30, dialogueCharCount: 16,
    backgroundTone: "dark-noir", edgeTreatment: "full-bleed-dark", captionPlacement: "middle",
  },
  {
    id: "cut-cliffhanger", labelKo: "엔딩 시선 교차 · 클리프행어", labelEn: "Ending Cliffhanger Beat",
    cutHeightPx: 640, gutterAfterPx: 240, bubbleFontPx: 28, dialogueCharCount: 18,
    backgroundTone: "tinted", edgeTreatment: "soft-vignette", captionPlacement: "top",
  },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
function round1(value: number): number { return Math.round(value * 10) / 10; }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function round4(value: number): number { return Math.round(value * 10000) / 10000; }

function escapeXml(raw: string): string {
  return raw.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function createEstimateProvenance(noticeKo: string, noticeEn: string): EstimateProvenance {
  return { dataSourceKind: "estimate", badgeLabelKo: "추정", badgeLabelEn: "Estimate", noticeKo, noticeEn };
}

/** 초 단위 완독 시간을 한국어(예: "2분 15초") 또는 영문("2m 15s")으로 포맷한다. */
export function formatReadDuration(totalSec: number, locale: "ko" | "en" = "ko"): string {
  const safeSec = Math.max(0, Math.round(totalSec));
  const mins = Math.floor(safeSec / 60);
  const remSec = safeSec % 60;
  if (mins === 0) return locale === "en" ? `${remSec}s` : `${remSec}초`;
  if (remSec === 0) return locale === "en" ? `${mins}m` : `${mins}분`;
  return locale === "en" ? `${mins}m ${remSec}s` : `${mins}분 ${remSec}초`;
}

/** 실기기 프로필을 ID로 조회한다. */
export function getMobileDeviceProfile(id: MobileDeviceProfileId): MobileDeviceProfile {
  return MOBILE_DEVICE_PROFILES.find((item) => item.id === id) ?? MOBILE_DEVICE_PROFILES[0];
}

/** 플랫폼 뷰어 크롬 프로필을 ID로 조회한다. */
export function getReaderPlatformProfile(id: ReaderPlatformId): ReaderPlatformChromeProfile {
  return READER_PLATFORM_PROFILES.find((item) => item.id === id) ?? READER_PLATFORM_PROFILES[0];
}

/** 기본 샘플 컷 배열의 새 복사본을 반환한다. */
export function createDefaultReaderCuts(): MobileReaderCutInput[] {
  return DEFAULT_READER_CUTS.map((cut) => ({ ...cut }));
}

/** 기기 노치·상태바와 플랫폼 상/하단 네비게이션 크롬을 제외한 실제 컷 가시 뷰포트 기하학을 계산한다. */
export function calculateViewportGeometry(
  deviceId: MobileDeviceProfileId,
  platformId: ReaderPlatformId,
  chromeVisible = true,
): MobileViewportGeometry {
  const device = getMobileDeviceProfile(deviceId);
  const platform = getReaderPlatformProfile(platformId);
  const topChromeHeightPx = chromeVisible ? platform.topChromeHeightPx : 0;
  const bottomChromeHeightPx = chromeVisible ? platform.bottomChromeHeightPx : 0;
  const topObstructedPx = device.topSafeAreaPx + topChromeHeightPx;
  const bottomObstructedPx = device.bottomHomeIndicatorPx + bottomChromeHeightPx;
  const visibleViewportHeightPx = Math.max(200, device.cssHeightPx - topObstructedPx - bottomObstructedPx);
  const usableViewportRatioPct = round1((visibleViewportHeightPx / device.cssHeightPx) * 100);
  const thumbInterferenceBandPx = chromeVisible
    ? Math.round(platform.commentBarHeightPx * 0.85)
    : Math.max(26, Math.round(platform.commentBarHeightPx * 0.55));

  return {
    deviceId: device.id, platformId: platform.id, chromeVisible,
    screenWidthPx: device.cssWidthPx, screenHeightPx: device.cssHeightPx,
    topSafeAreaPx: device.topSafeAreaPx, topChromeHeightPx, topObstructedPx,
    bottomChromeHeightPx, bottomHomeIndicatorPx: device.bottomHomeIndicatorPx, bottomObstructedPx,
    commentBarHeightPx: platform.commentBarHeightPx, thumbInterferenceBandPx,
    visibleViewportHeightPx, usableViewportRatioPct,
  };
}

function computeGlareScore(viewerTheme: ViewerThemeMode, tone: CutBackgroundTone, edge: CutEdgeTreatment): number {
  if (viewerTheme === "light") return tone === "white-paper" && edge === "hard-white-border" ? 18 : 10;
  const baseByTone: Record<CutBackgroundTone, number> = { "white-paper": 84, "off-white": 68, tinted: 34, "dark-noir": 8 };
  const edgeModifier: Record<CutEdgeTreatment, number> = {
    "hard-white-border": 10, "gutter-fade": -18, "soft-vignette": -32, "full-bleed-dark": -44,
  };
  return clamp(baseByTone[tone] + edgeModifier[edge], 0, 100);
}

function sanitizeCut(cut: MobileReaderCutInput, index: number): MobileReaderCutInput {
  return {
    id: cut.id.trim() || `cut-${index + 1}`,
    labelKo: cut.labelKo.trim() || `${index + 1}번 컷`,
    labelEn: cut.labelEn.trim() || `Cut ${index + 1}`,
    cutHeightPx: Math.round(clamp(cut.cutHeightPx, 180, 3200)),
    gutterAfterPx: Math.round(clamp(cut.gutterAfterPx, 0, 900)),
    bubbleFontPx: round1(clamp(cut.bubbleFontPx, 10, 72)),
    dialogueCharCount: Math.round(clamp(cut.dialogueCharCount, 0, 300)),
    backgroundTone: cut.backgroundTone,
    edgeTreatment: cut.edgeTreatment,
    captionPlacement: cut.captionPlacement,
  };
}

function countMaxSimultaneousCuts(cuts: readonly AuditedMobileReaderCut[], viewportHeightPx: number): number {
  if (cuts.length === 0) return 0;
  let maxOverlap = 1;
  const starts = new Set<number>([0]);
  for (const cut of cuts) {
    starts.add(cut.scaledTopY);
    starts.add(Math.max(0, cut.scaledBottomY - viewportHeightPx + 1));
  }
  for (const winTop of starts) {
    const winBottom = winTop + viewportHeightPx;
    let visibleCount = 0;
    for (const cut of cuts) {
      const span = Math.min(cut.scaledBottomY, winBottom) - Math.max(cut.scaledTopY, winTop);
      if (span >= Math.min(28, cut.scaledCutHeightPx * 0.25)) visibleCount += 1;
    }
    if (visibleCount > maxOverlap) maxOverlap = visibleCount;
  }
  return maxOverlap;
}

/**
 * 원고 컷 배열을 실기기·플랫폼·다크모드 조건에서 물리적으로 감사한다.
 * 모든 완독 시간 및 체감 예측 지표에는 `dataSourceKind: "estimate"`를 명시한다.
 */
export function auditMobileReaderCuts(options: AuditMobileReaderCutsOptions): MobileReaderAuditResult {
  const device = getMobileDeviceProfile(options.deviceId ?? "iphone-se-375");
  const platform = getReaderPlatformProfile(options.platformId ?? "naver-webtoon");
  const viewerTheme: ViewerThemeMode = options.viewerTheme ?? "dark";
  const chromeVisible = options.chromeVisible ?? true;
  const manuscriptWidthPx = Math.round(clamp(options.manuscriptWidthPx ?? platform.recommendedManuscriptWidthPx, 480, 1600));
  const readingCharsPerSec = clamp(options.readingCharsPerSec ?? DEFAULT_READING_CHARS_PER_SEC, 6, 30);
  const scrollSpeedCssPxPerSec = clamp(options.scrollSpeedCssPxPerSec ?? DEFAULT_SCROLL_SPEED_CSS_PX_PER_SEC, 120, 640);

  const viewport = calculateViewportGeometry(device.id, platform.id, chromeVisible);
  const downscaleRatio = round4(Math.min(1, device.cssWidthPx / manuscriptWidthPx));
  const downscalePct = round1(downscaleRatio * 100);
  const minRecommendedManuscriptFontPx = Math.ceil(READABILITY_MIN_EFFECTIVE_FONT_PX / downscaleRatio);
  const safeInputs = options.cuts.length > 0 ? options.cuts.map((c, i) => sanitizeCut(c, i)) : createDefaultReaderCuts();

  const auditedCuts: AuditedMobileReaderCut[] = [];
  let cursorY = 0;

  for (let index = 0; index < safeInputs.length; index += 1) {
    const cut = safeInputs[index];
    if (!cut) continue;
    const scaledCutHeightPx = round1(cut.cutHeightPx * downscaleRatio);
    const scaledGutterAfterPx = round1(cut.gutterAfterPx * downscaleRatio);
    const scaledTopY = round1(cursorY);
    const scaledBottomY = round1(cursorY + scaledCutHeightPx);
    const scaledGutterEndY = round1(scaledBottomY + scaledGutterAfterPx);
    cursorY = scaledGutterEndY;

    const effectiveFontPx = round2(cut.bubbleFontPx * downscaleRatio);
    const readabilityStatus: CutReadabilityStatus =
      effectiveFontPx < READABILITY_MIN_EFFECTIVE_FONT_PX ? "danger"
        : effectiveFontPx < READABILITY_COMFORT_FONT_PX ? "tight" : "comfortable";

    const glareContrastRiskScore = computeGlareScore(viewerTheme, cut.backgroundTone, cut.edgeTreatment);
    const whiteEdgeBleedRisk = viewerTheme === "dark" && glareContrastRiskScore >= WHITE_EDGE_BLEED_RISK_THRESHOLD;

    const requiredBottomGutterCssPx = viewport.thumbInterferenceBandPx;
    const landsInFirstScreenCommentZone =
      chromeVisible &&
      cut.captionPlacement === "bottom-edge" &&
      scaledBottomY >= viewport.visibleViewportHeightPx - platform.commentBarHeightPx &&
      scaledBottomY <= viewport.visibleViewportHeightPx;
    const minClearanceCssPx = landsInFirstScreenCommentZone
      ? Math.max(requiredBottomGutterCssPx, platform.commentBarHeightPx)
      : requiredBottomGutterCssPx;
    const requiredBottomGutterPx = Math.ceil(minClearanceCssPx / downscaleRatio);
    const thumbOverlapRisk =
      cut.captionPlacement === "bottom-edge" && scaledGutterAfterPx < minClearanceCssPx;

    const visualBaseSec = 0.85 + Math.min(1.6, scaledCutHeightPx / Math.max(viewport.visibleViewportHeightPx, 240));
    const estimatedDwellSec = round2(
      visualBaseSec + cut.dialogueCharCount / readingCharsPerSec + (scaledCutHeightPx + scaledGutterAfterPx) / scrollSpeedCssPxPerSec,
    );

    auditedCuts.push({
      ...cut, index, dataSourceKind: "estimate",
      scaledCutHeightPx, scaledGutterAfterPx, scaledTopY, scaledBottomY, scaledGutterEndY,
      effectiveFontPx, readabilityStatus, glareContrastRiskScore, whiteEdgeBleedRisk,
      thumbOverlapRisk, requiredBottomGutterPx, estimatedDwellSec,
    });
  }

  const totalScaledHeightCssPx = round1(cursorY);
  const viewportScreenCount = round2(totalScaledHeightCssPx / Math.max(viewport.visibleViewportHeightPx, 1));
  const averageCutsPerScreen = round2(viewport.visibleViewportHeightPx / Math.max(totalScaledHeightCssPx / Math.max(auditedCuts.length, 1), 1));
  const maxSimultaneousCutsInViewport = countMaxSimultaneousCuts(auditedCuts, viewport.visibleViewportHeightPx);

  const unreadableIndices = auditedCuts.filter((c) => c.readabilityStatus === "danger").map((c) => c.index);
  const bleedIndices = auditedCuts.filter((c) => c.whiteEdgeBleedRisk).map((c) => c.index);
  const thumbOverlapIndices = auditedCuts.filter((c) => c.thumbOverlapRisk).map((c) => c.index);
  const oversizedIndices = auditedCuts
    .filter((c) => c.scaledCutHeightPx > viewport.visibleViewportHeightPx * SINGLE_CUT_OVERFLOW_MULTIPLIER)
    .map((c) => c.index);

  const warnings: MobileAuditWarning[] = [];

  if (unreadableIndices.length > 0) {
    const worstFont = Math.min(...auditedCuts.map((c) => c.effectiveFontPx));
    warnings.push({
      code: "readability-font-too-small", severity: "critical", affectedCutIndices: unreadableIndices,
      titleKo: `말풍선 축소 가독성 위험 (${worstFont}px < ${READABILITY_MIN_EFFECTIVE_FONT_PX}px)`,
      titleEn: `Bubble Readability Risk (${worstFont}px < ${READABILITY_MIN_EFFECTIVE_FONT_PX}px)`,
      detailKo: `${manuscriptWidthPx}px 원고가 ${device.shortLabelKo}(${device.cssWidthPx}px)에서 ${downscalePct}%로 축소되며 ${unreadableIndices.map((i) => `${i + 1}컷`).join("·")}의 실효 폰트가 ${READABILITY_MIN_EFFECTIVE_FONT_PX}px 미만입니다.`,
      detailEn: `Downscaling ${manuscriptWidthPx}px artwork to ${device.cssWidthPx}px (${downscalePct}%) pushes cuts ${unreadableIndices.map((i) => `#${i + 1}`).join(", ")} below ${READABILITY_MIN_EFFECTIVE_FONT_PX}px.`,
      recommendationKo: `해당 컷의 원고 말풍선 폰트를 최소 ${minRecommendedManuscriptFontPx}px 이상으로 키워 주세요.`,
      recommendationEn: `Increase manuscript bubble font size to at least ${minRecommendedManuscriptFontPx}px.`,
    });
  }

  if (bleedIndices.length > 0) {
    warnings.push({
      code: "dark-mode-white-edge-bleed", severity: "warn", affectedCutIndices: bleedIndices,
      titleKo: `다크 모드 흰 배경 컷 경계 눈부심 위험 (${bleedIndices.length}컷)`,
      titleEn: `Dark Mode White-Edge Bleed Risk (${bleedIndices.length} cuts)`,
      detailKo: `어두운 뷰어 배경 위에서 ${bleedIndices.map((i) => `${i + 1}컷`).join("·")}의 직각 흰색 경계가 급격한 눈부심(white-edge bleed)을 유발합니다.`,
      detailEn: `Hard white edges on cuts ${bleedIndices.map((i) => `#${i + 1}`).join(", ")} create abrupt glare against the dark viewer backdrop.`,
      recommendationKo: "경계 처리를 소프트 비네팅·여백 페이드로 바꾸거나 미색 톤 배경을 적용해 눈부심을 줄이세요.",
      recommendationEn: "Apply soft vignette, gutter fade, or a slightly tinted backdrop to soften edge glare.",
    });
  }

  if (thumbOverlapIndices.length > 0) {
    const maxRequiredGutter = Math.max(...auditedCuts.filter((c) => c.thumbOverlapRisk).map((c) => c.requiredBottomGutterPx));
    warnings.push({
      code: "thumb-comment-bar-overlap", severity: "warn", affectedCutIndices: thumbOverlapIndices,
      titleKo: `하단 댓글바 · 엄지 터치 영역 간섭 위험 (${thumbOverlapIndices.length}컷)`,
      titleEn: `Bottom Comment Bar & Thumb Overlap Risk (${thumbOverlapIndices.length} cuts)`,
      detailKo: `${platform.shortLabelKo} 하단 크롬(${platform.bottomChromeHeightPx}px)과 엄지 터치 영역이 ${thumbOverlapIndices.map((i) => `${i + 1}컷`).join("·")} 하단 자막을 가릴 수 있습니다.`,
      detailEn: `${platform.shortLabelEn} bottom chrome (${platform.bottomChromeHeightPx}px) and thumb reach zone may obscure bottom captions on cuts ${thumbOverlapIndices.map((i) => `#${i + 1}`).join(", ")}.`,
      recommendationKo: `하단 자막 컷의 여백을 최소 ${maxRequiredGutter}px 이상 확보하거나 자막을 중앙·상단으로 이동하세요.`,
      recommendationEn: `Expand bottom gutter to at least ${maxRequiredGutter}px or move captions away from the bottom edge.`,
    });
  }

  if (maxSimultaneousCutsInViewport >= OVERCROWDED_CUTS_PER_VIEWPORT_LIMIT) {
    warnings.push({
      code: "viewport-cut-overcrowding", severity: "warn", affectedCutIndices: auditedCuts.map((c) => c.index),
      titleKo: `한 화면 컷 과밀 위험 (최대 ${maxSimultaneousCutsInViewport}컷 동시 노출)`,
      titleEn: `Viewport Cut Overcrowding (Up to ${maxSimultaneousCutsInViewport} cuts at once)`,
      detailKo: `${device.shortLabelKo} 가시 뷰포트(${viewport.visibleViewportHeightPx}px)에 한 번에 ${maxSimultaneousCutsInViewport}컷이 몰려 시선이 분산됩니다.`,
      detailEn: `Up to ${maxSimultaneousCutsInViewport} cuts appear simultaneously inside the ${viewport.visibleViewportHeightPx}px visible viewport.`,
      recommendationKo: "핵심 컷 높이를 키우거나 컷 사이 여백을 넓혀 한 화면당 1.5~2.8컷 수준으로 정리하세요.",
      recommendationEn: "Increase key cut heights or gutters to keep 1.5-2.8 cuts per viewport.",
    });
  }

  if (oversizedIndices.length > 0) {
    warnings.push({
      code: "cut-exceeds-single-viewport", severity: "info", affectedCutIndices: oversizedIndices,
      titleKo: `단일 컷 가시 화면 초과 (${oversizedIndices.length}컷)`,
      titleEn: `Single Cut Exceeds Visible Viewport (${oversizedIndices.length} cuts)`,
      detailKo: `${oversizedIndices.map((i) => `${i + 1}컷`).join("·")}이 가시 뷰포트 높이의 ${SINGLE_CUT_OVERFLOW_MULTIPLIER}배를 넘어 한눈에 들어오지 않습니다.`,
      detailEn: `Cuts ${oversizedIndices.map((i) => `#${i + 1}`).join(", ")} exceed ${SINGLE_CUT_OVERFLOW_MULTIPLIER}x the visible viewport height.`,
      recommendationKo: "세로 파노라마 연출이 아니라면 말풍선 위치를 상·하단으로 분산 배치하세요.",
      recommendationEn: "If not an intentional vertical panorama, distribute speech bubbles across scroll stops.",
    });
  }

  const sequenceReadTimeSec = round1(auditedCuts.reduce((acc, cut) => acc + cut.estimatedDwellSec, 0));
  const sequenceReadTimeMin = round2(sequenceReadTimeSec / 60);
  const projectedEpisodeCutCount = Math.round(
    clamp(options.projectedEpisodeCutCount ?? Math.max(DEFAULT_PROJECTED_EPISODE_CUTS, auditedCuts.length), auditedCuts.length, 200),
  );
  const projectedEpisodeReadTimeSec = round1((sequenceReadTimeSec / Math.max(auditedCuts.length, 1)) * projectedEpisodeCutCount);
  const projectedEpisodeReadTimeMin = round2(projectedEpisodeReadTimeSec / 60);

  const provenance = createEstimateProvenance(
    "축소 가독성·눈부심 위험·완독 시간은 기기 물리 규격과 표준 독서 속도 가정을 바탕으로 산출한 추정 지표입니다.",
    "Readability, glare risk, and reading duration are physics-based estimates derived from device dimensions and standard reading speed assumptions.",
  );

  const readTimeEstimate: EstimatedEpisodeReadTime = {
    dataSourceKind: "estimate", provenance, readingCharsPerSec, scrollSpeedCssPxPerSec,
    auditedCutCount: auditedCuts.length, sequenceReadTimeSec, sequenceReadTimeMin,
    sequenceDurationLabelKo: formatReadDuration(sequenceReadTimeSec, "ko"),
    sequenceDurationLabelEn: formatReadDuration(sequenceReadTimeSec, "en"),
    projectedEpisodeCutCount, projectedEpisodeReadTimeSec, projectedEpisodeReadTimeMin,
    projectedDurationLabelKo: formatReadDuration(projectedEpisodeReadTimeSec, "ko"),
    projectedDurationLabelEn: formatReadDuration(projectedEpisodeReadTimeSec, "en"),
  };

  const criticalWarningCount = warnings.filter((w) => w.severity === "critical").length;
  const warnCount = warnings.filter((w) => w.severity === "warn").length;
  const infoCount = warnings.filter((w) => w.severity === "info").length;
  const penalty =
    unreadableIndices.length * 18 + bleedIndices.length * 10 + thumbOverlapIndices.length * 11 +
    (maxSimultaneousCutsInViewport >= OVERCROWDED_CUTS_PER_VIEWPORT_LIMIT ? 12 : 0) + infoCount * 4;
  const overallReadinessScore = clamp(Math.round(100 - penalty), 0, 100);
  const minEffectiveFontPx = round2(Math.min(...auditedCuts.map((c) => c.effectiveFontPx)));
  const averageEffectiveFontPx = round2(auditedCuts.reduce((acc, c) => acc + c.effectiveFontPx, 0) / Math.max(auditedCuts.length, 1));

  const summary: MobileReaderAuditSummary = {
    dataSourceKind: "estimate", cutCount: auditedCuts.length, manuscriptWidthPx,
    downscaleRatio, downscalePct, minRecommendedManuscriptFontPx, minEffectiveFontPx, averageEffectiveFontPx,
    unreadableCutCount: unreadableIndices.length, whiteEdgeBleedCutCount: bleedIndices.length,
    thumbOverlapCutCount: thumbOverlapIndices.length, totalScaledHeightCssPx, viewportScreenCount,
    averageCutsPerScreen, maxSimultaneousCutsInViewport, overallReadinessScore, criticalWarningCount, warnCount,
  };

  return {
    dataSourceKind: "estimate", provenance, device, platform, viewerTheme, manuscriptWidthPx,
    chromeVisible, viewport, cuts: auditedCuts, warnings, readTimeEstimate, summary,
  };
}

/** 가독성·다크모드 눈부심·하단 댓글바 간섭 경고를 원클릭으로 자동 보정한다. */
export function autoFixMobileReaderCuts(options: AuditMobileReaderCutsOptions): AutoFixMobileReaderCutsResult {
  const beforeAudit = auditMobileReaderCuts(options);
  const fixes: CutAutoFixRecord[] = [];

  const nextCuts: MobileReaderCutInput[] = beforeAudit.cuts.map((cut) => {
    let bubbleFontPx = cut.bubbleFontPx;
    let gutterAfterPx = cut.gutterAfterPx;
    let edgeTreatment = cut.edgeTreatment;
    const changesKo: string[] = [];
    const changesEn: string[] = [];

    if (cut.readabilityStatus === "danger") {
      bubbleFontPx = Math.max(bubbleFontPx, beforeAudit.summary.minRecommendedManuscriptFontPx);
      changesKo.push(`폰트 ${cut.bubbleFontPx}→${bubbleFontPx}px`);
      changesEn.push(`font ${cut.bubbleFontPx}->${bubbleFontPx}px`);
    }
    if (cut.whiteEdgeBleedRisk) {
      edgeTreatment = "soft-vignette";
      changesKo.push("경계 소프트 비네팅 적용");
      changesEn.push("soft-vignette edge applied");
    }
    if (cut.thumbOverlapRisk) {
      const targetGutter = Math.ceil((cut.requiredBottomGutterPx + 10) / 10) * 10;
      if (targetGutter > gutterAfterPx) {
        gutterAfterPx = targetGutter;
        changesKo.push(`하단 여백 ${cut.gutterAfterPx}→${gutterAfterPx}px`);
        changesEn.push(`gutter ${cut.gutterAfterPx}->${gutterAfterPx}px`);
      }
    }
    if (changesKo.length > 0) fixes.push({ cutId: cut.id, index: cut.index, changesKo, changesEn });

    return {
      id: cut.id, labelKo: cut.labelKo, labelEn: cut.labelEn,
      cutHeightPx: cut.cutHeightPx, gutterAfterPx, bubbleFontPx,
      dialogueCharCount: cut.dialogueCharCount, backgroundTone: cut.backgroundTone,
      edgeTreatment, captionPlacement: cut.captionPlacement,
    };
  });

  const afterAudit = auditMobileReaderCuts({ ...options, cuts: nextCuts });
  return { cuts: nextCuts, fixes, beforeAudit, afterAudit };
}

/**
 * 순수 시맨틱 `currentColor` · OKLCH 색상만 사용하는 모바일 독자 뷰어 SVG 목업을 생성한다.
 * 원시 hex / rgb / hsl 리터럴을 포함하지 않는다.
 */
export function buildMobilePreviewSvg(audit: MobileReaderAuditResult, options?: BuildMobilePreviewSvgOptions): string {
  const isEn = options?.locale === "en";
  const showSafeZones = options?.showSafeZones ?? true;
  const isDark = audit.viewerTheme === "dark";

  const frameScale = audit.device.formFactor === "tablet" ? 0.36 : 0.62;
  const screenW = Math.round(audit.device.cssWidthPx * frameScale);
  const screenH = Math.round(audit.device.cssHeightPx * frameScale);
  const bezel = 12;
  const svgW = screenW + bezel * 2 + 112;
  const svgH = screenH + bezel * 2 + 24;
  const sx = bezel;
  const sy = bezel + 12;
  const radius = Math.max(10, Math.round(audit.device.cornerRadiusPx * frameScale));

  const maxScroll = Math.max(0, audit.summary.totalScaledHeightCssPx - audit.viewport.visibleViewportHeightPx);
  const scrollOffset = clamp(options?.scrollOffsetCssPx ?? 0, 0, maxScroll);

  const topSafeH = Math.round(audit.viewport.topSafeAreaPx * frameScale);
  const topChromeH = Math.round(audit.viewport.topChromeHeightPx * frameScale);
  const bottomChromeH = Math.round(audit.viewport.bottomChromeHeightPx * frameScale);
  const homeIndH = Math.round(audit.viewport.bottomHomeIndicatorPx * frameScale);
  const vpTopY = sy + topSafeH + topChromeH;
  const vpH = Math.max(80, screenH - topSafeH - topChromeH - bottomChromeH - homeIndH);
  const thumbBandH = Math.round(audit.viewport.thumbInterferenceBandPx * frameScale);

  const shellFill = "oklch(0.19 0.012 75)";
  const shellStroke = "oklch(0.36 0.015 75)";
  const viewerBg = isDark ? "oklch(0.14 0.008 260)" : "oklch(0.96 0.008 85)";
  const chromeBg = isDark ? "oklch(0.2 0.012 260)" : "oklch(0.92 0.01 85)";
  const fgTone = isDark ? "oklch(0.92 0.01 85)" : "oklch(0.22 0.015 75)";
  const mutedTone = isDark ? "oklch(0.7 0.012 85)" : "oklch(0.46 0.015 75)";
  const accentTone = "oklch(0.68 0.16 42)";
  const goodTone = "oklch(0.64 0.14 152)";
  const warnTone = "oklch(0.74 0.16 74)";
  const badTone = "oklch(0.62 0.19 26)";

  const title = isEn
    ? `${audit.device.shortLabelEn} · ${audit.platform.shortLabelEn} (${audit.viewerTheme})`
    : `${audit.device.shortLabelKo} · ${audit.platform.shortLabelKo} (${isDark ? "다크" : "라이트"})`;
  const clipId = `reader-vp-${audit.device.id}-${audit.platform.id}`;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" role="img" aria-label="${escapeXml(title)}" data-device="${audit.device.id}" data-platform="${audit.platform.id}" data-theme="${audit.viewerTheme}" data-chrome-visible="${String(audit.chromeVisible)}" data-manuscript-width="${audit.manuscriptWidthPx}" data-visible-viewport-px="${audit.viewport.visibleViewportHeightPx}" style="color: ${fgTone};">`,
    `  <defs><clipPath id="${clipId}"><rect x="${sx}" y="${vpTopY}" width="${screenW}" height="${vpH}" /></clipPath></defs>`,
    `  <rect x="2" y="2" width="${screenW + bezel * 2 - 4}" height="${screenH + bezel * 2 + 12}" rx="${radius + 6}" fill="${shellFill}" stroke="${shellStroke}" stroke-width="1.5" />`,
    `  <rect x="${sx}" y="${sy}" width="${screenW}" height="${screenH}" rx="${radius}" fill="${viewerBg}" stroke="${shellStroke}" stroke-width="1" />`,
    `  <rect x="${sx}" y="${sy}" width="${screenW}" height="${topSafeH}" fill="${chromeBg}" />`,
  ];

  if (audit.device.notchKind === "dynamic-island") {
    const islandW = Math.round(screenW * 0.3);
    lines.push(`  <rect data-notch-kind="dynamic-island" x="${Math.round(sx + (screenW - islandW) * 0.5)}" y="${sy + 5}" width="${islandW}" height="12" rx="6" fill="${shellFill}" />`);
  } else if (audit.device.notchKind === "punch-hole") {
    lines.push(`  <circle data-notch-kind="punch-hole" cx="${Math.round(sx + screenW * 0.5)}" cy="${sy + Math.max(8, Math.round(topSafeH * 0.5))}" r="4.5" fill="${shellFill}" />`);
  } else {
    lines.push(`  <text data-notch-kind="${audit.device.notchKind}" x="${sx + 10}" y="${sy + Math.max(10, topSafeH - 4)}" fill="${mutedTone}" font-size="8" font-family="system-ui, sans-serif">9:41</text>`);
  }

  if (audit.chromeVisible && topChromeH > 0) {
    const headerLabel = isEn ? audit.platform.topBarTitleEn : audit.platform.topBarTitleKo;
    lines.push(`  <rect data-role="platform-top-chrome" x="${sx}" y="${sy + topSafeH}" width="${screenW}" height="${topChromeH}" fill="${chromeBg}" stroke="${shellStroke}" stroke-width="0.6" />`);
    lines.push(`  <text x="${sx + 10}" y="${sy + topSafeH + Math.round(topChromeH * 0.65)}" fill="currentColor" font-size="9" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(headerLabel)}</text>`);
  }

  lines.push(`  <g clip-path="url(#${clipId})">`);
  for (const cut of audit.cuts) {
    const cutY = round1(vpTopY + (cut.scaledTopY - scrollOffset) * frameScale);
    const cutH = Math.max(24, round1(cut.scaledCutHeightPx * frameScale));
    if (cutY + cutH < vpTopY - 20 || cutY > vpTopY + vpH + 20) continue;

    const cutBg = cut.backgroundTone === "white-paper" ? "oklch(0.98 0.004 85)"
      : cut.backgroundTone === "off-white" ? "oklch(0.93 0.012 85)"
      : cut.backgroundTone === "tinted" ? "oklch(0.84 0.025 80)" : "oklch(0.21 0.015 260)";
    const cutTextTone = cut.backgroundTone === "dark-noir" ? "oklch(0.93 0.01 85)" : "oklch(0.2 0.015 75)";
    const borderTone = cut.whiteEdgeBleedRisk ? warnTone : cut.readabilityStatus === "danger" ? badTone : shellStroke;
    const borderW = cut.whiteEdgeBleedRisk || cut.readabilityStatus === "danger" ? "1.8" : "0.9";
    const bubbleY = cut.captionPlacement === "bottom-edge" ? round1(cutY + Math.max(18, cutH - 22))
      : cut.captionPlacement === "middle" ? round1(cutY + Math.max(18, cutH * 0.45)) : round1(cutY + 18);
    const bubbleTone = cut.readabilityStatus === "danger" ? badTone : goodTone;
    const bubbleLabel = isEn
      ? `Font ${cut.effectiveFontPx}px (${cut.readabilityStatus})`
      : `실효 ${cut.effectiveFontPx}px ${cut.readabilityStatus === "danger" ? "위험" : "적합"}`;

    lines.push(`    <rect data-preview-cut="${escapeXml(cut.id)}" x="${sx + 4}" y="${cutY}" width="${screenW - 8}" height="${cutH}" rx="3" fill="${cutBg}" stroke="${borderTone}" stroke-width="${borderW}" />`);
    lines.push(`    <text x="${sx + 10}" y="${round1(cutY + 13)}" fill="${cutTextTone}" font-size="8.5" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(isEn ? `C${cut.index + 1} · ${cut.labelEn}` : `${cut.index + 1}컷 · ${cut.labelKo}`)}</text>`);
    lines.push(`    <rect x="${sx + 10}" y="${bubbleY}" width="${Math.max(88, screenW - 24)}" height="17" rx="8" fill="${viewerBg}" fill-opacity="0.88" stroke="${bubbleTone}" stroke-width="1" />`);
    lines.push(`    <text x="${sx + 16}" y="${round1(bubbleY + 11.5)}" fill="${bubbleTone}" font-size="8" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(bubbleLabel)}</text>`);
  }

  if (showSafeZones) {
    const thumbZoneY = round1(vpTopY + vpH - thumbBandH);
    lines.push(`    <rect data-role="thumb-safe-overlay" x="${sx}" y="${thumbZoneY}" width="${screenW}" height="${thumbBandH}" fill="${warnTone}" fill-opacity="0.16" />`);
    lines.push(`    <line x1="${sx}" y1="${thumbZoneY}" x2="${sx + screenW}" y2="${thumbZoneY}" stroke="${warnTone}" stroke-width="1" stroke-dasharray="4 3" />`);
    lines.push(`    <text x="${sx + 8}" y="${round1(thumbZoneY + 11)}" fill="${warnTone}" font-size="7.5" font-weight="600" font-family="system-ui, sans-serif">${escapeXml(isEn ? "Thumb / Comment Zone" : "엄지·댓글바 간섭 주의 구역")}</text>`);
  }
  lines.push("  </g>");

  const bottomChromeY = sy + screenH - homeIndH - bottomChromeH;
  if (audit.chromeVisible && bottomChromeH > 0) {
    const bottomHint = isEn ? audit.platform.bottomBarHintEn : audit.platform.bottomBarHintKo;
    lines.push(`  <rect data-role="platform-bottom-chrome" x="${sx}" y="${bottomChromeY}" width="${screenW}" height="${bottomChromeH}" fill="${chromeBg}" stroke="${shellStroke}" stroke-width="0.6" />`);
    lines.push(`  <text x="${sx + 10}" y="${bottomChromeY + Math.round(bottomChromeH * 0.62)}" fill="${mutedTone}" font-size="8" font-family="system-ui, sans-serif">${escapeXml(bottomHint)}</text>`);
  }
  if (homeIndH > 0) {
    const indW = Math.round(screenW * 0.34);
    lines.push(`  <rect x="${Math.round(sx + (screenW - indW) * 0.5)}" y="${sy + screenH - Math.max(5, Math.round(homeIndH * 0.5))}" width="${indW}" height="3.5" rx="2" fill="${mutedTone}" />`);
  }

  const calloutX = sx + screenW + bezel + 8;
  lines.push(`  <line x1="${calloutX - 4}" y1="${vpTopY}" x2="${calloutX - 4}" y2="${vpTopY + vpH}" stroke="${accentTone}" stroke-width="1.4" />`);
  lines.push(`  <text x="${calloutX + 2}" y="${Math.round(vpTopY + vpH * 0.5 - 6)}" fill="${accentTone}" font-size="9" font-weight="700" font-family="system-ui, sans-serif">${escapeXml(isEn ? `Visible ${audit.viewport.visibleViewportHeightPx}px` : `가시 ${audit.viewport.visibleViewportHeightPx}px`)}</text>`);
  lines.push(`  <text x="${calloutX + 2}" y="${Math.round(vpTopY + vpH * 0.5 + 8)}" fill="${mutedTone}" font-size="8" font-family="system-ui, sans-serif">${escapeXml(`${audit.viewport.usableViewportRatioPct}% · ${audit.summary.downscalePct}%`)}</text>`);
  lines.push("</svg>");
  return lines.join("\n");
}

/** 모바일 독자 뷰어 시뮬레이션 감사 리포트를 정형 JSON 문자열로 내보낸다. */
export function exportMobileReaderAuditJson(audit: MobileReaderAuditResult): string {
  return JSON.stringify(
    {
      schemaVersion: "toonstudio.mobile-reader-preview-sim.v1",
      dataSourceKind: audit.dataSourceKind,
      provenance: audit.provenance,
      device: {
        id: audit.device.id, cssWidthPx: audit.device.cssWidthPx, cssHeightPx: audit.device.cssHeightPx,
        topSafeAreaPx: audit.device.topSafeAreaPx, bottomHomeIndicatorPx: audit.device.bottomHomeIndicatorPx,
        notchKind: audit.device.notchKind,
      },
      platform: {
        id: audit.platform.id, recommendedManuscriptWidthPx: audit.platform.recommendedManuscriptWidthPx,
        topChromeHeightPx: audit.platform.topChromeHeightPx, bottomChromeHeightPx: audit.platform.bottomChromeHeightPx,
        commentBarHeightPx: audit.platform.commentBarHeightPx,
      },
      viewerTheme: audit.viewerTheme, chromeVisible: audit.chromeVisible, manuscriptWidthPx: audit.manuscriptWidthPx,
      viewport: audit.viewport, readTimeEstimate: audit.readTimeEstimate, summary: audit.summary,
      cuts: audit.cuts.map((cut) => ({
        id: cut.id, index: cut.index, labelKo: cut.labelKo, cutHeightPx: cut.cutHeightPx,
        gutterAfterPx: cut.gutterAfterPx, bubbleFontPx: cut.bubbleFontPx, effectiveFontPx: cut.effectiveFontPx,
        readabilityStatus: cut.readabilityStatus, backgroundTone: cut.backgroundTone,
        edgeTreatment: cut.edgeTreatment, captionPlacement: cut.captionPlacement,
        whiteEdgeBleedRisk: cut.whiteEdgeBleedRisk, thumbOverlapRisk: cut.thumbOverlapRisk,
        estimatedDwellSec: cut.estimatedDwellSec, dataSourceKind: cut.dataSourceKind,
      })),
      warnings: audit.warnings,
    },
    null,
    2,
  );
}
