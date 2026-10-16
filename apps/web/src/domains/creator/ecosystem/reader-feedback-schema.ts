/**
 * 독자 피드백 응답 스키마 — 회차별 구조화 피드백 파일(`toonstudio-reader-feedback`, 버전 1).
 *
 * 서버 저장 없이 "독자 폼 → 응답 JSON 내보내기 → 작가 요약 화면 가져오기"로 오가는 파일의 계약이다.
 * 기존 베타 독자 패키지의 응답 가져오기 패턴(`toonstudio-beta-feedback`)을 확장하며, 그 파일 형식은 건드리지 않는다.
 *
 * 설계 원칙
 * - 불러오는 파일은 신뢰하지 않는다: 모든 객체는 strict(알 수 없는 키 거부), 모든 문자열·배열에 상한이 있다.
 * - 개인정보 최소화: 닉네임은 선택 입력이고 이메일·IP·계정 식별자 필드가 없다. 연락처처럼 보이는 문자열은 가린다.
 * - 이탈 지점은 두 가지 방식(컷 번호 또는 스크롤 위치) 중 하나로만 적는다.
 * - 값 정리(제어 문자 제거·길이 제한)는 파싱 단계에서 한 번 수행하므로 이후 코드는 정리된 값만 본다.
 */
import { z } from "zod";

import { cleanFeedbackText, cleanNickname } from "./reader-feedback-text";

export const READER_FEEDBACK_KIND = "toonstudio-reader-feedback" as const;
export const READER_FEEDBACK_VERSION = 1 as const;
/** 이전 '검토 응답'(이해·가독성·기대 5점 척도) 파일의 kind. 이 요약은 읽지 않고 안내만 한다. */
export const LEGACY_BETA_FEEDBACK_KIND = "toonstudio-beta-feedback" as const;

/** 가져오기·내보내기 상한. 문서(docs/features/reader-feedback-summary.md)의 표와 테스트로 묶여 있다. */
export const READER_FEEDBACK_LIMITS = Object.freeze({
  /** 파일(또는 붙여넣은 글) 하나의 최대 크기. 한 응답이 약 1KB이므로 50개 응답의 몇 배 여유다. */
  maxFileBytes: 262_144,
  /** 한 번에 가져오는 파일 수. */
  maxFiles: 20,
  maxResponsesPerFile: 50,
  /** 합친 응답 총수. 넘으면 오래된 순으로 남기고 나머지는 가져오지 않는다. */
  maxTotalResponses: 1_000,
  /** 파일 → responses → 응답 → reading → point 가 최대 5단이다. */
  maxJsonDepth: 6,
  maxJsonNodes: 20_000,
  maxIdLength: 80,
  maxTitleLength: 120,
  maxNicknameLength: 20,
  maxCommentLength: 600,
  maxCut: 500,
  maxEpisode: 9_999,
  maxEmotions: 3,
});

const LIMITS = READER_FEEDBACK_LIMITS;

/** 감정 태그. 자유 입력을 받지 않으므로 분포를 안정적으로 셀 수 있다. */
export const READER_EMOTION_IDS = [
  "excited", "funny", "touched", "satisfied", "surprised", "tense", "sad", "angry", "confused", "bored",
] as const;
export type ReaderEmotionId = (typeof READER_EMOTION_IDS)[number];

/** 3단계 척도 값. 1이 가장 낮고 3이 가장 높다. */
export type RatingLevel = 1 | 2 | 3;
export const RATING_LEVELS: readonly RatingLevel[] = [1, 2, 3];

const ID_PATTERN = new RegExp(`^[A-Za-z0-9._:-]{1,${LIMITS.maxIdLength}}$`, "u");
const idSchema = z.string().regex(ID_PATTERN);
const instantSchema = z.iso.datetime();
const levelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/** 원문은 정리 후 상한의 2배까지만 받고(큰 입력 거부), 정리·가림·자르기는 한 번에 한다. */
function textSchema(maxLength: number) {
  return z.string().max(maxLength * 2).transform((value) => cleanFeedbackText(value, maxLength));
}

const titleSchema = textSchema(LIMITS.maxTitleLength).pipe(z.string().min(1));
const commentSchema = textSchema(LIMITS.maxCommentLength);
const nicknameSchema = z.string().max(LIMITS.maxNicknameLength * 2).nullable()
  .transform((value) => (value === null ? null : cleanNickname(value, LIMITS.maxNicknameLength)));

