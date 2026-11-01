import type {
  StudioCrdtDocument,
  StudioCrdtDrawStrokePayload,
} from "./studio-crdt-document";
import type { StudioCrdtOutbox } from "./studio-crdt-outbox";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  decodeStudioCrdtStateVector,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtStateVector,
  encodeStudioCrdtSyncChunks,
  type StudioCrdtRemoteUpdate,
  type StudioCrdtSyncRequest,
  type StudioCrdtSyncResponse,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";

import type {
  PreserveStudioCrdtRecoveryFrontierInput,
  PreserveStudioCrdtRejectionMarkerInput,
  StudioCrdtPermanentRejectionMarker,
  StudioCrdtRecoveryVault,
  StudioCrdtRecoveryVaultEntry,
} from "./studio-crdt-recovery-vault";
import type {
  StudioLiveCrdtRoomEvent,
  StudioLiveRoom,
  StudioLiveRoomEvent,
} from "./studio-live-collaboration-room";

function payload(x: number): StudioCrdtDrawStrokePayload {
  return {
    version: 1,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [x, x, x + 1, x + 1],
    pressures: [0.4, 0.8],
    stroke: "#123456",
    strokeWidth: 6,
  };
}

export function add(document: StudioCrdtDocument, id: string, x: number): void {
  document.addStroke({
    id,
    pageId: "page-a",
    layerId: "page-root",
    payload: payload(x),
  });
}

export class FakeRoom {
  ready = true;
  readonly mode: "local" | "server";
  crdtFanout?: "authoritative" | "mesh" | "none";
  workId = "work-a";
  readonly participant = { sessionId: "self", displayName: "Me", role: "editor" as const };
  readonly crdtListeners = new Set<(event: StudioLiveCrdtRoomEvent) => void>();
  readonly roomListeners = new Set<(event: StudioLiveRoomEvent) => void>();
  readonly publications: StudioCrdtUpdateRequest[] = [];
  readonly syncResponses: Array<{ response: StudioCrdtSyncResponse; sessionId: string }> = [];
  server: StudioCrdtDocument;
  failuresRemaining = 0;
  nextPublishError: Error | null = null;
  nextSyncError: Error | null = null;
  nextSyncBarrier: Promise<void> | null = null;
  syncFailuresRemaining = 0;
  hangPublications = false;
  publishBarrier: Promise<void> | null = null;
  serverSequence = 0;
  syncRequests = 0;

  constructor(server: StudioCrdtDocument, mode: "local" | "server" = "server") {
    this.server = server;
    this.mode = mode;
  }

  subscribeCrdt(listener: (event: StudioLiveCrdtRoomEvent) => void): () => void {
    this.crdtListeners.add(listener);
    return () => this.crdtListeners.delete(listener);
  }

  subscribe(listener: (event: StudioLiveRoomEvent) => void): () => void {
    this.roomListeners.add(listener);
    return () => this.roomListeners.delete(listener);
  }

  async requestCrdtSync(request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse> {
    this.syncRequests += 1;
    const syncBarrier = this.nextSyncBarrier;
    this.nextSyncBarrier = null;
    if (syncBarrier) await syncBarrier;
    if (this.nextSyncError) {
      const error = this.nextSyncError;
      this.nextSyncError = null;
      throw error;
    }
    if (this.syncFailuresRemaining > 0) {
      this.syncFailuresRemaining -= 1;
      throw new Error("temporary sync failure");
    }
    const diff = this.server.encodeStateAsUpdate(decodeStudioCrdtStateVector(request.stateVector));
    const response: StudioCrdtSyncResponse = {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: this.workId,
      requestId: request.requestId,
      transferId: "11111111-1111-4111-8111-111111111111",
      chunks: encodeStudioCrdtSyncChunks(diff),
      chunkCount: encodeStudioCrdtSyncChunks(diff).length,
      totalBytes: diff.byteLength,
      serverStateVector: encodeStudioCrdtStateVector(this.server.encodeStateVector()),
      serverSequence: String(this.serverSequence),
    };
    for (const listener of this.crdtListeners) {
      listener({ type: "sync-response", response, senderSessionId: null });
    }
    return response;
  }

  async publishCrdtUpdate(request: StudioCrdtUpdateRequest) {
    this.publications.push(request);
    if (this.hangPublications) return new Promise<never>(() => undefined);
    if (this.publishBarrier) await this.publishBarrier;
    if (this.nextPublishError) {
      const error = this.nextPublishError;
      this.nextPublishError = null;
      throw error;
    }
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("temporary disconnect");
    }
    this.server.applyUpdate(decodeStudioCrdtUpdate(request.update));
    this.serverSequence += 1;
    return {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: this.workId,
      updateId: request.updateId,
      serverSequence: String(this.serverSequence),
      serverStateVector: encodeStudioCrdtStateVector(this.server.encodeStateVector()),
      duplicate: false,
    };
  }

