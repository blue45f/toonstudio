import { useMemo } from "react";

import { useUserAi } from "../user-ai-store";

import { resolveClaudeRoute, summarizeClaudeRoute, type ClaudeRouteSummary } from "./claude-route";

/**
 * 사용 가능한 Claude 연결이 있는지 구독한다. 화면에는 키가 없는 요약만 돌려주고, 실제 호출은
 * 클릭 시점에 `resolveClaudeRoute()`로 최신 경로(키·리비전 포함)를 다시 읽는다 — 오래된 키를
 * React 상태에 붙들어 두지 않기 위해서다.
 */
export function useClaudeRoute(): ClaudeRouteSummary | null {
  const snapshot = useUserAi();
  // 연결 설정이 바뀌면(스냅샷이 새로 만들어지면) 다시 계산한다.
  return useMemo(() => {
    const route = resolveClaudeRoute(snapshot);
    return route ? summarizeClaudeRoute(route) : null;
  }, [snapshot]);
}
