/**
 * Canva Magic Studio 클린룸 내재화 엔진 (₩0 무과금 · 로컬 결정론 + 무료 AI 캐스케이드 브리지)
 *
 * - Magic Design: 한 줄 프롬프트 → 4종 웹툰/프로모 레이아웃 자동 합성 + 브랜드 키트 OKLCH·폰트 잠금
 * - Magic Switch: 원클릭 6종 다규격 자동 리플로우(네이버/카카오/인스타/숏폼 9:16/16:9/단행본 B5)
 * - Magic Grab / Magic Eraser / Magic Expand: 전경-배경 분리, 마스크 제거, 캔버스 확장 플래너
 * - Magic Write: 기존 ₩0 무료 AI 캐스케이드 연동 + 오프라인 결정론 폴백
 */

import {
  maskCreatorInputBeforeAiSend,
  runFreeAiZeroBillAssist,
  type FreeAiZeroBillModeId,
} from "@/shared/ai/free-ai-zero-bill-cascade";

export type MagicDesignFormat = "episode-thumbnail" | "promo-poster" | "sns-card" | "episode-banner";

export type MagicSwitchFormatId =
  | "naver-vertical"
  | "kakaopage-vertical"
  | "instagram-portrait"
  | "shortform-9-16"
  | "xyoutube-16-9"
  | "print-b5";

export type MagicWriteKind = "promo-copy" | "episode-synopsis" | "sns-post" | "title-ab";

export interface RectBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SafeZoneMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface BrandKitLock {
  readonly id: string;
  readonly nameKo: string;
  readonly toneKo: string;
  readonly primaryOklch: string;
  readonly secondaryOklch: string;
  readonly surfaceOklch: string;
  readonly inkOklch: string;
  readonly accentOklch: string;
  readonly headingFontKo: string;
  readonly bodyFontKo: string;
  readonly locked: boolean;
}

export interface MagicSwitchFormatSpec {
  readonly id: MagicSwitchFormatId;
  readonly labelKo: string;
  readonly platformNoteKo: string;
  readonly width: number;
  readonly height: number;
  readonly aspectLabel: string;
  readonly safeMargins: SafeZoneMargins;
  readonly minFontPx: number;
}

export type MagicLayerRole =
  | "background"
  | "hero-subject"
  | "subtitle-badge"
  | "title-typography"
  | "cta-pill"
  | "brand-watermark";

export interface MagicDesignLayer extends RectBox {
  readonly id: string;
  readonly role: MagicLayerRole;
  readonly labelKo: string;
  readonly zIndex: number;
  readonly fillOklch: string;
  readonly textOklch: string;
  readonly fontFamilyKo: string;
  readonly fontSizePx: number;
  readonly fontWeight: 500 | 700 | 800;
  readonly align: "left" | "center" | "right";
  readonly textKo: string;
  readonly safeZoneCompliant: boolean;
}

export interface MagicDesignDocument {
  readonly id: string;
  readonly format: MagicDesignFormat;
  readonly formatLabelKo: string;
  readonly promptKo: string;
  readonly moodLabelKo: string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly aspectLabel: string;
    readonly safeMargins: SafeZoneMargins;
  };
  readonly brandKit: BrandKitLock;
  readonly copyDraft: {
    readonly headlineKo: string;
    readonly subcopyKo: string;
    readonly badgeKo: string;
    readonly ctaKo: string;
  };
  readonly layers: readonly MagicDesignLayer[];
  readonly shieldAudit: {
    readonly zeroPaidApi: true;
    readonly brandLocked: boolean;
    readonly commercialSafeNoticeKo: string;
  };
}

export interface MagicSwitchReflowResult {
  readonly targetId: MagicSwitchFormatId;
  readonly labelKo: string;
  readonly platformNoteKo: string;
  readonly width: number;
  readonly height: number;
  readonly aspectLabel: string;
  readonly safeMargins: SafeZoneMargins;
  readonly fontScaleRatio: number;
  readonly layoutStrategyKo: string;
  readonly safeZonePreserved: boolean;
  readonly minLegibleFontMet: boolean;
  readonly layers: readonly MagicDesignLayer[];
}

