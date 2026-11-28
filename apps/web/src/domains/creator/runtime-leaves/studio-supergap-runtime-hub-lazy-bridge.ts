/**
 * `/studio` 초격차 런타임 엔진 허브의 0 KiB 진입 지연 활성화 브리지.
 *
 * - 외부 Wave 모듈이나 UI 드로어를 일절 정적 import하지 않아 `check:studio-eager-graph` 진입 비용이 0에 가깝다.
 * - `StudioLiveFoleyFeelControls`의 원클릭 칩과 `StudioSupergapRuntimeHubLazyHost`를 느슨하게 연결한다.
 */

type OpenStateListener = (open: boolean) => void;

let supergapRuntimeHubOpen = false;
const openStateListeners = new Set<OpenStateListener>();

function emitOpenState(): void {
  for (const listener of openStateListeners) {
    listener(supergapRuntimeHubOpen);
  }
}

export function isStudioSupergapRuntimeHubOpen(): boolean {
  return supergapRuntimeHubOpen;
}

export function openStudioSupergapRuntimeHub(): void {
  if (!supergapRuntimeHubOpen) {
    supergapRuntimeHubOpen = true;
    emitOpenState();
  }
}

export function closeStudioSupergapRuntimeHub(): void {
  if (supergapRuntimeHubOpen) {
    supergapRuntimeHubOpen = false;
    emitOpenState();
  }
}

export function toggleStudioSupergapRuntimeHub(): boolean {
  supergapRuntimeHubOpen = !supergapRuntimeHubOpen;
  emitOpenState();
  return supergapRuntimeHubOpen;
}

export function subscribeStudioSupergapRuntimeHubOpen(listener: OpenStateListener): () => void {
  openStateListeners.add(listener);
  return () => {
    openStateListeners.delete(listener);
  };
}
