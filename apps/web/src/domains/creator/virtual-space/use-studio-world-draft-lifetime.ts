import { useLayoutEffect, useMemo } from "react";

/** 이미 떠난 편집 화면으로 늦게 도착한 로컬 DB 결과를 전달하지 않는다. */
export function useStudioWorldDraftLifetime(owner: string | null, projectId: string) {
  const scope = useMemo(() => ({ owner, projectId, active: false }), [owner, projectId]);
  useLayoutEffect(() => { scope.active = true; return () => { scope.active = false; }; }, [scope]);
  return scope;
}
