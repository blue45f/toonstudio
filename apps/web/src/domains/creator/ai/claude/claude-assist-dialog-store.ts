/**
 * Claude 보조 대화상자의 열림 상태 — 진입점(AI 허브·검색 줄 메뉴)과 대화상자를 그리는 호스트를 떼어 놓는 아주 작은 저장소.
 *
 * AI 허브는 도구 팝오버 안에 있어서, 팝오버가 닫히면(바깥을 누르거나 명령 실행으로 도구가 바뀔 때) 허브와 함께 사라진다.
 * 대화상자의 상태를 허브가 쥐고 있으면 대화상자 안을 처음 누르는 순간 대화상자도 같이 사라진다(스튜디오 호스트의 "바깥 클릭이면
 * 메뉴 닫기" 규칙이 본문 포털의 대화상자를 바깥으로 보기 때문이다). 그래서 상태는 여기에 두고, 대화상자는 스튜디오가 늘 마운트해 두는
 * `ClaudeAssistDialogHostEntry`가 그린다. 스튜디오 진입 번들에 실리므로 React 외에는 아무것도 import하지 않는다.
 */
import { useSyncExternalStore } from "react";

export type ClaudeAssistFeatureId = "art-director" | "command-helper" | "localize" | "alt-text";

let openFeature: ClaudeAssistFeatureId | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 한 번에 한 기능의 대화상자만 연다. 이미 같은 기능이 열려 있으면 그대로 둔다. */
export function openClaudeAssistFeature(id: ClaudeAssistFeatureId): void {
  if (openFeature === id) return;
  openFeature = id;
  emit();
}

export function closeClaudeAssistFeature(): void {
  if (openFeature === null) return;
  openFeature = null;
  emit();
}

export const getOpenClaudeAssistFeature = (): ClaudeAssistFeatureId | null => openFeature;

export function subscribeClaudeAssistDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOpenClaudeAssistFeature(): ClaudeAssistFeatureId | null {
  return useSyncExternalStore(subscribeClaudeAssistDialog, getOpenClaudeAssistFeature, getOpenClaudeAssistFeature);
}
