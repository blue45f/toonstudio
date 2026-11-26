import { describe, expect, it } from "vitest";

import {
  StudioZeroCopyBufferPool,
  createStudioZeroCopyBufferPool,
  extractTransferableArrayBuffer,
  isSharedArrayBufferView,
} from "./studio-zero-copy-buffer-pool";

describe("StudioZeroCopyBufferPool", () => {
  it("reuses Float32Array and Uint8Array slabs across frames with zero new allocations", () => {
    const pool = createStudioZeroCopyBufferPool({
      sharedArrayBufferAvailable: false,
    });

    const first = pool.acquireFloat32(300);
    first[0] = 1.5;
    first[299] = -2.25;
    expect(first).toBeInstanceOf(Float32Array);
    expect(first.length).toBe(300);
    const backingBuffer = first.buffer;

    expect(pool.release(first)).toBe(true);

    const second = pool.acquireFloat32(300, { zeroFill: true });
    expect(second.buffer).toBe(backingBuffer);
    expect(second[0]).toBe(0);
    expect(second[299]).toBe(0);

    const u8First = pool.acquireUint8(512);
    const u8Backing = u8First.buffer;
    expect(pool.release(u8First)).toBe(true);
    const u8Second = pool.acquireUint8(512);
    expect(u8Second.buffer).toBe(u8Backing);

    const stats = pool.stats();
    expect(stats.acquires).toBe(4);
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(0.5);
    expect(stats.inUseBuffers).toBe(2);

    pool.release(second);
    pool.release(u8Second);
    expect(pool.stats().inUseBuffers).toBe(0);
    expect(pool.stats().pooledBuffers).toBe(2);
  });

  it("supports exact-length transferable buffers and SharedArrayBuffer slabs", () => {
    const pool = new StudioZeroCopyBufferPool({
      sharedArrayBufferAvailable: true,
    });

    const exact = pool.acquireFloat32(12, { exactLength: true });
    expect(exact.byteLength).toBe(48);
    expect(exact.buffer.byteLength).toBe(48);
    const transferable = extractTransferableArrayBuffer(exact);
    expect(transferable).toBe(exact.buffer);
    pool.release(exact);

    const sharedF32 = pool.acquire("shared-float32", 64);
    expect(isSharedArrayBufferView(sharedF32)).toBe(true);
    expect(extractTransferableArrayBuffer(sharedF32)).toBeNull();
    pool.release(sharedF32);

    const sharedU8 = pool.acquire("shared-uint8", 128);
    expect(isSharedArrayBufferView(sharedU8)).toBe(true);
    pool.release(sharedU8);

    const fallbackPool = createStudioZeroCopyBufferPool({
      sharedArrayBufferAvailable: false,
    });
    const fallback = fallbackPool.acquire("shared-float32", 64);
    expect(isSharedArrayBufferView(fallback)).toBe(false);
    expect(fallback).toBeInstanceOf(Float32Array);
    fallbackPool.release(fallback);
  });

  it("ignores duplicate releases and discards detached buffers safely", () => {
    const pool = createStudioZeroCopyBufferPool({
      sharedArrayBufferAvailable: false,
    });

    const view = pool.acquireFloat32(16, { exactLength: true });
    expect(pool.release(view)).toBe(true);
    expect(pool.release(view)).toBe(false);
    expect(pool.stats().duplicateReleasesIgnored).toBe(1);
    expect(pool.stats().pooledBuffers).toBe(1);

    // Unrelated buffer is ignored cleanly.
    expect(pool.release(new Float32Array(16))).toBe(false);

    // Transfer / detach buffer before release -> must not re-enter pool.
    const toDetach = pool.acquireUint8(64, { exactLength: true });
    const raw = extractTransferableArrayBuffer(toDetach)!;
    const transferred = structuredClone(raw, { transfer: [raw] });
    expect(transferred.byteLength).toBe(64);
    expect(toDetach.buffer.byteLength).toBe(0);

    expect(pool.release(toDetach)).toBe(false);
    expect(pool.stats().detachedDiscards).toBe(1);
    expect(pool.stats().inUseBuffers).toBe(0);
  });

  it("enforces maxPoolBytes LRU eviction, maxSingleBufferBytes, maxBuffersPerBucket, and maxActiveLeases", () => {
    const pool = createStudioZeroCopyBufferPool({
      maxPoolBytes: 4_096,
      maxSingleBufferBytes: 2_048,
      maxBuffersPerBucket: 2,
      maxActiveLeases: 3,
      zeroOnRelease: true,
      sharedArrayBufferAvailable: false,
    });

    // Oversized single buffer (> maxSingleBufferBytes) is evicted on release.
    const big = pool.acquireUint8(3_000, { exactLength: true });
    expect(pool.release(big)).toBe(false);
    expect(pool.stats().evictions).toBe(1);
    expect(pool.stats().pooledBytes).toBe(0);

    // Max active leases leak guard.
    const a = pool.acquireUint8(1_024, { exactLength: true });
    const b = pool.acquireUint8(1_024, { exactLength: true });
    const c = pool.acquireUint8(1_024, { exactLength: true });
    expect(() => pool.acquireUint8(1_024, { exactLength: true })).toThrow(RangeError);

    // maxBuffersPerBucket = 2 -> third identical-bucket release is evicted.
    a.fill(77);
    expect(pool.release(a)).toBe(true);
    expect(pool.release(b)).toBe(true);
    expect(pool.release(c)).toBe(false);
    expect(pool.stats().pooledBuffers).toBe(2);
    expect(pool.stats().pooledBytes).toBe(2_048);

    // zeroOnRelease wiped previous contents.
    const reused = pool.acquireUint8(1_024, { exactLength: true });
    expect(reused[0]).toBe(0);
    pool.release(reused);

    // LRU eviction when maxPoolBytes (4096) is exceeded by adding 2 x 2048 slabs.
    const d = pool.acquireUint8(2_048, { exactLength: true });
    const e = pool.acquireUint8(2_048, { exactLength: true });
    pool.release(d);
    pool.release(e);
    expect(pool.stats().pooledBytes).toBeLessThanOrEqual(4_096);

    pool.clear();
    expect(pool.stats().pooledBuffers).toBe(0);
    expect(pool.stats().pooledBytes).toBe(0);
  });

  it("releases automatically via withBuffer on sync/async success and error paths", async () => {
    const pool = createStudioZeroCopyBufferPool({ sharedArrayBufferAvailable: false });

    const sum = pool.withBuffer("float32", 4, (buf) => {
      buf.set([1, 2, 3, 4]);
      return buf[0]! + buf[3]!;
    });
    expect(sum).toBe(5);
    expect(pool.stats().inUseBuffers).toBe(0);

    expect(() =>
      pool.withBuffer("uint8", 8, () => {
        throw new Error("sync boom");
      }),
    ).toThrow("sync boom");
    expect(pool.stats().inUseBuffers).toBe(0);

    const asyncValue = await pool.withBuffer("float32", 8, async (buf) => {
      buf[0] = 42;
      return buf[0]!;
    });
    expect(asyncValue).toBe(42);
    expect(pool.stats().inUseBuffers).toBe(0);

    await expect(
      pool.withBuffer("uint8", 8, async () => {
        throw new Error("async boom");
      }),
    ).rejects.toThrow("async boom");
    expect(pool.stats().inUseBuffers).toBe(0);
  });
});
