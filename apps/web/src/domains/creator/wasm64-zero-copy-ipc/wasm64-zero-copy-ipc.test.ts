import { describe, expect, it } from "vitest";

import {
  applyTileXorDeltaInPlace,
  compressTileXorDelta,
  createIpcScratchCommand,
  createSoaNodeStateScratch,
  decompressTileXorDelta,
  WASM64_CACHE_LINE_BYTES,
  WASM64_IPC_DATA_BYTE_OFFSET,
  WASM64_IPC_HEAD_BYTE_OFFSET,
  WASM64_IPC_SLOT_STRIDE_BYTES,
  WASM64_IPC_TAIL_BYTE_OFFSET,
  WASM64_SOA_SEQLOCK_BYTE_OFFSET,
  WASM64_TILE_BYTE_LENGTH,
  WASM64_TILE_DIM,
  WASM64_UNDO_HEADER_BYTES,
  Wasm64ArenaOverflowError,
  Wasm64BlendMode,
  Wasm64IpcOpcode,
  Wasm64NodeFlag,
  Wasm64SharedArena,
  Wasm64SoaRenderStateTree,
  Wasm64TileUndoHistory,
  Wasm64ZeroCopyIpcRing,
} from "./index";

function countByteMismatches(a: Uint8Array, b: Uint8Array): number {
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) diff += 1;
  }
  return diff;
}

/** 결정적 시드 기반 웹툰 브러시 스트로크를 256×256 RGBA8 타일에 렌더링한다. */
function paintWebtoonBrushStroke(tile: Uint8Array, strokeIndex: number): void {
  const startX = 16 + ((strokeIndex * 37) % 180);
  const startY = 18 + ((strokeIndex * 29) % 180);
  const endX = 40 + ((strokeIndex * 73 + 95) % 196);
  const endY = 30 + ((strokeIndex * 53 + 110) % 196);
  const radius = 2.2 + (strokeIndex % 5) * 1.1;
  const inkR = strokeIndex % 4 === 0 ? 22 : (strokeIndex * 41) & 0xff;
  const inkG = strokeIndex % 4 === 0 ? 24 : (strokeIndex * 67) & 0xff;
  const inkB = strokeIndex % 4 === 0 ? 30 : (strokeIndex * 97) & 0xff;
  const steps = 48;

  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = startX + (endX - startX) * t + Math.sin(t * Math.PI * 2 + strokeIndex) * 6;
    const cy = startY + (endY - startY) * t + Math.cos(t * Math.PI + strokeIndex) * 4;
    const localRadius = radius * (0.65 + 0.55 * Math.sin(t * Math.PI));
    const minX = Math.max(0, Math.floor(cx - localRadius - 1));
    const maxX = Math.min(WASM64_TILE_DIM - 1, Math.ceil(cx + localRadius + 1));
    const minY = Math.max(0, Math.floor(cy - localRadius - 1));
    const maxY = Math.min(WASM64_TILE_DIM - 1, Math.ceil(cy + localRadius + 1));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > localRadius + 1) continue;
        const cov = dist <= localRadius ? 1 : Math.max(0, 1 - (dist - localRadius));
        const alpha = Math.min(1, cov * (strokeIndex % 3 === 0 ? 0.55 : 0.96));
        const off = (y * WASM64_TILE_DIM + x) * 4;
        tile[off] = Math.round(tile[off] * (1 - alpha) + inkR * alpha);
        tile[off + 1] = Math.round(tile[off + 1] * (1 - alpha) + inkG * alpha);
        tile[off + 2] = Math.round(tile[off + 2] * (1 - alpha) + inkB * alpha);
        tile[off + 3] = 255;
      }
    }
  }
}

