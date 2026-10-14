/**
 * 창작 멘토 챗 안전 필터 — 순수 함수.
 *
 * 투닝 챗이 전면에 내세운 "안전한 환경"을 우리 방식으로 흡수한 것:
 * 페르소나가 답하지 않는 주제가 입력에 닿으면 전송 전에 막고, 응답은
 * 길이 상한과 금지 주제 재검사를 거쳐 화면에 나간다. character-chat의
 * 필터와 같은 계약(차단은 조용히 바꾸지 않고 명시적으로 알린다).
 */

import type { MentorPersona } from "./creator-mentor-types";

export type MentorInputGuard =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly topic: string };

/** 입력이 페르소나의 금지 주제를 건드리는지 검사한다. */
export function guardMentorInput(
  persona: MentorPersona,
  userText: string,
): MentorInputGuard {
  const normalized = userText.replace(/\s+/g, "");
  for (const topic of persona.forbiddenTopics) {
    const key = topic.replace(/\s+/g, "");
    if (key.length >= 2 && normalized.includes(key)) {
      return { allowed: false, topic };
    }
  }
  return { allowed: true };
}

export const MENTOR_REPLY_LENGTH_LIMIT = 6_000;

export interface MentorReplySanitizeResult {
  readonly text: string;
  /** 금지 주제가 응답에 섞여 회피 문구로 교체됐는지. */
  readonly replacedForbidden: boolean;
}

const FORBIDDEN_REPLY_FALLBACK =
  "그 주제는 제가 다루지 않는 영역이에요. 대신 작품 안에서 풀 수 있는 다른 방향을 같이 찾아볼까요?";

/** 응답을 화면에 내보내기 전에 다듬는다. 금지 주제가 섞이면 통째로 회피 문구로 교체한다. */
export function sanitizeMentorReply(
  persona: MentorPersona,
  rawText: string,
): MentorReplySanitizeResult {
  const trimmed = rawText.trim().slice(0, MENTOR_REPLY_LENGTH_LIMIT);
  const normalized = trimmed.replace(/\s+/g, "");
  for (const topic of persona.forbiddenTopics) {
    const key = topic.replace(/\s+/g, "");
    if (key.length >= 2 && normalized.includes(key)) {
      return { text: FORBIDDEN_REPLY_FALLBACK, replacedForbidden: true };
    }
  }
  return { text: trimmed, replacedForbidden: false };
}