export interface MagicGrabSeparationPlan {
  readonly sourceDocId: string;
  readonly subjectHintKo: string;
  readonly foregroundLayer: {
    readonly layerId: string;
    readonly labelKo: string;
    readonly bbox: RectBox;
    readonly featherRadiusPx: number;
    readonly preserveDropShadow: boolean;
  };
  readonly backgroundInpaintLayer: {
    readonly layerId: string;
    readonly labelKo: string;
    readonly holeFillBbox: RectBox;
    readonly continuityStrategyKo: string;
    readonly localEngineLabelKo: string;
  };
  readonly nonDestructiveOpsKo: readonly string[];
  readonly zeroPaidApi: true;
}

export interface EraserMaskRegion extends RectBox {
  readonly labelKo?: string;
}

export interface MagicEraserPlan {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly normalizedRegions: readonly {
    readonly index: number;
    readonly labelKo: string;
    readonly maskRect: RectBox;
    readonly contextCropRect: RectBox;
  }[];
  readonly totalMaskedAreaPct: number;
  readonly patchMatchPasses: number;
  readonly summaryKo: string;
  readonly zeroPaidApi: true;
}

export interface MagicExpandPlan {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly anchorRect: RectBox;
  readonly expandBandsPx: SafeZoneMargins;
  readonly seamFeatherPx: number;
  readonly strategyKo: string;
  readonly zeroPaidApi: true;
}

export interface MagicWriteRequest {
  readonly kind: MagicWriteKind;
  readonly promptKo: string;
  readonly projectTitle?: string;
  readonly toneKo?: string;
  readonly offlineOnly?: boolean;
}

export interface MagicWriteResult {
  readonly kind: MagicWriteKind;
  readonly kindLabelKo: string;
  readonly headlineKo: string;
  readonly variantsKo: readonly string[];
  readonly hashtagsKo: readonly string[];
  readonly characterCount: number;
  readonly providerId: string;
  readonly providerTier: "cloud-free" | "local-fallback";
  readonly costGuaranteedZeroUsd: 0;
  readonly paidBillingBlocked: true;
  readonly piiRedactedCount: number;
  readonly noticeKo: string | null;
}

export const CANVA_BRAND_KIT_PRESETS: readonly BrandKitLock[] = Object.freeze([
  {
    id: "brand-romance-atelier",
    nameKo: "로맨스 아틀리에",
    toneKo: "따뜻하고 섬세한 감성",
    primaryOklch: "oklch(0.58 0.16 14)",
    secondaryOklch: "oklch(0.76 0.08 42)",
    surfaceOklch: "oklch(0.97 0.015 65)",
    inkOklch: "oklch(0.24 0.03 25)",
    accentOklch: "oklch(0.52 0.19 8)",
    headingFontKo: "프리텐다드 블랙",
    bodyFontKo: "본고딕 미디엄",
    locked: true,
  },
  {
    id: "brand-neon-action",
    nameKo: "액션 느와르",
    toneKo: "강렬하고 속도감 있는 대비",
    primaryOklch: "oklch(0.64 0.21 28)",
    secondaryOklch: "oklch(0.68 0.16 232)",
    surfaceOklch: "oklch(0.21 0.03 255)",
    inkOklch: "oklch(0.96 0.01 255)",
    accentOklch: "oklch(0.74 0.19 52)",
    headingFontKo: "지마켓 산스 볼드",
    bodyFontKo: "프리텐다드 레귤러",
    locked: true,
  },
  {
    id: "brand-fantasy-gold",
    nameKo: "판타지 서사",
    toneKo: "웅장하고 고풍스러운 금빛",
    primaryOklch: "oklch(0.72 0.14 82)",
    secondaryOklch: "oklch(0.45 0.09 275)",
    surfaceOklch: "oklch(0.23 0.035 275)",
    inkOklch: "oklch(0.95 0.02 88)",
    accentOklch: "oklch(0.78 0.15 76)",
    headingFontKo: "마루 부리 볼드",
    bodyFontKo: "나눔명조 레귤러",
    locked: true,
  },
  {
    id: "brand-daily-pastel",
    nameKo: "일상 컷툰",
    toneKo: "밝고 친근한 생활 공감",
    primaryOklch: "oklch(0.62 0.14 158)",
    secondaryOklch: "oklch(0.84 0.11 92)",
    surfaceOklch: "oklch(0.98 0.012 96)",
    inkOklch: "oklch(0.25 0.02 180)",
    accentOklch: "oklch(0.56 0.16 154)",
    headingFontKo: "카페24 써라운드",
    bodyFontKo: "프리텐다드 미디엄",
    locked: true,
  },
]);

