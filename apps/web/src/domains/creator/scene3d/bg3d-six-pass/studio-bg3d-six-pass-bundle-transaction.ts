import { decodeStudioBg3dSixPassPng } from "./studio-bg3d-six-pass-png-decode";
import {
  STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_BUNDLE_CONTRACT,
  STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES,
  STUDIO_BG3D_SIX_PASS_ROLES, assertStudioBg3dSixPassBundleTransition,
  createStudioBg3dSixPassBundleReceipt, verifyStudioBg3dSixPassBundleReceipt, hashStudioBg3dSixPassBundleManifest,
  hashStudioBg3dSixPassCanonicalJson, parseStudioBg3dSixPassBundleManifest,
  parseStudioBg3dSixPassBundleState, serializeStudioBg3dSixPassBundleManifest,
  studioBg3dSixPassArtifactSourceUri, verifyStudioBg3dSixPassArtifactBytes, verifyStudioBg3dSixPassBundleSceneBytes,
  type StudioBg3dSixPassBundleManifest, type StudioBg3dSixPassBundleReceipt,
  type StudioBg3dSixPassBundleState, type StudioBg3dSixPassContentHash,
} from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";
import { serializeStudioBg3dSceneDocument, type StudioBg3dSceneDocument } from "../../bg3d/studio-bg3d-scene-document";
import type { StudioBackground3DInsertResult } from "../../scene-3d/studio-3d-insert-contract";
import type { El } from "../../studio-element-model";
import type { PageState } from "../../studio-page-state";
import type { StudioCrdtDocument } from "../../live/studio-crdt-document";
import { runStudioBg3dSixPassBundleMutationExclusive } from "./studio-bg3d-six-pass-bundle-product-authority";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import { computeStudioLinked3dPassRootHash, isStudioLinked3dPassRevisionForScene,
  type StudioLinked3dPreparedPass } from "../../studio-linked-3d-pass-transaction";

const ENCODER = new TextEncoder();
export const STUDIO_BG3D_SIX_PASS_MANIFEST_MIME = "application/vnd.toonstudio.bg3d-sixpass-bundle+json";
export function studioBg3dSixPassBundleOwner(pageId: string, bundleId: string, revisionId: string): string {
  return `studio-bg3d-sixpass:${pageId}:${bundleId}:${revisionId}`;
}
function digest(bytes: Uint8Array): StudioBg3dSixPassContentHash { return `sha256:${sha256HexPortable(bytes)}`; }
function pngBytes(source: string): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (!source.startsWith(prefix)) throw new Error("6패스 원본이 PNG data URL이 아닙니다.");
  const encoded = source.slice(prefix.length);
  if (!encoded || encoded.length > Math.ceil(STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES / 3) * 4 + 4
    || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/u.test(encoded)
    || (encoded.indexOf("=") >= 0 && encoded.indexOf("=") < encoded.length - (encoded.endsWith("==") ? 2 : 1))) {
    throw new Error("6패스 PNG 인코딩이 손상되었거나 바이트 예산을 초과했습니다.");
  }
  const binary = atob(encoded);
  if (binary.length > STUDIO_BG3D_SIX_PASS_PNG_MAX_BYTES) throw new Error("6패스 PNG 바이트 예산을 초과했습니다.");
  return Uint8Array.from(binary, (value) => value.charCodeAt(0));
}

export interface StudioBg3dSixPassPreparedBundle {
  readonly manifest: StudioBg3dSixPassBundleManifest;
  readonly receipt: StudioBg3dSixPassBundleReceipt;
  readonly state: StudioBg3dSixPassBundleState;
  readonly elements: El[];
  readonly ownerId: string;
  readonly retainedHashes: readonly StudioBg3dSixPassContentHash[];
}

/** strict state 검증을 통과한 이력에서도 분기를 활성 포인터로 숨기지 않는다. */
export function studioBg3dSixPassRetainedTip(revisions: readonly StudioBg3dSixPassBundleManifest[]): StudioBg3dSixPassBundleManifest | null {
  if (!revisions.length) return null;
  const parents = new Set(revisions.map(({ parentRevisionId }) => parentRevisionId).filter((id) => id !== null));
  const tips = revisions.filter(({ renderRevisionId }) => !parents.has(renderRevisionId));
  if (tips.length !== 1) throw new Error("6패스 보존 이력의 마지막 revision이 유일하지 않습니다. 분기 이력을 먼저 확인해 주세요.");
  return tips[0] ?? null;
}

