/**
 * 멀티 윈도우 동기화 전송 계층(`BroadcastChannel`, 선택적 `SharedWorker` 포트, `navigator.locks`)
 * 추상 인터페이스 및 비브라우저/테스트용 결정적 인메모리 구현체.
 */

export const DEFAULT_SYNC_CHANNEL_NAME = "toonstudio-multiwindow-sync-v1" as const;

export interface MessageEventLike<T = unknown> {
  readonly data: T;
}

export interface BroadcastChannelLike {
  readonly name: string;
  postMessage(message: unknown): void;
  close(): void;
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
}

export interface SharedWorkerPortLike {
  postMessage(message: unknown): void;
  start?(): void;
  close?(): void;
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
}

export interface WebLockLike {
  readonly name: string;
  readonly mode: "exclusive" | "shared";
}

export interface WebLockRequestOptions {
  readonly mode?: "exclusive" | "shared";
  readonly ifAvailable?: boolean;
  readonly steal?: boolean;
}

export interface WebLockSnapshot {
  readonly held: readonly WebLockLike[];
  readonly pending: readonly WebLockLike[];
}

export interface WebLockManagerLike {
  request<T>(
    name: string,
    options: WebLockRequestOptions,
    callback: (lock: WebLockLike | null) => Promise<T> | T,
  ): Promise<T>;
  query?(): Promise<WebLockSnapshot>;
}

export interface InMemoryLockManagerStats {
  readonly totalAcquisitions: number;
  readonly totalWaitCount: number;
  readonly totalUnavailableRejections: number;
  readonly peakConcurrentExclusiveHolders: number;
  readonly currentExclusiveHolders: number;
}

function cloneMessageSnapshot<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 결정적 인메모리 `BroadcastChannel` 엔드포인트.
 */
export class InMemoryBroadcastChannel implements BroadcastChannelLike {
  readonly name: string;
  private readonly hub: InMemoryBroadcastHub;
  private readonly listeners = new Set<(event: MessageEventLike) => void>();
  private closed = false;

  constructor(hub: InMemoryBroadcastHub, name: string) {
    this.hub = hub;
    this.name = name;
  }

  postMessage(message: unknown): void {
    if (this.closed) return;
    this.hub.dispatch(this.name, this, message);
  }