describe("Wasm64SharedArena", () => {
  it("64바이트 캐시라인 정렬 불변식, O(1) 프레임 리셋, 피크 워터마크, OOM 가드를 검증한다", () => {
    const arena = new Wasm64SharedArena({
      capacityBytes: 4096,
      slabCount: 4,
      slabSizeBytes: 100, // 128B로 64B 올림 정렬
      preferShared: true,
    });

    expect(arena.isShared).toBe(true);
    expect(arena.backingMode).toBe("shared-array-buffer");
    expect(arena.slabSizeBytes).toBe(128);
    expect(arena.bumpCapacityBytes).toBe(4096 - 4 * 128);

    // 영속 영역 할당 + 경계 고정
    const persistent = arena.allocUint32(7);
    persistent[0] = 0xcafebabe;
    expect(persistent.byteOffset % WASM64_CACHE_LINE_BYTES).toBe(0);
    const frameBase = arena.pinPersistentBoundary();
    expect(frameBase).toBe(64);

    // 홀수 크기 연속 할당 — 모든 오프셋이 64바이트 배수여야 한다
    const s1 = arena.allocAligned(1);
    const u8 = arena.allocUint8(7);
    const f32 = arena.allocFloat32(13);
    const i32 = arena.allocInt32(5);
    const u32 = arena.allocUint32(3);

    expect(s1.byteOffset % 64).toBe(0);
    expect(u8.byteOffset % 64).toBe(0);
    expect(f32.byteOffset % 64).toBe(0);
    expect(i32.byteOffset % 64).toBe(0);
    expect(u32.byteOffset % 64).toBe(0);
    expect(f32.buffer).toBe(arena.buffer);

    const beforeReset = arena.getStats();
    expect(beforeReset.peakHighWaterBytes).toBeGreaterThanOrEqual(beforeReset.usedBytes);
    expect(beforeReset.paddingWasteBytes).toBeGreaterThan(0);
    expect(beforeReset.internalFragmentationRatio).toBeGreaterThan(0);

    // O(1) 프레임 리셋: 커서는 frameBase로 되돌아가고 피크 워터마크·영속 데이터는 보존된다
    arena.resetFrame();
    const afterReset = arena.getStats();
    expect(afterReset.usedBytes).toBe(frameBase);
    expect(afterReset.frameUsedBytes).toBe(0);
    expect(afterReset.frameResetCount).toBe(1);
    expect(afterReset.peakHighWaterBytes).toBe(beforeReset.peakHighWaterBytes);
    expect(persistent[0]).toBe(0xcafebabe);

    // Fixed-Slab 대여·반납·재사용 및 오버플로 가드
    const slabs = [arena.allocSlab(), arena.allocSlab(), arena.allocSlab(), arena.allocSlab()];
    for (const slab of slabs) {
      expect(slab.byteOffset % 64).toBe(0);
      expect(slab.byteLength).toBe(128);
    }
    expect(() => arena.allocSlab()).toThrow(Wasm64ArenaOverflowError);
    arena.freeSlab(slabs[1].slabIndex);
    const reused = arena.allocSlab();
    expect(reused.slabIndex).toBe(slabs[1].slabIndex);
    expect(() => arena.freeSlab(slabs[1].slabIndex)).not.toThrow();
    expect(() => arena.freeSlab(slabs[1].slabIndex)).toThrow(RangeError);

    // Bump 오버플로 시 커서 훼손 없이 Wasm64ArenaOverflowError를 던진다
    const cursorBeforeOom = arena.getStats().usedBytes;
    expect(() => arena.allocAligned(arena.bumpCapacityBytes + 64)).toThrow(Wasm64ArenaOverflowError);
    expect(arena.getStats().usedBytes).toBe(cursorBeforeOom);
  });

  it("crossOriginIsolated=false 또는 preferShared=false 환경에서 ArrayBuffer로 안전 폴백한다", () => {
    const fallbackA = new Wasm64SharedArena({
      capacityBytes: 1024,
      crossOriginIsolatedOverride: false,
    });
    const fallbackB = new Wasm64SharedArena({
      capacityBytes: 1024,
      preferShared: false,
    });

    expect(fallbackA.isShared).toBe(false);
    expect(fallbackA.backingMode).toBe("array-buffer-fallback");
    expect(fallbackA.buffer).toBeInstanceOf(ArrayBuffer);
    expect(fallbackB.isShared).toBe(false);

    const arr = fallbackA.allocFloat32(16);
    arr[0] = 3.25;
    expect(arr.byteOffset % 64).toBe(0);
    expect(arr[0]).toBe(3.25);
  });
});

