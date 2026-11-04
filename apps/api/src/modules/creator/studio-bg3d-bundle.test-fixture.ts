import { createHash } from "node:crypto";
import * as Y from "yjs";
import { studioBg3dSixPassArtifactSourceUri } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { crc32, deflateSync } from "node:zlib";
import { hashStudioBg3dSixPassCanonicalJson, hashStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleManifest, STUDIO_BG3D_SIX_PASS_ROLES } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioBg3dSixPassContentHash } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { PrivateObjectReference } from "../../platform/adapters/private-object-storage/private-object-storage.contract";

const hash = (bytes: Uint8Array): StudioBg3dSixPassContentHash => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function chunk(type: string, bytes: Uint8Array) {
  const result = Buffer.alloc(12 + bytes.byteLength); result.writeUInt32BE(bytes.byteLength); result.write(type, 4);
  result.set(bytes, 8); result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4); return result;
}
export function bg3dBundleFixture(revision = "revision-one", parentRevisionId: string | null = null) {
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Uint8Array.of(0, 10, 20, 30, 255))), chunk("IEND", new Uint8Array())]);
  const camera = { position: [0, 1, 5], target: [0, 1, 0], fovDegrees: 50 };
  const output = { sixPassLt: { version: 1, shadowOpacity: 0.68, depthFogOpacity: 0.32, fogNearMeters: 4, fogFarMeters: 25, fogTintHex: "#fed7aa" } };
  const scene = Buffer.from(JSON.stringify({ kind: "toonstudio.bg3d-scene", version: 4, camera, output, nodes: [], shots: [{ id: "shot-one" }], activeShotId: "shot-one", attachments: [] }));
  const artifact = { contentHash: hash(png), byteSize: png.byteLength, mimeType: "image/png" as const, width: 1, height: 1 };
  const manifest = parseStudioBg3dSixPassBundleManifest({ contract: "toonstudio.bg3d-sixpass-bundle.v1", version: 1,
    minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5,
    bundleId: "bundle-one", renderRevisionId: revision, parentRevisionId, pageId: "page-one", groupId: "group-one", anchorElementId: "element-main-line", width: 1, height: 1,
    cameraHash: hashStudioBg3dSixPassCanonicalJson(camera), outputSettingsHash: hashStudioBg3dSixPassCanonicalJson(output),
    scene: { documentVersion: 4, contentHash: hash(scene), byteSize: scene.byteLength, mimeType: "application/json", activeShotId: "shot-one" },
    layers: STUDIO_BG3D_SIX_PASS_ROLES.map((role) => ({ role, elementId: `element-${role}`, artifact, blendMode: "normal", opacity: 1, visible: true })) });
  return { manifest, png, scene };
}
export function bg3dTestObject(bytes: Uint8Array, contentType: "image/png" | "application/json" = "image/png"): PrivateObjectReference {
  const digest = hash(bytes), raw = digest.slice(7);
  return { contractVersion: "toonspectrum.private-object-storage.v2", providerId: "cloudflare-r2", purpose: "source", digest,
    objectPath: `sha256/${raw.slice(0, 2)}/${raw}`, byteLength: bytes.byteLength, contentType };
}

/** 서버 입장 검증을 통과시킬 실제 Yjs 원고를 만든다. GPU 픽셀 생성 증거는 아니다. */
export function bg3dBundleCrdtFixture(manifest: ReturnType<typeof bg3dBundleFixture>["manifest"]) {
  const doc = new Y.Doc(), manifestHash = hashStudioBg3dSixPassBundleManifest(manifest);
  const ref = { version: 1, pageId: manifest.pageId, bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId,
    parentRevisionId: manifest.parentRevisionId, manifestHash };
  doc.getMap("studio-bg3d-bundle-revisions-v1").set(JSON.stringify([manifest.pageId, manifest.bundleId, manifest.renderRevisionId]), JSON.stringify(ref));
  doc.getMap("studio-bg3d-bundle-active-v1").set(JSON.stringify([manifest.pageId, manifest.bundleId]), manifest.renderRevisionId);
  const groupKey = `${manifest.pageId.length}:${manifest.pageId}${manifest.groupId.length}:${manifest.groupId}`;
  doc.getMap("layer-groups").set(groupKey, true);
  const group = doc.getMap(`layer-group:${encodeURIComponent(groupKey)}`);
  for (const [name, value] of Object.entries({ id: manifest.groupId, pageId: manifest.pageId, payloadVersion: 1, deleted: false, "prop:name": "6패스" })) group.set(name, value);
  for (const layer of manifest.layers) {
    doc.getMap("scene-elements").set(layer.elementId, true);
    const record = doc.getMap(`scene-element:${layer.elementId}`);
    for (const [name, value] of Object.entries({ id: layer.elementId, pageId: manifest.pageId, layerId: manifest.groupId, payloadVersion: 1, type: "reference", deleted: false })) record.set(name, value);
    for (const [name, value] of Object.entries({ elementType: "image", x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, blendMode: "normal",
      src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
      bg3dLtBundleId: manifest.bundleId, bg3dLtRole: layer.role, bg3dLtRenderMode: "separated",
      bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId, manifestHash, role: layer.role, elementId: layer.elementId } })) record.set(`prop:${name}`, value);
  }
  return doc;
}
