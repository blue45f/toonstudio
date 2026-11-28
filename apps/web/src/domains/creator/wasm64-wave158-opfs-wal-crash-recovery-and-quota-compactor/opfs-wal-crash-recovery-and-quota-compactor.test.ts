import { describe, expect, it } from "vitest";
import {
  WAL_FORMAT_VERSION,
  WAL_FRAME_MAGIC,
  WAL_FRAME_OVERHEAD_BYTES,
  WAL_HEADER_BYTES,
  WAL_OP_TYPE_TO_CODE,
  classifyQuotaPressureTier,
  compactWalStream,
  computeCrc32c,
  computeSha256Hex,
  computeSha256Utf8Hex,
  createSampleOpfsWalRecoveryScenario,
  decodeWalFrameAt,
  encodeJsonPayload,
  encodeWalFrame,
  encodeWalStream,
  isProtectedOpfsEntry,
  planOpfsQuotaGarbageCollection,
  replayWalStream,
  runOpfsWalCrashRecoveryAndQuotaPlan,
  scanWalStream,
  type OpfsStorageEntry,
  type WalFrameInput,
  type WalOpType,
} from "./index";

const MB = 1024 * 1024;
const BASE_TS = 1764300000000;

function makeEntry(overrides: Partial<OpfsStorageEntry> & { id: string }): OpfsStorageEntry {
  return {
    episodeId: "ep-010",
    labelKo: `항목 ${overrides.id}`,
    bucket: "expired_render_cache",
    bytes: 50 * MB,
    lastAccessedMs: BASE_TS,
    unsyncedDirty: false,
    pinnedActive: false,
    ...overrides,
  };
}

function mkFrame(
  lsn: number,
  txId: number,
  opType: WalOpType,
  payloadObj: unknown,
  opts?: { timestampMs?: number; version?: number }
): WalFrameInput {
  return {
    lsn,
    txId,
    opType,
    timestampMs: opts?.timestampMs ?? BASE_TS + lsn,
    payload: encodeJsonPayload(payloadObj),
    version: opts?.version,
  };
}

function buildMultiTxWalStream(): Uint8Array {
  const episodeId = "ep-100";
  return encodeWalStream([
    mkFrame(1, 1, "TX_BEGIN", { episodeId }),
    mkFrame(2, 1, "LAYER_PATCH", { layerId: "layer-bg", name: "배경 1차", opacity: 0.5, zIndex: 0 }),
    mkFrame(3, 1, "PANEL_UPDATE", { panelId: "p1", orderIndex: 0, heightPx: 1200, gutterPx: 40, caption: "초안" }),
    mkFrame(4, 1, "STROKE_APPEND", { strokeId: "s1", layerId: "layer-bg", pointCount: 24, colorToken: "oklch(0.2 0.02 240)", widthPx: 2 }),
    mkFrame(5, 1, "TX_COMMIT", { episodeId }),
    mkFrame(6, 2, "TX_BEGIN", { episodeId }),
    mkFrame(7, 2, "LAYER_PATCH", { layerId: "layer-bg", name: "배경 2차", opacity: 0.8 }),
    mkFrame(8, 2, "LAYER_PATCH", { layerId: "layer-bg", name: "배경 최종", opacity: 0.95 }),
    mkFrame(9, 2, "PANEL_UPDATE", { panelId: "p1", orderIndex: 0, heightPx: 1440, gutterPx: 48, caption: "완성" }),
    mkFrame(10, 2, "TX_COMMIT", { episodeId }),
  ]);
}

describe("Wave 158 — Castagnoli CRC-32C (0x82f63b78)", () => {
  it("표준 테스트 벡터 '123456789'에 대해 0xe3069283(3808858755)을 반환한다", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(computeCrc32c(bytes)).toBe(0xe3069283);
    expect(computeCrc32c(bytes)).toBe(3808858755);
  });

  it("빈 버퍼에 대해 0을 반환한다", () => {
    expect(computeCrc32c(new Uint8Array(0))).toBe(0);
  });

  it("시드 체이닝(분할 누산)이 단일 패스 CRC-32C와 정확히 일치한다", () => {
    const full = new TextEncoder().encode("123456789");
    const part1 = computeCrc32c(full.subarray(0, 4));
    const chained = computeCrc32c(full.subarray(4), part1);
    expect(chained).toBe(0xe3069283);
  });

  it("단일 비트 변조가 즉시 다른 CRC-32C 값을 만든다", () => {
    const original = new TextEncoder().encode("ToonStudio-OPFS-WAL-Frame");
    const mutated = original.slice();
    mutated[7] ^= 0x04;
    expect(computeCrc32c(mutated)).not.toBe(computeCrc32c(original));
  });
});

