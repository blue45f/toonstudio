/**
 * 웹툰 픽셀 헌터 · 7개국어 말풍선 · 상업 라이선스 게이트 · PD/AD 음성 핀 타입·카탈로그 (4~7번 모듈)
 */

export type PixelArtifactKind = "unfilled-gap" | "color-bleed" | "eraser-dust";

export interface PixelQaGridInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly width: number;
  readonly height: number;
  /** 길이 width * height. 1 = 선화 경계 픽셀, 0 = 비선화 */
  readonly lineArtMask: Uint8Array;
  /** 길이 width * height * 4. 채색 레이어 RGBA (0~255) */
  readonly colorRgba: Uint8ClampedArray;
  /** 미지정 시 외곽 4방향 BFS로 내부/외부 마스크를 자동 산출 */
  readonly interiorRegionMask?: Uint8Array;
  readonly whiteGapLumaThreshold?: number;
  readonly alphaVisibleThreshold?: number;
  readonly maxDustClusterSize?: number;
}

export interface PixelArtifactPin {
  readonly id: string;
  readonly kind: PixelArtifactKind;
  readonly labelKo: string;
  readonly pixelCount: number;
  readonly pinX: number;
  readonly pinY: number;
  readonly pinXNorm: number;
  readonly pinYNorm: number;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly pixelIndices: readonly number[];
  readonly suggestedFillRgba?: readonly [number, number, number, number];
  readonly cleanupActionKo: string;
}

export interface PixelArtifactScanReport {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly width: number;
  readonly height: number;
  readonly artifacts: readonly PixelArtifactPin[];
  readonly unfilledGapCount: number;
  readonly colorBleedCount: number;
  readonly eraserDustCount: number;
  readonly totalAffectedPixels: number;
  readonly verdict: "CLEAN" | "NEEDS_CLEANUP";
  /** 1클릭 일괄 클린업 적용 후 즉시 사용 가능한 정리 완료 RGBA 버퍼 */
  readonly cleanedRgba: Uint8ClampedArray;
}

export type SupportedQaLocale = "ko" | "en" | "ja" | "vi" | "th" | "id" | "es";
export type BalloonShapeKind = "oval" | "rect" | "shout";

export interface MultilingualBalloonInput {
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly locale: SupportedQaLocale;
  readonly text: string;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly fontSizePx: number;
  readonly paddingPx?: number;
  readonly minReadableFontSizePx?: number;
  readonly shape?: BalloonShapeKind;
}

export interface MultilingualBalloonAuditItem {
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly locale: SupportedQaLocale;
  readonly localeLabelKo: string;
  readonly status: "FIT" | "AUTO_FIXED" | "EXPAND_BALLOON";
  readonly originalFontSizePx: number;
  readonly recommendedFontSizePx: number;
  readonly originalPaddingPx: number;
  readonly recommendedPaddingPx: number;
  readonly recommendedLineHeight: number;
  readonly originalLines: readonly string[];
  readonly correctedLines: readonly string[];
  readonly overflowBeforePx: number;
  readonly overflowAfterPx: number;
  readonly midWordBreakDetected: boolean;
  readonly midWordBreakPrevented: boolean;
  readonly recommendedBoxWidthPx: number;
  readonly recommendedBoxHeightPx: number;
  readonly localeNoteKo: string;
}

export interface MultilingualBalloonAuditReport {
  readonly totalBalloons: number;
  readonly fitCount: number;
  readonly autoFixedCount: number;
  readonly expandRequiredCount: number;
  readonly items: readonly MultilingualBalloonAuditItem[];
}

export type LicensedAssetKind = "font" | "model-3d" | "brush" | "texture" | "sfx-template";
export type AssetLicenseStatus =
  | "commercial-verified"
  | "cc0"
  | "non-commercial"
  | "personal-only"
  | "unverified"
  | "expired";

export interface EpisodeAssetUsage {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetKind: LicensedAssetKind;
  readonly licenseStatus: AssetLicenseStatus;
  readonly licenseProvider: string;
  readonly usedInCuts: readonly number[];
  readonly expiresAtIso?: string;
}

export interface SafeCommercialAlternative {
  readonly alternativeId: string;
  readonly assetKind: LicensedAssetKind;
  readonly name: string;
  readonly licenseBadge: "CC0" | "SIL OFL 1.1" | "상업 무료 검증";
  readonly provider: string;
  readonly noteKo: string;
}

export interface CommercialRightsViolation {
  readonly assetId: string;
  readonly assetName: string;
  readonly assetKind: LicensedAssetKind;
  readonly usedInCuts: readonly number[];
  readonly failureReasonCode:
    | "NON_COMMERCIAL_FORBIDDEN"
    | "UNVERIFIED_LICENSE"
    | "LICENSE_EXPIRED";
  readonly reasonKo: string;
  readonly recommendedAlternatives: readonly SafeCommercialAlternative[];
}

