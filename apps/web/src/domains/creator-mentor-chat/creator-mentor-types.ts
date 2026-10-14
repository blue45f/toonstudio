/**
 * 창작 멘토 챗(creator-mentor-chat) 도메인 타입.
 *
 * 팬이 작품 캐릭터와 대화하는 character-chat과 목적이 다르다. 여기는
 * 창작자가 작품을 만들면서 전문가 페르소나에게 묻고 배우는 보조 표면이다.
 * 페르소나는 실존 인물이 아니라 역할(작법·연출·대사·세계관·시대 자문)로
 * 정의하며, 답변의 근거는 페르소나의 전문 범위와 작가가 준 작품 맥락뿐이다.
 *
 * 채팅 엔진(LLM)은 이 도메인 밖에 있다. character-chat과 같은 정책:
 * 플랫폼이 비용을 부담하는 경로는 붙이지 않고, 사용자가 등록한 자기 키
 * (BYOK)를 공유 텍스트 완성으로 재사용하는 어댑터만 제공한다.
 */

import {
  DEFAULT_ANSWER_TUNING,
  type AnswerCreativity,
  type AnswerDifficulty,
  type AnswerLength,
  type AnswerTuning,
} from "../creator/ai/answer-tuning";

/** 멘토 페르소나 식별자. */
export type MentorPersonaId =
  | "story-mentor"
  | "directing-coach"
  | "dialogue-editor"
  | "worldbuilding-keeper"
  | "era-advisor";

/**
 * 답변 조절값은 AI 어시스트 허브 전반이 공유하는 공통 부품
 * (domains/creator/ai/answer-tuning)이 정본이다. 멘토 챗은 같은 값 계약을
 * 자기 이름으로 재노출만 한다 — 조절값의 의미·기본값이 표면마다 갈라지지 않게.
 */

/** 답변 난이도 — 일상어 조절값. 프롬프트 지시로 변환된다. */
export type MentorDifficulty = AnswerDifficulty;
/** 답변 길이. */
export type MentorLength = AnswerLength;
/** 답변 창의성 — 사실·근거 위주인지, 제안·확장 위주인지. */
export type MentorCreativity = AnswerCreativity;

/** 투닝 챗의 "답변 조절"을 흡수한 조절값 묶음 (공통 부품과 동일 계약). */
export type MentorAnswerControls = AnswerTuning;

export const DEFAULT_MENTOR_CONTROLS: MentorAnswerControls = DEFAULT_ANSWER_TUNING;

/** 멘토 페르소나 한 건 — 정본 카탈로그 항목. */
export interface MentorPersona {
  readonly id: MentorPersonaId;
  /** 표시 이름 (역할이 드러나는 이름). */
  readonly name: string;
  /** 역할 한 줄. */
  readonly roleLabel: string;
  /** 목록에 보여줄 한 줄 소개. */
  readonly description: string;
  /** 전문 범위 — 프롬프트에 근거 범위로 들어간다. */
  readonly expertise: readonly string[];
  /** 대화를 열 때 멘토가 먼저 건네는 인사. */
  readonly greeting: string;
  /** 처음 묻기 좋은 추천 질문 칩. */
  readonly questionChips: readonly string[];
  /**
   * 키 미설정 상태에서 보여주는 "준비된 안내" — 챗 답변인 척하지 않고
   * 이 멘토에게 물을 수 있는 주제 목록으로 정직하게 표시한다.
   */
  readonly starterTopics: readonly string[];
  /** 이 페르소나가 답하지 않는 주제 — 입력/응답 양쪽에서 필터링한다. */
  readonly forbiddenTopics: readonly string[];
}

/** 대화 한 턴. */
export interface MentorChatMessage {
  readonly role: "creator" | "mentor";
  readonly text: string;
}
