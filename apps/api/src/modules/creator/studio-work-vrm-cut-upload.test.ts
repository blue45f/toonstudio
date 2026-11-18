import { IEND_CHUNK, idatChunk, ihdrChunk, pngFile } from "../../../test/cover-image-fixtures";
import { STUDIO_VRM_TEXTURE_PAINT_CHANNELS, studioVrmTexturePaintChannelEncoding } from "@toonstudio/contracts/studio-vrm-texture-paint-channel";
import defaultActorScene from "./fixtures/studio-vrm-cut-default-scene.json";
import { createStudioScene3dDocument } from "@toonstudio/contracts/studio-scene3d-document";
import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { hashStudioScene3dCutValue } from "@toonstudio/contracts/studio-scene3d-cut-canonical";
import { workVrmCutBundledDigest } from "@toonstudio/contracts/studio-work-vrm-cut-bundled";
import { createStudioVrmProjectArchiveUseContextReceipt } from "@toonstudio/contracts/studio-vrm-archive-rights";
import { admitStudioWorkAssetPayload } from "./studio-work-asset.service";
import { prepareWorkVrmCutUpload } from "./studio-work-vrm-cut-upload";

const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQs4n6DwAC5AG0HngVlgAAAABJRU5ErkJggg==", "base64");
const workId = "work-fixture", pageId = "page-a", anchorId = `vrmcut-${randomUUID()}`;
function part(buffer: Buffer, mimetype: string, originalname: string) { return { buffer, mimetype, originalname, size: buffer.byteLength }; }
function makeGlb(licenseName: string) {
  const value = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, extensions: { VRM: { meta: {
    title: "의상", author: "작업실", licenseName, allowedUserName: "Everyone", commercialUssageName: "Allow",
    violentUssageName: "Disallow", sexualUssageName: "Disallow",
  } } } }));
  const length = (value.length + 3) & ~3, bytes = Buffer.alloc(length + 20, 32);
  bytes.write("glTF"); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(length, 12); bytes.write("JSON", 16); value.copy(bytes, 20); return bytes;
}
function fixture(modelBytes?: Buffer, painted = false) {
  const model = modelBytes ? { source: "attachment", hash: `sha256:${digest(modelBytes)}`, byteSize: modelBytes.length, mime: "model/vrm", name: "의상" }
    : { source: "bundled", id: "sample-vrm", name: "루미" };
  const actor = { elementId: "actor", label: "의상", vrmScene: { ...defaultActorScene, model,
    surfacePaint: { version: 1, textures: painted ? [{ mime: "image/png", width: 1, height: 1, textureSlot: "baseColor", bindingKey: "gltf-material-0-baseColor", materialLocator: "gltf-material:0",
      hash: `sha256:${digest(png)}`, byteSize: png.length }] : [] } }, stageTransform: { position: [0, 0, 0], rotationY: 0 } };
  const source = { characters: {}, scene: createStudioScene3dDocument("scene:cut", "2026-11-19T00:00:00.000Z"), linkedVrm: { version: 1,
    documentScope: `sha256:${digest(JSON.stringify(["studio-work-vrm-cut:v1", workId, pageId]))}`, characters: [actor] } };
  const scene = { version: 3, kind: "toonstudio.bg3d-scene", nodes: [], attachments: [], camera: {}, output: {},
    pinnedVersionedCut: { id: "cut-one", name: "원화", status: "draft", revision: 1, source, sourceHash: hashStudioScene3dCutValue(source), camera: source.scene.cameras[0], corrections: [], performances: {} } };
  const sceneBytes = Buffer.from(JSON.stringify(scene));
  const rights = createStudioVrmProjectArchiveUseContextReceipt({ confirmedByUser: true, avatarPermissionBasis: "other", confirmedAttributionTexts: [""],
    excessivelyViolent: "absent", excessivelySexual: "absent", politicalOrReligious: "absent", antisocialOrHate: "absent" });
  const metadata = { version: 1, pageId, descriptor: { version: 1, element: { id: anchorId, type: "image", width: 1, height: 1, x: 0, y: 0, rotation: 0 } },
    sceneSha256: digest(sceneBytes), compositeSha256: digest(png), bundledModels: modelBytes ? [] : [{ id: "sample-vrm", sha256: workVrmCutBundledDigest("sample-vrm") }],
    ...(modelBytes ? { rights } : {}) };
  return { scene, metadata, request: { workId, anchorId, admit: admitStudioWorkAssetPayload, metadataJson: JSON.stringify(metadata),
    files: { scene: [part(sceneBytes, "application/json", "scene.json")], composite: [part(png, "image/png", "cut.png")],
      attachments: [...(modelBytes ? [part(modelBytes, "model/vrm", digest(modelBytes))] : []), ...(painted ? [part(png, "image/png", digest(png))] : [])] } } };
}

