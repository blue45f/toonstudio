export const STUDIO_MOBILE_EXPANDED_TOOLS_CHANGE = "studio:mobile-expanded-tools-change";

export type StudioMobileSheetKind =
  | "draw"
  | "props"
  | "pages"
  | "brushes"
  | "color-vision"
  | null;

export interface StudioMobilePanelLayer {
  readonly id: string;
  readonly dismiss: () => void;
}

export interface StudioMobileBackStackInputs {
  readonly isMobile: boolean;
  readonly mobileSheet: StudioMobileSheetKind;
  readonly dismissActiveMobileSheet: () => void;
  readonly menuOpen: boolean;
  readonly dismissMenu: () => void;
  readonly quickActionsOpen: boolean;
  readonly dismissQuickActions: () => void;
  readonly quickAccessPaletteOpen: boolean;
  readonly dismissQuickAccessPalette: () => void;
  readonly shortcutsOpen: boolean;
  readonly dismissShortcuts: () => void;
  readonly routedSurface?: string;
  readonly routedModalOwners?: WeakSet<Element>;
  readonly domRoot?: ParentNode | null;
}

function isVisibleElement(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  if (el.closest("[hidden], [inert]")) return false;
  return true;
}

function queryVisibleForeignModals(root: ParentNode, routedSurface?: string, routedModalOwners?: WeakSet<Element>): HTMLElement[] {
  const candidates = root.querySelectorAll(
    '[role="dialog"][aria-modal="true"], dialog[open]',
  );
  const modals: HTMLElement[] = [];
  for (const node of candidates) {
    if (!isVisibleElement(node)) continue;
    // 모바일 시트 자체(`props`, `brushes`, `pages`, `color-vision`, `draw`, 도크 팝오버)는
    // 아래 시트 계층에서 정확히 계산하므로 중복 산입하지 않는다.
    if (node.hasAttribute("data-studio-mobile-sheet")) continue;
    // 첫 진입 웰컴 오버레이는 편집 패널 스택 대상이 아니다.
    if (node.closest("[data-studio-cinematic-canvas-welcome]")) continue;
    // 주소가 소유한 3D 편집기는 실제 라우터 히스토리가 닫는다. 안쪽 시트·보조 포저는 별도 층이다.
    if ((routedSurface === "bg3d" && node.hasAttribute("data-studio-bg3d-experience"))
      || (routedSurface === "character" && node.hasAttribute("data-character-shaper"))
      || (routedSurface === "poser" && node.hasAttribute("data-studio-vrm-dialog") && !node.hasAttribute("data-character-shaper"))) {
      routedModalOwners?.add(node);
      continue;
    }
    // 2D 주소가 먼저 복원되고 WebXR/렌더러 종료가 늦은 프레임에도 기존 라우트 창은 자체 가드를 만들지 않는다.
    if (routedModalOwners?.has(node)) continue;
    modals.push(node);
  }
  return modals;
}

function dismissForeignModal(modal: HTMLElement): void {
  if (modal.dataset.studioDrawingTask === "expanded-tools") {
    modal.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
    return;
  }
  const active = modal.ownerDocument.activeElement;
  const target = active instanceof HTMLElement && modal.contains(active) ? active : modal;
  if (!target.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
  }))) return;

  const closeBtn = modal.querySelector<HTMLButtonElement>(
    'button[data-studio-mobile-sheet-close="true"], button[aria-label*="닫기"], button[title*="닫기"], button[aria-label*="Close"]',
  );
  closeBtn?.click();
}

/**
 * 모바일 편집 화면에 열려 있는 패널·시트·모달을 바닥(먼저 열린 것) → 최상단(나중에 열린 것)
 * 순서의 LIFO 배열로 계산한다. 배열 마지막 원소가 시스템 뒤로 가기 1회 시 닫힐 최상단 패널이다.
 */
