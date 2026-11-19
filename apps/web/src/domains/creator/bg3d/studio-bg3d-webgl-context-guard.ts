/**
 * WebGL context loss/recovery guard for 3D background and VRM viewports.
 *
 * Mobile Safari/Chrome frequently evict WebGL contexts when switching between 2D drawing tabs,
 * backgrounding the app, or opening system sheets. Preventing default on `webglcontextlost`
 * allows the browser to fire `webglcontextrestored` so the 3D scene can reinitialize cleanly.
 */

export type StudioBg3dWebglContextState = "active" | "lost" | "restoring";

export interface StudioBg3dWebglContextGuardOptions {
  readonly onStateChange?: (state: StudioBg3dWebglContextState) => void;
  readonly onRestore?: () => void | Promise<void>;
}

export interface StudioBg3dWebglContextGuardHandle {
  readonly getState: () => StudioBg3dWebglContextState;
  readonly dispose: () => void;
}

export function attachStudioBg3dWebglContextGuard(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  options: StudioBg3dWebglContextGuardOptions = {},
): StudioBg3dWebglContextGuardHandle {
  let state: StudioBg3dWebglContextState = "active";
  let disposed = false;

  const setState = (next: StudioBg3dWebglContextState) => {
    if (disposed || state === next) return;
    state = next;
    options.onStateChange?.(next);
  };

  const handleContextLost = (event: Event) => {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    setState("lost");
  };

  const handleContextRestored = () => {
    if (disposed) return;
    setState("restoring");
    try {
      const result = options.onRestore?.();
      if (result && typeof (result as Promise<void>).then === "function") {
        void (result as Promise<void>).then(
          () => setState("active"),
          () => setState("lost"),
        );
      } else {
        setState("active");
      }
    } catch {
      setState("lost");
    }
  };

  target.addEventListener("webglcontextlost", handleContextLost);
  target.addEventListener("webglcontextrestored", handleContextRestored);

  return {
    getState: () => state,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      target.removeEventListener("webglcontextlost", handleContextLost);
      target.removeEventListener("webglcontextrestored", handleContextRestored);
    },
  };
}
