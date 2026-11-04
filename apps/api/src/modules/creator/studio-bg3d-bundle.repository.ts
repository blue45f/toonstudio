import { studioCrdtWorkAdvisoryLockQuery } from "./studio-crdt.repository";
import { buildStudioBg3dBundleSealedChain, assertStudioBg3dBundleChainByteCount, studioBg3dBundleChainFailure, type StudioBg3dBundleChainKey, type StudioBg3dBundleSealedChain } from "./studio-bg3d-bundle-chain";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  assertStudioBg3dSixPassBundleTransition,
  hashStudioBg3dSixPassBundleManifest,
  parseStudioBg3dSixPassBundleManifest,
  StudioBg3dSixPassBundleImageReferenceSchema,
  type StudioBg3dSixPassBundleManifest,
  type StudioBg3dSixPassContentHash,
  type StudioBg3dSixPassBundleImageReference,
} from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { creatorWorks, db, studioBg3dBundleArtifacts, studioBg3dBundleRevisions } from "../../platform/database";
import { PrivateObjectReferenceSchema, type PrivateObjectReference } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import { authorizeStudioScopedAssetPurpose } from "./studio-scoped-asset-purpose";
import { lockStudioScopedWork, studioScopedDrizzle } from "./studio-scoped-write-store";
import { enforceMembershipUploadQuota, readMembershipStorageUsage, readDailyUploadBytes, resolveEffectiveResourcePolicy, MembershipResourceQuotaError } from "../membership-operations/membership-resource-quota";

export const STUDIO_BG3D_BUNDLE_REPOSITORY = Symbol("STUDIO_BG3D_BUNDLE_REPOSITORY");
export const STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES = ["scene", "color", "tone", "shadow", "depth", "texture-line", "main-line"] as const;
export type StudioBg3dBundleArtifactRole = typeof STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES[number];
export interface StudioBg3dBundleKey { readonly workId: string; readonly bundleId: string; readonly renderRevisionId: string; }
export interface StudioBg3dBundleRecord {
  readonly manifest: StudioBg3dSixPassBundleManifest;
  readonly manifestHash: StudioBg3dSixPassContentHash;
  readonly state: "prepared" | "sealed";
  readonly sealedAt: string | null;
  readonly artifacts: readonly { readonly role: StudioBg3dBundleArtifactRole; readonly object: PrivateObjectReference }[];
}
export interface StudioBg3dBundleRepository {
  sealedChain(actor: string, key: StudioBg3dBundleChainKey): Promise<StudioBg3dBundleSealedChain>;
  capabilities(actor: string, workId: string): Promise<{ readonly schemaReady: boolean; readonly fileMaxBytes: number; readonly remainingStorageBytes: number; readonly remainingDailyUploadBytes: number }>;
  prepare(actor: string, workId: string, manifest: StudioBg3dSixPassBundleManifest, context?: StudioScopedWriteContext): Promise<StudioBg3dBundleRecord>;
  read(actor: string, key: StudioBg3dBundleKey, operation?: "view" | "edit", context?: StudioScopedWriteContext): Promise<StudioBg3dBundleRecord>;
  storeArtifact(actor: string, key: StudioBg3dBundleKey, role: StudioBg3dBundleArtifactRole, object: PrivateObjectReference, context?: StudioScopedWriteContext): Promise<StudioBg3dBundleRecord>;
  seal(actor: string, key: StudioBg3dBundleKey, context?: StudioScopedWriteContext): Promise<StudioBg3dBundleRecord>;
}
export type StudioBg3dBundleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Transaction = StudioBg3dBundleTransaction;
const whereKey = (key: StudioBg3dBundleKey) => and(eq(studioBg3dBundleRevisions.workId, key.workId), eq(studioBg3dBundleRevisions.bundleId, key.bundleId), eq(studioBg3dBundleRevisions.renderRevisionId, key.renderRevisionId));
const artifactKey = (key: StudioBg3dBundleKey) => and(eq(studioBg3dBundleArtifacts.workId, key.workId), eq(studioBg3dBundleArtifacts.bundleId, key.bundleId), eq(studioBg3dBundleArtifacts.renderRevisionId, key.renderRevisionId));

