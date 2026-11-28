/**
 * Wave 102 — 에피소드 감정 색채 스크립트 아크 컴파일러.
 *
 * - 순서 있는 에피소드 장면들(`calm -> rising-tension -> climax -> flashback -> relief`)을
 *   일괄 재조명하고 장면별 우세 OKLCH 키, 명암 폭, 인접 장면 지각 색차(`deltaEBetweenScenes`)를 계산한다.
 * - 감정 절정(`climax`) 장면이 선행 안정(`calm`) 장면 대비 더 높은 명암 폭 또는 채도 임팩트를
 *   달성하는지 정량 검증한다.
 * - WCAG 2.1 상대 휘도 공식으로 말풍선 텍스트 대비율(`>= 4.5`)을 검사하고 미달 시 권장 잉크색을 제안한다.
 */

import {
  buildColorScriptRelightingWgsl,
  validateColorScriptWgsl,
  type BuildWgslRelightingOptions,
  type WgslValidationResult,
} from "./color-script-relighting-wgsl";
import {
  computeOklabDeltaE,
  gamutMapOklch,
  oklabToOklch,
  oklchToOklab,
  oklchToSRgb,
  relightFlatPaletteForMood,
  sRgbToLinear,
  type FlatColorSwatch,
  type FlatSwatchRole,
  type LightingMoodPresetId,
  type OklchColor,
  type RelightPaletteOptions,
  type RelitColorSwatch,
  type RelitPaletteResult,
  type SrgbColor,
} from "./oklch-chromatic-adaptation-relighter";

export {
  buildColorScriptRelightingWgsl,
  validateColorScriptWgsl,
  type BuildWgslRelightingOptions,
  type WgslValidationResult,
};

export type EmotionArcPhase =
  | "calm"
  | "rising-tension"
  | "climax"
  | "flashback"
  | "relief";

export interface EpisodeSceneInput {
  readonly sceneId: string;
  readonly titleKo: string;
  readonly emotionArc: EmotionArcPhase;
  readonly moodPreset: LightingMoodPresetId;
  readonly baseSwatches: readonly FlatColorSwatch[];
  readonly balloonTextSrgb?: SrgbColor;
  readonly balloonBgSrgb?: SrgbColor;
}

export interface CompileEpisodeColorScriptOptions extends RelightPaletteOptions {
  readonly episodeId?: string;
  readonly episodeTitleKo?: string;
  readonly minBalloonWcagRatio?: number;
}

export interface SceneBalloonContrastCheck {
  readonly textSrgb: SrgbColor;
  readonly backgroundSrgb: SrgbColor;
  readonly relitSceneBackgroundSrgb: SrgbColor;
  readonly usedExplicitBalloonBg: boolean;
  readonly contrastRatio: number;
  readonly textVsRelitSceneBgRatio: number;
  readonly minRequiredRatio: number;
  readonly passed: boolean;
  readonly recommendedTextSrgb: SrgbColor;
}

export interface CompiledColorScriptScene {
  readonly sceneIndex: number;
  readonly sceneId: string;
  readonly titleKo: string;
  readonly emotionArc: EmotionArcPhase;
  readonly moodPreset: LightingMoodPresetId;
  readonly presetLabelKo: string;
  readonly relitPalette: RelitPaletteResult;
  readonly dominantOklch: OklchColor;
  readonly dominantSrgb: SrgbColor;
  readonly bandRimOklch: OklchColor;
  readonly bandLitOklch: OklchColor;
  readonly bandMidtoneOklch: OklchColor;
  readonly bandShadowOklch: OklchColor;
  readonly shadowLuminance: number;
  readonly highlightLuminance: number;
  readonly luminanceSpan: number;
  readonly meanChroma: number;
  readonly deltaEFromPreviousScene: number | null;
  readonly balloonContrast: SceneBalloonContrastCheck;
}

export type SceneTransitionKind =
  | "smooth"
  | "moderate-shift"
  | "dramatic-cut"
  | "flashback-shift";

export interface AdjacentSceneColorTransition {
  readonly fromSceneId: string;
  readonly toSceneId: string;
  readonly fromEmotionArc: EmotionArcPhase;
  readonly toEmotionArc: EmotionArcPhase;
  readonly deltaEBetweenScenes: number;
  readonly luminanceDelta: number;
  readonly chromaDelta: number;
  readonly warmthDelta: number;
  readonly transitionKind: SceneTransitionKind;
}

