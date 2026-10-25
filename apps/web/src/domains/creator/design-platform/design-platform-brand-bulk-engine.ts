/**
 * 캔바(Canva) Brand Kit & Bulk Create · 미리캔버스(MiriCanvas) 원클릭 스타일 셔플 ·
 * 어도비 익스프레스(Adobe Express) 브랜드 잠금 가드레일 · 망고보드(MangoBoard) 팀 권한(777/774/770) ·
 * Polotno 멀티페이지 JSON 스키마 · 키틀(Kittl)/VistaCreate 굿즈 목업 및 프리플라이트 감사 엔진.
 *
 * REA 근거:
 * - Canva: ev_5c3656172c3d97c2332c7f6e3013289322c68b12ddb6a0064d3b6e0a950c70a1, ev_8827044671b973009b3a9b342d24df4565a7fe29599cb02efd1f220cadabcec9
 * - MiriCanvas: ev_8dd6d04fb1aecd0d43634e4cfdf07d6e251869ba0914926269e8b8084473b306, ev_35d619b32d0c7333febbc974fa3721f6aeaaf02c4f438fbb2cd80ac2a4539eb9
 * - MangoBoard (share_popup.js 777/774/770 & TemplateLimitPopup.js): ev_eaf7292da15560b1663cbce4b2714ef2df9ceed2c1eefe9deadcd631bb6bfdfc
 * - Polotno Studio: ev_46ceb5651d874e543e296ca187b00f0295303c85101fd4f3e67599b94d437fbb
 * - Kittl / VistaCreate / Adobe Express: ev_7420eb0b8b3b502a4ff3f09e1bf06616327c580ad376b54e6c31190a4f0d94d8, ev_cddeeabd6e10a607c041927cfb037de52b8f3ef2bce7af4db397cefa715d45d6, ev_a8cf321f96bb18a260ec19c41133b4511bcbb29ebd2ddaa57462ab295b84ddd6
 */

import {
  type DesignColorSpace,
  type DesignPlatformFormatId,
  getDesignPlatformFormatPreset,
} from "./design-platform-magic-switch";

export type StyleShufflePackId =
  | "rofan-imperial-velvet"
  | "action-cyber-arcade"
  | "editorial-minimal-noir"
  | "retro-halftone-pop"
  | "thriller-crimson-fog"
  | "youth-pastel-diary";

export interface DesignPlatformStyleShufflePack {
  readonly id: StyleShufflePackId;
  readonly label: string;
  readonly moodTag: string;
  readonly palette: {
    readonly canvasBg: string;
    readonly surfaceBg: string;
    readonly primaryText: string;
    readonly secondaryText: string;
    readonly accentPrimary: string;
    readonly accentSecondary: string;
    readonly balloonFill: string;
    readonly balloonStroke: string;
  };
  readonly typography: { readonly displayFont: string; readonly bodyFont: string; readonly sfxFont: string };
  readonly balloonCornerRadiusPx: number;
  readonly borderStrokeWidthPx: number;
}

/** 망고보드 `share_popup.js` 팀 템플릿 권한 플래그: "777"(전체 보기·편집), "774"(전체 보기·작성자 편집), "770"(작성자 전용). */
export type TeamPermissionFlag = "777" | "774" | "770";
export type CollaboratorRole = "owner" | "team-member" | "guest";

export interface BrandGuardrailPolicy {
  readonly seriesTitle: string;
  readonly permissionFlag: TeamPermissionFlag;
  readonly lockTitleLogoPosition: boolean;
  readonly requireAgeRatingBadge: boolean;
  readonly requireCopyrightNotice: boolean;
  readonly enforceBrandPaletteOnly: boolean;
  readonly allowedPaletteHexes: readonly string[];
}

export interface BrandGuardrailAuditInput {
  readonly policy: BrandGuardrailPolicy;
  readonly collaboratorRole: CollaboratorRole;
  readonly titleLogoMoved: boolean;
  readonly hasAgeRatingBadge: boolean;
  readonly hasCopyrightNotice: boolean;
  readonly usedColorsHex: readonly string[];
}

export interface BrandGuardrailAuditResult {
  readonly canView: boolean;
  readonly canEdit: boolean;
  readonly compliant: boolean;
  readonly permissionLabel: string;
  readonly violations: readonly string[];
}