/** 여섯 본문·정본 장면·manifest의 재읽기가 끝나야 문서 반영 영수증을 만든다. */
export async function prepareStudioBg3dSixPassBundle(input: {
  readonly authority: StudioOpfsAssetStore;
  readonly result: StudioBackground3DInsertResult;
  readonly scene: StudioBg3dSceneDocument;
  readonly elements: readonly El[];
  readonly pageId: string;
  readonly bundleId: string;
  readonly groupId: string;
  readonly anchorElementId: string;
  readonly renderRevisionId: string;
  readonly linePassRevision?: number;
  readonly previousState?: StudioBg3dSixPassBundleState;
}): Promise<StudioBg3dSixPassPreparedBundle> {
  if (input.authority.kind !== "opfs") throw new Error("6패스 묶음에는 영속 OPFS가 필요합니다.");
  const sceneText = serializeStudioBg3dSceneDocument(input.scene);
  if (!sceneText || input.scene.version !== 4 || !input.scene.output.sixPassLt || input.scene.attachments.length) {
    throw new Error("6패스 묶음 v1은 원본 모델 첨부가 없는 정본 v4 장면을 지원합니다.");
  }
  const previousState = input.previousState ? parseStudioBg3dSixPassBundleState(input.previousState) : undefined;
  const before = previousState?.bundles.find(({ bundleId }) => bundleId === input.bundleId);
  const parent = studioBg3dSixPassRetainedTip(before?.revisions ?? []);
  const retainedHashes: StudioBg3dSixPassContentHash[] = [];
  const layers = [];
  for (const role of STUDIO_BG3D_SIX_PASS_ROLES) {
    const candidates = input.result.layers.filter((entry) => entry.role === role);
    const members = input.elements.filter((entry): entry is Extract<El, { type: "image" }> => entry.type === "image"
      && entry.bg3dLtBundleId === input.bundleId && entry.bg3dLtRole === role);
    const layer = candidates[0], element = members[0];
    if (candidates.length !== 1 || members.length !== 1 || !layer || !element || element.groupId !== input.groupId) {
      throw new Error("6패스 묶음의 여섯 역할·요소·그룹 결박을 확인하지 못했습니다.");
    }
    const bytes = pngBytes(layer.pngDataUrl);
    const artifact = { contentHash: digest(bytes), byteSize: bytes.byteLength, mimeType: "image/png" as const,
      width: layer.width, height: layer.height };
    verifyStudioBg3dSixPassArtifactBytes(artifact, bytes);
    await decodeStudioBg3dSixPassPng(bytes, artifact.width, artifact.height);
    const stored = await input.authority.put(bytes, { mime: artifact.mimeType });
    const verified = await input.authority.get(artifact.contentHash, { verify: true });
    if (stored.ref.hash !== artifact.contentHash || !verified) throw new Error("6패스 PNG의 CAS 영수증이 일치하지 않습니다.");
    verifyStudioBg3dSixPassArtifactBytes(artifact, verified);
    retainedHashes.push(artifact.contentHash);
    layers.push({ role, elementId: element.id, artifact, blendMode: element.blendMode ?? "normal",
      opacity: element.opacity ?? 1, visible: !element.hidden });
  }
  const sceneBytes = ENCODER.encode(sceneText);
  const scene = { documentVersion: 4 as const, contentHash: digest(sceneBytes), byteSize: sceneBytes.byteLength,
    mimeType: "application/json" as const, activeShotId: input.scene.activeShotId ?? null };
  const main = layers.find(({ role }) => role === "main-line");
  const previousMain = parent?.layers.find(({ role }) => role === "main-line");
  const unchanged = parent?.scene.contentHash === scene.contentHash && previousMain?.artifact.contentHash === main?.artifact.contentHash;
  const linePassRevision = parent ? parent.linePassRevision + (unchanged ? 0 : 1) : input.linePassRevision ?? 1;
  const manifest = parseStudioBg3dSixPassBundleManifest({
    contract: STUDIO_BG3D_SIX_PASS_BUNDLE_CONTRACT, version: 1,
    minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5,
    bundleId: input.bundleId, renderRevisionId: input.renderRevisionId, parentRevisionId: parent?.renderRevisionId ?? null,
    linePassRevision,
    pageId: input.pageId, groupId: input.groupId, anchorElementId: input.anchorElementId,
    width: input.result.width, height: input.result.height,
    cameraHash: hashStudioBg3dSixPassCanonicalJson(input.scene.camera),
    outputSettingsHash: hashStudioBg3dSixPassCanonicalJson(input.scene.output), scene, layers,
  });
  assertStudioBg3dSixPassBundleTransition(parent, manifest);
  verifyStudioBg3dSixPassArtifactBytes(scene, sceneBytes);
  const storedScene = await input.authority.put(sceneBytes, { mime: scene.mimeType });
  const verifiedScene = await input.authority.get(scene.contentHash, { verify: true });
  if (storedScene.ref.hash !== scene.contentHash || !verifiedScene) throw new Error("6패스 원본 장면의 CAS 영수증이 일치하지 않습니다.");
  verifyStudioBg3dSixPassBundleSceneBytes(manifest, verifiedScene);
  retainedHashes.push(scene.contentHash);
  const manifestHash = hashStudioBg3dSixPassBundleManifest(manifest);
  const storedManifest = await input.authority.put(ENCODER.encode(serializeStudioBg3dSixPassBundleManifest(manifest)),
    { mime: STUDIO_BG3D_SIX_PASS_MANIFEST_MIME });
  if (storedManifest.ref.hash !== manifestHash) throw new Error("6패스 manifest hash가 저장 영수증과 다릅니다.");
  retainedHashes.push(manifestHash);
  const manifestByRole = new Map(manifest.layers.map((entry) => [entry.role, entry]));
  const elements = input.elements.map((entry): El => {
    if (entry.type !== "image" || entry.bg3dLtBundleId !== input.bundleId || !entry.bg3dLtRole) return entry;
    const layer = manifestByRole.get(entry.bg3dLtRole);
    if (!layer || entry.id !== layer.elementId) throw new Error("6패스 이미지가 manifest에 없는 역할을 가집니다.");
    return { ...entry, src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}`
      : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
      bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: manifest.bundleId,
        renderRevisionId: manifest.renderRevisionId, manifestHash, role: layer.role, elementId: entry.id } };
  });
  const state = parseStudioBg3dSixPassBundleState({
    contract: STUDIO_BG3D_SIX_PASS_BUNDLE_STATE_CONTRACT, version: 1,
    minimumReaderCapability: STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, minimumProjectVersion: 5,
    bundles: [...(previousState?.bundles ?? []).filter(({ bundleId }) => bundleId !== manifest.bundleId), {
      bundleId: manifest.bundleId, activeRevisionId: manifest.renderRevisionId,
      revisions: [...(before?.revisions ?? []), manifest],
    }],
  });
  return { manifest, receipt: createStudioBg3dSixPassBundleReceipt(manifest), state, elements,
    ownerId: studioBg3dSixPassBundleOwner(input.pageId, input.bundleId, input.renderRevisionId), retainedHashes };
}

/** 실행 취소된 활성 패스와 보존 이력의 번호가 달라도 검증된 새 선화에만 번호를 적용한다. */
export function alignStudioBg3dSixPassPreparedLinePass(prepared: StudioLinked3dPreparedPass,
  manifestValue: StudioBg3dSixPassBundleManifest, scene: StudioBg3dSceneDocument): StudioLinked3dPreparedPass {
  const manifest = parseStudioBg3dSixPassBundleManifest(manifestValue);
  const line = prepared.descriptor, main = manifest.layers.find(({ role }) => role === "main-line");
  if (!isStudioLinked3dPassRevisionForScene(line, scene) || line.sceneHash !== manifest.scene.contentHash
    || manifest.cameraHash !== hashStudioBg3dSixPassCanonicalJson(scene.camera)
    || manifest.outputSettingsHash !== hashStudioBg3dSixPassCanonicalJson(scene.output)
    || !main || line.artifact.contentHash !== main.artifact.contentHash || line.artifact.byteSize !== main.artifact.byteSize
    || line.artifact.width !== main.artifact.width || line.artifact.height !== main.artifact.height) {
    throw new Error("6패스 선화의 장면·픽셀 원본이 준비된 패스와 일치하지 않습니다.");
  }
  if (line.revision === manifest.linePassRevision) return prepared;
  const revised = { ...line, revision: manifest.linePassRevision };
  return { ...prepared, descriptor: { ...revised, passRootHash: computeStudioLinked3dPassRootHash(revised) } };
}

/** 원격 봉인 전에 실제 현재 문서의 복제본으로 전체 CRDT 전이 예산을 검증한다. */
export async function preflightStudioBg3dSixPassPageCommit(input: {
  readonly document: StudioCrdtDocument | null; readonly pages: readonly PageState[]; readonly nextPage: PageState;
}): Promise<void> {
  if (!input.document) return;
  const [{ StudioCrdtDocument }, { publishStudioCrdtSceneGraphDiff }, { readStudioCrdtBoundPageSnapshot }] = await Promise.all([
    import("../../live/studio-crdt-document"), import("../../live/studio-crdt-scene-publisher"), import("../../live/studio-crdt-frontier-reconciliation-binding"),
  ]);
  const pages = readStudioCrdtBoundPageSnapshot(input.document) ?? input.pages;
  if (!pages.some(({ id }) => id === input.nextPage.id) || input.document.getPages().some(({ id }) => !pages.some((page) => page.id === id)))
    throw new Error("6패스 원고의 전체 페이지 검증 경로가 준비되지 않았습니다. 동기화 후 다시 적용해 주세요.");
  const shadow = new StudioCrdtDocument(input.document.encodeStateAsUpdate());
  try {
    publishStudioCrdtSceneGraphDiff(shadow, pages, pages.map((page) => page.id === input.nextPage.id ? input.nextPage : page));
  } finally { shadow.destroy(); }
}

/** 복구된 원본도 기존 문서 commit과 결박하고 거부·예외 때 모든 owner snapshot을 복구한다. */
export async function commitStudioBg3dSixPassPreparedBundle<T>(input: {
  readonly authority: StudioOpfsAssetStore;
  readonly prepared: StudioBg3dSixPassPreparedBundle;
  readonly restoredManifests?: readonly StudioBg3dSixPassBundleManifest[];
  readonly apply: () => T | Promise<T>;
}): Promise<T> {
  verifyStudioBg3dSixPassBundleReceipt(input.prepared.receipt, input.prepared.manifest);
  const state = parseStudioBg3dSixPassBundleState(input.prepared.state);
  const retained = new Map([[input.prepared.ownerId, input.prepared.retainedHashes]]);
  for (const manifest of input.restoredManifests ?? []) {
    const contained = state.bundles.find(({ bundleId }) => bundleId === manifest.bundleId)?.revisions.find(({ renderRevisionId }) => renderRevisionId === manifest.renderRevisionId);
    if (manifest.pageId !== input.prepared.manifest.pageId || manifest.bundleId !== input.prepared.manifest.bundleId
      || !contained || hashStudioBg3dSixPassBundleManifest(contained) !== hashStudioBg3dSixPassBundleManifest(manifest)) throw new Error("복구할 6패스 원본이 이번 원고의 보존 이력과 다릅니다.");
    retained.set(studioBg3dSixPassBundleOwner(manifest.pageId, manifest.bundleId, manifest.renderRevisionId),
      [manifest.scene.contentHash, ...manifest.layers.map(({ artifact }) => artifact.contentHash), hashStudioBg3dSixPassBundleManifest(manifest)]);
  }
  const owners = [...retained.keys()].toSorted();
  const locked = (index: number): Promise<T> => {
    const owner = owners[index];
    return owner ? runStudioBg3dSixPassBundleMutationExclusive(owner, () => locked(index + 1)) : commit();
  };
  const commit = async (): Promise<T> => {
    const before = new Map<string, readonly string[]>();
    for (const owner of owners) before.set(owner, await input.authority.ownerRefs(owner));
    const rollback = async (cause?: unknown) => {
      const failures: unknown[] = [];
      for (const owner of [...owners].reverse()) {
        try { await input.authority.setOwnerRefs(owner, before.get(owner) ?? []); }
        catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError([...(cause === undefined ? [] : [cause]), ...failures], "6패스 원고 거부 후 저장 참조를 복구하지 못했습니다.", { cause });
    };
    let result: T;
    try {
      for (const [owner, hashes] of retained) await input.authority.setOwnerRefs(owner, hashes);
      result = await input.apply();
    } catch (error) { await rollback(error); throw error; }
    if (result === false) await rollback();
    return result;
  };
  return locked(0);
}
