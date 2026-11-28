/**
 * Wave 137 — 웹툰 컷 내 독자 시선 동선(Z/F/S-Curve Gaze Flow)·시각적 무게중심 및
 * 컷 전환 시선 연속성(Gaze Hand-off) 솔버의 계약 타입과 상수.
 *
 * 순수 ES2017 strict TypeScript(`verbatimModuleSyntax` 준수)로 작성한다.
 */

export type GazeReadingDirection =
  | "vertical-webtoon-ltr"
  | "page-comic-ltr"
  | "manga-rtl";

export type GazeElementKind =
  | "dialogue-balloon"
  | "character-face"
  | "action-focal"
  | "sfx-lettering"
  | "lead-line-arrow";

export type GazeFlowPattern =
  | "z-flow"
  | "s-flow"
  | "vertical-drop"
  | "diagonal-slash"
  | "tangled-zigzag";

export type GazeViolationCode =
  | "balloon-reading-order-reversal"
  | "self-intersecting-gaze-path"
  | "abrupt-handoff-jump"
  | "outward-gaze-leak";

export type GazeViolationSeverity = "error" | "warning";

export type PanelBoundaryEdge = "left" | "right" | "top" | "bottom";

export interface GazePoint2D {
  readonly x: number;
  readonly y: number;
}

export interface GazeVector2D {
  readonly dx: number;
  readonly dy: number;
}

export interface GazePanelElementInput {
  readonly elementId: string;
  readonly kind: GazeElementKind;
  readonly labelKo?: string;
  /** 컷 내부 정규화 좌표(0..1, 좌상단 기준) */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 시각 대비(0..1, 미지정 시 요소 유형별 기본값 사용) */
  readonly contrast?: number;
  /** 말풍선 발화 순서 또는 의도 시선 순번(1부터 시작 권장) */
  readonly scriptOrder?: number;
  /** 캐릭터 얼굴 시선 방향 또는 유도선 진행 벡터 */
  readonly gazeDir?: GazeVector2D;
  /** 시각 강조 배수(0.5..2.0, 기본값 1.0) */
  readonly prominence?: number;
  /** 자동 교정 시 위치 고정 여부 */
  readonly locked?: boolean;
}

export interface GazePanelInput {
  readonly panelId: string;
  readonly titleKo?: string;
  readonly widthPx: number;
  readonly heightPx: number;
  /** 다음 컷과의 세로/가로 여백(px, 기본 120px) */
  readonly gutterAfterPx?: number;
  /** 출판 만화 페이지 레이아웃 행 인덱스(선택) */
  readonly pageRow?: number;
  /** 출판 만화 페이지 레이아웃 열 인덱스(선택) */
  readonly pageCol?: number;
  readonly elements: readonly GazePanelElementInput[];
}

export interface GazeEpisodeInput {
  readonly episodeId: string;
  readonly titleKo?: string;
  readonly readingDirection: GazeReadingDirection;
  readonly panels: readonly GazePanelInput[];
}

export interface NormalizedGazeElement {
  readonly elementId: string;
  readonly kind: GazeElementKind;
  readonly labelKo: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cx: number;
  readonly cy: number;
  readonly contrast: number;
  readonly scriptOrder: number | null;
  readonly gazeDir: GazeVector2D | null;
  readonly prominence: number;
  readonly locked: boolean;
}

export interface NormalizedGazePanel {
  readonly panelId: string;
  readonly titleKo: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly aspectRatio: number;
  readonly gutterAfterPx: number;
  readonly pageRow: number | null;
  readonly pageCol: number | null;
  readonly elements: readonly NormalizedGazeElement[];
}

export interface VisualWeightBreakdown {
  readonly elementId: string;
  readonly kind: GazeElementKind;
  readonly areaNorm: number;
  readonly contrast: number;
  readonly kindWeight: number;
  readonly prominence: number;
  readonly weight: number;
  readonly normalizedShare: number;
}

export interface VisualMassSummary {
  readonly totalWeight: number;
  readonly centerOfVisualMass: GazePoint2D;
  /** 좌(-1) ~ 중앙(0) ~ 우(+1) 편향 */
  readonly horizontalBias: number;
  /** 상(-1) ~ 중앙(0) ~ 하(+1) 편향 */
  readonly verticalBias: number;
  readonly leftWeightRatio: number;
  readonly rightWeightRatio: number;
  /** 좌우 균형 점수(0~100, 100이 완벽 균형) */
  readonly visualBalanceScore: number;
  readonly elementWeights: readonly VisualWeightBreakdown[];
}