  addEventListener(_type: "message", listener: (event: MessageEventLike) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: MessageEventLike) => void): void {
    this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.listeners.clear();
    this.hub.unregister(this);
  }

  /** @internal */
  deliver(payload: unknown): void {
    if (this.closed) return;
    const event: MessageEventLike = { data: cloneMessageSnapshot(payload) };
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/**
 * 동일 채널 이름의 다른 창에만 스냅샷 복사본을 브로드캐스트하는 인메모리 허브.
 */
export class InMemoryBroadcastHub {
  private readonly channelsByName = new Map<string, Set<InMemoryBroadcastChannel>>();
  private dispatchedCount = 0;

  createChannel(name: string = DEFAULT_SYNC_CHANNEL_NAME): InMemoryBroadcastChannel {
    const channel = new InMemoryBroadcastChannel(this, name);
    let bucket = this.channelsByName.get(name);
    if (!bucket) {
      bucket = new Set<InMemoryBroadcastChannel>();
      this.channelsByName.set(name, bucket);
    }
    bucket.add(channel);
    return channel;
  }

  unregister(channel: InMemoryBroadcastChannel): void {
    const bucket = this.channelsByName.get(channel.name);
    if (!bucket) return;
    bucket.delete(channel);
    if (bucket.size === 0) {
      this.channelsByName.delete(channel.name);
    }
  }

  dispatch(name: string, sender: InMemoryBroadcastChannel, payload: unknown): void {
    const bucket = this.channelsByName.get(name);
    if (!bucket) return;
    this.dispatchedCount += 1;
    for (const peer of Array.from(bucket)) {
      if (peer !== sender) {
        peer.deliver(payload);
      }
    }
  }

  getDispatchedCount(): number {
    return this.dispatchedCount;
  }
}

/**
 * 선택적 `SharedWorker` 릴레이의 결정적 인메모리 구현체.
 */
export class InMemorySharedWorkerRelay {
  private readonly ports = new Set<{
    readonly port: SharedWorkerPortLike;
    readonly listeners: Set<(event: MessageEventLike) => void>;
    closed: boolean;
  }>();
  private relayedCount = 0;

  connectPort(): SharedWorkerPortLike {
    const listeners = new Set<(event: MessageEventLike) => void>();
    const entry = {
      listeners,
      closed: false,
      port: {
        postMessage: (message: unknown): void => {
          if (entry.closed) return;
          this.relayedCount += 1;
          for (const target of Array.from(this.ports)) {
            if (target === entry || target.closed) continue;
            const event: MessageEventLike = { data: cloneMessageSnapshot(message) };
            for (const listener of target.listeners) {
              listener(event);
            }
          }
        },
        start: (): void => {
          // 인메모리 포트는 연결 즉시 활성 상태다.
        },
        close: (): void => {
          entry.closed = true;
          entry.listeners.clear();
          this.ports.delete(entry);
        },
        addEventListener: (_type: "message", listener: (event: MessageEventLike) => void): void => {
          entry.listeners.add(listener);
        },
        removeEventListener: (_type: "message", listener: (event: MessageEventLike) => void): void => {
          entry.listeners.delete(listener);
        },
      } satisfies SharedWorkerPortLike,
    };
    this.ports.add(entry);
    return entry.port;
  }

  getRelayedCount(): number {
    return this.relayedCount;
  }
}

interface QueuedLockEntry {
  readonly mode: "exclusive" | "shared";
  readonly grant: () => void;
}

interface LockResourceState {
  exclusiveHeld: boolean;
  sharedHolders: number;
  readonly queue: QueuedLockEntry[];
}

/**
 * `navigator.locks`(Web Locks API) 규격의 결정적 인메모리 구현체.
 * 배타적(exclusive) 리스 시 FIFO 대기열을 엄격히 보장하여 SQLite-WASM/OPFS 쓰기 경합을 차단한다.
 */
export class InMemoryLockManager implements WebLockManagerLike {
  private readonly resources = new Map<string, LockResourceState>();
  private totalAcquisitions = 0;
  private totalWaitCount = 0;
  private totalUnavailableRejections = 0;
  private currentExclusiveHolders = 0;
  private peakConcurrentExclusiveHolders = 0;

  async request<T>(
    name: string,
    options: WebLockRequestOptions,
    callback: (lock: WebLockLike | null) => Promise<T> | T,
  ): Promise<T> {
    const mode = options.mode ?? "exclusive";
    const state = this.getOrCreateState(name);
    const canGrantNow = (): boolean =>
      mode === "exclusive"
        ? !state.exclusiveHeld && state.sharedHolders === 0
        : !state.exclusiveHeld;

    if (!canGrantNow() && options.ifAvailable) {
      this.totalUnavailableRejections += 1;
      return await callback(null);
    }

    if (!canGrantNow()) {
      this.totalWaitCount += 1;
      await new Promise<void>((resolve) => {
        state.queue.push({ mode, grant: resolve });
      });
    } else {
      this.markAcquired(state, mode);
    }

    const lock: WebLockLike = { name, mode };
    try {
      return await callback(lock);
    } finally {
      this.release(name, state, mode);
    }
  }

  async query(): Promise<WebLockSnapshot> {
    const held: WebLockLike[] = [];
    const pending: WebLockLike[] = [];
    for (const [name, state] of this.resources.entries()) {
      if (state.exclusiveHeld) held.push({ name, mode: "exclusive" });
      for (let i = 0; i < state.sharedHolders; i += 1) {
        held.push({ name, mode: "shared" });
      }
      for (const queued of state.queue) {
        pending.push({ name, mode: queued.mode });
      }
    }
    return { held, pending };
  }

  getStats(): InMemoryLockManagerStats {
    return {
      totalAcquisitions: this.totalAcquisitions,
      totalWaitCount: this.totalWaitCount,
      totalUnavailableRejections: this.totalUnavailableRejections,
      peakConcurrentExclusiveHolders: this.peakConcurrentExclusiveHolders,
      currentExclusiveHolders: this.currentExclusiveHolders,
    };
  }

  private getOrCreateState(name: string): LockResourceState {
    let state = this.resources.get(name);
    if (!state) {
      state = { exclusiveHeld: false, sharedHolders: 0, queue: [] };
      this.resources.set(name, state);
    }
    return state;
  }

  private markAcquired(state: LockResourceState, mode: "exclusive" | "shared"): void {
    this.totalAcquisitions += 1;
    if (mode === "exclusive") {
      state.exclusiveHeld = true;
      this.currentExclusiveHolders += 1;
      if (this.currentExclusiveHolders > this.peakConcurrentExclusiveHolders) {
        this.peakConcurrentExclusiveHolders = this.currentExclusiveHolders;
      }
    } else {
      state.sharedHolders += 1;
    }
  }

  private release(name: string, state: LockResourceState, mode: "exclusive" | "shared"): void {
    if (mode === "exclusive") {
      state.exclusiveHeld = false;
      this.currentExclusiveHolders = Math.max(0, this.currentExclusiveHolders - 1);
    } else {
      state.sharedHolders = Math.max(0, state.sharedHolders - 1);
    }

    while (state.queue.length > 0) {
      const next = state.queue[0];
      if (!next) break;
      if (next.mode === "exclusive") {
        if (!state.exclusiveHeld && state.sharedHolders === 0) {
          state.queue.shift();
          this.markAcquired(state, "exclusive");
          next.grant();
        }
        break;
      }
      if (!state.exclusiveHeld) {
        state.queue.shift();
        this.markAcquired(state, "shared");
        next.grant();
      } else {
        break;
      }
    }

    if (!state.exclusiveHeld && state.sharedHolders === 0 && state.queue.length === 0) {
      this.resources.delete(name);
    }
  }
}

export function resolveBrowserBroadcastChannel(channelName: string): BroadcastChannelLike | null {
  if (typeof globalThis.BroadcastChannel !== "function") {
    return null;
  }
  return new globalThis.BroadcastChannel(channelName) as unknown as BroadcastChannelLike;
}

export function resolveBrowserLockManager(): WebLockManagerLike | null {
  if (typeof globalThis.navigator === "undefined") {
    return null;
  }
  const maybeNav = globalThis.navigator as { readonly locks?: WebLockManagerLike };
  if (maybeNav.locks && typeof maybeNav.locks.request === "function") {
    return maybeNav.locks;
  }
  return null;
}
