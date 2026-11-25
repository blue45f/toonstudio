import type { ReactElement } from "react";

import type { NotificationStatus } from "./use-example-notification";

interface RhythmOperationStatusProps {
  readonly channel: "analysis" | "json" | "svg" | "clipboard";
  readonly status: NotificationStatus;
  readonly retry: () => void;
  readonly pending: boolean;
  readonly isEn: boolean;
}

export function RhythmOperationStatus({ channel, status, retry, pending, isEn }: RhythmOperationStatusProps): ReactElement | null {
  if (status === "idle") return null;
  const isCopy = channel === "clipboard";
  let message: string;
  if (isCopy) {
    if (status === "failed") message = isEn ? "Clipboard copy failed; the original text is preserved." : "클립보드 복사에 실패했습니다. 원문은 유지됩니다.";
    else if (status === "pending") message = isEn ? "Waiting for the clipboard response…" : "클립보드 응답을 기다리고 있습니다…";
    else message = isEn ? "Clipboard copy completed. This does not confirm document or file storage." : "클립보드 복사 완료. 원고·파일 저장 완료를 뜻하지 않습니다.";
  } else {
    if (status === "failed") message = isEn ? "Example notification failed; the in-memory result is preserved." : "예제 결과 알림에 실패했습니다. 메모리 계산 결과는 유지됩니다.";
    else if (status === "pending") message = isEn ? "Notifying the example result…" : "예제 결과를 알리는 중입니다…";
    else if (status === "local-only") message = isEn ? "No example receiver is connected; only the in-memory preview changed." : "예제 수신자 미연결. 화면의 메모리 미리보기만 바뀌었습니다.";
    else message = isEn ? "Example result notified. No document apply or save was confirmed." : "예제 결과 알림을 마쳤습니다. 원고 적용·저장 완료를 뜻하지 않습니다.";
  }
  const testId = isCopy ? "rhythm-copy-status" : `rhythm-notification-${channel}`;
  const retryTestId = isCopy ? "retry-clipboard" : `retry-${channel}-notification`;
  return (
    <div data-testid={testId} role={status === "failed" ? "alert" : "status"} className="space-y-2 rounded-lg border border-line bg-panel p-3 text-xs text-fg-2">
      <p>{message}</p>
      {status === "failed" ? <button type="button" data-testid={retryTestId} disabled={pending} onClick={retry} className="min-h-11 rounded-lg border border-line px-3 py-2 font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{isEn ? "Retry the same result" : "같은 결과 다시 시도"}</button> : null}
    </div>
  );
}
