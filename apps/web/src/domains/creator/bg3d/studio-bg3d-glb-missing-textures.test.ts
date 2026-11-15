import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createStudioBg3dEditableThreeClone } from "../studio-background-3d-model";
import {
  applyStudioBg3dMissingTextureOverridesToClone,
  attachStudioBg3dGlbMissingTextureMetadata,
  createStudioBg3dMissingTextureSlotKey,
  disposeStudioBg3dRelinkedTexture,
  getStudioBg3dMissingTextureFallbackPreview,
  hasStudioBg3dMissingTextures,
  isStudioBg3dFallbackPreviewTexture,
  readStudioBg3dGlbMissingTextureReport,
  type MinimalGltfParserLike,
} from "./studio-bg3d-glb-missing-textures";

function makeLoadedTexture(name: string): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}

describe("studio-bg3d-glb-missing-textures", () => {
  it("문제가 있는 재질·슬롯만 식별하고 같은 GLB 안의 정상 재질은 건드리지 않는다", async () => {
    const root = new THREE.Group();
    const brokenFloorMat = new THREE.MeshStandardMaterial({ name: "ArtStudio_ConcreteFloor" });
    // map is null because createImageBitmap failed on concrete_floor_02_base!
    brokenFloorMat.normalMap = makeLoadedTexture("concrete_floor_02_normal");

    const healthyWoodMat = new THREE.MeshStandardMaterial({ name: "ArtStudio_BirchWood" });
    const woodBaseTex = makeLoadedTexture("birch_wood_base");
    healthyWoodMat.map = woodBaseTex;

    const healthySolidMat = new THREE.MeshStandardMaterial({
      name: "ArtStudio_CadmiumPaint",
      color: "#d94f3d",
    });

    const geo = new THREE.BoxGeometry(1, 1, 1);
    root.add(new THREE.Mesh(geo, brokenFloorMat));
    root.add(new THREE.Mesh(geo, healthyWoodMat));
    root.add(new THREE.Mesh(geo, healthySolidMat));

    const parser: MinimalGltfParserLike = {
      json: {
        materials: [
          {
            name: "ArtStudio_ConcreteFloor",
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
            normalTexture: { index: 1 },
          },
          {
            name: "ArtStudio_BirchWood",
            pbrMetallicRoughness: { baseColorTexture: { index: 2 } },
          },
          {
            name: "ArtStudio_CadmiumPaint",
          },
        ],
        textures: [{ source: 0 }, { source: 1 }, { source: 2 }],
        images: [
          { name: "concrete_floor_02_base" },
          { name: "concrete_floor_02_normal" },
          { name: "birch_wood_base" },
        ],
      },
      associations: new Map<unknown, { materials?: number }>([
        [brokenFloorMat, { materials: 0 }],
        [healthyWoodMat, { materials: 1 }],
        [healthySolidMat, { materials: 2 }],
      ]),
    };

    const report = attachStudioBg3dGlbMissingTextureMetadata(root, parser);
    expect(hasStudioBg3dMissingTextures(root)).toBe(true);
    expect(readStudioBg3dGlbMissingTextureReport(root)).toEqual(report);
    expect(report.totalMaterialCount).toBe(3);
    expect(report.problemMaterialCount).toBe(1);
    expect(report.healthyMaterialCount).toBe(2);
    expect(report.missingSlots).toHaveLength(1);
    expect(report.missingSlots[0]).toMatchObject({
      slotKey: "mat:0:baseColor",
      materialKey: "mat:0",
      materialName: "ArtStudio_ConcreteFloor",
      slot: "baseColor",
      slotLabel: "기본 색상",
      imageName: "concrete_floor_02_base",
    });

    // Cached source material itself stays clean before per-instance clone application
    expect(brokenFloorMat.map).toBeNull();

    // Clone two independent instances and verify per-instance isolation
    const cloneA = await createStudioBg3dEditableThreeClone(root);
    const cloneB = await createStudioBg3dEditableThreeClone(root);

    applyStudioBg3dMissingTextureOverridesToClone(cloneA.root, undefined);
    applyStudioBg3dMissingTextureOverridesToClone(cloneB.root, undefined);

    const meshesA = cloneA.root.children as THREE.Mesh[];
    const floorCloneA = meshesA[0]!.material as THREE.MeshStandardMaterial;
    const woodCloneA = meshesA[1]!.material as THREE.MeshStandardMaterial;
    const solidCloneA = meshesA[2]!.material as THREE.MeshStandardMaterial;

    // Fallback preview applies ONLY to the missing baseColor slot of ArtStudio_ConcreteFloor
    expect(isStudioBg3dFallbackPreviewTexture(floorCloneA.map)).toBe(true);
    expect(floorCloneA.normalMap?.name).toBe("concrete_floor_02_normal");
    expect(woodCloneA.map).toBe(woodBaseTex);
    expect(solidCloneA.map).toBeNull();

    // Turning off fallback preview on cloneA does NOT affect cloneB
    const slotKey = createStudioBg3dMissingTextureSlotKey("mat:0", "baseColor");
    applyStudioBg3dMissingTextureOverridesToClone(cloneA.root, {
      [slotKey]: { fallbackPreviewEnabled: false },
    });
    const floorCloneB = (cloneB.root.children[0] as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(floorCloneA.map).toBeNull();
    expect(isStudioBg3dFallbackPreviewTexture(floorCloneB.map)).toBe(true);

    // Relinking a replacement texture on cloneA replaces ONLY cloneA's missing slot
    const relinkTex = makeLoadedTexture("relinked_floor.png");
    relinkTex.userData = { studioBg3dIsRelinkedTexture: true };
    applyStudioBg3dMissingTextureOverridesToClone(cloneA.root, {
      [slotKey]: {
        fallbackPreviewEnabled: true,
        relinkedTexture: relinkTex,
        relinkedFileName: "relinked_floor.png",
      },
    });
    expect(floorCloneA.map).toBe(relinkTex);
    expect(woodCloneA.map).toBe(woodBaseTex);
    expect(floorCloneB.map).toBe(getStudioBg3dMissingTextureFallbackPreview("baseColor"));

    disposeStudioBg3dRelinkedTexture(relinkTex);
    cloneA.dispose();
    cloneB.dispose();
    geo.dispose();
    brokenFloorMat.dispose();
    healthyWoodMat.dispose();
    healthySolidMat.dispose();
  });
});
