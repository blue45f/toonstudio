/** 자기 생성 단색 box GLB에만 붙이는 깊이 편향 표식이다. 일반 재질 설정으로 확장하지 않는다. */
import { MeshBasicMaterial, type Material, type Mesh, type Object3D } from "three";

export const STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY = "toonStudioPrimitiveEditMaterial";
export const STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS = Object.freeze({
  version: 1,
  sourceKind: "box",
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

export function readStudioBg3dPrimitiveEditDepthBias(value: unknown): typeof STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.length === Object.keys(STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS).length
    && Object.entries(STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS).every(([key, expected]) =>
      entries.some(([actualKey, actual]) => actualKey === key && actual === expected))
    ? STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS : null;
}

/** 로더가 material.extras를 userData로 옮긴 뒤, 검증한 고정값만 실제 재질에 반영한다. */
export function restoreStudioBg3dPrimitiveEditMaterialDepthBias(material: Material): boolean {
  const marker: unknown = material.userData[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY];
  const bias = readStudioBg3dPrimitiveEditDepthBias(marker);
  if (!bias) return false;
  material.polygonOffset = bias.polygonOffset;
  material.polygonOffsetFactor = bias.polygonOffsetFactor;
  material.polygonOffsetUnits = bias.polygonOffsetUnits;
  material.needsUpdate = true;
  return true;
}

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && object.isMesh === true;
}

/** 검증 로더·재질을 새로 만드는 폴백이 같은 자산 바이트의 표식을 소비한다. */
export function restoreStudioBg3dPrimitiveEditDepthBias(root: Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      restoreStudioBg3dPrimitiveEditMaterialDepthBias(material);
    }
  });
}

/** 원본 editable 재질을 직접 바꾸지 않아 override·페인트 binding과 충돌하지 않는다. */
export function createStudioBg3dPrimitiveEditLineArtAdapter(root: Object3D): {
  setEnabled(enabled: boolean): void;
  dispose(): void;
} {
  const bindings: { mesh: Mesh; original: Material | Material[] }[] = [];
  const basicByOriginal = new Map<Material, MeshBasicMaterial>();
  root.traverse((object) => {
    if (!isMesh(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.length > 0 && materials.every((material) =>
      readStudioBg3dPrimitiveEditDepthBias(material.userData[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]) !== null)) {
      bindings.push({ mesh: object, original: object.material });
    }
  });
  const basic = (original: Material): MeshBasicMaterial => {
    const existing = basicByOriginal.get(original);
    if (existing) return existing;
    const material = new MeshBasicMaterial({ color: "#ffffff" });
    material.userData[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY] = STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS;
    restoreStudioBg3dPrimitiveEditMaterialDepthBias(material);
    basicByOriginal.set(original, material);
    return material;
  };
  let enabled = false;
  let disposed = false;
  const setEnabled = (next: boolean): void => {
    if (disposed || next === enabled) return;
    enabled = next;
    for (const { mesh, original } of bindings) {
      mesh.material = next ? (Array.isArray(original) ? original.map(basic) : basic(original)) : original;
    }
  };
  return {
    setEnabled,
    dispose() {
      if (disposed) return;
      setEnabled(false);
      disposed = true;
      for (const material of basicByOriginal.values()) material.dispose();
      basicByOriginal.clear();
      bindings.length = 0;
    },
  };
}

/** 같은 자산의 다중 재배치도 선화 모드에서는 인스턴스별 재질 어댑터를 거친다. */
export function shouldRenderStudioBg3dPrimitiveEditLineArtIndividually(root: Object3D, lineArt: boolean): boolean {
  if (!lineArt) return false;
  let marked = false;
  root.traverse((object) => {
    if (marked || !isMesh(object)) return;
    marked = (Array.isArray(object.material) ? object.material : [object.material]).some((material) =>
      readStudioBg3dPrimitiveEditDepthBias(material.userData[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]) !== null);
  });
  return marked;
}
