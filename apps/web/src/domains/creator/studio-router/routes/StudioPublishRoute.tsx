import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";

import { StudioRouteLoading } from "../../StudioLazySurfaceFallback";
import { StudioDocumentRuntimeBoundary } from "../StudioDocumentRuntimeBoundary";
import { useStudioDraftScope } from "../useStudioDraftScope";

import type { StudioPublishRouteResolution } from "../studio-route-manifest";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useT } from "@/shared/lib/i18n";
import { useSession } from "@/domains/auth/public/session/auth-session-store";

const StudioPublishingCommandCenter = lazyRetry(
  () => import("../../StudioPublishingCommandCenter").then((module) => ({
    default: module.StudioPublishingCommandCenter,
  })),
  "StudioPublishingCommandCenterRoute",
);

const PublishScheduleSeriesSection = lazyRetry(
  () => import("../../publish/PublishScheduleSeriesSection").then((module) => ({
    default: module.PublishScheduleSeriesSection,
  })),
  "PublishScheduleSeriesSectionRoute",
);

export function StudioPublishRoute({ resolution }: {
  readonly resolution: StudioPublishRouteResolution;
}) {
  const t = useT();
  const { data: session } = useSession();
  const [searchParams] = useSearchParams();
  const seriesId = searchParams.get("seriesId");
  const authScopeKey = session?.user?.id ?? null;
  const routeKey = resolution.workId === null
    ? "publish:new"
    : `publish:${resolution.workId}`;
  const draftScope = useStudioDraftScope(routeKey, authScopeKey);
  const publishKey = JSON.stringify([
    "publish-command-center",
    resolution.workId ?? "new",
    draftScope.epoch,
  ]);

  return (
    <StudioDocumentRuntimeBoundary documentKey={publishKey}>
      <Suspense fallback={<StudioRouteLoading label={t("studio.canvas.shell.loadingPublishCenter", "게시 명령 센터를 안전하게 여는 중...")} />}>
        <StudioPublishingCommandCenter workId={resolution.workId} />
      </Suspense>
      {seriesId ? (
        <Suspense fallback={null}>
          <PublishScheduleSeriesSection seriesId={seriesId} />
        </Suspense>
      ) : null}
    </StudioDocumentRuntimeBoundary>
  );
}
