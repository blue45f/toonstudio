import type { NotificationStatus } from "./use-lighting-notification";

export function LightingOperationStatus({ channel, status, retry, pending, isEn }: {
  readonly channel: string; readonly status: NotificationStatus; readonly retry: () => void;
  readonly pending: boolean; readonly isEn: boolean;
}) {
  if (status === "idle") return null;
  const message = status === "local-only" ? (isEn ? "No receiver connected. Only the in-memory example changed." : "수신자 미연결. 메모리 예제만 바뀌었습니다.")
    : status === "pending" ? (isEn ? "Notifying the example receiver…" : "예제 수신자에게 알리는 중입니다…")
      : status === "failed" ? (isEn ? "Example notification failed. Retry the same result." : "예제 알림에 실패했습니다. 같은 결과를 다시 알릴 수 있습니다.")
        : (isEn ? "Example notified. Scene changes or storage were not verified." : "예제 알림 완료. 실제 장면 반영·저장은 확인하지 않습니다.");
  return <div data-testid={`lighting-delivery-${channel}`} role={status === "failed" ? "alert" : "status"} className="space-y-2 text-xs text-fg-2">
    <p>{message}</p>
    {status === "failed" ? <button type="button" disabled={pending} data-testid={`lighting-retry-${channel}`} onClick={retry} className="min-h-11 rounded-lg border border-line px-3 py-2">{isEn ? "Retry notification" : "같은 예제 알림 재시도"}</button> : null}
  </div>;
}

export function LightingCopyStatus({ state, retry, pending, bytes, isEn }: {
  readonly state: "idle" | "pending" | "copied" | "error"; readonly retry: () => void;
  readonly pending: boolean; readonly bytes: number; readonly isEn: boolean;
}) {
  if (state === "idle") return null;
  return <div data-testid="lighting-copy-status" role={state === "error" ? "alert" : "status"} className="space-y-2 text-xs text-fg-2">
    <p>{state === "pending" ? (isEn ? "Waiting for clipboard and example notification…" : "클립보드·예제 알림 응답을 기다립니다…")
      : state === "error" ? (isEn ? "Copy or notification failed. Completed copies are not repeated." : "복사 또는 예제 알림 실패. 완료된 복사는 반복하지 않습니다.")
        : (isEn ? `Clipboard copy completed (${bytes.toLocaleString("en-US")} B). No scene or storage success was verified.` : `클립보드 복사 완료 (${bytes.toLocaleString("ko-KR")} B). 실제 장면 적용·저장은 확인하지 않습니다.`)}</p>
    {state === "error" ? <button type="button" data-testid="lighting-copy-retry" disabled={pending} onClick={retry} className="min-h-11 rounded-lg border border-line px-3 py-2">{isEn ? "Retry copy or notification" : "복사·예제 알림 재시도"}</button> : null}
  </div>;
}

export function LightingInputError({ dialogue, onChange, message, isEn }: {
  readonly dialogue: string; readonly onChange: (value: string) => void; readonly message: string; readonly isEn: boolean;
}) {
  return <section data-testid="studio-scene-lighting-advisor-panel" className="space-y-3 rounded-xl border border-line bg-card p-4">
    <p data-testid="lighting-calculation-error" role="alert">{isEn ? "The input exceeds this calculation example's supported limits. The original text is preserved." : message}</p>
    <label className="block space-y-2 text-sm">{isEn ? "Original dialogue (not calculated)" : "원문 대사 (미계산)"}
      <textarea data-testid="lighting-dialogue-input" value={dialogue} onChange={event => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-canvas p-3 text-fg" />
    </label>
  </section>;
}
