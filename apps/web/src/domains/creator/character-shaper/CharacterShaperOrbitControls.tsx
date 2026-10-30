import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { characterShaperOrbitMouseButtons, installCharacterShaperGaze } from "./character-shaper-camera-runtime";
import { useCharacterShaperSessionSettings } from "./character-shaper-session-settings";

import type { CharacterShaperGazeLease, CharacterShaperLookAtPort } from "./character-shaper-camera-runtime";
import type { ComponentProps, ComponentRef } from "react";

/** 셰이퍼 밖의 기존 VRM 화면은 기존 OrbitControls 동작을 그대로 사용한다. */
export function CharacterShaperOrbitControls({ lookAt, gazePaused, captureFrozen = false, ...props }: ComponentProps<typeof OrbitControls> & {
  readonly lookAt?: CharacterShaperLookAtPort | null;
  readonly gazePaused?: boolean;
  readonly captureFrozen?: boolean;
}) {
  const settings = useCharacterShaperSessionSettings();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, gl, invalidate } = useThree();
  const style = settings?.cameraStyle;
  const gazeMode = settings?.gazeMode;
  const gazeLease = useRef<CharacterShaperGazeLease | null>(null);
  const gazeAvailable = gazeMode !== undefined;
  useEffect(() => {
    if (!style) return;
    const update = (event?: PointerEvent) => {
      if (controls.current) Object.assign(controls.current.mouseButtons, characterShaperOrbitMouseButtons(style, event));
    };
    update();
    gl.domElement.addEventListener("pointerdown", update, true);
    return () => gl.domElement.removeEventListener("pointerdown", update, true);
  }, [gl, style]);
  useEffect(() => {
    if (!lookAt || !gazeAvailable || gazePaused) return;
    const lease = installCharacterShaperGaze(lookAt, camera);
    gazeLease.current = lease;
    return () => { lease.release(); gazeLease.current = null; invalidate(); };
  }, [camera, gazeAvailable, gazePaused, invalidate, lookAt]);
  useEffect(() => {
    if (!gazeMode || !lookAt || gazePaused) return;
    gazeLease.current?.update(gazeMode, captureFrozen);
    invalidate();
  }, [camera, captureFrozen, gazeMode, gazePaused, invalidate, lookAt]);
  return <OrbitControls {...props} ref={controls} enablePan={settings ? true : props.enablePan} />;
}
