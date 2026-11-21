/**
 * Verified open-source brush kernels used by ToonStudio's hybrid natural-media stack.
 *
 * These are clean re-implementations of public algorithms from:
 * - Klecks (MIT) — pen scatter, chalk multi-octave alpha tip
 *   https://github.com/bitbof/klecks — pen-brush.ts, brushes/alphas/brush-alphas.ts
 * - Krita Spray (GPL-2.0+; math only, no code copy) — equal-area polar distance
 *   plugins/paintops/spray/KisSprayRandomDistributions.cpp :: √U
 * - libmypaint (ISC) — .myb setting recipes for oil/charcoal carriers
 *   tests/brushes/modelling.myb, charcoal.myb; Krita-bundled Wet_Paint_Plus.myb
 *
 * Proprietary sites (Expresii CFD, Magma, Photopea) are not copied. They only
 * inform which OSS engine owns each family in the hybrid registry.
 *
 * All randomness is seed-driven so live/commit/replay stay byte-deterministic.
 */

export const STUDIO_OSS_BRUSH_KERNELS_VERSION =
  "studio-oss-brush-kernels-v1" as const;

const TAU = Math.PI * 2;

/** Provenance tags embedded in metrics and tests. */
export const STUDIO_OSS_BRUSH_PROVENANCE = Object.freeze({
  klecksScatter: "klecks/pen-brush.ts equal-area disk scatter (MIT)",
  klecksChalkAlpha: "klecks/brushes/alphas genBrushAlpha01 multi-octave chalk (MIT)",
  klecksChalkRotate: "klecks/pen-brush.ts chalk rotate by (x+y)*53123 (MIT)",
  kritaPolarDistance: "Krita KisSprayUniformDistributionPolarDistance √U (math)",
  libmypaintModelling: "libmypaint tests/brushes/modelling.myb (ISC)",
  libmypaintCharcoal: "libmypaint tests/brushes/charcoal.myb (ISC)",
  libmypaintWetPaint: "Krita mypaint bundle Wet_Paint_Plus.myb hardness/opaque shape",
  harmonyProximityWeb: "Harmony (mrdoob) sketchy & web procedural proximity coupling (clean-room math)",
  fabricCrayonWaxTooth: "fabric-brushes (av01d) & p5.brush anisotropic wax crayon tooth (clean-room math)",
  fabricLongFurStrand: "fabric-brushes (av01d) & Harmony tangent strand hair fiber ribbons (clean-room math)",
  fabricSquaresMesh: "fabric-brushes (av01d) procedural square mosaic mesh (clean-room math)",
  klecksSmudgeBlend: "Klecks (bitbof) smudge & blend canvas pixel color transfer (clean-room math)",
  p5BrushFlowfield: "p5.brush (acapv) dynamic vector field curvature & flowfield curl (clean-room math)",
} as const);

export type StudioOssBrushProvenanceId =
  keyof typeof STUDIO_OSS_BRUSH_PROVENANCE;

/** Deterministic unit hash in [0, 1). Same family as stampJitter / dynamics seededUnit. */
export function studioOssUnitHash(
  seed: number,
  saltA: number,
  saltB = 0,
): number {
  let h =
    (Math.imul((seed | 0) + 1, 374761393)
      + Math.imul((saltA | 0) + 1, 668265263)
      + Math.imul((saltB | 0) + 1, 0x27d4_eb2d))
    | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Equal-area disk scatter (Klecks pen + Krita polar distance).
 * `distance = √U · radius` so particles fill the disk uniformly instead of
 * clustering at the centre (raw U would bias inward).
 */
export function studioOssEqualAreaDiskOffset(
  seed: number,
  index: number,
  radius: number,
  salt = 0,
): Readonly<{ x: number; y: number; angle: number; distance: number }> {
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const angle = studioOssUnitHash(seed, index, 0x243f_6a88 ^ salt) * TAU;
  const distance =
    Math.sqrt(studioOssUnitHash(seed, index, 0x85a3_08d3 ^ salt)) * safeRadius;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, angle, distance };
}

/**
 * Klecks chalk tip rotation — rotates stamp alpha by document position so
 * successive dabs never tile the same grain orientation.
 */
