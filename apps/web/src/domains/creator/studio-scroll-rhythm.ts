/**
 * Deterministic vertical-webtoon pacing analysis.
 *
 * Consumes the lightweight page/element shape shared by the Studio thumbnail pipeline
 * without touching pixels, DOM state, network, or React state.
 * Includes SFX rhythm aggregation (REPORT L-4) and oversized panel detection
 * (`OVERSIZED_PANEL` when `panel.height / viewportHeight > 1.4`).
 */

import type { StudioShotSize } from "./studio-storyboard-planner";

export const STUDIO_SCROLL_RHYTHM_LIMITS = Object.freeze({
  maxPages: 2_000,
  maxElementsPerPage: 20_000,
  maxInsights: 120,
  maxTextCodeUnits: 200_000,
});

export interface StudioScrollRhythmElementLike {
  readonly id?: string;
  readonly type: string;
  readonly hidden?: boolean;
  readonly opacity?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly points?: readonly number[];
  readonly text?: string;
  readonly name?: string;
  /** Explicit cue role — the same field the animatic timeline reads. */
  readonly animaticCueKind?: "dialogue" | "sfx";
  /** Category of the SFX entry when recorded (preset or lexicon id/label). */
  readonly sfxCategory?: string;
}

export interface StudioScrollRhythmPageLike {
  readonly id: string;
  readonly canvasH: number;
  readonly elements: readonly StudioScrollRhythmElementLike[];
}

export type StudioScrollRhythmInsightSeverity = "info" | "warning" | "critical";

export type StudioScrollRhythmInsightCode =
  | "DENSE_PAGE"
  | "DIALOGUE_LOAD"
  | "SFX_DENSE"
  | "SFX_LONG_GAP"
  | "NO_BREATHING_ROOM"
  | "LONG_EMPTY_RUN"
  | "OVERSIZED_PANEL"
  | "FLAT_BEAT_INTERVALS"
  | "TIGHT_ENDING"
  | "EMPTY_ENDING"
  | "NO_VISIBLE_CONTENT"
  | "ANALYSIS_TRUNCATED";

export interface StudioScrollRhythmInsight {
  readonly code: StudioScrollRhythmInsightCode;
  readonly severity: StudioScrollRhythmInsightSeverity;
  readonly pageId: string | null;
  /** A4 D4 (R15): 표시 문구 대신 해석용 params만 싣는다. */
  readonly params: Readonly<Record<string, string>>;
}

export interface StudioScrollRhythmPageMetric {
  readonly pageId: string;
  readonly canvasHeight: number;
  readonly screenCount: number;
  readonly visibleElementCount: number;
  readonly panelCount: number;
  readonly dialogueCount: number;
  readonly dialogueCharacters: number;
  readonly sfxCount: number;
  readonly sfxPerScreen: number;
  readonly sfxPerPanel: number | null;
  readonly longestSfxGapPx: number;
  readonly longestSfxGapScreens: number;
  readonly beatCount: number;
  readonly densityPerScreen: number;
  readonly dialogueCharactersPerScreen: number;
  readonly occupiedRatio: number;
  readonly breathingRoomRatio: number;
  readonly longestGapPx: number;
  readonly longestGapScreens: number;
  readonly tallestPanelScreens: number;
  readonly oversizedPanelCount: number;
  readonly beatIntervalVariation: number | null;
  readonly score: number;
}

export type StudioScrollEndingMode = "none" | "tight" | "balanced" | "reveal" | "empty";

export interface StudioScrollEndingAnalysis {
  readonly mode: StudioScrollEndingMode;
  readonly trailingWhitespacePx: number;
  readonly trailingWhitespaceScreens: number;
}

export interface StudioScrollRhythmSfxCategoryCount {
  readonly category: string;
  readonly count: number;
}

