/**
 * 세로 스크롤 감정 박자·컷 여백 리듬 분석기(Scroll-Velocity-to-Emotion Beat & Gutter Rhythm Analyzer) 및
 * 무복사 Copy-on-Write(CoW) 영속 레이어 타일 스냅샷 트리(Persistent 256x256 Tile DAG).
 *
 * - 서버 호출 0회(₩0), 모든 리듬 해석과 타일 해시 중복 제거를 클라이언트 메모리 안에서 완결한다.
 * - 컷 세로 높이, 대사 음절 수, 시각 대비 에너지, 컷 사이 여백(`여백px`)으로부터 실제 독자 스크롤 속도(`px/sec`)와
 *   음악적 박자 타임라인 곡선을 도출하고, 연출 의도와 어긋난 호흡(성급한 비극 침묵·늘어진 액션 연타)을 잡아낸다.
 * - `256x256` 타일 핸들을 내용 기반 64비트 해시와 참조 카운트(`refCount`)로 구조 공유해,
 *   `Variant A: 심야 네온리스 느와르`와 `Variant B: 노을 역광` 사이를 추가 메모리 `0B`로 즉시(`O(1)`) 분기한다.
 */

export type ScrollEmotionIntent =
  | "tragic-silence" | "action-combo" | "tension-suspense" | "comedic-punch" | "warm-everyday" | "climactic-reveal";

export type PacingWarningKind =
  | "rushed-tragic-silence" | "sluggish-action-combo" | "abrupt-climactic-reveal" | "monotone-gutter-cadence";

export interface ScrollRhythmPanelInput {
  readonly panelId: string;
  readonly panelHeightPx: number;
  readonly gutterAfterPx: number;
  readonly dialogueText?: string;
  readonly dialogueSyllableCount?: number;
  readonly visualContrastEnergy: number;
  readonly intendedEmotion: ScrollEmotionIntent;
}

export interface ScrollRhythmAnalyzeInput {
  readonly panels: readonly ScrollRhythmPanelInput[];
  readonly viewportHeightPx?: number;
  readonly baselineScrollPxPerSec?: number;
  readonly referenceBpm?: number;
}

export interface ScrollEmotionBeatPoint {
  readonly panelIndex: number;
  readonly panelId: string;
  readonly intendedEmotion: ScrollEmotionIntent;
  readonly syllableCount: number;
  readonly spanHeightPx: number;
  readonly dwellSeconds: number;
  readonly timelineStartSec: number;
  readonly timelineEndSec: number;
  readonly scrollVelocityPxPerSec: number;
  readonly localTempoBpm: number;
  readonly cumulativeBeatIndex: number;
  readonly beatEnergy: number;
}

export interface PacingMismatchWarning {
  readonly kind: PacingWarningKind;
  readonly severity: "warn" | "critical";
  readonly panelIndex: number;
  readonly panelId: string;
  readonly observedVelocityPxPerSec: number;
  readonly observedGutterPx: number;
  readonly recommendedGutterPx: number;
  readonly messageKo: string;
  readonly suggestedFixKo: string;
}

export interface ScrollRhythmAnalysisReport {
  readonly beatTimeline: readonly ScrollEmotionBeatPoint[];
  readonly warnings: readonly PacingMismatchWarning[];
  readonly totalScrollHeightPx: number;
  readonly totalReadingDurationSec: number;
  readonly meanScrollVelocityPxPerSec: number;
  readonly peakTempoBpm: number;
  readonly serverCostKrw: 0;
}

function clampNum(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function isAsciiVowel(code: number): boolean {
  const lower = code >= 65 && code <= 90 ? code + 32 : code;
  return lower === 97 || lower === 101 || lower === 105 || lower === 111 || lower === 117 || lower === 121;
}

function isAsciiAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** 정규식 없이 O(n) 코드포인트 스캔으로 한글·한자·숫자·영문 대사 음절 수를 센다. */
export function countReadingSyllables(text: string): number {
  let syllables = 0;
  let inLatinWord = false;
  let prevWasLatinVowel = false;
  let latinWordVowelCount = 0;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isEastAsianOrDigit =
      (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0x3131 && code <= 0x318e)
      || (code >= 0x4e00 && code <= 0x9fff)
      || (code >= 48 && code <= 57);

    if (isEastAsianOrDigit) {
      if (inLatinWord && latinWordVowelCount === 0) syllables += 1;
      inLatinWord = false;
      prevWasLatinVowel = false;
      latinWordVowelCount = 0;
      syllables += 1;
      continue;
    }
    if (isAsciiAlpha(code)) {
      inLatinWord = true;
      const vowel = isAsciiVowel(code);
      if (vowel && !prevWasLatinVowel) {
        syllables += 1;
        latinWordVowelCount += 1;
      }
      prevWasLatinVowel = vowel;
      continue;
    }
    if (inLatinWord) {
      if (latinWordVowelCount === 0) syllables += 1;
      inLatinWord = false;
      prevWasLatinVowel = false;
      latinWordVowelCount = 0;
    }
  }
  if (inLatinWord && latinWordVowelCount === 0) syllables += 1;
  return syllables;
}

