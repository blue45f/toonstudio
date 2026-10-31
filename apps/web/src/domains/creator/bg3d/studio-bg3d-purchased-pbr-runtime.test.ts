import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStudioBg3dEditableThreeClone } from "../studio-background-3d-model";

import {
  applyStudioBg3dCc0PbrMapsToStandardMaterial,
  clearStudioBg3dCc0PbrTextureCache,
  loadStudioBg3dCc0PbrTextureSet,
  resolveStudioBg3dPrimitiveCc0PbrSpread,
  setStudioBg3dCc0PbrTextureFactoryForTest,
} from "./studio-bg3d-cc0-pbr-texture-loader";
import { createStudioBg3dSceneGlbMaterials } from "./studio-bg3d-scene-glb-materials";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  parseStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type {
  StudioBg3dMaterialOverride,
  StudioBg3dPrimitiveNode,
} from "./studio-bg3d-scene-document-types";
import {
  buildStudioBg3dSurfaceMaterialOverride,
  findStudioBg3dSurfaceMaterial,
  resolveStudioBg3dSurfaceMaterialFromOverride,
} from "./studio-bg3d-surface-material-catalog";
import { buildStudioBg3dSurfacePresetOverride } from "./studio-bg3d-surface-presets";

const NATIVE_ID = "emaceart-plasticine-01-native-8k";
const GODOT_ID = "emaceart-plasticine-01-godot-2k";

function purchasedEntry(id: string) {
  const entry = findStudioBg3dSurfaceMaterial(id);
  if (!entry || entry.provider !== "EmacEArt" || !entry.pbrMaps) {
    throw new Error(`구매 재질의 실제 카탈로그 항목이 필요합니다: ${id}`);
  }
  return entry;
}

function purchasedOverride(id: string): StudioBg3dMaterialOverride {
  const override = buildStudioBg3dSurfaceMaterialOverride(id);
  if (!override) throw new Error(`구매 재질 오버라이드가 필요합니다: ${id}`);
  return override;
}

function primitive(override: StudioBg3dMaterialOverride): StudioBg3dPrimitiveNode {
  return {
    id: "purchased-clay",
    name: "구매 점토 재질",
    kind: "primitive",
    primitiveKind: "box",
    color: "#9a6c42",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
    parentId: null,
    materialOverride: override,
  };
}

