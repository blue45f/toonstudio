import { Suspense, type ComponentProps } from "react";

import { StudioRouteLoading } from "../../StudioLazySurfaceFallback";

import { useT } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const StudioProductionHubPage = lazyRetry(
  () => import("../../studio-production/StudioProductionHubPage").then((module) => ({
    default: module.StudioProductionHubPage,
  })),
  "StudioProductionHubPage",
);

/** Keep page loading concerns outside the router's canonicalization and dispatch seam. */
export function StudioProductionRoute(props: ComponentProps<typeof StudioProductionHubPage>) {
  const t = useT();
  return (
    <Suspense fallback={<StudioRouteLoading label={t("studio.canvas.shell.loadingProductionHub", "제작 운영 허브를 여는 중...")} />}>
      <StudioProductionHubPage {...props} />
    </Suspense>
  );
}
