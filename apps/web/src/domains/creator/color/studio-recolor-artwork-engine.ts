/**
 * Studio Recolor Artwork Engine — Illustrator식 글로벌 Recolor Artwork +
 * OKLCH 휘도(L) 보존 하모니 휠 실시간 재배색 엔진.
 *
 * Björn Ottosson 정확한 sRGB ↔ OKLab ↔ OKLCH 변환 + 이분 탐색 채도 가멋 매핑으로
 * 문서 팔레트 지배색 클러스터 추출, 보색/유사색/삼각/분할보색/단색조 휠 회전,
 * 팔레트 전이, 시간대·무드 프리셋(낮·노을·심야·회상 세피아·인쇄 CMYK 안전 영역)을 제공한다.
 */

import { hexToRgb, rgbToHex, type RgbColor } from "../studio-color-harmony-engine";
import { normalizeHexColor } from "../studio-color-utils";

import type { El } from "../studio-element-model";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface OklabColor { readonly l: number; readonly a: number; readonly b: number; }

export type RecolorHarmonyRule = "preserve-relative" | "complementary" | "analogous" | "triadic" | "split-complementary" | "monochromatic";
export type RecolorMoodPresetId = "daylight" | "sunset" | "midnight" | "memory-sepia" | "print-cmyk-safe";
export type ArtworkColorSlot = "fill" | "stroke" | "textFill" | "bg" | "regionFill";

export interface ArtworkColorTarget { readonly elementId: string; readonly slot: ArtworkColorSlot; readonly colorHex: string; readonly areaWeight: number; }
export interface ArtworkColorClusterMember { readonly hex: string; readonly oklch: OklchColor; readonly areaWeight: number; readonly deltaL: number; readonly deltaC: number; readonly deltaH: number; }

export interface ArtworkColorCluster {
  readonly id: string;
  readonly representativeHex: string;
  readonly representativeOklch: OklchColor;
  readonly members: readonly ArtworkColorClusterMember[];
  readonly targetCount: number;
  readonly totalAreaWeight: number;
  readonly prominence: number;
  readonly isAchromatic: boolean;
}

export interface RecolorClusterOverride { readonly hueDeg?: number; readonly chromaScale?: number; readonly lightnessShift?: number; readonly targetHex?: string; readonly locked?: boolean; }

export interface RecolorWheelState {
  readonly clusters: readonly ArtworkColorCluster[];
  readonly linked: boolean;
  readonly harmonyRule: RecolorHarmonyRule;
  readonly hueRotationDeg: number;
  readonly chromaScale: number;
  readonly lightnessShift: number;
  readonly preserveLuminance: boolean;
  readonly preserveAchromatic: boolean;
  readonly clusterOverrides: Readonly<Record<string, RecolorClusterOverride>>;
}

export interface RecolorClusterResult {
  readonly clusterId: string;
  readonly sourceHex: string;
  readonly targetHex: string;
  readonly sourceOklch: OklchColor;
  readonly targetOklch: OklchColor;
  readonly luminanceDelta: number;
  readonly prominence: number;
  readonly locked: boolean;
}

export interface RecolorMappingResult {
  readonly clusterResults: readonly RecolorClusterResult[];
  readonly colorMap: Readonly<Record<string, string>>;
  readonly maxLuminanceDelta: number;
}

export interface RecolorMoodPreset {
  readonly id: RecolorMoodPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly targetHueDeg: number | null;
  readonly huePullStrength: number;
  readonly chromaScale: number;
  readonly maxChromaCap: number;
  readonly lightnessShift: number;
  readonly preserveLuminance: boolean;
}

