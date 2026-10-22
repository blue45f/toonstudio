/**
 * market 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c08).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (catalog-status-i18n-r3c08.test.ts가 패리티를 고정한다). throw·effect
 * 같은 비컴포넌트 생산자도 있어 현재 로케일로 해석하는
 * `marketStatusText` 헬퍼를 함께 둔다 (creator-resources 선례).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "market.status.cloudLibrary.catalogUnavailable": "카탈로그 사용 불가 · {reason}",
  "market.status.cloudLibrary.packIdMismatch": "계정 라이브러리 패키지 식별자가 일치하지 않습니다.",
  "market.status.cloudLibrary.targetPackIdMismatch": "현재 획득 대상의 패키지 식별자가 상세 릴리스와 일치하지 않습니다.",
  "market.status.cloudLibrary.stateCheckFailed": "계정 라이브러리 상태를 확인하지 못했습니다.",
  "market.status.cloudLibrary.acquiredPackIdMismatch": "획득된 계정 라이브러리 패키지 식별자가 일치하지 않습니다.",
  "market.status.cloudLibrary.stateChangeFailed": "계정 라이브러리 상태를 변경하지 못했습니다.",
  "market.status.cloudLibrary.sessionChecking": "계정 라이브러리 세션 확인 중",
  "market.status.cloudLibrary.checking": "계정 라이브러리 확인 중",
  "market.status.report.submittedNotice": "신고가 접수되었습니다. 관리자 검수 전에는 공개 상태가 달라지지 않습니다.",
  "market.status.report.sessionChecking": "세션 확인 중",
  "market.status.report.ownResourceUnavailable": "내 리소스 신고 불가",
  "market.status.acquisition.addFailed": "내 에셋에 추가하지 못했습니다. 현재 에셋은 계정에 보관되지 않았습니다.",
  "market.status.acquisition.purchaseFailed": "포인트 구매를 마치지 못했습니다. 차감한 포인트는 되돌렸습니다.",
  "market.status.acquisition.checking": "확인 중…",
  "market.status.acquisition.checkUnavailable": "확인 불가",
  "market.status.acquisition.versionChecking": "현재 버전 확인 중…",
  "market.status.productionFit.blockLabel": "사용 불가",
  "market.status.productionFit.summaryAria": "문제 없음 {pass}개, 확인 필요 {review}개, 사용 불가 {block}개",
  "market.status.authoringInstall.manifestLoadFailed": "제작 manifest를 불러오지 못했습니다 ({status}).",
  "market.status.authoringInstall.manifestTooLarge": "제작 manifest가 허용 크기를 초과했습니다.",
  "market.status.authoringInstall.draftCreateFailed": "Studio 업데이트 초안을 만들지 못했습니다.",
  "market.status.authoringInstall.preparing": "준비 중",
});

registerI18nLocaleEntries("en", {
  "market.status.cloudLibrary.catalogUnavailable": "Catalog unavailable · {reason}",
  "market.status.cloudLibrary.packIdMismatch": "The account library package identifier does not match.",
  "market.status.cloudLibrary.targetPackIdMismatch": "The current acquisition target's package identifier does not match the detail release.",
  "market.status.cloudLibrary.stateCheckFailed": "Could not check the account library state.",
  "market.status.cloudLibrary.acquiredPackIdMismatch": "The acquired account library package identifier does not match.",
  "market.status.cloudLibrary.stateChangeFailed": "Could not change the account library state.",
  "market.status.cloudLibrary.sessionChecking": "Checking the account library session",
  "market.status.cloudLibrary.checking": "Checking the account library",
  "market.status.report.submittedNotice": "Your report has been received. The public state does not change until admin review.",
  "market.status.report.sessionChecking": "Checking the session",
  "market.status.report.ownResourceUnavailable": "Cannot report your own resource",
  "market.status.acquisition.addFailed": "Could not add it to your assets. The current asset was not stored in your account.",
  "market.status.acquisition.purchaseFailed": "Could not complete the point purchase. The deducted points were restored.",
  "market.status.acquisition.checking": "Checking…",
  "market.status.acquisition.checkUnavailable": "Unavailable",
  "market.status.acquisition.versionChecking": "Checking the current version…",
  "market.status.productionFit.blockLabel": "Unavailable",
  "market.status.productionFit.summaryAria": "{pass} with no issues, {review} needing review, {block} unavailable",
  "market.status.authoringInstall.manifestLoadFailed": "Could not load the authoring manifest ({status}).",
  "market.status.authoringInstall.manifestTooLarge": "The authoring manifest exceeded the allowed size.",
  "market.status.authoringInstall.draftCreateFailed": "Could not create the Studio update draft.",
  "market.status.authoringInstall.preparing": "Preparing",
});


export function marketStatusText(key: string, koFallback: string): string;
export function marketStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function marketStatusText(
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
