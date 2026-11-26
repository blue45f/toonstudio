import { describe, expect, it } from "vitest";

import { SabMessageKind, SabZeroCopyWorkerChannel } from "./sab-zero-copy-worker-channel";

function payloadFrame(length: number, value: number) {
  return {
    kind: SabMessageKind.TilePatch,
    docOffsetI64: BigInt(1),
    tileOffsetI64: BigInt(2),
    payload: new Uint8Array(length).fill(value),
  };
}

describe.each([true, false])("SAB 슬랩 재사용 (preferShared=%s)", (preferShared) => {
  function channelPair() {
    const producer = SabZeroCopyWorkerChannel.create({
      frameCapacity: 8,
      slabByteLength: 256,
      preferShared,
      crossOriginIsolatedOverride: true,
    });
    return { producer, consumer: SabZeroCopyWorkerChannel.attach(producer.buffer, true) };
  }

  it("작은 프레임을 모두 소비한 뒤 슬랩 전체 크기 프레임을 다시 전송한다", () => {
    const { producer, consumer } = channelPair();
    const first = payloadFrame(128, 17);
    expect(producer.send(first).ok).toBe(true);
    expect(consumer.receive().frame?.payload).toEqual(first.payload);
    expect(producer.getMetrics()).toMatchObject({ pendingFrames: 0, slabUsedBytes: 0 });

    const full = payloadFrame(256, 29);
    expect(producer.send(full)).toMatchObject({ ok: true, payloadBytes: 256 });
    expect(consumer.receive().frame?.payload).toEqual(full.payload);
    expect(producer.getMetrics()).toMatchObject({ pendingFrames: 0, slabUsedBytes: 0 });
  });

  it("미소비 프레임이 있으면 랩어라운드 패딩을 유지하고 기존 페이로드를 보존한다", () => {
    const { producer, consumer } = channelPair();
    const first = payloadFrame(96, 13);
    const second = payloadFrame(96, 31);
    const wrapped = payloadFrame(96, 47);
    expect(producer.send(first).ok).toBe(true);
    expect(producer.send(second).ok).toBe(true);
    expect(consumer.receive().frame?.payload).toEqual(first.payload);
    expect(producer.send(wrapped).ok).toBe(true);
    expect(producer.getMetrics().slabUsedBytes).toBe(256);
    expect(producer.send(payloadFrame(8, 59))).toMatchObject({ ok: false, reason: "slab-full" });
    expect(consumer.receive().frame?.payload).toEqual(second.payload);
    expect(consumer.receive().frame?.payload).toEqual(wrapped.payload);
    expect(producer.getMetrics().slabUsedBytes).toBe(0);
  });

  it("제로 카피 소비 콜백이 끝나기 전에는 빌린 페이로드를 덮어쓰지 않는다", () => {
    const { producer, consumer } = channelPair();
    const first = payloadFrame(128, 71);
    const full = payloadFrame(256, 83);
    expect(producer.send(first).ok).toBe(true);
    expect(consumer.consumeZeroCopy((borrowed) => {
      expect(producer.send(full)).toMatchObject({ ok: false, reason: "slab-full" });
      expect(borrowed.payload).toEqual(first.payload);
    }).ok).toBe(true);
    expect(producer.send(full).ok).toBe(true);
    expect(consumer.receive().frame?.payload).toEqual(full.payload);
  });
});
