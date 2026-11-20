/**
 * Character Shaper — 시맨틱 PSD 내보내기용 씬 첨부 루트(의상·소품)와
 * 표면 드로잉 텍스처 프로바이더 조립기.
 *
 * `CharacterShaperOutputDock`가 `exportCharacterSemanticPsd`를 호출할 때
 * 절차적 의상(`wardrobe:*`), 소품(`prop:*`), 그리고 `StudioVrmTexturePaintRuntime`의
 * 페인트 전용 텍스처를 빠짐없이 전달해 `surface-paint` 레이어와 의상/소품 마스크를 실출력한다.
 */
import * as THREE from "three";

import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { StudioVrmTexturePaintRuntime } from "../vrm/studio-vrm-texture-paint-runtime";
import type { CharacterPaintTextureProvider } from "./character-shaper-semantic-psd";
import type { VRM } from "@pixiv/three-vrm";

const WARDROBE_ROOT_PREFIX = /^wardrobe:(?:inner|outer|top|bottom|shoes|legwear)\b/u;
const PROP_ROOT_PREFIX = /^prop:/u;

export interface CharacterSemanticSceneInputs {
  readonly garmentRoots: readonly THREE.Object3D[];
  readonly propRoots: readonly THREE.Object3D[];
  readonly paintTextureProvider?: CharacterPaintTextureProvider;
  readonly dispose: () => void;
}

function isDescendantOf(node: THREE.Object3D, ancestor: THREE.Object3D | null | undefined): boolean {
  if (!ancestor) return false;
  let current: THREE.Object3D | null = node;
  for (let depth = 0; current && depth < 32; depth += 1) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

/**
 * 씬에서 절차적 의상(`wardrobe:*`)과 소품(`prop:*`) 루트를 수집한다.
 * 이미 `vrm.scene` 내부에 붙어 있더라도 명시 루트로 넘기면 `indexCharacterMeshes`가 중복을 제거하고
 * 정확한 시맨틱 마스크(`mask-top`/`mask-bottom`/`mask-shoes`/`mask-accessory`)로 분류한다.
 */
export function collectCharacterSceneAttachmentRoots(
  scene: THREE.Object3D | null | undefined,
  vrm?: VRM | null,
): { readonly garmentRoots: readonly THREE.Object3D[]; readonly propRoots: readonly THREE.Object3D[] } {
  const garmentRoots: THREE.Object3D[] = [];
  const propRoots: THREE.Object3D[] = [];
  if (!scene || typeof scene.traverse !== "function") {
    return Object.freeze({ garmentRoots, propRoots });
  }
  const seenGarments = new Set<THREE.Object3D>();
  const seenProps = new Set<THREE.Object3D>();

  scene.traverse((object) => {
    const name = typeof object.name === "string" ? object.name : "";
    if (!name) return;
    if (WARDROBE_ROOT_PREFIX.test(name) && !seenGarments.has(object)) {
      seenGarments.add(object);
      garmentRoots.push(object);
      return;
    }
    if (PROP_ROOT_PREFIX.test(name) && !seenProps.has(object)) {
      seenProps.add(object);
      propRoots.push(object);
    }
  });

  // vrm.scene 밖의 최상위 첨부만 추가 보장하되, vrm 내부의 부착 노드는 이미 위에서 수집됨
  void isDescendantOf;
  void vrm;
  return Object.freeze({
    garmentRoots: Object.freeze(garmentRoots),
    propRoots: Object.freeze(propRoots),
  });
}

function findMaterialsMatchingLocator(
  scene: THREE.Object3D,
  materialLocator: string,
): THREE.Material[] {
  const matched: THREE.Material[] = [];
  const seen = new Set<THREE.Material>();
  if (typeof scene.traverse !== "function") return matched;

  let meshIndex = 0;
  scene.traverse((object) => {
    const mesh = object as Partial<THREE.Mesh>;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const meshName = typeof mesh.name === "string" ? mesh.name : "";
    materials.forEach((mat, slotIndex) => {
      if (!mat || seen.has(mat)) return;
      const matName = typeof mat.name === "string" ? mat.name : "";
      const exactNameHit =
        materialLocator === matName
        || materialLocator === `${meshName}:${matName}`
        || materialLocator === `${meshName}#${slotIndex}`
        || materialLocator === `mesh[${meshIndex}]:${slotIndex}`
        || (matName.length > 0 && materialLocator.includes(matName));
      if (exactNameHit) {
        seen.add(mat);
        matched.push(mat);
      }
    });
    meshIndex += 1;
  });
  return matched;
}

/**
 * `StudioVrmTexturePaintRuntime`에서 페인트된 타깃의 RGBA 픽셀을 읽어
 * `Map<THREE.Material, THREE.Texture>`로 제공하는 `CharacterPaintTextureProvider`를 만든다.
 * 생성된 임시 `DataTexture`는 반환된 `dispose()`로 정리한다.
 */
export function resolveCharacterSemanticSceneInputs(
  host: StudioVrmPoserHost,
  scene: THREE.Object3D | null | undefined,
): CharacterSemanticSceneInputs {
  const { garmentRoots, propRoots } = collectCharacterSceneAttachmentRoots(scene, host.vrm);
  const paintRuntime = (host.texturePaintRuntimeRef?.current ?? host.texturePaintRuntime ?? null) as
    | StudioVrmTexturePaintRuntime
    | null;
  const createdTextures: THREE.DataTexture[] = [];

  const paintTextureProvider: CharacterPaintTextureProvider | undefined =
    paintRuntime && typeof paintRuntime.exportPaintedTargets === "function"
      ? () => {
          const exported = paintRuntime.exportPaintedTargets();
          if (!exported.ok || exported.value.length === 0 || !scene) return null;

          const map = new Map<THREE.Material, THREE.Texture>();
          for (const target of exported.value) {
            const texture = new THREE.DataTexture(
              target.pixels,
              target.width,
              target.height,
              THREE.RGBAFormat,
            );
            texture.flipY = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
            createdTextures.push(texture);

            for (const binding of target.bindings) {
              const materials = findMaterialsMatchingLocator(scene, binding.materialLocator);
              for (const material of materials) {
                map.set(material, texture);
              }
            }
          }
          return map.size > 0 ? map : null;
        }
      : undefined;

  return Object.freeze({
    garmentRoots,
    propRoots,
    paintTextureProvider,
    dispose() {
      for (const texture of createdTextures) {
        texture.dispose();
      }
      createdTextures.length = 0;
    },
  });
}