describe("Wasm64ZeroCopyIpcRing", () => {
  it("독립 64B 캐시라인 격리, 4종 바이너리 커맨드 라운드트립, 랩어라운드 및 풀/엠프티 경계를 검증한다", () => {
    expect(WASM64_IPC_HEAD_BYTE_OFFSET).toBe(64);
    expect(WASM64_IPC_TAIL_BYTE_OFFSET).toBe(128);
    expect(Math.abs(WASM64_IPC_TAIL_BYTE_OFFSET - WASM64_IPC_HEAD_BYTE_OFFSET)).toBeGreaterThanOrEqual(64);
    expect(WASM64_IPC_DATA_BYTE_OFFSET % 64).toBe(0);
    expect(WASM64_IPC_SLOT_STRIDE_BYTES).toBe(64);

    const producer = Wasm64ZeroCopyIpcRing.create({ capacitySlots: 16 });
    const consumer = Wasm64ZeroCopyIpcRing.attach(producer.buffer);
    expect(producer.isShared).toBe(true);
    expect(consumer.buffer).toBe(producer.buffer);
    expect(consumer.isEmpty).toBe(true);
    expect(consumer.pop()).toBeNull();

    // 4종 고정 바이너리 커맨드 왕복 검증
    expect(
      producer.pushPointerStrokeBatch(1, 1001.25, 7, 42, 64, 512, 8.5, 0.75, 10, 20, 110, 140, 3),
    ).toBe(true);
    expect(
      producer.pushTileDirtyCommit(2, 1002.5, 7, -3, 14, 9, 4096, WASM64_TILE_BYTE_LENGTH, 12, 16, 48, 32, 1),
    ).toBe(true);
    expect(
      producer.pushCameraTransformUpdate(3, 1003.75, -120.5, 440.25, 2.5, 0.25, 1920, 1080, 2, 1),
    ).toBe(true);
    expect(
      producer.pushFrameTelemetrySample(4, 1004.125, 600, 4.25, 1.5, 0.75, 6, 131072, 18432, 3),
    ).toBe(true);

    const c1 = consumer.pop();
    const c2 = consumer.pop();
    const c3 = consumer.pop();
    const c4 = consumer.pop();
    expect(c1).toEqual({
      opcode: Wasm64IpcOpcode.PointerStrokeBatch,
      sequence: 1, timestampMs: 1001.25, layerId: 7, strokeId: 42, pointCount: 64,
      arenaByteOffset: 512, brushRadiusPx: 8.5, pressureMean: 0.75,
      minX: 10, minY: 20, maxX: 110, maxY: 140, flags: 3,
    });
    expect(c2).toEqual({
      opcode: Wasm64IpcOpcode.TileDirtyCommit,
      sequence: 2, timestampMs: 1002.5, layerId: 7, tileX: -3, tileY: 14, generation: 9,
      tileArenaOffset: 4096, byteLength: WASM64_TILE_BYTE_LENGTH,
      dirtyRectX: 12, dirtyRectY: 16, dirtyRectW: 48, dirtyRectH: 32, compressionKind: 1,
    });
    expect(c3).toEqual({
      opcode: Wasm64IpcOpcode.CameraTransformUpdate,
      sequence: 3, timestampMs: 1003.75, panX: -120.5, panY: 440.25, zoom: 2.5,
      rotationRad: 0.25, viewportWidth: 1920, viewportHeight: 1080, devicePixelRatio: 2, flags: 1,
    });
    expect(c4).toEqual({
      opcode: Wasm64IpcOpcode.FrameTelemetrySample,
      sequence: 4, timestampMs: 1004.125, frameIndex: 600, frameTimeMs: 4.25,
      wasmKernelMs: 1.5, gpuSubmitMs: 0.75, dirtyTileCount: 6, arenaUsedBytes: 131072,
      undoCompressedBytes: 18432, ringDepth: 3,
    });

    // Full / Empty 경계 및 12회 연속 랩어라운드 검증
    const scratch = createIpcScratchCommand();
    let seq = 100;
    for (let cycle = 0; cycle < 12; cycle += 1) {
      for (let slot = 0; slot < 16; slot += 1) {
        expect(producer.pushCameraTransformUpdate(seq + slot, seq + slot, slot, -slot, 1, 0, 800, 600, 1, 0)).toBe(true);
      }
      expect(producer.isFull).toBe(true);
      expect(producer.pushCameraTransformUpdate(999999, 0, 0, 0, 1, 0, 1, 1, 1, 0)).toBe(false);

      for (let slot = 0; slot < 16; slot += 1) {
        expect(consumer.popInto(scratch)).toBe(Wasm64IpcOpcode.CameraTransformUpdate);
        expect(scratch.sequence).toBe(seq + slot);
        expect(scratch.f0).toBe(slot);
      }
      expect(consumer.isEmpty).toBe(true);
      expect(consumer.popInto(scratch)).toBe(Wasm64IpcOpcode.Empty);
      seq += 16;
    }
    expect(producer.getStats().droppedCount).toBe(12);
    expect(consumer.getStats().consumedCount).toBe(4 + 12 * 16);
  });

  it("10,000건 바이너리 IPC 커맨드를 제로-할당 배치 파이프라인으로 무손실 처리하고 폴백 모드도 지원한다", () => {
    const TOTAL = 10_000;
    const BATCH = 256;
    const producer = Wasm64ZeroCopyIpcRing.create({ capacitySlots: 512 });
    const consumer = Wasm64ZeroCopyIpcRing.attach(producer.buffer);
    const scratch = createIpcScratchCommand();

    let pushed = 0;
    let popped = 0;
    const startMs = performance.now();
    while (popped < TOTAL) {
      const burst = Math.min(BATCH, TOTAL - pushed);
      for (let i = 0; i < burst; i += 1) {
        const seq = pushed + i;
        const ok =
          (seq & 1) === 0
            ? producer.pushPointerStrokeBatch(seq, seq * 0.5, 2, seq, 16, seq * 64, 6.5, 0.9, 1, 2, 30, 40, 1)
            : producer.pushTileDirtyCommit(seq, seq * 0.5, 2, seq & 15, (seq >> 4) & 15, seq, seq * 64, 262144, 0, 0, 64, 64, 1);
        if (!ok) throw new Error(`Ring unexpectedly full at seq=${seq}`);
      }
      pushed += burst;
      const drained = consumer.drainInto(scratch, (cmd) => {
        if (cmd.sequence !== popped) {
          throw new Error(`Out-of-order IPC command: expected ${popped}, got ${cmd.sequence}`);
        }
        popped += 1;
      });
      expect(drained).toBe(burst);
    }
    const elapsedMs = Math.max(0.001, performance.now() - startMs);
    const cmdsPerSec = Math.round((TOTAL / elapsedMs) * 1000);
    expect(popped).toBe(TOTAL);
    expect(consumer.isEmpty).toBe(true);
    expect(cmdsPerSec).toBeGreaterThan(100_000);

    // ArrayBuffer 폴백 + pushCommand 유니온 API 검증
    const fallbackRing = Wasm64ZeroCopyIpcRing.create({
      capacitySlots: 8,
      crossOriginIsolatedOverride: false,
    });
    expect(fallbackRing.isShared).toBe(false);
    expect(fallbackRing.backingMode).toBe("array-buffer-fallback");
    expect(
      fallbackRing.pushCommand({
        opcode: Wasm64IpcOpcode.FrameTelemetrySample,
        sequence: 77, timestampMs: 12.5, frameIndex: 1, frameTimeMs: 4,
        wasmKernelMs: 1, gpuSubmitMs: 0.5, dirtyTileCount: 2,
        arenaUsedBytes: 1024, undoCompressedBytes: 512, ringDepth: 0,
      }),
    ).toBe(true);
    const decoded = fallbackRing.pop();
    expect(decoded?.opcode).toBe(Wasm64IpcOpcode.FrameTelemetrySample);
    expect(decoded?.sequence).toBe(77);
  });
});