export interface VisualReadingOrderEntry {
  readonly elementId: string;
  readonly kind: GazeElementKind;
  readonly visualRank: number;
  readonly rowBandIndex: number;
  readonly scriptOrder: number | null;
  readonly center: GazePoint2D;
}

export interface ReadingOrderReversalPair {
  readonly earlierVisualId: string;
  readonly laterVisualId: string;
  readonly earlierScriptOrder: number;
  readonly laterScriptOrder: number;
  readonly earlierVisualRank: number;
  readonly laterVisualRank: number;
}

export interface GazePathIntersection {
  readonly firstSegmentIndex: number;
  readonly secondSegmentIndex: number;
  readonly firstEdgeElementIds: readonly [string, string];
  readonly secondEdgeElementIds: readonly [string, string];
  readonly point: GazePoint2D;
}

export interface OutwardGazeLeakFinding {
  readonly elementId: string;
  readonly kind: GazeElementKind;
  readonly leakEdge: PanelBoundaryEdge;
  readonly gazeDir: GazeVector2D;
  readonly rayDistanceToEdge: number;
}

export interface GazeFlowViolation {
  readonly code: GazeViolationCode;
  readonly severity: GazeViolationSeverity;
  readonly panelId: string;
  readonly nextPanelId: string | null;
  readonly elementIds: readonly string[];
  readonly metricValue: number;
  readonly messageKo: string;
}

export interface GazePathNode {
  readonly stepIndex: number;
  readonly elementId: string;
  readonly kind: GazeElementKind;
  readonly labelKo: string;
  readonly center: GazePoint2D;
  readonly visualRank: number;
  readonly scriptOrder: number | null;
}

export interface PanelGazeAuditResult {
  readonly panelIndex: number;
  readonly panel: NormalizedGazePanel;
  readonly visualMass: VisualMassSummary;
  readonly visualReadingOrder: readonly VisualReadingOrderEntry[];
  readonly gazePath: readonly GazePathNode[];
  readonly pattern: GazeFlowPattern;
  readonly meanTurnAngleDeg: number;
  readonly maxTurnAngleDeg: number;
  readonly totalPathLengthNorm: number;
  readonly backtrackingDistanceNorm: number;
  readonly backtrackingRatio: number;
  readonly entryPoint: GazePoint2D;
  readonly exitPoint: GazePoint2D;
  readonly exitTangent: GazeVector2D;
  readonly exitDirection: PanelBoundaryEdge;
  readonly reversals: readonly ReadingOrderReversalPair[];
  readonly intersections: readonly GazePathIntersection[];
  readonly outwardLeaks: readonly OutwardGazeLeakFinding[];
  readonly violations: readonly GazeFlowViolation[];
  /** 컷 시선 동선 종합 점수(0~100) */
  readonly panelFlowScore: number;
}

export interface CutHandoffAuditResult {
  readonly fromPanelIndex: number;
  readonly toPanelIndex: number;
  readonly fromPanelId: string;
  readonly toPanelId: string;
  readonly exitPoint: GazePoint2D;
  readonly entryPoint: GazePoint2D;
  readonly exitLeadVector: GazeVector2D;
  readonly targetVector: GazeVector2D;
  /** 출구점과 다음 진입점의 수평 도약 비율(0..1) */
  readonly horizontalJumpRatio: number;
  /** 레이아웃 축 기준 실효 도약 비율(0..1) */
  readonly effectiveJumpRatio: number;
  /** 시선 유도 방향과 실제 다음 컷 진입 벡터의 코사인 정합성(-1..1) */
  readonly exitVectorAlignment: number;
  readonly isSameHorizontalRow: boolean;
  /** 핸드오프 연속성 점수(0~100) */
  readonly handoffScore: number;
  readonly abruptJumpDetected: boolean;
  readonly violation: GazeFlowViolation | null;
}

export interface GazeAuditOptions {
  /** 행 밴드 묶음 허용 세로 오차(정규화 높이, 미지정 시 읽기 방향별 기본값) */
  readonly rowBandToleranceY?: number;
  /** 급격한 컷 간 수평 도약 임계값(기본 0.55) */
  readonly maxHorizontalJumpRatio?: number;
  /** 외곽 시선 이탈 판정 경계 광선 거리(기본 0.42) */
  readonly maxOutwardLeakRayDist?: number;
}

export interface EpisodeGazeAuditResult {
  readonly episodeId: string;
  readonly titleKo: string;
  readonly readingDirection: GazeReadingDirection;
  readonly panels: readonly PanelGazeAuditResult[];
  readonly handoffs: readonly CutHandoffAuditResult[];
  readonly violations: readonly GazeFlowViolation[];
  readonly violationCounts: Readonly<Record<GazeViolationCode, number>>;
  readonly overallGazeFlowScore: number;
  readonly averagePanelFlowScore: number;
  readonly averageVisualBalanceScore: number;
  readonly averageHandoffScore: number;
  readonly manifestSha256: string;
}

