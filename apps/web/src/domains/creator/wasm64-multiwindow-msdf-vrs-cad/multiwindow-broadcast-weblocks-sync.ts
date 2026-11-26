/**
 * 멀티 윈도우·멀티 모니터 60fps 상태 동기화 및 Web Locks 단일 쓰기 리스 코디네이터.
 *
 * - `BroadcastChannel` + 선택적 `SharedWorker` 릴레이로 메인 캔버스, 3D 레퍼런스 팝아웃,
 *   타임라인/내비게이터 창 간 카메라·선택·활성 레이어 델타를 16.67ms(60fps) 프레임으로 병합 전송한다.
 * - `navigator.locks`(Web Locks API) 배타적 리스(`mode: "exclusive"`)로 SQLite-WASM/OPFS
 *   동시 쓰기 경합을 원천 차단하고, 펜싱 토큰·WAL 에폭 브로드캐스트로 팔로워 창을 갱신한다.
 * - 하트비트 기반 만료 탭 자동 정리(stale-tab pruning)와 결정적 리더 선출·페일오버를 제공한다.
 */

import {
  DEFAULT_SYNC_CHANNEL_NAME,
  InMemoryBroadcastChannel,
  resolveBrowserBroadcastChannel,
  resolveBrowserLockManager,
  type BroadcastChannelLike,
  type MessageEventLike,
  type SharedWorkerPortLike,
  type WebLockManagerLike,
} from "./multiwindow-sync-transports";

export {
  DEFAULT_SYNC_CHANNEL_NAME,
  InMemoryBroadcastChannel,
  InMemoryBroadcastHub,
  InMemoryLockManager,
  InMemorySharedWorkerRelay,
  resolveBrowserBroadcastChannel,
  resolveBrowserLockManager,
  type BroadcastChannelLike,
  type InMemoryLockManagerStats,
  type MessageEventLike,
  type SharedWorkerPortLike,
  type WebLockLike,
  type WebLockManagerLike,
  type WebLockRequestOptions,
  type WebLockSnapshot,
} from "./multiwindow-sync-transports";

export const DEFAULT_OPFS_WRITE_LOCK_NAME = "toonstudio-opfs-sqlite-writer-v1" as const;
export const DEFAULT_SYNC_TARGET_FPS = 60 as const;
export const DEFAULT_SYNC_FRAME_INTERVAL_MS = 1000 / DEFAULT_SYNC_TARGET_FPS;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000 as const;
export const DEFAULT_STALE_PEER_TIMEOUT_MS = 3000 as const;

export type StudioWindowRole =
  | "main-canvas"
  | "reference-3d-popout"
  | "timeline-navigator";

export const WINDOW_ROLE_LEADER_PRIORITY: Readonly<Record<StudioWindowRole, number>> = {
  "main-canvas": 0,
  "timeline-navigator": 1,
  "reference-3d-popout": 2,
};

export type SyncTransportKind = "broadcast-channel" | "shared-worker" | "in-memory";

export interface CameraSyncDelta {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly rotationRad: number;
  readonly camera3dPos?: readonly [number, number, number];
  readonly camera3dTarget?: readonly [number, number, number];
  readonly fovDeg?: number;
  readonly revision: number;
}

export interface SelectionSyncDelta {
  readonly selectedNodeIds: readonly string[];
  readonly selectedBoneId?: string | null;
  readonly bounds?: readonly [number, number, number, number] | null;
  readonly revision: number;
}

export interface ActiveLayerSyncDelta {
  readonly activeLayerId: string;
  readonly activeFrameIndex: number;
  readonly activeCutId?: string | null;
  readonly opacity?: number;
  readonly visibilityMaskVersion?: number;
  readonly revision: number;
}

export interface PeerWindowRecord {
  readonly windowId: string;
  readonly role: StudioWindowRole;
  readonly joinedAtMs: number;
  readonly lastHeartbeatMs: number;
  readonly leaderPriority: number;
  readonly lastSequence: number;
}

