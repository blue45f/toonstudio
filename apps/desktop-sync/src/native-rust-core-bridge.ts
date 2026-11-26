import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_WAVE3_CAPABILITIES,
  isRawWasmWave3Exports,
  jsWave3AudioMixMaster,
  jsWave3DedupTilesFnv64,
  jsWave3ExtractPalette,
  jsWave3RgbaToCmykTac,
  jsWave3VectorExpandStroke,
  jsWave3WebtoonSlice,
  NATIVE_WAVE3_REQUIRED_SYMBOLS,
  runWasmWave3Scope,
  type DesktopAudioDynamicsOptions,
  type DesktopAudioMixResult,
  type DesktopAudioMixTrack,
  type DesktopCmykTacOptions,
  type DesktopCmykTacResult,
  type DesktopPaletteResult,
  type DesktopPaletteSwatch,
  type DesktopTileDedupResult,
  type DesktopVectorStrokeResult,
  type DesktopWebtoonSliceConfig,
  type DesktopWebtoonSliceResult,
  type DesktopWebtoonSliceSpan,
  type RawWasmWave3Exports,
} from "./native-rust-wave3-bridge.js";

export * from "./native-rust-wave3-bridge.js";

export type RustCoreBackendTier = "native-dylib" | "wasm-relaxed-simd" | "wasm-simd128" | "wasm-scalar" | "js-fallback";
export type NativeBinaryFormat = "mach-o" | "elf" | "pe" | "unknown";

export const EXPECTED_RUST_CORE_ABI = 1;
export const EXPECTED_RUST_CORE_CAPABILITIES = 0x7f;
export const NATIVE_CORE_REQUIRED_SYMBOLS = [
  "wasm_drawing_core_abi_version", "wasm_hotpath_capabilities", "wasm_alloc", "wasm_free",
  "wasm_fnv1a_checksum", "wasm_xor_tile_delta_bytes", "wasm_gaussian_blur_rgba",
] as const;

export interface NativeDylibProbe {
  readonly available: boolean; readonly path: string | null; readonly format: NativeBinaryFormat | null;
  readonly byteLength: number; readonly symbolsVerified: boolean;
  readonly foundSymbols: readonly string[]; readonly missingSymbols: readonly string[];
  readonly wave3SymbolsVerified: boolean; readonly foundWave3Symbols: readonly string[];
  readonly runnerAttached: boolean;
}

export interface NativeRustRunnerHook {
  readonly fnv1aChecksum: (bytes: Uint8Array) => number;
  readonly xorTileDelta: (prev: Uint8Array, next: Uint8Array) => { readonly delta: Uint8Array; readonly changedBytes: number };
  readonly gaussianBlurRgba: (rgba: Uint8Array, width: number, height: number, sigma: number) => { readonly output: Uint8Array; readonly processedPixels: number };
  readonly audioMixMasterStereo?: (tracks: Float32Array, trackCount: number, frames: number, params: readonly DesktopAudioMixTrack[], dyn?: DesktopAudioDynamicsOptions) => Omit<DesktopAudioMixResult, "backend" | "elapsedMs">;
  readonly vectorExpandStrokeOutline?: (spineXyw: Float32Array, join?: "bevel" | "miter", miterLimit?: number) => Omit<DesktopVectorStrokeResult, "backend" | "elapsedMs">;
  readonly webtoonPlanSmartSlices?: (rgba: Uint8Array, width: number, height: number, cfg?: DesktopWebtoonSliceConfig) => readonly DesktopWebtoonSliceSpan[];
  readonly webtoonDedupTilesFnv64?: (rgba: Uint8Array, width: number, height: number, tileSize: number) => Omit<DesktopTileDedupResult, "backend" | "elapsedMs">;
  readonly colorRgbaToCmykTac?: (rgba: Uint8Array, options?: DesktopCmykTacOptions) => Omit<DesktopCmykTacResult, "backend" | "elapsedMs">;
  readonly colorExtractPaletteMedianCut?: (rgba: Uint8Array, maxColors?: number, alphaThreshold?: number) => readonly DesktopPaletteSwatch[];
  readonly dispose?: () => void;
}

export interface RustCoreDiscoveryAttempt {
  readonly tier: RustCoreBackendTier; readonly candidatePath: string | null;
  readonly status: "selected" | "probed-no-runner" | "skipped" | "failed"; readonly reason: string | null;
}

export interface RustCoreBridgeTelemetry {
  readonly activeBackend: RustCoreBackendTier; readonly resolvedPath: string | null;
  readonly wave3Backend: RustCoreBackendTier; readonly wave3ResolvedPath: string | null;
  readonly abiVersion: number; readonly capabilitiesMask: number; readonly wave3CapabilitiesMask: number;
  readonly fallbackReason: string | null;
  readonly nativeLibrary: NativeDylibProbe; readonly discoveryTrail: readonly RustCoreDiscoveryAttempt[];
  readonly poolHits: number; readonly poolMisses: number; readonly pooledBytes: number;
  readonly peakPooledBytes: number; readonly linearMemoryBytes: number;
  readonly ops: {
    readonly fnv1a: number; readonly xorDelta: number; readonly applyDelta: number;
    readonly gaussianBlur: number; readonly thumbnailHash: number;
    readonly wave3AudioMix: number; readonly wave3VectorStroke: number;
    readonly wave3WebtoonSlice: number; readonly wave3TileDedup: number;
    readonly wave3CmykTac: number; readonly wave3Palette: number;
  };
  readonly totalElapsedMs: number;
}

export interface XorTileDeltaResult { readonly delta: Uint8Array; readonly changedBytes: number; readonly backend: RustCoreBackendTier; readonly elapsedMs: number }
export interface ApplyXorTileDeltaResult { readonly restored: Uint8Array; readonly changedBytes: number; readonly backend: RustCoreBackendTier; readonly elapsedMs: number }
export interface GaussianBlurTileResult { readonly output: Uint8Array; readonly processedPixels: number; readonly backend: RustCoreBackendTier; readonly elapsedMs: number }
export interface TileThumbnailHashResult { readonly blurredRgba: Uint8Array; readonly checksum: number; readonly processedPixels: number; readonly backend: RustCoreBackendTier; readonly elapsedMs: number }

