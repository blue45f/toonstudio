/**
 * 결정론적 512² 픽스처 생성 및 실측 Rust Wasm vs JS 폴백 속도·바이트 정합 벤치마크.
 */

import { jsFnv1aChecksum32 } from "./wasm64-hotpath-js-fallback";
import type {
  HotpathBenchmarkFixtures,
  HotpathBenchmarkSuiteResult,
  HotpathKernelBenchmarkEntry,
  StudioWasm64HotpathRuntime,
} from "./wasm64-hotpath-types";

export function createHotpathBenchmarkFixtures(
  dimension = 512,
  kmStripPixels = 4096,
): HotpathBenchmarkFixtures {
  const safeDim = Math.max(16, Math.min(1024, Math.round(dimension)));
  const pixelCount = safeDim * safeDim;
  const rgba = new Uint8Array(pixelCount * 4);
  const nextTileRgba = new Uint8Array(pixelCount * 4);
  const heightMap = new Float32Array(pixelCount);

  for (let y = 0; y < safeDim; y += 1) {
    for (let x = 0; x < safeDim; x += 1) {
      const p = y * safeDim + x;
      const i = p * 4;
      const ridge = ((x ^ y) & 31) < 16 ? 212 : 68;
      const r = (ridge + ((x * 3) & 31)) & 0xff;
      const g = (92 + ((y * 5) & 127)) & 0xff;
      const b = (220 - ((x + y) & 127)) & 0xff;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;

      nextTileRgba[i] = (x & 7) === 0 ? r ^ 0x3c : r;
      nextTileRgba[i + 1] = g;
      nextTileRgba[i + 2] = (y & 15) === 0 ? b ^ 0x19 : b;
      nextTileRgba[i + 3] = 255;

      const dx = (x - safeDim * 0.5) / (safeDim * 0.5);
      const dy = (y - safeDim * 0.5) / (safeDim * 0.5);
      heightMap[p] = Math.max(0, 1 - Math.hypot(dx, dy)) * 0.85 + (((x * 13 + y * 7) & 15) / 100);
    }
  }

  const safeKmPixels = Math.max(64, Math.round(kmStripPixels));
  const kmDstRgba = new Uint8Array(safeKmPixels * 4);
  const kmSrcRgba = new Uint8Array(safeKmPixels * 4);
  for (let p = 0; p < safeKmPixels; p += 1) {
    const i = p * 4;
    kmDstRgba[i] = (24 + ((p * 7) & 63)) & 0xff;
    kmDstRgba[i + 1] = (86 + ((p * 3) & 63)) & 0xff;
    kmDstRgba[i + 2] = 214;
    kmDstRgba[i + 3] = 255;
    kmSrcRgba[i] = 245;
    kmSrcRgba[i + 1] = (196 + ((p * 5) & 31)) & 0xff;
    kmSrcRgba[i + 2] = (24 + ((p * 11) & 31)) & 0xff;
    kmSrcRgba[i + 3] = 255;
  }

  return { dimension: safeDim, rgba, nextTileRgba, heightMap, kmDstRgba, kmSrcRgba };
}

function measureMaxDiff(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  let maxDiff = a.length === b.length ? 0 : 255;
  for (let i = 0; i < len; i += 1) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (d > maxDiff) maxDiff = d;
  }
  return maxDiff;
}

