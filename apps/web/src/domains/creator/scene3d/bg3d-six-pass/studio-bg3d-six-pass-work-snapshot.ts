import { hashStudioBg3dSixPassBundleManifest, hashStudioBg3dSixPassCanonicalJson, parseStudioBg3dSixPassBundleState,
  verifyStudioBg3dSixPassBundleSceneBytes, type StudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { parseStudioBg3dSceneDocument } from "../../bg3d/studio-bg3d-scene-document";
import { hashStudioShared3dStageBackground } from "../../studio-shared-3d-stage-document";
import { studioShared3dStageEntryAsDocument, migrateStudioShared3dStageCollectionDocument } from "../../studio-shared-3d-stage-collection";
import { hydrateStudioBg3dSixPassRemoteBundle } from "./studio-bg3d-six-pass-bundle-api";
import { acquireStudioBg3dSixPassBundleProductAuthority } from "./studio-bg3d-six-pass-bundle-product-authority";

function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

/** PostgreSQL JSONB가 객체 키를 정렬한 경우 원고에 봉인된 바이트 순서만 복구한다. 장면 값·배열·Stage/레이어 교체는 거절한다. */
export async function restoreStudioFrozenSixPassSnapshot(work: Record<string, unknown>, workId: string, signal?: AbortSignal,
  read: (manifest: StudioBg3dSixPassBundleManifest) => Promise<Uint8Array | null> = async manifest => {
    const authority = await acquireStudioBg3dSixPassBundleProductAuthority();
    await hydrateStudioBg3dSixPassRemoteBundle({workId,authority,reference:{version:manifest.version,bundleId:manifest.bundleId,pageId:manifest.pageId,
      renderRevisionId:manifest.renderRevisionId,parentRevisionId:manifest.parentRevisionId,manifestHash:hashStudioBg3dSixPassBundleManifest(manifest)}});
    return authority.get(manifest.scene.contentHash,{verify:true});
  }) {
  const doc = work.doc;
  if (!record(doc) || !Array.isArray(doc.pagesList)) return null;
  const pages = [...doc.pagesList];
  let changed = false;
  for (const [index, page] of pages.entries()) {
    if (!record(page) || !Array.isArray(page.elements) || !page.bg3dLtBundles) continue;
    const state = parseStudioBg3dSixPassBundleState(page.bg3dLtBundles);
    const elements: unknown[] = [...page.elements];
    let pageChanged = false;
    for (const bundle of state.bundles) {
      const manifest = bundle.revisions.find(item => item.renderRevisionId === bundle.activeRevisionId);
      if (manifest?.version !== 2 || manifest.pageId !== page.id) continue;
      const i = elements.findIndex(e => record(e) && e.id === manifest.anchorElementId);
      if (i < 0) continue;
      const anchor = elements[i];
      if (!record(anchor) || anchor.type !== "image" || !record(anchor.bg3dScene)) continue;
      const ref = anchor.bg3dLtBundleReference;
      const stage = migrateStudioShared3dStageCollectionDocument(page.shared3dStage);
      if (!record(ref) || ref.manifestHash !== hashStudioBg3dSixPassBundleManifest(manifest) || ref.renderRevisionId !== manifest.renderRevisionId
        || ref.elementId !== anchor.id || ref.role !== "main-line" || ref.bundleId !== bundle.bundleId || !stage
        || studioShared3dStageEntryAsDocument(stage,bundle.bundleId)?.background.sourceHash !== manifest.scene.contentHash)
        throw new Error("고정 6패스의 원고·공유 Stage·봉인 참조가 다릅니다.");
      const current = parseStudioBg3dSceneDocument(JSON.stringify(anchor.bg3dScene));
      if (current && hashStudioShared3dStageBackground(current) === manifest.scene.contentHash) continue;
      signal?.throwIfAborted();
      const bytes = await read(manifest);
      signal?.throwIfAborted();
      if (!bytes) throw new Error("고정 6패스의 장면 원본을 다시 받을 수 없습니다.");
      verifyStudioBg3dSixPassBundleSceneBytes(manifest,bytes,"work");
      const text = new TextDecoder("utf-8",{fatal:true}).decode(bytes);
      const source = parseStudioBg3dSceneDocument(text);
      if (!source || hashStudioShared3dStageBackground(source) !== manifest.scene.contentHash
        || hashStudioBg3dSixPassCanonicalJson(anchor.bg3dScene) !== hashStudioBg3dSixPassCanonicalJson(JSON.parse(text)))
        throw new Error("원고의 고정 컷 내용이 봉인된 6패스 장면과 다릅니다.");
      elements[i] = {...anchor,bg3dScene:source};
      pageChanged = true;
    }
    if (pageChanged) { pages[index] = {...page,elements}; changed = true; }
  }
  return changed ? {...work,doc:{...doc,pagesList:pages}} : null;
}
