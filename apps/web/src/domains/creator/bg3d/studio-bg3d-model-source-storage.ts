import { studioBg3dBundleAssetRights } from "./studio-bg3d-bundle-asset-loader";
import { getStudioBg3dEnvironmentAsset } from "./studio-bg3d-environment-catalog";
import { getLoadedStudioBg3dBundleThemePacks, loadStudioBg3dBundleThemePacks } from "./studio-bg3d-bundle-theme-packs";
import { fingerprintStudioBg3dModelSourceRestriction, inheritStudioBg3dModelSourceRestriction,
  isSafeStudioBg3dModelSourceRestrictionRecordId, parseStudioBg3dModelSourceRestriction,
  readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";
import type { Bg3dVerifiedStoredRecord, parseV12ModelManifest } from "./bg3d-model-library";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dLibrariesAuthority, StudioBg3dLibraryBlobReceipt, StudioBg3dLibraryMutationContext } from "./studio-bg3d-libraries-sqlite-opfs-authority";

type Hash = `sha256:${string}`;
type Manifest = ReturnType<typeof parseV12ModelManifest>;
type Stored = Manifest["records"][number];
export type Bg3dModelImportIngress =
  | { readonly kind: "user-file" | "studio-generated"; readonly modelFileExport: "allowed" | "unknown" }
  | { readonly kind: "bundle-runtime"; readonly sourceRecordId: string; readonly sourceContentHash: Hash }
  | { readonly kind: "archive"; readonly sourceRestriction?: StudioBg3dModelSourceRestrictionV1 };
