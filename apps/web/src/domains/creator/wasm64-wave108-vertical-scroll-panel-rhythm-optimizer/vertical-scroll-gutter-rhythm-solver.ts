/**
 * Wave 108 — 세로 스크롤 웹툰 컷 리듬·여백(Gutter) 감정 연출 및 반전 스포일러 차단 솔버.
 *
 * 모바일 세로 스크롤 웹툰의 6종 감정 비트에 맞춰 컷 높이와 여백, 여백 그라데이션을
 * 결정론적으로 배치하고, 반전(`twist-reveal`)·엔딩(`cliffhanger-end`) 컷 앞에서는
 * 모바일 3종 뷰포트(`360×780`, `390×844`, `412×915`) 전부에서 `twistSpoilerLeakPx === 0`이
 * 성립하도록 사전 여백 하한을 해석적으로 산출한다.
 */

export type PanelRhythmBeatKind =
  | "dialogue-volley"
  | "action-rush"
  | "suspense-hold"
  | "twist-reveal"
  | "quiet-aftermath"
  | "cliffhanger-end";

export type MobileViewportProfile =
  | "mobile-360x780"
  | "mobile-390x844"
  | "mobile-412x915";

export type GutterGradientStyle =
  | "clean-white"
  | "fade-to-dark"
  | "tension-black"
  | "memory-soft-tint";

export type PanelMoodTone = "bright" | "neutral" | "dark" | "memory";

export interface MobileViewportSpec {
  readonly profile: MobileViewportProfile;
  readonly labelKo: string;
  readonly cssWidthPx: number;
  readonly cssHeightPx: number;
  readonly aspectRatioHeightOverWidth: number;
}

export const DEFAULT_CANVAS_WIDTH_PX = 800;
export const DEFAULT_TOP_MARGIN_PX = 140;
export const DEFAULT_BOTTOM_MARGIN_PX = 220;
export const DEFAULT_ANTI_SPOILER_SAFETY_MARGIN_PX = 24;
export const DEFAULT_MAX_DIALOGUE_CHARS_PER_VIEWPORT = 120;
export const DEFAULT_MIN_CUT_HEIGHT_PX = 320;
export const DEFAULT_MAX_CUT_HEIGHT_PX = 1800;

export const DEFAULT_MOBILE_VIEWPORT_PROFILES: readonly MobileViewportProfile[] = [
  "mobile-360x780",
  "mobile-390x844",
  "mobile-412x915",
];

export const MOBILE_VIEWPORT_SPECS: Readonly<Record<MobileViewportProfile, MobileViewportSpec>> = {
  "mobile-360x780": {
    profile: "mobile-360x780", labelKo: "소형 안드로이드 (360×780)",
    cssWidthPx: 360, cssHeightPx: 780, aspectRatioHeightOverWidth: 780 / 360,
  },
  "mobile-390x844": {
    profile: "mobile-390x844", labelKo: "아이폰 표준 (390×844)",
    cssWidthPx: 390, cssHeightPx: 844, aspectRatioHeightOverWidth: 844 / 390,
  },
  "mobile-412x915": {
    profile: "mobile-412x915", labelKo: "대화형 안드로이드 (412×915)",
    cssWidthPx: 412, cssHeightPx: 915, aspectRatioHeightOverWidth: 915 / 412,
  },
};

export interface BeatRhythmPreset {
  readonly beatKind: PanelRhythmBeatKind;
  readonly labelKo: string;
  readonly baseHeightPx: number;
  readonly intensityHeightSpanPx: number;
  readonly baseGutterBeforePx: number;
  readonly intensityGutterDeltaPx: number;
  readonly minGutterBeforePx: number;
  readonly maxGutterBeforePx: number;
  readonly autoIsolateFromPreviousViewport: boolean;
}

