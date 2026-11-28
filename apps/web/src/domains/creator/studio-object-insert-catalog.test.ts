import { statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getStudioBg3dEnvironmentAsset, getStudioBg3dEnvironmentAssetByHash } from "./bg3d/studio-bg3d-environment-catalog";
import { PRIMITIVE_DEFS } from "./studio-background-3d-metadata";
import { BG_SCENE_TEMPLATES } from "./studio-background-3d-scene-templates";
import {
  filterStudioObjectInsertItems,
  findStudioObjectInsertItem,
  listStudioObjectInsertFamilies,
  listStudioObjectInsertItems,
  planStudioObjectInsertPlacement,
  STUDIO_OBJECT_INSERT_CATALOG_VERSION,
} from "./studio-object-insert-catalog";
import { VRM_PROPS } from "./vrm/studio-vrm-props";

describe("studio object insert catalog (Canva-style 3D elements)", () => {
  it("공원 템플릿 카드가 실제로 배치하는 공원 광장의 촬영본을 사용한다", () => {
    expect(findStudioObjectInsertItem("obj-scene-park_plaza")).toMatchObject({
      sourceId: "park_plaza",
      thumbnailUrl: "/assets/studio/scene-template-previews/park_plaza.webp",
    });
  });

  it("첫 여섯 배경의 카드·모바일 배포본·원고 복원이 같은 검증 모델을 가리킨다", () => {
    const items = listStudioObjectInsertItems().slice(0, 6);
    for (const item of items) {
      const desktop = getStudioBg3dEnvironmentAsset(item.sourceId);
      const mobile = getStudioBg3dEnvironmentAsset(item.sourceId.replace(/-desktop$/u, "-mobile"));
      expect(desktop, item.id).toBeTruthy();
      expect(mobile, item.id).toBeTruthy();
      if (!desktop || !mobile) throw new Error("검증된 데스크톱·모바일 배경이 필요합니다.");
      expect(item).toMatchObject({
        kind: "bg3d-scene-prop", assetUrl: desktop.url, bundledEnvironmentId: desktop.id,
        assetLicense: desktop.provenance.license, thumbnailUrl: desktop.thumbnailUrl,
      });
      expect(getStudioBg3dEnvironmentAssetByHash(desktop.sha256)).toBe(desktop);
      expect(getStudioBg3dEnvironmentAssetByHash(mobile.sha256)).toBe(mobile);
    }
  });

  it("lists primitives, props, and scene templates with unique ids", () => {
    const items = listStudioObjectInsertItems();
    expect(STUDIO_OBJECT_INSERT_CATALOG_VERSION).toBe("object-insert-catalog-v1");
    expect(items.length).toBeGreaterThan(
      Object.keys(PRIMITIVE_DEFS).length + VRM_PROPS.length,
    );
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const primitives = items.filter((item) => item.kind === "bg3d-primitive");
    expect(primitives).toHaveLength(Object.keys(PRIMITIVE_DEFS).length);
    expect(primitives.every((item) => item.openTarget === "bg3d-editor")).toBe(
      true,
    );

    const props = items.filter((item) => item.kind === "vrm-prop");
    expect(props).toHaveLength(VRM_PROPS.length);
    expect(props.every((item) => item.openTarget === "vrm-poser")).toBe(true);

    const scenes = items.filter((item) => item.kind === "bg3d-scene-template");
    expect(scenes).toHaveLength(BG_SCENE_TEMPLATES.length);
    expect(new Set(scenes.map((item) => item.sourceId))).toEqual(
      new Set(BG_SCENE_TEMPLATES.map((template) => template.id)),
    );
    expect(scenes.some((item) => item.sourceId === "fantasy_tavern")).toBe(true);
    expect(scenes.every((item) => item.openTarget === "bg3d-templates")).toBe(
      true,
    );
    for (const item of scenes) {
      expect(item.assetUrl).toBeUndefined();
      expect(item.thumbnailUrl).toBe(`/assets/studio/scene-template-previews/${item.sourceId}.webp`);
    }

    const publicRoot = process.cwd().endsWith("/apps/web")
      ? join(process.cwd(), "public")
      : join(process.cwd(), "apps/web/public");
    for (const item of items) {
      if (item.assetUrl) {
        const stat = statSync(join(publicRoot, item.assetUrl));
        expect(stat.isFile(), item.assetUrl).toBe(true);
        expect(stat.size, item.assetUrl).toBeGreaterThan(1024);
      }
      if (item.thumbnailUrl) {
        const stat = statSync(join(publicRoot, item.thumbnailUrl));
        expect(stat.isFile(), item.thumbnailUrl).toBe(true);
        expect(stat.size, item.thumbnailUrl).toBeGreaterThan(1024);
      }
    }
  });

  it("inserts explicit refined revisions without relabeling persisted legacy prop IDs", () => {
    for (const name of ["hanging_sign", "traffic_light", "mailbox", "bubble_tea", "ice_cream_cone", "fox_mask", "robot_pet"]) {
      const id = `obj-prop-blender_${name}_v8`;
      const entry = findStudioObjectInsertItem(id);
      expect(entry?.sourceId).toBe(`blender_${name}_v8`);
      expect(entry?.label).toContain("개선형");
      expect(entry?.assetUrl).toBe(`/assets/3d/refined-v8/${name}.glb`);
      expect(entry?.thumbnailUrl).toBe(`/assets/3d/refined-v8/thumbnails/${name}.png`);
      const placement = planStudioObjectInsertPlacement({ itemId: id, canvasWidth: 800, canvasHeight: 1200 });
      expect(placement?.sourceId).toBe(`blender_${name}_v8`);
      expect(placement?.openTarget).toBe("vrm-poser");
      expect(findStudioObjectInsertItem(`obj-prop-blender_${name}`)).toBeNull();
    }
    for (const name of ["blackboard", "desk", "chair", "sofa"]) {
      const id = `obj-furniture-${name}_v8`;
      const entry = findStudioObjectInsertItem(id);
      expect(entry?.kind).toBe("bg3d-scene-prop");
      expect(entry?.family).toBe("scene-furniture");
      expect(entry?.assetUrl).toBe(`/assets/3d/refined-v8/${name}.glb`);
      expect(entry?.thumbnailUrl).toBe(`/assets/3d/refined-v8/thumbnails/${name}.png`);
      const placement = planStudioObjectInsertPlacement({ itemId: id, canvasWidth: 800, canvasHeight: 1200 });
      expect(placement?.sourceId).toBe(`${name}_v8`);
      expect(placement?.openTarget).toBe("bg3d-editor");
    }

    const sceneProps = filterStudioObjectInsertItems({ kind: "bg3d-scene-prop", family: "scene-furniture", limit: 200 });
    expect(sceneProps).toHaveLength(24);
    expect(listStudioObjectInsertItems().some((item) => item.blockout)).toBe(false);
    for (const ceId of ["bench", "bookshelf", "chair", "desk", "doorway", "stairs", "streetlamp", "window-wall"]) {
      const entry = findStudioObjectInsertItem(`obj-furniture-ce_${ceId}`);
      expect(entry?.kind).toBe("bg3d-scene-prop");
      expect(entry?.assetUrl).toBe(`/creator-essentials/prop-${ceId}.glb`);
      expect(entry?.thumbnailUrl).toBe(`/creator-essentials/prop-${ceId}.preview.png`);
    }
    const polyhavenFiltered = filterStudioObjectInsertItems({ query: "polyhaven", family: "scene-furniture" });
    expect(polyhavenFiltered).toHaveLength(12);
    expect(findStudioObjectInsertItem("obj-furniture-ph_gothicbed_01")?.assetUrl).toBe(
      "/assets/studio/cc0-20260906/assets/polyhaven-gothicbed-01/GothicBed_01.glb",
    );
    const kenneyFiltered = filterStudioObjectInsertItems({ query: "kenney", family: "scene-furniture" });
    expect(kenneyFiltered).toHaveLength(12);
    expect(findStudioObjectInsertItem("obj-furniture-kn_city_building_a")?.assetUrl).toBe(
      "/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-a.glb",
    );
  });

  it("filters by query and family with contrasting results", () => {
    const sword = filterStudioObjectInsertItems({ query: "검" });
    expect(sword.some((item) => item.sourceId === "sword")).toBe(true);
    expect(sword.every((item) => item.kind === "vrm-prop" || item.label.includes("검") || item.keywords.some((k) => k.includes("검")))).toBe(true);

    const box = filterStudioObjectInsertItems({
      query: "box",
      family: "primitive",
    });
    expect(box.some((item) => item.sourceId === "box")).toBe(true);
    expect(box.every((item) => item.family === "primitive")).toBe(true);

    const cafe = filterStudioObjectInsertItems({ query: "카페" });
    expect(cafe.some((item) => item.sourceId === "cafe")).toBe(true);

    const empty = filterStudioObjectInsertItems({
      query: "zzzz-not-a-real-object-zzzz",
    });
    expect(empty).toEqual([]);
  });

  it("plans deterministic placement plates for canvas insert", () => {
    const box = findStudioObjectInsertItem("obj-prim-box");
    expect(box).not.toBeNull();
    const first = planStudioObjectInsertPlacement({
      itemId: "obj-prim-box",
      canvasWidth: 800,
      canvasHeight: 1200,
      existingCount: 0,
    });
    const second = planStudioObjectInsertPlacement({
      itemId: "obj-prim-box",
      canvasWidth: 800,
      canvasHeight: 1200,
      existingCount: 1,
    });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.openTarget).toBe("bg3d-editor");
    expect(first!.sourceId).toBe("box");
    expect(first!.width).toBeGreaterThan(0);
    expect(first!.x).not.toBe(second!.x);

    const anchored = planStudioObjectInsertPlacement({
      itemId: "obj-prop-sword",
      canvasWidth: 800,
      canvasHeight: 1200,
      anchorX: 100,
      anchorY: 200,
    });
    expect(anchored).not.toBeNull();
    expect(anchored!.openTarget).toBe("vrm-poser");
    expect(anchored!.sourceId).toBe("sword");
    expect(anchored!.x).toBeLessThan(100);
    expect(anchored!.y).toBeLessThan(200);

    expect(
      planStudioObjectInsertPlacement({
        itemId: "missing",
        canvasWidth: 800,
        canvasHeight: 1200,
      }),
    ).toBeNull();
  });

  it("exposes family counts for chip UI", () => {
    const families = listStudioObjectInsertFamilies();
    expect(families.length).toBeGreaterThanOrEqual(6);
    expect(families.every((family) => family.count > 0)).toBe(true);
    const primitive = families.find((family) => family.id === "primitive");
    expect(primitive?.count).toBe(Object.keys(PRIMITIVE_DEFS).length);
  });
});
