/**
 * PicsArt / Express-class FX brush planners (glow, glitter, oil, pastel).
 *
 * Pure, deterministic dab/particle plans shared by Canvas (Konva) and SVG export.
 * No Math.random / DOM / Konva — seed + stroke geometry only.
 */

import {
  DEFAULT_FX_BRUSH_SEED,
  FX_BRUSH_PARTICLE_CAP,
  FX_BRUSH_SEED_RANGE,
  FX_PASTEL_DAB_CAP,
  POINT_EPS,
  TAU,
  clamp,
  finiteNumber,
  sampleStations,
  sanitizePoints,
} from "./brush/studio-fx-brush-sampling";
import { hash2 } from "./studio-grain";

export {
  DEFAULT_FX_BRUSH_SEED,
  FX_BRUSH_DAB_CAP,
  FX_BRUSH_PARTICLE_CAP,
  FX_BRUSH_SEED_RANGE,
  FX_OIL_DAB_CAP,
  FX_PASTEL_DAB_CAP,
  fxBrushSeedFromKey,
  type FxOilCapStationMode,
} from "./brush/studio-fx-brush-sampling";
export {
  createStudioIncrementalFxPressurePathBuilder,
  isStudioFxPressureBrushId,
  planStudioFxBrushPressurePath,
  resolveStudioFxBrushPressureResponse,
  resolveStudioFxBrushTapPressureResponse,
  resolveStudioFxPressurePassResponse,
  type StudioFxBrushPressureResponse,
  type StudioFxPressureBrushId,
  type StudioFxPressurePassResponse,
  type StudioFxPressurePathPlan,
  type StudioFxPressurePathSegment,
  type StudioIncrementalFxPressurePathBuilder,
} from "./brush/studio-fx-brush-pressure-path";
export {
  STUDIO_FX_LUMINOUS_COMPOSITE_OPERATION,
  planStudioFxLuminousRibbonPass,
  traceStudioFxLuminousRibbonPass,
  traceStudioFxLuminousRibbonPassRange,
  type StudioFxLuminousBrushId,
  type StudioFxLuminousRibbonPassPlan,
  type StudioFxLuminousRibbonPathSink,
  type StudioFxLuminousRibbonPolygon,
  type StudioFxLuminousRibbonRole,
} from "./brush/studio-fx-brush-luminous-geometry";
export {
  createStudioIncrementalFxLuminousRibbonBuilder,
  type StudioIncrementalFxLuminousRibbonBuilder,
} from "./brush/studio-fx-brush-luminous-incremental";
export {
  planOilBrushDabs,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
  type FxOilBristle,
  type FxOilDab,
  type FxOilPaintBody,
  type FxOilPlanInput,
  type FxOilTipProfile,
} from "./brush/studio-fx-brush-oil-dabs";
export {
  FxOilDabPlanner,
  planOilBrushDabsIncremental,
  releaseOilBrushDabDraftPlanners,
} from "./brush/studio-fx-brush-oil-incremental";

// ---------------------------------------------------------------------------
// Glow — multi-pass halo (PicsArt / Express neon-glow depth)
// ---------------------------------------------------------------------------

export type FxGlowPass = {
  /** Stroke width multiplier vs base. */
  widthScale: number;
  /** Relative opacity (0–1), multiplied by element opacity later. */
  opacity: number;
};

export type FxNeonPass = FxGlowPass & {
  /** Coloured halo passes sit behind a near-white luminous core. */
  tone: "color" | "white-core";
};

const FX_PARTICLE_DISTANCE_FALLOFF = 0.3;
const LUMINOUS_CORE_WHITE_MIX = 0.55;
const GLOW_HALO_SHELLS = 48;

/**
 * The colour a luminous lane's core pass paints, given the stroke colour.
 */
export function studioLuminousCoreColor(stroke: unknown): string {
  const hex = typeof stroke === "string" ? stroke.trim() : "";
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(hex);
  if (!match) return "#ffffff";
  const digits = match[1]!;
  const full = digits.length === 3
    ? digits.split("").map((d) => d + d).join("")
    : digits;
  const channel = (index: number): number => {
    const value = Number.parseInt(full.slice(index * 2, index * 2 + 2), 16);
    const mixed = Math.round(value + (255 - value) * LUMINOUS_CORE_WHITE_MIX);
    return Math.max(0, Math.min(255, mixed));
  };
  return `#${[0, 1, 2].map((index) => channel(index).toString(16).padStart(2, "0")).join("")}`;
}

export function planNeonBrushPasses(baseWidth: number): FxNeonPass[] {
  const w = clamp(finiteNumber(baseWidth, 12), 0.5, 2048);
  const outer = w < 6 ? 3.1 : 2.7;
  return [
    { widthScale: outer, opacity: 0.14, tone: "color" },
    { widthScale: 1.65, opacity: 0.34, tone: "color" },
    { widthScale: 0.54, opacity: 0.96, tone: "white-core" },
  ];
}

