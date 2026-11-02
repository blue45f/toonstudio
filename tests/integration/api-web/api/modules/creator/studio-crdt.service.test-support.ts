import { toUint8Array } from "js-base64";
import { expect } from "vitest";
import * as Y from "yjs";

import { studioCrdtPayloadHash } from "../../../../../../apps/api/src/modules/creator/studio-crdt.repository";
import {
  StudioCrdtService,
  type StudioCrdtRasterAssetAdmission,
  type StudioCrdtWorkAssetAdmission,
} from "../../../../../../apps/api/src/modules/creator/studio-crdt.service";

import type { StudioCrdtClusterLoadRepository } from "../../../../../../apps/api/src/modules/creator/studio-crdt-cluster-load.repository";
import type {
  AppendStudioCrdtUpdateInput,
  AppendStudioCrdtUpdateResult,
  CompactStudioCrdtInput,
  DrizzleStudioCrdtTransaction,
  StudioCrdtHydrationState,
  StudioCrdtRepository,
  StudioCrdtSnapshotRecord,
  StudioCrdtUpdateReceiptRecord,
  StudioCrdtUpdateRecord,
  ValidateStudioCrdtAppend,
} from "../../../../../../apps/api/src/modules/creator/studio-crdt.repository";

// 기존 서비스 테스트의 저장소·생성·정리·복구 helper를 동작 변경 없이 공유한다.
export function copyBytes(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value);
}

export function copyUpdate(update: StudioCrdtUpdateRecord): StudioCrdtUpdateRecord {
  return { ...update, payload: copyBytes(update.payload), createdAt: new Date(update.createdAt) };
}

export class MemoryStudioCrdtRepository implements StudioCrdtRepository {
  readonly snapshots = new Map<string, StudioCrdtSnapshotRecord>();
  readonly updates = new Map<string, StudioCrdtUpdateRecord[]>();
  readonly receipts = new Map<string, StudioCrdtUpdateReceiptRecord>();
  nextSequence = 1n;
  failAppend = false;
  compactCalls = 0;
  beforeAppend: (() => Promise<void>) | null = null;
  readonly validationTransaction = {} as DrizzleStudioCrdtTransaction;
  private readonly mutationTails = new Map<string, Promise<void>>();

  private async withWorkMutation<T>(workId: string, operation: () => Promise<T>): Promise<T> {
    const predecessor = this.mutationTails.get(workId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = predecessor.then(() => gate);
    this.mutationTails.set(workId, tail);
    await predecessor;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.mutationTails.get(workId) === tail) this.mutationTails.delete(workId);
    }
  }

  async loadDocument(workId: string): Promise<StudioCrdtHydrationState> {
    const snapshot = this.snapshots.get(workId) ?? null;
    const compactedSequence = snapshot?.compactedSequence ?? 0n;
    return {
      snapshot: snapshot
        ? { ...snapshot, snapshot: copyBytes(snapshot.snapshot), updatedAt: new Date(snapshot.updatedAt) }
        : null,
      updates: (this.updates.get(workId) ?? [])
        .filter((update) => update.sequence > compactedSequence)
        .map(copyUpdate),
    };
  }

  async loadCatchUp(workId: string, afterSequence: bigint): Promise<StudioCrdtHydrationState> {
    const storedSnapshot = this.snapshots.get(workId) ?? null;
    const snapshot =
      storedSnapshot && storedSnapshot.compactedSequence > afterSequence
        ? {
            ...storedSnapshot,
            snapshot: copyBytes(storedSnapshot.snapshot),
            updatedAt: new Date(storedSnapshot.updatedAt),
          }
        : null;
    const effectiveSequence = snapshot?.compactedSequence ?? afterSequence;
    return {
      snapshot,
      updates: (this.updates.get(workId) ?? [])
        .filter((update) => update.sequence > effectiveSequence)
        .map(copyUpdate),
    };
  }

  async listUpdatesAfter(workId: string, sequence: bigint): Promise<StudioCrdtUpdateRecord[]> {
    return (this.updates.get(workId) ?? [])
      .filter((update) => update.sequence > sequence)
      .map(copyUpdate);
  }

  async appendUpdate(
    input: AppendStudioCrdtUpdateInput,
    validate: ValidateStudioCrdtAppend
  ): Promise<AppendStudioCrdtUpdateResult> {
    await this.beforeAppend?.();
    return this.withWorkMutation(input.workId, async () => {
      if (this.failAppend) throw new Error("write failed");
      const receiptKey = JSON.stringify([input.workId, input.updateId]);
      const existingReceipt = this.receipts.get(receiptKey);
      if (existingReceipt) {
        return {
          inserted: false,
          receipt: {
            ...existingReceipt,
            payloadHash: copyBytes(existingReceipt.payloadHash),
            createdAt: new Date(existingReceipt.createdAt),
          },
        };
      }
      await validate(
        await this.loadDocument(input.workId),
        this.validationTransaction
      );
      const rows = this.updates.get(input.workId) ?? [];
      const update: StudioCrdtUpdateRecord = {
        workId: input.workId,
        sequence: this.nextSequence,
        updateId: input.updateId,
        actorUserId: input.actorUserId,
        payload: copyBytes(input.payload),
        createdAt: new Date(input.createdAt),
      };
      this.nextSequence += 1n;
      rows.push(update);
      this.updates.set(input.workId, rows);
      const receipt: StudioCrdtUpdateReceiptRecord = {
        workId: input.workId,
        updateId: input.updateId,
        sequence: update.sequence,
        actorUserId: input.actorUserId,
        payloadHash: studioCrdtPayloadHash(input.payload),
        createdAt: new Date(input.createdAt),
      };
      this.receipts.set(receiptKey, receipt);
      return {
        inserted: true,
        receipt: {
          ...receipt,
          payloadHash: copyBytes(receipt.payloadHash),
          createdAt: new Date(receipt.createdAt),
        },
      };
    });
  }

  async compact(input: CompactStudioCrdtInput): Promise<boolean> {
    return this.withWorkMutation(input.workId, async () => {
      this.compactCalls += 1;
      const existing = this.snapshots.get(input.workId);
      if (existing && existing.compactedSequence >= input.throughSequence) return false;
      this.snapshots.set(input.workId, {
        workId: input.workId,
        snapshot: copyBytes(input.snapshot),
        compactedSequence: input.throughSequence,
        updatedAt: new Date(input.updatedAt),
      });
      this.updates.set(
        input.workId,
        (this.updates.get(input.workId) ?? []).filter(
          (update) => update.sequence > input.throughSequence
        )
      );
      return true;
    });
  }
}

