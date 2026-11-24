import { describe, expect, it, vi } from "vitest";

import { instantiateBg3dTemplateDocument, listBg3dTemplatesV12, saveBg3dTemplateV12 } from "./bg3d-template-library";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import { STUDIO_BG3D_GLB_MIME, type StudioBg3dModelAttachment } from "./studio-bg3d-scene-document";
import { createStudioBg3dVerifiedLocalScene, STUDIO_BG3D_VERIFIED_LOCAL_SCENES } from "./studio-bg3d-verified-local-scenes";

const verifiedDigests = {
  "apartment-lobby": "12bb5e578e8a2872b2a89be084ab5be4c458fd18021bab6c830c1d9aa1de01e4",
  "food-cart": "0a13d34e593a66bb8c6f6d23607c81f9734f2bfe02bd8cb3f71eec6c3f1f9176",
  "one-room": "953c7e60731da5a44788b803aa7216d017e931ea95773bcda22c2dc793558306",
  "park-bench": "5c4ca9e58f643d01f6458013e7870e439820dd7045705d2204d618c9a3aad070",
  "coffee-shop": "56debed8be02cb00b6d5ad87bb2cb983fc7569aee2f4332281baa6dabbab0a2c",
  "knight-crest": "629985a1385119d3c4424bb9e5340f6d734f46547f80f8aa0a9f10a0d7442bca",
};

type Preset = (typeof STUDIO_BG3D_VERIFIED_LOCAL_SCENES)[number];

function localAttachment(preset: Preset): StudioBg3dModelAttachment {
  return {
    id: "local-model-attachment", name: preset.fileName, mime: STUDIO_BG3D_GLB_MIME,
    source: "local-library", hash: preset.hash, byteSize: preset.byteSize,
    rights: { status: "licensed", commercialUse: false, attributionRequired: true, attribution: "원안 저작자", licenseName: "기기 내 사용" },
  };
}

function templateAuthority() {
  let manifest: string | null = null;
  const noBinary = vi.fn(async (): Promise<never> => { throw new Error("템플릿에는 모델 바이너리를 저장하지 않습니다."); });
  const authority: StudioBg3dLibrariesAuthority = {
    readManifest: async () => manifest,
    readBlob: noBinary,
    async mutate(_slot, _refs, operation) {
      const result = await operation({ now: 1_000, currentRaw: manifest, getBlob: noBinary, putBlob: noBinary });
      result.assertCurrent?.();
      manifest = result.nextRaw;
      return result.result;
    },
  };
  return { authority, noBinary };
}

describe("기기에서 검증한 여섯 개의 3D 장면", () => {
  it("감사에서 확인한 여섯 GLB의 내용 해시를 각각 사용한다", () => {
    expect(STUDIO_BG3D_VERIFIED_LOCAL_SCENES).toHaveLength(6);
    expect(Object.fromEntries(STUDIO_BG3D_VERIFIED_LOCAL_SCENES.map(preset => [preset.id, preset.hash])))
      .toEqual(Object.fromEntries(Object.entries(verifiedDigests).map(([id, hash]) => [id, `sha256:${hash}`])));
  });

  it.each(STUDIO_BG3D_VERIFIED_LOCAL_SCENES)("$id 장면을 새 원고에 두고 저장·재사용해도 첨부와 권리를 유지한다", async (preset) => {
    const attachment = localAttachment(preset);
    const scene = createStudioBg3dVerifiedLocalScene(preset, attachment);
    expect(scene).not.toBeNull();
    if (!scene) throw new Error("장면을 만들지 못했습니다.");
    expect(scene.attachments).toHaveLength(1);
    expect(scene.attachments[0]).toMatchObject({ hash: preset.hash, rights: attachment.rights, source: "local-library" });
    const model = scene.nodes.find(node => node.kind === "model");
    expect(model).toMatchObject({ attachmentId: attachment.id, transform: { position: preset.modelPosition } });
    expect(scene.camera).toMatchObject({ position: preset.cameraPosition, target: preset.cameraTarget });

    const { authority, noBinary } = templateAuthority();
    await saveBg3dTemplateV12({ id: preset.id, name: preset.name, createdAt: 1_000, document: scene }, { authority });
    const [saved] = await listBg3dTemplatesV12({ authority });
    if (!saved) throw new Error("저장한 장면을 읽지 못했습니다.");
    expect(saved.commercialUse).toBe(false);
    let sequence = 0;
    const reopened = instantiateBg3dTemplateDocument(saved.document, new Set(scene.nodes.map(node => node.id)), () => `new-node-${++sequence}`);
    expect(reopened?.document.attachments).toEqual(scene.attachments);
    expect(reopened?.document.camera).toEqual(scene.camera);
    const reusedModel = reopened?.document.nodes.find(node => node.kind === "model");
    expect(reusedModel?.attachmentId).toBe(model?.attachmentId);
    expect(reusedModel?.id).not.toBe(model?.id);
    expect(reusedModel?.transform).toEqual(model?.transform);
    expect(JSON.stringify(reopened?.document)).not.toMatch(/(?:data:|blob:|file:\/\/|https?:\/\/)/iu);
    expect(noBinary).not.toHaveBeenCalled();
  });

  it("이름이 같아도 해시 또는 크기가 다르거나 기기 라이브러리 첨부가 아니면 장면을 만들지 않는다", () => {
    const [preset] = STUDIO_BG3D_VERIFIED_LOCAL_SCENES;
    if (!preset) throw new Error("검증 장면이 필요합니다.");
    const attachment = localAttachment(preset);
    for (const patch of [{ hash: `sha256:${"0".repeat(64)}` }, { byteSize: attachment.byteSize + 1 }, { source: "bundled" as const }]) {
      expect(createStudioBg3dVerifiedLocalScene(preset, { ...attachment, ...patch })).toBeNull();
    }
  });
});
