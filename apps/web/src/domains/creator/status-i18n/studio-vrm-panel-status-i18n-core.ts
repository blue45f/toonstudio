/**
 * VRM 패널 로딩·실패·빈 상태 문구 사전 (A4 잔여 배치 3) — 진입 그래프 코어.
 *
 * 앱 셸·Studio 첫 청크 그래프에 정적으로 들어오는 소비 파일(StudioVrmProjectArchiveAttestationHost.tsx)이 쓰는 키 1개와
 * 해석 헬퍼(`vrmPanelStatusText`)만 등록한다. 나머지 키는 지연 표면 전용이라 원본 모듈
 * (`studio-vrm-panel-status-i18n`)이 등록하고, 원본이 이 코어를 함께 불러오므로 지연 소비 파일은 원본만 import 해도
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
  "studio.vrmPanelStatus.archiveAttestationHost.loadingTerms": "VRM 이용 조건 불러오는 중",
});

registerI18nLocaleEntries("en", {
  "studio.vrmPanelStatus.archiveAttestationHost.loadingTerms": "Loading VRM terms of use",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (studio-ai-error-i18n의
 * `aiErrorText` 선례). 키가 사전에 없으면 koFallback을 그대로 돌려준다.
 * `{token}` 보간은 useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function vrmPanelStatusText(key: string, koFallback: string): string;
export function vrmPanelStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function vrmPanelStatusText(
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
