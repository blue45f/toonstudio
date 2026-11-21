// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChromeWasm64PerformancePanel } from "../ChromeWasm64PerformancePanel";
import type { ChromeNextGenProbeEnv } from "../chrome-nextgen-platform-accelerator";
import { WASM_MEMORY64_LIMITS_FLAG } from "../wasm64-raster-binary-builder";

afterEach(cleanup);

function makeNonMemory64Host(): typeof WebAssembly {
  return {
    ...WebAssembly,
    Module: WebAssembly.Module,
    Instance: WebAssembly.Instance,
    Memory: WebAssembly.Memory,
    validate(bytes: BufferSource): boolean {
      const view = ArrayBuffer.isView(bytes)
        ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : new Uint8Array(bytes);
      for (let i = 8; i < Math.min(view.length, 48); i += 1) {
        if (view[i] === WASM_MEMORY64_LIMITS_FLAG) return false;
      }
      return WebAssembly.validate(bytes);
    },
  } as typeof WebAssembly;
}

describe("ChromeWasm64PerformancePanel", () => {
  it("초기에는 가짜 수치를 표시하지 않고 8종 차세대 기술 점검을 정직하게 렌더링한다", () => {
    render(<ChromeWasm64PerformancePanel />);

    expect(
      screen.getByRole("heading", { name: /초고속 엔진 · 메모리64 부스트/u }),
    ).toBeTruthy();
    expect(screen.getByText(/아직 측정 전입니다/u)).toBeTruthy();
    expect(screen.queryByTestId("wasm64-total-ms")).toBeNull();
    expect(screen.queryByTestId("wasm64-throughput-mpix")).toBeNull();

    // 8종 Chrome 신기술 항목 전부 렌더링
    const items = screen.getByRole("list", { name: /크롬 차세대 웹 가속 기술 목록/u }).children;
    expect(items).toHaveLength(8);
    expect(screen.getByTestId("wasm64-address-mode").textContent).toContain("i64 64비트");
  });

  it("성능 지금 측정해 보기 클릭 시 실제 Wasm64 512×512 커널을 돌려 실측 ms·MPix/s·i64 모드를 표시한다", () => {
    render(<ChromeWasm64PerformancePanel />);

    const runButton = screen.getByTestId("wasm64-run-benchmark-btn");
    fireEvent.click(runButton);

    const totalMsText = screen.getByTestId("wasm64-total-ms").textContent ?? "";
    const throughputText = screen.getByTestId("wasm64-throughput-mpix").textContent ?? "";
    const backendText = screen.getByTestId("wasm64-measured-backend").textContent ?? "";

    expect(totalMsText).toMatch(/^\d+\.\d{2} ms$/u);
    expect(throughputText).toMatch(/^\d+\.\d MPix\/s$/u);
    expect(backendText).toContain("Memory64 (i64 네이티브)");

    // 4단계 실측 파이프라인 라벨 및 262,144px 검증 체크섬 확인
    const resultsBox = screen.getByTestId("wasm64-benchmark-results");
    expect(resultsBox.textContent).toContain("서브픽셀 브러시 댑 스탬핑");
    expect(resultsBox.textContent).toContain("Source-Over 레이어 합성");
    expect(resultsBox.textContent).toContain("웹툰 그림자 곱하기(Multiply) 합성");
    expect(resultsBox.textContent).toContain("256×3 RGB 톤 LUT 변환");
    expect(resultsBox.textContent).toContain("262,144 px");
    expect(resultsBox.textContent).toMatch(/체크섬 0x[0-9a-f]{8}/u);
  });

  it("풀 Chrome 8/8 환경 프로브에서 Chrome 최대 가속 배지와 8 / 8 활성 카운트를 표시한다", async () => {
    const fullEnv: ChromeNextGenProbeEnv = {
      webAssembly: WebAssembly,
      gpu: {
        async requestAdapter() {
          return {
            features: { has: () => true },
            limits: { maxBufferSize: 1024 * 1024 * 1024 },
          };
        },
      },
      matchMedia: () => ({ matches: true }),
      createCanvas: () => ({
        getContext: () => ({
          getContextAttributes: () => ({
            colorSpace: "display-p3",
            desynchronized: true,
          }),
        }),
      }),
      hasPointerRawUpdate: true,
      hasCoalescedEvents: true,
      hasPredictedEvents: true,
      crossOriginIsolated: true,
      hasSharedArrayBuffer: true,
      hasAtomics: true,
      hardwareConcurrency: 16,
      hasOpfsGetDirectory: true,
      hasOpfsSyncAccessHandle: true,
      hasVideoEncoder: true,
      hasImageDecoder: true,
      hasPressureObserver: true,
      hasShowSaveFilePicker: true,
    };

    render(<ChromeWasm64PerformancePanel probeEnv={fullEnv} />);
    await waitFor(() => {
      expect(screen.getByText("Chrome 최대 가속")).toBeTruthy();
    });
    expect(screen.getByTestId("chrome-nextgen-active-count").textContent).toContain("8 / 8");
    expect(screen.getByTestId("chrome-nextgen-active-count").textContent).toContain("Display-P3");
  });

  it("Memory64 미지원 구형 런타임에서는 안전 폴백 모드를 정직하게 표시하며 벤치마크를 완주한다", () => {
    const nonMemory64 = makeNonMemory64Host();
    render(
      <ChromeWasm64PerformancePanel
        probeEnv={{ webAssembly: nonMemory64, gpu: null, createCanvas: () => null }}
        engineOptions={{ webAssembly: nonMemory64 }}
      />,
    );

    expect(screen.getByTestId("wasm64-address-mode").textContent).toContain("표준 폴백");
    fireEvent.click(screen.getByTestId("wasm64-run-benchmark-btn"));
    expect(screen.getByTestId("wasm64-measured-backend").textContent).toContain(
      "안전 폴백 (JS TypedArray)",
    );
  });

  it("패널 CSS가 OKLCH 토큰만 사용하고 하드코딩 HEX·transition-all 없이 reduced-motion을 준수한다", () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        "apps/web/src/domains/creator/kernel/chrome-nextgen-wasm64-panel.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toMatch(/transition-all/u);
    expect(css).not.toMatch(/animate-(?:bounce|ping|spin)/u);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  });
});
