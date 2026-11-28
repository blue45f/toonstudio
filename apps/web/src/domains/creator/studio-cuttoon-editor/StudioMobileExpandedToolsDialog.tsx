import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

const loader = createStudioIntentLazyLoader(() => import("./StudioExpandedToolsDrawer"));
type DrawerComponent = typeof import("./StudioExpandedToolsDrawer").StudioExpandedToolsDrawer;

function closeNativeDialog(dialog: HTMLDialogElement): void {
  if (!dialog.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export function StudioMobileExpandedToolsDialog({ projectId, onClose }: {
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const bt = useBilingual("StudioMobileExpandedToolsDialog");
  const scopeLabelId = useId();
  const [state, setState] = useState<{ phase: "load" | "retry" } | { phase: "ready"; Drawer: DrawerComponent }>({ phase: "load" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadingTitleRef = useRef<HTMLHeadingElement>(null);
  const closed = useRef(false);
  useEffect(() => {
    if (state.phase !== "load") return;
    let active = true;
    void loader.load().then(
      ({ StudioExpandedToolsDrawer: Drawer }) => { if (active) setState({ phase: "ready", Drawer }); },
      () => { if (active) setState({ phase: "retry" }); },
    );
    return () => { active = false; };
  }, [state.phase]);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      dialog.setAttribute("aria-modal", "true");
    } else {
      dialog.setAttribute("open", "");
      dialog.setAttribute("aria-modal", "false");
    }
    loadingTitleRef.current?.focus({ preventScroll: true });
    return () => closeNativeDialog(dialog);
  }, []);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || state.phase !== "ready" || dialog.contains(dialog.ownerDocument.activeElement)) return;
    dialog.querySelector<HTMLButtonElement>('[data-testid="expanded-tools-close"]')?.focus({ preventScroll: true });
  }, [state.phase]);

  const dismiss = () => {
    if (closed.current) return;
    closed.current = true;
    if (dialogRef.current) closeNativeDialog(dialogRef.current);
    onClose();
  };
  const title = bt("확장 전문 도구", "Expanded tools");

  return createPortal(
    <dialog
      ref={dialogRef}
      data-studio-mobile-expanded-tools="true"
      data-studio-drawing-task="expanded-tools"
      data-studio-shortcut-boundary="true"
      aria-label={title}
      aria-describedby={state.phase === "ready" ? scopeLabelId : undefined}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onClose={(event) => { if (!event.currentTarget.open) dismiss(); }}
      onKeyDown={(event) => {
        if (state.phase !== "ready" && event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-canvas p-0 text-fg [padding-top:env(safe-area-inset-top)] [padding-bottom:env(safe-area-inset-bottom)]"
    >
      {state.phase === "ready" ? (
        <div className="flex h-full min-h-0 flex-col">
          <p id={scopeLabelId} className="shrink-0 border-b border-line bg-panel px-3 py-1 text-xs text-fg-2">
            {bt("로컬 도구 실습", "Local tool workspace")}
          </p>
          <state.Drawer open embeddedInModal projectId={projectId} onClose={dismiss} className="h-auto min-h-0 max-w-none flex-1 border-l-0" />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-panel p-3">
            <h2 ref={loadingTitleRef} tabIndex={-1} className="text-sm font-semibold">{title}</h2>
            <button type="button" onClick={dismiss}
              aria-label={bt("확장 전문 도구 서랍 닫기", "Close expanded tools")}
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-line focus-visible:ring-2 focus-visible:ring-accent">
              <X size={18} aria-hidden />
            </button>
          </header>
          <div className="space-y-3 p-4 text-sm">
            {state.phase === "retry" ? <>
              <p role="alert">{bt("확장 전문 도구를 열지 못했습니다.", "Expanded tools could not be opened.")}</p>
              <button type="button" className="min-h-11 rounded-lg border border-line px-3 focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => setState({ phase: "load" })}>{bt("다시 시도", "Try again")}</button>
            </> : <p role="status">{bt("확장 전문 도구를 여는 중…", "Opening expanded tools…")}</p>}
          </div>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
