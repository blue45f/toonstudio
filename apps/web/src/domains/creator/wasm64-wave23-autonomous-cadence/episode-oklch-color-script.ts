/**
 * Wasm64 Wave 23: 60~80컷 회차 OKLCH 컬러 스크립트 바코드 & 감정선 보존 화이트밸런스 조화기.
 *
 * - 한 회차(60~80컷) 전체를 지배색·강조색 OKLCH, 명암 대비, 지각 온기 곡선으로 압축한다.
 * - 회상(`flashback`)·절정(`climax`)·장면 전환 경계는 온전히 지킨 채, 같은 씬 비트 안에서
 *   실수로 튄 단일 컷 화이트밸런스 이탈만 강건 중앙값 기준으로 부드럽게 바로잡는다.
 */

/** 0..255 채널 기준 sRGB 색상 */
export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly hDeg: number;
}

export type NarrativeBeatTag = "normal" | "flashback" | "climax" | "dream" | "prologue";

export interface CutSwatchSample {
  readonly srgb: SrgbColor;
  readonly weight: number;
}

export interface EpisodeCutInput {
  readonly cutNumber: number;
  readonly cutId: string;
  readonly sceneBeatId: string;
  readonly narrativeTag?: NarrativeBeatTag;
  readonly swatches: readonly CutSwatchSample[];
}

export interface ColorScriptBarcodeCell {
  readonly cutNumber: number;
  readonly cutId: string;
  readonly sceneBeatId: string;
  readonly narrativeTag: NarrativeBeatTag;
  readonly dominantOklch: OklchColor;
  readonly accentOklch: OklchColor;
  readonly dominantSrgb: SrgbColor;
  readonly accentSrgb: SrgbColor;
  readonly meanOklab: OklabColor;
  readonly luminanceContrast: number;
  readonly warmth: number;
}

export interface EmotionalArcPhaseSummary {
  readonly phaseKey: "opening" | "rising" | "climax" | "resolution";
  readonly labelKo: string;
  readonly startCutNumber: number;
  readonly endCutNumber: number;
  readonly meanLightness: number;
  readonly meanChroma: number;
  readonly meanWarmth: number;
  readonly meanContrast: number;
}

export interface WhiteBalanceOutlierFinding {
  readonly cutNumber: number;
  readonly cutId: string;
  readonly sceneBeatId: string;
  readonly chromaticityShift: number;
  readonly warmthDelta: number;
  readonly lightnessDelta: number;
  readonly directionKo: string;
}

export interface PreservedIntentionalTransition {
  readonly fromCutNumber: number;
  readonly toCutNumber: number;
  readonly fromBeatId: string;
  readonly toBeatId: string;
  readonly toNarrativeTag: NarrativeBeatTag;
  readonly perceptualJump: number;
}

export interface EpisodeColorScriptOptions {
  readonly outlierChromaticityThreshold?: number;
  readonly transitionJumpThreshold?: number;
  readonly harmonizeBlend?: number;
  readonly intraBeatSmoothing?: number;
}