export interface CommercialRightsGateInput {
  readonly episodeId: string;
  readonly checkDateIso: string;
  readonly usedAssets: readonly EpisodeAssetUsage[];
}

export interface CommercialRightsGateReport {
  readonly episodeId: string;
  readonly checkDateIso: string;
  readonly verdict: "PASS" | "BLOCKED";
  readonly canPublish: boolean;
  readonly totalAssetsChecked: number;
  readonly verifiedCount: number;
  readonly blockedCount: number;
  readonly blockedCutNumbers: readonly number[];
  readonly violations: readonly CommercialRightsViolation[];
}

export type VoicePinTargetRegion =
  | "eyes"
  | "face"
  | "hand-prop"
  | "balloon"
  | "background"
  | "costume"
  | "center";

export type VoicePinApprovalStatus = "open" | "in-review" | "approved" | "revision-requested";
export type VoicePinPriority = "urgent" | "high" | "normal";

export interface VoiceQaFeedbackPinTicket {
  readonly ticketId: string;
  readonly cutNumber: number;
  readonly speakerRole: "PD" | "AD" | "작가";
  readonly rawTranscript: string;
  readonly targetSubjectKo: string;
  readonly targetRegion: VoicePinTargetRegion;
  readonly regionLabelKo: string;
  readonly instructionKo: string;
  readonly priority: VoicePinPriority;
  readonly pinXNorm: number;
  readonly pinYNorm: number;
  readonly status: VoicePinApprovalStatus;
  readonly wipePositionPct: number;
  readonly beforeSummaryKo: string;
  readonly afterSummaryKo: string;
  readonly reviewNoteKo: string;
  readonly auditTrailKo: readonly string[];
}

export type VoicePinTransitionAction =
  | { readonly type: "set-wipe"; readonly wipePositionPct: number }
  | { readonly type: "submit-fix"; readonly afterSummaryKo: string }
  | { readonly type: "approve"; readonly reviewerName: string; readonly noteKo?: string }
  | { readonly type: "request-revision"; readonly reviewerName: string; readonly noteKo: string };

export const LOCALE_TYPOGRAPHY_PROFILES: Readonly<
  Record<
    SupportedQaLocale,
    {
      readonly labelKo: string;
      readonly defaultLineHeight: number;
      readonly avgCharWidthEm: number;
      readonly wordSpaced: boolean;
      readonly noteKo: string;
    }
  >
> = {
  ko: { labelKo: "한국어 (KO)", defaultLineHeight: 1.4, avgCharWidthEm: 0.96, wordSpaced: true, noteKo: "어절(공백) 기준 줄바꿈 우선 · 단어 중간 절단 방지" },
  en: { labelKo: "영어 (EN)", defaultLineHeight: 1.32, avgCharWidthEm: 0.58, wordSpaced: true, noteKo: "영문 단어 경계 보호 · 긴 단어 하이픈 절단 대신 폰트 축소 우선" },
  ja: { labelKo: "일본어 (JA)", defaultLineHeight: 1.45, avgCharWidthEm: 0.98, wordSpaced: false, noteKo: "일본어 행두 금칙 문자(、。！？）」) 자동 회피 줄바꿈" },
  vi: { labelKo: "베트남어 (VI)", defaultLineHeight: 1.48, avgCharWidthEm: 0.62, wordSpaced: true, noteKo: "성조 부호 겹침 방지를 위해 줄간격 1.48x 이상 유지" },
  th: { labelKo: "태국어 (TH)", defaultLineHeight: 1.58, avgCharWidthEm: 0.64, wordSpaced: false, noteKo: "상·하 성조 결합문자 폭(0em) 반영 및 세로 줄간격 1.58x 확보" },
  id: { labelKo: "인도네시아어 (ID)", defaultLineHeight: 1.36, avgCharWidthEm: 0.6, wordSpaced: true, noteKo: "긴 접사 복합어 중간 절단 방지 및 말풍선 여백 최적화" },
  es: { labelKo: "스페인어 (ES)", defaultLineHeight: 1.36, avgCharWidthEm: 0.6, wordSpaced: true, noteKo: "한국어 대비 장문 팽창 보정 및 ¿¡ 문장부호 분리 금지" },
};

