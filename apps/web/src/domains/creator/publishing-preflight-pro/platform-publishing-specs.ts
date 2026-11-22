/**
 * 6대 연재 플랫폼 단일 정본 규격 · 타입 계약 · 기본 60컷 샘플 회차 팩토리.
 */

export type PublishingPlatformId =
  | "naver-webtoon"
  | "kakaopage"
  | "lezhin"
  | "ridi"
  | "piccoma"
  | "webtoon-global";

export type EpisodeImageFormat = "jpg" | "png" | "webp" | "psd";
export type EpisodeColorProfile = "sRGB" | "Display-P3" | "CMYK";

export interface PlatformPublishingSpec {
  readonly id: PublishingPlatformId;
  readonly labelKo: string;
  readonly region: "KR" | "JP" | "GLOBAL";
  readonly allowedWidthsPx: readonly number[];
  readonly recommendedWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly maxFileSizeMb: number;
  readonly maxEpisodeTotalMb: number;
  readonly allowedFormats: readonly ("jpg" | "png")[];
  readonly requiredColorProfile: "sRGB";
  readonly balloonSafeMarginX: number;
  readonly verticalTextSafeMarginY: number;
  readonly writingDirection: "horizontal" | "vertical-jp";
  readonly targetDpi: number;
  readonly notesKo: string;
}

export interface EpisodeCutBalloon {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isVerticalText?: boolean;
}

/** 스마트 컷-세이프 슬라이서가 인물 얼굴/눈높이를 자르지 않도록 보호하는 수직 밴드. */
export interface EpisodeCutEyeLevelBand {
  readonly id: string;
  readonly topY: number;
  readonly bottomY: number;
  readonly characterName?: string;
  readonly priority?: "lead" | "supporting";
}

export type RightsBomLicenseType =
  | "CC0"
  | "CC-BY"
  | "CC-BY-SA"
  | "CC-BY-NC"
  | "COMMERCIAL-PERPETUAL"
  | "COMMERCIAL-RENTAL"
  | "EDITORIAL-ONLY"
  | "UNKNOWN";

export type RightsBomAssetCategory = "3d-bg" | "brush" | "font" | "texture" | "sfx" | "prop";

export interface PreflightRightsBomAsset {
  readonly assetId: string;
  readonly name: string;
  readonly category: RightsBomAssetCategory;
  readonly licenseCode: RightsBomLicenseType;
  readonly commercialAllowed: boolean;
  readonly verified: boolean;
  readonly usedInCutIds: readonly string[];
  readonly tags?: readonly string[];
  readonly attributionText?: string;
  readonly sourceOrigin?: string;
}

export interface EpisodeCutInput {
  readonly cutId: string;
  readonly order: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly estimatedBytes: number;
  readonly format: EpisodeImageFormat;
  readonly colorProfile: EpisodeColorProfile;
  readonly dpi: number;
  readonly balloons: readonly EpisodeCutBalloon[];
  readonly emotionIntensity: number;
  readonly actionIntensity: number;
  readonly isKeyBeat?: boolean;
  readonly caption?: string;
  readonly blankGapBelowPx?: number;
  /** 인물 눈높이 보호 밴드(스마트 컷-세이프 슬라이서 입력). */
  readonly eyeLevelBands?: readonly EpisodeCutEyeLevelBand[];
  /** 수직 스캔라인별 시각 에너지 프로파일(0..1, 낮을수록 여백/거터). */
  readonly rowEnergyProfile?: readonly number[];
}

export interface EpisodePreflightInput {
  readonly episodeId: string;
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly platformId: PublishingPlatformId;
  readonly cuts: readonly EpisodeCutInput[];
  readonly customForbiddenWords?: readonly string[];
  readonly rightsBomAssets?: readonly PreflightRightsBomAsset[];
  readonly generatedAtIso?: string;
}

export interface PreflightSlicePlanItem {
  readonly sliceIndex: number;
  readonly fileName: string;
  readonly sourceCutIds: readonly string[];
  readonly widthPx: number;
  readonly sliceHeightPx: number;
  readonly startY: number;
  readonly endY: number;
  readonly estimatedBytes: number;
  readonly targetFormat: "jpg" | "png";
  readonly targetQuality: number;
  readonly needsResize: boolean;
  readonly seamAvoidedBalloon: boolean;
  readonly seamAvoidedEyeLevel?: boolean;
  readonly seamEnergy?: number;
}

export interface PreflightCompressionPlan {
  readonly originalTotalBytes: number;
  readonly projectedTotalBytes: number;
  readonly maxEpisodeBytes: number;
  readonly maxFileBytes: number;
  readonly recommendedFormat: "jpg" | "png";
  readonly targetJpegQuality: number;
  readonly targetDpi: number;
  readonly requiresSrgbConversion: boolean;
  readonly requiresTotalSizeReduction: boolean;
  readonly oversizedSliceCount: number;
}