describe("구매 Plasticine PBR 런타임", () => {
  const requestedUrls: string[] = [];

  beforeEach(() => {
    requestedUrls.length = 0;
    setStudioBg3dCc0PbrTextureFactoryForTest((url) => {
      requestedUrls.push(url);
      const texture = new THREE.Texture();
      texture.name = url;
      return texture;
    });
  });

  afterEach(() => {
    setStudioBg3dCc0PbrTextureFactoryForTest(null);
    clearStudioBg3dCc0PbrTextureCache();
  });

  it("8K 원본의 금속성 맵을 포함한 네 채널과 각 색 공간을 보존한다", () => {
    const entry = purchasedEntry(NATIVE_ID);
    const set = loadStudioBg3dCc0PbrTextureSet(entry.id);
    if (!set || !entry.pbrMaps?.metalnessUrl) throw new Error("8K 금속성 채널이 필요합니다.");

    expect(set.baseColorMap.colorSpace).toBe(THREE.SRGBColorSpace);
    for (const texture of [set.roughnessMap, set.normalMap, set.metalnessMap]) {
      expect(texture).not.toBeNull();
      expect(texture?.colorSpace).toBe(THREE.NoColorSpace);
    }
    expect(new Set(requestedUrls)).toEqual(new Set([
      entry.baseColorUrl,
      entry.pbrMaps.roughnessUrl,
      entry.pbrMaps.normalGlUrl,
      entry.pbrMaps.metalnessUrl,
    ]));
    expect(requestedUrls).toHaveLength(4);
    expect(set.aoMap).toBeNull();
    expect(set.displacementMap).toBeNull();
    expect(set.baseColorMap.userData.studioBg3dSurfaceProvider).toBe("EmacEArt");
    expect(set.baseColorMap.userData).not.toHaveProperty("studioBg3dCc0SourceUrl");
    expect(set.baseColorMap.repeat.toArray()).toEqual([1, 1]);
    expect(loadStudioBg3dCc0PbrTextureSet(entry.id)).toBe(set);
    expect(requestedUrls).toHaveLength(4);
  });

  it("Godot 2K 원본에 없는 금속성·AO·변위 채널을 만들거나 요청하지 않는다", () => {
    const entry = purchasedEntry(GODOT_ID);
    const set = loadStudioBg3dCc0PbrTextureSet(entry.id);
    if (!set || !entry.pbrMaps) throw new Error("2K 원본의 세 채널이 필요합니다.");

    expect(new Set(requestedUrls)).toEqual(new Set([
      entry.baseColorUrl,
      entry.pbrMaps.roughnessUrl,
      entry.pbrMaps.normalGlUrl,
    ]));
    expect(requestedUrls).toHaveLength(3);
    expect(set.metalnessMap).toBeNull();
    expect(set.aoMap).toBeNull();
    expect(set.displacementMap).toBeNull();
    expect(set.baseColorMap.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(set.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(set.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("직접 바인딩에서도 8K 금속성 배율과 원래 노멀 강도를 적용한다", () => {
    const material = new THREE.MeshStandardMaterial({ metalness: 0.25, roughness: 0.3 });
    material.normalScale.set(0.4, 0.6);
    try {
      const set = applyStudioBg3dCc0PbrMapsToStandardMaterial(material, purchasedOverride(NATIVE_ID));
      if (!set) throw new Error("8K 구매 재질 바인딩이 필요합니다.");
      expect(material.metalnessMap).toBe(set.metalnessMap);
      expect(material.metalnessMap).not.toBeNull();
      expect(material.metalness).toBe(1);
      expect(material.roughness).toBe(1);
      expect(material.normalScale.toArray()).toEqual([1, 1]);
    } finally {
      material.dispose();
    }
  });

  it("커스텀 모델의 구매 재질을 바꾸거나 해제해도 원본 맵과 노멀 강도를 복구한다", async () => {
    const originalMap = new THREE.Texture();
    const originalMetalnessMap = new THREE.Texture();
    const originalNormalMap = new THREE.Texture();
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: "#72614b",
      map: originalMap,
      metalnessMap: originalMetalnessMap,
      normalMap: originalNormalMap,
      roughness: 0.35,
      metalness: 0.4,
    });
    sourceMaterial.normalMapType = THREE.ObjectSpaceNormalMap;
    sourceMaterial.normalScale.set(0.23, 0.71);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, sourceMaterial));
    const editable = await createStudioBg3dEditableThreeClone(root);
    try {
      const clonedMesh = editable.root.children[0];
      if (!(clonedMesh instanceof THREE.Mesh) || !(clonedMesh.material instanceof THREE.MeshStandardMaterial)) {
        throw new Error("독립 복제한 표준 재질이 필요합니다.");
      }
      const material = clonedMesh.material;
      editable.applyMaterialOverride(purchasedOverride(NATIVE_ID));
      expect(material.metalnessMap).not.toBeNull();
      expect(material.metalnessMap).not.toBe(originalMetalnessMap);
      expect(material.normalScale.toArray()).toEqual([1, 1]);
      expect(material.normalMapType).toBe(THREE.TangentSpaceNormalMap);
      expect(material.color.getHexString()).toBe("ffffff");

      editable.applyMaterialOverride(purchasedOverride(GODOT_ID));
      expect(material.metalnessMap).toBeNull();
      expect(material.metalness).toBe(0);
      expect(material.normalScale.toArray()).toEqual([1, 1]);

      editable.applyMaterialOverride(undefined);
      expect(material.map).toBe(originalMap);
      expect(material.metalnessMap).toBe(originalMetalnessMap);
      expect(material.normalMap).toBe(originalNormalMap);
      expect(material.normalScale.toArray()).toEqual([0.23, 0.71]);
      expect(material.normalMapType).toBe(THREE.ObjectSpaceNormalMap);
      expect(material.color.getHexString()).toBe("72614b");
      expect(material.roughness).toBe(0.35);
      expect(material.metalness).toBe(0.4);
      expect(sourceMaterial.map).toBe(originalMap);
      expect(sourceMaterial.metalnessMap).toBe(originalMetalnessMap);
      expect(sourceMaterial.normalScale.toArray()).toEqual([0.23, 0.71]);
      expect(sourceMaterial.normalMapType).toBe(THREE.ObjectSpaceNormalMap);
    } finally {
      editable.dispose();
      sourceMaterial.dispose();
      geometry.dispose();
      originalMap.dispose();
      originalMetalnessMap.dispose();
      originalNormalMap.dispose();
    }
  });

  it("재질 배율의 null 오버라이드는 기존 모델 값을 유지한다", () => {
    const material = new THREE.MeshStandardMaterial({ metalness: 0.25, roughness: 0.3 });
    try {
      const override = { ...purchasedOverride(NATIVE_ID), metalness: null, roughness: null };
      expect(applyStudioBg3dCc0PbrMapsToStandardMaterial(material, override)).not.toBeNull();
      expect(material.metalness).toBe(0.25);
      expect(material.roughness).toBe(0.3);
    } finally {
      material.dispose();
    }
  });

  it("기존 도형 색과 관계없이 구매 원본의 중립 색상·금속성·노멀을 전달한다", () => {
    const override = purchasedOverride(NATIVE_ID);
    const spread = resolveStudioBg3dPrimitiveCc0PbrSpread(override, null, "#9a6c42");
    const material = new THREE.MeshStandardMaterial({ color: "#9a6c42", ...spread });
    try {
      expect(material.color.getHexString()).toBe("ffffff");
      expect(material.metalnessMap).not.toBeNull();
      expect(material.normalScale.toArray()).toEqual([1, 1]);
    } finally {
      material.dispose();
    }
  });

  it("직접 그린 컬러 맵을 우선하면서 구매 원본의 물리 채널을 유지한다", () => {
    const override = purchasedOverride(NATIVE_ID);
    const source = resolveStudioBg3dPrimitiveCc0PbrSpread(override, null, "#6e523b");
    const paint = new THREE.Texture();
    try {
      const painted = resolveStudioBg3dPrimitiveCc0PbrSpread(override, paint, "#6e523b");
      expect(painted.map).toBe(paint);
      expect(painted.roughnessMap).toBe(source.roughnessMap);
      expect(painted.normalMap).toBe(source.normalMap);
      expect(painted.metalnessMap).toBe(source.metalnessMap);
      const material = new THREE.MeshStandardMaterial({ color: "#6e523b", ...painted });
      expect(material.color.getHexString()).toBe("ffffff");
      material.dispose();
    } finally {
      paint.dispose();
    }
  });

  it.each([NATIVE_ID, GODOT_ID])("장면 문서 왕복 뒤에도 원본 변형 ID %s를 유지한다", (id) => {
    const override = purchasedOverride(id);
    const document = { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, nodes: [primitive(override)] };
    const parsed = parseStudioBg3dSceneDocument(JSON.stringify(document));
    const node = parsed?.nodes[0];
    expect(node?.kind).toBe("primitive");
    const restored = node?.kind === "primitive" ? node.materialOverride : undefined;
    expect(restored?.surfaceMaterialId).toBe(id);
    expect(resolveStudioBg3dSurfaceMaterialFromOverride(restored)?.id).toBe(id);
    expect(buildStudioBg3dSurfacePresetOverride(id)?.surfaceMaterialId).toBe(id);
  });

  it("GLB 내보내기 재질에도 화면과 같은 구매 맵·배율·중립 색상을 전달한다", () => {
    const override = purchasedOverride(NATIVE_ID);
    const expected = loadStudioBg3dCc0PbrTextureSet(NATIVE_ID);
    const materials = createStudioBg3dSceneGlbMaterials();
    try {
      const material = materials.primitive(primitive(override));
      expect(material.map).toBe(expected?.baseColorMap);
      expect(material.metalnessMap).toBe(expected?.metalnessMap);
      expect(material.metalnessMap).not.toBeNull();
      expect(material.normalScale.toArray()).toEqual([1, 1]);
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(1);
      expect(material.color.getHexString()).toBe("ffffff");
    } finally {
      materials.dispose();
    }
  });

  it("기존 CC0 바인더의 노멀 강도와 도형 기본 색상 동작을 유지한다", () => {
    const override = buildStudioBg3dSurfaceMaterialOverride("polyhaven-wood-floor");
    const material = new THREE.MeshStandardMaterial();
    try {
      expect(applyStudioBg3dCc0PbrMapsToStandardMaterial(material, override)).not.toBeNull();
      expect(material.normalScale.toArray()).toEqual([0.85, 0.85]);
      expect(material.map?.userData).toHaveProperty("studioBg3dCc0SourceUrl");
      const spread = resolveStudioBg3dPrimitiveCc0PbrSpread(override, null, "#9a6c42");
      expect(spread.color).toBeUndefined();
      expect(spread.normalScale).toBeUndefined();
    } finally {
      material.dispose();
    }
  });
});
