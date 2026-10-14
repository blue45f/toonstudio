/**
 * Studio Dialogue Narration Timing — 콘티 낭독 타이밍(체류 시간 추정)의 순수 코어.
 *
 * 대사 낭독(TTS) 음성을 실제로 만들지 않고, 텍스트만으로 회차 예상 읽기 시간을
 * 1차 추정한다(REPORT C-3). 추정 = 대사 낭독 시간 + 컷별 예상 체류의 합산.
 *
 *  - 대사 낭독 시간: 대사 수집은 기존 단일 소스 `collectDialogueItems` 를 그대로
 *    쓰고(읽기 순서·숨김 판정 공유), 가시 대사마다 공백 제외 글자수를 읽기
 *    속도로 나눈 값 + 대사 사이 호흡(pause)을 더한다. 읽기 속도 기본값
 *    12자/초는 애니매틱 자막 모델(studio-animatic-subtitles)의 기본값과 같다 —
 *    자막 표시 길이와 낭독 추정이 서로 어긋나지 않게 맞춘 것이다.
 *  - 컷별 체류: 컷은 페이지의 frame 요소(유효 기하가 있는 것)다. 체류 = 기본
 *    체류 + 컷 크기 가산(기준 면적 대비, 상한 있음) + 무대사 컷 가산(그림만으로
 *    읽는 컷). frame 이 없는 페이지는 페이지 전체를 컷 1개로 본다. 컷 크기
 *    가산의 기준 면적은 전형적인 한 컷(800×600 캔버스 px)이며, 샷 사이즈가
 *    캔버스 frame 에 저장되지 않는 현재 스키마에서 쓸 수 있는 가장 정직한
 *    대리값임을 명시한다(스토리보드 플래너의 샷 사이즈와는 별개 신호).
 *  - 숨김 대사는 기본 제외(spellcheck·말풍선 핏과 같은 규율), 잠금은 포함한다
 *    (읽기 시간은 편집 가능 여부와 무관). 공백뿐인 대사는 글자수 0으로 세지
 *    않는다 — "읽을 것이 없다"고 시간을 만들지 않는다.
 *  - 회차 간 비교: 회차 입력(라벨+페이지)을 시리즈 순서대로 받아 각 회차의
 *    추정과 직전 회차 대비·지난 회차 평균 대비 증감을 계산한다. 추정 자체가
 *    근사치이므로 증감은 "길어요/짧아요" 판정에 쓸 반올림값(%, 0.1 단위)으로만
 *    제공한다.
 *
 * 규칙: Konva/DOM 의존 없음(전부 순수·결정적), 입력 불변, 사용자 노출 문자열은
 * 한글. 모든 수치는 "예상" 추정치이며 실제 낭독·독서 속도와 다를 수 있다.
 */

import {
  collectDialogueItems,
  type DialoguePageLike,
} from "./studio-dialogue-batch";

// ── 추정 상수 (1차 추정 — 근거는 머리말 참조) ────────────────────────────────

/** 초당 읽는 글자수 기본값. 애니매틱 자막 모델 기본값과 동일. */
export const NARRATION_TIMING_DEFAULT_CHARS_PER_SECOND = 12;
export const NARRATION_TIMING_MIN_CHARS_PER_SECOND = 4;
export const NARRATION_TIMING_MAX_CHARS_PER_SECOND = 30;
/** 대사 한 줄이 끝나고 다음으로 넘어가는 호흡. */
export const NARRATION_TIMING_LINE_PAUSE_MS = 350;
/** 컷을 알아보는 최소 체류. */
export const NARRATION_CUT_BASE_DWELL_MS = 900;
/** 큰 컷(와이드 샷 대리값) 체류 가산 상한. */
export const NARRATION_CUT_MAX_SIZE_BONUS_MS = 1_500;
/** 크기 가산이 상한에 닿는 기준 면적(800×600 캔버스 px). */
export const NARRATION_CUT_REFERENCE_AREA = 800 * 600;
/** 대사가 없는 컷은 그림만으로 읽으므로 체류를 더 준다. */
export const NARRATION_SILENT_CUT_BONUS_MS = 600;

export type NarrationTimingOptions = {
  /** 초당 글자수. [4, 30] 으로 클램프, 비유한 값은 기본값. */
  charsPerSecond?: number;
  /** 숨김 대사까지 포함할지(기본 false — 검수 규율과 동일). */
  includeHidden?: boolean;
};

