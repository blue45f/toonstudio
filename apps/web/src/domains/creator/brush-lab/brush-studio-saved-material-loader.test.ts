import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadBrushStudioSavedMaterial } from "./brush-studio-saved-material-loader";
import { createBrushStudioV6ProductBrush } from "./brush-studio-v6-product-bridge";
import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "./brush-studio-v6-material-receipt";

const { getById, put, product } = vi.hoisted(() => {
  const getById = vi.fn(), put = vi.fn();
  return { getById, put, product: { authority: "sqlite", repository: { getById, put } } };
});
vi.mock("../studio-page-editor-runtime-loaders", () => ({
  loadStudioBrushLibrarySqliteRepository: async () => ({ openProductBrushLibraryRepository: async () => product }),
}));
beforeEach(() => { vi.clearAllMocks(); product.authority = "sqlite"; });

describe("opening a saved material brush without recipe approximation", () => {
  it("reads the saved identity and all effective material values without writing", async () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program("oil-hair-mixer"));
    saved.name = "내 실제 브러시"; saved.strokeWidth = 91; saved.brushOpacity = 0; saved.color = "#aaccee";
    const before = structuredClone(saved);
    getById.mockResolvedValue(saved);
    const result = await loadBrushStudioSavedMaterial(saved.id);
    expect(result.program.name).toBe(saved.name);
    expect(result.persistent).toBe(true);
    expect(createBrushStudioV6MaterialReceipt(result.program)).toEqual({ ...saved.enginePrograms!.material!,
      tuning: { ...saved.enginePrograms!.material!.tuning, size: 91, opacity: 0, primaryColor: "#aaccee" } });
    expect(saved).toEqual(before); expect(put).not.toHaveBeenCalled();
  });
  it("refuses a missing brush rather than opening a default recipe", async () => {
    getById.mockResolvedValue(null);
    await expect(loadBrushStudioSavedMaterial("missing")).rejects.toThrow("찾지 못했습니다");
    expect(put).not.toHaveBeenCalled();
  });
  it("refuses a saved non-material brush and never guesses a matching recipe", async () => {
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program());
    saved.enginePrograms = null; getById.mockResolvedValue(saved);
    await expect(loadBrushStudioSavedMaterial(saved.id)).rejects.toThrow("아직 지원하지 않습니다");
  });
  it("preserves the explicit session-only storage status", async () => {
    product.authority = "memory-session";
    const saved = createBrushStudioV6ProductBrush(createBrushStudioV6Program());
    getById.mockResolvedValue(saved);
    expect((await loadBrushStudioSavedMaterial(saved.id)).persistent).toBe(false);
  });
  it("propagates storage failures without attempting a fallback write", async () => {
    getById.mockRejectedValue(new Error("corrupt-storage"));
    await expect(loadBrushStudioSavedMaterial("id")).rejects.toThrow("corrupt-storage");
    expect(put).not.toHaveBeenCalled();
  });
  it("이전 외부 안료는 원본 저장 행을 보존한 명시 이주 후보로 반환한다", async () => {
    const saved = structuredClone(createBrushStudioV6ProductBrush({ ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" }));
    const material = saved.enginePrograms?.material;
    if (!material || material.version !== 2) throw new Error("테스트 영수증이 없습니다.");
    Object.assign(material.runtime, { bindings: material.runtime.bindings.map((binding) =>
      binding.nodeIds.includes("pigment-mixbox") ? {
        providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial",
        execution: "native", nodeIds: ["pigment-mixbox"],
      } : binding) });
    const before = structuredClone(saved);
    getById.mockResolvedValue(saved);
    const result = await loadBrushStudioSavedMaterial(saved.id);
    expect(result.migration?.sourceMaterial).toEqual(before.enginePrograms?.material);
    expect(JSON.parse(result.migration?.sourceSavedBrush ?? "null")).toEqual(before);
    expect(createBrushStudioV6MaterialReceipt(result.program).runtime.bindings.some((binding) => binding.providerId === "mixbox-js-v2")).toBe(false);
    expect(result.program.id).toBe(saved.id);
    expect(saved).toEqual(before);
    expect(put).not.toHaveBeenCalled();
  });
});
