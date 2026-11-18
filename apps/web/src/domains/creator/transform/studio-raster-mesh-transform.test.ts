import { describe, expect, it } from "vitest";

import {
  applyRasterMeshPreset,
  applyRasterMeshTransform,
  createRasterMeshLattice,
  getRasterMeshNode,
  moveRasterMeshNode,
  RASTER_MESH_GRID_MAX,
  RASTER_MESH_GRID_MIN,
  RASTER_MESH_PRESET_IDS,
  resetRasterMeshLattice,
  subdivideRasterMeshTriangles,
} from "./studio-raster-mesh-transform";

import type { StudioImageDataLike } from "../studio-filters";

function createPatternImage(width: number, height: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = (x * 37 + y * 11) & 0xff;
      data[idx + 1] = (x * 19 + y * 59) & 0xff;
      data[idx + 2] = (x * 71 + y * 23) & 0xff;
      // 반투명 픽셀과 투명(RGB != 0) 픽셀까지 섞어 바이트 무손실을 검증한다.
      data[idx + 3] = (x * 3 + y * 5) % 7 === 0 ? 0 : ((x * 43 + y * 29) & 0xff);
    }
  }
  return { width, height, data };
}

describe("studio-raster-mesh-transform", () => {
  it("제어 격자 크기를 2..8 x 2..8 범위로 클램프하고 대칭 4분할 삼각형을 생성한다", () => {
    const clampedSmall = createRasterMeshLattice(64, 48, 1, 0);
    expect(clampedSmall.rows).toBe(RASTER_MESH_GRID_MIN);
    expect(clampedSmall.cols).toBe(RASTER_MESH_GRID_MIN);
    expect(clampedSmall.nodes).toHaveLength(4);
    expect(subdivideRasterMeshTriangles(clampedSmall)).toHaveLength(4);

    const clampedLarge = createRasterMeshLattice(64, 48, 99, 12);
    expect(clampedLarge.rows).toBe(RASTER_MESH_GRID_MAX);
    expect(clampedLarge.cols).toBe(RASTER_MESH_GRID_MAX);
    expect(clampedLarge.nodes).toHaveLength(64);
    expect(subdivideRasterMeshTriangles(clampedLarge)).toHaveLength(7 * 7 * 4);
  });

  it("항등(identity) 제어 격자는 반투명·투명 경계를 포함해 입력 RGBA를 바이트 단위로 그대로 재현한다", () => {
    const src = createPatternImage(17, 15);
    const lattice = createRasterMeshLattice(17, 15, 5, 6);
    const warped = applyRasterMeshTransform(src, lattice);
    expect([...warped.data]).toEqual([...src.data]);
  });

  it("4종의 메쉬 변형 프리셋(arc, bulge, flag, perspective-arch)과 초기화가 정상 동작한다", () => {
    const base = createRasterMeshLattice(41, 31, 5, 5);
    for (const preset of RASTER_MESH_PRESET_IDS) {
      const deformed = applyRasterMeshPreset(base, preset, 0.65);
      const changedCount = deformed.nodes.filter(
        (n) => Math.abs(n.x - n.restX) > 0.01 || Math.abs(n.y - n.restY) > 0.01,
      ).length;
      expect(changedCount).toBeGreaterThan(0);

      const reset = resetRasterMeshLattice(deformed);
      expect(reset.nodes.every((n) => n.x === n.restX && n.y === n.restY)).toBe(true);
    }
  });

  it("개별 제어점 이동이 워프 결과 픽셀을 지정한 방향으로 이동시킨다", () => {
    const width = 21;
    const height = 21;
    const data = new Uint8ClampedArray(width * height * 4);
    // 중앙 3x3 빨간 사각형 배치
    for (let y = 9; y <= 11; y += 1) {
      for (let x = 9; x <= 11; x += 1) {
        const idx = (y * width + x) * 4;
        data[idx] = 250;
        data[idx + 1] = 20;
        data[idx + 2] = 30;
        data[idx + 3] = 255;
      }
    }
    const src: StudioImageDataLike = { width, height, data };
    const base = createRasterMeshLattice(width, height, 3, 3);
    expect(getRasterMeshNode(base, 1, 1)?.restX).toBe(10);

    // 중앙 제어점 (1, 1)을 오른쪽으로 +4px 이동
    const moved = moveRasterMeshNode(base, 1, 1, 14, 10);
    const out = applyRasterMeshTransform(src, moved);

    const shiftedIdx = (10 * width + 14) * 4;
    expect(out.data[shiftedIdx]).toBeGreaterThan(200);
    expect(out.data[shiftedIdx + 3]).toBeGreaterThan(200);
  });
});