export const RECOLOR_MOOD_PRESETS: readonly RecolorMoodPreset[] = Object.freeze([
  { id: "daylight", labelKo: "낮 (기준)", descriptionKo: "원본 명암과 색상을 유지하는 기준 상태입니다.", targetHueDeg: null, huePullStrength: 0, chromaScale: 1, maxChromaCap: 0.4, lightnessShift: 0, preserveLuminance: true },
  { id: "sunset", labelKo: "노을", descriptionKo: "따뜻한 주황·황혼빛 방향으로 색상을 끌고 명도 계층을 유지합니다.", targetHueDeg: 42, huePullStrength: 0.55, chromaScale: 1.08, maxChromaCap: 0.34, lightnessShift: -0.02, preserveLuminance: true },
  { id: "midnight", labelKo: "심야", descriptionKo: "차가운 청남색 달빛 톤으로 정렬하고 전체 명도를 차분하게 낮춥니다.", targetHueDeg: 255, huePullStrength: 0.65, chromaScale: 0.82, maxChromaCap: 0.24, lightnessShift: -0.14, preserveLuminance: false },
  { id: "memory-sepia", labelKo: "회상 세피아", descriptionKo: "회상 컷에 어울리는 따뜻한 황갈 단색조로 채도를 정돈하며 명도를 보존합니다.", targetHueDeg: 68, huePullStrength: 0.92, chromaScale: 0.38, maxChromaCap: 0.09, lightnessShift: 0, preserveLuminance: true },
  { id: "print-cmyk-safe", labelKo: "인쇄 CMYK 안전 영역", descriptionKo: "형광 고채도 색상을 인쇄 가능한 크로마 범위로 부드럽게 압축하면서 명도를 보존합니다.", targetHueDeg: null, huePullStrength: 0, chromaScale: 0.85, maxChromaCap: 0.145, lightnessShift: 0, preserveLuminance: true },
]);

const ACHROMATIC_CHROMA_THRESHOLD = 0.022;
const DEFAULT_MAX_CLUSTERS = 16;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const round4 = (v: number): number => Math.round(v * 10000) / 10000;
const normalizeHueDeg = (deg: number): number => ((deg % 360) + 360) % 360;

