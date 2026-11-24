import { MOUSE } from "three";

import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES } from "../studio-pose-presets";

import { resolveShaperThreeStyleCameraAction } from "./character-shaper-ui-model";

import type { PoseGazeIntent } from "../studio-pose-presets";
import type { ShaperCameraControlStyle, ShaperCameraDragAction } from "./character-shaper-ui-model";
import type { CharacterShaperGazeMode, CharacterShaperGazeOffset } from "./character-shaper-session-settings";
import type { VRMLookAt } from "@pixiv/three-vrm";
import type { Object3D } from "three";

const DEFAULT_KEY_LIGHT_YAW_DEG = 22;
const DEFAULT_KEY_LIGHT_PITCH_DEG = 14;
const GAZE_YAW_LIMIT_DEG = 30;
const GAZE_PITCH_LIMIT_DEG = 24;
const CAMERA_SUBTLE_YAW_LIMIT_DEG = 8;
const CAMERA_SUBTLE_PITCH_LIMIT_DEG = 6;

export type CharacterShaperPoseGazeTarget =
  | PoseGazeIntent["target"]
  | "ground"
  | "up"
  | "left"
  | "right";

export interface CharacterShaperPoseGazeIntentInput {
  readonly target: CharacterShaperPoseGazeTarget;
  readonly pitchDeg?: number;
  readonly yawDeg?: number;
  readonly convergence?: number;
}

export interface CharacterShaperResolvedGaze {
  readonly gazeMode: CharacterShaperGazeMode;
  readonly gazeOffset: CharacterShaperGazeOffset;
}

function clampGazeDeg(value: number, limit: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * 포즈 프리셋의 `gazeIntent`를 Character Shaper 시선 모드(`cam`/`world`)와 오프셋으로 해석한다.
 * - `camera`: 카메라 응시(`cam`) + 중립/미세 오프셋
 * - `hands` / `ground` / `down` / `up` / `left` / `right` / `forward` / `side`:
 *   월드 고정(`world`) + 유효 각도 범위로 클램프한 `pitchDeg`/`yawDeg`
 */
export function resolveCharacterShaperGazeFromPoseIntent(
  gazeIntent?: CharacterShaperPoseGazeIntentInput | null,
): CharacterShaperResolvedGaze | null {
  if (!gazeIntent) return null;
  const rawPitch = typeof gazeIntent.pitchDeg === "number" && Number.isFinite(gazeIntent.pitchDeg)
    ? gazeIntent.pitchDeg
    : 0;
  const rawYaw = typeof gazeIntent.yawDeg === "number" && Number.isFinite(gazeIntent.yawDeg)
    ? gazeIntent.yawDeg
    : 0;

  if (gazeIntent.target === "camera") {
    return Object.freeze({
      gazeMode: "cam",
      gazeOffset: Object.freeze({
        yawDeg: clampGazeDeg(rawYaw, CAMERA_SUBTLE_YAW_LIMIT_DEG),
        pitchDeg: clampGazeDeg(rawPitch, CAMERA_SUBTLE_PITCH_LIMIT_DEG),
      }),
    });
  }

  let pitchDeg = rawPitch;
  let yawDeg = rawYaw;
  switch (gazeIntent.target) {
    case "hands":
      if (pitchDeg === 0) pitchDeg = -18;
      break;
    case "ground":
    case "down":
      if (pitchDeg === 0) pitchDeg = -20;
      break;
    case "up":
      if (pitchDeg === 0) pitchDeg = 16;
      break;
    case "left":
      if (yawDeg === 0) yawDeg = -18;
      break;
    case "right":
    case "side":
      if (yawDeg === 0) yawDeg = 18;
      break;
    case "forward":
      break;
    default:
      return null;
  }

  return Object.freeze({
    gazeMode: "world",
    gazeOffset: Object.freeze({
      yawDeg: clampGazeDeg(yawDeg, GAZE_YAW_LIMIT_DEG),
      pitchDeg: clampGazeDeg(pitchDeg, GAZE_PITCH_LIMIT_DEG),
    }),
  });
}

/** 포즈 프리셋 ID로 `gazeIntent`를 조회해 시선 모드·오프셋을 계산한다. 의도가 없는 프리셋이면 `null`. */
export function resolveCharacterShaperGazeForPosePreset(
  presetId: string | null | undefined,
): CharacterShaperResolvedGaze | null {
  if (!presetId) return null;
  const preset =
    EXTRA_POSE_PRESETS.find((item) => item.id === presetId)
    ?? NATURAL_IDLE_POSES.find((item) => item.id === presetId)
    ?? null;
  return resolveCharacterShaperGazeFromPoseIntent(preset?.gazeIntent);
}

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
  update(mode: CharacterShaperGazeMode, captureFrozen: boolean, offset?: CharacterShaperGazeOffset): void;
  release(): void;
}

/** 모델 해제나 웹캠 재개 때 기존 시선 소유권을 복원하고 캡처는 현재 방향만 동결한다. */
export function installCharacterShaperGaze(lookAt: CharacterShaperLookAtPort, camera: Object3D): CharacterShaperGazeLease {
  const previous = { target: lookAt.target, autoUpdate: lookAt.autoUpdate, yaw: lookAt.yaw, pitch: lookAt.pitch };
  let released = false;
  return {
    update(mode, captureFrozen, offset) {
      if (released) return;
      if (captureFrozen) {
        // 캡처의 vrm.update(0)도 마지막 화면의 눈 방향을 유지한다. 이전 소유자 복원과 구분한다.
        lookAt.autoUpdate = false;
        return;
      }
      const yawOffset = clampGazeDeg(offset?.yawDeg ?? 0, GAZE_YAW_LIMIT_DEG);
      const pitchOffset = clampGazeDeg(offset?.pitchDeg ?? 0, GAZE_PITCH_LIMIT_DEG);
      lookAt.autoUpdate = mode === "cam";
      lookAt.target = mode === "cam" ? camera : undefined;
      if (mode === "fix") {
        lookAt.yaw = 0;
        lookAt.pitch = 0;
      } else if (mode === "light") {
        lookAt.yaw = clampGazeDeg(DEFAULT_KEY_LIGHT_YAW_DEG + yawOffset * 0.5, GAZE_YAW_LIMIT_DEG);
        lookAt.pitch = clampGazeDeg(DEFAULT_KEY_LIGHT_PITCH_DEG + pitchOffset * 0.5, GAZE_PITCH_LIMIT_DEG);
      } else if (mode === "world") {
        lookAt.yaw = yawOffset;
        lookAt.pitch = pitchOffset;
      }
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