describe("Wave 158 — 순수 TS FIPS 180-4 SHA-256", () => {
  it("빈 문자열 표준 벡터를 정확히 계산한다", () => {
    expect(computeSha256Utf8Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("'abc' 표준 벡터를 정확히 계산한다", () => {
    expect(computeSha256Utf8Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("멀티 블록 NIST 448비트 경계 벡터를 정확히 계산한다", () => {
    expect(
      computeSha256Utf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("입력 바이트 1개만 달라져도 SHA-256 다이제스트가 달라진다", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]);
    expect(computeSha256Hex(a)).not.toBe(computeSha256Hex(b));
  });
});

describe("Wave 158 — 바이너리 WAL 프레임 코덱", () => {
  it("7종 모든 WAL 연산 타입의 인코딩·디코딩 왕복이 정확히 일치한다", () => {
    const opTypes: readonly WalOpType[] = [
      "TX_BEGIN",
      "STROKE_APPEND",
      "LAYER_PATCH",
      "PANEL_UPDATE",
      "TX_COMMIT",
      "TX_ABORT",
      "CHECKPOINT",
    ];
    for (let i = 0; i < opTypes.length; i += 1) {
      const opType = opTypes[i];
      const payload = encodeJsonPayload({ opType, index: i });
      const encoded = encodeWalFrame({
        lsn: i + 1,
        txId: 500 + i,
        opType,
        timestampMs: BASE_TS + i * 17,
        payload,
      });
      const decoded = decodeWalFrameAt(encoded, 0);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.record.opType).toBe(opType);
        expect(decoded.record.lsn).toBe(i + 1);
        expect(decoded.record.txId).toBe(500 + i);
        expect(decoded.record.timestampMs).toBe(BASE_TS + i * 17);
        expect(decoded.record.payload).toEqual(payload);
        expect(decoded.nextOffset).toBe(encoded.length);
      }
    }
  });

  it("정확한 32B 헤더·페이로드·4B CRC-32C 바이트 레이아웃을 생성한다", () => {
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
    const frame = encodeWalFrame({
      lsn: 42,
      txId: 7,
      opType: "STROKE_APPEND",
      timestampMs: BASE_TS,
      payload,
    });
    expect(frame.length).toBe(WAL_FRAME_OVERHEAD_BYTES + payload.length);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    expect(view.getUint32(0, false)).toBe(WAL_FRAME_MAGIC);
    expect(view.getUint16(4, false)).toBe(WAL_FORMAT_VERSION);
    expect(view.getUint16(6, false)).toBe(WAL_OP_TYPE_TO_CODE.STROKE_APPEND);
    expect(view.getUint32(16, false)).toBe(7);
    expect(view.getUint32(28, false)).toBe(5);
    const expectedCrc = computeCrc32c(frame.subarray(0, WAL_HEADER_BYTES + 5));
    expect(view.getUint32(WAL_HEADER_BYTES + 5, false)).toBe(expectedCrc);
  });

  it("32비트를 초과하는 64비트 안전 정수 LSN과 타임스탬프를 손실 없이 왕복한다", () => {
    const bigLsn = 4294967350;
    const frame = encodeWalFrame({
      lsn: bigLsn,
      txId: 12,
      opType: "LAYER_PATCH",
      timestampMs: 1798765432109,
      payload: encodeJsonPayload({ layerId: "L1" }),
    });
    const decoded = decodeWalFrameAt(frame, 0);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.record.lsn).toBe(bigLsn);
      expect(decoded.record.timestampMs).toBe(1798765432109);
    }
  });

  it("빈 페이로드 프레임(36B)을 정상 인코딩·디코딩한다", () => {
    const frame = encodeWalFrame({
      lsn: 1,
      txId: 1,
      opType: "TX_COMMIT",
      timestampMs: BASE_TS,
      payload: new Uint8Array(0),
    });
    expect(frame.length).toBe(WAL_FRAME_OVERHEAD_BYTES);
    const decoded = decodeWalFrameAt(frame, 0);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.record.payload.length).toBe(0);
    }
  });

  it("매직 넘버 불일치를 magic_mismatch로 거부한다", () => {
    const frame = encodeWalFrame(mkFrame(1, 1, "TX_BEGIN", { episodeId: "ep-1" }));
    frame[0] ^= 0x01;
    const decoded = decodeWalFrameAt(frame, 0);
    expect(decoded.ok ? null : decoded.reason).toBe("magic_mismatch");
  });

  it("미지원 버전을 unsupported_version으로 거부한다", () => {
    const frame = encodeWalFrame(mkFrame(1, 1, "TX_BEGIN", { episodeId: "ep-1" }, { version: 9 }));
    const decoded = decodeWalFrameAt(frame, 0);
    expect(decoded.ok ? null : decoded.reason).toBe("unsupported_version");
  });

  it("헤더(LSN/txId/타임스탬프) 1비트 변조를 CRC-32C 불일치로 검출한다", () => {
    const frame = encodeWalFrame(mkFrame(99, 1234, "PANEL_UPDATE", { panelId: "p1", orderIndex: 0, heightPx: 900, gutterPx: 32 }));
    frame[18] ^= 0x08;
    const decoded = decodeWalFrameAt(frame, 0);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.reason).toBe("crc_mismatch");
      expect(decoded.expectedCrc32c).not.toBe(decoded.actualCrc32c);
    }
  });

  it("페이로드 1비트 변조를 CRC-32C 불일치로 검출한다", () => {
    const frame = encodeWalFrame(
      mkFrame(100, 1234, "STROKE_APPEND", { strokeId: "s-1", layerId: "L1", pointCount: 12, colorToken: "oklch(0.2 0 0)", widthPx: 2 })
    );
    frame[WAL_HEADER_BYTES + 4] ^= 0x01;
    const decoded = decodeWalFrameAt(frame, 0);
    expect(decoded.ok ? null : decoded.reason).toBe("crc_mismatch");
  });

  it("잘린 헤더·잘린 페이로드·누락 CRC 푸터를 정확히 구분한다", () => {
    const frame = encodeWalFrame(mkFrame(5, 2, "LAYER_PATCH", { layerId: "layer-a", opacity: 0.75 }));
    const rHeader = decodeWalFrameAt(frame.slice(0, 14), 0);
    const rPayload = decodeWalFrameAt(frame.slice(0, WAL_HEADER_BYTES + 5), 0);
    const rCrc = decodeWalFrameAt(frame.slice(0, frame.length - 2), 0);
    expect(rHeader.ok ? null : rHeader.reason).toBe("truncated_header");
    expect(rPayload.ok ? null : rPayload.reason).toBe("truncated_payload");
    expect(rCrc.ok ? null : rCrc.reason).toBe("truncated_crc");
  });
});

