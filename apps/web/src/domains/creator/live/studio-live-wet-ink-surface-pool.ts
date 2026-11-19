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
