import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  readonly runnerAttached: boolean;
}

export interface NativeRustRunnerHook {
  readonly fnv1aChecksum: (bytes: Uint8Array) => number;
  readonly xorTileDelta: (prev: Uint8Array, next: Uint8Array) => { readonly delta: Uint8Array; readonly changedBytes: number };
  readonly gaussianBlurRgba: (rgba: Uint8Array, width: number, height: number, sigma: number) => { readonly output: Uint8Array; readonly processedPixels: number };
  readonly dispose?: () => void;
}

export interface RustCoreDiscoveryAttempt {
  readonly tier: RustCoreBackendTier; readonly candidatePath: string | null;
  readonly status: "selected" | "probed-no-runner" | "skipped" | "failed"; readonly reason: string | null;
}

export interface RustCoreBridgeTelemetry {
  readonly activeBackend: RustCoreBackendTier; readonly resolvedPath: string | null;
  readonly abiVersion: number; readonly capabilitiesMask: number; readonly fallbackReason: string | null;
  readonly nativeLibrary: NativeDylibProbe; readonly discoveryTrail: readonly RustCoreDiscoveryAttempt[];
  readonly poolHits: number; readonly poolMisses: number; readonly pooledBytes: number;
  readonly peakPooledBytes: number; readonly linearMemoryBytes: number;
  readonly ops: { readonly fnv1a: number; readonly xorDelta: number; readonly applyDelta: number; readonly gaussianBlur: number; readonly thumbnailHash: number };
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
  readonly fnv1aChecksum: (bytes: Uint8Array) => number;
  readonly fnv1aChecksumBatch: (chunks: readonly Uint8Array[]) => readonly number[];
  readonly computeXorTileDelta: (prev: Uint8Array, next: Uint8Array) => XorTileDeltaResult;
  readonly applyXorTileDelta: (base: Uint8Array, delta: Uint8Array) => ApplyXorTileDeltaResult;
  readonly gaussianBlurRgba: (rgba: Uint8Array, width: number, height: number, sigma?: number) => GaussianBlurTileResult;
  readonly computeTileThumbnailHash: (rgba: Uint8Array, width?: number, height?: number, sigma?: number) => TileThumbnailHashResult;
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

/** Rust `fnv1a_checksum_32`와 비트 단위 동등한 32비트 FNV-1a 체크섬 JS 폴백. */
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

/** Rust `xor_tile_delta_bytes`와 비트 단위 동등한 XOR 타일 델타 계산 JS 폴백. */
export function jsComputeXorTileDelta(prev: Uint8Array, next: Uint8Array): { readonly delta: Uint8Array; readonly changedBytes: number } {
  const { bytes, changedBytes } = jsXorPass(prev, next, false); return { delta: bytes, changedBytes };
}
/** Rust `apply_xor_tile_delta_in_place`와 동등한 XOR 델타 무손실 복원 JS 폴백. */
export function jsApplyXorTileDelta(base: Uint8Array, delta: Uint8Array): { readonly restored: Uint8Array; readonly changedBytes: number } {
  const { bytes, changedBytes } = jsXorPass(base, delta, true); return { restored: bytes, changedBytes };
}

/** Rust `gaussian_blur_rgba_into`(비마스크 고속 경로)와 0-diff 동등한 가우시안 블러 JS 폴백. */
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

/** 로컬 네이티브 Rust 공유 라이브러리(`.dylib` / `.so` / `.dll`)와 필수 C-ABI 심볼을 탐지한다. */
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
      return { available: true, path: candidate, format, byteLength: info.size, symbolsVerified: format !== "unknown" && missingSymbols.length === 0, foundSymbols, missingSymbols, runnerAttached: Boolean(options.runnerAttached) };
    } catch { continue; }
  }
  return { available: false, path: null, format: null, byteLength: 0, symbolsVerified: false, foundSymbols: [], missingSymbols: [...NATIVE_CORE_REQUIRED_SYMBOLS], runnerAttached: Boolean(options.runnerAttached) };
}

function isRawWasmCoreExports(exp: Record<string, unknown>, wasm: WasmGlobalApi): exp is Record<string, unknown> & RawWasmCoreExports {
  return exp.memory instanceof wasm.Memory && NATIVE_CORE_REQUIRED_SYMBOLS.every((sym) => typeof exp[sym] === "function");
}

/** `native-dylib → wasm-relaxed-simd → wasm-simd128 → wasm-scalar → js-fallback` 순으로 코어 브리지를 초기화한다. */
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

  if (minTierIdx <= 0) {
    if (nativeLibrary.available && nativeLibrary.symbolsVerified && options.nativeRunner) {
      activeBackend = "native-dylib"; resolvedPath = nativeLibrary.path; abiVersion = EXPECTED_RUST_CORE_ABI; capabilitiesMask = EXPECTED_RUST_CORE_CAPABILITIES;
      trail.push({ tier: "native-dylib", candidatePath: nativeLibrary.path, status: "selected", reason: null });
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

  const slots = [{ ptr: 0, cap: 0 }, { ptr: 0, cap: 0 }, { ptr: 0, cap: 0 }];
  let poolHits = 0; let poolMisses = 0; let peakPooledBytes = 0; let totalElapsedMs = 0; let disposed = false;
  const ops = { fnv1a: 0, xorDelta: 0, applyDelta: 0, gaussianBlur: 0, thumbnailHash: 0 };
  const pooledBytes = (): number => slots.reduce((sum, s) => sum + s.cap, 0);
  const currentBackend = (): RustCoreBackendTier => (disposed ? "js-fallback" : activeBackend);
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
    const t0 = performance.now();
    let result: number;
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
    fnv1aChecksum: runFnv1a,
    fnv1aChecksumBatch: (chunks) => chunks.map((chunk) => runFnv1a(chunk)),
    computeXorTileDelta: (prev, next) => { const r = runXor(prev, next, false); ops.xorDelta += 1; return { delta: r.out, changedBytes: r.changedBytes, backend: r.backend, elapsedMs: r.elapsedMs }; },
    applyXorTileDelta: (base, delta) => { const r = runXor(base, delta, true); ops.applyDelta += 1; return { restored: r.out, changedBytes: r.changedBytes, backend: r.backend, elapsedMs: r.elapsedMs }; },
    gaussianBlurRgba: (rgba, width, height, sigma = 1.5) => { const r = runBlur(rgba, width, height, sigma, false); ops.gaussianBlur += 1; return { output: r.output, processedPixels: r.processedPixels, backend: r.backend, elapsedMs: r.elapsedMs }; },
    computeTileThumbnailHash: (rgba, width = 256, height = 256, sigma = 1.5) => { const r = runBlur(rgba, width, height, sigma, true); ops.thumbnailHash += 1; return { blurredRgba: r.output, checksum: r.checksum, processedPixels: r.processedPixels, backend: r.backend, elapsedMs: r.elapsedMs }; },
    getTelemetry: () => ({ activeBackend: currentBackend(), resolvedPath, abiVersion, capabilitiesMask, fallbackReason, nativeLibrary, discoveryTrail: [...trail], poolHits, poolMisses, pooledBytes: pooledBytes(), peakPooledBytes, linearMemoryBytes: wasmExports && !disposed ? wasmExports.memory.buffer.byteLength : 0, ops: { ...ops }, totalElapsedMs }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (wasmExports) for (const slot of slots) { if (slot.ptr !== 0 && slot.cap > 0) wasmExports.wasm_free(slot.ptr, slot.cap); slot.ptr = 0; slot.cap = 0; }
      options.nativeRunner?.dispose?.();
    },
  };
}
