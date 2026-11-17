import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioLiveSocketTransport,
  type StudioLiveSocketLike,
} from "./studio-live-socket-transport";
import { JOIN_RESYNC_RETRY_MAX_MS } from "./studio-live-socket-transport-types";

const PARTICIPANT = {
  sessionId: "reconnect-client",
  displayName: "재연결 시험",
  role: "owner" as const,
};

class ReconnectSocket implements StudioLiveSocketLike {
  connected = false;
  connectCalls = 0;
  joins = 0;
  nextConnectError: unknown = null;
  auth: Record<string, unknown>;
  readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(auth: { sessionToken: string }) {
    this.auth = { ...auth };
  }

  connect(): StudioLiveSocketLike {
    this.connectCalls += 1;
    if (this.nextConnectError !== null) {
      const error = this.nextConnectError;
      this.nextConnectError = null;
      this.serverEmit("connect_error", error);
      return this;
    }
    this.connected = true;
    this.serverEmit("connect");
    return this;
  }

  disconnect(): StudioLiveSocketLike {
    if (this.connected) this.serverDisconnect("io client disconnect");
    return this;
  }

  emit(event: string, ...args: unknown[]): StudioLiveSocketLike {
    const acknowledge = args.at(-1);
    if (event !== "studio:join" || typeof acknowledge !== "function") return this;
    this.joins += 1;
    const self = {
      connectionId: `reconnect-connection-${this.connectCalls}`,
      clientInstanceId: PARTICIPANT.sessionId,
      name: PARTICIPANT.displayName,
      role: PARTICIPANT.role,
      capabilities: { view: true, comment: true, edit: true, manageMembers: true },
      state: "active",
      pageId: null,
      tool: null,
      sharingScreen: false,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    acknowledge({ ok: true, data: { self, participants: [self], locks: [] } });
    return this;
  }

  on(event: string, listener: (...args: unknown[]) => void): StudioLiveSocketLike {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): StudioLiveSocketLike {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  serverEmit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  serverDisconnect(reason: string): void {
    this.connected = false;
    this.serverEmit("disconnect", reason);
  }
}

const transports: StudioLiveSocketTransport[] = [];

function createTransport(refreshSocketCredential?: () => Promise<string>) {
  const socket = new ReconnectSocket({ sessionToken: "test-session" });
  const transport = new StudioLiveSocketTransport(
    { workId: "reconnect-work", participant: PARTICIPANT },
    "test-session",
    { createSocket: () => socket, refreshSocketCredential },
  );
  transports.push(transport);
  return { socket, transport };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  transports.splice(0).forEach((transport) => transport.close());
  vi.useRealTimers();
});

describe("서버가 종료한 Studio Socket.IO 연결 복구", () => {
  it("서버 종료는 지연 후 한 번 재접속하고 새 JOIN 승인으로 복구한다", async () => {
    const { socket, transport } = createTransport();
    await transport.connect();
    const previousConnection = transport.selfConnectionId;

    socket.serverDisconnect("io server disconnect");
    socket.serverDisconnect("io server disconnect");
    expect(transport.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS - 1);
    expect(socket.connectCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(socket.connectCalls).toBe(2);
    expect(socket.joins).toBe(2);
    expect(transport.selfConnectionId).not.toBe(previousConnection);
    expect(transport.ready).toBe(true);
    expect(transport.reconnectExhausted).toBe(false);
  });

  it("지연 재접속이 네트워크 오류로 실패해도 다음 간격에 다시 참가한다", async () => {
    const { socket, transport } = createTransport();
    await transport.connect();
    const previousConnection = transport.selfConnectionId;
    socket.serverDisconnect("io server disconnect");
    socket.nextConnectError = new Error("websocket error");

    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS);
    expect(socket.connectCalls).toBe(2);
    expect(socket.joins).toBe(1);
    expect(transport.ready).toBe(false);
    expect(transport.accessRevoked).toBe(false);
    expect(transport.reconnectExhausted).toBe(true);
    expect(transport.socketReconnectTimeout).not.toBeNull();

    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS - 1);
    expect(socket.connectCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.connectCalls).toBe(3);
    expect(socket.joins).toBe(2);
    expect(transport.selfConnectionId).not.toBe(previousConnection);
    expect(transport.ready).toBe(true);
    expect(transport.reconnectExhausted).toBe(false);
    expect(transport.socketReconnectTimeout).toBeNull();
  });

  it.each(["transport close", "io client disconnect"])(
    "%s에서는 별도 재접속 타이머를 중복으로 시작하지 않는다",
    async (reason) => {
      const { socket, transport } = createTransport();
      await transport.connect();
      socket.serverDisconnect(reason);
      await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS * 2);
      expect(socket.connectCalls).toBe(1);
      expect(transport.socketReconnectTimeout).toBeNull();
    },
  );