const targetSchema = z.strictObject({
  /** package: 베타 검토 패키지, work: 공개 작품, manual: 독자가 직접 적은 작품 이름. */
  kind: z.enum(["package", "work", "manual"]),
  id: idSchema.nullable(),
  title: titleSchema,
  episode: z.number().int().min(1).max(LIMITS.maxEpisode).nullable(),
}).refine((target) => (target.kind === "manual") === (target.id === null), {
  message: "manual 대상만 id가 없어야 합니다.",
  path: ["id"],
});

const cutPointSchema = z.strictObject({
  mode: z.literal("cut"),
  cut: z.number().int().min(1).max(LIMITS.maxCut),
  /** 독자가 본 전체 컷 수. 패키지에서 알 수 있을 때만 있다. */
  cutCount: z.number().int().min(1).max(LIMITS.maxCut).nullable(),
}).refine((point) => point.cutCount === null || point.cut <= point.cutCount, {
  message: "컷 번호가 전체 컷 수보다 큽니다.",
  path: ["cut"],
});

const scrollPointSchema = z.strictObject({
  mode: z.literal("scroll"),
  percent: z.number().int().min(0).max(100),
});

const readingSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("unmarked") }),
  z.strictObject({ status: z.literal("finished") }),
  z.strictObject({
    status: z.literal("left"),
    point: z.discriminatedUnion("mode", [cutPointSchema, scrollPointSchema]),
  }),
]);

const emotionsSchema = z.array(z.enum(READER_EMOTION_IDS)).max(LIMITS.maxEmotions)
  .refine((emotions) => new Set(emotions).size === emotions.length, { message: "감정 태그가 중복됩니다." });

export const readerFeedbackResponseSchema = z.strictObject({
  /**
   * 응답 하나의 고유값. 같은 폼에서 같은 작품·회차로 다시 내보내면 같은 값이라 가져올 때 최신 것으로 바뀐다.
   * 작품 이름이나 회차가 바뀌면 새 값이다. 가져올 때도 id 와 묶음이 모두 같아야 같은 응답으로 본다.
   */
  id: idSchema,
  createdAt: instantSchema,
  target: targetSchema,
  nickname: nicknameSchema,
  ratings: z.strictObject({ fun: levelSchema.nullable(), understanding: levelSchema.nullable() }),
  reading: readingSchema,
  emotions: emotionsSchema,
  comment: commentSchema,
  spoiler: z.boolean(),
}).refine((response) => hasAnyAnswer(response), {
  message: "내용이 없는 응답입니다.",
  path: ["ratings"],
});

export const readerFeedbackFileSchema = z.strictObject({
  kind: z.literal(READER_FEEDBACK_KIND),
  version: z.literal(READER_FEEDBACK_VERSION),
  exportedAt: instantSchema,
  responses: z.array(readerFeedbackResponseSchema).min(1).max(LIMITS.maxResponsesPerFile),
});

export type ReaderFeedbackResponse = z.output<typeof readerFeedbackResponseSchema>;
export type ReaderFeedbackFile = z.output<typeof readerFeedbackFileSchema>;
export type ReaderFeedbackTarget = ReaderFeedbackResponse["target"];
export type ReaderFeedbackReading = ReaderFeedbackResponse["reading"];
export type ReaderDropPoint = Extract<ReaderFeedbackReading, { status: "left" }>["point"];

/** 점수·읽은 정도·감정·의견 중 하나라도 답했는지 판단하는 데 필요한 모양(스키마 타입과 순환하지 않도록 따로 적는다). */
interface AnswerShape {
  readonly ratings: { readonly fun: number | null; readonly understanding: number | null };
  readonly reading: { readonly status: string };
  readonly emotions: readonly string[];
  readonly comment: string;
}

/** 점수·읽은 정도·감정·의견 중 하나라도 답했는지. 아무것도 없는 응답은 표본 수만 부풀리므로 받지 않는다. */
export function hasAnyAnswer(response: AnswerShape): boolean {
  return response.ratings.fun !== null
    || response.ratings.understanding !== null
    || response.reading.status !== "unmarked"
    || response.emotions.length > 0
    || response.comment.length > 0;
}
