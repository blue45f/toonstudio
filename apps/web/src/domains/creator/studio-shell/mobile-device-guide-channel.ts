const OPEN_MOBILE_DEVICE_GUIDE = "studio:open-mobile-device-guide";

/** 현재 표면의 안내를 열며 복귀할 실제 더보기 트리거를 전달한다. 저장 상태는 소유하지 않는다. */
export function requestStudioMobileDeviceGuide(surfaceId: string, trigger: HTMLElement): void {
  trigger.dispatchEvent(new CustomEvent(OPEN_MOBILE_DEVICE_GUIDE, { bubbles: true, detail: { surfaceId, trigger } }));
}

export function subscribeStudioMobileDeviceGuide(surfaceId: string, open: (trigger: HTMLElement) => void): () => void {
  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object" || !("surfaceId" in detail) || !("trigger" in detail)) return;
    if (detail.surfaceId !== surfaceId || !(detail.trigger instanceof HTMLElement) || !detail.trigger.isConnected || event.target !== detail.trigger) return;
    event.stopPropagation();
    open(detail.trigger);
  };
  document.addEventListener(OPEN_MOBILE_DEVICE_GUIDE, listener);
  return () => document.removeEventListener(OPEN_MOBILE_DEVICE_GUIDE, listener);
}
