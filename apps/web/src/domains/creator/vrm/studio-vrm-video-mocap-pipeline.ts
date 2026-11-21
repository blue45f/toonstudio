/**
 * DeepMotion · Plask · Rokoko 클린룸 — 브라우저 로컬 단안 영상(MP4/WebM) 3D 모캡 리타게팅,
 * 물리 발 고정(Foot Locking) 및 액션 클립 스틸 포즈 스크러버.
 *
 * - 외부 서버 업로드 없이 브라우저 로컬 MP4/WebM 소스만 허용하는 경계 검증
 * - 3D 관절 랜드마크 프레임을 VRM 휴머노이드 본 쿼터니언 + 골반 이동으로 결정적 리타게팅
 * - 접지 속도·높이 기반 스탠스(stance) 판정으로 발 미끄러짐(foot skating) 제거 + 이륙 블렌드
 * - 임의 시각 sub-frame SLERP 스크러빙 및 운동 에너지 피크(타격·점프 정점) 자동 추출
 */

import {
  IDENTITY_QUAT,
  normalizeQuat,
  quatFromUnitVectors,
  type QuatTuple,
  type Vec3Tuple,
} from "./studio-analytical-twist-swing-ik";

export interface LocalMocapVideoSourceMeta {
  readonly fileName: string;
  readonly mimeType: string;
  readonly durationSec: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly isLocalObjectUrl: boolean;
}

export interface MocapVideoValidationResult {
  readonly valid: boolean;
  readonly reasonKo: string;
}

export interface MonocularPoseLandmarkFrame {
  readonly timeSec: number;
  readonly hips: Vec3Tuple;
  readonly spine: Vec3Tuple;
  readonly chest: Vec3Tuple;
  readonly neck: Vec3Tuple;
  readonly head: Vec3Tuple;
  readonly leftShoulder: Vec3Tuple;
  readonly leftElbow: Vec3Tuple;
  readonly leftWrist: Vec3Tuple;
  readonly rightShoulder: Vec3Tuple;
  readonly rightElbow: Vec3Tuple;
  readonly rightWrist: Vec3Tuple;
  readonly leftHip: Vec3Tuple;
  readonly leftKnee: Vec3Tuple;
  readonly leftAnkle: Vec3Tuple;
  readonly rightHip: Vec3Tuple;
  readonly rightKnee: Vec3Tuple;
  readonly rightAnkle: Vec3Tuple;
}

export interface RetargetedMocapPoseFrame {
  readonly timeSec: number;
  readonly hipsPositionM: Vec3Tuple;
  readonly boneRotations: Readonly<Record<string, QuatTuple>>;
  readonly leftFootWorldM: Vec3Tuple;
  readonly rightFootWorldM: Vec3Tuple;
  readonly leftFootLocked: boolean;
  readonly rightFootLocked: boolean;
}

export interface FootLockingConfig {
  readonly floorHeightM: number;
  readonly soleThicknessM: number;
  /** 바닥으로부터 이 높이 이하이면 접지 후보로 본다(m). */
  readonly contactHeightThresholdM: number;
  /** 수평 발 속도가 이 값 이하이면 지면에 고정된 스탠스 상태로 판정(m/s). */
  readonly contactSpeedThresholdMps: number;
  /** 발이 떨어질 때 앵커에서 자연스럽게 풀리는 블렌드 프레임 수. */
  readonly releaseBlendFrames: number;
}

export interface ActionClipPeakFrame {
  readonly frameIndex: number;
  readonly timeSec: number;
  readonly kineticScore: number;
  readonly tagKo: "점프 정점" | "고속 타격" | "착지 순간";
}

export const DEFAULT_FOOT_LOCKING_CONFIG: FootLockingConfig = Object.freeze({
  floorHeightM: 0,
  soleThicknessM: 0.04,
  contactHeightThresholdM: 0.09,
  contactSpeedThresholdMps: 0.35,
  releaseBlendFrames: 3,
});

const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);
const EPS = 1e-8;

