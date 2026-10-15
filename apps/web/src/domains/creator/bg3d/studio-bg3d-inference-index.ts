/**
 * 추론 후보용 균일 격자 해시 공간 색인 — 순수 모듈.
 *
 * 포인터가 움직일 때마다 장면 전체를 훑지 않도록, 점·모서리·면 조각을 월드 셀에 한 번만 넣어 두고
 * 쿼리마다 "커서 점(또는 레이)을 따라가는 셀 몇 개"만 연다. 쿼리 한 번의 비용은 방문 셀 수
 * (`maxCellsPerQuery`)와 훑는 특징 수(`maxFeaturesScannedPerQuery`)로 위에서 막혀 있고, 상한에
 * 걸리면 조용히 넘기지 않고 `truncated`로 알린다.
 */

import {
  STUDIO_BG3D_INFERENCE_BUDGET,
  STUDIO_BG3D_INFERENCE_DEFAULT_CELL_SIZE,
  STUDIO_BG3D_INFERENCE_MAX_CELL_SIZE,
  STUDIO_BG3D_INFERENCE_MIN_CELL_SIZE,
} from "./studio-bg3d-inference-kinds";

import type {
  StudioBg3dInferenceEdgeFeature,
  StudioBg3dInferencePointFeature,
  StudioBg3dInferenceSourceSet,
  StudioBg3dInferenceVolumeFeature,
} from "./studio-bg3d-inference-sources";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";

type V3 = StudioBg3dInferenceVec3;

const CELL_COORD_LIMIT = 65_535;
const CELL_AXIS_SPAN = 131_072;
const OVERFLOW_CAP = 128;

interface Cell {
  readonly points: number[];
  readonly edges: number[];
  readonly volumes: number[];
}

export interface StudioBg3dInferenceIndexStats {
  readonly cellSize: number;
  readonly cells: number;
  readonly points: number;
  readonly edges: number;
  readonly volumes: number;
  /** 셀 상한을 넘어 색인에서 빠진(또는 겹침 목록으로 옮긴) 모서리·면 수. */
  readonly overflowEdges: number;
  readonly overflowVolumes: number;
  readonly droppedFeatures: number;
}

export interface StudioBg3dInferenceQueryShape {
  /** 점 쿼리는 a === b. */
  readonly a: V3;
  readonly b: V3;
  /** a 지점의 허용 반경(월드 단위). 셀 크기를 넘으면 셀 크기로 줄인다. */
  readonly radius: number;
  /**
   * b 지점의 허용 반경. 원근 투영에서는 깊이에 비례해 반경이 커지므로, 선분 위에서 선형 보간한다.
   * 생략하면 `radius`와 같다.
   */
  readonly radiusEnd?: number;
}

export interface StudioBg3dInferenceQueryLimits {
  readonly maxCells?: number;
  readonly maxFeaturesScanned?: number;
}

export interface StudioBg3dInferenceQueryStats {
  readonly cellsVisited: number;
  readonly featuresScanned: number;
  readonly truncated: boolean;
}

export interface StudioBg3dInferenceQueryOutput {
  /** 허용 반경 안일 "가능성이 있는" 원시 후보. 정밀 거리 판정은 호출자가 한다. */
  readonly points: readonly StudioBg3dInferencePointFeature[];
  readonly edges: readonly StudioBg3dInferenceEdgeFeature[];
  readonly volumes: readonly StudioBg3dInferenceVolumeFeature[];
  readonly stats: StudioBg3dInferenceQueryStats;
}

export interface StudioBg3dInferenceIndex {
  readonly revision: string;
  readonly stats: StudioBg3dInferenceIndexStats;
  readonly source: StudioBg3dInferenceSourceSet;
  query(shape: StudioBg3dInferenceQueryShape, limits?: StudioBg3dInferenceQueryLimits): StudioBg3dInferenceQueryOutput;
}

function clampCoord(value: number): number {
  return Math.max(-CELL_COORD_LIMIT, Math.min(CELL_COORD_LIMIT, value));
}

