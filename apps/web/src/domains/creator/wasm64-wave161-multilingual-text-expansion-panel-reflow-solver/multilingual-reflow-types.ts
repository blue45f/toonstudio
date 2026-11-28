/**
 * Wave 161 — 웹툰 6개국어 텍스트 확장·축소 자동 컷 높이 리플로우 및 거터 재조정 솔버 타입 계약.
 *
 * 지원 언어: 한국어(ko), 영어(en), 일본어(ja), 중국어 번체(zh-Hant), 태국어(th), 인도네시아어(id).
 */

/** 웹툰 현지화 대상 6개 로케일. */
export type WebtoonLocalizationLocale = "ko" | "en" | "ja" | "zh-Hant" | "th" | "id";

/** 지원하는 6개 로케일의 고정 순서 목록. */
export const SUPPORTED_LOCALIZATION_LOCALES: readonly WebtoonLocalizationLocale[] = [
  "ko",
  "en",
  "ja",
  "zh-Hant",
  "th",
  "id",
];

/** 문자 체계별 줄바꿈 전략. */
export type ScriptWrappingMode = "cjk-grid" | "latin-word" | "thai-cluster";

/** 컷 내부 텍스트 요소 종류. */
export type BalloonElementKind = "speech" | "thought" | "narration" | "sfx" | "background-sign";

/** 말풍선·텍스트 블록의 현지화 수용 상태. */
export type BalloonOverflowStatus =
  | "fits"
  | "font-adjusted"
  | "balloon-expanded"
  | "panel-reflow-required";

/** 리플로우 검수 종합 판정. */
export type ReflowAuditVerdict = "PASS" | "WARN" | "FAIL";

/** 2차원 직사각형 좌표(px). */
export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 로케일별 조판·확장 메트릭 프로파일. */
export interface LocaleTypographyProfile {
  readonly locale: WebtoonLocalizationLocale;
  readonly displayNameKo: string;
  readonly nativeLabel: string;
  readonly wrappingMode: ScriptWrappingMode;
  /** 한국어 원문(1.0) 대비 기대 텍스트 길이 확장 배수. */
  readonly charExpansionFactor: number;
  /** 1em 기준 평균 글리프 전진 폭 비율. */
  readonly averageGlyphWidthEm: number;
  /** 기본 행간 배수(fontSizePx 대비). */
  readonly baseLineHeightRatio: number;
  /** 상하 결합 발음기호·성조 여유 배수(태국어는 >= 1.22). */
  readonly diacriticHeadroomMultiplier: number;
  /** 모바일 웹툰 가독성 보장을 위한 최소 폰트 크기(px). */
  readonly minReadabilityFontPx: number;
  /** 말풍선 수평 패딩 가중치. */
  readonly horizontalPaddingScale: number;
  /** 말풍선 수직 패딩 가중치. */
  readonly verticalPaddingScale: number;
  /** 세로쓰기 옵션 지원 여부(효과음·배경 간판 등). */
  readonly prefersVerticalWriting: boolean;
}

/** 캐릭터 얼굴·눈 등 말풍선이 절대 가리면 안 되는 보호 영역. */
export interface ProtectedFocalZone {
  readonly zoneId: string;
  readonly label: string;
  readonly kind: "face" | "eyes" | "action-focal";
  readonly rect: Rect2D;
  readonly clearanceMarginPx?: number;
}

/** 컷 내부 말풍선·배경 간판·효과음 블록 명세. */
export interface TextBlockSpec {
  readonly blockId: string;
  readonly kind: BalloonElementKind;
  readonly baselineRect: Rect2D;
  readonly baselineFontPx: number;
  readonly baselineText: string;
  readonly localizedTexts: Readonly<Partial<Record<WebtoonLocalizationLocale, string>>>;
  /** 기준 폭 대비 허용 최대 수평 확장 배수(기본 1.35). */
  readonly maxWidthExpansionRatio?: number;
  /** 기준 높이 대비 허용 최대 수직 확장 배수(기본 1.95). */
  readonly maxHeightExpansionRatio?: number;
  /** 보호 영역 회피를 위한 위치 이동 허용 여부(기본 true). */
  readonly allowReposition?: boolean;
  /** 배치 우선순위(작을수록 먼저 자리 확보). */
  readonly priority?: number;
}

/** 세로 스크롤 웹툰 단일 컷 명세. */
export interface WebtoonPanelSpec {
  readonly panelId: string;
  readonly panelIndex: number;
  readonly widthPx: number;
  readonly baselineHeightPx: number;
  readonly baselineGutterAfterPx: number;
  readonly minHeightPx?: number;
  readonly allowVerticalContraction?: boolean;
  readonly protectedZones: readonly ProtectedFocalZone[];
  readonly textBlocks: readonly TextBlockSpec[];
}

