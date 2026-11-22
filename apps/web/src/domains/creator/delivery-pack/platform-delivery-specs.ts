/**
 * 웹툰 플랫폼별 공식 납품 규격 레지스트리 및 표준 파일명 생성기.
 *
 * 네이버 웹툰, 카카오페이지, 레진코믹스, 글로벌 웹툰의 세로 스크롤 화수 납품 프리셋을
 * 결정적 상수로 제공한다. 규격 수치는 스냅샷 기준 안내값이며 최종 업로드 직전
 * 각 플랫폼 파트너 포털의 최신 고지를 함께 확인한다.
 */

export const DELIVERY_PLATFORM_IDS = Object.freeze([
  "naver_webtoon",
  "kakao_page",
  "lezhin",
  "global_webtoon",
] as const);

export type DeliveryPlatformId = (typeof DELIVERY_PLATFORM_IDS)[number];

export const DELIVERY_IMAGE_FORMATS = Object.freeze(["jpg", "png"] as const);
export type DeliveryImageFormat = (typeof DELIVERY_IMAGE_FORMATS)[number];

export interface DeliveryPlatformSpec {
  readonly id: DeliveryPlatformId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly targetWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly maxSliceBytes: number;
  readonly maxEpisodeBytes: number;
  readonly maxSliceCount: number;
  readonly defaultFormat: DeliveryImageFormat;
  readonly allowedFormats: readonly DeliveryImageFormat[];
  readonly colorSpace: "srgb";
  readonly recommendedJpegQuality: number;
  readonly minSafeMarginPx: number;
  readonly fileNamePattern: string;
  readonly specNoteKo: string;
  readonly specNoteEn: string;
}

const MB = 1024 * 1024;

export const DELIVERY_PLATFORM_SPECS: Readonly<Record<DeliveryPlatformId, DeliveryPlatformSpec>> =
  Object.freeze({
    naver_webtoon: Object.freeze({
      id: "naver_webtoon",
      labelKo: "네이버 웹툰",
      labelEn: "Naver Webtoon",
      targetWidthPx: 690,
      maxSliceHeightPx: 1600,
      maxSliceBytes: 2 * MB,
      maxEpisodeBytes: 20 * MB,
      maxSliceCount: 100,
      defaultFormat: "jpg",
      allowedFormats: Object.freeze(["jpg", "png"] as const),
      colorSpace: "srgb",
      recommendedJpegQuality: 0.92,
      minSafeMarginPx: 16,
      fileNamePattern: "EP01_001.jpg",
      specNoteKo: "가로 690px · 조각당 최대 높이 1600px · 조각당 2MB / 화수 총 20MB 이내",
      specNoteEn: "Width 690px · max slice height 1600px · 2MB per slice / 20MB per episode",
    }),
    kakao_page: Object.freeze({
      id: "kakao_page",
      labelKo: "카카오페이지",
      labelEn: "KakaoPage",
      targetWidthPx: 720,
      maxSliceHeightPx: 1280,
      maxSliceBytes: 2 * MB,
      maxEpisodeBytes: 20 * MB,
      maxSliceCount: 100,
      defaultFormat: "jpg",
      allowedFormats: Object.freeze(["jpg", "png"] as const),
      colorSpace: "srgb",
      recommendedJpegQuality: 0.92,
      minSafeMarginPx: 16,
      fileNamePattern: "EP01_001.jpg",
      specNoteKo: "가로 720px · 조각당 최대 높이 1280px · 조각당 2MB / 화수 총 20MB 이내",
      specNoteEn: "Width 720px · max slice height 1280px · 2MB per slice / 20MB per episode",
    }),
    lezhin: Object.freeze({
      id: "lezhin",
      labelKo: "레진코믹스",
      labelEn: "Lezhin Comics",
      targetWidthPx: 800,
      maxSliceHeightPx: 1600,
      maxSliceBytes: 3 * MB,
      maxEpisodeBytes: 50 * MB,
      maxSliceCount: 120,
      defaultFormat: "jpg",
      allowedFormats: Object.freeze(["jpg", "png"] as const),
      colorSpace: "srgb",
      recommendedJpegQuality: 0.94,
      minSafeMarginPx: 16,
      fileNamePattern: "EP01_001.jpg",
      specNoteKo: "가로 800px · 조각당 최대 높이 1600px · 조각당 3MB / 화수 총 50MB 이내",
      specNoteEn: "Width 800px · max slice height 1600px · 3MB per slice / 50MB per episode",
    }),
    global_webtoon: Object.freeze({
      id: "global_webtoon",
      labelKo: "글로벌 웹툰",
      labelEn: "Global WEBTOON",
      targetWidthPx: 800,
      maxSliceHeightPx: 1280,
      maxSliceBytes: 2 * MB,
      maxEpisodeBytes: 20 * MB,
      maxSliceCount: 100,
      defaultFormat: "jpg",
      allowedFormats: Object.freeze(["jpg", "png"] as const),
      colorSpace: "srgb",
      recommendedJpegQuality: 0.92,
      minSafeMarginPx: 16,
      fileNamePattern: "EP01_001.jpg",
      specNoteKo: "가로 800px · 조각당 최대 높이 1280px · 조각당 2MB / 화수 총 20MB 이내",
      specNoteEn: "Width 800px · max slice height 1280px · 2MB per slice / 20MB per episode",
    }),
  });

export function isDeliveryPlatformId(value: string): value is DeliveryPlatformId {
  return (DELIVERY_PLATFORM_IDS as readonly string[]).includes(value);
}

export function getDeliveryPlatformSpec(platformId: DeliveryPlatformId): DeliveryPlatformSpec {
  return DELIVERY_PLATFORM_SPECS[platformId];
}

export function resolveDeliveryFormat(
  platformId: DeliveryPlatformId,
  requested?: DeliveryImageFormat,
): DeliveryImageFormat {
  const spec = DELIVERY_PLATFORM_SPECS[platformId];
  if (requested && spec.allowedFormats.includes(requested)) {
    return requested;
  }
  return spec.defaultFormat;
}

export function formatEpisodeCode(episodeNumber: number): string {
  if (!Number.isSafeInteger(episodeNumber) || episodeNumber < 1) {
    throw new Error("화수 번호는 1 이상의 정수여야 합니다.");
  }
  return `EP${String(episodeNumber).padStart(2, "0")}`;
}

/**
 * 웹툰 플랫폼 납품 표준 파일명(`EP01_001.jpg`)을 생성한다.
 */
export function formatEpisodeSliceFileName(
  episodeNumber: number,
  sliceIndex1Based: number,
  format: DeliveryImageFormat = "jpg",
): string {
  if (!Number.isSafeInteger(sliceIndex1Based) || sliceIndex1Based < 1) {
    throw new Error("슬라이스 순번은 1 이상의 정수여야 합니다.");
  }
  const epCode = formatEpisodeCode(episodeNumber);
  const sliceCode = String(sliceIndex1Based).padStart(3, "0");
  return `${epCode}_${sliceCode}.${format}`;
}

export function deliveryFormatMimeType(format: DeliveryImageFormat): "image/jpeg" | "image/png" {
  return format === "png" ? "image/png" : "image/jpeg";
}
