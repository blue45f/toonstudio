/**
 * Wave 157 — 카메라 화각·배경 압축·피사계 심도(CoC) & 관절 잘림 방지
 * 삼분할/황금비 샷 프레이밍 디렉터 공통 계약 타입.
 *
 * - 마스터 프레임 좌표계는 정규화 `[0, 1] x [0, 1]`(좌상단 원점, 우측 +X, 하단 +Y)을 사용한다.
 * - 순수 ES2017 strict TypeScript(`verbatimModuleSyntax` 준수).
 */

/** 35mm 풀프레임 표준 시네마·웹툰 초점거리 프리셋(mm). */
export type StandardFocalLengthMm = 18 | 24 | 35 | 50 | 85 | 135 | 200;

/** 35mm 풀프레임 센서 치수 계약(mm). */
export interface SensorDimensionsMm {
  readonly widthMm: number;
  readonly heightMm: number;
  /** 허용 착란원(Circle of Confusion) 기본 기준(mm, 풀프레임 표준 0.030mm). */
  readonly defaultCocMm: number;
}

/** 35mm 풀프레임 표준 센서 상수(36mm × 24mm, CoC 0.030mm). */
export const FULL_FRAME_35MM_SENSOR: SensorDimensionsMm = {
  widthMm: 36,
  heightMm: 24,
  defaultCocMm: 0.03,
};

/** 7종 표준 시네마/웹툰 초점거리 목록(오름차순). */
export const STANDARD_FOCAL_LENGTHS_MM: readonly StandardFocalLengthMm[] = [
  18, 24, 35, 50, 85, 135, 200,
];

/** 렌즈 화각 산출 결과(도 단위). */
export interface LensFieldOfView {
  readonly focalLengthMm: number;
  readonly sensorWidthMm: number;
  readonly sensorHeightMm: number;
  readonly sensorDiagonalMm: number;
  /** 수평 화각(deg). */
  readonly hfovDeg: number;
  /** 수직 화각(deg). */
  readonly vfovDeg: number;
  /** 대각 화각(deg). */
  readonly dfovDeg: number;
}

/** 표준 렌즈 프리셋 메타데이터. */
export interface CinemaLensPreset extends LensFieldOfView {
  readonly focalLengthMm: StandardFocalLengthMm;
  readonly labelKo: string;
  readonly categoryKo: string;
  readonly perspectiveFeelKo: string;
  readonly typicalUseKo: string;
  readonly recommendedFNumber: number;
}

/** 동일 피사체 화면 점유율 고정 시 초점거리별 배경 압축 계산 입력. */
export interface FocalBackgroundCompressionInput {
  /** 사용할 렌즈 초점거리(mm, 예: 18~200). */
  readonly focalLengthMm: number;
  /** 피사체 실제 물리 키 또는 기준 높이(m, 기본 1.70m). */
  readonly subjectHeightM?: number;
  /** 피사체가 수직 프레임에서 차지하는 비율(0.1~1.0, 기본 0.60). */
  readonly subjectFrameFillRatio?: number;
  /** 피사체 뒤 배경 물체까지의 물리 거리 `d_bg`(m, 기본 10.0m). */
  readonly backgroundDistanceM: number;
  /** 상대 배경 압축률을 비교할 기준 광각 초점거리(mm, 기본 24mm). */
  readonly referenceFocalLengthMm?: number;
  /** 센서 규격(생략 시 35mm 풀프레임). */
  readonly sensor?: SensorDimensionsMm;
}

