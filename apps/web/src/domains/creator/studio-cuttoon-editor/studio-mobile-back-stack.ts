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

interface StudioMobileHistoryEntry {
  readonly key?: string;
  readonly idx?: number;
  readonly __studioMobileBackSession?: string;
  readonly __studioMobileBackDepth?: number;
}

interface StudioMobileGuardReceipt {
  readonly href: string;
  readonly key: StudioMobileHistoryEntry["key"];
  readonly idx: StudioMobileHistoryEntry["idx"];
  readonly session: string;
  readonly depth: number;
}

interface StudioMobileGuardRewind {
  readonly from: StudioMobileGuardReceipt;
  readonly to: number;
  readonly retired: boolean;
}

const releasedStudioMobileGuards = new WeakMap<object, {
  readonly owner?: object;
  readonly receipt: StudioMobileGuardReceipt;
  readonly rewind: StudioMobileGuardRewind | null;
}>();

function matchesStudioMobileGuard(
  receipt: StudioMobileGuardReceipt,
  href: string,
  state: StudioMobileHistoryEntry | null,
  depth = receipt.depth,
): boolean {
  if (href !== receipt.href || state?.key !== receipt.key || state?.idx !== receipt.idx) return false;
  return depth === 0
    ? state?.__studioMobileBackSession === undefined
    : state?.__studioMobileBackSession === receipt.session && state.__studioMobileBackDepth === depth;
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
  options?: {
    readonly onBeforeGenuineLeave?: () => void;
    readonly handoffScope?: object;
    readonly handoffOwner?: object;
  },
): StudioMobileHistorySyncController {
  let sessionToken = `studio-mobile-back-${Math.random().toString(36).slice(2, 10)}`;
  const initialPathname = historyAdapter.getPathname();
  const handoffScope = options?.handoffScope;
  let currentLayers: readonly StudioMobilePanelLayer[] = [];
  let pushedDepth = 0;
  let guardedEntry: Omit<StudioMobileGuardReceipt, "session" | "depth"> | null = null;
  let pendingPopTargetDepth: number | null = null;
  let rewind: StudioMobileGuardRewind | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let rewindSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const getEntry = () => historyAdapter.getState() as StudioMobileHistoryEntry | null;
  const matchesCurrent = (receipt: StudioMobileGuardReceipt, depth = receipt.depth) =>
    matchesStudioMobileGuard(receipt, historyAdapter.getHref(), getEntry(), depth);

  const clearPendingTimer = () => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const clearRewind = () => {
    if (rewindSafetyTimer !== null) {
      clearTimeout(rewindSafetyTimer);
      rewindSafetyTimer = null;
    }
    rewind = null;
  };

  const waitForRewind = (next: StudioMobileGuardRewind) => {
    clearRewind();
    rewind = next;
    rewindSafetyTimer = setTimeout(clearRewind, 250);
  };

  const startRewind = (from: StudioMobileGuardReceipt, to: number, retired: boolean) => {
    // 같은 키와 주소여도 실제 상단 가드가 다르면 새 창을 자동으로 이탈하지 않는다.
    if (!matchesCurrent(from)) return false;
    waitForRewind({ from, to, retired });
    historyAdapter.go(to - from.depth);
    return true;
  };

  const acceptHandoff = (): boolean => {
    if (!handoffScope || pushedDepth > 0 || rewind) return false;
    const released = releasedStudioMobileGuards.get(handoffScope);
    if (!released) return false;
    releasedStudioMobileGuards.delete(handoffScope);
    const { owner, receipt, rewind: pending } = released;
    if (!matchesCurrent(receipt) && !(pending && matchesCurrent(receipt, pending.to))) return false;

    // 같은 React 소유자의 effect 재설정은 깊이만 재사용한다. 콜백은 새로 계산한다.
    const sameOwner = !pending?.retired && owner !== undefined && owner === options?.handoffOwner;
    if (sameOwner) {
      sessionToken = receipt.session;
      guardedEntry = { href: receipt.href, key: receipt.key, idx: receipt.idx };
      pushedDepth = pending?.to ?? receipt.depth;
    }
    if (pending) {
      waitForRewind({ ...pending, retired: !sameOwner });
      return true;
    }
    return !sameOwner && startRewind(receipt, 0, true);
  };

  const controller: StudioMobileHistorySyncController = {
    syncLayers(layers) {
      if (disposed) return;
      currentLayers = layers;
      if (historyAdapter.getPathname() !== initialPathname || acceptHandoff() || rewind) return;

      // 같은 원고에서도 워크스페이스 이동은 실제 라우터 항목이다. 이전 모달 가드로 되감지 않는다.
      const state = getEntry();
      if (pushedDepth > 0 && state?.__studioMobileBackSession !== sessionToken && pendingPopTargetDepth === null) {
        // popstate 전달 전에 React가 같은 원고로 다시 그려도 닫히는 가드를 중복으로 쌓지 않는다.
        if (guardedEntry?.href === historyAdapter.getHref() && state?.key === guardedEntry.key && state?.idx === guardedEntry.idx) return;
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
        const href = historyAdapter.getHref();
        guardedEntry = { href, key: state?.key, idx: state?.idx };
        while (pushedDepth < desiredDepth) {
          pushedDepth += 1;
          historyAdapter.pushState(
            {
              ...state,
              __studioMobileBackSession: sessionToken,
              __studioMobileBackDepth: pushedDepth,
              __studioMobileBackLayer: layers[pushedDepth - 1]?.id,
            },
            href,
          );
        }
      } else if (desiredDepth < pushedDepth && guardedEntry) {
        const receipt = { ...guardedEntry, session: sessionToken, depth: pushedDepth };
        pushedDepth = desiredDepth;
        startRewind(receipt, desiredDepth, false);
      }
    },

    handlePopState(event) {
      if (disposed) return false;
      if (rewind) {
        const { from, to, retired } = rewind;
        clearRewind();
        const href = historyAdapter.getHref();
        if (matchesStudioMobileGuard(from, href, event.state as StudioMobileHistoryEntry | null, to)
          && matchesCurrent(from, to)) {
          event.stopImmediatePropagation();
          if (!(retired && to > 0 && startRewind({ ...from, depth: to }, 0, true))) controller.syncLayers(currentLayers);
          return true;
        }
        // 새 라우터 항목에 도착한 popstate는 이전 소유자 정리와 무관하다.
        pushedDepth = 0;
        options?.onBeforeGenuineLeave?.();
        return false;
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
      if (disposed) return;
      disposed = true;
      // 브라우저를 이동하지 않고 검증된 가드 정보만 넘긴다. 이전 원고의 닫기·초점 함수는 보관하지 않는다.
      const receipt = rewind?.from ?? (guardedEntry && pushedDepth > 0
        ? { ...guardedEntry, session: sessionToken, depth: pushedDepth }
        : null);
      if (handoffScope && receipt && (matchesCurrent(receipt) || (rewind && matchesCurrent(receipt, rewind.to)))) {
        releasedStudioMobileGuards.set(handoffScope, { owner: options?.handoffOwner, receipt, rewind });
      }
      clearPendingTimer();
      clearRewind();
      currentLayers = [];
      pushedDepth = 0;
      pendingPopTargetDepth = null;
    },
  };
  return controller;
}
