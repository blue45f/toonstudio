import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createNativeRustCoreBridge,
  EXPECTED_RUST_CORE_ABI,
  EXPECTED_RUST_CORE_CAPABILITIES,
  EXPECTED_WAVE3_CAPABILITIES,
  jsApplyXorTileDelta,
  jsComputeXorTileDelta,
  jsFnv1aChecksum32,
  jsGaussianBlurRgba,
  jsWave3AudioMixMaster,
  jsWave3DedupTilesFnv64,
  jsWave3ExtractPalette,
  jsWave3RgbaToCmykTac,
  jsWave3VectorExpandStroke,
  jsWave3WebtoonSlice,
  NATIVE_CORE_REQUIRED_SYMBOLS,
  NATIVE_WAVE3_REQUIRED_SYMBOLS,
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
    expect(probe.wave3SymbolsVerified).toBe(true);
    expect(probe.foundWave3Symbols).toEqual([...NATIVE_WAVE3_REQUIRED_SYMBOLS]);
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

  it("executes Wave-3 Audio DSP, Vector Stroke, Webtoon Slicer/Dedup, and CMYK-TAC/Palette with 0-diff parity and tier fallback", async () => {
    const bridge = await createNativeRustCoreBridge({ repoRoot: REPO_ROOT });
    try {
      expect(bridge.wave3Backend).toBe("wasm-relaxed-simd");
      expect(bridge.getTelemetry().wave3CapabilitiesMask).toBe(EXPECTED_WAVE3_CAPABILITIES);
      expect(bridge.getTelemetry().wave3ResolvedPath).toContain("studio-wasm64-extended-suite.wasm");

      // 1) Audio DSP multi-track stereo mix + limiter + LUFS
      const frames = 512;
      const tracks = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i += 1) {
        tracks[i] = Math.sin((2 * Math.PI * 440 * i) / 48_000) * 0.7;
        tracks[frames + i] = Math.sin((2 * Math.PI * 880 * i) / 48_000) * 0.5;
      }
      const trackParams = [{ gain: 1.0, pan: -0.5 }, { gain: 0.9, pan: 0.5 }];
      const audioWasm = bridge.audioMixMasterStereo(tracks, 2, frames, trackParams);
      const audioJs = jsWave3AudioMixMaster(tracks, 2, frames, trackParams);
      expect(audioWasm.backend).toBe("wasm-relaxed-simd");
      expect(audioWasm.activeTracks).toBe(2);
      expect(Math.abs(audioWasm.integratedLufs - audioJs.integratedLufs)).toBeLessThan(0.02);
      expect(Math.abs(audioWasm.truePeakLinear - audioJs.truePeakLinear)).toBeLessThan(5e-4);

      // 2) Vector variable-width stroke outline expansion
      const spine = new Float32Array([0, 0, 2, 20, 0, 5, 20, 20, 3]);
      const vecWasm = bridge.vectorExpandStrokeOutline(spine, "miter", 4);
      const vecJs = jsWave3VectorExpandStroke(spine, "miter", 4);
      expect(vecWasm.backend).toBe("wasm-relaxed-simd");
      expect(vecWasm.vertexCount).toBe(vecJs.vertexCount);
      for (let i = 0; i < vecWasm.polygonXy.length; i += 1) {
        expect(Math.abs((vecWasm.polygonXy[i] ?? 0) - (vecJs.polygonXy[i] ?? 0))).toBeLessThan(1e-4);
      }

      // 3) Webtoon smart slicer + 64-bit FNV-1a tile dedup
      const w = 64;
      const h = 320;
      const strip = new Uint8Array(w * h * 4).fill(255);
      for (let y = 130; y <= 190; y += 1) {
        for (let x = 10; x <= 54; x += 1) {
          if (y <= 132 || y >= 188 || x <= 12 || x >= 52) {
            const off = (y * w + x) * 4;
            strip[off] = 16; strip[off + 1] = 16; strip[off + 2] = 20;
          }
        }
      }
      const sliceCfg = { targetHeight: 160, minHeight: 96, maxHeight: 240, searchWindow: 64 };
      const slWasm = bridge.webtoonPlanSmartSlices(strip, w, h, sliceCfg);
      const slJs = jsWave3WebtoonSlice(strip, w, h, sliceCfg);
      expect(slWasm.backend).toBe("wasm-relaxed-simd");
      expect(slWasm.spans.map((s) => [s.startY, s.endY])).toEqual(slJs.map((s) => [s.startY, s.endY]));

      const ddWasm = bridge.webtoonDedupTilesFnv64(strip, w, h, 32);
      const ddJs = jsWave3DedupTilesFnv64(strip, w, h, 32);
      expect(ddWasm.backend).toBe("wasm-relaxed-simd");
      expect(ddWasm.uniqueTiles).toBe(ddJs.uniqueTiles);
      expect(ddWasm.hashes64).toEqual(ddJs.hashes64);
      expect(ddWasm.canonicalIndices).toEqual(ddJs.canonicalIndices);

      // 4) Print CMYK TAC-250% + Median-Cut palette 0-diff parity
      const tile = makeDeterministicTile(32, 32, 0xfeedface);
      const cmykWasm = bridge.colorRgbaToCmykTac(tile, { gcrStrength: 0.4, tacLimitPct: 250 });
      const cmykJs = jsWave3RgbaToCmykTac(tile, { gcrStrength: 0.4, tacLimitPct: 250 });
      expect(cmykWasm.backend).toBe("wasm-relaxed-simd");
      expect(cmykWasm.maxTacPct).toBeLessThanOrEqual(250.01);
      expect(Buffer.compare(cmykWasm.cmyk, cmykJs.cmyk)).toBe(0);

      const palWasm = bridge.colorExtractPaletteMedianCut(tile, 16, 128);
      const palJs = jsWave3ExtractPalette(tile, 16, 128);
      expect(palWasm.backend).toBe("wasm-relaxed-simd");
      expect(palWasm.swatches).toEqual(palJs);

      expect(bridge.getTelemetry().ops).toMatchObject({
        wave3AudioMix: 1,
        wave3VectorStroke: 1,
        wave3WebtoonSlice: 1,
        wave3TileDedup: 1,
        wave3CmykTac: 1,
        wave3Palette: 1,
      });
    } finally {
      bridge.dispose();
    }
    expect(bridge.getTelemetry().wave3Backend).toBe("js-fallback");

    // Priority #1 native-dylib Wave-3 hooks + forced js-fallback tier verification
    const nativeBridge = await createNativeRustCoreBridge({
      repoRoot: REPO_ROOT,
      nativeRunner: {
        fnv1aChecksum: jsFnv1aChecksum32,
        xorTileDelta: jsComputeXorTileDelta,
        gaussianBlurRgba: jsGaussianBlurRgba,
        audioMixMasterStereo: jsWave3AudioMixMaster,
        vectorExpandStrokeOutline: jsWave3VectorExpandStroke,
        webtoonPlanSmartSlices: jsWave3WebtoonSlice,
        webtoonDedupTilesFnv64: jsWave3DedupTilesFnv64,
        colorRgbaToCmykTac: jsWave3RgbaToCmykTac,
        colorExtractPaletteMedianCut: jsWave3ExtractPalette,
      },
    });
    expect(nativeBridge.wave3Backend).toBe("native-dylib");
    expect(nativeBridge.colorRgbaToCmykTac(new Uint8Array([0, 0, 0, 255])).backend).toBe("native-dylib");
    nativeBridge.dispose();

    const jsBridge = await createNativeRustCoreBridge({ repoRoot: REPO_ROOT, preferredBackend: "js-fallback" });
    expect(jsBridge.wave3Backend).toBe("js-fallback");
    expect(jsBridge.colorRgbaToCmykTac(new Uint8Array([0, 0, 0, 255])).backend).toBe("js-fallback");
    jsBridge.dispose();
  });
});
