/** 손 패드와 손 포즈 프리셋을 같은 마네킹 손가락 상태에 적용한다. */
import { useCallback, useState } from "react";

import { STUDIO_HAND_PRESETS, type StudioHandPoseData } from "../studio-hand-pose-scanner";

import {
  mergeHandPadIntoFingerPose,
  type StudioMannequinFingerSplayMap,
  type StudioMannequinHandPadOutput,
} from "./studio-mannequin-ecorche-anatomy";
import {
  clampStudioMannequinFingerPose,
  type StudioMannequinFingerPose,
} from "./studio-mannequin-model";
import { studioMannequinHandPoseToPadOutput } from "./studio-mannequin-hand-pose-adapter";

export function useStudioMannequinHandPose() {
  const [fingerPose, setFingerPose] = useState<StudioMannequinFingerPose>(
    () => clampStudioMannequinFingerPose(undefined),
  );
  const [handScannerPose, setHandScannerPose] = useState<StudioHandPoseData | undefined>(
    () => STUDIO_HAND_PRESETS[0]?.pose,
  );
  const [leftSplayDeg, setLeftSplayDeg] = useState<Partial<StudioMannequinFingerSplayMap>>({});
  const [rightSplayDeg, setRightSplayDeg] = useState<Partial<StudioMannequinFingerSplayMap>>({});

  const handleApplyHandPad = useCallback(
    (side: "left" | "right" | "both", output: StudioMannequinHandPadOutput) => {
      setFingerPose((prev) => mergeHandPadIntoFingerPose(prev, side, output));
      if (side === "left" || side === "both") setLeftSplayDeg(output.splayDeg);
      if (side === "right" || side === "both") setRightSplayDeg(output.splayDeg);
    },
    [],
  );

  const handleScannerHandPoseChange = useCallback((nextHandPose: StudioHandPoseData) => {
    setHandScannerPose(nextHandPose);
    handleApplyHandPad("both", studioMannequinHandPoseToPadOutput(nextHandPose));
  }, [handleApplyHandPad]);

  return {
    fingerPose,
    setFingerPose,
    handScannerPose,
    leftSplayDeg,
    rightSplayDeg,
    handleApplyHandPad,
    handleScannerHandPoseChange,
  };
}
