import { statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STUDIO_3D_PROP_CATEGORY_LABELS,
  STUDIO_BLENDER_PRECISION_BG_V14_PROP_CATALOG,
  STUDIO_BLENDER_ARTISAN_V15_PROP_CATALOG,
  STUDIO_ROOM_LAYOUT_PRESETS,
  StudioMultiObjectLayoutManager,
  findStudio3DPropCatalogEntry,
  listStudio3DPropCatalogByCategory,
  type Studio3DPropCatalogCategory,
} from "../studio-multi-object-layout";

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

  it("filters 284 bundled 3D props across all 8 categories (incl. 6 Blender Precision BG V14 + 4 Blender Artisan V15 + 4 Blender Hero V12 + 141 Poly Haven 2K PBR + 45 Kenney Blockout) and loads mannequin, Poly Haven, and Kenney presets", () => {
    expect(listStudio3DPropCatalogByCategory("all")).toHaveLength(284);
    expect(listStudio3DPropCatalogByCategory("blender-precision-bg-v14")).toHaveLength(6);
    expect(STUDIO_BLENDER_PRECISION_BG_V14_PROP_CATALOG).toHaveLength(6);
    expect(listStudio3DPropCatalogByCategory("blender-artisan-v15")).toHaveLength(4);
    expect(STUDIO_BLENDER_ARTISAN_V15_PROP_CATALOG).toHaveLength(4);
    expect(listStudio3DPropCatalogByCategory("blender-hero-v12")).toHaveLength(4);
    expect(listStudio3DPropCatalogByCategory("refined-v8")).toHaveLength(11);
    expect(listStudio3DPropCatalogByCategory("polyhaven-pbr")).toHaveLength(141);
    expect(listStudio3DPropCatalogByCategory("kenney-blockout")).toHaveLength(45);
    for (const category of Object.keys(STUDIO_3D_PROP_CATEGORY_LABELS) as Studio3DPropCatalogCategory[]) {
      const items = listStudio3DPropCatalogByCategory(category);
      expect(items.length, category).toBeGreaterThan(0);
      expect(items.every((entry) => entry.category === category)).toBe(true);
    }
    expect(listStudio3DPropCatalogByCategory("nature")).toHaveLength(19);
    expect(listStudio3DPropCatalogByCategory("mannequin")).toHaveLength(10);
    expect(listStudio3DPropCatalogByCategory("architecture")).toHaveLength(39);

    const v14Manager = new StudioMultiObjectLayoutManager();
    for (const v14Entry of STUDIO_BLENDER_PRECISION_BG_V14_PROP_CATALOG) {
      expect(findStudio3DPropCatalogEntry(v14Entry.id)).toBe(v14Entry);
      expect(statSync(join(process.cwd(), "apps/web/public", v14Entry.modelUrl)).isFile()).toBe(true);
      expect(statSync(join(process.cwd(), "apps/web/public", v14Entry.thumbnailUrl!)).isFile()).toBe(true);
      const spawned = v14Manager.addCatalogProp(v14Entry.id);
      expect(spawned?.modelUrl).toBe(v14Entry.modelUrl);
    }
    expect(v14Manager.getAllObjects()).toHaveLength(6);

    const v15Manager = new StudioMultiObjectLayoutManager();
    for (const v15Entry of STUDIO_BLENDER_ARTISAN_V15_PROP_CATALOG) {
      expect(findStudio3DPropCatalogEntry(v15Entry.id)).toBe(v15Entry);
      expect(statSync(join(process.cwd(), "apps/web/public", v15Entry.modelUrl)).isFile()).toBe(true);
      expect(statSync(join(process.cwd(), "apps/web/public", v15Entry.thumbnailUrl!)).isFile()).toBe(true);
      const spawned = v15Manager.addCatalogProp(v15Entry.id);
      expect(spawned?.modelUrl).toBe(v15Entry.modelUrl);
    }
    expect(v15Manager.getAllObjects()).toHaveLength(4);

    const manager = new StudioMultiObjectLayoutManager();
    const staged = manager.loadPreset("action_pose_staging");
    expect(staged).toHaveLength(5);
    expect(staged.some((obj) => obj.modelUrl.startsWith("/creator-essentials/pose-"))).toBe(true);

    const cafeTerrace = manager.loadPreset("polyhaven_cafe_terrace");
    expect(cafeTerrace).toHaveLength(5);
    expect(cafeTerrace.every((obj) => obj.modelUrl.startsWith("/assets/studio/cc0-20260906/assets/polyhaven-"))).toBe(true);

    const vintageLiving = manager.loadPreset("polyhaven_vintage_living");
    expect(vintageLiving).toHaveLength(6);
    const gothicBedroom = manager.loadPreset("polyhaven_gothic_bedroom");
    expect(gothicBedroom).toHaveLength(5);
    const workshopGarage = manager.loadPreset("polyhaven_workshop_garage");
    expect(workshopGarage).toHaveLength(6);

    const kenneyCity = manager.loadPreset("kenney_city_crossroad");
    expect(kenneyCity).toHaveLength(6);
    expect(kenneyCity.every((obj) => obj.modelUrl.startsWith("/assets/studio/cc0-20260906/assets/kenney-"))).toBe(true);
    const kenneySuburban = manager.loadPreset("kenney_suburban_home");
    expect(kenneySuburban).toHaveLength(5);
    const kenneyHarbor = manager.loadPreset("kenney_harbor_survival_camp");
    expect(kenneyHarbor).toHaveLength(6);
  });
});
