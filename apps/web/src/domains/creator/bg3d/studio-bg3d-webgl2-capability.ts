/**
 * Explicit WebGL2 capability probe for Studio BG3D.
 *
 * Probes an ephemeral 1x1 offscreen canvas when browser WebGL globals exist and immediately
 * releases the temporary context via WEBGL_lose_context so no active WebGL context slot is held.
 * Non-browser unit-test environments (jsdom without WebGL constructors) report `unprobed` unless
 * an explicit `createCanvas` seam is provided.
 */

export type StudioBg3dWebGl2ProbeReason =
  | "available"
  | "unprobed"
  | "api-unavailable"
  | "context-unavailable";

export interface StudioBg3dWebGl2ProbeResult {
  readonly supported: boolean;
  readonly reason: StudioBg3dWebGl2ProbeReason;
}

export interface StudioBg3dWebGl2ProbeSignals {
  readonly createCanvas?: () => HTMLCanvasElement | null;
  readonly hasWebGl2Global?: boolean;
  readonly hasWebGl1Global?: boolean;
}

interface LoseContextCapable {
  getExtension?(name: string): { loseContext?(): void } | null;
}

function result(
  supported: boolean,
  reason: StudioBg3dWebGl2ProbeReason,
): StudioBg3dWebGl2ProbeResult {
  return Object.freeze({ supported, reason });
}

export function probeStudioBg3dWebGl2Capability(
  signals: StudioBg3dWebGl2ProbeSignals = {},
): StudioBg3dWebGl2ProbeResult {
  const hasExplicitCanvasFactory = typeof signals.createCanvas === "function";
  const hasWebGl2Global = signals.hasWebGl2Global ?? (typeof WebGL2RenderingContext === "function");
  const hasWebGl1Global = signals.hasWebGl1Global ?? (typeof WebGLRenderingContext === "function");

  if (!hasExplicitCanvasFactory && !hasWebGl2Global) {
    return hasWebGl1Global
      ? result(false, "api-unavailable")
      : result(true, "unprobed");
  }

  try {
    const canvas = hasExplicitCanvasFactory
      ? signals.createCanvas!()
      : (typeof document !== "undefined" ? document.createElement("canvas") : null);
    if (!canvas || typeof canvas.getContext !== "function") {
      return result(false, "context-unavailable");
    }
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext("webgl2", {
      failIfMajorPerformanceCaveat: false,
    }) as LoseContextCapable | null;
    if (!gl) {
      return result(false, "context-unavailable");
    }
    try {
      gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    } catch {
      // Ephemeral probe cleanup is best-effort once capability is confirmed.
    }
    return result(true, "available");
  } catch {
    return result(false, "context-unavailable");
  }
}
