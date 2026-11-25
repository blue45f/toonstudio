import { describe, expect, it } from "vitest";
import {
  EXTREME_WEBGPU_OPTIONAL_FEATURES,
  F16_SPECTRAL_KM7_BRUSH_WGSL,
  F32_SPECTRAL_KM7_BRUSH_WGSL,
  SPARSE_STRIP_HEIGHT_4,
  SPARSE_STRIP_HEIGHT_8,
  SPARSE_STRIP_UNIFORM_BYTES,
  SPECTRAL_KM7_UNIFORM_BYTES,
  STANDARD_PREFIX_SUM_TILE_BIN_WGSL,
  SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL,
  TILE_BIN_PREFIX_UNIFORM_BYTES,
  VELLO_SPARSE_STRIP_RASTER_WGSL,
  buildSparseStripsFromPolygons,
  compareF16VsF32SpectralParity,
  emulateF16SpectralKm7Mix,
  emulateSparseStripRaster,
  emulateStandardBarrierTilePrefixSum,
  emulateSubgroupTilePrefixSum,
  negotiateExtremeWebGpuProfile,
  packSparseStripUniforms,
  packSpectralKm7Uniforms,
  packTileBinPrefixUniforms,
  quantizeFloat16,
  summarizeGpuTimestampPassWindow,
  validateAllExtremeWgslBundles,
  validateExtremeWgslContracts,
} from "./index";

