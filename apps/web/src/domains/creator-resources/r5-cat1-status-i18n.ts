/**
 * creator-resources 잔여 상태 문구 사전 (A4 5라운드 cat1 잔여 후속).
 *
 * 기존 등록 모듈은 키 개수 단언 테스트가 있어 확장하지 않고 형제 모듈로
 * 신설한다. `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은
 * 이관 전 원문 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상
 * 일치해야 한다 (r5-cat1-status-i18n.test.ts가 패리티를 고정한다).
 *
 * 소비 파일은 모듈을 직접 import하고 생산 시점에 현재 로케일로 해석하는
 * `r5ResourcesStatusText(key, koFallback)` 형태로 호출한다 (r4 패턴 준용).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "r5cat1.creatorResources.atlas.boardLoaded": "보드와 제작 메모를 불러왔습니다.",
  "r5cat1.creatorResources.atlas.boardLoadedMissing": "보드를 불러왔습니다. 현재 카탈로그에 없는 소재 {missing}개는 제외했습니다.",
});

registerI18nLocaleEntries("en", {
  "r5cat1.creatorResources.atlas.boardLoaded": "Loaded the board and production notes.",
  "r5cat1.creatorResources.atlas.boardLoadedMissing": "Loaded the board. {missing} material(s) not in the current catalog were excluded.",
});

/** 비훅 생산자·렌더 시점용 상태 문구 리졸버 — r4 헬퍼와 같은 계약. */
export function r5ResourcesStatusText(key: string, koFallback: string): string;
export function r5ResourcesStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r5ResourcesStatusText(
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
