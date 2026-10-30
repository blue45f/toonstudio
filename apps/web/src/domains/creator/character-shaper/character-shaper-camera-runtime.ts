import { MOUSE } from "three";

import { resolveShaperThreeStyleCameraAction } from "./character-shaper-ui-model";

import type { ShaperCameraControlStyle, ShaperCameraDragAction } from "./character-shaper-ui-model";
import type { CharacterShaperGazeMode } from "./character-shaper-session-settings";
import type { VRMLookAt } from "@pixiv/three-vrm";
import type { Object3D } from "three";

function actionButton(action: ShaperCameraDragAction, nativeModifierSwap: boolean): MOUSE | undefined {
  // OrbitControls도 Ctrl/Shift/Meta에서 ROTATE와 PAN을 바꾸므로 원하는 최종 동작의 반대 값을 전달한다.
  return action === "orbit" ? (nativeModifierSwap ? MOUSE.PAN : MOUSE.ROTATE)
    : action === "pan" ? (nativeModifierSwap ? MOUSE.ROTATE : MOUSE.PAN)
      : action === "zoom" ? MOUSE.DOLLY : undefined;
}

/** DOM pointerdown의 capture 단계에서 실제 OrbitControls 버튼을 바꾼다. */
export function characterShaperOrbitMouseButtons(style: ShaperCameraControlStyle, modifiers: {
  readonly altKey?: boolean; readonly shiftKey?: boolean; readonly ctrlKey?: boolean; readonly metaKey?: boolean;
} = {}) {
  const keys = { altKey: modifiers.altKey, shiftKey: modifiers.shiftKey, ctrlKey: modifiers.ctrlKey };
  const nativeModifierSwap = Boolean(modifiers.ctrlKey || modifiers.shiftKey || modifiers.metaKey);
  return {
    LEFT: actionButton(resolveShaperThreeStyleCameraAction({ style, button: "left", ...keys }), nativeModifierSwap),
    MIDDLE: actionButton(resolveShaperThreeStyleCameraAction({ style, button: "middle", ...keys }), nativeModifierSwap),
    RIGHT: actionButton(resolveShaperThreeStyleCameraAction({ style, button: "right", ...keys }), nativeModifierSwap),
  };
}

export type CharacterShaperLookAtPort = Pick<VRMLookAt, "target" | "autoUpdate" | "yaw" | "pitch" | "update">;

export interface CharacterShaperGazeLease {
  update(mode: CharacterShaperGazeMode, captureFrozen: boolean): void;
  release(): void;
}

/** 모델 해제나 웹캠 재개 때 기존 시선 소유권을 복원하고 캡처는 현재 방향만 동결한다. */
export function installCharacterShaperGaze(lookAt: CharacterShaperLookAtPort, camera: Object3D): CharacterShaperGazeLease {
  const previous = { target: lookAt.target, autoUpdate: lookAt.autoUpdate, yaw: lookAt.yaw, pitch: lookAt.pitch };
  let released = false;
  return {
    update(mode, captureFrozen) {
      if (released) return;
      if (captureFrozen) {
        // 캡처의 vrm.update(0)도 마지막 화면의 눈 방향을 유지한다. 이전 소유자 복원과 구분한다.
        lookAt.autoUpdate = false;
        return;
      }
      lookAt.autoUpdate = mode === "cam";
      lookAt.target = mode === "cam" ? camera : undefined;
      if (mode === "fix") { lookAt.yaw = 0; lookAt.pitch = 0; }
      lookAt.update(0);
    },
    release() {
      if (released) return;
      released = true;
      lookAt.target = previous.target;
      lookAt.autoUpdate = previous.autoUpdate;
      lookAt.yaw = previous.yaw;
      lookAt.pitch = previous.pitch;
      lookAt.update(0);
    },
  };
}
