/**
 * Wave 159: 웹툰·만화 2D 캐릭터 자동 본(Bone)·케이지(Cage) 워프 리깅 및
 * 비파괴 As-Rigid-As-Possible(ARAP) 2D 메쉬 변형 커널의 공용 타입 계약.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Mat2 {
  readonly m00: number;
  readonly m01: number;
  readonly m10: number;
  readonly m11: number;
}

/** 반시계 방향(CCW, 부호 넓이 > 0) 정점 인덱스 3-튜플 */
export type ArapTriangle = readonly [number, number, number];

export type ArapBodyRegion =
  | "torso"
  | "head"
  | "leftArm"
  | "rightArm"
  | "hips"
  | "custom";

export type ArapAuditStatus = "PASS" | "WARN" | "FAIL";

export interface ArapMeshVertex2d {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly u: number;
  readonly v: number;
  readonly region?: ArapBodyRegion;
}

export interface ArapMesh2d {
  readonly id: string;
  readonly labelKo: string;
  readonly vertices: readonly ArapMeshVertex2d[];
  readonly triangles: readonly ArapTriangle[];
}

export interface ArapPinHandle {
  readonly id: string;
  readonly labelKo: string;
  readonly vertexIndex: number;
  readonly target: Vec2;
  /** 글로벌 스텝 페널티 강성 가중치(양수, 클수록 목표 좌표에 강하게 고정) */
  readonly weight: number;
  readonly locked?: boolean;
}

export interface ArapBoneJoint2d {
  readonly id: string;
  readonly labelKo: string;
  readonly parentId: string | null;
  readonly restPosition: Vec2;
  readonly vertexIndex: number;
  /** 부모 대비 허용 최소 회전 변화량(도) */
  readonly minAngleDeg: number;
  /** 부모 대비 허용 최대 회전 변화량(도) */
  readonly maxAngleDeg: number;
  readonly handleWeight?: number;
}

export interface ArapBoneChain2d {
  readonly id: string;
  readonly labelKo: string;
  readonly joints: readonly ArapBoneJoint2d[];
}

export interface BoneAngleRequest {
  readonly jointId: string;
  readonly deltaAngleDeg: number;
}

export interface BoneClampAuditItem {
  readonly jointId: string;
  readonly labelKo: string;
  readonly requestedAngleDeg: number;
  readonly appliedAngleDeg: number;
  readonly minAngleDeg: number;
  readonly maxAngleDeg: number;
  readonly clamped: boolean;
}

export interface BoneChainPoseSolution {
  readonly chainId: string;
  readonly jointPositions: Readonly<Record<string, Vec2>>;
  readonly jointWorldAnglesRad: Readonly<Record<string, number>>;
  readonly handles: readonly ArapPinHandle[];
  readonly clampAudit: readonly BoneClampAuditItem[];
  readonly clampedCount: number;
}

export interface CagePolygon2d {
  readonly id: string;
  readonly labelKo: string;
  readonly vertices: readonly Vec2[];
}

export type MvcBoundaryKind = "interior" | "vertex" | "edge";

export interface MvcCoordinateRow {
  readonly weights: readonly number[];
  readonly weightSum: number;
  readonly exactBoundaryKind: MvcBoundaryKind;
  readonly boundaryIndex: number;
}

export interface ArapEdgeNeighbor {
  readonly to: number;
  readonly weight: number;
  readonly restDx: number;
  readonly restDy: number;
  readonly restLength: number;
}

export interface ArapAdjacencyGraph {
  readonly vertexCount: number;
  readonly neighbors: readonly (readonly ArapEdgeNeighbor[])[];
  readonly edgeCount: number;
  readonly minWeight: number;
  readonly maxWeight: number;
}

export interface ArapSolverOptions {
  /** 로컬-글로벌 최대 반복 횟수 (기본 24) */
  readonly maxIterations?: number;
  /** 에너지 수렴 허용 오차 (기본 1e-6) */
  readonly energyTolerance?: number;
  /** 글로벌 스텝 PCG 최대 반복 횟수 (기본 256) */
  readonly pcgMaxIterations?: number;
  /** 글로벌 스텝 PCG 상대 잔차 허용 오차 (기본 1e-10) */
  readonly pcgTolerance?: number;
  /** 핸들 기본 페널티 가중치 (기본 2500) */
  readonly defaultPinWeight?: number;
  /** 양의 코탄젠트 가중치 하한 클램프 (기본 0.01) */
  readonly minCotangentWeight?: number;
  /** 코탄젠트 가중치 사용 여부 (false면 균일 가중치 1.0) */
  readonly useCotangentWeights?: boolean;
  /** 선택적 초기 추정 정점 위치(예: MVC 케이지 선행 변형 결과) */
  readonly initialPositions?: readonly Vec2[];
}

