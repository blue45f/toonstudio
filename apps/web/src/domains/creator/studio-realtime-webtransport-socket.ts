import type {
  StudioCloudflareRealtimeWebSocketFactory,
  StudioCloudflareRealtimeWebSocketLike,
} from "./studio-realtime-provider-cloudflare-adapter";

/**
 * WebTransport(QUIC/HTTP3) 위에서 기존 Cloudflare 실시간 어댑터의 소켓 계약을
 * 그대로 구현하는 전송 계층.
 *
 * 왜 소켓 계약인가: 실시간 스택의 와이어 프로토콜(welcome·발행 ack·presence
 * 스냅샷·재생)은 `studio-realtime-provider-cloudflare-adapter`가 소유하고,
 * 그 어댑터는 `StudioCloudflareRealtimeWebSocketLike`만 요구한다. 전송만 교체하면
 * 프로토콜·티켓·재개 의미가 WebSocket 경로와 완전히 동일하게 유지되고, 서버는
 * 같은 방 프로토콜을 WebTransport로 종단하기만 하면 된다(서버 계약은 별도 문서).
 *
 * 레인 구분(현행 프로토콜 분류 기준):
 * - reliable 스트림: ping·resume·ack 대상 발행 등 전부. 길이 접두(4바이트
 *   big-endian) + UTF-8 JSON 프레임으로 WebSocket의 메시지 경계를 재현한다.
 * - unreliable 데이터그램: `presence.cursor` 발행 프레임만. 최신 좌표가 이전 것을
 *   대체하는 휘발성 동기화라 유실이 허용된다. 전송 측은 최신값 합치기(전송 중
 *   1개 + 대기 최신 1개)를 적용하고, 협상된 최대 크기를 넘는 프레임은 reliable로
 *   되돌린다. 단, 발행 ack 의미는 서버 계약이 정하므로 이 레인은
 *   옵션(`datagramCursorLane`)으로 명시 활성화할 때만 열린다.
 *   기본값은 전 프레임 reliable — WebSocket과 동작이 동일하다.
 */

