/**
 * 운율(Prosody) 기반 한국어 감정 식자 셰이퍼,
 * 출고 전 1~3px 지우개 티끌·선화 밖 밑색 삐짐·알파 후광(Alpha Halo) 현미경 클리너,
 * 초소형 이진 벡터 애니메이션(`.tvani`) 코덱 및 교차 플랫폼 SHA-256 CAS 무손실 동기화 조정기.
 *
 * - 외부 서버 비용 ₩0, 브라우저 KV 전역 무사용, 다항식 백트래킹 정규식 0건.
 */

export {
  TVANI_MAGIC_BYTES,
  buildCasAssetManifest,
  computeSha256Hex,
  decodeTvaniBinary,
  encodeTvaniBinary,
  measureTvaniCompressionRatio,
  reassembleCasAssetLossless,
  reconcileCasSyncPlan,
  serializeLottieLikeJson,
  type BuildCasManifestInput,
  type CasAssetEntry,
  type CasAssetManifest,
  type CasChunkDescriptor,
  type CasPlatformKind,
  type CasRawAssetInput,
  type CasSyncReconciliationPlan,
  type TvaniAnimationClip,
  type TvaniCompressionReport,
  type TvaniSplineEasing,
  type TvaniSplineKeyframe,
  type TvaniTrackProperty,
  type TvaniVectorTrack,
} from "./tvani-cas-sync";

export type ProsodyEmotionTag =
  | "shout"
  | "whisper"
  | "tremble"
  | "icy-monologue"
  | "joy-bounce";

export const PROSODY_LABELS_KO: Readonly<Record<ProsodyEmotionTag, string>> = Object.freeze({
  shout: "외침 강조",
  whisper: "속삭임 축소",
  tremble: "공포 떨림",
  "icy-monologue": "차갑게 가라앉은 독백",
  "joy-bounce": "탄력 있는 환호",
});

export interface KoreanSyllableCluster {
  readonly clusterIndex: number;
  readonly rawText: string;
  readonly composedText: string;
  readonly codePointCount: number;
  readonly isHangulSyllable: boolean;
  readonly isWhitespace: boolean;
}

export interface ProsodyLetteringOptions {
  readonly text: string;
  readonly prosody: ProsodyEmotionTag;
  readonly baseFontSizePx: number;
  readonly baseStrokeWeightPx?: number;
  readonly intensity?: number;
  readonly seed?: number;
}

export interface ShapedGlyphCluster {
  readonly clusterIndex: number;
  readonly rawText: string;
  readonly composedText: string;
  readonly isHangulSyllable: boolean;
  readonly isWhitespace: boolean;
  readonly xPx: number;
  readonly yOffsetPx: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly trackingAfterPx: number;
  readonly strokeWeightPx: number;
  readonly opacity: number;
}

export interface ShapedLetteringRun {
  readonly prosody: ProsodyEmotionTag;
  readonly labelKo: string;
  readonly clusters: readonly ShapedGlyphCluster[];
  readonly totalAdvancePx: number;
  readonly boundingBox: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export type MicroscopeAnomalyKind = "eraser-dust" | "flat-color-leak" | "alpha-halo";

export const MICROSCOPE_ANOMALY_LABELS_KO: Readonly<Record<MicroscopeAnomalyKind, string>> =
  Object.freeze({
    "eraser-dust": "지우개 잔여 티끌",
    "flat-color-leak": "선화 바깥 밑색 삐짐",
    "alpha-halo": "반투명 흰 테두리 후광",
  });

export interface MicroscopeCleanerOptions {
  readonly width: number;
  readonly height: number;
  readonly targetRgba: Uint8Array;
  readonly lineworkRgba?: Uint8Array;
  readonly maxDustAreaPx?: number;
  readonly maxLeakAreaPx?: number;
  readonly inkBarrierAlpha?: number;
  readonly haloMaxAlpha?: number;
  readonly haloMinWhiteChannel?: number;
  readonly decontaminateEdgeHalo?: boolean;
}

export interface MicroscopeAnomaly {
  readonly kind: MicroscopeAnomalyKind;
  readonly labelKo: string;
  readonly pixelCount: number;
  readonly sampleX: number;
  readonly sampleY: number;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface MicroscopeCleanReport {
  readonly width: number;
  readonly height: number;
  readonly cleanedRgba: Uint8Array;
  readonly anomalies: readonly MicroscopeAnomaly[];
  readonly removedDustComponentCount: number;
  readonly removedLeakComponentCount: number;
  readonly cleanedHaloPixelCount: number;
  readonly untouchedPixelCount: number;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function isHangulChoseong(cp: number): boolean {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0xa960 && cp <= 0xa97c);
}

function isHangulJungseong(cp: number): boolean {
  return (cp >= 0x1160 && cp <= 0x11a7) || (cp >= 0xd7b0 && cp <= 0xd7c6);
}

function isHangulJongseong(cp: number): boolean {
  return (cp >= 0x11a8 && cp <= 0x11ff) || (cp >= 0xd7cb && cp <= 0xd7fb);
}

function isPrecomposedHangulSyllable(cp: number): boolean {
  return cp >= 0xac00 && cp <= 0xd7a3;
}

function isCompatibilityHangulJamo(cp: number): boolean {
  return cp >= 0x3131 && cp <= 0x318e;
}

function isCombiningExtendMark(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x302e && cp <= 0x302f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f)
  );
}

