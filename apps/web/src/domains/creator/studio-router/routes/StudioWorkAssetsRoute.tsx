import { Suspense } from "react";

import { StudioRouteLoading } from "../../StudioLazySurfaceFallback";

import type { StudioWorkAssetsRouteResolution } from "../studio-route-manifest";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const StudioWorkAssetsPage = lazyRetry(
  () => import("../../studio-shell/StudioWorkAssetsPage").then((module) => ({
    default: module.StudioWorkAssetsPage,
  })),
  "StudioWorkAssetsPage",
);

/** Keep page loading concerns outside the router's canonicalization and dispatch seam. */
export function StudioWorkAssetsRoute({
  resolution,
}: {
  readonly resolution: StudioWorkAssetsRouteResolution;
}) {
  return (
    <Suspense fallback={<StudioRouteLoading label="작품 에셋을 여는 중..." />}>
      <StudioWorkAssetsPage
        editorHref={resolution.editorHref}
        remixSourceWorkId={resolution.remixSourceWorkId}
        workId={resolution.workId}
      />
    </Suspense>
  );
}
