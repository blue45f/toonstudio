import type { ProductTourLink, ProductTourVisual } from "./product-tour-content";

/**
 * 제품 투어 제작 이후 더해진 핵심 기능. 영상에는 나오지 않으므로 화면에 '영상에 없음'으로 표기하고,
 * 이미지가 실제 화면 캡처인지 개념 이미지인지 visual로 구분한다.
 * 가상 스튜디오는 2026-10-21 투어 개정으로 챕터가 됐으므로 이 목록에서 뺐다 —
 * 챕터와 이 목록에 같은 기능을 두 번 싣지 않는다.
 * 모든 href는 등록된 라우트여야 한다(marketing-destinations.test).
 */
export interface ProductTourAddition {
  readonly id: "production-board";
  readonly href: string;
  readonly image: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly visual: ProductTourVisual;
  readonly ko: { readonly title: string; readonly body: string; readonly action: string };
  readonly en: { readonly title: string; readonly body: string; readonly action: string };
  readonly secondary: ProductTourLink;
}

export const PRODUCT_TOUR_ADDITIONS: readonly ProductTourAddition[] = [
  {
    id: "production-board",
    // 07장은 제작 관리 홈(/production)을 보여 준다. 공정 보드는 그 뒤에 더해진 샘플 프로젝트 화면이다.
    href: "/production/projects/sample-project/production",
    image: "/brand/workflow-20260928/collaborate-960.webp",
    imageWidth: 960,
    imageHeight: 600,
    visual: "concept",
    ko: {
      title: "팀 공정 보드",
      body: "공정 단계별 보드에서 회차 작업 카드와 담당자·마감·검토 상태를 한눈에 확인합니다.",
      action: "샘플 공정 보드 열기",
    },
    en: {
      title: "Team production board",
      body: "See episode task cards with owners, deadlines and review status on a board organised by production stage.",
      action: "Open the sample board",
    },
    secondary: { href: "/production", ko: "제작 관리 홈", en: "Production home" },
  },
];
