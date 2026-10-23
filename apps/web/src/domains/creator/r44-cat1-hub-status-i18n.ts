/**
 * creator 허브(production-hub 등) 잔여 상태 문구 사전 (A4 44라운드 cat1 잔여 후속).
 *
 * 기존 등록 모듈은 키 개수 단언 테스트가 있어 확장하지 않고 형제 모듈로
 * 신설한다. `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은
 * 이관 전 원문 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상
 * 일치해야 한다 (r44-cat1-hub-status-i18n.test.ts가 패리티를 고정한다).
 *
 * 소비 파일은 모듈을 직접 import하고 생산 시점에 현재 로케일로 해석하는
 * `r44CreatorHubStatusText(key, koFallback)` 형태로 호출한다 (r4 패턴 준용).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "r44cat1.hub.recovery.originalKeptBody": "원래 업무 상태를 보관했습니다. 이후 같은 업무가 바뀌면 덮어쓰지 않고 되돌리기를 중단합니다.",
  "r44cat1.hub.recovery.undoConflictBody": "같은 업무 {count}개가 이후 변경되어 자동 되돌리기를 잠갔습니다. 최신 내용을 확인한 뒤 직접 조정해 주세요.",
  "r44cat1.hub.revisionBridge.previewNotice": "기능 미리보기에서는 실제 Studio 서버 정본을 변경하지 않습니다. 내 프로젝트에서 열면 원고 revision과 제작 작업을 연결할 수 있습니다.",
});

registerI18nLocaleEntries("en", {
  "r44cat1.hub.recovery.originalKeptBody": "The original task state has been kept. If the same task changes later, undo stops instead of overwriting it.",
  "r44cat1.hub.recovery.undoConflictBody": "{count} of the same tasks changed afterwards, so automatic undo has been locked. Review the latest content and adjust it directly.",
  "r44cat1.hub.revisionBridge.previewNotice": "The feature preview does not change the actual Studio server source of truth. Open it in your project to connect manuscript revisions with production tasks.",
});

/** 비훅 생산자·렌더 시점용 상태 문구 리졸버 — r4 헬퍼와 같은 계약. */
export function r44CreatorHubStatusText(key: string, koFallback: string): string;
export function r44CreatorHubStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r44CreatorHubStatusText(
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