export interface BalloonOptimizationOptions extends GazeAuditOptions {
  /** 컷 내부 안전 여백(0.01..0.12, 기본 0.04) */
  readonly safeMarginNorm?: number;
  /** 캐릭터 얼굴 회피 여유 간격(0..0.08, 기본 0.015) */
  readonly faceClearanceNorm?: number;
  /** 말풍선 간 최소 간격(0..0.06, 기본 0.015) */
  readonly balloonGapNorm?: number;
  /** 역독·교차가 없어도 핸드오프/흐름 개선을 위해 모든 컷을 최적화할지 여부(기본 false) */
  readonly optimizeAllPanels?: boolean;
}

export interface BalloonAdjustmentRecord {
  readonly panelId: string;
  readonly elementId: string;
  readonly scriptOrder: number | null;
  readonly beforeBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly afterBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly displacementNorm: number;
}

export interface BalloonOptimizationOutcome {
  readonly optimizedEpisode: GazeEpisodeInput;
  readonly beforeAudit: EpisodeGazeAuditResult;
  readonly afterAudit: EpisodeGazeAuditResult;
  readonly adjustments: readonly BalloonAdjustmentRecord[];
  readonly optimizedPanelIds: readonly string[];
  readonly scoreDelta: number;
  readonly remainingReversals: number;
  readonly remainingIntersections: number;
  readonly allFacesCleared: boolean;
  readonly allInsideSafeMargin: boolean;
  readonly manifestSha256: string;
}

export interface GazeFlowSvgOptions {
  /** 썸네일 컷 가로 폭(px, 기본 256) */
  readonly panelThumbWidthPx?: number;
  /** 썸네일 컷 최대 세로 높이(px, 기본 340) */
  readonly maxPanelThumbHeightPx?: number;
  /** 컷 간 브리지 간격(px, 기본 56) */
  readonly panelGapPx?: number;
  /** 제목 배너 표시 여부(기본 true) */
  readonly includeHeader?: boolean;
  /** 무게중심 십자선 표시 여부(기본 true) */
  readonly showCenterOfMass?: boolean;
}

export const ELEMENT_VISUAL_WEIGHT_MULTIPLIER: Readonly<Record<GazeElementKind, number>> = {
  "character-face": 1.65,
  "action-focal": 1.45,
  "dialogue-balloon": 1.35,
  "sfx-lettering": 1.2,
  "lead-line-arrow": 0.85,
};

export const DEFAULT_ELEMENT_CONTRAST: Readonly<Record<GazeElementKind, number>> = {
  "dialogue-balloon": 0.9,
  "action-focal": 0.88,
  "character-face": 0.85,
  "sfx-lettering": 0.82,
  "lead-line-arrow": 0.72,
};

export const DEFAULT_ROW_BAND_TOLERANCE_Y: Readonly<Record<GazeReadingDirection, number>> = {
  "vertical-webtoon-ltr": 0.085,
  "page-comic-ltr": 0.14,
  "manga-rtl": 0.14,
};

export const READING_DIRECTION_LABELS_KO: Readonly<Record<GazeReadingDirection, string>> = {
  "vertical-webtoon-ltr": "웹툰 세로 스크롤 (좌→우)",
  "page-comic-ltr": "출판 만화 페이지 (좌→우)",
  "manga-rtl": "일본식 만화 페이지 (우→좌)",
};

export const GAZE_PATTERN_LABELS_KO: Readonly<Record<GazeFlowPattern, string>> = {
  "z-flow": "Z자 시선 흐름",
  "s-flow": "S자 곡선 흐름",
  "vertical-drop": "수직 낙하 흐름",
  "diagonal-slash": "대각 절단 흐름",
  "tangled-zigzag": "엉킴 지그재그",
};

export const GAZE_ELEMENT_LABELS_KO: Readonly<Record<GazeElementKind, string>> = {
  "dialogue-balloon": "말풍선",
  "character-face": "캐릭터 얼굴",
  "action-focal": "액션 포컬",
  "sfx-lettering": "효과음",
  "lead-line-arrow": "시선 유도선",
};

export const GAZE_VIOLATION_LABELS_KO: Readonly<Record<GazeViolationCode, string>> = {
  "balloon-reading-order-reversal": "말풍선 역독",
  "self-intersecting-gaze-path": "시선 경로 교차",
  "abrupt-handoff-jump": "컷 전환 급도약",
  "outward-gaze-leak": "외곽 시선 이탈",
};