function expandHaloShells(
  rings: readonly { widthScale: number; opacity: number }[],
): { widthScale: number; opacity: number }[] {
  const cumulative: { widthScale: number; alpha: number }[] = [];
  let carried = 0;
  for (const ring of rings) {
    carried = 1 - (1 - carried) * (1 - clamp(ring.opacity, 0, 1));
    cumulative.push({ widthScale: ring.widthScale, alpha: carried });
  }
  const core = cumulative.at(-1)?.alpha ?? 0;
  if (core <= 0 || cumulative.length < 2) return rings.map((ring) => ({ ...ring }));
  const widthAt = (alpha: number): number => {
    if (alpha <= cumulative[0]!.alpha) return cumulative[0]!.widthScale;
    for (let index = 1; index < cumulative.length; index += 1) {
      const previous = cumulative[index - 1]!;
      const current = cumulative[index]!;
      if (alpha > current.alpha) continue;
      const span = current.alpha - previous.alpha;
      const t = span > 1e-9 ? (alpha - previous.alpha) / span : 1;
      return previous.widthScale + (current.widthScale - previous.widthScale) * t;
    }
    return cumulative.at(-1)!.widthScale;
  };
  const shells: { widthScale: number; opacity: number }[] = [];
  let previousTarget = 0;
  for (let index = 0; index < GLOW_HALO_SHELLS; index += 1) {
    const target = core * (index + 1) / GLOW_HALO_SHELLS;
    const opacity = clamp((target - previousTarget) / (1 - previousTarget), 0, 1);
    previousTarget = target;
    if (opacity <= 0) continue;
    shells.push({ widthScale: widthAt(target), opacity });
  }
  return shells;
}

/**
 * Outer soft halo → bright core. Renderer draws passes back-to-front.
 * softGlow=true widens the halo (soft-glow preset).
 */
export function planGlowBrushPasses(baseWidth: number, softGlow = false): FxGlowPass[] {
  const w = clamp(finiteNumber(baseWidth, 12), 0.5, 2048);
  if (softGlow) {
    return expandHaloShells([
      { widthScale: 4.2, opacity: 0.12 },
      { widthScale: 2.8, opacity: 0.2 },
      { widthScale: 1.6, opacity: 0.38 },
      { widthScale: 0.85, opacity: 0.92 },
    ]);
  }
  const outer = w < 6 ? 3.4 : 3.0;
  return expandHaloShells([
    { widthScale: outer, opacity: 0.16 },
    { widthScale: outer * 0.62, opacity: 0.32 },
    { widthScale: 1.05, opacity: 0.95 },
  ]);
}

// ---------------------------------------------------------------------------
// Glitter / star-dust — scatter particles along stroke
// ---------------------------------------------------------------------------

export type FxGlitterParticle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  /** 0 = circle spark, 1 = diamond-ish cross (renderer may draw rotated square). */
  kind: 0 | 1;
};

export type FxGlitterPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  /** "glitter" denser; "star-dust" sparser larger sparks. */
  mode?: "glitter" | "star-dust" | "sparkle-star";
  maxParticles?: number;
};

export function planGlitterBrushParticles(input: FxGlitterPlanInput): FxGlitterParticle[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 18), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max),
  );
  const mode = input.mode === "star-dust" ? "star-dust" : input.mode === "sparkle-star" ? "sparkle-star" : "glitter";
  const maxParticles = Math.floor(
    clamp(finiteNumber(input.maxParticles, FX_BRUSH_PARTICLE_CAP), 4, FX_BRUSH_PARTICLE_CAP),
  );
  const spacing = mode === "star-dust"
    ? Math.max(2.2, baseWidth * 0.55)
    : mode === "sparkle-star"
      ? Math.max(1.8, baseWidth * 0.4)
      : Math.max(1.4, baseWidth * 0.28);
  const perStation = mode === "star-dust" ? 2 : mode === "sparkle-star" ? 3 : 4;
  const stations = sampleStations(
    points,
    spacing,
    Math.max(2, Math.floor(maxParticles / perStation)),
  );
  const particles: FxGlitterParticle[] = [];
  const scatter = baseWidth * (mode === "star-dust" ? 0.85 : mode === "sparkle-star" ? 0.65 : 0.55);
  const perStationBudget = Math.max(1, Math.floor(maxParticles / stations.length));

  for (let si = 0; si < stations.length; si++) {
    const st = stations[si]!;
    const stationParticleStart = particles.length;
    const density = 0.55 + st.pressure * 0.55;
    const count = Math.min(
      perStationBudget,
      Math.max(1, Math.round(perStation * density)),
    );
    for (let k = 0; k < count; k++) {
      if (particles.length >= maxParticles) return particles;
      const n1 = hash2(si, k * 3 + 1, seed);
      const n2 = hash2(si, k * 3 + 2, seed);
      const n3 = hash2(si, k * 3 + 3, seed);
      const n4 = hash2(si + 17, k + 9, seed);
      const n5 = hash2(si + 53, k * 3 + 5, seed);
      const n6 = hash2(si + 89, k * 3 + 7, seed);
      if (n4 > density * 0.92) continue;
      const ang = n1 * TAU;
      const dist = scatter * Math.sqrt(n2);
      const rBase = mode === "star-dust"
        ? baseWidth * (0.08 + n3 * 0.22)
        : baseWidth * (0.04 + n3 * 0.14);
      particles.push({
        x: st.x + Math.cos(ang) * dist,
        y: st.y + Math.sin(ang) * dist,
        radius: Math.max(0.35, rBase),
        opacity: clamp(
          0.35 + n5 * 0.6 * (1 - Math.sqrt(n2) * FX_PARTICLE_DISTANCE_FALLOFF),
          0.2,
          1,
        ),
        kind: n6 > 0.62 ? 1 : 0,
      });
    }
    if (particles.length === stationParticleStart && particles.length < maxParticles) {
      const n1 = hash2(si, 101, seed);
      const n2 = hash2(si, 103, seed);
      const n3 = hash2(si, 107, seed);
      const angle = n1 * TAU;
      const distance = scatter * Math.sqrt(n2);
      const radiusScale = mode === "star-dust"
        ? 0.08 + n3 * 0.22
        : 0.04 + n3 * 0.14;
      particles.push({
        x: st.x + Math.cos(angle) * distance,
        y: st.y + Math.sin(angle) * distance,
        radius: Math.max(0.35, baseWidth * radiusScale),
        opacity: clamp(0.55 + n2 * 0.35, 0.55, 0.9),
        kind: n3 > 0.62 ? 1 : 0,
      });
    }
  }

  return particles;
}

