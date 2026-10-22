/**
 * 응답이 끝까지 온 정상 응답인지 판정한다. 정적으로 import해도 가볍다(SDK는 타입만 참조).
 *
 * 거절·잘림·문맥 초과·일시 정지는 이미 과금된 응답일 수 있어 조용히 넘기지 않고 사유가 드러나는 오류로 올린다.
 * 어느 경우에도 앱은 자동으로 다시 보내지 않는다.
 */
import { UserAiTransportError } from "../user-ai-transport-error";

import type Anthropic from "@anthropic-ai/sdk";

const REFUSED_MESSAGE = "Claude 안전 정책으로 이 요청을 처리하지 않았어요. 요청 내용을 조정해 보세요.";
const TRUNCATED_MESSAGE =
  "Claude 응답이 길이 제한에서 잘렸어요. 입력을 줄이거나 다시 시도하세요. 자동으로 재전송하지 않았어요.";
const CONTEXT_EXCEEDED_MESSAGE =
  "입력이 모델이 한 번에 읽을 수 있는 길이를 넘었어요. 입력을 줄여 다시 시도하세요. 자동으로 재전송하지 않았어요.";
const PAUSED_MESSAGE =
  "Claude가 응답을 끝내지 못하고 멈췄어요. 잠시 뒤 다시 시도하세요. 자동으로 재전송하지 않았어요.";

export function assertClaudeMessageComplete(message: Anthropic.Message): void {
  switch (message.stop_reason) {
    case "refusal":
      throw new UserAiTransportError("http-error", REFUSED_MESSAGE, 200);
    case "max_tokens":
      throw new UserAiTransportError("http-error", TRUNCATED_MESSAGE, 200);
    case "model_context_window_exceeded":
      throw new UserAiTransportError("http-error", CONTEXT_EXCEEDED_MESSAGE, 200);
    case "pause_turn":
      throw new UserAiTransportError("http-error", PAUSED_MESSAGE, 200);
    default:
  }
}