export const VERIFIED_SAFE_ALTERNATIVES: readonly SafeCommercialAlternative[] = [
  { alternativeId: "alt-font-pretendard", assetKind: "font", name: "Pretendard (프리텐다드)", licenseBadge: "SIL OFL 1.1", provider: "OFL 오픈 폰트", noteKo: "상업 웹툰 말풍선·임베딩·2차 저작물 전면 허용" },
  { alternativeId: "alt-font-nanum-square-neo", assetKind: "font", name: "나눔스퀘어 네오", licenseBadge: "SIL OFL 1.1", provider: "NAVER OFL", noteKo: "모바일 세로 스크롤 가독성 검증 · 상업 무료" },
  { alternativeId: "alt-3d-cc0-city-block", assetKind: "model-3d", name: "ToonStudio 도심 골목 모듈 팩", licenseBadge: "CC0", provider: "ToonStudio CC0 공용 라이브러리", noteKo: "저작자 표기 불필요 · 국내외 유료 연재 완전 자유" },
  { alternativeId: "alt-3d-cc0-interior", assetKind: "model-3d", name: "CC0 현대 실내·사무실 세트", licenseBadge: "CC0", provider: "ToonStudio CC0 공용 라이브러리", noteKo: "라이선스 분쟁 없는 검증 3D 배경 키트" },
  { alternativeId: "alt-brush-cc0-gpen", assetKind: "brush", name: "오픈 잉크 G펜 & 효과선 팩", licenseBadge: "CC0", provider: "ToonStudio 기본 번들", noteKo: "선화·효과선·식자 브러시 상업 출판 무제한 허용" },
  { alternativeId: "alt-tex-cc0-screentone", assetKind: "texture", name: "CC0 종이 질감 · 망점 스크린톤", licenseBadge: "CC0", provider: "ToonStudio 기본 번들", noteKo: "인쇄·전자책·글로벌 플랫폼 배포 안전" },
  { alternativeId: "alt-sfx-cc0-action", assetKind: "sfx-template", name: "CC0 액션 의성어 템플릿 팩", licenseBadge: "상업 무료 검증", provider: "ToonStudio 기본 번들", noteKo: "다국어 식자 교체 대응 상업 무료 SFX 벡터" },
];

export interface RegionAnchorRule {
  readonly region: VoicePinTargetRegion;
  readonly labelKo: string;
  readonly patterns: readonly RegExp[];
  readonly xNorm: number;
  readonly yNorm: number;
}

export const REGION_ANCHOR_RULES: readonly RegionAnchorRule[] = [
  { region: "eyes", labelKo: "눈·시선", patterns: [/눈빛|눈매|눈동자|시선|동공/u], xNorm: 0.5, yNorm: 0.28 },
  { region: "face", labelKo: "얼굴·표정", patterns: [/얼굴|표정|입꼬리|턱선|미소|찡그/u], xNorm: 0.5, yNorm: 0.35 },
  { region: "hand-prop", labelKo: "손·소품", patterns: [/오른손|왼손|손가락|소품|단검|칼|총|컵|휴대폰/u], xNorm: 0.64, yNorm: 0.62 },
  { region: "balloon", labelKo: "말풍선·식자", patterns: [/말풍선|대사|글씨|폰트|식자|줄바꿈/u], xNorm: 0.74, yNorm: 0.18 },
  { region: "background", labelKo: "배경·간판", patterns: [/배경|간판|상표|건물|하늘|조명|로고/u], xNorm: 0.78, yNorm: 0.24 },
  { region: "costume", labelKo: "의상·채색", patterns: [/의상|교복|코트|채색|명암|그림자|톤/u], xNorm: 0.48, yNorm: 0.56 },
];

export const SUBJECT_KEYWORDS: readonly string[] = [
  "주인공", "남주", "여주", "악역", "조연", "한서연", "강도윤", "박 반장", "배경", "말풍선",
];

/**
 * 데모·테스트용 20x20 웹툰 선화+채색 그리드 생성기 (빈틈 1 · 선 밖 넘침 1 · 지우개 먼지 1 포함)
 */
export function createSampleWebtoonPixelGrid(): PixelQaGridInput {
  const width = 20;
  const height = 20;
  const lineArtMask = new Uint8Array(width * height);
  const colorRgba = new Uint8ClampedArray(width * height * 4);

  const setRgba = (x: number, y: number, r: number, g: number, b: number, a: number): void => {
    const off = (y * width + x) * 4;
    colorRgba[off] = r;
    colorRgba[off + 1] = g;
    colorRgba[off + 2] = b;
    colorRgba[off + 3] = a;
  };

  for (let x = 4; x <= 15; x += 1) {
    lineArtMask[4 * width + x] = 1;
    lineArtMask[15 * width + x] = 1;
  }
  for (let y = 4; y <= 15; y += 1) {
    lineArtMask[y * width + 4] = 1;
    lineArtMask[y * width + 15] = 1;
  }
  for (let y = 5; y <= 14; y += 1) {
    for (let x = 5; x <= 14; x += 1) {
      setRgba(x, y, 232, 198, 174, 255);
    }
  }

  // 1) 채색 빈틈 (내부 흰 구멍 2x2)
  setRgba(8, 8, 255, 255, 255, 255);
  setRgba(9, 8, 255, 255, 255, 255);
  setRgba(8, 9, 0, 0, 0, 0);
  setRgba(9, 9, 0, 0, 0, 0);

  // 2) 선 밖 넘침 (오른쪽 선화 x=15 바깥 x=16,17)
  setRgba(16, 10, 232, 198, 174, 255);
  setRgba(17, 10, 232, 198, 174, 255);
  setRgba(16, 11, 232, 198, 174, 255);

  // 3) 지우개 잔여물 (외곽 고립 2px)
  setRgba(1, 1, 140, 120, 110, 210);
  setRgba(2, 1, 140, 120, 110, 190);

  return { cutId: "cut-06", cutNumber: 6, width, height, lineArtMask, colorRgba };
}