export interface CreateNativeRustCoreBridgeOptions {
  readonly repoRoot?: string; readonly nativeLibraryPath?: string; readonly wasmDir?: string;
  readonly nativeRunner?: NativeRustRunnerHook; readonly preferredBackend?: RustCoreBackendTier;
  readonly allowExtendedSuiteWasm?: boolean; readonly validateWasm?: (bytes: Uint8Array) => boolean;
}

export interface NativeRustCoreBridge {
  readonly backend: RustCoreBackendTier;
  readonly wave3Backend: RustCoreBackendTier;
  readonly fnv1aChecksum: (bytes: Uint8Array) => number;
  readonly fnv1aChecksumBatch: (chunks: readonly Uint8Array[]) => readonly number[];
  readonly computeXorTileDelta: (prev: Uint8Array, next: Uint8Array) => XorTileDeltaResult;
  readonly applyXorTileDelta: (base: Uint8Array, delta: Uint8Array) => ApplyXorTileDeltaResult;
  readonly gaussianBlurRgba: (rgba: Uint8Array, width: number, height: number, sigma?: number) => GaussianBlurTileResult;
  readonly computeTileThumbnailHash: (rgba: Uint8Array, width?: number, height?: number, sigma?: number) => TileThumbnailHashResult;
  readonly audioMixMasterStereo: (tracks: Float32Array, trackCount: number, frames: number, params: readonly DesktopAudioMixTrack[], dyn?: DesktopAudioDynamicsOptions) => DesktopAudioMixResult;
  readonly vectorExpandStrokeOutline: (spineXyw: Float32Array, join?: "bevel" | "miter", miterLimit?: number) => DesktopVectorStrokeResult;
  readonly webtoonPlanSmartSlices: (rgba: Uint8Array, width: number, height: number, cfg?: DesktopWebtoonSliceConfig) => DesktopWebtoonSliceResult;
  readonly webtoonDedupTilesFnv64: (rgba: Uint8Array, width: number, height: number, tileSize: number) => DesktopTileDedupResult;
  readonly colorRgbaToCmykTac: (rgba: Uint8Array, options?: DesktopCmykTacOptions) => DesktopCmykTacResult;
  readonly colorExtractPaletteMedianCut: (rgba: Uint8Array, maxColors?: number, alphaThreshold?: number) => DesktopPaletteResult;
  readonly getTelemetry: () => RustCoreBridgeTelemetry;
  readonly dispose: () => void;
}

interface WasmGlobalApi {
  readonly Memory: new (...args: never[]) => { readonly buffer: ArrayBuffer };
  readonly validate: (bytes: Uint8Array) => boolean;
  readonly instantiate: (bytes: Uint8Array, imports?: Record<string, unknown>) => Promise<{ readonly instance: { readonly exports: Record<string, unknown> } }>;
}
interface RawWasmCoreExports {
  readonly memory: { readonly buffer: ArrayBuffer };
  readonly wasm_drawing_core_abi_version: () => number; readonly wasm_hotpath_capabilities: () => number;
  readonly wasm_alloc: (byteLen: number) => number; readonly wasm_free: (ptr: number, byteLen: number) => void;
  readonly wasm_fnv1a_checksum: (ptr: number, byteLen: number) => number;
  readonly wasm_xor_tile_delta_bytes: (p: number, n: number, o: number, len: number) => number;
  readonly wasm_gaussian_blur_rgba: (srcPtr: number, maskPtr: number, dstPtr: number, width: number, height: number, sigma: number) => number;
}

const f = Math.fround;
const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TIER_ORDER: readonly RustCoreBackendTier[] = ["native-dylib", "wasm-relaxed-simd", "wasm-simd128", "wasm-scalar", "js-fallback"];
const WASM_SIMD128_PROBE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0b]);
const WASM_RELAXED_PROBE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x01, 0x60, 0x03, 0x7b, 0x7b, 0x7b, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0d, 0x01, 0x0b, 0x00, 0x20, 0x00, 0x20, 0x01, 0x20, 0x02, 0xfd, 0x85, 0x02, 0x0b]);

export function jsFnv1aChecksum32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5 | 0;
  for (let i = 0; i < bytes.length; i += 1) hash = Math.imul(hash ^ (bytes[i] ?? 0), 16777619);
  return hash >>> 0;
}

function jsXorPass(a: Uint8Array, b: Uint8Array, countRight: boolean): { readonly bytes: Uint8Array; readonly changedBytes: number } {
  if (a.length !== b.length) throw new RangeError(`XOR tile length mismatch: a=${a.length}, b=${b.length}`);
  const bytes = new Uint8Array(a.length);
  let changedBytes = 0;
  for (let i = 0; i < a.length; i += 1) {
    const rhs = b[i] ?? 0;
    const diff = (a[i] ?? 0) ^ rhs;
    bytes[i] = diff;
    if ((countRight ? rhs : diff) !== 0) changedBytes += 1;
  }
  return { bytes, changedBytes };
}

export function jsComputeXorTileDelta(prev: Uint8Array, next: Uint8Array): { readonly delta: Uint8Array; readonly changedBytes: number } {
  const { bytes, changedBytes } = jsXorPass(prev, next, false); return { delta: bytes, changedBytes };
}
export function jsApplyXorTileDelta(base: Uint8Array, delta: Uint8Array): { readonly restored: Uint8Array; readonly changedBytes: number } {
  const { bytes, changedBytes } = jsXorPass(base, delta, true); return { restored: bytes, changedBytes };
}

