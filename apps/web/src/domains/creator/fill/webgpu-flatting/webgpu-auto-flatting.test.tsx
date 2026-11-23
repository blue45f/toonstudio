// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { WebGpuFlattingWorkbenchPanel } from "./WebGpuFlattingWorkbenchPanel";
import {
  benchmarkAutoFlattingThroughput,
  computeJumpFloodDistanceField,
  executeAutoFlattingSync,
  executeAutoFlattingWithGapClose,
  type AutoFlattingSeed,
} from "./webgpu-auto-flatting-engine";
import {
  buildDemoCharacterLineartScene,
  DEMO_FLATTING_PALETTE,
} from "./webgpu-flatting-demo-scene";
import {
  inspectWgslShaderContract,
  probeWebGpuComputeCapabilities,
  WGSL_FLATTING_SHADER_SPECS,
  WGSL_GAP_CLOSE_MORPH_SHADER,
  WGSL_JUMP_FLOOD_STEP_SHADER,
  WGSL_REGION_FLATTING_SHADER,
} from "./webgpu-flatting-wgsl-shaders";

const HANGUL_REGEX = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

function createSquareWithRightGap(params: {
  readonly size: number;
  readonly boxMin: number;
  readonly boxMax: number;
  readonly gapStartY: number;
  readonly gapEndY: number;
}): Uint8ClampedArray {
  const { size, boxMin, boxMax, gapStartY, gapEndY } = params;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const paintInk = (x: number, y: number): void => {
    const off = (y * size + x) * 4;
    rgba[off] = 24;
    rgba[off + 1] = 22;
    rgba[off + 2] = 20;
    rgba[off + 3] = 255;
  };

  for (let x = boxMin; x <= boxMax; x += 1) {
    paintInk(x, boxMin);
    paintInk(x, boxMax);
  }
  for (let y = boxMin; y <= boxMax; y += 1) {
    paintInk(boxMin, y);
    if (y >= gapStartY && y <= gapEndY) continue;
    paintInk(boxMax, y);
  }
  return rgba;
}

interface MockGpuBufferRecord {
  readonly data: ArrayBuffer;
  destroyed: boolean;
  readonly buffer: GPUBuffer;
}

function createRecordedMockGpuDevice(options?: { readonly subgroups?: boolean }): {
  readonly device: GPUDevice;
  readonly compiledShaders: string[];
  readonly pipelineEntries: string[];
  readonly dispatchCalls: { readonly x: number; readonly y: number; readonly z: number }[];
  readonly buffers: MockGpuBufferRecord[];
} {
  const compiledShaders: string[] = [];
  const pipelineEntries: string[] = [];
  const dispatchCalls: { readonly x: number; readonly y: number; readonly z: number }[] = [];
  const buffers: MockGpuBufferRecord[] = [];
  const bufferLookup = new WeakMap<GPUBuffer, MockGpuBufferRecord>();

  const deviceLike = {
    features: new Set<string>(options?.subgroups ? ["subgroups"] : []),
    createShaderModule: ({ code }: GPUShaderModuleDescriptor): GPUShaderModule => {
      compiledShaders.push(code);
      return {} as GPUShaderModule;
    },
    createComputePipeline: (desc: GPUComputePipelineDescriptor): GPUComputePipeline => {
      pipelineEntries.push(desc.compute.entryPoint ?? "");
      return {
        getBindGroupLayout: () => ({}) as GPUBindGroupLayout,
      } as unknown as GPUComputePipeline;
    },
    createBuffer: (desc: GPUBufferDescriptor): GPUBuffer => {
      const data = new ArrayBuffer(Math.max(4, desc.size));
      const record: MockGpuBufferRecord = {
        data,
        destroyed: false,
        buffer: {} as GPUBuffer,
      };
      const gpuBuf = {
        size: desc.size,
        usage: desc.usage,
        mapAsync: () => Promise.resolve(),
        getMappedRange: (offset = 0, size = data.byteLength) =>
          record.data.slice(offset, offset + size),
        unmap: () => undefined,
        destroy: () => {
          record.destroyed = true;
        },
      } as unknown as GPUBuffer;
      (record as { buffer: GPUBuffer }).buffer = gpuBuf;
      buffers.push(record);
      bufferLookup.set(gpuBuf, record);
      return gpuBuf;
    },
    createBindGroup: (): GPUBindGroup => ({}) as GPUBindGroup,
    createCommandEncoder: (): GPUCommandEncoder =>
      ({
        beginComputePass: (): GPUComputePassEncoder =>
          ({
            setPipeline: () => undefined,
            setBindGroup: () => undefined,
            dispatchWorkgroups: (x: number, y = 1, z = 1) => {
              dispatchCalls.push({ x, y, z });
            },
            end: () => undefined,
          }) as unknown as GPUComputePassEncoder,
        copyBufferToBuffer: (
          src: GPUBuffer,
          srcOff: number,
          dst: GPUBuffer,
          dstOff: number,
          size: number,
        ) => {
          const sRec = bufferLookup.get(src);
          const dRec = bufferLookup.get(dst);
          if (sRec && dRec) {
            new Uint8Array(dRec.data, dstOff, size).set(new Uint8Array(sRec.data, srcOff, size));
          }
        },
        finish: () => ({}) as GPUCommandBuffer,
      }) as unknown as GPUCommandEncoder,
    queue: {
      writeBuffer: (
        dst: GPUBuffer,
        dstOffset: number,
        data: ArrayBufferView | ArrayBuffer,
      ) => {
        const rec = bufferLookup.get(dst);
        if (!rec) return;
        const srcBytes =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        new Uint8Array(rec.data, dstOffset, srcBytes.byteLength).set(srcBytes);
      },
      submit: () => undefined,
    },
  } as unknown as GPUDevice;

  return {
    device: deviceLike,
    compiledShaders,
    pipelineEntries,
    dispatchCalls,
    buffers,
  };
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
  vi.restoreAllMocks();
});

