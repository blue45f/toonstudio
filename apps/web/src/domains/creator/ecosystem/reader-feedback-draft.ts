/**
 * 독자 폼 초안 → 응답 변환. 화면 상태(문자열 입력)를 검증된 응답으로 바꾸는 순수 함수다.
 *
 * 폼은 이 모듈이 돌려주는 오류 코드로 필드별 안내를 만들고, 성공하면 스키마를 한 번 더 통과한 값만 내보낸다.
 */
import {
  READER_EMOTION_IDS,
  READER_FEEDBACK_LIMITS,
  hasAnyAnswer,
  readerFeedbackResponseSchema,
  type RatingLevel,
  type ReaderEmotionId,
  type ReaderFeedbackResponse,
} from "./reader-feedback-schema";
import { cleanFeedbackText } from "./reader-feedback-text";

export type DraftReadingStatus = "unset" | "finished" | "left";
export type DraftPointMode = "cut" | "scroll";

export interface ReaderFeedbackDraft {
  /** 대상을 모를 때 독자가 직접 적는 작품 이름. */
  readonly title: string;
  /** 회차 번호 입력(문자열). 비우면 회차를 밝히지 않는다. */
  readonly episode: string;
  readonly fun: RatingLevel | null;
  readonly understanding: RatingLevel | null;
  readonly reading: DraftReadingStatus;
  readonly pointMode: DraftPointMode;
  readonly cut: string;
  readonly scroll: number;
  readonly emotions: readonly ReaderEmotionId[];
  readonly comment: string;
  readonly spoiler: boolean;
  readonly nickname: string;
}

/** 폼이 이미 아는 대상(패키지·작품). 없으면 독자가 작품 이름을 직접 적는다. */
export interface KnownFeedbackTarget {
  readonly kind: "package" | "work";
  readonly id: string;
  readonly title: string;
  readonly episode: number | null;
  /** 패키지에서 알 수 있는 전체 컷 수. 없으면 null. */
  readonly cutCount: number | null;
}

export type DraftErrorField = "title" | "episode" | "cut" | "empty" | "schema";
export interface DraftError {
  readonly field: DraftErrorField;
  readonly code: "required" | "invalid-number" | "out-of-range" | "nothing-answered" | "invalid";
}

export type DraftBuildResult =
  | { readonly ok: true; readonly response: ReaderFeedbackResponse }
  | { readonly ok: false; readonly errors: readonly DraftError[] };

export function createEmptyDraft(): ReaderFeedbackDraft {
  return {
    title: "",
    episode: "",
    fun: null,
    understanding: null,
    reading: "unset",
    pointMode: "cut",
    cut: "",
    scroll: 50,
    emotions: [],
    comment: "",
    spoiler: false,
    nickname: "",
  };
}

/** 앞뒤 공백을 뺀 자연수 문자열만 받는다. ("1e3", "+5", "０５" 같은 값은 거부한다.) */
function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  return /^\d{1,5}$/u.test(trimmed) ? Number(trimmed) : null;
}

function buildTarget(draft: ReaderFeedbackDraft, known: KnownFeedbackTarget | null, errors: DraftError[]) {
  // 패키지·작품이 정한 대상이면 작품 이름과 회차는 그쪽 값을 쓴다. 독자가 회차를 다르게 적어 묶음이 갈라지는 일이 없다.
  if (known) return { kind: known.kind, id: known.id, title: known.title, episode: known.episode };
  let episode: number | null = null;
  if (draft.episode.trim() !== "") {
    episode = parseWholeNumber(draft.episode);
    if (episode === null) errors.push({ field: "episode", code: "invalid-number" });
    else if (episode < 1 || episode > READER_FEEDBACK_LIMITS.maxEpisode) {
      errors.push({ field: "episode", code: "out-of-range" });
      episode = null;
    }
  }
  if (draft.title.trim() === "") errors.push({ field: "title", code: "required" });
  return { kind: "manual" as const, id: null, title: draft.title, episode };
}

function buildReading(draft: ReaderFeedbackDraft, known: KnownFeedbackTarget | null, errors: DraftError[]) {
  if (draft.reading === "unset") return { status: "unmarked" as const };
  if (draft.reading === "finished") return { status: "finished" as const };
  if (draft.pointMode === "scroll") {
    return { status: "left" as const, point: { mode: "scroll" as const, percent: Math.min(100, Math.max(0, Math.round(draft.scroll))) } };
  }
  const cut = parseWholeNumber(draft.cut);
  const limit = known?.cutCount ?? READER_FEEDBACK_LIMITS.maxCut;
  if (cut === null) errors.push({ field: "cut", code: draft.cut.trim() === "" ? "required" : "invalid-number" });
  else if (cut < 1 || cut > limit) errors.push({ field: "cut", code: "out-of-range" });
  return { status: "left" as const, point: { mode: "cut" as const, cut: cut ?? 1, cutCount: known?.cutCount ?? null } };
}

/** 폼 초안을 응답으로 만든다. 같은 폼에서 다시 내보낼 때 같은 id 를 쓰도록 id 와 시각은 호출자가 넘긴다. */
export function buildResponseFromDraft(
  draft: ReaderFeedbackDraft,
  known: KnownFeedbackTarget | null,
  meta: { readonly id: string; readonly createdAt: string },
): DraftBuildResult {
  const errors: DraftError[] = [];
  const target = buildTarget(draft, known, errors);
  const reading = buildReading(draft, known, errors);
  // 감정은 화면에서 고른 순서가 아니라 정해진 순서로 담아 같은 선택이 같은 파일이 되게 한다.
  const emotions = READER_EMOTION_IDS.filter((id) => draft.emotions.includes(id));
  const ratings = { fun: draft.fun, understanding: draft.understanding };
  // 공백·제어 문자만 적은 의견은 의견이 아니므로, 스키마가 쓰는 것과 같은 정리를 거친 뒤 "답한 것이 있는지" 본다.
  const comment = cleanFeedbackText(draft.comment, READER_FEEDBACK_LIMITS.maxCommentLength);
  if (!hasAnyAnswer({ ratings, reading, emotions, comment })) errors.push({ field: "empty", code: "nothing-answered" });
  if (errors.length > 0) return { ok: false, errors };
  const parsed = readerFeedbackResponseSchema.safeParse({
    id: meta.id,
    createdAt: meta.createdAt,
    target,
    nickname: draft.nickname.trim() === "" ? null : draft.nickname,
    ratings,
    reading,
    emotions,
    comment: draft.comment,
    spoiler: draft.spoiler,
  });
  return parsed.success ? { ok: true, response: parsed.data } : { ok: false, errors: [{ field: "schema", code: "invalid" }] };
}