export interface PeerHelloMessage {
  readonly type: "peer-hello";
  readonly windowId: string;
  readonly role: StudioWindowRole;
  readonly joinedAtMs: number;
  readonly leaderPriority: number;
  readonly sentAtMs: number;
}

export interface PeerHeartbeatMessage {
  readonly type: "peer-heartbeat";
  readonly windowId: string;
  readonly role: StudioWindowRole;
  readonly joinedAtMs: number;
  readonly leaderPriority: number;
  readonly sentAtMs: number;
  readonly walEpoch: number;
}

export interface PeerGoodbyeMessage {
  readonly type: "peer-goodbye";
  readonly windowId: string;
  readonly sentAtMs: number;
}

export interface StateDeltaFrameMessage {
  readonly type: "state-delta-frame";
  readonly windowId: string;
  readonly role: StudioWindowRole;
  readonly sequence: number;
  readonly lamportTick: number;
  readonly sentAtMs: number;
  readonly coalescedCount: number;
  readonly camera?: CameraSyncDelta;
  readonly selection?: SelectionSyncDelta;
  readonly activeLayer?: ActiveLayerSyncDelta;
}

export interface OpfsWriteCommittedMessage {
  readonly type: "opfs-write-committed";
  readonly windowId: string;
  readonly operationName: string;
  readonly fencingToken: number;
  readonly walEpoch: number;
  readonly bytesWritten: number;
  readonly committedAtMs: number;
}

export type MultiWindowSyncMessage =
  | PeerHelloMessage
  | PeerHeartbeatMessage
  | PeerGoodbyeMessage
  | StateDeltaFrameMessage
  | OpfsWriteCommittedMessage;

export interface OpfsWriteLeaseContext {
  readonly lockName: string;
  readonly windowId: string;
  readonly operationName: string;
  readonly fencingToken: number;
  readonly walEpochBefore: number;
  readonly acquiredAtMs: number;
}

export interface OpfsWriteLeaseOptions {
  readonly ifAvailable?: boolean;
  readonly bytesWrittenHint?: number;
}

export interface OpfsWriteLeaseResult<T> {
  readonly acquired: boolean;
  readonly value: T | null;
  readonly fencingToken: number | null;
  readonly walEpoch: number;
  readonly waitDurationMs: number;
}

export interface MultiWindowSharedStateSnapshot {
  readonly camera: CameraSyncDelta | null;
  readonly selection: SelectionSyncDelta | null;
  readonly activeLayer: ActiveLayerSyncDelta | null;
  readonly walEpoch: number;
  readonly lamportTick: number;
  readonly leaderWindowId: string;
  readonly activePeerCount: number;
}

export interface MultiWindowSyncTelemetry {
  readonly windowId: string;
  readonly role: StudioWindowRole;
  readonly transport: SyncTransportKind;
  readonly isLeader: boolean;
  readonly leaderWindowId: string;
  readonly activePeerCount: number;
  readonly targetFps: number;
  readonly frameIntervalMs: number;
  readonly framesPublished: number;
  readonly eventsCoalesced: number;
  readonly framesReceived: number;
  readonly duplicateFramesDropped: number;
  readonly prunedPeerCount: number;
  readonly leaderChanges: number;
  readonly leaseAcquisitions: number;
  readonly leaseContentionWaits: number;
  readonly leaseRejectedUnavailable: number;
  readonly overlapViolations: number;
  readonly walEpoch: number;
  readonly lastFencingToken: number;
}

