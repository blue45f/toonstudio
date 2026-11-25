import { describe, expect, it, vi } from "vitest";
import {
  buildKonvaBypassDispatchPlan, createTileDispatchBatch, executeCpuReferenceTilePass,
  executeTilePassWithFallback, packImpastoUniforms, packTactileBrushUniforms,
  selectNativeRenderBackend, type NativeRenderCapabilitySnapshot, type WebGpuComputeDeviceLike,
} from "./index";

const caps: NativeRenderCapabilitySnapshot = {
  hasWebGpu: true, webGpuAdapterAvailable: true, webGpuFeatures: [],
  hasWebAssembly: true, supportsWasmMemory64: true, supportsWasmSimd128: true,
};
function composite(width = 2, height = 1) {
  const srcTile = new Float32Array(width * height * 4).fill(0.3);
  const dstTile = new Float32Array(width * height * 4).fill(0.2);
  for (let i = 3; i < srcTile.length; i += 4) { srcTile[i] = 1; dstTile[i] = 1; }
  return { stage: "sparse-composite" as const, params: { width, height, blendMode: "add" as const, inputIsSrgb: false, outputToSrgb: false }, srcTile, dstTile };
}
function deviceStub(): WebGpuComputeDeviceLike {
  return {
    createShaderModule: vi.fn(() => ({})), createComputePipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
    createBuffer: vi.fn(() => ({})), createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(() => ({ beginComputePass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups: vi.fn(), end: vi.fn() }), finish: () => ({}) })),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
  };
}