function shortestHueDeltaDeg(fromDeg: number, toDeg: number): number {
  let d = normalizeHueDeg(toDeg) - normalizeHueDeg(fromDeg);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

const srgbChannelToLinear = (c255: number): number => {
  const c = clamp(c255, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const linearToSrgbChannel = (linear: number): number => {
  const c = clamp(linear, 0, 1);
  return Math.round(clamp(c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055, 0, 1) * 255);
};

export function srgbToOklab(rgb: RgbColor): OklabColor {
  const r = srgbChannelToLinear(rgb.r), g = srgbChannelToLinear(rgb.g), b = srgbChannelToLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearSrgb(lab: OklabColor): readonly [number, number, number] {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const isLinearRgbInGamut = (rgb: readonly [number, number, number]): boolean =>
  rgb[0] >= -1e-4 && rgb[0] <= 1.0001 && rgb[1] >= -1e-4 && rgb[1] <= 1.0001 && rgb[2] >= -1e-4 && rgb[2] <= 1.0001;

export function oklchToOklab(oklch: OklchColor): OklabColor {
  const rad = (normalizeHueDeg(oklch.h) * Math.PI) / 180;
  return { l: oklch.l, a: oklch.c * Math.cos(rad), b: oklch.c * Math.sin(rad) };
}

export function oklabToOklch(lab: OklabColor): OklchColor {
  const c = Math.hypot(lab.a, lab.b);
  return { l: round4(clamp(lab.l, 0, 1)), c: round4(c), h: c < 1e-6 ? 0 : round4(normalizeHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI)) };
}

export const srgbToOklch = (rgb: RgbColor): OklchColor => oklabToOklch(srgbToOklab(rgb));
export const hexToOklch = (hex: string): OklchColor => srgbToOklch(hexToRgb(hex));

/** 지각 명도(L)와 색상각(H)을 보존하면서 sRGB 가멋 안쪽으로 크로마를 이분 탐색 투영한다. */
export function oklchToSrgbGamutMapped(oklch: OklchColor): RgbColor {
  const l = clamp(oklch.l, 0, 1), h = normalizeHueDeg(oklch.h), targetC = Math.max(0, oklch.c);
  if (l <= 1e-4) return { r: 0, g: 0, b: 0 };
  if (l >= 1 - 1e-4) return { r: 255, g: 255, b: 255 };
  const direct = oklabToLinearSrgb(oklchToOklab({ l, c: targetC, h }));
  if (isLinearRgbInGamut(direct)) return { r: linearToSrgbChannel(direct[0]), g: linearToSrgbChannel(direct[1]), b: linearToSrgbChannel(direct[2]) };

  let lo = 0, hi = targetC;
  for (let iter = 0; iter < 18; iter += 1) {
    const mid = (lo + hi) / 2;
    if (isLinearRgbInGamut(oklabToLinearSrgb(oklchToOklab({ l, c: mid, h })))) lo = mid; else hi = mid;
  }
  const mapped = oklabToLinearSrgb(oklchToOklab({ l, c: lo, h }));
  return { r: linearToSrgbChannel(mapped[0]), g: linearToSrgbChannel(mapped[1]), b: linearToSrgbChannel(mapped[2]) };
}

export const oklchToHexGamutMapped = (oklch: OklchColor): string => {
  const rgb = oklchToSrgbGamutMapped(oklch);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
};

export function oklchDeltaE(a: OklchColor, b: OklchColor): number {
  const la = oklchToOklab(a), lb = oklchToOklab(b);
  return Math.hypot(la.l - lb.l, la.a - lb.a, la.b - lb.b);
}

export const formatOklchCss = (oklch: OklchColor): string =>
  `oklch(${round4(clamp(oklch.l, 0, 1))} ${round4(Math.max(0, oklch.c))} ${round4(normalizeHueDeg(oklch.h))})`;

function estimateDrawAreaWeight(points: readonly number[], strokeWidth: number, hasFill: boolean): number {
  if (points.length < 4) return Math.max(1, strokeWidth * 10);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, pathLen = 0;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]!, y = points[i + 1]!;
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    if (i >= 2) pathLen += Math.hypot(x - points[i - 2]!, y - points[i - 1]!);
  }
  return hasFill ? Math.max(1, (maxX - minX) * (maxY - minY)) : Math.max(1, pathLen * Math.max(1, strokeWidth));
}

export function extractArtworkColorTargetsFromElements(elements: readonly El[]): readonly ArtworkColorTarget[] {
  const targets: ArtworkColorTarget[] = [];
  const push = (elementId: string, slot: ArtworkColorSlot, raw: string | undefined, weight: number): void => {
    const norm = raw ? normalizeHexColor(raw) : null;
    if (norm) targets.push({ elementId, slot, colorHex: norm, areaWeight: Math.max(1, weight) });
  };
  for (const el of elements) {
    if (el.hidden) continue;
    if (el.type === "draw" && el.mode !== "eraser") {
      if (el.strokeWidth > 0) push(el.id, "stroke", el.stroke, estimateDrawAreaWeight(el.points, el.strokeWidth, false));
      push(el.id, "fill", el.fill, estimateDrawAreaWeight(el.points, el.strokeWidth, true));
    } else if (el.type === "bubble") {
      const a = Math.max(1, el.width * el.height);
      push(el.id, "fill", el.fill, a); push(el.id, "textFill", el.textFill, a * 0.2);
      push(el.id, "stroke", el.stroke, (el.width + el.height) * 2 * Math.max(1, el.strokeWidth ?? 2));
    } else if (el.type === "text") {
      const a = Math.max(1, el.width * el.fontSize * 1.4);
      push(el.id, "fill", el.fill, a); push(el.id, "stroke", el.stroke, a * 0.25);
    } else if (el.type === "frame") {
      push(el.id, "bg", el.bgColor ?? el.bg, Math.max(1, el.width * el.height));
      push(el.id, "stroke", el.stroke, (el.width + el.height) * 2 * Math.max(1, el.strokeWidth ?? 2));
    }
  }
  return targets;
}

export function extractArtworkColorClusters(
  targets: readonly ArtworkColorTarget[],
  options?: { readonly maxClusters?: number; readonly mergeDeltaE?: number; readonly separateAchromatic?: boolean },
): readonly ArtworkColorCluster[] {
  const maxClusters = Math.max(1, Math.min(32, Math.floor(options?.maxClusters ?? DEFAULT_MAX_CLUSTERS)));
  const mergeDeltaE = Math.max(0.005, options?.mergeDeltaE ?? 0.085);
  const separateAchromatic = options?.separateAchromatic ?? true;

  const byHex = new Map<string, { hex: string; oklch: OklchColor; weight: number; count: number }>();
  let grandTotalWeight = 0;
  for (const t of targets) {
    const norm = normalizeHexColor(t.colorHex);
    if (!norm) continue;
    const w = Math.max(1, t.areaWeight);
    grandTotalWeight += w;
    const cur = byHex.get(norm);
    if (cur) { cur.weight += w; cur.count += 1; } else byHex.set(norm, { hex: norm, oklch: hexToOklch(norm), weight: w, count: 1 });
  }
  if (byHex.size === 0) return [];

  const uniqueColors = [...byHex.values()].sort((a, b) => b.weight - a.weight || a.hex.localeCompare(b.hex));
  const clusters: { repHex: string; repOklch: OklchColor; isAchromatic: boolean; members: typeof uniqueColors; totalWeight: number; targetCount: number }[] = [];

  for (const item of uniqueColors) {
    const itemAch = item.oklch.c < ACHROMATIC_CHROMA_THRESHOLD;
    let best: (typeof clusters)[number] | null = null, bestDist = Infinity;
    for (const c of clusters) {
      if (separateAchromatic && c.isAchromatic !== itemAch) continue;
      const d = oklchDeltaE(c.repOklch, item.oklch);
      if (d <= mergeDeltaE && d < bestDist) { bestDist = d; best = c; }
    }
    if (best) { best.members.push(item); best.totalWeight += item.weight; best.targetCount += item.count; }
    else clusters.push({ repHex: item.hex, repOklch: item.oklch, isAchromatic: itemAch, members: [item], totalWeight: item.weight, targetCount: item.count });
  }

  while (clusters.length > maxClusters) {
    let mA = 0, mB = 1, minD = Infinity;
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        if (separateAchromatic && clusters[i]!.isAchromatic !== clusters[j]!.isAchromatic && clusters.length > 2) continue;
        const d = oklchDeltaE(clusters[i]!.repOklch, clusters[j]!.repOklch);
        if (d < minD) { minD = d; mA = i; mB = j; }
      }
    }
    const primary = clusters[mA]!.totalWeight >= clusters[mB]!.totalWeight ? clusters[mA]! : clusters[mB]!;
    const secondary = primary === clusters[mA]! ? clusters[mB]! : clusters[mA]!;
    primary.members.push(...secondary.members); primary.totalWeight += secondary.totalWeight; primary.targetCount += secondary.targetCount;
    clusters.splice(primary === clusters[mA]! ? mB : mA, 1);
  }

  clusters.sort((a, b) => b.totalWeight - a.totalWeight || a.repHex.localeCompare(b.repHex));
  return clusters.map((c, idx) => ({
    id: `cluster-${idx + 1}`, representativeHex: c.repHex, representativeOklch: c.repOklch,
    members: c.members.map((m) => ({ hex: m.hex, oklch: m.oklch, areaWeight: m.weight, deltaL: round4(m.oklch.l - c.repOklch.l), deltaC: round4(m.oklch.c - c.repOklch.c), deltaH: round4(shortestHueDeltaDeg(c.repOklch.h, m.oklch.h)) })),
    targetCount: c.targetCount, totalAreaWeight: c.totalWeight, prominence: round4(c.totalWeight / Math.max(1, grandTotalWeight)), isAchromatic: c.isAchromatic,
  }));
}