export interface StudioMultiWindowSyncOptions {
  readonly windowId: string;
  readonly role: StudioWindowRole;
  readonly channelName?: string;
  readonly opfsLockName?: string;
  readonly targetFps?: number;
  readonly heartbeatIntervalMs?: number;
  readonly stalePeerTimeoutMs?: number;
  readonly now?: () => number;
  readonly broadcastChannel?: BroadcastChannelLike | null;
  readonly sharedWorkerPort?: SharedWorkerPortLike | null;
  readonly lockManager?: WebLockManagerLike | null;
  readonly autoStartTimers?: boolean;
  readonly onRemoteDelta?: (frame: StateDeltaFrameMessage) => void;
  readonly onLeaderChange?: (leaderWindowId: string, isSelfLeader: boolean) => void;
  readonly onOpfsCommit?: (commit: OpfsWriteCommittedMessage) => void;
  readonly onPeerPruned?: (peer: PeerWindowRecord) => void;
}

function isSyncMessage(value: unknown): value is MultiWindowSyncMessage {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.type !== "string" || typeof rec.windowId !== "string") return false;
  return (
    rec.type === "peer-hello" ||
    rec.type === "peer-heartbeat" ||
    rec.type === "peer-goodbye" ||
    rec.type === "state-delta-frame" ||
    rec.type === "opfs-write-committed"
  );
}

function compareLeaderOrder(a: PeerWindowRecord, b: PeerWindowRecord): number {
  if (a.leaderPriority !== b.leaderPriority) return a.leaderPriority - b.leaderPriority;
  if (a.joinedAtMs !== b.joinedAtMs) return a.joinedAtMs - b.joinedAtMs;
  return a.windowId.localeCompare(b.windowId);
}

/**
 * 멀티 윈도우 60fps 델타 동기화 + 리더 선출 + Web Locks OPFS 단일 쓰기 코디네이터.
 */
export class StudioMultiWindowSyncCoordinator {
  readonly windowId: string;
  readonly role: StudioWindowRole;
  readonly channelName: string;
  readonly opfsLockName: string;
  readonly targetFps: number;
  readonly frameIntervalMs: number;
  readonly heartbeatIntervalMs: number;
  readonly stalePeerTimeoutMs: number;

  private readonly now: () => number;
  private readonly joinedAtMs: number;
  private readonly leaderPriority: number;
  private readonly channel: BroadcastChannelLike | null;
  private readonly sharedWorkerPort: SharedWorkerPortLike | null;
  private readonly lockManager: WebLockManagerLike | null;
  private readonly transport: SyncTransportKind;
  private readonly autoStartTimers: boolean;
  private readonly onRemoteDelta?: (frame: StateDeltaFrameMessage) => void;
  private readonly onLeaderChange?: (leaderWindowId: string, isSelfLeader: boolean) => void;
  private readonly onOpfsCommit?: (commit: OpfsWriteCommittedMessage) => void;
  private readonly onPeerPruned?: (peer: PeerWindowRecord) => void;

  private readonly peers = new Map<string, PeerWindowRecord>();
  private readonly lastSeenSeqByPeer = new Map<string, number>();

  private started = false;
  private closed = false;
  private sequence = 0;
  private lamportTick = 0;
  private walEpoch = 0;
  private lastFencingToken = 0;
  private leaderWindowId: string;

  private latestCamera: CameraSyncDelta | null = null;
  private latestSelection: SelectionSyncDelta | null = null;
  private latestActiveLayer: ActiveLayerSyncDelta | null = null;

  private pendingCamera: CameraSyncDelta | null = null;
  private pendingSelection: SelectionSyncDelta | null = null;
  private pendingActiveLayer: ActiveLayerSyncDelta | null = null;
  private pendingCoalescedEvents = 0;
  private lastFlushMs = Number.NEGATIVE_INFINITY;

  private framesPublished = 0;
  private eventsCoalesced = 0;
  private framesReceived = 0;
  private duplicateFramesDropped = 0;
  private prunedPeerCount = 0;
  private leaderChanges = 0;
  private leaseAcquisitions = 0;
  private leaseContentionWaits = 0;
  private leaseRejectedUnavailable = 0;
  private overlapViolations = 0;
  private localExclusiveWriteActive = false;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly boundMessageHandler = (event: MessageEventLike): void => {
    this.handleIncomingRaw(event.data);
  };

