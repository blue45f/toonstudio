/**
 * 캔바(Canva) Magic Switch · 미리캔버스(MiriCanvas) 한국형 플랫폼 규격 ·
 * 망고보드(MangoBoard) 롱스크롤 분할 · Pixlr 여백 확장(Generative Expand)을
 * 툰스튜디오 웹툰·단행본·연재 IP 워크플로에 맞게 클린룸 내재화한 멀티포맷 리사이즈 엔진.
 *
 * REA 근거:
 * - Canva: ev_5c3656172c3d97c2332c7f6e3013289322c68b12ddb6a0064d3b6e0a950c70a1, ev_8827044671b973009b3a9b342d24df4565a7fe29599cb02efd1f220cadabcec9
 * - MiriCanvas: ev_8dd6d04fb1aecd0d43634e4cfdf07d6e251869ba0914926269e8b8084473b306, ev_c88e78f534e5ee3ed6298e1f12872661db73339920957c53c95cf9f20cde8436
 * - MangoBoard: ev_1f8f648e0b723948fdc9f9a96361fa1f02d55862666adc7c464ba8922842876e, ev_eaf7292da15560b1663cbce4b2714ef2df9ceed2c1eefe9deadcd631bb6bfdfc
 * - VistaCreate / Pixlr: ev_96ea2b385b9bd2aa20481c40711fe892653a76593ca7b47061d85afe9002b7d7, ev_5899e9de513b1bcf83729f6d060fe32f378636c264e773945855ae995f02cb5b
 */

export type DesignPlatformFormatId =
  | "naver-episode-cut"
  | "naver-square-thumb"
  | "naver-horizontal-thumb"
  | "kakaopage-cover-3x4"
  | "kakaopage-keyvisual-9x16"
  | "ridi-highres-cover"
  | "insta-cuttoon-4x5"
  | "insta-square-1x1"
  | "shorts-reels-9x16"
  | "youtube-pv-16x9"
  | "print-a5-spread"
  | "crowdfunding-long-page";

export type DesignPlatformChannelGroup =
  | "webtoon-platform"
  | "social-promo"
  | "shortform-video"
  | "print-publishing"
  | "crowdfunding";

export type DesignColorSpace = "sRGB" | "CMYK";

export interface DesignPlatformFormatPreset {
  readonly id: DesignPlatformFormatId;
  readonly label: string;
  readonly platformName: string;
  readonly channelGroup: DesignPlatformChannelGroup;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly aspectRatioLabel: string;
  readonly dpi: number;
  readonly colorSpace: DesignColorSpace;
  readonly bleedMm: number;
  readonly safePaddingPx: number;
  readonly minReadableFontPx: number;
  readonly maxFileSizeKb: number;
  readonly recommendedExportFormat: "PNG" | "WEBP" | "JPG" | "PDF/X-4";
  readonly description: string;
}

export type MagicSwitchLayerRole =
  | "background"
  | "character"
  | "title-logo"
  | "speech-balloon"
  | "sfx"
  | "badge";

export interface MagicSwitchSourceLayer {
  readonly id: string;
  readonly name: string;
  readonly role: MagicSwitchLayerRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSizePx?: number;
  readonly text?: string;
  readonly locked?: boolean;
  /** 레이어 내부 포컬 포인트 (0..1 정규화 좌표, 기본값 0.5, 0.35) */
  readonly focalPoint?: {
    readonly x: number;
    readonly y: number;
  };
}

export interface MagicSwitchSourceDocument {
  readonly id: string;
  readonly title: string;
  readonly widthPx: number;
  readonly heightPx: number;
  /** 캔버스 전체의 주요 시선 중심점 (0..1 정규화 좌표) */
  readonly primaryFocalPoint: {
    readonly x: number;
    readonly y: number;
  };
  readonly layers: readonly MagicSwitchSourceLayer[];
}

export interface OutpaintExpansionPadding {
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
  readonly leftPx: number;
  readonly required: boolean;
  readonly promptHint: string;
}

export interface MagicSwitchTransformedLayer {
  readonly id: string;
  readonly name: string;
  readonly role: MagicSwitchLayerRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly fontSizePx?: number;
  readonly clampedToSafeZone: boolean;
  readonly readabilityBoosted: boolean;
}

