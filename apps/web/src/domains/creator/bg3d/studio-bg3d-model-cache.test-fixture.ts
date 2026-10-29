import { Group } from "three";
import { vi } from "vitest";

import { studioBg3dModelRuntimeVariant, type StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";
import { classifyStudioBg3dThreeSemanticMaterials } from "./studio-bg3d-three-semantic-materials";
import type { Bg3dVerifiedStoredRecord } from "./studio-bg3d-model-library-loader";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";

/** 저장 ID와 런타임 variant를 별도로 갖는 실제 타입 계약의 테스트 원본. */
export function createStudioBg3dCacheTestRecord(id: string, contentHash = `sha256:${"a".repeat(64)}`): Bg3dVerifiedStoredRecord {
  return {
    id, storageVersion: 2, name: `${id}.glb`, format: "glb",
    blob: new Blob([new Uint8Array(32)], { type: "model/gltf-binary" }), thumbnail: null,
    createdAt: 1, updatedAt: 1, contentHash, byteSize: 32, mime: "model/gltf-binary",
    validationVersion: 1, validatedAt: 1, validatorProfile: "desktop",
    validatorMetrics: {
      byteSize: 32, jsonByteSize: 12, binByteSize: 0, nodes: 0, meshes: 0, meshPrimitives: 0,
      drawCalls: 0, triangles: 0, materials: 0, textures: 0, images: 0, imageBytes: 0,
      estimatedDecodedImageBytes: 0, maxImageDimension: 0, undeterminedImageDimensions: 0,
      lights: 0, animations: 0, animationChannels: 0, animationKeyframes: 0, animationValues: 0,
      skins: 0, joints: 0, morphTargets: 0, accessorElements: 0, estimatedDecodedGeometryBytes: 0,
    },
    rights: { status: "public-domain", commercialUse: true, attributionRequired: false, attribution: "", licenseName: "CC0-1.0" },
  };
}

export function createStudioBg3dCacheTestEntry(
  record: Bg3dVerifiedStoredRecord, backend: StudioBg3dMaterialBackend = "webgl",
): StudioBg3dModelRootCacheEntry {
  const root = new Group();
  return {
    root, record, runtimeVariant: studioBg3dModelRuntimeVariant(backend), dispose: vi.fn(), animations: [],
    admittedProfiles: new Set(["desktop"]), admissionPolicyKeys: new Set(["initial"]), joints: [], morphTargets: [], genericHints: {},
    semanticMaterials: classifyStudioBg3dThreeSemanticMaterials(root),
    metrics: { nodes: 1, triangles: 12, drawCalls: 1, materials: 1, lights: 0, animations: 0,
      animationChannels: 0, animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0,
      morphTargets: 0, accessorElements: 36, estimatedDecodedGeometryBytes: 512, textures: 0,
      textureBytes: 0, maxTextureDimension: 0 },
  };
}
