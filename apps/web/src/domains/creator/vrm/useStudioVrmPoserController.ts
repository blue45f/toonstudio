/**
 * Studio VRM poser controller — wires extracted state/runtime slices.
 */
import { useLayoutEffect, useRef } from "react";

import { StudioVrmPngWorkerSession } from "./studio-vrm-png-worker-session";
import { useStudioVrmPoserBroadcast } from "./useStudioVrmPoserBroadcast";
import { useStudioVrmPoserIk } from "./useStudioVrmPoserIk";
import { useStudioVrmPoserInstall } from "./useStudioVrmPoserInstall";
import { useStudioVrmPoserNotice } from "./useStudioVrmPoserNotice";
import { useStudioVrmPoserPoseEdit } from "./useStudioVrmPoserPoseEdit";
import { useStudioVrmPoserPoseLibrary } from "./useStudioVrmPoserPoseLibrary";
import { useStudioVrmPoserRuntimeA } from "./useStudioVrmPoserRuntimeA";
import { useStudioVrmPoserRuntimeB } from "./useStudioVrmPoserRuntimeB";
import { useStudioVrmPoserRuntimeC } from "./useStudioVrmPoserRuntimeC";
import { useStudioVrmPoserRuntimeD } from "./useStudioVrmPoserRuntimeD";
import { useStudioVrmPoserRuntimeE } from "./useStudioVrmPoserRuntimeE";
import { useStudioVrmPoserShare } from "./useStudioVrmPoserShare";
import { useStudioVrmPoserState } from "./useStudioVrmPoserState";
import { useStudioVrmContextRecovery } from "./useStudioVrmContextRecovery";

import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";
import type { StudioVrmPoserProps } from "./StudioVrmPoserTypes";

export function useStudioVrmPoserController(props: StudioVrmPoserProps): StudioVrmPoserHost {
  const h = useStudioVrmPoserState(props);
  const pngSessionRef = useRef<StudioVrmPngWorkerSession | null>(null);
  useLayoutEffect(() => {
    if (!props.open) return;
    const session = new StudioVrmPngWorkerSession();
    pngSessionRef.current = session;
    return () => {
      pngSessionRef.current = null;
      session.dispose();
    };
  }, [props.open, h.activeModelId]);
  h.pngSessionRef = pngSessionRef;
  const impl: Record<string, (...args: any[]) => any> = {};
  h.__impl = impl;
  h.commitFullStateRestore = (...args: any[]) => impl.commitFullStateRestore(...args);
  h.applyProportionRigState = (...args: any[]) => impl.applyProportionRigState(...args);
  h.rememberCharacterSelection = (...args: any[]) => impl.rememberCharacterSelection(...args);
  h.clearCurrentVrm = (...args: any[]) => impl.clearCurrentVrm(...args);
  h.installVrm = (...args: any[]) => impl.installVrm(...args);
  useStudioVrmPoserNotice(h);
  useStudioVrmPoserRuntimeA(h);
  useStudioVrmPoserIk(h);
  useStudioVrmPoserRuntimeB(h);
  useStudioVrmPoserBroadcast(h);
  useStudioVrmPoserRuntimeC(h);
  useStudioVrmPoserPoseLibrary(h);
  useStudioVrmPoserShare(h);
  useStudioVrmPoserRuntimeD(h);
  useStudioVrmPoserInstall(h);
  useStudioVrmPoserPoseEdit(h);
  useStudioVrmPoserRuntimeE(h);
  return useStudioVrmContextRecovery(h);
}
