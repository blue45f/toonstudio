/**
 * studio-gamut-mask.ts
 *
 * Gamut Mask · Luminosity Lock · Step Mixer for the color picker surfaces.
 * Benchmarks: Krita Gamut Mask, Coolorus Gamut Lock / Luminosity Lock / Mixer.
 *
 * Promoted from the tool-strengths draft `drafts/gamut-mask-model.ts`
 * (presets · containment/clamp geometry · luminosity lock · mixer, verified)
 * onto the production color types of studio-color-harmony-engine
 * (HsvColor + hexToHsv/hsvToHex), so every surface speaks the same HSV.
 *
 * Combination rule with the harmony engine (explicit contract):
 * - Harmony schemes (getAllHarmonies) only *propose* candidate colors.
 *   They are never rewritten by this module.
 * - Gamut mask and luminosity lock are *selection-time filters*: they run
 *   exactly once, when a picked color is about to be applied
 *   (applyGamutSelection). The base color / locked base is untouched.
 * - When both filters are on, luminosity wins for v: the gamut clamp first
 *   tries to stay on the locked value line (s-only clamp). Only when that
 *   horizontal line never crosses the gamut polygon does it fall back to
 *   the nearest-point clamp, which may move v (reported via valueKept).
 * - Mixer step colors pass through the same filters, so a palette saved
 *   from the mixer never leaves the active gamut.
 * - ICC gamut warnings are an output/print concern and stay separate;
 *   this module restricts *picking*, not rendering.
 *
 * Pure TypeScript — zero DOM/Konva dependencies, deterministic.
 */

import {
  hexToHsv,
  hsvToHex,
  type HsvColor,
} from "./studio-color-harmony-engine";
import { normalizeHexColor } from "./studio-color-utils";

export interface GamutPoint {
  readonly s: number; // 0..100
  readonly v: number; // 0..100
}

export interface GamutMask {
  readonly id: string;
  readonly label: string;
  /** Convex polygon on the (s, v) plane, counter-clockwise. */
  readonly polygon: readonly GamutPoint[];
  /** When set, hues outside this window (degrees, wrap allowed) are out of gamut. */
  readonly hueWindow?: { readonly min: number; readonly max: number };
}

/**
 * Gurney-style "character of light" gamuts, re-derived as our own values
 * (concept re-creation, not copied assets).
 */
export const GAMUT_MASK_PRESETS: readonly GamutMask[] = [
  {
    id: "warm-sunlight",
    label: "따뜻한 햇빛",
    polygon: [
      { s: 8, v: 62 },
      { s: 62, v: 100 },
      { s: 96, v: 88 },
      { s: 88, v: 40 },
      { s: 30, v: 30 },
    ],
    hueWindow: { min: 0, max: 80 },
  },
  {
    id: "cool-night",
    label: "차가운 밤",
    polygon: [
      { s: 4, v: 18 },
      { s: 48, v: 56 },
      { s: 84, v: 48 },
      { s: 70, v: 12 },
      { s: 22, v: 6 },
    ],
    hueWindow: { min: 190, max: 300 },
  },
  {
    id: "pastel-soft",
    label: "파스텔",
    polygon: [
      { s: 4, v: 76 },
      { s: 38, v: 100 },
      { s: 52, v: 92 },
      { s: 30, v: 66 },
    ],
  },
  {
    id: "vivid-pop",
    label: "비비드 팝",
    polygon: [
      { s: 46, v: 52 },
      { s: 100, v: 100 },
      { s: 100, v: 46 },
      { s: 52, v: 30 },
    ],
  },
];

export function getGamutMaskPreset(id: string | null | undefined): GamutMask | null {
  if (!id) return null;
  return GAMUT_MASK_PRESETS.find((preset) => preset.id === id) ?? null;
}

/* =====================================================================
 * Geometry (s, v) plane
 * ===================================================================== */

const EPSILON = 1e-9;

export function hueInGamutWindow(h: number, window: { min: number; max: number }): boolean {
  const hue = ((h % 360) + 360) % 360;
  if (window.min <= window.max) return hue >= window.min && hue <= window.max;
  return hue >= window.min || hue <= window.max;
}

