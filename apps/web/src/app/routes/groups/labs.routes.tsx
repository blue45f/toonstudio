import { studioRoutePath } from "@/domains/creator/studio-route-registry";
import { defineAppRoutes } from "../app-route-definition";
import { AnchorLabPage, BranchingCuttoonLabPage } from "./creator-route-pages";

/**
 * Labs·experimental 독립 화면의 경로. 주 내비게이션과 색인에서 빼 둔 실험 화면이라 창작 묶음과 따로 둔다.
 * 배열 순서가 매칭 우선순위를 정하므로 app-routes.tsx 에서 `/studio/*` 와일드카드를 가진 creatorRoutes 보다 앞에 합친다.
 * id 는 공간 캠퍼스 바인딩(shared/lib/spatial-campus/campus-bindings.ts)이 참조하는 안정 식별자라 그대로 둔다.
 */
export const labsRoutes = defineAppRoutes([
  // 캐릭터 앵커 연구실: 정/반측 턴테이블 앵커 세트와 후보 이미지의 휴리스틱 참고 점수. 편집기 호스트에 연결하지 않는다.
  { id: "creator-studio-anchor-lab", path: studioRoutePath("anchor-lab"), element: <AnchorLabPage /> },

  // 분기형 컷툰 실험. 설명은 docs/features/branching-cuttoon.md.
  { id: "creator-studio-branching-cuttoon", path: "/studio/branching-cuttoon", element: <BranchingCuttoonLabPage /> },
]);
