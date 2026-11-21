/**
 * 웹툰 픽셀 아티팩트 헌터 · 7개국어 말풍선 교정 · 상업 라이선스 게이트 · PD/AD 음성 핀 엔진 (4~7번 모듈)
 *
 * - 100% 무과금(₩0) · 외부 API 호출 없는 결정론적 TypeScript 엔진
 * - 4) `scanPixelArtifactsAndCleanup` / `applyPixelArtifactCleanup`
 * - 5) `auditMultilingualBalloonOverflow`
 * - 6) `verifyCommercialRightsGate` / `replaceBlockedAssetWithSafeAlternative`
 * - 7) `parseVoiceQaFeedbackToPin` / `transitionVoicePinApproval`
 */

import {
  collectConnectedComponents,
  computeExteriorMask,
  isNearWhiteOrEmpty,
  sampleSurroundingInteriorColor,
  summarizeClusterGeometry,
  touchesLineArtWithinDistance,
} from "./webtoon-pixel-grid-helpers";
import {
  LOCALE_TYPOGRAPHY_PROFILES,
  REGION_ANCHOR_RULES,
  SUBJECT_KEYWORDS,
  VERIFIED_SAFE_ALTERNATIVES,
  type BalloonShapeKind,
  type CommercialRightsGateInput,
  type CommercialRightsGateReport,
  type CommercialRightsViolation,
  type EpisodeAssetUsage,
  type MultilingualBalloonAuditItem,
  type MultilingualBalloonAuditReport,
  type MultilingualBalloonInput,
  type PixelArtifactPin,
  type PixelArtifactScanReport,
  type PixelQaGridInput,
  type SupportedQaLocale,
  type VoicePinPriority,
  type VoicePinTargetRegion,
  type VoicePinTransitionAction,
  type VoiceQaFeedbackPinTicket,
} from "./webtoon-pixel-license-voice-catalog";

export {
  LOCALE_TYPOGRAPHY_PROFILES,
  SAMPLE_EPISODE_ASSET_USAGES,
  SAMPLE_MULTILINGUAL_BALLOONS,
  SAMPLE_VOICE_FEEDBACK_PRESETS,
  VERIFIED_SAFE_ALTERNATIVES,
  createSampleWebtoonPixelGrid,
  type AssetLicenseStatus,
  type BalloonShapeKind,
  type CommercialRightsGateInput,
  type CommercialRightsGateReport,
  type CommercialRightsViolation,
  type EpisodeAssetUsage,
  type LicensedAssetKind,
  type MultilingualBalloonAuditItem,
  type MultilingualBalloonAuditReport,
  type MultilingualBalloonInput,
  type PixelArtifactKind,
  type PixelArtifactPin,
  type PixelArtifactScanReport,
  type PixelQaGridInput,
  type SafeCommercialAlternative,
  type SupportedQaLocale,
  type VoicePinApprovalStatus,
  type VoicePinPriority,
  type VoicePinTargetRegion,
  type VoicePinTransitionAction,
  type VoiceQaFeedbackPinTicket,
} from "./webtoon-pixel-license-voice-catalog";

// ---------------------------------------------------------------------------
// 4. 채색 빈틈 · 선 밖 넘침 · 지우개 잔여물 픽셀 헌터
// ---------------------------------------------------------------------------

/**
 * 선택된 픽셀 아티팩트 핀 목록을 1클릭 일괄 클린업하여 새 RGBA 버퍼를 반환한다.
 */
export function applyPixelArtifactCleanup(
  colorRgba: Uint8ClampedArray,
  artifacts: readonly PixelArtifactPin[],
  selectedArtifactIds?: readonly string[],
): Uint8ClampedArray {
  const next = new Uint8ClampedArray(colorRgba);
  const filterSet = selectedArtifactIds ? new Set(selectedArtifactIds) : null;

  for (const pin of artifacts) {
    if (filterSet && !filterSet.has(pin.id)) continue;
    if (pin.kind === "unfilled-gap" && pin.suggestedFillRgba) {
      const [r, g, b, a] = pin.suggestedFillRgba;
      for (const idx of pin.pixelIndices) {
        const off = idx * 4;
        next[off] = r;
        next[off + 1] = g;
        next[off + 2] = b;
        next[off + 3] = a;
      }
    } else {
      for (const idx of pin.pixelIndices) {
        const off = idx * 4;
        next[off] = 0;
        next[off + 1] = 0;
        next[off + 2] = 0;
        next[off + 3] = 0;
      }
    }
  }
  return next;
}

