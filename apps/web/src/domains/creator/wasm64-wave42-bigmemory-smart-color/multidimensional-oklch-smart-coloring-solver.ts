/**
 * Wave 42: 다차원 OKLCH 벡터 공간 스마트 컬러링 솔버 (`multidimensional-oklch-smart-coloring-solver`).
 * 선화 폐영역 인접 그래프 + `OKLCH`·재질 반사율·모델시트 앵커 다차원 에너지 최소화,
 * 인접 이종 영역 최소 지각 대비(`DeltaE_OK`) 보정 및 `Ambient / Key / Rim` 색온도 음영을 수행한다.
 */

export const DEFAULT_MIN_ADJACENT_DELTA_E_OK = 0.065 as const;
export const DEFAULT_NEUTRAL_KELVIN = 6_500 as const;
export const MAX_SKIN_HUE_SHIFT_DEG = 4 as const;

export type SmartColorMaterialCategory = "background" | "fabric" | "hair" | "metal" | "prop" | "skin";
export interface Srgb8Color { readonly r: number; readonly g: number; readonly b: number }
export interface OklabVector { readonly l: number; readonly a: number; readonly b: number }
export interface OklchColorVector { readonly l: number; readonly c: number; readonly hDeg: number }

export interface SmartColorMaterialTrait {
  readonly category: SmartColorMaterialCategory;
  readonly roughness: number; readonly metallic: number; readonly subsurfaceScatter?: number;
}

export interface LineArtClosedRegion {
  readonly regionId: string; readonly areaPx: number;
  readonly centroid: { readonly x: number; readonly y: number };
  readonly material: SmartColorMaterialTrait;
  readonly seedColorSrgb?: Srgb8Color; readonly paletteAnchorId?: string;
  readonly semanticFeatureVector?: readonly number[];
  readonly normalAzimuthDeg?: number; readonly normalElevationDeg?: number;
}

export interface RegionAdjacencyEdge {
  readonly regionA: string; readonly regionB: string;
  readonly sharedBoundaryPx: number; readonly lineClosureStrength: number;
}

export interface ModelSheetPaletteAnchor {
  readonly anchorId: string; readonly roleNameKo: string;
  readonly category: SmartColorMaterialCategory; readonly baseSrgb: Srgb8Color;
  readonly featurePrototype?: readonly number[]; readonly anchorWeight?: number;
}

export interface SceneLightingEnvironment {
  readonly ambientKelvin: number; readonly keyKelvin: number; readonly rimKelvin: number;
  readonly keyAzimuthDeg: number; readonly keyElevationDeg: number;
  readonly ambientIntensity?: number; readonly keyIntensity?: number; readonly rimIntensity?: number;
}

export interface SmartColoringGraphInput {
  readonly regions: readonly LineArtClosedRegion[];
  readonly edges: readonly RegionAdjacencyEdge[];
  readonly paletteAnchors?: readonly ModelSheetPaletteAnchor[];
  readonly lighting: SceneLightingEnvironment;
  readonly minAdjacentDeltaEOk?: number; readonly solverIterations?: number;
}

export interface SmartColoredRegionResult {
  readonly regionId: string; readonly category: SmartColorMaterialCategory;
  readonly matchedAnchorId: string | null;
  readonly flatBaseSrgb: Srgb8Color; readonly flatBaseOklch: OklchColorVector;
  readonly ambientShadowSrgb: Srgb8Color; readonly keyLitSrgb: Srgb8Color; readonly rimHighlightSrgb: Srgb8Color;
  readonly seedLocked: boolean; readonly skinHueDriftDeg: number;
}

export interface SmartColoringGraphSolution {
  readonly regions: readonly SmartColoredRegionResult[];
  readonly initialEnergy: number; readonly finalEnergy: number; readonly convergedIterations: number;
  readonly minObservedDistinctAdjacentDeltaEOk: number; readonly remediatedContrastEdgeCount: number;
}

function clamp(value: number, min: number, max: number): number {
  return !Number.isFinite(value) ? min : Math.min(max, Math.max(min, value));
}

function wrapHueDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod === 0 ? 0 : mod;
}

function shortestHueDeltaDeg(fromDeg: number, toDeg: number): number {
  const diff = wrapHueDeg(toDeg) - wrapHueDeg(fromDeg);
  return diff > 180 ? diff - 360 : diff < -180 ? diff + 360 : diff;
}

