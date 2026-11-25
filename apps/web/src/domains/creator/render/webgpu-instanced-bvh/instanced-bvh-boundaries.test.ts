import { describe, expect, it } from "vitest";
import { GPU_FRUSTUM_CULL_INDIRECT_WGSL, buildFlatBvh2d, computeSceneArenaByteLayout, createSceneObjectArena,
  emulateGpuFrustumCullPass, estimatePipelineMemoryFootprint, getGraphicsPaperPipelineSpec, hitTestPointBvh, packAllSceneInstancesForGpuCull,
  packCullUniforms, packInstancedDrawBuffer, pushSceneObject, queryViewportVisibleIndices, validateInstancedWgslBundle } from "./index";

function scene(rotationRad = 0) {
  const arena = createSceneObjectArena(1);
  pushSceneObject(arena, { objectId: 1, minX: -2, minY: -0.5, maxX: 2, maxY: 0.5, kindCode: 0, rotationRad });
  return arena;
}

describe("BVH·인스턴스 패킹의 입력·원본 보존 경계", () => {
  it.each([NaN, Infinity, -1, 0.5, 2 ** 29])("용량 %s를 비트 overflow나 과대 할당 전에 거부한다", capacity => {
    expect(() => computeSceneArenaByteLayout(capacity)).toThrow(RangeError);
  });
  it("Float32로 표현할 수 없는 좌표는 아레나 쓰기 전에 거부한다", () => {
    const arena = createSceneObjectArena(1); const before = new Uint8Array(arena.buffer).slice();
    expect(() => pushSceneObject(arena, { objectId: 1, minX: 1e308, minY: 0, maxX: 1e308, maxY: 1, kindCode: 0 })).toThrow();
    expect(arena.count).toBe(0); expect(new Uint8Array(arena.buffer)).toEqual(before);
  });
  it("잘못된 인스턴스 인덱스는 재사용 출력 버퍼를 일부 쓰기 전에 거부한다", () => {
    const arena = scene(); const output = new Float32Array(16).fill(42); const before = output.slice();
    expect(() => packInstancedDrawBuffer(arena, new Uint32Array([0, 2]), output)).toThrow();
    expect(output).toEqual(before);
  });
  it("입력 아레나와 겹치는 인스턴스 출력은 원본 컬럼을 덮어쓰지 않는다", () => {
    const arena = scene(); const before = new Uint8Array(arena.buffer).slice();
    expect(() => packInstancedDrawBuffer(arena, new Uint32Array([0]), new Float32Array(arena.buffer, 0, 8))).toThrow();
    expect(new Uint8Array(arena.buffer)).toEqual(before);
  });
  it("컬링 출력이 입력 아레나와 겹쳐도 원본 좌표를 덮어쓰지 않는다", () => {
    const arena = scene(); const bvh = buildFlatBvh2d(arena); const before = new Uint8Array(arena.buffer).slice();
    expect(() => queryViewportVisibleIndices(bvh, arena, { minX: -10, minY: -10, maxX: 10, maxY: 10 }, { outIndices: new Uint32Array(arena.buffer, 0, 1) })).toThrow();
    expect(new Uint8Array(arena.buffer)).toEqual(before);
  });
  it("비유한 BVH 옵션은 빈 계산 성공이나 잘못된 작업 버퍼로 숨기지 않는다", () => {
    expect(() => buildFlatBvh2d(scene(), { sahBins: NaN })).toThrow();
    expect(() => buildFlatBvh2d(scene(), { traversalCost: Infinity })).toThrow();
  });
  it("기존의 유한 옵션 클램핑과 0 비용 모델은 보존한다", () => {
    expect(() => buildFlatBvh2d(scene(), { maxLeafSize: 0, sahBins: 0, traversalCost: 0, intersectionCost: 0 })).not.toThrow();
  });
  it("회전된 사각형의 가시 영역은 CPU BVH와 GPU 참조가 일치하고 히트에서 사라지지 않는다", () => {
    const arena = scene(Math.PI / 4); const before = new Uint8Array(arena.buffer).slice(); const bvh = buildFlatBvh2d(arena);
    const viewport = { minX: 1.35, minY: 1.35, maxX: 1.45, maxY: 1.45 };
    const source = packAllSceneInstancesForGpuCull(arena);
    const gpu = emulateGpuFrustumCullPass(source.instanceFloatData, packCullUniforms({ viewMinX: viewport.minX, viewMinY: viewport.minY,
      viewMaxX: viewport.maxX, viewMaxY: viewport.maxY, objectCount: 1 }));
    expect(gpu.visibleCount).toBe(1); expect(queryViewportVisibleIndices(bvh, arena, viewport).visibleCount).toBe(gpu.visibleCount);
    expect(hitTestPointBvh(bvh, arena, 1.4, 1.4).topObjectId).toBe(1);
    expect(new Uint8Array(arena.buffer)).toEqual(before);
  });
  it("범위 밖 자식 노드는 빈 성공으로 감추지 않는다", () => {
    const arena = scene(); const bvh = buildFlatBvh2d(arena);
    bvh.nodeTopology[0] = 99; bvh.nodeTopology[1] = 99; bvh.nodeTopology[2] = 0;
    expect(() => queryViewportVisibleIndices(bvh, arena, { minX: -10, minY: -10, maxX: 10, maxY: 10 })).toThrow();
  });
  it("순환 노드는 무한 순회 전에 거부한다", () => {
    const arena = scene(); const bvh = buildFlatBvh2d(arena);
    bvh.nodeTopology[0] = 0; bvh.nodeTopology[1] = 0; bvh.nodeTopology[2] = 0;
    let reads = 0;
    // 기존 무한 루프 자체는 실행하지 않고, 유한한 읽기 예산 뒤 회귀 입력을 중단한다.
    const topology = new Proxy(bvh.nodeTopology, { get(target, key) {
      if (key === "0" && ++reads > 32) throw new Error("회귀 입력의 읽기 예산 초과");
      return Reflect.get(target, key, target);
    } });
    expect(() => queryViewportVisibleIndices({ ...bvh, nodeTopology: topology }, arena, { minX: -10, minY: -10, maxX: 10, maxY: 10 })).toThrow(/BVH.*순환/);
  });
  it("GPU 출력 용량 초과는 indirect instanceCount를 늘리지 않는 경로가 있다", () => {
    expect(GPU_FRUSTUM_CULL_INDIRECT_WGSL).toContain("atomicSub(&indirectArgs.instanceCount, 1u)");
    expect(GPU_FRUSTUM_CULL_INDIRECT_WGSL).toContain("arrayLength(&visibleInstances)");
  });
  it("정수 오버플로·과대 출력 한도는 uniform 출력 버퍼를 쓰기 전에 거부한다", () => {
    const buffer = new ArrayBuffer(48); new Uint8Array(buffer).fill(7); const before = new Uint8Array(buffer).slice();
    expect(() => packCullUniforms({ viewMinX: 0, viewMinY: 0, viewMaxX: 1, viewMaxY: 1, objectCount: 2 ** 32 }, buffer)).toThrow();
    expect(() => packCullUniforms({ viewMinX: 0, viewMinY: 0, viewMaxX: 1, viewMaxY: 1, objectCount: 1, maxOutputInstances: 2 ** 32 - 1 }, buffer)).toThrow();
    expect(new Uint8Array(buffer)).toEqual(before);
  });
  it("산술 메모리 추정은 표현 불가능한 단위 수를 Infinity 성공으로 반환하지 않는다", () => {
    expect(() => estimatePipelineMemoryFootprint("loop-blinn-2005", 1e308)).toThrow();
  });
  it("WGSL 문자열 검사는 실제 GPU 컴파일·렌더 검증과 구분한다", () => {
    const report = validateInstancedWgslBundle();
    expect(report).toMatchObject({ valid: true, scope: "static-source-contract", gpuCompiled: false });
  });
  it("기존 ID를 유지하며 Wetbrush 저자와 Vello 프로젝트 문서의 출처 유형을 정확히 기록한다", () => {
    const wetbrush = getGraphicsPaperPipelineSpec("chen-diverdi-wetbrush-2015");
    expect(wetbrush.authors).toBe("Zhili Chen, Byungmoon Kim, Daichi Ito & Huamin Wang");
    expect(wetbrush.venue).toBe("ACM TOG 34(6), Article 200");
    const vello = getGraphicsPaperPipelineSpec("levien-vello-piet-gpu-2025");
    expect(vello.title).toBe("Vello / Piet-GPU"); expect(vello.venue).toContain("프로젝트");
  });
});
