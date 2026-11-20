/**
 * 웹툰 대화·대치 컷 연출용 180도 규칙(Axis of Action) 반평면 제약 및
 * 리버스 샷(Shot / Reverse-Shot) 카메라 자동 생성 엔진.
 *
 * 두 액터(P_A, P_B)를 잇는 액션 라인을 기준으로 카메라가 허용 반평면을
 * 넘지 않도록 투영·클램프해 시선 방향과 좌우 위치 연속성을 지킨다.
 */

export type AxisVec3 = readonly [number, number, number];
export type AxisHalfPlaneSide = 1 | -1;

export interface ActionLineActor {
  readonly id: string;
  readonly name?: string;
  readonly position: AxisVec3;
  /** 눈높이 오프셋(m). 미지정 시 1.52m(표준 한국 웹툰 여성/남성 평균 시선). */
  readonly eyeHeightM?: number;
}

export interface ActionLine180Frame {
  readonly actorA: ActionLineActor;
  readonly actorB: ActionLineActor;
  /** A→B 수평 단위 방향 벡터 (XZ 평면). */
  readonly axisDir: AxisVec3;
  /** 액션 라인 수평 법선 벡터 N = (-D.z, 0, D.x). */
  readonly planeNormal: AxisVec3;
  /** 두 액터의 수평 중점(눈높이 평균 포함). */
  readonly midpoint: AxisVec3;
  /** 두 액터 사이 수평 거리(m). */
  readonly separationM: number;
  /** 잠금된 허용 반평면 부호(+1 또는 -1). */
  readonly lockedSide: AxisHalfPlaneSide;
  /** 액션 라인에서 유지할 최소 이격 거리(m). 기본값 0.35m. */
  readonly minClearanceM: number;
  /** 두 액터가 거의 같은 위치에 있어 액션 라인이 퇴화했는지 여부. */
  readonly degenerate: boolean;
}

export type AxisConstraintProjectionMode = "plane-project" | "orbit-clamp";

export interface Constrain180CameraResult {
  readonly position: AxisVec3;
  readonly originalPosition: AxisVec3;
  readonly crossedAxis: boolean;
  readonly clampedToClearance: boolean;
  readonly signedDistanceBeforeM: number;
  readonly signedDistanceAfterM: number;
  readonly correctionDistanceM: number;
  readonly actorAOnScreenLeft: boolean;
  readonly summaryKo: string;
}

export interface Axis180ShotSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly role: "establishing" | "over-shoulder-a" | "over-shoulder-b" | "closeup-a" | "closeup-b";
  readonly position: AxisVec3;
  readonly target: AxisVec3;
  readonly focalLengthMm: number;
  readonly fovDegrees: number;
  readonly signedDistanceM: number;
  readonly halfPlaneSide: AxisHalfPlaneSide;
  readonly actorAOnScreenLeft: boolean;
}

export interface Axis180ContinuityViolation {
  readonly fromShotId: string;
  readonly toShotId: string;
  readonly fromSide: AxisHalfPlaneSide;
  readonly toSide: AxisHalfPlaneSide;
  readonly messageKo: string;
}

export interface Axis180ContinuityReport {
  readonly valid: boolean;
  readonly lockedSide: AxisHalfPlaneSide;
  readonly violations: readonly Axis180ContinuityViolation[];
  readonly summaryKo: string;
}

const DEFAULT_EYE_HEIGHT_M = 1.52;
const DEFAULT_MIN_CLEARANCE_M = 0.35;
const DEGENERATE_SEPARATION_EPS = 1e-4;
const FULL_FRAME_SENSOR_HEIGHT_MM = 24;

function clampFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function focalLengthToVerticalFovDeg(focalLengthMm: number): number {
  const safeFocal = Math.max(12, Math.min(200, focalLengthMm));
  const fovRad = 2 * Math.atan(FULL_FRAME_SENSOR_HEIGHT_MM / (2 * safeFocal));
  return Math.round(((fovRad * 180) / Math.PI) * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundVec3(v: AxisVec3): AxisVec3 {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}

/** 카메라 위치의 액션 라인 기준 부호 있는 수평 거리(m)를 계산한다. */
export function computeSignedDistanceToActionLine(
  frame: Pick<ActionLine180Frame, "midpoint" | "planeNormal">,
  position: AxisVec3,
): number {
  const dx = position[0] - frame.midpoint[0];
  const dz = position[2] - frame.midpoint[2];
  return dx * frame.planeNormal[0] + dz * frame.planeNormal[2];
}

/**
 * 주어진 카메라가 액션 라인의 어느 쪽(+1 / -1)에 있는지와,
 * 그 시점에서 액터 A가 화면 왼쪽에 오는지 판정한다.
 * 오른손 좌표계(+Y up)에서 `N = (-D.z, 0, D.x)` 쪽(+1)에 서서 중점을 바라보면
 * A→B 방향이 왼쪽→오른쪽이 되어 액터 A가 화면 왼쪽에 배치된다.
 */
export function isActorAOnScreenLeft(side: AxisHalfPlaneSide): boolean {
  return side === 1;
}

/**
 * 두 액터(`actorA`, `actorB`)와 초기 기준 카메라로 180도 규칙 액션 라인 프레임을 생성한다.
 */
export function createActionLine180Frame(input: {
  readonly actorA: ActionLineActor;
  readonly actorB: ActionLineActor;
  /** 초기 기준 카메라 위치. 지정하면 카메라가 위치한 반평면을 자동으로 잠근다. */
  readonly referenceCameraPosition?: AxisVec3;
  /** 반평면 부호를 명시적으로 잠그고 싶을 때 사용(+1 또는 -1). */
  readonly lockedSide?: AxisHalfPlaneSide;
  /** 액션 라인 최소 이격 거리(m). 기본값 0.35m. */
  readonly minClearanceM?: number;
}): ActionLine180Frame {
  const { actorA, actorB } = input;
  const eyeA = actorA.position[1] + clampFinite(actorA.eyeHeightM, DEFAULT_EYE_HEIGHT_M, 0.3, 2.5);
  const eyeB = actorB.position[1] + clampFinite(actorB.eyeHeightM, DEFAULT_EYE_HEIGHT_M, 0.3, 2.5);

  const dx = actorB.position[0] - actorA.position[0];
  const dz = actorB.position[2] - actorA.position[2];
  const separationM = Math.hypot(dx, dz);
  const degenerate = separationM < DEGENERATE_SEPARATION_EPS;

  const axisDir: AxisVec3 = degenerate ? [1, 0, 0] : [dx / separationM, 0, dz / separationM];
  // 오른손 좌표계(+Y up): cross(up(0,1,0), axisDir(dx,0,dz)) = (dz, 0, -dx),
  // 반대로 (-dz, 0, dx)에 카메라가 서면 중점을 볼 때 right = cross(forward, up) = +axisDir 이므로 A가 화면 왼쪽!
  const planeNormal: AxisVec3 = [-axisDir[2], 0, axisDir[0]];
  const midpoint: AxisVec3 = [
    (actorA.position[0] + actorB.position[0]) / 2,
    (eyeA + eyeB) / 2,
    (actorA.position[2] + actorB.position[2]) / 2,
  ];

  let lockedSide: AxisHalfPlaneSide = input.lockedSide ?? 1;
  if (input.lockedSide === undefined && input.referenceCameraPosition) {
    const signed = computeSignedDistanceToActionLine({ midpoint, planeNormal }, input.referenceCameraPosition);
    lockedSide = signed < 0 ? -1 : 1;
  }

  return {
    actorA,
    actorB,
    axisDir,
    planeNormal,
    midpoint,
    separationM: round3(separationM),
    lockedSide,
    minClearanceM: clampFinite(input.minClearanceM, DEFAULT_MIN_CLEARANCE_M, 0.05, 5),
    degenerate,
  };
}

/** 의도적 축 전환(인물 이동·중립 컷 이후)을 위해 허용 반평면 부호를 반전한다. */
export function flipActionLine180Side(frame: ActionLine180Frame): ActionLine180Frame {
  return {
    ...frame,
    lockedSide: frame.lockedSide === 1 ? -1 : 1,
  };
}

/**
 * 제안된 카메라 좌표를 180도 규칙 허용 반평면 안쪽으로 투영·보정한다.
 * - `plane-project`: 액션 라인 경계 평면(`lockedSide * minClearanceM`)으로 수직 투영(최소 이동).
 * - `orbit-clamp`: 중점으로부터의 수평 반경을 유지한 채 허용 반평면 경계로 회전 클램프.
 */
export function constrainCameraTo180Axis(
  frame: ActionLine180Frame,
  proposedPosition: AxisVec3,
  mode: AxisConstraintProjectionMode = "plane-project",
): Constrain180CameraResult {
  const signedBefore = computeSignedDistanceToActionLine(frame, proposedPosition);
  const signedInLockedFrame = signedBefore * frame.lockedSide;
  const crossedAxis = signedInLockedFrame < 0;
  const clampedToClearance = signedInLockedFrame < frame.minClearanceM;

  if (!clampedToClearance) {
    return {
      position: roundVec3(proposedPosition),
      originalPosition: proposedPosition,
      crossedAxis: false,
      clampedToClearance: false,
      signedDistanceBeforeM: round3(signedBefore),
      signedDistanceAfterM: round3(signedBefore),
      correctionDistanceM: 0,
      actorAOnScreenLeft: isActorAOnScreenLeft(frame.lockedSide),
      summaryKo: "180도 규칙 허용 영역 안쪽 — 보정 없음",
    };
  }

  let nextPos: AxisVec3;
  if (mode === "orbit-clamp") {
    const relX = proposedPosition[0] - frame.midpoint[0];
    const relZ = proposedPosition[2] - frame.midpoint[2];
    const alongAxis = relX * frame.axisDir[0] + relZ * frame.axisDir[2];
    const radius = Math.max(frame.minClearanceM, Math.hypot(relX, relZ));
    const maxAlong = Math.sqrt(Math.max(0, radius * radius - frame.minClearanceM * frame.minClearanceM));
    const orbitAlong = (alongAxis < 0 ? -1 : 1) * maxAlong;
    const targetSigned = frame.lockedSide * frame.minClearanceM;
    nextPos = [
      frame.midpoint[0] + frame.axisDir[0] * orbitAlong + frame.planeNormal[0] * targetSigned,
      proposedPosition[1],
      frame.midpoint[2] + frame.axisDir[2] * orbitAlong + frame.planeNormal[2] * targetSigned,
    ];
  } else {
    const deltaNormal = frame.lockedSide * frame.minClearanceM - signedBefore;
    nextPos = [
      proposedPosition[0] + frame.planeNormal[0] * deltaNormal,
      proposedPosition[1],
      proposedPosition[2] + frame.planeNormal[2] * deltaNormal,
    ];
  }

  const signedAfter = computeSignedDistanceToActionLine(frame, nextPos);
  const correctionDistanceM = Math.hypot(
    nextPos[0] - proposedPosition[0],
    nextPos[1] - proposedPosition[1],
    nextPos[2] - proposedPosition[2],
  );

  return {
    position: roundVec3(nextPos),
    originalPosition: proposedPosition,
    crossedAxis,
    clampedToClearance: true,
    signedDistanceBeforeM: round3(signedBefore),
    signedDistanceAfterM: round3(signedAfter),
    correctionDistanceM: round3(correctionDistanceM),
    actorAOnScreenLeft: isActorAOnScreenLeft(frame.lockedSide),
    summaryKo: crossedAxis
      ? `액션 라인 넘어섬 차단 — 허용 반평면으로 ${round3(correctionDistanceM)}m 보정`
      : `액션 라인 최소 이격(${frame.minClearanceM}m) 확보를 위해 ${round3(correctionDistanceM)}m 보정`,
  };
}

/**
 * 180도 규칙을 엄수하는 대화·대치 리버스 샷 카메라 세트(전경 + OTS A/B + 클로즈업 A/B)를
 * 자동 생성한다. 모든 카메라는 `frame.lockedSide` 반평면 안에 놓이며 화면 좌우 연속성을 보장한다.
 */
export function generateShotReverseShotSuite(
  frame: ActionLine180Frame,
  options?: {
    readonly establishingDistanceM?: number;
    readonly overShoulderBackM?: number;
    readonly overShoulderLateralM?: number;
    readonly closeupDistanceM?: number;
  },
): readonly Axis180ShotSpec[] {
  const sep = Math.max(1.0, frame.separationM);
  const side = frame.lockedSide;
  const n = frame.planeNormal;
  const d = frame.axisDir;
  const mid = frame.midpoint;

  const eyeA: AxisVec3 = [
    frame.actorA.position[0],
    frame.actorA.position[1] + clampFinite(frame.actorA.eyeHeightM, DEFAULT_EYE_HEIGHT_M, 0.3, 2.5),
    frame.actorA.position[2],
  ];
  const eyeB: AxisVec3 = [
    frame.actorB.position[0],
    frame.actorB.position[1] + clampFinite(frame.actorB.eyeHeightM, DEFAULT_EYE_HEIGHT_M, 0.3, 2.5),
    frame.actorB.position[2],
  ];

  const estDist = Math.max(frame.minClearanceM + 0.5, options?.establishingDistanceM ?? Math.max(2.6, sep * 1.45));
  const otsBack = clampFinite(options?.overShoulderBackM, Math.max(0.75, sep * 0.42), 0.4, 4.0);
  const otsLat = Math.max(frame.minClearanceM + 0.25, options?.overShoulderLateralM ?? Math.max(0.7, sep * 0.34));
  const cuDist = Math.max(frame.minClearanceM + 0.25, options?.closeupDistanceM ?? Math.max(1.05, sep * 0.55));

  const nameA = frame.actorA.name ?? frame.actorA.id;
  const nameB = frame.actorB.name ?? frame.actorB.id;

  const buildShot = (
    id: string,
    labelKo: string,
    role: Axis180ShotSpec["role"],
    rawPos: AxisVec3,
    target: AxisVec3,
    focalLengthMm: number,
  ): Axis180ShotSpec => {
    const constrained = constrainCameraTo180Axis(frame, rawPos, "plane-project");
    return {
      id,
      labelKo,
      role,
      position: constrained.position,
      target: roundVec3(target),
      focalLengthMm,
      fovDegrees: focalLengthToVerticalFovDeg(focalLengthMm),
      signedDistanceM: constrained.signedDistanceAfterM,
      halfPlaneSide: side,
      actorAOnScreenLeft: isActorAOnScreenLeft(side),
    };
  };

  return [
    buildShot(
      "shot-establishing",
      "투샷 전경 (180° 기준)",
      "establishing",
      [mid[0] + n[0] * side * estDist, mid[1] + 0.08, mid[2] + n[2] * side * estDist],
      mid,
      35,
    ),
    buildShot(
      "shot-ots-a-to-b",
      `${nameA} 어깨너머 → ${nameB}`,
      "over-shoulder-a",
      [
        eyeA[0] - d[0] * otsBack + n[0] * side * otsLat,
        eyeA[1] + 0.04,
        eyeA[2] - d[2] * otsBack + n[2] * side * otsLat,
      ],
      eyeB,
      50,
    ),
    buildShot(
      "shot-ots-b-to-a",
      `${nameB} 어깨너머 → ${nameA} (리버스)`,
      "over-shoulder-b",
      [
        eyeB[0] + d[0] * otsBack + n[0] * side * otsLat,
        eyeB[1] + 0.04,
        eyeB[2] + d[2] * otsBack + n[2] * side * otsLat,
      ],
      eyeA,
      50,
    ),
    buildShot(
      "shot-closeup-a",
      `${nameA} 클로즈업`,
      "closeup-a",
      [
        eyeA[0] + d[0] * (cuDist * 0.55) + n[0] * side * (cuDist * 0.84),
        eyeA[1],
        eyeA[2] + d[2] * (cuDist * 0.55) + n[2] * side * (cuDist * 0.84),
      ],
      eyeA,
      85,
    ),
    buildShot(
      "shot-closeup-b",
      `${nameB} 클로즈업 (리버스)`,
      "closeup-b",
      [
        eyeB[0] - d[0] * (cuDist * 0.55) + n[0] * side * (cuDist * 0.84),
        eyeB[1],
        eyeB[2] - d[2] * (cuDist * 0.55) + n[2] * side * (cuDist * 0.84),
      ],
      eyeB,
      85,
    ),
  ];
}

/**
 * 연속된 컷 시퀀스가 180도 규칙 반평면을 위반(시선 반전)하는지 감사한다.
 */
export function evaluate180RuleContinuity(
  frame: ActionLine180Frame,
  shots: readonly { readonly id: string; readonly cameraPosition: AxisVec3; readonly intentionalAxisCross?: boolean }[],
): Axis180ContinuityReport {
  const violations: Axis180ContinuityViolation[] = [];
  let activeSide: AxisHalfPlaneSide = frame.lockedSide;

  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i]!;
    const signed = computeSignedDistanceToActionLine(frame, shot.cameraPosition);
    const shotSide: AxisHalfPlaneSide = signed < 0 ? -1 : 1;

    if (shotSide !== activeSide) {
      if (shot.intentionalAxisCross) {
        activeSide = shotSide;
      } else {
        const prevId = i > 0 ? shots[i - 1]!.id : "establishing-lock";
        violations.push({
          fromShotId: prevId,
          toShotId: shot.id,
          fromSide: activeSide,
          toSide: shotSide,
          messageKo: `${prevId} → ${shot.id}: 카메라가 180도 액션 라인을 넘어 좌우 시선이 반전됩니다.`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    lockedSide: frame.lockedSide,
    violations,
    summaryKo: violations.length === 0
      ? `총 ${shots.length}컷 모두 180도 시선 연속성 통과`
      : `180도 규칙 위반 ${violations.length}건 감지`,
  };
}
