import {
  qFromAxisAngle,
  qMultiply,
  qNormalize,
  qRotateVec3,
  qSlerp,
  v3Add,
  v3Cross,
  v3Length,
  v3Normalize,
  v3Sub,
  type Quat,
  type Vec3,
} from "../../shared/math";

const DEG_TO_RAD = Math.PI / 180;

export type ShaperHairBaseZoneIndex = 0 | 1 | 2 | 3;

export interface ShaperHairBaseZoneCalibration {
  readonly zone: ShaperHairBaseZoneIndex;
  readonly uniformName: "_Tex0_ST" | "_Tex1_ST" | "_Tex2_ST" | "_Tex3_ST";
  readonly xOrg: number;
  readonly yOrg: number;
  readonly xMultiplier: number;
  readonly yMultiplier: number;
}

/**
 * SHAPER HairBaseData::Awake (0x060001a3) 4-구간 두피(Scalp) 헤어베이스 텍스처 캘리브레이션 상수:
 * - Zone 0 (전면 헤어라인): xOrg=0.0, yOrg=-0.36, xM=0.01, yM=-0.05
 * - Zone 1 (좌측 구레나룻): xOrg=0.29, yOrg=0.15, xM=0.01, yM=0.10
 * - Zone 2 (우측 구레나룻): xOrg=0.15, yOrg=-0.15, xM=0.02, yM=0.10
 * - Zone 3 (후면 목덜미): xOrg=0.20, yOrg=0.0, xM=0.01, yM=0.20
 */
export const SHAPER_HAIR_BASE_ZONE_CALIBRATIONS: readonly [
  ShaperHairBaseZoneCalibration,
  ShaperHairBaseZoneCalibration,
  ShaperHairBaseZoneCalibration,
  ShaperHairBaseZoneCalibration,
] = [
  { zone: 0, uniformName: "_Tex0_ST", xOrg: 0.0, yOrg: -0.36, xMultiplier: 0.01, yMultiplier: -0.05 },
  { zone: 1, uniformName: "_Tex1_ST", xOrg: 0.29, yOrg: 0.15, xMultiplier: 0.01, yMultiplier: 0.1 },
  { zone: 2, uniformName: "_Tex2_ST", xOrg: 0.15, yOrg: -0.15, xMultiplier: 0.02, yMultiplier: 0.1 },
  { zone: 3, uniformName: "_Tex3_ST", xOrg: 0.2, yOrg: 0.0, xMultiplier: 0.01, yMultiplier: 0.2 },
] as const;

export interface ShaperHairBaseZoneUiInput {
  readonly zone: ShaperHairBaseZoneIndex;
  readonly xUi: number;
  readonly yUi: number;
  readonly widthUi: number;
  readonly heightUi: number;
}

export interface ShaperHairBaseZoneUvTransform {
  readonly zone: ShaperHairBaseZoneIndex;
  readonly uniformName: "_Tex0_ST" | "_Tex1_ST" | "_Tex2_ST" | "_Tex3_ST";
  readonly scaleW: number;
  readonly scaleH: number;
  readonly offsetTx: number;
  readonly offsetTy: number;
  readonly stVector: readonly [number, number, number, number];
}

/**
 * SHAPER HairBaseData::UpdateHairBaseFromUI (0x060001a1) 역공학 내재화:
 * UI 슬라이더 `(xUi, yUi, widthUi, heightUi)`로부터 중심 기준 스케일링 보정이 포함된
 * Unity `_Tex{k}_ST = (w, h, tx, ty)` 변환 벡터를 계산한다.
 */
export function computeShaperHairBaseUvTransform(
  input: ShaperHairBaseZoneUiInput,
): ShaperHairBaseZoneUvTransform {
  const cal = SHAPER_HAIR_BASE_ZONE_CALIBRATIONS[input.zone];
  const scaleW = 2 - input.widthUi;
  const scaleH = 2 - input.heightUi;
  const tx0 = cal.xOrg + input.xUi * cal.xMultiplier;
  const ty0 = cal.yOrg + input.yUi * cal.yMultiplier;
  const offsetTx = scaleW * tx0 + 0.5 * (1 - scaleW);
  const offsetTy = scaleH * ty0 + 0.5 * (1 - scaleH);

  return {
    zone: input.zone,
    uniformName: cal.uniformName,
    scaleW,
    scaleH,
    offsetTx,
    offsetTy,
    stVector: [scaleW, scaleH, offsetTx, offsetTy],
  };
}

export interface ShaperConfigurableJointSpec {
  readonly lowAngularXLimitDeg: number;
  readonly highAngularXLimitDeg: number;
  readonly angularYLimitDeg: number;
  readonly rigidbodyMass: number;
  readonly linearDamping: number;
}

/**
 * SHAPER HairData::CreateHair (0x060001d6) ConfigurableJoint 물리 파라미터 상수
 */
