/**
 * 2D 러프 스케치 -> 3D 캐릭터 포즈 · 카메라 화각 · 3점 조명 동시 역산(Sketch-to-3D Stage Solver) 타입 계약.
 */

/** 캔버스 정규화 2D 좌표 (x: 0=좌~1=우, y: 0=상~1=하). */
export interface SketchPoint2D {
  readonly x: number;
  readonly y: number;
}

/** 2D 러프 스트로크의 의미적 레이어 분류. */
export type SketchStrokeKind =
  | "head"
  | "spine"
  | "arm"
  | "leftArm"
  | "rightArm"
  | "leg"
  | "leftLeg"
  | "rightLeg"
  | "vanishingPairA"
  | "vanishingPairB"
  | "shadowHatch";

/** 단일 2D 러프 스트로크. */
export interface SketchStroke2D {
  readonly id: string;
  readonly kind: SketchStrokeKind;
  readonly points: readonly SketchPoint2D[];
}

/** 역산 엔진 입력 문서. */
export interface SketchStageDocument {
  /** 캔버스 가로/세로 비율 (기본 16/9). */
  readonly aspectRatio?: number;
  /** 입력 2D 러프 스트로크 목록. */
  readonly strokes: readonly SketchStroke2D[];
}

/** VRM 휴머노이드 본 이름 (머리·척추·쇄골·상완·전완·골반·대퇴·하퇴 13개 핵심 관절). */
export type SketchVrmBoneName =
  | "hips"
  | "spine"
  | "head"
  | "leftShoulder"
  | "rightShoulder"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftUpperLeg"
  | "rightUpperLeg"
  | "leftLowerLeg"
  | "rightLowerLeg";

export type RotationAxis = "x" | "y" | "z";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface JointAxisLimitDeg {
  readonly minDeg: number;
  readonly maxDeg: number;
}

export interface JointBiomechanicalBoundsDeg {
  readonly x: JointAxisLimitDeg;
  readonly y: JointAxisLimitDeg;
  readonly z: JointAxisLimitDeg;
}

/** 관절 생체각도 클램프 발생 기록. */
export interface JointClampEvent {
  readonly bone: SketchVrmBoneName;
  readonly axis: RotationAxis;
  readonly requestedDeg: number;
  readonly clampedDeg: number;
  readonly minDeg: number;
  readonly maxDeg: number;
}

/** 단일 VRM 휴머노이드 관절 역산 결과. */
export interface SolvedVrmBoneTransform {
  readonly bone: SketchVrmBoneName;
  /** 클램프 적용 전 원시 오일러 각도 (deg, XYZ 내재 회전). */
  readonly rawEulerDeg: Vec3;
  /** 생체각도 클램프 적용 후 오일러 각도 (deg, XYZ 내재 회전). */
  readonly eulerDeg: Vec3;
  /** 생체각도 클램프 적용 후 오일러 각도 (rad). */
  readonly eulerRad: Vec3;
  /** 정규화 단위 쿼터니언 (w >= 0 정규 반구). */
  readonly quaternion: Quaternion;
  /** 1개 이상 축에서 생체각도 클램프가 발동했는지 여부. */
  readonly clamped: boolean;
  /** 클램프가 적용된 축 목록. */
  readonly clampedAxes: readonly RotationAxis[];
}

/** 2D 스케치에서 추출된 주요 신체 앵커 (정규화 캔버스 좌표). */
export interface DetectedBodyLandmarks {
  readonly headCenter: SketchPoint2D;
  readonly headRadiusNormalized: number;
  readonly neck: SketchPoint2D;
  readonly pelvis: SketchPoint2D;
  readonly characterCenter: SketchPoint2D;
  readonly figureHeightNormalized: number;
}

/** ① 3D VRM 휴머노이드 전신 포즈 역산 결과. */
export interface SolvedVrmHumanoidPose {
  readonly bones: Readonly<Record<SketchVrmBoneName, SolvedVrmBoneTransform>>;
  readonly clampEvents: readonly JointClampEvent[];
  readonly landmarks: DetectedBodyLandmarks;
  /** 입력 신체 스트로크 충족도 기반 신뢰도 (0~1). */
  readonly confidence: number;
}

/** 지원하는 시네마/웹툰 표준 단렌즈 화각 (mm). */
export type StandardLensFocalMm = 24 | 35 | 50 | 85;

/** 카메라 수직 앵글 분류 (부감 / 아이레벨 / 앙각). */
export type CameraAngleCategory = "high-angle" | "eye-level" | "low-angle";

/** 프레이밍 샷 거리 분류. */
export type CameraShotCategory =
  | "extreme-close-up"
  | "close-up"
  | "medium-shot"
  | "full-shot"
  | "wide-shot";

