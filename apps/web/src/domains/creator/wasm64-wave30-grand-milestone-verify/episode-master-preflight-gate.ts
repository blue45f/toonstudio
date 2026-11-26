/**
 * 36항목 옴니채널 회차 마스터 출고 프리플라이트 게이트
 * (웹툰 포털 · 단행본 CMYK · 오디오툰 · 접근성 · Rights BOM · 개인정보 제로 유출).
 *
 * - 6개 핵심 범주 × 각 6개 결정론적 검사 = 총 36개 출고 심사를 수행한다.
 * - 다항 시간 백트래킹 정규식을 일절 사용하지 않고 선형 시간(`O(n)`) 문자 스캐너와
 *   순수 수치·집합 검증만으로 개인정보·시크릿 유출을 판별한다.
 * - 결과 요약과 출고 준비 지문(32비트 FNV-1a 및 FIPS 180-4 SHA-256)을 결정론적으로 생성한다.
 */

export const PREFLIGHT_CATEGORIES = Object.freeze([
  "portal-slice-geometry",
  "print-cmyk-bleed",
  "audio-lufs-truepeak",
  "a11y-cvd-photosensitive",
  "rights-bom-provenance",
  "pii-zero-leak",
] as const);
export type PreflightCategoryId = (typeof PREFLIGHT_CATEGORIES)[number];

export const PREFLIGHT_SEVERITIES = Object.freeze(["pass", "warn", "block"] as const);
export type PreflightSeverity = (typeof PREFLIGHT_SEVERITIES)[number];

export const PREFLIGHT_CHECKS_PER_CATEGORY = 6 as const;
export const PREFLIGHT_TOTAL_CHECKS = 36 as const;
export const PRINT_TAC_BLOCK_CEILING_PERCENT = 300 as const;
export const AUDIO_TRUE_PEAK_BLOCK_CEILING_DBTP = -1.0 as const;

export interface PortalSliceGeometryInput {
  readonly canvasWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly minBalloonSliceClearancePx: number;
  readonly maxSliceBytes: number;
  readonly minGutterHeightPx: number;
  readonly thumbnailSafeZoneRatio: number;
}

export interface PrintCmykBleedInput {
  readonly maxTacPercent: number;
  readonly bleedMm: number;
  readonly innerSafeMarginMm: number;
  readonly minEffectiveDpi: number;
  readonly smallTextRichBlackCount: number;
  readonly spineGutterSafeMm: number;
}

export interface AudioLufsTruePeakInput {
  readonly integratedLufs: number;
  readonly truePeakDbtp: number;
  readonly loudnessRangeLu: number;
  readonly dialogueToBgmMarginDb: number;
  readonly absDcOffset: number;
  readonly clippedSampleCount: number;
  readonly maxCueSyncDriftMs: number;
}

export interface A11yCvdPhotosensitiveInput {
  readonly maxFlashHz: number;
  readonly minBalloonContrastRatio: number;
  readonly minCvdDeltaE: number;
  readonly minFontSizePx: number;
  readonly missingAltCutCount: number;
  readonly readingOrderCycleCount: number;
  readonly maxCameraRollDeg: number;
  readonly reducedMotionHonored: boolean;
}

export type FontCommercialLicenseState = "commercial-verified" | "trial-restricted" | "unlicensed";

export interface FontLicenseRecord {
  readonly fontFamily: string;
  readonly licenseState: FontCommercialLicenseState;
}

export interface RightsBomProvenanceInput {
  readonly fonts: readonly FontLicenseRecord[];
  readonly unlicensedAssetIds: readonly string[];
  readonly unattributedAssetCount: number;
  readonly unlicensedAudioStemIds: readonly string[];
  readonly territoryRestrictedStemCount: number;
  readonly provenanceSignatureValid: boolean;
  readonly manifestHashMatched: boolean;
  readonly signatureExpiresSoon?: boolean;
  readonly unresolvedSplitDisputeCount: number;
  readonly pendingCollaboratorAckCount: number;
  readonly unclearedTrademarkCount: number;
  readonly parodyReviewTrademarkCount?: number;
}

export interface PiiZeroLeakInput {
  readonly metadataFields: readonly string[];
  readonly exifGpsCoordinateCount: number;
  readonly coarseLocationHintCount?: number;
  readonly unscrubbedHiddenMemoCount: number;
  readonly emptyHiddenDraftLayerCount?: number;
}

export interface EpisodeMasterPreflightInput {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly portal: PortalSliceGeometryInput;
  readonly print: PrintCmykBleedInput;
  readonly audio: AudioLufsTruePeakInput;
  readonly a11y: A11yCvdPhotosensitiveInput;
  readonly rightsBom: RightsBomProvenanceInput;
  readonly pii: PiiZeroLeakInput;
}

export interface PreflightCheckResult {
  readonly checkId: string;
  readonly category: PreflightCategoryId;
  readonly checkIndexInCategory: number;
  readonly globalCheckIndex: number;
  readonly titleKo: string;
  readonly severity: PreflightSeverity;
  readonly measuredSummaryKo: string;
  readonly blockingReasonKo: string | null;
  readonly remediationHintKo: string | null;
}