export function jsGaussianBlurRgba(rgba: Uint8Array, width: number, height: number, sigma: number): { readonly output: Uint8Array; readonly processedPixels: number } {
  const pixelCount = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== pixelCount * 4) {
    throw new RangeError(`Invalid RGBA blur dimensions: ${width}x${height} (${rgba.length}B)`);
  }
  if (!Number.isFinite(sigma) || sigma < 0) throw new RangeError("sigma must be finite and >= 0");
  if (sigma < 1e-4) return { output: new Uint8Array(rgba), processedPixels: pixelCount };
  const sigmaF = f(sigma); const radius = Math.max(1, Math.min(64, Math.ceil(f(sigmaF * 3)))); const kLen = radius * 2 + 1;
  const kernel = new Float32Array(kLen); const inv2 = f(1 / f(f(2 * sigmaF) * sigmaF));
  let kSum = f(0);
  for (let i = 0; i < kLen; i += 1) { const d = f(i - radius); const w = f(Math.exp(f(f(f(-d) * d) * inv2))); kernel[i] = w; kSum = f(kSum + w); }
  if (kSum > 0) for (let i = 0; i < kLen; i += 1) kernel[i] = f((kernel[i] ?? 0) / kSum);
  const rowStride = width * 4; const premul = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const aF = f(rgba[i + 3] ?? 0); const a = f(aF / 255);
    premul[i] = f((rgba[i] ?? 0) * a); premul[i + 1] = f((rgba[i + 1] ?? 0) * a); premul[i + 2] = f((rgba[i + 2] ?? 0) * a); premul[i + 3] = aF;
  }
  const horiz = new Float32Array(rgba.length);
  for (let y = 0; y < height; y += 1) {
    const rowBase = y * rowStride;
    for (let x = 0; x < width; x += 1) {
      let r = f(0); let g = f(0); let b = f(0); let a = f(0);
      for (let k = 0; k < kLen; k += 1) {
        const kw = kernel[k] ?? 0; const s = rowBase + Math.max(0, Math.min(width - 1, x + k - radius)) * 4;
        r = f(r + f((premul[s] ?? 0) * kw)); g = f(g + f((premul[s + 1] ?? 0) * kw)); b = f(b + f((premul[s + 2] ?? 0) * kw)); a = f(a + f((premul[s + 3] ?? 0) * kw));
      }
      const d = rowBase + x * 4; horiz[d] = r; horiz[d + 1] = g; horiz[d + 2] = b; horiz[d + 3] = a;
    }
  }
  const output = new Uint8Array(rgba.length); const rowAcc = new Float32Array(rowStride);
  const toByte = (v: number): number => Math.round(v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < height; y += 1) {
    rowAcc.fill(0);
    for (let k = 0; k < kLen; k += 1) {
      const kw = kernel[k] ?? 0; const srcOff = Math.max(0, Math.min(height - 1, y + k - radius)) * rowStride;
      for (let i = 0; i < rowStride; i += 1) rowAcc[i] = f((rowAcc[i] ?? 0) + f((horiz[srcOff + i] ?? 0) * kw));
    }
    const rowBase = y * rowStride;
    for (let x = 0; x < width; x += 1) {
      const aOff = x * 4; const oOff = rowBase + aOff; const pa = rowAcc[aOff + 3] ?? 0;
      const alphaNorm = Math.min(1, Math.max(0, f(pa / 255)));
      if (alphaNorm > f(1e-4)) {
        output[oOff] = toByte(f((rowAcc[aOff] ?? 0) / alphaNorm));
        output[oOff + 1] = toByte(f((rowAcc[aOff + 1] ?? 0) / alphaNorm));
        output[oOff + 2] = toByte(f((rowAcc[aOff + 2] ?? 0) / alphaNorm));
      }
      output[oOff + 3] = toByte(pa);
    }
  }
  return { output, processedPixels: pixelCount };
}

function detectBinaryFormat(buf: Buffer): NativeBinaryFormat {
  if (buf.length < 4) return "unknown";
  const magic = buf.readUInt32LE(0);
  if (magic === 0xfeedfacf || magic === 0xcffaedfe || magic === 0xcafebabe || magic === 0xbebafeca) return "mach-o";
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return "elf";
  return buf[0] === 0x4d && buf[1] === 0x5a ? "pe" : "unknown";
}

export async function probeNativeRustDylib(options: { readonly repoRoot?: string; readonly nativeLibraryPath?: string; readonly runnerAttached?: boolean } = {}): Promise<NativeDylibProbe> {
  const relDir = join(options.repoRoot ?? DEFAULT_REPO_ROOT, "crates/studio-wasm64-drawing-core/target/release");
  const defaults = process.platform === "darwin"
    ? ["libstudio_wasm64_drawing_core.dylib", "libstudio_wasm64_drawing_core.so", "studio_wasm64_drawing_core.dll"]
    : process.platform === "win32"
      ? ["studio_wasm64_drawing_core.dll", "libstudio_wasm64_drawing_core.dylib", "libstudio_wasm64_drawing_core.so"]
      : ["libstudio_wasm64_drawing_core.so", "libstudio_wasm64_drawing_core.dylib", "studio_wasm64_drawing_core.dll"];
  for (const candidate of options.nativeLibraryPath ? [options.nativeLibraryPath] : defaults.map((n) => join(relDir, n))) {
    try {
      const info = await stat(candidate);
      if (!info.isFile()) continue;
      const raw = await readFile(candidate);
      const format = detectBinaryFormat(raw);
      const foundSymbols = NATIVE_CORE_REQUIRED_SYMBOLS.filter((sym) => raw.includes(Buffer.from(sym, "ascii")));
      const missingSymbols = NATIVE_CORE_REQUIRED_SYMBOLS.filter((sym) => !foundSymbols.includes(sym));
      const foundWave3Symbols = NATIVE_WAVE3_REQUIRED_SYMBOLS.filter((sym) => raw.includes(Buffer.from(sym, "ascii")));
      const wave3SymbolsVerified = format !== "unknown" && foundWave3Symbols.length === NATIVE_WAVE3_REQUIRED_SYMBOLS.length;
      return { available: true, path: candidate, format, byteLength: info.size, symbolsVerified: format !== "unknown" && missingSymbols.length === 0, foundSymbols, missingSymbols, wave3SymbolsVerified, foundWave3Symbols, runnerAttached: Boolean(options.runnerAttached) };
    } catch { continue; }
  }
  return { available: false, path: null, format: null, byteLength: 0, symbolsVerified: false, foundSymbols: [], missingSymbols: [...NATIVE_CORE_REQUIRED_SYMBOLS], wave3SymbolsVerified: false, foundWave3Symbols: [], runnerAttached: Boolean(options.runnerAttached) };
}

