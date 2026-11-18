import { describe, expect, it, vi } from "vitest";
import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";
import { isWorkVrmCutActorScene } from "@toonstudio/contracts/studio-work-vrm-cut-scene-shape";

import { studioCutVrmDocumentScope, studioTeamCutVrmDocumentScope } from "../studio-shared-3d-scene-runtime";
import { createStudioVrmSceneDocument, type StudioVrmSurfacePaintTexture } from "../vrm/studio-vrm-scene-document";
import { teamCutAssetPlan, verifyTeamCutFiles } from "./studio-team-vrm-cut-assets";
import type { StudioScene3dCutLinkedVrm } from "./studio-scene3d-shot-versions";

const scope = studioTeamCutVrmDocumentScope("work", "page");
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNYxeDyHwAENAHuKmjE9gAAAABJRU5ErkJggg=="), char => char.charCodeAt(0));
const hash = `sha256:${sha256HexPortable(png)}`;
const texture: StudioVrmSurfacePaintTexture = { bindingKey: "face", materialLocator: "gltf-material:1", textureSlot: "baseColor", hash,
  mime: "image/png", byteSize: png.byteLength, width: 1, height: 1 };
function cast(textures: readonly StudioVrmSurfacePaintTexture[] = [texture]): StudioScene3dCutLinkedVrm {
  const base = createStudioVrmSceneDocument({ source: "bundled", id: "sample-vrm", name: "루미" });
  return { version: 1, documentScope: scope, characters: ["A", "B"].map(elementId => ({ elementId, label: elementId,
    stageTransform: { position: [0, 0, 0], rotationY: 0 }, vrmScene: { ...base, surfacePaint: { version: 1, textures } } })) };
}

describe("작품에 봉인하는 고정 VRM 원본", () => {
  it("작품·페이지를 묶고 개인 원고 및 다른 작품과 분리한다", () => {
    expect(scope).toBe(studioTeamCutVrmDocumentScope("work", "page"));
    expect(scope).not.toBe(studioCutVrmDocumentScope("work", "page"));
    expect(scope).not.toBe(studioTeamCutVrmDocumentScope("other", "page"));
    expect(scope).not.toBe(studioTeamCutVrmDocumentScope("work", "next-page"));
  });
  it("팀과 개인 원고가 같은 v6 문서를 읽고 누락된 필수 블록이나 유효하지 않은 포즈를 거절한다", () => {
    const scene = cast().characters[0].vrmScene;
    expect(isWorkVrmCutActorScene(scene)).toBe(true);
    for (const key of Object.keys(scene)) {
      expect(isWorkVrmCutActorScene(Object.fromEntries(Object.entries(scene).filter(([name]) => name !== key)))).toBe(false);
    }
    expect(isWorkVrmCutActorScene({ ...scene, pose: { ...scene.pose, bones: { head: { rotation: [0, "x", 0] } } } })).toBe(false);
    expect(isWorkVrmCutActorScene({ ...scene, pose: { ...scene.pose, bones: { notHuman: { rotation: [0, 0, 0] } } } })).toBe(false);
    expect(isWorkVrmCutActorScene({ ...scene, camera: { ...scene.camera, far: 0 } })).toBe(false);
    expect(isWorkVrmCutActorScene({ ...scene, props: { runtimeUrl: "https://example.test/model" } })).toBe(false);
    expect(isWorkVrmCutActorScene({ ...scene, lightingTone: ["night"] })).toBe(false);
    expect(isWorkVrmCutActorScene({ ...scene, surfacePaint: { version: 1, textures: [{ ...texture, textureSlot: "roughness" }] } })).toBe(false);
    expect(isWorkVrmCutActorScene({ ...scene, surfacePaint: { version: 1, textures: [texture, texture] } })).toBe(false);
    expect(isWorkVrmCutActorScene({ ...scene, surfacePaint: { version: 2, textures: [{ ...texture, colorSpace: "srgb", channelPacking: "rgba" }] } })).toBe(true);
  });
  it("같은 채색을 쓰는 두 인물의 실제 PNG를 한 번 읽어 세션 메모리에 검증한다", async () => {
    const read = vi.fn(async () => new Blob([png], { type: "image/png" }));
    const { resources } = await verifyTeamCutFiles(cast(), read, new AbortController().signal);
    expect(read).toHaveBeenCalledTimes(1);
    expect(resources.paints.get(hash)?.metadata.contentHash).toBe(hash);
    expect(resources.blobs.size).toBe(1);
  });
  it("채널·크기 위조와 실패한 PNG 해시를 저장 전에 거절한다", async () => {
    expect(() => teamCutAssetPlan(cast([{ ...texture, textureSlot: "roughness" }]))).toThrow(/기본색/u);
    expect(() => teamCutAssetPlan(cast([texture, { ...texture, height: 2 }]))).toThrow(/같은 해시/u);
    const read = async () => new Blob([png], { type: "image/png" });
    await expect(verifyTeamCutFiles(cast([{ ...texture, hash: `sha256:${"0".repeat(64)}` }]), read, new AbortController().signal)).rejects.toThrow(/해시/u);
    const abort = new AbortController(); abort.abort();
    await expect(verifyTeamCutFiles(cast(), read, abort.signal)).rejects.toThrow();
  });
});