/** 허가 DTO가 아니라 실제 원본을 재조회할 expected identity다. */
export interface Bg3dModelImportSourceReceipt {
  readonly sourceRecordId: string;
  readonly sourceContentHash: Hash;
  readonly sourceRestrictionFingerprint: string;
}
export interface StudioBg3dModelSourceSnapshot {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly sourceKind: "local-library" | "bundle-pack" | "bundled-environment";
  readonly manifestRevision: number | null;
  readonly catalogIdentity: string | null;
}
export interface StudioBg3dModelSourceStoragePorts {
  readonly authority: StudioBg3dLibrariesAuthority;
  readonly parseManifest: (raw: string | null) => Manifest;
  readonly loadBundled: (id: string, signal?: AbortSignal) => Promise<Bg3dVerifiedStoredRecord | null>;
}
type SourceErrorCode = "invalid-file" | "rights-conflict" | "source-changed" | "source-unavailable" | "source-restriction-conflict";
export class StudioBg3dModelSourceStorageError extends Error {
  constructor(readonly code: SourceErrorCode) {
    super({ "invalid-file": "모델 출처 입력을 검증하지 못했습니다.", "rights-conflict": "파생 모델과 실제 원본의 권리가 다릅니다.",
      "source-changed": "모델 원본 또는 출처 제한이 바뀌어 저장하지 않았습니다.",
      "source-unavailable": "현재 모델 원본의 저장·출처 권위를 확인하지 못했습니다.",
      "source-restriction-conflict": "같은 바이트에 서로 다른 출처 제한이 있어 기존 기록을 변경하지 않았습니다." }[code]);
    this.name = "StudioBg3dModelSourceStorageError";
  }
}
function fail(code: SourceErrorCode): never { throw new StudioBg3dModelSourceStorageError(code); }
function hash(value: unknown): value is Hash { return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value); }
function active(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException("모델 저장을 취소했습니다.", "AbortError");
}
function fields(input: unknown): ReadonlyMap<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail("invalid-file");
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return fail("invalid-file");
  const result = new Map<string, unknown>();
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable) return fail("invalid-file");
    result.set(key, descriptor.value);
  }
  return result;
}
function exact(value: ReadonlyMap<string, unknown>, keys: readonly string[]): void {
  if (value.size !== keys.length || keys.some((key) => !value.has(key))) fail("invalid-file");
}
export interface StudioBg3dModelSourceImportRequest {
  readonly ingress?: Bg3dModelImportIngress;
  readonly sourceReceipt?: Bg3dModelImportSourceReceipt;
}
/** await 전에 metadata를 복사한다. 내부 application marker를 JS 보안 경계로 주장하지 않는다. */
export function snapshotStudioBg3dModelSourceImport(input: StudioBg3dModelSourceImportRequest): StudioBg3dModelSourceImportRequest {
  const own = fields(input);
  if (own.has("ingress") && own.has("sourceReceipt")) return fail("invalid-file");
  if (own.has("sourceReceipt")) {
    const value = fields(own.get("sourceReceipt")); exact(value, ["sourceRecordId", "sourceContentHash", "sourceRestrictionFingerprint"]);
    const sourceRecordId = value.get("sourceRecordId"), sourceContentHash = value.get("sourceContentHash"), sourceRestrictionFingerprint = value.get("sourceRestrictionFingerprint");
    if (!isSafeStudioBg3dModelSourceRestrictionRecordId(sourceRecordId) || !hash(sourceContentHash)
      || typeof sourceRestrictionFingerprint !== "string" || sourceRestrictionFingerprint.length > 4096) return fail("invalid-file");
    return { sourceReceipt: Object.freeze({ sourceRecordId, sourceContentHash, sourceRestrictionFingerprint }) };
  }
  if (!own.has("ingress")) return {};
  const value = fields(own.get("ingress")), kind = value.get("kind");
  if (kind === "user-file" || kind === "studio-generated") {
    exact(value, ["kind", "modelFileExport"]); const modelFileExport = value.get("modelFileExport");
    if (modelFileExport !== "allowed" && modelFileExport !== "unknown") return fail("invalid-file");
    return { ingress: Object.freeze({ kind, modelFileExport }) };
  }
  if (kind === "bundle-runtime") {
    exact(value, ["kind", "sourceRecordId", "sourceContentHash"]);
    const sourceRecordId = value.get("sourceRecordId"), sourceContentHash = value.get("sourceContentHash");
    if (!isSafeStudioBg3dModelSourceRestrictionRecordId(sourceRecordId) || !hash(sourceContentHash)) return fail("invalid-file");
    return { ingress: Object.freeze({ kind, sourceRecordId, sourceContentHash }) };
  }
  if (kind === "archive") {
    exact(value, value.has("sourceRestriction") ? ["kind", "sourceRestriction"] : ["kind"]);
    if (!value.has("sourceRestriction")) return { ingress: Object.freeze({ kind }) };
    const sourceRestriction = parseStudioBg3dModelSourceRestriction(value.get("sourceRestriction"));
    if (!sourceRestriction) return fail("invalid-file");
    return { ingress: Object.freeze({ kind, sourceRestriction }) };
  }
  return fail("invalid-file");
}
export function sameStudioBg3dModelRights(left: StudioBg3dAttachmentRights, right: StudioBg3dAttachmentRights): boolean {
  return left.status === right.status && left.commercialUse === right.commercialUse && left.attributionRequired === right.attributionRequired
    && left.attribution === right.attribution && left.licenseName === right.licenseName;
}
function identity(record: Pick<Bg3dVerifiedStoredRecord, "id" | "contentHash" | "byteSize" | "mime" | "rights" | "sourceRestriction">): string {
  return JSON.stringify([record.id, record.contentHash, record.byteSize, record.mime, record.rights.status, record.rights.commercialUse,
    record.rights.attributionRequired, record.rights.attribution ?? null, record.rights.licenseName ?? null,
    fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(record))]);
}
async function verifiedBytes(bytes: Uint8Array, expected: { readonly contentHash: Hash; readonly byteSize: number }, signal?: AbortSignal): Promise<void> {
  active(signal);
  if (bytes.byteLength !== expected.byteSize) return fail("source-changed");
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)); active(signal);
  if (`sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}` !== expected.contentHash) fail("source-changed");
}
function bundleRestriction(id: string, sha256: Hash): StudioBg3dModelSourceRestrictionV1 {
  return Object.freeze({ version: 1, modelFileExport: "service-only", origin: Object.freeze({ kind: "bundle-pack", recordId: id, sha256 }), parent: null });
}
async function strictBundle(id: string, signal?: AbortSignal) {
  active(signal);
  const data = await loadStudioBg3dBundleThemePacks({ signal }); active(signal);
  const asset = data.assets.find((value) => value.id === id);
  if (!asset) return null;
  const rights = studioBg3dBundleAssetRights(asset, data), pack = data.packs[asset.packIndex];
  return { asset, rights, catalogIdentity: JSON.stringify([data.sourceManifestGeneratedAt, asset.id, asset.sha256, asset.bytes,
    asset.path, pack?.catalogIds, pack?.ingestPackIds, rights, data.inServiceOnly, data.downloadable]) };
}
function currentCatalog(id: string): string | null {
  const data = getLoadedStudioBg3dBundleThemePacks(), asset = data?.assets.find((value) => value.id === id);
  if (!data || !asset) return null;
  const pack = data.packs[asset.packIndex];
  return JSON.stringify([data.sourceManifestGeneratedAt, asset.id, asset.sha256, asset.bytes, asset.path,
    pack?.catalogIds, pack?.ingestPackIds, studioBg3dBundleAssetRights(asset, data), data.inServiceOnly, data.downloadable]);
}
export async function readStudioBg3dModelSourceSnapshot(
  id: string, ports: StudioBg3dModelSourceStoragePorts, signal?: AbortSignal,
): Promise<StudioBg3dModelSourceSnapshot | null> {
  if (!isSafeStudioBg3dModelSourceRestrictionRecordId(id)) return fail("invalid-file");
  active(signal);
  const builtin = getStudioBg3dEnvironmentAsset(id);
  let bundle: Awaited<ReturnType<typeof strictBundle>> = null;
  let catalogFailed = false;
  if (!builtin) {
    try { bundle = await strictBundle(id, signal); }
    catch { active(signal); catalogFailed = true; }
  }
  // 기존 getStored처럼 정확한 배포 자산 ID가 우선이다. 배포 조회에 local DB를 강제하지 않는다.
  if (!builtin && !bundle) {
    if (!ports.authority.withReadSnapshot) return fail("source-unavailable");
    const local = await ports.authority.withReadSnapshot("models", async (context) => {
      const manifest = ports.parseManifest(context.currentRaw), stored = manifest.records.find((value) => value.id === id);
      if (!stored) return null;
      const bytes = await context.getBlob(stored.blobRef); await verifiedBytes(bytes, stored, signal);
      const record: Bg3dVerifiedStoredRecord = Object.freeze({ ...stored,
        blob: new Blob([Uint8Array.from(bytes).buffer], { type: stored.mime }), thumbnail: null });
      return { record, sourceKind: "local-library", manifestRevision: manifest.revision, catalogIdentity: null } satisfies StudioBg3dModelSourceSnapshot;
    }, signal);
    active(signal);
    if (local) return local;
    return catalogFailed ? fail("source-unavailable") : null;
  }
  const loaded = await ports.loadBundled(id, signal); active(signal);
  const expected = builtin ? { contentHash: builtin.sha256, byteSize: builtin.byteSize }
    : bundle ? { contentHash: bundle.asset.sha256, byteSize: bundle.asset.bytes } : null;
  if (!loaded || !expected || loaded.id !== id || loaded.contentHash !== expected.contentHash || loaded.byteSize !== expected.byteSize) return fail("source-changed");
  await verifiedBytes(new Uint8Array(await loaded.blob.arrayBuffer()), expected, signal);
  if (bundle && (!sameStudioBg3dModelRights(loaded.rights, bundle.rights) || currentCatalog(id) !== bundle.catalogIdentity)) return fail("source-changed");
  const record = bundle ? Object.freeze({ ...loaded, sourceRestriction: bundleRestriction(id, bundle.asset.sha256) }) : loaded;
  return { record, sourceKind: builtin ? "bundled-environment" : "bundle-pack", manifestRevision: null,
    catalogIdentity: builtin ? JSON.stringify([builtin.id, builtin.sha256, builtin.byteSize, builtin.provenance]) : bundle?.catalogIdentity ?? null };
}

