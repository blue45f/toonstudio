/**
 * 스튜디오 검색 줄에 붙는 AI 보조 진입점의 **입구**.
 *
 * 이 모듈은 스튜디오 진입 번들에 실리므로 아주 가볍게 유지한다: 메뉴·대화상자·사전을 담은 `AiAssistMenu`만
 * 지연 로드한다. 키가 없어도 ToonStudio AI(관리형 경로)로 바로 쓸 수 있으므로 모든 사용자에게 보인다.
 * 어느 경로로 실행하는지(내 키·ToonStudio AI)는 각 대화상자의 실행 전 확인이 알린다.
 */
import { Suspense, lazy } from "react";

const AiAssistMenu = lazy(() =>
  import("./AiAssistMenu").then((module) => ({ default: module.AiAssistMenu })),
);

export function AiAssistLauncher() {
  return (
    <Suspense fallback={null}>
      <AiAssistMenu />
    </Suspense>
  );
}
