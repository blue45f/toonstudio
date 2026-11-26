/**
 * Wave 8 Singularity — 실시간 한글·문장부호 글리프 서브셋터 · 로컬 ε-차분 프라이버시 창작 텔레메트리 ·
 * 시공간 하이브리드 논리 벡터 시계(HLC + Vector Clock) CRDT 컨티뉴엄 엔진 통합 모듈 (₩0 로컬 연산).
 */

export {
  compareHlcTimestamps,
  compareVectorClocks,
  SpacetimeContinuumEngine,
  type CausalOrderRelation,
  type ConcurrentBranchPair,
  type ContinuumReplaySnapshot,
  type ContinuumStrokePayload,
  type HybridLogicalTimestamp,
  type MaterializedContinuumStroke,
  type SpacetimeStrokeOperation,
  type StrokePointSample,
  type VectorClockMap,
} from "./spacetime-continuum-crdt";

/* -------------------------------------------------------------------------- */
/* 1. 실시간 한글·문장부호 글리프 서브셋터 (TSGF Binary Bundle)               */
/* -------------------------------------------------------------------------- */

export type GlyphUnicodeCategory =
  | "notdef"
  | "hangul-syllable"
  | "hangul-jamo"
  | "punctuation"
  | "ascii-alnum"
  | "symbol";

export interface HangulJamoDecomposition {
  readonly choseongIndex: number;
  readonly jungseongIndex: number;
  readonly jongseongIndex: number;
}

export interface FontGlyphCatalog {
  readonly familyName: string;
  readonly totalGlyphCount: number;
  readonly totalFontBytes: number;
  readonly getOriginalGlyphId?: (codePoint: number) => number;
  readonly getGlyphPayload?: (codePoint: number) => Uint8Array;
}

export interface SubsetCmapEntry {
  readonly unicode: number;
  readonly originalGlyphId: number;
  readonly subsetGlyphId: number;
  readonly category: GlyphUnicodeCategory;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface GlyphSubsetResult {
  readonly familyName: string;
  readonly sortedCodePoints: Uint32Array;
  readonly cmapEntries: readonly SubsetCmapEntry[];
  readonly unicodeToSubsetGlyphId: ReadonlyMap<number, number>;
  readonly subsetToOriginalGlyphId: Uint16Array;
  readonly subsetBinaryBundle: Uint8Array;
  readonly uniqueHangulSyllables: number;
  readonly uniqueCompositeJamoParts: {
    readonly choseong: number;
    readonly jungseong: number;
    readonly jongseong: number;
  };
  readonly originalFontBytes: number;
  readonly subsetBundleBytes: number;
  readonly byteReductionRatio: number;
  readonly serverCostKrw: 0;
}

/** 현대 한글 완전체 11,172자 + 자모 313자 + 문장부호/기호 256자 + 인쇄 가능 ASCII 95자 기준 레퍼런스 크기. */
export const DEFAULT_FULL_CJK_HANGUL_FONT_GLYPHS = 11_836;
export const DEFAULT_FULL_CJK_HANGUL_FONT_BYTES = 1_893_760;

const TSGF_MAGIC = 0x54534746;
const TSGF_HEADER_BYTES = 16;
const TSGF_CMAP_ROW_BYTES = 14;

/** 현대 한글 음절(U+AC00..U+D7A3)을 초성·중성·종성 인덱스로 분해한다. */
export function decomposeHangulSyllable(codePoint: number): HangulJamoDecomposition | null {
  if (codePoint < 0xac00 || codePoint > 0xd7a3) return null;
  const offset = codePoint - 0xac00;
  const jongseongIndex = offset % 28;
  const jungseongIndex = ((offset - jongseongIndex) / 28) % 21;
  const choseongIndex = Math.floor(offset / (21 * 28));
  return { choseongIndex, jungseongIndex, jongseongIndex };
}

/** 유니코드 스칼라 값을 웹툰 식자 범주로 분류한다. */
export function classifyGlyphCodePoint(codePoint: number): GlyphUnicodeCategory {
  if (codePoint === 0) return "notdef";
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) return "hangul-syllable";
  if (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x3130 && codePoint <= 0x318f) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
    (codePoint >= 0xd7b0 && codePoint <= 0xd7ff)
  ) {
    return "hangul-jamo";
  }
  if (
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    (codePoint >= 0x41 && codePoint <= 0x5a) ||
    (codePoint >= 0x61 && codePoint <= 0x7a)
  ) {
    return "ascii-alnum";
  }
  if (
    codePoint === 0x20 ||
    (codePoint >= 0x21 && codePoint <= 0x2f) ||
    (codePoint >= 0x3a && codePoint <= 0x40) ||
    (codePoint >= 0x5b && codePoint <= 0x60) ||
    (codePoint >= 0x7b && codePoint <= 0x7e) ||
    (codePoint >= 0x2000 && codePoint <= 0x206f) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0xff01 && codePoint <= 0xff65)
  ) {
    return "punctuation";
  }
  return "symbol";
}

