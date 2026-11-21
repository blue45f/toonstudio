import { bindStudioSpaceTextEntryMovementStop, isStudioSpaceTextEntryTarget } from "../studio-virtual-space-input-guard";
import { STUDIO_INTERACT_KEY_CODES } from "../studio-virtual-space-interact-prompt";
import { studioWorldMayTakeFocus, WORLD_KEY_CODES } from "../studio-virtual-space-phaser-canvas-model";
import { isStudioThreeCameraOrbitKey } from "./studio-virtual-space-three-motion";
import type { StudioThreeCameraMode } from "./studio-virtual-space-three-stage-props";

const CAMERA_MODE_BY_CODE: Readonly<Record<string, StudioThreeCameraMode>> = Object.freeze({
  Digit1: "quarter",
  Digit2: "third-person",
  Digit3: "first-person",
});

export function bindStudioThreeKeyboardInput(
  stage: HTMLElement,
  keys: Set<string>,
  controls: {
    readonly stop: () => void;
    readonly home: () => void;
    readonly interact: () => void;
    readonly onJump?: () => void;
    readonly onCameraMode?: (mode: StudioThreeCameraMode) => void;
    readonly onToggleGhost?: () => void;
  },
): () => void {
  const down = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isStudioSpaceTextEntryTarget(event.target) || isStudioSpaceTextEntryTarget(document.activeElement)) {
      controls.stop();
      return;
    }
    if (!studioWorldMayTakeFocus(document.activeElement, stage)) return;
    if (event.code === "KeyC" || event.key === "Home") {
      event.preventDefault();
      if (!event.repeat) controls.home();
      return;
    }
    if (event.code === "Space" && controls.onJump) {
      event.preventDefault();
      if (!event.repeat) controls.onJump();
      return;
    }
    const nextCameraMode = CAMERA_MODE_BY_CODE[event.code];
    if (nextCameraMode && controls.onCameraMode) {
      event.preventDefault();
      if (!event.repeat) controls.onCameraMode(nextCameraMode);
      return;
    }
    if (event.code === "KeyG" && controls.onToggleGhost) {
      event.preventDefault();
      if (!event.repeat) controls.onToggleGhost();
      return;
    }
    if (!WORLD_KEY_CODES.has(event.code) && !isStudioThreeCameraOrbitKey(event.code)) return;
    if (event.code.startsWith("Arrow")) event.preventDefault();
    keys.add(event.code);
    if (!event.repeat && STUDIO_INTERACT_KEY_CODES.has(event.code)) controls.interact();
  };
  const up = (event: KeyboardEvent) => { keys.delete(event.code); };
  const hidden = () => { if (document.hidden) controls.stop(); };
  const unbindText = bindStudioSpaceTextEntryMovementStop(controls.stop);
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", controls.stop);
  document.addEventListener("visibilitychange", hidden);
  return () => {
    unbindText();
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", controls.stop);
    document.removeEventListener("visibilitychange", hidden);
  };
}
