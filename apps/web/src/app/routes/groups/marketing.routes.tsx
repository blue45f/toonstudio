import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const WorkspaceHomeRoute = lazyRetry(
  () => import("@/domains/creator/workspace/WorkspaceHomeRoute").then((module) => ({
    default: module.WorkspaceHomeRoute,
  })),
  "WorkspaceHomeRoute",
);

const ComicIntroHost = lazyRetry(
  () => import("@/domains/marketing/comic-intro/ComicIntroHost").then((module) => ({
    default: module.ComicIntroHost,
  })),
  "ComicIntroHost",
);

const ProductTourPage = lazyRetry(
  () => import("@/domains/marketing/ProductTourPage").then((module) => ({
    default: module.ProductTourPage,
  })),
  "ProductTourPage",
);

const BrandFilmPage = lazyRetry(
  () => import("@/domains/marketing/BrandFilmPage").then((module) => ({
    default: module.BrandFilmPage,
  })),
  "BrandFilmPage",
);

const PromoVideoLibraryPage = lazyRetry(
  () => import("@/domains/marketing/PromoVideoLibraryPage").then((module) => ({
    default: module.PromoVideoLibraryPage,
  })),
  "PromoVideoLibraryPage",
);

const MembershipPolicyPage = lazyRetry(
  () => import("@/domains/marketing/MembershipPolicyPage").then((module) => ({
    default: module.MembershipPolicyPage,
  })),
  "MembershipPolicyPage",
);

const PricingPage = lazyRetry(
  () => import("@/app/routes/pricing-page").then((module) => ({
    default: module.PricingPage,
  })),
  "PricingPage",
);

const FeaturesOverviewPage = lazyRetry(
  () => import("@/domains/marketing/FeaturesOverviewPage").then((module) => ({
    default: module.FeaturesOverviewPage,
  })),
  "FeaturesOverviewPage",
);

const EventsHubPage = lazyRetry(
  () => import("@/domains/marketing/events/EventsHubPage").then((module) => ({
    default: module.EventsHubPage,
  })),
  "EventsHubPage",
);

const BetaOpenEventPage = lazyRetry(
  () => import("@/domains/marketing/events/BetaOpenEventPage").then((module) => ({
    default: module.BetaOpenEventPage,
  })),
  "BetaOpenEventPage",
);

const StudioWorkspacePage = lazyRetry(
  () => import("@/domains/creator/workspace/StudioWorkspacePage").then((module) => ({ default: module.StudioWorkspacePage })),
  "StudioWorkspacePage",
);

const StudioIntroductionPage = lazyRetry(
  () => import("@/domains/marketing/CreatorHomeExperience").then((module) => ({ default: module.CreatorHomeExperience })),
  "StudioIntroductionPage",
);

const IrPitchPage = lazyRetry(
  () => import("@/domains/marketing/IrPitchPage").then((module) => ({
    default: module.IrPitchPage,
  })),
  "IrPitchPage",
);

const IrPresentPage = lazyRetry(
  () => import("@/domains/marketing/IrPresentPage").then((module) => ({
    default: module.IrPresentPage,
  })),
  "IrPresentPage",
);

export const marketingRoutes = defineAppRoutes([
  { id: "marketing-studio-introduction", path: "/about/studio", element: <StudioIntroductionPage /> },
  // O-01 명문화 (2026-10-08 실측): 아래 세 주소는 같은 StudioWorkspacePage를 쓰지만
  // surface마다 본문이 실질적으로 다른 별도 목적지라 리다이렉트로 합치지 않는다.
  // - /home (기본 surface): 개인 창작 홈 — 이어서 작업·최근 작업·개인 스튜디오·복귀 안내.
  // - /team (surface="team"): 협업 홈 — 멤버·권한/모집·의뢰/대화 탭의 팀 개요.
  //   /team/people(사람·권한 관리)과 접두사만 공유할 뿐 다른 표면이다.
  // - /hub (surface="hub"): 둘러보기 — 작품·소재·사람·배움 발견 전용(작품 확인 게이트 없음).
  // 합치면 두 표면의 본문이 사라지므로, 혼선 방지는 이 역할 구분과 페이지 안 표기로 한다.
  { id: "workspace-home", path: "/home", element: <WorkspaceHomeRoute><ComicIntroHost /><StudioWorkspacePage /></WorkspaceHomeRoute> },
  { id: "workspace-team", path: "/team", element: <WorkspaceHomeRoute><StudioWorkspacePage surface="team" /></WorkspaceHomeRoute> },
  { id: "workspace-hub", path: "/hub", element: <WorkspaceHomeRoute><StudioWorkspacePage surface="hub" /></WorkspaceHomeRoute> },
  { id: "marketing-product-tour", path: "/product-tour", element: <ProductTourPage /> },
  // IR 피치 전용 페이지: 핵심 메시지·제품 역량·시장·BM·검증 로드맵·Ask를 발표 흐름 한 페이지로.
  // 본문 영상은 제품 투어 챕터를 발췌한 IR 컷(/brand/toonstudio-ir-tour.mp4)이며 전체 투어는 /product-tour가 소유한다.
  { id: "marketing-ir", path: "/ir", element: <IrPitchPage /> },
  // IR 발표 플레이어: 24씬 풀스크린 슬라이드 + 씬별 내레이션·배경음. /ir 본문의 발표 모드(10씬 요약)와 달리
  // 발표 전용 전체판이라 별도 경로로 두고, 진입은 /ir 페이지가 소유한다.
  { id: "marketing-ir-present", path: "/ir/present", element: <IrPresentPage /> },
  { id: "marketing-membership", path: "/membership", element: <MembershipPolicyPage /> },
  // 내비게이션 팀이 헤더/푸터에서 연결할 공개 요금제 안내. 상세 한도는 /membership이 소유한다.
  { id: "marketing-pricing", path: "/pricing", element: <PricingPage /> },
  { id: "marketing-features-overview", path: "/features", element: <FeaturesOverviewPage /> },
  { id: "marketing-brand-film", path: "/brand-film", element: <BrandFilmPage /> },
  // 홍보 영상 자료실: 만든 홍보 영상 202편을 카테고리별로 모아 미리 보고 원본을 내려받는 보관함.
  // 개별 영상의 배선처는 각 표면이 소유하고, 이 페이지는 소재를 꺼내 쓰는 입구만 소유한다.
  { id: "marketing-promo-library", path: "/promo-library", element: <PromoVideoLibraryPage /> },
  { id: "marketing-events", path: "/events", element: <EventsHubPage /> },
  { id: "marketing-event-beta-open", path: "/events/beta-open", element: <BetaOpenEventPage /> },
]);
