import { useEffect, useMemo, useState } from "react";

import { DEFAULT_CHARACTER_OUTPUT_FRAMING } from "./character-shaper-framing";
import { DEFAULT_SHAPER_MTOON_SETTINGS } from "./character-shaper-mtoon-uniforms";
import {
  CharacterShaperSettingsContext,
  DEFAULT_CHARACTER_SHAPER_GAZE_OFFSET,
} from "./character-shaper-session-settings";
import { isCharacterShaperTypingTarget, pushCharacterShaperKeyLayer } from "./character-shaper-ui-model";

import type { CharacterExportEdge } from "./character-shaper-export";
import type { ShaperMtoonMaterialSettings } from "./character-shaper-mtoon-uniforms";
import type {
  CharacterShaperGazeMode,
  CharacterShaperGazeOffset,
  CharacterShaperPsdOptions,
} from "./character-shaper-session-settings";
import type { ShaperCameraControlStyle } from "./character-shaper-ui-model";
import type { ReactNode } from "react";

/** 동일 작업실의 HUD·품질 검수·실제 출력이 한 세션 설정을 읽는다. */
export function CharacterShaperSessionSettingsProvider({ children, gazeAvailable = false, locked = false }: {
  readonly children: ReactNode;
  readonly gazeAvailable?: boolean;
  readonly locked?: boolean;
}) {
  const [psdOptions, setPsdOptions] = useState<CharacterShaperPsdOptions>({ createHairLayer: true, extractLuminanceOutline: true });
  const [exportEdge, setExportEdge] = useState<CharacterExportEdge>(2048);
  const [framing, setFraming] = useState(DEFAULT_CHARACTER_OUTPUT_FRAMING);
  const [cameraStyle, setCameraStyle] = useState<ShaperCameraControlStyle>("unity");
  const [gazeMode, setGazeMode] = useState<CharacterShaperGazeMode>("cam");
  const [gazeOffset, setGazeOffset] = useState<CharacterShaperGazeOffset>(DEFAULT_CHARACTER_SHAPER_GAZE_OFFSET);
  const [shaperMaterial, setShaperMaterial] = useState<ShaperMtoonMaterialSettings>(DEFAULT_SHAPER_MTOON_SETTINGS);
  const value = useMemo(
    () => ({
      psdOptions,
      setPsdOptions,
      exportEdge,
      setExportEdge,
      framing,
      setFraming,
      cameraStyle,
      setCameraStyle,
      gazeMode,
      setGazeMode,
      gazeOffset,
      setGazeOffset,
      shaperMaterial,
      setShaperMaterial,
    }),
    [psdOptions, exportEdge, framing, cameraStyle, gazeMode, gazeOffset, shaperMaterial],
  );
  useEffect(() => {
    if (locked || !gazeAvailable) return;
    return pushCharacterShaperKeyLayer((event) => {
      if (event.key !== "F10" || event.isComposing || event.repeat || isCharacterShaperTypingTarget(event.target)) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      setGazeMode((mode) => mode === "cam" ? "fix" : "cam");
      return true;
    }, window);
  }, [gazeAvailable, locked]);
  return <CharacterShaperSettingsContext.Provider value={value}>{children}</CharacterShaperSettingsContext.Provider>;
}
