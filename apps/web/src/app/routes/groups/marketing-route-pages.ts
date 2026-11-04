// 마케팅 페이지를 지연 로드한다. 경로·id·element는 marketing.routes.tsx가 소유한다.
import type { ComponentType } from "react";

import { lazyRetry } from "@/shared/lib/lazy-retry";

// 이름이 지정된 export를 한 번만 감싸되 import는 실제 페이지 진입까지 지연한다.
function lazyPage<K extends string, M extends Record<K, ComponentType>>(
  load: () => Promise<M>, name: K,
) {
  return lazyRetry(() => load().then((module) => ({ default: module[name] })), name);
}

export const WorkspaceHomeRoute = lazyRetry(
  () => import("@/domains/creator/workspace/WorkspaceHomeRoute").then((module) => ({
    default: module.WorkspaceHomeRoute,
  })),
  "WorkspaceHomeRoute",
);

export const ComicIntroHost = lazyPage(
  () => import("@/domains/marketing/comic-intro/ComicIntroHost"), "ComicIntroHost",
);

export const ProductTourPage = lazyPage(
  () => import("@/domains/marketing/ProductTourPage"), "ProductTourPage",
);

export const BrandFilmPage = lazyPage(
  () => import("@/domains/marketing/BrandFilmPage"), "BrandFilmPage",
);

export const PromoVideoLibraryPage = lazyPage(
  () => import("@/domains/marketing/PromoVideoLibraryPage"), "PromoVideoLibraryPage",
);

export const MembershipPolicyPage = lazyPage(
  () => import("@/domains/marketing/MembershipPolicyPage"), "MembershipPolicyPage",
);

export const PricingPage = lazyPage(
  () => import("@/app/routes/pricing-page"), "PricingPage",
);

export const FeaturesOverviewPage = lazyPage(
  () => import("@/domains/marketing/FeaturesOverviewPage"), "FeaturesOverviewPage",
);

export const EventsHubPage = lazyPage(
  () => import("@/domains/marketing/events/EventsHubPage"), "EventsHubPage",
);

export const BetaOpenEventPage = lazyPage(
  () => import("@/domains/marketing/events/BetaOpenEventPage"), "BetaOpenEventPage",
);

export const StudioWorkspacePage = lazyPage(
  () => import("@/domains/creator/workspace/StudioWorkspacePage"), "StudioWorkspacePage",
);

export const StudioIntroductionPage = lazyRetry(
  () => import("@/domains/marketing/CreatorHomeExperience").then((module) => ({ default: module.CreatorHomeExperience })),
  "StudioIntroductionPage",
);

export const IrPitchPage = lazyPage(
  () => import("@/domains/marketing/IrPitchPage"), "IrPitchPage",
);

export const IrPresentPage = lazyPage(
  () => import("@/domains/marketing/IrPresentPage"), "IrPresentPage",
);

export const BusinessPlanPage = lazyPage(
  () => import("@/domains/marketing/BusinessPlanPage"), "BusinessPlanPage",
);