export interface StudioScrollRhythmAnalysis {
  readonly score: number;
  readonly grade: "A" | "B" | "C" | "D";
  readonly pages: readonly StudioScrollRhythmPageMetric[];
  readonly totalHeightPx: number;
  readonly totalScreenCount: number;
  readonly densePageCount: number;
  readonly totalSfxCount: number;
  readonly sfxDensePageCount: number;
  readonly longestSfxGapScreens: number;
  readonly sfxCategoryCounts: readonly StudioScrollRhythmSfxCategoryCount[];
  readonly breathingPageCount: number;
  readonly flatRhythmPageCount: number;
  readonly ending: StudioScrollEndingAnalysis;
  readonly insights: readonly StudioScrollRhythmInsight[];
  readonly truncated: boolean;
}

export interface AnalyzeStudioScrollRhythmOptions {
  readonly viewportHeightPx?: number;
  readonly pageGapPx?: number;
}

export interface StudioAutoScrollStepInput {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly viewportHeight: number;
  readonly speedPxPerSecond: number;
  readonly elapsedMs: number;
}

export interface StudioAutoScrollStep {
  readonly nextScrollTop: number;
  readonly maxScrollTop: number;
  readonly reachedEnd: boolean;
}

interface VerticalSpan {
  readonly start: number;
  readonly end: number;
}

/** SFX lettering thresholds and oversized panel screen ratio threshold. */
export const STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN = 4;
export const STUDIO_SCROLL_RHYTHM_SFX_CRITICAL_PER_SCREEN = 6;
export const STUDIO_SCROLL_RHYTHM_SFX_LONG_GAP_SCREENS = 2.5;
/** Single panel taller than 1.4 smartphone screens triggers OVERSIZED_PANEL. */
export const STUDIO_SCROLL_RHYTHM_OVERSIZED_PANEL_SCREENS = 1.4;
export const STUDIO_SCROLL_RHYTHM_OVERSIZED_PANEL_CRITICAL_SCREENS = 2.2;

const SFX_NAME_PATTERN = /(?:^|\b)sfx(?:\b|$)|효과음/iu;

/** Whether a visible element is SFX lettering (mirrors animatic cueKindForElement). */
export function isStudioScrollRhythmSfxElement(element: StudioScrollRhythmElementLike): boolean {
  if (element.animaticCueKind) return element.animaticCueKind === "sfx";
  const type = element.type.trim().toLowerCase();
  if (type === "sfx") return true;
  return type === "text" && SFX_NAME_PATTERN.test(element.name ?? "");
}

const DEFAULT_VIEWPORT_HEIGHT = 1_280;
const DEFAULT_PAGE_GAP = 24;
const PANEL_TYPES = new Set(["frame", "panel"]);
const DIALOGUE_TYPES = new Set(["bubble", "dialogue", "caption", "text"]);
const BEAT_TYPES = new Set([
  "frame", "panel", "bubble", "dialogue", "caption", "text", "image", "sticker", "bg3d", "vrm",
]);

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function round(value: number, precision = 2): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Bounded requestAnimationFrame step for the reader-speed simulator (caps gaps at 100ms). */
export function planStudioAutoScrollStep(input: StudioAutoScrollStepInput): StudioAutoScrollStep {
  const scrollHeight = Math.max(0, finiteOr(input.scrollHeight, 0));
  const viewportHeight = Math.max(0, finiteOr(input.viewportHeight, 0));
  const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  const current = clamp(finiteOr(input.scrollTop, 0), 0, maxScrollTop);
  const speed = clamp(finiteOr(input.speedPxPerSecond, 0), 0, 2_000);
  const elapsedSeconds = clamp(finiteOr(input.elapsedMs, 0), 0, 100) / 1_000;
  const nextScrollTop = clamp(current + speed * elapsedSeconds, 0, maxScrollTop);
  return {
    nextScrollTop: round(nextScrollTop),
    maxScrollTop: round(maxScrollTop),
    reachedEnd: nextScrollTop >= maxScrollTop - 1,
  };
}