export const MAGIC_SWITCH_FORMATS: readonly MagicSwitchFormatSpec[] = Object.freeze([
  { id: "naver-vertical", labelKo: "네이버 세로", platformNoteKo: "웹툰 원고·회차 표지 표준", width: 800, height: 1280, aspectLabel: "5:8", safeMargins: { top: 56, right: 48, bottom: 64, left: 48 }, minFontPx: 18 },
  { id: "kakaopage-vertical", labelKo: "카카오페이지", platformNoteKo: "모바일 작품 홈 세로 배너", width: 720, height: 1280, aspectLabel: "9:16", safeMargins: { top: 64, right: 44, bottom: 84, left: 44 }, minFontPx: 18 },
  { id: "instagram-portrait", labelKo: "인스타그램", platformNoteKo: "피드 세로 홍보 카드", width: 1080, height: 1350, aspectLabel: "4:5", safeMargins: { top: 72, right: 72, bottom: 84, left: 72 }, minFontPx: 22 },
  { id: "shortform-9-16", labelKo: "숏폼 9:16", platformNoteKo: "쇼츠·릴스 상하 UI 세이프존 보호", width: 1080, height: 1920, aspectLabel: "9:16", safeMargins: { top: 210, right: 72, bottom: 320, left: 72 }, minFontPx: 24 },
  { id: "xyoutube-16-9", labelKo: "X·유튜브 16:9", platformNoteKo: "가로 썸네일·트레일러 좌우 분할", width: 1920, height: 1080, aspectLabel: "16:9", safeMargins: { top: 84, right: 96, bottom: 84, left: 96 }, minFontPx: 26 },
  { id: "print-b5", labelKo: "단행본 B5", platformNoteKo: "인쇄 재단 여백·고해상도 표지", width: 2150, height: 3035, aspectLabel: "B5", safeMargins: { top: 140, right: 130, bottom: 160, left: 130 }, minFontPx: 36 },
]);

const DESIGN_FORMAT_META: Record<
  MagicDesignFormat,
  { readonly labelKo: string; readonly width: number; readonly height: number; readonly aspectLabel: string; readonly safeMargins: SafeZoneMargins; readonly defaultCtaKo: string }
> = {
  "episode-thumbnail": { labelKo: "회차 썸네일", width: 800, height: 1280, aspectLabel: "5:8", safeMargins: { top: 56, right: 48, bottom: 64, left: 48 }, defaultCtaKo: "1화 바로 보기" },
  "promo-poster": { labelKo: "프로모 포스터", width: 1080, height: 1350, aspectLabel: "4:5", safeMargins: { top: 72, right: 72, bottom: 84, left: 72 }, defaultCtaKo: "매주 금요일 연재" },
  "sns-card": { labelKo: "SNS 홍보 카드", width: 1080, height: 1350, aspectLabel: "4:5", safeMargins: { top: 72, right: 72, bottom: 84, left: 72 }, defaultCtaKo: "지금 미리보기" },
  "episode-banner": { labelKo: "에피소드 가로 배너", width: 1920, height: 1080, aspectLabel: "16:9", safeMargins: { top: 84, right: 96, bottom: 84, left: 96 }, defaultCtaKo: "신작 오픈 이벤트" },
};

const WRITE_KIND_META: Record<MagicWriteKind, { readonly labelKo: string; readonly cascadeMode: FreeAiZeroBillModeId }> = {
  "promo-copy": { labelKo: "홍보 카피", cascadeMode: "thumbnail-hook-optimizer" },
  "episode-synopsis": { labelKo: "회차 시놉시스", cascadeMode: "idea-remix" },
  "sns-post": { labelKo: "SNS 홍보글", cascadeMode: "export-preflight-coach" },
  "title-ab": { labelKo: "제목 A/B 후보", cascadeMode: "thumbnail-hook-optimizer" },
};

function detectMoodFromPrompt(promptKo: string) {
  const normalized = promptKo.toLowerCase();
  if (/액션|전투|느와르|야간|네온|추격|수사|헌터/u.test(normalized)) {
    return { moodLabelKo: "긴장·느와르 무드", recommendedKitId: "brand-neon-action", badgeKo: "긴박한 전개" };
  }
  if (/판타지|마법|황실|기사|용|던전|왕국|회귀/u.test(normalized)) {
    return { moodLabelKo: "장대한 판타지 무드", recommendedKitId: "brand-fantasy-gold", badgeKo: "신작 판타지" };
  }
  if (/일상|개그|코미디|고양이|직장|학교|편의점|브이로그/u.test(normalized)) {
    return { moodLabelKo: "경쾌한 일상 무드", recommendedKitId: "brand-daily-pastel", badgeKo: "공감 컷툰" };
  }
  return { moodLabelKo: "따뜻한 로맨스 무드", recommendedKitId: "brand-romance-atelier", badgeKo: "감성 신작" };
}

