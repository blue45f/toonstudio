/**
 * 3D 다이내믹 시네마 렌즈 & 180° 액션 축 연속성 스토리보드 연출 엔진 타입 정의.
 *
 * - 24mm/35mm/50mm/85mm/135mm 풀프레임(36×24mm) 광학 화각과 샷 사이즈(ECU~WS),
 *   180° 라인 오브 액션 이탈 탐지, 시선 일치(Eyeline Match) 각도 오차, 더치 앵글 긴장도,
 *   Three.js `PerspectiveCamera` 결정적 JSON 리그 익스포트를 정의한다.
 */

/** 지원 시네마 프라임 초점거리(mm, 35mm 풀프레임 센서 기준). */
export type CinemaFocalLengthMm = 24 | 35 | 50 | 85 | 135;

/** 표준 영화·웹툰 샷 사이즈 5단계. */
export type ShotSizeCode = "ECU" | "CU" | "MCU" | "MS" | "WS";

/** 180° 액션 라인 기준 카메라 반평면 위치. */
export type AxisSide = "left" | "right" | "on-axis";

/** 시선 일치(Eyeline Match) 판정 등급. */
export type EyelineMatchQuality = "exact" | "acceptable" | "broken";

/** 위반 경고 종류. */
export type BlockingViolationKind = "axis-crossing" | "eyeline-mismatch" | "extreme-dutch";

/** 3D 미터(m) 단위 오른손 좌표계 벡터(Y-Up, Three.js 호환). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 3D 스테이지 위 배치된 캐릭터(액터) 정보. */
export interface StageActor {
  readonly id: string;
  readonly nameKo: string;
  readonly role: "protagonist" | "antagonist" | "support";
  readonly position: Vec3;
  /** 바닥면 기준 시선 방위각(도). */
  readonly facingYawDeg: number;
  /** 캐릭터 눈높이(m, 예: 1.62). */
  readonly eyeHeightM: number;
  /** 어깨 폭(m, 예: 0.44). */
  readonly shoulderWidthM: number;
}

/** 개별 스토리보드 컷의 3D 카메라 블로킹 명세. */
export interface CameraCutSpec {
  readonly id: string;
  readonly cutNumber: number;
  readonly labelKo: string;
  /** 이 컷의 중심 피사체 액터 ID. */
  readonly primaryActorId: string;
  /** 피사체가 바라보는 상대 액터 ID(시선 일치 계산용). */
  readonly lookTargetActorId: string;
  readonly cameraPosition: Vec3;
  readonly focalLengthMm: CinemaFocalLengthMm;
  /** 더치 앵글 롤 기울기(도, -45 ~ +45). */
  readonly dutchRollDeg: number;
  /** 컷 화면비(예: 1.5, 1.778, 0.8). */
  readonly aspectRatio: number;
  /** 의도적 180° 축 넘기(점프 연출) 허용 여부. */
  readonly allowIntentionalAxisCross?: boolean;
}

/** 스튜디오 패널용 내장 3D 블로킹 씬 프리셋. */
export interface BlockingScenePreset {
  readonly id: string;
  readonly nameKo: string;
  readonly genreKo: string;
  readonly descriptionKo: string;
  readonly primaryAxisActorIds: readonly [string, string];
  readonly actors: readonly StageActor[];
  readonly cuts: readonly CameraCutSpec[];
}

/** 두 주요 액터를 잇는 180° 액션 라인 기하 정보. */
export interface AxisLineOfAction {
  readonly actorAId: string;
  readonly actorBId: string;
  readonly originX: number;
  readonly originZ: number;
  readonly dirX: number;
  readonly dirZ: number;
  readonly lengthM: number;
  readonly angleDeg: number;
  readonly referenceSide: Exclude<AxisSide, "on-axis">;
}

/** 단일 컷의 광학·연속성·시선·긴장도 분석 결과. */
export interface CutOpticalAnalysis {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly verticalFovDeg: number;
  readonly horizontalFovDeg: number;
  readonly distanceToSubjectM: number;
  readonly visibleVerticalHeightM: number;
  readonly shotSize: ShotSizeCode;
  readonly shotSizeLabelKo: string;
  readonly axisSide: AxisSide;
  readonly signedAxisDistanceM: number;
  readonly axisCrossedFromCutNumber: number | null;
  /** 스크린 수평 시선 방향(-1 좌측 ~ +1 우측). */
  readonly screenGazeX: number;
  /** 인접 컷 대비 시선 일치 각도 오차(도). */
  readonly eyelineMatchErrorDeg: number;
  readonly eyelineMatchQuality: EyelineMatchQuality;
  /** 더치 앵글 + 렌즈 압축 기반 극적 긴장도(0~100). */
  readonly dutchTensionScore: number;
  /** 망원 압축 지수(24mm 0.18 ~ 135mm 1.0). */
  readonly lensCompressionIndex: number;
  readonly warningsKo: readonly string[];
}

/** 180° 축 위반 및 시선·기울기 경고 항목. */
export interface AxisViolation {
  readonly id: string;
  readonly fromCutNumber: number;
  readonly toCutNumber: number;
  readonly cutId: string;
  readonly severity: "critical" | "warning";
  readonly kind: BlockingViolationKind;
  readonly messageKo: string;
  readonly suggestedMirrorPosition?: Vec3;
}

/** Three.js `PerspectiveCamera` 1개 컷 직렬화 엔트리. */
export interface ThreeJsPerspectiveCameraRigEntry {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly labelKo: string;
  readonly shotSize: ShotSizeCode;
  readonly cameraType: "PerspectiveCamera";
  readonly fov: number;
  readonly focalLengthMm: CinemaFocalLengthMm;
  readonly filmGaugeMm: 35;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly rollDeg: number;
  readonly quaternion: readonly [number, number, number, number];
}

/** 전체 씬의 결정적 Three.js 카메라 리그 JSON 계약. */
export interface ThreeJsCameraRigExport {
  readonly schemaVersion: "toonstudio.camera-rig.v1";
  readonly sceneId: string;
  readonly sceneNameKo: string;
  readonly filmGaugeMm: 35;
  readonly lineOfAction: AxisLineOfAction;
  readonly cameras: readonly ThreeJsPerspectiveCameraRigEntry[];
}

/** 전체 멀티컷 3D 블로킹 연속성 진단 리포트. */
export interface BlockingDirectorReport {
  readonly sceneId: string;
  readonly lineOfAction: AxisLineOfAction;
  readonly cutAnalyses: readonly CutOpticalAnalysis[];
  readonly violations: readonly AxisViolation[];
  readonly axisViolationCount: number;
  readonly averageEyelineErrorDeg: number;
  readonly maxDutchTensionScore: number;
  readonly continuityScore: number;
  readonly isContinuityClean: boolean;
}
