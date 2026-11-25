import { describe, expect, it } from "vitest";
import { link } from "wesl";
import {
  EXTREME_WEBGPU_OPTIONAL_FEATURES, F16_SPECTRAL_KM7_BRUSH_WGSL, F32_SPECTRAL_KM7_BRUSH_WGSL,
  STANDARD_PREFIX_SUM_TILE_BIN_WGSL, SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL, VELLO_SPARSE_STRIP_RASTER_WGSL,
  buildSparseStripsFromPolygons, emulateF16SpectralKm7Mix, emulateSparseStripRaster,
  emulateStandardBarrierTilePrefixSum, emulateSubgroupTilePrefixSum, negotiateExtremeWebGpuProfile,
  packTileBinPrefixUniforms, quantizeFloat16, summarizeGpuTimestampPassWindow,
} from "./index";

describe("수치·버퍼·실행 근거 경계", () => {
  it("최솟값의 절반 바로 위 f16 서브노멀을 0으로 잃지 않는다", () => {
    expect(quantizeFloat16(3 * 2 ** -26)).toBe(2 ** -24);
    expect(quantizeFloat16(-3 * 2 ** -26)).toBe(-(2 ** -24));
    expect(quantizeFloat16(2 ** -25)).toBe(0);
  });
  it("u32 prefix 합계 넘침과 비유한 workgroup 크기를 거절한다", () => {
    for (const run of [emulateSubgroupTilePrefixSum, emulateStandardBarrierTilePrefixSum]) {
      expect(() => run([4294967295, 1])).toThrow();
      expect(() => run([Number.POSITIVE_INFINITY])).toThrow();
    }
    expect(() => emulateSubgroupTilePrefixSum([1, 2], { workgroupSize: Number.NaN })).toThrow();
  });
  it("짧은 스펙트럼 버퍼를 다른 크기의 성공 결과로 자르지 않는다", () => {
    expect(() => emulateF16SpectralKm7Mix({ canvasRgba: new Float32Array(4), strokeMask: new Float32Array(2), params: { width: 2, height: 1 } })).toThrow();
    expect(() => emulateF16SpectralKm7Mix({ canvasRgba: new Float32Array([Number.NaN, 0, 0, 1]), strokeMask: new Float32Array(1), params: { width: 1, height: 1 } })).toThrow();
  });
  it("비유한 캔버스·선분과 겹치는 스트립은 할당·결과 이전에 거절한다", () => {
    expect(() => buildSparseStripsFromPolygons([], Number.NaN, 8)).toThrow();
    const strip = { originX: 0, originY: 0, widthPx: 1, stripHeight: 4 as const, backdropWinding: 1, segments: [] };
    expect(() => emulateSparseStripRaster({ canvasWidth: 1, canvasHeight: 1, strips: [strip, strip] })).toThrow();
    expect(() => emulateSparseStripRaster({ canvasWidth: 1, canvasHeight: 1, strips: [{ ...strip, segments: [{ x0: 0, y0: 0, x1: Number.NaN, y1: 1 }] }] })).toThrow();
  });
  it("새 uniform 버퍼도 오프셋을 존중하며 잘못된 오프셋은 거절한다", () => {
    const params = { tileCount: 2, tilesX: 2, tilesY: 1 };
    const buffer = packTileBinPrefixUniforms(params, undefined, 16);
    expect(buffer.byteLength).toBe(48);
    expect(new DataView(buffer).getUint32(16, true)).toBe(2);
    expect(() => packTileBinPrefixUniforms(params, undefined, 1)).toThrow();
  });
  it("부분 픽셀에서 중복 윤곽의 nonzero 면적과 evenodd 상쇄를 보존한다", () => {
    const polygon = [[0.25, 0], [4, 0], [4, 4], [0.25, 4]] as const;
    for (const fillRule of ["nonzero", "evenodd"] as const) {
      const strips = buildSparseStripsFromPolygons([polygon, polygon], 8, 8, 4, fillRule);
      const result = emulateSparseStripRaster({ canvasWidth: 8, canvasHeight: 8, strips, fillRule });
      expect(result.coverage[8]).toBeCloseTo(fillRule === "nonzero" ? 0.75 : 0, 6);
    }
  });
  it("기능 목록만으로 GPU 계측·BGRA 출력·간접 드로우 실행을 주장하지 않는다", () => {
    const profile = negotiateExtremeWebGpuProfile(EXTREME_WEBGPU_OPTIONAL_FEATURES);
    expect(profile).toMatchObject({ selectionScope: "source-candidate-only", executionVerified: false, timestampProfilingEnabled: false, directBgraStorageEnabled: false, indirectFirstInstanceEnabled: false });
    expect(profile.requiredFeatures).not.toContain("subgroup-size-control");
    expect(profile.shaders.tileBinVariant).toBe("barrier-prefix-sum");
    expect(profile.subgroupSizeBounds?.controllable).toBe(false);
  });
  it("Float32 CPU 결과의 실제 저장 폭을 f16 시뮬레이션 폭과 구분한다", () => {
    const result = emulateF16SpectralKm7Mix({ canvasRgba: new Float32Array([0.2, 0.3, 0.4, 1]), strokeMask: new Float32Array(1), params: { width: 1, height: 1 } });
    expect(result.storageBytesPerPixel).toBe(result.outputRgba.byteLength);
    expect(result).toMatchObject({ simulatedStorageBytesPerPixel: 8, gpuParityVerified: false });
  });
  it("유효 안료 알파 0은 기존 픽셀을 다시 혼색하지 않는다", () => {
    for (const params of [{ flowOpacity: 0 }, { pigmentA: 0 }]) {
      const canvasRgba = new Float32Array([0.5, 0.25, 0.125, 1]);
      const result = emulateF16SpectralKm7Mix({ canvasRgba, strokeMask: new Float32Array([1]), params: { width: 1, height: 1, ...params } });
      expect(result.outputRgba).toEqual(canvasRgba);
      expect(result.activeStrokePixels).toBe(0);
    }
  });
  it("안전 정밀도 초과·주기 배율 넘침 샘플을 유효 계측으로 합산하지 않는다", () => {
    expect(summarizeGpuTimestampPassWindow([{ passId: "unsafe", startNs: 2 ** 54, endNs: 2 ** 54 + 4 }]).hasMeasurements).toBe(false);
    const overflow = summarizeGpuTimestampPassWindow([{ passId: "overflow", startNs: 0, endNs: 1e300 }], { timestampPeriodNs: 1e20 });
    expect(overflow.hasMeasurements).toBe(false);
    expect(overflow.totalGpuMs).toBe(0);
  });
  it("실제 장치 없이 5종 WGSL 소스를 정적으로 연결한다", async () => {
    for (const source of [SUBGROUP_PREFIX_SUM_TILE_BIN_WGSL, STANDARD_PREFIX_SUM_TILE_BIN_WGSL, F16_SPECTRAL_KM7_BRUSH_WGSL, F32_SPECTRAL_KM7_BRUSH_WGSL, VELLO_SPARSE_STRIP_RASTER_WGSL]) {
      expect((await link({ weslSrc: { main: source }, rootModuleName: "main" })).dest).toContain("fn ");
    }
  });
});
