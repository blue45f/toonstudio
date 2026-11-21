/**
 * 실시간 협업 공급자의 지연 진입 경계.
 *
 * workId와 참여자 정보가 준비되면 본체를 지연 로드한다. 익명 원고도 instantWorkId와
 * 참여자가 있으므로 이 경계를 통과한다. 편집기 children은 안정적인 바깥 컨텍스트에
 * 남기고 런타임만 별도 형제로 마운트해 캔버스 DOM·입력 리스너를 교체하지 않는다.
 * 한 번 활성화한 런타임 인스턴스는 유지하여 기존 복구·철회 래치를 보존한다.
 */
import { memo, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ContextType } from "react";

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

type RuntimeProps = Omit<StudioLiveCollaborationProviderProps, "children">;

interface RuntimeScope {
  readonly workId: string | null;
  readonly outboxScope: string | null;
  readonly participantName: string | null;
  readonly participantRole: NonNullable<RuntimeProps["participant"]>["role"] | null;
  readonly transportFactory: RuntimeProps["transportFactory"];
  readonly serverRequired: boolean;
  readonly ephemeralOnly: boolean;
  readonly scopedWrite: ContextType<typeof StudioScopedWriteAuthorityContext>;
}

interface RuntimeSnapshot {
  readonly scope: RuntimeScope;
  readonly value: StudioLiveCollaborationContextValue;
}

type PublishRuntimeSnapshot = (snapshot: RuntimeSnapshot) => void;

function IdleStudioLiveNotifications({
  value,
  onRoomChange,
  onCrdtDocumentChange,
  onEditSafetyChange,
  onAuthoritativeSaveBarrierChange,
}: RuntimeProps & { readonly value: StudioLiveCollaborationContextValue }) {
  useEffect(() => {
    onAuthoritativeSaveBarrierChange?.(null);
    onCrdtDocumentChange?.(null, null);
    onRoomChange?.(null);
  }, [onAuthoritativeSaveBarrierChange, onCrdtDocumentChange, onRoomChange]);

  useEffect(() => {
    onEditSafetyChange?.(value.sync.editsDurablyProtected);
  }, [onEditSafetyChange, value.sync.editsDurablyProtected]);
  return null;
}

function RuntimeContextRelay({ scope, publish }: {
  readonly scope: RuntimeScope;
  readonly publish: PublishRuntimeSnapshot;
}) {
  const value = useContext(StudioLiveCollaborationContext);
  const [settledScope, setSettledScope] = useState(scope);
  // 본체도 passive effect에서 이전 room·outbox 세대를 초기화한다. 새 소유자의 첫 render에
  // 남은 이전 context를 재태깅하지 않고 그 초기화와 함께 처리된 다음 commit부터 전달한다.
  useEffect(() => { setSettledScope(scope); }, [scope]);
  useLayoutEffect(() => {
    if (settledScope === scope) publish({ scope, value });
  }, [publish, scope, settledScope, value]);
  return null;
}

const StudioLiveRuntime = memo(function StudioLiveRuntime({
  scope, publish, idleValue, ...props
}: RuntimeProps & {
  readonly scope: RuntimeScope;
  readonly publish: PublishRuntimeSnapshot;
  readonly idleValue: StudioLiveCollaborationContextValue;
}) {
  return (
    <Suspense fallback={<IdleStudioLiveNotifications {...props} value={idleValue} />}>
      <LazyStudioLiveCollaborationProvider {...props}>
        <RuntimeContextRelay scope={scope} publish={publish} />
      </LazyStudioLiveCollaborationProvider>
    </Suspense>
  );
});

export function StudioLiveCollaborationProviderLazy({
  children, ...props
}: StudioLiveCollaborationProviderProps) {
  const scopedWrite = useContext(StudioScopedWriteAuthorityContext);
  const scope = useMemo<RuntimeScope>(() => ({
    workId: props.workId,
    outboxScope: props.outboxScope ?? null,
    participantName: props.participant?.displayName ?? null,
    participantRole: props.participant?.role ?? null,
    transportFactory: props.transportFactory,
    serverRequired: props.serverRequired === true,
    ephemeralOnly: props.ephemeralOnly === true,
    scopedWrite,
  }), [props.workId, props.outboxScope, props.participant?.displayName, props.participant?.role,
    props.transportFactory, props.serverRequired, props.ephemeralOnly, scopedWrite]);
  const scopedWriteActive = Boolean(scopedWrite?.snapshot?.scopedWrite);
  const idleValue = useMemo<StudioLiveCollaborationContextValue>(() => ({
    ...EMPTY_STUDIO_LIVE_CONTEXT,
    serverAvailable: props.transportFactory !== undefined,
    localFallbackAllowed: true,
    usingLocalFallback: props.transportFactory !== undefined && !props.serverRequired,
    sync: projectStudioLiveSyncSnapshot({
      availability: "idle", mode: null, canEdit: false, scopedWrite: scopedWriteActive,
      telemetry: null, operationSyncReady: false, terminalTransportState: null,
      transportMessage: null,
    }),
    connectionRecovery: "idle",
  }), [props.transportFactory, props.serverRequired, scopedWriteActive]);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const publish = useCallback<PublishRuntimeSnapshot>((next) => {
    setSnapshot((current) => current?.scope === next.scope && current.value === next.value ? current : next);
  }, []);
  const shouldActivate = Boolean(
    props.workId && props.participant?.displayName && props.participant?.role,
  );
  const [activated, setActivated] = useState(shouldActivate);

  useEffect(() => {
    if (shouldActivate && !activated) {
      setActivated(true);
    }
  }, [activated, shouldActivate]);

  // runtime의 props에서 editor children을 제외한다. context 전달로 바깥이 렌더되어도
  // memo 형제는 다시 실행되지 않아 매 render 새 value를 만드는 본체와 피드백 루프가 없다.
  return (
    <StudioLiveCollaborationContext.Provider value={snapshot?.scope === scope ? snapshot.value : idleValue}>
      {children}
      {activated || shouldActivate ? (
        <StudioLiveRuntime {...props} scope={scope} publish={publish} idleValue={idleValue} />
      ) : <IdleStudioLiveNotifications {...props} value={idleValue} />}
    </StudioLiveCollaborationContext.Provider>
  );
}
