import { MoreHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioChromePortalTarget } from "../studio-shell/use-studio-chrome-portal-target";

export interface StudioDrawingClarityAction {
  readonly id: string;
  readonly label: string;
  readonly run: (trigger: HTMLElement) => void;
}

/** 화면 크기가 달라져도 같은 이름과 실제 명령을 가진 더보기 하나를 유지한다. */
export function StudioDrawingClarityMore({ id, hostId, purpose, actions, triggerRef, panel }: {
  readonly id: string;
  readonly hostId: string;
  readonly purpose: string;
  readonly actions: readonly StudioDrawingClarityAction[];
  readonly triggerRef?: RefObject<HTMLElement | null>;
  readonly panel?: string | null;
}) {
  const bt = useBilingual("studio.drawingClarity"), host = useStudioChromePortalTarget(hostId);
  const ownTrigger = useRef<HTMLElement>(null), trigger = triggerRef ?? ownTrigger;
  const details = useRef<HTMLDetailsElement>(null), ownedFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const caption = bt("더보기", "More");
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !details.current?.contains(event.target)) { ownedFocus.current = false; setOpen(false); }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useLayoutEffect(() => {
    if (ownedFocus.current) trigger.current?.focus({ preventScroll: true });
  }, [host, trigger]);
  useLayoutEffect(() => {
    const node = details.current;
    if (!node) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !node.open) return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true });
    };
    node.addEventListener("keydown", escape);
    return () => node.removeEventListener("keydown", escape);
  }, [host, trigger]);
  useLayoutEffect(() => () => {
    if (!ownedFocus.current) return;
    const editor = details.current?.closest('[data-studio-editor="true"]');
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      editor?.querySelector<HTMLElement>('[data-studio-clarity-more-trigger="true"], [data-studio-clarity-entry="true"]')?.focus({ preventScroll: true });
    });
  }, []);
  const menu = <details ref={details} open={open} className="studio-drawing-clarity-more" data-studio-clarity-more="true"
    onToggle={(event) => setOpen(event.currentTarget.open)}
    onFocusCapture={() => { ownedFocus.current = true; }}
    onBlurCapture={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) ownedFocus.current = false; }}>
    <summary ref={trigger} data-studio-clarity-more-trigger="true" data-studio-clarity-export-trigger="true" data-studio-clarity-open={panel ?? undefined}
      aria-expanded={open} aria-controls={id} aria-label={`${caption} · ${purpose}`}
      onClick={(event) => { event.preventDefault(); setOpen((value) => !value); }}>
      <MoreHorizontal size={21} aria-hidden /><span>{caption}</span>
    </summary>
    <div id={id} hidden={!open} className="studio-drawing-clarity-menu">
      {actions.map((action) => <button key={action.id} type="button" data-studio-clarity-action={action.id}
        onClick={(event) => { const source = trigger.current ?? event.currentTarget; close(); action.run(source); }}>{action.label}</button>)}
    </div>
  </details>;
  return host ? createPortal(menu, host) : menu;
}
