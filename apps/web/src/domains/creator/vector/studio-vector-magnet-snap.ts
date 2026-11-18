/**
 * Studio Vector Magnet Snap — CSP `벡터 자석(BrushUseVectorMagnet / BrushVectorMagnetPower)` 순수 공간 해시 스냅 엔진.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 *
 * 균일 격자(Uniform Spatial Hash)로 기존 벡터 획의 끝점(endpoint)과 선분(segment)을 색인하고,
 * 새 획의 시작점/끝점이 `magnetRadiusPx` 이내에 들어오면 끝점을 우선순위로 스냅한 뒤
 * 처음/마지막 `falloffSamples` 샘플에 3차 Hermite 감쇠를 적용해 꺾임 없이 자연스럽게 빨려 들어가게 한다.
 */

import type { DrawEl } from "../studio-element-model";

export interface VectorMagnetSettings {
  /** CSP `BrushUseVectorMagnet` 대응 토글. */
  readonly useVectorMagnet: boolean;
  /** CSP `BrushVectorMagnetPower` (0..100, 높을수록 반경·흡입력 증가). */
  readonly magnetPower: number;
  /** 명시적 탐색 반경(px). 생략 시 magnetPower 로부터 유도한다. */
  readonly magnetRadiusPx?: number;
  /** 시작/끝에서 Hermite 감쇠를 퍼뜨릴 샘플 개수. 기본 5. */
  readonly falloffSamples?: number;
  /** 끝점 스냅 우선 가중 비율(1 이상이면 같은 반경 안에서 선분보다 끝점을 우선 선택). 기본 1.35. */
  readonly endpointPriorityRatio?: number;
}

export interface VectorMagnetEndpointEntry {
  readonly strokeId: string;
  readonly pointIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface VectorMagnetSegmentEntry {
  readonly strokeId: string;
  readonly segIndex: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface VectorMagnetSpatialGrid {
  readonly cellSizePx: number;
  readonly endpointCells: ReadonlyMap<string, readonly VectorMagnetEndpointEntry[]>;
  readonly segmentCells: ReadonlyMap<string, readonly VectorMagnetSegmentEntry[]>;
  readonly strokeCount: number;
}

export interface VectorMagnetSnapTarget {
  readonly kind: "endpoint" | "segment";
  readonly strokeId: string;
  readonly pointIndex: number;
  readonly x: number;
  readonly y: number;
  readonly distance: number;
}

export interface VectorMagnetSnapResult {
  readonly stroke: DrawEl;
  readonly startSnap: VectorMagnetSnapTarget | null;
  readonly endSnap: VectorMagnetSnapTarget | null;
}

export const DEFAULT_VECTOR_MAGNET_SETTINGS: Readonly<VectorMagnetSettings> = Object.freeze({
  useVectorMagnet: false,
  magnetPower: 60,
  falloffSamples: 5,
  endpointPriorityRatio: 1.35,
});

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function hermite01(t: number): number {
  const u = clamp(t, 0, 1);
  return 1 - (3 * u * u - 2 * u * u * u);
}

/** `magnetPower`(0..100)에서 기본 탐색 반경(px)을 산출한다. */
export function resolveVectorMagnetRadiusPx(settings: VectorMagnetSettings): number {
  if (
    settings.magnetRadiusPx !== undefined &&
    Number.isFinite(settings.magnetRadiusPx) &&
    settings.magnetRadiusPx > 0
  ) {
    return settings.magnetRadiusPx;
  }
  const power = clamp(settings.magnetPower, 0, 100);
  if (power <= 0) return 0;
  return 4 + (power / 100) * 24;
}

/**
 * 벡터 스트로크 배열로부터 균일 격자 공간 해시(`VectorMagnetSpatialGrid`)를 구축한다.
 */
export function buildVectorMagnetGrid(
  strokes: readonly Pick<DrawEl, "id" | "points" | "kind" | "mode">[],
  cellSizePx = 32,
): VectorMagnetSpatialGrid {
  const safeCell = Math.max(4, Number.isFinite(cellSizePx) ? cellSizePx : 32);
  const endpointCells = new Map<string, VectorMagnetEndpointEntry[]>();
  const segmentCells = new Map<string, VectorMagnetSegmentEntry[]>();
  let indexedCount = 0;

  const pushEndpoint = (cx: number, cy: number, entry: VectorMagnetEndpointEntry): void => {
    const key = cellKey(cx, cy);
    const list = endpointCells.get(key);
    if (list) list.push(entry);
    else endpointCells.set(key, [entry]);
  };

  const pushSegment = (cx: number, cy: number, entry: VectorMagnetSegmentEntry): void => {
    const key = cellKey(cx, cy);
    const list = segmentCells.get(key);
    if (list) list.push(entry);
    else segmentCells.set(key, [entry]);
  };

  for (const stroke of strokes) {
    if (stroke.mode === "eraser") continue;
    if (stroke.kind !== undefined && stroke.kind !== "freehand") continue;
    const n = Math.floor(stroke.points.length / 2);
    if (n === 0) continue;
    indexedCount++;

    const endIndices = n === 1 ? [0] : [0, n - 1];
    for (const idx of endIndices) {
      const x = stroke.points[idx * 2]!;
      const y = stroke.points[idx * 2 + 1]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pushEndpoint(Math.floor(x / safeCell), Math.floor(y / safeCell), {
        strokeId: stroke.id,
        pointIndex: idx,
        x,
        y,
      });
    }

    for (let i = 0; i < n - 1; i++) {
      const x0 = stroke.points[i * 2]!;
      const y0 = stroke.points[i * 2 + 1]!;
      const x1 = stroke.points[(i + 1) * 2]!;
      const y1 = stroke.points[(i + 1) * 2 + 1]!;
      if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
        continue;
      }
      const minCx = Math.floor(Math.min(x0, x1) / safeCell);
      const maxCx = Math.floor(Math.max(x0, x1) / safeCell);
      const minCy = Math.floor(Math.min(y0, y1) / safeCell);
      const maxCy = Math.floor(Math.max(y0, y1) / safeCell);
      const entry: VectorMagnetSegmentEntry = { strokeId: stroke.id, segIndex: i, x0, y0, x1, y1 };
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          pushSegment(cx, cy, entry);
        }
      }
    }
  }

  return {
    cellSizePx: safeCell,
    endpointCells,
    segmentCells,
    strokeCount: indexedCount,
  };
}