function clampRectToSafeZone(
  rect: RectBox,
  canvasW: number,
  canvasH: number,
  margins: SafeZoneMargins,
): RectBox & { readonly compliant: boolean } {
  const safeW = Math.max(40, canvasW - margins.left - margins.right);
  const safeH = Math.max(40, canvasH - margins.top - margins.bottom);
  const width = Math.min(Math.max(40, Math.round(rect.width)), safeW);
  const height = Math.min(Math.max(24, Math.round(rect.height)), safeH);
  const x = Math.min(Math.max(margins.left, Math.round(rect.x)), canvasW - margins.right - width);
  const y = Math.min(Math.max(margins.top, Math.round(rect.y)), canvasH - margins.bottom - height);
  const compliant = x >= margins.left && y >= margins.top && x + width <= canvasW - margins.right && y + height <= canvasH - margins.bottom;
  return { x, y, width, height, compliant };
}

function computeRoleRect(
  role: Exclude<MagicLayerRole, "background">,
  width: number,
  height: number,
  m: SafeZoneMargins,
  fontPx: number,
): RectBox {
  const safeW = width - m.left - m.right;
  const safeH = height - m.top - m.bottom;
  const landscape = width > height;

  if (role === "hero-subject") {
    return landscape
      ? { x: m.left + Math.round(safeW * 0.48), y: m.top + 12, width: Math.round(safeW * 0.52), height: safeH - 24 }
      : { x: m.left, y: m.top + Math.round(safeH * 0.09), width: safeW, height: Math.round(safeH * 0.52) };
  }
  if (role === "subtitle-badge") {
    return landscape
      ? { x: m.left, y: m.top + Math.round(safeH * 0.12), width: Math.round(safeW * 0.24), height: Math.max(48, Math.round(fontPx * 2.1)) }
      : { x: m.left, y: m.top, width: Math.round(safeW * 0.44), height: Math.max(44, Math.round(fontPx * 2.1)) };
  }
  if (role === "title-typography") {
    return landscape
      ? { x: m.left, y: m.top + Math.round(safeH * 0.3), width: Math.round(safeW * 0.44), height: Math.round(safeH * 0.36) }
      : { x: m.left, y: m.top + Math.round(safeH * 0.64), width: safeW, height: Math.round(safeH * 0.18) };
  }
  if (role === "cta-pill") {
    return landscape
      ? { x: m.left, y: m.top + Math.round(safeH * 0.72), width: Math.round(safeW * 0.28), height: Math.max(54, Math.round(fontPx * 2.2)) }
      : { x: m.left, y: m.top + Math.round(safeH * 0.85), width: Math.round(safeW * 0.56), height: Math.max(52, Math.round(fontPx * 2.2)) };
  }
  const markW = Math.min(safeW, Math.round(width * 0.28));
  const markH = Math.max(32, Math.round(fontPx * 1.8));
  return { x: width - m.right - markW, y: height - m.bottom - markH, width: markW, height: markH };
}

