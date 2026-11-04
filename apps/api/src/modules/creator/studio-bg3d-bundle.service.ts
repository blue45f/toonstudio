import { buildStudioBg3dBundleSealedChain, studioBg3dBundleChainFailure, type StudioBg3dBundleChainKey } from "./studio-bg3d-bundle-chain";
import { createHash } from "node:crypto";
import { assertStudioBg3dBundlePngPixels } from "./studio-bg3d-bundle-png";
import { db } from "../../platform/database";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Optional, PayloadTooLargeException, ServiceUnavailableException } from "@nestjs/common";
import { isStudioWorkAssetAdmissionOptedIn } from "@toonstudio/contracts/studio-work-asset-contract";
import { hashStudioBg3dSixPassBundleManifest, createStudioBg3dSixPassBundleReceipt, parseStudioBg3dSixPassBundleManifest, verifyStudioBg3dSixPassArtifactBytes, verifyStudioBg3dSixPassBundleSceneBytes, type StudioBg3dSixPassBundleManifest, type StudioBg3dSixPassBundleImageReference } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { PrivateObjectReferenceSchema, PrivateSignedReadUrlSchema, type PrivateObjectReference } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import { SUPABASE_OBJECT_STORAGE_PORT } from "../../platform/adapters/supabase-object-storage/supabase-object-storage.port";
import { MembershipResourceQuotaError } from "../membership-operations/membership-resource-quota";
import { STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES, STUDIO_BG3D_BUNDLE_REPOSITORY, hasStudioBg3dRetainedBundlesInTransaction, assertStudioBg3dBundleReaderInTransaction, verifyStudioBg3dSealedReferencesInTransaction, studioBg3dBundleExpectedArtifact, studioBg3dBundleObjectMatches, type StudioBg3dBundleArtifactRole, type StudioBg3dBundleKey, type StudioBg3dBundleRecord, type StudioBg3dBundleTransaction, type StudioBg3dBundleRepository } from "./studio-bg3d-bundle.repository";
import type { StudioWorkAssetUploadFile } from "./studio-work-asset.service";

/** 공개 영수증에는 storage bucket·provider·객체 경로·서명 URL을 섞지 않는다. */
export function studioBg3dBundleReceipt(record: StudioBg3dBundleRecord, workId: string) {
  return { version: 1 as const, workId, state: record.state,
    manifest: record.manifest, manifestHash: record.manifestHash, sealedAt: record.sealedAt,
    receipt: record.state === "sealed" ? createStudioBg3dSixPassBundleReceipt(record.manifest, workId) : null,
    uploadedRoles: STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES.filter((role) => record.artifacts.some((artifact) => artifact.role === role)) };
}
export function parseStudioBg3dBundleUploadManifest(value: unknown, key: StudioBg3dBundleKey): StudioBg3dSixPassBundleManifest {
  try {
    const manifest = parseStudioBg3dSixPassBundleManifest(value);
    if (manifest.bundleId !== key.bundleId || manifest.renderRevisionId !== key.renderRevisionId) throw new Error("path mismatch");
    return manifest;
  } catch { throw new BadRequestException("6패스 manifest와 revision 경로가 올바르지 않습니다."); }
}
@Injectable()
export class StudioBg3dBundleService {
  constructor(@Inject(STUDIO_BG3D_BUNDLE_REPOSITORY) private readonly repository: StudioBg3dBundleRepository,
    @Optional() @Inject(SUPABASE_OBJECT_STORAGE_PORT) private readonly objectStorage?: PrivateObjectStoragePort) {}