/**
 * 세로 웹툰 원고의 컷 높이·대사량·시각 대비·여백(`px`)에서 독자 스크롤 속도 곡선과
 * 음악적 감정 박자 타임라인을 계산하고, 호흡 불일치 경고를 반환한다.
 */
export function analyzeScrollEmotionRhythm(
  input: ScrollRhythmAnalyzeInput,
): ScrollRhythmAnalysisReport {
  const viewportHeightPx = Math.max(320, input.viewportHeightPx ?? 844);
  const baseVelocity = Math.max(120, input.baselineScrollPxPerSec ?? 560);
  const referenceBpm = clampNum(input.referenceBpm ?? 96, 40, 220);

  const beatTimeline: ScrollEmotionBeatPoint[] = [];
  const warnings: PacingMismatchWarning[] = [];
  let cursorSec = 0;
  let cumulativeBeats = 0;
  let totalScrollHeightPx = 0;
  let peakTempoBpm = 0;

  for (let i = 0; i < input.panels.length; i += 1) {
    const panel = input.panels[i]!;
    const panelHeightPx = Math.max(40, panel.panelHeightPx);
    const gutterAfterPx = Math.max(0, panel.gutterAfterPx);
    const contrast = clampNum(panel.visualContrastEnergy, 0, 1);
    const syllableCount =
      panel.dialogueSyllableCount !== undefined
        ? Math.max(0, Math.round(panel.dialogueSyllableCount))
        : countReadingSyllables(panel.dialogueText ?? "");

    const kineticFlow = panel.intendedEmotion === "action-combo" ? 0.62 : 0.88;
    const panelScanSec = (panelHeightPx / baseVelocity) * kineticFlow * (0.72 + 0.56 * contrast);
    const dialogueSec = syllableCount > 0 ? 0.16 + syllableCount / 6.2 : 0;
    const gutterBoost = gutterAfterPx / viewportHeightPx >= 0.3 ? 1.28 : 0.92;
    const gutterSec = (gutterAfterPx / baseVelocity) * gutterBoost;

    const dwellSeconds = Math.max(0.08, panelScanSec + dialogueSec + gutterSec);
    const spanHeightPx = panelHeightPx + gutterAfterPx;
    const scrollVelocityPxPerSec = spanHeightPx / dwellSeconds;
    const speedRatio = clampNum(scrollVelocityPxPerSec / baseVelocity, 0.35, 2.4);
    const localTempoBpm = clampNum(referenceBpm * (0.55 + 0.45 * speedRatio) * (0.85 + 0.3 * contrast), 36, 220);
    if (localTempoBpm > peakTempoBpm) peakTempoBpm = localTempoBpm;

    const timelineStartSec = cursorSec;
    const timelineEndSec = cursorSec + dwellSeconds;
    cursorSec = timelineEndSec;
    cumulativeBeats += (dwellSeconds / 60) * localTempoBpm;
    totalScrollHeightPx += spanHeightPx;

    const dramaticBoost =
      panel.intendedEmotion === "climactic-reveal" || panel.intendedEmotion === "tragic-silence" ? 0.2 : 0.08;
    const beatEnergy = clampNum(0.48 * contrast + 0.32 * clampNum(speedRatio / 1.6, 0, 1) + dramaticBoost, 0, 1);

    beatTimeline.push({
      panelIndex: i, panelId: panel.panelId, intendedEmotion: panel.intendedEmotion, syllableCount,
      spanHeightPx, dwellSeconds, timelineStartSec, timelineEndSec, scrollVelocityPxPerSec,
      localTempoBpm, cumulativeBeatIndex: cumulativeBeats, beatEnergy,
    });

    if (panel.intendedEmotion === "tragic-silence" && (gutterAfterPx < 240 || dwellSeconds < 1.35 || scrollVelocityPxPerSec > 540)) {
      const targetGutter = Math.max(320, Math.round(viewportHeightPx * 0.48));
      warnings.push({
        kind: "rushed-tragic-silence", severity: gutterAfterPx < 120 ? "critical" : "warn",
        panelIndex: i, panelId: panel.panelId, observedVelocityPxPerSec: scrollVelocityPxPerSec,
        observedGutterPx: gutterAfterPx, recommendedGutterPx: targetGutter,
        messageKo: "비극적 침묵 컷의 아래 여백이 좁아 독자가 감정을 느끼기 전에 스쳐 지나갑니다.",
        suggestedFixKo: `컷 아래 여백을 ${targetGutter}px 이상으로 넓혀 1.5초 이상의 정적 호흡을 확보하세요.`,
      });
    } else if (panel.intendedEmotion === "action-combo" && (scrollVelocityPxPerSec < 430 || gutterAfterPx > 210 || syllableCount > 22)) {
      const targetGutter = Math.min(72, Math.max(24, Math.round(viewportHeightPx * 0.06)));
      warnings.push({
        kind: "sluggish-action-combo", severity: scrollVelocityPxPerSec < 320 ? "critical" : "warn",
        panelIndex: i, panelId: panel.panelId, observedVelocityPxPerSec: scrollVelocityPxPerSec,
        observedGutterPx: gutterAfterPx, recommendedGutterPx: targetGutter,
        messageKo: "액션 연타 구간에서 과도한 대사나 넓은 여백 때문에 타격 속도감이 끊깁니다.",
        suggestedFixKo: `여백을 ${targetGutter}px 안팎으로 좁히고 긴 대사는 연타 직후 호흡 컷으로 분리하세요.`,
      });
    } else if (panel.intendedEmotion === "climactic-reveal" && gutterAfterPx < 160) {
      const targetGutter = Math.round(viewportHeightPx * 0.36);
      warnings.push({
        kind: "abrupt-climactic-reveal", severity: "warn", panelIndex: i, panelId: panel.panelId,
        observedVelocityPxPerSec: scrollVelocityPxPerSec, observedGutterPx: gutterAfterPx, recommendedGutterPx: targetGutter,
        messageKo: "결정적 반전 컷 직후 여백이 부족해 잔상이 남기 전에 다음 장면이 노출됩니다.",
        suggestedFixKo: `반전 컷 아래 여백을 ${targetGutter}px 수준으로 늘려 시선 정지 구간을 만드세요.`,
      });
    }
  }

  for (let i = 2; i < input.panels.length; i += 1) {
    const p0 = input.panels[i - 2]!;
    const p1 = input.panels[i - 1]!;
    const p2 = input.panels[i]!;
    const gMean = (p0.gutterAfterPx + p1.gutterAfterPx + p2.gutterAfterPx) / 3;
    const stdDev = Math.sqrt(((p0.gutterAfterPx - gMean) ** 2 + (p1.gutterAfterPx - gMean) ** 2 + (p2.gutterAfterPx - gMean) ** 2) / 3);
    if ((p0.intendedEmotion !== p1.intendedEmotion || p1.intendedEmotion !== p2.intendedEmotion) && stdDev < 6) {
      warnings.push({
        kind: "monotone-gutter-cadence", severity: "warn", panelIndex: i, panelId: p2.panelId,
        observedVelocityPxPerSec: beatTimeline[i]?.scrollVelocityPxPerSec ?? baseVelocity,
        observedGutterPx: p2.gutterAfterPx, recommendedGutterPx: Math.round(gMean * 1.45 + 40),
        messageKo: "서로 다른 감정 흐름이 이어지는데도 컷 간격이 기계적으로 일정해 리듬감이 평평합니다.",
        suggestedFixKo: "긴장·전환 컷 앞뒤 여백에 완급 차이를 두어 스크롤 박자에 강약을 주세요.",
      });
    }
  }

  return {
    beatTimeline, warnings, totalScrollHeightPx, totalReadingDurationSec: cursorSec,
    meanScrollVelocityPxPerSec: cursorSec > 1e-6 ? totalScrollHeightPx / cursorSec : baseVelocity,
    peakTempoBpm, serverCostKrw: 0,
  };
}

