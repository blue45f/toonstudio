import { createContext, useContext, useState } from "react";

import { DEFAULT_CHARACTER_OUTPUT_FRAMING } from "./character-shaper-framing";
import { DEFAULT_SHAPER_MTOON_SETTINGS } from "./character-shaper-mtoon-uniforms";

import type { CharacterExportEdge } from "./character-shaper-export";
import type { CharacterOutputFraming } from "./character-shaper-framing";
import type { ShaperMtoonMaterialSettings } from "./character-shaper-mtoon-uniforms";
import type { ShaperCameraControlStyle } from "./character-shaper-ui-model";
import type { Dispatch, SetStateAction } from "react";

export interface CharacterShaperPsdOptions {
  readonly createHairLayer: boolean;
  readonly extractLuminanceOutline: boolean;
}

export type CharacterShaperGazeMode = "cam" | "fix" | "light" | "world";

export interface CharacterShaperGazeOffset {
  readonly yawDeg: number;
  readonly pitchDeg: number;
}

export const DEFAULT_CHARACTER_SHAPER_GAZE_OFFSET: CharacterShaperGazeOffset = Object.freeze({
  yawDeg: 0,
  pitchDeg: 0,
});

interface CharacterShaperSessionSettings {
  readonly exportEdge: CharacterExportEdge;
  readonly setExportEdge: Dispatch<SetStateAction<CharacterExportEdge>>;
  readonly framing: CharacterOutputFraming;
  readonly setFraming: Dispatch<SetStateAction<CharacterOutputFraming>>;
  readonly psdOptions: CharacterShaperPsdOptions;
  readonly setPsdOptions: Dispatch<SetStateAction<CharacterShaperPsdOptions>>;
  readonly cameraStyle: ShaperCameraControlStyle;
  readonly setCameraStyle: Dispatch<SetStateAction<ShaperCameraControlStyle>>;
  readonly gazeMode: CharacterShaperGazeMode;
  readonly setGazeMode: Dispatch<SetStateAction<CharacterShaperGazeMode>>;
  readonly gazeOffset: CharacterShaperGazeOffset;
  readonly setGazeOffset: Dispatch<SetStateAction<CharacterShaperGazeOffset>>;
  readonly shaperMaterial: ShaperMtoonMaterialSettings;
  readonly setShaperMaterial: Dispatch<SetStateAction<ShaperMtoonMaterialSettings>>;
}

export const CharacterShaperSettingsContext = createContext<CharacterShaperSessionSettings | null>(null);

export function useCharacterShaperSessionSettings() { return useContext(CharacterShaperSettingsContext); }

/** 단독 출력 도크도 사용 가능하지만 작업실에서는 반드시 공유 provider가 우선한다. */
export function useCharacterShaperOutputSettings() {
  const shared = useCharacterShaperSessionSettings();
  const [local, setLocal] = useState<CharacterShaperPsdOptions>({ createHairLayer: true, extractLuminanceOutline: true });
  const [exportEdge, setExportEdge] = useState<CharacterExportEdge>(2048);
  const [framing, setFraming] = useState(DEFAULT_CHARACTER_OUTPUT_FRAMING);
  return { psdOptions: shared?.psdOptions ?? local, setPsdOptions: shared?.setPsdOptions ?? setLocal,
    exportEdge: shared?.exportEdge ?? exportEdge, setExportEdge: shared?.setExportEdge ?? setExportEdge,
    framing: shared?.framing ?? framing, setFraming: shared?.setFraming ?? setFraming };
}

export function useCharacterShaperMaterialSettings() {
  const shared = useCharacterShaperSessionSettings();
  const [local, setLocal] = useState<ShaperMtoonMaterialSettings>(DEFAULT_SHAPER_MTOON_SETTINGS);
  return {
    shaperMaterial: shared?.shaperMaterial ?? local,
    setShaperMaterial: shared?.setShaperMaterial ?? setLocal,
  };
}
