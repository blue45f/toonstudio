/**
 * Shared deterministic sampling and numeric clamping helpers for FX brush planners.
 *
 * Pure geometry math only — no Math.random, DOM, or Konva dependencies.
 */

export const MAX_COORD = 1e6;
export const POINT_EPS = 1e-4;
export const DEFAULT_PRESSURE = 0.55;
export const TAU = Math.PI * 2;

export const FX_BRUSH_SEED_RANGE = { min: 0, max: 9999 } as const;
export const DEFAULT_FX_BRUSH_SEED = 1;
export const FX_BRUSH_PARTICLE_CAP = 768;
export const FX_BRUSH_DAB_CAP = 512;
/**
 * Oil/acrylic stations feed a continuous ribbon, so they no longer pay one full body draw per
 * station. Preserve a dense centreline on very long canvases instead of redistributing 512 large
 * footprints across the whole path and exposing polygon corners.
 */
export const FX_OIL_DAB_CAP = 16_384;
/**
 * Pastel is a continuous dry medium, not a decorative particle brush. A shared 512-dab ceiling
 * previously limited it to at most 256 two-dot stations and then redistributed those circles over
 * the complete arc. On a long stroke the spacing therefore grew with total length and exposed a
 * row of round carriers. Keep a dedicated, still-bounded station budget for its anisotropic fibre
 * carrier instead.
 */
export const FX_PASTEL_DAB_CAP = 16_384;

/** See `FxOilPlanInput.capMode`. */
export type FxOilCapStationMode = "refit-v1" | "prefix-stable-ladder-v2";

export type StrokePoint = { x: number; y: number; pressure: number };

export function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Stable seed from stroke id (same FNV-style recipe as watercolor). */
export function fxBrushSeedFromKey(key: unknown): number {
  if (typeof key !== "string" || key.length === 0) return DEFAULT_FX_BRUSH_SEED;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % (FX_BRUSH_SEED_RANGE.max + 1);
}

export function safeCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value, -MAX_COORD, MAX_COORD);
}

function pressureAt(pressures: unknown, progress: number): number {
  if (!Array.isArray(pressures) || pressures.length === 0) return DEFAULT_PRESSURE;
  if (pressures.length === 1) return clamp01(finiteNumber(pressures[0], DEFAULT_PRESSURE));
  const p = clamp01(progress);
  const pos = p * (pressures.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(pressures.length - 1, Math.ceil(pos));
  const t = pos - lo;
  const a = clamp01(finiteNumber(pressures[lo], DEFAULT_PRESSURE));
  const b = clamp01(finiteNumber(pressures[hi], a));
  return a + (b - a) * t;
}

/**
 * Reads point `i`'s pressure directly when the caller's journal is aligned with its point array,
 * and falls back to the normalised resample when it is not.
 */
function alignedPressureJournal(
  rawPressures: unknown,
  pairCount: number,
): readonly unknown[] | null {
  return Array.isArray(rawPressures) && rawPressures.length === pairCount
    ? rawPressures
    : null;
}

export function sanitizePoints(rawPoints: unknown, rawPressures: unknown): StrokePoint[] {
  if (!Array.isArray(rawPoints)) return [];
  const pairCount = Math.floor(rawPoints.length / 2);
  const aligned = alignedPressureJournal(rawPressures, pairCount);
  const out: StrokePoint[] = [];
  for (let i = 0; i < pairCount; i++) {
    const x = safeCoord(rawPoints[i * 2]);
    const y = safeCoord(rawPoints[i * 2 + 1]);
    if (x === null || y === null) continue;
    const pressure = aligned
      ? clamp01(finiteNumber(aligned[i], DEFAULT_PRESSURE))
      : pressureAt(rawPressures, pairCount <= 1 ? 0 : i / (pairCount - 1));
    const prev = out.at(-1);
    if (prev && Math.hypot(x - prev.x, y - prev.y) <= POINT_EPS) {
      prev.pressure = pressure;
      continue;
    }
    out.push({ x, y, pressure });
  }
  return out;
}

/** How much coarser one rung of the capped-spacing ladder is. */
const CAPPED_STATION_STEP_RATIO = 2 ** (1 / 4);

/** Hard stop for the rung search; far beyond any stroke a pointer can produce. */
const CAPPED_STATION_STEP_MAX_RUNGS = 512;

/**
 * The spacing a capped bed walks at: the natural spacing coarsened by whole ladder rungs until the
 * station count fits the budget.
 */
function cappedStationStep(
  step: number,
  totalLength: number,
  stationLimit: number,
): number {
  const budget = Math.max(0, stationLimit - 2);
  let scaled = step;
  for (let rung = 0; rung < CAPPED_STATION_STEP_MAX_RUNGS; rung += 1) {
    if (Math.floor(totalLength / scaled) <= budget) return scaled;
    scaled *= CAPPED_STATION_STEP_RATIO;
  }
  return scaled;
}

/** Arc-length resample stations along a polyline. */
export function sampleStations(
  points: readonly StrokePoint[],
  spacing: number,
  maximumStations = Number.POSITIVE_INFINITY,
  capMode: FxOilCapStationMode = "refit-v1",
): StrokePoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]!];
  const step = Math.max(0.35, spacing);
  const stationLimit = Number.isFinite(maximumStations)
    ? Math.max(1, Math.floor(maximumStations))
    : Number.POSITIVE_INFINITY;
  if (stationLimit === 1) return [points[0]!];

  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  if (totalLength <= POINT_EPS) return [points.at(-1)!];

  const naturalStepCount = Math.floor(totalLength / step);
  const naturalTail = totalLength - naturalStepCount * step;
  const naturalStationCount =
    1 + naturalStepCount + (naturalTail > POINT_EPS ? 1 : 0);

  if (naturalStationCount > stationLimit && capMode === "refit-v1") {
    const stations: StrokePoint[] = [];
    let segmentIndex = 1;
    let segmentStartDistance = 0;
    for (let stationIndex = 0; stationIndex < stationLimit; stationIndex += 1) {
      if (stationIndex === 0) {
        stations.push(points[0]!);
        continue;
      }
      if (stationIndex === stationLimit - 1) {
        stations.push(points.at(-1)!);
        continue;
      }
      const targetDistance = totalLength * (stationIndex / (stationLimit - 1));
      let start = points[segmentIndex - 1]!;
      let end = points[segmentIndex]!;
      let segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      while (
        segmentIndex < points.length - 1
        && segmentStartDistance + segmentLength < targetDistance
      ) {
        segmentStartDistance += segmentLength;
        segmentIndex += 1;
        start = points[segmentIndex - 1]!;
        end = points[segmentIndex]!;
        segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      }
      const amount = segmentLength > POINT_EPS
        ? clamp((targetDistance - segmentStartDistance) / segmentLength, 0, 1)
        : 0;
      stations.push({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
        pressure: start.pressure + (end.pressure - start.pressure) * amount,
      });
    }
    return stations;
  }

  const walkStep = naturalStationCount > stationLimit
    ? cappedStationStep(step, totalLength, stationLimit)
    : step;

  const stations: StrokePoint[] = [points[0]!];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen <= POINT_EPS) continue;
    let consumed = 0;
    while (carry + (segLen - consumed) >= walkStep) {
      const need = walkStep - carry;
      const t = (consumed + need) / segLen;
      stations.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        pressure: a.pressure + (b.pressure - a.pressure) * t,
      });
      consumed += need;
      carry = 0;
    }
    carry += segLen - consumed;
  }
  const last = points[points.length - 1]!;
  const tail = stations[stations.length - 1]!;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > POINT_EPS) {
    stations.push(last);
  }
  return stations;
}