function sub3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function lerp3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function slerpQuat(a: QuatTuple, b: QuatTuple, t: number): QuatTuple {
  const qa = normalizeQuat(a);
  let qb = normalizeQuat(b);
  let dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (dot < 0) {
    dot = -dot;
    qb = [-qb[0], -qb[1], -qb[2], -qb[3]];
  }
  if (dot > 0.9995) {
    return normalizeQuat([
      qa[0] + (qb[0] - qa[0]) * t,
      qa[1] + (qb[1] - qa[1]) * t,
      qa[2] + (qb[2] - qa[2]) * t,
      qa[3] + (qb[3] - qa[3]) * t,
    ]);
  }
  const theta0 = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinTheta0 = Math.sin(theta0);
  const w0 = Math.sin((1 - t) * theta0) / sinTheta0;
  const w1 = Math.sin(t * theta0) / sinTheta0;
  return normalizeQuat([
    qa[0] * w0 + qb[0] * w1,
    qa[1] * w0 + qb[1] * w1,
    qa[2] * w0 + qb[2] * w1,
    qa[3] * w0 + qb[3] * w1,
  ]);
}

/** 로컬 단안 모캡 영상(MP4/WebM) 입력 계약을 검증한다. */
export function validateLocalMocapVideoSource(
  meta: LocalMocapVideoSourceMeta,
): MocapVideoValidationResult {
  if (!meta.isLocalObjectUrl) {
    return { valid: false, reasonKo: "브라우저 로컬 영상 파일만 처리할 수 있습니다." };
  }
  const normalizedMime = meta.mimeType.split(";")[0].trim().toLowerCase();
  const hasAllowedExt = /\.(mp4|webm)$/iu.test(meta.fileName);
  if (!ALLOWED_VIDEO_MIMES.has(normalizedMime) && !hasAllowedExt) {
    return { valid: false, reasonKo: "MP4 또는 WebM 형식 영상만 지원합니다." };
  }
  if (!Number.isFinite(meta.durationSec) || meta.durationSec <= 0 || meta.durationSec > 120) {
    return { valid: false, reasonKo: "영상 길이는 0초 초과 120초 이하여야 합니다." };
  }
  if (!Number.isFinite(meta.fps) || meta.fps < 10 || meta.fps > 120) {
    return { valid: false, reasonKo: "프레임률은 10~120 FPS 범위여야 합니다." };
  }
  if (meta.width < 160 || meta.height < 160) {
    return { valid: false, reasonKo: "해상도가 너무 낮아 관절 추정이 불안정합니다(최소 160px)." };
  }
  return { valid: true, reasonKo: "로컬 모캡 처리 준비 완료" };
}

/**
 * 단일 단안 3D 랜드마크 프레임을 VRM 휴머노이드 본 회전으로 리타게팅한다.
 * T-포즈 기준 본 방향(+X 왼팔, -X 오른팔, +Y 척추/목, -Y 다리)과의 최소 회전 쿼터니언을 계산한다.
 */
export function retargetLandmarkFrameToVrmPose(
  frame: MonocularPoseLandmarkFrame,
): RetargetedMocapPoseFrame {
  const boneRotations: Record<string, QuatTuple> = {
    spine: quatFromUnitVectors([0, 1, 0], sub3(frame.chest, frame.hips)),
    chest: quatFromUnitVectors([0, 1, 0], sub3(frame.neck, frame.spine)),
    neck: quatFromUnitVectors([0, 1, 0], sub3(frame.head, frame.neck)),
    leftUpperArm: quatFromUnitVectors([1, 0, 0], sub3(frame.leftElbow, frame.leftShoulder)),
    leftLowerArm: quatFromUnitVectors([1, 0, 0], sub3(frame.leftWrist, frame.leftElbow)),
    rightUpperArm: quatFromUnitVectors([-1, 0, 0], sub3(frame.rightElbow, frame.rightShoulder)),
    rightLowerArm: quatFromUnitVectors([-1, 0, 0], sub3(frame.rightWrist, frame.rightElbow)),
    leftUpperLeg: quatFromUnitVectors([0, -1, 0], sub3(frame.leftKnee, frame.leftHip)),
    leftLowerLeg: quatFromUnitVectors([0, -1, 0], sub3(frame.leftAnkle, frame.leftKnee)),
    rightUpperLeg: quatFromUnitVectors([0, -1, 0], sub3(frame.rightKnee, frame.rightHip)),
    rightLowerLeg: quatFromUnitVectors([0, -1, 0], sub3(frame.rightAnkle, frame.rightKnee)),
  };

  return {
    timeSec: frame.timeSec,
    hipsPositionM: [frame.hips[0], frame.hips[1], frame.hips[2]],
    boneRotations,
    leftFootWorldM: [frame.leftAnkle[0], frame.leftAnkle[1], frame.leftAnkle[2]],
    rightFootWorldM: [frame.rightAnkle[0], frame.rightAnkle[1], frame.rightAnkle[2]],
    leftFootLocked: false,
    rightFootLocked: false,
  };
}

