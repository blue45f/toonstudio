import { Buffer } from "node:buffer";

import { describe, expect, it, vi } from "vitest";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY } from "@toonstudio/contracts/studio-legacy-pigment-archive";

import { StudioCrdtDocument } from "./studio-crdt-document";
import { studioDrawElementToCrdtStroke } from "./studio-crdt-draw-bridge";
import { STUDIO_CRDT_PROTOCOL_VERSION } from "./studio-crdt-protocol";
import {
  createStudioLiveEnvelope,
  type StudioLiveEnvelope,
  type StudioLiveMessageKind,
  type StudioLiveParticipant,
  type StudioLivePayloadMap,
} from "./studio-live-collaboration-protocol";
import { STUDIO_LIVE_INK_CAPABILITY, type StudioLiveInkWireMessage } from "./studio-live-ink-protocol";
import {
  applyStudioLiveP2pOverlay,
  STUDIO_LIVE_P2P_CHANNEL_LABEL,
  type StudioLiveP2pRtcDataChannel,
  type StudioLiveP2pRtcPeerConnection,
} from "./studio-live-p2p-overlay-transport";
import { STUDIO_LIVE_P2P_CAPS_WIRE } from "./studio-live-p2p-overlay-wire";

import type {
  StudioCrdtSyncRequest,
  StudioCrdtSyncResponse,
  StudioCrdtTransportMessage,
  StudioCrdtUpdateAck,
  StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";
import type {
  StudioLiveTransport,
  StudioLiveTransportContext,
  StudioLiveTransportControlEvent,
} from "./studio-live-collaboration-transport";

// 기존 overlay 시험과 같은 memory RTC로 공개 송신·수신·ACK 경계를 검사한다.
const NOW = Date.parse("2026-08-15T04:00:00.000Z");

const LOCAL: StudioLiveParticipant = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  displayName: "작가",
  role: "owner",
};
const REMOTE: StudioLiveParticipant = {
  sessionId: "00000000-0000-4000-8000-000000000002",
  displayName: "어시스턴트",
  role: "editor",
};
function contextFor(participant: StudioLiveParticipant): StudioLiveTransportContext {
  return {
    workId: "work-p2p",
    roomName: "room-p2p",
    participant,
  };
}

function envelope<K extends StudioLiveMessageKind>(input: {
  sender: StudioLiveParticipant;
  kind: K;
  payload: StudioLivePayloadMap[K];
  sequence?: number;
  targetSessionId?: string | null;
}): StudioLiveEnvelope<K> {
  return createStudioLiveEnvelope({
    workId: "work-p2p",
    sender: input.sender,
    sentAt: NOW,
    sequence: input.sequence ?? 1,
    kind: input.kind,
    targetSessionId: input.targetSessionId ?? null,
    payload: input.payload,
  });
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

class MemoryDataChannel implements StudioLiveP2pRtcDataChannel {
  readonly label: string;
  readyState = "connecting";
  bufferedAmount = 0;
  binaryType?: string;
  peer: MemoryDataChannel | null = null;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(
    label: string,
    private readonly beforeSend: () => void,
  ) {
    this.label = label;
  }

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== "open" || this.peer?.readyState !== "open") {
      throw new Error("data channel is not open");
    }
    this.beforeSend();
    const delivered = data instanceof ArrayBuffer ? data.slice(0) : data;
    this.peer.onmessage?.({ data: delivered } as MessageEvent<unknown>);
  }

  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.(new Event("close"));
    const peer = this.peer;
    this.peer = null;
    peer?.close();
  }

  markOpen(): void {
    if (this.readyState === "open") return;
    this.readyState = "open";
    this.onopen?.(new Event("open"));
  }
}

class MemoryPeerConnection implements StudioLiveP2pRtcPeerConnection {
  connectionState = "new";
  readonly sctp = { maxMessageSize: 0 };
  onicecandidate: StudioLiveP2pRtcPeerConnection["onicecandidate"] = null;
  ondatachannel: StudioLiveP2pRtcPeerConnection["ondatachannel"] = null;
  onconnectionstatechange: (() => void) | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localChannel: MemoryDataChannel | null = null;
  readonly id: string;

  constructor(
    private readonly hub: MemoryRtcHub,
    id: string,
  ) {
    this.id = id;
  }

