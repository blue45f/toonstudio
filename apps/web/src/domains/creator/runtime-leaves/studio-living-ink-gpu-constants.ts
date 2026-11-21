/** Living Ink GPU 프로토콜 기본 상수·타입 (순수 리프 모듈). */
export const STUDIO_LIVING_INK_GPU_PROTOCOL_VERSION = 1 as const;

export interface StudioLivingInkMaterialControls {
  readonly brushSizeCells: number;
  readonly flow: number;
  readonly bleed: number;
  readonly dryRate: number;
  readonly chromaticSeparation: number;
  readonly brushPigmentLoad: number;
  readonly capillaryCreep: number;
  readonly vorticity: number;
  readonly dryingEdgeDeposition: number;
  readonly wetOnWetMixing: number;
  readonly glazeOverFixed: number;
  readonly paperFiber: number;
  readonly paperTooth: number;
  readonly granulation: number;
  readonly edgeDarkening: number;
  readonly wetSheen: number;
  readonly vignette: number;
  readonly beerLambertDensity: number;
}

export interface StudioLivingInkInputPolicy {
  readonly toolMode:
    | "pressure-speed-pen"
    | "clean-water-brush"
    | "pigment-water-brush"
    | "white-gouache";
  readonly pointerSource: "pen" | "finger" | "mouse";
  readonly pressureSource: "hardware" | "force-touch" | "speed-simulated";
  readonly barrelMomentarySwap: "none" | "ink-water";
  readonly rejectPalm: boolean;
  readonly rejectSecondaryPointer: boolean;
}

export const DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS:
  StudioLivingInkMaterialControls = Object.freeze({
    brushSizeCells: 12,
    flow: 0.72,
    bleed: 0.56,
    dryRate: 0.18,
    chromaticSeparation: 0.08,
    brushPigmentLoad: 0.7,
    capillaryCreep: 0.34,
    vorticity: 0.18,
    dryingEdgeDeposition: 0.58,
    wetOnWetMixing: 0.72,
    glazeOverFixed: 0.16,
    paperFiber: 0.5,
    paperTooth: 0.56,
    granulation: 0.42,
    edgeDarkening: 0.54,
    wetSheen: 0.24,
    vignette: 0.12,
    beerLambertDensity: 0.82,
  });

export const DEFAULT_STUDIO_LIVING_INK_INPUT_POLICY:
  StudioLivingInkInputPolicy = Object.freeze({
    toolMode: "pressure-speed-pen",
    pointerSource: "pen",
    pressureSource: "hardware",
    barrelMomentarySwap: "ink-water",
    rejectPalm: true,
    rejectSecondaryPointer: true,
  });
