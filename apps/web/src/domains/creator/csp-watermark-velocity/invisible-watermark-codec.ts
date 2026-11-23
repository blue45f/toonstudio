/**
 * Clip Studio Paint Ver. 4.0~5.0 호환 비가시 Anti-AI/스크래핑 노이즈 워터마크 코덱 & 배치 출고 계획기.
 *
 * - 결정적 PRNG(FNV-1a + Murmur3 fmix32) 기반 스프레드-스펙트럼 의사난수 시퀀스를
 *   시지각 민감도가 낮은 블루(Blue) 채널 주축과 휘도 보정(R/G 역위상) 채널에 삽입한다.
 * - 모든 강도(1..8)에서 실측 PSNR >= 38 dB의 육안 비가시성을 유지한다.
 * - 검출 시 4-이웃 공간 고역통과 잔차와 정규화 상관계수(Normalized Cross-Correlation)로
 *   원본·타인 서명을 구분한다.
 */

export interface InvisibleWatermarkOptions {
  readonly authorId: string;
  readonly workId: string;
  /** 삽입 강도 (1..8, 정수가 아니어도 범위로 클램프) */
  readonly strength: number;
  /** 결정적 시드 (기본값 2026) */
  readonly seed?: number;
}

export interface WatermarkEmbedResult {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly strength: number;
  readonly seed: number;
  readonly signatureDigest: string;
  readonly psnrDb: number;
  readonly mse: number;
  readonly modifiedPixelCount: number;
  readonly opaquePixelCount: number;
  readonly totalPixelCount: number;
  readonly modifiedRatio: number;
  readonly meanAbsBlueDelta: number;
  readonly invisiblePass: boolean;
}

export interface WatermarkDetectionResult {
  readonly expectedAuthorId: string;
  readonly expectedWorkId: string;
  readonly seed: number;
  readonly signatureDigest: string;
  /** 정규화 상관계수 (-1..1) */
  readonly normalizedCorrelation: number;
  /** 통계적 z-점수 (상관계수 * sqrt(유효 샘플 수)) */
  readonly zScore: number;
  /** 0..1 검출 신뢰도 */
  readonly confidence: number;
  /** 서명 일치 여부 */
  readonly matched: boolean;
  readonly threshold: number;
  readonly evaluatedPixelCount: number;
}

export interface BatchWatermarkCutInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly rgba?: Uint8ClampedArray;
}

export interface BatchWatermarkExportOptions extends InvisibleWatermarkOptions {
  readonly format?: "png" | "webp";
  readonly aiTrainingPolicy?: "no-ai-training-no-scraping" | "opt-out-tdm";
  readonly copyrightHolder?: string;
  readonly episodeCode?: string;
}

export interface BatchWatermarkCutPlanItem {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly title: string;
  readonly cutWorkId: string;
  readonly outputFilename: string;
  readonly width: number;
  readonly height: number;
  readonly processedWithPixels: boolean;
  readonly watermarkedRgba?: Uint8ClampedArray;
  readonly psnrDb: number | null;
  readonly modifiedPixelCount: number;
  readonly signatureDigest: string;
  readonly verifiedMatched: boolean | null;
  readonly verificationConfidence: number | null;
}

export interface BatchWatermarkRightsManifest {
  readonly schemaVersion: "toonstudio.wm.batch.v1";
  readonly authorId: string;
  readonly workId: string;
  readonly copyrightNotice: string;
  readonly aiTrainingPolicy: "no-ai-training-no-scraping" | "opt-out-tdm";
  readonly watermarkMethod: "spread-spectrum-blue-luma-v1";
  readonly strength: number;
  readonly seed: number;
  readonly format: "png" | "webp";
  readonly cutEntries: readonly {
    readonly cutId: string;
    readonly cutNumber: number;
    readonly outputFilename: string;
    readonly cutWorkId: string;
    readonly signatureDigest: string;
    readonly psnrDb: number | null;
    readonly verifiedMatched: boolean | null;
  }[];
}

export interface BatchWatermarkExportPlan {
  readonly items: readonly BatchWatermarkCutPlanItem[];
  readonly manifest: BatchWatermarkRightsManifest;
  readonly summary: {
    readonly totalCuts: number;
    readonly processedPixelCuts: number;
    readonly verifiedCuts: number;
    readonly minPsnrDb: number | null;
    readonly avgPsnrDb: number | null;
    readonly allInvisiblePass: boolean;
    readonly totalModifiedPixels: number;
  };
}