function elementVerticalSpan(
  element: StudioScrollRhythmElementLike,
  canvasHeight: number,
): VerticalSpan | null {
  const y = finiteOr(element.y, Number.NaN);
  const height = finiteOr(element.height, Number.NaN);
  if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
    const start = clamp(y, 0, canvasHeight);
    const end = clamp(y + height, 0, canvasHeight);
    return end > start ? { start, end } : null;
  }
  const points = element.points;
  if (!points || points.length < 2) return null;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < points.length; index += 2) {
    const pointY = points[index];
    if (!Number.isFinite(pointY)) continue;
    minY = Math.min(minY, pointY as number);
    maxY = Math.max(maxY, pointY as number);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
  const start = clamp(minY, 0, canvasHeight);
  const end = clamp(Math.max(maxY, minY + 1), 0, canvasHeight);
  return end > start ? { start, end } : null;
}

function mergeSpans(spans: readonly VerticalSpan[]): VerticalSpan[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: VerticalSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (!last || span.start > last.end) {
      merged.push({ ...span });
      continue;
    }
    merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
  }
  return merged;
}

function spanGaps(spans: readonly VerticalSpan[], canvasHeight: number): VerticalSpan[] {
  if (spans.length === 0) return [{ start: 0, end: canvasHeight }];
  const gaps: VerticalSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) gaps.push({ start: cursor, end: span.start });
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < canvasHeight) gaps.push({ start: cursor, end: canvasHeight });
  return gaps;
}

function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function gradeForScore(score: number): StudioScrollRhythmAnalysis["grade"] {
  if (score >= 88) return "A";
  if (score >= 74) return "B";
  if (score >= 58) return "C";
  return "D";
}

function endingAnalysis(
  pages: readonly StudioScrollRhythmPageLike[],
  metrics: readonly StudioScrollRhythmPageMetric[],
  viewportHeight: number,
): StudioScrollEndingAnalysis {
  const lastPage = pages[pages.length - 1];
  const lastMetric = metrics[metrics.length - 1];
  if (!lastPage || !lastMetric || lastMetric.visibleElementCount === 0) {
    return {
      mode: "none",
      trailingWhitespacePx: lastMetric?.canvasHeight ?? 0,
      trailingWhitespaceScreens: lastMetric ? round(lastMetric.canvasHeight / viewportHeight) : 0,
    };
  }
  const visibleSpans = lastPage.elements
    .filter((element) => !element.hidden && finiteOr(element.opacity, 1) > 0)
    .map((element) => elementVerticalSpan(element, lastMetric.canvasHeight))
    .filter((span): span is VerticalSpan => span !== null);
  const lastEnd = visibleSpans.reduce((max, span) => Math.max(max, span.end), 0);
  const trailingWhitespacePx = Math.max(0, lastMetric.canvasHeight - lastEnd);
  const screens = trailingWhitespacePx / viewportHeight;
  const mode: StudioScrollEndingMode =
    screens < 0.12 ? "tight" : screens <= 0.4 ? "balanced" : screens <= 1.35 ? "reveal" : "empty";
  return {
    mode,
    trailingWhitespacePx: round(trailingWhitespacePx),
    trailingWhitespaceScreens: round(screens),
  };
}

function pushInsight(
  insights: StudioScrollRhythmInsight[],
  insight: StudioScrollRhythmInsight,
): void {
  if (insights.length < STUDIO_SCROLL_RHYTHM_LIMITS.maxInsights) insights.push(insight);
}

