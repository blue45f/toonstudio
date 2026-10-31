import { X } from "lucide-react";


import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
} from "./studio-panel-ui";
import { StudioQuickAccessPalette } from "./StudioQuickAccessPalette";

import type { StudioQuickAccessSurfaceLeafProps } from "./studio-quick-access-surface-types";
import type { PointerEvent as ReactPointerEvent } from "react";

import { cn } from "@/shared/lib/utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** Bounded modal presentation retained for touch viewports. */
export function StudioQuickAccessMobileSurface({
  state,
  catalog,
  descriptionId,
  surfaceRef,
  onStateChange,
  onExecute,
  onClose,
}: StudioQuickAccessSurfaceLeafProps) {
  const bt = useBilingual("StudioQuickAccessMobileSurface");
  return (
    <>
      <button
        type="button"
        aria-label={bt("빠른 액세스 닫기", "Close Quick Access")}
        tabIndex={-1}
        className="pointer-events-auto absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
        onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
          event.preventDefault();
          onClose();
        }}
        // 키보드·보조기술의 click은 pointerdown 없이 올 수 있다. 포인터 click은 중복 처리하지 않는다.
        onClick={(event) => { if (event.detail === 0) onClose(); }}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label={bt("빠른 액세스 팔레트", "Quick Access palette")}
        aria-describedby={descriptionId}
        data-studio-quick-access-surface="true"
        data-studio-shortcut-boundary="true"
        data-mobile="true"
        tabIndex={-1}
        className={cn(
          "pointer-events-auto absolute min-h-0 text-fg",
          "inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))]",
          "h-[min(78dvh,44rem)] max-h-[calc(100dvh-4rem)] min-h-[14rem]",
        )}
      >
        <p id={descriptionId} className="sr-only">
          {bt("자주 쓰는 명령을 실행하거나 표시 방식과 명령 순서를 편집합니다.", "Run frequent commands or edit their order and display.")}
        </p>
        <button
          type="button"
          aria-label={bt("빠른 액세스 팔레트 닫기", "Close Quick Access palette")}
          title={bt("도구를 닫고 작업으로 돌아가기", "Close tools and return to your work")}
          className={cn(
            "absolute -top-11 right-0 z-10 inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fg-2 shadow-lg hover:bg-raised hover:text-fg",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={onClose}
        >
          <X size={17} aria-hidden />
          <span>{bt("닫기", "Close")}</span>
        </button>
        <StudioQuickAccessPalette
          state={state}
          catalog={catalog}
          onStateChange={onStateChange}
          onExecute={onExecute}
          className="h-full min-h-0 shadow-2xl"
        />
      </div>
    </>
  );
}
