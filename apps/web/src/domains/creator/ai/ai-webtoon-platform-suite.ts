/**
 * ai-webtoon-platform-suite.ts
 *
 * AI 만화·인스타툰 제작 4대 플랫폼 REA 역공학 내재화 및 고도화 엔진:
 * 1. 젠툰 (GenToon, https://www.gentoon.ai/) — `ev_7abd2720a7057df1cb1372e89999ee9c5d3e3d1519694d7c6afca7cad06e9195`
 *    - 9종 AI 모델·크레딧·단가 카탈로그 (module 88698 / 50342)
 *    - 스토리 기반 캐릭터 일관성 유지 4컷/인스타툰/웹툰 자동 분할 및 말풍선 배치
 *    - 1080×1920 30fps 숏폼 릴스(Short-Form Reel) 타임라인 합성기 (module 65576)
 *    - 6분할 스티커 시트(`sheet`)·양면 머그컵(`mug_twin`) 굿즈 인쇄 레이아웃 및 DPI 선명도 판정기 (module 71184)
 * 2. 망고툰 (Mangotoon) / 3. 라마젠 (LlamaGen AI) / 4. 투닝 (Tooning) — `./ai-webtoon-mangotoon-llamagen-suite`
 */

export {
  MANGOTOON_CHARACTER_PRESETS,
  MANGOTOON_LIBRARY_TABS,
  buildLlamaGenComicV2EpisodeSequence,
  createMangotoonContentPayload,
  recommendTooningCutFromSentence,
  type LlamaGenComicV2EpisodeSequence,
  type LlamaGenComicV2PanelSpec,
  type LlamaGenLayoutModeId,
  type LlamaGenPanelGeometry,
  type LlamaGenPathVertex,
  type MangotoonCharacterAssetPreset,
  type MangotoonCharacterGenderBadge,
  type MangotoonLibraryTabId,
  type MangotoonLibraryTabSpec,
  type MangotoonPageCategoryId,
  type MangotoonPictureContentData,
  type MangotoonPictureFilterState,
  type MangotoonTitleCategoryId,
  type TooningSentenceRecommendation,
} from "./ai-webtoon-mangotoon-llamagen-suite";

// ============================================================================
// 1. 젠툰 (GenToon) AI 모델·크레딧·숏폼 릴스·굿즈 프린트 엔진
// ============================================================================

export type GenToonAiModelId =
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview"
  | "gemini-3.5-flash"
  | "gemini-3-flash-preview"
  | "gpt-image-2.5-sunburst-medium"
  | "gpt-image-2.5-sunburst-low"
  | "gpt-image-2.5-sunburst-high"
  | "gpt-image-2-medium"
  | "gpt-image-2-low";

export type GenToonTierId = "FREE" | "LITE" | "STARTER" | "PRO" | "PREMIUM" | "ADMIN";

export type GenToonCreationMode = "instatoon" | "webtoon" | "manga" | "cartoon";

export interface GenToonAiModelSpec {
  readonly id: GenToonAiModelId;
  readonly label: string;
  readonly badge: string;
  readonly credits: number;
  readonly costUsd: number;
  readonly tier: "standard" | "pro" | "text";
  readonly recommendedAspectRatio: "1:1" | "4:5" | "2:3" | "9:16" | "text";
}

