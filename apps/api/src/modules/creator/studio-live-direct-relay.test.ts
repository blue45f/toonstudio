import { describe, expect, it, vi } from "vitest";

import { relayDirect } from "./studio-live-gateway-handlers-voice";
import { emitRelayToSocket } from "./studio-live-gateway-relay";
import {
  StudioLiveDirectRelaySchema,
  StudioLiveInterServerRelayEventSchema,
  type StudioLiveParticipant,
  type StudioLiveSocket,
} from "./studio-live.protocol";

import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";

const WORK_ID = "work-direct-relay";
const TARGET_CONNECTION_ID = "connection-target-1";

function directPacket(payload = "{\"kind\":\"space-state\",\"sequence\":7}"): string {
  return JSON.stringify({ wire: "studio-direct-v1", workId: WORK_ID, payload });
}

const senderParticipant = {
  connectionId: "connection-sender-1",
  clientInstanceId: "session-sender-1",
  name: "발신자",
  role: "editor",
  capabilities: { view: true, comment: true, edit: true, manageMembers: false },
  state: "active",
  pageId: null,
  tool: null,
  sharingScreen: false,
  joinedAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
} as unknown as StudioLiveParticipant;

interface RelayCapture {
  relay: unknown;
}

function stubHost(overrides: Record<string, unknown> = {}): {
  host: StudioLiveGatewayHost;
  captured: RelayCapture;
} {
  const captured: RelayCapture = { relay: null };
  const authorization = {
    ok: true as const,
    sender: senderParticipant,
    senderAuthorizationSequence: 1,
    senderPrincipal: {},
    target: { ...senderParticipant, connectionId: TARGET_CONNECTION_ID },
    targetAuthorizationSequence: 1,
    targetPrincipal: {},
  };
  const host = {
    consumeRateLimit: () => true,
    hasLocalRelayTarget: () => true,
    authorizeRelayPeers: async () => authorization,
    isRelayAuthorizationCurrent: () => true,
    emitAuthorizedLocalRelay: (_authorization: unknown, relay: unknown) => {
      captured.relay = relay;
      return true;
    },
    authorizeRemoteRelaySender: async () => ({ ok: true as const, sender: senderParticipant }),
    sendInterServerRelay: async (
      _sender: unknown,
      _workId: string,
      _targetConnectionId: string,
      relay: unknown
    ) => {
      captured.relay = relay;
      return true;
    },
    ...overrides,
  };
  return { host: host as unknown as StudioLiveGatewayHost, captured };
}

const client = { id: "socket-sender-1" } as unknown as StudioLiveSocket;

describe("StudioLiveDirectRelaySchema", () => {
  it("accepts a well-formed studio-direct packet for the same work", () => {
    const parsed = StudioLiveDirectRelaySchema.safeParse({
      workId: WORK_ID,
      targetConnectionId: TARGET_CONNECTION_ID,
      packet: directPacket(),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a packet whose work id differs from the relay work id", () => {
    const parsed = StudioLiveDirectRelaySchema.safeParse({
      workId: WORK_ID,
      targetConnectionId: TARGET_CONNECTION_ID,
      packet: JSON.stringify({
        wire: "studio-direct-v1",
        workId: "work-other",
        payload: "{}",
      }),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-direct packets and oversized packets", () => {
    expect(
      StudioLiveDirectRelaySchema.safeParse({
        workId: WORK_ID,
        targetConnectionId: TARGET_CONNECTION_ID,
        packet: JSON.stringify({ hello: "world" }),
      }).success
    ).toBe(false);
    expect(
      StudioLiveDirectRelaySchema.safeParse({
        workId: WORK_ID,
        targetConnectionId: TARGET_CONNECTION_ID,
        packet: directPacket("a".repeat(70 * 1024)),
      }).success
    ).toBe(false);
  });

  it("is part of the inter-server relay event union", () => {
    const parsed = StudioLiveInterServerRelayEventSchema.safeParse({
      type: "direct-relay",
      relayId: "00000000-0000-4000-8000-000000000001",
      packet: directPacket(),
    });
    expect(parsed.success).toBe(true);
  });
});

describe("relayDirect gateway handler", () => {
  it("delivers to a local target after peer authorization", async () => {
    const { host, captured } = stubHost();
    const ack = vi.fn();
    await relayDirect.call(
      host,
      client,
      { workId: WORK_ID, targetConnectionId: TARGET_CONNECTION_ID, packet: directPacket() },
      ack
    );
    expect(captured.relay).toMatchObject({ type: "direct-relay", packet: directPacket() });
    expect(ack).toHaveBeenCalledWith({
      ok: true,
      data: { delivered: true, relayId: expect.any(String) },
    });
  });

  it("routes through the inter-server relay when the target is remote", async () => {
    const { host, captured } = stubHost({ hasLocalRelayTarget: () => false });
    const ack = vi.fn();
    await relayDirect.call(
      host,
      client,
      { workId: WORK_ID, targetConnectionId: TARGET_CONNECTION_ID, packet: directPacket() },
      ack
    );
    expect(captured.relay).toMatchObject({ type: "direct-relay" });
    expect(ack).toHaveBeenCalledWith({
      ok: true,
      data: { delivered: true, relayId: expect.any(String) },
    });
  });

  it("rejects an invalid payload without relaying", async () => {
    const { host, captured } = stubHost();
    const ack = vi.fn();
    await relayDirect.call(
      host,
      client,
      { workId: WORK_ID, targetConnectionId: TARGET_CONNECTION_ID, packet: "not-a-packet" },
      ack
    );
    expect(captured.relay).toBeNull();
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, code: "invalid_payload" })
    );
  });

  it("stops at the rate limit before any authorization work", async () => {
    const authorizeRelayPeers = vi.fn();
    const { host, captured } = stubHost({
      consumeRateLimit: () => false,
      authorizeRelayPeers,
    });
    const ack = vi.fn();
    await relayDirect.call(
      host,
      client,
      { workId: WORK_ID, targetConnectionId: TARGET_CONNECTION_ID, packet: directPacket() },
      ack
    );
    expect(authorizeRelayPeers).not.toHaveBeenCalled();
    expect(captured.relay).toBeNull();
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, code: "rate_limited" })
    );
  });

  it("propagates an authorization failure and does not relay", async () => {
    const { host, captured } = stubHost({
      authorizeRelayPeers: async () => ({
        ok: false as const,
        response: { ok: false as const, code: "forbidden" as const, message: "권한이 없습니다." },
      }),
    });
    const ack = vi.fn();
    await relayDirect.call(
      host,
      client,
      { workId: WORK_ID, targetConnectionId: TARGET_CONNECTION_ID, packet: directPacket() },
      ack
    );
    expect(captured.relay).toBeNull();
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, code: "forbidden" })
    );
  });
});

describe("emitRelayToSocket direct-relay branch", () => {
  it("emits studio:direct:relay with the sender identity and opaque packet", () => {
    const emit = vi.fn();
    const targetSocket = { emit } as unknown as StudioLiveSocket;
    emitRelayToSocket.call(
      {} as StudioLiveGatewayHost,
      targetSocket,
      senderParticipant,
      { type: "direct-relay", relayId: "relay-1", packet: directPacket() }
    );
    expect(emit).toHaveBeenCalledWith("studio:direct:relay", {
      fromConnectionId: "connection-sender-1",
      fromName: "발신자",
      packet: directPacket(),
    });
  });
});
