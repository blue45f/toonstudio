/**
 * Deterministic vertical-webtoon pacing analysis.
 *
 * The analyzer deliberately consumes the same lightweight page/element shape as the Studio
 * thumbnail pipeline. It never reads pixels, DOM state, network data, or React state, so preview,
 * export preflight, a future Worker, and tests can share one bounded result.
 *
 * SFX rhythm (REPORT L-4): visible sound-effect lettering is aggregated as one more
 * rhythm signal on the same pages — per-screen density, per-panel rate, the longest
 * stretch without any SFX, and a category breakdown when the host recorded one.
 * An element counts as SFX under the exact rule the animatic timeline already uses
 * (`animaticCueKind === "sfx"`, or a text element whose name mentions sfx/효과음),
 * plus an explicit element type of "sfx". SFX lettering is never counted as dialogue.
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
  /**
   * Category of the SFX entry this element was placed from (preset or lexicon id/label),
   * when the host recorded it. Free-form: the preset and lexicon taxonomies differ.
   */
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
  | "FLAT_BEAT_INTERVALS"
  | "TIGHT_ENDING"
  | "EMPTY_ENDING"
  | "NO_VISIBLE_CONTENT"
  | "ANALYSIS_TRUNCATED";

export interface StudioScrollRhythmInsight {
  readonly code: StudioScrollRhythmInsightCode;
  readonly severity: StudioScrollRhythmInsightSeverity;
  readonly pageId: string | null;
  readonly title: string;
  readonly detail: string;
  readonly suggestion: string;
}

export interface StudioScrollRhythmPageMetric {
  readonly pageId: string;
  readonly canvasHeight: number;
  readonly screenCount: number;
  readonly visibleElementCount: number;
  readonly panelCount: number;
  readonly dialogueCount: number;
  readonly dialogueCharacters: number;
  /** Visible SFX lettering elements on the page. */
  readonly sfxCount: number;
  readonly sfxPerScreen: number;
  /** SFX per panel (frame/panel element). Null when the page has no panel element. */
  readonly sfxPerPanel: number | null;
  /** Longest vertical stretch without any SFX element, in px and in screens. */
  readonly longestSfxGapPx: number;
  readonly longestSfxGapScreens: number;
  readonly beatCount: number;
  readonly densityPerScreen: number;
  readonly dialogueCharactersPerScreen: number;
  readonly occupiedRatio: number;
  readonly breathingRoomRatio: number;
  readonly longestGapPx: number;
  readonly longestGapScreens: number;
  readonly beatIntervalVariation: number | null;
  readonly score: number;
}

export type StudioScrollEndingMode = "none" | "tight" | "balanced" | "reveal" | "empty";