// ============================================================================
// 2. 무복사 Copy-on-Write(CoW) 영속 256x256 레이어 타일 스냅샷 트리
// ============================================================================

export const COW_TILE_DIMENSION_PX = 256;
export const COW_TILE_BYTE_LENGTH = COW_TILE_DIMENSION_PX * COW_TILE_DIMENSION_PX * 4;

export type LayerBlendModeId = "normal" | "multiply" | "screen" | "overlay" | "soft-light";
export type ColorMoodVariantPresetId = "midnight-neonless-noir" | "sunset-backlight";

export interface ColorMoodVariantPreset {
  readonly id: ColorMoodVariantPresetId;
  readonly variantTitleKo: string;
  readonly channelGainRgb: readonly [number, number, number];
  readonly shadowLiftRgb: readonly [number, number, number];
  readonly saturationScale: number;
  readonly contrastGamma: number;
}

export const COLOR_MOOD_VARIANT_PRESETS: Readonly<Record<ColorMoodVariantPresetId, ColorMoodVariantPreset>> = {
  "midnight-neonless-noir": {
    id: "midnight-neonless-noir", variantTitleKo: "Variant A: 심야 네온리스 느와르",
    channelGainRgb: [0.76, 0.84, 0.94], shadowLiftRgb: [0.02, 0.035, 0.055], saturationScale: 0.58, contrastGamma: 1.18,
  },
  "sunset-backlight": {
    id: "sunset-backlight", variantTitleKo: "Variant B: 노을 역광",
    channelGainRgb: [1.14, 0.88, 0.66], shadowLiftRgb: [0.065, 0.028, 0.012], saturationScale: 1.12, contrastGamma: 0.94,
  },
};