export const GENTOON_AI_MODEL_CATALOG: readonly GenToonAiModelSpec[] = [
  {
    id: "gemini-3.1-flash-image-preview",
    label: "나노바나나2 (Gemini 3.1 Flash Image)",
    badge: "기본 · 가성비",
    credits: 13,
    costUsd: 0.045,
    tier: "standard",
    recommendedAspectRatio: "4:5",
  },
  {
    id: "gemini-3-pro-image-preview",
    label: "나노바나나 프로 (Gemini 3 Pro Image)",
    badge: "고품질 · 디테일",
    credits: 25,
    costUsd: 0.134,
    tier: "pro",
    recommendedAspectRatio: "4:5",
  },
  {
    id: "gemini-3.5-flash",
    label: "스토리 도우미 (Gemini 3.5 Flash)",
    badge: "스토리",
    credits: 1,
    costUsd: 0.003,
    tier: "text",
    recommendedAspectRatio: "text",
  },
  {
    id: "gemini-3-flash-preview",
    label: "빠른 응답 (Gemini 3 Flash Preview)",
    badge: "경량",
    credits: 1,
    costUsd: 0.001,
    tier: "text",
    recommendedAspectRatio: "text",
  },
  {
    id: "gpt-image-2.5-sunburst-medium",
    label: "선버스트 미디엄 (GPT Image 2.5 Medium)",
    badge: "프리미엄 · 한국어 특화",
    credits: 25,
    costUsd: 0.05,
    tier: "pro",
    recommendedAspectRatio: "4:5",
  },
  {
    id: "gpt-image-2.5-sunburst-low",
    label: "선버스트 라이트 (GPT Image 2.5 Low)",
    badge: "경량 · 한국어",
    credits: 13,
    costUsd: 0.04,
    tier: "standard",
    recommendedAspectRatio: "1:1",
  },
  {
    id: "gpt-image-2.5-sunburst-high",
    label: "선버스트 하이 (GPT Image 2.5 High)",
    badge: "최고 품질 · 한국어",
    credits: 25,
    costUsd: 0.1,
    tier: "pro",
    recommendedAspectRatio: "4:5",
  },
  {
    id: "gpt-image-2-medium",
    label: "GPT Image 2 미디엄",
    badge: "GPT 2:3 · 웹툰",
    credits: 25,
    costUsd: 0.1,
    tier: "pro",
    recommendedAspectRatio: "2:3",
  },
  {
    id: "gpt-image-2-low",
    label: "GPT Image 2 라이트",
    badge: "GPT 2:3 · 인스타툰",
    credits: 13,
    costUsd: 0.04,
    tier: "standard",
    recommendedAspectRatio: "2:3",
  },
] as const;

export const GENTOON_TIER_CREDITS: Readonly<Record<GenToonTierId, number>> = {
  FREE: 150,
  LITE: 1000,
  STARTER: 2000,
  PRO: 5000,
  PREMIUM: 27000,
  ADMIN: 9999999,
};

export const GENTOON_ACTION_CREDIT_RULES = {
  CHARACTER_CREATE: 100,
  STORY_GENERATE: 1,
  MAX_STORY_CUTS: 30,
  REEL_EXPORT_PER_4_CUTS: 20,
  REEL_MIN_CUTS: 4,
  REEL_MAX_CUTS: 12,
  FREE_MAX_CHARACTERS: 10,
  PRO_MAX_CHARACTERS: 100,
} as const;

/**
 * GenToon 모듈 88698 / 50342 규칙에 따른 생성·릴스·캐릭터 크레딧 비용 산출기.
 */
export function estimateGenToonCreditCost(params: {
  readonly mode: GenToonCreationMode;
  readonly cutCount: number;
  readonly hasFreeDailyQuota?: boolean;
  readonly includeStoryScript?: boolean;
  readonly newCharacterCount?: number;
  readonly includeReelExport?: boolean;
}): {
  readonly perCutCredits: number;
  readonly cutGenerationCredits: number;
  readonly storyScriptCredits: number;
  readonly characterCreationCredits: number;
  readonly reelExportCredits: number;
  readonly totalCredits: number;
} {
  const clampedCuts = Math.max(
    1,
    Math.min(GENTOON_ACTION_CREDIT_RULES.MAX_STORY_CUTS, Math.round(params.cutCount)),
  );
  const isProMode = params.mode === "manga" || params.mode === "cartoon";
  const basePerCut = isProMode ? 25 : 13;
  const perCutCredits = !isProMode && params.hasFreeDailyQuota ? 0 : basePerCut;
  const cutGenerationCredits = perCutCredits * clampedCuts;
  const storyScriptCredits = params.includeStoryScript
    ? GENTOON_ACTION_CREDIT_RULES.STORY_GENERATE
    : 0;
  const characterCreationCredits =
    Math.max(0, Math.round(params.newCharacterCount ?? 0)) *
    GENTOON_ACTION_CREDIT_RULES.CHARACTER_CREATE;

  let reelExportCredits = 0;
  if (params.includeReelExport) {
    const reelCuts = Math.max(
      GENTOON_ACTION_CREDIT_RULES.REEL_MIN_CUTS,
      Math.min(GENTOON_ACTION_CREDIT_RULES.REEL_MAX_CUTS, clampedCuts),
    );
    reelExportCredits =
      Math.ceil(reelCuts / 4) * GENTOON_ACTION_CREDIT_RULES.REEL_EXPORT_PER_4_CUTS;
  }

  return {
    perCutCredits,
    cutGenerationCredits,
    storyScriptCredits,
    characterCreationCredits,
    reelExportCredits,
    totalCredits:
      cutGenerationCredits + storyScriptCredits + characterCreationCredits + reelExportCredits,
  };
}