export type NarrationCutTiming = {
  pageId: string;
  /** 0 기준 페이지 순번. */
  pageIndex: number;
  /** 페이지 안 컷 순번(0 기준, 읽기 순서). */
  cutIndex: number;
  /** frame 요소 id. frame 없는 페이지의 페이지-컷이면 null. */
  frameId: string | null;
  dialogueCount: number;
  charCount: number;
  speechMs: number;
  dwellMs: number;
  totalMs: number;
  /** 대사가 하나도 없는 컷인지(무대사 가산 적용 여부). */
  silent: boolean;
};

export type NarrationPageTiming = {
  pageId: string;
  pageIndex: number;
  dialogueCount: number;
  charCount: number;
  speechMs: number;
  dwellMs: number;
  totalMs: number;
  cutCount: number;
  cuts: NarrationCutTiming[];
};

export type EpisodeNarrationTiming = {
  dialogueCount: number;
  charCount: number;
  cutCount: number;
  pageCount: number;
  /** 대사 낭독 추정 합계(ms). */
  speechMs: number;
  /** 컷 체류 추정 합계(ms). */
  dwellMs: number;
  /** 회차 예상 읽기 시간(ms) = speechMs + dwellMs. */
  totalMs: number;
  /** 실제 적용된 초당 글자수(클램프 후). */
  charsPerSecond: number;
  pages: NarrationPageTiming[];
};

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeNarrationCharsPerSecond(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return NARRATION_TIMING_DEFAULT_CHARS_PER_SECOND;
  }
  return Math.min(
    NARRATION_TIMING_MAX_CHARS_PER_SECOND,
    Math.max(NARRATION_TIMING_MIN_CHARS_PER_SECOND, value)
  );
}

/** 낭독 글자수 — 공백(줄바꿈 포함)을 빼고 코드 포인트 단위로 센다. */
export function countNarrationChars(text: string): number {
  return [...text.replace(/\s/gu, "")].length;
}

/** 대사 한 건의 낭독 추정(ms) — 읽기 시간 + 다음 대사와의 호흡. */
export function estimateDialogueSpeechMs(
  text: string,
  charsPerSecond: number = NARRATION_TIMING_DEFAULT_CHARS_PER_SECOND
): number {
  const chars = countNarrationChars(text);
  if (chars === 0) return 0;
  const cps = normalizeNarrationCharsPerSecond(charsPerSecond);
  return Math.ceil((chars / cps) * 1_000) + NARRATION_TIMING_LINE_PAUSE_MS;
}

type FrameRect = {
  id: string;
  sourceIndex: number;
  order: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** studio-dialogue-batch 의 컷 수집과 같은 규칙(유효 기하 frame, 읽기 순서 정렬). */
function collectFrameRects(page: DialoguePageLike): FrameRect[] {
  return page.elements
    .flatMap((el, sourceIndex): FrameRect[] => {
      if (el.type !== "frame") return [];
      const x = finiteNumber(el.x);
      const y = finiteNumber(el.y);
      const width = finiteNumber(el.width);
      const height = finiteNumber(el.height);
      if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) {
        return [];
      }
      return [{ id: el.id, sourceIndex, order: finiteNumber(el.order), x, y, width, height }];
    })
    .sort((left, right) => {
      const leftBucket = left.order == null ? 1 : 0;
      const rightBucket = right.order == null ? 1 : 0;
      return (
        leftBucket - rightBucket ||
        (left.order ?? 0) - (right.order ?? 0) ||
        left.y - right.y ||
        left.x - right.x ||
        left.sourceIndex - right.sourceIndex
      );
    });
}

/** 대사가 어느 컷에 속하는지 — 명시 frameId 우선, 없으면 중심점 포함 최소 면적 frame. */
function assignFrameId(
  el: DialoguePageLike["elements"][number],
  frames: readonly FrameRect[]
): string | null {
  if (frames.length === 0) return null;
  if (el.frameId) {
    const explicit = frames.find((frame) => frame.id === el.frameId);
    if (explicit) return explicit.id;
  }
  const x = finiteNumber(el.x);
  const y = finiteNumber(el.y);
  if (x == null || y == null) return null;
  const centerX = x + Math.max(0, finiteNumber(el.width) ?? 0) / 2;
  const centerY = y + Math.max(0, finiteNumber(el.height) ?? 0) / 2;
  let best: FrameRect | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const frame of frames) {
    if (
      centerX < frame.x ||
      centerX > frame.x + frame.width ||
      centerY < frame.y ||
      centerY > frame.y + frame.height
    ) {
      continue;
    }
    const area = frame.width * frame.height;
    if (area < bestArea) {
      bestArea = area;
      best = frame;
    }
  }
  return best?.id ?? null;
}

