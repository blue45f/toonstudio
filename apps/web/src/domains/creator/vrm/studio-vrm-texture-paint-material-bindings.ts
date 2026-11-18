import type * as THREE from "three";
import {
  STUDIO_VRM_TEXTURE_PAINT_MATERIAL_LOCATOR_USER_DATA_KEY,
  canonicalizeStudioVrmTexturePaintMaterialLocator as canonicalMaterialLocator,
  createStudioVrmTexturePaintBindingDescriptor as createBindingDescriptor,
  type StudioVrmTexturePaintBindingDescriptor,
} from "./studio-vrm-texture-paint-binding";
import { studioVrmMaterialSupportsPaintChannel } from "./studio-vrm-texture-paint-material";
import type { StudioVrmTexturePaintChannel } from "./studio-vrm-texture-paint-channel";

export interface BaseColorMaterial extends THREE.Material {
  map: THREE.Texture | null;
}

export function isBaseColorMaterial(material: unknown): material is BaseColorMaterial {
  return typeof material === "object" && material !== null && "map" in material;
}

function stableScenePathHash(value: string): string {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x0100_0193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createScenePathMaterialLocator(
  objectPath: string,
  materialIndex: number,
): string {
  const candidate = `scene-path:${objectPath}/material-${materialIndex}`;
  return canonicalMaterialLocator(candidate)
    ? candidate
    : `scene-path:hashed-${stableScenePathHash(candidate)}`;
}

/**
 * Returns one deterministic locator per material. GLTFLoader integrations may stamp the stable
 * glTF material index in userData; hand-built/test scenes use a child-index path fallback.
 */
export function collectSceneMaterialBindings(
  scene: THREE.Object3D,
  channel: StudioVrmTexturePaintChannel = "baseColor",
): Map<BaseColorMaterial, StudioVrmTexturePaintBindingDescriptor> {
  const bindings = new Map<BaseColorMaterial, StudioVrmTexturePaintBindingDescriptor>();
  const stack: Array<Readonly<{ object: THREE.Object3D; path: string }>> = [
    { object: scene, path: "root" },
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const mesh = current.object as THREE.Object3D & {
      readonly isMesh?: unknown;
      readonly material?: THREE.Material | THREE.Material[];
    };
    if (mesh.isMesh === true && mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((candidate, materialIndex) => {
        if (!isBaseColorMaterial(candidate) || !studioVrmMaterialSupportsPaintChannel(candidate, channel)) return;
        const stamped = canonicalMaterialLocator(
          candidate.userData?.[STUDIO_VRM_TEXTURE_PAINT_MATERIAL_LOCATOR_USER_DATA_KEY],
        );
        const descriptor = createBindingDescriptor(
          stamped ?? createScenePathMaterialLocator(current.path, materialIndex),
          channel,
        );
        if (!descriptor) return;
        const previous = bindings.get(candidate);
        if (!previous || descriptor.bindingKey < previous.bindingKey) {
          bindings.set(candidate, descriptor);
        }
      });
    }
    for (let childIndex = current.object.children.length - 1; childIndex >= 0; childIndex -= 1) {
      const child = current.object.children[childIndex];
      if (!child) continue;
      stack.push({ object: child, path: `${current.path}/child-${childIndex}` });
    }
  }
  return bindings;
}

export function copyTextureSampling(source: THREE.Texture, target: THREE.Texture): void {
  if (source.matrixAutoUpdate) source.updateMatrix();
  target.mapping = source.mapping;
  target.channel = source.channel;
  target.wrapS = source.wrapS;
  target.wrapT = source.wrapT;
  target.magFilter = source.magFilter;
  target.minFilter = source.minFilter;
  target.anisotropy = source.anisotropy;
  target.colorSpace = source.colorSpace;
  target.offset.copy(source.offset);
  target.repeat.copy(source.repeat);
  target.center.copy(source.center);
  target.rotation = source.rotation;
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  target.matrix.copy(source.matrix);
  target.generateMipmaps = source.generateMipmaps;
  target.premultiplyAlpha = source.premultiplyAlpha;
  target.unpackAlignment = source.unpackAlignment;
  target.flipY = false;
  target.name = source.name ? `${source.name} · Studio paint` : "Studio VRM texture paint";
  target.needsUpdate = true;
}
