/** Production dynamic brush natural-media, centripetal V2 curve, dual-tip & RGB bridge. */
import {
  MANGA_NIB_PERSONALITY_PROFILES,
  createDipPenNibFlexState,
  evaluateDipPenRailroadingProfile,
  evaluateDipPenReservoirFlow,
  stepDipPenNibFlex,
  type MangaNibPersonalityId,
} from "@toonstudio/studio-brush-platform/natural-media";
import type { StudioDynamicBrushDab } from "./studio-brush-dynamics-types";

export type StudioDynamicDualTipMode =
  | "multiply" | "screen" | "intersect" | "darken" | "lighten"
  | "add" | "subtract" | "difference" | "linear-height-subtract";
export interface StudioBarrelTwistChiselConfig {
  readonly enabled?: boolean; readonly nibThicknessRatio01?: number; readonly defaultAltitudeDeg?: number;
}
export interface StudioDynamicDualTipModulationConfig {
  readonly enabled: boolean; readonly mode: StudioDynamicDualTipMode;
  readonly secondarySizeRatio?: number; readonly secondarySpacingRatio?: number;
  readonly secondaryScatter01?: number; readonly secondaryAngleJitterDeg?: number;
  readonly depth01?: number; readonly seed?: number;
}

const cl = (v: number, lo: number, hi: number): number => (!Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v);
const cl01 = (v: number): number => cl(v, 0, 1);
const pick = (a: readonly number[] | null | undefined, t: number, fb: number): number =>
  a?.length ? (a[Math.min(a.length - 1, Math.round(t * (a.length - 1)))] ?? fb) : fb;
function h01(i: number, s: number, seed: number): number {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(s + 17, 0x85ebca77) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function resolveStrokeRgbTuple(
  rgb: readonly [number, number, number] | null | undefined,
  hex: string | null | undefined,
  fb: readonly [number, number, number],
): readonly [number, number, number] {
  if (Array.isArray(rgb) && rgb.length >= 3 && rgb.every((c) => Number.isFinite(c))) {
    return [Math.round(cl(rgb[0]!, 0, 255)), Math.round(cl(rgb[1]!, 0, 255)), Math.round(cl(rgb[2]!, 0, 255))];
  }
  if (typeof hex === "string") {
    const c = hex.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(c)) return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    if (/^[0-9a-fA-F]{3}$/.test(c)) return [parseInt(c[0]! + c[0]!, 16), parseInt(c[1]! + c[1]!, 16), parseInt(c[2]! + c[2]!, 16)];
  }
  return fb;
}

export function resolveNaturalMediaDipPenNibId(id: unknown): MangaNibPersonalityId | null {
  switch (id) {
    case "gpen": case "g-pen": case "g-pen-flex": case "gpen--croquis-capsule": return "g-pen";
    case "maru-pen": case "maru-pen-fine": case "mapping-pen": return "maru-pen";
    case "kaburapen": case "kabura-pen": case "mypaint-cc0--kabura": return "kabura-pen";
    case "school-pen": return "school-pen";
    case "brush-pen": case "fude-brush-pen": case "brush-pen-ink": return "fude-brush-pen";
    default: return null;
  }
}

function cr(p0: number, p1: number, p2: number, p3: number, t0: number, t1: number, t2: number, t3: number, t: number): number {
  const d = (a: number, b: number) => (Math.abs(b - a) < 1e-6 ? 1e-6 : b - a);
  const a1 = ((t1 - t) * p0 + (t - t0) * p1) / d(t0, t1);
  const a2 = ((t2 - t) * p1 + (t - t1) * p2) / d(t1, t2);
  const a3 = ((t3 - t) * p2 + (t - t2) * p3) / d(t2, t3);
  const b1 = ((t2 - t) * a1 + (t - t0) * a2) / d(t0, t2);
  const b2 = ((t3 - t) * a2 + (t - t1) * a3) / d(t1, t3);
  return ((t2 - t) * b1 + (t - t1) * b2) / d(t1, t2);
}