/**
 * 전체 리타게팅 클립에 물리 발 고정(Foot Locking)을 적용해 발 미끄러짐과 바닥 관통을 제거한다.
 */
export function applyPhysicsFootLocking(
  frames: readonly RetargetedMocapPoseFrame[],
  config: FootLockingConfig = DEFAULT_FOOT_LOCKING_CONFIG,
): RetargetedMocapPoseFrame[] {
  if (frames.length === 0) return [];
  const floorContactY = config.floorHeightM + config.soleThicknessM;
  const maxContactY = config.floorHeightM + config.contactHeightThresholdM;
  const blendFrames = Math.max(1, Math.floor(config.releaseBlendFrames));

  let leftAnchor: Vec3Tuple | null = null;
  let rightAnchor: Vec3Tuple | null = null;
  let leftReleaseCount = 0;
  let rightReleaseCount = 0;

  return frames.map((frame, i) => {
    const prev = frames[Math.max(0, i - 1)];
    const dt = Math.max(1 / 120, frame.timeSec - prev.timeSec);

    const resolveFoot = (
      currPos: Vec3Tuple,
      prevPos: Vec3Tuple,
      anchor: Vec3Tuple | null,
      releaseCount: number,
    ): {
      readonly pos: Vec3Tuple;
      readonly locked: boolean;
      readonly nextAnchor: Vec3Tuple | null;
      readonly nextRelease: number;
    } => {
      const horizSpeed = Math.hypot(currPos[0] - prevPos[0], currPos[2] - prevPos[2]) / dt;
      const inContact = currPos[1] <= maxContactY && (i === 0 || horizSpeed <= config.contactSpeedThresholdMps);
      const safeY = Math.max(floorContactY, currPos[1]);

      if (inContact) {
        const pinned: Vec3Tuple = anchor
          ? [anchor[0], floorContactY, anchor[2]]
          : [currPos[0], floorContactY, currPos[2]];
        return { pos: pinned, locked: true, nextAnchor: pinned, nextRelease: 0 };
      }

      if (anchor && releaseCount < blendFrames) {
        const nextRelease = releaseCount + 1;
        const alpha = nextRelease / (blendFrames + 1);
        const blended = lerp3(anchor, [currPos[0], safeY, currPos[2]], alpha);
        return {
          pos: [blended[0], Math.max(floorContactY, blended[1]), blended[2]],
          locked: false,
          nextAnchor: nextRelease >= blendFrames ? null : anchor,
          nextRelease,
        };
      }

      return {
        pos: [currPos[0], safeY, currPos[2]],
        locked: false,
        nextAnchor: null,
        nextRelease: 0,
      };
    };

    const leftRes = resolveFoot(frame.leftFootWorldM, prev.leftFootWorldM, leftAnchor, leftReleaseCount);
    const rightRes = resolveFoot(frame.rightFootWorldM, prev.rightFootWorldM, rightAnchor, rightReleaseCount);
    leftAnchor = leftRes.nextAnchor;
    rightAnchor = rightRes.nextAnchor;
    leftReleaseCount = leftRes.nextRelease;
    rightReleaseCount = rightRes.nextRelease;

    // 양발 바닥 관통 보정량을 골반 높이에도 일관되게 반영
    const minLift = Math.max(
      leftRes.pos[1] - frame.leftFootWorldM[1],
      rightRes.pos[1] - frame.rightFootWorldM[1],
      0,
    );

    return {
      ...frame,
      hipsPositionM: [frame.hipsPositionM[0], frame.hipsPositionM[1] + minLift, frame.hipsPositionM[2]],
      leftFootWorldM: leftRes.pos,
      rightFootWorldM: rightRes.pos,
      leftFootLocked: leftRes.locked,
      rightFootLocked: rightRes.locked,
    };
  });
}

