import { useMemo } from "react";

/** 같은 원고를 연 상태에서 협업 연결만 잠시 잠겨도 시작 시 복구를 반복하지 않는다. */
export function useStudioSharedRecoveryVisit(
  documentKey: string, userId: string | null, workId: string | null,
  revision: number | undefined, canEdit: boolean,
) {
  return useMemo(() => {
    if (!documentKey || !userId || !workId || revision === undefined || !canEdit) return null;
    let resolved = false;
    return {
      resolved: () => resolved,
      resolve: () => { resolved = true; },
    };
  }, [documentKey, userId, workId, revision, canEdit]);
}