  private assertEnabled() {
    if (!isStudioWorkAssetAdmissionOptedIn(process.env.STUDIO_WORK_ASSET_ADMISSION)) throw new ForbiddenException("협업 에셋 입장이 비활성화되어 6패스를 저장하지 않았습니다.");
  }
  private async run<Value>(operation: () => Promise<Value>): Promise<Value> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof MembershipResourceQuotaError) throw new PayloadTooLargeException({ code: "studio_bg3d_bundle_quota", quota: error.quota, message: "현재 저장·파일·일일 업로드 한도에서 6패스를 저장할 수 없습니다. 품질이나 요금 한도를 자동 변경하지 않았습니다." });
      throw error;
    }
  }
  hasRetainedBundles(workId: string, transaction?: StudioBg3dBundleTransaction): Promise<boolean> {
    return transaction ? hasStudioBg3dRetainedBundlesInTransaction(transaction, workId)
      : db.transaction((current) => hasStudioBg3dRetainedBundlesInTransaction(current, workId));
  }
  assertReaderCapability(workId: string, features: readonly string[], transaction?: StudioBg3dBundleTransaction): Promise<void> {
    return transaction ? assertStudioBg3dBundleReaderInTransaction(transaction, workId, features)
      : db.transaction((current) => assertStudioBg3dBundleReaderInTransaction(current, workId, features));
  }
  verifySealedReferences(workId: string, refs: readonly StudioBg3dSixPassBundleImageReference[], transaction?: StudioBg3dBundleTransaction): Promise<void> {
    return transaction ? verifyStudioBg3dSealedReferencesInTransaction(transaction, workId, refs)
      : db.transaction((current) => verifyStudioBg3dSealedReferencesInTransaction(current, workId, refs));
  }
  async capabilities(actor: string, workId: string) {
    const value = await this.run(() => this.repository.capabilities(actor, workId));
    return { enabled: isStudioWorkAssetAdmissionOptedIn(process.env.STUDIO_WORK_ASSET_ADMISSION) && value.schemaReady,
      readerCapability: "bg3d-sixpass-bundle.v1" as const, maximumPngBytes: 64 * 1024 * 1024,
      maximumPngTotalBytes: 384 * 1024 * 1024, maximumSceneBytes: 320 * 1024,
      fileMaxBytes: value.fileMaxBytes, remainingStorageBytes: value.remainingStorageBytes,
      remainingDailyUploadBytes: value.remainingDailyUploadBytes };
  }
  async prepare(actor: string, key: StudioBg3dBundleKey, value: unknown, context?: StudioScopedWriteContext) {
    this.assertEnabled();
    const manifest = parseStudioBg3dBundleUploadManifest(value, key);
    const record = await this.run(() => this.repository.prepare(actor, key.workId, manifest, context));
    return { ...studioBg3dBundleReceipt(record, key.workId) };
  }
  async sealedChain(actor: string, key: StudioBg3dBundleChainKey) {
    const value = await this.run(() => this.repository.sealedChain(actor, key));
    const checked = buildStudioBg3dBundleSealedChain(key, value.revisions);
    if (value.version !== 1 || value.workId !== key.workId || value.bundleId !== key.bundleId || value.sealedTipRevisionId !== checked.sealedTipRevisionId)
      studioBg3dBundleChainFailure("6패스 이력 응답의 작품·bundle·마지막 revision이 다릅니다.");
    return checked;
  }
  async get(actor: string, key: StudioBg3dBundleKey) {
    const record = await this.run(() => this.repository.read(actor, key));
    return { ...studioBg3dBundleReceipt(record, key.workId) };
  }
  async upload(actor: string, key: StudioBg3dBundleKey, role: StudioBg3dBundleArtifactRole, file: StudioWorkAssetUploadFile | undefined, context?: StudioScopedWriteContext) {
    this.assertEnabled();
    // 현재 ACL/배정은 파일 검증과 원격 업로드 전, repository commit 안에서 두 번 검사한다.
    const record = await this.run(() => this.repository.read(actor, key, "edit", context));
    const artifact = studioBg3dBundleExpectedArtifact(record.manifest, role);
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.byteLength !== file.size || file.size !== artifact.byteSize || file.mimetype !== artifact.mimeType) throw new BadRequestException("6패스 출력의 크기·형식이 manifest와 다릅니다.");
    try {
      if (role === "scene") verifyStudioBg3dSixPassBundleSceneBytes(record.manifest, file.buffer);
      else { verifyStudioBg3dSixPassArtifactBytes(artifact, file.buffer); assertStudioBg3dBundlePngPixels(file.buffer); }
    }
    catch { throw new BadRequestException("6패스 출력의 픽셀·장면·SHA-256을 확인하지 못했습니다."); }
    const previous = record.artifacts.find((entry) => entry.role === role);
    if (previous) return { ...studioBg3dBundleReceipt(record, key.workId) };
    if (record.state !== "prepared") throw new ConflictException("봉인한 6패스 revision을 변경할 수 없습니다.");
    const storage = this.objectStorage;
    if (!storage) throw new ServiceUnavailableException("비공개 저장소가 준비되지 않았습니다.");
    let object: PrivateObjectReference;
    try {
      const ready = await storage.verifyPrivatePurposeBuckets(undefined, ["source"]);
      if (!ready.ready) throw new Error("storage unavailable");
      const opaque = (value: string) => createHash("sha256").update(value).digest("hex");
      object = PrivateObjectReferenceSchema.parse(await storage.uploadImmutable({ purpose: "source", contentType: artifact.mimeType, bytes: Uint8Array.from(file.buffer),
        controlMetadata: { documentId: `work-${opaque(key.workId)}`, operationId: `bg3d-${opaque(hashStudioBg3dSixPassBundleManifest(record.manifest) + role)}`, labels: { purpose: "source" } } }));
    } catch { throw new ServiceUnavailableException("6패스 비공개 객체 업로드가 완료됐는지 확인할 수 없습니다. revision 상태를 조회한 뒤 같은 바이트로 재개하세요."); }
    if (!studioBg3dBundleObjectMatches(record.manifest, role, object)) throw new ServiceUnavailableException("비공개 저장소의 6패스 객체 영수증이 원본과 다릅니다.");
    const saved = await this.run(() => this.repository.storeArtifact(actor, key, role, object, context));
    return { ...studioBg3dBundleReceipt(saved, key.workId) };
  }
  async seal(actor: string, key: StudioBg3dBundleKey, context?: StudioScopedWriteContext) {
    this.assertEnabled();
    const record = await this.run(() => this.repository.seal(actor, key, context));
    return { ...studioBg3dBundleReceipt(record, key.workId) };
  }
  async download(actor: string, key: StudioBg3dBundleKey, role: StudioBg3dBundleArtifactRole) {
    const record = await this.run(() => this.repository.read(actor, key));
    if (record.state !== "sealed") throw new ConflictException("봉인하지 않은 6패스 출력은 원고에서 참조하거나 다운로드할 수 없습니다.");
    const artifact = record.artifacts.find((entry) => entry.role === role);
    if (!artifact || !this.objectStorage) throw new ServiceUnavailableException("6패스 원본을 읽을 수 없습니다.");
    try {
      const signedRead = PrivateSignedReadUrlSchema.parse(await this.objectStorage.createSignedReadUrl({ object: artifact.object, expiresInSeconds: 120 }));
      const remaining = signedRead.expiresAtEpochMs - Date.now();
      if (remaining <= 0 || remaining > 120_000) throw new Error("invalid expiry");
      return { manifestHash: record.manifestHash, role, contentHash: artifact.object.digest, signedRead };
    } catch { throw new ServiceUnavailableException("6패스 원본의 비공개 읽기 주소를 발급하지 못했습니다."); }
  }
}
