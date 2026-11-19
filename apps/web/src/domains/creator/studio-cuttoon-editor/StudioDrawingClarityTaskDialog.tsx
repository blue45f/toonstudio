import { ArrowLeft } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { registerModalStatusSlot } from "@/shared/lib/modal-status-slot";

export type FinishStudioDrawingTask = (next?: () => void, opensWorkspace?: boolean) => void;

function closeDrawingTaskDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog?.open) return;
  if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
}

/** 도구 선택 동안 배경 입력을 막고, 닫은 뒤 실제 진입점으로 돌아가는 목적별 화면이다. */
export function StudioDrawingClarityTaskDialog({ id, title, kind = "tools", returnFocus, onClose, children }: {
  readonly id: string;
  readonly title: string;
  readonly kind?: string;
  readonly returnFocus: () => HTMLElement | null;
  readonly onClose: () => void;
  readonly children: (finish: FinishStudioDrawingTask) => ReactNode;
}) {
  const bt = useBilingual("studio.drawingClarity"), titleId = useId();
  const ref = useRef<HTMLDialogElement>(null), statusRef = useRef<HTMLDivElement>(null);
  const finished = useRef(false);
  const pendingWorkspace = useRef<(() => void) | null>(null);
  const finish: FinishStudioDrawingTask = (next, opensWorkspace) => {
    if (finished.current) return;
    // 작업 시트의 뒤로 가기를 먼저 마쳐야 그 직후 열린 3D 라우트가 같은 pop에 닫히지 않는다.
    if (next && opensWorkspace && window.history.state?.__studioMobileBackLayer === `modal:drawing-task:${kind}`) {
      if (!pendingWorkspace.current) {
        pendingWorkspace.current = next;
        window.history.back();
      }
      return;
    }
    const action = pendingWorkspace.current ?? next;
    pendingWorkspace.current = null;
    finished.current = true;
    const target = returnFocus();
    closeDrawingTaskDialog(ref.current); onClose();
    if (action) action(); else if (target?.isConnected) target.focus({ preventScroll: true });
  };
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    finished.current = false;
    if (typeof dialog.showModal === "function") { dialog.showModal(); dialog.setAttribute("aria-modal", "true"); }
    else { dialog.setAttribute("open", ""); dialog.setAttribute("aria-modal", "false"); }
    dialog.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const unregister = statusRef.current ? registerModalStatusSlot(statusRef.current) : undefined;
    return () => { finished.current = true; pendingWorkspace.current = null; unregister?.(); closeDrawingTaskDialog(dialog); };
  }, []);
  return <dialog ref={ref} id={id} className="studio-drawing-dialog studio-drawing-task-dialog" data-studio-drawing-task={kind}
    aria-labelledby={titleId} data-studio-shortcut-boundary="true" onCancel={(event) => { event.preventDefault(); finish(); }}
    onClose={(event) => { if (!event.currentTarget.open && !finished.current) finish(); }} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); finish();
    }}>
    <header className="studio-drawing-dialog-header"><button type="button" className="studio-drawing-clarity-button"
      aria-label={bt("그리기로 돌아가기", "Return to drawing")} onClick={() => finish()}><ArrowLeft size={20} aria-hidden /></button><h2 id={titleId}>{title}</h2></header>
    <div ref={statusRef} className="studio-drawing-task-service" />
    <div className="studio-drawing-dialog-content" data-studio-shortcut-boundary="true">{children(finish)}</div>
  </dialog>;
}