export interface MagicSwitchResizeResult {
  readonly formatPreset: DesignPlatformFormatPreset;
  readonly sourceSize: { readonly widthPx: number; readonly heightPx: number };
  readonly targetSize: { readonly widthPx: number; readonly heightPx: number };
  readonly safeZoneRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly transformedLayers: readonly MagicSwitchTransformedLayer[];
  readonly outpaintExpansion: OutpaintExpansionPadding;
  readonly focalPointRetentionScore: number;
  readonly readabilityScore: number;
  readonly safeZoneComplianceScore: number;
  readonly overallQualityScore: number;
  readonly warnings: readonly string[];
}

export type TankobonTrimSize = "A5" | "B5";
export type TankobonPaperStock =
  | "rough-comics-70g"
  | "vellum-80g"
  | "white-offset-100g"
  | "snow-art-120g";
export type TankobonBindingType = "perfect-softcover" | "hardcover";

export interface TankobonSpreadInput {
  readonly trimSize: TankobonTrimSize;
  readonly pageCount: number;
  readonly paperStock: TankobonPaperStock;
  readonly bindingType: TankobonBindingType;
  readonly flapWidthMm: number;
  readonly bleedMm?: number;
  readonly dpi?: number;
}

export interface TankobonSpreadSpec {
  readonly trimSize: TankobonTrimSize;
  readonly singlePageWidthMm: number;
  readonly singlePageHeightMm: number;
  readonly spineWidthMm: number;
  readonly flapWidthMm: number;
  readonly bleedMm: number;
  readonly totalSpreadWidthMm: number;
  readonly totalSpreadHeightMm: number;
  readonly totalSpreadWidthPx: number;
  readonly totalSpreadHeightPx: number;
  readonly dpi: number;
  readonly guidesPx: {
    readonly bleedLeftPx: number;
    readonly leftFlapEndPx: number;
    readonly backCoverEndPx: number;
    readonly spineStartPx: number;
    readonly spineEndPx: number;
    readonly frontCoverEndPx: number;
    readonly rightFlapEndPx: number;
  };
}

export interface VerticalScrollSlice {
  readonly sliceIndex: number;
  readonly startYPx: number;
  readonly endYPx: number;
  readonly heightPx: number;
  readonly widthPx: number;
  readonly snappedToGutter: boolean;
  readonly overlappingLayerIds: readonly string[];
  readonly fileNameSuggestion: string;
}

