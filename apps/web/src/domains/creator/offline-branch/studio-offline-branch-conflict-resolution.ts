import { STUDIO_OFFLINE_BRANCH_LIMITS, studioOfflineBranchPendingOperations, studioOfflineBranchRetainedPayloadOperations, studioOfflineBranchOperationPayloadHashes } from "./studio-offline-branch-contract";
import { currentStudioOfflineBranchFingerprint, prepareStudioOfflineBranchReapplication } from "./studio-offline-branch-scene-bridge";
import { fingerprintStudioOfflineBranchValue } from "./studio-offline-branch-payload";
import type { StudioOfflinePreparedMutation } from "./studio-offline-branch-scene-bridge";
import type { StudioOfflineBranchConflict, StudioOfflineBranchOperation, StudioOfflineBranchSnapshot } from "./studio-offline-branch-contract";
import type { StudioOfflineBranchStorage } from "./studio-offline-branch-storage";
import type { StudioOfflineBranchWorkerPort } from "./studio-offline-branch-worker-client";
import type { PageState } from "../studio-page-state";

export interface StudioOfflineBranchResolveInput {
  readonly operationId: string;
  readonly action: "keep-canonical" | "reapply-local";
  readonly expectedCanonicalFingerprint: string | null;
}

export interface StudioOfflineBranchConflictDetail {
  readonly operationId: string;
  readonly pageId: string;
  readonly pageName: string;
  readonly pageNumber?: number | null;
  readonly disabledReasonCode?: "not-owned" | "published" | "offline" | "page-missing" | "payload-unavailable" | "unavailable" | null;
  readonly targetId: string;
  readonly targetType: StudioOfflineBranchOperation["targetType"];
  readonly action: StudioOfflineBranchOperation["action"];
  readonly code: StudioOfflineBranchConflict["code"];
  readonly message: string;
  readonly canonicalFingerprint: string | null;
  readonly canKeepCanonical: boolean;
  readonly canReapplyLocal: boolean;
  readonly disabledReason: string | null;
}

export interface StudioOfflineConflictState {
  readonly snapshot: StudioOfflineBranchSnapshot;
  readonly canonicalPages: readonly PageState[];
  readonly actorId: string;
  readonly canonicalAuthority: boolean;
  readonly writable: boolean;
  readonly payloads: ReadonlyMap<string, Uint8Array>;
}

export function describeStudioOfflineBranchConflicts(state: StudioOfflineConflictState): readonly StudioOfflineBranchConflictDetail[] {
  return studioOfflineBranchPendingOperations(state.snapshot).flatMap((operation) => {
    const conflict = state.snapshot.conflicts[operation.id];
    if (!conflict) return [];
    const pageIndex = state.canonicalPages.findIndex((page) => page.id === operation.pageId);
    const canKeepCanonical = state.writable && operation.actorId === state.actorId
      && !state.snapshot.receipts[operation.id];
    const payloadUnavailable = conflict.code === "payload-missing"
      || conflict.code === "payload-corrupt" || conflict.code === "unsupported"
      || (operation.payloadHash !== null && !state.payloads.has(operation.payloadHash));
    const disabledReasonCode = !state.writable ? "unavailable"
      : operation.actorId !== state.actorId ? "not-owned"
        : state.snapshot.receipts[operation.id] ? "published"
          : !state.canonicalAuthority ? "offline"
            : pageIndex < 0 ? "page-missing" : payloadUnavailable ? "payload-unavailable" : null;
    const disabledReason = !canKeepCanonical
      ? "이미 공유한 작업이거나 현재 사용자에게 속한 변경이 아닙니다."
      : !state.canonicalAuthority
        ? "공유 원고에 연결한 뒤 내 변경을 다시 적용할 수 있습니다."
        : pageIndex < 0 ? "공유 원고에서 페이지가 삭제되어 다시 적용할 수 없습니다."
          : payloadUnavailable ? "변경 자료를 확인할 수 없어 다시 적용할 수 없습니다." : null;
    return [{ operationId: operation.id, pageId: operation.pageId,
      pageName: pageIndex >= 0 ? `${pageIndex + 1}페이지` : "삭제된 페이지",
      pageNumber: pageIndex >= 0 ? pageIndex + 1 : null, disabledReasonCode,
      targetId: operation.targetId, targetType: operation.targetType,
      action: operation.action, code: conflict.code, message: conflict.message,
      canonicalFingerprint: currentStudioOfflineBranchFingerprint(state.canonicalPages, operation),
      canKeepCanonical, canReapplyLocal: disabledReason === null, disabledReason }];
  });
}

interface ResolveContext {
  current(): StudioOfflineConflictState;
  readonly storage: StudioOfflineBranchStorage;
  readonly worker: StudioOfflineBranchWorkerPort;
  readonly payloads: Map<string, Uint8Array>;
  nextOperationTime(): number;
  randomId(): string;
  operationTimeFloor(): number;
  prepareOperation(mutation: StudioOfflinePreparedMutation, id: string, createdAt: number): StudioOfflineBranchOperation;
  persistDocument(snapshot: StudioOfflineBranchSnapshot): Promise<void>;
  restoreFailedWorkerChange(snapshot: StudioOfflineBranchSnapshot, bytes: Uint8Array): Promise<void>;
}

