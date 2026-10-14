/**
 * 창작 멘토 챗 프롬프트 조립 — 순수 함수.
 *
 * 답변 조절값(난이도·길이·창의성)은 여기서 명시 지시문으로 변환된다.
 * 조절값을 바꾸면 시스템 프롬프트가 바뀌므로, 같은 질문에도 답의 깊이·
 * 길이가 실제로 달라진다 — 조절 UI가 장식이 되지 않게 하는 계약이다.
 */

import {
  ANSWER_CREATIVITY_DIRECTIVES,
  ANSWER_DIFFICULTY_DIRECTIVES,
  ANSWER_LENGTH_DIRECTIVES,
  ANSWER_TUNING_LABELS,
  buildAnswerTuningDirectives,
} from "../creator/ai/answer-tuning";
import type {
  MentorAnswerControls,
  MentorChatMessage,
  MentorCreativity,
  MentorDifficulty,
  MentorLength,
  MentorPersona,
} from "./creator-mentor-types";

/**
 * 지시문·라벨의 정본은 공통 부품(answer-tuning)이다. 멘토 챗 기존 이름으로는
 * 재노출만 한다 — 기존 테스트·호출부의 임포트가 깨지지 않게 하기 위해서다.
 */
export const DIFFICULTY_DIRECTIVES: Record<MentorDifficulty, string> = ANSWER_DIFFICULTY_DIRECTIVES;

export const LENGTH_DIRECTIVES: Record<MentorLength, string> = ANSWER_LENGTH_DIRECTIVES;

export const CREATIVITY_DIRECTIVES: Record<MentorCreativity, string> = ANSWER_CREATIVITY_DIRECTIVES;

/** 조절값 UI 라벨 (ko/en) — 패널과 설정 표면이 공유한다. */
export const MENTOR_CONTROL_LABELS = ANSWER_TUNING_LABELS;

export function buildMentorSystemPrompt(
  persona: MentorPersona,
  controls: MentorAnswerControls,
): string {
  return [
    `너는 웹툰 창작 보조 멘토 "${persona.name}" (${persona.roleLabel})이다.`,
    `전문 범위: ${persona.expertise.join(", ")}. 이 범위를 벗어난 질문에는 그 사실을 밝히고 아는 범위까지만 답한다.`,
    "실존 인물을 사칭하지 않는다. 다른 작품의 줄거리·대사·세계관을 그대로 옮겨 주지 않는다.",
    `답하지 않는 주제: ${persona.forbiddenTopics.join(", ")}.`,
    ...buildAnswerTuningDirectives(controls),
    "답변 끝에는 창작자가 바로 해 볼 수 있는 다음 행동을 한 줄로 제안한다.",
  ].join("\n");
}

const HISTORY_TURN_LIMIT = 12;

export function buildMentorUserPrompt(
  history: readonly MentorChatMessage[],
  userText: string,
): string {
  const recent = history.slice(-HISTORY_TURN_LIMIT);
  if (recent.length === 0) return userText;
  const transcript = recent
    .map((message) => `${message.role === "creator" ? "창작자" : "멘토"}: ${message.text}`)
    .join("\n");
  return `${transcript}\n창작자: ${userText}`;
}