describe("1. WGSL Compute 셰이더 3종 계약 및 WebGPU Subgroups 프로브", () => {
  it("3종 WGSL 셰이더 모두 @compute · @workgroup_size(16, 16) · @group(0) · @binding 및 괄호 정합을 충족한다", () => {
    expect(WGSL_FLATTING_SHADER_SPECS).toHaveLength(3);

    const morphCheck = inspectWgslShaderContract(WGSL_GAP_CLOSE_MORPH_SHADER);
    expect(morphCheck.valid).toBe(true);
    expect(morphCheck.hasComputeAttribute).toBe(true);
    expect(morphCheck.hasWorkgroup16x16).toBe(true);
    expect(morphCheck.hasGroupZero).toBe(true);
    expect(morphCheck.bindingIndices).toEqual([0, 1, 2, 3]);
    expect(morphCheck.entryPoints).toEqual(["gap_close_dilate", "gap_close_erode"]);

    const jfaCheck = inspectWgslShaderContract(WGSL_JUMP_FLOOD_STEP_SHADER);
    expect(jfaCheck.valid).toBe(true);
    expect(jfaCheck.bindingIndices).toEqual([0, 1, 2, 3]);
    expect(jfaCheck.entryPoints).toEqual(["jump_flood_step"]);

    const flatCheck = inspectWgslShaderContract(WGSL_REGION_FLATTING_SHADER);
    expect(flatCheck.valid).toBe(true);
    expect(flatCheck.bindingIndices).toEqual([0, 1, 2, 3, 4]);
    expect(flatCheck.entryPoints).toEqual(["flatting_region_fill"]);
  });

  it("probeWebGpuComputeCapabilities는 navigator.gpu 미지원 및 가용 어댑터(subgroups 포함)를 안전하게 프로브한다", async () => {
    const missing = await probeWebGpuComputeCapabilities({ gpu: null });
    expect(missing.available).toBe(false);
    expect(missing.hasNavigatorGpu).toBe(false);
    expect(missing.supportsSubgroups).toBe(false);
    expect(missing.recommendedBackend).toBe("typed-array-fallback");
    expect(missing.reasonCode).toBe("navigator_gpu_missing");

    const mockGpu = {
      requestAdapter: vi.fn().mockResolvedValue({
        features: new Set<string>(["subgroups", "timestamp-query"]),
        limits: {
          maxComputeWorkgroupSizeX: 256,
          maxComputeWorkgroupSizeY: 256,
          maxComputeInvocationsPerWorkgroup: 256,
          maxStorageBufferBindingSize: 128 * 1024 * 1024,
          maxBufferSize: 256 * 1024 * 1024,
        },
        info: {
          vendor: "apple",
          architecture: "metal-3",
          description: "Apple M-Series GPU",
        },
      }),
    } as unknown as GPU;

    const ready = await probeWebGpuComputeCapabilities({ gpu: mockGpu });
    expect(ready.available).toBe(true);
    expect(ready.supportsSubgroups).toBe(true);
    expect(ready.supportsTimestampQuery).toBe(true);
    expect(ready.maxComputeWorkgroupSizeX).toBe(256);
    expect(ready.maxStorageBufferBindingSize).toBe(128 * 1024 * 1024);
    expect(ready.adapterName).toBe("Apple M-Series GPU");
    expect(ready.recommendedBackend).toBe("webgpu-compute");
    expect(ready.reasonCode).toBe("ready");

    const failingGpu = {
      requestAdapter: vi.fn().mockRejectedValue(new Error("adapter error")),
    } as unknown as GPU;
    const failed = await probeWebGpuComputeCapabilities({ gpu: failingGpu });
    expect(failed.available).toBe(false);
    expect(failed.reasonCode).toBe("probe_error");
  });
});

