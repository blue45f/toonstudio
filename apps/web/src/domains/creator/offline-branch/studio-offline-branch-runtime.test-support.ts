import { StudioOfflineBranchAutomergeEngine } from "./studio-offline-branch-automerge";
import type { CreateStudioOfflineBranchInput, StudioOfflineBranchImportResult } from "./studio-offline-branch-automerge";
import type { StudioOfflineBranchConflict, StudioOfflineBranchOperation, StudioOfflineBranchReceipt, StudioOfflineBranchResolution, StudioOfflineBranchSnapshot } from "./studio-offline-branch-contract";
import type { StudioOfflineBranchStorage } from "./studio-offline-branch-storage";
import type { StudioOfflineBranchWorkerPort } from "./studio-offline-branch-worker-client";

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")).join("")}`;
}

export class MemoryStorage implements StudioOfflineBranchStorage {
  readonly status = {
    durability: "durable" as const,
    message: "test storage",
  };
  failNextSave = false;
  beforeSave: ((bytes: Uint8Array) => Promise<void>) | null = null;
  readonly references = new Set<string>();
  private readonly documents = new Map<string, Uint8Array>();
  private readonly payloads = new Map<string, Uint8Array>();

  private key(scope: string, workId: string): string {
    return `${scope}:${workId}`;
  }

  async loadDocument(scope: string, workId: string): Promise<Uint8Array | null> {
    const value = this.documents.get(this.key(scope, workId));
    return value ? Uint8Array.from(value) : null;
  }

  async saveDocument(
    scope: string,
    workId: string,
    bytes: Uint8Array,
  ): Promise<void> {
    if (this.beforeSave) await this.beforeSave(bytes);
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("기기 저장에 실패했습니다.");
    }
    this.documents.set(this.key(scope, workId), Uint8Array.from(bytes));
  }

  async putPayload(bytes: Uint8Array): Promise<{ hash: `sha256:${string}`; bytes: number }> {
    const hash = await sha256(bytes) as `sha256:${string}`;
    this.payloads.set(hash, Uint8Array.from(bytes));
    return { hash, bytes: bytes.byteLength };
  }

  async getPayload(hash: string): Promise<Uint8Array | null> {
    const value = this.payloads.get(hash);
    return value ? Uint8Array.from(value) : null;
  }

  async setPayloadRefs(_scope: string, _workId: string, hashes: readonly string[]): Promise<void> {
    this.references.clear();
    for (const hash of hashes) this.references.add(hash);
  }

  async deleteDocument(scope: string, workId: string): Promise<void> {
    this.documents.delete(this.key(scope, workId));
  }
}

export class InlineWorker implements StudioOfflineBranchWorkerPort {
  failOpen = false;
  saveCalls = 0;
  private engine: StudioOfflineBranchAutomergeEngine | null = null;

  async open(
    input: CreateStudioOfflineBranchInput,
    bytes: Uint8Array | null,
  ): Promise<StudioOfflineBranchSnapshot> {
    if (this.failOpen) throw new Error("Worker 복구에 실패했습니다.");
    this.engine?.close();
    this.engine = bytes
      ? StudioOfflineBranchAutomergeEngine.load(bytes, input)
      : StudioOfflineBranchAutomergeEngine.create(input);
    return this.engine.snapshot();
  }

  async append(
    operations: readonly StudioOfflineBranchOperation[],
    updatedAt: number,
  ): Promise<{ count: number; snapshot: StudioOfflineBranchSnapshot }> {
    const count = this.requireEngine().append(operations, updatedAt);
    return { count, snapshot: this.requireEngine().snapshot() };
  }

  async recordReceipts(
    receipts: readonly StudioOfflineBranchReceipt[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot> {
    this.requireEngine().recordReceipts(receipts, updatedAt);
    return this.requireEngine().snapshot();
  }

  async recordConflicts(
    conflicts: readonly StudioOfflineBranchConflict[],
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot> {
    this.requireEngine().recordConflicts(conflicts, updatedAt);
    return this.requireEngine().snapshot();
  }

  async resolveConflict(
    resolution: StudioOfflineBranchResolution,
    replacement: StudioOfflineBranchOperation | null,
    updatedAt: number,
  ): Promise<StudioOfflineBranchSnapshot> {
    this.requireEngine().resolveConflict(resolution, replacement, updatedAt);
    return this.requireEngine().snapshot();
  }

  async snapshot(): Promise<StudioOfflineBranchSnapshot> {
    return this.requireEngine().snapshot();
  }

  async save(): Promise<Uint8Array> {
    this.saveCalls += 1;
    return this.requireEngine().save();
  }

  async importPeerDocument(
    bytes: Uint8Array,
    updatedAt: number,
  ): Promise<StudioOfflineBranchImportResult & { snapshot: StudioOfflineBranchSnapshot }> {
    const imported = this.requireEngine().importDocument(bytes, updatedAt);
    return { ...imported, snapshot: this.requireEngine().snapshot() };
  }

  async close(): Promise<void> {
    this.engine?.close();
    this.engine = null;
  }

  private requireEngine(): StudioOfflineBranchAutomergeEngine {
    if (!this.engine) throw new Error("worker is not open");
    return this.engine;
  }
}

export function runtimeOptions(storage: MemoryStorage, actorId = "user-1") {
  let time = 1_000;
  let id = 0;
  return {
    workId: "work-1",
    scope: "user-1",
    actorId,
    canonicalAuthority: false,
    storage,
    worker: new InlineWorker(),
    now: () => ++time,
    randomId: () => `id-${++id}`,
  };
}