  respondCrdtSync(response: StudioCrdtSyncResponse, sessionId: string): boolean {
    this.syncResponses.push({ response, sessionId });
    return true;
  }

  emitRemote(update: StudioCrdtRemoteUpdate): void {
    for (const listener of this.crdtListeners) {
      listener({ type: "update", update, senderSessionId: "peer" });
    }
  }
}

export function room(value: FakeRoom): StudioLiveRoom {
  return value as unknown as StudioLiveRoom;
}

export class MemoryOutbox implements StudioCrdtOutbox {
  readonly requests = new Map<string, StudioCrdtUpdateRequest>();

  async list(scope: string, workId: string): Promise<StudioCrdtUpdateRequest[]> {
    return [...this.requests.entries()]
      .filter(([key, request]) => key.startsWith(`${scope}:`) && request.workId === workId)
      .map(([, request]) => ({ ...request }));
  }

  async put(scope: string, request: StudioCrdtUpdateRequest): Promise<void> {
    this.requests.set(`${scope}:${request.updateId}`, { ...request });
  }

  async remove(scope: string, _workId: string, updateId: string): Promise<void> {
    this.requests.delete(`${scope}:${updateId}`);
  }
}

export class DurableMemoryOutbox extends MemoryOutbox {
  getStatus() {
    return {
      state: "durable" as const,
      message: "테스트 브라우저 복구 저장소가 정상입니다.",
    };
  }
}

export class MemoryRecoveryVault implements StudioCrdtRecoveryVault {
  readonly entries: StudioCrdtRecoveryVaultEntry[] = [];
  readonly rejectionMarkers: StudioCrdtPermanentRejectionMarker[] = [];

  async preserveRejectionMarker(
    input: PreserveStudioCrdtRejectionMarkerInput
  ): Promise<StudioCrdtPermanentRejectionMarker> {
    const existing = this.rejectionMarkers.find((marker) =>
      marker.scope === input.scope &&
      marker.workId === input.workId &&
      marker.rejectedUpdateId === input.rejectedUpdateId
    );
    if (existing) return { ...existing };
    const marker: StudioCrdtPermanentRejectionMarker = {
      ...input,
      createdAt: this.rejectionMarkers.length + 1,
    };
    this.rejectionMarkers.push(marker);
    return { ...marker };
  }

  async listRejectionMarkers(
    scope: string,
    workId: string
  ): Promise<StudioCrdtPermanentRejectionMarker[]> {
    return this.rejectionMarkers
      .filter((marker) => marker.scope === scope && marker.workId === workId)
      .map((marker) => ({ ...marker }));
  }

  async preserve(
    input: PreserveStudioCrdtRecoveryFrontierInput
  ): Promise<StudioCrdtRecoveryVaultEntry> {
    const entry: StudioCrdtRecoveryVaultEntry = {
      vaultId: `vault-${this.entries.length + 1}`,
      scope: input.scope,
      workId: input.workId,
      status: "pending-export",
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      rejectedUpdateId: input.rejectedUpdateId,
      updates: input.updates.map((request) => ({ ...request })),
      createdAt: this.entries.length + 1,
      exportedAt: null,
    };
    this.entries.push(entry);
    return { ...entry, updates: entry.updates.map((request) => ({ ...request })) };
  }

  async list(scope: string, workId: string): Promise<StudioCrdtRecoveryVaultEntry[]> {
    return this.entries
      .filter((entry) => entry.scope === scope && entry.workId === workId)
      .map((entry) => ({ ...entry, updates: entry.updates.map((request) => ({ ...request })) }));
  }

  async markExported(scope: string, workId: string, vaultId: string): Promise<void> {
    const entry = this.entries.find((candidate) =>
      candidate.scope === scope && candidate.workId === workId && candidate.vaultId === vaultId
    );
    if (!entry) throw new Error("missing recovery entry");
    entry.status = "exported";
    entry.exportedAt = 100;
  }
}

export function transportState(fake: FakeRoom, state: "ready" | "disconnected") {
  fake.ready = state === "ready";
  for (const listener of fake.roomListeners) {
    listener({ type: "transport-status", status: { state, message: state, recoverable: true } });
  }
}
