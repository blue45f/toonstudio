import { defineAppRoutes } from "../app-route-definition";
import { resolveBreadcrumbTrail } from "../route-breadcrumb";

import { withRouteBreadcrumb } from "@/app/components/breadcrumb";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { PageIntro } from "@/shared/components/page-intro/PageIntro";

const MarketHomePage = lazyRetry(
  () => import("@/domains/market/pages/MarketHomePage").then((module) => ({ default: module.MarketHomePage })),
  "MarketHomePage",
);
const MarketBrowsePage = lazyRetry(
  () => import("@/domains/market/pages/MarketBrowsePage").then((module) => ({ default: module.MarketBrowsePage })),
  "MarketBrowsePage",
);
const MarketFitLabPage = lazyRetry(
  () => import("@/domains/market/pages/MarketFitLabPage").then((module) => ({ default: module.MarketFitLabPage })),
  "MarketFitLabPage",
);
const MarketResourceDetailPage = lazyRetry(
  () => import("@/domains/market/pages/MarketResourceDetailPage").then((module) => ({ default: module.MarketResourceDetailPage })),
  "MarketResourceDetailPage",
);
const MarketPublishAuthorityPage = lazyRetry(
  () => import("@/domains/market/pages/MarketPublishAuthorityPage").then((module) => ({ default: module.MarketPublishAuthorityPage })),
  "MarketPublishAuthorityPage",
);
const MarketOwnedResourcesPage = lazyRetry(
  () => import("@/domains/market/pages/MarketOwnedResourcesPage").then((module) => ({ default: module.MarketOwnedResourcesPage })),
  "MarketOwnedResourcesPage",
);
const MarketCloudLibraryPage = lazyRetry(
  () => import("@/domains/market/pages/MarketCloudLibraryPage").then((module) => ({ default: module.MarketCloudLibraryPage })),
  "MarketCloudLibraryPage",
);
const MarketWishlistPage = lazyRetry(
  () => import("@/domains/market/pages/MarketWishlistPage").then((module) => ({ default: module.MarketWishlistPage })),
  "MarketWishlistPage",
);
const MarketComparePage = lazyRetry(
  () => import("@/domains/market/pages/MarketComparePage").then((module) => ({ default: module.MarketComparePage })),
  "MarketComparePage",
);
const MarketCheckoutPage = lazyRetry(
  () => import("@/domains/market/pages/MarketCheckoutPage").then((module) => ({ default: module.MarketCheckoutPage })),
  "MarketCheckoutPage",
);
const MarketSellerPage = lazyRetry(
  () => import("@/domains/market/pages/MarketSellerPage").then((module) => ({ default: module.MarketSellerPage })),
  "MarketSellerPage",
);
const MarketCreatorStorefrontPage = lazyRetry(
  () => import("@/domains/market/pages/MarketCreatorStorefrontPage").then((module) => ({ default: module.MarketCreatorStorefrontPage })),
  "MarketCreatorStorefrontPage",
);
const MarketOrdersPage = lazyRetry(
  () => import("@/domains/market/pages/MarketOrdersPage").then((module) => ({ default: module.MarketOrdersPage })),
  "MarketOrdersPage",
);

/**
 * 판매 표면 정본 선언 (S1-5, BLUEPRINT §1.2): 정본은 /market/seller
 * (판매자 센터) 하나다. /market/publish는 센터 등록 탭의 단계형 마법사,
 * /market/manage는 센터 패키지 관리 탭으로 재정의하되, 두 URL 모두
 * 딥링크로 그대로 동작한다 — 경로·id는 삭제하거나 바꾸지 않는다.
 */
export const marketRoutes = defineAppRoutes([
  { id: "market-home", path: "/market", element: <PageIntro variant="market"><MarketHomePage /></PageIntro> },
  { id: "market-browse", path: "/market/browse", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/browse"), <MarketBrowsePage />)}</PageIntro> },
  { id: "market-fit", path: "/market/fit", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/fit"), <MarketFitLabPage />)}</PageIntro> },
  { id: "market-fit-lab", path: "/market/fit-lab", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/fit"), <MarketFitLabPage />)}</PageIntro> },
  // 판매자 센터 등록 탭 (단계형 마법사) 딥링크 — 정본은 market-seller.
  { id: "market-publish", path: "/market/publish", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/publish"), <MarketPublishAuthorityPage />)}</PageIntro> },
  // 판매자 센터 패키지 관리 탭 딥링크 — 정본은 market-seller.
  { id: "market-manage", path: "/market/manage", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/manage"), <MarketOwnedResourcesPage />)}</PageIntro> },
  // 판매자 센터 정본.
  { id: "market-seller", path: "/market/seller", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/seller"), <MarketSellerPage />)}</PageIntro> },
  { id: "market-library", path: "/market/library", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/library"), <MarketCloudLibraryPage />)}</PageIntro> },
  { id: "market-wishlist", path: "/market/wishlist", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/wishlist"), <MarketWishlistPage />)}</PageIntro> },
  { id: "market-compare", path: "/market/compare", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/compare"), <MarketComparePage />)}</PageIntro> },
  { id: "market-orders", path: "/market/orders", element: <PageIntro variant="market">{withRouteBreadcrumb(resolveBreadcrumbTrail("/market/orders"), <MarketOrdersPage />)}</PageIntro> },
  { id: "market-creator", path: "/market/creator/:publisherId", element: <PageIntro variant="market"><MarketCreatorStorefrontPage /></PageIntro> },
  { id: "market-checkout", path: "/market/checkout/:id", element: <PageIntro variant="market"><MarketCheckoutPage /></PageIntro> },
  { id: "market-resource", path: "/market/resource/:id", element: <PageIntro variant="market"><MarketResourceDetailPage /></PageIntro> },
]);
