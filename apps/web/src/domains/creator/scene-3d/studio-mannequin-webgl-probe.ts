export type StudioMannequinEngineState = "initializing" | "ready" | "error";

export class StudioMannequinWebglUnavailableError extends Error {
  constructor() {
    super("WebGL2 3D context is unavailable");
    this.name = "StudioMannequinWebglUnavailableError";
  }
}

export function isStudioMannequinWebglUnavailableError(
  error: unknown,
): error is StudioMannequinWebglUnavailableError {
  return error instanceof StudioMannequinWebglUnavailableError;
}

/**
 * Probes WebGL2 support before `THREE.WebGLRenderer` instantiation so unsupported or
 * `--disable-gpu` browsers transition cleanly to the compatibility UI without emitting
 * `THREE.WebGLRenderer: Error creating WebGL context.` to `console.error`.
 */
export function probeStudioMannequinWebgl2Support(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (/jsdom/iu.test(window.navigator.userAgent)) return false;
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (!gl2) return false;
    gl2.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