export interface PersistentTileHandle {
  readonly contentHash: string;
  readonly pixelsRgba8: Uint8Array;
  readonly byteLength: number;
  readonly layerVersionRefCount: number;
  readonly snapshotRefCount: number;
}

export interface PersistentLayerDescriptor {
  readonly layerId: string;
  readonly nameKo: string;
  readonly blendMode?: LayerBlendModeId;
  readonly opacity?: number;
  readonly initialTiles?: ReadonlyArray<{ readonly tileX: number; readonly tileY: number; readonly pixelsRgba8: Uint8Array }>;
}

export interface PersistentLayerVersion {
  readonly versionId: string;
  readonly layerId: string;
  readonly nameKo: string;
  readonly blendMode: LayerBlendModeId;
  readonly opacity: number;
  readonly tileHashes: ReadonlyMap<string, string>;
}

export interface PersistentSnapshotRecord {
  readonly snapshotId: string;
  readonly branchName: string;
  readonly moodLabelKo: string;
  readonly parentSnapshotIds: readonly string[];
  readonly revision: number;
  readonly layers: ReadonlyMap<string, PersistentLayerVersion>;
}

export interface TileCoordBox { readonly minTileX: number; readonly minTileY: number; readonly maxTileX: number; readonly maxTileY: number }
export interface CowBranchForkResult { readonly snapshot: PersistentSnapshotRecord; readonly newlyAllocatedTileBytes: 0; readonly sharedLayerCount: number }
export interface CowMoodApplyResult {
  readonly snapshot: PersistentSnapshotRecord;
  readonly touchedTileCount: number;
  readonly sharedUntouchedTileCount: number;
  readonly duplicateBytesForUntouchedTiles: 0;
  readonly newlyRetainedPhysicalBytes: number;
}
export interface SnapshotTileDiffEntry { readonly layerId: string; readonly tileX: number; readonly tileY: number; readonly beforeHash: string | null; readonly afterHash: string | null }
export interface PersistentMergeConflict { readonly layerId: string; readonly tileX: number; readonly tileY: number; readonly baseHash: string | null; readonly leftHash: string | null; readonly rightHash: string | null }
export interface PersistentMergeResult { readonly mergedSnapshot: PersistentSnapshotRecord; readonly conflicts: readonly PersistentMergeConflict[]; readonly newlyAllocatedTileBytes: 0 }

export interface CowMemoryTelemetry {
  readonly activeSnapshotCount: number;
  readonly activeBranchCount: number;
  readonly uniquePhysicalTileCount: number;
  readonly logicalTileSlotCount: number;
  readonly physicalPoolBytes: number;
  readonly naiveClonedEquivalentBytes: number;
  readonly savedBytesByCowSharing: number;
  readonly serverCostKrw: 0;
}

interface MutableTilePoolEntry {
  readonly contentHash: string;
  readonly pixelsRgba8: Uint8Array;
  layerVersionRefCount: number;
  snapshotRefCount: number;
}

interface MutableLayerPoolEntry {
  readonly version: PersistentLayerVersion;
  snapshotRefCount: number;
}

function makeTileKey(tileX: number, tileY: number): string {
  return `${Math.trunc(tileX)},${Math.trunc(tileY)}`;
}

function parseTileKey(key: string): readonly [number, number] {
  const idx = key.indexOf(",");
  return [Number.parseInt(key.slice(0, idx), 10), Number.parseInt(key.slice(idx + 1), 10)];
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** ES2017 호환 `Math.imul` 이중 레인과 `BigInt(...)`로 64비트 16자리 16진수 내용 해시를 계산한다. */
export function computeTileContentHash64(pixelsRgba8: Uint8Array): string {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x9e3779b9 | 0;
  const byteLen = pixelsRgba8.byteLength;
  const fullWords = byteLen & ~3;

  for (let i = 0; i < fullWords; i += 4) {
    const word =
      (pixelsRgba8[i] ?? 0)
      | ((pixelsRgba8[i + 1] ?? 0) << 8)
      | ((pixelsRgba8[i + 2] ?? 0) << 16)
      | ((pixelsRgba8[i + 3] ?? 0) << 24);
    h1 = Math.imul(h1 ^ word, 0x01000193);
    h2 = Math.imul(h2 ^ ((word >>> 13) | (word << 19)), 0x85ebca6b);
  }
  for (let i = fullWords; i < byteLen; i += 1) {
    const b = pixelsRgba8[i] ?? 0;
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 ^ (b + 0x9e), 0xc2b2ae35);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35);

  const combined64 = (BigInt(h1 >>> 0) << BigInt(32)) | BigInt(h2 >>> 0);
  return combined64.toString(16).padStart(16, "0");
}

