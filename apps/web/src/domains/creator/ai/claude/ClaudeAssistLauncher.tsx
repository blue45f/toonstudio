/**
 * 스튜디오 검색 줄에 붙는 Claude 보조 진입점의 **입구**.
 *
 * 이 모듈은 스튜디오 진입 번들에 실리므로 아주 가볍게 유지한다: Claude 연결이 있는지만 구독하고, 있을 때만
 * 메뉴·대화상자·사전을 담은 `ClaudeAssistMenu`를 지연 로드한다. 연결이 없으면 아무것도 그리지 않는다 —
 * 쓰지 않는 사용자에게 자리를 쓰지 않는다. 연결 안내는 AI 어시스트 허브의 Claude 보조 구역과 설정 화면이 맡는다.
 */
import { Suspense, lazy } from "react";

import { useClaudeRoute } from "@/shared/ai/claude/use-claude-route";

const ClaudeAssistMenu = lazy(() =>
  import("./ClaudeAssistMenu").then((module) => ({ default: module.ClaudeAssistMenu })),
);

export function ClaudeAssistLauncher() {
  const route = useClaudeRoute();
  if (!route) return null;
  return (
    <Suspense fallback={null}>
      <ClaudeAssistMenu />
    </Suspense>
  );
}
