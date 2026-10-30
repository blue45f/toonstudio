import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { getAuthSession } from "@/domains/auth/public/session/auth-session-state";
import { getStudioScopedWritePolicy } from "../../studio-collab/studio-scoped-write-client";
import { bindStudioScopedWriteAuthority, StudioScopedWriteAuthority, type StudioScopedWriteFence } from "../../studio-collab/studio-scoped-write-authority";
import type { StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";

const noopSubscribe = () => () => {}, zero = () => 0;
export interface StudioScopedWriteRuntime {
  readonly authority: StudioScopedWriteAuthority | null;
  readonly policy: StudioScopedWritePolicy | null;
  readonly loading: boolean; readonly error: string | null;
  refresh(): Promise<StudioScopedWritePolicy | null>;
}

export function useStudioScopedWriteRuntime({ actorId, workId, accessRef, canMutate }: {
  readonly actorId: string | null; readonly workId: string | null; readonly accessRef: RefObject<StudioScopedWriteFence>; readonly canMutate: boolean;
}): StudioScopedWriteRuntime {
  const ready = useRef(canMutate); ready.current = canMutate;
  const authority = useMemo(() => actorId && workId ? new StudioScopedWriteAuthority(actorId, workId, () => ({ ...accessRef.current, authScopeKey: getAuthSession()?.user.id ?? null, scopedMutationReady: ready.current })) : null, [actorId, workId, accessRef]);
  const [state, setState] = useState<{ owner: StudioScopedWriteAuthority | null; loading: boolean; error: string | null }>({ owner: authority, loading: Boolean(authority), error: null });
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const epoch = useSyncExternalStore(authority?.subscribe ?? noopSubscribe, authority?.getEpoch ?? zero, zero);
  const refresh = useCallback(async () => {
    if (!authority || !actorId || !workId) return null;
    try { authority.suspend(); } catch (cause) { setState({ owner: authority, loading: false, error: cause instanceof Error ? cause.message : "대기 원고를 보존했습니다. 동기화 경계를 다시 확인하세요." }); return null; }
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setState({ owner: authority, loading: true, error: null });
    const current = () => mounted.current && !request.signal.aborted && getAuthSession()?.user.id === actorId;
    try {
      const policy = await getStudioScopedWritePolicy(workId, request.signal);
      if (!current()) return null;
      authority.setPolicy(policy); setState({ owner: authority, loading: false, error: null }); return policy;
    } catch (cause) {
      if (current()) { authority.expire(); setState({ owner: authority, loading: false, error: cause instanceof Error ? cause.message : "담당 원고 편집 권한을 확인하지 못했습니다." }); }
      return null;
    } finally { if (controller.current === request) controller.current = null; }
  }, [authority, actorId, workId]);
  useLayoutEffect(() => {
    mounted.current = true;
    authority?.mount(); authority?.bindPolicyRefresh(refresh);
    const unbind = authority ? bindStudioScopedWriteAuthority(accessRef, authority) : null;
    return () => { mounted.current = false; controller.current?.abort(); unbind?.(); authority?.bindPolicyRefresh(null); authority?.dispose(); };
  }, [authority, accessRef, refresh]);
  useEffect(() => { void refresh(); return () => { controller.current?.abort(); }; }, [refresh]);
  useEffect(() => {
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);
  useEffect(() => {
    const now = Date.now(), boundaries = authority?.snapshot?.grants.flatMap((grant) => [Date.parse(grant.startsAt), ...(grant.endsAt ? [Date.parse(grant.endsAt) + 1] : [])]).filter((value) => Number.isFinite(value) && value > now) ?? [];
    if (!boundaries.length) return;
    const timer = setTimeout(() => authority?.expire(), Math.min(2_147_483_647, Math.max(1, Math.min(...boundaries) - now)));
    return () => clearTimeout(timer);
  }, [authority, epoch]);
  return { authority, policy: authority?.snapshot ?? null, loading: state.owner === authority ? state.loading : Boolean(authority), error: state.owner === authority ? state.error : null, refresh };
}