export function studioOssChalkRotationRadians(x: number, y: number): number {
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  return ((sx + sy) * 53123) % TAU;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstepRange(edge0: number, edge1: number, x: number): number {
  const span = Math.max(1e-6, edge1 - edge0);
  const t = clamp01((x - edge0) / span);
  return t * t * (3 - 2 * t);
}

function hashLattice(ix: number, iy: number, seed: number): number {
  let v =
    (Math.imul(ix | 0, 0x45d9_f3b)
      ^ Math.imul(iy | 0, 0x27d4_eb2d)
      ^ (seed >>> 0))
    >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x7feb_352d) >>> 0;
  v = Math.imul(v ^ (v >>> 15), 0x846c_a68b) >>> 0;
  v ^= v >>> 16;
  return (v >>> 0) / 0xffff_ffff;
}

/** Smooth value-noise in [0, 1] — Klecks chalk uses simplex; value-noise is the deterministic substitute. */
export function studioOssValueNoise2d(
  x: number,
  y: number,
  seed: number,
): number {
  const sx = finite(x);
  const sy = finite(y);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hashLattice(x0, y0, seed);
  const b = hashLattice(x0 + 1, y0, seed);
  const c = hashLattice(x0, y0 + 1, seed);
  const d = hashLattice(x0 + 1, y0 + 1, seed);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/**
 * Klecks genBrushAlpha01 structure (clean-room):
 *   base = mid + coarse*mid
 *   base -= fine
 *   * circular soft falloff
 *   * centre darkening
 * Returns coverage in [0, 1].
 *
 * `grainStretch` (default 1) pre-compensates anisotropic stamping: the dry-media kernel path
 * stretches this tip onto a fibre ellipse λ:1 (long axis = map X). Baking with the noise
 * coordinates compressed λ× along X means the stretched stamp lands isotropic pigment grain in
 * document space instead of λ:1 streaks. Only the NOISE inputs warp — `centerDist` and every
 * envelope term stay computed on the unwarped coordinates, so the tip silhouette is unchanged.
 */
export function studioOssKlecksChalkCoverage(
  normalizedX: number,
  normalizedY: number,
  seed: number,
  grainStretch: number = 1,
): number {
  const nx = finite(normalizedX);
  const ny = finite(normalizedY);
  const stretch = Math.max(0.25, Math.min(8, finite(grainStretch, 1)));
  const px = nx * 64 * stretch;
  const py = ny * 64;
  const scaleFac = 128 / 500;
  const sFac2 =
    scaleFac
    + (studioOssValueNoise2d(px / 50 / scaleFac, py / 50 / scaleFac, seed ^ 0x11) - 0.5) * 0.08;
  let noisePattern =
    100 + studioOssValueNoise2d(px / 50 / sFac2, py / 50 / sFac2, seed ^ 0x22) * 100;
  noisePattern -=
    studioOssValueNoise2d(px / 10 / scaleFac, py / 10 / scaleFac, seed ^ 0x33) * 100;
  const centerDist = Math.hypot(nx, ny);
  const rimNoise = studioOssValueNoise2d(px / 22 / sFac2, py / 22 / sFac2, seed ^ 0x44);
  const falloff = clamp01(1 - ((centerDist - 0.8) / 0.28 + (rimNoise - 0.5) * 0.6));
  const falloff2 = clamp01(1 - centerDist) * 2;
  return clamp01((noisePattern * falloff * falloff2) / 255);
}

/**
 * Kleki/Krita spray tip: soft radial envelope × multi-octave grit.
 * Unlike a pure gradient disc, grit remains visible after many overlapping dabs.
 */
export function studioOssSprayTipCoverage(
  normalizedX: number,
  normalizedY: number,
  seed: number,
  hardness: number,
): number {
  const nx = finite(normalizedX);
  const ny = finite(normalizedY);
  const r = Math.hypot(nx, ny);
  if (r >= 1) return 0;
  const hard = clamp01(hardness);
  const exponent = 1.4 + (1 - hard) * 3.6;
  const envelope = (1 - r) ** exponent;
  const grit =
    studioOssValueNoise2d(nx * 7.5, ny * 7.5, seed ^ 0xa1) * 0.55
    + studioOssValueNoise2d(nx * 19, ny * 19, seed ^ 0xb2) * 0.3
    + studioOssValueNoise2d(nx * 41, ny * 41, seed ^ 0xc3) * 0.15;
  return clamp01(envelope * (0.55 + grit * 0.45));
}

/**
 * Watercolor wet-edge ring coverage (Expresii/Kleki wash feel via soft ring).
 * Core soft body + thin darker rim — structural, not a numeric opacity tweak.
 */
export function studioOssWatercolorTipCoverage(
  normalizedX: number,
  normalizedY: number,
  seed: number,
  hardness: number,
): number {
  const nx = finite(normalizedX);
  const ny = finite(normalizedY);
  const r = Math.hypot(nx, ny);
  if (r >= 1) return 0;
  const hard = clamp01(hardness);
  const body = (1 - r) ** (1.1 + (1 - hard) * 2.2);
  const granulation =
    studioOssValueNoise2d(nx * 11, ny * 11, seed ^ 0xd4) * 0.35 + 0.65;
  const edge = Math.exp(-((r - 0.92) ** 2) / 0.0045) * 0.24;
  return clamp01(body * granulation + edge);
}

/** libmypaint modelling.myb — oil/paint body carrier (smudge left to host; transparent-safe). */
export const STUDIO_OSS_LIBMYPAINT_MODELLING_RECIPE = Object.freeze({
  provenance: "libmypaintModelling" as const,
  antiAliasing: 1,
  dabsPerActualRadius: 4.02,
  ellipticalDabRatio: 1.0,
  hardness: 0.71,
  opaque: 0.8,
  opaqueLinearize: 0.9,
  radiusLogarithmic: 1.1,
  // Product surface is often transparent: smudge must stay 0 until underpaint exists.
  smudge: 0,
  smudgeLength: 0.3,
  offsetByRandom: 0,
});

/**
 * Transparent-safe oil film recipe: Wet_Paint_Plus hardness/opaque shape +
 * modelling density, smudge forced off (Klecks smudge also skips empty alpha).
 */
export const STUDIO_OSS_OIL_FILM_RECIPE = Object.freeze({
  provenance: ["libmypaintWetPaint", "libmypaintModelling"] as const,
  antiAliasing: 1,
  dabsPerActualRadius: 8.5,
  dabsPerBasicRadius: 0.9,
  directionFilter: 0.4,
  ellipticalDabRatio: 1.45,
  hardness: 0.52,
  opaque: 0.74,
  opaqueLinearize: 0.9,
  paintMode: 0.88,
  radiusLogarithmic: 1.35,
  radiusByRandom: 0.02,
  offsetByRandom: 0.035,
  slowTracking: 0.85,
  slowTrackingPerDab: 0.3,
  smudge: 0,
  smudgeLength: 0.5,
});

/** libmypaint charcoal.myb — dry carrier (high offset_by_random). */
export const STUDIO_OSS_LIBMYPAINT_CHARCOAL_RECIPE = Object.freeze({
  provenance: "libmypaintCharcoal" as const,
  antiAliasing: 0,
  dabsPerActualRadius: 5,
  ellipticalDabRatio: 1,
  hardness: 0.2,
  opaque: 0.4,
  offsetByRandom: 1.6,
  radiusLogarithmic: 0.7,
  slowTracking: 2,
});

/**
 * Transparent-safe dry carrier: charcoal.myb offset/hardness DNA with denser
 * dabs so material texture v2 tooth does not bead.
 */
export const STUDIO_OSS_DRY_CARRIER_RECIPE = Object.freeze({
  provenance: "libmypaintCharcoal" as const,
  antiAliasing: 0.7,
  dabsPerActualRadius: 14,
  dabsPerBasicRadius: 0.6,
  ellipticalDabRatio: 1.25,
  hardness: 0.72,
  opaque: 0.72,
  opaqueLinearize: 0.9,
  offsetByRandom: 0.22,
  radiusByRandom: 0.03,
  radiusLogarithmic: 0.85,
  slowTracking: 1.1,
  trackingNoise: 0.018,
});

/** Material colour transfer modes: dry reveals paper; paint-film only multiplies density. */
export type StudioOssMaterialColorMode = "dry-paper" | "paint-film";

export function studioOssMaterialColorModeForProfile(
  materialProfileId: string,
): StudioOssMaterialColorMode {
  switch (materialProfileId) {
    case "oil":
    case "acrylic":
    case "gouache":
    case "painterly":
    case "oil-pastel":
      return "paint-film";
    default:
      return "dry-paper";
  }
}

/** Apply material colour: `color` is density [~0.5..1.2], `lift` is paper reveal (dry) or valley darken (paint). */
export function studioOssApplyMaterialColorChannel(
  source: number,
  color: number,
  lift: number,
  mode: StudioOssMaterialColorMode,
): number {
  const s = finite(source);
  const c = finite(color, 1);
  const l = finite(lift);
  if (mode === "paint-film") {
    const density = Math.max(0.05, c);
    const darken = Math.min(0.35, Math.max(0, l));
    return s * density * (1 - darken * 0.22);
  }
  return s * c + (255 - s) * Math.max(0, l);
}

/** Tip-normalized [-1, 1] coordinates scaled into directional wax lattice texel space (knee = 10). */
export const STUDIO_OSS_TIP_WAX_LATTICE_SCALE = 10;

export function studioOssDirectionalWaxSample(
  x: number,
  y: number,
  directionRadians: number,
  seed: number,
  grainStretch: number = 1,
): Readonly<{ wax: number; scrape: number; grit: number }> {
  const dir = finite(directionRadians);
  const tangentX = Math.cos(dir);
  const tangentY = Math.sin(dir);
  const stretch = Math.max(0.25, Math.min(8, finite(grainStretch, 1)));
  const warpedX = finite(x) * stretch;
  const warpedY = finite(y);
  const across = warpedX * -tangentY + warpedY * tangentX;
  const along = warpedX * tangentX + warpedY * tangentY;
  const fibre = studioOssValueNoise2d(
    along * 0.09 + across * 0.42,
    along * 0.02 - across * 0.08,
    seed ^ 0x47,
  );
  const fine = studioOssValueNoise2d(
    across * 0.55 + along * 0.03,
    across * -0.12 + along * 0.18,
    seed ^ 0x53,
  );
  const broad = studioOssValueNoise2d(
    along * 0.035 + across * 0.06,
    along * -0.04 + across * 0.05,
    seed ^ 0x59,
  );
  // 종이 산·골 대비와 방향성 왁스 긁힘을 살리는 비선형 대비 보정(연속 코어 보존).
  const waxRaw = broad * 0.16 + fine * 0.24 + fibre * 0.6;
  const wax = clamp01(0.5 + (waxRaw - 0.5) * 1.24);
  return {
    wax,
    scrape: clamp01(Math.max(0, fibre - 0.4 + (fine - 0.5) * 0.15) * 1.12),
    grit: clamp01(Math.max(0, fine - 0.52) * 1.2),
  };
}

/**
 * Oil bristle film (Magma-class look via multi-scale loaded channels).
 * Uses three 1-D value samples across the stroke — same noise budget as before.
 */
export function studioOssOilBristleFilm(
  x: number,
  y: number,
  directionRadians: number,
  seed: number,
  sample1d: (
    coordinate: number,
    lane: number,
    seed: number,
  ) => number,
): Readonly<{ alpha: number; color: number; lift: number; ridge: number }> {
  const dir = finite(directionRadians);
  const sx = finite(x);
  const sy = finite(y);
  const tangentX = Math.cos(dir);
  const tangentY = Math.sin(dir);
  const across = sx * -tangentY + sy * tangentX;
  const along = sx * tangentX + sy * tangentY;
  const fine = clamp01(sample1d(across * 1.42 + along * 0.022, 31, seed ^ 0x9e57_41b3));
  const mid = clamp01(sample1d(across * 0.48 + along * 0.011, 33, seed ^ 0x2c1b_8e47));
  const broad = clamp01(sample1d(across * 0.18 - along * 0.006, 32, seed ^ 0x4b16_f2d9));
  const load = fine * 0.5 + mid * 0.32 + broad * 0.18;
  const ridge = clamp01((load - 0.28) / 0.52);
  return {
    alpha: 0.68 + ridge * 0.3,
    color: 0.32 + ridge * 0.98,
    lift: (1 - ridge) * 0.35,
    ridge,
  };
}

/**
 * Harmony-style procedural proximity coupling (Sketchy / Web / Shaded math).
 */
export function studioOssHarmonyProximityCoupling(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  neighbourhoodRadius: number,
  seed: number,
  salt = 0,
): Readonly<{ connected: boolean; opacity: number; distance: number; weight: number }> {
  const dx = finite(x1) - finite(x0);
  const dy = finite(y1) - finite(y0);
  const distance = Math.hypot(dx, dy);
  const radius = Math.max(1, finite(neighbourhoodRadius, 1));
  if (distance > radius || distance < 1e-4) {
    return { connected: false, opacity: 0, distance, weight: 0 };
  }
  const ratio = distance / radius;
  const jitter = studioOssUnitHash(seed, salt, (distance * 10) | 0) * 0.25;
  const weight = clamp01((1 - ratio * ratio) * (0.8 + jitter));
  const opacity = Math.max(0.04, Math.min(0.95, weight * 0.75));
  return { connected: weight > 0.08, opacity, distance, weight };
}

/**
 * Krita 5.2 + CSP 3.0급 이방성 왁스 크레용 종이 요철(산/골)·갈필 스킵·부스러기 점착 커널.
 * 저필압에서는 종이 산(peak)만 스치며 골(valley)을 비워 두고, 고필압에서는 왁스가 골까지
 * 불투명하게 눌려 채워지며 스트로크 방향 미세 긁힘과 가장자리 왁스 부스러기를 생성한다.
 */
export function studioOssFabricCrayonGrainAdhesion(
  x: number,
  y: number,
  pressure: number,
  velocity: number,
  seed: number,
  directionRadians = 0,
): Readonly<{
  deposit: number;
  toothBite: number;
  groove: number;
  paperPeak: number;
  drySkip01: number;
  waxCrumb: number;
}> {
  const sx = finite(x);
  const sy = finite(y);
  const p = Math.max(0.05, clamp01(finite(pressure, 0.5)));
  const v = Math.max(0, Math.min(50, finite(velocity, 0)));
  const vNorm = v / 50;
  const dir = finite(directionRadians);
  const cosD = Math.cos(dir);
  const sinD = Math.sin(dir);
  const along = sx * cosD + sy * sinD;
  const across = -sx * sinD + sy * cosD;

  // 2-옥타브 황목/냉압지 종이 높이장: 거시적 요철(macro) + 미세 이빨(micro).
  const macroTooth = studioOssValueNoise2d(sx * 0.19, sy * 0.19, seed ^ 0x6e31);
  const microTooth = studioOssValueNoise2d(sx * 0.58, sy * 0.58, seed ^ 0x3c79);
  const paperPeak = clamp01(0.5 + (macroTooth * 0.56 + microTooth * 0.44 - 0.5) * 1.48);

  // 방향성 왁스 섬유 긁힘(스트로크 횡방향 고주파, 종방향 저주파).
  const anisoStrand = studioOssValueNoise2d(along * 0.12, across * 0.72, seed ^ 0x4b1d);
  const grooveNoise = studioOssValueNoise2d(along * 0.34, across * 1.15, seed ^ 0x9a13);

  // 저필압 갈필 스킵(valley 건너뛰기) vs 고필압 왁스 소성 변형(valley 메움).
  const valleyFill = p ** 1.42;
  const skipThreshold = clamp01((1 - valleyFill) * (0.64 + vNorm * 0.24));
  const peakEngagement = smoothstepRange(skipThreshold - 0.13, skipThreshold + 0.17, paperPeak);
  const drySkip01 = clamp01(1 - peakEngagement);

  const toothBite = clamp01(
    peakEngagement * (0.62 + anisoStrand * 0.26) + valleyFill * 0.34 - vNorm * 0.06,
  );
  const groove = clamp01(
    Math.max(0, (1 - anisoStrand) * 0.62 + grooveNoise * 0.46 - (0.34 + p * 0.32)),
  );
  const waxCrumb = clamp01(
    Math.max(0, grooveNoise * 0.65 + paperPeak * 0.35 - 0.58) * (1.25 - p * 0.35) * 2.4,
  );
  const floorDeposit = 0.038 + p * 0.05;
  const deposit = clamp01(
    Math.max(
      floorDeposit,
      toothBite * (0.5 + p * 0.56) * (1 - groove * 0.34) + valleyFill * 0.16,
    ),
  );
  return { deposit, toothBite, groove, paperPeak, drySkip01, waxCrumb };
}

/**
 * fabric-brushes Long Fur / Harmony Fur tangent strand offset.
 */
export function studioOssFabricLongFurTangentOffset(
  strandIndex: number,
  strandCount: number,
  tangentAngle: number,
  strandLength: number,
  seed: number,
  step = 0,
): Readonly<{ offsetX: number; offsetY: number; angle: number; curl: number; opacity: number }> {
  const count = Math.max(1, finite(strandCount, 1));
  const tAngle = finite(tangentAngle);
  const sLen = Math.max(0, finite(strandLength, 1));
  const u = (finite(strandIndex) / count) - 0.5;
  const hash = studioOssUnitHash(seed, strandIndex, step);
  const curl = (studioOssUnitHash(seed, strandIndex ^ 0x5a, step) - 0.5) * 0.6;
  const length = sLen * (0.7 + hash * 0.6);
  const angle = tAngle + curl + (u * 0.3);
  const normalAngle = tAngle + Math.PI / 2;
  const lateralSpread = u * sLen * 0.5;
  const offsetX = Math.cos(normalAngle) * lateralSpread + Math.cos(angle) * length;
  const offsetY = Math.sin(normalAngle) * lateralSpread + Math.sin(angle) * length;
  const opacity = Math.max(0.08, Math.min(0.85, 0.45 + (1 - Math.abs(u * 2)) * 0.4));
  return { offsetX, offsetY, angle, curl, opacity };
}

/**
 * fabric-brushes Squares procedural mosaic mesh.
 */
export function studioOssFabricSquaresMeshOffset(
  x: number,
  y: number,
  tileSize: number,
  pressure: number,
  seed: number,
  index = 0,
): Readonly<{ tileX: number; tileY: number; size: number; rotation: number; opacity: number }> {
  const size = Math.max(2, finite(tileSize, 2));
  const p = Math.max(0.05, clamp01(finite(pressure, 0.5)));
  const gridX = Math.floor(finite(x) / size) * size + size * 0.5;
  const gridY = Math.floor(finite(y) / size) * size + size * 0.5;
  const jitterAngle = (studioOssUnitHash(seed, index, 0x3c) - 0.5) * 0.45;
  const scale = size * (0.6 + p * 0.55 + studioOssUnitHash(seed, index, 0x7b) * 0.2);
  const opacity = Math.max(0.1, Math.min(0.95, 0.4 + p * 0.5));
  return { tileX: gridX, tileY: gridY, size: scale, rotation: jitterAngle, opacity };
}

/**
 * Klecks-style dynamic pigment smudge & blend transfer.
 */
export function studioOssKlecksSmudgeColorBlend(
  brushR: number,
  brushG: number,
  brushB: number,
  sampledR: number,
  sampledG: number,
  sampledB: number,
  sampledAlpha: number,
  smudgeRate: number,
  wetness: number,
): Readonly<{ r: number; g: number; b: number; pickupRate: number }> {
  const smudge = clamp01(smudgeRate);
  const wet = clamp01(wetness);
  const sA = clamp01(sampledAlpha);
  const pickupRate = smudge * (0.3 + wet * 0.7) * sA;
  const br = finite(brushR);
  const bg = finite(brushG);
  const bb = finite(brushB);
  const sr = finite(sampledR);
  const sg = finite(sampledG);
  const sb = finite(sampledB);
  const r = Math.round(br * (1 - pickupRate) + sr * pickupRate);
  const g = Math.round(bg * (1 - pickupRate) + sg * pickupRate);
  const b = Math.round(bb * (1 - pickupRate) + sb * pickupRate);
  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
    pickupRate,
  };
}

/**
 * p5.brush dynamic vector field curvature & flowfield curl.
 */
export function studioOssP5BrushFlowfieldVector(
  x: number,
  y: number,
  scale: number,
  force: number,
  seed: number,
): Readonly<{ angle: number; velocityX: number; velocityY: number; curlMagnitude: number }> {
  const sx = finite(x);
  const sy = finite(y);
  const s = Math.max(0.001, finite(scale, 0.01));
  const f = Math.max(0.1, Math.min(10, finite(force, 1)));
  const n1 = studioOssValueNoise2d(sx * s, sy * s, seed ^ 0x1f4a);
  const n2 = studioOssValueNoise2d((sx + 100) * s, (sy + 100) * s, seed ^ 0x8b32);
  const angle = n1 * Math.PI * 4;
  const curlMagnitude = Math.abs(n2 - 0.5) * 2;
  const velocityX = Math.cos(angle) * f * (0.5 + curlMagnitude * 0.5);
  const velocityY = Math.sin(angle) * f * (0.5 + curlMagnitude * 0.5);
  return { angle, velocityX, velocityY, curlMagnitude };
}
