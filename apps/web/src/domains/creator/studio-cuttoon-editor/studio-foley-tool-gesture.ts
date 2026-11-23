import type { StudioLiveStrokeFoleyBridgeRuntime } from "./studio-live-stroke-foley-bridge";

export const LIVE_FOLEY_BRIDGE_SYMBOL = Symbol.for("toonstudio.liveStrokeFoleyBridge");

/** 도구 선택 버튼에서만 호출한다. 첫 획 전에 이미 로드된 Foley의 오디오 장치만 준비한다. */
export function prepareStudioFoleyOnToolClick(event: Pick<Event, "isTrusted" | "type">): void {
  if (event.type !== "click" || !event.isTrusted || globalThis.navigator?.userActivation?.isActive === false) return;
  const host = globalThis as typeof globalThis & { [LIVE_FOLEY_BRIDGE_SYMBOL]?: StudioLiveStrokeFoleyBridgeRuntime };
  host[LIVE_FOLEY_BRIDGE_SYMBOL]?.studioLiveStrokeFoley.prewarmContextFromGesture();
}