export interface BulkEpisodeRow {
  readonly episodeNumber: number;
  readonly episodeTitle: string;
  readonly hookCopy: string;
  readonly releaseDate: string;
  readonly featuredCharacter: string;
  readonly ageRating: "ALL" | "12+" | "15+" | "19+";
}

export interface BulkEpisodeTemplateConfig {
  readonly seriesTitle: string;
  readonly formatId: DesignPlatformFormatId;
  readonly stylePackId: StyleShufflePackId;
  readonly titlePattern: string;
  readonly subtitlePattern: string;
  readonly hookPattern: string;
  readonly copyrightLine: string;
}

export interface PolotnoCompatibleElementNode {
  readonly id: string;
  readonly type: "text" | "figure" | "image" | "svg";
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text?: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly locked?: boolean;
}

export interface PolotnoCompatiblePageNode {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly bleed: number;
  readonly background: string;
  readonly children: readonly PolotnoCompatibleElementNode[];
}

export interface PolotnoCompatibleDocumentSchema {
  readonly schemaVersion: "2026-10-26";
  readonly width: number;
  readonly height: number;
  readonly unit: "px";
  readonly dpi: number;
  readonly pages: readonly PolotnoCompatiblePageNode[];
}

export interface BulkEpisodeGeneratedCard {
  readonly episodeNumber: number;
  readonly resolvedTitle: string;
  readonly resolvedSubtitle: string;
  readonly resolvedHook: string;
  readonly releaseDate: string;
  readonly featuredCharacter: string;
  readonly ageRating: "ALL" | "12+" | "15+" | "19+";
  readonly suggestedFileName: string;
  readonly pageNode: PolotnoCompatiblePageNode;
}

export interface BulkEpisodeGenerationResult {
  readonly totalGenerated: number;
  readonly formatId: DesignPlatformFormatId;
  readonly stylePack: DesignPlatformStyleShufflePack;
  readonly cards: readonly BulkEpisodeGeneratedCard[];
  readonly polotnoDocument: PolotnoCompatibleDocumentSchema;
}

export type GoodsMockupPresetId =
  | "acrylic-stand-diorama"
  | "hologram-photocard-55x85"
  | "tankobon-hardcover-3d"
  | "smartphone-lockscreen-keyvisual"
  | "can-badge-58mm";

export interface GoodsMockupPreset {
  readonly id: GoodsMockupPresetId;
  readonly label: string;
  readonly category: "acrylic" | "photocard" | "bookcover" | "digital-frame" | "badge";
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly dieCutMarginMm: number;
  readonly requiresWhiteUnderbase: boolean;
  readonly recommendedDpi: number;
  readonly clipShapeSvgPath: string;
  readonly productionNote: string;
}

export interface GoodsMockupComputedSpec {
  readonly preset: GoodsMockupPreset;
  readonly exportWidthPx: number;
  readonly exportHeightPx: number;
  readonly safeContentWidthPx: number;
  readonly safeContentHeightPx: number;
  readonly dieCutOffsetPx: number;
  readonly whiteUnderbaseLayerName: string | null;
}

export interface DesignPreflightAuditInput {
  readonly formatId: DesignPlatformFormatId;
  readonly actualDpi: number;
  readonly actualColorSpace: DesignColorSpace;
  readonly actualBleedMm: number;
  readonly hasUnlicensedExternalFont: boolean;
  readonly hasDraftWatermark: boolean;
  readonly foregroundHex: string;
  readonly backgroundHex: string;
  readonly safeZoneClippedLayerCount: number;
}

export interface DesignPreflightCheckItem {
  readonly id: string;
  readonly label: string;
  readonly status: "pass" | "warning" | "fail";
  readonly detail: string;
}

export interface DesignPreflightAuditReport {
  readonly overallStatus: "ready" | "warning" | "blocked";
  readonly score: number;
  readonly wcagContrastRatio: number;
  readonly checks: readonly DesignPreflightCheckItem[];
  readonly remediations: readonly string[];
}