/** 리플로우 솔버 제약 조건. */
export interface ReflowSolverConstraints {
  /** 컷 사이 최소 거터 간격(px). */
  readonly minGutterPx: number;
  /** 컷 사이 최대 거터 간격(px). */
  readonly maxGutterPx: number;
  /** 컷 높이 최대 확장 배수(예: 1.45 = +45%). */
  readonly maxPanelHeightScale: number;
  /** 축소 허용 시 컷 높이 최소 배수(예: 0.85). */
  readonly minPanelHeightScale: number;
  /** 컷 테두리 안전 여백(px). */
  readonly panelSafeMarginPx: number;
  /** 말풍선 간 최소 이격 거리(px). */
  readonly minBalloonGapPx: number;
  /** 보호 영역 탐색 시 우선 확보하는 여유 완충(px). */
  readonly faceSafetyPaddingPx: number;
  /** 원문 폰트 대비 허용 최소 축소 비율(minReadabilityFontPx 하한 우선). */
  readonly minFontScaleRatio: number;
  /** 컷 높이 변화에 비례해 거터를 재조정하는 호흡 유지 가중치(0..1). */
  readonly targetPacingWeight: number;
  /** 축소 로케일에서 컷 높이 자동 축소 허용 여부. */
  readonly allowPanelContraction: boolean;
}

/** 단일 말풍선·텍스트 블록의 현지화 레이아웃 추정 결과. */
export interface LocalizedBalloonEstimate {
  readonly blockId: string;
  readonly kind: BalloonElementKind;
  readonly locale: WebtoonLocalizationLocale;
  readonly text: string;
  readonly usedSyntheticProjection: boolean;
  readonly baselineCharCount: number;
  readonly localizedCharCount: number;
  readonly expansionRatio: number;
  readonly baselineFontPx: number;
  readonly resolvedFontPx: number;
  readonly effectiveLineHeightPx: number;
  readonly wrappedLines: readonly string[];
  readonly lineCount: number;
  readonly requiredInnerWidthPx: number;
  readonly requiredInnerHeightPx: number;
  readonly requiredOuterWidthPx: number;
  readonly requiredOuterHeightPx: number;
  readonly baselineOuterWidthPx: number;
  readonly baselineOuterHeightPx: number;
  readonly widthDeltaPx: number;
  readonly heightDeltaPx: number;
  readonly overflowStatus: BalloonOverflowStatus;
  readonly unresolvableOverflowPx: number;
}

/** 말풍선 재배치 전략 구분. */
export type BalloonPlacementStrategy =
  | "in-place"
  | "expanded-in-place"
  | "repositioned-horizontal"
  | "repositioned-vertical"
  | "panel-extended-below"
  | "capped-overflow";

/** 리플로우 완료 후 개별 텍스트 블록 결과. */
export interface ReflowedTextBlock {
  readonly blockId: string;
  readonly kind: BalloonElementKind;
  readonly baselineRect: Rect2D;
  readonly resolvedRect: Rect2D;
  readonly estimate: LocalizedBalloonEstimate;
  readonly shiftXPx: number;
  readonly shiftYPx: number;
  readonly faceOcclusionAreaPx: number;
  readonly balloonOverlapAreaPx: number;
  readonly outOfPanelBoundsPx: number;
  readonly overflowUnresolved: boolean;
  readonly placementStrategy: BalloonPlacementStrategy;
}

/** 리플로우 완료 후 단일 컷 결과. */
export interface ReflowedPanelResult {
  readonly panelId: string;
  readonly panelIndex: number;
  readonly widthPx: number;
  readonly baselineHeightPx: number;
  readonly resolvedHeightPx: number;
  readonly heightDeltaPx: number;
  readonly heightScaleRatio: number;
  readonly heightCapReached: boolean;
  readonly baselineYStartPx: number;
  readonly baselineYEndPx: number;
  readonly yStartPx: number;
  readonly yEndPx: number;
  readonly baselineGutterAfterPx: number;
  readonly gutterAfterPx: number;
  readonly gutterDeltaPx: number;
  readonly protectedZones: readonly ProtectedFocalZone[];
  readonly blocks: readonly ReflowedTextBlock[];
  readonly totalFaceOcclusionAreaPx: number;
  readonly totalBalloonOverlapAreaPx: number;
  readonly overflowUnresolvedCount: number;
  readonly warnings: readonly string[];
}

/** 단일 로케일 기준 회차 전체 리플로우 결과. */
export interface MultilingualEpisodeReflowResult {
  readonly episodeId: string;
  readonly targetLocale: WebtoonLocalizationLocale;
  readonly baselineLocale: "ko";
  readonly constraints: ReflowSolverConstraints;
  readonly panels: readonly ReflowedPanelResult[];
  readonly baselineTotalScrollHeightPx: number;
  readonly resolvedTotalScrollHeightPx: number;
  readonly totalHeightDeltaPx: number;
  readonly sumPanelHeightDeltasPx: number;
  readonly sumGutterDeltasPx: number;
  readonly heightGrowthPercent: number;
  readonly baselineAverageGutterPx: number;
  readonly resolvedAverageGutterPx: number;
  readonly minResolvedGutterPx: number;
  readonly pacingDriftRatio: number;
  readonly totalFaceOcclusionAreaPx: number;
  readonly totalBalloonOverlapAreaPx: number;
  readonly overflowUnresolvedCount: number;
  readonly heightCappedPanelCount: number;
  readonly monotonicCoordinatesValid: boolean;
  readonly exportReady: boolean;
  readonly verdict: ReflowAuditVerdict;
  readonly warnings: readonly string[];
}