/** ② 카메라 렌즈 & 구도 역산 결과. */
export interface SolvedCameraStage {
  /** 24/35/50/85mm 중 가장 가까운 표준 화각. */
  readonly focalLengthMm: StandardLensFocalMm;
  /** 소실점 수렴 기하에서 계산된 연속 추정 화각 (mm). */
  readonly estimatedFocalLengthMm: number;
  /** 수평 화각 (deg). */
  readonly fovHorizontalDeg: number;
  /** 수직 화각 (deg). */
  readonly fovVerticalDeg: number;
  /** 카메라 상하 앙각/부감 Pitch (deg, 음수=부감 하이앵글, 양수=앙각 로우앵글). */
  readonly pitchDeg: number;
  /** 카메라 수평 회전 Yaw (deg, 0=정면, 음수=좌선회, 양수=우선회). */
  readonly yawDeg: number;
  /** 지평선 기울기 Roll (deg, 더치 앵글). */
  readonly rollDeg: number;
  /** 캐릭터 기준 프레이밍 거리 (m). */
  readonly distanceMeters: number;
  /** 앙각/부감 분류. */
  readonly angleCategory: CameraAngleCategory;
  /** 프레이밍 샷 크기 분류. */
  readonly shotCategory: CameraShotCategory;
  /** 캔버스 기준 지평선 Y 위치 (0=상단, 1=하단; 화면 밖일 수 있음). */
  readonly horizonYNormalized: number;
  /** 주 소실선 쌍의 수렴각 (deg). */
  readonly convergenceAngleDeg: number;
  /** 추정된 소실점 A/B (캔버스 정규화 좌표, 미검출 시 null). */
  readonly vanishingPointA: SketchPoint2D | null;
  readonly vanishingPointB: SketchPoint2D | null;
  /** 소실선 기반 역산 신뢰도 (0~1). */
  readonly confidence: number;
}

export type ThreePointLightRole = "key" | "fill" | "rim";

export type LightingMoodCategory =
  | "high-key"
  | "rembrandt"
  | "dramatic-side"
  | "backlight-rim"
  | "under-lit";

/** 단일 3점 조명 파라미터. */
export interface SolvedLightSource {
  readonly role: ThreePointLightRole;
  /** 방위각 (deg: 0=정면, -90=좌측, +90=우측, ±180=배면 역광). */
  readonly azimuthDeg: number;
  /** 고도각 (deg: 0=수평, +90=천정, 음수=하방 역조명). */
  readonly elevationDeg: number;
  /** 광원 방향 정규화 3D 벡터 (캐릭터 -> 광원). */
  readonly direction: Vec3;
  /** 상대 광도 (Key 기준 ~1.0~1.45). */
  readonly intensity: number;
  /** 색온도 (Kelvin). */
  readonly colorTempKelvin: number;
  /** 광원 부드러움 (0=하드 라이트 ~ 1=소프트 디퓨즈). */
  readonly softness: number;
}

/** ③ 3점 조명(Key/Fill/Rim) 역산 결과. */
export interface SolvedThreePointLighting {
  readonly key: SolvedLightSource;
  readonly fill: SolvedLightSource;
  readonly rim: SolvedLightSource;
  /** Key:Fill 대비비 (예: 3.2 -> 3.2:1). */
  readonly contrastRatio: number;
  /** 조명 분위기 분류. */
  readonly mood: LightingMoodCategory;
  /** 검출된 그림자 빗금 무게중심 (캔버스 정규화 좌표, 미검출 시 null). */
  readonly shadowCentroid: SketchPoint2D | null;
  /** 그림자 빗금 영역 커버리지 (0~1). */
  readonly shadowCoverage: number;
  /** 캐릭터 정면(얼굴/상체)에 빗금이 겹친 비율 (0~1, 높을수록 역광). */
  readonly frontFaceShadowRatio: number;
  /** 그림자 기반 역산 신뢰도 (0~1). */
  readonly confidence: number;
}

/** Sketch-to-3D Stage Solver 통합 결과. */
export interface SketchTo3dStageResult {
  readonly aspectRatio: number;
  readonly strokeCount: number;
  readonly pose: SolvedVrmHumanoidPose;
  readonly camera: SolvedCameraStage;
  readonly lighting: SolvedThreePointLighting;
  /** 세 역산 모듈 평균 종합 신뢰도 (0~1). */
  readonly overallConfidence: number;
}

/** 즉시 테스트용 4종 2D 러프 프리셋 ID. */
export type SketchStagePresetId =
  | "high-angle-action-punch"
  | "low-angle-hero-landing"
  | "cafe-diagonal-two-shot"
  | "closeup-backlight-drama";

/** 2D 러프 프리셋 정의. */
export interface SketchStagePreset {
  readonly id: SketchStagePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly sketch: SketchStageDocument;
}