describe("극한 WebGPU WGSL 셰이더 정적 계약 및 Uniform 패커", () => {
  it("validateAllExtremeWgslBundles가 5종 셰이더 전체 계약을 통과한다", () => {
    const bundle = validateAllExtremeWgslBundles();
    expect(bundle.allValid).toBe(true);
    expect(bundle.subgroupTileBin.issues).toEqual([]);
    expect(bundle.standardTileBin.issues).toEqual([]);
    expect(bundle.f16SpectralKm7.issues).toEqual([]);
    expect(bundle.f32SpectralKm7.issues).toEqual([]);
    expect(bundle.velloSparseStrip.issues).toEqual([]);
  });

  it("SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL이 enable subgroups와 3종 워프 연산 및 32B 정렬을 충족한다", () => {
    const report = validateExtremeWgslContracts(SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL, {
      expectedWorkgroupSize: [64, 1, 1],
      requireSubgroupsEnable: true,
      requireSubgroupOps: true,
    });
    expect(report.valid).toBe(true);
    expect(report.hasSubgroupsEnable).toBe(true);
    expect(report.hasBoundsGuard).toBe(true);
    expect(report.hasUniformityHazard).toBe(false);
    expect(report.uniformStructBytes.TileBinPrefixParams).toBe(TILE_BIN_PREFIX_UNIFORM_BYTES);
    expect(report.bindings.length).toBe(4);
  });

  it("STANDARD_PREFIX_SUM_TILE_BIN_WGSL이 확장 지시문 없이 Subgroup 셰이더와 동일한 바인딩 계약을 유지한다", () => {
    const subReport = validateExtremeWgslContracts(SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL);
    const stdReport = validateExtremeWgslContracts(STANDARD_PREFIX_SUM_TILE_BIN_WGSL, {
      expectedWorkgroupSize: [64, 1, 1],
      forbidEnableDirectives: true,
    });
    expect(stdReport.valid).toBe(true);
    expect(stdReport.enableDirectives).toEqual([]);
    expect(stdReport.hasUniformityHazard).toBe(false);
    expect(stdReport.bindings.map((b) => `${b.group}:${b.binding}:${b.addressSpace}`)).toEqual(
      subReport.bindings.map((b) => `${b.group}:${b.binding}:${b.addressSpace}`),
    );
  });

  it("F16_SPECTRAL_KM7_BRUSH_WGSL은 enable f16과 vec4<f16> 8B/px 경로, F32 폴백은 확장 없이 64B 정렬을 유지한다", () => {
    const f16Report = validateExtremeWgslContracts(F16_SPECTRAL_KM7_BRUSH_WGSL, {
      expectedWorkgroupSize: [8, 8, 1],
      requireF16Enable: true,
      requireF16Types: true,
    });
    const f32Report = validateExtremeWgslContracts(F32_SPECTRAL_KM7_BRUSH_WGSL, {
      expectedWorkgroupSize: [8, 8, 1],
      forbidEnableDirectives: true,
    });
    expect(f16Report.valid).toBe(true);
    expect(f16Report.hasF16Enable).toBe(true);
    expect(f16Report.uniformStructBytes.SpectralKm7BrushParams).toBe(SPECTRAL_KM7_UNIFORM_BYTES);
    expect(F16_SPECTRAL_KM7_BRUSH_WGSL).toContain("array<vec4<f16>>");
    expect(f32Report.valid).toBe(true);
    expect(f32Report.hasF16Enable).toBe(false);
    expect(F32_SPECTRAL_KM7_BRUSH_WGSL).toContain("array<vec4<f32>>");
  });

  it("VELLO_SPARSE_STRIP_RASTER_WGSL이 Compute + Vertex + Fragment fwidth AA 및 48B 정렬을 충족한다", () => {
    const report = validateExtremeWgslContracts(VELLO_SPARSE_STRIP_RASTER_WGSL, {
      expectedWorkgroupSize: [8, 8, 1],
      forbidEnableDirectives: true,
      requireFragmentFwidthAa: true,
    });
    expect(report.valid).toBe(true);
    expect(report.hasComputeEntry).toBe(true);
    expect(report.hasVertexEntry).toBe(true);
    expect(report.hasFragmentEntry).toBe(true);
    expect(report.hasFragmentFwidthAa).toBe(true);
    expect(report.hasUniformityHazard).toBe(false);
    expect(report.uniformStructBytes.SparseStripRasterParams).toBe(SPARSE_STRIP_UNIFORM_BYTES);
  });

  it("validateExtremeWgslContracts가 enable subgroups 누락과 중복 바인딩을 정확히 거부한다", () => {
    const broken = `
      struct P { a: u32, b: u32, c: u32, d: u32, };
      @group(0) @binding(0) var<uniform> params: P;
      @group(0) @binding(0) var<storage, read> dup_buf: array<u32>;
      @compute @workgroup_size(64, 1, 1)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        if (gid.x >= params.a) { return; }
      }
    `;
    const report = validateExtremeWgslContracts(broken, { requireSubgroupsEnable: true, requireSubgroupOps: true });
    expect(report.valid).toBe(false);
    expect(report.hasSubgroupsEnable).toBe(false);
    expect(report.duplicateBindings).toEqual(["0:0"]);
    expect(report.issues.length).toBeGreaterThanOrEqual(3);
  });

  it("validateExtremeWgslContracts가 괄호 불균형·경계 가드 누락·WGSL 예약어 충돌을 검출한다", () => {
    const broken = `
      struct P { meta: u32, filter: u32, c: u32, d: u32, };
      @group(0) @binding(0) var<uniform> params: P;
      @compute @workgroup_size(8, 8, 1)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let active = gid.x;
    `;
    const report = validateExtremeWgslContracts(broken);
    expect(report.valid).toBe(false);
    expect(report.delimitersBalanced).toBe(false);
    expect(report.hasBoundsGuard).toBe(false);
    expect(report.reservedKeywordHits).toEqual(expect.arrayContaining(["meta", "filter", "active"]));
  });

  it("validateExtremeWgslContracts가 비균일 조기 return 이후 배리어와 discard 이후 fwidth를 거부한다", () => {
    const barrierHazard = `
      struct P { n: u32, b: u32, c: u32, d: u32, };
      @group(0) @binding(0) var<uniform> params: P;
      @compute @workgroup_size(64, 1, 1)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        if (gid.x >= params.n) { return; }
        workgroupBarrier();
      }
    `;
    const fwidthAfterDiscard = `
      @fragment
      fn fs_bad(@location(0) x: f32) -> @location(0) vec4<f32> {
        if (x < 0.0) { discard; }
        let w = fwidth(x);
        return vec4<f32>(w, w, w, 1.0);
      }
    `;
    expect(validateExtremeWgslContracts(barrierHazard).hasUniformityHazard).toBe(true);
    expect(validateExtremeWgslContracts(fwidthAfterDiscard, { requireCompute: false, requireBoundsGuard: false }).hasUniformityHazard).toBe(true);
  });

  it("validateExtremeWgslContracts가 Compute 내 fwidth 불법 호출 및 16B 비정렬 Uniform을 거부한다", () => {
    const badCompute = `
      struct Unaligned { a: u32, b: u32, };
      @group(0) @binding(0) var<uniform> params: Unaligned;
      @compute @workgroup_size(8, 8, 1)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        if (gid.x >= params.a || gid.y >= params.b) { return; }
        let illegal = fwidth(f32(gid.x));
      }
    `;
    const report = validateExtremeWgslContracts(badCompute);
    expect(report.valid).toBe(false);
    expect(report.hasUniformityHazard).toBe(true);
    expect(report.uniformStructBytes.Unaligned).toBe(8);
  });

  it("packTileBinPrefixUniforms가 32B 정렬·기본 워크그룹 수 올림·비유한 입력 클램핑을 보장한다", () => {
    const buf = packTileBinPrefixUniforms({ tileCount: 130, tilesX: 13, tilesY: 10, tileDimPx: Number.NaN });
    expect(buf.byteLength).toBe(TILE_BIN_PREFIX_UNIFORM_BYTES);
    const view = new DataView(buf);
    expect(view.getUint32(0, true)).toBe(130);
    expect(view.getUint32(4, true)).toBe(13);
    expect(view.getUint32(8, true)).toBe(10);
    expect(view.getUint32(12, true)).toBe(64);
    expect(view.getUint32(16, true)).toBe(3);
  });

  it("packSpectralKm7Uniforms가 64B 정렬·f16/f32 모드 인코딩 및 비정렬 오프셋 예외를 보장한다", () => {
    const buf = packSpectralKm7Uniforms({
      width: 512,
      height: 256,
      pigmentR: 1.5,
      pigmentG: -0.2,
      pigmentB: 0.45,
      precisionMode: "f32",
    });
    expect(buf.byteLength).toBe(SPECTRAL_KM7_UNIFORM_BYTES);
    const view = new DataView(buf);
    expect(view.getUint32(0, true)).toBe(512);
    expect(view.getUint32(4, true)).toBe(256);
    expect(view.getUint32(8, true)).toBe(0);
    expect(view.getFloat32(16, true)).toBeCloseTo(1, 5);
    expect(view.getFloat32(20, true)).toBeCloseTo(0, 5);
    expect(view.getFloat32(24, true)).toBeCloseTo(0.45, 5);

    const arena = new ArrayBuffer(128);
    expect(() => packSpectralKm7Uniforms({ width: 64, height: 64 }, arena, 8)).toThrow(RangeError);
  });

  it("packSparseStripUniforms가 48B 정렬·8×8 스트립·evenodd 코드·오프셋 슬라이스 패킹을 보장한다", () => {
    const arena = new ArrayBuffer(96);
    const returned = packSparseStripUniforms(
      { canvasWidth: 1024, canvasHeight: 768, stripCount: 42, stripHeight: SPARSE_STRIP_HEIGHT_8, fillRule: "evenodd", aaSharpness: 1.5 },
      arena,
      16,
    );
    expect(returned).toBe(arena);
    const view = new DataView(arena, 16, SPARSE_STRIP_UNIFORM_BYTES);
    expect(view.getUint32(0, true)).toBe(1024);
    expect(view.getUint32(4, true)).toBe(768);
    expect(view.getUint32(8, true)).toBe(42);
    expect(view.getUint32(12, true)).toBe(8);
    expect(view.getFloat32(16, true)).toBeCloseTo(1.5, 5);
    expect(view.getUint32(20, true)).toBe(1);
  });
});

