import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

export type StudioDrawingPresentation = "integrated" | "app";

export const STUDIO_DRAWING_PRESENTATION_QUERY = "drawingShell";
export const STUDIO_DRAWING_PRESENTATION_SESSION_KEY =
  "toonstudio:drawing-presentation:v1";

type StoredDrawingPresentation = "app" | "pwa-app" | null;

function readExplicitPresentation(search: string): StudioDrawingPresentation | null {
  const values = new URLSearchParams(search).getAll(STUDIO_DRAWING_PRESENTATION_QUERY);
  if (values.length !== 1) return null;
  if (values[0] === "app") return "app";
  if (values[0] === "integrated") return "integrated";
  return null;
}

function isStandalonePwaContext(search: string): boolean {
  if (new URLSearchParams(search).get("source") === "pwa") return true;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

function readStoredPresentation(): StoredDrawingPresentation {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STUDIO_DRAWING_PRESENTATION_SESSION_KEY);
    return raw === "pwa-app" || raw === "app" ? raw : null;
  } catch {
    return null;
  }
}

function isProjectOrHomeStudioPathname(pathname: string): boolean {
  return pathname === "/studio" || pathname === "/studio/" || pathname.startsWith("/studio/p/");
}

function resolveRememberedPresentation(
  stored: StoredDrawingPresentation,
  pathname: string,
): StudioDrawingPresentation {
  if (stored === "pwa-app") return "app";
  if (stored === "app" && isProjectOrHomeStudioPathname(pathname)) return "app";
  return "integrated";
}

function persistPresentation(
  value: StudioDrawingPresentation,
  standalonePwa: boolean,
): StoredDrawingPresentation {
  const next: StoredDrawingPresentation =
    value === "app" ? (standalonePwa ? "pwa-app" : "app") : null;
  if (typeof window === "undefined") return next;
  try {
    if (next) {
      window.sessionStorage.setItem(STUDIO_DRAWING_PRESENTATION_SESSION_KEY, next);
    } else {
      window.sessionStorage.removeItem(STUDIO_DRAWING_PRESENTATION_SESSION_KEY);
    }
  } catch {
    // Presentation preference is convenience state only. Drawing must stay usable when
    // session storage is unavailable (private mode, quota policy, embedded browser, etc.).
  }
  return next;
}

/**
 * One drawing runtime, two shells.
 *
 * `app` changes only chrome/presentation. Document identity, brush engine, layer model,
 * autosave, collaboration and export all stay on the normal Studio runtime. Standalone PWA
 * windows remember `pwa-app` across all Studio routes, while regular browser tabs scope
 * remembered `app` chrome to project/home routes so direct `/studio/canvas` entry never
 * unexpectedly switches designs.
 */
export function useStudioDrawingPresentation(): StudioDrawingPresentation {
  const { pathname, search } = useLocation();
  const explicit = useMemo(() => readExplicitPresentation(search), [search]);
  const standalonePwa = useMemo(() => isStandalonePwaContext(search), [search]);
  const [stored, setStored] = useState<StoredDrawingPresentation>(() => {
    const current = readStoredPresentation();
    if (explicit === "app") return standalonePwa || current === "pwa-app" ? "pwa-app" : "app";
    if (explicit === "integrated") return null;
    return current;
  });

  useEffect(() => {
    if (explicit) {
      const next = persistPresentation(explicit, standalonePwa || stored === "pwa-app");
      setStored(next);
      return;
    }
    if (stored === "app" && !isProjectOrHomeStudioPathname(pathname)) {
      persistPresentation("integrated", false);
      setStored(null);
    }
  }, [explicit, pathname, standalonePwa, stored]);

  return explicit ?? resolveRememberedPresentation(stored, pathname);
}

export function withStudioDrawingPresentation(
  search: string | URLSearchParams,
  presentation: StudioDrawingPresentation,
): URLSearchParams {
  const next = new URLSearchParams(
    typeof search === "string" ? search : search.toString(),
  );
  next.set(STUDIO_DRAWING_PRESENTATION_QUERY, presentation);
  if (presentation === "app") {
    next.set("uiMode", "focus");
    next.set("startTool", "draw");
  }
  return next;
}
