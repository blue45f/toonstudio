/**
 * Wave 125 — 3D XZ 스테이지 180도 액션 축 외적·대칭 반사·시선 피치·화면 방향 투영 및
 * 결정론적 SHA-256 블로킹 지문 계산 순수 기하 모듈.
 */

import {
  DEFAULT_FRONT_FACING_DEADZONE_DEG,
  GEOMETRY_EPSILON,
  canonicalizeBlockingJson,
  sha256EyelineHex,
  type CameraShotKind,
  type DialogueActionSceneSpec,
  type ScreenFacingDirection,
  type StageCharacterSpec,
  type Vec2XZ,
} from "./eyeline-180-rule-types";

export interface SignedAxisDistanceResult {
  readonly signedCross: number;
  readonly signedDistanceM: number;
  readonly axisLengthM: number;
  readonly isDegenerateAxis: boolean;
}

export interface ProjectedScreenFacingResult {
  readonly facing: ScreenFacingDirection;
  readonly lateralDot: number;
}

export function sanitizeFiniteNumber(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Object.is(value, -0) ? 0 : value;
}

export function sanitizeVec2XZ(vec: Vec2XZ): Vec2XZ {
  return {
    x: sanitizeFiniteNumber(vec.x, 0),
    z: sanitizeFiniteNumber(vec.z, 0),
  };
}

export function roundToDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 2D XZ 평면 외적: cross2D(u, v) = u.x * v.z - u.z * v.x. */
export function cross2DXZ(u: Vec2XZ, v: Vec2XZ): number {
  const ux = sanitizeFiniteNumber(u.x);
  const uz = sanitizeFiniteNumber(u.z);
  const vx = sanitizeFiniteNumber(v.x);
  const vz = sanitizeFiniteNumber(v.z);
  const result = ux * vz - uz * vx;
  return Object.is(result, -0) ? 0 : result;
}

/** 2D XZ 평면 유클리드 거리(m). */
export function distance2DXZ(a: Vec2XZ, b: Vec2XZ): number {
  const ax = sanitizeFiniteNumber(a.x);
  const az = sanitizeFiniteNumber(a.z);
  const bx = sanitizeFiniteNumber(b.x);
  const bz = sanitizeFiniteNumber(b.z);
  return Math.hypot(bx - ax, bz - az);
}

/**
 * 주연 쌍 A→B 직선을 기준으로 점(카메라)의 부호 있는 외적과 직교 거리(m)를 계산한다.
 */
export function computeSignedAxisDistanceM(
  axisA: Vec2XZ,
  axisB: Vec2XZ,
  point: Vec2XZ,
): SignedAxisDistanceResult {
  const a = sanitizeVec2XZ(axisA);
  const b = sanitizeVec2XZ(axisB);
  const p = sanitizeVec2XZ(point);
  const ab: Vec2XZ = { x: b.x - a.x, z: b.z - a.z };
  const ap: Vec2XZ = { x: p.x - a.x, z: p.z - a.z };
  const axisLengthM = Math.hypot(ab.x, ab.z);

  if (axisLengthM <= GEOMETRY_EPSILON) {
    return { signedCross: 0, signedDistanceM: 0, axisLengthM: 0, isDegenerateAxis: true };
  }

  const signedCross = cross2DXZ(ab, ap);
  const signedDistanceM = signedCross / axisLengthM;
  return {
    signedCross,
    signedDistanceM: Object.is(signedDistanceM, -0) ? 0 : signedDistanceM,
    axisLengthM,
    isDegenerateAxis: false,
  };
}

/**
 * 점 P를 직선 AB에 대해 정확히 대칭 반사(Reflection across line AB)한다.
 * 거리 불변식: |P' - A| === |P - A|, |P' - B| === |P - B|, cross2D(B-A, P'-A) === -cross2D(B-A, P-A).
 */
export function reflectPointAcrossLineXZ(
  point: Vec2XZ,
  lineA: Vec2XZ,
  lineB: Vec2XZ,
): Vec2XZ {
  const p = sanitizeVec2XZ(point);
  const a = sanitizeVec2XZ(lineA);
  const b = sanitizeVec2XZ(lineB);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;

  if (lenSq <= GEOMETRY_EPSILON * GEOMETRY_EPSILON) {
    return p;
  }

  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
  const footX = a.x + t * dx;
  const footZ = a.z + t * dz;
  return {
    x: sanitizeFiniteNumber(2 * footX - p.x),
    z: sanitizeFiniteNumber(2 * footZ - p.z),
  };
}

/**
 * 두 캐릭터 눈높이(eyeHeightM)와 수평 거리로 기대 시선 피치각(도, 위쪽 양수·아래쪽 음수)을 계산한다.
 */
