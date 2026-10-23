/**
 * 가입·이메일 인증 결과 문구 사전 (A4 4라운드 cat2 도달 확정분 이관).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (auth-email-action-result-i18n.test.ts가 패리티를 고정한다).
 *
 * 생산자 auth-email-action-result.ts는 비UI 모듈이라 훅을 쓸 수 없으므로,
 * AI 생산자 채널 선례(studio-ai-error-i18n의 aiErrorText)와 같은 방식으로
 * 생산 시점에 현재 로케일로 해석하는 `authEmailActionText` 헬퍼를 둔다.
 * 반환 계약 { ok, message: string }과 서버 메시지 패스스루(safeMessage)는
 * 바꾸지 않는다 — 서버가 보낸 문구는 타자 메시지라 키화하지 않는다
 * (AI 설계 §3.4의 detail 원칙과 동일).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "auth.emailAction.unavailable": "가입·이메일 인증 서비스를 일시적으로 이용할 수 없어요. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.",
  "auth.emailAction.unconfirmed": "서버 응답을 확인하지 못해 메일 발송 여부를 알 수 없어요. 입력 내용을 유지했으니 잠시 후 다시 확인해 주세요.",
  "auth.emailAction.rateLimited": "요청이 많아 잠시 제한되었어요. 입력 내용은 유지됩니다. 잠시 기다린 뒤 다시 시도해 주세요.",
  "auth.emailAction.signupCheckFailed": "가입 정보를 확인한 뒤 다시 시도해 주세요.",
  "auth.emailAction.emailSendFailed": "안내 메일을 보내지 못했어요.",
  "auth.emailAction.signupSent": "가입 확인 메일을 보냈어요. 이메일 인증 후 로그인해 주세요.",
  "auth.emailAction.emailSent": "처리 가능한 계정이 있다면 안내 메일을 보냈어요.",
});

registerI18nLocaleEntries("en", {
  "auth.emailAction.unavailable": "The sign-up and email verification service is temporarily unavailable. Your input is kept. Please try again shortly.",
  "auth.emailAction.unconfirmed": "We could not confirm the server response, so we cannot tell whether the email was sent. Your input is kept, so please check again shortly.",
  "auth.emailAction.rateLimited": "There are too many requests, so access is briefly limited. Your input is kept. Please wait a moment and try again.",
  "auth.emailAction.signupCheckFailed": "Check your sign-up details and try again.",
  "auth.emailAction.emailSendFailed": "Could not send the email.",
  "auth.emailAction.signupSent": "We sent a verification email. Verify your email, then sign in.",
  "auth.emailAction.emailSent": "If an account can be processed, we sent an email with instructions.",
});

export function authEmailActionText(key: string, koFallback: string): string;
export function authEmailActionText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function authEmailActionText(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
