import { useEffect, useId, useRef } from "react";

import type { ReactNode } from "react";

export function AiOperationsDialog({ title, description, onClose, children, visible = true }: { title: string; description: string; onClose: () => void; children: ReactNode; visible?: boolean }) {
  const titleId = useId(); const descriptionId = useId();
  const node = useRef<HTMLDivElement>(null); const closeButton = useRef<HTMLButtonElement>(null); const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement; const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; closeButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(node.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]") ?? []).filter((element) => !element.matches(":disabled") && element.tabIndex >= 0 && !element.closest("[hidden]"));
      const first = controls[0]; const last = controls.at(-1);
      if (!node.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [visible]);
  if (!visible) return null;
  return <div className="ai-ops-overlay"><div className="ai-ops-dialog" ref={node} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <header><div><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button type="button" ref={closeButton} onClick={onClose} aria-label="대화상자 닫기">닫기</button></header>{children}
  </div></div>;
}
