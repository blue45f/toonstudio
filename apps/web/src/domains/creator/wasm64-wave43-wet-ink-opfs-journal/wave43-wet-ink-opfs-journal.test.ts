import { describe, expect, it } from "vitest";

import {
  appendStrokeToJournal,
  computeCrc32,
  computeRectMergeExpansionRatio,
  computeSegmentAaBounds,
  createWetInkPredictor,
  DEFAULT_AA_MARGIN_PX,
  encodeStrokeJournal,
  evaluateCentripetalCatmullRom,
  FLOATS_PER_PACKED_INSTANCE_QUAD,
  JOURNAL_FILE_HEADER_BYTES,
  MAX_PREDICTION_HORIZON_MS,
  MAX_SCISSOR_MERGE_EXPANSION_RATIO,
  mergeDirtyScissorRects,
  MIN_PREDICTION_HORIZON_MS,
  planDirtyScissorInstanceQuads,
  recoverAndDecodeStrokeJournal,
  snapAndClipScissorRect,
  STROKE_JOURNAL_MAGIC,
  STROKE_JOURNAL_VERSION,
  zigzagDecode32,
  zigzagEncode32,
  type JournalStrokeEntry,
  type ScissorRect,
  type StylusInputSample,
  type WetInkPoint,
} from "./index";

function makeSample(
  x: number,
  y: number,
  timestampMs: number,
  overrides: Partial<StylusInputSample> = {},
): StylusInputSample {
  return {
    x,
    y,
    pressure: 0.65,
    tiltX: 12,
    tiltY: -8,
    timestampMs,
    ...overrides,
  };
}

function makePoint(x: number, y: number, timestampMs: number, pressure = 0.5): WetInkPoint {
  return {
    x,
    y,
    pressure,
    tiltX: 5,
    tiltY: -3,
    timestampMs,
    speedPxPerMs: 1,
    isPredicted: false,
  };
}

function makeJournalStroke(sequence: number, count = 12, startX = 120): JournalStrokeEntry {
  const points = Array.from({ length: count }, (_, idx) => ({
    x: startX + idx * 1.75,
    y: 240 + Math.sin(idx * 0.3) * 4.5,
    pressure: Math.min(1, 0.25 + idx * 0.04),
    tiltX: 14.25 - idx * 0.5,
    tiltY: -9.5 + idx * 0.25,
    timestampMs: 10_000 + sequence * 500 + idx * 4.17,
  }));
  return {
    sequence,
    layerSlot: 2,
    brushSizePx: 8.5,
    colorRgba: { r: 28, g: 34, b: 46, a: 255 },
    points,
  };
}