function srgbChannelToLinear(c255: number): number {
  const v = clamp(c255 / 255, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(lin: number): number {
  const v = clamp(lin, 0, 1);
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp(encoded * 255, 0, 255));
}

function oklabToLinearRgbUnclamped(lab: OklabVector): { r: number; g: number; b: number } {
  const l = (lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.l - 0.0894841775 * lab.a - 1.2914855480 * lab.b) ** 3;
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

function isInLinearSrgbGamut(rgb: { r: number; g: number; b: number }): boolean {
  const eps = 1e-4;
  return rgb.r >= -eps && rgb.r <= 1 + eps && rgb.g >= -eps && rgb.g <= 1 + eps && rgb.b >= -eps && rgb.b <= 1 + eps;
}

/** `sRGB (0..255)` 색상을 Björn Ottosson `Oklab` 지각 좌표로 변환한다. */
export function computeOklabFromSrgb(srgb: Srgb8Color): OklabVector {
  const r = srgbChannelToLinear(srgb.r);
  const g = srgbChannelToLinear(srgb.g);
  const b = srgbChannelToLinear(srgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

/** `sRGB (0..255)` 색상을 `OKLCH (L, C, hDeg)` 극좌표 벡터로 변환한다. */
export function computeOklchFromSrgb(srgb: Srgb8Color): OklchColorVector {
  const lab = computeOklabFromSrgb(srgb);
  const c = Math.hypot(lab.a, lab.b);
  return { l: clamp(lab.l, 0, 1), c, hDeg: c < 1e-6 ? 0 : wrapHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI) };
}

/** 명도·색상각을 보존하는 이진 채도 감쇠로 `OKLCH` 좌표를 `sRGB` 색역 안으로 투영·변환한다. */
export function computeSrgbFromOklch(oklch: OklchColorVector): Srgb8Color {
  const targetL = clamp(oklch.l, 0, 1);
  if (targetL <= 0.0005) return { r: 0, g: 0, b: 0 };
  if (targetL >= 0.9995 && oklch.c < 1e-4) return { r: 255, g: 255, b: 255 };
  const rad = (wrapHueDeg(oklch.hDeg) * Math.PI) / 180;
  const cosH = Math.cos(rad);
  const sinH = Math.sin(rad);
  let targetC = Math.max(0, oklch.c);
  if (!isInLinearSrgbGamut(oklabToLinearRgbUnclamped({ l: targetL, a: targetC * cosH, b: targetC * sinH }))) {
    let low = 0;
    let high = targetC;
    for (let step = 0; step < 16; step += 1) {
      const mid = (low + high) * 0.5;
      if (isInLinearSrgbGamut(oklabToLinearRgbUnclamped({ l: targetL, a: mid * cosH, b: mid * sinH }))) low = mid;
      else high = mid;
    }
    targetC = low;
  }
  const lin = oklabToLinearRgbUnclamped({ l: targetL, a: targetC * cosH, b: targetC * sinH });
  return { r: linearToSrgbChannel(lin.r), g: linearToSrgbChannel(lin.g), b: linearToSrgbChannel(lin.b) };
}

function oklabToSrgbGamutSafe(lab: OklabVector): Srgb8Color {
  const c = Math.hypot(lab.a, lab.b);
  return computeSrgbFromOklch({ l: clamp(lab.l, 0, 1), c, hDeg: c < 1e-6 ? 0 : wrapHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI) });
}

/** 두 `sRGB` 색상의 `Oklab` 유클리드 지각 색차 (`DeltaE_OK`)를 계산한다. */
export function computeDeltaEOk(colorA: Srgb8Color, colorB: Srgb8Color): number {
  const labA = computeOklabFromSrgb(colorA);
  const labB = computeOklabFromSrgb(colorB);
  return Math.hypot(labA.l - labB.l, labA.a - labB.a, labA.b - labB.b);
}

/** 색온도(`1,800K .. 20,000K`)를 `6,500K = (1, 1, 1)` 정규화 선형 광원 RGB 틴트로 변환한다. */
export function computeKelvinLinearTint(kelvin: number): { readonly r: number; readonly g: number; readonly b: number } {
  const rawTint = (tempK: number) => {
    const t = clamp(tempK, 1_800, 20_000) / 100;
    const r = t <= 66 ? 1 : clamp((329.698727446 * (t - 60) ** -0.1332047592) / 255, 0, 1);
    const g = t <= 66 ? clamp((99.4708025861 * Math.log(t) - 161.1195681661) / 255, 0, 1) : clamp((288.1221695283 * (t - 60) ** -0.0755148492) / 255, 0, 1);
    const b = t >= 66 ? 1 : t <= 19 ? 0 : clamp((138.5177312231 * Math.log(t - 10) - 305.0447927307) / 255, 0, 1);
    return { r: srgbChannelToLinear(r * 255), g: srgbChannelToLinear(g * 255), b: srgbChannelToLinear(b * 255) };
  };
  const sample = rawTint(kelvin);
  const neutral = rawTint(DEFAULT_NEUTRAL_KELVIN);
  return {
    r: clamp(sample.r / Math.max(1e-4, neutral.r), 0.45, 1.65),
    g: clamp(sample.g / Math.max(1e-4, neutral.g), 0.45, 1.65),
    b: clamp(sample.b / Math.max(1e-4, neutral.b), 0.45, 1.65),
  };
}

function featureSimilarity(vecA?: readonly number[], vecB?: readonly number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0.5;
  const dim = Math.min(vecA.length, vecB.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < dim; i += 1) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA <= 1e-9 || normB <= 1e-9 ? 0.5 : clamp((dot / Math.sqrt(normA * normB) + 1) * 0.5, 0, 1);
}

function matchPaletteAnchor(region: LineArtClosedRegion, anchors: readonly ModelSheetPaletteAnchor[]): ModelSheetPaletteAnchor | null {
  if (anchors.length === 0) return null;
  if (region.paletteAnchorId) {
    const exact = anchors.find((item) => item.anchorId === region.paletteAnchorId);
    if (exact) return exact;
  }
  let best: ModelSheetPaletteAnchor | null = null;
  let bestScore = -1;
  for (const anchor of anchors) {
    if (anchor.category !== region.material.category) continue;
    const sim = featureSimilarity(region.semanticFeatureVector, anchor.featurePrototype);
    if (sim > bestScore) {
      bestScore = sim;
      best = anchor;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

interface SolverNodeState {
  readonly region: LineArtClosedRegion; readonly seedLab: OklabVector | null;
  readonly anchor: ModelSheetPaletteAnchor | null; readonly anchorLab: OklabVector | null;
  readonly anchorStrength: number; lab: { l: number; a: number; b: number };
}

function computeGraphQuadraticEnergy(nodes: readonly SolverNodeState[], edgeList: readonly { idxA: number; idxB: number; coupling: number }[]): number {
  let energy = 0;
  for (const node of nodes) {
    if (node.seedLab) energy += 40 * ((node.lab.l - node.seedLab.l) ** 2 + (node.lab.a - node.seedLab.a) ** 2 + (node.lab.b - node.seedLab.b) ** 2);
    if (node.anchorLab && node.anchorStrength > 0) {
      energy += node.anchorStrength * ((node.lab.l - node.anchorLab.l) ** 2 + (node.lab.a - node.anchorLab.a) ** 2 + (node.lab.b - node.anchorLab.b) ** 2);
    }
  }
  for (const edge of edgeList) {
    const left = nodes[edge.idxA].lab;
    const right = nodes[edge.idxB].lab;
    energy += edge.coupling * ((left.l - right.l) ** 2 + (left.a - right.a) ** 2 + (left.b - right.b) ** 2);
  }
  return energy;
}

function computeDir3(azimuthDeg: number, elevationDeg: number): { x: number; y: number; z: number } {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (clamp(elevationDeg, -89, 89) * Math.PI) / 180;
  return { x: Math.cos(az) * Math.cos(el), y: Math.sin(az) * Math.cos(el), z: Math.sin(el) };
}

function clampSkinLitHue(baseOklch: OklchColorVector, candidateSrgb: Srgb8Color): { srgb: Srgb8Color; driftDeg: number } {
  const candOklch = computeOklchFromSrgb(candidateSrgb);
  const rawShift = shortestHueDeltaDeg(baseOklch.hDeg, candOklch.hDeg);
  if (Math.abs(rawShift) <= MAX_SKIN_HUE_SHIFT_DEG) return { srgb: candidateSrgb, driftDeg: Math.abs(rawShift) };
  const sign = Math.sign(rawShift);
  const preservedC = Math.max(candOklch.c, baseOklch.c * 0.75);
  for (const cap of [3.2, 2.2, 1.0, 0]) {
    const projected = computeSrgbFromOklch({ l: candOklch.l, c: preservedC, hDeg: wrapHueDeg(baseOklch.hDeg + sign * cap) });
    const drift = Math.abs(shortestHueDeltaDeg(baseOklch.hDeg, computeOklchFromSrgb(projected).hDeg));
    if (drift <= MAX_SKIN_HUE_SHIFT_DEG) return { srgb: projected, driftDeg: drift };
  }
  return { srgb: candidateSrgb, driftDeg: 0 };
}

/** 선화 폐영역 인접 그래프 위에서 다차원 `OKLCH` 에너지를 최소화하여 채색·대비 보정·광원 음영을 수행한다. */
export function solveSmartColoringGraph(input: SmartColoringGraphInput): SmartColoringGraphSolution {
  const anchors = input.paletteAnchors ?? [];
  const minDeltaE = clamp(input.minAdjacentDeltaEOk ?? DEFAULT_MIN_ADJACENT_DELTA_E_OK, 0.01, 0.35);
  const maxIterations = Math.max(6, Math.min(80, Math.trunc(input.solverIterations ?? 28)));
  const regionIndexById = new Map<string, number>();

  const nodes: SolverNodeState[] = input.regions.map((region, idx) => {
    regionIndexById.set(region.regionId, idx);
    const seedLab = region.seedColorSrgb ? computeOklabFromSrgb(region.seedColorSrgb) : null;
    const anchor = seedLab ? null : matchPaletteAnchor(region, anchors);
    return {
      region, seedLab, anchor, anchorLab: anchor ? computeOklabFromSrgb(anchor.baseSrgb) : null,
      anchorStrength: anchor ? clamp(anchor.anchorWeight ?? 4.5, 0.5, 25) : 0,
      lab: seedLab ? { l: seedLab.l, a: seedLab.a, b: seedLab.b } : { l: 0.72, a: 0, b: 0 },
    };
  });

  const coupledEdges: { idxA: number; idxB: number; coupling: number; distinctRole: boolean }[] = [];
  const adjacencyLists: { neighborIdx: number; coupling: number }[][] = nodes.map(() => []);

  for (const edge of input.edges) {
    const idxA = regionIndexById.get(edge.regionA);
    const idxB = regionIndexById.get(edge.regionB);
    if (idxA === undefined || idxB === undefined || idxA === idxB) continue;
    const regA = nodes[idxA].region;
    const regB = nodes[idxB].region;
    const sameCategory = regA.material.category === regB.material.category;
    const featSim = featureSimilarity(regA.semanticFeatureVector, regB.semanticFeatureVector);
    const matDiff = Math.abs(regA.material.roughness - regB.material.roughness) + Math.abs(regA.material.metallic - regB.material.metallic);
    const openness = 1 - clamp(edge.lineClosureStrength, 0, 0.92) * 0.75;
    const coupling = Math.max(0.04, (Math.log1p(Math.max(1, edge.sharedBoundaryPx)) / 5) * openness * (sameCategory ? 1.35 : 0.28) * (0.35 + 0.65 * featSim) * Math.exp(-matDiff));
    const distinctAnchor = nodes[idxA].anchor !== null && nodes[idxB].anchor !== null && nodes[idxA].anchor?.anchorId !== nodes[idxB].anchor?.anchorId;
    const distinctSeed = Boolean(nodes[idxA].seedLab && nodes[idxB].seedLab) && computeDeltaEOk(regA.seedColorSrgb!, regB.seedColorSrgb!) >= minDeltaE;
    coupledEdges.push({ idxA, idxB, coupling, distinctRole: !sameCategory || distinctAnchor || distinctSeed });
    adjacencyLists[idxA].push({ neighborIdx: idxB, coupling });
    adjacencyLists[idxB].push({ neighborIdx: idxA, coupling });
  }

  const initialEnergy = computeGraphQuadraticEnergy(nodes, coupledEdges);
  let convergedIterations = maxIterations;
  for (let iter = 0; iter < maxIterations; iter += 1) {
    let maxStepDelta = 0;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node.seedLab) continue;
      let weightSum = node.anchorLab && node.anchorStrength > 0 ? node.anchorStrength : 0;
      let sumL = node.anchorLab ? weightSum * node.anchorLab.l : 0;
      let sumA = node.anchorLab ? weightSum * node.anchorLab.a : 0;
      let sumB = node.anchorLab ? weightSum * node.anchorLab.b : 0;
      for (const nb of adjacencyLists[i]) {
        const nbLab = nodes[nb.neighborIdx].lab;
        weightSum += nb.coupling;
        sumL += nb.coupling * nbLab.l;
        sumA += nb.coupling * nbLab.a;
        sumB += nb.coupling * nbLab.b;
      }
      if (weightSum > 1e-8) {
        const nextL = clamp(sumL / weightSum, 0.04, 0.97);
        const nextA = clamp(sumA / weightSum, -0.32, 0.32);
        const nextB = clamp(sumB / weightSum, -0.32, 0.32);
        maxStepDelta = Math.max(maxStepDelta, Math.hypot(nextL - node.lab.l, nextA - node.lab.a, nextB - node.lab.b));
        node.lab = { l: nextL, a: nextA, b: nextB };
      }
    }
    if (maxStepDelta < 1e-5) {
      convergedIterations = iter + 1;
      break;
    }
  }

  const finalEnergy = computeGraphQuadraticEnergy(nodes, coupledEdges);
  let remediatedContrastEdgeCount = 0;
  for (let pass = 0; pass < 6; pass += 1) {
    for (const edge of coupledEdges) {
      if (!edge.distinctRole) continue;
      const nodeA = nodes[edge.idxA];
      const nodeB = nodes[edge.idxB];
      if (nodeA.seedLab && nodeB.seedLab) continue;
      const currentDelta = computeDeltaEOk(oklabToSrgbGamutSafe(nodeA.lab), oklabToSrgbGamutSafe(nodeB.lab));
      if (currentDelta >= minDeltaE) continue;
      const needed = minDeltaE - currentDelta + 0.014;
      const dirSign = nodeA.lab.l >= nodeB.lab.l ? 1 : -1;
      if (nodeA.seedLab && !nodeB.seedLab) {
        const push = nodeB.lab.l >= nodeA.lab.l ? needed : -needed;
        const shifted = clamp(nodeB.lab.l + push, 0.05, 0.96);
        nodeB.lab = { l: shifted === nodeB.lab.l ? clamp(nodeB.lab.l - push, 0.05, 0.96) : shifted, a: nodeB.lab.a, b: nodeB.lab.b };
      } else if (!nodeA.seedLab && nodeB.seedLab) {
        const push = nodeA.lab.l >= nodeB.lab.l ? needed : -needed;
        const shifted = clamp(nodeA.lab.l + push, 0.05, 0.96);
        nodeA.lab = { l: shifted === nodeA.lab.l ? clamp(nodeA.lab.l - push, 0.05, 0.96) : shifted, a: nodeA.lab.a, b: nodeA.lab.b };
      } else {
        const half = needed * 0.55;
        nodeA.lab = { l: clamp(nodeA.lab.l + dirSign * half, 0.05, 0.96), a: nodeA.lab.a, b: nodeA.lab.b };
        nodeB.lab = { l: clamp(nodeB.lab.l - dirSign * half, 0.05, 0.96), a: nodeB.lab.a, b: nodeB.lab.b };
      }
      remediatedContrastEdgeCount += 1;
    }
  }

  let minObservedDistinctAdjacentDeltaEOk = Number.POSITIVE_INFINITY;
  for (const edge of coupledEdges) {
    if (!edge.distinctRole) continue;
    const d = computeDeltaEOk(oklabToSrgbGamutSafe(nodes[edge.idxA].lab), oklabToSrgbGamutSafe(nodes[edge.idxB].lab));
    if (d < minObservedDistinctAdjacentDeltaEOk) minObservedDistinctAdjacentDeltaEOk = d;
  }
  if (!Number.isFinite(minObservedDistinctAdjacentDeltaEOk)) minObservedDistinctAdjacentDeltaEOk = minDeltaE;

  const ambientTint = computeKelvinLinearTint(input.lighting.ambientKelvin);
  const keyTint = computeKelvinLinearTint(input.lighting.keyKelvin);
  const rimTint = computeKelvinLinearTint(input.lighting.rimKelvin);
  const keyDir = computeDir3(input.lighting.keyAzimuthDeg, input.lighting.keyElevationDeg);
  const ambStrength = clamp(input.lighting.ambientIntensity ?? 0.35, 0.05, 1);
  const keyStrength = clamp(input.lighting.keyIntensity ?? 0.45, 0.05, 1);
  const rimStrength = clamp(input.lighting.rimIntensity ?? 0.5, 0.05, 1);

  const regions: SmartColoredRegionResult[] = nodes.map((node) => {
    const flatBaseSrgb = node.seedLab && node.region.seedColorSrgb ? node.region.seedColorSrgb : oklabToSrgbGamutSafe(node.lab);
    const flatBaseOklch = computeOklchFromSrgb(flatBaseSrgb);
    const normal = computeDir3(node.region.normalAzimuthDeg ?? input.lighting.keyAzimuthDeg, node.region.normalElevationDeg ?? 45);
    const nDotL = clamp(normal.x * keyDir.x + normal.y * keyDir.y + normal.z * keyDir.z, -1, 1);
    const roughness = clamp(node.region.material.roughness, 0, 1);
    const metallic = clamp(node.region.material.metallic, 0, 1);
    const sss = clamp(node.region.material.subsurfaceScatter ?? (node.region.material.category === "skin" ? 0.65 : 0.1), 0, 1);
    const baseR = srgbChannelToLinear(flatBaseSrgb.r);
    const baseG = srgbChannelToLinear(flatBaseSrgb.g);
    const baseB = srgbChannelToLinear(flatBaseSrgb.b);

    const shadowScale = clamp(0.56 + 0.18 * sss - 0.12 * metallic, 0.3, 0.85);
    const ambientShadowSrgb: Srgb8Color = {
      r: linearToSrgbChannel(baseR * shadowScale * (1 - ambStrength + ambStrength * ambientTint.r) + 0.018 * sss),
      g: linearToSrgbChannel(baseG * shadowScale * (1 - ambStrength + ambStrength * ambientTint.g)),
      b: linearToSrgbChannel(baseB * shadowScale * (1 - ambStrength + ambStrength * ambientTint.b)),
    };
    const specBoost = (1 - roughness) * (0.08 + 0.22 * metallic) * Math.max(0, nDotL);
    const litGain = 1 + keyStrength * 0.28 * Math.max(0.15, nDotL);
    let keyLitSrgb: Srgb8Color = {
      r: linearToSrgbChannel(baseR * litGain * (1 - keyStrength * 0.5 + keyStrength * 0.5 * keyTint.r) + specBoost * keyTint.r),
      g: linearToSrgbChannel(baseG * litGain * (1 - keyStrength * 0.5 + keyStrength * 0.5 * keyTint.g) + specBoost * keyTint.g),
      b: linearToSrgbChannel(baseB * litGain * (1 - keyStrength * 0.5 + keyStrength * 0.5 * keyTint.b) + specBoost * keyTint.b),
    };
    let skinHueDriftDeg = 0;
    if (node.region.material.category === "skin") {
      const guarded = clampSkinLitHue(flatBaseOklch, keyLitSrgb);
      keyLitSrgb = guarded.srgb;
      skinHueDriftDeg = guarded.driftDeg;
    }
    const fresnel = rimStrength * (0.14 + 0.20 * (1 - roughness) + 0.12 * metallic);
    const rimHighlightSrgb: Srgb8Color = {
      r: linearToSrgbChannel(baseR * 1.08 + fresnel * rimTint.r),
      g: linearToSrgbChannel(baseG * 1.08 + fresnel * rimTint.g),
      b: linearToSrgbChannel(baseB * 1.08 + fresnel * rimTint.b),
    };
    return {
      regionId: node.region.regionId, category: node.region.material.category,
      matchedAnchorId: node.anchor?.anchorId ?? null, flatBaseSrgb, flatBaseOklch,
      ambientShadowSrgb, keyLitSrgb, rimHighlightSrgb, seedLocked: node.seedLab !== null, skinHueDriftDeg,
    };
  });

  return { regions, initialEnergy, finalEnergy, convergedIterations, minObservedDistinctAdjacentDeltaEOk, remediatedContrastEdgeCount };
}
