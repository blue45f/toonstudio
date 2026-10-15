import { describe, expect, it } from "vitest";

import {
  buildStudioBg3dSkpTagList,
  isStudioBg3dSkpEmbeddableImage,
  summarizeOpenSkpHierarchy,
  summarizeOpenSkpModel,
} from "./studio-bg3d-skp-model-summary";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const BMP = new Uint8Array([0x42, 0x4d, 0, 0, 0, 0]);

function face(materialId: number | null = null, backMaterialId: number | null = null) {
  return { materialId, backMaterialId, hidden: false };
}

/** openskp SkpModel 과 같은 모양의 가짜 모델: Chair(배치됨) → Leg(중첩 배치), NeverPlaced(미배치). */
function fakeModel() {
  const definitions = new Map<number, unknown>([
    [10, {
      id: 10,
      name: "Chair",
      faces: [face(1), face(null, 2), face(3)],
      instances: [
        { name: "leg 1", refIdx: 11, hidden: false, materialId: 4 },
        { name: "hidden leg", refIdx: 11, hidden: true, materialId: null },
      ],
    }],
    [11, { id: 11, name: "Leg", faces: [face(), face()], instances: [] }],
    [12, { id: 12, name: "NeverPlaced", faces: [face(9), face(9), face(9), face(9)], instances: [{ hidden: true, refIdx: 11 }] }],
  ]);
  const materials = [
    { id: 1, name: "Brick", texture: { data: PNG } },
    { id: 2, name: "Lost\u0000Wood", texture: { data: null } },
    { id: 3, name: "Photo", texture: { data: BMP } },
    { id: 4, name: "Plain", texture: null },
    { id: 9, name: "UnusedMissing", texture: { data: null } },
  ];
  return {
    version: "{21.0.339}",
    units: "Millimeter",
    definitions,
    root: {
      id: 0,
      name: "ROOT_MODEL",
      faces: [face(1)],
      instances: [
        { name: "Chair A", refIdx: 10, hidden: false, materialId: null },
        { name: "Chair B", refIdx: 10, hidden: false, materialId: null },
      ],
    },
    layers: [
      { name: "Untagged", hidden: false },
      { name: "Furniture", hidden: false },
      { name: "Scratch", hidden: true },
    ],
    pages: [{ name: "Front" }, { name: "Top" }],
    materials,
    materialsById: new Map(materials.map((material) => [material.id, material])),
  };
}

describe("summarizeOpenSkpModel", () => {
  it("counts faces and hidden instances over placed definitions only", () => {
    const summary = summarizeOpenSkpModel(fakeModel());
    // 루트 1 + Chair 3 + Leg 2 (NeverPlaced 4 는 배치되지 않아 제외)
    expect(summary?.sourceFaces).toBe(6);
    expect(summary?.hiddenInstanceCount).toBe(1);
  });

  it("reports only used materials whose texture is missing or cannot be embedded", () => {
    const summary = summarizeOpenSkpModel(fakeModel());
    expect(summary?.missingTextureMaterials).toEqual(["Lost Wood"]);
    expect(summary?.unsupportedTextureMaterials).toEqual(["Photo"]);
  });

  it("reads tag names, hidden tags, scene names and the declared display unit", () => {
    const summary = summarizeOpenSkpModel(fakeModel());
    expect(summary?.tagNames).toEqual(["Untagged", "Furniture", "Scratch"]);
    expect(summary?.hiddenTagNames).toEqual(["Scratch"]);
    expect(summary?.sceneNames).toEqual(["Front", "Top"]);
    expect(summary?.declaredUnits).toEqual({ raw: "Millimeter", label: "밀리미터", unit: "mm" });
  });

  it("falls back to the materials array when there is no id map", () => {
    const model = { ...fakeModel(), materialsById: undefined };
    expect(summarizeOpenSkpModel(model)?.missingTextureMaterials).toEqual(["Lost Wood"]);
  });

  it("survives a self-referencing definition without looping", () => {
    const looping = {
      ...fakeModel(),
      definitions: new Map<number, unknown>([[10, { id: 10, name: "Loop", faces: [face()], instances: [{ refIdx: 10, hidden: false }] }]]),
    };
    expect(summarizeOpenSkpModel(looping)?.sourceFaces).toBe(2);
  });

  it("returns null instead of guessing when the parser result is not an object", () => {
    for (const value of [null, undefined, 3, "model"]) {
      expect(summarizeOpenSkpModel(value)).toBeNull();
    }
  });

  it("tolerates missing optional collections", () => {
    const summary = summarizeOpenSkpModel({ root: { faces: [], instances: [] } });
    expect(summary).toMatchObject({
      sourceFaces: 0,
      tagNames: [],
      sceneNames: [],
      hiddenInstanceCount: 0,
      declaredUnits: { raw: null },
    });
  });
});

describe("summarizeOpenSkpHierarchy", () => {
  const tree = {
    name: "ROOT",
    definitionName: "ROOT_MODEL",
    layer: "Untagged",
    children: [
      {
        name: "Car A",
        definitionName: "Car",
        layer: "Vehicles",
        children: [{ name: "Wheel 1", definitionName: "Wheel", layer: "Vehicles", children: [] }],
      },
      { name: "Car B", definitionName: "Car", layer: "Untagged", children: [] },
      { name: "Lamp", definitionName: "", layer: "Light", children: [] },
    ],
  };

  it("lists placed component names in file order (pre-order) without the root", () => {
    const summary = summarizeOpenSkpHierarchy(tree);
    expect(summary.components).toEqual({ available: true, items: ["Car", "Wheel", "Lamp"], total: 3, truncated: false });
    expect(summary.instances).toBe(4);
  });

  it("collects the effective tags that placed objects use", () => {
    expect(summarizeOpenSkpHierarchy(tree).tagNames).toEqual(["Vehicles", "Vehicles", "Untagged", "Light"]);
  });

  it("handles a very wide level without exceeding call-stack limits", () => {
    const wide = {
      name: "ROOT",
      children: Array.from({ length: 300_000 }, (_, index) => ({ name: `n${index % 3}`, definitionName: `Part ${index % 3}`, layer: "L", children: [] })),
    };
    const summary = summarizeOpenSkpHierarchy(wide);
    expect(summary.instances).toBe(300_000);
    expect(summary.components.items).toEqual(["Part 0", "Part 1", "Part 2"]);
  });

  it("marks components unavailable when the scene has no hierarchy", () => {
    expect(summarizeOpenSkpHierarchy(undefined)).toEqual({
      components: { available: false, items: [], total: 0, truncated: false },
      instances: 0,
      tagNames: [],
    });
  });
});

describe("helpers", () => {
  it("builds one tag list from defined and used tags without duplicates", () => {
    expect(buildStudioBg3dSkpTagList(["Untagged", "Furniture"], ["Furniture", "Light"]).items)
      .toEqual(["Untagged", "Furniture", "Light"]);
  });

  it("recognises the two image types glTF can carry", () => {
    expect(isStudioBg3dSkpEmbeddableImage(PNG)).toBe(true);
    expect(isStudioBg3dSkpEmbeddableImage(JPEG)).toBe(true);
    expect(isStudioBg3dSkpEmbeddableImage(BMP)).toBe(false);
    expect(isStudioBg3dSkpEmbeddableImage(new Uint8Array(0))).toBe(false);
  });
});