/**
 * 기준 좌표 주변 `magnetRadiusPx` 안의 가장 가까운 끝점(우선) 또는 곡선 위 점을 조회한다.
 */
export function queryNearestVectorMagnetTarget(
  grid: VectorMagnetSpatialGrid,
  point: { readonly x: number; readonly y: number },
  options: {
    readonly magnetRadiusPx: number;
    readonly excludeStrokeId?: string;
    readonly endpointPriorityRatio?: number;
  },
): VectorMagnetSnapTarget | null {
  const radius = options.magnetRadiusPx;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(radius) || radius <= 0) {
    return null;
  }

  const priority = clamp(options.endpointPriorityRatio ?? 1, 0, 1);
  const endpointRadius = radius * (options.endpointPriorityRatio !== undefined && options.endpointPriorityRatio >= 1
    ? 1
    : priority);
  const minCx = Math.floor((point.x - radius) / grid.cellSizePx);
  const maxCx = Math.floor((point.x + radius) / grid.cellSizePx);
  const minCy = Math.floor((point.y - radius) / grid.cellSizePx);
  const maxCy = Math.floor((point.y + radius) / grid.cellSizePx);

  let bestEndpoint: VectorMagnetSnapTarget | null = null;
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const bucket = grid.endpointCells.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const ep of bucket) {
        if (ep.strokeId === options.excludeStrokeId) continue;
        const dist = Math.hypot(ep.x - point.x, ep.y - point.y);
        if (dist <= endpointRadius && (!bestEndpoint || dist < bestEndpoint.distance)) {
          bestEndpoint = {
            kind: "endpoint",
            strokeId: ep.strokeId,
            pointIndex: ep.pointIndex,
            x: ep.x,
            y: ep.y,
            distance: dist,
          };
        }
      }
    }
  }

  // 끝점 우선 정책: 반경 내에 다른 획의 끝점이 존재하면 곡선 내부 선분보다 끝점에 우선 스냅한다.
  if (bestEndpoint) return bestEndpoint;

  let bestSegment: VectorMagnetSnapTarget | null = null;
  const seenSegments = new Set<VectorMagnetSegmentEntry>();
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const bucket = grid.segmentCells.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const seg of bucket) {
        if (seg.strokeId === options.excludeStrokeId || seenSegments.has(seg)) continue;
        seenSegments.add(seg);
        const vx = seg.x1 - seg.x0;
        const vy = seg.y1 - seg.y0;
        const lenSq = vx * vx + vy * vy;
        const t = lenSq > 1e-12
          ? clamp(((point.x - seg.x0) * vx + (point.y - seg.y0) * vy) / lenSq, 0, 1)
          : 0;
        const px = seg.x0 + vx * t;
        const py = seg.y0 + vy * t;
        const dist = Math.hypot(px - point.x, py - point.y);
        if (dist <= radius && (!bestSegment || dist < bestSegment.distance)) {
          bestSegment = {
            kind: "segment",
            strokeId: seg.strokeId,
            pointIndex: seg.segIndex,
            x: px,
            y: py,
            distance: dist,
          };
        }
      }
    }
  }

  return bestSegment;
}

