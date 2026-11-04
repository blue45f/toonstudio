import {
  getStudioBg3dSixPassBundleArtifacts,
  hashStudioBg3dSixPassBundleManifest,
  serializeStudioBg3dSixPassBundleManifest,
  parseStudioBg3dSixPassBundleImageReference,
  studioBg3dSixPassArtifactSourceUri,
  verifyStudioBg3dSixPassArtifactBytes,
  verifyStudioBg3dSixPassBundleSceneBytes,
  type StudioBg3dSixPassArtifact,
  type StudioBg3dSixPassBundleManifest,
  type StudioBg3dSixPassContentHash,
} from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { decodeStudioBg3dSixPassPng } from "./studio-bg3d-six-pass-png-decode";
import { parseStudioBg3dSceneDocument } from "../../bg3d/studio-bg3d-scene-document";
import { collectStudioBg3dSixPassProjectBundles, hasStudioBg3dSixPassProjectBundles } from "./studio-bg3d-six-pass-project-contract";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import type {
  ImportStudioProjectArchiveResult,
  StudioProjectArchiveAttachmentInput,
} from "../../studio-project-archive";
import type { StudioProjectFile } from "../../studio-project-file";

type ArtifactKind = "raster" | "bg3d-lt-scene";
interface BundleArchiveReference {
  readonly artifact: StudioBg3dSixPassArtifact;
  readonly manifest: StudioBg3dSixPassBundleManifest;
  readonly pointer: string;
  readonly kind: ArtifactKind;
  readonly ownerId: string;
}
interface ArchiveEvidence {
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly kinds: readonly string[];
  readonly documentReferences: readonly {
    readonly pointer: string;
    readonly usage: string;
    readonly mode?: string;
  }[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function rawHash(hash: StudioBg3dSixPassContentHash): string { return hash.slice(7); }
function fail(message: string): never { throw new Error(`6패스 묶음 아카이브: ${message}`); }
function assertOwnedArrayBuffer(bytes: Uint8Array): asserts bytes is Uint8Array<ArrayBuffer> {
  if (!(bytes.buffer instanceof ArrayBuffer)) fail("공유 메모리 본문은 아카이브에 담을 수 없습니다.");
}

export { hasStudioBg3dSixPassProjectBundles };

/** JSON 본문은 전체 장면 reader도 통과해야 하며, 미입장 모델 원본을 자기완결로 취급하지 않는다. */
export function inspectStudioBg3dSixPassArchiveSceneBytes(bytes: Uint8Array): void {
  if (bytes.byteLength > 320 * 1024) fail("장면 JSON 본문이 안전 한도를 넘었습니다.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); JSON.parse(text); }
  catch { fail("장면 UTF-8 JSON이 손상되었습니다."); }
  const scene = parseStudioBg3dSceneDocument(text);
  if (!scene || scene.version !== 4 || !scene.output.sixPassLt) fail("장면 v4와 6패스 설정이 필요합니다.");
  if (scene.attachments.length > 0) fail("원본 모델 본문이 입장하지 않은 장면은 자기완결 묶음으로 내보낼 수 없습니다.");
}

function verifyScene(reference: BundleArchiveReference, bytes: Uint8Array): void {
  if (reference.kind !== "bg3d-lt-scene") return;
  inspectStudioBg3dSixPassArchiveSceneBytes(bytes);
  verifyStudioBg3dSixPassBundleSceneBytes(reference.manifest, bytes);
}

async function verifyReferenceBytes(entries: readonly BundleArchiveReference[], bytes: Uint8Array): Promise<void> {
  for (const reference of entries) { verifyStudioBg3dSixPassArtifactBytes(reference.artifact, bytes); verifyScene(reference, bytes); }
  const artifact = entries[0]?.artifact;
  if (artifact?.mimeType === "image/png") await decodeStudioBg3dSixPassPng(bytes, artifact.width, artifact.height);
}

async function planReferences(project: StudioProjectFile): Promise<{
  readonly references: readonly BundleArchiveReference[];
  readonly coveredSources: ReadonlySet<string>;
}> {
  const states = await collectStudioBg3dSixPassProjectBundles(project);
  for (const page of project.pagesList) {
    for (const element of page.elements) {
      if (record(element) && (element.bg3dLtBundleReference !== undefined
        || (typeof element.src === "string" && element.src.startsWith("bg3d-lt-artifact:")))
        && page.bg3dLtBundles === undefined) fail("묶음 레이어에 보존 manifest가 없습니다.");
      if (record(element) && typeof element.src === "string" && element.src.startsWith("bg3d-lt-artifact:")
        && element.bg3dLtBundleReference === undefined) fail("묶음 source에 역할 참조가 없습니다.");
    }
  }
  const references: BundleArchiveReference[] = [];
  const coveredSources = new Set<string>();
  for (const { pageIndex, pageId, state } of states) {
    const page = project.pagesList[pageIndex];
    for (let bundleIndex = 0; bundleIndex < state.bundles.length; bundleIndex += 1) {
      const bundle = state.bundles[bundleIndex];
      for (let revisionIndex = 0; revisionIndex < bundle.revisions.length; revisionIndex += 1) {
        const manifest = bundle.revisions[revisionIndex];
        const base = `/pagesList/${pageIndex}/bg3dLtBundles/bundles/${bundleIndex}/revisions/${revisionIndex}`;
        for (const { role, artifact } of getStudioBg3dSixPassBundleArtifacts(manifest)) {
          const layerIndex = manifest.layers.findIndex((layer) => layer.role === role);
          references.push({ artifact, manifest, kind: role === "scene" ? "bg3d-lt-scene" : "raster",
            pointer: role === "scene" ? `${base}/scene/contentHash` : `${base}/layers/${layerIndex}/artifact/contentHash`,
            ownerId: `studio-bg3d-sixpass:${pageId}:${bundle.bundleId}:${manifest.renderRevisionId}` });
        }
      }
    }
    // 보존 revision은 모두 첨부하되, 현재 남아 있는 이미지의 결박만 검사한다. 사용자 표시 속성은 변경하지 않는다.
    for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex += 1) {
      const element = page.elements[elementIndex];
      if (!record(element) || element.bg3dLtBundleReference === undefined) continue;
      const reference = parseStudioBg3dSixPassBundleImageReference(element.bg3dLtBundleReference);
      const bundle = reference ? state.bundles.find((entry) => entry.bundleId === reference.bundleId) : undefined;
      const manifest = bundle?.revisions.find((entry) => entry.renderRevisionId === reference?.renderRevisionId);
      const layer = manifest?.layers.find((entry) => entry.role === reference?.role);
      if (!reference || !manifest || !layer || reference.manifestHash !== hashStudioBg3dSixPassBundleManifest(manifest)
        || element.type !== "image" || element.id !== reference.elementId || element.id !== layer.elementId
        || element.bg3dLtBundleId !== manifest.bundleId || element.bg3dLtRole !== layer.role) fail("현재 레이어의 역할·요소·revision 결박이 손상되었습니다.");
      const expected = layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash);
      if (element.src !== expected) fail("현재 레이어 source가 보존된 본문 digest와 다릅니다.");
      coveredSources.add(`/pagesList/${pageIndex}/elements/${elementIndex}/src`);
    }
  }
  return { references, coveredSources };
}

export async function assertStudioBg3dSixPassProjectArchiveEvidence(project: StudioProjectFile,
  evidence: readonly ArchiveEvidence[]): Promise<ReadonlySet<string>> {
  const plan = await planReferences(project);
  const byHash = new Map(evidence.map((entry) => [entry.sha256, entry]));
  for (const reference of plan.references) {
    const attachment = byHash.get(rawHash(reference.artifact.contentHash));
    if (!attachment || attachment.byteSize !== reference.artifact.byteSize || attachment.mimeType !== reference.artifact.mimeType
      || !attachment.kinds.includes(reference.kind) || !attachment.documentReferences.some((entry) => entry.pointer === reference.pointer
        && entry.usage === reference.kind && entry.mode === "sha256-prefixed")) fail("보존 revision의 본문 또는 정확한 hash 포인터가 없습니다.");
  }
  const sceneHashes = new Set(plan.references.filter((entry) => entry.kind === "bg3d-lt-scene").map((entry) => rawHash(entry.artifact.contentHash)));
  if (evidence.some((entry) => entry.kinds.includes("bg3d-lt-scene") && !sceneHashes.has(entry.sha256))) fail("장면 본문에 보존된 묶음 manifest가 없습니다.");
  return plan.coveredSources;
}

/** archive writer/importer가 한 본문씩 검증한다. 전체 384 MiB 배열을 별도로 복제하지 않는다. */
export async function verifyStudioBg3dSixPassProjectArchiveBodies(project: StudioProjectFile,
  read: (hash: StudioBg3dSixPassContentHash) => Promise<Uint8Array | null>): Promise<void> {
  const { references } = await planReferences(project);
  const grouped = groupReferences(references);
  for (const [hash, entries] of grouped) {
    const bytes = await read(hash);
    if (!bytes) fail("보존 revision의 본문을 찾지 못했습니다.");
    await verifyReferenceBytes(entries, bytes);
  }
}

function groupReferences(references: readonly BundleArchiveReference[]): Map<StudioBg3dSixPassContentHash, BundleArchiveReference[]> {
  const groups = new Map<StudioBg3dSixPassContentHash, BundleArchiveReference[]>();
  for (const reference of references) {
    const entries = groups.get(reference.artifact.contentHash) ?? [];
    entries.push(reference); groups.set(reference.artifact.contentHash, entries);
  }
  return groups;
}

interface BundleArchiveExportInput {
  readonly project: StudioProjectFile; readonly authority: StudioOpfsAssetStore;
  readonly signal?: AbortSignal; readonly isCurrent?: () => boolean | Promise<boolean>;
  readonly limits?: { readonly maxAttachmentBytes?: number; readonly maxTotalAttachmentBytes?: number; readonly maxAttachments?: number };
  readonly reservedArtifacts?: readonly { readonly contentHash: StudioBg3dSixPassContentHash; readonly byteSize: number }[];
  readonly consumedAttachmentBytes?: number; readonly consumedAttachmentCount?: number;
}
function bounded(value: number | undefined, maximum: number): number {
  const result = value ?? maximum;
  if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) fail("첨부 안전 한도가 올바르지 않습니다.");
  return result;
}
async function preflightExport(input: BundleArchiveExportInput): Promise<Map<StudioBg3dSixPassContentHash, BundleArchiveReference[]>> {
  if (input.authority.kind !== "opfs") fail("내보내기에 durable OPFS 본문 저장소가 필요합니다.");
  const groups = groupReferences((await planReferences(input.project)).references);
  const sizes = new Map((input.reservedArtifacts ?? []).map((entry) => [entry.contentHash, entry.byteSize]));
  const maximum = bounded(input.limits?.maxTotalAttachmentBytes, 512 * 1024 * 1024);
  const single = bounded(input.limits?.maxAttachmentBytes, 96_000_000);
  const count = bounded(input.limits?.maxAttachments, 512);
  const consumed = input.consumedAttachmentBytes ?? 0, consumedCount = input.consumedAttachmentCount ?? 0;
  if (![consumed, consumedCount].every((value) => Number.isSafeInteger(value) && value >= 0)) fail("이미 준비된 첨부 예산이 올바르지 않습니다.");
  for (const [hash, entries] of groups) {
    const bytes = entries[0].artifact.byteSize;
    if (sizes.has(hash) && sizes.get(hash) !== bytes) fail("동일 digest의 첨부 크기 영수증이 다릅니다.");
    sizes.set(hash, bytes);
  }
  if (sizes.size + consumedCount > count || [...sizes.values()].some((bytes) => bytes <= 0 || bytes > single)
    || [...sizes.values()].reduce((sum, bytes) => sum + bytes, consumed) > maximum) fail("보존 revision을 포함한 첨부 합계가 아카이브 안전 한도를 넘었습니다.");
  // 큰 본문 get 이전에 모든 metadata 영수증을 검사한다. 늦은 실패로 큰 prefix를 보유하지 않는다.
  for (const [hash, entries] of groups) {
    input.signal?.throwIfAborted();
    if (input.isCurrent && !await input.isCurrent()) fail("내보내는 동안 문서 세대가 바뀌었습니다.");
    const stat = await input.authority.stat(hash);
    if (!stat || entries.some(({ artifact }) => stat.bytes !== artifact.byteSize || stat.mime !== artifact.mimeType)) fail("본문 저장 영수증이 manifest와 다릅니다.");
  }
  return groups;
}
export async function preflightStudioBg3dSixPassProjectArchiveExport(input: BundleArchiveExportInput): Promise<void> {
  await preflightExport(input);
}
export async function prepareStudioBg3dSixPassProjectArchiveExport(input: BundleArchiveExportInput): Promise<readonly (StudioProjectArchiveAttachmentInput & { readonly contentHash: StudioBg3dSixPassContentHash })[]> {
  const groups = await preflightExport(input);
  const output: (StudioProjectArchiveAttachmentInput & { readonly contentHash: StudioBg3dSixPassContentHash })[] = [];
  for (const [hash, entries] of groups) {
    input.signal?.throwIfAborted();
    if (input.isCurrent && !await input.isCurrent()) fail("내보내는 동안 문서 세대가 바뀌었습니다.");
    const bytes = await input.authority.get(hash, { verify: true });
    if (!bytes) fail("본문이 저장소에 없습니다.");
    await verifyReferenceBytes(entries, bytes);
    assertOwnedArrayBuffer(bytes);
    output.push({ contentHash: hash, kind: entries[0].kind, data: new Blob([bytes], { type: entries[0].artifact.mimeType }), mimeType: entries[0].artifact.mimeType,
      documentReferences: entries.map((reference) => ({ pointer: reference.pointer, usage: reference.kind, mode: "sha256-prefixed" })) });
  }
  if (input.isCurrent && !await input.isCurrent()) fail("내보내는 동안 문서 세대가 바뀌었습니다.");
  return output;
}