/** 단일 `256x256` RGBA8 타일에 색감 무드 프리셋을 적용한 새 불변 타일 버퍼를 반환한다. */
export function gradeTileWithMoodPreset(
  sourceRgba8: Uint8Array,
  presetId: ColorMoodVariantPresetId,
): Uint8Array {
  if (sourceRgba8.byteLength !== COW_TILE_BYTE_LENGTH) {
    throw new RangeError(`타일 버퍼 크기는 정확히 ${COW_TILE_BYTE_LENGTH}바이트(256x256 RGBA8)여야 합니다.`);
  }
  const preset = COLOR_MOOD_VARIANT_PRESETS[presetId];
  const out = new Uint8Array(COW_TILE_BYTE_LENGTH);

  for (let i = 0; i < COW_TILE_BYTE_LENGTH; i += 4) {
    const a = sourceRgba8[i + 3] ?? 0;
    if (a === 0) continue;

    const rNorm = (sourceRgba8[i] ?? 0) / 255;
    const gNorm = (sourceRgba8[i + 1] ?? 0) / 255;
    const bNorm = (sourceRgba8[i + 2] ?? 0) / 255;
    const lum = 0.2126 * rNorm + 0.7152 * gNorm + 0.0722 * bNorm;
    const satR = lum + (rNorm - lum) * preset.saturationScale;
    const satG = lum + (gNorm - lum) * preset.saturationScale;
    const satB = lum + (bNorm - lum) * preset.saturationScale;
    const shadowW = 1 - lum;

    const gR = Math.pow(clampNum(satR * preset.channelGainRgb[0], 0, 1), preset.contrastGamma) + preset.shadowLiftRgb[0] * shadowW;
    const gG = Math.pow(clampNum(satG * preset.channelGainRgb[1], 0, 1), preset.contrastGamma) + preset.shadowLiftRgb[1] * shadowW;
    const gB = Math.pow(clampNum(satB * preset.channelGainRgb[2], 0, 1), preset.contrastGamma) + preset.shadowLiftRgb[2] * shadowW;

    out[i] = Math.round(clampNum(gR, 0, 1) * 255);
    out[i + 1] = Math.round(clampNum(gG, 0, 1) * 255);
    out[i + 2] = Math.round(clampNum(gB, 0, 1) * 255);
    out[i + 3] = a;
  }
  return out;
}

/**
 * `256x256` 타일 내용 해시 중복 제거와 참조 카운트(`refCount`)로 동작하는
 * 무복사 Copy-on-Write 영속 레이어 스냅샷 DAG 트리.
 */
export class PersistentLayerTileSnapshotTree {
  private readonly tilePool = new Map<string, MutableTilePoolEntry>();
  private readonly layerPool = new Map<string, MutableLayerPoolEntry>();
  private readonly snapshots = new Map<string, PersistentSnapshotRecord>();
  private readonly branchHeads = new Map<string, string>();
  private nextRevision = 1;
  private nextLayerVersionSeq = 1;

  private internTileBuffer(pixelsRgba8: Uint8Array): { readonly hash: string; readonly isNewlyAllocated: boolean } {
    if (pixelsRgba8.byteLength !== COW_TILE_BYTE_LENGTH) {
      throw new RangeError(`타일 크기는 ${COW_TILE_BYTE_LENGTH}바이트(256x256 RGBA8)여야 합니다.`);
    }
    const baseHash = computeTileContentHash64(pixelsRgba8);
    let slot = 0;
    while (true) {
      const candidateKey = slot === 0 ? baseHash : `${baseHash}:${slot}`;
      const existing = this.tilePool.get(candidateKey);
      if (!existing) {
        this.tilePool.set(candidateKey, {
          contentHash: candidateKey,
          pixelsRgba8: new Uint8Array(pixelsRgba8),
          layerVersionRefCount: 0,
          snapshotRefCount: 0,
        });
        return { hash: candidateKey, isNewlyAllocated: true };
      }
      if (bytesEqual(existing.pixelsRgba8, pixelsRgba8)) {
        return { hash: candidateKey, isNewlyAllocated: false };
      }
      slot += 1;
    }
  }

  private createLayerVersion(
    layerId: string, nameKo: string, blendMode: LayerBlendModeId, opacity: number, tileHashes: Map<string, string>,
  ): PersistentLayerVersion {
    const versionId = `lv-${this.nextLayerVersionSeq}`;
    this.nextLayerVersionSeq += 1;
    for (const hash of tileHashes.values()) {
      const tile = this.tilePool.get(hash);
      if (tile) tile.layerVersionRefCount += 1;
    }
    const version: PersistentLayerVersion = { versionId, layerId, nameKo, blendMode, opacity: clampNum(opacity, 0, 1), tileHashes };
    this.layerPool.set(versionId, { version, snapshotRefCount: 0 });
    return version;
  }

