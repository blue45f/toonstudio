import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { brushStudioV6ProductBrushHref, createBrushStudioV6ProductBrush, saveBrushStudioV6ProductBrush } from "./brush-studio-v6-product-bridge";

const { repository, product } = vi.hoisted(() => {
  const repository = { put: vi.fn(), getById: vi.fn() };
  return { repository, product: { repository, authority: "sqlite" } };
});
vi.mock("../studio-page-editor-runtime-loaders", () => ({
  loadStudioBrushLibrarySqliteRepository: async () => ({
    openProductBrushLibraryRepository: async () => product,
  }),
}));

describe("Brush Editor product save", () => {
  beforeEach(() => {
    product.authority = "sqlite";
    vi.resetAllMocks();
  });

  it("awaits the durable write and reads it back before reporting an applicable brush", async () => {
    const program = createBrushStudioV6Program("oil-hair-mixer");
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockImplementation(async (id) => ({ ...createBrushStudioV6ProductBrush(program), id }));
    const saved = await saveBrushStudioV6ProductBrush(program);
    expect(saved.enginePrograms?.material?.version).toBe(2);
    expect(saved.enginePrograms?.material?.runtime).toMatchObject({
      fallbackPolicy: "none",
      // oil-hair-mixer was remapped off the copyleft adapters (license
      // resolution), so it now saves under the default permissive-only
      // profile instead of requiring noncommercial-full.
      licenseProfile: "permissive-only",
    });
    expect(repository.getById).toHaveBeenLastCalledWith(saved.id);
    expect(saved.pressureCurve).toBe(1);
    expect(saved.enginePrograms?.material?.input.pressureGamma).toBe(program.input.pressureGamma);
  });

  it("refuses an unavailable engine instead of changing the selected recipe", () => {
    const base = createBrushStudioV6Program("clean-ink");
    expect(() => createBrushStudioV6ProductBrush({
      ...base,
      slots: { ...base.slots, pigment: "pigment-painter-lut" },
    })).toThrow(/pigment-painter-lut/u);
  });

  it("propagates storage failure and refuses a recipe lost during readback", async () => {
    repository.put.mockRejectedValueOnce(new Error("quota"));
    await expect(saveBrushStudioV6ProductBrush(createBrushStudioV6Program())).rejects.toThrow("quota");
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockResolvedValueOnce(null);
    await expect(saveBrushStudioV6ProductBrush(createBrushStudioV6Program())).rejects.toThrow("다시 읽지");
  });

  it("refuses session-only storage before writing a brush that would be lost on navigation", async () => {
    product.authority = "memory-session";
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockResolvedValue(createBrushStudioV6ProductBrush(createBrushStudioV6Program()));

    await expect(saveBrushStudioV6ProductBrush(createBrushStudioV6Program())).rejects.toThrow();

    expect(repository.put).not.toHaveBeenCalled();
    expect(repository.getById).not.toHaveBeenCalled();
  });
  it.each(["seed", "color", "flow", "binding"])("rejects corrupted %s despite valid version flags", async (field) => {
    const program = createBrushStudioV6Program("oil-hair-mixer");
    repository.put.mockImplementation(async (brush) => brush);
    repository.getById.mockImplementation(async (id) => {
      const brush = structuredClone(createBrushStudioV6ProductBrush(program));
      brush.id = id;
      const material = brush.enginePrograms!.material!;
      if (field === "seed") Object.assign(material, { seed: material.seed + 1 });
      if (field === "color") brush.color = "#abcdef";
      if (field === "flow") Object.assign(material.tuning, { flow: 0.37 });
      if (field === "binding") Object.assign(material.runtime!.bindings[0]!, { version: "future" });
      return brush;
    });
    await expect(saveBrushStudioV6ProductBrush(program)).rejects.toThrow("다시 읽지");
  });

  it("keeps zero material opacity in the actual saved tool snapshot", () => {
    const base = createBrushStudioV6Program();
    const program = { ...base, tuning: { ...base.tuning, opacity: 0 } };
    const saved = createBrushStudioV6ProductBrush(program);
    expect(saved.brushOpacity).toBe(0);
    expect(saved.enginePrograms?.material?.tuning.opacity).toBe(0);
  });

  it("document·work·remix·기본 범위에 맞는 원고 복귀 링크를 생성한다", () => {
    expect(brushStudioV6ProductBrushHref("b-1", "document:proj-9:doc-3")).toBe(
      "/studio/p/proj-9/d/doc-3?materialBrush=b-1",
    );
    expect(brushStudioV6ProductBrushHref("b-1", "work:w-7")).toBe(
      "/studio/work/w-7/canvas?materialBrush=b-1",
    );
    expect(brushStudioV6ProductBrushHref("b-1", "remix:src-4")).toBe(
      "/studio/remix/src-4/canvas?materialBrush=b-1",
    );
    expect(brushStudioV6ProductBrushHref("b-1", "global")).toBe(
      "/studio/canvas?materialBrush=b-1",
    );
  });

  it("질감(texture-*) 레시피를 제품 브러시로 변환할 때 brushDynamics.grain 설정을 병합한다", () => {
    const program = createBrushStudioV6Program("texture-chalk");
    const saved = createBrushStudioV6ProductBrush(program);
    expect(saved.brushDynamics?.grain).toMatchObject({
      space: "canvas-fixed",
      amount: 0.06,
      scale: 96,
      contrast: 0.35,
      source: {
        kind: "r8-texture-v1",
      },
      texture: {
        mode: "height",
        depth: 0.06,
      },
    });
  });
});
