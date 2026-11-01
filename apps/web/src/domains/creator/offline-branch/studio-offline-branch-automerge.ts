import * as Automerge from "@automerge/automerge/slim";
import * as automergeWasmBase64Module from "@automerge/automerge/automerge.wasm.base64";

import {
  STUDIO_OFFLINE_BRANCH_LIMITS,
  STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION,
  STUDIO_OFFLINE_BRANCH_DOCUMENT_VERSION,
  isStudioOfflineBranchIdentifier,
  parseStudioOfflineBranchOperation,
  type StudioOfflineBranchConflict,
  type StudioOfflineBranchDocument,
  type StudioOfflineBranchMetadata,
  type StudioOfflineBranchOperation,
  type StudioOfflineBranchReceipt,
  type StudioOfflineBranchResolution,
  type StudioOfflineBranchSnapshot,
} from "./studio-offline-branch-contract";
import {
  assertStudioOfflineBranchResolutions,
  sameStudioOfflineBranchResolutionMeaning as sameResolutionMeaning,
  validStudioOfflineBranchReplacement as validReplacement,
  validStudioOfflineBranchResolution as validResolution,
} from "./studio-offline-branch-resolution-validation";

type EncodedAutomergeWasmSource = string | (() => string);

function resolveAutomergeWasmBase64(): string {
  const moduleRecord = automergeWasmBase64Module as unknown as {
    readonly automergeWasmBase64?: EncodedAutomergeWasmSource;
    readonly init?: EncodedAutomergeWasmSource;
    readonly default?: EncodedAutomergeWasmSource;
  };
  const source = moduleRecord.automergeWasmBase64
    ?? moduleRecord.init
    ?? moduleRecord.default;
  const encoded = typeof source === "function" ? source() : source;
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("Automerge WASM base64 source is unavailable");
  }
  return encoded;
}

let automergeInitialization: Promise<void> | null = null;

export function initializeStudioOfflineBranchAutomerge(): Promise<void> {
  if (Automerge.isWasmInitialized()) return Promise.resolve();
  if (!automergeInitialization) {
    automergeInitialization = Automerge.initializeBase64Wasm(resolveAutomergeWasmBase64())
      .catch((cause: unknown) => {
        automergeInitialization = null;
        throw cause;
      });
  }
  return automergeInitialization;
}

export interface CreateStudioOfflineBranchInput {
  readonly id: string;
  readonly workId: string;
  readonly scope: string;
  readonly actorId: string;
  readonly baseRevision?: string | null;
  readonly createdAt: number;
}