function cutDwellMs(frame: FrameRect | null, silent: boolean): number {
  let dwell = NARRATION_CUT_BASE_DWELL_MS;
  if (frame) {
    const ratio = Math.min(1, (frame.width * frame.height) / NARRATION_CUT_REFERENCE_AREA);
    dwell += Math.round(NARRATION_CUT_MAX_SIZE_BONUS_MS * ratio);
  }
  if (silent) dwell += NARRATION_SILENT_CUT_BONUS_MS;
  return dwell;
}

// ── 회차 추정 ────────────────────────────────────────────────────────────────

export function estimateEpisodeNarrationTiming(
  pages: readonly DialoguePageLike[],
  options: NarrationTimingOptions = {}
): EpisodeNarrationTiming {
  const charsPerSecond = normalizeNarrationCharsPerSecond(options.charsPerSecond);
  const items = collectDialogueItems(pages).filter((item) => {
    if (!options.includeHidden && item.hidden) return false;
    return countNarrationChars(item.text) > 0;
  });

  const pageTimings: NarrationPageTiming[] = pages.map((page, pageIndex) => {
    const frames = collectFrameRects(page);
    const pageItems = items.filter((item) => item.pageIndex === pageIndex);
    const elementById = new Map(page.elements.map((el) => [el.id, el]));

    // 컷별 대사 배정. frame 이 있으면 frame 수만큼, 없으면 페이지-컷 1개.
    const cutBuckets = new Map<
      string,
      { frame: FrameRect | null; dialogueCount: number; charCount: number; speechMs: number }
    >();
    const bucketKey = (frameId: string | null) => frameId ?? "__page__";
    if (frames.length > 0) {
      for (const frame of frames) {
        cutBuckets.set(bucketKey(frame.id), { frame, dialogueCount: 0, charCount: 0, speechMs: 0 });
      }
    } else {
      cutBuckets.set(bucketKey(null), { frame: null, dialogueCount: 0, charCount: 0, speechMs: 0 });
    }

    // 어떤 컷에도 속하지 않는 대사(frame 밖)는 낭독 시간만 회차·페이지 합계에 더한다.
    let unassignedSpeechMs = 0;
    let unassignedCharCount = 0;
    let unassignedDialogueCount = 0;
    for (const item of pageItems) {
      const el = elementById.get(item.id);
      const frameId = el ? assignFrameId(el, frames) : null;
      const bucket =
        frames.length === 0 ? cutBuckets.get(bucketKey(null)) : cutBuckets.get(bucketKey(frameId));
      const speechMs = estimateDialogueSpeechMs(item.text, charsPerSecond);
      const charCount = countNarrationChars(item.text);
      if (bucket) {
        bucket.dialogueCount += 1;
        bucket.charCount += charCount;
        bucket.speechMs += speechMs;
      } else {
        unassignedDialogueCount += 1;
        unassignedCharCount += charCount;
        unassignedSpeechMs += speechMs;
      }
    }

    const orderedFrames: (FrameRect | null)[] =
      frames.length > 0 ? frames : [null];
    const cuts: NarrationCutTiming[] = orderedFrames.map((frame, cutIndex) => {
      const bucket = cutBuckets.get(bucketKey(frame?.id ?? null)) ?? {
        frame,
        dialogueCount: 0,
        charCount: 0,
        speechMs: 0,
      };
      const silent = bucket.dialogueCount === 0;
      const dwellMs = cutDwellMs(frame, silent);
      return {
        pageId: page.id,
        pageIndex,
        cutIndex,
        frameId: frame?.id ?? null,
        dialogueCount: bucket.dialogueCount,
        charCount: bucket.charCount,
        speechMs: bucket.speechMs,
        dwellMs,
        totalMs: bucket.speechMs + dwellMs,
        silent,
      };
    });

    const speechMs = cuts.reduce((sum, cut) => sum + cut.speechMs, 0) + unassignedSpeechMs;
    const dwellMs = cuts.reduce((sum, cut) => sum + cut.dwellMs, 0);
    return {
      pageId: page.id,
      pageIndex,
      dialogueCount:
        cuts.reduce((sum, cut) => sum + cut.dialogueCount, 0) + unassignedDialogueCount,
      charCount: cuts.reduce((sum, cut) => sum + cut.charCount, 0) + unassignedCharCount,
      speechMs,
      dwellMs,
      totalMs: speechMs + dwellMs,
      cutCount: cuts.length,
      cuts,
    };
  });

  const sum = (pick: (page: NarrationPageTiming) => number) =>
    pageTimings.reduce((total, page) => total + pick(page), 0);
  const speechMs = sum((page) => page.speechMs);
  const dwellMs = sum((page) => page.dwellMs);
  return {
    dialogueCount: sum((page) => page.dialogueCount),
    charCount: sum((page) => page.charCount),
    cutCount: sum((page) => page.cutCount),
    pageCount: pages.length,
    speechMs,
    dwellMs,
    totalMs: speechMs + dwellMs,
    charsPerSecond,
    pages: pageTimings,
  };
}