export const SAMPLE_MULTILINGUAL_BALLOONS: readonly MultilingualBalloonInput[] = [
  { balloonId: "ml-ko", cutNumber: 3, locale: "ko", text: "이번 계약서는 절대 넘길 수 없어. 지금 바로 멈춰!", boxWidthPx: 145, boxHeightPx: 92, fontSizePx: 17, shape: "oval" },
  { balloonId: "ml-en", cutNumber: 3, locale: "en", text: "Unbelievable! I will never surrender this contract to anyone right now!", boxWidthPx: 145, boxHeightPx: 92, fontSizePx: 16, shape: "oval" },
  { balloonId: "ml-ja", cutNumber: 3, locale: "ja", text: "この契約書は絶対に渡せない。今すぐそこで止まって！", boxWidthPx: 145, boxHeightPx: 92, fontSizePx: 17, shape: "oval" },
  { balloonId: "ml-vi", cutNumber: 3, locale: "vi", text: "Không thể nào! Tôi sẽ không bao giờ giao bản hợp đồng này cho anh đâu!", boxWidthPx: 145, boxHeightPx: 92, fontSizePx: 15, shape: "oval" },
  { balloonId: "ml-th", cutNumber: 3, locale: "th", text: "ไม่มีทางเด็ดขาด! ฉันจะไม่มีวันส่งสัญญาฉบับนี้ให้คุณตอนนี้แน่นอน!", boxWidthPx: 145, boxHeightPx: 96, fontSizePx: 15, shape: "oval" },
  { balloonId: "ml-id", cutNumber: 3, locale: "id", text: "Mustahil! Aku tidak akan pernah menyerahkan perjanjian pertanggungjawaban ini!", boxWidthPx: 145, boxHeightPx: 92, fontSizePx: 15, shape: "oval" },
  { balloonId: "ml-es", cutNumber: 3, locale: "es", text: "¡Imposible! ¡Jamás te entregaré este contrato confidencial bajo ninguna circunstancia!", boxWidthPx: 145, boxHeightPx: 92, fontSizePx: 15, shape: "oval" },
];

export const SAMPLE_EPISODE_ASSET_USAGES: readonly EpisodeAssetUsage[] = [
  { assetId: "asset-font-safe", assetName: "Pretendard Regular", assetKind: "font", licenseStatus: "commercial-verified", licenseProvider: "SIL OFL 1.1", usedInCuts: [1, 2, 3, 4, 5] },
  { assetId: "asset-font-nc", assetName: "손글씨 체험판 폰트(개인용)", assetKind: "font", licenseStatus: "non-commercial", licenseProvider: "개인 비상업 배포", usedInCuts: [7] },
  { assetId: "asset-3d-expired", assetName: "구형 역전 골목 3D 패키지", assetKind: "model-3d", licenseStatus: "commercial-verified", licenseProvider: "외부 마켓 연간 구독", usedInCuts: [4, 9], expiresAtIso: "2026-06-30" },
  { assetId: "asset-brush-unverified", assetName: "커뮤니티 공유 번개 브러시.abr", assetKind: "brush", licenseStatus: "unverified", licenseProvider: "출처 미확인", usedInCuts: [14] },
];

export const SAMPLE_VOICE_FEEDBACK_PRESETS: readonly { readonly labelKo: string; readonly role: "PD" | "AD"; readonly transcript: string }[] = [
  { labelKo: "14컷 눈빛 수정 (PD)", role: "PD", transcript: "14컷 주인공 눈빛 더 날카롭게" },
  { labelKo: "4컷 배경 상표 모자이크 (AD)", role: "AD", transcript: "4컷 배경 간판 상표 모자이크 긴급 처리해 주세요" },
  { labelKo: "12컷 오른손 단검 교정 (PD)", role: "PD", transcript: "12번 컷 주인공 오른손 단검 위치 이전 컷이랑 맞춰주세요" },
];