// Trivially "under budget" by default (readClusterLoad resolves 0), so existing tests that don't
// care about the cluster-wide cap are unaffected by it.
export class MemoryStudioCrdtClusterLoadRepository implements StudioCrdtClusterLoadRepository {
  readonly reportedLoads: Array<{ nodeId: string; pendingOperations: number; now: Date }> = [];
  clusterLoad = 0;
  failReads = false;
  // When set, readClusterLoad suspends until the test resolves it -- used to hold a heartbeat
  // genuinely in-flight (e.g. to test onModuleDestroy racing against it).
  readGate: Promise<void> | undefined;

  async reportLoad(nodeId: string, pendingOperations: number, now: Date): Promise<void> {
    this.reportedLoads.push({ nodeId, pendingOperations, now });
  }

  async readClusterLoad(): Promise<number> {
    if (this.readGate) await this.readGate;
    if (this.failReads) throw new Error("cluster load discovery failed");
    return this.clusterLoad;
  }
}

export const services: StudioCrdtService[] = [];

export const allowStoredRasterAssetReferences: StudioCrdtRasterAssetAdmission = {
  async assertReferencesStored() {
    // Unit tests outside the storage-admission cases exercise the CRDT contract in isolation.
  },
};

export const allowStoredWorkAssetReferences: StudioCrdtWorkAssetAdmission = {
  async assertReferencesStored() {
    // Unit tests outside work-asset storage admission exercise the CRDT contract in isolation.
  },
  async assertR8GrainReferencesStored() {
    // Unit tests outside R8 storage admission exercise the CRDT contract in isolation.
  },
};

export function service(
  repository: MemoryStudioCrdtRepository,
  options: ConstructorParameters<typeof StudioCrdtService>[4] = {},
  rasterAssetAdmission: StudioCrdtRasterAssetAdmission = allowStoredRasterAssetReferences,
  workAssetAdmission: StudioCrdtWorkAssetAdmission = allowStoredWorkAssetReferences,
  clusterLoadRepository: StudioCrdtClusterLoadRepository = new MemoryStudioCrdtClusterLoadRepository()
): StudioCrdtService {
  const created = new StudioCrdtService(
    repository,
    rasterAssetAdmission,
    workAssetAdmission,
    clusterLoadRepository,
    options
  );
  services.push(created);
  return created;
}

export function createScenePageDocument(): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap<boolean>("scene-elements").set("scene-1", true);
  const scene = doc.getMap<unknown>("scene-element:scene-1");
  scene.set("id", "scene-1");
  scene.set("pageId", "page-1");
  scene.set("layerId", "layer-1");
  scene.set("payloadVersion", 1);
  scene.set("type", "text");
  scene.set("deleted", false);
  scene.set("prop:text", "동시에 편집하는 대사");
  scene.set("prop:x", 120);
  scene.set("prop:y", 240);
  scene.set("prop:width", 360);
  scene.set("prop:fontSize", 28);
  scene.set("prop:fill", "#111111");
  scene.set("prop:rotation", 0);
  scene.set("unset:font", false);

  const sceneOrder = new Y.Map<unknown>();
  sceneOrder.set("elementId", "scene-1");
  sceneOrder.set("pageId", "page-1");
  sceneOrder.set("layerId", "layer-1");
  sceneOrder.set("kind", "scene");
  sceneOrder.set("active", true);
  doc.getArray<Y.Map<unknown>>("stroke-order").push([sceneOrder]);

  doc.getMap<boolean>("studio-pages").set("page-1", true);
  const page = doc.getMap<unknown>("studio-page:page-1");
  page.set("id", "page-1");
  page.set("payloadVersion", 1);
  page.set("deleted", false);
  page.set("prop:bg", "#ffffff");
  page.set("prop:bgGrad", null);
  page.set("prop:canvasH", 1080);
  const pageOrder = new Y.Map<unknown>();
  pageOrder.set("pageId", "page-1");
  pageOrder.set("active", true);
  doc.getArray<Y.Map<unknown>>("page-order").push([pageOrder]);
  return doc;
}

export function syncBytes(sync: Awaited<ReturnType<StudioCrdtService["sync"]>>): Uint8Array {
  const result = new Uint8Array(sync.totalBytes);
  let offset = 0;
  for (const chunk of sync.chunks) {
    const decoded = toUint8Array(chunk);
    result.set(decoded, offset);
    offset += decoded.byteLength;
  }
  expect(offset).toBe(sync.totalBytes);
  expect(sync.chunkCount).toBe(sync.chunks.length);
  return result;
}

export function applySync(
  target: Y.Doc,
  sync: Awaited<ReturnType<StudioCrdtService["sync"]>>
): void {
  Y.applyUpdate(target, syncBytes(sync));
}

