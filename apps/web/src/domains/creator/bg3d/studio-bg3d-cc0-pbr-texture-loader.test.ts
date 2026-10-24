import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioBg3dEditableThreeClone } from "../studio-background-3d-model";

import {
  applyStudioBg3dCc0PbrMapsToStandardMaterial,
  clearStudioBg3dCc0PbrTextureCache,
  getStudioBg3dCc0PbrTextureCacheStats,
  loadStudioBg3dCc0PbrTextureSet,
  resolveStudioBg3dPrimitiveCc0PbrSpread,
  setStudioBg3dCc0PbrTextureFactoryForTest,
} from "./studio-bg3d-cc0-pbr-texture-loader";
import {
  buildStudioBg3dCc0SurfaceMaterialOverride,
  resolveStudioBg3dCc0SurfaceMaterialFromOverride,
} from "./studio-bg3d-cc0-surface-material-catalog";
import {
  applyStudioBg3dRoomSurfaceKitToSpec,
  buildStudioBg3dRoomParts,
  clampStudioBg3dRoomSpec,
} from "./studio-bg3d-room-builder";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  parseStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { buildStudioBg3dSurfacePresetOverride } from "./studio-bg3d-surface-presets";

describe("studio-bg3d-cc0-pbr-texture-loader", () => {
  afterEach(() => {
    setStudioBg3dCc0PbrTextureFactoryForTest(null);
    clearStudioBg3dCc0PbrTextureCache();
  });

  it("loads and caches 5-channel 2K PBR textures with sRGB baseColor and linear data maps", () => {
    const requestedUrls: string[] = [];
    setStudioBg3dCc0PbrTextureFactoryForTest((url) => {
      requestedUrls.push(url);
      const tex = new THREE.Texture();
      tex.name = url;
      return tex;
    });

    const set1 = loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    expect(set1).not.toBeNull();
    expect(set1?.materialId).toBe("polyhaven-wood-floor");
    expect(set1?.baseColorMap.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(set1?.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(set1?.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(set1?.aoMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(set1?.displacementMap?.colorSpace).toBe(THREE.NoColorSpace);

    expect(set1?.baseColorMap.wrapS).toBe(THREE.RepeatWrapping);
    expect(set1?.baseColorMap.wrapT).toBe(THREE.RepeatWrapping);
    expect(set1?.baseColorMap.repeat.x).toBe(2);
    expect(set1?.baseColorMap.repeat.y).toBe(2);
    expect(requestedUrls).toHaveLength(5);

    const set2 = loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    expect(set2).toBe(set1);
    expect(requestedUrls).toHaveLength(5);
    expect(getStudioBg3dCc0PbrTextureCacheStats()).toEqual({
      cachedTextureCount: 5,
      cachedMaterialSetCount: 1,
    });
  });

  it("binds and restores 2K PBR maps on THREE.MeshStandardMaterial and createStudioBg3dEditableThreeClone", async () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#cccccc", roughness: 0.5, metalness: 0.1 }),
    );
    const root = new THREE.Group();
    root.add(mesh);

    const editable = await createStudioBg3dEditableThreeClone(root);
    const clonedMesh = editable.root.children[0] as THREE.Mesh;
    const clonedMat = clonedMesh.material as THREE.MeshStandardMaterial;

    const override = buildStudioBg3dCc0SurfaceMaterialOverride("polyhaven-brick-wall-001");
    expect(override?.surfaceMaterialId).toBe("polyhaven-brick-wall-001");
    expect(resolveStudioBg3dCc0SurfaceMaterialFromOverride(override)?.id).toBe(
      "polyhaven-brick-wall-001",
    );

    editable.applyMaterialOverride(override ?? undefined);
    expect(clonedMat.map).not.toBeNull();
    expect(clonedMat.roughnessMap).not.toBeNull();
    expect(clonedMat.normalMap).not.toBeNull();
    expect(clonedMat.aoMap).not.toBeNull();
    expect(clonedMat.roughness).toBe(0.86);

    // Clearing the override restores original material state with null maps
    editable.applyMaterialOverride(undefined);
    expect(clonedMat.map).toBeNull();
    expect(clonedMat.roughnessMap).toBeNull();
    expect(clonedMat.normalMap).toBeNull();
    expect(clonedMat.aoMap).toBeNull();
    expect(clonedMat.roughness).toBe(0.5);
    editable.dispose();
  });

  it("resolves primitive PBR spread and preserves paintTexture precedence when painted", () => {
    const override = buildStudioBg3dSurfacePresetOverride("polyhaven-marble-tiles");
    expect(override?.surfaceMaterialId).toBe("polyhaven-marble-tiles");

    const spreadWithoutPaint = resolveStudioBg3dPrimitiveCc0PbrSpread(override, null);
    expect(spreadWithoutPaint.map).not.toBeNull();
    expect(spreadWithoutPaint.roughnessMap).not.toBeNull();
    expect(spreadWithoutPaint.normalMap).not.toBeNull();
    expect(spreadWithoutPaint.aoMap).not.toBeNull();

    const paintTex = new THREE.Texture();
    const spreadWithPaint = resolveStudioBg3dPrimitiveCc0PbrSpread(override, paintTex);
    expect(spreadWithPaint.map).toBe(paintTex);
    expect(spreadWithPaint.roughnessMap).toBe(spreadWithoutPaint.roughnessMap);
    expect(spreadWithPaint.normalMap).toBe(spreadWithoutPaint.normalMap);

    const directMat = new THREE.MeshStandardMaterial();
    expect(applyStudioBg3dCc0PbrMapsToStandardMaterial(directMat, override)).not.toBeNull();
    expect(directMat.map).toBe(spreadWithoutPaint.map);
  });

  it("preserves optional surfaceMaterialId in strict v3 scene document round-trip and room builder parts", () => {
    const override = buildStudioBg3dCc0SurfaceMaterialOverride("polyhaven-wood-floor")!;
    const docWithPbr = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      nodes: [
        {
          id: "floor-1",
          name: "바닥",
          kind: "primitive" as const,
          primitiveKind: "box" as const,
          color: "#9a6c42",
          transform: {
            position: [0, 0, 0] as const,
            rotation: [0, 0, 0] as const,
            scale: [6, 0.1, 5] as const,
          },
          visible: true,
          locked: false,
          castsShadow: true,
          receivesShadow: true,
          parentId: null,
          materialOverride: override,
        },
      ],
    };

    const parsed = parseStudioBg3dSceneDocument(JSON.stringify(docWithPbr));
    expect(parsed).not.toBeNull();
    const node = parsed?.nodes[0];
    expect(node?.kind === "primitive" ? node.materialOverride?.surfaceMaterialId : null).toBe(
      "polyhaven-wood-floor",
    );

    // Room builder kit application attaches floor and wall CC0 2K PBR overrides
    const baseRoom = clampStudioBg3dRoomSpec({ width: 6, depth: 5 });
    const kittedRoom = applyStudioBg3dRoomSurfaceKitToSpec(baseRoom, "classroom_wood_plaster");
    expect(kittedRoom.floorMaterialId).toBe("polyhaven-wood-floor");
    expect(kittedRoom.wallMaterialId).toBe("polyhaven-white-rough-plaster");

    const parts = buildStudioBg3dRoomParts(kittedRoom);
    const floorPart = parts.find((part) => part.name === "바닥");
    const wallParts = parts.filter((part) => part.wall !== undefined);
    expect(floorPart?.materialOverride?.surfaceMaterialId).toBe("polyhaven-wood-floor");
    expect(wallParts.length).toBeGreaterThan(0);
    for (const wallPart of wallParts) {
      expect(wallPart.materialOverride?.surfaceMaterialId).toBe("polyhaven-white-rough-plaster");
    }
  });
});