/** 6개국어 매트릭스 감사 요약 항목. */
export interface LocaleMatrixEntry {
  readonly locale: WebtoonLocalizationLocale;
  readonly displayNameKo: string;
  readonly heightGrowthPercent: number;
  readonly totalHeightDeltaPx: number;
  readonly pacingDriftRatio: number;
  readonly totalFaceOcclusionAreaPx: number;
  readonly totalBalloonOverlapAreaPx: number;
  readonly overflowUnresolvedCount: number;
  readonly exportReady: boolean;
  readonly verdict: ReflowAuditVerdict;
  readonly stressRank: number;
}

/** 6개국어 동시 리플로우 감사 매트릭스 결과. */
export interface EpisodeMultilingualMatrixAudit {
  readonly episodeId: string;
  readonly localesAudited: readonly WebtoonLocalizationLocale[];
  readonly resultsByLocale: Readonly<Partial<Record<WebtoonLocalizationLocale, MultilingualEpisodeReflowResult>>>;
  readonly rankedEntries: readonly LocaleMatrixEntry[];
  readonly worstCaseLocale: WebtoonLocalizationLocale;
  readonly mostCompactLocale: WebtoonLocalizationLocale;
  readonly maxHeightGrowthPercent: number;
  readonly minHeightGrowthPercent: number;
  readonly zeroOcclusionAllLocales: boolean;
  readonly zeroOverlapAllLocales: boolean;
  readonly allLocalesExportReady: boolean;
  readonly overallVerdict: ReflowAuditVerdict;
}

/** 최상위 솔버 실행 입력 시나리오. */
export interface MultilingualReflowScenarioInput {
  readonly episodeId: string;
  readonly titleKo: string;
  readonly panels: readonly WebtoonPanelSpec[];
  readonly targetLocales?: readonly WebtoonLocalizationLocale[];
  readonly focusLocale?: WebtoonLocalizationLocale;
  readonly constraints?: Partial<ReflowSolverConstraints>;
}

/** 최상위 솔버 통합 산출물. */
export interface MultilingualReflowSolverOutput {
  readonly episodeId: string;
  readonly titleKo: string;
  readonly focusLocale: WebtoonLocalizationLocale;
  readonly matrixAudit: EpisodeMultilingualMatrixAudit;
  readonly focusResult: MultilingualEpisodeReflowResult;
  readonly manifestFingerprintSha256: string;
  readonly diagnosticSvg: string;
  readonly summaryKo: string;
}

/** 기본 리플로우 솔버 제약값. */
export const DEFAULT_REFLOW_SOLVER_CONSTRAINTS: ReflowSolverConstraints = {
  minGutterPx: 24,
  maxGutterPx: 180,
  maxPanelHeightScale: 1.45,
  minPanelHeightScale: 0.85,
  panelSafeMarginPx: 18,
  minBalloonGapPx: 10,
  faceSafetyPaddingPx: 6,
  minFontScaleRatio: 0.84,
  targetPacingWeight: 0.72,
  allowPanelContraction: false,
};

/** 부분 제약을 안전한 기본값과 병합해 정규화한다. */
export function resolveReflowConstraints(
  partial?: Partial<ReflowSolverConstraints>,
): ReflowSolverConstraints {
  const minGutterPx = Math.max(8, Math.round(partial?.minGutterPx ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.minGutterPx));
  const maxGutterPx = Math.max(
    minGutterPx,
    Math.round(partial?.maxGutterPx ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.maxGutterPx),
  );
  const maxPanelHeightScale = Math.max(
    1.0,
    partial?.maxPanelHeightScale ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.maxPanelHeightScale,
  );
  const minPanelHeightScale = Math.min(
    1.0,
    Math.max(0.65, partial?.minPanelHeightScale ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.minPanelHeightScale),
  );
  const panelSafeMarginPx = Math.max(
    4,
    Math.round(partial?.panelSafeMarginPx ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.panelSafeMarginPx),
  );
  const minBalloonGapPx = Math.max(
    2,
    Math.round(partial?.minBalloonGapPx ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.minBalloonGapPx),
  );
  const faceSafetyPaddingPx = Math.max(
    0,
    Math.round(partial?.faceSafetyPaddingPx ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.faceSafetyPaddingPx),
  );
  const minFontScaleRatio = Math.min(
    1.0,
    Math.max(0.6, partial?.minFontScaleRatio ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.minFontScaleRatio),
  );
  const targetPacingWeight = Math.min(
    1.0,
    Math.max(0, partial?.targetPacingWeight ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.targetPacingWeight),
  );

  return {
    minGutterPx,
    maxGutterPx,
    maxPanelHeightScale,
    minPanelHeightScale,
    panelSafeMarginPx,
    minBalloonGapPx,
    faceSafetyPaddingPx,
    minFontScaleRatio,
    targetPacingWeight,
    allowPanelContraction:
      partial?.allowPanelContraction ?? DEFAULT_REFLOW_SOLVER_CONSTRAINTS.allowPanelContraction,
  };
}