/** 초점거리별 배경 압축 계산 결과. */
export interface FocalBackgroundCompressionResult {
  readonly focalLengthMm: number;
  readonly referenceFocalLengthMm: number;
  readonly subjectHeightM: number;
  readonly subjectFrameFillRatio: number;
  readonly verticalFrameSpanAtSubjectM: number;
  /** 동일 피사체 크기를 유지하기 위한 카메라-피사체 거리 `d_subject`(m). */
  readonly subjectDistanceM: number;
  /** 피사체-배경 거리 `d_bg`(m). */
  readonly backgroundDistanceM: number;
  /** 카메라-배경 총 거리 `d_subject + d_bg`(m). */
  readonly cameraToBackgroundM: number;
  /** 피사체 면 대비 배경 물체의 상대 겉보기 선형 크기(`d_subject / (d_subject + d_bg)`, 0..1). */
  readonly backgroundApparentScale: number;
  /** 기준 초점거리(`referenceFocalLengthMm`) 대비 상대 배경 확대·압축률(선형 배율). */
  readonly backgroundCompressionRatio: number;
  /** 기준 초점거리 대비 배경 겉보기 면적 확대 배율(`backgroundCompressionRatio^2`). */
  readonly backgroundAreaMagnification: number;
  /** 원근 소실 강도 지표(`1 - backgroundApparentScale`, 광각일수록 1에 가까움). */
  readonly perspectiveForeshorteningIndex: number;
  readonly fov: LensFieldOfView;
}

/** 박렌즈(Thin-Lens) 피사계 심도(DoF) 계산 입력. */
export interface DepthOfFieldInput {
  /** 렌즈 초점거리(mm). */
  readonly focalLengthMm: number;
  /** 조리개 값 F-number(예: 1.4 ~ 16). */
  readonly fNumber: number;
  /** 카메라-초점 피사체 거리(m). */
  readonly focusDistanceM: number;
  /** 허용 착란원 직경(mm, 기본 0.030mm). */
  readonly cocMm?: number;
  /** 착란원 직경을 평가할 임의 배경/피사체 거리 `zM`(m, 생략 시 `focusDistanceM * 2`). */
  readonly sampleBackgroundDistanceM?: number;
}

/** 배경 보케 분리 등급. */
export type BokehSeparationGrade =
  | "tack-sharp"
  | "subtle-falloff"
  | "cinematic-bokeh"
  | "creamy-isolation";

/** 박렌즈 피사계 심도 및 착란원 산출 결과. */
export interface DepthOfFieldResult {
  readonly focalLengthMm: number;
  readonly fNumber: number;
  readonly cocMm: number;
  readonly focusDistanceM: number;
  /** 과초점 거리(m). */
  readonly hyperfocalDistanceM: number;
  /** 근측 선명 한계 거리(m). */
  readonly nearFocusLimitM: number;
  /** 원측 선명 한계 거리(m, 과초점 이상 초점 시 `Infinity`). */
  readonly farFocusLimitM: number;
  /** 원측 한계 무한대 여부. */
  readonly isFarLimitInfinite: boolean;
  /** 총 피사계 심도(m, 무한대 가능). */
  readonly totalDofM: number;
  /** 초점 앞쪽 선명 구간(m). */
  readonly frontDofM: number;
  /** 초점 뒤쪽 선명 구간(m, 무한대 가능). */
  readonly rearDofM: number;
  /** 무한대 배경에서의 최대 물리 착란원 직경(mm). */
  readonly infinityBlurCircleMm: number;
  /** 착란원을 측정한 임의 거리 `zM`(m). */
  readonly sampleBackgroundDistanceM: number;
  /** 임의 거리 `zM`에서의 물리 착란원 직경(mm). */
  readonly blurCircleMm: number;
  /** 허용 착란원 대비 흐림 배율(`blurCircleMm / cocMm`, 1 이하이면 선명). */
  readonly blurRelativeToCoc: number;
  readonly isSampleInFocus: boolean;
  readonly bokehSeparationGrade: BokehSeparationGrade;
}

/** 2차원 정규 좌표(0..1). */
export interface NormalizedPoint2D {
  readonly x: number;
  readonly y: number;
}

/** 마스터 프레임 내 정규 크롭 사각형(0..1). */
export interface NormalizedCropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 인물 시선 방향. */
export type GazeDirection = "left" | "right" | "front";