describe("Wave 158 — 크래시·끝단 잘림 복구 및 WAL 재생 엔진", () => {
  it("정상 다중 트랜잭션을 정확한 LSN 순서로 재생하며 커밋 연산을 0건 손실한다", () => {
    const stream = buildMultiTxWalStream();
    const replay = replayWalStream(stream);
    expect(replay.healthStatus).toBe("clean");
    expect(replay.committedTxCount).toBe(2);
    expect(replay.abortedTxCount).toBe(0);
    expect(replay.uncommittedTxCount).toBe(0);
    expect(replay.committedOpCount).toBe(6);
    expect(replay.discardedOpCount).toBe(0);
    expect(replay.recoveredState.layers[0]?.name).toBe("배경 최종");
    expect(replay.recoveredState.layers[0]?.opacity).toBe(0.95);
    expect(replay.recoveredState.panels[0]?.heightPx).toBe(1440);
    expect(replay.recoveredState.strokes).toHaveLength(1);
  });

  it("끝단 헤더 중간 잘림을 마지막 정상 바이트 오프셋으로 안전 절단한다", () => {
    const valid = buildMultiTxWalStream();
    const extra = encodeWalFrame(mkFrame(11, 3, "TX_BEGIN", { episodeId: "ep-100" }));
    const torn = new Uint8Array(valid.length + 11);
    torn.set(valid, 0);
    torn.set(extra.subarray(0, 11), valid.length);

    const replay = replayWalStream(torn);
    expect(replay.healthStatus).toBe("recovered_torn_tail");
    expect(replay.tornWriteTruncated).toBe(true);
    expect(replay.tornWriteReason).toBe("truncated_header");
    expect(replay.validByteEndOffset).toBe(valid.length);
    expect(replay.truncatedTailBytes).toBe(11);
    expect(replay.committedTxCount).toBe(2);
  });

  it("끝단 페이로드 중간 잘림을 기존 커밋 손실 없이 절단한다", () => {
    const valid = buildMultiTxWalStream();
    const extra = encodeWalFrame(
      mkFrame(11, 3, "STROKE_APPEND", { strokeId: "s-torn", layerId: "layer-bg", pointCount: 55, colorToken: "oklch(0.3 0 0)", widthPx: 3 })
    );
    const cutLen = WAL_HEADER_BYTES + 8;
    const torn = new Uint8Array(valid.length + cutLen);
    torn.set(valid, 0);
    torn.set(extra.subarray(0, cutLen), valid.length);

    const replay = replayWalStream(torn);
    expect(replay.tornWriteTruncated).toBe(true);
    expect(replay.tornWriteReason).toBe("truncated_payload");
    expect(replay.validByteEndOffset).toBe(valid.length);
    expect(replay.truncatedTailBytes).toBe(cutLen);
    expect(replay.recoveredState.strokes).toHaveLength(1);
  });

  it("끝단 CRC 푸터 2바이트 누락을 깔끔하게 절단한다", () => {
    const valid = buildMultiTxWalStream();
    const extra = encodeWalFrame(mkFrame(11, 3, "TX_BEGIN", { episodeId: "ep-100" }));
    const cutLen = extra.length - 2;
    const torn = new Uint8Array(valid.length + cutLen);
    torn.set(valid, 0);
    torn.set(extra.subarray(0, cutLen), valid.length);

    const replay = replayWalStream(torn);
    expect(replay.tornWriteTruncated).toBe(true);
    expect(replay.tornWriteReason).toBe("truncated_crc");
    expect(replay.validByteEndOffset).toBe(valid.length);
    expect(replay.truncatedTailBytes).toBe(cutLen);
  });

  it("TX_COMMIT이 없는 미커밋 트랜잭션은 회차 상태에 0건 반영된다", () => {
    const stream = encodeWalStream([
      mkFrame(1, 1, "TX_BEGIN", { episodeId: "ep-u" }),
      mkFrame(2, 1, "STROKE_APPEND", { strokeId: "s-ghost", layerId: "L1", pointCount: 30, colorToken: "oklch(0.2 0 0)", widthPx: 4 }),
    ]);
    const replay = replayWalStream(stream);
    expect(replay.committedTxCount).toBe(0);
    expect(replay.uncommittedTxCount).toBe(1);
    expect(replay.committedOpCount).toBe(0);
    expect(replay.discardedOpCount).toBe(1);
    expect(replay.recoveredState.strokes).toHaveLength(0);
  });

  it("명시적으로 TX_ABORT된 트랜잭션은 회차 상태에 0건 반영된다", () => {
    const stream = encodeWalStream([
      mkFrame(1, 10, "TX_BEGIN", { episodeId: "ep-a" }),
      mkFrame(2, 10, "LAYER_PATCH", { layerId: "L-bad", name: "취소 레이어", opacity: 0.2 }),
      mkFrame(3, 10, "TX_ABORT", { episodeId: "ep-a" }),
    ]);
    const replay = replayWalStream(stream);
    expect(replay.abortedTxCount).toBe(1);
    expect(replay.committedOpCount).toBe(0);
    expect(replay.discardedOpCount).toBe(1);
    expect(replay.recoveredState.layers).toHaveLength(0);
  });

  it("교차(interleaved) 트랜잭션 중 커밋된 연산만 정확한 LSN 순서로 적용된다", () => {
    const stream = encodeWalStream([
      { lsn: 1, txId: 1, opType: "TX_BEGIN", timestampMs: BASE_TS, payload: encodeJsonPayload({ episodeId: "ep-i" }) },
      { lsn: 2, txId: 2, opType: "TX_BEGIN", timestampMs: BASE_TS + 1, payload: encodeJsonPayload({ episodeId: "ep-i" }) },
      { lsn: 3, txId: 1, opType: "LAYER_PATCH", timestampMs: BASE_TS + 2, payload: encodeJsonPayload({ layerId: "L1", name: "먼저", opacity: 0.4 }) },
      { lsn: 4, txId: 2, opType: "LAYER_PATCH", timestampMs: BASE_TS + 3, payload: encodeJsonPayload({ layerId: "L1", name: "중단될값", opacity: 0.1 }) },
      { lsn: 5, txId: 3, opType: "TX_BEGIN", timestampMs: BASE_TS + 4, payload: encodeJsonPayload({ episodeId: "ep-i" }) },
      { lsn: 6, txId: 3, opType: "LAYER_PATCH", timestampMs: BASE_TS + 5, payload: encodeJsonPayload({ layerId: "L1", name: "나중", opacity: 0.9 }) },
      { lsn: 7, txId: 2, opType: "TX_ABORT", timestampMs: BASE_TS + 6, payload: encodeJsonPayload({ episodeId: "ep-i" }) },
      { lsn: 8, txId: 3, opType: "TX_COMMIT", timestampMs: BASE_TS + 7, payload: encodeJsonPayload({ episodeId: "ep-i" }) },
      { lsn: 9, txId: 1, opType: "TX_COMMIT", timestampMs: BASE_TS + 8, payload: encodeJsonPayload({ episodeId: "ep-i" }) },
    ]);
    const replay = replayWalStream(stream);
    expect(replay.committedTxCount).toBe(2);
    expect(replay.abortedTxCount).toBe(1);
    expect(replay.recoveredState.layers[0]?.name).toBe("나중");
    expect(replay.recoveredState.layers[0]?.opacity).toBe(0.9);
  });

  it("중간 프레임 1비트 손상 시 즉시 Fail-Closed 중단하고 정확한 오프셋과 직전 LSN을 기록한다", () => {
    const f1 = encodeWalFrame({ lsn: 1, txId: 1, opType: "TX_BEGIN", timestampMs: BASE_TS, payload: encodeJsonPayload({ episodeId: "ep-c" }) });
    const f2 = encodeWalFrame({ lsn: 2, txId: 1, opType: "LAYER_PATCH", timestampMs: BASE_TS + 1, payload: encodeJsonPayload({ layerId: "L1", name: "정상" }) });
    const f3 = encodeWalFrame({ lsn: 3, txId: 1, opType: "TX_COMMIT", timestampMs: BASE_TS + 2, payload: encodeJsonPayload({ episodeId: "ep-c" }) });
    const f4 = encodeWalFrame({ lsn: 4, txId: 2, opType: "TX_BEGIN", timestampMs: BASE_TS + 3, payload: encodeJsonPayload({ episodeId: "ep-c" }) });
    const f5 = encodeWalFrame({ lsn: 5, txId: 2, opType: "LAYER_PATCH", timestampMs: BASE_TS + 4, payload: encodeJsonPayload({ layerId: "L2", name: "손상프레임" }) });
    const f6 = encodeWalFrame({ lsn: 6, txId: 2, opType: "TX_COMMIT", timestampMs: BASE_TS + 5, payload: encodeJsonPayload({ episodeId: "ep-c" }) });

    const f5Offset = f1.length + f2.length + f3.length + f4.length;
    const stream = new Uint8Array(f5Offset + f5.length + f6.length);
    stream.set(f1, 0);
    stream.set(f2, f1.length);
    stream.set(f3, f1.length + f2.length);
    stream.set(f4, f1.length + f2.length + f3.length);
    stream.set(f5, f5Offset);
    stream.set(f6, f5Offset + f5.length);

    stream[f5Offset + WAL_HEADER_BYTES + 2] ^= 0x10;

    const replay = replayWalStream(stream);
    expect(replay.healthStatus).toBe("halted_corrupted_frame");
    expect(replay.corruptedMiddleFrame).not.toBeNull();
    expect(replay.corruptedMiddleFrame?.reason).toBe("crc_mismatch");
    expect(replay.corruptedMiddleFrame?.byteOffset).toBe(f5Offset);
    expect(replay.corruptedMiddleFrame?.lsnBeforeCorruption).toBe(4);
    expect(replay.committedTxCount).toBe(1);
    expect(replay.recoveredState.layers).toHaveLength(1);
    expect(replay.recoveredState.layers[0]?.layerId).toBe("L1");
  });

  it("빈 WAL 스트림은 깨끗한 빈 회차 상태를 반환한다", () => {
    const replay = replayWalStream(new Uint8Array(0), { defaultEpisodeId: "ep-empty" });
    expect(replay.healthStatus).toBe("clean");
    expect(replay.episodeId).toBe("ep-empty");
    expect(replay.validFrameCount).toBe(0);
    expect(replay.recoveredState.layers).toHaveLength(0);
  });
});

