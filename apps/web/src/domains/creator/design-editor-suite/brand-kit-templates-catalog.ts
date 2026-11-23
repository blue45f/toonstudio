/**
 * 브랜드 키트 8종 팔레트 · 한영 추천 폰트 페어링 6종 · 1클릭 전역 리스킨 · 템플릿 생성기
 * (포토 마스크 프레임 8종, 한글 타이포 효과 6종, 실전 템플릿 16종을 함께 재노출)
 */

import {
  DESIGN_EDITOR_TEMPLATES,
  type BrandKitId,
  type DesignTemplateDescriptor,
  type DesignTemplateId,
  type FontPairingId,
} from "./design-templates-data";
import {
  applyMagicResize,
  getMagicResizeFormat,
  type DesignArtboardDocument,
  type DesignArtboardElement,
} from "./magic-resize-engine";

export {
  KOREAN_TYPO_EFFECTS,
  PHOTO_MASK_FRAMES,
  buildPhotoMaskSvgGeometry,
  type KoreanTypoEffectId,
  type KoreanTypoEffectPreset,
  type PhotoMaskFrameId,
  type PhotoMaskFramePreset,
  type PhotoMaskSvgGeometry,
} from "./photo-frames-typo-catalog";

export {
  DESIGN_EDITOR_TEMPLATES,
  type BrandKitId,
  type DesignTemplateCategory,
  type DesignTemplateDescriptor,
  type DesignTemplateId,
  type FontPairingId,
} from "./design-templates-data";

export interface BrandKitTokenRefs {
  readonly bg: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly accent2: string;
  readonly border: string;
  readonly onAccent: string;
}

export interface BrandKitPreset {
  readonly id: BrandKitId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly moodKo: string;
  readonly moodEn: string;
  readonly themeClass: string;
  readonly defaultFontPairingId: FontPairingId;
  readonly tokens: BrandKitTokenRefs;
}

export interface FontPairingPreset {
  readonly id: FontPairingId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly vibeKo: string;
  readonly vibeEn: string;
  readonly headingFamily: string;
  readonly bodyFamily: string;
  readonly accentFamily: string;
  readonly headingWeight: number;
  readonly bodyWeight: number;
  readonly letterSpacingHeading: string;
}

export interface BrandKitApplyResult {
  readonly artboard: DesignArtboardDocument;
  readonly brandKit: BrandKitPreset;
  readonly fontPairing: FontPairingPreset;
  readonly updatedElementCount: number;
}

const SEMANTIC_KIT_TOKENS: BrandKitTokenRefs = {
  bg: "var(--des-kit-bg)",
  surface: "var(--des-kit-surface)",
  ink: "var(--des-kit-ink)",
  muted: "var(--des-kit-muted)",
  accent: "var(--des-kit-accent)",
  accent2: "var(--des-kit-accent-2)",
  border: "var(--des-kit-border)",
  onAccent: "var(--des-kit-on-accent)",
};

