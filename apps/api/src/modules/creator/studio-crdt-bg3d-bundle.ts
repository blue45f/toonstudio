import { readStudioCrdtBg3dCandidateLocations } from "./studio-crdt-bg3d-candidate-locations";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";
import { ConflictException } from "@nestjs/common";
import { parseStudioBg3dSixPassBundleState, hashStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY,
  isStudioBg3dSixPassImageBlendMode, parseStudioBg3dSixPassArtifactSourceUri,
  parseStudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import * as Y from "yjs";
import { assertStudioBg3dBundleReaderInTransaction, readStudioBg3dBundleRecordInTransaction,
  verifyStudioBg3dSealedReferencesInTransaction } from "./studio-bg3d-bundle.repository";
import type { StudioBg3dBundleRecord, StudioBg3dBundleTransaction } from "./studio-bg3d-bundle.repository";
import type { StudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

import { STUDIO_BG3D_BUNDLE_REVISIONS_ROOT, parseStudioCrdtBg3dRevision, snapshotStudioCrdtBg3dShape,
  isStudioCrdtBg3dRecord as object, studioCrdtBg3dSourceHash as sourceHash, readStudioCrdtBg3dMap as map } from "./studio-crdt-bg3d-shape";
import type { StudioCrdtBg3dBundleSnapshot, StudioCrdtBg3dRevisionReference } from "./studio-crdt-bg3d-shape";

export { STUDIO_BG3D_BUNDLE_REVISIONS_ROOT, STUDIO_BG3D_BUNDLE_ACTIVE_ROOT, STUDIO_BG3D_IMAGE_PROPERTIES,
  hasValidStudioBg3dImageReferenceProps, isValidStudioBg3dImageReferenceCandidate, hasValidStudioCrdtBg3dBundleRoots } from "./studio-crdt-bg3d-shape";
export type { StudioCrdtBg3dBundleSnapshot, StudioCrdtBg3dRevisionReference } from "./studio-crdt-bg3d-shape";
function failure(message: string): never { throw new ConflictException({ code: "studio_bg3d_bundle_reference_invalid", message }); }
function parseRevision(raw: unknown): StudioCrdtBg3dRevisionReference { return parseStudioCrdtBg3dRevision(raw, failure); }
export function snapshotStudioCrdtBg3dBundles(doc: Y.Doc): StudioCrdtBg3dBundleSnapshot { return snapshotStudioCrdtBg3dShape(doc, failure); }
async function verifiedRecord(transaction: StudioBg3dBundleTransaction, workId: string, ref: StudioCrdtBg3dRevisionReference): Promise<StudioBg3dBundleRecord> {
  const record = await readStudioBg3dBundleRecordInTransaction(transaction, { workId, bundleId: ref.bundleId, renderRevisionId: ref.renderRevisionId });
  if (record.state !== "sealed" || record.artifacts.length !== 7 || record.manifestHash !== ref.manifestHash
    || record.manifest.pageId !== ref.pageId || record.manifest.parentRevisionId !== ref.parentRevisionId) failure("이 작품의 봉인된 6패스 revision과 다릅니다.");
  return record;
}
export async function assertStudioCrdtBg3dBundleAdmission(transaction: StudioBg3dBundleTransaction, workId: string,
  before: Y.Doc, after: Y.Doc, features: readonly string[], candidate?: Y.Doc, update?: Uint8Array): Promise<void> {
  await assertStudioBg3dBundleReaderInTransaction(transaction, workId, features);
  const previous = snapshotStudioCrdtBg3dBundles(before), next = snapshotStudioCrdtBg3dBundles(after);
  if (next.revisions.size && !features.includes(STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY)) failure("6패스 reader capability가 필요합니다.");
  for (const [id, old] of previous.images) {
    const image = next.images.get(id);
    if (!image || image.pageId !== old.pageId || image.layerId !== old.layerId || image.ref.bundleId !== old.ref.bundleId || image.ref.role !== old.ref.role)
      failure("보존된 6패스 레이어의 역할·요소 식별자를 바꾸거나 제거할 수 없습니다.");
  }
  const records = new Map<string, StudioBg3dBundleRecord>();
  for (const [key, old] of previous.revisions) if (next.revisions.get(key)?.raw !== old.raw) failure("보존된 6패스 revision을 제거하거나 바꿀 수 없습니다.");
  for (const [key, value] of next.revisions) if (!previous.revisions.has(key)) records.set(key, await verifiedRecord(transaction, workId, value.ref));
  // LWW에서 지는 후보도 immutable ID를 다른 manifest에 재사용할 수 없다.
  for (const [key, raw] of candidate ? map(candidate, STUDIO_BG3D_BUNDLE_REVISIONS_ROOT) ?? [] : []) {
    const ref = parseRevision(raw);
    if (key !== JSON.stringify([ref.pageId, ref.bundleId, ref.renderRevisionId]) || (previous.revisions.has(key) && previous.revisions.get(key)?.raw !== raw))
      failure("6패스 원본의 불변 revision 식별자를 다른 내용에 재사용할 수 없습니다.");
    if (next.revisions.get(key)?.raw !== raw) await verifiedRecord(transaction, workId, ref);
  }
  for (const [id, image] of next.images) {
    const old = previous.images.get(id);
    if (old && JSON.stringify(old.ref) === JSON.stringify(image.ref) && old.props.src === image.props.src && old.layerId === image.layerId) continue;
    const key = JSON.stringify([image.pageId, image.ref.bundleId, image.ref.renderRevisionId]);
    const registry = next.revisions.get(key);
    if (!registry) failure("6패스 봉인 revision 색인이 없습니다.");
    const record = records.get(key) ?? await verifiedRecord(transaction, workId, registry.ref); records.set(key, record);
    const layer = record.manifest.layers.find(({ role }) => role === image.ref.role);
    if (!layer || image.layerId !== record.manifest.groupId || layer.elementId !== id || layer.artifact.contentHash !== sourceHash(image.props.src)) failure("6패스 이미지 본문·역할이 봉인 원본과 다릅니다.");
  }
  for (const [key, head] of next.heads) {
    if (head === "" || previous.heads.get(key) === head) continue;
    const ids = JSON.parse(key) as [string, string];
    const revisionKey = JSON.stringify([...ids, head]);
    const revision = next.revisions.get(revisionKey);
    if (!revision) failure("6패스 활성 revision이 없습니다.");
    const record = records.get(revisionKey) ?? await verifiedRecord(transaction, workId, revision.ref);
    const newlyRegistered = !previous.revisions.has(revisionKey);
    for (const layer of record.manifest.layers) {
      const image = next.images.get(layer.elementId);
      if (!newlyRegistered && image?.deleted) continue;
      if (!image || (newlyRegistered && image.deleted) || image.pageId !== record.manifest.pageId || image.layerId !== record.manifest.groupId
        || image.ref.bundleId !== record.manifest.bundleId || image.ref.renderRevisionId !== head || image.ref.role !== layer.role
        || image.ref.manifestHash !== record.manifestHash) failure("새 6패스는 여섯 활성 레이어를 함께 게시하고 보존 이력은 살아 있는 레이어의 결박을 유지해야 합니다.");
    }
  }
  if (update && (previous.images.size || next.images.size)) for (const location of readStudioCrdtBg3dCandidateLocations(before, update)) {
    const image = next.images.get(location.elementId) ?? previous.images.get(location.elementId);
    if (!image) continue;
    if (!isBoundedStudioCrdtId(location.value) || location.value !== (location.property === "layerId" ? image.layerId : image.pageId))
      failure("6패스 레이어의 패배 후보도 봉인된 페이지·그룹을 벗어날 수 없습니다.");
  }
  const oldCandidates = new Set(previous.candidateRefs.map((ref) => JSON.stringify(ref)));
  await verifyStudioBg3dSealedReferencesInTransaction(transaction, workId,
    next.candidateRefs.filter((ref) => !oldCandidates.has(JSON.stringify(ref))));
}
function retainedJsonManifests(document: unknown): Map<string, string> {
  const result = new Map<string, string>(), pending: unknown[] = [document], visited = new WeakSet<object>();
  while (pending.length) {
    const value = pending.pop();
    if (value !== null && typeof value === "object") { if (visited.has(value)) failure("문서가 순환합니다."); visited.add(value); }
    if (Array.isArray(value)) { for (const child of value) pending.push(child); continue; }
    if (!object(value)) continue;
    if (Object.hasOwn(value, "bg3dLtBundles")) for (const bundle of parseStudioBg3dSixPassBundleState(value.bg3dLtBundles).bundles)
      for (const manifest of bundle.revisions) result.set(JSON.stringify([manifest.pageId, manifest.bundleId, manifest.renderRevisionId]), hashStudioBg3dSixPassBundleManifest(manifest));
    for (const [key, child] of Object.entries(value)) if (key !== "bg3dLtBundles") pending.push(child);
  }
  return result;
}
function canonicalDocumentPages(document: unknown): { pages: WeakMap<object, string>; elements: WeakMap<object, string>; duplicated: ReadonlySet<string> } {
  const pages = new WeakMap<object, string>(), elements = new WeakMap<object, string>(), seen = new Set<string>(), duplicated = new Set<string>();
  if (object(document) && Array.isArray(document.pagesList)) for (const page of document.pagesList) {
    if (!object(page) || !isBoundedStudioCrdtId(page.id) || !Array.isArray(page.elements)) continue;
    if (seen.has(page.id)) duplicated.add(page.id); seen.add(page.id); pages.set(page, page.id);
    for (const element of page.elements) if (object(element)) elements.set(element, page.id);
  }
  return { pages, elements, duplicated };
}
/** REST 문서도 기존 work mutation lock 안에서 같은 봉인 권위를 검증한다. */
export async function assertStudioBg3dBundleJsonDocumentInTransaction(transaction: StudioBg3dBundleTransaction,
  workId: string, document: unknown, features: readonly string[], previousDocument?: unknown): Promise<void> {
  await assertStudioBg3dBundleReaderInTransaction(transaction, workId, features);
  const visited = new WeakSet<object>();
  const pending: unknown[] = [document], images: { value: Record<string, unknown>; pageId: string }[] = [], refs: StudioBg3dSixPassBundleImageReference[] = [];
  const canonical = canonicalDocumentPages(document), seenImages = new Set<string>();
  const manifests = new Map<string, StudioBg3dBundleRecord>();
  while (pending.length) {
    const value = pending.pop();
    if (value !== null && typeof value === "object") { if (visited.has(value)) failure("문서가 순환합니다."); visited.add(value); }
    if (Array.isArray(value)) { for (const child of value) pending.push(child); continue; }
    if (!object(value)) continue;
    if (Object.hasOwn(value, "bg3dLtBundles")) {
      if (!features.includes(STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY)) failure("6패스 문서 reader capability가 필요합니다.");
      const pageId = canonical.pages.get(value);
      if (!pageId || canonical.duplicated.has(pageId)) failure("서버의 6패스 원본은 중복되지 않은 pagesList 원고 페이지에 보관해야 합니다.");
      const state = parseStudioBg3dSixPassBundleState(value.bg3dLtBundles);
      for (const bundle of state.bundles) for (const manifest of bundle.revisions) {
        if (manifest.pageId !== pageId) failure("6패스 manifest가 실제 원고 페이지와 다릅니다.");
        const ref = { version: 1 as const, pageId: manifest.pageId, bundleId: manifest.bundleId,
          renderRevisionId: manifest.renderRevisionId, parentRevisionId: manifest.parentRevisionId,
          manifestHash: hashStudioBg3dSixPassBundleManifest(manifest) };
        manifests.set(JSON.stringify([ref.pageId, ref.bundleId, ref.renderRevisionId]), await verifiedRecord(transaction, workId, ref));
      }
    }
    if (value.type === "image" && value.bg3dLtBundleReference !== undefined) {
      const ref = parseStudioBg3dSixPassBundleImageReference(value.bg3dLtBundleReference);
      if (!ref || ref.elementId !== value.id || value.bg3dLtBundleId !== ref.bundleId || value.bg3dLtRole !== ref.role
        || value.bg3dLtRenderMode !== "separated" || !sourceHash(value.src)
        || (ref.role !== "main-line" && parseStudioBg3dSixPassArtifactSourceUri(value.src) === null)
        || !isStudioBg3dSixPassImageBlendMode(value.blendMode)) failure("REST 6패스 이미지 reference가 손상되었습니다.");
      const pageId = canonical.elements.get(value);
      if (!pageId || canonical.duplicated.has(pageId) || seenImages.has(ref.elementId)) failure("6패스 이미지는 중복되지 않은 pagesList 페이지의 요소로만 저장할 수 있습니다.");
      seenImages.add(ref.elementId); refs.push(ref); images.push({ value, pageId });
    } else if (typeof value.src === "string" && value.src.startsWith("bg3d-lt-artifact:")) failure("6패스 artifact에는 봉인 reference가 필요합니다.");
    for (const [key, child] of Object.entries(value)) if (key !== "bg3dLtBundles") pending.push(child);
  }
  for (const [key, hash] of retainedJsonManifests(previousDocument)) if (manifests.get(key)?.manifestHash !== hash) failure("보존된 6패스 revision을 제거하거나 바꿀 수 없습니다.");
  await verifyStudioBg3dSealedReferencesInTransaction(transaction, workId, refs);
  for (const { value: image, pageId } of images) {
    const ref = parseStudioBg3dSixPassBundleImageReference(image.bg3dLtBundleReference);
    if (!ref) failure("6패스 reference가 없습니다.");
    const record = manifests.get(JSON.stringify([pageId, ref.bundleId, ref.renderRevisionId]));
    const layer = record?.manifest.layers.find(({ role }) => role === ref.role);
    if (!layer || image.groupId !== record?.manifest.groupId || layer.elementId !== image.id || record?.manifestHash !== ref.manifestHash
      || layer.artifact.contentHash !== sourceHash(image.src)) failure("REST 6패스 본문이 보존된 manifest와 다릅니다.");
  }
}
