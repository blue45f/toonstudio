// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { STUDIO_WASM32_ADDRESS_LIMIT_BYTES } from "../studio-wasm64-memory-governor";

import { StudioWasm64EngineHubPanel } from "./StudioWasm64EngineHubPanel";
import {
  AsyncDeltaHistorySerializer,
  buildSyntheticPsdHeaderBytes,
  buildWasmDrawingModuleBytes,
  instantiateWasm64DrawingModule,
  parseLargePsdHeaderWasm64,
  runWasm64FilterOrWarp,
  vectorizeStrokeWasm64,
  WASM32_DRAWING_LIMITS_FLAG,
  WASM64_DRAWING_LIMITS_FLAG,
  Wasm64VirtualTileSwapper,
  type StrokeSamplePoint,
} from "./wasm64-drawing-kernels";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

function createWasm32OnlyMockHost(): typeof WebAssembly {
  const realWasm = WebAssembly;
  const isMemory64Bytes = (bytes: BufferSource): boolean => {
    const view = bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // memory 또는 import 섹션에 memory64 플래그(0x05)가 있는지 확인
    for (let i = 8; i + 2 < view.length; i += 1) {
      if (view[i] === 0x05 && view[i + 1] === 0x04 && view[i + 3] === 0x05) return true;
      if (view[i] === 0x02 && view[i + 1] === WASM64_DRAWING_LIMITS_FLAG) return true;
    }
    return false;
  };
  return {
    ...realWasm,
    Memory: realWasm.Memory,
    Module: realWasm.Module,
    Instance: realWasm.Instance,
    validate: (bytes: BufferSource): boolean => (isMemory64Bytes(bytes) ? false : realWasm.validate(bytes)),
  } as typeof WebAssembly;
}

