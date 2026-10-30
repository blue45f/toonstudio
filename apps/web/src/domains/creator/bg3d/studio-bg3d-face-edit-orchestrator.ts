import { loadStudioBg3dModelLibraryModule } from "./studio-bg3d-model-library-loader";
import {
  admitAndCacheStudioBg3dModel,
  bindModelAttachment,
  type StudioBg3dModelRootCacheEntry,
} from "./studio-bg3d-model-runtime-admission";
import { calculateStudioBg3dPlacedModelBytes } from "./studio-bg3d-model-placement-admission";
import {
  combineStudioBg3dAbortSignals,
  studioBg3dModalOperationCoordinator,
  type StudioBg3dModalSession,
  type StudioBg3dOperationLease,
} from "./studio-bg3d-modal-operation-coordinator";
import type { StudioBg3dFaceEditExportResult } from "./studio-bg3d-face-edit-export";
import {
  type StudioBg3dPrimitiveEditReplacementHost, type StudioBg3dPrimitiveEditReplacementAsset,
} from "./studio-bg3d-primitive-edit-replacement";
import { deriveStudioBg3dSessionGlbValidationPolicy } from "./studio-bg3d-session-glb-policy";

import type { Bg3dModelAtomicImportDispositionV12, Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dResolvedDeviceQuality } from "./studio-bg3d-device-quality";
import type { StudioBg3dKtx2Renderer } from "./studio-bg3d-ktx2-renderer-runtime";
import type { StudioBg3dAttachmentRights, StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import { acquireStudioBg3dModelReadLeaseV12 } from "./studio-bg3d-model-read-lease";
import type { StudioBg3dModelReadLease, StudioBg3dModelReadLeaseRecordIdentity } from "./studio-bg3d-model-read-lease";
import { resolveStudioBg3dModelExportProvenance, assertStudioBg3dModelExportReceiptCurrent } from "./studio-bg3d-model-export-provenance";
import { fingerprintStudioBg3dModelSourceRestriction, readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import { deleteStudioBg3dOwnedModelCacheEntry, readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend, studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant, type StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

/** 호스트 어댑터는 getter와 위임 메서드에서 현재 참조를 읽는다. */
export interface StudioBg3dFaceEditOrchestratorHost extends StudioBg3dPrimitiveEditReplacementHost {
  readonly modalAssetSessionRef: { readonly current: StudioBg3dModalSession | null };
  readonly modelRootCacheRef: { readonly current: Map<string, StudioBg3dModelRootCacheEntry> };
  readonly attachmentByStorageModelIdRef: { readonly current: Map<string, StudioBg3dModelAttachment> };
  readonly storageModelIdByAttachmentIdRef: { readonly current: Map<string, string> };
  readonly deviceQuality: StudioBg3dResolvedDeviceQuality;
  readonly modelRenderer: StudioBg3dKtx2Renderer | null;
  readonly materialBackend?: StudioBg3dMaterialBackend;
  readonly isMaterialBackendCurrent?: () => boolean;
  /** 목록 갱신은 정본 교체 권위가 아니며 완료된 적용을 취소하지 않는다. */
  readonly onAssetCommitted?: (record: Bg3dVerifiedStoredRecord) => void | Promise<void>;
}

export type StudioBg3dFaceEditSourceCheck = { readonly ok: true; readonly runtime: StudioBg3dPrimitiveEditRuntime }
  | { readonly ok: false; readonly messageKo: string };

export interface StudioBg3dFaceEditOperation {
  readonly modalSession: object;
  readonly sourceNodeId: string;
  readonly name: string;
  readonly rights: StudioBg3dAttachmentRights;
  readonly sourceRecordIdentity?: StudioBg3dModelReadLeaseRecordIdentity;
  readSource(): StudioBg3dFaceEditSourceCheck;
  rereadSource?(signal: AbortSignal): Promise<StudioBg3dFaceEditSourceCheck>;
  exportAsset(): StudioBg3dFaceEditExportResult;
  replaceAsset(asset: StudioBg3dPrimitiveEditReplacementAsset): { readonly ok: true } | { readonly ok: false; readonly messageKo: string };
}

type Stage = "source" | "export" | "material" | "authoring" | "storage" | "admission" | "commit";
type Cleanup = "not-created" | "removed" | "retained";
interface CleanupResult { readonly status: Cleanup; readonly storageIds: readonly string[]; readonly resourceFailure: boolean }

export type StudioBg3dFaceEditApplyResult = {
  readonly ok: true;
  readonly nodeId: string;
  readonly storageModelId: string;
  readonly notificationWarning?: boolean;
  readonly messageKo?: string;
} | {
  readonly ok: false;
  readonly code: "aborted" | "stale-source" | "apply-failed";
  readonly stage: Stage;
  readonly messageKo: string;
  readonly cleanup: Cleanup;
  readonly retainedStorageIds: readonly string[];
};

class FaceEditApplyError extends Error {
  constructor(readonly code: "aborted" | "stale-source" | "apply-failed", message: string) { super(message); }
}

interface PreparedAsset {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly attachment: StudioBg3dModelAttachment;
  readonly entry: StudioBg3dModelRootCacheEntry;
  readonly policyKey: string;
}

interface InstalledBindings {
  readonly cache: Map<string, StudioBg3dModelRootCacheEntry>;
  readonly attachments: Map<string, StudioBg3dModelAttachment>;
  readonly storageIds: Map<string, string>;
  readonly asset: PreparedAsset;
  readonly addedCache: boolean;
  readonly addedAttachment: boolean;
  readonly addedStorageId: boolean;
}

function stageMessage(stage: Stage): string {
  const messages: Readonly<Record<Stage, string>> = {
    source: "편집 중 원본 또는 선택이 바뀌어 결과를 적용하지 않았습니다.",
    export: "확정한 면 편집을 내보내지 못했습니다. 메시 상태를 확인해 주세요.",
    material: "원본의 색·기본 재질을 보존하지 못해 교체하지 않았습니다.",
    authoring: "정확한 원본 면 편집 데이터를 보존하지 못해 교체하지 않았습니다.",
    storage: "편집 모델의 Worker 검증 또는 저장에 실패했습니다. 다시 시도해 주세요.",
    admission: "편집 모델을 현재 품질·렌더 예산으로 준비하지 못했습니다.",
    commit: "장면 반영 중 오류가 발생했습니다. 현재 장면을 확인한 뒤 다시 시도하세요.",
  };
  return messages[stage];
}

function abortError(signal: AbortSignal): FaceEditApplyError {
  return new FaceEditApplyError("aborted", signal.reason instanceof Error && signal.reason.name === "TimeoutError"
    ? "면 편집 적용이 제한 시간을 초과했습니다. 원본을 확인한 뒤 다시 시도하세요."
    : "면 편집 적용을 취소했습니다.");
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<`sha256:${string}`> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `sha256:${Array.from(hash, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function isSourceHash(value: string): value is `sha256:${string}` {
  return /^sha256:[a-f0-9]{64}$/u.test(value);
}

/** 실제 Worker 검증·atomic 저장·admission 뒤 단일 원본 교체를 발행한다. 기존 자산은 덮거나 보상 삭제하지 않는다. */
export async function applyStudioBg3dFaceEditOperation(
  host: StudioBg3dFaceEditOrchestratorHost,
  operation: StudioBg3dFaceEditOperation,
  signal: AbortSignal,
): Promise<StudioBg3dFaceEditApplyResult> {
  let stage: Stage = "source";
  const renderer = host.modelRenderer, isMaterialBackendCurrent = host.isMaterialBackendCurrent;
  let materialBackend: StudioBg3dMaterialBackend;
  try { materialBackend = resolveStudioBg3dMaterialBackend({ renderer, materialBackend: host.materialBackend }); }
  catch { return { ok: false, code: "stale-source", stage, messageKo: stageMessage(stage), cleanup: "not-created", retainedStorageIds: [] }; }
  const backendCurrent = () => isMaterialBackendCurrent?.() !== false && host.modelRenderer === renderer && resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }) === materialBackend;
  const session = host.modalAssetSessionRef.current;
  if (!session || operation.modalSession !== session || !studioBg3dModalOperationCoordinator.isCurrent(session)) {
    return { ok: false, code: "stale-source", stage, messageKo: stageMessage(stage), cleanup: "not-created", retainedStorageIds: [] };
  }
  let library: Awaited<ReturnType<typeof loadStudioBg3dModelLibraryModule>> | null = null;
  let disposition: Bg3dModelAtomicImportDispositionV12 | null = null;
  let ownedEntry: StudioBg3dModelRootCacheEntry | null = null;
  let ownedStorageId: string | null = null;
  let installed: InstalledBindings | null = null;
  let committed = false;
  let uncertainCommit = false;
  let preparedTask: Promise<PreparedAsset> | null = null;
  let cleanupTask: Promise<CleanupResult> | null = null;
  let heldReadLease: StudioBg3dModelReadLease | null = null;
  const releaseReadLease = async () => {
    const held = heldReadLease;
    heldReadLease = null;
    if (held) await held.release();
  };

  const sessionCurrent = () => host.modalAssetSessionRef.current === session && studioBg3dModalOperationCoordinator.isCurrent(session);
  const assertSource = () => {
    if (signal.aborted) throw abortError(signal);
    if (!sessionCurrent() || !backendCurrent()) throw new FaceEditApplyError("stale-source", stageMessage("source"));
    const current = operation.readSource();
    if (!current.ok) throw new FaceEditApplyError("stale-source", current.messageKo);
    return current;
  };
  const referenced = (id: string) => host.physicsRuntimeSourceRef.current.customModels.some((model) => model.modelId === id);

  const cleanup = (): Promise<CleanupResult> => {
    cleanupTask ??= (async (): Promise<CleanupResult> => {
      await releaseReadLease();
      if (committed) return { status: "not-created", storageIds: [], resourceFailure: false };
      const currentInstalled = installed;
      if (currentInstalled && !uncertainCommit && !referenced(currentInstalled.asset.record.id)) {
        const { cache, attachments, storageIds, asset } = currentInstalled;
        if (currentInstalled.addedCache) deleteStudioBg3dOwnedModelCacheEntry(cache, asset.record.id, asset.entry);
        if (currentInstalled.addedAttachment && attachments.get(asset.record.id) === asset.attachment) attachments.delete(asset.record.id);
        if (currentInstalled.addedStorageId && storageIds.get(asset.attachment.id) === asset.record.id) storageIds.delete(asset.attachment.id);
      }
      let resourceFailure = false;
      const entry = ownedEntry;
      const storageId = ownedStorageId;
      const entryAdopted = entry && storageId && (referenced(storageId) || [...host.modelRootCacheRef.current.values()].some((value) => value === entry || value.root === entry.root));
      if (entry && !entryAdopted && !uncertainCommit) {
        try { entry.dispose(); } catch { resourceFailure = true; }
      }
      const receipt = disposition;
      if (!receipt || (receipt.created.length === 0 && receipt.removedDeletions.length === 0)) {
        return { status: resourceFailure ? "retained" : "not-created", storageIds: [], resourceFailure };
      }
      const ids = receipt.created.map(({ id }) => id);
      const adopted = !sessionCurrent() || uncertainCommit || ids.some((id) => referenced(id)
        || [...host.modelRootCacheRef.current.values()].some((value) => value.record.id === id) || host.attachmentByStorageModelIdRef.current.has(id));
      if (adopted || !library) return { status: "retained", storageIds: ids, resourceFailure };
      try {
        const removed = await library.compensateImportedBg3dModelsIfCreationMatchesV12(receipt);
        return { status: removed && !resourceFailure ? "removed" : "retained", storageIds: removed ? [] : ids, resourceFailure };
      } catch {
        return { status: "retained", storageIds: ids, resourceFailure };
      }
    })();
    return cleanupTask;
  };

  const prepare = async (lease: StudioBg3dOperationLease): Promise<PreparedAsset> => {
    const combined = combineStudioBg3dAbortSignals([signal, lease.signal]);
    let active = true;
    let policyKey: string | null = null;
    const assertCurrent = () => {
      lease.throwIfRevoked();
      if (combined.signal.aborted) throw abortError(combined.signal);
      const current = assertSource();
      const policy = deriveStudioBg3dSessionGlbValidationPolicy(current.runtime.document, host.deviceQuality);
      if (policyKey !== null && JSON.stringify(policy) !== policyKey) {
        throw new FaceEditApplyError("stale-source", "현재 품질·예산이 바뀌었습니다. 최신 설정에서 다시 적용하세요.");
      }
      return { current, policy };
    };
    const rereadCurrent = async () => {
      if (operation.rereadSource) {
        const refreshed = await operation.rereadSource(combined.signal);
        if (!refreshed.ok) throw new FaceEditApplyError("stale-source", refreshed.messageKo);
      }
      return assertCurrent();
    };
    try {
      const initial = await rereadCurrent();
      policyKey = JSON.stringify(initial.policy);
      stage = "export";
      const exported = operation.exportAsset();
      if (!exported.ok) {
        stage = exported.stage;
        throw new FaceEditApplyError("apply-failed", exported.messageKo);
      }
      const hash = await digest(exported.bytes);
      assertCurrent();
      stage = "storage";
      library = await loadStudioBg3dModelLibraryModule();
      const beforeSave = assertCurrent();
      const policy = beforeSave.policy;
      let sourceReceipt: import("./bg3d-model-library").Bg3dModelImportSourceReceipt | undefined;
      if (operation.sourceRecordIdentity) {
        const expected = operation.sourceRecordIdentity;
        const source = await library.getStoredBg3dModelV12(expected.id, { signal: combined.signal });
        assertCurrent();
        if (!source || source.id !== expected.id || source.contentHash !== expected.contentHash
          || source.byteSize !== expected.byteSize || source.mime !== expected.mime || !isSourceHash(source.contentHash)) {
          throw new FaceEditApplyError("stale-source", "파생본을 저장할 실제 모델 원본을 다시 확인하지 못했습니다.");
        }
        const provenance = await resolveStudioBg3dModelExportProvenance(source, { signal: combined.signal, assertCurrent });
        if (fingerprintStudioBg3dModelSourceRestriction(provenance.sourceRestriction)
          !== fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(expected))) {
          throw new FaceEditApplyError("stale-source", "편집 원본의 파일 제한이 바뀌어 파생본을 저장하지 않았습니다.");
        }
        await assertStudioBg3dModelExportReceiptCurrent(provenance);
        assertCurrent();
        sourceReceipt = { sourceRecordId: source.id, sourceContentHash: source.contentHash,
          sourceRestrictionFingerprint: fingerprintStudioBg3dModelSourceRestriction(provenance.sourceRestriction) };
      }
      disposition = await library.importVerifiedBg3dModelsAtomicallyWithDispositionV12([{
        file: new File([exported.bytes], `${operation.name} 면 편집.glb`, { type: "model/gltf-binary" }),
        rights: operation.rights, expectedSha256: hash,
        ...(sourceReceipt ? { sourceReceipt } : { ingress: { kind: "studio-generated", modelFileExport: "allowed" } }),
      }], { executionBackend: "worker", profile: policy.profile, budgets: policy.budgets,
        cumulativeUsedBytes: calculateStudioBg3dPlacedModelBytes(beforeSave.current.runtime.customModels, host.attachmentByStorageModelIdRef.current),
        maximumCumulativeBytes: policy.budgets[policy.profile].complexity.maxModelBytes, signal: combined.signal });
      const record = disposition.records[0];
      if (disposition.records.length !== 1 || !record || record.contentHash !== hash || record.byteSize !== exported.bytes.byteLength) {
        throw new FaceEditApplyError("apply-failed", "저장된 편집 모델의 해시·크기가 내보낸 결과와 다릅니다.");
      }
      const saved = assertCurrent();
      const attachment = host.attachmentByStorageModelIdRef.current.get(record.id) ?? library.createStudioBg3dModelAttachment(record);
      stage = "admission";
      const entry = await admitAndCacheStudioBg3dModel({ record, document: saved.current.runtime.document,
        quality: host.deviceQuality, renderer, materialBackend,
        cumulativeUsedBytes: calculateStudioBg3dPlacedModelBytes(saved.current.runtime.customModels, host.attachmentByStorageModelIdRef.current, record.id),
        cache: new Map(host.modelRootCacheRef.current), pending: new Map(), signal: combined.signal,
        preserveQualityModeOnFailure: true,
        isActive: () => {
          if (!active) return false;
          try { assertCurrent(); return true; } catch { return false; }
        },
        onCacheEntryCreated: (id, value) => { ownedStorageId = id; ownedEntry = value; },
      });
      if (entry.runtimeVariant !== studioBg3dModelRuntimeVariant(materialBackend) || entry.record.id !== record.id) {
        throw new FaceEditApplyError("stale-source", "편집 모델의 재질 backend와 저장 원본이 현재 작업과 다릅니다.");
      }
      await rereadCurrent();
      const persisted = await library.getStoredBg3dModelV12(record.id, { signal: combined.signal });
      assertCurrent();
      if (!persisted || persisted.contentHash !== record.contentHash || persisted.byteSize !== record.byteSize
        || persisted.mime !== record.mime || JSON.stringify(persisted.rights) !== JSON.stringify(record.rights)
        || fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(persisted))
          !== fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(record))) {
        throw new FaceEditApplyError("apply-failed", "적용 직전 편집 모델의 저장 상태를 다시 확인하지 못했습니다.");
      }
      const read = await acquireStudioBg3dModelReadLeaseV12([
        ...(operation.sourceRecordIdentity ? [operation.sourceRecordIdentity] : []),
        record,
      ], { signals: [signal, lease.signal] });
      if (!read.ok) throw new FaceEditApplyError("stale-source", read.messageKo);
      heldReadLease = read.lease;
      assertCurrent();
      return { record, attachment, entry, policyKey: JSON.stringify(assertCurrent().policy) };
    } catch (error) {
      await cleanup();
      throw error;
    } finally {
      active = false;
      combined.dispose();
    }
  };

  try {
    assertSource();
    const mutation = await studioBg3dModalOperationCoordinator.runSceneMutation(session, (lease) => {
      preparedTask = prepare(lease);
      return preparedTask;
    }, (asset) => {
      stage = "commit";
      if (!heldReadLease?.isCurrent()) {
        throw new FaceEditApplyError("stale-source", "원본과 새 모델의 읽기 잠금이 끝나 이전 결과를 적용하지 않았습니다.");
      }
      const latest = assertSource();
      if (JSON.stringify(deriveStudioBg3dSessionGlbValidationPolicy(latest.runtime.document, host.deviceQuality)) !== asset.policyKey) {
        throw new FaceEditApplyError("stale-source", "현재 품질·예산이 바뀌어 이전 결과를 적용하지 않았습니다.");
      }
      const cache = host.modelRootCacheRef.current;
      const attachments = host.attachmentByStorageModelIdRef.current;
      const storageIds = host.storageModelIdByAttachmentIdRef.current;
      const cacheKey = studioBg3dModelCacheKey(asset.record.id, materialBackend);
      const existing = cache.get(cacheKey);
      if (existing && existing !== asset.entry) throw new FaceEditApplyError("stale-source", "다른 작업이 모델 캐시를 갱신해 이전 결과를 적용하지 않았습니다.");
      if (existing && readStudioBg3dModelCacheEntry(cache, asset.record.id, materialBackend) !== existing) throw new FaceEditApplyError("stale-source", "현재 재질 backend의 모델 캐시를 확인하지 못했습니다.");
      const nextAttachments = new Map(attachments);
      const nextStorageIds = new Map(storageIds);
      if (!bindModelAttachment({ attachmentByStorageModelId: nextAttachments, storageModelIdByAttachmentId: nextStorageIds }, asset.record, asset.attachment)) {
        throw new FaceEditApplyError("apply-failed", "편집 모델의 정본 연결을 설치하지 못했습니다.");
      }
      installed = { cache, attachments, storageIds, asset, addedCache: !cache.has(cacheKey),
        addedAttachment: !attachments.has(asset.record.id), addedStorageId: !storageIds.has(asset.attachment.id) };
      if (installed.addedCache) cache.set(cacheKey, asset.entry);
      if (installed.addedAttachment) attachments.set(asset.record.id, asset.attachment);
      if (installed.addedStorageId) storageIds.set(asset.attachment.id, asset.record.id);
      let result;
      try {
        result = operation.replaceAsset({
          record: asset.record, storageModelId: asset.record.id, attachment: asset.attachment, cache: asset.entry,
        });
      } catch (error) {
        // trusted actor가 예외를 내면 history/정본의 부분 반영 여부를 추정해 자산을 삭제하지 않는다.
        uncertainCommit = true;
        throw error;
      }
      if (!result.ok) throw new FaceEditApplyError("apply-failed", result.messageKo);
      committed = true;
    }, { authoritativePersistence: true });
    await releaseReadLease();
    if (mutation.status === "stale") throw new FaceEditApplyError("stale-source", "편집기 세션이 바뀌어 이전 결과를 적용하지 않았습니다.");
    if (!committed) throw new FaceEditApplyError("apply-failed", stageMessage("commit"));
    try { await host.onAssetCommitted?.(mutation.value.record); }
    catch {
      return { ok: true, nodeId: operation.sourceNodeId, storageModelId: mutation.value.record.id,
        notificationWarning: true, messageKo: "원본은 반영했지만 모델 목록을 갱신하지 못했습니다. 보관함을 다시 열어 확인하세요." };
    }
    return { ok: true, nodeId: operation.sourceNodeId, storageModelId: mutation.value.record.id };
  } catch (error) {
    let cause = error;
    // session revoke는 caller를 먼저 깨운다. 비협조적 저장이 물리적으로 끝난 뒤 receipt를 정리해야 한다.
    if (preparedTask) {
      try { await preparedTask; } catch (lateError) { cause = lateError; }
    }
    const cleaned = await cleanup();
    const cancelled = signal.aborted || (cause instanceof Error && cause.name === "AbortError");
    const code = cause instanceof FaceEditApplyError ? cause.code : cancelled ? "aborted" : "apply-failed";
    let messageKo = cause instanceof FaceEditApplyError ? cause.message : cancelled ? "면 편집 적용을 취소했습니다." : stageMessage(stage);
    if (cleaned.status === "retained" && (cleaned.storageIds.length > 0 || !cleaned.resourceFailure)) {
      messageKo += " 다른 세션·저장 작업이 참조할 수 있어 새 파생본은 삭제하지 않고 보관함에 남겼습니다.";
    }
    if (cleaned.resourceFailure) messageKo += " 임시 렌더 자원 정리를 확인하지 못했습니다. 다시 시도하기 전에 편집기를 확인해 주세요.";
    return { ok: false, code, stage, messageKo, cleanup: cleaned.status, retainedStorageIds: cleaned.storageIds };
  } finally {
    await releaseReadLease();
  }
}
