/**
 * 제로-토큰(0 AI Token) 로컬 작가 화풍 프로파일러.
 *
 * 작가의 과거 원고 RGBA 타일을 온디바이스에서 분석해 선 굵기 비율(망점·대면적 먹칠 분리),
 * OKLCH 대표 팔레트 하모니, 명암 대비 커브, 스크린톤 밀도를 추출하고
 * 컷별 재사용 브러시·조명·톤 프리셋을 토큰 비용 0원으로 생성한다.
 */

export type PaletteHarmonyKind =
  | "monochrome"
  | "analogous"
  | "complementary"
  | "triadic"
  | "split-complementary";

export type LightingMoodKind =
  | "high-key"
  | "balanced-editorial"
  | "dramatic-chiaroscuro"
  | "noir-ink";

export type LineStyleKind = "delicate-pen" | "balanced-webtoon" | "bold-ink";
export type StyleCutContext = "dialogue" | "action" | "establishing" | "emotional-closeup";

export interface OklchSwatch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly weight: number;
  readonly oklchCss: string;
}

export interface ContrastCurveProfile {
  readonly histogram16: readonly number[];
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly shadowRatio: number;
  readonly midtoneRatio: number;
  readonly highlightRatio: number;
  readonly dynamicContrast: number;
  readonly gammaEstimate: number;
  readonly mood: LightingMoodKind;
}

export interface ArtistStyleProfile {
  readonly analyzedTiles: number;
  readonly analyzedPixels: number;
  readonly tokenCost: 0;
  readonly lineWeightRatio: number;
  readonly estimatedStrokeWidthPx: number;
  readonly inkCoverageRatio: number;
  readonly edgeDensity: number;
  readonly lineStyle: LineStyleKind;
  readonly paletteHarmony: PaletteHarmonyKind;
  readonly dominantOklch: readonly OklchSwatch[];
  readonly averageChroma: number;
  readonly warmHueBias: number;
  readonly contrastCurve: ContrastCurveProfile;
  readonly screentoneDensity: number;
  readonly estimatedScreentoneLpi: number;
}

export interface ArtistBrushPreset {
  readonly baseSizePx: number;
  readonly pressureSensitivity: number;
  readonly inkHardness: number;
  readonly stabilizerStrength: number;
  readonly taperRatio: number;
  readonly lineStyle: LineStyleKind;
  readonly summaryKo: string;
}

export interface ArtistLightingPreset {
  readonly keyAzimuthDeg: number;
  readonly keyElevationDeg: number;
  readonly ambientFill: number;
  readonly shadowHardness: number;
  readonly rimIntensity: number;
  readonly mood: LightingMoodKind;
  readonly summaryKo: string;
}

export interface ArtistTonePreset {
  readonly screentoneLpi: number;
  readonly screentoneDotGain: number;
  readonly halftoneDensity: number;
  readonly shadowThreshold: number;
  readonly highlightRollOff: number;
  readonly paletteHarmony: PaletteHarmonyKind;
  readonly dominantOklch: readonly OklchSwatch[];
}

export interface EmittedCutStylePreset {
  readonly cutContext: StyleCutContext;
  readonly tokenCost: 0;
  readonly brushPreset: ArtistBrushPreset;
  readonly lightingPreset: ArtistLightingPreset;
  readonly tonePreset: ArtistTonePreset;
  readonly profile: ArtistStyleProfile;
}

