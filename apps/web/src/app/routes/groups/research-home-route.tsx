import { refineMaterialSentenceWithFreeAi } from "./research-material-refine";

import { CreatorHubPage as ResearchDeskPage } from "@/domains/creator-resources/CreatorHubPage";

/**
 * `/research` 라우트 래퍼. 문장 허브의 선택 기능("AI로 다듬기")을 앱 계층에서 주입한다.
 * creator-resources 도메인이 creator 도메인을 직접 가져오지 않게 하려는 경계이며, 주입된 함수는 사용자가
 * 버튼을 눌렀을 때만 호출된다(research-material-refine.ts).
 */
export function ResearchHomeRoute() {
  return <ResearchDeskPage refineMaterialSentence={refineMaterialSentenceWithFreeAi} />;
}
