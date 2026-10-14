/**
 * 캐릭터 인터뷰 엔진 어댑터 — character-chat 엔진을 그대로 재사용한다.
 *
 * 새 LLM 경로를 만들지 않는다. 팬 챗 엔진(`CharacterChatEngine`)을 주입받아
 * 인터뷰 메시지(author/character)를 엔진 계약(fan/character)으로만 바꿔
 * 위임한다. 따라서 BYOK 정책·금지 주제 응답 검열·에러 계약
 * (not_configured/request_failed/empty_reply, 절대 throw하지 않음)은
 * character-chat과 문자 그대로 동일하다. 호스트는
 * `resolveCharacterChatEngine(configuration)` 결과를 그대로 넘기면 된다.
 *
 * 작가 관리 페이지의 "테스트 대화"가 이미 같은 엔진을 재사용하는 선례가
 * 있다(CharacterChatThread 머리말) — 인터뷰는 그 작가판 동선을 캐논 시트
 * 근거 고정 + 설정 메모 저장까지 확장한 것이다.
 */

import type {
  CharacterChatEngine,
  CharacterChatEngineResult,
} from "../character-chat/character-chat-engine";
import type { CharacterChatMessage } from "../character-chat/character-chat-types";
import type { CharacterChatProfile } from "../character-chat/character-chat-types";

import type { CharacterInterviewMessage } from "./character-interview";

export type CharacterInterviewEngineResult = CharacterChatEngineResult;

export interface CharacterInterviewEngineInput {
  readonly profile: CharacterChatProfile;
  readonly history: readonly CharacterInterviewMessage[];
  readonly userText: string;
  readonly signal?: AbortSignal;
}

export interface CharacterInterviewEngine {
  readonly id: string;
  generateReply(
    input: CharacterInterviewEngineInput,
  ): Promise<CharacterInterviewEngineResult>;
}

/** 인터뷰 기록을 엔진 기록으로 바꾼다 — author→fan, 나머지는 id·시각까지 그대로 보존한다. */
export function toCharacterChatHistory(
  messages: readonly CharacterInterviewMessage[],
): CharacterChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "author" ? ("fan" as const) : ("character" as const),
    text: message.text,
    createdAt: message.createdAt,
  }));
}

/** character-chat 엔진을 인터뷰 엔진으로 감싼다. 생성·검열·에러는 전부 원본 엔진 몫이다. */
export function createCharacterInterviewEngine(
  chatEngine: CharacterChatEngine,
): CharacterInterviewEngine {
  return {
    id: `interview:${chatEngine.id}`,
    async generateReply(input) {
      return chatEngine.generateReply({
        profile: input.profile,
        history: toCharacterChatHistory(input.history),
        userText: input.userText,
        signal: input.signal,
      });
    },
  };
}
