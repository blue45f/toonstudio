/** 손 패드와 손 포즈 프리셋을 같은 마네킹 손가락 상태에 적용한다. */
import { useCallback, useRef, useState, type SetStateAction } from "react";

import {
  mergeHandPadIntoFingerPose,
  type StudioMannequinFingerSplayMap,
  type StudioMannequinHandState,
  type StudioMannequinHandPadOutput,
} from "./studio-mannequin-ecorche-anatomy";
import {
  clampStudioMannequinFingerPose,
  studioMannequinFingerPoseFromCurls,
  type StudioMannequinFingerPose,
} from "./studio-mannequin-model";
import {
  createStudioMannequinHandPoseChangeHandler,
  studioMannequinFingerPoseToHandPose,
} from "./studio-mannequin-hand-pose-adapter";

import { getStudioMannequinHandPreset, type StudioHandFingerCurl, type StudioMannequinHandSide } from "./studio-mannequin-hand-presets";

export function resolveStudioMannequinLibraryHandState(id: string): StudioMannequinHandState | undefined {
  const name = id.replace(/^hand-/u, "");
  const preset = getStudioMannequinHandPreset(name === "chin" ? "chin-rest" : name === "call" ? "phone" : name);
  if (!preset) return undefined;
  return {
    fingerPose: studioMannequinFingerPoseFromCurls({ left: preset.curl, right: preset.curl }),
    leftSplayDeg: preset.splayDeg,
    rightSplayDeg: preset.splayDeg,
  };
}

export function useStudioMannequinHandPose() {
  const [hands, setHands] = useState<StudioMannequinHandState>(() => ({
    fingerPose: clampStudioMannequinFingerPose(undefined),
    leftSplayDeg: {},
    rightSplayDeg: {},
  }));
  const handsRef = useRef(hands);
  // 같은 이벤트에서 이어지는 명령도 React 렌더를 기다리지 않고 직전 손 상태를 읽는다.
  const commitHands = useCallback((next: StudioMannequinHandState) => {
    handsRef.current = next;
    setHands(next);
  }, []);
  const setFingerPose = useCallback((update: SetStateAction<StudioMannequinFingerPose>) => {
    const current = handsRef.current;
    commitHands({ ...current, fingerPose: typeof update === "function" ? update(current.fingerPose) : update });
  }, [commitHands]);
  const setFingerCurls = useCallback((side: StudioMannequinHandSide, curls: Partial<StudioHandFingerCurl>) => {
    const patch = studioMannequinFingerPoseFromCurls({ [side]: curls })[side];
    setFingerPose((previous) => ({ ...previous, [side]: { ...previous[side], ...patch } }));
  }, [setFingerPose]);
  const setFingerSpread = useCallback((side: StudioMannequinHandSide, spread: Partial<StudioMannequinFingerSplayMap>) => {
    commitHands({ ...handsRef.current, [side === "left" ? "leftSplayDeg" : "rightSplayDeg"]: spread });
  }, [commitHands]);

  const handleApplyHandPad = useCallback(
    (side: StudioMannequinHandSide | "both", output: StudioMannequinHandPadOutput) => {
      const current = handsRef.current;
      commitHands({
        fingerPose: mergeHandPadIntoFingerPose(current.fingerPose, side, output),
        leftSplayDeg: side === "right" ? current.leftSplayDeg : output.splayDeg,
        rightSplayDeg: side === "left" ? current.rightSplayDeg : output.splayDeg,
      });
    },
    [commitHands],
  );
  const handleScannerHandPoseChange = createStudioMannequinHandPoseChangeHandler(
    setFingerPose,
    (update) => setFingerSpread("left", update(handsRef.current.leftSplayDeg)),
    (update) => setFingerSpread("right", update(handsRef.current.rightSplayDeg)),
  );
  return {
    ...hands, handsRef, commitHands, setFingerPose, setFingerCurls, setFingerSpread,
    handScannerPose: studioMannequinFingerPoseToHandPose(hands.fingerPose, hands.rightSplayDeg),
    handleApplyHandPad, handleScannerHandPoseChange,
  };
}
