/**
 * creator 잔여 상태 문구 사전 (A4 44라운드 cat1 잔여 후속).
 *
 * 기존 등록 모듈은 키 개수 단언 테스트가 있어 확장하지 않고 형제 모듈로
 * 신설한다. `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은
 * 이관 전 원문 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상
 * 일치해야 한다 (r44-cat1-status-i18n.test.ts가 패리티를 고정한다).
 *
 * 소비 파일은 모듈을 직접 import하고 생산 시점에 현재 로케일로 해석하는
 * `r44CreatorStatusText(key, koFallback)` 형태로 호출한다 (r4 패턴 준용).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "r44cat1.creator.colorizeMask.noMaskStatus": "힌트 채색 마스크를 추가하면 선화 위에 색 힌트를 몇 획 그어 영역별로 한 번에 칠할 수 있어요. 선화 원본은 바뀌지 않습니다.",
  "r44cat1.creator.onDemandModule.retry": "다시 시도",
  "r44cat1.creator.productionInsights.cleanStatus": "잘못된 항목이나 입력 한도 적용 없이 전달된 문서 구조 전체를 계산했습니다.",
  "r44cat1.creator.puppetWarp.readyStatus": "변형을 적용할 준비가 됐습니다. 적용 전까지 원본 픽셀은 바뀌지 않습니다.",
  "r44cat1.creator.stockImage.idlePrompt": "검색어를 입력해 무료 사진을 찾아보세요.",
  "r44cat1.creator.workspaceRegion.retry": "다시 시도",
});

registerI18nLocaleEntries("en", {
  "r44cat1.creator.colorizeMask.noMaskStatus": "Add a hint colorize mask and draw a few color hint strokes over the line art to fill each area at once. The original line art does not change.",
  "r44cat1.creator.onDemandModule.retry": "Retry",
  "r44cat1.creator.productionInsights.cleanStatus": "The entire document structure provided was calculated without invalid entries or input limits applied.",
  "r44cat1.creator.puppetWarp.readyStatus": "Ready to apply the deformation. The original pixels do not change until you apply it.",
  "r44cat1.creator.stockImage.idlePrompt": "Enter a search term to find free photos.",
  "r44cat1.creator.workspaceRegion.retry": "Retry",
});

/** 비훅 생산자·렌더 시점용 상태 문구 리졸버 — r4 헬퍼와 같은 계약. */
export function r44CreatorStatusText(key: string, koFallback: string): string;
export function r44CreatorStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r44CreatorStatusText(
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
