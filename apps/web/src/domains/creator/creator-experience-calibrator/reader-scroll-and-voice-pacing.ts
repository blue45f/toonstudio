/**
 * 스마트폰 독자 스크롤 템포 시뮬레이터(360px/390px/768px) 및
 * 다국어(KO/EN/JA/TH) 보이스·연출 호흡 프리뷰 엔진.
 *
 * 네트워크 전송 0바이트 · 메모리 전용 연산(브라우저 영속 저장소 미사용).
 */

export type ReaderViewportPresetId = "android-360" | "iphone-390" | "tablet-768";
export type BubbleLegibilityStatus = "too-small" | "tight" | "comfortable" | "oversized";
export type GutterBreathStatus = "cramped" | "natural" | "spacious" | "dead-air";
export type CliffhangerPauseStatus = "too-abrupt" | "optimal" | "too-long";
export type VoicePacingLocale = "ko" | "en" | "ja" | "th";
export type DialogueEmotion = "calm" | "urgent" | "whisper" | "shout" | "narration";
export type BubbleOverflowRisk = "safe" | "tight" | "overflow";

export interface ReaderViewportSpec {
  readonly id: ReaderViewportPresetId;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly devicePixelRatio: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly defaultScrollSpeedPxPerSec: number;
}

export const READER_VIEWPORT_PRESETS: Record<ReaderViewportPresetId, ReaderViewportSpec> = {
  "android-360": {
    id: "android-360", widthPx: 360, heightPx: 800, devicePixelRatio: 3,
    labelKo: "360px 안드로이드", labelEn: "360px Android", defaultScrollSpeedPxPerSec: 440,
  },
  "iphone-390": {
    id: "iphone-390", widthPx: 390, heightPx: 844, devicePixelRatio: 3,
    labelKo: "390px 아이폰", labelEn: "390px iPhone", defaultScrollSpeedPxPerSec: 465,
  },
  "tablet-768": {
    id: "tablet-768", widthPx: 768, heightPx: 1024, devicePixelRatio: 2,
    labelKo: "768px 태블릿", labelEn: "768px Tablet", defaultScrollSpeedPxPerSec: 540,
  },
};

export interface ReaderBubbleSpec {
  readonly id: string;
  readonly text: string;
  readonly sourceFontSizePx: number;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly anchorX01: number;
}

export interface ReaderScrollPanelSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly focalPointX01: number;
  readonly isCliffhangerBefore?: boolean;
  readonly isRevealBeat?: boolean;
  readonly bubbles: readonly ReaderBubbleSpec[];
}

export interface MobileReaderEpisodeInput {
  readonly canvasWidthPx: number;
  readonly scrollSpeedPxPerSec?: number;
  readonly panels: readonly ReaderScrollPanelSpec[];
}

export interface RenderedBubbleMetrics {
  readonly bubbleId: string;
  readonly renderedFontSizePx: number;
  readonly recommendedMinSourceFontPx: number;
  readonly legibility: BubbleLegibilityStatus;
  readonly estimatedReadSec: number;
}

export interface RenderedPanelScrollMetrics {
  readonly panelId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly renderedHeightPx: number;
  readonly renderedGutterPx: number;
  readonly gutterScrollSec: number;
  readonly gutterStatus: GutterBreathStatus;
  readonly panelScrollSec: number;
  readonly totalReadSec: number;
  readonly eyeJumpDeltaX01: number;
  readonly isCliffhangerBefore: boolean;
  readonly bubbles: readonly RenderedBubbleMetrics[];
}

