const TEXT_ENTRY_SELECTOR = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])',
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
].join(",");

/**
 * 현재 이벤트 타깃이나 activeElement가 채팅·검색·양식 등 텍스트 입력 칸인지 판정한다.
 * 채팅 입력 중 WASD·방향키·조이스틱 잔류 입력으로 아바타가 계속 걷는 현상을 막는다.
 */
export function isStudioSpaceTextEntryTarget(target: EventTarget | Element | null | undefined): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return target.closest(TEXT_ENTRY_SELECTOR) !== null;
}

export interface StudioSpaceEventTargetLike {
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean | EventListenerOptions): void;
}

/**
 * 포커스가 채팅창·검색창·입력 필드로 이동하는 즉시 보유 중인 이동 키·조이스틱·클릭 이동을 정지시킨다.
 */
export function bindStudioSpaceTextEntryMovementStop(
  haltMovement: () => void,
  root: StudioSpaceEventTargetLike = window,
): () => void {
  const onFocusIn = (event: Event) => {
    const target = event.target ?? (typeof document !== "undefined" ? document.activeElement : null);
    if (isStudioSpaceTextEntryTarget(target)) {
      haltMovement();
    }
  };
  const onCompositionStart = () => {
    haltMovement();
  };
  root.addEventListener("focusin", onFocusIn, true);
  root.addEventListener("compositionstart", onCompositionStart, true);
  return () => {
    root.removeEventListener("focusin", onFocusIn, true);
    root.removeEventListener("compositionstart", onCompositionStart, true);
  };
}

/** 조이스틱 벡터가 실제로 이동 입력을 발생시키는 크기인지 판정한다. */
export function isStudioSpaceJoystickActive(vector: { readonly x: number; readonly y: number }): boolean {
  return Math.hypot(vector.x, vector.y) > 0.02;
}