export const DESIGN_PLATFORM_FORMAT_PRESETS: readonly DesignPlatformFormatPreset[] = [
  {
    id: "naver-episode-cut",
    label: "네이버웹툰 본편 스크롤 컷",
    platformName: "Naver Webtoon",
    channelGroup: "webtoon-platform",
    widthPx: 690,
    heightPx: 1080,
    aspectRatioLabel: "23:36",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 32,
    minReadableFontPx: 15,
    maxFileSizeKb: 2048,
    recommendedExportFormat: "JPG",
    description: "네이버웹툰 정식연재·베스트도전 가로 690px 고정 본편 컷 표준 규격",
  },
  {
    id: "naver-square-thumb",
    label: "네이버웹툰 정사각 썸네일",
    platformName: "Naver Webtoon",
    channelGroup: "webtoon-platform",
    widthPx: 480,
    heightPx: 480,
    aspectRatioLabel: "1:1",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 28,
    minReadableFontPx: 16,
    maxFileSizeKb: 1024,
    recommendedExportFormat: "PNG",
    description: "요일별 목록·회차 리스트 정사각 대표 썸네일 규격",
  },
  {
    id: "naver-horizontal-thumb",
    label: "네이버웹툰 가로형 배너 썸네일",
    platformName: "Naver Webtoon",
    channelGroup: "webtoon-platform",
    widthPx: 690,
    heightPx: 400,
    aspectRatioLabel: "69:40",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 26,
    minReadableFontPx: 16,
    maxFileSizeKb: 1024,
    recommendedExportFormat: "PNG",
    description: "작품 상단 헤더 및 추천 와이드 배너용 가로형 썸네일 규격",
  },
  {
    id: "kakaopage-cover-3x4",
    label: "카카오페이지 작품 표지 (3:4)",
    platformName: "KakaoPage",
    channelGroup: "webtoon-platform",
    widthPx: 900,
    heightPx: 1200,
    aspectRatioLabel: "3:4",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 48,
    minReadableFontPx: 18,
    maxFileSizeKb: 2048,
    recommendedExportFormat: "PNG",
    description: "카카오페이지·카카오웹툰 작품 홈 메인 포스터 및 타이틀 로고 합성 규격",
  },
  {
    id: "kakaopage-keyvisual-9x16",
    label: "카카오페이지 키비주얼 (9:16)",
    platformName: "KakaoPage",
    channelGroup: "webtoon-platform",
    widthPx: 1080,
    heightPx: 1920,
    aspectRatioLabel: "9:16",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 64,
    minReadableFontPx: 18,
    maxFileSizeKb: 3072,
    recommendedExportFormat: "WEBP",
    description: "모바일 풀스크린 작품 진입 키비주얼 및 무빙 포스터 스틸 규격",
  },
  {
    id: "ridi-highres-cover",
    label: "리디북스 단행본·웹툰 고해상도 표지",
    platformName: "Ridibooks",
    channelGroup: "webtoon-platform",
    widthPx: 1400,
    heightPx: 2000,
    aspectRatioLabel: "7:10",
    dpi: 300,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 72,
    minReadableFontPx: 22,
    maxFileSizeKb: 5120,
    recommendedExportFormat: "PNG",
    description: "리디북스·교보eBook 전자책/웹툰 스토어 고해상도 메인 표지 규격",
  },
  {
    id: "insta-cuttoon-4x5",
    label: "인스타그램 컷툰·카드뉴스 (4:5)",
    platformName: "Instagram",
    channelGroup: "social-promo",
    widthPx: 1080,
    heightPx: 1350,
    aspectRatioLabel: "4:5",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 54,
    minReadableFontPx: 18,
    maxFileSizeKb: 2048,
    recommendedExportFormat: "PNG",
    description: "인스타툰 연재 및 신작 하이라이트 카드뉴스 최대 노출 면적(4:5) 규격",
  },
  {
    id: "insta-square-1x1",
    label: "인스타그램 정사각 피드 (1:1)",
    platformName: "Instagram",
    channelGroup: "social-promo",
    widthPx: 1080,
    heightPx: 1080,
    aspectRatioLabel: "1:1",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 48,
    minReadableFontPx: 18,
    maxFileSizeKb: 2048,
    recommendedExportFormat: "PNG",
    description: "SNS 프로필 그리드 및 캐릭터 소개 카드용 1:1 정사각 규격",
  },
  {
    id: "shorts-reels-9x16",
    label: "유튜브 쇼츠 · 릴스 · 틱톡 티저 (9:16)",
    platformName: "Shorts / Reels / TikTok",
    channelGroup: "shortform-video",
    widthPx: 1080,
    heightPx: 1920,
    aspectRatioLabel: "9:16",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 84,
    minReadableFontPx: 20,
    maxFileSizeKb: 3072,
    recommendedExportFormat: "PNG",
    description: "하단 캡션·우측 좋아요 버튼 UI 가림 영역을 피한 세로형 숏폼 안전 규격",
  },
  {
    id: "youtube-pv-16x9",
    label: "유튜브 PV · OST 썸네일 (16:9)",
    platformName: "YouTube",
    channelGroup: "shortform-video",
    widthPx: 1280,
    heightPx: 720,
    aspectRatioLabel: "16:9",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 40,
    minReadableFontPx: 20,
    maxFileSizeKb: 2048,
    recommendedExportFormat: "JPG",
    description: "웹툰 애니메이션 PV·보이스드라마·OST 영상 대표 썸네일 규격",
  },
  {
    id: "print-a5-spread",
    label: "단행본 A5 인쇄 펼침면 (300DPI·CMYK)",
    platformName: "Print Publishing",
    channelGroup: "print-publishing",
    widthPx: 3685,
    heightPx: 2551,
    aspectRatioLabel: "A5 Spread + Bleed 3mm",
    dpi: 300,
    colorSpace: "CMYK",
    bleedMm: 3,
    safePaddingPx: 118,
    minReadableFontPx: 24,
    maxFileSizeKb: 25600,
    recommendedExportFormat: "PDF/X-4",
    description: "앞표지·책등·뒤표지·재단여백(3mm)을 포함한 단행본 인쇄소 입교 표준 규격",
  },
  {
    id: "crowdfunding-long-page",
    label: "텀블벅·와디즈 펀딩 상세 롱스크롤",
    platformName: "Tumblbug / Wadiz",
    channelGroup: "crowdfunding",
    widthPx: 1080,
    heightPx: 4800,
    aspectRatioLabel: "9:40 Long Scroll",
    dpi: 72,
    colorSpace: "sRGB",
    bleedMm: 0,
    safePaddingPx: 56,
    minReadableFontPx: 18,
    maxFileSizeKb: 10240,
    recommendedExportFormat: "PNG",
    description: "단행본·오리지널 굿즈 크라우드펀딩 스토리 소개용 롱스크롤 페이지 규격",
  },
] as const;