/** 실제 컴파일된 Rust `.wasm`과 바이트 동등 JS 폴백의 실행 시간·가속 배율·바이트 정합을 실측한다. */
export function benchmarkWasm64VsJsHotpaths(
  runtime: StudioWasm64HotpathRuntime,
  options: { readonly dimension?: number; readonly kmStripPixels?: number } = {},
): HotpathBenchmarkSuiteResult {
  const dim = options.dimension ?? 512;
  const kmStripPixels = options.kmStripPixels ?? 4096;
  const fixtures = createHotpathBenchmarkFixtures(dim, kmStripPixels);
  const meta = runtime.getMetadata();
  const hasWasm = meta.backendMode === "rust-wasm";

  const unsharpJs = runtime.unsharpMaskRgba(fixtures.rgba, dim, dim, {
    sigma: 1.4,
    amount: 1.25,
    threshold: 2,
    forceBackend: "js-fallback",
  });
  const unsharpWasm = hasWasm
    ? runtime.unsharpMaskRgba(fixtures.rgba, dim, dim, {
        sigma: 1.4,
        amount: 1.25,
        threshold: 2,
        forceBackend: "rust-wasm",
      })
    : null;
  const unsharpDiff = unsharpWasm ? measureMaxDiff(unsharpWasm.output, unsharpJs.output) : 0;

  const impastoJs = runtime.applyImpastoLightingRgba(fixtures.rgba, fixtures.heightMap, dim, dim, {
    forceBackend: "js-fallback",
  });
  const impastoWasm = hasWasm
    ? runtime.applyImpastoLightingRgba(fixtures.rgba, fixtures.heightMap, dim, dim, {
        forceBackend: "rust-wasm",
      })
    : null;
  const impastoDiff = impastoWasm ? measureMaxDiff(impastoWasm.output, impastoJs.output) : 0;

  const xorJs = runtime.xorTileDeltaBytes(fixtures.rgba, fixtures.nextTileRgba, "js-fallback");
  const xorWasm = hasWasm ? runtime.xorTileDeltaBytes(fixtures.rgba, fixtures.nextTileRgba, "rust-wasm") : null;
  const xorDiff = xorWasm ? measureMaxDiff(xorWasm.delta, xorJs.delta) : 0;

  const kmJs = runtime.mixPigmentsKm16Strip(fixtures.kmDstRgba, fixtures.kmSrcRgba, 0.5, "js-fallback");
  const kmWasm = hasWasm
    ? runtime.mixPigmentsKm16Strip(fixtures.kmDstRgba, fixtures.kmSrcRgba, 0.5, "rust-wasm")
    : null;
  const kmDiff = kmWasm ? measureMaxDiff(kmWasm.output, kmJs.output) : 0;

  const entries: HotpathKernelBenchmarkEntry[] = [
    {
      id: "unsharp512",
      labelKo: `${dim}² 언샤프 마스크`,
      labelEn: `${dim}² Unsharp Mask`,
      workloadSummary: `${(dim * dim).toLocaleString("en-US")} px`,
      wasmMs: unsharpWasm ? unsharpWasm.elapsedMs : null,
      jsMs: unsharpJs.elapsedMs,
      speedupRatio: unsharpWasm ? unsharpJs.elapsedMs / Math.max(unsharpWasm.elapsedMs, 0.01) : 1,
      maxChannelDiff: unsharpDiff,
      byteExactMatch: unsharpDiff === 0,
      checksumWasm: unsharpWasm ? jsFnv1aChecksum32(unsharpWasm.output) : null,
      checksumJs: jsFnv1aChecksum32(unsharpJs.output),
    },
    {
      id: "impasto25d",
      labelKo: "2.5D 임파스토 법선",
      labelEn: "2.5D Impasto Sobel",
      workloadSummary: `${(dim * dim).toLocaleString("en-US")} px`,
      wasmMs: impastoWasm ? impastoWasm.elapsedMs : null,
      jsMs: impastoJs.elapsedMs,
      speedupRatio: impastoWasm ? impastoJs.elapsedMs / Math.max(impastoWasm.elapsedMs, 0.01) : 1,
      maxChannelDiff: impastoDiff,
      byteExactMatch: impastoDiff === 0,
      checksumWasm: impastoWasm ? jsFnv1aChecksum32(impastoWasm.output) : null,
      checksumJs: jsFnv1aChecksum32(impastoJs.output),
    },
    {
      id: "xorTileDelta",
      labelKo: "타일 XOR 델타",
      labelEn: "Tile XOR Delta",
      workloadSummary: `${Math.round(fixtures.rgba.byteLength / 1024)} KiB`,
      wasmMs: xorWasm ? xorWasm.elapsedMs : null,
      jsMs: xorJs.elapsedMs,
      speedupRatio: xorWasm ? xorJs.elapsedMs / Math.max(xorWasm.elapsedMs, 0.01) : 1,
      maxChannelDiff: xorDiff,
      byteExactMatch: xorDiff === 0,
      checksumWasm: xorWasm ? xorWasm.checksumDelta : null,
      checksumJs: xorJs.checksumDelta,
    },
    {
      id: "km16SpectralMix",
      labelKo: "KM 16파장 분광 혼색",
      labelEn: "KM 16-Band Spectral Mix",
      workloadSummary: `${kmStripPixels.toLocaleString("en-US")} px`,
      wasmMs: kmWasm ? kmWasm.elapsedMs : null,
      jsMs: kmJs.elapsedMs,
      speedupRatio: kmWasm ? kmJs.elapsedMs / Math.max(kmWasm.elapsedMs, 0.01) : 1,
      maxChannelDiff: kmDiff,
      byteExactMatch: kmDiff === 0,
      checksumWasm: kmWasm ? jsFnv1aChecksum32(kmWasm.output) : null,
      checksumJs: jsFnv1aChecksum32(kmJs.output),
    },
  ];

  const totalJsMs = entries.reduce((acc, e) => acc + e.jsMs, 0);
  const totalWasmMs = hasWasm ? entries.reduce((acc, e) => acc + (e.wasmMs ?? 0), 0) : null;
  const overallSpeedupRatio = totalWasmMs !== null ? totalJsMs / Math.max(totalWasmMs, 0.01) : 1;

  return {
    dimension: dim,
    backendMode: meta.backendMode,
    wasmByteLength: meta.wasmByteLength,
    totalWasmMs,
    totalJsMs,
    overallSpeedupRatio,
    allByteExactMatch: entries.every((e) => e.byteExactMatch),
    entries,
  };
}