describe("실행·버퍼·디스패치 경계", () => {
  it("결과 회수와 검증 없는 GPU 제출을 성공으로 보고하지 않고 CPU 픽셀을 완성한다", () => {
    const device = deviceStub(); const pass = composite(1, 1);
    const result = executeTilePassWithFallback({ device, pass });
    expect(result.executedBackend).toBe("cpu-reference-parity");
    expect(result.cpuReferenceResult).not.toBeNull();
    expect(result.fallbackReason).toContain("GPU");
    expect(pass.dstTile[0]).toBeCloseTo(0.5, 5);
    expect(device.queue.submit).not.toHaveBeenCalled();
  });

  it("짧거나 비유한 입력은 첫 픽셀도 바꾸기 전에 거절한다", () => {
    for (const invalid of ["short", "nonfinite"]) {
      const pass = composite();
      if (invalid === "short") pass.srcTile = pass.srcTile.subarray(0, 4);
      else pass.srcTile[7] = Number.NaN;
      const before = pass.dstTile.slice();
      expect(() => executeCpuReferenceTilePass(pass)).toThrow();
      expect(pass.dstTile).toEqual(before);
    }
  });

  it("유한 입력의 Float32 출력 오버플로도 원본을 오염시키지 않는다", () => {
    const pass = composite(1, 1);
    pass.srcTile[0] = 3.4e38; pass.dstTile[0] = 3.4e38;
    const before = pass.dstTile.slice();
    expect(() => executeCpuReferenceTilePass(pass)).toThrow();
    expect(pass.dstTile).toEqual(before);
  });

  it.each([
    { source: 1.5, sourceAlpha: 1, destination: 0.25, destinationAlpha: 1, opacity: 1 },
    { source: 1.5, sourceAlpha: 0.5, destination: 2, destinationAlpha: 0.75, opacity: 1 },
    { source: 1.5, sourceAlpha: 1, destination: 1.25, destinationAlpha: 0.5, opacity: 0.25 },
  ])("선형 normal은 HDR source-over를 보존한다: %o", ({ source, sourceAlpha, destination, destinationAlpha, opacity }) => {
    const srcTile = new Float32Array([source, source, source, sourceAlpha]);
    const dstTile = new Float32Array([destination, destination, destination, destinationAlpha]);
    executeCpuReferenceTilePass({ stage: "sparse-composite", params: { width: 1, height: 1, blendMode: "normal", opacity, inputIsSrgb: false, outputToSrgb: false }, srcTile, dstTile });
    const alpha = sourceAlpha * opacity;
    const outputAlpha = alpha + destinationAlpha * (1 - alpha);
    const expected = (source * alpha + destination * destinationAlpha * (1 - alpha)) / outputAlpha;
    expect(dstTile[0]).toBeCloseTo(expected, 6);
    expect(dstTile[1]).toBeCloseTo(expected, 6);
    expect(dstTile[2]).toBeCloseTo(expected, 6);
    expect(dstTile[3]).toBeCloseTo(outputAlpha, 6);
  });

  it("impasto의 선형 1.5를 normal 합성에서 유지하고 sRGB 출력에서만 표시 범위로 제한한다", () => {
    const lit = new Float32Array(4);
    executeCpuReferenceTilePass({ stage: "impasto-relief", params: { width: 1, height: 1, ambientLevel: 1.5, keyIntensity: 0, rimIntensity: 0, specularStrength: 0 }, heightIn: new Float32Array([1]), colorIn: new Float32Array([1, 0.5, 0.25, 1]), colorOut: lit });
    expect(lit[0]).toBe(1.5);
    const dstTile = new Float32Array([0.25, 0.25, 0.25, 1]);
    executeCpuReferenceTilePass({ stage: "sparse-composite", params: { width: 1, height: 1, blendMode: "normal", inputIsSrgb: false, outputToSrgb: false }, srcTile: lit, dstTile });
    expect(dstTile).toEqual(lit);
    const display = new Float32Array([0.25, 0.25, 0.25, 1]);
    executeCpuReferenceTilePass({ stage: "sparse-composite", params: { width: 1, height: 1, blendMode: "normal", inputIsSrgb: false, outputToSrgb: true }, srcTile: lit, dstTile: display });
    expect(display[0]).toBeCloseTo(1, 6);
  });

  it("서로 겹치는 다른 입력·출력 뷰는 계산 전에 거절한다", () => {
    const arena = new Float32Array(12).fill(0.5);
    const pass = { ...composite(), srcTile: arena.subarray(0, 8), dstTile: arena.subarray(4, 12) };
    const before = arena.slice();
    expect(() => executeCpuReferenceTilePass(pass)).toThrow();
    expect(arena).toEqual(before);
  });

  it("동일한 픽셀 뷰를 사용하는 정상 제자리 합성은 보존한다", () => {
    const pixels = new Float32Array([0.2, 0.2, 0.2, 1]);
    const pass = { ...composite(1, 1), srcTile: pixels, dstTile: pixels };
    const result = executeCpuReferenceTilePass(pass);
    expect(result.modifiedPixels).toBe(1);
    expect(pixels[0]).toBeCloseTo(0.4, 5);
    expect(pixels[3]).toBe(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, 100000])("실행 크기 %s는 순회·할당 전에 거절한다", (width) => {
    const pass = { ...composite(1, 1), params: { width, height: 1 } };
    expect(() => executeCpuReferenceTilePass(pass)).toThrow();
  });

  it("잘못된 uniform 오프셋·작은 대상 버퍼를 조용히 다른 버퍼로 바꾸지 않는다", () => {
    for (const offset of [1, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const target = new ArrayBuffer(128); new Uint8Array(target).fill(17);
      expect(() => packImpastoUniforms({ width: 1, height: 1 }, target, offset)).toThrow();
      expect(new Uint8Array(target).every((value) => value === 17)).toBe(true);
    }
    expect(() => packImpastoUniforms({ width: 1, height: 1 }, new ArrayBuffer(16))).toThrow();
    expect(new DataView(packTactileBrushUniforms({ width: 4294967297, height: 1 })).getUint32(0, true)).toBe(4294967295);
  });

  it("서로 다른 레이어·설정의 작업을 합치거나 순서를 바꾸지 않는다", () => {
    const plan = buildKonvaBypassDispatchPlan({ canvasWidth: 64, canvasHeight: 64, capabilities: caps, operations: [
      { id: "first", kind: "sparse-tile-composite", layerId: "layer-a", blendMode: "multiply", opacity: 0.2, dirtyRect: { x: 0, y: 0, width: 16, height: 16 } },
      { id: "second", kind: "sparse-tile-composite", layerId: "layer-b", blendMode: "screen", opacity: 0.8, dirtyRect: { x: 0, y: 0, width: 16, height: 16 } },
      { id: "last", kind: "brush-dab-tactile", layerId: "layer-b", dirtyRect: { x: 0, y: 0, width: 16, height: 16 } },
    ] });
    expect(plan.dispatchBatch.commands).toHaveLength(3);
    expect(plan.dispatchBatch.commands.map((command) => command.operationId)).toEqual(["first", "second", "last"]);
    expect(plan.dispatchBatch.commands.map((command) => command.layerId)).toEqual(["layer-a", "layer-b", "layer-b"]);
    expect(plan.dispatchBatch.commands.map((command) => command.stage)).toEqual(["sparse-composite", "sparse-composite", "tactile-bristle"]);
  });

  it("작업 크기와 메타데이터는 params 덮어쓰기로 서로 달라지지 않는다", () => {
    const batch = createTileDispatchBatch({ backend: "webgpu-wgsl", requests: [{
      tileX: 0, tileY: 0, tileWidth: 32, tileHeight: 16, stage: "tactile-bristle", dirtyRect: { x: 0, y: 0, width: 32, height: 16 },
      brushParams: { width: 2000, height: 2000 },
    }] });
    const view = new DataView(batch.uniformArenaBuffer);
    expect(view.getUint32(0, true)).toBe(32); expect(view.getUint32(4, true)).toBe(16);
    expect(batch.zeroCopyCommandCount).toBe(0);
    expect(batch.commands[0]?.zeroCopy).toBe(false);
  });

  it("비유한 캔버스·과도한 명령은 타일 열거·arena 할당 전에 거절한다", () => {
    expect(() => buildKonvaBypassDispatchPlan({ canvasWidth: Number.NaN, canvasHeight: 1, capabilities: caps, operations: [] })).toThrow();
    const request = { tileX: 0, tileY: 0, stage: "sparse-composite" as const, dirtyRect: { x: 0, y: 0, width: 1, height: 1 } };
    expect(() => createTileDispatchBatch({ backend: "webgpu-wgsl", requests: Array.from({ length: 4097 }, () => request) })).toThrow();
    expect(selectNativeRenderBackend(caps).executionVerified).toBe(false);
  });
});
