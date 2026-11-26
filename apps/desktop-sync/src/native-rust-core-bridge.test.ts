import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createNativeRustCoreBridge,
  EXPECTED_RUST_CORE_ABI,
  EXPECTED_RUST_CORE_CAPABILITIES,
  jsApplyXorTileDelta,
  jsComputeXorTileDelta,
  jsFnv1aChecksum32,
  jsGaussianBlurRgba,
  NATIVE_CORE_REQUIRED_SYMBOLS,
  probeNativeRustDylib,
} from "./native-rust-core-bridge.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WASM_DIR = join(REPO_ROOT, "apps/web/public/wasm");
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "toonstudio-rust-bridge-"));
  tempDirs.push(dir);
  return dir;
}

function makeDeterministicTile(width: number, height: number, seed = 0x12345678): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  let state = seed >>> 0;
  for (let i = 0; i < bytes.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[i] = state & 255;
    bytes[i + 1] = (state >>> 8) & 255;
    bytes[i + 2] = (state >>> 16) & 255;
    bytes[i + 3] = 200 + ((state >>> 24) % 56);
  }
  return bytes;
}

function makeMutatedTile(prev: Uint8Array): Uint8Array {
  const next = new Uint8Array(prev);
  for (let i = 0; i < next.length; i += 8) {
    next[i] = ((next[i] ?? 0) ^ 0x5a) & 255;
  }
  return next;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("desktop-sync native Rust core / WASM64 bridge", () => {
  it("discovers compiled native libstudio_wasm64_drawing_core.dylib with all C-ABI symbols", async () => {
    const probe = await probeNativeRustDylib({ repoRoot: REPO_ROOT });
    expect(probe.available).toBe(true);
    expect(probe.path).toContain("crates/studio-wasm64-drawing-core/target/release/libstudio_wasm64_drawing_core.");
    expect(probe.byteLength).toBeGreaterThan(64 * 1024);
    expect(probe.symbolsVerified).toBe(true);
    expect(probe.missingSymbols).toEqual([]);
    expect(probe.foundSymbols).toEqual([...NATIVE_CORE_REQUIRED_SYMBOLS]);
    if (process.platform === "darwin") {
      expect(probe.format).toBe("mach-o");
    }
  });

  it("instantiates real studio-wasm64-drawing-core-relaxed-simd.wasm in V8 with 0-diff parity against JS fallback", async () => {
    const bridge = await createNativeRustCoreBridge({ repoRoot: REPO_ROOT });
    try {
      expect(bridge.backend).toBe("wasm-relaxed-simd");
      const initTelemetry = bridge.getTelemetry();
      expect(initTelemetry.resolvedPath).toContain("studio-wasm64-drawing-core-relaxed-simd.wasm");
      expect(initTelemetry.abiVersion).toBe(EXPECTED_RUST_CORE_ABI);
      expect(initTelemetry.capabilitiesMask).toBe(EXPECTED_RUST_CORE_CAPABILITIES);
      expect(initTelemetry.nativeLibrary.available).toBe(true);
      expect(initTelemetry.nativeLibrary.symbolsVerified).toBe(true);
      expect(initTelemetry.discoveryTrail[0]).toMatchObject({
        tier: "native-dylib",
        status: "probed-no-runner",
      });

      // 1) FNV-1a 32-bit standard vectors + batch 0-diff parity
      const encoder = new TextEncoder();
      const empty = new Uint8Array(0);
      const foobar = encoder.encode("foobar");
      const tilePrev = makeDeterministicTile(256, 256, 0x12345678);
      const tileNext = makeMutatedTile(tilePrev);

      expect(bridge.fnv1aChecksum(empty)).toBe(0x811c9dc5);
      expect(bridge.fnv1aChecksum(foobar)).toBe(0xbf9cf968);
      expect(bridge.fnv1aChecksum(tilePrev)).toBe(jsFnv1aChecksum32(tilePrev));
      expect(bridge.fnv1aChecksumBatch([empty, foobar, tilePrev, tileNext])).toEqual([
        jsFnv1aChecksum32(empty),
        jsFnv1aChecksum32(foobar),
        jsFnv1aChecksum32(tilePrev),
        jsFnv1aChecksum32(tileNext),
      ]);

      // 2) XOR tile delta compute + lossless apply 0-diff parity
      const wasmDelta = bridge.computeXorTileDelta(tilePrev, tileNext);
      const jsDelta = jsComputeXorTileDelta(tilePrev, tileNext);
      expect(wasmDelta.backend).toBe("wasm-relaxed-simd");
      expect(wasmDelta.changedBytes).toBe(jsDelta.changedBytes);
      expect(wasmDelta.changedBytes).toBe(tilePrev.length / 8);
      expect(Buffer.compare(wasmDelta.delta, jsDelta.delta)).toBe(0);

      const applied = bridge.applyXorTileDelta(tilePrev, wasmDelta.delta);
      const jsApplied = jsApplyXorTileDelta(tilePrev, jsDelta.delta);
      expect(applied.changedBytes).toBe(jsApplied.changedBytes);
      expect(Buffer.compare(applied.restored, tileNext)).toBe(0);
      expect(Buffer.compare(applied.restored, jsApplied.restored)).toBe(0);

      const reverted = bridge.applyXorTileDelta(applied.restored, wasmDelta.delta);
      expect(Buffer.compare(reverted.restored, tilePrev)).toBe(0);

      // 3) 256x256 Gaussian blur + zero-copy thumbnail hash 0-diff parity
      const wasmBlur = bridge.gaussianBlurRgba(tilePrev, 256, 256, 1.5);
      const jsBlur = jsGaussianBlurRgba(tilePrev, 256, 256, 1.5);
      expect(wasmBlur.backend).toBe("wasm-relaxed-simd");
      expect(wasmBlur.processedPixels).toBe(256 * 256);
      expect(wasmBlur.processedPixels).toBe(jsBlur.processedPixels);
      expect(Buffer.compare(wasmBlur.output, jsBlur.output)).toBe(0);

      const thumb = bridge.computeTileThumbnailHash(tilePrev, 256, 256, 1.5);
      expect(thumb.processedPixels).toBe(256 * 256);
      expect(thumb.checksum).toBe(jsFnv1aChecksum32(jsBlur.output));
      expect(Buffer.compare(thumb.blurredRgba, jsBlur.output)).toBe(0);

      // 4) Zero-copy linear memory buffer pool reuse telemetry
      const telemetry = bridge.getTelemetry();
      expect(telemetry.poolMisses).toBeGreaterThan(0);
      expect(telemetry.poolHits).toBeGreaterThan(0);
      expect(telemetry.pooledBytes).toBe(256 * 256 * 4 * 3);
      expect(telemetry.peakPooledBytes).toBe(256 * 256 * 4 * 3);
      expect(telemetry.linearMemoryBytes).toBeGreaterThan(telemetry.pooledBytes);
      expect(telemetry.ops).toMatchObject({
        fnv1a: 7,
        xorDelta: 1,
        applyDelta: 2,
        gaussianBlur: 1,
        thumbnailHash: 1,
      });
    } finally {
      bridge.dispose();
    }

    expect(bridge.getTelemetry().pooledBytes).toBe(0);
    expect(bridge.getTelemetry().linearMemoryBytes).toBe(0);
    expect(bridge.getTelemetry().activeBackend).toBe("js-fallback");
  });

  it("maintains 0-diff parity across wasm-simd128, wasm-scalar, and extended-suite fallbacks", async () => {
    const tile = makeDeterministicTile(64, 64, 0xabcdef01);
    const jsBlur = jsGaussianBlurRgba(tile, 64, 64, 1.5);
    const expectedHash = jsFnv1aChecksum32(jsBlur.output);

    const simdBridge = await createNativeRustCoreBridge({ repoRoot: REPO_ROOT, preferredBackend: "wasm-simd128" });
    const scalarBridge = await createNativeRustCoreBridge({ repoRoot: REPO_ROOT, preferredBackend: "wasm-scalar" });
    const extDir = await makeTempDir();
    await copyFile(
      join(WASM_DIR, "studio-wasm64-extended-suite.wasm"),
      join(extDir, "studio-wasm64-extended-suite.wasm"),
    );
    const extBridge = await createNativeRustCoreBridge({
      repoRoot: REPO_ROOT,
      wasmDir: extDir,
      preferredBackend: "wasm-relaxed-simd",
    });

    try {
      expect(simdBridge.backend).toBe("wasm-simd128");
      expect(scalarBridge.backend).toBe("wasm-scalar");
      expect(extBridge.backend).toBe("wasm-relaxed-simd");
      expect(extBridge.getTelemetry().resolvedPath).toContain("studio-wasm64-extended-suite.wasm");

      for (const b of [simdBridge, scalarBridge, extBridge]) {
        const res = b.computeTileThumbnailHash(tile, 64, 64, 1.5);
        expect(res.checksum).toBe(expectedHash);
        expect(Buffer.compare(res.blurredRgba, jsBlur.output)).toBe(0);
      }
    } finally {
      simdBridge.dispose();
      scalarBridge.dispose();
      extBridge.dispose();
    }
  });

  it("selects priority #1 native-dylib when nativeRunner hook is attached", async () => {
    const disposeSpy = vi.fn();
    const bridge = await createNativeRustCoreBridge({
      repoRoot: REPO_ROOT,
      nativeRunner: {
        fnv1aChecksum: jsFnv1aChecksum32,
        xorTileDelta: jsComputeXorTileDelta,
        gaussianBlurRgba: jsGaussianBlurRgba,
        dispose: disposeSpy,
      },
    });
    expect(bridge.backend).toBe("native-dylib");
    expect(bridge.getTelemetry().nativeLibrary.runnerAttached).toBe(true);
    expect(bridge.getTelemetry().discoveryTrail).toHaveLength(1);
    expect(bridge.getTelemetry().discoveryTrail[0]?.status).toBe("selected");

    const tile = makeDeterministicTile(32, 32, 42);
    const res = bridge.computeTileThumbnailHash(tile, 32, 32, 1.2);
    expect(res.backend).toBe("native-dylib");
    expect(res.checksum).toBe(jsFnv1aChecksum32(jsGaussianBlurRgba(tile, 32, 32, 1.2).output));

    bridge.dispose();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back cleanly to js-fallback when dylib and wasm paths are missing or invalid", async () => {
    const emptyDir = await makeTempDir();
    await writeFile(join(emptyDir, "studio-wasm64-drawing-core.wasm"), "not-a-wasm");

    const bridge = await createNativeRustCoreBridge({
      nativeLibraryPath: join(emptyDir, "missing.dylib"),
      wasmDir: emptyDir,
    });
    expect(bridge.backend).toBe("js-fallback");
    const telemetry = bridge.getTelemetry();
    expect(telemetry.nativeLibrary.available).toBe(false);
    expect(telemetry.fallbackReason).toBeTruthy();
    expect(telemetry.discoveryTrail.at(-1)).toMatchObject({ tier: "js-fallback", status: "selected" });

    const prev = makeDeterministicTile(16, 16, 7);
    const next = makeMutatedTile(prev);
    const delta = bridge.computeXorTileDelta(prev, next);
    const restored = bridge.applyXorTileDelta(prev, delta.delta);
    expect(delta.backend).toBe("js-fallback");
    expect(Buffer.compare(restored.restored, next)).toBe(0);
    expect(bridge.fnv1aChecksum(prev)).toBe(jsFnv1aChecksum32(prev));
    expect(() => bridge.computeXorTileDelta(new Uint8Array(4), new Uint8Array(8))).toThrow(RangeError);
    expect(() => bridge.gaussianBlurRgba(new Uint8Array(16), 4, 4, -1)).toThrow(RangeError);
    bridge.dispose();
  });
});