export function generateMagicDesignLayout(params: {
  readonly promptKo: string;
  readonly format: MagicDesignFormat;
  readonly brandKit?: BrandKitLock;
  readonly titleKo?: string;
}): MagicDesignDocument {
  const cleanPrompt = params.promptKo.trim() || "비 오는 날 편의점 처마 밑 첫 만남 웹툰 프로모";
  const formatMeta = DESIGN_FORMAT_META[params.format];
  const mood = detectMoodFromPrompt(cleanPrompt);
  const defaultKit = CANVA_BRAND_KIT_PRESETS.find((item) => item.id === mood.recommendedKitId) ?? CANVA_BRAND_KIT_PRESETS[0];
  const activeKit = params.brandKit?.locked ? params.brandKit : (params.brandKit ?? defaultKit);

  const cleanTitle = params.titleKo?.trim();
  const headlineKo = cleanTitle && cleanTitle.length >= 2
    ? cleanTitle.slice(0, 32)
    : cleanPrompt.length > 24
      ? `${cleanPrompt.slice(0, 23)}…`
      : cleanPrompt;
  const subcopyKo = cleanPrompt.length > 44 ? `${cleanPrompt.slice(0, 43)}…` : cleanPrompt;
  const { width: w, height: h, safeMargins: m } = formatMeta;
  const isLandscape = w > h;

  const layerSpecs: readonly Omit<MagicDesignLayer, "x" | "y" | "width" | "height" | "safeZoneCompliant">[] = [
    { id: "layer-bg", role: "background", labelKo: "배경 무드 보드", zIndex: 0, fillOklch: activeKit.surfaceOklch, textOklch: activeKit.inkOklch, fontFamilyKo: activeKit.bodyFontKo, fontSizePx: 18, fontWeight: 500, align: "left", textKo: mood.moodLabelKo },
    { id: "layer-hero", role: "hero-subject", labelKo: "주인공 히어로 컷 슬롯", zIndex: 1, fillOklch: activeKit.secondaryOklch, textOklch: activeKit.inkOklch, fontFamilyKo: activeKit.bodyFontKo, fontSizePx: 22, fontWeight: 700, align: "center", textKo: "피사체 초점 영역" },
    { id: "layer-badge", role: "subtitle-badge", labelKo: "상단 배지", zIndex: 2, fillOklch: activeKit.accentOklch, textOklch: activeKit.surfaceOklch, fontFamilyKo: activeKit.headingFontKo, fontSizePx: isLandscape ? 24 : 20, fontWeight: 700, align: "center", textKo: mood.badgeKo },
    { id: "layer-title", role: "title-typography", labelKo: "메인 타이틀", zIndex: 3, fillOklch: "oklch(0 0 0 / 0)", textOklch: activeKit.inkOklch, fontFamilyKo: activeKit.headingFontKo, fontSizePx: isLandscape ? 64 : Math.round(w * 0.068), fontWeight: 800, align: "left", textKo: headlineKo },
    { id: "layer-cta", role: "cta-pill", labelKo: "행동 유도 버튼", zIndex: 4, fillOklch: activeKit.primaryOklch, textOklch: activeKit.surfaceOklch, fontFamilyKo: activeKit.headingFontKo, fontSizePx: isLandscape ? 26 : 22, fontWeight: 700, align: "center", textKo: formatMeta.defaultCtaKo },
    { id: "layer-watermark", role: "brand-watermark", labelKo: "작품 브랜드 표기", zIndex: 5, fillOklch: "oklch(0 0 0 / 0)", textOklch: activeKit.inkOklch, fontFamilyKo: activeKit.bodyFontKo, fontSizePx: 18, fontWeight: 500, align: "right", textKo: activeKit.nameKo },
  ];

  const layers: MagicDesignLayer[] = layerSpecs.map((spec) => {
    if (spec.role === "background") {
      return { ...spec, x: 0, y: 0, width: w, height: h, safeZoneCompliant: true };
    }
    const clamped = clampRectToSafeZone(computeRoleRect(spec.role, w, h, m, spec.fontSizePx), w, h, m);
    return { ...spec, x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height, safeZoneCompliant: clamped.compliant };
  });

  return {
    id: `magic-design:${params.format}:${cleanPrompt.length}`,
    format: params.format,
    formatLabelKo: formatMeta.labelKo,
    promptKo: cleanPrompt,
    moodLabelKo: mood.moodLabelKo,
    canvas: { width: w, height: h, aspectLabel: formatMeta.aspectLabel, safeMargins: m },
    brandKit: activeKit,
    copyDraft: { headlineKo, subcopyKo, badgeKo: mood.badgeKo, ctaKo: formatMeta.defaultCtaKo },
    layers,
    shieldAudit: {
      zeroPaidApi: true,
      brandLocked: activeKit.locked,
      commercialSafeNoticeKo: "외부 유료 호출 없이 로컬 레이아웃 규칙과 OKLCH 브랜드 토큰으로 합성했습니다.",
    },
  };
}