describe("Wasm64SoaRenderStateTree", () => {
  it("12개 64B 정렬 컬럼, 0-직렬화 교차 뷰 가시성, Atomics.add 결정적 더티 스냅샷을 검증한다", () => {
    const arena = new Wasm64SharedArena({ capacityBytes: 65_536 });
    const mainView = Wasm64SoaRenderStateTree.allocate(arena, 32);
    const workerView = Wasm64SoaRenderStateTree.attach(arena.buffer, mainView.baseByteOffset);

    expect(mainView.isShared).toBe(true);
    expect(workerView.buffer).toBe(mainView.buffer);

    // 모든 12개 컬럼 + Seqlock 헤더가 64바이트 정렬되어야 한다
    const offsets = mainView.getColumnOffsets();
    const allOffsets = [
      offsets.baseByteOffset, offsets.seqlockByteOffset,
      offsets.layerIds, offsets.parentIndex, offsets.flags, offsets.blendMode,
      offsets.opacity, offsets.boundsX, offsets.boundsY, offsets.boundsW,
      offsets.boundsH, offsets.zOrder, offsets.dirtyGeneration, offsets.tileArenaOffset,
    ];
    for (const off of allOffsets) {
      expect(off % WASM64_CACHE_LINE_BYTES).toBe(0);
    }
    expect(offsets.seqlockByteOffset - offsets.baseByteOffset).toBe(WASM64_SOA_SEQLOCK_BYTE_OFFSET);

    // 메인 뷰에서 쓰기 -> 워커 뷰가 직렬화/복사 없이 즉시 관측
    mainView.upsertNode(0, {
      layerId: 101, blendMode: Wasm64BlendMode.Multiply, opacity: 0.75,
      boundsX: 10, boundsY: 20, boundsW: 512, boundsH: 768, zOrder: 0, tileArenaOffset: 8192,
    });
    mainView.upsertNode(1, {
      layerId: 102, parentIndex: 0, flags: Wasm64NodeFlag.Visible | Wasm64NodeFlag.ClippingMask,
      blendMode: Wasm64BlendMode.AddGlow, opacity: 0.5,
      boundsX: 32, boundsY: 64, boundsW: 256, boundsH: 256, zOrder: 1, tileArenaOffset: 16384,
    });
    const snap1 = mainView.commitGeneration();
    expect(snap1.generation).toBe(1);
    expect(snap1.dirtyNodeCount).toBe(2);

    const scratch = createSoaNodeStateScratch();
    workerView.readNodeInto(1, scratch);
    expect(scratch.layerId).toBe(102);
    expect(scratch.parentIndex).toBe(0);
    expect(scratch.blendMode).toBe(Wasm64BlendMode.AddGlow);
    expect(scratch.opacity).toBeCloseTo(0.5, 5);
    expect(scratch.tileArenaOffset).toBe(16384);

    // 독립 2개 리더(WASM 컴포지터 / WebGPU 렌더러)의 결정적 더티 세대 추적
    const dirtyBuf = new Int32Array(32);
    let compositorLastGen = 0;
    let gpuLastGen = 0;
    expect(workerView.collectDirtyIndicesSince(compositorLastGen, dirtyBuf)).toBe(2);
    compositorLastGen = workerView.committedGeneration;

    // 2세대: 노드 1만 변경
    mainView.setNodeOpacity(1, 0.25);
    mainView.setNodeBounds(1, 40, 80, 300, 300);
    const snap2 = mainView.commitGeneration();
    expect(snap2.generation).toBe(2);
    expect(snap2.dirtyNodeCount).toBe(1);

    // 컴포지터(gen 1 이후)는 [1]만, 뒤처진 GPU 렌더러(gen 0 이후)는 [0, 1] 모두 관측한다
    const compDirtyCount = workerView.collectDirtyIndicesSince(compositorLastGen, dirtyBuf);
    expect(compDirtyCount).toBe(1);
    expect(Array.from(dirtyBuf.subarray(0, compDirtyCount))).toEqual([1]);

    const gpuDirtyCount = workerView.collectDirtyIndicesSince(gpuLastGen, dirtyBuf);
    expect(gpuDirtyCount).toBe(2);
    expect(Array.from(dirtyBuf.subarray(0, gpuDirtyCount))).toEqual([0, 1]);
    gpuLastGen = workerView.committedGeneration;
    expect(workerView.collectDirtyIndicesSince(gpuLastGen, dirtyBuf)).toBe(0);
  });

  it("Atomics 락프리 Seqlock(홀수=쓰기 중 / 짝수=안정 스냅샷)으로 찢어진 읽기 없이 0-카피 스냅샷을 보장한다", () => {
    const arena = new Wasm64SharedArena({ capacityBytes: 32_768 });
    const writer = Wasm64SoaRenderStateTree.allocate(arena, 16);
    const reader = Wasm64SoaRenderStateTree.attach(arena.buffer, writer.baseByteOffset);

    writer.writeTransaction((tree) => {
      tree.upsertNode(0, { layerId: 500, opacity: 1.0, boundsX: 0, boundsY: 0, boundsW: 256, boundsH: 256 });
    }, true);

    // 1) 안정 짝수 스냅샷 — 재시도 0회, 락 경합 0건
    expect(reader.seqlockVersion).toBe(2);
    expect(reader.isWriteInProgress).toBe(false);
    const stableRead = reader.readConsistentSnapshot((tree) => ({
      opacity: tree.opacity[0],
      x: tree.boundsX[0],
      gen: tree.committedGeneration,
    }));
    expect(stableRead.consistent).toBe(true);
    expect(stableRead.retries).toBe(0);
    expect(stableRead.seqlockVersion % 2).toBe(0);
    expect(stableRead.value).toEqual({ opacity: 1, x: 0, gen: 1 });

    // 2) 쓰기 진행 중(홀수 버전)에는 불완전(torn) 스냅샷을 절대 노출하지 않는다
    const oddVer = writer.beginWrite();
    expect(oddVer % 2).toBe(1);
    expect(reader.isWriteInProgress).toBe(true);
    const blockedRead = reader.readConsistentSnapshot((tree) => tree.opacity[0], 4);
    expect(blockedRead.consistent).toBe(false);
    expect(blockedRead.value).toBeNull();
    writer.setNodeOpacity(0, 0.5);
    writer.setNodeBounds(0, 128, 256, 512, 512);
    const evenVer = writer.endWrite();
    expect(evenVer % 2).toBe(0);
    expect(reader.isWriteInProgress).toBe(false);

    // 3) 읽기 도중 동시 쓰기 트랜잭션이 개입하면 Seqlock 버전 불일치를 감지해 자동 재시도 후 일관 상태 반환
    let injectedConcurrentWrite = false;
    const retryRead = reader.readConsistentSnapshot((tree) => {
      const opacity = tree.opacity[0];
      if (!injectedConcurrentWrite) {
        injectedConcurrentWrite = true;
        // 리더가 opacity를 읽은 직후, boundsX를 읽기 전에 라이터가 원자적 트랜잭션 커밋
        writer.writeTransaction((w) => {
          w.setNodeOpacity(0, 0.25);
          w.setNodeBounds(0, 900, 450, 512, 512);
        }, true);
      }
      return { opacity, x: tree.boundsX[0], y: tree.boundsY[0], gen: tree.committedGeneration };
    }, 8);

    expect(retryRead.consistent).toBe(true);
    expect(retryRead.retries).toBe(1);
    expect(retryRead.seqlockVersion % 2).toBe(0);
    // 찢어진 조합(opacity=0.5, x=900)이 아니라 트랜잭션 완료 후 일관 스냅샷(0.25, 900, 450)만 반환!
    expect(retryRead.value).toEqual({ opacity: 0.25, x: 900, y: 450, gen: 2 });

    // 4) ArrayBuffer 폴백 환경에서도 Seqlock + commitGeneration 동일 동작
    const fbArena = new Wasm64SharedArena({ capacityBytes: 16_384, crossOriginIsolatedOverride: false });
    const fbTree = Wasm64SoaRenderStateTree.allocate(fbArena, 8);
    expect(fbTree.isShared).toBe(false);
    fbTree.writeTransaction((t) => t.upsertNode(0, { layerId: 9, opacity: 0.8 }), true);
    const fbRead = fbTree.readConsistentSnapshot((t) => ({ id: t.layerIds[0], gen: t.committedGeneration }));
    expect(fbRead.consistent).toBe(true);
    expect(fbRead.value).toEqual({ id: 9, gen: 1 });
  });
});

