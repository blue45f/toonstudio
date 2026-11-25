import type { ReactElement } from "react";
import type { NotificationStatus } from "./use-example-notification";

interface OperationStatusProps {
  readonly channel: string; readonly status: NotificationStatus; readonly retry: () => void;
  readonly pending: boolean; readonly isEn: boolean;
}

export function OperationStatus({ channel, status, retry, pending, isEn }: OperationStatusProps): ReactElement | null {
  if (status === "idle") return null;
  const isCopy = channel === "clipboard";
  let message: string;
  if (isCopy) {
    if (status === "pending") message = isEn ? "Waiting for the clipboard response…" : "클립보드 응답을 기다리고 있습니다…";
    else if (status === "failed") message = isEn ? "Clipboard copy failed. The preview text is preserved." : "클립보드 복사에 실패했습니다. 미리보기 원문은 유지됩니다.";
    else message = isEn ? "Clipboard copy completed. Document or file storage was not confirmed." : "클립보드 복사 완료. 원고·파일 저장을 확인한 것은 아닙니다.";
  } else {
    if (status === "pending") message = isEn ? "Notifying the example receiver…" : "예제 수신자에게 알리는 중입니다…";
    else if (status === "failed") message = isEn ? "Example notification failed. The same in-memory result can be retried." : "예제 결과 알림에 실패했습니다. 같은 메모리 결과를 다시 알릴 수 있습니다.";
    else if (status === "local-only") message = isEn ? "No receiver is connected. Only this in-memory example changed." : "수신자 미연결. 화면의 메모리 예제만 바뀌었습니다.";
    else message = isEn ? "Example result notified. Artwork changes and storage were not confirmed." : "예제 결과 알림 완료. 실제 원고 변경·저장은 확인하지 않습니다.";
  }
  return <div data-testid={isCopy ? "pitch-copy-status" : `pitch-notification-${channel}`} role={status === "failed" ? "alert" : "status"} className="space-y-2 rounded-lg border border-line bg-panel p-3 text-xs text-fg-2">
    <p>{message}</p>
    {status === "failed" ? <button type="button" data-testid={`pitch-retry-${channel}`} disabled={pending} onClick={retry} className="min-h-11 rounded-lg border border-line px-3 py-2 font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{isEn ? "Retry the same result" : "같은 결과 다시 시도"}</button> : null}
  </div>;
}