export interface StudioOfflineBranchImportResult {
  readonly changed: boolean;
  readonly replyNeeded: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoConflicts(
  object: object,
  keys: readonly string[],
  label: string,
): void {
  for (const key of keys) {
    const conflicts = Automerge.getConflicts(object as never, key as never);
    if (conflicts && Object.keys(conflicts).length > 0) {
      if (label === "offline branch resolutions") {
        throw new Error("충돌 처리 기록 자체에 서로 다른 선택이 있습니다. 원본 변경을 그대로 보존했습니다.");
      }
      throw new Error(`${label} contains unresolved Automerge conflicts`);
    }
  }
}

function assertMetadata(value: unknown): asserts value is StudioOfflineBranchMetadata {
  if (!record(value)) throw new Error("offline branch metadata is missing");
  if (
    !isStudioOfflineBranchIdentifier(value.id)
    || !isStudioOfflineBranchIdentifier(value.workId)
    || !isStudioOfflineBranchIdentifier(value.scope)
    || !isStudioOfflineBranchIdentifier(value.actorId)
    || !Number.isSafeInteger(value.epoch)
    || Number(value.epoch) < 1
    || !(value.baseRevision === null || isStudioOfflineBranchIdentifier(value.baseRevision))
    || !Number.isSafeInteger(value.createdAt)
    || !Number.isSafeInteger(value.updatedAt)
    || Number(value.createdAt) < 0
    || Number(value.updatedAt) < Number(value.createdAt)
    || !["editing", "syncing", "conflicted", "merged"].includes(String(value.state))
  ) throw new Error("offline branch metadata is invalid");
}

function validReceipt(value: unknown, operationId: string): value is StudioOfflineBranchReceipt {
  if (!record(value) || value.operationId !== operationId) return false;
  if (
    (value.state !== "canonical-local" && value.state !== "server")
    || !isStudioOfflineBranchIdentifier(value.yjsUpdateId)
    || !Number.isSafeInteger(value.appliedAt)
    || Number(value.appliedAt) < 0
  ) return false;
  if (value.state === "canonical-local") return value.serverSequence === null;
  return typeof value.serverSequence === "string"
    && /^[0-9]+$/u.test(value.serverSequence);
}

function validConflict(value: unknown, operationId: string): value is StudioOfflineBranchConflict {
  if (!record(value) || value.operationId !== operationId) return false;
  return [
    "target-changed",
    "target-missing",
    "target-exists",
    "payload-missing",
    "payload-corrupt",
    "unsupported",
  ].includes(String(value.code))
    && typeof value.message === "string"
    && value.message.length > 0
    && value.message.length <= STUDIO_OFFLINE_BRANCH_LIMITS.maxMessageLength
    && Number.isSafeInteger(value.detectedAt)
    && Number(value.detectedAt) >= 0;
}

function assertDocument(doc: StudioOfflineBranchDocument): Uint8Array {
  if (doc.schemaVersion !== STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION
    && doc.schemaVersion !== STUDIO_OFFLINE_BRANCH_DOCUMENT_VERSION) {
    throw new Error("offline branch schema version is unsupported");
  }
  if (doc.schemaVersion === STUDIO_OFFLINE_BRANCH_DOCUMENT_VERSION && !record(doc.resolutions)) {
    throw new Error("오프라인 충돌 처리 지원 문서에 처리 기록이 없습니다.");
  }
  assertNoConflicts(doc, [
    "schemaVersion",
    "branch",
    "operations",
    "dedupe",
    "receipts",
    "conflicts",
    ...(doc.resolutions === undefined ? [] : ["resolutions"]),
  ], "offline branch root");
  assertMetadata(doc.branch);
  assertNoConflicts(doc.branch, [
    "id",
    "workId",
    "scope",
    "actorId",
    "epoch",
    "baseRevision",
    "createdAt",
    "updatedAt",
    "state",
  ], "offline branch metadata");
  if (
    !record(doc.operations)
    || !record(doc.dedupe)
    || !record(doc.receipts)
    || !record(doc.conflicts)
  ) throw new Error("offline branch document roots are invalid");

  const operations = Object.entries(doc.operations);
  if (operations.length > STUDIO_OFFLINE_BRANCH_LIMITS.maxOperations) {
    throw new Error("offline branch operation budget is exceeded");
  }
  assertNoConflicts(doc.operations, operations.map(([id]) => id), "offline branch operations");
  for (const [id, candidate] of operations) {
    const operation = parseStudioOfflineBranchOperation(candidate);
    if (!operation || operation.id !== id || doc.dedupe[operation.dedupeKey] !== id) {
      throw new Error("offline branch operation is invalid");
    }
  }

  const dedupeEntries = Object.entries(doc.dedupe);
  assertNoConflicts(doc.dedupe, dedupeEntries.map(([key]) => key), "offline branch dedupe index");
  for (const [key, operationId] of dedupeEntries) {
    if (
      !isStudioOfflineBranchIdentifier(key)
      || !isStudioOfflineBranchIdentifier(operationId)
      || doc.operations[operationId]?.dedupeKey !== key
    ) throw new Error("offline branch dedupe index is invalid");
  }

  const receiptEntries = Object.entries(doc.receipts);
  assertNoConflicts(doc.receipts, receiptEntries.map(([id]) => id), "offline branch receipts");
  for (const [operationId, receipt] of receiptEntries) {
    if (!doc.operations[operationId] || !validReceipt(receipt, operationId)) {
      throw new Error("offline branch receipt is invalid");
    }
  }

  const conflictEntries = Object.entries(doc.conflicts);
  assertNoConflicts(doc.conflicts, conflictEntries.map(([id]) => id), "offline branch conflicts");
  for (const [operationId, conflict] of conflictEntries) {
    if (
      !doc.operations[operationId]
      || doc.receipts[operationId]?.state === "server"
      || doc.resolutions?.[operationId] !== undefined
      || !validConflict(conflict, operationId)
    ) throw new Error("offline branch conflict is invalid");
  }

  assertStudioOfflineBranchResolutions(doc, assertNoConflicts);

  const bytes = Automerge.save(doc as Automerge.Doc<StudioOfflineBranchDocument>);
  if (bytes.byteLength === 0 || bytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxDocumentBytes) {
    throw new Error("offline branch document byte budget is exceeded");
  }
  return bytes;
}

function loadAndUpgradeDocument(bytes: Uint8Array): Automerge.Doc<StudioOfflineBranchDocument> {
  let document = Automerge.load<StudioOfflineBranchDocument>(bytes, { freeze: true });
  try {
    assertDocument(document);
    if (document.schemaVersion === STUDIO_OFFLINE_BRANCH_SCHEMA_VERSION) {
      document = Automerge.change(document, { message: "오프라인 문서의 충돌 처리 지원 버전 갱신" }, (draft) => {
        draft.schemaVersion = STUDIO_OFFLINE_BRANCH_DOCUMENT_VERSION;
        draft.resolutions ??= {};
      });
      assertDocument(document);
    }
    return document;
  } catch (cause) {
    Automerge.free(document);
    throw cause;
  }
}

function initialDocument(input: CreateStudioOfflineBranchInput): StudioOfflineBranchDocument {
  for (const value of [input.id, input.workId, input.scope, input.actorId]) {
    if (!isStudioOfflineBranchIdentifier(value)) {
      throw new Error("offline branch identity is invalid");
    }
  }
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
    throw new Error("offline branch creation time is invalid");
  }
  return {
    schemaVersion: STUDIO_OFFLINE_BRANCH_DOCUMENT_VERSION,
    branch: {
      id: input.id,
      workId: input.workId,
      scope: input.scope,
      actorId: input.actorId,
      epoch: 1,
      baseRevision: input.baseRevision ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      state: "editing",
    },
    operations: {},
    dedupe: {},
    receipts: {},
    conflicts: {},
    resolutions: {},
  };
}

