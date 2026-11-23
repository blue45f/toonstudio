/**
 * Oil and acrylic bristle-bed dab planner for continuous ribbon carriers.
 */

import { hash2 } from "../studio-grain";

import {
  DEFAULT_FX_BRUSH_SEED,
  FX_BRUSH_SEED_RANGE,
  FX_OIL_DAB_CAP,
  POINT_EPS,
  TAU,
  clamp,
  finiteNumber,
  sampleStations,
  sanitizePoints,
  type FxOilCapStationMode,
  type StrokePoint,
} from "./studio-fx-brush-sampling";

export type { FxOilCapStationMode };

export type FxOilDab = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  angleRad: number;
  opacity: number;
  /**
   * Thin local-space ridge samples carried by the wet body. The ribbon adapter joins matching
   * samples into continuous bristle lanes so station boundaries never appear in the final mark.
   */
  bristles: readonly FxOilBristle[];
};

export type FxOilBristle = {
  /** Offset across the local minor axis, expressed as a fraction of radiusY. */
  offsetRatio: number;
  radiusXRatio: number;
  radiusYRatio: number;
  opacity: number;
};

export type FxOilPaintBody = "oil" | "acrylic";
export type FxOilTipProfile = "bristle" | "hard";

export type FxOilPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  maxDabs?: number;
  /** Defaults to "oil" so every existing caller keeps byte-identical plans. */
  paintBody?: FxOilPaintBody;
  /** Defaults to "bristle", the historical behaviour. */
  tipProfile?: FxOilTipProfile;
  capMode?: FxOilCapStationMode;
  /**
   * Override station pitch as a fraction of head width. Fluid Paint walks the
   * tuft at 1/8 the default 0.068 pitch (8 capsules per bristle segment).
   */
  stationSpacingRatio?: number;
};

export interface OilDabSettings {
  readonly baseWidth: number;
  readonly seed: number;
  readonly maxDabs: number;
  readonly paintBody: FxOilPaintBody;
  readonly tipProfile: FxOilTipProfile;
  readonly spacing: number;
  readonly capMode: FxOilCapStationMode;
}

const OIL_STATION_SPACING_RATIO = 0.068;
const BRISTLE_LOAD_WAVELENGTH_HEAD_WIDTHS = 7;
const BRISTLE_LOAD_WAVELENGTH_STATIONS = Math.round(
  BRISTLE_LOAD_WAVELENGTH_HEAD_WIDTHS / OIL_STATION_SPACING_RATIO,
);
const ACRYLIC_LOAD_WAVELENGTH_SCALE = 0.45;
const ACRYLIC_RIDGE_SCALE = 1.35;
const HARD_TIP_RIDGE_SCALE = 0.72;
const HARD_TIP_LOAD_EVENNESS = 0.55;
const BRISTLE_RESERVOIR_WEIGHT = 0.62;
/** >1 이면 마른 털 쪽으로 치우친다. 갈필이 남으려면 소수가 확실히 굶어야 한다. */
const BRISTLE_RESERVOIR_SKEW = 1.9;
const OIL_CONTACT_SHOULDER = 0.28;
const BRISTLE_PITCH_JITTER = 0.05;
const BRISTLE_DRIFT_AMPLITUDE = 0.1;
const BRISTLE_HAIRS_PER_PX = 0.78;
const BRISTLE_MIN_HAIRS = 7;
const BRISTLE_MAX_HAIRS = 44;
const BRISTLE_DRIFT_WAVELENGTH_HEAD_WIDTHS = 11;
const BRISTLE_DRIFT_WAVELENGTH_STATIONS = Math.round(
  BRISTLE_DRIFT_WAVELENGTH_HEAD_WIDTHS / OIL_STATION_SPACING_RATIO,
);

/** The bed's lateral offsets, in ribbon half-widths. */
export function bristleBedOffsets(baseWidth: number, seed: number): readonly number[] {
  const count = Math.max(
    BRISTLE_MIN_HAIRS,
    Math.min(BRISTLE_MAX_HAIRS, Math.round(baseWidth * BRISTLE_HAIRS_PER_PX)),
  );
  const offsets: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const slot = count === 1 ? 0.5 : index / (count - 1);
    const jitter = (hash2(index, 1_181, seed) - 0.5) * 0.84 / Math.max(1, count - 1);
    offsets.push(clamp((slot + jitter) * 2 - 1, -1, 1) * 0.9);
  }
  return offsets;
}

/** Acrylic lanes carry the fast-setting body; everything else on this carrier is oil. */
export function studioOilPaintBodyForBrush(brush: string): FxOilPaintBody {
  return brush.startsWith("acrylic") ? "acrylic" : "oil";
}

