import { describe, expect, it, vi } from "vitest";
import { link } from "wesl";

import {
  createStudioGpuTileCullTransferPacket,
  planStudioGpuMipCulledTileFrame,
  planStudioGpuTilePresentation,
  uploadStudioGpuCulledTilesToBuffer,
} from "./studio-webgpu-tile-compositor";
import {
  computeOptimalMipLevel,
  downsampleMipLevelCpu,
  materializeCulledTileDescriptors,
  planGpuMipmapPyramid,
  STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL,
  StudioWebGpuTileViewportCuller,
} from "./studio-webgpu-tile-viewport-culling";
import { measureLineartEdgeEnergy } from "./studio-webgpu-transform-resample-cpu";
import {
  STUDIO_TILE_INSTANCE_STRIDE_FLOATS,
  unpackZeroCopyWorkerPacket,
} from "./studio-webgpu-zero-copy-pack";

import type { StudioImageDataLike } from "../studio-filters";

describe("studio-webgpu-tile-viewport-culling", () => {
  it("WGSL Mipmap 다운샘플 Compute 셰이더가 wesl 파싱·링크 및 예약어 검사를 통과한다", async () => {
    const linked = await link({
      weslSrc: { "mipmap_downsample.wgsl": STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL },
      rootModuleName: "mipmap_downsample",
    });
    expect(linked.dest).toContain("@compute @workgroup_size(8, 8, 1)");
    expect(linked.dest).toContain("fn cs_generate_mip_level");
    expect(STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL).toContain("@group(0) @binding(0)");
    expect(STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL).toContain("@group(0) @binding(1)");
    expect(STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL).toContain("@group(0) @binding(2)");
    expect(STUDIO_WEBGPU_MIPMAP_DOWNSAMPLE_WGSL).not.toMatch(/\b(meta|active|self|ref|using)\b/u);
  });

  it("카메라 줌 배율에 따라 log2(1/zoom) 기반 최적 Mip 레벨을 정확히 선택한다", () => {
    expect(computeOptimalMipLevel(4.0, 6)).toMatchObject({ mipLevel: 0, scale: 1, mipStepMultiplier: 1 });
    expect(computeOptimalMipLevel(1.0, 6)).toMatchObject({ mipLevel: 0, scale: 1, mipStepMultiplier: 1 });
    expect(computeOptimalMipLevel(0.75, 6)).toMatchObject({ mipLevel: 0, scale: 1 });
    expect(computeOptimalMipLevel(0.5, 6)).toMatchObject({ mipLevel: 1, scale: 0.5, mipStepMultiplier: 2 });
    expect(computeOptimalMipLevel(0.25, 6)).toMatchObject({ mipLevel: 2, scale: 0.25, mipStepMultiplier: 4 });
    expect(computeOptimalMipLevel(0.125, 6)).toMatchObject({ mipLevel: 3, scale: 0.125, mipStepMultiplier: 8 });
    expect(computeOptimalMipLevel(0.01, 5)).toMatchObject({ mipLevel: 5, scale: 1 / 32, mipStepMultiplier: 32 });
  });

  it("1600×20000px 이상 대형 세로 웹툰 캔버스의 GPU Mipmap 피라미드와 O(visible) 뷰포트 컬링을 정확히 수행한다", () => {
    const pyramid = planGpuMipmapPyramid(1_600, 20_000, 512);
    expect(pyramid.levels[0]).toMatchObject({
      level: 0,
      width: 1_600,
      height: 20_000,
      columns: 4,
      rows: 40,
      totalTiles: 160,
      tileWorldSpan: 512,
    });
    expect(pyramid.levels[2]).toMatchObject({
      level: 2,
      width: 400,
      height: 5_000,
      columns: 1,
      rows: 10,
      totalTiles: 10,
      tileWorldSpan: 2_048,
    });

    const culler = new StudioWebGpuTileViewportCuller({ initialTileCapacity: 64 });

    // 100% 줌, 세로 중간 구간(y = 8200..9100, height = 900) 조회 + 1타일 프리페치 마진
    const frame1 = culler.cullAndSchedule({
      documentWidth: 1_600,
      documentHeight: 20_000,
      tileSize: 512,
      cameraZoom: 1.0,
      viewport: { x: 100, y: 8_200, width: 1_000, height: 900 },
      prefetchMarginTiles: 1,
    });

    // O(visible) 증명: 전체 160타일을 순회하지 않고 가시+프리페치 타일 수만큼만 방문
    expect(frame1.totalCanvasTilesAtMip0).toBe(160);
    expect(frame1.visitedTileIterations).toBe(frame1.visibleTileCount);
    expect(frame1.visibleTileCount).toBeLessThan(25);
    expect(frame1.culledOutCount).toBe(160 - frame1.visibleTileCount);
    expect(frame1.zeroAllocationSteadyState).toBe(true);
    expect(frame1.packedVisibleTiles.length).toBe(
      frame1.visibleTileCount * STUDIO_TILE_INSTANCE_STRIDE_FLOATS,
    );

    const tiles1 = materializeCulledTileDescriptors(frame1.packedVisibleTiles);
    // 핵심 가시 타일이 프리페치 링 타일보다 앞쪽에 우선 패킹되어야 한다.
    const firstPrefetchIdx = tiles1.findIndex((t) => t.isPrefetch);
    const lastCoreIdx = tiles1.reduce((acc, t, idx) => (t.isCoreVisible ? idx : acc), -1);
    expect(firstPrefetchIdx).toBeGreaterThan(lastCoreIdx);

    // 25% 줌아웃 시 Mip 레벨 2 선택 -> 1열 × 소수 행만 방문
    const zoomedOut = culler.cullAndSchedule({
      documentWidth: 1_600,
      documentHeight: 20_000,
      tileSize: 512,
      cameraZoom: 0.25,
      viewport: { x: 0, y: 4_096, width: 1_600, height: 3_600 },
      prefetchMarginTiles: 1,
    });
    expect(zoomedOut.mipSelection.mipLevel).toBe(2);
    expect(zoomedOut.totalTilesAtSelectedMip).toBe(10);
    expect(zoomedOut.visibleTileCount).toBeLessThanOrEqual(5);
    expect(zoomedOut.visitedTileIterations).toBe(zoomedOut.visibleTileCount);
  });

  it("Dirty-Rect와 교차하는 가시 타일만 선택적으로 재합성하고 무변경 프레임은 100% 재사용한다", () => {
    const culler = new StudioWebGpuTileViewportCuller({ initialTileCapacity: 64 });
    const baseInput = {
      documentWidth: 1_600,
      documentHeight: 20_000,
      tileSize: 512,
      cameraZoom: 1.0,
      viewport: { x: 0, y: 5_120, width: 1_024, height: 1_024 },
      prefetchMarginTiles: 1,
    };

    // 1프레임(콜드): 가시+프리페치 타일 모두 초기 dirty
    const cold = culler.cullAndSchedule(baseInput);
    expect(cold.dirtyTileCount).toBe(cold.visibleTileCount);
    expect(cold.reusedTileCount).toBe(0);

    // 2프레임(변경 없음): dirty 0건, 전원 재사용, 버퍼 재할당 0건
    const clean = culler.cullAndSchedule(baseInput);
    expect(clean.dirtyTileCount).toBe(0);
    expect(clean.reusedTileCount).toBe(clean.visibleTileCount);
    expect(clean.zeroAllocationSteadyState).toBe(true);

    // 3프레임: 타일 (1, 10) 내부의 100×80 국소 영역만 수정 -> 정확히 1개 타일만 dirty
    culler.markDirtyRect({ x: 600, y: 5_200, width: 100, height: 80 });
    // 가시 영역 밖 멀리 떨어진 수정 영역(y = 18000)은 이번 프레임 가시 타일을 건드리지 않아야 함
    culler.markDirtyRect({ x: 100, y: 18_000, width: 200, height: 200 });

    const partial = culler.cullAndSchedule(baseInput);
    expect(partial.dirtyTileCount).toBe(1);
    expect(partial.reusedTileCount).toBe(partial.visibleTileCount - 1);

    const tiles = materializeCulledTileDescriptors(partial.packedVisibleTiles);
    const dirtyTile = tiles[partial.dirtySlotIndices[0]!]!;
    expect(dirtyTile.column).toBe(1);
    expect(dirtyTile.row).toBe(10);
    expect(dirtyTile.isDirty).toBe(true);
    // 타일 (1, 10)의 원점은 (512, 5120) -> 로컬 dirty sub-rect는 (88, 80, 100, 80)
    expect(dirtyTile.dirtySubX).toBe(88);
    expect(dirtyTile.dirtySubY).toBe(80);
    expect(dirtyTile.dirtySubWidth).toBe(100);
    expect(dirtyTile.dirtySubHeight).toBe(80);
  });

  it("2× Mipmap CPU 다운샘플러가 Lanczos3·Catmull-Rom에서 2×2 Bilinear보다 선화 엣지 에너지와 대비를 더 잘 유지한다", () => {
    const width = 128;
    const height = 128;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        const ink = ((x % 20) >= 6 && (x % 20) < 9)
          || ((y % 20) >= 6 && (y % 20) < 9)
          || Math.abs(((x - y + width) % 24) - 10) < 1.5;
        const c = ink ? 20 : 240;
        data[off] = c;
        data[off + 1] = c;
        data[off + 2] = c;
        data[off + 3] = 255;
      }
    }
    const src: StudioImageDataLike = { width, height, data };
    const mipLanczos = downsampleMipLevelCpu(src, "lanczos3");
    const mipCatmull = downsampleMipLevelCpu(src, "catmull-rom");
    const mipBilinear = downsampleMipLevelCpu(src, "bilinear");

    expect(mipLanczos.width).toBe(64);
    expect(mipLanczos.height).toBe(64);
    const lanczosMetrics = measureLineartEdgeEnergy(mipLanczos);
    const catmullMetrics = measureLineartEdgeEnergy(mipCatmull);
    const bilinearMetrics = measureLineartEdgeEnergy(mipBilinear);
    expect(lanczosMetrics.edgeEnergy).toBeGreaterThan(bilinearMetrics.edgeEnergy * 1.08);
    expect(catmullMetrics.edgeEnergy).toBeGreaterThan(bilinearMetrics.edgeEnergy);
    expect(lanczosMetrics.peakContrast).toBeGreaterThan(bilinearMetrics.peakContrast);
  });

  it("타일 컴포지터 통합 경로(Mip 컬링 · 제로카피 GPU 업로드 · Transferable 워커 패킷 · scratch 정점 버퍼)가 연결된다", () => {
    const culler = new StudioWebGpuTileViewportCuller({ initialTileCapacity: 64 });
    const viewport = {
      logicalWidth: 1_600,
      logicalHeight: 20_000,
      scaleX: 1,
      scaleY: 20_000 / 1_000,
      offsetX: 0,
      offsetY: -(6_000 / 1_000) * 20_000,
      flipX: false,
    };

    const plan = planStudioGpuMipCulledTileFrame(viewport, {
      cameraZoom: 0.5,
      culler,
      prefetchMarginTiles: 1,
    });
    expect(plan.mipSelection.mipLevel).toBe(1);
    expect(plan.cullResult.visibleTileCount).toBeGreaterThan(0);

    const writeBuffer = vi.fn();
    const fakeBuffer = { label: "tile-instances" } as unknown as GPUBuffer;
    const uploadedBytes = uploadStudioGpuCulledTilesToBuffer(
      { writeBuffer },
      fakeBuffer,
      plan.cullResult,
    );
    expect(uploadedBytes).toBe(plan.cullResult.packedVisibleTiles.byteLength);
    expect(writeBuffer).toHaveBeenCalledTimes(1);

    const { packet, transfer } = createStudioGpuTileCullTransferPacket(plan.cullResult, 7);
    expect(transfer).toHaveLength(1);
    expect(transfer[0]).toBe(packet.buffer);
    const unpacked = unpackZeroCopyWorkerPacket(packet);
    expect(unpacked.frameSequence).toBe(7);
    expect(unpacked.mipLevel).toBe(1);
    expect(unpacked.tileInstanceCount).toBe(plan.cullResult.visibleTileCount);
    expect(unpacked.tileInstances.buffer).toBe(packet.buffer);

    // planStudioGpuTilePresentation scratch 재사용(제로 할당) 검증
    const scratch = new Float32Array(128);
    const pres = planStudioGpuTilePresentation(
      {
        items: [
          {
            tile: { id: "0:0", column: 0, row: 0, x: 0, y: 0, width: 512, height: 512 },
            resource: { id: "tex" },
            descriptor: {
              id: "0:0",
              label: "tile",
              width: 516,
              height: 516,
              contentX: 2,
              contentY: 2,
              contentWidth: 512,
              contentHeight: 512,
              byteLength: 516 * 516 * 4,
              renderX: -2,
              renderY: -2,
              renderWidth: 516,
              renderHeight: 516,
            },
          },
        ],
      } as unknown as Parameters<typeof planStudioGpuTilePresentation>[0],
      viewport,
      scratch,
    );
    expect(pres.vertices.buffer).toBe(scratch.buffer);
    expect(pres.vertices.length).toBe(24);
  });
});
