import { activeStudioCrdtDeletionTargets } from "./studio-crdt-deletion-roots";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";
import { isStudioBg3dSixPassContentHash, isStudioBg3dSixPassImageBlendMode, isStudioBg3dSixPassRole,
  parseStudioBg3dSixPassArtifactSourceUri, parseStudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS, StudioWorkAssetElementSchema } from "@toonstudio/contracts/studio-work-asset-contract";
import * as Y from "yjs";
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
function invalidShape(message: string): never { throw new Error(message); }
function map(doc: Y.Doc, name: string): Y.Map<unknown> | undefined {
  if (!doc.share.has(name)) return undefined;
  return doc.getMap<unknown>(name);
}
export function parseStudioCrdtBg3dRevision(raw: unknown, failure: (message: string) => never = invalidShape): StudioCrdtBg3dRevisionReference {
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
export function snapshotStudioCrdtBg3dShape(doc: Y.Doc, failure: (message: string) => never = invalidShape): StudioCrdtBg3dBundleSnapshot {
  const revisions = new Map<string, { raw: string; ref: StudioCrdtBg3dRevisionReference }>();
  for (const [key, raw] of map(doc, STUDIO_BG3D_BUNDLE_REVISIONS_ROOT) ?? []) {
    const ref = parseStudioCrdtBg3dRevision(raw, failure);
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
    const state = snapshotStudioCrdtBg3dShape(doc);
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
export { object as isStudioCrdtBg3dRecord, sourceHash as studioCrdtBg3dSourceHash, map as readStudioCrdtBg3dMap };
