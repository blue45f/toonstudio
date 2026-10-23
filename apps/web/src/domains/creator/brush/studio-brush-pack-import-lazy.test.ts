import { describe, expect, it, vi } from "vitest";

const observations = vi.hoisted(() => ({ moduleLoaded: vi.fn() }));
vi.mock("../../../../../../packages/studio-format-gateway/src/krita-bundle", () => {
  observations.moduleLoaded();
  // 실제 KritaBundleError 계약(code 필드)을 갖춘 목 — R21 causeCode 전파 단언용.
  class KritaBundleError extends Error {
    readonly code = "archive-invalid" as const;
  }
  return {
    KritaBundleError,
    importKritaBundle: async () => { throw new KritaBundleError("Invalid fixture"); },
  };
});

describe("Krita archive parser intent boundary", () => {
  it("does not load with the router and retains the typed import error on explicit use", async () => {
    expect(observations.moduleLoaded).not.toHaveBeenCalled();
    const router = await import("./studio-brush-pack-import");
    expect(observations.moduleLoaded).not.toHaveBeenCalled();
    await expect(router.importStudioKritaBundleBytes(new Uint8Array())).rejects.toMatchObject({
      name: "StudioBrushProgramImportError",
      format: "bundle",
      code: "bundleReadFailed",
      params: { detail: " Invalid fixture", causeCode: "bundle:archive-invalid" },
      cause: expect.objectContaining({ message: "Invalid fixture", code: "archive-invalid" }),
    });
    expect(observations.moduleLoaded).toHaveBeenCalledOnce();
  });
});