export type GenToonReelFilterId = "none" | "mono" | "sepia" | "vivid" | "dim";
export type GenToonReelTransitionId = "none" | "fade" | "slide";

export interface GenToonReelFilterPreset {
  readonly id: GenToonReelFilterId;
  readonly label: string;
  readonly cssFilter: string;
}

export const GENTOON_REEL_FILTER_PRESETS: readonly GenToonReelFilterPreset[] = [
  { id: "none", label: "원본", cssFilter: "none" },
  { id: "mono", label: "흑백", cssFilter: "grayscale(1)" },
  { id: "sepia", label: "세피아", cssFilter: "sepia(0.75) saturate(1.1)" },
  { id: "vivid", label: "선명", cssFilter: "saturate(1.45) contrast(1.08)" },
  { id: "dim", label: "차분", cssFilter: "brightness(0.72) saturate(0.9)" },
] as const;

export interface GenToonReelOverlayItem {
  readonly text: string;
  readonly x: number; // [0, 1]
  readonly y: number; // [0, 1]
  readonly scale: number; // [0.5, 2.5]
  readonly color: string;
}

export interface GenToonReelCutInput {
  readonly cutIndex: number;
  readonly dialogueText: string;
  readonly subCutCount?: number;
  readonly durationOverrideSec?: number;
  readonly zoomOverride?: number;
}

export interface GenToonReelSynthesizedCut {
  readonly cutIndex: number;
  readonly rawDurationSec: number;
  readonly scaledDurationSec: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly kenBurnsZoom: number;
}

