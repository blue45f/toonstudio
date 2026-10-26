import { defineAppRoutes } from "../app-route-definition";

import { withRouteBreadcrumb } from "@/app/components/breadcrumb";
import { resolveBreadcrumbTrail } from "@/app/routes/route-breadcrumb";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const CutsFeedPage = lazyRetry(
  () => import("@/domains/cuts/CutsFeedPage").then((module) => ({ default: module.CutsFeedPage })),
  "CutsFeedPage",
);
const CutsStudioPage = lazyRetry(
  () => import("@/domains/cuts/CutsStudioPage").then((module) => ({ default: module.CutsStudioPage })),
  "CutsStudioPage",
);
const CutsRewardsPage = lazyRetry(
  () => import("@/domains/cuts/CutsRewardsPage").then((module) => ({ default: module.CutsRewardsPage })),
  "CutsRewardsPage",
);

export const cutsRoutes = defineAppRoutes([
  { id: "cuts-feed", path: "/cuts", element: <CutsFeedPage /> },
  {
    id: "cuts-studio",
    path: "/cuts/studio",
    element: withRouteBreadcrumb(resolveBreadcrumbTrail("/cuts/studio"), <CutsStudioPage />),
  },
  {
    id: "cuts-rewards",
    path: "/cuts/rewards",
    element: withRouteBreadcrumb(resolveBreadcrumbTrail("/cuts/rewards"), <CutsRewardsPage />),
  },
]);