export const BRAND_KIT_PRESETS: readonly BrandKitPreset[] = [
  { id: "editorial-ink", nameKo: "에디토리얼 잉크", nameEn: "Editorial Ink", moodKo: "미색 종이 · 먹색 타이포 · 주홍 포인트", moodEn: "Warm ivory paper · charcoal ink · vermilion", themeClass: "des-kit-editorial-ink", defaultFontPairingId: "pretendard-editorial", tokens: SEMANTIC_KIT_TOKENS },
  { id: "rofan-atelier", nameKo: "로판 아틀리에", nameEn: "Rofan Atelier", moodKo: "양피지 크림 · 버건디 · 앤티크 골드", moodEn: "Parchment cream · burgundy · antique gold", themeClass: "des-kit-rofan-atelier", defaultFontPairingId: "maruburi-classic", tokens: SEMANTIC_KIT_TOKENS },
  { id: "seoul-poster", nameKo: "서울 팝 포스터", nameEn: "Seoul Pop Poster", moodKo: "선명한 코발트 · 감홍 오렌지 · 고대비", moodEn: "Crisp cobalt · persimmon orange · high contrast", themeClass: "des-kit-seoul-poster", defaultFontPairingId: "blackhansans-impact", tokens: SEMANTIC_KIT_TOKENS },
  { id: "matcha-studio", nameKo: "말차 페이퍼 스튜디오", nameEn: "Matcha Paper Studio", moodKo: "오트 페이퍼 · 딥 포레스트 · 테라코타", moodEn: "Oat paper · deep forest · warm terracotta", themeClass: "des-kit-matcha-studio", defaultFontPairingId: "pretendard-editorial", tokens: SEMANTIC_KIT_TOKENS },
  { id: "noir-thriller", nameKo: "누아르 스릴러", nameEn: "Noir Thriller", moodKo: "옵시디언 다크 · 아이보리 텍스트 · 시그널 레드", moodEn: "Obsidian slate · bone white · crimson signal", themeClass: "des-kit-noir-thriller", defaultFontPairingId: "blackhansans-impact", tokens: SEMANTIC_KIT_TOKENS },
  { id: "sunny-goods", nameKo: "햇살 굿즈 마켓", nameEn: "Sunny Goods Market", moodKo: "버터 크림 · 에스프레소 · 탠저린 코랄", moodEn: "Butter cream · espresso · tangerine coral", themeClass: "des-kit-sunny-goods", defaultFontPairingId: "jua-goods", tokens: SEMANTIC_KIT_TOKENS },
  { id: "blueprint-deck", nameKo: "블루프린트 IR 덱", nameEn: "Blueprint Pitch Deck", moodKo: "미네랄 화이트 · 딥 네이비 · 세룰리안", moodEn: "Mineral white · deep navy · cerulean", themeClass: "des-kit-blueprint-deck", defaultFontPairingId: "suit-deck", tokens: SEMANTIC_KIT_TOKENS },
  { id: "whiteboard-chalk", nameKo: "화이트보드 크래프트", nameEn: "Whiteboard Craft", moodKo: "모눈 종이 · 그래파이트 · 마커 틸 & 앰버", moodEn: "Grid paper · graphite · marker teal & amber", themeClass: "des-kit-whiteboard-chalk", defaultFontPairingId: "excali-hand", tokens: SEMANTIC_KIT_TOKENS },
] as const;

