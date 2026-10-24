import { describe, expect, it } from "vitest";

import {
  STUDIO_3D_PROP_CATEGORY_LABELS,
  STUDIO_ROOM_LAYOUT_PRESETS,
  StudioMultiObjectLayoutManager,
  listStudio3DPropCatalogByCategory,
  type Studio3DPropCatalogCategory,
} from "./studio-multi-object-layout";

describe("StudioMultiObjectPanel integration", () => {
  it("room presets contain classroom and cafe", () => {
    const ids = STUDIO_ROOM_LAYOUT_PRESETS.map((p) => p.id);
    expect(ids).toContain("classroom");
    expect(ids).toContain("cafe");
  });

  it("manager loads classroom preset and returns objects", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const objs = manager.loadPreset("classroom");
    expect(objs.length).toBeGreaterThanOrEqual(2);
    for (const obj of objs) {
      expect(obj.id).toBeTruthy();
      expect(obj.visible).toBe(true);
    }
  });

  it("duplicate creates copy with offset position", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const objs = manager.loadPreset("cafe");
    const first = objs[0];
    if (!first) return;
    const dup = manager.duplicateObject(first.id);
    expect(dup).not.toBeNull();
    expect(dup!.position[0]).not.toEqual(first.position[0]);
  });

  it("snapToFloor sets Y to 0", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const added = manager.addObject({
      modelUrl: "/test.glb",
      name: "Test",
      position: [1, 5, 2],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    });
    const snapped = manager.snapToFloor(added.id);
    expect(snapped?.position[1]).toBe(0);
  });

  it("filters 120 bundled 3D props across all 8 categories (incl. 36 Poly Haven 2K PBR) and loads mannequin + Poly Haven presets", () => {
    expect(listStudio3DPropCatalogByCategory("all")).toHaveLength(120);
    expect(listStudio3DPropCatalogByCategory("refined-v8")).toHaveLength(11);
    expect(listStudio3DPropCatalogByCategory("polyhaven-pbr")).toHaveLength(36);
    for (const category of Object.keys(STUDIO_3D_PROP_CATEGORY_LABELS) as Studio3DPropCatalogCategory[]) {
      const items = listStudio3DPropCatalogByCategory(category);
      expect(items.length, category).toBeGreaterThan(0);
      expect(items.every((entry) => entry.category === category)).toBe(true);
    }
    expect(listStudio3DPropCatalogByCategory("nature")).toHaveLength(8);
    expect(listStudio3DPropCatalogByCategory("mannequin")).toHaveLength(8);
    expect(listStudio3DPropCatalogByCategory("architecture")).toHaveLength(8);

    const manager = new StudioMultiObjectLayoutManager();
    const staged = manager.loadPreset("action_pose_staging");
    expect(staged).toHaveLength(5);
    expect(staged.some((obj) => obj.modelUrl.startsWith("/creator-essentials/pose-"))).toBe(true);

    const cafeTerrace = manager.loadPreset("polyhaven_cafe_terrace");
    expect(cafeTerrace).toHaveLength(5);
    expect(cafeTerrace.every((obj) => obj.modelUrl.startsWith("/assets/studio/cc0-20260906/assets/polyhaven-"))).toBe(true);
  });
});