export function runMagicSwitchReflow(
  sourceDoc: MagicDesignDocument,
  targetIds: readonly MagicSwitchFormatId[] = MAGIC_SWITCH_FORMATS.map((item) => item.id),
): readonly MagicSwitchReflowResult[] {
  const sourceArea = Math.max(1, sourceDoc.canvas.width * sourceDoc.canvas.height);

  return targetIds.map((targetId) => {
    const spec = MAGIC_SWITCH_FORMATS.find((item) => item.id === targetId) ?? MAGIC_SWITCH_FORMATS[0];
    const rawScale = Math.sqrt((spec.width * spec.height) / sourceArea);
    const fontScaleRatio = Math.round(rawScale * 100) / 100;
    const isLandscape = spec.width > spec.height;
    const layoutStrategyKo = isLandscape
      ? "가로 16:9 좌우 분할 리플로우 (좌측 타이틀·우측 히어로 비충돌 배치)"
      : spec.id === "shortform-9-16"
        ? "숏폼 상하단 UI 세이프존(상 210px·하 320px) 보호 중앙 집중 배치"
        : spec.id === "print-b5"
          ? "단행본 B5 재단 여백(130~160px) 준수 고해상도 인쇄 타이포 스케일"
          : "모바일 세로 스크롤 상단 배지 → 히어로 → 하단 타이틀 표준 배치";

    const layers: MagicDesignLayer[] = sourceDoc.layers.map((layer) => {
      if (layer.role === "background") {
        return { ...layer, x: 0, y: 0, width: spec.width, height: spec.height, safeZoneCompliant: true };
      }
      const scaledFont = Math.max(spec.minFontPx, Math.round(layer.fontSizePx * rawScale));
      const box = computeRoleRect(layer.role, spec.width, spec.height, spec.safeMargins, scaledFont);
      const clamped = clampRectToSafeZone(box, spec.width, spec.height, spec.safeMargins);
      return { ...layer, x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height, fontSizePx: scaledFont, safeZoneCompliant: clamped.compliant };
    });

    return {
      targetId: spec.id,
      labelKo: spec.labelKo,
      platformNoteKo: spec.platformNoteKo,
      width: spec.width,
      height: spec.height,
      aspectLabel: spec.aspectLabel,
      safeMargins: spec.safeMargins,
      fontScaleRatio,
      layoutStrategyKo,
      safeZonePreserved: layers.every((layer) => layer.safeZoneCompliant),
      minLegibleFontMet: layers.filter((l) => l.role !== "background").every((l) => l.fontSizePx >= spec.minFontPx),
      layers,
    };
  });
}

export function planMagicGrabSeparation(
  sourceDoc: MagicDesignDocument,
  subjectHintKo = "주인공 상반신",
): MagicGrabSeparationPlan {
  const hero = sourceDoc.layers.find((item) => item.role === "hero-subject") ?? sourceDoc.layers[0];
  const pad = 16;
  const fgX = Math.max(0, hero.x + Math.round(hero.width * 0.12));
  const fgY = Math.max(0, hero.y + Math.round(hero.height * 0.08));
  const fgW = Math.max(40, Math.round(hero.width * 0.76));
  const fgH = Math.max(40, Math.round(hero.height * 0.84));
  const holeX = Math.max(0, fgX - pad);
  const holeY = Math.max(0, fgY - pad);

  return {
    sourceDocId: sourceDoc.id,
    subjectHintKo: subjectHintKo.trim() || "주인공 피사체",
    foregroundLayer: {
      layerId: `${sourceDoc.id}:grab-fg`,
      labelKo: `전경 분리 · ${subjectHintKo.trim() || "피사체"}`,
      bbox: { x: fgX, y: fgY, width: fgW, height: fgH },
      featherRadiusPx: 3,
      preserveDropShadow: true,
    },
    backgroundInpaintLayer: {
      layerId: `${sourceDoc.id}:grab-bg-clean`,
      labelKo: "배경 빈 영역 자동 복원",
      holeFillBbox: {
        x: holeX,
        y: holeY,
        width: Math.min(sourceDoc.canvas.width - holeX, fgW + pad * 2),
        height: Math.min(sourceDoc.canvas.height - holeY, fgH + pad * 2),
      },
      continuityStrategyKo: "주변 배경 경계 패턴과 조명 그라데이션을 유지해 이음매 없이 채움",
      localEngineLabelKo: "로컬 패치매치 무과금 복원기 (₩0)",
    },
    nonDestructiveOpsKo: [
      "원본 레이어를 잠금 사본으로 보존",
      "전경 알파 마스크 3px 페더 경계로 별도 레이어 분리",
      "배경 빈 영역에 주변 질감 패치 복원 레이어 추가",
    ],
    zeroPaidApi: true,
  };
}

