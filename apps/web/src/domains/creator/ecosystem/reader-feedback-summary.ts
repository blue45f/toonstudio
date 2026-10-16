/**
 * 독자 피드백 합치기·집계 — 여러 파일의 응답을 중복 없이 합치고 회차별 요약을 만드는 순수 함수.
 *
 * 이 모듈의 숫자는 "파일을 보내 준 독자"의 자체 선택 응답을 센 것이다. 전체 독자를 대표하는 추정치가 아니므로
 * 신뢰구간·유의성 같은 통계 표현을 만들지 않고, 표본 크기 등급(`sampleLevel`)만 함께 돌려준다.
 * 사용자 문자열(제목·닉네임·의견)을 객체 키로 쓰지 않는다 — 묶음에는 Map 을 쓴다(프로토타입 오염 방지).
 */
import {
  READER_EMOTION_IDS,
  READER_FEEDBACK_LIMITS,
  type RatingLevel,
  type ReaderEmotionId,
  type ReaderFeedbackReading,
  type ReaderFeedbackResponse,
  type ReaderFeedbackTarget,
} from "./reader-feedback-schema";
import { normalizeTitleKey } from "./reader-feedback-text";

// ───────────────────────── 합치기·중복 제거 ─────────────────────────

export interface ReaderFeedbackMergeResult {
  /** 합친 결과. 만든 시각 순(같으면 id 순)으로 정렬된다. */
  readonly responses: readonly ReaderFeedbackResponse[];
  /** 새로 들어온 응답 수. */
  readonly added: number;
  /** 같은 id 의 더 새 응답으로 바뀐 수. */
  readonly updated: number;
  /** 제외한 중복 수: 같은 id 의 같거나 더 오래된 응답, 내용이 완전히 같은 응답, 같은 묶음 안에서 덮어써진 응답. */
  readonly duplicates: number;
  /** 총수 상한 때문에 받지 못한 수. */
  readonly overflow: number;
}

function timeOf(response: ReaderFeedbackResponse): number {
  return Date.parse(response.createdAt);
}