/** 컷 경계 절단 금지 관절 종류. */
export type JointLandmarkKind = "neck" | "elbows" | "wrists" | "knees" | "ankles";

/** 권장 안전 절단 중간대 종류. */
export type SafeCutZoneKind = "chest" | "waist" | "mid-thigh" | "mid-shin";

/** 컷 테두리 변 위치. */
export type CropBoundaryEdge = "top" | "bottom" | "left" | "right";

/** 샷 크기 분류. */
export type ShotScaleKind =
  | "extreme-close-up"
  | "close-up"
  | "medium-close-up"
  | "medium-shot"
  | "cowboy-shot"
  | "full-shot"
  | "wide-shot";

/** 구도 교점 기준 격자 유형. */
export type CompositionGridMode = "rule-of-thirds" | "golden-ratio" | "either";

/** 금지 절단 관절 좌표 묶음. */
export interface JointLandmarkSet {
  readonly neck?: NormalizedPoint2D;
  readonly elbows?: readonly NormalizedPoint2D[];
  readonly wrists?: readonly NormalizedPoint2D[];
  readonly knees?: readonly NormalizedPoint2D[];
  readonly ankles?: readonly NormalizedPoint2D[];
}

/** 안전한 절단 중간대 높이(정규 Y). */
export interface SafeCutZonesY {
  readonly chest?: number;
  readonly waist?: number;
  readonly midThigh?: number;
  readonly midShin?: number;
}

/** 피사체 인체 랜드마크 계약. */
export interface SubjectBodyLandmarks {
  readonly subjectId?: string;
  readonly labelKo?: string;
  /** 정수리 Y 좌표(마스터 정규 0..1). */
  readonly crownY: number;
  /** 주요 눈 중심 또는 시선 초점 좌표(마스터 정규 0..1). */
  readonly eyeCenter: NormalizedPoint2D;
  /** 시선 방향. */
  readonly gazeDirection: GazeDirection;
  /** 선택적 신체 좌우 외곽 X 범위. */
  readonly bodyBoundsX?: {
    readonly minX: number;
    readonly maxX: number;
  };
  /** 선택적 발끝 Y 좌표(0..1). */
  readonly footY?: number;
  /** 컷 경계 절단 금지 관절 목록. */
  readonly joints: JointLandmarkSet;
  /** 안전한 절단 중간대(생략 시 관절에서 자동 보간). */
  readonly safeCutZones?: SafeCutZonesY;
}

/** 단일 컷 샷 프레이밍 감사 입력. */
export interface ShotFramingPanelInput {
  readonly panelId: string;
  readonly titleKo: string;
  readonly subject: SubjectBodyLandmarks;
  /** 현재 컷 크롭 윈도우(생략 시 마스터 전체 `[0,0,1,1]`). */
  readonly crop?: NormalizedCropRect;
  /** 샷 크기(익스트림 클로즈업 정수리 절단 예외 판정에 사용). */
  readonly shotScale?: ShotScaleKind;
  /** 의도된 고독/부감 여백 허용 여부(`true`이면 과다 헤드룸 경고 면제). */
  readonly intentionalNegativeSpace?: boolean;
  /** 기준 구도 격자(기본 `"either"` — 삼분할·황금비 교점 모두 평가). */
  readonly compositionGrid?: CompositionGridMode;
  /** 선택적 캔버스 출력 비율 계산용 픽셀 크기. */
  readonly canvasWidthPx?: number;
  readonly canvasHeightPx?: number;
}

/** 프레이밍 감사 임계값 옵션. */
export interface ShotFramingAuditOptions {
  /** 관절 중심 금지 절단 여유 폭(크롭 정규 비율, 기본 0.04). */
  readonly jointExclusionMarginNorm?: number;
  /** 최소 적정 헤드룸 비율(기본 0.04). */
  readonly minHeadroomRatio?: number;
  /** 최대 적정 헤드룸 비율(기본 0.35). */
  readonly maxHeadroomRatio?: number;
  /** 삼분할/황금비 교점 허용 이탈 거리(기본 0.15). */
  readonly maxPowerPointDistanceNorm?: number;
}