/** Hard heads (flat, stiff) deposit a more even film than a soft tuft; declared per lane row. */
export function studioOilTipProfileForBrush(brush: string): FxOilTipProfile {
  return brush === "oil--flat-ribbon" || brush === "acrylic--stiff-ribbon"
    ? "hard"
    : "bristle";
}

function smoothGate(value: number, edge: number, margin: number): number {
  const t = clamp((value - (edge - margin)) / (2 * margin), 0, 1);
  return t * t * (3 - 2 * t);
}

export function resolveOilDabSettings(input: FxOilPlanInput): OilDabSettings {
  const baseWidth = clamp(finiteNumber(input.baseWidth, 22), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max),
  );
  const maxDabs = Math.floor(clamp(
    finiteNumber(input.maxDabs, FX_OIL_DAB_CAP),
    2,
    FX_OIL_DAB_CAP,
  ));
  const paintBody: FxOilPaintBody = input.paintBody === "acrylic" ? "acrylic" : "oil";
  const tipProfile: FxOilTipProfile = input.tipProfile === "hard" ? "hard" : "bristle";
  const capMode: FxOilCapStationMode = input.capMode === "prefix-stable-ladder-v2"
    ? "prefix-stable-ladder-v2"
    : "refit-v1";
  const spacingRatio = Number.isFinite(input.stationSpacingRatio)
    && (input.stationSpacingRatio ?? 0) > 0
    ? Math.min(0.2, Math.max(0.004, input.stationSpacingRatio!))
    : OIL_STATION_SPACING_RATIO;
  const spacing = Math.max(0.5, baseWidth * spacingRatio);
  return { baseWidth, seed, maxDabs, paintBody, tipProfile, spacing, capMode };
}