/** manifest에 없는 role을 업로드나 서명 URL로 확장하지 않는다. */
export function studioBg3dBundleExpectedArtifact(manifest: StudioBg3dSixPassBundleManifest, role: StudioBg3dBundleArtifactRole) {
  const artifact = role === "scene" ? manifest.scene : manifest.layers.find((layer) => layer.role === role)?.artifact;
  if (!artifact) throw new ConflictException("6패스 manifest에 없는 출력 역할입니다.");
  return artifact;
}
export function studioBg3dBundleObjectMatches(manifest: StudioBg3dSixPassBundleManifest, role: StudioBg3dBundleArtifactRole, object: PrivateObjectReference): boolean {
  const artifact = studioBg3dBundleExpectedArtifact(manifest, role);
  const hash = artifact.contentHash.slice("sha256:".length);
  return object.purpose === "source" && object.digest === artifact.contentHash && object.byteLength === artifact.byteSize
    && object.contentType === artifact.mimeType && object.objectPath === `sha256/${hash.slice(0, 2)}/${hash}`;
}
async function authorize(transaction: Transaction, actor: string, workId: string, operation: "view" | "edit", context?: StudioScopedWriteContext) {
  if (operation === "edit") { await authorizeStudioScopedAssetPurpose(transaction, actor, workId, context); return; }
  const work = await lockStudioScopedWork(studioScopedDrizzle(transaction), workId, actor, false);
  if (!work.access.view) throw new ForbiddenException("이 원고의 6패스 출력을 볼 권한이 없습니다.");
}
export async function readStudioBg3dBundleRecordInTransaction(transaction: Transaction, key: StudioBg3dBundleKey): Promise<StudioBg3dBundleRecord> {
  const [row] = await transaction.select().from(studioBg3dBundleRevisions).where(whereKey(key)).limit(1);
  if (!row) throw new NotFoundException("6패스 revision을 찾지 못했습니다.");
  const manifest = parseStudioBg3dSixPassBundleManifest(row.manifest);
  const manifestHash = hashStudioBg3dSixPassBundleManifest(manifest);
  if (manifestHash !== row.manifestHash || (row.state !== "prepared" && row.state !== "sealed")) throw new ConflictException("6패스 revision 저장 영수증이 손상되었습니다.");
  const rows = await transaction.select().from(studioBg3dBundleArtifacts).where(artifactKey(key));
  const artifacts = rows.map((entry) => {
    if (!(STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES as readonly string[]).includes(entry.role)) throw new ConflictException("6패스 출력 역할이 손상되었습니다.");
    const role = entry.role as StudioBg3dBundleArtifactRole;
    const object = PrivateObjectReferenceSchema.parse(entry.objectReference);
    if (!studioBg3dBundleObjectMatches(manifest, role, object) || entry.contentHash !== object.digest || entry.byteSize !== object.byteLength) throw new ConflictException("6패스 출력 영수증이 manifest와 다릅니다.");
    return { role, object };
  });
  return { manifest, manifestHash, state: row.state, sealedAt: row.sealedAt?.toISOString() ?? null, artifacts };
}
/** 한 번의 조회 크기만 제한한다. 전체 revision 횟수 제한 없이 정확한 JSON 예산까지 모두 읽는다. */
export async function readStudioBg3dBundleSealedChainInTransaction(transaction: Transaction, key: StudioBg3dBundleChainKey): Promise<StudioBg3dBundleSealedChain> {
  const manifests: StudioBg3dSixPassBundleManifest[] = [];
  let cursor: string | null = null, byteCount = 2;
  const batchSize = 128;
  for (;;) {
    const rows = await transaction.select({ renderRevisionId: studioBg3dBundleRevisions.renderRevisionId,
      parentRevisionId: studioBg3dBundleRevisions.parentRevisionId, manifestHash: studioBg3dBundleRevisions.manifestHash,
      manifest: studioBg3dBundleRevisions.manifest }).from(studioBg3dBundleRevisions).where(and(
      eq(studioBg3dBundleRevisions.workId, key.workId), eq(studioBg3dBundleRevisions.bundleId, key.bundleId),
      eq(studioBg3dBundleRevisions.state, "sealed"), cursor === null ? undefined : gt(studioBg3dBundleRevisions.renderRevisionId, cursor),
    )).orderBy(asc(studioBg3dBundleRevisions.renderRevisionId)).limit(batchSize);
    for (const row of rows) {
      const manifest = parseStudioBg3dSixPassBundleManifest(row.manifest);
      if (manifest.bundleId !== key.bundleId || manifest.renderRevisionId !== row.renderRevisionId
        || manifest.parentRevisionId !== row.parentRevisionId || hashStudioBg3dSixPassBundleManifest(manifest) !== row.manifestHash)
        studioBg3dBundleChainFailure("봉인된 6패스 이력의 식별자·manifest hash가 손상되었습니다.");
      byteCount += new TextEncoder().encode(JSON.stringify(manifest)).byteLength + 1;
      // 다음 batch를 읽기 전에 누적 본문을 제한하며, 마지막에는 응답·state 전체의 정확한 UTF-8 크기를 검사한다.
      assertStudioBg3dBundleChainByteCount(byteCount);
      manifests.push(manifest);
    }
    if (rows.length < batchSize) break;
    cursor = rows.at(-1)!.renderRevisionId;
  }
  return buildStudioBg3dBundleSealedChain(key, manifests);
}
async function parentRecord(transaction: Transaction, workId: string, manifest: StudioBg3dSixPassBundleManifest) {
  const chain = await readStudioBg3dBundleSealedChainInTransaction(transaction, { workId, bundleId: manifest.bundleId });
  if (chain.sealedTipRevisionId !== manifest.parentRevisionId) throw new ConflictException("6패스 부모 revision이 현재 봉인된 revision과 다릅니다. 최신 원고를 다시 확인하세요.");
  try { assertStudioBg3dSixPassBundleTransition(chain.revisions.at(-1) ?? null, manifest); }
  catch { throw new ConflictException("6패스 revision의 부모·레이어·그룹 식별자가 기존 원본과 다릅니다."); }
  // 본문 업로드나 quota 예약보다 먼저 기존 sealed 이력과 새 후보가 같은 문서 예산 안인지 확인한다.
  buildStudioBg3dBundleSealedChain({ workId, bundleId: manifest.bundleId }, [...chain.revisions, manifest]);
}