describe("Wasm64 (memory64) 네이티브 바이너리 실행 · Wasm32/JS 폴백 비트 동치성", () => {
  it("Node 24 런타임에서 실제 memory64 (i64, 0x05 플래그) 바이너리를 검증·인스턴스화하고 전 커널을 실행한다", () => {
    const wasm64Bytes = buildWasmDrawingModuleBytes("i64", { initialPages: BigInt(2), maximumPages: BigInt(16) });
    expect(WebAssembly.validate(wasm64Bytes)).toBe(true);
    expect(wasm64Bytes).toContain(WASM64_DRAWING_LIMITS_FLAG);

    const mod64 = instantiateWasm64DrawingModule({
      initialPages: BigInt(2),
      maximumPages: BigInt(32),
      preferAddressType: "i64",
    });
    expect(mod64.backendMode).toBe("wasm64-native");
    expect(mod64.addressType).toBe("i64");
    expect(mod64.memoryLimitsFlag).toBe(WASM64_DRAWING_LIMITS_FLAG);
    expect(mod64.memoryRuntime).not.toBeNull();
    expect(mod64.memoryRuntime?.addressType).toBe("i64");

    const orig = new Uint8Array([200, 100, 50, 255, 40, 180, 220, 128]);
    const blur = new Uint8Array([160, 100, 70, 255, 60, 150, 200, 128]);
    const unsharp = mod64.unsharpMixRgba(orig, blur, 1.5, 4);
    expect(unsharp.modifiedPixels).toBe(2);
    expect(unsharp.output[0]).toBeGreaterThan(orig[0]!);
    expect(unsharp.output[3]).toBe(255);
    expect(unsharp.output[7]).toBe(128);

    const deltaRes = mod64.xorDeltaBytes(orig, blur);
    expect(deltaRes.changedBytes).toBe(5);
    // XOR 자기역원 검증
    const restored = mod64.xorDeltaBytes(orig, deltaRes.delta);
    expect(Array.from(restored.delta)).toEqual(Array.from(blur));

    const hashA = mod64.computeFnv1aChecksum(orig);
    const hashB = mod64.computeFnv1aChecksum(blur);
    expect(hashA).not.toBe(hashB);

    const blended = mod64.blendRgbaLinear(orig, blur, 0.5);
    expect(blended.processedPixels).toBe(2);
    expect(blended.output[0]).toBe(180);
  });

  it("memory64 미지원 호스트에서는 Wasm32(i32)로, WebAssembly 부재 시 JS 폴백으로 전환하며 비트 동치를 유지한다", () => {
    const mod64 = instantiateWasm64DrawingModule({ preferAddressType: "i64" });
    const mod32 = instantiateWasm64DrawingModule({
      preferAddressType: "i64",
      webAssembly: createWasm32OnlyMockHost(),
    });
    const modJs = instantiateWasm64DrawingModule({
      preferAddressType: "i64",
      webAssembly: null,
    });

    expect(mod32.backendMode).toBe("wasm32-fallback");
    expect(mod32.addressType).toBe("i32");
    expect(mod32.memoryLimitsFlag).toBe(WASM32_DRAWING_LIMITS_FLAG);
    expect(modJs.backendMode).toBe("js-fallback");
    expect(modJs.addressType).toBe("js");

    const a = new Uint8Array(64);
    const b = new Uint8Array(64);
    for (let i = 0; i < 64; i += 1) {
      a[i] = (i * 19 + 11) & 0xff;
      b[i] = (i * 13 + 7) & 0xff;
    }

    const u64 = mod64.unsharpMixRgba(a, b, 1.25, 3);
    const u32 = mod32.unsharpMixRgba(a, b, 1.25, 3);
    const uJs = modJs.unsharpMixRgba(a, b, 1.25, 3);
    expect(Array.from(u32.output)).toEqual(Array.from(u64.output));
    expect(Array.from(uJs.output)).toEqual(Array.from(u64.output));
    expect(u32.modifiedPixels).toBe(u64.modifiedPixels);
    expect(uJs.modifiedPixels).toBe(u64.modifiedPixels);

    const x64 = mod64.xorDeltaBytes(a, b);
    const x32 = mod32.xorDeltaBytes(a, b);
    const xJs = modJs.xorDeltaBytes(a, b);
    expect(Array.from(x32.delta)).toEqual(Array.from(x64.delta));
    expect(Array.from(xJs.delta)).toEqual(Array.from(x64.delta));
    expect(x32.changedBytes).toBe(x64.changedBytes);

    expect(mod32.computeFnv1aChecksum(a)).toBe(mod64.computeFnv1aChecksum(a));
    expect(modJs.computeFnv1aChecksum(a)).toBe(mod64.computeFnv1aChecksum(a));

    const b64 = mod64.blendRgbaLinear(a, b, 0.35);
    const b32 = mod32.blendRgbaLinear(a, b, 0.35);
    const bJs = modJs.blendRgbaLinear(a, b, 0.35);
    expect(Array.from(b32.output)).toEqual(Array.from(b64.output));
    expect(Array.from(bJs.output)).toEqual(Array.from(b64.output));
  });
});