describe("익스트림 WebGPU 기능 협상 (negotiateExtremeWebGpuProfile)", () => {
  it("6종 확장 전체 지원 시 extreme-subgroup-f16 티어와 8B/px·워프 경로·타임스탬프를 활성화한다", () => {
    const profile = negotiateExtremeWebGpuProfile(EXTREME_WEBGPU_OPTIONAL_FEATURES, {
      subgroupMinSize: 8,
      subgroupMaxSize: 32,
    });
    expect(profile.tier).toBe("extreme-subgroup-f16");
    expect(profile.shaders.tileBinVariant).toBe("subgroup-prefix-sum");
    expect(profile.shaders.tileBinWgsl).toBe(SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL);
    expect(profile.shaders.spectralBrushVariant).toBe("f16-spectral-km7");
    expect(profile.shaders.spectralBrushWgsl).toBe(F16_SPECTRAL_KM7_BRUSH_WGSL);
    expect(profile.shaders.sparseStripWgsl).toBe(VELLO_SPARSE_STRIP_RASTER_WGSL);
    expect(profile.spectralStorageBytesPerPixel).toBe(8);
    expect(profile.spectralBandwidthRatio).toBe(0.5);
    expect(profile.timestampProfilingEnabled).toBe(true);
    expect(profile.indirectFirstInstanceEnabled).toBe(true);
    expect(profile.directBgraStorageEnabled).toBe(true);
    expect(profile.subgroupSizeBounds).toEqual({ min: 8, max: 32, controllable: true });
    expect(profile.requiredFeatures).toEqual(EXTREME_WEBGPU_OPTIONAL_FEATURES);
  });

  it("shader-f16만 지원 시 modern-f16 티어와 표준 workgroupBarrier 타일 빈닝 폴백을 선택한다", () => {
    const profile = negotiateExtremeWebGpuProfile(["shader-f16", "timestamp-query"]);
    expect(profile.tier).toBe("modern-f16");
    expect(profile.shaders.tileBinVariant).toBe("barrier-prefix-sum");
    expect(profile.shaders.tileBinWgsl).toBe(STANDARD_PREFIX_SUM_TILE_BIN_WGSL);
    expect(profile.shaders.spectralBrushVariant).toBe("f16-spectral-km7");
    expect(profile.shaders.spectralBrushWgsl).toBe(F16_SPECTRAL_KM7_BRUSH_WGSL);
    expect(profile.spectralStorageBytesPerPixel).toBe(8);
    expect(profile.subgroupSizeBounds).toBeNull();
  });

  it("subgroups만 지원 시 core-webgpu-f32 티어에서 워프 타일 빈닝과 f32 분광 폴백을 조합한다", () => {
    const profile = negotiateExtremeWebGpuProfile(new Set(["subgroups", "bgra8unorm-storage"]));
    expect(profile.tier).toBe("core-webgpu-f32");
    expect(profile.shaders.tileBinVariant).toBe("subgroup-prefix-sum");
    expect(profile.shaders.tileBinWgsl).toBe(SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL);
    expect(profile.shaders.spectralBrushVariant).toBe("f32-spectral-km7");
    expect(profile.shaders.spectralBrushWgsl).toBe(F32_SPECTRAL_KM7_BRUSH_WGSL);
    expect(profile.spectralStorageBytesPerPixel).toBe(16);
    expect(profile.directBgraStorageEnabled).toBe(true);
  });

  it("선택 확장이 없는 코어 WebGPU 어댑터는 core-webgpu-f32와 모든 표준 폴백 셰이더를 선택한다", () => {
    const profile = negotiateExtremeWebGpuProfile([]);
    expect(profile.tier).toBe("core-webgpu-f32");
    expect(profile.requiredFeatures).toEqual([]);
    expect(profile.shaders.tileBinVariant).toBe("barrier-prefix-sum");
    expect(profile.shaders.spectralBrushVariant).toBe("f32-spectral-km7");
    expect(profile.shaders.sparseStripVariant).toBe("vello-sparse-strip-gpu");
    expect(profile.spectralBandwidthRatio).toBe(1);
    expect(profile.timestampProfilingEnabled).toBe(false);
  });

  it("WebGPU 미지원(null 또는 webgpuAvailable: false) 시 wasm-simd-fallback과 null WGSL을 반환한다", () => {
    const fromNull = negotiateExtremeWebGpuProfile(null);
    const fromDisabled = negotiateExtremeWebGpuProfile(["subgroups", "shader-f16"], { webgpuAvailable: false });
    for (const p of [fromNull, fromDisabled]) {
      expect(p.tier).toBe("wasm-simd-fallback");
      expect(p.webgpuAvailable).toBe(false);
      expect(p.requiredFeatures).toEqual([]);
      expect(p.shaders.tileBinWgsl).toBeNull();
      expect(p.shaders.spectralBrushWgsl).toBeNull();
      expect(p.shaders.sparseStripWgsl).toBeNull();
      expect(p.timestampProfilingEnabled).toBe(false);
    }
  });

  it("subgroups 없이 단독 제공된 subgroup-size-control은 요청 목록에서 제외한다", () => {
    const profile = negotiateExtremeWebGpuProfile(["subgroup-size-control", "shader-f16"]);
    expect(profile.capabilities.subgroupSizeControl).toBe(false);
    expect(profile.requiredFeatures).toEqual(["shader-f16"]);
    expect(profile.subgroupSizeBounds).toBeNull();
  });

  it("preferredStripHeight: 8과 알 수 없는 확장 토큰 필터링을 정확히 처리한다", () => {
    const profile = negotiateExtremeWebGpuProfile(["subgroups", "shader-f16", "unknown-future-ext"], {
      preferredStripHeight: SPARSE_STRIP_HEIGHT_8,
    });
    expect(profile.shaders.sparseStripHeight).toBe(8);
    expect(profile.requiredFeatures).toEqual(["subgroups", "shader-f16"]);
  });
});

