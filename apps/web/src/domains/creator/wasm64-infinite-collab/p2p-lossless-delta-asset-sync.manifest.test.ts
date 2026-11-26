import { describe, expect, it } from "vitest";
import {
  decodeP2pFrame,
  P2pFrameType,
  P2pLosslessDeltaSyncNode,
  type P2pFrameTypeCode,
} from "./p2p-lossless-delta-asset-sync";

function connectPeers(nodeA: P2pLosslessDeltaSyncNode, nodeB: P2pLosslessDeltaSyncNode) {
  const packets: { senderPeerId: number; receiver: P2pLosslessDeltaSyncNode; bytes: Uint8Array }[] = [];
  const sentFrameTypes: P2pFrameTypeCode[] = [];
  let nowMs = 0;
  for (const [sender, receiver] of [[nodeA, nodeB], [nodeB, nodeA]] as const) {
    sender.attachPeerChannel(receiver.peerId, {
      readyState: "open",
      bufferedAmount: 0,
      send(bytes) {
        const frame = decodeP2pFrame(bytes);
        if (!frame) throw new Error("유효하지 않은 P2P 프레임입니다.");
        sentFrameTypes.push(frame.frameType);
        packets.push({ senderPeerId: sender.peerId, receiver, bytes: bytes.slice() });
      },
    });
  }
  const deliverNext = () => {
    const packet = packets.shift();
    if (!packet) return false;
    nowMs += 1;
    expect(packet.receiver.receiveFrame(packet.senderPeerId, packet.bytes, nowMs)).toBe(true);
    return true;
  };
  const drain = () => {
    for (let count = 0; count < 1_000; count += 1) {
      if (!deliverNext()) {
        expect(nodeA.isQuiescent()).toBe(true);
        expect(nodeB.isQuiescent()).toBe(true);
        return;
      }
    }
    throw new Error("P2P 메시지가 제한 내에 수렴하지 않았습니다.");
  };
  const syncBoth = () => {
    nodeA.initiateSyncAll(nowMs);
    nodeB.initiateSyncAll(nowMs);
    drain();
  };
  return { deliverNext, drain, syncBoth, sentFrameTypes };
}

const originalPixels = new Uint8Array([10, 20, 30, 255]);
const editedPixels = new Uint8Array([80, 90, 100, 255]);

describe("P2P 매니페스트 Lamport 시계", () => {
  it("같은 픽셀의 매니페스트만 교환해도 낮은 시계 피어의 다음 편집을 보존한다", () => {
    const nodeA = new P2pLosslessDeltaSyncNode({ peerId: 1 });
    const nodeB = new P2pLosslessDeltaSyncNode({ peerId: 2 });
    const network = connectPeers(nodeA, nodeB);
    for (let revision = 0; revision < 100; revision += 1) nodeA.putLocalTile("shared", originalPixels);
    nodeB.putLocalTile("shared", originalPixels);
    expect(nodeA.getManifest().get("shared")?.lamportTs).toBe(100);
    expect(nodeB.getManifest().get("shared")?.lamportTs).toBe(1);

    network.syncBoth();

    expect(network.sentFrameTypes).not.toContain(P2pFrameType.TileDeltaChunk);
    expect(nodeA.getTelemetry().rawTileBytesSynced).toBe(0);
    expect(nodeB.getTelemetry().rawTileBytesSynced).toBe(0);
    const edit = nodeB.putLocalTile("shared", editedPixels);
    network.syncBoth();

    expect(edit.lamportTs).toBe(101);
    expect(nodeA.getTilePixels("shared")).toEqual(editedPixels);
    expect(nodeB.getTilePixels("shared")).toEqual(editedPixels);
    expect(nodeA.getManifest().get("shared")).toEqual(edit);
    expect(nodeB.getManifest().get("shared")).toEqual(edit);
  });

  it("모든 항목의 최대 시각을 반영하고 이전 매니페스트가 로컬 시계를 되돌리지 않는다", () => {
    const nodeA = new P2pLosslessDeltaSyncNode({ peerId: 1 });
    const nodeB = new P2pLosslessDeltaSyncNode({ peerId: 2 });
    const network = connectPeers(nodeA, nodeB);
    nodeA.putLocalTile("high", originalPixels);
    nodeA.putLocalTile("low", originalPixels);
    for (let revision = 2; revision < 100; revision += 1) nodeA.putLocalTile("high", originalPixels);
    nodeB.putLocalTile("high", originalPixels);
    nodeB.putLocalTile("low", originalPixels);
    expect([...nodeA.getManifest().values()].map((entry) => entry.lamportTs)).toEqual([100, 2]);

    nodeA.initiateSyncAll();
    network.drain();
    expect(nodeB.putLocalTile("local-only", editedPixels).lamportTs).toBe(101);

    nodeA.initiateSyncAll();
    network.drain();
    expect(nodeB.putLocalTile("local-only", originalPixels).lamportTs).toBe(102);
    expect(network.sentFrameTypes).not.toContain(P2pFrameType.TileDeltaChunk);
  });

  it("누락 타일 응답을 기다리는 동안의 로컬 편집도 이미 받은 매니페스트보다 뒤에 정렬한다", () => {
    const nodeA = new P2pLosslessDeltaSyncNode({ peerId: 1 });
    const nodeB = new P2pLosslessDeltaSyncNode({ peerId: 2 });
    const network = connectPeers(nodeA, nodeB);
    for (let revision = 0; revision < 100; revision += 1) nodeA.putLocalTile("shared", originalPixels);
    nodeA.initiateSyncAll();

    expect(network.deliverNext()).toBe(true);
    expect(nodeB.getTilePixels("shared")).toBeNull();
    expect(network.sentFrameTypes).toContain(P2pFrameType.ManifestRequest);
    expect(network.sentFrameTypes).not.toContain(P2pFrameType.TileDeltaChunk);
    const edit = nodeB.putLocalTile("shared", editedPixels);
    network.drain();
    network.syncBoth();

    expect(edit.lamportTs).toBe(101);
    expect(nodeA.getTilePixels("shared")).toEqual(editedPixels);
    expect(nodeB.getTilePixels("shared")).toEqual(editedPixels);
    expect(nodeA.getManifest().get("shared")).toEqual(edit);
  });
});
