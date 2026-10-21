import { lazy, Suspense, useEffect, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { StudioOfflinePanelBoundary } from "../../offline/StudioOfflinePanelBoundary";
import { resolveStudioLocalDocumentSource } from "../../studio-local-document-source";
import { studioEditorInstanceKey } from "../../studio-editor-scope";
import { studioWorkspaceDocumentIdentity } from "../../studio-workspace-route";
import { StudioRouteLoading } from "../../StudioLazySurfaceFallback";
import { resolveStudioMobileTouchPlan } from "../../studio-mobile-touch-flow";
import { MobileFullEditNotice } from "../../studio-shell/MobileFullEditNotice";
import { StudioDocumentLayout } from "../StudioDocumentLayout";
import { StudioDocumentRuntimeBoundary } from "../StudioDocumentRuntimeBoundary";
import { useStudioDraftScope } from "../useStudioDraftScope";

import type { StudioEditorRouteResolution } from "../studio-route-manifest";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useT } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";

const LegacyStudioEditorAdapter = lazyRetry(
  () => import("../../studio-legacy-editor-adapter").then((module) => ({
    default: module.LegacyStudioEditorAdapter,
  })),
  "LegacyStudioEditorAdapter",
);

// Optional offline guidance must not trigger the global chunk-reload recovery.
const StudioOfflinePanel = lazy(
  () => import("../../offline/StudioOfflinePanel").then((module) => ({ default: module.StudioOfflinePanel })),
);

const StudioWorkspaceContextCoach = lazyRetry(
  () => import("../../studio-shell/StudioWorkspaceContextCoach").then((module) => ({
    default: module.StudioWorkspaceContextCoach,
  })),
  "StudioWorkspaceContextCoach",
);

export function StudioEditorRoute({ resolution }: {
  readonly resolution: StudioEditorRouteResolution;
}) {
  const t = useT();
  const { data: session } = useSession();
  const authScopeKey = session?.user?.id ?? null;
  const location = useLocation();
  const source = useMemo(() => {
    let storage: Storage | null = null;
    try {
      if (typeof window !== "undefined") storage = window.localStorage;
    } catch {
      // Keep unknown sources locked when browser storage cannot be inspected.
    }
    return resolveStudioLocalDocumentSource(resolution.workspaceRoute, storage, location.search);
  }, [location.search, resolution.workspaceRoute]);
  const route = source.route;
  const identity = studioWorkspaceDocumentIdentity(route);
  const draftScope = useStudioDraftScope(identity, authScopeKey);
  const editorKey = studioEditorInstanceKey({
    authScopeKey,
    canonicalDocumentIdentity: route.projectId && route.documentId ? identity : null,
    draftSessionEpoch: draftScope.epoch,
    remixId: route.remixSourceWorkId,
    workId: route.workId,
  });

  useEffect(() => {
    if (
      typeof window === "undefined"
      || typeof window.matchMedia !== "function"
      || window.matchMedia("(max-width: 1023px)").matches
    ) {
      return;
    }

    // Start the inspector request beside the editor chunk so the canvas remains the critical paint
    // without introducing a second waterfall for the desktop properties rail.
    void import("../../studio-inspector-aside-loader")
      .then(({ preloadStudioInspectorAside }) => preloadStudioInspectorAside())
      .catch(() => undefined);
  }, []);

  if (source.redirectHref) {
    return <Navigate replace state={location.state} to={`${source.redirectHref}${location.hash}`} />;
  }

  return (
    <StudioDocumentRuntimeBoundary documentKey={editorKey}>
      <StudioDocumentLayout
        draftSessionEpoch={draftScope.epoch}
        studioRoute={route}
      >
        {route.surface === "poser" ? (
          <Suspense fallback={null}>
            <StudioWorkspaceContextCoach surface={route.surface} />
          </Suspense>
        ) : null}
        {/*
          표면별 터치 경계는 studio-mobile-touch-flow 정본 계획을 그대로 소비한다.
          예전처럼 모든 표면에 "모바일 도크 그리기"를 약속하면, 도크가 없는 3D 배경·포저·
          DCC 표면에서 "눌렀는데 안 되는" 거짓 안내가 된다 — 되는/안 되는 목록은 표면마다 다르다.
        */}
        {(() => {
          const touchPlan = resolveStudioMobileTouchPlan(route.surface);
          return (
            <MobileFullEditNotice
              surfaceId={`studio-editor-${route.surface}`}
              surfaceLabel={touchPlan.label}
              mobileCapabilities={touchPlan.canDo}
              mobileLimitations={touchPlan.cannotDo}
              touchTier={touchPlan.tier}
            />
          );
        })()}
        <StudioOfflinePanelBoundary>
          <Suspense fallback={null}><StudioOfflinePanel /></Suspense>
        </StudioOfflinePanelBoundary>
        <Suspense fallback={<StudioRouteLoading label={t("studio.canvas.shell.loadingEditor", "Studio 편집기를 여는 중...")} />}>
          <LegacyStudioEditorAdapter
            remixId={route.remixSourceWorkId}
            studioRoute={route}
          />
        </Suspense>
      </StudioDocumentLayout>
    </StudioDocumentRuntimeBoundary>
  );
}