export interface PreflightCategorySummary {
  readonly category: PreflightCategoryId;
  readonly labelKo: string;
  readonly totalChecks: typeof PREFLIGHT_CHECKS_PER_CATEGORY;
  readonly passedCount: number;
  readonly warningCount: number;
  readonly blockedCount: number;
  readonly categorySeverity: PreflightSeverity;
}

export interface EpisodeMasterPreflightReport {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly totalChecks: typeof PREFLIGHT_TOTAL_CHECKS;
  readonly passedCount: number;
  readonly warningCount: number;
  readonly blockedCount: number;
  readonly overallSeverity: PreflightSeverity;
  readonly canPublishMaster: boolean;
  readonly checks: readonly PreflightCheckResult[];
  readonly categorySummaries: Readonly<Record<PreflightCategoryId, PreflightCategorySummary>>;
  readonly blockingReasonsKo: readonly string[];
  readonly recommendedFixesKo: readonly string[];
  readonly readinessDigestFnv1a32Hex: string;
  readonly readinessDigestSha256Hex: string;
  readonly headlineKo: string;
}

const CATEGORY_LABELS_KO: Readonly<Record<PreflightCategoryId, string>> = Object.freeze({
  "portal-slice-geometry": "웹툰 포털 슬라이스 규격",
  "print-cmyk-bleed": "단행본 CMYK 인쇄·도련",
  "audio-lufs-truepeak": "오디오툰 음량·트루피크",
  "a11y-cvd-photosensitive": "색각·광과민·전정 접근성",
  "rights-bom-provenance": "Rights BOM 권리·진본 서명",
  "pii-zero-leak": "개인정보·경로·시크릿 무유출",
});

const UTF8_ENCODER = new TextEncoder();
const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
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

function rotr32(v: number, n: number): number {
  return ((v >>> n) | (v << (32 - n))) >>> 0;
}

export function computePreflightFnv1a32Hex(payload: string): string {
  const bytes = UTF8_ENCODER.encode(payload);
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function computePreflightSha256Hex(payload: string): string {
  const bytes = UTF8_ENCODER.encode(payload);
  const bitLenLow = (bytes.byteLength << 3) >>> 0;
  const bitLenHigh = Math.floor(bytes.byteLength / 0x20000000) >>> 0;
  const paddedLen = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes, 0);
  padded[bytes.byteLength] = 0x80;
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  view.setUint32(paddedLen - 8, bitLenHigh, false);
  view.setUint32(paddedLen - 4, bitLenLow, false);

  const state = new Uint32Array(SHA256_H0);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const t2 = (s0 + (((a & b) ^ (a & c) ^ (b & c)) >>> 0)) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) state[i] = ((state[i] ?? 0) + (next[i] ?? 0)) >>> 0;
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isMailChar(code: number): boolean {
  return isDigit(code) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
    code === 46 || code === 45 || code === 95 || code === 43;
}

/** 선형 시간(`O(n)`) 이메일·휴대전화·주민등록번호·로컬 경로·시크릿 스캐너 (정규식 0건). */
function detectEmailInText(text: string): boolean {
  for (let i = 1; i < text.length - 3; i += 1) {
    if (text.charCodeAt(i) !== 64) continue;
    let l = i - 1;
    while (l >= 0 && isMailChar(text.charCodeAt(l))) l -= 1;
    let r = i + 1;
    let dot = false;
    while (r < text.length && isMailChar(text.charCodeAt(r))) {
      if (text.charCodeAt(r) === 46 && r > i + 1 && r < text.length - 1) dot = true;
      r += 1;
    }
    if (i - 1 - l >= 1 && r - (i + 1) >= 4 && dot) return true;
  }
  return false;
}

function detectKoreanMobilePhone(text: string): boolean {
  for (let i = 0; i <= text.length - 11; i += 1) {
    if (text.slice(i, i + 3) !== "010" || (i > 0 && isDigit(text.charCodeAt(i - 1)))) continue;
    let c = i + 3;
    const sep = text.charCodeAt(c) === 45 || text.charCodeAt(c) === 32;
    if (sep) c += 1;
    let mid = 0;
    while (c < text.length && mid < 4 && isDigit(text.charCodeAt(c))) {
      mid += 1;
      c += 1;
    }
    if (mid < 3) continue;
    if (sep) {
      if (text.charCodeAt(c) !== 45 && text.charCodeAt(c) !== 32) continue;
      c += 1;
    }
    let tail = 0;
    while (c < text.length && tail < 4 && isDigit(text.charCodeAt(c))) {
      tail += 1;
      c += 1;
    }
    if (tail === 4 && !(c < text.length && isDigit(text.charCodeAt(c)))) return true;
  }
  return false;
}

function detectKoreanResidentNumber(text: string): boolean {
  for (let i = 0; i <= text.length - 14; i += 1) {
    if (i > 0 && isDigit(text.charCodeAt(i - 1))) continue;
    if (text.charCodeAt(i + 6) !== 45) continue;
    const g = text.charCodeAt(i + 7);
    if (g < 49 || g > 52) continue;
    let digitsOk = true;
    for (let k = 0; k < 14; k += 1) {
      if (k !== 6 && !isDigit(text.charCodeAt(i + k))) {
        digitsOk = false;
        break;
      }
    }
    if (digitsOk && !(i + 14 < text.length && isDigit(text.charCodeAt(i + 14)))) return true;
  }
  return false;
}