  it("참가하지 않은 연결에 서버 종료 이벤트가 와도 자동 재접속하지 않는다", async () => {
    const { socket, transport } = createTransport();
    socket.serverDisconnect("io server disconnect");
    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS * 2);
    expect(socket.connectCalls).toBe(0);
    expect(transport.socketReconnectTimeout).toBeNull();
  });

  it("대기 중 권한이 해제되면 재접속 예약을 취소한다", async () => {
    const { socket, transport } = createTransport();
    await transport.connect();
    socket.serverDisconnect("io server disconnect");
    socket.serverEmit("studio:access:revoked", { message: "시험 권한 해제" });
    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS * 2);
    expect(transport.accessRevoked).toBe(true);
    expect(socket.connectCalls).toBe(1);
    expect(transport.socketReconnectTimeout).toBeNull();
  });

  it("재접속 인증이 거부되면 이후 재시도와 JOIN을 중단한다", async () => {
    const { socket, transport } = createTransport();
    await transport.connect();
    socket.serverDisconnect("io server disconnect");
    socket.nextConnectError = { message: "시험 접근 거부", data: { code: "forbidden" } };
    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS * 3);
    expect(socket.connectCalls).toBe(2);
    expect(socket.joins).toBe(1);
    expect(transport.accessRevoked).toBe(true);
    expect(transport.socketReconnectTimeout).toBeNull();
  });

  it("재접속 때 만료된 입장권은 한 번 갱신한 뒤 다시 참가한다", async () => {
    const refresh = vi.fn(async () => "refreshed-test-session");
    const { socket, transport } = createTransport(refresh);
    await transport.connect();
    socket.serverDisconnect("io server disconnect");
    socket.nextConnectError = { message: "시험 입장권 만료", data: { code: "unauthenticated" } };
    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS);
    expect(refresh).toHaveBeenCalledOnce();
    expect(socket.auth).toEqual({ sessionToken: "refreshed-test-session" });
    expect(socket.connectCalls).toBe(3);
    expect(socket.joins).toBe(2);
    expect(transport.ready).toBe(true);
  });

  it("갱신한 입장권까지 거부되면 다시 갱신하거나 재접속하지 않는다", async () => {
    const refresh = vi.fn(async () => "refreshed-test-session");
    const { socket, transport } = createTransport(refresh);
    const unauthenticated = { message: "시험 입장권 거부", data: { code: "unauthenticated" } };
    refresh.mockImplementationOnce(async () => {
      socket.nextConnectError = unauthenticated;
      return "refreshed-test-session";
    });
    await transport.connect();
    socket.serverDisconnect("io server disconnect");
    socket.nextConnectError = unauthenticated;

    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS * 3);
    expect(refresh).toHaveBeenCalledOnce();
    expect(socket.connectCalls).toBe(3);
    expect(socket.joins).toBe(1);
    expect(socket.auth).toEqual({});
    expect(transport.accessRevoked).toBe(true);
    expect(transport.socketReconnectTimeout).toBeNull();
  });

  it("연결을 명시적으로 닫으면 예약된 재접속도 종료한다", async () => {
    const { socket, transport } = createTransport();
    await transport.connect();
    socket.serverDisconnect("io server disconnect");
    transport.close();
    await vi.advanceTimersByTimeAsync(JOIN_RESYNC_RETRY_MAX_MS * 2);
    expect(socket.connectCalls).toBe(1);
    expect(transport.socketReconnectTimeout).toBeNull();
  });
});