export interface DemoWatermarkCutFixture {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

const DEFAULT_SEED = 2026;
const MIN_STRENGTH = 1;
const MAX_STRENGTH = 8;
const INVISIBLE_PSNR_FLOOR_DB = 38;
const OPAQUE_ALPHA_THRESHOLD = 16;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function fnv1a32(input: string, initialHash = 0x811c9dc5): number {
  let hash = initialHash >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function deriveWatermarkKeySeed(authorId: string, workId: string, seed = DEFAULT_SEED): {
  readonly keySeed: number;
  readonly signatureDigest: string;
} {
  const normalizedAuthor = authorId.trim();
  const normalizedWork = workId.trim();
  const normalizedSeed = Math.trunc(Number.isFinite(seed) ? seed : DEFAULT_SEED);
  const payload = `ts-wm-v1|${normalizedAuthor}|${normalizedWork}|${normalizedSeed}`;
  const h1 = mix32(fnv1a32(payload, 0x811c9dc5) ^ mix32(normalizedSeed));
  const h2 = mix32(fnv1a32(`${normalizedWork}:${normalizedAuthor}`, h1 ^ 0x9e3779b9));
  const digest = `WM-${h1.toString(16).toUpperCase().padStart(8, "0").slice(0, 6)}${h2.toString(16).toUpperCase().padStart(8, "0").slice(0, 4)}`;
  return { keySeed: h1, signatureDigest: digest };
}

function assertValidBuffer(rgba: Uint8ClampedArray, width: number, height: number): number {
  const w = Math.max(0, Math.trunc(width));
  const h = Math.max(0, Math.trunc(height));
  const expectedLength = w * h * 4;
  if (w === 0 || h === 0) return 0;
  if (rgba.length < expectedLength) {
    throw new RangeError(
      `RGBA 버퍼 길이(${rgba.length})가 해상도 ${w}x${h}에 필요한 ${expectedLength}바이트보다 작습니다.`,
    );
  }
  return w * h;
}

/**
 * 결정적 PRNG 스프레드-스펙트럼 의사난수 패턴을 블루 주축 + 휘도 보정(R/G 역위상) 채널에 삽입한다.
 * 강도 1..8 전역에서 PSNR >= 38 dB의 육안 비가시성을 유지한다.
 */
export function embedAntiAiNoiseWatermark(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: InvisibleWatermarkOptions,
): WatermarkEmbedResult {
  const pixelCount = assertValidBuffer(rgba, width, height);
  const strength = clamp(options.strength, MIN_STRENGTH, MAX_STRENGTH);
  const seed = Math.trunc(Number.isFinite(options.seed ?? DEFAULT_SEED) ? (options.seed ?? DEFAULT_SEED) : DEFAULT_SEED);
  const { keySeed, signatureDigest } = deriveWatermarkKeySeed(options.authorId, options.workId, seed);

  const out = new Uint8ClampedArray(rgba);
  if (pixelCount === 0) {
    return {
      rgba: out,
      width: Math.max(0, Math.trunc(width)),
      height: Math.max(0, Math.trunc(height)),
      strength,
      seed,
      signatureDigest,
      psnrDb: 99.99,
      mse: 0,
      modifiedPixelCount: 0,
      opaquePixelCount: 0,
      totalPixelCount: 0,
      modifiedRatio: 0,
      meanAbsBlueDelta: 0,
      invisiblePass: true,
    };
  }

  // 강도 1..8에서 블루 채널 진폭 1.00..4.36, 휘도 중화용 G/R 역위상 진폭 0..0.84 / 0..0.60
  // 이론 최악치(strength=8): MSE ≈ 6.9 -> PSNR ≈ 39.7 dB (>= 38 dB 보장)
  const blueAmp = 1.0 + (strength - 1) * 0.48;
  const greenCounterAmp = (strength - 1) * 0.12;
  const redCounterAmp = Math.max(0, (strength - 3) * 0.12);

  const blueBase = Math.floor(blueAmp);
  const blueFrac = blueAmp - blueBase;
  const greenBase = Math.floor(greenCounterAmp);
  const greenFrac = greenCounterAmp - greenBase;
  const redBase = Math.floor(redCounterAmp);
  const redFrac = redCounterAmp - redBase;

  let sumSqErr = 0;
  let sumAbsBlueDelta = 0;
  let modifiedPixelCount = 0;
  let opaquePixelCount = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const alpha = out[off + 3] ?? 0;
    if (alpha < OPAQUE_ALPHA_THRESHOLD) {
      continue;
    }
    opaquePixelCount += 1;

    const h = mix32(keySeed ^ Math.imul(i + 1, 0x9e3779b1));
    const sign = (h & 1) === 0 ? 1 : -1;
    const uBlue = ((h >>> 1) & 0x3ff) / 1024;
    const uGreen = ((h >>> 11) & 0x3ff) / 1024;
    const uRed = ((h >>> 21) & 0x3ff) / 1024;

    const bStep = blueBase + (uBlue < blueFrac ? 1 : 0);
    const gStep = greenBase + (uGreen < greenFrac ? 1 : 0);
    const rStep = redBase + (uRed < redFrac ? 1 : 0);

    const origR = out[off] ?? 0;
    const origG = out[off + 1] ?? 0;
    const origB = out[off + 2] ?? 0;

    // 블루 채널에 +sign*bStep, 인간 시지각 휘도(0.299R+0.587G+0.114B) 균형 및
    // Anti-AI 다채널 스펙트럼 교란을 위해 G/R에 미세 역위상 적용
    const nextB = clampByte(origB + sign * bStep);
    const nextG = clampByte(origG - sign * gStep);
    const nextR = clampByte(origR - sign * rStep);

    out[off] = nextR;
    out[off + 1] = nextG;
    out[off + 2] = nextB;

    const dr = nextR - origR;
    const dg = nextG - origG;
    const db = nextB - origB;
    if (dr !== 0 || dg !== 0 || db !== 0) {
      modifiedPixelCount += 1;
    }
    sumAbsBlueDelta += Math.abs(db);
    sumSqErr += dr * dr + dg * dg + db * db;
  }

  const mse = sumSqErr / (pixelCount * 3);
  const psnrDb = mse <= 1e-12 ? 99.99 : roundTo(10 * Math.log10((255 * 255) / mse), 2);

  return {
    rgba: out,
    width: Math.trunc(width),
    height: Math.trunc(height),
    strength,
    seed,
    signatureDigest,
    psnrDb,
    mse: roundTo(mse, 4),
    modifiedPixelCount,
    opaquePixelCount,
    totalPixelCount: pixelCount,
    modifiedRatio: roundTo(opaquePixelCount > 0 ? modifiedPixelCount / opaquePixelCount : 0, 4),
    meanAbsBlueDelta: roundTo(opaquePixelCount > 0 ? sumAbsBlueDelta / opaquePixelCount : 0, 3),
    invisiblePass: psnrDb >= INVISIBLE_PSNR_FLOOR_DB,
  };
}

function extractOpponentChannel(rgba: Uint8ClampedArray, pixelCount: number): Float32Array {
  const signal = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const r = rgba[off] ?? 0;
    const g = rgba[off + 1] ?? 0;
    const b = rgba[off + 2] ?? 0;
    // 블루 주축 + 역위상 G/R 보정과 정합되는 청-황 대립 채널
    signal[i] = b - 0.25 * g - 0.1 * r;
  }
  return signal;
}

