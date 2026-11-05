import { decodeStudioBg3dSixPassPng } from "./studio-bg3d-six-pass-png-decode";
import { getStudioBg3dSixPassBundleArtifacts, hashStudioBg3dSixPassBundleManifest,
  parseStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleState,
  verifyStudioBg3dSixPassArtifactBytes, verifyStudioBg3dSixPassBundleSceneBytes,
  STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT,
  studioBg3dSixPassArtifactSourceUri, type StudioBg3dSixPassBundleManifest,
} from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { parseStudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { isStudioLegacyPigmentArchivedElement } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { parseStudioLinked3dCorrectionProvenance } from "@toonstudio/contracts/studio-linked-3d-correction";
import { parseStudioBg3dSceneDocument, type StudioBg3dSceneDocument } from "../../bg3d/studio-bg3d-scene-document";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import type { PageState } from "../../studio-page-state";
import { studioCrdtStrokeToDrawElement } from "../../live/studio-crdt-page-bridge";
import type { El } from "../../studio-element-model";
import { acquireStudioBg3dSixPassBundleProductAuthority, runStudioBg3dSixPassBundleMutationExclusive } from "./studio-bg3d-six-pass-bundle-product-authority";
import { studioBg3dSixPassBundleOwner } from "./studio-bg3d-six-pass-bundle-transaction";
import { acquireStudioLinked3dPassProductAuthority } from "../../studio-linked-3d-pass-product-authority";
import { computeStudioLinked3dPassRootHash, computeStudioLinked3dSceneRevisionSignatures,
  type StudioLinked3dPassRevisionDescriptor } from "../../studio-linked-3d-pass-transaction";
import { upsertStudioLinked3dRenderLink, parseStudioLinked3dRenderDocument, type StudioLinked3dRenderDocument } from "../../studio-linked-3d-render-document";
import { studioShared3dStageEntryAsDocument } from "../../studio-shared-3d-stage-collection";
import type { StudioCrdtBg3dBundleRevisionReference } from "../../live/studio-crdt-bg3d-bundle-refs";
import type { StudioCrdtSceneGraphFrontier } from "../../live/studio-crdt-history";

type BundleImage = Extract<El, { type: "image" }>;
interface LoadedRevision { manifest: StudioBg3dSixPassBundleManifest; scene: StudioBg3dSceneDocument }
const pendingByAuthority = new WeakMap<StudioOpfsAssetStore, Map<string, Promise<LoadedRevision>>>();
const decoder = new TextDecoder("utf-8", { fatal: true });
async function loadRevision(ref: StudioCrdtBg3dBundleRevisionReference, workId: string | null): Promise<LoadedRevision> {
  const cacheKey = `${workId ?? "origin"}:${ref.manifestHash}`;
  const authority = await acquireStudioBg3dSixPassBundleProductAuthority();
  const pending = pendingByAuthority.get(authority) ?? new Map<string, Promise<LoadedRevision>>();
  pendingByAuthority.set(authority, pending);
  let operation = pending.get(cacheKey);
  if (!operation) {
    operation = (async () => {
      let bytes = await authority.get(ref.manifestHash, { verify: true });
      if (workId) {
        const api = await import("./studio-bg3d-six-pass-bundle-api");
        await api.hydrateStudioBg3dSixPassRemoteBundle({ workId, reference: ref, authority });
        bytes = await authority.get(ref.manifestHash, { verify: true });
      }
      if (!bytes || bytes.byteLength > 8192) throw new Error("봉인된 6패스 manifest 본문이 없습니다.");
      const manifest = parseStudioBg3dSixPassBundleManifest(JSON.parse(decoder.decode(bytes)));
      if (hashStudioBg3dSixPassBundleManifest(manifest) !== ref.manifestHash || manifest.pageId !== ref.pageId
        || manifest.bundleId !== ref.bundleId || manifest.renderRevisionId !== ref.renderRevisionId
        || manifest.parentRevisionId !== ref.parentRevisionId) throw new Error("6패스 manifest와 CRDT 영수증이 다릅니다.");
      const retained = [ref.manifestHash];
      let scene: StudioBg3dSceneDocument | null = null;
      for (const { role, artifact } of getStudioBg3dSixPassBundleArtifacts(manifest)) {
        const body = await authority.get(artifact.contentHash, { verify: true });
        if (!body) throw new Error(`6패스 ${role} 본문이 누락되어 묶음 전체를 표시하지 않았습니다.`);
        verifyStudioBg3dSixPassArtifactBytes(artifact, body);
        if (role === "scene") {
          verifyStudioBg3dSixPassBundleSceneBytes(manifest, body);
          scene = parseStudioBg3dSceneDocument(decoder.decode(body));
        } else {
          if (!("width" in artifact)) throw new Error("6패스 PNG 크기 영수증이 없습니다.");
          await decodeStudioBg3dSixPassPng(body, artifact.width, artifact.height);
        }
        if (role === "main-line") {
          const legacy = await acquireStudioLinked3dPassProductAuthority();
          const stored = await legacy.put(body, { mime: "image/png" });
          if (stored.ref.hash !== artifact.contentHash || !await legacy.get(artifact.contentHash, { verify: true })) throw new Error("6패스 주선화 CAS 복원이 실패했습니다.");
        }
        retained.push(artifact.contentHash);
      }
      if (!scene) throw new Error("6패스 원본 장면이 올바르지 않습니다.");
      const owner = studioBg3dSixPassBundleOwner(manifest.pageId, manifest.bundleId, manifest.renderRevisionId);
      await runStudioBg3dSixPassBundleMutationExclusive(owner, () => authority.setOwnerRefs(owner, retained));
      return { manifest, scene };
    })().catch((error: unknown) => { pending.delete(cacheKey); throw error; });
    pending.set(cacheKey, operation);
  }
  return operation;
}
function image(manifest: StudioBg3dSixPassBundleManifest, scene: StudioBg3dSceneDocument, id: string): BundleImage {
  const layer = manifest.layers.find((entry) => entry.elementId === id);
  if (!layer) throw new Error("6패스 manifest에 원고 요소가 없습니다.");
  return { id, type: "image", x: 0, y: 0, width: manifest.width, height: manifest.height, rotation: 0,
    src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
    groupId: manifest.groupId, blendMode: layer.blendMode, opacity: layer.opacity, hidden: !layer.visible,
    bg3dLtBundleId: manifest.bundleId, bg3dLtRole: layer.role, bg3dLtRenderMode: "separated",
    bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId,
      manifestHash: hashStudioBg3dSixPassBundleManifest(manifest), role: layer.role, elementId: id },
    ...(id === manifest.anchorElementId ? { bg3dScene: scene } : {}) };
}
function descriptor(loaded: LoadedRevision, sourceHash: `sha256:${string}`, revision: number): StudioLinked3dPassRevisionDescriptor {
  const line = loaded.manifest.layers.find(({ role }) => role === "main-line")!.artifact;
  const withoutRoot = { revision, sourceHash, ...computeStudioLinked3dSceneRevisionSignatures(loaded.scene),
    artifact: { pass: "line" as const, role: "main-line" as const, contentHash: line.contentHash, byteSize: line.byteSize,
      mime: "image/png" as const, width: line.width, height: line.height, locator: `studio-opfs-cas:${line.contentHash}` as const } };
  return { ...withoutRoot, passRootHash: computeStudioLinked3dPassRootHash(withoutRoot) };
}
/** 모든 보존 revision 본문을 검증한 뒤에만 한 frontier와 이미지 원본 집합을 반환한다. */
export async function hydrateStudioBg3dSixPassFrontier(frontier: StudioCrdtSceneGraphFrontier, workId: string | null, baseline: readonly PageState[] = []): Promise<{
  frontier: StudioCrdtSceneGraphFrontier; sources: ReadonlyMap<string, BundleImage>;
}> {
  const sources = new Map<string, BundleImage>();
  const pages = [];
  for (const page of frontier.pages) {
    const refs = page.bg3dLtBundleReferences;
    if (!refs) { pages.push(page); continue; }
    const loaded = new Map<string, LoadedRevision>();
    for (const ref of refs.revisions) loaded.set(ref.renderRevisionId, await loadRevision(ref, workId));
    const bundles = Object.entries(refs.active).map(([bundleId, activeRevisionId]) => ({ bundleId, activeRevisionId,
      revisions: refs.revisions.filter((ref) => ref.bundleId === bundleId).map((ref) => loaded.get(ref.renderRevisionId)!.manifest) }));
    const state = parseStudioBg3dSixPassBundleState({ contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1,
      minimumProjectVersion: 5, minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, bundles });
    for (const record of frontier.sceneElements) {
      if (record.deleted || record.pageId !== page.id) continue;
      const ref = parseStudioBg3dSixPassBundleImageReference(record.payload.props.bg3dLtBundleReference);
      if (!ref) continue;
      const entry = loaded.get(ref.renderRevisionId);
      if (!entry || ref.elementId !== record.id || hashStudioBg3dSixPassBundleManifest(entry.manifest) !== ref.manifestHash) throw new Error("6패스 이미지의 봉인 참조를 찾지 못했습니다.");
      const source = image(entry.manifest, entry.scene, record.id);
      if (record.payload.props.src !== source.src || record.layerId !== source.groupId || ref.role !== source.bg3dLtRole) throw new Error("6패스 이미지 원본·역할·그룹이 봉인 참조와 다릅니다.");
      sources.set(record.id, source);
    }
    const oldIndex = parseStudioLinked3dRenderDocument(baseline.find((entry) => entry.id === page.id)?.linked3dRender);
    let linked3dRender: StudioLinked3dRenderDocument | undefined = oldIndex
      ? { ...oldIndex, links: oldIndex.links.filter((link) => !bundles.some((bundle) => bundle.bundleId === link.bundleId)) } : undefined;
    const correctionSources = frontier.strokes.filter((stroke) => !stroke.deleted && stroke.pageId === page.id)
      .map(studioCrdtStrokeToDrawElement)
      // 보관본은 frontier에 그대로 두고 활성 보정 index의 입력에서만 제외한다.
      .filter((source) => !isStudioLegacyPigmentArchivedElement(source))
      .map(({ linked3dCorrection, ...source }) => {
        if (linked3dCorrection === undefined) return source;
        const provenance = parseStudioLinked3dCorrectionProvenance(linked3dCorrection);
        if (!provenance) throw new Error("6패스 보정 획의 연결 출처가 올바르지 않습니다.");
        return { ...source, linked3dCorrection: provenance };
      });
    for (const bundle of bundles) {
      if (!bundle.activeRevisionId) continue;
      const active = loaded.get(bundle.activeRevisionId)!;
      const currentSources = [...sources.values()].filter((source) => source.bg3dLtBundleId === bundle.bundleId);
      if (!currentSources.some((source) => source.bg3dLtRole === "main-line")) continue;
      const stage = studioShared3dStageEntryAsDocument(page.shared3dStage, bundle.bundleId);
      if (!stage || !active.scene.activeShotId) throw new Error("6패스의 기존 연결형 Stage·Shot 원본이 없습니다.");
      const next = upsertStudioLinked3dRenderLink({ value: linked3dRender, bundleId: bundle.bundleId, shotId: active.scene.activeShotId,
        passRevision: descriptor(active, stage.background.sourceHash, active.manifest.linePassRevision), elements: [...currentSources, ...correctionSources], shared3dStage: page.shared3dStage! });
      if (!next) throw new Error("6패스의 기존 연결형 선화 index를 복원하지 못했습니다.");
      linked3dRender = next;
    }
    pages.push({ ...page, bg3dLtBundles: state, linked3dRender });
  }
  return { frontier: { ...frontier, pages }, sources };
}
