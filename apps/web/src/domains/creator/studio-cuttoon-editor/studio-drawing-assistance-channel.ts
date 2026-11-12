const OPEN_RELIABILITY = "studio:open-drawing-reliability";

/** 현재 편집기의 문제 해결을 여는 요청이며 상태·진단 자료를 복제하지 않는다. */
export function requestStudioDrawingReliability(trigger: HTMLElement): void {
  if (!trigger.isConnected) return;
  trigger.dispatchEvent(new CustomEvent(OPEN_RELIABILITY, { bubbles: true, detail: { trigger } }));
}

export function subscribeStudioDrawingReliability(scope: HTMLElement, open: (trigger: HTMLElement) => void): () => void {
  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object" || !("trigger" in detail)) return;
    const trigger = detail.trigger;
    const editor = scope.closest('[data-studio-editor="true"]');
    if (!(trigger instanceof HTMLElement) || !trigger.isConnected || event.target !== trigger || !editor?.contains(trigger)) return;
    event.stopPropagation(); open(trigger);
  };
  document.addEventListener(OPEN_RELIABILITY, listener);
  return () => document.removeEventListener(OPEN_RELIABILITY, listener);
}