describe("2. 8px 열린 선화 틈새 누수 차단(0px→6px) · 내부 100% 채색 · 1px 트랩 증명", () => {
  it("8px 열린 틈새에서 gapClosePx=0이면 외부로 누수되고, gapClosePx=6이면 누수 0px 봉합 및 내부 100% 채색된다", async () => {
    const size = 64;
    const boxMin = 16;
    const boxMax = 47;
    // 우측 벽(x=47)의 y=28..35 (정확히 8px) 개방
    const lineartRgba = createSquareWithRightGap({
      size,
      boxMin,
      boxMax,
      gapStartY: 28,
      gapEndY: 35,
    });
    const seeds: readonly AutoFlattingSeed[] = [
      { id: 1, label: "skin", x: 32, y: 32, color: DEMO_FLATTING_PALETTE.skin },
    ];

    const leaked = await executeAutoFlattingWithGapClose({
      lineartRgba,
      width: size,
      height: size,
      gapClosePx: 0,
      seeds,
      preferWebGpu: false,
    });
    expect(leaked.backend).toBe("typed-array-fallback");
    expect(leaked.leakedToBorder).toBe(true);
    expect(leaked.leakedPixelCount).toBeGreaterThan(2000);
    expect(leaked.leakBlockRatePct).toBe(0);
    expect(leaked.regionMap[2 * size + 2]).toBe(1);

    const sealed = await executeAutoFlattingWithGapClose({
      lineartRgba,
      width: size,
      height: size,
      gapClosePx: 6,
      seeds,
      preferWebGpu: false,
    });
    expect(sealed.leakedToBorder).toBe(false);
    expect(sealed.leakedPixelCount).toBe(0);
    expect(sealed.leakBlockRatePct).toBe(100);
    expect(sealed.bridgedPixelCount).toBeGreaterThanOrEqual(8);
    expect(sealed.underStrokeTrappedPixelCount).toBeGreaterThan(0);

    // 내부 (17..46 × 17..46 = 900px) 100% 채색 검증
    let interiorFilled = 0;
    const interiorTotal = (boxMax - boxMin - 1) * (boxMax - boxMin - 1);
    for (let y = boxMin + 1; y < boxMax; y += 1) {
      for (let x = boxMin + 1; x < boxMax; x += 1) {
        const idx = y * size + x;
        if (sealed.regionMap[idx] === 1) interiorFilled += 1;
        const off = idx * 4;
        expect(sealed.flattingRgba[off]).toBe(DEMO_FLATTING_PALETTE.skin[0]);
        expect(sealed.flattingRgba[off + 1]).toBe(DEMO_FLATTING_PALETTE.skin[1]);
        expect(sealed.flattingRgba[off + 2]).toBe(DEMO_FLATTING_PALETTE.skin[2]);
        expect(sealed.flattingRgba[off + 3]).toBe(255);
      }
    }
    expect(interiorFilled).toBe(interiorTotal);

    // 외부 (box 바깥 모든 픽셀) 누수 0px 검증
    let exteriorFilled = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const isOutside = x < boxMin || x > boxMax || y < boxMin || y > boxMax;
        if (!isOutside) continue;
        const idx = y * size + x;
        if ((sealed.regionMap[idx] ?? 0) !== 0 || (sealed.flattingRgba[idx * 4 + 3] ?? 0) !== 0) {
          exteriorFilled += 1;
        }
      }
    }
    expect(exteriorFilled).toBe(0);

    // 영역별 바운딩 박스 검증
    expect(sealed.regions).toHaveLength(1);
    expect(sealed.regions[0]?.boundingBox).toEqual({
      minX: 17,
      minY: 17,
      maxX: 46,
      maxY: 46,
      width: 30,
      height: 30,
    });
  });

  it("데모 웹툰 캐릭터 선화(머리·피부·의상 3영역)도 gapClosePx=0 누수 → gapClosePx=6 100% 봉합을 재현한다", () => {
    const scene = buildDemoCharacterLineartScene("portrait-open-gaps", 224);
    const leaked = executeAutoFlattingSync({
      lineartRgba: scene.lineartRgba,
      width: scene.width,
      height: scene.height,
      gapClosePx: 0,
      seeds: scene.seeds,
    });
    expect(leaked.leakedToBorder).toBe(true);
    expect(leaked.leakedPixelCount).toBeGreaterThan(0);

    const sealed = executeAutoFlattingSync({
      lineartRgba: scene.lineartRgba,
      width: scene.width,
      height: scene.height,
      gapClosePx: 6,
      seeds: scene.seeds,
    });
    expect(sealed.leakedToBorder).toBe(false);
    expect(sealed.leakedPixelCount).toBe(0);
    expect(sealed.leakBlockRatePct).toBe(100);
    expect(sealed.regions).toHaveLength(3);
    for (const region of sealed.regions) {
      expect(region.leakedToBorder).toBe(false);
      expect(region.filledPixelCount).toBeGreaterThan(300);
      expect(region.boundingBox).not.toBeNull();
    }
  });
});

