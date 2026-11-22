/**
 * CSP 메쉬 변형(`editactiontransformmesh`) `rows x cols` 제어 격자 및 역방향 무게중심(barycentric) 래스터 워프 엔진.
 *
 * `2..8 x 2..8` 제어점 격자 생성, 노드 이동, 4종 실무 프리셋(`arc`, `bulge`, `flag`, `perspective-arch`),
 * 셀 중심 대칭 4분할 삼각화(cell triangle subdivision), 그리고 역방향 무게중심 양선형 RGBA 샘플링을 제공한다.
 * 항등(identity) 격자에서는 입력 RGBA 바이트를 1바이트 오차 없이 그대로 재현한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import {
  sampleRgbaWithResampler,
  type StudioTransformResampleMode,
} from "../render/studio-webgpu-transform-resample-wgsl";
import {
  packMeshControlPointsInto,
  STUDIO_MESH_CONTROL_STRIDE_FLOATS,
} from "../render/studio-webgpu-zero-copy-pack";
import { sampleInverseBilinearRgba } from "./studio-corner-pin-transform";

import type { StudioImageDataLike } from "../studio-filters";

export const RASTER_MESH_GRID_MIN = 2;
export const RASTER_MESH_GRID_MAX = 8;

export const RASTER_MESH_PRESET_IDS = [
  "arc",
  "bulge",
  "flag",
  "perspective-arch",
] as const;

export type RasterMeshPresetId = (typeof RASTER_MESH_PRESET_IDS)[number];

export const RASTER_MESH_PRESET_LABELS: Readonly<Record<RasterMeshPresetId, string>> =
  Object.freeze({
    arc: "아치",
    bulge: "볼록 팽창",
    flag: "깃발 물결",
    "perspective-arch": "원근 아치",
  });

export interface RasterMeshControlNode {
  readonly row: number;
  readonly col: number;
  readonly restX: number;
  readonly restY: number;
  readonly x: number;
  readonly y: number;
}

export interface RasterMeshLattice {
  readonly width: number;
  readonly height: number;
  readonly rows: number;
  readonly cols: number;
  readonly nodes: readonly RasterMeshControlNode[];
}

export interface RasterMeshTriangleVertex {
  readonly restX: number;
  readonly restY: number;
  readonly x: number;
  readonly y: number;
}

export interface RasterMeshTriangle {
  readonly a: RasterMeshTriangleVertex;
  readonly b: RasterMeshTriangleVertex;
  readonly c: RasterMeshTriangleVertex;
}

export interface RasterMeshTransformOptions {
  readonly outputWidth?: number;
  readonly outputHeight?: number;
  /** 고품질 리샘플러(`lanczos3` · `catmull-rom` · `nearest-sharp`). 미지정 시 기존 양선형 동작을 유지한다. */
  readonly resampler?: StudioTransformResampleMode;
}

function clampGridCount(value: number, fallback = 4): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(RASTER_MESH_GRID_MAX, Math.max(RASTER_MESH_GRID_MIN, Math.round(value)));
}

/**
 * `2..8 x 2..8` 크기의 항등 제어점 격자(`rows * cols` 노드)를 생성한다.
 */
export function createRasterMeshLattice(
  width: number,
  height: number,
  rows = 4,
  cols = 4,
): RasterMeshLattice {
  const safeW = Number.isFinite(width) ? Math.max(1, Math.trunc(width)) : 1;
  const safeH = Number.isFinite(height) ? Math.max(1, Math.trunc(height)) : 1;
  const safeRows = clampGridCount(rows, 4);
  const safeCols = clampGridCount(cols, 4);
  const maxX = Math.max(0, safeW - 1);
  const maxY = Math.max(0, safeH - 1);

  const nodes: RasterMeshControlNode[] = [];
  for (let r = 0; r < safeRows; r += 1) {
    const restY = safeRows > 1 ? (r / (safeRows - 1)) * maxY : 0;
    for (let c = 0; c < safeCols; c += 1) {
      const restX = safeCols > 1 ? (c / (safeCols - 1)) * maxX : 0;
      nodes.push({ row: r, col: c, restX, restY, x: restX, y: restY });
    }
  }

  return { width: safeW, height: safeH, rows: safeRows, cols: safeCols, nodes };
}