/**
 * 모캡 클립의 임의 시각(`timeSec`)을 sub-frame SLERP로 보간해 웹툰 스틸 포즈를 추출한다.
 */
export function scrubMocapClipAtTime(
  clip: readonly RetargetedMocapPoseFrame[],
  timeSec: number,
): RetargetedMocapPoseFrame | null {
  if (clip.length === 0) return null;
  if (clip.length === 1 || timeSec <= clip[0].timeSec) return clip[0];
  if (timeSec >= clip[clip.length - 1].timeSec) return clip[clip.length - 1];

  let hi = 1;
  while (hi < clip.length - 1 && clip[hi].timeSec < timeSec) {
    hi += 1;
  }
  const a = clip[hi - 1];
  const b = clip[hi];
  const span = Math.max(EPS, b.timeSec - a.timeSec);
  const t = Math.min(1, Math.max(0, (timeSec - a.timeSec) / span));

  const boneRotations: Record<string, QuatTuple> = {};
  const keys = new Set([...Object.keys(a.boneRotations), ...Object.keys(b.boneRotations)]);
  for (const bone of keys) {
    boneRotations[bone] = slerpQuat(
      a.boneRotations[bone] ?? IDENTITY_QUAT,
      b.boneRotations[bone] ?? IDENTITY_QUAT,
      t,
    );
  }

  return {
    timeSec,
    hipsPositionM: lerp3(a.hipsPositionM, b.hipsPositionM, t),
    boneRotations,
    leftFootWorldM: lerp3(a.leftFootWorldM, b.leftFootWorldM, t),
    rightFootWorldM: lerp3(a.rightFootWorldM, b.rightFootWorldM, t),
    leftFootLocked: t < 0.5 ? a.leftFootLocked : b.leftFootLocked,
    rightFootLocked: t < 0.5 ? a.rightFootLocked : b.rightFootLocked,
  };
}

/**
 * 액션 클립에서 점프 정점·고속 타격·착지 순간 등 웹툰 컷에 쓰기 좋은 핵심 프레임을 자동 추출한다.
 */
export function extractKeyActionPeakFrames(
  clip: readonly RetargetedMocapPoseFrame[],
  maxPeaks = 5,
): ActionClipPeakFrame[] {
  if (clip.length < 3) return [];
  const candidates: ActionClipPeakFrame[] = [];

  for (let i = 1; i < clip.length - 1; i += 1) {
    const prev = clip[i - 1];
    const curr = clip[i];
    const next = clip[i + 1];
    const dt = Math.max(1 / 120, next.timeSec - prev.timeSec);

    const isJumpApex =
      curr.hipsPositionM[1] > prev.hipsPositionM[1]
      && curr.hipsPositionM[1] >= next.hipsPositionM[1]
      && !curr.leftFootLocked
      && !curr.rightFootLocked;

    const isLanding =
      (!prev.leftFootLocked && curr.leftFootLocked)
      || (!prev.rightFootLocked && curr.rightFootLocked);

    const hipsSpeed = Math.hypot(
      next.hipsPositionM[0] - prev.hipsPositionM[0],
      next.hipsPositionM[1] - prev.hipsPositionM[1],
      next.hipsPositionM[2] - prev.hipsPositionM[2],
    ) / dt;

    if (isJumpApex) {
      candidates.push({
        frameIndex: i,
        timeSec: curr.timeSec,
        kineticScore: curr.hipsPositionM[1] + hipsSpeed * 0.5,
        tagKo: "점프 정점",
      });
    } else if (isLanding) {
      candidates.push({
        frameIndex: i,
        timeSec: curr.timeSec,
        kineticScore: 1 + hipsSpeed,
        tagKo: "착지 순간",
      });
    } else if (hipsSpeed > 1.5) {
      candidates.push({
        frameIndex: i,
        timeSec: curr.timeSec,
        kineticScore: hipsSpeed,
        tagKo: "고속 타격",
      });
    }
  }

  return candidates
    .sort((a, b) => b.kineticScore - a.kineticScore)
    .slice(0, Math.max(1, maxPeaks))
    .sort((a, b) => a.frameIndex - b.frameIndex);
}