function compareResponses(left: ReaderFeedbackResponse, right: ReaderFeedbackResponse): number {
  return timeOf(left) - timeOf(right) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

/** 묶음(회차) 키. 대상 id 가 있으면 id 로, 직접 적은 이름이면 정규화한 제목으로 묶는다. */
export function groupKeyOf(target: ReaderFeedbackTarget): string {
  const base = target.id === null ? `manual:${normalizeTitleKey(target.title)}` : `${target.kind}:${target.id}`;
  return `${base}#${target.episode ?? 0}`;
}

/**
 * 내용 중복을 잡을 최소 의견 길이(코드 포인트). 점수·선택지만 있는 응답은 서로 다른 독자도 똑같이 고르기 쉬워서
 * (예: 모두 3점에 끝까지 읽음) 내용이 같다고 중복으로 보면 실제 응답을 지워 버린다. 이만큼 긴 의견이 글자 하나까지 같다면
 * 같은 독자가 새 id 로 다시 보낸 것으로 본다.
 */
export const CONTENT_DEDUPE_MIN_COMMENT = 8;

/**
 * 내용이 같은지 판단하는 지문. id 와 시각은 빼므로, 다른 id 로 다시 만든 같은 의견을 중복으로 잡는다.
 * 의견이 짧거나 없으면 null — 그런 응답은 id 로만 중복을 판단한다.
 */
function contentFingerprint(response: ReaderFeedbackResponse): string | null {
  if (Array.from(response.comment).length < CONTENT_DEDUPE_MIN_COMMENT) return null;
  return JSON.stringify([
    groupKeyOf(response.target), response.target.episode, response.nickname, response.ratings.fun, response.ratings.understanding,
    response.reading, response.emotions, response.comment, response.spoiler,
  ]);
}

/**
 * 기존 응답에 새로 가져온 응답을 합친다.
 * - 같은 id: 더 늦게 만든 쪽이 이긴다(같은 폼에서 고쳐 다시 내보낸 경우). 같거나 오래되면 중복.
 * - 다른 id 라도 충분히 긴 의견까지 완전히 같으면 중복(`CONTENT_DEDUPE_MIN_COMMENT` 참고). 의견이 없거나 짧으면 id 로만 판단한다.
 * - 총수 상한을 넘으면 기존 응답을 지키고 새 응답을 받지 않는다.
 */
export function mergeReaderFeedback(
  existing: readonly ReaderFeedbackResponse[],
  incoming: readonly ReaderFeedbackResponse[],
): ReaderFeedbackMergeResult {
  const byId = new Map<string, ReaderFeedbackResponse>();
  const owners = new Map<string, string>();
  for (const response of existing) {
    byId.set(response.id, response);
    const print = contentFingerprint(response);
    if (print !== null) owners.set(print, response.id);
  }
  const addedIds = new Set<string>();
  const updatedIds = new Set<string>();
  let duplicates = 0;
  let overflow = 0;
  for (const response of incoming) {
    const current = byId.get(response.id);
    if (current) {
      if (timeOf(response) <= timeOf(current)) {
        duplicates += 1;
        continue;
      }
      const oldPrint = contentFingerprint(current);
      if (oldPrint !== null && owners.get(oldPrint) === response.id) owners.delete(oldPrint);
      byId.set(response.id, response);
      const newPrint = contentFingerprint(response);
      if (newPrint !== null && !owners.has(newPrint)) owners.set(newPrint, response.id);
      if (addedIds.has(response.id) || updatedIds.has(response.id)) duplicates += 1;
      else updatedIds.add(response.id);
      continue;
    }
    const print = contentFingerprint(response);
    if (print !== null && owners.has(print)) {
      duplicates += 1;
    } else if (byId.size >= READER_FEEDBACK_LIMITS.maxTotalResponses) {
      overflow += 1;
    } else {
      byId.set(response.id, response);
      if (print !== null) owners.set(print, response.id);
      addedIds.add(response.id);
    }
  }
  return {
    responses: [...byId.values()].sort(compareResponses),
    added: addedIds.size,
    updated: updatedIds.size,
    duplicates,
    overflow,
  };
}

// ───────────────────────── 집계 ─────────────────────────

/** 표본 크기 등급. 5개 미만은 한두 명에 좌우되고, 30개 미만도 작다고 본다(통계적 기준이 아니라 읽는 사람을 위한 경고선). */
export type SampleLevel = "tiny" | "small" | "moderate";

export const SAMPLE_LEVEL_THRESHOLDS = Object.freeze({ tinyBelow: 5, smallBelow: 30, percentFrom: 10 });

export function sampleLevel(count: number): SampleLevel {
  if (count < SAMPLE_LEVEL_THRESHOLDS.tinyBelow) return "tiny";
  return count < SAMPLE_LEVEL_THRESHOLDS.smallBelow ? "small" : "moderate";
}

/** 비율(%)을 보여 줄 만큼 표본이 큰지. 작은 표본에서는 "3명"처럼 개수만 보여 가짜 정밀도를 피한다. */
export function showsPercent(count: number): boolean {
  return count >= SAMPLE_LEVEL_THRESHOLDS.percentFrom;
}

export interface RatingSummary {
  readonly answered: number;
  /** 1~3 평균. 답한 사람이 없으면 null. */
  readonly mean: number | null;
  /** 1단계·2단계·3단계를 고른 수. */
  readonly counts: readonly [number, number, number];
}

export interface ReadingSummary {
  readonly finished: number;
  readonly left: number;
  readonly unmarked: number;
  /** 읽은 정도를 표시한 사람(끝까지+중간 이탈) 중 끝까지 읽은 비율. 표시한 사람이 없으면 null. */
  readonly finishedShare: number | null;
}

export interface DropOffBin {
  /** 구간 시작(컷 번호 또는 스크롤 %). */
  readonly from: number;
  /** 구간 끝(포함). */
  readonly to: number;
  readonly count: number;
}

export interface DropOffSummary {
  readonly cut: { readonly total: number; readonly axisMax: number; readonly cutsPerBin: number; readonly bins: readonly DropOffBin[] };
  readonly scroll: { readonly total: number; readonly bins: readonly DropOffBin[] };
}

export interface EmotionCount {
  readonly id: ReaderEmotionId;
  readonly count: number;
}

export interface FeedbackComment {
  readonly id: string;
  readonly text: string;
  readonly nickname: string | null;
  readonly spoiler: boolean;
  readonly fun: RatingLevel | null;
  readonly understanding: RatingLevel | null;
  readonly reading: ReaderFeedbackReading;
  readonly createdAt: string;
  /** 작가가 이 브라우저에서 숨긴 의견. 집계에는 영향이 없다. */
  readonly hidden: boolean;
}

export interface ReaderFeedbackGroup {
  readonly key: string;
  readonly kind: ReaderFeedbackTarget["kind"];
  readonly id: string | null;
  readonly title: string;
  readonly episode: number | null;
  /** 같은 제목·회차인 다른 묶음이 있어 id 끝자리로 구분해야 하는지. */
  readonly needsDisambiguation: boolean;
  readonly count: number;
  readonly sample: SampleLevel;
  readonly fun: RatingSummary;
  readonly understanding: RatingSummary;
  readonly reading: ReadingSummary;
  readonly dropOff: DropOffSummary;
  /** 한 번이라도 고른 감정만, 많은 순(같으면 정해진 순서)으로. */
  readonly emotions: readonly EmotionCount[];
  readonly spoilerCount: number;
  /** 의견이 있는 응답 전부(최신순). 숨긴 것도 `hidden` 표시와 함께 들어 있다. */
  readonly comments: readonly FeedbackComment[];
  readonly representative: readonly FeedbackComment[];
  readonly hiddenCount: number;
}

const MAX_CUT_BINS = 20;
const SCROLL_BIN_COUNT = 10;
export const REPRESENTATIVE_LIMIT = 5;

function summarizeRating(values: readonly (RatingLevel | null)[]): RatingSummary {
  const counts: [number, number, number] = [0, 0, 0];
  let sum = 0;
  let answered = 0;
  for (const value of values) {
    if (value === null) continue;
    counts[value - 1] += 1;
    sum += value;
    answered += 1;
  }
  return { answered, mean: answered === 0 ? null : sum / answered, counts };
}

function summarizeReading(responses: readonly ReaderFeedbackResponse[]): ReadingSummary {
  let finished = 0;
  let left = 0;
  let unmarked = 0;
  for (const response of responses) {
    if (response.reading.status === "finished") finished += 1;
    else if (response.reading.status === "left") left += 1;
    else unmarked += 1;
  }
  const marked = finished + left;
  return { finished, left, unmarked, finishedShare: marked === 0 ? null : finished / marked };
}

function summarizeDropOff(responses: readonly ReaderFeedbackResponse[]): DropOffSummary {
  const cuts: number[] = [];
  const percents: number[] = [];
  let axisMax = 0;
  for (const { reading } of responses) {
    if (reading.status !== "left") continue;
    if (reading.point.mode === "cut") {
      cuts.push(reading.point.cut);
      axisMax = Math.max(axisMax, reading.point.cut, reading.point.cutCount ?? 0);
    } else {
      percents.push(reading.point.percent);
    }
  }
  const cutsPerBin = Math.max(1, Math.ceil(axisMax / MAX_CUT_BINS));
  const cutBinCount = axisMax === 0 ? 0 : Math.ceil(axisMax / cutsPerBin);
  const cutCounts = new Array<number>(cutBinCount).fill(0);
  for (const cut of cuts) cutCounts[Math.min(cutBinCount - 1, Math.floor((cut - 1) / cutsPerBin))] += 1;
  const scrollCounts = new Array<number>(SCROLL_BIN_COUNT).fill(0);
  for (const percent of percents) scrollCounts[Math.min(SCROLL_BIN_COUNT - 1, Math.floor(percent / 10))] += 1;
  return {
    cut: {
      total: cuts.length,
      axisMax,
      cutsPerBin,
      bins: cutCounts.map((count, index) => ({ from: index * cutsPerBin + 1, to: Math.min(axisMax, (index + 1) * cutsPerBin), count })),
    },
    scroll: {
      total: percents.length,
      bins: scrollCounts.map((count, index) => ({ from: index * 10, to: index === SCROLL_BIN_COUNT - 1 ? 100 : index * 10 + 9, count })),
    },
  };
}

function summarizeEmotions(responses: readonly ReaderFeedbackResponse[]): EmotionCount[] {
  const counts = new Map<ReaderEmotionId, number>();
  for (const response of responses) for (const id of response.emotions) counts.set(id, (counts.get(id) ?? 0) + 1);
  return READER_EMOTION_IDS
    .flatMap((id) => (counts.has(id) ? [{ id, count: counts.get(id) ?? 0 }] : []))
    .sort((left, right) => right.count - left.count || READER_EMOTION_IDS.indexOf(left.id) - READER_EMOTION_IDS.indexOf(right.id));
}

function toComment(response: ReaderFeedbackResponse, hidden: boolean): FeedbackComment {
  return {
    id: response.id,
    text: response.comment,
    nickname: response.nickname,
    spoiler: response.spoiler,
    fun: response.ratings.fun,
    understanding: response.ratings.understanding,
    reading: response.reading,
    createdAt: response.createdAt,
    hidden,
  };
}

function isConcern(comment: FeedbackComment): boolean {
  return comment.fun === 1 || comment.understanding === 1 || comment.reading.status === "left";
}

function isPraise(comment: FeedbackComment): boolean {
  return comment.fun === 3 && comment.understanding !== 1;
}

/** 같은 말을 다르게 쓴 의견을 한 번만 보이기 위한 비교용 키(글자·숫자만 남긴다). */
function duplicateKey(text: string): string {
  return normalizeTitleKey(text).replace(/[^\p{L}\p{N}]+/gu, "");
}

function compareForRepresentative(left: FeedbackComment, right: FeedbackComment): number {
  return Number(left.spoiler) - Number(right.spoiler)
    || Math.min(right.text.length, 160) - Math.min(left.text.length, 160)
    || Date.parse(right.createdAt) - Date.parse(left.createdAt)
    || (left.id < right.id ? -1 : 1);
}

/**
 * 대표 의견을 고른다. 다수결이 아니라 "작가가 읽을 가치가 큰 것"을 고르는 결정적 규칙이다.
 * 1) 숨긴 의견과 빈 의견은 뺀다. 2) 스포일러 아닌 의견, 더 자세한(긴) 의견, 더 최근 의견 순으로 줄을 세우고
 *    같은 말(구두점·대소문자만 다른 의견)은 앞선 하나만 남긴다.
 * 3) 스포일러가 아닌 의견에서 문제 신호(별로·헷갈림·중간 이탈) 하나와 긍정 신호(재밌었고 이해도 낮지 않음) 하나를
 *    먼저 뽑고 남은 자리를 줄 순서대로 채운다. 4) 그래도 자리가 남을 때만 스포일러 의견을 같은 방식으로 더한다.
 */
export function pickRepresentativeComments(comments: readonly FeedbackComment[], limit: number = REPRESENTATIVE_LIMIT): FeedbackComment[] {
  const seen = new Set<string>();
  const unique = comments
    .filter((comment) => !comment.hidden && comment.text !== "")
    .sort(compareForRepresentative)
    .filter((comment) => {
      const key = duplicateKey(comment.text) || comment.text;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const picks: FeedbackComment[] = [];
  const take = (comment: FeedbackComment | undefined) => {
    if (comment && picks.length < limit && !picks.includes(comment)) picks.push(comment);
  };
  for (const pool of [unique.filter((comment) => !comment.spoiler), unique.filter((comment) => comment.spoiler)]) {
    take(pool.find(isConcern));
    take(pool.find(isPraise));
    for (const comment of pool) take(comment);
  }
  return picks;
}

function newestFirst(left: FeedbackComment, right: FeedbackComment): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt) || (left.id < right.id ? -1 : 1);
}

function summarizeGroup(responses: readonly ReaderFeedbackResponse[], hiddenIds: ReadonlySet<string>): Omit<ReaderFeedbackGroup, "needsDisambiguation"> {
  const first = responses[0];
  const comments = responses
    .filter((response) => response.comment !== "")
    .map((response) => toComment(response, hiddenIds.has(response.id)))
    .sort(newestFirst);
  return {
    key: groupKeyOf(first.target),
    kind: first.target.kind,
    id: first.target.id,
    title: first.target.title,
    episode: first.target.episode,
    count: responses.length,
    sample: sampleLevel(responses.length),
    fun: summarizeRating(responses.map((response) => response.ratings.fun)),
    understanding: summarizeRating(responses.map((response) => response.ratings.understanding)),
    reading: summarizeReading(responses),
    dropOff: summarizeDropOff(responses),
    emotions: summarizeEmotions(responses),
    spoilerCount: responses.filter((response) => response.spoiler).length,
    comments,
    representative: pickRepresentativeComments(comments),
    hiddenCount: comments.filter((comment) => comment.hidden).length,
  };
}

/** 회차(대상+회차 번호)별 요약. 회차 번호 순(없는 것은 뒤), 같으면 제목 순이다. */
export function summarizeReaderFeedback(
  responses: readonly ReaderFeedbackResponse[],
  hiddenIds: ReadonlySet<string> = new Set<string>(),
): ReaderFeedbackGroup[] {
  const grouped = new Map<string, ReaderFeedbackResponse[]>();
  for (const response of responses) {
    const key = groupKeyOf(response.target);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(response);
    else grouped.set(key, [response]);
  }
  const groups = [...grouped.values()].map((bucket) => summarizeGroup(bucket, hiddenIds));
  const labelCounts = new Map<string, number>();
  for (const group of groups) {
    const label = `${normalizeTitleKey(group.title)}#${group.episode ?? 0}`;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return groups
    .map((group) => ({ ...group, needsDisambiguation: (labelCounts.get(`${normalizeTitleKey(group.title)}#${group.episode ?? 0}`) ?? 0) > 1 }))
    .sort((left, right) => (left.episode ?? Number.MAX_SAFE_INTEGER) - (right.episode ?? Number.MAX_SAFE_INTEGER)
      || left.title.localeCompare(right.title, "ko")
      || (left.key < right.key ? -1 : 1));
}

/** 이탈이 가장 몰린 구간(동률이면 모두). 이탈 표시가 없으면 빈 배열. */
export function peakBins(bins: readonly DropOffBin[]): DropOffBin[] {
  const max = bins.reduce((best, bin) => Math.max(best, bin.count), 0);
  return max === 0 ? [] : bins.filter((bin) => bin.count === max);
}