export function computeExpectedEyelinePitchDeg(
  subject: StageCharacterSpec,
  target: StageCharacterSpec,
): number {
  const sPos = sanitizeVec2XZ(subject.positionXZ);
  const tPos = sanitizeVec2XZ(target.positionXZ);
  const sEye = sanitizeFiniteNumber(subject.eyeHeightM, 1.6);
  const tEye = sanitizeFiniteNumber(target.eyeHeightM, 1.6);
  const deltaY = tEye - sEye;
  const horizontalDist = Math.hypot(tPos.x - sPos.x, tPos.z - sPos.z);

  if (horizontalDist <= GEOMETRY_EPSILON && Math.abs(deltaY) <= GEOMETRY_EPSILON) {
    return 0;
  }
  return sanitizeFiniteNumber((Math.atan2(deltaY, horizontalDist) * 180) / Math.PI, 0);
}

/**
 * 오른손 3D 좌표계(+Y 위, XZ 평면)에서 카메라→피사체 시야축을 기준으로
 * 피사체가 바라보는 대상(target)의 화면 수평 방향(`screen-left` | `screen-right` | `front`)을 계산한다.
 */
export function computeProjectedScreenFacing(
  cameraXZ: Vec2XZ,
  subjectXZ: Vec2XZ,
  targetXZ: Vec2XZ,
  shotKind?: CameraShotKind,
  frontDeadzoneDeg: number = DEFAULT_FRONT_FACING_DEADZONE_DEG,
): ProjectedScreenFacingResult {
  const cam = sanitizeVec2XZ(cameraXZ);
  const sub = sanitizeVec2XZ(subjectXZ);
  const tgt = sanitizeVec2XZ(targetXZ);

  const forwardX = sub.x - cam.x;
  const forwardZ = sub.z - cam.z;
  const forwardLen = Math.hypot(forwardX, forwardZ);
  const lookX = tgt.x - sub.x;
  const lookZ = tgt.z - sub.z;
  const lookLen = Math.hypot(lookX, lookZ);

  if (forwardLen <= GEOMETRY_EPSILON || lookLen <= GEOMETRY_EPSILON) {
    return { facing: "front", lateralDot: 0 };
  }

  const fx = forwardX / forwardLen;
  const fz = forwardZ / forwardLen;
  // 오른손 좌표계(Y-up)에서 카메라 화면 오른쪽 벡터 R = F × (0, 1, 0) = (-fz, fx)
  const rightX = -fz;
  const rightZ = fx;
  const lx = lookX / lookLen;
  const lz = lookZ / lookLen;
  const lateralDot = sanitizeFiniteNumber(lx * rightX + lz * rightZ, 0);

  if (shotKind === "neutral-axis-on") {
    return { facing: "front", lateralDot };
  }

  const safeDeadzone = Math.max(
    0,
    Math.min(45, sanitizeFiniteNumber(frontDeadzoneDeg, DEFAULT_FRONT_FACING_DEADZONE_DEG)),
  );
  const threshold = Math.sin((safeDeadzone * Math.PI) / 180);

  if (Math.abs(lateralDot) <= threshold) {
    return { facing: "front", lateralDot };
  }
  return {
    facing: lateralDot > 0 ? "screen-right" : "screen-left",
    lateralDot,
  };
}

/**
 * 씬의 캐릭터 배치, 액션 축, 모든 컷 카메라 블로킹 명세에 대한 결정론적 FIPS 180-4 SHA-256 지문을 생성한다.
 */
export function computeCameraBlockingSha256Hex(scene: DialogueActionSceneSpec): string {
  const normalizedPayload = {
    schema: "toonstudio-wave125-eyeline-180-blocking-v1",
    sceneId: scene.sceneId,
    titleKo: scene.titleKo,
    axisAnchorPair: [scene.axisAnchorPair[0], scene.axisAnchorPair[1]],
    characters: scene.characters.map((ch) => ({
      characterId: ch.characterId,
      labelKo: ch.labelKo,
      positionXZ: sanitizeVec2XZ(ch.positionXZ),
      eyeHeightM: sanitizeFiniteNumber(ch.eyeHeightM, 1.6),
    })),
    cuts: scene.cuts.map((cut) => ({
      cutId: cut.cutId,
      shotKind: cut.shotKind,
      cameraXZ: sanitizeVec2XZ(cut.cameraXZ),
      subjectCharacterId: cut.subjectCharacterId,
      lookTargetCharacterId: cut.lookTargetCharacterId ?? null,
      drawnEyelinePitchDeg:
        cut.drawnEyelinePitchDeg === undefined
          ? null
          : sanitizeFiniteNumber(cut.drawnEyelinePitchDeg),
      drawnScreenFacing: cut.drawnScreenFacing ?? null,
      motionDirection: cut.motionDirection ?? null,
      labelKo: cut.labelKo ?? null,
      fovDeg: cut.fovDeg === undefined ? null : sanitizeFiniteNumber(cut.fovDeg),
    })),
  };

  return sha256EyelineHex(canonicalizeBlockingJson(normalizedPayload));
}