export function resampleFlatStrokeWithCentripetalV2(params: {
  readonly points: readonly number[]; readonly pressures?: readonly number[] | null;
  readonly tiltXs?: readonly number[] | null; readonly tiltYs?: readonly number[] | null;
  readonly twists?: readonly number[] | null; readonly spacingPx: number;
  readonly curvatureStrength?: number; readonly cornerThresholdDegrees?: number; readonly maxStations?: number;
}) {
  const n = Math.floor(params.points.length / 2);
  if (n < 3) return null;
  const pts: { x: number; y: number; p: number; tx: number; ty: number; tw: number }[] = [];
  const at = (a: readonly number[] | null | undefined, i: number, fb: number) => a?.length ? (a[Math.min(i, a.length - 1)] ?? fb) : fb;
  for (let i = 0; i < n; i += 1) {
    const x = params.points[i * 2], y = params.points[i * 2 + 1];
    if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
      pts.push({ x, y, p: cl01(at(params.pressures, i, 0.5)), tx: cl(at(params.tiltXs, i, 0), -90, 90), ty: cl(at(params.tiltYs, i, 0), -90, 90), tw: cl(at(params.twists, i, 0), 0, 359) });
    }
  }
  if (pts.length < 3) return null;
  const sp = Math.max(0.5, params.spacingPx), cg = cl(params.curvatureStrength ?? 1.8, 0, 6);
  const cCos = Math.cos((cl(params.cornerThresholdDegrees ?? 62, 10, 175) * Math.PI) / 180);
  const maxS = Math.min(params.maxStations ?? 4096, 8192);
  const corner = pts.map((_, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const ax = pts[i]!.x - pts[i - 1]!.x, ay = pts[i]!.y - pts[i - 1]!.y, bx = pts[i + 1]!.x - pts[i]!.x, by = pts[i + 1]!.y - pts[i]!.y;
    const al = Math.hypot(ax, ay), bl = Math.hypot(bx, by);
    return al < 1e-4 || bl < 1e-4 || (ax * bx + ay * by) / (al * bl) < cCos;
  });
  const points: number[] = [], pressures: number[] = [], tiltXs: number[] = [], tiltYs: number[] = [], twists: number[] = [];
  for (let i = 0; i < pts.length - 1 && pressures.length < maxS; i += 1) {
    const p1 = pts[i]!, p2 = pts[i + 1]!;
    const p0 = i === 0 || corner[i] ? { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y } : pts[i - 1]!;
    const p3 = i + 2 >= pts.length || corner[i + 1] ? { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y } : pts[i + 2]!;
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const t1 = Math.sqrt(Math.max(1e-4, Math.hypot(p1.x - p0.x, p1.y - p0.y)));
    const t2 = t1 + Math.sqrt(Math.max(1e-4, chord)), t3 = t2 + Math.sqrt(Math.max(1e-4, Math.hypot(p3.x - p2.x, p3.y - p2.y)));
    const steps = Math.max(1, Math.min(64, Math.ceil((chord * (1 + cg * (corner[i] || corner[i + 1] ? 0.35 : 0.14))) / sp)));
    for (let s = i === 0 ? 0 : 1; s <= steps && pressures.length < maxS; s += 1) {
      const u = s / steps, t = t1 + (t2 - t1) * u;
      points.push(cr(p0.x, p1.x, p2.x, p3.x, 0, t1, t2, t3, t), cr(p0.y, p1.y, p2.y, p3.y, 0, t1, t2, t3, t));
      pressures.push(p1.p + (p2.p - p1.p) * u); tiltXs.push(p1.tx + (p2.tx - p1.tx) * u);
      tiltYs.push(p1.ty + (p2.ty - p1.ty) * u); twists.push(p1.tw + (p2.tw - p1.tw) * u);
    }
  }
  return pressures.length >= 2 ? { points, pressures, tiltXs, tiltYs, twists } : null;
}