export interface ClimaxPeakVerification {
  readonly hasClimaxScene: boolean;
  readonly climaxSceneIds: readonly string[];
  readonly precedingCalmSceneIds: readonly string[];
  readonly climaxMaxLuminanceSpan: number;
  readonly climaxMaxChroma: number;
  readonly precedingCalmMeanLuminanceSpan: number;
  readonly precedingCalmMeanChroma: number;
  readonly contrastLiftOverCalm: number;
  readonly chromaLiftOverCalm: number;
  readonly peakAchieved: boolean;
}

export interface EpisodeColorScriptArc {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly minBalloonWcagRatio: number;
  readonly scenes: readonly CompiledColorScriptScene[];
  readonly transitions: readonly AdjacentSceneColorTransition[];
  readonly climaxVerification: ClimaxPeakVerification;
  readonly maxSkinHueDriftDeg: number;
  readonly allSkinProtected: boolean;
  readonly minShadowChromaRetention: number;
  readonly allAntiMudPassed: boolean;
  readonly minObservedBalloonWcagRatio: number;
  readonly allBalloonWcagPassed: boolean;
  readonly failingWcagSceneIds: readonly string[];
  readonly meanAdjacentDeltaE: number;
  readonly overallPassed: boolean;
}

const DOMINANT_ROLE_WEIGHT: Readonly<Record<FlatSwatchRole, number>> = {
  background: 1.45,
  costume: 1.1,
  hair: 0.9,
  prop: 0.85,
  skin: 0.8,
};

const DEFAULT_DARK_INK_SRGB: SrgbColor = { r: 20, g: 24, b: 30 };
const DEFAULT_LIGHT_INK_SRGB: SrgbColor = { r: 248, g: 247, b: 242 };

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/** WCAG 2.1 상대 휘도(`Y ∈ [0, 1]`)를 계산한다. */
export function computeWcagRelativeLuminance(srgb: SrgbColor): number {
  const lin = sRgbToLinear(srgb);
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

/** 두 sRGB 색상의 WCAG 2.1 대비율(`[1, 21]`)을 계산한다. */
export function computeWcagContrastRatio(first: SrgbColor, second: SrgbColor): number {
  const y1 = computeWcagRelativeLuminance(first);
  const y2 = computeWcagRelativeLuminance(second);
  const lighter = Math.max(y1, y2);
  const darker = Math.min(y1, y2);
  return (lighter + 0.05) / (darker + 0.05);
}

function chooseRecommendedInkForBg(bg: SrgbColor): SrgbColor {
  const darkRatio = computeWcagContrastRatio(DEFAULT_DARK_INK_SRGB, bg);
  const lightRatio = computeWcagContrastRatio(DEFAULT_LIGHT_INK_SRGB, bg);
  return darkRatio >= lightRatio ? DEFAULT_DARK_INK_SRGB : DEFAULT_LIGHT_INK_SRGB;
}

function averageOklchBand(
  swatches: readonly RelitColorSwatch[],
  selector: (swatch: RelitColorSwatch) => OklchColor,
  fallback: OklchColor,
): OklchColor {
  if (swatches.length === 0) {
    return fallback;
  }
  let sumW = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < swatches.length; i += 1) {
    const sw = swatches[i];
    const w = DOMINANT_ROLE_WEIGHT[sw.role];
    const lab = oklchToOklab(selector(sw));
    sumW += w;
    sumL += lab.l * w;
    sumA += lab.a * w;
    sumB += lab.b * w;
  }
  if (sumW <= 0) {
    return fallback;
  }
  return gamutMapOklch(oklabToOklch({ l: sumL / sumW, a: sumA / sumW, b: sumB / sumW }));
}

function resolveRelitSceneBackgroundSrgb(
  swatches: readonly RelitColorSwatch[],
  dominantSrgb: SrgbColor,
): SrgbColor {
  const bgSwatches = swatches.filter((sw) => sw.role === "background");
  if (bgSwatches.length === 0) {
    return dominantSrgb;
  }
  const avgBgOklch = averageOklchBand(
    bgSwatches,
    (sw) => sw.midtoneOklch,
    bgSwatches[0].midtoneOklch,
  );
  return oklchToSRgb(avgBgOklch);
}

function classifySceneTransition(
  fromArc: EmotionArcPhase,
  toArc: EmotionArcPhase,
  deltaE: number,
): SceneTransitionKind {
  if (fromArc === "flashback" || toArc === "flashback") {
    return "flashback-shift";
  }
  if (deltaE >= 0.22) {
    return "dramatic-cut";
  }
  if (deltaE >= 0.1) {
    return "moderate-shift";
  }
  return "smooth";
}

/**
 * 에피소드 전체 장면 시퀀스를 재조명하고 감정 색채 스크립트 아크 및 품질 게이트를 컴파일한다.
 */