export const BEAT_RHYTHM_PRESETS: Readonly<Record<PanelRhythmBeatKind, BeatRhythmPreset>> = {
  "action-rush": {
    beatKind: "action-rush", labelKo: "액션 질주",
    baseHeightPx: 1080, intensityHeightSpanPx: 220,
    baseGutterBeforePx: 56, intensityGutterDeltaPx: -12, minGutterBeforePx: 40, maxGutterBeforePx: 84,
    autoIsolateFromPreviousViewport: false,
  },
  "dialogue-volley": {
    beatKind: "dialogue-volley", labelKo: "대사 티키타카",
    baseHeightPx: 560, intensityHeightSpanPx: 70,
    baseGutterBeforePx: 102, intensityGutterDeltaPx: -12, minGutterBeforePx: 80, maxGutterBeforePx: 156,
    autoIsolateFromPreviousViewport: false,
  },
  "suspense-hold": {
    beatKind: "suspense-hold", labelKo: "긴장 정적",
    baseHeightPx: 740, intensityHeightSpanPx: 120,
    baseGutterBeforePx: 340, intensityGutterDeltaPx: 80, minGutterBeforePx: 280, maxGutterBeforePx: 520,
    autoIsolateFromPreviousViewport: false,
  },
  "twist-reveal": {
    beatKind: "twist-reveal", labelKo: "반전 공개",
    baseHeightPx: 1120, intensityHeightSpanPx: 220,
    baseGutterBeforePx: 480, intensityGutterDeltaPx: 90, minGutterBeforePx: 440, maxGutterBeforePx: 2600,
    autoIsolateFromPreviousViewport: true,
  },
  "quiet-aftermath": {
    beatKind: "quiet-aftermath", labelKo: "여운·정적",
    baseHeightPx: 820, intensityHeightSpanPx: 90,
    baseGutterBeforePx: 370, intensityGutterDeltaPx: 70, minGutterBeforePx: 300, maxGutterBeforePx: 560,
    autoIsolateFromPreviousViewport: false,
  },
  "cliffhanger-end": {
    beatKind: "cliffhanger-end", labelKo: "엔딩 절단",
    baseHeightPx: 1180, intensityHeightSpanPx: 240,
    baseGutterBeforePx: 520, intensityGutterDeltaPx: 100, minGutterBeforePx: 480, maxGutterBeforePx: 2800,
    autoIsolateFromPreviousViewport: true,
  },
};

export interface VerticalScrollCutInput {
  readonly cutId: string;
  readonly title?: string;
  readonly beatKind: PanelRhythmBeatKind;
  readonly preferredHeightPx?: number;
  readonly dialogueText?: string;
  readonly dialogueCharCount?: number;
  readonly speechBubbleCount?: number;
  readonly moodTone?: PanelMoodTone;
  readonly isolateFromPreviousViewport?: boolean;
  readonly preferredGutterGradient?: GutterGradientStyle;
  readonly intensity?: number;
}

export interface ManualVerticalScrollCutInput extends VerticalScrollCutInput {
  readonly heightPx: number;
  readonly gutterBeforePx: number;
  readonly gutterGradientStyle?: GutterGradientStyle;
}

export interface OptimizeVerticalScrollOptions {
  readonly episodeId?: string;
  readonly episodeTitle?: string;
  readonly canvasWidthPx?: number;
  readonly targetViewports?: readonly MobileViewportProfile[];
  readonly topMarginPx?: number;
  readonly bottomMarginPx?: number;
  readonly antiSpoilerSafetyMarginPx?: number;
  readonly minCutHeightPx?: number;
  readonly maxCutHeightPx?: number;
  readonly maxDialogueCharsPerViewport?: number;
  readonly breakMonotonyAutomatically?: boolean;
}

export interface AntiSpoilerIsolationMetrics {
  readonly isIsolatedReveal: boolean;
  readonly twistSpoilerLeakPx: number;
  readonly requiredMinPreGutterPx: number;
  readonly appliedPreGutterPx: number;
  readonly viewportClearancesPx: Readonly<Record<MobileViewportProfile, number>>;
}

export interface OptimizedVerticalScrollCut {
  readonly index: number;
  readonly cutId: string;
  readonly title: string;
  readonly beatKind: PanelRhythmBeatKind;
  readonly moodTone: PanelMoodTone;
  readonly intensity: number;
  readonly yPx: number;
  readonly heightPx: number;
  readonly bottomYPx: number;
  readonly gutterBeforePx: number;
  readonly gutterAfterPx: number;
  readonly gutterGradientStyle: GutterGradientStyle;
  readonly dialogueCharCount: number;
  readonly speechBubbleCount: number;
  readonly isolateFromPreviousViewport: boolean;
  readonly antiSpoiler: AntiSpoilerIsolationMetrics;
}

