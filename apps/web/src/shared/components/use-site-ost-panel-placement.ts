import { useLayoutEffect, type RefObject } from "react";

import { OVERLAY_CLEARANCE_PROPERTY } from "@/shared/lib/overlay-clearance";

const PANEL_GAP = 12;

/** 실제 배너 하단과 OST 하단 앵커 사이에 패널을 배치하고 남은 높이만 사용한다. */
export function claimSiteOstPanelPlacement(panel: HTMLElement, dock: HTMLElement | null): () => void {
  const document = panel.ownerDocument;
  const view = document.defaultView;
  if (!view) return () => undefined;
  const originalTop = panel.style.top;
  const originalMaxHeight = panel.style.maxHeight;
  const update = () => {
    if (view.innerWidth >= 640) {
      panel.style.top = originalTop;
      panel.style.maxHeight = originalMaxHeight;
      return;
    }
    const bounds = panel.getBoundingClientRect();
    if (bounds.height <= 0) return;
    let top = 0;
    for (const banner of document.querySelectorAll<HTMLElement>("[data-service-degraded-banner]")) {
      observer?.observe(banner);
      const rectangle = banner.getBoundingClientRect();
      if (view.getComputedStyle(banner).position !== "fixed" && rectangle.height > 0 && rectangle.bottom > 0) {
        top = Math.max(top, rectangle.bottom);
      }
    }
    if (dock) {
      const anchor = dock.closest("header") ?? dock;
      observer?.observe(anchor);
      top = Math.max(top, anchor.getBoundingClientRect().bottom);
    }
    top = Math.ceil(top) + PANEL_GAP;
    const bottomClearance = Number.parseFloat(view.getComputedStyle(document.documentElement).getPropertyValue(OVERLAY_CLEARANCE_PROPERTY)) || 0;
    const viewportBottom = view.innerHeight - bottomClearance - PANEL_GAP;
    const bottom = dock ? viewportBottom : Math.min(bounds.bottom, viewportBottom);
    const maxHeight = `${Math.max(0, Math.floor(bottom - top))}px`;
    if (panel.style.maxHeight !== maxHeight) panel.style.maxHeight = maxHeight;
    if (dock) {
      const nextTop = `${top}px`;
      if (panel.style.top !== nextTop) panel.style.top = nextTop;
    }
  };
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  observer?.observe(panel);
  const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(update);
  mutation?.observe(document.body, { childList: true, subtree: true });
  mutation?.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  view.addEventListener("resize", update);
  view.addEventListener("scroll", update, true);
  view.visualViewport?.addEventListener("resize", update);
  view.visualViewport?.addEventListener("scroll", update);
  update();
  return () => {
    observer?.disconnect();
    mutation?.disconnect();
    view.removeEventListener("resize", update);
    view.removeEventListener("scroll", update, true);
    view.visualViewport?.removeEventListener("resize", update);
    view.visualViewport?.removeEventListener("scroll", update);
    panel.style.top = originalTop;
    panel.style.maxHeight = originalMaxHeight;
  };
}

export function useSiteOstPanelPlacement(
  panelRef: RefObject<HTMLElement | null>,
  expanded: boolean,
  dock: HTMLElement | null,
): void {
  useLayoutEffect(() => {
    if (!expanded || !panelRef.current) return;
    return claimSiteOstPanelPlacement(panelRef.current, dock);
  }, [panelRef, expanded, dock]);
}