function defaultOriginalGlyphId(codePoint: number): number {
  if (codePoint === 0) return 0;
  if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint - 0x1f;
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) return 400 + (codePoint - 0xac00);
  return 11_600 + (codePoint % 49_000);
}

function synthesizeCompactGlyphPayload(codePoint: number): Uint8Array {
  if (codePoint === 0) return new Uint8Array([0, 0, 3, 232, 0, 0, 0, 0]);
  const jamo = decomposeHangulSyllable(codePoint);
  const contourPoints = jamo ? (jamo.jongseongIndex > 0 ? 36 : 26) : codePoint <= 0x7f ? 14 : 20;
  const byteLen = 10 + contourPoints * 2;
  const buf = new Uint8Array(byteLen);
  const view = new DataView(buf.buffer);
  view.setUint16(0, codePoint <= 0x7f ? 520 : 1000, false);
  view.setInt16(2, codePoint === 0x20 ? 0 : 42, false);
  view.setUint16(4, contourPoints, false);
  view.setUint32(6, codePoint >>> 0, false);

  let state = (codePoint * 2654435761 + 0x9e3779b9) >>> 0;
  for (let i = 10; i < byteLen; i += 1) {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    buf[i] = state & 0xff;
  }
  return buf;
}

/**
 * 회차 대사 문자열 배열에서 고유 유니코드 코드포인트를 추출해 최소 정렬 `cmap` 및
 * 바이너리 글리프 서브셋 번들(`TSGF`)과 글리프 ID 리맵 테이블을 구축한다.
 */