export function createRecolorWheelState(clusters: readonly ArtworkColorCluster[], options?: Partial<Omit<RecolorWheelState, "clusters">>): RecolorWheelState {
  return {
    clusters, linked: options?.linked ?? true, harmonyRule: options?.harmonyRule ?? "preserve-relative",
    hueRotationDeg: options?.hueRotationDeg ?? 0, chromaScale: options?.chromaScale ?? 1, lightnessShift: options?.lightnessShift ?? 0,
    preserveLuminance: options?.preserveLuminance ?? true, preserveAchromatic: options?.preserveAchromatic ?? true, clusterOverrides: options?.clusterOverrides ?? {},
  };
}

const HARMONY_SPOKES: Readonly<Record<RecolorHarmonyRule, readonly number[]>> = Object.freeze({
  "preserve-relative": [],
  complementary: [0, 180],
  analogous: [0, 30, -30],
  triadic: [0, 120, 240],
  "split-complementary": [0, 150, 210],
  monochromatic: [0],
});

/** OKLCH 명도(L) 보존 하모니 휠 회전 및 개별 오버라이드를 실시간 매핑한다. */
export function evaluateRecolorMapping(state: RecolorWheelState): RecolorMappingResult {
  const primaryBaseHue = state.clusters.find((c) => !c.isAchromatic)?.representativeOklch.h ?? 0;
  const colorMap: Record<string, string> = {};
  const clusterResults: RecolorClusterResult[] = [];
  let maxLuminanceDelta = 0, chromaticIdx = 0;

  for (const cluster of state.clusters) {
    const ov = state.clusterOverrides[cluster.id];
    const isLocked = Boolean(ov?.locked) || (cluster.isAchromatic && state.preserveAchromatic && !ov?.targetHex);
    if (isLocked) {
      for (const m of cluster.members) colorMap[m.hex] = m.hex;
      clusterResults.push({ clusterId: cluster.id, sourceHex: cluster.representativeHex, targetHex: cluster.representativeHex, sourceOklch: cluster.representativeOklch, targetOklch: cluster.representativeOklch, luminanceDelta: 0, prominence: cluster.prominence, locked: true });
      continue;
    }

    const cIdx = cluster.isAchromatic ? 0 : chromaticIdx++;
    const cScale = clamp(ov?.chromaScale ?? state.chromaScale, 0, 2);
    const lShift = state.preserveLuminance ? 0 : clamp(ov?.lightnessShift ?? state.lightnessShift, -0.5, 0.5);
    let targetRep: OklchColor;

    if (ov?.targetHex) {
      const ex = hexToOklch(ov.targetHex);
      targetRep = { l: state.preserveLuminance ? cluster.representativeOklch.l : ex.l, c: ex.c, h: ex.h };
    } else {
      const spokes = HARMONY_SPOKES[state.harmonyRule];
      const targetH = ov?.hueDeg !== undefined
        ? normalizeHueDeg(ov.hueDeg)
        : spokes.length === 0
          ? normalizeHueDeg(cluster.representativeOklch.h + state.hueRotationDeg)
          : normalizeHueDeg(primaryBaseHue + state.hueRotationDeg + spokes[cIdx % spokes.length]!);
      targetRep = { l: clamp(cluster.representativeOklch.l + lShift, 0, 1), c: clamp(cluster.representativeOklch.c * cScale, 0, 0.4), h: targetH };
    }

    const mappedRepHex = oklchToHexGamutMapped(targetRep);
    const actualRep = hexToOklch(mappedRepHex);
    const lDelta = Math.abs(actualRep.l - cluster.representativeOklch.l);
    if (lDelta > maxLuminanceDelta) maxLuminanceDelta = lDelta;
    const hueShift = shortestHueDeltaDeg(cluster.representativeOklch.h, targetRep.h);

    for (const m of cluster.members) {
      const targetMember: OklchColor = ov?.targetHex
        ? { l: state.preserveLuminance ? m.oklch.l : clamp(targetRep.l + m.deltaL, 0, 1), c: clamp(Math.max(0, targetRep.c + m.deltaC), 0, 0.4), h: normalizeHueDeg(targetRep.h + m.deltaH * 0.4) }
        : { l: state.preserveLuminance ? m.oklch.l : clamp(m.oklch.l + lShift, 0, 1), c: clamp(m.oklch.c * cScale, 0, 0.4), h: normalizeHueDeg(m.oklch.h + hueShift) };
      colorMap[m.hex] = oklchToHexGamutMapped(targetMember);
    }
    clusterResults.push({ clusterId: cluster.id, sourceHex: cluster.representativeHex, targetHex: mappedRepHex, sourceOklch: cluster.representativeOklch, targetOklch: actualRep, luminanceDelta: round4(lDelta), prominence: cluster.prominence, locked: false });
  }
  return { clusterResults, colorMap, maxLuminanceDelta: round4(maxLuminanceDelta) };
}