/** 호출자가 기존 work mutation lock 안에서 사용하면 reader 검사와 commit이 같은 전이에 속한다. */
export async function hasStudioBg3dRetainedBundlesInTransaction(transaction: Transaction, workId: string): Promise<boolean> {
  const readiness = await transaction.execute(sql`SELECT to_regclass('public.studio_bg3d_bundle_revision') IS NOT NULL AS ready`);
  if (readiness.rows[0]?.ready !== true) return false;
  const [row] = await transaction.select({ id: studioBg3dBundleRevisions.renderRevisionId }).from(studioBg3dBundleRevisions)
    .where(eq(studioBg3dBundleRevisions.workId, workId)).limit(1);
  return Boolean(row);
}
export async function assertStudioBg3dBundleReaderInTransaction(transaction: Transaction, workId: string, features: readonly string[]): Promise<void> {
  if (!features.includes("bg3d-sixpass-bundle.v1") && await hasStudioBg3dRetainedBundlesInTransaction(transaction, workId))
    throw new ConflictException({ code: "studio_bg3d_reader_upgrade_required", message: "이 원고의 보존된 6패스를 읽을 수 있는 앱으로 업데이트해 주세요." });
}
export async function verifyStudioBg3dSealedReferencesInTransaction(transaction: Transaction, workId: string, refs: readonly StudioBg3dSixPassBundleImageReference[]): Promise<void> {
  const records = new Map<string, StudioBg3dBundleRecord>();
  for (const value of refs) {
    const ref = StudioBg3dSixPassBundleImageReferenceSchema.parse(value);
    const key = { workId, bundleId: ref.bundleId, renderRevisionId: ref.renderRevisionId };
    const cacheKey = `${ref.bundleId}/${ref.renderRevisionId}`;
    const record = records.get(cacheKey) ?? await readStudioBg3dBundleRecordInTransaction(transaction, key);
    records.set(cacheKey, record);
    if (record.state !== "sealed" || record.manifestHash !== ref.manifestHash || record.artifacts.length !== 7
      || !record.manifest.layers.some((layer) => layer.role === ref.role && layer.elementId === ref.elementId))
      throw new ConflictException("문서의 6패스 참조가 이 작품에 봉인된 원본과 다릅니다.");
  }
}

