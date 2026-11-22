/**
 * 100% 클린룸 7밴드 분광 Kubelka-Munk 엔진 · WebGPU WGSL Compute · CPU↔WGSL f32 동등성 테스트.
 */
import { describe, expect, it, vi } from "vitest";
import { link } from "wesl";

import {
  KM7_FILTER_OP_GLAZING,
  KM7_FILTER_OP_GRADIENT_MAP,
  KM7_FILTER_OP_HARMONIZER,
  KM7_FILTER_OP_TEMP_SHIFT,
  STUDIO_WEBGPU_KM7_FILTER_COMPUTE_WGSL,
  STUDIO_WEBGPU_KM7_FILTER_UNIFORM_BYTES,
  STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET,
  STUDIO_WEBGPU_KM7_TILE_BRUSH_COMPUTE_WGSL,
  StudioWebGpuKm7FilterComputePipeline,
  packKm7FilterComputeUniforms,
} from "./studio-webgpu-km-wgsl";
import {
  KM7_BASIS_B,
  KM7_BASIS_G,
  KM7_BASIS_R,
  KM7_RECONSTRUCT_B,
  KM7_RECONSTRUCT_G,
  KM7_RECONSTRUCT_R,
  computeKm7ImpastoReliefLitSrgb,
  computeKm7WetPickupStep,
  glazeKm7SpectralSrgb,
  glazeKm7SpectralSrgbF32Mirror,
  km7LinearRgbToSpectrum7,
  km7ReflectanceFromKs,
  km7Spectrum7ToLinearRgb,
  km7SrgbToLinear,
  km7SrgbToOklch,
  mixKm7SpectralSrgb,
  mixKm7SpectralSrgbF32Mirror,
} from "./studio-webgpu-km7-spectral-core";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

async function linkWgsl(source: string): Promise<string> {
  const linked = await link({ weslSrc: { main: source }, rootModuleName: "main" });
  return linked.dest;
}