export function planMagicEraserMask(
  canvasWidth: number,
  canvasHeight: number,
  regions: readonly EraserMaskRegion[],
): MagicEraserPlan {
  const safeW = Math.max(64, Math.round(canvasWidth));
  const safeH = Math.max(64, Math.round(canvasHeight));
  const contextPad = 24;
  const sourceRegions = regions.length > 0
    ? regions
    : [{ x: Math.round(safeW * 0.65), y: Math.round(safeH * 0.18), width: 120, height: 120, labelKo: "불필요 소품" }];

  let totalMaskedPx = 0;
  const normalizedRegions = sourceRegions.map((region, index) => {
    const x = Math.min(Math.max(0, Math.round(region.x)), safeW - 1);
    const y = Math.min(Math.max(0, Math.round(region.y)), safeH - 1);
    const width = Math.min(Math.max(8, Math.round(region.width)), safeW - x);
    const height = Math.min(Math.max(8, Math.round(region.height)), safeH - y);
    totalMaskedPx += width * height;
    const cropX = Math.max(0, x - contextPad);
    const cropY = Math.max(0, y - contextPad);
    return {
      index: index + 1,
      labelKo: region.labelKo?.trim() || `제거 영역 ${index + 1}`,
      maskRect: { x, y, width, height },
      contextCropRect: {
        x: cropX,
        y: cropY,
        width: Math.min(safeW - cropX, width + contextPad * 2),
        height: Math.min(safeH - cropY, height + contextPad * 2),
      },
    };
  });

  const totalMaskedAreaPct = Math.min(100, Math.round((totalMaskedPx / (safeW * safeH)) * 1000) / 10);
  const patchMatchPasses = totalMaskedAreaPct > 15 ? 6 : totalMaskedAreaPct > 5 ? 4 : 3;

  return {
    canvasWidth: safeW,
    canvasHeight: safeH,
    normalizedRegions,
    totalMaskedAreaPct,
    patchMatchPasses,
    summaryKo: `선택 영역 ${normalizedRegions.length}곳(면적 ${totalMaskedAreaPct}%)을 주변 24px 문맥으로 ${patchMatchPasses}회 자연스럽게 지웁니다.`,
    zeroPaidApi: true,
  };
}

export function planMagicExpandCanvas(params: {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly align?: "center" | "top" | "bottom";
}): MagicExpandPlan {
  const srcW = Math.max(64, Math.round(params.sourceWidth));
  const srcH = Math.max(64, Math.round(params.sourceHeight));
  const dstW = Math.max(srcW, Math.round(params.targetWidth));
  const dstH = Math.max(srcH, Math.round(params.targetHeight));
  const extraW = dstW - srcW;
  const extraH = dstH - srcH;
  const left = Math.floor(extraW / 2);
  const right = extraW - left;
  const top = params.align === "top" ? 0 : params.align === "bottom" ? extraH : Math.floor(extraH / 2);
  const bottom = extraH - top;
  const maxBand = Math.max(top, right, bottom, left);

  return {
    sourceWidth: srcW,
    sourceHeight: srcH,
    targetWidth: dstW,
    targetHeight: dstH,
    anchorRect: { x: left, y: top, width: srcW, height: srcH },
    expandBandsPx: { top, right, bottom, left },
    seamFeatherPx: maxBand > 0 ? Math.min(36, Math.max(8, Math.round(maxBand * 0.12))) : 0,
    strategyKo:
      maxBand === 0
        ? "현재 캔버스 크기와 동일해 확장 없이 원본 구도를 유지합니다."
        : `원본 그림을 안전하게 고정하고 상 ${top}·우 ${right}·하 ${bottom}·좌 ${left}px 배경을 자연스럽게 확장합니다.`,
    zeroPaidApi: true,
  };
}