export function analyzeStudioScrollRhythm(
  sourcePages: readonly StudioScrollRhythmPageLike[],
  options: AnalyzeStudioScrollRhythmOptions = {},
): StudioScrollRhythmAnalysis {
  const viewportHeight = Math.max(1, finiteOr(options.viewportHeightPx, DEFAULT_VIEWPORT_HEIGHT));
  const pageGap = Math.max(0, finiteOr(options.pageGapPx, DEFAULT_PAGE_GAP));
  const pages = sourcePages.slice(0, STUDIO_SCROLL_RHYTHM_LIMITS.maxPages);
  let truncated = pages.length !== sourcePages.length;
  const insights: StudioScrollRhythmInsight[] = [];
  const metrics: StudioScrollRhythmPageMetric[] = [];
  const sfxCategoryCounts = new Map<string, number>();

  for (const page of pages) {
    const canvasHeight = Math.max(1, finiteOr(page.canvasH, 1_080));
    const sourceElements = page.elements.slice(0, STUDIO_SCROLL_RHYTHM_LIMITS.maxElementsPerPage);
    if (sourceElements.length !== page.elements.length) truncated = true;
    const visible = sourceElements.filter(
      (element) => !element.hidden && finiteOr(element.opacity, 1) > 0,
    );
    const spans: VerticalSpan[] = [];
    const sfxSpans: VerticalSpan[] = [];
    const beatCenters: number[] = [];
    let panelCount = 0;
    let oversizedPanelCount = 0;
    let tallestPanelHeightPx = 0;
    let dialogueCount = 0;
    let dialogueCharacters = 0;
    let sfxCount = 0;
    let weightedLoad = 0;

    for (const element of visible) {
      const type = element.type.trim().toLowerCase();
      const span = elementVerticalSpan(element, canvasHeight);
      if (span) spans.push(span);
      if (PANEL_TYPES.has(type)) {
        panelCount += 1;
        const explicitH = finiteOr(element.height, Number.NaN);
        const panelHeight =
          Number.isFinite(explicitH) && explicitH > 0
            ? explicitH
            : span
              ? span.end - span.start
              : 0;
        if (panelHeight > tallestPanelHeightPx) tallestPanelHeightPx = panelHeight;
        if (panelHeight / viewportHeight > STUDIO_SCROLL_RHYTHM_OVERSIZED_PANEL_SCREENS) {
          oversizedPanelCount += 1;
        }
      }
      const sfx = isStudioScrollRhythmSfxElement(element);
      if (sfx) {
        sfxCount += 1;
        if (span) sfxSpans.push(span);
        const category = element.sfxCategory?.trim();
        if (category) sfxCategoryCounts.set(category, (sfxCategoryCounts.get(category) ?? 0) + 1);
      }
      if (!sfx && DIALOGUE_TYPES.has(type)) {
        dialogueCount += 1;
        dialogueCharacters += (element.text ?? "").slice(
          0,
          STUDIO_SCROLL_RHYTHM_LIMITS.maxTextCodeUnits,
        ).length;
      }
      if (span && BEAT_TYPES.has(type)) beatCenters.push((span.start + span.end) / 2);

      if (PANEL_TYPES.has(type)) weightedLoad += 1;
      else if (DIALOGUE_TYPES.has(type)) weightedLoad += 0.9;
      else if (type === "image" || type === "bg3d" || type === "vrm") weightedLoad += 0.75;
      else weightedLoad += 0.35;
    }

    beatCenters.sort((a, b) => a - b);
    const beatIntervals: number[] = [];
    for (let index = 1; index < beatCenters.length; index += 1) {
      beatIntervals.push((beatCenters[index] as number) - (beatCenters[index - 1] as number));
    }
    const beatIntervalVariation = coefficientOfVariation(beatIntervals);
    const merged = mergeSpans(spans);
    const gaps = spanGaps(merged, canvasHeight);
    const occupied = merged.reduce((sum, span) => sum + (span.end - span.start), 0);
    const whitespace = Math.max(0, canvasHeight - occupied);
    const longestGapPx = gaps.reduce((longest, gap) => Math.max(longest, gap.end - gap.start), 0);
    const screenCount = canvasHeight / viewportHeight;
    const sfxPerScreen = sfxCount / Math.max(screenCount, 0.25);
    const sfxGaps = spanGaps(mergeSpans(sfxSpans), canvasHeight);
    const longestSfxGapPxRaw = sfxGaps.reduce(
      (longest, gap) => Math.max(longest, gap.end - gap.start),
      0,
    );
    const densityPerScreen = weightedLoad / Math.max(screenCount, 0.25);
    const dialogueCharactersPerScreen = dialogueCharacters / Math.max(screenCount, 0.25);
    const breathingRoomRatio = whitespace / canvasHeight;
    const tallestPanelScreens = tallestPanelHeightPx / viewportHeight;

    let score = 100;
    if (visible.length === 0) score -= 35;
    if (densityPerScreen > 8) score -= Math.min(24, (densityPerScreen - 8) * 3);
    if (dialogueCharactersPerScreen > 260) {
      score -= Math.min(18, (dialogueCharactersPerScreen - 260) / 24);
    }
    if (breathingRoomRatio < 0.06 && visible.length > 0) score -= 16;
    if (longestGapPx / viewportHeight > 1.4 && visible.length > 0) score -= 8;
    if (oversizedPanelCount > 0) score -= Math.min(12, oversizedPanelCount * 6);
    if (beatIntervalVariation !== null && beatIntervalVariation < 0.12) score -= 10;
    if (sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN) {
      score -= Math.min(10, (sfxPerScreen - STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN) * 2);
    }

    metrics.push({
      pageId: page.id,
      canvasHeight: round(canvasHeight),
      screenCount: round(screenCount),
      visibleElementCount: visible.length,
      panelCount,
      dialogueCount,
      dialogueCharacters,
      sfxCount,
      sfxPerScreen: round(sfxPerScreen),
      sfxPerPanel: panelCount > 0 ? round(sfxCount / panelCount) : null,
      longestSfxGapPx: round(longestSfxGapPxRaw),
      longestSfxGapScreens: round(longestSfxGapPxRaw / viewportHeight),
      beatCount: beatCenters.length,
      densityPerScreen: round(densityPerScreen),
      dialogueCharactersPerScreen: round(dialogueCharactersPerScreen),
      occupiedRatio: round(occupied / canvasHeight),
      breathingRoomRatio: round(breathingRoomRatio),
      longestGapPx: round(longestGapPx),
      longestGapScreens: round(longestGapPx / viewportHeight),
      tallestPanelScreens: round(tallestPanelScreens),
      oversizedPanelCount,
      beatIntervalVariation: beatIntervalVariation === null ? null : round(beatIntervalVariation, 3),
      score: Math.round(clamp(score, 0, 100)),
    });

    if (visible.length === 0) {
      pushInsight(insights, { code: "NO_VISIBLE_CONTENT", severity: "warning", pageId: page.id, params: {} });
    }
    if (densityPerScreen > 8) {
      pushInsight(insights, {
        code: "DENSE_PAGE",
        severity: densityPerScreen > 12 ? "critical" : "warning",
        pageId: page.id,
        params: { density: String(round(densityPerScreen, 1)) },
      });
    }
    if (dialogueCharactersPerScreen > 260) {
      pushInsight(insights, {
        code: "DIALOGUE_LOAD",
        severity: dialogueCharactersPerScreen > 400 ? "critical" : "warning",
        pageId: page.id,
        params: { dialogueChars: String(Math.round(dialogueCharactersPerScreen)) },
      });
    }
    if (sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN) {
      pushInsight(insights, {
        code: "SFX_DENSE",
        severity: sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_CRITICAL_PER_SCREEN ? "critical" : "warning",
        pageId: page.id,
        params: { sfx: String(round(sfxPerScreen, 1)) },
      });
    }
    if (breathingRoomRatio < 0.06 && visible.length > 0) {
      pushInsight(insights, {
        code: "NO_BREATHING_ROOM",
        severity: "warning",
        pageId: page.id,
        params: { ratio: String(Math.round(breathingRoomRatio * 100)) },
      });
    }
    if (longestGapPx / viewportHeight > 1.4 && visible.length > 0) {
      pushInsight(insights, {
        code: "LONG_EMPTY_RUN",
        severity: "info",
        pageId: page.id,
        params: { gapScreens: String(round(longestGapPx / viewportHeight, 1)) },
      });
    }
    if (oversizedPanelCount > 0) {
      pushInsight(insights, {
        code: "OVERSIZED_PANEL",
        severity:
          tallestPanelScreens > STUDIO_SCROLL_RHYTHM_OVERSIZED_PANEL_CRITICAL_SCREENS
            ? "critical"
            : "warning",
        pageId: page.id,
        params: {
          panelScreens: String(round(tallestPanelScreens, 1)),
          count: String(oversizedPanelCount),
        },
      });
    }
    if (beatIntervalVariation !== null && beatIntervalVariation < 0.12) {
      pushInsight(insights, { code: "FLAT_BEAT_INTERVALS", severity: "info", pageId: page.id, params: {} });
    }
  }

  const totalHeightPx =
    metrics.reduce((sum, metric) => sum + metric.canvasHeight, 0) +
    Math.max(0, metrics.length - 1) * pageGap;
  const ending = endingAnalysis(pages, metrics, viewportHeight);
  if (ending.mode === "tight") {
    pushInsight(insights, { code: "TIGHT_ENDING", severity: "info", pageId: metrics.at(-1)?.pageId ?? null, params: {} });
  } else if (ending.mode === "empty") {
    pushInsight(insights, {
      code: "EMPTY_ENDING",
      severity: "warning",
      pageId: metrics.at(-1)?.pageId ?? null,
      params: { screens: String(ending.trailingWhitespaceScreens) },
    });
  }

  const totalSfxCount = metrics.reduce((sum, metric) => sum + metric.sfxCount, 0);
  if (totalSfxCount > 0) {
    for (const metric of metrics) {
      if (metric.longestSfxGapScreens > STUDIO_SCROLL_RHYTHM_SFX_LONG_GAP_SCREENS) {
        pushInsight(insights, {
          code: "SFX_LONG_GAP",
          severity: "info",
          pageId: metric.pageId,
          params: { gapScreens: String(round(metric.longestSfxGapScreens, 1)) },
        });
      }
    }
  }

  if (truncated) {
    if (insights.length >= STUDIO_SCROLL_RHYTHM_LIMITS.maxInsights) insights.pop();
    pushInsight(insights, { code: "ANALYSIS_TRUNCATED", severity: "warning", pageId: null, params: {} });
  }

  const averageScore =
    metrics.length > 0 ? metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length : 0;
  const endingPenalty = ending.mode === "empty" ? 8 : ending.mode === "tight" ? 3 : 0;
  const score = Math.round(clamp(averageScore - endingPenalty, 0, 100));

  return {
    score,
    grade: gradeForScore(score),
    pages: metrics,
    totalHeightPx: round(totalHeightPx),
    totalScreenCount: round(totalHeightPx / viewportHeight),
    densePageCount: metrics.filter((metric) => metric.densityPerScreen > 8).length,
    totalSfxCount,
    sfxDensePageCount: metrics.filter(
      (metric) => metric.sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN,
    ).length,
    longestSfxGapScreens:
      totalSfxCount > 0
        ? round(metrics.reduce((longest, metric) => Math.max(longest, metric.longestSfxGapScreens), 0))
        : 0,
    sfxCategoryCounts: Object.freeze(
      [...sfxCategoryCounts.entries()]
        .map(([category, count]) => Object.freeze({ category, count }))
        .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : 1)),
    ),
    breathingPageCount: metrics.filter((metric) => metric.breathingRoomRatio >= 0.12).length,
    flatRhythmPageCount: metrics.filter(
      (metric) => metric.beatIntervalVariation !== null && metric.beatIntervalVariation < 0.12,
    ).length,
    ending,
    insights,
    truncated,
  };
}