/**
 * 4) 채색 빈틈 · 선 밖 넘침 · 지우개 잔여물 픽셀 헌터
 */
export function scanPixelArtifactsAndCleanup(input: PixelQaGridInput): PixelArtifactScanReport {
  const { width, height, lineArtMask, colorRgba } = input;
  const total = width * height;
  const alphaThreshold = input.alphaVisibleThreshold ?? 16;
  const whiteThreshold = input.whiteGapLumaThreshold ?? 248;
  const maxDustClusterSize = input.maxDustClusterSize ?? 6;

  const exteriorMask = input.interiorRegionMask
    ? Uint8Array.from({ length: total }, (_, i) =>
        input.interiorRegionMask?.[i] === 1 || lineArtMask[i] === 1 ? 0 : 1,
      )
    : computeExteriorMask(width, height, lineArtMask);

  const gapMask = new Uint8Array(total);
  const exteriorPaintMask = new Uint8Array(total);

  for (let i = 0; i < total; i += 1) {
    if (lineArtMask[i] === 1) continue;
    if (exteriorMask[i] === 0) {
      if (isNearWhiteOrEmpty(colorRgba, i, alphaThreshold, whiteThreshold)) gapMask[i] = 1;
    } else if (colorRgba[i * 4 + 3] >= alphaThreshold) {
      exteriorPaintMask[i] = 1;
    }
  }

  const artifacts: PixelArtifactPin[] = [];

  for (const cluster of collectConnectedComponents(gapMask, width, height)) {
    const geom = summarizeClusterGeometry(cluster, width, height);
    const fillSample = sampleSurroundingInteriorColor(
      cluster,
      width,
      height,
      lineArtMask,
      colorRgba,
      alphaThreshold,
      whiteThreshold,
    );
    artifacts.push({
      id: `px-gap-${artifacts.length + 1}`,
      kind: "unfilled-gap",
      labelKo: "채색 빈틈(흰 구멍)",
      pixelCount: cluster.length,
      ...geom,
      pixelIndices: cluster,
      suggestedFillRgba: fillSample,
      cleanupActionKo: `주변 밑색 샘플로 ${cluster.length}px 자동 메움`,
    });
  }

  for (const cluster of collectConnectedComponents(exteriorPaintMask, width, height)) {
    const geom = summarizeClusterGeometry(cluster, width, height);
    const nearLine = touchesLineArtWithinDistance(cluster, width, height, lineArtMask, 2);
    const isDust = !nearLine && cluster.length <= maxDustClusterSize;
    artifacts.push({
      id: isDust ? `px-dust-${artifacts.length + 1}` : `px-bleed-${artifacts.length + 1}`,
      kind: isDust ? "eraser-dust" : "color-bleed",
      labelKo: isDust ? "지우개 잔여물(고립 먼지)" : "선 밖 밑색 넘침",
      pixelCount: cluster.length,
      ...geom,
      pixelIndices: cluster,
      cleanupActionKo: isDust
        ? `외곽 고립 먼지 ${cluster.length}px 완전 지우기`
        : `선화 경계 밖 넘침 ${cluster.length}px 자동 클리핑 삭제`,
    });
  }

  const cleanedRgba = applyPixelArtifactCleanup(colorRgba, artifacts);
  return {
    cutId: input.cutId,
    cutNumber: input.cutNumber,
    width,
    height,
    artifacts,
    unfilledGapCount: artifacts.filter((a) => a.kind === "unfilled-gap").length,
    colorBleedCount: artifacts.filter((a) => a.kind === "color-bleed").length,
    eraserDustCount: artifacts.filter((a) => a.kind === "eraser-dust").length,
    totalAffectedPixels: artifacts.reduce((acc, item) => acc + item.pixelCount, 0),
    verdict: artifacts.length === 0 ? "CLEAN" : "NEEDS_CLEANUP",
    cleanedRgba,
  };
}

// ---------------------------------------------------------------------------
// 5. 7개국어 번역 말풍선 넘침 & 줄바꿈 자동 교정
// ---------------------------------------------------------------------------

