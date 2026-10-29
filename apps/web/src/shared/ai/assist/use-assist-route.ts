import { useMemo } from "react";

import { useUserAi } from "../user-ai-store";

import { resolveAssistRoute, summarizeAssistRoute, type AssistRouteSummary } from "./assist-route";

/**
 * 보조 기능이 지금 쓸 경로를 구독한다. 등록한 Claude 키가 있으면 그 키, 없으면 ToonStudio AI 관리형 경로다.
 * 화면에는 키가 없는 요약만 돌려주고, 실제 호출은 클릭 시점에 `resolveAssistRoute()`로 최신 경로(키·리비전 포함)를
 * 다시 읽는다 — 오래된 키를 React 상태에 붙들어 두지 않기 위해서다.
 */
export function useAssistRoute(): AssistRouteSummary {
  const snapshot = useUserAi();
  // 연결 설정이 바뀌면(스냅샷이 새로 만들어지면) 다시 계산한다.
  return useMemo(() => summarizeAssistRoute(resolveAssistRoute(snapshot)), [snapshot]);
}

/** 키 없이 ToonStudio 서버가 처리하는 관리형 경로인지. 비용·예산 표시는 이 경로에서 "무료"로 바뀐다. */
export function useManagedAssist(): boolean {
  return useAssistRoute().managed === true;
}