export interface VerticalScrollPanelLayout {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly canvasWidthPx: number;
  readonly targetViewports: readonly MobileViewportProfile[];
  readonly topMarginPx: number;
  readonly bottomMarginPx: number;
  readonly totalHeightPx: number;
  readonly cuts: readonly OptimizedVerticalScrollCut[];
  readonly maxTwistSpoilerLeakPx: number;
  readonly spoilerProtectedCutIndices: readonly number[];
  readonly monotonyAdjustedCutIndices: readonly number[];
}

type PlacedCutDraft = Omit<OptimizedVerticalScrollCut, "gutterAfterPx">;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sanitizePositiveInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.round(clamp(value, min, max));
}

export function normalizeTargetViewports(
  viewports?: readonly MobileViewportProfile[],
): readonly MobileViewportProfile[] {
  if (!viewports || viewports.length === 0) return DEFAULT_MOBILE_VIEWPORT_PROFILES;
  const seen = new Set<MobileViewportProfile>();
  const ordered: MobileViewportProfile[] = [];
  for (let i = 0; i < viewports.length; i += 1) {
    const profile = viewports[i];
    if (profile && profile in MOBILE_VIEWPORT_SPECS && !seen.has(profile)) {
      seen.add(profile);
      ordered.push(profile);
    }
  }
  return ordered.length > 0 ? ordered : DEFAULT_MOBILE_VIEWPORT_PROFILES;
}

export function computeScaledViewportHeightPx(
  canvasWidthPx: number,
  profile: MobileViewportProfile,
): number {
  const safeWidth = sanitizePositiveInt(canvasWidthPx, DEFAULT_CANVAS_WIDTH_PX, 240, 4096);
  const spec = MOBILE_VIEWPORT_SPECS[profile];
  return (safeWidth * spec.cssHeightPx) / spec.cssWidthPx;
}

export function computeSetupCenteredViewportBounds(
  setupCutYPx: number,
  setupCutHeightPx: number,
  viewportHeightCanvasPx: number,
): { readonly viewportTopYPx: number; readonly viewportBottomYPx: number } {
  const setupCenterY = setupCutYPx + setupCutHeightPx / 2;
  const viewportTopYPx = Math.max(0, setupCenterY - viewportHeightCanvasPx / 2);
  return { viewportTopYPx, viewportBottomYPx: viewportTopYPx + viewportHeightCanvasPx };
}

export function countDialogueChars(dialogueText?: string, explicitCount?: number): number {
  if (explicitCount !== undefined && Number.isFinite(explicitCount)) {
    return Math.max(0, Math.round(explicitCount));
  }
  return dialogueText ? dialogueText.replace(/\s+/g, "").length : 0;
}

