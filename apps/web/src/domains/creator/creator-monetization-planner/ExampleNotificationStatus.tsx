import type { ReactElement } from "react";

import type { NotificationStatus } from "./use-example-notification";

interface ExampleNotificationStatusProps {
  readonly status: NotificationStatus;
  readonly retry: () => void;
  readonly retryTestId: string;
  readonly isEn: boolean;
}

export function ExampleNotificationStatus({ status, retry, retryTestId, isEn }: ExampleNotificationStatusProps): ReactElement | null {
  if (status === "idle") return null;
  let message: string;
  if (status === "pending") message = isEn ? "Notifying the example result…" : "예제 결과를 알리는 중입니다…";
  else if (status === "failed") message = isEn ? "Example notification failed. The in-memory result is preserved." : "예제 결과 알림에 실패했습니다. 화면의 메모리 결과는 유지됩니다.";
  else if (status === "notified") message = isEn ? "Example result notified. This does not confirm any document or setting was saved." : "예제 결과 알림을 마쳤습니다. 원고·설정 저장 완료를 뜻하지 않습니다.";
  else message = isEn ? "Only the in-memory example changed. No notification or save was performed." : "화면의 메모리 예제만 바뀌었습니다. 외부 알림이나 저장은 하지 않았습니다.";
  return (
    <div role={status === "failed" ? "alert" : "status"} className="space-y-2 rounded-lg border border-line bg-card p-3 text-xs text-fg-2">
      <p>{message}</p>
      {status === "failed" ? <button type="button" data-testid={retryTestId} onClick={retry} className="min-h-11 rounded-lg border border-line px-3 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{isEn ? "Notify the same result again" : "같은 결과 다시 알림"}</button> : null}
    </div>
  );
}