export function resolveStudioMobileBackLayers(
  inputs: StudioMobileBackStackInputs,
): readonly StudioMobilePanelLayer[] {
  const root = inputs.domRoot ?? (typeof document !== "undefined" ? document : null);
  if (!inputs.isMobile) {
    const expanded = root?.querySelector('dialog[data-studio-mobile-expanded-tools="true"][open]');
    return expanded && isVisibleElement(expanded)
      ? [{ id: "modal:drawing-task:expanded-tools", dismiss: () => dismissForeignModal(expanded) }]
      : [];
  }

  const layers: StudioMobilePanelLayer[] = [];

  if (root) {
    const colorPopover = root.querySelector(
      '[data-studio-mobile-color-controls="true"]:not([hidden])',
    );
    if (colorPopover && isVisibleElement(colorPopover)) {
      layers.push({
        id: "dock:colors",
        dismiss: () => {
          colorPopover
            .querySelector<HTMLButtonElement>('[data-studio-mobile-sheet-close="true"]')
            ?.click();
        },
      });
    }

    const toolsPopover = root.querySelector(
      '[data-studio-mobile-workspace-menu="true"]:not([hidden])',
    );
    if (toolsPopover && isVisibleElement(toolsPopover)) {
      layers.push({
        id: "dock:tools",
        dismiss: () => {
          toolsPopover
            .querySelector<HTMLButtonElement>('[data-studio-mobile-sheet-close="true"]')
            ?.click();
        },
      });
    }

    const appBarAdvancedClose = root.querySelector<HTMLButtonElement>(
      '[data-testid="drawing-appbar-advanced-close"]',
    );
    if (appBarAdvancedClose && isVisibleElement(appBarAdvancedClose)) {
      layers.push({
        id: "appbar:advanced",
        dismiss: () => appBarAdvancedClose.click(),
      });
    }
  }

  // `brushes` 시트는 `draw` 시트에서 한 단계 깊게 진입하므로 [draw, brushes] 2단 스택이다.
  if (inputs.mobileSheet === "brushes") {
    layers.push({
      id: "sheet:draw",
      dismiss: inputs.dismissActiveMobileSheet,
    });
    layers.push({
      id: "sheet:brushes",
      dismiss: inputs.dismissActiveMobileSheet,
    });
  } else if (inputs.mobileSheet !== null) {
    layers.push({
      id: `sheet:${inputs.mobileSheet}`,
      dismiss: inputs.dismissActiveMobileSheet,
    });
  }

  if (inputs.menuOpen) {
    layers.push({
      id: "overlay:menu",
      dismiss: inputs.dismissMenu,
    });
  }
  if (inputs.quickActionsOpen) {
    layers.push({
      id: "overlay:quick-actions",
      dismiss: inputs.dismissQuickActions,
    });
  }

  const foreignModals = root ? queryVisibleForeignModals(root, inputs.routedSurface, inputs.routedModalOwners) : [];

  if (inputs.quickAccessPaletteOpen && foreignModals.length === 0) {
    layers.push({
      id: "overlay:quick-access",
      dismiss: inputs.dismissQuickAccessPalette,
    });
  }
  if (inputs.shortcutsOpen && foreignModals.length === 0) {
    layers.push({
      id: "overlay:shortcuts",
      dismiss: inputs.dismissShortcuts,
    });
  }

  foreignModals.forEach((modal, index) => {
    const label =
      modal.getAttribute("aria-label")
      || modal.getAttribute("aria-labelledby")
      || String(index);
    layers.push({
      id: modal.hasAttribute("data-studio-drawing-task")
        ? `modal:drawing-task:${modal.dataset.studioDrawingTask}`
        : modal.querySelector("[data-studio-all-tools-direct]") ? "modal:catalog" : `modal:${index}:${label}`,
      dismiss: () => dismissForeignModal(modal),
    });
  });

  return layers;
}

export interface BrowserHistoryAdapter {
  readonly getPathname: () => string;
  readonly getHref: () => string;
  readonly getState: () => unknown;
  readonly pushState: (state: unknown, url: string) => void;
  readonly go: (delta: number) => void;
}

export interface StudioMobileHistorySyncController {
  readonly syncLayers: (layers: readonly StudioMobilePanelLayer[]) => void;
  readonly handlePopState: (event: PopStateEvent) => boolean;
  readonly getPushedDepth: () => number;
  readonly dispose: () => void;
}

/**
 * 열려 있는 모바일 패널 스택 깊이(`layers.length`)와 브라우저 히스토리 가드 엔트리 수를
 * 양방향 동기화한다.
 * - 패널 열림: 동일 URL 가드 엔트리 `pushState` 추가
 * - 시스템 뒤로 가기(`popstate`): `stopImmediatePropagation()` 후 최상단 패널 1개만 닫기
 * - 닫기 버튼/Escape로 닫힘: 남은 가드 엔트리를 `history.go(-delta)`로 정리
 */