// ---------------------------------------------------------------------------
// Pastel — direction-aligned soft pigment fibres (dry chalky build-up)
// ---------------------------------------------------------------------------

export type FxPastelDab = {
  x: number;
  y: number;
  /** Tangent-aligned half-length. Always materially larger than radiusY. */
  radiusX: number;
  /** Cross-stroke half-thickness. */
  radiusY: number;
  angleRad: number;
  opacity: number;
};

export type FxPastelPlanInput = {
  points: readonly number[];
  pressures?: readonly number[] | null;
  baseWidth: number;
  seed: number;
  maxDabs?: number;
};

export function planPastelBrushDabs(input: FxPastelPlanInput): FxPastelDab[] {
  const points = sanitizePoints(input.points, input.pressures);
  if (points.length === 0) return [];
  const baseWidth = clamp(finiteNumber(input.baseWidth, 20), 0.5, 2048);
  const seed = Math.floor(
    clamp(finiteNumber(input.seed, DEFAULT_FX_BRUSH_SEED), FX_BRUSH_SEED_RANGE.min, FX_BRUSH_SEED_RANGE.max),
  );
  const maxDabs = Math.floor(clamp(
    finiteNumber(input.maxDabs, FX_PASTEL_DAB_CAP),
    2,
    FX_PASTEL_DAB_CAP,
  ));
  const spacing = Math.max(0.55, baseWidth * 0.12);
  const stations = sampleStations(points, spacing, maxDabs);
  const dabs: FxPastelDab[] = [];

  for (let si = 0; si < stations.length; si++) {
    if (dabs.length >= maxDabs) break;
    const st = stations[si]!;
    const before = stations[Math.max(0, si - 1)]!;
    const after = stations[Math.min(stations.length - 1, si + 1)]!;
    const tangentX = after.x - before.x;
    const tangentY = after.y - before.y;
    const tangentLength = Math.hypot(tangentX, tangentY);
    const tangent = tangentLength > POINT_EPS
      ? Math.atan2(tangentY, tangentX)
      : 0;
    const normalX = -Math.sin(tangent);
    const normalY = Math.cos(tangent);
    const lengthNoise = hash2(si, 3, seed);
    const thicknessNoise = hash2(si, 5, seed);
    const offsetNoise = hash2(si, 7, seed);
    const angleNoise = hash2(si, 11, seed);
    const pressureScale = 0.72 + st.pressure * 0.48;
    const radiusX = Math.max(
      0.75,
      baseWidth * pressureScale * (0.46 + lengthNoise * 0.1),
    );
    const radiusY = Math.max(
      0.18,
      Math.min(
        radiusX / 3.2,
        baseWidth * pressureScale * (0.09 + thicknessNoise * 0.035),
      ),
    );
    const normalOffset = (offsetNoise - 0.5) * baseWidth * 0.07;
    dabs.push({
      x: st.x + normalX * normalOffset,
      y: st.y + normalY * normalOffset,
      radiusX,
      radiusY,
      angleRad: tangent + (angleNoise - 0.5) * 0.14,
      opacity: clamp(
        0.1 + st.pressure * 0.2 + thicknessNoise * 0.06,
        0.08,
        0.38,
      ),
    });
  }
  if (stations.length === 1 && dabs.length === 1 && maxDabs >= 2) {
    const first = dabs[0]!;
    dabs.push({
      ...first,
      radiusX: first.radiusX * 0.78,
      radiusY: first.radiusY * 0.86,
      angleRad: first.angleRad + Math.PI / 2,
      opacity: first.opacity * 0.72,
    });
  }
  return dabs;
}
