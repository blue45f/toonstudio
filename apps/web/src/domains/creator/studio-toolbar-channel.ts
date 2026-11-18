const OPEN_ALL_TOOLS = "studio:open-all-tools";
const EDITOR = '[data-studio-editor="true"]';
const pending = new WeakMap<HTMLElement, { trigger: HTMLElement; cleanup: AbortController }>();

export function cancelPendingStudioAllTools(scope: HTMLElement): void {
  pending.get(scope)?.cleanup.abort();
  pending.delete(scope);
}

/** 원고에 먼저 보인 버튼의 클릭을 지연 로드 중인 도구 레일에 한 번 전달한다. */
export function requestStudioAllTools(trigger: HTMLElement): void {
  const scope = trigger.closest<HTMLElement>(EDITOR);
  if (scope) cancelPendingStudioAllTools(scope);
  const event = new CustomEvent(OPEN_ALL_TOOLS, { bubbles: true, cancelable: true, detail: { trigger } });
  if (!trigger.dispatchEvent(event) || !scope?.isConnected) return;

  const cleanup = new AbortController();
  pending.set(scope, { trigger, cleanup });
  const options = { signal: cleanup.signal, capture: true };
  scope.ownerDocument.addEventListener("keydown", (key) => {
    if (key.key === "Escape") cancelPendingStudioAllTools(scope);
  }, options);
  scope.ownerDocument.addEventListener("pointerdown", (pointer) => {
    if (pointer.target instanceof Node && !trigger.contains(pointer.target)) cancelPendingStudioAllTools(scope);
  }, options);
}

export function subscribeStudioAllTools(
  scope: HTMLElement,
  open: (trigger: HTMLElement) => void,
): () => void {
  const listener = (event: Event) => {
    if (event.defaultPrevented) return;
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object" || !("trigger" in detail)) return;
    const trigger = detail.trigger;
    if (!(trigger instanceof HTMLElement) || trigger.closest(EDITOR) !== scope) return;
    event.preventDefault();
    event.stopPropagation();
    open(trigger);
  };
  scope.addEventListener(OPEN_ALL_TOOLS, listener);

  const waiting = pending.get(scope);
  if (waiting) {
    cancelPendingStudioAllTools(scope);
    if (scope.isConnected && waiting.trigger.closest(EDITOR) === scope) open(waiting.trigger);
  }
  return () => scope.removeEventListener(OPEN_ALL_TOOLS, listener);
}