export async function resolveStudioOfflineBranchConflict(
  input: StudioOfflineBranchResolveInput,
  context: ResolveContext,
): Promise<StudioOfflineBranchSnapshot> {
  const detail = describeStudioOfflineBranchConflicts(context.current())
    .find((candidate) => candidate.operationId === input.operationId);
  if (!detail || !detail.canKeepCanonical) throw new Error("이 변경은 이미 처리됐거나 선택할 권한이 없습니다.");
  if (detail.canonicalFingerprint !== input.expectedCanonicalFingerprint) {
    throw new Error("공유 원고가 변경됐습니다. 현재 내용을 확인한 뒤 다시 선택해 주세요.");
  }
  if (input.action !== "keep-canonical" && input.action !== "reapply-local") {
    throw new Error("지원하지 않는 충돌 해결 선택입니다.");
  }
  const operation = context.current().snapshot.operations.find((candidate) => candidate.id === input.operationId);
  if (!operation) throw new Error("선택한 오프라인 변경을 찾지 못했습니다.");
  let replacement: StudioOfflineBranchOperation | null = null;
  if (input.action === "reapply-local") {
    if (!detail.canReapplyLocal) throw new Error(detail.disabledReason ?? "현재 이 변경을 다시 적용할 수 없습니다.");
    const payload = operation.payloadHash ? context.payloads.get(operation.payloadHash) ?? null : null;
    const mutation = prepareStudioOfflineBranchReapplication(context.current().canonicalPages, operation, payload);
    if (mutation) {
      const previousRef = mutation.previousPayload ? await context.storage.putPayload(mutation.previousPayload) : null;
      if (previousRef && mutation.previousPayload) context.payloads.set(previousRef.hash, Uint8Array.from(mutation.previousPayload));
      const createdAt = context.nextOperationTime();
      const id = `offline-op-${context.randomId()}`;
      replacement = { ...context.prepareOperation(mutation, id, createdAt), dedupeKey: `resolution-${fingerprintStudioOfflineBranchValue({
          originalDedupeKey: operation.dedupeKey, expectedFingerprint: mutation.expectedFingerprint,
          resultFingerprint: mutation.resultFingerprint, beforeId: mutation.beforeId,
          previousBeforeId: mutation.previousBeforeId,
        })}`,
        payloadHash: operation.payloadHash, payloadBytes: operation.payloadBytes,
        previousPayloadHash: previousRef?.hash ?? null, previousPayloadBytes: previousRef?.bytes ?? 0 };
    }
    const latest = context.current();
    if (!latest.canonicalAuthority || !latest.writable
      || currentStudioOfflineBranchFingerprint(latest.canonicalPages, operation) !== input.expectedCanonicalFingerprint) {
      throw new Error("공유 원고나 편집 권한이 변경됐습니다. 내용을 다시 확인해 주세요.");
    }
  }
  if (!context.current().writable) throw new Error("오프라인 보관함이 닫히거나 복구 중입니다.");
  const previousSnapshot = context.current().snapshot;
  const previousBytes = await context.worker.save();
  // Worker 왕복 중 원고 세대가 닫히면 새 결정을 적용하지 않는다.
  const commitState = context.current();
  if (!commitState.writable) throw new Error("오프라인 보관함이 닫히거나 복구 중입니다.");
  if (currentStudioOfflineBranchFingerprint(commitState.canonicalPages, operation) !== input.expectedCanonicalFingerprint
    || (input.action === "reapply-local" && !commitState.canonicalAuthority)) {
    throw new Error("공유 원고나 편집 권한이 변경됐습니다. 내용을 다시 확인해 주세요.");
  }
  const resolvedAt = context.operationTimeFloor();
  try {
    const snapshot = await context.worker.resolveConflict({ operationId: operation.id,
      action: replacement ? "reapply-local" : "keep-canonical",
      replacementOperationId: replacement?.id ?? null, actorId: context.current().actorId, resolvedAt }, replacement, resolvedAt);
    await context.persistDocument(snapshot);
    return snapshot;
  } catch (cause) {
    await context.restoreFailedWorkerChange(previousSnapshot, previousBytes);
    throw cause;
  }
}

export function studioOfflineBranchOperationConflict(
  operation: StudioOfflineBranchOperation,
  code: StudioOfflineBranchConflict["code"],
  message: string,
  detectedAt: number,
): StudioOfflineBranchConflict {
  return {
    operationId: operation.id,
    code,
    message: message.slice(0, STUDIO_OFFLINE_BRANCH_LIMITS.maxMessageLength),
    detectedAt,
  };
}


export async function collectStudioOfflineBranchPayloads(
  snapshot: StudioOfflineBranchSnapshot,
  cache: Map<string, Uint8Array>,
  storage: StudioOfflineBranchStorage,
): Promise<readonly { hash: string; bytes: Uint8Array }[]> {
  const hashes = new Set(studioOfflineBranchRetainedPayloadOperations(snapshot)
    .flatMap(studioOfflineBranchOperationPayloadHashes));
  const payloads: Array<{ hash: string; bytes: Uint8Array }> = [];
  for (const hash of hashes) {
    const bytes = cache.get(hash) ?? await storage.getPayload(hash);
    if (!bytes) continue;
    cache.set(hash, Uint8Array.from(bytes));
    payloads.push({ hash, bytes: Uint8Array.from(bytes) });
  }
  return payloads;
}
