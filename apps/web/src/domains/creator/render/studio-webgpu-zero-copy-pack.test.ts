import { describe, expect, it, vi } from "vitest";

import {
  createZeroCopyWorkerPacket,
  STUDIO_LIQUIFY_OP_STRIDE_FLOATS,
  STUDIO_MESH_CONTROL_STRIDE_FLOATS,
  STUDIO_TILE_FLAG_CORE_VISIBLE,
  STUDIO_TILE_FLAG_DIRTY,
  STUDIO_TILE_INSTANCE_STRIDE_FLOATS,
  STUDIO_TRANSFORM_UNIFORM_FLOATS,
  STUDIO_ZERO_COPY_PACK_MAGIC,
  STUDIO_ZERO_COPY_PACK_VERSION,
  StudioZeroCopyRingPacker,
  unpackZeroCopyWorkerPacket,
  uploadFloat32ViewToGpuBuffer,
  type StudioPackedLiquifyOp,
  type StudioPackedMeshControlPoint,
  type StudioPackedTileInstance,
  type StudioPackedTransformUniformInput,
  type StudioZeroCopyWorkerPacket,
} from "./studio-webgpu-zero-copy-pack";

const SAMPLE_UNIFORMS: StudioPackedTransformUniformInput = {
  srcWidth: 1_600,
  srcHeight: 20_000,
  dstWidth: 800,
  dstHeight: 10_000,
  inverseMatrix: [2, 0, 12, 0, 2, 24, 0.0001, -0.0002, 1],
  transformModeCode: 1,
  resamplerModeCode: 3,
  filterScaleX: 2,
  filterScaleY: 2,
  meshRows: 4,
  meshCols: 4,
  liquifyOpCount: 2,
  flags: 1,
};

const SAMPLE_TILES: readonly StudioPackedTileInstance[] = [
  {
    worldX: 0,
    worldY: 512,
    worldWidth: 512,
    worldHeight: 512,
    uvMinX: 0,
    uvMinY: 0,
    uvMaxX: 1,
    uvMaxY: 1,
    dirtySubX: 16,
    dirtySubY: 32,
    dirtySubWidth: 120,
    dirtySubHeight: 90,
    mipLevel: 1,
    column: 0,
    row: 1,
    flags: STUDIO_TILE_FLAG_CORE_VISIBLE | STUDIO_TILE_FLAG_DIRTY,
  },
  {
    worldX: 512,
    worldY: 512,
    worldWidth: 512,
    worldHeight: 512,
    uvMinX: 0,
    uvMinY: 0,
    uvMaxX: 0.75,
    uvMaxY: 1,
    dirtySubX: 0,
    dirtySubY: 0,
    dirtySubWidth: 0,
    dirtySubHeight: 0,
    mipLevel: 1,
    column: 1,
    row: 1,
    flags: STUDIO_TILE_FLAG_CORE_VISIBLE,
  },
];

const SAMPLE_MESH: readonly StudioPackedMeshControlPoint[] = [
  { restX: 0, restY: 0, x: 4, y: -2 },
  { restX: 100, restY: 0, x: 96, y: 3 },
  { restX: 0, restY: 100, x: 2, y: 105 },
  { restX: 100, restY: 100, x: 104, y: 98 },
];

const SAMPLE_LIQUIFY: readonly StudioPackedLiquifyOp[] = [
  { centerX: 50, centerY: 60, deltaX: 8, deltaY: -4, radius: 30, strength: 0.75, modeCode: 0, hardness: 0.4 },
  { centerX: 120, centerY: 80, deltaX: 0, deltaY: 0, radius: 45, strength: 0.6, modeCode: 3, hardness: 0.25 },
];