export function compileEpisodeColorScriptArc(
  episodeScenes: readonly EpisodeSceneInput[],
  options?: CompileEpisodeColorScriptOptions,
): EpisodeColorScriptArc {
  const episodeId = options?.episodeId ?? "episode-color-script";
  const episodeTitleKo = options?.episodeTitleKo ?? "에피소드 감정 색채 스크립트";
  const minBalloonWcagRatio = clamp(options?.minBalloonWcagRatio ?? 4.5, 3.0, 21.0);

  const compiledScenes: CompiledColorScriptScene[] = [];
  const transitions: AdjacentSceneColorTransition[] = [];

  let maxSkinHueDriftDeg = 0;
  let allSkinProtected = true;
  let minShadowChromaRetention = 1;
  let allAntiMudPassed = true;
  let minObservedBalloonWcagRatio = 21;
  const failingWcagSceneIds: string[] = [];

  for (let i = 0; i < episodeScenes.length; i += 1) {
    const input = episodeScenes[i];
    const relitPalette = relightFlatPaletteForMood(input.baseSwatches, input.moodPreset, options);
    const preset = relitPalette.preset;
    const sws = relitPalette.swatches;

    const bandMidtoneOklch = averageOklchBand(sws, (s) => s.midtoneOklch, preset.keyLightOklch);
    const bandLitOklch = averageOklchBand(sws, (s) => s.litOklch, preset.keyLightOklch);
    const bandShadowOklch = averageOklchBand(sws, (s) => s.shadowOklch, preset.ambientFillOklch);
    const bandRimOklch = averageOklchBand(sws, (s) => s.rimOklch, preset.rimLightOklch);

    const dominantOklch = bandMidtoneOklch;
    const dominantSrgb = oklchToSRgb(dominantOklch);

    let minShadowL = bandShadowOklch.l;
    let maxHighlightL = Math.max(bandLitOklch.l, bandRimOklch.l);
    if (sws.length > 0) {
      minShadowL = 1;
      maxHighlightL = 0;
      for (let j = 0; j < sws.length; j += 1) {
        const sw = sws[j];
        if (sw.shadowOklch.l < minShadowL) {
          minShadowL = sw.shadowOklch.l;
        }
        const highL = Math.max(sw.litOklch.l, sw.rimOklch.l);
        if (highL > maxHighlightL) {
          maxHighlightL = highL;
        }
      }
    }
    const luminanceSpan = Math.max(0, maxHighlightL - minShadowL);

    const relitSceneBgSrgb = resolveRelitSceneBackgroundSrgb(sws, dominantSrgb);
    const usedExplicitBalloonBg = input.balloonBgSrgb !== undefined;
    const effectiveBalloonBgSrgb = input.balloonBgSrgb ?? relitSceneBgSrgb;
    const recommendedTextSrgb = chooseRecommendedInkForBg(effectiveBalloonBgSrgb);
    const effectiveBalloonTextSrgb = input.balloonTextSrgb ?? recommendedTextSrgb;
    const contrastRatio = computeWcagContrastRatio(effectiveBalloonTextSrgb, effectiveBalloonBgSrgb);
    const textVsRelitSceneBgRatio = computeWcagContrastRatio(
      effectiveBalloonTextSrgb,
      relitSceneBgSrgb,
    );
    const wcagPassed = contrastRatio >= minBalloonWcagRatio;

    if (contrastRatio < minObservedBalloonWcagRatio) {
      minObservedBalloonWcagRatio = contrastRatio;
    }
    if (!wcagPassed) {
      failingWcagSceneIds.push(input.sceneId);
    }

    maxSkinHueDriftDeg = Math.max(maxSkinHueDriftDeg, relitPalette.maxSkinHueDriftDeg);
    if (!relitPalette.allSkinProtected) {
      allSkinProtected = false;
    }
    minShadowChromaRetention = Math.min(
      minShadowChromaRetention,
      relitPalette.minShadowChromaRetention,
    );
    if (!relitPalette.allAntiMudPassed) {
      allAntiMudPassed = false;
    }

    const prevScene = i > 0 ? compiledScenes[i - 1] : null;
    const deltaEFromPreviousScene =
      prevScene === null ? null : computeOklabDeltaE(prevScene.dominantOklch, dominantOklch);

    const compiled: CompiledColorScriptScene = {
      sceneIndex: i,
      sceneId: input.sceneId,
      titleKo: input.titleKo,
      emotionArc: input.emotionArc,
      moodPreset: input.moodPreset,
      presetLabelKo: preset.labelKo,
      relitPalette,
      dominantOklch,
      dominantSrgb,
      bandRimOklch,
      bandLitOklch,
      bandMidtoneOklch,
      bandShadowOklch,
      shadowLuminance: minShadowL,
      highlightLuminance: maxHighlightL,
      luminanceSpan,
      meanChroma: relitPalette.meanMidtoneChroma,
      deltaEFromPreviousScene,
      balloonContrast: {
        textSrgb: effectiveBalloonTextSrgb,
        backgroundSrgb: effectiveBalloonBgSrgb,
        relitSceneBackgroundSrgb: relitSceneBgSrgb,
        usedExplicitBalloonBg,
        contrastRatio,
        textVsRelitSceneBgRatio,
        minRequiredRatio: minBalloonWcagRatio,
        passed: wcagPassed,
        recommendedTextSrgb,
      },
    };
    compiledScenes.push(compiled);

    if (prevScene !== null && deltaEFromPreviousScene !== null) {
      transitions.push({
        fromSceneId: prevScene.sceneId,
        toSceneId: compiled.sceneId,
        fromEmotionArc: prevScene.emotionArc,
        toEmotionArc: compiled.emotionArc,
        deltaEBetweenScenes: deltaEFromPreviousScene,
        luminanceDelta: compiled.dominantOklch.l - prevScene.dominantOklch.l,
        chromaDelta: compiled.meanChroma - prevScene.meanChroma,
        warmthDelta: compiled.relitPalette.warmthIndex - prevScene.relitPalette.warmthIndex,
        transitionKind: classifySceneTransition(
          prevScene.emotionArc,
          compiled.emotionArc,
          deltaEFromPreviousScene,
        ),
      });
    }
  }

  const climaxScenes = compiledScenes.filter((s) => s.emotionArc === "climax");
  const firstClimaxIdx = climaxScenes.length > 0 ? climaxScenes[0].sceneIndex : -1;
  const precedingCalmScenes =
    firstClimaxIdx > 0
      ? compiledScenes.filter((s) => s.emotionArc === "calm" && s.sceneIndex < firstClimaxIdx)
      : compiledScenes.filter((s) => s.emotionArc === "calm");

  const climaxMaxLuminanceSpan = climaxScenes.reduce((acc, s) => Math.max(acc, s.luminanceSpan), 0);
  const climaxMaxChroma = climaxScenes.reduce((acc, s) => Math.max(acc, s.meanChroma), 0);
  const precedingCalmMeanLuminanceSpan =
    precedingCalmScenes.length === 0
      ? 0
      : precedingCalmScenes.reduce((acc, s) => acc + s.luminanceSpan, 0) /
        precedingCalmScenes.length;
  const precedingCalmMeanChroma =
    precedingCalmScenes.length === 0
      ? 0
      : precedingCalmScenes.reduce((acc, s) => acc + s.meanChroma, 0) /
        precedingCalmScenes.length;

  const contrastLiftOverCalm = climaxMaxLuminanceSpan - precedingCalmMeanLuminanceSpan;
  const chromaLiftOverCalm = climaxMaxChroma - precedingCalmMeanChroma;
  const hasClimaxScene = climaxScenes.length > 0;
  const peakAchieved =
    !hasClimaxScene ||
    (precedingCalmScenes.length === 0
      ? climaxMaxLuminanceSpan >= 0.24
      : contrastLiftOverCalm > 0.005 || chromaLiftOverCalm > 0.005);

  const climaxVerification: ClimaxPeakVerification = {
    hasClimaxScene,
    climaxSceneIds: climaxScenes.map((s) => s.sceneId),
    precedingCalmSceneIds: precedingCalmScenes.map((s) => s.sceneId),
    climaxMaxLuminanceSpan,
    climaxMaxChroma,
    precedingCalmMeanLuminanceSpan,
    precedingCalmMeanChroma,
    contrastLiftOverCalm,
    chromaLiftOverCalm,
    peakAchieved,
  };

  const allBalloonWcagPassed = failingWcagSceneIds.length === 0;
  const meanAdjacentDeltaE =
    transitions.length === 0
      ? 0
      : transitions.reduce((acc, tr) => acc + tr.deltaEBetweenScenes, 0) / transitions.length;

  return {
    episodeId,
    episodeTitleKo,
    minBalloonWcagRatio,
    scenes: compiledScenes,
    transitions,
    climaxVerification,
    maxSkinHueDriftDeg,
    allSkinProtected,
    minShadowChromaRetention: compiledScenes.length === 0 ? 1 : minShadowChromaRetention,
    allAntiMudPassed,
    minObservedBalloonWcagRatio: compiledScenes.length === 0 ? 21 : minObservedBalloonWcagRatio,
    allBalloonWcagPassed,
    failingWcagSceneIds,
    meanAdjacentDeltaE,
    overallPassed:
      allSkinProtected &&
      allAntiMudPassed &&
      allBalloonWcagPassed &&
      climaxVerification.peakAchieved,
  };
}