const JA_LINE_START_FORBIDDEN = new Set(["、", "。", "！", "？", "）", "」", "』", "ー", "…", "・"]);
const THAI_COMBINING_MARK_RE = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/u;
const CJK_FULLWIDTH_RE = /[\u1100-\u11FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/u;

function measureTextWidthPx(text: string, fontSizePx: number, locale: SupportedQaLocale): number {
  const baseFactor = LOCALE_TYPOGRAPHY_PROFILES[locale].avgCharWidthEm;
  let widthEm = 0;
  for (const ch of text) {
    if (ch === " ") widthEm += 0.34;
    else if (THAI_COMBINING_MARK_RE.test(ch)) widthEm += 0;
    else if (CJK_FULLWIDTH_RE.test(ch)) widthEm += 0.98;
    else if (/[ilI.,'!|¡]/u.test(ch)) widthEm += 0.34;
    else if (/[mwMW@#%]/u.test(ch)) widthEm += 0.84;
    else widthEm += baseFactor;
  }
  return widthEm * fontSizePx;
}

function tokenizeThaiClusters(text: string): readonly string[] {
  const clusters: string[] = [];
  for (const ch of text) {
    if (THAI_COMBINING_MARK_RE.test(ch) && clusters.length > 0) {
      clusters[clusters.length - 1] = `${clusters[clusters.length - 1]}${ch}`;
    } else {
      clusters.push(ch);
    }
  }
  const tokens: string[] = [];
  let buf = "";
  let bufCount = 0;
  for (const cl of clusters) {
    if (cl === " ") {
      if (buf) tokens.push(buf);
      buf = "";
      bufCount = 0;
      continue;
    }
    buf += cl;
    bufCount += 1;
    if (bufCount >= 4 || /[!?.,]/u.test(cl)) {
      tokens.push(buf);
      buf = "";
      bufCount = 0;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

function wrapTextForLocale(
  text: string,
  maxWidthPx: number,
  fontSizePx: number,
  locale: SupportedQaLocale,
): { readonly lines: readonly string[]; readonly maxLineWidthPx: number; readonly hasOversizedWord: boolean } {
  const clean = text.trim().replace(/\s+/gu, " ");
  if (!clean) return { lines: [""], maxLineWidthPx: 0, hasOversizedWord: false };

  const profile = LOCALE_TYPOGRAPHY_PROFILES[locale];
  const lines: string[] = [];
  let hasOversizedWord = false;

  if (profile.wordSpaced) {
    const words = clean.split(" ").filter(Boolean);
    let currentLine = "";
    for (const word of words) {
      if (measureTextWidthPx(word, fontSizePx, locale) > maxWidthPx) hasOversizedWord = true;
      if (!currentLine) {
        currentLine = word;
        continue;
      }
      const candidate = `${currentLine} ${word}`;
      if (measureTextWidthPx(candidate, fontSizePx, locale) <= maxWidthPx) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  } else if (locale === "ja") {
    let currentLine = "";
    for (const ch of [...clean]) {
      const nextCandidate = `${currentLine}${ch}`;
      if (currentLine && measureTextWidthPx(nextCandidate, fontSizePx, locale) > maxWidthPx) {
        if (JA_LINE_START_FORBIDDEN.has(ch)) {
          lines.push(nextCandidate);
          currentLine = "";
        } else {
          lines.push(currentLine);
          currentLine = ch;
        }
      } else {
        currentLine = nextCandidate;
      }
    }
    if (currentLine) lines.push(currentLine);
  } else {
    const tokens = tokenizeThaiClusters(clean);
    let currentLine = "";
    for (const token of tokens) {
      if (measureTextWidthPx(token, fontSizePx, locale) > maxWidthPx) hasOversizedWord = true;
      if (!currentLine) {
        currentLine = token;
        continue;
      }
      const candidate = `${currentLine}${token}`;
      if (measureTextWidthPx(candidate, fontSizePx, locale) <= maxWidthPx) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = token;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  const maxLineWidthPx = lines.reduce(
    (maxW, line) => Math.max(maxW, measureTextWidthPx(line, fontSizePx, locale)),
    0,
  );
  return { lines, maxLineWidthPx, hasOversizedWord };
}

function shapeUsableWidthRatio(shape: BalloonShapeKind): number {
  if (shape === "oval") return 0.84;
  if (shape === "shout") return 0.78;
  return 1;
}

/**
 * 5) 7개국어 번역 말풍선 넘침 & 줄바꿈 자동 교정
 */
export function auditMultilingualBalloonOverflow(
  balloons: readonly MultilingualBalloonInput[],
): MultilingualBalloonAuditReport {
  const items: MultilingualBalloonAuditItem[] = balloons.map((balloon) => {
    const profile = LOCALE_TYPOGRAPHY_PROFILES[balloon.locale];
    const shape = balloon.shape ?? "oval";
    const originalPadding = balloon.paddingPx ?? 12;
    const minFont = balloon.minReadableFontSizePx ?? 10;
    const lineHeight = profile.defaultLineHeight;
    const usableRatio = shapeUsableWidthRatio(shape);

    const innerWidth = (pad: number) => Math.max(24, (balloon.boxWidthPx - pad * 2) * usableRatio);
    const innerHeight = (pad: number) => Math.max(20, balloon.boxHeightPx - pad * 2);

    const initialW = innerWidth(originalPadding);
    const initialH = innerHeight(originalPadding);
    const initialWrap = wrapTextForLocale(balloon.text, initialW, balloon.fontSizePx, balloon.locale);
    const initialTextHeight = initialWrap.lines.length * balloon.fontSizePx * lineHeight;
    const initialOverflowPx = Math.max(
      0,
      Math.round(Math.max(initialTextHeight - initialH, initialWrap.maxLineWidthPx - initialW)),
    );

    if (initialOverflowPx === 0 && !initialWrap.hasOversizedWord) {
      return {
        balloonId: balloon.balloonId,
        cutNumber: balloon.cutNumber,
        locale: balloon.locale,
        localeLabelKo: profile.labelKo,
        status: "FIT",
        originalFontSizePx: balloon.fontSizePx,
        recommendedFontSizePx: balloon.fontSizePx,
        originalPaddingPx: originalPadding,
        recommendedPaddingPx: originalPadding,
        recommendedLineHeight: lineHeight,
        originalLines: initialWrap.lines,
        correctedLines: initialWrap.lines,
        overflowBeforePx: 0,
        overflowAfterPx: 0,
        midWordBreakDetected: false,
        midWordBreakPrevented: false,
        recommendedBoxWidthPx: balloon.boxWidthPx,
        recommendedBoxHeightPx: balloon.boxHeightPx,
        localeNoteKo: profile.noteKo,
      };
    }

    let bestFont = balloon.fontSizePx;
    let bestPadding = originalPadding;
    let bestWrap = initialWrap;
    let bestOverflowPx = initialOverflowPx;
    let solved = false;
    const paddingCandidates =
      originalPadding > 6 ? [originalPadding, Math.max(6, originalPadding - 4)] : [originalPadding];

    for (const pad of paddingCandidates) {
      const availW = innerWidth(pad);
      const availH = innerHeight(pad);
      for (let size = balloon.fontSizePx; size >= minFont; size -= 0.5) {
        const wrapped = wrapTextForLocale(balloon.text, availW, size, balloon.locale);
        const textH = wrapped.lines.length * size * lineHeight;
        const overflow = Math.max(0, Math.round(Math.max(textH - availH, wrapped.maxLineWidthPx - availW)));
        if (overflow < bestOverflowPx || (overflow === 0 && !wrapped.hasOversizedWord)) {
          bestFont = Number(size.toFixed(1));
          bestPadding = pad;
          bestWrap = wrapped;
          bestOverflowPx = overflow;
        }
        if (overflow === 0 && !wrapped.hasOversizedWord) {
          solved = true;
          break;
        }
      }
      if (solved) break;
    }

    return {
      balloonId: balloon.balloonId,
      cutNumber: balloon.cutNumber,
      locale: balloon.locale,
      localeLabelKo: profile.labelKo,
      status: solved ? "AUTO_FIXED" : "EXPAND_BALLOON",
      originalFontSizePx: balloon.fontSizePx,
      recommendedFontSizePx: bestFont,
      originalPaddingPx: originalPadding,
      recommendedPaddingPx: bestPadding,
      recommendedLineHeight: lineHeight,
      originalLines: initialWrap.lines,
      correctedLines: bestWrap.lines,
      overflowBeforePx: initialOverflowPx,
      overflowAfterPx: bestOverflowPx,
      midWordBreakDetected: initialWrap.hasOversizedWord,
      midWordBreakPrevented: initialWrap.hasOversizedWord && !bestWrap.hasOversizedWord,
      recommendedBoxWidthPx: Math.max(
        balloon.boxWidthPx,
        Math.ceil(bestWrap.maxLineWidthPx / usableRatio + bestPadding * 2 + 4),
      ),
      recommendedBoxHeightPx: Math.max(
        balloon.boxHeightPx,
        Math.ceil(bestWrap.lines.length * bestFont * lineHeight + bestPadding * 2 + 4),
      ),
      localeNoteKo: profile.noteKo,
    };
  });

  return {
    totalBalloons: items.length,
    fitCount: items.filter((item) => item.status === "FIT").length,
    autoFixedCount: items.filter((item) => item.status === "AUTO_FIXED").length,
    expandRequiredCount: items.filter((item) => item.status === "EXPAND_BALLOON").length,
    items,
  };
}

// ---------------------------------------------------------------------------
// 6. 출판 전 폰트 · 3D · 브러시 상업 라이선스 차단 게이트 (Fail-Closed)
// ---------------------------------------------------------------------------

function isIsoDateExpired(expiresAtIso: string | undefined, checkDateIso: string): boolean {
  if (!expiresAtIso) return false;
  return expiresAtIso.slice(0, 10) < checkDateIso.slice(0, 10);
}

/**
 * 6) 출판 전 폰트·3D·브러시 상업 라이선스 Fail-Closed 차단 게이트
 */
export function verifyCommercialRightsGate(
  input: CommercialRightsGateInput,
): CommercialRightsGateReport {
  const violations: CommercialRightsViolation[] = [];
  const blockedCuts = new Set<number>();

  for (const asset of input.usedAssets) {
    if (asset.usedInCuts.length === 0) continue;

    let failureReasonCode: CommercialRightsViolation["failureReasonCode"] | null = null;
    let reasonKo = "";

    if (asset.licenseStatus === "non-commercial" || asset.licenseStatus === "personal-only") {
      failureReasonCode = "NON_COMMERCIAL_FORBIDDEN";
      reasonKo = `'${asset.assetName}'은(는) 비상업/개인용 전용(${asset.licenseStatus}) 라이선스로 유료 연재 및 상업 출판에 사용할 수 없습니다.`;
    } else if (asset.licenseStatus === "unverified") {
      failureReasonCode = "UNVERIFIED_LICENSE";
      reasonKo = `'${asset.assetName}'의 상업 이용 증빙이 확인되지 않아 Fail-Closed 정책으로 출판이 차단되었습니다.`;
    } else if (
      asset.licenseStatus === "expired" ||
      isIsoDateExpired(asset.expiresAtIso, input.checkDateIso)
    ) {
      failureReasonCode = "LICENSE_EXPIRED";
      reasonKo = `'${asset.assetName}'의 상업 라이선스 유효기간(${asset.expiresAtIso ?? "만료"})이 기준일(${input.checkDateIso}) 이전으로 만료되었습니다.`;
    }

    if (failureReasonCode) {
      for (const cutNo of asset.usedInCuts) blockedCuts.add(cutNo);
      violations.push({
        assetId: asset.assetId,
        assetName: asset.assetName,
        assetKind: asset.assetKind,
        usedInCuts: [...asset.usedInCuts].sort((a, b) => a - b),
        failureReasonCode,
        reasonKo,
        recommendedAlternatives: VERIFIED_SAFE_ALTERNATIVES.filter(
          (alt) => alt.assetKind === asset.assetKind,
        ),
      });
    }
  }

  return {
    episodeId: input.episodeId,
    checkDateIso: input.checkDateIso,
    verdict: violations.length > 0 ? "BLOCKED" : "PASS",
    canPublish: violations.length === 0,
    totalAssetsChecked: input.usedAssets.length,
    verifiedCount: input.usedAssets.length - violations.length,
    blockedCount: violations.length,
    blockedCutNumbers: [...blockedCuts].sort((a, b) => a - b),
    violations,
  };
}

/**
 * 차단된 라이선스 에셋을 검증된 CC0/상업 무료 대체 소재로 1클릭 교체한다.
 */
export function replaceBlockedAssetWithSafeAlternative(
  assets: readonly EpisodeAssetUsage[],
  assetId: string,
  alternativeId: string,
): readonly EpisodeAssetUsage[] {
  const alt = VERIFIED_SAFE_ALTERNATIVES.find((item) => item.alternativeId === alternativeId);
  if (!alt) return assets;
  return assets.map((asset) =>
    asset.assetId !== assetId
      ? asset
      : {
          ...asset,
          assetName: alt.name,
          licenseStatus: alt.licenseBadge === "CC0" ? "cc0" : "commercial-verified",
          licenseProvider: `${alt.provider} (${alt.licenseBadge})`,
          expiresAtIso: undefined,
        },
  );
}

// ---------------------------------------------------------------------------
// 7. PD/AD 음성 피드백 → 컷 자동 핀 + 수정 전/후 와이프 비교 승인
// ---------------------------------------------------------------------------

function extractCutNumber(transcript: string, fallbackCutNumber: number): number {
  const cutPatterns: readonly RegExp[] = [
    /(\d{1,4})\s*(?:번째\s*컷|번\s*컷|컷)/u,
    /(?:컷|cut|c|#)\s*(\d{1,4})/iu,
  ];
  for (const pattern of cutPatterns) {
    const matched = transcript.match(pattern);
    if (matched?.[1]) {
      const parsed = Number.parseInt(matched[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return fallbackCutNumber;
}

/**
 * 7) PD/AD 음성·텍스트 피드백에서 컷 번호·부위·좌표 핀 티켓을 자동 생성한다.
 */
export function parseVoiceQaFeedbackToPin(input: {
  readonly transcript: string;
  readonly speakerRole?: "PD" | "AD" | "작가";
  readonly fallbackCutNumber?: number;
  readonly ticketSeq?: number;
}): VoiceQaFeedbackPinTicket {
  const cleaned = input.transcript.trim();
  const cutNumber = extractCutNumber(cleaned, input.fallbackCutNumber ?? 1);
  const matchedRegion = REGION_ANCHOR_RULES.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(cleaned)),
  );
  const targetRegion: VoicePinTargetRegion = matchedRegion?.region ?? "center";
  const regionLabelKo = matchedRegion?.labelKo ?? "컷 중앙";
  const pinXNorm = matchedRegion?.xNorm ?? 0.5;
  const pinYNorm = matchedRegion?.yNorm ?? 0.5;
  const targetSubjectKo = SUBJECT_KEYWORDS.find((kw) => cleaned.includes(kw)) ?? "주요 피사체";
  const instructionKo =
    cleaned
      .replace(/^\d{1,4}\s*화\s*/u, "")
      .replace(/^(\d{1,4}\s*(?:번째\s*컷|번\s*컷|컷)|(?:컷|cut|c|#)\s*\d{1,4})\s*/iu, "")
      .trim() || cleaned;

  let priority: VoicePinPriority = "normal";
  if (/긴급|당장|필수|심의|차단|상표|모자이크/u.test(cleaned)) priority = "urgent";
  else if (/날카롭게|수정|교정|맞춰|강조|다시/u.test(cleaned)) priority = "high";

  const role = input.speakerRole ?? "PD";
  return {
    ticketId: `vpin-c${cutNumber}-${input.ticketSeq ?? 1}`,
    cutNumber,
    speakerRole: role,
    rawTranscript: cleaned,
    targetSubjectKo,
    targetRegion,
    regionLabelKo,
    instructionKo,
    priority,
    pinXNorm,
    pinYNorm,
    status: "open",
    wipePositionPct: 50,
    beforeSummaryKo: `${cutNumber}컷 수정 전 원고 (${regionLabelKo} 원본 상태)`,
    afterSummaryKo: "수정안 업로드 대기 중",
    reviewNoteKo: "",
    auditTrailKo: [`${role} 음성 피드백 수신 → ${cutNumber}컷 (${regionLabelKo}) 자동 핀 생성`],
  };
}

/**
 * 수정 전/후 와이프 비교 슬라이더 & 승인 상태 전이 머신
 */
export function transitionVoicePinApproval(
  ticket: VoiceQaFeedbackPinTicket,
  action: VoicePinTransitionAction,
): VoiceQaFeedbackPinTicket {
  switch (action.type) {
    case "set-wipe":
      return { ...ticket, wipePositionPct: Math.max(0, Math.min(100, Math.round(action.wipePositionPct))) };
    case "submit-fix": {
      const summary = action.afterSummaryKo.trim() || `${ticket.cutNumber}컷 수정본 반영 완료`;
      return {
        ...ticket,
        status: "in-review",
        afterSummaryKo: summary,
        auditTrailKo: [...ticket.auditTrailKo, `수정본 제출: ${summary} (Before/After 와이프 비교 대기)`],
      };
    }
    case "approve": {
      const note = action.noteKo?.trim() || "와이프 비교 확인 완료 · 최종 승인";
      return {
        ...ticket,
        status: "approved",
        reviewNoteKo: note,
        auditTrailKo: [...ticket.auditTrailKo, `${action.reviewerName} 최종 승인: ${note}`],
      };
    }
    case "request-revision": {
      const note = action.noteKo.trim() || "세부 보강 필요";
      return {
        ...ticket,
        status: "revision-requested",
        reviewNoteKo: note,
        auditTrailKo: [...ticket.auditTrailKo, `${action.reviewerName} 재수정 요청: ${note}`],
      };
    }
  }
}
