/** 손 패드와 손 포즈 프리셋을 같은 마네킹 손가락 상태에 적용한다. */
import { useCallback, useState } from "react";

import {
  mergeHandPadIntoFingerPose,
  type StudioMannequinFingerSplayMap,
  type StudioMannequinHandPadOutput,
} from "./studio-mannequin-ecorche-anatomy";
import {
  clampStudioMannequinFingerPose,
  studioMannequinFingerPoseFromCurls,
  type StudioMannequinHandFingerPose,
  type StudioMannequinFingerPose,
} from "./studio-mannequin-model";
import {
  createStudioMannequinHandPoseChangeHandler,
  studioMannequinFingerPoseToHandPose,
} from "./studio-mannequin-hand-pose-adapter";

import { getStudioMannequinHandPreset, type StudioHandFingerCurl, type StudioMannequinHandSide } from "./studio-mannequin-hand-presets";

export function useStudioMannequinHandPose() {
  const [fingerPose, setFingerPose] = useState<StudioMannequinFingerPose>(
    () => clampStudioMannequinFingerPose(undefined),
  );
  const [leftSplayDeg, setLeftSplayDeg] = useState<Partial<StudioMannequinFingerSplayMap>>({});
  const [rightSplayDeg, setRightSplayDeg] = useState<Partial<StudioMannequinFingerSplayMap>>({});
  const handScannerPose = studioMannequinFingerPoseToHandPose(fingerPose, rightSplayDeg);

  const setFingerCurls = useCallback((side: StudioMannequinHandSide, curls: Partial<StudioHandFingerCurl>) => {
    const patch: StudioMannequinHandFingerPose | undefined = studioMannequinFingerPoseFromCurls({ [side]: curls })[side];
    setFingerPose((previous) => ({ ...previous, [side]: { ...previous[side], ...patch } }));
  }, []);
  const setFingerSpread = useCallback((side: StudioMannequinHandSide, spread: Partial<StudioMannequinFingerSplayMap>) => {
    (side === "left" ? setLeftSplayDeg : setRightSplayDeg)(spread);
  }, []);
  const applyLibraryHandPreset = useCallback((id: string) => {
    const name = id.replace(/^hand-/u, "");
    const preset = getStudioMannequinHandPreset(name === "chin" ? "chin-rest" : name === "call" ? "phone" : name);
    if (!preset) return;
    for (const side of ["left", "right"] as const) {
      setFingerCurls(side, preset.curl);
      setFingerSpread(side, preset.splayDeg);
    }
  }, [setFingerCurls, setFingerSpread]);

  const handleApplyHandPad = useCallback(
    (side: "left" | "right" | "both", output: StudioMannequinHandPadOutput) => {
      setFingerPose((prev) => mergeHandPadIntoFingerPose(prev, side, output));
      if (side === "left" || side === "both") setLeftSplayDeg(output.splayDeg);
      if (side === "right" || side === "both") setRightSplayDeg(output.splayDeg);
    },
    [],
  );

  const handleScannerHandPoseChange = createStudioMannequinHandPoseChangeHandler(
    setFingerPose, setLeftSplayDeg, setRightSplayDeg,
  );

  return {
    fingerPose,
    setFingerPose,
    handScannerPose,
    leftSplayDeg,
    rightSplayDeg,
    setFingerCurls,
    setFingerSpread,
    applyLibraryHandPreset,
    handleApplyHandPad,
    handleScannerHandPoseChange,
  };
}