/** Appends dabs for `stations[from..]` onto `dabs`. */
export function appendOilBrushDabs(
  dabs: FxOilDab[],
  stations: readonly StrokePoint[],
  from: number,
  settings: OilDabSettings,
  bristleOffsets: readonly number[],
): void {
  const { baseWidth, seed, maxDabs, paintBody, tipProfile } = settings;
  const bristleCount = bristleOffsets.length;
  const tap = stations.length === 1;

  const pitchByHair = new Float64Array(bristleCount);
  const gaugeByHair = new Float64Array(bristleCount);
  const reservoirByHair = new Float64Array(bristleCount);
  const loadKeyByHair = new Float64Array(bristleCount);
  const driftKeyByHair = new Float64Array(bristleCount);
  for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
    pitchByHair[bristleIndex] =
      (hash2(bristleIndex, 613, seed) - 0.5) * 2 * BRISTLE_PITCH_JITTER;
    gaugeByHair[bristleIndex] = hash2(bristleIndex, 733, seed) ** 1.4;
    const loadKey = 31 + bristleIndex * 7;
    loadKeyByHair[bristleIndex] = loadKey;
    reservoirByHair[bristleIndex] = hash2(-1, loadKey, seed) ** BRISTLE_RESERVOIR_SKEW;
    driftKeyByHair[bristleIndex] = 907 + bristleIndex * 13;
  }

  const loadWavelength = BRISTLE_LOAD_WAVELENGTH_STATIONS
    * (paintBody === "acrylic" ? ACRYLIC_LOAD_WAVELENGTH_SCALE : 1);
  const loadStartByHair = new Float64Array(bristleCount);
  const loadEndByHair = new Float64Array(bristleCount);
  const driftStartByHair = new Float64Array(bristleCount);
  const driftEndByHair = new Float64Array(bristleCount);
  let cachedLoadKnot = Number.NaN;
  let cachedDriftKnot = Number.NaN;

  const acrylicRidgeScale = paintBody === "acrylic" ? ACRYLIC_RIDGE_SCALE : 1;
  const hardTipRidgeScale = tipProfile === "hard" ? HARD_TIP_RIDGE_SCALE : 1;

  for (let si = from; si < stations.length; si++) {
    if (dabs.length >= maxDabs) break;
    const st = stations[si]!;
    const n1 = hash2(si, 5, seed);
    const n2 = hash2(si, 11, seed);
    const n3 = hash2(si, 19, seed);
    let ang = n1 * TAU;
    const tangentStart = stations[Math.max(0, si - 1)]!;
    const tangentEnd = stations[Math.min(stations.length - 1, si + 1)]!;
    const tangentX = tangentEnd.x - tangentStart.x;
    const tangentY = tangentEnd.y - tangentStart.y;
    if (Math.hypot(tangentX, tangentY) > POINT_EPS) {
      ang = Math.atan2(tangentY, tangentX) + (n1 - 0.5) * 0.07;
    }
    const pressureFeel = Math.pow(clamp(st.pressure, 0, 1), 0.82);

    const loadT = si / loadWavelength;
    const loadKnot = Math.floor(loadT);
    const loadFraction = loadT - loadKnot;
    const loadEased = loadFraction * loadFraction * (3 - 2 * loadFraction);
    if (loadKnot !== cachedLoadKnot) {
      for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
        const key = loadKeyByHair[bristleIndex]!;
        loadStartByHair[bristleIndex] = hash2(loadKnot, key, seed);
        loadEndByHair[bristleIndex] = hash2(loadKnot + 1, key, seed);
      }
      cachedLoadKnot = loadKnot;
    }
    const driftT = si / BRISTLE_DRIFT_WAVELENGTH_STATIONS;
    const driftKnot = Math.floor(driftT);
    const driftFraction = driftT - driftKnot;
    const driftEased = driftFraction * driftFraction * (3 - 2 * driftFraction);
    if (driftKnot !== cachedDriftKnot) {
      for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
        const key = driftKeyByHair[bristleIndex]!;
        driftStartByHair[bristleIndex] = hash2(driftKnot, key, seed);
        driftEndByHair[bristleIndex] = hash2(driftKnot + 1, key, seed);
      }
      cachedDriftKnot = driftKnot;
    }
    const contactWidth = clamp(0.18 + pressureFeel * 0.95, 0.18, 1);
    const dryPressureTerm = 0.35 + pressureFeel * 0.65;
    const offsetPressureScale = 0.9 + pressureFeel * 0.14;
    const size = baseWidth
      * (0.48 + pressureFeel * 0.72)
      * (0.93 + n2 * 0.14);
    const rx = Math.max(0.4, size * (0.54 + pressureFeel * 0.08));
    const ry = Math.max(
      0.25,
      size * (0.34 + pressureFeel * 0.1 + n3 * 0.05),
    );
    const normalJitter = (n2 - 0.5) * baseWidth * (0.018 + pressureFeel * 0.014);
    const bristles: FxOilBristle[] = new Array(bristleCount);
    for (let bristleIndex = 0; bristleIndex < bristleCount; bristleIndex += 1) {
      const offsetRatio = bristleOffsets[bristleIndex]!;
      const loadStart = loadStartByHair[bristleIndex]!;
      const travel = loadStart + (loadEndByHair[bristleIndex]! - loadStart) * loadEased;
      const rawTooth = reservoirByHair[bristleIndex]! * BRISTLE_RESERVOIR_WEIGHT
        + travel * (1 - BRISTLE_RESERVOIR_WEIGHT);
      const tooth = tipProfile === "hard"
        ? 0.5 + (rawTooth - 0.5) * HARD_TIP_LOAD_EVENNESS
        : rawTooth;
      const edge = Math.abs(offsetRatio);
      const contact = clamp(
        (contactWidth - edge) / OIL_CONTACT_SHOULDER + tooth * 0.12,
        0,
        1,
      );
      const contactGate = smoothGate(contact, 0.42, 0.18);
      const toothGate = smoothGate(tooth, 0.38, 0.22);
      const loadGate = contactGate * toothGate;
      const pitch = pitchByHair[bristleIndex]!;
      const driftStart = driftStartByHair[bristleIndex]!;
      const drift =
        ((driftStart + (driftEndByHair[bristleIndex]! - driftStart) * driftEased) * 2 - 1)
        * BRISTLE_DRIFT_AMPLITUDE;
      const hairGauge = gaugeByHair[bristleIndex]!;
      const dryFloor = 0.015 + tooth * 0.045 * dryPressureTerm;
      bristles[bristleIndex] = {
        offsetRatio: (offsetRatio + pitch + drift) * offsetPressureScale,
        radiusXRatio: 0.62 + tooth * 0.28 + pressureFeel * 0.08,
        radiusYRatio: (0.032 + hairGauge * 0.062 + contact * 0.03)
          * acrylicRidgeScale
          * hardTipRidgeScale,
        opacity: dryFloor
          + loadGate * (
            (0.34 + contact * 0.42 + Math.max(0, tooth - 0.38) * 0.28)
            - dryFloor
          ),
      };
    }
    dabs.push({
      x: st.x - Math.sin(ang) * normalJitter,
      y: st.y + Math.cos(ang) * normalJitter,
      radiusX: rx,
      radiusY: ry,
      angleRad: ang,
      opacity: tap
        ? clamp(0.58 + pressureFeel * 0.36, 0.52, 0.96)
        : clamp(0.16 + pressureFeel * 0.38 + n2 * 0.045, 0.14, 0.62),
      bristles,
    });
  }
}

export function planOilBrushDabs(input: FxOilPlanInput): FxOilDab[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const settings = resolveOilDabSettings(input);
  const stations = sampleStations(points, settings.spacing, settings.maxDabs, settings.capMode);
  const bristleOffsets = bristleBedOffsets(settings.baseWidth, settings.seed);
  const dabs: FxOilDab[] = [];
  appendOilBrushDabs(dabs, stations, 0, settings, bristleOffsets);
  return dabs;
}