export const DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS: readonly DesignPlatformStyleShufflePack[] = [
  {
    id: "rofan-imperial-velvet",
    label: "출판 로판 임페리얼 벨벳",
    moodTag: "우아함 · 황실 골드 · 클래식",
    palette: {
      canvasBg: "#160F29",
      surfaceBg: "#241942",
      primaryText: "#FFFBEB",
      secondaryText: "#FDE68A",
      accentPrimary: "#F59E0B",
      accentSecondary: "#C084FC",
      balloonFill: "#FFFDF7",
      balloonStroke: "#78350F",
    },
    typography: {
      displayFont: "'MaruBuri', 'Noto Serif KR', serif",
      bodyFont: "'Pretendard Variable', sans-serif",
      sfxFont: "'Nanum Myeongjo', serif",
    },
    balloonCornerRadiusPx: 24,
    borderStrokeWidthPx: 2,
  },
  {
    id: "action-cyber-arcade",
    label: "네온 아케이드 헌터 액션",
    moodTag: "타격감 · 네온 시안 · 다이나믹",
    palette: {
      canvasBg: "#090D16",
      surfaceBg: "#111827",
      primaryText: "#F8FAFC",
      secondaryText: "#7DD3FC",
      accentPrimary: "#06B6D4",
      accentSecondary: "#F43F5E",
      balloonFill: "#0F172A",
      balloonStroke: "#38BDF8",
    },
    typography: {
      displayFont: "'Black Han Sans', 'Pretendard Variable', sans-serif",
      bodyFont: "'Pretendard Variable', sans-serif",
      sfxFont: "'Black Han Sans', sans-serif",
    },
    balloonCornerRadiusPx: 8,
    borderStrokeWidthPx: 3,
  },
  {
    id: "editorial-minimal-noir",
    label: "미니멀 편집부 모던 누아르",
    moodTag: "모던 · 그래픽노블 · 고대비",
    palette: {
      canvasBg: "#121316",
      surfaceBg: "#1E2026",
      primaryText: "#FAFAFA",
      secondaryText: "#D4D4D8",
      accentPrimary: "#E4E4E7",
      accentSecondary: "#F97316",
      balloonFill: "#FFFFFF",
      balloonStroke: "#18181B",
    },
    typography: {
      displayFont: "'Pretendard Variable', sans-serif",
      bodyFont: "'Pretendard Variable', sans-serif",
      sfxFont: "'Pretendard Variable', sans-serif",
    },
    balloonCornerRadiusPx: 12,
    borderStrokeWidthPx: 2,
  },
  {
    id: "retro-halftone-pop",
    label: "레트로 코믹스 할프톤 팝",
    moodTag: "발랄함 · 인스타툰 · 팝아트",
    palette: {
      canvasBg: "#FFFBEB",
      surfaceBg: "#FEF3C7",
      primaryText: "#18181B",
      secondaryText: "#3F3F46",
      accentPrimary: "#EA580C",
      accentSecondary: "#2563EB",
      balloonFill: "#FFFFFF",
      balloonStroke: "#18181B",
    },
    typography: {
      displayFont: "'Jua', 'Pretendard Variable', sans-serif",
      bodyFont: "'Pretendard Variable', sans-serif",
      sfxFont: "'Jua', sans-serif",
    },
    balloonCornerRadiusPx: 20,
    borderStrokeWidthPx: 3,
  },
  {
    id: "thriller-crimson-fog",
    label: "다크 스릴러 크림슨 포그",
    moodTag: "서스펜스 · 미스터리 · 호러",
    palette: {
      canvasBg: "#09090B",
      surfaceBg: "#18181B",
      primaryText: "#F4F4F5",
      secondaryText: "#FCA5A5",
      accentPrimary: "#EF4444",
      accentSecondary: "#22D3EE",
      balloonFill: "#18181B",
      balloonStroke: "#EF4444",
    },
    typography: {
      displayFont: "'Pretendard Variable', sans-serif",
      bodyFont: "'Pretendard Variable', sans-serif",
      sfxFont: "'Nanum Myeongjo', serif",
    },
    balloonCornerRadiusPx: 4,
    borderStrokeWidthPx: 2,
  },
  {
    id: "youth-pastel-diary",
    label: "파스텔 청춘 캠퍼스 다이어리",
    moodTag: "청량함 · 학원물 · 소프트",
    palette: {
      canvasBg: "#F0F9FF",
      surfaceBg: "#E0F2FE",
      primaryText: "#0F172A",
      secondaryText: "#1E3A8A",
      accentPrimary: "#0284C7",
      accentSecondary: "#E11D48",
      balloonFill: "#FFFFFF",
      balloonStroke: "#0284C7",
    },
    typography: {
      displayFont: "'SUIT Variable', 'Pretendard Variable', sans-serif",
      bodyFont: "'Pretendard Variable', sans-serif",
      sfxFont: "'SUIT Variable', sans-serif",
    },
    balloonCornerRadiusPx: 22,
    borderStrokeWidthPx: 2,
  },
] as const;