function isRawWasmCoreExports(exp: Record<string, unknown>, wasm: WasmGlobalApi): exp is Record<string, unknown> & RawWasmCoreExports {
  return exp.memory instanceof wasm.Memory && NATIVE_CORE_REQUIRED_SYMBOLS.every((sym) => typeof exp[sym] === "function");
}

export async function createNativeRustCoreBridge(options: CreateNativeRustCoreBridgeOptions = {}): Promise<NativeRustCoreBridge> {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const wasmDir = options.wasmDir ?? join(repoRoot, "apps/web/public/wasm");
  const wasmApi = (globalThis as { readonly WebAssembly?: WasmGlobalApi }).WebAssembly;
  const validate = options.validateWasm ?? ((b: Uint8Array) => (wasmApi ? wasmApi.validate(b) : false));
  const minTierIdx = options.preferredBackend ? TIER_ORDER.indexOf(options.preferredBackend) : 0;
  const trail: RustCoreDiscoveryAttempt[] = [];
  const nativeLibrary = await probeNativeRustDylib({ repoRoot, nativeLibraryPath: options.nativeLibraryPath, runnerAttached: Boolean(options.nativeRunner) });

  let activeBackend: RustCoreBackendTier = "js-fallback";
  let resolvedPath: string | null = null; let abiVersion = 0; let capabilitiesMask = 0;
  let fallbackReason: string | null = null; let wasmExports: RawWasmCoreExports | null = null;
  let wave3Backend: RustCoreBackendTier = "js-fallback";
  let wave3ResolvedPath: string | null = null; let wave3CapabilitiesMask = 0;
  let wave3Exports: RawWasmWave3Exports | null = null;

  if (minTierIdx <= 0) {
    if (nativeLibrary.available && nativeLibrary.symbolsVerified && options.nativeRunner) {
      activeBackend = "native-dylib"; resolvedPath = nativeLibrary.path; abiVersion = EXPECTED_RUST_CORE_ABI; capabilitiesMask = EXPECTED_RUST_CORE_CAPABILITIES;
      trail.push({ tier: "native-dylib", candidatePath: nativeLibrary.path, status: "selected", reason: null });
      if (nativeLibrary.wave3SymbolsVerified) {
        wave3Backend = "native-dylib"; wave3ResolvedPath = nativeLibrary.path; wave3CapabilitiesMask = EXPECTED_WAVE3_CAPABILITIES;
      }
    } else if (nativeLibrary.available && nativeLibrary.symbolsVerified) {
      fallbackReason = "native-dylib-symbols-verified-no-runner-hook";
      trail.push({ tier: "native-dylib", candidatePath: nativeLibrary.path, status: "probed-no-runner", reason: fallbackReason });
    } else {
      trail.push({ tier: "native-dylib", candidatePath: nativeLibrary.path, status: "failed", reason: nativeLibrary.available ? `missing-symbols:${nativeLibrary.missingSymbols.join(",")}` : "native-dylib-not-found" });
    }
  } else {
    trail.push({ tier: "native-dylib", candidatePath: nativeLibrary.path, status: "skipped", reason: `preferred:${options.preferredBackend}` });
  }

  const wasmTiers: ReadonlyArray<{ readonly tier: Exclude<RustCoreBackendTier, "native-dylib" | "js-fallback">; readonly files: readonly string[]; readonly probe: Uint8Array | null }> = [
    { tier: "wasm-relaxed-simd", files: options.allowExtendedSuiteWasm === false ? ["studio-wasm64-drawing-core-relaxed-simd.wasm"] : ["studio-wasm64-drawing-core-relaxed-simd.wasm", "studio-wasm64-extended-suite.wasm"], probe: WASM_RELAXED_PROBE },
    { tier: "wasm-simd128", files: ["studio-wasm64-drawing-core-simd.wasm"], probe: WASM_SIMD128_PROBE },
    { tier: "wasm-scalar", files: ["studio-wasm64-drawing-core.wasm"], probe: null },
  ];
  for (const item of wasmTiers) {
    if (activeBackend !== "js-fallback") break;
    if (TIER_ORDER.indexOf(item.tier) < minTierIdx) { trail.push({ tier: item.tier, candidatePath: null, status: "skipped", reason: `preferred:${options.preferredBackend}` }); continue; }
    if (!wasmApi || (item.probe && !validate(item.probe))) { trail.push({ tier: item.tier, candidatePath: null, status: "skipped", reason: wasmApi ? "v8-cpu-feature-unsupported" : "webassembly-unavailable" }); continue; }
    for (const file of item.files) {
      const candidatePath = join(wasmDir, file);
      try {
        const { instance } = await wasmApi.instantiate(new Uint8Array(await readFile(candidatePath)), {});
        if (!isRawWasmCoreExports(instance.exports, wasmApi)) throw new Error("missing-wasm-exports");
        const abi = instance.exports.wasm_drawing_core_abi_version() >>> 0;
        const caps = instance.exports.wasm_hotpath_capabilities() >>> 0;
        if (abi !== EXPECTED_RUST_CORE_ABI || (caps & EXPECTED_RUST_CORE_CAPABILITIES) !== EXPECTED_RUST_CORE_CAPABILITIES) throw new Error(`abi-or-caps-mismatch:${abi}:${caps}`);
        wasmExports = instance.exports; activeBackend = item.tier; resolvedPath = candidatePath; abiVersion = abi; capabilitiesMask = caps;
        if (isRawWasmWave3Exports(instance.exports, wasmApi.Memory)) {
          const w3 = instance.exports.wasm_wave3_capabilities() >>> 0;
          if ((w3 & EXPECTED_WAVE3_CAPABILITIES) === EXPECTED_WAVE3_CAPABILITIES) {
            wave3Exports = instance.exports; wave3Backend = item.tier; wave3ResolvedPath = candidatePath; wave3CapabilitiesMask = w3;
          }
        }
        trail.push({ tier: item.tier, candidatePath, status: "selected", reason: null });
        break;
      } catch (err) {
        fallbackReason = err instanceof Error ? err.message : String(err);
        trail.push({ tier: item.tier, candidatePath, status: "failed", reason: fallbackReason });
      }
    }
  }
  if (activeBackend === "js-fallback") {
    fallbackReason = options.preferredBackend === "js-fallback" ? "forced-js-fallback" : (fallbackReason ?? "no-accelerated-backend-available");
    trail.push({ tier: "js-fallback", candidatePath: null, status: "selected", reason: fallbackReason });
  }

  // Wave-3 확장 스위트 자동 발견 (`native-dylib` 미선택 && 아직 Wave-3 WASM 미로드 시 relaxed-simd → simd128 → scalar 순 시도)
  if (wave3Backend === "js-fallback" && options.allowExtendedSuiteWasm !== false && wasmApi && minTierIdx <= 3) {
    const extPath = join(wasmDir, "studio-wasm64-extended-suite.wasm");
    const wave3TierOrder: ReadonlyArray<{ readonly tier: Exclude<RustCoreBackendTier, "native-dylib" | "js-fallback">; readonly probe: Uint8Array | null }> = [
      { tier: "wasm-relaxed-simd", probe: WASM_RELAXED_PROBE },
      { tier: "wasm-simd128", probe: WASM_SIMD128_PROBE },
      { tier: "wasm-scalar", probe: null },
    ];
    for (const wt of wave3TierOrder) {
      if (TIER_ORDER.indexOf(wt.tier) < minTierIdx) continue;
      if (wt.probe && !validate(wt.probe)) continue;
      try {
        const raw = new Uint8Array(await readFile(extPath));
        if (!validate(raw)) break;
        const { instance } = await wasmApi.instantiate(raw, {});
        if (isRawWasmWave3Exports(instance.exports, wasmApi.Memory)) {
          const w3 = instance.exports.wasm_wave3_capabilities() >>> 0;
          if ((w3 & EXPECTED_WAVE3_CAPABILITIES) === EXPECTED_WAVE3_CAPABILITIES) {
            wave3Exports = instance.exports; wave3Backend = wt.tier; wave3ResolvedPath = extPath; wave3CapabilitiesMask = w3;
          }
        }
        break;
      } catch { break; }
    }
  }

  const slots = [{ ptr: 0, cap: 0 }, { ptr: 0, cap: 0 }, { ptr: 0, cap: 0 }];
  let poolHits = 0; let poolMisses = 0; let peakPooledBytes = 0; let totalElapsedMs = 0; let disposed = false;
  const ops = { fnv1a: 0, xorDelta: 0, applyDelta: 0, gaussianBlur: 0, thumbnailHash: 0, wave3AudioMix: 0, wave3VectorStroke: 0, wave3WebtoonSlice: 0, wave3TileDedup: 0, wave3CmykTac: 0, wave3Palette: 0 };
  const pooledBytes = (): number => slots.reduce((sum, s) => sum + s.cap, 0);
  const currentBackend = (): RustCoreBackendTier => (disposed ? "js-fallback" : activeBackend);
  const currentWave3Backend = (): RustCoreBackendTier => (disposed ? "js-fallback" : wave3Backend);
  const ensureSlot = (idx: 0 | 1 | 2, byteLen: number): number => {
    if (!wasmExports || disposed) throw new Error("WASM core bridge is not active or already disposed");
    const slot = slots[idx];
    if (!slot || byteLen <= 0) return 0;
    if (slot.ptr !== 0 && slot.cap >= byteLen) { poolHits += 1; return slot.ptr; }
    if (slot.ptr !== 0 && slot.cap > 0) { wasmExports.wasm_free(slot.ptr, slot.cap); slot.ptr = 0; slot.cap = 0; }
    const ptr = wasmExports.wasm_alloc(byteLen);
    if (ptr === 0) throw new Error(`wasm_alloc failed for ${byteLen} bytes`);
    slot.ptr = ptr; slot.cap = byteLen; poolMisses += 1;
    peakPooledBytes = Math.max(peakPooledBytes, pooledBytes());
    return ptr;
  };

  const runFnv1a = (bytes: Uint8Array): number => {
    const t0 = performance.now(); let result: number;
    if (activeBackend === "native-dylib" && options.nativeRunner && !disposed) result = options.nativeRunner.fnv1aChecksum(bytes) >>> 0;
    else if (wasmExports && !disposed) {
      if (bytes.byteLength === 0) result = wasmExports.wasm_fnv1a_checksum(0, 0) >>> 0;
      else { const ptr = ensureSlot(0, bytes.byteLength); new Uint8Array(wasmExports.memory.buffer, ptr, bytes.byteLength).set(bytes); result = wasmExports.wasm_fnv1a_checksum(ptr, bytes.byteLength) >>> 0; }
    } else result = jsFnv1aChecksum32(bytes);
    ops.fnv1a += 1; totalElapsedMs += Math.max(0, performance.now() - t0);
    return result;
  };

  const runXor = (a: Uint8Array, b: Uint8Array, isApply: boolean) => {
    if (a.length !== b.length) throw new RangeError(`XOR length mismatch: a=${a.length}, b=${b.length}`);
    const t0 = performance.now(); let out: Uint8Array; let changedBytes = 0;
    if (activeBackend === "native-dylib" && options.nativeRunner && !disposed) {
      const res = options.nativeRunner.xorTileDelta(a, b); out = res.delta;
      changedBytes = isApply ? b.reduce((c, v) => c + (v !== 0 ? 1 : 0), 0) : res.changedBytes;
    } else if (wasmExports && !disposed && a.byteLength > 0) {
      const len = a.byteLength; const pA = ensureSlot(0, len); const pB = ensureSlot(1, len); const pOut = ensureSlot(2, len);
      const mem = wasmExports.memory.buffer; new Uint8Array(mem, pA, len).set(a); new Uint8Array(mem, pB, len).set(b);
      const res = wasmExports.wasm_xor_tile_delta_bytes(pA, pB, pOut, len);
      if (res < 0) throw new Error(`wasm_xor_tile_delta_bytes failed (${res})`);
      out = new Uint8Array(wasmExports.memory.buffer, pOut, len).slice();
      if (isApply) { for (let i = 0; i < len; i += 1) if ((b[i] ?? 0) !== 0) changedBytes += 1; } else changedBytes = res;
    } else { const res = jsXorPass(a, b, isApply); out = res.bytes; changedBytes = res.changedBytes; }
    const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
    return { out, changedBytes, backend: currentBackend(), elapsedMs };
  };

  const runBlur = (rgba: Uint8Array, width: number, height: number, sigma = 1.5, withHash = false) => {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) throw new RangeError(`Invalid RGBA blur dimensions: ${width}x${height} (${rgba.length}B)`);
    if (!Number.isFinite(sigma) || sigma < 0) throw new RangeError("sigma must be finite and >= 0");
    const t0 = performance.now(); let output: Uint8Array; let processedPixels: number; let checksum = 0;
    if (activeBackend === "native-dylib" && options.nativeRunner && !disposed) {
      ({ output, processedPixels } = options.nativeRunner.gaussianBlurRgba(rgba, width, height, sigma));
      if (withHash) checksum = options.nativeRunner.fnv1aChecksum(output) >>> 0;
    } else if (wasmExports && !disposed) {
      const len = rgba.byteLength; const pSrc = ensureSlot(0, len); const pDst = ensureSlot(2, len);
      new Uint8Array(wasmExports.memory.buffer, pSrc, len).set(rgba);
      const res = wasmExports.wasm_gaussian_blur_rgba(pSrc, 0, pDst, width, height, sigma);
      if (res < 0) throw new Error(`wasm_gaussian_blur_rgba failed (${res})`);
      if (withHash) checksum = wasmExports.wasm_fnv1a_checksum(pDst, len) >>> 0;
      output = new Uint8Array(wasmExports.memory.buffer, pDst, len).slice(); processedPixels = res;
    } else {
      ({ output, processedPixels } = jsGaussianBlurRgba(rgba, width, height, sigma));
      if (withHash) checksum = jsFnv1aChecksum32(output);
    }
    const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
    return { output, processedPixels, checksum, backend: currentBackend(), elapsedMs };
  };

  return {
    backend: activeBackend,
    wave3Backend,
    fnv1aChecksum: runFnv1a,
    fnv1aChecksumBatch: (chunks) => chunks.map((chunk) => runFnv1a(chunk)),
    computeXorTileDelta: (prev, next) => { const r = runXor(prev, next, false); ops.xorDelta += 1; return { delta: r.out, changedBytes: r.changedBytes, backend: r.backend, elapsedMs: r.elapsedMs }; },
    applyXorTileDelta: (base, delta) => { const r = runXor(base, delta, true); ops.applyDelta += 1; return { restored: r.out, changedBytes: r.changedBytes, backend: r.backend, elapsedMs: r.elapsedMs }; },
    gaussianBlurRgba: (rgba, width, height, sigma = 1.5) => { const r = runBlur(rgba, width, height, sigma, false); ops.gaussianBlur += 1; return { output: r.output, processedPixels: r.processedPixels, backend: r.backend, elapsedMs: r.elapsedMs }; },
    computeTileThumbnailHash: (rgba, width = 256, height = 256, sigma = 1.5) => { const r = runBlur(rgba, width, height, sigma, true); ops.thumbnailHash += 1; return { blurredRgba: r.output, checksum: r.checksum, processedPixels: r.processedPixels, backend: r.backend, elapsedMs: r.elapsedMs }; },

    audioMixMasterStereo: (tracks, trackCount, frames, params, dyn = {}) => {
      const t0 = performance.now(); ops.wave3AudioMix += 1;
      let res: Omit<DesktopAudioMixResult, "backend" | "elapsedMs">; let usedBackend: RustCoreBackendTier = "js-fallback";
      if (wave3Backend === "native-dylib" && options.nativeRunner?.audioMixMasterStereo && !disposed) {
        res = options.nativeRunner.audioMixMasterStereo(tracks, trackCount, frames, params, dyn); usedBackend = "native-dylib";
      } else if (wave3Exports && !disposed) {
        const w = wave3Exports; usedBackend = currentWave3Backend();
        res = runWasmWave3Scope(w, (a) => {
          const tp = new Float32Array(trackCount * 3);
          for (let i = 0; i < trackCount; i += 1) { const p = params[i] ?? { gain: 1, pan: 0, mute: false }; tp[i * 3] = p.gain; tp[i * 3 + 1] = p.pan; tp[i * 3 + 2] = p.mute ? 1 : 0; }
          const pTr = a.f32(tracks), pTp = a.f32(tp), pOl = a.f32Zero(frames), pOr = a.f32Zero(frames), pMet = a.f32Zero(6);
          const pDyn = a.f32(new Float32Array([dyn.sampleRate ?? 48_000, dyn.thresholdDb ?? -18, dyn.ratio ?? 4, dyn.kneeDb ?? 6, dyn.attackMs ?? 5, dyn.releaseMs ?? 80, dyn.makeupDb ?? 0, dyn.limiterCeilingDb ?? -1]));
          const rc = w.wasm_audio_mix_master_stereo(pTr, trackCount, frames, pTp, pDyn, pOl, pOr, pMet);
          if (rc < 0) throw new Error(`wasm_audio_mix_master_stereo failed (${rc})`);
          const m = new Float32Array(w.memory.buffer, pMet, 6);
          return { left: new Float32Array(w.memory.buffer, pOl, frames).slice(), right: new Float32Array(w.memory.buffer, pOr, frames).slice(), frames: rc, integratedLufs: m[0] ?? -120, truePeakLinear: m[1] ?? 0, samplePeakLinear: m[3] ?? 0, activeTracks: Math.round(m[5] ?? 0) };
        });
      } else res = jsWave3AudioMixMaster(tracks, trackCount, frames, params, dyn);
      const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
      return { ...res, backend: usedBackend, elapsedMs };
    },

    vectorExpandStrokeOutline: (spineXyw, join = "miter", miterLimit = 4) => {
      const t0 = performance.now(); ops.wave3VectorStroke += 1;
      let res: Omit<DesktopVectorStrokeResult, "backend" | "elapsedMs">; let usedBackend: RustCoreBackendTier = "js-fallback";
      if (wave3Backend === "native-dylib" && options.nativeRunner?.vectorExpandStrokeOutline && !disposed) {
        res = options.nativeRunner.vectorExpandStrokeOutline(spineXyw, join, miterLimit); usedBackend = "native-dylib";
      } else if (wave3Exports && !disposed) {
        const w = wave3Exports; usedBackend = currentWave3Backend();
        res = runWasmWave3Scope(w, (a) => {
          const pts = Math.floor(spineXyw.length / 3), jc = join === "bevel" ? 0 : 1, pIn = a.f32(spineXyw);
          const need = w.wasm_vector_expand_stroke_outline(pIn, pts, jc, miterLimit, 0, 0);
          if (need < 0) throw new Error(`wasm_vector_expand_stroke_outline failed (${need})`);
          if (need === 0) return { polygonXy: new Float32Array(0), vertexCount: 0 };
          const pOut = a.f32Zero(need * 2);
          const got = w.wasm_vector_expand_stroke_outline(pIn, pts, jc, miterLimit, pOut, need);
          if (got < 0) throw new Error(`wasm_vector_expand_stroke_outline write failed (${got})`);
          return { polygonXy: new Float32Array(w.memory.buffer, pOut, got * 2).slice(), vertexCount: got };
        });
      } else res = jsWave3VectorExpandStroke(spineXyw, join, miterLimit);
      const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
      return { ...res, backend: usedBackend, elapsedMs };
    },

    webtoonPlanSmartSlices: (rgba, width, height, cfg = {}) => {
      const t0 = performance.now(); ops.wave3WebtoonSlice += 1;
      let spans: readonly DesktopWebtoonSliceSpan[]; let usedBackend: RustCoreBackendTier = "js-fallback";
      if (wave3Backend === "native-dylib" && options.nativeRunner?.webtoonPlanSmartSlices && !disposed) {
        spans = options.nativeRunner.webtoonPlanSmartSlices(rgba, width, height, cfg); usedBackend = "native-dylib";
      } else if (wave3Exports && !disposed) {
        const w = wave3Exports; usedBackend = currentWave3Backend();
        spans = runWasmWave3Scope(w, (a) => {
          const pImg = a.u8(rgba);
          const pCfg = a.f32(new Float32Array([cfg.targetHeight ?? 1280, cfg.minHeight ?? 640, cfg.maxHeight ?? 2000, cfg.searchWindow ?? 240, cfg.inkL1Threshold ?? 28, cfg.continuityWeight ?? 4]));
          const n = w.wasm_webtoon_plan_smart_slices(pImg, width, height, pCfg, 0, 0);
          if (n < 0) throw new Error(`wasm_webtoon_plan_smart_slices failed (${n})`);
          const pOut = a.f32Zero(n * 5);
          const got = w.wasm_webtoon_plan_smart_slices(pImg, width, height, pCfg, pOut, n);
          if (got < 0) throw new Error(`wasm_webtoon_plan_smart_slices write failed (${got})`);
          const raw = new Float32Array(w.memory.buffer, pOut, got * 5);
          return Array.from({ length: got }, (_, i) => ({ startY: Math.round(raw[i * 5] ?? 0), endY: Math.round(raw[i * 5 + 1] ?? 0), height: Math.round(raw[i * 5 + 2] ?? 0), cutCost: raw[i * 5 + 3] ?? 0, isCleanGutter: (raw[i * 5 + 4] ?? 0) >= 0.5 }));
        });
      } else spans = jsWave3WebtoonSlice(rgba, width, height, cfg);
      const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
      return { spans, backend: usedBackend, elapsedMs };
    },

    webtoonDedupTilesFnv64: (rgba, width, height, tileSize) => {
      const t0 = performance.now(); ops.wave3TileDedup += 1;
      let res: Omit<DesktopTileDedupResult, "backend" | "elapsedMs">; let usedBackend: RustCoreBackendTier = "js-fallback";
      if (wave3Backend === "native-dylib" && options.nativeRunner?.webtoonDedupTilesFnv64 && !disposed) {
        res = options.nativeRunner.webtoonDedupTilesFnv64(rgba, width, height, tileSize); usedBackend = "native-dylib";
      } else if (wave3Exports && !disposed) {
        const w = wave3Exports; usedBackend = currentWave3Backend();
        res = runWasmWave3Scope(w, (a) => {
          const cap = Math.ceil(width / tileSize) * Math.ceil(height / tileSize);
          const pImg = a.u8(rgba), pSum = a.u32Zero(8), pEnt = a.u64Zero(cap * 2);
          const total = w.wasm_webtoon_dedup_tiles_fnv64(pImg, width, height, tileSize, pSum, pEnt, cap);
          if (total < 0) throw new Error(`wasm_webtoon_dedup_tiles_fnv64 failed (${total})`);
          const sum = new Uint32Array(w.memory.buffer, pSum, 8);
          const raw = new BigUint64Array(w.memory.buffer, pEnt, total * 2);
          const hashes64: bigint[] = []; const canonicalIndices: number[] = [];
          for (let i = 0; i < total; i += 1) { hashes64.push(raw[i * 2] ?? 0n); canonicalIndices.push(Number((raw[i * 2 + 1] ?? 0n) & 0xffffffffn)); }
          return { tilesX: sum[0] ?? 0, tilesY: sum[1] ?? 0, totalTiles: sum[2] ?? total, uniqueTiles: sum[3] ?? 0, duplicateTiles: sum[4] ?? 0, emptyTransparentTiles: sum[5] ?? 0, solidColorTiles: sum[6] ?? 0, contentTiles: sum[7] ?? 0, hashes64, canonicalIndices };
        });
      } else res = jsWave3DedupTilesFnv64(rgba, width, height, tileSize);
      const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
      return { ...res, backend: usedBackend, elapsedMs };
    },

    colorRgbaToCmykTac: (rgba, opts = {}) => {
      const t0 = performance.now(); ops.wave3CmykTac += 1;
      let res: Omit<DesktopCmykTacResult, "backend" | "elapsedMs">; let usedBackend: RustCoreBackendTier = "js-fallback";
      if (wave3Backend === "native-dylib" && options.nativeRunner?.colorRgbaToCmykTac && !disposed) {
        res = options.nativeRunner.colorRgbaToCmykTac(rgba, opts); usedBackend = "native-dylib";
      } else if (wave3Exports && !disposed) {
        const w = wave3Exports; usedBackend = currentWave3Backend();
        res = runWasmWave3Scope(w, (a) => {
          const px = rgba.length >> 2, pSrc = a.u8(rgba), pDst = a.u8Zero(rgba.length), pSt = a.f32Zero(2);
          const pCfg = a.f32(new Float32Array([opts.gcrStrength ?? 0.8, opts.ucrStart ?? 0, opts.maxK ?? 0.95, opts.tacLimitPct ?? 300]));
          const done = w.wasm_color_rgba_to_cmyk_tac_batch(pSrc, pDst, px, pCfg, pSt);
          if (done < 0) throw new Error(`wasm_color_rgba_to_cmyk_tac_batch failed (${done})`);
          const st = new Float32Array(w.memory.buffer, pSt, 2);
          return { cmyk: new Uint8Array(w.memory.buffer, pDst, rgba.length).slice(), pixelCount: done, clampedPixels: Math.round(st[0] ?? 0), maxTacPct: st[1] ?? 0 };
        });
      } else res = jsWave3RgbaToCmykTac(rgba, opts);
      const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
      return { ...res, backend: usedBackend, elapsedMs };
    },

    colorExtractPaletteMedianCut: (rgba, maxColors = 16, alphaThreshold = 128) => {
      const t0 = performance.now(); ops.wave3Palette += 1;
      let swatches: readonly DesktopPaletteSwatch[]; let usedBackend: RustCoreBackendTier = "js-fallback";
      if (wave3Backend === "native-dylib" && options.nativeRunner?.colorExtractPaletteMedianCut && !disposed) {
        swatches = options.nativeRunner.colorExtractPaletteMedianCut(rgba, maxColors, alphaThreshold); usedBackend = "native-dylib";
      } else if (wave3Exports && !disposed) {
        const w = wave3Exports; usedBackend = currentWave3Backend();
        swatches = runWasmWave3Scope(w, (a) => {
          const px = rgba.length >> 2, pSrc = a.u8(rgba), pSw = a.u32Zero(maxColors * 2);
          const cnt = w.wasm_color_extract_palette_median_cut(pSrc, px, maxColors, alphaThreshold, pSw);
          if (cnt < 0) throw new Error(`wasm_color_extract_palette_median_cut failed (${cnt})`);
          const raw = new Uint32Array(w.memory.buffer, pSw, cnt * 2);
          return Array.from({ length: cnt }, (_, i) => { const pk = raw[i * 2] ?? 0; return { r: pk & 0xff, g: (pk >>> 8) & 0xff, b: (pk >>> 16) & 0xff, count: raw[i * 2 + 1] ?? 0 }; });
        });
      } else swatches = jsWave3ExtractPalette(rgba, maxColors, alphaThreshold);
      const elapsedMs = Math.max(0, performance.now() - t0); totalElapsedMs += elapsedMs;
      return { swatches, backend: usedBackend, elapsedMs };
    },

    getTelemetry: () => ({ activeBackend: currentBackend(), resolvedPath, wave3Backend: currentWave3Backend(), wave3ResolvedPath, abiVersion, capabilitiesMask, wave3CapabilitiesMask, fallbackReason, nativeLibrary, discoveryTrail: [...trail], poolHits, poolMisses, pooledBytes: pooledBytes(), peakPooledBytes, linearMemoryBytes: wasmExports && !disposed ? wasmExports.memory.buffer.byteLength : 0, ops: { ...ops }, totalElapsedMs }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (wasmExports) for (const slot of slots) { if (slot.ptr !== 0 && slot.cap > 0) wasmExports.wasm_free(slot.ptr, slot.cap); slot.ptr = 0; slot.cap = 0; }
      wave3Exports = null;
      options.nativeRunner?.dispose?.();
    },
  };
}