describe("Subgroup vs Barrier 2D 타일 빈닝 Prefix-Sum CPU 패리티", () => {
  it("단일 워크그룹(64타일)에서 subgroupSize 4·8·16·32·64 모두 Blelloch 배리어 스캔과 비트 일치한다", () => {
    const counts = Array.from({ length: 64 }, (_, i) => ((i * 7 + 3) % 19));
    const expected = emulateStandardBarrierTilePrefixSum(counts);
    for (const subgroupSize of [4, 8, 16, 32, 64] as const) {
      const actual = emulateSubgroupTilePrefixSum(counts, { subgroupSize });
      expect(Array.from(actual.localOffsets)).toEqual(Array.from(expected.localOffsets));
      expect(Array.from(actual.globalOffsets)).toEqual(Array.from(expected.globalOffsets));
      expect(Array.from(actual.workgroupTotals)).toEqual(Array.from(expected.workgroupTotals));
      expect(actual.totalCount).toBe(expected.totalCount);
      expect(actual.subgroupsPerWorkgroup).toBe(64 / subgroupSize);
    }
  });

  it("다중 워크그룹 비-64배수(200타일)에서 localOffsets·workgroupTotals·globalOffsets가 정확히 일치한다", () => {
    const counts = Array.from({ length: 200 }, (_, i) => (i % 5 === 0 ? 0 : (i % 11) + 1));
    const sg = emulateSubgroupTilePrefixSum(counts, { subgroupSize: 16 });
    const std = emulateStandardBarrierTilePrefixSum(counts);
    expect(sg.workgroupCount).toBe(4);
    expect(Array.from(sg.localOffsets)).toEqual(Array.from(std.localOffsets));
    expect(Array.from(sg.globalOffsets)).toEqual(Array.from(std.globalOffsets));
    expect(Array.from(sg.workgroupTotals)).toEqual(Array.from(std.workgroupTotals));

    let running = 0;
    for (let i = 0; i < counts.length; i += 1) {
      expect(sg.globalOffsets[i]).toBe(running);
      running += counts[i] ?? 0;
    }
    expect(sg.totalCount).toBe(running);
  });

  it("빈 배열과 단일 요소 타일 카운트를 안전하게 처리한다", () => {
    const empty = emulateSubgroupTilePrefixSum([]);
    expect(empty.totalCount).toBe(0);
    expect(empty.workgroupCount).toBe(0);
    expect(empty.globalOffsets.length).toBe(0);

    const single = emulateSubgroupTilePrefixSum([42]);
    expect(Array.from(single.globalOffsets)).toEqual([0]);
    expect(Array.from(single.workgroupTotals)).toEqual([42]);
    expect(single.totalCount).toBe(42);
  });

  it("음수·NaN·소수 입력을 0 이상 정수로 정규화하고 배리어 절감 메타(1 vs 13)를 유지한다", () => {
    const res = emulateSubgroupTilePrefixSum([-5, Number.NaN, 3.9, 2.1, 0]);
    expect(Array.from(res.globalOffsets)).toEqual([0, 0, 0, 3, 5]);
    expect(res.totalCount).toBe(5);
    expect(res.subgroupBarrierCountPerWorkgroup).toBe(1);
    expect(res.standardBarrierCountPerWorkgroup).toBe(13);
  });

  it("16×12 희소 타일 격자(192타일)에서 Prefix-Sum 오프셋 단조 비감소와 총합 불변식을 보장한다", () => {
    const sparseCounts = new Uint32Array(192);
    sparseCounts[3] = 12;
    sparseCounts[64] = 8;
    sparseCounts[127] = 5;
    sparseCounts[191] = 9;
    const res = emulateSubgroupTilePrefixSum(sparseCounts, { subgroupSize: 32 });
    for (let i = 1; i < res.globalOffsets.length; i += 1) {
      expect(res.globalOffsets[i] ?? 0).toBeGreaterThanOrEqual(res.globalOffsets[i - 1] ?? 0);
    }
    expect(res.globalOffsets[191]).toBe(25);
    expect(res.totalCount).toBe(34);
  });

  it("정확한 64배수 경계(128타일, 2워크그룹)에서 워크그룹 간 오프셋 전이가 정확하다", () => {
    const counts = new Uint32Array(128).fill(3);
    const res = emulateSubgroupTilePrefixSum(counts, { subgroupSize: 64 });
    expect(res.workgroupCount).toBe(2);
    expect(Array.from(res.workgroupTotals)).toEqual([192, 192]);
    expect(res.localOffsets[64]).toBe(0);
    expect(res.globalOffsets[64]).toBe(192);
    expect(res.totalCount).toBe(384);
  });
});

