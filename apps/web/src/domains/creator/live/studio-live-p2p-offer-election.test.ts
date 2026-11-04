import { describe, expect, it, vi } from "vitest";

import { createStudioLiveEnvelope, type StudioLiveEnvelope } from "./studio-live-collaboration-protocol";
import type { StudioLiveTransport } from "./studio-live-collaboration-transport";
import { applyStudioLiveP2pOverlay } from "./studio-live-p2p-overlay-transport";
import type { StudioLiveP2pRtcPeerConnection } from "./studio-live-p2p-rtc-types";

function rtcConnection(): StudioLiveP2pRtcPeerConnection {
  return {
    connectionState: "new",
    onicecandidate: null,
    ondatachannel: null,
    onconnectionstatechange: null,
    createDataChannel: (label) => ({
      label, readyState: "connecting", bufferedAmount: 0,
      send: vi.fn(), close: vi.fn(), onopen: null, onclose: null, onmessage: null,
    }),
    createOffer: async () => ({ type: "offer", sdp: "v=0" }),
    createAnswer: async () => ({ type: "answer", sdp: "v=0" }),
    setLocalDescription: async () => undefined,
    setRemoteDescription: async () => undefined,
    addIceCandidate: async () => undefined,
    close: vi.fn(),
  };
}

async function emittedOffers(selfId: string, peerId: string, wireId?: string | null) {
  const listeners = new Set<(value: unknown) => void>();
  const sent: StudioLiveEnvelope[] = [];
  const primary: StudioLiveTransport = {
    mode: "server", ready: true,
    connect: async () => undefined,
    close: vi.fn(),
    send: (value) => { sent.push(value); return true; },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    ...(wireId === undefined ? {} : { transportSessionId: () => wireId }),
  };
  const transport = applyStudioLiveP2pOverlay(() => primary, { createPeerConnection: rtcConnection })({
    workId: "election-work", roomName: "election-room",
    participant: { sessionId: selfId, displayName: "작가", role: "owner" },
  });
  try {
    await transport.connect();
    const presence = createStudioLiveEnvelope({
      workId: "election-work", sentAt: Date.now(), sequence: 1,
      sender: { sessionId: peerId, displayName: "동료", role: "editor" },
      kind: "presence:heartbeat",
      payload: { visibility: "active", pageId: "page-1", tool: "pen" },
    });
    for (const listener of listeners) listener(presence);
    await vi.waitFor(() => expect(listeners.size).toBe(1));
    await Promise.resolve();
    await Promise.resolve();
    return sent.filter((message) => message.kind === "webrtc:description");
  } finally {
    transport.close();
  }
}

describe("서버 연결 ID로 P2P 제안자 선택", () => {
  it.each(["z-client", "0-client"])("%s UUID에서도 두 참가자 중 하나만 상대에게 제안한다", async (prefix) => {
    const left = await emittedOffers(`${prefix}-a`, "connection-b", "connection-a");
    const right = await emittedOffers(`${prefix}-b`, "connection-a", "connection-b");
    expect(left).toHaveLength(1);
    expect(left[0]?.targetSessionId).toBe("connection-b");
    expect(right).toHaveLength(0);
  });

  it("재접속으로 연결 ID 순서가 바뀌면 새 연결 중 하나만 제안한다", async () => {
    const left = await emittedOffers("0-client-a", "connection-a", "connection-z");
    const right = await emittedOffers("z-client-b", "connection-z", "connection-a");
    expect(left).toHaveLength(0);
    expect(right).toHaveLength(1);
    expect(right[0]?.targetSessionId).toBe("connection-z");
  });

  it.each([undefined, null])("연결 ID 매핑이 %s이면 기존 세션 ID 비교를 유지한다", async (mapping) => {
    expect(await emittedOffers("client-a", "client-b", mapping)).toHaveLength(1);
    expect(await emittedOffers("client-b", "client-a", mapping)).toHaveLength(0);
  });
});
