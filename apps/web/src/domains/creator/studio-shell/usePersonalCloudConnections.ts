import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  PERSONAL_CLOUD_PROVIDER_IDS,
  disconnectPersonalCloud,
  listPersonalCloudConnections,
  startPersonalCloudConnection,
  type PersonalCloudConnectionStatus,
  type PersonalCloudProviderId,
} from "../save-first/personal-cloud-client";

export interface PersonalCloudConnectionsController {
  readonly connections: readonly PersonalCloudConnectionStatus[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly busyProvider: PersonalCloudProviderId | null;
  readonly statusFor: (
    provider: PersonalCloudProviderId,
  ) => PersonalCloudConnectionStatus | null;
  readonly reload: () => Promise<void>;
  readonly connect: (
    provider: PersonalCloudProviderId,
    returnTo?: string,
  ) => Promise<void>;
  readonly disconnect: (provider: PersonalCloudProviderId) => Promise<void>;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim().slice(0, 500)
    : fallback;
}

export function usePersonalCloudConnections(): PersonalCloudConnectionsController {
  const [connections, setConnections] = useState<readonly PersonalCloudConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<PersonalCloudProviderId | null>(null);

  // 마운트 수명주기 epoch와 상태별 최신 요청 일련번호를 추적해
  // unmount·StrictMode 재마운트·중첩 호출 이후 도착한 지연 응답의 오염을 막는다.
  const mountedRef = useRef(true);
  const lifecycleEpochRef = useRef(0);
  const requestSeqRef = useRef(0);
  const reloadRequestIdRef = useRef(0);
  const actionRequestIdRef = useRef(0);
  const latestErrorWriterIdRef = useRef(0);

  const isCurrentLifecycle = useCallback((epoch: number): boolean => (
    mountedRef.current && lifecycleEpochRef.current === epoch
  ), []);

  const isCurrentReload = useCallback((epoch: number, requestId: number): boolean => (
    isCurrentLifecycle(epoch) && reloadRequestIdRef.current === requestId
  ), [isCurrentLifecycle]);

  const isCurrentAction = useCallback((epoch: number, requestId: number): boolean => (
    isCurrentLifecycle(epoch) && actionRequestIdRef.current === requestId
  ), [isCurrentLifecycle]);

  const commitError = useCallback((
    epoch: number,
    writerId: number,
    nextError: string | null,
    recordedWriterId = writerId,
  ): void => {
    if (!isCurrentLifecycle(epoch)) return;
    if (writerId < latestErrorWriterIdRef.current) return;
    latestErrorWriterIdRef.current = Math.max(latestErrorWriterIdRef.current, recordedWriterId);
    setError(nextError);
  }, [isCurrentLifecycle]);

  const runReload = useCallback(async (clearErrorOriginId?: number) => {
    if (!mountedRef.current) return;
    const epoch = lifecycleEpochRef.current;
    const requestId = ++requestSeqRef.current;
    const errorClearWriterId = clearErrorOriginId ?? requestId;
    reloadRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const nextConnections = await listPersonalCloudConnections();
      if (!isCurrentReload(epoch, requestId)) return;
      setConnections(nextConnections);
      commitError(epoch, errorClearWriterId, null, requestId);
    } catch (cause) {
      if (!isCurrentReload(epoch, requestId)) return;
      commitError(
        epoch,
        requestId,
        message(cause, "개인 저장소 연결 상태를 확인하지 못했습니다."),
      );
    } finally {
      if (isCurrentReload(epoch, requestId)) {
        setLoading(false);
      }
    }
  }, [commitError, isCurrentReload]);

  const reload = useCallback(async () => {
    await runReload();
  }, [runReload]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleEpochRef.current += 1;
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
      lifecycleEpochRef.current += 1;
    };
  }, [reload]);

  const byProvider = useMemo(() => new Map(
    connections.map((entry) => [entry.provider, entry] as const),
  ), [connections]);

  const statusFor = useCallback((provider: PersonalCloudProviderId) => (
    byProvider.get(provider) ?? null
  ), [byProvider]);

  const connect = useCallback(async (
    provider: PersonalCloudProviderId,
    returnTo = "/studio?view=storage",
  ) => {
    if (!mountedRef.current) return;
    const epoch = lifecycleEpochRef.current;
    const requestId = ++requestSeqRef.current;
    actionRequestIdRef.current = requestId;
    commitError(epoch, requestId, null);
    setBusyProvider(provider);
    try {
      const started = await startPersonalCloudConnection(provider, returnTo);
      if (!isCurrentAction(epoch, requestId)) return;
      window.location.assign(started.authorizeUrl);
    } catch (cause) {
      commitError(
        epoch,
        requestId,
        message(cause, "개인 저장소 연결을 시작하지 못했습니다."),
      );
      if (isCurrentAction(epoch, requestId)) {
        setBusyProvider(null);
      }
    }
  }, [commitError, isCurrentAction]);

  const disconnect = useCallback(async (provider: PersonalCloudProviderId) => {
    if (!mountedRef.current) return;
    const epoch = lifecycleEpochRef.current;
    const requestId = ++requestSeqRef.current;
    actionRequestIdRef.current = requestId;
    commitError(epoch, requestId, null);
    setBusyProvider(provider);
    try {
      await disconnectPersonalCloud(provider);
      // 다른 provider 액션이 뒤이어 시작됐더라도 서버 해제는 완료됐으므로
      // 현재 수명주기라면 목록을 재검증하되, 더 새로운 요청의 오류·busy 상태는 보존한다.
      if (!isCurrentLifecycle(epoch)) return;
      await runReload(requestId);
    } catch (cause) {
      commitError(
        epoch,
        requestId,
        message(cause, "개인 저장소 연결을 해제하지 못했습니다."),
      );
    } finally {
      if (isCurrentAction(epoch, requestId)) {
        setBusyProvider(null);
      }
    }
  }, [commitError, isCurrentAction, isCurrentLifecycle, runReload]);

  return Object.freeze({
    connections,
    loading,
    error,
    busyProvider,
    statusFor,
    reload,
    connect,
    disconnect,
  });
}

export const PERSONAL_CLOUD_CONNECTION_PROVIDER_ORDER = PERSONAL_CLOUD_PROVIDER_IDS;