function buildLocalMagicWriteVariants(kind: MagicWriteKind, sanitizedPrompt: string, projectTitle: string, toneKo: string) {
  const focus = sanitizedPrompt.slice(0, 42) || "첫 만남의 설렘";
  if (kind === "episode-synopsis") {
    return {
      headlineKo: `${projectTitle} 회차 시놉시스 초안`,
      variantsKo: [
        `[도입] "${focus}"에서 시작된 작은 우연이 주인공의 일상을 흔듭니다.`,
        "[전개] 숨겨진 진실이 드러나며 두 인물 사이의 거리감이 급격히 좁혀집니다.",
        "[엔딩 훅] 마지막 컷에서 뜻밖의 인물이 등장하며 다음 화를 기다리게 만듭니다.",
      ],
      hashtagsKo: ["#웹툰시놉시스", "#1화기획", "#연재준비"],
    };
  }
  if (kind === "sns-post") {
    return {
      headlineKo: `${projectTitle} SNS 연재 홍보문`,
      variantsKo: [
        `오늘 밤 공개! "${focus}" 장면 때문에 댓글창이 들썩인 바로 그 회차, 지금 바로 만나 보세요.`,
        `[${projectTitle} 업데이트] 1컷부터 시선을 붙잡는 반전 전개! 프로필 링크에서 무료로 감상할 수 있어요.`,
        `이번 주 마감 비하인드와 함께 돌아왔습니다. ${toneKo} 분위기로 완성한 새 회차를 확인해 주세요.`,
      ],
      hashtagsKo: ["#신작웹툰", "#웹툰추천", "#오늘의업데이트"],
    };
  }
  if (kind === "title-ab") {
    return {
      headlineKo: `${projectTitle} 클릭률 테스트 제목 3안`,
      variantsKo: [
        `[A안 · 호기심형] 그날 "${focus.slice(0, 14)}" 뒤에 숨겨진 비밀`,
        `[B안 · 감정공감형] ${projectTitle}: 차마 말하지 못한 한마디`,
        "[C안 · 임팩트형] 단 한 컷으로 운명이 바뀐 순간",
      ],
      hashtagsKo: ["#웹툰제목", "#썸네일카피", "#AB테스트"],
    };
  }
  return {
    headlineKo: `${projectTitle} 한 줄 홍보 카피`,
    variantsKo: [
      `"${focus}" — 단 한 번의 선택이 모든 관계를 바꾼다.`,
      `${toneKo} 감성으로 채운 신작 ${projectTitle}, 지금 1화 무료 공개 중!`,
      "스크롤을 멈출 수 없는 몰입감, 오늘 밤 가장 먼저 만나야 할 이야기.",
    ],
    hashtagsKo: ["#웹툰홍보", "#신작오픈", "#매주연재"],
  };
}

export async function runMagicWriteZeroBill(
  request: MagicWriteRequest,
  options: { readonly fetchImpl?: typeof fetch; readonly signal?: AbortSignal } = {},
): Promise<MagicWriteResult> {
  const kindMeta = WRITE_KIND_META[request.kind];
  const masked = maskCreatorInputBeforeAiSend(request.promptKo.trim());
  const projectTitle = request.projectTitle?.trim() || "새 웹툰 프로젝트";
  const toneKo = request.toneKo?.trim() || "친근하고 선명한";
  const localDraft = buildLocalMagicWriteVariants(request.kind, masked.sanitizedText, projectTitle, toneKo);

  const resolvedFetch = options.fetchImpl ??
    (request.offlineOnly === false && typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : undefined);

  if (request.offlineOnly || !resolvedFetch) {
    return {
      kind: request.kind,
      kindLabelKo: kindMeta.labelKo,
      headlineKo: localDraft.headlineKo,
      variantsKo: localDraft.variantsKo,
      hashtagsKo: localDraft.hashtagsKo,
      characterCount: localDraft.variantsKo.join(" ").length,
      providerId: "local-zero-cost-fallback",
      providerTier: "local-fallback",
      costGuaranteedZeroUsd: 0,
      paidBillingBlocked: true,
      piiRedactedCount: masked.redactedCount,
      noticeKo: null,
    };
  }

  const cascade = await runFreeAiZeroBillAssist(
    { mode: kindMeta.cascadeMode, inputText: `${kindMeta.labelKo} (${toneKo}): ${masked.sanitizedText}`, projectTitle, genreOrTone: toneKo },
    { fetchImpl: resolvedFetch, signal: options.signal },
  );
  const useCloud = cascade.providerTier === "cloud-free" && cascade.bulletsKo.length > 0;
  const variantsKo = useCloud ? cascade.bulletsKo : localDraft.variantsKo;

  return {
    kind: request.kind,
    kindLabelKo: kindMeta.labelKo,
    headlineKo: useCloud ? cascade.headlineKo : localDraft.headlineKo,
    variantsKo,
    hashtagsKo: localDraft.hashtagsKo,
    characterCount: variantsKo.join(" ").length,
    providerId: cascade.providerId,
    providerTier: cascade.providerTier,
    costGuaranteedZeroUsd: 0,
    paidBillingBlocked: true,
    piiRedactedCount: Math.max(masked.redactedCount, cascade.piiRedactedCount),
    noticeKo: cascade.fallbackNoticeKo,
  };
}