export function remapArtworkToPalette(state: RecolorWheelState, paletteColors: readonly string[], options?: { readonly preserveLuminance?: boolean; readonly preserveAchromatic?: boolean }): RecolorWheelState {
  const valid = paletteColors.map((c) => normalizeHexColor(c)).filter((c): c is string => c !== null);
  if (valid.length === 0) return state;
  const preserveAchromatic = options?.preserveAchromatic ?? state.preserveAchromatic;
  const overrides: Record<string, RecolorClusterOverride> = {};
  let sIdx = 0;
  for (const c of state.clusters) {
    if (c.isAchromatic && preserveAchromatic) continue;
    overrides[c.id] = { targetHex: valid[sIdx++ % valid.length]! };
  }
  return { ...state, linked: false, preserveLuminance: options?.preserveLuminance ?? state.preserveLuminance, preserveAchromatic, clusterOverrides: overrides };
}

export function applyRecolorMoodPreset(state: RecolorWheelState, presetId: RecolorMoodPresetId): RecolorMappingResult {
  const preset = RECOLOR_MOOD_PRESETS.find((p) => p.id === presetId) ?? RECOLOR_MOOD_PRESETS[0]!;
  const overrides: Record<string, RecolorClusterOverride> = {};
  for (const c of state.clusters) {
    if (c.isAchromatic && state.preserveAchromatic) { overrides[c.id] = { locked: true }; continue; }
    const b = c.representativeOklch;
    const h = preset.targetHueDeg === null ? b.h : normalizeHueDeg(b.h + shortestHueDeltaDeg(b.h, preset.targetHueDeg) * preset.huePullStrength);
    const l = preset.preserveLuminance ? b.l : clamp(b.l + preset.lightnessShift, 0.05, 0.98);
    overrides[c.id] = { targetHex: oklchToHexGamutMapped({ l, c: Math.min(preset.maxChromaCap, b.c * preset.chromaScale), h }) };
  }
  return evaluateRecolorMapping({ ...state, linked: false, preserveLuminance: preset.preserveLuminance, clusterOverrides: overrides });
}