export interface EpisodeColorScriptHarmonizeResult {
  readonly originalCells: readonly ColorScriptBarcodeCell[];
  readonly harmonizedCells: readonly ColorScriptBarcodeCell[];
  readonly warmthCurve: readonly number[];
  readonly harmonizedWarmthCurve: readonly number[];
  readonly luminanceContrastCurve: readonly number[];
  readonly emotionalArcPhases: readonly EmotionalArcPhaseSummary[];
  readonly detectedOutliers: readonly WhiteBalanceOutlierFinding[];
  readonly preservedTransitions: readonly PreservedIntentionalTransition[];
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function srgbChannelToLinear(channel255: number): number {
  const u = clamp(channel255 / 255, 0, 1);
  return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

function linearToSrgbChannel255(linear: number): number {
  const u = clamp(linear, 0, 1);
  const encoded = u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
  return Math.round(clamp(encoded * 255, 0, 255));
}

export function srgbToOklab(srgb: SrgbColor): OklabColor {
  const lr = srgbChannelToLinear(srgb.r);
  const lg = srgbChannelToLinear(srgb.g);
  const lb = srgbChannelToLinear(srgb.b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearRgbRaw(lab: OklabColor): { lr: number; lg: number; lb: number } {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    lr: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    lg: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    lb: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function oklabToOklch(lab: OklabColor): OklchColor {
  const c = Math.hypot(lab.a, lab.b);
  const hDeg = c > 1e-5 ? ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360 : 0;
  return { l: clamp(lab.l, 0, 1), c, hDeg };
}

export function oklchToOklab(lch: OklchColor): OklabColor {
  const rad = (lch.hDeg * Math.PI) / 180;
  return { l: clamp(lch.l, 0, 1), a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad) };
}

export function srgbToOklch(srgb: SrgbColor): OklchColor {
  return oklabToOklch(srgbToOklab(srgb));
}

/** 채도 이진 가멋 매핑으로 색상각 틀어짐 없이 OKLCH를 8비트 sRGB로 변환한다. */
export function oklchToSrgb(lch: OklchColor): SrgbColor {
  const targetL = clamp(lch.l, 0, 1);
  if (targetL <= 1e-5) return { r: 0, g: 0, b: 0 };
  if (targetL >= 1 - 1e-5 && lch.c < 1e-4) return { r: 255, g: 255, b: 255 };

  const inGamut = (cTest: number): boolean => {
    const raw = oklabToLinearRgbRaw(oklchToOklab({ l: targetL, c: cTest, hDeg: lch.hDeg }));
    return (
      raw.lr >= -1e-4 && raw.lr <= 1.0001 &&
      raw.lg >= -1e-4 && raw.lg <= 1.0001 &&
      raw.lb >= -1e-4 && raw.lb <= 1.0001
    );
  };

  let fittedChroma = Math.max(0, lch.c);
  if (!inGamut(fittedChroma)) {
    let lo = 0;
    let hi = fittedChroma;
    for (let step = 0; step < 12; step++) {
      const mid = 0.5 * (lo + hi);
      if (inGamut(mid)) lo = mid;
      else hi = mid;
    }
    fittedChroma = lo;
  }

  const raw = oklabToLinearRgbRaw(oklchToOklab({ l: targetL, c: fittedChroma, hDeg: lch.hDeg }));
  return {
    r: linearToSrgbChannel255(raw.lr),
    g: linearToSrgbChannel255(raw.lg),
    b: linearToSrgbChannel255(raw.lb),
  };
}

/** Oklab 색도 평면의 난색 축 투영으로 지각 온기 지수(`-1..1`)를 계산한다. */
export function computePerceptualWarmth(lab: OklabColor): number {
  const warmAxisProj = 0.5735764363 * lab.a + 0.8191520443 * lab.b;
  return Math.tanh(warmAxisProj * 5.2);
}

function oklabDistance(p: OklabColor, q: OklabColor): number {
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : 0.5 * (sorted[mid - 1]! + sorted[mid]!);
}

function summarizeSingleCutCell(cut: EpisodeCutInput): ColorScriptBarcodeCell {
  const tag: NarrativeBeatTag = cut.narrativeTag ?? "normal";
  const swatches =
    cut.swatches.length > 0 ? cut.swatches : [{ srgb: { r: 128, g: 128, b: 128 }, weight: 1 }];

  let totalWeight = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let minL = 1;
  let maxL = 0;
  let dominantIdx = 0;
  let dominantWeight = -1;

  const labs: OklabColor[] = [];
  for (let i = 0; i < swatches.length; i++) {
    const sw = swatches[i]!;
    const w = Math.max(1e-4, sw.weight);
    const lab = srgbToOklab(sw.srgb);
    labs.push(lab);
    totalWeight += w;
    sumL += w * lab.l;
    sumA += w * lab.a;
    sumB += w * lab.b;
    if (lab.l < minL) minL = lab.l;
    if (lab.l > maxL) maxL = lab.l;
    if (w > dominantWeight) {
      dominantWeight = w;
      dominantIdx = i;
    }
  }

  const domLab = labs[dominantIdx]!;
  let accentIdx = dominantIdx;
  let bestAccentScore = -1;
  for (let i = 0; i < labs.length; i++) {
    const lab = labs[i]!;
    const score = oklabDistance(domLab, lab) * (0.55 + Math.hypot(lab.a, lab.b) * 2.2);
    if (score > bestAccentScore) {
      bestAccentScore = score;
      accentIdx = i;
    }
  }

  const meanOklab: OklabColor = { l: sumL / totalWeight, a: sumA / totalWeight, b: sumB / totalWeight };
  const dominantOklch = oklabToOklch(domLab);
  const accentOklch = oklabToOklch(labs[accentIdx]!);

  return {
    cutNumber: cut.cutNumber,
    cutId: cut.cutId,
    sceneBeatId: cut.sceneBeatId,
    narrativeTag: tag,
    dominantOklch,
    accentOklch,
    dominantSrgb: oklchToSrgb(dominantOklch),
    accentSrgb: oklchToSrgb(accentOklch),
    meanOklab,
    luminanceContrast: clamp(maxL - minL, 0, 1),
    warmth: computePerceptualWarmth(meanOklab),
  };
}

function shiftCellWhiteBalance(
  cell: ColorScriptBarcodeCell,
  deltaL: number,
  deltaA: number,
  deltaB: number,
): ColorScriptBarcodeCell {
  const shiftLch = (lch: OklchColor, lScale: number): OklchColor => {
    const lab = oklchToOklab(lch);
    return oklabToOklch({ l: clamp(lab.l + deltaL * lScale, 0.02, 0.98), a: lab.a + deltaA, b: lab.b + deltaB });
  };
  const shiftedMean: OklabColor = {
    l: clamp(cell.meanOklab.l + deltaL, 0.02, 0.98),
    a: cell.meanOklab.a + deltaA,
    b: cell.meanOklab.b + deltaB,
  };
  const nextDom = shiftLch(cell.dominantOklch, 1);
  const nextAcc = shiftLch(cell.accentOklch, 0.65);

  return {
    ...cell,
    dominantOklch: nextDom,
    accentOklch: nextAcc,
    dominantSrgb: oklchToSrgb(nextDom),
    accentSrgb: oklchToSrgb(nextAcc),
    meanOklab: shiftedMean,
    warmth: computePerceptualWarmth(shiftedMean),
  };
}

function buildArcPhaseSummaries(
  cells: readonly ColorScriptBarcodeCell[],
): readonly EmotionalArcPhaseSummary[] {
  if (cells.length === 0) return [];
  const specs: readonly { key: EmotionalArcPhaseSummary["phaseKey"]; labelKo: string }[] = [
    { key: "opening", labelKo: "도입부 분위기 설정" },
    { key: "rising", labelKo: "전개부 감정 고조" },
    { key: "climax", labelKo: "절정부 색채 정점" },
    { key: "resolution", labelKo: "결말부 여운 정리" },
  ];
  const total = cells.length;
  const phases: EmotionalArcPhaseSummary[] = [];

  for (let p = 0; p < specs.length; p++) {
    const startIdx = Math.floor((p * total) / 4);
    const endIdx = Math.max(startIdx + 1, Math.floor(((p + 1) * total) / 4));
    const slice = cells.slice(startIdx, endIdx);
    if (slice.length === 0) continue;

    let sumL = 0;
    let sumC = 0;
    let sumW = 0;
    let sumContrast = 0;
    for (const cell of slice) {
      sumL += cell.meanOklab.l;
      sumC += cell.dominantOklch.c;
      sumW += cell.warmth;
      sumContrast += cell.luminanceContrast;
    }
    const n = slice.length;
    phases.push({
      phaseKey: specs[p]!.key,
      labelKo: specs[p]!.labelKo,
      startCutNumber: slice[0]!.cutNumber,
      endCutNumber: slice[n - 1]!.cutNumber,
      meanLightness: sumL / n,
      meanChroma: sumC / n,
      meanWarmth: sumW / n,
      meanContrast: sumContrast / n,
    });
  }
  return phases;
}

/**
 * 60~80컷 회차를 OKLCH 컬러 스크립트 바코드로 요약하고,
 * 회상·클라이맥스 연출 전환은 온전히 지킨 채 같은 씬 비트 내 단일 컷 화이트밸런스 이탈만 조화시킨다.
 */
export function harmonizeEpisodeColorScript(
  cuts: readonly EpisodeCutInput[],
  options?: EpisodeColorScriptOptions,
): EpisodeColorScriptHarmonizeResult {
  const chromaThreshold = options?.outlierChromaticityThreshold ?? 0.042;
  const transitionThreshold = options?.transitionJumpThreshold ?? 0.075;
  const harmonizeBlend = clamp(options?.harmonizeBlend ?? 0.85, 0, 1);
  const intraBeatSmoothing = clamp(options?.intraBeatSmoothing ?? 0.14, 0, 0.45);

  const originalCells = cuts.map(summarizeSingleCutCell);
  const preservedTransitions: PreservedIntentionalTransition[] = [];

  for (let i = 1; i < originalCells.length; i++) {
    const prev = originalCells[i - 1]!;
    const curr = originalCells[i]!;
    if (prev.sceneBeatId === curr.sceneBeatId && prev.narrativeTag === curr.narrativeTag) continue;

    const jump = oklabDistance(prev.meanOklab, curr.meanOklab);
    const isDramaticTag =
      curr.narrativeTag === "flashback" || curr.narrativeTag === "climax" ||
      curr.narrativeTag === "dream" || prev.narrativeTag === "flashback" || prev.narrativeTag === "climax";
    if (jump >= transitionThreshold || isDramaticTag) {
      preservedTransitions.push({
        fromCutNumber: prev.cutNumber,
        toCutNumber: curr.cutNumber,
        fromBeatId: prev.sceneBeatId,
        toBeatId: curr.sceneBeatId,
        toNarrativeTag: curr.narrativeTag,
        perceptualJump: jump,
      });
    }
  }

  const detectedOutliers: WhiteBalanceOutlierFinding[] = [];
  const outlierIndexSet = new Set<number>();
  const harmonizedCells: ColorScriptBarcodeCell[] = [...originalCells];

  let segStart = 0;
  while (segStart < originalCells.length) {
    let segEnd = segStart + 1;
    while (
      segEnd < originalCells.length &&
      originalCells[segEnd]!.sceneBeatId === originalCells[segStart]!.sceneBeatId &&
      originalCells[segEnd]!.narrativeTag === originalCells[segStart]!.narrativeTag
    ) {
      segEnd += 1;
    }

    const segTag = originalCells[segStart]!.narrativeTag;
    const segLen = segEnd - segStart;
    const isProtected = segTag === "flashback" || segTag === "climax" || segTag === "dream";

    if (!isProtected && segLen >= 3) {
      for (let i = segStart; i < segEnd; i++) {
        const peerIndices: number[] = [];
        for (let k = Math.max(segStart, i - 2); k <= Math.min(segEnd - 1, i + 2); k++) {
          if (k !== i) peerIndices.push(k);
        }
        if (peerIndices.length < 2) continue;

        const medL = medianOf(peerIndices.map((idx) => originalCells[idx]!.meanOklab.l));
        const medA = medianOf(peerIndices.map((idx) => originalCells[idx]!.meanOklab.a));
        const medB = medianOf(peerIndices.map((idx) => originalCells[idx]!.meanOklab.b));
        const medWarmth = computePerceptualWarmth({ l: medL, a: medA, b: medB });

        let peerSpreadSum = 0;
        for (const idx of peerIndices) {
          const peerLab = originalCells[idx]!.meanOklab;
          peerSpreadSum += Math.hypot(peerLab.a - medA, peerLab.b - medB);
        }
        const peerSpread = peerSpreadSum / peerIndices.length;

        const curr = originalCells[i]!;
        const chromaShift = Math.hypot(curr.meanOklab.a - medA, curr.meanOklab.b - medB);
        const leftShift = i > segStart
          ? Math.hypot(originalCells[i - 1]!.meanOklab.a - medA, originalCells[i - 1]!.meanOklab.b - medB)
          : 0;
        const rightShift = i + 1 < segEnd
          ? Math.hypot(originalCells[i + 1]!.meanOklab.a - medA, originalCells[i + 1]!.meanOklab.b - medB)
          : 0;
        const isolatedSingleCut = leftShift < chromaThreshold * 0.7 && rightShift < chromaThreshold * 0.7;

        if (chromaShift >= chromaThreshold && chromaShift > peerSpread * 2.1 && isolatedSingleCut) {
          const warmthDelta = curr.warmth - medWarmth;
          const lightnessDelta = curr.meanOklab.l - medL;
          detectedOutliers.push({
            cutNumber: curr.cutNumber,
            cutId: curr.cutId,
            sceneBeatId: curr.sceneBeatId,
            chromaticityShift: chromaShift,
            warmthDelta,
            lightnessDelta,
            directionKo: warmthDelta >= 0 ? "난색(황·적) 화이트밸런스 튐" : "한색(청·록) 화이트밸런스 튐",
          });
          outlierIndexSet.add(i);
          harmonizedCells[i] = shiftCellWhiteBalance(
            curr,
            (medL - curr.meanOklab.l) * harmonizeBlend * 0.55,
            (medA - curr.meanOklab.a) * harmonizeBlend,
            (medB - curr.meanOklab.b) * harmonizeBlend,
          );
        }
      }

      if (intraBeatSmoothing > 0) {
        const snapshot = harmonizedCells.slice(segStart, segEnd);
        for (let offset = 0; offset < segLen; offset++) {
          const globalIdx = segStart + offset;
          if (outlierIndexSet.has(globalIdx)) continue;
          const center = snapshot[offset]!;
          const left = offset > 0 ? snapshot[offset - 1]! : center;
          const right = offset + 1 < segLen ? snapshot[offset + 1]! : center;
          const avgL = 0.5 * (left.meanOklab.l + right.meanOklab.l);
          const avgA = 0.5 * (left.meanOklab.a + right.meanOklab.a);
          const avgB = 0.5 * (left.meanOklab.b + right.meanOklab.b);
          if (Math.hypot(avgA - center.meanOklab.a, avgB - center.meanOklab.b) < chromaThreshold) {
            harmonizedCells[globalIdx] = shiftCellWhiteBalance(
              center,
              (avgL - center.meanOklab.l) * intraBeatSmoothing * 0.5,
              (avgA - center.meanOklab.a) * intraBeatSmoothing,
              (avgB - center.meanOklab.b) * intraBeatSmoothing,
            );
          }
        }
      }
    }
    segStart = segEnd;
  }

  return {
    originalCells,
    harmonizedCells,
    warmthCurve: originalCells.map((c) => c.warmth),
    harmonizedWarmthCurve: harmonizedCells.map((c) => c.warmth),
    luminanceContrastCurve: harmonizedCells.map((c) => c.luminanceContrast),
    emotionalArcPhases: buildArcPhaseSummaries(harmonizedCells),
    detectedOutliers,
    preservedTransitions,
  };
}