export interface StudioWebTransportBidirectionalStreamLike {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

export interface StudioWebTransportCloseInfoLike {
  readonly closeCode?: number;
  readonly reason?: string;
}

export interface StudioWebTransportLike {
  readonly ready: Promise<void>;
  readonly closed: Promise<StudioWebTransportCloseInfoLike | undefined>;
  readonly protocol: string;
  readonly datagrams: {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    /** 협상으로 정해진 송신 데이터그램 최대 크기(바이트). 구현이 알려줄 때만 있다. */
    readonly maxDatagramSize?: number;
  };
  createBidirectionalStream(): Promise<StudioWebTransportBidirectionalStreamLike>;
  close(info?: StudioWebTransportCloseInfoLike): void;
}

export type StudioWebTransportFactory = (
  url: string,
  protocols: readonly string[],
) => StudioWebTransportLike;

const READY_STATE_CONNECTING = 0;
const READY_STATE_OPEN = 1;
const READY_STATE_CLOSING = 2;
const READY_STATE_CLOSED = 3;
/** 데이터그램 1개의 상한. 커서 프레임은 수백 바이트 수준이라 여유를 둬도 작다. */
const MAX_DATAGRAM_BYTES = 16 * 1024;
/** 스트림 프레임 상한 — 프로토콜 자체 한계보다 크게 잡은 위생 가드. */
const MAX_STREAM_FRAME_BYTES = 32 * 1024 * 1024;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function defaultCreateTransport(
  url: string,
  protocols: readonly string[],
): StudioWebTransportLike {
  // 티켓은 WebSocket과 동일하게 두 번째 프로토콜 토큰으로 실린다. WebTransport의
  // protocols 옵션(CONNECT의 프로토콜 협상)이 그 자리를 그대로 제공한다.
  const transport = new WebTransport(url, { protocols: [...protocols] });
  return transport as unknown as StudioWebTransportLike;
}

/**
 * 휘발성 프레임 판정: 발행 프레임 중 presence 채널의 커서 이벤트만 데이터그램
 * 후보다. 파싱에 실패한 프레임은 항상 reliable로 보내 안전側에 선다.
 */
export function isStudioRealtimeVolatileFrame(data: string): boolean {
  try {
    const frame = JSON.parse(data) as {
      readonly type?: unknown;
      readonly channel?: unknown;
      readonly payload?: { readonly kind?: unknown } | null;
    };
    return (
      frame.type === "publish" &&
      frame.channel === "presence" &&
      frame.payload?.kind === "presence.cursor"
    );
  } catch {
    return false;
  }
}

/** wss 방 URL을 WebTransport용 https URL로 옮긴다. endpoint가 있으면 그 origin을 쓴다. */
export function studioWebTransportUrl(
  socketUrl: string,
  endpoint?: string,
): string {
  const url = new URL(socketUrl);
  if (endpoint) {
    const base = new URL(endpoint);
    base.pathname = url.pathname;
    base.search = url.search;
    return base.toString();
  }
  url.protocol = "https:";
  return url.toString();
}

function frameStreamBytes(payload: Uint8Array): Uint8Array {
  const framed = new Uint8Array(4 + payload.byteLength);
  new DataView(framed.buffer).setUint32(0, payload.byteLength, false);
  framed.set(payload, 4);
  return framed;
}

function sanitizeCloseCode(code: number | undefined): number {
  if (
    typeof code !== "number" ||
    !Number.isInteger(code) ||
    code < 0 ||
    code > 65_535 ||
    code === 1005 ||
    code === 1006 ||
    code === 1015
  ) {
    return 1000;
  }
  return code;
}

type SocketListener = (
  event: Event | MessageEvent<unknown> | CloseEvent,
) => void;

export interface StudioWebTransportSocketOptions {
  readonly createTransport?: StudioWebTransportFactory;
  readonly datagramCursorLane?: boolean;
}

export class StudioWebTransportSocket
  implements StudioCloudflareRealtimeWebSocketLike
{
  private state = READY_STATE_CONNECTING;
  private readonly listeners = new Map<string, Set<SocketListener>>();
  private readonly transport: StudioWebTransportLike;
  private readonly protocols: readonly string[];
  private readonly datagramCursorLane: boolean;
  private streamWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private datagramWriter: WritableStreamDefaultWriter<Uint8Array> | null =
    null;
  private datagramInFlight = false;
  private datagramPending: Uint8Array | null = null;
  private requestedClose: { code: number; reason: string } | null = null;
  private closeDispatched = false;

  constructor(
    url: string,
    protocols: readonly string[],
    options: StudioWebTransportSocketOptions = {},
  ) {
    this.protocols = protocols;
    this.datagramCursorLane = options.datagramCursorLane ?? false;
    const createTransport = options.createTransport ?? defaultCreateTransport;
    this.transport = createTransport(url, protocols);
    void this.transport.ready.then(
      () => void this.openStreams(),
      () => this.failBeforeOpen(),
    );
    void this.transport.closed.then(
      (info) => this.handleTransportClosed(info),
      () => this.handleTransportClosed(undefined),
    );
  }

  get readyState(): number {
    return this.state;
  }

  get protocol(): string {
    // 서버가 프로토콜 토큰을 선택하면 그 값을, 아니면 클라이언트가 제시한 첫
    // 토큰(앱 프로토콜)을 돌려준다 — 어댑터의 onOpen 프로토콜 검사가 이 값을 본다.
    return this.transport.protocol || this.protocols[0] || "";
  }

  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: SocketListener,
  ): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(
    type: "open" | "message" | "close" | "error",
    listener: SocketListener,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    if (this.state === READY_STATE_CONNECTING) {
      throw new DOMException(
        "WebTransport socket is not open yet.",
        "InvalidStateError",
      );
    }
    if (this.state !== READY_STATE_OPEN) return;
    const bytes = textEncoder.encode(data);
    if (
      this.datagramCursorLane &&
      this.datagramWriter &&
      bytes.byteLength <= this.effectiveDatagramCap() &&
      isStudioRealtimeVolatileFrame(data)
    ) {
      this.enqueueDatagram(bytes);
      return;
    }
    const writer = this.streamWriter;
    if (!writer) return;
    void writer
      .write(frameStreamBytes(bytes))
      .catch(() => this.failFromStreamIo());
  }

  close(code?: number, reason?: string): void {
    if (this.state >= READY_STATE_CLOSING) return;
    this.state = READY_STATE_CLOSING;
    this.requestedClose = {
      code: sanitizeCloseCode(code),
      reason: reason ?? "",
    };
    try {
      this.transport.close({
        closeCode: this.requestedClose.code,
        reason: this.requestedClose.reason,
      });
    } catch {
      this.handleTransportClosed(undefined);
    }
  }

  /** 협상된 최대 크기가 보고되면 그쪽이 상한이다 — 초과 쓰기는 규격상 버려진다. */
  private effectiveDatagramCap(): number {
    const reported = this.transport.datagrams.maxDatagramSize;
    return typeof reported === "number" && reported > 0
      ? Math.min(MAX_DATAGRAM_BYTES, reported)
      : MAX_DATAGRAM_BYTES;
  }