describe("7밴드 분광 Kubelka-Munk 물리 코어 (클린룸)", () => {
  it("7밴드 기저는 파티션 항등식(BR+BG+BB=1)과 정확한 복원 행렬(M·B=I₃)을 만족한다", () => {
    for (let i = 0; i < 7; i += 1) {
      const sum = (KM7_BASIS_R[i] ?? 0) + (KM7_BASIS_G[i] ?? 0) + (KM7_BASIS_B[i] ?? 0);
      expect(sum).toBeCloseTo(1, 5);
    }
    const bases = [KM7_BASIS_R, KM7_BASIS_G, KM7_BASIS_B] as const;
    const rows = [KM7_RECONSTRUCT_R, KM7_RECONSTRUCT_G, KM7_RECONSTRUCT_B] as const;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        let acc = 0;
        for (let i = 0; i < 7; i += 1) {
          acc += (rows[r]?.[i] ?? 0) * (bases[c]?.[i] ?? 0);
        }
        expect(acc).toBeCloseTo(r === c ? 1 : 0, 4);
      }
    }
  });

  it("Kubelka-Munk 역공식 R = 1/(1+q+sqrt(q²+2q))는 고전식 1+q-sqrt(q²+2q)와 수치적으로 동등하며 큰 q에서도 안정적이다", () => {
    for (const q of [0, 0.05, 0.5, 2, 10]) {
      const classical = 1 + q - Math.sqrt(q * q + 2 * q);
      const stabilized = km7ReflectanceFromKs(q);
      expect(Math.abs(classical - stabilized)).toBeLessThan(1e-7);
    }
    // 매우 큰 K/S(암부)에서도 양수·유한 반사율을 유지한다.
    const deep = km7ReflectanceFromKs(1000);
    expect(Number.isFinite(deep)).toBe(true);
    expect(deep).toBeGreaterThan(0);
    expect(deep).toBeLessThan(0.001);
  });

  it("파랑 + 노랑 감산 혼색 시 탁한 회색이 아닌 선명한 녹색(실측 Oklab Hue·Chroma)을 생성한다", () => {
    const blue = { r: 0.0, g: 0.13, b: 0.52 };
    const yellow = { r: 0.99, g: 0.83, b: 0.0 };
    const mixed = mixKm7SpectralSrgb(blue, yellow, 0.5);
    const mixedLch = km7SrgbToOklch(mixed);

    const naiveRgb = {
      r: (blue.r + yellow.r) * 0.5,
      g: (blue.g + yellow.g) * 0.5,
      b: (blue.b + yellow.b) * 0.5,
    };
    const naiveLch = km7SrgbToOklch(naiveRgb);

    // Oklab 녹색 영역(125°~165°) + 탁한 회색 대비 훨씬 높은 채도
    expect(mixedLch.hDeg).toBeGreaterThan(125);
    expect(mixedLch.hDeg).toBeLessThan(165);
    expect(mixedLch.C).toBeGreaterThan(0.12);
    expect(mixedLch.C).toBeGreaterThan(naiveLch.C + 0.04);
    expect(mixed.g).toBeGreaterThan(mixed.r + 0.2);
    expect(mixed.g).toBeGreaterThan(mixed.b + 0.2);

    // 순수 원색 파랑 + 노랑도 회색(C=0)이 아닌 선명한 녹색이 된다.
    const pureGreen = km7SrgbToOklch(
      mixKm7SpectralSrgb({ r: 0, g: 0, b: 1 }, { r: 1, g: 1, b: 0 }, 0.5),
    );
    expect(pureGreen.hDeg).toBeGreaterThan(130);
    expect(pureGreen.hDeg).toBeLessThan(160);
    expect(pureGreen.C).toBeGreaterThan(0.14);
  });

  it("빨강+노랑은 주황, 파랑+빨강은 보라, 흰색+검정은 무채 중립 회색을 유지한다", () => {
    const orange = km7SrgbToOklch(
      mixKm7SpectralSrgb({ r: 0.85, g: 0.08, b: 0.12 }, { r: 0.99, g: 0.83, b: 0 }, 0.5),
    );
    expect(orange.hDeg).toBeGreaterThan(25);
    expect(orange.hDeg).toBeLessThan(70);
    expect(orange.C).toBeGreaterThan(0.15);

    const violet = km7SrgbToOklch(
      mixKm7SpectralSrgb({ r: 0, g: 0.13, b: 0.52 }, { r: 0.85, g: 0.08, b: 0.12 }, 0.5),
    );
    expect(violet.hDeg).toBeGreaterThan(300);
    expect(violet.hDeg).toBeLessThan(355);

    const gray = mixKm7SpectralSrgb({ r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 0 }, 0.5);
    const grayLch = km7SrgbToOklch(gray);
    expect(grayLch.C).toBeLessThan(0.002);
    expect(Math.abs(gray.r - gray.g)).toBeLessThan(0.003);
    expect(Math.abs(gray.g - gray.b)).toBeLessThan(0.003);
  });

  it("글레이징은 다층 누적 시 광학 밀도가 단조 증가하며 파랑 위 노랑 글레이즈는 청록/녹색 빛을 낸다", () => {
    const blueUnder = { r: 0.12, g: 0.36, b: 0.86 };
    const yellowGlaze = { r: 0.98, g: 0.84, b: 0.08 };

    const g1 = glazeKm7SpectralSrgb(blueUnder, yellowGlaze, { opacity: 0.3, layers: 1 });
    const g2 = glazeKm7SpectralSrgb(blueUnder, yellowGlaze, { opacity: 0.3, layers: 2 });
    const g4 = glazeKm7SpectralSrgb(blueUnder, yellowGlaze, { opacity: 0.3, layers: 4 });

    // 청색 채널 투과 감쇠가 겹 수 증가에 따라 단조 감소
    expect(g1.b).toBeLessThan(blueUnder.b);
    expect(g2.b).toBeLessThan(g1.b);
    expect(g4.b).toBeLessThan(g2.b);

    // 2~4겹 글레이징 후 녹색이 청색보다 우세해지며 에메랄드/그린 계열로 이동
    const lch4 = km7SrgbToOklch(g4);
    expect(lch4.hDeg).toBeGreaterThan(110);
    expect(lch4.hDeg).toBeLessThan(180);
    expect(g4.g).toBeGreaterThan(g4.b);

    // opacity=0 은 완전 항등
    const identity = glazeKm7SpectralSrgb(blueUnder, yellowGlaze, { opacity: 0, layers: 3 });
    expect(identity).toEqual(blueUnder);
  });

  it("습윤 픽업·웻-엣지 블룸·임파스토 부조 음영이 물리 방향으로 동작한다", () => {
    const stepCenter = computeKm7WetPickupStep({
      canvasSrgb: { r: 0.98, g: 0.84, b: 0.08 },
      paintSrgb: { r: 0.05, g: 0.25, b: 0.78 },
      reservoirSrgb: { r: 0.05, g: 0.25, b: 0.78 },
      pickupRate: 0.6,
      wetness: 0.55,
      paintLoad: 0.9,
      edgeRingStrength: 0.75,
      radialDist01: 0.2,
    });
    const stepRim = computeKm7WetPickupStep({
      canvasSrgb: { r: 0.98, g: 0.84, b: 0.08 },
      paintSrgb: { r: 0.05, g: 0.25, b: 0.78 },
      reservoirSrgb: { r: 0.05, g: 0.25, b: 0.78 },
      pickupRate: 0.6,
      wetness: 0.55,
      paintLoad: 0.9,
      edgeRingStrength: 0.75,
      radialDist01: 0.95,
    });
    const centerL = km7SrgbToOklch(stepCenter.depositSrgb).L;
    const rimL = km7SrgbToOklch(stepRim.depositSrgb).L;
    expect(rimL).toBeLessThan(centerL);

    const base = { r: 0.32, g: 0.58, b: 0.34 };
    const litSlope = computeKm7ImpastoReliefLitSrgb({
      baseSrgb: base,
      heightGradX: 0.7,
      heightGradY: 0.7,
      reliefStrength: 0.8,
      gloss: 0.6,
    });
    const shadowSlope = computeKm7ImpastoReliefLitSrgb({
      baseSrgb: base,
      heightGradX: -0.7,
      heightGradY: -0.7,
      reliefStrength: 0.8,
      gloss: 0.6,
    });
    expect(km7SrgbToOklch(litSlope).L).toBeGreaterThan(km7SrgbToOklch(shadowSlope).L);
  });

  it("RGB → 7밴드 스펙트럼 → RGB 왕복 오차가 내부 색역에서 1e-4 미만이다", () => {
    const rand = lcg(20261122);
    let maxErr = 0;
    for (let i = 0; i < 120; i += 1) {
      const lin = { r: 0.02 + rand() * 0.96, g: 0.02 + rand() * 0.96, b: 0.02 + rand() * 0.96 };
      const rt = km7Spectrum7ToLinearRgb(km7LinearRgbToSpectrum7(lin));
      maxErr = Math.max(maxErr, Math.abs(rt.r - lin.r), Math.abs(rt.g - lin.g), Math.abs(rt.b - lin.b));
    }
    expect(maxErr).toBeLessThan(1e-4);
  });
});