export const DESIGN_PLATFORM_GOODS_MOCKUPS: readonly GoodsMockupPreset[] = [
  {
    id: "acrylic-stand-diorama",
    label: "캐릭터 아크릴 스탠드 (디오라마형)",
    category: "acrylic",
    trimWidthMm: 100,
    trimHeightMm: 150,
    bleedMm: 2,
    dieCutMarginMm: 2.5,
    requiresWhiteUnderbase: true,
    recommendedDpi: 300,
    clipShapeSvgPath: "M 18 8 L 82 8 Q 92 8 92 18 L 92 136 Q 92 144 82 144 L 18 144 Q 8 144 8 136 L 8 18 Q 8 8 18 8 Z",
    productionNote: "투명 아크릴 합지용 화이트 배면(White Underbase) 마스크와 하단 꽂이 발판(18×4mm) 칼선 자동 생성",
  },
  {
    id: "hologram-photocard-55x85",
    label: "홀로그램 특전 포토카드 (55×85mm)",
    category: "photocard",
    trimWidthMm: 55,
    trimHeightMm: 85,
    bleedMm: 2,
    dieCutMarginMm: 0,
    requiresWhiteUnderbase: false,
    recommendedDpi: 300,
    clipShapeSvgPath: "M 6 0 L 49 0 Q 55 0 55 6 L 55 79 Q 55 85 49 85 L 6 85 Q 0 85 0 79 L 0 6 Q 0 0 6 0 Z",
    productionNote: "모서리 라운딩 3R(3mm) 재단선 및 홀로그램 박(Foil) 하이라이트 레이어 분리 지원",
  },
  {
    id: "tankobon-hardcover-3d",
    label: "단행본 양장본 3D 북커버 목업",
    category: "bookcover",
    trimWidthMm: 148,
    trimHeightMm: 210,
    bleedMm: 3,
    dieCutMarginMm: 0,
    requiresWhiteUnderbase: false,
    recommendedDpi: 300,
    clipShapeSvgPath: "M 0 0 L 148 0 L 148 210 L 0 210 Z",
    productionNote: "A5 단행본 표지·책등 입체 시뮬레이션 및 부분 UV 코팅(Spot UV) 타이틀 마스크 지원",
  },
  {
    id: "smartphone-lockscreen-keyvisual",
    label: "스마트폰 락스크린 디지털 배경화면",
    category: "digital-frame",
    trimWidthMm: 91.4,
    trimHeightMm: 198.1,
    bleedMm: 0,
    dieCutMarginMm: 0,
    requiresWhiteUnderbase: false,
    recommendedDpi: 300,
    clipShapeSvgPath: "M 10 0 L 81 0 Q 91 0 91 10 L 91 188 Q 91 198 81 198 L 10 198 Q 0 198 0 188 L 0 10 Q 0 0 10 0 Z",
    productionNote: "상단 시계 위젯·하단 손전등 아이콘 가림 영역을 피한 팬덤 디지털 리워드 규격",
  },
  {
    id: "can-badge-58mm",
    label: "원형 핀버튼 캔배지 (58mm)",
    category: "badge",
    trimWidthMm: 58,
    trimHeightMm: 58,
    bleedMm: 6,
    dieCutMarginMm: 3,
    requiresWhiteUnderbase: false,
    recommendedDpi: 300,
    clipShapeSvgPath: "M 29 0 A 29 29 0 1 0 29 58 A 29 29 0 1 0 29 0 Z",
    productionNote: "뒷면 말림 영역(6mm 여분 도련) 안에 캐릭터 이목구비나 로고가 들어가지 않도록 원형 안전선 강제",
  },
] as const;

