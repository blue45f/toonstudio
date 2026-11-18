import { describe, expect, it } from "vitest";
import { createDefaultStudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { createStudioVrmCutPaintSession } from "../vrm/studio-vrm-cut-paint-session";
import { createStudioVrmTexturePaintArtifact } from "../vrm/studio-vrm-texture-paint-artifact";
import { createStudioVrmTexturePaintBindingDescriptor } from "../vrm/studio-vrm-texture-paint-binding";
import { createStudioScene3dDocument } from "./studio-scene3d-document";
import { createStudioScene3dVersionedCut } from "./studio-scene3d-shot-versions";
import { reviseTeamVrmCutPaint } from "./studio-team-vrm-cut-revision";

const bg = createDefaultStudioBg3dSceneDocument();
const base = createStudioVrmSceneDocument({source: "bundled", id: "sample-vrm", name: "루미"});
const binding = createStudioVrmTexturePaintBindingDescriptor("gltf-material:0", "emissive")!;
const paint = {...binding, hash: `sha256:${"a".repeat(64)}`, mime: "image/png" as const, byteSize: 71, width: 1, height: 1, colorSpace: "srgb" as const, channelPacking: "rgb" as const};
const edited = {...base, surfacePaint: {version: 2 as const, textures: [paint]}};
const cut = createStudioScene3dVersionedCut({
  id: "cut-05", name: "첫 컷", scene: createStudioScene3dDocument("team-cut", "2026-11-19T00:00:00Z"), characters: {}, legacyBg3d: bg,
  linkedVrm: {version: 1, documentScope: `sha256:${"b".repeat(64)}`, characters: ["actor-1","actor-2"].map(elementId => ({
    elementId, label: elementId, stageTransform: {position: [1,2,3], rotationY: 0.2}, vrmScene: base,
  }))},
});
const original = {...bg, pinnedVersionedCut: cut};

describe("팀 고정 컷의 배우 채색 수정판", () => {
  it("선택한 배우의 표면만 갱신하고 기존 컷·다른 배우·무대·포즈를 보존한다", () => {
    const before = JSON.stringify(original);
    const revision = reviseTeamVrmCutPaint(original, cut.source, cut.sourceHash, "actor-2", edited).pinnedVersionedCut!;
    expect(revision.id).toBe(cut.id);
    expect(revision.revision).toBe(cut.revision + 1);
    expect(revision.sourceHash).not.toBe(cut.sourceHash);
    expect(revision.camera).toEqual(cut.camera);
    expect(revision.source.linkedVrm?.characters[0]).toEqual(cut.source.linkedVrm?.characters[0]);
    expect(revision.source.linkedVrm?.characters[1]).toEqual({...cut.source.linkedVrm!.characters[1], vrmScene: {...cut.source.linkedVrm!.characters[1].vrmScene, surfacePaint: edited.surfacePaint}});
    expect(JSON.stringify(original)).toBe(before);
  });
  it("오래된 컷·없는 배우·모델 교체·변경 없는 제출은 수용하지 않는다", () => {
    for (const [actor, hash, scene] of [
      ["actor-2", "wrong", edited], ["missing", cut.sourceHash, edited], ["actor-1", cut.sourceHash, base],
      ["actor-2", cut.sourceHash, {...edited, model: {...base.model, name: "다른 배우"}}],
    ] as const) expect(() => reviseTeamVrmCutPaint(original, cut.source, hash, actor, scene)).toThrow();
  });
  it("새로운 PNG는 편집 세션에서만 읽고 원본 파일 묶음과 다른 세션에 복사하지 않는다", async () => {
    const png = new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNYxeDyHwAENAHuKmjE9gAAAABJRU5ErkJggg=="), c => c.charCodeAt(0))], {type:"image/png"});
    const original = {bundled: new Map([["sample-vrm",new Blob(["model"])]]), blobs: new Map(), paints: new Map()};
    const session = createStudioVrmCutPaintSession(base.model, original);
    const independent = createStudioVrmCutPaintSession(base.model, original);
    const artifact = await createStudioVrmTexturePaintArtifact({source:png, bindingKey:binding.bindingKey});
    const hash = artifact.metadata.contentHash;
    await expect(session.dependencies.saveArtifact(artifact)).resolves.toMatchObject({deduplicated:false, creationReceipt:null});
    expect((await session.dependencies.getArtifact(hash)).archiveEntry.data).toBe(artifact.archiveEntry.data);
    expect(session.resources.blobs.get(hash)).toBe(artifact.archiveEntry.data);
    await expect(independent.dependencies.getArtifact(hash)).rejects.toThrow(/작품/);
    expect(original.paints.size + original.blobs.size).toBe(0);
    expect(() => createStudioVrmCutPaintSession(base.model, {...original, bundled:new Map()})).toThrow(/원본/);
  });
});