  private registerSnapshot(
    branchName: string, moodLabelKo: string, parentSnapshotIds: readonly string[], layers: Map<string, PersistentLayerVersion>,
  ): PersistentSnapshotRecord {
    for (const layerVer of layers.values()) {
      const layerEntry = this.layerPool.get(layerVer.versionId);
      if (layerEntry) layerEntry.snapshotRefCount += 1;
      for (const hash of layerVer.tileHashes.values()) {
        const tileEntry = this.tilePool.get(hash);
        if (tileEntry) tileEntry.snapshotRefCount += 1;
      }
    }
    const revision = this.nextRevision;
    this.nextRevision += 1;
    const snapshotId = `snap-${revision}`;
    const record: PersistentSnapshotRecord = { snapshotId, branchName, moodLabelKo, parentSnapshotIds, revision, layers };
    this.snapshots.set(snapshotId, record);
    this.branchHeads.set(branchName, snapshotId);
    return record;
  }

  public createRootSnapshot(
    branchName: string, moodLabelKo: string, layers: readonly PersistentLayerDescriptor[],
  ): PersistentSnapshotRecord {
    const layerMap = new Map<string, PersistentLayerVersion>();
    for (const desc of layers) {
      const tileMap = new Map<string, string>();
      for (const initTile of desc.initialTiles ?? []) {
        const { hash } = this.internTileBuffer(initTile.pixelsRgba8);
        tileMap.set(makeTileKey(initTile.tileX, initTile.tileY), hash);
      }
      layerMap.set(desc.layerId, this.createLayerVersion(desc.layerId, desc.nameKo, desc.blendMode ?? "normal", desc.opacity ?? 1, tileMap));
    }
    return this.registerSnapshot(branchName, moodLabelKo, [], layerMap);
  }

  /** 기존 스냅샷에서 픽셀 복제 `0B`로 즉시(`O(1)` 구조 공유) 새 색감 무드 브랜치를 분기한다. */
  public forkVariantBranch(sourceSnapshotId: string, newBranchName: string, moodLabelKo: string): CowBranchForkResult {
    const source = this.getSnapshotOrThrow(sourceSnapshotId);
    const sharedLayers = new Map<string, PersistentLayerVersion>(source.layers);
    const snapshot = this.registerSnapshot(newBranchName, moodLabelKo, [source.snapshotId], sharedLayers);
    return { snapshot, newlyAllocatedTileBytes: 0, sharedLayerCount: sharedLayers.size };
  }

  /** 단일 `256x256` 타일만 Copy-on-Write로 교체하고 나머지 모든 타일은 무복사 공유한다. */
  public writeTileCow(
    parentSnapshotId: string, layerId: string, tileX: number, tileY: number, pixelsRgba8: Uint8Array, moodLabelKo?: string,
  ): PersistentSnapshotRecord {
    const parent = this.getSnapshotOrThrow(parentSnapshotId);
    const targetLayer = parent.layers.get(layerId);
    if (!targetLayer) throw new RangeError(`존재하지 않는 레이어 ID입니다: ${layerId}`);

    const { hash } = this.internTileBuffer(pixelsRgba8);
    const tileKey = makeTileKey(tileX, tileY);
    const nextLayers = new Map<string, PersistentLayerVersion>(parent.layers);
    if (targetLayer.tileHashes.get(tileKey) !== hash) {
      const nextTileMap = new Map<string, string>(targetLayer.tileHashes);
      nextTileMap.set(tileKey, hash);
      nextLayers.set(layerId, this.createLayerVersion(targetLayer.layerId, targetLayer.nameKo, targetLayer.blendMode, targetLayer.opacity, nextTileMap));
    }
    return this.registerSnapshot(parent.branchName, moodLabelKo ?? parent.moodLabelKo, [parent.snapshotId], nextLayers);
  }

