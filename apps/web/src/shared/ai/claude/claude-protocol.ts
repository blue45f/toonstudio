/**
 * Claude(Anthropic) 연결 식별 — 호스트만으로 프로토콜을 추론하는 순수 함수.
 *
 * 연결 설정 스키마·암호화 보관함·프리셋 표를 바꾸지 않기 위해 별도 필드를 두지 않는다.
 * 공식 API 호스트(api.anthropic.com)일 때만 Messages API 프로토콜을 쓰고, 그 밖의 모든
 * 연결은 기존 OpenAI 호환 경로 그대로다. 이 모듈은 SDK를 가져오지 않으므로 정책·전송
 * 계층이 정적으로 import해도 번들이 늘지 않는다.
 *
 * Claude는 운영측이 아니라 사용자 키로만 호출한다(운영자 비용 AI 비활성 불변식).
 * 비용 정책은 항상 `user-funded-byok`여야 하며 무료 티어로 표기할 수 없다.
 */
import type { UserAiCostPolicy } from "../free-ai-policy";

export const ANTHROPIC_API_HOST = "api.anthropic.com";
export const ANTHROPIC_API_ORIGIN = `https://${ANTHROPIC_API_HOST}`;

export type UserAiWireProtocol = "openai-compatible" | "anthropic-messages";

/** claude-opus-5-5, claude-haiku-4-5-20251001 처럼 공식 모델 ID 형태만 받는다. */
const CLAUDE_MODEL_ID_PATTERN = /^claude-[a-z0-9][a-z0-9.-]{1,78}$/u;

export interface ClaudeConnectionLike {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
  costPolicy: UserAiCostPolicy;
}

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

/** 공식 Anthropic API 호스트(HTTPS)인지 본다. 다른 호스트는 항상 OpenAI 호환으로 취급한다. */
export function isAnthropicBaseUrl(baseUrl: string): boolean {
  const url = parsedUrl(baseUrl);
  return Boolean(
    url
      && url.protocol === "https:"
      && url.hostname.toLowerCase() === ANTHROPIC_API_HOST,
  );
}

export function userAiWireProtocol(connection: Pick<ClaudeConnectionLike, "baseUrl">): UserAiWireProtocol {
  return isAnthropicBaseUrl(connection.baseUrl) ? "anthropic-messages" : "openai-compatible";
}

export function isClaudeModelId(model: string): boolean {
  return CLAUDE_MODEL_ID_PATTERN.test(model.trim());
}

/** 이번 요청에 쓸 모델: 호출 쪽이 고른 모델, 없으면 연결의 기본 모델. 형식이 맞지 않으면 보내기 전에 막는다(조용히 바꾸지 않는다). */
export function resolveClaudeRequestModel(requested: string | undefined, fallback: string): string {
  const model = requested?.trim() || fallback;
  if (!isClaudeModelId(model)) {
    throw new Error("Claude 모델 ID가 올바르지 않아요. 모델을 다시 선택해 주세요.");
  }
  return model;
}

/**
 * SDK가 `/v1/messages`를 붙이므로 기준 주소는 origin(또는 `/v1`)만 허용한다.
 * 자격 증명·포트·쿼리·해시·그 밖의 경로는 키를 엉뚱한 곳으로 보내는 통로가 되므로 막는다.
 */
export function anthropicBaseUrlIssue(baseUrl: string): string | null {
  const url = parsedUrl(baseUrl);
  if (!url || !isAnthropicBaseUrl(baseUrl)) {
    return "Claude 연결은 공식 주소 https://api.anthropic.com 만 사용할 수 있어요.";
  }
  const path = url.pathname.replace(/\/+$/u, "");
  if (url.username || url.password || url.port || url.search || url.hash || (path !== "" && path !== "/v1")) {
    return "Claude 주소에는 포트·인증정보·쿼리·추가 경로를 붙일 수 없어요. https://api.anthropic.com 으로 입력하세요.";
  }
  return null;
}

/** 저장·전송에 쓰는 정규 origin. 입력이 `…/v1/` 이어도 SDK 기준 주소는 origin이다. */
export function anthropicOrigin(): string {
  return ANTHROPIC_API_ORIGIN;
}

/**
 * Claude 연결의 정책 위반 사유(없으면 null). `freeAiConnectionPolicyIssue`가
 * Anthropic 호스트를 만났을 때 이 함수로 판정한다.
 */
export function anthropicConnectionIssue(
  connection: ClaudeConnectionLike,
  capability?: "text" | "image" | "inference" | "three-d",
): string | null {
  const urlIssue = anthropicBaseUrlIssue(connection.baseUrl);
  if (urlIssue) return urlIssue;
  if (connection.costPolicy !== "user-funded-byok") {
    return "Claude(Anthropic)는 무료 티어가 없어요. 사용자 결제 BYOK로만 연결할 수 있고 비용은 내 Anthropic 계정에 청구돼요.";
  }
  if (capability && capability !== "text") {
    return "Claude 연결은 텍스트 기능(이미지 입력 이해 포함)에만 배정할 수 있어요. 이미지 생성은 지원하지 않아요.";
  }
  if (connection.imageModel.trim()) {
    return "Claude 연결에는 이미지 생성 모델을 등록하지 않아요.";
  }
  if (capability === "text" && !isClaudeModelId(connection.textModel)) {
    return "Claude 모델 ID(예: claude-opus-5-5)를 입력하세요.";
  }
  return null;
}