export interface ScrollRhythmShotInput {
  readonly shotId: string;
  readonly beatId: string;
  readonly order: number;
  readonly heightPx: number;
  readonly gapAfterPx: number;
  readonly dialogueRatio: number;
  readonly shotSize: StudioShotSize;
}

export interface ScrollRhythmEpisodeInput {
  readonly episodeId: string;
  readonly label: string;
  readonly shots: readonly ScrollRhythmShotInput[];
  readonly pageMeta?: { readonly shotCount: number; readonly totalHeightPx: number };
}

export interface ScrollRhythmShotMetric {
  readonly shotId: string;
  readonly beatId: string;
  readonly order: number;
  readonly dialogueRatio: number;
  readonly heightPx: number;
  readonly gapAfterPx: number;
  readonly totalPx: number;
  readonly emptyCut: boolean;
  readonly shotSize: StudioShotSize;
}

export type ScrollRhythmSegmentMarker = "dialogue-above-average";

export interface ScrollRhythmSegment {
  readonly id: string;
  readonly startOrder: number;
  readonly endOrder: number;
  readonly beatIds: readonly string[];
  readonly markers: readonly ScrollRhythmSegmentMarker[];
  readonly dialogueRatioMean: number;
  readonly dialogueRatioVsEpisodeMean: number | null;
  readonly totalPx: number;
}