describe("CPU(f64) ↔ WGSL(f32 미러) 수치 동등성 검증", () => {
  it("300쌍 무작위 안료 혼색에서 CPU 코어와 WGSL f32 미러의 최대 채널 오차가 2e-4 미만(8비트 ≤ 1단계)이다", () => {
    const rand = lcg(20261122);
    let maxDiff = 0;
    let maxByteDiff = 0;
    for (let i = 0; i < 300; i += 1) {
      const a = { r: rand(), g: rand(), b: rand() };
      const b = { r: rand(), g: rand(), b: rand() };
      const t = rand();
      const chromaPreserve = rand() * 0.6;
      const cpu = mixKm7SpectralSrgb(a, b, t, { chromaPreserve });
      const gpuMirror = mixKm7SpectralSrgbF32Mirror(a, b, t, { chromaPreserve });
      for (const ch of ["r", "g", "b"] as const) {
        maxDiff = Math.max(maxDiff, Math.abs(cpu[ch] - gpuMirror[ch]));
        maxByteDiff = Math.max(
          maxByteDiff,
          Math.abs(Math.round(cpu[ch] * 255) - Math.round(gpuMirror[ch] * 255)),
        );
      }
    }
    expect(maxDiff).toBeLessThan(2e-4);
    expect(maxByteDiff).toBeLessThanOrEqual(1);
  });

  it("120쌍 광학 글레이징에서 CPU 코어와 WGSL f32 미러가 2e-4 이내로 일치한다", () => {
    const rand = lcg(991122);
    let maxDiff = 0;
    for (let i = 0; i < 120; i += 1) {
      const base = { r: rand(), g: rand(), b: rand() };
      const glaze = { r: rand(), g: rand(), b: rand() };
      const opts = {
        opacity: 0.05 + rand() * 0.8,
        layers: 1 + Math.floor(rand() * 5),
        scatter: rand() * 0.6,
        paperPreserve: rand() * 0.5,
      };
      const cpu = glazeKm7SpectralSrgb(base, glaze, opts);
      const gpuMirror = glazeKm7SpectralSrgbF32Mirror(base, glaze, opts);
      maxDiff = Math.max(
        maxDiff,
        Math.abs(cpu.r - gpuMirror.r),
        Math.abs(cpu.g - gpuMirror.g),
        Math.abs(cpu.b - gpuMirror.b),
      );
    }
    expect(maxDiff).toBeLessThan(2e-4);
  });
});

