/**
 * 14종 실전 원클릭 매직 리사이즈 포맷 카탈로그 및 타입 정의
 */

export type MagicResizeFormatId =
  | "webtoon-vertical"
  | "naver-webtoon-thumb"
  | "kakaopage-cover"
  | "instagram-card"
  | "reels-shorts"
  | "youtube-thumbnail"
  | "ppt-16x9"
  | "a4-print-poster"
  | "x-header"
  | "sns-share-banner"
  | "business-card"
  | "goods-sticker-keyring"
  | "kakao-channel-banner"
  | "b5-flyer";

export type MagicResizeCategory =
  | "webtoon"
  | "social"
  | "video"
  | "presentation"
  | "print"
  | "goods";

export type DesignElementRole =
  | "headline"
  | "subcopy"
  | "hero-image"
  | "badge"
  | "cta"
  | "logo";

export type ArtboardElementKind =
  | "text"
  | "image"
  | "shape"
  | "badge"
  | "button"
  | "connector";

export type AnchorHorizontal = "start" | "center" | "end";
export type AnchorVertical = "top" | "middle" | "bottom";
export type ArtboardOrientation = "portrait" | "square" | "landscape" | "ultra-wide";
export type ElementTokenRole =
  | "surface"
  | "ink"
  | "muted"
  | "accent"
  | "accent-2"
  | "badge"
  | "cta";

export interface MagicResizeFormatSpec {
  readonly id: MagicResizeFormatId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly category: MagicResizeCategory;
  readonly width: number;
  readonly height: number;
  readonly aspectLabel: string;
  readonly isPrint: boolean;
  readonly dpi: number;
  readonly defaultBleedMm: number;
}

export interface RectBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PrintBleedMetrics {
  readonly enabled: boolean;
  readonly bleedMm: number;
  readonly dpi: number;
  readonly bleedPx: number;
  readonly trimRect: RectBox;
  readonly safeRect: RectBox;
  readonly cropMarkLengthPx: number;
}

export interface DesignArtboardElement {
  readonly id: string;
  readonly role: DesignElementRole;
  readonly kind: ArtboardElementKind;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly textKo?: string;
  readonly textEn?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly preserveAspectRatio?: boolean;
  readonly anchorX?: AnchorHorizontal;
  readonly anchorY?: AnchorVertical;
  readonly tokenRole?: ElementTokenRole;
  readonly borderRadius?: number;
  readonly rotationDeg?: number;
}

export interface DesignArtboardDocument {
  readonly id: string;
  readonly templateId: string;
  readonly formatId: MagicResizeFormatId;
  readonly width: number;
  readonly height: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly brandKitId: string;
  readonly fontPairingId: string;
  readonly photoFrameId: string;
  readonly typoEffectId: string;
  readonly sketchMode: boolean;
  readonly showBleedGuides: boolean;
  readonly elements: readonly DesignArtboardElement[];
}

export interface MagicResizeReport {
  readonly sourceFormatId: MagicResizeFormatId;
  readonly targetFormatId: MagicResizeFormatId;
  readonly orientation: ArtboardOrientation;
  readonly safeMarginPx: { readonly x: number; readonly y: number };
  readonly bleed: PrintBleedMetrics;
  readonly scaleFactor: number;
  readonly clippedCount: number;
  readonly overlapResolvedCount: number;
  readonly minFontAppliedIds: readonly string[];
}

export interface MagicResizeResult {
  readonly artboard: DesignArtboardDocument;
  readonly report: MagicResizeReport;
}

export interface ArtboardBoundsAudit {
  readonly valid: boolean;
  readonly clippedIds: readonly string[];
  readonly nanIds: readonly string[];
}

export const MAGIC_RESIZE_FORMATS: readonly MagicResizeFormatSpec[] = [
  { id: "webtoon-vertical", nameKo: "웹툰 세로컷", nameEn: "Webtoon Vertical Cut", category: "webtoon", width: 800, height: 1280, aspectLabel: "5:8", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "naver-webtoon-thumb", nameKo: "네이버 웹툰 썸네일", nameEn: "Naver Webtoon Thumbnail", category: "webtoon", width: 434, height: 330, aspectLabel: "434:330", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "kakaopage-cover", nameKo: "카카오페이지 표지", nameEn: "KakaoPage Cover", category: "webtoon", width: 720, height: 1080, aspectLabel: "2:3", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "instagram-card", nameKo: "인스타 카드뉴스", nameEn: "Instagram Card News", category: "social", width: 1080, height: 1080, aspectLabel: "1:1", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "reels-shorts", nameKo: "릴스/쇼츠", nameEn: "Reels / Shorts", category: "social", width: 1080, height: 1920, aspectLabel: "9:16", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "youtube-thumbnail", nameKo: "유튜브 썸네일", nameEn: "YouTube Thumbnail", category: "video", width: 1280, height: 720, aspectLabel: "16:9", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "ppt-16x9", nameKo: "PPT 16:9", nameEn: "Presentation 16:9", category: "presentation", width: 1920, height: 1080, aspectLabel: "16:9", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "a4-print-poster", nameKo: "A4 인쇄 포스터", nameEn: "A4 Print Poster", category: "print", width: 2480, height: 3508, aspectLabel: "1:1.41", isPrint: true, dpi: 300, defaultBleedMm: 3 },
  { id: "x-header", nameKo: "X 헤더", nameEn: "X Header", category: "social", width: 1500, height: 500, aspectLabel: "3:1", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "sns-share-banner", nameKo: "SNS 공유 배너", nameEn: "Social Share Banner", category: "social", width: 1200, height: 628, aspectLabel: "1.91:1", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "business-card", nameKo: "명함", nameEn: "Business Card", category: "print", width: 1050, height: 600, aspectLabel: "7:4", isPrint: true, dpi: 300, defaultBleedMm: 3 },
  { id: "goods-sticker-keyring", nameKo: "굿즈 스티커/키링", nameEn: "Goods Sticker / Keyring", category: "goods", width: 1000, height: 1000, aspectLabel: "1:1", isPrint: true, dpi: 300, defaultBleedMm: 3 },
  { id: "kakao-channel-banner", nameKo: "카카오 채널 배너", nameEn: "Kakao Channel Banner", category: "social", width: 800, height: 400, aspectLabel: "2:1", isPrint: false, dpi: 96, defaultBleedMm: 0 },
  { id: "b5-flyer", nameKo: "B5 전단", nameEn: "B5 Print Flyer", category: "print", width: 2150, height: 3035, aspectLabel: "1:1.41", isPrint: true, dpi: 300, defaultBleedMm: 3 },
] as const;

const FORMAT_MAP: ReadonlyMap<MagicResizeFormatId, MagicResizeFormatSpec> = new Map(
  MAGIC_RESIZE_FORMATS.map((spec) => [spec.id, spec]),
);

export function getMagicResizeFormat(formatId: MagicResizeFormatId): MagicResizeFormatSpec {
  return FORMAT_MAP.get(formatId) ?? MAGIC_RESIZE_FORMATS[0];
}

export function classifyArtboardOrientation(width: number, height: number): ArtboardOrientation {
  const safeW = typeof width === "number" && Number.isFinite(width) && width > 0 ? width : 1;
  const safeH = typeof height === "number" && Number.isFinite(height) && height > 0 ? height : 1;
  const aspect = safeW / safeH;
  if (aspect >= 1.9) return "ultra-wide";
  if (aspect >= 1.15) return "landscape";
  if (aspect >= 0.85) return "square";
  return "portrait";
}
