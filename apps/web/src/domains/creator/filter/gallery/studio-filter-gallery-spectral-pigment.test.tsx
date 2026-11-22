// @vitest-environment jsdom
/**
 * 7밴드 분광 KM 안료 필터 4종(필터 갤러리 + WebGPU Compute + CPU 폴백 + UI 선택) 테스트.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KM7_FILTER_OP_GLAZING,
  KM7_FILTER_OP_GRADIENT_MAP,
  KM7_FILTER_OP_HARMONIZER,
  KM7_FILTER_OP_TEMP_SHIFT,
  StudioWebGpuKm7FilterComputePipeline,
} from "../../render/studio-webgpu-km-wgsl";
import { km7SrgbToOklch } from "../../render/studio-webgpu-km7-spectral-core";

import { StudioFilterGalleryDialog } from "./StudioFilterGalleryDialog";
import { applyStudioFilterGalleryStack } from "./studio-filter-gallery-engine";
import {
  STUDIO_FILTER_GALLERY_EFFECTS,
  defaultStudioFilterGalleryParams,
  findStudioFilterGalleryEffect,
} from "./studio-filter-gallery-registry";
import {
  KM7_SPECTRAL_FILTER_IDS,
  STUDIO_FILTER_GALLERY_SPECTRAL_PIGMENT_EFFECTS,
  buildKm7SpectralFilterComputeUniforms,
  dispatchKm7SpectralFilterWebGpuOrCpu,
} from "./studio-filter-gallery-spectral-pigment";

import type { StudioFilterGalleryImage } from "./studio-filter-gallery-types";

afterEach(cleanup);

function solidImage(r: number, g: number, b: number, a = 255, size = 8): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width: size, height: size, data };
}

function pixel01(img: StudioFilterGalleryImage, index = 0): { r: number; g: number; b: number; a: number } {
  const off = index * 4;
  return {
    r: (img.data[off] ?? 0) / 255,
    g: (img.data[off + 1] ?? 0) / 255,
    b: (img.data[off + 2] ?? 0) / 255,
    a: img.data[off + 3] ?? 0,
  };
}

describe("7밴드 분광 안료 필터 4종 (레지스트리 · 물리 색채 · WebGPU/CPU 디스패치)", () => {
  it("4종 필터가 모두 필터 갤러리 레지스트리에 등록되어 있고 결정적이며 알파를 보존한다", () => {
    expect(STUDIO_FILTER_GALLERY_SPECTRAL_PIGMENT_EFFECTS).toHaveLength(4);
    for (const id of KM7_SPECTRAL_FILTER_IDS) {
      const def = findStudioFilterGalleryEffect(id);
      expect(def, id).toBeDefined();
      expect(STUDIO_FILTER_GALLERY_EFFECTS.some((e) => e.id === id)).toBe(true);
      if (!def) continue;

      const a = solidImage(140, 120, 175, 190);
      const b = solidImage(140, 120, 175, 190);
      const params = defaultStudioFilterGalleryParams(def);
      expect(applyStudioFilterGalleryStack(a, { version: 1, seed: 7, entries: [{ id, params }] })).toBe("applied");
      expect(applyStudioFilterGalleryStack(b, { version: 1, seed: 7, entries: [{ id, params }] })).toBe("applied");
      expect(Array.from(a.data)).toEqual(Array.from(b.data));
      expect(a.data[3]).toBe(190);

      // 완전 투명 픽셀은 건드리지 않는다.
      const clear = solidImage(200, 100, 50, 0);
      applyStudioFilterGalleryStack(clear, { version: 1, seed: 7, entries: [{ id, params }] });
      expect(Array.from(clear.data.slice(0, 4))).toEqual([200, 100, 50, 0]);
    }
  });

  it("1. 분광 감산 그라데이션 맵: 파랑→노랑 매핑 시 중간 회색 픽셀이 탁한 회색이 아닌 선명한 녹색이 된다", () => {
    const img = solidImage(188, 188, 188, 255); // 선형 휘도 약 0.50
    const receipt = dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-spectral-gradient-map", img, {
      shadowColor: "#0a2f8f",
      highlightColor: "#fde030",
      useMidtone: false,
      midpoint: 50,
      chromaPreserve: 45,
      mixAmount: 100,
    });
    expect(receipt.backend).toBe("cpu-fallback");
    const p = pixel01(img);
    const lch = km7SrgbToOklch(p);
    expect(lch.hDeg).toBeGreaterThan(120);
    expect(lch.hDeg).toBeLessThan(165);
    expect(lch.C).toBeGreaterThan(0.11);
    expect(p.g).toBeGreaterThan(p.r);
    expect(p.g).toBeGreaterThan(p.b);
  });

  it("2. 안료 색온도 시프트: 난색(+)은 적황 증가, 한색(-)은 청색 증가하며 Oklab 명도를 보존한다", () => {
    const warmImg = solidImage(150, 150, 150, 255);
    const coolImg = solidImage(150, 150, 150, 255);
    const baseL = km7SrgbToOklch({ r: 150 / 255, g: 150 / 255, b: 150 / 255 }).L;

    dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-pigment-temperature-shift", warmImg, {
      temperature: 75,
      tint: 0,
      preserveLightness: 95,
      chromaPreserve: 35,
      strength: 100,
    });
    dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-pigment-temperature-shift", coolImg, {
      temperature: -75,
      tint: 0,
      preserveLightness: 95,
      chromaPreserve: 35,
      strength: 100,
    });

    const wp = pixel01(warmImg);
    const cp = pixel01(coolImg);
    expect(wp.r).toBeGreaterThan(wp.b + 0.12);
    expect(cp.b).toBeGreaterThan(cp.r + 0.12);
    expect(Math.abs(km7SrgbToOklch(wp).L - baseL)).toBeLessThan(0.04);
    expect(Math.abs(km7SrgbToOklch(cp).L - baseL)).toBeLessThan(0.04);
  });

  it("3. 전통 화구 글레이징 필터: 겹 수 증가에 따라 청색 바탕 위 노랑 유약이 녹색으로 깊어진다", () => {
    const oneLayer = solidImage(28, 92, 220, 255);
    const fourLayers = solidImage(28, 92, 220, 255);

    dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-traditional-glazing", oneLayer, {
      glazeColor: "#f8d010",
      glazeOpacity: 35,
      layers: 1,
      scatter: 20,
      paperPreserve: 10,
    });
    dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-traditional-glazing", fourLayers, {
      glazeColor: "#f8d010",
      glazeOpacity: 35,
      layers: 4,
      scatter: 20,
      paperPreserve: 10,
    });

    const p1 = pixel01(oneLayer);
    const p4 = pixel01(fourLayers);
    expect(p4.b).toBeLessThan(p1.b);
    expect(p4.g).toBeGreaterThan(p4.b);
    const lch4 = km7SrgbToOklch(p4);
    expect(lch4.hDeg).toBeGreaterThan(105);
    expect(lch4.hDeg).toBeLessThan(180);
  });

  it("4. 안료 색조화 하모나이저: 기조 안료(Mother Color) 적용 시 서로 다른 픽셀의 색차가 줄어든다", () => {
    const img: StudioFilterGalleryImage = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        20, 70, 220, 255, // 파랑
        220, 45, 55, 255, // 빨강
      ]),
    };
    const beforeDist = Math.hypot(
      (20 - 220) / 255,
      (70 - 45) / 255,
      (220 - 55) / 255,
    );
    dispatchKm7SpectralFilterWebGpuOrCpu("color.km7-pigment-harmonizer", img, {
      motherColor: "#e69a28",
      harmonyMode: "analogous-mother",
      strength: 75,
      chromaPreserve: 35,
    });
    const p0 = pixel01(img, 0);
    const p1 = pixel01(img, 1);
    const afterDist = Math.hypot(p0.r - p1.r, p0.g - p1.g, p0.b - p1.b);
    expect(afterDist).toBeLessThan(beforeDist * 0.72);
  });

  it("WebGPU Compute 타깃이 주입되면 4종 필터 모두 GPU Compute 파이프라인으로 디스패치된다", () => {
    const dispatchWorkgroups = vi.fn();
    const mockDevice = {
      createShaderModule: vi.fn(() => ({}) as GPUShaderModule),
      createComputePipeline: vi.fn(() => ({
        getBindGroupLayout: vi.fn(() => ({}) as GPUBindGroupLayout),
      }) as unknown as GPUComputePipeline),
      createBuffer: vi.fn(() => ({ destroy: vi.fn() }) as unknown as GPUBuffer),
      createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
      createCommandEncoder: vi.fn(() => ({
        beginComputePass: vi.fn(() => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          dispatchWorkgroups,
          end: vi.fn(),
        })),
        finish: vi.fn(() => ({}) as GPUCommandBuffer),
      })),
      queue: { writeBuffer: vi.fn(), submit: vi.fn() },
    } as unknown as GPUDevice;

    const pipeline = new StudioWebGpuKm7FilterComputePipeline(mockDevice);
    const expectedOps = {
      "color.km7-spectral-gradient-map": KM7_FILTER_OP_GRADIENT_MAP,
      "color.km7-pigment-temperature-shift": KM7_FILTER_OP_TEMP_SHIFT,
      "color.km7-traditional-glazing": KM7_FILTER_OP_GLAZING,
      "color.km7-pigment-harmonizer": KM7_FILTER_OP_HARMONIZER,
    } as const;

    const img = solidImage(128, 128, 128, 255, 16);
    for (const id of KM7_SPECTRAL_FILTER_IDS) {
      const uniforms = buildKm7SpectralFilterComputeUniforms(id, 16, 16, {});
      expect(uniforms.op).toBe(expectedOps[id]);
      const receipt = dispatchKm7SpectralFilterWebGpuOrCpu(id, img, {}, {
        pipeline,
        sourceView: {} as GPUTextureView,
        targetView: {} as GPUTextureView,
      });
      expect(receipt.backend).toBe("webgpu-compute");
      if (receipt.backend === "webgpu-compute") {
        expect(receipt.op).toBe(expectedOps[id]);
        expect(receipt.workgroupsX).toBe(2);
        expect(receipt.workgroupsY).toBe(2);
      }
    }
    expect(dispatchWorkgroups).toHaveBeenCalledTimes(4);
    pipeline.dispose();
  });

  it("필터 갤러리 UI에서 4종 분광 안료 필터를 검색·선택해 스택에 추가할 수 있다", () => {
    const rootRef = { current: document.createElement("div") };
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioFilterGalleryDialog
        activeKey="km7-test"
        kind="filter-gallery"
        image={{}}
        rootRef={rootRef}
        onPreview={onPreview}
        onApply={onApply}
        onClose={onClose}
      />,
    );

    const catalogList = screen.getByRole("list", { name: "효과 목록" });
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "분광" } });
    fireEvent.click(within(catalogList).getByRole("button", { name: /분광 감산 그라데이션 맵/u }));

    fireEvent.change(search, { target: { value: "글레이징" } });
    fireEvent.click(within(catalogList).getByRole("button", { name: /전통 화구 글레이징 필터/u }));

    fireEvent.change(search, { target: { value: "색온도 시프트" } });
    expect(within(catalogList).getByRole("button", { name: /안료 색온도 시프트/u })).toBeTruthy();

    fireEvent.change(search, { target: { value: "하모나이저" } });
    expect(within(catalogList).getByRole("button", { name: /안료 색조화 하모나이저/u })).toBeTruthy();

    const stack = screen.getByRole("list", { name: "쌓인 효과" });
    expect(within(stack).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const appliedPatch = onApply.mock.calls[0]?.[0] as
      | { filterGallery?: { entries?: { id: string }[] } }
      | undefined;
    expect(appliedPatch?.filterGallery?.entries?.map((entry) => entry.id)).toEqual([
      "color.km7-spectral-gradient-map",
      "color.km7-traditional-glazing",
    ]);
  });
});
