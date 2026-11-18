import { getStoredVrmModelByHash, hashVrmBlob, selectableSampleVrmUrl } from "../vrm/vrm-library";
import { getStudioVrmTexturePaintLibraryArtifact } from "../vrm/studio-vrm-texture-paint-library";
import type { StudioScene3dCutLinkedVrm } from "./studio-scene3d-shot-versions";

/** 정점 데이터와 페인트 영수증 모두 확인한 뒤에만 현재 장면을 교체한다. */
export async function verifyStudioScene3dCutVrmAssets(snapshot: StudioScene3dCutLinkedVrm, signal: AbortSignal, remote?: import("./studio-team-vrm-cut-assets").StudioTeamVrmCutResources) {
  const verifiedModels = new Set<string>();
  for (const { vrmScene } of snapshot.characters) {
    signal.throwIfAborted();
    const { model } = vrmScene;
    if (model.source === "bundled") {
      if (!selectableSampleVrmUrl(model.id)) throw new Error("컷에 저장한 기본 VRM을 찾지 못했습니다.");
    } else if (!verifiedModels.has(model.hash)) {
      const blob = remote ? remote.blobs.get(model.hash) : (await getStoredVrmModelByHash(model.hash))?.blob;
      if (blob?.size !== model.byteSize || await hashVrmBlob(blob) !== model.hash)
        throw new Error("컷에 고정한 VRM 파일을 찾지 못했거나 해시가 다릅니다. 원본을 포함한 프로젝트 아카이브를 열어 주세요.");
      verifiedModels.add(model.hash);
    }
    for (const texture of vrmScene.surfacePaint.textures) {
      const metadata = (remote ? remote.paints.get(texture.hash) : await getStudioVrmTexturePaintLibraryArtifact(texture.hash, { signal }))?.metadata;
      if (metadata?.contentHash !== texture.hash || metadata.byteLength !== texture.byteSize
        || metadata.width !== texture.width || metadata.height !== texture.height)
        throw new Error("컷에 고정한 VRM 페인트의 원본과 저장 정보가 다릅니다.");
    }
  }
  signal.throwIfAborted();
}