export function applyDipPenRailroadingToDabs(
  dabs: readonly StudioDynamicBrushDab[], nibId: MangaNibPersonalityId,
  opt?: { readonly pressures?: readonly number[] | null; readonly speeds?: readonly number[] | null; readonly baseWidthPx?: number; readonly maxDabs?: number },
): StudioDynamicBrushDab[] {
  if (!dabs.length) return [];
  const prof = MANGA_NIB_PERSONALITY_PROFILES[nibId];
  const st = createDipPenNibFlexState(prof.spec, opt?.pressures?.length ? cl01(opt.pressures[0]!) : 0.5);
  const maxO = opt?.maxDabs ?? Math.max(dabs.length * 2, 1024), out: StudioDynamicBrushDab[] = [];
  const sc = opt?.baseWidthPx && opt.baseWidthPx > 0 ? opt.baseWidthPx / Math.max(1, prof.spec.baseWidth + prof.spec.gapMax * prof.spec.widthGain) : 1;
  for (let i = 0; i < dabs.length && out.length < maxO; i += 1) {
    const d = dabs[i]!, p = cl01(pick(opt?.pressures, d.progress, 0.5)), spd = Math.max(0.05, pick(opt?.speeds, d.progress, 0.45));
    const flex = stepDipPenNibFlex(st, p, i === 0 ? 8 : cl((d.distanceFromPrevious ?? 2) / spd, 2, 32), prof.spec);
    const res = evaluateDipPenReservoirFlow(d.distanceFromStrokeStart ?? i * Math.max(1, d.spacing), prof.reservoirCapacityPx, p);
    const rail = evaluateDipPenRailroadingProfile(flex.nibGap, prof.spec.gapMax, prof.railroadThresholdRatio, 0);
    const fw = cl(flex.width * res.widthScale * sc, 0.35, 4096), lv = +res.inkRemainingRatio.toFixed(4);
    const span = rail.splitRatio > 0.15 ? +(flex.nibGap * rail.splitRatio * Math.max(0.6, sc)).toFixed(3) : 0;
    if (span > 0.35 && out.length + 2 <= maxO) {
      const r = ((d.direction ?? 0) * Math.PI) / 180, nx = -Math.sin(r) * span * 0.5, ny = Math.cos(r) * span * 0.5;
      const rs = Math.max(0.5, fw * 0.36), ro = cl01(d.opacity * res.flowScale * rail.outerTrackAlpha);
      out.push({ ...d, index: out.length, x: d.x + nx, y: d.y + ny, size: rs, opacity: ro, tineSplitSpanPx: span, railroadingActive: true, inkReservoirLevel01: lv });
      out.push({ ...d, index: out.length, x: d.x - nx, y: d.y - ny, size: rs, opacity: ro, tineSplitSpanPx: span, railroadingActive: true, inkReservoirLevel01: lv });
    } else {
      out.push({ ...d, index: out.length, size: fw, opacity: cl01(d.opacity * res.flowScale), tineSplitSpanPx: 0, railroadingActive: false, inkReservoirLevel01: lv });
    }
  }
  return out;
}

export function applyDynamicDualTip8ModeToDabs(dabs: readonly StudioDynamicBrushDab[], cfg: StudioDynamicDualTipModulationConfig): StudioDynamicBrushDab[] {
  if (!cfg.enabled || !dabs.length) return [...dabs];
  const depth = cl01(cfg.depth01 ?? 0.72), seed = cfg.seed ?? 20261121;
  const sp = cl(cfg.secondarySpacingRatio ?? 0.35, 0.05, 4), sc = cl01(cfg.secondaryScatter01 ?? 0.25), aj = cl(cfg.secondaryAngleJitterDeg ?? 45, 0, 180);
  return dabs.map((d, i) => {
    const ph = (d.distanceFromStrokeStart ?? i * Math.max(1, d.spacing)) / Math.max(1, d.size * sp);
    const sA = cl01((0.5 + 0.5 * Math.sin(ph * Math.PI * 2 + h01(i, 3, seed) * Math.PI)) * (1 - sc * 0.45 * h01(i, 7, seed)));
    const a = cl01(d.opacity); let o = a;
    if (cfg.mode === "multiply") o = a * (1 - depth + depth * sA);
    else if (cfg.mode === "intersect" || cfg.mode === "darken") o = Math.min(a, 1 - depth + depth * sA);
    else if (cfg.mode === "screen") o = a * (1 - depth * (1 - (1 - (1 - a) * (1 - sA))));
    else if (cfg.mode === "lighten") o = cl01(Math.max(a * (1 - depth * 0.35), a * sA));
    else if (cfg.mode === "add") o = cl01(a + depth * 0.25 * sA * a);
    else if (cfg.mode === "subtract" || cfg.mode === "linear-height-subtract") o = cl01(a - depth * (1 - sA) * a * 0.85);
    else if (cfg.mode === "difference") o = cl01(a * (1 - depth * 0.5 + depth * 0.5 * Math.abs(a - sA)));
    return { ...d, opacity: cl01(o), angle: d.angle + (h01(i, 11, seed) - 0.5) * 2 * aj * depth * 0.25, dualTipAlphaScale: +(a > 1e-6 ? o / a : 1).toFixed(4) };
  });
}