describe("3. JFA 거리장 정확도 · WebGPU Compute 디스패치 · 0×0/1×1 방어 · 벤치마크", () => {
  it("computeJumpFloodDistanceField는 다중 시드 64×64 격자에서 유클리드 거리 정확도 오차 0.01px 이내를 달성한다", () => {
    const w = 64;
    const h = 64;
    const mask = new Uint8Array(w * h);
    const seedPoints = [
      { x: 7, y: 9 },
      { x: 52, y: 14 },
      { x: 31, y: 35 },
      { x: 12, y: 55 },
      { x: 58, y: 57 },
    ];
    for (const pt of seedPoints) {
      mask[pt.y * w + pt.x] = 1;
    }

    const jfa = computeJumpFloodDistanceField(mask, w, h);
    expect(jfa.passCount).toBe(7); // log2(64) = 6 + JFA+1

    let maxErr = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let exactMin = Number.POSITIVE_INFINITY;
        for (const pt of seedPoints) {
          const d = Math.hypot(x - pt.x, y - pt.y);
          if (d < exactMin) exactMin = d;
        }
        const got = jfa.distancePx[y * w + x] ?? Number.POSITIVE_INFINITY;
        const err = Math.abs(got - exactMin);
        if (err > maxErr) maxErr = err;
      }
    }
    expect(maxErr).toBeLessThan(0.01);
  });

  it("WebGPU GPUDevice 가용 시 3종 WGSL 셰이더 컴파일·디스패치 후 모든 GPUBuffer를 누수 없이 해제한다", async () => {
    const mock = createRecordedMockGpuDevice({ subgroups: true });
    const size = 32;
    const lineartRgba = createSquareWithRightGap({
      size,
      boxMin: 6,
      boxMax: 25,
      gapStartY: 13,
      gapEndY: 17,
    });

    const result = await executeAutoFlattingWithGapClose({
      lineartRgba,
      width: size,
      height: size,
      gapClosePx: 4,
      seeds: [{ id: 1, label: "skin", x: 15, y: 15, color: DEMO_FLATTING_PALETTE.skin }],
      preferWebGpu: true,
      gpuDevice: mock.device,
    });

    expect(result.backend).toBe("webgpu-compute");
    expect(result.subgroupsUsed).toBe(true);
    expect(mock.compiledShaders).toEqual([
      WGSL_GAP_CLOSE_MORPH_SHADER,
      WGSL_JUMP_FLOOD_STEP_SHADER,
      WGSL_REGION_FLATTING_SHADER,
    ]);
    expect(mock.pipelineEntries).toEqual([
      "gap_close_dilate",
      "gap_close_erode",
      "jump_flood_step",
      "flatting_region_fill",
    ]);
    expect(mock.dispatchCalls.length).toBeGreaterThanOrEqual(4);
    expect(mock.dispatchCalls[0]).toEqual({ x: 2, y: 2, z: 1 });
    expect(mock.buffers.length).toBeGreaterThan(0);
    expect(mock.buffers.every((b) => b.destroyed)).toBe(true);
  });

  it("0×0 / 1×1 경계 캔버스와 비정상 파라미터를 예외 없이 안전하게 방어한다", async () => {
    const empty = await executeAutoFlattingWithGapClose({
      lineartRgba: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
      gapClosePx: Number.NaN,
      seeds: [{ id: 1, x: 0, y: 0, color: DEMO_FLATTING_PALETTE.hair }],
      preferWebGpu: false,
    });
    expect(empty.width).toBe(0);
    expect(empty.height).toBe(0);
    expect(empty.filledPixelCount).toBe(0);
    expect(empty.leakBlockRatePct).toBe(100);

    const singlePixel = await executeAutoFlattingWithGapClose({
      lineartRgba: new Uint8ClampedArray([255, 255, 255, 0]),
      width: 1,
      height: 1,
      gapClosePx: 99,
      seeds: [
        { id: 1, x: 0, y: 0, color: DEMO_FLATTING_PALETTE.outfit },
        { id: 2, x: 10, y: -3, color: DEMO_FLATTING_PALETTE.hair },
      ],
      preferWebGpu: false,
    });
    expect(singlePixel.width).toBe(1);
    expect(singlePixel.height).toBe(1);
    expect(singlePixel.appliedGapClosePx).toBe(16);
    expect(singlePixel.filledPixelCount).toBe(1);
    expect(singlePixel.regions[1]?.filledPixelCount).toBe(0);
    expect(singlePixel.regions[1]?.boundingBox).toBeNull();

    const jfaEmpty = computeJumpFloodDistanceField(new Uint8Array(0), 0, 0);
    expect(jfaEmpty.passCount).toBe(0);
    const jfaSingle = computeJumpFloodDistanceField(new Uint8Array([1]), 1, 1);
    expect(jfaSingle.distancePx[0]).toBe(0);
  });

  it("benchmarkAutoFlattingThroughput(512 / 1024)는 실제 처리 시간(ms)과 초당 메가픽셀(MP/s)을 산출한다", () => {
    const bench512 = benchmarkAutoFlattingThroughput(512, 6);
    expect(bench512.sizePx).toBe(512);
    expect(bench512.totalPixels).toBe(512 * 512);
    expect(bench512.durationMs).toBeGreaterThanOrEqual(0);
    expect(bench512.megapixelsPerSec).toBeGreaterThan(0);
    expect(bench512.leakedPixelCount).toBe(0);
    expect(bench512.filledPixelCount).toBeGreaterThan(100_000);

    const bench1024 = benchmarkAutoFlattingThroughput(1024, 6);
    expect(bench1024.sizePx).toBe(1024);
    expect(bench1024.totalPixels).toBe(1024 * 1024);
    expect(bench1024.durationMs).toBeGreaterThanOrEqual(0);
    expect(bench1024.megapixelsPerSec).toBeGreaterThan(0);
    expect(bench1024.leakedPixelCount).toBe(0);
    expect(bench1024.filledPixelCount).toBeGreaterThan(400_000);
  });
});

