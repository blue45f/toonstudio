import { MoreHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioChromePortalTarget } from "../studio-shell/use-studio-chrome-portal-target";
import { StudioDrawingClarityTaskDialog } from "./StudioDrawingClarityTaskDialog";
import { StudioDrawingClarityTaskActions } from "./StudioDrawingClarityTaskActions";

export interface StudioDrawingClarityAction {
  readonly id: string;
  readonly label: string;
  readonly run: (trigger: HTMLElement) => void;
}

/** 화면 크기가 달라져도 같은 이름과 실제 명령을 가진 더보기 하나를 유지한다. */
export function StudioDrawingClarityMore({ id, hostId, purpose, actions, triggerRef, panel, presentation = "menu" }: {
  readonly id: string;
  readonly hostId: string;
  readonly purpose: string;
  readonly actions: readonly StudioDrawingClarityAction[];
  readonly triggerRef?: RefObject<HTMLElement | null>;
  readonly panel?: string | null;
  readonly presentation?: "menu" | "tasks";
}) {
  const bt = useBilingual("studio.drawingClarity"), host = useStudioChromePortalTarget(hostId);
  const ownTrigger = useRef<HTMLElement>(null), trigger = triggerRef ?? ownTrigger;
  const details = useRef<HTMLDetailsElement>(null), menuRoot = useRef<HTMLDivElement>(null), ownedFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const caption = bt("더보기", "More");
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const task = presentation === "tasks" ? document.getElementById(id) : null;
      if (event.target instanceof Node && !details.current?.contains(event.target) && !menuRoot.current?.contains(event.target) && !task?.contains(event.target)) { ownedFocus.current = false; setOpen(false); }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [id, presentation]);
  useLayoutEffect(() => {
    if (ownedFocus.current) trigger.current?.focus({ preventScroll: true });
  }, [host, trigger]);
  useLayoutEffect(() => {
    const node = details.current;
    const floating = menuRoot.current;
    if (!node) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Tab" && event.currentTarget === floating) {
        const buttons = floating?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        if (event.shiftKey && event.target === buttons[0]) { event.preventDefault(); trigger.current?.focus(); }
        else if (!event.shiftKey && event.target === buttons[buttons.length - 1]) { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
        return;
      }
      if (event.key !== "Escape" || !node.open) return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true });
    };
    node.addEventListener("keydown", escape);
    floating?.addEventListener("keydown", escape);
    return () => {
      node.removeEventListener("keydown", escape);
      floating?.removeEventListener("keydown", escape);
    };
  }, [host, open, trigger]);
  useLayoutEffect(() => {
    const floating = menuRoot.current;
    if (presentation === "tasks" || !open || !floating) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const mobile = innerWidth < 1024;
      const width = Math.min(mobile ? 300 : 260, innerWidth - 20);
      const above = mobile || innerHeight - anchor.bottom < Math.min(anchor.top, 400);
      Object.assign(floating.style, {
        width: `${width}px`,
        left: `${Math.max(10, Math.min(anchor.right - width, innerWidth - width - 10))}px`,
        top: above ? "auto" : `${anchor.bottom + 8}px`,
        bottom: above ? `${Math.max(10, innerHeight - anchor.top + 10)}px` : "auto",
        maxHeight: `${Math.max(48, Math.min(480, above ? anchor.top - 20 : innerHeight - anchor.bottom - 20))}px`,
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [host, open, presentation, trigger]);
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
    onBlurCapture={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !menuRoot.current?.contains(event.relatedTarget) && !document.getElementById(id)?.contains(event.relatedTarget)) ownedFocus.current = false; }}>
    <summary ref={trigger} data-studio-clarity-more-trigger="true" data-studio-clarity-export-trigger="true" data-studio-clarity-open={panel ?? undefined}
      aria-expanded={open} aria-controls={id} aria-haspopup={presentation === "tasks" ? "dialog" : undefined} aria-label={`${caption} · ${purpose}`}
      onClick={(event) => { event.preventDefault(); setOpen((value) => !value); }}
      onKeyDown={(event) => {
        if (open && event.key === "Tab" && !event.shiftKey) {
          event.preventDefault();
          menuRoot.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}>
      <MoreHorizontal size={21} aria-hidden /><span>{caption}</span>
    </summary>
    {open && presentation === "menu" && typeof document !== "undefined" ? createPortal(<div ref={menuRoot} id={id} data-studio-shortcut-boundary="true" className="studio-drawing-clarity-menu">
      {actions.map((action) => <button key={action.id} type="button" data-studio-clarity-action={action.id}
        onClick={(event) => { const source = trigger.current ?? event.currentTarget; close(); action.run(source); }}>{action.label}</button>)}
    </div>, document.body) : <div id={presentation === "tasks" && open ? undefined : id} hidden />}
  </details>;
  return <>{host ? createPortal(menu, host) : menu}
    {open && presentation === "tasks" && typeof document !== "undefined" ? createPortal(<StudioDrawingClarityTaskDialog id={id}
      title={bt("원고 도구", "Draft tools")} kind="tools" returnFocus={() => trigger.current} onClose={() => setOpen(false)}>
      {(finish) => <StudioDrawingClarityTaskActions actions={actions} run={(action) => {
        const source = trigger.current;
        if (source) finish(() => action.run(source));
      }} />}
    </StudioDrawingClarityTaskDialog>, document.body) : null}
  </>;
}
