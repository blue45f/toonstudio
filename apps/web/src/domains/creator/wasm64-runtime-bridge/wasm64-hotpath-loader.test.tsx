// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  benchmarkWasm64VsJsHotpaths,
  createHotpathBenchmarkFixtures,
  createStudioWasm64HotpathFromBytes,
  createStudioWasm64JsFallbackRuntime,
  loadStudioWasm64HotpathRuntime,
  StudioWasm64HotpathPanel,
  WASM64_HOTPATH_EXPECTED_ABI,
  WASM64_HOTPATH_EXPECTED_CAPABILITIES,
  type StudioWasm64HotpathRuntime,
} from "./index";

const REPO_ROOT = path.resolve(process.cwd());
const PUBLIC_WASM_PATH = path.join(REPO_ROOT, "apps/web/public/wasm/studio-wasm64-drawing-core.wasm");
const BRIDGE_DIR = path.join(REPO_ROOT, "apps/web/src/domains/creator/wasm64-runtime-bridge");

function loadRealWasmBytes(): Uint8Array {
  expect(existsSync(PUBLIC_WASM_PATH)).toBe(true);
  const raw = readFileSync(PUBLIC_WASM_PATH);
  return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

function packRgbaLe(r: number, g: number, b: number, a: number): number {
  return ((r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16) | ((a & 0xff) << 24)) >>> 0;
}

function unpackRgbaLe(packed: number): readonly [number, number, number, number] {
  return [
    packed & 0xff,
    (packed >>> 8) & 0xff,
    (packed >>> 16) & 0xff,
    (packed >>> 24) & 0xff,
  ];
}

function maxChannelDiff(a: Uint8Array, b: Uint8Array): number {
  expect(a.length).toBe(b.length);
  let maxDiff = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (d > maxDiff) maxDiff = d;
  }
  return maxDiff;
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("실물 Rust studio-wasm64-drawing-core.wasm 런타임 핫패스 브리지", () => {
  it("실제 컴파일된 .wasm 파일 바이트(< 48 KiB)를 WebAssembly.instantiate로 로드해 ABI·기능 비트마스크를 검증한다", async () => {
    const wasmBytes = loadRealWasmBytes();
    expect(wasmBytes[0]).toBe(0x00);
    expect(wasmBytes[1]).toBe(0x61);
    expect(wasmBytes[2]).toBe(0x73);
    expect(wasmBytes[3]).toBe(0x6d);
    expect(wasmBytes.byteLength).toBeGreaterThan(1024);
    expect(wasmBytes.byteLength).toBeLessThan(48 * 1024);

    const runtime = await createStudioWasm64HotpathFromBytes(wasmBytes);
    try {
      const meta = runtime.getMetadata();
      expect(meta.backendMode).toBe("rust-wasm");
      expect(meta.wasmByteLength).toBe(wasmBytes.byteLength);
      expect(meta.abiVersion).toBe(WASM64_HOTPATH_EXPECTED_ABI);
      expect(meta.capabilitiesMask).toBe(WASM64_HOTPATH_EXPECTED_CAPABILITIES);
      expect(meta.linearMemoryBytes).toBeGreaterThanOrEqual(65536);
      expect(meta.fallbackReason).toBeNull();
    } finally {
      runtime.dispose();
    }
  });

  it("512² 언샤프 마스크·2.5D 임파스토·선택 경계 가우시안 블러가 실제 Rust Wasm과 JS 폴백에서 바이트 단위 동등하다", async () => {
    const wasmBytes = loadRealWasmBytes();
    const runtime = await createStudioWasm64HotpathFromBytes(wasmBytes);
    try {
      // 1) 512² 실물 해상도 언샤프 마스크 (선형 메모리 제로카피 뷰 + JS 폴백 바이트 일치)
      const fixtures = createHotpathBenchmarkFixtures(512, 512);
      const zeroCopyRes = runtime.runZeroCopyUnsharp((view) => view.set(fixtures.rgba), 512, 512, {
        sigma: 1.4,
        amount: 1.25,
        threshold: 2,
      });
      const wasmUnsharpCopy = new Uint8Array(zeroCopyRes.outputView);
      const jsUnsharp = runtime.unsharpMaskRgba(fixtures.rgba, 512, 512, {
        sigma: 1.4,
        amount: 1.25,
        threshold: 2,
        forceBackend: "js-fallback",
      });
      expect(zeroCopyRes.backendMode).toBe("rust-wasm");
      expect(zeroCopyRes.modifiedPixels).toBeGreaterThan(0);
      expect(zeroCopyRes.modifiedPixels).toBe(jsUnsharp.modifiedPixels);
      expect(maxChannelDiff(wasmUnsharpCopy, jsUnsharp.output)).toBe(0);

      // 2) 512² 2.5D 임파스토 Sobel 법선 셰이딩 (투명 픽셀 보존 + Wasm vs JS 바이트 일치)
      const impastoInput = new Uint8Array(fixtures.rgba);
      impastoInput[0] = 11;
      impastoInput[1] = 22;
      impastoInput[2] = 33;
      impastoInput[3] = 0;
      const wasmImpasto = runtime.applyImpastoLightingRgba(impastoInput, fixtures.heightMap, 512, 512);
      const jsImpasto = runtime.applyImpastoLightingRgba(impastoInput, fixtures.heightMap, 512, 512, {
        forceBackend: "js-fallback",
      });
      expect(wasmImpasto.backendMode).toBe("rust-wasm");
      expect(wasmImpasto.shadedPixels).toBe(512 * 512 - 1);
      expect(wasmImpasto.shadedPixels).toBe(jsImpasto.shadedPixels);
      expect(Array.from(wasmImpasto.output.slice(0, 4))).toEqual([11, 22, 33, 0]);
      expect(maxChannelDiff(wasmImpasto.output, jsImpasto.output)).toBe(0);

      // 3) 선택 마스크 가우시안 블러 (선택 외부 번짐 0% + Wasm vs JS 바이트 일치)
      const w = 16;
      const h = 16;
      const maskedRgba = new Uint8Array(w * h * 4);
      const mask = new Uint8Array(w * h);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if (x < 8) {
            maskedRgba[i] = 240;
            maskedRgba[i + 1] = (x + y) % 2 === 0 ? 220 : 24;
            maskedRgba[i + 2] = 10;
            maskedRgba[i + 3] = 255;
            mask[y * w + x] = 255;
          } else {
            maskedRgba[i] = 0;
            maskedRgba[i + 1] = 0;
            maskedRgba[i + 2] = 250;
            maskedRgba[i + 3] = 255;
            mask[y * w + x] = 0;
          }
        }
      }
      const wasmBlur = runtime.gaussianBlurRgba(maskedRgba, w, h, { sigma: 1.8, selectionMask: mask });
      const jsBlur = runtime.gaussianBlurRgba(maskedRgba, w, h, {
        sigma: 1.8,
        selectionMask: mask,
        forceBackend: "js-fallback",
      });
      expect(wasmBlur.backendMode).toBe("rust-wasm");
      expect(maxChannelDiff(wasmBlur.output, jsBlur.output)).toBe(0);
      // 선택 외부 픽셀(x >= 8) 무손실 & 내부(x < 8) 파랑 유입 0% 확인
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if (x >= 8) {
            expect(Array.from(wasmBlur.output.slice(i, i + 4))).toEqual([0, 0, 250, 255]);
          } else {
            expect(wasmBlur.output[i + 2]).toBe(10);
          }
        }
      }
    } finally {
      runtime.dispose();
    }
  });

  it("Kubelka-Munk 16파장 분광 혼색·512² 타일 XOR 델타·FNV-1a 체크섬·종이 높이장이 Wasm과 JS 폴백 간 정합한다", async () => {
    const wasmBytes = loadRealWasmBytes();
    const runtime = await createStudioWasm64HotpathFromBytes(wasmBytes);
    try {
      const blue = packRgbaLe(24, 92, 214, 255);
      const yellow = packRgbaLe(245, 212, 28, 255);
      const wasmKm = runtime.mixPigmentsKm16Packed(blue, yellow, 0.5, "rust-wasm");
      const jsKm = runtime.mixPigmentsKm16Packed(blue, yellow, 0.5, "js-fallback");
      expect(wasmKm).toBe(jsKm);
      const [r, g, b, a] = unpackRgbaLe(wasmKm);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
      expect(a).toBe(255);

      const fixtures = createHotpathBenchmarkFixtures(512, 1024);
      const wasmStrip = runtime.mixPigmentsKm16Strip(fixtures.kmDstRgba, fixtures.kmSrcRgba, 0.5, "rust-wasm");
      const jsStrip = runtime.mixPigmentsKm16Strip(fixtures.kmDstRgba, fixtures.kmSrcRgba, 0.5, "js-fallback");
      expect(wasmStrip.processedPixels).toBe(1024);
      expect(maxChannelDiff(wasmStrip.output, jsStrip.output)).toBe(0);

      // 512² (1 MiB) 타일 XOR 델타 + FNV-1a 체크섬 무손실 복원
      const wasmXor = runtime.xorTileDeltaBytes(fixtures.rgba, fixtures.nextTileRgba, "rust-wasm");
      const jsXor = runtime.xorTileDeltaBytes(fixtures.rgba, fixtures.nextTileRgba, "js-fallback");
      expect(wasmXor.changedBytes).toBe(jsXor.changedBytes);
      expect(wasmXor.changedBytes).toBeGreaterThan(0);
      expect(wasmXor.checksumPrev).toBe(jsXor.checksumPrev);
      expect(wasmXor.checksumNext).toBe(jsXor.checksumNext);
      expect(wasmXor.checksumDelta).toBe(jsXor.checksumDelta);
      expect(maxChannelDiff(wasmXor.delta, jsXor.delta)).toBe(0);

      // prev ^ delta === next 무손실 역복원 검증
      const restored = new Uint8Array(fixtures.rgba.length);
      for (let i = 0; i < restored.length; i += 1) {
        restored[i] = (fixtures.rgba[i] ?? 0) ^ (wasmXor.delta[i] ?? 0);
      }
      expect(runtime.fnv1aChecksum(restored, "rust-wasm")).toBe(wasmXor.checksumNext);

      // 월드 좌표 고정 종이 높이장 일치 확인
      const hWasm = runtime.sampleWorldPaperHeight(128.5, -42.25, 24.0, 2026, "rust-wasm");
      const hJs = runtime.sampleWorldPaperHeight(128.5, -42.25, 24.0, 2026, "js-fallback");
      expect(hWasm).toBeGreaterThanOrEqual(0);
      expect(hWasm).toBeLessThanOrEqual(1);
      expect(Math.abs(hWasm - hJs)).toBeLessThan(1e-5);
    } finally {
      runtime.dispose();
    }
  });

  it("핫패스 라우팅 토글·fetch 배열버퍼 로드·비네트워크 JS 폴백 및 실측 Wasm vs JS 벤치마크를 검증한다", async () => {
    const wasmBytes = loadRealWasmBytes();

    // 1) fetch 배열버퍼 경로 로드 검증
    const mockFetch: typeof fetch = async () =>
      new Response(wasmBytes.slice().buffer, {
        status: 200,
        headers: {
          "content-type": "application/wasm",
          "content-length": String(wasmBytes.byteLength),
        },
      });
    const fetchedRuntime = await loadStudioWasm64HotpathRuntime({ fetchFn: mockFetch });
    try {
      expect(fetchedRuntime.getMetadata().backendMode).toBe("rust-wasm");
      expect(fetchedRuntime.getMetadata().wasmByteLength).toBe(wasmBytes.byteLength);

      // 라우팅 토글로 개별 커널만 JS로 우회 가능
      fetchedRuntime.setRouting({ unsharp512: false });
      const tiny = new Uint8Array(16 * 16 * 4).fill(128);
      const routedJs = fetchedRuntime.unsharpMaskRgba(tiny, 16, 16);
      const routedWasm = fetchedRuntime.xorTileDeltaBytes(tiny, tiny);
      expect(routedJs.backendMode).toBe("js-fallback");
      expect(routedWasm.backendMode).toBe("rust-wasm");

      // 실측 256² Wasm vs JS 벤치마크 정합성
      const suite = benchmarkWasm64VsJsHotpaths(fetchedRuntime, { dimension: 256, kmStripPixels: 512 });
      expect(suite.backendMode).toBe("rust-wasm");
      expect(suite.wasmByteLength).toBe(wasmBytes.byteLength);
      expect(suite.allByteExactMatch).toBe(true);
      expect(suite.entries).toHaveLength(4);
      for (const entry of suite.entries) {
        expect(entry.wasmMs).not.toBeNull();
        expect(entry.jsMs).toBeGreaterThanOrEqual(0);
        expect(entry.byteExactMatch).toBe(true);
        expect(entry.speedupRatio).toBeGreaterThan(0);
      }
    } finally {
      fetchedRuntime.dispose();
    }

    // 2) 오프라인/HTTP 503 환경에서 예외 없이 바이트 동등 JS 폴백
    const offlineRuntime = await loadStudioWasm64HotpathRuntime({
      fetchFn: async () => new Response(null, { status: 503 }),
    });
    expect(offlineRuntime.getMetadata().backendMode).toBe("js-fallback");
    expect(offlineRuntime.getMetadata().wasmByteLength).toBe(0);
    expect(offlineRuntime.getMetadata().fallbackReason).toContain("503");

    const jsOnly = createStudioWasm64JsFallbackRuntime();
    const jsSuite = benchmarkWasm64VsJsHotpaths(jsOnly, { dimension: 64, kmStripPixels: 128 });
    expect(jsSuite.backendMode).toBe("js-fallback");
    expect(jsSuite.allByteExactMatch).toBe(true);
  });
});