describe("작품 고정 VRM 컷의 원본·권리·파일 검증", () => {
  it("기본 모델을 현재 배포 파일에 묶고 같은 입력에서 동일한 봉인 값을 만든다", () => {
    const { request } = fixture(), first = prepareWorkVrmCutUpload(request);
    expect(first.seal.bundledModels).toEqual([{ id: "sample-vrm", sha256: workVrmCutBundledDigest("sample-vrm") }]);
    expect(first.writes.map(w => w.assetId)).toEqual([anchorId]);
    expect(prepareWorkVrmCutUpload(request)).toEqual(first);
  });
  it("사용자 VRM과 PNG 채색의 실제 바이트를 검증해 두 파일 모두 저장 대상으로 잡는다", () => {
    const { request } = fixture(makeGlb("CC0"), true);
    const cut = prepareWorkVrmCutUpload(request);
    expect(cut.writes.map(w => w.elementType).sort()).toEqual(["image", "image", "vrm"]);
    expect(cut.seal.attachments?.map(a => a.sha256).sort()).toEqual(request.files.attachments.map(f => digest(f.buffer)).sort());
  });
  it.each([
    { rgba: [80, 80, 80, 255], valid: true },
    { rgba: [80, 100, 80, 255], valid: false },
    { rgba: [80, 80, 80, 160], valid: false },
  ])("같은 PNG에 묶인 다섯 채널은 실제 회색조·알파까지 검사한다 $rgba", ({ rgba, valid }) => {
    const f = fixture();
    const bytes = pngFile(ihdrChunk({ width: 1, height: 1, colorType: 6 }), idatChunk(Buffer.from([0, ...rgba])), IEND_CHUNK);
    const textures = [...STUDIO_VRM_TEXTURE_PAINT_CHANNELS].sort().map(textureSlot => ({
      bindingKey: `eye-${textureSlot}`, textureSlot, materialLocator: "gltf-material:0", ...studioVrmTexturePaintChannelEncoding(textureSlot),
      hash: `sha256:${digest(bytes)}`, byteSize: bytes.length, width: 1, height: 1, mime: "image/png",
    }));
    const actor = f.scene.pinnedVersionedCut.source.linkedVrm.characters[0]!;
    const source = { ...f.scene.pinnedVersionedCut.source, linkedVrm: { ...f.scene.pinnedVersionedCut.source.linkedVrm,
      characters: [{ ...actor, vrmScene: { ...actor.vrmScene, surfacePaint: { version: 2, textures } } }] } };
    const scene = Buffer.from(JSON.stringify({ ...f.scene, pinnedVersionedCut: { ...f.scene.pinnedVersionedCut, source, sourceHash: hashStudioScene3dCutValue(source) } }));
    const upload = () => prepareWorkVrmCutUpload({ ...f.request, metadataJson: JSON.stringify({ ...f.metadata, sceneSha256: digest(scene) }),
      files: { ...f.request.files, scene: [part(scene, "application/json", "scene.json")], attachments: [part(bytes, "image/png", digest(bytes))] } });
    if (valid) expect(upload().seal.attachments).toHaveLength(1);
    else expect(upload).toThrow(/회색조/);
  });
  it("다른 작품·페이지의 원본 재사용, 누락 첨부, 중복 첨부, 다른 번들 버전을 차단한다", () => {
    const { request, metadata } = fixture();
    expect(() => prepareWorkVrmCutUpload({ ...request, workId: "other" })).toThrow(BadRequestException);
    for (const altered of [{ ...metadata, pageId: "other" }, { ...metadata, bundledModels: [] },
      { ...metadata, bundledModels: [{ id: "sample-vrm", sha256: "f".repeat(64) }] }]) {
      expect(() => prepareWorkVrmCutUpload({ ...request, metadataJson: JSON.stringify(altered) })).toThrow(BadRequestException);
    }
    const { request: linked } = fixture(makeGlb("CC0"), true);
    for (const attachments of [[], [...linked.files.attachments, linked.files.attachments[0]!]]) {
      expect(() => prepareWorkVrmCutUpload({ ...linked, files: { ...linked.files, attachments } })).toThrow(BadRequestException);
    }
  });
  it("이용자 동의만으로 재배포 제한 모델을 허가하지 않고 동의 없는 첨부도 거부한다", () => {
    expect(() => prepareWorkVrmCutUpload(fixture(makeGlb("Redistribution_Prohibited")).request)).toThrow(ForbiddenException);
    const { metadata, request } = fixture(makeGlb("CC0"));
    expect(() => prepareWorkVrmCutUpload({ ...request, metadataJson: JSON.stringify({ ...metadata, rights: undefined }) })).toThrow(ForbiddenException);
  });
  it("해시를 다시 계산해도 포즈가 빠진 캐릭터, 잘못된 카메라와 좌표계를 보관하지 않는다", () => {
    const { request, metadata, scene } = fixture();
    for (const change of ["actor", "camera", "coordinates"]) {
      const altered = structuredClone(scene);
      if (change === "actor") Reflect.deleteProperty(altered.pinnedVersionedCut.source.linkedVrm.characters[0]!.vrmScene, "pose");
      if (change === "camera") Object.assign(altered.pinnedVersionedCut.camera!, { near: -1 });
      if (change === "coordinates") Object.assign(altered.pinnedVersionedCut.source.scene.coordinateSystem, { upAxis: "Z" });
      altered.pinnedVersionedCut.sourceHash = hashStudioScene3dCutValue(altered.pinnedVersionedCut.source);
      const bytes = Buffer.from(JSON.stringify(altered));
      expect(() => prepareWorkVrmCutUpload({ ...request, metadataJson: JSON.stringify({ ...metadata, sceneSha256: digest(bytes) }),
        files: { ...request.files, scene: [part(bytes, "application/json", "scene.json")] } })).toThrow(BadRequestException);
    }
  });
  it("저장 영수증에서 원래 바이트 해시를 재현할 수 없는 JSON 표기를 거절한다", () => {
    const { request, metadata, scene } = fixture(), bytes = Buffer.from(JSON.stringify(scene, null, 2));
    expect(() => prepareWorkVrmCutUpload({ ...request, metadataJson: JSON.stringify({ ...metadata, sceneSha256: digest(bytes) }),
      files: { ...request.files, scene: [part(bytes, "application/json", "scene.json")] } })).toThrow(BadRequestException);
  });
  it("IDAT가 손상된 PNG는 해시와 크기가 제출값과 같아도 봉인하지 않는다", () => {
    const { request, metadata } = fixture(), broken = Buffer.from(png);
    broken[44] ^= 1;
    expect(() => prepareWorkVrmCutUpload({ ...request, metadataJson: JSON.stringify({ ...metadata, compositeSha256: digest(broken) }),
      files: { ...request.files, composite: [part(broken, "image/png", "cut.png")] } })).toThrow(BadRequestException);
  });
});
