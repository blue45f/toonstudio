/**
 * 체험용 예시 응답 — 실제 독자가 없어도 요약 화면이 어떻게 읽히는지 볼 수 있게 하는 합성 데이터.
 *
 * 모든 값은 이 파일에 적힌 고정값이다(난수·현재 시각을 쓰지 않는다). 제목에 "예시"를 넣어
 * 실제 독자 응답과 섞여도 묶음 표에서 바로 구분된다. 같은 id 를 쓰므로 여러 번 불러와도 중복 제거로 한 벌만 남는다.
 */
import {
  readerFeedbackResponseSchema,
  type RatingLevel,
  type ReaderEmotionId,
  type ReaderFeedbackResponse,
} from "./reader-feedback-schema";

export const EXAMPLE_TITLE = "예시 작품 · Example story";
const EXAMPLE_START_MS = Date.UTC(2026, 9, 1, 9, 0, 0);

type ExampleReading = "unmarked" | "finished" | { readonly cut: number } | { readonly scroll: number };

interface ExampleRow {
  readonly fun: RatingLevel | null;
  readonly understanding: RatingLevel | null;
  readonly reading: ExampleReading;
  readonly emotions: readonly ReaderEmotionId[];
  readonly comment: string;
  readonly nickname: string | null;
  readonly spoiler?: boolean;
}

interface ExampleEpisode {
  readonly episode: number;
  readonly cutCount: number;
  readonly rows: readonly ExampleRow[];
}

const EXAMPLE_EPISODES: readonly ExampleEpisode[] = [
  {
    episode: 1,
    cutCount: 24,
    rows: [
      { fun: 3, understanding: 3, reading: "finished", emotions: ["funny", "satisfied"], comment: "끝까지 단숨에 읽었어요. 마지막 컷의 반전이 통쾌했어요.", nickname: "예시 독자 A" },
      { fun: 3, understanding: 2, reading: "finished", emotions: ["excited"], comment: "두 사람이 처음 마주치는 장면 분위기가 좋아요.", nickname: "예시 독자 B" },
      { fun: 2, understanding: 1, reading: { cut: 7 }, emotions: ["confused"], comment: "7컷에서 말풍선 읽는 순서를 알기 어려워 한 번 더 읽었어요.", nickname: "예시 독자 C" },
      { fun: 1, understanding: 1, reading: { cut: 7 }, emotions: ["confused", "bored"], comment: "7컷 대사가 너무 길어서 여기서 멈췄어요.", nickname: null },
      { fun: 2, understanding: 2, reading: { cut: 8 }, emotions: ["tense"], comment: "", nickname: "예시 독자 D" },
      { fun: 2, understanding: 3, reading: { scroll: 40 }, emotions: ["bored"], comment: "중반 설명이 길게 느껴졌어요.", nickname: "예시 독자 E" },
      { fun: 3, understanding: 3, reading: "finished", emotions: ["touched", "excited"], comment: "마지막에 동생이 돌아오는 장면에서 울컥했어요.", nickname: "예시 독자 F", spoiler: true },
      { fun: 2, understanding: 2, reading: { cut: 15 }, emotions: ["surprised"], comment: "15컷에서 장면이 갑자기 바뀌어 놀랐어요.", nickname: "예시 독자 G" },
    ],
  },
  {
    episode: 2,
    cutCount: 30,
    rows: [
      { fun: 3, understanding: 3, reading: "finished", emotions: ["excited", "funny"], comment: "이번 화는 템포가 좋아서 금방 읽혔어요.", nickname: "예시 독자 A" },
      { fun: 3, understanding: 2, reading: "finished", emotions: ["satisfied"], comment: "", nickname: "예시 독자 B" },
      { fun: 2, understanding: 2, reading: { scroll: 70 }, emotions: ["tense"], comment: "후반 추격 장면이 조금 길어요.", nickname: "예시 독자 C" },
      { fun: 3, understanding: 3, reading: "finished", emotions: ["touched"], comment: "표정 연출이 특히 좋았어요.", nickname: "예시 독자 H" },
      { fun: 1, understanding: 2, reading: { cut: 22 }, emotions: ["angry"], comment: "22컷 이후 전개가 갑자기 억지스럽게 느껴졌어요.", nickname: null },
      { fun: null, understanding: 3, reading: "unmarked", emotions: ["funny"], comment: "그림체가 보기 편해요.", nickname: "예시 독자 I" },
    ],
  },
];

function readingOf(row: ExampleRow, cutCount: number) {
  if (row.reading === "unmarked") return { status: "unmarked" };
  if (row.reading === "finished") return { status: "finished" };
  if ("cut" in row.reading) return { status: "left", point: { mode: "cut", cut: row.reading.cut, cutCount } };
  return { status: "left", point: { mode: "scroll", percent: row.reading.scroll } };
}

/** 예시 응답 14개(1화 8개·2화 6개). 스키마를 한 번 통과한 값이라 실제 가져온 응답과 모양이 같다. */
export function createExampleReaderFeedback(): ReaderFeedbackResponse[] {
  let sequence = 0;
  return EXAMPLE_EPISODES.flatMap((episode) => episode.rows.map((row, index) => {
    const createdAt = new Date(EXAMPLE_START_MS + (sequence += 1) * 60_000).toISOString();
    return readerFeedbackResponseSchema.parse({
      id: `example-${episode.episode}-${index + 1}`,
      createdAt,
      target: { kind: "manual", id: null, title: EXAMPLE_TITLE, episode: episode.episode },
      nickname: row.nickname,
      ratings: { fun: row.fun, understanding: row.understanding },
      reading: readingOf(row, episode.cutCount),
      emotions: row.emotions,
      comment: row.comment,
      spoiler: row.spoiler ?? false,
    });
  }));
}
