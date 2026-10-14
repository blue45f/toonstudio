/**
 * 창작 멘토 챗 엔진 어댑터 — LLM 연동을 이 인터페이스 뒤에 둔다.
 *
 * character-chat 엔진과 같은 정책·계약이다:
 * - 플랫폼이 비용을 부담하는 경로는 붙이지 않는다. 사용자가 /settings/ai에
 *   등록한 자기 키(BYOK)를 공유 텍스트 완성(`completeUserAiTextDetailed`)으로
 *   재사용하는 어댑터만 제공한다.
 * - 키가 없으면 `not_configured`를 돌려주고, 화면은 키 등록 안내와 페르소나의
 *   "준비된 안내"를 보여준다. 가짜 답변을 만들지 않는다.
 * - `generateReply`는 절대 throw하지 않는다.
 */

import {
  completeUserAiTextDetailed,
  UserAiTransportError,
} from "@/shared/ai/user-ai-transport";
import {
  resolvedUserAiRoutes,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";

import { guardMentorInput, sanitizeMentorReply } from "./creator-mentor-filter";
import {
  buildMentorSystemPrompt,
  buildMentorUserPrompt,
} from "./creator-mentor-prompt";
import type {
  MentorAnswerControls,
  MentorChatMessage,
  MentorPersona,
} from "./creator-mentor-types";

export type MentorEngineErrorCode =
  | "not_configured"
  | "request_failed"
  | "empty_reply"
  | "blocked_topic";

export type MentorEngineResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly code: MentorEngineErrorCode;
      readonly error: string;
    };

export interface MentorEngineInput {
  readonly persona: MentorPersona;
  readonly controls: MentorAnswerControls;
  readonly history: readonly MentorChatMessage[];
  readonly userText: string;
  readonly signal?: AbortSignal;
}

export interface MentorEngine {
  readonly id: string;
  generateReply(input: MentorEngineInput): Promise<MentorEngineResult>;
}

/** 텍스트 완성 함수 — 테스트에서 스텁으로 교체할 수 있는 주입 지점. */
export type MentorCompleter = (
  system: string,
  user: string,
  signal?: AbortSignal,
) => Promise<string>;

async function defaultCompleter(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  const completed = await completeUserAiTextDetailed(system, user, signal);
  return completed.content;
}

/** 설정 안에 "글" 용도로 쓸 수 있는 연결이 하나라도 있는지. */
export function hasMentorTextRoute(configuration: UserAiConfiguration): boolean {
  return (configuration.connections ?? []).some(
    (connection) => resolvedUserAiRoutes(connection, "text").length > 0,
  );
}

const NOT_CONFIGURED_MESSAGE =
  "AI 연결이 아직 설정되지 않았어요. 키를 등록하면 멘토와 대화를 시작할 수 있어요.";

/** 키가 없을 때의 엔진 — 설정 안내로 유도하는 결과만 돌려준다. */
export function createUnavailableMentorEngine(): MentorEngine {
  return {
    id: "unavailable",
    async generateReply() {
      return { ok: false, code: "not_configured", error: NOT_CONFIGURED_MESSAGE };
    },
  };
}

/** BYOK 엔진 — 사용자가 등록한 텍스트 연결로 멘토 답변을 만든다. */
export function createByokMentorEngine(
  completer: MentorCompleter = defaultCompleter,
): MentorEngine {
  return {
    id: "byok-user-ai",
    async generateReply(input) {
      const guard = guardMentorInput(input.persona, input.userText);
      if (!guard.allowed) {
        return {
          ok: false,
          code: "blocked_topic",
          error: `"${guard.topic}" 주제는 이 멘토가 다루지 않아요. 다른 질문을 해 주세요.`,
        };
      }
      const system = buildMentorSystemPrompt(input.persona, input.controls);
      const user = buildMentorUserPrompt(input.history, input.userText);
      let raw: string;
      try {
        raw = await completer(system, user, input.signal);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return { ok: false, code: "request_failed", error: "답변 생성이 취소됐어요." };
        }
        const notConfigured =
          error instanceof UserAiTransportError && error.code === "not-configured";
        return {
          ok: false,
          code: notConfigured ? "not_configured" : "request_failed",
          error: notConfigured
            ? NOT_CONFIGURED_MESSAGE
            : "멘토 답변을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        };
      }
      const trimmed = raw.trim();
      if (!trimmed) {
        return {
          ok: false,
          code: "empty_reply",
          error: "멘토가 답을 하지 않았어요. 다시 한 번 질문해 주세요.",
        };
      }
      return { ok: true, text: sanitizeMentorReply(input.persona, trimmed).text };
    },
  };
}