export interface PreflightMarginViolation {
  readonly cutId: string;
  readonly cutOrder: number;
  readonly balloonId: string;
  readonly edge: "left" | "right" | "top-vertical-jp" | "bottom-vertical-jp";
  readonly actualMarginPx: number;
  readonly requiredMarginPx: number;
  readonly messageKo: string;
}

export interface PreflightTextFlag {
  readonly cutId: string;
  readonly cutOrder: number;
  readonly balloonId: string;
  readonly kind: "forbidden-word" | "typo" | "placeholder";
  readonly matchedTerm: string;
  readonly suggestionKo: string;
  readonly severity: "error" | "warn";
}

export interface PreflightIssueItem {
  readonly code:
    | "WIDTH_MISMATCH"
    | "HEIGHT_SLICE_REQUIRED"
    | "FILE_SIZE_EXCEEDED"
    | "TOTAL_SIZE_EXCEEDED"
    | "FORMAT_UNSUPPORTED"
    | "COLOR_PROFILE_NON_SRGB"
    | "DPI_TOO_HIGH"
    | "BALLOON_SAFE_MARGIN"
    | "FORBIDDEN_OR_TYPO"
    | "RIGHTS_BOM_BLOCKED";
  readonly severity: "error" | "warn" | "info";
  readonly cutId?: string;
  readonly messageKo: string;
}

export interface DeliveryManifestDocument {
  readonly schemaVersion: "toonstudio.delivery-manifest.v1";
  readonly generatedAtIso: string;
  readonly episodeId: string;
  readonly seriesTitle: string;
  readonly episodeNumber: number;
  readonly platformId: PublishingPlatformId;
  readonly platformLabelKo: string;
  readonly status: "READY" | "NEEDS_FIX" | "BLOCKED";
  readonly readinessScore: number;
  readonly totalInputCuts: number;
  readonly totalOutputSlices: number;
  readonly totalEstimatedBytes: number;
  readonly compression: PreflightCompressionPlan;
  readonly slices: readonly PreflightSlicePlanItem[];
  readonly marginViolationCount: number;
  readonly textFlagCount: number;
  readonly fingerprint: string;
}

export interface PlatformPreflightResult {
  readonly spec: PlatformPublishingSpec;
  readonly status: "READY" | "NEEDS_FIX" | "BLOCKED";
  readonly readinessScore: number;
  readonly slicePlan: readonly PreflightSlicePlanItem[];
  readonly compressionPlan: PreflightCompressionPlan;
  readonly marginViolations: readonly PreflightMarginViolation[];
  readonly textFlags: readonly PreflightTextFlag[];
  readonly issues: readonly PreflightIssueItem[];
  readonly manifest: DeliveryManifestDocument;
  readonly manifestJson: string;
}