  constructor(options: StudioMultiWindowSyncOptions) {
    this.windowId = options.windowId;
    this.role = options.role;
    this.channelName = options.channelName ?? DEFAULT_SYNC_CHANNEL_NAME;
    this.opfsLockName = options.opfsLockName ?? DEFAULT_OPFS_WRITE_LOCK_NAME;
    this.targetFps = Math.max(1, Math.min(240, Math.round(options.targetFps ?? DEFAULT_SYNC_TARGET_FPS)));
    this.frameIntervalMs = 1000 / this.targetFps;
    this.heartbeatIntervalMs = Math.max(100, options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
    this.stalePeerTimeoutMs = Math.max(
      this.heartbeatIntervalMs * 2,
      options.stalePeerTimeoutMs ?? DEFAULT_STALE_PEER_TIMEOUT_MS,
    );
    this.now = options.now ?? (() => Date.now());
    this.joinedAtMs = this.now();
    this.leaderPriority = WINDOW_ROLE_LEADER_PRIORITY[this.role];
    this.autoStartTimers = options.autoStartTimers ?? false;
    this.onRemoteDelta = options.onRemoteDelta;
    this.onLeaderChange = options.onLeaderChange;
    this.onOpfsCommit = options.onOpfsCommit;
    this.onPeerPruned = options.onPeerPruned;

    this.channel =
      options.broadcastChannel !== undefined
        ? options.broadcastChannel
        : resolveBrowserBroadcastChannel(this.channelName);
    this.sharedWorkerPort = options.sharedWorkerPort ?? null;
    this.lockManager = options.lockManager ?? resolveBrowserLockManager();

    this.transport = this.sharedWorkerPort
      ? "shared-worker"
      : this.channel instanceof InMemoryBroadcastChannel || !this.channel
        ? "in-memory"
        : "broadcast-channel";

    this.leaderWindowId = this.windowId;
    this.peers.set(this.windowId, {
      windowId: this.windowId,
      role: this.role,
      joinedAtMs: this.joinedAtMs,
      lastHeartbeatMs: this.joinedAtMs,
      leaderPriority: this.leaderPriority,
      lastSequence: 0,
    });
  }

  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    this.channel?.addEventListener("message", this.boundMessageHandler);
    if (this.sharedWorkerPort) {
      this.sharedWorkerPort.addEventListener("message", this.boundMessageHandler);
      this.sharedWorkerPort.start?.();
    }
    const nowMs = this.now();
    this.touchSelfHeartbeat(nowMs);
    this.transmit({
      type: "peer-hello",
      windowId: this.windowId,
      role: this.role,
      joinedAtMs: this.joinedAtMs,
      leaderPriority: this.leaderPriority,
      sentAtMs: nowMs,
    });
    this.recomputeLeader();

    if (this.autoStartTimers) {
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
        this.pruneStalePeers();
      }, this.heartbeatIntervalMs);
    }
  }

  publishCameraDelta(delta: CameraSyncDelta): boolean {
    if (this.closed) return false;
    this.latestCamera = delta;
    this.pendingCamera = delta;
    this.pendingCoalescedEvents += 1;
    return this.tryFlushWithinFrameBudget();
  }

  publishSelectionDelta(delta: SelectionSyncDelta): boolean {
    if (this.closed) return false;
    this.latestSelection = delta;
    this.pendingSelection = delta;
    this.pendingCoalescedEvents += 1;
    return this.tryFlushWithinFrameBudget();
  }

  publishActiveLayerDelta(delta: ActiveLayerSyncDelta): boolean {
    if (this.closed) return false;
    this.latestActiveLayer = delta;
    this.pendingActiveLayer = delta;
    this.pendingCoalescedEvents += 1;
    return this.tryFlushWithinFrameBudget();
  }

  flushPendingFrame(force = false): StateDeltaFrameMessage | null {
    if (this.closed || (!this.pendingCamera && !this.pendingSelection && !this.pendingActiveLayer)) {
      return null;
    }
    const nowMs = this.now();
    if (!force && nowMs - this.lastFlushMs < this.frameIntervalMs - 1e-6) {
      return null;
    }
    this.clearFlushTimer();
    this.sequence += 1;
    this.lamportTick += 1;
    const coalescedCount = Math.max(1, this.pendingCoalescedEvents);
    const frame: StateDeltaFrameMessage = {
      type: "state-delta-frame",
      windowId: this.windowId,
      role: this.role,
      sequence: this.sequence,
      lamportTick: this.lamportTick,
      sentAtMs: nowMs,
      coalescedCount,
      ...(this.pendingCamera ? { camera: this.pendingCamera } : {}),
      ...(this.pendingSelection ? { selection: this.pendingSelection } : {}),
      ...(this.pendingActiveLayer ? { activeLayer: this.pendingActiveLayer } : {}),
    };

    this.pendingCamera = null;
    this.pendingSelection = null;
    this.pendingActiveLayer = null;
    this.pendingCoalescedEvents = 0;
    this.lastFlushMs = nowMs;
    this.framesPublished += 1;
    this.eventsCoalesced += Math.max(0, coalescedCount - 1);
    this.touchSelfHeartbeat(nowMs);
    this.transmit(frame);
    return frame;
  }

  sendHeartbeat(): void {
    if (this.closed) return;
    const nowMs = this.now();
    this.touchSelfHeartbeat(nowMs);
    this.transmit({
      type: "peer-heartbeat",
      windowId: this.windowId,
      role: this.role,
      joinedAtMs: this.joinedAtMs,
      leaderPriority: this.leaderPriority,
      sentAtMs: nowMs,
      walEpoch: this.walEpoch,
    });
  }

  pruneStalePeers(currentTimeMs?: number): readonly string[] {
    const nowMs = currentTimeMs ?? this.now();
    this.touchSelfHeartbeat(nowMs);
    const prunedIds: string[] = [];
    for (const [peerId, record] of Array.from(this.peers.entries())) {
      if (peerId === this.windowId) continue;
      if (nowMs - record.lastHeartbeatMs > this.stalePeerTimeoutMs) {
        this.peers.delete(peerId);
        this.lastSeenSeqByPeer.delete(peerId);
        this.prunedPeerCount += 1;
        prunedIds.push(peerId);
        this.onPeerPruned?.(record);
      }
    }
    if (prunedIds.length > 0) this.recomputeLeader();
    return prunedIds;
  }

  async withExclusiveOpfsWriteLease<T>(
    operationName: string,
    task: (ctx: OpfsWriteLeaseContext) => Promise<T> | T,
    options?: OpfsWriteLeaseOptions,
  ): Promise<OpfsWriteLeaseResult<T>> {
    // 창마다 독립된 메모리 잠금은 OPFS 공유 쓰기를 직렬화하지 못하므로 대체하지 않는다.
    if (!this.lockManager) {
      this.leaseRejectedUnavailable += 1;
      return {
        acquired: false,
        value: null,
        fencingToken: null,
        walEpoch: this.walEpoch,
        waitDurationMs: 0,
      };
    }
    const requestStartedMs = this.now();
    return await this.lockManager.request<OpfsWriteLeaseResult<T>>(
      this.opfsLockName,
      { mode: "exclusive", ifAvailable: options?.ifAvailable ?? false },
      async (lock) => {
        const acquiredAtMs = this.now();
        const waitDurationMs = Math.max(0, acquiredAtMs - requestStartedMs);
        if (!lock) {
          this.leaseRejectedUnavailable += 1;
          return {
            acquired: false,
            value: null,
            fencingToken: null,
            walEpoch: this.walEpoch,
            waitDurationMs,
          };
        }

        if (waitDurationMs > 0) this.leaseContentionWaits += 1;
        if (this.localExclusiveWriteActive) this.overlapViolations += 1;
        this.localExclusiveWriteActive = true;
        this.leaseAcquisitions += 1;
        const fencingToken = Math.max(this.lastFencingToken, this.walEpoch) + 1;
        this.lastFencingToken = fencingToken;
        const walEpochBefore = this.walEpoch;

        try {
          const value = await task({
            lockName: lock.name,
            windowId: this.windowId,
            operationName,
            fencingToken,
            walEpochBefore,
            acquiredAtMs,
          });
          this.walEpoch = Math.max(this.walEpoch + 1, fencingToken);
          this.transmit({
            type: "opfs-write-committed",
            windowId: this.windowId,
            operationName,
            fencingToken,
            walEpoch: this.walEpoch,
            bytesWritten: Math.max(0, options?.bytesWrittenHint ?? 0),
            committedAtMs: this.now(),
          });
          return { acquired: true, value, fencingToken, walEpoch: this.walEpoch, waitDurationMs };
        } finally {
          this.localExclusiveWriteActive = false;
        }
      },
    );
  }

  getLeaderWindowId(): string {
    return this.leaderWindowId;
  }

  isLeader(): boolean {
    return this.leaderWindowId === this.windowId;
  }

  getActivePeers(): readonly PeerWindowRecord[] {
    return Array.from(this.peers.values()).sort(compareLeaderOrder);
  }

  getLatestState(): MultiWindowSharedStateSnapshot {
    return {
      camera: this.latestCamera,
      selection: this.latestSelection,
      activeLayer: this.latestActiveLayer,
      walEpoch: this.walEpoch,
      lamportTick: this.lamportTick,
      leaderWindowId: this.leaderWindowId,
      activePeerCount: this.peers.size,
    };
  }

  getTelemetry(): MultiWindowSyncTelemetry {
    return {
      windowId: this.windowId,
      role: this.role,
      transport: this.transport,
      isLeader: this.isLeader(),
      leaderWindowId: this.leaderWindowId,
      activePeerCount: this.peers.size,
      targetFps: this.targetFps,
      frameIntervalMs: this.frameIntervalMs,
      framesPublished: this.framesPublished,
      eventsCoalesced: this.eventsCoalesced,
      framesReceived: this.framesReceived,
      duplicateFramesDropped: this.duplicateFramesDropped,
      prunedPeerCount: this.prunedPeerCount,
      leaderChanges: this.leaderChanges,
      leaseAcquisitions: this.leaseAcquisitions,
      leaseContentionWaits: this.leaseContentionWaits,
      leaseRejectedUnavailable: this.leaseRejectedUnavailable,
      overlapViolations: this.overlapViolations,
      walEpoch: this.walEpoch,
      lastFencingToken: this.lastFencingToken,
    };
  }

  close(): void {
    if (this.closed) return;
    this.flushPendingFrame(true);
    this.transmit({ type: "peer-goodbye", windowId: this.windowId, sentAtMs: this.now() });
    this.closed = true;
    this.clearFlushTimer();
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.channel?.removeEventListener("message", this.boundMessageHandler);
    this.channel?.close();
    if (this.sharedWorkerPort) {
      this.sharedWorkerPort.removeEventListener("message", this.boundMessageHandler);
      this.sharedWorkerPort.close?.();
    }
  }

  private tryFlushWithinFrameBudget(): boolean {
    const nowMs = this.now();
    if (nowMs - this.lastFlushMs >= this.frameIntervalMs - 1e-6) {
      return this.flushPendingFrame(true) !== null;
    }
    if (this.autoStartTimers && this.flushTimer === null) {
      const delayMs = Math.max(1, Math.ceil(this.frameIntervalMs - (nowMs - this.lastFlushMs)));
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flushPendingFrame(true);
      }, delayMs);
    }
    return false;
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private touchSelfHeartbeat(nowMs: number): void {
    const self = this.peers.get(this.windowId);
    if (!self) return;
    this.peers.set(this.windowId, { ...self, lastHeartbeatMs: nowMs, lastSequence: this.sequence });
  }

  private transmit(message: MultiWindowSyncMessage): void {
    this.channel?.postMessage(message);
    this.sharedWorkerPort?.postMessage(message);
  }

  private handleIncomingRaw(raw: unknown): void {
    if (this.closed || !isSyncMessage(raw) || raw.windowId === this.windowId) return;
    const nowMs = this.now();
    switch (raw.type) {
      case "peer-hello": {
        this.upsertPeer(raw.windowId, raw.role, raw.joinedAtMs, raw.leaderPriority, nowMs, 0);
        this.recomputeLeader();
        this.transmit({
          type: "peer-heartbeat",
          windowId: this.windowId,
          role: this.role,
          joinedAtMs: this.joinedAtMs,
          leaderPriority: this.leaderPriority,
          sentAtMs: nowMs,
          walEpoch: this.walEpoch,
        });
        break;
      }
      case "peer-heartbeat": {
        this.walEpoch = Math.max(this.walEpoch, raw.walEpoch);
        const existingSeq = this.peers.get(raw.windowId)?.lastSequence ?? 0;
        this.upsertPeer(raw.windowId, raw.role, raw.joinedAtMs, raw.leaderPriority, nowMs, existingSeq);
        this.recomputeLeader();
        break;
      }
      case "peer-goodbye": {
        if (this.peers.delete(raw.windowId)) {
          this.lastSeenSeqByPeer.delete(raw.windowId);
          this.recomputeLeader();
        }
        break;
      }
      case "state-delta-frame": {
        const lastSeen = this.lastSeenSeqByPeer.get(raw.windowId) ?? 0;
        if (raw.sequence <= lastSeen) {
          this.duplicateFramesDropped += 1;
          return;
        }
        this.lastSeenSeqByPeer.set(raw.windowId, raw.sequence);
        this.lamportTick = Math.max(this.lamportTick, raw.lamportTick) + 1;
        this.framesReceived += 1;
        const existing = this.peers.get(raw.windowId);
        this.upsertPeer(
          raw.windowId,
          raw.role,
          existing?.joinedAtMs ?? raw.sentAtMs,
          existing?.leaderPriority ?? WINDOW_ROLE_LEADER_PRIORITY[raw.role],
          nowMs,
          raw.sequence,
        );
        if (raw.camera && (!this.latestCamera || raw.camera.revision >= this.latestCamera.revision)) {
          this.latestCamera = raw.camera;
        }
        if (raw.selection && (!this.latestSelection || raw.selection.revision >= this.latestSelection.revision)) {
          this.latestSelection = raw.selection;
        }
        if (raw.activeLayer && (!this.latestActiveLayer || raw.activeLayer.revision >= this.latestActiveLayer.revision)) {
          this.latestActiveLayer = raw.activeLayer;
        }
        this.onRemoteDelta?.(raw);
        break;
      }
      case "opfs-write-committed": {
        this.walEpoch = Math.max(this.walEpoch, raw.walEpoch);
        this.lastFencingToken = Math.max(this.lastFencingToken, raw.fencingToken);
        this.onOpfsCommit?.(raw);
        break;
      }
    }
  }

  private upsertPeer(
    windowId: string,
    role: StudioWindowRole,
    joinedAtMs: number,
    leaderPriority: number,
    lastHeartbeatMs: number,
    lastSequence: number,
  ): void {
    this.peers.set(windowId, {
      windowId,
      role,
      joinedAtMs,
      lastHeartbeatMs,
      leaderPriority,
      lastSequence,
    });
  }

  private recomputeLeader(): void {
    const nextLeader = this.getActivePeers()[0]?.windowId ?? this.windowId;
    if (nextLeader !== this.leaderWindowId) {
      this.leaderWindowId = nextLeader;
      this.leaderChanges += 1;
      this.onLeaderChange?.(nextLeader, nextLeader === this.windowId);
    }
  }
}
