/**
 * `/studio` 초격차 런타임 엔진 허브의 지연 마운트 호스트.
 *
 * 사용자가 `엔진 허브` 버튼을 클릭하기 전까지는 `StudioSupergapStatusDrawer`와
 * Wave 54~70 런타임 청크를 진입 그래프에서 완전히 분리한다.
 */
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { announceStudioRenderFailure } from "@/shared/lib/render-failure-event";

import {
  closeStudioSupergapRuntimeHub,
  isStudioSupergapRuntimeHubOpen,
  STUDIO_SUPERGAP_RUNTIME_HUB_PANEL_ID,
  subscribeStudioSupergapRuntimeHubOpen,
} from "./studio-supergap-runtime-hub-lazy-bridge";

async function createDefaultDrawer() {
  const { createFullStudioSupergapRuntimeHub, StudioSupergapStatusDrawer } = await import("../studio-supergap-runtime-hub");
  const hub = createFullStudioSupergapRuntimeHub();
  function BoundStudioSupergapDrawer({ onClose }: { readonly onClose: () => void }): ReactElement {
    return (
      <StudioSupergapStatusDrawer hub={hub} autoBootstrap onClose={onClose} className="shadow-xl" />
    );
  }
  return { default: BoundStudioSupergapDrawer };
}

let defaultDrawerPromise: ReturnType<typeof createDefaultDrawer> | undefined;

function loadDefaultDrawer() {
  defaultDrawerPromise ??= createDefaultDrawer().catch((error: unknown) => {
    defaultDrawerPromise = undefined;
    throw error;
  });
  return defaultDrawerPromise;
}

class EngineStatusBoundary extends Component<{ readonly children: ReactNode; readonly fallback: ReactNode }> {
  override state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  override componentDidCatch(): void {
    // The engine panel is optional. Keep the current manuscript alive and report only the surface.
    announceStudioRenderFailure({
      surface: "studio-engine-status",
      error: new Error("Optional studio engine status unavailable"),
      componentStack: null,
    });
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function StudioSupergapRuntimeHubLazyHost({
  loadDrawer = loadDefaultDrawer,
}: { readonly loadDrawer?: typeof loadDefaultDrawer } = {}): ReactElement | null {
  const [open, setOpen] = useState<boolean>(() => isStudioSupergapRuntimeHubOpen());
  const [{ LazyDrawer, attempt }, setLoadAttempt] = useState(() => ({ LazyDrawer: lazy(loadDrawer), attempt: 0 }));
  const panelRef = useRef<HTMLDivElement>(null);
  const bt = useBilingual("studio.engineStatus");

  useEffect(() => subscribeStudioSupergapRuntimeHubOpen(setOpen), []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      closeStudioSupergapRuntimeHub();
    };
    panel.addEventListener("keydown", closeOnEscape);
    return () => panel.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (!open) return null;

  const retry = () => {
    panelRef.current?.focus({ preventScroll: true });
    // React.lazy retains a rejected promise. A new identity lets an explicit retry try the import again.
    setLoadAttempt(({ attempt: previous }) => ({ LazyDrawer: lazy(loadDrawer), attempt: previous + 1 }));
  };
  const panelButton = "min-h-11 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-fg hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div
      ref={panelRef}
      id={STUDIO_SUPERGAP_RUNTIME_HUB_PANEL_ID}
      role="group"
      aria-label={bt("편집기 엔진 상태", "Editor engine status")}
      tabIndex={-1}
      data-studio-supergap-hub-overlay="true"
      data-studio-shortcut-boundary="true"
      className="pointer-events-auto fixed right-[max(0.5rem,env(safe-area-inset-right))] bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 max-h-[60dvh] w-[min(92vw,32rem)] overflow-y-auto overscroll-contain rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:max-h-[76dvh]"
    >
      <EngineStatusBoundary key={attempt} fallback={
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-4 text-fg shadow-xl">
          <div role="alert">
            <h2 className="text-sm font-bold">{bt("엔진 상태를 불러오지 못했습니다", "Could not load engine status")}</h2>
            <p className="mt-1 text-xs text-fg-2">
              {bt("연결을 확인하고 다시 시도하거나 원고 작업을 계속할 수 있어요.", "Check your connection and retry, or continue editing your manuscript.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={panelButton} onClick={retry}>{bt("다시 시도", "Try again")}</button>
            <button type="button" className={panelButton} onClick={closeStudioSupergapRuntimeHub}>{bt("엔진 상태 닫기", "Close engine status")}</button>
          </div>
        </div>
      }>
        <Suspense fallback={
          <p role="status" className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-fg shadow-xl">
            {bt("엔진 상태를 불러오는 중…", "Loading engine status…")}
          </p>
        }>
          <LazyDrawer onClose={closeStudioSupergapRuntimeHub} />
        </Suspense>
      </EngineStatusBoundary>
    </div>
  );
}
