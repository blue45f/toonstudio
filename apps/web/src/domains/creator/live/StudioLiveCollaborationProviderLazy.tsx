/**
 * 실시간 협업 공급자의 지연 진입 경계.
 *
 * 로컬·게스트 편집 세션(`workId` 또는 `participant`가 비어 있는 구간)에서는 무거운
 * 협업 런타임·CRDT 복구 상태·오류 i18n 사전을 진입 그래프에 묶지 않고 동일한 유휴
 * 컨텍스트를 제공한다. 실제 협업 세션이 한 번이라도 활성화되면 본체 공급자를 지연 로드해
 * 마운트하며, 복구·철회 래치를 유지하기 위해 활성화 상태를 래치한다.
 */
import {
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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

function shallowEqualObject(
  left: object | null | undefined,
  right: object | null | undefined,
): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right) return false;
  const leftEntries = Object.entries(left);
  const rightRecord = right as Record<string, unknown>;
  if (leftEntries.length !== Object.keys(rightRecord).length) return false;
  for (const [key, value] of leftEntries) {
    if (!Object.is(value, rightRecord[key])) return false;
  }
  return true;
}

function areLiveCollaborationContextDataEqual(
  prev: StudioLiveCollaborationContextValue | null,
  next: StudioLiveCollaborationContextValue,
): boolean {
  if (!prev) return false;
  return (
    prev.room === next.room &&
    prev.availability === next.availability &&
    prev.mode === next.mode &&
    prev.peers === next.peers &&
    prev.locks === next.locks &&
    prev.chatMessages === next.chatMessages &&
    prev.canChat === next.canChat &&
    prev.error === next.error &&
    prev.serverAvailable === next.serverAvailable &&
    prev.localFallbackAllowed === next.localFallbackAllowed &&
    prev.usingLocalFallback === next.usingLocalFallback &&
    prev.connectionRecovery === next.connectionRecovery &&
    shallowEqualObject(prev.sync, next.sync) &&
    shallowEqualObject(prev.recovery, next.recovery) &&
    shallowEqualObject(prev.offlineBranch, next.offlineBranch)
  );
}

function invokeLiveCollaborationFallback(context: StudioLiveCollaborationContextValue): void {
  const methodName = "useLocalFallback" as const;
  context[methodName]();
}

/**
 * 지연 로드된 본체 협업 공급자의 컨텍스트 값을 안정된 상위 Provider로 미러링한다.
 * children을 Suspense 바깥의 고정 트리에 유지해 지연 로드 완료 시 캔버스·Konva·OPFS
 * 하위 트리가 언마운트/재마운트되는 회귀를 원천 차단하고, 데이터 동등성 비교로
 * 인라인 콜백 재생성에 따른 불필요한 재렌더 루프를 막는다.
 */
function LiveCollaborationContextMirror({
  onContextChange,
}: {
  readonly onContextChange: (value: StudioLiveCollaborationContextValue) => void;
}) {
  const value = useContext(StudioLiveCollaborationContext);
  useLayoutEffect(() => {
    onContextChange(value);
  }, [onContextChange, value]);
  return null;
}

export function StudioLiveCollaborationProviderLazy(
  props: StudioLiveCollaborationProviderProps,
) {
  const {
    children,
    transportFactory,
    serverRequired = false,
    onRoomChange,
    onCrdtDocumentChange,
    onEditSafetyChange,
    onAuthoritativeSaveBarrierChange,
  } = props;
  const scopedWrite = useContext(StudioScopedWriteAuthorityContext);
  const shouldActivate = Boolean(
    props.workId && props.participant?.displayName && props.participant?.role,
  );
  const [activated, setActivated] = useState(shouldActivate);
  const [liveContext, setLiveContext] = useState<StudioLiveCollaborationContextValue | null>(null);
  const latestLiveContextRef = useRef<StudioLiveCollaborationContextValue | null>(null);

  const handleLiveContextChange = useCallback(
    (next: StudioLiveCollaborationContextValue) => {
      latestLiveContextRef.current = next;
      setLiveContext((prev) => (areLiveCollaborationContextDataEqual(prev, next) ? prev : next));
    },
    [],
  );

  useEffect(() => {
    if (shouldActivate && !activated) {
      setActivated(true);
    }
  }, [activated, shouldActivate]);

  const active = activated || shouldActivate;

  const idleSyncSnapshot = projectStudioLiveSyncSnapshot({
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
    if (active) return;
    onAuthoritativeSaveBarrierChange?.(null);
    onCrdtDocumentChange?.(null, null);
    onRoomChange?.(null);
  }, [active, onAuthoritativeSaveBarrierChange, onCrdtDocumentChange, onRoomChange]);

  useEffect(() => {
    if (active) return;
    onEditSafetyChange?.(idleSyncSnapshot.editsDurablyProtected);
  }, [active, onEditSafetyChange, idleSyncSnapshot.editsDurablyProtected]);

  const idleValue: StudioLiveCollaborationContextValue = {
    ...EMPTY_STUDIO_LIVE_CONTEXT,
    serverAvailable: transportFactory !== undefined,
    localFallbackAllowed: true,
    usingLocalFallback: transportFactory !== undefined && !serverRequired,
    sync: idleSyncSnapshot,
    connectionRecovery: "idle",
  };

  const baseValue = liveContext ?? idleValue;
  const providedValue: StudioLiveCollaborationContextValue = liveContext
    ? {
        ...baseValue,
        sendChatMessage: (text) => (latestLiveContextRef.current ?? baseValue).sendChatMessage(text),
        resolveOfflineConflict: (input) =>
          (latestLiveContextRef.current ?? baseValue).resolveOfflineConflict(input),
        exportRecovery: () => (latestLiveContextRef.current ?? baseValue).exportRecovery(),
        reloadAuthoritative: () =>
          (latestLiveContextRef.current ?? baseValue).reloadAuthoritative(),
        retryServer: () => (latestLiveContextRef.current ?? baseValue).retryServer(),
        useLocalFallback: () => invokeLiveCollaborationFallback(latestLiveContextRef.current ?? baseValue),
      }
    : idleValue;

  return (
    <StudioLiveCollaborationContext.Provider value={providedValue}>
      {active ? (
        <Suspense fallback={null}>
          <LazyStudioLiveCollaborationProvider {...props}>
            <LiveCollaborationContextMirror onContextChange={handleLiveContextChange} />
          </LazyStudioLiveCollaborationProvider>
        </Suspense>
      ) : null}
      {children}
    </StudioLiveCollaborationContext.Provider>
  );
}