function sameOperation(
  left: StudioOfflineBranchOperation,
  right: StudioOfflineBranchOperation,
  includeIdentity: boolean,
): boolean {
  return (!includeIdentity || (
    left.id === right.id
    && left.actorId === right.actorId
    && left.createdAt === right.createdAt
  ))
    && left.version === right.version
    && left.dedupeKey === right.dedupeKey
    && left.targetType === right.targetType
    && left.action === right.action
    && left.targetId === right.targetId
    && left.pageId === right.pageId
    && left.layerId === right.layerId
    && left.beforeId === right.beforeId
    && left.previousBeforeId === right.previousBeforeId
    && left.expectedFingerprint === right.expectedFingerprint
    && left.resultFingerprint === right.resultFingerprint
    && left.payloadHash === right.payloadHash
    && left.payloadBytes === right.payloadBytes
    && left.previousPayloadHash === right.previousPayloadHash
    && left.previousPayloadBytes === right.previousPayloadBytes;
}

function receiptRank(receipt: StudioOfflineBranchReceipt | undefined): number {
  if (!receipt) return 0;
  return receipt.state === "server" ? 2 : 1;
}

function compareServerSequence(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function preferredReceipt(
  current: StudioOfflineBranchReceipt | undefined,
  incoming: StudioOfflineBranchReceipt | undefined,
): StudioOfflineBranchReceipt | undefined {
  if (!incoming) return current;
  if (!current) return incoming;
  const rank = receiptRank(incoming) - receiptRank(current);
  if (rank !== 0) return rank > 0 ? incoming : current;
  const sequence = compareServerSequence(incoming.serverSequence, current.serverSequence);
  if (sequence !== 0) return sequence > 0 ? incoming : current;
  return incoming.appliedAt > current.appliedAt ? incoming : current;
}

function branchState(doc: StudioOfflineBranchDocument): StudioOfflineBranchMetadata["state"] {
  if (Object.keys(doc.conflicts).length > 0) return "conflicted";
  const operationIds = Object.keys(doc.operations).filter((id) => !doc.resolutions?.[id]);
  if (Object.keys(doc.operations).length > 0 && operationIds.length === 0) return "merged";
  if (operationIds.length === 0) return "editing";
  if (operationIds.every((id) => doc.receipts[id]?.state === "server")) return "merged";
  if (operationIds.some((id) => doc.receipts[id] !== undefined)) return "syncing";
  return "editing";
}

function sortedOperations(doc: StudioOfflineBranchDocument): StudioOfflineBranchOperation[] {
  return Object.values(doc.operations)
    .map((operation) => parseStudioOfflineBranchOperation(operation))
    .filter((operation): operation is StudioOfflineBranchOperation => operation !== null)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export class StudioOfflineBranchAutomergeEngine {
  private document: Automerge.Doc<StudioOfflineBranchDocument>;
  private readonly localActorId: string;

  private acceptValidatedChange(
    next: Automerge.Doc<StudioOfflineBranchDocument>,
    previousBytes: Uint8Array,
  ): void {
    try {
      assertDocument(next);
    } catch (cause) {
      // 변경 뒤의 용량·연결 검증이 실패해도 기존 journal을 다시 쓸 수 있는 상태로 복구한다.
      Automerge.free(next);
      this.document = Automerge.load<StudioOfflineBranchDocument>(previousBytes, { freeze: true });
      throw cause;
    }
    this.document = next;
  }

  private constructor(
    document: Automerge.Doc<StudioOfflineBranchDocument>,
    localActorId: string,
  ) {
    assertDocument(document);
    if (!isStudioOfflineBranchIdentifier(localActorId)) {
      throw new Error("offline branch local actor is invalid");
    }
    this.document = document;
    this.localActorId = localActorId;
  }

  static create(input: CreateStudioOfflineBranchInput): StudioOfflineBranchAutomergeEngine {
    const document = Automerge.from<StudioOfflineBranchDocument>(
      initialDocument(input),
      { freeze: true },
    );
    return new StudioOfflineBranchAutomergeEngine(document, input.actorId);
  }

  static load(
    bytes: Uint8Array,
    expected: Pick<CreateStudioOfflineBranchInput, "workId" | "scope" | "actorId">,
  ): StudioOfflineBranchAutomergeEngine {
    if (
      !(bytes instanceof Uint8Array)
      || bytes.byteLength === 0
      || bytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxDocumentBytes
    ) throw new Error("offline branch document bytes are invalid");
    const document = loadAndUpgradeDocument(bytes);
    if (document.branch.workId !== expected.workId || document.branch.scope !== expected.scope) {
      Automerge.free(document);
      throw new Error("offline branch document belongs to another work or user scope");
    }
    return new StudioOfflineBranchAutomergeEngine(document, expected.actorId);
  }

  append(operations: readonly StudioOfflineBranchOperation[], updatedAt: number): number {
    if (!Number.isSafeInteger(updatedAt) || updatedAt < this.document.branch.updatedAt) {
      throw new Error("offline branch update time is invalid");
    }
    const accepted: StudioOfflineBranchOperation[] = [];
    for (const candidate of operations) {
      const parsed = parseStudioOfflineBranchOperation(candidate);
      if (!parsed || parsed.actorId !== this.localActorId) {
        throw new Error("offline branch operation is invalid for this local actor");
      }
      const existingById = this.document.operations[parsed.id];
      if (existingById) {
        if (!sameOperation(existingById, parsed, true)) {
          throw new Error("offline branch operation id collision");
        }
        continue;
      }
      const existingDedupeId = this.document.dedupe[parsed.dedupeKey];
      if (existingDedupeId) {
        const existing = this.document.operations[existingDedupeId];
        if (!existing || !sameOperation(existing, parsed, false)) {
          throw new Error("offline branch semantic dedupe collision");
        }
        continue;
      }
      accepted.push(parsed);
    }
    if (accepted.length === 0) return 0;
    if (
      Object.keys(this.document.operations).length + accepted.length
      > STUDIO_OFFLINE_BRANCH_LIMITS.maxOperations
    ) throw new Error("offline branch operation budget is exceeded");

    const next = Automerge.change(this.document, {
      message: `append ${accepted.length} offline drawing operations`,
      time: Math.floor(updatedAt / 1_000),
    }, (draft) => {
      for (const operation of accepted) {
        draft.operations[operation.id] = operation;
        draft.dedupe[operation.dedupeKey] = operation.id;
        delete draft.conflicts[operation.id];
      }
      draft.branch.updatedAt = updatedAt;
      draft.branch.state = branchState(draft as StudioOfflineBranchDocument);
    });
    assertDocument(next);
    this.document = next;
    return accepted.length;
  }

  recordReceipts(
    receipts: readonly StudioOfflineBranchReceipt[],
    updatedAt: number,
  ): void {
    if (receipts.length === 0) return;
    for (const receipt of receipts) {
      if (this.document.resolutions?.[receipt.operationId]) {
        throw new Error("이미 처리한 오프라인 변경에 정본 수신 확인을 추가할 수 없습니다. 원본 변경은 보존돼 있습니다.");
      }
      if (!this.document.operations[receipt.operationId]
        || !validReceipt(receipt, receipt.operationId)) {
        throw new Error("offline branch receipt cannot be attached");
      }
    }
    const next = Automerge.change(this.document, {
      message: `record ${receipts.length} canonical receipts`,
      time: Math.floor(updatedAt / 1_000),
    }, (draft) => {
      for (const receipt of receipts) {
        const selected = preferredReceipt(this.document.receipts[receipt.operationId], receipt);
        if (selected) draft.receipts[receipt.operationId] = selected;
        if (selected?.state === "server") delete draft.conflicts[receipt.operationId];
      }
      draft.branch.updatedAt = Math.max(draft.branch.updatedAt, updatedAt);
      draft.branch.state = branchState(draft as StudioOfflineBranchDocument);
    });
    assertDocument(next);
    this.document = next;
  }

  recordConflicts(
    conflicts: readonly StudioOfflineBranchConflict[],
    updatedAt: number,
  ): void {
    if (conflicts.length === 0) return;
    for (const conflict of conflicts) {
      if (!this.document.operations[conflict.operationId] || !validConflict(conflict, conflict.operationId)) {
        throw new Error("offline branch conflict cannot be attached");
      }
    }
    const next = Automerge.change(this.document, {
      message: `record ${conflicts.length} offline merge conflicts`,
      time: Math.floor(updatedAt / 1_000),
    }, (draft) => {
      for (const conflict of conflicts) {
        if (this.document.receipts[conflict.operationId]?.state === "server") continue;
        if (this.document.resolutions?.[conflict.operationId]) continue;
        const current = this.document.conflicts[conflict.operationId];
        if (!current || conflict.detectedAt >= current.detectedAt) {
          draft.conflicts[conflict.operationId] = conflict;
        }
      }
      draft.branch.updatedAt = Math.max(draft.branch.updatedAt, updatedAt);
      draft.branch.state = branchState(draft as StudioOfflineBranchDocument);
    });
    assertDocument(next);
    this.document = next;
  }

  resolveConflict(
    resolution: StudioOfflineBranchResolution,
    replacement: StudioOfflineBranchOperation | null,
    updatedAt: number,
  ): StudioOfflineBranchSnapshot {
    const original = this.document.operations[resolution.operationId];
    if (!original || !validResolution(resolution, original.id)
      || original.actorId !== this.localActorId || resolution.actorId !== this.localActorId
      || !Number.isSafeInteger(updatedAt) || updatedAt < 0
      || resolution.resolvedAt < original.createdAt || resolution.resolvedAt > updatedAt) {
      throw new Error("충돌 처리 요청의 사용자 또는 시각 정보가 올바르지 않습니다.");
    }
    const existing = this.document.resolutions?.[original.id];
    if (existing) {
      if (existing.action !== resolution.action) {
        throw new Error("이미 저장된 선택과 다른 요청입니다. 현재 기기의 선택과 원본 변경을 그대로 보존했습니다.");
      }
      return this.snapshot();
    }
    if (!this.document.conflicts[original.id] || this.document.receipts[original.id]
      || updatedAt < this.document.branch.updatedAt) {
      throw new Error("이미 정본에 전달됐거나 더 이상 유효하지 않은 충돌입니다. 원본 변경을 그대로 보존했습니다.");
    }
    const parsed = replacement === null ? null : parseStudioOfflineBranchOperation(replacement);
    if (resolution.action === "keep-canonical") {
      if (replacement !== null) throw new Error("정본 유지 선택에는 새 재적용 작업을 함께 보관할 수 없습니다.");
    } else if (!parsed || parsed.id !== resolution.replacementOperationId
      || !validReplacement(original, parsed) || parsed.createdAt > updatedAt
      || this.document.operations[parsed.id] || this.document.dedupe[parsed.dedupeKey]) {
      throw new Error("재적용 작업의 대상 또는 결과가 원본 변경과 일치하지 않습니다.");
    }
    if (parsed && Object.keys(this.document.operations).length >= STUDIO_OFFLINE_BRANCH_LIMITS.maxOperations) {
      throw new Error("오프라인 작업 보관 한도를 초과해 재적용하지 못했습니다. 원본 변경은 보존돼 있습니다.");
    }
    const previousBytes = this.save();
    const next = Automerge.change(this.document, {
      message: "오프라인 충돌에 대한 사용자 선택 보관",
      time: Math.floor(updatedAt / 1_000),
    }, (draft) => {
      if (parsed) {
        draft.operations[parsed.id] = parsed;
        draft.dedupe[parsed.dedupeKey] = parsed.id;
      }
      draft.resolutions ??= {};
      draft.resolutions[original.id] = resolution;
      delete draft.conflicts[original.id];
      draft.branch.updatedAt = updatedAt;
      draft.branch.state = branchState(draft as StudioOfflineBranchDocument);
    });
    this.acceptValidatedChange(next, previousBytes);
    return this.snapshot();
  }

  importDocument(bytes: Uint8Array, updatedAt: number): StudioOfflineBranchImportResult {
    if (
      !(bytes instanceof Uint8Array)
      || bytes.byteLength === 0
      || bytes.byteLength > STUDIO_OFFLINE_BRANCH_LIMITS.maxDocumentBytes
      || !Number.isSafeInteger(updatedAt)
      || updatedAt < 0
    ) throw new Error("offline branch peer document is invalid");
    const remote = loadAndUpgradeDocument(bytes);
    try {
    assertDocument(remote);
    if (
      remote.branch.workId !== this.document.branch.workId
      || remote.branch.scope !== this.document.branch.scope
    ) throw new Error("offline branch peer document crossed its work or user scope");

    const remoteOperations = sortedOperations(remote);
    const remoteByDedupe = new Map(remoteOperations.map((operation) => [operation.dedupeKey, operation]));
    let replyNeeded = false;
    for (const local of sortedOperations(this.document)) {
      const peer = remoteByDedupe.get(local.dedupeKey);
      if (!peer || !sameOperation(local, peer, false)) {
        replyNeeded = true;
        break;
      }
      const localReceipt = this.document.receipts[local.id];
      const peerReceipt = remote.receipts[peer.id];
      const localResolution = this.document.resolutions?.[local.id];
      const peerResolution = remote.resolutions?.[peer.id];
      if (localResolution && !peerResolution) {
        replyNeeded = true;
        break;
      }
      if (preferredReceipt(peerReceipt, localReceipt) === localReceipt && localReceipt !== peerReceipt) {
        replyNeeded = true;
        break;
      }
      if (
        this.document.conflicts[local.id]
        && !remote.conflicts[peer.id]
        && localReceipt?.state !== "server"
      ) {
        replyNeeded = true;
        break;
      }
    }

    const accepted: StudioOfflineBranchOperation[] = [];
    const idMap = new Map<string, string>();
    for (const operation of remoteOperations) {
      const existingById = this.document.operations[operation.id];
      if (existingById) {
        if (!sameOperation(existingById, operation, true)) {
          throw new Error("offline branch peer operation id collision");
        }
        idMap.set(operation.id, existingById.id);
        continue;
      }
      const existingDedupeId = this.document.dedupe[operation.dedupeKey];
      if (existingDedupeId) {
        const existing = this.document.operations[existingDedupeId];
        if (!existing || !sameOperation(existing, operation, false)) {
          throw new Error("offline branch peer semantic dedupe collision");
        }
        idMap.set(operation.id, existing.id);
        continue;
      }
      accepted.push(operation);
      idMap.set(operation.id, operation.id);
    }
    if (
      Object.keys(this.document.operations).length + accepted.length
      > STUDIO_OFFLINE_BRANCH_LIMITS.maxOperations
    ) throw new Error("offline branch operation budget is exceeded");

    // 모든 결정을 먼저 검증한다. 경합을 발견하면 replacement를 포함한 어떤 피어 작업도 반영하지 않는다.
    const resolutionUpdates: StudioOfflineBranchResolution[] = [];
    const selectedResolutions = new Map(Object.entries(this.document.resolutions ?? {}));
    const mergedOperations = new Map(Object.entries(this.document.operations));
    for (const operation of accepted) mergedOperations.set(operation.id, operation);
    for (const resolution of Object.values(remote.resolutions ?? {})) {
      const operationId = idMap.get(resolution.operationId);
      const replacementOperationId = resolution.replacementOperationId
        ? idMap.get(resolution.replacementOperationId)
        : null;
      if (!operationId || (resolution.replacementOperationId && !replacementOperationId)) {
        throw new Error("다른 기기의 충돌 처리 기록이 올바른 원본 작업을 가리키지 않습니다.");
      }
      const mapped: StudioOfflineBranchResolution = {
        ...resolution,
        operationId,
        replacementOperationId: replacementOperationId ?? null,
      };
      const original = mergedOperations.get(operationId);
      if (!original || original.actorId !== mapped.actorId || this.document.receipts[operationId]) {
        throw new Error("다른 기기의 충돌 처리 기록이 사용자 또는 정본 수신 확인 경계와 일치하지 않습니다. 현재 기기의 선택과 원본 변경을 그대로 보존했습니다.");
      }
      const current = selectedResolutions.get(operationId);
      if (current && !sameResolutionMeaning(current, mapped)) {
        throw new Error("두 기기의 충돌 처리 선택이 다릅니다. 현재 기기의 선택과 원본 변경을 그대로 보존했으며 다른 기기의 변경도 부분 반영하지 않았습니다.");
      }
      if (!current) {
        resolutionUpdates.push(mapped);
        selectedResolutions.set(operationId, mapped);
      }
    }

    const receiptUpdates: StudioOfflineBranchReceipt[] = [];
    const conflictUpdates: StudioOfflineBranchConflict[] = [];
    for (const operation of remoteOperations) {
      const localId = idMap.get(operation.id)!;
      const incomingReceipt = remote.receipts[operation.id];
      if (incomingReceipt) {
        if (selectedResolutions.has(localId)) {
          throw new Error("다른 기기의 정본 수신 확인이 저장된 충돌 처리 선택과 충돌합니다. 현재 기기의 선택과 원본 변경을 그대로 보존했습니다.");
        }
        const mapped = { ...incomingReceipt, operationId: localId };
        const current = this.document.receipts[localId];
        const selected = preferredReceipt(current, mapped);
        if (selected === mapped && selected !== current) receiptUpdates.push(mapped);
      }
      const incomingConflict = remote.conflicts[operation.id];
      if (
        incomingConflict
        && !selectedResolutions.has(localId)
        && preferredReceipt(this.document.receipts[localId], incomingReceipt)?.state !== "server"
      ) {
        const mapped = { ...incomingConflict, operationId: localId };
        const current = this.document.conflicts[localId];
        if (!current || mapped.detectedAt > current.detectedAt) conflictUpdates.push(mapped);
      }
    }

    if (accepted.length === 0 && receiptUpdates.length === 0 && conflictUpdates.length === 0
      && resolutionUpdates.length === 0) {
      Automerge.free(remote);
      return { changed: false, replyNeeded };
    }
    let adoptedUpdatedAt = Math.max(this.document.branch.updatedAt, remote.branch.updatedAt, updatedAt);
    for (const operation of accepted) adoptedUpdatedAt = Math.max(adoptedUpdatedAt, operation.createdAt);
    for (const resolution of selectedResolutions.values()) {
      adoptedUpdatedAt = Math.max(adoptedUpdatedAt, resolution.resolvedAt);
    }
    const previousBytes = this.save();
    const next = Automerge.change(this.document, {
      message: `import ${accepted.length} peer offline operations`,
      time: Math.floor(updatedAt / 1_000),
    }, (draft) => {
      for (const operation of accepted) {
        draft.operations[operation.id] = operation;
        draft.dedupe[operation.dedupeKey] = operation.id;
      }
      for (const receipt of receiptUpdates) {
        draft.receipts[receipt.operationId] = receipt;
        if (receipt.state === "server") delete draft.conflicts[receipt.operationId];
      }
      for (const conflict of conflictUpdates) {
        if (draft.receipts[conflict.operationId]?.state !== "server"
          && !draft.resolutions?.[conflict.operationId]) {
          draft.conflicts[conflict.operationId] = conflict;
        }
      }
      for (const resolution of resolutionUpdates) {
        draft.resolutions ??= {};
        draft.resolutions[resolution.operationId] = resolution;
        delete draft.conflicts[resolution.operationId];
      }
      draft.branch.updatedAt = adoptedUpdatedAt;
      draft.branch.state = branchState(draft as StudioOfflineBranchDocument);
    });
    this.acceptValidatedChange(next, previousBytes);
    Automerge.free(remote);
    return { changed: true, replyNeeded };
    } catch (cause) {
      Automerge.free(remote);
      throw cause;
    }
  }

  snapshot(): StudioOfflineBranchSnapshot {
    const bytes = assertDocument(this.document);
    return {
      branch: { ...this.document.branch },
      heads: [...Automerge.getHeads(this.document)].sort(),
      operations: sortedOperations(this.document),
      receipts: structuredClone(this.document.receipts),
      conflicts: structuredClone(this.document.conflicts),
      resolutions: structuredClone(this.document.resolutions ?? {}),
      documentBytes: bytes.byteLength,
    };
  }

  save(): Uint8Array {
    return Uint8Array.from(assertDocument(this.document));
  }

  close(): void {
    Automerge.free(this.document);
  }
}
