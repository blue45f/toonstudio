import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";

export interface StudioCrdtServiceOptions {
  now?: () => Date;
  stateVectorMaxBytes?: number;
  compactUpdateCount?: number;
  compactUpdateBytes?: number;
  compactIntervalMs?: number;
  idleEvictionMs?: number;
  evictionSweepMs?: number;
  maxPendingOperationsPerWork?: number;
  maxPendingOperationsTotal?: number;
  clusterLoadHeartbeatMs?: number;
  clusterLoadStaleAfterMs?: number;
  maxClusterPendingOperationsTotal?: number;
  nodeId?: string;
  scheduleInterval?: (handler: () => void, delay: number) => ReturnType<typeof setInterval>;
  cancelInterval?: (handle: ReturnType<typeof setInterval>) => void;
}

export interface StudioCrdtSyncResult {
  chunks: string[];
  chunkCount: number;
  totalBytes: number;
  serverStateVector: string;
  serverSequence: string;
  requiredReaderCapabilities?: readonly string[];
}

export interface StudioCrdtBinarySyncResult {
  update: Uint8Array;
  totalBytes: number;
  serverStateVector: Uint8Array;
  serverSequence: string;
  requiredReaderCapabilities?: readonly string[];
}

export interface StudioCrdtApplyUpdateInput {
  workId: string;
  updateId: string;
  actorUserId: string;
  data: string;
  writeContext?: StudioScopedWriteContext;
  readerCapabilities?: readonly string[];
}

export interface StudioCrdtApplyBinaryUpdateInput {
  workId: string;
  updateId: string;
  actorUserId: string;
  data: Uint8Array;
  writeContext?: StudioScopedWriteContext;
  readerCapabilities?: readonly string[];
}

export interface StudioCrdtApplyUpdateResult {
  duplicate: boolean;
  updateId: string;
  update: string;
  serverStateVector: string;
  serverSequence: string;
  requiredReaderCapabilities?: readonly string[];
}

export interface StudioCrdtApplyBinaryUpdateResult {
  duplicate: boolean;
  updateId: string;
  update: Uint8Array;
  serverStateVector: Uint8Array;
  serverSequence: string;
  requiredReaderCapabilities?: readonly string[];
}

export class StudioCrdtInvalidPayloadError extends Error {
  constructor(message = "Invalid CRDT payload") {
    super(message);
    this.name = "StudioCrdtInvalidPayloadError";
  }
}

export class StudioCrdtUpdateIdConflictError extends Error {
  constructor() {
    super("CRDT update id was already used for different content");
    this.name = "StudioCrdtUpdateIdConflictError";
  }
}

export class StudioCrdtDocumentTooLargeError extends Error {
  constructor() {
    super("CRDT document exceeds the server byte budget");
    this.name = "StudioCrdtDocumentTooLargeError";
  }
}

/**
 * The operation was rejected before execution because this API process already has the bounded
 * amount of CRDT work it can retain safely. Clients may retry the same idempotent request after
 * backoff; no durable mutation has started when this error is raised.
 */
export class StudioCrdtBackpressureError extends Error {
  constructor() {
    super("CRDT operation queue is saturated");
    this.name = "StudioCrdtBackpressureError";
  }
}

export class StudioCrdtStorageCorruptionError extends Error {
  constructor(message = "Stored CRDT state is invalid") {
    super(message);
    this.name = "StudioCrdtStorageCorruptionError";
  }
}

