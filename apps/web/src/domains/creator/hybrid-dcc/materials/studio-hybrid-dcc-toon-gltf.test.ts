import { describe, expect, it } from "vitest";

import { createStudioHybridDccToonGltfMaterial, createStudioHybridDccToonGltfMaterials, studioHybridDccToonHexToLinear } from "./studio-hybrid-dcc-toon-gltf";
import { createStudioHybridDccDefaultToonMaterial, type StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

describe("툰 authoring의 순수 glTF 재질 확장", () => {
  it("sRGB 색을 linear RGB로 기록하며 불투명 PBR fallback과 실제 MToon 확장을 만든다", () => {
    const dto: StudioHybridDccToonMaterial = { ...createStudioHybridDccDefaultToonMaterial(), baseColorSrgb: "#808080", shadeColorSrgb: "#0a2040" };
    const before = JSON.stringify(dto); const material = createStudioHybridDccToonGltfMaterial(dto);
    expect(material.alphaMode).toBe("OPAQUE"); expect(material.doubleSided).toBe(true);
    for (const channel of material.pbrMetallicRoughness.baseColorFactor.slice(0, 3)) expect(channel).toBeCloseTo(0.21586050011389923, 15);
    expect(material.pbrMetallicRoughness.baseColorFactor[3]).toBe(1);
    expect(material.pbrMetallicRoughness).toMatchObject({ metallicFactor: 0, roughnessFactor: 1 });
    expect(material.extensions.VRMC_materials_mtoon).toMatchObject({ specVersion: "1.0", shadingShiftFactor: 0, shadingToonyFactor: 0.9, outlineLightingMixFactor: 0 });
    expect(material.extensions.VRMC_materials_mtoon.shadeColorFactor).toEqual(studioHybridDccToonHexToLinear("#0a2040"));
    expect(JSON.stringify(dto)).toBe(before); expect(JSON.parse(JSON.stringify(material))).toEqual(material);
  });

  it.each(["worldCoordinates", "screenCoordinates"] as const)("%s 폭 단위를 바꾸지 않고 확장에 기록한다", (mode) => {
    const dto = createStudioHybridDccDefaultToonMaterial(); const outline: StudioHybridDccToonMaterial["outline"] = { ...dto.outline, enabled: true, mode, width: 0.007, colorSrgb: "#6080a0" };
    const material = createStudioHybridDccToonGltfMaterial({ ...dto, shadingToony: 1, outline });
    expect(material.extensions.VRMC_materials_mtoon).toMatchObject({ shadingToonyFactor: 1, outlineWidthMode: mode, outlineWidthFactor: 0.007 });
    expect(material.extensions.VRMC_materials_mtoon.outlineColorFactor).toEqual(studioHybridDccToonHexToLinear("#6080a0"));
  });

  it("비활성·폭 0 outline은 none으로 내보내고 materialSlot 순서와 독립 객체를 유지한다", () => {
    const dto = createStudioHybridDccDefaultToonMaterial();
    const table = createStudioHybridDccToonGltfMaterials([{ ...dto, outline: { ...dto.outline, enabled: false } }, { ...dto, outline: { ...dto.outline, width: 0 } }]);
    expect(table.materials).toHaveLength(2); expect(table.extensionsUsed).toEqual(["VRMC_materials_mtoon"]);
    expect(table.materials[0]).not.toBe(table.materials[1]);
    expect(table.materials.map(({ extensions }) => [extensions.VRMC_materials_mtoon.outlineWidthMode, extensions.VRMC_materials_mtoon.outlineWidthFactor])).toEqual([["none", 0], ["none", 0]]);
    expect(createStudioHybridDccToonGltfMaterials([])).toEqual({ materials: [], extensionsUsed: [] });
  });

  it("sRGB 전달 함수의 낮은 채널 분기와 흑백을 보존하고 잘못된 입력을 거부한다", () => {
    expect(studioHybridDccToonHexToLinear("#000aFF")).toEqual([0, 10 / 255 / 12.92, 1]);
    expect(() => studioHybridDccToonHexToLinear("#fff")).toThrow(/#RRGGBB/u);
    expect(() => createStudioHybridDccToonGltfMaterial({ ...createStudioHybridDccDefaultToonMaterial(), shadingShift: NaN })).toThrow();
  });
});
