import { useSyncExternalStore } from "react";

import { getAppStore } from "./store-registry";
import { deriveSavedTitleIds } from "./types";

// SSR/CSR 하이드레이션 가드 — persist 가 클라이언트에서 채워질 때까지 false.
// useSyncExternalStore 로 외부(persist) 상태를 구독 (effect 내 setState 없이 SSR 안전).
export function useHydrated(): boolean {
  const appStore = getAppStore();
  return useSyncExternalStore(
    (cb) => appStore.persist.onFinishHydration(cb),
    () => appStore.persist.hasHydrated(),
    () => false
  );
}

// 파생 셀렉터 헬퍼 — '관심(want)'만 북마크로 간주
export function useIsBookmarked(titleId: string): boolean {
  return getAppStore()((s) => s.reads[titleId] === "want");
}

// '내 찜·서재' = 사용자가 저장/구독/컬렉션에 담은 모든 작품 id 집합(하차 제외).
// 페이지 필터의 "내 찜만 보기"에 사용. 합집합 규칙은 @toonstudio/core 의 순수
// deriveSavedTitleIds 로 추출돼 여러 웹 화면이 공유한다(세 레코드 참조는 안정적이라 React Compiler가 메모이즈).
export function useSavedTitleIds(): Set<string> {
  const appStore = getAppStore();
  const reads = appStore((s) => s.reads);
  const subscriptions = appStore((s) => s.subscriptions);
  const collections = appStore((s) => s.collections);
  return deriveSavedTitleIds(reads, subscriptions, collections);
}