function computeFourNeighborResidual(
  data: Float32Array,
  alphaMask: Uint8Array,
  width: number,
  height: number,
  idx: number,
): { readonly residual: number; readonly localSpan: number } {
  const x = idx % width;
  const y = (idx - x) / width;
  const center = data[idx] ?? 0;

  let sum = 0;
  let count = 0;
  let minVal = center;
  let maxVal = center;

  if (x > 0 && alphaMask[idx - 1] === 1) {
    const v = data[idx - 1] ?? 0;
    sum += v;
    count += 1;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (x + 1 < width && alphaMask[idx + 1] === 1) {
    const v = data[idx + 1] ?? 0;
    sum += v;
    count += 1;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (y > 0 && alphaMask[idx - width] === 1) {
    const v = data[idx - width] ?? 0;
    sum += v;
    count += 1;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (y + 1 < height && alphaMask[idx + width] === 1) {
    const v = data[idx + width] ?? 0;
    sum += v;
    count += 1;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }

  if (count === 0) {
    return { residual: 0, localSpan: 0 };
  }
  return {
    residual: center - sum / count,
    localSpan: maxVal - minVal,
  };
}

/**
 * 4-이웃 공간 고역통과 잔차 + 정규화 상관계수(Normalized Cross-Correlation)로
 * 기대 서명(authorId, workId, seed)의 워터마크 존재 여부와 0..1 신뢰도를 산출한다.
 */
export function detectWatermarkSignature(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  expectedAuthorId: string,
  expectedWorkId: string,
  seed = DEFAULT_SEED,
): WatermarkDetectionResult {
  const w = Math.max(0, Math.trunc(width));
  const h = Math.max(0, Math.trunc(height));
  const pixelCount = assertValidBuffer(rgba, w, h);
  const normalizedSeed = Math.trunc(Number.isFinite(seed) ? seed : DEFAULT_SEED);
  const { keySeed, signatureDigest } = deriveWatermarkKeySeed(expectedAuthorId, expectedWorkId, normalizedSeed);

  if (pixelCount < 16) {
    return {
      expectedAuthorId,
      expectedWorkId,
      seed: normalizedSeed,
      signatureDigest,
      normalizedCorrelation: 0,
      zScore: 0,
      confidence: 0,
      matched: false,
      threshold: 0.2,
      evaluatedPixelCount: 0,
    };
  }

  const alphaMask = new Uint8Array(pixelCount);
  const pattern = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    if ((rgba[i * 4 + 3] ?? 0) >= OPAQUE_ALPHA_THRESHOLD) {
      alphaMask[i] = 1;
      const hash = mix32(keySeed ^ Math.imul(i + 1, 0x9e3779b1));
      pattern[i] = (hash & 1) === 0 ? 1 : -1;
    }
  }

  const channel = extractOpponentChannel(rgba, pixelCount);
  const imgResiduals = new Float32Array(pixelCount);
  const patResiduals = new Float32Array(pixelCount);
  const weights = new Float32Array(pixelCount);

  let effectiveCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if (alphaMask[i] !== 1) continue;
    const imgRes = computeFourNeighborResidual(channel, alphaMask, w, h, i);
    const patRes = computeFourNeighborResidual(pattern, alphaMask, w, h, i);

    // 급격한 선화 경계(localSpan이 매우 큰 픽셀)는 가중치를 부드럽게 낮춰 호스트 간섭을 억제
    const clippedResidual = clamp(imgRes.residual, -8, 8);
    const edgeWeight = 1 / (1 + (imgRes.localSpan / 28) ** 2);

    imgResiduals[i] = clippedResidual;
    patResiduals[i] = patRes.residual;
    weights[i] = edgeWeight;
    effectiveCount += edgeWeight;
  }

  if (effectiveCount < 8) {
    return {
      expectedAuthorId,
      expectedWorkId,
      seed: normalizedSeed,
      signatureDigest,
      normalizedCorrelation: 0,
      zScore: 0,
      confidence: 0,
      matched: false,
      threshold: 0.2,
      evaluatedPixelCount: Math.round(effectiveCount),
    };
  }

  let meanImg = 0;
  let meanPat = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const wt = weights[i] ?? 0;
    if (wt === 0) continue;
    meanImg += wt * (imgResiduals[i] ?? 0);
    meanPat += wt * (patResiduals[i] ?? 0);
  }
  meanImg /= effectiveCount;
  meanPat /= effectiveCount;

  let cov = 0;
  let varImg = 0;
  let varPat = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const wt = weights[i] ?? 0;
    if (wt === 0) continue;
    const di = (imgResiduals[i] ?? 0) - meanImg;
    const dp = (patResiduals[i] ?? 0) - meanPat;
    cov += wt * di * dp;
    varImg += wt * di * di;
    varPat += wt * dp * dp;
  }

  const denom = Math.sqrt(varImg * varPat);
  const ncc = denom > 1e-9 ? clamp(cov / denom, -1, 1) : 0;
  const zScore = ncc * Math.sqrt(effectiveCount);
  const threshold = roundTo(Math.max(0.18, 4.5 / Math.sqrt(effectiveCount)), 4);
  const matched = ncc >= threshold && zScore >= 4.0;

  // 2-시그마 잡음 바닥 이하 억제 + 양의 NCC 단조 신뢰도 매핑 (0..1)
  const statGate = zScore <= 2 ? 0 : Math.min(1, (zScore - 2) / 6);
  const rawConfidence = ncc <= 0 ? 0 : 1 - Math.exp(-3.4 * ncc);
  const confidence = roundTo(clamp(rawConfidence * statGate, 0, 1), 4);

  return {
    expectedAuthorId,
    expectedWorkId,
    seed: normalizedSeed,
    signatureDigest,
    normalizedCorrelation: roundTo(ncc, 4),
    zScore: roundTo(zScore, 2),
    confidence,
    matched,
    threshold,
    evaluatedPixelCount: Math.round(effectiveCount),
  };
}

function sanitizeFilenameSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : "work";
}

/**
 * 다중 컷 배치 비가시 워터마크 적용 및 파일명·권리 메타데이터 매니페스트를 생성한다.
 * 각 컷에 RGBA 버퍼가 제공되면 실제 픽셀 삽입 및 역검출 검증을 수행한다.
 */
export function buildBatchWatermarkExportPlan(
  cuts: readonly BatchWatermarkCutInput[],
  options: BatchWatermarkExportOptions,
): BatchWatermarkExportPlan {
  const strength = clamp(options.strength, MIN_STRENGTH, MAX_STRENGTH);
  const seed = Math.trunc(Number.isFinite(options.seed ?? DEFAULT_SEED) ? (options.seed ?? DEFAULT_SEED) : DEFAULT_SEED);
  const format = options.format ?? "png";
  const aiTrainingPolicy = options.aiTrainingPolicy ?? "no-ai-training-no-scraping";
  const workSlug = sanitizeFilenameSlug(options.episodeCode ?? options.workId);
  const copyrightHolder = (options.copyrightHolder ?? options.authorId).trim() || "Unknown Creator";

  const items: BatchWatermarkCutPlanItem[] = [];
  let processedPixelCuts = 0;
  let verifiedCuts = 0;
  let minPsnrDb: number | null = null;
  let sumPsnrDb = 0;
  let totalModifiedPixels = 0;

  for (let idx = 0; idx < cuts.length; idx += 1) {
    const cut = cuts[idx];
    if (!cut) continue;
    const cutNum = Math.max(1, Math.trunc(cut.cutNumber || idx + 1));
    const cutPad = String(cutNum).padStart(3, "0");
    const cutWorkId = `${options.workId}#cut-${cutPad}`;
    const outputFilename = `${workSlug}_cut${cutPad}_anti-ai-wm.${format}`;

    if (cut.rgba && cut.width > 0 && cut.height > 0) {
      const embedded = embedAntiAiNoiseWatermark(cut.rgba, cut.width, cut.height, {
        authorId: options.authorId,
        workId: cutWorkId,
        strength,
        seed,
      });
      const verification = detectWatermarkSignature(
        embedded.rgba,
        cut.width,
        cut.height,
        options.authorId,
        cutWorkId,
        seed,
      );

      processedPixelCuts += 1;
      if (verification.matched) {
        verifiedCuts += 1;
      }
      minPsnrDb = minPsnrDb === null ? embedded.psnrDb : Math.min(minPsnrDb, embedded.psnrDb);
      sumPsnrDb += embedded.psnrDb;
      totalModifiedPixels += embedded.modifiedPixelCount;

      items.push({
        cutId: cut.cutId,
        cutNumber: cutNum,
        title: cut.title,
        cutWorkId,
        outputFilename,
        width: cut.width,
        height: cut.height,
        processedWithPixels: true,
        watermarkedRgba: embedded.rgba,
        psnrDb: embedded.psnrDb,
        modifiedPixelCount: embedded.modifiedPixelCount,
        signatureDigest: embedded.signatureDigest,
        verifiedMatched: verification.matched,
        verificationConfidence: verification.confidence,
      });
    } else {
      const { signatureDigest } = deriveWatermarkKeySeed(options.authorId, cutWorkId, seed);
      items.push({
        cutId: cut.cutId,
        cutNumber: cutNum,
        title: cut.title,
        cutWorkId,
        outputFilename,
        width: Math.max(0, Math.trunc(cut.width)),
        height: Math.max(0, Math.trunc(cut.height)),
        processedWithPixels: false,
        psnrDb: null,
        modifiedPixelCount: 0,
        signatureDigest,
        verifiedMatched: null,
        verificationConfidence: null,
      });
    }
  }

  const avgPsnrDb = processedPixelCuts > 0 ? roundTo(sumPsnrDb / processedPixelCuts, 2) : null;
  const allInvisiblePass =
    processedPixelCuts > 0 && minPsnrDb !== null && minPsnrDb >= INVISIBLE_PSNR_FLOOR_DB && verifiedCuts === processedPixelCuts;

  const manifest: BatchWatermarkRightsManifest = {
    schemaVersion: "toonstudio.wm.batch.v1",
    authorId: options.authorId,
    workId: options.workId,
    copyrightNotice: `© ${copyrightHolder}. All rights reserved. Unauthorized AI training or dataset scraping is prohibited.`,
    aiTrainingPolicy,
    watermarkMethod: "spread-spectrum-blue-luma-v1",
    strength,
    seed,
    format,
    cutEntries: items.map((item) => ({
      cutId: item.cutId,
      cutNumber: item.cutNumber,
      outputFilename: item.outputFilename,
      cutWorkId: item.cutWorkId,
      signatureDigest: item.signatureDigest,
      psnrDb: item.psnrDb,
      verifiedMatched: item.verifiedMatched,
    })),
  };

  return {
    items,
    manifest,
    summary: {
      totalCuts: items.length,
      processedPixelCuts,
      verifiedCuts,
      minPsnrDb,
      avgPsnrDb,
      allInvisiblePass,
      totalModifiedPixels,
    },
  };
}

