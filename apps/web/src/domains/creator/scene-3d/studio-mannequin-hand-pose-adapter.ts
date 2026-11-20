import type { StudioHandPoseData } from "../studio-hand-pose-scanner";
import type { StudioMannequinHandPadOutput } from "./studio-mannequin-ecorche-anatomy";
import type { StudioMannequinFingerName, StudioMannequinFingerSegmentCurls } from "./studio-mannequin-model";

function clampNormalized(value: number, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(1, value)) : 0;
}

/** 손 프리셋의 정규화 값을 기존 손 패드의 마디 컬(0–100)과 벌림 각도(±18°)로 연결한다. */
export function studioMannequinHandPoseToPadOutput(pose: StudioHandPoseData): StudioMannequinHandPadOutput {
  const curls = (finger: StudioMannequinFingerName): StudioMannequinFingerSegmentCurls => {
    const value = clampNormalized(pose[finger].flex, 0) * 100;
    return [value, value, value];
  };
  const splay = (finger: StudioMannequinFingerName) => clampNormalized(pose[finger].spread, -1) * 18;
  return {
    segmentCurls: {
      thumb: curls("thumb"),
      index: curls("index"),
      middle: curls("middle"),
      ring: curls("ring"),
      little: curls("little"),
    },
    splayDeg: {
      thumb: splay("thumb"),
      index: splay("index"),
      middle: splay("middle"),
      ring: splay("ring"),
      little: splay("little"),
    },
  };
}