export const FONT_PAIRING_PRESETS: readonly FontPairingPreset[] = [
  { id: "pretendard-editorial", nameKo: "프리텐다드 × 본고딕", nameEn: "Pretendard × Modern Sans", vibeKo: "카드뉴스 · 공지 · 정갈한 UI", vibeEn: "Card news · notices · crisp UI", headingFamily: '"Pretendard Variable", "Noto Sans KR", system-ui, sans-serif', bodyFamily: '"Pretendard Variable", "Apple SD Gothic Neo", sans-serif', accentFamily: '"Pretendard Variable", "Inter", sans-serif', headingWeight: 800, bodyWeight: 500, letterSpacingHeading: "-0.025em" },
  { id: "maruburi-classic", nameKo: "마루부리 명조 × 산스", nameEn: "MaruBuri Serif × Sans", vibeKo: "로판 표지 · 웹소설 · 감성 포스터", vibeEn: "Romance covers · novels · editorial posters", headingFamily: '"MaruBuri", "Noto Serif KR", Georgia, serif', bodyFamily: '"Pretendard Variable", "Noto Sans KR", sans-serif', accentFamily: '"MaruBuri", Georgia, serif', headingWeight: 700, bodyWeight: 400, letterSpacingHeading: "-0.01em" },
  { id: "blackhansans-impact", nameKo: "임팩트 디스플레이 × 고딕", nameEn: "Impact Display × Bold Sans", vibeKo: "유튜브 썸네일 · 릴스 · 강렬한 프로모", vibeEn: "YouTube thumbnails · reels · bold promos", headingFamily: '"Black Han Sans", "Pretendard Variable", Impact, sans-serif', bodyFamily: '"Pretendard Variable", "Noto Sans KR", sans-serif', accentFamily: '"Black Han Sans", Impact, sans-serif', headingWeight: 900, bodyWeight: 600, letterSpacingHeading: "-0.03em" },
  { id: "suit-deck", nameKo: "수트 지오메트릭 × 모노", nameEn: "SUIT Geometric × Mono", vibeKo: "PSST 사업계획 · IR 표지 · 명함", vibeEn: "PSST business plans · IR decks · cards", headingFamily: '"SUIT Variable", "Pretendard Variable", system-ui, sans-serif', bodyFamily: '"SUIT Variable", "Inter", sans-serif', accentFamily: '"JetBrains Mono", ui-monospace, monospace', headingWeight: 800, bodyWeight: 500, letterSpacingHeading: "-0.02em" },
  { id: "jua-goods", nameKo: "라운드 굿즈 × 고운돋움", nameEn: "Rounded Merch × Friendly Sans", vibeKo: "굿즈 스티커 · 키링 · 이벤트 쿠폰", vibeEn: "Stickers · keyrings · event coupons", headingFamily: '"Jua", "Gowun Dodum", "Pretendard Variable", sans-serif', bodyFamily: '"Gowun Dodum", "Pretendard Variable", sans-serif', accentFamily: '"Jua", sans-serif', headingWeight: 700, bodyWeight: 500, letterSpacingHeading: "0em" },
  { id: "excali-hand", nameKo: "손글씨 스케치 × 스튜디오 모노", nameEn: "Hand Sketch × Studio Mono", vibeKo: "화이트보드 플로우차트 · 와이어프레임", vibeEn: "Whiteboard flowcharts · wireframes", headingFamily: '"Virgil", "Gaegu", "Comic Neue", cursive, sans-serif', bodyFamily: '"Gaegu", "Pretendard Variable", sans-serif', accentFamily: '"JetBrains Mono", ui-monospace, monospace', headingWeight: 700, bodyWeight: 500, letterSpacingHeading: "0.01em" },
] as const;

const BRAND_KIT_MAP: ReadonlyMap<string, BrandKitPreset> = new Map(
  BRAND_KIT_PRESETS.map((kit) => [kit.id, kit]),
);

const FONT_PAIRING_MAP: ReadonlyMap<string, FontPairingPreset> = new Map(
  FONT_PAIRING_PRESETS.map((pair) => [pair.id, pair]),
);

const TEMPLATE_MAP: ReadonlyMap<string, DesignTemplateDescriptor> = new Map(
  DESIGN_EDITOR_TEMPLATES.map((tpl) => [tpl.id, tpl]),
);

export function getBrandKitPreset(brandKitId: string): BrandKitPreset {
  return BRAND_KIT_MAP.get(brandKitId) ?? BRAND_KIT_PRESETS[0];
}

export function getFontPairingPreset(fontPairingId: string): FontPairingPreset {
  return FONT_PAIRING_MAP.get(fontPairingId) ?? FONT_PAIRING_PRESETS[0];
}

export function getTemplateDescriptor(templateId: string): DesignTemplateDescriptor {
  return TEMPLATE_MAP.get(templateId) ?? DESIGN_EDITOR_TEMPLATES[0];
}

/**
 * 16종 실전 템플릿으로부터 즉시 편집 가능한 아트보드 문서를 생성한다.
 */