describe("IEEE-754 binary16 양자화 및 f16 7밴드 Kubelka-Munk 분광 혼색 패리티", () => {
  it("quantizeFloat16이 IEEE-754 half-float 정상·서브노멀·오버플로·1/3 반올림 규칙을 정확히 따른다", () => {
    expect(quantizeFloat16(0)).toBe(0);
    expect(quantizeFloat16(1)).toBe(1);
    expect(quantizeFloat16(-0.5)).toBe(-0.5);
    expect(quantizeFloat16(65504)).toBe(65504);
    expect(quantizeFloat16(65520)).toBe(Number.POSITIVE_INFINITY);
    expect(quantizeFloat16(-70000)).toBe(Number.NEGATIVE_INFINITY);
    expect(quantizeFloat16(Math.pow(2, -14))).toBe(Math.pow(2, -14));
    expect(quantizeFloat16(Math.pow(2, -24))).toBe(Math.pow(2, -24));
    expect(quantizeFloat16(1 / 3)).toBeCloseTo(1365 / 4096, 10);
    expect(Number.isNaN(quantizeFloat16(Number.NaN))).toBe(true);
  });

  it("f16 7밴드 Kubelka-Munk 노랑+파랑 감산 혼색이 회색이 아닌 녹색 우세 결과를 생성한다", () => {
    // 선형 노랑 바탕 [0.95, 0.88, 0.03, 1.0] 위에 선형 파랑 안료 [0.03, 0.14, 0.90, 1.0] 혼색
    const canvas = new Float32Array([0.95, 0.88, 0.03, 1]);
    const mask = new Float32Array([1]);
    const res = emulateF16SpectralKm7Mix({
      canvasRgba: canvas,
      strokeMask: mask,
      params: { width: 1, height: 1, pigmentR: 0.03, pigmentG: 0.14, pigmentB: 0.9, pigmentA: 1, mixStrength: 0.55 },
      precisionMode: "f16",
    });
    const [r, g, b, a] = [res.outputRgba[0] ?? 0, res.outputRgba[1] ?? 0, res.outputRgba[2] ?? 0, res.outputRgba[3] ?? 0];
    expect(res.overflowCount).toBe(0);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(a).toBeCloseTo(1, 3);
  });

  it("compareF16VsF32SpectralParity가 16색 패치에서 f16↔f32 최대 채널 오차 0.015 미만·오버플로 0건을 보장한다", () => {
    const patches = new Float32Array(16 * 4);
    const masks = new Float32Array(16);
    for (let i = 0; i < 16; i += 1) {
      patches[i * 4] = ((i & 3) / 3) * 0.95 + 0.02;
      patches[i * 4 + 1] = (((i >>> 2) & 3) / 3) * 0.95 + 0.02;
      patches[i * 4 + 2] = 0.85 - (i / 16) * 0.8;
      patches[i * 4 + 3] = 1;
      masks[i] = 0.25 + (i / 15) * 0.75;
    }
    const parity = compareF16VsF32SpectralParity(patches, masks, {
      width: 4,
      height: 4,
      pigmentR: 0.82,
      pigmentG: 0.28,
      pigmentB: 0.12,
      pigmentA: 1,
      mixStrength: 0.5,
    });
    expect(parity.f16OverflowCount).toBe(0);
    expect(parity.maxAbsChannelError).toBeLessThan(0.015);
    expect(parity.meanAbsChannelError).toBeLessThan(0.005);
  });

  it("순흑+순백 극단 반사율 혼색에서 f16 오버플로 0건과 무채 중립 회색을 유지한다", () => {
    const canvas = new Float32Array([0, 0, 0, 1]);
    const mask = new Float32Array([1]);
    const res = emulateF16SpectralKm7Mix({
      canvasRgba: canvas,
      strokeMask: mask,
      params: { width: 1, height: 1, pigmentR: 1, pigmentG: 1, pigmentB: 1, pigmentA: 1, mixStrength: 0.5 },
      precisionMode: "f16",
    });
    const [r, g, b] = [res.outputRgba[0] ?? 0, res.outputRgba[1] ?? 0, res.outputRgba[2] ?? 0];
    expect(res.overflowCount).toBe(0);
    expect(Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)).toBe(true);
    expect(Math.abs(r - g)).toBeLessThan(0.02);
    expect(Math.abs(g - b)).toBeLessThan(0.02);
  });

  it("strokeMask가 0인 픽셀은 원본 캔버스 값을 보존하고 activeStrokePixels에서 제외한다", () => {
    const canvas = new Float32Array([0.25, 0.5, 0.75, 1, 0.8, 0.2, 0.1, 1]);
    const mask = new Float32Array([0, 0.8]);
    const res = emulateF16SpectralKm7Mix({
      canvasRgba: canvas,
      strokeMask: mask,
      params: { width: 2, height: 1, pigmentR: 0.9, pigmentG: 0.1, pigmentB: 0.1, pigmentA: 1 },
      precisionMode: "f16",
    });
    expect(res.processedPixels).toBe(2);
    expect(res.activeStrokePixels).toBe(1);
    expect(res.outputRgba[0]).toBeCloseTo(0.25, 3);
    expect(res.outputRgba[1]).toBeCloseTo(0.5, 3);
    expect(res.outputRgba[2]).toBeCloseTo(0.75, 3);
  });

  it("투명 캔버스(dstA=0) 위 브러시 칠하기는 브러시 안료 색과 유효 알파를 그대로 기록한다", () => {
    const canvas = new Float32Array([0, 0, 0, 0]);
    const mask = new Float32Array([0.5]);
    const res = emulateF16SpectralKm7Mix({
      canvasRgba: canvas,
      strokeMask: mask,
      params: { width: 1, height: 1, pigmentR: 0.5, pigmentG: 0.25, pigmentB: 0.75, pigmentA: 1, flowOpacity: 0.8 },
      precisionMode: "f16",
    });
    expect(res.outputRgba[0]).toBeCloseTo(0.5, 3);
    expect(res.outputRgba[1]).toBeCloseTo(0.25, 3);
    expect(res.outputRgba[2]).toBeCloseTo(0.75, 3);
    expect(res.outputRgba[3]).toBeCloseTo(0.4, 3);
  });

  it("f16(8B/px) vs f32(16B/px) 스토리지 폭을 보고하고 tintBrush 증가 시 브러시 안료 비중이 커진다", () => {
    const canvas = new Float32Array([0.9, 0.9, 0.9, 1]);
    const mask = new Float32Array([1]);
    const weak = emulateF16SpectralKm7Mix({
      canvasRgba: canvas,
      strokeMask: mask,
      params: { width: 1, height: 1, pigmentR: 0.05, pigmentG: 0.1, pigmentB: 0.85, mixStrength: 0.5, tintBrush: 0.5 },
      precisionMode: "f16",
    });
    const strong = emulateF16SpectralKm7Mix({
      canvasRgba: canvas,
      strokeMask: mask,
      params: { width: 1, height: 1, pigmentR: 0.05, pigmentG: 0.1, pigmentB: 0.85, mixStrength: 0.5, tintBrush: 4.0 },
      precisionMode: "f32",
    });
    expect(weak.storageBytesPerPixel).toBe(8);
    expect(strong.storageBytesPerPixel).toBe(16);
    // 강한 착색력 브러시(파랑)는 밝은 캔버스의 적색 채널을 훨씬 강하게 흡수한다.
    expect(strong.outputRgba[0] ?? 1).toBeLessThan(weak.outputRgba[0] ?? 0);
  });
});