export function evaluateCentrifugalTurnSplayRatio(turnRad: number, dtSec: number, speedPxPerSec: number, stiff = 0.45): number {
  const g = cl(((Math.abs(turnRad) / Math.max(0.004, dtSec)) * Math.max(0, speedPxPerSec)) / 1400 / (0.35 + cl(stiff, 0.1, 1) * 0.9), 0, 1.35);
  return +(1 + g * 0.6).toFixed(4);
}

export function applyCentrifugalBristleTurnSplayToDabs(dabs: readonly StudioDynamicBrushDab[], stiff = 0.45, speeds?: readonly number[] | null): StudioDynamicBrushDab[] {
  if (dabs.length < 2) return [...dabs];
  return dabs.map((d, i) => {
    if (i === 0) return { ...d, centrifugalSplayRatio: 1 };
    let dd = (d.direction ?? 0) - (dabs[i - 1]!.direction ?? 0);
    while (dd > 180) dd -= 360; while (dd < -180) dd += 360;
    const spd = Math.max(0.05, pick(speeds, d.progress, 0.45));
    const r = evaluateCentrifugalTurnSplayRatio((dd * Math.PI) / 180, Math.max(0.004, (d.distanceFromPrevious ?? 2) / (spd * 1000)), spd * 1000, stiff);
    return { ...d, size: cl(d.size * (1 + (r - 1) * 0.35), 0.05, 4096), scatter: d.scatter * r, centrifugalSplayRatio: r };
  });
}

export function applyBarrelTwistChiselNibToDabs(
  dabs: readonly StudioDynamicBrushDab[], cfg: StudioBarrelTwistChiselConfig,
  inp?: { readonly twists?: readonly number[] | null; readonly tiltXs?: readonly number[] | null; readonly tiltYs?: readonly number[] | null },
): StudioDynamicBrushDab[] {
  if (!cfg.enabled || !dabs.length) return [...dabs];
  const tr = cl(cfg.nibThicknessRatio01 ?? 0.16, 0.06, 0.9), dAlt = cl(cfg.defaultAltitudeDeg ?? 55, 10, 90);
  return dabs.map((d) => {
    const tw = pick(inp?.twists, d.progress, d.angle), tx = pick(inp?.tiltXs, d.progress, 0), ty = pick(inp?.tiltYs, d.progress, 0);
    const tm = Math.hypot(tx, ty), alt = (cl(tm > 1 ? 90 - tm : dAlt, 10, 90) * Math.PI) / 180;
    const del = (tw * Math.PI) / 180 + (tm > 1 ? Math.atan2(ty, tx) : 0) * 0.35 - ((d.direction ?? 0) * Math.PI) / 180;
    const bw = Math.max(0.5, d.size), et = Math.max(0.25, bw * tr * (0.65 + 0.35 * Math.sin(alt)));
    const pw = Math.hypot(bw * Math.sin(del), et * Math.cos(del));
    return { ...d, size: cl(pw, 0.25, 4096), roundness: cl(tr + (1 - tr) * Math.cos(alt) * 0.35, 0.08, 1), angle: tw, chiselProjectedWidthPx: +pw.toFixed(3) };
  });
}
