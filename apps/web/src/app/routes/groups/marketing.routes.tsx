import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { WorkspaceHomeRoute } from "@/domains/creator/workspace/WorkspaceHomeRoute";
import { ComicIntroHost } from "@/domains/marketing/comic-intro/ComicIntroHost";

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
  { id: "marketing-membership", path: "/membership", element: <MembershipPolicyPage /> },
  // 내비게이션 팀이 헤더/푸터에서 연결할 공개 요금제 안내. 상세 한도는 /membership이 소유한다.
  { id: "marketing-pricing", path: "/pricing", element: <PricingPage /> },
  { id: "marketing-features-overview", path: "/features", element: <FeaturesOverviewPage /> },
  { id: "marketing-brand-film", path: "/brand-film", element: <BrandFilmPage /> },
  { id: "marketing-events", path: "/events", element: <EventsHubPage /> },
  { id: "marketing-event-beta-open", path: "/events/beta-open", element: <BetaOpenEventPage /> },
]);
