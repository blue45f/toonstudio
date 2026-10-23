/**
 * 모달 안 서비스 상태 자리(slot) 등록소.
 *
 * 전역 서비스 상태 배너(app/service-state/ServiceDegradedBanner)는 몰입 화면에서 화면 아래에
 * 떠서 z-90으로 모달(z-80)보다 위에 놓인다(확인 계층 — 알림을 숨기지 않는다). 그런데 거의 전체
 * 화면을 쓰는 모달(3D 데생 인형 등)에서는 그 배너가 모달의 뷰포트 아래쪽·검색창을 가렸다.
 * 모달이 머리글처럼 비어 있는 자리에 slot을 등록하면 배너는 떠 있지 않고 그 자리에 한 줄
 * 칩으로 들어간다. 알림은 계속 보이고, 모달 조작은 가리지 않는다.
 *
 * 여러 모달이 겹치면 가장 나중에 등록한(위에 열린) slot을 쓴다. React 밖 저장소라
 * useSyncExternalStore로 구독한다. app·domains 양쪽이 쓰므로 shared에 둔다.
 */

import { useSyncExternalStore } from "react";

const slots: HTMLElement[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** slot 요소를 등록하고, 해제 함수를 돌려준다. */
export function registerModalStatusSlot(element: HTMLElement): () => void {
  slots.push(element);
  emit();
  return () => {
    const index = slots.lastIndexOf(element);
    if (index < 0) return;
    slots.splice(index, 1);
    emit();
  };
}

/** 지금 배너가 들어갈 slot(가장 위 모달의 것). 없으면 null. */
export function getActiveModalStatusSlot(): HTMLElement | null {
  return slots.length > 0 ? slots[slots.length - 1] ?? null : null;
}

export function subscribeModalStatusSlot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): HTMLElement | null {
  return null;
}

/** 배너 쪽 구독 훅. slot이 생기거나 사라지면 다시 그린다. */
export function useModalStatusSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribeModalStatusSlot, getActiveModalStatusSlot, getServerSnapshot);
}