export function applyRecolorMappingToElements(elements: readonly El[], mapping: RecolorMappingResult): { readonly elements: readonly El[]; readonly changedElementIds: readonly string[] } {
  const changedElementIds: string[] = [];
  const remap = (raw: string | undefined): string | undefined => {
    const norm = raw ? normalizeHexColor(raw) : null;
    return norm ? (mapping.colorMap[norm] ?? raw) : raw;
  };
  const nextElements = elements.map((el) => {
    if (el.hidden) return el;
    if (el.type === "draw") {
      const stroke = remap(el.stroke) ?? el.stroke, fill = remap(el.fill);
      if (stroke === el.stroke && fill === el.fill) return el;
      changedElementIds.push(el.id);
      return { ...el, stroke, ...(fill !== undefined ? { fill } : {}) };
    }
    if (el.type === "bubble") {
      const fill = remap(el.fill) ?? el.fill, textFill = remap(el.textFill) ?? el.textFill, stroke = remap(el.stroke);
      if (fill === el.fill && textFill === el.textFill && stroke === el.stroke) return el;
      changedElementIds.push(el.id);
      return { ...el, fill, textFill, ...(stroke !== undefined ? { stroke } : {}) };
    }
    if (el.type === "text") {
      const fill = remap(el.fill) ?? el.fill, stroke = remap(el.stroke);
      if (fill === el.fill && stroke === el.stroke) return el;
      changedElementIds.push(el.id);
      return { ...el, fill, ...(stroke !== undefined ? { stroke } : {}) };
    }
    if (el.type === "frame") {
      const bg = remap(el.bg), bgColor = remap(el.bgColor), stroke = remap(el.stroke);
      if (bg === el.bg && bgColor === el.bgColor && stroke === el.stroke) return el;
      changedElementIds.push(el.id);
      return { ...el, ...(bg !== undefined ? { bg } : {}), ...(bgColor !== undefined ? { bgColor } : {}), ...(stroke !== undefined ? { stroke } : {}) };
    }
    return el;
  });
  return { elements: nextElements, changedElementIds };
}
