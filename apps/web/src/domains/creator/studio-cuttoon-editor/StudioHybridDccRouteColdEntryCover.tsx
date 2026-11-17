import { ArrowLeft, Boxes } from "lucide-react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioHybridDccRouteColdEntryCoverProps {
  readonly label: string;
  readonly detail: string;
  readonly onClose: () => void;
}

/**
 * Synchronous cold-entry cover rendered while `LazyStudioHybridDccRouteGate` chunk downloads,
 * preventing the underlying 2D `StudioCuttoonEditorHost` from flashing uncovered on `/studio/3d/dcc/*`.
 * Lives inside `studio-cuttoon-editor/` so `creator/hybrid-dcc` static reachability stays unchanged.
 */
export function StudioHybridDccRouteColdEntryCover({
  label,
  detail,
  onClose,
}: StudioHybridDccRouteColdEntryCoverProps) {
  const bt = useBilingual("StudioHybridDccRouteGate");
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-stretch justify-stretch bg-panel text-fg"
      data-studio-hybrid-dcc-cold-cover="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={bt("정밀 3D 모델링", "Precision 3D Modeling")}
        data-studio-shortcut-boundary="true"
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-panel"
      >
        <header className="flex min-h-14 items-center gap-2 border-b border-line bg-panel px-2 py-2 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={bt("캔버스로 돌아가기", "Back to canvas")}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            <span className="hidden sm:inline">{bt("캔버스", "Canvas")}</span>
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <Boxes size={16} className="shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate text-sm font-bold text-fg">
              {bt("정밀 3D 모델링", "Precision 3D Modeling")}
            </span>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 place-items-center bg-canvas/35 p-4">
          <div
            className="mx-auto max-w-xl rounded-2xl border border-line bg-panel px-5 py-4 text-center shadow-xl"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-semibold text-fg [word-break:keep-all]">{label}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">{detail}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