function isAsciiOrUnicodeSpace(cp: number): boolean {
  return cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x3000;
}

/**
 * 완성형 한글 음절(`가..힣`)과 조합형 자모(`초성+중성+종성` NFD 시퀀스)를
 * 절대 쪼개지 않고 음절 단위로 묶어 분할한다.
 */
export function segmentKoreanSyllableClusters(text: string): readonly KoreanSyllableCluster[] {
  const codePoints: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    codePoints.push(cp);
    i += cp > 0xffff ? 2 : 1;
  }

  const clusters: KoreanSyllableCluster[] = [];
  let pos = 0;
  while (pos < codePoints.length) {
    const start = pos;
    const first = codePoints[pos]!;
    let isHangul: boolean;

    if (isHangulChoseong(first)) {
      isHangul = true;
      while (pos < codePoints.length && isHangulChoseong(codePoints[pos]!)) pos += 1;
      while (pos < codePoints.length && isHangulJungseong(codePoints[pos]!)) pos += 1;
      while (pos < codePoints.length && isHangulJongseong(codePoints[pos]!)) pos += 1;
    } else if (isHangulJungseong(first)) {
      isHangul = true;
      while (pos < codePoints.length && isHangulJungseong(codePoints[pos]!)) pos += 1;
      while (pos < codePoints.length && isHangulJongseong(codePoints[pos]!)) pos += 1;
    } else if (isPrecomposedHangulSyllable(first)) {
      isHangul = true;
      pos += 1;
      while (pos < codePoints.length && isHangulJongseong(codePoints[pos]!)) pos += 1;
    } else {
      isHangul = isCompatibilityHangulJamo(first);
      pos += 1;
    }

    while (pos < codePoints.length && isCombiningExtendMark(codePoints[pos]!)) {
      pos += 1;
    }

    const sliceCps = codePoints.slice(start, pos);
    const rawText = String.fromCodePoint(...sliceCps);
    const composedText = rawText.normalize("NFC");
    clusters.push({
      clusterIndex: clusters.length,
      rawText,
      composedText,
      codePointCount: sliceCps.length,
      isHangulSyllable: isHangul,
      isWhitespace: sliceCps.length === 1 && isAsciiOrUnicodeSpace(first),
    });
  }

  return clusters;
}

/**
 * 감정 운율 태그(`shout`, `whisper`, `tremble`, `icy-monologue`, `joy-bounce`)를
 * 한글 음절 클러스터 무결성을 보존한 채 글자별 크기 램프·기준선 파동/떨림·자간·획 굵기로 변환한다.
 */
