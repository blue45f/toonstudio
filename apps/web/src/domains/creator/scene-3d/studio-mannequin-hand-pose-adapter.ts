import type { StudioHandPoseData } from "../studio-hand-pose-scanner";
import type { StudioHandPosePanelProps } from "../StudioHandPosePanel";
import type { StudioMannequinFingerSplayMap, StudioMannequinHandPadOutput } from "./studio-mannequin-ecorche-anatomy";
import type { StudioMannequinFingerName, StudioMannequinFingerPose, StudioMannequinFingerSegmentCurls } from "./studio-mannequin-model";

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

/** 양손 프리셋 편집기의 표시값은 부모가 소유한 오른손 포즈에서 직접 읽는다. */
export function studioMannequinFingerPoseToHandPose(
  pose: StudioMannequinFingerPose,
  rightSplayDeg: Partial<StudioMannequinFingerSplayMap>,
): StudioHandPoseData {
  const finger = (name: StudioMannequinFingerName) => ({
    flex: clampNormalized((pose.right?.[name]?.[0] ?? 0) / 100, 0),
    spread: clampNormalized((rightSplayDeg[name] ?? 0) / 18, -1),
  });
  return {
    thumb: finger("thumb"),
    index: finger("index"),
    middle: finger("middle"),
    ring: finger("ring"),
    little: finger("little"),
  };
}

type UpdateState<T> = (update: (previous: T) => T) => void;

/** 양손을 편집하되 단일 필드 변경은 다른 손가락·마디·벌림을 덮어쓰지 않는다. */
export function createStudioMannequinHandPoseChangeHandler(
  setFingerPose: UpdateState<StudioMannequinFingerPose>,
  setLeftSplayDeg: UpdateState<Partial<StudioMannequinFingerSplayMap>>,
  setRightSplayDeg: UpdateState<Partial<StudioMannequinFingerSplayMap>>,
): StudioHandPosePanelProps["onHandPoseChange"] {
  return (pose, change) => {
    if (change.kind === "preset") {
      const output = studioMannequinHandPoseToPadOutput(pose);
      setFingerPose(() => ({ left: output.segmentCurls, right: output.segmentCurls }));
      setLeftSplayDeg(() => output.splayDeg);
      setRightSplayDeg(() => output.splayDeg);
      return;
    }
    const { finger, field } = change;
    if (field === "flex") {
      const value = clampNormalized(pose[finger].flex, 0) * 100;
      const curls: StudioMannequinFingerSegmentCurls = [value, value, value];
      setFingerPose((previous) => ({
        ...previous,
        left: { ...previous.left, [finger]: curls },
        right: { ...previous.right, [finger]: curls },
      }));
      return;
    }
    const value = clampNormalized(pose[finger].spread, -1) * 18;
    setLeftSplayDeg((previous) => ({ ...previous, [finger]: value }));
    setRightSplayDeg((previous) => ({ ...previous, [finger]: value }));
  };
}