export function getStyleShufflePack(packId: StyleShufflePackId): DesignPlatformStyleShufflePack {
  const found = DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS.find((pack) => pack.id === packId);
  if (!found) {
    throw new Error(`지원하지 않는 스타일 셔플 팩 ID입니다: ${packId}`);
  }
  return found;
}

/** 미리캔버스(MiriCanvas) 스타일 원클릭 셔플: 현재 팩의 다음 순서 팩을 결정론적으로 반환한다. */
export function shuffleSeriesStylePack(
  currentPackId: StyleShufflePackId,
): DesignPlatformStyleShufflePack {
  const currentIndex = DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS.findIndex(
    (pack) => pack.id === currentPackId,
  );
  const nextIndex =
    currentIndex < 0 ? 0 : (currentIndex + 1) % DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS.length;
  return DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS[nextIndex]!;
}

function parseHexToRgb(hex: string): { readonly r: number; readonly g: number; readonly b: number } {
  const cleaned = hex.trim().replace(/^#/u, "");
  const normalized =
    cleaned.length === 3
      ? cleaned.split("").map((ch) => ch + ch).join("")
      : cleaned.padEnd(6, "0").slice(0, 6);
  const num = Number.parseInt(normalized, 16);
  if (Number.isNaN(num)) return { r: 0, g: 0, b: 0 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHexToRgb(hex);
  const toLinear = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 명암비를 소수 둘째 자리까지 계산한다 (1.0 ~ 21.0). */
export function computeWcagContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
}

/** 망고보드 `share_popup.js`(777/774/770) 권한 모델과 어도비 익스프레스 브랜드 잠금 가드레일을 통합 검증한다. */
export function evaluateBrandGuardrailCompliance(
  input: BrandGuardrailAuditInput,
): BrandGuardrailAuditResult {
  const { policy, collaboratorRole } = input;
  let canView: boolean;
  let canEdit: boolean;
  let permissionLabel: string;

  if (policy.permissionFlag === "777") {
    canView = true;
    canEdit = collaboratorRole === "owner" || collaboratorRole === "team-member";
    permissionLabel = "777 · 모든 팀원 보기 및 편집 가능 (게스트는 보기 전용)";
  } else if (policy.permissionFlag === "774") {
    canView = collaboratorRole === "owner" || collaboratorRole === "team-member";
    canEdit = collaboratorRole === "owner";
    permissionLabel = "774 · 모든 팀원 보기 가능, 대표 작가(Owner)만 편집 가능";
  } else {
    canView = collaboratorRole === "owner";
    canEdit = collaboratorRole === "owner";
    permissionLabel = "770 · 대표 작가(Owner)만 보기 및 편집 가능";
  }

  const violations: string[] = [];
  if (!canEdit) {
    violations.push(`현재 역할(${collaboratorRole})은 권한 플래그(${policy.permissionFlag})에 의해 편집이 제한됩니다.`);
  }
  if (policy.lockTitleLogoPosition && input.titleLogoMoved) {
    violations.push("시리즈 타이틀 로고 위치가 브랜드 잠금(Locked Element)으로 고정되어 이동할 수 없습니다.");
  }
  if (policy.requireAgeRatingBadge && !input.hasAgeRatingBadge) {
    violations.push("연령 등급 배지(ALL/12+/15+/19+) 필수 표시 가드레일이 누락되었습니다.");
  }
  if (policy.requireCopyrightNotice && !input.hasCopyrightNotice) {
    violations.push("하단 공식 저작권 표기(Copyright Notice) 필수 레이어가 누락되었습니다.");
  }
  if (policy.enforceBrandPaletteOnly && policy.allowedPaletteHexes.length > 0) {
    const allowedSet = new Set(policy.allowedPaletteHexes.map((hex) => hex.toUpperCase()));
    const unauthorized = input.usedColorsHex.filter((hex) => !allowedSet.has(hex.toUpperCase()));
    if (unauthorized.length > 0) {
      violations.push(`브랜드 키트 미승인 컬러(${unauthorized.join(", ")})가 사용되었습니다.`);
    }
  }

  return { canView, canEdit, compliant: violations.length === 0, permissionLabel, violations };
}

function interpolateTemplateSlot(pattern: string, row: BulkEpisodeRow, seriesTitle: string): string {
  return pattern
    .replace(/\{\{\s*seriesTitle\s*\}\}/gu, seriesTitle)
    .replace(/\{\{\s*episodeNumber\s*\}\}/gu, String(row.episodeNumber))
    .replace(/\{\{\s*episodePad\s*\}\}/gu, String(row.episodeNumber).padStart(2, "0"))
    .replace(/\{\{\s*episodeTitle\s*\}\}/gu, row.episodeTitle)
    .replace(/\{\{\s*hookCopy\s*\}\}/gu, row.hookCopy)
    .replace(/\{\{\s*releaseDate\s*\}\}/gu, row.releaseDate)
    .replace(/\{\{\s*featuredCharacter\s*\}\}/gu, row.featuredCharacter)
    .replace(/\{\{\s*ageRating\s*\}\}/gu, row.ageRating);
}

/** 캔바(Canva) Bulk Create + Polotno 멀티페이지 JSON 스키마 방식으로 다중 회차 홍보 카드를 일괄 생성한다. */
export function generateBulkEpisodeArtifacts(
  config: BulkEpisodeTemplateConfig,
  rows: readonly BulkEpisodeRow[],
): BulkEpisodeGenerationResult {
  const format = getDesignPlatformFormatPreset(config.formatId);
  const stylePack = getStyleShufflePack(config.stylePackId);
  const pad = format.safePaddingPx;

  const cards: BulkEpisodeGeneratedCard[] = rows.map((row) => {
    const resolvedTitle = interpolateTemplateSlot(config.titlePattern, row, config.seriesTitle);
    const resolvedSubtitle = interpolateTemplateSlot(config.subtitlePattern, row, config.seriesTitle);
    const resolvedHook = interpolateTemplateSlot(config.hookPattern, row, config.seriesTitle);

    const children: PolotnoCompatibleElementNode[] = [
      {
        id: `ep-${row.episodeNumber}-badge`,
        type: "figure",
        name: "age-rating-badge",
        x: format.widthPx - pad - 72,
        y: pad,
        width: 72,
        height: 36,
        fill: stylePack.palette.accentPrimary,
        stroke: stylePack.palette.primaryText,
        strokeWidth: 2,
        locked: true,
      },
      {
        id: `ep-${row.episodeNumber}-title`,
        type: "text",
        name: "series-episode-title",
        x: pad,
        y: pad + 16,
        width: format.widthPx - pad * 2,
        height: 84,
        text: resolvedTitle,
        fontSize: Math.max(format.minReadableFontPx + 10, 32),
        fontFamily: stylePack.typography.displayFont,
        fill: stylePack.palette.primaryText,
        locked: true,
      },
      {
        id: `ep-${row.episodeNumber}-subtitle`,
        type: "text",
        name: "episode-subtitle",
        x: pad,
        y: pad + 112,
        width: format.widthPx - pad * 2,
        height: 48,
        text: resolvedSubtitle,
        fontSize: Math.max(format.minReadableFontPx + 4, 22),
        fontFamily: stylePack.typography.bodyFont,
        fill: stylePack.palette.secondaryText,
      },
      {
        id: `ep-${row.episodeNumber}-hook-balloon`,
        type: "figure",
        name: "hook-speech-balloon",
        x: pad,
        y: Math.max(pad + 180, format.heightPx - pad - 156),
        width: format.widthPx - pad * 2,
        height: 96,
        text: resolvedHook,
        fontSize: format.minReadableFontPx + 2,
        fontFamily: stylePack.typography.bodyFont,
        fill: stylePack.palette.balloonFill,
        stroke: stylePack.palette.balloonStroke,
        strokeWidth: stylePack.borderStrokeWidthPx,
      },
      {
        id: `ep-${row.episodeNumber}-copyright`,
        type: "text",
        name: "copyright-notice",
        x: pad,
        y: format.heightPx - pad - 28,
        width: format.widthPx - pad * 2,
        height: 24,
        text: config.copyrightLine,
        fontSize: format.minReadableFontPx,
        fontFamily: stylePack.typography.bodyFont,
        fill: stylePack.palette.secondaryText,
        locked: true,
      },
    ];

    const pageNode: PolotnoCompatiblePageNode = {
      id: `page-ep-${String(row.episodeNumber).padStart(2, "0")}`,
      name: `EP.${String(row.episodeNumber).padStart(2, "0")} ${row.episodeTitle}`,
      width: format.widthPx,
      height: format.heightPx,
      bleed: Math.round((format.bleedMm / 25.4) * format.dpi),
      background: stylePack.palette.canvasBg,
      children,
    };

    return {
      episodeNumber: row.episodeNumber,
      resolvedTitle,
      resolvedSubtitle,
      resolvedHook,
      releaseDate: row.releaseDate,
      featuredCharacter: row.featuredCharacter,
      ageRating: row.ageRating,
      suggestedFileName: `${config.formatId}_ep${String(row.episodeNumber).padStart(2, "0")}_${row.releaseDate}.png`,
      pageNode,
    };
  });

  return {
    totalGenerated: cards.length,
    formatId: config.formatId,
    stylePack,
    cards,
    polotnoDocument: {
      schemaVersion: "2026-10-26",
      width: format.widthPx,
      height: format.heightPx,
      unit: "px",
      dpi: format.dpi,
      pages: cards.map((card) => card.pageNode),
    },
  };
}

/** 키틀(Kittl) · 미리캔버스(MiriCanvas) 방식 굿즈 목업 인쇄 픽셀 및 칼선(Die-cut) 명세를 계산한다. */
export function buildGoodsMockupSpec(presetId: GoodsMockupPresetId): GoodsMockupComputedSpec {
  const preset = DESIGN_PLATFORM_GOODS_MOCKUPS.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error(`지원하지 않는 굿즈 목업 프리셋 ID입니다: ${presetId}`);
  }
  const mmToPx = (mm: number): number => Math.round((mm / 25.4) * preset.recommendedDpi);
  const totalWidthMm = preset.trimWidthMm + preset.bleedMm * 2;
  const totalHeightMm = preset.trimHeightMm + preset.bleedMm * 2;
  const safeInsetMm = Math.max(3, preset.dieCutMarginMm + 2);

  return {
    preset,
    exportWidthPx: mmToPx(totalWidthMm),
    exportHeightPx: mmToPx(totalHeightMm),
    safeContentWidthPx: mmToPx(Math.max(10, preset.trimWidthMm - safeInsetMm * 2)),
    safeContentHeightPx: mmToPx(Math.max(10, preset.trimHeightMm - safeInsetMm * 2)),
    dieCutOffsetPx: mmToPx(preset.dieCutMarginMm),
    whiteUnderbaseLayerName: preset.requiresWhiteUnderbase ? "WHITE_UNDERBASE_MASK" : null,
  };
}

/** VistaCreate · 미리캔버스 · 캔바 인쇄/출고 프리플라이트 및 상업 라이선스 전수 감사기. */
export function auditDesignPlatformPreflight(
  input: DesignPreflightAuditInput,
): DesignPreflightAuditReport {
  const format = getDesignPlatformFormatPreset(input.formatId);
  const wcagContrastRatio = computeWcagContrastRatio(input.foregroundHex, input.backgroundHex);
  const checks: DesignPreflightCheckItem[] = [];
  const remediations: string[] = [];
  let score = 100;

  const recordCheck = (
    id: string,
    label: string,
    status: "pass" | "warning" | "fail",
    detail: string,
    penalty = 0,
    remediation?: string,
  ) => {
    checks.push({ id, label, status, detail });
    score -= penalty;
    if (remediation) remediations.push(remediation);
  };

  if (input.actualDpi < format.dpi) {
    recordCheck(
      "dpi-check",
      "출력 해상도 (DPI)",
      format.dpi >= 300 ? "fail" : "warning",
      `현재 ${input.actualDpi} DPI (권장 ${format.dpi} DPI)`,
      format.dpi >= 300 ? 30 : 12,
      `출력 해상도를 ${format.dpi} DPI 이상으로 상향하세요.`,
    );
  } else {
    recordCheck("dpi-check", "출력 해상도 (DPI)", "pass", `${input.actualDpi} DPI 충족 (권장 ${format.dpi} DPI)`);
  }

  if (input.actualColorSpace !== format.colorSpace) {
    recordCheck(
      "colorspace-check",
      "컬러 프로파일",
      format.colorSpace === "CMYK" ? "fail" : "warning",
      `현재 ${input.actualColorSpace} (규격 요구: ${format.colorSpace})`,
      format.colorSpace === "CMYK" ? 25 : 10,
      `컬러 프로파일을 ${format.colorSpace}로 변환하여 색상 왜곡을 방지하세요.`,
    );
  } else {
    recordCheck("colorspace-check", "컬러 프로파일", "pass", `${input.actualColorSpace} 프로파일 일치`);
  }

  if (input.actualBleedMm < format.bleedMm) {
    recordCheck(
      "bleed-check",
      "재단 도련(Bleed)",
      "fail",
      `현재 ${input.actualBleedMm}mm (인쇄 최소 ${format.bleedMm}mm 필요)`,
      25,
      `인쇄 재단 오차 방지를 위해 사방 ${format.bleedMm}mm 도련(Bleed)을 추가하세요.`,
    );
  } else {
    recordCheck("bleed-check", "재단 도련(Bleed)", "pass", `도련 ${input.actualBleedMm}mm 확보 완료`);
  }

  if (input.hasUnlicensedExternalFont) {
    recordCheck(
      "font-license-check",
      "상업용 폰트 임베딩 라이선스",
      "fail",
      "외부 미검증 폰트가 포함되어 유통·굿즈 판매 시 저작권 분쟁 위험이 있습니다.",
      35,
      "툰스튜디오 상업용 인증 폰트(Pretendard, 마루부리, 나눔명조 등)로 치환하거나 윤곽선(Outline)으로 변환하세요.",
    );
  } else {
    recordCheck("font-license-check", "상업용 폰트 임베딩 라이선스", "pass", "모든 텍스트 레이어가 상업적 배포 허용(OFL/인증) 폰트입니다.");
  }

  if (input.hasDraftWatermark) {
    recordCheck(
      "watermark-check",
      "임시 시안 워터마크 잔류",
      "fail",
      "캔버스에 DRAFT 워터마크 또는 저해상도 플레이스홀더가 남아 있습니다.",
      30,
      "출고 전 임시 워터마크 레이어를 제거하고 최종 승인 원화로 교체하세요.",
    );
  } else {
    recordCheck("watermark-check", "임시 시안 워터마크 잔류", "pass", "워터마크 없는 클린 마스터 상태입니다.");
  }

  if (wcagContrastRatio < 4.5) {
    recordCheck(
      "contrast-check",
      "텍스트 명암비 (WCAG AA)",
      wcagContrastRatio < 3.0 ? "fail" : "warning",
      `명암비 ${wcagContrastRatio}:1 (권장 4.5:1 이상)`,
      wcagContrastRatio < 3.0 ? 20 : 10,
      "모바일 썸네일 가독성을 위해 텍스트-배경 명암비를 4.5:1 이상으로 높이거나 외곽선(Stroke)을 추가하세요.",
    );
  } else {
    recordCheck("contrast-check", "텍스트 명암비 (WCAG AA)", "pass", `명암비 ${wcagContrastRatio}:1 (WCAG 2.1 AA 충족)`);
  }

  if (input.safeZoneClippedLayerCount > 0) {
    recordCheck(
      "safezone-check",
      "안전 영역(Safe Zone) 준수",
      "warning",
      `${input.safeZoneClippedLayerCount}개 레이어가 플랫폼 UI 가림 위험 영역에 걸쳐 있습니다.`,
      10,
      `Magic Switch 안전 영역(${format.safePaddingPx}px 인셋) 안쪽으로 대사·로고를 재배치하세요.`,
    );
  } else {
    recordCheck("safezone-check", "안전 영역(Safe Zone) 준수", "pass", `전 레이어 안전 영역(${format.safePaddingPx}px) 내부 배치 완료`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const hasFail = checks.some((check) => check.status === "fail");
  const hasWarning = checks.some((check) => check.status === "warning");

  return {
    overallStatus: hasFail ? "blocked" : hasWarning ? "warning" : "ready",
    score: finalScore,
    wcagContrastRatio,
    checks,
    remediations,
  };
}
