import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BUNDLED_SCENE_PROP_CATALOG,
  STUDIO_KENNEY_BLOCKOUT_PROP_CATALOG,
  STUDIO_POLYHAVEN_PBR_PROP_CATALOG,
  STUDIO_REFINED_V8_PROP_CATALOG,
  STUDIO_ROOM_LAYOUT_PRESETS,
  STUDIO_SCENE_PROP_LAYOUT_PRESETS,
  StudioMultiObjectLayoutManager,
  findStudio3DPropCatalogEntry,
} from "./studio-multi-object-layout";
import { parseStudioCc0Catalog } from "./studio-cc0-asset-delivery";

describe("StudioMultiObjectLayoutManager", () => {
  it("adds and duplicates 3D object instances", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const obj1 = manager.addObject({
      modelUrl: "/desk.glb",
      name: "책상",
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    });

    expect(obj1.id).toBeDefined();
    expect(manager.getAllObjects()).toHaveLength(1);

    const dup = manager.duplicateObject(obj1.id);
    expect(dup).toBeDefined();
    expect(dup?.name).toContain("복사본");
    expect(manager.getAllObjects()).toHaveLength(2);
  });

  it("snaps object to floor level y=0", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const obj = manager.addObject({
      modelUrl: "/chair.glb",
      name: "의자",
      position: [1, 2.5, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      visible: true,
    });

    const snapped = manager.snapToFloor(obj.id);
    expect(snapped?.position[1]).toBe(0);
  });

  it("loads room layout presets (classroom, cafe)", () => {
    const manager = new StudioMultiObjectLayoutManager();
    const classroomObjs = manager.loadPreset("classroom");
    expect(classroomObjs.length).toBeGreaterThan(0);
    expect(STUDIO_ROOM_LAYOUT_PRESETS.length).toBeGreaterThanOrEqual(2);
  });

  it("backs every room preset URL with a real Blender GLB asset", () => {
    const urls = new Set(
      STUDIO_ROOM_LAYOUT_PRESETS.flatMap((preset) =>
        preset.objects.map((object) => object.modelUrl)),
    );
    expect(urls).toEqual(new Set([
      "/assets/3d/refined-v8/blackboard.glb",
      "/assets/3d/refined-v8/desk.glb",
      "/assets/3d/refined-v8/chair.glb",
      "/assets/3d/round_table.glb",
      "/assets/3d/refined-v8/sofa.glb",
    ]));

    for (const url of urls) {
      expect(url).toMatch(/^\/assets\/3d\/(?:refined-v8\/)?[a-z_]+\.glb$/);
      const file = statSync(join(process.cwd(), "apps/web/public", url));
      expect(file.isFile(), url).toBe(true);
      expect(file.size, url).toBeGreaterThan(10 * 1024);
    }
  });

  it("documents first-party source and redistribution rights for every bundled GLB", () => {
    const licensePath = join(process.cwd(), "apps/web/public", "assets", "3d", "LICENSES.md");
    const license = readFileSync(licensePath, "utf8");

    expect(license).toContain("generate_core_furniture_pack.py");
    expect(license).toContain("CC0 1.0");
    for (const filename of [
      "blackboard.glb",
      "desk.glb",
      "chair.glb",
      "round_table.glb",
      "sofa.glb",
    ]) {
      expect(license).toContain(`\`${filename}\``);
    }
  });

  it("wires all 11 refined-v8 GLBs and their 11 rendered PNG thumbnails in STUDIO_REFINED_V8_PROP_CATALOG", () => {
    expect(STUDIO_REFINED_V8_PROP_CATALOG).toHaveLength(11);
    for (const entry of STUDIO_REFINED_V8_PROP_CATALOG) {
      expect(findStudio3DPropCatalogEntry(entry.id)).toBe(entry);
      expect(entry.modelUrl).toMatch(/^\/assets\/3d\/refined-v8\/[a-z_]+\.glb$/u);
      expect(entry.thumbnailUrl).toMatch(/^\/assets\/3d\/refined-v8\/thumbnails\/[a-z_]+\.png$/u);
      const glbStat = statSync(join(process.cwd(), "apps/web/public", entry.modelUrl));
      expect(glbStat.isFile(), entry.modelUrl).toBe(true);
      expect(glbStat.size, entry.modelUrl).toBeGreaterThan(10 * 1024);
      const pngBytes = readFileSync(join(process.cwd(), "apps/web/public", entry.thumbnailUrl!));
      expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  });

  it("backs all STUDIO_BUNDLED_SCENE_PROP_CATALOG (270 items incl. 141 Poly Haven 2K PBR + 45 Kenney Blockout) and STUDIO_SCENE_PROP_LAYOUT_PRESETS (15 presets) with real public GLBs and thumbnails", () => {
    expect(STUDIO_POLYHAVEN_PBR_PROP_CATALOG).toHaveLength(141);
    expect(STUDIO_KENNEY_BLOCKOUT_PROP_CATALOG).toHaveLength(45);
    expect(STUDIO_BUNDLED_SCENE_PROP_CATALOG).toHaveLength(270);
    expect(STUDIO_SCENE_PROP_LAYOUT_PRESETS).toHaveLength(15);

    let thumbnailCount = 0;
    for (const entry of STUDIO_BUNDLED_SCENE_PROP_CATALOG) {
      const stat = statSync(join(process.cwd(), "apps/web/public", entry.modelUrl));
      expect(stat.isFile(), entry.modelUrl).toBe(true);
      expect(stat.size, entry.modelUrl).toBeGreaterThan(1024);
      if (entry.thumbnailUrl) {
        thumbnailCount += 1;
        const thumbStat = statSync(join(process.cwd(), "apps/web/public", entry.thumbnailUrl));
        expect(thumbStat.isFile(), entry.thumbnailUrl).toBe(true);
        expect(thumbStat.size, entry.thumbnailUrl).toBeGreaterThan(256);
      }
    }
    expect(thumbnailCount).toBe(213);

    const manager = new StudioMultiObjectLayoutManager();
    for (const preset of STUDIO_SCENE_PROP_LAYOUT_PRESETS) {
      const loaded = manager.loadPreset(preset.id);
      expect(loaded).toHaveLength(preset.objects.length);
      for (const obj of loaded) {
        const stat = statSync(join(process.cwd(), "apps/web/public", obj.modelUrl));
        expect(stat.isFile(), obj.modelUrl).toBe(true);
      }
    }

    const added = manager.addCatalogProp("v8_traffic_light");
    expect(added).not.toBeNull();
    expect(added!.modelUrl).toBe("/assets/3d/refined-v8/traffic_light.glb");
    const moved = manager.updatePosition(added!.id, [1.5, 0.5, -2.0]);
    expect(moved?.position).toEqual([1.5, 0.5, -2.0]);
    expect(manager.updatePosition("missing_id", [0, 0, 0])).toBeNull();
    expect(manager.addCatalogProp("missing_prop")).toBeNull();
  });

  it("spawns any of the 1,139 CC0 3D models (141 Poly Haven + 998 Kenney) directly into the 3D scene via addCc0ModelAsset", () => {
    const manifestPath = join(
      process.cwd(),
      "apps/web/public/assets/studio/cc0-20260906/manifest.json",
    );
    const catalog = parseStudioCc0Catalog(JSON.parse(readFileSync(manifestPath, "utf8")));
    const models = catalog.filter((item) => item.kind === "model");
    expect(models).toHaveLength(1139);

    const manager = new StudioMultiObjectLayoutManager();
    for (const asset of models) {
      const instance = manager.addCc0ModelAsset(asset);
      expect(instance.modelUrl).toBe(`/assets/studio/cc0-20260906/${asset.path}`);
      expect(instance.visible).toBe(true);
    }
    expect(manager.getAllObjects()).toHaveLength(1139);
  });
});
