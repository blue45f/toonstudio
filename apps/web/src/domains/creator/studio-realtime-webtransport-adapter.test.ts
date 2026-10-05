import { describe, expect, it, vi } from "vitest";

import {
  REALTIME_PROTOCOL_VERSION,
  REALTIME_TICKET_PROTOCOL_PREFIX,
  REALTIME_WEBSOCKET_PROTOCOL,
} from "../../../../../deploy/cloudflare-realtime/src/protocol";
import { StudioRealtimeProviderFallbackRequiredError } from "./studio-realtime-provider-runtime";
import {
  STUDIO_REALTIME_PROVIDER_PROTOCOL_VERSION,
  type StudioRealtimeConnectionRequest,
  type StudioRealtimeOutboundEvent,
} from "./studio-realtime-provider-protocol";
import {
  createStudioRealtimeAdapterFactories,
  createStudioWebTransportRealtimeAdapterFactory,
  resolveStudioWebTransportEndpoint,
} from "./studio-realtime-webtransport-adapter";
import {
  createStudioWebTransportSocketFactory,
  isStudioRealtimeVolatileFrame,
  studioWebTransportUrl,
  type StudioWebTransportCloseInfoLike,
  type StudioWebTransportLike,
} from "./studio-realtime-webtransport-socket";

const scope = { workId: "work-1", roomId: "room-1" } as const;
const LOCAL_SESSION = "00000000-0000-4000-8000-000000000001";
const TICKET = "opaque-ticket-123456789012345678901234567890";

class FakeWebTransport implements StudioWebTransportLike {
  protocol = "";
  readonly streamSent: Uint8Array[] = [];
  readonly datagramSent: Uint8Array[] = [];
  readonly closeCalls: StudioWebTransportCloseInfoLike[] = [];
  readonly ready: Promise<void>;
  readonly closed: Promise<StudioWebTransportCloseInfoLike | undefined>;
  private resolveReady!: () => void;
  private rejectReady!: (error: unknown) => void;
  private resolveClosed!: (
    info: StudioWebTransportCloseInfoLike | undefined,
  ) => void;
  private streamController!: ReadableStreamDefaultController<Uint8Array>;
  private datagramController!: ReadableStreamDefaultController<Uint8Array>;
  private datagramGate: Promise<void> | null = null;
  private releaseDatagramGate: (() => void) | null = null;
  readonly datagrams: StudioWebTransportLike["datagrams"];

  constructor() {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.closed = new Promise((resolve) => {
      this.resolveClosed = resolve;
    });
    this.datagrams = {
      readable: new ReadableStream<Uint8Array>({
        start: (controller) => {
          this.datagramController = controller;
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write: async (chunk) => {
          if (this.datagramGate) await this.datagramGate;
          this.datagramSent.push(chunk);
        },
      }),
    };
  }

  blockDatagrams(): void {
    this.datagramGate = new Promise<void>((resolve) => {
      this.releaseDatagramGate = resolve;
    });
  }

  releaseDatagrams(): void {
    this.releaseDatagramGate?.();
    this.datagramGate = null;
    this.releaseDatagramGate = null;
  }

  setMaxDatagramSize(bytes: number): void {
    (this.datagrams as { maxDatagramSize?: number }).maxDatagramSize = bytes;
  }

  createBidirectionalStream() {
    const readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.streamController = controller;
      },
    });
    const writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.streamSent.push(chunk);
      },
    });
    return Promise.resolve({ readable, writable });
  }

  close(info?: StudioWebTransportCloseInfoLike): void {
    this.closeCalls.push(info ?? {});
    this.resolveClosed(info);
  }

  open(): void {
    this.resolveReady();
  }

  failReady(): void {
    this.rejectReady(new Error("QUIC handshake failed"));
    this.resolveClosed(undefined);
  }

  serverClose(info: StudioWebTransportCloseInfoLike): void {
    this.resolveClosed(info);
  }

  pushStream(bytes: Uint8Array): void {
    this.streamController.enqueue(bytes);
  }

  pushDatagram(bytes: Uint8Array): void {
    this.datagramController.enqueue(bytes);
  }
}

