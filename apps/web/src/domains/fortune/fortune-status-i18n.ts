/**
 * fortune 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c10).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (fortune-status-i18n-r3c10.test.ts가 패리티를 고정한다). 운세 결과 본문·
 * 해석 텍스트는 콘텐츠 본문이라 이 사전의 대상이 아니며, 로딩·실패·빈
 * 상태와 저장·공유 상태 알림만 다룬다. 비컴포넌트 생산자도 있어 현재
 * 로케일로 해석하는 `fortuneStatusText` 헬퍼를 함께 둔다 (catalog 선례).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "fortune.status.loading.today.0": "오늘의 기운을 살피는 중",
  "fortune.status.loading.today.1": "일진을 맞춰보는 중",
  "fortune.status.loading.today.2": "콘티를 그리는 중",
  "fortune.status.loading.monthly.0": "이달의 흐름을 살피는 중",
  "fortune.status.loading.monthly.1": "월간 기운을 읽는 중",
  "fortune.status.loading.monthly.2": "콘티를 그리는 중",
  "fortune.status.loading.yearly.0": "올해의 운을 살피는 중",
  "fortune.status.loading.yearly.1": "연간 흐름을 읽는 중",
  "fortune.status.loading.yearly.2": "콘티를 그리는 중",
  "fortune.status.loading.zodiac.0": "별자리를 짚는 중",
  "fortune.status.loading.zodiac.1": "별의 흐름을 읽는 중",
  "fortune.status.loading.zodiac.2": "콘티를 그리는 중",
  "fortune.status.loading.saju.0": "사주를 펼치는 중",
  "fortune.status.loading.saju.1": "오행을 가늠하는 중",
  "fortune.status.loading.saju.2": "콘티를 그리는 중",
  "fortune.status.loading.compatibility.0": "두 기운을 포개는 중",
  "fortune.status.loading.compatibility.1": "합·충을 살피는 중",
  "fortune.status.loading.compatibility.2": "콘티를 그리는 중",
  "fortune.status.loading.prescription.0": "마음을 들여다보는 중",
  "fortune.status.loading.prescription.1": "서가를 살피는 중",
  "fortune.status.loading.prescription.2": "처방을 적는 중",
  "fortune.status.loading.tarot.0": "카드의 기운을 읽는 중",
  "fortune.status.loading.tarot.1": "메시지를 해석하는 중",
  "fortune.status.loading.tarot.2": "콘티를 그리는 중",
  "fortune.status.enrichment.reason.notConfigured": "외부 데이터 연결은 아직 활성화되지 않았어요.",
  "fortune.status.enrichment.reason.rightsPending": "외부 콘텐츠의 이용권한 확인 전입니다.",
  "fortune.status.enrichment.reason.coordinationUnavailable": "안전한 호출 한도를 확인할 수 없어 외부 연결을 쉬고 있어요.",
  "fortune.status.enrichment.reason.budgetExhausted": "외부 데이터의 무료 호출 예산에 도달했어요.",
  "fortune.status.enrichment.reason.providerUnavailable": "추가 데이터를 확인할 수 없어요.",
  "fortune.status.enrichment.reason.historicalRequest": "이 기준 날짜에는 외부 추가 읽기를 제공하지 않아요.",
  "fortune.status.enrichment.reasonSuffix": " 기본 로컬 해석은 계속 사용할 수 있어요.",
  "fortune.status.enrichment.loadFailedNotice": "추가 데이터를 확인할 수 없어 기본 로컬 해석을 유지합니다.",
  "fortune.status.enrichment.checking": "추가 데이터 확인 중…",
  "fortune.status.enrichment.expired": "추가 데이터의 유효기간이 지났어요. 다시 확인해 주세요. 기본 해석은 유지됩니다.",
  "fortune.status.specialDays.checking": "특일 데이터 확인 중…",
  "fortune.status.specialDays.notConfigured": "특일 데이터 연결은 아직 활성화되지 않았어요. 기본 달력은 계속 사용할 수 있어요.",
  "fortune.status.specialDays.unavailable": "특일 데이터를 확인할 수 없어 기본 달력을 유지합니다.",
  "fortune.status.specialDays.expired": "특일 정보의 유효기간이 지났어요. 다시 확인해 주세요.",
  "fortune.status.observatory.storageClearFailed": "브라우저 저장소를 지울 수 없어요. 브라우저 설정에서 사이트 데이터를 확인해 주세요.",
  "fortune.status.lunaHero.shareOpenFailed": "공유를 열지 못했어요. 잠시 후 다시 시도해 주세요.",
  "fortune.status.shareModal.imageSaveFailed": "이미지 저장에 실패했어요. 다시 시도해 주세요.",
  "fortune.status.shareModal.linkCopyFailed": "링크 복사에 실패했어요.",
  "fortune.status.readingTools.shareUnavailable": "이 브라우저에서는 공유창을 열 수 없어요. 아래 내용을 직접 복사해 주세요.",
  "fortune.status.sourcePanel.loadFailed": "운세를 불러오지 못했어요. 자동 재요청하지 않습니다.",
  "fortune.status.sourcePanel.providerFailedLocal": "외부 제공자 실패 · 기존 로컬 계산으로 표시",
  "fortune.status.storyPortal.journeyPreparing": "해석 준비 중",
  "fortune.status.toolHero.savedBoth": "두 사람의 생년월일이 저장돼 있어요. 캐릭터를 고르면 바로 궁합을 볼 수 있어요.",
  "fortune.status.toolHero.savedMine": "내 생년월일은 저장돼 있어요. 상대의 생년월일은 캐릭터를 고른 뒤 입력해요.",
  "fortune.status.toolHero.savedBirth": "저장된 생년월일이 있어요. 캐릭터를 고르면 바로 시작해요.",
  "fortune.status.readingView.paletteSaveFailed": "Studio 색상 라이브러리에 저장하지 못했어요. 기존 팔레트는 변경하지 않았습니다.",
  "fortune.status.readingView.paletteSaving": "Studio에 저장 중…",
  "fortune.status.readingView.noTerms": "이 날짜에는 절입이 없습니다.",
});

registerI18nLocaleEntries("en", {
  "fortune.status.loading.today.0": "Reading today's energy",
  "fortune.status.loading.today.1": "Aligning the day pillar",
  "fortune.status.loading.today.2": "Sketching the panels",
  "fortune.status.loading.monthly.0": "Reading this month's flow",
  "fortune.status.loading.monthly.1": "Reading the monthly energy",
  "fortune.status.loading.monthly.2": "Sketching the panels",
  "fortune.status.loading.yearly.0": "Reading this year's fortune",
  "fortune.status.loading.yearly.1": "Reading the yearly flow",
  "fortune.status.loading.yearly.2": "Sketching the panels",
  "fortune.status.loading.zodiac.0": "Locating the constellations",
  "fortune.status.loading.zodiac.1": "Reading the flow of the stars",
  "fortune.status.loading.zodiac.2": "Sketching the panels",
  "fortune.status.loading.saju.0": "Unfolding the birth chart",
  "fortune.status.loading.saju.1": "Weighing the five elements",
  "fortune.status.loading.saju.2": "Sketching the panels",
  "fortune.status.loading.compatibility.0": "Overlaying the two energies",
  "fortune.status.loading.compatibility.1": "Checking harmonies and clashes",
  "fortune.status.loading.compatibility.2": "Sketching the panels",
  "fortune.status.loading.prescription.0": "Looking into the heart",
  "fortune.status.loading.prescription.1": "Browsing the bookshelf",
  "fortune.status.loading.prescription.2": "Writing the prescription",
  "fortune.status.loading.tarot.0": "Reading the cards' energy",
  "fortune.status.loading.tarot.1": "Interpreting the message",
  "fortune.status.loading.tarot.2": "Sketching the panels",
  "fortune.status.enrichment.reason.notConfigured": "The external data connection is not active yet.",
  "fortune.status.enrichment.reason.rightsPending": "Usage rights for the external content are still being confirmed.",
  "fortune.status.enrichment.reason.coordinationUnavailable": "The safe call limit could not be verified, so the external connection is paused.",
  "fortune.status.enrichment.reason.budgetExhausted": "The free call budget for external data has been reached.",
  "fortune.status.enrichment.reason.providerUnavailable": "Additional data is unavailable.",
  "fortune.status.enrichment.reason.historicalRequest": "External enrichment is not offered for this reference date.",
  "fortune.status.enrichment.reasonSuffix": " You can keep using the basic local reading.",
  "fortune.status.enrichment.loadFailedNotice": "Additional data could not be loaded, so the basic local reading is kept.",
  "fortune.status.enrichment.checking": "Checking additional data…",
  "fortune.status.enrichment.expired": "The additional data has expired. Please check again. The basic reading is kept.",
  "fortune.status.specialDays.checking": "Checking special-day data…",
  "fortune.status.specialDays.notConfigured": "The special-day data connection is not active yet. You can keep using the basic calendar.",
  "fortune.status.specialDays.unavailable": "Special-day data could not be loaded, so the basic calendar is kept.",
  "fortune.status.specialDays.expired": "The special-day information has expired. Please check again.",
  "fortune.status.observatory.storageClearFailed": "Browser storage could not be cleared. Check the site data in your browser settings.",
  "fortune.status.lunaHero.shareOpenFailed": "Could not open sharing. Please try again in a moment.",
  "fortune.status.shareModal.imageSaveFailed": "Failed to save the image. Please try again.",
  "fortune.status.shareModal.linkCopyFailed": "Failed to copy the link.",
  "fortune.status.readingTools.shareUnavailable": "This browser cannot open the share dialog. Copy the content below directly.",
  "fortune.status.sourcePanel.loadFailed": "Could not load the fortune. It will not be requested again automatically.",
  "fortune.status.sourcePanel.providerFailedLocal": "External provider failed · Shown with the existing local calculation",
  "fortune.status.storyPortal.journeyPreparing": "Preparing the reading",
  "fortune.status.toolHero.savedBoth": "Both birth dates are saved. Pick a character to see your compatibility right away.",
  "fortune.status.toolHero.savedMine": "Your birth date is saved. Enter your partner's birth date after picking a character.",
  "fortune.status.toolHero.savedBirth": "A birth date is saved. Pick a character to start right away.",
  "fortune.status.readingView.paletteSaveFailed": "Could not save to the Studio color library. Your existing palette was not changed.",
  "fortune.status.readingView.paletteSaving": "Saving to Studio…",
  "fortune.status.readingView.noTerms": "There is no solar-term ingress on this date.",
});

export function fortuneStatusText(key: string, koFallback: string): string;
export function fortuneStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function fortuneStatusText(
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