  /** 지정 레이어·영역에만 무드 프리셋을 CoW 적용하고 미수정 타일은 추가 메모리 `0B`로 공유한다. */
  public applyMoodVariantCow(
    parentSnapshotId: string, layerId: string, presetId: ColorMoodVariantPresetId, tileRegion?: TileCoordBox,
  ): CowMoodApplyResult {
    const parent = this.getSnapshotOrThrow(parentSnapshotId);
    const targetLayer = parent.layers.get(layerId);
    if (!targetLayer) throw new RangeError(`존재하지 않는 레이어 ID입니다: ${layerId}`);

    const preset = COLOR_MOOD_VARIANT_PRESETS[presetId];
    const nextTileMap = new Map<string, string>(targetLayer.tileHashes);
    let touchedTileCount = 0;
    let newlyRetainedPhysicalBytes = 0;

    for (const [key, oldHash] of targetLayer.tileHashes.entries()) {
      const [tx, ty] = parseTileKey(key);
      const inside =
        !tileRegion
        || (tx >= tileRegion.minTileX && tx <= tileRegion.maxTileX && ty >= tileRegion.minTileY && ty <= tileRegion.maxTileY);
      if (!inside) continue;

      const oldTile = this.tilePool.get(oldHash);
      if (!oldTile) continue;
      const graded = gradeTileWithMoodPreset(oldTile.pixelsRgba8, presetId);
      const { hash: newHash, isNewlyAllocated } = this.internTileBuffer(graded);
      nextTileMap.set(key, newHash);
      touchedTileCount += 1;
      if (isNewlyAllocated) newlyRetainedPhysicalBytes += COW_TILE_BYTE_LENGTH;
    }

    const nextLayers = new Map<string, PersistentLayerVersion>(parent.layers);
    if (touchedTileCount > 0) {
      nextLayers.set(
        layerId,
        this.createLayerVersion(targetLayer.layerId, targetLayer.nameKo, targetLayer.blendMode, targetLayer.opacity, nextTileMap),
      );
    }

    let totalTiles = 0;
    for (const lv of nextLayers.values()) totalTiles += lv.tileHashes.size;
    const snapshot = this.registerSnapshot(parent.branchName, preset.variantTitleKo, [parent.snapshotId], nextLayers);

    return {
      snapshot, touchedTileCount, sharedUntouchedTileCount: Math.max(0, totalTiles - touchedTileCount),
      duplicateBytesForUntouchedTiles: 0, newlyRetainedPhysicalBytes,
    };
  }

  public diffSnapshots(beforeSnapshotId: string, afterSnapshotId: string): readonly SnapshotTileDiffEntry[] {
    const beforeSnap = this.getSnapshotOrThrow(beforeSnapshotId);
    const afterSnap = this.getSnapshotOrThrow(afterSnapshotId);
    const diffs: SnapshotTileDiffEntry[] = [];
    for (const layerId of new Set<string>([...beforeSnap.layers.keys(), ...afterSnap.layers.keys()])) {
      const bLayer = beforeSnap.layers.get(layerId);
      const aLayer = afterSnap.layers.get(layerId);
      if (bLayer && aLayer && bLayer.versionId === aLayer.versionId) continue;
      const keys = new Set<string>([...(bLayer ? bLayer.tileHashes.keys() : []), ...(aLayer ? aLayer.tileHashes.keys() : [])]);
      for (const key of keys) {
        const bHash = bLayer?.tileHashes.get(key) ?? null;
        const aHash = aLayer?.tileHashes.get(key) ?? null;
        if (bHash !== aHash) {
          const [tileX, tileY] = parseTileKey(key);
          diffs.push({ layerId, tileX, tileY, beforeHash: bHash, afterHash: aHash });
        }
      }
    }
    return diffs;
  }

  public mergeVariantBranches(
    baseSnapshotId: string, leftSnapshotId: string, rightSnapshotId: string, mergedBranchName: string, moodLabelKo: string,
  ): PersistentMergeResult {
    const baseSnap = this.getSnapshotOrThrow(baseSnapshotId);
    const leftSnap = this.getSnapshotOrThrow(leftSnapshotId);
    const rightSnap = this.getSnapshotOrThrow(rightSnapshotId);
    const conflicts: PersistentMergeConflict[] = [];
    const mergedLayers = new Map<string, PersistentLayerVersion>();
    const layerIds = new Set<string>([...baseSnap.layers.keys(), ...leftSnap.layers.keys(), ...rightSnap.layers.keys()]);

    for (const layerId of layerIds) {
      const baseLayer = baseSnap.layers.get(layerId);
      const leftLayer = leftSnap.layers.get(layerId);
      const rightLayer = rightSnap.layers.get(layerId);
      if (leftLayer && baseLayer && leftLayer.versionId === baseLayer.versionId && rightLayer) {
        mergedLayers.set(layerId, rightLayer);
        continue;
      }
      if (rightLayer && baseLayer && rightLayer.versionId === baseLayer.versionId && leftLayer) {
        mergedLayers.set(layerId, leftLayer);
        continue;
      }
      const template = leftLayer ?? rightLayer ?? baseLayer;
      if (!template) continue;

      const mergedTileMap = new Map<string, string>();
      const keys = new Set<string>([
        ...(baseLayer ? baseLayer.tileHashes.keys() : []),
        ...(leftLayer ? leftLayer.tileHashes.keys() : []),
        ...(rightLayer ? rightLayer.tileHashes.keys() : []),
      ]);
      for (const key of keys) {
        const bHash = baseLayer?.tileHashes.get(key) ?? null;
        const lHash = leftLayer?.tileHashes.get(key) ?? null;
        const rHash = rightLayer?.tileHashes.get(key) ?? null;
        let chosen: string | null = lHash;
        if (lHash === bHash) chosen = rHash;
        else if (rHash === bHash || lHash === rHash) chosen = lHash;
        else {
          const [tileX, tileY] = parseTileKey(key);
          conflicts.push({ layerId, tileX, tileY, baseHash: bHash, leftHash: lHash, rightHash: rHash });
        }
        if (chosen !== null) mergedTileMap.set(key, chosen);
      }
      mergedLayers.set(layerId, this.createLayerVersion(layerId, template.nameKo, template.blendMode, template.opacity, mergedTileMap));
    }

    const mergedSnapshot = this.registerSnapshot(mergedBranchName, moodLabelKo, [leftSnap.snapshotId, rightSnap.snapshotId], mergedLayers);
    return { mergedSnapshot, conflicts, newlyAllocatedTileBytes: 0 };
  }

