import { describe, expect, it, vi } from "vitest";
import { StudioLiveP2pMeshHandshake } from "./studio-live-p2p-mesh-handshake";
import type { StudioLiveP2pRtcPeerConnection } from "./studio-live-p2p-rtc-types";

function peer() {
  const connection = {
    connectionState: "new", onicecandidate: null, ondatachannel: null, onconnectionstatechange: null,
    createDataChannel: vi.fn(), close: vi.fn(), addIceCandidate: vi.fn().mockResolvedValue(undefined),
    createOffer: vi.fn(async () => ({ type: "offer" as const, sdp: "original-offer" })),
    createAnswer: vi.fn(async () => ({ type: "answer" as const, sdp: "original-answer" })),
    setLocalDescription: vi.fn().mockResolvedValue(undefined), setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  } satisfies StudioLiveP2pRtcPeerConnection;
  const current = vi.fn(() => true), time = vi.fn(() => 0), send = vi.fn(), ice = vi.fn();
  return { connection, current, time, send, ice, handshake: new StudioLiveP2pMeshHandshake(connection, current, time, send, ice) };
}

describe("협업 데이터 채널의 첫 연결 복구", () => {
  it("상대가 응답하지 않아도 횟수·시간을 넘겨 재전송하지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const waiting = peer(), expired = peer(), left = peer();
      await Promise.all([waiting.handshake.offer(), expired.handshake.offer(), left.handshake.offer()]);
      expired.time.mockReturnValue(60000);
      left.current.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(60000);
      expect(waiting.send).toHaveBeenCalledTimes(9);
      expect(expired.send).toHaveBeenCalledTimes(1);
      expect(left.send).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("수신자가 참가 승인 전 놓친 제안과 ICE를 새 접속 알림 없이 다시 받는다", async () => {
    vi.useFakeTimers();
    try {
      const sender = peer(), receiver = peer();
      sender.time.mockImplementation(Date.now);
      let joined = false;
      sender.send.mockImplementation((type, sdp) => {
        if (joined) void receiver.handshake.receive(type, sdp);
      });
      sender.ice.mockImplementation(candidate => {
        if (joined) void receiver.handshake.onRemoteIce(candidate);
      });
      receiver.send.mockImplementation((type, sdp) => { void sender.handshake.receive(type, sdp); });
      await sender.handshake.offer();
      sender.handshake.onLocalIce({ candidate: "original-ice" });
      expect(receiver.connection.setRemoteDescription).not.toHaveBeenCalled();
      joined = true;
      await vi.advanceTimersByTimeAsync(3500);
      expect(receiver.connection.setRemoteDescription).toHaveBeenCalledWith({ type: "offer", sdp: "original-offer" });
      expect(receiver.connection.addIceCandidate).toHaveBeenCalledWith({ candidate: "original-ice" });
      expect(sender.connection.setRemoteDescription).toHaveBeenCalledWith({ type: "answer", sdp: "original-answer" });
      await vi.advanceTimersByTimeAsync(60000);
      expect(sender.send).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("첫 제안 또는 응답이 유실되면 같은 연결의 SDP·ICE를 재전송하고 연결 후 멈춘다", async () => {
    const a = peer(), b = peer(), candidate = { candidate: "host", sdpMid: "0" };
    await a.handshake.offer();
    a.handshake.onLocalIce(candidate);
    a.handshake.onPresence();
    expect(a.send).toHaveBeenCalledTimes(1);
    a.time.mockReturnValue(3500);
    a.handshake.onPresence();
    expect(a.connection.createOffer).toHaveBeenCalledTimes(1);
    expect(a.send.mock.calls).toEqual([["offer", "original-offer"], ["offer", "original-offer"]]);
    expect(a.ice).toHaveBeenCalledTimes(2);

    await b.handshake.onRemoteIce(candidate);
    await b.handshake.receive("offer", "original-offer");
    await b.handshake.receive("offer", "original-offer");
    expect(b.connection.createAnswer).toHaveBeenCalledTimes(1);
    expect(b.connection.addIceCandidate).toHaveBeenCalledWith(candidate);
    expect(b.send.mock.calls).toEqual([["answer", "original-answer"], ["answer", "original-answer"]]);

    await a.handshake.receive("answer", "original-answer");
    await a.handshake.receive("answer", "original-answer");
    a.time.mockReturnValue(9000);
    a.handshake.onPresence();
    expect(a.connection.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(a.send).toHaveBeenCalledTimes(2);
  });

  it("퇴장한 참가자에게 늦은 후보나 제안 재시도를 보내지 않는다", async () => {
    const a = peer();
    await a.handshake.offer();
    a.current.mockReturnValue(false);
    a.time.mockReturnValue(10000);
    a.handshake.onPresence();
    a.handshake.onLocalIce({ candidate: "late" });
    await a.handshake.receive("answer", "late");
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(a.ice).not.toHaveBeenCalled();
    expect(a.connection.setRemoteDescription).not.toHaveBeenCalled();
  });
});