export const SHAPER_HAIR_JOINT_SPEC: ShaperConfigurableJointSpec = {
  lowAngularXLimitDeg: -80,
  highAngularXLimitDeg: 10,
  angularYLimitDeg: 40,
  rigidbodyMass: 0.01,
  linearDamping: 0.1,
} as const;

export interface PlantedHairControlNode {
  readonly index: number;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly jointSpec: ShaperConfigurableJointSpec | null;
}

export interface BuildPlantedHairControlChainOptions {
  readonly rootPosition: Vec3;
  readonly rootRotation?: Quat;
  /** 모근 추가 회전 각도 (도 단위, [pitchX, yawY]) */
  readonly rootAngleDeg?: readonly [number, number];
  /** 전체 머리카락 길이 (기본 0.6) */
  readonly hairLength?: number;
  /** 세그먼트 분할 단계 수 (`hairStep`, 기본 3 -> 제어점 `hairStep + 2 = 5`개) */
  readonly hairStep?: number;
  /** 전체 굽힘 각도 (`hairBend` 도 단위, 기본 30 -> 마디당 `hairBend / (hairStep + 1)` 회전) */
  readonly hairBendDeg?: number;
}

export interface PlantedHairControlChainResult {
  readonly nodes: readonly PlantedHairControlNode[];
  readonly firstSegmentOffset: number;
  readonly segmentLength: number;
  readonly bendStepDeg: number;
}

/**
 * SHAPER HairData::CreateHair (0x060001d6) 인터랙티브 헤어 심기 제어점 체인 생성 역공학 내재화:
 * - 세그먼트 간격 `segLen = (hairLength - 0.1) / hairStep`
 * - 제어점 0(모근): `localEulerAngles = (90, 0, 0)` 후 `(rootAngle.x, rootAngle.y, 0)` 회전 적용
 * - 제어점 1: 모근의 로컬 `-Z` 방향으로 `-0.1` 이동
 * - 제어점 `k >= 2`: 마디마다 로컬 X축으로 `hairBend / (hairStep + 1)` 회전 후 로컬 `-Z` 방향으로 `-segLen` 전진
 * - 각 마디(`k >= 1`)에 `ConfigurableJoint` 각도 제한(`[-80°, +10°]`, `Y=40°`, `mass=0.01`, `damping=0.1`)을 부여한다.
 */
export function buildPlantedHairControlChain(
  options: BuildPlantedHairControlChainOptions,
): PlantedHairControlChainResult {
  const {
    rootPosition,
    rootRotation = [0, 0, 0, 1],
    rootAngleDeg = [0, 0],
    hairLength = 0.6,
    hairStep = 3,
    hairBendDeg = 30,
  } = options;

  const stepCount = Math.max(1, Math.floor(hairStep));
  const firstSegmentOffset = 0.1;
  const segmentLength = Math.max(0.01, (hairLength - firstSegmentOffset) / stepCount);
  const bendStepDeg = hairBendDeg / (stepCount + 1);

  // 모근 기본 회전: X축 +90도 후 rootAngle(X, Y) 적용
  const rotX90 = qFromAxisAngle([1, 0, 0], 90 * DEG_TO_RAD);
  const rotRootPitch = qFromAxisAngle([1, 0, 0], rootAngleDeg[0] * DEG_TO_RAD);
  const rotRootYaw = qFromAxisAngle([0, 1, 0], rootAngleDeg[1] * DEG_TO_RAD);
  let currentRot = qNormalize(
    qMultiply(qMultiply(qMultiply(rootRotation, rotX90), rotRootYaw), rotRootPitch),
  );
  let currentPos: Vec3 = [rootPosition[0], rootPosition[1], rootPosition[2]];

  const nodes: PlantedHairControlNode[] = [
    {
      index: 0,
      position: currentPos,
      rotation: currentRot,
      jointSpec: null,
    },
  ];

  // 제어점 1: 로컬 (0, 0, -0.1) 전진
  const firstStepVec = qRotateVec3(currentRot, [0, 0, -firstSegmentOffset]);
  currentPos = v3Add(currentPos, firstStepVec);
  nodes.push({
    index: 1,
    position: currentPos,
    rotation: currentRot,
    jointSpec: SHAPER_HAIR_JOINT_SPEC,
  });

  // 제어점 k = 2 .. stepCount + 1: 로컬 X축으로 bendStepDeg 회전 후 로컬 (0, 0, -segmentLength) 전진
  const bendQuat = qFromAxisAngle([1, 0, 0], bendStepDeg * DEG_TO_RAD);
  for (let k = 2; k <= stepCount + 1; k += 1) {
    currentRot = qNormalize(qMultiply(currentRot, bendQuat));
    const segVec = qRotateVec3(currentRot, [0, 0, -segmentLength]);
    currentPos = v3Add(currentPos, segVec);
    nodes.push({
      index: k,
      position: currentPos,
      rotation: currentRot,
      jointSpec: SHAPER_HAIR_JOINT_SPEC,
    });
  }

  return {
    nodes,
    firstSegmentOffset,
    segmentLength,
    bendStepDeg,
  };
}