describe("Vello Sparse Strips(4×4 / 8×8) 벡터 래스터라이저 CPU 패리티", () => {
  const rectPoly = [[4, 4], [12, 4], [12, 12], [4, 12]] as const;

  it("4×4 스파스 스트립이 축 정렬 사각형 내부=1·외부=0을 계산하고 빈 영역 평가를 건너뛴다", () => {
    const strips = buildSparseStripsFromPolygons([rectPoly], 32, 32, SPARSE_STRIP_HEIGHT_4);
    const res = emulateSparseStripRaster({ canvasWidth: 32, canvasHeight: 32, strips });
    expect(res.coverage[6 * 32 + 6]).toBeCloseTo(1, 5);
    expect(res.coverage[2 * 32 + 2]).toBeCloseTo(0, 5);
    expect(res.coverage[20 * 32 + 20]).toBeCloseTo(0, 5);
    expect(res.coveredPixels).toBe(64);
    expect(res.skippedEmptyPixels).toBeGreaterThan(500);
    expect(res.sparseRatio).toBeLessThan(0.5);
  });

  it("8×8 스파스 스트립 모드도 4×4 모드와 동일한 픽셀 커버리지를 산출한다", () => {
    const s4 = buildSparseStripsFromPolygons([rectPoly], 32, 32, SPARSE_STRIP_HEIGHT_4);
    const s8 = buildSparseStripsFromPolygons([rectPoly], 32, 32, SPARSE_STRIP_HEIGHT_8);
    const r4 = emulateSparseStripRaster({ canvasWidth: 32, canvasHeight: 32, strips: s4 });
    const r8 = emulateSparseStripRaster({ canvasWidth: 32, canvasHeight: 32, strips: s8 });
    expect(r8.coveredPixels).toBe(r4.coveredPixels);
    for (let i = 0; i < r4.coverage.length; i += 1) {
      expect(r8.coverage[i]).toBeCloseTo(r4.coverage[i] ?? 0, 5);
    }
  });

  it("대각선 삼각형 경계 픽셀에서 정확한 사다리꼴 해석적 면적 커버리지 0.5를 산출한다", () => {
    // 꼭짓점 (0,0) -> (4,4) -> (0,4) 직각삼각형: 대각선 (x,x) 픽셀의 절반(0.5)만 내부
    const tri = [[0, 0], [4, 4], [0, 4]] as const;
    const strips = buildSparseStripsFromPolygons([tri], 8, 8, SPARSE_STRIP_HEIGHT_4);
    const res = emulateSparseStripRaster({ canvasWidth: 8, canvasHeight: 8, strips });
    expect(res.coverage[0 * 8 + 0]).toBeCloseTo(0.5, 4);
    expect(res.coverage[1 * 8 + 1]).toBeCloseTo(0.5, 4);
    expect(res.coverage[2 * 8 + 2]).toBeCloseTo(0.5, 4);
    expect(res.coverage[3 * 8 + 0]).toBeCloseTo(1.0, 4);
    expect(res.coverage[0 * 8 + 3]).toBeCloseTo(0.0, 4);
  });

  it("서브픽셀 경계(x=4.25) 수직 에지가 0.75 부분 커버리지로 정확히 안티앨리어싱된다", () => {
    const subpixelRect = [[4.25, 4], [8, 4], [8, 8], [4.25, 8]] as const;
    const strips = buildSparseStripsFromPolygons([subpixelRect], 16, 16, SPARSE_STRIP_HEIGHT_4);
    const res = emulateSparseStripRaster({ canvasWidth: 16, canvasHeight: 16, strips });
    expect(res.coverage[5 * 16 + 4]).toBeCloseTo(0.75, 4);
    expect(res.coverage[5 * 16 + 5]).toBeCloseTo(1.0, 4);
    expect(res.coverage[5 * 16 + 3]).toBeCloseTo(0.0, 4);
  });

  it("동심 사각형에서 반대 방향 구멍은 0.0, 동일 방향 중첩은 nonzero=1.0 vs evenodd=0.0으로 구분된다", () => {
    const outer = [[0, 0], [16, 0], [16, 16], [0, 16]] as const;
    const holeOpposite = [[4, 4], [4, 12], [12, 12], [12, 4]] as const;
    const innerSame = [[4, 4], [12, 4], [12, 12], [4, 12]] as const;

    const donutStrips = buildSparseStripsFromPolygons([outer, holeOpposite], 16, 16, SPARSE_STRIP_HEIGHT_4, "nonzero");
    const donut = emulateSparseStripRaster({ canvasWidth: 16, canvasHeight: 16, strips: donutStrips });
    expect(donut.coverage[8 * 16 + 8]).toBeCloseTo(0, 4);
    expect(donut.coverage[2 * 16 + 2]).toBeCloseTo(1, 4);

    const sameNzStrips = buildSparseStripsFromPolygons([outer, innerSame], 16, 16, SPARSE_STRIP_HEIGHT_4, "nonzero");
    const sameEoStrips = buildSparseStripsFromPolygons([outer, innerSame], 16, 16, SPARSE_STRIP_HEIGHT_4, "evenodd");
    const sameNz = emulateSparseStripRaster({ canvasWidth: 16, canvasHeight: 16, strips: sameNzStrips, fillRule: "nonzero" });
    const sameEo = emulateSparseStripRaster({ canvasWidth: 16, canvasHeight: 16, strips: sameEoStrips, fillRule: "evenodd" });
    expect(sameNz.coverage[8 * 16 + 8]).toBeCloseTo(1, 4);
    expect(sameEo.coverage[8 * 16 + 8]).toBeCloseTo(0, 4);
  });

  it("backdropWinding만 있는 솔리드 내부 스트립(segments=[])이 전체 1.0 커버리지와 프리멀티플라이드 RGBA를 출력한다", () => {
    const res = emulateSparseStripRaster({
      canvasWidth: 8,
      canvasHeight: 8,
      inkColor: [0.5, 0.25, 0.75, 0.8],
      strips: [{ originX: 4, originY: 0, widthPx: 4, stripHeight: SPARSE_STRIP_HEIGHT_4, backdropWinding: 1, segments: [] }],
    });
    const idx = 2 * 8 + 5;
    expect(res.coverage[idx]).toBeCloseTo(1, 5);
    expect(res.rgba[idx * 4]).toBeCloseTo(0.4, 5);
    expect(res.rgba[idx * 4 + 1]).toBeCloseTo(0.2, 5);
    expect(res.rgba[idx * 4 + 2]).toBeCloseTo(0.6, 5);
    expect(res.rgba[idx * 4 + 3]).toBeCloseTo(0.8, 5);
  });
});

