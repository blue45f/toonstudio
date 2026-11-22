/**
 * 시선 동선(Eye-Flow) Z-패턴 분석기 및 말풍선 꼬리 얼굴/눈 가림 가드 타입 계약.
 *
 * DOM·React·Konva에 의존하지 않는 순수 기하 데이터 모델로,
 * `studio-eyeflow-geometry.ts` 엔진과 `StudioEyeFlowOverlay.tsx`·
 * `StudioEyeFlowSummaryRail.tsx` UI가 동일한 불변 계약을 공유한다.
 */

export interface EyeFlowPoint {
  readonly x: number;
  readonly y: number;
}

export interface EyeFlowRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 읽기 방향: 한국어/글로벌 웹툰(좌→우·상→하 Z-패턴) 또는 일본 만화(우→좌·상→하). */
export type EyeFlowReadingDirection = "ltr-ttb" | "rtl-ttb";

/** 시선 흐름 기준 패턴: Z-패턴, S-패턴(지그재그 사행), 또는 자동 판별. */
export type EyeFlowPatternMode = "z-pattern" | "s-pattern" | "auto";

/** 감지된 시선 동선 패턴 분류. */
export type EyeFlowPatternKind = "z-pattern" | "s-pattern" | "vertical-scroll" | "mixed";

/** 1클릭 3종 컷 리듬 프리셋. */
export type CutRhythmPresetId =
  | "tension-escalation"
  | "comedy-tempo"
  | "emotional-lingering";

export interface EyeFlowBalloonInput {
  readonly id: string;
  readonly bounds: EyeFlowRect;
  /** 명시적 읽기 순번(1부터 시작). 생략 시 입력 순서를 읽기 순번으로 사용한다. */
  readonly readingOrder?: number;
  readonly text?: string;
  /** 꼬리 시작점(말풍선 외곽). 생략 시 말풍선 경계에서 tailTip 방향으로 자동 계산한다. */
  readonly tailBase?: EyeFlowPoint;
  /** 주 꼬리 끝점(화자 방향, 캔버스 좌표). */
  readonly tailTip?: EyeFlowPoint;
  /** 추가 꼬리 끝점 목록(2인 동시 대사 등). */
  readonly extraTailTips?: readonly EyeFlowPoint[];
  /** 소속 컷 ID(선택). */
  readonly cutId?: string | null;
}

export interface EyeFlowFaceRegion {
  readonly id: string;
  readonly label?: string;
  /** 캐릭터 얼굴 영역 바운딩 박스(캔버스 좌표). */
  readonly faceBounds: EyeFlowRect;
  /** 캐릭터 눈 영역 바운딩 박스. 생략 시 얼굴 상단~중단 표준 비율로 자동 유도한다. */
  readonly eyeBounds?: EyeFlowRect;
  /** 소속 컷 ID(선택). */
  readonly cutId?: string | null;
}

export interface EyeFlowCutBounds {
  readonly id: string;
  readonly bounds: EyeFlowRect;
  /** 컷 시각 밀도(0..1). 생략 시 컷 내 요소 수·면적으로 자동 추정한다. */
  readonly visualDensity01?: number;
  /** 클라이맥스/반전 비트 여부. */
  readonly isClimaxBeat?: boolean;
  /** 클라이맥스 강도(0..1). */
  readonly climaxIntensity01?: number;
}

export interface MobileSpoilerGuardConfig {
  /** 모바일 기준 뷰포트 폭(CSS px). 기본 390. */
  readonly viewportWidthPx: number;
  /** 모바일 기준 뷰포트 높이(CSS px). 기본 844. */
  readonly viewportHeightPx: number;
  /** 가드 적용 범위: 연속 대사 전체 또는 클라이맥스 컷 전환만. */
  readonly scope: "all-consecutive-dialogue" | "climax-only";
  /** 추가 안전 여유(캔버스 px). 기본 0. */
  readonly extraMarginPx?: number;
}

export interface EyeFlowAnalysisConfig {
  /** 다음 말풍선 중심이 이전보다 이 값(px) 이상 위쪽이면 상향 역주행으로 판정. */
  readonly upwardBacktrackThresholdPx: number;
  /** 같은 행(높이)에서 반대 방향 이동이 이 값(px)을 넘으면 행 내 역주행으로 판정. */
  readonly horizontalBacktrackThresholdPx: number;
  /** 두 말풍선을 같은 가로 읽기 행으로 묶는 수직 허용 오차(px). */
  readonly rowBandTolerancePx: number;
  /** 꼬리 보정 좌표를 산출할 때 얼굴/눈 경계 바깥으로 확보할 안전 여백(px). */
  readonly tailClearanceMarginPx: number;
  /** 말풍선 본체가 얼굴 면적의 이 비율 이상을 덮으면 가림 경고를 발생시킨다. */
  readonly faceBodyOverlapRatioThreshold: number;
}

export interface EyeFlowAnalysisInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly balloons: readonly EyeFlowBalloonInput[];
  readonly faces: readonly EyeFlowFaceRegion[];
  readonly cuts?: readonly EyeFlowCutBounds[];
  readonly direction?: EyeFlowReadingDirection;
  readonly patternMode?: EyeFlowPatternMode;
  readonly mobileSpoilerGuard?: Partial<MobileSpoilerGuardConfig>;
  readonly config?: Partial<EyeFlowAnalysisConfig>;
}

