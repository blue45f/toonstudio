import * as THREE from "three";

const STUDIO_BG3D_RUNTIME_MAX_ANISOTROPY = 16;

// 세 배포본의 두 아틀라스는 8비트 normal/ORM의 모든 텍셀이 0 또는 1로 잘렸다.
const DAMAGED_HERO_ATLAS_HASHES = new Map([
  ["ts-bg3d-hero-v2-kr_modern_office_suite-desktop", "sha256:93a8f17c88d3a8f16b2356a30f4f402de115f7bd811e61ef63f3e82f40439203"],
  ["ts-bg3d-hero-v2-kr_hospital_ward_corridor-desktop", "sha256:f8f93f67e62b52d89af2623fe884e736a2b1fd42fda845be2322a545864aab6b"],
  ["ts-bg3d-hero-v2-kr_seoul_subway_train_platform-desktop", "sha256:528fa4fe3b59dbb4614d2495696d7cf7bc0438b02c33b88c3784ac1c826a1f88"],
]);

export interface StudioBg3dRuntimeAssetQualityInput {
  readonly verifiedModel?: { readonly id: string; readonly contentHash: string };
  castShadow: boolean;
  receiveShadow: boolean;
  /**
   * Renderer that will draw the asset, used only to read the device anisotropy ceiling.
   *
   * WebGL exposes it under `capabilities`; WebGPU exposes it on the renderer itself. Naming one
   * type would silently fall back to the constant on the other, so both shapes are accepted.
   */
  readonly renderer?:
    | (Partial<THREE.WebGLRenderer> & { getMaxAnisotropy?: () => number })
    | null;
  /** qualityBudget lowers anisotropy only; mesh lighting/casting is still controlled by flags. */
  readonly qualityBudget?: number;
}

function clampQualityBudget(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0.2, Math.min(1, value));
}

function collectMaterialTextures(material: THREE.Material): THREE.Texture[] {
  const textures: THREE.Texture[] = [];

  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      textures.push(value);
    }
  }

  if ((material as THREE.ShaderMaterial).isShaderMaterial === true) {
    const shaderUniforms = (material as THREE.ShaderMaterial).uniforms;
    if (shaderUniforms) {
      for (const uniform of Object.values(shaderUniforms)) {
        const candidate = uniform?.value;
        if (candidate instanceof THREE.Texture) {
          textures.push(candidate);
        }
      }
    }
  }

  return textures;
}

/** The importer owns color space, filters, and mip levels, including compressed and NPOT maps. */
function improveTextureAnisotropyForRuntime(
  texture: THREE.Texture,
  qualityBudget: number,
  maxAnisotropy: number,
): void {
  const effectiveAnisotropy = Math.max(1, Math.floor(maxAnisotropy * qualityBudget));
  if (texture.anisotropy !== effectiveAnisotropy) {
    texture.anisotropy = effectiveAnisotropy;
    texture.needsUpdate = true;
  }
}

export function applyStudioBg3dRuntimeAssetQuality(
  root: THREE.Object3D,
  quality: StudioBg3dRuntimeAssetQualityInput
): void {
  const qualityBudget = clampQualityBudget(quality.qualityBudget);
  const rendererMaxAnisotropy = quality.renderer?.capabilities?.getMaxAnisotropy?.()
    ?? quality.renderer?.getMaxAnisotropy?.()
    ?? 1;
  const maxAnisotropy = Number.isFinite(rendererMaxAnisotropy)
    ? Math.max(1, Math.min(STUDIO_BG3D_RUNTIME_MAX_ANISOTROPY, rendererMaxAnisotropy))
    : 1;
  const repairAtlases = quality.verifiedModel !== undefined
    && DAMAGED_HERO_ATLAS_HASHES.get(quality.verifiedModel.id) === quality.verifiedModel.contentHash;
  const visitedTextures = new Set<THREE.Texture>();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if ((mesh as THREE.Mesh).isMesh === true) {
      mesh.castShadow = quality.castShadow;
      mesh.receiveShadow = quality.receiveShadow;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof THREE.Material)) continue;
        if (repairAtlases && material instanceof THREE.MeshStandardMaterial
          && (material.name === "01_Arch_Trim_Atlas" || material.name === "02_Wood_Fabric_Atlas")) {
          // 정점 노멀과 원래 색/정점색은 유효하다. 손상된 데이터 맵만 빼고 비금속 무광 표면으로 그린다.
          material.normalMap = null;
          material.aoMap = null;
          material.roughnessMap = null;
          material.metalnessMap = null;
          material.roughness = 1;
          material.metalness = 0;
        }
        for (const texture of collectMaterialTextures(material)) {
          if (visitedTextures.has(texture)) continue;
          visitedTextures.add(texture);
          improveTextureAnisotropyForRuntime(texture, qualityBudget, maxAnisotropy);
        }
      }
    }
  });
}
