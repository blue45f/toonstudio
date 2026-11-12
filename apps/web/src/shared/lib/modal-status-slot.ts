/**
 * 모달 안 서비스 상태 자리(slot) 등록소.
 *
 * 전역 서비스 상태 배너(app/service-state/ServiceDegradedBanner)는 몰입 화면에서 화면 아래에
 * 떠서 z-90으로 모달(z-80)보다 위에 놓인다(확인 계층 — 알림을 숨기지 않는다). 그런데 거의 전체
 * 화면을 쓰는 모달(3D 데생 인형 등)에서는 그 배너가 모달의 뷰포트 아래쪽·검색창을 가렸다.
 * 모달이 머리글처럼 비어 있는 자리에 slot을 등록하면 배너는 떠 있지 않고 그 자리에 한 줄
 * 칩으로 들어간다. 알림은 계속 보이고, 모달 조작은 가리지 않는다.
 *
 * 여러 모달이 겹치면 가장 나중에 등록한(위에 열린) slot을 쓴다. 편집기의 기본 자리는
 * 모달이 없을 때만 사용한다. React 밖 저장소라
 * useSyncExternalStore로 구독한다. app·domains 양쪽이 쓰므로 shared에 둔다.
 */

import { useSyncExternalStore } from "react";

export interface EditorStatusSlot {
  readonly kind: "editor";
  readonly element: HTMLElement;
  readonly summary: HTMLElement;
}

export type ServiceStatusSlot = { readonly kind: "modal"; readonly element: HTMLElement } | EditorStatusSlot;

const slots: ServiceStatusSlot[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** slot 요소를 등록하고, 해제 함수를 돌려준다. */
function registerSlot(slot: ServiceStatusSlot): () => void {
  slots.push(slot);
  emit();
  return () => {
    const index = slots.lastIndexOf(slot);
    if (index < 0) return;
    slots.splice(index, 1);
    emit();
  };
}

export function registerModalStatusSlot(element: HTMLElement): () => void {
  return registerSlot({ kind: "modal", element });
}

/** 저장·연결 상태 버튼과 상세 패널이 알림을 받을 기본 자리. 모달이 항상 우선한다. */
export function registerEditorStatusSlot(element: HTMLElement, summary: HTMLElement): () => void {
  return registerSlot({ kind: "editor", element, summary });
}

export function getActiveServiceStatusSlot(): ServiceStatusSlot | null {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index];
    if (slot?.kind === "modal") return slot;
  }
  return slots[slots.length - 1] ?? null;
}

export function getActiveEditorStatusSlot(): EditorStatusSlot | null {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index];
    if (slot?.kind === "editor") return slot;
  }
  return null;
}

/** 기존 요소 소비자 계약을 유지한다. 모달이 없으면 편집기의 기본 자리다. */
export function getActiveModalStatusSlot(): HTMLElement | null {
  return getActiveServiceStatusSlot()?.element ?? null;
}

export function subscribeModalStatusSlot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): null {
  return null;
}

/** 배너 쪽 구독 훅. slot이 생기거나 사라지면 다시 그린다. */
export function useModalStatusSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribeModalStatusSlot, getActiveModalStatusSlot, getServerSnapshot);
}

export function useServiceStatusSlot(): ServiceStatusSlot | null {
  return useSyncExternalStore(subscribeModalStatusSlot, getActiveServiceStatusSlot, getServerSnapshot);
}

export function useEditorStatusSlot(): EditorStatusSlot | null {
  return useSyncExternalStore(subscribeModalStatusSlot, getActiveEditorStatusSlot, getServerSnapshot);
}