describe("studio-webgpu-zero-copy-pack", () => {
  it("트리플 링 패커가 정상 상태에서 GC 재할당 0건으로 사전 할당 Float32Array 슬롯을 순환 재사용한다", () => {
    const packer = new StudioZeroCopyRingPacker({
      ringSlots: 3,
      initialTileCapacity: 16,
      initialMeshNodeCapacity: 16,
      initialLiquifyOpCapacity: 8,
    });

    const slotBuffers: ArrayBufferLike[] = [];
    for (let frame = 0; frame < 9; frame += 1) {
      const view = packer.packTileInstances(SAMPLE_TILES);
      expect(view.slotIndex).toBe(frame % 3);
      expect(view.itemCount).toBe(2);
      expect(view.floatCount).toBe(2 * STUDIO_TILE_INSTANCE_STRIDE_FLOATS);
      expect(view.byteLength).toBe(2 * STUDIO_TILE_INSTANCE_STRIDE_FLOATS * 4);
      expect(view.reusedAllocation).toBe(true);
      if (frame < 3) {
        slotBuffers.push(view.data.buffer);
      } else {
        // 같은 슬롯 인덱스는 동일한 사전 할당 ArrayBuffer를 제로카피 재사용한다.
        expect(view.data.buffer).toBe(slotBuffers[frame % 3]);
      }
    }
    expect(packer.getStats().reallocationCount).toBe(0);

    // 용량 초과 시 1회 확장 후 다음 순환부터 다시 제로-알로케이션으로 수렴
    const largeTiles = Array.from({ length: 24 }, () => SAMPLE_TILES[0]!);
    const grown = packer.packTileInstances(largeTiles);
    expect(grown.reusedAllocation).toBe(false);
    expect(grown.itemCount).toBe(24);
    expect(packer.getStats().reallocationCount).toBe(1);

    // 슬롯 0, 1, 2 순환 후 다시 슬롯 0에 쓰면 재할당 없이 재사용
    packer.packTileInstances(SAMPLE_TILES);
    packer.packTileInstances(SAMPLE_TILES);
    const reusedAfterGrow = packer.packTileInstances(largeTiles);
    expect(reusedAfterGrow.slotIndex).toBe(grown.slotIndex);
    expect(reusedAfterGrow.reusedAllocation).toBe(true);
    expect(reusedAfterGrow.data.buffer).toBe(grown.data.buffer);
  });

  it("WebGPU queue.writeBuffer에 중간 복사 없이 버퍼·바이트오프셋·길이를 직접 전달하고 비정렬 오프셋을 차단한다", () => {
    const packer = new StudioZeroCopyRingPacker();
    const uniformView = packer.packTransformUniforms(SAMPLE_UNIFORMS);
    const writeBuffer = vi.fn();
    const fakeGpuBuffer = { label: "uniforms" } as unknown as GPUBuffer;

    const uploaded = uploadFloat32ViewToGpuBuffer({ writeBuffer }, fakeGpuBuffer, uniformView, 16);
    expect(uploaded).toBe(STUDIO_TRANSFORM_UNIFORM_FLOATS * 4);
    expect(writeBuffer).toHaveBeenCalledWith(
      fakeGpuBuffer,
      16,
      uniformView.data.buffer,
      uniformView.byteOffset,
      uniformView.byteLength,
    );

    expect(() => uploadFloat32ViewToGpuBuffer({ writeBuffer }, fakeGpuBuffer, uniformView, 2)).toThrow(RangeError);
  });

  it("Web Worker Transferable 패킷 생성·언팩 시 단일 ArrayBuffer를 제로카피 서브어레이 뷰로 완벽 왕복한다", () => {
    const { packet, transfer } = createZeroCopyWorkerPacket({
      frameSequence: 42,
      mipLevel: 2,
      uniforms: SAMPLE_UNIFORMS,
      tileInstances: SAMPLE_TILES,
      meshControlPoints: SAMPLE_MESH,
      liquifyOps: SAMPLE_LIQUIFY,
    });

    expect(packet.magic).toBe(STUDIO_ZERO_COPY_PACK_MAGIC);
    expect(packet.version).toBe(STUDIO_ZERO_COPY_PACK_VERSION);
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBe(packet.buffer);

    const unpacked = unpackZeroCopyWorkerPacket(packet);
    expect(unpacked.frameSequence).toBe(42);
    expect(unpacked.mipLevel).toBe(2);
    expect(unpacked.hasUniforms).toBe(true);
    expect(unpacked.tileInstanceCount).toBe(SAMPLE_TILES.length);
    expect(unpacked.meshControlPointCount).toBe(SAMPLE_MESH.length);
    expect(unpacked.liquifyOpCount).toBe(SAMPLE_LIQUIFY.length);

    // 제로카피 증명: 모든 반환 Float32Array 뷰가 전송된 단일 ArrayBuffer를 직접 가리킨다.
    expect(unpacked.uniforms.buffer).toBe(packet.buffer);
    expect(unpacked.tileInstances.buffer).toBe(packet.buffer);
    expect(unpacked.meshControlPoints.buffer).toBe(packet.buffer);
    expect(unpacked.liquifyOps.buffer).toBe(packet.buffer);

    // 16바이트 정렬 필드 값 검증
    expect(unpacked.uniforms).toHaveLength(STUDIO_TRANSFORM_UNIFORM_FLOATS);
    expect(unpacked.uniforms[0]).toBe(1_600);
    expect(unpacked.uniforms[1]).toBe(20_000);
    expect(unpacked.uniforms[4]).toBe(2);
    expect(unpacked.uniforms[12]).toBeCloseTo(0.0001, 6);
    expect(unpacked.uniforms[16]).toBe(1);
    expect(unpacked.uniforms[17]).toBe(3);

    expect(unpacked.tileInstances).toHaveLength(SAMPLE_TILES.length * STUDIO_TILE_INSTANCE_STRIDE_FLOATS);
    expect(unpacked.tileInstances[1]).toBe(512);
    expect(unpacked.tileInstances[8]).toBe(16);
    expect(unpacked.tileInstances[10]).toBe(120);
    expect(unpacked.tileInstances[15]).toBe(STUDIO_TILE_FLAG_CORE_VISIBLE | STUDIO_TILE_FLAG_DIRTY);

    expect(unpacked.meshControlPoints).toHaveLength(SAMPLE_MESH.length * STUDIO_MESH_CONTROL_STRIDE_FLOATS);
    expect(unpacked.meshControlPoints[2]).toBe(4);
    expect(unpacked.meshControlPoints[3]).toBe(-2);

    expect(unpacked.liquifyOps).toHaveLength(SAMPLE_LIQUIFY.length * STUDIO_LIQUIFY_OP_STRIDE_FLOATS);
    expect(unpacked.liquifyOps[0]).toBe(50);
    expect(unpacked.liquifyOps[4]).toBe(30);
    expect(unpacked.liquifyOps[14]).toBe(3);
  });

  it("손상되거나 분리(detached)된 워커 패킷을 안전하게 거부(fail-closed)한다", () => {
    const emptyPacket: StudioZeroCopyWorkerPacket = {
      kind: "studio-webgpu-zero-copy-packet",
      magic: STUDIO_ZERO_COPY_PACK_MAGIC,
      version: STUDIO_ZERO_COPY_PACK_VERSION,
      buffer: new ArrayBuffer(0),
      byteLength: 0,
    };
    expect(() => unpackZeroCopyWorkerPacket(emptyPacket)).toThrow(RangeError);

    const { packet } = createZeroCopyWorkerPacket({ frameSequence: 1, mipLevel: 0 });
    const header = new Uint32Array(packet.buffer, 0, 16);
    header[0] = 0xdeadbeef;
    expect(() => unpackZeroCopyWorkerPacket(packet)).toThrow(RangeError);
  });
});
