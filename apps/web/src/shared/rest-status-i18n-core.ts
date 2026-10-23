/**
 * 공유 표면·앱 오류·데스크클라우드·기타 도메인의 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c14) — 진입 그래프 코어.
 *
 * 앱 셸·Studio 첫 청크 그래프에 정적으로 들어오는 소비 파일(error-boundary.tsx, browser-compat-modal.tsx)이 쓰는 키 4개와
 * 해석 헬퍼(`restStatusText`)만 등록한다. 나머지 키는 지연 표면 전용이라 원본 모듈
 * (`rest-status-i18n`)이 등록하고, 원본이 이 코어를 함께 불러오므로 지연 소비 파일은 원본만 import 해도
 * 전체 키를 얻는다. 진입 그래프 소비 파일은 원본 대신 이 코어를 직접 import 해, 지연 표면 전용 사전 본문이 첫 청크에
 * 묶이지 않게 한다(scripts/check-studio-eager-graph.mjs 금지 목록이 이 경계를 고정한다).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "rest.status.common.retry": "다시 시도",
  "rest.status.errors.autoRecoverFailed": "자동으로 복구하지 못했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
  "rest.status.errors.retryOrHome": "다시 시도하거나 홈으로 이동해 주세요.",
  "rest.status.browserCompat.loading": "브라우저 호환성 안내를 불러오는 중…",
});

registerI18nLocaleEntries("en", {
  "rest.status.common.retry": "Try again",
  "rest.status.errors.autoRecoverFailed": "Automatic recovery failed. Check your network connection and try again.",
  "rest.status.errors.retryOrHome": "Try again or go back home.",
  "rest.status.browserCompat.loading": "Loading browser compatibility notice…",
});

export function restStatusText(key: string, koFallback: string): string;
export function restStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function restStatusText(
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