describe("Wasm64TileUndoHistory (256x256 RGBA8 Lossless XOR+PackBits)", () => {
  it("20연속 웹툰 브러시 스트로크에서 75% 초과 RAM 절감과 0-diff 무손실 Undo/Redo 왕복을 증명한다", () => {
    const STROKE_COUNT = 20;
    const tile = new Uint8Array(WASM64_TILE_BYTE_LENGTH);
    // 백지 웹툰 캔버스 초기화 (RGBA = 250, 248, 243, 255)
    for (let i = 0; i < WASM64_TILE_BYTE_LENGTH; i += 4) {
      tile[i] = 250; tile[i + 1] = 248; tile[i + 2] = 243; tile[i + 3] = 255;
    }

    const history = new Wasm64TileUndoHistory({ maxEntries: 64 });
    const goldenSnapshots: Uint8Array[] = [tile.slice()];

    for (let s = 1; s <= STROKE_COUNT; s += 1) {
      const before = tile.slice();
      paintWebtoonBrushStroke(tile, s);
      history.recordStrokeDelta("layer-ink:0:0", before, tile, s);
      goldenSnapshots.push(tile.slice());
    }

    const stats = history.getMemoryStats();
    expect(stats.undoDepth).toBe(STROKE_COUNT);
    expect(stats.totalRawBytes).toBe(STROKE_COUNT * WASM64_TILE_BYTE_LENGTH);
    expect(stats.ramSavingsPercent).toBeGreaterThan(75);
    expect(stats.compressionRatio).toBeGreaterThan(4);

    // 20회 연속 Undo: 매 단계 262,144바이트 전체 0-diff 검증
    for (let step = STROKE_COUNT - 1; step >= 0; step -= 1) {
      const undone = history.undo(tile);
      expect(undone).not.toBeNull();
      expect(countByteMismatches(tile, goldenSnapshots[step])).toBe(0);
    }
    expect(history.canUndo).toBe(false);
    expect(history.redoDepth).toBe(STROKE_COUNT);

    // 20회 연속 Redo: 매 단계 262,144바이트 전체 0-diff 검증
    for (let step = 1; step <= STROKE_COUNT; step += 1) {
      const redone = history.redo(tile);
      expect(redone).not.toBeNull();
      expect(countByteMismatches(tile, goldenSnapshots[step])).toBe(0);
    }
    expect(history.canRedo).toBe(false);
    expect(history.undoDepth).toBe(STROKE_COUNT);
  });

  it("무변경 타일 초고압축, 고엔트로피 raw-xor 상한 보호, 체크섬 변조 감지 및 예산 퇴출을 검증한다", () => {
    // 1) 무변경 타일
    const a = new Uint8Array(WASM64_TILE_BYTE_LENGTH).fill(255);
    const sameDelta = compressTileXorDelta(a, a);
    expect(sameDelta.mode).toBe("packbits-xor");
    expect(sameDelta.compressedByteLength).toBeLessThan(40);
    expect(sameDelta.ramSavingsPercent).toBeGreaterThan(99.98);
    expect(countByteMismatches(decompressTileXorDelta(sameDelta.payload), new Uint8Array(WASM64_TILE_BYTE_LENGTH))).toBe(0);

    // 2) 100% 고엔트로피 의사난수 타일 -> raw-xor 폴백으로 +16B 상한 보장 및 0-diff 복원
    const randBefore = new Uint8Array(4096);
    const randAfter = new Uint8Array(4096);
    let seed = 0x12345678;
    for (let i = 0; i < 4096; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      randBefore[i] = seed & 0xff;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      randAfter[i] = seed & 0xff;
    }
    const rawFallback = compressTileXorDelta(randBefore, randAfter);
    expect(rawFallback.mode).toBe("raw-xor");
    expect(rawFallback.compressedByteLength).toBe(4096 + WASM64_UNDO_HEADER_BYTES);
    const restored = randAfter.slice();
    applyTileXorDeltaInPlace(restored, rawFallback.payload);
    expect(countByteMismatches(restored, randBefore)).toBe(0);

    // 3) 체크섬 변조 감지
    const tampered = rawFallback.payload.slice();
    tampered[WASM64_UNDO_HEADER_BYTES + 10] ^= 0xff;
    expect(() => applyTileXorDeltaInPlace(randAfter.slice(), tampered)).toThrow(/checksum mismatch/);

    // 4) maxEntries 예산 퇴출 + undo 후 새 기록 시 redo 스택 정리
    const bounded = new Wasm64TileUndoHistory({ maxEntries: 3, expectedTileBytes: 256 });
    const t = new Uint8Array(256);
    for (let k = 1; k <= 5; k += 1) {
      const prev = t.slice();
      t[k * 4] = k * 31;
      bounded.recordStrokeDelta("t0", prev, t, k);
    }
    expect(bounded.undoDepth).toBe(3);
    expect(bounded.getMemoryStats().evictedEntryCount).toBe(2);
    bounded.undo(t);
    expect(bounded.redoDepth).toBe(1);
    const branchBefore = t.slice();
    t[200] = 99;
    bounded.recordStrokeDelta("t0", branchBefore, t, 99);
    expect(bounded.redoDepth).toBe(0);
  });
});
