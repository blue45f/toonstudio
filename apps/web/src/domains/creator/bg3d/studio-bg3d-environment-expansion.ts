import expansionV1Manifest from "../../../../public/assets/3d/environments/expansion-v1/manifest.json";
import expansionV2Manifest from "../../../../public/assets/3d/environments/expansion-v2/manifest.json";

import { defineEnvironment, V3_PROVENANCE } from "./studio-bg3d-environment-definition";
import type { StudioBg3dEnvironmentTheme } from "./studio-bg3d-environment-definition";

export const STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1 = Object.freeze(
  expansionV1Manifest.assets.map((asset) => defineEnvironment({
    id: asset.id,
    name: asset.name,
    description: asset.description,
    theme: asset.theme as StudioBg3dEnvironmentTheme,
    tags: asset.tags,
    fileName: asset.fileName as `${string}.glb`,
    url: asset.url as `/assets/3d/environments/${string}.glb`,
    thumbnailUrl: asset.thumbnailUrl as `/assets/3d/environments/${string}.png`,
    byteSize: asset.byteSize,
    sha256: asset.sha256 as `sha256:${string}`,
    bounds: asset.bounds as [number, number, number],
    camera: {
      position: asset.camera.position as [number, number, number],
      target: asset.camera.target as [number, number, number],
      fovDegrees: asset.camera.fovDegrees,
    },
  }, Object.freeze({
    ...V3_PROVENANCE,
    origin: "original-procedural-with-cc0-sources",
    generator: "scripts/blender/generate_studio_environment_expansion_v1.py",
    sources: Object.freeze([...new Set([
      ...asset.sourceModels.map(({ sourceUrl }) => sourceUrl),
      ...asset.sourceMaterials.map(({ sourceUrl }) => sourceUrl),
    ])]),
  }))),
);

const revisions = new Map(expansionV2Manifest.assets.map((revision) => [revision.sourceId, revision]));

/** 조사실은 원본을 그대로 사용하고 수정된 다섯 배경은 원고가 참조하는 구판과 구분한다. */
export const STUDIO_BG3D_CURRENT_EXPANSION_ENVIRONMENTS = Object.freeze(
  STUDIO_BG3D_ENVIRONMENT_ASSETS_EXPANSION_V1.map((original) => {
    const revision = revisions.get(original.id);
    if (!revision) return original;
    if (revision.sourceSha256 !== original.sha256 || revision.fileName !== original.fileName) {
      throw new Error(`배경 판의 원본 해시가 일치하지 않습니다: ${original.id}`);
    }
    return defineEnvironment({
      ...original,
      id: revision.id,
      url: `/assets/3d/environments/expansion-v2/${original.fileName}`,
      byteSize: revision.byteSize,
      sha256: revision.sha256 as `sha256:${string}`,
    }, Object.freeze({ ...original.provenance, generator: "scripts/blender/refine_studio_environment_expansion_v2.py" }));
  }),
);

