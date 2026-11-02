import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioBg3dEditableThreeClone } from "../studio-background-3d-model";

import {
  applyStudioBg3dCc0PbrMapsToStandardMaterial,
  clearStudioBg3dCc0PbrTextureCache,
  getStudioBg3dCc0PbrTextureCacheStats,
  getStudioBg3dCc0PbrTextureReadyRevision,
  loadStudioBg3dCc0PbrTextureSet,
  resolveStudioBg3dPrimitiveCc0PbrSpread,
  setStudioBg3dCc0PbrTextureFactoryForTest,
  subscribeStudioBg3dCc0PbrTextureReady,
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
import { buildStudioBg3dSurfaceMaterialOverride } from "./studio-bg3d-surface-material-catalog";

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

describe("PBR 이미지 완료와 demand frame 구독", () => {
  const stops: Array<() => void> = [];
  type PendingLoad = { texture: THREE.Texture; complete: () => void };

  function deferredTextures(resolution = 2048): PendingLoad[] {
    const loads: PendingLoad[] = [];
    setStudioBg3dCc0PbrTextureFactoryForTest((url, onLoad) => {
      if (!onLoad) throw new Error("이미지 완료 callback이 필요합니다.");
      const texture = new THREE.Texture(); texture.name = url;
      loads.push({ texture, complete: () => {
        texture.image = { width: resolution, height: resolution, complete: true };
        texture.needsUpdate = true;
        onLoad(texture);
      } });
      return texture;
    });
    return loads;
  }

  function channel(loads: PendingLoad[], index = 0): PendingLoad {
    const load = loads[index];
    if (!load) throw new Error("캐시에 로드한 실제 채널이 필요합니다.");
    return load;
  }

  function subscribe(listener: () => void): () => void {
    const stop = subscribeStudioBg3dCc0PbrTextureReady(listener);
    stops.push(stop);
    return stop;
  }

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    setStudioBg3dCc0PbrTextureFactoryForTest(null);
    clearStudioBg3dCc0PbrTextureCache();
  });

  it("8K 원본 채널은 이미지가 없는 동안 업로드하지 않고 실제 이미지 완료 뒤 같은 Texture를 갱신한다", async () => {
    const loads = deferredTextures(8192);
    const override = buildStudioBg3dSurfaceMaterialOverride("emaceart-plasticine-01-native-8k");
    if (!override) throw new Error("실제 구매 원본 재질이 필요합니다.");
    const set = loadStudioBg3dCc0PbrTextureSet("emaceart-plasticine-01-native-8k");
    if (!set) throw new Error("실제 구매 원본 텍스처 세트가 필요합니다.");
    const spread = resolveStudioBg3dPrimitiveCc0PbrSpread(override);
    const material = new THREE.MeshStandardMaterial();
    applyStudioBg3dCc0PbrMapsToStandardMaterial(material, override);

    expect(loads).toHaveLength(4);
    expect([spread.map, spread.roughnessMap, spread.metalnessMap, spread.normalMap])
      .toEqual([set.baseColorMap, set.roughnessMap, set.metalnessMap, set.normalMap]);
    expect([material.map, material.roughnessMap, material.metalnessMap, material.normalMap])
      .toEqual([set.baseColorMap, set.roughnessMap, set.metalnessMap, set.normalMap]);
    expect(spread.aoMap).toBeNull();
    for (const load of loads) {
      expect(load.texture.image).toBeNull();
      // Three WebGPU는 version 0을 비동기 default texture 경로로 처리한다.
      expect(load.texture.version).toBe(0);
      expect(load.texture.source.version).toBe(0);
    }

    const before = getStudioBg3dCc0PbrTextureReadyRevision();
    for (const load of loads) load.complete();
    await Promise.resolve();

    expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before + 4);
    expect(loadStudioBg3dCc0PbrTextureSet("emaceart-plasticine-01-native-8k")).toBe(set);
    expect(material.map).toBe(set.baseColorMap);
    for (const load of loads) {
      expect(load.texture.image).toEqual({ width: 8192, height: 8192, complete: true });
      expect(load.texture.version).toBe(1);
      expect(load.texture.source.version).toBe(1);
      expect(load.texture.repeat.toArray()).toEqual([1, 1]);
    }
    expect(set.baseColorMap.colorSpace).toBe(THREE.SRGBColorSpace);
    for (const texture of [set.roughnessMap, set.metalnessMap, set.normalMap]) {
      expect(texture?.colorSpace).toBe(THREE.NoColorSpace);
    }
    material.dispose();
  });

  it("바인딩한 Texture의 비동기 이미지 완료를 한 번 알리고 같은 캐시는 재요청하지 않는다", async () => {
    const loads = deferredTextures();
    const set = loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    if (!set) throw new Error("실제 카탈로그 텍스처 세트가 필요합니다.");
    const material = new THREE.MeshStandardMaterial({ map: set.baseColorMap });
    const before = getStudioBg3dCc0PbrTextureReadyRevision(), versions: number[] = [];
    subscribe(() => {
      expect(material.map).toBe(channel(loads).texture);
      expect(material.map?.image).toMatchObject({ width: 2048, height: 2048 });
      versions.push(getStudioBg3dCc0PbrTextureReadyRevision());
    });
    expect(loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor")).toBe(set);
    expect(loads).toHaveLength(5); expect(versions).toEqual([]);
    await Promise.resolve(); channel(loads).complete();
    expect(versions).toEqual([]);
    await Promise.resolve();
    expect(versions).toEqual([before + 1]);
    channel(loads).complete(); await Promise.resolve();
    expect(versions).toEqual([before + 1]);
    material.dispose();
  });

  it("동기 완료 factory도 캐시와 색공간 설정이 끝난 뒤 구독자에게 알린다", async () => {
    const textures: THREE.Texture[] = [];
    setStudioBg3dCc0PbrTextureFactoryForTest((_url, onLoad) => {
      const texture = new THREE.Texture({ width: 2048, height: 2048 });
      textures.push(texture); onLoad?.(texture);
      return texture;
    });
    const before = getStudioBg3dCc0PbrTextureReadyRevision(), snapshots: number[] = [];
    subscribe(() => {
      expect(getStudioBg3dCc0PbrTextureCacheStats().cachedTextureCount).toBe(5);
      expect(textures[0]?.colorSpace).toBe(THREE.SRGBColorSpace);
      snapshots.push(getStudioBg3dCc0PbrTextureReadyRevision());
    });
    loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    expect(snapshots).toEqual([]);
    await Promise.resolve();
    expect(snapshots).toEqual([1, 2, 3, 4, 5].map((step) => before + step));
  });

  it("구독 전에 완료돼도 snapshot은 진행하고 새 구독의 다음 완료를 놓치지 않는다", async () => {
    const loads = deferredTextures(), before = getStudioBg3dCc0PbrTextureReadyRevision();
    loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    channel(loads).complete(); await Promise.resolve();
    expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before + 1);
    let calls = 0; subscribe(() => { calls++; });
    expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before + 1);
    channel(loads, 1).complete(); await Promise.resolve();
    expect(calls).toBe(1);
    expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before + 2);
  });

  it("구독 해제 뒤에는 완료 알림을 보내지 않고 최신 snapshot만 유지한다", async () => {
    const loads = deferredTextures(), before = getStudioBg3dCc0PbrTextureReadyRevision();
    loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    let calls = 0; const stop = subscribe(() => { calls++; }); stop();
    channel(loads).complete(); await Promise.resolve();
    expect(calls).toBe(0);
    expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before + 1);
  });

  it("캐시 정리 후 늦게 완료된 기존 Texture는 버리고 같은 URL의 새 Texture만 알린다", async () => {
    const loads = deferredTextures(), before = getStudioBg3dCc0PbrTextureReadyRevision();
    loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    const stale = channel(loads); let disposed = 0, calls = 0;
    stale.texture.addEventListener("dispose", () => { disposed++; });
    subscribe(() => { calls++; });
    clearStudioBg3dCc0PbrTextureCache();
    expect(disposed).toBe(1);
    loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    const fresh = channel(loads, 5); expect(fresh.texture).not.toBe(stale.texture);
    stale.complete(); await Promise.resolve();
    expect(calls).toBe(0); expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before);
    fresh.complete(); await Promise.resolve();
    expect(calls).toBe(1); expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before + 1);
  });

  it("캐시에 남아 있어도 이미 dispose한 Texture의 늦은 완료는 알리지 않는다", async () => {
    const loads = deferredTextures(), before = getStudioBg3dCc0PbrTextureReadyRevision();
    loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    let calls = 0; subscribe(() => { calls++; });
    channel(loads).texture.dispose(); channel(loads).complete(); await Promise.resolve();
    expect(calls).toBe(0); expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before);
  });

  it("완료 callback과 알림 microtask 사이에 캐시가 정리돼도 오래된 알림을 보내지 않는다", async () => {
    const loads = deferredTextures(), before = getStudioBg3dCc0PbrTextureReadyRevision();
    loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor");
    let calls = 0; subscribe(() => { calls++; });
    channel(loads).complete(); clearStudioBg3dCc0PbrTextureCache();
    await Promise.resolve();
    expect(calls).toBe(0); expect(getStudioBg3dCc0PbrTextureReadyRevision()).toBe(before);
  });
});