function detectLocalOsUserPath(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("/users/") || lower.includes("/home/") ||
    lower.includes("c:\\users\\") || lower.includes("c:/users/");
}

function detectEmbeddedSecretToken(text: string): boolean {
  return text.includes("sk-live-") || text.includes("sk-proj-") ||
    text.includes("ghp_") || text.includes("AKIA") || text.includes("PRIVATE KEY-----");
}

function triState(passCond: boolean, warnCond: boolean): PreflightSeverity {
  return passCond ? "pass" : warnCond ? "warn" : "block";
}

interface RawCheckSpec {
  readonly category: PreflightCategoryId;
  readonly idx: number;
  readonly slug: string;
  readonly titleKo: string;
  readonly severity: PreflightSeverity;
  readonly measuredSummaryKo: string;
  readonly blockDetailKo: string;
  readonly fixDetailKo: string;
}

function spec(
  category: PreflightCategoryId,
  idx: number,
  slug: string,
  titleKo: string,
  severity: PreflightSeverity,
  measuredSummaryKo: string,
  blockDetailKo: string,
  fixDetailKo: string,
): RawCheckSpec {
  return { category, idx, slug, titleKo, severity, measuredSummaryKo, blockDetailKo, fixDetailKo };
}

function materializeCheck(raw: RawCheckSpec, globalIdx: number): PreflightCheckResult {
  return Object.freeze({
    checkId: `${raw.category}.0${raw.idx}-${raw.slug}`,
    category: raw.category,
    checkIndexInCategory: raw.idx,
    globalCheckIndex: globalIdx,
    titleKo: raw.titleKo,
    severity: raw.severity,
    measuredSummaryKo: raw.measuredSummaryKo,
    blockingReasonKo: raw.severity === "block" ? `출고 차단 사유: ${raw.blockDetailKo}` : null,
    remediationHintKo: raw.severity === "pass" ? null : `권장 보완 사항: ${raw.fixDetailKo}`,
  });
}

/** 정상 출고 기준을 모두 충족하는 스튜디오 기본 회차 입력을 생성한다. */
export function createCleanEpisodePreflightInput(
  overrides: Partial<EpisodeMasterPreflightInput> = {},
): EpisodeMasterPreflightInput {
  return Object.freeze({
    episodeId: overrides.episodeId ?? "ep-030-grand-milestone",
    episodeNumber: overrides.episodeNumber ?? 30,
    portal: overrides.portal ?? {
      canvasWidthPx: 800, maxSliceHeightPx: 1280, minBalloonSliceClearancePx: 28,
      maxSliceBytes: 920_000, minGutterHeightPx: 64, thumbnailSafeZoneRatio: 0.92,
    },
    print: overrides.print ?? {
      maxTacPercent: 248, bleedMm: 3.0, innerSafeMarginMm: 5.5,
      minEffectiveDpi: 600, smallTextRichBlackCount: 0, spineGutterSafeMm: 10.0,
    },
    audio: overrides.audio ?? {
      integratedLufs: -14.0, truePeakDbtp: -1.5, loudnessRangeLu: 7.2,
      dialogueToBgmMarginDb: 8.5, absDcOffset: 0.0004, clippedSampleCount: 0, maxCueSyncDriftMs: 12,
    },
    a11y: overrides.a11y ?? {
      maxFlashHz: 1.2, minBalloonContrastRatio: 9.4, minCvdDeltaE: 21.0, minFontSizePx: 16,
      missingAltCutCount: 0, readingOrderCycleCount: 0, maxCameraRollDeg: 1.6, reducedMotionHonored: true,
    },
    rightsBom: overrides.rightsBom ?? {
      fonts: [
        { fontFamily: "Pretendard Std", licenseState: "commercial-verified" },
        { fontFamily: "KoPubWorld 바탕", licenseState: "commercial-verified" },
      ],
      unlicensedAssetIds: [], unattributedAssetCount: 0,
      unlicensedAudioStemIds: [], territoryRestrictedStemCount: 0,
      provenanceSignatureValid: true, manifestHashMatched: true, signatureExpiresSoon: false,
      unresolvedSplitDisputeCount: 0, pendingCollaboratorAckCount: 0,
      unclearedTrademarkCount: 0, parodyReviewTrademarkCount: 0,
    },
    pii: overrides.pii ?? {
      metadataFields: ["title:30화 대단원", "studio:ToonStudio Local OPFS", "colorSpace:sRGB"],
      exifGpsCoordinateCount: 0, coarseLocationHintCount: 0,
      unscrubbedHiddenMemoCount: 0, emptyHiddenDraftLayerCount: 0,
    },
  });
}