  public pruneSnapshot(snapshotId: string): { readonly reclaimedTileCount: number; readonly reclaimedBytes: number } {
    const snap = this.getSnapshotOrThrow(snapshotId);
    this.snapshots.delete(snapshotId);
    for (const [branch, headId] of this.branchHeads.entries()) {
      if (headId === snapshotId) this.branchHeads.delete(branch);
    }
    let reclaimedTileCount = 0;
    for (const layerVer of snap.layers.values()) {
      for (const hash of layerVer.tileHashes.values()) {
        const tileEntry = this.tilePool.get(hash);
        if (tileEntry) tileEntry.snapshotRefCount = Math.max(0, tileEntry.snapshotRefCount - 1);
      }
      const layerEntry = this.layerPool.get(layerVer.versionId);
      if (layerEntry) {
        layerEntry.snapshotRefCount -= 1;
        if (layerEntry.snapshotRefCount <= 0) {
          this.layerPool.delete(layerVer.versionId);
          for (const hash of layerVer.tileHashes.values()) {
            const tileEntry = this.tilePool.get(hash);
            if (tileEntry) {
              tileEntry.layerVersionRefCount -= 1;
              if (tileEntry.layerVersionRefCount <= 0 && tileEntry.snapshotRefCount <= 0) {
                this.tilePool.delete(hash);
                reclaimedTileCount += 1;
              }
            }
          }
        }
      }
    }
    return { reclaimedTileCount, reclaimedBytes: reclaimedTileCount * COW_TILE_BYTE_LENGTH };
  }

  public getSnapshotOrThrow(snapshotId: string): PersistentSnapshotRecord {
    const found = this.snapshots.get(snapshotId);
    if (!found) throw new RangeError(`존재하지 않는 스냅샷 ID입니다: ${snapshotId}`);
    return found;
  }

  public getTileHandle(snapshotId: string, layerId: string, tileX: number, tileY: number): PersistentTileHandle | null {
    const snap = this.getSnapshotOrThrow(snapshotId);
    const hash = snap.layers.get(layerId)?.tileHashes.get(makeTileKey(tileX, tileY));
    const entry = hash ? this.tilePool.get(hash) : undefined;
    if (!entry) return null;
    return {
      contentHash: entry.contentHash, pixelsRgba8: entry.pixelsRgba8, byteLength: COW_TILE_BYTE_LENGTH,
      layerVersionRefCount: entry.layerVersionRefCount, snapshotRefCount: entry.snapshotRefCount,
    };
  }

  public getBranchHeadSnapshot(branchName: string): PersistentSnapshotRecord | null {
    const headId = this.branchHeads.get(branchName);
    return headId ? (this.snapshots.get(headId) ?? null) : null;
  }

  public getMemoryTelemetry(): CowMemoryTelemetry {
    let logicalTileSlotCount = 0;
    for (const snap of this.snapshots.values()) {
      for (const layer of snap.layers.values()) logicalTileSlotCount += layer.tileHashes.size;
    }
    const uniquePhysicalTileCount = this.tilePool.size;
    const physicalPoolBytes = uniquePhysicalTileCount * COW_TILE_BYTE_LENGTH;
    const naiveClonedEquivalentBytes = logicalTileSlotCount * COW_TILE_BYTE_LENGTH;
    return {
      activeSnapshotCount: this.snapshots.size, activeBranchCount: this.branchHeads.size,
      uniquePhysicalTileCount, logicalTileSlotCount, physicalPoolBytes, naiveClonedEquivalentBytes,
      savedBytesByCowSharing: Math.max(0, naiveClonedEquivalentBytes - physicalPoolBytes), serverCostKrw: 0,
    };
  }
}