describe("4. WebGpuFlattingWorkbenchPanel 인터랙션 · EN 한글 0자 · 소스 위생 게이트", () => {
  it("gapClosePx 슬라이더를 0→6으로 조절하면 누수 차단율과 외부 누수 픽셀이 실시간 갱신되고 벤치마크가 동작한다", async () => {
    render(<WebGpuFlattingWorkbenchPanel initialGapClosePx={6} />);

    await waitFor(() => {
      expect(screen.getByTestId("wgf-capabilities-list")).toBeTruthy();
    });

    expect(screen.getByTestId("wgf-gap-value").textContent).toBe("6 px");
    expect(screen.getByTestId("wgf-leak-block-rate").textContent).toBe("100%");
    expect(screen.getByTestId("wgf-leaked-pixels").textContent).toBe("0 px");
    expect(screen.getByTestId("wgf-region-hair")).toBeTruthy();
    expect(screen.getByTestId("wgf-region-skin")).toBeTruthy();
    expect(screen.getByTestId("wgf-region-outfit")).toBeTruthy();

    // 슬라이더를 0px로 이동하면 외부 누수가 즉시 감지된다.
    const slider = screen.getByTestId("wgf-gap-slider");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(screen.getByTestId("wgf-gap-value").textContent).toBe("0 px");
    expect(screen.getByTestId("wgf-leak-block-rate").textContent).not.toBe("100%");
    expect(screen.getByTestId("wgf-leaked-pixels").textContent).not.toBe("0 px");

    // 6px 퀵 버튼 클릭으로 다시 100% 봉합 복구
    fireEvent.click(screen.getByTestId("wgf-gap-preset-6"));
    expect(screen.getByTestId("wgf-leak-block-rate").textContent).toBe("100%");
    expect(screen.getByTestId("wgf-leaked-pixels").textContent).toBe("0 px");

    // 512×512 실측 벤치마크 실행
    fireEvent.click(screen.getByTestId("wgf-bench-512"));
    expect(screen.getByTestId("wgf-bench-output").textContent).toContain("512×512");
    expect(screen.getByTestId("wgf-bench-output").textContent).toContain("MP/s");
  });

  it("EN 모드에서는 모든 초기 상태·슬라이더·프리셋·벤치마크 출력에 한글이 단 1자도 노출되지 않는다", async () => {
    useI18n.getState().setLang("en");
    const { container } = render(<WebGpuFlattingWorkbenchPanel initialGapClosePx={6} />);

    await waitFor(() => {
      expect(screen.getByTestId("wgf-capabilities-list").textContent).toContain("TypedArray");
    });

    const assertZeroHangul = (phase: string): void => {
      expect(container.textContent ?? "", `${phase} textContent`).not.toMatch(HANGUL_REGEX);
      const ariaNodes = Array.from(container.querySelectorAll("[aria-label]"));
      for (const node of ariaNodes) {
        expect(node.getAttribute("aria-label") ?? "", `${phase} aria-label`).not.toMatch(
          HANGUL_REGEX,
        );
      }
      const inputs = Array.from(container.querySelectorAll("input"));
      for (const input of inputs) {
        expect(input.value, `${phase} input value`).not.toMatch(HANGUL_REGEX);
      }
    };

    assertZeroHangul("initial render");
    fireEvent.change(screen.getByTestId("wgf-gap-slider"), { target: { value: "0" } });
    assertZeroHangul("gap 0px leak");
    fireEvent.click(screen.getByTestId("wgf-preset-wide"));
    fireEvent.click(screen.getByTestId("wgf-gap-preset-12"));
    fireEvent.click(screen.getByTestId("wgf-toggle-trap"));
    fireEvent.click(screen.getByTestId("wgf-toggle-bridges"));
    assertZeroHangul("wide preset and toggles");
    fireEvent.click(screen.getByTestId("wgf-bench-512"));
    assertZeroHangul("after benchmark");
  });

  it("webgpu-flatting 디렉터리 전체 파일이 800줄 이하 · 원시 hex 0건 · transition-all 0건 · any 0건을 준수한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/fill/webgpu-flatting");
    const files = readdirSync(dir).filter((name) => /\.(?:ts|tsx|css)$/.test(name));
    expect(files.length).toBeGreaterThanOrEqual(5);

    for (const file of files) {
      const content = readFileSync(resolve(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} line count`).toBeLessThanOrEqual(800);
      if (file !== "webgpu-auto-flatting.test.tsx") {
        expect(content, `${file} raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(content, `${file} transition-all`).not.toMatch(/transition-all|transition:\s*all/);
        expect(content, `${file} explicit any`).not.toMatch(/(?::\s*any\b|\bas\s+any\b|<any>)/);
      }
    }
  });
});
