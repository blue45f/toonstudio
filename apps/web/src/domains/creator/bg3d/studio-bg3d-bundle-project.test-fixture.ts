import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { STUDIO_BG3D_SIX_PASS_ROLES, hashStudioBg3dSixPassBundleManifest,
  hashStudioBg3dSixPassCanonicalJson, serializeStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleManifest,
  parseStudioBg3dSixPassBundleState, studioBg3dSixPassArtifactSourceUri,
  type StudioBg3dSixPassContentHash } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } from "../contracts/studio-bg3d-six-pass-settings";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { ensureStudioLinked3dRenderShot, upsertStudioLinked3dRenderLink } from "../studio-linked-3d-render-document";
import { prepareStudioLinked3dLinePass } from "../studio-linked-3d-pass-transaction";
import { createStudioShared3dStageDocument } from "../studio-shared-3d-stage-document";
import { migrateStudioShared3dStageCollectionDocument } from "../studio-shared-3d-stage-collection";
import type { ImageEl } from "../studio-element-model";
import { parseStudioProjectFile } from "../studio-project-file";

export const bg3dBundleTestHash = (bytes: Uint8Array): StudioBg3dSixPassContentHash => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function chunk(type: string, bytes: Uint8Array): Buffer {
  const result = Buffer.alloc(12 + bytes.byteLength); result.writeUInt32BE(bytes.byteLength);
  result.write(type, 4); result.set(bytes, 8); result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4); return result;
}
function png(seed: number): Uint8Array {
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Uint8Array.of(0, seed, 20, 30, 255))), chunk("IEND", new Uint8Array())]);
}
/** 합성 PNG와 인메모리 native-interface fixture이며 실제 GPU·디스크 증거로 사용하지 않는다. */
export function createBg3dBundleTestAuthority() {
  const fs = createStudioOpfsMemoryFileSystem();
  return createStudioOpfsAssetStore({ fs: { ...fs, kind: "opfs" } });
}
export async function createBg3dBundleProjectFixture(retainPrevious = false) {
  const authority = createBg3dBundleTestAuthority();
  const previous = createDefaultStudioBg3dSceneDocument();
  const scene = ensureStudioLinked3dRenderShot(normalizeStudioBg3dSceneDocument({ ...previous,
    output: { ...previous.output, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } }), { allowCreate: true });
  if (!scene?.activeShotId) throw new Error("fixture shot이 없습니다.");
  const sceneText = serializeStudioBg3dSceneDocument(scene);
  if (!sceneText) throw new Error("fixture 장면을 직렬화하지 못했습니다.");
  const sceneBytes = new TextEncoder().encode(sceneText);
  const sceneHash = bg3dBundleTestHash(sceneBytes);
  await authority.put(sceneBytes, { mime: "application/json" });
  const revisions = [];
  for (let revision = 0; revision < (retainPrevious ? 2 : 1); revision += 1) {
    const layers = [];
    for (const [index, role] of STUDIO_BG3D_SIX_PASS_ROLES.entries()) {
      const bytes = png(index + 1 + revision * 8); const contentHash = bg3dBundleTestHash(bytes);
      await authority.put(bytes, { mime: "image/png" });
      layers.push({ role, elementId: `el-${role}`, artifact: { contentHash, byteSize: bytes.byteLength,
        mimeType: "image/png", width: 1, height: 1 }, blendMode: "normal", opacity: 1, visible: true });
    }
    revisions.push(parseStudioBg3dSixPassBundleManifest({ contract: "toonstudio.bg3d-sixpass-bundle.v1", version: 1,
      minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5,
      bundleId: "bundle-1", linePassRevision: revision + 1, renderRevisionId: `rev-${revision + 1}`, parentRevisionId: revision ? `rev-${revision}` : null,
      pageId: "page-1", groupId: "group-1", anchorElementId: "el-main-line", width: 1, height: 1,
      cameraHash: hashStudioBg3dSixPassCanonicalJson(scene.camera), outputSettingsHash: hashStudioBg3dSixPassCanonicalJson(scene.output),
      scene: { documentVersion: 4, contentHash: sceneHash, byteSize: sceneBytes.byteLength, mimeType: "application/json", activeShotId: scene.activeShotId ?? null }, layers }));
  }
  for (const revision of revisions) await authority.put(new TextEncoder().encode(serializeStudioBg3dSixPassBundleManifest(revision)),
    { mime: "application/vnd.toonstudio.bg3d-sixpass-bundle+json" });
  const manifest = revisions.at(-1)!;
  const state = parseStudioBg3dSixPassBundleState({ contract: "toonstudio.bg3d-sixpass-bundles.v1", version: 1,
    minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5,
    bundles: [{ bundleId: "bundle-1", activeRevisionId: manifest.renderRevisionId, revisions }] });
  const elements: ImageEl[] = manifest.layers.map((layer) => ({ id: layer.elementId, type: "image", x: 0, y: 0, width: 1, height: 1, rotation: 0,
    groupId: "group-1", opacity: .5, hidden: true, blendMode: "multiply", bg3dLtRole: layer.role, bg3dLtBundleId: "bundle-1", bg3dLtRenderMode: "separated",
    src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
    bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: "bundle-1", renderRevisionId: manifest.renderRevisionId,
      manifestHash: hashStudioBg3dSixPassBundleManifest(manifest), role: layer.role, elementId: layer.elementId },
    ...(layer.role === "main-line" ? { bg3dScene: scene } : {}) }));
  const shared3dStage = migrateStudioShared3dStageCollectionDocument(createStudioShared3dStageDocument({
    backgroundBundleId: "bundle-1", elements, capturePolicy: "background-only" }));
  if (!shared3dStage) throw new Error("fixture stage가 없습니다.");
  let prepared: Awaited<ReturnType<typeof prepareStudioLinked3dLinePass>> | undefined;
  for (const revision of revisions) {
    const main = revision.layers.find((layer) => layer.role === "main-line")!;
    const pngBytes = await authority.get(main.artifact.contentHash);
    if (!pngBytes) throw new Error("fixture line본문이 없습니다.");
    prepared = await prepareStudioLinked3dLinePass({ authority,
      sourceHash: shared3dStage.stages[0].background.sourceHash, scene, previous: prepared?.descriptor,
      layers: [{ role: "main-line", width: 1, height: 1, pngDataUrl: `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}` }] });
  }
  if (!prepared) throw new Error("fixture line revision이 없습니다.");
  const linked3dRender = upsertStudioLinked3dRenderLink({ value: undefined, bundleId: "bundle-1",
    shotId: scene.activeShotId, passRevision: prepared.descriptor, elements, shared3dStage });
  if (!linked3dRender) throw new Error("fixture index가 없습니다.");
  const project = parseStudioProjectFile({ version: 5, title: "6패스 묶음 회귀", pagesList: [{ id: "page-1", bg: "#fff",
    bgGrad: null, canvasH: 1080, groups: [{ id: "group-1", name: "6패스" }], elements, shared3dStage, linked3dRender, bg3dLtBundles: state }] });
  return { project: { ...project, pagesList: project.pagesList.map((page) => ({ ...page, elements: page.elements as ImageEl[], shared3dStage, linked3dRender, bg3dLtBundles: state })) }, authority, manifest, state, scene, sceneBytes };
}