/** 단일 격자 노드를 조회한다. 범위 밖 인덱스는 `null`을 반환한다. */
export function getRasterMeshNode(
  lattice: RasterMeshLattice,
  row: number,
  col: number,
): RasterMeshControlNode | null {
  if (row < 0 || row >= lattice.rows || col < 0 || col >= lattice.cols) return null;
  return lattice.nodes[row * lattice.cols + col] ?? null;
}

/** 특정 `(row, col)` 제어점의 현재 좌표를 변경한 새 격자를 반환한다. */
export function moveRasterMeshNode(
  lattice: RasterMeshLattice,
  row: number,
  col: number,
  nextX: number,
  nextY: number,
): RasterMeshLattice {
  if (
    row < 0 ||
    row >= lattice.rows ||
    col < 0 ||
    col >= lattice.cols ||
    !Number.isFinite(nextX) ||
    !Number.isFinite(nextY)
  ) {
    return lattice;
  }
  const targetIdx = row * lattice.cols + col;
  return {
    ...lattice,
    nodes: lattice.nodes.map((node, idx) =>
      idx === targetIdx ? { ...node, x: nextX, y: nextY } : node,
    ),
  };
}

/** 모든 제어점을 초기 `restX, restY` 위치로 되돌린 새 격자를 반환한다. */
export function resetRasterMeshLattice(lattice: RasterMeshLattice): RasterMeshLattice {
  return {
    ...lattice,
    nodes: lattice.nodes.map((node) => ({ ...node, x: node.restX, y: node.restY })),
  };
}

/**
 * 제어 격자에 변형 프리셋(`arc`, `bulge`, `flag`, `perspective-arch`)을 적용한다.
 * @param strength -1..1 정규화 강도 (기본 0.5). 0이면 항등 격자로 복귀한다.
 */
export function applyRasterMeshPreset(
  lattice: RasterMeshLattice,
  preset: RasterMeshPresetId,
  strength = 0.5,
): RasterMeshLattice {
  const s = Number.isFinite(strength) ? Math.max(-1, Math.min(1, strength)) : 0.5;
  const maxX = Math.max(1, lattice.width - 1);
  const maxY = Math.max(1, lattice.height - 1);
  const cx = maxX * 0.5;
  const cy = maxY * 0.5;

  const nodes = lattice.nodes.map((node) => {
    const u = (node.restX - cx) / Math.max(0.5, cx); // -1..1
    const v = (node.restY - cy) / Math.max(0.5, cy); // -1..1
    const ty = node.restY / maxY; // 0(상단)..1(하단)

    switch (preset) {
      case "arc": {
        const dy = -s * maxY * 0.22 * (1 - u * u);
        return { ...node, x: node.restX, y: node.restY + dy };
      }
      case "bulge": {
        const rSq = u * u + v * v;
        const falloff = Math.max(0, 1 - rSq * 0.5);
        const scale = 1 + s * 0.36 * falloff;
        return {
          ...node,
          x: cx + (node.restX - cx) * scale,
          y: cy + (node.restY - cy) * scale,
        };
      }
      case "flag": {
        const dy = s * maxY * 0.14 * Math.sin(u * Math.PI);
        return { ...node, x: node.restX, y: node.restY + dy };
      }
      case "perspective-arch": {
        const horizScale = 1 - s * 0.3 * (1 - ty);
        const archLift = -s * maxY * 0.16 * (1 - u * u) * (1 - 0.45 * ty);
        return {
          ...node,
          x: cx + (node.restX - cx) * horizScale,
          y: node.restY + archLift,
        };
      }
    }
  });

  return { ...lattice, nodes };
}

/**
 * 각 사각형 셀을 셀 중심점 기준 4개의 대칭 삼각형으로 분할하여 대각선 비대칭 왜곡을 제거한다.
 */
