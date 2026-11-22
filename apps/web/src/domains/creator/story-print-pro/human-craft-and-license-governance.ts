/**
 * 직접 작화 검증 배지(Verified Human Craft) & Rights BOM 라이선스 거버넌스 엔진 (₩0 온디바이스).
 *
 * - 외부 전송 없이 온디바이스 스트로크 이력 연쇄 SHA-256 해시 + 타임랩스 연속성 검증
 * - Rights BOM 자산별 상업/2차저작/귀속/대여 만료 자동 태깅
 * - 단일 문자 변조도 즉시 탐지하는 검증 영수증(HumanCraftVerificationReceipt) 발급 및 재검증
 */

export type StrokeToolKind = "pen" | "brush" | "eraser" | "vector" | "fill";

export interface OnDeviceStrokeSample {
  readonly strokeId: string;
  readonly timestampMs: number;
  readonly durationMs: number;
  readonly pointCount: number;
  readonly pressureVariance: number;
  readonly tiltVariance: number;
  readonly toolKind: StrokeToolKind;
  readonly layerId: string;
  readonly isUndoReverted?: boolean;
}

export interface TimelapseCheckpointFrame {
  readonly frameIndex: number;
  readonly capturedAtMs: number;
  readonly strokeCountAtFrame: number;
  readonly frameHashSha256: string;
}

export type RightsLicenseCode =
  | "CC0"
  | "CC-BY"
  | "CC-BY-SA"
  | "CC-BY-NC"
  | "COMMERCIAL-PERPETUAL"
  | "COMMERCIAL-RENTAL"
  | "EDITORIAL-ONLY"
  | "UNKNOWN";

export type RightsGovernanceTag =
  | "COMMERCIAL_OK"
  | "NON_COMMERCIAL_BLOCK"
  | "DERIVATIVE_OK"
  | "NO_DERIVATIVES_WARN"
  | "ATTRIBUTION_REQUIRED"
  | "RENTAL_ACTIVE"
  | "RENTAL_EXPIRING_SOON"
  | "RENTAL_EXPIRED_BLOCK"
  | "UNVERIFIED_LICENSE_BLOCK";

export interface RightsBomAssetInput {
  readonly assetId: string;
  readonly name: string;
  readonly category: "3d-bg" | "brush" | "font" | "texture" | "sfx" | "reference";
  readonly licenseCode: RightsLicenseCode;
  readonly commercialAllowed: boolean;
  readonly derivativesAllowed: boolean;
  readonly attributionRequired: boolean;
  readonly attributionText?: string;
  readonly rentalStartsAtIso?: string;
  readonly rentalExpiresAtIso?: string;
  readonly sourceUrl?: string;
}

export interface EvaluatedRightsBomAsset {
  readonly assetId: string;
  readonly name: string;
  readonly category: RightsBomAssetInput["category"];
  readonly licenseCode: RightsLicenseCode;
  readonly tags: readonly RightsGovernanceTag[];
  readonly commercialPublishAllowed: boolean;
  readonly daysUntilRentalExpiry: number | null;
  readonly attributionNotice: string | null;
}

export interface RightsBomGovernanceSummary {
  readonly evaluatedAtIso: string;
  readonly totalAssets: number;
  readonly commercialPublishReady: boolean;
  readonly blockingAssetIds: readonly string[];
  readonly expiringSoonAssetIds: readonly string[];
  readonly requiredAttributions: readonly string[];
  readonly assets: readonly EvaluatedRightsBomAsset[];
  readonly rightsBomSha256: string;
}

export interface StrokeHistoryDigestSummary {
  readonly totalStrokes: number;
  readonly effectiveStrokes: number;
  readonly totalPoints: number;
  readonly activeDrawingDurationMs: number;
  readonly meanPressureVariance: number;
  readonly uniqueLayerCount: number;
  readonly undoRatio: number;
  readonly strokeChainSha256: string;
}

export interface TimelapseEvidenceSummary {
  readonly frameCount: number;
  readonly isMonotonic: boolean;
  readonly coversFinalStrokeCount: boolean;
  readonly coverageRatio: number;
  readonly timelapseChainSha256: string;
}

export type HumanCraftBadgeStatus =
  | "verified-human-craft"
  | "partial-evidence"
  | "unverified";

