import type { StudioTeamVrmCutResources } from "../scene3d/studio-team-vrm-cut-assets";
import type { StudioVrmSceneModel } from "./studio-vrm-scene-document";
import type { StudioVrmTexturePaintPersistenceDependencies } from "./studio-vrm-texture-paint-persistence";
import { canonicalizeVrmContentHash, type VrmLibraryEntry } from "./vrm-library";

/** 작품에서 검증한 모델과 이 편집에서 만든 PNG만 보유한다. 창을 닫으면 소유권도 끝난다. */
export function createStudioVrmCutPaintSession(model: StudioVrmSceneModel, resources: StudioTeamVrmCutResources) {
  const bundled = model.source === "bundled";
  const blob = bundled ? resources.bundled?.get(model.id) : resources.blobs.get(model.hash);
  const hash = bundled ? null : canonicalizeVrmContentHash(model.hash);
  if (!blob || (!bundled && (!hash || blob.size !== model.byteSize))) throw new Error("작품에 보관한 캐릭터 원본을 다시 받아 주세요.");
  const entry: VrmLibraryEntry = {
    id: bundled ? model.id : model.hash, source: bundled ? "sample" : "memory",
    name: model.name, thumbnail: null, createdAt: 0, updatedAt: 0,
    ...(hash ? {contentHash: hash, byteSize: blob.size, mimeType: "model/gltf-binary"} : {}),
  };
  const paints = new Map(resources.paints);
  const blobs = new Map(resources.blobs);
  const dependencies: Pick<StudioVrmTexturePaintPersistenceDependencies, "getArtifact" | "saveArtifact"> = {
    async getArtifact(key, options) {
      options?.signal?.throwIfAborted();
      const artifact = paints.get(key);
      if (!artifact) throw new Error("작품에서 받은 채색 원본이 없습니다.");
      return artifact;
    },
    async saveArtifact(artifact, options) {
      options?.signal?.throwIfAborted();
      const receipt = artifact.metadata;
      const deduplicated = paints.has(receipt.contentHash);
      paints.set(receipt.contentHash, artifact);
      blobs.set(receipt.contentHash, artifact.archiveEntry.data);
      return {receipt, deduplicated, creationReceipt: null, mutationGeneration: null};
    },
  };
  function resetStaging() {
    for (const hash of paints.keys()) if (!resources.paints.has(hash)) { paints.delete(hash); blobs.delete(hash); }
  }
  return {entry, blob, dependencies, resetStaging, resources: {blobs, paints, bundled: resources.bundled}};
}

export type StudioVrmCutPaintSession = ReturnType<typeof createStudioVrmCutPaintSession>;