interface PreparedFence {
  readonly id: string;
  readonly sourceIdentity: string;
  readonly catalogIdentity: string | null;
  readonly sourceKind: StudioBg3dModelSourceSnapshot["sourceKind"];
}
const preparedSources = new WeakMap<Bg3dVerifiedStoredRecord, PreparedFence>();
const preparedDirectRoots = new WeakSet<Bg3dVerifiedStoredRecord>();
/** 새 record의 제한은 실제 source 조회 또는 명시 ingress에서만 만든다. */
export async function attachStudioBg3dModelSourceRestriction(
  record: Bg3dVerifiedStoredRecord, request: StudioBg3dModelSourceImportRequest,
  readSource: (id: string) => Promise<StudioBg3dModelSourceSnapshot | null>, signal?: AbortSignal,
): Promise<Bg3dVerifiedStoredRecord> {
  let sourceRestriction = readStudioBg3dEffectiveModelSourceRestriction({});
  let fence: PreparedFence | null = null;
  if (request.sourceReceipt) {
    const expected = request.sourceReceipt, snapshot = await readSource(expected.sourceRecordId); active(signal);
    if (!snapshot || snapshot.record.contentHash !== expected.sourceContentHash
      || fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(snapshot.record)) !== expected.sourceRestrictionFingerprint) return fail("source-changed");
    if (!sameStudioBg3dModelRights(record.rights, snapshot.record.rights)) return fail("rights-conflict");
    // byte-identical 결과는 새 parent_self를 만들지 않고 기존 원본 제한 그대로 dedup한다.
    sourceRestriction = record.contentHash === snapshot.record.contentHash
      ? readStudioBg3dEffectiveModelSourceRestriction(snapshot.record) : inheritStudioBg3dModelSourceRestriction(snapshot.record);
    fence = { id: snapshot.record.id, sourceIdentity: identity(snapshot.record), sourceKind: snapshot.sourceKind, catalogIdentity: snapshot.catalogIdentity };
  } else if (request.ingress?.kind === "bundle-runtime") {
    const ingress = request.ingress, bundle = await strictBundle(ingress.sourceRecordId, signal);
    if (!bundle || bundle.asset.sha256 !== ingress.sourceContentHash || record.contentHash !== ingress.sourceContentHash
      || record.byteSize !== bundle.asset.bytes || !sameStudioBg3dModelRights(record.rights, bundle.rights)) return fail("source-changed");
    sourceRestriction = bundleRestriction(ingress.sourceRecordId, ingress.sourceContentHash);
    fence = { id: ingress.sourceRecordId, sourceIdentity: "", sourceKind: "bundle-pack", catalogIdentity: bundle.catalogIdentity };
  } else if (request.ingress?.kind === "user-file" || request.ingress?.kind === "studio-generated") {
    sourceRestriction = Object.freeze({ version: 1, modelFileExport: request.ingress.modelFileExport,
      origin: Object.freeze({ kind: request.ingress.kind, recordId: record.id, sha256: record.contentHash }), parent: null });
  } else if (request.ingress?.kind === "archive" && request.ingress.sourceRestriction) {
    const imported = request.ingress.sourceRestriction;
    sourceRestriction = imported.modelFileExport === "allowed" ? readStudioBg3dEffectiveModelSourceRestriction({}) : imported;
  }
  const result: Bg3dVerifiedStoredRecord = Object.freeze({ ...record, sourceRestriction });
  if (fence) preparedSources.set(result, fence);
  if (request.ingress?.kind === "user-file" || request.ingress?.kind === "studio-generated") preparedDirectRoots.add(result);
  return result;
}
/** mutate 안에서 같은 source row/CAS를 재확인한다. 재귀 authority 호출로 잠금을 중첩하지 않는다. */
export async function verifyStudioBg3dPreparedSourceInMutation(record: Bg3dVerifiedStoredRecord,
  manifest: Manifest, context: StudioBg3dLibraryMutationContext, signal?: AbortSignal): Promise<void> {
  const expected = preparedSources.get(record);
  if (!expected) return;
  active(signal);
  if (expected.sourceKind === "local-library") {
    const source = manifest.records.find((value) => value.id === expected.id);
    if (!source || identity(source) !== expected.sourceIdentity) return fail("source-changed");
    await verifiedBytes(await context.getBlob(source.blobRef), source, signal);
  } else if (expected.sourceKind === "bundle-pack") {
    if (currentCatalog(expected.id) !== expected.catalogIdentity) return fail("source-changed");
  } else {
    const source = getStudioBg3dEnvironmentAsset(expected.id);
    if (!source || JSON.stringify([source.id, source.sha256, source.byteSize, source.provenance]) !== expected.catalogIdentity) return fail("source-changed");
  }
}
export function assertStudioBg3dModelSourceDedup(existing: Pick<Bg3dVerifiedStoredRecord, "id" | "contentHash" | "rights" | "sourceRestriction">,
  incoming: Bg3dVerifiedStoredRecord): void {
  const left = readStudioBg3dEffectiveModelSourceRestriction(existing), right = readStudioBg3dEffectiveModelSourceRestriction(incoming);
  if (fingerprintStudioBg3dModelSourceRestriction(left) === fingerprintStudioBg3dModelSourceRestriction(right)) return;
  // 같은 명시 신규 ingress의 재선택은 기존 최초 root ID를 유지한다. 권리·제한·parent가 다르면 합치지 않는다.
  if (preparedDirectRoots.has(incoming) && sameStudioBg3dModelRights(existing.rights, incoming.rights)
    && existing.contentHash === incoming.contentHash && left.parent === null && right.parent === null
    && left.modelFileExport === right.modelFileExport && left.origin && right.origin
    && left.origin.kind === right.origin.kind && left.origin.kind !== "bundle-pack"
    && left.origin.recordId === existing.id && right.origin.recordId === incoming.id
    && left.origin.sha256 === existing.contentHash && right.origin.sha256 === incoming.contentHash) return;
  fail("source-restriction-conflict");
}
/** 기존 V12 record codec의 응집된 복사다. private Blob은 manifest에 쓰지 않는다. */
export function studioBg3dModelRecordForManifest(record: Bg3dVerifiedStoredRecord, blobRef: StudioBg3dLibraryBlobReceipt): Stored {
  return { id: record.id, storageVersion: record.storageVersion, name: record.name, format: record.format,
    createdAt: record.createdAt, updatedAt: record.updatedAt, contentHash: record.contentHash, byteSize: record.byteSize,
    mime: record.mime, validationVersion: record.validationVersion, validatedAt: record.validatedAt,
    validatorProfile: record.validatorProfile, validatorMetrics: Object.freeze({ ...record.validatorMetrics }),
    rights: Object.freeze({ ...record.rights }), ...(Object.hasOwn(record, "sourceRestriction")
      ? { sourceRestriction: readStudioBg3dEffectiveModelSourceRestriction(record) } : {}), blobRef };
}