describe("가상 타일 스와퍼 · 베지어 벡터라이저 · 대용량 PSD/PSB 파서 · 비동기 히스토리 · 필터/워프", () => {
  it("Wasm64VirtualTileSwapper는 4 GiB 이상 64비트 주소 공간에서 상주 예산 상한과 무손실 LRU 스와핑을 보장한다", () => {
    const mod64 = instantiateWasm64DrawingModule({ initialPages: BigInt(2), maximumPages: BigInt(16) });
    const tileBytes = 2048;
    const budgetBytes = tileBytes * 3;
    const swapper = new Wasm64VirtualTileSwapper({
      tileBytes,
      maxResidentBytes: budgetBytes,
      baseVirtualAddrI64: STUDIO_WASM32_ADDRESS_LIMIT_BYTES + BigInt(4096),
      memoryRuntime: mod64.memoryRuntime,
      checksumFn: mod64.computeFnv1aChecksum,
    });

    const golden = new Map<string, Uint8Array>();
    for (let i = 0; i < 10; i += 1) {
      const tile = new Uint8Array(tileBytes);
      for (let p = 0; p < tileBytes; p += 4) {
        tile[p] = (i * 23) & 0xff;
        tile[p + 1] = (p / 4) & 0xff;
        tile[p + 2] = (255 - i * 17) & 0xff;
        tile[p + 3] = 255;
      }
      const key = `layer1:${i}:0`;
      const written = swapper.writeTile(key, tile);
      expect(written.globalAddrI64 > STUDIO_WASM32_ADDRESS_LIMIT_BYTES).toBe(true);
      expect(swapper.getStats().residentBytes).toBeLessThanOrEqual(budgetBytes);
      golden.set(key, tile);
    }

    const midStats = swapper.getStats();
    expect(midStats.residentTiles).toBe(3);
    expect(midStats.swappedOutTiles).toBe(7);
    expect(midStats.swapOuts).toBe(7);
    expect(midStats.crosses4GiBBoundary).toBe(true);

    // 스왑아웃된 타일 전수 무손실 복원 검증
    for (const [key, expected] of golden.entries()) {
      const res = swapper.readTile(key);
      expect(res).not.toBeNull();
      expect(res?.checksumVerified).toBe(true);
      expect(Array.from(res?.pixels ?? [])).toEqual(Array.from(expected));
      expect(swapper.getStats().residentBytes).toBeLessThanOrEqual(budgetBytes);
    }
    expect(swapper.getStats().swapIns).toBeGreaterThanOrEqual(7);
  });

  it("vectorizeStrokeWasm64는 밀집 곡선 스트로크를 허용 오차 이내의 3차 베지어 세그먼트로 압축한다", () => {
    const pts: StrokeSamplePoint[] = [];
    for (let i = 0; i <= 80; i += 1) {
      const t = i / 80;
      pts.push({
        x: t * 240,
        y: 60 + Math.sin(t * Math.PI * 2) * 30,
        pressure: 0.2 + 0.8 * Math.sin(t * Math.PI),
      });
    }
    const res = vectorizeStrokeWasm64(pts, { rdpEpsilon: 0.4, bezierTolerancePx: 1.25 });
    expect(res.segments.length).toBeGreaterThan(0);
    expect(res.segments.length).toBeLessThan(pts.length / 4);
    expect(res.maxFitErrorPx).toBeLessThanOrEqual(1.25);
    expect(res.compressionRatio).toBeGreaterThan(4);
    expect(res.svgPath.startsWith("M ")).toBe(true);
    expect(res.svgPath).toContain(" C ");
  });

  it("parseLargePsdHeaderWasm64는 PSD v1 및 4 GiB 초과 PSB v2 헤더를 정확히 파싱하고 오류 입력을 차단한다", () => {
    const psdBytes = buildSyntheticPsdHeaderBytes({
      version: 1, channels: 4, width: 4096, height: 8192, depthBits: 8, colorModeCode: 3,
      colorDataLen: 0, resourcesLen: 128, layerAndMaskLen: BigInt(65536),
    });
    const psdRes = parseLargePsdHeaderWasm64(psdBytes);
    expect(psdRes.ok).toBe(true);
    if (psdRes.ok) {
      expect(psdRes.header.version).toBe(1);
      expect(psdRes.header.isPsb).toBe(false);
      expect(psdRes.header.width).toBe(4096);
      expect(psdRes.header.height).toBe(8192);
      expect(psdRes.header.colorMode).toBe("RGB");
      expect(psdRes.header.layerAndMaskOffset).toBe(BigInt(30 + 4 + 128));
      expect(psdRes.header.requiresMemory64).toBe(false);
    }

    const psbLayerLen = BigInt("5000000000");
    const psbBytes = buildSyntheticPsdHeaderBytes({
      version: 2, channels: 4, width: 40000, height: 30000, depthBits: 16, colorModeCode: 4,
      colorDataLen: 16, resourcesLen: 64, layerAndMaskLen: psbLayerLen,
    });
    const psbRes = parseLargePsdHeaderWasm64(psbBytes);
    expect(psbRes.ok).toBe(true);
    if (psbRes.ok) {
      expect(psbRes.header.isPsb).toBe(true);
      expect(psbRes.header.colorMode).toBe("CMYK");
      expect(psbRes.header.requiresMemory64).toBe(true);
      expect(psbRes.header.imageDataOffset > STUDIO_WASM32_ADDRESS_LIMIT_BYTES).toBe(true);
    }

    const badSig = parseLargePsdHeaderWasm64(new Uint8Array(40));
    expect(badSig.ok).toBe(false);
    if (!badSig.ok) expect(badSig.errorCode).toBe("bad-signature");
  });

  it("AsyncDeltaHistorySerializer는 Wasm64 XOR 델타 압축과 비동기 무손실 왕복 복원을 보장한다", async () => {
    const mod64 = instantiateWasm64DrawingModule();
    const serializer = new AsyncDeltaHistorySerializer(mod64);
    const frames: Uint8Array[] = [];
    const base = new Uint8Array(4096).fill(120);

    let totalRaw = 0;
    let totalEncoded = 0;
    for (let step = 0; step < 5; step += 1) {
      const next = new Uint8Array(base);
      const start = step * 160;
      for (let i = start; i < start + 64; i += 1) next[i] = (step * 41 + i) & 0xff;
      frames.push(next);
      const pushed = await serializer.pushSnapshot(next);
      totalRaw += pushed.rawBytes;
      totalEncoded += pushed.encodedBytes;
    }

    expect(serializer.length).toBe(5);
    expect(totalEncoded).toBeLessThan(totalRaw * 0.25);

    for (let idx = 0; idx < frames.length; idx += 1) {
      const restored = await serializer.restoreSnapshot(idx);
      expect(restored.checksumVerified).toBe(true);
      expect(Array.from(restored.frame)).toEqual(Array.from(frames[idx]!));
    }
  });

  it("runWasm64FilterOrWarp는 경계차단 블러(번짐 0%) · 언샤프 · 임파스토 · MLS 강체 워프를 정확히 실행한다", () => {
    const mod64 = instantiateWasm64DrawingModule();
    const w = 12;
    const h = 12;
    const rgba = new Uint8Array(w * h * 4);
    const mask = new Uint8Array(w * h);
    const heightMap = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        if (x < 6) {
          rgba[idx] = 240; rgba[idx + 1] = (x + y) % 2 === 0 ? 220 : 20; rgba[idx + 2] = 10; rgba[idx + 3] = 255;
          mask[y * w + x] = 255;
        } else {
          rgba[idx] = 0; rgba[idx + 1] = 0; rgba[idx + 2] = 250; rgba[idx + 3] = 255;
          mask[y * w + x] = 0;
        }
        heightMap[y * w + x] = x === 6 && y === 6 ? 1.0 : 0.2;
      }
    }

    const blurRes = runWasm64FilterOrWarp(mod64, {
      kind: "gaussian-blur-masked", rgba, width: w, height: h, sigma: 2.0, selectionMask: mask,
    });
    expect(blurRes.boundaryBleedPixels).toBe(0);
    for (let y = 0; y < h; y += 1) {
      for (let x = 6; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        expect(Array.from(blurRes.rgba!.subarray(idx, idx + 4))).toEqual([0, 0, 250, 255]);
      }
    }

    const unsharpRes = runWasm64FilterOrWarp(mod64, {
      kind: "unsharp-mask", rgba, width: w, height: h, sigma: 1.2, amount: 1.5, threshold: 2,
    });
    expect(unsharpRes.backendMode).toBe("wasm64-native");
    expect(unsharpRes.modifiedPixels).toBeGreaterThan(0);

    const impastoRes = runWasm64FilterOrWarp(mod64, {
      kind: "impasto-sobel", rgba, heightMap, width: w, height: h, reliefStrength: 2.0,
    });
    expect(impastoRes.rgba?.length).toBe(rgba.length);

    // 45도 순수 강체 회전 + 평행이동 복원 검증
    const rad = Math.PI / 4;
    const tx = 14;
    const ty = -6;
    const rot = (p: readonly [number, number]): readonly [number, number] => [
      p[0] * Math.cos(rad) - p[1] * Math.sin(rad) + tx,
      p[0] * Math.sin(rad) + p[1] * Math.cos(rad) + ty,
    ];
    const verts: ReadonlyArray<readonly [number, number]> = [[0, 0], [100, 0], [50, 50], [100, 100]];
    const warpRes = runWasm64FilterOrWarp(mod64, {
      kind: "mls-rigid-warp",
      vertices: verts,
      pins: [[0, 0], [100, 0], [0, 100], [100, 100]].map((r) => ({ rest: r as [number, number], target: rot(r as [number, number]) })),
      alpha: 1.0,
    });
    expect(warpRes.maxPinErrorPx ?? 1).toBeLessThan(1e-4);
    const center = warpRes.warpedVertices![2]!;
    const expectedCenter = rot([50, 50]);
    expect(Math.hypot(center[0] - expectedCenter[0], center[1] - expectedCenter[1])).toBeLessThan(1e-3);
  });
});