describe("Wave 158 — 체크포인트 압축기", () => {
  it("중복 패치·중단 트랜잭션·미커밋 프레임을 압축해 바이트 크기를 실제로 줄인다", () => {
    const scenario = createSampleOpfsWalRecoveryScenario();
    const compacted = compactWalStream(scenario.walStream, scenario.compactionOptions);
    expect(compacted.compactedBytes).toBeLessThan(compacted.originalBytes);
    expect(compacted.reclaimedBytes).toBeGreaterThan(0);
    expect(compacted.reductionRatio).toBeGreaterThan(0.15);
  });

  it("압축 전후 재실행한 회차 상태와 SHA-256 해시가 100% 일치한다", () => {
    const scenario = createSampleOpfsWalRecoveryScenario();
    const before = replayWalStream(scenario.walStream, scenario.replayOptions);
    const compacted = compactWalStream(scenario.walStream, scenario.compactionOptions);
    expect(compacted.stateHashEquivalent).toBe(true);
    expect(compacted.stateSha256After).toBe(before.stateSha256Hex);
    expect(compacted.compactedReplay.recoveredState.layers).toHaveLength(
      before.recoveredState.layers.length
    );
    expect(compacted.compactedReplay.recoveredState.panels).toHaveLength(
      before.recoveredState.panels.length
    );
    expect(compacted.compactedReplay.recoveredState.strokes).toHaveLength(
      before.recoveredState.strokes.length
    );
  });

  it("압축된 스트림은 CHECKPOINT 프레임으로 마무리되고 마지막 체크포인트 LSN을 기록한다", () => {
    const stream = buildMultiTxWalStream();
    const compacted = compactWalStream(stream);
    const scan = scanWalStream(compacted.compactedStream);
    expect(scan.tornWriteDetected).toBe(false);
    expect(scan.corruptionStop).toBeNull();
    const last = scan.records[scan.records.length - 1];
    expect(last?.opType).toBe("CHECKPOINT");
    expect(compacted.compactedReplay.lastCheckpointLsn).toBe(compacted.checkpointLsn);
  });

  it("이미 압축된 스트림을 다시 압축해도 상태 SHA-256 해시가 변하지 않는다(멱등성)", () => {
    const stream = buildMultiTxWalStream();
    const first = compactWalStream(stream);
    const second = compactWalStream(first.compactedStream);
    expect(second.stateHashEquivalent).toBe(true);
    expect(second.stateSha256After).toBe(first.stateSha256Before);
    expect(second.compactedBytes).toBe(first.compactedBytes);
  });

  it("끝단 잘림이 포함된 스트림을 압축하면 잘림 없는 정상 스트림을 만든다", () => {
    const scenario = createSampleOpfsWalRecoveryScenario();
    const compacted = compactWalStream(scenario.walStream, scenario.compactionOptions);
    expect(compacted.compactedReplay.healthStatus).toBe("clean");
    expect(compacted.compactedReplay.truncatedTailBytes).toBe(0);
    expect(compacted.compactedReplay.uncommittedTxCount).toBe(0);
    expect(compacted.compactedReplay.abortedTxCount).toBe(0);
  });
});