export function shapeExpressiveKoreanLettering(
  options: ProsodyLetteringOptions,
): ShapedLetteringRun {
  if (!(options.baseFontSizePx > 0)) {
    throw new RangeError("기본 글자 크기(baseFontSizePx)는 0보다 커야 합니다.");
  }
  const baseFont = options.baseFontSizePx;
  const baseStroke = Math.max(0.5, options.baseStrokeWeightPx ?? baseFont * 0.06);
  const intensity = clamp(options.intensity ?? 1, 0, 2);
  const rawClusters = segmentKoreanSyllableClusters(options.text);

  let rngState = ((options.seed ?? 918273) >>> 0) || 0x13579bdf;
  const nextRandSigned = (): number => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return ((rngState >>> 0) / 4294967296) * 2 - 1;
  };

  const visibleTotal = Math.max(
    1,
    rawClusters.reduce((acc, item) => acc + (item.isWhitespace ? 0 : 1), 0),
  );

  const shaped: ShapedGlyphCluster[] = [];
  let cursorX = 0;
  let visibleIndex = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < rawClusters.length; i += 1) {
    const cluster = rawClusters[i]!;
    if (cluster.isWhitespace) {
      const spaceAdvance = baseFont * 0.34;
      shaped.push({
        clusterIndex: cluster.clusterIndex,
        rawText: cluster.rawText,
        composedText: cluster.composedText,
        isHangulSyllable: false,
        isWhitespace: true,
        xPx: cursorX,
        yOffsetPx: 0,
        scale: 1,
        rotationDeg: 0,
        trackingAfterPx: 0,
        strokeWeightPx: 0,
        opacity: 0,
      });
      cursorX += spaceAdvance;
      continue;
    }

    const u = visibleTotal <= 1 ? 0.5 : visibleIndex / (visibleTotal - 1);
    visibleIndex += 1;

    let scale = 1;
    let yOffsetPx = 0;
    let xJitterPx = 0;
    let rotationDeg = 0;
    let trackingEm = 0;
    let strokeMul = 1;
    let opacity = 1;

    switch (options.prosody) {
      case "shout": {
        scale = 1 + (0.16 + 0.3 * u) * intensity;
        yOffsetPx = -Math.sin(u * Math.PI) * baseFont * 0.14 * intensity;
        rotationDeg = (u - 0.5) * 4.2 * intensity;
        trackingEm = 0.08 * intensity;
        strokeMul = 1 + 0.48 * intensity;
        break;
      }
      case "whisper": {
        scale = Math.max(0.45, 1 - (0.2 + 0.12 * u) * intensity);
        yOffsetPx = u * baseFont * 0.1 * intensity;
        trackingEm = 0.12 * intensity;
        strokeMul = Math.max(0.4, 1 - 0.34 * intensity);
        opacity = clamp(1 - 0.28 * intensity, 0.3, 1);
        break;
      }
      case "tremble": {
        const jx = nextRandSigned();
        const jy = nextRandSigned();
        const jr = nextRandSigned();
        scale = 1 + nextRandSigned() * 0.06 * intensity;
        xJitterPx = jx * baseFont * 0.055 * intensity;
        yOffsetPx = jy * baseFont * 0.11 * intensity;
        rotationDeg = jr * 4.5 * intensity;
        trackingEm = -0.02 * intensity;
        strokeMul = 1 + Math.abs(jy) * 0.14 * intensity;
        break;
      }
      case "icy-monologue": {
        scale = Math.max(0.7, 1 - 0.06 * intensity);
        yOffsetPx = 0;
        rotationDeg = 0;
        trackingEm = 0.18 * intensity;
        strokeMul = Math.max(0.5, 1 - 0.2 * intensity);
        opacity = 0.94;
        break;
      }
      case "joy-bounce": {
        const hop = Math.abs(Math.sin(visibleIndex * 1.15));
        scale = 1 + (0.04 + 0.15 * hop) * intensity;
        yOffsetPx = -hop * baseFont * 0.22 * intensity;
        rotationDeg = Math.sin(visibleIndex * 1.15) * 5 * intensity;
        trackingEm = 0.05 * intensity;
        strokeMul = 1 + 0.16 * intensity;
        break;
      }
    }

    const glyphWidth = baseFont * (cluster.isHangulSyllable ? 0.96 : 0.62) * scale;
    const glyphHeight = baseFont * scale;
    const trackingAfterPx = baseFont * trackingEm;
    const drawX = cursorX + xJitterPx;

    minX = Math.min(minX, drawX);
    maxX = Math.max(maxX, drawX + glyphWidth);
    minY = Math.min(minY, yOffsetPx - glyphHeight);
    maxY = Math.max(maxY, yOffsetPx);

    shaped.push({
      clusterIndex: cluster.clusterIndex,
      rawText: cluster.rawText,
      composedText: cluster.composedText,
      isHangulSyllable: cluster.isHangulSyllable,
      isWhitespace: false,
      xPx: drawX,
      yOffsetPx,
      scale,
      rotationDeg,
      trackingAfterPx,
      strokeWeightPx: baseStroke * strokeMul,
      opacity,
    });

    cursorX += glyphWidth + (i < rawClusters.length - 1 ? trackingAfterPx : 0);
  }

  return {
    prosody: options.prosody,
    labelKo: PROSODY_LABELS_KO[options.prosody],
    clusters: shaped,
    totalAdvancePx: cursorX,
    boundingBox: Number.isFinite(minX)
      ? { minX, minY, maxX, maxY }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
}

const NEIGHBOR8_DX = [-1, 0, 1, -1, 1, -1, 0, 1] as const;
const NEIGHBOR8_DY = [-1, -1, -1, 0, 0, 1, 1, 1] as const;