export interface CliffhangerBreathPauseResult {
  readonly panelId: string;
  readonly renderedGutterPx: number;
  readonly breathPauseSec: number;
  readonly viewportHeightRatio: number;
  readonly status: CliffhangerPauseStatus;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface ReaderScrollAdvisory {
  readonly code: "tiny-font" | "cramped-gutter" | "abrupt-cliffhanger" | "dead-air" | "eye-whiplash";
  readonly severity: "warn" | "critical";
  readonly panelId: string;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface MobileReaderScrollReport {
  readonly viewport: ReaderViewportSpec;
  readonly scaleRatio: number;
  readonly scrollSpeedPxPerSec: number;
  readonly totalRenderedHeightPx: number;
  readonly totalScrollSec: number;
  readonly totalReadSec: number;
  readonly minRenderedFontPx: number;
  readonly unreadableBubbleCount: number;
  readonly tightBubbleCount: number;
  readonly averageGutterPx: number;
  readonly averageGutterSec: number;
  readonly cliffhangerPauses: readonly CliffhangerBreathPauseResult[];
  readonly eyeFlowScore0To100: number;
  readonly eyeFlowGrade: "excellent" | "good" | "needs-tuning";
  readonly panels: readonly RenderedPanelScrollMetrics[];
  readonly advisories: readonly ReaderScrollAdvisory[];
}

export interface MultilingualDialogueBeat {
  readonly panelId: string;
  readonly bubbleId: string;
  readonly speaker: string;
  readonly emotion: DialogueEmotion;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly fontSizePx: number;
  readonly writingMode?: "horizontal" | "vertical";
  readonly texts: Partial<Record<VoicePacingLocale, string>>;
}

export interface VoicePacingOptions {
  readonly jaWritingMode?: "vertical" | "horizontal";
  readonly maxCutSpeechSec?: number;
}

export interface VoiceBeatAnalysis {
  readonly panelId: string;
  readonly bubbleId: string;
  readonly speaker: string;
  readonly locale: VoicePacingLocale;
  readonly text: string;
  readonly writingMode: "horizontal" | "vertical";
  readonly spokenUnits: number;
  readonly unitKind: "syllable" | "word" | "mora" | "cluster";
  readonly speechDurationSec: number;
  readonly pauseDurationSec: number;
  readonly totalBeatSec: number;
  readonly lineOrColumnCount: number;
  readonly verticalColumnCount: number | null;
  readonly textDensityRatio01: number;
  readonly overflowRisk: BubbleOverflowRisk;
  readonly thaiCombiningMarkCount: number;
  readonly fitUtilizationRatio: number;
}

export interface CutVoiceRhythmSummary {
  readonly panelId: string;
  readonly bubbleCount: number;
  readonly totalSpeechSec: number;
  readonly overflowCount: number;
  readonly status: "balanced" | "heavy" | "overloaded";
}

export interface VoiceDirectingWarning {
  readonly code:
    | "speech-overload"
    | "bubble-overflow"
    | "ja-vertical-columns-wide"
    | "multi-bubble-crowding";
  readonly severity: "warn" | "critical";
  readonly panelId: string;
  readonly bubbleId?: string;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface MultilingualVoicePacingReport {
  readonly locale: VoicePacingLocale;
  readonly totalDurationSec: number;
  readonly averageCutSpeechSec: number;
  readonly maxCutSpeechSec: number;
  readonly overflowBubbleCount: number;
  readonly tightBubbleCount: number;
  readonly maxJaVerticalColumns: number;
  readonly rhythmScore0To100: number;
  readonly beatResults: readonly VoiceBeatAnalysis[];
  readonly cutSummaries: readonly CutVoiceRhythmSummary[];
  readonly warnings: readonly VoiceDirectingWarning[];
}

export interface DemoWebtoonEpisodePacingData {
  readonly scrollEpisode: MobileReaderEpisodeInput;
  readonly dialogueBeats: readonly MultilingualDialogueBeat[];
}

const EMOTION_SPEED: Record<DialogueEmotion, number> = {
  calm: 0.94,
  narration: 0.88,
  whisper: 0.78,
  shout: 1.14,
  urgent: 1.24,
};

function clamp(v: number, min: number, max: number): number {
  return !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;
}

function roundTo(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function countPunctuationPauseSec(text: string): number {
  const ellipses = (text.match(/(\.\.\.|…|──|——)/gu) ?? []).length;
  const cleaned = text.replace(/(\.\.\.|…)/gu, "");
  const ends = (cleaned.match(/[.!?。！？]/gu) ?? []).length;
  const commas = (cleaned.match(/[,、;：:]/gu) ?? []).length;
  const breaks = (cleaned.match(/\n/gu) ?? []).length;
  return ellipses * 0.44 + ends * 0.28 + commas * 0.16 + breaks * 0.14;
}

function estimateBubbleQuickReadSec(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const hangul = (trimmed.match(/[\uAC00-\uD7A3]/gu) ?? []).length;
  const latinWords = (trimmed.match(/[A-Za-z0-9'-]+/gu) ?? []).length;
  const cjk = (trimmed.match(/[\u3040-\u30FF\u4E00-\u9FFF]/gu) ?? []).length;
  return roundTo(Math.max(0.45, hangul / 5.2 + latinWords / 3.1 + cjk / 5.5 + countPunctuationPauseSec(trimmed) * 0.65), 2);
}

/** 360px/390px/768px 독자 뷰포트 기준 스크롤 템포 · 말풍선 가독성 · 클리프행어 여백 · 시선 흐름 점수 산출. */
export function analyzeMobileReaderScrollPacing(
  input: MobileReaderEpisodeInput,
  viewportId: ReaderViewportPresetId = "android-360",
): MobileReaderScrollReport {
  const viewport = READER_VIEWPORT_PRESETS[viewportId];
  const scaleRatio = viewport.widthPx / Math.max(240, input.canvasWidthPx);
  const scrollSpeed = clamp(input.scrollSpeedPxPerSec ?? viewport.defaultScrollSpeedPxPerSec, 180, 1200);
  const recommendedMinSourceFontPx = Math.ceil(12.5 / scaleRatio);

  const panels: RenderedPanelScrollMetrics[] = [];
  const cliffhangerPauses: CliffhangerBreathPauseResult[] = [];
  const advisories: ReaderScrollAdvisory[] = [];

  let totalRenderedHeightPx = 0; let totalReadSec = 0;
  let minRenderedFontPx = Number.POSITIVE_INFINITY;
  let unreadableBubbleCount = 0; let tightBubbleCount = 0;
  let gutterSumPx = 0; let gutterCount = 0;
  let eyeWhiplashCount = 0; let crampedGutterCount = 0;
  let deadAirCount = 0; let abruptCliffhangerCount = 0; let dwellOverloadCount = 0;
  let prevFocalX: number | null = null;

  for (let i = 0; i < input.panels.length; i += 1) {
    const panel = input.panels[i];
    if (!panel) continue;
    const isLast = i === input.panels.length - 1;
    const renderedHeightPx = roundTo(Math.max(40, panel.heightPx) * scaleRatio, 1);
    const renderedGutterPx = isLast ? 0 : roundTo(Math.max(0, panel.gutterAfterPx) * scaleRatio, 1);
    const gutterScrollSec = roundTo(renderedGutterPx / scrollSpeed, 2);
    const panelScrollSec = roundTo(renderedHeightPx / scrollSpeed, 2);

    totalRenderedHeightPx += renderedHeightPx + renderedGutterPx;
    if (!isLast) { gutterSumPx += renderedGutterPx; gutterCount += 1; }

    const focalX = clamp(panel.focalPointX01, 0, 1);
    const eyeJumpDeltaX01 = prevFocalX === null ? 0 : roundTo(Math.abs(focalX - prevFocalX), 3);
    prevFocalX = focalX;
    if (eyeJumpDeltaX01 > 0.68) {
      eyeWhiplashCount += 1;
      advisories.push({
        code: "eye-whiplash", severity: "warn", panelId: panel.id,
        messageKo: `${panel.labelKo}: 직전 컷 대비 시선 이동 폭(${Math.round(eyeJumpDeltaX01 * 100)}%)이 급격합니다.`,
        messageEn: `${panel.labelEn}: Abrupt horizontal eye-jump (${Math.round(eyeJumpDeltaX01 * 100)}%) from previous cut.`,
      });
    }

    const renderedBubbles: RenderedBubbleMetrics[] = panel.bubbles.map((bubble) => {
      const renderedFont = roundTo(Math.max(4, bubble.sourceFontSizePx) * scaleRatio, 2);
      if (renderedFont < minRenderedFontPx) minRenderedFontPx = renderedFont;
      let legibility: BubbleLegibilityStatus = "comfortable";
      if (renderedFont < 10.5) {
        legibility = "too-small";
        unreadableBubbleCount += 1;
        advisories.push({
          code: "tiny-font", severity: "critical", panelId: panel.id,
          messageKo: `${panel.labelKo}: ${viewport.widthPx}px 화면에서 말풍선 글자가 ${renderedFont.toFixed(1)}px로 축소됩니다(권장 원고 ${recommendedMinSourceFontPx}px 이상).`,
          messageEn: `${panel.labelEn}: Bubble text shrinks to ${renderedFont.toFixed(1)}px on ${viewport.widthPx}px viewport (recommend >= ${recommendedMinSourceFontPx}px source).`,
        });
      } else if (renderedFont < 12.5) {
        legibility = "tight";
        tightBubbleCount += 1;
      } else if (renderedFont > 22) {
        legibility = "oversized";
      }
      return {
        bubbleId: bubble.id, renderedFontSizePx: renderedFont, recommendedMinSourceFontPx,
        legibility, estimatedReadSec: estimateBubbleQuickReadSec(bubble.text),
      };
    });

    const panelReadSec = roundTo(renderedBubbles.reduce((acc, b) => acc + b.estimatedReadSec, 0), 2);
    totalReadSec += panelReadSec;
    if (panelReadSec > Math.max(2.6, panelScrollSec * 2.4)) dwellOverloadCount += 1;

    let gutterStatus: GutterBreathStatus = "natural";
    if (!isLast) {
      if (panel.isCliffhangerBefore) {
        const viewportHeightRatio = roundTo(renderedGutterPx / viewport.heightPx, 2);
        let pauseStatus: CliffhangerPauseStatus = "optimal";
        let messageKo = `클리프행어 직전 정적 여백 ${renderedGutterPx.toFixed(0)}px (${gutterScrollSec.toFixed(2)}초) — 반전 몰입에 이상적입니다.`;
        let messageEn = `Cliffhanger breath pause ${renderedGutterPx.toFixed(0)}px (${gutterScrollSec.toFixed(2)}s) — ideal reveal tension.`;
        if (gutterScrollSec < 0.5 || renderedGutterPx < viewport.heightPx * 0.28) {
          pauseStatus = "too-abrupt"; abruptCliffhangerCount += 1; gutterStatus = "cramped";
          messageKo = `클리프행어 직전 여백(${renderedGutterPx.toFixed(0)}px · ${gutterScrollSec.toFixed(2)}초)이 너무 짧아 반전 컷이 미리 노출됩니다.`;
          messageEn = `Pre-cliffhanger gap (${renderedGutterPx.toFixed(0)}px · ${gutterScrollSec.toFixed(2)}s) is too brief; reveal leaks early.`;
          advisories.push({ code: "abrupt-cliffhanger", severity: "critical", panelId: panel.id, messageKo, messageEn });
        } else if (gutterScrollSec > 1.9 || renderedGutterPx > viewport.heightPx * 1.15) {
          pauseStatus = "too-long"; deadAirCount += 1; gutterStatus = "dead-air";
          messageKo = `클리프행어 여백(${renderedGutterPx.toFixed(0)}px · ${gutterScrollSec.toFixed(2)}초)이 지나치게 길어 이미지 누락으로 오인될 수 있습니다.`;
          messageEn = `Pre-cliffhanger gap (${renderedGutterPx.toFixed(0)}px · ${gutterScrollSec.toFixed(2)}s) is overly long and may look broken.`;
          advisories.push({ code: "dead-air", severity: "warn", panelId: panel.id, messageKo, messageEn });
        } else {
          gutterStatus = "spacious";
        }
        cliffhangerPauses.push({
          panelId: panel.id, renderedGutterPx, breathPauseSec: gutterScrollSec,
          viewportHeightRatio, status: pauseStatus, messageKo, messageEn,
        });
      } else if (renderedGutterPx < 22) {
        gutterStatus = "cramped"; crampedGutterCount += 1;
        advisories.push({
          code: "cramped-gutter", severity: "warn", panelId: panel.id,
          messageKo: `${panel.labelKo}: 컷 간 여백(${renderedGutterPx.toFixed(0)}px)이 좁아 시선 전환 호흡이 막힙니다.`,
          messageEn: `${panel.labelEn}: Inter-cut gutter (${renderedGutterPx.toFixed(0)}px) is cramped.`,
        });
      } else if (renderedGutterPx > 280) {
        gutterStatus = "dead-air"; deadAirCount += 1;
        advisories.push({
          code: "dead-air", severity: "warn", panelId: panel.id,
          messageKo: `${panel.labelKo}: 일반 컷 여백(${renderedGutterPx.toFixed(0)}px)이 과도하게 길어 텐션이 끊깁니다.`,
          messageEn: `${panel.labelEn}: Standard gutter (${renderedGutterPx.toFixed(0)}px) creates unnecessary dead air.`,
        });
      } else if (renderedGutterPx >= 135) {
        gutterStatus = "spacious";
      }
    }

    panels.push({
      panelId: panel.id, labelKo: panel.labelKo, labelEn: panel.labelEn,
      renderedHeightPx, renderedGutterPx, gutterScrollSec, gutterStatus, panelScrollSec,
      totalReadSec: panelReadSec, eyeJumpDeltaX01, isCliffhangerBefore: Boolean(panel.isCliffhangerBefore),
      bubbles: renderedBubbles,
    });
  }

  const averageGutterPx = gutterCount > 0 ? roundTo(gutterSumPx / gutterCount, 1) : 0;
  const penalty =
    unreadableBubbleCount * 16 + tightBubbleCount * 5 + crampedGutterCount * 7 +
    deadAirCount * 8 + abruptCliffhangerCount * 18 + eyeWhiplashCount * 9 + dwellOverloadCount * 6;
  const eyeFlowScore0To100 = Math.round(clamp(100 - penalty, 0, 100));

  return {
    viewport, scaleRatio: roundTo(scaleRatio, 4), scrollSpeedPxPerSec: scrollSpeed,
    totalRenderedHeightPx: roundTo(totalRenderedHeightPx, 1),
    totalScrollSec: roundTo(totalRenderedHeightPx / scrollSpeed, 2),
    totalReadSec: roundTo(totalReadSec, 2),
    minRenderedFontPx: Number.isFinite(minRenderedFontPx) ? minRenderedFontPx : 0,
    unreadableBubbleCount, tightBubbleCount, averageGutterPx,
    averageGutterSec: roundTo(averageGutterPx / scrollSpeed, 2),
    cliffhangerPauses, eyeFlowScore0To100,
    eyeFlowGrade: eyeFlowScore0To100 >= 82 ? "excellent" : eyeFlowScore0To100 >= 62 ? "good" : "needs-tuning",
    panels, advisories,
  };
}

/** 360px · 390px · 768px 3종 독자 뷰포트를 일괄 비교 분석한다. */
export function compareAllReaderViewports(
  input: MobileReaderEpisodeInput,
): Record<ReaderViewportPresetId, MobileReaderScrollReport> {
  return {
    "android-360": analyzeMobileReaderScrollPacing(input, "android-360"),
    "iphone-390": analyzeMobileReaderScrollPacing(input, "iphone-390"),
    "tablet-768": analyzeMobileReaderScrollPacing(input, "tablet-768"),
  };
}

function countEnglishSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/gu, "");
  if (cleaned.length <= 3) return cleaned.length > 0 ? 1 : 0;
  const groups = cleaned.replace(/(?:es|ed|e)$/u, "").match(/[aeiouy]{1,2}/gu);
  return Math.max(1, groups ? groups.length : 1);
}

/** 다국어(KO/EN/JA/TH) 보이스 자연 발화 시간, 말풍선 밀도·넘침, 일본어 세로쓰기 열 수 및 컷당 연출 리듬 경고 산출. */
export function simulateMultilingualVoicePacing(
  beats: readonly MultilingualDialogueBeat[],
  locale: VoicePacingLocale = "ko",
  options: VoicePacingOptions = {},
): MultilingualVoicePacingReport {
  const maxCutLimitSec = options.maxCutSpeechSec ?? 6.5;
  const jaMode = options.jaWritingMode ?? "vertical";
  const beatResults: VoiceBeatAnalysis[] = [];
  const warnings: VoiceDirectingWarning[] = [];
  const cutBuckets = new Map<string, { bubbleCount: number; totalSec: number; overflowCount: number }>();

  let overflowBubbleCount = 0; let tightBubbleCount = 0; let maxJaVerticalColumns = 0;

  for (const beat of beats) {
    const rawText = (beat.texts[locale] ?? "").trim();
    const writingMode: "horizontal" | "vertical" = locale === "ja" ? (beat.writingMode ?? jaMode) : "horizontal";
    const speedFactor = EMOTION_SPEED[beat.emotion];
    const pauseDurationSec = roundTo(countPunctuationPauseSec(rawText), 2);

    let spokenUnits: number;
    let unitKind: VoiceBeatAnalysis["unitKind"];
    let baseSpeechSec: number;
    let thaiCombiningMarkCount = 0;
    let visualGlyphUnits: number;

    if (locale === "ko") {
      unitKind = "syllable";
      const hangul = (rawText.match(/[\uAC00-\uD7A3]/gu) ?? []).length;
      const latinTokens = (rawText.match(/[A-Za-z0-9]+/gu) ?? []).length;
      spokenUnits = hangul + latinTokens * 2;
      baseSpeechSec = spokenUnits / (4.6 * speedFactor);
      visualGlyphUnits = hangul + latinTokens * 1.8 + (rawText.match(/\s/gu) ?? []).length * 0.35;
    } else if (locale === "en") {
      unitKind = "word";
      const words = rawText.match(/[A-Za-z0-9'-]+/gu) ?? [];
      spokenUnits = words.length;
      const syllables = words.reduce((acc, w) => acc + countEnglishSyllables(w), 0);
      baseSpeechSec = ((words.length / 2.65 + syllables / 4.4) * 0.5) / speedFactor;
      visualGlyphUnits = rawText.length * 0.58;
    } else if (locale === "ja") {
      unitKind = "mora";
      const kana = (rawText.match(/[\u3040-\u30FF]/gu) ?? []).length;
      const kanji = (rawText.match(/[\u4E00-\u9FFF]/gu) ?? []).length;
      const small = (rawText.match(/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/gu) ?? []).length;
      const alnum = (rawText.match(/[A-Za-z0-9]/gu) ?? []).length;
      spokenUnits = Math.max(0, Math.round(kana - small * 0.4 + kanji * 1.45 + alnum));
      baseSpeechSec = spokenUnits / (6.1 * speedFactor);
      visualGlyphUnits = Math.max(1, rawText.replace(/\s/gu, "").length);
    } else {
      unitKind = "cluster";
      thaiCombiningMarkCount = (rawText.match(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/gu) ?? []).length;
      const baseThai = (rawText.match(/[\u0E01-\u0E30\u0E32-\u0E33\u0E40-\u0E46]/gu) ?? []).length;
      const nonThai = (rawText.match(/[A-Za-z0-9]/gu) ?? []).length;
      spokenUnits = Math.max(0, Math.round(baseThai * 0.48 + nonThai * 0.6));
      baseSpeechSec = spokenUnits / (4.8 * speedFactor);
      visualGlyphUnits = baseThai * 0.66 + nonThai * 0.56;
    }

    const speechDurationSec = roundTo(rawText.length > 0 ? Math.max(0.35, baseSpeechSec) : 0, 2);
    const totalBeatSec = roundTo(speechDurationSec + pauseDurationSec, 2);
    const usableW = Math.max(24, beat.boxWidthPx * 0.84);
    const usableH = Math.max(24, beat.boxHeightPx * 0.84);
    const fontPx = Math.max(8, beat.fontSizePx);

    let lineOrColumnCount: number;
    let verticalColumnCount: number | null = null;
    let fitUtilizationRatio: number;
    let textDensityRatio01: number;

    if (locale === "ja" && writingMode === "vertical") {
      const explicitLines = rawText.length > 0 ? rawText.split(/\n/gu) : [""];
      const charsPerCol = Math.max(1, Math.floor(usableH / (fontPx * 1.12)));
      let cols = 0;
      for (const seg of explicitLines) cols += Math.max(1, Math.ceil(seg.replace(/\s/gu, "").length / charsPerCol));
      verticalColumnCount = rawText.length > 0 ? cols : 0;
      lineOrColumnCount = verticalColumnCount;
      if (verticalColumnCount > maxJaVerticalColumns) maxJaVerticalColumns = verticalColumnCount;
      const reqW = verticalColumnCount * fontPx * 1.46;
      fitUtilizationRatio = roundTo(reqW / usableW, 3);
      textDensityRatio01 = roundTo(Math.max(fitUtilizationRatio, (visualGlyphUnits * fontPx * fontPx * 1.38) / Math.max(1, usableW * usableH)), 3);
      if (reqW > usableW * 1.02) {
        warnings.push({
          code: "ja-vertical-columns-wide", severity: "critical", panelId: beat.panelId, bubbleId: beat.bubbleId,
          messageKo: `${beat.bubbleId}: 일본어 세로쓰기 ${verticalColumnCount}열(필요 폭 ${Math.round(reqW)}px)이 말풍선 폭(${Math.round(usableW)}px)을 초과합니다.`,
          messageEn: `${beat.bubbleId}: JA vertical layout needs ${verticalColumnCount} columns (${Math.round(reqW)}px) exceeding bubble width (${Math.round(usableW)}px).`,
        });
      }
    } else {
      const lineFactor = locale === "th" ? 1.64 : locale === "en" ? 1.34 : 1.42;
      const charW = locale === "en" ? fontPx * 0.56 : locale === "th" ? fontPx * 0.64 : fontPx * 0.98;
      const maxChars = Math.max(2, Math.floor(usableW / Math.max(4, charW)));
      let lines = 0;
      for (const seg of rawText.length > 0 ? rawText.split(/\n/gu) : [""]) {
        const len = locale === "th" ? seg.replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/gu, "").length : seg.length;
        lines += Math.max(1, Math.ceil(len / maxChars));
      }
      lineOrColumnCount = rawText.length > 0 ? lines : 0;
      const reqH = lineOrColumnCount * fontPx * lineFactor;
      fitUtilizationRatio = roundTo(reqH / usableH, 3);
      textDensityRatio01 = roundTo(Math.max(fitUtilizationRatio, (visualGlyphUnits * fontPx * fontPx * lineFactor) / Math.max(1, usableW * usableH)), 3);
    }

    const overflowRisk: BubbleOverflowRisk =
      fitUtilizationRatio > 1.0 || textDensityRatio01 > 0.96
        ? "overflow"
        : fitUtilizationRatio > 0.78 || textDensityRatio01 > 0.76
          ? "tight"
          : "safe";

    if (overflowRisk === "overflow") {
      overflowBubbleCount += 1;
      warnings.push({
        code: "bubble-overflow", severity: "critical", panelId: beat.panelId, bubbleId: beat.bubbleId,
        messageKo: `${beat.bubbleId}(${locale.toUpperCase()}): 텍스트 밀도 ${Math.round(textDensityRatio01 * 100)}%로 말풍선 넘침 위험이 높습니다.`,
        messageEn: `${beat.bubbleId} (${locale.toUpperCase()}): Text density ${Math.round(textDensityRatio01 * 100)}% overflows bubble bounds.`,
      });
    } else if (overflowRisk === "tight") {
      tightBubbleCount += 1;
    }

    const bucket = cutBuckets.get(beat.panelId) ?? { bubbleCount: 0, totalSec: 0, overflowCount: 0 };
    bucket.bubbleCount += 1; bucket.totalSec += totalBeatSec;
    if (overflowRisk === "overflow") bucket.overflowCount += 1;
    cutBuckets.set(beat.panelId, bucket);

    beatResults.push({
      panelId: beat.panelId, bubbleId: beat.bubbleId, speaker: beat.speaker, locale, text: rawText,
      writingMode, spokenUnits, unitKind, speechDurationSec, pauseDurationSec, totalBeatSec,
      lineOrColumnCount, verticalColumnCount, textDensityRatio01, overflowRisk,
      thaiCombiningMarkCount, fitUtilizationRatio,
    });
  }

  const cutSummaries: CutVoiceRhythmSummary[] = [];
  let maxCutSpeechSec = 0; let totalDurationSec = 0; let overloadedCuts = 0;
  for (const [panelId, data] of cutBuckets.entries()) {
    const cutSec = roundTo(data.totalSec, 2);
    totalDurationSec += cutSec;
    if (cutSec > maxCutSpeechSec) maxCutSpeechSec = cutSec;
    const status: CutVoiceRhythmSummary["status"] =
      cutSec > maxCutLimitSec ? "overloaded" : cutSec > maxCutLimitSec * 0.75 ? "heavy" : "balanced";
    if (status === "overloaded") {
      overloadedCuts += 1;
      warnings.push({
        code: "speech-overload", severity: "critical", panelId,
        messageKo: `${panelId}: 한 컷 발화 시간(${cutSec.toFixed(1)}초)이 권장 상한(${maxCutLimitSec.toFixed(1)}초)을 넘어 스크롤 몰입이 멈춥니다.`,
        messageEn: `${panelId}: Single-cut speech (${cutSec.toFixed(1)}s) exceeds ${maxCutLimitSec.toFixed(1)}s pacing limit.`,
      });
    }
    if (data.bubbleCount >= 4) {
      warnings.push({
        code: "multi-bubble-crowding", severity: "warn", panelId,
        messageKo: `${panelId}: 한 컷에 말풍선 ${data.bubbleCount}개가 몰려 시선 호흡이 분산됩니다.`,
        messageEn: `${panelId}: ${data.bubbleCount} bubbles crowded into one cut split reader focus.`,
      });
    }
    cutSummaries.push({ panelId, bubbleCount: data.bubbleCount, totalSpeechSec: cutSec, overflowCount: data.overflowCount, status });
  }

  const rhythmPenalty =
    overflowBubbleCount * 16 + tightBubbleCount * 5 + overloadedCuts * 18 + Math.max(0, warnings.length - 1) * 4;
  return {
    locale, totalDurationSec: roundTo(totalDurationSec, 2),
    averageCutSpeechSec: roundTo(totalDurationSec / Math.max(1, cutSummaries.length), 2),
    maxCutSpeechSec: roundTo(maxCutSpeechSec, 2),
    overflowBubbleCount, tightBubbleCount, maxJaVerticalColumns,
    rhythmScore0To100: Math.round(clamp(100 - rhythmPenalty, 0, 100)),
    beatResults, cutSummaries, warnings,
  };
}

/** KO · EN · JA · TH 4개국어 보이스 호흡과 말풍선 밀도를 동시 비교한다. */
export function compareAllVoiceLocales(
  beats: readonly MultilingualDialogueBeat[],
  options: VoicePacingOptions = {},
): Record<VoicePacingLocale, MultilingualVoicePacingReport> {
  return {
    ko: simulateMultilingualVoicePacing(beats, "ko", options),
    en: simulateMultilingualVoicePacing(beats, "en", options),
    ja: simulateMultilingualVoicePacing(beats, "ja", options),
    th: simulateMultilingualVoicePacing(beats, "th", options),
  };
}

/** 실전 4컷 웹툰 에피소드(360px 폰트 경계·클리프행어 정적 여백·4개국어 대사 포함) 데모 데이터. */
export function createDemoWebtoonEpisodePacingData(): DemoWebtoonEpisodePacingData {
  return {
    scrollEpisode: {
      canvasWidthPx: 800,
      panels: [
        {
          id: "cut-01", labelKo: "1컷 · 빗속 진입", labelEn: "Cut 1 · Rain Entry",
          heightPx: 920, gutterAfterPx: 140, focalPointX01: 0.42,
          bubbles: [{ id: "b1", text: "열차가 끊기기 전에 옥상으로 올라가야 해.", sourceFontSizePx: 30, boxWidthPx: 260, boxHeightPx: 120, anchorX01: 0.35 }],
        },
        {
          id: "cut-02", labelKo: "2컷 · 좁은 속삭임", labelEn: "Cut 2 · Quiet Whisper",
          heightPx: 760, gutterAfterPx: 120, focalPointX01: 0.56,
          bubbles: [{ id: "b2", text: "잠깐… 뒤쪽 그림자, 방금 움직였지?", sourceFontSizePx: 22, boxWidthPx: 210, boxHeightPx: 100, anchorX01: 0.62 }],
        },
        {
          id: "cut-03", labelKo: "3컷 · 클리프행어 직전", labelEn: "Cut 3 · Pre-Cliffhanger",
          heightPx: 880, gutterAfterPx: 680, focalPointX01: 0.5, isCliffhangerBefore: true,
          bubbles: [{ id: "b3", text: "문 열지 마! 그 안은 이미 비어 있지 않아!", sourceFontSizePx: 32, boxWidthPx: 240, boxHeightPx: 125, anchorX01: 0.48 }],
        },
        {
          id: "cut-04", labelKo: "4컷 · 반전 공개", labelEn: "Cut 4 · Reveal Beat",
          heightPx: 1120, gutterAfterPx: 180, focalPointX01: 0.52, isRevealBeat: true,
          bubbles: [{ id: "b4", text: "늦었어. 이미 열쇠는 내 손에 있거든.", sourceFontSizePx: 34, boxWidthPx: 260, boxHeightPx: 125, anchorX01: 0.5 }],
        },
      ],
    },
    dialogueBeats: [
      {
        panelId: "cut-01", bubbleId: "b1", speaker: "S1", emotion: "urgent",
        boxWidthPx: 220, boxHeightPx: 118, fontSizePx: 17,
        texts: {
          ko: "열차가 끊기기 전에 옥상으로 올라가야 해.",
          en: "We have to reach the rooftop right now before the final express train completely cuts off our only escape route!",
          ja: "終電が止まる前に屋上へ上がらないと、もう戻る道がなくなる。",
          th: "เราต้องรีบขึ้นไปบนดาดฟ้าก่อนรถไฟขบวนสุดท้ายจะหยุดวิ่ง!",
        },
      },
      {
        panelId: "cut-02", bubbleId: "b2", speaker: "S2", emotion: "whisper",
        boxWidthPx: 180, boxHeightPx: 110, fontSizePx: 16,
        texts: {
          ko: "잠깐… 뒤쪽 그림자, 방금 움직였지?",
          en: "Wait… did that shadow behind the pillar just move?",
          ja: "待って…後ろの影、今動いたよね？",
          th: "เดี๋ยวก่อน… เงาด้านหลังเมื่อกี้มันขยับใช่ไหม?",
        },
      },
      {
        panelId: "cut-03", bubbleId: "b3", speaker: "S1", emotion: "shout",
        boxWidthPx: 195, boxHeightPx: 120, fontSizePx: 18,
        texts: {
          ko: "문 열지 마! 그 안은 이미 비어 있지 않아!",
          en: "Don't open that door! Whatever is inside is awake!",
          ja: "ドアを開けるな！中はもう空じゃないんだ！",
          th: "อย่าเปิดประตูนั้นนะ! ข้างในนั้นไม่ได้ว่างเปล่า!",
        },
      },
      {
        panelId: "cut-04", bubbleId: "b4", speaker: "S3", emotion: "calm",
        boxWidthPx: 210, boxHeightPx: 115, fontSizePx: 17,
        texts: {
          ko: "늦었어. 이미 열쇠는 내 손에 있거든.",
          en: "Too late. The master key is already in my hand.",
          ja: "遅かったね。鍵はもう僕の手の中さ。",
          th: "สายไปแล้ว กุญแจอยู่ในมือฉันเรียบร้อยแล้วล่ะ",
        },
      },
    ],
  };
}