function cellKey(ix: number, iy: number, iz: number): number {
  return ((ix + CELL_COORD_LIMIT + 1) * CELL_AXIS_SPAN + (iy + CELL_COORD_LIMIT + 1)) * CELL_AXIS_SPAN
    + (iz + CELL_COORD_LIMIT + 1);
}

function cellCoord(value: number, cellSize: number): number {
  return clampCoord(Math.floor(value / cellSize));
}

/**
 * 3D DDA(Amanatides–Woo)로 선분이 지나는 모든 셀을 순서대로 방문한다.
 * `visit`가 false를 돌려주면 즉시 멈춘다. 방문 횟수는 `maxSteps`로 막는다.
 */
export function traverseStudioBg3dInferenceCells(
  a: V3,
  b: V3,
  cellSize: number,
  maxSteps: number,
  visit: (ix: number, iy: number, iz: number, tEnter: number, tExit: number) => boolean,
): { readonly steps: number; readonly truncated: boolean } {
  let ix = cellCoord(a[0], cellSize);
  let iy = cellCoord(a[1], cellSize);
  let iz = cellCoord(a[2], cellSize);
  const endX = cellCoord(b[0], cellSize);
  const endY = cellCoord(b[1], cellSize);
  const endZ = cellCoord(b[2], cellSize);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const nextBoundary = (index: number, step: number): number => (step > 0 ? index + 1 : index) * cellSize;
  let tMaxX = stepX === 0 ? Infinity : (nextBoundary(ix, stepX) - a[0]) / dx;
  let tMaxY = stepY === 0 ? Infinity : (nextBoundary(iy, stepY) - a[1]) / dy;
  let tMaxZ = stepZ === 0 ? Infinity : (nextBoundary(iz, stepZ) - a[2]) / dz;
  const tDeltaX = stepX === 0 ? Infinity : cellSize / Math.abs(dx);
  const tDeltaY = stepY === 0 ? Infinity : cellSize / Math.abs(dy);
  const tDeltaZ = stepZ === 0 ? Infinity : cellSize / Math.abs(dz);
  const totalSteps = Math.abs(endX - ix) + Math.abs(endY - iy) + Math.abs(endZ - iz) + 1;
  let steps = 0;
  let tEnter = 0;
  for (let n = 0; n < totalSteps; n += 1) {
    if (steps >= maxSteps) return { steps, truncated: true };
    steps += 1;
    const isLast = n === totalSteps - 1;
    const tExit = isLast ? 1 : Math.min(1, Math.min(tMaxX, tMaxY, tMaxZ));
    if (!visit(ix, iy, iz, tEnter, tExit)) return { steps, truncated: false };
    if (isLast) break;
    tEnter = tExit;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      ix += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      iy += stepY;
      tMaxY += tDeltaY;
    } else {
      iz += stepZ;
      tMaxZ += tDeltaZ;
    }
  }
  return { steps, truncated: false };
}

function cellsOfAabb(
  min: V3,
  max: V3,
  cellSize: number,
  limit: number,
): { readonly keys: number[]; readonly overflow: boolean } {
  const x0 = cellCoord(min[0], cellSize);
  const y0 = cellCoord(min[1], cellSize);
  const z0 = cellCoord(min[2], cellSize);
  const x1 = cellCoord(max[0], cellSize);
  const y1 = cellCoord(max[1], cellSize);
  const z1 = cellCoord(max[2], cellSize);
  const count = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
  if (count > limit) return { keys: [], overflow: true };
  const keys: number[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      for (let z = z0; z <= z1; z += 1) keys.push(cellKey(x, y, z));
    }
  }
  return { keys, overflow: false };
}

export function clampStudioBg3dInferenceCellSize(value: number | undefined): number {
  const candidate = typeof value === "number" && Number.isFinite(value)
    ? value
    : STUDIO_BG3D_INFERENCE_DEFAULT_CELL_SIZE;
  return Math.max(
    STUDIO_BG3D_INFERENCE_MIN_CELL_SIZE,
    Math.min(STUDIO_BG3D_INFERENCE_MAX_CELL_SIZE, candidate),
  );
}