export interface SegmentIntersection {
  readonly point: EyeFlowPoint;
  readonly tA: number;
  readonly tB: number;
}

export interface SegmentAabbIntersection {
  readonly tEnter: number;
  readonly tExit: number;
  readonly entryPoint: EyeFlowPoint;
  readonly exitPoint: EyeFlowPoint;
  readonly midpoint: EyeFlowPoint;
  readonly clippedLength: number;
}

export interface AabbOverlap {
  readonly rect: EyeFlowRect;
  readonly area: number;
  readonly targetCoverageRatio: number;
}

export interface EyeFlowResolvedTail {
  readonly base: EyeFlowPoint;
  readonly tip: EyeFlowPoint;
  readonly tailIndex: number;
}

export interface EyeFlowNode {
  readonly balloonId: string;
  readonly sequenceNumber: number;
  readonly readingOrder: number;
  readonly center: EyeFlowPoint;
  readonly bounds: EyeFlowRect;
  readonly textPreview: string;
  readonly primaryTail: EyeFlowResolvedTail | null;
  readonly tails: readonly EyeFlowResolvedTail[];
  readonly cutId: string | null;
}

export type EyeFlowTransitionSeverity = "ok" | "warning" | "critical";

export type EyeFlowTransitionReason =
  | "natural-z-right"
  | "natural-z-sweep"
  | "natural-s-serpentine"
  | "natural-vertical"
  | "upward-reversal"
  | "upward-left-jump"
  | "same-row-backtrack"
  | "s-pattern-backtrack";

export interface EyeFlowSegment {
  readonly id: string;
  readonly fromBalloonId: string;
  readonly toBalloonId: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly from: EyeFlowPoint;
  readonly to: EyeFlowPoint;
  readonly dx: number;
  readonly dy: number;
  readonly distancePx: number;
  readonly angleDeg: number;
  readonly isReversal: boolean;
  readonly reason: EyeFlowTransitionReason;
  readonly severity: EyeFlowTransitionSeverity;
  readonly messageKo: string;
  readonly detailKo: string;
}

export interface TailCrossingWarning {
  readonly id: string;
  readonly firstBalloonId: string;
  readonly secondBalloonId: string;
  readonly firstSequence: number;
  readonly secondSequence: number;
  readonly firstTailIndex: number;
  readonly secondTailIndex: number;
  readonly intersectionPoint: EyeFlowPoint;
  readonly severity: TailOcclusionSeverity;
  readonly messageKo: string;
  readonly detailKo: string;
}

export interface MobileViewportSpoilerRisk {
  readonly id: string;
  readonly prevBalloonId: string;
  readonly nextBalloonId: string;
  readonly prevSequence: number;
  readonly nextSequence: number;
  readonly prevCutId: string | null;
  readonly nextCutId: string | null;
  readonly sameCut: boolean;
  /** 이전 말풍선 하단에서 다음 말풍선 상단까지의 세로 간격(캔버스 px). */
  readonly verticalGapPx: number;
  /** 390×844 모바일 1뷰포트에 해당하는 캔버스 높이(px). */
  readonly requiredViewportSpanPx: number;
  /** 모바일 390×844 기준 실제 화면 간격(CSS px). */
  readonly effectiveScreenGapPx: number;
  /** 동시 노출을 차단하기 위해 추가로 확보해야 할 최소 거터 높이(캔버스 px). */
  readonly requiredGutterAddPx: number;
  readonly severity: TailOcclusionSeverity;
  readonly messageKo: string;
  readonly detailKo: string;
}

export type TailOcclusionKind =
  | "tail-crosses-eyes"
  | "tail-crosses-face"
  | "body-covers-eyes"
  | "body-covers-face";

export type TailOcclusionSeverity = "warning" | "critical";

export interface TailOcclusionWarning {
  readonly id: string;
  readonly balloonId: string;
  readonly sequenceNumber: number;
  readonly faceId: string;
  readonly faceLabel: string;
  readonly kind: TailOcclusionKind;
  readonly severity: TailOcclusionSeverity;
  readonly intersectionPoint: EyeFlowPoint;
  readonly tailBase: EyeFlowPoint | null;
  readonly originalTailTip: EyeFlowPoint | null;
  readonly recommendedTailTip: EyeFlowPoint | null;
  readonly overlapRatio: number;
  readonly messageKo: string;
  readonly detailKo: string;
}

export interface ResolvedEyeFlowFaceRegion extends EyeFlowFaceRegion {
  readonly label: string;
  readonly resolvedEyeBounds: EyeFlowRect;
}

export type EyeFlowHealthStatus = "clear" | "caution" | "blocked";

export interface EyeFlowAnalysisResult {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly direction: EyeFlowReadingDirection;
  readonly detectedPattern: EyeFlowPatternKind;
  readonly nodes: readonly EyeFlowNode[];
  readonly segments: readonly EyeFlowSegment[];
  readonly reversals: readonly EyeFlowSegment[];
  readonly occlusions: readonly TailOcclusionWarning[];
  readonly tailCrossings: readonly TailCrossingWarning[];
  readonly spoilerRisks: readonly MobileViewportSpoilerRisk[];
  readonly faces: readonly ResolvedEyeFlowFaceRegion[];
  readonly suggestedOrderIds: readonly string[];
  readonly score: number;
  readonly status: EyeFlowHealthStatus;
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly summaryKo: string;
}
