/**
 * 실시간 협업 공급자의 지연 진입 경계.
 *
 * 로컬·게스트 편집 세션(`workId` 또는 `participant`가 비어 있는 구간)에서는 무거운
 * 협업 런타임·CRDT 복구 상태·오류 i18n 사전을 진입 그래프에 묶지 않고 동일한 유휴
 * 컨텍스트를 제공한다. 실제 협업 세션이 한 번이라도 활성화되면 본체 공급자를 지연 로드해
 * 마운트하며, 복구·철회 래치를 유지하기 위해 활성화 상태를 래치한다.
 */
import { Suspense, useContext, useEffect, useState } from "react";

import { lazyRetry } from "@/shared/lib/lazy-retry";

import { StudioScopedWriteAuthorityContext } from "../studio-collab/studio-scoped-write-context";
import {
  EMPTY_STUDIO_LIVE_CONTEXT,
  StudioLiveCollaborationContext,
  type StudioLiveCollaborationContextValue,
} from "./studio-live-collaboration-context";
import { projectStudioLiveSyncSnapshot } from "./studio-live-sync-safety";

import type { StudioLiveCollaborationProviderProps } from "./StudioLiveCollaborationProvider";

const LazyStudioLiveCollaborationProvider = lazyRetry(
  () =>
    import("./StudioLiveCollaborationProvider").then((mod) => ({
      default: mod.StudioLiveCollaborationProvider,
    })),
  "StudioLiveCollaborationProvider",
);

function IdleStudioLiveCollaborationProvider({
  children,
  transportFactory,
  serverRequired = false,
  onRoomChange,
  onCrdtDocumentChange,
  onEditSafetyChange,
  onAuthoritativeSaveBarrierChange,
}: StudioLiveCollaborationProviderProps) {
  const scopedWrite = useContext(StudioScopedWriteAuthorityContext);
  const syncSnapshot = projectStudioLiveSyncSnapshot({
    availability: "idle",
    mode: null,
    canEdit: false,
    scopedWrite: Boolean(scopedWrite?.snapshot?.scopedWrite),
    telemetry: null,
    operationSyncReady: false,
    terminalTransportState: null,
    transportMessage: null,
  });

  useEffect(() => {
    onAuthoritativeSaveBarrierChange?.(null);
    onCrdtDocumentChange?.(null, null);
    onRoomChange?.(null);
  }, [onAuthoritativeSaveBarrierChange, onCrdtDocumentChange, onRoomChange]);

  useEffect(() => {
    onEditSafetyChange?.(syncSnapshot.editsDurablyProtected);
  }, [onEditSafetyChange, syncSnapshot.editsDurablyProtected]);

  const value: StudioLiveCollaborationContextValue = {
    ...EMPTY_STUDIO_LIVE_CONTEXT,
    serverAvailable: transportFactory !== undefined,
    localFallbackAllowed: true,
    usingLocalFallback: transportFactory !== undefined && !serverRequired,
    sync: syncSnapshot,
    connectionRecovery: "idle",
  };

  return (
    <StudioLiveCollaborationContext.Provider value={value}>
      {children}
    </StudioLiveCollaborationContext.Provider>
  );
}

export function StudioLiveCollaborationProviderLazy(
  props: StudioLiveCollaborationProviderProps,
) {
  const shouldActivate = Boolean(
    props.workId && props.participant?.displayName && props.participant?.role,
  );
  const [activated, setActivated] = useState(shouldActivate);

  useEffect(() => {
    if (shouldActivate && !activated) {
      setActivated(true);
    }
  }, [activated, shouldActivate]);

  if (!activated && !shouldActivate) {
    return <IdleStudioLiveCollaborationProvider {...props} />;
  }

  return (
    <Suspense fallback={<IdleStudioLiveCollaborationProvider {...props} />}>
      <LazyStudioLiveCollaborationProvider {...props} />
    </Suspense>
  );
}
