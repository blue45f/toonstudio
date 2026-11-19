import type { StudioWetInkBrushSurface } from "../brush/studio-wet-ink-brush-runtime";

export function releaseStudioLiveWetInkTileSurface(
  tileSurfacePool: Map<string, StudioWetInkBrushSurface[]>,
  surface: StudioWetInkBrushSurface,
): void {
  const width = surface.width;
  const height = surface.height;
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return;
  }
  const key = `${width}x${height}`;
  let pool = tileSurfacePool.get(key);
  if (!pool) {
    // Bound distinct size buckets so variable-size long sessions never leak offscreen canvases.
    if (tileSurfacePool.size >= 24) {
      const oldestKey = tileSurfacePool.keys().next().value;
      if (typeof oldestKey === "string") {
        const evicted = tileSurfacePool.get(oldestKey);
        tileSurfacePool.delete(oldestKey);
        if (evicted) shrinkPooledSurfaces(evicted);
      }
    }
    pool = [];
    tileSurfacePool.set(key, pool);
  }
  // Cap per-size pool so long strokes cannot retain unbounded canvases.
  if (pool.length >= 12) {
    shrinkPooledSurfaces([surface]);
    return;
  }
  pool.push(surface);
}

export function clearStudioLiveWetInkTileSurfacePool(
  tileSurfacePool: Map<string, StudioWetInkBrushSurface[]>,
): void {
  for (const pool of tileSurfacePool.values()) {
    shrinkPooledSurfaces(pool);
  }
  tileSurfacePool.clear();
}

/**
 * 30초 이상 로컬 드로잉이 멈춘 유휴 구간에서 버킷당 소수의 웜(warm) 타일만 남기고
 * 나머지 오프스크린 캔버스를 1×1로 축소해 장기 세션 VRAM 파편화를 회수한다.
 */
export function trimStudioLiveWetInkTileSurfacePoolForIdle(
  tileSurfacePool: Map<string, StudioWetInkBrushSurface[]>,
  maxRetainedPerBucket = 2,
): number {
  const cap = Math.max(0, Math.trunc(maxRetainedPerBucket));
  let released = 0;
  for (const [key, pool] of [...tileSurfacePool.entries()]) {
    if (pool.length <= cap) continue;
    const excess = pool.splice(cap);
    shrinkPooledSurfaces(excess);
    released += excess.length;
    if (pool.length === 0) tileSurfacePool.delete(key);
  }
  return released;
}

function shrinkPooledSurfaces(surfaces: readonly StudioWetInkBrushSurface[]): void {
  for (const surface of surfaces) {
    try {
      if (surface.width !== 1) surface.width = 1;
      if (surface.height !== 1) surface.height = 1;
    } catch {
      // Mock or read-only surfaces in tests do not require resize teardown.
    }
  }
}
