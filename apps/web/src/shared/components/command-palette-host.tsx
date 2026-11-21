import { lazy, Suspense, useEffect } from "react";
import {
  requestStudioCommandSearchFromAppShell,
  studioCommandSearchBridgeListenerCount,
} from "@/shared/lib/studio-command-search-bridge";
import { useUi } from "@/shared/lib/ui-store";

const CommandPalette = lazy(() => import("./command-palette").then((mod) => ({ default: mod.CommandPalette })));

function isStudioPathname(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function CommandPaletteHost() {
  const open = useUi((s) => s.commandPaletteOpen);
  const toggle = useUi((s) => s.toggleCommandPalette);
  const setOpen = useUi((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 1. Cmd+K / Ctrl+K: use Studio's registry-backed command hub while editing.
      // Shift+Cmd/Ctrl+K is reserved for GlobalAssetSearchPalette so the two dialogs never collide.
      // If the Studio host is not mounted yet, retain the global palette as a reliable fallback.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isStudioPathname(window.location.pathname) && requestStudioCommandSearchFromAppShell({ scope: "all" })) {
          setOpen(false);
          return;
        }
        toggle();
        return;
      }

      // 2. F1: 스튜디오에 통합 검색 호스트가 붙어 있으면 스튜디오 호스트가 처리하고,
      // 그 외 페이지나 호스트 마운트 전에는 전역 커맨드 팔레트를 열어 경쟁 앱 용어 검색을 즉시 제공한다.
      if (e.key === "F1" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.defaultPrevented) {
        if (isStudioPathname(window.location.pathname) && studioCommandSearchBridgeListenerCount() > 0) {
          return;
        }
        if (!open && isEditableElement(e.target)) return;
        e.preventDefault();
        toggle();
        return;
      }

      // 3. '/' shortcut outside of editable fields and studio canvas
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && typeof window !== "undefined" && !window.location.pathname.startsWith("/studio")) {
        if (!isEditableElement(e.target)) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle, setOpen]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </Suspense>
  );
}