describe("WebGPU timestamp-query 패스 윈도우 프로파일링 요약", () => {
  it("4단계 GPU 실측 BigInt 나노초 타임스탬프를 밀리초·스테이지 합계·최고 부하 패스로 집계한다", () => {
    const summary = summarizeGpuTimestampPassWindow(
      [
        { passId: "tile-prefix", stage: "tile-bin", startNs: BigInt(1_000_000), endNs: BigInt(1_400_000), dispatchedWorkgroups: 16 },
        { passId: "km7-f16-brush", stage: "spectral-brush", startNs: BigInt(1_400_000), endNs: BigInt(3_900_000), dispatchedWorkgroups: 256 },
        { passId: "vello-strips", stage: "sparse-strip", startNs: BigInt(3_900_000), endNs: BigInt(5_100_000), dispatchedWorkgroups: 64 },
        { passId: "swap-composite", stage: "composite", startNs: BigInt(5_100_000), endNs: BigInt(5_500_000), dispatchedWorkgroups: 32 },
      ],
      { frameBudgetMs: 16 },
    );
    expect(summary.hasMeasurements).toBe(true);
    expect(summary.validPassCount).toBe(4);
    expect(summary.invalidSampleCount).toBe(0);
    expect(summary.totalGpuMs).toBeCloseTo(4.5, 5);
    expect(summary.windowSpanMs).toBeCloseTo(4.5, 5);
    expect(summary.overlapRatio).toBeCloseTo(1, 5);
    expect(summary.hottestPassId).toBe("km7-f16-brush");
    expect(summary.withinFrameBudget).toBe(true);
    expect(summary.budgetUtilizationRatio).toBeCloseTo(4.5 / 16, 5);
    expect(summary.stageTotalsMs["spectral-brush"]).toBeCloseTo(2.5, 5);
    expect(summary.passes[1]?.shareOfTotal).toBeCloseTo(2.5 / 4.5, 5);
  });

  it("64비트 대용량 BigInt 타임스탬프 정밀도 유지 및 비동기 중첩(overlapRatio > 1)을 탐지한다", () => {
    const base = BigInt("1700000000000000000");
    const summary = summarizeGpuTimestampPassWindow([
      { passId: "async-a", stage: "tile-bin", startNs: base, endNs: base + BigInt(2_000_000) },
      { passId: "async-b", stage: "sparse-strip", startNs: base + BigInt(500_000), endNs: base + BigInt(2_500_000) },
    ]);
    expect(summary.totalGpuMs).toBeCloseTo(4.0, 5);
    expect(summary.windowSpanMs).toBeCloseTo(2.5, 5);
    expect(summary.overlapRatio).toBeCloseTo(1.6, 5);
  });

  it("빈 샘플에서는 허위 수치 없이 hasMeasurements=false와 null 지표를 반환한다", () => {
    const summary = summarizeGpuTimestampPassWindow([]);
    expect(summary.hasMeasurements).toBe(false);
    expect(summary.validPassCount).toBe(0);
    expect(summary.totalGpuMs).toBe(0);
    expect(summary.windowSpanMs).toBe(0);
    expect(summary.overlapRatio).toBeNull();
    expect(summary.hottestPassId).toBeNull();
    expect(summary.budgetUtilizationRatio).toBeNull();
    expect(summary.withinFrameBudget).toBeNull();
  });

  it("역전 타임스탬프(end < start)와 NaN 샘플을 무효로 격리하고 유효 패스만 합산한다", () => {
    const summary = summarizeGpuTimestampPassWindow([
      { passId: "valid-pass", stage: "tile-bin", startNs: 100_000, endNs: 600_000 },
      { passId: "wrapped-driver", stage: "spectral-brush", startNs: BigInt(900_000), endNs: BigInt(200_000) },
      { passId: "nan-sample", stage: "other", startNs: Number.NaN, endNs: 500_000 },
    ]);
    expect(summary.hasMeasurements).toBe(true);
    expect(summary.validPassCount).toBe(1);
    expect(summary.invalidSampleCount).toBe(2);
    expect(summary.totalGpuMs).toBeCloseTo(0.5, 5);
    expect(summary.hottestPassId).toBe("valid-pass");
    expect(summary.passes[1]?.valid).toBe(false);
    expect(summary.passes[2]?.valid).toBe(false);
  });
});
