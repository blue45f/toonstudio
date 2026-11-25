import type { ReactElement } from "react";
import type { PlacementNotificationStatus } from "./use-placement-notification";

export function PlacementOperationStatus({ channel, status, retry, pending, isEn }: {
  readonly channel: string; readonly status: PlacementNotificationStatus; readonly retry: () => void;
  readonly pending: boolean; readonly isEn: boolean;
}): ReactElement | null {
  if (status === "idle") return null;
  const copy = channel === "clipboard";
  let message: string;
  if (copy) {
    if (status === "pending") message = isEn ? "Waiting for the clipboard response…" : "클립보드 응답을 기다리고 있습니다…";
    else if (status === "failed") message = isEn ? "Clipboard copy failed. The same text can be retried." : "클립보드 복사 실패. 같은 원문을 다시 시도할 수 있습니다.";
    else message = isEn ? "Clipboard copy completed. No file or server save was verified." : "클립보드 복사 완료. 파일·서버 저장을 확인한 것은 아닙니다.";
  } else {
    if (status === "pending") message = isEn ? "Notifying the example receiver…" : "예제 수신자에게 알리는 중입니다…";
    else if (status === "failed") message = isEn ? "Example notification failed. The in-memory state is preserved." : "예제 알림 실패. 메모리 상태는 유지됩니다.";
    else if (status === "local-only") message = isEn ? "No receiver is connected. Only the in-memory example changed." : "수신자 미연결. 메모리 예제만 바뀌었습니다.";
    else message = isEn ? "Example result notified. Team delivery, permissions and storage were not verified." : "예제 결과 알림 완료. 팀 전송·권한·저장은 확인하지 않습니다.";
  }
  return <div data-testid={copy ? "proposer-copy-status" : `proposer-notification-${channel}`} role={status === "failed" ? "alert" : "status"} className="space-y-2 rounded-lg border border-line bg-canvas p-3 text-xs text-fg-2">
    <p>{message}</p>
    {status === "failed" ? <button type="button" data-testid={`proposer-retry-${channel}`} disabled={pending} onClick={retry} className="min-h-11 rounded-lg border border-line px-3 py-2 font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{isEn ? "Retry the same result" : "같은 결과 다시 시도"}</button> : null}
  </div>;
}