function pointOnSegment(p: GamutPoint, a: GamutPoint, b: GamutPoint): boolean {
  const cross = (p.s - a.s) * (b.v - a.v) - (p.v - a.v) * (b.s - a.s);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (p.s - a.s) * (p.s - b.s) + (p.v - a.v) * (p.v - b.v);
  return dot <= EPSILON;
}

function pointInPolygon(p: GamutPoint, polygon: readonly GamutPoint[]): boolean {
  // Boundary counts as inside: a clamped color sits exactly on an edge and
  // must read as "in gamut" afterwards.
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (pointOnSegment(p, polygon[j]!, polygon[i]!)) return true;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.v > p.v !== b.v > p.v &&
      p.s < ((b.s - a.s) * (p.v - a.v)) / (b.v - a.v) + a.s
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function isInGamut(color: HsvColor, mask: GamutMask): boolean {
  if (mask.hueWindow && !hueInGamutWindow(color.h, mask.hueWindow)) return false;
  return pointInPolygon({ s: color.s, v: color.v }, mask.polygon);
}

function closestPointOnSegment(p: GamutPoint, a: GamutPoint, b: GamutPoint): GamutPoint {
  const dx = b.s - a.s;
  const dy = b.v - a.v;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.s - a.s) * dx + (p.v - a.v) * dy) / lenSq));
  return { s: a.s + t * dx, v: a.v + t * dy };
}

function clampHueToWindow(h: number, mask: GamutMask): number {
  const hue = ((h % 360) + 360) % 360;
  if (!mask.hueWindow || hueInGamutWindow(hue, mask.hueWindow)) return hue;
  const circularDistance = (a: number, b: number) => {
    const diff = Math.abs(a - b);
    return Math.min(diff, 360 - diff);
  };
  return circularDistance(hue, mask.hueWindow.min) <= circularDistance(hue, mask.hueWindow.max)
    ? mask.hueWindow.min
    : mask.hueWindow.max;
}

