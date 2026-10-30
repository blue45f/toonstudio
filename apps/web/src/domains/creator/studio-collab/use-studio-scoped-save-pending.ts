import { useEffect, useState } from "react";
import { boundStudioSaveIntentOperation } from "../studio-durable-save-intent";
import { studioScopedSavePendingKey, studioScopedSavePendingRepository, subscribeStudioScopedSavePending,
  type StudioScopedSavePendingScope } from "./studio-scoped-save-pending";

/** 같은 계정·작품의 실제 저장 원문 유무만 알린다. 본문 노출과 자동 재전송은 하지 않는다. */
export function useStudioScopedSavePendingStatus(scope: StudioScopedSavePendingScope | null) {
  const key = scope ? studioScopedSavePendingKey(scope) : null;
  const actorUserId = scope?.actorUserId ?? null, workId = scope?.workId ?? null;
  const [state, setState] = useState<{ key: string | null; pending: boolean; loading: boolean; error: string | null }>({
    key: null, pending: false, loading: false, error: null,
  });
  useEffect(() => {
    if (!key || !actorUserId || !workId) return;
    let active = true, generation = 0;
    const read = () => {
      const run = ++generation;
      setState({ key, pending: false, loading: true, error: null });
      void boundStudioSaveIntentOperation(studioScopedSavePendingRepository.load({ actorUserId, workId })).then((entry) => {
        if (active && generation === run) setState({ key, pending: entry !== null, loading: false, error: null });
      }).catch((error: unknown) => {
        if (active && generation === run) setState({ key, pending: false, loading: false,
          error: error instanceof Error ? error.message : "이전 저장 상태를 확인하지 못했습니다." });
      });
    };
    const unsubscribe = subscribeStudioScopedSavePending((changed, pending) => {
      if (active && changed === key) { generation++; setState({ key, pending, loading: false, error: null }); }
    });
    const focus = () => { if (document.visibilityState === "visible") read(); };
    read(); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { active = false; generation++; unsubscribe(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [key, actorUserId, workId]);
  return state.key === key ? { pending: state.pending, loading: state.loading, error: state.error }
    : { pending: false, loading: key !== null, error: null };
}
