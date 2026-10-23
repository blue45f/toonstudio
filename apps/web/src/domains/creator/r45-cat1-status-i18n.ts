/**
 * creator 잔여 상태 문구 사전 (A4 45라운드 cat1 X-DYNAMIC 처분).
 *
 * 기존 등록 모듈은 키 개수 단언 테스트가 있어 확장하지 않고 형제 모듈로
 * 신설한다. `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은
 * 이관 전 원문 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상
 * 일치해야 한다 (r45-cat1-status-i18n.test.ts가 패리티를 고정한다).
 *
 * 소비 파일은 모듈을 직접 import하고 생산 시점에 현재 로케일로 해석하는
 * `r45CreatorStatusText(key, koFallback)` 형태로 호출한다 (r4 패턴 준용).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "r45cat1.creator.companionManager.openedTab": "{label} 탭을 열거나 앞으로 가져오도록 요청했습니다.",
  "r45cat1.creator.companionManager.openedWindow": "{label} 창을 열거나 앞으로 가져오도록 요청했습니다.",
  "r45cat1.creator.finishQuality.reviewTitle": "자동 검사는 통과했고 사람의 최종 확인이 필요합니다",
});

registerI18nLocaleEntries("en", {
  "r45cat1.creator.companionManager.openedTab": "Requested to open {label} in a tab or bring it to the front.",
  "r45cat1.creator.companionManager.openedWindow": "Requested to open {label} in a window or bring it to the front.",
  "r45cat1.creator.finishQuality.reviewTitle": "Automated checks passed and a final human review is required",
});

/** 비훅 생산자·렌더 시점용 상태 문구 리졸버 — r4 헬퍼와 같은 계약. */
export function r45CreatorStatusText(key: string, koFallback: string): string;
export function r45CreatorStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r45CreatorStatusText(
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