export interface StudioScrollEndingAnalysis {
  readonly mode: StudioScrollEndingMode;
  readonly label: string;
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
  /** Longest SFX-free stretch across pages, in screens. 0 when no SFX exists at all. */
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

/** SFX lettering above this many per screen starts to crowd the rhythm. */
export const STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN = 4;
export const STUDIO_SCROLL_RHYTHM_SFX_CRITICAL_PER_SCREEN = 6;
/** SFX-free stretch (in screens) long enough to surface as a rhythm gap. */
export const STUDIO_SCROLL_RHYTHM_SFX_LONG_GAP_SCREENS = 2.5;

const SFX_NAME_PATTERN = /(?:^|\b)sfx(?:\b|$)|효과음/iu;

/**
 * Whether a visible element is SFX lettering. Mirrors the animatic timeline's
 * cueKindForElement rule so both pipes classify the same element the same way.
 */
export function isStudioScrollRhythmSfxElement(
  element: StudioScrollRhythmElementLike
): boolean {
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
  "frame",
  "panel",
  "bubble",
  "dialogue",
  "caption",
  "text",
  "image",
  "sticker",
  "bg3d",
  "vrm",
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

/**
 * One bounded requestAnimationFrame step for the reader-speed simulator.
 * Long background-tab gaps are capped at 100ms so returning to the tab never skips several pages.
 */
export function planStudioAutoScrollStep(
  input: StudioAutoScrollStepInput
): StudioAutoScrollStep {
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
  canvasHeight: number
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
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
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
  viewportHeight: number
): StudioScrollEndingAnalysis {
  const lastPage = pages[pages.length - 1];
  const lastMetric = metrics[metrics.length - 1];
  if (!lastPage || !lastMetric || lastMetric.visibleElementCount === 0) {
    return {
      mode: "none",
      label: "엔딩 비트 없음",
      trailingWhitespacePx: lastMetric?.canvasHeight ?? 0,
      trailingWhitespaceScreens: lastMetric
        ? round(lastMetric.canvasHeight / viewportHeight)
        : 0,
    };
  }

  const visibleSpans = lastPage.elements
    .filter((element) => !element.hidden && finiteOr(element.opacity, 1) > 0)
    .map((element) => elementVerticalSpan(element, lastMetric.canvasHeight))
    .filter((span): span is VerticalSpan => span !== null);
  const lastEnd = visibleSpans.reduce((max, span) => Math.max(max, span.end), 0);
  const trailingWhitespacePx = Math.max(0, lastMetric.canvasHeight - lastEnd);
  const screens = trailingWhitespacePx / viewportHeight;

  if (screens < 0.12) {
    return {
      mode: "tight",
      label: "엔딩이 촘촘함",
      trailingWhitespacePx: round(trailingWhitespacePx),
      trailingWhitespaceScreens: round(screens),
    };
  }
  if (screens <= 0.4) {
    return {
      mode: "balanced",
      label: "균형 잡힌 엔딩",
      trailingWhitespacePx: round(trailingWhitespacePx),
      trailingWhitespaceScreens: round(screens),
    };
  }
  if (screens <= 1.35) {
    return {
      mode: "reveal",
      label: "클리프행어 호흡",
      trailingWhitespacePx: round(trailingWhitespacePx),
      trailingWhitespaceScreens: round(screens),
    };
  }
  return {
    mode: "empty",
    label: "엔딩 여백이 김",
    trailingWhitespacePx: round(trailingWhitespacePx),
    trailingWhitespaceScreens: round(screens),
  };
}

function pushInsight(
  insights: StudioScrollRhythmInsight[],
  insight: StudioScrollRhythmInsight
): void {
  if (insights.length < STUDIO_SCROLL_RHYTHM_LIMITS.maxInsights) insights.push(insight);
}

export function analyzeStudioScrollRhythm(
  sourcePages: readonly StudioScrollRhythmPageLike[],
  options: AnalyzeStudioScrollRhythmOptions = {}
): StudioScrollRhythmAnalysis {
  const viewportHeight = Math.max(
    1,
    finiteOr(options.viewportHeightPx, DEFAULT_VIEWPORT_HEIGHT)
  );
  const pageGap = Math.max(0, finiteOr(options.pageGapPx, DEFAULT_PAGE_GAP));
  const pages = sourcePages.slice(0, STUDIO_SCROLL_RHYTHM_LIMITS.maxPages);
  let truncated = pages.length !== sourcePages.length;
  const insights: StudioScrollRhythmInsight[] = [];
  const metrics: StudioScrollRhythmPageMetric[] = [];
  const sfxCategoryCounts = new Map<string, number>();

  for (const page of pages) {
    const canvasHeight = Math.max(1, finiteOr(page.canvasH, 1_080));
    const sourceElements = page.elements.slice(
      0,
      STUDIO_SCROLL_RHYTHM_LIMITS.maxElementsPerPage
    );
    if (sourceElements.length !== page.elements.length) truncated = true;
    const visible = sourceElements.filter(
      (element) => !element.hidden && finiteOr(element.opacity, 1) > 0
    );
    const spans: VerticalSpan[] = [];
    const sfxSpans: VerticalSpan[] = [];
    const beatCenters: number[] = [];
    let panelCount = 0;
    let dialogueCount = 0;
    let dialogueCharacters = 0;
    let sfxCount = 0;
    let weightedLoad = 0;

    for (const element of visible) {
      const type = element.type.trim().toLowerCase();
      const span = elementVerticalSpan(element, canvasHeight);
      if (span) spans.push(span);
      if (PANEL_TYPES.has(type)) panelCount += 1;
      const sfx = isStudioScrollRhythmSfxElement(element);
      if (sfx) {
        sfxCount += 1;
        if (span) sfxSpans.push(span);
        const category = element.sfxCategory?.trim();
        if (category) {
          sfxCategoryCounts.set(category, (sfxCategoryCounts.get(category) ?? 0) + 1);
        }
      }
      if (!sfx && DIALOGUE_TYPES.has(type)) {
        dialogueCount += 1;
        dialogueCharacters += (element.text ?? "").slice(
          0,
          STUDIO_SCROLL_RHYTHM_LIMITS.maxTextCodeUnits
        ).length;
      }
      if (span && BEAT_TYPES.has(type)) {
        beatCenters.push((span.start + span.end) / 2);
      }

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
    const longestGapPx = gaps.reduce(
      (longest, gap) => Math.max(longest, gap.end - gap.start),
      0
    );
    const screenCount = canvasHeight / viewportHeight;
    const sfxPerScreen = sfxCount / Math.max(screenCount, 0.25);
    const sfxGaps = spanGaps(mergeSpans(sfxSpans), canvasHeight);
    const longestSfxGapPxRaw = sfxGaps.reduce(
      (longest, gap) => Math.max(longest, gap.end - gap.start),
      0
    );
    const densityPerScreen = weightedLoad / Math.max(screenCount, 0.25);
    const dialogueCharactersPerScreen =
      dialogueCharacters / Math.max(screenCount, 0.25);
    const breathingRoomRatio = whitespace / canvasHeight;

    let score = 100;
    if (visible.length === 0) score -= 35;
    if (densityPerScreen > 8) score -= Math.min(24, (densityPerScreen - 8) * 3);
    if (dialogueCharactersPerScreen > 260) {
      score -= Math.min(18, (dialogueCharactersPerScreen - 260) / 24);
    }
    if (breathingRoomRatio < 0.06 && visible.length > 0) score -= 16;
    if (longestGapPx / viewportHeight > 1.4 && visible.length > 0) score -= 8;
    if (beatIntervalVariation !== null && beatIntervalVariation < 0.12) score -= 10;
    if (sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN) {
      score -= Math.min(
        10,
        (sfxPerScreen - STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN) * 2
      );
    }

    const metric: StudioScrollRhythmPageMetric = {
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
      beatIntervalVariation:
        beatIntervalVariation === null ? null : round(beatIntervalVariation, 3),
      score: Math.round(clamp(score, 0, 100)),
    };
    metrics.push(metric);

    if (visible.length === 0) {
      pushInsight(insights, {
        code: "NO_VISIBLE_CONTENT",
        severity: "warning",
        pageId: page.id,
        title: "빈 페이지",
        detail: "독자가 머무를 시각 비트가 없습니다.",
        suggestion: "의도된 여백이 아니라면 컷, 대사 또는 전환 비트를 추가하세요.",
      });
    }
    if (densityPerScreen > 8) {
      pushInsight(insights, {
        code: "DENSE_PAGE",
        severity: densityPerScreen > 12 ? "critical" : "warning",
        pageId: page.id,
        title: "정보 밀도가 높음",
        detail: `한 화면당 가중 요소가 약 ${round(densityPerScreen, 1)}개입니다.`,
        suggestion: "컷을 분리하거나 컷 사이 여백을 늘려 시선 이동을 단순화하세요.",
      });
    }
    if (dialogueCharactersPerScreen > 260) {
      pushInsight(insights, {
        code: "DIALOGUE_LOAD",
        severity: dialogueCharactersPerScreen > 400 ? "critical" : "warning",
        pageId: page.id,
        title: "대사 호흡이 김",
        detail: `한 화면당 약 ${Math.round(dialogueCharactersPerScreen)}자의 대사가 배치됐습니다.`,
        suggestion: "말풍선을 나누거나 행동 컷 사이에 대사를 분산하세요.",
      });
    }
    if (sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN) {
      pushInsight(insights, {
        code: "SFX_DENSE",
        severity:
          sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_CRITICAL_PER_SCREEN
            ? "critical"
            : "warning",
        pageId: page.id,
        title: "효과음이 몰린 페이지",
        detail: `한 화면당 효과음이 약 ${round(sfxPerScreen, 1)}개 배치됐습니다.`,
        suggestion: "효과음을 줄이거나 인접 컷으로 나눠 배치하면 체감 속도가 완만해집니다.",
      });
    }
    if (breathingRoomRatio < 0.06 && visible.length > 0) {
      pushInsight(insights, {
        code: "NO_BREATHING_ROOM",
        severity: "warning",
        pageId: page.id,
        title: "호흡 여백 부족",
        detail: `비어 있는 세로 구간이 전체의 ${Math.round(breathingRoomRatio * 100)}%입니다.`,
        suggestion: "감정 전환이나 장면 전환 앞뒤에 짧은 무음 여백을 확보하세요.",
      });
    }
    if (longestGapPx / viewportHeight > 1.4 && visible.length > 0) {
      pushInsight(insights, {
        code: "LONG_EMPTY_RUN",
        severity: "info",
        pageId: page.id,
        title: "긴 무음 구간",
        detail: `가장 긴 여백이 약 ${round(longestGapPx / viewportHeight, 1)}화면입니다.`,
        suggestion: "의도된 서스펜스인지 확인하고, 아니라면 다음 비트를 조금 당기세요.",
      });
    }
    if (beatIntervalVariation !== null && beatIntervalVariation < 0.12) {
      pushInsight(insights, {
        code: "FLAT_BEAT_INTERVALS",
        severity: "info",
        pageId: page.id,
        title: "컷 간격이 단조로움",
        detail: "주요 비트의 세로 간격이 거의 동일해 리듬 변화가 작습니다.",
        suggestion: "강조 컷 전후 간격을 대비시켜 속도감과 긴장도를 조절하세요.",
      });
    }
  }

  const totalHeightPx =
    metrics.reduce((sum, metric) => sum + metric.canvasHeight, 0) +
    Math.max(0, metrics.length - 1) * pageGap;
  const ending = endingAnalysis(pages, metrics, viewportHeight);
  if (ending.mode === "tight") {
    pushInsight(insights, {
      code: "TIGHT_ENDING",
      severity: "info",
      pageId: metrics.at(-1)?.pageId ?? null,
      title: "엔딩 비트가 화면 끝에 붙음",
      detail: "마지막 요소 뒤의 여백이 0.12화면보다 짧습니다.",
      suggestion: "다음 화 유도나 감정 잔상을 원한다면 짧은 여백을 추가하세요.",
    });
  } else if (ending.mode === "empty") {
    pushInsight(insights, {
      code: "EMPTY_ENDING",
      severity: "warning",
      pageId: metrics.at(-1)?.pageId ?? null,
      title: "엔딩 이후 여백이 김",
      detail: `마지막 비트 뒤에 약 ${ending.trailingWhitespaceScreens}화면이 비어 있습니다.`,
      suggestion: "의도된 클리프행어가 아니라면 캔버스 높이를 줄이거나 마지막 비트를 내리세요.",
    });
  }

  // SFX gaps are only a rhythm signal when the episode uses SFX at all — a work
  // with no SFX anywhere must not be flooded with gap notes.
  const totalSfxCount = metrics.reduce((sum, metric) => sum + metric.sfxCount, 0);
  if (totalSfxCount > 0) {
    for (const metric of metrics) {
      if (metric.longestSfxGapScreens > STUDIO_SCROLL_RHYTHM_SFX_LONG_GAP_SCREENS) {
        pushInsight(insights, {
          code: "SFX_LONG_GAP",
          severity: "info",
          pageId: metric.pageId,
          title: "효과음 없는 구간이 김",
          detail: `효과음이 없는 구간이 약 ${round(metric.longestSfxGapScreens, 1)}화면 이어집니다.`,
          suggestion:
            "의도된 정적이면 그대로 두고, 아니라면 중간 컷에 환경음·동작 효과음을 한두 개 배치해 보세요.",
        });
      }
    }
  }

  if (truncated) {
    if (insights.length >= STUDIO_SCROLL_RHYTHM_LIMITS.maxInsights) {
      // Keep the budget contract itself visible even when page-level findings filled the list.
      insights.pop();
    }
    pushInsight(insights, {
      code: "ANALYSIS_TRUNCATED",
      severity: "warning",
      pageId: null,
      title: "분석 예산 적용",
      detail: "대형 원고의 일부만 안전 예산 안에서 분석했습니다.",
      suggestion: "페이지 구간을 나눠 다시 분석하면 더 세밀한 결과를 얻을 수 있습니다.",
    });
  }

  const averageScore =
    metrics.length > 0
      ? metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length
      : 0;
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
      (metric) => metric.sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN
    ).length,
    longestSfxGapScreens:
      totalSfxCount > 0
        ? round(
            metrics.reduce(
              (longest, metric) => Math.max(longest, metric.longestSfxGapScreens),
              0
            )
          )
        : 0,
    sfxCategoryCounts: Object.freeze(
      [...sfxCategoryCounts.entries()]
        .map(([category, count]) => Object.freeze({ category, count }))
        .sort((a, b) => b.count - a.count || (a.category < b.category ? -1 : 1))
    ),
    breathingPageCount: metrics.filter((metric) => metric.breathingRoomRatio >= 0.12).length,
    flatRhythmPageCount: metrics.filter(
      (metric) =>
        metric.beatIntervalVariation !== null && metric.beatIntervalVariation < 0.12
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
  readonly pageMeta?: {
    readonly shotCount: number;
    readonly totalHeightPx: number;
  };
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
  const sizeChanges = shots.slice(1).filter((shot, index) => shot.shotSize !== shots[index].shotSize).length;
  const shotSizeChangeRate = shots.length >= 2 ? sizeChanges / (shots.length - 1) : null;

  const segments: ScrollRhythmSegment[] = [];
  const emptyRuns: ScrollRhythmEmptyRun[] = [];
  let runStart = 0;
  const closeRun = (endExclusive: number): void => {
    const run = shots.slice(runStart, endExclusive);
    if (run.length === 0) return;
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

  let baseline: ScrollRhythmBaseline | null = null;
  if (priorPlanner.length > 0) {
    baseline = {
      episodeCount: priorPlanner.length,
      meanDialogueRatio: scrollRhythmMean(
        priorPlanner.map((entry) => entry.meanDialogueRatio ?? 0),
      ),
      meanShotCount: scrollRhythmMean(priorPlanner.map((entry) => entry.shotCount)) ?? 0,
      meanTotalHeightPx: scrollRhythmMean(priorPlanner.map((entry) => entry.totalHeightPx)) ?? 0,
    };
  }
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
    const report = input.shots.length > 0
      ? buildScrollRhythmPlannerEpisode(input, priorPlanner)
      : buildScrollRhythmPageMetaEpisode(input);
    reports.push(report);
    if (report.source === "planner") priorPlanner.push(report);
  }
  return { episodes: Object.freeze(reports) };
}
