/**
 * 참 바 화면 문구의 이중언어 진입점.
 *
 * 이웃 컴포넌트(`StudioFirstPublishSuggestion` 등)와 같은 `bi(ko, en)` 관례다. 한 범위 이름으로 묶어
 * 참 바의 모든 컴포넌트가 같은 번역 파이프라인을 쓴다. 컴포넌트는 렌더 시작에서
 * `useBilingualI18nRevision()` 를 불러 언어가 바뀌면 다시 그린다.
 */

import { formatI18nTemplate, translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioCharmLock } from "./studio-charm-host-bridge";

export function bi(ko: string, en: string): string {
  return translateBilingualValueForActiveLocale("StudioCharmBar", ko, en);
}

/**
 * 소재 이름·개수처럼 동적 값이 든 문구. 한글·영문 틀은 정적 문자열이고, 값은 번역을 거친 뒤에 `{이름}` 자리에 채운다.
 * 값을 틀 안에 직접 끼워 넣으면(`bi(`…${label}`, …)`) 쌍마다 전역 번역 사전에 키가 등록되고 영문이 기계 번역
 * 소스가 되어, 내 소재 이름 같은 사용자 생성 텍스트가 ja 등에서 외부 번역 API 로 나갈 수 있다(저장소의 다른 곳과
 * 같은 `formatI18nTemplate(bi("{value0}…", …), values)` 관례다). 정적 틀만 쓰는지는 `studio-charm-copy.test.ts` 가 지킨다.
 */
export function biFill(ko: string, en: string, values: Readonly<Record<string, string | number>>): string {
  return formatI18nTemplate(bi(ko, en), values);
}

/** 편집 잠금 사유를 사용자 문구로 바꾼다. 잠금이 없으면 null. 호스트가 준 공동 편집 안내가 있으면 그것을 쓴다. */
export function lockNoticeText(lock: StudioCharmLock | null): string | null {
  if (!lock) return null;
  if (lock.kind === "review") {
    return bi("검수 중인 화면이라 지금은 붙일 수 없어요.", "This surface is under review, so stamping is unavailable.");
  }
  if (lock.kind === "collaboration") {
    return lock.message ?? bi("공동 편집 잠금 때문에 지금은 붙일 수 없어요.", "A collaboration lock prevents stamping right now.");
  }
  return bi("이 페이지는 편집이 잠겨 있어요.", "Editing is locked on this page.");
}
