import { describe, expect, it, vi } from "vitest";

import { probeStudioBg3dWebGl2Capability } from "./studio-bg3d-webgl2-capability";

describe("probeStudioBg3dWebGl2Capability", () => {
  it("treats non-WebGL test hosts without globals as unprobed rather than unsupported", () => {
    expect(probeStudioBg3dWebGl2Capability({
      hasWebGl2Global: false,
      hasWebGl1Global: false,
    })).toEqual({
      supported: true,
      reason: "unprobed",
    });
  });

  it("reports api-unavailable when WebGL1 exists on the browser without WebGL2", () => {
    expect(probeStudioBg3dWebGl2Capability({
      hasWebGl2Global: false,
      hasWebGl1Global: true,
    })).toEqual({
      supported: false,
      reason: "api-unavailable",
    });
  });

  it("reports context-unavailable when WebGL2 context creation returns null or throws", () => {
    expect(probeStudioBg3dWebGl2Capability({
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => null,
      }) as unknown as HTMLCanvasElement,
    })).toEqual({
      supported: false,
      reason: "context-unavailable",
    });

    expect(probeStudioBg3dWebGl2Capability({
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: () => {
          throw new Error("GPU disabled");
        },
      }) as unknown as HTMLCanvasElement,
    })).toEqual({
      supported: false,
      reason: "context-unavailable",
    });
  });

  it("releases the ephemeral WebGL2 probe context immediately via WEBGL_lose_context", () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn((name: string) =>
      name === "WEBGL_lose_context" ? { loseContext } : null,
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ getExtension })),
    } as unknown as HTMLCanvasElement;

    expect(probeStudioBg3dWebGl2Capability({ createCanvas: () => canvas })).toEqual({
      supported: true,
      reason: "available",
    });
    expect(getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    expect(loseContext).toHaveBeenCalledOnce();
  });
});