  createDataChannel(label: string): StudioLiveP2pRtcDataChannel {
    const channel = this.hub.createChannel(label);
    this.localChannel = channel;
    return channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: `offer-${this.id}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: `answer-${this.id}` };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description;
    this.hub.linkIfReady(this);
    this.onicecandidate?.({
      candidate: {
        candidate: `host-${this.id}`,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: null,
      },
    });
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description;
    this.hub.linkIfReady(this);
  }

  async addIceCandidate(_candidate: RTCIceCandidateInit): Promise<void> {
    return;
  }

  close(): void {
    this.connectionState = "closed";
    this.localChannel?.close();
    this.onconnectionstatechange?.();
  }
}

class MemoryRtcHub {
  private nextId = 1;
  private readonly connections = new Set<MemoryPeerConnection>();
  private readonly channels = new Set<MemoryDataChannel>();
  private sendsBeforeFailure: number | null = null;
  private simulatedSendFailure = false;

  get didSimulateSendFailure(): boolean {
    return this.simulatedSendFailure;
  }

  createChannel(label: string): MemoryDataChannel {
    const channel = new MemoryDataChannel(label, () => this.beforeDataChannelSend());
    this.channels.add(channel);
    return channel;
  }

  setReliable(): void {
    for (const channel of this.channels) Object.assign(channel, { ordered: true, maxRetransmits: null, maxPacketLifeTime: null });
  }

  setBufferedAmount(value: number): void {
    for (const channel of this.channels) channel.bufferedAmount = value;
  }

  setMaxMessageSize(value: number): void {
    for (const connection of this.connections) connection.sctp.maxMessageSize = value;
  }

  failOnNthSend(sendNumber: number): void {
    this.sendsBeforeFailure = sendNumber;
  }

  private beforeDataChannelSend(): void {
    if (this.sendsBeforeFailure === null) return;
    this.sendsBeforeFailure -= 1;
    if (this.sendsBeforeFailure > 0) return;
    this.sendsBeforeFailure = null;
    this.simulatedSendFailure = true;
    throw new Error("simulated data-channel send failure");
  }

  create(): StudioLiveP2pRtcPeerConnection {
    const connection = new MemoryPeerConnection(this, String(this.nextId++));
    this.connections.add(connection);
    return connection;
  }

  linkIfReady(connection: MemoryPeerConnection): void {
    if (!connection.localDescription || !connection.remoteDescription) return;
    for (const other of this.connections) {
      if (other === connection) continue;
      if (!other.localDescription || !other.remoteDescription) continue;
      if (
        other.localDescription.sdp !== connection.remoteDescription.sdp ||
        other.remoteDescription.sdp !== connection.localDescription.sdp
      ) {
        continue;
      }
      this.openPair(connection, other);
      return;
    }
  }

  private openPair(left: MemoryPeerConnection, right: MemoryPeerConnection): void {
    const offered = left.localChannel ?? right.localChannel;
    if (!offered) return;
    const answerer = this.createChannel(STUDIO_LIVE_P2P_CHANNEL_LABEL);
    offered.peer = answerer;
    answerer.peer = offered;
    const answerConnection = left.localChannel ? right : left;
    answerConnection.ondatachannel?.({ channel: answerer });
    offered.markOpen();
    answerer.markOpen();
    left.connectionState = "connected";
    right.connectionState = "connected";
  }
}

class SignalingBus {
  readonly primaries = new Map<string, FakePrimaryTransport>();

  create(
    participant: StudioLiveParticipant,
    crdtFanout: "authoritative" | "mesh" = "authoritative",
  ): FakePrimaryTransport {
    const primary = new FakePrimaryTransport(this, participant.sessionId, crdtFanout);
    this.primaries.set(participant.sessionId, primary);
    return primary;
  }

  deliver(fromSessionId: string, envelope: StudioLiveEnvelope): void {
    if (envelope.targetSessionId) {
      this.primaries.get(envelope.targetSessionId)?.emit(envelope);
      return;
    }
    for (const [sessionId, primary] of this.primaries) {
      if (sessionId === fromSessionId) continue;
      primary.emit(envelope);
    }
  }

  deliverInk(fromSessionId: string, wire: StudioLiveInkWireMessage): void {
    for (const [sessionId, primary] of this.primaries) {
      if (sessionId === fromSessionId) continue;
      primary.emitInk(wire);
    }
  }
}

class FakePrimaryTransport implements StudioLiveTransport {
  authoritativeLockCapability: "fenced-v2" | null = null;
  acousticCoreBinding: StudioLiveTransport["acousticCoreBinding"] = null;
  readonly mode = "server" as const;
  canvasLockPolicy: StudioLiveTransport["canvasLockPolicy"] = "required";
  readonly sent: StudioLiveEnvelope[] = [];
  readonly sentInk: StudioLiveInkWireMessage[] = [];
  binaryLaneCapabilities: readonly string[] = [STUDIO_LIVE_INK_CAPABILITY];
  readonly acquireLock = vi.fn(async () => ({
    status: "timeout" as const,
    resource: "page:1",
    requestId: "request-1",
    message: "test",
  }));
  readonly publishCrdtUpdate = vi.fn(
    async (request: StudioCrdtUpdateRequest): Promise<StudioCrdtUpdateAck> => ({
      protocolVersion: request.protocolVersion,
      workId: request.workId,
      updateId: request.updateId,
      duplicate: false,
      serverSequence: "1",
      serverStateVector: null,
    }),
  );
  readonly requestCrdtSync = vi.fn(
    async (_request: StudioCrdtSyncRequest): Promise<StudioCrdtSyncResponse | null> => null,
  );
  private readonly listeners = new Set<(value: unknown) => void>();
  private readonly controlListeners = new Set<
    (event: StudioLiveTransportControlEvent) => void
  >();
  private readonly crdtListeners = new Set<(message: StudioCrdtTransportMessage) => void>();
  private readonly inkListeners = new Set<(value: unknown) => void>();
  ready = false;
  closed = false;

  constructor(
    private readonly bus: SignalingBus,
    readonly sessionId: string,
    readonly crdtFanout: "authoritative" | "mesh",
  ) {}

  async connect(): Promise<void> {
    this.ready = true;
  }

  send(envelope: StudioLiveEnvelope): boolean {
    if (!this.ready || this.closed) return false;
    this.sent.push(envelope);
    this.bus.deliver(this.sessionId, envelope);
    return true;
  }

  sendInk(message: StudioLiveInkWireMessage): boolean {
    if (!this.ready || this.closed) return false;
    this.sentInk.push(message);
    this.bus.deliverInk(this.sessionId, message);
    return true;
  }

  subscribeInk(listener: (value: unknown) => void): () => void {
    this.inkListeners.add(listener);
    return () => this.inkListeners.delete(listener);
  }

  emit(value: unknown): void {
    for (const listener of this.listeners) listener(value);
  }

  emitInk(value: unknown): void {
    for (const listener of this.inkListeners) listener(value);
  }

  subscribe(listener: (value: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeControl(listener: (event: StudioLiveTransportControlEvent) => void): () => void {
    this.controlListeners.add(listener);
    return () => this.controlListeners.delete(listener);
  }

  subscribeCrdt(listener: (message: StudioCrdtTransportMessage) => void): () => void {
    this.crdtListeners.add(listener);
    return () => this.crdtListeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.ready = false;
    this.listeners.clear();
  }
}

const BG3D = STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY;
const PRESERVED = STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY;
const UPDATE_ID = "00000000-0000-4000-8000-000000000042";

function updateBytes(preserved: boolean): Uint8Array {
  const document = new StudioCrdtDocument();
  try {
    const stroke = studioDrawElementToCrdtStroke("page-1", {
      id: "draw-1", type: "draw", kind: "freehand", mode: "pen",
      points: [0, 0, 7, 8], stroke: "#123456", strokeWidth: 2,
      brushEnginePrograms: { version: 1, oil: {
        bristlePhysics: false, bristleLoadDynamics: false, impastoRelief: false,
      } },
      ...(preserved ? { colorizeMaskEnabled: false } : {}),
    });
    expect(stroke.payload.version).toBe(preserved ? 7 : 6);
    document.addStroke(stroke);
    return document.encodeStateAsUpdate();
  } finally {
    document.destroy();
  }
}

function withoutPrimaryCrdt(primary: FakePrimaryTransport): StudioLiveTransport {
  return {
    mode: primary.mode, crdtFanout: "none",
    get ready() { return primary.ready; },
    connect: () => primary.connect(),
    send: (value) => primary.send(value),
    subscribe: (listener) => primary.subscribe(listener),
    subscribeControl: (listener) => primary.subscribeControl(listener),
    close: () => primary.close(),
  };
}

describe("P2P 원고 전송의 모든 reader 요구 검사", () => {
  it.each([
    { label: "원본 보존 요구는 no-cap 상대에게 보내지 않는다", advertised: [], required: [PRESERVED], rejects: true },
    { label: "3D와 원본 보존의 결합 요구는 3D-only 상대에게 보내지 않는다", advertised: [BG3D], required: [BG3D, PRESERVED], rejects: true },
    { label: "원본 보존을 지원하는 상대에게 v7을 전송한다", advertised: [PRESERVED], required: [PRESERVED], rejects: false },
    { label: "두 요구를 지원하는 상대에게 v7을 전송한다", advertised: [BG3D, PRESERVED], required: [BG3D, PRESERVED], rejects: false },
    { label: "요구 없는 v6은 no-cap 상대에게 전송한다", advertised: [], required: [], rejects: false },
    { label: "요구 없는 v6은 3D-only 상대에게도 전송한다", advertised: [BG3D], required: [], rejects: false },
  ])("$label", async ({ advertised, required, rejects }) => {
    const send = MemoryDataChannel.prototype.send;
    const frames: unknown[] = [];
    let advertisements = 0;
    const spy = vi.spyOn(MemoryDataChannel.prototype, "send")
      .mockImplementation(function (this: MemoryDataChannel, data: string | ArrayBuffer) {
        if (typeof data !== "string") return send.call(this, data);
        const frame = JSON.parse(data);
        if (frame.wire === STUDIO_LIVE_P2P_CAPS_WIRE) {
          advertisements += 1;
          return send.call(this, JSON.stringify({ ...frame, readerCapabilities: advertised }));
        }
        if (frame.kind === "update" && frame.payload?.updateId === UPDATE_ID) frames.push(frame);
        return send.call(this, data);
      });
    const hub = new MemoryRtcHub();
    const bus = new SignalingBus();
    const localPrimary = bus.create(LOCAL);
    const remotePrimary = bus.create(REMOTE);
    const wrap = (primary: FakePrimaryTransport, participant: StudioLiveParticipant) =>
      applyStudioLiveP2pOverlay(() => withoutPrimaryCrdt(primary), {
        createPeerConnection: () => hub.create(), now: () => NOW,
      })(contextFor(participant));
    const local = wrap(localPrimary, LOCAL);
    const remote = wrap(remotePrimary, REMOTE);
    const received: StudioCrdtTransportMessage[] = [];
    remote.subscribeCrdt?.((message) => received.push(message));
    try {
      await local.connect();
      await remote.connect();
      localPrimary.emit(envelope({ sender: REMOTE, kind: "presence:heartbeat",
        payload: { visibility: "active", pageId: "page-1", tool: "pen" } }));
      remotePrimary.emit(envelope({ sender: LOCAL, kind: "presence:heartbeat", sequence: 2,
        payload: { visibility: "active", pageId: "page-1", tool: "pen" } }));
      await flush();
      expect(advertisements).toBeGreaterThan(0);
      const request: StudioCrdtUpdateRequest = {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "work-p2p",
        updateId: UPDATE_ID, clientSequence: 1,
        update: Buffer.from(updateBytes(required.length > 0)).toString("base64"),
        readerCapabilities: [BG3D, PRESERVED],
        ...(required.length ? { requiredReaderCapabilities: required } : {}),
        ...(required.includes(BG3D) ? { artifactScope: "work" as const } : {}),
      };
      const publication = local.publishCrdtUpdate?.(request);
      if (!publication) throw new Error("P2P 원고 publish 경로가 없습니다.");
      if (rejects) {
        await expect(publication).rejects.toThrow("publish-partial-failed");
        expect(frames).toEqual([]);
        expect(received).toEqual([]);
      } else {
        await expect(publication).resolves.toMatchObject({ updateId: UPDATE_ID, duplicate: false });
        expect(frames).toHaveLength(1);
        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({ type: "update", update: {
          updateId: UPDATE_ID, update: request.update,
          readerCapabilities: request.readerCapabilities,
          ...(required.length ? { requiredReaderCapabilities: required } : {}),
        } });
      }
      expect(localPrimary.publishCrdtUpdate).not.toHaveBeenCalled();
    } finally {
      local.close();
      remote.close();
      spy.mockRestore();
    }
  });
});