export function createStudioBg3dInferenceIndex(
  source: StudioBg3dInferenceSourceSet,
  options: { readonly cellSize?: number } = {},
): StudioBg3dInferenceIndex {
  const budget = STUDIO_BG3D_INFERENCE_BUDGET;
  const cellSize = clampStudioBg3dInferenceCellSize(options.cellSize);
  const cells = new Map<number, Cell>();
  const overflowEdgeIndices: number[] = [];
  const overflowVolumeIndices: number[] = [];
  let droppedFeatures = 0;

  const cellAt = (key: number): Cell => {
    let cell = cells.get(key);
    if (!cell) {
      cell = { points: [], edges: [], volumes: [] };
      cells.set(key, cell);
    }
    return cell;
  };

  source.points.forEach((feature, index) => {
    cellAt(cellKey(
      cellCoord(feature.point[0], cellSize),
      cellCoord(feature.point[1], cellSize),
      cellCoord(feature.point[2], cellSize),
    )).points.push(index);
  });

  source.edges.forEach((feature, index) => {
    const touched: number[] = [];
    let overflow = false;
    const walk = traverseStudioBg3dInferenceCells(
      feature.a,
      feature.b,
      cellSize,
      budget.maxCellsPerEdge,
      (ix, iy, iz) => {
        touched.push(cellKey(ix, iy, iz));
        return true;
      },
    );
    if (walk.truncated) overflow = true;
    if (overflow) {
      if (overflowEdgeIndices.length < OVERFLOW_CAP) overflowEdgeIndices.push(index);
      else droppedFeatures += 1;
      return;
    }
    for (const key of touched) cellAt(key).edges.push(index);
  });

  source.volumes.forEach((feature, index) => {
    const covered = cellsOfAabb(feature.min, feature.max, cellSize, budget.maxCellsPerEdge);
    if (covered.overflow) {
      if (overflowVolumeIndices.length < OVERFLOW_CAP) overflowVolumeIndices.push(index);
      else droppedFeatures += 1;
      return;
    }
    for (const key of covered.keys) cellAt(key).volumes.push(index);
  });

  const edgeStamp = new Uint32Array(source.edges.length);
  const volumeStamp = new Uint32Array(source.volumes.length);
  let queryCounter = 0;

  const stats: StudioBg3dInferenceIndexStats = Object.freeze({
    cellSize,
    cells: cells.size,
    points: source.points.length,
    edges: source.edges.length,
    volumes: source.volumes.length,
    overflowEdges: overflowEdgeIndices.length,
    overflowVolumes: overflowVolumeIndices.length,
    droppedFeatures,
  });

  return {
    revision: source.revision,
    stats,
    source,
    query(shape, limits = {}) {
      const maxCells = Math.max(1, Math.floor(limits.maxCells ?? budget.maxCellsPerQuery));
      const maxScanned = Math.max(1, Math.floor(limits.maxFeaturesScanned ?? budget.maxFeaturesScannedPerQuery));
      queryCounter += 1;
      if (queryCounter >= 0xfffffffe) {
        edgeStamp.fill(0);
        volumeStamp.fill(0);
        queryCounter = 1;
      }
      const stamp = queryCounter;
      const clampRadius = (value: number | undefined): number =>
        typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, cellSize)) : 0;
      const radiusStart = clampRadius(shape.radius);
      const radiusEnd = shape.radiusEnd === undefined ? radiusStart : clampRadius(shape.radiusEnd);
      const { a, b } = shape;
      const points: StudioBg3dInferencePointFeature[] = [];
      const edges: StudioBg3dInferenceEdgeFeature[] = [];
      const volumes: StudioBg3dInferenceVolumeFeature[] = [];
      const visited = new Set<number>();
      let scanned = 0;
      let truncated = false;

      const scanCell = (key: number): boolean => {
        const cell = cells.get(key);
        if (!cell) return true;
        for (const index of cell.points) {
          if (scanned >= maxScanned) return false;
          scanned += 1;
          const feature = source.points[index];
          if (feature) points.push(feature);
        }
        for (const index of cell.edges) {
          if (edgeStamp[index] === stamp) continue;
          if (scanned >= maxScanned) return false;
          edgeStamp[index] = stamp;
          scanned += 1;
          const feature = source.edges[index];
          if (feature) edges.push(feature);
        }
        for (const index of cell.volumes) {
          if (volumeStamp[index] === stamp) continue;
          if (scanned >= maxScanned) return false;
          volumeStamp[index] = stamp;
          scanned += 1;
          const feature = source.volumes[index];
          if (feature) volumes.push(feature);
        }
        return true;
      };

      const visitKey = (key: number): boolean => {
        if (visited.has(key)) return true;
        if (visited.size >= maxCells) {
          truncated = true;
          return false;
        }
        visited.add(key);
        if (!scanCell(key)) {
          truncated = true;
          return false;
        }
        return true;
      };

      // 선분이 셀 안에서 지나는 구간(p0→p1)을 허용 반경만큼 부풀린 상자가 걸치는 셀만 연다.
      // 허용 반경은 대개 셀보다 훨씬 작아 한 걸음에 1~8개 셀이면 충분하다. 중심 셀을 먼저 열어
      // 밀집 장면에서 상한에 걸려도 커서에 가장 가까운 후보가 남게 한다.
      const visitCell = (ix: number, iy: number, iz: number, tEnter: number, tExit: number): boolean => {
        if (!visitKey(cellKey(ix, iy, iz))) return false;
        const x0 = a[0] + (b[0] - a[0]) * tEnter;
        const y0 = a[1] + (b[1] - a[1]) * tEnter;
        const z0 = a[2] + (b[2] - a[2]) * tEnter;
        const x1 = a[0] + (b[0] - a[0]) * tExit;
        const y1 = a[1] + (b[1] - a[1]) * tExit;
        const z1 = a[2] + (b[2] - a[2]) * tExit;
        const padding = Math.max(
          radiusStart + (radiusEnd - radiusStart) * tEnter,
          radiusStart + (radiusEnd - radiusStart) * tExit,
        ) + 1e-9;
        const minX = cellCoord(Math.min(x0, x1) - padding, cellSize);
        const maxX = cellCoord(Math.max(x0, x1) + padding, cellSize);
        const minY = cellCoord(Math.min(y0, y1) - padding, cellSize);
        const maxY = cellCoord(Math.max(y0, y1) + padding, cellSize);
        const minZ = cellCoord(Math.min(z0, z1) - padding, cellSize);
        const maxZ = cellCoord(Math.max(z0, z1) + padding, cellSize);
        for (let cx = minX; cx <= maxX; cx += 1) {
          for (let cy = minY; cy <= maxY; cy += 1) {
            for (let cz = minZ; cz <= maxZ; cz += 1) {
              if (cx === ix && cy === iy && cz === iz) continue;
              if (!visitKey(cellKey(cx, cy, cz))) return false;
            }
          }
        }
        return true;
      };

      const walk = traverseStudioBg3dInferenceCells(a, b, cellSize, maxCells, visitCell);
      if (walk.truncated) truncated = true;

      if (!truncated) {
        for (const index of overflowEdgeIndices) {
          if (edgeStamp[index] === stamp) continue;
          if (scanned >= maxScanned) {
            truncated = true;
            break;
          }
          edgeStamp[index] = stamp;
          scanned += 1;
          const feature = source.edges[index];
          if (feature) edges.push(feature);
        }
      }
      if (!truncated) {
        for (const index of overflowVolumeIndices) {
          if (volumeStamp[index] === stamp) continue;
          if (scanned >= maxScanned) {
            truncated = true;
            break;
          }
          volumeStamp[index] = stamp;
          scanned += 1;
          const feature = source.volumes[index];
          if (feature) volumes.push(feature);
        }
      }

      return {
        points,
        edges,
        volumes,
        stats: { cellsVisited: visited.size, featuresScanned: scanned, truncated },
      };
    },
  };
}