function lookRotationAlongNegativeZ(direction: Vec3, upHint: Vec3 = [0, 1, 0]): Quat {
  const negZ = v3Length(direction) > 1e-8 ? v3Normalize(direction) : ([0, -1, 0] as const);
  const forward: Vec3 = [-negZ[0], -negZ[1], -negZ[2]];
  let right = v3Cross(upHint, forward);
  if (v3Length(right) < 1e-6) {
    right = v3Cross([1, 0, 0], forward);
  }
  right = v3Normalize(right);
  const up = v3Normalize(v3Cross(forward, right));

  const m00 = right[0];
  const m01 = up[0];
  const m02 = forward[0];
  const m10 = right[1];
  const m11 = up[1];
  const m12 = forward[1];
  const m20 = right[2];
  const m21 = up[2];
  const m22 = forward[2];

  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    return qNormalize([(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]);
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    return qNormalize([0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]);
  }
  if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    return qNormalize([(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]);
  }
  const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
  return qNormalize([(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]);
}

/**
 * SHAPER HairData::AlignHairRotation (0x060001c2) 역공학 내재화:
 * 각 제어점의 회전을 다음 제어점 방향(`points[i+1] - points[i]`)으로 정렬한 뒤,
 * 내부 제어점(`1 .. N-2`) 회전을 다음 마디 회전과 `Quaternion.Lerp(rot[i], rot[i+1], 0.5f)`로 보간해 스무딩한다.
 */
export function alignShaperHairControlRotations(
  nodes: readonly PlantedHairControlNode[],
): readonly PlantedHairControlNode[] {
  if (nodes.length <= 1) return [...nodes];

  const rawRotations: Quat[] = nodes.map((node, idx) => {
    if (idx < nodes.length - 1) {
      const dir = v3Sub(nodes[idx + 1].position, node.position);
      return lookRotationAlongNegativeZ(dir);
    }
    return node.rotation;
  });

  if (rawRotations.length >= 2) {
    rawRotations[rawRotations.length - 1] = rawRotations[rawRotations.length - 2];
  }

  return nodes.map((node, idx) => {
    if (idx >= 1 && idx <= nodes.length - 2) {
      return {
        ...node,
        rotation: qSlerp(rawRotations[idx], rawRotations[idx + 1], 0.5),
      };
    }
    return {
      ...node,
      rotation: rawRotations[idx],
    };
  });
}

/**
 * SHAPER HairData::AlignHairsByPartMesh (0x060001d0) 역공학 내재화:
 * 두상 파츠 삼각형 `(v0, v1, v2)`가 변형되었을 때, 심어진 모근의 Ray-Edge Polar 좌표 `(v0d, v1d)`로부터
 * 새 모근 표면 위치와 면 법선을 복원하고 헤어 제어점 체인 전체를 변위만큼 평행 이동한다.
 */
export function reanchorPlantedHairRoot(options: {
  readonly triangleVertices: readonly [Vec3, Vec3, Vec3];
  readonly v0d: number;
  readonly v1d: number;
  readonly nodes: readonly PlantedHairControlNode[];
}): {
  readonly rootPosition: Vec3;
  readonly surfaceNormal: Vec3;
  readonly nodes: readonly PlantedHairControlNode[];
} {
  const { triangleVertices, v0d, v1d, nodes } = options;
  const [v0, v1, v2] = triangleVertices;
  const u = Math.max(0, Math.min(1, v0d));
  const v = Math.max(0, Math.min(1 - u, v1d));
  const w = 1 - u - v;

  const rootPosition: Vec3 = [
    v0[0] * w + v1[0] * u + v2[0] * v,
    v0[1] * w + v1[1] * u + v2[1] * v,
    v0[2] * w + v1[2] * u + v2[2] * v,
  ];

  const edge1 = v3Sub(v1, v0);
  const edge2 = v3Sub(v2, v0);
  const cross = v3Cross(edge1, edge2);
  const surfaceNormal: Vec3 = v3Length(cross) > 1e-8 ? v3Normalize(cross) : [0, 1, 0];

  if (nodes.length === 0) {
    return { rootPosition, surfaceNormal, nodes: [] };
  }

  const delta = v3Sub(rootPosition, nodes[0].position);
  const movedNodes = nodes.map((node) => ({
    ...node,
    position: v3Add(node.position, delta),
  }));

  return {
    rootPosition,
    surfaceNormal,
    nodes: movedNodes,
  };
}
