import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioLiveParticipant } from "../studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../studio-live-direct-port";
import { StudioP2pHuddleController } from "./studio-p2p-huddle-controller";
import { parseHuddlePacket, type HuddlePacket } from "./studio-p2p-huddle-protocol";

const sessions: StudioP2pHuddleController[] = [];
afterEach(() => { for (const controller of sessions.splice(0)) controller.close(); });

function connection() {
  const transceivers = ["audio", "video"].map((kind, index) => ({
    mid: String(index), direction: "recvonly", receiver: { track: { kind } },
    sender: { replaceTrack: vi.fn(async () => undefined) },
  }));
  const pc = {
    signalingState: "stable", connectionState: "new",
    remoteDescription: null as RTCSessionDescriptionInit | null,
    localDescription: null as RTCSessionDescriptionInit | null,
    addTransceiver: vi.fn((kind: string) => transceivers.find(t => t.receiver.track.kind === kind)!),
    getTransceivers: () => transceivers,
    setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
      if (description.sdp?.includes("invalid-codec")) throw new Error("협상 입력 오류");
      pc.remoteDescription = description;
    }),
    setLocalDescription: vi.fn(async () => {
      pc.localDescription = { type: "answer", sdp: "answer-sdp" };
      pc.signalingState = "stable";
    }),
    close: vi.fn(), addIceCandidate: vi.fn(),
  };
  return { pc, transceivers };
}

function session(epoch: string, remoteEpoch: string) {
  // 양쪽의 로컬 방 ID가 direct 포트에서 보이는 상대 소켓 ID보다 작은 상황을 재현한다.
  const self: StudioLiveParticipant = { sessionId: "a-local-room", displayName: "작가", role: "editor" };
  const peer: StudioLiveParticipant = { sessionId: "z-remote-socket", displayName: "팀원", role: "editor" };
  const outbound: HuddlePacket[] = [];
  const connections: ReturnType<typeof connection>[] = [];
  let inbound: Parameters<StudioLiveDirectPort["subscribe"]>[0] = () => undefined;
  let id = 0;
  const microphone = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
  const stream = (tracks: MediaStreamTrack[]) => ({ getTracks: () => tracks }) as MediaStream;
  const controller = new StudioP2pHuddleController(self, {
    getPeers: () => [peer],
    subscribe: listener => { inbound = listener; return () => undefined; },
    send: (_, raw) => { const packet = parseHuddlePacket(raw); if (packet) outbound.push(packet); return true; },
  }, {
    id: () => id++ === 0 ? epoch : `ready-${id}`,
    createPeerConnection: () => {
      const result = connection();
      connections.push(result);
      return result.pc as unknown as RTCPeerConnection;
    },
    createStream: stream, getUserMedia: async () => stream([microphone]),
  });
  sessions.push(controller);
  controller.start();
  const receive = (packet: HuddlePacket) => inbound(peer, JSON.stringify(packet));
  receive({ kind: "state", epoch: remoteEpoch, muted: false, camera: false, sharing: false, hand: false });
  return { controller, microphone, connections, outbound, receive, peer };
}

describe("근접 통화 SDP 협상", () => {
  it("서로 다른 방·소켓 ID에서도 한쪽만 미디어 구간을 만들고 상대는 제안받은 송신기에 마이크를 연결한다", async () => {
    const primary = session("epoch-a", "epoch-b");
    const receiver = session("epoch-b", "epoch-a");
    const { pc, transceivers } = receiver.connections[0]!;
    expect(primary.connections[0]!.pc.addTransceiver.mock.calls.map(([kind]) => kind)).toEqual(["audio", "video"]);
    expect(pc.addTransceiver).not.toHaveBeenCalled();
    await receiver.controller.setMicrophone(true);
    expect(transceivers[0]!.sender.replaceTrack).not.toHaveBeenCalled();
    receiver.receive({ kind: "description", epoch: "epoch-a", toEpoch: "epoch-b", type: "offer", sdp: "offer-sdp" });
    await vi.waitFor(() => expect(pc.setLocalDescription).toHaveBeenCalledOnce());
    expect(transceivers.map(t => t.direction)).toEqual(["sendrecv", "sendrecv"]);
    expect(transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(receiver.microphone);
    await receiver.controller.setMicrophone(false);
    expect(transceivers[0]!.sender.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(pc.addTransceiver).not.toHaveBeenCalled();
  });

  it("ICE 후보가 붙어 재전송된 offer에는 같은 응답을 돌려주고 실제 오류는 알린다", async () => {
    const f = session("epoch-b", "epoch-a");
    const { pc } = f.connections[0]!;
    const sdp = "v=0\r\no=- 17 2 IN IP4 0.0.0.0\r\n";
    const offer = (body: string) => f.receive({ kind: "description", epoch: "epoch-a", toEpoch: "epoch-b", type: "offer", sdp: body });
    offer(sdp);
    offer(sdp + "a=candidate:1 1 UDP 1 127.0.0.1 9 typ host\r\n");
    await vi.waitFor(() => expect(f.outbound.filter(p => p.kind === "description")).toHaveLength(2));
    expect(pc.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(pc.setLocalDescription).toHaveBeenCalledTimes(1);
    offer(sdp + "a=invalid-codec\r\n");
    await vi.waitFor(() => expect(f.controller.snapshot().error).toContain("연결 신호"));
    expect(pc.setRemoteDescription).toHaveBeenCalledTimes(2);
  });

  it("같은 범위와 통화 수신자에서 상대 연결이 새로 열릴 때만 기존 연결을 교체한다", async () => {
    const f = session("epoch-a", "epoch-b");
    const { pc } = f.connections[0]!;
    const ready = (id: string, toEpoch = "epoch-a") => f.receive({ kind: "media-ready", epoch: "epoch-b", toEpoch, id, retry: false });
    ready("first");
    f.receive({ kind: "description", epoch: "epoch-b", toEpoch: "epoch-a", type: "answer", sdp: "answer" });
    await vi.waitFor(() => expect(pc.remoteDescription?.type).toBe("answer"));
    ready("first"); ready("new", "expired");
    await Promise.resolve();
    expect(pc.close).not.toHaveBeenCalled();
    ready("new");
    await vi.waitFor(() => expect(f.connections).toHaveLength(2));
    expect(pc.close).toHaveBeenCalledOnce();
    f.controller.setMediaPeerScope([]);
    ready("outside");
    expect(f.connections).toHaveLength(2);
  });

  it("첫 offer를 놓친 상대의 명시적 재요청에 현재 offer를 다시 보낸다", async () => {
    const f = session("epoch-a", "epoch-b");
    const { pc } = f.connections[0]!;
    pc.signalingState = "have-local-offer";
    pc.localDescription = { type: "offer", sdp: "pending-offer" };
    const ready = { kind: "media-ready", epoch: "epoch-b", toEpoch: "epoch-a", id: "receiver", retry: false } as const;
    f.receive(ready);
    f.receive({ ...ready, retry: true });
    await vi.waitFor(() => expect(f.outbound.filter(p => p.kind === "description")).toEqual([
      { kind: "description", epoch: "epoch-a", toEpoch: "epoch-b", type: "offer", sdp: "pending-offer" },
    ]));
    expect(f.connections).toHaveLength(1);
    expect(parseHuddlePacket(JSON.stringify({ ...ready, id: "" }))).toBeNull();
    expect(parseHuddlePacket(JSON.stringify({ ...ready, retry: "true" }))).toBeNull();
  });
});