describe("Wave 158 — OPFS/SQLite 할당량 거버너 및 Dirty-Safe GC", () => {
  it("사용률에 따라 4단계 압박 등급(healthy/elevated/critical/emergency)을 정확히 분류한다", () => {
    expect(classifyQuotaPressureTier(0.45)).toBe("healthy");
    expect(classifyQuotaPressureTier(0.72)).toBe("elevated");
    expect(classifyQuotaPressureTier(0.88)).toBe("critical");
    expect(classifyQuotaPressureTier(0.96)).toBe("emergency");
  });

  it("할당량이 여유 상태(70% 미만)이면 삭제 항목 0건으로 즉시 목표를 충족한다", () => {
    const plan = planOpfsQuotaGarbageCollection({
      quotaBytes: 1000 * MB,
      entries: [
        makeEntry({ id: "db-1", bucket: "unsynced_episode_db", bytes: 300 * MB, unsyncedDirty: true }),
        makeEntry({ id: "cache-1", bucket: "expired_render_cache", bytes: 150 * MB }),
      ],
    });
    expect(plan.pressureTierBefore).toBe("healthy");
    expect(plan.bytesNeededToReclaim).toBe(0);
    expect(plan.evictEntries).toHaveLength(0);
    expect(plan.targetHeadroomMet).toBe(true);
  });

  it("98% 비상 압박 상황에서도 unsyncedDirty 및 pinnedActive 항목은 절대 삭제하지 않는다", () => {
    const entries: OpfsStorageEntry[] = [
      makeEntry({ id: "dirty-ep", bucket: "synced_cold_snapshot", bytes: 480 * MB, unsyncedDirty: true }),
      makeEntry({ id: "active-ep", bucket: "synced_preview_tile", bytes: 420 * MB, pinnedActive: true }),
      makeEntry({ id: "orphan-1", bucket: "orphan_wal_chunk", bytes: 80 * MB }),
    ];
    expect(isProtectedOpfsEntry(entries[0])).toBe(true);
    expect(isProtectedOpfsEntry(entries[1])).toBe(true);

    const plan = planOpfsQuotaGarbageCollection({
      quotaBytes: 1000 * MB,
      entries,
    });
    expect(plan.pressureTierBefore).toBe("emergency");
    expect(plan.evictEntries.map((e) => e.id)).toEqual(["orphan-1"]);
    expect(plan.protectedEntries.map((e) => e.id)).toEqual(["dirty-ep", "active-ep"]);
    expect(plan.evictEntries.some((e) => e.unsyncedDirty || e.pinnedActive)).toBe(false);
  });

  it("회수 우선순위(orphan_wal_chunk -> expired_render_cache -> synced_cold_snapshot -> synced_preview_tile)를 엄격히 지킨다", () => {
    const plan = planOpfsQuotaGarbageCollection({
      quotaBytes: 1000 * MB,
      entries: [
        makeEntry({ id: "protected", bucket: "unsynced_episode_db", bytes: 500 * MB, unsyncedDirty: true }),
        makeEntry({ id: "tile", bucket: "synced_preview_tile", bytes: 120 * MB, lastAccessedMs: BASE_TS - 999999 }),
        makeEntry({ id: "cold", bucket: "synced_cold_snapshot", bytes: 120 * MB, lastAccessedMs: BASE_TS - 888888 }),
        makeEntry({ id: "cache", bucket: "expired_render_cache", bytes: 120 * MB, lastAccessedMs: BASE_TS - 100 }),
        makeEntry({ id: "orphan", bucket: "orphan_wal_chunk", bytes: 120 * MB, lastAccessedMs: BASE_TS }),
      ],
    });
    expect(plan.evictEntries.map((e) => e.id)).toEqual(["orphan", "cache", "cold"]);
    expect(plan.keptEntries.some((e) => e.id === "tile")).toBe(true);
  });

  it("동일 버킷 내에서는 오래된 접근 시각(LRU) 순으로 먼저 회수한다", () => {
    const plan = planOpfsQuotaGarbageCollection({
      quotaBytes: 1000 * MB,
      entries: [
        makeEntry({ id: "db", bucket: "unsynced_episode_db", bytes: 600 * MB, unsyncedDirty: true }),
        makeEntry({ id: "cache-new", bucket: "expired_render_cache", bytes: 120 * MB, lastAccessedMs: BASE_TS + 5000 }),
        makeEntry({ id: "cache-old", bucket: "expired_render_cache", bytes: 120 * MB, lastAccessedMs: BASE_TS - 5000 }),
        makeEntry({ id: "cache-mid", bucket: "expired_render_cache", bytes: 120 * MB, lastAccessedMs: BASE_TS }),
      ],
    });
    expect(plan.evictEntries.map((e) => e.id)).toEqual(["cache-old", "cache-mid", "cache-new"]);
  });

  it("목표 여유 비율(30% 여유 / 70% 사용)에 도달하는 즉시 회수를 중단하고 최신 캐시를 보존한다", () => {
    const plan = planOpfsQuotaGarbageCollection({
      quotaBytes: 1000 * MB,
      entries: [
        makeEntry({ id: "db", bucket: "unsynced_episode_db", bytes: 500 * MB, unsyncedDirty: true }),
        makeEntry({ id: "orphan-1", bucket: "orphan_wal_chunk", bytes: 150 * MB, lastAccessedMs: BASE_TS - 3000 }),
        makeEntry({ id: "cache-1", bucket: "expired_render_cache", bytes: 150 * MB, lastAccessedMs: BASE_TS - 2000 }),
        makeEntry({ id: "cold-1", bucket: "synced_cold_snapshot", bytes: 100 * MB, lastAccessedMs: BASE_TS - 1000 }),
      ],
    });
    expect(plan.bytesNeededToReclaim).toBe(200 * MB);
    expect(plan.evictEntries.map((e) => e.id)).toEqual(["orphan-1", "cache-1"]);
    expect(plan.keptEntries.some((e) => e.id === "cold-1")).toBe(true);
    expect(plan.targetHeadroomMet).toBe(true);
    expect(plan.utilizationAfter).toBeLessThanOrEqual(0.7);
  });

  it("미동기화 원고 점유로 목표 여유 공간에 못 미치면 dirtyBlocksHeadroom과 한국어 운영 조치를 명시한다", () => {
    const plan = planOpfsQuotaGarbageCollection({
      quotaBytes: 1000 * MB,
      entries: [
        makeEntry({ id: "dirty-big", bucket: "unsynced_episode_db", bytes: 820 * MB, unsyncedDirty: true }),
        makeEntry({ id: "orphan-small", bucket: "orphan_wal_chunk", bytes: 60 * MB }),
      ],
    });
    expect(plan.targetHeadroomMet).toBe(false);
    expect(plan.dirtyBlocksHeadroom).toBe(true);
    expect(plan.shortfallBytes).toBe(120 * MB);
    expect(plan.warningsKo.length).toBeGreaterThanOrEqual(2);
    expect(plan.operatorActionsKo.some((msg) => msg.includes("동기화"))).toBe(true);
  });

  it("미동기화 원고 비율이 안전 임계치(50%)를 넘으면 여유 공간 달성 여부와 무관하게 사전 경고를 낸다", () => {
    const plan = planOpfsQuotaGarbageCollection({
      quotaBytes: 1000 * MB,
      entries: [
        makeEntry({ id: "dirty-55", bucket: "unsynced_episode_db", bytes: 550 * MB, unsyncedDirty: true }),
        makeEntry({ id: "cache-10", bucket: "expired_render_cache", bytes: 100 * MB }),
      ],
    });
    expect(plan.targetHeadroomMet).toBe(true);
    expect(plan.warningsKo.some((w) => w.includes("안전 기준치"))).toBe(true);
  });
});