function buildExteriorOutsideLineMask(
  width: number,
  height: number,
  lineworkRgba: Uint8Array,
  inkBarrierAlpha: number,
): Uint8Array {
  const total = width * height;
  const exterior = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const trySeed = (x: number, y: number): void => {
    const idx = y * width + x;
    if (exterior[idx] !== 0) return;
    if ((lineworkRgba[idx * 4 + 3] ?? 0) >= inkBarrierAlpha) return;
    exterior[idx] = 1;
    queue[tail] = idx;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (head < tail) {
    const curr = queue[head]!;
    head += 1;
    const cx = curr % width;
    const cy = (curr - cx) / width;
    if (cx > 0) trySeed(cx - 1, cy);
    if (cx + 1 < width) trySeed(cx + 1, cy);
    if (cy > 0) trySeed(cx, cy - 1);
    if (cy + 1 < height) trySeed(cx, cy + 1);
  }

  return exterior;
}

/**
 * 8-이웃 연결 요소 스캐너로 `1..3px` 지우개 잔여 티끌, 선화 바깥 밑색 삐짐,
 * 반투명 흰 테두리 후광(Alpha Halo)을 한 번에 무손실 정리한다.
 */
export function cleanStrayPixelsAndAlphaHalos(
  options: MicroscopeCleanerOptions,
): MicroscopeCleanReport {
  const { width, height, targetRgba } = options;
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError("검사 대상 이미지 가로·세로는 1 이상의 정수여야 합니다.");
  }
  const totalPixels = width * height;
  if (targetRgba.length !== totalPixels * 4) {
    throw new RangeError("대상 RGBA 버퍼 길이가 width * height * 4와 일치하지 않습니다.");
  }
  if (options.lineworkRgba && options.lineworkRgba.length !== totalPixels * 4) {
    throw new RangeError("선화 참조 RGBA 버퍼 길이가 width * height * 4와 일치하지 않습니다.");
  }

  const maxDustArea = Math.max(1, Math.floor(options.maxDustAreaPx ?? 3));
  const maxLeakArea = Math.max(maxDustArea, Math.floor(options.maxLeakAreaPx ?? 12));
  const inkBarrierAlpha = clamp(options.inkBarrierAlpha ?? 128, 1, 255);
  const haloMaxAlpha = clamp(options.haloMaxAlpha ?? 220, 1, 254);
  const haloMinWhite = clamp(options.haloMinWhiteChannel ?? 216, 128, 255);
  const decontaminateEdge = options.decontaminateEdgeHalo ?? true;

  const cleanedRgba = new Uint8Array(targetRgba);
  const exteriorMask = options.lineworkRgba
    ? buildExteriorOutsideLineMask(width, height, options.lineworkRgba, inkBarrierAlpha)
    : undefined;

  const visited = new Uint8Array(totalPixels);
  const bfsQueue = new Int32Array(totalPixels);
  const anomalies: MicroscopeAnomaly[] = [];
  let removedDustComponentCount = 0;
  let removedLeakComponentCount = 0;
  let modifiedPixelCount = 0;

  for (let startIdx = 0; startIdx < totalPixels; startIdx += 1) {
    if (visited[startIdx] !== 0) continue;
    if ((cleanedRgba[startIdx * 4 + 3] ?? 0) === 0) {
      visited[startIdx] = 1;
      continue;
    }

    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    bfsQueue[tail] = startIdx;
    tail += 1;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let allOutsideLine = exteriorMask !== undefined;

    while (head < tail) {
      const idx = bfsQueue[head]!;
      head += 1;
      const px = idx % width;
      const py = (idx - px) / width;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
      if (exteriorMask && exteriorMask[idx] === 0) {
        allOutsideLine = false;
      }

      for (let d = 0; d < 8; d += 1) {
        const nx = px + NEIGHBOR8_DX[d]!;
        const ny = py + NEIGHBOR8_DY[d]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (visited[nIdx] !== 0) continue;
        if ((cleanedRgba[nIdx * 4 + 3] ?? 0) === 0) continue;
        visited[nIdx] = 1;
        bfsQueue[tail] = nIdx;
        tail += 1;
      }
    }

    const componentArea = tail;
    const isDust = componentArea <= maxDustArea;
    const isLeak = !isDust && allOutsideLine && componentArea <= maxLeakArea;
    if (isDust || isLeak) {
      const kind: MicroscopeAnomalyKind = isDust ? "eraser-dust" : "flat-color-leak";
      if (isDust) removedDustComponentCount += 1;
      else removedLeakComponentCount += 1;

      for (let k = 0; k < componentArea; k += 1) {
        const pOff = bfsQueue[k]! * 4;
        cleanedRgba[pOff] = 0;
        cleanedRgba[pOff + 1] = 0;
        cleanedRgba[pOff + 2] = 0;
        cleanedRgba[pOff + 3] = 0;
      }
      modifiedPixelCount += componentArea;
      const sampleIdx = bfsQueue[0]!;
      const sx = sampleIdx % width;
      const sy = (sampleIdx - sx) / width;
      anomalies.push({
        kind,
        labelKo: MICROSCOPE_ANOMALY_LABELS_KO[kind],
        pixelCount: componentArea,
        sampleX: sx,
        sampleY: sy,
        bounds: { minX, minY, maxX, maxY },
      });
    }
  }

  const postDustSnapshot = new Uint8Array(cleanedRgba);
  const haloFlags = new Uint8Array(totalPixels);
  let cleanedHaloPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const a = postDustSnapshot[off + 3]!;
      if (a === 0 || a > haloMaxAlpha) continue;
      const r = postDustSnapshot[off]!;
      const g = postDustSnapshot[off + 1]!;
      const b = postDustSnapshot[off + 2]!;
      if (Math.min(r, g, b) < haloMinWhite) continue;

      let touchesTransparent = false;
      let solidCount = 0;
      let sumSolidR = 0;
      let sumSolidG = 0;
      let sumSolidB = 0;

      for (let d = 0; d < 8; d += 1) {
        const nx = x + NEIGHBOR8_DX[d]!;
        const ny = y + NEIGHBOR8_DY[d]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          touchesTransparent = true;
          continue;
        }
        const nOff = (ny * width + nx) * 4;
        const na = postDustSnapshot[nOff + 3]!;
        if (na === 0) {
          touchesTransparent = true;
        } else if (
          na > haloMaxAlpha &&
          Math.min(
            postDustSnapshot[nOff]!,
            postDustSnapshot[nOff + 1]!,
            postDustSnapshot[nOff + 2]!,
          ) < haloMinWhite
        ) {
          solidCount += 1;
          sumSolidR += postDustSnapshot[nOff]!;
          sumSolidG += postDustSnapshot[nOff + 1]!;
          sumSolidB += postDustSnapshot[nOff + 2]!;
        }
      }

      if (!touchesTransparent) continue;
      haloFlags[idx] = 1;
      cleanedHaloPixelCount += 1;
      modifiedPixelCount += 1;

      if (decontaminateEdge && solidCount > 0) {
        cleanedRgba[off] = Math.round(sumSolidR / solidCount);
        cleanedRgba[off + 1] = Math.round(sumSolidG / solidCount);
        cleanedRgba[off + 2] = Math.round(sumSolidB / solidCount);
        cleanedRgba[off + 3] = a;
      } else {
        cleanedRgba[off] = 0;
        cleanedRgba[off + 1] = 0;
        cleanedRgba[off + 2] = 0;
        cleanedRgba[off + 3] = 0;
      }
    }
  }

  visited.fill(0);
  for (let startIdx = 0; startIdx < totalPixels; startIdx += 1) {
    if (haloFlags[startIdx] === 0 || visited[startIdx] !== 0) continue;
    let head = 0;
    let tail = 0;
    visited[startIdx] = 1;
    bfsQueue[tail] = startIdx;
    tail += 1;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (head < tail) {
      const idx = bfsQueue[head]!;
      head += 1;
      const px = idx % width;
      const py = (idx - px) / width;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
      for (let d = 0; d < 8; d += 1) {
        const nx = px + NEIGHBOR8_DX[d]!;
        const ny = py + NEIGHBOR8_DY[d]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (haloFlags[nIdx] === 0 || visited[nIdx] !== 0) continue;
        visited[nIdx] = 1;
        bfsQueue[tail] = nIdx;
        tail += 1;
      }
    }
    const sx = startIdx % width;
    const sy = (startIdx - sx) / width;
    anomalies.push({
      kind: "alpha-halo",
      labelKo: MICROSCOPE_ANOMALY_LABELS_KO["alpha-halo"],
      pixelCount: tail,
      sampleX: sx,
      sampleY: sy,
      bounds: { minX, minY, maxX, maxY },
    });
  }

  return {
    width,
    height,
    cleanedRgba,
    anomalies,
    removedDustComponentCount,
    removedLeakComponentCount,
    cleanedHaloPixelCount,
    untouchedPixelCount: totalPixels - modifiedPixelCount,
  };
}