export async function restoreStudioBg3dSixPassProjectArchiveImport<T>(input: {
  readonly archive: Pick<ImportStudioProjectArchiveResult, "project" | "attachments">;
  readonly authority: StudioOpfsAssetStore;
  readonly runOwnerExclusive: <Result>(owner: string, task: () => Promise<Result>) => Promise<Result>;
  readonly apply: (project: StudioProjectFile) => T | false | Promise<T | false>;
}): Promise<T> {
  if (input.authority.kind !== "opfs") fail("가져오기에 durable OPFS 본문 저장소가 필요합니다.");
  const { references } = await planReferences(input.archive.project);
  await assertStudioBg3dSixPassProjectArchiveEvidence(input.archive.project,
    [...input.archive.attachments.values()].map((attachment) => attachment.metadata));
  const owners = new Map<string, Set<string>>();
  for (const [hash, entries] of groupReferences(references)) {
    const attachment = input.archive.attachments.get(rawHash(hash));
    if (!attachment) fail("가져올 본문이 없습니다.");
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    await verifyReferenceBytes(entries, bytes);
    const stored = await input.authority.put(bytes, { mime: entries[0].artifact.mimeType });
    if (stored.ref.hash !== hash || stored.ref.bytes !== bytes.byteLength || stored.ref.mime !== entries[0].artifact.mimeType) fail("OPFS 본문 입장 영수증이 다릅니다.");
    const durable = await input.authority.get(hash, { verify: true });
    if (!durable) fail("입장시킨 OPFS 본문을 다시 읽을 수 없습니다.");
    for (const reference of entries) verifyStudioBg3dSixPassArtifactBytes(reference.artifact, durable);
    for (const reference of entries) { const hashes = owners.get(reference.ownerId) ?? new Set<string>(); hashes.add(hash); owners.set(reference.ownerId, hashes); }
  }
  for (const { state } of await collectStudioBg3dSixPassProjectBundles(input.archive.project)) {
    for (const bundle of state.bundles) for (const manifest of bundle.revisions) {
      const hash = hashStudioBg3dSixPassBundleManifest(manifest);
      const bytes = new TextEncoder().encode(serializeStudioBg3dSixPassBundleManifest(manifest));
      const stored = await input.authority.put(bytes, { mime: "application/vnd.toonstudio.bg3d-sixpass-bundle+json" });
      const durable = await input.authority.get(hash, { verify: true });
      if (stored.ref.hash !== hash || !durable || new TextDecoder("utf-8", { fatal: true }).decode(durable) !== serializeStudioBg3dSixPassBundleManifest(manifest)) fail("manifest의 OPFS 영수증이 다릅니다.");
      owners.get(`studio-bg3d-sixpass:${manifest.pageId}:${manifest.bundleId}:${manifest.renderRevisionId}`)?.add(hash);
    }
  }
  const ownerIds = [...owners.keys()].sort();
  const lock = async (index: number, task: () => Promise<T>): Promise<T> => index === ownerIds.length
    ? await task() : await input.runOwnerExclusive(ownerIds[index], () => lock(index + 1, task));
  return await lock(0, async () => {
    const previous = new Map<string, readonly string[]>(); const attempted: string[] = [];
    try {
      for (const owner of ownerIds) {
        previous.set(owner, await input.authority.ownerRefs(owner)); attempted.push(owner);
        await input.authority.setOwnerRefs(owner, [...new Set([...(previous.get(owner) ?? []), ...(owners.get(owner) ?? [])])].sort());
      }
      const result = await input.apply(input.archive.project);
      if (result === false) fail("문서 적용이 거부되었습니다.");
      return result;
    } catch (cause) {
      const failures: unknown[] = [];
      for (const owner of attempted.toReversed()) {
        try { await input.authority.setOwnerRefs(owner, previous.get(owner) ?? []); } catch (failure) { failures.push(failure); }
      }
      if (failures.length) throw new AggregateError([cause, ...failures], "6패스 아카이브 owner 참조 보상에 실패했습니다.", { cause });
      throw cause;
    }
  });
}


/** 자동저장 복구는 ZIP을 만들지 않고 한 본문씩 기존 native 권위에서 재검증한다. */
export async function verifyStudioBg3dSixPassProjectNativeBodies(project: StudioProjectFile,
  authority: StudioOpfsAssetStore): Promise<void> {
  if (authority.kind !== "opfs") fail("복구에 durable OPFS 본문 저장소가 필요합니다.");
  await verifyStudioBg3dSixPassProjectArchiveBodies(project, async (hash) => await authority.get(hash, { verify: true }));
  for (const { state } of await collectStudioBg3dSixPassProjectBundles(project)) {
    for (const bundle of state.bundles) for (const manifest of bundle.revisions) {
      const bytes = await authority.get(hashStudioBg3dSixPassBundleManifest(manifest), { verify: true });
      if (!bytes || new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== serializeStudioBg3dSixPassBundleManifest(manifest)) {
        fail("복구할 manifest의 native CAS 영수증을 확인하지 못했습니다.");
      }
    }
  }
}