export interface HumanCraftReceiptInput {
  readonly workId: string;
  readonly episodeId: string;
  readonly creatorHandle: string;
  readonly issuedAtIso: string;
  readonly strokes: readonly OnDeviceStrokeSample[];
  readonly timelapseFrames: readonly TimelapseCheckpointFrame[];
  readonly rightsBomAssets: readonly RightsBomAssetInput[];
  readonly hasUnattributedGenerativeLayer?: boolean;
  readonly rentalWarningWindowDays?: number;
}

export interface HumanCraftReceiptPayload {
  readonly schemaVersion: "toonstudio.human-craft.v1";
  readonly receiptId: string;
  readonly issuedAtIso: string;
  readonly workId: string;
  readonly episodeId: string;
  readonly creatorHandle: string;
  readonly badgeStatus: HumanCraftBadgeStatus;
  readonly badgeLabelKo: string;
  readonly badgeLabelEn: string;
  readonly qualificationNotesKo: readonly string[];
  readonly strokeSummary: StrokeHistoryDigestSummary;
  readonly timelapseEvidence: TimelapseEvidenceSummary;
  readonly rightsBomSummary: RightsBomGovernanceSummary;
}

export interface HumanCraftVerificationReceipt extends HumanCraftReceiptPayload {
  readonly receiptSha256: string;
}

export interface HumanCraftReceiptVerificationResult {
  readonly valid: boolean;
  readonly tamperReasons: readonly string[];
  readonly recomputedSha256: string;
}

const MIN_VERIFIED_EFFECTIVE_STROKES = 20;
const MIN_VERIFIED_DRAWING_DURATION_MS = 30_000;
const MIN_VERIFIED_TIMELAPSE_FRAMES = 3;
const DEFAULT_RENTAL_WARNING_DAYS = 14;
const MS_PER_DAY = 86_400_000;

// FIPS 180-4 SHA-256 표준 초기 해시값과 라운드 상수
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const TEXT_ENCODER = new TextEncoder();

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * 순수 동기식 FIPS 180-4 SHA-256 해시 (브라우저·Worker·Node·JSDOM 100% 동일 출력).
 */