function frameJson(value: unknown): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const framed = new Uint8Array(4 + payload.byteLength);
  new DataView(framed.buffer).setUint32(0, payload.byteLength, false);
  framed.set(payload, 4);
  return framed;
}

function deframe(chunks: readonly Uint8Array[]): string[] {
  const all = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const frames: string[] = [];
  let cursor = 0;
  while (cursor + 4 <= all.byteLength) {
    const length = new DataView(all.buffer, cursor, 4).getUint32(0, false);
    frames.push(
      new TextDecoder().decode(all.subarray(cursor + 4, cursor + 4 + length)),
    );
    cursor += 4 + length;
  }
  return frames;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createSocketWith(
  transport: FakeWebTransport,
  options: { datagramCursorLane?: boolean } = {},
) {
  const factory = createStudioWebTransportSocketFactory({
    createTransport: () => transport,
    datagramCursorLane: options.datagramCursorLane,
  });
  const events: { type: string; data?: string; code?: number }[] = [];
  const socket = factory("wss://realtime.example.com/v1/rooms/work-1/room-1", [
    REALTIME_WEBSOCKET_PROTOCOL,
    `${REALTIME_TICKET_PROTOCOL_PREFIX}${TICKET}`,
  ]);
  socket.addEventListener("open", () => events.push({ type: "open" }));
  socket.addEventListener("message", (event) =>
    events.push({ type: "message", data: (event as MessageEvent).data }),
  );
  socket.addEventListener("close", (event) =>
    events.push({ type: "close", code: (event as CloseEvent).code }),
  );
  socket.addEventListener("error", () => events.push({ type: "error" }));
  return { socket, events };
}

describe("WebTransport 소켓: 수립과 프레이밍", () => {
  it("ready 후 스트림이 열리면 open을 알리고 프로토콜은 첫 토큰을 돌려준다", async () => {
    const transport = new FakeWebTransport();
    const { socket, events } = createSocketWith(transport);
    expect(socket.readyState).toBe(0);
    transport.open();
    await flush();
    expect(socket.readyState).toBe(1);
    expect(socket.protocol).toBe(REALTIME_WEBSOCKET_PROTOCOL);
    expect(events).toEqual([{ type: "open" }]);
  });

  it("전송 URL은 wss를 https로 바꾸고 티켓 프로토콜을 그대로 싣는다", () => {
    let seenUrl = "";
    let seenProtocols: readonly string[] = [];
    const transport = new FakeWebTransport();
    const factory = createStudioWebTransportSocketFactory({
      createTransport: (url, protocols) => {
        seenUrl = url;
        seenProtocols = protocols;
        return transport;
      },
    });
    factory("wss://realtime.example.com/v1/rooms/w/r?x=1", [
      REALTIME_WEBSOCKET_PROTOCOL,
      `${REALTIME_TICKET_PROTOCOL_PREFIX}${TICKET}`,
    ]);
    expect(seenUrl).toBe("https://realtime.example.com/v1/rooms/w/r?x=1");
    expect(seenProtocols[1]).toBe(`${REALTIME_TICKET_PROTOCOL_PREFIX}${TICKET}`);
    expect(
      studioWebTransportUrl(
        "wss://realtime.example.com/v1/rooms/w/r",
        "https://wt.example.com",
      ),
    ).toBe("https://wt.example.com/v1/rooms/w/r");
  });

  it("기본(데이터그램 레인 OFF)에서는 모든 프레임이 길이 접두 스트림으로 간다", async () => {
    const transport = new FakeWebTransport();
    const { socket } = createSocketWith(transport);
    transport.open();
    await flush();
    socket.send('{"type":"ping"}');
    const cursor = JSON.stringify({
      version: 1,
      type: "publish",
      channel: "presence",
      payload: { kind: "presence.cursor", x: 0.1, y: 0.2 },
    });
    socket.send(cursor);
    await flush();
    expect(transport.datagramSent).toHaveLength(0);
    expect(deframe(transport.streamSent)).toEqual(['{"type":"ping"}', cursor]);
  });

  it("스트림 수신은 청크가 쪼개져 와도 프레임을 복원해 message로 전달한다", async () => {
    const transport = new FakeWebTransport();
    const { events } = createSocketWith(transport);
    transport.open();
    await flush();
    const framed = frameJson({ type: "pong" });
    transport.pushStream(framed.subarray(0, 3));
    transport.pushStream(framed.subarray(3));
    transport.pushDatagram(
      new TextEncoder().encode('{"type":"event","via":"datagram"}'),
    );
    await flush();
    // 스트림과 데이터그램 사이에는 순서 보장이 없다 — 도착 집합으로 확인한다.
    const received = events
      .filter((event) => event.type === "message")
      .map((event) => event.data)
      .sort();
    expect(received).toEqual([
      '{"type":"event","via":"datagram"}',
      '{"type":"pong"}',
    ]);
  });
});

describe("WebTransport 소켓: 레인 구분과 종료", () => {
  it("레인 ON에서는 커서 발행만 데이터그램으로, 나머지는 스트림으로 간다", async () => {
    const transport = new FakeWebTransport();
    const { socket } = createSocketWith(transport, {
      datagramCursorLane: true,
    });
    transport.open();
    await flush();
    const cursor = JSON.stringify({
      version: 1,
      type: "publish",
      channel: "presence",
      payload: { kind: "presence.cursor", x: 0.3, y: 0.4 },
    });
    const upsert = JSON.stringify({
      version: 1,
      type: "publish",
      channel: "presence",
      payload: { kind: "presence.update" },
    });
    socket.send(cursor);
    socket.send(upsert);
    await flush();
    expect(transport.datagramSent).toHaveLength(1);
    expect(new TextDecoder().decode(transport.datagramSent[0])).toBe(cursor);
    expect(deframe(transport.streamSent)).toEqual([upsert]);
  });

  it("정체 시 데이터그램은 최신값으로 합쳐진다(중간 커서는 버려진다)", async () => {
    const transport = new FakeWebTransport();
    const { socket } = createSocketWith(transport, {
      datagramCursorLane: true,
    });
    transport.open();
    await flush();
    const cursorAt = (x: number) =>
      JSON.stringify({
        version: 1,
        type: "publish",
        channel: "presence",
        payload: { kind: "presence.cursor", x, y: 0.5 },
      });
    transport.blockDatagrams();
    socket.send(cursorAt(0.1));
    socket.send(cursorAt(0.2));
    socket.send(cursorAt(0.3));
    transport.releaseDatagrams();
    await flush();
    const sent = transport.datagramSent.map((chunk) =>
      new TextDecoder().decode(chunk),
    );
    expect(sent).toEqual([cursorAt(0.1), cursorAt(0.3)]);
  });

  it("협상된 최대 크기를 넘는 커서 프레임은 reliable 스트림으로 되돌아간다", async () => {
    const transport = new FakeWebTransport();
    transport.setMaxDatagramSize(32);
    const { socket } = createSocketWith(transport, {
      datagramCursorLane: true,
    });
    transport.open();
    await flush();
    const cursor = JSON.stringify({
      version: 1,
      type: "publish",
      channel: "presence",
      payload: { kind: "presence.cursor", x: 0.3, y: 0.4 },
    });
    socket.send(cursor);
    await flush();
    expect(transport.datagramSent).toHaveLength(0);
    expect(deframe(transport.streamSent)).toEqual([cursor]);
  });

  it("close는 코드·사유를 전송에 전달하고 wasClean 종료로 알린다", async () => {
    const transport = new FakeWebTransport();
    const { socket, events } = createSocketWith(transport);
    transport.open();
    await flush();
    socket.close(1000, "client-done");
    await flush();
    expect(transport.closeCalls).toEqual([
      { closeCode: 1000, reason: "client-done" },
    ]);
    expect(socket.readyState).toBe(3);
    expect(events).toEqual([{ type: "open" }, { type: "close", code: 1000 }]);
  });

  it("수립 실패(ready 거부)는 error 뒤 close 1006으로 수렴한다", async () => {
    const transport = new FakeWebTransport();
    const { socket, events } = createSocketWith(transport);
    transport.failReady();
    await flush();
    expect(socket.readyState).toBe(3);
    expect(events).toEqual([
      { type: "error" },
      { type: "close", code: 1006 },
    ]);
  });

  it("서버 종료는 error와 함께 서버 코드로 알린다", async () => {
    const transport = new FakeWebTransport();
    const { events } = createSocketWith(transport);
    transport.open();
    await flush();
    transport.serverClose({ closeCode: 1001, reason: "going away" });
    await flush();
    expect(events).toEqual([
      { type: "open" },
      { type: "error" },
      { type: "close", code: 1001 },
    ]);
  });
});

describe("휘발성 프레임 분류", () => {
  it("presence 커서 발행만 휘발성이고 나머지는 전부 reliable이다", () => {
    const frame = (value: unknown) => JSON.stringify(value);
    expect(
      isStudioRealtimeVolatileFrame(
        frame({
          type: "publish",
          channel: "presence",
          payload: { kind: "presence.cursor" },
        }),
      ),
    ).toBe(true);
    expect(
      isStudioRealtimeVolatileFrame(
        frame({
          type: "publish",
          channel: "presence",
          payload: { kind: "presence.update" },
        }),
      ),
    ).toBe(false);
    expect(
      isStudioRealtimeVolatileFrame(
        frame({
          type: "publish",
          channel: "comments",
          payload: { kind: "presence.cursor" },
        }),
      ),
    ).toBe(false);
    expect(isStudioRealtimeVolatileFrame('{"type":"hello"}')).toBe(false);
    expect(isStudioRealtimeVolatileFrame("not-json")).toBe(false);
  });
});

describe("WebTransport 어댑터 팩토리: 능력 감지와 체인", () => {
  it("미지원 클라이언트에서는 FallbackRequired를 던져 WebSocket으로 넘어가게 한다", () => {
    const factory = createStudioWebTransportRealtimeAdapterFactory({
      providerId: "cloudflare-realtime",
      realtimeOrigin: "https://realtime.example.com",
      webTransportEndpoint: "https://realtime.example.com",
      clientSupported: () => false,
    });
    expect(factory.descriptor).toEqual({
      providerId: "cloudflare-realtime",
      kind: "custom",
      protocolVersion: STUDIO_REALTIME_PROVIDER_PROTOCOL_VERSION,
    });
    expect(() => factory.create()).toThrow(
      StudioRealtimeProviderFallbackRequiredError,
    );
  });

  it("체인 합성: 엔드포인트가 없으면 기존 WebSocket 단일, 있으면 WT가 앞", () => {
    const without = createStudioRealtimeAdapterFactories({
      providerId: "cloudflare-realtime",
      realtimeOrigin: "https://realtime.example.com",
      clientSupported: () => false,
    });
    expect(without).toHaveLength(1);
    const withWt = createStudioRealtimeAdapterFactories({
      providerId: "cloudflare-realtime",
      realtimeOrigin: "https://realtime.example.com",
      webTransportEndpoint: "https://realtime.example.com",
      clientSupported: () => false,
    });
    expect(withWt).toHaveLength(2);
    expect(() => withWt[0]!.create()).toThrow(
      StudioRealtimeProviderFallbackRequiredError,
    );
    expect(withWt[1]!.create()).toBeDefined();
  });

  it("엔드포인트 검증은 https origin만 허용한다", () => {
    expect(resolveStudioWebTransportEndpoint("https://wt.example.com")).toBe(
      "https://wt.example.com",
    );
    expect(
      resolveStudioWebTransportEndpoint("http://wt.example.com"),
    ).toBeNull();
    expect(
      resolveStudioWebTransportEndpoint("https://wt.example.com/path"),
    ).toBeNull();
    expect(resolveStudioWebTransportEndpoint(undefined)).toBeNull();
  });
});

function connectionRequest(): StudioRealtimeConnectionRequest {
  return {
    version: 1,
    clientInstanceId: LOCAL_SESSION,
    sessionId: LOCAL_SESSION,
    scope,
    requiredWorkloads: ["presence"],
    requiredCapabilities: [
      "presence.snapshot-v1",
      "presence.members-v1",
      "presence.cursor-v1",
      "presence.resume-v1",
    ],
    resume: [],
  };
}

function welcome() {
  const state = { currentSequence: 0, replayFloorSequence: 1 };
  return {
    version: REALTIME_PROTOCOL_VERSION,
    type: "welcome",
    workId: scope.workId,
    roomId: scope.roomId,
    connectionId: "connection-1",
    actorId: "actor-1",
    clientId: LOCAL_SESSION,
    scopes: ["presence"],
    channelStates: {
      presence: state,
      comments: state,
      "screen-signaling": state,
    },
    sessionExpiresAtMs: 1_900_000_000_000,
  };
}

function presenceSnapshot() {
  return {
    version: REALTIME_PROTOCOL_VERSION,
    type: "presence-snapshot",
    channel: "presence",
    sequence: 0,
    snapshotId: "snapshot-0",
    page: 0,
    complete: true,
    generatedAtMs: Date.parse("2026-07-31T00:00:00.000Z"),
    entries: [],
  };
}

function replay() {
  return {
    version: REALTIME_PROTOCOL_VERSION,
    type: "replay",
    channel: "presence",
    fromSequence: 1,
    toSequence: 0,
    currentSequence: 0,
    complete: true,
    events: [],
  };
}

describe("WebTransport 어댑터: 전체 핸드셰이크 왕복", () => {
  it("WT 소켓 위에서 welcome 핸드셰이크와 publish/ack가 기존 계약 그대로 동작한다", async () => {
    const transport = new FakeWebTransport();
    const factory = createStudioWebTransportRealtimeAdapterFactory({
      providerId: "cloudflare-realtime",
      realtimeOrigin: "https://realtime.example.com",
      webTransportEndpoint: "https://realtime.example.com",
      clientSupported: () => true,
      createTransport: () => transport,
    });
    const adapter = await factory.create();
    const onDisconnect = vi.fn();
    const connecting = adapter.connect(
      connectionRequest(),
      TICKET,
      { onEvent: vi.fn(), onDisconnect },
      new AbortController().signal,
    );
    transport.open();
    await flush();
    // 이 프로토콜에서 먼저 말하는 쪽은 서버다(welcome). 클라이언트는 open 후
    // 어떤 프레임도 보내지 않고 welcome을 기다린다.
    expect(transport.streamSent).toHaveLength(0);

    transport.pushStream(frameJson(welcome()));
    transport.pushStream(frameJson(presenceSnapshot()));
    transport.pushStream(frameJson(replay()));
    await expect(connecting).resolves.toMatchObject({
      providerId: "cloudflare-realtime",
      providerSessionId: "connection-1",
    });

    const outbound: StudioRealtimeOutboundEvent = {
      version: 1,
      scope,
      workload: "presence",
      kind: "presence.upsert",
      eventId: "00000000-0000-4000-8000-000000000101",
      idempotencyKey: "00000000-0000-4000-8000-000000000102",
      clientSequence: "1",
      sentAt: "2026-07-31T00:00:00.000Z",
      senderSessionId: LOCAL_SESSION,
      targetSessionId: null,
      payload: {
        participant: {
          sessionId: LOCAL_SESSION,
          displayName: "작가 1",
          role: "editor",
          state: "active",
          pageId: "page-1",
          tool: "g-pen",
          updatedAt: "2026-07-31T00:00:00.000Z",
        },
      },
    };
    const publish = adapter.publish(outbound, new AbortController().signal);
    await flush();
    const frames = deframe(transport.streamSent).map(
      (frame) =>
        JSON.parse(frame) as { type: string; payload?: { kind?: string } },
    );
    const publishFrame = frames.find((frame) => frame.type === "publish");
    expect(publishFrame).toMatchObject({
      type: "publish",
      payload: { kind: "presence.update" },
    });
    transport.pushStream(
      frameJson({
        version: REALTIME_PROTOCOL_VERSION,
        type: "ack",
        channel: "presence",
        idempotencyKey: outbound.idempotencyKey,
        sequence: 7,
        duplicate: false,
      }),
    );
    await expect(publish).resolves.toMatchObject({ serverSequence: "7" });
    expect(onDisconnect).not.toHaveBeenCalled();
    await adapter.close();
  });
});