/**
 * 새 벡터 획의 양 끝점을 공간 해시에 조회해 자석 스냅하고 처음/마지막 `k` 샘플을 Hermite 감쇠로 보정한다.
 */
export function snapStrokeWithVectorMagnet(
  stroke: DrawEl,
  grid: VectorMagnetSpatialGrid,
  settings: VectorMagnetSettings,
): VectorMagnetSnapResult {
  const n = Math.floor(stroke.points.length / 2);
  if (!settings.useVectorMagnet || settings.magnetPower <= 0 || n < 2) {
    return { stroke, startSnap: null, endSnap: null };
  }

  const radius = resolveVectorMagnetRadiusPx(settings);
  if (radius <= 0) return { stroke, startSnap: null, endSnap: null };

  const powerStrength = clamp(0.35 + (clamp(settings.magnetPower, 0, 100) / 100) * 0.65, 0, 1);
  const startPt = { x: stroke.points[0]!, y: stroke.points[1]! };
  const endPt = { x: stroke.points[(n - 1) * 2]!, y: stroke.points[(n - 1) * 2 + 1]! };

  const startSnap = queryNearestVectorMagnetTarget(grid, startPt, {
    magnetRadiusPx: radius,
    excludeStrokeId: stroke.id,
    endpointPriorityRatio: settings.endpointPriorityRatio,
  });
  const endSnap = queryNearestVectorMagnetTarget(grid, endPt, {
    magnetRadiusPx: radius,
    excludeStrokeId: stroke.id,
    endpointPriorityRatio: settings.endpointPriorityRatio,
  });

  if (!startSnap && !endSnap) {
    return { stroke, startSnap: null, endSnap: null };
  }

  const k = Math.max(1, Math.min(n - 1, Math.floor(settings.falloffSamples ?? 5)));
  const outPoints = stroke.points.slice();

  if (startSnap) {
    const pull = settings.magnetPower >= 50 ? 1 : powerStrength;
    const dx = (startSnap.x - startPt.x) * pull;
    const dy = (startSnap.y - startPt.y) * pull;
    for (let i = 0; i < k && i < n; i++) {
      if (endSnap && i === n - 1) continue;
      const w = i === 0 ? 1 : hermite01(i / k);
      outPoints[i * 2] = outPoints[i * 2]! + dx * w;
      outPoints[i * 2 + 1] = outPoints[i * 2 + 1]! + dy * w;
    }
  }

  if (endSnap) {
    const pull = settings.magnetPower >= 50 ? 1 : powerStrength;
    const dx = (endSnap.x - endPt.x) * pull;
    const dy = (endSnap.y - endPt.y) * pull;
    for (let offset = 0; offset < k && offset < n; offset++) {
      const idx = n - 1 - offset;
      if (startSnap && idx === 0) continue;
      const w = offset === 0 ? 1 : hermite01(offset / k);
      outPoints[idx * 2] = outPoints[idx * 2]! + dx * w;
      outPoints[idx * 2 + 1] = outPoints[idx * 2 + 1]! + dy * w;
    }
  }

  return {
    stroke: { ...stroke, points: outPoints },
    startSnap,
    endSnap,
  };
}
