/**
 * integrations 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c10).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (integrations-status-i18n-r3c10.test.ts가 패리티를 고정한다). 이미
 * `ko ? … : …` 이중언어 삼항으로 감싸진 문구는 기존 패턴이 정본이라
 * 이 사전에 중복 등록하지 않고, 단일 한국어 상태 문구만 다룬다.
 * 비컴포넌트 생산자(getApiErrorMessage 폴백 등)도 있어 현재 로케일로
 * 해석하는 `integrationsStatusText` 헬퍼를 함께 둔다 (catalog 선례).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "integrations.status.automation.loadFailed": "자동화 구성을 불러오지 못했습니다.",
  "integrations.status.automation.validateFailed": "자동화 검증에 실패했습니다.",
  "integrations.status.developer.loadFailed": "개발자 계약을 불러오지 못했습니다.",
  "integrations.status.publish.packageFailed": "게시 패키지를 만들지 못했습니다.",
  "integrations.status.publish.feedPreviewFailed": "피드 미리보기를 만들지 못했습니다.",
  "integrations.status.publish.validationPassed": "통과",
  "integrations.status.publish.validationFailed": "실패",
  "integrations.status.serial.loadFailed": "연재 현황을 불러오지 못했습니다.",
  "integrations.status.runtime.receiptPending": "처리 중",
  "integrations.status.runtime.receiptSucceeded": "성공",
  "integrations.status.runtime.receiptFailed": "실패",
  "integrations.status.runtime.receiptUncertain": "결과 불확실",
  "integrations.status.aiKey.checking": "확인 중…",
  "integrations.status.fal.removeFailed": "저장된 키를 지우지 못했습니다. 브라우저 저장소 상태를 확인하고 다시 시도하세요.",
  "integrations.status.fal.saveFailed": "이 탭에 키를 저장하지 못했습니다. 시크릿 모드이거나 저장 공간이 부족할 수 있어요.",
  "integrations.status.fal.registered": "등록했습니다. 연결 테스트는 하지 않으며(학습·생성은 과금 호출이라 테스트로 부르지 않습니다), 첫 학습에서 키가 확인됩니다.",
  "integrations.status.maskedKey.copyFailedLabel": "복사 실패",
  "integrations.status.maskedKey.copyFailedAlert": "클립보드에 복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.",
  "integrations.status.resend.saveFailed": "키를 저장하지 못했습니다. 이 탭에서 다시 시도해 주세요.",
  "integrations.status.resend.keyRequired": "키를 입력해 주세요.",
  "integrations.status.unsplash.removeFailed": "저장된 키를 지우지 못했습니다. 브라우저 저장소 상태를 확인하고 다시 시도하세요.",
  "integrations.status.unsplash.invalidKey": "키가 유효하지 않거나 요청이 거부됐습니다. 키를 다시 확인하세요.",
  "integrations.status.unsplash.testFailed": "연결 테스트에 실패했습니다: {error}",
  "integrations.status.unsplash.saveFailed": "키는 유효하지만 이 탭에 저장하지 못했습니다. 시크릿 모드이거나 저장 공간이 부족할 수 있어요.",
});

registerI18nLocaleEntries("en", {
  "integrations.status.automation.loadFailed": "Could not load the automation setup.",
  "integrations.status.automation.validateFailed": "Automation validation failed.",
  "integrations.status.developer.loadFailed": "Could not load the developer contract.",
  "integrations.status.publish.packageFailed": "Could not build the publish package.",
  "integrations.status.publish.feedPreviewFailed": "Could not build the feed preview.",
  "integrations.status.publish.validationPassed": "Passed",
  "integrations.status.publish.validationFailed": "Failed",
  "integrations.status.serial.loadFailed": "Could not load the serialization status.",
  "integrations.status.runtime.receiptPending": "Processing",
  "integrations.status.runtime.receiptSucceeded": "Succeeded",
  "integrations.status.runtime.receiptFailed": "Failed",
  "integrations.status.runtime.receiptUncertain": "Uncertain outcome",
  "integrations.status.aiKey.checking": "Checking…",
  "integrations.status.fal.removeFailed": "Could not remove the saved key. Check the browser storage state and try again.",
  "integrations.status.fal.saveFailed": "Could not save the key in this tab. You may be in private mode or low on storage space.",
  "integrations.status.fal.registered": "Registered. No connection test is run (training and generation are billed calls, so they are not used as tests); the key is verified at the first training run.",
  "integrations.status.maskedKey.copyFailedLabel": "Copy failed",
  "integrations.status.maskedKey.copyFailedAlert": "Could not copy to the clipboard. Check your browser's clipboard permission.",
  "integrations.status.resend.saveFailed": "Could not save the key. Try again in this tab.",
  "integrations.status.resend.keyRequired": "Enter your key.",
  "integrations.status.unsplash.removeFailed": "Could not remove the saved key. Check the browser storage state and try again.",
  "integrations.status.unsplash.invalidKey": "The key is invalid or the request was rejected. Check the key and try again.",
  "integrations.status.unsplash.testFailed": "Connection test failed: {error}",
  "integrations.status.unsplash.saveFailed": "The key is valid but could not be saved in this tab. You may be in private mode or low on storage space.",
});

export function integrationsStatusText(key: string, koFallback: string): string;
export function integrationsStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function integrationsStatusText(
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