// ── 회차 간 비교 ─────────────────────────────────────────────────────────────

export type NarrationEpisodeInput = {
  id: string;
  /** 표시 라벨(예: "12화"). */
  label: string;
  pages: readonly DialoguePageLike[];
};

export type NarrationEpisodeComparisonRow = {
  id: string;
  label: string;
  timing: EpisodeNarrationTiming;
  /** 직전 회차 대비 증감(ms). 첫 회차면 null. */
  deltaFromPreviousMs: number | null;
  /** 직전 회차 대비 증감률(%). 직전 회차 총시간이 0이면 null. */
  deltaFromPreviousPercent: number | null;
  /** 이 회차보다 앞선 모든 회차의 평균 대비 증감(ms). 첫 회차면 null. */
  deltaFromPreviousAverageMs: number | null;
  deltaFromPreviousAveragePercent: number | null;
};

export type NarrationTimingComparison = {
  /** 입력 순서(시리즈 순) 그대로의 행. */
  rows: NarrationEpisodeComparisonRow[];
  /** 마지막 회차를 뺀 지난 회차들의 평균 총시간(ms). 지난 회차가 없으면 null. */
  previousAverageMs: number | null;
};

function percentDelta(deltaMs: number, baseMs: number): number | null {
  if (baseMs <= 0) return null;
  return Math.round((deltaMs / baseMs) * 1_000) / 10;
}

/**
 * 회차들을 시리즈 순서(과거→현재)로 받아 회차별 예상 시간과 비교 지표를 만든다.
 * 마지막 항목이 "이번 회차"로 간주되는 것은 호출부(표시) 책임이며, 코어는
 * 순서 기반 증감만 계산한다.
 */
export function compareEpisodeNarrationTimings(
  episodes: readonly NarrationEpisodeInput[],
  options: NarrationTimingOptions = {}
): NarrationTimingComparison {
  const timings = episodes.map((episode) =>
    estimateEpisodeNarrationTiming(episode.pages, options)
  );
  const rows: NarrationEpisodeComparisonRow[] = episodes.map((episode, index) => {
    const timing = timings[index]!;
    const previous = index > 0 ? timings[index - 1]! : null;
    const deltaFromPreviousMs = previous ? timing.totalMs - previous.totalMs : null;
    let deltaFromPreviousAverageMs: number | null = null;
    let deltaFromPreviousAveragePercent: number | null = null;
    if (index > 0) {
      const previousAverage =
        timings.slice(0, index).reduce((sum, entry) => sum + entry.totalMs, 0) / index;
      deltaFromPreviousAverageMs = Math.round(timing.totalMs - previousAverage);
      deltaFromPreviousAveragePercent = percentDelta(
        deltaFromPreviousAverageMs,
        previousAverage
      );
    }
    return {
      id: episode.id,
      label: episode.label,
      timing,
      deltaFromPreviousMs,
      deltaFromPreviousPercent:
        previous && deltaFromPreviousMs != null
          ? percentDelta(deltaFromPreviousMs, previous.totalMs)
          : null,
      deltaFromPreviousAverageMs,
      deltaFromPreviousAveragePercent,
    };
  });
  const previousAverageMs =
    timings.length > 1
      ? Math.round(
          timings.slice(0, -1).reduce((sum, entry) => sum + entry.totalMs, 0) /
            (timings.length - 1)
        )
      : null;
  return { rows, previousAverageMs };
}

// ── 표시 포맷 ────────────────────────────────────────────────────────────────

function durationParts(ms: number): string {
  const totalSeconds = Math.round(Math.abs(ms) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

/** "약 3분 20초" — 예상 시간 표시의 단일 포맷. */
export function formatNarrationDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "약 0초";
  return `약 ${durationParts(ms)}`;
}

/** "+25초" / "-1분 5초" / "±0초" — 증감 표시용(부호 포함, "약" 없음). */
export function formatNarrationDelta(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const roundedSeconds = Math.round(Math.abs(ms) / 1_000);
  if (roundedSeconds === 0) return "±0초";
  return `${ms > 0 ? "+" : "-"}${durationParts(ms)}`;
}

/** "+12.5%" / "-3.0%" — 증감률 표시. null 이면 "—". */
export function formatNarrationDeltaPercent(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return "—";
  if (percent === 0) return "0%";
  return `${percent > 0 ? "+" : "-"}${Math.abs(percent).toFixed(1)}%`;
}