export function subsetEpisodeDialogueGlyphs(
  dialogues: readonly string[],
  catalog?: FontGlyphCatalog,
): GlyphSubsetResult {
  const familyName = catalog?.familyName ?? "ToonStudioGothicKR-Regular";
  const originalFontBytes = Math.max(1024, catalog?.totalFontBytes ?? DEFAULT_FULL_CJK_HANGUL_FONT_BYTES);

  const uniqueCodePoints = new Set<number>([0x0020]);
  for (const rawLine of dialogues) {
    const normalized = rawLine.normalize("NFC");
    for (const ch of normalized) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && cp >= 0x20 && cp !== 0x7f) uniqueCodePoints.add(cp);
    }
  }

  const sortedNonZero = [...uniqueCodePoints].sort((a, b) => a - b);
  const glyphCount = 1 + sortedNonZero.length;
  const sortedCodePoints = new Uint32Array(glyphCount);
  for (let i = 0; i < sortedNonZero.length; i += 1) sortedCodePoints[i + 1] = sortedNonZero[i]!;

  const choseongSet = new Set<number>();
  const jungseongSet = new Set<number>();
  const jongseongSet = new Set<number>();
  let uniqueHangulSyllables = 0;

  const payloads: Uint8Array[] = new Array<Uint8Array>(glyphCount);
  let totalPayloadBytes = 0;
  for (let gid = 0; gid < glyphCount; gid += 1) {
    const cp = sortedCodePoints[gid]!;
    const jamo = decomposeHangulSyllable(cp);
    if (jamo) {
      uniqueHangulSyllables += 1;
      choseongSet.add(jamo.choseongIndex);
      jungseongSet.add(jamo.jungseongIndex);
      if (jamo.jongseongIndex > 0) jongseongSet.add(jamo.jongseongIndex);
    }
    const payload = catalog?.getGlyphPayload?.(cp) ?? synthesizeCompactGlyphPayload(cp);
    payloads[gid] = payload;
    totalPayloadBytes += payload.byteLength;
  }

  const cmapTableBytes = glyphCount * TSGF_CMAP_ROW_BYTES;
  const glyfBaseOffset = TSGF_HEADER_BYTES + cmapTableBytes;
  const totalBundleBytes = glyfBaseOffset + totalPayloadBytes;
  const subsetBinaryBundle = new Uint8Array(totalBundleBytes);
  const view = new DataView(subsetBinaryBundle.buffer);

  view.setUint32(0, TSGF_MAGIC, false);
  view.setUint16(4, 1, false);
  view.setUint16(6, glyphCount, false);
  view.setUint32(8, TSGF_HEADER_BYTES, false);
  view.setUint32(12, glyfBaseOffset, false);

  const cmapEntries: SubsetCmapEntry[] = new Array<SubsetCmapEntry>(glyphCount);
  const unicodeMap = new Map<number, number>();
  const subsetToOriginalGlyphId = new Uint16Array(glyphCount);

  let runningGlyfOffset = glyfBaseOffset;
  for (let subsetGid = 0; subsetGid < glyphCount; subsetGid += 1) {
    const cp = sortedCodePoints[subsetGid]!;
    const origGid = (catalog?.getOriginalGlyphId?.(cp) ?? defaultOriginalGlyphId(cp)) & 0xffff;
    const payload = payloads[subsetGid]!;
    const byteLen = Math.min(0xffff, payload.byteLength);

    const rowOffset = TSGF_HEADER_BYTES + subsetGid * TSGF_CMAP_ROW_BYTES;
    view.setUint32(rowOffset, cp, false);
    view.setUint16(rowOffset + 4, subsetGid, false);
    view.setUint16(rowOffset + 6, origGid, false);
    view.setUint32(rowOffset + 8, runningGlyfOffset, false);
    view.setUint16(rowOffset + 12, byteLen, false);
    subsetBinaryBundle.set(payload.subarray(0, byteLen), runningGlyfOffset);

    cmapEntries[subsetGid] = {
      unicode: cp,
      originalGlyphId: origGid,
      subsetGlyphId: subsetGid,
      category: classifyGlyphCodePoint(cp),
      byteOffset: runningGlyfOffset,
      byteLength: byteLen,
    };
    unicodeMap.set(cp, subsetGid);
    subsetToOriginalGlyphId[subsetGid] = origGid;
    runningGlyfOffset += byteLen;
  }

  return {
    familyName,
    sortedCodePoints,
    cmapEntries,
    unicodeToSubsetGlyphId: unicodeMap,
    subsetToOriginalGlyphId,
    subsetBinaryBundle,
    uniqueHangulSyllables,
    uniqueCompositeJamoParts: {
      choseong: choseongSet.size,
      jungseong: jungseongSet.size,
      jongseong: jongseongSet.size,
    },
    originalFontBytes,
    subsetBundleBytes: totalBundleBytes,
    byteReductionRatio: Math.max(0, 1 - totalBundleBytes / originalFontBytes),
    serverCostKrw: 0,
  };
}