export interface ScrollRhythmEmptyRun {
  readonly startOrder: number;
  readonly endOrder: number;
  readonly beatIds: readonly string[];
  readonly length: number;
}

export interface ScrollRhythmBaseline {
  readonly episodeCount: number;
  readonly meanDialogueRatio: number | null;
  readonly meanShotCount: number;
  readonly meanTotalHeightPx: number;
}

export interface ScrollRhythmEpisodeReport {
  readonly episodeId: string;
  readonly label: string;
  readonly source: "planner" | "page-meta";
  readonly shots: readonly ScrollRhythmShotMetric[];
  readonly segments: readonly ScrollRhythmSegment[];
  readonly emptyRuns: readonly ScrollRhythmEmptyRun[];
  readonly shotCount: number;
  readonly totalHeightPx: number;
  readonly meanDialogueRatio: number | null;
  readonly meanGapPx: number | null;
  readonly emptyCutCount: number;
  readonly shotSizeChangeRate: number | null;
  readonly baseline: ScrollRhythmBaseline | null;
  readonly dialogueRatioVsBaseline: number | null;
  readonly totalHeightVsBaseline: number | null;
}

export interface ScrollRhythmReport {
  readonly episodes: readonly ScrollRhythmEpisodeReport[];
}

function scrollRhythmMean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function divideRatios(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function buildScrollRhythmPlannerEpisode(
  input: ScrollRhythmEpisodeInput,
  priorPlanner: readonly ScrollRhythmEpisodeReport[],
): ScrollRhythmEpisodeReport {
  const shots: ScrollRhythmShotMetric[] = [...input.shots]
    .sort((a, b) => a.order - b.order)
    .map((shot) => ({
      shotId: shot.shotId,
      beatId: shot.beatId,
      order: shot.order,
      dialogueRatio: shot.dialogueRatio,
      heightPx: shot.heightPx,
      gapAfterPx: shot.gapAfterPx,
      totalPx: shot.heightPx + shot.gapAfterPx,
      emptyCut: shot.dialogueRatio <= 0,
      shotSize: shot.shotSize,
    }));
  const meanDialogueRatio = scrollRhythmMean(shots.map((shot) => shot.dialogueRatio));
  const meanGapPx = scrollRhythmMean(shots.map((shot) => shot.gapAfterPx));
  const totalHeightPx = shots.reduce((sum, shot) => sum + shot.totalPx, 0);
  const emptyCutCount = shots.filter((shot) => shot.emptyCut).length;
  const sizeChanges = shots.slice(1).filter((shot, index) => shot.shotSize !== shots[index]?.shotSize).length;
  const shotSizeChangeRate = shots.length >= 2 ? sizeChanges / (shots.length - 1) : null;

  const segments: ScrollRhythmSegment[] = [];
  const emptyRuns: ScrollRhythmEmptyRun[] = [];
  let runStart = 0;
  const closeRun = (endExclusive: number): void => {
    const run = shots.slice(runStart, endExclusive);
    const first = run[0];
    const last = run[run.length - 1];
    if (!first || !last) return;
    const dialogueRatioMean = scrollRhythmMean(run.map((shot) => shot.dialogueRatio)) ?? 0;
    const markers: ScrollRhythmSegmentMarker[] =
      meanDialogueRatio !== null && meanDialogueRatio > 0 && dialogueRatioMean > meanDialogueRatio
        ? ["dialogue-above-average"]
        : [];
    segments.push({
      id: `seg-${first.order}`,
      startOrder: first.order,
      endOrder: last.order,
      beatIds: Object.freeze(run.map((shot) => shot.beatId)),
      markers: Object.freeze(markers),
      dialogueRatioMean,
      dialogueRatioVsEpisodeMean: divideRatios(dialogueRatioMean, meanDialogueRatio),
      totalPx: run.reduce((sum, shot) => sum + shot.totalPx, 0),
    });
    if (run.length >= 2 && run.every((shot) => shot.emptyCut)) {
      emptyRuns.push({
        startOrder: first.order,
        endOrder: last.order,
        beatIds: Object.freeze(run.map((shot) => shot.beatId)),
        length: run.length,
      });
    }
  };
  for (let index = 1; index <= shots.length; index += 1) {
    const previous = shots[index - 1];
    const current = shots[index];
    if (!previous || (current && current.emptyCut === previous.emptyCut)) continue;
    closeRun(index);
    runStart = index;
  }

  const baseline: ScrollRhythmBaseline | null =
    priorPlanner.length > 0
      ? {
          episodeCount: priorPlanner.length,
          meanDialogueRatio: scrollRhythmMean(priorPlanner.map((entry) => entry.meanDialogueRatio ?? 0)),
          meanShotCount: scrollRhythmMean(priorPlanner.map((entry) => entry.shotCount)) ?? 0,
          meanTotalHeightPx: scrollRhythmMean(priorPlanner.map((entry) => entry.totalHeightPx)) ?? 0,
        }
      : null;

  return {
    episodeId: input.episodeId,
    label: input.label,
    source: "planner",
    shots: Object.freeze(shots),
    segments: Object.freeze(segments),
    emptyRuns: Object.freeze(emptyRuns),
    shotCount: shots.length,
    totalHeightPx,
    meanDialogueRatio,
    meanGapPx,
    emptyCutCount,
    shotSizeChangeRate,
    baseline,
    dialogueRatioVsBaseline: divideRatios(meanDialogueRatio, baseline?.meanDialogueRatio ?? null),
    totalHeightVsBaseline: divideRatios(totalHeightPx, baseline?.meanTotalHeightPx ?? null),
  };
}

function buildScrollRhythmPageMetaEpisode(input: ScrollRhythmEpisodeInput): ScrollRhythmEpisodeReport {
  return {
    episodeId: input.episodeId,
    label: input.label,
    source: "page-meta",
    shots: Object.freeze([]),
    segments: Object.freeze([]),
    emptyRuns: Object.freeze([]),
    shotCount: input.pageMeta?.shotCount ?? 0,
    totalHeightPx: input.pageMeta?.totalHeightPx ?? 0,
    meanDialogueRatio: null,
    meanGapPx: null,
    emptyCutCount: 0,
    shotSizeChangeRate: null,
    baseline: null,
    dialogueRatioVsBaseline: null,
    totalHeightVsBaseline: null,
  };
}

export function deriveScrollRhythmReport(
  episodes: readonly ScrollRhythmEpisodeInput[],
): ScrollRhythmReport {
  const reports: ScrollRhythmEpisodeReport[] = [];
  const priorPlanner: ScrollRhythmEpisodeReport[] = [];
  for (const input of episodes) {
    const report =
      input.shots.length > 0
        ? buildScrollRhythmPlannerEpisode(input, priorPlanner)
        : buildScrollRhythmPageMetaEpisode(input);
    reports.push(report);
    if (report.source === "planner") priorPlanner.push(report);
  }
  return { episodes: Object.freeze(reports) };
}
