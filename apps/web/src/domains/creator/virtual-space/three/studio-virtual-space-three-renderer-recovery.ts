export type StudioVirtualThreeQualityMode = "standard" | "low";

export interface StudioVirtualThreeHostResourceSignals {
  readonly deviceMemoryGb?: number;
  readonly hardwareConcurrency?: number;
  readonly saveData?: boolean;
  readonly coarsePointer?: boolean;
  readonly cssWidth?: number;
  readonly devicePixelRatio?: number;
}

export interface StudioVirtualThreeRendererParams {
  readonly qualityMode: StudioVirtualThreeQualityMode;
  readonly antialias: boolean;
  readonly powerPreference: WebGLPowerPreference;
  readonly pixelRatio: number;
  readonly shadowsEnabled: boolean;
  readonly shadowMapSize: 512 | 2048;
  readonly usePostPipeline: boolean;
}

export function collectStudioVirtualThreeHostResourceSignals(): StudioVirtualThreeHostResourceSignals {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {};
  }
  const nav = navigator as Navigator & {
    readonly deviceMemory?: number;
    readonly connection?: { readonly saveData?: boolean };
  };
  const coarsePointer =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : undefined;
  return {
    deviceMemoryGb:
      typeof nav.deviceMemory === "number" && Number.isFinite(nav.deviceMemory)
        ? nav.deviceMemory
        : undefined,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" && Number.isFinite(nav.hardwareConcurrency)
        ? nav.hardwareConcurrency
        : undefined,
    saveData:
      typeof nav.connection?.saveData === "boolean" ? nav.connection.saveData : undefined,
    coarsePointer,
    cssWidth: Number.isFinite(window.innerWidth) ? window.innerWidth : undefined,
    devicePixelRatio: Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1,
  };
}

export function isStudioVirtualThreeLowSpecConstrained(
  signals: StudioVirtualThreeHostResourceSignals,
): boolean {
  if (signals.saveData === true) return true;
  if (typeof signals.deviceMemoryGb === "number" && signals.deviceMemoryGb <= 4) return true;
  if (typeof signals.hardwareConcurrency === "number" && signals.hardwareConcurrency <= 4) {
    return true;
  }
  if (signals.coarsePointer === true && typeof signals.cssWidth === "number" && signals.cssWidth <= 767) {
    return true;
  }
  return false;
}

export function resolveStudioVirtualThreeRendererParams(
  qualityMode: StudioVirtualThreeQualityMode,
  devicePixelRatio = 1,
): StudioVirtualThreeRendererParams {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  if (qualityMode === "low") {
    return Object.freeze({
      qualityMode: "low",
      antialias: false,
      powerPreference: "low-power",
      pixelRatio: 1,
      shadowsEnabled: false,
      shadowMapSize: 512,
      usePostPipeline: false,
    });
  }
  return Object.freeze({
    qualityMode: "standard",
    antialias: true,
    powerPreference: "high-performance",
    pixelRatio: Math.min(safeDpr, 2),
    shadowsEnabled: true,
    shadowMapSize: 2048,
    usePostPipeline: true,
  });
}

export function bindStudioVirtualThreeContextRecovery(
  canvas: HTMLCanvasElement,
  callbacks: {
    readonly onContextLost: () => void;
    readonly onContextRestored: () => void;
  },
): { dispose(): void } {
  const handleLost = (event: Event) => {
    event.preventDefault();
    callbacks.onContextLost();
  };
  const handleRestored = () => {
    callbacks.onContextRestored();
  };
  canvas.addEventListener("webglcontextlost", handleLost);
  canvas.addEventListener("webglcontextrestored", handleRestored);
  return {
    dispose() {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
    },
  };
}
