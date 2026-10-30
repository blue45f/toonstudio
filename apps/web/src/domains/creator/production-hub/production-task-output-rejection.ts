import { HTTPError, httpStatus, isAppApiError } from "@/platform/api";
import { productionCommandRecoveryKey } from "./production-command-recovery";

export type TaskOutputRejectionDisposition = "editable" | "permission-denied" | "sealed";

/** executeStrict는 실제 HTTP 오류를 Error.cause에 보존한다. 임의 status 필드는 읽지 않는다. */
export function taskOutputRejectionDisposition(error: unknown, actorId: string, projectId: string): TaskOutputRejectionDisposition {
  let current: unknown = error;
  const seen = new Set<Error>();
  let status: number | null = null, revisionConflict = false;
  while (current instanceof Error && !seen.has(current) && seen.size < 16) {
    seen.add(current);
    const code = httpStatus(current);
    if (code !== null) {
      if (status !== null && code !== status) return "sealed";
      status = code;
      if (code === 409 && isAppApiError(current) && current.code === "production_revision_conflict") revisionConflict = true;
      if (code === 409 && current instanceof HTTPError) {
        const data: unknown = current.data;
        // 현재 API의 revision 409만 currentRevision을 가진다. mutation ID 충돌은 이 증명이 없다.
        if (data !== null && typeof data === "object" && "currentRevision" in data
          && typeof data.currentRevision === "number" && Number.isSafeInteger(data.currentRevision) && data.currentRevision >= 0) revisionConflict = true;
      }
    }
    current = current.cause;
  }
  if (status !== 400 && status !== 403 && status !== 422 && !(status === 409 && revisionConflict)) return "sealed";
  try {
    // 다른 명령을 포함해 pending 기록이 있거나 저장소 상태를 알 수 없으면 기존 복구를 우회하지 않는다.
    if (window.sessionStorage.getItem(productionCommandRecoveryKey(actorId, projectId)) !== null) return "sealed";
  } catch { return "sealed"; }
  return status === 403 ? "permission-denied" : "editable";
}