export function subdivideRasterMeshTriangles(
  lattice: RasterMeshLattice,
): readonly RasterMeshTriangle[] {
  const triangles: RasterMeshTriangle[] = [];
  const { rows, cols, nodes } = lattice;
  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const p00 = nodes[r * cols + c]!;
      const p10 = nodes[r * cols + (c + 1)]!;
      const p11 = nodes[(r + 1) * cols + (c + 1)]!;
      const p01 = nodes[(r + 1) * cols + c]!;

      const center: RasterMeshTriangleVertex = {
        restX: (p00.restX + p10.restX + p11.restX + p01.restX) * 0.25,
        restY: (p00.restY + p10.restY + p11.restY + p01.restY) * 0.25,
        x: (p00.x + p10.x + p11.x + p01.x) * 0.25,
        y: (p00.y + p10.y + p11.y + p01.y) * 0.25,
      };

      triangles.push(
        { a: p00, b: p10, c: center },
        { a: p10, b: p11, c: center },
        { a: p11, b: p01, c: center },
        { a: p01, b: p00, c: center },
      );
    }
  }
  return triangles;
}

/**
 * 제어 격자(`lattice`)의 셀 삼각형 분할과 역방향 무게중심(inverse barycentric) 보간을 통해
 * 입력 RGBA 이미지를 워프한 새 버퍼를 반환한다.
 */
export function applyRasterMeshTransform(
  source: StudioImageDataLike,
  lattice: RasterMeshLattice,
  options: RasterMeshTransformOptions = {},
): StudioImageDataLike {
  const { width, height, data } = source;
  const rawOutW = options.outputWidth ?? width;
  const rawOutH = options.outputHeight ?? height;
  const outW = Number.isFinite(rawOutW) ? Math.max(1, Math.trunc(rawOutW)) : Math.max(1, Math.trunc(width) || 1);
  const outH = Number.isFinite(rawOutH) ? Math.max(1, Math.trunc(rawOutH)) : Math.max(1, Math.trunc(height) || 1);
  const out = new Uint8ClampedArray(outW * outH * 4);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width: outW, height: outH, data: out };
  }

  const triangles = subdivideRasterMeshTriangles(lattice);
  const visited = new Uint8Array(outW * outH);

  for (const tri of triangles) {
    const { a, b, c } = tri;
    const det = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(det) < 1e-7) continue;
    const invDet = 1 / det;

    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(outW - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(outH - 1, Math.ceil(Math.max(a.y, b.y, c.y)));

    for (let py = minY; py <= maxY; py += 1) {
      const rowOffset = py * outW;
      for (let px = minX; px <= maxX; px += 1) {
        const pixelIndex = rowOffset + px;
        if (visited[pixelIndex] !== 0) continue;

        const w0 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) * invDet;
        const w1 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) * invDet;
        const w2 = 1 - w0 - w1;

        if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;

        visited[pixelIndex] = 1;
        const sx = w0 * a.restX + w1 * b.restX + w2 * c.restX;
        const sy = w0 * a.restY + w1 * b.restY + w2 * c.restY;
        const outOffset = pixelIndex * 4;
        if (options.resampler && options.resampler !== "bilinear") {
          sampleRgbaWithResampler(data, width, height, sx, sy, out, outOffset, options.resampler, 1, 1);
        } else {
          sampleInverseBilinearRgba(data, width, height, sx, sy, out, outOffset);
        }
      }
    }
  }

  return { width: outW, height: outH, data: out };
}

/**
 * `RasterMeshLattice` 제어점을 WebGPU Compute 셰이더(`mesh_nodes: array<vec4<f32>>`) 및
 * 제로카피 Worker 패킷용 연속 `Float32Array` 버퍼에 패킹한다.
 */
export function packRasterMeshControlPoints(
  lattice: RasterMeshLattice,
  target?: Float32Array,
  offset = 0,
): Float32Array {
  const required = offset + lattice.nodes.length * STUDIO_MESH_CONTROL_STRIDE_FLOATS;
  const buffer = target ?? new Float32Array(required);
  packMeshControlPointsInto(buffer, offset, lattice.nodes);
  return buffer;
}
