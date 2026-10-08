import { KIND_ITEMS } from "./fan-cafe-constants";

import type { FanCafePostKind, FanCafeScopeFilter } from "@/shared/lib/types";

/**
 * 팬카페 작성기 임시 저장(이어쓰기) 계약 — 기기 저장 키, 저장 형태, 복원 시 글 유형 검증.
 * (2026-10-09 파일 크기 래칫 해소로 fan-cafe-panel에서 추출 — 동작 변경 없음.)
 */
export type FanCafeComposerDraft = {
  title: string;
  text: string;
  tags: string;
  composeKind: FanCafePostKind;
  savedAt: string;
};

export function fanCafeDraftStorageKey(userId: string, scope: FanCafeScopeFilter, targetId?: string) {
  return `toonstudio:fan-cafe-composer-draft:${userId}:${scope}:${targetId ?? ""}`;
}

export function isComposerDraftKind(value: unknown): value is FanCafePostKind {
  return KIND_ITEMS.some((item) => item.value === value);
}