/** Pull an out-of-gamut color to the nearest point on the gamut boundary. */
export function clampToGamut(color: HsvColor, mask: GamutMask): HsvColor {
  const h = clampHueToWindow(color.h, mask);
  const p = { s: color.s, v: color.v };
  if (pointInPolygon(p, mask.polygon)) return { h, s: color.s, v: color.v };
  let best: GamutPoint | null = null;
  let bestDist = Infinity;
  for (let i = 0, j = mask.polygon.length - 1; i < mask.polygon.length; j = i++) {
    const candidate = closestPointOnSegment(p, mask.polygon[j]!, mask.polygon[i]!);
    const dist = (candidate.s - p.s) ** 2 + (candidate.v - p.v) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return { h, s: best!.s, v: best!.v };
}

/** s interval where the horizontal line v crosses the (convex) polygon, or null. */
function valueIntervalAt(mask: GamutMask, v: number): { sMin: number; sMax: number } | null {
  let sMin = Infinity;
  let sMax = -Infinity;
  for (let i = 0, j = mask.polygon.length - 1; i < mask.polygon.length; j = i++) {
    const a = mask.polygon[j]!;
    const b = mask.polygon[i]!;
    if (a.v === b.v) {
      if (v === a.v) {
        sMin = Math.min(sMin, a.s, b.s);
        sMax = Math.max(sMax, a.s, b.s);
      }
      continue;
    }
    const t = (v - a.v) / (b.v - a.v);
    if (t < 0 || t > 1) continue;
    const s = a.s + t * (b.s - a.s);
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
  }
  return sMin === Infinity ? null : { sMin, sMax };
}

/**
 * Gamut clamp that keeps v fixed: intersect the horizontal line v = color.v
 * with the (convex) polygon and clamp s into that interval.
 * Returns null when the line never crosses the polygon.
 */
export function clampToGamutKeepingValue(color: HsvColor, mask: GamutMask): HsvColor | null {
  const interval = valueIntervalAt(mask, color.v);
  if (interval === null) return null;
  return {
    h: clampHueToWindow(color.h, mask),
    s: Math.min(interval.sMax, Math.max(interval.sMin, color.s)),
    v: color.v,
  };
}

/** Step a hue that hugs a window edge toward the window center (wrap windows untouched). */
function nudgeHueInsideWindow(h: number, mask: GamutMask): number {
  const window = mask.hueWindow;
  if (!window || window.min > window.max) return h;
  const center = (window.min + window.max) / 2;
  if (h - window.min < 3) return Math.min(h + 1.5, center);
  if (window.max - h < 3) return Math.max(h - 1.5, center);
  return h;
}

function polygonCentroid(polygon: readonly GamutPoint[]): GamutPoint {
  const sum = polygon.reduce((acc, p) => ({ s: acc.s + p.s, v: acc.v + p.v }), { s: 0, v: 0 });
  return { s: sum.s / polygon.length, v: sum.v / polygon.length };
}

/**
 * Convert a gamut-adjusted HSV color to a hex that is *still* in gamut
 * after the 8-bit round-trip. A point clamped exactly onto the boundary can
 * round one channel step outside, so repair: re-clamp the rounded color,
 * step 0.5° inside a hue-window edge, and if the same hex keeps coming
 * back, pull (s, v) toward the polygon centroid (or, when a value must be
 * kept, s toward the middle of the value-line interval).
 */
function toGamutHex(color: HsvColor, mask: GamutMask, keepValue: number | null): string {
  let hex = hsvToHex(color.h, color.s, color.v);
  const seen = new Set<string>();
  for (let i = 0; i < 24; i += 1) {
    const back = hexToHsv(hex);
    if (isInGamut(back, mask)) return hex;
    seen.add(hex);
    let fixed: HsvColor;
    if (keepValue !== null) {
      fixed = clampToGamutKeepingValue({ ...back, v: keepValue }, mask) ?? clampToGamut(back, mask);
    } else {
      fixed = clampToGamut(back, mask);
    }
    if (mask.hueWindow) {
      if (fixed.h === mask.hueWindow.min) fixed = { ...fixed, h: fixed.h + 0.5 };
      else if (fixed.h === mask.hueWindow.max) fixed = { ...fixed, h: fixed.h - 0.5 };
    }
    const nextHex = hsvToHex(fixed.h, fixed.s, fixed.v);
    if (nextHex !== hex && !seen.has(nextHex)) {
      hex = nextHex;
      continue;
    }
    // The same boundary hex keeps coming back (rounding oscillation):
    // step inside instead of re-clamping onto the edge.
    if (keepValue !== null) {
      const interval = valueIntervalAt(mask, keepValue);
      if (interval === null) return hex;
      hex = hsvToHex(nudgeHueInsideWindow(fixed.h, mask), (interval.sMin + interval.sMax) / 2, keepValue);
      if (isInGamut(hexToHsv(hex), mask)) return hex;
      // Very dark colors quantize s too coarsely for the exact value line:
      // allow the smallest channel steps (≤1 of v) to land inside.
      for (const dv of [0.4, -0.4, 0.8, -0.8, 1, -1]) {
        const shifted = valueIntervalAt(mask, keepValue + dv);
        if (shifted === null) continue;
        const candidate = hsvToHex(fixed.h, (shifted.sMin + shifted.sMax) / 2, keepValue + dv);
        if (isInGamut(hexToHsv(candidate), mask)) return candidate;
      }
      return hex;
    }
    const centroid = polygonCentroid(mask.polygon);
    hex = hsvToHex(
      nudgeHueInsideWindow(fixed.h, mask),
      centroid.s + (fixed.s - centroid.s) * 0.92,
      centroid.v + (fixed.v - centroid.v) * 0.92,
    );
  }
  return hex;
}

/* =====================================================================
 * Luminosity Lock & Mixer (HSV level)
 * ===================================================================== */

/** Coolorus Luminosity Lock: keep the previous value (brightness) exactly. */
export function withLuminosityLock(previous: HsvColor, next: HsvColor): HsvColor {
  return { ...next, v: previous.v };
}

export const MIXER_MAX_STEPS = 24;

/** Intermediate colors from `from` to `to` (shortest-arc hue interpolation). Endpoints excluded. */
export function mixSteps(from: HsvColor, to: HsvColor, steps: number): readonly HsvColor[] {
  const n = Math.max(1, Math.min(MIXER_MAX_STEPS, Math.floor(steps) || 1));
  const dhRaw = ((to.h - from.h + 540) % 360) - 180;
  const out: HsvColor[] = [];
  for (let i = 1; i <= n; i += 1) {
    const t = i / (n + 1);
    out.push({
      h: (((from.h + dhRaw * t) % 360) + 360) % 360,
      s: from.s + (to.s - from.s) * t,
      v: from.v + (to.v - from.v) * t,
    });
  }
  return out;
}

/* =====================================================================
 * Hex level API — the selection-time filter used by picker surfaces
 * ===================================================================== */

export interface GamutSelectionOptions {
  readonly mask?: GamutMask | null;
  readonly luminosityLocked?: boolean;
}

export interface GamutSelectionResult {
  readonly hex: string;
  /** True when the gamut mask moved the picked color. */
  readonly clamped: boolean;
  /** True when a requested luminosity lock survived (v kept from previous color). */
  readonly valueKept: boolean;
}

export function isHexInGamut(rawHex: string, mask: GamutMask): boolean {
  const hex = normalizeHexColor(rawHex);
  if (hex === null) return false;
  return isInGamut(hexToHsv(hex), mask);
}

export function clampHexToGamut(rawHex: string, mask: GamutMask): string {
  const hex = normalizeHexColor(rawHex) ?? "#000000";
  const hsv = hexToHsv(hex);
  if (isInGamut(hsv, mask)) return hex;
  return toGamutHex(clampToGamut(hsv, mask), mask, null);
}

/**
 * The one place a picked color is adjusted before it is applied.
 *
 * Order (combination rule): luminosity lock first (v := previous v), then
 * the gamut clamp — s-only on the locked value line when the lock is on,
 * nearest-point otherwise. With no filter active the picked hex is
 * returned untouched (no HSV round-trip), so default behavior is identical
 * to picking without this module.
 */
export function applyGamutSelection(
  previousHex: string,
  pickedHex: string,
  options: GamutSelectionOptions = {},
): GamutSelectionResult {
  const picked = normalizeHexColor(pickedHex) ?? "#000000";
  const mask = options.mask ?? null;
  const luminosityLocked = options.luminosityLocked === true;
  if (!mask && !luminosityLocked) {
    return { hex: picked, clamped: false, valueKept: false };
  }

  const previous = normalizeHexColor(previousHex) ?? "#000000";
  let next = hexToHsv(picked);
  if (luminosityLocked) {
    next = withLuminosityLock(hexToHsv(previous), next);
  }

  let valueKept = luminosityLocked;
  if (mask && !isInGamut(next, mask)) {
    if (luminosityLocked) {
      const kept = clampToGamutKeepingValue(next, mask);
      if (kept !== null) {
        next = kept;
      } else {
        next = clampToGamut(next, mask);
        valueKept = false;
      }
    } else {
      next = clampToGamut(next, mask);
    }
  }

  const hex = mask
    ? toGamutHex(next, mask, valueKept ? hexToHsv(previous).v : null)
    : hsvToHex(next.h, next.s, next.v);
  return { hex, clamped: hex !== picked, valueKept };
}

/**
 * Mixer step colors as hex. When a mask is given, every step is clamped
 * into the gamut so a saved mixer palette stays inside it.
 */
export function mixStepHexes(
  fromHex: string,
  toHex: string,
  steps: number,
  mask?: GamutMask | null,
): readonly string[] {
  const from = hexToHsv(normalizeHexColor(fromHex) ?? "#000000");
  const to = hexToHsv(normalizeHexColor(toHex) ?? "#000000");
  return mixSteps(from, to, steps).map((step) => {
    if (!mask) return hsvToHex(step.h, step.s, step.v);
    // Even an in-gamut HSV step can round outside as hex, so always go
    // through the round-trip repair when a mask is active.
    return toGamutHex(isInGamut(step, mask) ? step : clampToGamut(step, mask), mask, null);
  });
}