/** GET은 기존 원고 view ACL을 통과한 뒤 reader 요구를 반환한다. */
export function assertStudioBg3dBundleAuthorizedReader(actor: string, workId: string, features: readonly string[]): Promise<readonly string[]> {
  return db.transaction(async (transaction) => {
    await authorize(transaction, actor, workId, "view");
    const retained = await hasStudioBg3dRetainedBundlesInTransaction(transaction, workId);
    await assertStudioBg3dBundleReaderInTransaction(transaction, workId, features);
    return retained ? ["bg3d-sixpass-bundle.v1"] : [];
  });
}

export class DrizzleStudioBg3dBundleRepository implements StudioBg3dBundleRepository {
  sealedChain(actor: string, key: StudioBg3dBundleChainKey): Promise<StudioBg3dBundleSealedChain> {
    return db.transaction(async (transaction) => {
      await transaction.execute(studioCrdtWorkAdvisoryLockQuery(key.workId));
      await authorize(transaction, actor, key.workId, "view");
      return readStudioBg3dBundleSealedChainInTransaction(transaction, key);
    });
  }
  capabilities(actor: string, workId: string) {
    return db.transaction(async (transaction) => {
      await authorize(transaction, actor, workId, "view");
      const [work] = await transaction.select({ owner: creatorWorks.userId }).from(creatorWorks).where(eq(creatorWorks.id, workId));
      if (!work) throw new NotFoundException("원고를 찾지 못했습니다.");
      const [readiness, policy, usage, daily] = await Promise.all([
        transaction.execute(sql`SELECT coalesce(has_table_privilege(current_user,to_regclass('public.studio_bg3d_bundle_revision'),'SELECT') AND has_any_column_privilege(current_user,to_regclass('public.studio_bg3d_bundle_revision'),'INSERT'),false)
          AND coalesce(has_table_privilege(current_user,to_regclass('public.studio_bg3d_bundle_artifact'),'SELECT') AND has_any_column_privilege(current_user,to_regclass('public.studio_bg3d_bundle_artifact'),'INSERT'),false)
          AND coalesce(has_column_privilege(current_user,to_regclass('public.studio_bg3d_bundle_revision'),'state','UPDATE'),false)
          AND coalesce(has_column_privilege(current_user,to_regclass('public.studio_bg3d_bundle_revision'),'sealedAt','UPDATE'),false)
          AND NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid IN (to_regclass('public.studio_bg3d_bundle_revision'),to_regclass('public.studio_bg3d_bundle_artifact'))
            AND attnum>0 AND NOT attisdropped AND NOT has_column_privilege(current_user,attrelid,attname,'INSERT')) AS ready`),
        resolveEffectiveResourcePolicy(transaction, work.owner), readMembershipStorageUsage(transaction, work.owner), readDailyUploadBytes(transaction, work.owner),
      ]);
      return { schemaReady: readiness.rows[0]?.ready === true, fileMaxBytes: policy.fileMaxBytes,
        remainingStorageBytes: Math.max(0, policy.storageBytes - usage.totalBytes), remainingDailyUploadBytes: Math.max(0, policy.dailyUploadMaxBytes - daily) };
    });
  }
  prepare(actor: string, workId: string, manifest: StudioBg3dSixPassBundleManifest, context?: StudioScopedWriteContext) {
    return db.transaction(async (transaction) => {
      await authorize(transaction, actor, workId, "edit", context);
      const key = { workId, bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId };
      const [existing] = await transaction.select().from(studioBg3dBundleRevisions).where(whereKey(key)).limit(1);
      const manifestHash = hashStudioBg3dSixPassBundleManifest(manifest);
      if (existing) {
        if (existing.manifestHash !== manifestHash) throw new ConflictException("이미 사용한 6패스 revision ID의 원본을 바꿀 수 없습니다.");
        return readStudioBg3dBundleRecordInTransaction(transaction, key);
      }
      await parentRecord(transaction, workId, manifest);
      const reservedBytes = manifest.scene.byteSize + manifest.layers.reduce((total, layer) => total + layer.artifact.byteSize, 0);
      await enforceMembershipUploadQuota(transaction, { workId, incomingBytes: reservedBytes,
        largestFileBytes: Math.max(manifest.scene.byteSize, ...manifest.layers.map((layer) => layer.artifact.byteSize)),
        sourceKey: `studio-bg3d-bundle:${workId}:${manifest.bundleId}:${manifest.renderRevisionId}`,
        metadata: { surface: "studio-bg3d-bundle", manifestHash, artifacts: 7 } });
      await transaction.insert(studioBg3dBundleRevisions).values({ ...key, parentRevisionId: manifest.parentRevisionId,
        manifestHash, manifest, reservedBytes, state: "prepared", createdBy: actor });
      return readStudioBg3dBundleRecordInTransaction(transaction, key);
    });
  }
  read(actor: string, key: StudioBg3dBundleKey, operation: "view" | "edit" = "view", context?: StudioScopedWriteContext) {
    return db.transaction(async (transaction) => { await authorize(transaction, actor, key.workId, operation, context); return readStudioBg3dBundleRecordInTransaction(transaction, key); });
  }
  storeArtifact(actor: string, key: StudioBg3dBundleKey, role: StudioBg3dBundleArtifactRole, object: PrivateObjectReference, context?: StudioScopedWriteContext) {
    return db.transaction(async (transaction) => {
      await authorize(transaction, actor, key.workId, "edit", context);
      const record = await readStudioBg3dBundleRecordInTransaction(transaction, key);
      if (!studioBg3dBundleObjectMatches(record.manifest, role, object)) throw new ConflictException("업로드 객체가 6패스 manifest와 다릅니다.");
      const previous = record.artifacts.find((entry) => entry.role === role);
      if (previous) {
        if (JSON.stringify(previous.object) !== JSON.stringify(object)) throw new ConflictException("이미 저장한 6패스 객체 위치를 바꿀 수 없습니다.");
        return record;
      }
      if (record.state !== "prepared") throw new ConflictException("봉인한 6패스 revision을 변경할 수 없습니다.");
      await transaction.insert(studioBg3dBundleArtifacts).values({ ...key, role, contentHash: object.digest, byteSize: object.byteLength, objectReference: object });
      return readStudioBg3dBundleRecordInTransaction(transaction, key);
    });
  }
  seal(actor: string, key: StudioBg3dBundleKey, context?: StudioScopedWriteContext) {
    return db.transaction(async (transaction) => {
      await authorize(transaction, actor, key.workId, "edit", context);
      const record = await readStudioBg3dBundleRecordInTransaction(transaction, key);
      if (record.state === "sealed") return record;
      await parentRecord(transaction, key.workId, record.manifest);
      if (record.artifacts.length !== 7 || !STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES.every((role) => record.artifacts.some((entry) => entry.role === role))) throw new ConflictException("장면과 여섯 PNG가 모두 저장된 뒤에만 6패스를 봉인할 수 있습니다.");
      const [work] = await transaction.select({ owner: creatorWorks.userId }).from(creatorWorks).where(eq(creatorWorks.id, key.workId));
      if (!work) throw new NotFoundException("원고를 찾지 못했습니다.");
      const [policy, usage] = await Promise.all([resolveEffectiveResourcePolicy(transaction, work.owner), readMembershipStorageUsage(transaction, work.owner)]);
      if (usage.totalBytes > policy.storageBytes) throw new MembershipResourceQuotaError("storage", usage.totalBytes, 0, policy.storageBytes);
      await transaction.update(studioBg3dBundleRevisions).set({ state: "sealed", sealedAt: new Date() }).where(whereKey(key));
      return readStudioBg3dBundleRecordInTransaction(transaction, key);
    });
  }
}
export const studioBg3dBundleRepositoryProvider = { provide: STUDIO_BG3D_BUNDLE_REPOSITORY, useFactory: (): StudioBg3dBundleRepository => new DrizzleStudioBg3dBundleRepository() };