describe("WebGPU WGSL Compute 구문·바인딩 무결성 및 파이프라인 디스패치", () => {
  it("wesl 링커가 KM7 스니펫 · 타일 비닝 Compute 브러시 · 4종 필터 Compute 셰이더 전체를 구문 오류 없이 해석한다", async () => {
    const snippetEntry = /* wgsl */ `
${STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET}
@group(0) @binding(0) var<storage, read_write> out_buf: array<vec4<f32>, 3>;
@compute @workgroup_size(1)
fn main() {
  let m = km7_mix_srgb(vec3<f32>(0.0, 0.13, 0.52), vec3<f32>(0.99, 0.83, 0.0), 0.5, 0.35);
  let g = km7_glaze_srgb(m, vec3<f32>(0.95, 0.78, 0.12), 0.35, 2.0, 0.22, 0.2);
  let r = km7_impasto_shade(g, vec2<f32>(0.2, 0.3), 0.7, 0.5);
  out_buf[0] = vec4<f32>(m, 1.0);
  out_buf[1] = vec4<f32>(g, 1.0);
  out_buf[2] = vec4<f32>(r, 1.0);
}
`;
    const linkedSnippet = await linkWgsl(snippetEntry);
    expect(linkedSnippet).toContain("fn km7_mix_srgb(");
    expect(linkedSnippet).toContain("fn km7_glaze_srgb(");
    expect(linkedSnippet).toContain("fn km7_impasto_shade(");

    const linkedBrush = await linkWgsl(STUDIO_WEBGPU_KM7_TILE_BRUSH_COMPUTE_WGSL);
    expect(linkedBrush).toContain("var<workgroup> shared_dabs:");
    expect(linkedBrush).toContain("workgroupBarrier();");
    expect(linkedBrush).toContain("fn cs_km7_tile_brush(");
    expect(linkedBrush).toContain("@binding(3) var<storage, read> tile_offsets");

    const linkedFilter = await linkWgsl(STUDIO_WEBGPU_KM7_FILTER_COMPUTE_WGSL);
    expect(linkedFilter).toContain("fn cs_km7_pigment_filter(");
    expect(linkedFilter).toContain("@group(0) @binding(0) var<uniform> u_filter");
    expect(linkedFilter).toContain("@group(0) @binding(2) var dst_tex: texture_storage_2d<rgba8unorm, write>");
  });

  it("WGSL 구문 오류를 주입하면 wesl 링커가 실패한다(음성 대조 검증)", async () => {
    const broken = STUDIO_WEBGPU_KM7_FILTER_COMPUTE_WGSL.replace(
      "return km7_lin_to_srgb(preserved_lin);",
      "return km7_lin_to_srgb(preserved_lin)",
    );
    await expect(linkWgsl(broken)).rejects.toThrow();
  });

  it("유니폼 버퍼는 96바이트(16바이트 배수)로 패킹되며 WebGPU Compute 파이프라인이 워크그룹을 정확히 디스패치한다", () => {
    const buf = packKm7FilterComputeUniforms({
      width: 120,
      height: 75,
      op: KM7_FILTER_OP_GRADIENT_MAP,
      flags: 2,
      color0: [0.1, 0.2, 0.8],
      color1: [0.2, 0.7, 0.3],
      color2: [1, 0.9, 0.1],
      params0: [0.5, 0.4, 1, 0],
      params1: [0.8, 0, 0, 0],
    });
    expect(buf.byteLength).toBe(STUDIO_WEBGPU_KM7_FILTER_UNIFORM_BYTES);
    expect(buf.byteLength % 16).toBe(0);
    const header = new Uint32Array(buf, 0, 4);
    expect(Array.from(header)).toEqual([120, 75, KM7_FILTER_OP_GRADIENT_MAP, 2]);
    const floats = new Float32Array(buf, 16, 20);
    expect(floats[2]).toBeCloseTo(0.8, 5);
    expect(floats[12]).toBeCloseTo(0.5, 5);
    expect(floats[16]).toBeCloseTo(0.8, 5);

    const dispatchWorkgroups = vi.fn();
    const end = vi.fn();
    const submit = vi.fn();
    const writeBuffer = vi.fn();
    const destroy = vi.fn();
    const mockDevice = {
      createShaderModule: vi.fn(() => ({}) as GPUShaderModule),
      createComputePipeline: vi.fn(() => ({
        getBindGroupLayout: vi.fn(() => ({}) as GPUBindGroupLayout),
      }) as unknown as GPUComputePipeline),
      createBuffer: vi.fn(() => ({ destroy }) as unknown as GPUBuffer),
      createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
      createCommandEncoder: vi.fn(() => ({
        beginComputePass: vi.fn(() => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          dispatchWorkgroups,
          end,
        })),
        finish: vi.fn(() => ({}) as GPUCommandBuffer),
      })),
      queue: { writeBuffer, submit },
    } as unknown as GPUDevice;

    const runner = new StudioWebGpuKm7FilterComputePipeline(mockDevice);
    for (const op of [
      KM7_FILTER_OP_GRADIENT_MAP,
      KM7_FILTER_OP_TEMP_SHIFT,
      KM7_FILTER_OP_GLAZING,
      KM7_FILTER_OP_HARMONIZER,
    ] as const) {
      const receipt = runner.dispatch({} as GPUTextureView, {} as GPUTextureView, {
        width: 100,
        height: 50,
        op,
      });
      expect(receipt.backend).toBe("webgpu-compute");
      expect(receipt.op).toBe(op);
      expect(receipt.workgroupsX).toBe(Math.ceil(100 / 8));
      expect(receipt.workgroupsY).toBe(Math.ceil(50 / 8));
      expect(receipt.uniformBytes).toBe(96);
    }
    expect(dispatchWorkgroups).toHaveBeenCalledTimes(4);
    expect(submit).toHaveBeenCalledTimes(4);
    expect(writeBuffer).toHaveBeenCalledTimes(4);
    runner.dispose();
    expect(destroy).toHaveBeenCalledOnce();
    expect(() =>
      runner.dispatch({} as GPUTextureView, {} as GPUTextureView, {
        width: 8,
        height: 8,
        op: KM7_FILTER_OP_GLAZING,
      }),
    ).toThrow();

    // sRGB 선형 변환 단조성 스모크
    expect(km7SrgbToLinear(0.5)).toBeGreaterThan(0.2);
    expect(km7SrgbToLinear(0.5)).toBeLessThan(0.25);
  });
});