interface OklabSample {
  readonly l: number;
  readonly a: number;
  readonly b: number;
  readonly weight: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function srgbByteToLinear(byteVal: number): number {
  const s = byteVal / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** sRGB(0..255)를 Björn Ottosson Oklab/OKLCH 색공간으로 변환한다. */
export function srgbToOklch(rByte: number, gByte: number, bByte: number): {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly a: number;
  readonly b: number;
} {
  const r = srgbByteToLinear(rByte);
  const g = srgbByteToLinear(gByte);
  const b = srgbByteToLinear(bByte);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = clamp(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 0, 1);
  const oa = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const ob = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(oa, ob);
  const rawHue = (Math.atan2(ob, oa) * 180) / Math.PI;
  return { l: L, c: C, h: rawHue < 0 ? rawHue + 360 : rawHue, a: oa, b: ob };
}

function formatOklchCss(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

function shortestHueDistDeg(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function classifyPaletteHarmony(swatches: readonly OklchSwatch[]): PaletteHarmonyKind {
  const chromatic = swatches.filter((s) => s.c >= 0.045 && s.weight >= 0.05);
  if (chromatic.length <= 1) return "monochrome";

  let maxSpan = 0;
  let hasComplement = false;
  let hasTriadicSpread = false;
  for (let i = 0; i < chromatic.length; i += 1) {
    for (let j = i + 1; j < chromatic.length; j += 1) {
      const dist = shortestHueDistDeg(chromatic[i].h, chromatic[j].h);
      if (dist > maxSpan) maxSpan = dist;
      if (dist >= 145 && dist <= 180) hasComplement = true;
      if (dist >= 95 && dist <= 144) hasTriadicSpread = true;
    }
  }
  if (maxSpan <= 18) return "monochrome";
  if (maxSpan <= 58) return "analogous";
  if (chromatic.length >= 3 && hasTriadicSpread && !hasComplement) return "triadic";
  if (hasComplement) return chromatic.length >= 3 ? "split-complementary" : "complementary";
  return "split-complementary";
}

function clusterOklabSamples(samples: readonly OklabSample[], k: number): readonly OklchSwatch[] {
  if (samples.length === 0) {
    return [{ l: 0.96, c: 0.008, h: 90, weight: 1, oklchCss: formatOklchCss(0.96, 0.008, 90) }];
  }
  const sorted = [...samples].sort((x, y) => y.weight - x.weight);
  const count = Math.min(k, sorted.length);
  const centroids: Array<{ l: number; a: number; b: number }> = [
    { l: sorted[0].l, a: sorted[0].a, b: sorted[0].b },
  ];

  while (centroids.length < count) {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < sorted.length; i += 1) {
      const s = sorted[i];
      let minDistSq = Infinity;
      for (let c = 0; c < centroids.length; c += 1) {
        const dl = s.l - centroids[c].l;
        const da = s.a - centroids[c].a;
        const db = s.b - centroids[c].b;
        const dSq = dl * dl + da * da + db * db;
        if (dSq < minDistSq) minDistSq = dSq;
      }
      const score = minDistSq * Math.sqrt(s.weight);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    centroids.push({ l: sorted[bestIdx].l, a: sorted[bestIdx].a, b: sorted[bestIdx].b });
  }

  const weights = new Float64Array(count);
  const sumL = new Float64Array(count);
  const sumA = new Float64Array(count);
  const sumB = new Float64Array(count);

  for (let iter = 0; iter < 5; iter += 1) {
    weights.fill(0);
    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      let nearest = 0;
      let nearestDist = Infinity;
      for (let c = 0; c < count; c += 1) {
        const dl = s.l - centroids[c].l;
        const da = s.a - centroids[c].a;
        const db = s.b - centroids[c].b;
        const dSq = dl * dl + da * da + db * db;
        if (dSq < nearestDist) {
          nearestDist = dSq;
          nearest = c;
        }
      }
      weights[nearest] += s.weight;
      sumL[nearest] += s.l * s.weight;
      sumA[nearest] += s.a * s.weight;
      sumB[nearest] += s.b * s.weight;
    }
    for (let c = 0; c < count; c += 1) {
      if (weights[c] > 0) {
        centroids[c] = { l: sumL[c] / weights[c], a: sumA[c] / weights[c], b: sumB[c] / weights[c] };
      }
    }
  }

  let totalWeight = 0;
  for (let c = 0; c < count; c += 1) totalWeight += weights[c];
  if (totalWeight <= 0) totalWeight = 1;

  const swatches: OklchSwatch[] = [];
  for (let c = 0; c < count; c += 1) {
    if (weights[c] <= 0) continue;
    const { l, a, b } = centroids[c];
    const chroma = Math.hypot(a, b);
    const rawH = (Math.atan2(b, a) * 180) / Math.PI;
    const h = chroma < 1e-4 ? 0 : rawH < 0 ? rawH + 360 : rawH;
    swatches.push({ l, c: chroma, h, weight: weights[c] / totalWeight, oklchCss: formatOklchCss(l, chroma, h) });
  }
  swatches.sort((x, y) => y.weight - x.weight);
  return swatches;
}

/** 제로-토큰(0 AI Token) 로컬 화풍 프로파일러. */
export class ArtistStyleProfiler {
  private tileCount = 0;
  private totalPixels = 0;
  private darkInkPixels = 0;
  private edgePixels = 0;
  private strokeWidthSum = 0;
  private strokeSamples = 0;
  private screentoneBlockSum = 0;
  private screentoneBlocks = 0;
  private readonly lumaBins = new Float64Array(16);
  private readonly oklabBins = new Map<number, { l: number; a: number; b: number; w: number }>();

  public reset(): void {
    this.tileCount = 0;
    this.totalPixels = 0;
    this.darkInkPixels = 0;
    this.edgePixels = 0;
    this.strokeWidthSum = 0;
    this.strokeSamples = 0;
    this.screentoneBlockSum = 0;
    this.screentoneBlocks = 0;
    this.lumaBins.fill(0);
    this.oklabBins.clear();
  }

  /** 과거 원고 RGBA 타일 1장을 로컬에서 분석해 누적 프로파일에 반영한다. */
  public addManuscriptTile(
    rgba: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
  ): void {
    if (width < 4 || height < 4 || rgba.length !== width * height * 4) {
      throw new Error("화풍 분석 타일의 크기 또는 RGBA 버퍼 길이가 유효하지 않습니다.");
    }
    const pixelCount = width * height;
    const luma = new Float32Array(pixelCount);
    const isInk = new Uint8Array(pixelCount);

    for (let i = 0; i < pixelCount; i += 1) {
      const off = i * 4;
      if (rgba[off + 3] < 16) {
        luma[i] = 1.0;
        continue;
      }
      const r = rgba[off];
      const g = rgba[off + 1];
      const b = rgba[off + 2];
      const y = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      luma[i] = y;
      this.totalPixels += 1;
      this.lumaBins[clamp(Math.floor(y * 16), 0, 15)] += 1;
      if (y < 0.24) {
        isInk[i] = 1;
        this.darkInkPixels += 1;
      }
      if ((i & 1) === 0) {
        const oklch = srgbToOklch(r, g, b);
        const key =
          (clamp(Math.round(oklch.l * 10), 0, 10) << 10) |
          (clamp(Math.round((oklch.a + 0.4) * 20), 0, 16) << 5) |
          clamp(Math.round((oklch.b + 0.4) * 20), 0, 16);
        const w = oklch.c >= 0.045 ? 2.5 : 0.6;
        const existing = this.oklabBins.get(key);
        if (existing) {
          existing.l += oklch.l * w;
          existing.a += oklch.a * w;
          existing.b += oklch.b * w;
          existing.w += w;
        } else {
          this.oklabBins.set(key, { l: oklch.l * w, a: oklch.a * w, b: oklch.b * w, w });
        }
      }
    }

    // 1. Sobel 에지 밀도
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const r0 = (y - 1) * width + x;
        const r1 = y * width + x;
        const r2 = (y + 1) * width + x;
        const gx = -luma[r0 - 1] + luma[r0 + 1] - 2 * luma[r1 - 1] + 2 * luma[r1 + 1] - luma[r2 - 1] + luma[r2 + 1];
        const gy = -luma[r0 - 1] - 2 * luma[r0] - luma[r0 + 1] + luma[r2 - 1] + 2 * luma[r2] + luma[r2 + 1];
        if (Math.abs(gx) + Math.abs(gy) >= 0.42) this.edgePixels += 1;
      }
    }

    // 2. 선 굵기 추정: 연장된 선화(maxRun >= 4, minRun <= 20)만 채택해 1~2px 망점과 대면적 먹칠을 분리
    const maxStrokeRun = 20;
    const hRuns = new Uint16Array(pixelCount);
    for (let y = 0; y < height; y += 1) {
      let x = 0;
      while (x < width) {
        if (isInk[y * width + x] === 0) { x += 1; continue; }
        let end = x + 1;
        while (end < width && isInk[y * width + end] === 1) end += 1;
        for (let k = x; k < end; k += 1) hRuns[y * width + k] = end - x;
        x = end;
      }
    }
    for (let x = 0; x < width; x += 1) {
      let y = 0;
      while (y < height) {
        if (isInk[y * width + x] === 0) { y += 1; continue; }
        let end = y + 1;
        while (end < height && isInk[end * width + x] === 1) end += 1;
        const vRun = end - y;
        for (let k = y; k < end; k += 1) {
          const hRun = hRuns[k * width + x];
          const minRun = Math.min(hRun, vRun);
          const maxRun = Math.max(hRun, vRun);
          if (minRun >= 1 && minRun <= maxStrokeRun && maxRun >= 4) {
            this.strokeWidthSum += minRun;
            this.strokeSamples += 1;
          }
        }
        y = end;
      }
    }

    // 3. 스크린톤/하프톤 밀도: 4x4 블록 내 주기적 부호 반전 + 고주파 교번 대비 측정
    const blocksX = Math.floor(width / 4);
    const blocksY = Math.floor(height / 4);
    for (let by = 0; by < blocksY; by += 1) {
      for (let bx = 0; bx < blocksX; bx += 1) {
        let signChanges = 0;
        let altContrast = 0;
        let pairs = 0;
        for (let ly = 0; ly < 4; ly += 1) {
          const py = by * 4 + ly;
          let prevDiff = 0;
          for (let lx = 0; lx < 3; lx += 1) {
            const diff = luma[py * width + (bx * 4 + lx + 1)] - luma[py * width + (bx * 4 + lx)];
            const absD = Math.abs(diff);
            altContrast += absD;
            pairs += 1;
            if (Math.abs(prevDiff) >= 0.08 && absD >= 0.08 && prevDiff * diff < 0) signChanges += 1;
            if (absD >= 0.08) prevDiff = diff;
          }
        }
        for (let lx = 0; lx < 4; lx += 1) {
          const px = bx * 4 + lx;
          let prevDiff = 0;
          for (let ly = 0; ly < 3; ly += 1) {
            const diff = luma[(by * 4 + ly + 1) * width + px] - luma[(by * 4 + ly) * width + px];
            const absD = Math.abs(diff);
            altContrast += absD;
            pairs += 1;
            if (Math.abs(prevDiff) >= 0.08 && absD >= 0.08 && prevDiff * diff < 0) signChanges += 1;
            if (absD >= 0.08) prevDiff = diff;
          }
        }
        const meanAlt = pairs > 0 ? altContrast / pairs : 0;
        this.screentoneBlockSum += signChanges >= 4 && meanAlt >= 0.12 ? clamp(meanAlt * 1.4, 0, 1) : 0;
        this.screentoneBlocks += 1;
      }
    }
    this.tileCount += 1;
  }

  /** 누적 분석 결과를 바탕으로 정량 화풍 프로파일을 산출한다. */
  public buildProfile(): ArtistStyleProfile {
    if (this.tileCount === 0 || this.totalPixels === 0) {
      throw new Error("화풍 프로파일을 생성하려면 최소 1개 이상의 원고 타일을 분석해야 합니다.");
    }
    const histogram16: number[] = [];
    for (let i = 0; i < 16; i += 1) histogram16.push(this.lumaBins[i] / this.totalPixels);

    const percentile = (target: number): number => {
      let acc = 0;
      for (let i = 0; i < 16; i += 1) {
        const next = acc + histogram16[i];
        if (next >= target) {
          return clamp((i + (histogram16[i] > 0 ? (target - acc) / histogram16[i] : 0)) / 16, 0, 1);
        }
        acc = next;
      }
      return 1;
    };

    const p10 = percentile(0.1);
    const p50 = percentile(0.5);
    const p90 = percentile(0.9);
    const shadowRatio = histogram16[0] + histogram16[1] + histogram16[2] + histogram16[3];
    const highlightRatio = histogram16[12] + histogram16[13] + histogram16[14] + histogram16[15];
    const midtoneRatio = clamp(1 - shadowRatio - highlightRatio, 0, 1);
    const dynamicContrast = clamp(p90 - p10, 0, 1);
    const gammaEstimate = clamp(Math.log(clamp(p50, 0.05, 0.95)) / Math.log(0.5), 0.35, 3.2);

    let mood: LightingMoodKind = "balanced-editorial";
    if (shadowRatio >= 0.45 && p50 <= 0.36) mood = "noir-ink";
    else if (dynamicContrast >= 0.62 && shadowRatio >= 0.22) mood = "dramatic-chiaroscuro";
    else if (highlightRatio >= 0.45 && p50 >= 0.62) mood = "high-key";

    const samples: OklabSample[] = [];
    this.oklabBins.forEach((v) => {
      if (v.w > 0) samples.push({ l: v.l / v.w, a: v.a / v.w, b: v.b / v.w, weight: v.w });
    });
    const dominantOklch = clusterOklabSamples(samples, 4);
    const paletteHarmony = classifyPaletteHarmony(dominantOklch);

    let avgChroma = 0;
    let warmWeight = 0;
    let chromaWeight = 0;
    for (const sw of dominantOklch) {
      avgChroma += sw.c * sw.weight;
      if (sw.c >= 0.03) {
        chromaWeight += sw.weight;
        warmWeight += (sw.h <= 115 || sw.h >= 315 ? 1 : -1) * sw.weight;
      }
    }

    const estimatedStrokeWidthPx =
      this.strokeSamples > 0 ? clamp(this.strokeWidthSum / this.strokeSamples, 0.8, 16) : 2.0;
    const lineStyle: LineStyleKind =
      estimatedStrokeWidthPx <= 2.4
        ? "delicate-pen"
        : estimatedStrokeWidthPx >= 4.4
          ? "bold-ink"
          : "balanced-webtoon";
    const screentoneDensity =
      this.screentoneBlocks > 0 ? clamp(this.screentoneBlockSum / this.screentoneBlocks, 0, 1) : 0;

    return {
      analyzedTiles: this.tileCount,
      analyzedPixels: this.totalPixels,
      tokenCost: 0,
      lineWeightRatio: clamp(estimatedStrokeWidthPx / 10.0, 0.08, 1.0),
      estimatedStrokeWidthPx,
      inkCoverageRatio: this.darkInkPixels / this.totalPixels,
      edgeDensity: this.edgePixels / this.totalPixels,
      lineStyle,
      paletteHarmony,
      dominantOklch,
      averageChroma: avgChroma,
      warmHueBias: chromaWeight > 0 ? clamp(warmWeight / chromaWeight, -1, 1) : 0,
      contrastCurve: {
        histogram16, p10, p50, p90, shadowRatio, midtoneRatio, highlightRatio,
        dynamicContrast, gammaEstimate, mood,
      },
      screentoneDensity,
      estimatedScreentoneLpi: screentoneDensity >= 0.08 ? Math.round(45 + screentoneDensity * 40) : 0,
    };
  }

  /** 분석된 화풍을 기반으로 컷 상황에 맞는 브러시·조명·스크린톤 프리셋을 즉시 발행한다. */
  public emitStylePreset(cutContext: StyleCutContext = "dialogue"): EmittedCutStylePreset {
    const profile = this.buildProfile();
    const actionBoost = cutContext === "action" ? 1.2 : cutContext === "emotional-closeup" ? 0.88 : 1.0;
    const mood = profile.contrastCurve.mood;

    return {
      cutContext,
      tokenCost: 0,
      brushPreset: {
        baseSizePx: Number((profile.estimatedStrokeWidthPx * actionBoost).toFixed(2)),
        pressureSensitivity: profile.lineStyle === "bold-ink" ? 0.86 : profile.lineStyle === "delicate-pen" ? 0.62 : 0.74,
        inkHardness: mood === "noir-ink" ? 0.96 : 0.88,
        stabilizerStrength: profile.lineStyle === "delicate-pen" ? 0.72 : 0.48,
        taperRatio: cutContext === "action" ? 0.82 : 0.58,
        lineStyle: profile.lineStyle,
        summaryKo:
          profile.lineStyle === "bold-ink"
            ? "굵고 강약 대비가 선명한 G펜·먹선 프리셋"
            : profile.lineStyle === "delicate-pen"
              ? "세밀한 윤곽과 정교한 펜터치용 극세선 프리셋"
              : "연재 원고 균형형 표준 웹툰 펜선 프리셋",
      },
      lightingPreset: {
        keyAzimuthDeg: cutContext === "action" ? 132 : mood === "noir-ink" ? 115 : 42,
        keyElevationDeg: mood === "dramatic-chiaroscuro" || mood === "noir-ink" ? 26 : 52,
        ambientFill: mood === "high-key" ? 0.68 : mood === "noir-ink" ? 0.14 : 0.36,
        shadowHardness: mood === "noir-ink" ? 0.92 : mood === "high-key" ? 0.35 : 0.65,
        rimIntensity: cutContext === "emotional-closeup" || mood === "dramatic-chiaroscuro" ? 0.78 : 0.35,
        mood,
        summaryKo:
          mood === "noir-ink"
            ? "짙은 먹그림자와 강한 단면 대비 중심의 느와르 조명"
            : mood === "high-key"
              ? "밝은 하이라이트와 부드러운 채움광 위주의 하이키 조명"
              : mood === "dramatic-chiaroscuro"
                ? "역광 림라이트와 깊은 명암비를 살린 드라마틱 조명"
                : "인물과 배경 가독성을 고르게 유지하는 표준 편집 조명",
      },
      tonePreset: {
        screentoneLpi: profile.estimatedScreentoneLpi > 0 ? profile.estimatedScreentoneLpi : 60,
        screentoneDotGain: Number((0.12 + profile.screentoneDensity * 0.25).toFixed(3)),
        halftoneDensity: Number(profile.screentoneDensity.toFixed(3)),
        shadowThreshold: Number(clamp(profile.contrastCurve.p10 + 0.18, 0.12, 0.55).toFixed(3)),
        highlightRollOff: Number(clamp(profile.contrastCurve.p90, 0.7, 0.98).toFixed(3)),
        paletteHarmony: profile.paletteHarmony,
        dominantOklch: profile.dominantOklch,
      },
      profile,
    };
  }
}