export interface ReflowBookPanelSlot {
  readonly cutId: string;
  readonly cutOrder: number;
  readonly readingOrderRtl: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface ReflowBookPage {
  readonly pageNumber: number;
  readonly side: "right" | "left";
  readonly trimWidthMm: 128;
  readonly trimHeightMm: 182;
  readonly innerBindingMarginMm: 18;
  readonly outerMarginMm: 10;
  readonly topBottomMarginMm: 12;
  readonly bleedMm: 3;
  readonly panels: readonly ReflowBookPanelSlot[];
}

export interface ReflowBookB6Result {
  readonly formatLabelKo: string;
  readonly trimSpec: "B6 128×182mm (300DPI, 제본 여백 18mm)";
  readonly readingDirection: "RTL";
  readonly totalPages: number;
  readonly minCutsPerPage: number;
  readonly maxCutsPerPage: number;
  readonly preservedCutCount: number;
  readonly sourceCutCount: number;
  readonly pages: readonly ReflowBookPage[];
}

export type TrailerCameraMotion = "zoom-in" | "pan-up" | "pan-across" | "dramatic-push";

export interface ReflowShortsKeyframeClip {
  readonly clipIndex: number;
  readonly sourceCutId: string;
  readonly sourceCutOrder: number;
  readonly highlightScore: number;
  readonly startTimeSec: number;
  readonly endTimeSec: number;
  readonly durationSec: number;
  readonly cameraMotion: TrailerCameraMotion;
  readonly startScale: number;
  readonly endScale: number;
  readonly startXPercent: number;
  readonly endXPercent: number;
  readonly startYPercent: number;
  readonly endYPercent: number;
  readonly subtitleText: string;
}

export interface ReflowShortsTrailerResult {
  readonly formatLabelKo: string;
  readonly aspectRatio: "9:16";
  readonly resolutionPx: { readonly width: 1080; readonly height: 1920 };
  readonly fps: 30;
  readonly totalDurationSec: number;
  readonly clipCount: number;
  readonly clips: readonly ReflowShortsKeyframeClip[];
}

export interface ReflowSnsCardSlide {
  readonly cardIndex: number;
  readonly roleKo: string;
  readonly sourceCutId: string;
  readonly sourceCutOrder: number;
  readonly headline: string;
  readonly cropFocusYPercent: number;
  readonly safeTextAreaPx: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface ReflowSnsCardNewsResult {
  readonly formatLabelKo: string;
  readonly aspectRatio: "1:1";
  readonly resolutionPx: { readonly width: 1080; readonly height: 1080 };
  readonly cardCount: number;
  readonly cards: readonly ReflowSnsCardSlide[];
}

export interface MultiFormatReflowResult {
  readonly sourceEpisodeId: string;
  readonly sourceCutCount: number;
  readonly bookB6: ReflowBookB6Result;
  readonly shortsTrailer: ReflowShortsTrailerResult;
  readonly snsCardNews: ReflowSnsCardNewsResult;
}

export const PLATFORM_PUBLISHING_SPECS: readonly PlatformPublishingSpec[] = [
  {
    id: "naver-webtoon",
    labelKo: "네이버 웹툰",
    region: "KR",
    allowedWidthsPx: [690, 800],
    recommendedWidthPx: 800,
    maxSliceHeightPx: 2000,
    maxFileSizeMb: 2,
    maxEpisodeTotalMb: 20,
    allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB",
    balloonSafeMarginX: 32,
    verticalTextSafeMarginY: 24,
    writingDirection: "horizontal",
    targetDpi: 72,
    notesKo: "폭 690/800px · 조각 높이 2000px 이하 · 파일당 2MB / 총 20MB 이하 · JPG/PNG",
  },
  {
    id: "kakaopage",
    labelKo: "카카오페이지",
    region: "KR",
    allowedWidthsPx: [720],
    recommendedWidthPx: 720,
    maxSliceHeightPx: 2000,
    maxFileSizeMb: 3,
    maxEpisodeTotalMb: 30,
    allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB",
    balloonSafeMarginX: 32,
    verticalTextSafeMarginY: 24,
    writingDirection: "horizontal",
    targetDpi: 72,
    notesKo: "폭 720px 고정 · 조각 높이 2000px 이하 · 파일당 3MB / 총 30MB 이하",
  },
  {
    id: "lezhin",
    labelKo: "레진코믹스",
    region: "KR",
    allowedWidthsPx: [720],
    recommendedWidthPx: 720,
    maxSliceHeightPx: 2000,
    maxFileSizeMb: 3,
    maxEpisodeTotalMb: 30,
    allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB",
    balloonSafeMarginX: 32,
    verticalTextSafeMarginY: 24,
    writingDirection: "horizontal",
    targetDpi: 72,
    notesKo: "폭 720px · RGB sRGB 색공간 필수 · 파일당 3MB 이하",
  },
  {
    id: "ridi",
    labelKo: "리디",
    region: "KR",
    allowedWidthsPx: [720, 800],
    recommendedWidthPx: 800,
    maxSliceHeightPx: 2000,
    maxFileSizeMb: 3,
    maxEpisodeTotalMb: 25,
    allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB",
    balloonSafeMarginX: 32,
    verticalTextSafeMarginY: 24,
    writingDirection: "horizontal",
    targetDpi: 72,
    notesKo: "폭 720/800px · 조각 높이 2000px 이하 · 파일당 3MB / 총 25MB 이하",
  },
  {
    id: "piccoma",
    labelKo: "픽코마 (일본)",
    region: "JP",
    allowedWidthsPx: [690, 800],
    recommendedWidthPx: 690,
    maxSliceHeightPx: 2000,
    maxFileSizeMb: 2,
    maxEpisodeTotalMb: 20,
    allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB",
    balloonSafeMarginX: 32,
    verticalTextSafeMarginY: 48,
    writingDirection: "vertical-jp",
    targetDpi: 72,
    notesKo: "폭 690/800px · 일본 세로쓰기 상하 48px·좌우 32px 안전 여백 검증",
  },
  {
    id: "webtoon-global",
    labelKo: "웹툰 글로벌",
    region: "GLOBAL",
    allowedWidthsPx: [800],
    recommendedWidthPx: 800,
    maxSliceHeightPx: 1280,
    maxFileSizeMb: 2,
    maxEpisodeTotalMb: 20,
    allowedFormats: ["jpg", "png"],
    requiredColorProfile: "sRGB",
    balloonSafeMarginX: 32,
    verticalTextSafeMarginY: 24,
    writingDirection: "horizontal",
    targetDpi: 72,
    notesKo: "폭 800px · 높이 1280px 슬라이스 · 파일당 2MB / 총 20MB 이하",
  },
] as const;

export const BUILTIN_FORBIDDEN_WORDS: readonly string[] = [
  "임시대사",
  "수정필요",
  "TODO",
  "TBD",
  "비속어샘플",
  "무단복제",
];

export const BUILTIN_TYPO_DICTIONARY: ReadonlyArray<{ readonly wrong: string; readonly right: string }> = [
  { wrong: "되요", right: "돼요" },
  { wrong: "어떻해", right: "어떡해" },
  { wrong: "몇일", right: "며칠" },
  { wrong: "금새", right: "금세" },
  { wrong: "웬지", right: "왠지" },
  { wrong: "안되 ", right: "안 돼 " },
  { wrong: "바램", right: "바람" },
];

export function getPlatformPublishingSpec(platformId: PublishingPlatformId): PlatformPublishingSpec {
  const found = PLATFORM_PUBLISHING_SPECS.find((item) => item.id === platformId);
  return found ?? PLATFORM_PUBLISHING_SPECS[0]!;
}

export function createDefaultPreflightEpisode(cutCount = 60): readonly EpisodeCutInput[] {
  const safeCount = Math.max(1, Math.min(120, Math.trunc(cutCount)));
  const keyOrders = new Set([3, 11, 19, 28, 37, 45, 53, 59]);
  const cuts: EpisodeCutInput[] = [];

  for (let i = 1; i <= safeCount; i += 1) {
    const isTallActionCut = i === 12 || i === 37 || i === 53;
    const isKey = keyOrders.has(i);
    const widthPx = i === 5 ? 860 : 800;
    const heightPx = isTallActionCut ? 2480 : i % 6 === 0 ? 1420 : 1080;
    const estimatedBytes = i === 37 ? 2_480_000 : isTallActionCut ? 620_000 : 280_000;

    const balloons: EpisodeCutBalloon[] = [];
    if (i === 4) {
      balloons.push({
        id: `b-${i}-1`,
        text: "그 편지는 몇일 전에 이미 사라졌어요.",
        x: 14,
        y: 120,
        width: 260,
        height: 110,
      });
    } else if (i === 14) {
      balloons.push({
        id: `b-${i}-1`,
        text: "밤의 우편국은 자정이 지나면 주소 없는 편지만 따로 분류해서 지하 수장고로 내려보내는데, 거기 적힌 수신인 이름은 살아 있는 사람이 아니라 기억에서 지워진 약속들뿐이라 아무도 함부로 봉인을 뜯지 못해요.",
        x: 430,
        y: 740,
        width: 320,
        height: 220,
      });
    } else if (i === 29) {
      balloons.push({
        id: `b-${i}-1`,
        text: "임시대사 — 여기서 주인공 독백 보강",
        x: 90,
        y: 180,
        width: 300,
        height: 110,
      });
    } else if (i % 3 !== 0) {
      balloons.push({
        id: `b-${i}-1`,
        text: isKey ? "봉인이 풀리는 순간, 멈췄던 시계가 다시 움직였다." : `${i}컷 대사 — 골목 끝 가로등 아래 발소리가 멈췄다.`,
        x: i % 2 === 0 ? 72 : 340,
        y: i === 22 ? 760 : 140,
        width: 320,
        height: 112,
      });
    }

    cuts.push({
      cutId: `cut-${String(i).padStart(3, "0")}`,
      order: i,
      widthPx,
      heightPx,
      estimatedBytes,
      format: i === 18 ? "webp" : "jpg",
      colorProfile: i === 9 ? "Display-P3" : "sRGB",
      dpi: i === 37 ? 300 : 72,
      balloons,
      emotionIntensity: isKey ? 92 : 42 + ((i * 11) % 40),
      actionIntensity: isTallActionCut ? 95 : 34 + ((i * 13) % 45),
      isKeyBeat: isKey,
      caption: isKey ? `핵심 감정·전환 장면 #${i}` : `에피소드 전개 컷 #${i}`,
      blankGapBelowPx: i === 25 || i === 26 ? 720 : i % 7 === 0 ? 220 : 120,
      ...(isTallActionCut || isKey
        ? {
            eyeLevelBands: [
              {
                id: `eye-${i}-lead`,
                topY: isTallActionCut ? 1180 : 340,
                bottomY: isTallActionCut ? 1340 : 480,
                characterName: isKey ? "주인공" : "상대역",
                priority: "lead" as const,
              },
            ],
          }
        : {}),
    });
  }

  return cuts;
}