describe("wasm64-wave43-wet-ink-opfs-journal", () => {
  it("1. 구심 Catmull-Rom(alpha=0.5) 보간은 양 끝점(u=0, u=1)을 정확히 통과하고 비균일 간격에서도 안정 보간한다", () => {
    const p0 = makePoint(0, 0, 0, 0.2);
    const p1 = makePoint(100, 0, 8, 0.4);
    const p2 = makePoint(102, 2, 12, 0.6);
    const p3 = makePoint(102, 120, 20, 0.8);

    const atStart = evaluateCentripetalCatmullRom(p0, p1, p2, p3, 0);
    const atEnd = evaluateCentripetalCatmullRom(p0, p1, p2, p3, 1);
    const mid = evaluateCentripetalCatmullRom(p0, p1, p2, p3, 0.5);

    expect(atStart.x).toBe(p1.x);
    expect(atStart.y).toBe(p1.y);
    expect(atEnd.x).toBe(p2.x);
    expect(atEnd.y).toBe(p2.y);
    // 비균일 간격(100px 직후 2.8px 짧은 구간)에서도 구심 매개변수화로 큰 루프 돌출이 발생하지 않는다.
    expect(Math.hypot(mid.x - 101, mid.y - 1)).toBeLessThan(1.5);
  });

  it("2. 240Hz 스타일러스 등속 스트림에서 4~8ms 범위의 다음 1프레임 Wet-Ink 예측 꼬리를 생성한다", () => {
    const predictor = createWetInkPredictor();
    const dt240Hz = 1000 / 240; // 약 4.1667ms

    predictor.pushSample(makeSample(10, 20, 0));
    predictor.pushSample(makeSample(18, 20, dt240Hz));
    const frame = predictor.pushSample(makeSample(26, 20, dt240Hz * 2));

    expect(frame.diagnostics.horizonClamped).toBe(false);
    expect(frame.diagnostics.effectiveHorizonMs).toBeGreaterThanOrEqual(MIN_PREDICTION_HORIZON_MS);
    expect(frame.diagnostics.effectiveHorizonMs).toBeLessThanOrEqual(MAX_PREDICTION_HORIZON_MS);
    expect(frame.predictedTip).not.toBeNull();
    expect(frame.predictedTip?.x ?? 0).toBeGreaterThan(26);
    expect(frame.predictedTailSegments.length).toBeGreaterThan(0);
  });

  it("3. 120Hz 입력 스트림에서 후속 샘플 도착 시 직전 예측 구간이 0-이음새(seamErrorPx === 0) 확정 세그먼트로 교체된다", () => {
    const predictor = createWetInkPredictor({ subdivisions: 4 });
    const samples = [
      makeSample(50, 100, 0),
      makeSample(62, 104, 8),
      makeSample(75, 110, 16),
      makeSample(89, 118, 24),
      makeSample(104, 125, 32),
    ];

    for (const sample of samples) {
      const frame = predictor.pushSample(sample);
      expect(frame.diagnostics.seamErrorPx).toBe(0);
      if (frame.wetInkOverlaySegments.length > 0) {
        const firstOverlay = frame.wetInkOverlaySegments[0];
        expect(firstOverlay?.start.x).toBe(frame.lastCommittedPoint.x);
        expect(firstOverlay?.start.y).toBe(frame.lastCommittedPoint.y);
      }
    }

    const finished = predictor.finishStroke();
    expect(finished).not.toBeNull();
    expect(finished?.diagnostics.seamErrorPx).toBe(0);
    const allCommitted = finished?.allCommittedSegments ?? [];
    expect(allCommitted.length).toBe((samples.length - 1) * 4);

    for (let i = 0; i + 1 < allCommitted.length; i += 1) {
      const curr = allCommitted[i];
      const next = allCommitted[i + 1];
      expect(curr?.end.x).toBe(next?.start.x);
      expect(curr?.end.y).toBe(next?.start.y);
    }
  });

  it("4. 65도를 초과하는 급격한 방향 전환 구간에서 예측 지평을 자동 감쇠해 모서리 오버슈트를 차단한다", () => {
    const predictor = createWetInkPredictor({ horizonMs: 8 });
    predictor.pushSample(makeSample(0, 100, 0));
    predictor.pushSample(makeSample(20, 100, 8));
    const steadyFrame = predictor.pushSample(makeSample(40, 100, 16));

    // +X 진행 중 90도 직각 상향 전환(40, 100 -> 40, 120)
    const sharpTurnFrame = predictor.pushSample(makeSample(40, 120, 24));

    expect(sharpTurnFrame.diagnostics.turnAngleDeg).toBeCloseTo(90, 2);
    expect(sharpTurnFrame.diagnostics.horizonClamped).toBe(true);
    expect(sharpTurnFrame.diagnostics.clampReason).toBe("sharp-turn");
    expect(sharpTurnFrame.diagnostics.effectiveHorizonMs).toBeLessThan(
      steadyFrame.diagnostics.effectiveHorizonMs * 0.2,
    );
    // 이전 +X 관성으로 x > 40 바깥으로 튀는 가로 방향 오버슈트가 전혀 없어야 한다.
    if (sharpTurnFrame.predictedTip !== null) {
      expect(sharpTurnFrame.predictedTip.x).toBeCloseTo(40, 5);
    }
  });

  it("5. 펜 리프트(pressure < 0.03) 감지 즉시 예측 꼬리 길이를 0으로 차단해 획 끝 삐침을 방지한다", () => {
    const predictor = createWetInkPredictor({ horizonMs: 6 });
    predictor.pushSample(makeSample(100, 200, 0, { pressure: 0.55 }));
    predictor.pushSample(makeSample(116, 200, 6, { pressure: 0.35 }));
    const liftFrame = predictor.pushSample(makeSample(130, 200, 12, { pressure: 0.02 }));

    expect(liftFrame.diagnostics.horizonClamped).toBe(true);
    expect(liftFrame.diagnostics.clampReason).toBe("pen-lift");
    expect(liftFrame.diagnostics.effectiveHorizonMs).toBe(0);
    expect(liftFrame.diagnostics.predictedDistancePx).toBe(0);
    expect(liftFrame.predictedTip).toBeNull();
    expect(liftFrame.predictedTailSegments).toHaveLength(0);
  });

  it("6. 초고속 스트로크 입력 시 최대 예측 연장 거리 상한(maxPredictionDistancePx) 내로 안전하게 클램핑한다", () => {
    const predictor = createWetInkPredictor({ horizonMs: 8, maxPredictionDistancePx: 14 });
    predictor.pushSample(makeSample(0, 0, 0));
    predictor.pushSample(makeSample(80, 0, 4));
    const fastFrame = predictor.pushSample(makeSample(160, 0, 8));

    expect(fastFrame.diagnostics.horizonClamped).toBe(true);
    expect(fastFrame.diagnostics.clampReason).toBe("max-distance");
    expect(fastFrame.diagnostics.predictedDistancePx).toBeCloseTo(14, 4);
  });

  it("7. finishStroke 호출 시 미확정 보류 구간을 모두 확정 세그먼트로 편입하고 Wet-Ink 오버레이를 완전히 비운다", () => {
    const predictor = createWetInkPredictor({ subdivisions: 3 });
    predictor.pushSample(makeSample(10, 10, 0));
    const mid = predictor.pushSample(makeSample(30, 25, 6));
    expect(mid.allCommittedSegments).toHaveLength(0);
    expect(mid.wetInkOverlaySegments.length).toBeGreaterThan(0);

    const endFrame = predictor.finishStroke();
    expect(endFrame).not.toBeNull();
    expect(endFrame?.wetInkOverlaySegments).toHaveLength(0);
    expect(endFrame?.predictedTailSegments).toHaveLength(0);
    expect(endFrame?.allCommittedSegments).toHaveLength(3);
    expect(endFrame?.lastCommittedPoint.x).toBe(30);
    expect(endFrame?.lastCommittedPoint.y).toBe(25);
  });

  it("8. 세그먼트 경계 상자 계산 시 양 끝 브러시 반경과 안티앨리어싱 여백(2px)을 정확히 반영한다", () => {
    const bounds = computeSegmentAaBounds({
      x0: 100,
      y0: 200,
      radius0Px: 6,
      x1: 120,
      y1: 190,
      radius1Px: 10,
    });

    expect(DEFAULT_AA_MARGIN_PX).toBe(2);
    expect(bounds.minX).toBe(92); // min(100 - 8, 120 - 12)
    expect(bounds.minY).toBe(178); // min(200 - 8, 190 - 12)
    expect(bounds.maxX).toBe(132); // max(100 + 8, 120 + 12)
    expect(bounds.maxY).toBe(208); // max(200 + 8, 190 + 12)
  });

  it("9. 타일 정렬 Scissor 사각형 산출 시 뷰포트 음수·초과 좌표를 클리핑하고 화면 밖 세그먼트는 컬링한다", () => {
    const partialBounds = computeSegmentAaBounds({
      x0: -4,
      y0: 500,
      radius0Px: 8,
      x1: 18,
      y1: 508,
      radius1Px: 8,
    });
    const clipped = snapAndClipScissorRect(partialBounds, { widthPx: 512, heightPx: 512 }, 32);
    expect(clipped).toEqual({
      x: 0,
      y: 480,
      width: 32,
      height: 32,
      right: 32,
      bottom: 512,
      areaPx2: 1024,
    });

    const offscreenBounds = computeSegmentAaBounds({
      x0: -50,
      y0: -50,
      radius0Px: 5,
      x1: -30,
      y1: -40,
      radius1Px: 5,
    });
    expect(snapAndClipScissorRect(offscreenBounds, { widthPx: 512, heightPx: 512 }, 32)).toBeNull();
  });

  it("10. 인접한 수평·중첩 더티 사각형은 면적 팽창률이 1.25 이하일 때 단일 Scissor 사각형으로 병합한다", () => {
    const r1: ScissorRect = { x: 0, y: 64, width: 64, height: 32, right: 64, bottom: 96, areaPx2: 2048 };
    const r2: ScissorRect = { x: 64, y: 64, width: 32, height: 32, right: 96, bottom: 96, areaPx2: 1024 };
    const r3: ScissorRect = { x: 32, y: 64, width: 64, height: 32, right: 96, bottom: 96, areaPx2: 2048 };

    expect(computeRectMergeExpansionRatio(r1, r2)).toBe(1);
    const merged = mergeDirtyScissorRects([r1, r2, r3]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({
      x: 0,
      y: 64,
      width: 96,
      height: 32,
      right: 96,
      bottom: 96,
      areaPx2: 3072,
    });
  });

  it("11. 대각선 계단형 획처럼 병합 시 면적 팽창률이 1.25를 초과하는 사각형 쌍은 병합하지 않고 분리 유지한다", () => {
    const diagA: ScissorRect = { x: 0, y: 0, width: 32, height: 32, right: 32, bottom: 32, areaPx2: 1024 };
    const diagB: ScissorRect = { x: 32, y: 32, width: 32, height: 32, right: 64, bottom: 64, areaPx2: 1024 };

    const ratio = computeRectMergeExpansionRatio(diagA, diagB);
    expect(ratio).toBe(2);
    expect(ratio).toBeGreaterThan(MAX_SCISSOR_MERGE_EXPANSION_RATIO);

    const merged = mergeDirtyScissorRects([diagA, diagB]);
    expect(merged).toHaveLength(2);
  });

  it("12. 가시 세그먼트를 WebGPU 정렬 규격(인스턴스당 12 float) Float32Array와 드로우 배치로 정확히 패킹한다", () => {
    const plan = planDirtyScissorInstanceQuads(
      [
        { x0: 20, y0: 20, radius0Px: 4, pressure0: 0.6, x1: 42, y1: 22, radius1Px: 5, pressure1: 0.7, isPredicted: false },
        { x0: 42, y0: 22, radius0Px: 5, pressure0: 0.7, x1: 54, y1: 24, radius1Px: 4.5, pressure1: 0.65, isPredicted: true },
        { x0: 900, y0: 900, radius0Px: 4, x1: 920, y1: 920, radius1Px: 4 },
      ],
      { viewport: { widthPx: 512, heightPx: 512 }, tileSizePx: 32 },
    );

    expect(plan.culledSegmentCount).toBe(1);
    expect(plan.instanceCount).toBe(2);
    expect(plan.packedInstances.length).toBe(2 * FLOATS_PER_PACKED_INSTANCE_QUAD);
    expect(plan.scissorRects).toHaveLength(1);
    expect(plan.drawBatches).toHaveLength(1);
    expect(plan.drawBatches[0]?.instanceCount).toBe(2);
    expect(plan.packedInstances[10]).toBe(0); // 첫 번째 확정 세그먼트 isPredicted = 0
    expect(plan.packedInstances[22]).toBe(1); // 두 번째 예측 세그먼트 isPredicted = 1
  });

  it("13. 호출자가 전달한 재사용 Float32Array 버퍼가 충분하면 추가 할당 없이 제자리 서브뷰에 패킹한다", () => {
    const pool = new Float32Array(128);
    const plan = planDirtyScissorInstanceQuads(
      [{ x0: 40, y0: 40, radius0Px: 6, x1: 52, y1: 44, radius1Px: 6 }],
      { viewport: { widthPx: 256, heightPx: 256 }, reusableInstanceBuffer: pool },
    );

    expect(plan.packedInstances.buffer).toBe(pool.buffer);
    expect(plan.packedInstances.length).toBe(12);
    expect(pool[0]).toBe(40);
    expect(pool[2]).toBe(52);
  });

  it("14. IEEE 802.3 CRC32 체크섬과 32비트 부호 있는 ZigZag 가변 길이 변환이 표준 벡터 및 경계값과 일치한다", () => {
    const asciiDigits = new TextEncoder().encode("123456789");
    expect(computeCrc32(asciiDigits)).toBe(0xcbf43926);

    for (const sample of [0, -1, 1, -2, 2, -123456, 123456, -0x3fffffff, 0x3fffffff]) {
      expect(zigzagDecode32(zigzagEncode32(sample))).toBe(sample);
    }
  });

  it("15. TSWJ 매직 헤더·버전·시퀀스·델타 좌표를 인코딩한 뒤 복원하면 원본 획 메타데이터와 부픽셀 좌표를 정밀 재현한다", () => {
    const original = [makeJournalStroke(0, 15, 80), makeJournalStroke(1, 10, 260)];
    const bytes = encodeStrokeJournal(original, { documentEpoch: 42, coordQuantScale: 100 });

    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe(STROKE_JOURNAL_MAGIC);
    expect(bytes[4]).toBe(STROKE_JOURNAL_VERSION);

    const decoded = recoverAndDecodeStrokeJournal(bytes);
    expect(decoded.status).toBe("healthy");
    expect(decoded.headerValid).toBe(true);
    expect(decoded.documentEpoch).toBe(42);
    expect(decoded.sequenceContiguous).toBe(true);
    expect(decoded.strokes).toHaveLength(2);

    const s0 = decoded.strokes[0];
    expect(s0?.sequence).toBe(0);
    expect(s0?.brushSizePx).toBeCloseTo(8.5, 2);
    expect(s0?.colorRgba).toEqual({ r: 28, g: 34, b: 46, a: 255 });
    expect(s0?.points).toHaveLength(15);

    const origLast = original[0]?.points[14];
    const decLast = s0?.points[14];
    expect(decLast?.x ?? 0).toBeCloseTo(origLast?.x ?? 0, 2);
    expect(decLast?.y ?? 0).toBeCloseTo(origLast?.y ?? 0, 2);
    expect(decLast?.pressure ?? 0).toBeCloseTo(origLast?.pressure ?? 0, 3);
  });

  it("16. 고주파 연속 획에서 ZigZag 가변 길이 델타 압축이 비압축 64비트 부동소수점 배열보다 작은 크기를 달성한다", () => {
    const longStroke = makeJournalStroke(0, 240, 300);
    const encoded = encodeStrokeJournal([longStroke]);
    const rawUncompressedFloatBytes = 240 * 6 * 8; // 포인트당 6채널 * float64(8B) = 11,520B

    expect(encoded.byteLength).toBeLessThan(rawUncompressedFloatBytes * 0.35);
  });

  it("17. 전원 차단으로 마지막 레코드 바이트가 중간에 잘린 저널에서 손상 꼬리만 절단하고 직전 확정 획까지 0손실 복구한다", () => {
    const strokes = [makeJournalStroke(0, 8), makeJournalStroke(1, 8), makeJournalStroke(2, 16)];
    const twoStrokesBytes = encodeStrokeJournal(strokes.slice(0, 2));
    const fullThreeBytes = encodeStrokeJournal(strokes);

    // 3번째 획 쓰기 도중 크래시가 발생해 마지막 9바이트가 유실된 상황 모사
    const crashedBytes = fullThreeBytes.slice(0, fullThreeBytes.byteLength - 9);
    const recovered = recoverAndDecodeStrokeJournal(crashedBytes);

    expect(recovered.status).toBe("tail-truncated-recovered");
    expect(recovered.truncatedTailDetected).toBe(true);
    expect(recovered.strokes).toHaveLength(2);
    expect(recovered.strokes[0]?.sequence).toBe(0);
    expect(recovered.strokes[1]?.sequence).toBe(1);
    expect(recovered.safeTruncateByteOffset).toBe(twoStrokesBytes.byteLength);
    expect(recovered.repairedJournalBytes).toEqual(twoStrokesBytes);
  });

  it("18. 레코드 내부 바이트 변조 발생 시 CRC32 불일치를 즉시 감지하고 오염된 레코드 유입을 차단한다", () => {
    const firstStroke = makeJournalStroke(0, 8);
    const secondStroke = makeJournalStroke(1, 8);
    const firstOnlyBytes = encodeStrokeJournal([firstStroke]);
    const tampered = encodeStrokeJournal([firstStroke, secondStroke]);

    // 두 번째 프레임 페이로드 내부 바이트 비트 반전 변조
    const targetIdx = tampered.byteLength - 4;
    tampered[targetIdx] = (tampered[targetIdx] ?? 0) ^ 0xff;

    const recovered = recoverAndDecodeStrokeJournal(tampered);
    expect(recovered.status).toBe("crc-mismatch-truncated");
    expect(recovered.crcMismatchDetected).toBe(true);
    expect(recovered.strokes).toHaveLength(1);
    expect(recovered.safeTruncateByteOffset).toBe(firstOnlyBytes.byteLength);
  });

  it("19. 매직 헤더(TSWJ) 손상·미지원 버전·잘린 파일 헤더 입력을 invalid-header 상태로 안전하게 거부한다", () => {
    const badMagic = encodeStrokeJournal([makeJournalStroke(0, 4)]);
    badMagic[0] = 0x00;
    expect(recoverAndDecodeStrokeJournal(badMagic).status).toBe("invalid-header");

    const badVersion = encodeStrokeJournal([makeJournalStroke(0, 4)]);
    badVersion[4] = 99;
    expect(recoverAndDecodeStrokeJournal(badVersion).status).toBe("invalid-header");

    const truncatedHeader = new Uint8Array(JOURNAL_FILE_HEADER_BYTES - 5);
    const shortRes = recoverAndDecodeStrokeJournal(truncatedHeader);
    expect(shortRes.status).toBe("invalid-header");
    expect(shortRes.truncatedTailDetected).toBe(true);
  });

  it("20. 크래시 복구로 절단된 repairedJournalBytes 뒤에 새 획을 appendStrokeToJournal로 이어 쓰면 연속 시퀀스가 무결하게 유지된다", () => {
    const s0 = makeJournalStroke(0, 6);
    const s1 = makeJournalStroke(1, 6);
    const s2Replacement = makeJournalStroke(2, 9, 410);

    const crashed = encodeStrokeJournal([s0, s1, makeJournalStroke(2, 12)]).slice(0, -11);
    const recovered = recoverAndDecodeStrokeJournal(crashed);
    expect(recovered.strokes).toHaveLength(2);

    const resumed = appendStrokeToJournal(recovered.repairedJournalBytes, s2Replacement);
    const verified = recoverAndDecodeStrokeJournal(resumed);

    expect(verified.status).toBe("healthy");
    expect(verified.crcMismatchDetected).toBe(false);
    expect(verified.truncatedTailDetected).toBe(false);
    expect(verified.sequenceContiguous).toBe(true);
    expect(verified.strokes).toHaveLength(3);
    expect(verified.strokes[2]?.points).toHaveLength(9);
  });
});
