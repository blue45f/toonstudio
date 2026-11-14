import type { StudioLiveEnvelope, StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import {
  createStudioLocalLiveTransport,
  type StudioLiveTransport,
  type StudioLiveTransportControlEvent,
  type StudioLiveTransportContext,
  type StudioLiveTransportFactory,
} from "../live/studio-live-collaboration-transport";
import { STUDIO_DIRECT_MAX_BYTES, type StudioLiveDirectPort } from "../live/studio-live-direct-port";

export const STUDIO_VSPACE_PREVIEW_NETWORK_EVENT = "toonstudio:vspace-preview-network";
const LOCAL_DIRECT_WIRE = "toonstudio-local-direct-v1";
const PREVIEW_DIRECT_BEACON_MS = 1_000;
const PREVIEW_DIRECT_PEER_TTL_MS = 10_500;

export interface StudioPreviewBroadcastChannelLike {
  postMessage(value: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

interface LocalPreviewDirectWireMessage {
  readonly wire: typeof LOCAL_DIRECT_WIRE;
  readonly workId: string;
  readonly sender: StudioLiveParticipant;
  readonly kind: "hello" | "hello-ack" | "packet" | "bye";
  readonly targetSessionId?: string;
  readonly payload?: string;
}

export interface StudioVirtualPreviewNetworkEventDetail {
  readonly paused: boolean;
  /** true이면 상대방에게 즉시 연결 유실(bye)을 시뮬레이션해 끊김 배지를 즉시 재현한다. */
  readonly drop?: boolean;
}

/**
 * 무료 미리보기 더미 공간(`virtual-demo`, `virtual-demo:preview` 등) 여부 판정.
 * 인증 고객 프로젝트에는 절대 매칭되지 않으며, 동일 브라우저 컨텍스트의 로컬 탭 간
 * 공동 공간 연결·재접속 검증에만 사용된다.
 */
export function isStudioVirtualDemoPreviewProject(projectId: string): boolean {
  return /^virtual-demo(?:$|[:_-])/u.test(projectId.trim());
}

function defaultChannelFactory(name: string): StudioPreviewBroadcastChannelLike | null {
  if (typeof BroadcastChannel !== "function") return null;
  try {
    return new BroadcastChannel(name);
  } catch {
    return null;
  }
}

function isParticipantLike(value: unknown): value is StudioLiveParticipant {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionId === "string"
    && candidate.sessionId.length > 0
    && typeof candidate.displayName === "string"
    && candidate.displayName.length > 0
    && typeof candidate.role === "string"
  );
}

function parseLocalDirectWire(value: unknown, expectedWorkId: string): LocalPreviewDirectWireMessage | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.wire !== LOCAL_DIRECT_WIRE || raw.workId !== expectedWorkId || !isParticipantLike(raw.sender)) {
    return null;
  }
  const kind = raw.kind;
  if (kind !== "hello" && kind !== "hello-ack" && kind !== "packet" && kind !== "bye") return null;
  if (raw.targetSessionId !== undefined && typeof raw.targetSessionId !== "string") return null;
  if (kind === "packet") {
    if (typeof raw.payload !== "string" || raw.payload.length > STUDIO_DIRECT_MAX_BYTES) return null;
  }
  return {
    wire: LOCAL_DIRECT_WIRE,
    workId: expectedWorkId,
    sender: raw.sender,
    kind,
    ...(typeof raw.targetSessionId === "string" ? { targetSessionId: raw.targetSessionId } : {}),
    ...(typeof raw.payload === "string" ? { payload: raw.payload } : {}),
  };
}

function isPresencePayload(payload: string): boolean {
  return payload.includes('"kind":"presence"');
}