describe("Wave 158 — 복구 증명 SHA-256, 순수 OKLCH SVG 및 통합 오케스트레이터", () => {
  it("WAL 스트림의 어떤 1바이트라도 변조되면 복구 증명 SHA-256이 바뀐다", () => {
    const base = createSampleOpfsWalRecoveryScenario();
    const resA = runOpfsWalCrashRecoveryAndQuotaPlan(base);
    const mutatedWal = base.walStream.slice();
    mutatedWal[mutatedWal.length - 1] ^= 0x01;
    const resB = runOpfsWalCrashRecoveryAndQuotaPlan({
      ...base,
      walStream: mutatedWal,
    });
    expect(resA.recoveryProofSha256Hex).toHaveLength(64);
    expect(resA.recoveryProofSha256Hex).not.toBe(resB.recoveryProofSha256Hex);
  });

  it("생성된 진단 SVG는 <svg와 oklch(를 포함하고 #, rgb(, hsl(을 전혀 포함하지 않는다", () => {
    const result = runOpfsWalCrashRecoveryAndQuotaPlan(createSampleOpfsWalRecoveryScenario());
    const svg = result.report.svgDiagram;
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#/);
    expect(svg).not.toMatch(/rgb\(/i);
    expect(svg).not.toMatch(/hsl\(/i);
  });

  it("특수 문자가 포함된 회차 ID도 SVG XML을 깨뜨리지 않고 안전하게 이스케이프한다", () => {
    const base = createSampleOpfsWalRecoveryScenario();
    const res = runOpfsWalCrashRecoveryAndQuotaPlan({
      ...base,
      walStream: new Uint8Array(0),
      replayOptions: { defaultEpisodeId: "ep-<42>&\"draft\"#1" },
      compactionOptions: { defaultEpisodeId: "ep-<42>&\"draft\"#1" },
    });
    const svg = res.report.svgDiagram;
    expect(svg).toContain("&lt;42&gt;&amp;&quot;draft&quot;");
    expect(svg).not.toMatch(/#/);
  });

  it("통합 오케스트레이터가 샘플 시나리오에서 건강한 복구·압축·할당량 계획을 산출한다", () => {
    const result = runOpfsWalCrashRecoveryAndQuotaPlan(createSampleOpfsWalRecoveryScenario());
    expect(result.overallHealthy).toBe(true);
    expect(result.replay.healthStatus).toBe("recovered_torn_tail");
    expect(result.replay.committedTxCount).toBe(2);
    expect(result.replay.abortedTxCount).toBe(1);
    expect(result.replay.uncommittedTxCount).toBe(1);
    expect(result.compaction?.stateHashEquivalent).toBe(true);
    expect((result.compaction?.reclaimedBytes ?? 0) > 0).toBe(true);
    expect(result.quotaPlan.targetHeadroomMet).toBe(true);
    expect(result.quotaPlan.utilizationAfter).toBeLessThanOrEqual(0.7);
    expect(result.quotaPlan.protectedEntries).toHaveLength(2);
    expect(result.report.headlineKo).toContain("ep-042-seoul-rooftop");
  });

  it("동일 입력으로 오케스트레이터를 두 번 호출하면 완벽히 결정론적인 결과를 낸다", () => {
    const first = runOpfsWalCrashRecoveryAndQuotaPlan(createSampleOpfsWalRecoveryScenario());
    const second = runOpfsWalCrashRecoveryAndQuotaPlan(createSampleOpfsWalRecoveryScenario());
    expect(first.recoveryProofSha256Hex).toBe(second.recoveryProofSha256Hex);
    expect(first.report.svgDiagram).toBe(second.report.svgDiagram);
    expect(first.report.summaryLinesKo).toEqual(second.report.summaryLinesKo);
  });

  it("한국어 보고서 문구에 어색한 번역투 상투어(AI 슬롭)가 포함되지 않는다", () => {
    const result = runOpfsWalCrashRecoveryAndQuotaPlan(createSampleOpfsWalRecoveryScenario());
    const joined = [result.report.headlineKo, ...result.report.summaryLinesKo].join("\n");
    expect(joined).not.toContain("가능하게 합니다");
    expect(joined).not.toContain("직관적인 경험을 제공");
    expect(joined).not.toContain("원활한 워크플로우를 보장");
  });
});
