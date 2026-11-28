/**
 * `/studio` 초격차 런타임 엔진 허브의 0 KiB 진입 지연 활성화 브리지.
 *
 * - 외부 Wave 모듈이나 UI 드로어를 일절 정적 import하지 않아 `check:studio-eager-graph` 진입 비용이 0에 가깝다.
 * - `StudioLiveFoleyFeelControls`의 원클릭 칩과 `StudioSupergapRuntimeHubLazyHost`를 느슨하게 연결한다.
 */

type OpenStateListener = (open: boolean) => void;
type Launcher = HTMLElement | (() => HTMLElement | null);

export const STUDIO_SUPERGAP_RUNTIME_HUB_PANEL_ID = "studio-runtime-engine-status";

let supergapRuntimeHubOpen = false;
let returnFocusTarget: { readonly ownerDocument: Document | undefined; readonly resolve: () => HTMLElement | null } | null = null;
const openStateListeners = new Set<OpenStateListener>();

function emitOpenState(): void {
  for (const listener of openStateListeners) {
    listener(supergapRuntimeHubOpen);
  }
}

export function isStudioSupergapRuntimeHubOpen(): boolean {
  return supergapRuntimeHubOpen;
}

export function openStudioSupergapRuntimeHub(launcher?: Launcher): void {
  if (!supergapRuntimeHubOpen) {
    const resolve = typeof launcher === "function" ? launcher : () => launcher ?? null;
    returnFocusTarget = launcher ? { ownerDocument: resolve()?.ownerDocument, resolve } : null;
    supergapRuntimeHubOpen = true;
    emitOpenState();
  }
}

export function closeStudioSupergapRuntimeHub(): void {
  if (supergapRuntimeHubOpen) {
    const target = returnFocusTarget;
    const panel = target?.ownerDocument?.getElementById(STUDIO_SUPERGAP_RUNTIME_HUB_PANEL_ID);
    const returnFocus = panel?.contains(panel.ownerDocument.activeElement);
    returnFocusTarget = null;
    supergapRuntimeHubOpen = false;
    emitOpenState();
    if (returnFocus) {
      const launcher = target?.resolve();
      if (launcher?.isConnected) launcher.focus({ preventScroll: true });
    }
  }
}

export function toggleStudioSupergapRuntimeHub(launcher?: HTMLElement): boolean {
  if (supergapRuntimeHubOpen) closeStudioSupergapRuntimeHub();
  else openStudioSupergapRuntimeHub(launcher);
  return supergapRuntimeHubOpen;
}

export function subscribeStudioSupergapRuntimeHubOpen(listener: OpenStateListener): () => void {
  openStateListeners.add(listener);
  return () => {
    openStateListeners.delete(listener);
  };
}