/** 5대 프레이밍 결함 코드. */
export type ShotFramingDefectCode =
  | "tangent-joint-crop"
  | "cramped-headroom"
  | "excessive-dead-headroom"
  | "insufficient-lead-room"
  | "weak-power-point-alignment";

/** 결함 심각도. */
export type ShotFramingSeverity = "blocker" | "warning" | "info";

/** 관절 정면 절단 상세 레코드. */
export interface TangentJointCropDetail {
  readonly jointKind: JointLandmarkKind;
  readonly jointIndex: number;
  readonly edge: CropBoundaryEdge;
  readonly masterPoint: NormalizedPoint2D;
  readonly localPoint: NormalizedPoint2D;
  readonly distanceToEdgeNorm: number;
  readonly recommendedSafeZone: SafeCutZoneKind | null;
  readonly recommendedSafeY: number | null;
}

/** 단일 프레이밍 결함 레코드. */
export interface ShotFramingDefect {
  readonly code: ShotFramingDefectCode;
  readonly severity: ShotFramingSeverity;
  readonly messageKo: string;
  readonly metricValue: number;
  readonly thresholdValue: number;
  readonly jointDetail?: TangentJointCropDetail;
}

/** 삼분할/황금비 교점 정보. */
export interface CompositionPowerPoint {
  readonly grid: "rule-of-thirds" | "golden-ratio";
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** 샷 프레이밍 등급. */
export type ShotFramingGrade = "S" | "A" | "B" | "C" | "F";

/** 샷 프레이밍 정량 감사 결과. */
export interface ShotFramingAuditResult {
  readonly panelId: string;
  readonly titleKo: string;
  readonly shotScale: ShotScaleKind;
  readonly compositionGrid: CompositionGridMode;
  readonly crop: NormalizedCropRect;
  readonly eyeLocal: NormalizedPoint2D;
  readonly crownLocalY: number;
  readonly headroomRatio: number;
  readonly leadRoomRatio: number;
  readonly backRoomRatio: number;
  readonly leadRoomDelta: number;
  readonly nearestPowerPoint: CompositionPowerPoint;
  readonly powerPointDistanceNorm: number;
  readonly powerPointAlignmentScore: number;
  readonly resolvedSafeCutZones: Readonly<Record<SafeCutZoneKind, number>>;
  readonly jointCropViolations: readonly TangentJointCropDetail[];
  readonly defects: readonly ShotFramingDefect[];
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly framingScore: number;
  readonly grade: ShotFramingGrade;
  readonly passed: boolean;
  readonly exemptionsApplied: readonly string[];
  /** 순수 ES2017 동기 FIPS 180-4 SHA-256 매니페스트 지문. */
  readonly framingManifestSha256Hex: string;
}

/** 자동 리프레이밍 솔버 옵션. */
export interface ShotReframeSolverOptions extends ShotFramingAuditOptions {
  /** 리프레임 시 선호할 구도 격자(기본 `"rule-of-thirds"`). */
  readonly preferredGrid?: "rule-of-thirds" | "golden-ratio";
  /** 원본 크롭 종횡비 고정 여부(기본 `false` — 종횡비 허용 범위 내 최적화). */
  readonly preserveAspectRatio?: boolean;
  /** 마스터 프레임 대비 최소 크롭 폭 비율(기본 0.28). */
  readonly minCropWidth?: number;
  /** 마스터 프레임 대비 최소 크롭 높이 비율(기본 0.28). */
  readonly minCropHeight?: number;
}

/** 자동 리프레이밍 솔버 결과. */
export interface ShotReframeOutcome {
  readonly panelId: string;
  readonly preferredGrid: "rule-of-thirds" | "golden-ratio";
  readonly originalCrop: NormalizedCropRect;
  readonly reframedCrop: NormalizedCropRect;
  readonly beforeAudit: ShotFramingAuditResult;
  readonly afterAudit: ShotFramingAuditResult;
  readonly scoreDelta: number;
  readonly jointCropsEliminated: number;
  readonly improved: boolean;
  readonly candidateCountEvaluated: number;
  readonly rationaleKo: readonly string[];
  /** 리프레임 전후 상태 통합 FIPS 180-4 SHA-256 지문. */
  readonly reframeManifestSha256Hex: string;
}

/** 광학 + 프레이밍 + 자동 리프레이밍 통합 디렉팅 입력. */
export interface ShotDirectorPlanInput {
  readonly panel: ShotFramingPanelInput;
  readonly focalLengthMm: number;
  readonly fNumber: number;
  readonly backgroundDistanceM: number;
  readonly subjectHeightM?: number;
  readonly subjectFrameFillRatio?: number;
  readonly referenceFocalLengthMm?: number;
  readonly cocMm?: number;
  readonly auditOptions?: ShotFramingAuditOptions;
  readonly reframeOptions?: ShotReframeSolverOptions;
}

/** 통합 촬영 디렉팅 결과. */
export interface ShotDirectorPlanResult {
  readonly compression: FocalBackgroundCompressionResult;
  readonly dof: DepthOfFieldResult;
  readonly reframe: ShotReframeOutcome;
  readonly directorManifestSha256Hex: string;
}

/** SVG 렌더링 옵션. */
export interface ShotFramingSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly showGoldenSpiral?: boolean;
  readonly showSafeCutZones?: boolean;
  readonly showDofBar?: boolean;
  readonly dof?: DepthOfFieldResult;
  readonly compression?: FocalBackgroundCompressionResult;
  readonly reframe?: ShotReframeOutcome;
}

