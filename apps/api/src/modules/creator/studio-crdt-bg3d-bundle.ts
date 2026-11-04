import { readStudioCrdtBg3dCandidateLocations } from "./studio-crdt-bg3d-candidate-locations";
import { activeStudioCrdtDeletionTargets } from "./studio-crdt-deletion-roots";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";
import { ConflictException } from "@nestjs/common";
import { parseStudioBg3dSixPassBundleState, hashStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, isStudioBg3dSixPassContentHash,
  isStudioBg3dSixPassImageBlendMode, isStudioBg3dSixPassRole, parseStudioBg3dSixPassArtifactSourceUri,
  parseStudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS, StudioWorkAssetElementSchema } from "@toonstudio/contracts/studio-work-asset-contract";
import * as Y from "yjs";
import { assertStudioBg3dBundleReaderInTransaction, readStudioBg3dBundleRecordInTransaction,
  verifyStudioBg3dSealedReferencesInTransaction } from "./studio-bg3d-bundle.repository";
import type { StudioBg3dBundleRecord, StudioBg3dBundleTransaction } from "./studio-bg3d-bundle.repository";
import type { StudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

export const STUDIO_BG3D_BUNDLE_REVISIONS_ROOT = "studio-bg3d-bundle-revisions-v1";
export const STUDIO_BG3D_BUNDLE_ACTIVE_ROOT = "studio-bg3d-bundle-active-v1";
export const STUDIO_BG3D_IMAGE_PROPERTIES = ["src", "bg3dLtBundleReference", "bg3dLtBundleId", "bg3dLtRole", "bg3dLtRenderMode", "blendMode"] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const CAS = /^studio-opfs-cas:(sha256:[a-f0-9]{64})$/u;
const encoder = new TextEncoder();
export interface StudioCrdtBg3dRevisionReference {
  readonly version: 1; readonly pageId: string; readonly bundleId: string; readonly renderRevisionId: string;
  readonly parentRevisionId: string | null; readonly manifestHash: `sha256:${string}`;
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function failure(message: string): never { throw new ConflictException({ code: "studio_bg3d_bundle_reference_invalid", message }); }
function map(doc: Y.Doc, name: string): Y.Map<unknown> | undefined {
  if (!doc.share.has(name)) return undefined;
  return doc.getMap<unknown>(name);
}
function parseRevision(raw: unknown): StudioCrdtBg3dRevisionReference {
  if (typeof raw !== "string" || encoder.encode(raw).byteLength > 1024) failure("6패스 CRDT 참조 예산이 올바르지 않습니다.");
  const value: unknown = JSON.parse(raw);
  if (!object(value) || Object.keys(value).sort().join(",") !== "bundleId,manifestHash,pageId,parentRevisionId,renderRevisionId,version"
    || value.version !== 1 || !isStudioBg3dSixPassContentHash(value.manifestHash)
    || typeof value.pageId !== "string" || !ID.test(value.pageId) || typeof value.bundleId !== "string" || !ID.test(value.bundleId)
    || typeof value.renderRevisionId !== "string" || !ID.test(value.renderRevisionId)
    || (value.parentRevisionId !== null && (typeof value.parentRevisionId !== "string" || !ID.test(value.parentRevisionId)))) failure("6패스 CRDT revision 참조가 손상되었습니다.");
  return { version: 1, pageId: value.pageId, bundleId: value.bundleId, renderRevisionId: value.renderRevisionId,
    parentRevisionId: value.parentRevisionId, manifestHash: value.manifestHash };
}
function props(record: Y.Map<unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {}, current: Record<string, unknown> = {};
  for (const [key, value] of record) {
    if (key.startsWith("base:")) base[key.slice(5)] = value;
    if (key.startsWith("prop:")) current[key.slice(5)] = value;
  }
  const result = { ...base, ...current };
  for (const [key, value] of record) if (key.startsWith("unset:") && value === true) delete result[key.slice(6)];
  return result;
}
function sourceHash(value: unknown): `sha256:${string}` | null {
  const artifact = parseStudioBg3dSixPassArtifactSourceUri(value);
  if (artifact) return artifact;
  if (typeof value !== "string") return null;
  const match = CAS.exec(value);
  return match && isStudioBg3dSixPassContentHash(match[1]) ? match[1] : null;
}
/** undefined는 기존 reference 검증으로 위임한다. 새 namespace는 marker와 함께만 허용한다. */
export function hasValidStudioBg3dImageReferenceProps(id: string, value: Record<string, unknown>): boolean | undefined {
  if (!["bg3dLtBundleReference", "bg3dLtBundleId", "bg3dLtRole", "bg3dLtRenderMode"].some((key) => Object.hasOwn(value, key))
    && !(typeof value.src === "string" && value.src.startsWith("bg3d-lt-artifact:"))) return undefined;
  const ref = parseStudioBg3dSixPassBundleImageReference(value.bg3dLtBundleReference);
  if (!ref || ref.elementId !== id || value.elementType !== "image" || value.bg3dLtBundleId !== ref.bundleId
    || value.bg3dLtRole !== ref.role || value.bg3dLtRenderMode !== "separated" || !sourceHash(value.src)
    || (ref.role !== "main-line" && parseStudioBg3dSixPassArtifactSourceUri(value.src) === null)
    || !isStudioBg3dSixPassImageBlendMode(value.blendMode)) return false;
  const edit: Record<string, unknown> = { id, type: "image" };
  for (const [key, entry] of Object.entries(value)) {
    if (key === "elementType" || (STUDIO_BG3D_IMAGE_PROPERTIES as readonly string[]).includes(key)) continue;
    if (!(STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS as readonly string[]).includes(key)) return false;
    edit[key] = entry;
  }
  return StudioWorkAssetElementSchema.safeParse(edit).success;
}
export function isValidStudioBg3dImageReferenceCandidate(property: string, value: unknown): boolean | undefined {
  if (property === "bg3dLtBundleReference") return parseStudioBg3dSixPassBundleImageReference(value) !== null;
  if (property === "bg3dLtBundleId") return typeof value === "string" && ID.test(value);
  if (property === "bg3dLtRole") return isStudioBg3dSixPassRole(value);
  if (property === "bg3dLtRenderMode") return value === "separated";
  if (property === "blendMode") return isStudioBg3dSixPassImageBlendMode(value);
  if (property === "src") return sourceHash(value) !== null;
  return undefined;
}
export interface StudioCrdtBg3dBundleSnapshot {
  readonly revisions: ReadonlyMap<string, { readonly raw: string; readonly ref: StudioCrdtBg3dRevisionReference }>;
  readonly heads: ReadonlyMap<string, unknown>;
  readonly images: ReadonlyMap<string, { readonly pageId: string; readonly layerId: string; readonly deleted: boolean; readonly props: Record<string, unknown>; readonly ref: StudioBg3dSixPassBundleImageReference }>;
  readonly candidateRefs: readonly StudioBg3dSixPassBundleImageReference[];
}
export function snapshotStudioCrdtBg3dBundles(doc: Y.Doc): StudioCrdtBg3dBundleSnapshot {
  const revisions = new Map<string, { raw: string; ref: StudioCrdtBg3dRevisionReference }>();
  for (const [key, raw] of map(doc, STUDIO_BG3D_BUNDLE_REVISIONS_ROOT) ?? []) {
    const ref = parseRevision(raw);
    if (key !== JSON.stringify([ref.pageId, ref.bundleId, ref.renderRevisionId]) || typeof raw !== "string") failure("6패스 revision 색인이 다릅니다.");
    revisions.set(key, { raw, ref });
  }
  const heads = new Map(map(doc, STUDIO_BG3D_BUNDLE_ACTIVE_ROOT) ?? []);
  const images = new Map<string, { pageId: string; layerId: string; deleted: boolean; props: Record<string, unknown>; ref: StudioBg3dSixPassBundleImageReference }>();
  const candidateRefs: StudioBg3dSixPassBundleImageReference[] = [];
  const deletedTargets = activeStudioCrdtDeletionTargets(doc);
  if (!deletedTargets) failure("6패스 삭제·복원 연산이 손상되었습니다.");
  for (const [name] of doc.share) {
    if (!name.startsWith("scene-element:")) continue;
    const record = map(doc, name);
    if (!record || record.get("type") !== "reference") continue;
    const value = props(record), ref = parseStudioBg3dSixPassBundleImageReference(value.bg3dLtBundleReference);
    if (!ref) continue;
    const id = record.get("id"), pageId = record.get("pageId"), layerId = record.get("layerId");
    if (!isBoundedStudioCrdtId(id) || !isBoundedStudioCrdtId(pageId) || !isBoundedStudioCrdtId(layerId) || !hasValidStudioBg3dImageReferenceProps(id, value)) failure("6패스 이미지 결박이 다릅니다.");
    images.set(id, { pageId, layerId, deleted: record.get("deleted") === true || deletedTargets.has(JSON.stringify(["scene", id])), props: value, ref });
    for (const prefix of ["base:", "prop:"]) {
      const candidate = record.get(`${prefix}bg3dLtBundleReference`);
      if (candidate === undefined) continue;
      const parsed = parseStudioBg3dSixPassBundleImageReference(candidate);
      if (!parsed || parsed.elementId !== id) failure("6패스 원본 reference가 손상되었습니다.");
      candidateRefs.push(parsed);
    }
  }
  return { revisions, heads, images, candidateRefs };
}
export function hasValidStudioCrdtBg3dBundleRoots(doc: Y.Doc): boolean {
  try {
    for (const name of doc.share.keys()) if (name.startsWith("studio-bg3d-bundle-")
      && name !== STUDIO_BG3D_BUNDLE_REVISIONS_ROOT && name !== STUDIO_BG3D_BUNDLE_ACTIVE_ROOT) return false;
    const state = snapshotStudioCrdtBg3dBundles(doc);
    for (const { ref } of state.revisions.values()) {
      if (ref.parentRevisionId !== null && !state.revisions.has(JSON.stringify([ref.pageId, ref.bundleId, ref.parentRevisionId]))) return false;
      const seen = new Set<string>(); let revision: StudioCrdtBg3dRevisionReference | undefined = ref;
      while (revision) {
        if (seen.has(revision.renderRevisionId)) return false;
        seen.add(revision.renderRevisionId);
        revision = revision.parentRevisionId === null ? undefined : state.revisions.get(JSON.stringify([ref.pageId, ref.bundleId, revision.parentRevisionId]))?.ref;
      }
    }
    for (const [key, value] of state.heads) {
      const ids: unknown = JSON.parse(key);
      if (!Array.isArray(ids) || ids.length !== 2 || !ids.every((id) => typeof id === "string" && ID.test(id))
        || key !== JSON.stringify(ids) || typeof value !== "string"
        || (value !== "" && !state.revisions.has(JSON.stringify([...ids, value])))) return false;
    }
    for (const image of state.images.values()) {
      if (!state.revisions.has(JSON.stringify([image.pageId, image.ref.bundleId, image.ref.renderRevisionId]))) return false;
      if (!image.deleted && state.heads.get(JSON.stringify([image.pageId, image.ref.bundleId])) !== image.ref.renderRevisionId) return false;
    }
    return true;
  } catch { return false; }
}
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