export function createArtboardFromTemplate(templateId: DesignTemplateId): DesignArtboardDocument {
  const tpl = getTemplateDescriptor(templateId);
  const fmt = getMagicResizeFormat(tpl.defaultFormatId);
  const font = getFontPairingPreset(tpl.defaultFontPairingId);
  const heroCount = Math.max(1, tpl.heroCount ?? 1);

  const heroElements: DesignArtboardElement[] = Array.from({ length: heroCount }, (_, index) => ({
    id: heroCount === 1 ? "hero-1" : `hero-${index + 1}`,
    role: "hero-image",
    kind: "image",
    x: 80 + index * 20,
    y: 120,
    width: 480,
    height: 360,
    textKo: heroCount === 1 ? tpl.heroCaptionKo : `${tpl.heroCaptionKo} #${index + 1}`,
    textEn: heroCount === 1 ? tpl.heroCaptionEn : `${tpl.heroCaptionEn} #${index + 1}`,
    fontSize: 22,
    fontWeight: 600,
    preserveAspectRatio: true,
    anchorX: "center",
    anchorY: "middle",
    tokenRole: "surface",
    borderRadius: 16,
  }));

  const seedArtboard: DesignArtboardDocument = {
    id: `artboard-${tpl.id}`,
    templateId: tpl.id,
    formatId: fmt.id,
    width: fmt.width,
    height: fmt.height,
    titleKo: tpl.nameKo,
    titleEn: tpl.nameEn,
    brandKitId: tpl.defaultBrandKitId,
    fontPairingId: tpl.defaultFontPairingId,
    photoFrameId: tpl.defaultPhotoFrameId,
    typoEffectId: tpl.defaultTypoEffectId,
    sketchMode: tpl.defaultSketchMode,
    showBleedGuides: fmt.isPrint,
    elements: [
      { id: "logo-1", role: "logo", kind: "text", x: 60, y: 48, width: 240, height: 44, textKo: tpl.logoKo, textEn: tpl.logoEn, fontSize: 20, fontWeight: 800, anchorX: "start", anchorY: "top", tokenRole: "ink" },
      { id: "badge-1", role: "badge", kind: "badge", x: 340, y: 48, width: 280, height: 44, textKo: tpl.badgeKo, textEn: tpl.badgeEn, fontSize: 18, fontWeight: 700, anchorX: "end", anchorY: "top", tokenRole: "badge", borderRadius: 999 },
      ...heroElements,
      { id: "headline-1", role: "headline", kind: "text", x: 60, y: 520, width: 820, height: 150, textKo: tpl.headlineKo, textEn: tpl.headlineEn, fontSize: 56, fontWeight: font.headingWeight, anchorX: "start", anchorY: "top", tokenRole: "ink" },
      { id: "subcopy-1", role: "subcopy", kind: "text", x: 60, y: 690, width: 820, height: 96, textKo: tpl.subcopyKo, textEn: tpl.subcopyEn, fontSize: 26, fontWeight: font.bodyWeight, anchorX: "start", anchorY: "top", tokenRole: "muted" },
      { id: "cta-1", role: "cta", kind: "button", x: 60, y: 820, width: 320, height: 76, textKo: tpl.ctaKo, textEn: tpl.ctaEn, fontSize: 24, fontWeight: 700, anchorX: "center", anchorY: "middle", tokenRole: "cta", borderRadius: 16 },
    ],
  };

  return applyMagicResize(seedArtboard, fmt.id).artboard;
}

/**
 * 1클릭 브랜드 키트 전역 리스킨.
 */
export function applyBrandKitToArtboard(
  artboard: DesignArtboardDocument,
  brandKitId: BrandKitId,
  options: {
    readonly syncFontPairing?: boolean;
    readonly explicitFontPairingId?: FontPairingId;
  } = {},
): BrandKitApplyResult {
  const brandKit = getBrandKitPreset(brandKitId);
  const nextFontId =
    options.explicitFontPairingId ??
    (options.syncFontPairing === false ? artboard.fontPairingId : brandKit.defaultFontPairingId);
  const fontPairing = getFontPairingPreset(nextFontId);

  const nextElements: DesignArtboardElement[] = artboard.elements.map((el) => {
    if (el.role === "headline") return { ...el, fontWeight: fontPairing.headingWeight, tokenRole: "ink" };
    if (el.role === "subcopy") return { ...el, fontWeight: fontPairing.bodyWeight, tokenRole: "muted" };
    if (el.role === "cta") return { ...el, fontWeight: 700, tokenRole: "cta" };
    if (el.role === "badge") return { ...el, fontWeight: 700, tokenRole: "badge" };
    return { ...el };
  });

  return {
    artboard: { ...artboard, brandKitId: brandKit.id, fontPairingId: fontPairing.id, elements: nextElements },
    brandKit,
    fontPairing,
    updatedElementCount: nextElements.length,
  };
}
