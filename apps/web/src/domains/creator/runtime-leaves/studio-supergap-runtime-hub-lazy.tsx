/**
 * `/studio` 초격차 런타임 엔진 허브의 지연 마운트 호스트.
 *
 * 사용자가 `엔진 허브` 버튼을 클릭하기 전까지는 `StudioSupergapStatusDrawer`와
 * Wave 54~70 런타임 청크를 진입 그래프에서 완전히 분리한다.
 */
import { Suspense, lazy, useEffect, useState, type ReactElement } from "react";

import {
  closeStudioSupergapRuntimeHub,
  isStudioSupergapRuntimeHubOpen,
  subscribeStudioSupergapRuntimeHubOpen,
} from "./studio-supergap-runtime-hub-lazy-bridge";

const LazyStudioSupergapFullDrawer = lazy(() =>
  import("../studio-supergap-runtime-hub").then((mod) => {
    const sharedHub = mod.createFullStudioSupergapRuntimeHub();
    function BoundStudioSupergapDrawer({ onClose }: { readonly onClose: () => void }): ReactElement {
      return (
        <mod.StudioSupergapStatusDrawer
          hub={sharedHub}
          autoBootstrap
          defaultExpanded={false}
          onClose={onClose}
          className="shadow-xl"
        />
      );
    }
    return { default: BoundStudioSupergapDrawer };
  }),
);

export function StudioSupergapRuntimeHubLazyHost(): ReactElement | null {
  const [open, setOpen] = useState<boolean>(() => isStudioSupergapRuntimeHubOpen());

  useEffect(() => subscribeStudioSupergapRuntimeHubOpen(setOpen), []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeStudioSupergapRuntimeHub();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      data-studio-supergap-hub-overlay="true"
      className="pointer-events-auto fixed right-4 bottom-4 z-40 max-h-[82vh] w-[min(92vw,32rem)] overflow-y-auto overscroll-contain rounded-2xl"
    >
      <Suspense fallback={null}>
        <LazyStudioSupergapFullDrawer onClose={closeStudioSupergapRuntimeHub} />
      </Suspense>
    </div>
  );
}