/** 관절 한글 레이블. */
export const JOINT_LABELS_KO: Readonly<Record<JointLandmarkKind, string>> = {
  neck: "목 관절",
  elbows: "팔꿈치 관절",
  wrists: "손목 관절",
  knees: "무릎 관절",
  ankles: "발목 관절",
};

/** 안전 절단대 한글 레이블. */
export const SAFE_CUT_ZONE_LABELS_KO: Readonly<Record<SafeCutZoneKind, string>> = {
  chest: "가슴 중간",
  waist: "허리선",
  "mid-thigh": "허벅지 중간",
  "mid-shin": "정강이 중간",
};

/** 5대 결함 한글 레이블. */
export const FRAMING_DEFECT_LABELS_KO: Readonly<Record<ShotFramingDefectCode, string>> = {
  "tangent-joint-crop": "관절 정면 절단",
  "cramped-headroom": "머리 위 여백 부족",
  "excessive-dead-headroom": "머리 위 여백 과다",
  "insufficient-lead-room": "시선 앞쪽 리드룸 부족",
  "weak-power-point-alignment": "삼분할·황금비 교점 이탈",
};

/** 시선 방향 한글 레이블. */
export const GAZE_DIRECTION_LABELS_KO: Readonly<Record<GazeDirection, string>> = {
  left: "좌측 시선",
  right: "우측 시선",
  front: "정면 시선",
};

/** 컷 변 위치 한글 레이블. */
export const CROP_EDGE_LABELS_KO: Readonly<Record<CropBoundaryEdge, string>> = {
  top: "상단 경계",
  bottom: "하단 경계",
  left: "좌측 경계",
  right: "우측 경계",
};

/** 보케 분리 등급 한글 레이블. */
export const BOKEH_GRADE_LABELS_KO: Readonly<Record<BokehSeparationGrade, string>> = {
  "tack-sharp": "팬포커스 선명",
  "subtle-falloff": "완만한 심도 분리",
  "cinematic-bokeh": "시네마틱 배경 흐림",
  "creamy-isolation": "강한 인물 고립 보케",
};