export interface SafeArapOptions extends ArapSolverOptions {
  /** 접힘 해소용 이진 탐색 감쇠 스텝 수 (기본 12) */
  readonly maxDampingSteps?: number;
  /** 최소 허용 감쇠 비율 (기본 0.02) */
  readonly minAcceptableScale?: number;
}

export interface ArapIterationRecord {
  readonly iteration: number;
  readonly arapEnergy: number;
  readonly pinPenaltyEnergy: number;
  readonly totalEnergy: number;
  readonly maxVertexDelta: number;
  readonly pcgIterations: number;
  readonly pcgResidualNorm: number;
}

export interface ArapDistortionAudit {
  readonly triangleCount: number;
  readonly edgeCount: number;
  readonly invertedTriangleCount: number;
  readonly invertedTriangleIndices: readonly number[];
  readonly minSignedArea: number;
  readonly minAreaRatio: number;
  readonly maxAreaRatio: number;
  readonly minStretchRatio: number;
  readonly maxStretchRatio: number;
  readonly meanStretchRatio: number;
  readonly maxHandleError: number;
  readonly meanHandleError: number;
  readonly triangleStretchScores: readonly number[];
  readonly status: ArapAuditStatus;
}

export interface ArapSolveResult {
  readonly deformedPositions: readonly Vec2[];
  readonly localRotations: readonly Mat2[];
  readonly iterations: readonly ArapIterationRecord[];
  readonly converged: boolean;
  readonly initialEnergy: number;
  readonly finalEnergy: number;
  readonly audit: ArapDistortionAudit;
}

export interface SafeArapSolveResult extends ArapSolveResult {
  readonly appliedDisplacementScale: number;
  readonly dampingTriggered: boolean;
  readonly dampingAttempts: number;
  readonly rawInvertedTriangleCount: number;
  readonly effectiveHandles: readonly ArapPinHandle[];
}

export interface ArapWgslUniforms {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly meshScale: number;
  readonly wireframeOpacity: number;
  readonly tintR: number;
  readonly tintG: number;
  readonly tintB: number;
  readonly tintA: number;
  readonly distortionHighlightStrength: number;
  readonly stretchWarnThreshold: number;
  readonly stretchFailThreshold: number;
  readonly activeHandleCount: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly pixelRatio: number;
  readonly reservedFlags: number;
}

export interface ArapWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly kind: "uniform" | "sampler" | "texture_2d";
  readonly name: string;
}

export interface ArapWgslBundle {
  readonly shaderLabel: string;
  readonly wgslSource: string;
  readonly vertexEntryPoint: string;
  readonly fragmentEntryPoint: string;
  readonly uniformByteLength: number;
  readonly uniformData: Float32Array;
  readonly bindings: readonly ArapWgslBindingDescriptor[];
}

export interface ArapWgslValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly uniformByteLength: number;
  readonly braceDelta: number;
  readonly bindingCount: number;
}

export interface CharacterRigLandmarkIndices {
  readonly pelvisCenter: number;
  readonly waistCenter: number;
  readonly chestCenter: number;
  readonly neckBase: number;
  readonly headCrown: number;
  readonly leftShoulder: number;
  readonly leftElbow: number;
  readonly leftWrist: number;
  readonly rightShoulder: number;
  readonly rightElbow: number;
  readonly rightWrist: number;
}

export interface CharacterRigPreset {
  readonly mesh: ArapMesh2d;
  readonly landmarks: CharacterRigLandmarkIndices;
  readonly rightArmChain: ArapBoneChain2d;
  readonly leftArmChain: ArapBoneChain2d;
  readonly torsoAnchorHandles: readonly ArapPinHandle[];
  readonly restCage: CagePolygon2d;
}

export interface ArapPoseTweakScenario {
  readonly scenarioId: string;
  readonly titleKo: string;
  readonly mesh: ArapMesh2d;
  readonly boneChain?: ArapBoneChain2d;
  readonly boneRequests?: readonly BoneAngleRequest[];
  readonly extraHandles?: readonly ArapPinHandle[];
  readonly cageRest?: CagePolygon2d;
  readonly cageDeformed?: CagePolygon2d;
  readonly solverOptions?: SafeArapOptions;
  readonly wgslUniforms?: Partial<ArapWgslUniforms>;
}

export interface ArapPoseTweakPipelineResult {
  readonly scenarioId: string;
  readonly titleKo: string;
  readonly mesh: ArapMesh2d;
  readonly boneSolution: BoneChainPoseSolution | null;
  readonly cagePreDeformedPositions: readonly Vec2[] | null;
  readonly arapResult: SafeArapSolveResult;
  readonly wgslBundle: ArapWgslBundle;
  readonly wgslValidation: ArapWgslValidationResult;
  readonly fingerprintSha256: string;
  readonly auditSvg: string;
  readonly summaryKo: string;
  readonly status: ArapAuditStatus;
}