export function createStudioMobileHistorySyncController(
  historyAdapter: BrowserHistoryAdapter,
  options?: { readonly onBeforeGenuineLeave?: () => void },
): StudioMobileHistorySyncController {
  const sessionToken = `studio-mobile-back-${Math.random().toString(36).slice(2, 10)}`;
  const initialPathname = historyAdapter.getPathname();
  let currentLayers: readonly StudioMobilePanelLayer[] = [];
  let pushedDepth = 0;
  let guardedHref: string | null = null;
  let guardedEntryKey: unknown;
  let pendingPopTargetDepth: number | null = null;
  let rewindingHistory = false;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let rewindSafetyTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingTimer = () => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const clearRewindTimer = () => {
    if (rewindSafetyTimer !== null) {
      clearTimeout(rewindSafetyTimer);
      rewindSafetyTimer = null;
    }
  };

  return {
    syncLayers(layers) {
      currentLayers = layers;
      if (historyAdapter.getPathname() !== initialPathname) {
        return;
      }
      // 같은 원고에서도 워크스페이스 이동은 실제 라우터 항목이다. 이전 모달 가드로 되감지 않는다.
      const state = historyAdapter.getState() as { __studioMobileBackSession?: unknown; key?: unknown } | null;
      if (pushedDepth > 0 && state?.__studioMobileBackSession !== sessionToken && pendingPopTargetDepth === null) {
        // 브라우저는 popstate 전달 전에 현재 항목을 바꾼다. 그 사이의 React 레이아웃이
        // 같은 원고 키에서 사라진 가드를 다시 쌓으면 작가는 뒤로 가기를 두 번 눌러야 한다.
        if (historyAdapter.getHref() === guardedHref && state?.key === guardedEntryKey) return;
        pushedDepth = 0;
      }
      const desiredDepth = layers.length;

      if (pendingPopTargetDepth !== null) {
        if (desiredDepth <= pendingPopTargetDepth) {
          pendingPopTargetDepth = null;
          clearPendingTimer();
        } else {
          return;
        }
      }

      if (desiredDepth > pushedDepth) {
        guardedHref = historyAdapter.getHref();
        guardedEntryKey = state?.key;
        const baseState =
          typeof historyAdapter.getState() === "object" && historyAdapter.getState() !== null
            ? (historyAdapter.getState() as Record<string, unknown>)
            : {};
        while (pushedDepth < desiredDepth) {
          pushedDepth += 1;
          historyAdapter.pushState(
            {
              ...baseState,
              __studioMobileBackSession: sessionToken,
              __studioMobileBackDepth: pushedDepth,
              __studioMobileBackLayer: layers[pushedDepth - 1]?.id,
            },
            historyAdapter.getHref(),
          );
        }
      } else if (desiredDepth < pushedDepth && !rewindingHistory) {
        const delta = pushedDepth - desiredDepth;
        pushedDepth = desiredDepth;
        rewindingHistory = true;
        clearRewindTimer();
        rewindSafetyTimer = setTimeout(() => {
          rewindingHistory = false;
          rewindSafetyTimer = null;
        }, 250);
        historyAdapter.go(-delta);
      }
    },

    handlePopState(event) {
      if (rewindingHistory) {
        rewindingHistory = false;
        clearRewindTimer();
        event.stopImmediatePropagation();
        return true;
      }

      if (pushedDepth > 0 && currentLayers.length > 0) {
        event.stopImmediatePropagation();
        pushedDepth -= 1;
        pendingPopTargetDepth = pushedDepth;
        clearPendingTimer();
        pendingTimer = setTimeout(() => {
          pendingPopTargetDepth = null;
          pendingTimer = null;
        }, 250);
        const topmost = currentLayers[currentLayers.length - 1];
        topmost?.dismiss();
        return true;
      }

      options?.onBeforeGenuineLeave?.();
      return false;
    },

    getPushedDepth() {
      return pushedDepth;
    },

    dispose() {
      clearPendingTimer();
      clearRewindTimer();
      pushedDepth = 0;
      pendingPopTargetDepth = null;
      rewindingHistory = false;
    },
  };
}
