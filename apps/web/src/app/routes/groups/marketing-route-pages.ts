// 마케팅 라우트 그룹의 lazy 페이지 선언. marketing.routes.tsx 가 route-group 줄 수 상한
// (studio-host-architecture-ratchet)을 넘지 않도록 선언만 이 파일로 분리했다. 경로·id·element 는 그대로 routes 파일이 소유한다.
import { lazyRetry } from "@/shared/lib/lazy-retry";

export const WorkspaceHomeRoute = lazyRetry(
  () => import("@/domains/creator/workspace/WorkspaceHomeRoute").then((module) => ({
    default: module.WorkspaceHomeRoute,
  })),
  "WorkspaceHomeRoute",
);

export const ComicIntroHost = lazyRetry(
  () => import("@/domains/marketing/comic-intro/ComicIntroHost").then((module) => ({
    default: module.ComicIntroHost,
  })),
  "ComicIntroHost",
);

export const ProductTourPage = lazyRetry(
  () => import("@/domains/marketing/ProductTourPage").then((module) => ({
    default: module.ProductTourPage,
  })),
  "ProductTourPage",
);

export const BrandFilmPage = lazyRetry(
  () => import("@/domains/marketing/BrandFilmPage").then((module) => ({
    default: module.BrandFilmPage,
  })),
  "BrandFilmPage",
);

export const PromoVideoLibraryPage = lazyRetry(
  () => import("@/domains/marketing/PromoVideoLibraryPage").then((module) => ({
    default: module.PromoVideoLibraryPage,
  })),
  "PromoVideoLibraryPage",
);

export const MembershipPolicyPage = lazyRetry(
  () => import("@/domains/marketing/MembershipPolicyPage").then((module) => ({
    default: module.MembershipPolicyPage,
  })),
  "MembershipPolicyPage",
);

export const PricingPage = lazyRetry(
  () => import("@/app/routes/pricing-page").then((module) => ({
    default: module.PricingPage,
  })),
  "PricingPage",
);

export const FeaturesOverviewPage = lazyRetry(
  () => import("@/domains/marketing/FeaturesOverviewPage").then((module) => ({
    default: module.FeaturesOverviewPage,
  })),
  "FeaturesOverviewPage",
);

export const EventsHubPage = lazyRetry(
  () => import("@/domains/marketing/events/EventsHubPage").then((module) => ({
    default: module.EventsHubPage,
  })),
  "EventsHubPage",
);

export const BetaOpenEventPage = lazyRetry(
  () => import("@/domains/marketing/events/BetaOpenEventPage").then((module) => ({
    default: module.BetaOpenEventPage,
  })),
  "BetaOpenEventPage",
);

export const StudioWorkspacePage = lazyRetry(
  () => import("@/domains/creator/workspace/StudioWorkspacePage").then((module) => ({ default: module.StudioWorkspacePage })),
  "StudioWorkspacePage",
);

export const StudioIntroductionPage = lazyRetry(
  () => import("@/domains/marketing/CreatorHomeExperience").then((module) => ({ default: module.CreatorHomeExperience })),
  "StudioIntroductionPage",
);

export const IrPitchPage = lazyRetry(
  () => import("@/domains/marketing/IrPitchPage").then((module) => ({
    default: module.IrPitchPage,
  })),
  "IrPitchPage",
);

export const IrPresentPage = lazyRetry(
  () => import("@/domains/marketing/IrPresentPage").then((module) => ({
    default: module.IrPresentPage,
  })),
  "IrPresentPage",
);
