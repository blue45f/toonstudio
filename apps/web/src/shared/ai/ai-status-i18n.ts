/**
 * shared/ai 표면 로딩·실패 상태 문구 사전 (A4 잔여 3라운드 c11).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. 소비 파일은 모듈 직접
 * import가 정본이며, 컴포넌트는 `t(key, fallback)`, 모듈 레벨 맵·콜백은
 * 비컴포넌트 생산자용 생산 시점 해석 헬퍼 `aiSharedStatusText(key, fallback)`
 * (creator의 panelStatusText 선례)로 호출한다. 키가 사전에 없으면
 * koFallback을 그대로 돌려준다.
 * 대상 표면: AiCapabilityStatusBoard·AiRecoveryNotice·UnifiedAiAdvancedSettings.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "shared.aiStatus.capability.ready": "사용 가능",
  "shared.aiStatus.capability.setupRequired": "연결 필요",
  "shared.aiStatus.capability.unavailable": "현재 비활성",
  "shared.aiStatus.capability.checking": "확인 중",
  "shared.aiStatus.capability.local": "기기에서 사용",
  "shared.aiStatus.recovery.loginRequired": "로그인하면 자동 무료 AI를 바로 사용할 수 있어요",
  "shared.aiStatus.recovery.freeExhausted": "현재 사용할 수 있는 무료 AI 경로가 모두 찼어요",
  "shared.aiStatus.recovery.notConfigured": "AI 연결을 준비해 주세요",
  "shared.aiStatus.recovery.invalidInput": "입력 내용을 확인해 주세요",
  "shared.aiStatus.recovery.networkError": "AI 연결이 잠시 끊겼어요",
  "shared.aiStatus.recovery.httpError": "AI 요청을 완료하지 못했어요",
  "shared.aiStatus.recovery.parseError": "AI 응답을 안전하게 읽지 못했어요",
  "shared.aiStatus.recovery.retry": "다시 시도",
  "shared.aiStatus.settings.processFailed": "설정을 처리하지 못했습니다.",
  "shared.aiStatus.settings.legacyEmpty": "가져올 기존 Studio 클라우드 키 설정이 없습니다.",
});

registerI18nLocaleEntries("en", {
  "shared.aiStatus.capability.ready": "Available",
  "shared.aiStatus.capability.setupRequired": "Setup required",
  "shared.aiStatus.capability.unavailable": "Currently inactive",
  "shared.aiStatus.capability.checking": "Checking",
  "shared.aiStatus.capability.local": "On-device",
  "shared.aiStatus.recovery.loginRequired": "Sign in to use automatic free AI right away",
  "shared.aiStatus.recovery.freeExhausted": "All free AI routes are currently full",
  "shared.aiStatus.recovery.notConfigured": "Set up your AI connection",
  "shared.aiStatus.recovery.invalidInput": "Check your input",
  "shared.aiStatus.recovery.networkError": "The AI connection dropped briefly",
  "shared.aiStatus.recovery.httpError": "Could not complete the AI request",
  "shared.aiStatus.recovery.parseError": "Could not read the AI response safely",
  "shared.aiStatus.recovery.retry": "Try again",
  "shared.aiStatus.settings.processFailed": "Could not process the settings.",
  "shared.aiStatus.settings.legacyEmpty": "No existing Studio cloud key settings to import.",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (creator의 panelStatusText
 * 선례). 키가 사전에 없으면 koFallback을 그대로 돌려준다.
 * `{token}` 보간은 useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function aiSharedStatusText(key: string, koFallback: string): string;
export function aiSharedStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function aiSharedStatusText(
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
