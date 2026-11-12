import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { resolveStudioTouchTapAction, type StudioTouchTapPreferences } from "./studio-touch-gesture-policy";

function closeDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

/** 자동 안내 대신 사용자가 요청할 때 현재 손가락 설정을 설명한다. */
export function StudioDrawingClarityMobileHelp({ touch, onClose, onTutorial }: {
  readonly touch: StudioTouchTapPreferences;
  readonly onClose: () => void;
  readonly onTutorial: () => void;
}) {
  const bt = useBilingual("studio.drawingClarity"), ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") { dialog.showModal(); dialog.setAttribute("aria-modal", "true"); }
    else { dialog.setAttribute("open", ""); dialog.setAttribute("aria-modal", "false"); }
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    return () => closeDialog(dialog);
  }, []);
  const finish = (action: () => void) => { closeDialog(ref.current); action(); };
  const three = resolveStudioTouchTapAction(3, touch);
  return <dialog ref={ref} className="studio-drawing-clarity-mobile-help" aria-labelledby="studio-clarity-mobile-help-title"
    onCancel={(event) => { event.preventDefault(); finish(onClose); }} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(onClose); }
    }}>
    <header><h2 id="studio-clarity-mobile-help-title">{bt("그리기·손가락 안내", "Drawing and touch guide")}</h2><button type="button" className="studio-drawing-clarity-button" onClick={() => finish(onClose)} aria-label={bt("그리기 안내 닫기", "Close drawing guide")}><X size={18} aria-hidden /></button></header>
    <p>{bt("아래의 펜을 고르고 캔버스에 그려요. 펜을 다시 누르면 굵기와 브러시 설정을 바꿀 수 있어요.", "Choose Pen below and draw on the canvas. Tap Pen again to change the brush and its size.")}</p>
    <p>{touch.twoFinger === "pan-zoom" ? bt("두 손가락으로 캔버스를 이동·확대해요.", "Use two fingers to pan and zoom the canvas.") : bt("두 손가락을 짧게 탭하면 실행 취소해요.", "Tap briefly with two fingers to undo.")}</p>
    {three === "undo" ? <p>{bt("세 손가락을 짧게 탭하면 실행 취소해요.", "Tap briefly with three fingers to undo.")}</p> : three === "toggle-ui" ? <p>{bt("세 손가락 탭으로 도구막대를 숨기거나 표시해요.", "Tap with three fingers to hide or show the tools.")}</p> : null}
    <p>{bt("네 손가락 탭으로 도구막대를 숨기거나 표시해요.", "Tap with four fingers to hide or show the tools.")}</p>
    <button type="button" className="studio-drawing-clarity-button w-full" onClick={() => finish(onTutorial)}>{bt("사용법 따라 하기", "Open guided tour")}</button>
  </dialog>;
}