describe("StudioWasm64EngineHubPanel: UI 인터랙션 · KO/EN · Calm Atelier 위생 계약", () => {
  it("props 없이 기본 렌더링되며 memory64 배지·필터 전환·PSB 파서·비동기 히스토리 실측이 동작한다", async () => {
    const onBenchmarkComplete = vi.fn();
    render(<StudioWasm64EngineHubPanel onBenchmarkComplete={onBenchmarkComplete} />);

    expect(screen.getByTestId("wasm64-backend-badge").textContent).toContain("Memory64");
    expect(screen.getByTestId("wasm64-tile-highwater").textContent).toContain("0x1");

    // 필터 모드 전환 (경계차단 블러 -> 번짐 0 px 검증)
    fireEvent.click(screen.getByTestId("wasm64-filter-mode-gaussian-blur-masked"));
    expect(screen.getByTestId("wasm64-filter-bleed").textContent).toContain("0 px");

    // PSD 4K <-> PSB 40K 전환
    fireEvent.click(screen.getByTestId("wasm64-psd-sample-psd-4k"));
    expect(screen.getByTestId("wasm64-psd-details").textContent).toContain("4096×8192");
    fireEvent.click(screen.getByTestId("wasm64-psd-sample-psb-40k"));
    expect(screen.getByTestId("wasm64-psd-details").textContent).toContain("40000×30000");

    // 슬라이더 조작
    fireEvent.change(screen.getByTestId("wasm64-tile-budget-slider"), { target: { value: "6" } });
    expect(screen.getByTestId("wasm64-tile-counts").textContent).toContain("6 /");
    fireEvent.change(screen.getByTestId("wasm64-bezier-tolerance-slider"), { target: { value: "0.5" } });

    // 전 커널 실측 실행 및 비동기 히스토리 PASS 확인
    fireEvent.click(screen.getByTestId("wasm64-run-all-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("wasm64-history-result").textContent).toContain("PASS");
    });
    expect(onBenchmarkComplete).toHaveBeenCalledTimes(1);
  });

  it("영어 로케일(en) 전환 시 한글 없이 영어 라벨과 지표만 정상 출력된다", async () => {
    const { container } = render(<StudioWasm64EngineHubPanel locale="en" />);
    expect(screen.getByTestId("wasm64-backend-badge").textContent).toContain("Memory64 Native");
    expect(screen.getByTestId("wasm64-run-all-btn").textContent).toContain("Run All Benchmarks");
    fireEvent.click(screen.getByTestId("wasm64-run-history-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("wasm64-history-result").textContent).toContain("Lossless Match");
    });
    expect(container.textContent).not.toMatch(/[가-힣]/);
  });

  it("Calm Atelier 위생 계약(460줄/750줄 이하·원시 색상 0건·transition-all 0건·배럴 금지)을 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/wasm64-drawing-engine");
    expect(existsSync(path.join(dir, "index.ts"))).toBe(false);

    const panelPath = path.join(dir, "StudioWasm64EngineHubPanel.tsx");
    const panelSource = readFileSync(panelPath, "utf8");
    const panelLines = panelSource.split(/\r?\n/).length;
    expect(panelLines).toBeLessThanOrEqual(460);
    expect(panelSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(panelSource).not.toMatch(/\brgba?\s*\(/i);
    expect(panelSource).not.toMatch(/\bhsla?\s*\(/i);
    expect(panelSource).not.toContain("transition-all");
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");

    for (const file of ["wasm64-drawing-binary.ts", "wasm64-drawing-algorithms.ts", "wasm64-drawing-kernels.ts"]) {
      const lines = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(750);
    }
  });
});