  /**
   * 최신값 합치기: 전송 중 1개 + 대기 1개(최신)만 유지한다. 정체 시 오래된 커서가
   * 큐에 쌓여 늦게 도착하는 것보다, 중간 커서를 버리고 최신만 보내는 편이
   * latest-wins 의미에 맞다. 쓰기 실패는 조용히 버린다(다음 커서가 대체하고,
   * 전송 자체가 죽으면 closed 경로가 오류를 알린다).
   */
  private enqueueDatagram(bytes: Uint8Array): void {
    if (this.datagramInFlight) {
      this.datagramPending = bytes;
      return;
    }
    const writer = this.datagramWriter;
    if (!writer) return;
    this.datagramInFlight = true;
    void writer
      .write(bytes)
      .catch(() => undefined)
      .finally(() => {
        this.datagramInFlight = false;
        const pending = this.datagramPending;
        this.datagramPending = null;
        if (pending && this.state === READY_STATE_OPEN) {
          this.enqueueDatagram(pending);
        }
      });
  }

  private async openStreams(): Promise<void> {
    if (this.state !== READY_STATE_CONNECTING) return;
    try {
      const stream = await this.transport.createBidirectionalStream();
      if (this.state !== READY_STATE_CONNECTING) return;
      this.streamWriter = stream.writable.getWriter();
      this.datagramWriter = this.transport.datagrams.writable.getWriter();
      this.state = READY_STATE_OPEN;
      this.dispatch("open", { type: "open" });
      void this.pumpStream(stream.readable);
      void this.pumpDatagrams();
    } catch {
      this.failBeforeOpen();
    }
  }

  private async pumpStream(
    readable: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const reader = readable.getReader();
    let buffer = new Uint8Array(0);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        const merged = new Uint8Array(buffer.byteLength + value.byteLength);
        merged.set(buffer, 0);
        merged.set(value, buffer.byteLength);
        buffer = merged;
        while (buffer.byteLength >= 4) {
          const length = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            4,
          ).getUint32(0, false);
          if (length > MAX_STREAM_FRAME_BYTES) return;
          if (buffer.byteLength < 4 + length) break;
          const payload = buffer.subarray(4, 4 + length);
          buffer = buffer.subarray(4 + length);
          this.dispatch("message", {
            type: "message",
            data: textDecoder.decode(payload),
          });
        }
      }
    } catch {
      // 스트림 오류는 transport.closed 경로가 최종 상태를 알린다.
    }
  }

  private async pumpDatagrams(): Promise<void> {
    const reader = this.transport.datagrams.readable.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        this.dispatch("message", {
          type: "message",
          data: textDecoder.decode(value),
        });
      }
    } catch {
      // 데이터그램 수신 실패는 휘발성 레인의 문제로만 취급한다.
    }
  }

  private failBeforeOpen(): void {
    // 로컬 close가 먼저 요청됐으면 closed 경로가 요청 코드로 종료를 알린다.
    if (this.state === READY_STATE_CLOSED || this.requestedClose) return;
    this.state = READY_STATE_CLOSED;
    this.dispatch("error", { type: "error" });
    this.dispatchClose(1006, "", false);
  }

  private failFromStreamIo(): void {
    if (this.state !== READY_STATE_OPEN) return;
    try {
      this.transport.close({ closeCode: 1011, reason: "stream-io" });
    } catch {
      this.handleTransportClosed(undefined);
    }
  }

  private handleTransportClosed(
    info: StudioWebTransportCloseInfoLike | undefined,
  ): void {
    if (this.closeDispatched) return;
    this.state = READY_STATE_CLOSED;
    if (this.requestedClose) {
      this.dispatchClose(
        this.requestedClose.code,
        this.requestedClose.reason,
        true,
      );
      return;
    }
    this.dispatch("error", { type: "error" });
    this.dispatchClose(info?.closeCode ?? 1006, info?.reason ?? "", false);
  }

  private dispatchClose(code: number, reason: string, wasClean: boolean): void {
    if (this.closeDispatched) return;
    this.closeDispatched = true;
    this.dispatch("close", { type: "close", code, reason, wasClean });
  }

  private dispatch(type: string, event: { type: string; data?: string; code?: number; reason?: string; wasClean?: boolean }): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event as Event);
      } catch {
        // 리스너 격리 — 한 리스너의 예외가 전송 계층을 멈추지 않는다.
      }
    }
  }
}

export interface StudioWebTransportSocketFactoryOptions {
  /** https origin. 없으면 소켓 URL의 origin을 그대로 쓴다. */
  readonly endpoint?: string;
  readonly datagramCursorLane?: boolean;
  readonly createTransport?: StudioWebTransportFactory;
}

export function createStudioWebTransportSocketFactory(
  options: StudioWebTransportSocketFactoryOptions = {},
): StudioCloudflareRealtimeWebSocketFactory {
  return (url, protocols) =>
    new StudioWebTransportSocket(
      studioWebTransportUrl(url, options.endpoint),
      protocols,
      {
        createTransport: options.createTransport,
        datagramCursorLane: options.datagramCursorLane ?? false,
      },
    );
}