export interface GenToonReelTimelineResult {
  readonly widthPx: 1080;
  readonly heightPx: 1920;
  readonly fps: 30;
  readonly tailSec: 0.5;
  readonly maxTotalDurationSec: 40.0;
  readonly filter: GenToonReelFilterPreset;
  readonly transition: GenToonReelTransitionId;
  readonly transitionDurationSec: number;
  readonly proportionalScaleFactor: number;
  readonly totalDurationSec: number;
  readonly totalFrames: number;
  readonly cuts: readonly GenToonReelSynthesizedCut[];
  readonly overlays: readonly GenToonReelOverlayItem[];
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * GenToon 모듈 65576(`calculateAutoCutDurationSec`) 공식:
 * `sec = clamp(1.2 + Math.max(0, dialogueChars) / 6.5 + 0.4 * (clamp(subCutCount, 1, 4) - 1), 1.6, 9.0)`
 */
export function calculateGenToonAutoCutDurationSec(
  dialogueText: string,
  subCutCount = 1,
): number {
  const charCount = Math.max(0, dialogueText.trim().length);
  const clampedSubCuts = clampNumber(Math.round(subCutCount), 1, 4);
  const raw = 1.2 + charCount / 6.5 + 0.4 * (clampedSubCuts - 1);
  return Math.round(clampNumber(raw, 1.6, 9.0) * 100) / 100;
}

/**
 * GenToon 모듈 65576 1080×1920 30fps 숏폼 릴스 비디오 타임라인 합성기.
 * 컷 합계가 39.5초를 초과하면 비례 축소(`p = 39.5 / total`)하여 꼬리 0.5초 포함 최대 40.0초를 보장한다.
 */
export function synthesizeGenToonShortFormReelTimeline(params: {
  readonly cuts: readonly GenToonReelCutInput[];
  readonly filterId?: GenToonReelFilterId;
  readonly transitionId?: GenToonReelTransitionId;
  readonly overlays?: readonly GenToonReelOverlayItem[];
}): GenToonReelTimelineResult {
  const fps = 30 as const;
  const tailSec = 0.5 as const;
  const maxCutsBudgetSec = 39.5;

  const filter =
    GENTOON_REEL_FILTER_PRESETS.find((f) => f.id === (params.filterId ?? "none")) ??
    GENTOON_REEL_FILTER_PRESETS[0]!;
  const transition: GenToonReelTransitionId = params.transitionId ?? "fade";
  const transitionDurationSec = transition === "none" ? 0 : 0.28;

  const rawDurations = params.cuts.map((cut) => {
    if (typeof cut.durationOverrideSec === "number" && Number.isFinite(cut.durationOverrideSec)) {
      return clampNumber(cut.durationOverrideSec, 0.8, 12.0);
    }
    return calculateGenToonAutoCutDurationSec(cut.dialogueText, cut.subCutCount ?? 1);
  });

  const rawSum = rawDurations.reduce((acc, v) => acc + v, 0);
  const scaleFactor = rawSum > maxCutsBudgetSec && rawSum > 0 ? maxCutsBudgetSec / rawSum : 1.0;

  let cursorSec = 0;
  const synthesizedCuts: GenToonReelSynthesizedCut[] = params.cuts.map((cut, idx) => {
    const rawDurationSec = rawDurations[idx] ?? 2.0;
    const scaledDurationSec = Math.max(0.5, Math.round(rawDurationSec * scaleFactor * 100) / 100);
    const startSec = Math.round(cursorSec * 100) / 100;
    const endSec = Math.round((cursorSec + scaledDurationSec) * 100) / 100;
    cursorSec = endSec;

    const defaultZoom = idx % 3 === 0 ? 1.06 : idx % 3 === 1 ? 1.0 : 1.04;
    const kenBurnsZoom =
      typeof cut.zoomOverride === "number" && Number.isFinite(cut.zoomOverride)
        ? clampNumber(cut.zoomOverride, 1.0, 1.3)
        : defaultZoom;

    return {
      cutIndex: cut.cutIndex,
      rawDurationSec,
      scaledDurationSec,
      startSec,
      endSec,
      startFrame: Math.round(startSec * fps),
      endFrame: Math.round(endSec * fps),
      kenBurnsZoom,
    };
  });

  const totalDurationSec = Math.min(40.0, Math.round((cursorSec + tailSec) * 100) / 100);
  const totalFrames = Math.round(totalDurationSec * fps);

  const sanitizedOverlays: GenToonReelOverlayItem[] = (params.overlays ?? [])
    .slice(0, 6)
    .map((ov) => ({
      text: ov.text.trim().slice(0, 60),
      x: clampNumber(ov.x, 0, 1),
      y: clampNumber(ov.y, 0, 1),
      scale: clampNumber(ov.scale, 0.5, 2.5),
      color: /^#[0-9a-fA-F]{6}$/u.test(ov.color) ? ov.color : "#ffffff",
    }))
    .filter((ov) => ov.text.length > 0);

  return {
    widthPx: 1080,
    heightPx: 1920,
    fps,
    tailSec,
    maxTotalDurationSec: 40.0,
    filter,
    transition,
    transitionDurationSec,
    proportionalScaleFactor: Math.round(scaleFactor * 1000) / 1000,
    totalDurationSec,
    totalFrames,
    cuts: synthesizedCuts,
    overlays: sanitizedOverlays,
  };
}

export type GenToonMerchLayoutMode = "single" | "sheet" | "mug_twin";
export type GenToonDpiSharpnessGrade = "sharp" | "ok" | "soft";

export interface GenToonNormalizedSlotRect {
  readonly slotIndex: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * GenToon 모듈 71184에서 확인된 6분할 스티커 시트(`sheet`) 정규화 슬롯 좌표.
 */
export const GENTOON_STICKER_SHEET_6_SLOTS: readonly GenToonNormalizedSlotRect[] = [
  { slotIndex: 0, x: 0.08, y: 0.04, w: 0.84, h: 0.46 },
  { slotIndex: 1, x: 0.05, y: 0.53, w: 0.42, h: 0.24 },
  { slotIndex: 2, x: 0.53, y: 0.53, w: 0.42, h: 0.24 },
  { slotIndex: 3, x: 0.06, y: 0.8, w: 0.26, h: 0.16 },
  { slotIndex: 4, x: 0.37, y: 0.8, w: 0.26, h: 0.16 },
  { slotIndex: 5, x: 0.68, y: 0.8, w: 0.26, h: 0.16 },
] as const;

export const GENTOON_MUG_TWIN_2_SLOTS: readonly GenToonNormalizedSlotRect[] = [
  { slotIndex: 0, x: 0.05, y: 0.12, w: 0.42, h: 0.76 },
  { slotIndex: 1, x: 0.53, y: 0.12, w: 0.42, h: 0.76 },
] as const;

export interface GenToonMerchPrintEvaluation {
  readonly layoutMode: GenToonMerchLayoutMode;
  readonly slots: readonly GenToonNormalizedSlotRect[];
  readonly effectiveDpi: number;
  readonly targetDpi: number;
  readonly dpiRatio: number;
  readonly sharpnessGrade: GenToonDpiSharpnessGrade;
  readonly sharpnessLabel: string;
  readonly bgColorHex: string;
  readonly bgRemoved: boolean;
}

/**
 * GenToon 모듈 71184 굿즈(스티커 시트·양면 머그컵·단품) 레이아웃 및 인쇄 DPI 선명도 판정기.
 */
export function evaluateGenToonMerchPrintLayout(params: {
  readonly layoutMode: GenToonMerchLayoutMode;
  readonly sourceImageWidthPx: number;
  readonly printWidthInches: number;
  readonly targetDpi?: number;
  readonly placementScale?: number;
  readonly bgColorHex?: string;
  readonly bgRemoved?: boolean;
}): GenToonMerchPrintEvaluation {
  const targetDpi = Math.max(72, params.targetDpi ?? 300);
  const scale = clampNumber(params.placementScale ?? 0.85, 0.25, 2.0);
  const effectivePrintInches = Math.max(0.5, params.printWidthInches * scale);
  const effectiveDpi = Math.round(Math.max(1, params.sourceImageWidthPx) / effectivePrintInches);
  const dpiRatio = Math.round((effectiveDpi / targetDpi) * 100) / 100;

  let sharpnessGrade: GenToonDpiSharpnessGrade = "soft";
  let sharpnessLabel = "인쇄 시 흐릿할 수 있음 (고해상도 업스케일 권장)";
  if (dpiRatio >= 0.8) {
    sharpnessGrade = "sharp";
    sharpnessLabel = "인쇄 선명도 우수 (300 DPI 기준 충족)";
  } else if (dpiRatio >= 0.5) {
    sharpnessGrade = "ok";
    sharpnessLabel = "일반 소품 인쇄 가능 (양호)";
  }

  const slots: readonly GenToonNormalizedSlotRect[] =
    params.layoutMode === "sheet"
      ? GENTOON_STICKER_SHEET_6_SLOTS
      : params.layoutMode === "mug_twin"
        ? GENTOON_MUG_TWIN_2_SLOTS
        : [
            {
              slotIndex: 0,
              x: Math.round(((1 - scale) / 2) * 100) / 100,
              y: Math.round(((1 - scale) / 2) * 100) / 100,
              w: scale,
              h: scale,
            },
          ];

  const bgColorHex =
    typeof params.bgColorHex === "string" && /^#[0-9a-fA-F]{6}$/u.test(params.bgColorHex)
      ? params.bgColorHex
      : "#ffffff";

  return {
    layoutMode: params.layoutMode,
    slots,
    effectiveDpi,
    targetDpi,
    dpiRatio,
    sharpnessGrade,
    sharpnessLabel,
    bgColorHex,
    bgRemoved: Boolean(params.bgRemoved),
  };
}