/** `TSGF` 바이너리 서브셋 번들의 정렬된 `cmap` 테이블에서 O(log G) 이진 탐색으로 서브셋 글리프 ID를 찾는다. */
export function lookupSubsetGlyphIdBinary(bundle: Uint8Array, codePoint: number): number {
  if (bundle.byteLength < TSGF_HEADER_BYTES) return 0;
  const view = new DataView(bundle.buffer, bundle.byteOffset, bundle.byteLength);
  if (view.getUint32(0, false) !== TSGF_MAGIC) return 0;
  const glyphCount = view.getUint16(6, false);
  const cmapOffset = view.getUint32(8, false);
  if (bundle.byteLength < cmapOffset + glyphCount * TSGF_CMAP_ROW_BYTES) return 0;

  let lo = 0;
  let hi = glyphCount - 1;
  const target = codePoint >>> 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const rowPos = cmapOffset + mid * TSGF_CMAP_ROW_BYTES;
    const midUnicode = view.getUint32(rowPos, false);
    if (midUnicode === target) return view.getUint16(rowPos + 4, false);
    if (midUnicode < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return 0;
}

/* -------------------------------------------------------------------------- */
/* 2. 로컬 ε-차분 프라이버시(DP) 창작 텔레메트리 분석기                       */
/* -------------------------------------------------------------------------- */

export type UniformRandomSource = () => number;

export interface DpQueryLedgerEntry {
  readonly queryId: string;
  readonly mechanism: "laplace-histogram" | "randomized-response";
  readonly epsilonSpent: number;
  readonly cumulativeEpsilon: number;
  readonly l1Sensitivity: number;
}

export interface LaplaceHistogramInput {
  readonly queryId: string;
  readonly buckets: readonly string[];
  readonly rawCounts: readonly number[];
  readonly epsilon: number;
  readonly l1Sensitivity?: number;
  readonly clipToSensitivity?: boolean;
}

export interface LaplaceHistogramResult {
  readonly queryId: string;
  readonly buckets: readonly string[];
  readonly clippedCounts: Float64Array;
  readonly noisyCounts: Float64Array;
  readonly normalizedFrequencies: Float64Array;
  readonly laplaceScale: number;
  readonly theoreticalVariancePerBucket: number;
  readonly epsilonSpent: number;
  readonly remainingEpsilon: number;
  readonly serverCostKrw: 0;
}

export interface RandomizedResponseResult {
  readonly queryId: string;
  readonly categoryCount: number;
  readonly reportedCategoryIndex: number;
  readonly truthProbability: number;
  readonly otherCategoryProbability: number;
  readonly privacyLikelihoodRatio: number;
  readonly epsilonSpent: number;
  readonly remainingEpsilon: number;
}

function defaultCryptoUniform(): number {
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  return (arr[0]! + 0.5) / 4294967296;
}

/** 역누적분포함수(Inverse CDF)로 보정된 Laplace(0, scale) 난수를 표본 추출한다. */
export function sampleCalibratedLaplace(
  scale: number,
  rng: UniformRandomSource = defaultCryptoUniform,
): number {
  if (!(scale >= 0) || !Number.isFinite(scale)) {
    throw new Error("라플라스 스케일은 유한한 비음수여야 합니다.");
  }
  if (scale === 0) return 0;
  const rawU = Math.max(1e-12, Math.min(1 - 1e-12, rng()));
  const centered = rawU - 0.5;
  const sign = centered < 0 ? -1 : 1;
  return -scale * sign * Math.log(1 - 2 * Math.abs(centered));
}

/** k-진 무작위 응답(k-RR) 관측 집단으로부터 불편 추정(Debiased) 빈도 분포를 복원한다. */
export function estimateDebiasedRandomizedFrequencies(
  reportedIndices: readonly number[],
  categoryCount: number,
  epsilon: number,
): Float64Array {
  const k = Math.max(2, Math.trunc(categoryCount));
  const out = new Float64Array(k);
  if (reportedIndices.length === 0) return out;

  const expEps = Math.exp(epsilon);
  const pTruth = expEps / (expEps + k - 1);
  const pOther = 1 / (expEps + k - 1);
  const denom = Math.max(1e-9, pTruth - pOther);

  const counts = new Uint32Array(k);
  for (const idx of reportedIndices) {
    if (idx >= 0 && idx < k) counts[idx] = counts[idx]! + 1;
  }

  let clampedSum = 0;
  for (let i = 0; i < k; i += 1) {
    const empirical = counts[i]! / reportedIndices.length;
    const debiased = Math.max(0, (empirical - pOther) / denom);
    out[i] = debiased;
    clampedSum += debiased;
  }
  if (clampedSum > 1e-12) {
    for (let i = 0; i < k; i += 1) out[i] = out[i]! / clampedSum;
  }
  return out;
}

/** 순차 합성 프라이버시 예산을 엄격 관리하는 로컬 ε-DP 창작 텔레메트리 분석기. */
export class LocalDpCreatorTelemetryAnalyzer {
  private readonly maxBudget: number;
  private readonly rng: UniformRandomSource;
  private spent = 0;
  private readonly ledger: DpQueryLedgerEntry[] = [];

  public constructor(options: {
    readonly maxEpsilonBudget?: number;
    readonly rng?: UniformRandomSource;
  } = {}) {
    const budget = options.maxEpsilonBudget ?? 2.0;
    if (!(budget > 0) || !Number.isFinite(budget)) {
      throw new Error("초기 프라이버시 예산(maxEpsilonBudget)은 양의 유한수여야 합니다.");
    }
    this.maxBudget = budget;
    this.rng = options.rng ?? defaultCryptoUniform;
  }

  public get maxEpsilonBudget(): number {
    return this.maxBudget;
  }

  public get consumedEpsilon(): number {
    return this.spent;
  }

  public get remainingEpsilon(): number {
    return Math.max(0, this.maxBudget - this.spent);
  }

  public get auditLedger(): readonly DpQueryLedgerEntry[] {
    return this.ledger;
  }

  public canSpend(epsilon: number): boolean {
    return Number.isFinite(epsilon) && epsilon > 0 && this.spent + epsilon <= this.maxBudget + 1e-12;
  }

  private commitBudget(
    queryId: string,
    mechanism: DpQueryLedgerEntry["mechanism"],
    epsilon: number,
    l1Sensitivity: number,
  ): void {
    if (!Number.isFinite(epsilon) || epsilon <= 0) {
      throw new Error("질의당 epsilon은 0보다 큰 유한수여야 합니다.");
    }
    if (this.spent + epsilon > this.maxBudget + 1e-12) {
      throw new Error("프라이버시 예산(epsilon) 한도를 초과하여 텔레메트리 질의를 차단했습니다.");
    }
    this.spent += epsilon;
    this.ledger.push({
      queryId,
      mechanism,
      epsilonSpent: epsilon,
      cumulativeEpsilon: this.spent,
      l1Sensitivity,
    });
  }

  /** 단축키·브러시 사용 히스토그램에 L1 민감도 클리핑과 보정 라플라스 노이즈를 적용한다. */
  public analyzeHistogramWithLaplace(input: LaplaceHistogramInput): LaplaceHistogramResult {
    if (input.buckets.length !== input.rawCounts.length) {
      throw new Error("히스토그램 버킷 수와 원시 카운트 길이가 일치해야 합니다.");
    }
    const sensitivity = Math.max(1, input.l1Sensitivity ?? 10);
    this.commitBudget(input.queryId, "laplace-histogram", input.epsilon, sensitivity);

    const k = input.buckets.length;
    const clippedCounts = new Float64Array(k);
    let rawL1 = 0;
    for (let i = 0; i < k; i += 1) {
      const v = Math.max(0, input.rawCounts[i]!);
      clippedCounts[i] = v;
      rawL1 += v;
    }

    if ((input.clipToSensitivity ?? true) && rawL1 > sensitivity) {
      const factor = sensitivity / rawL1;
      for (let i = 0; i < k; i += 1) clippedCounts[i] = clippedCounts[i]! * factor;
    }

    const laplaceScale = sensitivity / input.epsilon;
    const noisyCounts = new Float64Array(k);
    let noisySum = 0;
    for (let i = 0; i < k; i += 1) {
      const noisy = Math.max(0, clippedCounts[i]! + sampleCalibratedLaplace(laplaceScale, this.rng));
      noisyCounts[i] = noisy;
      noisySum += noisy;
    }

    const normalizedFrequencies = new Float64Array(k);
    if (noisySum > 1e-12) {
      for (let i = 0; i < k; i += 1) normalizedFrequencies[i] = noisyCounts[i]! / noisySum;
    }

    return {
      queryId: input.queryId,
      buckets: [...input.buckets],
      clippedCounts,
      noisyCounts,
      normalizedFrequencies,
      laplaceScale,
      theoreticalVariancePerBucket: 2 * laplaceScale * laplaceScale,
      epsilonSpent: input.epsilon,
      remainingEpsilon: this.remainingEpsilon,
      serverCostKrw: 0,
    };
  }

  /** 범주형 창작 습관 응답에 로컬 ε-LDP k-진 무작위 응답(Randomized Response)을 적용한다. */
  public randomizeCategoricalHabit(params: {
    readonly queryId: string;
    readonly trueCategoryIndex: number;
    readonly categoryCount: number;
    readonly epsilon: number;
  }): RandomizedResponseResult {
    const k = Math.max(2, Math.trunc(params.categoryCount));
    const trueIdx = Math.max(0, Math.min(k - 1, Math.trunc(params.trueCategoryIndex)));
    this.commitBudget(params.queryId, "randomized-response", params.epsilon, 1);

    const expEps = Math.exp(params.epsilon);
    const pTruth = expEps / (expEps + k - 1);
    const pOther = 1 / (expEps + k - 1);

    let reported = trueIdx;
    if (this.rng() > pTruth) {
      const altOffset = 1 + Math.min(k - 2, Math.floor(this.rng() * (k - 1)));
      reported = (trueIdx + altOffset) % k;
    }

    return {
      queryId: params.queryId,
      categoryCount: k,
      reportedCategoryIndex: reported,
      truthProbability: pTruth,
      otherCategoryProbability: pOther,
      privacyLikelihoodRatio: pTruth / pOther,
      epsilonSpent: params.epsilon,
      remainingEpsilon: this.remainingEpsilon,
    };
  }
}