function resolveSpeechBubbleCount(
  dialogueText: string | undefined,
  charCount: number,
  explicitCount: number | undefined,
): number {
  if (explicitCount !== undefined && Number.isFinite(explicitCount)) {
    return Math.max(0, Math.round(explicitCount));
  }
  if (charCount <= 0) return 0;
  if (dialogueText) {
    const lines = dialogueText.split(/\r?\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (lines.length > 1) return lines.length;
  }
  return Math.max(1, Math.ceil(charCount / 28));
}

export function shouldIsolateRevealCut(cut: {
  readonly beatKind: PanelRhythmBeatKind;
  readonly isolateFromPreviousViewport?: boolean;
}): boolean {
  return cut.isolateFromPreviousViewport === true || BEAT_RHYTHM_PRESETS[cut.beatKind].autoIsolateFromPreviousViewport;
}

export function selectGutterGradientStyle(
  beatKind: PanelRhythmBeatKind,
  moodTone: PanelMoodTone,
  prevMoodTone: PanelMoodTone | undefined,
  intensity: number,
  preferred?: GutterGradientStyle,
): GutterGradientStyle {
  if (preferred) return preferred;
  if (moodTone === "memory") return "memory-soft-tint";
  if (moodTone === "dark") {
    if (
      beatKind === "twist-reveal" ||
      beatKind === "cliffhanger-end" ||
      (beatKind === "suspense-hold" && (prevMoodTone === "dark" || intensity >= 0.72))
    ) {
      return "tension-black";
    }
    return "fade-to-dark";
  }
  if (prevMoodTone === "dark") return "fade-to-dark";
  if ((beatKind === "twist-reveal" || beatKind === "cliffhanger-end") && moodTone === "neutral" && intensity >= 0.6) {
    return "fade-to-dark";
  }
  return "clean-white";
}

function computeAntiSpoilerMetricsForPlacement(
  isIsolated: boolean,
  prevCut: { readonly yPx: number; readonly heightPx: number } | undefined,
  revealTopYPx: number,
  appliedPreGutterPx: number,
  canvasWidthPx: number,
  targetViewports: readonly MobileViewportProfile[],
): AntiSpoilerIsolationMetrics {
  const clearances: Record<MobileViewportProfile, number> = {
    "mobile-360x780": 0,
    "mobile-390x844": 0,
    "mobile-412x915": 0,
  };
  if (!isIsolated || !prevCut) {
    return {
      isIsolatedReveal: false,
      twistSpoilerLeakPx: 0,
      requiredMinPreGutterPx: 0,
      appliedPreGutterPx,
      viewportClearancesPx: clearances,
    };
  }

  const prevBottomY = prevCut.yPx + prevCut.heightPx;
  let maxLeakPx = 0;
  let requiredMinPreGutterPx = 0;

  for (let i = 0; i < DEFAULT_MOBILE_VIEWPORT_PROFILES.length; i += 1) {
    const profile = DEFAULT_MOBILE_VIEWPORT_PROFILES[i];
    if (!profile) continue;
    const vh = computeScaledViewportHeightPx(canvasWidthPx, profile);
    const bounds = computeSetupCenteredViewportBounds(prevCut.yPx, prevCut.heightPx, vh);
    clearances[profile] = round2(revealTopYPx - bounds.viewportBottomYPx);

    if (targetViewports.indexOf(profile) !== -1) {
      const leak = Math.max(0, round2(bounds.viewportBottomYPx - revealTopYPx));
      if (leak > maxLeakPx) maxLeakPx = leak;
      const minGutter = Math.max(0, Math.ceil(bounds.viewportBottomYPx - prevBottomY));
      if (minGutter > requiredMinPreGutterPx) requiredMinPreGutterPx = minGutter;
    }
  }

  return {
    isIsolatedReveal: true,
    twistSpoilerLeakPx: maxLeakPx,
    requiredMinPreGutterPx,
    appliedPreGutterPx,
    viewportClearancesPx: clearances,
  };
}

function computeRequiredAntiSpoilerPreGutterPx(
  prevCut: { readonly yPx: number; readonly heightPx: number },
  canvasWidthPx: number,
  targetViewports: readonly MobileViewportProfile[],
): number {
  const prevBottomY = prevCut.yPx + prevCut.heightPx;
  let required = 0;
  for (let i = 0; i < targetViewports.length; i += 1) {
    const profile = targetViewports[i];
    if (!profile) continue;
    const vh = computeScaledViewportHeightPx(canvasWidthPx, profile);
    const bounds = computeSetupCenteredViewportBounds(prevCut.yPx, prevCut.heightPx, vh);
    const needed = Math.max(0, Math.ceil(bounds.viewportBottomYPx - prevBottomY));
    if (needed > required) required = needed;
  }
  return required;
}

function isMonotonousTail(
  placed: readonly PlacedCutDraft[],
  candidateHeightPx: number,
  candidateGutterPx: number,
): boolean {
  if (placed.length < 3) return false;
  const start = placed.length - 3;
  let minH = candidateHeightPx;
  let maxH = candidateHeightPx;
  let sumH = candidateHeightPx;
  let minG = candidateGutterPx;
  let maxG = candidateGutterPx;
  let sumG = candidateGutterPx;

  for (let i = start; i < placed.length; i += 1) {
    const item = placed[i];
    if (!item) continue;
    if (item.heightPx < minH) minH = item.heightPx;
    if (item.heightPx > maxH) maxH = item.heightPx;
    sumH += item.heightPx;
    if (i > start) {
      if (item.gutterBeforePx < minG) minG = item.gutterBeforePx;
      if (item.gutterBeforePx > maxG) maxG = item.gutterBeforePx;
      sumG += item.gutterBeforePx;
    }
  }

  const heightVariance = (maxH - minH) / Math.max(1, sumH / 4);
  const gutterVariance = maxG === 0 ? 0 : (maxG - minG) / Math.max(1, sumG / 3);
  return heightVariance <= 0.085 && gutterVariance <= 0.105;
}

function buildPlacedCutDraft(
  index: number,
  input: VerticalScrollCutInput,
  prevRecord: PlacedCutDraft | undefined,
  yPx: number,
  heightPx: number,
  gutterBeforePx: number,
  gutterGradientStyle: GutterGradientStyle,
  canvasWidthPx: number,
  targetViewports: readonly MobileViewportProfile[],
): PlacedCutDraft {
  const preset = BEAT_RHYTHM_PRESETS[input.beatKind];
  const moodTone: PanelMoodTone = input.moodTone ?? "neutral";
  const intensity = clamp(input.intensity ?? 0.5, 0, 1);
  const dialogueCharCount = countDialogueChars(input.dialogueText, input.dialogueCharCount);
  const speechBubbleCount = resolveSpeechBubbleCount(input.dialogueText, dialogueCharCount, input.speechBubbleCount);
  const isolateFromPreviousViewport = shouldIsolateRevealCut(input);
  const antiSpoiler = computeAntiSpoilerMetricsForPlacement(
    isolateFromPreviousViewport && index > 0,
    prevRecord,
    yPx,
    gutterBeforePx,
    canvasWidthPx,
    targetViewports,
  );
  return {
    index,
    cutId: input.cutId.trim() || `cut-${index + 1}`,
    title: input.title?.trim() || `${preset.labelKo} #${index + 1}`,
    beatKind: input.beatKind,
    moodTone,
    intensity,
    yPx,
    heightPx,
    bottomYPx: yPx + heightPx,
    gutterBeforePx,
    gutterGradientStyle,
    dialogueCharCount,
    speechBubbleCount,
    isolateFromPreviousViewport,
    antiSpoiler,
  };
}

function finalizeLayout(
  rawPlaced: readonly PlacedCutDraft[],
  episodeId: string,
  episodeTitle: string,
  canvasWidthPx: number,
  targetViewports: readonly MobileViewportProfile[],
  topMarginPx: number,
  bottomMarginPx: number,
  cursorY: number,
  spoilerProtectedCutIndices: readonly number[],
  monotonyAdjustedCutIndices: readonly number[],
): VerticalScrollPanelLayout {
  let maxTwistSpoilerLeakPx = 0;
  const cuts: OptimizedVerticalScrollCut[] = [];
  for (let i = 0; i < rawPlaced.length; i += 1) {
    const current = rawPlaced[i];
    if (!current) continue;
    const next = i + 1 < rawPlaced.length ? rawPlaced[i + 1] : undefined;
    const gutterAfterPx = next ? next.gutterBeforePx : bottomMarginPx;
    if (current.antiSpoiler.twistSpoilerLeakPx > maxTwistSpoilerLeakPx) {
      maxTwistSpoilerLeakPx = current.antiSpoiler.twistSpoilerLeakPx;
    }
    cuts.push({ ...current, gutterAfterPx });
  }
  const totalHeightPx = cuts.length === 0 ? topMarginPx + bottomMarginPx : cursorY + bottomMarginPx;
  return {
    episodeId,
    episodeTitle,
    canvasWidthPx,
    targetViewports,
    topMarginPx,
    bottomMarginPx,
    totalHeightPx,
    cuts,
    maxTwistSpoilerLeakPx,
    spoilerProtectedCutIndices,
    monotonyAdjustedCutIndices,
  };
}

/**
 * 감정 비트·대사 밀도·모바일 뷰포트 스포일러 차단 규칙을 반영해 세로 스크롤 컷 배치를 최적화한다.
 */
export function optimizeVerticalScrollPanelLayout(
  cuts: readonly VerticalScrollCutInput[],
  options: OptimizeVerticalScrollOptions = {},
): VerticalScrollPanelLayout {
  const episodeId = options.episodeId?.trim() || "episode-wave108";
  const episodeTitle = options.episodeTitle?.trim() || "세로 스크롤 리듬 에피소드";
  const canvasWidthPx = sanitizePositiveInt(options.canvasWidthPx, DEFAULT_CANVAS_WIDTH_PX, 320, 2400);
  const targetViewports = normalizeTargetViewports(options.targetViewports);
  const topMarginPx = sanitizePositiveInt(options.topMarginPx, DEFAULT_TOP_MARGIN_PX, 0, 1200);
  const bottomMarginPx = sanitizePositiveInt(options.bottomMarginPx, DEFAULT_BOTTOM_MARGIN_PX, 0, 1600);
  const antiSpoilerSafetyMarginPx = sanitizePositiveInt(
    options.antiSpoilerSafetyMarginPx,
    DEFAULT_ANTI_SPOILER_SAFETY_MARGIN_PX,
    0,
    400,
  );
  const minCutHeightPx = sanitizePositiveInt(options.minCutHeightPx, DEFAULT_MIN_CUT_HEIGHT_PX, 180, 1200);
  const maxCutHeightPx = sanitizePositiveInt(
    options.maxCutHeightPx,
    DEFAULT_MAX_CUT_HEIGHT_PX,
    Math.max(minCutHeightPx, 480),
    3600,
  );
  const maxDialogueCharsPerViewport = sanitizePositiveInt(
    options.maxDialogueCharsPerViewport,
    DEFAULT_MAX_DIALOGUE_CHARS_PER_VIEWPORT,
    40,
    400,
  );
  const breakMonotonyAutomatically = options.breakMonotonyAutomatically !== false;

  if (cuts.length === 0) {
    return finalizeLayout([], episodeId, episodeTitle, canvasWidthPx, targetViewports, topMarginPx, bottomMarginPx, 0, [], []);
  }

  let maxViewportHeightPx = 0;
  for (let i = 0; i < targetViewports.length; i += 1) {
    const profile = targetViewports[i];
    if (!profile) continue;
    const vh = computeScaledViewportHeightPx(canvasWidthPx, profile);
    if (vh > maxViewportHeightPx) maxViewportHeightPx = vh;
  }

  const rawPlaced: PlacedCutDraft[] = [];
  const spoilerProtectedCutIndices: number[] = [];
  const monotonyAdjustedCutIndices: number[] = [];
  let cursorY = 0;

  for (let i = 0; i < cuts.length; i += 1) {
    const input = cuts[i];
    if (!input) continue;

    const preset = BEAT_RHYTHM_PRESETS[input.beatKind];
    const moodTone: PanelMoodTone = input.moodTone ?? "neutral";
    const prevRecord = i > 0 ? rawPlaced[i - 1] : undefined;
    const intensity = clamp(input.intensity ?? 0.5, 0, 1);
    const dialogueCharCount = countDialogueChars(input.dialogueText, input.dialogueCharCount);
    const speechBubbleCount = resolveSpeechBubbleCount(input.dialogueText, dialogueCharCount, input.speechBubbleCount);
    const centeredIntensity = intensity - 0.5;

    let heightPx: number;
    if (input.preferredHeightPx !== undefined && Number.isFinite(input.preferredHeightPx)) {
      heightPx = Math.round(clamp(input.preferredHeightPx, minCutHeightPx, maxCutHeightPx));
    } else {
      const dialogueBoost = dialogueCharCount > 0 ? Math.round(dialogueCharCount * 2.4 + speechBubbleCount * 36) : 0;
      const rawHeight = preset.baseHeightPx + centeredIntensity * preset.intensityHeightSpanPx + dialogueBoost;
      heightPx = Math.round(clamp(rawHeight, minCutHeightPx, maxCutHeightPx));
      if (dialogueCharCount > 0) {
        const densityFloor = Math.ceil((dialogueCharCount / Math.max(1, maxDialogueCharsPerViewport)) * maxViewportHeightPx * 0.92);
        if (densityFloor > heightPx) heightPx = Math.round(clamp(densityFloor, minCutHeightPx, maxCutHeightPx));
      }
    }

    let gutterBeforePx =
      i === 0
        ? topMarginPx
        : Math.round(
            clamp(
              preset.baseGutterBeforePx + centeredIntensity * preset.intensityGutterDeltaPx,
              preset.minGutterBeforePx,
              preset.maxGutterBeforePx,
            ),
          );
    if (i > 0 && prevRecord && prevRecord.beatKind === "action-rush" && input.beatKind === "quiet-aftermath") {
      gutterBeforePx = Math.max(gutterBeforePx, 400);
    }

    if (i > 0 && breakMonotonyAutomatically && isMonotonousTail(rawPlaced, heightPx, gutterBeforePx)) {
      const accentH = Math.round(clamp(heightPx * 1.18, minCutHeightPx, maxCutHeightPx));
      heightPx = Math.abs(accentH - heightPx) / Math.max(1, heightPx) >= 0.1
        ? accentH
        : Math.round(clamp(heightPx * 0.84, minCutHeightPx, maxCutHeightPx));
      const accentG = Math.round(clamp(gutterBeforePx * 1.24, preset.minGutterBeforePx, preset.maxGutterBeforePx));
      gutterBeforePx = Math.abs(accentG - gutterBeforePx) / Math.max(1, gutterBeforePx) >= 0.12
        ? accentG
        : Math.round(clamp(gutterBeforePx * 0.82, preset.minGutterBeforePx, preset.maxGutterBeforePx));
      monotonyAdjustedCutIndices.push(i);
    }

    if (i > 0 && shouldIsolateRevealCut(input) && prevRecord) {
      const requiredMinGutter = computeRequiredAntiSpoilerPreGutterPx(prevRecord, canvasWidthPx, targetViewports);
      const safeTargetGutter = requiredMinGutter + antiSpoilerSafetyMarginPx;
      if (safeTargetGutter > gutterBeforePx) gutterBeforePx = safeTargetGutter;
      spoilerProtectedCutIndices.push(i);
    }

    const gutterGradientStyle = selectGutterGradientStyle(
      input.beatKind,
      moodTone,
      prevRecord?.moodTone,
      intensity,
      input.preferredGutterGradient,
    );
    const placed = buildPlacedCutDraft(
      i,
      input,
      prevRecord,
      cursorY + gutterBeforePx,
      heightPx,
      gutterBeforePx,
      gutterGradientStyle,
      canvasWidthPx,
      targetViewports,
    );
    rawPlaced.push(placed);
    cursorY = placed.bottomYPx;
  }

  return finalizeLayout(
    rawPlaced, episodeId, episodeTitle, canvasWidthPx, targetViewports,
    topMarginPx, bottomMarginPx, cursorY, spoilerProtectedCutIndices, monotonyAdjustedCutIndices,
  );
}

/**
 * 작가의 수동 컷 높이·여백 배치를 그대로 레이아웃 객체로 조립한다(독립 감사·비교용).
 */
export function buildManualVerticalScrollLayout(
  cuts: readonly ManualVerticalScrollCutInput[],
  options: Omit<OptimizeVerticalScrollOptions, "antiSpoilerSafetyMarginPx" | "breakMonotonyAutomatically"> = {},
): VerticalScrollPanelLayout {
  const episodeId = options.episodeId?.trim() || "manual-episode";
  const episodeTitle = options.episodeTitle?.trim() || "수동 배치 에피소드";
  const canvasWidthPx = sanitizePositiveInt(options.canvasWidthPx, DEFAULT_CANVAS_WIDTH_PX, 320, 2400);
  const targetViewports = normalizeTargetViewports(options.targetViewports);
  const bottomMarginPx = sanitizePositiveInt(options.bottomMarginPx, DEFAULT_BOTTOM_MARGIN_PX, 0, 1600);
  const firstCut = cuts[0];
  const topMarginPx = firstCut
    ? sanitizePositiveInt(firstCut.gutterBeforePx, DEFAULT_TOP_MARGIN_PX, 0, 2400)
    : sanitizePositiveInt(options.topMarginPx, DEFAULT_TOP_MARGIN_PX, 0, 1200);

  const built: PlacedCutDraft[] = [];
  let cursorY = 0;

  for (let i = 0; i < cuts.length; i += 1) {
    const input = cuts[i];
    if (!input) continue;
    const preset = BEAT_RHYTHM_PRESETS[input.beatKind];
    const moodTone: PanelMoodTone = input.moodTone ?? "neutral";
    const intensity = clamp(input.intensity ?? 0.5, 0, 1);
    const heightPx = sanitizePositiveInt(input.heightPx, preset.baseHeightPx, 40, 4800);
    const gutterBeforePx = sanitizePositiveInt(input.gutterBeforePx, 80, 0, 4800);
    const prevRecord = i > 0 ? built[i - 1] : undefined;
    const gutterGradientStyle =
      input.gutterGradientStyle ??
      selectGutterGradientStyle(input.beatKind, moodTone, prevRecord?.moodTone, intensity, input.preferredGutterGradient);
    const placed = buildPlacedCutDraft(
      i, input, prevRecord, cursorY + gutterBeforePx, heightPx, gutterBeforePx,
      gutterGradientStyle, canvasWidthPx, targetViewports,
    );
    built.push(placed);
    cursorY = placed.bottomYPx;
  }

  return finalizeLayout(built, episodeId, episodeTitle, canvasWidthPx, targetViewports, topMarginPx, bottomMarginPx, cursorY, [], []);
}