/**
 * 실시간 패널 시연·검증용 웹툰 컷 RGBA 픽셀 버퍼를 생성한다 (하늘 그라데이션·캐릭터 밑색·선화·말풍선).
 */
export function createDemoWebtoonCutBuffer(width = 64, height = 64, variant = 0): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      // 배경 하늘 그라데이션
      const t = y / Math.max(1, height - 1);
      let r = Math.round(215 - t * 45 + (variant % 3) * 8);
      let g = Math.round(224 - t * 30);
      let b = Math.round(240 - t * 20);

      // 캐릭터 얼굴/상반신 실루엣 영역
      const dx = x - width * 0.5;
      const dy = y - height * 0.45;
      const dist = Math.hypot(dx, dy);
      if (dist < width * 0.24) {
        r = 242;
        g = 214;
        b = 194;
      } else if (dist >= width * 0.24 && dist < width * 0.27) {
        // 선화 테두리
        r = 26;
        g = 24;
        b = 30;
      } else if (y > height * 0.68 && Math.abs(dx) < width * 0.34) {
        // 의상 밑색
        r = 74 + (variant % 2) * 36;
        g = 96;
        b = 152;
      }

      // 좌상단 말풍선
      if (x >= 4 && x <= Math.floor(width * 0.36) && y >= 4 && y <= Math.floor(height * 0.24)) {
        r = 250;
        g = 250;
        b = 252;
      }

      rgba[off] = clampByte(r);
      rgba[off + 1] = clampByte(g);
      rgba[off + 2] = clampByte(b);
      rgba[off + 3] = 255;
    }
  }
  return rgba;
}

export function createDemoBatchWatermarkCuts(): readonly DemoWatermarkCutFixture[] {
  return [
    {
      cutId: "ep12-cut-001",
      cutNumber: 1,
      titleKo: "1컷 · 옥상 오프닝 전경",
      titleEn: "Cut 01 · Rooftop Opening",
      width: 64,
      height: 64,
      rgba: createDemoWebtoonCutBuffer(64, 64, 0),
    },
    {
      cutId: "ep12-cut-002",
      cutNumber: 2,
      titleKo: "2컷 · 주인공 클로즈업",
      titleEn: "Cut 02 · Lead Close-Up",
      width: 64,
      height: 64,
      rgba: createDemoWebtoonCutBuffer(64, 64, 1),
    },
    {
      cutId: "ep12-cut-003",
      cutNumber: 3,
      titleKo: "3컷 · 대사 리액션 컷",
      titleEn: "Cut 03 · Dialogue Reaction",
      width: 64,
      height: 64,
      rgba: createDemoWebtoonCutBuffer(64, 64, 2),
    },
  ];
}
