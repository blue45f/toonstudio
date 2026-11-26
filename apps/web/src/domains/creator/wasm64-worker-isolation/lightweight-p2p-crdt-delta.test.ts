import { describe, expect, it } from "vitest";

import { CrdtStrokeOpKind, decodeCrdtStrokeBatch, LightweightCrdtStrokeLog } from "./lightweight-p2p-crdt-delta";

function addPoints(log: LightweightCrdtStrokeLog, count: number) {
  return Array.from({ length: count }, (_, index) => log.createLocalOp({
    kind: index === 0 ? CrdtStrokeOpKind.StrokeBegin : CrdtStrokeOpKind.StrokePoint,
    strokeId: 1,
    x: index * 10,
    y: index * 5,
  }));
}

describe("P2P CRDT 연속 수신 벡터", () => {
  it("두 번째 작업이 먼저 도착해도 재연결 델타에서 첫 작업을 복구한다", () => {
    const sender = new LightweightCrdtStrokeLog(7);
    const receiver = new LightweightCrdtStrokeLog(9);
    const operations = addPoints(sender, 2);
    const second = operations[1];
    if (!second) throw new Error("두 번째 작업 fixture가 없습니다.");
    expect(receiver.applyRemotePacket(second.packet)).toBe(true);
    expect(receiver.applyRemotePacket(second.packet)).toBe(false);
    expect(receiver.getPeerSeqVector().get(7) ?? 0).toBe(0);

    const reconnectDelta = sender.exportDeltaForVector(receiver.getPeerSeqVector());
    expect(decodeCrdtStrokeBatch(reconnectDelta).map((op) => op.opSeq)).toEqual([1, 2]);
    expect(receiver.applyRemoteBatch(reconnectDelta)).toBe(1);
    expect(receiver.getPeerSeqVector().get(7)).toBe(2);
    expect(receiver.exportCanonicalBinary()).toEqual(sender.exportCanonicalBinary());
    expect(receiver.materializeStrokes()[0]?.points.map((point) => point.x)).toEqual([0, 10]);
    expect(decodeCrdtStrokeBatch(sender.exportDeltaForVector(receiver.getPeerSeqVector()))).toEqual([]);
  });

  it("중간 누락 구간을 각각 채울 때까지 이후 시퀀스를 수신 완료로 광고하지 않는다", () => {
    const sender = new LightweightCrdtStrokeLog(7);
    const receiver = new LightweightCrdtStrokeLog(9);
    const operations = addPoints(sender, 5);
    for (const index of [0, 2, 4, 1]) {
      const operation = operations[index];
      if (!operation) throw new Error("순서 변경 fixture가 없습니다.");
      receiver.applyRemotePacket(operation.packet);
    }
    expect(receiver.getPeerSeqVector().get(7)).toBe(3);
    const reconnectDelta = sender.exportDeltaForVector(receiver.getPeerSeqVector());
    expect(decodeCrdtStrokeBatch(reconnectDelta).map((op) => op.opSeq)).toEqual([4, 5]);
    expect(receiver.applyRemoteBatch(reconnectDelta)).toBe(1);
    expect(receiver.getPeerSeqVector().get(7)).toBe(5);
    expect(receiver.exportCanonicalBinary()).toEqual(sender.exportCanonicalBinary());
  });

  it("부분 로그를 복원해도 피어별 누락 작업을 독립적으로 유지한다", () => {
    const firstPeer = new LightweightCrdtStrokeLog(7);
    const secondPeer = new LightweightCrdtStrokeLog(8);
    const partial = new LightweightCrdtStrokeLog(9);
    const firstOperations = addPoints(firstPeer, 2);
    addPoints(secondPeer, 3);
    const second = firstOperations[1];
    if (!second) throw new Error("부분 로그 fixture가 없습니다.");
    partial.applyRemotePacket(second.packet);
    partial.merge(secondPeer);

    const restored = new LightweightCrdtStrokeLog(10);
    restored.applyRemoteBatch(partial.exportCanonicalBinary());
    expect(restored.getPeerSeqVector().get(7) ?? 0).toBe(0);
    expect(restored.getPeerSeqVector().get(8)).toBe(3);
    expect(restored.applyRemoteBatch(firstPeer.exportDeltaForVector(restored.getPeerSeqVector()))).toBe(1);
    expect(restored.getPeerSeqVector().get(7)).toBe(2);
    expect(restored.size()).toBe(5);
  });
});