/** 6개 범주 × 6개 검사 = 총 36개 마스터 회차 프리플라이트 심사를 수행한다. */
export function evaluateEpisodeMasterPreflightGate(
  input: EpisodeMasterPreflightInput,
): EpisodeMasterPreflightReport {
  const { portal: p, print: pr, audio: au, a11y: ac, rightsBom: rb, pii } = input;
  const unlicensedFonts = rb.fonts.filter((f) => f.licenseState === "unlicensed").map((f) => f.fontFamily);
  const trialFonts = rb.fonts.filter((f) => f.licenseState === "trial-restricted").map((f) => f.fontFamily);
  const joinedMeta = pii.metadataFields.join(" | ");
  const hasEmailOrPhone = pii.metadataFields.some((f) => detectEmailInText(f) || detectKoreanMobilePhone(f));
  const hasResidentId = pii.metadataFields.some((f) => detectKoreanResidentNumber(f));
  const hasOsUserPath = detectLocalOsUserPath(joinedMeta);
  const hasSecretToken = pii.metadataFields.some((f) => detectEmbeddedSecretToken(f));

  const rawSpecs: readonly RawCheckSpec[] = [
    // 1. portal-slice-geometry (1..6)
    spec("portal-slice-geometry", 1, "canvas-width", "포털 가로 폭 규격",
      triState(p.canvasWidthPx === 720 || p.canvasWidthPx === 800, p.canvasWidthPx >= 690 && p.canvasWidthPx <= 1440),
      `가로 ${p.canvasWidthPx}px`, `가로 해상도(${p.canvasWidthPx}px)가 포털 허용 범위(690~1440px)를 벗어났습니다.`, "포털 표준 가로 폭인 720px 또는 800px로 리샘플링하세요."),
    spec("portal-slice-geometry", 2, "slice-height", "슬라이스 최대 세로 길이",
      triState(p.maxSliceHeightPx <= 1280, p.maxSliceHeightPx <= 1600),
      `최대 높이 ${p.maxSliceHeightPx}px`, `슬라이스 높이(${p.maxSliceHeightPx}px)가 모바일 디코더 안전 한계(1600px)를 초과했습니다.`, "슬라이스 분할 기준 높이를 1280px 이하로 재분할하세요."),
    spec("portal-slice-geometry", 3, "balloon-seam-clearance", "절단선 말풍선 이격 거리",
      triState(p.minBalloonSliceClearancePx >= 16, p.minBalloonSliceClearancePx > 0),
      `최소 이격 ${p.minBalloonSliceClearancePx}px`, "슬라이스 절단선이 대사 말풍선 또는 자막 영역을 직접 관통합니다.", "스마트 슬라이서로 절단선을 여백으로 옮겨 최소 16px 이상 띄우세요."),
    spec("portal-slice-geometry", 4, "slice-byte-budget", "개별 슬라이스 파일 용량",
      triState(p.maxSliceBytes <= 1_500_000, p.maxSliceBytes <= 2_000_000),
      `최대 ${(p.maxSliceBytes / 1000).toFixed(1)}KB`, "개별 슬라이스 용량이 포털 업로드 상한(2000KB)을 초과했습니다.", "무손실 양자화 또는 슬라이스 세분화로 장당 1.5MB 이하를 맞추세요."),
    spec("portal-slice-geometry", 5, "gutter-cadence", "컷 간 최소 호흡 여백",
      triState(p.minGutterHeightPx >= 40, p.minGutterHeightPx >= 20),
      `최소 여백 ${p.minGutterHeightPx}px`, `컷 간 간격(${p.minGutterHeightPx}px)이 20px 미만이어서 장면이 겹쳐 보입니다.`, "컷 사이 세로 간격을 최소 40px 이상 확보하세요."),
    spec("portal-slice-geometry", 6, "thumbnail-safe-zone", "대표 썸네일 핵심 피사체 보존율",
      triState(p.thumbnailSafeZoneRatio >= 0.85, p.thumbnailSafeZoneRatio >= 0.7),
      `보존율 ${(p.thumbnailSafeZoneRatio * 100).toFixed(1)}%`, "대표 썸네일 안전 영역 비율이 부족해 주요 인물 얼굴이 잘립니다.", "썸네일 중앙 안전 프레임 안으로 인물과 타이틀을 재배치하세요."),

    // 2. print-cmyk-bleed (7..12)
    spec("print-cmyk-bleed", 1, "total-area-coverage", "CMYK 잉크 총량(TAC) 상한",
      triState(pr.maxTacPercent <= 280, pr.maxTacPercent <= PRINT_TAC_BLOCK_CEILING_PERCENT),
      `최대 TAC ${pr.maxTacPercent.toFixed(1)}%`, `CMYK 잉크 총량(${pr.maxTacPercent.toFixed(1)}%)이 허용 상한(300%)을 초과해 뒷묻음이 발생합니다.`, "어두운 먹 영역에 UCR/GCR 분판을 적용해 총 잉크량을 280% 이하로 낮추세요."),
    spec("print-cmyk-bleed", 2, "bleed-margin", "외곽 재단 도련(Bleed) 여백",
      triState(pr.bleedMm >= 3.0, pr.bleedMm >= 2.0),
      `도련 ${pr.bleedMm.toFixed(1)}mm`, `재단 도련(${pr.bleedMm.toFixed(1)}mm)이 2.0mm 미만이어서 재단 시 흰 줄이 노출됩니다.`, "단행본 표준 도련 3.0mm 이상으로 배경 작화를 확장하세요."),
    spec("print-cmyk-bleed", 3, "inner-safe-margin", "내측 대사·작화 안전선",
      triState(pr.innerSafeMarginMm >= 5.0, pr.innerSafeMarginMm >= 3.5),
      `안전선 ${pr.innerSafeMarginMm.toFixed(1)}mm`, `대사 내측 여백(${pr.innerSafeMarginMm.toFixed(1)}mm)이 재단 위험 구간을 침범했습니다.`, "모든 대사와 효과음을 재단선 안쪽 5.0mm 내부로 이동하세요."),
    spec("print-cmyk-bleed", 4, "effective-dpi", "인쇄 실효 해상도(DPI)",
      triState(pr.minEffectiveDpi >= 350, pr.minEffectiveDpi >= 300),
      `최소 ${pr.minEffectiveDpi} DPI`, `인쇄 실효 해상도(${pr.minEffectiveDpi} DPI)가 오프셋 하한(300 DPI)에 미달합니다.`, "컬러 원고 350 DPI, 흑백 선화 600 DPI 이상으로 재생성하세요."),
    spec("print-cmyk-bleed", 5, "k100-small-text", "본문 소형 대사 먹100%(K100) 분판",
      triState(pr.smallTextRichBlackCount === 0, pr.smallTextRichBlackCount <= 2),
      `리치블랙 대사 ${pr.smallTextRichBlackCount}건`, `소형 대사 ${pr.smallTextRichBlackCount}건이 4도 혼합 먹이어서 핀트 번짐이 발생합니다.`, "본문 식자 레이어를 C0 M0 Y0 K100 단일 먹판으로 변환하세요."),
    spec("print-cmyk-bleed", 6, "spine-gutter-creep", "제본 책등 안쪽 물림 여유",
      triState(pr.spineGutterSafeMm >= 8.0, pr.spineGutterSafeMm >= 5.0),
      `책등 여유 ${pr.spineGutterSafeMm.toFixed(1)}mm`, `제본 안쪽 여백(${pr.spineGutterSafeMm.toFixed(1)}mm)이 좁아 접힘부에 대사가 묻힙니다.`, "안쪽 말풍선에 최소 8.0mm 이상 제본 물림 여유를 확보하세요."),

    // 3. audio-lufs-truepeak (13..18)
    spec("audio-lufs-truepeak", 1, "integrated-lufs", "BS.1770-4 통합 음량(LUFS)",
      triState(au.integratedLufs >= -16.0 && au.integratedLufs <= -12.0, au.integratedLufs >= -19.0 && au.integratedLufs <= -10.5),
      `통합 ${au.integratedLufs.toFixed(1)} LUFS`, `통합 음량(${au.integratedLufs.toFixed(1)} LUFS)이 스트리밍 규격을 벗어났습니다.`, "마스터 게인을 -14.0 LUFS 목표에 맞춰 정규화하세요."),
    spec("audio-lufs-truepeak", 2, "true-peak-ceiling", "4x 오버샘플링 트루피크 상한",
      triState(au.truePeakDbtp <= -1.2, au.truePeakDbtp <= AUDIO_TRUE_PEAK_BLOCK_CEILING_DBTP),
      `트루피크 ${au.truePeakDbtp.toFixed(2)} dBTP`, `트루피크(${au.truePeakDbtp.toFixed(2)} dBTP)가 허용 상한(-1.0 dBTP)을 넘어 클리핑을 유발합니다.`, "룩어헤드 트루피크 리미터 상한을 -1.5 dBTP 이하로 설정하세요."),
    spec("audio-lufs-truepeak", 3, "loudness-range", "다이내믹 라우드니스 편차(LRA)",
      triState(au.loudnessRangeLu <= 10.0, au.loudnessRangeLu <= 14.0),
      `편차 ${au.loudnessRangeLu.toFixed(1)} LU`, `구간별 음량 편차(${au.loudnessRangeLu.toFixed(1)} LU)가 과도합니다.`, "버스 컴프레서로 정적 구간과 폭발음 간 편차를 10 LU 이내로 조정하세요."),
    spec("audio-lufs-truepeak", 4, "dialogue-margin", "배경음 대비 성우 대사 명료도",
      triState(au.dialogueToBgmMarginDb >= 6.0, au.dialogueToBgmMarginDb >= 3.5),
      `마진 ${au.dialogueToBgmMarginDb.toFixed(1)} dB`, `대사와 배경음 차이(${au.dialogueToBgmMarginDb.toFixed(1)} dB)가 부족해 대사가 묻힙니다.`, "대사 구간 배경음 사이드체인 덕킹으로 6 dB 이상 마진을 확보하세요."),
    spec("audio-lufs-truepeak", 5, "dc-offset-clip", "DC 오프셋 및 샘플 클리핑 무결성",
      triState(au.absDcOffset <= 0.002 && au.clippedSampleCount === 0, au.absDcOffset <= 0.01 && au.clippedSampleCount === 0),
      `DC ${au.absDcOffset.toFixed(4)} · 클립 ${au.clippedSampleCount}`, "디지털 샘플 클리핑 또는 과도한 DC 오프셋이 검출되었습니다.", "20Hz 고역통과 DC 제거 필터를 거치고 스템 헤드룸을 확보하세요."),
    spec("audio-lufs-truepeak", 6, "scroll-cue-sync", "스크롤 컷-사운드 큐 동기화 오차",
      triState(au.maxCueSyncDriftMs <= 25, au.maxCueSyncDriftMs <= 60),
      `오차 ${au.maxCueSyncDriftMs.toFixed(0)}ms`, `스크롤 트리거와 사운드 큐 오차(${au.maxCueSyncDriftMs.toFixed(0)}ms)가 60ms를 초과했습니다.`, "컷 앵커 타임스탬프를 재정렬해 오차를 25ms 이내로 줄이세요."),

    // 4. a11y-cvd-photosensitive (19..24)
    spec("a11y-cvd-photosensitive", 1, "photosensitive-flash", "BT.1702 광과민성 점멸 빈도",
      triState(ac.maxFlashHz <= 2.5, ac.maxFlashHz <= 3.0),
      `최대 ${ac.maxFlashHz.toFixed(2)} Hz`, `화면 점멸 빈도(${ac.maxFlashHz.toFixed(2)} Hz)가 광과민성 안전 한계(3.0 Hz)를 초과했습니다.`, "연속 점멸 구간의 휘도 변화를 완화하고 초당 2.5회 이하로 제한하세요."),
    spec("a11y-cvd-photosensitive", 2, "balloon-contrast", "말풍선 대사 명도 대비율",
      triState(ac.minBalloonContrastRatio >= 7.0, ac.minBalloonContrastRatio >= 4.5),
      `대비율 ${ac.minBalloonContrastRatio.toFixed(2)}:1`, `말풍선 글자 대비율(${ac.minBalloonContrastRatio.toFixed(2)}:1)이 최소 기준(4.5:1) 미만입니다.`, "유색 말풍선 채도를 낮추거나 외곽선을 보강해 7:1 이상 대비를 맞추세요."),
    spec("a11y-cvd-photosensitive", 3, "cvd-palette-distinction", "색각 이상(CVD) 캐릭터·진영 구분 색차",
      triState(ac.minCvdDeltaE >= 14.0, ac.minCvdDeltaE >= 9.0),
      `최소 ΔE ${ac.minCvdDeltaE.toFixed(1)}`, `색각 이상 시뮬레이션에서 핵심 색상 간 색차(ΔE ${ac.minCvdDeltaE.toFixed(1)})가 부족합니다.`, "달토나이제이션 보정으로 명도 차이와 문양 단서를 함께 부여하세요."),
    spec("a11y-cvd-photosensitive", 4, "min-font-size", "모바일 본문 최소 식자 크기",
      triState(ac.minFontSizePx >= 14, ac.minFontSizePx >= 12),
      `최소 ${ac.minFontSizePx}px`, `모바일 최소 식자 크기(${ac.minFontSizePx}px)가 12px 미만이어서 가독성이 무너집니다.`, "본문 대사를 최소 14px 이상으로 키우고 긴 문장은 말풍선을 분할하세요."),
    spec("a11y-cvd-photosensitive", 5, "alt-reading-order", "스크린리더 읽기 순서 DAG·대체 텍스트",
      triState(ac.missingAltCutCount === 0 && ac.readingOrderCycleCount === 0, ac.missingAltCutCount <= 2 && ac.readingOrderCycleCount === 0),
      `누락 ${ac.missingAltCutCount}컷 · 순환 ${ac.readingOrderCycleCount}건`, "말풍선 읽기 순서 순환 오류 또는 대체 텍스트 다수 누락이 감지되었습니다.", "비순환 읽기 순서(DAG)로 교정하고 모든 컷에 상황 설명을 채우세요."),
    spec("a11y-cvd-photosensitive", 6, "vestibular-motion", "전정기관 롤 한계 및 동작 줄이기 존중",
      triState(ac.maxCameraRollDeg <= 2.5 && ac.reducedMotionHonored, ac.maxCameraRollDeg <= 3.5 && ac.reducedMotionHonored),
      `롤 ${ac.maxCameraRollDeg.toFixed(2)}° · 감쇠 ${ac.reducedMotionHonored ? "준수" : "미준수"}`, "카메라 회전각 과다 또는 동작 줄이기 설정 미준수가 감지되었습니다.", "카메라 롤 각도를 ±2.5° 이내로 제한하고 동작 줄이기 활성 시 즉시 정지시키세요."),

    // 5. rights-bom-provenance (25..30)
    spec("rights-bom-provenance", 1, "font-commercial-license", "사용 폰트 상업 출고 라이선스",
      triState(unlicensedFonts.length === 0 && trialFonts.length === 0 && rb.fonts.length > 0, unlicensedFonts.length === 0 && rb.fonts.length > 0),
      unlicensedFonts.length > 0 ? `무허가(${unlicensedFonts.join(", ")})` : `검증 폰트 ${rb.fonts.length}종`,
      `상업 출고 권리가 없는 폰트(${unlicensedFonts.join(", ") || "목록 없음"})가 원고에 포함되었습니다.`, "상업 출판 라이선스가 확인된 글꼴로 교체하고 Rights BOM 증빙을 갱신하세요."),
    spec("rights-bom-provenance", 2, "asset-prop-brush-license", "3D 배경·소품·브러시 상업 권리",
      triState(rb.unlicensedAssetIds.length === 0 && rb.unattributedAssetCount === 0, rb.unlicensedAssetIds.length === 0),
      `무권리 ${rb.unlicensedAssetIds.length}건 · 표기누락 ${rb.unattributedAssetCount}건`,
      `상업 사용권이 없는 3D·브러시 에셋(${rb.unlicensedAssetIds.join(", ")})이 검출되었습니다.`, "미허가 에셋을 제거하거나 정식 상업 라이선스 해시를 등록하세요."),
    spec("rights-bom-provenance", 3, "audio-stem-clearance", "배경음·효과음·보이스 배포 권리",
      triState(rb.unlicensedAudioStemIds.length === 0 && rb.territoryRestrictedStemCount === 0, rb.unlicensedAudioStemIds.length === 0),
      `무권리 ${rb.unlicensedAudioStemIds.length}건 · 권역제한 ${rb.territoryRestrictedStemCount}건`,
      `배포 권리가 없는 오디오 스템(${rb.unlicensedAudioStemIds.join(", ")})이 포함되었습니다.`, "자체 절차적 합성음 또는 글로벌 유통 허가 음원으로 교체하세요."),
    spec("rights-bom-provenance", 4, "provenance-seal", "진본 출처 서명(WOTS+/ECDSA) 무결성",
      triState(rb.provenanceSignatureValid && rb.manifestHashMatched && !(rb.signatureExpiresSoon ?? false), rb.provenanceSignatureValid && rb.manifestHashMatched),
      rb.provenanceSignatureValid && rb.manifestHashMatched ? "서명·해시 일치" : "서명 불일치",
      "원고 매니페스트 해시 또는 창작자 진본 서명이 일치하지 않습니다.", "출고 직전 최신 레이어 트리에 대해 진본 봉인 서명을 다시 실행하세요."),
    spec("rights-bom-provenance", 5, "collaborator-split-ledger", "공동 작업자 기여·정산 BOM 합의",
      triState(rb.unresolvedSplitDisputeCount === 0 && rb.pendingCollaboratorAckCount === 0, rb.unresolvedSplitDisputeCount === 0),
      `분쟁 ${rb.unresolvedSplitDisputeCount}건 · 대기 ${rb.pendingCollaboratorAckCount}건`,
      `공동 작업자 정산 지분 미합의(${rb.unresolvedSplitDisputeCount}건) 상태에서는 출고할 수 없습니다.`, "어시스턴트 작업 확인 서명을 완료한 뒤 다시 출고하세요."),
    spec("rights-bom-provenance", 6, "trademark-clearance", "배경 간판·소품 타사 상표권 검수",
      triState(rb.unclearedTrademarkCount === 0 && (rb.parodyReviewTrademarkCount ?? 0) === 0, rb.unclearedTrademarkCount === 0),
      `미승인 상표 ${rb.unclearedTrademarkCount}건`, `배경 내 미승인 실존 상표(${rb.unclearedTrademarkCount}건)가 노출되었습니다.`, "가상 브랜드 로고 에셋으로 대체해 상표권 분쟁 소지를 제거하세요."),

    // 6. pii-zero-leak (31..36)
    spec("pii-zero-leak", 1, "contact-email-phone", "개인 이메일·휴대전화 번호 무유출",
      hasEmailOrPhone ? "block" : "pass", hasEmailOrPhone ? "개인 연락처 검출" : "연락처 0건",
      "메타데이터 또는 레이어 이름에 개인 이메일이나 휴대전화 번호가 남아 있습니다.", "출고 패키지에서 개인 연락처 문자열을 즉시 삭제하세요."),
    spec("pii-zero-leak", 2, "resident-id-number", "주민등록번호·민감 식별번호 무유출",
      hasResidentId ? "block" : "pass", hasResidentId ? "식별번호 검출" : "식별번호 0건",
      "주민등록번호 형식의 민감 개인 식별번호가 원고 데이터에서 검출되었습니다.", "정산 식별정보는 원고 파일 외부의 분리된 정산 원장으로만 보관하세요."),
    spec("pii-zero-leak", 3, "exif-gps-strip", "이미지 EXIF GPS 위치 좌표 제거",
      triState(pii.exifGpsCoordinateCount === 0 && (pii.coarseLocationHintCount ?? 0) === 0, pii.exifGpsCoordinateCount === 0),
      `정밀 GPS ${pii.exifGpsCoordinateCount}건`, `참조 이미지 EXIF에 정밀 GPS 좌표(${pii.exifGpsCoordinateCount}건)가 남아 있습니다.`, "모든 래스터 타일과 첨부 이미지에서 EXIF 위치 태그를 제거하세요."),
    spec("pii-zero-leak", 4, "local-os-user-path", "로컬 OS 사용자 계정 경로 제거",
      hasOsUserPath ? "block" : "pass", hasOsUserPath ? "로컬 계정 경로 검출" : "로컬 경로 0건",
      "연결 에셋 경로에 로컬 운영체제 사용자 계정명(/Users/... 등)이 노출되었습니다.", "모든 에셋 참조를 프로젝트 상대 경로 또는 콘텐츠 해시로 치환하세요."),
    spec("pii-zero-leak", 5, "embedded-secret-token", "API 키·클라우드 토큰·개인키 무유출",
      hasSecretToken ? "block" : "pass", hasSecretToken ? "시크릿 토큰 검출" : "시크릿 0건",
      "메타데이터·주석 내부에 외부 API 키 또는 개인키 문자열이 포함되어 있습니다.", "노출된 키를 즉시 폐기하고 원고에서 자격증명 문자열을 제거하세요."),
    spec("pii-zero-leak", 6, "hidden-draft-memo-scrub", "비공개 편집 메모·숨김 러프 정리",
      triState(pii.unscrubbedHiddenMemoCount === 0 && (pii.emptyHiddenDraftLayerCount ?? 0) === 0, pii.unscrubbedHiddenMemoCount === 0),
      `비공개 메모 ${pii.unscrubbedHiddenMemoCount}건`, `외부 유출 금지 비공개 편집 메모(${pii.unscrubbedHiddenMemoCount}건)가 남아 있습니다.`, "출고본 병합 전 숨김 메모 레이어와 내부 코멘트를 정리하세요."),
  ];

  const checks: PreflightCheckResult[] = rawSpecs.map((item, idx) => materializeCheck(item, idx + 1));

  let passedCount = 0;
  let warningCount = 0;
  let blockedCount = 0;
  const blockingReasonsKo: string[] = [];
  const recommendedFixesKo: string[] = [];
  const catBuckets: Record<PreflightCategoryId, { pass: number; warn: number; block: number }> = {
    "portal-slice-geometry": { pass: 0, warn: 0, block: 0 },
    "print-cmyk-bleed": { pass: 0, warn: 0, block: 0 },
    "audio-lufs-truepeak": { pass: 0, warn: 0, block: 0 },
    "a11y-cvd-photosensitive": { pass: 0, warn: 0, block: 0 },
    "rights-bom-provenance": { pass: 0, warn: 0, block: 0 },
    "pii-zero-leak": { pass: 0, warn: 0, block: 0 },
  };

  const digestLines: string[] = [`episode:${input.episodeId}:${input.episodeNumber}`];
  for (const item of checks) {
    catBuckets[item.category][item.severity] += 1;
    if (item.severity === "pass") passedCount += 1;
    else if (item.severity === "warn") warningCount += 1;
    else blockedCount += 1;
    if (item.blockingReasonKo !== null) blockingReasonsKo.push(`[${item.checkId}] ${item.blockingReasonKo}`);
    if (item.remediationHintKo !== null) recommendedFixesKo.push(`[${item.checkId}] ${item.remediationHintKo}`);
    digestLines.push(`${item.checkId}=${item.severity}:${item.measuredSummaryKo}`);
  }

  const categorySummaries = {} as Record<PreflightCategoryId, PreflightCategorySummary>;
  for (const cat of PREFLIGHT_CATEGORIES) {
    const b = catBuckets[cat];
    categorySummaries[cat] = Object.freeze({
      category: cat,
      labelKo: CATEGORY_LABELS_KO[cat],
      totalChecks: PREFLIGHT_CHECKS_PER_CATEGORY,
      passedCount: b.pass,
      warningCount: b.warn,
      blockedCount: b.block,
      categorySeverity: b.block > 0 ? "block" : b.warn > 0 ? "warn" : "pass",
    });
  }

  const overallSeverity: PreflightSeverity = blockedCount > 0 ? "block" : warningCount > 0 ? "warn" : "pass";
  const canonicalPayload = digestLines.join("\n");
  const headlineKo =
    blockedCount > 0
      ? `마스터 출고 차단 — 총 36개 항목 중 차단 ${blockedCount}건·경고 ${warningCount}건이 감지되었습니다.`
      : warningCount > 0
        ? `조건부 출고 가능 — 차단 사유 0건(통과 ${passedCount}건 · 권장 보완 ${warningCount}건).`
        : "마스터 출고 승인 — 6대 채널 36개 전 항목 무결성 심사를 완벽히 통과했습니다(36/36).";

  return Object.freeze({
    episodeId: input.episodeId,
    episodeNumber: input.episodeNumber,
    totalChecks: PREFLIGHT_TOTAL_CHECKS,
    passedCount,
    warningCount,
    blockedCount,
    overallSeverity,
    canPublishMaster: blockedCount === 0,
    checks: Object.freeze(checks),
    categorySummaries: Object.freeze(categorySummaries),
    blockingReasonsKo: Object.freeze(blockingReasonsKo),
    recommendedFixesKo: Object.freeze(recommendedFixesKo),
    readinessDigestFnv1a32Hex: computePreflightFnv1a32Hex(canonicalPayload),
    readinessDigestSha256Hex: computePreflightSha256Hex(canonicalPayload),
    headlineKo,
  });
}
