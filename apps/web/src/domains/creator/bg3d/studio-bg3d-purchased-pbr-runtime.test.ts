import { applyProps } from "@react-three/fiber";
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
import { updateStudioBg3dStandardMaterialShaderTopology } from "./studio-bg3d-material-shader-topology";
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
import {
  buildStudioBg3dSurfacePresetOverride,
  resolveStudioBg3dPrimitiveSurfaceMaterialProps,
} from "./studio-bg3d-surface-presets";

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

describe("도형 표준 재질의 맵 shader 구성 갱신", () => {
  function mappedMaterial() {
    const maps = {
      map: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
      metalnessMap: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      aoMap: new THREE.Texture(),
    };
    return { material: new THREE.MeshStandardMaterial(maps), textures: Object.values(maps) };
  }

  it("초기 props와 중복 onUpdate는 재질의 최초 프로그램 버전을 올리지 않는다", () => {
    const empty = new THREE.MeshStandardMaterial();
    const { material, textures } = mappedMaterial();
    try {
      for (const target of [empty, material]) {
        const initial = target.version;
        updateStudioBg3dStandardMaterialShaderTopology(target);
        updateStudioBg3dStandardMaterialShaderTopology(target);
        expect(target.version).toBe(initial);
      }
    } finally {
      empty.dispose();
      material.dispose();
      textures.forEach((texture) => texture.dispose());
    }
  });

  it("맵 없는 glass 적용·Undo는 opaque 프로그램을 갱신하고 opacity 숫자 변경만으로는 갱신하지 않는다", () => {
    const glass = buildStudioBg3dSurfacePresetOverride("glass");
    if (!glass) throw new Error("실제 glass 프리셋이 필요합니다.");
    const bareProps = resolveStudioBg3dPrimitiveSurfaceMaterialProps(undefined);
    const glassProps = resolveStudioBg3dPrimitiveSurfaceMaterialProps(glass);
    const material = new THREE.MeshStandardMaterial();
    try {
      applyProps(material, bareProps);
      updateStudioBg3dStandardMaterialShaderTopology(material);
      const initial = material.version;
      applyProps(material, glassProps);
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.map).toBeNull(); expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(0.35); expect(material.version).toBe(initial + 1);
      applyProps(material, { ...glassProps, opacity: 0.6 });
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.opacity).toBe(0.6); expect(material.version).toBe(initial + 1);
      applyProps(material, bareProps);
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.map).toBeNull(); expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1); expect(material.version).toBe(initial + 2);
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
    } finally { material.dispose(); }
  });

  it("Front·Double·Back 면 방향 전이는 한 번씩 갱신하고 같은 방향은 유지한다", () => {
    const material = new THREE.MeshStandardMaterial();
    const sides: THREE.Side[] = [THREE.DoubleSide, THREE.BackSide, THREE.FrontSide];
    try {
      updateStudioBg3dStandardMaterialShaderTopology(material);
      let expected = material.version;
      for (const side of sides) {
        material.side = side;
        updateStudioBg3dStandardMaterialShaderTopology(material);
        expected += 1; expect(material.version).toBe(expected);
        updateStudioBg3dStandardMaterialShaderTopology(material);
        expect(material.version).toBe(expected);
      }
    } finally { material.dispose(); }
  });

  it("실제 opaque의 blending·coverage 조건과 별도의 alpha-to-coverage 분기를 반영한다", () => {
    const material = new THREE.MeshStandardMaterial();
    try {
      updateStudioBg3dStandardMaterialShaderTopology(material);
      const initial = material.version;
      material.blending = THREE.AdditiveBlending;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 1);
      material.blending = THREE.MultiplyBlending;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 1);
      material.blending = THREE.NormalBlending;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
      material.alphaToCoverage = true;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 3);
      material.transparent = true;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 3);
      material.alphaToCoverage = false;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 4);
    } finally { material.dispose(); }
  });

  const textureSlots: Array<"map" | "roughnessMap" | "metalnessMap" | "normalMap" | "aoMap"> = [
    "map", "roughnessMap", "metalnessMap", "normalMap", "aoMap",
  ];

  it.each(textureSlots)("%s의 추가와 해제는 각각 한 번만 프로그램 버전을 올린다", (slot) => {
    const material = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture();
    let disposed = 0;
    texture.addEventListener("dispose", () => { disposed += 1; });
    try {
      updateStudioBg3dStandardMaterialShaderTopology(material);
      const initial = material.version;
      material[slot] = texture;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 1);
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 1);
      material[slot] = null;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
      expect(disposed).toBe(0);
    } finally {
      material.dispose();
      texture.dispose();
    }
  });

  it("같은 맵 구성의 Texture 교체·업로드 표시·색과 uniform 변경은 재컴파일하지 않는다", () => {
    const { material, textures } = mappedMaterial();
    const replacement = new THREE.Texture();
    let disposed = 0;
    for (const texture of [...textures, replacement]) {
      texture.addEventListener("dispose", () => { disposed += 1; });
    }
    try {
      updateStudioBg3dStandardMaterialShaderTopology(material);
      const initial = material.version;
      for (const slot of textureSlots) material[slot] = replacement;
      replacement.needsUpdate = true;
      replacement.repeat.set(2, 3);
      replacement.offset.set(0.2, 0.4);
      material.color.set("#6e523b");
      material.roughness = 0.4;
      material.metalness = 0.2;
      material.normalScale.set(0.4, 0.6);
      material.aoMapIntensity = 0.7;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial);
      expect(disposed).toBe(0);
    } finally {
      material.dispose();
      textures.forEach((texture) => texture.dispose());
      replacement.dispose();
    }
  });

  it("노멀과 AO를 포함한 각 맵의 UV 채널 변경은 한 번씩 프로그램을 갱신한다", () => {
    const { material, textures } = mappedMaterial();
    try {
      updateStudioBg3dStandardMaterialShaderTopology(material);
      let expected = material.version;
      for (const texture of textures) {
        texture.channel = 1;
        updateStudioBg3dStandardMaterialShaderTopology(material);
        expected += 1;
        expect(material.version).toBe(expected);
        updateStudioBg3dStandardMaterialShaderTopology(material);
        expect(material.version).toBe(expected);
      }
    } finally {
      material.dispose();
      textures.forEach((texture) => texture.dispose());
    }
  });

  it("노멀 공간과 packed RG shader 분기만 갱신하고 같은 packed 형식 교체는 유지한다", () => {
    const normal = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ normalMap: normal });
    try {
      updateStudioBg3dStandardMaterialShaderTopology(material);
      const initial = material.version;
      normal.format = THREE.RGFormat;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 1);
      const packedFormats: THREE.Texture["format"][] = [THREE.RG11_EAC_Format, THREE.RED_GREEN_RGTC2_Format];
      for (const format of packedFormats) {
        normal.format = format;
        updateStudioBg3dStandardMaterialShaderTopology(material);
        expect(material.version).toBe(initial + 1);
      }
      material.normalMapType = THREE.ObjectSpaceNormalMap;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
      normal.format = THREE.RGBAFormat;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
      material.normalMapType = THREE.TangentSpaceNormalMap;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 3);
    } finally {
      material.dispose();
      normal.dispose();
    }
  });

  it("비디오 컬러 맵의 sRGB decode 분기만 갱신하고 일반 맵의 색 공간은 유지한다", () => {
    const videoMap = new THREE.Texture();
    const ordinaryMap = new THREE.Texture();
    // DOM 디코딩 없이 Three가 shader 키에서 읽는 비디오 표식만 지정한다.
    Object.defineProperty(videoMap, "isVideoTexture", { value: true });
    const material = new THREE.MeshStandardMaterial({ map: videoMap });
    try {
      updateStudioBg3dStandardMaterialShaderTopology(material);
      const initial = material.version;
      videoMap.colorSpace = THREE.SRGBColorSpace;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 1);
      videoMap.colorSpace = THREE.LinearSRGBColorSpace;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
      ordinaryMap.colorSpace = THREE.SRGBColorSpace;
      material.map = ordinaryMap;
      updateStudioBg3dStandardMaterialShaderTopology(material);
      expect(material.version).toBe(initial + 2);
    } finally {
      material.dispose();
      videoMap.dispose();
      ordinaryMap.dispose();
    }
  });
});