export interface StudioVirtualDemoPreviewTransportOptions {
  readonly createChannel?: (name: string) => StudioPreviewBroadcastChannelLike | null;
  readonly createLocalTransport?: StudioLiveTransportFactory;
  readonly now?: () => number;
  readonly setInterval?: (handler: () => void, delayMs: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

class StudioLocalPreviewDirectTransport implements StudioLiveTransport {
  readonly mode = "local" as const;
  readonly direct: StudioLiveDirectPort;
  readonly canvasLockPolicy: StudioLiveTransport["canvasLockPolicy"];
  readonly crdtFanout: StudioLiveTransport["crdtFanout"];

  private readonly peers = new Map<string, { participant: StudioLiveParticipant; seenAt: number }>();
  private readonly directListeners = new Set<(sender: StudioLiveParticipant, payload: string) => void>();
  private readonly controlListeners = new Set<(event: StudioLiveTransportControlEvent) => void>();
  private channel: StudioPreviewBroadcastChannelLike | null = null;
  private beaconTimer: unknown = null;
  private paused = false;
  private closed = false;
  private latestSelfPresencePayload: string | null = null;

  constructor(
    private readonly base: StudioLiveTransport,
    private readonly context: StudioLiveTransportContext,
    private readonly options: StudioVirtualDemoPreviewTransportOptions,
  ) {
    this.canvasLockPolicy = base.canvasLockPolicy;
    this.crdtFanout = base.crdtFanout;
    this.direct = {
      getPeers: () => this.listActivePeers(),
      send: (targetSessionId, payload) => this.sendDirect(targetSessionId, payload),
      subscribe: (listener) => {
        if (this.closed) return () => undefined;
        this.directListeners.add(listener);
        return () => this.directListeners.delete(listener);
      },
    };
  }

  get ready(): boolean {
    return !this.closed && !this.paused && this.base.ready;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private listActivePeers(): StudioLiveParticipant[] {
    const now = this.now();
    const active: StudioLiveParticipant[] = [];
    for (const [sessionId, record] of this.peers) {
      if (now - record.seenAt > PREVIEW_DIRECT_PEER_TTL_MS) {
        this.peers.delete(sessionId);
        continue;
      }
      active.push(record.participant);
    }
    return active;
  }

  private postDirect(message: LocalPreviewDirectWireMessage): boolean {
    if (this.closed || this.paused || !this.channel) return false;
    try {
      this.channel.postMessage(message);
      return true;
    } catch {
      return false;
    }
  }

  private sendDirect(targetSessionId: string, payload: string): boolean {
    if (typeof payload !== "string" || payload.length > STUDIO_DIRECT_MAX_BYTES) return false;
    if (isPresencePayload(payload)) {
      this.latestSelfPresencePayload = payload;
    }
    return this.postDirect({
      wire: LOCAL_DIRECT_WIRE,
      workId: this.context.workId,
      sender: this.context.participant,
      kind: "packet",
      targetSessionId,
      payload,
    });
  }

  private sendBeacon(kind: "hello" | "hello-ack", targetSessionId?: string): void {
    this.postDirect({
      wire: LOCAL_DIRECT_WIRE,
      workId: this.context.workId,
      sender: this.context.participant,
      kind,
      ...(targetSessionId ? { targetSessionId } : {}),
    });
  }

  private readonly handleChannelMessage = (event: MessageEvent<unknown>): void => {
    if (this.closed || this.paused) return;
    const message = parseLocalDirectWire(event.data, this.context.workId);
    if (!message || message.sender.sessionId === this.context.participant.sessionId) return;
    if (message.targetSessionId && message.targetSessionId !== this.context.participant.sessionId) return;

    if (message.kind === "bye") {
      this.peers.delete(message.sender.sessionId);
      return;
    }

    const knownBefore = this.peers.has(message.sender.sessionId);
    this.peers.set(message.sender.sessionId, {
      participant: message.sender,
      seenAt: this.now(),
    });

    if (message.kind === "hello") {
      this.sendBeacon("hello-ack", message.sender.sessionId);
    }
    if (!knownBefore && this.latestSelfPresencePayload) {
      this.sendDirect(message.sender.sessionId, this.latestSelfPresencePayload);
    }
    if (message.kind === "packet" && message.payload !== undefined) {
      for (const listener of this.directListeners) {
        listener(message.sender, message.payload);
      }
    }
  };

  private readonly handleNetworkEvent = (event: Event): void => {
    if (this.closed) return;
    const detail = (event as CustomEvent<StudioVirtualPreviewNetworkEventDetail | undefined>).detail;
    this.setPaused(Boolean(detail?.paused), Boolean(detail?.drop));
  };

  setPaused(nextPaused: boolean, drop = false): void {
    if (this.closed || this.paused === nextPaused) return;
    if (nextPaused && drop && this.channel) {
      try {
        this.channel.postMessage({
          wire: LOCAL_DIRECT_WIRE,
          workId: this.context.workId,
          sender: this.context.participant,
          kind: "bye",
        } satisfies LocalPreviewDirectWireMessage);
      } catch {
        // 연결 유실 시뮬레이션 전송 실패는 무시한다.
      }
    }
    this.paused = nextPaused;
    if (nextPaused) {
      for (const listener of this.controlListeners) {
        listener({
          type: "status",
          status: {
            state: "connecting",
            message: "공동 공간 연결이 일시 끊겨 재연결 중입니다.",
            recoverable: true,
          },
        });
      }
      return;
    }
    for (const listener of this.controlListeners) {
      listener({
        type: "status",
        status: {
          state: "ready",
          message: "공동 공간 연결이 복구되었습니다.",
          recoverable: true,
        },
      });
    }
    this.sendBeacon("hello");
  }

  async connect(): Promise<void> {
    await this.base.connect();
    if (this.closed) return;
    const createChannel = this.options.createChannel ?? defaultChannelFactory;
    this.channel = createChannel(`toonstudio:vspace-preview-direct:${this.context.roomName}`);
    this.channel?.addEventListener("message", this.handleChannelMessage);
    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener(STUDIO_VSPACE_PREVIEW_NETWORK_EVENT, this.handleNetworkEvent);
    }
    const schedule = this.options.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
    this.beaconTimer = schedule(() => {
      if (!this.paused) this.sendBeacon("hello");
    }, PREVIEW_DIRECT_BEACON_MS);
    this.sendBeacon("hello");
  }

  send(envelope: StudioLiveEnvelope): boolean {
    if (this.closed || this.paused) return false;
    return this.base.send(envelope);
  }

  subscribe(listener: (value: unknown) => void): () => void {
    return this.base.subscribe((value) => {
      if (this.paused || this.closed) return;
      listener(value);
    });
  }

  subscribeControl(listener: (event: StudioLiveTransportControlEvent) => void): () => void {
    if (this.closed) return () => undefined;
    this.controlListeners.add(listener);
    const unsubBase = this.base.subscribeControl?.(listener);
    return () => {
      this.controlListeners.delete(listener);
      unsubBase?.();
    };
  }

  close(): void {
    if (this.closed) return;
    if (!this.paused && this.channel) {
      try {
        this.channel.postMessage({
          wire: LOCAL_DIRECT_WIRE,
          workId: this.context.workId,
          sender: this.context.participant,
          kind: "bye",
        } satisfies LocalPreviewDirectWireMessage);
      } catch {
        // 닫히는 채널 전송 실패는 무시한다.
      }
    }
    this.closed = true;
    if (this.beaconTimer !== null) {
      const clear = this.options.clearInterval ?? ((id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>));
      clear(this.beaconTimer);
      this.beaconTimer = null;
    }
    if (typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener(STUDIO_VSPACE_PREVIEW_NETWORK_EVENT, this.handleNetworkEvent);
    }
    this.channel?.removeEventListener("message", this.handleChannelMessage);
    this.channel?.close();
    this.channel = null;
    this.directListeners.clear();
    this.controlListeners.clear();
    this.peers.clear();
    this.base.close();
  }
}

export function createStudioVirtualDemoPreviewTransportFactory(
  baseFactory?: StudioLiveTransportFactory,
  options: StudioVirtualDemoPreviewTransportOptions = {},
): StudioLiveTransportFactory {
  const localFactory = options.createLocalTransport ?? createStudioLocalLiveTransport;
  return (context) => {
    const base = baseFactory ? baseFactory(context) : localFactory(context);
    if (base.mode === "server" || base.direct) {
      return base;
    }
    return new StudioLocalPreviewDirectTransport(base, context, options);
  };
}