describe("StudioWasm64HotpathPanel UI · 상호작용 · Calm Atelier 정적 위생", () => {
  it("props 없이 단독 렌더 가능하고 실물 .wasm 바이트로 실측 벤치마크와 라우팅 토글이 동작한다", async () => {
    // 1) props 0개 단독 마운트 (비네트워크 환경에서도 에러 없이 폴백 표시)
    const { unmount } = render(<StudioWasm64HotpathPanel />);
    expect(screen.getByText("Rust Wasm64 런타임 핫패스 브리지")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("wasm64-hotpath-backend-badge")).toBeTruthy();
    });
    unmount();

    // 2) 실물 .wasm 바이너리 주입 렌더 + 벤치마크 실행 + 라우팅 토글 검증
    const wasmBytes = loadRealWasmBytes();
    const preloaded: StudioWasm64HotpathRuntime = await createStudioWasm64HotpathFromBytes(wasmBytes);
    try {
      render(
        <StudioWasm64HotpathPanel
          preloadedRuntime={preloaded}
          benchmarkDimension={128}
        />,
      );

      expect(screen.getByTestId("wasm64-hotpath-backend-badge").textContent).toContain("Rust Wasm 활성");
      expect(screen.getByTestId("wasm64-hotpath-byte-size").textContent).toContain(
        wasmBytes.byteLength.toLocaleString("en-US"),
      );
      expect(screen.getByTestId("wasm64-hotpath-route-count").textContent).toBe("5 / 5");

      // 라우팅 스위치 토글 검증
      const unsharpSwitch = screen.getByTestId("wasm64-route-toggle-unsharp512");
      expect(unsharpSwitch.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(unsharpSwitch);
      expect(unsharpSwitch.getAttribute("aria-checked")).toBe("false");
      expect(screen.getByTestId("wasm64-hotpath-route-count").textContent).toBe("4 / 5");
      expect(preloaded.getRouting().unsharp512).toBe(false);

      // 실측 Wasm vs JS 벤치마크 버튼 클릭 및 결과 표출 검증
      fireEvent.click(screen.getByTestId("wasm64-hotpath-run-benchmark"));
      expect(screen.getByTestId("wasm64-hotpath-speedup").textContent).toMatch(/×$/u);
      expect(screen.getByTestId("wasm64-hotpath-parity-badge").textContent).toContain("0 diff");
    } finally {
      preloaded.dispose();
    }
  });

  it("신규 브리지 소스 파일은 원시 색상·웹 스토리지·800줄 상한을 위반하지 않는다", () => {
    const panelSrc = readFileSync(path.join(BRIDGE_DIR, "StudioWasm64HotpathPanel.tsx"), "utf8");
    const allSources = [
      panelSrc,
      readFileSync(path.join(BRIDGE_DIR, "wasm64-hotpath-loader.ts"), "utf8"),
      readFileSync(path.join(BRIDGE_DIR, "wasm64-hotpath-js-fallback.ts"), "utf8"),
      readFileSync(path.join(BRIDGE_DIR, "wasm64-hotpath-types.ts"), "utf8"),
      readFileSync(path.join(BRIDGE_DIR, "wasm64-hotpath-benchmark.ts"), "utf8"),
      readFileSync(path.join(BRIDGE_DIR, "index.ts"), "utf8"),
    ];

    // 원시 hex/rgb/hsl 색상 및 transition-all 금지
    expect(panelSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(panelSrc).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/u);
    expect(panelSrc).not.toContain("transition-all");

    // localStorage / sessionStorage 금지 및 전 파일 800줄 이하
    for (const src of allSources) {
      expect(src).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
      expect(src.split("\n").length).toBeLessThanOrEqual(800);
    }
  });
});