export function getDesignPlatformFormatPreset(
  formatId: DesignPlatformFormatId,
): DesignPlatformFormatPreset {
  const found = DESIGN_PLATFORM_FORMAT_PRESETS.find((preset) => preset.id === formatId);
  if (!found) {
    throw new Error(`지원하지 않는 디자인 플랫폼 규격 ID입니다: ${formatId}`);
  }
  return found;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 캔바(Canva) Magic Switch + Pixlr Generative Expand 방식으로
 * 원본 문서를 타깃 플랫폼 규격으로 지능형 리사이즈·리플로우한다.
 */
export function executeMagicSwitchResize(
  source: MagicSwitchSourceDocument,
  targetFormatId: DesignPlatformFormatId,
): MagicSwitchResizeResult {
  const preset = getDesignPlatformFormatPreset(targetFormatId);
  const srcW = Math.max(1, source.widthPx);
  const srcH = Math.max(1, source.heightPx);
  const dstW = preset.widthPx;
  const dstH = preset.heightPx;

  const safeZoneRect = {
    x: preset.safePaddingPx,
    y: preset.safePaddingPx,
    width: Math.max(64, dstW - preset.safePaddingPx * 2),
    height: Math.max(64, dstH - preset.safePaddingPx * 2),
  };

  const scaleX = dstW / srcW;
  const scaleY = dstH / srcH;
  const containScale = Math.min(scaleX, scaleY);
  const coverScale = Math.max(scaleX, scaleY);

  // 배경 아웃페인팅(Generative Expand) 여백 계산: contain 배치 시 남는 상하/좌우 빈 영역
  const fittedW = Math.round(srcW * containScale);
  const fittedH = Math.round(srcH * containScale);
  const padX = Math.max(0, dstW - fittedW);
  const padY = Math.max(0, dstH - fittedH);
  const aspectDelta = Math.abs(srcW / srcH - dstW / dstH);
  const outpaintRequired = aspectDelta > 0.12 && (padX >= 24 || padY >= 24);

  const outpaintExpansion: OutpaintExpansionPadding = {
    topPx: Math.floor(padY / 2),
    bottomPx: Math.ceil(padY / 2),
    leftPx: Math.floor(padX / 2),
    rightPx: Math.ceil(padX / 2),
    required: outpaintRequired,
    promptHint: outpaintRequired
      ? `${preset.platformName} (${preset.aspectRatioLabel}) 비율 확장을 위해 상하 ${padY}px · 좌우 ${padX}px 배경 톤앤매너 연장 권장`
      : "원본 비율과 호환되어 별도 배경 확장 없이 크롭/핏 가능",
  };

  const warnings: string[] = [];
  let readabilityBoostCount = 0;
  let safeZoneCompliantCount = 0;
  let focalRetentionAccumulator = 0;
  let focalLayerCount = 0;

  const transformedLayers: MagicSwitchTransformedLayer[] = source.layers.map((layer) => {
    if (layer.role === "background") {
      const bgW = Math.round(srcW * coverScale);
      const bgH = Math.round(srcH * coverScale);
      const bgX = Math.round((dstW - bgW) * clamp(source.primaryFocalPoint.x, 0, 1));
      const bgY = Math.round((dstH - bgH) * clamp(source.primaryFocalPoint.y, 0, 1));
      safeZoneCompliantCount += 1;
      return {
        id: layer.id,
        name: layer.name,
        role: layer.role,
        x: bgX,
        y: bgY,
        width: bgW,
        height: bgH,
        scaleFactor: Number(coverScale.toFixed(3)),
        clampedToSafeZone: false,
        readabilityBoosted: false,
      };
    }

    if (layer.role === "character") {
      const charScale = clamp(containScale * 1.06, 0.25, 3.5);
      const width = Math.min(safeZoneRect.width, Math.max(48, Math.round(layer.width * charScale)));
      const height = Math.min(dstH - preset.safePaddingPx, Math.max(48, Math.round(layer.height * charScale)));

      const layerFocal = layer.focalPoint ?? source.primaryFocalPoint;
      const desiredFocalX = safeZoneRect.x + safeZoneRect.width * clamp(layerFocal.x, 0.2, 0.8);
      const desiredFocalY = safeZoneRect.y + safeZoneRect.height * clamp(layerFocal.y, 0.18, 0.75);

      const rawX = Math.round(desiredFocalX - width * clamp(layerFocal.x, 0, 1));
      const rawY = Math.round(desiredFocalY - height * clamp(layerFocal.y, 0, 1));

      const x = clamp(rawX, safeZoneRect.x, safeZoneRect.x + safeZoneRect.width - width);
      const y = clamp(rawY, safeZoneRect.y, dstH - height);
      const clampedToSafeZone = x !== rawX || y !== rawY;

      const actualCenterNormX = (x + width * clamp(layerFocal.x, 0, 1)) / dstW;
      const actualCenterNormY = (y + height * clamp(layerFocal.y, 0, 1)) / dstH;
      const drift = Math.hypot(
        actualCenterNormX - clamp(layerFocal.x, 0.2, 0.8),
        actualCenterNormY - clamp(layerFocal.y, 0.18, 0.75),
      );
      focalRetentionAccumulator += clamp(100 - drift * 120, 60, 100);
      focalLayerCount += 1;
      safeZoneCompliantCount += 1;

      return {
        id: layer.id,
        name: layer.name,
        role: layer.role,
        x,
        y,
        width,
        height,
        scaleFactor: Number(charScale.toFixed(3)),
        clampedToSafeZone,
        readabilityBoosted: false,
      };
    }

    // title-logo, speech-balloon, sfx, badge: 안전 영역 내부 리플로우 및 최소 가독 폰트 크기 보장
    const relCenterX = (layer.x + layer.width / 2) / srcW;
    const relCenterY = (layer.y + layer.height / 2) / srcH;

    const rawScale = clamp((scaleX + scaleY) / 2, 0.45, 2.6);
    let fontSizePx = layer.fontSizePx ? Math.round(layer.fontSizePx * rawScale) : undefined;
    let readabilityBoosted = false;

    if (fontSizePx !== undefined && fontSizePx < preset.minReadableFontPx) {
      fontSizePx = preset.minReadableFontPx;
      readabilityBoosted = true;
      readabilityBoostCount += 1;
    }

    const boostRatio =
      layer.fontSizePx && fontSizePx
        ? Math.max(1, fontSizePx / Math.max(1, Math.round(layer.fontSizePx * rawScale)))
        : 1;

    const width = Math.min(
      safeZoneRect.width,
      Math.max(40, Math.round(layer.width * rawScale * Math.min(1.35, boostRatio))),
    );
    const height = Math.min(
      safeZoneRect.height,
      Math.max(24, Math.round(layer.height * rawScale * Math.min(1.35, boostRatio))),
    );

    const targetCenterX = safeZoneRect.x + safeZoneRect.width * clamp(relCenterX, 0.08, 0.92);
    const targetCenterY = safeZoneRect.y + safeZoneRect.height * clamp(relCenterY, 0.08, 0.92);

    const rawX = Math.round(targetCenterX - width / 2);
    const rawY = Math.round(targetCenterY - height / 2);
    const x = clamp(rawX, safeZoneRect.x, safeZoneRect.x + safeZoneRect.width - width);
    const y = clamp(rawY, safeZoneRect.y, safeZoneRect.y + safeZoneRect.height - height);
    const clampedToSafeZone = x !== rawX || y !== rawY;
    safeZoneCompliantCount += 1;

    return {
      id: layer.id,
      name: layer.name,
      role: layer.role,
      x,
      y,
      width,
      height,
      scaleFactor: Number(rawScale.toFixed(3)),
      fontSizePx,
      clampedToSafeZone,
      readabilityBoosted,
    };
  });

  if (readabilityBoostCount > 0) {
    warnings.push(
      `모바일 가독성을 위해 텍스트·말풍선 레이어 ${readabilityBoostCount}개의 최소 폰트 크기를 ${preset.minReadableFontPx}px 이상으로 자동 보정했습니다.`,
    );
  }
  if (outpaintRequired) {
    warnings.push(outpaintExpansion.promptHint);
  }
  if (preset.colorSpace === "CMYK") {
    warnings.push(
      "단행본 인쇄 규격(CMYK · 300DPI)입니다. 네온 형광 컬러는 인쇄 시 채도가 낮아지므로 프리플라이트 감사를 확인하세요.",
    );
  }

  const focalPointRetentionScore =
    focalLayerCount > 0 ? Math.round(focalRetentionAccumulator / focalLayerCount) : 94;
  const safeZoneComplianceScore =
    source.layers.length > 0
      ? Math.round((safeZoneCompliantCount / source.layers.length) * 100)
      : 100;
  const readabilityScore = readabilityBoostCount > 0 ? 96 : 100;
  const overallQualityScore = Math.round(
    focalPointRetentionScore * 0.4 + safeZoneComplianceScore * 0.35 + readabilityScore * 0.25,
  );

  return {
    formatPreset: preset,
    sourceSize: { widthPx: srcW, heightPx: srcH },
    targetSize: { widthPx: dstW, heightPx: dstH },
    safeZoneRect,
    transformedLayers,
    outpaintExpansion,
    focalPointRetentionScore,
    readabilityScore,
    safeZoneComplianceScore,
    overallQualityScore,
    warnings,
  };
}

/**
 * 한 번의 클릭으로 선택한 다중 플랫폼 규격 전체에 대해 Magic Switch 결과를 일괄 생성한다.
 */
export function executeBatchMagicSwitch(
  source: MagicSwitchSourceDocument,
  targetFormatIds: readonly DesignPlatformFormatId[],
): readonly MagicSwitchResizeResult[] {
  return targetFormatIds.map((formatId) => executeMagicSwitchResize(source, formatId));
}

const PAPER_THICKNESS_MM_PER_SHEET: Readonly<Record<TankobonPaperStock, number>> = {
  "rough-comics-70g": 0.095,
  "vellum-80g": 0.105,
  "white-offset-100g": 0.122,
  "snow-art-120g": 0.115,
};

const TRIM_DIMENSIONS_MM: Readonly<
  Record<TankobonTrimSize, { readonly widthMm: number; readonly heightMm: number }>
> = {
  A5: { widthMm: 148, heightMm: 210 },
  B5: { widthMm: 182, heightMm: 257 },
};

/**
 * 웹툰 단행본 인쇄용 표지 펼침면(앞표지 + 책등 + 뒤표지 + 날개 + 도련 3mm) 치수 및 300DPI 픽셀 가이드를 계산한다.
 */
export function calculateTankobonSpreadSpec(input: TankobonSpreadInput): TankobonSpreadSpec {
  const trim = TRIM_DIMENSIONS_MM[input.trimSize];
  const safePages = clamp(Math.round(input.pageCount), 24, 1200);
  const sheets = Math.ceil(safePages / 2);
  const baseSpineMm = sheets * PAPER_THICKNESS_MM_PER_SHEET[input.paperStock];
  const bindingExtraMm = input.bindingType === "hardcover" ? 3.2 : 0.6;
  const spineWidthMm = Number((baseSpineMm + bindingExtraMm).toFixed(1));

  const flapWidthMm =
    input.bindingType === "hardcover" ? 0 : clamp(Math.round(input.flapWidthMm), 0, 120);
  const bleedMm = clamp(input.bleedMm ?? 3, 0, 10);
  const dpi = clamp(input.dpi ?? 300, 150, 600);

  const totalSpreadWidthMm = Number(
    (bleedMm * 2 + flapWidthMm * 2 + trim.widthMm * 2 + spineWidthMm).toFixed(1),
  );
  const totalSpreadHeightMm = Number((bleedMm * 2 + trim.heightMm).toFixed(1));

  const mmToPx = (mm: number): number => Math.round((mm / 25.4) * dpi);

  const bleedLeftPx = mmToPx(bleedMm);
  const leftFlapEndPx = mmToPx(bleedMm + flapWidthMm);
  const backCoverEndPx = mmToPx(bleedMm + flapWidthMm + trim.widthMm);
  const spineStartPx = backCoverEndPx;
  const spineEndPx = mmToPx(bleedMm + flapWidthMm + trim.widthMm + spineWidthMm);
  const frontCoverEndPx = mmToPx(
    bleedMm + flapWidthMm + trim.widthMm * 2 + spineWidthMm,
  );
  const rightFlapEndPx = mmToPx(
    bleedMm + flapWidthMm * 2 + trim.widthMm * 2 + spineWidthMm,
  );

  return {
    trimSize: input.trimSize,
    singlePageWidthMm: trim.widthMm,
    singlePageHeightMm: trim.heightMm,
    spineWidthMm,
    flapWidthMm,
    bleedMm,
    totalSpreadWidthMm,
    totalSpreadHeightMm,
    totalSpreadWidthPx: mmToPx(totalSpreadWidthMm),
    totalSpreadHeightPx: mmToPx(totalSpreadHeightMm),
    dpi,
    guidesPx: {
      bleedLeftPx,
      leftFlapEndPx,
      backCoverEndPx,
      spineStartPx,
      spineEndPx,
      frontCoverEndPx,
      rightFlapEndPx,
    },
  };
}

/**
 * 망고보드(MangoBoard) · 웹툰 원고 출력용 롱스크롤 스마트 슬라이스 분할기.
 * 말풍선(`speech-balloon`)이나 타이틀 로고(`title-logo`)가 절단선에 걸리면
 * 안전한 여백(Gutter)으로 절단선을 자동 스냅하여 대사 잘림을 방지한다.
 */
export function computeVerticalScrollSlices(options: {
  readonly documentId: string;
  readonly widthPx: number;
  readonly totalHeightPx: number;
  readonly maxSliceHeightPx: number;
  readonly layers: readonly MagicSwitchSourceLayer[];
  readonly gutterSnapTolerancePx?: number;
}): readonly VerticalScrollSlice[] {
  const widthPx = Math.max(100, Math.round(options.widthPx));
  const totalHeightPx = Math.max(100, Math.round(options.totalHeightPx));
  const maxSliceHeightPx = clamp(Math.round(options.maxSliceHeightPx), 400, 5000);
  const tolerance = clamp(Math.round(options.gutterSnapTolerancePx ?? 180), 20, maxSliceHeightPx / 2);

  const protectedLayers = options.layers.filter(
    (layer) =>
      layer.role === "speech-balloon" ||
      layer.role === "title-logo" ||
      layer.role === "sfx",
  );

  const slices: VerticalScrollSlice[] = [];
  let cursorY = 0;
  let sliceIndex = 1;

  while (cursorY < totalHeightPx) {
    const proposedEndY = Math.min(totalHeightPx, cursorY + maxSliceHeightPx);
    let finalEndY = proposedEndY;
    let snappedToGutter = false;

    if (proposedEndY < totalHeightPx) {
      const crossingLayer = protectedLayers.find(
        (layer) => layer.y < proposedEndY && layer.y + layer.height > proposedEndY,
      );
      if (crossingLayer) {
        const candidateAbove = Math.floor(crossingLayer.y - 8);
        if (candidateAbove > cursorY + 200 && proposedEndY - candidateAbove <= tolerance) {
          finalEndY = candidateAbove;
          snappedToGutter = true;
        }
      }
    }

    const overlappingLayerIds = options.layers
      .filter((layer) => layer.y < finalEndY && layer.y + layer.height > cursorY)
      .map((layer) => layer.id);

    slices.push({
      sliceIndex,
      startYPx: cursorY,
      endYPx: finalEndY,
      heightPx: finalEndY - cursorY,
      widthPx,
      snappedToGutter,
      overlappingLayerIds,
      fileNameSuggestion: `${options.documentId}_slice_${String(sliceIndex).padStart(2, "0")}_${widthPx}x${finalEndY - cursorY}.png`,
    });

    cursorY = finalEndY;
    sliceIndex += 1;
  }

  return slices;
}