export function sha256Hex(message: string): string {
  const bytes = TEXT_ENCODER.encode(message);
  const bitLenHi = Math.floor(bytes.length / 0x20000000);
  const bitLenLo = (bytes.length << 3) >>> 0;

  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLenHi, false);
  view.setUint32(paddedLength - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

/**
 * 객체 키 순서를 재귀 정렬한 정규화 JSON 문자열(해시 결정성 보장).
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`).join(",")}}`;
  }
  return "null";
}

function roundTo4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * 온디바이스 스트로크 이력을 집계하고 연쇄 SHA-256 다이제스트를 생성한다.
 */
export function summarizeStrokeHistory(strokes: readonly OnDeviceStrokeSample[]): StrokeHistoryDigestSummary {
  let chainDigest = sha256Hex("toonstudio:stroke-chain:genesis:v1");
  let effectiveStrokes = 0;
  let totalPoints = 0;
  let activeDrawingDurationMs = 0;
  let pressureVarianceSum = 0;
  const layerIds = new Set<string>();

  for (const stroke of strokes) {
    const reverted = stroke.isUndoReverted === true;
    const durationMs = Math.max(0, Math.round(stroke.durationMs));
    const pointCount = Math.max(0, Math.round(stroke.pointCount));
    const pressureVariance = Math.max(0, stroke.pressureVariance);

    if (!reverted) {
      effectiveStrokes += 1;
      totalPoints += pointCount;
      activeDrawingDurationMs += durationMs;
      pressureVarianceSum += pressureVariance;
      layerIds.add(stroke.layerId);
    }

    const recordPayload = canonicalJsonStringify({
      prev: chainDigest,
      strokeId: stroke.strokeId,
      timestampMs: Math.round(stroke.timestampMs),
      durationMs,
      pointCount,
      pressureVariance: roundTo4(pressureVariance),
      tiltVariance: roundTo4(Math.max(0, stroke.tiltVariance)),
      toolKind: stroke.toolKind,
      layerId: stroke.layerId,
      isUndoReverted: reverted,
    });
    chainDigest = sha256Hex(recordPayload);
  }

  const totalStrokes = strokes.length;
  const revertedCount = totalStrokes - effectiveStrokes;

  return {
    totalStrokes,
    effectiveStrokes,
    totalPoints,
    activeDrawingDurationMs,
    meanPressureVariance: effectiveStrokes > 0 ? roundTo4(pressureVarianceSum / effectiveStrokes) : 0,
    uniqueLayerCount: layerIds.size,
    undoRatio: totalStrokes > 0 ? roundTo4(revertedCount / totalStrokes) : 0,
    strokeChainSha256: chainDigest,
  };
}

/**
 * 타임랩스 체크포인트 프레임들의 시간·스트로크 단조 증가성과 연쇄 SHA-256을 검증한다.
 */
export function summarizeTimelapseEvidence(
  frames: readonly TimelapseCheckpointFrame[],
  expectedFinalStrokeCount: number,
): TimelapseEvidenceSummary {
  let chainDigest = sha256Hex("toonstudio:timelapse-chain:genesis:v1");
  let isMonotonic = frames.length > 0;
  let prevFrameIndex = -1;
  let prevCapturedAtMs = -1;
  let prevStrokeCount = -1;

  for (const frame of frames) {
    if (
      frame.frameIndex <= prevFrameIndex
      || frame.capturedAtMs < prevCapturedAtMs
      || frame.strokeCountAtFrame < prevStrokeCount
    ) {
      isMonotonic = false;
    }
    prevFrameIndex = frame.frameIndex;
    prevCapturedAtMs = frame.capturedAtMs;
    prevStrokeCount = frame.strokeCountAtFrame;

    chainDigest = sha256Hex(canonicalJsonStringify({
      prev: chainDigest,
      frameIndex: frame.frameIndex,
      capturedAtMs: frame.capturedAtMs,
      strokeCountAtFrame: frame.strokeCountAtFrame,
      frameHashSha256: frame.frameHashSha256,
    }));
  }

  const lastFrame = frames[frames.length - 1];
  const lastCoveredStrokes = lastFrame ? lastFrame.strokeCountAtFrame : 0;
  const coverageRatio = expectedFinalStrokeCount > 0
    ? roundTo4(Math.min(1, lastCoveredStrokes / expectedFinalStrokeCount))
    : frames.length > 0
      ? 1
      : 0;
  const coversFinalStrokeCount = expectedFinalStrokeCount === 0
    ? frames.length > 0
    : lastCoveredStrokes >= Math.floor(expectedFinalStrokeCount * 0.9);

  return {
    frameCount: frames.length,
    isMonotonic,
    coversFinalStrokeCount,
    coverageRatio,
    timelapseChainSha256: chainDigest,
  };
}

function parseIsoMs(iso?: string): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rights BOM 자산별 상업·2차저작·귀속·대여 만료 범위를 결정적으로 자동 태깅한다.
 */
export function evaluateRightsBomGovernance(
  assets: readonly RightsBomAssetInput[],
  evaluatedAtIso: string,
  rentalWarningWindowDays = DEFAULT_RENTAL_WARNING_DAYS,
): RightsBomGovernanceSummary {
  const nowMs = parseIsoMs(evaluatedAtIso) ?? 0;
  const sortedAssets = [...assets].sort((a, b) => a.assetId.localeCompare(b.assetId));

  const evaluatedAssets: EvaluatedRightsBomAsset[] = [];
  const blockingAssetIds: string[] = [];
  const expiringSoonAssetIds: string[] = [];
  const requiredAttributions: string[] = [];

  for (const asset of sortedAssets) {
    const tags: RightsGovernanceTag[] = [];
    let blocked = false;
    let daysUntilRentalExpiry: number | null = null;

    if (asset.licenseCode === "UNKNOWN") {
      tags.push("UNVERIFIED_LICENSE_BLOCK");
      blocked = true;
    } else if (!asset.commercialAllowed || asset.licenseCode === "CC-BY-NC" || asset.licenseCode === "EDITORIAL-ONLY") {
      tags.push("NON_COMMERCIAL_BLOCK");
      blocked = true;
    } else {
      tags.push("COMMERCIAL_OK");
    }

    if (asset.derivativesAllowed) {
      tags.push("DERIVATIVE_OK");
    } else {
      tags.push("NO_DERIVATIVES_WARN");
    }

    let attributionNotice: string | null = null;
    if (asset.attributionRequired || asset.licenseCode === "CC-BY" || asset.licenseCode === "CC-BY-SA") {
      tags.push("ATTRIBUTION_REQUIRED");
      attributionNotice = (asset.attributionText?.trim())
        || `${asset.name} (${asset.licenseCode})`;
      requiredAttributions.push(attributionNotice);
    }

    if (asset.licenseCode === "COMMERCIAL-RENTAL" || asset.rentalExpiresAtIso) {
      const expiresMs = parseIsoMs(asset.rentalExpiresAtIso);
      const startsMs = parseIsoMs(asset.rentalStartsAtIso);
      if (expiresMs === null) {
        tags.push("UNVERIFIED_LICENSE_BLOCK");
        blocked = true;
      } else {
        daysUntilRentalExpiry = Math.floor((expiresMs - nowMs) / MS_PER_DAY);
        if (expiresMs < nowMs || (startsMs !== null && startsMs > nowMs)) {
          tags.push("RENTAL_EXPIRED_BLOCK");
          blocked = true;
        } else if (daysUntilRentalExpiry <= rentalWarningWindowDays) {
          tags.push("RENTAL_ACTIVE", "RENTAL_EXPIRING_SOON");
          expiringSoonAssetIds.push(asset.assetId);
        } else {
          tags.push("RENTAL_ACTIVE");
        }
      }
    }

    if (blocked) blockingAssetIds.push(asset.assetId);

    evaluatedAssets.push({
      assetId: asset.assetId,
      name: asset.name,
      category: asset.category,
      licenseCode: asset.licenseCode,
      tags,
      commercialPublishAllowed: !blocked,
      daysUntilRentalExpiry,
      attributionNotice,
    });
  }

  const rightsBomSha256 = sha256Hex(canonicalJsonStringify({
    evaluatedAtIso,
    assets: evaluatedAssets,
  }));

  return {
    evaluatedAtIso,
    totalAssets: evaluatedAssets.length,
    commercialPublishReady: blockingAssetIds.length === 0,
    blockingAssetIds,
    expiringSoonAssetIds,
    requiredAttributions,
    assets: evaluatedAssets,
    rightsBomSha256,
  };
}

/**
 * 스트로크 해시·타임랩스 증거·Rights BOM 거버넌스를 통합해 "직접 작화 검증 배지" 영수증을 발급한다.
 */
export function issueHumanCraftReceipt(input: HumanCraftReceiptInput): HumanCraftVerificationReceipt {
  const strokeSummary = summarizeStrokeHistory(input.strokes);
  const timelapseEvidence = summarizeTimelapseEvidence(input.timelapseFrames, strokeSummary.totalStrokes);
  const rightsBomSummary = evaluateRightsBomGovernance(
    input.rightsBomAssets,
    input.issuedAtIso,
    input.rentalWarningWindowDays ?? DEFAULT_RENTAL_WARNING_DAYS,
  );

  const notes: string[] = [];
  const hasStrongStrokes =
    strokeSummary.effectiveStrokes >= MIN_VERIFIED_EFFECTIVE_STROKES
    && strokeSummary.activeDrawingDurationMs >= MIN_VERIFIED_DRAWING_DURATION_MS
    && strokeSummary.meanPressureVariance > 0.005;
  const hasValidTimelapse =
    timelapseEvidence.frameCount >= MIN_VERIFIED_TIMELAPSE_FRAMES
    && timelapseEvidence.isMonotonic
    && timelapseEvidence.coversFinalStrokeCount;
  const hasUnattributedAi = input.hasUnattributedGenerativeLayer === true;

  if (!hasStrongStrokes) {
    notes.push("직접 작화 스트로크 수·필압 분산 또는 활성 작화 시간이 검증 기준에 미달합니다.");
  }
  if (!hasValidTimelapse) {
    notes.push("타임랩스 체크포인트 프레임이 부족하거나 단조 연속성이 끊어져 있습니다.");
  }
  if (hasUnattributedAi) {
    notes.push("미고지 생성형 AI 레이어가 감지되어 직접 작화 검증 배지를 발급할 수 없습니다.");
  }
  if (!rightsBomSummary.commercialPublishReady) {
    notes.push(`Rights BOM 차단 자산 ${rightsBomSummary.blockingAssetIds.length}건(비상업·만료·미확인 라이선스)이 존재합니다.`);
  }
  if (rightsBomSummary.expiringSoonAssetIds.length > 0) {
    notes.push(`대여 라이선스 만료 임박 자산 ${rightsBomSummary.expiringSoonAssetIds.length}건이 있습니다.`);
  }

  let badgeStatus: HumanCraftBadgeStatus;
  if (hasStrongStrokes && hasValidTimelapse && !hasUnattributedAi && rightsBomSummary.commercialPublishReady) {
    badgeStatus = "verified-human-craft";
    notes.push("온디바이스 스트로크 연쇄 해시·타임랩스·Rights BOM 상업 라이선스 검증을 모두 통과했습니다.");
  } else if (
    strokeSummary.effectiveStrokes > 0
    && !hasUnattributedAi
    && rightsBomSummary.commercialPublishReady
  ) {
    badgeStatus = "partial-evidence";
  } else {
    badgeStatus = "unverified";
  }

  const badgeLabels: Readonly<Record<HumanCraftBadgeStatus, { ko: string; en: string }>> = {
    "verified-human-craft": { ko: "직접 작화 검증 배지", en: "Verified Human Craft" },
    "partial-evidence": { ko: "직접 작화 부분 증거", en: "Partial Craft Evidence" },
    unverified: { ko: "미검증 원고", en: "Unverified Manuscript" },
  };

  const receiptSeed = sha256Hex(canonicalJsonStringify({
    workId: input.workId,
    episodeId: input.episodeId,
    issuedAtIso: input.issuedAtIso,
    strokeChainSha256: strokeSummary.strokeChainSha256,
    rightsBomSha256: rightsBomSummary.rightsBomSha256,
  }));

  const payload: HumanCraftReceiptPayload = {
    schemaVersion: "toonstudio.human-craft.v1",
    receiptId: `vhc-${receiptSeed.slice(0, 16)}`,
    issuedAtIso: input.issuedAtIso,
    workId: input.workId,
    episodeId: input.episodeId,
    creatorHandle: input.creatorHandle,
    badgeStatus,
    badgeLabelKo: badgeLabels[badgeStatus].ko,
    badgeLabelEn: badgeLabels[badgeStatus].en,
    qualificationNotesKo: notes,
    strokeSummary,
    timelapseEvidence,
    rightsBomSummary,
  };

  const receiptSha256 = sha256Hex(canonicalJsonStringify(payload));

  return {
    ...payload,
    receiptSha256,
  };
}

/**
 * 발급된 직접 작화 검증 영수증의 SHA-256 무결성과 선택적 원본 증거 일치 여부를 검증한다.
 */
export function verifyHumanCraftReceipt(
  receipt: HumanCraftVerificationReceipt,
  liveEvidence?: {
    readonly strokes?: readonly OnDeviceStrokeSample[];
    readonly timelapseFrames?: readonly TimelapseCheckpointFrame[];
    readonly rightsBomAssets?: readonly RightsBomAssetInput[];
  },
): HumanCraftReceiptVerificationResult {
  const { receiptSha256, ...payload } = receipt;
  const recomputedSha256 = sha256Hex(canonicalJsonStringify(payload));
  const tamperReasons: string[] = [];

  if (recomputedSha256 !== receiptSha256) {
    tamperReasons.push("RECEIPT_DIGEST_MISMATCH: 영수증 본문이 발급 이후 변조되었습니다.");
  }

  if (liveEvidence?.strokes) {
    const recomputedStrokes = summarizeStrokeHistory(liveEvidence.strokes);
    if (recomputedStrokes.strokeChainSha256 !== receipt.strokeSummary.strokeChainSha256) {
      tamperReasons.push("STROKE_CHAIN_MISMATCH: 제출된 스트로크 이력이 영수증 해시와 일치하지 않습니다.");
    }
  }

  if (liveEvidence?.timelapseFrames) {
    const recomputedTimelapse = summarizeTimelapseEvidence(
      liveEvidence.timelapseFrames,
      receipt.strokeSummary.totalStrokes,
    );
    if (recomputedTimelapse.timelapseChainSha256 !== receipt.timelapseEvidence.timelapseChainSha256) {
      tamperReasons.push("TIMELAPSE_CHAIN_MISMATCH: 타임랩스 프레임 해시 체인이 일치하지 않습니다.");
    }
  }

  if (liveEvidence?.rightsBomAssets) {
    const recomputedBom = evaluateRightsBomGovernance(
      liveEvidence.rightsBomAssets,
      receipt.rightsBomSummary.evaluatedAtIso,
    );
    if (recomputedBom.rightsBomSha256 !== receipt.rightsBomSummary.rightsBomSha256) {
      tamperReasons.push("RIGHTS_BOM_MISMATCH: Rights BOM 라이선스 목록이 영수증 해시와 일치하지 않습니다.");
    }
  }

  return {
    valid: tamperReasons.length === 0,
    tamperReasons,
    recomputedSha256,
  };
}
